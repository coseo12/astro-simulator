#!/usr/bin/env node
/**
 * bench:scene — P2 성능 회귀 감지용 자동 벤치.
 *
 * 배경
 * ----
 * P2에서 Newton N-body 전환 시 성능 회귀 위험이 크다. PR마다 시나리오별 FPS를
 * JSON으로 기록해두고 baseline과 diff를 표기한다. P1 E3(browser-verify-perf)는
 * PASS/FAIL 게이트 용도, bench:scene은 시계열 수치 아카이브 용도.
 *
 * 현재 지원
 * --------
 * - 시나리오별 FPS (정지/재생/포커스) — browser-verify-perf 시나리오 재사용
 * - JSON 리포트 docs/benchmarks/{timestamp}.json 저장
 * - docs/benchmarks/baseline.json 대비 diff 콘솔 출력
 *
 * P2-A 이후 확장 예정
 * -----------------
 * - N = [10, 100, 200, 1000] 소천체 개수 파라미터화 (씬에 N-body 주입 후)
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const baseUrl = process.argv[2] ?? 'http://localhost:3001';
const SCENARIO_DURATION_MS = 3_000;
const __dirname = dirname(fileURLToPath(import.meta.url));
const benchDir = join(__dirname, '..', 'docs', 'benchmarks');
mkdirSync(benchDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

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

await page.goto(`${baseUrl}/ko`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

const steps = [
  { name: 'idle', prep: async () => page.click('[data-testid="time-pause"]').catch(() => {}) },
  {
    name: 'play-1d',
    prep: async () => {
      await page.click('[data-testid="time-play"]').catch(() => {});
      await page.click('[data-testid="time-preset-1d"]').catch(() => {});
    },
  },
  { name: 'play-1y', prep: () => page.click('[data-testid="time-preset-1y"]').catch(() => {}) },
  { name: 'focus-earth', prep: () => page.click('[data-testid="focus-earth"]').catch(() => {}) },
  {
    name: 'focus-neptune',
    prep: () => page.click('[data-testid="focus-neptune"]').catch(() => {}),
  },
];

const scenarios = [];
for (const s of steps) {
  await s.prep();
  await page.waitForTimeout(500);
  const fps = await measureFps(SCENARIO_DURATION_MS);
  scenarios.push({ name: s.name, fps: Number(fps.toFixed(2)) });
}

await browser.close();

const timestamp = new Date().toISOString();
const report = {
  timestamp,
  phase: process.env.BENCH_PHASE ?? 'unlabeled',
  durationMs: SCENARIO_DURATION_MS,
  environment: 'playwright-chromium-headless',
  viewport: '1280x800',
  scenarios,
  // P2-A 이후: nBody: [{ n: 10, fps: ... }, ...]
};

const slug = timestamp.replace(/[:.]/g, '-');
const outPath = join(benchDir, `${slug}.json`);
writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');

// baseline diff
const baselinePath = join(benchDir, 'baseline.json');
let diffLines = [];
if (existsSync(baselinePath)) {
  const base = JSON.parse(readFileSync(baselinePath, 'utf8'));
  const byName = new Map(base.scenarios.map((s) => [s.name, s.fps]));
  for (const s of scenarios) {
    const b = byName.get(s.name);
    if (b == null) {
      diffLines.push(`  ${s.name}: ${s.fps} fps (신규)`);
    } else {
      const delta = s.fps - b;
      const pct = ((delta / b) * 100).toFixed(1);
      const mark = delta >= -2 ? '✓' : '⚠';
      diffLines.push(
        `  ${mark} ${s.name}: ${s.fps} fps (baseline ${b} → Δ ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}, ${pct}%)`,
      );
    }
  }
} else {
  diffLines.push(
    '  (baseline.json 없음 — 이 리포트를 baseline으로 복사하려면: `pnpm bench:scene:set-baseline`)',
  );
}

console.log('\n========================================');
console.log(`bench:scene — ${timestamp}`);
console.log(`리포트: ${outPath}`);
console.log('----------------------------------------');
for (const s of scenarios) console.log(`  ${s.name}: ${s.fps} fps`);
console.log('----------------------------------------');
console.log('baseline diff:');
diffLines.forEach((l) => console.log(l));
