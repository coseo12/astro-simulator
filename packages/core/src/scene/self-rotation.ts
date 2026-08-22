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
}

/**
 * #782 — body 데이터에서 자전 파라미터 산출. `rotationPeriodHours` 미지정 시 null (자전 없음).
 * 규약 (i): ω 는 양수 magnitude (방향은 tiltRad 에 내재). loader schema 가 0 을 차단하나 방어적 재확인.
 */
export function computeRotationState(body: LoadedCelestialBody): RotationState | null {
  const periodHours = body.rotationPeriodHours;
  if (periodHours === undefined || periodHours === 0) return null;
  // ω [rad/day] = 2π / (period_h / 24). period 는 양수 magnitude — Math.abs 로 방어 (음수 데이터가
  // 실수로 들어와도 방향은 tiltRad(obliquity) 가 결정하므로 magnitude 만 사용, 이중 적용 차단).
  const omega = (2 * Math.PI * 24) / Math.abs(periodHours);
  const tiltRad = ((body.axialTiltDeg ?? 0) * Math.PI) / 180;
  return { omega, tiltRad };
}

/**
 * #782 §A2.3 결정 5 — jd 순수 함수 자전각 → `tilt(axialTilt) ∘ spin(spinAngle)` quaternion.
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
  // (jd − epoch) 뺄셈을 float64 로 먼저 (큰 수 − 큰 수 = 작은 수) → mod 2π 로 각 누적 없이 결정적.
  const spinAngle = (((jd - epoch) * state.omega) % (2 * Math.PI)) as number;
  // spin: local Y (자전축) 주위. tilt: world X 주위.
  Quaternion.RotationAxisToRef(ROT_SPIN_AXIS, spinAngle, tmpSpin);
  // ⚠️ **`+ π/2` 가 기준면 보정이다** (#1130). obliquity 는 **궤도 법선**에서 재는 각인데, 이
  // 씬의 기준 궤도면은 XY 라 궤도 법선은 **world Z** 다 (근거는 측정이 아니라 구조 —
  // `physics/state-vector.ts` 의 `z = sinI · y₁` 이 inclination 0 에서 `z ≡ 0` 을 보장하고,
  // 씬은 이 좌표를 기저 변환 없이 직결한다). 그런데 spin 축이 local Y 라 보정이 없으면
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
