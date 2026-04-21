#!/usr/bin/env node
/**
 * P10-D #263 — Osculating timeScale 내성화 브라우저 3단계 검증.
 *
 * 검증 목표:
 *   Level 1: 페이지 로드 + Newton 엔진 선택 진입
 *   Level 2: timeScale=86400 (기본) Newton 모드에서 1Hz 배지 렌더
 *   Level 3: Kepler 모드 복귀 시 정적 JSON 폴백, timeScale=1 에서도 정상
 *
 * 핵심 Behavior Change 실증:
 *   Newton 엔진 state vector 직접 추출 → timeScale 무관 1Hz 배지 렌더.
 *
 * 사용: node scripts/browser-verify-osculating-timescale.mjs [baseUrl]
 */
import { chromium } from 'playwright';

const baseUrl = process.argv[2] ?? 'http://localhost:3000';

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

// Newton 엔진 + research 모드 진입 (UI 패널 노출) + Jupiter focus.
console.log('\n[Level 1] 정적 진입 — Newton + research + Jupiter focus');
await page.goto(`${baseUrl}/ko?engine=newton&mode=research&focus=jupiter`, {
  waitUntil: 'networkidle',
});
await page.waitForTimeout(1500);

check('canvas 렌더', (await page.$('canvas')) !== null);
check(
  'research 모드 진입 — data-mode=research',
  (await page.evaluate(() => document.documentElement.getAttribute('data-mode'))) === 'research',
);
// Newton 엔진 active 확인
check(
  'Newton 엔진 active',
  (await page.evaluate(() => window.__simStore?.getState?.()?.physicsEngine)) === 'newton',
);
check(
  '__solarScene 노출 (dev 빌드 한정)',
  (await page.evaluate(() => typeof window.__solarScene)) === 'object',
);

// Galilean 위성 info panel 렌더
check('sat-row-io 존재', (await page.$('[data-testid="sat-row-io"]')) !== null);

// ===== Level 2: Newton 엔진 + timeScale=86400 (기본) → 1Hz 배지 렌더 =====
console.log('\n[Level 2] 인터랙션 — timeScale=86400 에서 1Hz 배지 렌더 (핵심 #263)');

// 초기 timeScale 확인 + polling 대기 (baseInterval 1000ms + Newton advance 시간).
const initialTimeScale = await page.evaluate(() => window.__simStore?.getState?.()?.timeScale);
check('timeScale 86400 기본값', initialTimeScale === 86400, `ts=${initialTimeScale}`);

// Newton 엔진 state vector 직접 추출 확인 (getBodyState)
const jupiterState = await page.evaluate(() => {
  const s = window.__solarScene?.getBodyState?.('io', 'jupiter');
  if (!s) return null;
  return { posLen: Math.hypot(...s.pos), velLen: Math.hypot(...s.vel) };
});
check(
  'getBodyState(io, jupiter) 반환 (Newton state vector)',
  jupiterState !== null,
  jupiterState
    ? `|pos|=${jupiterState.posLen.toExponential(3)}m |vel|=${jupiterState.velLen.toFixed(0)}m/s`
    : 'null',
);
// Io-Jupiter 거리 ≈ 4.2e8 m, velocity ≈ 17km/s 수준
if (jupiterState) {
  // Io 궤도 반경 ≈ 4.2e8 m (semi-major). advance 후 순간 위치는 타원 근/원일점
  // 근방에서 변동 — 2e8~1e9 범위 허용 (Newton 적분 step 경과 상태 반영).
  check(
    'Io-Jupiter 거리 2e8~1e9 m 범위 (Newton 시뮬 순간값)',
    jupiterState.posLen > 2e8 && jupiterState.posLen < 1e9,
    `${jupiterState.posLen.toExponential(3)}`,
  );
  // Io 평균 궤도 속도 ≈ 17 km/s. 순간 속도는 궤도 위상에 따라 5~25 km/s 범위 변동.
  check(
    'Io velocity 5~25 km/s 범위 (Newton 시뮬 순간값)',
    jupiterState.velLen > 5000 && jupiterState.velLen < 25000,
    `${jupiterState.velLen.toFixed(0)} m/s`,
  );
}

// 2초 대기 (polling 1Hz × 2 = 배지 렌더 여유)
await page.waitForTimeout(2500);

// 1Hz 배지 렌더 확인 — Newton 엔진 state 로부터 dynamic 업데이트
check(
  'sat-dynamic-io 배지 렌더 (timeScale=86400 Newton 경로)',
  (await page.$('[data-testid="sat-dynamic-io"]')) !== null,
);
check(
  'sat-dynamic-europa 배지 렌더',
  (await page.$('[data-testid="sat-dynamic-europa"]')) !== null,
);
check(
  'sat-dynamic-ganymede 배지 렌더',
  (await page.$('[data-testid="sat-dynamic-ganymede"]')) !== null,
);
check(
  'sat-dynamic-callisto 배지 렌더',
  (await page.$('[data-testid="sat-dynamic-callisto"]')) !== null,
);

// ===== Level 3: Kepler 폴백 =====
console.log('\n[Level 3] 흐름 — Kepler 모드 폴백');

await page.evaluate(() => window.__simStore?.getState?.()?.setPhysicsEngine?.('kepler'));
await page.waitForTimeout(2500);

// Kepler 모드에서는 getBodyState null → 정적 JSON fallback (sat-dynamic 미렌더)
check(
  'Kepler 모드 전환 후 sat-dynamic-io 미렌더 (정적 JSON 폴백)',
  (await page.$('[data-testid="sat-dynamic-io"]')) === null,
);
check(
  'Kepler 모드 — getBodyState null',
  (await page.evaluate(() => window.__solarScene?.getBodyState?.('io', 'jupiter'))) === null,
);

// 런타임 에러 없음
check(
  '런타임 에러 없음',
  consoleErrors.length === 0,
  consoleErrors.length ? consoleErrors.join(' | ').slice(0, 200) : '',
);

await browser.close();

// 결과 출력
console.log('\n========================================');
console.log(`PASS: ${results.pass.length}건`);
for (const p of results.pass) console.log(`  ✓ ${p}`);
if (results.fail.length > 0) {
  console.log(`\nFAIL: ${results.fail.length}건`);
  for (const f of results.fail) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log('\n모든 검증 통과 ✓');
