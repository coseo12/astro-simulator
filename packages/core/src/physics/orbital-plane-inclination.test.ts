/**
 * #1132 — 궤도면 경사 불변식 가드. `Rz(Ω)·Rx(i)·Rz(ω)` 회전 **사본 3개** 각각이 궤도면을
 * 데이터가 선언한 `inclinationDeg` 대로 놓는지를 궤도 보유 **31 body 전건**으로 고정한다.
 *
 * ## 배경
 *
 * #1130 이 자전축 기준면을 정정하며 공전 궤도도 별건 확인했으나 **그 측정 경로가 리포에 없었다**
 * (PR #1131 reviewer B3ⓒ — *"렌더된 궤도면 경사를 재는 스크립트가 저장소에 없다"*). 본 파일이
 * 그 재현 경로를 상시 실행되는 자산으로 남긴다.
 *
 * ## 대상 사본 3개 (2026-08-30 실측)
 *
 *   1. `physics/state-vector.ts:61`  — `orbitalStateAt`
 *   2. `physics/kepler.ts:119`       — `positionAt`
 *   3. `scene/orbit-sampling.ts:61`  — `sampleOrbitPoints`  ← 씬이 실제로 궤도선을 그리는 경로
 *
 * 3번을 포함시키므로 본 단위 테스트가 곧 「씬 해석」 검증이다: `sampleOrbitPoints` 출력은
 * `CreateLineSystem` 에 기저 변환 없이 직행하고, 이후 단계(균일 스칼라 scale · 평행이동 ·
 * 카메라)는 평면 **방향**을 바꿀 수 없다.
 *
 * ⚠️ **4번째 사본 탐지 술어** — 본 가드는 위 3개만 안다. 사본이 늘면 자동으로 알지 못한다.
 * 저장소 전체에서 **프로덕션** 사본을 세는 술어 (2026-08-30 실측 `3` hit, 위 3개와 일치):
 *
 *   grep -rn "cosI \* y1" --include="*.ts" packages apps \
 *     | grep -v "/dist/" | grep -v node_modules | grep -v "\.test\.ts:"
 *
 * ⚠️ **마지막 필터(`.test.ts:` 제외)를 빼지 말 것 — 술어가 자기 자신을 센다.** D3 의 로컬
 * M0 복제 2행이 같은 계수를 쓰기 때문이다. 필터를 빼면 히트가 본 파일 쪽으로 늘어나며
 * (초판 시점 실측 `5 = 프로덕션 3 + 본 파일 2`), 그 수는 본 헤더가 패턴을 산문에 다시
 * 적기만 해도 또 바뀐다 — 그래서 **박제하는 baseline 은 필터를 건 `3` 뿐**이다. 파일별
 * 분해가 필요하면 같은 패턴을 `git grep -c -F` 로 세면 된다.
 * 초판 헤더가 필터 없이 `3` 을 박제했다가 PR #1174 reviewer B1 으로 차단됐다 — 가드
 * 자기-매칭 클래스(#995)이자, 측정 무결성을 산출물로 남기는 PR 이 그 자리에 새로운
 * 반증 가능 수치를 넣은 사례다.
 *
 * ## 측정 방법 (판정 전제 — 계약의 일부, 임의 교체 금지)
 *
 *  - **`atan2(hypot(n.x, n.y), n.z)` 를 쓴다. `acos(n·ẑ)` 금지.** earth 는
 *    `inclinationDeg = -1.531e-05` 라 `acos` 경로가 `1.042e-8°` 로 열화한다 (계약 수립 시 실측).
 *  - **`Math.abs(inclinationDeg)` 와 비교한다.** earth 가 음수 inclination 이고 법선 사이각은
 *    항상 비음수다.
 *  - **법선 방향 모호성을 제거한다.** `orbitalStateAt` 은 `h = r × v` (정의상 궤도 각운동량),
 *    나머지 2개는 **진근점각 단조 증가** 3점의 연속 외적 합. **시간** 등간격 샘플링은 겉보기
 *    winding 이 뒤집혀 `180 − i` 를 낸다 — 코드 결함이 아니라 **측정 도구 결함**이다.
 *    실측 (2026-08-30, 술어 명시): deimos (`i = 1.791°`, `T = 1.262895 d`) 를 `positionAt` 으로
 *    `jd = J2000, +Δt, +2Δt` (`Δt = 1 d`) 3점 샘플링하고 같은 연속 외적 합 · 같은 `atan2` tilt 를
 *    쓰면 **`178.209000°`** 가 나온다 (참값 `1.791000°`). 발현 조건은 `(Δt / T) mod 1 ∈ (0.5, 1)`
 *    — 같은 술어로 `Δt = 0.25 / 0.5 / 1.5 / 3 d` 는 `1.791000°` 로 정상이고 `Δt = 1 / 1.25 / 2 / 5 / 7 d`
 *    가 `178.209000°` 다. (초판이 술어 없이 인용한 `176.4°` 는 위 5종 어디서도 재현되지 않아
 *    폐기한다. 기전만 유효 — PR #1174 reviewer W2.)
 *
 * ## 실측값 (2026-08-30, 본 파일 술어로 측정 — 반증된 「8/8」「소수 3자리」주장 대체)
 *
 * | 축 | 측정 함수 / 샘플링 | max 오차 | 공차 | 여유 |
 * | --- | --- | --- | --- | --- |
 * | D1 | `orbitalStateAt` · `h = r × v` | `1.421e-14°` | `1e-9°` | 5.1 자리 |
 * | D1 | `positionAt` · 진근점각 단조 3점 | `1.421e-14°` | `1e-9°` | 5.1 자리 |
 * | D1 | `sampleOrbitPoints` · 진근점각 그리드 3점 | `1.421e-14°` | `1e-9°` | 5.1 자리 |
 * | D2 | `orbitalStateAt` · `z/r` | `2.220e-16` | `1e-9` | 6.7 자리 |
 * | D2 | `positionAt` · `z/r` | `1.665e-16` | `1e-9` | 6.8 자리 |
 * | D2 | `sampleOrbitPoints` · `z/r` | `2.914e-16` | `1e-9` | 6.5 자리 |
 *
 * 모집단은 `solar-system.json` 32 body 중 `orbit` 보유 **31** (`sun` 만 제외).
 *
 * ## 범위 밖 (본 가드가 검증하지 **않는** 것)
 *
 *  - **궤도 요소 값 자체의 IAU 정확성** (`inclinationDeg` 포함) — 본 계약은 **코드
 *    라운드트립**이다. 데이터가 틀려도 PASS 한다. (`verify:iau-data` 는 `mass`·`radius`
 *    2필드만 대조한다.)
 *  - **`Ω` (승교점 황경) 배치** — 두 불변식 모두 무구속. 실측 (2026-08-30): `kepler.ts` 의
 *    `sinO` 부호를 반전 (`Ω → -Ω`) 시켜도 **D1 `0/31` · D2 `0/31`** 로 아무것도 검출되지
 *    않는다 (깨지는 것은 D3 의 M0 복제 바이트 일치 `1` 건뿐 — 불변식이 아니라 결합 장치다).
 *  - **자전축** — #1130 에서 완결.
 *
 * ⚠️ 「본 불변식은 경사만 구속한다」는 **틀린 서술이다** (초판 헤더 · PR #1174 reviewer W1).
 * D1 은 경사만 구속하지만 **D2 는 `ω` 배치까지 구속한다** — 실측: `kepler.ts` 의 `sinW` 부호를
 * 반전 (`ω → -ω`) 시키면 **D2 가 `31/31` 검출**한다 (D1 은 `0/31`). D3 의 M5 (`Rz(ω)`/`Rx(i)`
 * 순서 교환) 가 D1 을 통과하고 D2 에 걸리는 것도 같은 축이다.
 *
 * ## 파일 구성 근거
 *
 * 사본 2개는 `physics/`, 1개는 `scene/` 이지만 **한 파일**에 둔다. 검증 대상이 「사본들이 같은
 * 선언값에 수렴하는가」라 분할하면 측정 하네스(ν→JD 역산 · 법선 winding 고정 · tilt 산식)가
 * 복제되고, 그 복제본 사이의 drift 가 정확히 본 가드가 막으려는 결함 클래스다. D3 의 로컬
 * 무변이 사본도 자신이 정당화하는 단언 옆에 있어야 한다.
 */
