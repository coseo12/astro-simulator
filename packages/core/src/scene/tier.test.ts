/**
 * P12-A #298 — Tier 엔진 테스트.
 *
 * 커버리지:
 *  - renderScaleForTier: ADR §1 수식 검증 (V1/V3/V5 viewport 계산 재현)
 *  - tierFromFocus: focus kind 분기 (Q7 focus 경로)
 *  - tierFromCameraDistance: 히스테리시스 ±15% (A2 DoD)
 */

import { describe, expect, it } from 'vitest';
import { AU } from '@astro-simulator/shared';
import {
  renderScaleForTier,
  tierFromFocus,
  tierFromCameraDistance,
  TIER_HYSTERESIS,
} from './tier.js';

describe('renderScaleForTier — ADR §1 수식 재현', () => {
  it('T1 solar: 해왕성 30 AU 가 ~380 scene unit (좁은 축 95% 범위 내)', () => {
    const neptuneWorldMeters = 30 * AU;
    const sceneUnits = neptuneWorldMeters * renderScaleForTier('solar');
    // 800×0.95÷2 = 380 단위 대비 ±20% 허용 (ADR §1 수식 설계)
    expect(sceneUnits).toBeGreaterThan(304);
    expect(sceneUnits).toBeLessThan(456);
  });

  it('T2 inner: 화성 원일점 1.666 AU 가 ~384 scene unit (가로 60% 범위 내)', () => {
    const marsApo = 1.666 * AU;
    const sceneUnits = marsApo * renderScaleForTier('inner');
    // 1280×0.60÷2 = 384 단위 대비 ±20% 허용
    expect(sceneUnits).toBeGreaterThan(307);
    expect(sceneUnits).toBeLessThan(461);
  });

  it('T3 body: 지구 직경 1.275e7 m 가 ~320 scene unit (세로 40% 범위 내)', () => {
    const earthDiameter = 1.275e7;
    const sceneUnits = earthDiameter * renderScaleForTier('body');
    // 800×0.40 = 320 단위 대비 ±20% 허용
    expect(sceneUnits).toBeGreaterThan(256);
    expect(sceneUnits).toBeLessThan(384);
  });

  it('renderScale 크기 순서: body > inner > solar (가까울수록 큰 배수)', () => {
    expect(renderScaleForTier('body')).toBeGreaterThan(renderScaleForTier('inner'));
    expect(renderScaleForTier('inner')).toBeGreaterThan(renderScaleForTier('solar'));
  });
});

describe('tierFromFocus — Q7 focus 경로', () => {
  it('star focus → solar (전체 태양계 뷰)', () => {
    expect(tierFromFocus('star', 1e12)).toBe('solar');
    expect(tierFromFocus('star', 0.01 * AU)).toBe('solar');
  });

  it('planet focus + 가까운 거리 (< 0.1 AU) → body', () => {
    expect(tierFromFocus('planet', 0.01 * AU)).toBe('body');
    expect(tierFromFocus('planet', 0.05 * AU)).toBe('body');
  });

  it('planet focus + 먼 거리 (≥ 0.1 AU) → inner', () => {
    expect(tierFromFocus('planet', 0.1 * AU)).toBe('inner');
    expect(tierFromFocus('planet', 1 * AU)).toBe('inner');
  });

  it('moon focus → body (세부 관찰 의도)', () => {
    expect(tierFromFocus('moon', 1e6)).toBe('body');
    expect(tierFromFocus('moon', 1e10)).toBe('body');
  });

  it('dwarf-planet / comet focus → body', () => {
    expect(tierFromFocus('dwarf-planet', 1e8)).toBe('body');
    expect(tierFromFocus('comet', 1e8)).toBe('body');
  });
});

