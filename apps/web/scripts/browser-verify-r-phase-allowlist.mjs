#!/usr/bin/env node
/**
 * #402 회귀 가드 — R-Phase Body Allowlist UI/Scene 가드 정합성 검증.
 *
 * ADR `docs/decisions/20260504-r-phase-allowlist-guard.md` §결정 4 (4곳 동시 박제) +
 * §결정 2 (UI 가드) + §결정 3 (Scene 가드).
 *
 * 검증 항목:
 *  1) UI 가드 — shortcut bar 의 R-Phase 미활성 body 버튼이 HTML disabled + aria-disabled +
 *     data-r-phase-disabled="true" 속성 박제 (DoD-2)
 *  2) UI 가드 — R-Phase 활성 body 버튼은 disabled 아님 (정상 동작 회귀 차단)
 *  3) Scene 가드 — URL 직접 진입 (`?focus=earth`) 시 selectedBodyId 변화 0 / camera 이동 0
 *     (DoD-3, UI 가드 우회)
 *
 * R-Phase 진입 시 본 expected list 갱신 의무 (ADR §결정 4):
 *   R4 (지구) → EXPECTED_DISABLED 에서 'earth' 제거 + EXPECTED_ENABLED 에 추가
 *   R6 (목성) → 'jupiter' 동일
 *   R10 (해왕성) → 'neptune' 동일
 *
 * 사용법:
 *   node apps/web/scripts/browser-verify-r-phase-allowlist.mjs            # 풀 매트릭스
 *   node apps/web/scripts/browser-verify-r-phase-allowlist.mjs --json     # JSON 결과만
 *
 * 환경변수:
 *   BASE_URL  — 웹 서버 URL (기본 http://localhost:3000)
 *
 * dev 빌드 의존: `window.__simCore` (sim-canvas.tsx) — Scene 가드 검증 시 selectedBodyId 비교.
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

const args = process.argv.slice(2);
const flags = {
  json: args.includes('--json'),
};

// R-Phase 활성 body — ADR §초기 박제값 (R1 sun + R2 mercury + R3 venus).
// R4 진입 시 'earth' 추가, R6 시 'jupiter', R10 시 'neptune' (4곳 박제 절차).
const EXPECTED_ENABLED = ['sun', 'mercury', 'venus'];

// R-Phase 미활성 body — shortcut bar 잔존 버튼 (제거 정책 X, disabled 처리).
// R-Phase 진입 시 본 list 에서 제거 + EXPECTED_ENABLED 로 이동.
const EXPECTED_DISABLED = ['earth', 'jupiter', 'neptune'];

const VIEWPORT = { width: 1280, height: 800, dpr: 1 };

/** 페이지 로드 + dev 핸들 노출 대기. */
async function setupPage(browser, urlPath = '/') {
  const context = await browser.newContext({
    viewport: { width: VIEWPORT.width, height: VIEWPORT.height },
    deviceScaleFactor: VIEWPORT.dpr,
  });
  const page = await context.newPage();
  const url = `${BASE_URL}${urlPath}`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForFunction(() => typeof window.__simCore !== 'undefined', { timeout: 15_000 });
  return { context, page };
}

/** UI 가드 검증 — DoD-2. */
async function verifyUIGuard(browser) {
  console.log('\n=== UI 가드 (DoD-2) — shortcut bar disabled 속성 ===\n');
  const { context, page } = await setupPage(browser, '/');
  const reasons = [];

  // 활성 body 검증 — disabled 아님 + data-r-phase-disabled 속성 부재.
  for (const id of EXPECTED_ENABLED) {
    const result = await page.evaluate((id) => {
      const btn = document.querySelector(`[data-testid="focus-${id}"]`);
      if (!btn) return { found: false };
      return {
        found: true,
        disabled: btn.hasAttribute('disabled') || btn.disabled === true,
        ariaDisabled: btn.getAttribute('aria-disabled'),
        dataRPhaseDisabled: btn.getAttribute('data-r-phase-disabled'),
      };
    }, id);
    if (!result.found) {
      reasons.push(`UI guard: focus-${id} 버튼 미존재 (R-Phase 활성 body 누락)`);
      continue;
    }
    if (result.disabled) {
      reasons.push(`UI guard: focus-${id} (활성 body) 가 disabled 상태 — 회귀 (정상 동작 차단)`);
    }
    if (result.dataRPhaseDisabled !== null) {
      reasons.push(
        `UI guard: focus-${id} (활성 body) data-r-phase-disabled=${result.dataRPhaseDisabled} — 부재여야 함`,
      );
    }
    console.log(
      `  focus-${id.padEnd(8)} (활성):   disabled=${result.disabled} aria-disabled=${result.ariaDisabled ?? 'null'} data-r-phase-disabled=${result.dataRPhaseDisabled ?? 'null'}`,
    );
  }

  // 미활성 body 검증 — disabled + aria-disabled="true" + data-r-phase-disabled="true".
  for (const id of EXPECTED_DISABLED) {
    const result = await page.evaluate((id) => {
      const btn = document.querySelector(`[data-testid="focus-${id}"]`);
      if (!btn) return { found: false };
      return {
        found: true,
        disabled: btn.hasAttribute('disabled') || btn.disabled === true,
        ariaDisabled: btn.getAttribute('aria-disabled'),
        dataRPhaseDisabled: btn.getAttribute('data-r-phase-disabled'),
        className: btn.className,
      };
    }, id);
    if (!result.found) {
      reasons.push(`UI guard: focus-${id} 버튼 미존재 (미활성 body 누락)`);
      continue;
    }
    if (!result.disabled) {
      reasons.push(
        `UI guard: focus-${id} (미활성 body) 가 disabled 아님 — R-Phase 가드 누락 (사용자 D-T2 잔재 회귀)`,
      );
    }
    if (result.ariaDisabled !== 'true') {
      reasons.push(
        `UI guard: focus-${id} aria-disabled="${result.ariaDisabled}" — 'true' 박제 누락 (a11y)`,
      );
    }
    if (result.dataRPhaseDisabled !== 'true') {
      reasons.push(
        `UI guard: focus-${id} data-r-phase-disabled="${result.dataRPhaseDisabled}" — 'true' 박제 누락`,
      );
    }
    if (!result.className?.includes('opacity-50')) {
      reasons.push(`UI guard: focus-${id} className 에 opacity-50 부재 — 시각 차별화 누락`);
    }
    console.log(
      `  focus-${id.padEnd(8)} (미활성): disabled=${result.disabled} aria-disabled=${result.ariaDisabled ?? 'null'} data-r-phase-disabled=${result.dataRPhaseDisabled ?? 'null'}`,
    );
  }

  await context.close();
  return { pass: reasons.length === 0, reasons };
}

