import { describe, expect, it } from 'vitest';
import { BODY_SCALE, getBodyScale } from './body-scale';

describe('BODY_SCALE — R1 #329 + R2 #361 + R3 #369 + R4 #532 + R5 #594 시각 과장 룩업 (Q2=B SSoT)', () => {
  it('sun = 50 (R1 Amendment 2026-05-01 — 75 → 50, 옵션 a, 라운드 1/2/3 보존)', () => {
    expect(BODY_SCALE.sun).toBe(50);
  });

  it('mercury = 700 (R2 Amendment 2026-05-03 라운드 3 — 900 → 700, D-1 사실 비율 강화)', () => {
    expect(BODY_SCALE.mercury).toBe(700);
  });

  it('venus = 800 (R3 Amendment 2026-05-03 라운드 3 — 650 → 800, D-1 사실 비율 강화)', () => {
    expect(BODY_SCALE.venus).toBe(800);
  });

  it('earth = 800 (R4 #532 — venus 동일값, radius 1.054배 사실 비율 정합)', () => {
    expect(BODY_SCALE.earth).toBe(800);
  });

  it('moon = 200 (R4 #539 Amendment 4 — 사실 비율 D-T2 인지 mismatch 후 축소, earth 6.8%)', () => {
    expect(BODY_SCALE.moon).toBe(200);
  });

  it('mars = 800 (R5 #594 — earth 동일값, radius 53.3% 사실 비율 정확 정합, Q2=B 2번째 본 인스턴스화)', () => {
    expect(BODY_SCALE.mars).toBe(800);
  });

  it('phobos = 5000 (R5 #594 — 사실 비율 0.326% 명시 위배, moon Amendment 4 학습 적용)', () => {
    expect(BODY_SCALE.phobos).toBe(5000);
  });

  it('deimos = 5000 (R5 #594 — phobos 동일값, mental model "phobos ≈ deimos")', () => {
    expect(BODY_SCALE.deimos).toBe(5000);
  });

  it('jupiter = 48 (R6 #621 — PM Q2=B 임계 완화 거성 예외, sun 대비 px 비 ~9.87%)', () => {
    expect(BODY_SCALE.jupiter).toBe(48);
  });

  it('io = 100 (R6 #627 옵션 D — 사용자 D-T2 합의 300→200→100, galilean/jupiter 0.053 moon 정합)', () => {
    expect(BODY_SCALE.io).toBe(100);
  });

  it('europa = 100 (R6 #627 옵션 D — io 동일값, 비율 0.046)', () => {
    expect(BODY_SCALE.europa).toBe(100);
  });

  it('ganymede = 100 (R6 #627 옵션 D — 비율 0.077 (moon 0.068 의 1.13배), 태양계 최대 위성)', () => {
    expect(BODY_SCALE.ganymede).toBe(100);
  });

  it('callisto = 100 (R6 #627 옵션 D — 비율 0.070)', () => {
    expect(BODY_SCALE.callisto).toBe(100);
  });

  it('saturn = 48 (R7 #641 — jupiter 동일값 거성 예외 2번째, saturn/jupiter mesh 비 0.843 사실 보존)', () => {
    expect(BODY_SCALE.saturn).toBe(48);
  });

  it('titan = 100 (R7 #641 — galilean 최종값 답습, titan/saturn 비 0.089 moon/earth 0.068 근접)', () => {
    expect(BODY_SCALE.titan).toBe(100);
  });

  it('uranus = 250 (R8 #647 — ice giant 정책 신설 3번째 scale 그룹, PM 제약 uranus > earth 직관)', () => {
    expect(BODY_SCALE.uranus).toBe(250);
  });

  it('titania = 500 (R8 #647 — titania/uranus 비 0.0617 moon/earth 0.068 수렴대 정중앙)', () => {
    expect(BODY_SCALE.titania).toBe(500);
  });

  it('R8 ice giant 정책 — uranus mesh > earth mesh (PM 제약 "천왕성 > 지구" 정량 가드)', () => {
    // ADR 20260610-r8 §축 1 — uranus(2.5559e7 × 250) / earth(6.378137e6 × 800) = 1.252 (1.25 ± 0.05)
    const ratio = (2.5559e7 * BODY_SCALE.uranus!) / (6.378137e6 * BODY_SCALE.earth!);
    expect(ratio).toBeGreaterThan(1.2);
    expect(ratio).toBeLessThan(1.3);
  });

  it('neptune = 250 (R9 #653 — ice giant 정책 답습 2번째 인스턴스, uranus 동일값)', () => {
    expect(BODY_SCALE.neptune).toBe(250);
  });

  it('triton = 300 (R9 #653 — triton/neptune 비 0.0656 moon/earth 0.068 최근접, titania=500 답습 기각)', () => {
    expect(BODY_SCALE.triton).toBe(300);
  });

  it('R9 ice giant 답습 — neptune/uranus px 비 0.969 ± 0.02 (사실 radius 비 자동 보존 — DoD 1 정량 가드)', () => {
    // ADR 20260610-r9 §축 1 — 동일 scale 그룹 내 동일값 답습 시 상대 비율 = 사실 radius 비.
    // neptune(2.4764e7 × 250) / uranus(2.5559e7 × 250) = 0.9689 (R5 mars=earth / R7 saturn=jupiter 동형 3번째).
    const ratio = (2.4764e7 * BODY_SCALE.neptune!) / (2.5559e7 * BODY_SCALE.uranus!);
    expect(ratio).toBeGreaterThan(0.949);
    expect(ratio).toBeLessThan(0.989);
  });

  it('R9 — neptune mesh > earth mesh (neptune/earth 1.21 > 1 직관 유지)', () => {
    // ADR 20260610-r9 §축 1 — neptune(2.4764e7 × 250) / earth(6.378137e6 × 800) = 1.213.
    const ratio = (2.4764e7 * BODY_SCALE.neptune!) / (6.378137e6 * BODY_SCALE.earth!);
    expect(ratio).toBeGreaterThan(1.15);
    expect(ratio).toBeLessThan(1.27);
  });

  it('frozen — 런타임 변경 차단 (시각 정합성 회귀 방지)', () => {
    // Object.freeze 의도 검증 — strict mode 에서 throw, sloppy 에서 silent fail.
    // 어느 모드든 변경이 반영되지 않아야 한다.
    expect(() => {
      // @ts-expect-error — 의도적 잘못된 할당으로 freeze 동작 확인
      BODY_SCALE.sun = 100;
    }).toThrow();
    expect(BODY_SCALE.sun).toBe(50);
  });
});

