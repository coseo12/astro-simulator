#!/usr/bin/env node
/**
 * #402 R-Phase Body Focus Allowlist 회귀 가드.
 *
 * ADR `docs/decisions/20260504-r-phase-allowlist-guard.md` §결정 4 (DoD-4 회귀 가드 + CI 통합).
 * #415 Amendment — `docs/decisions/20260504-415-url-sync-guard.md` §결정 3 (시나리오 4 매트릭스).
 * #403 Amendment — `docs/decisions/20260506-403-r-phase-ui-guard.md` §결정 §browser-verify 시나리오 확장 (시나리오 5 매트릭스).
 * #404 Amendment — `docs/decisions/20260508-404-scenario-presets-r-phase-guard.md` §결정 §browser-verify 시나리오 6 박제 (시나리오 6 매트릭스).
 *
 * 검증 매트릭스 (R10b #664 — 혜성 3 진입 후, 전 데이터 소진 — 로드맵 v3 최종 라운드):
 *   1. allowlist 박제 body (sun ~ pluto + halley 12개): shortcut 버튼 활성 (disabled 아님)
 *      — satellite (galilean/titan/titania/triton) + ceres/haumea/makemake/eris + encke/swift-tuttle 는
 *        showInShortcutBar=false 라 bar 미등록 → 본 매트릭스 비대상 (FOCUS_BODIES URL 진입 검증).
 *   2. allowlist 외 body shortcut negative: 전 데이터 소진으로 disabled 대상 구조 소멸 (영구)
 *      — membership 가드 negative 는 URL 4-A (가상 ID nonexistent-body) 가 승계, UI disabled 계약은
 *        단위 vi.mock 부분 mock 이 승계 (ADR 20260612-r10b §축 5 — E2E disabled 축 종료)
 *   3. 강제 click 시뮬레이션 — disabled 버튼 click 후 selectedBodyId 변화 0 / camera radius 변화 0 (시나리오 2 와 동일 사유로 skip)
 *   4. URL 직접 진입 매트릭스 (#415 — store mutation 측면 가드, 3번째 방어선):
 *      - 4-A 차단: ?focus=nonexistent-body (가상 ID — R10b #664 전환) → selectedBodyId === null.
 *        ⚠️ 도달 분기 변경: 기존 halley 는 "R-Phase 미진입" 분기였으나 가상 ID 는 데이터 존재 검사
 *        선행으로 "알 수 없는 body id" 가드 분기 — 차단 결과 단언 (selectedBodyId===null + URL 제거) 은 동일.
 *        phase 11 진입으로 미진입 실데이터 0 → 가상 ID 가 영구 승계 (phase 12+ 에서 'nonexistent-body'
 *        류 실데이터 등록 금지 — ADR §재검토 #7)
 *      - 4-B 정상: ?focus=sun / mercury / venus / earth / moon / mars / phobos / deimos / jupiter / io / europa /
 *        ganymede / callisto → selectedBodyId === <body> (R1~R6 회귀 보호. R7+ body 전수 focus 진입은
 *        browser-verify-378-focus.mjs FOCUS_BODIES 27 body 가 커버 — R7~R10b 선례 답습)
 *      - 4-C 무효: ?focus=invalid → selectedBodyId === null (기존 R1 가드 회귀 보호)
 *   5. CelestialTree + InfoPanel UI 가드 (#403 — UI 측면 2번째 축, defense-in-depth):
 *      - 5-A 정상 (CelestialTree): tree-sun click → selectedBodyId === 'sun' + info-panel 정상 분기 렌더
 *        (halley 포함 — R10b positive 전환으로 tree-halley enabled 자동 검증)
 *      - 5-B/5-C 차단: RPHASE_TREE_EXPECTED_DISABLED = [] (전 데이터 소진 — E2E disabled 축 종료,
 *        production 도달 가능 disabled 시나리오 0. UI disabled 계약은 단위 vi.mock 이 승계 — §축 5 ③)
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
 *      - 6-H 정상 (halley-x10): R10b #664 진입 halley → zero-touch 자동 enabled (massMultipliers={halley:10}, Concrete Prediction 재현 6번째 —
 *        preset 코드/데이터 변경 0. 차단 → 정상 positive 전환 — 전 데이터 소진으로 disabled-path E2E 축 종료,
 *        후계 negative preset 신설은 production UI 가짜 entry 노출 (UX 오염) 로 기각 — ADR 20260612-r10b §축 5 ③)
 *
 * R-Phase 진입 시 expected list 갱신 의무 (ADR §결정 4):
 *   - R4 (earth) 진입 시 RPHASE_EXPECTED_ENABLED 에 'earth' 이동
 *   - R6 (mars) 진입 시 추가
 *   - 기타 R-Phase 동일
 *
 * 사용법:
 *   node apps/web/scripts/browser-verify-r-phase-allowlist.mjs
 *   BASE_URL=http://localhost:3000 node apps/web/scripts/browser-verify-r-phase-allowlist.mjs
 *
 * dev 빌드 의존: `window.__simStore` / `window.__solarScene` / `window.__simCore` (sim-canvas.tsx).
 */

