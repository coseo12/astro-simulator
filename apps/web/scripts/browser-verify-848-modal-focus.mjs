#!/usr/bin/env node
/**
 * #848 a11y 키보드 사각 회귀 가드 — 모달 focus trap / portal + canvas focus 탈취 / canvas 이름.
 *
 * axe 정적 검사(a11y-baseline-guard)는 **동적 키보드 거동** 을 보지 못한다. 실제로 전수 감사
 * (2026-07-18) 시점 a11y-baseline 은 0 위반이었는데도 (a) Tab 이 모달을 탈출했고 (b) 마우스 스침이
 * 키보드 포커스를 탈취했으며 (c) 포커서블 canvas 에 접근 가능한 이름이 없었다. 본 가드는 그
 * 사각을 실 키 이벤트로 메운다 (jsdom 단위 테스트는 실제 Tab 포커스 이동을 구현하지 않는다).
 *
 * 사용법:
 *   pnpm --filter @astro-simulator/web verify:848-modal-focus
 *
 * ## 검증 시나리오
 *
 * | S   | DoD (PASS)                                                                          | 회귀 시                     |
 * |-----|-------------------------------------------------------------------------------------|-----------------------------|
 * | S1  | 모달 3종 전부 body 직속 portal + backdrop `z-[100]`                                  | about 의 비-portal z-40 부활 |
 * | S2  | 모달 3종 열림 중 Tab ×N / Shift+Tab ×N 전부 패널 내부 유지 (배경 도달 0)             | Tab 이 배경 UI 로 탈출      |
 * | S3  | 마지막 요소 → Tab → 첫 요소 / 첫 요소 → Shift+Tab → 마지막 요소 (순환 경계)          | 경계에서 탈출               |
 * | S4  | Esc 닫힘 + backdrop 클릭 닫힘 + 닫은 뒤 **직전 포커스 요소** 복원                     | 포커스 소실 (body 로 낙하)  |
 * | S5  | Tab 으로 도달한 버튼 focus 가 마우스 캔버스 스침(pointerenter) 후에도 유지            | 키보드 포커스 탈취 (WCAG 2.4.3) |
 * | S6  | 마우스 클릭 focus 는 캔버스 스침 시 캔버스로 회수 (#699 WASD 무회귀)                  | WASD/화살표 무반응 회귀     |
 * | S7  | canvas 에 접근 가능한 이름 존재 (CDP AX name 비어있지 않음) + 여전히 focusable        | 이름 부재 재발              |
 *
 * dev 빌드 의존: window.__solarScene.
 * DOM 의존: [data-testid="sim-canvas"|"about-button"|"about-modal"|"about-close"
 *           |"sensitivity-settings-button"|"sensitivity-settings-modal"|"sensitivity-close"
 *           |"onboarding-button"|"onboarding-modal"|"onboarding-close"] + [data-modal-open="true"].
 * 환경변수: BASE_URL (기본 http://localhost:3000)
 */

import {
  launchBrowser,
  bootstrapScene,
  collectConsoleErrors,
  resolveBaseUrl,
} from '../../../scripts/browser-verify-utils.mjs';

const BASE_URL = resolveBaseUrl();
const VIEWPORT = { width: 1280, height: 720 };
const SETTLE_MS = 2000;
/** trap 순환을 충분히 돌려 탈출을 유도하는 Tab 반복 수 (최장 모달 포커서블 수 + 여유). */
const TAB_SWEEP_COUNT = 15;

/** 모달 3종 계약 (testid SSoT — 마크업 변경 시 여기부터 깨지도록 명시 throw). */
const MODALS = [
  { id: 'about', trigger: 'about-button', panel: 'about-modal', close: 'about-close' },
  {
    id: 'sensitivity',
    trigger: 'sensitivity-settings-button',
    panel: 'sensitivity-settings-modal',
    close: 'sensitivity-close',
  },
  {
    id: 'onboarding',
    trigger: 'onboarding-button',
    panel: 'onboarding-modal',
    close: 'onboarding-close',
  },
];

const results = [];
const record = (scenario, pass, detail) => {
  results.push({ scenario, pass, detail });
  console.log(`  ${pass ? 'PASS' : 'FAIL'} — ${detail}`);
};

