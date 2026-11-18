/**
 * #1435 — GPU tier 판정에 쓰는 **렌더러 신호** (순수 함수).
 *
 * ADR `docs/decisions/20261118-1435-webgl2-hardware-tier.md` §5 결정 (Q1 A · Q2 (c)).
 *
 * WebGPU 미지원 데스크톱의 tier 는 렌더러가 하드웨어인지에 따라 갈린다 — 하드웨어 → `'b'`,
 * 소프트웨어 또는 **판독 불가** → `'c'`. 이 모듈은 그 판정 입력을 만든다.
 *
 * ## 왜 `detectSoftwareRenderer()` 를 그대로 넘기지 않는가 (ADR cross-validate 합의 1)
 *
 * `detectSoftwareRenderer(null)` 은 `false` (= 하드웨어) 다. 이는 #745 가 별 배경에 대해 고른
 * 보수 방향 (판독 불가면 별을 **켠다**) 이고, tier 판정의 보수 방향 (판독 불가면 tier c) 과
 * **반대**다. 그대로 넘기면 렌더러를 못 읽은 환경이 tier b 가 된다. 그래서 tier 판정에는
 * 「판독 불가」를 `null` 로 보존하는 3상태 함수를 따로 둔다. #745 게이트 (별 배경 · 띠 · 코로나 등)
 * 의 입력은 **바꾸지 않는다** — 그쪽은 계속 UNMASKED 문자열 + `detectSoftwareRenderer` 다.
 *
 * ## Q2 (c) — 확장이 없으면 `gl.RENDERER` 로 한 번 더 읽는다
 *
 * `WEBGL_debug_renderer_info` 가 없는 브라우저 (프라이버시 설정 등) 는 대부분 하드웨어다. 그
 * 사용자를 tier c 로 되돌리지 않으려고 `gl.RENDERER` 를 2순위로 읽는다.
 *
 * 단 `gl.RENDERER` 가 브라우저가 가린 **일반 이름** (`MASKED_RENDERER_NAMES`) 이면 판독 불가로
 * 본다 (ADR §7 Amendment 3 — 사용자 Q2 재질의 결정 2026-11-18). PR #1440 qa 실측에서 Chrome 157 의
 * `gl.RENDERER` 는 metal · SwiftShader 모두 `WebKit WebGL` 상수였다. 이 이름을 하드웨어로 읽으면
 * 「확장 차단 + 소프트웨어 렌더」 가 tier b 로 새어 나가 Q2 (c) 의 취지 (모르면 c) 가 깨진다.
 * 일반 이름이 아닌 실제 렌더러 이름을 주는 브라우저에서만 이 폴백이 정보를 준다.
 */

import { detectSoftwareRenderer } from './detect-software-renderer';

/** `WEBGL_debug_renderer_info` 확장의 최소 형태. */
export interface DebugRendererInfoExtension {
  readonly UNMASKED_RENDERER_WEBGL: number;
}

/**
 * renderer 문자열을 읽는 데 쓰는 WebGL 컨텍스트의 최소 형태 — 단위 테스트에서 목 객체로 대체한다.
 * 실 `WebGLRenderingContext` / `WebGL2RenderingContext` 가 그대로 들어간다.
 */
export interface WebglRendererSource {
  readonly RENDERER: number;
  getExtension(name: 'WEBGL_debug_renderer_info'): DebugRendererInfoExtension | null;
  getParameter(pname: number): unknown;
}

/** 임시 WebGL 컨텍스트 1개에서 읽은 renderer 문자열 두 종. */
export interface WebglRendererReadout {
  /**
   * `UNMASKED_RENDERER_WEBGL` — 확장이 없거나 값이 문자열이 아니면 `null`.
   * #745 소프트웨어 렌더 게이트의 1순위 입력이며, 이 값의 의미는 #1435 이전과 같다.
   */
  unmasked: string | null;
  /**
   * `gl.RENDERER` — Q2 (c) 폴백. `unmasked` 가 비어 있을 때만 읽는다 (값이 있으면 `null`).
   * tier 판정 전용이고 #745 게이트에는 쓰지 않는다.
   */
  basic: string | null;
}