/** Scene 가드 검증 — DoD-3. URL 직접 진입 시 selectedBodyId 변화 0. */
async function verifySceneGuard(browser) {
  console.log('\n=== Scene 가드 (DoD-3) — URL 직접 진입 selectedBodyId 변화 0 ===\n');
  const reasons = [];

  for (const id of EXPECTED_DISABLED) {
    // URL `?focus=earth` 등 R-Phase 미활성 body 직접 진입.
    const { context, page } = await setupPage(browser, `/?gpu=a&focus=${id}`);
    // url-sync 가 sendCommand({type:'focusOn', bodyId: 'earth'}) 발행 → simulation-core 가드 차단.
    // store 갱신 안정화 대기.
    await page.waitForTimeout(2000);

    const state = await page.evaluate(() => {
      // sim-store 의 selectedBodyId 읽기 — store 가 window 에 노출되어 있지 않다면 sim-canvas 우회.
      // url-sync 동작 후 sendCommand → core → emit('bodySelected') → store.setSelectedBody.
      // R-Phase 미활성 body 라면 emit 차단 → store 변화 0 → selectedBodyId === null.
      const simStore = window.__simStore;
      if (simStore && typeof simStore.getState === 'function') {
        return { source: 'window.__simStore', selectedBodyId: simStore.getState().selectedBodyId };
      }
      // fallback — DOM 의 active 클래스로 간접 검증 (active body 있으면 bg-primary/20).
      const activeBtn = document.querySelector('[data-testid^="focus-"][class*="bg-primary/20"]');
      return {
        source: 'DOM fallback',
        activeBtnId: activeBtn?.getAttribute('data-testid') ?? null,
      };
    });

    const blocked =
      (state.source === 'window.__simStore' && state.selectedBodyId === null) ||
      (state.source === 'DOM fallback' && state.activeBtnId === null);

    if (!blocked) {
      reasons.push(
        `Scene guard: ?focus=${id} 직접 진입 시 차단 실패 — state=${JSON.stringify(state)} (사용자 D-T2 잔재 회귀)`,
      );
    }
    console.log(
      `  ?focus=${id.padEnd(8)} → ${blocked ? 'BLOCKED' : 'LEAKED'}  | state=${JSON.stringify(state)}`,
    );

    await context.close();
  }

  return { pass: reasons.length === 0, reasons };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const fullResult = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    expectedEnabled: EXPECTED_ENABLED,
    expectedDisabled: EXPECTED_DISABLED,
    uiGuard: null,
    sceneGuard: null,
  };
  let allPass = true;

  try {
    fullResult.uiGuard = await verifyUIGuard(browser);
    if (!fullResult.uiGuard.pass) allPass = false;

    fullResult.sceneGuard = await verifySceneGuard(browser);
    if (!fullResult.sceneGuard.pass) allPass = false;
  } finally {
    await browser.close();
  }

  console.log('\n=== 최종 요약 ===');
  console.log(`  UI guard:    ${fullResult.uiGuard.pass ? 'PASS' : 'FAIL'}`);
  console.log(`  Scene guard: ${fullResult.sceneGuard.pass ? 'PASS' : 'FAIL'}`);
  console.log(`  overall:     ${allPass ? 'PASS' : 'FAIL'}`);

  if (!allPass) {
    console.log('\n  실패 사유:');
    for (const r of [...fullResult.uiGuard.reasons, ...fullResult.sceneGuard.reasons]) {
      console.log(`    - ${r}`);
    }
  }

  if (flags.json) {
    console.log('\n--- JSON ---');
    console.log(JSON.stringify(fullResult, null, 2));
  }

  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error('\n  FATAL:', err);
  process.exit(2);
});
