/**
 * P12-A #298 — Tier 엔진 (Display-Relative Scale Unification)
 *
 * ADR: `docs/decisions/20260423-display-relative-scale-unification.md`
 *
 * ## 계약 (ADR §결정 §주석 계약)
 *
 *  1. **renderScale 은 tier 함수** — `SCENE_UNIT_PER_METER` 하드코딩 금지. 모든 렌더 레이어는
 *     현재 tier 를 인자로 받아 `renderScaleForTier(tier)` 를 호출한다.
 *  2. **body mesh / orbit line / 거리** 모두 동일 renderScale 적용 (원칙 #4).
 *  3. **body kind 차등 없음** — 과거 `maxScaleForKind` (star=20 / planet=500 / moon=500 / dwarf=2000 /
 *     comet=20000) 은 상대 비율 왜곡 (원칙 #1 위배). 모든 body 는 `mesh.scaling = 1` 실측 유지.
 *  4. **Rust engine 경계 유지** — engine 좌표는 heliocentric 절대 m. tier 변환은 렌더 레이어 책임.
 *
 * ## Tier 3단 (Q6=6A)
 *
 * | Tier | 이름  | 관찰 대상                       | renderScale        | 1 unit ≈                |
 * | ---- | ----- | ------------------------------- | ------------------ | ----------------------- |
 * | T1   | solar | 해왕성 원일점 (30.3 AU) 궤도선  | 8.4e-11            | 1.19e10 m ≈ 0.08 AU     |
 * | T2   | inner | 화성 원일점 (1.666 AU) 궤도선   | 1.54e-9            | 6.50e8 m ≈ 0.0043 AU    |
 * | T3   | body  | focus body (지구 직경 1.275e7m) | 2.51e-5            | 3.98e4 m ≈ 40 km        |
 *
 * 기준 viewport: 1280×800. 좁은 축 95% / 가로 60% / 세로 40% DoD (V1/V3/V5).
 *
 * ## 하이브리드 트리거 (Q7=7-d2)
 *
 *  - focus body 있음 → `tierFromFocus(focusKind, cameraDistMeters)`:
 *    - star (태양) focus → T1 solar
 *    - planet focus → T2 inner (또는 카메라 거리가 매우 가까우면 T3 body)
 *    - moon / dwarf / comet focus → T3 body (세부 관찰 의도)
 *  - focus 없음 (free-fly) → `tierFromCameraDistance(cameraFromSunMeters, currentTier)`:
 *    - 카메라가 원점(태양) 에서 얼마나 떨어져 있는가로 판정
 *    - **히스테리시스 ±15%** — 현 tier 에서 경계의 115% 초과 시 outer tier, 85% 미만 시 inner tier
 *    - 왕복 flicker 방지 (A2 DoD ≥15%)
 */

import { AU } from '@astro-simulator/shared';

import type { Vec3Double } from '../coords/vec3.js';

/** P12-A Tier 3단 (Q6=6A). */
export type Tier = 'solar' | 'inner' | 'body';

/**
 * Tier 별 renderScale (m → scene unit 배수).
 *
 * ADR §1 §4 수식 유도 (1280×800 viewport 기준):
 *  - T1 solar: 해왕성 30.3 AU (4.53e12 m) → 380 unit (800×0.95÷2) → 380 / 4.53e12 ≈ 8.4e-11
 *  - T2 inner: 화성 1.666 AU (2.49e11 m) → 384 unit (1280×0.60÷2) → 384 / 2.49e11 ≈ 1.54e-9
 *  - T3 body: 지구 직경 1.275e7 m → 320 unit (800×0.40) → 320 / 1.275e7 ≈ 2.51e-5
 */
const RENDER_SCALE: Record<Tier, number> = {
  solar: 8.4e-11,
  inner: 1.54e-9,
  body: 2.51e-5,
};

