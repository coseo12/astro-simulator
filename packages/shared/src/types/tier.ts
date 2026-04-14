/**
 * 데이터 신뢰성 티어.
 * UI에서 모든 수치 표시 시 티어 배지를 병기하여 교육적 정직성을 유지한다.
 */
export const DataTier = {
  /** Tier 1 — 관측 정확 (JPL Horizons, Gaia, Hipparcos) */
  Observed: 1,
  /** Tier 2 — 통계/경험 모델 (항성 진화 트랙, IMF) */
  Model: 2,
  /** Tier 3 — 이론 모델 (블랙홀 강착원반) */
  Theory: 3,
  /** Tier 4 — 예술적 근사 (성운 시각화) */
  Artistic: 4,
} as const;

export type DataTier = (typeof DataTier)[keyof typeof DataTier];
