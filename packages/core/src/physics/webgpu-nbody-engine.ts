/**
 * WebGPU N-body 엔진 — GPU-resident V-V 적분기 (#146).
 *
 * ADR `docs/decisions/20260415-webgpu-integration-scheme.md`의 B 스킴 구현.
 * `NBodyEngine`/`BarnesHutNBodyEngine`과 동일 시그니처 — caller 코드 동일.
 *
 * 한계
 * ----
 * - WGSL f32 정밀도. 행성 SI 좌표(~1e11 m)에서 ~10km 단위 손실. 시각화 충분.
 * - `positions()`는 **마지막 readback 캐시**를 반환 (1-frame 지연 가능).
 *   GPU readback이 비동기라 sync API와 호환을 위함. 호출자가 frame 경계에서
 *   `await flushPositions()`로 강제 동기화 가능.
 *
 * 의존
 * ----
 * - #143 GpuComputeContext, GpuFloat32Buffer
 * - #144 createNbodyForceShader, NBODY_FORCE_TILE
 * - #145 createNbodyVvShader, NBODY_VV_PHASE_PRE/POST, NBODY_VV_TILE
 */
import type { ComputeShader } from '@babylonjs/core/Compute/computeShader.js';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine.js';
import { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer.js';
import { GpuFloat32Buffer, createGpuComputeContext, type GpuComputeContext } from '../gpu/index.js';
import { createNbodyForceShader, NBODY_FORCE_TILE } from '../gpu/nbody-force-shader.js';
import {
  createNbodyVvShader,
  NBODY_VV_PHASE_POST,
  NBODY_VV_PHASE_PRE,
  NBODY_VV_TILE,
} from '../gpu/nbody-vv-shader.js';
import { GRAVITATIONAL_CONSTANT } from '@astro-simulator/shared';
import type { NBodyEngineOptions, NBodyState } from './nbody-engine.js';

const DEFAULT_MAX_SUB_DT_SECONDS = 86_400; // 1일

export interface WebGpuEngineOptions extends NBodyEngineOptions {
  /** softening (m). 기본 1km. */
  softening?: number;
}

export class WebGpuNBodyEngine {
  private readonly ctx: GpuComputeContext;
  private readonly n: number;
  private readonly maxSubDt: number;
  private readonly softening: number;

  private readonly positionsBuf: GpuFloat32Buffer;
  private readonly velocitiesBuf: GpuFloat32Buffer;
  private readonly accelerationsBuf: GpuFloat32Buffer;
  private readonly massesBuf: GpuFloat32Buffer;
  private readonly forceParams: UniformBuffer;
  private readonly vvParams: UniformBuffer;
  private readonly forceShader: ComputeShader;
  private readonly vvShader: ComputeShader;

  private cachedPositions: Float32Array;
  private pendingRead: Promise<void> | null = null;

  readonly ids: readonly string[];

  constructor(state: NBodyState, engine: AbstractEngine, options: WebGpuEngineOptions = {}) {
    this.ctx = createGpuComputeContext(engine);
    this.n = state.ids.length;
    this.maxSubDt = options.maxSubstepSeconds ?? DEFAULT_MAX_SUB_DT_SECONDS;
    this.softening = options.softening ?? 1e3;
    this.ids = state.ids;

    // f32 다운캐스트 (입력은 f64 Float64Array일 수 있음)
    const pos32 = toFloat32(state.positions);
    const vel32 = toFloat32(state.velocities);
    const mass32 = toFloat32(state.masses);

    this.positionsBuf = new GpuFloat32Buffer(this.ctx, 3 * this.n, 'nbody-positions');
    this.velocitiesBuf = new GpuFloat32Buffer(this.ctx, 3 * this.n, 'nbody-velocities');
    this.accelerationsBuf = new GpuFloat32Buffer(this.ctx, 3 * this.n, 'nbody-accelerations');
    this.massesBuf = new GpuFloat32Buffer(this.ctx, this.n, 'nbody-masses');
    this.positionsBuf.write(pos32);
    this.velocitiesBuf.write(vel32);
    this.massesBuf.write(mass32);

    // Uniform buffers (4 floats each)
    this.forceParams = new UniformBuffer(this.ctx.engine, undefined, true, 'nbody-force-params');
    this.forceParams.addUniform('n', 1);
    this.forceParams.addUniform('softening_sq', 1);
    this.forceParams.addUniform('g', 1);
    this.forceParams.addUniform('_pad', 1);
    this.forceParams.create();

    this.vvParams = new UniformBuffer(this.ctx.engine, undefined, true, 'nbody-vv-params');
    this.vvParams.addUniform('n', 1);
    this.vvParams.addUniform('phase', 1);
    this.vvParams.addUniform('dt', 1);
    this.vvParams.addUniform('_pad', 1);
    this.vvParams.create();

    this.forceShader = createNbodyForceShader(this.ctx);
    this.vvShader = createNbodyVvShader(this.ctx);

    // 셰이더 binding — 호출 1회 (storage buffer는 fixed)
    this.forceShader.setUniformBuffer('params', this.forceParams);
    this.forceShader.setStorageBuffer('positions', this.positionsBuf.raw());
    this.forceShader.setStorageBuffer('masses', this.massesBuf.raw());
    this.forceShader.setStorageBuffer('accelerations', this.accelerationsBuf.raw());

    this.vvShader.setUniformBuffer('params', this.vvParams);
    this.vvShader.setStorageBuffer('positions', this.positionsBuf.raw());
    this.vvShader.setStorageBuffer('velocities', this.velocitiesBuf.raw());
    this.vvShader.setStorageBuffer('accelerations', this.accelerationsBuf.raw());

    // 초기 가속도 계산
    this.dispatchForce();

    this.cachedPositions = pos32.slice();
    void this.scheduleReadback();
  }

  /**
   * dtSeconds 만큼 적분. maxSubstep으로 sub-step 분할.
   * 음수 dt는 V-V 대칭성으로 역행 가능.
   */
  advance(dtSeconds: number): void {
    if (dtSeconds === 0) return;
    const abs = Math.abs(dtSeconds);
    const subCount = Math.max(1, Math.ceil(abs / this.maxSubDt));
    const subDt = dtSeconds / subCount;
    for (let s = 0; s < subCount; s++) {
      this.dispatchVv(NBODY_VV_PHASE_PRE, subDt);
      this.dispatchForce();
      this.dispatchVv(NBODY_VV_PHASE_POST, subDt);
    }
    void this.scheduleReadback();
  }

  /** 마지막 readback 캐시. 비동기 readback 진행 중일 수 있음 (1-frame 지연 허용). */
  positions(): Float32Array {
    return this.cachedPositions;
  }

  /** 강제 동기 readback. 정확도가 중요할 때 호출 (주의: GPU stall). */
  async flushPositions(): Promise<Float32Array> {
    this.cachedPositions = await this.positionsBuf.read(true);
    return this.cachedPositions;
  }

  /** 속도 readback 필요 시. 사용 빈도 낮아 동기 캐시 미보유. */
  async velocities(): Promise<Float32Array> {
    return this.velocitiesBuf.read(true);
  }

  totalEnergy(): number {
    // GPU 측 reduce가 필요 — #147 정확도 검증 시점에 추가. 현재는 미지원.
    return Number.NaN;
  }

  dispose(): void {
    // Babylon ComputeShader는 GC 대상. UniformBuffer만 명시적 해제.
    this.forceParams.dispose();
    this.vvParams.dispose();
  }

  private dispatchForce(): void {
    this.forceParams.updateUInt('n', this.n);
    this.forceParams.updateFloat('softening_sq', this.softening * this.softening);
    this.forceParams.updateFloat('g', GRAVITATIONAL_CONSTANT);
    this.forceParams.updateFloat('_pad', 0);
    this.forceParams.update();
    const groups = Math.ceil(this.n / NBODY_FORCE_TILE);
    this.forceShader.dispatch(groups, 1, 1);
  }

  private dispatchVv(phase: number, dt: number): void {
    this.vvParams.updateUInt('n', this.n);
    this.vvParams.updateUInt('phase', phase);
    this.vvParams.updateFloat('dt', dt);
    this.vvParams.updateFloat('_pad', 0);
    this.vvParams.update();
    const groups = Math.ceil(this.n / NBODY_VV_TILE);
    this.vvShader.dispatch(groups, 1, 1);
  }

  /** 비동기 readback — 결과를 cachedPositions에 반영. 동시 1개만. */
  private async scheduleReadback(): Promise<void> {
    if (this.pendingRead) return; // skip — 이전 read 완료 대기
    this.pendingRead = (async () => {
      try {
        this.cachedPositions = await this.positionsBuf.read(false);
      } finally {
        this.pendingRead = null;
      }
    })();
  }
}

function toFloat32(arr: Float64Array | Float32Array): Float32Array {
  if (arr instanceof Float32Array) return arr;
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) out[i] = arr[i] ?? 0;
  return out;
}
