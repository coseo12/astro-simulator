/**
 * GPU V-V integrator의 CPU 참조 구현 (P3-B #145).
 *
 * #147에서 GPU 결과 검증용. 동일 알고리즘을 f32로 수행한다.
 * 시뮬레이션 본체에는 사용 금지 — `NBodySystem`(f64) 사용.
 */
import { computeForcesF32 } from './nbody-force-cpu.js';

/**
 * Velocity-Verlet 1 step (in-place 갱신).
 * positions, velocities, accelerations는 모두 3N f32. accelerations는 호출 전에
 * 호출자가 한 번 채워둔 상태여야 한다 (`computeForcesF32`로 초기화).
 */
export function stepVvF32(
  positions: Float32Array,
  velocities: Float32Array,
  accelerations: Float32Array,
  masses: Float32Array,
  dt: number,
  softeningSq: number,
  gravitationalConstant: number,
): void {
  const n3 = positions.length;
  const halfDt = 0.5 * dt;

  // PRE: v ← v + ½ a dt; x ← x + v dt
  for (let k = 0; k < n3; k++) {
    velocities[k] = (velocities[k] ?? 0) + halfDt * (accelerations[k] ?? 0);
  }
  for (let k = 0; k < n3; k++) {
    positions[k] = (positions[k] ?? 0) + dt * (velocities[k] ?? 0);
  }

  // FORCE: a ← compute_forces(x)
  const newAcc = computeForcesF32(positions, masses, softeningSq, gravitationalConstant);
  for (let k = 0; k < n3; k++) {
    accelerations[k] = newAcc[k] ?? 0;
  }

  // POST: v ← v + ½ a dt
  for (let k = 0; k < n3; k++) {
    velocities[k] = (velocities[k] ?? 0) + halfDt * (accelerations[k] ?? 0);
  }
}
