/**
 * N-body 가속도 WGSL compute shader (P3-B #144).
 *
 * 알고리즘
 * --------
 * 1 thread = 1 target 입자. 64-입자 tile을 workgroup shared memory(`var<workgroup>`)에 로드한 뒤
 * 모든 thread가 동기화 barrier 이후 tile 내 64 source와 페어 계산 → tile 단위로 누적.
 * N/TILE 회 반복하면 각 thread가 모든 source에 대한 가속도를 얻는다.
 *
 * 자기 자신(self-force)은 거리 0에서 softening_sq로 안전하게 0에 가까운 값이 되지만,
 * 정확한 0을 위해 인덱스 비교로 명시 제거.
 *
 * 정밀도 — f32 한정. 행성 SI 좌표(~1e11 m)에서 ~10km 단위 정밀도 손실. P3-B #145에서
 * relative origin shift 등으로 보전 전략 결정.
 */
import type { ComputeShader } from '@babylonjs/core/Compute/computeShader.js';
import type { GpuComputeContext } from './compute-context.js';
import type { GpuFloat32Buffer } from './buffer.js';
import { WGSL_GRAVITY_PAIR } from './wgsl-helpers.js';

export const NBODY_FORCE_TILE = 64;

export const NBODY_FORCE_WGSL = /* wgsl */ `
${WGSL_GRAVITY_PAIR}

struct Params {
  n: u32,
  softening_sq: f32,
  g: f32,
  _pad: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> positions: array<f32>;   // 3N flat (xyz, xyz, ...)
@group(0) @binding(2) var<storage, read> masses: array<f32>;      // N
@group(0) @binding(3) var<storage, read_write> accelerations: array<f32>; // 3N flat

const TILE: u32 = ${NBODY_FORCE_TILE}u;

var<workgroup> tile_pos: array<vec3<f32>, TILE>;
var<workgroup> tile_mass: array<f32, TILE>;

@compute @workgroup_size(${NBODY_FORCE_TILE})
fn main(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  let i = gid.x;
  let local_idx = lid.x;
  let n = params.n;

  // self position (out-of-range thread는 dummy 위치 사용 — 결과는 버려짐)
  var self_pos: vec3<f32>;
  if (i < n) {
    self_pos = vec3<f32>(positions[3u * i], positions[3u * i + 1u], positions[3u * i + 2u]);
  } else {
    self_pos = vec3<f32>(0.0);
  }

  var acc = vec3<f32>(0.0);

  let tile_count = (n + TILE - 1u) / TILE;
  for (var t: u32 = 0u; t < tile_count; t = t + 1u) {
    let src_idx = t * TILE + local_idx;
    if (src_idx < n) {
      tile_pos[local_idx] = vec3<f32>(
        positions[3u * src_idx],
        positions[3u * src_idx + 1u],
        positions[3u * src_idx + 2u],
      );
      tile_mass[local_idx] = masses[src_idx];
    } else {
      tile_mass[local_idx] = 0.0; // 가중치 0 — pair 계산이 무시됨
      tile_pos[local_idx] = vec3<f32>(0.0);
    }
    workgroupBarrier();

    // 내 i가 유효할 때만 누적 (out-of-range thread는 작업 안 함)
    if (i < n) {
      for (var k: u32 = 0u; k < TILE; k = k + 1u) {
        let src_global = t * TILE + k;
        // self 제거 (질량이 0이거나 자기 자신)
        if (src_global < n && src_global != i && tile_mass[k] > 0.0) {
          acc = acc + _bh_pair_acc(self_pos, tile_pos[k], tile_mass[k], params.softening_sq, params.g);
        }
      }
    }
    workgroupBarrier();
  }

  if (i < n) {
    accelerations[3u * i] = acc.x;
    accelerations[3u * i + 1u] = acc.y;
    accelerations[3u * i + 2u] = acc.z;
  }
}
`;

/** Compute shader 빌드. ctx는 #143 GpuComputeContext. */
export function createNbodyForceShader(ctx: GpuComputeContext): ComputeShader {
  return ctx.createShader('nbody-force', NBODY_FORCE_WGSL, {
    bindingsMapping: {
      params: { group: 0, binding: 0 },
      positions: { group: 0, binding: 1 },
      masses: { group: 0, binding: 2 },
      accelerations: { group: 0, binding: 3 },
    },
  });
}

export interface NbodyForceDispatchOptions {
  positions: GpuFloat32Buffer; // 3N
  masses: GpuFloat32Buffer; // N
  accelerations: GpuFloat32Buffer; // 3N (output)
  paramsBuffer: { update(data: Float32Array): void; raw(): unknown };
  n: number;
  softening: number;
  gravitationalConstant: number;
}

/**
 * Force shader 디스패치 + readback. 호출자가 매 step마다 사용.
 *
 * `paramsBuffer`는 16-byte aligned uniform (n: u32, softening_sq: f32, g: f32, pad: f32).
 * 호출자 측 UniformBuffer 또는 GpuFloat32Buffer로 관리.
 */
export function dispatchNbodyForce(shader: ComputeShader, opts: NbodyForceDispatchOptions): void {
  // params 갱신 — n은 u32지만 Float32Array slot에 bit-cast로 박는 게 일반적.
  // 안전을 위해 호출자는 별도 Uint32Array 헬퍼를 사용 권장. 여기서는 inline conversion.
  const params = new Float32Array(4);
  // n을 i32로 reinterpret (양의 정수 N≤2^31는 안전)
  new Uint32Array(params.buffer)[0] = opts.n >>> 0;
  params[1] = opts.softening * opts.softening;
  params[2] = opts.gravitationalConstant;
  params[3] = 0;
  opts.paramsBuffer.update(params);

  shader.setStorageBuffer('positions', opts.positions.raw());
  shader.setStorageBuffer('masses', opts.masses.raw());
  shader.setStorageBuffer('accelerations', opts.accelerations.raw());
  // params는 storage buffer로도 가능 (호환성 ↑), uniform이면 setUniformBuffer 사용
  // 호출자 셋팅 책임 — paramsBuffer는 호출자가 미리 shader에 바인딩.

  const groups = Math.ceil(opts.n / NBODY_FORCE_TILE);
  shader.dispatch(groups, 1, 1);
}
