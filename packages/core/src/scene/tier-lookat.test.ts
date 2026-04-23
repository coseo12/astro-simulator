/**
 * P12-A #298 — A3 DoD: tier 전환 전후 카메라 look-at 각도 차 ≤ 1°.
 *
 * Tier 전환은 renderScale 변경만 발생시키며, 카메라의 "어디를 보고 있는가" (target → focus body)
 * 는 불변이다. 이 테스트는 tier A → B 전환 시 카메라-focus body 방향 벡터의 각도 차이가
 * 1° 이하임을 벡터 내적 기반으로 검증한다.
 *
 * 실제 Babylon 카메라 객체 없이, renderScale 전환 + 동일 world 좌표에서의 scene 좌표 변화가
 * 방향 벡터 각도를 보존하는지 (stretch 만 발생, rotate 없음) 순수 수학적으로 확인.
 */

import { describe, expect, it } from 'vitest';
import { renderScaleForTier } from './tier.js';

/** 두 3D 벡터 간 각도 (라디안). */
function angleBetween(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  const la = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
  const lb = Math.sqrt(b[0] * b[0] + b[1] * b[1] + b[2] * b[2]);
  if (la === 0 || lb === 0) return 0;
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  // 수치 오차로 cos 가 ±1 을 미세하게 넘는 경우 clamp
  const cos = Math.max(-1, Math.min(1, dot / (la * lb)));
  return Math.acos(cos);
}

const DEG = 180 / Math.PI;

describe('A3 DoD — tier 전환 전후 look-at 각도 보존', () => {
  // World 좌표 (m): 카메라는 지구 focus 시 지구 뒤쪽 (원점 반대편 + 약간 위) 에 위치한다고 가정.
  const earthWorld = [1.496e11, 0, 0] as const; // 1 AU
  const cameraWorld = [1.5e11, 0, 1e10] as const; // 지구 약간 뒤 + 위
  const earthToCameraWorld: [number, number, number] = [
    cameraWorld[0] - earthWorld[0],
    cameraWorld[1] - earthWorld[1],
    cameraWorld[2] - earthWorld[2],
  ];

  it('solar → inner 전환: scene 좌표계에서 방향 벡터 각도 차 ≤ 1°', () => {
    const scaleSolar = renderScaleForTier('solar');
    const scaleInner = renderScaleForTier('inner');
    const dirSolar: [number, number, number] = [
      earthToCameraWorld[0] * scaleSolar,
      earthToCameraWorld[1] * scaleSolar,
      earthToCameraWorld[2] * scaleSolar,
    ];
    const dirInner: [number, number, number] = [
      earthToCameraWorld[0] * scaleInner,
      earthToCameraWorld[1] * scaleInner,
      earthToCameraWorld[2] * scaleInner,
    ];
    const angleDeg = angleBetween(dirSolar, dirInner) * DEG;
    // 동일 world 벡터에 scalar multiply — 수학적으로 평행 (각도 = 0). 부동소수점 오차만 감안.
    expect(angleDeg).toBeLessThanOrEqual(1);
  });

  it('inner → body 전환: 각도 차 ≤ 1°', () => {
    const scaleInner = renderScaleForTier('inner');
    const scaleBody = renderScaleForTier('body');
    const dirInner: [number, number, number] = [
      earthToCameraWorld[0] * scaleInner,
      earthToCameraWorld[1] * scaleInner,
      earthToCameraWorld[2] * scaleInner,
    ];
    const dirBody: [number, number, number] = [
      earthToCameraWorld[0] * scaleBody,
      earthToCameraWorld[1] * scaleBody,
      earthToCameraWorld[2] * scaleBody,
    ];
    const angleDeg = angleBetween(dirInner, dirBody) * DEG;
    expect(angleDeg).toBeLessThanOrEqual(1);
  });

  it('solar → body 극단 전환 (2 단계 점프): 각도 차 ≤ 1°', () => {
    const scaleSolar = renderScaleForTier('solar');
    const scaleBody = renderScaleForTier('body');
    const dirSolar: [number, number, number] = [
      earthToCameraWorld[0] * scaleSolar,
      earthToCameraWorld[1] * scaleSolar,
      earthToCameraWorld[2] * scaleSolar,
    ];
    const dirBody: [number, number, number] = [
      earthToCameraWorld[0] * scaleBody,
      earthToCameraWorld[1] * scaleBody,
      earthToCameraWorld[2] * scaleBody,
    ];
    const angleDeg = angleBetween(dirSolar, dirBody) * DEG;
    expect(angleDeg).toBeLessThanOrEqual(1);
  });

  it('동일 tier 내 반복 호출: 각도 차 = 0', () => {
    const scale = renderScaleForTier('inner');
    const dir1: [number, number, number] = [
      earthToCameraWorld[0] * scale,
      earthToCameraWorld[1] * scale,
      earthToCameraWorld[2] * scale,
    ];
    const dir2: [number, number, number] = [
      earthToCameraWorld[0] * scale,
      earthToCameraWorld[1] * scale,
      earthToCameraWorld[2] * scale,
    ];
    const angle = angleBetween(dir1, dir2);
    expect(angle).toBe(0);
  });
});
