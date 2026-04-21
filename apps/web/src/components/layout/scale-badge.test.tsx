import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSimStore } from '@/store/sim-store';
import { ScaleBadge } from './scale-badge';

beforeEach(() => {
  useSimStore.setState({
    viewMode: 'educational',
    selectedBodyId: null,
  });
});

describe('ScaleBadge (P10-C-2 #278)', () => {
  it('focus 없음 + educational — "시각 과장 모드" 표시', () => {
    render(<ScaleBadge />);
    expect(screen.getByTestId('scale-badge')).toHaveTextContent('시각 과장 모드');
  });

  it('focus 없음 + scientific — "사실 비율 모드" 표시', () => {
    useSimStore.setState({ viewMode: 'scientific' });
    render(<ScaleBadge />);
    expect(screen.getByTestId('scale-badge')).toHaveTextContent('사실 비율 모드');
  });

  it('지구 focus + educational — "지구 — 시각 크기 최대 ×500 과장 중"', () => {
    useSimStore.setState({ selectedBodyId: 'earth' });
    render(<ScaleBadge />);
    const badge = screen.getByTestId('scale-badge');
    expect(badge).toHaveTextContent('지구');
    expect(badge).toHaveTextContent('최대 ×500');
  });

  it('태양 focus + educational — kind=star 상한 ×20', () => {
    useSimStore.setState({ selectedBodyId: 'sun' });
    render(<ScaleBadge />);
    expect(screen.getByTestId('scale-badge')).toHaveTextContent('태양');
    expect(screen.getByTestId('scale-badge')).toHaveTextContent('최대 ×20');
  });

  it('혜성 focus + educational — kind=comet 상한 ×20,000', () => {
    useSimStore.setState({ selectedBodyId: 'halley' });
    render(<ScaleBadge />);
    expect(screen.getByTestId('scale-badge')).toHaveTextContent('핼리 혜성');
    expect(screen.getByTestId('scale-badge')).toHaveTextContent('최대 ×20,000');
  });

  it('지구 focus + scientific — "지구 — 실제 비율 1.0"', () => {
    useSimStore.setState({ selectedBodyId: 'earth', viewMode: 'scientific' });
    render(<ScaleBadge />);
    expect(screen.getByTestId('scale-badge')).toHaveTextContent('실제 비율 1.0');
  });

  it('data-view-mode 어트리뷰트가 store viewMode 반영', () => {
    render(<ScaleBadge />);
    expect(screen.getByTestId('scale-badge')).toHaveAttribute('data-view-mode', 'educational');
    useSimStore.setState({ viewMode: 'scientific' });
    // 재렌더 필요
    render(<ScaleBadge />);
    const badges = screen.getAllByTestId('scale-badge');
    expect(badges[badges.length - 1]).toHaveAttribute('data-view-mode', 'scientific');
  });
});
