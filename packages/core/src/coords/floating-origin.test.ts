import { describe, expect, it, vi } from 'vitest';
import { FloatingOrigin } from './floating-origin.js';
import { vec3 } from './vec3.js';

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

  describe('scientific 모드 사용 — 1 AU threshold + body-focus (ADR §4 통합 시나리오)', () => {
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
});
