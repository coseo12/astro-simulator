#!/usr/bin/env node
/**
 * P7-B #207 브라우저 3단계 검증 — ?integrator= URL 옵트인.
 *
 * 선례: scripts/browser-verify-engine-toggle.mjs (Playwright chromium 모듈 재사용,
 * 테스트 러너 도입 없음).
 *
 * 1. 정적:  ?integrator=yoshida4 진입 시 HUD 배지 + window.__simIntegrator 확인
 * 2. URL 전환: ?integrator=velocity-verlet 재진입 시 배지 텍스트 전환
 * 3. 흐름:   ?gr=eih&integrator=yoshida4 조합 재생 5초 — NaN/WASM 콘솔 에러 0건
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const baseUrl = process.argv[2] ?? 'http://localhost:3001';
const __dirname = dirname(fileURLToPath(import.meta.url));
const shotDir = join(__dirname, '..', '.verify-screenshots', 'integrator');
mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  const mark = pass ? '✓' : '✗';
  console.log(`  ${mark} ${name}${detail ? ' — ' + detail : ''}`);
};

// ---- 1. 정적 ----
console.log('\n[1/3] 정적 — ?integrator=yoshida4 진입');
await page.goto(`${baseUrl}/ko?integrator=yoshida4`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const badge = page.locator('[data-testid="integrator-badge"]');
check('integrator-badge 렌더', (await badge.count()) === 1);
const badgeText = (await badge.textContent()) ?? '';
check('배지 텍스트 yoshida4 포함', badgeText.includes('yoshida4'), badgeText.trim());
const winIntegratorYoshida = await page.evaluate(() => window.__simIntegrator);
check(
  'window.__simIntegrator === yoshida4',
  winIntegratorYoshida === 'yoshida4',
  String(winIntegratorYoshida),
);
await page.screenshot({ path: join(shotDir, '1-static-yoshida4.png') });

// ---- 2. URL 전환 ----
console.log('\n[2/3] URL 전환 — ?integrator=velocity-verlet');
await page.goto(`${baseUrl}/ko?integrator=velocity-verlet`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const badge2 = page.locator('[data-testid="integrator-badge"]');
const badge2Text = (await badge2.textContent()) ?? '';
check(
  '배지 텍스트 velocity-verlet 포함',
  badge2Text.includes('velocity-verlet'),
  badge2Text.trim(),
);
const winIntegratorVV = await page.evaluate(() => window.__simIntegrator);
check(
  'window.__simIntegrator === velocity-verlet',
  winIntegratorVV === 'velocity-verlet',
  String(winIntegratorVV),
);
await page.screenshot({ path: join(shotDir, '2-url-verlet.png') });

// ---- 3. 흐름 — ?gr=eih&integrator=yoshida4 조합 ----
console.log('\n[3/3] 흐름 — ?gr=eih&integrator=yoshida4 5초 재생');
consoleErrors.length = 0;
await page.goto(`${baseUrl}/ko?gr=eih&integrator=yoshida4`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const badge3 = page.locator('[data-testid="integrator-badge"]');
const badge3Text = (await badge3.textContent()) ?? '';
check('조합 URL — 배지 yoshida4', badge3Text.includes('yoshida4'), badge3Text.trim());
// 시간 재생 시도 (버튼이 없으면 스킵, 기본 시뮬은 시간 진행).
await page.click('[data-testid="time-play"]').catch(() => {});
await page.waitForTimeout(5000);
const hasNaNOrWasm = consoleErrors.some((e) => /NaN|nbody|wasm|NBodyEngine|integrator/i.test(e));
check('5초 재생 중 WASM/NaN 관련 에러 0건', !hasNaNOrWasm);
await page.screenshot({ path: join(shotDir, '3-eih-yoshida4.png') });

await browser.close();

console.log('\n========================================');
const pass = results.filter((r) => r.pass).length;
const fail = results.length - pass;
console.log(`결과: ${pass}/${results.length} PASS`);
if (consoleErrors.length) {
  console.log(`콘솔 에러 ${consoleErrors.length}건 (전체):`);
  consoleErrors.slice(0, 10).forEach((e) => console.log('  ', e));
}
if (fail > 0) process.exit(1);
console.log(`스크린샷: ${shotDir}`);
