'use client';

import type { DataTier } from '@astro-simulator/shared';

export interface TierMeta {
  label: string;
  color: string;
  desc: string;
  /** #1281 — 관찰 모드 카드 출처 한 줄 (`<source> · T<n>`). */
  source: string;
}

export const TIER_META: Record<DataTier, TierMeta> = {
  1: {
    label: 'T1',
    color: 'var(--tier-1-observed)',
    desc: '관측 정확 (JPL/Gaia/Hipparcos)',
    source: 'JPL 관측',
  },
  2: {
    label: 'T2',
    color: 'var(--tier-2-model)',
    desc: '통계 모델 (항성 진화 트랙 등)',
    source: '통계 모델',
  },
  3: {
    label: 'T3',
    color: 'var(--tier-3-theory)',
    desc: '이론 모델 (블랙홀 강착원반 등)',
    source: '이론 모델',
  },
  4: {
    label: 'T4',
    color: 'var(--tier-4-artistic)',
    desc: '예술적 근사 (성운 렌더링)',
    source: '예술적 근사',
  },
};

/**
 * #1281 — 데이터 파일의 `tier` (loader 타입 `number`) 가 정의된 Tier 인가.
 * 아니면 호출부가 색 없는 `T{n}` 로 fail-visible 표기한다 (조용히 T1 로 흡수하지 않는다).
 */
export function isDataTier(n: number): n is DataTier {
  return Object.prototype.hasOwnProperty.call(TIER_META, n);
}

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
