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

import { describe, expect, it } from 'vitest';
import { renderScaleForTier } from './tier.js';
import { computeTargetRadius, computeNewMinZ } from './tier-transition.js';

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
