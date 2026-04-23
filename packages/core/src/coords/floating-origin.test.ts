import { describe, expect, it, vi } from 'vitest';
import { FloatingOrigin } from './floating-origin.js';
import { vec3, type Vec3Double } from './vec3.js';

describe('FloatingOrigin', () => {
  it('임계 거리 미만에서는 shift 없음', () => {
    const fo = new FloatingOrigin(10_000);
    const shift = fo.update(vec3(5_000, 0, 0));
    expect(shift).toBeNull();
    expect(fo.originOffset).toEqual([0, 0, 0]);
  });

  it('임계 거리 초과 시 원점을 카메라로 이동시킨다', () => {
    const fo = new FloatingOrigin(10_000);
    const shift = fo.update(vec3(15_000, 0, 0));
    expect(shift).toEqual([15_000, 0, 0]);
    expect(fo.originOffset).toEqual([15_000, 0, 0]);
  });

  it('연속 shift 누적', () => {
    const fo = new FloatingOrigin(10_000);
    fo.update(vec3(12_000, 0, 0)); // 1차 shift: origin = [12000, 0, 0]
    // 이제 카메라가 absolute 25_000 — local 13_000 — 다시 shift
    fo.update(vec3(25_000, 0, 0));
    expect(fo.originOffset).toEqual([25_000, 0, 0]);
  });

  it('toLocal / toWorld 라운드트립', () => {
    const fo = new FloatingOrigin(10_000);
    fo.update(vec3(50_000, 0, 0));

    const world = vec3(60_000, 0, 0);
    const local = fo.toLocal(world);
    expect(local).toEqual([10_000, 0, 0]);
    expect(fo.toWorld(local)).toEqual(world);
  });

  it('shift 후에도 천체 상대 위치는 보존된다', () => {
    const fo = new FloatingOrigin(10_000);

    // 두 천체의 월드 절대 좌표
    const bodyA = vec3(1_000_000_000, 0, 0);
    const bodyB = vec3(1_000_000_050, 0, 0);

    const cameraWorld = vec3(1_000_000_000, 0, 0);
    fo.update(cameraWorld);

    const localA = fo.toLocal(bodyA);
    const localB = fo.toLocal(bodyB);

    // 상대 거리는 shift와 무관하게 유지
    expect(localB[0] - localA[0]).toBe(50);
    // 로컬 좌표가 0 근처로 축소됨
    expect(Math.abs(localA[0])).toBeLessThan(100);
  });

  it('reset', () => {
    const fo = new FloatingOrigin(10_000);
    fo.update(vec3(50_000, 0, 0));
    fo.reset();
    expect(fo.originOffset).toEqual([0, 0, 0]);
  });

  it('잘못된 threshold 거부', () => {
    expect(() => new FloatingOrigin(0)).toThrow();
    expect(() => new FloatingOrigin(-100)).toThrow();
    expect(() => new FloatingOrigin(Number.NaN)).toThrow();
    expect(() => new FloatingOrigin(Number.POSITIVE_INFINITY)).toThrow();
  });

  // --- P11-A #288 ---
  // Focus body 기반 primary origin shift + subscription API.

  describe('setOriginToBody (P11-A #288)', () => {
    it('origin 을 body 월드 좌표로 즉시 이동시킨다', () => {
      const fo = new FloatingOrigin(1_000);
      const delta = fo.setOriginToBody(vec3(7.7e8, 0, 0));
      expect(fo.originOffset).toEqual([7.7e8, 0, 0]);
      expect(delta).toEqual([7.7e8, 0, 0]);
    });

    it('body 를 focus 한 직후 body.local ≈ 0', () => {
      const fo = new FloatingOrigin(1_000);
      const bodyWorld = vec3(1.5e11, 0, 0); // 1 AU
      fo.setOriginToBody(bodyWorld);
      const local = fo.toLocal(bodyWorld);
      expect(Math.max(Math.abs(local[0]), Math.abs(local[1]), Math.abs(local[2]))).toBeLessThan(1);
    });

    it('threshold 미만 카메라 거리여도 즉시 shift (safety net update 와 독립)', () => {
      const fo = new FloatingOrigin(1.5e11); // 1 AU threshold
      // 카메라가 원점 근처라도 focus body 로 강제 이동해야 함
      const delta = fo.setOriginToBody(vec3(5_000, 0, 0));
      expect(delta).toEqual([5_000, 0, 0]);
      expect(fo.originOffset).toEqual([5_000, 0, 0]);
    });

    it('델타가 0 이면 no-op 이며 null 반환 (예: 동일 body 재focus)', () => {
      const fo = new FloatingOrigin(1_000);
      fo.setOriginToBody(vec3(1e10, 0, 0));
      const delta = fo.setOriginToBody(vec3(1e10, 0, 0));
      expect(delta).toBeNull();
    });

    it('누적 shift — 연속 focus 전환 시 origin 은 마지막 body 좌표와 일치', () => {
      const fo = new FloatingOrigin(1_000);
      fo.setOriginToBody(vec3(1e10, 0, 0)); // Jupiter 근방
      fo.setOriginToBody(vec3(7.7e8, 0, 0)); // Earth 근방
      expect(fo.originOffset).toEqual([7.7e8, 0, 0]);
    });
  });

  describe('onOriginShift (P11-A #288, Trail 계약)', () => {
    it('update 로 shift 발생 시 listener 에 delta 전달', () => {
      const fo = new FloatingOrigin(10_000);
      const deltas: number[][] = [];
      fo.onOriginShift((d) => deltas.push([d[0], d[1], d[2]]));
      fo.update(vec3(15_000, 0, 0));
      expect(deltas).toEqual([[15_000, 0, 0]]);
    });

    it('setOriginToBody 로 shift 발생 시 listener 호출', () => {
      const fo = new FloatingOrigin(10_000);
      const deltas: number[][] = [];
      fo.onOriginShift((d) => deltas.push([d[0], d[1], d[2]]));
      fo.setOriginToBody(vec3(1e10, 0, 0));
      expect(deltas).toEqual([[1e10, 0, 0]]);
    });

    it('threshold 미만 update 는 listener 호출 안 함', () => {
      const fo = new FloatingOrigin(10_000);
      const listener = vi.fn();
      fo.onOriginShift(listener);
      fo.update(vec3(5_000, 0, 0));
      expect(listener).not.toHaveBeenCalled();
    });

    it('unsubscribe 후 호출되지 않음', () => {
      const fo = new FloatingOrigin(10_000);
      const listener = vi.fn();
      const unsubscribe = fo.onOriginShift(listener);
      fo.update(vec3(15_000, 0, 0));
      expect(listener).toHaveBeenCalledTimes(1);
      unsubscribe();
      fo.update(vec3(30_000, 0, 0));
      expect(listener).toHaveBeenCalledTimes(1); // 추가 호출 없음
    });

    it('listener 예외는 격리되어 다른 listener 와 후속 shift 에 영향 없음', () => {
      const fo = new FloatingOrigin(10_000);
      const good = vi.fn();
      // Trail 모듈 버그 시나리오: 예외가 scene 전체를 break 하면 안 됨
      fo.onOriginShift(() => {
        throw new Error('Trail 모듈 버그 시뮬레이션');
      });
      fo.onOriginShift(good);
      // console.error 경로로 빠짐 — 예외 밖으로 propagate 하지 않아야 함
      expect(() => fo.update(vec3(15_000, 0, 0))).not.toThrow();
      expect(good).toHaveBeenCalledTimes(1);
    });
  });

  describe('T3 body tier 운용 — 1 AU threshold + body-focus (ADR §4 통합 시나리오, P12-C #298 단일 모드)', () => {
    it('목성 focus 후 지구로 전환 시 두 body 모두 local 좌표 ≤ 1e5 m (DoD β)', () => {
      const AU = 1.495_978_707e11;
      const fo = new FloatingOrigin(AU);
      // Heliocentric 절대 좌표 (예시값)
      const jupiter = vec3(7.8e11, 0, 0); // ~5.2 AU
      const earth = vec3(1.496e11, 0, 0); // ~1 AU

      // 1) 목성 focus
      fo.setOriginToBody(jupiter);
      const jupiterLocal = fo.toLocal(jupiter);
      expect(
        Math.max(Math.abs(jupiterLocal[0]), Math.abs(jupiterLocal[1]), Math.abs(jupiterLocal[2])),
      ).toBeLessThan(1e5);

      // 2) 지구 focus — primary shift 로 origin 재배치
      fo.setOriginToBody(earth);
      const earthLocal = fo.toLocal(earth);
      expect(
        Math.max(Math.abs(earthLocal[0]), Math.abs(earthLocal[1]), Math.abs(earthLocal[2])),
      ).toBeLessThan(1e5);
    });

    it('safety net update — 자유 탐색 중 카메라가 1 AU 이동 시 shift', () => {
      const AU = 1.495_978_707e11;
      const fo = new FloatingOrigin(AU);
      // threshold 미만 (0.5 AU) 은 shift 없음
      expect(fo.update(vec3(AU * 0.5, 0, 0))).toBeNull();
      // threshold 초과 (1.5 AU) 는 shift 발동
      const delta = fo.update(vec3(AU * 1.5, 0, 0));
      expect(delta).not.toBeNull();
      expect(fo.originOffset[0]).toBeCloseTo(AU * 1.5, 0);
    });
  });

  // --- #292 회귀 가드: focus 활성 상태에서 safety net 비활성화 계약 ---
  // `solar-system-scene.ts` updateAt 은 매 프레임:
  //   1) focus 있으면 `setOriginToBody(focusWorld)` 로 primary shift (ADR §1-B)
  //   2) focus 없으면 `update(cameraWorld)` 로 safety net (ADR §1-A)
  // 2개를 **동시에 호출하면** primary 를 safety net 이 덮어써 originOffset 이 카메라 월드 좌표를
  // 추적 → ADR §3 "Heliocentric 절대 좌표" 계약 위배. 아래 테스트는 scene 호출 패턴을 pure
  // 함수로 재현해 회귀 방지.
  describe('scene updateAt 호출 규약 (#292 회귀 가드)', () => {
    const AU = 1.495_978_707e11;

    // scene 의 "매 프레임" 로직을 순수 함수로 축약. focusWorld 가 주어지면 primary, 없으면
    // safety net 만 호출. 이 구조를 유지해야 originOffset 이 focus body 를 추적한다.
    function scenePerFrame(
      fo: FloatingOrigin,
      focusWorld: Vec3Double | null,
      cameraWorld: Vec3Double,
    ): void {
      if (focusWorld) {
        fo.setOriginToBody(focusWorld);
      }
      if (!focusWorld) {
        fo.update(cameraWorld);
      }
    }

    it('focus 상태에서 카메라가 1 AU 이상 이동해도 originOffset 은 focus body 만 추적', () => {
      const fo = new FloatingOrigin(AU);
      const earth: Vec3Double = [AU, 0, 0]; // ~1 AU
      // 카메라가 focus body 와 10 AU 이상 떨어진 상태 — safety net 이 발동하면 originOffset
      // 이 카메라 월드 좌표 (earth + (10AU, 0, 0) = 11AU) 로 이동해버림
      const cameraWorld: Vec3Double = [AU + AU * 10, 0, 0];

      scenePerFrame(fo, earth, cameraWorld);

      // 기대: focus primary 가 유지되어 originOffset === earth world (≈ 1 AU)
      expect(fo.originOffset[0]).toBeCloseTo(AU, 0);
      // 회귀 가드: 카메라 월드 좌표 (11 AU) 를 추적하면 안 됨
      expect(fo.originOffset[0]).toBeLessThan(AU * 2);
    });

    it('focus 해제 상태에서는 safety net 이 정상 작동 (카메라 1 AU 이동 시 shift)', () => {
      const fo = new FloatingOrigin(AU);
      const cameraWorld: Vec3Double = [AU * 1.5, 0, 0];

      scenePerFrame(fo, null, cameraWorld);

      // safety net 활성 — 카메라 월드 좌표로 shift
      expect(fo.originOffset[0]).toBeCloseTo(AU * 1.5, 0);
    });

    it('focus → 해제 → 다시 focus 전환 시나리오', () => {
      const fo = new FloatingOrigin(AU);
      const earth: Vec3Double = [AU, 0, 0];
      const jupiter: Vec3Double = [AU * 5.2, 0, 0];

      // 1) 지구 focus — origin = earth
      scenePerFrame(fo, earth, [AU * 5, 0, 0]);
      expect(fo.originOffset[0]).toBeCloseTo(AU, 0);

      // 2) focus 해제 + 카메라 추가 이동 — safety net 이 origin 을 카메라 월드로 이동
      // (이 시점 origin 은 지구 AU 이므로 카메라 local 5 AU → world 6 AU)
      const camLocal: Vec3Double = [AU * 5, 0, 0];
      const camWorld: Vec3Double = [AU * 5 + AU, 0, 0];
      scenePerFrame(fo, null, camWorld);
      expect(fo.originOffset[0]).toBeCloseTo(AU * 6, 0);
      void camLocal;

      // 3) 다시 목성 focus — origin = jupiter (safety net 결과 무관하게 primary 재적용)
      scenePerFrame(fo, jupiter, [AU * 10, 0, 0]);
      expect(fo.originOffset[0]).toBeCloseTo(AU * 5.2, 0);
    });

    it('DoD β: focus body 의 local 좌표는 focus 활성 프레임에서 ≤ 1e5 m', () => {
      // 버그 당시 시나리오 재현: originOffset 이 카메라 월드 (예: 1173 AU) 를 추적하면
      // focus body local 이 수백 AU 단위가 되어 DoD β (≤ 1e5 m) 를 위반.
      const fo = new FloatingOrigin(AU);
      const jupiter: Vec3Double = [AU * 5.2, 0, 0];
      const farCamera: Vec3Double = [AU * 1173, 0, 0];

      scenePerFrame(fo, jupiter, farCamera);
      const jupiterLocal = fo.toLocal(jupiter);
      const localMax = Math.max(
        Math.abs(jupiterLocal[0]),
        Math.abs(jupiterLocal[1]),
        Math.abs(jupiterLocal[2]),
      );
      expect(localMax).toBeLessThan(1e5);
    });
  });

  // --- DoD β v2 (2026-04-22): 카메라 local 조건 제거 회귀 가드 ---
  // ADR §6-β v2 / §Amendments 2026-04-22. cross-validate §2 초기 교정이 "focus + 카메라"
  // 병행을 제안했으나 (P12-C #298 이전 scientific 모드 맥락) 카메라는 focus body 관찰을
  // 위해 수 AU 떨어진 정상 배치. 카메라 local 에 1e5 m 제한을 두면 scene 매 프레임 assert 실패.
  //
  // 아래 테스트는 `solar-system-scene.ts` updateAt 말미의 DoD β assert 경로를 pure 함수로
  // 축약. focus body local 만 검사하고 카메라 local 은 검사하지 않음을 회귀 가드로 박제.
  describe('DoD β v2 — 카메라 local 조건 제거 회귀 가드 (ADR §6-β v2)', () => {
    const AU = 1.495_978_707e11;

    // scene 의 DoD β assert 경로를 순수 함수로 축약. focus body local 이 1e5 m 를 넘으면
    // violation 목록에 추가. 카메라 local 은 의도적으로 검사하지 않음.
    // 반환: violation 메시지 배열 (빈 배열이면 assert pass)
    function dodBetaAssert(params: {
      focusBodyWorld: Vec3Double | null;
      cameraWorld: Vec3Double;
      originOffset: Vec3Double;
    }): string[] {
      const { focusBodyWorld, originOffset } = params;
      const violations: string[] = [];
      if (focusBodyWorld) {
        const fx = focusBodyWorld[0] - originOffset[0];
        const fy = focusBodyWorld[1] - originOffset[1];
        const fz = focusBodyWorld[2] - originOffset[2];
        const focusLocalMax = Math.max(Math.abs(fx), Math.abs(fy), Math.abs(fz));
        if (focusLocalMax >= 1e5) {
          violations.push(`focus body local 초과: ${fx},${fy},${fz}`);
        }
      }
      // 의도적으로 카메라 local 검사 없음 — T3 body tier 에서 카메라는 focus body 로부터 수 AU 떨어진 정상 배치.
      return violations;
    }

    it('카메라가 focus body 로부터 수 AU 떨어진 정상 상태 — assert 발동 없음', () => {
      // 실 시나리오: 목성 focus, 카메라는 목성을 관찰하기 위해 5 AU 떨어진 배치.
      // 버그 버전에서는 이 상태에서 `camera local 좌표 초과` 가 매 프레임 발생했음.
      const fo = new FloatingOrigin(AU);
      const jupiter: Vec3Double = [AU * 5.2, 0, 0];
      fo.setOriginToBody(jupiter);
      const cameraWorld: Vec3Double = [AU * 5.2 + AU * 5, 0, 0]; // 목성에서 5 AU 떨어진 카메라

      const violations = dodBetaAssert({
        focusBodyWorld: jupiter,
        cameraWorld,
        originOffset: fo.originOffset,
      });

      expect(violations).toEqual([]);
    });

    it('버그 재현 시나리오 — 카메라 world = 수백 AU 여도 focus body local 만 검사', () => {
      // 버그 버전 메시지 예시: `camera local 좌표 초과 (≥1e5m): 551609191979.78, ...`
      // = 약 3.7 AU. 이 값은 T3 body tier 관찰 배치에서 정상이며 assert 대상 아님.
      const fo = new FloatingOrigin(AU);
      const earth: Vec3Double = [AU, 0, 0];
      fo.setOriginToBody(earth);
      const farCamera: Vec3Double = [551609191979.78, 267067450948.42, 35002965518.79];

      const violations = dodBetaAssert({
        focusBodyWorld: earth,
        cameraWorld: farCamera,
        originOffset: fo.originOffset,
      });

      // focus body (earth) local ≈ 0 → pass. 카메라 조건 제거로 전체 pass.
      expect(violations).toEqual([]);
    });

    it('focus body local 초과 시에는 여전히 violation 발동 (primary 계약 유지)', () => {
      // DoD β 의 본질 — focus body local ≤ 1e5 m. 이 조건은 v2 에서도 유지.
      // origin 이 focus body 와 크게 어긋난 상태를 인위적으로 구성해 violation 유도.
      const fo = new FloatingOrigin(AU);
      const earth: Vec3Double = [AU, 0, 0];
      // origin 을 목성으로 잘못 잡은 상태 (회귀: #292 류 drift)
      fo.setOriginToBody([AU * 5.2, 0, 0]);
      const cameraWorld: Vec3Double = [AU * 5, 0, 0];

      const violations = dodBetaAssert({
        focusBodyWorld: earth,
        cameraWorld,
        originOffset: fo.originOffset,
      });

      expect(violations.length).toBe(1);
      expect(violations[0]).toMatch(/focus body local 초과/);
    });

    it('focus 가 null 이면 assert 는 아무것도 검사하지 않음 (free-fly 탐색 중)', () => {
      const fo = new FloatingOrigin(AU);
      const farCamera: Vec3Double = [AU * 1000, 0, 0];

      const violations = dodBetaAssert({
        focusBodyWorld: null,
        cameraWorld: farCamera,
        originOffset: fo.originOffset,
      });

      expect(violations).toEqual([]);
    });
  });
});
