#!/usr/bin/env node
/**
 * P7-D #209 — 모바일 A/B 교차 측정 bench.
 *
 * 목적: Yoshida4 적분기 도입 후 모바일(emulation)에서 VV 대비 성능 회귀를 감지한다.
 *
 * 측정 전략 (Gemini 피드백 반영):
 *   - 정적 baseline 박제 대신 **동일 세션 내 VV → Yoshida4 순차 교차 측정**.
 *   - 이유: headless Chromium은 호스트 CPU 편차로 정적 baseline이 flaky.
 *     같은 세션/같은 context 내 상대 차이는 환경 노이즈를 상쇄한다.
 *   - DoD: `yoshida_fps / vv_fps >= 0.90` (모바일 환경 10% 이내 회귀).
 *
 * 한계: Chromium emulation은 실제 iOS GPU 특성(타일 렌더/메모리 대역폭)을 재현하지
 *       못한다. 본 수치는 **구조 게이트**로만 사용하고, 절대 성능은 실기기 리포트로 갱신.
 *
 * 사용:
 *   node scripts/bench-scene-mobile.mjs [baseUrl]
 *   BENCH_SAMPLE_MS=10000 node scripts/bench-scene-mobile.mjs
 */
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const baseUrl = process.argv[2] ?? 'http://localhost:3001';
const SAMPLE_MS = Number(process.env.BENCH_SAMPLE_MS ?? 10_000);
const RATIO_THRESHOLD = Number(process.env.BENCH_RATIO_THRESHOLD ?? 0.9);
const __dirname = dirname(fileURLToPath(import.meta.url));
const reportsDir = join(__dirname, '..', 'docs', 'reports');
mkdirSync(reportsDir, { recursive: true });

const deviceProfile = devices['iPhone 14'];
const browser = await chromium.launch({
  headless: true,
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan',
    '--use-angle=metal',
    '--disable-gpu-vsync',
    '--disable-frame-rate-limit',
  ],
});

// 동일 세션/동일 context에서 두 URL 순차 측정 — 환경 노이즈 상쇄.
const ctx = await browser.newContext({ ...deviceProfile });
const page = await ctx.newPage();

const measureFps = (durationMs) =>
  page.evaluate(
    (d) =>
      new Promise((resolve) => {
        let count = 0;
        const start = performance.now();
        const loop = () => {
          count += 1;
          if (performance.now() - start < d) requestAnimationFrame(loop);
          else resolve((count * 1000) / (performance.now() - start));
        };
        requestAnimationFrame(loop);
      }),
    durationMs,
  );

async function sampleIntegrator(kind) {
  // 각 샘플은 페이지 재로드로 진행 (동일 context — CPU/GPU 캐시 특성 유지).
  await page.goto(`${baseUrl}/ko?integrator=${kind}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.click('[data-testid="time-play"]').catch(() => {});
  await page.click('[data-testid="time-preset-1y"]').catch(() => {});
  await page.waitForTimeout(500);
  return measureFps(SAMPLE_MS);
}

console.log(`\n[1/2] VV 샘플 측정 (${SAMPLE_MS}ms) — iPhone 14 emulation`);
const vvFps = await sampleIntegrator('velocity-verlet');
console.log(`  VV fps = ${vvFps.toFixed(2)}`);

console.log(`\n[2/2] Yoshida4 샘플 측정 (${SAMPLE_MS}ms) — 동일 context`);
const yoshidaFps = await sampleIntegrator('yoshida4');
console.log(`  Yoshida4 fps = ${yoshidaFps.toFixed(2)}`);

await browser.close();

const ratio = vvFps > 0 ? yoshidaFps / vvFps : 0;
const pass = ratio >= RATIO_THRESHOLD;
const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const reportPath = join(reportsDir, `p7d-mobile-${today}.json`);
const report = {
  timestamp: new Date().toISOString(),
  phase: 'p7-d',
  environment: 'playwright-chromium-headless + iPhone 14 emulation',
  sampleMs: SAMPLE_MS,
  threshold: RATIO_THRESHOLD,
  measurements: {
    velocityVerlet: Number(vvFps.toFixed(2)),
    yoshida4: Number(yoshidaFps.toFixed(2)),
    ratio: Number(ratio.toFixed(4)),
  },
  verdict: pass ? 'PASS' : 'FAIL',
};
writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

console.log('\n========================================');
console.log(`A/B 교차 측정 (iPhone 14 emulation, 동일 session)`);
console.log(`  VV        : ${vvFps.toFixed(2)} fps`);
console.log(`  Yoshida4  : ${yoshidaFps.toFixed(2)} fps`);
console.log(`  ratio     : ${ratio.toFixed(3)} (threshold ${RATIO_THRESHOLD})`);
console.log(`  verdict   : ${report.verdict}`);
console.log(`  report    : ${reportPath}`);

if (!pass) {
  console.log(`\n⚠ ratio ${ratio.toFixed(3)} < ${RATIO_THRESHOLD} — Yoshida4 모바일 회귀 감지.`);
  console.log('  대응: 3회 재측정 중앙값 확인 또는 기기별 fallback 규칙 검토.');
  process.exit(1);
}
console.log('\n✓ Yoshida4 모바일 회귀 허용 범위 내 (A/B 비율 ≥ 0.90)');
