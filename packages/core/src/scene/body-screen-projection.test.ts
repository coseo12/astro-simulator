/**
 * #1293 — `projectToScreen` 이 Babylon `Vector3.Project` 와 같은 화면 좌표를 내는지 (라벨 D4 의 투영 정합).
 */
import { describe, expect, it } from 'vitest';
import { Matrix, Vector3, Viewport } from '@babylonjs/core';
import { isInsideViewport, projectToScreen, type ScreenPoint } from './body-screen-projection.js';

const W = 1280;
const H = 720;

function viewProj(eye: Vector3, target: Vector3): Matrix {
  const view = Matrix.LookAtLH(eye, target, Vector3.Up());
  const proj = Matrix.PerspectiveFovLH(0.8, W / H, 0.1, 1e6);
  return view.multiply(proj);
}

const out = (): ScreenPoint => ({ x: NaN, y: NaN, inFront: false });

describe('#1293 projectToScreen — Vector3.Project 정합', () => {
  const vp = viewProj(new Vector3(3, 4, -20), new Vector3(0, 0, 0));
  const points = [
    new Vector3(0, 0, 0),
    new Vector3(5, -2, 3),
    new Vector3(-7, 6, -4),
    new Vector3(0.5, 0.25, 10),
  ];

  // Babylon 은 행렬·뷰포트 변환을 Float32 로 계산해 1e-5 px 대 오차가 난다 — 1e-3 px 이내면 같은 좌표다.
  it.each(points.map((p) => [p.toString(), p] as const))('%s', (_label, p) => {
    const expected = Vector3.Project(p, Matrix.Identity(), vp, new Viewport(0, 0, W, H));
    const got = projectToScreen(p.x, p.y, p.z, vp.m, W, H, out());
    expect(got.inFront).toBe(true);
    expect(got.x).toBeCloseTo(expected.x, 3);
    expect(got.y).toBeCloseTo(expected.y, 3);
  });

  it('카메라 뒤 점 → inFront=false (w ≤ 0 특이점에서 좌표를 쓰지 않는다)', () => {
    // 카메라 (z=-20) 가 원점을 본다 — z=-40 은 카메라 등 뒤.
    const got = projectToScreen(0, 0, -40, vp.m, W, H, out());
    expect(got.inFront).toBe(false);
  });

  it('out 버퍼를 그대로 반환한다 (할당 0)', () => {
    const buf = out();
    expect(projectToScreen(0, 0, 0, vp.m, W, H, buf)).toBe(buf);
  });
});

describe('#1293 isInsideViewport', () => {
  it('경계 포함 · 밖은 false', () => {
    expect(isInsideViewport(0, 0, W, H)).toBe(true);
    expect(isInsideViewport(W, H, W, H)).toBe(true);
    expect(isInsideViewport(-0.1, 10, W, H)).toBe(false);
    expect(isInsideViewport(10, H + 1, W, H)).toBe(false);
  });
});