async function boot(page) {
  await bootstrapScene(page, { baseUrl: BASE_URL, query: '/?gpu=a&lod=auto', settleMs: SETTLE_MS });
}

/** 트리거를 클릭해 모달을 연다 (부재 시 명시 throw — 가드가 조용히 통과하지 않도록). */
async function openModal(page, modal) {
  const trigger = page.locator(`[data-testid="${modal.trigger}"]`);
  if ((await trigger.count()) === 0) {
    throw new Error(`[#848] ${modal.trigger} 트리거 부재 — 마크업 변경? (testid 셀렉터 깨짐)`);
  }
  await trigger.click();
  await page.waitForSelector(`[data-testid="${modal.panel}"]`, { state: 'visible', timeout: 5000 });
}

/** 현재 활성 요소가 지정 패널 내부인지 + 식별 정보. */
function activeInfo(page, panelTestId) {
  return page.evaluate((testId) => {
    const panel = document.querySelector(`[data-testid="${testId}"]`);
    const active = document.activeElement;
    return {
      inside: panel !== null && active !== null && panel.contains(active),
      tag: active?.tagName ?? 'none',
      testId: active instanceof HTMLElement ? (active.dataset.testid ?? null) : null,
      label: active?.getAttribute?.('aria-label') ?? null,
    };
  }, panelTestId);
}

// ── S1 — portal + z-[100] ───────────────────────────────────────────────────
async function scenarioPortal(page) {
  console.log('\n[S1] 모달 3종 — body 직속 portal + backdrop z-[100]');
  for (const modal of MODALS) {
    await openModal(page, modal);
    const info = await page.evaluate((testId) => {
      const panel = document.querySelector(`[data-testid="${testId}"]`);
      const backdrop = panel?.parentElement ?? null;
      return {
        portalToBody: backdrop?.parentElement === document.body,
        backdropClass: backdrop?.className ?? '',
        zIndex: backdrop ? getComputedStyle(backdrop).zIndex : null,
        modalOpenAttr: panel?.getAttribute('data-modal-open') ?? null,
      };
    }, modal.panel);
    // `z-[100]` 은 Tailwind arbitrary value — 계산된 z-index 로 실측 (클래스 문자열 의존 회피).
    const pass = info.portalToBody && Number(info.zIndex) >= 100 && info.modalOpenAttr === 'true';
    record(
      `S1:${modal.id}`,
      pass,
      `portal→body=${info.portalToBody} / z-index=${info.zIndex} / data-modal-open=${info.modalOpenAttr}`,
    );
    await page.keyboard.press('Escape');
    await page.waitForSelector(`[data-testid="${modal.panel}"]`, {
      state: 'detached',
      timeout: 5000,
    });
  }
}

// ── S2 — Tab / Shift+Tab 순회 전부 패널 내부 ─────────────────────────────────
async function scenarioTrapSweep(page) {
  console.log('\n[S2] 모달 3종 — Tab / Shift+Tab 순회가 패널 내부에 갇힘');
  for (const modal of MODALS) {
    for (const shift of [false, true]) {
      await openModal(page, modal);
      let escaped = null;
      for (let i = 0; i < TAB_SWEEP_COUNT; i += 1) {
        await page.keyboard.press(shift ? 'Shift+Tab' : 'Tab');
        const info = await activeInfo(page, modal.panel);
        if (!info.inside) {
          escaped = { step: i + 1, ...info };
          break;
        }
      }
      record(
        `S2:${modal.id}:${shift ? 'shift+tab' : 'tab'}`,
        escaped === null,
        escaped === null
          ? `${TAB_SWEEP_COUNT}회 순회 전부 패널 내부 유지`
          : `${escaped.step}회차에 탈출 → <${escaped.tag}> testid=${escaped.testId} label=${escaped.label}`,
      );
      await page.keyboard.press('Escape');
      await page.waitForSelector(`[data-testid="${modal.panel}"]`, {
        state: 'detached',
        timeout: 5000,
      });
    }
  }
}

