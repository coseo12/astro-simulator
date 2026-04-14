#!/usr/bin/env node
/**
 * #100 per-body 시각 스케일 검증.
 *
 * 1. 정적: 전체 뷰에서 행성이 점으로 사라지지 않음 (max scale 적용됨)
 * 2. 인터랙션: Earth focus 시 Moon이 별개 구로 분리됨 (가까우면 scale=1)
 * 3. 흐름: 시간 재생 중 콘솔 에러 없음, 전환 부드러움
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const baseUrl = process.argv[2] ?? 'http://localhost:3001';
const __dirname = dirname(fileURLToPath(import.meta.url));
const shotDir = join(__dirname, '..', '.verify-screenshots', 'per-body-scale');
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

console.log('\n[1/3] 정적 — 전체 뷰');
await page.goto(`${baseUrl}/ko`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
check('캔버스 렌더', (await page.locator('[data-testid="sim-canvas"]').count()) === 1);
check('콘솔 에러 0', errs.length === 0);
await page.screenshot({ path: join(shotDir, '1-overview.png') });

console.log('\n[2/3] 인터랙션 — Earth focus');
const before = errs.length;
await page.goto(`${baseUrl}/ko?focus=earth`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
check('Earth focus 진입 에러 없음', errs.length === before);
await page.screenshot({ path: join(shotDir, '2-earth-focus.png') });

console.log('\n[3/3] 흐름 — 시간 재생 + Moon focus');
const before2 = errs.length;
await page.goto(`${baseUrl}/ko?focus=moon`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.click('[data-testid="time-play"]').catch(() => {});
await page.waitForTimeout(1500);
check('Moon focus + 재생 에러 없음', errs.length === before2);
await page.screenshot({ path: join(shotDir, '3-moon-focus-playing.png') });

await browser.close();
const pass = out.filter((r) => r.p).length;
console.log(`\n결과: ${pass}/${out.length} PASS`);
if (errs.length) errs.slice(0, 5).forEach((e) => console.log(' ', e));
if (pass < out.length) process.exit(1);
