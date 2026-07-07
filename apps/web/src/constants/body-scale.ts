/**
 * #762 — 천체 표시 크기 비율 단조성 회복 (sqrt 압축 곡선 + 그룹별 정책).
 *
 * ## 본 모듈의 책임
 * `diameter = body.radius × 2 × renderScale × bodyScale(id)` 에서 `bodyScale(id)` 등가 배수 산출.
 * 실측 데이터 (body.radius, solar-system.json) 자체는 불변 (principles.md §1 Visual Fidelity —
 * 데이터 SSoT 보존 + rendering 시점 왜곡 허용).
 *
 * ## #762 정책 전환 (옵션 A2 — ADR `20260629-762-body-scale-monotonic-forensic.md` §5 결정 2)
 * R1~R12 각 R-Phase 가 "그 천체 단독 viewport 점유율"만 합의 → cross-body 비율 역전 누적
 * (목성 effective 3.43M < 지구 5.10M → 지구가 목성보다 크게 표시). 본 모듈이 **5 그룹 비대칭 박제값**
 * (inner 700~800 / gas giant 48 / ice giant 250 / dwarf 800 / comet 5000) 을 **그룹별 압축 곡선**으로
 * 전환해 단조성 회복.
 *
 * ### 그룹별 정책
 * 1. **행성(8) + 왜소행성(5)** — `effective_radius = radius^p × k` 곡선 산출 (p=0.5 sqrt 기본).
 *    `k` 는 **mercury floor 고정** (mercury 현 px 7.0 = 등가 scale 700 유지). 작은 천체일수록 부스트되어
 *    실반경 격차를 압축하되 최종 mesh 가 실반경 순서 단조 보존. 등가 scale = `radius^(p-1) × k`.
 * 2. **위성(15)** — 기존 per-parent 수렴대(0.05~0.09) **mesh 비율 보존**. parent effective 가 곡선으로
 *    바뀌므로 위성 등가 scale 도 바뀌나 **모듈 로드 시 1회 정적 역산** (`sat_scale = parent_eff_new ×
 *    수렴대비_old / sat.radius`) 으로 박제. parent 곡선 로직과 강결합 회피 (cross-validate agy 2.0 수용).
 * 3. **comet·극소형 위성(5: phobos/deimos/halley/encke/swift-tuttle)** — 현 5000 단일값 **유지**
 *    (cross-group `max(comet) < min(planet)` + `max(comet) < min(dwarf)` 보존, ROI 판정 — ADR §5 결정 2.3).
 *    그룹 내 사실 서열 자동 보존.
 * 4. **sun** — 항성 점유 정책 = scale 50 별도 유지 (곡선 미적용, ADR §3 옵션 A 압축 함수 §k 결정 단서).
 *
 * ## p 값 (압축 지수)
 * - default p=0.5 (sqrt) — 코드 상수 SSoT (`DEFAULT_BODY_SCALE_P`). URL 부재 시 0.5.
 * - `?bodyScaleP=0.55` URL flag 로 D-T2 사용자 검증 시 실시간 튜닝 (기존 `?surface=`/`?marker=` 동형).
 *   `getBodyScaleForP(p)` factory 가 임의 p 의 룩업 함수 반환. 파서: `core/parse-body-scale-p.ts`.
 * - p→1: 순수 비례(현 역전 없는 실측), p→0: 모든 천체 동일 크기. 권고 범위 0.4~0.6.
 *
 * ## 등가 scale 표 (p=0.5, mercury floor — ADR §4 예측 2 baseline)
 * | body    | 실반경(km) | 등가 scale | effective px 순위 |
 * | ------- | ---------- | ---------- | ----------------- |
 * | jupiter | 71,492     | ~129.3     | 1위 ✅            |
 * | saturn  | 60,268     | ~140.8     | 2위 ✅            |
 * | uranus  | 25,559     | ~216.3     | 3위 ✅            |
 * | neptune | 24,764     | ~219.7     | 4위 ✅            |
 * | earth   | 6,378      | ~432.9     | 5위 ✅            |
 * | venus   | 6,052      | ~444.5     | 6위 ✅            |
 * | mars    | 3,396      | ~593.3     | 7위 ✅            |
 * | mercury | 2,440      | 700 (floor)| 8위 ✅            |
 *
 * ## 비-범위 (ADR §5 결정 4 — 절대 손대지 말 것)
 * - `solar-system.json` 실측 반경 (데이터 SSoT)
 * - `tier.ts` RENDER_SCALE / diameter 식 (`bodyScale(id)` 콜백 인터페이스 유지 — 코어 0줄)
 * - billboard variant (bodyScale 미적용) / focus auto-frame 로직 (378 가드)
 *
 * ## R1~R12 박제값 → 곡선 SSoT 흡수
 * 행성·왜소 개별 박제값 (mercury 700 / earth 800 / jupiter 48 등) 은 본 곡선이 SSoT 로 흡수.
 * 각 R-Phase visualization ADR 의 §결정 N scale 값은 본 ADR 곡선 산출로 cross-link (deprecate).
 * 위성·comet 은 정책 보존 (위성=정적 역산으로 mesh 비 보존 / comet=5000 단일값).
 *
 * 사용처:
 *   - `apps/web/src/components/sim-canvas.tsx` `createSolarSystemScene` 옵션 `bodyScale` 콜백
 *   - `apps/web/src/components/panels/celestial-info-panel.tsx` "× N 과장 중" tooltip
 */