// ── S3 — 경계 순환 (마지막→Tab→첫 / 첫→Shift+Tab→마지막) ────────────────────
async function scenarioBoundaryCycle(page) {
  console.log('\n[S3] 모달 3종 — 경계 순환 (마지막 → Tab → 첫 / 첫 → Shift+Tab → 마지막)');
  for (const modal of MODALS) {
    await openModal(page, modal);

    // 경계 요소에 위치 마커를 심는다. `data-testid` 로 비교하면 about 모달의 출처 링크(`<a>`,
    // testid 없음)가 마지막 요소라 식별 불가 → **요소 동일성** 으로 판정 (측정 방법 우선 정정).
    // 마커는 모달 언마운트와 함께 사라진다.
    const count = await page.evaluate((testId) => {
      const panel = document.querySelector(`[data-testid="${testId}"]`);
      if (!panel) return 0;
      // SSoT: `apps/web/src/lib/focus-trap.ts` 의 `FOCUSABLE_SELECTOR` — 변경 시 동기화 필수 (#889).
      // `.mjs` 가드는 TS 모듈을 import 할 수 없어 문자열 사본이 불가피하다. 같은 사본이 한 곳 더 있다:
      // `scripts/browser-verify-a11y.mjs` (focusable 개수 집계).
      //
      // **필터는 부분 복제** — 아래 `.filter()` 는 `isFocusableNow` 의 5축 중 `tabindex="-1"` 1축만
      // 복제하고 `disabled` / `aria-hidden="true"` / `hidden`·`[inert]` /
      // `display:none`·`visibility:hidden` 은 복제하지 않는다. 본 시나리오는 first/last **경계**에
      // 마커를 심으므로, 모달 경계에 그런 요소가 들어오는 순간 구현이 계산하는 경계와 어긋나
      // false FAIL(또는 false PASS)이 난다. 현행 3 모달 DOM 에는 해당 요소가 0개라 미발현
      // (qa 실측 PR #886: about 5==5 / sensitivity 6==6 / onboarding 3==3).
      // → 모달에 `disabled` 버튼·조건부 숨김 요소를 추가하면 여기 필터부터 확장할 것.
      const sel =
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
      const els = Array.from(panel.querySelectorAll(sel)).filter(
        (el) => el.getAttribute('tabindex') !== '-1',
      );
      if (els.length < 2) return els.length;
      els[0].setAttribute('data-848-pos', 'first');
      els[els.length - 1].setAttribute('data-848-pos', 'last');
      return els.length;
    }, modal.panel);

    if (count < 2) {
      record(`S3:${modal.id}`, false, `포커서블 ${count}개 — 경계 순환 측정 불가`);
      await page.keyboard.press('Escape');
      continue;
    }

    const posOf = () =>
      page.evaluate(() => ({
        pos: document.activeElement?.getAttribute?.('data-848-pos') ?? null,
        tag: document.activeElement?.tagName ?? 'none',
      }));

    // open 시 초기 focus 는 닫기 버튼 = 첫 요소 → Shift+Tab 1회로 마지막에 도달해야 한다.
    const atFirst = await posOf();
    await page.keyboard.press('Shift+Tab');
    const atLast = await posOf();
    await page.keyboard.press('Tab');
    const wrapped = await posOf();

    const pass = atFirst.pos === 'first' && atLast.pos === 'last' && wrapped.pos === 'first';
    record(
      `S3:${modal.id}`,
      pass,
      `포커서블 ${count}개 — 초기=${atFirst.pos}(<${atFirst.tag}>) → Shift+Tab → ${atLast.pos}(<${atLast.tag}>) → Tab → ${wrapped.pos}(<${wrapped.tag}>)`,
    );

    await page.keyboard.press('Escape');
    await page.waitForSelector(`[data-testid="${modal.panel}"]`, {
      state: 'detached',
      timeout: 5000,
    });
  }
}

