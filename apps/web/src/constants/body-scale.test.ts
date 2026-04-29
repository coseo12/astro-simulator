import { describe, expect, it } from 'vitest';
import { BODY_SCALE, getBodyScale } from './body-scale';

describe('BODY_SCALE — R1 #329 + R2 #361 + R3 #369 + #373 Amendment 시각 과장 룩업', () => {
  it('sun = 75 (R1 baseline — 보존)', () => {
    expect(BODY_SCALE.sun).toBe(75);
  });

  it('mercury = 2500 (#373 옵션 (c) Q2=B 비례 결정 — 8500 → 2500)', () => {
    // ADR `20260428-r2-mercury-visualization.md` §Amendment 2026-04-30
    // ADR `20260430-r3-followup-body-proportion.md` §결정 2 §1
    // 사용자 D-T2 검증 후 ±20% 조정 가능 — 단, 본 단위 테스트는 박제값 정확 일치 강제
    expect(BODY_SCALE.mercury).toBe(2500);
  });

  it('venus = 1850 (#373 옵션 (c) Q2=B 비례 결정 — 4000 → 1850)', () => {
    // ADR `20260429-r3-venus-visualization.md` §Amendment 2026-04-30
    // ADR `20260430-r3-followup-body-proportion.md` §결정 2 §1
    expect(BODY_SCALE.venus).toBe(1850);
  });

  it('frozen — 런타임 변경 차단 (시각 정합성 회귀 방지)', () => {
    // Object.freeze 의도 검증 — strict mode 에서 throw, sloppy 에서 silent fail.
    // 어느 모드든 변경이 반영되지 않아야 한다.
    expect(() => {
      // @ts-expect-error — 의도적 잘못된 할당으로 freeze 동작 확인
      BODY_SCALE.sun = 100;
    }).toThrow();
    expect(BODY_SCALE.sun).toBe(75);
  });
});

describe('Q2=B 비례 결정 가드 — body 가 sun 대비 절대 mesh wsR 의 ≤ 50% 유지', () => {
  // ADR `20260430-r3-followup-body-proportion.md` §결정 2 §4 (PM Q2 정책 amendment)
  // 본 가드는 BODY_SCALE 값만으로 산출 가능한 1차 가드 — 정확한 px diameter 비는
  // r1-guard `--measure-px-ratio` 가 동적 측정 (renderScale × camera × radius 결합).
  //
  // 전제: solar-system.json 의 body.radius 와 BODY_SCALE 의 곱 (절대 mesh radius proxy) 이
  // sun 의 50% 를 넘으면 시각 비율 회귀 위험. R4+ 추가 시 본 가드가 첫 알람.
  // 정확한 비율 임계 (mercury ≤ 25%, venus ≤ 30%) 은 r1-guard 의무.

  // solar-system.json 박제값 (m). 본 테스트가 `apps/web` 레이어이므로 inline.
  const BODY_RADIUS_M = {
    sun: 6.957e8,
    mercury: 2.4397e6,
    venus: 6.0518e6,
  } as const;

  function absoluteMeshRadiusProxy(bodyId: keyof typeof BODY_RADIUS_M): number {
    // BODY_SCALE 은 `Record<string, number>` 형식이라 strict mode 에서 `| undefined` —
    // 본 테스트는 sun/mercury/venus 가 박제값으로 존재함을 단위 테스트 위에서 보장.
    const scale = BODY_SCALE[bodyId];
    if (typeof scale !== 'number') {
      throw new Error(
        `BODY_SCALE.${bodyId} 부재 — body-scale.ts 와 본 테스트의 박제값 동기화 누락`,
      );
    }
    return BODY_RADIUS_M[bodyId] * scale;
  }

  it('mercury 절대 mesh radius proxy 는 sun 의 ≤ 50% 유지', () => {
    const sunR = absoluteMeshRadiusProxy('sun');
    const mercuryR = absoluteMeshRadiusProxy('mercury');
    const ratio = mercuryR / sunR;
    // 박제값 mercury=2500 / sun=75 시 산출: (2.44e6 × 2500) / (6.957e8 × 75) ≈ 0.117
    expect(ratio).toBeLessThanOrEqual(0.5);
  });

  it('venus 절대 mesh radius proxy 는 sun 의 ≤ 50% 유지', () => {
    const sunR = absoluteMeshRadiusProxy('sun');
    const venusR = absoluteMeshRadiusProxy('venus');
    const ratio = venusR / sunR;
    // 박제값 venus=1850 / sun=75 시 산출: (6.05e6 × 1850) / (6.957e8 × 75) ≈ 0.215
    expect(ratio).toBeLessThanOrEqual(0.5);
  });

  it('venus > mercury (과학적 사실 정합 — 금성이 수성보다 큼)', () => {
    // 박제값 변경 시 자연 검증 — Q2=B 비례 결정도 절대 크기 순서는 보존해야 함
    expect(absoluteMeshRadiusProxy('venus')).toBeGreaterThan(absoluteMeshRadiusProxy('mercury'));
  });
});

describe('getBodyScale — 룩업 헬퍼', () => {
  it('정의된 body 는 룩업값 반환', () => {
    expect(getBodyScale('sun')).toBe(75);
    expect(getBodyScale('mercury')).toBe(2500);
    expect(getBodyScale('venus')).toBe(1850);
  });

  it('미정의 body 는 default 1.0 반환 (실측 그대로)', () => {
    expect(getBodyScale('earth')).toBe(1.0);
    expect(getBodyScale('jupiter')).toBe(1.0);
    expect(getBodyScale('unknown')).toBe(1.0);
  });

  it('빈 문자열 / 특수 케이스도 default 폴백', () => {
    expect(getBodyScale('')).toBe(1.0);
  });
});