import { withBrowser } from '../../../scripts/browser-verify-utils.mjs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

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
// R10b #664 — halley 진입 + showInShortcutBar true 승격 (PM Q2=A — halley 만, 15버튼째 비-행성
// 후미 컨벤션). encke/swift-tuttle 는 false (focus 가능 + bar 미등록 — #617 직교 축 합류) → 비대상.
// R11 #721 — 토성계 위성 3 (enceladus/rhea/iapetus) 진입 (CURRENT_R_PHASE=12). 3개 모두
// showInShortcutBar=false (titan/galilean/titania/triton 위성 패턴) → 본 enabled 배열 변경 0 (비대상).
// R12 #725 — 거성 위성 2 (oberon/proteus) 진입 (CURRENT_R_PHASE=13). 둘 다 showInShortcutBar=false
// (위성 패턴) → 본 enabled 배열 변경 0 (비대상). #613 Concrete Prediction 재현 (배열 변경 0).
// URL/클릭 focus 진입 검증은 browser-verify-378-focus.mjs FOCUS_BODIES 가 커버 (R7~R11 선례 답습).
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
  'halley',
];
// R9 #653 — 로드맵 마지막 행성 (neptune) 진입으로 FOCUS_BUTTONS 의 disabled 대상이 구조 소멸.
// R10b #664 — 전 데이터 소진으로 영구 빈 배열 확정 (시나리오 2/3 skip). membership 가드 negative 는
// URL 4-A (가상 ID nonexistent-body) 가 승계, UI disabled 계약은 단위 vi.mock 부분 mock 이 승계
// (ADR 20260612-r10b §축 5). bar 미등록 직교 축 (#617) = ceres 등 4 + encke/swift-tuttle.
const RPHASE_SHORTCUT_EXPECTED_DISABLED = [];
// R10b #664 — 빈 배열 (E2E disabled 축 종료): phase 11 진입으로 전 데이터 소진 — production 에서
// 도달 가능한 tree disabled 시나리오 자체가 소멸 (트리거 가능 미진입 실데이터 0). tree 의 disabled
// 분기 코드는 미래 phase 12+ 데이터 대비 잔존하며, UI disabled 계약 검증은 단위 vi.mock 부분 mock
// (celestial-tree.test.tsx 등 4 파일) 이 승계 (ADR 20260612-r10b §축 5 ③ — shortcut bar negative
// 빈 배열 선례 동형). membership 가드 negative 는 4-A 가상 ID (nonexistent-body) 가 보존.
const RPHASE_TREE_EXPECTED_DISABLED = [];

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
 *   - allowlist 외 (nonexistent-body — 가상 ID, R10b #664 에서 halley positive 전환으로 교체): selectedBodyId === null (url-sync 가드 작동, negative 케이스 보존)
 *   - allowlist 박제 (sun / mercury / venus / earth / moon / mars / phobos / deimos / jupiter / galilean 4):
 *     selectedBodyId === <body> (정상 회귀 보호)
 *   - invalid: selectedBodyId === null (기존 R1 가드 회귀 보호)
 *
 * 매 case 마다 새 page 생성 — initialized.current useRef 를 우회하기 위해.
 */
async function verifyUrlDirectEntry(browser) {
  const cases = [
    // 4-A 차단 — 가상 ID URL 직접 진입 시 가드 작동 (R10b #664: halley positive 전환 + 전 데이터
    // 소진 → 가상 ID nonexistent-body 로 영구 전환 — ADR §축 5 ①).
    // ⚠️ 도달 분기: 가상 ID 는 url-sync 데이터 존재 검사 선행으로 "알 수 없는 body id" 분기
    // (기존 halley 의 "R-Phase 미진입" 분기와 다름) — 차단 결과 단언 (selectedBodyId===null +
    // #418 URL 자동 제거) 은 동일. "R-Phase 미진입" 분기 자체는 단위 vi.mock (url-sync.test.tsx) 승계.
    { focus: 'nonexistent-body', expected: null, label: '4-A 차단' },
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
      {
        // R10b #664 — halley 진입 → zero-touch 자동 enabled (Concrete Prediction 재현 6번째 —
        // preset 코드/데이터 변경 0). 차단 6-H → 정상 6-H positive 전환: 전 데이터 소진으로
        // disabled-path E2E 축 종료 (후계 negative preset 신설은 production UI 가짜 entry 노출
        // = UX 오염으로 기각 — ADR 20260612-r10b §축 5 ③. 단위 vi.mock 부분 mock 이 승계).
        presetId: 'halley-x10',
        massKey: 'halley',
        expectedMul: 10,
        scenario: '6-H 정상 (halley-x10)',
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

    // (R10b #664) 기존 "6-H 차단 (halley-x10)" 블록 제거 — halley 진입으로 positive 전환되어
    // enabledPresetCases 의 '6-H 정상 (halley-x10)' 이 승계 (zero-touch 재현 6번째). 전 데이터
    // 소진으로 disabled-path E2E 축 종료 — UI disabled 계약은 단위 vi.mock 부분 mock 이 검증
    // (ADR 20260612-r10b §축 5 ③).
  } finally {
    await context.close();
  }

  return results;
}

async function main() {
  let allPass = true;

  // #940 — 브라우저 수명주기를 `withBrowser` 로 위임 (에러 경로 close 도달 보장).
  // launch 인자는 원본 그대로 전달한다 (렌더러 축 불변 — docs/ops/browser-verify-helpers.md).
  await withBrowser({ headless: true }, async (browser) => {
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
  });

  console.log('\n=== 최종 요약 ===');
  console.log(`  overall: ${allPass ? 'PASS' : 'FAIL'}`);

  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error('\n  FATAL:', err);
  process.exit(2);
});
