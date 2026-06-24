#!/usr/bin/env node
/**
 * #737 첫 진입 온보딩 + 조작 가이드 회귀 가드 — createPortal 실 마운트 + Esc 충돌 회피 + localStorage 왕복.
 *
 * architect 설계 코멘트 §테스트 전략 (통합/E2E — agy 강력 권고). JSDOM 으로는 portal·focus·Esc 전파
 * 충돌 검증 불가 → headless 필수. WebGPU canvas 합성 위 DOM 가림은 headless 미재현이므로 status:review
 * 전 실 Chrome GUI 수동 검증 1회 의무 (sensitivity #704 D-T2 선례 / architect R3).
 *
 * 사용법:
 *   pnpm --filter @astro-simulator/web verify:737-onboarding
 *   pnpm --filter @astro-simulator/web verify:737-onboarding -- --json
 *
 * ## 검증 시나리오
 *
 * | S   | DoD (PASS)                                                                      | 회귀 시                       |
 * |-----|--------------------------------------------------------------------------------|-------------------------------|
 * | S1  | 첫 방문(localStorage 미설정) → 온보딩 모달 자동 표시(createPortal body 마운트)  | 자동 표시 안 됨 / portal 실패 |
 * | S2  | Esc 충돌 회피 — earth focus 중 모달 open + Esc → 모달만 닫힘 + free-fly 미발화   | Esc 가 free-fly 동시 발화     |
 * | S3  | "다시 보지 않기" → localStorage 박제 + reload 후 자동 미표시                     | 영속 미작동 / 재표시          |
 * | S4  | "조작 가이드" 버튼 재호출 → dismiss 후에도 모달 재오픈 + backdrop 클릭 닫기      | 재호출 불가 / backdrop 무동작 |
 * | S5  | 모바일 viewport(375px) — 모달 표시 + 3 가이드 섹션 가시 + 가로 overflow 0       | 모바일 레이아웃 깨짐          |
 * | S6  | about/sensitivity Esc 비충돌 (가드 SSoT — architect R1) — 모달 open + Esc 무발화 | 신규 모달 컨벤션 회귀         |
 *
 * dev 빌드 의존: window.__simStore (setSelectedBody / enterFreeFly / selectedBodyId / freeFlyMode).
 * DOM 의존: [data-testid="onboarding-modal"|"onboarding-button"|"onboarding-dismiss"|"about-button"
 *           |"sensitivity-settings-button"|"focus-earth"] + [data-modal-open="true"].
 * 환경변수: BASE_URL (기본 http://localhost:3000)
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const flags = { json: process.argv.slice(2).includes('--json') };
const VIEWPORT = { width: 1280, height: 720 };
const MOBILE_VIEWPORT = { width: 375, height: 812 };
const SETTLE_MS = 2000;
const STORAGE_KEY = 'astro:onboarding-dismissed';
const SCHEMA_VERSION = 1;

async function boot(page) {
  await page.goto(`${BASE_URL}/?gpu=a&lod=auto`, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForFunction(
    () => typeof window.__solarScene !== 'undefined' && typeof window.__simStore !== 'undefined',
    { timeout: 15_000 },
  );
  await page.waitForTimeout(SETTLE_MS);
}

// localStorage 를 dismiss 박제 상태로 사전 설정 (자동 표시 차단 후 명시 재호출 시나리오용).
async function setDismissed(page) {
  await page.evaluate(
    ({ key, version }) => localStorage.setItem(key, JSON.stringify({ version, value: true })),
    { key: STORAGE_KEY, version: SCHEMA_VERSION },
  );
}
// S1 — 첫 방문 자동 표시 (createPortal body 마운트).
async function scenarioAutoShow(browser) {
  console.log(
    '\n[S1] 첫 방문(localStorage 미설정) → 온보딩 모달 자동 표시 (createPortal body 마운트)',
  );
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();
  try {
    await boot(page); // 새 컨텍스트 = localStorage 비어 있음 → 자동 표시.
    const modal = page.locator('[data-testid="onboarding-modal"]');
    const visible = await modal.isVisible().catch(() => false);
    // portal 이 document.body 직속인지 (canvas React 서브트리 밖) 확인.
    const portalToBody = await page.evaluate(() => {
      const m = document.querySelector('[data-testid="onboarding-modal"]');
      if (!m) return false;
      // 모달의 backdrop(부모) 이 body 직속 자식인지.
      return m.parentElement?.parentElement === document.body;
    });
    const pass = visible && portalToBody;
    console.log(`  자동 표시=${visible} | portal→body=${portalToBody} → ${pass ? 'PASS' : 'FAIL'}`);
    return { scenario: 'S1', visible, portalToBody, pass };
  } finally {
    await ctx.close();
  }
}

// S2 — Esc 충돌 회피: earth focus 중 모달 open + Esc → 모달만 닫힘 + free-fly 미발화.
async function scenarioEscConflict(browser) {
  console.log(
    '\n[S2] Esc 충돌 회피 — earth focus 중 모달 open + Esc → 모달만 닫힘 + free-fly 미발화',
  );
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();
  try {
    await boot(page);
    // 자동 모달이 떠 있으면 닫고 시작 (시작하기).
    await page.evaluate(() => {
      const start = document.querySelector('[data-testid="onboarding-start"]');
      if (start) start.click();
    });
    await page.waitForTimeout(300);
    // earth focus → selectedBodyId!==null (Esc 가 free-fly 진입 가능 상태).
    await page.evaluate(() => window.__simStore.getState().setSelectedBody('earth'));
    await page.waitForTimeout(1500);
    // "조작 가이드" 버튼으로 모달 재호출.
    await page.click('[data-testid="onboarding-button"]');
    await page.waitForTimeout(300);
    const beforeFreeFly = await page.evaluate(() => window.__simStore.getState().freeFlyMode);
    const modalOpenBefore = await page
      .locator('[data-testid="onboarding-modal"]')
      .isVisible()
      .catch(() => false);
    // Esc 1회.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const modalOpenAfter = await page
      .locator('[data-testid="onboarding-modal"]')
      .isVisible()
      .catch(() => false);
    const afterFreeFly = await page.evaluate(() => window.__simStore.getState().freeFlyMode);
    // 모달은 닫히고(true→false), free-fly 는 발화 안 함(both false).
    const modalClosed = modalOpenBefore && !modalOpenAfter;
    const freeFlyNotFired = !beforeFreeFly && !afterFreeFly;
    const pass = modalClosed && freeFlyNotFired;
    console.log(
      `  모달 ${modalOpenBefore}→${modalOpenAfter}(닫힘 ${modalClosed}) | freeFly ${beforeFreeFly}→${afterFreeFly}(미발화 ${freeFlyNotFired}) → ${pass ? 'PASS' : 'FAIL'}`,
    );
    return { scenario: 'S2', modalClosed, freeFlyNotFired, pass };
  } finally {
    await ctx.close();
  }
}

// S3 — "다시 보지 않기" → localStorage 박제 + reload 후 자동 미표시.
async function scenarioDismissPersist(browser) {
  console.log('\n[S3] "다시 보지 않기" → localStorage 박제 + reload 후 자동 미표시');
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();
  try {
    await boot(page);
    // 자동 표시된 모달의 "다시 보지 않기" 클릭.
    await page.click('[data-testid="onboarding-dismiss"]');
    await page.waitForTimeout(300);
    const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    const storedOk = stored !== null && JSON.parse(stored).value === true;
    // reload → 자동 미표시.
    await page.reload({ waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForFunction(() => typeof window.__simStore !== 'undefined', { timeout: 15_000 });
    await page.waitForTimeout(SETTLE_MS);
    const reShown = await page
      .locator('[data-testid="onboarding-modal"]')
      .isVisible()
      .catch(() => false);
    const pass = storedOk && !reShown;
    console.log(
      `  localStorage 박제=${storedOk} | reload 후 표시=${reShown}(미표시 ${!reShown}) → ${pass ? 'PASS' : 'FAIL'}`,
    );
    return { scenario: 'S3', storedOk, reShown, pass };
  } finally {
    await ctx.close();
  }
}

// S4 — "조작 가이드" 버튼 재호출 + backdrop 클릭 닫기.
async function scenarioReopenAndBackdrop(browser) {
  console.log('\n[S4] "조작 가이드" 버튼 재호출 (dismiss 후) + backdrop 클릭 닫기');
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();
  try {
    await boot(page);
    await setDismissed(page);
    await page.reload({ waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForFunction(() => typeof window.__simStore !== 'undefined', { timeout: 15_000 });
    await page.waitForTimeout(SETTLE_MS);
    // dismiss 상태라 자동 미표시.
    const autoHidden = !(await page
      .locator('[data-testid="onboarding-modal"]')
      .isVisible()
      .catch(() => false));
    // 버튼 재호출.
    await page.click('[data-testid="onboarding-button"]');
    await page.waitForTimeout(300);
    const reopened = await page
      .locator('[data-testid="onboarding-modal"]')
      .isVisible()
      .catch(() => false);
    // backdrop(좌상단 모서리) 클릭 → 닫힘.
    await page.mouse.click(8, 8);
    await page.waitForTimeout(300);
    const closedByBackdrop = !(await page
      .locator('[data-testid="onboarding-modal"]')
      .isVisible()
      .catch(() => false));
    const pass = autoHidden && reopened && closedByBackdrop;
    console.log(
      `  자동 미표시=${autoHidden} | 재호출=${reopened} | backdrop 닫힘=${closedByBackdrop} → ${pass ? 'PASS' : 'FAIL'}`,
    );
    return { scenario: 'S4', autoHidden, reopened, closedByBackdrop, pass };
  } finally {
    await ctx.close();
  }
}

// S5 — 모바일 viewport(375px): 모달 표시 + 3 섹션 가시 + 가로 overflow 0.
async function scenarioMobile(browser) {
  console.log('\n[S5] 모바일 viewport(375px) — 모달 + 3 가이드 섹션 가시 + 가로 overflow 0');
  const ctx = await browser.newContext({ viewport: MOBILE_VIEWPORT, isMobile: true });
  const page = await ctx.newPage();
  try {
    await boot(page);
    const modalVisible = await page
      .locator('[data-testid="onboarding-modal"]')
      .isVisible()
      .catch(() => false);
    const sections = await page.evaluate(() => ({
      pointer: !!document.querySelector('[data-testid="onboarding-pointer-guide"]'),
      freefly: !!document.querySelector('[data-testid="onboarding-freefly-guide"]'),
      touch: !!document.querySelector('[data-testid="onboarding-touch-guide"]'),
    }));
    const allSections = sections.pointer && sections.freefly && sections.touch;
    // 가로 overflow 없음 (모달이 viewport 폭 안에 들어감).
    const noHOverflow = await page.evaluate(() => {
      const m = document.querySelector('[data-testid="onboarding-modal"]');
      if (!m) return false;
      const r = m.getBoundingClientRect();
      return r.left >= -1 && r.right <= window.innerWidth + 1;
    });
    const pass = modalVisible && allSections && noHOverflow;
    console.log(
      `  모달=${modalVisible} | 3섹션(${JSON.stringify(sections)})=${allSections} | overflow 0=${noHOverflow} → ${pass ? 'PASS' : 'FAIL'}`,
    );
    return { scenario: 'S5', modalVisible, sections, noHOverflow, pass };
  } finally {
    await ctx.close();
  }
}

// S6 — about/sensitivity Esc 비충돌 (가드 SSoT — architect R1).
async function scenarioOtherModalsEscGuard(browser) {
  console.log(
    '\n[S6] about/sensitivity Esc 비충돌 (가드 SSoT, architect R1) — 모달 open + Esc 무발화',
  );
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();
  const rows = [];
  let pass = true;
  try {
    await boot(page);
    // 자동 온보딩 닫기.
    await page.evaluate(() => {
      const start = document.querySelector('[data-testid="onboarding-start"]');
      if (start) start.click();
    });
    await page.waitForTimeout(300);
    for (const m of [
      { label: 'about', btn: 'about-button', modal: 'about-modal' },
      {
        label: 'sensitivity',
        btn: 'sensitivity-settings-button',
        modal: 'sensitivity-settings-modal',
      },
    ]) {
      // earth focus (free-fly 발화 가능 상태) → 모달 open → Esc.
      await page.evaluate(() => window.__simStore.getState().setSelectedBody('earth'));
      await page.waitForTimeout(1200);
      // free-fly 잔류 제거 — reset.
      await page.evaluate(() => window.__simStore.getState().setSelectedBody('earth'));
      await page.click(`[data-testid="${m.btn}"]`);
      await page.waitForTimeout(300);
      const before = await page.evaluate(() => window.__simStore.getState().freeFlyMode);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      const after = await page.evaluate(() => window.__simStore.getState().freeFlyMode);
      const closed = !(await page
        .locator(`[data-testid="${m.modal}"]`)
        .isVisible()
        .catch(() => false));
      const ok = closed && !before && !after;
      if (!ok) pass = false;
      rows.push({ label: m.label, closed, freeFly: `${before}→${after}`, ok });
      console.log(
        `  ${m.label}: 닫힘=${closed} freeFly ${before}→${after}(미발화 ${!before && !after}) → ${ok ? 'PASS' : 'FAIL'}`,
      );
    }
    return { scenario: 'S6', rows, pass };
  } finally {
    await ctx.close();
  }
}

async function main() {
  console.log('\n=== #737 첫 진입 온보딩 + 조작 가이드 회귀 가드 ===');
  console.log(`  base URL: ${BASE_URL}`);
  const browser = await chromium.launch({ headless: true });
  const result = { timestamp: new Date().toISOString(), baseUrl: BASE_URL, scenarios: {} };
  let allPass = true;
  try {
    result.scenarios.s1 = await scenarioAutoShow(browser);
    if (!result.scenarios.s1.pass) allPass = false;
    result.scenarios.s2 = await scenarioEscConflict(browser);
    if (!result.scenarios.s2.pass) allPass = false;
    result.scenarios.s3 = await scenarioDismissPersist(browser);
    if (!result.scenarios.s3.pass) allPass = false;
    result.scenarios.s4 = await scenarioReopenAndBackdrop(browser);
    if (!result.scenarios.s4.pass) allPass = false;
    result.scenarios.s5 = await scenarioMobile(browser);
    if (!result.scenarios.s5.pass) allPass = false;
    result.scenarios.s6 = await scenarioOtherModalsEscGuard(browser);
    if (!result.scenarios.s6.pass) allPass = false;
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
