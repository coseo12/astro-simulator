#!/usr/bin/env node
/**
 * #402 R-Phase Body Focus Allowlist 회귀 가드.
 *
 * ADR `docs/decisions/20260504-r-phase-allowlist-guard.md` §결정 4 (DoD-4 회귀 가드 + CI 통합).
 *
 * 검증 매트릭스:
 *   1. allowlist 박제 body (sun / mercury / venus): shortcut 버튼 활성 (disabled 아님)
 *   2. allowlist 외 body (earth / jupiter / neptune): shortcut 버튼 disabled / aria-disabled / data-r-phase-disabled
 *   3. 강제 click 시뮬레이션 — disabled 버튼 click 후 selectedBodyId 변화 0 / camera radius 변화 0
 *
 * R-Phase 진입 시 expected list 갱신 의무 (ADR §결정 4):
 *   - R4 (earth) 진입 시 RPHASE_EXPECTED_ENABLED 에 'earth' 이동
 *   - R6 (mars) 진입 시 추가
 *   - 기타 R-Phase 동일
 *
 * 사용법:
 *   node apps/web/scripts/browser-verify-r-phase-allowlist.mjs
 *   BASE_URL=http://localhost:3000/ko node apps/web/scripts/browser-verify-r-phase-allowlist.mjs
 *
 * dev 빌드 의존: `window.__simStore` / `window.__solarScene` / `window.__simCore` (sim-canvas.tsx).
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000/ko';

/**
 * 현재 R-Phase 박제값 (R1 sun + R2 mercury + R3 venus).
 * R-Phase 진입 시 이 리스트 갱신 의무 박제 (ADR §결정 4 항목 3).
 *
 * SSoT: packages/core/src/scene/r-phase-allowlist.ts `R_PHASE_BODY_ALLOWLIST`.
 */
const RPHASE_EXPECTED_ENABLED = ['sun', 'mercury', 'venus'];
const RPHASE_EXPECTED_DISABLED = ['earth', 'jupiter', 'neptune'];

const VIEWPORT = { width: 1280, height: 800 };
const POST_INIT_WAIT_MS = 1500;
const POST_CLICK_WAIT_MS = 800;

async function setupPage(browser) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForFunction(
    () =>
      typeof window.__simStore !== 'undefined' &&
      typeof window.__solarScene !== 'undefined' &&
      typeof window.__simCore !== 'undefined',
    { timeout: 30_000 },
  );
  await page.waitForTimeout(POST_INIT_WAIT_MS);
  return { context, page };
}

/**
 * 버튼 disabled 상태 검증.
 *
 * 단언:
 *   - allowlist 박제 body 는 [data-testid=focus-<id>] 가 disabled 아님 + aria-disabled='false' + data-r-phase-disabled='false'
 *   - allowlist 외 body 는 disabled + aria-disabled='true' + data-r-phase-disabled='true'
 */
async function verifyButtonStates(page) {
  const results = [];

  for (const body of RPHASE_EXPECTED_ENABLED) {
    const selector = `[data-testid="focus-${body}"]`;
    const btn = await page.locator(selector).first();
    const isDisabled = await btn.evaluate((el) => el.hasAttribute('disabled'));
    const ariaDisabled = await btn.getAttribute('aria-disabled');
    const dataDisabled = await btn.getAttribute('data-r-phase-disabled');
    const pass = !isDisabled && ariaDisabled === 'false' && dataDisabled === 'false';
    results.push({
      body,
      expected: 'enabled',
      isDisabled,
      ariaDisabled,
      dataDisabled,
      pass,
    });
  }

  for (const body of RPHASE_EXPECTED_DISABLED) {
    const selector = `[data-testid="focus-${body}"]`;
    const btn = await page.locator(selector).first();
    const isDisabled = await btn.evaluate((el) => el.hasAttribute('disabled'));
    const ariaDisabled = await btn.getAttribute('aria-disabled');
    const dataDisabled = await btn.getAttribute('data-r-phase-disabled');
    const pass = isDisabled && ariaDisabled === 'true' && dataDisabled === 'true';
    results.push({
      body,
      expected: 'disabled',
      isDisabled,
      ariaDisabled,
      dataDisabled,
      pass,
    });
  }

  return results;
}

/**
 * 강제 click 시 store / camera 변화 0 검증 (defense-in-depth scene 측면 가드).
 *
 * Playwright 의 `force: true` 로 HTML disabled 우회 click → simulation-core focusOn 가드가 차단해야 함.
 * 단언:
 *   - selectedBodyId 변화 0 (null 유지)
 *   - camera.radius 변화 0 (focus 전후 동일)
 */
