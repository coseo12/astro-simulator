/**
 * P11-C #290 — GPU tier 프로파일 스펙 (6축 × 3 tier 데이터 상수)
 *
 * ADR: `docs/decisions/20260424-tier-preset-design.md` §축 4, §결정 §4
 *
 * 6축 × 3 tier 카테고리 완비 — 항목 누락 시 `tier-profile.test.ts` 의 카테고리 enum 완비
 * 테스트가 즉시 fail. 신규 tier 또는 축 추가 시 ADR Amendment 선박제 + 본 상수 갱신.
 *
 * **Concrete Prediction 2** (ADR §Concrete Prediction): `TIER_PROFILES[tier]` 파라미터 값
 * 조정 시 `packages/core/src/scene/` 및 Babylon 렌더 코드 라인 변화 0. 적용 지점은 오직
 * `applyGpuTierPreset(profile, scene)` 1개.
 *
 * 주석 계약 (drift 방어, CLAUDE.md "주석 계약 vs 구현 drift" 교훈, volt #49):
 *   1. tier domain: 'a' | 'b' | 'c' 만. 추가 시 ADR Amendment 선박제
 *   2. 6축 (lod / particles / shadow / aa / postProc / bloom) 각 tier 에 전부 존재
 *   3. tier-c 자동 최대 억제 — idle fps ≥ 30 보장 (DoD #5)
 *   4. LOD pixelThresholds 는 `lod.ts` 의 `LOD_PIXEL_THRESHOLDS` 와 정합 (tier-a/b default)
 */

import type { LodLevel } from './lod.js';

/** GPU tier — `20260424-tier-naming-policy.md` §1 SSoT. */
export type GpuTier = 'a' | 'b' | 'c';

/** Anti-aliasing 4단계. */
export type TierAaMode = 'msaa8' | 'msaa4' | 'fxaa' | 'off';

/** Shadow 해상도 — 'off' 이면 scene.shadowsEnabled=false. */
export type TierShadowResolution = number | 'off';

/** 6축 tier 프로파일 스펙 (ADR §축 4 표). */
export interface TierProfile {
  tier: GpuTier;
  /** LOD 픽셀 경계 + override 강제. lod.ts 의 LOD_PIXEL_THRESHOLDS 에 주입. */
  lod: {
    high: number;
    mid: number;
    /** 설정 시 전체 body LOD 강제. URL `?lod=` 있으면 URL 우선 (ADR §결정 §5). */
    forceOverride?: LodLevel;
  };
  /** 파티클 시스템 상한 (emitRate / capacity 기준). 0 이면 비활성. */
  particles: { maxCount: number };
  /** Shadow pipeline. 'off' 이면 scene.shadowsEnabled=false. */
  shadow: { resolution: TierShadowResolution; dprClampMax: number };
  /** Antialiasing. */
  aa: TierAaMode;
  /** Post-processing pipeline 3구성. enabled=false 이면 backbuffer 직접 present. */
  postProc: { enabled: boolean; bloom: boolean; grain: boolean };
}

/**
 * 3 tier × 6축 완비 프로파일. 신규 tier/축 추가 시 본 상수 갱신 + ADR Amendment.
 */
export const TIER_PROFILES: Record<GpuTier, TierProfile> = {
  a: {
    tier: 'a',
    lod: { high: 50, mid: 8 },
    particles: { maxCount: 50_000 },
    shadow: { resolution: 2048, dprClampMax: 2 },
    aa: 'msaa8',
    postProc: { enabled: true, bloom: true, grain: true },
  },
  b: {
    tier: 'b',
    lod: { high: 50, mid: 8 },
    particles: { maxCount: 20_000 },
    shadow: { resolution: 1024, dprClampMax: 2 },
    aa: 'msaa4',
    postProc: { enabled: true, bloom: true, grain: false },
  },
  c: {
    tier: 'c',
    lod: { high: 100, mid: 20, forceOverride: 'low' },
    particles: { maxCount: 0 },
    shadow: { resolution: 'off', dprClampMax: 1 },
    aa: 'fxaa',
    postProc: { enabled: false, bloom: false, grain: false },
  },
} as const;
