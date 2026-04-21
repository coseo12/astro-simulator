#!/usr/bin/env node
/**
 * P10-C-1/C-2 #278 — ViewMode + UI 요소 브라우저 3단계 검증 (CRITICAL #3 준수).
 *
 * 사용: node scripts/browser-verify-view-mode.mjs [baseUrl]
 * 기본 URL: http://localhost:3000
 *
 * Level 1 정적:     view-mode-switcher / scale-badge / onboarding-tooltip 존재
 * Level 2 인터랙션: 버튼 클릭 / 키보드 m / scientific 모드 scale=1 실측 / onboarding dismiss
 * Level 3 흐름:     URL ?view=scientific 진입 + scientific-mode-notice 배너 + dismiss 영속
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
// 테스트 간 localStorage 초기화 — onboarding/scientific-notice dismiss 상태 리셋
await page.goto(`${baseUrl}/ko`, { waitUntil: 'networkidle' });
await page.evaluate(() => {
  window.localStorage.removeItem('astro:onboarding-dismissed');
  window.localStorage.removeItem('astro:scientific-notice-dismissed');
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

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
// P10-C-2 추가 — UI 요소 존재
check('scale-badge 존재', (await page.$('[data-testid="scale-badge"]')) !== null);
check(
  'scale-badge 초기 "시각 과장 모드" 표시',
  ((await page.textContent('[data-testid="scale-badge"]')) ?? '').includes('시각 과장 모드'),
);
check(
  'onboarding-tooltip 초기 진입 시 노출',
  (await page.$('[data-testid="onboarding-tooltip"]')) !== null,
);
check(
  'scientific-mode-notice 초기 educational 에서는 숨김',
  (await page.$('[data-testid="scientific-mode-notice"]')) === null,
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

// P10-C-2 — onboarding dismiss
// onboarding 이 열려있을 수 있음 — 먼저 dismiss
const onboarding = await page.$('[data-testid="onboarding-tooltip"]');
if (onboarding) {
  await page.click('[data-testid="onboarding-dismiss"]');
  await page.waitForTimeout(200);
  check(
    'onboarding dismiss → 툴팁 제거',
    (await page.$('[data-testid="onboarding-tooltip"]')) === null,
  );
  check(
    'onboarding dismiss → localStorage 기록',
    (await page.evaluate(() => window.localStorage.getItem('astro:onboarding-dismissed'))) === '1',
  );
}

// P10-C-2 — scientific 모드 scale=1 실측 (핵심 Behavior Change)
await page.keyboard.press('m'); // educational → scientific
await page.waitForTimeout(500); // scene frame 렌더 대기
const jupiterScale = await page.evaluate(() => {
  const scene = window.__solarScene;
  if (!scene) return null;
  const jupiter = scene.meshes.get('jupiter');
  return jupiter ? jupiter.scaling.x : null;
});
check(
  'scientific 모드에서 jupiter scaling.x === 1 (IAU 실측 비율)',
  jupiterScale === 1,
  `scaling=${jupiterScale}`,
);

// scale-badge 내용 전환 확인
await page.waitForTimeout(100);
check(
  'scale-badge scientific 모드 "사실 비율 모드" 표시',
  ((await page.textContent('[data-testid="scale-badge"]')) ?? '').includes('사실 비율 모드'),
);

// educational 복귀 — scale 이 다시 > 1 로 복원
await page.keyboard.press('m');
await page.waitForTimeout(500);
const jupiterScaleEdu = await page.evaluate(() => {
  const scene = window.__solarScene;
  const jupiter = scene?.meshes.get('jupiter');
  return jupiter ? jupiter.scaling.x : null;
});
check(
  'educational 복귀 시 jupiter scaling > 1 (과장 복원)',
  jupiterScaleEdu !== null && jupiterScaleEdu > 1,
  `scaling=${jupiterScaleEdu}`,
);

// ===== Level 3: 흐름 =====
console.log('\n[Level 3] 흐름 검증');

// URL ?view=scientific 초기 진입 — 먼저 scientific-notice dismiss 초기화
await page.goto(`${baseUrl}/ko`, { waitUntil: 'networkidle' });
await page.evaluate(() => {
  window.localStorage.removeItem('astro:scientific-notice-dismissed');
});
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
// P10-C-2 — scientific-notice 배너 자동 노출
check(
  'scientific-mode-notice 자동 노출 (첫 진입, dismiss 기록 없음)',
  (await page.$('[data-testid="scientific-mode-notice"]')) !== null,
);
// dismiss + 재진입 시 숨김
await page.click('[data-testid="scientific-mode-notice-dismiss"]');
await page.waitForTimeout(200);
check(
  'scientific-notice dismiss 후 제거',
  (await page.$('[data-testid="scientific-mode-notice"]')) === null,
);
// educational 복귀 후 scientific 재진입 — 배너 재노출 안 됨 (영속 dismiss)
await page.goto(`${baseUrl}/ko?view=scientific`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
check(
  'scientific-notice 영속 dismiss — 재진입 시 미노출',
  (await page.$('[data-testid="scientific-mode-notice"]')) === null,
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
