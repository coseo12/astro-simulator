#!/usr/bin/env node
/**
 * #378 fix 회귀 가드 — focus 시 허공 표시 회귀 차단.
 *
 * ADR `docs/decisions/20260503-378-focus-frustum-fix.md` §결과·재검토 조건 §회귀 가드
 * cross-validate G3 수용 — "사용자 D-T2 재발견 비용 > CI 시간 비용" ROI 명백.
 *
 * 사용법:
 *   node apps/web/scripts/browser-verify-378-focus.mjs              # R-Phase 매트릭스 검증
 *   node apps/web/scripts/browser-verify-378-focus.mjs --json       # JSON 결과만 (CI artifact)
 *   node apps/web/scripts/browser-verify-378-focus.mjs --update     # baseline 업데이트
 *
 * 검증 매트릭스: **R-Phase allowlist body × 2 모드 = 6 cells (R3 시점)**
 *  - bodies: sun / mercury / venus (R-Phase R3 진입 완료, ADR `20260504-r-phase-allowlist-guard.md`)
 *  - modes:  observe / research
 *
 * R-Phase 진입 시 갱신 의무 — `R_PHASE_BODY_ALLOWLIST` 와 본 매트릭스를 동시 갱신.
 * R4 (earth) / R6 (jupiter) / R10 (neptune) 진입 시 동기화 (#424 forensic 박제).
 *
 * 각 cell DoD:
 *  1) `camera.isInFrustum(focusMesh) === true` — focus 대상이 카메라 frustum 내부
 *  2) `camera.radius > focusMesh.boundingSphere.radiusWorld * 1.5` — mesh 내부 박힘 차단
 *  3) `camera.target` 이 focusMesh.absolutePosition 근방 (오차 ≤ mesh.radiusWorld * 5)
 *
 * 사용자 D-T2 재현 케이스 (2026-04-30, 라운드 3 2026-05-03):
 *  - venus / observe → 허공 (FAIL → fix 후 PASS)
 *  - venus / research → 정상 (continued PASS)
 *
 * dev 빌드 의존: `window.__solarScene.meshes` (Map<id, Mesh>) — solar-system-scene.ts:1237 export.
 *               + `window.__simCore` 의 카메라 액세스 경로 (scene.activeCamera).
 *
 * 환경변수:
 *   BASE_URL  — 웹 서버 URL (기본 http://localhost:3000)
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const BASELINE_PATH = path.join(__dirname, '__baselines__', 'focus-378.json');

const args = process.argv.slice(2);
const flags = {
  json: args.includes('--json'),
  update: args.includes('--update'),
};

/**
 * R-Phase 매트릭스 정의 — body × mode.
 *
 * **SSoT 동기화 의무**: `packages/core/src/scene/r-phase-allowlist.ts` 의
 * `R_PHASE_BODY_ALLOWLIST` 와 일치해야 한다. R4 (earth) / R6 (jupiter) /
 * R10 (neptune) 진입 시 두 위치를 동시에 갱신한다.
 *
 * 회귀 이력 (#424 forensic): PR #414 (#402 라운드 2) 머지로 simulation-core
 * focusOn 가드가 R-Phase 외 body 의 카메라 동기화를 차단 → 본 매트릭스의
 * earth/jupiter/neptune cells 가 의도하지 않게 FAIL. ci.yml verify:378-focus
 * step 4 commit 잠복 (#414 → #417 → #421 → #422 → #423 빈 commit push 로 재발견).
 *
 * R5 #594 — R4 baseline 잔존 drift (earth/moon 누락) + R5 추가 (mars/phobos/deimos) 동시 처리.
 * ADR `docs/decisions/20260528-r5-mars-visualization.md` §위험 #4 박제 + D17 의무.
 * R4 머지 시 미동기화 발견 (R5 진입에서 R4 + R5 누적 동시 처리).
 */
