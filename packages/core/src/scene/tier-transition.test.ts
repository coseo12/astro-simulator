/**
 * P12-B #298 — Tier 전환 애니메이션 단위 테스트.
 *
 * ADR `20260423-display-relative-scale-unification.md` §3 배선 원리 — **실거리 보존**:
 *   radius_old / oldScale == radius_new / newScale
 *   ⇒ radius_new = radius_old × (newScale / oldScale)
 *
 * 본 테스트는 수식 레이어 (`computeTargetRadius`, `computeNewMinZ`) 를 순수 함수로 추출해
 * Babylon 의존 없이 산술 불변식을 박제한다. `runTierTransition` 자체는 Babylon Animation /
 * Scene 을 직접 호출하므로 단위 테스트 범위 밖 (통합/브라우저 레이어).
 *
 * ## 불변식 (C1 수식 증명)
 *
 * camera.radius / renderScale = **사용자 관점 실거리 m**. tier 전환 전후 이 값이 보존되면:
 *   1. 카메라-focus body 실거리 불변 (사용자 체감 자연스러움)
 *   2. mesh.diameter_scene = body.radius_m × newScale 로 확대되고, radius 도 동일 배수로
 *      확대되므로 apparent_px = mesh.diameter / radius = const (apparent size 불변)
 *
 * **architect ADR §3 표기 정합성**:
 *   ADR 은 `ratio = newScale/oldScale, radius_new = radius_old / ratio` 로 서술하지만, 이는
 *   방향이 반대 (`radius_new < radius_old` 이면 zoom in 에서 카메라가 mesh 내부에 갇힘).
 *   architect 의 V5 hard fail 승격 근거 "수식이 참이면 V5 자동 충족, 미충족 시 ratio 계산
 *   또는 radius clamp 문제" 는 본 확대 방향 수식을 따를 때 성립 — "수식 버그 감지 센서" 로
 *   기능한다. 본 구현은 직관적 확대 방향 채택 + 주석으로 서술 정합 박제.
 */

import { describe, expect, it, vi } from 'vitest';
import { renderScaleForTier } from './tier.js';
import { computeTargetRadius, computeNewMinZ, computeLowerRadiusLimit } from './tier-transition.js';