describe('getBodyScale — 룩업 헬퍼', () => {
  it('정의된 body 는 룩업값 반환', () => {
    expect(getBodyScale('sun')).toBe(50);
    expect(getBodyScale('mercury')).toBe(700);
    expect(getBodyScale('venus')).toBe(800);
    expect(getBodyScale('earth')).toBe(800);
    expect(getBodyScale('moon')).toBe(200);
    expect(getBodyScale('mars')).toBe(800); // R5 #594
    expect(getBodyScale('phobos')).toBe(5000); // R5 #594
    expect(getBodyScale('deimos')).toBe(5000); // R5 #594
    expect(getBodyScale('jupiter')).toBe(48); // R6 #621
    expect(getBodyScale('io')).toBe(100); // R6 #627 옵션 D (300→200→100, D-T2 합의)
    expect(getBodyScale('europa')).toBe(100); // R6 #627 옵션 D
    expect(getBodyScale('ganymede')).toBe(100); // R6 #627 옵션 D
    expect(getBodyScale('callisto')).toBe(100); // R6 #627 옵션 D
    expect(getBodyScale('saturn')).toBe(48); // R7 #641 — jupiter 동일값 (거성 예외 2번째)
    expect(getBodyScale('titan')).toBe(100); // R7 #641 — galilean 답습
    expect(getBodyScale('uranus')).toBe(250); // R8 #647 — ice giant 정책 신설
    expect(getBodyScale('titania')).toBe(500); // R8 #647 — moon/earth 수렴대
    expect(getBodyScale('neptune')).toBe(250); // R9 #653 — ice giant 답습 2번째
    expect(getBodyScale('triton')).toBe(300); // R9 #653 — moon/earth 수렴대 (역행 위성 첫 사례 — scale 은 궤도 방향 무관)
  });

  it('미정의 body 는 default 1.0 반환 (실측 그대로)', () => {
    expect(getBodyScale('pluto')).toBe(1.0); // R10 진입 전
    expect(getBodyScale('unknown')).toBe(1.0);
  });

  it('빈 문자열 / 특수 케이스도 default 폴백', () => {
    expect(getBodyScale('')).toBe(1.0);
  });
});
