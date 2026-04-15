/**
 * Velocity-Verlet 적분 WGSL compute shader (P3-B #145).
 *
 * ADR `docs/decisions/20260415-webgpu-integration-scheme.md` 에 따라 GPU-resident 스킴을 채택.
 * V-V 1 step은 3-pass:
 *   PRE  : v ← v + 0.5·a·dt;  x ← x + v·dt
 *   FORCE: a ← compute_forces(x)            (별도 shader, #144)
 *   POST : v ← v + 0.5·a·dt
 *
 * `phase` uniform으로 PRE/POST를 한 셰이더에서 분기 (디스패치 수 동일하지만 코드 1개로 관리).
 */
import type { ComputeShader } from '@babylonjs/core/Compute/computeShader.js';
import type { GpuComputeContext } from './compute-context.js';

export const NBODY_VV_TILE = 64;

/** PRE pass = 0, POST pass = 1. uniform `phase`로 분기. */
export const NBODY_VV_PHASE_PRE = 0;
export const NBODY_VV_PHASE_POST = 1;

export const NBODY_VV_WGSL = /* wgsl */ `
struct Params {
  n: u32,
  phase: u32,    // 0=PRE, 1=POST
  dt: f32,
  _pad: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> positions: array<f32>;
@group(0) @binding(2) var<storage, read_write> velocities: array<f32>;
@group(0) @binding(3) var<storage, read> accelerations: array<f32>;

@compute @workgroup_size(${NBODY_VV_TILE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.n) {
    return;
  }
  let base = 3u * i;
  let half_dt = 0.5 * params.dt;

  // 모든 phase에서 v ← v + 0.5 a dt
  velocities[base]      = velocities[base]      + half_dt * accelerations[base];
  velocities[base + 1u] = velocities[base + 1u] + half_dt * accelerations[base + 1u];
  velocities[base + 2u] = velocities[base + 2u] + half_dt * accelerations[base + 2u];

  // PRE pass에서만 위치 업데이트 (POST는 v만 갱신)
  if (params.phase == 0u) {
    positions[base]      = positions[base]      + params.dt * velocities[base];
    positions[base + 1u] = positions[base + 1u] + params.dt * velocities[base + 1u];
    positions[base + 2u] = positions[base + 2u] + params.dt * velocities[base + 2u];
  }
}
`;

export function createNbodyVvShader(ctx: GpuComputeContext): ComputeShader {
  return ctx.createShader('nbody-vv', NBODY_VV_WGSL, {
    bindingsMapping: {
      params: { group: 0, binding: 0 },
      positions: { group: 0, binding: 1 },
      velocities: { group: 0, binding: 2 },
      accelerations: { group: 0, binding: 3 },
    },
  });
}
