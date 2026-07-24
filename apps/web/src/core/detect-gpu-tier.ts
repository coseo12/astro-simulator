/**
 * P11-C #290 — GPU tier 감지 + vendor 분류 (순수 함수)
 *
 * ADR: `docs/decisions/20260424-tier-preset-design.md` §축 1, §결정 §1 §2
 *
 * GPU tier 감지 계약 (ADR 20260424-tier-preset-design §결정):
 *   1. tier 값 domain: 'a' | 'b' | 'c' 만 허용. 추가 시 ADR Amendment 선박제
 *   2. 감지 순서: hard reject (모바일+!WebGPU → c) → WebGPU 미지원 (→ c) → adapter 분류
 *      (discrete+8코어 → a, 그 외 → b)
 *   3. 미지 vendor 는 integrated 취급 (보수적) + console.warn (drift 탐지)
 *   4. SSR 디폴트 'b' — hydration 후 실측 덮어씀. suppressHydrationWarning 사용 금지
 *   5. URL ?gpu= 는 자동 감지를 덮어씀. invalid 값은 'auto' fallback + console.warn (DoD #3)
 *   6. tier-c 자동 억제: LOD low 강제 + 파티클 0 + shadow OFF + post-proc OFF + bloom OFF
 *      (축 5 후보 A — DoD #5)
 *   7. 알림 키는 반드시 'tier-c-graceful-degradation' 사용. 구 키 'mobile-webgpu-best-effort' 금지
 * 위 계약 위배 변경은 즉시 버그로 간주 (CLAUDE.md "주석 계약 vs 구현 drift" 교훈, volt #49).
 */

import type { GpuTier } from '@astro-simulator/core';
import { detectIsMobile, type NavigatorLike } from './is-mobile';

/**
 * GPU tier 3단계 — #845 이중 선언 해소. 선언 SSoT 는 core `render/tier-profile.ts`
 * (ADR `20260424-tier-naming-policy.md` §1). 본 모듈은 루트 경유 re-export 만 담당 —
 * 기존 소비처 (`parse-gpu-tier.ts` / `sim-canvas.tsx`) 의 import 경로는 불변.
 */
export type { GpuTier } from '@astro-simulator/core';

/** `detectGpuTier` 의 입력 — 순수 함수 테스트 편의를 위해 모든 signal 을 주입받는다. */
export interface GpuDetectionInput {
  /**
   * `detectGpuCapability()` 결과 — WebGPU 지원 여부 + adapter info.
   * `supported=false` 이면 adapterInfo 는 null.
   */
  webgpu: {
    supported: boolean;
    adapterInfo: { vendor: string; architecture: string; description: string } | null;
  };
  /** `navigator.hardwareConcurrency` — 논리 코어 수. 감지 실패 시 0. */
  hardwareConcurrency: number;
  /** `navigator.userAgent` / `maxTouchPoints` — mobile 감지용 (is-mobile.ts 재사용). */
  navigator: NavigatorLike;
}

/**
 * Vendor 분류 규칙 — 데이터 주도 (ADR §축 1 이견 수용 1 반영).
 *
 * 신규 vendor 추가 = 객체 한 줄 추가만 (Concrete Prediction 1 재현).
 */
export interface VendorRule {
  /** vendor 문자열 매칭 (소문자 정규화 후 적용). */
  vendorPattern: RegExp;
  /** 매칭 시 discrete 판정. */
  alwaysDiscrete?: boolean;
  /** 매칭 시 integrated 판정 (pro/max 등 키워드 없을 때). */
  alwaysIntegrated?: boolean;
  /** vendor 매칭 후 추가 키워드 매칭 시 discrete. */
  discreteKeywords?: RegExp;
}

/**
 * Vendor 분류 표 (12 카테고리 완비). 신규 vendor 는 여기에 한 줄 추가.
 *
 * 순서 중요: `nvidia` 처럼 alwaysDiscrete 가 먼저 검사되어야 `apple-m-pro` 처럼 세부 조건이
 * 뒤에 올 수 있다. `apple` 은 `apple-m-pro` (키워드 매칭) 를 먼저 시도 후 `apple-m-basic` 로
 * 폴백한다.
 */
