#!/usr/bin/env node
/**
 * #98 브라우저 3단계 검증 — 혜성 3개 (Halley/Encke/Swift-Tuttle).
 *
 * 고이심률(e≥0.848) 궤도선이 LineSystem 64세그먼트로 끊김 없이 그려지는지.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const baseUrl = process.argv[2] ?? 'http://localhost:3001';
const __dirname = dirname(fileURLToPath(import.meta.url));
const shotDir = join(__dirname, '..', '.verify-screenshots', 'comets');
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
await page.goto(`${baseUrl}/ko`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
check('캔버스 렌더', (await page.locator('[data-testid="sim-canvas"]').count()) === 1);
check('콘솔 에러 0', errs.length === 0);
await page.screenshot({ path: join(shotDir, '1-static.png') });

console.log('\n[2/3] 인터랙션 — 시간 재생');
await page.click('[data-testid="time-play"]').catch(() => {});
await page.waitForTimeout(1500);
check('재생 중 에러 없음', errs.length === 0);
await page.screenshot({ path: join(shotDir, '2-playing.png') });

console.log('\n[3/3] 흐름 — 혜성 focus URL');
for (const id of ['halley', 'encke', 'swift-tuttle']) {
  const before = errs.length;
  await page.goto(`${baseUrl}/ko?focus=${id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const newErrs = errs.slice(before);
  const bad = newErrs.some((e) => new RegExp(id, 'i').test(e) || /undefined|null/.test(e));
  check(`?focus=${id} 진입 에러 없음`, !bad);
  await page.screenshot({ path: join(shotDir, `3-${id}-focus.png`) });
}

await browser.close();
const pass = out.filter((r) => r.p).length;
console.log(`\n결과: ${pass}/${out.length} PASS`);
if (errs.length) errs.slice(0, 5).forEach((e) => console.log(' ', e));
if (pass < out.length) process.exit(1);
