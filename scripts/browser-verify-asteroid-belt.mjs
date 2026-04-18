#!/usr/bin/env node
/**
 * #99 브라우저 3단계 검증 — 소행성대 (?belt=N).
 * 1. 정적: 캔버스 + ?belt=300 진입 시 콘솔 에러 0
 * 2. 인터랙션: 시간 재생 중 thinInstance 갱신 에러 없음
 * 3. 흐름: ?belt=1000 (대규모) 부하 진입 후도 로드 성공
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pressTimePlay } from './browser-verify-utils.mjs';

const baseUrl = process.argv[2] ?? 'http://localhost:3001';
const __dirname = dirname(fileURLToPath(import.meta.url));
const shotDir = join(__dirname, '..', '.verify-screenshots', 'asteroid-belt');
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

console.log('\n[1/3] 정적 — ?belt=300');
await page.goto(`${baseUrl}/ko?belt=300`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
check('캔버스 렌더', (await page.locator('[data-testid="sim-canvas"]').count()) === 1);
check('?belt=300 콘솔 에러 0', errs.length === 0);
await page.screenshot({ path: join(shotDir, '1-belt-300.png') });

console.log('\n[2/3] 인터랙션 — 시간 재생 (소행성 위치 갱신)');
const before = errs.length;
// P7-E #210 — silent-fail 방지.
await pressTimePlay(page, { skipIfAbsent: true });
await page.waitForTimeout(2000);
const newErrs = errs.length - before;
check('재생 중 추가 에러 없음', newErrs === 0);
await page.screenshot({ path: join(shotDir, '2-belt-300-playing.png') });

console.log('\n[3/3] 흐름 — ?belt=1000 부하');
const beforeBig = errs.length;
await page.goto(`${baseUrl}/ko?belt=1000`, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
const newBigErrs = errs.length - beforeBig;
check('?belt=1000 진입 에러 없음', newBigErrs === 0);
await page.screenshot({ path: join(shotDir, '3-belt-1000.png') });

await browser.close();
const pass = out.filter((r) => r.p).length;
console.log(`\n결과: ${pass}/${out.length} PASS`);
if (errs.length) errs.slice(0, 5).forEach((e) => console.log(' ', e));
if (pass < out.length) process.exit(1);
