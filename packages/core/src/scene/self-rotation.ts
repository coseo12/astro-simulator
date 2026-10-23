/**
 * #782 §A2 — self-rotation (자전) 순수 함수 모듈.
 *
 * #850 Phase 1 — `solar-system-scene.ts` 테일에서 **순수 이동** (동작·값 변경 0).
 * 이동 전 위치: `solar-system-scene.ts` 2042-2112. 클로저 참조 0 (전부 순수 함수).
 *
 * ADR `docs/decisions/20260628-756-procedural-planet-surface.md` **§Amendment 2** (#782) 및
 * **§Amendment 5** (#1130 — 기준면 정정).
 * ⚠️ 구 주석은 `20260701-782-self-rotation.md` 를 가리켰으나 **그 파일은 존재한 적이 없다**
 *   (dead reference — #1130 에서 발견). `.ts` 는 `verify-docs-links` 스캔 모집단 밖이라 잡히지 않았다.
 */
import { Quaternion, Vector3 } from '@babylonjs/core';
import {
  EARTH_ROTATION_ANGLE_AT_J2000_TURNS,
  EARTH_ROTATION_ANGLE_RATE_TURNS_PER_DAY,
  J2000_JD,
} from '@astro-simulator/shared';
import type { LoadedCelestialBody } from '../ephemeris/solar-system-loader.js';

// ─────────────────────────────────────────────────────────────────────────────
// #782 §A2 — self-rotation (자전) 인프라.
//
// 자전각 = jd 순수 함수 (`spinAngle(jd) = ((jd − epoch) × ω) mod 2π`, ADR §A2.3 결정 5). 매 프레임
// 누적 금지 — frame-rate 독립·float drift 0·timeScale 자동 연동·결정적 재현 (`?t=<jd>&speed=0`).
//
// 규약 (i) (ADR §A2.3 결정 4 각주): `rotationPeriodHours` 는 항상 양수 magnitude. 자전 방향(역행)은
// `axialTiltDeg` (IAU obliquity, 0~180) 에 내재 — uranus 97.77°/venus 177.36° 처럼 obliquity>90 이면
// pole 이 뒤집혀 양수 spin 이 역행으로 보인다. period 부호를 음수로 주면 방향이 이중 적용되어 뒤집힌다.
//
// 축 방위각 (azimuth) 은 world X 고정 근사 — tilt 는 X 축 주위 회전. ring disc 의
// `rotation.x = RING_DISC_BASE_TILT_X + tiltRad` 와 **같은 축**이라 ring 평면이 적도면과 일치한다
// (`|cos(pole, ringNormal)| == 1` — `self-rotation.test.ts` §ring 정합 이 9 body 전건 단언).
// ⚠️ 두 상수는 값이 다르다 (π vs π/2) — 차 π/2 는 disc local 법선(+Z) 과 pole(local +Y) 의 축
// 차이다. 그리고 이 정렬에서 ring 법선은 pole 의 **반대 방향**(180°)이나, disc 는 양면이라
// 부호는 물리적 의미가 없고 평면 일치만이 계약이다.
// ⚠️ 방위각 근사는 #1130 의 범위 밖 — 그쪽은 기준「면」만 고쳤다.
// ─────────────────────────────────────────────────────────────────────────────

/** #782 — body 별 자전 파라미터 (데이터에서 1회 산출, 매 프레임 재계산 회피). */
export interface RotationState {
  /** 각속도 ω [rad/day] = 2π × 24 / rotationPeriodHours (양수 — 방향은 tiltRad 에 내재, 규약 i). */
  omega: number;
  /** 자전축 기울기 [rad] (axialTiltDeg — obliquity, X 축 주위. 0~π 범위). */
  tiltRad: number;
  /**
   * #1362 — 지구 전용 방향 모델 표지. 있으면 `computeSpinQuaternion` 이 `computeEarthOrientationQuaternion`
   * 으로 분기한다 (`omega` · epoch 는 쓰지 않는다 — 위상은 ERA 식이 정한다). 지구 외 body 는 이 필드가
   * **없다** (#1362 이전 객체와 같은 모양 — 값 불변).
   */
  orientation?: typeof EARTH_ORIENTATION_MODEL;
}

/**
 * #1362 — 실제 시각 기준 방향 (ERA) 을 쓰는 body. 지구 하나다 (ERA 는 정의상 지구 자전각이다).
 * `cloud-layer.ts` 의 `CLOUD_LAYER_BODY_ID` 와 같은 「body id 상수」 규약.
 */
export const EARTH_ORIENTATION_BODY_ID = 'earth';

/** #1362 — `RotationState.orientation` 값 (지구 전용 방향 모델). */
export const EARTH_ORIENTATION_MODEL = 'earth-era';

