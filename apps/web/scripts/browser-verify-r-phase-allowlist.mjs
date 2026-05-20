#!/usr/bin/env node
/**
 * #402 R-Phase Body Focus Allowlist 회귀 가드.
 *
 * ADR `docs/decisions/20260504-r-phase-allowlist-guard.md` §결정 4 (DoD-4 회귀 가드 + CI 통합).
 * #415 Amendment — `docs/decisions/20260504-415-url-sync-guard.md` §결정 3 (시나리오 4 매트릭스).
 * #403 Amendment — `docs/decisions/20260506-403-r-phase-ui-guard.md` §결정 §browser-verify 시나리오 확장 (시나리오 5 매트릭스).
 * #404 Amendment — `docs/decisions/20260508-404-scenario-presets-r-phase-guard.md` §결정 §browser-verify 시나리오 6 박제 (시나리오 6 매트릭스).
 *
 * 검증 매트릭스:
 *   1. allowlist 박제 body (sun / mercury / venus): shortcut 버튼 활성 (disabled 아님)
 *   2. allowlist 외 body (earth / jupiter / neptune): shortcut 버튼 disabled / aria-disabled / data-r-phase-disabled
 *   3. 강제 click 시뮬레이션 — disabled 버튼 click 후 selectedBodyId 변화 0 / camera radius 변화 0
 *   4. URL 직접 진입 매트릭스 (#415 — store mutation 측면 가드, 3번째 방어선):
 *      - 4-A 차단: ?focus=earth / jupiter / neptune → selectedBodyId === null + camera radius 변화 0
 *      - 4-B 정상: ?focus=sun / mercury / venus → selectedBodyId === <body> (R1 #329 / R2 #361 / R3 #369 회귀 보호)
 *      - 4-C 무효: ?focus=invalid → selectedBodyId === null (기존 R1 가드 회귀 보호)
 *   5. CelestialTree + InfoPanel UI 가드 (#403 — UI 측면 2번째 축, defense-in-depth):
 *      - 5-A 정상 (CelestialTree): tree-sun click → selectedBodyId === 'sun' + info-panel 정상 분기 렌더
 *      - 5-B 차단 (CelestialTree): tree-earth/jupiter/neptune disabled / aria-disabled / data-r-phase-disabled,
 *        force click 시 store / camera 변화 0
 *      - 5-C 차단 (InfoPanel): URL `?focus=earth` → url-sync 가드 작동 (#415) → selectedBody 변화 0,
 *        하지만 외부 경로로 set 시 info-panel-r-phase-blocked 분기 노출 검증 (programmatic mutation)
 *   6. ScenarioPresets UI 가드 (#404 — UI 측면 3번째 축, defense-in-depth):
 *      - 6-A 정상 (sun-half): preset-sun-half disabled 부재 / aria-disabled='false' / data-r-phase-disabled='false',
 *        click 시 physicsEngine='newton' + massMultipliers={sun:0.5} 정상 동작
 *      - 6-B 차단 (jupiter-x10): preset-jupiter-x10 disabled / aria-disabled='true' / data-r-phase-disabled='true' /
 *        title='R-Phase 진행 시 활성', force click 시 store mutation 호출 0 (physicsEngine/massMultipliers 변화 0)
 *      - 6-C 차단 (no-jupiter): 동일 (jupiter R6 미구현)
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

/**
 * #415 — URL 직접 진입 매트릭스 (store mutation 측면 가드, 3번째 방어선).
 *
 * ADR `docs/decisions/20260504-415-url-sync-guard.md` §결정 3 (DoD-2).
 *
 * 각 body 마다 새 페이지로 `?focus=<body>` 진입 후:
 *   - allowlist 외 (earth / jupiter / neptune): selectedBodyId === null (url-sync 가드 작동)
 *   - allowlist 박제 (sun / mercury / venus): selectedBodyId === <body> (정상 회귀 보호)
 *   - invalid: selectedBodyId === null (기존 R1 가드 회귀 보호)
 *
 * 매 case 마다 새 page 생성 — initialized.current useRef 를 우회하기 위해.
 */