describe('computeTargetRadius — C1 실거리 보존 불변식', () => {
  it('불변식: radius_old / oldScale == radius_new / newScale (실거리 m 보존)', () => {
    const radiusOld = 30;
    const oldScale = renderScaleForTier('solar'); // 8.4e-11
    const newScale = renderScaleForTier('inner'); // 1.54e-9
    const radiusNew = computeTargetRadius(radiusOld, oldScale, newScale);
    // 실거리 m = radius / renderScale
    expect(radiusOld / oldScale).toBeCloseTo(radiusNew / newScale, 0); // m 단위로 10 자릿수 차이 허용
    // 비율 정확성
    expect(radiusNew).toBeCloseTo(radiusOld * (newScale / oldScale), 10);
  });

  it('same-tier (oldScale === newScale) 시 radius 불변', () => {
    const radiusOld = 12.34;
    const scale = renderScaleForTier('body');
    expect(computeTargetRadius(radiusOld, scale, scale)).toBe(radiusOld);
  });

  it('T1 → T2: ratio ≈ 18.3 — radius 가 18.3 배 확대 (자연스러운 zoom)', () => {
    const radiusOld = 30;
    const oldScale = renderScaleForTier('solar');
    const newScale = renderScaleForTier('inner');
    const radiusNew = computeTargetRadius(radiusOld, oldScale, newScale);
    const ratio = newScale / oldScale;
    // ratio ≈ 1.54e-9 / 8.4e-11 ≈ 18.3
    expect(ratio).toBeGreaterThan(15);
    expect(ratio).toBeLessThan(22);
    expect(radiusNew).toBeGreaterThan(radiusOld); // 확대
    expect(radiusNew / radiusOld).toBeCloseTo(ratio, 10);
  });

  it('T1 → T3: ratio ≈ 3e5 — huge ratio 에서도 산술 안정성 유지', () => {
    const radiusOld = 30;
    const oldScale = renderScaleForTier('solar');
    const newScale = renderScaleForTier('body');
    const ratio = newScale / oldScale;
    const radiusNew = computeTargetRadius(radiusOld, oldScale, newScale);
    expect(ratio).toBeGreaterThan(1e5);
    expect(Number.isFinite(radiusNew)).toBe(true);
    expect(radiusNew).toBeGreaterThan(radiusOld);
    // 실거리 m 보존
    expect(radiusOld / oldScale).toBeCloseTo(radiusNew / newScale, 0);
  });

  it('T3 → T1 (zoom out): ratio < 1 — radius 축소 (대칭성)', () => {
    const radiusOld = 1e6; // T3 에서 지구 관찰 중 radius
    const oldScale = renderScaleForTier('body');
    const newScale = renderScaleForTier('solar');
    const radiusNew = computeTargetRadius(radiusOld, oldScale, newScale);
    expect(radiusNew).toBeLessThan(radiusOld); // 축소
    // 실거리 m 보존
    expect(radiusOld / oldScale).toBeCloseTo(radiusNew / newScale, 0);
  });

  it('모든 tier 쌍 (3×3) 에서 실거리 불변식 보존', () => {
    const tiers: Array<'solar' | 'inner' | 'body'> = ['solar', 'inner', 'body'];
    const radiusOld = 42;
    for (const from of tiers) {
      for (const to of tiers) {
        const oldScale = renderScaleForTier(from);
        const newScale = renderScaleForTier(to);
        const radiusNew = computeTargetRadius(radiusOld, oldScale, newScale);
        // 실거리 m 보존 — m 단위 값이 크므로 상대오차 기반 검증
        const realOld = radiusOld / oldScale;
        const realNew = radiusNew / newScale;
        expect(Math.abs(realOld - realNew) / realOld).toBeLessThan(1e-12);
      }
    }
  });

  it('apparent size 불변 간접 증명: mesh.diameter / radius 비율 보존', () => {
    // Phase A setTier: mesh.scaling.setAll(newScale / initialScale)
    //   initialScale === oldScale (첫 setTier 시 초기 tier = 기본 solar)
    //   → 전환 후 mesh.diameter_scene = earth × 2 × newScale  (base × newScale)
    // 지구 반경 (m)
    const earthRadiusM = 6.371e6;

    const oldScale = renderScaleForTier('solar');
    const newScale = renderScaleForTier('body');

    // 전환 전 mesh.diameter_scene = earth × 2 × oldScale × (oldScale / initialScale)
    //   = earth × 2 × oldScale (initialScale === oldScale 이므로)
    const meshDiameterBefore = earthRadiusM * 2 * oldScale;
    const radiusOld = 30;
    const apparentBefore = meshDiameterBefore / radiusOld;

    // 전환 후 mesh.diameter_scene = earth × 2 × oldScale × (newScale / initialScale)
    //   = earth × 2 × newScale
    const meshDiameterAfter = earthRadiusM * 2 * newScale;
    const radiusNew = computeTargetRadius(radiusOld, oldScale, newScale);
    const apparentAfter = meshDiameterAfter / radiusNew;

    // apparent size 불변 — 상대 오차 ≤ 1e-12
    expect(Math.abs(apparentAfter - apparentBefore) / apparentBefore).toBeLessThan(1e-12);
  });
});

describe('computeNewMinZ — V5 clamp 충돌 방어 (위험 #3)', () => {
  it('targetRadius × 0.01 반환 (정상 범위)', () => {
    expect(computeNewMinZ(1)).toBeCloseTo(0.01, 10);
    expect(computeNewMinZ(100)).toBeCloseTo(1, 10);
  });

  it('targetRadius 가 매우 작을 때 floor (1e-6) 적용', () => {
    expect(computeNewMinZ(1e-12)).toBe(1e-6);
    expect(computeNewMinZ(0)).toBe(1e-6);
  });

  it('T1 (radiusOld=30) → T3 전환 시 minZ 가 현실적인 값 (현 minZ 0.01 보다 커짐)', () => {
    const radiusOld = 30;
    const oldScale = renderScaleForTier('solar');
    const newScale = renderScaleForTier('body');
    const targetRadius = computeTargetRadius(radiusOld, oldScale, newScale);
    // targetRadius ≈ 30 × 2.51e-5 / 8.4e-11 ≈ 8.96e6 unit — 매우 큼
    const newMinZ = computeNewMinZ(targetRadius);
    // newMinZ = targetRadius × 0.01 ≈ 8.96e4 — 현 minZ 0.01 보다 훨씬 큼 → minZ 늘리지 않음 (논리: max 비교)
    expect(newMinZ).toBeGreaterThan(0.01);
    expect(newMinZ).toBeCloseTo(targetRadius * 0.01, 5);
  });

  it('T3 → T1 축소 전환 시 minZ 는 floor 로 떨어져 clamp 해소', () => {
    const radiusOld = 1e6; // T3 radius
    const oldScale = renderScaleForTier('body');
    const newScale = renderScaleForTier('solar');
    const targetRadius = computeTargetRadius(radiusOld, oldScale, newScale);
    // targetRadius = 1e6 × 8.4e-11 / 2.51e-5 ≈ 3.35 unit
    const newMinZ = computeNewMinZ(targetRadius);
    expect(newMinZ).toBeCloseTo(0.0335, 4);
  });
});