import { describe, expect, it } from 'vitest';
import { GRAVITATIONAL_CONSTANT } from '@astro-simulator/shared';
import solarSystemRaw from '@astro-simulator/shared/data/solar-system.json' with { type: 'json' };
import {
  getSolarSystem,
  type LoadedCelestialBody,
  type LoadedOrbitalElements,
} from '../ephemeris/solar-system-loader.js';
import { orbitalStateAt } from './state-vector.js';
import {
  meanAnomalyAt,
  positionAt,
  solveKeplerEquation,
  trueAnomalyFromEccentric,
} from './kepler.js';
import { sampleOrbitPoints } from '../scene/orbit-sampling.js';
import type { Vec3Double } from '../coords/vec3.js';

const RAD_TO_DEG = 180 / Math.PI;
const TWO_PI = Math.PI * 2;

/** D1 절대 공차 [°]. 상대 공차 불가 — earth 가 `i ≈ 0` 이라 상대 오차가 정의 불능. */
const D1_TOLERANCE_DEG = 1e-9;
/** D2 상대 공차 (궤도 반경 정규화 — `z/r` 는 무차원이라 renderScale 에도 불변). */
const D2_TOLERANCE = 1e-9;

/** 판정 진근점각 3점 [rad]. 인접 간격이 모두 `< π` 라 외적 winding 이 일의적이다. */
const TRUE_ANOMALY_SAMPLES = [0.6, 2.3, 4.9] as const;

