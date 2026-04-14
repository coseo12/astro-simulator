#!/usr/bin/env node
/**
 * UI 브라우저 3단계 검증 (CRITICAL #3 준수).
 *
 * 사용: node scripts/browser-verify.mjs [baseUrl]
 * 기본 URL: http://localhost:3001
 *
 * Level 1 정적:    콘솔 에러 없음, canvas/HUD 렌더
 * Level 2 인터랙션: ping 버튼 동작
 * Level 3 흐름:    ko/en 전환, URL 동작
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const baseUrl = process.argv[2] ?? 'http://localhost:3001';
const __dirname = dirname(fileURLToPath(import.meta.url));
const screenshotDir = join(__dirname, '..', '.verify-screenshots');
mkdirSync(screenshotDir, { recursive: true });

const results = { pass: [], fail: [], warn: [] };
const check = (name, condition, detail = '') => {
  if (condition) results.pass.push(`${name}${detail ? ' — ' + detail : ''}`);
  else results.fail.push(`${name}${detail ? ' — ' + detail : ''}`);
};
const warn = (msg) => results.warn.push(msg);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

const consoleErrors = [];
const pageErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => pageErrors.push(err.message));

// ===== Level 1: 정적 =====
console.log('\n[Level 1] 정적 검증');
await page.goto(`${baseUrl}/ko`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500); // Babylon 초기화 대기

// HUD 텍스트 확인
const hudText = await page.textContent('body');
check('canvas 엘리먼트 존재', (await page.$('canvas')) !== null);
check(
  'HUD renderer 표시',
  /renderer\s*·\s*(webgpu|webgl2)/.test(hudText ?? ''),
  (hudText ?? '').match(/renderer\s*·\s*\w+/)?.[0] ?? '없음',
);
check('포커스 버튼 존재 (지구)', (await page.$('[data-testid="focus-earth"]')) !== null);
check('reset 버튼 존재', (await page.$('[data-testid="focus-reset"]')) !== null);
check('언어 ko 설정', (await page.evaluate(() => document.documentElement.lang)) === 'ko');
check(
  'data-mode=observe',
  (await page.evaluate(() => document.documentElement.getAttribute('data-mode'))) === 'observe',
);
check('ModeSwitcher 렌더', (await page.$('[data-testid="mode-switcher"]')) !== null);
check(
  'observe 모드 active 초기 상태',
  (await page.getAttribute('[data-testid="mode-observe"]', 'data-active')) === 'true',
);

await page.screenshot({ path: join(screenshotDir, '01-static-ko.png'), fullPage: false });

// ===== Level 2: 인터랙션 =====
console.log('\n[Level 2] 인터랙션 검증');
const earthBtn = await page.$('[data-testid="focus-earth"]');
if (earthBtn) {
  await earthBtn.click();
  await page.waitForTimeout(500); // 카메라 애니메이션 대기
  // 버튼이 선택 상태(primary border)로 전환되는지 확인
  const cls = (await earthBtn.getAttribute('class')) ?? '';
  check('지구 포커스 클릭 시 selected 상태 전환', cls.includes('border-primary'));
} else {
  check('지구 포커스 클릭 시 selected 상태 전환', false, '지구 버튼 못 찾음');
}

// 모드 전환 — research 클릭
const researchBtn = await page.$('[data-testid="mode-research"]');
if (researchBtn) {
  await researchBtn.click();
  await page.waitForTimeout(500); // 패널 애니메이션 대기
  const mode = await page.evaluate(() => document.documentElement.getAttribute('data-mode'));
  check('research 모드 클릭 시 data-mode 갱신', mode === 'research', `data-mode=${mode}`);
  // 연구 모드에서 좌/우 패널 표시
  check('연구 모드 좌 패널 표시', (await page.$('[data-testid="panel-left"]')) !== null);
  check('연구 모드 우 패널 표시', (await page.$('[data-testid="panel-right"]')) !== null);
  // 다시 observe로 전환 → 패널 사라짐
  await page.click('[data-testid="mode-observe"]');
  await page.waitForTimeout(500);
  check(
    '관찰 모드 복귀 시 좌 패널 언마운트',
    (await page.$('[data-testid="panel-left"]')) === null,
  );
} else {
  check('research 모드 클릭 시 data-mode 갱신', false, 'research 버튼 없음');
}

// education 비활성 확인
const educationBtn = await page.$('[data-testid="mode-education"]');
if (educationBtn) {
  const disabled = await educationBtn.isDisabled();
  check('education 모드는 P1에서 비활성', disabled);
} else {
  check('education 모드는 P1에서 비활성', false, '버튼 없음');
}

// TimeControls 검증
const pauseBtn = await page.$('[data-testid="time-pause"]');
if (pauseBtn) {
  await pauseBtn.click();
  await page.waitForTimeout(200);
  check(
    '일시정지 버튼 클릭 시 play 버튼으로 전환',
    (await page.$('[data-testid="time-play"]')) !== null,
  );
  // 다시 재생
  await page.click('[data-testid="time-play"]');
}

// 속도 프리셋 1y 클릭
const yearPreset = await page.$('[data-testid="time-preset-1y"]');
if (yearPreset) {
  await yearPreset.click();
  await page.waitForTimeout(200);
  check(
    '1y 프리셋 클릭 시 active 상태',
    ((await yearPreset.getAttribute('class')) ?? '').includes('border-primary'),
  );
}

await page.screenshot({ path: join(screenshotDir, '02-interaction.png') });

// 마우스 드래그 — 카메라 움직임 (콘솔 에러 없이 수행되는지만 확인)
const canvas = await page.$('canvas');
if (canvas) {
  const box = await canvas.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 50, { steps: 10 });
    await page.mouse.up();
  }
}
check('캔버스 드래그 후 런타임 에러 없음', pageErrors.length === 0);

// ===== Level 3: 흐름 =====
console.log('\n[Level 3] 흐름 검증');
await page.goto(`${baseUrl}/en`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
check(
  'en 로케일 전환 — lang 속성',
  (await page.evaluate(() => document.documentElement.lang)) === 'en',
);

// 루트 / → 리다이렉트 확인
const resp = await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
check('/ → 로케일 리다이렉트', resp !== null && resp.status() < 400);
const urlAfter = page.url();
check('기본 로케일 경로 (/ko 또는 /en)', /\/(ko|en)(\/|$)/.test(urlAfter), `URL = ${urlAfter}`);

await page.screenshot({ path: join(screenshotDir, '03-flow-en.png') });

// ===== 콘솔/에러 요약 =====
console.log('\n[콘솔/에러]');
if (consoleErrors.length > 0) {
  // next/dynamic BailoutToCSR 은 정상 (SSR → CSR 폴백 메시지)
  const filtered = consoleErrors.filter(
    (e) => !/BailoutToCSR|Switched to client rendering/.test(e),
  );
  if (filtered.length === 0) {
    warn(`console.error ${consoleErrors.length}건 (모두 SSR→CSR 폴백, 정상)`);
  } else {
    console.log('실제 콘솔 에러:');
    filtered.forEach((e) => console.log('  -', e));
    check('콘솔 에러 없음', false, `${filtered.length}건`);
  }
}
if (pageErrors.length > 0) {
  console.log('페이지 런타임 에러:');
  pageErrors.forEach((e) => console.log('  -', e));
  check('런타임 에러 없음', false, `${pageErrors.length}건`);
} else {
  check('런타임 에러 없음', true);
}

await browser.close();

// ===== 결과 =====
console.log('\n========================================');
console.log(`PASS: ${results.pass.length}건`);
results.pass.forEach((p) => console.log(`  ✓ ${p}`));
if (results.warn.length > 0) {
  console.log(`\nWARN: ${results.warn.length}건`);
  results.warn.forEach((w) => console.log(`  ⚠ ${w}`));
}
if (results.fail.length > 0) {
  console.log(`\nFAIL: ${results.fail.length}건`);
  results.fail.forEach((f) => console.log(`  ✗ ${f}`));
  process.exit(1);
}
console.log(`\n스크린샷: ${screenshotDir}`);
console.log('모든 검증 통과 ✓');
