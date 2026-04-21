#!/usr/bin/env node
/**
 * P10-C-1 #278 — ViewMode 토글 브라우저 3단계 검증 (CRITICAL #3 준수).
 *
 * 사용: node scripts/browser-verify-view-mode.mjs [baseUrl]
 * 기본 URL: http://localhost:3000
 *
 * Level 1 정적:     view-mode-switcher 존재, educational 초기 active, data-view-mode='educational'
 * Level 2 인터랙션: 버튼 클릭 / 키보드 m / input 포커스 중 m 무시
 * Level 3 흐름:     URL ?view=scientific 진입 시 초기 반영 / store→URL 동기화 / ?view 제거 시 educational
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const baseUrl = process.argv[2] ?? 'http://localhost:3000';
const __dirname = dirname(fileURLToPath(import.meta.url));
const screenshotDir = join(__dirname, '..', '.verify-screenshots');
mkdirSync(screenshotDir, { recursive: true });

const results = { pass: [], fail: [] };
const check = (name, condition, detail = '') => {
  if (condition) results.pass.push(`${name}${detail ? ' — ' + detail : ''}`);
  else results.fail.push(`${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(err.message));

// ===== Level 1: 정적 =====
console.log('\n[Level 1] 정적 검증');
await page.goto(`${baseUrl}/ko`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

check('view-mode-switcher 존재', (await page.$('[data-testid="view-mode-switcher"]')) !== null);
check(
  'view-mode-educational 버튼 존재',
  (await page.$('[data-testid="view-mode-educational"]')) !== null,
);
check(
  'view-mode-scientific 버튼 존재',
  (await page.$('[data-testid="view-mode-scientific"]')) !== null,
);
check(
  'educational 초기 active',
  (await page.getAttribute('[data-testid="view-mode-educational"]', 'data-active')) === 'true',
);
check(
  'scientific 초기 inactive',
  (await page.getAttribute('[data-testid="view-mode-scientific"]', 'data-active')) === 'false',
);
check(
  'html[data-view-mode=educational] 초기 상태',
  (await page.evaluate(() => document.documentElement.getAttribute('data-view-mode'))) ===
    'educational',
);
check(
  'ARIA radiogroup role',
  (await page.getAttribute('[data-testid="view-mode-switcher"]', 'role')) === 'radiogroup',
);

await page.screenshot({
  path: join(screenshotDir, 'view-mode-01-static.png'),
  fullPage: false,
});

// ===== Level 2: 인터랙션 =====
console.log('\n[Level 2] 인터랙션 검증');

// 버튼 클릭 전환
await page.click('[data-testid="view-mode-scientific"]');
await page.waitForTimeout(200);
check(
  'scientific 클릭 시 active 전환',
  (await page.getAttribute('[data-testid="view-mode-scientific"]', 'data-active')) === 'true',
);
check(
  'data-view-mode=scientific 동기화',
  (await page.evaluate(() => document.documentElement.getAttribute('data-view-mode'))) ===
    'scientific',
);

// educational 로 다시 전환
await page.click('[data-testid="view-mode-educational"]');
await page.waitForTimeout(200);
check(
  'educational 재클릭 시 active',
  (await page.getAttribute('[data-testid="view-mode-educational"]', 'data-active')) === 'true',
);

// 키보드 m 단축키
await page.keyboard.press('m');
await page.waitForTimeout(200);
check(
  '키보드 m 단축키 — scientific 전환',
  (await page.getAttribute('[data-testid="view-mode-scientific"]', 'data-active')) === 'true',
);
await page.keyboard.press('m');
await page.waitForTimeout(200);
check(
  '키보드 m 단축키 — educational 복귀',
  (await page.getAttribute('[data-testid="view-mode-educational"]', 'data-active')) === 'true',
);

// 입력 요소 포커스 중 m 무시 — date-time-picker 같은 input 검색
const inputs = await page.$$('input:not([type="checkbox"]):not([type="radio"])');
if (inputs.length > 0) {
  await inputs[0].focus();
  await page.keyboard.press('m');
  await page.waitForTimeout(200);
  check(
    'input 포커스 중 m 키 무시',
    (await page.getAttribute('[data-testid="view-mode-educational"]', 'data-active')) === 'true',
  );
  // 포커스 해제
  await page.evaluate(() => {
    const el = document.activeElement;
    if (el && typeof el.blur === 'function') el.blur();
  });
} else {
  console.log('  ⚠  input 요소 없음 — 포커스 가드 테스트 스킵');
}

// ===== Level 3: 흐름 =====
console.log('\n[Level 3] 흐름 검증');

// URL ?view=scientific 초기 진입
await page.goto(`${baseUrl}/ko?view=scientific`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
check(
  'URL ?view=scientific 초기 반영 — data-view-mode',
  (await page.evaluate(() => document.documentElement.getAttribute('data-view-mode'))) ===
    'scientific',
);
check(
  'URL ?view=scientific 초기 반영 — 버튼 active',
  (await page.getAttribute('[data-testid="view-mode-scientific"]', 'data-active')) === 'true',
);

// store → URL 동기화 (educational 로 전환 시 ?view 제거)
await page.click('[data-testid="view-mode-educational"]');
await page.waitForTimeout(300);
const urlAfterEducational = page.url();
check(
  'educational 전환 시 ?view URL 제거',
  !urlAfterEducational.includes('view=educational'),
  urlAfterEducational,
);

// scientific 재전환 시 ?view=scientific URL 반영
await page.click('[data-testid="view-mode-scientific"]');
await page.waitForTimeout(300);
const urlAfterScientific = page.url();
check(
  'scientific 전환 시 ?view=scientific URL 반영',
  urlAfterScientific.includes('view=scientific'),
  urlAfterScientific,
);

// 잘못된 값 ?view=foo 는 무시되고 educational 유지
await page.goto(`${baseUrl}/ko?view=foo`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
check(
  '잘못된 ?view 값 무시 — educational 유지',
  (await page.evaluate(() => document.documentElement.getAttribute('data-view-mode'))) ===
    'educational',
);

// ===== 런타임 에러 =====
check(
  '런타임 에러 없음',
  consoleErrors.length === 0,
  consoleErrors.length ? consoleErrors.join(' | ').slice(0, 200) : '',
);

await page.screenshot({
  path: join(screenshotDir, 'view-mode-99-final.png'),
  fullPage: false,
});

await browser.close();

// ===== 결과 =====
console.log('\n========================================');
console.log(`PASS: ${results.pass.length}건`);
for (const p of results.pass) console.log(`  ✓ ${p}`);
if (results.fail.length > 0) {
  console.log(`\nFAIL: ${results.fail.length}건`);
  for (const f of results.fail) console.log(`  ✗ ${f}`);
}
console.log(`\n스크린샷: ${screenshotDir}`);

if (results.fail.length > 0) {
  console.error('\n검증 실패 ✗');
  process.exit(1);
}
console.log('\n모든 검증 통과 ✓');
