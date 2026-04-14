import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TierBadge } from './tier-badge';

describe('TierBadge', () => {
  it('Tier 1 배지 — 라벨 T1 + teal 색', () => {
    render(<TierBadge tier={1} />);
    const badge = screen.getByTestId('tier-badge-1');
    expect(badge).toHaveTextContent('T1');
    expect(badge).toHaveAttribute('title', expect.stringContaining('관측'));
  });

  it('Tier 2~4 각각 라벨', () => {
    const { rerender } = render(<TierBadge tier={2} />);
    expect(screen.getByTestId('tier-badge-2')).toHaveTextContent('T2');
    rerender(<TierBadge tier={3} />);
    expect(screen.getByTestId('tier-badge-3')).toHaveTextContent('T3');
    rerender(<TierBadge tier={4} />);
    expect(screen.getByTestId('tier-badge-4')).toHaveTextContent('T4');
  });

  it('각 tier의 tooltip 설명 존재', () => {
    const tiers: Array<{ t: 1 | 2 | 3 | 4; keyword: string }> = [
      { t: 1, keyword: '관측' },
      { t: 2, keyword: '통계' },
      { t: 3, keyword: '이론' },
      { t: 4, keyword: '예술' },
    ];
    for (const { t, keyword } of tiers) {
      const { unmount } = render(<TierBadge tier={t} />);
      expect(screen.getByTestId(`tier-badge-${t}`)).toHaveAttribute(
        'title',
        expect.stringContaining(keyword),
      );
      unmount();
    }
  });
});
