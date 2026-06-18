#!/usr/bin/env node
/**
 * #704 free-fly 카메라 감도 설정 회귀 가드 — 4축 슬라이더 → 런타임 카메라 거동 + localStorage 왕복.
 *
 * ADR `docs/decisions/20260618-704-freefly-sensitivity-settings-ui.md` §결정 5 (무회귀 = 축 5).
 *
 * 사용법:
 *   pnpm --filter @astro-simulator/web verify:704-sensitivity
 *   pnpm --filter @astro-simulator/web verify:704-sensitivity -- --json
 *
 * ## 검증 시나리오
 *
 * | S   | DoD (PASS)                                                                | 회귀 시                      |
 * |-----|---------------------------------------------------------------------------|------------------------------|
 * | S1  | 4축 슬라이더 변경 → 런타임 카메라 거동 변화 (zoom/panning/zoomout/wasd)    | 정적 const 잔존(미반영)      |
 * | S2  | 기본값 복원 → 4축 = 0.015/5/0.01/0.01 + 카메라 속성 default 환원          | reset 미동기화               |
 * | S3  | localStorage 왕복 — 변경 → reload 후 유지 + 손상값 주입 시 default 폴백   | 영속 미작동/손상값 흡수      |
 * | S4  | focus/reset 무회귀 — 감도 변경이 focus follow / reset 원복에 영향 0       | 감도 변경이 focus/reset 오염 |
 *
 * dev 빌드 의존: window.__simStore (freeFlySensitivity / setFreeFlySensitivity / reset /
 *               setSelectedBody / enterFreeFly) / window.__solarScene (meshes/activeCamera).
 * 환경변수: BASE_URL (기본 http://localhost:3000)
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const flags = { json: process.argv.slice(2).includes('--json') };
const VIEWPORT = { width: 1280, height: 720 };
const SETTLE_MS = 2500;
const STORAGE_KEY = 'astro:free-fly-sensitivity';
const SCHEMA_VERSION = 1;
// 4축 default (camera.ts const SSoT — store default 와 일치해야 함).
const DEFAULTS = { wasd: 0.015, zoomoutFactor: 5, panning: 0.01, zoom: 0.01 };

async function boot(page) {
  await page.goto(`${BASE_URL}/?gpu=a&lod=auto`, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForFunction(
    () => typeof window.__solarScene !== 'undefined' && typeof window.__simStore !== 'undefined',
    { timeout: 15_000 },
  );
  await page.waitForTimeout(SETTLE_MS);
}

// 카메라 + store 감도 스냅샷.
async function snapshot(page) {
  return page.evaluate(() => {
    const s = window.__simStore.getState();
    const solar = window.__solarScene;
    const cam = solar?.meshes?.values().next().value?.getScene()?.activeCamera;
    return {
      sensitivity: { ...s.freeFlySensitivity },
      wheelDeltaPercentage: cam?.wheelDeltaPercentage ?? null,
      pinchDeltaPercentage: cam?.pinchDeltaPercentage ?? null,
      panningSensibility: cam?.panningSensibility ?? null,
      upperRadiusLimit: cam?.upperRadiusLimit ?? null,
      radius: cam?.radius ?? null,
    };
  });
}

async function enterFreeFly(page) {
  await page.evaluate(() => window.__simStore.getState().enterFreeFly());
  await page.waitForTimeout(1200);
}
async function setAxis(page, axis, value, persist = true) {
  await page.evaluate(
    ({ axis, value, persist }) =>
      window.__simStore.getState().setFreeFlySensitivity(axis, value, persist),
    { axis, value, persist },
  );
  await page.waitForTimeout(300);
}

// S1 — 4축 슬라이더 변경 → 런타임 카메라 거동 변화.
//   zoom: camera.wheelDeltaPercentage / pinchDeltaPercentage = 새 값 (즉시 set).
//   panning: free-fly 활성 중 panningSensibility 가 새 값 비례로 변화 (값↑ = sensibility↓).
//   zoomoutFactor: free-fly 활성 중 upperRadiusLimit = entryRadius × factor 재산정.
//   wasd: getter pull — store 값이 바뀌면 다음 프레임부터 반영(여기선 store 값 반영만 확인).
async function scenarioRuntimeApply(browser) {
  console.log('\n[S1] 4축 슬라이더 → 런타임 카메라 거동 변화 (zoom/panning/zoomout/wasd)');
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await boot(page);
    await enterFreeFly(page);
    const before = await snapshot(page);
    // zoom — 0.01 → 0.025 (카메라 wheel/pinch 속성 즉시 set).
    await setAxis(page, 'zoom', 0.025);
    // panning — 0.01 → 0.02 (sensibility 절반 = 화면 px↔world 이동량 2배).
    await setAxis(page, 'panning', 0.02);
    // zoomoutFactor — 5 → 12 (upperRadiusLimit = entryRadius × 12 재산정).
    await setAxis(page, 'zoomoutFactor', 12);
    // wasd — 0.015 → 0.03 (store 반영, getter pull 로 다음 프레임부터 산식 적용).
    await setAxis(page, 'wasd', 0.03);
    await page.waitForTimeout(400);
    const after = await snapshot(page);

    const zoomOk =
      Math.abs(after.wheelDeltaPercentage - 0.025) < 1e-9 &&
      Math.abs(after.pinchDeltaPercentage - 0.025) < 1e-9;
    // panning sensibility 는 값↑ → sensibility↓ (반비례). before/after 둘 다 free-fly 활성이라 >0.
    const panningOk =
      before.panningSensibility > 0 &&
      after.panningSensibility > 0 &&
      after.panningSensibility < before.panningSensibility; // 0.02 > 0.01 → sensibility 작아짐.
    // upperRadiusLimit 가 factor 변경으로 증가 (5 → 12).
    const zoomoutOk = after.upperRadiusLimit > before.upperRadiusLimit * 1.5;
    const wasdOk = Math.abs(after.sensitivity.wasd - 0.03) < 1e-9;
    const pass = zoomOk && panningOk && zoomoutOk && wasdOk;
    console.log(
      `  zoom wheelΔ%=${after.wheelDeltaPercentage}(=0.025 ${zoomOk}) | panning sens ${before.panningSensibility?.toFixed(1)}→${after.panningSensibility?.toFixed(1)}(감소 ${panningOk}) | upperLimit ${before.upperRadiusLimit?.toExponential(2)}→${after.upperRadiusLimit?.toExponential(2)}(증가 ${zoomoutOk}) | wasd=${after.sensitivity.wasd}(=0.03 ${wasdOk}) → ${pass ? 'PASS' : 'FAIL'}`,
    );
    return { scenario: 'S1', before, after, zoomOk, panningOk, zoomoutOk, wasdOk, pass };
  } finally {
    await ctx.close();
  }
}

// S2 — 기본값 복원 → 4축 = default + 카메라 zoom 속성 default 환원.
async function scenarioResetDefaults(browser) {
  console.log('\n[S2] 기본값 복원 → 4축 = 0.015/5/0.01/0.01 + 카메라 zoom 속성 default');
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await boot(page);
    await enterFreeFly(page);
    // 4축 전부 비-default 로 변경 후 reset.
    await setAxis(page, 'wasd', 0.045);
    await setAxis(page, 'zoomoutFactor', 18);
    await setAxis(page, 'panning', 0.028);
    await setAxis(page, 'zoom', 0.028);
    await page.evaluate(() => window.__simStore.getState().resetFreeFlySensitivity());
    await page.waitForTimeout(500);
    const s = await snapshot(page);
    const axesOk =
      Math.abs(s.sensitivity.wasd - DEFAULTS.wasd) < 1e-9 &&
      Math.abs(s.sensitivity.zoomoutFactor - DEFAULTS.zoomoutFactor) < 1e-9 &&
      Math.abs(s.sensitivity.panning - DEFAULTS.panning) < 1e-9 &&
      Math.abs(s.sensitivity.zoom - DEFAULTS.zoom) < 1e-9;
    // 카메라 zoom 속성도 default 로 환원 (구독 push).
    const zoomPropOk = Math.abs(s.wheelDeltaPercentage - DEFAULTS.zoom) < 1e-9;
    const pass = axesOk && zoomPropOk;
    console.log(
      `  store=${JSON.stringify(s.sensitivity)} (default ${axesOk}) | wheelΔ%=${s.wheelDeltaPercentage}(=0.01 ${zoomPropOk}) → ${pass ? 'PASS' : 'FAIL'}`,
    );
    return { scenario: 'S2', sensitivity: s.sensitivity, axesOk, zoomPropOk, pass };
  } finally {
    await ctx.close();
  }
}

// S3 — localStorage 왕복: 변경(persist) → reload 후 유지 + 손상값 주입 시 default 폴백.
async function scenarioPersistence(browser) {
  console.log('\n[S3] localStorage 왕복 — 변경→reload 유지 + 손상값 주입 시 default 폴백');
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await boot(page);
    // (a) 변경 persist → reload → 유지.
    await setAxis(page, 'wasd', 0.04, true);
    await setAxis(page, 'zoomoutFactor', 14, true);
    await page.reload({ waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForFunction(() => typeof window.__simStore !== 'undefined', { timeout: 15_000 });
    await page.waitForTimeout(SETTLE_MS);
    const afterReload = await page.evaluate(() => ({
      ...window.__simStore.getState().freeFlySensitivity,
    }));
    const persistOk =
      Math.abs(afterReload.wasd - 0.04) < 1e-9 && Math.abs(afterReload.zoomoutFactor - 14) < 1e-9;

    // (b) 손상값 주입 → reload → 폴백/clamp 가드.
    //   - wasd 999 (범위 max 0.05 초과, 유한) → max clamp (0.05)
    //   - zoomoutFactor 'corrupt' (비-숫자 타입 손상) → default (5)
    //   - panning null (비-숫자) → default (0.01)
    //   - zoom 0 (유한이나 범위 min 0.005 미만) → min clamp (0.005)
    // 핵심: NaN/비-숫자는 default, 범위 이탈 유한값은 min/max clamp (둘 다 silent 흡수 아님 — 명시 정정).
    await page.evaluate(
      ({ key, version }) => {
        localStorage.setItem(
          key,
          JSON.stringify({
            version,
            value: { wasd: 999, zoomoutFactor: 'corrupt', panning: null, zoom: 0 },
          }),
        );
      },
      { key: STORAGE_KEY, version: SCHEMA_VERSION },
    );
    await page.reload({ waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForFunction(() => typeof window.__simStore !== 'undefined', { timeout: 15_000 });
    await page.waitForTimeout(SETTLE_MS);
    const afterCorrupt = await page.evaluate(() => ({
      ...window.__simStore.getState().freeFlySensitivity,
    }));
    // wasd 999 → max clamp / zoomoutFactor·panning 비-숫자 → default / zoom 0 → min clamp.
    // (NaN/비-숫자를 silent 흡수하면 FAIL — 명시 default/clamp 정정 검증.)
    const fallbackOk =
      afterCorrupt.wasd === 0.05 && // max clamp (유한 범위 초과)
      afterCorrupt.zoomoutFactor === DEFAULTS.zoomoutFactor && // 'corrupt' → default
      afterCorrupt.panning === DEFAULTS.panning && // null → default
      afterCorrupt.zoom === 0.005; // 0 (범위 min 미만) → min clamp
    const pass = persistOk && fallbackOk;
    console.log(
      `  reload 유지 wasd=${afterReload.wasd} zoomout=${afterReload.zoomoutFactor}(${persistOk}) | 손상 주입→폴백 ${JSON.stringify(afterCorrupt)}(${fallbackOk}) → ${pass ? 'PASS' : 'FAIL'}`,
    );
    return { scenario: 'S3', afterReload, afterCorrupt, persistOk, fallbackOk, pass };
  } finally {
    await ctx.close();
  }
}

// S4 — focus/reset 무회귀: 감도 변경 후 focus 진입 → follow 정상(panning=0) / reset → target 원점 복원.
async function scenarioNoRegression(browser) {
  console.log('\n[S4] focus/reset 무회귀 — 감도 변경이 focus follow / reset 원복에 영향 0');
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await boot(page);
    // 감도 4축 비-default 로 변경 (무회귀 = 변경 상태에서도 focus/reset 정상).
    await enterFreeFly(page);
    await setAxis(page, 'panning', 0.025);
    await setAxis(page, 'zoom', 0.02);
    // focus 진입 → panningSensibility=0 (focus follow, #693 무회귀).
    await page.evaluate(() => window.__simStore.getState().setSelectedBody('earth'));
    await page.waitForTimeout(SETTLE_MS);
    const focusSnap = await snapshot(page);
    const focusPanningOff = focusSnap.panningSensibility === 0;
    // zoom 속성은 사용자 변경값 유지 (focus 중에도 줌 동일 속성 — 거동 모델 불변, 회귀 아님).
    const zoomPreserved = Math.abs(focusSnap.wheelDeltaPercentage - 0.02) < 1e-9;
    // reset → target 원점 복원.
    await page.evaluate(() => window.__simStore.getState().setSelectedBody(null));
    await page.waitForTimeout(SETTLE_MS);
    const resetSnap = await page.evaluate(() => {
      const solar = window.__solarScene;
      const cam = solar?.meshes?.values().next().value?.getScene()?.activeCamera;
      const t = cam?.target;
      return { targetDist: t ? Math.hypot(t.x, t.y, t.z) : null, panning: cam?.panningSensibility };
    });
    const resetOk =
      resetSnap.targetDist !== null && resetSnap.targetDist < 1 && resetSnap.panning === 0;
    const pass = focusPanningOff && zoomPreserved && resetOk;
    console.log(
      `  focus panning=${focusSnap.panningSensibility}(=0 ${focusPanningOff}) zoom유지=${focusSnap.wheelDeltaPercentage}(=0.02 ${zoomPreserved}) | reset targetDist=${resetSnap.targetDist?.toFixed(2)} panning=${resetSnap.panning}(원복 ${resetOk}) → ${pass ? 'PASS' : 'FAIL'}`,
    );
    return { scenario: 'S4', focusSnap, resetSnap, focusPanningOff, zoomPreserved, resetOk, pass };
  } finally {
    await ctx.close();
  }
}

async function main() {
  console.log('\n=== #704 free-fly 감도 설정 회귀 가드 ===');
  console.log(`  base URL: ${BASE_URL}`);
  const browser = await chromium.launch({ headless: true });
  const result = { timestamp: new Date().toISOString(), baseUrl: BASE_URL, scenarios: {} };
  let allPass = true;
  try {
    result.scenarios.s1 = await scenarioRuntimeApply(browser);
    if (!result.scenarios.s1.pass) allPass = false;
    result.scenarios.s2 = await scenarioResetDefaults(browser);
    if (!result.scenarios.s2.pass) allPass = false;
    result.scenarios.s3 = await scenarioPersistence(browser);
    if (!result.scenarios.s3.pass) allPass = false;
    result.scenarios.s4 = await scenarioNoRegression(browser);
    if (!result.scenarios.s4.pass) allPass = false;
  } finally {
    await browser.close();
  }
  console.log('\n=== 최종 요약 ===');
  for (const [k, s] of Object.entries(result.scenarios))
    console.log(`  ${k}: ${s.pass ? 'PASS' : 'FAIL'}`);
  console.log(`  overall: ${allPass ? 'PASS' : 'FAIL'}`);
  if (flags.json) {
    console.log('\n--- JSON ---');
    console.log(JSON.stringify(result, null, 2));
  }
  process.exit(allPass ? 0 : 1);
}
main().catch((err) => {
  console.error(err);
  process.exit(2);
});
