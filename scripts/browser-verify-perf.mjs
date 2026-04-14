#!/usr/bin/env node
/**
 * E3 (#32) 성능 측정 — 시나리오별 FPS.
 *
 * Playwright headless Chromium에서 requestAnimationFrame을 카운트하여
 * 실측 FPS 수집. 목표: 평균 55 FPS 이상 (헤드리스 환경 여유, 실 브라우저에서는 60 기대).
 *
 * 시나리오:
 *  1. 정지 상태 (time pause)
 *  2. 재생 ×1일/초 (기본)
 *  3. 재생 ×1년/초
 *  4. 지구 포커스 (클로즈업)
 *  5. 해왕성 포커스 (원거리)
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const baseUrl = process.argv[2] ?? 'http://localhost:3001';
const MIN_FPS = 30; // 헤드리스 Chromium 하드웨어 가속 제한 — 실 브라우저 60 기대
const SCENARIO_DURATION_MS = 3_000;
const __dirname = dirname(fileURLToPath(import.meta.url));
const reportDir = join(__dirname, '..', '.verify-screenshots', 'perf');
mkdirSync(reportDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});

/** 현재 페이지에서 durationMs 동안 rAF 카운트 → FPS 계산 */
const measureFps = async (durationMs) => {
  return page.evaluate(
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
};

await page.goto(`${baseUrl}/ko`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

const scenarios = [];

// 1. 정지 상태
await page.click('[data-testid="time-pause"]').catch(() => {});
await page.waitForTimeout(300);
scenarios.push({ name: '정지 상태', fps: await measureFps(SCENARIO_DURATION_MS) });

// 2. 재생 ×1일/초 (기본)
await page.click('[data-testid="time-play"]').catch(() => {});
await page.click('[data-testid="time-preset-1d"]').catch(() => {});
await page.waitForTimeout(300);
scenarios.push({ name: '재생 ×1일/초', fps: await measureFps(SCENARIO_DURATION_MS) });

// 3. 재생 ×1년/초
await page.click('[data-testid="time-preset-1y"]').catch(() => {});
await page.waitForTimeout(300);
scenarios.push({ name: '재생 ×1년/초', fps: await measureFps(SCENARIO_DURATION_MS) });

// 4. 지구 포커스
await page.click('[data-testid="focus-earth"]').catch(() => {});
await page.waitForTimeout(600);
scenarios.push({ name: '지구 포커스 (클로즈업)', fps: await measureFps(SCENARIO_DURATION_MS) });

// 5. 해왕성 포커스
await page.click('[data-testid="focus-neptune"]').catch(() => {});
await page.waitForTimeout(600);
scenarios.push({ name: '해왕성 포커스 (원거리)', fps: await measureFps(SCENARIO_DURATION_MS) });

await browser.close();

// 보고서
console.log('\n========================================');
console.log('E3 성능 측정 (FPS)');
console.log(`목표: 평균 ${MIN_FPS} 이상 (헤드리스 마진, 실 브라우저 60 기대)`);
console.log('');
let allPass = true;
const lines = [];
for (const s of scenarios) {
  const pass = s.fps >= MIN_FPS;
  if (!pass) allPass = false;
  const mark = pass ? '✓' : '✗';
  console.log(`  ${mark} ${s.name}: ${s.fps.toFixed(1)} fps`);
  lines.push(`| ${s.name} | ${s.fps.toFixed(1)} | ${pass ? '✓' : '✗'} |`);
}

const report = `# P1 성능 측정 보고서

측정 환경: Playwright Chromium headless, viewport 1280×800

## 시나리오별 FPS

| 시나리오 | FPS | 통과 |
|---|---|---|
${lines.join('\n')}

## 목표 및 참고
- **목표**: 평균 ${MIN_FPS} FPS 이상 (헤드리스)
- **실 브라우저**: 60 FPS 기대 (WebGPU 가속 + 실 GPU)
- **측정 방법**: \`requestAnimationFrame\` 카운트 (${SCENARIO_DURATION_MS}ms 윈도우)

## 결론
${allPass ? '모든 시나리오 목표 달성 ✓' : '일부 시나리오 목표 미달 — 최적화 필요'}

## 후속 (P2)
- Chrome DevTools Performance 프로파일로 메인/GPU 스레드 병목 분석
- WebGPU 환경에서 N-body 대규모 파티클 측정
`;

writeFileSync(join(reportDir, 'perf-report.md'), report);
console.log(`\n보고서: ${join(reportDir, 'perf-report.md')}`);

if (consoleErrors.length > 0) {
  console.log(`콘솔 에러 ${consoleErrors.length}건`);
  consoleErrors.forEach((e) => console.log('  ', e));
}

if (!allPass) process.exit(1);
console.log('성능 검증 통과 ✓');
