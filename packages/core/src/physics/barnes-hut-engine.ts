/**
 * Barnes-Hut N-body 엔진 — WASM `BarnesHutEngine`(#132)을 TS에서 사용하기 위한 얇은 래퍼.
 *
 * `NBodyEngine`(직접합)과 동일 인터페이스 — 호출자는 동일 코드로 두 엔진 교체 가능.
 * P3-A #134에서 scene API가 이 어댑터를 통해 분기한다.
 */
import { BarnesHutEngine as WasmEngine } from '@astro-simulator/physics-wasm';
import type { NBodyEngineOptions, NBodyState } from './nbody-engine.js';

const DEFAULT_MAX_SUB_DT_SECONDS = 86_400; // 1 일

export interface BarnesHutEngineOptions extends NBodyEngineOptions {
  /** MAC 임계값 (0=직접합, 0.5 권장, 0.7 빠름). 기본 0.5. */
  theta?: number;
  /** close-encounter 발산 방지용 ε(미터). 기본 1e3 (1km, 행성 스케일 무시 가능). */
  softening?: number;
}

export class BarnesHutNBodyEngine {
  private wasm: WasmEngine;
  private readonly maxSubDt: number;
  readonly ids: readonly string[];

  constructor(state: NBodyState, options: BarnesHutEngineOptions = {}) {
    const theta = options.theta ?? 0.5;
    const softening = options.softening ?? 1e3;
    this.wasm = new WasmEngine(state.masses, state.positions, state.velocities, theta, softening);
    this.maxSubDt = options.maxSubstepSeconds ?? DEFAULT_MAX_SUB_DT_SECONDS;
    this.ids = state.ids;
  }

  advance(dtSeconds: number): void {
    if (dtSeconds === 0) return;
    this.wasm.step_chunked(dtSeconds, this.maxSubDt);
  }

  positions(): Float64Array {
    return this.wasm.positions();
  }

  velocities(): Float64Array {
    return this.wasm.velocities();
  }

  totalEnergy(): number {
    return this.wasm.total_energy();
  }

  setTheta(theta: number): void {
    this.wasm.set_theta(theta);
  }

  dispose(): void {
    this.wasm.free();
  }
}
