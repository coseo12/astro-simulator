#!/usr/bin/env node
/**
 * #379 fix 회귀 가드 — LOD billboard fallback 비율 + screenCoverage 식 정확성 검증.
 *
 * ADR `docs/decisions/20260502-379-fix-decision.md` §"Phase 1 구현 PR" §"회귀 가드"
 * cross-validate 이견 수용 #3 — 3종 LOD 시나리오 매트릭스 검증.
 *
 * 사용법:
 *   node apps/web/scripts/browser-verify-379-lod.mjs                 # 3종 시나리오 검증
 *   node apps/web/scripts/browser-verify-379-lod.mjs --json           # JSON 결과만 (CI artifact)
 *   node apps/web/scripts/browser-verify-379-lod.mjs --update          # baseline 업데이트
 *
 * 검증 매트릭스 (viewport 정본은 아래 `SCENARIO_A_VIEWPORTS` 배열 — 주석에 계수를 두지 않는다):
 *  - 시나리오 A: T1 default 모바일/데스크톱 viewport × DPR 1/2 매트릭스
 *      → DoD: sun=high 100%, billboard fallback 비율 ≤ `SCENARIO_A_DOD.maxLowRatio`
 *  - 시나리오 B: T3 body focus (지구 / 화성 focus 진입) → focus body=high 보장
 *  - 시나리오 C: asteroid belt sub-pixel scenario (T1 solar 뷰에서 asteroid low billboard 유지)
 *
 * dev 빌드 의존: `window.__solarScene.getLodInfo()` (#388 dev overlay API).
 * production 빌드에서는 `__solarScene` 미노출 → 측정 자체 불가 (호출자에게 dev 서버 사용 안내).
 *
 * 환경변수:
 *   BASE_URL  — 웹 서버 URL (기본 http://localhost:3000)
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * ## CI 배선 ([#1207](https://github.com/coseo12/astro-simulator/issues/1207))
 *
 * `ci.yml` `detect-and-test` 의 브라우저 회귀 가드 구간에 상시 배선돼 있다 (`verify:379-lod`).
 * 도입(#379 / PR #390) 이래 **CI 호출 0 건**이었고, 도입 PR 본문의 *"CI 통합은 별도 follow-up"*
 * 이 집행되지 않은 채 남아 있었다. 어느 워크플로에 거는가의 판단 기준은
 * [`docs/ops/browser-verify-helpers.md`](../../../docs/ops/browser-verify-helpers.md) §CI 배선 이
 * 정본이다 — 본 가드의 판정량은 픽셀이 아니라 **LOD 레벨 분포 + 화면 반지름(px)** 이다.
 *
 * ## 판별력 실측 (#1207, 2026-09-22~23 · rev `1c1254e` · 로컬 dev 서버 headless)
 *
 * 「가드가 있다 ≠ 그 가드가 작동한다」([#1123](https://github.com/coseo12/astro-simulator/issues/1123))
 * 차단을 위해 **앱(`packages/core`)에 변이를 주입**해 시나리오별로 독립 FAIL 을 실증했다.
 * 무주입 대조군은 주입 전·후 모두 `exit 0` (3중 시뮬: positive → negative → recovery).
 *
 * | 변이 (주입 대상 = 앱) | 발화 지점 | 결과 |
 * | --- | --- | --- |
 * | `screenCoverageRadius` edge offset 축을 #379 fix 이전(cameraRight)으로 되돌림 | A `sunHighRatio` 7/8 | `exit 1` |
 * | `lodFromScreenCoverage` 의 focus 강제 high 를 `'low'` 로 반전 | B 2/2 FAIL | `exit 1` |
 * | 픽셀 경계 최하단 반환을 `'high'` 로 | C `high=28 > 5` | `exit 1` |
 * | 픽셀 에스컬레이션 제거 (전부 `'low'`) | A `maxLowRatio` 100% > 96% | `exit 1` |
 * | **focus 강제 high 분기를 *삭제*** | — | **`exit 0` — 미검출** |
 *
 * ⚠️ **마지막 행이 본 가드의 알려진 사각이다.** focus 진입 거리에서 지구/화성의 coverage 는
 * 이미 `LOD_PIXEL_THRESHOLDS.high` 를 넘으므로(실측 `74.7px` / `73.9px`) 픽셀 경로가 같은 답을
 * 낸다 — 시나리오 B 는 focus 강제 분기의 *반전*은 잡고 *제거*는 못 잡는다. 그 대역은
 * `lod.test.ts` 의 단위 테스트가 순수 함수 수준에서 담당한다.
 */