async function verifyUrlDirectEntry(browser) {
  const cases = [
    // 4-A 차단 — R-Phase 외 body URL 직접 진입 시 가드 작동.
    { focus: 'earth', expected: null, label: '4-A 차단' },
    { focus: 'jupiter', expected: null, label: '4-A 차단' },
    { focus: 'neptune', expected: null, label: '4-A 차단' },
    // 4-B 정상 — R-Phase 박제 body 는 정상 진입 (회귀 보호).
    { focus: 'sun', expected: 'sun', label: '4-B 정상' },
    { focus: 'mercury', expected: 'mercury', label: '4-B 정상' },
    { focus: 'venus', expected: 'venus', label: '4-B 정상' },
    // 4-C 무효 — 기존 R1 가드 회귀 보호.
    { focus: 'invalid-body-id', expected: null, label: '4-C 무효' },
  ];

  const results = [];

  for (const c of cases) {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    const url = `${BASE_URL}${BASE_URL.includes('?') ? '&' : '?'}focus=${encodeURIComponent(c.focus)}`;

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
      await page.waitForFunction(
        () =>
          typeof window.__simStore !== 'undefined' &&
          typeof window.__solarScene !== 'undefined' &&
          typeof window.__simCore !== 'undefined',
        { timeout: 30_000 },
      );
      // url-sync useEffect 발화 + 가드 통과 시 store mutation propagation 대기.
      await page.waitForTimeout(POST_INIT_WAIT_MS);

      const selectedBodyId = await page.evaluate(
        () => window.__simStore?.getState?.()?.selectedBodyId ?? null,
      );

      // #418 — 가드 거부 (4-A / 4-C) 시 URL 자동 제거 (replaceState) 단언.
      // 가드 통과 (4-B) 는 URL focus 보존 (사용자 의도 정합).
      const urlFocusAfter = await page.evaluate(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('focus');
      });
      const expectsUrlCleared = c.expected === null;
      const urlPass = expectsUrlCleared ? urlFocusAfter === null : urlFocusAfter === c.focus;

      const pass = selectedBodyId === c.expected && urlPass;
      results.push({ ...c, selectedBodyId, urlFocusAfter, urlPass, pass });
    } catch (err) {
      results.push({ ...c, selectedBodyId: 'ERROR', pass: false, error: String(err) });
    } finally {
      await context.close();
    }
  }

  return results;
}

/**
 * #403 — CelestialTree + InfoPanel UI 가드 (defense-in-depth UI 측면 2번째 축).
 *
 * ADR `docs/decisions/20260506-403-r-phase-ui-guard.md` §결정 §browser-verify 시나리오 확장.
 *
 * 5-A 정상 (CelestialTree): allowlist 박제 body click → selectedBodyId 정상 set + info-panel 정상 분기
 * 5-B 차단 (CelestialTree): allowlist 외 body 항목 disabled / aria-disabled / data-r-phase-disabled,
 *                          force click 시 selectedBodyId / camera radius 변화 0
 * 5-C 차단 (InfoPanel): allowlist 외 body 가 selectedBody 로 set 된 경우 info-panel-r-phase-blocked 분기 렌더.
 *                       store 직접 mutation (`window.__simStore.setState`) 으로 외부 경로 시뮬레이션 —
 *                       url-sync 가드 (#415) / scene 가드 (#402) 통과 후 panel 잔존 가드 검증.
 */
