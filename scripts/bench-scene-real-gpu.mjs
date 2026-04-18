#!/usr/bin/env node
/**
 * #116 실 GPU 성능 측정 — 헤드리스 기본값이 swiftshader(소프트웨어 렌더)라서
 * 실제 GPU 경로를 타려면 flag 지정이 필요. macOS Metal/ANGLE 기반 가속을 시도한다.
 *
 * 한계: 환경(macOS/Linux/Chrome 버전)에 따라 결과 편차가 크다. 참고용.
 * 수동 브라우저에서 DevTools Performance로 확인하는 것이 여전히 정답.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pressTimePlay } from './browser-verify-utils.mjs';

const baseUrl = process.argv[2] ?? 'http://localhost:3001';
const DURATION_MS = 5000;
const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'docs', 'benchmarks');
mkdirSync(outDir, { recursive: true });

// Chromium GPU 활성 플래그 — 환경별 동작 편차 있음
const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-gl=angle',
    '--use-angle=metal',
    '--enable-gpu-rasterization',
    '--ignore-gpu-blocklist',
    '--enable-features=Vulkan',
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

const rows = [];
// P3-0(#125) — N=5000/10000 추가. ThinInstances 10k cap은 sim-canvas와 일치.
for (const path of ['/ko', '/ko?belt=200', '/ko?belt=1000', '/ko?belt=5000', '/ko?belt=10000']) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  // P7-E #210 — silent-fail 방지.
  await pressTimePlay(page, { skipIfAbsent: true });
  await page.waitForTimeout(500);
  const fps = await measureFps(DURATION_MS);
  rows.push({ path, fps: Number(fps.toFixed(2)) });
  console.log(`${path}: ${fps.toFixed(2)} fps`);
}

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

const report = {
  timestamp: new Date().toISOString(),
  env: 'chromium --use-angle=metal + rasterization',
  gpu: gpuInfo,
  scenarios: rows,
};
const outPath = join(outDir, 'p2d-real-gpu.json');
writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
console.log(`리포트: ${outPath}`);
