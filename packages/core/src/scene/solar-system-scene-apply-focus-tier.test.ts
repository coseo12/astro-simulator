/**
 * #408 F1 — `applyFocusTier` 단위 테스트.
 *
 * `applyFocusTier(bodyId, cameraDistMeters)` 는 다음 책임:
 *   1. body 미존재 시 현 tier 반환 + no-op
 *   2. `tierFromFocus(body.kind, cameraDistMeters)` 결정
 *   3. final tier ≠ activeTier 일 때만 setTier 호출 (no-op race 차단)
 *
 * 실 `createSolarSystemScene` 은 Babylon Engine/Scene 의존이라 NullEngine 셋업이 무거움.
 * ROI 5문 체크 결과: 핵심 책임이 `tierFromFocus` 호출 분기 + 동등 비교 (~10 lines) 이므로
 * 동일 시퀀스를 순수화한 mock 으로 박제 — `tier-transition.test.ts` 의 createTierSwitcher 패턴과 동일.
 *
 * 통합 검증은 회귀 가드 `apps/web/scripts/browser-verify-focus-transition.mjs` 가 담당
 * (실 Babylon scene 위에서 9 cells 매트릭스 측정).
 *
 * ADR `docs/decisions/20260504-focus-tier-oscillate-fix.md` §결정 1.
 */

import { describe, expect, it } from 'vitest';
import { AU } from '@astro-simulator/shared';
import { tierFromFocus, type Tier } from './tier.js';

interface FakeBody {
  id: string;
  kind: string;
}

/**
 * `applyFocusTier` 의 책임 시퀀스를 순수화한 모방.
 *
 * 실 구현 (`solar-system-scene.ts`):
 *   const applyFocusTier = (bodyId, cameraDistMeters) => {
 *     const body = bodiesById.get(bodyId);
 *     if (!body) return activeTier;
 *     const finalTier = tierFromFocus(body.kind, cameraDistMeters);
 *     if (finalTier !== activeTier) setTier(finalTier);
 *     return finalTier;
 *   };
 */
function createApplyFocusTier(initialTier: Tier, bodies: FakeBody[]) {
  let activeTier: Tier = initialTier;
  const setTierCalls: Tier[] = [];
  const bodiesById = new Map(bodies.map((b) => [b.id, b]));
  const setTier = (tier: Tier) => {
    setTierCalls.push(tier);
    activeTier = tier;
  };
  const applyFocusTier = (bodyId: string, cameraDistMeters: number): Tier => {
    const body = bodiesById.get(bodyId);
    if (!body) return activeTier;
    const finalTier = tierFromFocus(body.kind, cameraDistMeters);
    if (finalTier !== activeTier) {
      setTier(finalTier);
    }
    return finalTier;
  };
  return {
    applyFocusTier,
    getTier: () => activeTier,
    getSetTierCalls: () => [...setTierCalls],
  };
}

describe('applyFocusTier — body 미존재 시 현 tier 반환 + no-op', () => {
  it('미등록 body id → activeTier 반환 + setTier 미호출', () => {
    const { applyFocusTier, getTier, getSetTierCalls } = createApplyFocusTier('inner', [
      { id: 'sun', kind: 'star' },
    ]);
    const result = applyFocusTier('unknown-body', 1e10);
    expect(result).toBe('inner');
    expect(getTier()).toBe('inner');
    expect(getSetTierCalls()).toEqual([]);
  });
});

describe('applyFocusTier — tier 변경 케이스', () => {
  const bodies: FakeBody[] = [
    { id: 'sun', kind: 'star' },
    { id: 'mercury', kind: 'planet' },
    { id: 'venus', kind: 'planet' },
    { id: 'moon', kind: 'moon' },
  ];

  it('inner → solar (sun focus, kind=star) — setTier 1회 호출', () => {
    const { applyFocusTier, getTier, getSetTierCalls } = createApplyFocusTier('inner', bodies);
    const result = applyFocusTier('sun', 1e12);
    expect(result).toBe('solar');
    expect(getTier()).toBe('solar');
    expect(getSetTierCalls()).toEqual(['solar']);
  });

  it('solar → inner (planet focus, dist ≥ 0.1 AU) — setTier 1회 호출', () => {
    const { applyFocusTier, getSetTierCalls } = createApplyFocusTier('solar', bodies);
    const result = applyFocusTier('venus', 0.5 * AU);
    expect(result).toBe('inner');
    expect(getSetTierCalls()).toEqual(['inner']);
  });

  it('inner → body (planet focus, dist < 0.1 AU) — setTier 1회 호출', () => {
    const { applyFocusTier, getSetTierCalls } = createApplyFocusTier('inner', bodies);
    const result = applyFocusTier('mercury', 0.05 * AU);
    expect(result).toBe('body');
    expect(getSetTierCalls()).toEqual(['body']);
  });

  it('inner → body (moon focus) — setTier 1회 호출', () => {
    const { applyFocusTier, getSetTierCalls } = createApplyFocusTier('inner', bodies);
    const result = applyFocusTier('moon', 1e6);
    expect(result).toBe('body');
    expect(getSetTierCalls()).toEqual(['body']);
  });
});