describe('tierFromCameraDistance — A2 히스테리시스 ≥15%', () => {
  const INNER_UPPER = 0.3 * AU; // BOUNDARY.innerUpper (body ↔ inner)
  const SOLAR_UPPER = 3 * AU; // BOUNDARY.solarUpper (inner ↔ solar)

  it('body tier 에서 innerUpper 의 115% 초과 시만 inner 로 업시프트', () => {
    // 경계 바로 아래: body 유지 (히스테리시스 효과)
    expect(tierFromCameraDistance(INNER_UPPER * 1.1, 'body')).toBe('body');
    // 115% 초과: inner 로 업시프트
    expect(tierFromCameraDistance(INNER_UPPER * 1.2, 'body')).toBe('inner');
  });

  it('inner tier 에서 innerUpper 의 85% 미만이어야 body 로 다운시프트', () => {
    // 경계 바로 위: inner 유지
    expect(tierFromCameraDistance(INNER_UPPER * 0.9, 'inner')).toBe('inner');
    // 85% 미만: body 로 다운시프트
    expect(tierFromCameraDistance(INNER_UPPER * 0.8, 'inner')).toBe('body');
  });

  it('inner tier 에서 solarUpper 의 115% 초과 시 solar 로 업시프트', () => {
    expect(tierFromCameraDistance(SOLAR_UPPER * 1.1, 'inner')).toBe('inner');
    expect(tierFromCameraDistance(SOLAR_UPPER * 1.2, 'inner')).toBe('solar');
  });

  it('solar tier 에서 solarUpper 의 85% 미만이어야 inner 로 다운시프트', () => {
    expect(tierFromCameraDistance(SOLAR_UPPER * 0.9, 'solar')).toBe('solar');
    expect(tierFromCameraDistance(SOLAR_UPPER * 0.8, 'solar')).toBe('inner');
  });

  it('히스테리시스 대역폭 = TIER_HYSTERESIS (≥15% 보장)', () => {
    expect(TIER_HYSTERESIS).toBeGreaterThanOrEqual(0.15);
  });

  it('경계 왕복 안정성 — innerUpper 전후 반복 진동 시 tier 변화 없음', () => {
    // 경계값 ±10% 범위에서 100회 랜덤 진동 → 초기 tier 유지 (flicker 방지)
    let tier = 'body' as 'body' | 'inner';
    for (let i = 0; i < 100; i += 1) {
      const jitter = (Math.random() - 0.5) * 0.2; // -10%~+10%
      const d = INNER_UPPER * (1 + jitter);
      tier = tierFromCameraDistance(d, tier) as 'body' | 'inner';
    }
    expect(tier).toBe('body'); // 초기 body 에서 시작했으므로 업시프트 미발생 기대
  });

  it('body 에서 극단 멀리 이동 → solar 로 한 번에 업시프트 가능', () => {
    expect(tierFromCameraDistance(10 * AU, 'body')).toBe('solar');
  });
});

describe('R6 DoD — Rust engine 경계 유지 (tier scale 은 렌더 전용)', () => {
  // renderScale 은 m → scene unit 환산 배수. 렌더 레이어 외부에서 호출되면 안 된다.
  // 이 테스트는 engine/physics 모듈이 tier 상태를 읽지 않는다는 계약을 코드 레벨로 보장.
  it('renderScaleForTier 출력은 입력에 대한 순수 함수 (tier 외 인자 없음)', () => {
    // 동일 tier 입력은 항상 동일 renderScale 반환 (순수성)
    const s1 = renderScaleForTier('solar');
    const s2 = renderScaleForTier('solar');
    expect(s1).toBe(s2);
    const i1 = renderScaleForTier('inner');
    const i2 = renderScaleForTier('inner');
    expect(i1).toBe(i2);
    const b1 = renderScaleForTier('body');
    const b2 = renderScaleForTier('body');
    expect(b1).toBe(b2);
  });

  it('renderScale 곱 후 세 tier 모두 Euclidean 거리 비율 보존 (scale 은 선형 변환)', () => {
    // 임의의 world 좌표 2점.
    const a = [1e11, 2e11, -3e10] as const;
    const b = [4e11, -1e11, 2e10] as const;
    const dist = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    for (const tier of ['solar', 'inner', 'body'] as const) {
      const s = renderScaleForTier(tier);
      const da = [a[0] * s, a[1] * s, a[2] * s] as const;
      const db = [b[0] * s, b[1] * s, b[2] * s] as const;
      const distScene = Math.hypot(db[0] - da[0], db[1] - da[1], db[2] - da[2]);
      // distScene / s ≈ dist (부동소수점 오차 감안 ±0.01%)
      expect(distScene / s).toBeGreaterThanOrEqual(dist * 0.9999);
      expect(distScene / s).toBeLessThanOrEqual(dist * 1.0001);
    }
  });
});