export const VENDOR_RULES: Record<string, VendorRule> = {
  nvidia: { vendorPattern: /nvidia/i, alwaysDiscrete: true },
  'amd-discrete': { vendorPattern: /amd|radeon|ati/i, discreteKeywords: /rdna|radeon\s*rx/i },
  'apple-m-pro': {
    vendorPattern: /apple/i,
    discreteKeywords: /m[1-9]\s*(pro|max|ultra)/i,
  },
  'apple-m-basic': { vendorPattern: /apple/i, alwaysIntegrated: true },
  // Intel Arc (discrete) 는 `arc` 키워드로만 매칭. Iris Xe 의 `xe` 는 integrated low-power 이므로
  // 혼동 방지를 위해 discreteKeywords 에서 제외 (ADR §결정 §2 표의 "Intel + Arc" 행 준수).
  'intel-arc': { vendorPattern: /intel/i, discreteKeywords: /\barc\b/i },
  'intel-integrated': { vendorPattern: /intel/i, alwaysIntegrated: true },
  qualcomm: { vendorPattern: /qualcomm|adreno/i, alwaysIntegrated: true },
  'arm-mali': { vendorPattern: /arm|mali/i, alwaysIntegrated: true },
};

/** SSR 중립 디폴트 — hydration 후 `detectGpuTier` 결과로 덮어씀 (ADR §축 2). */
export const GPU_TIER_SSR_DEFAULT: GpuTier = 'b';

/** tier-a 분기 CPU 코어 임계 (ADR §축 1 분기 3a). */
const TIER_A_CPU_CORE_THRESHOLD = 8;

/**
 * Adapter info → discrete GPU 여부 분류.
 *
 * 매칭 순서: VENDOR_RULES 객체 순회 (declaration order). vendor 패턴 일치 시 바로 판정.
 *  - `alwaysDiscrete` → true
 *  - `alwaysIntegrated` → false (단, 같은 vendor 의 다른 rule 이 이전에 매칭되면 그게 우선)
 *  - `discreteKeywords` 매칭 → true, 미매칭 → false
 *
 * 미지 vendor 또는 빈 adapter info 는 `console.warn` + `false` (integrated 취급, 보수적).
 *
 * @param adapter - adapterInfo 객체 또는 null (빈 privacy 케이스)
 * @returns discrete GPU 이면 true
 */
export function classifyAdapterIsDiscrete(
  adapter: { vendor: string; architecture: string; description: string } | null,
): boolean {
  if (adapter === null || adapter.vendor === '') {
    // Privacy fingerprinting 완화로 빈 adapter info — 보수적 integrated 취급 (ADR §위험 1)

    console.warn('[detect-gpu-tier] adapter info unavailable (privacy) — integrated 폴백');
    return false;
  }
  const vendor = adapter.vendor.toLowerCase();
  const architecture = adapter.architecture.toLowerCase();
  const description = adapter.description.toLowerCase();
  const combined = `${vendor} ${architecture} ${description}`;

  for (const [, rule] of Object.entries(VENDOR_RULES)) {
    if (!rule.vendorPattern.test(combined)) continue;
    if (rule.alwaysDiscrete === true) return true;
    if (rule.discreteKeywords && rule.discreteKeywords.test(combined)) return true;
    if (rule.alwaysIntegrated === true) return false;
    // rule 이 discreteKeywords 만 선언했고 미매칭 — 다음 rule 검사 계속
  }

  // 미지 vendor — 보수적 integrated 취급 + drift 탐지 경고 (ADR §축 1 암묵 전제)

  console.warn(
    `[detect-gpu-tier] 미지 vendor='${adapter.vendor}' architecture='${adapter.architecture}' — integrated 폴백`,
  );
  return false;
}

/**
 * GPU tier 감지 — 결정론적 분기 (ADR §축 1 후보 A).
 *
 * 분기 순서:
 *  1. Hard reject: isMobile && !WebGPU → tier-c (iOS Safari <17.4 다수)
 *  2. WebGPU 미지원 (데스크톱 포함) → tier-c (WebGL2 fallback)
 *  3. WebGPU 지원 + discrete + 8코어+ → tier-a
 *  4. 그 외 (WebGPU 지원) → tier-b
 *
 * `devicePixelRatio` 는 tier 분류 **제외** — ADR §축 1 암묵 전제. shadow 해상도 보정 전용.
 */
export function detectGpuTier(input: GpuDetectionInput): GpuTier {
  const isMobile = detectIsMobile(input.navigator);

  // 분기 1: hard reject — 모바일 + WebGPU 미지원
  if (isMobile && !input.webgpu.supported) {
    return 'c';
  }

  // 분기 2: WebGPU 미지원 데스크톱
  if (!input.webgpu.supported) {
    return 'c';
  }

  // 분기 3: WebGPU 지원 — adapter 기반 discrete vs integrated 판정
  const isDiscrete = classifyAdapterIsDiscrete(input.webgpu.adapterInfo);
  const highCpu = input.hardwareConcurrency >= TIER_A_CPU_CORE_THRESHOLD;

  // 분기 3a: 데스크톱 + discrete + 고코어 → tier-a
  if (!isMobile && isDiscrete && highCpu) {
    return 'a';
  }

  // 분기 3b: 그 외 (모바일 WebGPU 지원 / integrated 데스크톱 / 저코어) → tier-b
  return 'b';
}
