#!/usr/bin/env node
/**
 * #391 Phase 2 — billboard alpha mask 회귀 가드.
 *
 * ADR `docs/decisions/20260502-391-phase2-billboard.md` §결정 §"developer 단계 작업 명세" §5.
 * cross-validate 이견 수용 #1 #2 #3 — 4px fallback 임계 / 공유 텍스처 / 저사양 GPU 관찰.
 *
 * 사용법:
 *   node apps/web/scripts/browser-verify-391-billboard.mjs            # 매트릭스 검증
 *   node apps/web/scripts/browser-verify-391-billboard.mjs --json     # JSON 결과만
 *
 * 검증 매트릭스 (8 cell, Phase 1 baseline 동일):
 *  - 시나리오 D — mercury/venus alpha mask 적용 여부 + pxDiameter 박제
 *      → DoD: pxDiameter ≥ 4px cell 에서 lowVariant.material.opacityTexture 존재 (alpha mask 적용)
 *      → DoD: pxDiameter < 4px cell 에서 lowVariant.material.opacityTexture = null (사각형 fallback)
 *  - 시나리오 E — DynamicTexture 공유 인스턴스 검증
 *      → DoD: scene.metadata.__lodBillboardAlphaMask 1개 (per-body 생성 금지)
 *      → DoD: low variant material 전건이 동일 opacityTexture reference 공유
 *        (#1207 정정 — 종전 주석은 "24개" 였으나 body 누적으로 값이 변한다. 계수를 박지 않는다)
 *
 * dev 빌드 의존: `window.__solarScene.getLodInfo()` + `window.__simCore.scene` (private API).
 *
 * 환경변수:
 *   BASE_URL  — 웹 서버 URL (기본 http://localhost:3000)
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * ## CI 배선 ([#1207](https://github.com/coseo12/astro-simulator/issues/1207))
 *
 * `ci.yml` `detect-and-test` 의 브라우저 회귀 가드 구간에 상시 배선돼 있다 (`verify:391-billboard`).
 * 도입(#391 / PR #394) 이래 CI 호출 `0` 건이었고, **배선 의도가 표명된 적도 없다** (도입 PR 본문에
 * CI 토큰 hit `0`, 「수동 도구로 명시」된 문장도 없음). 그래서 배선 근거는 의도가 아니라
 * **비어 있는 대역**이다 — 단위 테스트 `lod-billboard-alpha-mask.test.ts` 는 순수 함수(4px 경계)만
 * 재고, 시나리오 E (공유 DynamicTexture 단일성 = per-body 복제 회귀) 와 시나리오 D (`runLodPass`
 * 의 토글이 실제 material 까지 반영되는가) 는 CI 어디에도 없었다.
 * 어느 워크플로에 거는가의 판단 기준은
 * [`docs/ops/browser-verify-helpers.md`](../../../docs/ops/browser-verify-helpers.md) §CI 배선 이
 * 정본이다 — 본 가드의 판정량은 픽셀이 아니라 **material 상태 + pxDiameter** 다.
 *
 * ## 판별력 실측 (#1207, 2026-09-22~23 · rev `1c1254e` · 로컬 dev 서버 headless)
 *
 * 앱(`packages/core`)에 변이를 주입해 시나리오별 독립 FAIL 을 실증했다. 무주입 대조군은 주입
 * 전·후 모두 `exit 0` (3중 시뮬: positive → negative → recovery).
 *
 * | 변이 (주입 대상 = 앱) | 발화 지점 | 결과 |
 * | --- | --- | --- |
 * | `getOrCreateBillboardAlphaMask` 의 공유 캐시 조회 제거 (per-body 생성) | E `opacityTexture` 고유 인스턴스 `1 → 30` | `exit 1` |
 * | `shouldApplyBillboardAlphaMask` 를 상시 `false` 로 | D cell `8/8 → 4/8` | `exit 1` |
 *
 * ⚠️ **D 의 판별력은 `level === 'mid'` cell 에서만 나온다.** `level === 'low'` cell 은 #675 glow
 * marker 가 `wantsMask = glow.active || shouldApply…` 로 mask 를 **강제 유지**하므로 위 변이에도
 * 통과한다 (실측 — 변이판에서 low cell 4 개는 `mask=true` 로 PASS). 8 cell 매트릭스를 줄이면
 * 이 축이 죽으므로 축소하지 말 것.
 *
 * ## 알려진 사각 3 종
 *
 * ⚠️ **(1) 4px fallback 분기 미도달** — 매트릭스 전 cell 에서 `pxDiameter ≥ 4px` 라
 * **`fallback 진입 cell = 0`** 이다 (실측). 즉 시나리오 D 는 4px 미만의 사각형 fallback 쪽
 * 분기를 한 번도 밟지 않는다. 그 경계는 `lod-billboard-alpha-mask.test.ts` 의 `3.9 / 4.1px`
 * 단위 테스트가 담당한다.
 *
 * ⚠️ **(2) 시나리오 E 의 fail-open — 덮는 것은 시나리오 D 「단층」이다.**
 * `runScenarioE` 의 판정은 `sharedExists && uniqueCount <= 1` 이라 mask 가 **하나도 적용되지
 * 않은** 상태(`uniqueCount === 0`)에서도 참이다. 형제 조건 `sharedMaskExists` 는 그 대역을
 * **덮지 못한다** — 그 상태에서 `true` 이기 때문이다 (#1207 정정. 종전 서술은 형제 조건과 D 가
 * 함께 덮는다고 적었다). 코드로 확인한 도달 경로: `body-mesh-factory.ts` 가 low material 생성
 * 시점에 `getOrCreateBillboardAlphaMask(scene)` 를 불러 **`scene.metadata` 캐시를 남기고**,
 * 이후 `solar-system-scene.ts` 의 `runLodPass` 가 `lowMat.opacityTexture = null` 로 되돌릴 수
 * 있다 ⇒ 「캐시 존재 + 고유 인스턴스 0」 은 도달 가능하다. 실제로 mask 판정을 상시 `false` 로
 * 만든 변이(위 표 2 행)가 그 경로였고, 그때 FAIL 을 낸 것은 **D 뿐**이다 (`8/8 → 4/8`).
 *
 * ⚠️ **(3) 그 시나리오 D 자신의 공허 통과** ([#1201](https://github.com/coseo12/astro-simulator/issues/1201) 클래스).
 * `runScenarioD` 는 `measurement.bodyResults[id]` 가 없으면 `bodyChecks[id] = { error: … }` 를
 * 적고 `continue` 할 뿐 **`cellPass` 를 내리지 않는다.** `bodyResults` 는 `<id>-lod-low` mesh +
 * material 이 있을 때만 채워지므로, `mercury` / `venus` 의 low variant(또는 그 material)가
 * 사라지면 그 cell 은 **단언 0 개로 PASS** 하고 `pass = cellsPass === cellsTotal` 이라 D 전체가
 * PASS 한다. (2) 와 겹치면 D·E 가 둘 다 통과한다. **술어 개정은 #1207 계약의 비목표**라
 * 여기서는 기록만 한다 — 사용자 판정 대기.
 */

