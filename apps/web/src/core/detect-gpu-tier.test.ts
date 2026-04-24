import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  classifyAdapterIsDiscrete,
  detectGpuTier,
  GPU_TIER_SSR_DEFAULT,
  VENDOR_RULES,
  type GpuDetectionInput,
} from './detect-gpu-tier';

/**
 * 10 mock fixture — ADR `20260424-tier-preset-design.md` §결정 §2 카테고리 enum 완비.
 *
 * 분류 대상:
 *  - nvidia (RTX3070) → discrete → tier-a
 *  - amd-discrete (RX6800) → discrete → tier-a
 *  - apple-m-pro (M2 Pro) → discrete → tier-a
 *  - apple-m-pro (M3 Max) → discrete → tier-a
 *  - intel-arc (Arc A770) → discrete → tier-a
 *  - apple-m-basic (M1 iPad) → integrated (모바일 WebGPU → tier-b)
 *  - intel-integrated (Iris Xe) → integrated → tier-b
 *  - qualcomm (Snapdragon 8 Gen 3) → integrated (모바일 WebGPU → tier-b)
 *  - iPhone 15 + Safari 17.4 flag OFF → WebGPU 미지원 → tier-c
 *  - 구형 WebGL2 데스크톱 → WebGPU 미지원 → tier-c
 */

const DESKTOP_NAV = {
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  maxTouchPoints: 0,
};

const MAC_NAV = {
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  maxTouchPoints: 0,
};

const IPAD_NAV = {
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  maxTouchPoints: 5,
};

const ANDROID_NAV = {
  userAgent:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  maxTouchPoints: 5,
};

const IPHONE_NAV = {
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  maxTouchPoints: 5,
};

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('detectGpuTier — 10 mock fixture (ADR §결정 §2)', () => {
  it('[1] RTX3070 (nvidia discrete + 16코어 + 데스크톱) → tier-a', () => {
    const input: GpuDetectionInput = {
      webgpu: {
        supported: true,
        adapterInfo: {
          vendor: 'nvidia',
          architecture: 'ampere',
          description: 'NVIDIA GeForce RTX 3070',
        },
      },
      hardwareConcurrency: 16,
      navigator: DESKTOP_NAV,
    };
    expect(detectGpuTier(input)).toBe('a');
  });

  it('[2] AMD Radeon RX 6800 (rdna2 discrete + 12코어 + 데스크톱) → tier-a', () => {
    const input: GpuDetectionInput = {
      webgpu: {
        supported: true,
        adapterInfo: {
          vendor: 'amd',
          architecture: 'rdna2',
          description: 'AMD Radeon RX 6800',
        },
      },
      hardwareConcurrency: 12,
      navigator: DESKTOP_NAV,
    };
    expect(detectGpuTier(input)).toBe('a');
  });

  it('[3] Apple M2 Pro (apple-m-pro + 10코어 + 데스크톱) → tier-a', () => {
    const input: GpuDetectionInput = {
      webgpu: {
        supported: true,
        adapterInfo: {
          vendor: 'apple',
          architecture: 'apple-7',
          description: 'Apple M2 Pro',
        },
      },
      hardwareConcurrency: 10,
      navigator: MAC_NAV,
    };
    expect(detectGpuTier(input)).toBe('a');
  });

  it('[4] Apple M3 Max (apple-m-pro + 14코어 + 데스크톱) → tier-a', () => {
    const input: GpuDetectionInput = {
      webgpu: {
        supported: true,
        adapterInfo: {
          vendor: 'apple',
          architecture: 'apple-8',
          description: 'Apple M3 Max',
        },
      },
      hardwareConcurrency: 14,
      navigator: MAC_NAV,
    };
    expect(detectGpuTier(input)).toBe('a');
  });

  it('[5] Intel Arc A770 (intel-arc + 16코어 + 데스크톱) → tier-a', () => {
    const input: GpuDetectionInput = {
      webgpu: {
        supported: true,
        adapterInfo: {
          vendor: 'intel',
          architecture: 'arc',
          description: 'Intel Arc A770',
        },
      },
      hardwareConcurrency: 16,
      navigator: DESKTOP_NAV,
    };
    expect(detectGpuTier(input)).toBe('a');
  });

  it('[6] Apple M1 iPad (apple-m-basic + 8코어 + iPad) → tier-b (모바일 WebGPU 지원)', () => {
    const input: GpuDetectionInput = {
      webgpu: {
        supported: true,
        adapterInfo: {
          vendor: 'apple',
          architecture: 'apple-7',
          description: 'Apple M1',
        },
      },
      hardwareConcurrency: 8,
      navigator: IPAD_NAV,
    };
    expect(detectGpuTier(input)).toBe('b');
  });

  it('[7] Intel Iris Xe (intel-integrated + 4코어 + 데스크톱) → tier-b (저코어 + integrated)', () => {
    const input: GpuDetectionInput = {
      webgpu: {
        supported: true,
        adapterInfo: {
          vendor: 'intel',
          architecture: 'xe-lp',
          description: 'Intel Iris Xe Graphics',
        },
      },
      hardwareConcurrency: 4,
      navigator: DESKTOP_NAV,
    };
    // Iris Xe 는 description 에 'xe' 포함 — intel-arc 의 discreteKeywords `\bxe\b` 에 매칭될 수 있으나
    // xe-lp (mobile low-power) 는 실제 integrated. `\bxe\b` 는 Arc Xe 계열만 매칭하도록 의도.
    // Intel Iris Xe Graphics → 'xe' 가 단독 단어이므로 discrete 로 오판될 수 있어 검사 (VENDOR_RULES drift 방어).
    expect(detectGpuTier(input)).toBe('b');
  });

  it('[8] Qualcomm Snapdragon 8 Gen 3 (qualcomm + 8코어 + Android) → tier-b (모바일 WebGPU 지원)', () => {
    const input: GpuDetectionInput = {
      webgpu: {
        supported: true,
        adapterInfo: {
          vendor: 'qualcomm',
          architecture: 'adreno-750',
          description: 'Qualcomm Adreno 750',
        },
      },
      hardwareConcurrency: 8,
      navigator: ANDROID_NAV,
    };
    expect(detectGpuTier(input)).toBe('b');
  });

  it('[9] iPhone 15 + Safari 17.4 WebGPU flag OFF → tier-c (hard reject)', () => {
    const input: GpuDetectionInput = {
      webgpu: { supported: false, adapterInfo: null },
      hardwareConcurrency: 6,
      navigator: IPHONE_NAV,
    };
    expect(detectGpuTier(input)).toBe('c');
  });

  it('[10] 구형 WebGL2-only 데스크톱 (WebGPU 미지원) → tier-c (WebGL2 fallback)', () => {
    const input: GpuDetectionInput = {
      webgpu: { supported: false, adapterInfo: null },
      hardwareConcurrency: 4,
      navigator: DESKTOP_NAV,
    };
    expect(detectGpuTier(input)).toBe('c');
  });
});

