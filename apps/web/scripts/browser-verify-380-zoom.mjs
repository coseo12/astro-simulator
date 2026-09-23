#!/usr/bin/env node
/**
 * #380 fix 회귀 가드 — tier 전환 시 jitter / 줌인 후 freeze 회귀 차단.
 *
 * ADR `docs/decisions/20260509-380-zoom-camera-freeze-forensic.md` §결정 §회귀 가드 +
 * §Amendment 2026-05-11 §Concrete Predictions 6, 7 + §Amendment 3 (#1232).
 *
 * ⚠️ Prediction 6 (라운드 2 — 「tier 전환 시점 raw radius 변화율 부호 일관성」) 은 §Amendment 3
 * A3.1 에서 **반증**됐다. S2 는 더 이상 Prediction 6 의 구현이 아니다 — 아래 S2 절 참조.
 *
 * 사용법:
 *   pnpm --filter @astro-simulator/web verify:380-zoom
 *   pnpm --filter @astro-simulator/web verify:380-zoom -- --json
 *   pnpm --filter @astro-simulator/web verify:380-zoom -- --only=s2   (변이 테스트용 — 전체 판정 아님)
 *
 * ## 검증 시나리오 (4 가드 직교 매트릭스)
 *
 * | 시나리오 | 가드 | DoD | 비고 |
 * |---|---|---|---|
 * | S1. T3 진입 후 줌인 5회 | 가드 A (lowerRadiusLimit) | radius 가 mesh boundingRadius 근접까지 감소 | wall 차단 검증 |
 * | S2. free-fly 줌 solar→inner 경계 통과 | 즉시 대입 (ADR 380 A3.5-1 — free-fly 분기) | 매 렌더 프레임 실거리 역행 0 ∧ 추가 전이 0 | 계약 재조정 2 (#1232) — Prediction 6 대체 |
 * | S3. 빠른 휠 회전 5회 | 가드 B (in-flight lock) | tier 변화 횟수 ≤ 입력 횟수 (oscillate 차단) | ADR Prediction 2 |
 * | S4. T3 body + focus + 30s 자유 줌 | 가드 C (primary follow) | radius 입력 반응 유지 (freeze 0회) | ADR Prediction 4 |
 *
 * ## S2 — 계약 재조정 2 (사용자 승인 2026-09-19, #1232 코멘트 5741978238)
 *
 * **사실**: 구 S2 는 수정판과 `develop` **양쪽에서 FAIL** 했다 (이 가드가 CI 에 배선돼 있지 않아
 * 드러나지 않았다). 원인 둘:
 *  1. 판정량이 raw `camera.radius` 부호였다. radius 는 tier 마다 단위가 달라 (solar→inner 18.3 배)
 *     올바른 경계 통과도 단위 전환 순간을 역행으로 읽는다 (A3.1(3)). 구 S2 실측
 *     `radii=[33.53, 582.07, 547.93, …]` 의 `+` 부호가 바로 그 단위 점프다.
 *  2. `window.__simCore?.sendCommand?.(…)` 를 불렀지만 `SimulationCore` 에는 `sendCommand` 가 **없다**
 *     (공개 메서드는 `command(cmd)` — `packages/core/src/engine/simulation-core.ts`). 옵셔널 체이닝이라
 *     예외 없이 **조용히 no-op** 했다. 그래서 구 S2 는 mercury focus-entry 를 한 번도 재지 않았고,
 *     실제로 잰 것은 기본 개요 (focus 없음) 에서 휠이 solar→inner 경계를 넘는 경로였다.
 *
 * **처분 — 호출을 `command` 로 고치지 않고 제거한다.** 근거:
 *  - 구 S2 의 명목 대상 (focus-entry, `preserveFocusDistance=false`) 은 V5 재프레이밍 tween 이라
 *    실거리가 **의도적으로** 불연속이다 (`boundingR × 5` 로 옮겨감). 「실거리 단조」 술어가 적용될 수
 *    없는 다른 계약이고, #1232 는 이 경로를 바꾸지 않았다 (A3.5-1 — 무변경, A3.7 재검토 조건 2).
 *  - 커버리지가 비는 쪽은 **free-fly 줌 crossing** 이다 (reviewer 의견, PR #1237). 이 분기는
 *    `verify:818` S4 (`focus=earth` 전용) 가 지나지 않는다: `targetRadius = computeTargetRadius`
 *    · #790 floor 없음 · `camera.target` 을 새 단위로 옮기지 않음 · 판정이
 *    `tierFromCameraDistance(cameraFromSun)` · 그리고 #1232 로 #408 F2 입력 잠금 창이 사라졌다.
 *    `verify:629/631/699/704` 중 경계를 넘는 즉시 대입을 실거리로 재는 가드는 없다.
 *  ⇒ 구 S2 가 **사실상** 재던 경로를 **명시적** 대상으로 삼고 판정량만 교체한다.
 *
 * **판정** (정수 술어만 — 새 임계 0개). 기록은 `tier-frame-recorder.mjs` (verify:818 S4 와 공용,
 * 매 렌더 프레임) 이고 실거리는 `radius / RENDER_SCALE[tier] / AU` 다 (개요 카메라 target 은 태양 원점).
 *  - FAIL (exit 1): 단조 줌인 입력 (연속 휠 + 관성 꼬리) 중 **실거리 역행 프레임 수 > 0**
 *    (`au[i] > au[i-1]`) 또는 **tier 전이 횟수 ≠ 1** (기대 solar→inner 1회 외 추가 전이 = 경계 진동)
 *  - 전제 위반 (exit 2): 시작 tier ≠ solar · focus 존재 · 기록 프레임 0 · 기대 전이 solar→inner
 *    **0회** · 전환 프레임 다음 프레임 부재 · 실거리 비유한 프레임 (tier 미상). `== 0` 불변 술어는
 *    표본이 비면 증거 0 으로 통과하므로, 「기대 전이 ≥ 1 + 전·후 프레임 존재」 를 전제로 결합한다.
 *
 * **Prediction 6 과의 관계**: Prediction 6 은 A3.1 로 반증됐고 focus 경로의 대체 판정량은 A3.6
 * (8~12, `verify:818` S4) 이다. 본 S2 는 A3.6 이 쓰는 원칙 (전환 프레임을 실거리로 직접 본다) 을
 * **free-fly 분기**로 넓힌 것이며, A3.7 재검토 조건 3 (「free-fly 는 즉시 대입이 적용된다 — 회귀 시
 * tween 경로 복귀 재판정」) 의 측정 수단이다.
 *
 * dev 빌드 의존:
 *  - `window.__solarScene.meshes` (Map<id, Mesh>) — solar-system-scene.ts:1237 export
 *  - `window.__solarScene.getTier()` — 현재 tier 반환
 *  - `window.__simStore` — S2 전제 (focus 없음) 확인
 *
 * 종료 코드: 확정 FAIL 이 하나라도 있으면 1 (우선) / FAIL 없이 전제 위반·측정 오류가 있으면 2 / 전부 PASS 0.
 *
 * 환경변수:
 *   BASE_URL  — 웹 서버 URL (기본 http://localhost:3000)
 */

