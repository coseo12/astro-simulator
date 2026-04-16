#!/usr/bin/env node
/**
 * P3-B #147 — WebGPU 엔진 성능 측정.
 *
 * Chromium 헤드리스에 `--enable-unsafe-webgpu` flag로 WebGPU 활성화 시도. 환경별로
 * WebGPU 가용성이 다르며, lavapipe/dawn이 없으면 macOS는 Metal, Linux는 Vulkan 경유.
 *
 * 측정 시나리오 (각각 play-1y, 3초 측정):
 *   /ko?engine=newton&belt=N
 *   /ko?engine=barnes-hut&belt=N
 *   /ko?engine=webgpu&belt=N
 * for N in [1000, 5000, 10000]
 *
 * 결과: docs/benchmarks/p3b-{timestamp}.json + console 표
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const baseUrl = process.argv[2] ?? 'http://localhost:3000';
const DURATION_MS = 3_000;
const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'docs', 'benchmarks');
mkdirSync(outDir, { recursive: true });

// P3-D #154 — vsync 해제 flag로 절대 throughput 측정 가능. cap fps 우회.
const browser = await chromium.launch({
  headless: true,
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan',
    '--use-angle=metal',
    '--enable-gpu-rasterization',
    '--ignore-gpu-blocklist',
    // vsync/frame-rate cap 해제 (절대 throughput 측정용)
    '--disable-gpu-vsync',
    '--disable-frame-rate-limit',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    // P4-D #166 — headless Chromium에서 WebGPU timestamp-query resolve 활성화.
    // 이 flag 없이는 count는 증가하지만 값이 전부 0ns로 기록되어 측정 불가.
    '--enable-webgpu-developer-features',
    '--enable-dawn-features=allow_unsafe_apis',
  ],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

const measureFps = (d) =>
  page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        let c = 0;
        const t0 = performance.now();
        const loop = () => {
          c += 1;
          if (performance.now() - t0 < ms) requestAnimationFrame(loop);
          else resolve((c * 1000) / (performance.now() - t0));
        };
        requestAnimationFrame(loop);
      }),
    d,
  );

// WebGPU capability 사전 확인
await page.goto(`${baseUrl}/ko`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const isWebGpu = await page.evaluate(() => 'gpu' in navigator);
console.log(`navigator.gpu present: ${isWebGpu}`);
const engineKind = await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  // @ts-ignore — Babylon engine reflection
  const engine = canvas?._babylonEngine ?? null;
  return engine?.isWebGPU === true ? 'webgpu' : 'webgl2';
});
console.log(`Babylon engine kind: ${engineKind}`);

// P4-D #166 — `?gpuTimer=1`로 Babylon EngineInstrumentation 활성.
// 미지원 환경(WebGL2 timer query 없음, WebGPU timestamp-query feature 거부)은 null 유지.
const readGpuMs = () =>
  page.evaluate(
    () => /** @type {number | null} */ (/** @type {any} */ (window).__gpuFrameTimeMs ?? null),
  );

// P4-A #165 — beltNbody=1 모드로 측정. 소행성대가 N-body 엔진에 편입되어
// engine 선택(newton/barnes-hut/webgpu)이 실제 N=행성+belt 전체에 대해 적용된다.
//
// 시간 프리셋 미사용 이유: time-preset-1y는 timescale을 31.5M sec/sec로 키워
// frame당 dt~6일이 되고 N=10000 O(N²) × 6 sub-step으로 hang 발생. 기본 속도에서
// 프레임당 연산량이 현실적이고 fps만 정확히 측정되면 충분.
//
// newton은 O(N²) 한계로 N=10000에서 불가 — 명시적 skip.
const rows = [];
for (const engine of ['newton', 'barnes-hut', 'webgpu']) {
  for (const belt of [1000, 5000, 10000]) {
    if (engine === 'newton' && belt >= 5000) {
      console.log(`${engine.padEnd(11)} N=${String(belt).padEnd(5)}: skipped (O(N²) 한계)`);
      rows.push({ engine, belt, fps: null, gpuMs: null, skipped: true });
      continue;
    }
    const url = `${baseUrl}/ko?engine=${engine}&belt=${belt}&beltNbody=1&gpuTimer=1`;
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.click('[data-testid="time-play"]').catch(() => {});
    await page.waitForTimeout(500);
    const fps = await measureFps(DURATION_MS);
    // 측정 직후 읽기 — lastSecAverage는 최근 1초 평균. 측정 윈도우와 정렬.
    const gpuMs = await readGpuMs();
    rows.push({
      engine,
      belt,
      fps: Number(fps.toFixed(2)),
      gpuMs: gpuMs === null ? null : Number(gpuMs.toFixed(3)),
    });
    const gpuStr = gpuMs === null ? 'n/a' : `${gpuMs.toFixed(3)}ms`;
    console.log(
      `${engine.padEnd(11)} N=${String(belt).padEnd(5)}: ${fps.toFixed(2).padStart(7)} fps · gpu ${gpuStr}`,
    );
  }
}