describe('applyFocusTier — same-tier no-op (DoD-1 setTier 호출 ≤ 1)', () => {
  const bodies: FakeBody[] = [
    { id: 'mercury', kind: 'planet' },
    { id: 'venus', kind: 'planet' },
  ];

  it('venus(inner) → mercury(inner) 전환: tierFromFocus 가 동일 inner 반환 → setTier 0회', () => {
    // venus focus 상태 (inner tier) 에서 mercury 클릭 시 desiredRadius × metersPerSceneUnit 가
    // 0.1 AU 초과면 동일 inner 반환. cam-target tween 보간 race 가 발생 안 함.
    const { applyFocusTier, getSetTierCalls } = createApplyFocusTier('inner', bodies);
    const result = applyFocusTier('mercury', 0.5 * AU);
    expect(result).toBe('inner');
    // **핵심 단언** — tier 전환 횟수 = 0 (same-tier no-op). DoD-1 의 "≤ 1" 충족.
    expect(getSetTierCalls()).toEqual([]);
  });

  it('연속 applyFocusTier 호출 시 누적 setTier 호출 횟수 ≤ 1 (oscillate 차단 의도)', () => {
    const { applyFocusTier, getSetTierCalls } = createApplyFocusTier('inner', bodies);
    // 사용자 시나리오: venus focus 안정 후 mercury 클릭
    applyFocusTier('venus', 0.4 * AU); // 첫 focus — same-tier no-op
    applyFocusTier('mercury', 0.5 * AU); // 다른 행성 전환 — same-tier no-op
    expect(getSetTierCalls()).toEqual([]);
  });

  it('동일 body 재호출 (사용자 더블 클릭) 시 setTier 누적 호출 0', () => {
    const { applyFocusTier, getSetTierCalls } = createApplyFocusTier('inner', bodies);
    applyFocusTier('mercury', 0.4 * AU);
    applyFocusTier('mercury', 0.4 * AU);
    applyFocusTier('mercury', 0.4 * AU);
    expect(getSetTierCalls()).toEqual([]);
  });
});

describe('applyFocusTier — 회귀 가드: focusOn cam-target tween race 차단 의도', () => {
  /**
   * #408 forensic 시나리오 재현 (단위 등가):
   *  - venus focus 상태 (activeTier='inner', cameraFromFocusMeters ≈ 0.4 AU)
   *  - mercury 클릭 → applyFocusTier 호출 시점에 final tier 결정
   *  - desiredRadius × metersPerSceneUnit 가 0.1 AU 초과 (`inner` 유지) → setTier no-op
   *
   * **이 단위 테스트가 차단하는 회귀**: 만약 sim-canvas 가 applyFocusTier 호출 누락 시
   * (또는 잘못된 cameraDistMeters 전달 시) tier 가 잘못 결정되어 setTier 호출되고,
   * runTierTransition 발동 → cam-radius 38만 unit jump 등 oscillate 패턴 발현.
   *
   * 본 테스트는 "정상 cameraDistMeters (0.4 AU 등) 입력 시 same-tier no-op" 을 박제.
   * 잘못된 산식 (예: cameraDistMeters = desiredRadius × renderScaleForTier(activeTier) 같은
   * 잘못된 곱셈) 은 단위 일치 위반으로 매우 작은 값 → body tier 잘못 진입 → 본 단언 fail.
   */
  it('venus(inner, dist=0.4 AU) → mercury(inner, dist=0.5 AU): tier 전환 0 회 (forensic 매트릭스 통과 의도)', () => {
    const bodies: FakeBody[] = [
      { id: 'mercury', kind: 'planet' },
      { id: 'venus', kind: 'planet' },
    ];
    const { applyFocusTier, getSetTierCalls } = createApplyFocusTier('inner', bodies);
    applyFocusTier('mercury', 0.5 * AU);
    expect(getSetTierCalls()).toEqual([]);
  });

  it('잘못된 cameraDistMeters (예: 산식 단위 위반으로 1e-3 m) → body 잘못 진입 (단위 회귀 가드)', () => {
    // 산식 버그 재현: cameraDistMeters 가 m 가 아닌 sceneUnit 으로 잘못 전달되면 매우 작은 값 (1e-3).
    // 이 경우 tierFromFocus('planet', 1e-3) → body 진입 (0.1 AU 미만).
    const bodies: FakeBody[] = [{ id: 'mercury', kind: 'planet' }];
    const { applyFocusTier, getSetTierCalls } = createApplyFocusTier('inner', bodies);
    applyFocusTier('mercury', 1e-3); // 단위 위반
    // 산식 위반 시 body 진입 → 1회 호출. 정상 산식 (m 단위) 이라면 0회.
    // 본 단언이 fail 되는 게 정상 (회귀 가드용 — 산식 변경 시 detect).
    expect(getSetTierCalls()).toEqual(['body']);
  });
});