import { withBrowser } from '../../../scripts/browser-verify-utils.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
void __dirname;

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const args = process.argv.slice(2);
const flags = {
  json: args.includes('--json'),
};

/**
 * Phase 1 baseline 과 동일 8 cell — 매트릭스 일관성 보존.
 * forensic 측정 (`docs/reports/391-forensic/output.json`) 매트릭스 SSoT.
 */
const SCENARIO_VIEWPORTS = [
  { id: '320x568_dpr1', width: 320, height: 568, dpr: 1 },
  { id: '375x667_dpr1', width: 375, height: 667, dpr: 1 },
  { id: '375x667_dpr2', width: 375, height: 667, dpr: 2 },
  { id: '414x896_dpr2', width: 414, height: 896, dpr: 2 },
  { id: '1280x720_dpr1', width: 1280, height: 720, dpr: 1 },
  { id: '1440x900_dpr1', width: 1440, height: 900, dpr: 1 },
  { id: '1440x900_dpr2', width: 1440, height: 900, dpr: 2 },
  { id: '1920x1080_dpr1', width: 1920, height: 1080, dpr: 1 },
];

const ALPHA_MASK_MIN_PX = 4; // ADR SSoT — LOD_BILLBOARD_ALPHA_MASK_MIN_PX_DIAMETER

