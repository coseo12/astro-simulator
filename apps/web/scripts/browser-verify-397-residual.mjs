#!/usr/bin/env node
/**
 * #397 회귀 가드 — focus body 외 다른 body 의 viewport 점유율 매트릭스 검증.
 *
 * NO-OP ADR `docs/decisions/20260503-397-residual-no-op.md` §결과·재검토 조건 §회귀 가드
 *
 * R-Phase v3 incremental build 정책 정합 — sun focus 화면의 mercury/venus 잔재는
 * R3 까지 구현된 visible body 의 자연 귀결로 expected. 그 외 cells 는 strict ≤ 0.1%.
 *
 * 사용법:
 *   node apps/web/scripts/browser-verify-397-residual.mjs              # N cells 매트릭스 검증
 *   node apps/web/scripts/browser-verify-397-residual.mjs --json       # JSON 결과만 (CI artifact)
 *
 * 검증 매트릭스: **R-Phase allowlist body × 2 모드** (R3 시점 = 3 body × 2 모드 = 6 cells)
 *  - bodies: `R_PHASE_BODY_ALLOWLIST` (현재 sun / mercury / venus)
 *  - modes:  observe / research
 *
 * **R-Phase 진입 시 본 매트릭스 자동 확장**:
 *   `R_PHASE_BODY_ALLOWLIST` SSoT (`@astro-simulator/core/scene`) 를 import 하여 cells 도출.
 *   R4 진입 시 'earth' 가 allowlist 에 추가되면 본 검증 매트릭스도 자동 8 cells 확장.
 *   ADR `docs/decisions/20260504-r-phase-allowlist-guard.md` §결정 4 "4곳 동시 박제" 절차의 단일 SSoT.
 *
 * R-Phase expected residual list (R3 시점 — R4+ 진입 시 갱신):
 *  - sun-observe  : { mercury, venus } expected (R2/R3 구현물)
 *  - sun-research : { mercury, venus } expected
 *  - 그 외 cells: expected = ∅, 모든 residual body coverageRatio ≤ 0.1%
 *
 * 추가 허용 노이즈:
 *  - jupiter focus 시 io 자식 mesh 의 자연 visibility (R6 예정 갈릴레이 moon) — coverageRatio < 0.01%
 *  - R6 진입 시 jupiter cell 의 expected residual list 갱신 의무
 *
 * 환경변수:
 *   BASE_URL  — 웹 서버 URL (기본 http://localhost:3000)
 */

import { chromium } from 'playwright';
import { R_PHASE_BODY_ALLOWLIST } from '@astro-simulator/core/scene/r-phase-allowlist';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const FOCUS_BODIES = [...R_PHASE_BODY_ALLOWLIST];
const MODES = ['observe', 'research'];
const VIEWPORT = { width: 1280, height: 800, dpr: 1 };
const POST_FOCUS_WAIT_MS = 3000;
const RESIDUAL_THRESHOLD_PCT = 0.1;
const NOISE_THRESHOLD_PCT = 0.01;

const args = process.argv.slice(2);
const flags = { json: args.includes('--json') };

/**
 * R-Phase expected residual list — 갱신 시 본 SSoT 만 변경.
 * 키: `${body}-${mode}` cellId, 값: 해당 cell 에서 visible 허용된 body id 집합.
 *
 * R3 시점 (2026-05-03):
 *  - sun focus 의 mercury/venus 는 incremental build 의 expected visible
 *  - 다른 cell 은 ∅ (strict ≤ 0.1%)
 *
 * R4+ 진입 시 R-Phase ADR 박제와 함께 본 list 갱신.
 */
const R_PHASE_EXPECTED = {
  'sun-observe': new Set(['mercury', 'venus']),
  'sun-research': new Set(['mercury', 'venus']),
  // 그 외 10 cells 는 expected = ∅
};

function expectedFor(cellId) {
  return R_PHASE_EXPECTED[cellId] ?? new Set();
}

