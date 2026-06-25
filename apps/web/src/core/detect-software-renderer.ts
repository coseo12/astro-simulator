/**
 * #745 — GPU renderer 문자열이 **소프트웨어 렌더러** (swiftshader/llvmpipe/swrast/...) 인지 판정.
 *
 * 배경 (ADR `docs/decisions/20260624-738-procedural-starfield.md` §Amendment 2):
 *  Amendment 1 (PR #742) 은 별 배경 비활성 기준을 `detect-gpu-tier.ts` 의 tier-c 로 잡았으나,
 *  tier-c 정의가 "WebGPU 미지원 데스크톱 전부" (소프트웨어 swiftshader + WebGL2 **하드웨어**
 *  가속 무구분) 라 WebGPU 미지원 + 하드웨어 가속 PC 에서도 별이 사라지는 **과잉 비활성 회귀**
 *  (v0.35.0 production). 비활성 진짜 기준은 **소프트웨어 렌더 (fill-rate 한계)** 이므로 tier 와
 *  분리된 독립 helper (SRP) 로 software 만 감지한다. `detect-gpu-tier.ts` 는 무수정 — tier 는
 *  LOD 억제 등 기존 graceful degradation 에 계속 쓰인다.
 *
 * 설계 결정 (실측 근거 — Playwright chromium.launch 플래그 차이):
 *  - CI swiftshader 는 WebGL2 경로 (WebGPU 미지원) 이고 `UNMASKED_RENDERER_WEBGL` 에 `SwiftShader`
 *    문자열이 확실히 포함 → software 감지가 CI 에서 결정적으로 true → fps-baseline-guard 무회귀
 *    유지 (가장 큰 위험 = 회귀 재발 차단의 핵심 제약).
 *  - **보수적 정규식 (false positive 차단)**: 확실한 software 엔진 이름만 매칭. `"software"` 단독
 *    단어는 제외 (가상화 게스트 드라이버 false positive 위험 — agy Q2 수용). 불확실/빈 문자열은
 *    `false` (별 표시 = 보수적 — 하드웨어에서 별이 사라지는 것을 차단).
 */

/**
 * 소프트웨어 렌더러 식별 패턴.
 *
 * 매칭 대상 (확실한 software 래스터라이저 엔진 이름만):
 *  - `swiftshader` — Chrome/ANGLE 소프트웨어 백엔드 (CI 기본, 헤드리스). 핵심 제약 대상.
 *  - `llvmpipe` — Mesa 소프트웨어 래스터라이저 (Linux).
 *  - `microsoft basic render` — Windows 기본 소프트웨어 어댑터 (WARP 미적용 시).
 *  - `software rasterizer` — 명시적 software 래스터라이저 (`"software"` 단독은 제외하되 이 구절은 안전).
 *  - `apple software renderer` — macOS 소프트웨어 렌더 경로.
 *  - `swrast` — Mesa/X11 소프트웨어 래스터라이저 (Linux).
 *
 * `"software"` 단독은 가상화 게스트 드라이버 등 하드웨어 가속 환경에서도 부분 문자열로 등장할 수
 * 있어 false positive 위험이 있으므로 의도적으로 제외한다.
 */
const SOFTWARE_RENDERER_PATTERN =
  /swiftshader|llvmpipe|microsoft basic render|software rasterizer|apple software renderer|swrast/i;

/**
 * renderer 문자열이 소프트웨어 렌더러인지 판정.
 *
 * @param rendererString WebGL `UNMASKED_RENDERER_WEBGL` (1차/주) 또는 WebGPU
 *   `adapterInfo.description` (보조) 등에서 추출한 GPU renderer 문자열. null/undefined/빈 문자열은
 *   감지 실패로 간주.
 * @returns 소프트웨어 렌더러 패턴 매칭 시 `true`, 그 외 (하드웨어 / 불확실 / 빈 문자열) `false`.
 */
export function detectSoftwareRenderer(rendererString: string | null | undefined): boolean {
  if (!rendererString) {
    // 빈 문자열 / null / undefined → 감지 실패 = 보수적으로 false (별 표시 유지).
    return false;
  }
  return SOFTWARE_RENDERER_PATTERN.test(rendererString);
}
