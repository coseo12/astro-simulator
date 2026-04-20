#!/usr/bin/env node
/**
 * P9 #254 PR-2.5 QA — 독립 실 Chromium 검증 (headful, hardware-accel).
 *
 * reviewer 가 이미 6장 박제한 `capture-ring-shader-headful.mjs` 와 분리된
 * QA 독립 실측으로 `screenshots/p9-pr25-qa/` 에 3 시나리오 박제:
 *   S1: ?focus=jupiter (기본 shader) — 3 band 가시성
 *   S2: ?ring=fallback                — M1 InstancedMesh 경로
 *   S3: ?ring=placeholder              — PR-1 단색 placeholder 회귀 가드
 *
 * 추가 측정:
 *   - fps: Babylon engine.getFps() 10초 평균 (S1 에서만)
 *   - 콘솔 에러/pageerror 카운팅
 *
 * 사용: node scripts/qa-ring-shader-headful.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const baseUrl = process.argv[2] ?? 'http://localhost:3099';
const __dirname = dirname(fileURLToPath(import.meta.url));
const screenshotDir = join(__dirname, '..', 'screenshots', 'p9-pr25-qa');
mkdirSync(screenshotDir, { recursive: true });

const browser = await chromium.launch({
  headless: false,
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

/** 시나리오별 콘솔/pageerror 누적 */
const results = {
  S1: { console: [], pageerr: [] },
  S2: { console: [], pageerr: [] },
  S3: { console: [], pageerr: [] },
};
let current = 'S1';
page.on('console', (msg) => {
  if (msg.type() === 'error') results[current].console.push(msg.text());
});
page.on('pageerror', (err) => results[current].pageerr.push(err.message));
// 404 등 리소스 실패는 request.failure 로 URL 포함 로깅
page.on('requestfailed', (req) => {
  results[current].console.push(`[requestfailed] ${req.url()} — ${req.failure()?.errorText}`);
});
page.on('response', (resp) => {
  if (resp.status() >= 400) {
    results[current].console.push(`[response ${resp.status()}] ${resp.url()}`);
  }
});

/** 고리 주밍 공통 유틸 — 카메라 회전까지 포함해 3 band 측면 가시성 확보 */
async function focusAndZoom(page, { rotate = true } = {}) {
  const focusBtn = await page.$('[data-testid="focus-jupiter"]');
  if (focusBtn) {
    await focusBtn.click();
    await page.waitForTimeout(2500);
    const canvas = await page.$('canvas');
    const box = canvas ? await canvas.boundingBox() : null;
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      for (let i = 0; i < 50; i++) {
        await page.mouse.wheel(0, -100);
        if (i % 10 === 0) await page.waitForTimeout(100);
      }
      await page.waitForTimeout(1500);
      if (rotate) {
        // 카메라 수직 회전 — 고리 평면을 기울여 측면 관측 (reviewer S2 동일)
        await page.mouse.move(cx, cy);
        await page.mouse.down();
        await page.mouse.move(cx + 80, cy - 200, { steps: 30 });
        await page.mouse.up();
        await page.waitForTimeout(1500);
      }
    }
  }
}

// ─── S1: shader 기본 경로 + fps 측정 ───────────────────────────────────────
current = 'S1';
console.log('[S1] ?focus=jupiter (shader 기본)');
await page.goto(`${baseUrl}/ko`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await focusAndZoom(page);

// fps 측정 먼저 — screenshot 뒤로 밀면 headful 환경에서 page 컨텍스트가 불안정
const fpsResult = await page.evaluate(async () => {
  const core = /** @type {any} */ (window).__simCore;
  const engine = core?.engine;
  if (!engine || typeof engine.getFps !== 'function') {
    return { err: 'engine not found on window.__simCore' };
  }
  const samples = [];
  const start = performance.now();
  while (performance.now() - start < 10000) {
    samples.push(engine.getFps());
    await new Promise((r) => setTimeout(r, 200));
  }
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  return { samples: samples.length, avg, min, max };
});
console.log('  fps:', JSON.stringify(fpsResult));

await page.screenshot({ path: join(screenshotDir, 's1-shader-default.png'), fullPage: false });
console.log('  saved: s1-shader-default.png');

// ─── S2: fallback 경로 ─────────────────────────────────────────────────────
current = 'S2';
console.log('[S2] ?ring=fallback (M1 InstancedMesh)');
await page.goto(`${baseUrl}/ko?ring=fallback`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await focusAndZoom(page);
await page.screenshot({ path: join(screenshotDir, 's2-ring-fallback.png'), fullPage: false });
console.log('  saved: s2-ring-fallback.png');

// ─── S3: placeholder 경로 (회귀 가드) ─────────────────────────────────────
current = 'S3';
console.log('[S3] ?ring=placeholder (PR-1 단색 복귀)');
await page.goto(`${baseUrl}/ko?ring=placeholder`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await focusAndZoom(page);
await page.screenshot({ path: join(screenshotDir, 's3-ring-placeholder.png'), fullPage: false });
console.log('  saved: s3-ring-placeholder.png');

await browser.close();

// ─── 결과 요약 출력 ─────────────────────────────────────────────────────
console.log('\n===== QA 요약 =====');
for (const [k, v] of Object.entries(results)) {
  console.log(`${k}: console=${v.console.length}건, pageerror=${v.pageerr.length}건`);
  v.console.forEach((m) => console.log(`   [console] ${m}`));
  v.pageerr.forEach((m) => console.log(`   [pageerr] ${m}`));
}
console.log('fps:', JSON.stringify(fpsResult));
console.log('screenshots:', screenshotDir);

// exit — fps avg<55 또는 에러>0 시 비정상 종료 (exit code 1)
const totalErrors = Object.values(results).reduce(
  (a, r) => a + r.console.length + r.pageerr.length,
  0,
);
const fpsOk = fpsResult.avg !== undefined && fpsResult.avg >= 55;
if (totalErrors > 0 || !fpsOk) {
  console.log(`FAIL — errors=${totalErrors}, fps_ok=${fpsOk}`);
  process.exit(1);
}
console.log('PASS — 3 시나리오 + fps 60 유지');