/**
 * Tier 경계 — free-fly 에서 카메라-원점 거리로 판정.
 * 단위: m. 경계값은 "tier 에 진입하는 하한" (상위 tier 경계 = 하위 tier 진입 하한).
 *
 *  - cameraFromSun < BOUNDARY.innerUpper → T3 body
 *  - BOUNDARY.innerUpper ≤ cameraFromSun < BOUNDARY.solarUpper → T2 inner
 *  - BOUNDARY.solarUpper ≤ cameraFromSun → T1 solar
 *
 * 히스테리시스 ±15% 는 `tierFromCameraDistance` 가 currentTier 를 받아 개별 적용.
 */
const BOUNDARY = {
  /** T3 → T2 경계 (m). 화성 궤도 반경 1.52 AU 근처 */
  innerUpper: 0.3 * AU,
  /** T2 → T1 경계 (m). 소행성대 바깥 ~3 AU 근처 */
  solarUpper: 3 * AU,
};

/**
 * planet focus 의 body ↔ inner 경계 (m). focus body 로부터 카메라 거리가 이 값 미만이면
 * body(세부 관찰), 이상이면 inner(궤도 맥락). free-fly 의 `BOUNDARY.innerUpper`(0.3 AU) 와는
 * 별개 축 — focus 경로는 focus body 기준 근접 거리라 더 작은 임계(0.1 AU) 를 쓴다.
 *
 * #818 — 매직 넘버(`0.1 * AU`) 상수화 + 히스테리시스 대칭 적용 기준점.
 */
const PLANET_FOCUS_BODY_BOUNDARY = 0.1 * AU;

/** 히스테리시스 대역폭 (A2 DoD ≥15%). */
export const TIER_HYSTERESIS = 0.15;

/**
 * Tier 별 렌더 스케일 배수 (m → scene unit).
 *
 * @example
 *   const mesh_x = world_x_m * renderScaleForTier('solar'); // 해왕성 30 AU → 3.8 scene unit
 */
export function renderScaleForTier(tier: Tier): number {
  return RENDER_SCALE[tier];
}

/**
 * Focus body kind + 카메라 거리 기반 tier 판정 (Q7 focus 경로).
 *
 *  - star focus (태양) → T1 solar
 *  - planet focus → 카메라 거리로 T2 inner / T3 body 판정 (가까우면 body, 멀면 inner)
 *  - moon / dwarf-planet / comet focus → T3 body (세부 관찰 의도)
 *
 * #818 — planet 분기 히스테리시스 (`currentTier` 전달 시). 대형 body(jupiter/saturn) focus 에서
 * 줌인이 body tier 로 crossing 가능해진 뒤(#818 (c) apparent-size 보존 fix 로 body 안정화),
 * body↔inner 경계(0.1 AU) 를 매 프레임 왕복하면 setTier 가 매 프레임 detachControl 을 반복해
 * flip-flop(tier thrash) 를 노출한다. `tierFromCameraDistance` 의 free-fly ±15% 와 대칭으로,
 * body 에서는 경계 115% 초과 시에만 inner 로, inner 에서는 85% 미만 시에만 body 로 전환한다.
 *
 * `currentTier` 미전달(초기 focus 판정 — `applyFocusTier`) 시 plain 경계(기존 동작 불변). 매 프레임
 * 재판정 경로(`updateTierByCamera`) 만 `activeTier` 를 전달해 히스테리시스를 적용한다.
 *
 * @param focusKind focus body 의 kind ('star' | 'planet' | 'moon' | 'dwarf-planet' | 'comet' 등)
 * @param cameraDistanceMeters focus body 로부터 카메라까지 거리 (m)
 * @param currentTier 현재 tier — planet 분기 히스테리시스 적용 기준 (미전달 시 non-hysteresis)
 */