/** `sampleOrbitPoints` 의 진근점각 그리드 분할 수 (R10b #664 — e ≥ 0.6 는 256). */
const HIGH_ECCENTRICITY_THRESHOLD = 0.6;

type Vec3 = [number, number, number];

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const norm = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);

/**
 * 법선 벡터의 +z 축 기준 경사 [°]. `acos` 가 아니라 `atan2` — 헤더 §측정 방법 1항.
 * 반환 범위 `[0, 180]` 이라 역행 궤도(i > 90°)도 그대로 표현된다.
 */
function normalTiltDeg(n: Vec3): number {
  return Math.atan2(Math.hypot(n[0], n[1]), n[2]) * RAD_TO_DEG;
}

/**
 * 진근점각 단조 증가 3점 → 궤도면 법선.
 *
 * 연속 두 쌍의 외적을 더한다. 초점 기준 위치 벡터 `r₁ × r₂` 는 `0 < Δν < π` 일 때 반드시
 * 각운동량 `h` 방향이므로 두 항의 부호가 일치하고, 합이 곧 winding 이 고정된 법선이다.
 */
function planeNormalFromThreePoints(p: readonly [Vec3, Vec3, Vec3]): Vec3 {
  return add(cross(p[0], p[1]), cross(p[1], p[2]));
}

const solarSystem = getSolarSystem();
const bodyById = new Map<string, LoadedCelestialBody>(solarSystem.bodies.map((b) => [b.id, b]));

/**
 * 판정 대상 모집단 — **raw JSON 에서 직접** `orbit` 보유 body 를 고른다.
 * 기대 경사도 raw `inclinationDeg` 를 쓴다 (로더의 deg→rad 변환까지 라운드트립에 포함).
 */
const ORBITING_BODIES: ReadonlyArray<{ id: string; inclinationDeg: number }> = (
  solarSystemRaw as { bodies: Array<{ id: string; orbit?: { inclinationDeg: number } }> }
).bodies
  .filter((b): b is { id: string; orbit: { inclinationDeg: number } } => b.orbit !== undefined)
  .map((b) => ({ id: b.id, inclinationDeg: b.orbit.inclinationDeg }));

/** 부모 천체의 중력 파라미터 μ = G·M_parent. */
function parentMu(body: LoadedCelestialBody): number {
  const parent = body.parentId ? bodyById.get(body.parentId) : undefined;
  if (!parent) throw new Error(`${body.id}: parent '${body.parentId}' 미존재`);
  return GRAVITATIONAL_CONSTANT * parent.mass;
}

/**
 * 목표 진근점각 ν 에 도달하는 JD 역산 — `positionAt`/`orbitalStateAt` 이 JD 만 받기 때문.
 * ν → E → M → t (Kepler 방정식의 해석적 역방향, 반복 없음).
 */
