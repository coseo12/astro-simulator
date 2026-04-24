/**
 * Render 모듈 — LOD / GPU tier 등 렌더 레이어 순수 함수.
 *
 * ADR: `docs/decisions/20260424-tier-naming-policy.md` §1 SSoT (심볼 경로 선박제)
 *      `docs/decisions/20260424-p11-b-lod-design.md` §결정 §1 (모듈 구조)
 */

export {
  lodFromScreenCoverage,
  screenCoverageRadius,
  classifyBodyLodKind,
  LOD_BODY_THRESHOLDS,
  LOD_PIXEL_THRESHOLDS,
} from './lod.js';
export type { LodLevel, LodOverride, LodDecisionInput } from './lod.js';
export type { BodyLodKind, BodyLodThreshold, BodyLodThresholdMode } from './lod-body-thresholds.js';