import { withBrowser } from '../../../scripts/browser-verify-utils.mjs';
import {
  drainFrameRecorder,
  installFrameRecorder,
  tierTransitions,
} from './tier-frame-recorder.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const BASELINE_PATH = path.join(__dirname, '__baselines__', 'zoom-380.json');

const args = process.argv.slice(2);
const flags = {
  json: args.includes('--json'),
  update: args.includes('--update'),
  // S2 만 실행 — 변이 테스트용 (#1232). 전체 판정은 플래그 없이.
  onlyS2: args.includes('--only=s2'),
};

const VIEWPORT = { width: 1280, height: 800, dpr: 1 };
const POST_FOCUS_WAIT_MS = 2500; // tier transition (300ms) + dolly + LOD 안정화 마진

/**
 * 시나리오 상태 — 종료 코드 합성 입력. `PRECONDITION` = 전제 위반·측정 오류 (판정 불가, exit 2).
 * 확정 `FAIL` 이 하나라도 있으면 exit 1 이 우선한다 (verify:818 과 같은 규칙 — #1232 reviewer 권고 1(나)).
 */
const STATUS = Object.freeze({ PASS: 'PASS', FAIL: 'FAIL', PRECONDITION: 'PRECONDITION' });

/**
 * 측정 헬퍼 — 카메라 상태 + tier 스냅샷.
 * dev 빌드 한정 노출 핸들 사용.
 */