function julianDateForTrueAnomaly(el: LoadedOrbitalElements, mu: number, nu: number): number {
  const e = el.eccentricity;
  const E =
    2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
  const meanAnomaly = E - e * Math.sin(E);
  const n = Math.sqrt(mu / (el.semiMajorAxis * el.semiMajorAxis * el.semiMajorAxis));
  return el.epoch + (meanAnomaly - el.meanAnomalyAtEpoch) / n / 86_400;
}

/** 해당 JD 에서 두 physics 사본이 실제로 사용하는 진근점각 (D2 기대값 산출용). */
function trueAnomalyAt(el: LoadedOrbitalElements, mu: number, julianDate: number): number {
  const M = meanAnomalyAt(el, julianDate, mu);
  return trueAnomalyFromEccentric(solveKeplerEquation(M, el.eccentricity), el.eccentricity);
}

/** `sampleOrbitPoints` 그리드에서 목표 ν 에 최근접한 인덱스 (그 인덱스의 ν 는 정확히 계산 가능). */
function nearestGridIndex(nu: number, segments: number): number {
  return Math.round((nu / TWO_PI) * segments);
}

interface SampledPoint {
  /** 사본이 실제로 사용한 진근점각 [rad]. */
  nu: number;
  position: Vec3;
}

/** 사본 3개를 같은 인터페이스로 감싼다 — 각각 진근점각 3점의 위치를 낸다. */
interface RotationCopy {
  label: string;
  sample: (body: LoadedCelestialBody) => readonly [SampledPoint, SampledPoint, SampledPoint];
  /**
   * D1 법선. `orbitalStateAt` 만 `h = r × v` 라 3점 샘플이 필요 없으므로 `sample` 을 호출하지
   * 않는다 — 그래서 `body` 만 받고 각 사본이 필요한 만큼만 스스로 계산한다 (PR #1174
   * reviewer W4: 종전 시그니처는 D1 이 전 사본에 대해 `sample` 을 강제 호출해 사본 1 에서
   * `31 × 3` 회의 JD 역산을 전량 폐기했다).
   */
  planeNormal: (body: LoadedCelestialBody) => Vec3;
}

function sampleWith(
  body: LoadedCelestialBody,
  fn: (el: LoadedOrbitalElements, mu: number, jd: number) => Vec3Double,
): readonly [SampledPoint, SampledPoint, SampledPoint] {
  const el = body.orbit!;
  const mu = parentMu(body);
  const points = TRUE_ANOMALY_SAMPLES.map((target) => {
    const jd = julianDateForTrueAnomaly(el, mu, target);
    const p = fn(el, mu, jd);
    return { nu: trueAnomalyAt(el, mu, jd), position: [p[0], p[1], p[2]] as Vec3 };
  });
  return points as unknown as readonly [SampledPoint, SampledPoint, SampledPoint];
}

/** 3점 샘플에서 법선을 만드는 공통 경로 (사본 2·3 이 공유). */
function normalFromCopySamples(
  copy: Pick<RotationCopy, 'sample'>,
  body: LoadedCelestialBody,
): Vec3 {
  const points = copy.sample(body);
  return planeNormalFromThreePoints([points[0].position, points[1].position, points[2].position]);
}

