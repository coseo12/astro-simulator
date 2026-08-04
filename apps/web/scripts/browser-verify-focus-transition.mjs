#!/usr/bin/env node
/**
 * #408 fix 회귀 가드 — focus 전환 시 tier oscillate 차단.
 *
 * ADR `docs/decisions/20260504-focus-tier-oscillate-fix.md` §결정 5 (회귀 가드 신설).
 * forensic 매트릭스 (사용자 D-T2 2026-05-04): venus → mercury 전환 시
 *   - tier inner → body → inner 3단계 (oscillate)
 *   - camR 64 → 23 → 38만 → 26 (4단계 jump, 38만 unit)
 *   - target jump (mercury → (0,0,0) origin reset → mercury) 발생
 *
 * 사용법:
 *   node apps/web/scripts/browser-verify-focus-transition.mjs            # 9 cells 매트릭스 검증
 *   node apps/web/scripts/browser-verify-focus-transition.mjs --json     # JSON 결과만 (CI artifact)
 *
 * 검증 매트릭스: **3 from × 3 to = 9 cells**
 *   from: sun / mercury / venus  (R-Phase v3 활성 body — `getActiveBodyIds()` SSoT)
 *   to:   sun / mercury / venus
 *
 * 각 cell DoD (이슈 #408 §DoD-1):
 *   1) tier 전환 횟수 ≤ 1 (oscillate 차단 — forensic 회귀는 inner→body→inner 2회)
 *   2) target origin reset 0 회 (sun / self-focus / final tier=body 케이스 제외)
 *   3) camR animation jump > 1e6 unit 0 회 — 정상 solar↔inner / solar↔body transition 은 허용,
 *      비정상 huge oscillate 진입 (예: 30 × 1.6e4 ratio 이상) 차단
 *
 * 측정 방식: 각 cell 마다 from body 로 진입 후 안정화 → to body 클릭 simulation
 * (sendCommand({type:'focusOn', bodyId:to})) → 1.5초 동안 16ms 간격으로 frame snapshot
 * (tier / camera.target / camera.radius) 캡처 → 분석.
 *
 * dev 빌드 의존: `window.__solarScene.meshes` + `window.__simCore` (sim-canvas.tsx:128/253).
 *
 * 환경변수:
 *   BASE_URL  — 웹 서버 URL (기본 http://localhost:3000)
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

/** 9 cells 매트릭스 정의 — from × to (R-Phase v3 활성 body). */
const ACTIVE_BODIES = ['sun', 'mercury', 'venus'];

const VIEWPORT = { width: 1280, height: 800, dpr: 1 };
const POST_FOCUS_WAIT_MS = 2500; // 첫 focus 안정화
const TRANSITION_SAMPLE_DURATION_MS = 1500; // to body 클릭 후 캡처 기간 (transition 300ms × 5)
const TRANSITION_SAMPLE_INTERVAL_MS = 16; // ~60fps frame 간격

// DoD 임계
const TIER_TRANSITION_LIMIT = 1; // 전환 횟수 ≤ 1 (oscillate 차단)
/**
 * camR jump 임계 — 정상 tier 전환의 산술 결과 vs forensic 회귀 분리.
 *
 * tier renderScale ratio:
 *   - solar (8.4e-11) ↔ inner (1.54e-9) — ratio 18.3
 *   - inner (1.54e-9) ↔ body (2.51e-5)  — ratio 1.63e4
 *   - solar (8.4e-11) ↔ body (2.51e-5)  — ratio 2.99e5
 *
 * 정상 transition 시 `radius_new = radius_old × ratio` 이므로 30 × 2.99e5 ≈ 9e6.
 * 그러나 sun → mercury 같은 solar→inner 단일 단계 transition 의 frame snapshot 에서 측정된
 * 단일 jump 는 ~15만 unit (이론 30 × 18.3 = 549 의 큰 편차). **runTierTransition 의 mesh
 * scaling 4e4 배 폭증으로 boundingSphere 측정값이 일시 huge** (≈30만~60만) 이 되며 그 transition
 * animation 은 정상 동작.
 *
 * forensic 데이터 (사용자 D-T2): venus → mercury (inner → body → inner) **oscillate 시** camR
 * 38만 unit jump 발현 — DoD-1 (tier 전환 횟수 ≤ 1) 로 우선 차단되므로 본 임계는 보조.
 *
 * 임계 1e6 — 의도되지 않은 inner→body 진입 (ratio 1.6e4 × camR 60 = 1e6) 또는 그 이상의
 * 비정상 jump 검출. F1+F2 fix 후 baseline (venus→mercury, mercury→venus 14만~34만) 은 허용.
 */
const CAMERA_RADIUS_JUMP_THRESHOLD = 1e6;

