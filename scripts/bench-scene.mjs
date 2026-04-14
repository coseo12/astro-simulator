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
 * N-sweep 모드
 * ------------
 * `BENCH_N_SWEEP=10,100,200,1000` 설정 시 각 N마다 `/ko?belt=N`을 재방문해
 * play-1y 시나리오 fps를 측정하고 리포트에 `nBody: [{ n, fps }]`로 기록한다.
 * 시간이 길어지므로 시나리오 측정과 병행 실행된다.
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

// 경로 쿼리는 BENCH_PATH 환경변수로 추가 가능 (예: /ko?belt=200)
const path = process.env.BENCH_PATH ?? '/ko';
await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
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

// N-sweep: 소행성대 개수별 fps 측정 (play-1y 시나리오 기준)
const nBody = [];
const sweepEnv = process.env.BENCH_N_SWEEP;
if (sweepEnv) {
  const ns = sweepEnv
    .split(',')
    .map((x) => Number.parseInt(x.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  for (const n of ns) {
    await page.goto(`${baseUrl}${path.split('?')[0]}?belt=${n}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.click('[data-testid="time-play"]').catch(() => {});
    await page.click('[data-testid="time-preset-1y"]').catch(() => {});
    await page.waitForTimeout(500);
    const fps = await measureFps(SCENARIO_DURATION_MS);
    nBody.push({ n, fps: Number(fps.toFixed(2)) });
  }
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
  ...(nBody.length > 0 && { nBody }),
};

const slug = timestamp.replace(/[:.]/g, '-');
const outPath = join(benchDir, `${slug}.json`);
writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');

// baseline diff — CI 환경 변동성 고려해 임계값은 환경변수로 조정 (기본 -2 fps)
const regressionThreshold = Number.parseFloat(process.env.BENCH_REGRESSION_FPS ?? '-2');
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
      const mark = delta >= regressionThreshold ? '✓' : '⚠';
      diffLines.push(
        `  ${mark} ${s.name}: ${s.fps} fps (baseline ${b} → Δ ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}, ${pct}%)`,
      );
    }
  }
  if (nBody.length > 0) {
    const baseN = new Map((base.nBody ?? []).map((x) => [x.n, x.fps]));
    diffLines.push('  --- N-sweep ---');
    for (const x of nBody) {
      const b = baseN.get(x.n);
      if (b == null) diffLines.push(`  N=${x.n}: ${x.fps} fps (신규)`);
      else {
        const delta = x.fps - b;
        const mark = delta >= regressionThreshold ? '✓' : '⚠';
        diffLines.push(
          `  ${mark} N=${x.n}: ${x.fps} fps (baseline ${b} → Δ ${delta >= 0 ? '+' : ''}${delta.toFixed(2)})`,
        );
      }
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
for (const x of nBody) console.log(`  N=${x.n}: ${x.fps} fps`);
console.log('----------------------------------------');
console.log('baseline diff:');
diffLines.forEach((l) => console.log(l));

// CI 연동: Markdown 요약을 BENCH_SUMMARY_OUT 경로에 기록 (PR 코멘트용)
if (process.env.BENCH_SUMMARY_OUT) {
  const md = [
    '### bench:scene 리포트',
    `- timestamp: \`${timestamp}\``,
    `- phase: \`${report.phase}\``,
    '',
    '#### 시나리오 (fps)',
    '| scenario | fps |',
    '| --- | --- |',
    ...scenarios.map((s) => `| ${s.name} | ${s.fps} |`),
    ...(nBody.length > 0
      ? [
          '',
          '#### N-sweep (play-1y, fps)',
          '| N | fps |',
          '| --- | --- |',
          ...nBody.map((x) => `| ${x.n} | ${x.fps} |`),
        ]
      : []),
    '',
    '#### baseline diff',
    '```',
    ...diffLines,
    '```',
  ].join('\n');
  writeFileSync(process.env.BENCH_SUMMARY_OUT, md + '\n');
}