async function verifyDisabledClickIgnored(page) {
  const results = [];

  for (const body of RPHASE_EXPECTED_DISABLED) {
    // 초기 상태 측정.
    const before = await page.evaluate(() => {
      const store = window.__simStore?.getState?.();
      const scene = window.__solarScene?.meshes?.get?.('sun')?.getScene?.();
      const camera = scene?.activeCamera;
      return {
        selectedBodyId: store?.selectedBodyId ?? null,
        camRadius: camera?.radius ?? null,
      };
    });

    // 강제 click — disabled 우회 (Playwright `force: true`).
    const selector = `[data-testid="focus-${body}"]`;
    await page.locator(selector).click({ force: true });
    await page.waitForTimeout(POST_CLICK_WAIT_MS);

    // 사후 상태 측정.
    const after = await page.evaluate(() => {
      const store = window.__simStore?.getState?.();
      const scene = window.__solarScene?.meshes?.get?.('sun')?.getScene?.();
      const camera = scene?.activeCamera;
      return {
        selectedBodyId: store?.selectedBodyId ?? null,
        camRadius: camera?.radius ?? null,
      };
    });

    const selectedChanged = before.selectedBodyId !== after.selectedBodyId;
    // camera radius 는 미세한 부동소수점 변화 허용 (1e-3).
    const radiusDiff =
      before.camRadius !== null && after.camRadius !== null
        ? Math.abs(before.camRadius - after.camRadius)
        : 0;
    const radiusChanged = radiusDiff > 1e-3;
    const pass = !selectedChanged && !radiusChanged;
    results.push({
      body,
      before,
      after,
      selectedChanged,
      radiusDiff,
      pass,
    });
  }

  return results;
}

/**
 * 활성 버튼 정상 동작 smoke (sun / mercury / venus).
 *
 * 단언: focus click → selectedBodyId === body. 정상 동작 회귀 가드.
 */
async function verifyEnabledClickWorks(page) {
  const results = [];

  for (const body of RPHASE_EXPECTED_ENABLED) {
    const selector = `[data-testid="focus-${body}"]`;
    await page.locator(selector).click();
    await page.waitForTimeout(POST_CLICK_WAIT_MS);

    const state = await page.evaluate(() => {
      const store = window.__simStore?.getState?.();
      return store?.selectedBodyId ?? null;
    });

    const pass = state === body;
    results.push({ body, selectedBodyId: state, pass });

    // reset 으로 초기화 후 다음 body.
    await page.locator('[data-testid="focus-reset"]').click();
    await page.waitForTimeout(POST_CLICK_WAIT_MS);
  }

  return results;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  let allPass = true;

  try {
    const { context, page } = await setupPage(browser);

    console.log('\n=== #402 R-Phase Allowlist 가드 회귀 검증 ===\n');

    // 1. 버튼 상태 매트릭스
    console.log('1) 버튼 disabled / aria-disabled / data-r-phase-disabled 매트릭스\n');
    const buttonResults = await verifyButtonStates(page);
    for (const r of buttonResults) {
      const status = r.pass ? 'PASS' : 'FAIL';
      console.log(
        `   ${r.body.padEnd(10)} expected=${r.expected.padEnd(8)} disabled=${r.isDisabled}  aria=${r.ariaDisabled}  data=${r.dataDisabled}  ${status}`,
      );
      if (!r.pass) allPass = false;
    }

    // 2. 활성 버튼 정상 동작 smoke
    console.log('\n2) 활성 버튼 (sun / mercury / venus) focusOn 정상 동작 smoke\n');
    const enabledResults = await verifyEnabledClickWorks(page);
    for (const r of enabledResults) {
      const status = r.pass ? 'PASS' : 'FAIL';
      console.log(`   ${r.body.padEnd(10)} → selectedBodyId=${r.selectedBodyId}  ${status}`);
      if (!r.pass) allPass = false;
    }

    // 3. 강제 click 무시 (defense-in-depth scene 측면 가드)
    console.log('\n3) disabled 버튼 강제 click 시 store/camera 변화 0 (scene-level 가드)\n');
    const disabledClickResults = await verifyDisabledClickIgnored(page);
    for (const r of disabledClickResults) {
      const status = r.pass ? 'PASS' : 'FAIL';
      console.log(
        `   ${r.body.padEnd(10)} selectedΔ=${r.selectedChanged}  radiusΔ=${r.radiusDiff.toFixed(4)}  ${status}`,
      );
      if (!r.pass) allPass = false;
    }

    await context.close();
  } finally {
    await browser.close();
  }

  console.log('\n=== 최종 요약 ===');
  console.log(`  overall: ${allPass ? 'PASS' : 'FAIL'}`);

  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error('\n  FATAL:', err);
  process.exit(2);
});
