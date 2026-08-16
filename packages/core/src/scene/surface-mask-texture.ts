/**
 * #1119 — 표면 육지 마스크 텍스처 로더 (per-scene 캐시 + placeholder + graceful degradation).
 *
 * ADR `docs/decisions/20260628-756-procedural-planet-surface.md` **Amendment 4** §A4.3 결정 6·7.
 *
 * **`billboard-alpha-mask.ts` 동형** (§A4.2-2) — `scene.metadata` 키에 per-scene 1회 생성 후 공유.
 * high/mid 두 머티리얼이 같은 `Texture` 인스턴스를 참조해 VRAM 2배를 막는다. **신규 함수 ≠ 신규
 * 구현** (CLAUDE.md) — 수명·공유 패턴은 기존 선례를 그대로 따르고, URL 로드/placeholder 교체만
 * 본 모듈의 신규 책임이다.
 *
 * ⚠️ **`invertY` 를 반드시 `false` 로 명시한다** (Phase 0 Step 4 실측 — 이슈 #1119 게이트 코멘트).
 * `new Texture(url, scene)` 로 인자를 생략하면 Babylon 기본값이 `true` 라 **v 축이 뒤집히고, 뒤집힌
 * 채로 WebGPU/WebGL2 두 백엔드가 사이좋게 일치한다.** 즉 cross-backend 일치만 보는 판정은 이 결함을
 * 통과시킨다. 이 축을 잡는 유일한 가드는 §A4.5 **DoD 1 의 IoU 임계**다 (§결정 3-a 의 14점 대조군은
 * 위도 반전 잔존율 42.9% 로 약하다) — **임계를 낮추지 말 것.**
 *
 * **로드 실패는 제품을 degrade 시키되 침묵하지 않는다** (§A4.3 결정 7): 실패 시 `uMaskEnabled` 가
 * `0` 으로 남아 Amendment 3 시점 절차 경로 100% 로 렌더되고, dev 빌드에서 once-guard `console.warn`
 * 이 1회 발화한다. 이는 **가드가 아니라 렌더 경로의 점진적 향상**이므로 §가드 설계 원칙의
 * "fallback 분기 절대 금지" 와 직교한다 (아무것도 주장하지 않으므로 거짓 PASS 가 생기지 않는다).
 */
import { DynamicTexture, Texture, type Scene } from '@babylonjs/core';

/** per-scene 캐시 키 (`scene.metadata` 단일 SSoT — billboard-alpha-mask 패턴 답습). */
const SURFACE_MASK_METADATA_KEY = '__surfaceMaskTextures';

/** placeholder 캐시 키 (URL 무관 단일 인스턴스 — 미등록 body 도 이 텍스처를 바인드한다). */
const SURFACE_MASK_PLACEHOLDER_KEY = '__surfaceMaskPlaceholder';

/**
 * 미도착·미등록 구간에 바인드할 1×1 placeholder 의 색 (계조 `0` = "육지 아님").
 *
 * `uMaskEnabled = 0` 이라 셰이더가 이 값을 쓰지 않지만, **바인딩 자체는 항상 존재해야 한다** —
 * §결정 7 이 텍스처를 분기 밖에서 **무조건 1회** 샘플하도록 계약했고, `ShaderMaterial` 은 선언된
 * sampler 에 텍스처가 없으면 `isReady()` 가 `false` 라 **mesh 자체가 렌더되지 않는다**.
 * 즉 placeholder 는 편의가 아니라 mars/jupiter/moon 의 렌더 조건이다.
 */
const PLACEHOLDER_FILL_STYLE = '#000000';

/** 마스크 텍스처 핸들 — 로드 완료 통지 + 인스턴스 접근. */
export interface SurfaceMaskHandle {
  /** 로드 완료 시 `Texture`, 미도착·실패 시 `null`. */
  getTexture(): Texture | null;
  /** 로드 실패가 확정됐는지 (once-guard warn 이 이미 발화). */
  hasFailed(): boolean;
  /** 로드 완료 콜백 등록. 이미 완료됐으면 **동기 즉시** 호출한다. */
  onReady(callback: (texture: Texture) => void): void;
}

interface SurfaceMaskCacheEntry extends SurfaceMaskHandle {
  texture: Texture;
  ready: boolean;
  failed: boolean;
  waiters: ((texture: Texture) => void)[];
}

function sceneMetadata(scene: Scene): Record<string, unknown> {
  return (scene.metadata ?? (scene.metadata = {})) as Record<string, unknown>;
}

/**
 * 1×1 placeholder 텍스처 (per-scene 1회).
 *
 * ⚠️ **`RawTexture` 가 아니라 `DynamicTexture` 를 쓰는 것은 의도적이다** — `RawTexture` 는 저장소
 * 어디서도 쓰이지 않아 모듈 그래프에 **새 서브트리**(`Engines/Extensions/engine.rawTexture` 등)를
 * 끌어들이고, 그것이 JS 청크 증가의 대부분을 차지했다 (실측값은 PR 본문 §번들 분해 참조).
 * `DynamicTexture` 는 `billboard-alpha-mask.ts` 가 **이미** 쓰고 있어 그래프 증분이 없다.
 * 1×1 단색 결과는 두 API 가 동일하다 (§A4.5 DoD 9 ③ 번들 축).
 *
 * 크기가 1×1 이라 `invertY` 는 결과에 영향이 없지만 (`update(false)` 로 명시), 로드된 마스크는
 * `invertY=false` 를 **반드시** 명시해야 한다 (Phase 0 Step 4 함정 — 모듈 헤더 참조).
 */
