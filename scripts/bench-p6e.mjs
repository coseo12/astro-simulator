#!/usr/bin/env node
/**
 * P6-E #193 — P6-A/C 물리 코어 실측 (geodesic LUT sweep + EIH 1PN N=9).
 *
 * architect ADR E1 결정:
 *   - geodesic_ms: build_lensing_lut(samples) sample sweep {64, 256, 1024}
 *   - eih_1pn_ms:  NBodySystem (GrMode::EIH1PN) N=9 (태양+8행성) 1000 step 평균
 *
 * Node 환경에서 pkg-node WASM 직접 호출 (bench-webgpu.mjs는 렌더+엔진 합산 측정인 반면,
 * P6-E는 "물리 코어 자체"의 연산 비용만 격리 측정. Playwright 오버헤드 제거).
 *
 * 결과: docs/benchmarks/p6e-{timestamp}.json + console 표.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'docs', 'benchmarks');
mkdirSync(outDir, { recursive: true });

// P6-E — pkg-node (CommonJS wasm-bindgen 출력). bench에서는 renderer/DOM이 필요 없다.
const wasmPath = join(__dirname, '..', 'packages', 'physics-wasm', 'pkg-node', 'physics_wasm.js');
const wasm = require(wasmPath);

// ───────────────────────────────────────────────────────────────────────
// E1-a. geodesic_ms — build_lensing_lut sample sweep
// ───────────────────────────────────────────────────────────────────────
// architect 지정: {64, 256, 1024} 각 10회 호출 후 평균 ms.
// 첫 호출은 wasm 초기화/JIT 편향을 피하기 위해 warmup으로 버린다.
const GEODESIC_SAMPLES = [64, 256, 1024];
const GEODESIC_ITERATIONS = 10;
const GEODESIC_WARMUP = 2;

const geodesicResults = {};
for (const samples of GEODESIC_SAMPLES) {
  // warmup
  for (let i = 0; i < GEODESIC_WARMUP; i += 1) {
    wasm.build_lensing_lut(samples);
  }
  const durations = [];
  for (let i = 0; i < GEODESIC_ITERATIONS; i += 1) {
    const t0 = performance.now();
    wasm.build_lensing_lut(samples);
    durations.push(performance.now() - t0);
  }
  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
  const min = Math.min(...durations);
  const max = Math.max(...durations);
  geodesicResults[`samples_${samples}`] = {
    avg_ms: Number(avg.toFixed(3)),
    min_ms: Number(min.toFixed(3)),
    max_ms: Number(max.toFixed(3)),
    iterations: GEODESIC_ITERATIONS,
  };
  console.log(
    `geodesic_ms samples=${String(samples).padStart(4)}: avg=${avg.toFixed(3).padStart(8)}ms · min=${min.toFixed(3)}ms · max=${max.toFixed(3)}ms (n=${GEODESIC_ITERATIONS})`,
  );
}

// ───────────────────────────────────────────────────────────────────────
// E1-b. eih_1pn_ms — N=9 태양+8행성 EIH 1PN, 1000 step 가속도 계산 평균
// ───────────────────────────────────────────────────────────────────────
// architect 지정: N=9, 1000 step, ms/step 평균.
//
// 행성 파라미터: P6-C `eih_9body_100yr_eccentricity_drift` / P6-D ADR 테이블과 동일.
// JPL 위상 대신 simplified Keplerian — secular 측정에는 영향 없음 (EIH 식 연산 비용만 평가).
const G = 6.6743e-11; // N·m²/kg²
const DAY = 86400;
const AU = 1.495978707e11;

// [name, mass_kg, semi_major_m, eccentricity, period_days]
const BODIES = [
  ['Sun', 1.98892e30, 0, 0, 0], // 중심천체 (원점 고정 초기값)
  ['Mercury', 3.301e23, 5.791e10, 0.20563, 87.969],
  ['Venus', 4.867e24, 1.0821e11, 0.00677, 224.701],
  ['Earth', 5.972e24, 1.496e11, 0.01671, 365.256],
  ['Mars', 6.417e23, 2.2794e11, 0.0934, 686.98],
  ['Jupiter', 1.898e27, 7.7857e11, 0.0489, 4332.589],
  ['Saturn', 5.683e26, 1.4335e12, 0.0565, 10759.22],
  ['Uranus', 8.681e25, 2.8725e12, 0.046, 30685.4],
  ['Neptune', 1.024e26, 4.4951e12, 0.0097, 60189.0],
];

// 근일점 시작, vis-viva 속도. 타원 운동면은 z=0 단순화 (bench는 연산 비용만 측정).
const N = BODIES.length;
const masses = new Float64Array(N);
const positions = new Float64Array(3 * N);
const velocities = new Float64Array(3 * N);

for (let i = 0; i < N; i += 1) {
  const [, mass, a, e] = BODIES[i];
  masses[i] = mass;
  if (i === 0) {
    // 태양 원점 고정.
    positions[0] = 0;
    positions[1] = 0;
    positions[2] = 0;
    velocities[0] = 0;
    velocities[1] = 0;
    velocities[2] = 0;
    continue;
  }
  const rPeri = a * (1 - e); // 근일점 거리
  // vis-viva: v² = GM(2/r − 1/a). 근일점에서 접선 방향 (+y).
  const vPeri = Math.sqrt(G * BODIES[0][1] * (2 / rPeri - 1 / a));
  positions[3 * i + 0] = rPeri;
  positions[3 * i + 1] = 0;
  positions[3 * i + 2] = 0;
  velocities[3 * i + 0] = 0;
  velocities[3 * i + 1] = vPeri;
  velocities[3 * i + 2] = 0;
}

const EIH_STEPS = 1000;
const EIH_WARMUP_STEPS = 50;
// dt=1h (3600s) — P6-C `eih_9body_*` 테스트에서 검증된 스텝. bench는 스텝별 소요만 측정.
const EIH_DT = 3600;

const engine = new wasm.NBodyEngine(masses, positions, velocities);
engine.set_gr_mode(2); // 2 = EIH1PN

// warmup — wasm JIT 안정화.
for (let i = 0; i < EIH_WARMUP_STEPS; i += 1) {
  engine.step(EIH_DT);
}

// P6-E bench는 "스텝 호출"의 총 시간을 N=9에 대해 측정.
const eihStart = performance.now();
for (let i = 0; i < EIH_STEPS; i += 1) {
  engine.step(EIH_DT);
}
const eihTotal = performance.now() - eihStart;
const eihPerStep = eihTotal / EIH_STEPS;
engine.free();

console.log(
  `eih_1pn_ms   N=${N}      : total=${eihTotal.toFixed(1)}ms · avg/step=${eihPerStep.toFixed(4)}ms (steps=${EIH_STEPS})`,
);

const eihResults = {
  n_9_steps_1000: {
    total_ms: Number(eihTotal.toFixed(3)),
    avg_ms_per_step: Number(eihPerStep.toFixed(4)),
    steps: EIH_STEPS,
    dt_seconds: EIH_DT,
    warmup_steps: EIH_WARMUP_STEPS,
  },
};

// ───────────────────────────────────────────────────────────────────────
// 리포트 저장
// ───────────────────────────────────────────────────────────────────────
const timestamp = new Date().toISOString();
const outPath = join(outDir, `p6e-${timestamp.replace(/[:.]/g, '-')}.json`);
writeFileSync(
  outPath,
  JSON.stringify(
    {
      timestamp,
      environment: `node-${process.version}-${process.platform}-${process.arch}`,
      physicsWasmPath: wasmPath,
      geodesic_ms: geodesicResults,
      eih_1pn_ms: eihResults,
    },
    null,
    2,
  ) + '\n',
);
console.log(`\n리포트: ${outPath}`);
