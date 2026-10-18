import { describe, expect, it } from 'vitest';
import type { Vec3Double } from './vec3.js';
import {
  SCENE_Z_SIGN,
  axialToScene,
  fromScene,
  fromSceneZ,
  toScene,
  toSceneZ,
} from './scene-handedness.js';

const cross = (a: Vec3Double, b: Vec3Double): Vec3Double => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

describe('#1366 장면 경계 z 반전 (S_z)', () => {
  it('극벡터는 z 만 뒤집고, 역변환과 합성하면 항등이다', () => {
    expect(SCENE_Z_SIGN).toBe(-1);
    expect(toScene([1, 2, 3])).toEqual([1, 2, -3]);
    expect(fromScene(toScene([1, -2, 3.5]))).toEqual([1, -2, 3.5]);
    expect(fromSceneZ(toSceneZ(-7.25))).toBe(-7.25);
  });

  it('입력 0 에서 −0 을 만들지 않는다 (원점 천체 위치)', () => {
    expect(Object.is(toSceneZ(0), 0)).toBe(true);
    expect(Object.is(fromSceneZ(-0), 0)).toBe(true);
    expect(Object.is(axialToScene([0, 0, 1])[0], 0)).toBe(true);
  });

  it('반사 행렬식은 −1 이다 — 극벡터 3개의 스칼라 삼중곱 부호가 뒤집힌다', () => {
    const ex = toScene([1, 0, 0]);
    const ey = toScene([0, 1, 0]);
    const ez = toScene([0, 0, 1]);
    const det = cross(ex, ey).reduce((s, c, i) => s + c * ez[i]!, 0);
    expect(det).toBe(-1);
  });

  it('축벡터 변환은 외적과 교환한다: axialToScene(a × b) = toScene(a) × toScene(b)', () => {
    const a: Vec3Double = [0.3, -1.2, 0.8];
    const b: Vec3Double = [2.1, 0.4, -0.5];
    const lhs = axialToScene(cross(a, b));
    const rhs = cross(toScene(a), toScene(b));
    for (let i = 0; i < 3; i += 1) expect(lhs[i]).toBeCloseTo(rhs[i]!, 12);
  });

  it('축벡터 h 와 극벡터 b 의 외적은 장면에서 극벡터로 옮겨진다 (혜성 먼지 휨 ĥ × axis)', () => {
    const h: Vec3Double = [0.1, -0.3, 0.95];
    const b: Vec3Double = [0.7, 0.2, -0.4];
    const lhs = cross(axialToScene(h), toScene(b));
    const rhs = toScene(cross(h, b));
    for (let i = 0; i < 3; i += 1) expect(lhs[i]).toBeCloseTo(rhs[i]!, 12);
  });
});