export function getOrCreateSurfaceMaskPlaceholder(scene: Scene): DynamicTexture {
  const meta = sceneMetadata(scene);
  const cached = meta[SURFACE_MASK_PLACEHOLDER_KEY];
  if (cached instanceof DynamicTexture) return cached;

  const texture = new DynamicTexture(
    'surface-mask-placeholder',
    { width: 1, height: 1 },
    scene,
    /* generateMipMaps */ false,
    Texture.NEAREST_SAMPLINGMODE,
  );
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = PLACEHOLDER_FILL_STYLE;
  ctx.fillRect(0, 0, 1, 1);
  texture.update(false /* invertY — 1×1 단색이라 무관 */);
  meta[SURFACE_MASK_PLACEHOLDER_KEY] = texture;
  return texture;
}

/**
 * 육지 마스크 텍스처 (per-scene · URL 단위 캐시).
 *
 * 샘플링 계약 (§A4.3 결정 4):
 *  - `noMipmap: true` — `atan` 자오선 불연속에서 mip level 이 폭주해 생기는 **seam 선을 구조적으로
 *    회피**한다. 축소 앨리어싱은 (i) 생성 시점 면적 사전필터(AA) (ii) 해상도 정합 (iii) 원거리
 *    `uMaskEnabled = 0` 전환 3중으로 흡수한다.
 *  - `wrapU = WRAP` / `wrapV = CLAMP` — u 는 ±180° 에서 순환해야 하고 v 는 극에서 잘려야 한다.
 *    **두 축의 주소 모드가 다르다는 점이 요지**다 (§결정 5 의 `v` clamp 와 같은 이유).
 *  - `BILINEAR_SAMPLINGMODE` — §결정 3-a 의 14점 계약이 이 샘플링 기준이다 (`NEAREST` 로 재면
 *    Sydney 가 `60/255` 로 FAIL 한다).
 *
 * @param scene Babylon 씬
 * @param url 마스크 URL (base URL + 파일명 — core 는 web 라우팅을 모른다, §결정 6)
 */
export function getOrCreateSurfaceMaskTexture(scene: Scene, url: string): SurfaceMaskHandle {
  const meta = sceneMetadata(scene);
  const cache = (meta[SURFACE_MASK_METADATA_KEY] ??= new Map<
    string,
    SurfaceMaskCacheEntry
  >()) as Map<string, SurfaceMaskCacheEntry>;
  const cached = cache.get(url);
  if (cached) return cached;

  const entry: SurfaceMaskCacheEntry = {
    texture: undefined as unknown as Texture,
    ready: false,
    failed: false,
    waiters: [],
    getTexture: () => (entry.ready ? entry.texture : null),
    hasFailed: () => entry.failed,
    onReady: (callback) => {
      if (entry.ready) {
        callback(entry.texture);
        return;
      }
      entry.waiters.push(callback);
    },
  };

  entry.texture = new Texture(
    url,
    scene,
    /* noMipmap */ true,
    // ⚠️ 생략 금지 — 기본값 `true` 는 v 축을 뒤집고 두 백엔드가 뒤집힌 채 일치한다 (모듈 헤더 참조).
    /* invertY */ false,
    Texture.BILINEAR_SAMPLINGMODE,
    () => {
      entry.ready = true;
      const waiters = entry.waiters;
      entry.waiters = [];
      for (const callback of waiters) callback(entry.texture);
    },
    (message) => {
      entry.failed = true;
      entry.waiters = [];
      // 제품은 degrade (절차 경로 100%) 하되 침묵하지 않는다 (§결정 7). once-guard —
      // 캐시 엔트리당 1회만 발화하므로 프레임당 spam 이 구조적으로 불가능하다.
      // production 은 `NODE_ENV` DCE 로 분기 전체가 사라진다.
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          `[surface-mask-texture] 마스크 로드 실패 — "${url}" (${message ?? 'unknown'}). 절차적 대륙 경로로 degrade 한다 (ADR 20260628-756 §A4.3 결정 7).`,
        );
      }
    },
  );
  entry.texture.wrapU = Texture.WRAP_ADDRESSMODE;
  entry.texture.wrapV = Texture.CLAMP_ADDRESSMODE;

  cache.set(url, entry);
  return entry;
}

/**
 * scene dispose 시 마스크 텍스처 + placeholder 정리 (`disposeBillboardAlphaMask` 동형).
 *
 * Babylon 이 scene dispose 에서 텍스처를 함께 정리하지만, 명시 dispose + metadata 키 제거로
 * dispose 후 stale 참조를 차단한다 (#391 cross-validate 이견 수용 2 와 동일 근거).
 */
export function disposeSurfaceMaskTextures(scene: Scene): void {
  const meta = scene.metadata as Record<string, unknown> | null;
  if (!meta) return;
  const cache = meta[SURFACE_MASK_METADATA_KEY];
  if (cache instanceof Map) {
    for (const entry of cache.values() as Iterable<SurfaceMaskCacheEntry>) {
      entry.texture?.dispose();
    }
    cache.clear();
    delete meta[SURFACE_MASK_METADATA_KEY];
  }
  const placeholder = meta[SURFACE_MASK_PLACEHOLDER_KEY];
  if (placeholder instanceof DynamicTexture) {
    placeholder.dispose();
    delete meta[SURFACE_MASK_PLACEHOLDER_KEY];
  }
}