import { withBrowser } from '../../../scripts/browser-verify-utils.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const BASELINE_PATH = path.join(__dirname, '__baselines__', 'lod-379.json');

const args = process.argv.slice(2);
const flags = {
  json: args.includes('--json'),
  update: args.includes('--update'),
};

/**
 * 시나리오 A — T1 default 매트릭스 viewport 정의.
 * forensic 매트릭스 SSoT (`docs/reports/379-forensic/output.json`) 와 동일 viewport 풀에서
 * spot-check 추출 (전체 매트릭스 재측정 비용 절감 — cell 정본은 아래 배열이다).
 * ⚠️ 종전 주석은 "10 cell" 이었으나 배열 원소는 8 개다 (#1207 정정). 계수를 다시 박지 않는다.
 */
const SCENARIO_A_VIEWPORTS = [
  { id: '320x568_dpr1', width: 320, height: 568, dpr: 1, kind: 'mobile-narrow' },
  { id: '375x667_dpr1', width: 375, height: 667, dpr: 1, kind: 'mobile' },
  { id: '375x667_dpr2', width: 375, height: 667, dpr: 2, kind: 'mobile' },
  { id: '414x896_dpr2', width: 414, height: 896, dpr: 2, kind: 'mobile-large' },
  { id: '1280x720_dpr1', width: 1280, height: 720, dpr: 1, kind: 'desktop' },
  { id: '1440x900_dpr1', width: 1440, height: 900, dpr: 1, kind: 'desktop' },
  { id: '1440x900_dpr2', width: 1440, height: 900, dpr: 2, kind: 'desktop' },
  { id: '1920x1080_dpr1', width: 1920, height: 1080, dpr: 1, kind: 'desktop-wide' },
];

const SCENARIO_A_DOD = Object.freeze({
  // sun=high 비율 (모든 cell 에서 sun 이 high LOD 인지)
  sunHighRatio: 1.0, // = 100% (변경 시 ADR §재검토 트리거)
  // billboard fallback 비율 천장. 본 가드는 "sun 만 high 였던 fix 전" 회귀를 막는 것이 1차 목적.
  // mercury/venus mid 진입은 #385 라운드 3 영역 (architect ADR §재검토 #4).
  //
  // ── 여유 실측 (#1207, 2026-09-22~23 · rev `1c1254e` · 로컬 dev 서버 headless · N = 6) ──
  // 무주입 `maxLowRatio` = **`0.875` 6/6 회 동일** (8 cell 전건도 run 간 바이트 동일 — 분산 0).
  //   여유 `0.96 − 0.875 = 0.085` (32 body 기준 `2.7` body 분).
  // ⚠️ 착수 시 인계된 *"여유가 `0.002` 뿐"* 은 **`__baselines__/lod-379.json` (2026-05-02, 24 body)
  //   의 기록값 `0.9583`** 이지 현행 측정치가 아니었다. 그 사이 R-Phase 누적으로 body 가
  //   `24 → 32` 로 늘고 고DPR cell 의 mid 진입이 늘어 분모·분자가 함께 이동했다.
  //   ⇒ #1209 규약의 **재도출 조건 미발동**이라 임계를 **바꾸지 않는다** (새 임계 `0`).
  //
  // ── 임계 배치 (관측 3 점) ──
  //   건강 `0.875`  <  **임계 `0.96`**  <  픽셀 에스컬레이션 제거 변이 `1.000`
  //   가장 가까운 결함은 「sun 만 high」(`high=1 / low=31` → `0.96875`) 로 여유가 `0.00875` 뿐이다.
  //   그 상태는 형제 다리 `sunHighRatio` 가 **먼저** 잡으므로 본 다리는 그 경우의 이중 방어다.
  //   본 다리 단독 발화는 위 변이가 실증한다 (스크립트 헤더 §판별력 실측).
  //
  // ── 재검토 트리거 (접촉 기준 — CLAUDE.md §`deferred:no-incident` 수명주기 와 같은 관례) ──
  //   판정량이 **비율**이라 body 총수에 종속된다. high+mid 가 지금처럼 `4` 로 고정된 채 low 만
  //   늘면 `low / total` 은 `1` 로 단조 수렴하므로, total 이 `100` 을 넘는 시점부터 건강 상태가
  //   천장을 넘어 **거짓 발화**한다 (지금 `32`). ⇒ **body 를 추가하는 R-Phase 에서 본 가드를
  //   건드릴 때** 무주입 분포를 재측정하고 이 각주를 갱신한다. 완화는 silent 금지
  //   ([guard-design-principles](../../../docs/lessons/guard-design-principles.md) §2).
  maxLowRatio: 0.96,
});