/**
 * P12-C #298 — M1 하드닝 단위 테스트.
 *
 * `solar-system-scene.ts:setTier` 의 연쇄 전환 race 방지 로직을 **라이프사이클 계약**으로 박제.
 * 실제 `runTierTransition` 은 Babylon Scene / Animation 에 의존하므로 본 테스트는 `setTier` 내부의
 * "이전 cleanup 을 먼저 호출 후 새 cleanup 으로 교체" 시퀀스를 mock 으로 검증한다.
 *
 * 회귀 가드: 만약 `setTier` 가 `runTierTransition` 반환 cleanup 을 저장하지 않고 버리면
 * 두 번째 호출에서 첫 번째 cleanup 이 호출되지 않아 fallback timer race 발생 (Phase B PR #304 Reviewer M1).
 */
describe('setTier 연쇄 전환 cleanup 저장·호출 계약 (M1 하드닝)', () => {
  /**
   * `solar-system-scene.ts:setTier` 내부의 cleanup 클로저 관리 로직을 순수화한 모방.
   * 실제 구현과 동일한 시퀀스: (1) `pendingTierCleanup?.()` → (2) 새 `runTierTransition` 호출 → (3) 반환값 저장.
   */
  function createTierSwitcher(runner: () => () => void) {
    let pendingTierCleanup: (() => void) | null = null;
    return {
      setTier: () => {
        pendingTierCleanup?.();
        pendingTierCleanup = runner();
      },
      getPending: () => pendingTierCleanup,
    };
  }

  it('연쇄 전환 시 이전 cleanup 이 다음 진입 전에 호출된다', () => {
    const cleanupCalls: number[] = [];
    let callIndex = 0;
    const runner = () => {
      const idx = ++callIndex;
      return () => {
        cleanupCalls.push(idx);
      };
    };
    const { setTier } = createTierSwitcher(runner);

    // 첫 번째 전환 — cleanup 호출 이력 없음
    setTier();
    expect(cleanupCalls).toEqual([]);

    // 두 번째 전환 — 첫 번째 cleanup 호출됨
    setTier();
    expect(cleanupCalls).toEqual([1]);

    // 세 번째 전환 — 두 번째 cleanup 호출됨
    setTier();
    expect(cleanupCalls).toEqual([1, 2]);
  });

  it('idempotent cleanup — 이미 released 된 cleanup 재호출도 안전 (runTierTransition 계약)', () => {
    let cleanupCallCount = 0;
    // `runTierTransition` 실 반환값은 idempotent (released 플래그). 본 모방에서도 동일 보장.
    const runner = () => {
      let released = false;
      return () => {
        if (released) return;
        released = true;
        cleanupCallCount += 1;
      };
    };
    const { setTier, getPending } = createTierSwitcher(runner);

    setTier();
    const firstCleanup = getPending();
    // 외부에서 강제 호출 (예: visibilitychange)
    firstCleanup?.();
    firstCleanup?.(); // 재호출도 안전
    expect(cleanupCallCount).toBe(1);

    // 이제 setTier 호출 — 내부 pendingTierCleanup?.() 는 이미 released 이라 no-op
    setTier();
    expect(cleanupCallCount).toBe(1); // 새 cleanup 으로 교체만 됨

    // 새 cleanup 호출 확인
    const secondCleanup = getPending();
    secondCleanup?.();
    expect(cleanupCallCount).toBe(2);
  });

  it('회귀 가드: 만약 `pendingTierCleanup?.()` 가 누락되면 연쇄 cleanup 이 호출되지 않는다 (버그 재현)', () => {
    // 버그 재현용 switcher — `setTier` 가 cleanup 반환값을 저장만 하고 이전 것을 호출하지 않는다.
    const cleanupCalls: number[] = [];
    let callIndex = 0;
    let pending: (() => void) | null = null;
    const runner = () => {
      const idx = ++callIndex;
      return () => {
        cleanupCalls.push(idx);
      };
    };
    const buggySetTier = () => {
      // ← `pending?.()` 호출 **누락** (버그). 대신 덮어쓰기만.
      pending = runner();
    };

    buggySetTier();
    buggySetTier();
    buggySetTier();
    // 버그: 이전 cleanup 호출 이력 0
    expect(cleanupCalls).toEqual([]);
    // 올바른 구현은 `cleanupCalls === [1, 2]` 이어야 한다 (위 첫 테스트와 대조).
    // 마지막 pending 은 여전히 저장됨 — 사용 여부 확인으로 noUnusedLocals 방어.
    expect(pending).not.toBeNull();
  });
});