const COPIES: readonly RotationCopy[] = [
  {
    label: 'orbitalStateAt (physics/state-vector.ts)',
    sample: (body) => sampleWith(body, (el, mu, jd) => orbitalStateAt(el, jd, mu).position),
    // 각운동량 h = r × v 는 정의상 궤도 법선 — 3점 외적이 불필요하다.
    planeNormal: (body) => {
      const el = body.orbit!;
      const mu = parentMu(body);
      const jd = julianDateForTrueAnomaly(el, mu, TRUE_ANOMALY_SAMPLES[0]);
      const state = orbitalStateAt(el, jd, mu);
      return cross(state.position as Vec3, state.velocity as Vec3);
    },
  },
  {
    label: 'positionAt (physics/kepler.ts)',
    sample: (body) => sampleWith(body, (el, mu, jd) => positionAt(el, jd, mu)),
    planeNormal: (body) => normalFromCopySamples(COPIES[1]!, body),
  },
  {
    label: 'sampleOrbitPoints (scene/orbit-sampling.ts)',
    sample: (body) => {
      const el = body.orbit!;
      // tier 는 균일 스칼라 배율만 바꾼다 — 경사·z/r 어느 쪽에도 영향 없음.
      const points = sampleOrbitPoints(body, 'solar');
      if (!points) throw new Error(`${body.id}: sampleOrbitPoints 가 null`);
      const segments = el.eccentricity >= HIGH_ECCENTRICITY_THRESHOLD ? 256 : 64;
      const sampled = TRUE_ANOMALY_SAMPLES.map((target) => {
        const s = nearestGridIndex(target, segments);
        const p = points[s]!;
        return { nu: (s / segments) * TWO_PI, position: [p.x, p.y, p.z] as Vec3 };
      });
      return sampled as unknown as readonly [SampledPoint, SampledPoint, SampledPoint];
    },
    planeNormal: (body) => normalFromCopySamples(COPIES[2]!, body),
  },
];

// ---------------------------------------------------------------------------
// D1 — 불변식 A (평면 경사): 31 body × 3 사본 = 93 셀
// ---------------------------------------------------------------------------

for (const copy of COPIES) {
  describe(`#1132 D1 궤도면 법선 경사 == |inclinationDeg| — ${copy.label}`, () => {
    for (const { id, inclinationDeg } of ORBITING_BODIES) {
      it(`${id} (i = ${inclinationDeg}°)`, () => {
        const body = bodyById.get(id)!;
        const measured = normalTiltDeg(copy.planeNormal(body));
        expect(Math.abs(measured - Math.abs(inclinationDeg))).toBeLessThan(D1_TOLERANCE_DEG);
      });
    }
  });
}

// ---------------------------------------------------------------------------
// D2 — 불변식 B (부호 포함 닫힌형): 31 body × 3 사본 × 3 진근점각 = 279 셀
//
// D1 단독으로는 잡히지 않는 결함이 있다 (D3 의 M3 z-mirror / M5 회전 순서 교환 — 둘 다
// 법선 경사를 보존한다). D2 가 없으면 #1127 클래스(가드 이름이 내건 축에 판정이 없음)를
// 재생산한다.
// ---------------------------------------------------------------------------

for (const copy of COPIES) {
  describe(`#1132 D2 z/r == sin(i)·sin(ω+ν) — ${copy.label}`, () => {
    for (const { id } of ORBITING_BODIES) {
      it(`${id} — 진근점각 3점`, () => {
        const body = bodyById.get(id)!;
        const el = body.orbit!;
        const sinI = Math.sin(el.inclination);
        for (const point of copy.sample(body)) {
          const expected = sinI * Math.sin(el.argumentOfPeriapsis + point.nu);
          const actual = point.position[2] / norm(point.position);
          expect(Math.abs(actual - expected)).toBeLessThan(D2_TOLERANCE);
        }
      });
    }
  });
}

// ---------------------------------------------------------------------------
// D3 — 변이 테스트 (판별력 실증)
//
// 프로덕션 코드에 변이 훅을 넣지 않는다. 대신 `positionAt` 의 회전을 **바이트 동일하게**
// 복제한 로컬 사본을 두고 변이시킨다. 그 복제가 실제로 동일하다는 것 자체가 첫 케이스다
// (M0 대조군이 형식이 아닌 이유 — 계약 수립 중 측정 도구가 3회 그럴듯한 오답을 냈고 그중
// 2건은 무변이 baseline 이 FAIL 하는 것을 보고서야 드러났다).
//
// ⚠️ **본 절 7 케이스가 매 CI 실행마다 재실증하는 것은 「D1·D2 술어의 판별력」이지
// 「프로덕션 사본의 정합성」이 아니다** (PR #1174 reviewer W3). `detectionCounts` 는 로컬
// 복제만 호출하므로, 프로덕션 회전을 고쳐도 M1~M5 6 케이스는 꿈쩍하지 않는다. 프로덕션과
// 결합된 것은 **M0 바이트 동일성 1 케이스뿐**이며, 프로덕션 사본 자체의 정합성은 위 D1·D2
// 186 케이스가 판정한다. 두 층의 역할을 섞어 읽지 말 것.
//
// 다만 본 절은 **측정 하네스 자신의 열화**를 잡는다. 실측 (2026-08-30): `normalTiltDeg` 를
// `atan2` → `acos(n.z / |n|)` 로 되돌리면 `6` 케이스가 FAIL 한다 — D1 earth × 3 사본
// (열화가 공차를 넘는 유일한 body) + 본 절의 M0 · M3 · M5 검출 수 3 건.
// ---------------------------------------------------------------------------