/** focus 진입 후 모든 body 의 NDC + projected size 측정. */
async function measureResidualCell(page, focusId) {
  return await page.evaluate(
    ({ focusId, vw, vh }) => {
      const solar = window.__solarScene;
      if (!solar) return { error: '__solarScene 미노출 (dev 빌드 필요)' };
      const meshes = solar.meshes;
      if (!meshes) return { error: 'meshes 없음' };

      const focusMesh = meshes.get(focusId);
      if (!focusMesh) return { error: `focus mesh ${focusId} 없음` };
      const scene = focusMesh.getScene();
      const camera = scene.activeCamera;
      if (!camera) return { error: 'camera null' };

      // BABYLON Vector3.Project — projection
      const Vector3Ctor = focusMesh.position.constructor;
      const transform = camera.getTransformationMatrix();
      const Matrix = transform.constructor;
      const identity = Matrix.Identity();
      const viewport = { x: 0, y: 0, width: vw, height: vh };

      const fov = camera.fov ?? 0.8;
      const camPos = camera.position;
      const tier = solar.getTier ? solar.getTier() : 'unknown';

      const allBodies = [];

      for (const [id, mesh] of meshes.entries()) {
        mesh.computeWorldMatrix(true);
        const meshAbsPos = mesh.absolutePosition;
        const boundingInfo = mesh.getBoundingInfo();
        const radiusWorld = boundingInfo.boundingSphere.radiusWorld;

        let projected = null;
        try {
          projected = Vector3Ctor.Project(meshAbsPos, identity, transform, viewport);
        } catch (e) {
          projected = null;
        }

        const dx = meshAbsPos.x - camPos.x;
        const dy = meshAbsPos.y - camPos.y;
        const dz = meshAbsPos.z - camPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        const angularDiameter = dist > 0 ? (2 * radiusWorld) / dist : 0;
        const projectedDiameterPx = (angularDiameter / fov) * vh;
        const projectedAreaPx = Math.PI * (projectedDiameterPx / 2) ** 2;

        const viewportAreaPx = vw * vh;
        const coverageRatio = (projectedAreaPx / viewportAreaPx) * 100;

        const inViewport =
          projected &&
          projected.z >= 0 &&
          projected.z <= 1 &&
          projected.x >= -projectedDiameterPx / 2 &&
          projected.x <= vw + projectedDiameterPx / 2 &&
          projected.y >= -projectedDiameterPx / 2 &&
          projected.y <= vh + projectedDiameterPx / 2;

        const isEnabled = mesh.isEnabled?.() ?? true;

        allBodies.push({
          id,
          isFocus: id === focusId,
          isEnabled,
          inViewport: !!inViewport,
          radiusWorld,
          dist,
          projectedDiameterPx,
          coverageRatio,
        });
      }

      return {
        focusId,
        tier,
        allBodies,
        camera: { radius: camera.radius, fov },
      };
    },
    { focusId, vw: VIEWPORT.width, vh: VIEWPORT.height },
  );
}

/**
 * R-Phase expected list 적용 verdict.
 *
 * unexpected residual: focus 외 + visible (frustum 내, enabled) + expected list 밖 + coverage > NOISE_THRESHOLD_PCT
 * 그 중 하나라도 RESIDUAL_THRESHOLD_PCT 초과 시 FAIL.
 */
function evaluateCellWithRPhase(measurement, cellId) {
  if (measurement.error) return { pass: false, reason: measurement.error };

  const expected = expectedFor(cellId);
  const unexpectedResidual = measurement.allBodies.filter(
    (b) =>
      !b.isFocus &&
      b.isEnabled &&
      b.inViewport &&
      b.coverageRatio > NOISE_THRESHOLD_PCT &&
      !expected.has(b.id),
  );
  const expectedResidual = measurement.allBodies.filter(
    (b) => !b.isFocus && b.isEnabled && b.inViewport && expected.has(b.id),
  );

  const maxUnexpected = unexpectedResidual.reduce(
    (m, b) => (b.coverageRatio > m ? b.coverageRatio : m),
    0,
  );
  const pass = maxUnexpected <= RESIDUAL_THRESHOLD_PCT;
  return {
    pass,
    maxUnexpected,
    unexpectedCount: unexpectedResidual.length,
    expectedCount: expectedResidual.length,
    worstUnexpected: unexpectedResidual.length
      ? unexpectedResidual.reduce((m, b) => (b.coverageRatio > m.coverageRatio ? b : m))
      : null,
    expectedResidual: expectedResidual.map((b) => ({
      id: b.id,
      coverageRatio: b.coverageRatio,
    })),
    unexpectedResidual: unexpectedResidual.map((b) => ({
      id: b.id,
      coverageRatio: b.coverageRatio,
    })),
  };
}