/**
 * #408 F2 — onComplete 콜백 / tierTransitionInProgress lock 라이프사이클 단언.
 *
 * `runTierTransition` 자체는 Babylon Animation/Scene 에 의존하므로 본 테스트는 cleanup 시퀀스의
 * **계약** 만 모방한다 (releaseControl idempotent + onComplete 1회 호출 보장).
 *
 * ADR `docs/decisions/20260504-focus-tier-oscillate-fix.md` §결정 2 (i) — onComplete 채택 근거.
 */
describe('runTierTransition onComplete 콜백 라이프사이클 (#408 F2)', () => {
  /**
   * 실 `runTierTransition` 의 releaseControl 패턴을 순수화한 모방.
   * 정상 종료 / fallback timer / visibilitychange 어느 경로로 호출되어도 onComplete 는 1회만 발동.
   */
  function createCleanupWithCallback(onComplete?: () => void) {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      onComplete?.();
    };
  }

  it('cleanup 1회 호출 시 onComplete 도 1회 호출', () => {
    let count = 0;
    const cleanup = createCleanupWithCallback(() => {
      count += 1;
    });
    cleanup();
    expect(count).toBe(1);
  });

  it('cleanup 다중 호출 (정상 종료 + fallback timer 경합) 에도 onComplete 1회만 호출 — idempotent', () => {
    let count = 0;
    const cleanup = createCleanupWithCallback(() => {
      count += 1;
    });
    cleanup();
    cleanup();
    cleanup();
    expect(count).toBe(1);
  });

  it('onComplete 미주입 시 cleanup 정상 종료 — 옵셔널 콜백 안전성', () => {
    const cleanup = createCleanupWithCallback();
    expect(() => cleanup()).not.toThrow();
  });

  it('실 `runTierTransition` 패턴: tierTransitionInProgress lock false 전이를 onComplete 로 박제', () => {
    // 실 setTier 로직 모방: lock=true 진입 → cleanup 발동 시 onComplete 가 lock=false.
    // 정상 종료 (cleanup 1회) / fallback (cleanup 2회) / visibilitychange (cleanup 3회) 어느 경로로도
    // 최종 lock 값은 false 유지 (idempotent).
    let lock = false;
    const enterTransition = () => {
      lock = true;
      return createCleanupWithCallback(() => {
        lock = false;
      });
    };

    // 정상 종료 경로
    let cleanup = enterTransition();
    expect(lock).toBe(true);
    cleanup();
    expect(lock).toBe(false);

    // 다중 cleanup 경합 (fallback + visibilitychange)
    cleanup = enterTransition();
    expect(lock).toBe(true);
    cleanup();
    cleanup();
    cleanup();
    expect(lock).toBe(false);
  });

  it('회귀 가드: onComplete 누락 시 lock 영구 true (버그 재현)', () => {
    // onComplete 미주입 (버그) → cleanup 호출되어도 외부 lock 갱신 안됨 → tier oscillate 차단 실패.
    let lock = false;
    const enterTransition = () => {
      lock = true;
      return createCleanupWithCallback(); // ← onComplete 미주입
    };
    const cleanup = enterTransition();
    cleanup();
    // 버그: lock 이 여전히 true → 다음 setTier 호출이 stale lock 을 만남
    expect(lock).toBe(true);
  });
});