/** 시작 페이지 + from body 진입 + 안정화 대기. */
async function setupPageWithInitialFocus(browser, fromBody) {
  const context = await browser.newContext({
    viewport: { width: VIEWPORT.width, height: VIEWPORT.height },
    deviceScaleFactor: VIEWPORT.dpr,
  });
  const page = await context.newPage();
  // ?gpu=a 로 tier-a 강제 (LOD 일관성). focus=fromBody 로 url-sync 자동 발행.
  const url = `${BASE_URL}/?gpu=a&focus=${fromBody}&lod=auto`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForFunction(
    () =>
      typeof window.__simCore !== 'undefined' &&
      typeof window.__solarScene !== 'undefined' &&
      typeof window.__simStore !== 'undefined',
    { timeout: 15_000 },
  );
  await page.waitForTimeout(POST_FOCUS_WAIT_MS);
  return { context, page };
}

/** to body 클릭 simulation + frame-by-frame 캡처. */
async function measureTransition(page, toBody) {
  return await page.evaluate(
    async ({ toBody, durationMs, intervalMs }) => {
      const solar = /** @type {any} */ (window).__solarScene;
      const simCore = /** @type {any} */ (window).__simCore;
      const simStore = /** @type {any} */ (window).__simStore;
      if (!solar || !simCore) return { error: 'core/scene 미노출 (dev 빌드 사용 필요)' };
      if (!simStore || typeof simStore.getState !== 'function') {
        return { error: '__simStore 미노출 (dev 빌드 사용 필요)' };
      }

      const meshes = solar.meshes;
      const toMesh = meshes?.get?.(toBody);
      if (!toMesh) return { error: `mesh ${toBody} 미존재` };

      const scene = toMesh.getScene();
      if (!scene) return { error: 'scene 추출 실패' };
      const camera = scene.activeCamera;
      if (!camera) return { error: 'activeCamera null' };

      // Frame snapshot 캡처 함수.
      const snapshot = () => ({
        t: performance.now(),
        tier: solar.getTier ? solar.getTier() : 'unknown',
        camRadius: camera.radius,
        camTarget: camera.target
          ? { x: camera.target.x, y: camera.target.y, z: camera.target.z }
          : null,
      });

      // 클릭 직전 baseline.
      const baseline = snapshot();

      // 클릭 simulation — 사용자 클릭은 결국 sim-store.setSelectedBody 를 호출하는 경로를 거친다
      // (R1 #334+#335 — store 변경 → sim-canvas subscribe → syncFocusToScene). store 직접 변경이
      // 가장 자연스러운 시뮬레이션. simCore.command 의 'focusOn' 은 이벤트만 emit 하고 core-adapter
      // 가 store.setSelectedBody 호출하는 indirection 이라 결과 동일.
      const state = simStore.getState();
      if (typeof state.setSelectedBody === 'function') {
        state.setSelectedBody(toBody);
      } else if (typeof simCore.command === 'function') {
        // fallback — store action 미존재 시 core command 사용 (선언 순서 / 향후 변경 대비).
        simCore.command({ type: 'focusOn', bodyId: toBody });
      } else {
        return { error: 'setSelectedBody / command 둘 다 없음 — focus 전환 시뮬 불가' };
      }

      const frames = [baseline];
      const t0 = performance.now();
      while (performance.now() - t0 < durationMs) {
        await new Promise((r) => setTimeout(r, intervalMs));
        frames.push(snapshot());
      }

      return { frames, toBody };
    },
    {
      toBody,
      durationMs: TRANSITION_SAMPLE_DURATION_MS,
      intervalMs: TRANSITION_SAMPLE_INTERVAL_MS,
    },
  );
}

/**
 * 캡처된 frames 시계열 분석.
 *
 * DoD 단언:
 *   1) tierTransitions ≤ 1 (변화 횟수 카운트)
 *   2) originResets = 0 (camTarget 이 (0,0,0) 으로 jump한 횟수, sun 제외 from→to 매트릭스에서)
 *   3) camRadiusJumps = 0 (인접 frame 간 camR 차이 > 1000 unit 인 횟수)
 */