async function setupPage(browser, viewport, queryString = '') {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.dpr ?? 1,
  });
  const page = await context.newPage();
  const url = `${BASE_URL}${queryString}`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForFunction(
    () => typeof window.__simCore !== 'undefined' && typeof window.__solarScene !== 'undefined',
    { timeout: 15_000 },
  );
  // 추가 안정 대기 — sun mesh 생성 + 첫 LOD pass 완료.
  await page.waitForTimeout(2200);
  return { context, page };
}

/** 한 viewport 에서 LOD info + lodStats 측정. */
async function measureLodMatrix(page) {
  return await page.evaluate(() => {
    const solar = /** @type {any} */ (window).__solarScene;
    if (!solar || !solar.getLodInfo) return { error: '__solarScene.getLodInfo() 미노출' };
    const lodInfo = solar.getLodInfo();
    if (!lodInfo || lodInfo.length === 0) return { error: 'lodInfo empty (runLodPass 미실행)' };

    const lodStats = solar.getLodStats ? solar.getLodStats() : null;

    // body 별 raw 데이터 박제 (sun/mercury/venus 만 SSoT — forensic 매트릭스 SSoT)
    const targets = ['sun', 'mercury', 'venus'];
    const bodyResults = {};
    for (const id of targets) {
      const entry = lodInfo.find((e) => e.id === id);
      if (entry) {
        bodyResults[id] = {
          level: entry.level,
          screenCoverage: entry.screenCoverage,
          pxDiameter: entry.pxDiameter,
          cameraDistanceMeters: entry.cameraDistanceMeters,
        };
      } else {
        bodyResults[id] = { error: 'body not found in lodInfo' };
      }
    }

    return {
      lodInfoCount: lodInfo.length,
      lodStats,
      bodyResults,
    };
  });
}

async function runScenarioA(browser) {
  console.log('\n=== 시나리오 A — T1 default 매트릭스 검증 ===');
  const cellResults = [];
  let sunHighCount = 0;
  let totalCells = 0;
  let maxLowRatio = 0;

  for (const viewport of SCENARIO_A_VIEWPORTS) {
    const { context, page } = await setupPage(browser, viewport, '/?gpu=a&lod=auto');
    const measurement = await measureLodMatrix(page);
    if (measurement.error) {
      console.log(`  ! ${viewport.id}: ${measurement.error}`);
      cellResults.push({ viewport: viewport.id, error: measurement.error });
      await context.close();
      continue;
    }
    const { lodStats, bodyResults } = measurement;
    const sunLevel = bodyResults.sun?.level ?? 'unknown';
    if (sunLevel === 'high') sunHighCount += 1;
    totalCells += 1;

    const total = lodStats.high + lodStats.mid + lodStats.low;
    const lowRatio = lodStats.low / total;
    if (lowRatio > maxLowRatio) maxLowRatio = lowRatio;

    console.log(
      `  ${viewport.id}: sun=${sunLevel} ` +
        `(coverage=${bodyResults.sun?.screenCoverage?.toFixed(1) ?? 'n/a'}px) | ` +
        `lodStats high=${lodStats.high}/mid=${lodStats.mid}/low=${lodStats.low} ` +
        `(low ratio=${(lowRatio * 100).toFixed(1)}%)`,
    );
    cellResults.push({
      viewport: viewport.id,
      kind: viewport.kind,
      sun: bodyResults.sun,
      mercury: bodyResults.mercury,
      venus: bodyResults.venus,
      lodStats,
    });
    await context.close();
  }

  const sunHighRatio = totalCells > 0 ? sunHighCount / totalCells : 0;
  const sunHighPass = sunHighRatio >= SCENARIO_A_DOD.sunHighRatio;
  const lowRatioPass = maxLowRatio <= SCENARIO_A_DOD.maxLowRatio;

  console.log('\n  --- 시나리오 A 요약 ---');
  console.log(
    `  sun=high 비율: ${sunHighCount}/${totalCells} (${(sunHighRatio * 100).toFixed(1)}%) — ` +
      `${sunHighPass ? 'PASS' : 'FAIL'} (DoD ≥ ${SCENARIO_A_DOD.sunHighRatio * 100}%)`,
  );
  console.log(
    `  최대 low ratio: ${(maxLowRatio * 100).toFixed(1)}% — ` +
      `${lowRatioPass ? 'PASS' : 'FAIL'} (DoD ≤ ${SCENARIO_A_DOD.maxLowRatio * 100}%)`,
  );

  return {
    pass: sunHighPass && lowRatioPass,
    sunHighRatio,
    maxLowRatio,
    cellResults,
  };
}