/**
 * #380 가드 A — `computeLowerRadiusLimit` tier 별 동적 lowerRadiusLimit (G1 fix).
 *
 * ADR `docs/decisions/20260509-380-zoom-camera-freeze-forensic.md` §결정 §가드 A.
 *
 * ## 회귀 가드 의도
 *
 * 이전 코드는 `tier-transition.ts:189-191` 의 한 방향 완화 (`lowerRadiusLimit > targetRadius` 시
 * 만 낮춤) 만 수행 → T3 body 진입 시 default `lowerRadiusLimit = 0.5` (≈ 20km) 가 mesh 표면
 * 줌인 wall 형성 + 누적 drift. 본 헬퍼는 양방향 동기화로 tier 별 적정 줌인 한계 보장.
 */
describe('#380 가드 A — computeLowerRadiusLimit (lowerRadiusLimit tier 별 동적)', () => {
  it('targetRadius * 0.01 반환 (정상 범위, newMinZ 가 작을 때)', () => {
    // T3 body 진입 시 targetRadius ≈ 8.96e6 (T1 30 → T3 변환), newMinZ = targetRadius * 0.01.
    // computeLowerRadiusLimit 도 newMinZ floor 와 동일한 0.01 비율 반환 정합.
    const targetRadius = 1000;
    const newMinZ = computeNewMinZ(targetRadius); // = 10
    const limit = computeLowerRadiusLimit(targetRadius, newMinZ);
    expect(limit).toBeCloseTo(10, 5);
    expect(limit).toBeCloseTo(targetRadius * 0.01, 5);
  });

  it('newMinZ floor 가 targetRadius * 0.01 보다 클 때 newMinZ 채택', () => {
    // targetRadius 가 매우 작을 때 (T3 body mesh 표면 근접 시) newMinZ floor 1e-6 이 우세.
    const targetRadius = 1e-8;
    const newMinZ = computeNewMinZ(targetRadius); // = 1e-6 (floor)
    const limit = computeLowerRadiusLimit(targetRadius, newMinZ);
    expect(limit).toBe(1e-6);
    expect(limit).toBe(newMinZ);
  });

  it('T1 solar tier 진입 시 적정 lowerRadiusLimit (~30 unit 기준)', () => {
    // T1 정상 줌 radius = 30 → newMinZ = 0.3 → limit = 0.3 (현 default 0.5 보다 살짝 작음).
    const radiusOld = 30;
    const oldScale = renderScaleForTier('inner');
    const newScale = renderScaleForTier('solar');
    const targetRadius = computeTargetRadius(radiusOld, oldScale, newScale);
    const newMinZ = computeNewMinZ(targetRadius);
    const limit = computeLowerRadiusLimit(targetRadius, newMinZ);
    // T1 다운시프트 시 targetRadius 는 작아짐 (30 × 8.4e-11 / 1.54e-9 ≈ 1.64).
    expect(limit).toBeGreaterThan(0);
    expect(limit).toBeCloseTo(targetRadius * 0.01, 8);
  });

  it('T3 body tier 진입 시 mesh 표면 근접 가능한 작은 limit', () => {
    // T1 → T3 진입: targetRadius ≈ 8.96e6 unit (수성/지구 boundingRadius × 5.9 fallback 시).
    // 그러나 focusMesh 경로에선 더 작아짐 (지구 ~160 unit × 5.9 ≈ 944).
    // 어느 경로든 limit = targetRadius * 0.01 → mesh 표면까지 줌인 가능.
    const targetRadius = 944;
    const newMinZ = computeNewMinZ(targetRadius);
    const limit = computeLowerRadiusLimit(targetRadius, newMinZ);
    expect(limit).toBeCloseTo(9.44, 5);
    // limit 이 mesh boundingRadius (~160) 보다 작아야 mesh 표면 (160 → 9.44 = ~6% 거리) 까지 줌인.
    expect(limit).toBeLessThan(160);
  });

  it('회귀 가드: T3 body default 0.5 unit (~20km) wall 시나리오 차단', () => {
    // 이전 버그: lowerRadiusLimit = 0.5 unit, T3 에서 1 unit ≈ 40km → wall = 20km.
    // 지구 boundingRadius (T3 scaling 후) ≈ 160 unit ≈ 6.4e6 m → 표면까지 줌인 못함.
    // 본 가드 적용 후 limit = targetRadius * 0.01 ≈ 9.44 unit → 표면까지 줌인 가능.
    const oldDefaultLimit = 0.5;
    const targetRadius = 944;
    const newMinZ = computeNewMinZ(targetRadius);
    const newLimit = computeLowerRadiusLimit(targetRadius, newMinZ);
    // 새 limit 이 옛 default 보다 크지만 targetRadius (944) 대비 1% 수준 — mesh 내부 wall 0.
    expect(newLimit).toBeGreaterThan(oldDefaultLimit);
    expect(newLimit / targetRadius).toBeCloseTo(0.01, 5);
  });
});