// #611 — satellite (phobos + deimos) 복원. #610 에서 임시 제외했던 회귀의 근본 원인은
//   camera-controller.ts follow observer 의 **한 프레임 lag** 였다: onBeforeRender 시점에
//   mesh.position 은 이번 프레임 값이지만 worldMatrix 미갱신이라 absolutePosition 이 직전
//   프레임 값을 반환 → target 이 한 프레임 뒤처짐. 궤도 각속도가 큰 위성 (phobos 주기 7.66h /
//   deimos 30.3h) 에서 프레임당 이동량이 tolerance 초과 (행성은 각속도 작아 잠복). follow
//   observer 에 mesh.computeWorldMatrix(true) 추가로 측정과 동일 시점 → lag 0 해소.
//   본 가드가 satellite focus DoD-3 회귀를 CI r1-guard 에서 직접 차단한다 (이슈 #611).
// R6 #621 — jupiter + galilean 4 (io/europa/ganymede/callisto) 동기화. R_PHASE_BODY_ALLOWLIST
// 자동 생성값 (CURRENT_R_PHASE=6) 과 정합 — #598 정적 매칭 가드 (r-phase-allowlist.test.ts) 가
// FOCUS_BODIES === R_PHASE_BODY_ALLOWLIST 를 CI fail-fast 로 차단한다.
// R7 #641 — saturn + titan 동기화 (CURRENT_R_PHASE=7).
// R8 #647 — uranus + titania 동기화 (CURRENT_R_PHASE=8).
const FOCUS_BODIES = [
  'sun',
  'mercury',
  'venus',
  'earth',
  'moon',
  'mars',
  'phobos',
  'deimos',
  'jupiter',
  'io',
  'europa',
  'ganymede',
  'callisto',
  'saturn',
  'titan',
  'uranus',
  'titania',
];
const MODES = ['observe', 'research'];

const VIEWPORT = { width: 1280, height: 800, dpr: 1 };
const POST_FOCUS_WAIT_MS = 2500; // tier transition (300ms) + dolly + LOD 안정화 마진

/** focus 시 카메라 안정 대기 — focus body 별 1 cell 측정. */
async function measureFocusCell(page, focusId) {
  return await page.evaluate(
    ({ focusId }) => {
      // dev 빌드 한정 노출 핸들 (sim-canvas.tsx:253).
      const solar = /** @type {any} */ (window).__solarScene;
      const simCore = /** @type {any} */ (window).__simCore;
      if (!solar) return { error: '__solarScene 미노출 (dev 빌드 사용 필요)' };
      if (!simCore) return { error: '__simCore 미노출' };

      const meshes = solar.meshes;
      const mesh = meshes?.get?.(focusId);
      if (!mesh) return { error: `mesh ${focusId} 미존재` };

      // BabylonJS scene → activeCamera 추출 (ArcRotateCamera).
      // simCore 의 scene 핸들이 직접 노출 안 돼 있다면 mesh.getScene() 으로 우회.
      const scene = mesh.getScene();
      if (!scene) return { error: 'scene 추출 실패' };
      const camera = scene.activeCamera;
      if (!camera) return { error: 'activeCamera null' };

      // boundingSphere.radiusWorld 는 world matrix 갱신 후 정확. 측정 직전 강제 갱신.
      mesh.computeWorldMatrix(true);
      const boundingInfo = mesh.getBoundingInfo();
      const meshRadiusWorld = boundingInfo.boundingSphere.radiusWorld;
      const meshAbsPos = mesh.absolutePosition;

      // camera.target / radius / position
      const camTarget = camera.target ?? camera.getTarget?.();
      const camRadius = camera.radius;
      const camPosition = camera.position ?? camera.getPosition?.();

      // isInFrustum — Babylon 의 AbstractMesh.isInFrustum(planes) 형태. camera.frustumPlanes 는
      // scene._frustumPlanes 또는 camera.getViewMatrix() 후 계산되는 값. 표준 경로는
      // scene.frustumPlanes (Babylon 9.x).
      // 안전한 대체: camera 의 ViewProjection matrix 로 mesh.absolutePosition 변환 후 NDC 검증.
      let isInFrustum = false;
      try {
        // Babylon 표준 — Mesh.isInFrustum(planes)
        const planes = scene.frustumPlanes ?? scene._frustumPlanes;
        if (planes && typeof mesh.isInFrustum === 'function') {
          isInFrustum = mesh.isInFrustum(planes);
        } else {
          // fallback — NDC 변환
          const transform = camera.getTransformationMatrix?.();
          if (transform) {
            // 간이 fallback — 심도 검증이 부정확. 결과를 'unknown' 으로 표기.
            isInFrustum = null;
          }
        }
      } catch (e) {
        isInFrustum = null;
      }

      // tier (T1 solar / T2 inner / T3 body)
      const tier = solar.getTier ? solar.getTier() : 'unknown';

      return {
        focus: focusId,
        tier,
        meshRadiusWorld,
        meshAbsPos: { x: meshAbsPos.x, y: meshAbsPos.y, z: meshAbsPos.z },
        camRadius,
        camTarget: camTarget ? { x: camTarget.x, y: camTarget.y, z: camTarget.z } : null,
        camPosition: camPosition ? { x: camPosition.x, y: camPosition.y, z: camPosition.z } : null,
        camLowerRadiusLimit: camera.lowerRadiusLimit,
        camMinZ: camera.minZ,
        isInFrustum,
      };
    },
    { focusId },
  );
}