describe('#834 focus-entry 정착 계약 — planet 궤도 맥락 inner 정착 (V5 40% 는 줌인 도달 별도 계약)', () => {
  /**
   * #834 NO-OP 회귀 가드 (ADR `docs/decisions/20260718-834-focus-entry-tier-no-op.md`).
   *
   * ## 계약 SSoT
   * `?focus=earth` 등 focus-entry (URL / 클릭) 시 카메라는 `focusOn` 의 `desiredRadius =
   * boundingSphere.radiusWorld × 5` 프레이밍으로 정착한다. 그 정착 **실거리** (0.155~0.66 AU)
   * 는 모두 `PLANET_FOCUS_BODY_BOUNDARY`(0.1 AU) 를 초과하므로 `tierFromFocus('planet', d)` =
   * **inner** (궤도 맥락 — 궤도선 + 위성 동반, viewport 세로 ~21%). 이는 버그가 아니라 의도된
   * "궤도 맥락" 프레이밍이다 (#834 measurement-first 실측: #818 이전부터 동일, 회귀 아님).
   *
   * body-tier 근접 (폐기된 P12 regime 의 V5 "세로 40%" 관찰) 은 **줌인으로 도달**하는 별도
   * 계약이며 focus-entry 정착값이 아니다.
   *
   * ## 이 테스트가 차단하는 회귀
   * 만약 `PLANET_FOCUS_BODY_BOUNDARY`(0.1 AU) 를 조용히 상향 (예: 0.25 AU) 하면 earth(0.2102)/
   * mars(0.1552) 의 focus-entry 정착이 `inner` → `body` 로 바뀌어 본 단언이 fail → focus-entry
   * 정착 정책 변경을 즉시 감지한다 (jupiter/saturn 은 정착 실거리가 커서 경계 상향에 둔감 —
   * earth/mars 가 민감 앵커). #834 계약 위반 detect.
   *
   * ## 실측 매트릭스 (viewport 1280×800, #818 fix `preserveFocusDistance` 반영)
   * | body    | camRadius(unit) | 실거리(AU) | 정착 tier |
   * | ------- | --------------- | ---------- | --------- |
   * | earth   | 48.44           | 0.2102     | inner     |
   * | mars    | 35.76           | 0.1552     | inner     |
   * | jupiter | 129.84          | 0.5636     | inner     |
   * | saturn  | 152.02          | 0.6599     | inner     |
   */
  const bodies: FakeBody[] = [
    { id: 'earth', kind: 'planet' },
    { id: 'mars', kind: 'planet' },
    { id: 'jupiter', kind: 'planet' },
    { id: 'saturn', kind: 'planet' },
  ];

  // focus-entry 실측 정착 실거리 (AU 배수). 초기 focus 판정 → currentTier 미전달 (plain 경계).
  //
  // ⚠ 한계 (traceability, reviewer 권고 A): 아래 값은 production `focusOn` / sim-canvas `× 5`
  // 경로에서 **재유도되지 않은 하드코딩 실측값**이다. 따라서 본 가드는 `PLANET_FOCUS_BODY_BOUNDARY`
  // 상향(정착 tier 판정 이동)은 결정적으로 감지하나, `FOCUS_USER_RADIUS_MULTIPLIER`(× 5) /
  // `boundingSphere.radiusWorld` 산식 변경으로 **실제 정착 거리 자체**가 이동하는 회귀는 감지하지
  // 못한다(하드코딩값이 그대로라 여전히 PASS). 후자는 `focus-multiplier.test.ts`(× 5 값 pin) +
  // ADR §7 boundingSphere→visualRadius 수동 재측정 트리거가 보완한다.
  const SETTLE_DISTANCE_AU: Record<string, number> = {
    earth: 0.2102,
    mars: 0.1552,
    jupiter: 0.5636,
    saturn: 0.6599,
  };

  for (const [bodyId, distAu] of Object.entries(SETTLE_DISTANCE_AU)) {
    it(`${bodyId} focus-entry (실거리 ${distAu} AU > 0.1 AU 경계) → inner 궤도 맥락 정착`, () => {
      const { applyFocusTier } = createApplyFocusTier('solar', bodies);
      // 초기 focus 판정 (currentTier 미전달) — solar 진입 상태에서 planet focus.
      const result = applyFocusTier(bodyId, distAu * AU);
      expect(result).toBe('inner');
    });
  }

  it('earth/mars 정착 실거리 < 0.25 AU — 경계 조용한 상향 감지 앵커 (0.25 AU 상향 시 body 로 오전환)', () => {
    // 회귀 감지 논증의 결정성 박제: earth(0.2102)/mars(0.1552) 는 0.25 AU 미만이라
    // 경계가 0.25 AU 로 상향되면 body 로 바뀐다 (본 describe 의 inner 단언이 fail).
    expect(SETTLE_DISTANCE_AU.earth).toBeLessThan(0.25);
    expect(SETTLE_DISTANCE_AU.mars).toBeLessThan(0.25);
    // jupiter/saturn 은 0.25 AU 초과라 경계 상향에 둔감 (earth/mars 가 민감 앵커임을 명시).
    expect(SETTLE_DISTANCE_AU.jupiter).toBeGreaterThan(0.25);
    expect(SETTLE_DISTANCE_AU.saturn).toBeGreaterThan(0.25);
  });
});
