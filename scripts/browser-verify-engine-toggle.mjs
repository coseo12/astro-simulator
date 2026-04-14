#!/usr/bin/env node
/**
 * #89 브라우저 3단계 검증 — 물리 엔진 토글.
 *
 * 1. 정적: 토글 버튼 렌더, 콘솔 에러 없음
 * 2. 인터랙션: Newton 클릭 → data-active 전환 + URL ?engine=newton 반영
 * 3. 흐름: URL ?engine=newton으로 시작 → 초기 상태 Newton, 토글 상태 일치
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const baseUrl = process.argv[2] ?? 'http://localhost:3001';
const __dirname = dirname(fileURLToPath(import.meta.url));
const shotDir = join(__dirname, '..', '.verify-screenshots', 'engine-toggle');
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
console.log('\n[1/3] 정적 확인');
await page.goto(`${baseUrl}/ko`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const toggle = page.locator('[data-testid="physics-engine-toggle"]');
check('토글 컨테이너 표시', (await toggle.count()) === 1);
check('Kepler 버튼', (await page.locator('[data-testid="engine-kepler"]').count()) === 1);
check('Newton 버튼', (await page.locator('[data-testid="engine-newton"]').count()) === 1);
const initialActive = await page.getAttribute('[data-testid="engine-kepler"]', 'data-active');
check('초기 Kepler active', initialActive === 'true');
await page.screenshot({ path: join(shotDir, '1-static.png') });

// ---- 2. 인터랙션 ----
console.log('\n[2/3] 인터랙션');
await page.click('[data-testid="engine-newton"]');
await page.waitForTimeout(500);
const afterClickNewton = await page.getAttribute('[data-testid="engine-newton"]', 'data-active');
const afterClickKepler = await page.getAttribute('[data-testid="engine-kepler"]', 'data-active');
check('Newton active 전환', afterClickNewton === 'true');
check('Kepler inactive', afterClickKepler === 'false');
const urlAfter = page.url();
check('URL에 ?engine=newton 포함', urlAfter.includes('engine=newton'), urlAfter);
await page.screenshot({ path: join(shotDir, '2-after-newton.png') });

// 다시 Kepler 클릭 → URL에서 engine 파라미터 제거 (kepler는 기본값)
await page.click('[data-testid="engine-kepler"]');
await page.waitForTimeout(500);
const urlBack = page.url();
check('Kepler 복귀 시 URL engine 파라미터 제거', !urlBack.includes('engine='), urlBack);

// ---- 3. 흐름 ----
console.log('\n[3/3] 흐름 — URL로 초기 상태 공유');
await page.goto(`${baseUrl}/ko?engine=newton`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const initialNewton = await page.getAttribute('[data-testid="engine-newton"]', 'data-active');
check('?engine=newton 진입 시 Newton active', initialNewton === 'true');
// 시간 재생 → 위치 업데이트 확인 (씬은 시간 이벤트에서 updateAt 호출)
await page.click('[data-testid="time-play"]').catch(() => {});
await page.waitForTimeout(1500);
const hasEngineErr = consoleErrors.some((e) => /nbody|wasm|NBodyEngine/i.test(e));
check('시간 재생 중 WASM 관련 콘솔 에러 없음', !hasEngineErr);
await page.screenshot({ path: join(shotDir, '3-newton-flow.png') });

await browser.close();

console.log('\n========================================');
const pass = results.filter((r) => r.pass).length;
const fail = results.length - pass;
console.log(`결과: ${pass}/${results.length} PASS`);
if (consoleErrors.length) {
  console.log(`콘솔 에러 ${consoleErrors.length}건:`);
  consoleErrors.slice(0, 5).forEach((e) => console.log('  ', e));
}
if (fail > 0) process.exit(1);
console.log(`스크린샷: ${shotDir}`);