await browser.close();

const ts = new Date().toISOString();
const outPath = join(outDir, `p3b-${ts.replace(/[:.]/g, '-')}.json`);
writeFileSync(
  outPath,
  JSON.stringify(
    {
      timestamp: ts,
      environment: 'playwright-chromium-headless',
      babylonEngineKind: engineKind,
      navigatorGpuPresent: isWebGpu,
      rows,
    },
    null,
    2,
  ) + '\n',
);
console.log(`\n리포트: ${outPath}`);

// 가속비 표 (fps 기반 — 렌더+시뮬 합산)
console.log('\n=== fps 가속비 (vs newton baseline. newton 없으면 barnes-hut 기준) ===');
const groups = new Map();
for (const r of rows) {
  if (r.skipped) continue;
  if (!groups.has(r.belt)) groups.set(r.belt, {});
  groups.get(r.belt)[r.engine] = r;
}
console.log('N         base   engine       bh-x       webgpu-x');
for (const [n, g] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
  const baseEngine = g.newton ? 'newton' : 'barnes-hut';
  const base = g[baseEngine]?.fps ?? 1;
  const bh = ((g['barnes-hut']?.fps ?? 0) / base).toFixed(2);
  const wg = ((g.webgpu?.fps ?? 0) / base).toFixed(2);
  console.log(
    `${String(n).padEnd(9)} ${base.toFixed(2).padEnd(6)} ${baseEngine.padEnd(12)} ${bh.padEnd(10)} ${wg}`,
  );
}

// P4-D #166 — GPU ms 기반 비율 (렌더+시뮬의 GPU 시간만 측정. CPU 제외).
// 이 값이 있으면 "WebGPU compute가 실제 GPU에서 얼마나 시간을 쓰는가"를 직접 비교 가능.
// null 섞이면 해당 행 skip (WebGL2는 timer query 미지원 환경 흔함).
console.log('\n=== GPU ms (낮을수록 빠름. null은 timer query 미지원)  ===');
console.log('N         newton        barnes-hut    webgpu');
for (const [n, g] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
  const fmt = (r) => (r?.gpuMs == null ? 'n/a'.padEnd(12) : `${r.gpuMs.toFixed(3)}ms`.padEnd(12));
  console.log(`${String(n).padEnd(9)} ${fmt(g.newton)}  ${fmt(g['barnes-hut'])}  ${fmt(g.webgpu)}`);
}
// GPU ms 기반 throughput 비율 — 참고 정보.
// barnes-hut은 CPU(wasm)에서 시뮬하므로 GPU ms에는 렌더 시간만 잡혀 비교 무의미.
// 실질 비교는 위의 fps 비율 (시뮬+렌더 합산이지만 CPU bottleneck을 포함)이 맞다.
console.log('\n=== GPU ms (참고 — barnes-hut은 CPU 시뮬이라 렌더만 측정) ===');
for (const [n, g] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
  const bhMs = g['barnes-hut']?.gpuMs;
  const wgMs = g.webgpu?.gpuMs;
  const ratio = bhMs && wgMs ? (bhMs / wgMs).toFixed(2) + '×' : 'n/a';
  console.log(`N=${String(n).padEnd(8)} barnes-hut_ms/webgpu_ms=${ratio}`);
}

// P4-A #165 — throughput 가드. N=5000에서 webgpu_fps / barnes-hut_fps ≥ 2.0.
// 미달 시 exit code 1. beltNbody=1 모드의 회귀 방지 목적 (GPU 비활성 구성 변경 감지 등).
console.log('\n=== P4-A throughput 가드 ===');
const target = 2.0;
let guardFailed = false;
for (const n of [1000, 5000, 10000]) {
  const g = groups.get(n);
  if (!g) continue;
  const bh = g['barnes-hut']?.fps;
  const wg = g.webgpu?.fps;
  if (!bh || !wg) {
    console.log(`N=${n}: skip (데이터 없음)`);
    continue;
  }
  const ratio = wg / bh;
  const status = ratio >= target ? '✓' : '✗';
  console.log(`N=${n}: webgpu/bh = ${ratio.toFixed(2)}× (target ≥${target}×) ${status}`);
  if (n === 5000 && ratio < target) guardFailed = true;
}
if (guardFailed) {
  console.log('\n❌ P4-A 가드 실패 — N=5000에서 WebGPU가 barnes-hut 대비 2× 미달');
  process.exit(1);
}
console.log('\n✓ P4-A 가드 통과');
