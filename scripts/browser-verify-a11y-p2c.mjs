#!/usr/bin/env node
/**
 * #117 P2-C UI 접근성 확장 — MassSlider / BookmarkButton / ScenarioPresets
 * axe-core 위반 재검증.
 */
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const baseUrl = process.argv[2] ?? 'http://localhost:3001';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

const errs = [];
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));

const results = [];
const check = (n, p, d = '') => {
  results.push({ n, p });
  console.log(`  ${p ? '✓' : '✗'} ${n}${d ? ' — ' + d : ''}`);
};

console.log('\n[1/2] 연구 모드 + jupiter focus → P2-C UI 표시');
await page.goto(`${baseUrl}/ko?mode=research`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('[data-testid="focus-jupiter"]');
await page.waitForTimeout(800);
check('MassSlider 렌더', (await page.locator('[data-testid="mass-slider"]').count()) === 1);
check('BookmarkButton 렌더', (await page.locator('[data-testid="bookmark-button"]').count()) === 1);
check(
  'ScenarioPresets 렌더',
  (await page.locator('[data-testid="scenario-presets"]').count()) === 1,
);

console.log('\n[2/2] axe-core 위반 재검증 (P2-C UI 포함 상태)');
const axe = await new AxeBuilder({ page }).analyze();
const criticalOrSerious = axe.violations.filter((v) => ['critical', 'serious'].includes(v.impact));
check(
  `axe critical/serious 위반 ${criticalOrSerious.length}건`,
  criticalOrSerious.length === 0,
  criticalOrSerious.map((v) => v.id).join(', ') || 'none',
);
if (criticalOrSerious.length > 0) {
  for (const v of criticalOrSerious) {
    console.log(`    - ${v.id}: ${v.help}`);
  }
}

// 키보드 네비게이션 — 탭으로 북마크/프리셋 도달 가능 확인
console.log('\n[보조] 키보드 포커스');
await page.keyboard.press('Tab');
await page.keyboard.press('Tab');
const active = await page.evaluate(
  () => document.activeElement?.getAttribute('data-testid') ?? null,
);
check('Tab 포커스 이동 (최초 요소 data-testid 확인)', active !== null, active ?? 'null');

await browser.close();
const pass = results.filter((r) => r.p).length;
console.log(`\n결과: ${pass}/${results.length} PASS`);
if (errs.length) errs.slice(0, 5).forEach((e) => console.log(' ', e));
if (pass < results.length) process.exit(1);