async function setupPage(browser, viewport, queryString) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.dpr ?? 1,
  });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}${queryString}`, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForFunction(
    () => typeof window.__simCore !== 'undefined' && typeof window.__solarScene !== 'undefined',
    { timeout: 15_000 },
  );
  // sun mesh 생성 + 첫 LOD pass + low variant lazy-create + 4px fallback 토글까지 안정.
  await page.waitForTimeout(2500);
  return { context, page };
}

/**
 * 한 viewport 에서 mercury/venus 의 pxDiameter + alpha mask material 상태 측정.
 *
 * lowVariant material 의 `opacityTexture` 존재 여부 + `transparencyMode` 를 박제하여
 * 4px fallback 분기가 실제 material 까지 반영됐는지 검증한다.
 */
async function measureAlphaMaskState(page) {
  return await page.evaluate(() => {
    /** @type {any} */
    const w = window;
    const solar = w.__solarScene;
    if (!solar?.getLodInfo) return { error: '__solarScene.getLodInfo() 미노출' };
    const lodInfo = solar.getLodInfo();
    if (!lodInfo?.length) return { error: 'lodInfo empty' };

    // private scene 참조 — Babylon Scene 인스턴스. SimulationCore.scene getter 노출.
    // sim-canvas.tsx 에서 `window.__simCore = SimulationCore instance` 박제됨.
    const scene = w.__simCore?.scene ?? null;
    if (!scene) return { error: 'scene reference 미노출 (window.__simCore.scene 확인)' };

    // scene.metadata.__lodBillboardAlphaMask 박제 (공유 인스턴스 단일성).
    const sharedMask = scene.metadata?.__lodBillboardAlphaMask ?? null;
    const sharedMaskUid = sharedMask?.uniqueId ?? null;

    // body 별 low variant material 상태 박제 (mercury/venus 우선).
    const bodyTargets = ['mercury', 'venus'];
    /** @type {Record<string, any>} */
    const bodyResults = {};
    /** @type {Set<number>} */
    const opacityTextureUids = new Set();
    let lowMaterialCount = 0;
    let lowMaterialWithMaskCount = 0;

    // scene.meshes 에서 모든 -lod-low mesh 의 material 검사.
    for (const mesh of scene.meshes ?? []) {
      if (!mesh?.name?.endsWith?.('-lod-low')) continue;
      const mat = mesh.material;
      if (!mat) continue;
      lowMaterialCount += 1;
      const opacity = mat.opacityTexture ?? null;
      if (opacity) {
        lowMaterialWithMaskCount += 1;
        opacityTextureUids.add(opacity.uniqueId);
      }
      // mercury / venus 만 상세 박제.
      const bodyId = mesh.name.replace('-lod-low', '');
      if (bodyTargets.includes(bodyId)) {
        const lodEntry = lodInfo.find((e) => e.id === bodyId);
        bodyResults[bodyId] = {
          pxDiameter: lodEntry?.pxDiameter ?? null,
          screenCoverage: lodEntry?.screenCoverage ?? null,
          level: lodEntry?.level ?? null,
          materialName: mat.name,
          hasOpacityTexture: opacity !== null,
          opacityTextureUid: opacity?.uniqueId ?? null,
          transparencyMode: mat.transparencyMode ?? null,
          alphaCutOff: mat.alphaCutOff ?? null,
          isVisible: mesh.isVisible,
        };
      }
    }

    return {
      sharedMaskExists: sharedMask !== null,
      sharedMaskUid,
      lowMaterialCount,
      lowMaterialWithMaskCount,
      opacityTextureUniqueCount: opacityTextureUids.size, // 공유면 1, per-body 면 N
      bodyResults,
    };
  });
}

async function runScenarioD(browser) {
  console.log('\n=== 시나리오 D — alpha mask 적용 여부 매트릭스 (8 cell) ===');
  const cellResults = [];
  let cellsPass = 0;
  let cellsTotal = 0;
  let fallbackCellCount = 0; // pxDiameter < 4px 진입 cell 수
  let alphaMaskCellCount = 0; // pxDiameter ≥ 4px + opacityTexture 적용 cell 수

  for (const viewport of SCENARIO_VIEWPORTS) {
    const { context, page } = await setupPage(browser, viewport, '/?gpu=a&lod=auto');
    const measurement = await measureAlphaMaskState(page);
    if (measurement.error) {
      console.log(`  ! ${viewport.id}: ${measurement.error}`);
      cellResults.push({ viewport: viewport.id, error: measurement.error });
      await context.close();
      continue;
    }

    // body 별 검증: 측정된 pxDiameter 와 material 상태 정합성.
    let cellPass = true;
    const bodyChecks = {};
    for (const id of ['mercury', 'venus']) {
      const body = measurement.bodyResults[id];
      if (!body) {
        bodyChecks[id] = { error: 'body not in scene' };
        continue;
      }
      const pxd = body.pxDiameter ?? 0;
      const expectMask = pxd >= ALPHA_MASK_MIN_PX;
      const actualMask = body.hasOpacityTexture === true && body.transparencyMode === 1;
      const actualFallback = body.hasOpacityTexture === false && body.transparencyMode === 0;
      const consistent = expectMask ? actualMask : actualFallback;
      bodyChecks[id] = {
        pxDiameter: pxd,
        expectMask,
        actualMask,
        actualFallback,
        transparencyMode: body.transparencyMode,
        level: body.level,
        consistent,
      };
      if (!consistent) cellPass = false;
      // 매트릭스 집계 (low level 인 body 만 의미).
      if (body.level === 'low') {
        if (expectMask && actualMask) alphaMaskCellCount += 1;
        if (!expectMask && actualFallback) fallbackCellCount += 1;
      }
    }

    cellsTotal += 1;
    if (cellPass) cellsPass += 1;
    console.log(
      `  ${viewport.id}: ${cellPass ? 'PASS' : 'FAIL'} | ` +
        `mercury(pxd=${bodyChecks.mercury?.pxDiameter?.toFixed(1) ?? 'n/a'}, lvl=${bodyChecks.mercury?.level ?? 'n/a'}, mask=${bodyChecks.mercury?.actualMask ?? 'n/a'}) | ` +
        `venus(pxd=${bodyChecks.venus?.pxDiameter?.toFixed(1) ?? 'n/a'}, lvl=${bodyChecks.venus?.level ?? 'n/a'}, mask=${bodyChecks.venus?.actualMask ?? 'n/a'})`,
    );
    cellResults.push({
      viewport: viewport.id,
      pass: cellPass,
      bodyChecks,
      lowMaterialCount: measurement.lowMaterialCount,
      lowMaterialWithMaskCount: measurement.lowMaterialWithMaskCount,
    });
    await context.close();
  }

  const pass = cellsPass === cellsTotal;
  console.log(`\n  --- 시나리오 D 요약 ---`);
  console.log(
    `  cell 통과: ${cellsPass}/${cellsTotal} — ${pass ? 'PASS' : 'FAIL'} ` +
      `(alpha mask 적용 cell=${alphaMaskCellCount}, fallback 진입 cell=${fallbackCellCount})`,
  );
  return { pass, cellResults, alphaMaskCellCount, fallbackCellCount };
}

async function runScenarioE(browser) {
  console.log('\n=== 시나리오 E — DynamicTexture 공유 인스턴스 검증 ===');
  // 1280×720 DPR1 단일 cell 로 충분 (공유 캐시는 viewport 무관).
  const { context, page } = await setupPage(
    browser,
    { id: '1280x720_dpr1', width: 1280, height: 720, dpr: 1 },
    '/?gpu=a&lod=auto',
  );
  const measurement = await measureAlphaMaskState(page);
  if (measurement.error) {
    console.log(`  ! ${measurement.error}`);
    await context.close();
    return { pass: false, error: measurement.error };
  }
  const sharedExists = measurement.sharedMaskExists === true;
  const uniqueCount = measurement.opacityTextureUniqueCount;
  // 공유면 1, per-body 생성이면 24 (회귀 신호).
  const isShared = uniqueCount <= 1;
  const pass = sharedExists && isShared;

  console.log(
    `  scene.metadata.__lodBillboardAlphaMask 존재: ${sharedExists} | ` +
      `low material 총 ${measurement.lowMaterialCount}개 중 mask 적용 ${measurement.lowMaterialWithMaskCount}개 | ` +
      `opacityTexture 고유 인스턴스 = ${uniqueCount} (공유면 ≤1, per-body 생성이면 N)`,
  );
  console.log(`  ${pass ? 'PASS' : 'FAIL'} (공유 인스턴스 단일성 + scene 캐시 박제)`);
  await context.close();
  return {
    pass,
    sharedExists,
    uniqueCount,
    lowMaterialCount: measurement.lowMaterialCount,
    lowMaterialWithMaskCount: measurement.lowMaterialWithMaskCount,
  };
}

async function main() {
  let allPass = true;
  const fullResult = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    alphaMaskMinPxDiameter: ALPHA_MASK_MIN_PX,
    scenarios: {},
  };

  // #940 — 브라우저 수명주기를 `withBrowser` 로 위임 (에러 경로 close 도달 보장).
  // launch 인자는 원본 그대로 전달한다 (렌더러 축 불변 — docs/ops/browser-verify-helpers.md).
  await withBrowser({ headless: true }, async (browser) => {
    const d = await runScenarioD(browser);
    fullResult.scenarios.D = d;
    if (!d.pass) allPass = false;

    const e = await runScenarioE(browser);
    fullResult.scenarios.E = e;
    if (!e.pass) allPass = false;
  });

  console.log('\n=== 최종 요약 ===');
  console.log(`overall: ${allPass ? 'PASS' : 'FAIL'}`);
  console.log(
    `  시나리오 D (alpha mask 매트릭스): ${fullResult.scenarios.D?.pass ? 'PASS' : 'FAIL'}`,
  );
  console.log(`  시나리오 E (공유 인스턴스): ${fullResult.scenarios.E?.pass ? 'PASS' : 'FAIL'}`);

  if (flags.json) {
    console.log('\n=== JSON 결과 ===');
    console.log(JSON.stringify(fullResult, null, 2));
  }

  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error('[browser-verify-391-billboard] unhandled error:', err);
  process.exit(2);
});