describe('classifyAdapterIsDiscrete — vendor 분류 drift 방어', () => {
  it('nvidia vendor 는 키워드 무관 alwaysDiscrete', () => {
    expect(
      classifyAdapterIsDiscrete({
        vendor: 'nvidia',
        architecture: '',
        description: '',
      }),
    ).toBe(true);
  });

  it('apple M1 (기본) 는 pro/max 키워드 없으면 integrated', () => {
    expect(
      classifyAdapterIsDiscrete({
        vendor: 'apple',
        architecture: 'apple-7',
        description: 'Apple M1',
      }),
    ).toBe(false);
  });

  it('빈 adapter info 는 console.warn + integrated 폴백 (ADR §위험 1)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = classifyAdapterIsDiscrete({
      vendor: '',
      architecture: '',
      description: '',
    });
    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('adapter info unavailable (privacy)'),
    );
  });

  it('null adapter 는 console.warn + integrated 폴백', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = classifyAdapterIsDiscrete(null);
    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('adapter info unavailable (privacy)'),
    );
  });

  it('Intel Iris Xe 는 integrated (Arc vs Iris Xe 혼동 drift 방어)', () => {
    // Regression guard: 'xe' 키워드가 discrete 로 오판되면 8코어 Iris Xe 가 tier-a 로 오분류
    // (intel-arc vs intel-integrated 혼동). discreteKeywords 는 `\barc\b` 로만 한정.
    expect(
      classifyAdapterIsDiscrete({
        vendor: 'intel',
        architecture: 'xe-lp',
        description: 'Intel Iris Xe Graphics',
      }),
    ).toBe(false);
  });

  it('미지 vendor 는 console.warn + integrated 폴백 (drift 탐지)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = classifyAdapterIsDiscrete({
      vendor: 'unknown-vendor-xyz',
      architecture: 'mystery',
      description: 'Mystery GPU',
    });
    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('미지 vendor'));
  });
});

describe('VENDOR_RULES — 8 카테고리 완비 assert (카테고리 enum drift 방어)', () => {
  it('필수 vendor rule 이 모두 존재한다', () => {
    const required = [
      'nvidia',
      'amd-discrete',
      'apple-m-pro',
      'apple-m-basic',
      'intel-arc',
      'intel-integrated',
      'qualcomm',
      'arm-mali',
    ];
    for (const key of required) {
      const rule = VENDOR_RULES[key];
      expect(rule).toBeDefined();
      expect(rule?.vendorPattern).toBeInstanceOf(RegExp);
    }
  });
});

describe('SSR 디폴트', () => {
  it('GPU_TIER_SSR_DEFAULT 는 tier-b (중립)', () => {
    expect(GPU_TIER_SSR_DEFAULT).toBe('b');
  });
});