/**
 * 천체 실측 반경 (m) — `packages/shared/data/solar-system.json` 의 rendering 전용 미러.
 *
 * ⚠️ SSoT 는 `solar-system.json`. 본 테이블은 곡선 산출을 위한 모듈 로드 시 정적 미러일 뿐
 * (런타임 json import 회피 — cross-validate agy 3.0 순환 의존 우려 해소). 데이터 변경 시 drift 차단은
 * `body-scale.test.ts` 의 `BODY_RADIUS_M` ↔ json 정합 가드가 담당 (volt #69 숨은 상수 drift 패턴).
 *
 * export 는 #764 drift 가드 (32 body 전수 미러 == json 직접 단언) 의 테스트 접근 경로 전용 —
 * 런타임 소비처는 본 모듈 내부 곡선 산출뿐이다. 위성 effective 는 radius 상쇄 구조
 * (`sat_scale = parent_eff × 수렴대비 / sat.radius` → effective 에서 radius 소거) 라 간접 검증으로는
 * 위성 radius drift 를 잡을 수 없어 직접 단언이 필수 (#763 reviewer 권고 2).
 */
export const BODY_RADIUS_M: Readonly<Record<string, number>> = Object.freeze({
  sun: 6.957e8,
  mercury: 2.4397e6,
  venus: 6.0518e6,
  earth: 6.378137e6,
  moon: 1.7374e6,
  mars: 3.3962e6,
  phobos: 1.108e4,
  deimos: 6.27e3,
  jupiter: 7.1492e7,
  io: 1.8216e6,
  europa: 1.5608e6,
  ganymede: 2.6341e6,
  callisto: 2.4103e6,
  saturn: 6.0268e7,
  titan: 2.575e6,
  enceladus: 2.521e5,
  rhea: 7.64e5,
  iapetus: 7.345e5,
  uranus: 2.5559e7,
  titania: 7.884e5,
  oberon: 7.614e5,
  neptune: 2.4764e7,
  triton: 1.3534e6,
  proteus: 2.1e5,
  ceres: 4.696e5,
  pluto: 1.1883e6,
  haumea: 7.8e5,
  makemake: 7.15e5,
  eris: 1.163e6,
  halley: 5.5e3,
  encke: 2.4e3,
  'swift-tuttle': 1.3e4,
});

/** 압축 곡선 적용 그룹 — 행성(8). 단조성 회복의 핵심 대상. */
export const PLANET_IDS = Object.freeze([
  'mercury',
  'venus',
  'earth',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
] as const);

/** 압축 곡선 적용 그룹 — 왜소행성(5). 전부 mercury effective 아래 (cross-group floor). */
export const DWARF_IDS = Object.freeze(['ceres', 'pluto', 'haumea', 'makemake', 'eris'] as const);

