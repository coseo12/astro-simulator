import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSimStore } from '@/store/sim-store';
import { AboutModal } from './about-modal';

beforeEach(() => {
  useSimStore.setState({ viewMode: 'educational' });
});

describe('AboutModal (P10-C-3 #278)', () => {
  it('초기 상태 — 버튼만 표시, 모달 숨김', () => {
    render(<AboutModal />);
    expect(screen.getByTestId('about-button')).toBeInTheDocument();
    expect(screen.queryByTestId('about-modal')).toBeNull();
  });

  it('버튼 클릭 → 모달 오픈', () => {
    render(<AboutModal />);
    fireEvent.click(screen.getByTestId('about-button'));
    expect(screen.getByTestId('about-modal')).toBeInTheDocument();
  });

  it('출처 목록 — IAU / NASA / JPL 포함', () => {
    render(<AboutModal />);
    fireEvent.click(screen.getByTestId('about-button'));
    const sources = screen.getByTestId('about-sources');
    expect(sources).toHaveTextContent('IAU 2015');
    expect(sources).toHaveTextContent('NASA Planetary Fact Sheet');
    expect(sources).toHaveTextContent('NASA JPL Horizons');
  });

  it('educational 모드 — 과장 요약 표시', () => {
    render(<AboutModal />);
    fireEvent.click(screen.getByTestId('about-button'));
    const modal = screen.getByTestId('about-modal');
    expect(modal).toHaveTextContent('교육');
    expect(modal).toHaveTextContent('×20');
    expect(modal).toHaveTextContent('×500');
    expect(modal).toHaveTextContent('×20,000');
  });

  it('scientific 모드 — 1.0 비율 안내 표시', () => {
    useSimStore.setState({ viewMode: 'scientific' });
    render(<AboutModal />);
    fireEvent.click(screen.getByTestId('about-button'));
    const modal = screen.getByTestId('about-modal');
    expect(modal).toHaveTextContent('사실');
    expect(modal).toHaveTextContent('1.0');
  });

  it('닫기 버튼 → 모달 제거', () => {
    render(<AboutModal />);
    fireEvent.click(screen.getByTestId('about-button'));
    fireEvent.click(screen.getByTestId('about-close'));
    expect(screen.queryByTestId('about-modal')).toBeNull();
  });

  it('Escape 키 → 모달 제거', () => {
    render(<AboutModal />);
    fireEvent.click(screen.getByTestId('about-button'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('about-modal')).toBeNull();
  });

  it('공차 ±0.01% 안내 포함', () => {
    render(<AboutModal />);
    fireEvent.click(screen.getByTestId('about-button'));
    expect(screen.getByTestId('about-modal')).toHaveTextContent('±0.01%');
  });
});
