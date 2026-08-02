/**
 * #391 Phase 2 — billboard quad alpha mask 인프라 (scene 공유 DynamicTexture + 4px fallback 임계).
 *
 * #850 Phase 1 — `solar-system-scene.ts` 테일에서 **순수 이동** (동작·값 변경 0).
 * 이동 전 위치: `solar-system-scene.ts` 2230-2357. 클로저 참조 0 (인자 `scene` 만 사용).
 *
 * ADR `docs/decisions/20260502-391-phase2-billboard.md`.
 */
import { DynamicTexture, Texture, type Scene } from '@babylonjs/core';

/**
 * #391 Phase 2 — billboard quad 의 alpha mask fallback 임계 (pxDiameter, 픽셀).
 *
 * ADR `docs/decisions/20260502-391-phase2-billboard.md` §결정 + cross-validate 이견 수용 #1.
 *
 * **계약 (drift 방어)**:
 *  - pxDiameter ≥ 4px → alpha mask 적용 (원형 disc 인지)
 *  - pxDiameter < 4px → alpha mask 바이패스, 사각형 quad 그대로 유지
 *  - 근거: smoothstep(0.4, 0.5) 의 0.53px 전이 구간이 1 hardware pixel 미만 → GPU sampler aliasing
 *    + sub-pixel flickering 발생. 사용자 D-T2 가 3px 이하 객체에서 원/사각형 구분 불가 →
 *    사각형 quad 가 시각 안정성 우위.
 *
 * 본 임계값을 변경하려면 ADR Amendment 박제 의무 (volt #49 — 주석 계약 vs 구현 drift).
 */
export const LOD_BILLBOARD_ALPHA_MASK_MIN_PX_DIAMETER = 4;

/**
 * #391 Phase 2 — billboard alpha mask 적용 여부 결정 헬퍼.
 *
 * ADR `docs/decisions/20260502-391-phase2-billboard.md` §결정 §"4px fallback 분기".
 * runLodPass 가 매 프레임 호출 + lod.test.ts 단위 테스트에서 경계 검증 (3.9 / 4.1px).
 *
 * @param pxDiameter — 현재 측정된 billboard 직경 (pixel). `screenCoverage * 2` SSoT.
 * @returns true = alpha mask 적용 / false = 사각형 quad 유지 (fallback)
 */
export function shouldApplyBillboardAlphaMask(pxDiameter: number): boolean {
  // NaN / 음수 / undefined → fallback (alpha mask 미적용 안전 측).
  if (!Number.isFinite(pxDiameter) || pxDiameter <= 0) return false;
  return pxDiameter >= LOD_BILLBOARD_ALPHA_MASK_MIN_PX_DIAMETER;
}

/**
 * #391 Phase 2 — alpha mask 텍스처 캐시 키 (scene.metadata 단일 SSoT).
 *
 * scene 단위 1회 생성 + 모든 billboard material 공유. per-body 생성 금지 (메모리 24배).
 * scene dispose 시 함께 dispose 의무 (cross-validate 이견 수용 #2).
 */
const ALPHA_MASK_METADATA_KEY = '__lodBillboardAlphaMask';

/**
 * #391 Phase 2 — billboard 용 procedural 원형 alpha mask 텍스처 (scene 공유 인스턴스).
 *
 * ADR `docs/decisions/20260502-391-phase2-billboard.md` §"developer 단계 작업 명세" §1
 * (옵션 A 채택 — DynamicTexture 64×64 + scene 공유).
 *
 * 동작:
 *  - 첫 호출 시 64×64 DynamicTexture 생성 (≈ 16KB VRAM, Babylon Uber-shader 캐시 호환)
 *  - radial gradient: alpha = 1 - smoothstep(0.4 * size, 0.5 * size, length(uv - 0.5))
 *    → 64.6% 면적이 opaque 원형 disc, 가장자리 ~3.2px 안티앨리어싱 전이
 *  - 두 번째+ 호출은 캐시된 동일 인스턴스 반환 (메모리 1× 보장)
 *  - 캐시는 `scene.metadata.__lodBillboardAlphaMask` 에 저장 — scene dispose 시 함께 정리
 *
 * 텍스처 자체는 모든 billboard material 의 `opacityTexture` 로 공유 참조. material 인스턴스는
 * body 별 emissiveColor / diffuseColor 를 분리 유지하되 mask 만 공유.
 */
