import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, expect, it, beforeEach } from 'vitest';
import { OnboardingModal } from './onboarding-modal';
import { ONBOARDING_STORAGE_KEY, ONBOARDING_SCHEMA_VERSION } from '@/lib/onboarding-storage';

/**
 * #737 — OnboardingModal 단위 테스트.
 *
 * DoD:
 *   - 첫 방문(localStorage 미설정) → mount 후 자동 open
 *   - dismiss("다시 보지 않기") → localStorage `{version,value:true}` 박제 + 닫힘
 *   - 재방문(dismiss 박제) → 자동 미표시
 *   - 시작하기/닫기/backdrop/Esc 닫힘 (dismiss 박제 X)
 *   - role=dialog + aria-modal + aria-labelledby + data-modal-open 속성
 *   - 조작 안내 콘텐츠 3섹션 (마우스·키보드 / 탐색 / 터치)
 */

describe('OnboardingModal (#737)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe('첫 방문 자동 표시', () => {
    it('localStorage 미설정 → mount 후 자동 open', () => {
      render(<OnboardingModal />);
      expect(screen.getByTestId('onboarding-modal')).toBeInTheDocument();
    });

    it('dismiss 박제 후 → 자동 미표시 (재방문)', () => {
      window.localStorage.setItem(
        ONBOARDING_STORAGE_KEY,
        JSON.stringify({ version: ONBOARDING_SCHEMA_VERSION, value: true }),
      );
      render(<OnboardingModal />);
      expect(screen.queryByTestId('onboarding-modal')).toBeNull();
    });

    it('구버전 dismiss 데이터 → 재노출 (버전 불일치)', () => {
      window.localStorage.setItem(
        ONBOARDING_STORAGE_KEY,
        JSON.stringify({ version: 0, value: true }),
      );
      render(<OnboardingModal />);
      expect(screen.getByTestId('onboarding-modal')).toBeInTheDocument();
    });
  });

  describe('닫기 경로별 동작', () => {
    it('"다시 보지 않기" → localStorage `{version,value:true}` 박제 + 닫힘', () => {
      render(<OnboardingModal />);
      act(() => {
        fireEvent.click(screen.getByTestId('onboarding-dismiss'));
      });
      expect(screen.queryByTestId('onboarding-modal')).toBeNull();
      const raw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
      expect(JSON.parse(raw as string)).toEqual({
        version: ONBOARDING_SCHEMA_VERSION,
        value: true,
      });
    });

    it('"시작하기" → 닫힘 + localStorage 박제 안 됨 (다음 방문 재표시)', () => {
      render(<OnboardingModal />);
      act(() => {
        fireEvent.click(screen.getByTestId('onboarding-start'));
      });
      expect(screen.queryByTestId('onboarding-modal')).toBeNull();
      expect(window.localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBeNull();
    });

    it('닫기(✕) → 닫힘 + localStorage 박제 안 됨', () => {
      render(<OnboardingModal />);
      act(() => {
        fireEvent.click(screen.getByTestId('onboarding-close'));
      });
      expect(screen.queryByTestId('onboarding-modal')).toBeNull();
      expect(window.localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBeNull();
    });

    it('Esc → 닫힘', () => {
      render(<OnboardingModal />);
      act(() => {
        fireEvent.keyDown(window, { key: 'Escape' });
      });
      expect(screen.queryByTestId('onboarding-modal')).toBeNull();
    });
  });

  describe('도움말 재호출 — 버튼으로 재오픈', () => {
    it('dismiss 후 "조작 가이드" 버튼 클릭 → 재오픈', () => {
      window.localStorage.setItem(
        ONBOARDING_STORAGE_KEY,
        JSON.stringify({ version: ONBOARDING_SCHEMA_VERSION, value: true }),
      );
      render(<OnboardingModal />);
      // 자동 미표시 확인
      expect(screen.queryByTestId('onboarding-modal')).toBeNull();
      act(() => {
        fireEvent.click(screen.getByTestId('onboarding-button'));
      });
      expect(screen.getByTestId('onboarding-modal')).toBeInTheDocument();
    });
  });

  describe('접근성 — role / aria / data-modal-open', () => {
    it('role="dialog" + aria-modal="true" + aria-labelledby', () => {
      render(<OnboardingModal />);
      const modal = screen.getByTestId('onboarding-modal');
      expect(modal).toHaveAttribute('role', 'dialog');
      expect(modal).toHaveAttribute('aria-modal', 'true');
      expect(modal).toHaveAttribute('aria-labelledby', 'onboarding-title');
    });

    it('Esc 충돌 가드 — 컨테이너에 data-modal-open="true" 속성 박제', () => {
      render(<OnboardingModal />);
      expect(screen.getByTestId('onboarding-modal')).toHaveAttribute('data-modal-open', 'true');
    });

    it('open 시 닫기 버튼에 focus (first-touch a11y)', () => {
      render(<OnboardingModal />);
      expect(screen.getByTestId('onboarding-close')).toHaveFocus();
    });

    // reviewer 권고 1 — 초기 mount(open 한 번도 안 됨)에는 trigger 로 focus 가 가지 않아야 한다.
    // dismiss 박제된 재방문 유저(자동표시 X)의 포커스 탈취 버그 회귀 가드.
    it('초기 mount(dismiss 박제, 자동표시 X) → trigger 버튼에 focus 가 가지 않음', () => {
      window.localStorage.setItem(
        ONBOARDING_STORAGE_KEY,
        JSON.stringify({ version: ONBOARDING_SCHEMA_VERSION, value: true }),
      );
      render(<OnboardingModal />);
      // 모달 미표시 + trigger 미포커스 (open 한 번도 true 가 아니었으므로 복원 미발화)
      expect(screen.queryByTestId('onboarding-modal')).toBeNull();
      expect(screen.getByTestId('onboarding-button')).not.toHaveFocus();
    });

    // reviewer 권고 1 — open→close 전이에서는 trigger 로 focus 가 복원돼야 한다.
    it('open→close 전이 → trigger 버튼으로 focus 복원', () => {
      render(<OnboardingModal />);
      // 첫 방문 자동 open 상태에서 닫기 → trigger 복원
      expect(screen.getByTestId('onboarding-modal')).toBeInTheDocument();
      act(() => {
        fireEvent.click(screen.getByTestId('onboarding-close'));
      });
      expect(screen.queryByTestId('onboarding-modal')).toBeNull();
      expect(screen.getByTestId('onboarding-button')).toHaveFocus();
    });
  });

  describe('조작 안내 콘텐츠 — 3섹션 + 실측 바인딩', () => {
    it('마우스·키보드 / 탐색 / 터치 3 가이드 테이블 모두 렌더', () => {
      render(<OnboardingModal />);
      expect(screen.getByTestId('onboarding-pointer-guide')).toBeInTheDocument();
      expect(screen.getByTestId('onboarding-freefly-guide')).toBeInTheDocument();
      expect(screen.getByTestId('onboarding-touch-guide')).toBeInTheDocument();
    });

    it('탐색 가이드에 WASD/QE 실측 바인딩 노출 (camera.ts WASD_KEYS)', () => {
      render(<OnboardingModal />);
      const freefly = screen.getByTestId('onboarding-freefly-guide');
      expect(freefly).toHaveTextContent('W/S 전후진');
      expect(freefly).toHaveTextContent('A/D 좌우');
      expect(freefly).toHaveTextContent('Q/E 상하');
      expect(freefly).toHaveTextContent('우클릭 드래그');
    });

    it('마우스·키보드 가이드에 클릭 선택 / 휠 줌 / 방향키 회전 노출', () => {
      render(<OnboardingModal />);
      const pointer = screen.getByTestId('onboarding-pointer-guide');
      expect(pointer).toHaveTextContent('마우스 휠');
      expect(pointer).toHaveTextContent('방향키');
    });
  });
});
