#!/usr/bin/env node
/**
 * #402 R-Phase Body Focus Allowlist 회귀 가드.
 *
 * ADR `docs/decisions/20260504-r-phase-allowlist-guard.md` §결정 4 (DoD-4 회귀 가드 + CI 통합).
 * #415 Amendment — `docs/decisions/20260504-415-url-sync-guard.md` §결정 3 (시나리오 4 매트릭스).
 * #403 Amendment — `docs/decisions/20260506-403-r-phase-ui-guard.md` §결정 §browser-verify 시나리오 확장 (시나리오 5 매트릭스).
 * #404 Amendment — `docs/decisions/20260508-404-scenario-presets-r-phase-guard.md` §결정 §browser-verify 시나리오 6 박제 (시나리오 6 매트릭스).
 *
 * 검증 매트릭스 (R10a #659 — 왜소행성 5 진입 후, 첫 비-행성 라운드):
 *   1. allowlist 박제 body (sun ~ pluto 11개): shortcut 버튼 활성 (disabled 아님)
 *      — satellite (galilean/titan/titania/triton) + ceres/haumea/makemake/eris 는 showInShortcutBar=false 라 bar 미등록 → 본 매트릭스 비대상 (4-B URL 진입 검증).
 *   2. allowlist 외 body shortcut negative: R9 진입으로 FOCUS_BUTTONS 의 disabled 대상 구조 소멸 (R10a 미등록 4 + R10b 혜성 3 전부 bar 미등록)
 *      — negative 는 URL 4-A (halley) + CelestialTree 5-B/5-C (halley) + preset 6-H (halley-x10) 가 보존
 *   3. 강제 click 시뮬레이션 — disabled 버튼 click 후 selectedBodyId 변화 0 / camera radius 변화 0 (시나리오 2 와 동일 사유로 R9 에선 skip)
 *   4. URL 직접 진입 매트릭스 (#415 — store mutation 측면 가드, 3번째 방어선):
 *      - 4-A 차단: ?focus=halley (R10b — phase 11) → selectedBodyId === null + camera radius 변화 0 (R10a #659 — pluto positive 전환으로 halley 교체, ADR §축 4)
 *      - 4-B 정상: ?focus=sun / mercury / venus / earth / moon / mars / phobos / deimos / jupiter / io / europa /
 *        ganymede / callisto → selectedBodyId === <body> (R1~R6 회귀 보호. R7+ body 전수 focus 진입은
 *        browser-verify-378-focus.mjs FOCUS_BODIES 24 body 가 커버 — R7~R10a 선례 답습)
 *      - 4-C 무효: ?focus=invalid → selectedBodyId === null (기존 R1 가드 회귀 보호)
 *   5. CelestialTree + InfoPanel UI 가드 (#403 — UI 측면 2번째 축, defense-in-depth):
 *      - 5-A 정상 (CelestialTree): tree-sun click → selectedBodyId === 'sun' + info-panel 정상 분기 렌더
 *      - 5-B 차단 (CelestialTree): tree-halley disabled / aria-disabled / data-r-phase-disabled,
 *        force click 시 store / camera 변화 0 (tree 는 전체 body 렌더 — R10b 혜성이 negative, R10a #659 교체)
 *      - 5-C 차단 (InfoPanel): 외부 경로로 set 시 info-panel-r-phase-blocked 분기 노출 검증 (programmatic mutation)
 *   6. ScenarioPresets UI 가드 (#404 — UI 측면 3번째 축, defense-in-depth):
 *      - 6-A 정상 (sun-half): preset-sun-half disabled 부재 / aria-disabled='false' / data-r-phase-disabled='false',
 *        click 시 physicsEngine='newton' + massMultipliers={sun:0.5} 정상 동작
 *      - 6-B 정상 (jupiter-x10): R6 #621 진입으로 jupiter allowlist 포함 → zero-touch 자동 enabled.
 *        disabled 부재 / aria-disabled='false' / data-r-phase-disabled='false', click 시 massMultipliers={jupiter:10} 정상 동작
 *      - 6-C 정상 (no-jupiter): 동일 (jupiter R6 #621 진입 → enabled, massMultipliers={jupiter:0.01})
 *      - 6-D 정상 (saturn-x10): R7 #641 진입 saturn → zero-touch 자동 enabled (massMultipliers={saturn:10})
 *      - 6-E 정상 (uranus-x10): R8 #647 진입 uranus → zero-touch 자동 enabled (massMultipliers={uranus:10})
 *      - 6-F 정상 (neptune-x10): R9 #653 진입 neptune → zero-touch 자동 enabled (massMultipliers={neptune:10}, Concrete Prediction 재현 4번째)
 *      - 6-G 정상 (pluto-x10): R10a #659 진입 pluto → zero-touch 자동 enabled (massMultipliers={pluto:10}, Concrete Prediction 재현 5번째)
 *      - 6-H 차단 (halley-x10): R10b 미진입 halley (phase 11) → preset disabled (negative 케이스 교체 보존 — R6 saturn-x10 / R7 uranus-x10 / R8 neptune-x10 / R9 pluto-x10 선례).
 *        disabled / aria-disabled='true' / data-r-phase-disabled='true' / title='R-Phase 진행 시 활성', force click 시 store mutation 0
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
 * 현재 R-Phase 박제값 (R1 sun + R2 mercury + R3 venus + R4 earth + moon + R5 mars + phobos + deimos).
 * R-Phase 진입 시 이 리스트 갱신 의무 박제 (ADR §결정 4 항목 3).
 *
 * SSoT: packages/core/src/scene/r-phase-allowlist.ts `R_PHASE_BODY_ALLOWLIST`.
 *
 * R4 #532 — earth + moon 동시 진입 (Q5=A 정합).
 * R5 #594 — mars + phobos + deimos 동시 진입 (Q1=B 정합, Q4a=A — phobos/deimos shortcut 미등록).
 * ADR: docs/decisions/20260520-r4-earth-moon-visualization.md §결정 R-Phase 갱신 절차.
 * ADR: docs/decisions/20260528-r5-mars-visualization.md §결정 7 + §결정 8.
 *
 * ⚠️ 검증 매트릭스 — focus-quick-buttons UI 만 검증 (shortcut bar 등록 대상). R5 Q4a=A 정합:
 *    phobos / deimos 는 shortcut bar 미등록 → 본 매트릭스 비대상.
 *    phobos/deimos R-Phase Allowlist 진입 검증은 4) URL 직접 진입 매트릭스 (4-B 정상) 에서 별도 박제.
 */
