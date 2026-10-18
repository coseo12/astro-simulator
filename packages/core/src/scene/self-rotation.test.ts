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
import {
  computeRotationState,
  computeSpinAngle,
  computeSpinQuaternion,
  earthRotationAngle,
  EARTH_ORIENTATION_BODY_ID,
  ORBITAL_NORMAL_OFFSET,
  type RotationState,
} from './self-rotation.js';
import { RING_DISC_BASE_TILT_X } from './ring-shader.js';
import { getSolarSystem, type LoadedCelestialBody } from '../ephemeris/solar-system-loader.js';
import { heliocentricPositionAt } from '../physics/body-chain.js';
import { isoToJulianDate } from '../time/julian-date.js';

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
/**
 * 이 씬의 **기준 궤도 법선** — world Z (#1130).
 *
 * 근거는 측정이 아니라 **구조**다: `physics/state-vector.ts` 가 `z = sinI · y₁` 로 궤도면을 만들어,
 * inclination `0` 이면 `z ≡ 0` 이다. 즉 기준 궤도면(황도)은 **XY** 이고 씬은 이 좌표의 z 부호만 뒤집어
 * 넣는다 (#1366 장면 경계 `S_z` — XY 평면과 Z 축은 그대로, 황도 북극이 장면 `−Z` 쪽).
 *
 * ⚠️ 엄밀히는 **황도** 법선이라 body 자기 궤도면과는 inclination 만큼 다르다 (mercury `7.005°` /
 * moon `5.145°`). obliquity 를 「자기 궤도면 기준」으로 재려면 body 별 법선이 필요하다 — 그건
 * #1130 범위 밖이고, 현재 데이터의 `axialTiltDeg` 도 NASA "obliquity to orbit" 값이라 이 근사와
 * 같은 계열이다.
 */
const ORBITAL_NORMAL = new Vector3(0, 0, 1);

