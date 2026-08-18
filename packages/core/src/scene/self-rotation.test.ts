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
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core';
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

/**
 * #1130 — quaternion 을 **성분으로** 단언하지 않는다. 성분 단언은 구현 세부(기준면 보정 등)에
 * 결합돼, 정작 물어야 할 「자전축이 궤도 법선 대비 obliquity 인가」를 검사하지 않는다.
 * 실제로 구 테스트 4건은 성분만 보느라 **전 행성 90° 오정렬을 6주간 통과**시켰다.
 */
function poleOf(q: Quaternion): Vector3 {
  const m = new Matrix();
  Matrix.FromQuaternionToRef(q, m);
  return Vector3.TransformNormal(new Vector3(0, 1, 0), m).normalize();
}
/** 두 단위벡터 사이 각 [deg]. */
function angleDeg(a: Vector3, b: Vector3): number {
  return (Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(a, b)))) * 180) / Math.PI;
}
/** 이 씬의 궤도 법선 — 궤도면이 XY 라 world Z (#1130 실측: 전 행성 |z|/r ≤ 0.07). */
const ORBITAL_NORMAL = new Vector3(0, 0, 1);

describe('#782 §A2.3 결정 5 — computeSpinQuaternion (jd 순수 함수 자전각)', () => {
  const state = { omega: TWO_PI, tiltRad: 0 }; // 1 day = 1 회전, tilt 없음
  const epoch = 2451545.0; // J2000

  function spin(jd: number, s = state): Quaternion {
    const out = new Quaternion();
    computeSpinQuaternion(jd, epoch, s, new Quaternion(), new Quaternion(), out);
    return out;
  }

  it('#1130 — tilt 0 이면 자전축이 **궤도 법선**과 일치 (구 기준은 world Y 였다)', () => {
    const q = spin(epoch);
    // 성분이 아니라 **자전축**을 본다. 보정 전에는 pole 이 world Y(궤도면 안)라 90° 누웠다.
    expect(angleDeg(poleOf(q), ORBITAL_NORMAL)).toBeCloseTo(0, 9);
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

  it('자전은 **자전축을 움직이지 않는다** (spin 축 == pole) — 1/4·1/2 주기', () => {
    // spin 은 pole 주위 회전이므로 pole 자체는 불변이어야 한다. 성분 대신 이 불변식을 본다.
    const p0 = poleOf(spin(epoch));
    for (const dj of [0.25, 0.5, 0.75]) {
      expect(angleDeg(p0, poleOf(spin(epoch + dj)))).toBeCloseTo(0, 9);
    }
  });

  it('큰 jd 에서도 정밀도 보존 — (jd − epoch) 선뺄셈으로 각 오차 ≤ 1e-6 rad', () => {
    // 100년 후 (36,525일). float64 로 jd 를 먼저 빼지 않으면 유효숫자 손실이 발생하는 구간.
    const days = 36525;
    const start = spin(epoch);
    const later = spin(epoch + days);
    // ω = 2π (정수 회전수) → 100년 후에도 **시작 자세**로 복귀해야 한다 (회전 동치 |dot| ≈ 1).
    const dot = start.x * later.x + start.y * later.y + start.z * later.z + start.w * later.w;
    expect(Math.abs(dot)).toBeCloseTo(1, 6);
  });

  it('#1130 — obliquity 는 **궤도 법선에서 재는 각**이다 (9 body 전건)', () => {
    // 「누운 행성」(uranus/venus)이 실제로 눕는지가 판별력의 핵심 — 보정 전 uranus 는 7.77° 로
    // **똑바로 서 보였다**(기대 97.77°). 정상 행성과 역행 행성이 서로 뒤바뀐 형태였다.
    const OBLIQUITY: ReadonlyArray<readonly [string, number]> = [
      ['mercury', 0.034],
      ['venus', 177.36],
      ['earth', 23.44],
      ['mars', 25.19],
      ['jupiter', 3.13],
      ['saturn', 26.73],
      ['uranus', 97.77],
      ['neptune', 28.32],
      ['moon', 6.68],
    ];
    for (const [id, degrees] of OBLIQUITY) {
      const q = spin(epoch, { omega: TWO_PI, tiltRad: (degrees * Math.PI) / 180 });
      // 허용 오차 5e-5° — `acos` 의 수치 오차(실측 최대 1.2e-6°)보다 크고 계약값 ±0.05° 보다
      //   3 자릿수 엄격하다. 6 자리로 조이면 saturn 이 acos 오차만으로 FAIL 한다.
      expect(angleDeg(poleOf(q), ORBITAL_NORMAL), id).toBeCloseTo(degrees, 4);
    }
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
