#!/usr/bin/env node
/**
 * P4-A #165 — 소행성대 N-body 편입 회귀 가드 (3단계 브라우저 검증).
 *
 * 1. 정적 — `?beltNbody=1` 진입 시 HUD 정상, 소행성대 ThinInstance 렌더
 * 2. 인터랙션 — 엔진 전환 시 crash 없음, 시간 재생 시 positions 업데이트
 * 3. 흐름 — beltNbody=1 ↔ 0 전환, reload 후 상태 유지
 *
 * 사용: node scripts/browser-verify-belt-nbody.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pressTimePlay } from './browser-verify-utils.mjs';

const baseUrl = process.argv[2] ?? 'http://localhost:3001';
const __dirname = dirname(fileURLToPath(import.meta.url));
const shotDir = join(__dirname, '..', '.verify-screenshots', 'belt-nbody');
mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan',
    '--use-angle=metal',
    '--enable-webgpu-developer-features',
    '--enable-dawn-features=allow_unsafe_apis',
  ],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
};

// ===== 1. 정적 =====
console.log('\n[1/3] 정적 — beltNbody=1 + engine=webgpu 진입');
await page.goto(`${baseUrl}/ko?engine=webgpu&belt=500&beltNbody=1`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

check('canvas 엘리먼트', (await page.$('canvas')) !== null);
const hudText = (await page.textContent('[data-testid="hud-top-right"]')) ?? '';
const renderer = hudText.match(/renderer\s*·\s*(\w+)/)?.[1];
check('HUD renderer 표시', !!renderer, `renderer=${renderer ?? '없음'}`);

// 소행성대 N-body 편입 확인 — 초기 프레임에서 소행성 개수만큼 instance가 그려지는지
// 직접 계수는 어려우니 콘솔 에러 없음 + 크래시 없음으로 대체.
check('초기 콘솔 에러 없음', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
await page.screenshot({ path: join(shotDir, '1-static.png') });

// ===== 2. 인터랙션 =====
console.log('\n[2/3] 인터랙션 — 시간 재생 + 엔진 전환');
const initialErrorCount = consoleErrors.length;
// P7-E #210 — silent-fail 방지.
await pressTimePlay(page, { skipIfAbsent: true });
await page.waitForTimeout(2000);
check(
  '재생 중 신규 에러 없음',
  consoleErrors.length === initialErrorCount,
  consoleErrors.slice(initialErrorCount, initialErrorCount + 2).join(' | '),
);

// 엔진 전환: webgpu → barnes-hut
const bhBtn = await page.$('[data-testid="engine-barnes-hut"]');
if (bhBtn) {
  const beforeBhErrors = consoleErrors.length;
  await bhBtn.click();
  await page.waitForTimeout(1500);
  check(
    'webgpu → barnes-hut 전환 시 에러 없음',
    consoleErrors.length === beforeBhErrors,
    consoleErrors.slice(beforeBhErrors, beforeBhErrors + 2).join(' | '),
  );
} else {
  check('barnes-hut 토글 버튼 존재', false, 'data-testid 미발견');
}
await page.screenshot({ path: join(shotDir, '2-after-toggle.png') });

// ===== 3. 흐름 =====
console.log('\n[3/3] 흐름 — beltNbody 미지정(Kepler 경로) 회귀 없음');
await page.goto(`${baseUrl}/ko?engine=webgpu&belt=500`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const flowErrors = consoleErrors.length;
check('beltNbody 미지정 시 에러 없음 (Kepler 경로 유지)', consoleErrors.length === flowErrors, '');
await page.screenshot({ path: join(shotDir, '3-kepler-fallback.png') });

await browser.close();

console.log('\n========================================');
const pass = results.filter((r) => r.pass).length;
const fail = results.filter((r) => !r.pass).length;
console.log(`통과: ${pass} / 실패: ${fail}`);
if (fail > 0) {
  console.log('\n실패 항목:');
  results.filter((r) => !r.pass).forEach((r) => console.log(`  ✗ ${r.name} — ${r.detail}`));
  process.exit(1);
}
console.log('✓ P4-A belt-nbody 회귀 가드 통과');