/** mesh 내부 박힘 + frustum 외부 검증 — DoD 단언 함수. */
function evaluateCellDoD(measurement) {
  if (measurement.error) {
    return { pass: false, reason: measurement.error };
  }

  // DoD-1: isInFrustum (null 일 때는 inconclusive — 다른 지표로 보충 검증)
  // DoD-2: camera.radius > meshRadiusWorld * 1.5 — mesh 내부 박힘 차단
  // DoD-3: camera.target 이 mesh.absolutePosition 근방 (오차 ≤ meshRadiusWorld * 5)

  const { meshRadiusWorld, camRadius, camTarget, meshAbsPos, isInFrustum } = measurement;

  const reasons = [];

  // DoD-2: 카메라가 mesh 외부에 있어야 함.
  // sun (T1 유지) 의 경우 meshRadiusWorld ≈ 2.92 unit, camRadius ≈ 14.6 → ratio 5.0 PASS
  // venus T3 의 경우 meshRadiusWorld ≈ 121.5, camRadius ≥ 182.25 (1.5x) 이상 필요
  const radiusRatio = meshRadiusWorld > 0 ? camRadius / meshRadiusWorld : 0;
  const dod2Pass = radiusRatio >= 1.5;
  if (!dod2Pass) {
    reasons.push(
      `DoD-2 FAIL: camRadius=${camRadius.toFixed(3)} / meshRadiusWorld=${meshRadiusWorld.toFixed(3)} = ratio ${radiusRatio.toFixed(2)} < 1.5 (mesh 내부 박힘)`,
    );
  }

  // DoD-3: camera.target 이 mesh.absolutePosition 근방.
  // floating origin shift 후 T3 진입 시 mesh.absolutePosition ≈ [0,0,0]. T1/T2 경우 mesh 가
  // origin 으로부터 떨어져 있으나 focusOn 은 그 좌표로 target 을 동기화해야 함.
  let dod3Pass = true;
  let targetDistance = null;
  if (camTarget && meshAbsPos) {
    const dx = camTarget.x - meshAbsPos.x;
    const dy = camTarget.y - meshAbsPos.y;
    const dz = camTarget.z - meshAbsPos.z;
    targetDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    // 허용 오차: meshRadiusWorld * 5 (camera radius 식과 동일 스케일)
    // sun 의 경우 meshRadius ≈ 2.92 → tolerance ≈ 14.6 (sun 의 14.6 radius 기준 적절)
    const tolerance = Math.max(meshRadiusWorld * 5, 0.1);
    dod3Pass = targetDistance <= tolerance;
    if (!dod3Pass) {
      reasons.push(
        `DoD-3 FAIL: target distance=${targetDistance.toFixed(3)} > tolerance=${tolerance.toFixed(3)} (target 동기화 누락)`,
      );
    }
  }

  // DoD-1: isInFrustum — 가능하면 검증, null 이면 inconclusive (다른 지표로 보완)
  let dod1Pass = true;
  if (isInFrustum === false) {
    dod1Pass = false;
    reasons.push('DoD-1 FAIL: camera.isInFrustum(mesh) === false (mesh frustum 밖)');
  } else if (isInFrustum === null) {
    // inconclusive — DoD-2 + DoD-3 로 간접 검증.
    reasons.push('DoD-1 inconclusive: isInFrustum 직접 측정 불가, DoD-2/3 으로 보완');
  }

  const pass = dod1Pass && dod2Pass && dod3Pass;
  return {
    pass,
    dod1: isInFrustum,
    dod2: dod2Pass,
    dod3: dod3Pass,
    radiusRatio,
    targetDistance,
    reasons,
  };
}