/** 컨텍스트를 만들지 못했을 때의 판독 결과 (양쪽 판독 불가). */
export const EMPTY_WEBGL_RENDERER_READOUT: WebglRendererReadout = Object.freeze({
  unmasked: null,
  basic: null,
});

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * WebGL 컨텍스트에서 renderer 문자열을 읽는다.
 *
 * @param gl 컨텍스트 (생성 실패면 `null`)
 * @returns `unmasked` = 확장 값 (없으면 `null`) · `basic` = `unmasked` 가 비었을 때만 `gl.RENDERER`
 */
export function readWebglRendererStrings(gl: WebglRendererSource | null): WebglRendererReadout {
  if (gl === null) return EMPTY_WEBGL_RENDERER_READOUT;
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const unmasked = debugInfo ? asString(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : null;
  // 확장이 값을 줬으면 2순위는 읽지 않는다 — 판정에 쓰이지 않는 호출을 만들지 않기 위해서다.
  const basic = unmasked ? null : asString(gl.getParameter(gl.RENDERER));
  return { unmasked, basic };
}

/**
 * 브라우저가 실제 렌더러를 가리고 돌려주는 `gl.RENDERER` 일반 이름 (정규화 — 소문자 · 공백 1칸).
 *
 * - `webkit webgl` — [실측] Chrome 157 (macOS, `--use-angle=metal` · `--use-angle=swiftshader` 둘 다
 *   같은 값, PR #1440 qa 2026-11-18). Safari 도 같은 문자열을 준다 [가정 — 측정 안 함].
 *
 * 측정하지 않은 브라우저의 문자열을 더할 때는 [가정] 으로 표기한다. 이 목록은 `gl.RENDERER`
 * 폴백에만 쓴다 — 확장으로 읽은 UNMASKED 값에는 적용하지 않는다 (하드웨어 WebGL2 판정 불변).
 */
export const MASKED_RENDERER_NAMES: readonly string[] = Object.freeze(['webkit webgl']);

function normalizeRendererName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** `gl.RENDERER` 값이 브라우저가 가린 일반 이름인가 (`MASKED_RENDERER_NAMES`). */
export function isMaskedRendererName(name: string): boolean {
  return MASKED_RENDERER_NAMES.includes(normalizeRendererName(name));
}

/**
 * tier 판정에 쓸 renderer 문자열 — UNMASKED 우선, 비었으면 `gl.RENDERER` (Q2 (c)).
 * `gl.RENDERER` 가 일반 이름 (`MASKED_RENDERER_NAMES`) 이면 쓰지 않는다 (Amendment 3).
 *
 * @returns 판독 불가 (`null` / 빈 문자열 / 일반 이름뿐) 면 `null`
 */
export function selectTierRendererString(readout: WebglRendererReadout): string | null {
  if (readout.unmasked) return readout.unmasked;
  if (readout.basic && !isMaskedRendererName(readout.basic)) return readout.basic;
  return null;
}

/**
 * renderer 문자열 → 소프트웨어 여부 **3상태**.
 *
 * @returns `true` = 소프트웨어 · `false` = 하드웨어 · `null` = 판독 불가 (`null` / `undefined` / 빈 문자열).
 *   `detectSoftwareRenderer` 와 달리 판독 불가를 `false` 로 접지 않는다 (모듈 헤더 참조).
 */
export function classifyRendererSoftware(
  rendererString: string | null | undefined,
): boolean | null {
  if (!rendererString) return null;
  return detectSoftwareRenderer(rendererString);
}

/**
 * tier 판정에 넘길 `rendererIsSoftware` — `sim-canvas.tsx` `resolveGpuTier` 가 부르는 **유일한** 합성.
 *
 * UNMASKED → `gl.RENDERER` 폴백 (Q2 (c)) 다음에 3상태 변환을 한다. 호출부는 이 함수 하나만 부른다.
 * 테스트도 같은 함수를 거치므로, 합성이 바뀌면 (예: 폴백을 건너뛰고 `unmasked` 만 쓰기) 테스트가
 * 잡는다 (PR #1440 리뷰 권고 1 — 테스트 안에 합성 사본을 두면 호출부 변이를 못 잡았다).
 *
 * @returns `true` = 소프트웨어 · `false` = 하드웨어 · `null` = 판독 불가
 */
export function resolveTierRendererIsSoftware(readout: WebglRendererReadout): boolean | null {
  return classifyRendererSoftware(selectTierRendererString(readout));
}
