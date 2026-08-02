/**
 * #850 Phase 1 — `self-rotation.ts` 순수 함수 단위 테스트.
 *
 * 본 모듈은 `solar-system-scene.ts` 테일에서 순수 이동한 코드로, 이동 전에는 module-private 라
 * 단위 테스트가 0 이었다 (#782 회귀는 브라우저 가드 `verify:782-rotation` 로만 검출).
 * 이동으로 확보된 테스트 가능 표면을 다음 계약으로 고정한다:
 *
 *   (i)  `rotationPeriodHours` 는 항상 **양수 magnitude** — 역행은 `axialTiltDeg` (obliquity > 90°)
 *        에 내재. 음수 period 를 넣어도 방향이 이중 적용되지 않는다 (ADR §A2.3 결정 4 각주 규약 i).
 *   (ii) 자전각은 **jd 순수 함수** — 매 프레임 누적이 아니므로 동일 jd 는 항상 동일 quaternion.
 */
import { describe, expect, it } from 'vitest';
import { Quaternion } from '@babylonjs/core';
import { computeRotationState, computeSpinQuaternion } from './self-rotation.js';
import type { LoadedCelestialBody } from '../ephemeris/solar-system-loader.js';

/** 자전 파라미터만 의미 있는 최소 body stub (본 모듈은 id/radius/orbit 을 읽지 않는다). */
function body(overrides: Partial<LoadedCelestialBody>): LoadedCelestialBody {
  return { id: 'stub', ...overrides } as LoadedCelestialBody;
}

const TWO_PI = 2 * Math.PI;

describe('#782 — computeRotationState (자전 파라미터 산출)', () => {
  it('rotationPeriodHours 미지정 → null (자전 없음, updateAt 루프 전체 skip)', () => {
    expect(computeRotationState(body({}))).toBeNull();
  });

  it('rotationPeriodHours = 0 → null (loader schema 차단 + 방어적 재확인, 0 나눗셈 회피)', () => {
    expect(computeRotationState(body({ rotationPeriodHours: 0 }))).toBeNull();
  });

  it('ω [rad/day] = 2π × 24 / periodHours — 지구 23.9345h 는 항성일 ≈ 6.3004 rad/day', () => {
    const state = computeRotationState(body({ rotationPeriodHours: 23.9345 }))!;
    expect(state.omega).toBeCloseTo((TWO_PI * 24) / 23.9345, 12);
    // 1 항성일 만에 정확히 1회전 (ω × period_day = 2π).
    expect(state.omega * (23.9345 / 24)).toBeCloseTo(TWO_PI, 12);
  });

  it('규약 (i) — 음수 period 는 magnitude 로 흡수 (ω 부호 이중 적용 차단)', () => {
    const positive = computeRotationState(body({ rotationPeriodHours: 24 }))!;
    const negative = computeRotationState(body({ rotationPeriodHours: -24 }))!;
    expect(negative.omega).toBe(positive.omega);
    expect(negative.omega).toBeGreaterThan(0);
  });

  it('axialTiltDeg 미지정 → tiltRad 0 (자전축 = world Y, 기울기 없음)', () => {
    expect(computeRotationState(body({ rotationPeriodHours: 24 }))!.tiltRad).toBe(0);
  });

  it('역행 body — uranus 97.77° / venus 177.36° obliquity 가 tiltRad > π/2 로 보존', () => {
    const uranus = computeRotationState(body({ rotationPeriodHours: 17.24, axialTiltDeg: 97.77 }))!;
    const venus = computeRotationState(
      body({ rotationPeriodHours: 5832.5, axialTiltDeg: 177.36 }),
    )!;
    expect(uranus.tiltRad).toBeCloseTo((97.77 * Math.PI) / 180, 12);
    expect(venus.tiltRad).toBeCloseTo((177.36 * Math.PI) / 180, 12);
    // obliquity > 90° = pole 뒤집힘 = 양수 spin 이 역행으로 보이는 조건 (규약 i 의 방향 SSoT).
    expect(uranus.tiltRad).toBeGreaterThan(Math.PI / 2);
    expect(venus.tiltRad).toBeGreaterThan(Math.PI / 2);
    // 그럼에도 ω 는 양수 magnitude 유지.
    expect(venus.omega).toBeGreaterThan(0);
  });
});

