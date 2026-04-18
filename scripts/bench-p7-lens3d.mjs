#!/usr/bin/env node
/**
 * P7-E #210 E1-b — Track B 3D ray construction 데스크톱 WebGPU 프레임 시간 측정.
 *
 * architect §결정 1: `bench-scene-real-gpu.mjs` 패턴 복제 + ?bh=2&ray3d=1 시나리오 격리.
 *
 * 측정 방법:
 *   - Playwright chromium (WebGPU 플래그)로 ?bh=2&ray3d=1 진입
 *   - warmup 2s 후 RAF 카운팅 5s 동안 프레임 수 측정 → frame_ms = 1000/fps
 *   - 10회 샘플 수집 (architect §위험 2 완화 — 표준편차 기록)
 *
 * 주의: 헤드리스 swiftshader 기본 GPU는 데스크톱 실기기와 편차 큼.
 *       bench-scene-real-gpu.mjs의 flag(`--use-angle=metal` 등)를 재사용하여
 *       실 GPU 경로를 유도한다. baseline은 개발 환경 실측으로 고정, P8에서
 *       회귀 감지 기준 설정.
 *
 * 결과: docs/benchmarks/p7-lens3d-{timestamp}.json
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const baseUrl = process.argv[2] ?? 'http://localhost:3001';
const SAMPLE_COUNT = 10;
const SAMPLE_DURATION_MS = 5000;
const WARMUP_MS = 2000;
const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'docs', 'benchmarks');
mkdirSync(outDir, { recursive: true });

// WebGPU + 실 GPU 유도 플래그 — bench-scene-real-gpu.mjs + browser-verify-black-hole-ray3d.mjs 조합.
const browser = await chromium.launch({
  headless: true,
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan,WebGPU',
    '--use-gl=angle',
    '--use-angle=metal',
    '--enable-gpu-rasterization',
    '--ignore-gpu-blocklist',
  ],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});

const measureFrameMs = (durationMs) =>
  page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        let c = 0;
        const t0 = performance.now();
        const loop = () => {
          c += 1;
          if (performance.now() - t0 < ms) requestAnimationFrame(loop);
          else {
            const elapsed = performance.now() - t0;
            const fps = (c * 1000) / elapsed;
            resolve({ fps, frameMs: elapsed / c, frames: c, elapsedMs: elapsed });
          }
        };
        requestAnimationFrame(loop);
      }),
    durationMs,
  );

// ---- ?bh=2&ray3d=1 진입 ----
console.log(`track_b_ray3d_frame_ms — ?bh=2&ray3d=1 데스크톱 WebGPU 프레임 시간 측정`);
console.log(`  sample count=${SAMPLE_COUNT} · duration/sample=${SAMPLE_DURATION_MS}ms`);
await page.goto(`${baseUrl}/ko?bh=2&ray3d=1`, { waitUntil: 'networkidle' });
await page.waitForTimeout(WARMUP_MS);

const ray3dFlag = await page.evaluate(() => window.__bhRay3D).catch(() => null);
if (ray3dFlag !== true) {
  console.error(`[FAIL] window.__bhRay3D !== true (실제: ${ray3dFlag}) — bench 중단.`);
  await browser.close();
  process.exit(1);
}

// ---- 10회 샘플 ----
const samples = [];
for (let i = 0; i < SAMPLE_COUNT; i += 1) {
  const r = await measureFrameMs(SAMPLE_DURATION_MS);
  samples.push(r);
  console.log(
    `  [${String(i + 1).padStart(2)}/${SAMPLE_COUNT}] fps=${r.fps.toFixed(2)} · frame=${r.frameMs.toFixed(3)}ms (n=${r.frames})`,
  );
}

// 통계: 평균 / 표준편차 / min / max.
const frameMsArr = samples.map((s) => s.frameMs);
const fpsArr = samples.map((s) => s.fps);
const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
const stdev = (arr) => {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
};
const avgFrameMs = mean(frameMsArr);
const stdevFrameMs = stdev(frameMsArr);
const minFrameMs = Math.min(...frameMsArr);
const maxFrameMs = Math.max(...frameMsArr);
const avgFps = mean(fpsArr);

console.log(
  `\navg frame_ms=${avgFrameMs.toFixed(3)} ± ${stdevFrameMs.toFixed(3)} (min=${minFrameMs.toFixed(3)} max=${maxFrameMs.toFixed(3)}) · avg fps=${avgFps.toFixed(2)}`,
);

// GPU info (bench-scene-real-gpu.mjs 패턴).
const gpuInfo = await page.evaluate(() => {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) return { renderer: null };
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : null,
    renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null,
  };
});
console.log('GPU:', gpuInfo);

await browser.close();

// 콘솔 에러 (참고만 — bench는 실패 판정 X).
if (consoleErrors.length) {
  console.log(`\n콘솔 에러 ${consoleErrors.length}건 (샘플 5):`);
  consoleErrors.slice(0, 5).forEach((e) => console.log('  ', e));
}

const timestamp = new Date().toISOString();
const outPath = join(outDir, `p7-lens3d-${timestamp.replace(/[:.]/g, '-')}.json`);
const report = {
  timestamp,
  environment: 'chromium headless + webgpu (+ --use-angle=metal)',
  scenario: '/ko?bh=2&ray3d=1',
  gpu: gpuInfo,
  track_b_ray3d_frame_ms: {
    avg_ms: Number(avgFrameMs.toFixed(3)),
    stdev_ms: Number(stdevFrameMs.toFixed(3)),
    min_ms: Number(minFrameMs.toFixed(3)),
    max_ms: Number(maxFrameMs.toFixed(3)),
    avg_fps: Number(avgFps.toFixed(2)),
    sample_count: SAMPLE_COUNT,
    duration_ms_per_sample: SAMPLE_DURATION_MS,
    warmup_ms: WARMUP_MS,
  },
  samples: samples.map((s) => ({
    fps: Number(s.fps.toFixed(2)),
    frame_ms: Number(s.frameMs.toFixed(3)),
    frames: s.frames,
    elapsed_ms: Number(s.elapsedMs.toFixed(1)),
  })),
  console_error_count: consoleErrors.length,
};
writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
console.log(`\n리포트: ${outPath}`);