/** 시나리오 B — T3 body focus 진입 시 focus body 가 high LOD 인지 검증. */
async function runScenarioB(browser) {
  console.log('\n=== 시나리오 B — T3 body focus high 보장 ===');
  const focusTargets = ['earth', 'mars'];
  const cellResults = [];
  let allPass = true;

  for (const focusId of focusTargets) {
    // ?focus=<id> 로 진입 + ?gpu=a 로 tier-a 강제 (volt #77).
    const { context, page } = await setupPage(
      browser,
      { id: '1280x720_dpr1', width: 1280, height: 720, dpr: 1 },
      `/?gpu=a&focus=${focusId}&lod=auto`,
    );
    // T3 진입 + dolly 안정화 (focus 진입은 추가 transition 시간 필요).
    await page.waitForTimeout(2000);
    const measurement = await page.evaluate((focusId) => {
      const solar = /** @type {any} */ (window).__solarScene;
      if (!solar || !solar.getLodInfo) return { error: 'getLodInfo 미노출' };
      const lodInfo = solar.getLodInfo();
      const focusEntry = lodInfo.find((e) => e.id === focusId);
      return focusEntry ? { focus: focusEntry } : { error: `focus body ${focusId} not found` };
    }, focusId);

    if (measurement.error) {
      console.log(`  ! focus=${focusId}: ${measurement.error}`);
      allPass = false;
      cellResults.push({ focus: focusId, error: measurement.error });
      await context.close();
      continue;
    }
    const focusLevel = measurement.focus.level;
    const pass = focusLevel === 'high';
    if (!pass) allPass = false;
    console.log(
      `  focus=${focusId}: level=${focusLevel} ` +
        `(coverage=${measurement.focus.screenCoverage?.toFixed(1) ?? 'n/a'}px) — ` +
        `${pass ? 'PASS' : 'FAIL'} (focus body 는 항상 high)`,
    );
    cellResults.push({ focus: focusId, ...measurement.focus, pass });
    await context.close();
  }

  return { pass: allPass, cellResults };
}