async function verifyTreePanelGuards(browser) {
  const results = [];
  const { context, page } = await setupPage(browser);

  try {
    // CelestialTree / CelestialInfoPanel 은 `mode === 'research' || 'sandbox'` 에서만 렌더 (side-panels.tsx 14).
    // 기본 모드 'observe' 에서는 panel 미노출 → 'research' 모드로 전환 후 검증.
    await page.evaluate(() => {
      window.__simStore?.setState?.({ mode: 'research' });
    });
    await page.waitForTimeout(POST_INIT_WAIT_MS);
    // panel 마운트 + framer-motion 애니메이션 (250ms) 완료 대기.
    await page.waitForSelector('[data-testid="celestial-tree"]', { timeout: 10_000 });

    // 5-A 정상 (CelestialTree): allowlist 박제 body click → 정상 panel 노출.
    for (const body of RPHASE_EXPECTED_ENABLED) {
      const selector = `[data-testid="tree-${body}"]`;
      const btn = await page.locator(selector).first();
      const isDisabled = await btn.evaluate((el) => el.hasAttribute('disabled'));
      await btn.click();
      await page.waitForTimeout(POST_CLICK_WAIT_MS);

      const selectedBodyId = await page.evaluate(
        () => window.__simStore?.getState?.()?.selectedBodyId ?? null,
      );
      const panelEmpty = await page.locator('[data-testid="info-panel-empty"]').count();
      const panelBlocked = await page.locator('[data-testid="info-panel-r-phase-blocked"]').count();
      const panelNormal = await page.locator('[data-testid="info-panel"]').count();

      const pass =
        !isDisabled &&
        selectedBodyId === body &&
        panelNormal === 1 &&
        panelEmpty === 0 &&
        panelBlocked === 0;
      results.push({
        scenario: '5-A 정상 (CelestialTree)',
        body,
        isDisabled,
        selectedBodyId,
        panelNormal,
        panelBlocked,
        pass,
      });

      // reset 으로 초기화 후 다음 body.
      await page.locator('[data-testid="focus-reset"]').click();
      await page.waitForTimeout(POST_CLICK_WAIT_MS);
    }

    // 5-B 차단 (CelestialTree): allowlist 외 body 항목 disabled + force click 무시.
    for (const body of RPHASE_EXPECTED_DISABLED) {
      const selector = `[data-testid="tree-${body}"]`;
      const btn = await page.locator(selector).first();
      const isDisabled = await btn.evaluate((el) => el.hasAttribute('disabled'));
      const ariaDisabled = await btn.getAttribute('aria-disabled');
      const dataDisabled = await btn.getAttribute('data-r-phase-disabled');
      const title = await btn.getAttribute('title');

      // 강제 click — disabled 우회 (Playwright `force: true`).
      const before = await page.evaluate(() => {
        const store = window.__simStore?.getState?.();
        const scene = window.__solarScene?.meshes?.get?.('sun')?.getScene?.();
        const camera = scene?.activeCamera;
        return {
          selectedBodyId: store?.selectedBodyId ?? null,
          camRadius: camera?.radius ?? null,
        };
      });
      await page.locator(selector).click({ force: true });
      await page.waitForTimeout(POST_CLICK_WAIT_MS);
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
      const radiusDiff =
        before.camRadius !== null && after.camRadius !== null
          ? Math.abs(before.camRadius - after.camRadius)
          : 0;
      const radiusChanged = radiusDiff > 1e-3;

      const pass =
        isDisabled &&
        ariaDisabled === 'true' &&
        dataDisabled === 'true' &&
        title !== null &&
        title.includes('R-Phase') &&
        !selectedChanged &&
        !radiusChanged;
      results.push({
        scenario: '5-B 차단 (CelestialTree)',
        body,
        isDisabled,
        ariaDisabled,
        dataDisabled,
        titleHasRPhase: title !== null && title.includes('R-Phase'),
        selectedChanged,
        radiusDiff,
        pass,
      });
    }

    // 5-C 차단 (InfoPanel): store 직접 mutation 으로 외부 경로 시뮬레이션 — info-panel-r-phase-blocked 분기 렌더.
    for (const body of RPHASE_EXPECTED_DISABLED) {
      // 외부 경로 시뮬레이션 — store mutation 직접 (url-sync 가드 / scene 가드 모두 우회).
      // info-panel 잔존 가드만 격리 검증 (defense-in-depth UI 측면 2번째 축).
      await page.evaluate((b) => {
        window.__simStore?.setState?.({ selectedBodyId: b });
      }, body);
      await page.waitForTimeout(POST_CLICK_WAIT_MS);

      const panelBlocked = await page.locator('[data-testid="info-panel-r-phase-blocked"]').count();
      const panelNormal = await page.locator('[data-testid="info-panel"]').count();
      const blockedText = panelBlocked
        ? await page.locator('[data-testid="info-panel-r-phase-blocked"]').textContent()
        : '';

      const pass =
        panelBlocked === 1 && panelNormal === 0 && (blockedText ?? '').includes('R-Phase');
      results.push({
        scenario: '5-C 차단 (InfoPanel)',
        body,
        panelBlocked,
        panelNormal,
        blockedTextHasRPhase: (blockedText ?? '').includes('R-Phase'),
        pass,
      });

      // reset.
      await page.evaluate(() => {
        window.__simStore?.setState?.({ selectedBodyId: null });
      });
      await page.waitForTimeout(POST_CLICK_WAIT_MS);
    }
  } finally {
    await context.close();
  }

  return results;
}

