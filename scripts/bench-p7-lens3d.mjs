#!/usr/bin/env node
/**
 * P7-E #210 E1-b — Track B 3D ray construction 데스크톱 WebGPU 프레임 시간 측정.
 *
 * architect §결정 1: `bench-scene-real-gpu.mjs` 패턴 복제 + ?bh=2&ray3d=1 시나리오 격리.
 *
 * 측정 방법:
 *   - Playwright chromium (WebGPU 플래그)로 ?bh=2&ray3d=1 진입
 *   - **pressTimePlay() 로 scene 재생 시작** (#223 — `?bh=2&ray3d=1` 기본은
 *     자동 재생이라 `time-play` 버튼이 부재하므로 `skipIfAbsent:true` no-op.
 *     paused 상태 회귀 가드 목적)
 *   - **--disable-frame-rate-limit + --disable-gpu-vsync** 로 RAF 상한 해제
 *     (#223 — headless chromium 의 120Hz/60Hz vsync 페그가 stdev ≈ 0 을 만드는
 *     **주 원인**. Metal ANGLE 경로에서도 vsync 우회 필요)
 *   - warmup 2s 후 RAF 카운팅 5s 동안 프레임 수 측정 → frame_ms = 1000/fps
 *   - 10회 샘플 수집 (architect §위험 2 완화 — 표준편차 기록)
 *
 * DoD (#223 재조정 2026-04-19, 사용자 합의):
 *   - 기존: `stdev_ms > 0.5ms` — M1 Pro Metal (~1200fps) 에서 frame_ms 절대값이
 *     0.8ms 수준이라 원천적으로 도달 불가능한 기준이었음
 *   - 신규: `stdev_ratio = stdev / avg > 1%` — vsync 페그 탈출 판정 가능한 기준
 *   - 실측 (2026-04-19, 고정 baseline): **2.61%** — PASS. 이전 페그 상태는 0.012%
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
import { pressTimePlay } from './browser-verify-utils.mjs';

const baseUrl = process.argv[2] ?? 'http://localhost:3001';
const SAMPLE_COUNT = 10;
const SAMPLE_DURATION_MS = 5000;
const WARMUP_MS = 2000;
const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'docs', 'benchmarks');
mkdirSync(outDir, { recursive: true });

// WebGPU + 실 GPU 유도 플래그 — bench-scene-real-gpu.mjs + browser-verify-black-hole-ray3d.mjs 조합.
// #223: --disable-frame-rate-limit + --disable-gpu-vsync 로 RAF 상한 해제 (vsync 페그 회피).
const browser = await chromium.launch({
  headless: true,
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan,WebGPU',
    '--use-gl=angle',
    '--use-angle=metal',
    '--enable-gpu-rasterization',
    '--ignore-gpu-blocklist',
    '--disable-frame-rate-limit',
    '--disable-gpu-vsync',
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

const ray3dFlag = await page.evaluate(() => window.__bhRay3D).catch(() => null);
if (ray3dFlag !== true) {
  console.error(`[FAIL] window.__bhRay3D !== true (실제: ${ray3dFlag}) — bench 중단.`);
  await browser.close();
  process.exit(1);
}

// #223 — 재생 시작 확인. `?bh=2&ray3d=1` 기본 상태는 자동 재생(isPaused=false)이라
// time-play 버튼이 부재 → skipIfAbsent:true 로 no-op. 방어적으로 paused 상태일 때만 토글.
// 실측 vsync 페그(fps=120.04, stdev=0.001)의 주 원인은 재생 여부가 아니라 프레임 레이트
// 상한이므로, 연산 부하를 드러내려면 launch args `--disable-frame-rate-limit` +
// `--disable-gpu-vsync` 가 핵심이다 (이 함수는 회귀 방지 목적).
const played = await pressTimePlay(page, { skipIfAbsent: true });
console.log(`  pressTimePlay: ${played ? 'clicked (was paused)' : 'skipped (already playing)'}`);
await page.waitForTimeout(WARMUP_MS);

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
    // #223 — GPU 속도 독립 분산 지표. vsync 페그 판정(> 1% = OK) 및 fps 격차
    // 환경에서의 회귀 비교 기준. stdev_ms 절대치는 GPU 속도에 반비례해 부적절.
    // avg=0 은 현실적으로 불가(샘플 전원 실패)하지만 NaN/Infinity 회피 방어.
    stdev_ratio: Number((avgFrameMs > 0 ? stdevFrameMs / avgFrameMs : 0).toFixed(4)),
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
