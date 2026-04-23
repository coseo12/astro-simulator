import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSimStore } from '@/store/sim-store';
import { ScaleBadge } from './scale-badge';

/**
 * P12-A #298 B2 — 배지 내용 재정의 테스트.
 *
 * 과거 (P10-C-2 #278) 에는 educational 모드에서 "×500 과장 중" 문구를 검증했으나,
 * P12-A 부터 body 시각 과장이 제거되어 "실측 비율" 문구만 표시한다 (B2 blocking 해소).
 * Phase C (#298 R2) 에서 컴포넌트 자체 제거 예정.
 */

beforeEach(() => {
  useSimStore.setState({
    viewMode: 'educational',
    selectedBodyId: null,
  });
});

describe('ScaleBadge (P12-A #298 B2)', () => {
  it('focus 없음 + educational — "실측 비율 모드" 표시 (과장 문구 제거)', () => {
    render(<ScaleBadge />);
    const badge = screen.getByTestId('scale-badge');
    expect(badge).toHaveTextContent('실측 비율 모드');
    // 거짓 UI 방지 regression guard — 과거 "과장 중" 문구 재등장 차단.
    expect(badge.textContent ?? '').not.toMatch(/과장/);
    expect(badge.textContent ?? '').not.toMatch(/×/);
  });

  it('focus 없음 + scientific — "실측 비율 모드" 표시 (모드 분기 제거)', () => {
    useSimStore.setState({ viewMode: 'scientific' });
    render(<ScaleBadge />);
    expect(screen.getByTestId('scale-badge')).toHaveTextContent('실측 비율 모드');
  });

  it('지구 focus + educational — "지구 — 실측 비율 1.0"', () => {
    useSimStore.setState({ selectedBodyId: 'earth' });
    render(<ScaleBadge />);
    const badge = screen.getByTestId('scale-badge');
    expect(badge).toHaveTextContent('지구');
    expect(badge).toHaveTextContent('실측 비율 1.0');
    expect(badge.textContent ?? '').not.toMatch(/과장|×500/);
  });

  it('태양 focus + educational — kind=star 에도 과장 문구 없음', () => {
    useSimStore.setState({ selectedBodyId: 'sun' });
    render(<ScaleBadge />);
    const badge = screen.getByTestId('scale-badge');
    expect(badge).toHaveTextContent('태양');
    expect(badge).toHaveTextContent('실측 비율 1.0');
    expect(badge.textContent ?? '').not.toMatch(/×20/);
  });

  it('혜성 focus + educational — kind=comet 에도 과장 문구 없음', () => {
    useSimStore.setState({ selectedBodyId: 'halley' });
    render(<ScaleBadge />);
    const badge = screen.getByTestId('scale-badge');
    expect(badge).toHaveTextContent('핼리 혜성');
    expect(badge).toHaveTextContent('실측 비율 1.0');
    expect(badge.textContent ?? '').not.toMatch(/×20,000|과장/);
  });

  it('지구 focus + scientific — educational 과 동일 문구', () => {
    useSimStore.setState({ selectedBodyId: 'earth', viewMode: 'scientific' });
    render(<ScaleBadge />);
    expect(screen.getByTestId('scale-badge')).toHaveTextContent('실측 비율 1.0');
  });

  it('data-view-mode 어트리뷰트가 store viewMode 반영 (API 호환 유지)', () => {
    render(<ScaleBadge />);
    expect(screen.getByTestId('scale-badge')).toHaveAttribute('data-view-mode', 'educational');
    useSimStore.setState({ viewMode: 'scientific' });
    render(<ScaleBadge />);
    const badges = screen.getAllByTestId('scale-badge');
    expect(badges[badges.length - 1]).toHaveAttribute('data-view-mode', 'scientific');
  });
});