async function measureCameraState(page) {
  return await page.evaluate(() => {
    const solar = /** @type {any} */ (window).__solarScene;
    if (!solar) return { error: '__solarScene 미노출' };
    const meshes = solar.meshes;
    if (!meshes) return { error: 'meshes 미노출' };

    // 임의 mesh 1개로 scene + activeCamera 추출
    const firstMesh = meshes.values().next().value;
    if (!firstMesh) return { error: '메쉬 없음' };
    const scene = firstMesh.getScene();
    if (!scene) return { error: 'scene 추출 실패' };
    const camera = scene.activeCamera;
    if (!camera) return { error: 'activeCamera null' };

    return {
      tier: solar.getTier ? solar.getTier() : 'unknown',
      camRadius: camera.radius,
      camLowerRadiusLimit: camera.lowerRadiusLimit,
      camMinZ: camera.minZ,
      camAlpha: camera.alpha,
      camBeta: camera.beta,
    };
  });
}

/**
 * 휠 입력 시뮬레이션 — wheel event를 canvas 에 dispatch.
 * Babylon ArcRotateCamera 의 native wheel handler 가 radius 를 변경한다.
 *
 * @param page Playwright Page
 * @param deltaY 1회 휠 input deltaY (양수 = zoom out, 음수 = zoom in)
 * @param count 반복 횟수
 * @param intervalMs 각 입력 간 간격 (ms)
 */
async function dispatchWheel(page, deltaY, count, intervalMs = 100) {
  for (let i = 0; i < count; i += 1) {
    await page.evaluate(
      ({ deltaY }) => {
        const canvas = document.querySelector('canvas');
        if (!canvas) return false;
        const rect = canvas.getBoundingClientRect();
        const event = new WheelEvent('wheel', {
          deltaY,
          bubbles: true,
          cancelable: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        });
        canvas.dispatchEvent(event);
        return true;
      },
      { deltaY },
    );
    if (intervalMs > 0) await page.waitForTimeout(intervalMs);
  }
}

/**
 * 시나리오 S1 — T3 진입 후 줌인 5회 (가드 A).
 *
 * DoD: 가드 A 적용 후 lowerRadiusLimit 이 tier 별 적정값 (`targetRadius * 0.01`) 으로 동적 변경 →
 *      줌인 5회 시 radius 가 단조 감소 + 최종 radius < initial radius * 0.5 (wall 차단).
 */
async function scenarioS1Wall(browser) {
  console.log('\n[S1] T3 body 진입 후 줌인 5회 (가드 A: lowerRadiusLimit wall 차단)');
  const context = await browser.newContext({
    viewport: { width: VIEWPORT.width, height: VIEWPORT.height },
    deviceScaleFactor: VIEWPORT.dpr,
  });
  const page = await context.newPage();
  try {
    await page.goto(`${BASE_URL}/?gpu=a&focus=mercury&lod=auto`, {
      waitUntil: 'networkidle',
      timeout: 30_000,
    });
    await page.waitForFunction(
      () => typeof window.__simCore !== 'undefined' && typeof window.__solarScene !== 'undefined',
      undefined,
      { timeout: 20_000 },
    );
    await page.waitForTimeout(POST_FOCUS_WAIT_MS);

    const initial = await measureCameraState(page);
    const radii = [initial.camRadius];
    // 줌인 (deltaY < 0) — Babylon ArcRotate 휠 handler 기준 radius 감소.
    for (let i = 0; i < 5; i += 1) {
      await dispatchWheel(page, -300, 1, 200);
      const m = await measureCameraState(page);
      radii.push(m.camRadius);
    }
    const final = await measureCameraState(page);

    // DoD: 단조 감소 (휠 줌인 input 5회 누적 → radius 단조 감소)
    let monotonic = true;
    for (let i = 1; i < radii.length; i += 1) {
      if (radii[i] > radii[i - 1] + 1e-6) {
        monotonic = false;
        break;
      }
    }

    const result = {
      scenario: 'S1',
      tier: final.tier,
      lowerRadiusLimit: final.camLowerRadiusLimit,
      radii,
      initial: radii[0],
      final: radii[radii.length - 1],
      monotonic,
      pass: monotonic && final.tier === 'body',
    };
    console.log(
      `  tier=${result.tier} lowerLimit=${result.lowerRadiusLimit?.toFixed?.(4) ?? 'n/a'} radius ${result.initial?.toFixed?.(2)} → ${result.final?.toFixed?.(2)} monotonic=${monotonic}`,
    );
    return result;
  } finally {
    await context.close();
  }
}