// ── S4 — Esc / backdrop 닫힘 + 직전 포커스 복원 ──────────────────────────────
async function scenarioCloseAndRestore(page) {
  console.log('\n[S4] 모달 3종 — Esc / backdrop 닫힘 + 직전 포커스 요소 복원');
  for (const modal of MODALS) {
    // (a) Esc 닫힘 + 복원.
    await openModal(page, modal);
    await page.keyboard.press('Escape');
    await page.waitForSelector(`[data-testid="${modal.panel}"]`, {
      state: 'detached',
      timeout: 5000,
    });
    const afterEsc = await page.evaluate(
      () => document.activeElement?.dataset?.testid ?? document.activeElement?.tagName ?? 'none',
    );
    record(
      `S4:${modal.id}:esc`,
      afterEsc === modal.trigger,
      `Esc 닫힘 후 포커스 = "${afterEsc}" (기대 "${modal.trigger}")`,
    );

    // (b) backdrop 클릭 닫힘 + 복원.
    await openModal(page, modal);
    await page.evaluate((testId) => {
      const panel = document.querySelector(`[data-testid="${testId}"]`);
      panel?.parentElement?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }, modal.panel);
    await page.waitForSelector(`[data-testid="${modal.panel}"]`, {
      state: 'detached',
      timeout: 5000,
    });
    const afterBackdrop = await page.evaluate(
      () => document.activeElement?.dataset?.testid ?? document.activeElement?.tagName ?? 'none',
    );
    record(
      `S4:${modal.id}:backdrop`,
      afterBackdrop === modal.trigger,
      `backdrop 클릭 닫힘 후 포커스 = "${afterBackdrop}" (기대 "${modal.trigger}")`,
    );
  }
}

/**
 * 마우스를 캔버스 **밖 → 안** 으로 이동시켜 `pointerenter` 를 실제로 발화시킨다.
 *
 * 캔버스는 `absolute inset-0` 로 뷰포트 전체를 덮으므로, 캔버스 안에서만 움직이면 pointerenter 가
 * 다시 발화하지 않는다. 상단 바(pointer-events 를 되살린 자식이 있는 영역)를 경유해 leave→enter 를
 * 만든다. 이 이동이 정말 발화했는지는 **S6 이 양성 대조군** 으로 증명한다 (발화하지 않았다면 S6 의
 * "캔버스로 회수" 가 실패한다 — S5 만으로는 false-positive 를 구분할 수 없다).
 */
async function hoverOntoCanvas(page) {
  await page.mouse.move(200, 6); // 상단 바 영역 = 캔버스 밖
  await page.waitForTimeout(60);
  await page.mouse.move(640, 400); // 캔버스 중앙
  await page.waitForTimeout(150);
}

const focusSnapshot = (page) =>
  page.evaluate(() => ({
    testId: document.activeElement?.dataset?.testid ?? null,
    tag: document.activeElement?.tagName ?? 'none',
    focusVisible: document.activeElement?.matches?.(':focus-visible') ?? null,
  }));

// ── S5 — 키보드 포커스는 캔버스 스침으로 잃지 않는다 ─────────────────────────
async function scenarioKeyboardFocusPreserved(page) {
  console.log('\n[S5] Tab 으로 도달한 버튼 focus — 마우스 캔버스 스침 후에도 유지 (WCAG 2.4.3)');
  // 키보드 modality 확립 — Tab 만으로 UI 버튼에 도달 (마우스 개입 0).
  await page.evaluate(() => document.activeElement?.blur?.());
  let before = null;
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('Tab');
    const snap = await focusSnapshot(page);
    if (snap.tag === 'BUTTON' || snap.tag === 'A') {
      before = snap;
      break;
    }
  }
  if (before === null) {
    record('S5', false, 'Tab 6회로 버튼/링크에 도달하지 못함 — 측정 전제 불성립');
    return;
  }

  await hoverOntoCanvas(page);
  const after = await focusSnapshot(page);

  const pass = after.tag === before.tag && after.testId === before.testId;
  record(
    'S5',
    pass,
    `Tab 후 focus=<${before.tag}> testid=${before.testId} (focus-visible=${before.focusVisible}) → 캔버스 스침 후 <${after.tag}> testid=${after.testId}`,
  );
}