const MUTANTS = ['M0', 'M1', 'M2', 'M3', 'M4', 'M5'] as const;
type Mutant = (typeof MUTANTS)[number];

const MUTANT_LABEL: Record<Mutant, string> = {
  M0: '무변이 (대조군)',
  M1: 'sinI/cosI 교환',
  M2: 'Rx(i) 생략',
  M3: 'z 부호 반전',
  M4: '축 교환 y↔z (#1130 형태)',
  M5: 'Rz(ω)/Rx(i) 순서 교환',
};

/** M0 은 `kepler.ts:117-124` 회전 블록의 바이트 동일 복제. 나머지는 그 한 지점만 변형. */
function rotateMutated(
  xOrb: number,
  yOrb: number,
  el: LoadedOrbitalElements,
  mutant: Mutant,
): Vec3 {
  const cosO = Math.cos(el.longitudeOfAscendingNode);
  const sinO = Math.sin(el.longitudeOfAscendingNode);
  const cosI = Math.cos(el.inclination);
  const sinI = Math.sin(el.inclination);
  const cosW = Math.cos(el.argumentOfPeriapsis);
  const sinW = Math.sin(el.argumentOfPeriapsis);

  if (mutant === 'M5') {
    // Rx(i) 를 Rz(ω) 보다 먼저 적용 (= Rz(Ω)·Rz(ω)·Rx(i))
    const yA = cosI * yOrb;
    const zA = sinI * yOrb;
    const x2 = cosW * xOrb - sinW * yA;
    const y2 = sinW * xOrb + cosW * yA;
    return [cosO * x2 - sinO * y2, sinO * x2 + cosO * y2, zA];
  }

  const x1 = cosW * xOrb - sinW * yOrb;
  const y1 = sinW * xOrb + cosW * yOrb;
  let y2: number;
  let z2: number;
  if (mutant === 'M1') {
    y2 = sinI * y1;
    z2 = cosI * y1;
  } else if (mutant === 'M2') {
    y2 = y1;
    z2 = 0;
  } else {
    y2 = cosI * y1;
    z2 = sinI * y1;
  }
  const x = cosO * x1 - sinO * y2;
  const y = sinO * x1 + cosO * y2;
  if (mutant === 'M3') return [x, y, -z2];
  if (mutant === 'M4') return [x, z2, y];
  return [x, y, z2];
}

/** `positionAt` 전체 파이프라인의 로컬 복제 (회전 단계만 변이 가능). */
function positionAtMutated(
  el: LoadedOrbitalElements,
  julianDate: number,
  mu: number,
  mutant: Mutant,
): Vec3 {
  const M = meanAnomalyAt(el, julianDate, mu);
  const E = solveKeplerEquation(M, el.eccentricity);
  const nu = trueAnomalyFromEccentric(E, el.eccentricity);
  const r = el.semiMajorAxis * (1 - el.eccentricity * Math.cos(E));
  return rotateMutated(r * Math.cos(nu), r * Math.sin(nu), el, mutant);
}