// S2 — 시나리오 설정값 (판정 임계 아님). 틱 형태는 verify:818 S4a 와 같다 (−120 · 50 ms).
const S2_WHEEL_DELTA = 120;
const S2_TICK_MS = 50;
// 연속 틱 상한 — 기본 개요 (실거리 ≈2.8 AU) 에서 solar→inner 경계 (`3 AU × 0.85 = 2.55 AU`) 는
// 실측 2~3 틱이다. 상한 도달 = 전이 0회 → 전제 위반 (exit 2).
const S2_MAX_TICKS = 200;
// 경계 통과 후 관성 꼬리 기록 (verify:818 S4a 와 같은 값).
const S2_POST_MS = 800;
// 개요 카메라를 얻을 mesh — 어느 body 든 같은 scene.
const S2_SCENE_MESH_ID = 'sun';

/**
 * 시나리오 S2 — free-fly 줌 solar→inner 경계 통과 (계약 재조정 2, #1232).
 *
 * 머리말 §S2 참조. 기본 개요 (focus 없음 → `updateTierByCamera` 가 `tierFromCameraDistance` 분기)
 * 에서 연속 휠 줌인으로 solar→inner 를 넘기고, 매 렌더 프레임 실거리를 기록해 역행 프레임 수와
 * tier 전이 횟수를 센다. 결함 (tween 이 구 단위 radius 에서 출발) 은 전환 프레임에 실거리가
 * 1/18.3 로 떨어졌다가 tween 이 되돌리는 **역행** 으로 드러난다.
 */
async function scenarioS2FreeFlyCrossing(browser) {
  console.log('\n[S2] free-fly 줌 solar→inner 경계 통과 (즉시 대입 — 매 렌더 프레임 실거리)');
  const context = await browser.newContext({
    viewport: { width: VIEWPORT.width, height: VIEWPORT.height },
    deviceScaleFactor: VIEWPORT.dpr,
  });
  const page = await context.newPage();
  try {
    await page.goto(`${BASE_URL}/?gpu=a&lod=auto`, {
      waitUntil: 'networkidle',
      timeout: 30_000,
    });
    await page.waitForFunction(
      () => typeof window.__solarScene !== 'undefined' && typeof window.__simStore !== 'undefined',
      undefined,
      { timeout: 20_000 },
    );
    await page.waitForTimeout(POST_FOCUS_WAIT_MS);

    const start = await page.evaluate(() => ({
      tier: window.__solarScene.getTier(),
      selectedBodyId: window.__simStore.getState().selectedBodyId ?? null,
    }));
    const rec = await installFrameRecorder(page, S2_SCENE_MESH_ID);
    if (rec.error) {
      console.log(`  [측정 오류] ${rec.error}`);
      return { scenario: 'S2', error: rec.error, status: STATUS.PRECONDITION, pass: false };
    }
    await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
    let ticks = 0;
    for (; ticks < S2_MAX_TICKS; ticks += 1) {
      await page.mouse.wheel(0, -S2_WHEEL_DELTA);
      await page.waitForTimeout(S2_TICK_MS);
      if ((await page.evaluate(() => window.__solarScene.getTier())) !== 'solar') break;
    }
    await page.waitForTimeout(S2_POST_MS);
    const frames = await drainFrameRecorder(page);
    const trans = tierTransitions(frames);
    const ci = trans.find((x) => x.from === 'solar' && x.to === 'inner')?.i ?? -1;

    // 전제 — 하네스 설정 · 측정 성립만 (제품 속성 아님).
    const pre = [];
    if (start.tier !== 'solar') pre.push(`시작 tier=${start.tier}≠solar`);
    if (start.selectedBodyId !== null)
      pre.push(`focus=${start.selectedBodyId} (free-fly 분기 아님)`);
    if (frames.length === 0) pre.push('기록 프레임 0');
    if (!(ci > 0 && ci + 1 < frames.length)) {
      pre.push(`기대 전이 solar→inner 부재/전후 프레임 부족 ci=${ci} ticks=${ticks}`);
    }
    const nonFinite = frames.filter((f) => !Number.isFinite(f.au)).length;
    if (nonFinite > 0) pre.push(`실거리 비유한 프레임 ${nonFinite}`);
    if (pre.length > 0) {
      for (const p of pre) console.log(`  [전제 위반] ${p}`);
      return {
        scenario: 'S2',
        preconditions: pre,
        frames: frames.length,
        status: STATUS.PRECONDITION,
        pass: false,
      };
    }

    // 판정 (정수 술어). 줌인 입력만 넣었으므로 실거리는 비증가여야 한다.
    const reversals = [];
    for (let i = 1; i < frames.length; i += 1) {
      if (frames[i].au > frames[i - 1].au) reversals.push(i);
    }
    const extraTransitions = trans.length - 1;
    const pass = reversals.length === 0 && extraTransitions === 0;
    const around = frames
      .slice(Math.max(0, ci - 1), ci + 3)
      .map((f) => `${f.tier[0]}:${f.au.toExponential(4)}`);
    console.log(
      `  ticks=${ticks} frames=${frames.length} ci=${ci} 창[ci-1..ci+2]=${around.join(' · ')}AU | ` +
        `역행 프레임=${reversals.length} (=0?) 전이=${JSON.stringify(trans.map((x) => `${x.from}→${x.to}`))} ` +
        `(추가=${extraTransitions}, =0?) → ${pass ? 'PASS' : 'FAIL'} | ` +
        `dt[ci]=${frames[ci].dt?.toFixed(1)}ms (진단)`,
    );
    if (reversals.length > 0) {
      const r0 = reversals[0];
      console.log(
        `  첫 역행 frame ${r0}: ${frames[r0 - 1].tier}:${frames[r0 - 1].au.toExponential(4)} → ` +
          `${frames[r0].tier}:${frames[r0].au.toExponential(4)} AU`,
      );
    }
    return {
      scenario: 'S2',
      ticks,
      frames: frames.length,
      ci,
      reversals: reversals.length,
      firstReversal: reversals[0] ?? null,
      transitions: trans.map((x) => `${x.from}→${x.to}`),
      extraTransitions,
      status: pass ? STATUS.PASS : STATUS.FAIL,
      pass,
    };
  } finally {
    await context.close();
  }
}

