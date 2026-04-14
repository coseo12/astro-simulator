/**
 * Newton N-body 엔진 — WASM 코어(#85)를 TS에서 사용하기 위한 얇은 래퍼.
 *
 * - 월드 좌표(태양 원점, SI m·s) 기준으로 초기화
 * - `advance(dtSeconds)`로 전/역행 가능 (Velocity-Verlet 대칭성)
 * - 긴 dt는 내부 서브스텝으로 쪼개어 안정성 확보 (기본 1일)
 */
import { NBodyEngine as WasmEngine } from '@astro-simulator/physics-wasm';
import { GRAVITATIONAL_CONSTANT } from '@astro-simulator/shared';
import type { LoadedSolarSystem } from '../ephemeris/solar-system-loader.js';
import { orbitalStateAt } from './state-vector.js';

const DEFAULT_MAX_SUB_DT_SECONDS = 86_400; // 1 일

export interface NBodyEngineOptions {
  /** 서브스텝 최대 dt(초). 기본 1일. */
  maxSubstepSeconds?: number;
}

export interface NBodyState {
  ids: string[];
  masses: Float64Array;
  positions: Float64Array; // 길이 3N, 월드 좌표
  velocities: Float64Array;
}

/**
 * 태양계 로드 결과에서 Newton 초기 상태를 빌드한다.
 * 태양은 원점·정지로 고정. 자식 바디는 orbitalStateAt로 부모 기준 좌표를 구한 뒤
 * 부모 월드 좌표에 더해 태양 중심 좌표로 변환.
 *
 * P1은 모든 행성이 태양을 부모로 하므로 단순 누적. 달은 지구 기준.
 */
export function buildInitialState(system: LoadedSolarSystem, julianDate: number): NBodyState {
  const byId = new Map(system.bodies.map((b) => [b.id, b]));
  const worldPos = new Map<string, [number, number, number]>();
  const worldVel = new Map<string, [number, number, number]>();

  const resolve = (id: string): void => {
    if (worldPos.has(id)) return;
    const body = byId.get(id);
    if (!body) return;
    if (!body.orbit || !body.parentId) {
      worldPos.set(id, [0, 0, 0]);
      worldVel.set(id, [0, 0, 0]);
      return;
    }
    const parent = byId.get(body.parentId);
    if (!parent) return;
    resolve(parent.id);
    const parentP = worldPos.get(parent.id)!;
    const parentV = worldVel.get(parent.id)!;
    const mu = GRAVITATIONAL_CONSTANT * parent.mass;
    const { position, velocity } = orbitalStateAt(body.orbit, julianDate, mu);
    worldPos.set(id, [
      parentP[0] + position[0],
      parentP[1] + position[1],
      parentP[2] + position[2],
    ]);
    worldVel.set(id, [
      parentV[0] + velocity[0],
      parentV[1] + velocity[1],
      parentV[2] + velocity[2],
    ]);
  };
  for (const b of system.bodies) resolve(b.id);

  const n = system.bodies.length;
  const ids = system.bodies.map((b) => b.id);
  const masses = new Float64Array(n);
  const positions = new Float64Array(3 * n);
  const velocities = new Float64Array(3 * n);
  system.bodies.forEach((b, i) => {
    masses[i] = b.mass;
    const p = worldPos.get(b.id) ?? [0, 0, 0];
    const v = worldVel.get(b.id) ?? [0, 0, 0];
    positions[3 * i] = p[0];
    positions[3 * i + 1] = p[1];
    positions[3 * i + 2] = p[2];
    velocities[3 * i] = v[0];
    velocities[3 * i + 1] = v[1];
    velocities[3 * i + 2] = v[2];
  });

  return { ids, masses, positions, velocities };
}

export class NBodyEngine {
  private wasm: WasmEngine;
  private readonly maxSubDt: number;
  readonly ids: readonly string[];

  constructor(state: NBodyState, options: NBodyEngineOptions = {}) {
    this.wasm = new WasmEngine(state.masses, state.positions, state.velocities);
    this.maxSubDt = options.maxSubstepSeconds ?? DEFAULT_MAX_SUB_DT_SECONDS;
    this.ids = state.ids;
  }

  /** dtSeconds만큼 적분. 음수 값은 역행(심플렉틱 대칭). */
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

  dispose(): void {
    this.wasm.free();
  }
}
