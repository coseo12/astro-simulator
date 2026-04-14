import { describe, expect, it } from 'vitest';
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
});