/**
 * #782 — body 데이터에서 자전 파라미터 산출. `rotationPeriodHours` 미지정 시 null (자전 없음).
 * ⚠️ 지구 (`EARTH_ORIENTATION_BODY_ID`) 만 `orientation` 표지가 붙는다 (#1362 — ERA 방향 모델).
 * 규약 (i): ω 는 양수 magnitude (방향은 tiltRad 에 내재). loader schema 가 0 을 차단하나 방어적 재확인.
 */
export function computeRotationState(body: LoadedCelestialBody): RotationState | null {
  const periodHours = body.rotationPeriodHours;
  if (periodHours === undefined || periodHours === 0) return null;
  // ω [rad/day] = 2π / (period_h / 24). period 는 양수 magnitude — Math.abs 로 방어 (음수 데이터가
  // 실수로 들어와도 방향은 tiltRad(obliquity) 가 결정하므로 magnitude 만 사용, 이중 적용 차단).
  const omega = (2 * Math.PI * 24) / Math.abs(periodHours);
  const tiltRad = ((body.axialTiltDeg ?? 0) * Math.PI) / 180;
  // #1362 — 지구만 실제 시각 방향 모델. 다른 body 는 필드를 붙이지 않는다 (객체 모양 · 값 불변).
  if (body.id === EARTH_ORIENTATION_BODY_ID) {
    return { omega, tiltRad, orientation: EARTH_ORIENTATION_MODEL };
  }
  return { omega, tiltRad };
}

/**
 * #1215 §A10.8 — jd 순수 함수 회전각 `((jd − epoch) × ω) mod 2π` [rad] (식 SSoT).
 *
 * `computeSpinQuaternion` (host 자전) 과 구름 상대 자전 (`cloud-layer.ts`) 이 **함께 호출**한다 —
 * 같은 식의 사본 2벌은 숨은 상수 drift 클래스다 (volt #69). #1215 에서 `computeSpinQuaternion`
 * 본문의 식을 **값 불변으로** 이동했다 (증거: 기존 `self-rotation.test.ts` 무수정 통과).
 *
 * (jd − epoch) 뺄셈을 float64 로 먼저 한다 (큰 수 − 큰 수 = 작은 수 → 정밀도 보존). 매 프레임 누적
 * 금지 (ADR §A2.3 결정 5). 음수 `(jd − epoch)` 는 음수 각을 내며, 그것은 유효한 회전이고 `0` 을
 * 지날 때 연속이다 (ADR §A10.16 기각 근거).
 *
 * @param jd 현재 Julian Date
 * @param epoch 기준 epoch (JD) — 각 0 기준
 * @param omega 각속도 [rad/day]
 */
export function computeSpinAngle(jd: number, epoch: number, omega: number): number {
  return ((jd - epoch) * omega) % (2 * Math.PI);
}

/**
 * #782 §A2.3 결정 5 — jd 순수 함수 자전각 → `tilt(axialTilt) ∘ spin(spinAngle)` quaternion.
 * ⚠️ 지구 (`state.orientation` 보유) 는 `computeEarthOrientationQuaternion` 으로 분기한다 (#1362 — epoch · ω 미사용).
 *
 * `spinAngle = ((jd − epoch) × ω) mod 2π` (float64 CPU — jd 큰 수 뺄셈을 먼저 수행해 정밀도 보존,
 * cross-validate Q3 실측 ≤ 3.1e-8° 오차). `q = tilt.multiply(spin)` = spin(local Y) 먼저 적용 후
 * tilt(X) — pole 을 tiltRad 만큼 기울인 뒤 그 (기운) 축 주위로 자전 (Babylon multiply 순서: A.multiply(B)
 * 는 B 를 먼저 적용). tmpSpin/tmpTilt 재사용으로 매 프레임 alloc 0 (cross-validate 고유 발견 1).
 *
 * @param jd 현재 Julian Date
 * @param epoch 기준 epoch (JD) — spinAngle 0 기준
 * @param state 자전 파라미터
 * @param tmpSpin 재사용 spin quaternion 버퍼
 * @param tmpTilt 재사용 tilt quaternion 버퍼
 * @param out 결과를 기록할 quaternion (mesh.rotationQuaternion)
 */
