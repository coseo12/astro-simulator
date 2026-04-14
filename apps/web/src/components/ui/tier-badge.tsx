'use client';

import type { DataTier } from '@astro-simulator/shared';

const TIER_META: Record<DataTier, { label: string; color: string; desc: string }> = {
  1: { label: 'T1', color: 'var(--tier-1-observed)', desc: '관측 정확 (JPL/Gaia/Hipparcos)' },
  2: { label: 'T2', color: 'var(--tier-2-model)', desc: '통계 모델 (항성 진화 트랙 등)' },
  3: { label: 'T3', color: 'var(--tier-3-theory)', desc: '이론 모델 (블랙홀 강착원반 등)' },
  4: { label: 'T4', color: 'var(--tier-4-artistic)', desc: '예술적 근사 (성운 렌더링)' },
};

/**
 * 데이터 신뢰성 Tier 배지. 모든 수치 표시 옆에 병기.
 * docs/phases/design-tokens.md §1.5.
 */
export function TierBadge({ tier }: { tier: DataTier }) {
  const m = TIER_META[tier];
  return (
    <span
      title={m.desc}
      className="inline-flex items-center gap-1 num text-caption px-1.5 py-0.5 rounded-xs border"
      style={{
        color: m.color,
        borderColor: m.color,
        background: 'transparent',
      }}
      data-testid={`tier-badge-${tier}`}
    >
      {m.label}
    </span>
  );
}