/** 한 변이가 31 body 중 몇 개에서 검출되는지 — D1 단독 / D2 단독 / D1+D2. */
function detectionCounts(mutant: Mutant): { d1: number; d2: number; combined: number } {
  let d1 = 0;
  let d2 = 0;
  let combined = 0;
  for (const { id, inclinationDeg } of ORBITING_BODIES) {
    const body = bodyById.get(id)!;
    const el = body.orbit!;
    const mu = parentMu(body);
    const jds = TRUE_ANOMALY_SAMPLES.map((nu) => julianDateForTrueAnomaly(el, mu, nu));
    const points = jds.map((jd) => positionAtMutated(el, jd, mu, mutant));

    const tilt = normalTiltDeg(planeNormalFromThreePoints([points[0]!, points[1]!, points[2]!]));
    const failsD1 = Math.abs(tilt - Math.abs(inclinationDeg)) >= D1_TOLERANCE_DEG;

    const sinI = Math.sin(el.inclination);
    const failsD2 = points.some((p, k) => {
      const expected = sinI * Math.sin(el.argumentOfPeriapsis + trueAnomalyAt(el, mu, jds[k]!));
      return Math.abs(p[2] / norm(p) - expected) >= D2_TOLERANCE;
    });

    if (failsD1) d1 += 1;
    if (failsD2) d2 += 1;
    if (failsD1 || failsD2) combined += 1;
  }
  return { d1, d2, combined };
}

describe('#1132 D3 변이 테스트 — 판별력 실증', () => {
  it('M0 로컬 복제가 positionAt 과 완전 일치 (31 body × 3 ν, 부동소수 비트 동일)', () => {
    for (const { id } of ORBITING_BODIES) {
      const body = bodyById.get(id)!;
      const el = body.orbit!;
      const mu = parentMu(body);
      for (const nu of TRUE_ANOMALY_SAMPLES) {
        const jd = julianDateForTrueAnomaly(el, mu, nu);
        expect(positionAtMutated(el, jd, mu, 'M0')).toEqual(positionAt(el, jd, mu));
      }
    }
  });

  // 기대 검출 수 — 계약 수립 시 실측과 본 파일 실측이 일치해야 한다.
  // M3/M5 의 `d1: 0` 이 D2 의 존재 이유다: z-mirror 는 법선의 x·y 만 뒤집어 경사 측정을
  // 보존하고, 회전 순서 교환은 경사를 아예 바꾸지 않는다.
  // 재확인 — 이 숫자들은 **로컬 복제**에 대한 검출 수다 (위 ⚠️ 참조).
  const EXPECTED: Record<Mutant, { d1: number; d2: number; combined: number }> = {
    M0: { d1: 0, d2: 0, combined: 0 },
    M1: { d1: 31, d2: 31, combined: 31 },
    M2: { d1: 31, d2: 31, combined: 31 },
    M3: { d1: 0, d2: 31, combined: 31 },
    M4: { d1: 31, d2: 31, combined: 31 },
    M5: { d1: 0, d2: 31, combined: 31 },
  };

  for (const mutant of MUTANTS) {
    const e = EXPECTED[mutant];
    it(`${mutant} ${MUTANT_LABEL[mutant]} — D1 ${e.d1}/31 · D2 ${e.d2}/31 · D1+D2 ${e.combined}/31 검출`, () => {
      expect(detectionCounts(mutant)).toEqual(e);
    });
  }
});

// ---------------------------------------------------------------------------
// 측정 하네스 자기 검증 — 위 모든 판정이 ν→JD 역산의 정확성에 의존한다.
// ---------------------------------------------------------------------------

describe('#1132 측정 하네스 — ν→JD 역산 정확도', () => {
  it('역산한 JD 에서 다시 구한 ν 가 목표값과 1e-6 rad 이내로 일치 (31 body × 3 ν)', () => {
    for (const { id } of ORBITING_BODIES) {
      const body = bodyById.get(id)!;
      const el = body.orbit!;
      const mu = parentMu(body);
      for (const target of TRUE_ANOMALY_SAMPLES) {
        const jd = julianDateForTrueAnomaly(el, mu, target);
        const achieved = trueAnomalyAt(el, mu, jd);
        // 둘 다 [0, 2π) 로 접어 비교 (역산 경로는 (-π, π] 를 낸다).
        const delta = Math.abs(((achieved - target) % TWO_PI) + TWO_PI) % TWO_PI;
        expect(Math.min(delta, TWO_PI - delta)).toBeLessThan(1e-6);
      }
    }
  });

  it(`모집단 = orbit 보유 31 body (sun 제외)`, () => {
    expect(ORBITING_BODIES).toHaveLength(31);
    expect(ORBITING_BODIES.some((b) => b.id === 'sun')).toBe(false);
  });
});