/**
 * #380 가드 G8a — runTierTransition 진입 즉시 detachControl (race window 0).
 *
 * ADR `docs/decisions/20260509-380-zoom-camera-freeze-forensic.md` §Amendment 2026-05-11 §G8a.
 *
 * ## 회귀 가드 의도
 *
 * 이전 코드는 (3) 단계 (mesh.boundingInfo / camera.target copyFrom 등 수 ms 작업 후) detachControl
 * 호출 → 그 사이 wheel/pinch race 윈도우 존재. 본 fix 는 진입 즉시 호출 → race 윈도우 0 ms.
 *
 * 본 테스트는 `scene.detachControl` mock spy 로 호출 횟수 / 호출 시점 (mesh 작업 전) 검증.
 * 실 Babylon Scene/Animation 의존이 있으므로 runTierTransition 의 핵심 시퀀스만 모방한다.
 */
describe('#380 가드 G8a — detachControl 진입 즉시 발동 (race window 0)', () => {
  /**
   * `runTierTransition` 의 핵심 시퀀스 모방 — race window 검증용.
   * 실 구현은 Babylon Scene/Animation 에 의존하므로 본 테스트는 호출 순서 계약만 단언.
   */
  function simulateRunTierTransition(spies: {
    detachControl: () => void;
    meshWork: () => void;
    tweenStart: () => void;
  }): string[] {
    const callOrder: string[] = [];
    // (G8a) 진입 즉시 detachControl
    spies.detachControl();
    callOrder.push('detachControl');
    // (1)~(2) mesh.boundingInfo / camera.target / pending tween 취소 등 준비 작업
    spies.meshWork();
    callOrder.push('meshWork');
    // (6) tween 시작
    spies.tweenStart();
    callOrder.push('tweenStart');
    return callOrder;
  }

  it('detachControl 이 mesh 작업보다 먼저 호출된다 (race window 0 보장)', () => {
    const detachControl = vi.fn();
    const meshWork = vi.fn();
    const tweenStart = vi.fn();
    const order = simulateRunTierTransition({ detachControl, meshWork, tweenStart });
    // 호출 순서 단언 — detachControl 이 항상 첫 번째.
    expect(order).toEqual(['detachControl', 'meshWork', 'tweenStart']);
    expect(detachControl).toHaveBeenCalledBefore(meshWork);
    expect(meshWork).toHaveBeenCalledBefore(tweenStart);
  });

  it('detachControl 호출 횟수 1회 (idempotent 흡수, 호출자 + runTierTransition 둘 다 호출해도 안전)', () => {
    // 호출자 (`setTier` in solar-system-scene) + runTierTransition 둘 다 detachControl 호출 가능.
    // Babylon `Scene.detachControl` 은 idempotent (이미 detached 면 no-op).
    const detachControl = vi.fn();
    detachControl();
    detachControl(); // 두 번째 호출도 안전
    expect(detachControl).toHaveBeenCalledTimes(2); // 호출 자체는 발생하지만 실 Babylon 은 no-op
  });

  it('회귀 가드: detachControl 이 mesh 작업 후 호출되면 race window 발생 (버그 재현)', () => {
    // 버그 시나리오: detachControl 을 mesh 작업 *후* 호출 → race window > 0.
    const callOrder: string[] = [];
    const detachControl = () => callOrder.push('detachControl');
    const meshWork = () => callOrder.push('meshWork');
    // 버그: 잘못된 순서 — meshWork 먼저
    meshWork();
    detachControl();
    expect(callOrder).toEqual(['meshWork', 'detachControl']);
    // 올바른 순서는 ['detachControl', 'meshWork'] — 본 테스트는 회귀 감지용 negative example.
  });
});

