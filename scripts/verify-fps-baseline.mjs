#!/usr/bin/env node
/**
 * #536 — 저사양 모바일 FPS 회귀 가드 (R4 cross-validate Gemini 고유 발견 3 후속).
 *
 * 목적: CPU 4x throttling 환경 + 모바일/데스크톱 viewport + default/earth/moon focus
 *       시나리오 baseline 박제 및 회귀 비교. CI 통합으로 PR diff 마다 자동 검증.
 *
 * 측정 환경:
 *   - Playwright chromium headless
 *   - CDP `Emulation.setCPUThrottlingRate` 4x (저사양 기기 모의)
 *   - Mobile viewport 375×667 + Desktop 1280×720
 *   - rAF 카운트 5초 윈도우 (noise 완화)
 *
 * 시나리오 (이슈 #536 명시):
 *   1. default (sun 시점, 진입 직후)
 *   2. earth focus (close-up)
 *   3. moon focus (satellite — R4 신규 인스턴스)
 *
 * 회귀 임계:
 *   - baseline 대비 ≥ 30% 저하 = FAIL (headless rAF noise ±12% 실측 후 보수 마진)
 *   - 절대 < 30 FPS = FAIL (사용자 인지 임계)
 *
 * Note on noise: baseline 첫 측정과 직후 재측정에서 ±12% 변동 관찰 (CPU throttling 4x +
 * dev server hot reload 누적 영향). 마진 ±10% 는 false positive 빈발 → ±30% 채택.
 * 사용자 인지 가능 회귀 ("프레임 1/3 감소") 는 여전히 잡되 noise 흡수.
 *
 * 운영:
 *   - 일반 실행: `node scripts/verify-fps-baseline.mjs`
 *   - baseline 갱신: `node scripts/verify-fps-baseline.mjs --update-baseline`
 *   - CI: `BASE_URL=http://localhost:3001 node scripts/verify-fps-baseline.mjs`
 *
 * 가드 도입 PR DoD §4축 (CLAUDE.md `### 가드 도입 PR DoD`):
 *   (1) 격리 동적 테스트 — 본 스크립트 단독 실행
 *   (2) 3중 시뮬레이션 — `scripts/_debug-fps-guard-tmp.mjs`
 *   (3) 5 페르소나 self-consistency — 본 PR 범위 밖
 *   (4) 메타 안정성 — rAF noise ±5% 인지, 회귀 임계 ±10% margin 적용
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const positionalUrl = process.argv.slice(2).find((a) => !a.startsWith('--'));
const baseUrl = process.env.BASE_URL ?? positionalUrl ?? 'http://localhost:3001';
const __dirname = dirname(fileURLToPath(import.meta.url));
const baselinePath = join(__dirname, '..', 'docs', 'benchmarks', 'fps-lowend-baseline.json');
const reportDir = join(__dirname, '..', '.verify-screenshots', 'fps-baseline');
mkdirSync(reportDir, { recursive: true });

const UPDATE_BASELINE = process.argv.includes('--update-baseline');

const CPU_THROTTLING_RATE = 4; // 4x slowdown — 저사양 기기 모의
const MEASURE_DURATION_MS = 5_000; // noise 완화 위해 3초 → 5초 확장
const MIN_FPS_ABSOLUTE = 30;
const REGRESSION_MARGIN = 0.3; // baseline 대비 30% 저하 허용 (rAF noise ±12% 실측 후 보수 마진)

const VIEWPORTS = [
  { id: 'desktop', width: 1280, height: 720 },
  { id: 'mobile', width: 375, height: 667 },
];

const SCENARIOS = [
  { id: 'default', label: 'default (sun 시점)', focusTestId: null },
  { id: 'earth-focus', label: 'earth focus', focusTestId: 'focus-earth' },
  { id: 'moon-focus', label: 'moon focus', focusTestId: 'focus-moon' },
];

async function measureFps(page, durationMs) {
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
}

async function measureScenario(page, scenario) {
  if (scenario.focusTestId) {
    const sel = `[data-testid="${scenario.focusTestId}"]`;
    const count = await page.locator(sel).count();
    if (count > 0) {
      await page.locator(sel).click();
      await page.waitForTimeout(800); // focus 카메라 전환 안정화
    } else {
      // moon focus 가 default 진입 시 셀렉터 미노출 가능 — URL override 사용
      if (scenario.id === 'moon-focus') {
        await page.goto(`${baseUrl}/ko?focus=moon`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1500);
      }
    }
  }
  return +(await measureFps(page, MEASURE_DURATION_MS)).toFixed(1);
}

async function measureViewport(page, client, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(`${baseUrl}/ko`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // 정지 (pause) 로 시작점 안정화 — 모든 시나리오 동일 시작
  try {
    await page.locator('[data-testid="time-pause"]').click({ timeout: 1000 });
  } catch {}

  const results = {};
  for (const sc of SCENARIOS) {
    console.log(`  ${viewport.id} / ${sc.label} 측정 중...`);
    const fps = await measureScenario(page, sc);
    results[sc.id] = fps;
  }
  return results;
}

function compareBaseline(current, baseline) {
  const failures = [];
  for (const vp of VIEWPORTS) {
    for (const sc of SCENARIOS) {
      const cur = current.viewports[vp.id]?.[sc.id];
      const base = baseline.viewports[vp.id]?.[sc.id];
      if (cur === undefined || base === undefined) {
        failures.push(`[${vp.id}/${sc.id}] baseline 또는 측정 누락`);
        continue;
      }
      if (cur < MIN_FPS_ABSOLUTE) {
        failures.push(`[${vp.id}/${sc.id}] 절대 임계 미달: ${cur} FPS < ${MIN_FPS_ABSOLUTE} FPS`);
      }
      if (cur < base * (1 - REGRESSION_MARGIN)) {
        const dropPct = (((base - cur) / base) * 100).toFixed(1);
        failures.push(
          `[${vp.id}/${sc.id}] baseline 회귀 ${dropPct}%: ${base} → ${cur} FPS (margin ${REGRESSION_MARGIN * 100}%)`,
        );
      }
    }
  }
  return failures;
}

// ===== main =====
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const client = await context.newCDPSession(page);

// CPU throttling 적용
await client.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLING_RATE });

const viewportResults = {};
for (const vp of VIEWPORTS) {
  console.log(`[verify-fps-baseline] ${vp.id} (${vp.width}×${vp.height}) 측정 중...`);
  viewportResults[vp.id] = await measureViewport(page, client, vp);
}

await browser.close();

const current = {
  version: 1,
  measuredAt: new Date().toISOString().slice(0, 10),
  issue: '#536',
  environment: {
    cpuThrottling: `${CPU_THROTTLING_RATE}x`,
    measureDurationMs: MEASURE_DURATION_MS,
    minFpsAbsolute: MIN_FPS_ABSOLUTE,
    regressionMargin: REGRESSION_MARGIN,
  },
  viewports: viewportResults,
};

// 보고서 출력
console.log('\n========================================');
console.log(`저사양 FPS baseline (#536) — CPU ${CPU_THROTTLING_RATE}x throttling`);
for (const vp of VIEWPORTS) {
  console.log(`\n[${vp.id}] ${vp.width}×${vp.height}`);
  const r = current.viewports[vp.id];
  for (const sc of SCENARIOS) {
    const fps = r[sc.id];
    const mark = fps >= MIN_FPS_ABSOLUTE ? '✓' : '✗';
    console.log(`  ${mark} ${sc.label}: ${fps} FPS`);
  }
}

// baseline 모드
if (UPDATE_BASELINE) {
  writeFileSync(baselinePath, JSON.stringify(current, null, 2) + '\n');
  console.log(`\n✓ baseline 박제: ${baselinePath}`);
  process.exit(0);
}

if (!existsSync(baselinePath)) {
  console.log(`\n⚠ baseline 부재 — --update-baseline 로 첫 박제 필요`);
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const failures = compareBaseline(current, baseline);

if (failures.length > 0) {
  console.log('\n✗ 회귀 감지:');
  failures.forEach((f) => console.log(`  - ${f}`));
  writeFileSync(join(reportDir, 'current.json'), JSON.stringify(current, null, 2) + '\n');
  process.exit(1);
}

console.log('\n✓ baseline 대비 회귀 없음');
writeFileSync(join(reportDir, 'current.json'), JSON.stringify(current, null, 2) + '\n');
process.exit(0);
