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
 * ## 종료 코드 계약 (#1207 E7)
 *
 * `0` = PASS / `1` = **제품 FAIL** (측정은 됐고 단언이 거짓) / `2` = **측정 불가** (계측 채널이
 * 없어 판정에 도달하지 못함 — PASS 도 FAIL 도 아니다). CI step 에 `|| true` 가 없으므로 `2` 도
 * 빨강이다. 이 스크립트는 도입 때부터 `main().catch` 에서 `2` 를 썼고, 그 자리를 넓힌 것이다.
 *
 * **합성은 확정 FAIL 우선** — 어느 시나리오든 확정 FAIL 이 있으면 `1`, FAIL 이 없고 측정 불가만
 * 있으면 `2`. `browser-verify-818-focus-zoom.mjs` §종료 코드 합성 과 같은 규칙이다. 반대로 두면
 * 제품 결함이 「측정 불가」 뒤에 숨는다 (#1215 MC-9 가 치른 대가).
 *
 * 무엇이 어느 쪽인가의 기준은 **하네스가 통제하는가**다 (#1215 — 전제 ↔ 게이트를 섞지 않는다).
 *  - `measureAlphaMaskState` 가 내는 `error` 3 종(`getLodInfo` 미노출 / `lodInfo empty` /
 *    `__simCore.scene` 미노출)은 전부 **dev 빌드 private API 라는 하네스 전제**의 붕괴다.
 *    이 상태에서는 제품이 건강한지 아픈지 **한 비트도 말할 수 없다** ⇒ `2`.
 *  - `<id>-lod-low` mesh + material 의 부재는 다르다. 그것은 **제품 코드가 만드는 것**
 *    (`body-mesh-factory.ts` `createBodyBillboard`) 이고 시나리오 D 단언의 **주어 자신**이다.
 *    계측 채널은 멀쩡히 작동해 「그 body 에 low variant 가 없다」고 **답을 준 것**이다 ⇒ `1`.
 *    전제에 넣으면 이 결함이 전제 위반 뒤로 숨는다.
 *
 * ## 알려진 사각
 *
 * ⚠️ 표제에 계수를 박지 않는다. 「N 종」은 목록이 닫혔다는 인상을 주는데, 이 목록은 실제로 상위
 * 집합을 하나 놓친 적이 있다 — 아래 「분모 소거」는 종전 (3) 의 상위 집합인데 표제가 「3 종」이라
 * 이미 덮인 것처럼 보였다 (#1207 reviewer R8).
 *
 * ### 열려 있는 것
 *
 * ⚠️ **4px fallback 분기 미도달** — 매트릭스 전 cell 에서 `pxDiameter ≥ 4px` 라
 * **`fallback 진입 cell = 0`** 이다 (실측). 즉 시나리오 D 는 4px 미만의 사각형 fallback 쪽
 * 분기를 한 번도 밟지 않는다. 그 경계는 `lod-billboard-alpha-mask.test.ts` 의 `3.9 / 4.1px`
 * 단위 테스트가 담당한다.
 *
 * ⚠️ **시나리오 E 의 fail-open — 덮는 것은 시나리오 D 「단층」이다.**
 * `runScenarioE` 의 판정은 `sharedExists && uniqueCount <= 1` 이라 mask 가 **하나도 적용되지
 * 않은** 상태(`uniqueCount === 0`)에서도 참이다. 형제 조건 `sharedMaskExists` 는 그 대역을
 * **덮지 못한다** — 그 상태에서 `true` 이기 때문이다 (#1207 정정. 종전 서술은 형제 조건과 D 가
 * 함께 덮는다고 적었다). 코드로 확인한 도달 경로: `body-mesh-factory.ts` 가 low material 생성
 * 시점에 `getOrCreateBillboardAlphaMask(scene)` 를 불러 **`scene.metadata` 캐시를 남기고**,
 * 이후 `solar-system-scene.ts` 의 `runLodPass` 가 `lowMat.opacityTexture = null` 로 되돌릴 수
 * 있다 ⇒ 「캐시 존재 + 고유 인스턴스 0」 은 도달 가능하다. 실제로 mask 판정을 상시 `false` 로
 * 만든 변이(위 표 2 행)가 그 경로였고, 그때 FAIL 을 낸 것은 **D 뿐**이다 (`8/8 → 4/8`).
 *
 * ### 닫은 것 (#1207 E7 — 계약 재조정으로 범위 편입)
 *
 * 둘 다 [#1201](https://github.com/coseo12/astro-simulator/issues/1201) 클래스(「없음/부재」를
 * 통과로 읽는 술어)이고, 아래가 위의 **상위 집합**이다.
 *
 * ✅ **시나리오 D 의 단언 0 개 통과 — 대상 부재.** 종전 `runScenarioD` 는
 * `measurement.bodyResults[id]` 가 없으면 `bodyChecks[id] = { error: … }` 를 적고 `continue` 할
 * 뿐 **`cellPass` 를 내리지 않았다.** `bodyResults` 는 `<id>-lod-low` mesh + material 이 있을
 * 때만 채워지므로, `mercury` / `venus` 의 low variant(또는 그 material)가 사라지면 그 cell 은
 * 단언 0 개로 PASS 했다. ⇒ **부재를 `cellPass = false` 로** 내린다 (위 §종료 코드 계약 — 제품
 * 속성이므로 `1`).
 *
 * ✅ **시나리오 D 의 분모 소거 — 측정 실패.** 종전에는 `measurement.error` 분기가
 * `cellsTotal += 1` **앞에서** `continue` 해서, 실패 cell 이 분자와 분모에서 **동시에** 빠졌다.
 * 8 cell 전건 실패면 `pass = (0 === 0)` 으로 PASS 였다 — 위 항목의 상위 집합이다.
 * ⇒ `cellsTotal` 을 **측정 시도 직후** 올려 분모를 고정하고, 실패 cell 은 `cellsUnmeasured` 로
 * 따로 세어 **측정 불가(`2`)** 로 보낸다. 시나리오 E 의 같은 `error` 도 같은 코드로 통일했다
 * (종전 `1` — 둘 다 빨강이라 누수는 없었으나 같은 원인이 다른 코드를 내고 있었다).
 *
 * 남는 축 — **`cellsUnmeasured` 는 0 일 때도 출력한다.** 비정상일 때만 보이는 계수는 그 자체가
 * 「재고 있는지 알 수 없는」 상태라, 닫으려던 것과 같은 모양이다.
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
  let cellsUnmeasured = 0; // #1207 E7 — 계측 채널 붕괴로 판정에 도달하지 못한 cell 수
  let fallbackCellCount = 0; // pxDiameter < 4px 진입 cell 수
  let alphaMaskCellCount = 0; // pxDiameter ≥ 4px + opacityTexture 적용 cell 수

  for (const viewport of SCENARIO_VIEWPORTS) {
    const { context, page } = await setupPage(browser, viewport, '/?gpu=a&lod=auto');
    const measurement = await measureAlphaMaskState(page);
    // #1207 E7 — 분모는 **측정 시도**로 고정한다. 종전에는 아래 error 분기가 이 줄 앞에서
    // `continue` 해서 실패 cell 이 분자·분모에서 동시에 빠졌고, 전건 실패 시 `0 === 0` 으로
    // PASS 했다 (헤더 §알려진 사각 §닫은 것).
    cellsTotal += 1;
    if (measurement.error) {
      // 하네스 전제(dev 빌드 private API) 붕괴 — 제품 건강을 한 비트도 말할 수 없다 ⇒ 측정 불가.
      cellsUnmeasured += 1;
      console.log(`  ! ${viewport.id}: 측정 불가 — ${measurement.error}`);
      cellResults.push({
        viewport: viewport.id,
        pass: false,
        measured: false,
        error: measurement.error,
      });
      await context.close();
      continue;
    }

    // body 별 검증: 측정된 pxDiameter 와 material 상태 정합성.
    let cellPass = true;
    const bodyChecks = {};
    for (const id of ['mercury', 'venus']) {
      const body = measurement.bodyResults[id];
      if (!body) {
        // #1207 E7 — 종전에는 `cellPass` 를 내리지 않아 **단언 0 개로 cell PASS** 였다.
        // `<id>-lod-low` mesh + material 은 제품(`createBodyBillboard`)이 만드는 것이고 이
        // 시나리오 단언의 주어 자신이라, 그 부재는 전제 위반이 아니라 제품 FAIL 이다.
        bodyChecks[id] = { error: 'body not in scene', consistent: false };
        cellPass = false;
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

    if (cellPass) cellsPass += 1;
    console.log(
      `  ${viewport.id}: ${cellPass ? 'PASS' : 'FAIL'} | ` +
        `mercury(pxd=${bodyChecks.mercury?.pxDiameter?.toFixed(1) ?? 'n/a'}, lvl=${bodyChecks.mercury?.level ?? 'n/a'}, mask=${bodyChecks.mercury?.actualMask ?? 'n/a'}) | ` +
        `venus(pxd=${bodyChecks.venus?.pxDiameter?.toFixed(1) ?? 'n/a'}, lvl=${bodyChecks.venus?.level ?? 'n/a'}, mask=${bodyChecks.venus?.actualMask ?? 'n/a'})`,
    );
    cellResults.push({
      viewport: viewport.id,
      pass: cellPass,
      measured: true,
      bodyChecks,
      lowMaterialCount: measurement.lowMaterialCount,
      lowMaterialWithMaskCount: measurement.lowMaterialWithMaskCount,
    });
    await context.close();
  }

  // 술어는 그대로다 (E9 — 새 임계 0 개). 바뀐 것은 `cellsTotal` 이 **측정 시도** 계수라는 점과,
  // 측정 실패가 PASS 쪽 잔여로 남지 않는다는 점이다.
  const pass = cellsPass === cellsTotal;
  const cellsFail = cellsTotal - cellsPass - cellsUnmeasured; // 측정됐고 단언이 거짓인 cell
  console.log(`\n  --- 시나리오 D 요약 ---`);
  console.log(
    `  cell 통과: ${cellsPass}/${cellsTotal} — ${pass ? 'PASS' : 'FAIL'} ` +
      `(alpha mask 적용 cell=${alphaMaskCellCount}, fallback 진입 cell=${fallbackCellCount}, ` +
      `측정 불가 cell=${cellsUnmeasured})`,
  );
  return {
    pass,
    failed: cellsFail > 0,
    blocked: cellsUnmeasured > 0,
    cellResults,
    cellsPass,
    cellsTotal,
    cellsUnmeasured,
    alphaMaskCellCount,
    fallbackCellCount,
  };
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
    // #1207 E7 — D 와 같은 원인(하네스 전제 붕괴)이므로 같은 코드로 보낸다 (종전 `1`).
    console.log(`  ! 측정 불가 — ${measurement.error}`);
    await context.close();
    return { pass: false, failed: false, blocked: true, error: measurement.error };
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
    failed: !pass,
    blocked: false,
    sharedExists,
    uniqueCount,
    lowMaterialCount: measurement.lowMaterialCount,
    lowMaterialWithMaskCount: measurement.lowMaterialWithMaskCount,
  };
}

async function main() {
  let allPass = true;
  let anyFail = false; // 측정됐고 단언이 거짓 → exit 1
  let anyBlocked = false; // 계측 채널 붕괴 → exit 2
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
    if (d.failed) anyFail = true;
    if (d.blocked) anyBlocked = true;

    const e = await runScenarioE(browser);
    fullResult.scenarios.E = e;
    if (!e.pass) allPass = false;
    if (e.failed) anyFail = true;
    if (e.blocked) anyBlocked = true;
  });

  // 확정 FAIL 우선 (헤더 §종료 코드 계약) — 제품 결함이 「측정 불가」 뒤로 숨지 않게 한다.
  // 마지막 `1` 은 fail-closed 잔여다 (세 플래그가 모순되면 통과가 아니라 실패로 떨어진다).
  const exitCode = anyFail ? 1 : anyBlocked ? 2 : allPass ? 0 : 1;
  fullResult.exitCode = exitCode;

  console.log('\n=== 최종 요약 ===');
  console.log(`overall: ${allPass ? 'PASS' : anyFail ? 'FAIL' : '측정 불가'} (exit ${exitCode})`);
  console.log(
    `  시나리오 D (alpha mask 매트릭스): ${fullResult.scenarios.D?.pass ? 'PASS' : fullResult.scenarios.D?.failed ? 'FAIL' : '측정 불가'}`,
  );
  console.log(
    `  시나리오 E (공유 인스턴스): ${fullResult.scenarios.E?.pass ? 'PASS' : fullResult.scenarios.E?.failed ? 'FAIL' : '측정 불가'}`,
  );

  if (flags.json) {
    console.log('\n=== JSON 결과 ===');
    console.log(JSON.stringify(fullResult, null, 2));
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error('[browser-verify-391-billboard] unhandled error:', err);
  process.exit(2);
});
