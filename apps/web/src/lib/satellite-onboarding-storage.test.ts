import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  getSatelliteZoomTooltipShown,
  markSatelliteZoomTooltipShown,
  clearSatelliteZoomTooltipShown,
} from './satellite-onboarding-storage';

describe('satellite-onboarding-storage (#534)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe('per-body 키 분리 (architect 결정 2)', () => {
    it('초기 상태 — get 은 false', () => {
      expect(getSatelliteZoomTooltipShown('earth')).toBe(false);
      expect(getSatelliteZoomTooltipShown('mars')).toBe(false);
      expect(getSatelliteZoomTooltipShown('jupiter')).toBe(false);
    });

    it('mark earth 후 — earth=true, mars=false (per-body 분리)', () => {
      markSatelliteZoomTooltipShown('earth');
      expect(getSatelliteZoomTooltipShown('earth')).toBe(true);
      expect(getSatelliteZoomTooltipShown('mars')).toBe(false);
      expect(getSatelliteZoomTooltipShown('jupiter')).toBe(false);
    });

    it('mark earth + mars 후 — 두 body 모두 true, jupiter 는 false', () => {
      markSatelliteZoomTooltipShown('earth');
      markSatelliteZoomTooltipShown('mars');
      expect(getSatelliteZoomTooltipShown('earth')).toBe(true);
      expect(getSatelliteZoomTooltipShown('mars')).toBe(true);
      expect(getSatelliteZoomTooltipShown('jupiter')).toBe(false);
    });

    it('clear earth 후 — earth=false, mars 는 unaffected', () => {
      markSatelliteZoomTooltipShown('earth');
      markSatelliteZoomTooltipShown('mars');
      clearSatelliteZoomTooltipShown('earth');
      expect(getSatelliteZoomTooltipShown('earth')).toBe(false);
      expect(getSatelliteZoomTooltipShown('mars')).toBe(true);
    });
  });

  describe('키 형식 정합 — `r4.satellite-zoom-tooltip-shown.<bodyId>`', () => {
    it('mark earth → localStorage 키 `r4.satellite-zoom-tooltip-shown.earth` = "1"', () => {
      markSatelliteZoomTooltipShown('earth');
      expect(window.localStorage.getItem('r4.satellite-zoom-tooltip-shown.earth')).toBe('1');
    });

    it('mark jupiter → 박제 키 정확', () => {
      markSatelliteZoomTooltipShown('jupiter');
      expect(window.localStorage.getItem('r4.satellite-zoom-tooltip-shown.jupiter')).toBe('1');
    });
  });

  describe('SSR 환경 안전 (typeof window === undefined)', () => {
    it('window 미정의 시 get → false 반환 (throw X)', () => {
      const originalWindow = globalThis.window;
      // @ts-expect-error — SSR 시뮬레이션
      delete globalThis.window;
      expect(getSatelliteZoomTooltipShown('earth')).toBe(false);
      globalThis.window = originalWindow;
    });

    it('window 미정의 시 mark → silent (throw X)', () => {
      const originalWindow = globalThis.window;
      // @ts-expect-error — SSR 시뮬레이션
      delete globalThis.window;
      expect(() => markSatelliteZoomTooltipShown('earth')).not.toThrow();
      globalThis.window = originalWindow;
    });
  });

  describe('localStorage 차단 환경 (private mode / quota)', () => {
    it('localStorage.getItem throw 시 get → false 반환 (silent fallback)', () => {
      const spy = vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      expect(getSatelliteZoomTooltipShown('earth')).toBe(false);
      spy.mockRestore();
    });

    it('localStorage.setItem throw 시 mark → silent (throw X, 다음 세션에서 재시도 가능)', () => {
      const spy = vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      expect(() => markSatelliteZoomTooltipShown('earth')).not.toThrow();
      spy.mockRestore();
      // 박제 실패했으므로 get 도 false (silent → 다음 세션 재시도)
      expect(getSatelliteZoomTooltipShown('earth')).toBe(false);
    });
  });
});