export function computeSpinQuaternion(
  jd: number,
  epoch: number,
  state: RotationState,
  tmpSpin: Quaternion,
  tmpTilt: Quaternion,
  out: Quaternion,
): void {
  // #1362 — 지구는 실제 시각 방향 (ERA). 다른 body 는 아래 식 그대로 (값 불변).
  if (state.orientation === EARTH_ORIENTATION_MODEL) {
    computeEarthOrientationQuaternion(jd, state.tiltRad, tmpSpin, tmpTilt, out);
    return;
  }
  // (jd − epoch) 뺄셈을 float64 로 먼저 (큰 수 − 큰 수 = 작은 수) → mod 2π 로 각 누적 없이 결정적.
  const spinAngle = computeSpinAngle(jd, epoch, state.omega);
  // spin: local Y (자전축) 주위. tilt: world X 주위.
  Quaternion.RotationAxisToRef(ROT_SPIN_AXIS, spinAngle, tmpSpin);
  // ⚠️ **`+ π/2` 가 기준면 보정이다** (#1130). obliquity 는 **궤도 법선**에서 재는 각인데, 이
  // 씬의 기준 궤도면은 XY 라 궤도 법선은 **world Z** 다 (근거는 측정이 아니라 구조 —
  // `physics/state-vector.ts` 의 `z = sinI · y₁` 이 inclination 0 에서 `z ≡ 0` 을 보장하고,
  // 씬은 이 좌표의 z 부호만 뒤집어 넣는다 — #1366 `S_z` 라 XY 평면 · Z 축은 그대로다). 그런데 spin 축이 local Y 라 보정이 없으면
  // `tiltRad = 0` 일 때 자전축이 world **Y** — 즉 궤도면 **안**에 눕는다. 그 90° 를 메운다.
  Quaternion.RotationAxisToRef(ROT_TILT_AXIS, ORBITAL_NORMAL_OFFSET + state.tiltRad, tmpTilt);
  // q = tilt ∘ spin (spin 먼저 적용 후 tilt — Babylon A.multiply(B) = B 먼저).
  tmpTilt.multiplyToRef(tmpSpin, out);
}

/** #782 — 자전축 (local Y = pole) / tilt 축 (world X). 모듈 상수 (alloc 0). */
const ROT_SPIN_AXIS = new Vector3(0, 1, 0);
const ROT_TILT_AXIS = new Vector3(1, 0, 0);

/**
 * #1130 — **기준면 보정** `π/2`. obliquity 를 궤도 법선(world Z) 기준으로 만든다.
 *
 * 없으면 `tiltRad = 0` 인 body 의 자전축이 world Y(궤도면 안)가 되어 **전 행성이 90° 누운다**.
 *
 * ⚠️ 엄밀히는 **황도** 법선 기준이다 — body 자기 궤도면과는 inclination 만큼 다르다 (mercury
 * `7.005°` / moon `5.145°`). 데이터의 `axialTiltDeg` 도 NASA "obliquity to orbit" 이라 같은 계열의
 * 근사이며, 자기 궤도면 기준 정밀화는 #1130 범위 밖이다.
 * 실측(v0.76.0, 보정 전): 지구 `66.56°`(기대 `23.44°`) / 천왕성 `7.77°`(기대 `97.77°`) — 「옆으로
 * 누운 행성」이 오히려 똑바로 서 보이는 형태였다.
 *
 * ⚠️ **ring 의 `RING_DISC_BASE_TILT_X` 와 짝이다** (`ring-shader.ts`). 보정 전에도 두 축은 서로
 * 정합했고 이번에 **같은 크기·같은 방향**으로 함께 옮겼으므로 상대 관계는 불변이다 — 그래서
 * **한쪽만 옮기면 지금 맞는 정합이 깨진다.** 불변식은 `self-rotation.test.ts` §ring 정합 이
 * 단언한다 (변이 실측: 한쪽만 되돌리면 각각 2건 · 4건 FAIL).
 */
export const ORBITAL_NORMAL_OFFSET = Math.PI / 2;