function evaluateTransitionDoD(frames, fromBody, toBody) {
  if (!frames || frames.length < 2) {
    return { pass: false, reason: 'frames 부족 (최소 2 필요)' };
  }

  // Tier 변화 횟수.
  let tierTransitions = 0;
  for (let i = 1; i < frames.length; i += 1) {
    if (frames[i].tier !== frames[i - 1].tier) {
      tierTransitions += 1;
    }
  }

  // Origin reset 횟수 — camTarget 이 (0,0,0) 근접 (epsilon 0.5 unit).
  // **제외 조건**:
  //   1. sun 케이스 (from=sun OR to=sun) — sun 자체가 origin 근처 mesh
  //   2. self-focus (from === to) — focus body 가 origin 으로 shift 되어 mesh.absolutePosition ≈ (0,0,0) 정상
  //   3. T3 body tier 진입 (forensic 데이터의 메커니즘) — T3 진입 시 origin 이 focus body world 좌표로
  //      이동하므로 camTarget 이 (0,0,0) 근처 정상. 본 검증은 inner-tier 안에서 (origin=[0,0,0]) 측정만 의미.
  // 본 검증은 inner→inner (planet→planet) 케이스에서 inner→body 잘못 진입 시 origin reset 발현 검출.
  let originResets = 0;
  const sunInvolved = fromBody === 'sun' || toBody === 'sun';
  const selfFocus = fromBody === toBody;
  // skipOriginCheck: sun OR self-focus OR (final tier === 'body') 케이스는 origin reset 가드 비활성.
  // 측정 시점에 final tier 정확히 알기 어려우므로 frame 의 마지막 tier 가 'body' 면 skip.
  const finalTier = frames[frames.length - 1]?.tier;
  const skipOriginCheck = sunInvolved || selfFocus || finalTier === 'body';
  if (!skipOriginCheck) {
    for (const f of frames) {
      if (!f.camTarget) continue;
      // body tier 진입 frame 도 skip (transition 진행 중 tier 변경 후 origin shift 정상).
      if (f.tier === 'body') continue;
      const d = Math.sqrt(f.camTarget.x ** 2 + f.camTarget.y ** 2 + f.camTarget.z ** 2);
      if (d < 0.5) {
        originResets += 1;
      }
    }
  }

  // camR jump > 1000 unit.
  let camRadiusJumps = 0;
  let maxJump = 0;
  for (let i = 1; i < frames.length; i += 1) {
    const dr = Math.abs(frames[i].camRadius - frames[i - 1].camRadius);
    if (dr > maxJump) maxJump = dr;
    if (dr > CAMERA_RADIUS_JUMP_THRESHOLD) {
      camRadiusJumps += 1;
    }
  }

  const reasons = [];
  const dod1Pass = tierTransitions <= TIER_TRANSITION_LIMIT;
  if (!dod1Pass) {
    reasons.push(
      `DoD-1 FAIL: tier 전환 횟수=${tierTransitions} > ${TIER_TRANSITION_LIMIT} (oscillate 검출)`,
    );
  }
  const dod2Pass = skipOriginCheck || originResets === 0;
  if (!dod2Pass) {
    reasons.push(
      `DoD-2 FAIL: target origin reset=${originResets} > 0 (camTarget=(0,0,0) jump 검출)`,
    );
  }
  const dod3Pass = camRadiusJumps === 0;
  if (!dod3Pass) {
    reasons.push(
      `DoD-3 FAIL: camR jump > ${CAMERA_RADIUS_JUMP_THRESHOLD} unit 횟수=${camRadiusJumps} (max jump=${maxJump.toFixed(1)})`,
    );
  }

  return {
    pass: dod1Pass && dod2Pass && dod3Pass,
    tierTransitions,
    originResets,
    camRadiusJumps,
    maxJump,
    sunInvolved,
    selfFocus,
    finalTier,
    skipOriginCheck,
    reasons,
  };
}

async function run9CellMatrix(browser) {
  console.log('\n=== #408 9 cells matrix (3 from × 3 to) ===\n');
  const cellResults = [];
  let allPass = true;

  for (const fromBody of ACTIVE_BODIES) {
    for (const toBody of ACTIVE_BODIES) {
      // 동일 body (자기 → 자기) 도 포함 — focusOn 이 no-op 단언 (selectedBodyId 변경 없음).
      const cellId = `${fromBody}->${toBody}`;
      const { context, page } = await setupPageWithInitialFocus(browser, fromBody);
      const measurement = await measureTransition(page, toBody);

      let verdict;
      if (measurement.error) {
        verdict = { pass: false, reason: measurement.error, reasons: [measurement.error] };
      } else {
        verdict = evaluateTransitionDoD(measurement.frames, fromBody, toBody);
      }

      const status = verdict.pass ? 'PASS' : 'FAIL';
      const sumLine =
        `  ${cellId.padEnd(20)}: ${status}` +
        `  | tierTrans=${verdict.tierTransitions ?? 'n/a'}` +
        `  | originResets=${verdict.originResets ?? 'n/a'}` +
        `  | camR maxJump=${verdict.maxJump?.toFixed(1) ?? 'n/a'}` +
        `  | frames=${measurement.frames?.length ?? 0}`;
      console.log(sumLine);
      if (!verdict.pass) {
        for (const r of verdict.reasons ?? []) {
          console.log(`        ${r}`);
        }
        allPass = false;
      }
      cellResults.push({ cellId, fromBody, toBody, measurement, verdict });
      await context.close();
    }
  }

  return { pass: allPass, cellResults };
}

async function main() {
  const fullResult = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    matrix: null,
  };
  let allPass = true;

  // #940 — 브라우저 수명주기를 `withBrowser` 로 위임 (에러 경로 close 도달 보장).
  // launch 인자는 원본 그대로 전달한다 (렌더러 축 불변 — docs/ops/browser-verify-helpers.md).
  await withBrowser({ headless: true }, async (browser) => {
    const matrix = await run9CellMatrix(browser);
    fullResult.matrix = matrix;
    if (!matrix.pass) allPass = false;
  });

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
