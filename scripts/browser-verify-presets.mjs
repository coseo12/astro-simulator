#!/usr/bin/env node
/**
 * #109 브라우저 3단계 — 프리셋 "만약에" 시나리오.
 * 1. 정적: 연구 모드에서 프리셋 3개 렌더
 * 2. 인터랙션: jupiter-x10 클릭 → Newton 토글 active + 재생 가능
 * 3. 흐름: 원복 → Kepler 복귀
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const baseUrl = process.argv[2] ?? 'http://localhost:3001';
const __dirname = dirname(fileURLToPath(import.meta.url));
const shotDir = join(__dirname, '..', '.verify-screenshots', 'presets');
mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errs = [];
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));

const out = [];
const check = (n, p, d = '') => {
  out.push({ n, p });
  console.log(`  ${p ? '✓' : '✗'} ${n}${d ? ' — ' + d : ''}`);
};

console.log('\n[1/3] 정적');
await page.goto(`${baseUrl}/ko?mode=research`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.locator('[data-testid="scenario-presets"]').waitFor({ timeout: 5000 });
check('프리셋 패널', (await page.locator('[data-testid="scenario-presets"]').count()) === 1);
check(
  'jupiter-x10 프리셋',
  (await page.locator('[data-testid="preset-jupiter-x10"]').count()) === 1,
);
check('no-jupiter 프리셋', (await page.locator('[data-testid="preset-no-jupiter"]').count()) === 1);
check('sun-half 프리셋', (await page.locator('[data-testid="preset-sun-half"]').count()) === 1);
await page.screenshot({ path: join(shotDir, '1-static.png') });

console.log('\n[2/3] 인터랙션 — jupiter-x10 적용');
await page.click('[data-testid="preset-jupiter-x10"]');
await page.waitForTimeout(1000);
const newtonActive = await page.getAttribute('[data-testid="engine-newton"]', 'data-active');
check('Newton 엔진 자동 전환', newtonActive === 'true');
const before = errs.length;
await page.click('[data-testid="time-play"]').catch(() => {});
await page.waitForTimeout(2000);
check('재생 중 콘솔 에러 없음', errs.length === before);
await page.screenshot({ path: join(shotDir, '2-jupiter-x10.png') });

console.log('\n[3/3] 흐름 — 원복');
await page.click('[data-testid="scenario-reset"]');
await page.waitForTimeout(800);
const keplerActive = await page.getAttribute('[data-testid="engine-kepler"]', 'data-active');
check('Kepler 엔진 복귀', keplerActive === 'true');
await page.screenshot({ path: join(shotDir, '3-reset.png') });

await browser.close();
const pass = out.filter((r) => r.p).length;
console.log(`\n결과: ${pass}/${out.length} PASS`);
if (errs.length) errs.slice(0, 5).forEach((e) => console.log(' ', e));
if (pass < out.length) process.exit(1);