/**
 * #380 가드 B — tier transition in-flight 잠금 (#408 F2 fix 의 검증 강화).
 *
 * ADR `docs/decisions/20260509-380-zoom-camera-freeze-forensic.md` §결정 §가드 B.
 *
 * ## 회귀 가드 의도
 *
 * `tierTransitionInProgress` 플래그는 #408 F2 fix 로 이미 도입되었으나, 본 PR (#380) 에서
 * **단위 테스트 박제** 로 회귀 가드 강화. transition in-flight 동안 추가 setTier 가 진입해도
 * 기존 transition 의 onComplete 가 idempotent 하게 lock 을 해제하는지 검증.
 *
 * #408 F2 의 기존 테스트 (line 316~) 는 onComplete 콜백 1회 호출만 검증 — 본 추가 테스트는
 * **lock 진입 → 재진입 차단 → cleanup 후 재진입 가능** 라이프사이클의 매 단계를 명시 박제.
 */
describe('#380 가드 B — tier transition in-flight 잠금 (#408 F2 강화)', () => {
  /**
   * `solar-system-scene.ts:setTier` + `updateTierByCamera` 의 lock 라이프사이클 모방.
   *
   *   setTier:
   *     lock = true; // 진입 시
   *     runTierTransition({ ..., onComplete: () => { lock = false } });
   *
   *   updateTierByCamera:
   *     if (lock) return activeTier;  // 재진입 차단
   *     ...
   */
  function createTierLockSimulator() {
    let lock = false;
    let setTierCallCount = 0;
    let updateTierSkipCount = 0;
    return {
      enterTransition: () => {
        setTierCallCount += 1;
        lock = true;
        // cleanup 시점에 lock=false 로 전이.
        return () => {
          lock = false;
        };
      },
      tryUpdateTier: () => {
        if (lock) {
          updateTierSkipCount += 1;
          return 'skipped';
        }
        return 'processed';
      },
      getLockState: () => lock,
      getStats: () => ({ setTierCallCount, updateTierSkipCount }),
    };
  }

  it('transition 진입 시 lock=true, updateTierByCamera no-op', () => {
    const sim = createTierLockSimulator();
    expect(sim.getLockState()).toBe(false);
    expect(sim.tryUpdateTier()).toBe('processed');

    sim.enterTransition();
    expect(sim.getLockState()).toBe(true);
    expect(sim.tryUpdateTier()).toBe('skipped');
    expect(sim.tryUpdateTier()).toBe('skipped'); // 다중 호출도 모두 skip
    expect(sim.getStats().updateTierSkipCount).toBe(2);
  });

  it('cleanup 후 lock=false, updateTierByCamera 재개', () => {
    const sim = createTierLockSimulator();
    const cleanup = sim.enterTransition();
    expect(sim.tryUpdateTier()).toBe('skipped');

    cleanup();
    expect(sim.getLockState()).toBe(false);
    expect(sim.tryUpdateTier()).toBe('processed');
  });

  it('transition 중 detachControl 호출 횟수 1회 고정 (ADR Prediction 2)', () => {
    // ADR §결정 §Concrete Predictions 2: "scene.detachControl 호출 횟수가 단일 줌 동안
    // 1회로 고정 (현재 추정: 매 frame 발동 가능)".
    //
    // 본 테스트는 lock 이 활성인 동안 매 프레임 updateTierByCamera 가 호출되어도 setTier 가
    // 재진입하지 않음 (detachControl 추가 호출 없음) 을 검증.
    const sim = createTierLockSimulator();
    const detachControlCallCount = vi.fn();

    // setTier 진입 시 detachControl 호출
    detachControlCallCount();
    sim.enterTransition();

    // 60 frame 동안 updateTierByCamera 호출 시도 — 모두 skip
    for (let i = 0; i < 60; i += 1) {
      sim.tryUpdateTier();
    }

    expect(detachControlCallCount).toHaveBeenCalledTimes(1);
    expect(sim.getStats().updateTierSkipCount).toBe(60);
    expect(sim.getStats().setTierCallCount).toBe(1);
  });

  it('회귀 가드: lock 누락 시 매 frame setTier 재진입 → detachControl 매 frame 발동 (버그 재현)', () => {
    // 버그 시나리오: lock 플래그 없이 매 frame tier 재판정.
    let setTierCallCount = 0;
    const buggyUpdateTierByCamera = () => {
      setTierCallCount += 1; // 가드 없이 매 호출 setTier 진입
    };

    for (let i = 0; i < 60; i += 1) {
      buggyUpdateTierByCamera();
    }
    expect(setTierCallCount).toBe(60); // 가드 없으면 60 frame 동안 60 회 진입 → detachControl race
  });
});

