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

  it('io = 200 (R6 #627 옵션 D — 300→200 moon 정합, galilean/jupiter 0.106)', () => {
    expect(BODY_SCALE.io).toBe(200);
  });

  it('europa = 200 (R6 #627 옵션 D — io 동일값 moon=galilean=200 mental model)', () => {
    expect(BODY_SCALE.europa).toBe(200);
  });

  it('ganymede = 200 (R6 #627 옵션 D — 비율 0.1535 ≤ 0.16 binding, 태양계 최대 위성)', () => {
    expect(BODY_SCALE.ganymede).toBe(200);
  });

  it('callisto = 200 (R6 #627 옵션 D — 비율 0.140)', () => {
    expect(BODY_SCALE.callisto).toBe(200);
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
    expect(getBodyScale('io')).toBe(200); // R6 #627 옵션 D (300→200)
    expect(getBodyScale('europa')).toBe(200); // R6 #627 옵션 D
    expect(getBodyScale('ganymede')).toBe(200); // R6 #627 옵션 D
    expect(getBodyScale('callisto')).toBe(200); // R6 #627 옵션 D
  });

  it('미정의 body 는 default 1.0 반환 (실측 그대로)', () => {
    expect(getBodyScale('saturn')).toBe(1.0); // R7 진입 전
    expect(getBodyScale('titan')).toBe(1.0); // R7 satellite 진입 전
    expect(getBodyScale('unknown')).toBe(1.0);
  });

  it('빈 문자열 / 특수 케이스도 default 폴백', () => {
    expect(getBodyScale('')).toBe(1.0);
  });
});