export function tierFromFocus(
  focusKind: string,
  cameraDistanceMeters: number,
  currentTier?: Tier,
): Tier {
  if (focusKind === 'star') {
    // 태양 focus — 전체 태양계 뷰.
    return 'solar';
  }
  if (focusKind === 'planet') {
    // planet focus — 카메라 거리로 세부 관찰(body) vs 궤도 맥락(inner) 구분.
    // #818 히스테리시스 (tierFromCameraDistance 의 ±15% 대칭):
    //  - currentTier 'body'(근접) → 경계 115% 초과로 멀어질 때만 inner 로 업시프트
    //  - currentTier 'inner'(맥락) → 경계 85% 미만으로 근접할 때만 body 로 다운시프트
    //  - 그 외(초기/solar, currentTier 미전달) → plain 경계 (기존 동작 불변)
    const d = cameraDistanceMeters;
    if (currentTier === 'body') {
      return d > PLANET_FOCUS_BODY_BOUNDARY * (1 + TIER_HYSTERESIS) ? 'inner' : 'body';
    }
    if (currentTier === 'inner') {
      return d < PLANET_FOCUS_BODY_BOUNDARY * (1 - TIER_HYSTERESIS) ? 'body' : 'inner';
    }
    return d < PLANET_FOCUS_BODY_BOUNDARY ? 'body' : 'inner';
  }
  // P12-A #298 N4 — 미지 kind silent fallback 방지. 주석-구현 drift (CLAUDE.md 교훈) 회피.
  // 알려진 세부 관찰 kind 를 명시 분기하고, 그 외는 dev 경고 + body fallback 유지.
  if (
    focusKind === 'moon' ||
    focusKind === 'dwarf-planet' ||
    focusKind === 'comet' ||
    focusKind === 'asteroid'
  ) {
    return 'body';
  }
  // prod 빌드에서는 console.warn 도 DCE 대상일 수 있으나 스킵되더라도 동작 영향 없음 (body fallback).
  console.warn(`[tier] tierFromFocus: 미지 focusKind '${focusKind}' → 'body' fallback`);
  return 'body';
}

/**
 * 카메라-원점(태양) 거리 기반 tier 판정 (Q7 free-fly 경로).
 *
 * 히스테리시스 ±15% 적용 — 현 tier 에서 outer 경계의 `1 + TIER_HYSTERESIS` 초과 시 upshift,
 * inner 경계의 `1 - TIER_HYSTERESIS` 미만 시 downshift. 경계값 왕복 flicker 방지 (A2 DoD).
 *
 * @param cameraFromSunMeters 카메라 위치에서 원점까지 거리 (m)
 * @param currentTier 현재 tier — 히스테리시스 적용 기준
 */
export function tierFromCameraDistance(cameraFromSunMeters: number, currentTier: Tier): Tier {
  const d = cameraFromSunMeters;
  // body 에서 inner 로 upshift: innerUpper × (1 + hysteresis) 초과 시
  // inner 에서 body 로 downshift: innerUpper × (1 - hysteresis) 미만 시
  // inner 에서 solar 로 upshift: solarUpper × (1 + hysteresis) 초과 시
  // solar 에서 inner 로 downshift: solarUpper × (1 - hysteresis) 미만 시
  const hiInner = BOUNDARY.innerUpper * (1 + TIER_HYSTERESIS);
  const loInner = BOUNDARY.innerUpper * (1 - TIER_HYSTERESIS);
  const hiSolar = BOUNDARY.solarUpper * (1 + TIER_HYSTERESIS);
  const loSolar = BOUNDARY.solarUpper * (1 - TIER_HYSTERESIS);

  switch (currentTier) {
    case 'body':
      // body 에서는 innerUpper 의 115% 초과해야 inner 로 업시프트
      if (d > hiInner) {
        // 더 멀면 solar 까지 한 번에 업시프트 가능
        return d > hiSolar ? 'solar' : 'inner';
      }
      return 'body';
    case 'inner':
      // inner 에서는 solarUpper 의 115% 초과 시 solar, innerUpper 의 85% 미만 시 body
      if (d > hiSolar) return 'solar';
      if (d < loInner) return 'body';
      return 'inner';
    case 'solar':
      // solar 에서는 solarUpper 의 85% 미만 시 inner (두 단계는 한번에 내려가지 않음 —
      // 시야 단절 방지. 카메라가 급히 근접하면 inner 에서 다음 프레임에 body 로 추가 downshift)
      if (d < loSolar) return 'inner';
      return 'solar';
  }
}

