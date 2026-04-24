/**
 * P11-B #289 — LOD 분기 / body-kind 분류 / 화면 점유 단위 테스트
 *
 * DoD B.1-D2: matrix 9개 (태양/지구/달/이오/소행성 × 근/중/원) + 카테고리 enum 완비 assert
 * ADR: `docs/decisions/20260424-p11-b-lod-design.md` §결정 §4
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import { AU } from '@astro-simulator/shared';
import {
  lodFromScreenCoverage,
  screenCoverageRadius,
  classifyBodyLodKind,
  LOD_BODY_THRESHOLDS,
  LOD_PIXEL_THRESHOLDS,
  type BodyLodKind,
} from './lod.js';

// ----------------------------------------------------------------------------
// 1. 카테고리 enum 완비 assert (주석 계약 drift 방어 — volt #49 교훈)
// ----------------------------------------------------------------------------

describe('LOD_BODY_THRESHOLDS — 12 카테고리 완비', () => {
  it('모든 BodyLodKind 가 LOD_BODY_THRESHOLDS 에 존재한다', () => {
    const required: BodyLodKind[] = [
      'star',
      'planet-giant',
      'planet-terrestrial',
      'moon',
      'dwarf-planet',
      'comet',
      'asteroid',
      'spacecraft',
      'black-hole',
      'nebula',
      'galaxy',
      'star-cluster',
    ];
    for (const kind of required) {
      expect(LOD_BODY_THRESHOLDS[kind]).toBeDefined();
    }
    // 선언한 key 수와 required 수가 정확히 일치 — default 도입 금지 (volt #49 교훈).
    expect(Object.keys(LOD_BODY_THRESHOLDS)).toHaveLength(required.length);
  });
});

// ----------------------------------------------------------------------------
// 2. classifyBodyLodKind — kind + mass 파생 분류
// ----------------------------------------------------------------------------

describe('classifyBodyLodKind', () => {
  it('kind 자체 매핑 — star / moon / dwarf-planet / comet / asteroid / spacecraft', () => {
    expect(classifyBodyLodKind({ kind: 'star', mass: 1.989e30 })).toBe('star');
    expect(classifyBodyLodKind({ kind: 'moon', mass: 7.34e22 })).toBe('moon');
    expect(classifyBodyLodKind({ kind: 'dwarf-planet', mass: 1.3e22 })).toBe('dwarf-planet');
    expect(classifyBodyLodKind({ kind: 'comet', mass: 1e13 })).toBe('comet');
    expect(classifyBodyLodKind({ kind: 'asteroid', mass: 9.4e20 })).toBe('asteroid');
    expect(classifyBodyLodKind({ kind: 'spacecraft', mass: 720 })).toBe('spacecraft');
  });

  it('planet 질량 파생 — 지구형 (terrestrial) vs 가스 거인 (giant)', () => {
    // 수성 3.3e23 / 금성 4.87e24 / 지구 5.97e24 / 화성 6.42e23 → terrestrial
    expect(classifyBodyLodKind({ kind: 'planet', mass: 3.3e23 })).toBe('planet-terrestrial');
    expect(classifyBodyLodKind({ kind: 'planet', mass: 5.97e24 })).toBe('planet-terrestrial');
    expect(classifyBodyLodKind({ kind: 'planet', mass: 6.42e23 })).toBe('planet-terrestrial');
    // 천왕성 8.68e25 / 해왕성 1.02e26 / 토성 5.68e26 / 목성 1.90e27 → giant
    expect(classifyBodyLodKind({ kind: 'planet', mass: 8.68e25 })).toBe('planet-giant');
    expect(classifyBodyLodKind({ kind: 'planet', mass: 1.02e26 })).toBe('planet-giant');
    expect(classifyBodyLodKind({ kind: 'planet', mass: 1.9e27 })).toBe('planet-giant');
  });

  it('shader 전용 kind — black-hole / nebula / galaxy / star-cluster', () => {
    expect(classifyBodyLodKind({ kind: 'black-hole', mass: 1e31 })).toBe('black-hole');
    expect(classifyBodyLodKind({ kind: 'nebula', mass: 1e30 })).toBe('nebula');
    expect(classifyBodyLodKind({ kind: 'galaxy', mass: 1e42 })).toBe('galaxy');
    expect(classifyBodyLodKind({ kind: 'star-cluster', mass: 1e35 })).toBe('star-cluster');
  });

  it('미지 kind → null 반환 (호출자가 console.warn + low fallback)', () => {
    expect(classifyBodyLodKind({ kind: 'exoplanet', mass: 1e25 })).toBeNull();
    expect(classifyBodyLodKind({ kind: '', mass: 0 })).toBeNull();
  });
});

// ----------------------------------------------------------------------------
// 3. lodFromScreenCoverage — 9개 matrix + URL override + focus
// ----------------------------------------------------------------------------

// 실측 근접 데이터 (solar-system.json 기반).
const SUN = { kind: 'star', mass: 1.989e30, radius: 6.957e8 };
const EARTH = { kind: 'planet', mass: 5.972e24, radius: 6.371e6 };
const JUPITER = { kind: 'planet', mass: 1.898e27, radius: 6.9911e7 };
const MOON = { kind: 'moon', mass: 7.342e22, radius: 1.7374e6 };
const IO = { kind: 'moon', mass: 8.932e22, radius: 1.8216e6 };
const ASTEROID = { kind: 'asteroid', mass: 9.4e20, radius: 4.73e5 };

describe('lodFromScreenCoverage — 9개 matrix (body × 거리)', () => {
  // 매트릭스: 5 body × 3 거리 = 15 케이스 (DoD 요구 9 초과).
  // 거리 카테고리 — near/mid/far 는 body 별 물리적 의미가 달라 절대값 대신 relative label 로 사용.

  describe('태양 (star) — absolute-distance < 1 AU', () => {
    it('근 (0.5 AU) — 강제 high', () => {
      // screenCoverage 작아도 kind 강제 규칙으로 high.
      expect(
        lodFromScreenCoverage({
          body: SUN,
          cameraDistanceMeters: 0.5 * AU,
          screenCoverage: 1,
        }),
      ).toBe('high');
    });
    it('중 (2 AU) — 픽셀 경계 적용 (50px 이상 high)', () => {
      expect(
        lodFromScreenCoverage({
          body: SUN,
          cameraDistanceMeters: 2 * AU,
          screenCoverage: 100,
        }),
      ).toBe('high');
    });
    it('원 (10 AU) + sub-pixel — low', () => {
      expect(
        lodFromScreenCoverage({
          body: SUN,
          cameraDistanceMeters: 10 * AU,
          screenCoverage: 0.5,
        }),
      ).toBe('low');
    });
  });

  describe('지구 (planet-terrestrial) — radius-multiple < 5R', () => {
    it('근 (3R ≈ 1.9e7 m) — 강제 high', () => {
      expect(
        lodFromScreenCoverage({
          body: EARTH,
          cameraDistanceMeters: 3 * EARTH.radius,
          screenCoverage: 2,
        }),
      ).toBe('high');
    });
    it('중 (10R, 30px) — mid (8 ≤ px < 50)', () => {
      expect(
        lodFromScreenCoverage({
          body: EARTH,
          cameraDistanceMeters: 10 * EARTH.radius,
          screenCoverage: 30,
        }),
      ).toBe('mid');
    });
    it('원 (1 AU, sub-pixel) — low', () => {
      expect(
        lodFromScreenCoverage({
          body: EARTH,
          cameraDistanceMeters: 1 * AU,
          screenCoverage: 0.3,
        }),
      ).toBe('low');
    });
  });

  describe('목성 (planet-giant) — radius-multiple < 10R', () => {
    it('근 (5R) — 강제 high (10R 이내)', () => {
      expect(
        lodFromScreenCoverage({
          body: JUPITER,
          cameraDistanceMeters: 5 * JUPITER.radius,
          screenCoverage: 5,
        }),
      ).toBe('high');
    });
    it('중 (50R, 20px) — mid', () => {
      expect(
        lodFromScreenCoverage({
          body: JUPITER,
          cameraDistanceMeters: 50 * JUPITER.radius,
          screenCoverage: 20,
        }),
      ).toBe('mid');
    });
  });

  describe('달 (moon) — radius-multiple < 5R', () => {
    it('근 (3R) — 강제 high', () => {
      expect(
        lodFromScreenCoverage({
          body: MOON,
          cameraDistanceMeters: 3 * MOON.radius,
          screenCoverage: 2,
        }),
      ).toBe('high');
    });
    it('원 (30R, 7px) — low (8px 미만)', () => {
      expect(
        lodFromScreenCoverage({
          body: MOON,
          cameraDistanceMeters: 30 * MOON.radius,
          screenCoverage: 7,
        }),
      ).toBe('low');
    });
  });

  describe('이오 (moon) — 갈릴레이 위성 분기', () => {
    it('근 (3R) — 강제 high', () => {
      expect(
        lodFromScreenCoverage({
          body: IO,
          cameraDistanceMeters: 3 * IO.radius,
          screenCoverage: 2,
        }),
      ).toBe('high');
    });
    it('원 (AU 단위) — low', () => {
      expect(
        lodFromScreenCoverage({
          body: IO,
          cameraDistanceMeters: 1 * AU,
          screenCoverage: 0.1,
        }),
      ).toBe('low');
    });
  });

  describe('소행성 (asteroid) — absolute-distance < 0.01 AU', () => {
    it('근 (0.005 AU) — 강제 high', () => {
      expect(
        lodFromScreenCoverage({
          body: ASTEROID,
          cameraDistanceMeters: 0.005 * AU,
          screenCoverage: 1,
        }),
      ).toBe('high');
    });
    it('중 (0.05 AU, 20px) — mid', () => {
      expect(
        lodFromScreenCoverage({
          body: ASTEROID,
          cameraDistanceMeters: 0.05 * AU,
          screenCoverage: 20,
        }),
      ).toBe('mid');
    });
    it('원 (2 AU, sub-pixel) — low', () => {
      expect(
        lodFromScreenCoverage({
          body: ASTEROID,
          cameraDistanceMeters: 2 * AU,
          screenCoverage: 0.05,
        }),
      ).toBe('low');
    });
  });
});

describe('lodFromScreenCoverage — URL override / focus / shader 전용', () => {
  it('URL override high — 거리/coverage 무관 강제 high', () => {
    expect(
      lodFromScreenCoverage({
        body: EARTH,
        cameraDistanceMeters: 100 * AU,
        screenCoverage: 0.1,
        override: 'high',
      }),
    ).toBe('high');
  });

  it('URL override mid — 강제 mid', () => {
    expect(
      lodFromScreenCoverage({
        body: SUN,
        cameraDistanceMeters: 0.1 * AU,
        screenCoverage: 500,
        override: 'mid',
      }),
    ).toBe('mid');
  });

  it('URL override low — 강제 low', () => {
    expect(
      lodFromScreenCoverage({
        body: EARTH,
        cameraDistanceMeters: 3 * EARTH.radius,
        screenCoverage: 200,
        override: 'low',
      }),
    ).toBe('low');
  });

  it("URL override 'auto' 는 자동 판정으로 내려감", () => {
    expect(
      lodFromScreenCoverage({
        body: EARTH,
        cameraDistanceMeters: 3 * EARTH.radius,
        screenCoverage: 2,
        override: 'auto',
      }),
    ).toBe('high'); // kind 규칙 발동
  });

  it('isFocused=true — 거리/coverage 무관 강제 high (ADR §미해결 3)', () => {
    expect(
      lodFromScreenCoverage({
        body: EARTH,
        cameraDistanceMeters: 100 * AU,
        screenCoverage: 0.1,
        isFocused: true,
      }),
    ).toBe('high');
  });

  it('isFocused 와 override low 가 모두 지정된 경우 override 가 우선', () => {
    // override 는 개발/디버그 용도 — focus 보다 우선순위 높음 (주석 계약 §6).
    expect(
      lodFromScreenCoverage({
        body: EARTH,
        cameraDistanceMeters: 3 * EARTH.radius,
        screenCoverage: 100,
        isFocused: true,
        override: 'low',
      }),
    ).toBe('low');
  });

  it('shader 전용 kind (black-hole) 는 거리 무관 high 유지', () => {
    expect(
      lodFromScreenCoverage({
        body: { kind: 'black-hole', mass: 1e31, radius: 1e4 },
        cameraDistanceMeters: 1000 * AU,
        screenCoverage: 0.01,
      }),
    ).toBe('high');
  });
});

describe('lodFromScreenCoverage — 미지 kind fallback', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("미지 kind → 'low' + console.warn 1회", () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = lodFromScreenCoverage({
      body: { kind: 'exoplanet', mass: 1e25, radius: 1e7 },
      cameraDistanceMeters: 1 * AU,
      screenCoverage: 100, // 50 이상이지만 kind 분류 실패 → low 폴백.
    });
    expect(result).toBe('low');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toContain('exoplanet');
  });
});

// ----------------------------------------------------------------------------
// 4. LOD_PIXEL_THRESHOLDS — 경계 상수 assert
// ----------------------------------------------------------------------------

describe('LOD_PIXEL_THRESHOLDS', () => {
  it('픽셀 경계 — high=50 / mid=8 (주석 계약 §5)', () => {
    expect(LOD_PIXEL_THRESHOLDS.high).toBe(50);
    expect(LOD_PIXEL_THRESHOLDS.mid).toBe(8);
  });

  it('경계값에서 정확한 분기 — 50px high, 49.99px mid, 8px mid, 7.99px low', () => {
    const base = {
      body: { kind: 'moon', mass: 7.342e22, radius: 1.7374e6 },
      cameraDistanceMeters: 100 * 1.7374e6, // 100R — kind 규칙 발동 안 함
    };
    expect(lodFromScreenCoverage({ ...base, screenCoverage: 50 })).toBe('high');
    expect(lodFromScreenCoverage({ ...base, screenCoverage: 49.99 })).toBe('mid');
    expect(lodFromScreenCoverage({ ...base, screenCoverage: 8 })).toBe('mid');
    expect(lodFromScreenCoverage({ ...base, screenCoverage: 7.99 })).toBe('low');
  });
});

// ----------------------------------------------------------------------------
// 5. screenCoverageRadius — 투영 계산 smoke test
// ----------------------------------------------------------------------------

describe('screenCoverageRadius', () => {
  // identity 행렬 (투영 비적용) — perspective divide 시 w=1 → NDC = scene 좌표.
  // row-major 16 원소.
  const IDENTITY: number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

  it('카메라 뒤 body (w ≤ 0) 는 0 반환', () => {
    // w 성분을 0 으로 강제하는 특수 행렬 — 마지막 열의 w 위치(m[3],m[7],m[11],m[15]) 를 0.
    const W_ZERO: number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0];
    const result = screenCoverageRadius([1, 1, 1], 1e6, 1e-9, W_ZERO, 800);
    expect(result).toBe(0);
  });

  it('identity 행렬 + edge offset = radius × renderScale × viewportHeight/2', () => {
    // bodyLocalPos = [0, 0, 10] (임의), radius=1e6 m, renderScale=1e-9.
    // edge 는 y 축으로 radius × renderScale = 1e-3 offset.
    // identity 행렬 w=1 → NDC 차이 = edge.y - center.y = 1e-3.
    // pixel = 1e-3 × 800 × 0.5 = 0.4.
    const result = screenCoverageRadius([0, 0, 10], 1e6, 1e-9, IDENTITY, 800);
    expect(result).toBeCloseTo(0.4, 5);
  });

  it('renderScale 2배 → pixel 결과 2배', () => {
    const single = screenCoverageRadius([0, 0, 10], 1e6, 1e-9, IDENTITY, 800);
    const doubled = screenCoverageRadius([0, 0, 10], 1e6, 2e-9, IDENTITY, 800);
    expect(doubled).toBeCloseTo(single * 2, 5);
  });

  it('viewportHeight 2배 → pixel 결과 2배', () => {
    const small = screenCoverageRadius([0, 0, 10], 1e6, 1e-9, IDENTITY, 400);
    const large = screenCoverageRadius([0, 0, 10], 1e6, 1e-9, IDENTITY, 800);
    expect(large).toBeCloseTo(small * 2, 5);
  });
});
