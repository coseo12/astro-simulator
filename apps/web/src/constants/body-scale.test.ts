import { describe, expect, it } from 'vitest';
import { BODY_SCALE, getBodyScale } from './body-scale';

describe('BODY_SCALE — R1 #329 + R2 #361 + R3 #369 시각 과장 룩업 (Amendment 2026-05-03 라운드 3 D-1)', () => {
  it('sun = 50 (R1 Amendment 2026-05-01 — 75 → 50, 옵션 a, 라운드 1/2/3 보존)', () => {
    expect(BODY_SCALE.sun).toBe(50);
  });

  it('mercury = 700 (R2 Amendment 2026-05-03 라운드 3 — 900 → 700, D-1 사실 비율 강화)', () => {
    expect(BODY_SCALE.mercury).toBe(700);
  });

  it('venus = 800 (R3 Amendment 2026-05-03 라운드 3 — 650 → 800, D-1 사실 비율 강화)', () => {
    expect(BODY_SCALE.venus).toBe(800);
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