// ─────────────────────────────────────────────────────────────────────────────
// #1362 — 지구 전용 방향 (자전축 방향 + 실제 시각 자전 위상).
//
// ADR `docs/decisions/20260628-756-procedural-planet-surface.md` **§Amendment 13** (#1362).
//
// 일반 식 (`tilt(π/2 + ε) ∘ spin(+θ)`) 을 지구에 쓰면 두 증상이 한 결함에서 나온다 — 6월에 남반구가
// 여름 (태양 직하 위도 부호 반전) 이고, 지표가 동→서로 돌아 직하점 경도가 `+15°/h` 로 움직인다
// (실제 `−15°/h` — 태양이 서쪽에서 뜬다). Phase 0 실측 (#1362 코멘트 6245464331): 현재 방향 =
// 올바른 방향 ∘ `RotX(π)`. 그래서 지구는 `tilt(ε − π/2) ∘ spin(−ERA)` 를 쓴다.
//
// ⚠️ **지구만 local `+Y` (표면 마스크의 북극) 가 실제 북극이다.** 장면 좌표는 데이터 (오른손 황도) 의 z 반전
// `S_z` 다 (#1366 — `coords/scene-handedness.ts`, ADR `20261018-1366`). 지구의 local `+Y` 는 장면 좌표
// `(0, sin ε, −cos ε)` = 데이터 `(0, sin ε, cos ε)` (실제 천구 북극) 를 가리킨다. 각속도 벡터는 일반 식과 같은
// 쪽 (장면 `+Z` 쪽) 이라 공전 · 자전 감기 방향은 다른 행성과 같다. 이 quaternion 은 장면 공간 값이라 #1366
// (위치에만 `S_z`) 전후로 식이 같다 — #1366 이전 거울상 화면에서는 같은 성분을 「data 좌표」 로 적었다.
// 다른 천체는 local `+Y` 가 **반대 극**이다 — 절차 표면이라 관측되는 피해가 없어 범위 밖 (#1362 사용자
// 결정 (a) 지구만).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * #1362 — 지구 화면 북극 보정 `π`. 일반 기울기 각 (`ORBITAL_NORMAL_OFFSET + ε`) 에서 빼면 local `+Y`
 * 가 반대 극으로 넘어간다 (`ε − π/2`). spin 부호 반전 (`−ERA`) 과 **짝**이다 — 하나만 바꾸면 위도는
 * 맞아도 자전 방향이 남거나 (Phase 0 기각안 `π/2 − ε`), 그 반대가 된다.
 */
const EARTH_SCREEN_NORTH_FLIP = Math.PI;

/**
 * #1362 — 지구 spin 의 local `+Y` 기준 부호 (`spin(EARTH_SPIN_SIGN × ERA)`). 음수가 지표를 **서→동**으로
 * 돌린다 (직하점 경도 `−15°/h`). 구름 상대 자전 (`cloud-layer.ts` `computeCloudDriftOmega`) 이 **같은
 * 상수**로 부호를 정한다 — 구름의 순행 (지표 기준 동쪽) 은 host spin 과 같은 감기 방향이기 때문이다.
 */
export const EARTH_SPIN_SIGN = -1;

/**
 * #1362 — 지구 자전각 ERA [rad, 0~2π). IERS Conventions (2010) 식 5.15
 * `θ = 2π(0.7790572732640 + 1.00273781191135448·(jd − 2451545.0))`.
 *
 * 정수 회전수를 먼저 떼어 (`T % 1`) 큰 수 곱의 유효숫자 손실을 피한다 (IERS 권고 형태 — 율에서 1 을 빼면
 * 나머지 항이 작다). 장면 jd 는 UTC 기반이라 UT1 근사로 쓴다 (`|UT1 − UTC| < 0.9 s`). #1370 — 인자는 **장면 시계** JD 다.
 * 천체 위치는 TT (`clockJdToTt`) 로 계산하지만 자전은 시계 그대로다 (ADR `20261023-1370` §결정 P).
 */
export function earthRotationAngle(jd: number): number {
  const tu = jd - J2000_JD;
  const turns =
    (tu % 1) +
    EARTH_ROTATION_ANGLE_AT_J2000_TURNS +
    (EARTH_ROTATION_ANGLE_RATE_TURNS_PER_DAY - 1) * tu;
  const frac = turns - Math.floor(turns);
  return 2 * Math.PI * frac;
}

/**
 * #1362 — 지구 방향 quaternion `tilt(ε − π/2) ∘ spin(−ERA(jd))`.
 *
 * 경도 0 오프셋은 `0` 이다 — 마스크 규약 (local `+X` = 경도 0°, `+Z` = 경도 90°E) 그대로 ERA 를 직접 쓴다
 * (J2000 고정 극 · 세차 무시 근사 — 직하점 위도 잔차가 연 `≈ 0.0066°` 씩 커져 2031년에 `0.2°` 를 넘는다.
 * ADR §Amendment 13 §A13.6).
 *
 * @param jd 현재 Julian Date (UTC 기반 — UT1 근사)
 * @param tiltRad obliquity [rad] (데이터 `axialTiltDeg`)
 */
export function computeEarthOrientationQuaternion(
  jd: number,
  tiltRad: number,
  tmpSpin: Quaternion,
  tmpTilt: Quaternion,
  out: Quaternion,
): void {
  Quaternion.RotationAxisToRef(ROT_SPIN_AXIS, EARTH_SPIN_SIGN * earthRotationAngle(jd), tmpSpin);
  Quaternion.RotationAxisToRef(
    ROT_TILT_AXIS,
    ORBITAL_NORMAL_OFFSET + tiltRad - EARTH_SCREEN_NORTH_FLIP,
    tmpTilt,
  );
  tmpTilt.multiplyToRef(tmpSpin, out);
}