/**
 * #404 — ScenarioPresets UI 가드 (defense-in-depth UI 측면 3번째 축).
 *
 * ADR `docs/decisions/20260508-404-scenario-presets-r-phase-guard.md` §결정 §browser-verify 시나리오 6 박제.
 *
 * 6-A 정상 (sun-half): R1 박제 sun → preset 활성, click 시 physicsEngine='newton' + massMultipliers={sun:0.5} 정상 동작
 * 6-B 차단 (jupiter-x10): R6 미구현 jupiter → preset disabled + a11y 4축 박제, force click 시 store mutation 호출 0
 * 6-C 차단 (no-jupiter): 동일 (jupiter R6 미구현)
 *
 * mode-gated 컴포넌트 mount precondition (#403 학습): ScenarioPresets 는
 * `mode === 'research' || 'sandbox'` 에서만 렌더 (side-panels.tsx 14) →
 * 검증 시 mode='research' 전환 + framer-motion 애니메이션 (250ms) 완료 대기.
 */
async function verifyScenarioPresetsGuards(browser) {
  const results = [];
  const { context, page } = await setupPage(browser);

  try {
    // ScenarioPresets 는 `mode === 'research' || 'sandbox'` 에서만 렌더 → 'research' 모드로 전환.
    await page.evaluate(() => {
      window.__simStore?.setState?.({ mode: 'research' });
    });
    await page.waitForTimeout(POST_INIT_WAIT_MS);
    await page.waitForSelector('[data-testid="scenario-presets"]', { timeout: 10_000 });

    // 6-A 정상 (sun-half): R1 박제 sun → preset 활성, click 시 정상 동작.
    {
      const selector = '[data-testid="preset-sun-half"]';
      const btn = page.locator(selector).first();
      const isDisabled = await btn.evaluate((el) => el.hasAttribute('disabled'));
      const ariaDisabled = await btn.getAttribute('aria-disabled');
      const dataDisabled = await btn.getAttribute('data-r-phase-disabled');
      const title = await btn.getAttribute('title');

      // store 초기 상태 측정 + reset (이전 시나리오 잔재 제거).
      await page.evaluate(() => {
        window.__simStore?.setState?.({
          physicsEngine: 'kepler',
          massMultipliers: {},
        });
      });
      await page.waitForTimeout(POST_CLICK_WAIT_MS);

      await btn.click();
      await page.waitForTimeout(POST_CLICK_WAIT_MS);

      const after = await page.evaluate(() => {
        const s = window.__simStore?.getState?.();
        return {
          physicsEngine: s?.physicsEngine ?? null,
          massMultipliers: s?.massMultipliers ?? null,
        };
      });

      const pass =
        !isDisabled &&
        ariaDisabled === 'false' &&
        dataDisabled === 'false' &&
        title === null &&
        after.physicsEngine === 'newton' &&
        after.massMultipliers?.sun === 0.5;
      results.push({
        scenario: '6-A 정상 (sun-half)',
        preset: 'sun-half',
        isDisabled,
        ariaDisabled,
        dataDisabled,
        title,
        physicsEngineAfter: after.physicsEngine,
        massSunAfter: after.massMultipliers?.sun ?? null,
        pass,
      });
    }

    // 6-B / 6-C 차단 (jupiter-x10 / no-jupiter): R6 미구현 jupiter → disabled + force click 무시.
    for (const presetId of ['jupiter-x10', 'no-jupiter']) {
      const selector = `[data-testid="preset-${presetId}"]`;
      const btn = page.locator(selector).first();
      const isDisabled = await btn.evaluate((el) => el.hasAttribute('disabled'));
      const ariaDisabled = await btn.getAttribute('aria-disabled');
      const dataDisabled = await btn.getAttribute('data-r-phase-disabled');
      const title = await btn.getAttribute('title');

      // store 초기 상태 reset (sun-half 잔재 제거).
      await page.evaluate(() => {
        window.__simStore?.setState?.({
          physicsEngine: 'kepler',
          massMultipliers: {},
        });
      });
      await page.waitForTimeout(POST_CLICK_WAIT_MS);

      const before = await page.evaluate(() => {
        const s = window.__simStore?.getState?.();
        return {
          physicsEngine: s?.physicsEngine ?? null,
          massMultipliers: { ...(s?.massMultipliers ?? {}) },
        };
      });

      // 강제 click — disabled 우회 (Playwright `force: true`).
      await btn.click({ force: true });
      await page.waitForTimeout(POST_CLICK_WAIT_MS);

      const after = await page.evaluate(() => {
        const s = window.__simStore?.getState?.();
        return {
          physicsEngine: s?.physicsEngine ?? null,
          massMultipliers: { ...(s?.massMultipliers ?? {}) },
        };
      });

      const engineUnchanged = before.physicsEngine === after.physicsEngine;
      const massUnchanged =
        JSON.stringify(before.massMultipliers) === JSON.stringify(after.massMultipliers);

      const scenario =
        presetId === 'jupiter-x10' ? '6-B 차단 (jupiter-x10)' : '6-C 차단 (no-jupiter)';
      const pass =
        isDisabled &&
        ariaDisabled === 'true' &&
        dataDisabled === 'true' &&
        title === 'R-Phase 진행 시 활성' &&
        engineUnchanged &&
        massUnchanged;
      results.push({
        scenario,
        preset: presetId,
        isDisabled,
        ariaDisabled,
        dataDisabled,
        title,
        engineUnchanged,
        massUnchanged,
        pass,
      });
    }
  } finally {
    await context.close();
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

    // 4. URL 직접 진입 매트릭스 (#415 — store mutation 측면 가드, 3번째 방어선)
    console.log(
      '\n4) URL 직접 진입 매트릭스 (#415 — store mutation 가드, 3번째 방어선 + #418 URL 자동 제거)\n',
    );
    const urlEntryResults = await verifyUrlDirectEntry(browser);
    for (const r of urlEntryResults) {
      const status = r.pass ? 'PASS' : 'FAIL';
      const expectedStr = r.expected === null ? 'null' : r.expected;
      // #418 — URL 자동 제거 단언 추가 (가드 거부 시 ?focus= 파라미터 제거).
      const urlStr = r.urlFocusAfter === null ? 'null' : r.urlFocusAfter;
      const urlExp = r.expected === null ? 'null' : r.focus;
      console.log(
        `   ${r.label}  ?focus=${r.focus.padEnd(18)} → selectedBodyId=${String(r.selectedBodyId).padEnd(10)} (expected=${expectedStr}) ` +
          `urlFocusAfter=${String(urlStr).padEnd(10)} (expected=${urlExp})  ${status}`,
      );
      if (!r.pass) allPass = false;
    }

    // 5. CelestialTree + InfoPanel UI 가드 (#403 — UI 측면 2번째 축, defense-in-depth)
    console.log('\n5) CelestialTree + InfoPanel UI 가드 (#403 — UI 측면 2번째 축)\n');
    const treePanelResults = await verifyTreePanelGuards(browser);
    for (const r of treePanelResults) {
      const status = r.pass ? 'PASS' : 'FAIL';
      console.log(`   ${r.scenario.padEnd(28)} body=${r.body.padEnd(10)} ${status}`);
      if (!r.pass) {
        // 디버그용 raw 출력.
        console.log(`      raw: ${JSON.stringify(r)}`);
        allPass = false;
      }
    }

    // 6. ScenarioPresets UI 가드 (#404 — UI 측면 3번째 축, defense-in-depth)
    console.log('\n6) ScenarioPresets UI 가드 (#404 — UI 측면 3번째 축)\n');
    const presetResults = await verifyScenarioPresetsGuards(browser);
    for (const r of presetResults) {
      const status = r.pass ? 'PASS' : 'FAIL';
      console.log(`   ${r.scenario.padEnd(28)} preset=${r.preset.padEnd(14)} ${status}`);
      if (!r.pass) {
        // 디버그용 raw 출력.
        console.log(`      raw: ${JSON.stringify(r)}`);
        allPass = false;
      }
    }
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