// R6 #621 — jupiter 진입 (CURRENT_R_PHASE=6) 시 disabled → enabled 전환. galilean 4 는
// showInShortcutBar=false 라 bar 미등록 (R5 phobos/deimos Q4a=A 답습) → 본 매트릭스 비대상.
// #617 정적 매칭 가드 (r-phase-allowlist.test.ts) 가 showInShortcutBar 파생과 정합 차단.
// R7 #641 — saturn 진입 (showInShortcutBar true 전환). titan 은 false (galilean 패턴) → 비대상.
// R8 #647 — uranus 진입 (showInShortcutBar true 전환). titania 는 false (galilean/titan 패턴) → 비대상.
// R9 #653 — neptune 진입 (CURRENT_R_PHASE=9, showInShortcutBar 이미 true — 배열 변경 0,
// #613 Concrete Prediction). triton 은 false (galilean/titan/titania 패턴) → 비대상.
// R10a #659 — pluto 진입 + showInShortcutBar true 승격 (PM Q3=A — pluto 만, 14버튼째).
// ceres/haumea/makemake/eris 는 false (focus 가능 + bar 미등록 — #617 직교 축 negative) → 비대상.
const RPHASE_EXPECTED_ENABLED = [
  'sun',
  'mercury',
  'venus',
  'earth',
  'moon',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
  'pluto',
];
// R9 #653 — 로드맵 마지막 행성 (neptune) 진입으로 FOCUS_BUTTONS 의 disabled 대상이 구조 소멸
// (R10a 미등록 4 + R10b 혜성 3 전부 showInShortcutBar=false 라 bar 미등록 — #624 tradeoff).
// shortcut bar negative 는 빈 배열 (시나리오 1/3 skip) — negative 케이스는 URL 4-A (halley) +
// CelestialTree 5-B/5-C (halley, 전체 body 렌더라 tree-halley 존재) + preset 6-H (halley-x10) 가 보존.
// R10a #659 — ceres/haumea/makemake/eris = "focus 가능 + bar 미등록" (#617 직교 축, parent=sun 첫 사례).
const RPHASE_SHORTCUT_EXPECTED_DISABLED = [];
// CelestialTree 는 getSolarSystem() 전체 body 를 렌더 → R10b 미진입 body (halley — phase 11) 가 tree negative.
// R10a #659 — pluto positive 전환으로 halley 교체 (encke/swift-tuttle 추가는 R10b architect 재량 — 대표 1 body).
const RPHASE_TREE_EXPECTED_DISABLED = ['halley'];

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

  for (const body of RPHASE_SHORTCUT_EXPECTED_DISABLED) {
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

  for (const body of RPHASE_SHORTCUT_EXPECTED_DISABLED) {
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
 * 활성 버튼 정상 동작 smoke (sun / mercury / venus / earth / moon / mars / jupiter — R6 #621 진입).
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
 *   - allowlist 외 (halley — R10b phase 11): selectedBodyId === null (url-sync 가드 작동, negative 케이스 보존)
 *   - allowlist 박제 (sun / mercury / venus / earth / moon / mars / phobos / deimos / jupiter / galilean 4):
 *     selectedBodyId === <body> (정상 회귀 보호)
 *   - invalid: selectedBodyId === null (기존 R1 가드 회귀 보호)
 *
 * 매 case 마다 새 page 생성 — initialized.current useRef 를 우회하기 위해.
 */
async function verifyUrlDirectEntry(browser) {
  const cases = [
    // 4-A 차단 — R-Phase 외 body URL 직접 진입 시 가드 작동 (R10a #659: pluto positive 전환 → halley(R10b phase 11) 로 교체 — negative 케이스 보존).
    { focus: 'halley', expected: null, label: '4-A 차단' },
    // 4-B 정상 — R-Phase 박제 body 는 정상 진입 (회귀 보호 + R4 earth/moon + R5 mars/phobos/deimos + R6 jupiter/galilean 진입 검증).
    { focus: 'sun', expected: 'sun', label: '4-B 정상' },
    { focus: 'mercury', expected: 'mercury', label: '4-B 정상' },
    { focus: 'venus', expected: 'venus', label: '4-B 정상' },
    { focus: 'earth', expected: 'earth', label: '4-B 정상 (R4 #532)' },
    { focus: 'moon', expected: 'moon', label: '4-B 정상 (R4 #532)' },
    { focus: 'mars', expected: 'mars', label: '4-B 정상 (R5 #594)' },
    { focus: 'phobos', expected: 'phobos', label: '4-B 정상 (R5 #594 satellite 2개 첫 본 사례)' },
    { focus: 'deimos', expected: 'deimos', label: '4-B 정상 (R5 #594 satellite 2개 첫 본 사례)' },
    { focus: 'jupiter', expected: 'jupiter', label: '4-B 정상 (R6 #621)' },
    { focus: 'io', expected: 'io', label: '4-B 정상 (R6 #621 galilean 4개 첫 본 사례)' },
    { focus: 'europa', expected: 'europa', label: '4-B 정상 (R6 #621 galilean 4개 첫 본 사례)' },
    {
      focus: 'ganymede',
      expected: 'ganymede',
      label: '4-B 정상 (R6 #621 galilean 4개 첫 본 사례)',
    },
    {
      focus: 'callisto',
      expected: 'callisto',
      label: '4-B 정상 (R6 #621 galilean 4개 첫 본 사례)',
    },
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
    for (const body of RPHASE_TREE_EXPECTED_DISABLED) {
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
    for (const body of RPHASE_TREE_EXPECTED_DISABLED) {
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
 * 6-B 정상 (jupiter-x10): R6 #621 진입 jupiter → zero-touch 자동 enabled, click 시 massMultipliers={jupiter:10} 정상 동작
 * 6-C 정상 (no-jupiter): 동일 (jupiter R6 #621 진입 → enabled, massMultipliers={jupiter:0.01})
 * 6-D 정상 (saturn-x10): R7 #641 진입 saturn → zero-touch 자동 enabled, click 시 massMultipliers={saturn:10} 정상 동작
 * 6-E 차단 (uranus-x10): R8 미진입 uranus → preset disabled + a11y 4축 박제, force click 시 store mutation 호출 0
 *                       (saturn 진입으로 6-D enabled → disabled-path negative 케이스 교체 보존용 uranus target preset)
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

    // 6-B / 6-C / 6-D / 6-E / 6-F 정상 (jupiter-x10 / no-jupiter / saturn-x10 / uranus-x10 / neptune-x10):
    // R6 #621 jupiter + R7 #641 saturn + R8 #647 uranus + R9 #653 neptune 진입 → zero-touch 자동 enabled.
    // jupiter-x10 → {jupiter:10}, no-jupiter → {jupiter:0.01}, saturn-x10 → {saturn:10},
    // uranus-x10 → {uranus:10}, neptune-x10 → {neptune:10} (Concrete Prediction 재현 4번째).
    const enabledPresetCases = [
      {
        presetId: 'jupiter-x10',
        massKey: 'jupiter',
        expectedMul: 10,
        scenario: '6-B 정상 (jupiter-x10)',
      },
      {
        presetId: 'no-jupiter',
        massKey: 'jupiter',
        expectedMul: 0.01,
        scenario: '6-C 정상 (no-jupiter)',
      },
      {
        presetId: 'saturn-x10',
        massKey: 'saturn',
        expectedMul: 10,
        scenario: '6-D 정상 (saturn-x10)',
      },
      {
        presetId: 'uranus-x10',
        massKey: 'uranus',
        expectedMul: 10,
        scenario: '6-E 정상 (uranus-x10)',
      },
      {
        presetId: 'neptune-x10',
        massKey: 'neptune',
        expectedMul: 10,
        scenario: '6-F 정상 (neptune-x10)',
      },
      {
        // R10a #659 — pluto 진입 → zero-touch 자동 enabled (Concrete Prediction 재현 5번째).
        presetId: 'pluto-x10',
        massKey: 'pluto',
        expectedMul: 10,
        scenario: '6-G 정상 (pluto-x10)',
      },
    ];
    for (const { presetId, massKey, expectedMul, scenario } of enabledPresetCases) {
      const selector = `[data-testid="preset-${presetId}"]`;
      const btn = page.locator(selector).first();
      const isDisabled = await btn.evaluate((el) => el.hasAttribute('disabled'));
      const ariaDisabled = await btn.getAttribute('aria-disabled');
      const dataDisabled = await btn.getAttribute('data-r-phase-disabled');
      const title = await btn.getAttribute('title');

      // store 초기 상태 reset (이전 시나리오 잔재 제거).
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
          massMultipliers: { ...(s?.massMultipliers ?? {}) },
        };
      });

      const pass =
        !isDisabled &&
        ariaDisabled === 'false' &&
        dataDisabled === 'false' &&
        title === null &&
        after.physicsEngine === 'newton' &&
        after.massMultipliers?.[massKey] === expectedMul;
      results.push({
        scenario,
        preset: presetId,
        isDisabled,
        ariaDisabled,
        dataDisabled,
        title,
        physicsEngineAfter: after.physicsEngine,
        massAfter: after.massMultipliers?.[massKey] ?? null,
        pass,
      });
    }

    // 6-H 차단 (halley-x10): R10b 미진입 halley (phase 11) → disabled + force click 무시.
    // pluto 진입 (R10a #659) 으로 6-G 가 enabled 되어 disabled-path 가드가 무력화되지 않도록
    // halley target preset 으로 negative 교체 보존 (R6 saturn-x10 / R7 uranus-x10 / R8 neptune-x10 / R9 pluto-x10 선례 답습).
    {
      const selector = '[data-testid="preset-halley-x10"]';
      const btn = page.locator(selector).first();
      const isDisabled = await btn.evaluate((el) => el.hasAttribute('disabled'));
      const ariaDisabled = await btn.getAttribute('aria-disabled');
      const dataDisabled = await btn.getAttribute('data-r-phase-disabled');
      const title = await btn.getAttribute('title');

      // store 초기 상태 reset (이전 시나리오 잔재 제거).
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

      const pass =
        isDisabled &&
        ariaDisabled === 'true' &&
        dataDisabled === 'true' &&
        title === 'R-Phase 진행 시 활성' &&
        engineUnchanged &&
        massUnchanged;
      results.push({
        scenario: '6-H 차단 (halley-x10)',
        preset: 'halley-x10',
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
    console.log(
      '\n2) 활성 버튼 (sun / mercury / venus / earth / moon / mars / jupiter — R6) focusOn 정상 동작 smoke\n',
    );
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
