import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  getOnboardingDismissed,
  markOnboardingDismissed,
  clearOnboardingDismissed,
  getFreeFlyHintShown,
  markFreeFlyHintShown,
  clearFreeFlyHintShown,
  ONBOARDING_STORAGE_KEY,
  ONBOARDING_SCHEMA_VERSION,
  FREE_FLY_HINT_STORAGE_KEY,
} from './onboarding-storage';

/**
 * #737 — onboarding-storage 단위 테스트.
 *
 * DoD:
 *   - 초기 상태 false / mark 후 true / clear 후 false
 *   - `{version,value}` 스키마 박제 정확 (단순 flag 아님)
 *   - 버전 불일치 → false (콘텐츠 버전업 재노출 경로, architect 핵심결정 5)
 *   - SSR 가드 (window 미정의) / localStorage 차단 (private mode / quota) silent fallback
 *   - JSON 손상값 → false (silent)
 */

describe('onboarding-storage (#737)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe('기본 동작 — get / mark / clear', () => {
    it('초기 상태 — get 은 false (default = 자동 표시)', () => {
      expect(getOnboardingDismissed()).toBe(false);
    });

    it('mark 후 — get 은 true', () => {
      markOnboardingDismissed();
      expect(getOnboardingDismissed()).toBe(true);
    });

    it('clear 후 — get 은 false (자동 표시 재개)', () => {
      markOnboardingDismissed();
      clearOnboardingDismissed();
      expect(getOnboardingDismissed()).toBe(false);
    });
  });

  describe('`{version,value}` 스키마 박제 (architect 핵심결정 5 — 단순 flag X)', () => {
    it('mark → localStorage 키에 `{version:1,value:true}` 박제', () => {
      markOnboardingDismissed();
      const raw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw as string)).toEqual({
        version: ONBOARDING_SCHEMA_VERSION,
        value: true,
      });
    });
  });

  describe('스키마 버전 불일치 — 콘텐츠 버전업 재노출 경로', () => {
    it('구버전 dismiss 데이터(version 0) → get 은 false (재노출)', () => {
      window.localStorage.setItem(
        ONBOARDING_STORAGE_KEY,
        JSON.stringify({ version: 0, value: true }),
      );
      expect(getOnboardingDismissed()).toBe(false);
    });

    it('미래 버전(version 99) → get 은 false (불일치 = 안 봤음)', () => {
      window.localStorage.setItem(
        ONBOARDING_STORAGE_KEY,
        JSON.stringify({ version: 99, value: true }),
      );
      expect(getOnboardingDismissed()).toBe(false);
    });

    it('현재 버전 + value:false → get 은 false', () => {
      window.localStorage.setItem(
        ONBOARDING_STORAGE_KEY,
        JSON.stringify({ version: ONBOARDING_SCHEMA_VERSION, value: false }),
      );
      expect(getOnboardingDismissed()).toBe(false);
    });
  });

  describe('손상값 fallback — 명시 false (silent)', () => {
    it('JSON 손상 문자열 → get 은 false (throw X)', () => {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '{not-json');
      expect(getOnboardingDismissed()).toBe(false);
    });

    it('레거시 단순 flag `"1"` (객체 아님) → get 은 false', () => {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '"1"');
      expect(getOnboardingDismissed()).toBe(false);
    });

    it('null 값(JSON null) → get 은 false', () => {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, 'null');
      expect(getOnboardingDismissed()).toBe(false);
    });
  });

  describe('SSR 환경 안전 (typeof window === undefined)', () => {
    it('window 미정의 시 get → false 반환 (throw X)', () => {
      const originalWindow = globalThis.window;
      // @ts-expect-error — SSR 시뮬레이션
      delete globalThis.window;
      expect(getOnboardingDismissed()).toBe(false);
      globalThis.window = originalWindow;
    });

    it('window 미정의 시 mark → silent (throw X)', () => {
      const originalWindow = globalThis.window;
      // @ts-expect-error — SSR 시뮬레이션
      delete globalThis.window;
      expect(() => markOnboardingDismissed()).not.toThrow();
      globalThis.window = originalWindow;
    });
  });

  describe('localStorage 차단 환경 (private mode / quota)', () => {
    it('getItem throw 시 get → false 반환 (silent fallback)', () => {
      const spy = vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      expect(getOnboardingDismissed()).toBe(false);
      spy.mockRestore();
    });

    it('setItem throw 시 mark → silent (throw X, 다음 세션 재표시)', () => {
      const spy = vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      expect(() => markOnboardingDismissed()).not.toThrow();
      spy.mockRestore();
      // 박제 실패 → get 도 false (silent → 다음 세션 재표시)
      expect(getOnboardingDismissed()).toBe(false);
    });
  });

  describe('free-fly 힌트 글로벌 1회 (architect 핵심결정 6 — 단순 flag)', () => {
    it('초기 false / mark 후 true / clear 후 false', () => {
      expect(getFreeFlyHintShown()).toBe(false);
      markFreeFlyHintShown();
      expect(getFreeFlyHintShown()).toBe(true);
      clearFreeFlyHintShown();
      expect(getFreeFlyHintShown()).toBe(false);
    });

    it('mark → localStorage 키 `astro:free-fly-hint-shown` = "1"', () => {
      markFreeFlyHintShown();
      expect(window.localStorage.getItem(FREE_FLY_HINT_STORAGE_KEY)).toBe('1');
    });

    it('onboarding-dismissed 와 독립 키 (서로 영향 0)', () => {
      markFreeFlyHintShown();
      expect(getOnboardingDismissed()).toBe(false);
      markOnboardingDismissed();
      clearFreeFlyHintShown();
      expect(getOnboardingDismissed()).toBe(true);
    });

    it('getItem throw 시 → false (silent fallback)', () => {
      const spy = vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      expect(getFreeFlyHintShown()).toBe(false);
      spy.mockRestore();
    });
  });
});
