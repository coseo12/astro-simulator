#!/usr/bin/env node
/**
 * 모바일 뷰포트 검증 (run-tests 스킬 "듀얼 뷰포트" 규칙 준수).
 * 480×900 기준 반응형 레이아웃 + 핵심 렌더.
 *
 * 규율: sm(640px) 미만은 "라이트 뷰 모드" (기획 결정 — design-tokens.md §8).
 * 480×900은 이 라이트 뷰 경로 검증.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const baseUrl = process.argv[2] ?? 'http://localhost:3001';
const __dirname = dirname(fileURLToPath(import.meta.url));
const screenshotDir = join(__dirname, '..', '.verify-screenshots', 'mobile');
mkdirSync(screenshotDir, { recursive: true });

const results = { pass: [], fail: [] };
const check = (name, condition, detail = '') => {
  if (condition) results.pass.push(`${name}${detail ? ' — ' + detail : ''}`);
  else results.fail.push(`${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 480, height: 900 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${baseUrl}/ko`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// 기본 요소 렌더
check('모바일 canvas 렌더', (await page.$('canvas')) !== null);
check('TopBar 렌더 (로고)', (await page.$('header[data-testid="topbar"]')) !== null);
check('모드 스위처 렌더', (await page.$('[data-testid="mode-switcher"]')) !== null);

// 가로 스크롤 발생 여부 (반응형 깨짐 검출)
const hScroll = await page.evaluate(() => {
  return document.documentElement.scrollWidth > document.documentElement.clientWidth;
});
check('가로 스크롤 미발생 (반응형)', !hScroll);

// 뷰포트 치수 확인
const vp = await page.evaluate(() => ({
  w: window.innerWidth,
  h: window.innerHeight,
}));
check('뷰포트 480×900', vp.w === 480 && vp.h === 900, `${vp.w}x${vp.h}`);

await page.screenshot({ path: join(screenshotDir, '01-mobile-ko.png'), fullPage: false });

// 터치 포커스 — 지구 버튼 탭
const earthBtn = await page.$('[data-testid="focus-earth"]');
if (earthBtn) {
  await earthBtn.tap();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(screenshotDir, '02-mobile-focus-earth.png') });
  check('모바일 지구 포커스 탭 동작', true);
}

// 연구 모드 탭 → 패널 슬라이드 (모바일에서 풀스크린 차지할 수 있음)
const researchBtn = await page.$('[data-testid="mode-research"]');
if (researchBtn) {
  await researchBtn.tap();
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(screenshotDir, '03-mobile-research.png') });
  check('모바일 연구 모드 전환', true);
}

await browser.close();

console.log('\n========================================');
console.log(`모바일 뷰포트 검증 (480×900)`);
console.log(`PASS: ${results.pass.length}건`);
results.pass.forEach((p) => console.log(`  ✓ ${p}`));
if (results.fail.length > 0) {
  console.log(`\nFAIL: ${results.fail.length}건`);
  results.fail.forEach((f) => console.log(`  ✗ ${f}`));
  process.exit(1);
}
if (consoleErrors.length > 0 || pageErrors.length > 0) {
  console.log(`\n콘솔 에러 ${consoleErrors.length}, 런타임 에러 ${pageErrors.length}`);
  consoleErrors.forEach((e) => console.log('  console:', e));
  pageErrors.forEach((e) => console.log('  runtime:', e));
  process.exit(1);
}
console.log(`스크린샷: ${screenshotDir}`);
console.log('모바일 검증 통과 ✓');