describe('#782 §A2.3 결정 5 — computeSpinQuaternion (jd 순수 함수 자전각)', () => {
  const state = { omega: TWO_PI, tiltRad: 0 }; // 1 day = 1 회전, tilt 없음
  const epoch = 2451545.0; // J2000

  function spin(jd: number, s = state): Quaternion {
    const out = new Quaternion();
    computeSpinQuaternion(jd, epoch, s, new Quaternion(), new Quaternion(), out);
    return out;
  }

  it('jd === epoch → identity quaternion (spinAngle 0, tilt 0)', () => {
    const q = spin(epoch);
    expect(q.x).toBeCloseTo(0, 12);
    expect(q.y).toBeCloseTo(0, 12);
    expect(q.z).toBeCloseTo(0, 12);
    expect(Math.abs(q.w)).toBeCloseTo(1, 12);
  });

  it('결정성 — 동일 jd 재호출은 매 프레임 누적 없이 항상 동일 값 (float drift 0)', () => {
    const jd = epoch + 1234.56789;
    const a = spin(jd);
    const b = spin(jd);
    expect(a.equalsWithEpsilon(b, 0)).toBe(true);
  });

  it('주기성 — 정확히 1주기 뒤 (jd + 1일) 는 시작 자세로 복귀 (mod 2π)', () => {
    const start = spin(epoch);
    const oneTurn = spin(epoch + 1);
    // quaternion 은 q 와 −q 가 동일 회전 — 회전 동치를 |dot| ≈ 1 로 판정.
    const dot =
      start.x * oneTurn.x + start.y * oneTurn.y + start.z * oneTurn.z + start.w * oneTurn.w;
    expect(Math.abs(dot)).toBeCloseTo(1, 9);
  });

  it('1/4 주기 (jd + 0.25일) 는 local Y 축 90° 회전 (spin 축 = pole)', () => {
    const q = spin(epoch + 0.25);
    // sin(π/4) = cos(π/4) ≈ 0.70710678 — Y 성분만 비0 (X/Z 성분 0 = 다른 축 오염 없음).
    expect(q.y).toBeCloseTo(Math.SQRT1_2, 9);
    expect(q.w).toBeCloseTo(Math.SQRT1_2, 9);
    expect(q.x).toBeCloseTo(0, 12);
    expect(q.z).toBeCloseTo(0, 12);
  });

  it('큰 jd 에서도 정밀도 보존 — (jd − epoch) 선뺄셈으로 각 오차 ≤ 1e-6 rad', () => {
    // 100년 후 (36,525일). float64 로 jd 를 먼저 빼지 않으면 유효숫자 손실이 발생하는 구간.
    const days = 36525;
    const q = spin(epoch + days);
    // ω = 2π (정수 회전수) → 100년 후에도 identity 로 복귀해야 한다.
    expect(Math.abs(q.w)).toBeCloseTo(1, 6);
    expect(q.y).toBeCloseTo(0, 6);
  });

  it('tilt 합성 — q = tilt(world X) ∘ spin(local Y), spinAngle 0 이면 tilt 단독', () => {
    const tilted = spin(epoch, { omega: TWO_PI, tiltRad: Math.PI / 2 });
    // X 축 90° 회전 = (sin45, 0, 0, cos45).
    expect(tilted.x).toBeCloseTo(Math.SQRT1_2, 9);
    expect(tilted.w).toBeCloseTo(Math.SQRT1_2, 9);
    expect(tilted.y).toBeCloseTo(0, 12);
    expect(tilted.z).toBeCloseTo(0, 12);
  });

  it('out 파라미터에 결과를 쓰고 tmp 버퍼를 재사용 (매 프레임 alloc 0 계약)', () => {
    const tmpSpin = new Quaternion();
    const tmpTilt = new Quaternion();
    const out = new Quaternion(9, 9, 9, 9);
    computeSpinQuaternion(epoch + 0.5, epoch, state, tmpSpin, tmpTilt, out);
    // 반환값이 아니라 out 파라미터에 기록하는 계약 (sentinel 9,9,9,9 가 덮어써짐).
    expect(out.equalsWithEpsilon(new Quaternion(9, 9, 9, 9), 0)).toBe(false);
    // 동일 tmp 버퍼로 2회 호출해도 결과 오염 없음.
    const out2 = new Quaternion();
    computeSpinQuaternion(epoch + 0.5, epoch, state, tmpSpin, tmpTilt, out2);
    expect(out2.equalsWithEpsilon(out, 1e-15)).toBe(true);
  });
});