/**
 * 현재 tier 판정 — 하이브리드 트리거 (Q7=7-d2).
 *
 * ADR §2 알고리즘:
 *  - focusBodyId 존재 → focus 경로 (`tierFromFocus`)
 *  - focusBodyId 없음 → free-fly 경로 (`tierFromCameraDistance`)
 *
 * @param prevTier 이전 프레임의 tier (히스테리시스 적용 기준). 초기값 `'solar'` 권장.
 * @param focusBodyInfo focus body 정보 또는 null (free-fly)
 * @param cameraFromSunMeters 카메라 위치에서 원점(태양)까지 거리 (m)
 * @param cameraFromFocusMeters focus body 에서 카메라까지 거리 (m). focusBodyInfo 있을 때만 사용
 *
 * P12-A #298 N3 — 과거 함수명 `currentTier` 는 파라미터 섀도잉이 발생했다. `resolveCurrentTier`
 * 로 명시적 동사명 채택. `scene/index.ts` 에서 기존 alias 도 계속 re-export 하여 API 호환 유지.
 */
export function resolveCurrentTier(
  prevTier: Tier,
  focusBodyInfo: { kind: string } | null,
  cameraFromSunMeters: number,
  cameraFromFocusMeters: number,
): Tier {
  if (focusBodyInfo) {
    return tierFromFocus(focusBodyInfo.kind, cameraFromFocusMeters);
  }
  return tierFromCameraDistance(cameraFromSunMeters, prevTier);
}

/**
 * 초기 tier 결정 — 씬 생성 직후 호출. 기본은 'solar' (전체 태양계 뷰).
 * 테스트 / Storybook 에서 override 하고 싶으면 options.initialTier 사용.
 */
export function initialTier(): Tier {
  return 'solar';
}

/**
 * #313 M2 QA 회귀 수정 — `setTier` 대칭 처리 헬퍼 (순수 함수).
 *
 * `runTierTransition` 은 `focusMesh.absolutePosition` 을 읽어 카메라 target 을 재계산한다
 * (tier-transition.ts line 216-219). 즉 tier 전환 **시점에** mesh.position 이 새 tier 좌표계
 * (올바른 origin + newScale) 로 이미 재계산되어 있어야 한다.
 *
 * 비대칭 처리 (T1/T2 만 reset, T3 진입 시 origin 미갱신) 시:
 *  1. setTier('body') 호출 시점 origin 은 여전히 [0,0,0] (T1/T2 에서 왔으므로)
 *  2. `runTierTransition` 이 focusMesh.absolutePosition 을 [world * newScale] 로 읽음 (origin 0 기준)
 *  3. 카메라 target 이 이 좌표로 설정
 *  4. 다음 updateAt 의 primary follow 가 origin = focusWorld 로 이동 → mesh.position = [0,0,0] 근처
 *  5. 카메라 target 과 mesh 가 어긋남 — PR #315 QA 실측 A1 119.9px / V5 296px 퇴행
 *
 * 본 함수는 tier 전환 시 적용할 origin target 을 반환한다:
 *  - T1/T2 진입 → `[0,0,0]` (reset)
 *  - T3 진입 + focus body 있음 → focus body world 좌표
 *  - T3 진입 + focus 없음 (free-fly) → `null` (기존 origin 유지 — safety net 이 다음 프레임 재계산)
 *
 * 호출부는 반환값이:
 *  - `[0,0,0]` 이면 `floatingOrigin.reset()`
 *  - 그 외 배열이면 `floatingOrigin.setOriginToBody(value)`
 *  - `null` 이면 origin 변경 없음
 * 을 실행하고, 이어서 origin + newScale 기준으로 mesh.position 재계산 루프를 돌려야 한다.
 *
 * @param tier 전환 target tier
 * @param focusBodyId 현재 focus body id (null 이면 free-fly)
 * @param lookupFocusWorld focus body 의 절대 월드 좌표 lookup
 * @returns 적용할 origin 값 또는 null (변경 없음)
 */
export function computeFloatingOriginForTier(
  tier: Tier,
  focusBodyId: string | null,
  lookupFocusWorld: (id: string) => Vec3Double | undefined,
): Vec3Double | null {
  if (tier !== 'body') return [0, 0, 0];
  if (focusBodyId === null) return null;
  const focusWorld = lookupFocusWorld(focusBodyId);
  if (!focusWorld) return null;
  return [focusWorld[0], focusWorld[1], focusWorld[2]];
}