/**
 * 시나리오 S3 — 빠른 휠 회전 5회 (가드 B: in-flight lock).
 *
 * ADR Prediction 2: tier transition in-flight 동안 추가 tier 변경이 차단되어 detachControl 호출
 * 횟수가 단일 줌 동안 1회로 고정. 본 시나리오는 tier oscillate 가 발생하지 않는지 (tier 변화
 * 횟수 ≤ 1) 검증.
 *
 * DoD: 5회 빠른 휠 입력 동안 tier 변화 횟수 ≤ 2 (입력 시점 1회 + 안정화 시점 1회).
 *      oscillate 발생 시 tier 변화 횟수 ≥ 5.
 */
async function scenarioS3Oscillate(browser) {
  console.log('\n[S3] 빠른 휠 회전 5회 (가드 B: in-flight lock — tier oscillate 차단)');
  const context = await browser.newContext({
    viewport: { width: VIEWPORT.width, height: VIEWPORT.height },
    deviceScaleFactor: VIEWPORT.dpr,
  });
  const page = await context.newPage();
  try {
    await page.goto(`${BASE_URL}/?gpu=a&focus=mercury&lod=auto`, {
      waitUntil: 'networkidle',
      timeout: 30_000,
    });
    await page.waitForFunction(
      () => typeof window.__simCore !== 'undefined' && typeof window.__solarScene !== 'undefined',
      undefined,
      { timeout: 20_000 },
    );
    await page.waitForTimeout(POST_FOCUS_WAIT_MS);

    const tierHistory = [];
    const initial = await measureCameraState(page);
    tierHistory.push(initial.tier);

    // 5회 빠른 휠 입력 (50ms 간격)
    for (let i = 0; i < 5; i += 1) {
      await dispatchWheel(page, i % 2 === 0 ? -300 : 300, 1, 50);
      const m = await measureCameraState(page);
      tierHistory.push(m.tier);
    }

    // tier 변화 횟수 (인접 변화)
    let tierChangeCount = 0;
    for (let i = 1; i < tierHistory.length; i += 1) {
      if (tierHistory[i] !== tierHistory[i - 1]) tierChangeCount += 1;
    }

    const result = {
      scenario: 'S3',
      tierHistory,
      tierChangeCount,
      pass: tierChangeCount <= 2, // 최대 2회 (zoom in tier change + zoom out tier change)
    };
    console.log(`  tierHistory=[${tierHistory.join(', ')}] changeCount=${tierChangeCount}`);
    return result;
  } finally {
    await context.close();
  }
}

/**
 * 시나리오 S4 — T3 body + focus + 30s 자유 줌 freeze 검증 (가드 C: primary follow).
 *
 * ADR Prediction 4: D-T2 5건 회귀 #4 가 (a) T3 진입 직후 줌인 / (b) Earth/Mars focus + radius
 * < 1AU / (c) 빠른 휠 회전 셋 중 하나로 분류. 셋 다 위 fix 후 30초 자유 줌 시 freeze 없음.
 *
 * DoD: 30초 동안 휠 입력 → radius 변화 응답 (freeze 시 radius 가 변하지 않음).
 */
