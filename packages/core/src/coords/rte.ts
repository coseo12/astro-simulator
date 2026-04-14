import { subtract, type Vec3Double } from './vec3.js';

/**
 * Relative-to-Eye (RTE) 좌표 변환.
 *
 * CPU float64 월드 좌표를 카메라 상대 좌표로 변환하여 float32 GPU 전달용 배열을 만든다.
 *
 * ADR: docs/phases/architecture.md §4
 * - 큰 수 - 큰 수 = 작은 수의 뺄셈은 double 정밀도에서 수행
 * - 결과만 float32로 다운캐스팅 → 지터/뱅딩 방지
 * - 1 AU(~1.5e11m)처럼 큰 월드 좌표여도 카메라 근처 천체는 소수점 m 정밀도 유지
 */
export function toRelativeToEye(
  worldPos: Vec3Double,
  cameraPos: Vec3Double,
  out?: Float32Array,
): Float32Array {
  const [dx, dy, dz] = subtract(worldPos, cameraPos);
  const target = out ?? new Float32Array(3);
  target[0] = dx;
  target[1] = dy;
  target[2] = dz;
  return target;
}

/** 여러 천체를 한 번에 RTE 변환 (flat Float32Array, 길이 3N) */
export function manyToRelativeToEye(
  worldPositions: readonly Vec3Double[],
  cameraPos: Vec3Double,
  out?: Float32Array,
): Float32Array {
  const n = worldPositions.length;
  const target = out ?? new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    const p = worldPositions[i];
    if (!p) continue;
    target[i * 3] = p[0] - cameraPos[0];
    target[i * 3 + 1] = p[1] - cameraPos[1];
    target[i * 3 + 2] = p[2] - cameraPos[2];
  }
  return target;
}
