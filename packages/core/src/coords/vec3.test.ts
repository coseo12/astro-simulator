import { describe, expect, it } from 'vitest';
import { add, distance, length, scale, subtract, vec3 } from './vec3.js';

describe('Vec3Double', () => {
  it('add/subtract 기본', () => {
    expect(add(vec3(1, 2, 3), vec3(4, 5, 6))).toEqual([5, 7, 9]);
    expect(subtract(vec3(10, 10, 10), vec3(3, 2, 1))).toEqual([7, 8, 9]);
  });

  it('scale', () => {
    expect(scale(vec3(1, 2, 3), 2)).toEqual([2, 4, 6]);
  });

  it('length / distance', () => {
    expect(length(vec3(3, 4, 0))).toBe(5);
    expect(distance(vec3(0, 0, 0), vec3(0, 3, 4))).toBe(5);
  });

  it('double 정밀도 유지 — 10^13m 스케일에서 소수점 m 단위 보존', () => {
    // 해왕성 궤도(~4.5e12m) 수준 거리에서 1m 차이 검출 가능
    const a = vec3(4_500_000_000_000, 0, 0);
    const b = vec3(4_500_000_000_001, 0, 0);
    expect(distance(a, b)).toBe(1);
  });
});
