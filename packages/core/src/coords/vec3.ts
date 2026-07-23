/**
 * 3D double-precision 벡터.
 *
 * JS `number`는 IEEE 754 64비트 double이므로 CPU 월드 좌표에 그대로 사용한다.
 * Float32Array/Babylon Vector3 변환 지점은 RTE(Relative-to-Eye) 렌더 경로
 * (solar-system-scene 의 카메라 상대 float64 뺄셈 → float32 cast) 뿐.
 */
export type Vec3Double = readonly [number, number, number];

/** 새 Vec3Double 생성 (가독성용 factory) */
export const vec3 = (x: number, y: number, z: number): Vec3Double => [x, y, z];

export const ZERO_VEC3: Vec3Double = [0, 0, 0];

/** a - b */
export function subtract(a: Vec3Double, b: Vec3Double): Vec3Double {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/** a + b */
export function add(a: Vec3Double, b: Vec3Double): Vec3Double {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/** 스칼라 배 */
export function scale(v: Vec3Double, s: number): Vec3Double {
  return [v[0] * s, v[1] * s, v[2] * s];
}

/** 유클리드 거리 (double 정밀도 유지) */
export function distance(a: Vec3Double, b: Vec3Double): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** 크기 */
export function length(v: Vec3Double): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}