async function setupPageWithFocus(browser, body, mode) {
  const context = await browser.newContext({
    viewport: { width: VIEWPORT.width, height: VIEWPORT.height },
    deviceScaleFactor: VIEWPORT.dpr,
  });
  const page = await context.newPage();
  const modeParam = mode === 'research' ? `&mode=${mode}` : '';
  const url = `${BASE_URL}/?gpu=a&focus=${body}${modeParam}&lod=auto`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForFunction(
    () => typeof window.__simCore !== 'undefined' && typeof window.__solarScene !== 'undefined',
    { timeout: 15_000 },
  );
  await page.waitForTimeout(POST_FOCUS_WAIT_MS);
  return { context, page };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const cells = [];
  let allPass = true;

  const totalCells = FOCUS_BODIES.length * MODES.length;
  console.log(`\n=== #397 ${totalCells} cells residual matrix (R-Phase allowlist 정합) ===`);
  console.log(`  R-Phase allowlist: [${FOCUS_BODIES.join(', ')}]`);
  console.log(
    `viewport: ${VIEWPORT.width}x${VIEWPORT.height}, baseUrl: ${BASE_URL}, threshold: ≤${RESIDUAL_THRESHOLD_PCT}% (noise floor: ${NOISE_THRESHOLD_PCT}%)`,
  );
  console.log(
    `\n  ${'cell'.padEnd(20)} ${'tier'.padEnd(8)} ${'maxUnexp%'.padStart(10)} ${'#unexp'.padStart(8)} ${'#expected'.padStart(10)}  worst unexpected`,
  );
  console.log('  ' + '-'.repeat(90));

  try {
    for (const mode of MODES) {
      for (const body of FOCUS_BODIES) {
        const cellId = `${body}-${mode}`;
        const { context, page } = await setupPageWithFocus(browser, body, mode);
        const measurement = await measureResidualCell(page, body);
        const verdict = evaluateCellWithRPhase(measurement, cellId);

        const status = verdict.pass ? 'PASS' : 'FAIL';
        const tier = measurement.tier ?? 'n/a';
        const worst = verdict.worstUnexpected
          ? `${verdict.worstUnexpected.id} (${verdict.worstUnexpected.coverageRatio.toFixed(4)}%)`
          : '(none)';
        console.log(
          `  ${cellId.padEnd(20)} ${String(tier).padEnd(8)} ${(verdict.maxUnexpected ?? 0).toFixed(4).padStart(10)} ${String(verdict.unexpectedCount ?? 0).padStart(8)} ${String(verdict.expectedCount ?? 0).padStart(10)}  ${worst} ${status}`,
        );
        if (!verdict.pass) allPass = false;
        cells.push({ cellId, body, mode, measurement, verdict });
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  console.log('\n=== 최종 ===');
  const passCount = cells.filter((c) => c.verdict.pass).length;
  console.log(`  cells: ${passCount}/${cells.length} PASS`);
  console.log(`  overall: ${allPass ? 'PASS' : 'FAIL'}`);

  if (!allPass) {
    console.log('\n=== FAIL cell 상세 ===');
    for (const c of cells.filter((c) => !c.verdict.pass)) {
      console.log(`\n  ${c.cellId}:`);
      for (const r of c.verdict.unexpectedResidual ?? []) {
        console.log(`    unexpected: ${r.id} cov=${r.coverageRatio.toFixed(4)}%`);
      }
    }
  }

  if (flags.json) {
    console.log('\n--- JSON ---');
    console.log(
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          baseUrl: BASE_URL,
          viewport: VIEWPORT,
          threshold: RESIDUAL_THRESHOLD_PCT,
          rPhaseExpected: Object.fromEntries(
            Object.entries(R_PHASE_EXPECTED).map(([k, v]) => [k, [...v]]),
          ),
          cells: cells.map((c) => ({
            cellId: c.cellId,
            pass: c.verdict.pass,
            maxUnexpected: c.verdict.maxUnexpected,
            unexpectedResidual: c.verdict.unexpectedResidual,
            expectedResidual: c.verdict.expectedResidual,
          })),
        },
        null,
        2,
      ),
    );
  }

  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error('\n  FATAL:', err);
  process.exit(2);
});