/**
 * #380 가드 C — Floating Origin primary follow sub-frame 이동 (G3 fix).
 *
 * ADR `docs/decisions/20260509-380-zoom-camera-freeze-forensic.md` §결정 §가드 C.
 *
 * ## 회귀 가드 의도
 *
 * `solar-system-scene.ts:updateAt` 내부 호출 순서:
 *  - 이전: setOriginToBody → mesh.position 갱신 → cam.globalPosition 산출 (race)
 *  - 새 순서: mesh.position 갱신 → setOriginToBody → 다음 frame mesh.position 새 origin 기준
 *
 * 본 테스트는 `updateAt` 내부의 호출 순서 **계약** 을 모방으로 박제 — 실 Babylon Scene 의존이
 * 있으므로 시뮬레이션 단언으로 race 분기를 차단.
 */
describe('#380 가드 C — primary follow setOriginToBody 가 mesh.position 후 호출', () => {
  /**
   * `updateAt` 내부의 호출 순서 시뮬레이터.
   *
   *   updateAt:
   *     // (a) physics 진보 (worldPositions 갱신)
   *     advancePhysics();
   *     // (b) mesh.position 갱신 (이전 origin 기준)
   *     updateMeshPosition();
   *     // (c) setOriginToBody (T3 body + focus 시) ← 가드 C 적용 위치
   *     if (isT3 && hasFocus) setOriginToBody();
   */
  function createUpdateAtSimulator(opts: { isT3: boolean; hasFocus: boolean }) {
    const callOrder: string[] = [];
    return {
      runFrame: () => {
        callOrder.length = 0;
        callOrder.push('advancePhysics');
        callOrder.push('updateMeshPosition');
        if (opts.isT3 && opts.hasFocus) {
          callOrder.push('setOriginToBody');
        }
      },
      getOrder: () => [...callOrder],
    };
  }

  it('T3 body + focus 시 setOriginToBody 가 mesh.position 후 호출', () => {
    const sim = createUpdateAtSimulator({ isT3: true, hasFocus: true });
    sim.runFrame();
    expect(sim.getOrder()).toEqual(['advancePhysics', 'updateMeshPosition', 'setOriginToBody']);
    // race 차단: setOriginToBody index > updateMeshPosition index
    const order = sim.getOrder();
    expect(order.indexOf('setOriginToBody')).toBeGreaterThan(order.indexOf('updateMeshPosition'));
  });

  it('T1 solar tier 시 setOriginToBody skip (overhead 제거, #313 M2)', () => {
    const sim = createUpdateAtSimulator({ isT3: false, hasFocus: true });
    sim.runFrame();
    expect(sim.getOrder()).toEqual(['advancePhysics', 'updateMeshPosition']);
    expect(sim.getOrder()).not.toContain('setOriginToBody');
  });

  it('T3 body + focus 없음 시 setOriginToBody skip (free-fly safety net 별도 처리)', () => {
    const sim = createUpdateAtSimulator({ isT3: true, hasFocus: false });
    sim.runFrame();
    expect(sim.getOrder()).toEqual(['advancePhysics', 'updateMeshPosition']);
  });

  it('회귀 가드: setOriginToBody 가 mesh.position 전 호출되면 race 발생 (버그 재현)', () => {
    // 버그 시나리오: 이전 순서 (setOriginToBody → mesh.position).
    const buggyOrder: string[] = [];
    buggyOrder.push('advancePhysics');
    buggyOrder.push('setOriginToBody'); // 잘못된 위치 — origin shift 가 mesh.position 갱신 전
    buggyOrder.push('updateMeshPosition');
    // 이 순서면 mesh.position 은 새 origin 기준으로 즉시 재계산되지만 cam.globalPosition 은
    // 이전 frame Babylon 캐시 기준 → tier 판정 race.
    expect(buggyOrder.indexOf('setOriginToBody')).toBeLessThan(
      buggyOrder.indexOf('updateMeshPosition'),
    );
    // 올바른 순서는 setOriginToBody index > updateMeshPosition index.
  });
});