describe('#782 §A2.3 결정 5 — computeSpinQuaternion (jd 순수 함수 자전각)', () => {
  /** IAU obliquity (deg) — 자전하는 9 body 전건. 두 불변식(obliquity · ring 정합)이 공유한다. */
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

  it('#1130 — ring 평면이 적도면과 일치한다 (body ↔ ring 짝 불변식, 9 body 전건)', () => {
    // ⚠️ 이 테스트가 없으면 ring 쪽 상수만 되돌려도 **845 전건이 초록**이다 (reviewer 변이 M3 실측).
    // body 의 `ORBITAL_NORMAL_OFFSET` 과 ring 의 `RING_DISC_BASE_TILT_X` 는 **짝**이고, 둘의 차 π/2 는
    // disc local 법선(+Z) 과 body pole(local +Y) 의 축 차이를 메운다. 한쪽만 옮기면 여기서 깨진다.
    //
    // 판정은 **평면 일치** `|cos| == 1` 이다. disc 는 양면이라 법선의 **부호는 물리적 의미가 없고**,
    // 이 정렬에서 실제로는 pole 의 반대 방향(180°)이 나온다.
    for (const [, degrees] of OBLIQUITY) {
      const tiltRad = (degrees * Math.PI) / 180;
      const pole = poleOf(spin(epoch, { omega: TWO_PI, tiltRad }));
      // ring disc: local 법선 +Z 를 `disc.rotation.x` 가 만드는 **실제 Babylon 변환**으로 옮긴다.
      // ⚠️ 손유도식(`(0, −sinθ, cosθ)`)을 쓰지 않는 이유 — 그 식은 Babylon 의 회전 규약이 바뀌어도
      // 눈이 먼다. 실제 행렬을 쓰면 파이프라인 변경이 여기서 드러난다 (cross-validate 권고 2).
      // 실측상 두 경로의 차는 ≤ 2.1e-8 (Babylon `Matrix` 가 float32) 이라 판정에는 영향이 없다.
      const theta = RING_DISC_BASE_TILT_X + tiltRad;
      const ringNormal = Vector3.TransformNormal(
        new Vector3(0, 0, 1),
        Matrix.RotationX(theta),
      ).normalize();
      expect(Math.abs(Vector3.Dot(pole, ringNormal))).toBeCloseTo(1, 7);
    }
  });

  it('#1130 — 두 기준 상수의 차는 정확히 π/2 (축 차이 — disc +Z vs pole +Y)', () => {
    // 위 불변식이 성립하는 **이유**를 직접 고정한다. 값 자체가 아니라 **관계**가 계약이다.
    expect(RING_DISC_BASE_TILT_X - ORBITAL_NORMAL_OFFSET).toBeCloseTo(Math.PI / 2, 12);
  });

  it('#1130 — obliquity 는 **궤도 법선에서 재는 각**이다 (9 body 전건)', () => {
    // 「누운 행성」(uranus/venus)이 실제로 눕는지가 판별력의 핵심 — 보정 전 uranus 는 7.77° 로
    // **똑바로 서 보였다**(기대 97.77°). 정상 행성과 역행 행성이 서로 뒤바뀐 형태였다.
    // #1362 — state 를 **실제 id 로** 만든다 (지구는 `computeRotationState` 가 지구 방향 모델을 붙인다).
    for (const [id, degrees] of OBLIQUITY) {
      const s = computeRotationState(body({ id, rotationPeriodHours: 24, axialTiltDeg: degrees }))!;
      const q = spin(epoch, s);
      // #1362 — 지구만 local `+Y` (마스크 북극) 가 장면 `−Z` 쪽이다 (= 데이터 `+Z` 쪽, 실제 천구 북극 — #1366 `S_z`).
      //   그래서 지구는 장면 `+Z` 에서 `180° − ε` 이고, 자전 **각속도** 축은 아래 테스트가 장면 `+Z` 쪽임을 단언한다.
      const expected = id === EARTH_ORIENTATION_BODY_ID ? 180 - degrees : degrees;
      // 허용 오차 5e-5° — `acos` 의 수치 오차(실측 최대 1.2e-6°)보다 크고 계약값 ±0.05° 보다
      //   3 자릿수 엄격하다. 6 자리로 조이면 saturn 이 acos 오차만으로 FAIL 한다.
      expect(angleDeg(poleOf(q), ORBITAL_NORMAL), id).toBeCloseTo(expected, 4);
    }
  });

  it('#1362 — 자전 **각속도** 축은 지구도 obliquity 만큼 기운 `+Z` 쪽 (감기 방향이 순행 body 와 같다)', () => {
    // 지구는 local `+Y` 를 뒤집고 spin 부호도 뒤집었다 (`tilt(ε − π/2) ∘ spin(−ERA)`). 둘이 짝이라
    // 각속도 벡터는 일반 식과 같은 쪽에 남는다 — 하나만 바꾸면 여기서 깨진다.
    const spinAxisAt = (s: RotationState, jd: number): Vector3 => {
      const q0 = spin(jd, s);
      const q1 = spin(jd + 0.01, s);
      // world 상대 회전 R1 ∘ R0⁻¹ (Babylon `A.multiply(B)` = B 먼저). q 와 −q 동치라 w ≥ 0 으로 정규화.
      const rel = q1.multiply(Quaternion.Inverse(q0));
      const sign = rel.w < 0 ? -1 : 1;
      return new Vector3(rel.x * sign, rel.y * sign, rel.z * sign).normalize();
    };
    const mars = computeRotationState(
      body({ id: 'mars', rotationPeriodHours: 24.6229, axialTiltDeg: 25.19 }),
    )!;
    const earth = computeRotationState(
      body({ id: EARTH_ORIENTATION_BODY_ID, rotationPeriodHours: 23.9345, axialTiltDeg: 23.44 }),
    )!;
    const jd = epoch + 8000.25;
    expect(angleDeg(spinAxisAt(mars, jd), ORBITAL_NORMAL)).toBeCloseTo(25.19, 3);
    expect(angleDeg(spinAxisAt(earth, jd), ORBITAL_NORMAL)).toBeCloseTo(23.44, 3);
    // 지구의 각속도 축은 #1362 이전 일반 식의 pole (`(0, −sin ε, cos ε)`) 과 같은 방향이다.
    const legacy = computeRotationState(
      body({ rotationPeriodHours: 23.9345, axialTiltDeg: 23.44 }),
    )!;
    expect(angleDeg(spinAxisAt(earth, jd), poleOf(spin(jd, legacy)))).toBeCloseTo(0, 3);
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

/**
 * #1362 — 지구 방향 (자전축 방향 + 실제 시각 자전 위상). ADR `20260628-756` §Amendment 13.
 *
 * 장면 mesh 없이 **quaternion + 태양 방향**으로 태양 직하점을 계산해 실제 천문력 값과 비교한다.
 *  - 태양 방향: 장면 Kepler 경로와 같은 함수 (`heliocentricPositionAt` — 태양 = 원점) 의 지구 위치 반대 방향.
 *  - 직하점: 태양 방향을 지구 local 로 되돌려 마스크 규약 (local `+Y` = 북극, `+X` = 경도 0°, `+Z` = 경도
 *    90°E — `procedural-planet-shader.ts` UV · `surface-mask-texture.ts` `invertY=false`) 으로 읽는다.
 *
 * 기준값 출처 — Meeus, _Astronomical Algorithms_ 2판: 25장 (태양 겉보기 위치 · 저정밀 식) + 12장 식 12.4
 * (그리니치 평균 항성시) + 22장 (장동 · 분점차) 으로 계산한 직하점 (#1362 Phase 0, 코멘트 6245464331).
 * 2017-08-21 적위 `11.860°` 은 NASA 개기일식 자료의 태양 적위 `11.862°` 와 교차 확인했다.
 *
 * 허용오차 `±0.2°` (사용자 확정) — 장면 식은 J2000 고정 극 (세차 무시) + ERA (분점차 무시) 근사이고,
 * 2000~2030 일 단위 표본에서 위도 잔차 최대 `0.196°` (2030년) 다 — ADR `20260628-756` §A13.6.
 */
describe('#1362 — 지구 방향: 태양 직하점이 실제 천문력과 일치', () => {
  const TOLERANCE_DEG = 0.2;
  const system = getSolarSystem();
  const bodiesById = new Map(system.bodies.map((b) => [b.id, b]));
  const earthBody = bodiesById.get(EARTH_ORIENTATION_BODY_ID)!;
  const earthState = computeRotationState(earthBody)!;

  /** 지구 local 에서 본 태양 방향의 위도·경도 [deg] (경도 −180~180, 동경 +). */
  function subsolarPoint(jd: number): { lat: number; lon: number } {
    const q = new Quaternion();
    computeSpinQuaternion(jd, system.epoch, earthState, new Quaternion(), new Quaternion(), q);
    const pos = heliocentricPositionAt(bodiesById, EARTH_ORIENTATION_BODY_ID, jd)!;
    const sunWorld = new Vector3(-pos[0], -pos[1], -pos[2]).normalize();
    const world = new Matrix();
    Matrix.FromQuaternionToRef(q, world);
    const local = Vector3.TransformNormal(sunWorld, world.invert()).normalize();
    return {
      lat: (Math.asin(local.y) * 180) / Math.PI,
      lon: (Math.atan2(local.z, local.x) * 180) / Math.PI,
    };
  }
  /** 경도 차 [deg] 를 −180~180 으로. */
  const lonDiff = (a: number, b: number): number => ((((a - b) % 360) + 540) % 360) - 180;

  // [라벨, UT ISO, 기준 위도, 기준 경도] — 출처는 describe 주석.
  const REFERENCE: ReadonlyArray<readonly [string, string, number, number]> = [
    ['2024 하지', '2024-06-20T20:51:00Z', 23.439, -132.302],
    ['2024 동지', '2024-12-21T09:20:00Z', -23.439, 39.565],
    ['2017-08-21 개기일식 최대', '2017-08-21T18:26:40Z', 11.86, -95.91],
    ['2024-04-08 개기일식 최대', '2024-04-08T18:17:16Z', 7.593, -93.905],
  ];

  it('computeRotationState(earth) 는 지구 방향 모델을 붙인다 (다른 body 는 붙이지 않는다)', () => {
    expect(earthState.orientation).toBeDefined();
    for (const b of system.bodies) {
      if (b.id === EARTH_ORIENTATION_BODY_ID) continue;
      const s = computeRotationState(b);
      if (s) expect(Object.keys(s).sort(), b.id).toEqual(['omega', 'tiltRad']);
    }
  });

  for (const [label, iso, refLat, refLon] of REFERENCE) {
    it(`${label} (${iso}) — 직하점 위도 ${refLat}° · 경도 ${refLon}° (±${TOLERANCE_DEG}°)`, () => {
      const { lat, lon } = subsolarPoint(isoToJulianDate(iso));
      expect(Math.abs(lat - refLat), `위도 ${lat}`).toBeLessThanOrEqual(TOLERANCE_DEG);
      expect(Math.abs(lonDiff(lon, refLon)), `경도 ${lon}`).toBeLessThanOrEqual(TOLERANCE_DEG);
    });
  }

  it('직하점 경도는 서쪽으로 ≈ 15°/h 움직인다 (지표가 서→동 자전 — 태양이 동쪽에서 뜬다)', () => {
    // 평균 태양일 24h 에 360° — 항성 자전 `15.041°/h` 에서 태양의 겉보기 이동 `0.041°/h` 를 뺀 값.
    // 균시차 변화가 하루 `±30 s` 이내라 1시간 율은 ±0.01°/h 안이다.
    const MEAN_SOLAR_RATE_DEG_PER_HOUR = -15;
    const RATE_TOLERANCE = 0.02;
    for (const [, iso] of REFERENCE) {
      const jd = isoToJulianDate(iso);
      const rate = lonDiff(subsolarPoint(jd + 1 / 24).lon, subsolarPoint(jd).lon);
      expect(
        Math.abs(rate - MEAN_SOLAR_RATE_DEG_PER_HOUR),
        `${iso} 율 ${rate}`,
      ).toBeLessThanOrEqual(RATE_TOLERANCE);
    }
  });

  it('earthRotationAngle — J2000.0 에서 2π × 0.7790572732640 (IERS 2010 식 5.15), 값역 [0, 2π)', () => {
    expect(earthRotationAngle(2451545.0)).toBeCloseTo(2 * Math.PI * 0.779057273264, 12);
    for (const jd of [2451545.0 - 40_000.3, 2451545.0, 2460000.123, 2470000.9]) {
      const a = earthRotationAngle(jd);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(2 * Math.PI);
    }
    // 1 UT1 일에 1.00273781191135448 회전 — 하루 뒤 각 증가분 = 0.00273781191135448 회전.
    const d = earthRotationAngle(2460000.5) - earthRotationAngle(2459999.5);
    expect(d / (2 * Math.PI)).toBeCloseTo(0.00273781191135448, 9);
  });

  it('지구 외 body 의 자전 quaternion 은 #1362 이전 식과 **비트 동일** (실제 데이터 · 여러 시각)', () => {
    // #1362 이전 `computeSpinQuaternion` 본문을 그대로 재구성한다 (같은 연산 · 같은 순서 → 같은 비트).
    const legacy = (jd: number, s: RotationState): Quaternion => {
      const tmpSpin = new Quaternion();
      const tmpTilt = new Quaternion();
      const out = new Quaternion();
      Quaternion.RotationAxisToRef(
        new Vector3(0, 1, 0),
        computeSpinAngle(jd, system.epoch, s.omega),
        tmpSpin,
      );
      Quaternion.RotationAxisToRef(
        new Vector3(1, 0, 0),
        ORBITAL_NORMAL_OFFSET + s.tiltRad,
        tmpTilt,
      );
      tmpTilt.multiplyToRef(tmpSpin, out);
      return out;
    };
    let compared = 0;
    for (const b of system.bodies) {
      if (b.id === EARTH_ORIENTATION_BODY_ID) continue;
      const s = computeRotationState(b);
      if (!s) continue;
      for (const jd of [system.epoch, 2451545.37, 2460390.25, 2462000.75]) {
        const now = new Quaternion();
        computeSpinQuaternion(jd, system.epoch, s, new Quaternion(), new Quaternion(), now);
        const was = legacy(jd, s);
        expect([now.x, now.y, now.z, now.w], `${b.id} @ ${jd}`).toEqual([
          was.x,
          was.y,
          was.z,
          was.w,
        ]);
        compared++;
      }
    }
    // 빈 표본 공허 통과 차단 — 자전하는 지구 외 body 가 실제로 비교됐다.
    expect(compared).toBeGreaterThanOrEqual(8 * 4);
  });
});
