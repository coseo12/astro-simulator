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

/**
 * P6-C #191 — GR 보정 모드.
 * - `'off'`: Newton만
 * - `'single-1pn'`: P5-A 단일체 1PN (태양 기준 시험입자 근사)
 * - `'eih'`: P6-C 다체 EIH 1PN (모든 쌍 + 간접 가속도)
 *
 * WASM 매핑: off=0, single-1pn=1, eih=2 (`set_gr_mode`).
 */
export type GrMode = 'off' | 'single-1pn' | 'eih';

const GR_MODE_TO_U8: Record<GrMode, number> = {
  off: 0,
  'single-1pn': 1,
  eih: 2,
};

/**
 * P7-B #207 — 적분기 종류. WASM `IntegratorKind` (0=VV, 1=Yoshida4)와 1:1 매핑.
 *
 * - `'velocity-verlet'`: 2차 심플렉틱, 기본값. 기존 동작 유지.
 * - `'yoshida4'`: Yoshida 1990 4차 심플렉틱 (3-stage). 장기 궤도 정밀도 우위, 비용 ~3×.
 *
 * 런타임 핫스왑은 비지원. 생성자에서만 설정한다 (#207 DoD).
 */
export type IntegratorKind = 'velocity-verlet' | 'yoshida4';

/**
 * TS → WASM u8 매핑. 향후 2=RK8 passive 예약 (Rust 측에서 추가되면 여기도 확장).
 * 별칭(`verlet`)은 URL 파서(apps/web/src/core/parse-integrator.ts)에서 정규화하므로
 * 여기에는 포함하지 않는다.
 */
const INTEGRATOR_TO_U8: Record<IntegratorKind, number> = {
  'velocity-verlet': 0,
  yoshida4: 1,
};

export interface NBodyEngineOptions {
  /** 서브스텝 최대 dt(초). 기본 1일. */
  maxSubstepSeconds?: number;
  /**
   * P6-C #191 — GR 모드. 미지정 시 'off'.
   * `enableGR=true` 와 함께 지정하면 `grMode` 가 우선.
   */
  grMode?: GrMode;
  /**
   * P5-A #178 — 1PN GR 보정 활성 (호환 boolean).
   * `true` → `'single-1pn'`, `false` → `'off'` 으로 매핑.
   * @deprecated P6-C부터 `grMode` 사용 권장. 호환성을 위해 유지.
   */
  enableGR?: boolean;
  /**
   * P7-B #207 — 적분기 종류. 미지정 시 `'velocity-verlet'` (기존 동작 유지).
   * 생성자 시점에만 반영되며 런타임 스위치는 비지원.
   */
  integrator?: IntegratorKind;
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
    // grMode 우선, 미지정 시 enableGR (호환) 반영.
    const mode: GrMode = options.grMode ?? (options.enableGR ? 'single-1pn' : 'off');
    if (mode !== 'off') {
      this.wasm.set_gr_mode(GR_MODE_TO_U8[mode]);
    }
    // P7-B #207 — 적분기 옵션. 기본값(velocity-verlet) 이면 WASM 호출 생략 (GrMode 패턴).
    const integrator: IntegratorKind = options.integrator ?? 'velocity-verlet';
    if (integrator !== 'velocity-verlet') {
      this.wasm.set_integrator(INTEGRATOR_TO_U8[integrator]);
    }
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