async function scenarioS4FreezeFreeFly(browser) {
  console.log('\n[S4] T3 body + focus + 자유 줌 (가드 C: primary follow — freeze 차단)');
  const context = await browser.newContext({
    viewport: { width: VIEWPORT.width, height: VIEWPORT.height },
    deviceScaleFactor: VIEWPORT.dpr,
  });
  const page = await context.newPage();
  try {
    await page.goto(`${BASE_URL}/?gpu=a&focus=mercury&lod=auto`, {
      waitUntil: 'networkidle',
      timeout: 30_000,
    });
    await page.waitForFunction(
      () => typeof window.__simCore !== 'undefined' && typeof window.__solarScene !== 'undefined',
      undefined,
      { timeout: 20_000 },
    );
    await page.waitForTimeout(POST_FOCUS_WAIT_MS);

    // 줌인 / 줌아웃 교차 5회 — 각각 후 radius 변화 측정 (freeze 시 변화 0)
    const measurements = [];
    const directions = [-300, -300, 300, -300, 300]; // 줌in, 줌in, 줌out, 줌in, 줌out
    let prevRadius = (await measureCameraState(page)).camRadius;
    let totalDelta = 0;
    for (const deltaY of directions) {
      await dispatchWheel(page, deltaY, 1, 300);
      const m = await measureCameraState(page);
      const delta = Math.abs(m.camRadius - prevRadius);
      totalDelta += delta;
      measurements.push({ deltaY, prevRadius, newRadius: m.camRadius, delta });
      prevRadius = m.camRadius;
    }

    // DoD: 5회 누적 radius 변화량이 0 보다 충분히 큼 (freeze 시 = 0)
    const result = {
      scenario: 'S4',
      measurements,
      totalDelta,
      pass: totalDelta > 0.001, // 매우 관대한 임계 — freeze 시 0
    };
    console.log(`  totalDelta=${totalDelta.toFixed(4)} (freeze 시 0)`);
    return result;
  } finally {
    await context.close();
  }
}

async function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
}

async function main() {
  console.log('\n=== #380 줌 freeze + jitter 회귀 가드 (Option D+G8a 4 가드) ===');
  console.log(`  base URL: ${BASE_URL}`);

  const fullResult = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    scenarios: {},
  };

  // #940 — 브라우저 수명주기를 `withBrowser` 로 위임 (에러 경로 close 도달 보장).
  // launch 인자는 원본 그대로 전달한다 (렌더러 축 불변 — docs/ops/browser-verify-helpers.md).
  await withBrowser({ headless: true }, async (browser) => {
    if (!flags.onlyS2) fullResult.scenarios.s1 = await scenarioS1Wall(browser);
    fullResult.scenarios.s2 = await scenarioS2FreeFlyCrossing(browser);
    if (!flags.onlyS2) {
      fullResult.scenarios.s3 = await scenarioS3Oscillate(browser);
      fullResult.scenarios.s4 = await scenarioS4FreezeFreeFly(browser);
    }
  });

  if (flags.update) {
    fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(fullResult, null, 2));
    console.log(`\n  baseline 업데이트: ${path.relative(process.cwd(), BASELINE_PATH)}`);
  }

  // S1·S3·S4 는 PASS/FAIL 이분, S2 만 전제 위반 (PRECONDITION) 을 가진다.
  const statuses = Object.values(fullResult.scenarios).map(
    (sc) => sc.status ?? (sc.pass ? STATUS.PASS : STATUS.FAIL),
  );
  const exitCode = statuses.includes(STATUS.FAIL)
    ? 1
    : statuses.includes(STATUS.PRECONDITION)
      ? 2
      : 0;

  console.log('\n=== 최종 요약 ===');
  for (const [key, scenario] of Object.entries(fullResult.scenarios)) {
    console.log(`  ${key}: ${scenario.status ?? (scenario.pass ? 'PASS' : 'FAIL')}`);
  }
  if (flags.onlyS2) console.log('  (⚠️ --only=s2 — S1·S3·S4 미실행. 전체 판정은 플래그 없이 실행)');
  console.log(
    `  overall: ${exitCode === 0 ? 'PASS' : exitCode === 1 ? 'FAIL' : 'PRECONDITION VIOLATED (exit 2)'}`,
  );

  if (flags.json) {
    console.log('\n--- JSON ---');
    console.log(JSON.stringify(fullResult, null, 2));
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