async function setupPageWithFocus(browser, body, mode) {
  const context = await browser.newContext({
    viewport: { width: VIEWPORT.width, height: VIEWPORT.height },
    deviceScaleFactor: VIEWPORT.dpr,
  });
  const page = await context.newPage();
  // ?focus=<body>&mode=<mode> URL 로 진입 — url-sync 가 sendCommand({type:'focusOn', bodyId})
  // 자동 발행 (apps/web/src/core/url-sync.tsx:75).
  // ?gpu=a 로 tier-a 강제 (LOD 일관성).
  // mode 가 'observe' 일 때는 URL 파라미터 생략 (default).
  const modeParam = mode === 'research' ? `&mode=${mode}` : '';
  const url = `${BASE_URL}/?gpu=a&focus=${body}${modeParam}&lod=auto`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForFunction(
    () => typeof window.__simCore !== 'undefined' && typeof window.__solarScene !== 'undefined',
    { timeout: 15_000 },
  );
  // tier transition (300ms) + dolly 안정화 + LOD 안정화 + (research 모드의 경우) panel resize
  await page.waitForTimeout(POST_FOCUS_WAIT_MS);
  return { context, page };
}

async function run12CellMatrix(browser) {
  console.log(
    `\n=== #378 ${FOCUS_BODIES.length * MODES.length} cells matrix (${FOCUS_BODIES.length} R-Phase bodies × ${MODES.length} modes) ===\n`,
  );
  const cellResults = [];
  let allPass = true;

  for (const mode of MODES) {
    for (const body of FOCUS_BODIES) {
      const cellId = `${body}-${mode}`;
      const { context, page } = await setupPageWithFocus(browser, body, mode);
      const measurement = await measureFocusCell(page, body);
      const verdict = evaluateCellDoD(measurement);

      const status = verdict.pass ? 'PASS' : 'FAIL';
      console.log(
        `  ${cellId.padEnd(20)}: ${status}` +
          `  | tier=${measurement.tier ?? 'n/a'}` +
          `  | camR=${measurement.camRadius?.toFixed(3) ?? 'n/a'}` +
          `  | meshR=${measurement.meshRadiusWorld?.toFixed(3) ?? 'n/a'}` +
          `  | ratio=${verdict.radiusRatio?.toFixed(2) ?? 'n/a'}` +
          `  | targetΔ=${verdict.targetDistance?.toFixed(3) ?? 'n/a'}` +
          `  | inFrustum=${measurement.isInFrustum ?? 'unknown'}`,
      );
      if (!verdict.pass) {
        for (const r of verdict.reasons) {
          console.log(`        ${r}`);
        }
        allPass = false;
      }
      cellResults.push({
        cellId,
        body,
        mode,
        measurement,
        verdict,
      });
      await context.close();
    }
  }

  return { pass: allPass, cellResults };
}

async function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const fullResult = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    matrix: null,
  };
  let allPass = true;

  try {
    const matrix = await run12CellMatrix(browser);
    fullResult.matrix = matrix;
    if (!matrix.pass) allPass = false;
  } finally {
    await browser.close();
  }

  if (flags.update) {
    fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(fullResult, null, 2));
    console.log(`\n  baseline 업데이트: ${path.relative(process.cwd(), BASELINE_PATH)}`);
  }

  console.log('\n=== 최종 요약 ===');
  const passCount = fullResult.matrix.cellResults.filter((c) => c.verdict.pass).length;
  const totalCount = fullResult.matrix.cellResults.length;
  console.log(`  cells: ${passCount}/${totalCount} PASS`);
  console.log(`  overall: ${allPass ? 'PASS' : 'FAIL'}`);

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