export function getOrCreateBillboardAlphaMask(scene: Scene): DynamicTexture {
  const meta = (scene.metadata ?? (scene.metadata = {})) as Record<string, unknown>;
  const cached = meta[ALPHA_MASK_METADATA_KEY];
  if (cached instanceof DynamicTexture) return cached;

  const SIZE = 64;
  const texture = new DynamicTexture(
    'lod-billboard-alpha-mask',
    { width: SIZE, height: SIZE },
    scene,
    /* generateMipMaps */ false,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  texture.hasAlpha = true;
  // Babylon DynamicTexture 가 wrap clamp 미설정 시 sub-pixel 가장자리에서 1px 라인 누설 가능.
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;

  const ctx = texture.getContext() as CanvasRenderingContext2D;
  // 투명 초기화 (clearRect 사용 — fillStyle 'transparent' 보다 명시적).
  ctx.clearRect(0, 0, SIZE, SIZE);

  // smoothstep(0.4, 0.5) 의 직접 캔버스 구현 — radial gradient 로 근사.
  // 0.0 ~ 0.4 = alpha 1.0 (완전 opaque)
  // 0.4 ~ 0.5 = smoothstep 전이 구간
  // 0.5 ~ 1.0 = alpha 0 (완전 transparent)
  // 캔버스 픽셀 직접 조작이 가장 정확 (gradient API 의 cubic interp 와 smoothstep 미일치).
  const imageData = ctx.createImageData(SIZE, SIZE);
  const data = imageData.data;
  const cx = (SIZE - 1) / 2;
  const cy = (SIZE - 1) / 2;
  const halfSize = SIZE / 2;
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const dx = (x - cx) / halfSize; // -1 ~ 1
      const dy = (y - cy) / halfSize;
      const dist = Math.sqrt(dx * dx + dy * dy); // 0 ~ √2 (코너 = 1.414)
      // smoothstep(edge0, edge1, x) = clamp((x - edge0) / (edge1 - edge0), 0, 1) ^ 2 * (3 - 2 * t)
      // ADR SSoT — 0.4/0.5 경계 (반지름 기준).
      // dist 는 캔버스 가장자리에서 1.0 (반지름 = halfSize) 이므로 0.4/0.5 = 캔버스 반경의 80%/100%.
      // 단, ADR 박제 0.4/0.5 는 quad UV 0~1 좌표계 (0.5 = 중심, 0~0.5 = 반지름) 기준이라 dist 직접 사용.
      const t = Math.max(0, Math.min(1, (dist - 0.8) / (1.0 - 0.8))); // 0.4*2/0.5*2 = 0.8/1.0
      const smoothstep = t * t * (3 - 2 * t);
      const alpha = 1 - smoothstep;
      const idx = (y * SIZE + x) * 4;
      data[idx + 0] = 255; // R — opacity 텍스처라 RGB 무시되나 white 박제
      data[idx + 1] = 255; // G
      data[idx + 2] = 255; // B
      data[idx + 3] = Math.round(alpha * 255); // A
    }
  }
  ctx.putImageData(imageData, 0, 0);
  texture.update(false /* invertY 무관 */);

  meta[ALPHA_MASK_METADATA_KEY] = texture;
  return texture;
}

/**
 * #391 Phase 2 — scene dispose 시 alpha mask 텍스처 정리 (cross-validate 이견 수용 #2).
 *
 * scene 단위 1회 생성된 DynamicTexture 가 누수되지 않도록 명시 dispose. scene 의 dispose 콜백에서
 * 호출. metadata 키도 함께 정리하여 dispose 후 stale 참조 회피.
 */
export function disposeBillboardAlphaMask(scene: Scene): void {
  const meta = scene.metadata as Record<string, unknown> | null;
  if (!meta) return;
  const cached = meta[ALPHA_MASK_METADATA_KEY];
  if (cached instanceof DynamicTexture) {
    cached.dispose();
    delete meta[ALPHA_MASK_METADATA_KEY];
  }
}