// ── S6 — 마우스 클릭 포커스는 캔버스로 회수 (#699 무회귀) ────────────────────
async function scenarioMouseFocusReclaimed(page) {
  console.log(
    '\n[S6] 마우스 클릭으로 얻은 버튼 focus — 캔버스 스침 시 캔버스로 회수 (#699 무회귀)',
  );
  // #699 원 시나리오 그대로: **마우스로만** 단축 바 버튼을 눌러 포커스가 그 버튼에 남은 상태.
  // (키를 한 번이라도 누르면 Chrome 의 modality 가 keyboard 로 바뀌어 `:focus-visible` 이 참이 되고,
  //  그때는 포커스를 지키는 게 옳은 동작이므로 이 시나리오의 전제가 깨진다.)
  const btn = page.locator('[data-testid="focus-sun"]');
  if ((await btn.count()) === 0) {
    throw new Error('[#848] focus-sun 단축 버튼 부재 — 마크업 변경? (testid 셀렉터 깨짐)');
  }
  await btn.click();
  await page.waitForTimeout(500);
  const before = await focusSnapshot(page);

  await hoverOntoCanvas(page);
  const after = await page.evaluate(() => document.activeElement?.tagName ?? 'none');

  // 클릭 유래 포커스는 `:focus-visible` 이 아니므로 캔버스가 회수해야 WASD/화살표가 산다.
  const pass = before.focusVisible === false && after === 'CANVAS';
  record(
    'S6',
    pass,
    `클릭 후 focus=<${before.tag}> testid=${before.testId} focus-visible=${before.focusVisible} → 캔버스 스침 후 <${after}> (기대 CANVAS)`,
  );
}

// ── S7 — canvas 접근 가능한 이름 ─────────────────────────────────────────────
async function scenarioCanvasName(page, ctx) {
  console.log('\n[S7] canvas 접근 가능한 이름 (CDP AX 실측) + focusable 유지');
  const client = await ctx.newCDPSession(page);
  await client.send('Accessibility.enable');
  const doc = await client.send('DOM.getDocument', { depth: -1 });
  const node = await client.send('DOM.querySelector', {
    nodeId: doc.root.nodeId,
    selector: '[data-testid="sim-canvas"]',
  });
  const ax = await client.send('Accessibility.getPartialAXTree', {
    nodeId: node.nodeId,
    fetchRelatives: false,
  });
  const axNode = ax.nodes[0];
  const name = axNode?.name?.value ?? '';
  const focusable =
    (axNode?.properties ?? []).find((p) => p.name === 'focusable')?.value?.value ?? false;
  const tabindex = await page.evaluate(
    () => document.querySelector('[data-testid="sim-canvas"]')?.getAttribute('tabindex') ?? null,
  );
  const pass = name.trim().length > 0 && focusable === true && tabindex === '0';
  record(
    'S7',
    pass,
    `AX name="${name}" / focusable=${focusable} / tabindex=${tabindex} (양수 tabindex 금지 정책)`,
  );
  await client.detach();
}

// ── main ────────────────────────────────────────────────────────────────────
const browser = await launchBrowser({ gpu: 'swiftshader' });
const ctx = await browser.newContext({ viewport: VIEWPORT });
const page = await ctx.newPage();
const consoleErrors = collectConsoleErrors(page);

try {
  await boot(page);
  await scenarioPortal(page);
  await scenarioTrapSweep(page);
  await scenarioBoundaryCycle(page);
  await scenarioCloseAndRestore(page);
  await scenarioKeyboardFocusPreserved(page);
  await scenarioMouseFocusReclaimed(page);
  await scenarioCanvasName(page, ctx);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log('\n========================================');
console.log(`#848 a11y 키보드 가드 — ${results.length - failed.length}/${results.length} PASS`);
if (consoleErrors.length > 0) {
  console.log(`\n콘솔 에러 ${consoleErrors.length}건:`);
  for (const e of consoleErrors.slice(0, 10)) console.log(`  ${e}`);
}
if (failed.length > 0) {
  console.log(`\nFAIL ${failed.length}건:`);
  for (const f of failed) console.log(`  ✗ ${f.scenario} — ${f.detail}`);
  process.exit(1);
}
if (consoleErrors.length > 0) {
  console.log('\n콘솔 에러가 있어 실패 처리합니다.');
  process.exit(1);
}
console.log('전 시나리오 통과 ✓');