/**
 * 위성(15) → 모행성 매핑 + 보존할 mesh 수렴대 비율 (현 정책 mesh 비 = sat_radius×sat_scale_old /
 * parent_radius×parent_scale_old).
 *
 * 정적 역산: `sat_scale_new = parent_eff_new × convergenceRatio / sat_radius`.
 * convergenceRatio 는 ADR 박제 mesh 비 (volt #69 — drift 가드 위해 명시 박제, 런타임 재계산 아님).
 */
const SATELLITE_CONVERGENCE: Readonly<Record<string, { parent: string; ratio: number }>> =
  Object.freeze({
    // moon/earth 0.068 (R4 #539 Amendment 4)
    moon: { parent: 'earth', ratio: 0.0681 },
    // galilean/jupiter (R6 #627 옵션 D, io 0.053 / europa 0.046 / ganymede 0.077 / callisto 0.070)
    io: { parent: 'jupiter', ratio: 0.0531 },
    europa: { parent: 'jupiter', ratio: 0.0455 },
    ganymede: { parent: 'jupiter', ratio: 0.0768 },
    callisto: { parent: 'jupiter', ratio: 0.0702 },
    // saturn 위성 (R7 titan 0.089 / R11 enceladus 0.0218·rhea 0.066·iapetus 0.0635)
    titan: { parent: 'saturn', ratio: 0.089 },
    enceladus: { parent: 'saturn', ratio: 0.0218 },
    rhea: { parent: 'saturn', ratio: 0.066 },
    iapetus: { parent: 'saturn', ratio: 0.0635 },
    // uranus 위성 (R8 titania 0.0617 / R12 oberon 0.0596)
    titania: { parent: 'uranus', ratio: 0.0617 },
    oberon: { parent: 'uranus', ratio: 0.0596 },
    // neptune 위성 (R9 triton 0.0656 / R12 proteus 0.0102)
    triton: { parent: 'neptune', ratio: 0.0656 },
    proteus: { parent: 'neptune', ratio: 0.0102 },
  });

/**
 * comet·극소형 위성 단일값 (5000) — ADR §5 결정 2.3.
 * 현 5000 이 cross-group (`max(comet) < min(planet)` + `max(comet) < min(dwarf)`) 단조 보존 중 →
 * 곡선 미적용 유지 (그룹 내 사실 서열은 동일 scale 이므로 radius 서열로 자동 보존).
 */
const COMET_SCALE = 5000;
const COMET_IDS = Object.freeze(['phobos', 'deimos', 'halley', 'encke', 'swift-tuttle'] as const);

/** sun 항성 점유 정책 — 곡선 미적용 별도 유지 (R1 Amendment 2026-05-01). */
const SUN_SCALE = 50;

/** mercury floor 등가 scale — 곡선 정규화 앵커 (mercury 현 px 7.0 = scale 700 유지). */
const MERCURY_FLOOR_SCALE = 700;

/** default 압축 지수 p (sqrt). URL `?bodyScaleP=` 부재 시 이 값. 권고 범위 0.4~0.6. */
export const DEFAULT_BODY_SCALE_P = 0.5;

/** 미정의 body id 의 기본 배수. 1.0 = 실측 그대로 (radius ≤ 0 NaN guard fallback 겸용). */
const DEFAULT_BODY_SCALE = 1.0;

/**
 * 곡선 정규화 상수 k 산출 — mercury effective(`radius × 700`) 를 floor 로 고정.
 *
 * `mercury.radius^p × k = mercury.radius × 700` → `k = 700 × mercury.radius^(1-p)`.
 * p=0.5 일 때 `k = 700 × sqrt(mercury.radius)`, 등가 scale = `radius^(p-1) × k = 700 × (mercury/radius)^(1-p)`.
 */
function curveConstantK(p: number): number {
  const mercuryRadius = BODY_RADIUS_M.mercury!;
  return MERCURY_FLOOR_SCALE * Math.pow(mercuryRadius, 1 - p);
}

/**
 * 행성·왜소행성 압축 곡선 등가 scale: `radius^(p-1) × k`.
 * radius ≤ 0 시 NaN/복소수 → 렌더 crash 위험 → DEFAULT_BODY_SCALE fallback (cross-validate agy 5.0).
 */
