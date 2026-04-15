/**
 * GPU force shader의 CPU 참조 구현 (P3-B #144).
 *
 * GPU 결과 검증용 — 동일한 알고리즘(direct sum + softening)을 f32로 수행해 GPU와 비교.
 * f32 정밀도가 동일하므로 GPU vs CPU 차이는 누적 순서 차이만 남는다.
 *
 * 시뮬레이션 본체에는 사용 금지 — `NBodySystem`(f64) 사용.
 */

/**
 * positions(3N f32), masses(N f32) → accelerations(3N f32).
 * GPU 셰이더와 동일 알고리즘: 모든 페어, self 제외, softening_sq 적용.
 */
export function computeForcesF32(
  positions: Float32Array,
  masses: Float32Array,
  softeningSq: number,
  gravitationalConstant: number,
): Float32Array {
  const n = masses.length;
  const acc = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    const xi = positions[3 * i] ?? 0;
    const yi = positions[3 * i + 1] ?? 0;
    const zi = positions[3 * i + 2] ?? 0;
    let ax = 0;
    let ay = 0;
    let az = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const dx = (positions[3 * j] ?? 0) - xi;
      const dy = (positions[3 * j + 1] ?? 0) - yi;
      const dz = (positions[3 * j + 2] ?? 0) - zi;
      const r2 = dx * dx + dy * dy + dz * dz + softeningSq;
      const invR3 = Math.pow(r2, -1.5);
      const f = gravitationalConstant * (masses[j] ?? 0) * invR3;
      ax += f * dx;
      ay += f * dy;
      az += f * dz;
    }
    acc[3 * i] = ax;
    acc[3 * i + 1] = ay;
    acc[3 * i + 2] = az;
  }
  return acc;
}