/** 시나리오 C — asteroid belt sub-pixel body 가 low billboard 유지 (회귀 가드). */
async function runScenarioC(browser) {
  console.log('\n=== 시나리오 C — asteroid belt sub-pixel low 유지 ===');
  // T1 default + asteroid belt 활성화. 기본적으로 활성화돼 있어야 — 만일 다르면 별도 안내.
  const { context, page } = await setupPage(
    browser,
    { id: '1280x720_dpr1', width: 1280, height: 720, dpr: 1 },
    '/?gpu=a&lod=auto',
  );
  const measurement = await page.evaluate(() => {
    const solar = /** @type {any} */ (window).__solarScene;
    if (!solar || !solar.getLodInfo) return { error: 'getLodInfo 미노출' };
    const lodInfo = solar.getLodInfo();
    // asteroid kind 또는 id prefix 'asteroid' / 'belt'로 식별. 시스템 정의에 따라 다양.
    // 본 검증은 lodInfo 전체에서 low 비율을 측정 (sub-pixel asteroid 가 low 유지하면 high 가
    // 폭증하지 않음). asteroid belt 가 ThinInstances 라 lodInfo 에 별도 항목 없을 수 있음 —
    // 본 시나리오는 "lodInfo 전체 low 가 일정 비율 유지" 로 회귀 가드 (한쪽으로 쏠리지 않음 검증).
    const lodStats = solar.getLodStats ? solar.getLodStats() : null;
    return { lodInfo, lodStats };
  });
  if (measurement.error) {
    console.log(`  ! ${measurement.error}`);
    await context.close();
    return { pass: false, error: measurement.error };
  }
  const { lodStats } = measurement;
  // sub-pixel body 가 low 유지 — 24 body 중 high 가 폭증하지 않음 (≤ 5).
  // fix 가 모든 body 를 high 로 강제하면 이 조건 fail (의도치 않은 회귀).
  const HIGH_REGRESSION_LIMIT = 5;
  const pass = lodStats.high <= HIGH_REGRESSION_LIMIT;
  console.log(
    `  lodStats: high=${lodStats.high}/mid=${lodStats.mid}/low=${lodStats.low} — ` +
      `${pass ? 'PASS' : 'FAIL'} (high ≤ ${HIGH_REGRESSION_LIMIT} 회귀 임계)`,
  );
  await context.close();
  return { pass, lodStats };
}

async function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
}

async function main() {
  let allPass = true;
  const fullResult = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    scenarios: {},
  };

  // #940 — 브라우저 수명주기를 `withBrowser` 로 위임 (에러 경로 close 도달 보장).
  // launch 인자는 원본 그대로 전달한다 (렌더러 축 불변 — docs/ops/browser-verify-helpers.md).
  await withBrowser({ headless: true }, async (browser) => {
    const a = await runScenarioA(browser);
    fullResult.scenarios.A = a;
    if (!a.pass) allPass = false;

    const b = await runScenarioB(browser);
    fullResult.scenarios.B = b;
    if (!b.pass) allPass = false;

    const c = await runScenarioC(browser);
    fullResult.scenarios.C = c;
    if (!c.pass) allPass = false;
  });

  // baseline 비교 (있을 경우).
  const baseline = await loadBaseline();
  if (baseline && !flags.update) {
    const baseSunHigh = baseline.scenarios?.A?.sunHighRatio ?? null;
    const currentSunHigh = fullResult.scenarios.A?.sunHighRatio ?? null;
    if (baseSunHigh !== null && currentSunHigh !== null) {
      console.log(
        `\n=== baseline 비교 ===\n  sun=high baseline=${(baseSunHigh * 100).toFixed(1)}% / current=${(currentSunHigh * 100).toFixed(1)}%`,
      );
      if (currentSunHigh < baseSunHigh - 0.05) {
        console.log('  ! sun=high 비율이 baseline 대비 5%p 이상 하락 — 회귀 의심');
        allPass = false;
      }
    }
  }

  // baseline 업데이트.
  if (flags.update) {
    fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(fullResult, null, 2));
    console.log(`\n  baseline 업데이트: ${path.relative(process.cwd(), BASELINE_PATH)}`);
  }

  console.log('\n=== 최종 요약 ===');
  console.log(`overall: ${allPass ? 'PASS' : 'FAIL'}`);
  console.log(
    `  시나리오 A (T1 default 매트릭스): ${fullResult.scenarios.A?.pass ? 'PASS' : 'FAIL'}`,
  );
  console.log(`  시나리오 B (T3 focus high): ${fullResult.scenarios.B?.pass ? 'PASS' : 'FAIL'}`);
  console.log(
    `  시나리오 C (asteroid sub-pixel low): ${fullResult.scenarios.C?.pass ? 'PASS' : 'FAIL'}`,
  );

  if (flags.json) {
    console.log('\n=== JSON 결과 ===');
    console.log(JSON.stringify(fullResult, null, 2));
  }

  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error('[browser-verify-379-lod] unhandled error:', err);
  process.exit(2);
});
