import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AboutModal } from './about-modal';

describe('AboutModal (P10-C-3 #278 / P12-C #298 — 단일 모드)', () => {
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

  it('#1373 — 별 카탈로그 출처 (HYG v4.4 · CC BY-SA 4.0 원문 인용) + 등급 시각화 안내', () => {
    render(<AboutModal />);
    fireEvent.click(screen.getByTestId('about-button'));
    const sources = screen.getByTestId('about-sources');
    expect(sources).toHaveTextContent('HYG Stellar Database v4.4');
    expect(sources).toHaveTextContent(
      'This work is licensed under a Creative Commons Attribution-ShareAlike 4.0 International License.',
    );
    expect(screen.getByTestId('about-stars')).toHaveTextContent('크기와 밝기는 실시 등급');
  });

  it('스케일 정책 — v3 incremental build + 3단 tier 설명 포함', () => {
    render(<AboutModal />);
    fireEvent.click(screen.getByTestId('about-button'));
    const modal = screen.getByTestId('about-modal');
    // #405 — P12-C fact-first 폐기 후 Roadmap v3 incremental build 정책 박제
    expect(modal).toHaveTextContent('Roadmap v3');
    expect(modal).toHaveTextContent('R-Phase');
    expect(modal).toHaveTextContent('Solar');
    expect(modal).toHaveTextContent('Inner');
    expect(modal).toHaveTextContent('Body');
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