function curveScale(radius: number, p: number): number {
  if (!(radius > 0)) {
    // NaN guard — radius ≤ 0 또는 NaN/undefined 시 실측 fallback (crash 회피).

    console.warn(
      `[body-scale] curveScale 비정상 radius=${radius} — DEFAULT(${DEFAULT_BODY_SCALE}) 폴백`,
    );
    return DEFAULT_BODY_SCALE;
  }
  return Math.pow(radius, p - 1) * curveConstantK(p);
}

/**
 * 주어진 압축 지수 p 로 전체 body 등가 scale 룩업 산출 (모듈 로드 시 1회 / `?bodyScaleP=` 시 1회).
 *
 * - sun: SUN_SCALE 별도 유지
 * - 행성·왜소: 곡선
 * - 위성: 정적 역산 (parent 곡선 eff × 수렴대비 / sat.radius)
 * - comet·극소형: COMET_SCALE 단일값
 */
function computeBodyScales(p: number): Record<string, number> {
  const scales: Record<string, number> = {};

  scales.sun = SUN_SCALE;

  for (const id of PLANET_IDS) {
    scales[id] = curveScale(BODY_RADIUS_M[id]!, p);
  }
  for (const id of DWARF_IDS) {
    scales[id] = curveScale(BODY_RADIUS_M[id]!, p);
  }

  // 위성 정적 역산 — parent 곡선 eff 를 1회 곱해 박제 (런타임 동적 곱 회피).
  for (const [satId, { parent, ratio }] of Object.entries(SATELLITE_CONVERGENCE)) {
    const satRadius = BODY_RADIUS_M[satId]!;
    const parentRadius = BODY_RADIUS_M[parent]!;
    const parentEff = parentRadius * curveScale(parentRadius, p);
    if (!(satRadius > 0)) {
      scales[satId] = DEFAULT_BODY_SCALE; // NaN guard
      continue;
    }
    scales[satId] = (parentEff * ratio) / satRadius;
  }

  for (const id of COMET_IDS) {
    scales[id] = COMET_SCALE;
  }

  return scales;
}

/**
 * body 별 시각 과장 배수 룩업 (default p=0.5 산출값, frozen).
 *
 * #762 이전: 5 그룹 비대칭 박제값. 이후: 그룹별 압축 곡선 산출값 (단조성 회복).
 * 모든 값이 ≠ 1.0 (DEFAULT) 이므로 celestial-info-panel "× N 과장 중" tooltip 정상 동작.
 */
export const BODY_SCALE: Readonly<Record<string, number>> = Object.freeze(
  computeBodyScales(DEFAULT_BODY_SCALE_P),
);

/**
 * body id 의 시각 과장 배수 조회 (default p). 미정의 시 1.0 (실측 / 가상 ID 가드).
 *
 * **사용처**:
 *   - `apps/web/src/components/sim-canvas.tsx` `createSolarSystemScene` 옵션 `bodyScale` 콜백 (default)
 *   - `apps/web/src/components/panels/celestial-info-panel.tsx` "× N 과장 중" tooltip
 *
 * `bodyScale(id)` 콜백 인터페이스 불변 → 코어 0줄 (ADR §4 Concrete Prediction).
 */
export function getBodyScale(bodyId: string): number {
  return BODY_SCALE[bodyId] ?? DEFAULT_BODY_SCALE;
}

/**
 * `?bodyScaleP=` URL flag 용 — 임의 압축 지수 p 의 룩업 함수 반환 (factory).
 *
 * D-T2 사용자 검증 시 매 빌드 없이 p 값(0.4~0.6) 실시간 튜닝. 산출은 호출당 1회 (`?bodyScaleP=`
 * 는 초기 hydration 1회만 호출). 반환 함수는 `getBodyScale` 과 동형 시그니처라 scene 콜백 그대로 주입.
 *
 * @param p 압축 지수. parse-body-scale-p.ts 가 0.1~1.0 범위로 clamp 보장.
 */
export function getBodyScaleForP(p: number): (bodyId: string) => number {
  const scales = Object.freeze(computeBodyScales(p));
  return (bodyId: string) => scales[bodyId] ?? DEFAULT_BODY_SCALE;
}
