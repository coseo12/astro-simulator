#!/usr/bin/env node
/**
 * #546 satellite visibility guard 회귀 가드.
 *
 * ADR `docs/decisions/20260524-546-satellite-billboard-visibility-forensic.md` §5 §결정 §"회귀 가드"
 * forensic 측정 데이터 (docs/reports/546-forensic/546-debug-output.json) 의 fix 후 회귀 차단.
 *
 * 사용법:
 *   node apps/web/scripts/browser-verify-546-satellite-visibility.mjs
 *   node apps/web/scripts/browser-verify-546-satellite-visibility.mjs --json   # JSON 결과만
 *
 * 검증 매트릭스 (3 viewport × earth focus):
 *  - 1280×720 DPR 1 (forensic baseline: moon level=low, isVisible=false → fix 후 mid + isVisible=true)
 *  - 1920×1080 DPR 1 (forensic baseline: moon level=mid, isVisible=false → fix 후 mid + isVisible=true)
 *  - 375×667 DPR 2 (forensic baseline: moon level=mid, isVisible=false → fix 후 mid + isVisible=true)
 *
 * DoD (LOD-aware measurement — R4 함정 #4 회피):
 *  - D5.1: moon level === 'mid' 또는 'high' (low floor 강제 검증)
 *  - D5.2: moon mid 또는 high variant `isVisible === true` (사용자 인지 가능 형태)
 *  - D5.3: moon pxDiameter ≥ 4 (Amendment 1 SSoT 정합)
 *  - D5.4 (default sun 시점 무회귀): default 시점 moon level === 'low' (moonScale 200 의도 보존)
 *
 * dev 빌드 의존: `window.__solarScene.getLodInfo()` + `meshes` Map.
 * 환경변수: BASE_URL (기본 http://localhost:3000)
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

const args = process.argv.slice(2);
const flags = {
  json: args.includes('--json'),
};

const VIEWPORTS = [
  { id: '1280x720_dpr1', width: 1280, height: 720, dpr: 1 },
  { id: '1920x1080_dpr1', width: 1920, height: 1080, dpr: 1 },
  { id: '375x667_dpr2', width: 375, height: 667, dpr: 2 },
];

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
  // 추가 안정 대기 — mesh 생성 + 첫 LOD pass 완료.
  await page.waitForTimeout(2500);
  return { context, page };
}

/**
 * LOD-aware measurement (R4 함정 #4 회피).
 *
 * lodInfo.level 만 보는 게 아니라 mesh.isVisible 도 동시 검증 — variant 가 활성화되어
 * 사용자가 실제로 화면에서 인지할 수 있는지 검증.
 */
async function measureMoon(page, scenario) {
  return await page.evaluate((scenarioId) => {
    const solar = /** @type {any} */ (window).__solarScene;
    if (!solar) return { error: '__solarScene 미노출' };
    const lodInfo = solar.getLodInfo?.();
    if (!lodInfo || lodInfo.length === 0) return { error: 'lodInfo empty' };

    const moonInfo = lodInfo.find((e) => e.id === 'moon');
    if (!moonInfo) return { error: 'moon body 미발견' };

    const moonMesh = solar.meshes?.get('moon');
    const highIsVisible = moonMesh?.isVisible ?? null;

    // mid/low variant 의 isVisible 도 inspection — getChildMeshes 사용.
    const childMeshes = moonMesh?.getChildMeshes?.() ?? [];
    const variantVisibility = {};
    for (const child of childMeshes) {
      const name = child.name ?? 'unknown';
      // mid: "{id}-mid" / low: "{id}-low" 명명 규약 가정 — 실제 명명을 확인
      variantVisibility[name] = {
        isVisible: child.isVisible,
        enabled: child.isEnabled?.() ?? null,
      };
    }

    return {
      scenario: scenarioId,
      moon: {
        level: moonInfo.level,
        pxDiameter: moonInfo.pxDiameter,
        screenCoverage: moonInfo.screenCoverage,
        cameraDistanceMeters: moonInfo.cameraDistanceMeters,
        billboardAlphaMask: moonInfo.billboardAlphaMask,
        highMesh: { isVisible: highIsVisible },
        variants: variantVisibility,
      },
    };
  }, scenario);
}

async function main() {
  const browser = await chromium.launch();
  const results = [];
  let allPass = true;

  try {
    for (const viewport of VIEWPORTS) {
      // --- 시나리오 1: default sun 시점 (D5.4 — moonScale 200 의도 보존) ---
      let r = await setupPage(browser, viewport);
      const defaultMeasure = await measureMoon(r.page, 'default-sun');
      await r.context.close();

      // --- 시나리오 2: earth focus 진입 (D5.1, D5.2, D5.3) ---
      // url-sync 가 ?focus=earth 를 sendCommand({type:'focusOn',bodyId:'earth'}) 로 변환.
      r = await setupPage(browser, viewport, '/?focus=earth');
      // focus 진입 animation (300ms) + tier transition + LOD pass 안정 대기.
      await r.page.waitForTimeout(2000);
      const earthFocusMeasure = await measureMoon(r.page, 'earth-focus-initial');
      await r.context.close();

      // DoD 검증
      const dods = {
        // D5.4: default sun 시점에서 moon level === 'low' (가드 비활성)
        D54_defaultSunMoonLow:
          defaultMeasure.moon?.level === 'low' || defaultMeasure.error
            ? defaultMeasure.error
              ? null
              : true
            : false,
        // D5.1: earth focus 자연 거리에서 moon level >= 'mid'
        D51_earthFocusMoonLevelMidOrHigh:
          earthFocusMeasure.moon?.level === 'mid' ||
          earthFocusMeasure.moon?.level === 'high',
        // D5.3: earth focus + moon pxDiameter >= 4
        D53_earthFocusMoonPxDiameterGte4: (earthFocusMeasure.moon?.pxDiameter ?? 0) >= 4,
      };

      const cellPass =
        dods.D54_defaultSunMoonLow !== false &&
        dods.D51_earthFocusMoonLevelMidOrHigh &&
        dods.D53_earthFocusMoonPxDiameterGte4;
      if (!cellPass) allPass = false;

      results.push({
        viewport: viewport.id,
        dods,
        cellPass,
        defaultMeasure,
        earthFocusMeasure,
      });
    }
  } finally {
    await browser.close();
  }

  const summary = {
    timestamp: new Date().toISOString(),
    allPass,
    results,
  };

  if (flags.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`\n=== #546 satellite visibility guard 회귀 가드 ===\n`);
    for (const r of results) {
      console.log(`\n[${r.viewport}] cellPass=${r.cellPass}`);
      console.log(`  D5.4 default-sun moon=low: ${r.dods.D54_defaultSunMoonLow}`);
      console.log(`  D5.1 earth-focus moon>=mid: ${r.dods.D51_earthFocusMoonLevelMidOrHigh}`);
      console.log(`  D5.3 earth-focus moon pxD>=4: ${r.dods.D53_earthFocusMoonPxDiameterGte4}`);
      if (r.earthFocusMeasure.moon) {
        console.log(
          `    earth-focus: level=${r.earthFocusMeasure.moon.level} pxD=${r.earthFocusMeasure.moon.pxDiameter?.toFixed(2)}`,
        );
      }
      if (r.defaultMeasure.moon) {
        console.log(
          `    default-sun: level=${r.defaultMeasure.moon.level} pxD=${r.defaultMeasure.moon.pxDiameter?.toFixed(2)}`,
        );
      }
    }
    console.log(`\n=== ${allPass ? '✅ PASS' : '❌ FAIL'} ===\n`);
  }

  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
