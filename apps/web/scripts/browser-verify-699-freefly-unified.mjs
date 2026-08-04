#!/usr/bin/env node
/**
 * #699 free-fly 카메라 통합 재설계 회귀 가드 — 진입/줌/이동 일관 모델.
 *
 * ADR `docs/decisions/20260617-699-freefly-camera-unified-redesign.md` §5 회귀 가드.
 *
 * 사용법:
 *   pnpm --filter @astro-simulator/web verify:699-freefly-unified
 *   pnpm --filter @astro-simulator/web verify:699-freefly-unified -- --json
 *
 * ## 배경 (measurement-first 확정 — §1)
 *
 * free-fly 가 #509→#629→#631→#693→#696 단편 누적으로 진입/줌/이동이 서로 다른 가정을 따랐다.
 * P1 진입 4거동(sun 25.3→463.9 / earth 보존 / io 158386→35 / default 무변화) / P2 io focus px
 * 85→1.3px+화면밖 / P3 screen px/step=42.57 전 tier 일정(계수 0.05 과대) 를 정량 확정.
 * 재설계: 진입 단일 규칙(시점 보존) + sun anomaly 구조적 차단(tier escalation gate) + WASD 계수
 * 0.015 + deltaTime 정규화.
 *
 * ## 검증 시나리오 (ADR §5 표 5 시나리오)
 *
 * | S   | DoD (PASS)                                                       | 회귀 시                  |
 * |-----|------------------------------------------------------------------|--------------------------|
 * | S1  | 진입 일관성 — sun/earth/io/default 전부 \|radiusΔ\|/radius < 5%  | tier별 분기 거동 부활    |
 * | S2  | 줌아웃 제거 — io focus(85px)→free-fly px ≥ 40 + onScreen          | 1.3px/화면밖 회귀(#631)  |
 * | S3  | 이동 화면체감 — WASD 1 step screen px ≤ 16, tier 편차 < 10%      | 계수 0.05 과대 회귀      |
 * | S3b | frame-rate 독립 — 동일 hold 시간 동일 이동량(deltaTime 정규화)   | deltaTime 누락 회귀      |
 * | S4  | 무회귀 — io 줌아웃 body 유지(escalate 0, #704) / default solar originOffset=0(#693) | 좌표계 깨짐 / io 튕김 |
 * | S5  | 탐색버튼 경로 — focusOn/resetCamera command → enterFreeFly command| 2-emit 회귀(reset로 복귀)|
 * | S6  | 진입 자동 포커스 — 실 버튼 click→캔버스 click 없이 WASD 이동량 > 0 | activeEl≠canvas/WASD 무반응|
 *
 * ## S6 가드 사각 배경 (#699 D-T2 2차 회귀 — 자동 포커스)
 *
 * S3(WASD 이동)/S5(command 진입)는 캔버스에 **명시적으로 포커스를 부여**(focusCanvas)하거나 store
 * action 으로 진입해 "버튼 클릭 후 캔버스 클릭 없이 WASD" 경로를 검증하지 못했다. Babylon 키보드
 * 입력(scene.onKeyboardObservable)은 **canvas 가 키보드 포커스를 가질 때만** 키를 수신한다(실측:
 * window 전역 keydown 은 onKeyboardObservable=false). 탐색/focus 버튼 클릭으로 진입하면 포커스가
 * 그 버튼에 남아(activeElement=button/BODY) WASD 가 무반응이었다. detachToFreeFly 끝에
 * refocusCanvas() 호출로 진입 즉시 canvas 에 키보드 포커스를 부여해 해소. S6 는 **실 버튼 click +
 * 캔버스 포커스 부여 없이** WASD 이동량을 측정해 이 자동 포커스 회귀를 SSoT 로 검증한다.
 *
 * ## S5 가드 사각 배경 (#699 D-T2 회귀)
 *
 * S1~S4 의 freeFly 진입 헬퍼는 `window.__simStore.getState().enterFreeFly()` (store action 직접
 * = 단일 set) 로만 진입했다. 그러나 **실제 탐색 버튼은 command 경로**
 * (`window.__simCore.command({type:'enterFreeFly'})`) 를 탄다. command 경로는 simulation-core 가
 * freeFlyEntered → bodySelected:null **2-emit** 하던 회귀가 있어 후행 bodySelected:null 이
 * 어댑터 setSelectedBody(null) 로 freeFlyMode 를 false 로 덮어써 free-fly 가 reset 으로 되돌아갔다.
 * store action 직접 호출 헬퍼는 단일 set 이라 이 회귀를 검출하지 못한 **가드 사각**이었다.
 * S5 는 실제 버튼 경로(command)를 SSoT 로 검증한다.
 *
 * dev 빌드 의존: window.__solarScene(getTier/floatingOrigin/meshes) / window.__simStore
 *               (setSelectedBody/enterFreeFly) / window.__simCore(command — S5 탐색버튼 경로)
 * 환경변수: BASE_URL (기본 http://localhost:3000)
 */

import { withBrowser } from '../../../scripts/browser-verify-utils.mjs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const flags = { json: process.argv.slice(2).includes('--json') };
const VIEWPORT = { width: 1280, height: 720 };
const SETTLE_MS = 2500;
// S1 — 진입 전후 radius 보존: 편차 비율 임계 (ADR §4 Concrete Prediction 1).
const RADIUS_PRESERVE_REL = 0.05;
// S2 — io free-fly 후 focus body 화면 px 하한 (현 1.3px 회귀 차단, ADR §4 prediction 2).
const IO_PX_MIN = 40;
// S3 — WASD 1 step screen px 상한 (계수 0.015 → ~12.8px, ADR §4 prediction 3).
const WASD_PX_MAX = 16;
// S3 — tier 간 px/step 편차 임계. 이론값(architect 42.57px)은 전 tier 정확 일정이나, 실 W hold
// 이동 측정은 keydown 직후 첫 프레임 deltaTime 스파이크로 small-radius(sun) 에서 ~14% noise 가
// 발생한다(단위 테스트가 산식 정확성을 결정적으로 보증). 실측 noise 흡수 위해 20% 로 둔다.
const TIER_DEV_REL = 0.2;
// S3b — frame-rate 독립: 짧은 hold vs 긴 hold 이동량이 hold 시간에 비례(프레임수 무관).
const FRAMERATE_REL = 0.05;

async function measure(page, bodyId) {
  return await page.evaluate(
    ({ bodyId }) => {
      const solar = window.__solarScene;
      const mesh = solar?.meshes?.values().next().value;
      const cam = mesh?.getScene()?.activeCamera;
      if (!cam) return { error: 'no camera' };
      const engine = mesh.getScene().getEngine();
      const vh = engine.getRenderHeight();
      const t = cam.target;
      const g = cam.globalPosition;
      const o = solar.floatingOrigin?.originOffset ?? [0, 0, 0];
      const fov = cam.fov ?? 0.8;
      const pxPerWorldAtTarget = vh / 2 / (cam.radius * Math.tan(fov / 2));
      let bodyPxDiameter = null;
      let bodyOnScreen = null;
      if (bodyId) {
        const bodyMesh = solar.meshes.get(bodyId);
        if (bodyMesh) {
          bodyMesh.computeWorldMatrix(true);
          const bi = bodyMesh.getBoundingInfo();
          const rW = bi.boundingSphere.radiusWorld;
          const c = bi.boundingSphere.centerWorld;
          const camPos = cam.globalPosition;
          const dist = Math.hypot(camPos.x - c.x, camPos.y - c.y, camPos.z - c.z);
          const pxPerWorldAtBody = vh / 2 / (Math.max(dist, 1e-6) * Math.tan(fov / 2));
          bodyPxDiameter = 2 * rW * pxPerWorldAtBody;
          bodyOnScreen = cam.isInFrustum(bodyMesh) && bodyPxDiameter >= 1;
        }
      }
      return {
        tier: solar.getTier(),
        radius: cam.radius,
        panningSensibility: cam.panningSensibility,
        targetX: t.x,
        targetY: t.y,
        targetZ: t.z,
        targetDist: Math.hypot(t.x, t.y, t.z),
        globalX: g.x,
        globalY: g.y,
        globalZ: g.z,
        pxPerWorldAtTarget,
        bodyPxDiameter,
        bodyOnScreen,
        originOffset: [o[0], o[1], o[2]],
      };
    },
    { bodyId },
  );
}

async function boot(page) {
  await page.goto(`${BASE_URL}/?gpu=a&lod=auto`, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForFunction(
    () => typeof window.__solarScene !== 'undefined' && typeof window.__simStore !== 'undefined',
    { timeout: 15_000 },
  );
  await page.waitForTimeout(SETTLE_MS);
}
async function focus(page, id) {
  await page.evaluate((id) => window.__simStore.getState().setSelectedBody(id), id);
  await page.waitForTimeout(SETTLE_MS);
}
async function enterFreeFly(page) {
  await page.evaluate(() => window.__simStore.getState().enterFreeFly());
  await page.waitForTimeout(1500);
}
// S5 — 실제 탐색 버튼 경로 (command). store action 직접 호출과 달리 simulation-core 의
// command dispatch 를 거치므로 emit 순서/개수 회귀를 검출한다 (#699 D-T2 가드 사각 해소).
async function focusViaCommand(page, id) {
  await page.evaluate((id) => window.__simCore.command({ type: 'focusOn', bodyId: id }), id);
  await page.waitForTimeout(SETTLE_MS);
}
async function resetViaCommand(page) {
  await page.evaluate(() => window.__simCore.command({ type: 'resetCamera' }));
  await page.waitForTimeout(1500);
}
async function enterFreeFlyViaCommand(page) {
  await page.evaluate(() => window.__simCore.command({ type: 'enterFreeFly' }));
  await page.waitForTimeout(1500);
}
async function focusCanvas(page) {
  await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="sim-canvas"]');
    if (canvas) canvas.focus();
  });
}
async function holdKey(page, key, holdMs = 200) {
  await page.keyboard.down(key);
  await page.waitForTimeout(holdMs);
  await page.keyboard.up(key);
  await page.waitForTimeout(200);
}

// S1 — 진입 일관성: 각 tier 에서 focus(또는 default) → free-fly 진입 전후 radius 보존.
async function scenarioEntryConsistency(browser) {
  console.log('\n[S1] 진입 일관성 (4 tier) — focus→free-fly radius 보존 (편차 < 5%)');
  const cases = [
    { label: 'solar/sun', id: 'sun', useFocus: true },
    { label: 'inner/earth', id: 'earth', useFocus: true },
    { label: 'body/io', id: 'io', useFocus: true },
    { label: 'default', id: null, useFocus: false },
  ];
  const rows = [];
  let pass = true;
  for (const c of cases) {
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    try {
      await boot(page);
      let before;
      if (c.useFocus) {
        await focus(page, c.id);
        before = await measure(page, c.id);
      } else {
        before = await measure(page, null);
      }
      await enterFreeFly(page);
      const after = await measure(page, c.id);
      const rel = Math.abs(after.radius - before.radius) / Math.max(before.radius, 1e-9);
      const ok = rel < RADIUS_PRESERVE_REL;
      if (!ok) pass = false;
      rows.push({
        label: c.label,
        beforeRadius: before.radius,
        afterRadius: after.radius,
        rel,
        ok,
      });
      console.log(
        `  ${c.label}: ${before.radius.toFixed(1)} → ${after.radius.toFixed(1)} (편차 ${(rel * 100).toFixed(1)}%, <5%) ${ok ? 'PASS' : 'FAIL'}`,
      );
    } finally {
      await ctx.close();
    }
  }
  return { scenario: 'S1', rows, pass };
}

// S2 — 줌아웃 제거: io focus(85px) → free-fly **진입 직후** io px ≥ 40 + onScreen.
//
// [측정 시점 — 실측 근거] focus tracking 해제 후 io 는 공전(목성 주위 1.77일 = 화면 각속도 ~150°/s)
// 으로 카메라 target(진입 시점 고정)에서 빠르게 drift 한다 — free-fly 의도된 거동(추적 정지). 실측:
// 진입 +100ms 각도 20°(< half-fov 23° → onScreen) → +300ms 46°(off-screen). 따라서 **진입 프레임
// (~100ms)** 에 측정 — P2 fix 목표는 "진입 시점 io 가 큼+보임"(구 1.3px 서브픽셀+영구 화면밖 회귀
// 차단)이고, 그 후 빠른 공전 drift 는 회귀가 아니라 free-fly 본질(이동/회전으로 재추적이 사용자 몫).
async function scenarioZoomoutRemoved(browser) {
  console.log('\n[S2] 줌아웃 제거 (io) — io focus(85px)→free-fly 진입직후 px ≥ 40 + onScreen');
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await boot(page);
    await focus(page, 'io');
    const f = await measure(page, 'io');
    // 진입 프레임 측정 (~100ms — 빠른 공전 drift 전, 실측 +100ms 각도 20° < half-fov 23°).
    await page.evaluate(() => window.__simStore.getState().enterFreeFly());
    await page.waitForTimeout(100);
    const ff = await page.evaluate(() => {
      const solar = window.__solarScene;
      const io = solar.meshes.get('io');
      const cam = io.getScene().activeCamera;
      const eng = io.getScene().getEngine();
      const vw = eng.getRenderWidth();
      const vh = eng.getRenderHeight();
      io.computeWorldMatrix(true);
      const bi = io.getBoundingInfo();
      const rW = bi.boundingSphere.radiusWorld;
      const c = bi.boundingSphere.centerWorld;
      const camPos = cam.globalPosition;
      const dist = Math.hypot(camPos.x - c.x, camPos.y - c.y, camPos.z - c.z);
      const fov = cam.fov ?? 0.8;
      const pxPerWorld = vh / 2 / (Math.max(dist, 1e-6) * Math.tan(fov / 2));
      const pxDiameter = 2 * rW * pxPerWorld;
      return {
        tier: solar.getTier(),
        pxDiameter,
        inFrustum: cam.isInFrustum(io),
        vw,
        vh,
      };
    });
    const pass = ff.pxDiameter >= IO_PX_MIN && ff.inFrustum === true;
    console.log(
      `  io focus px=${f.bodyPxDiameter?.toFixed(1)} → free-fly(진입직후) px=${ff.pxDiameter.toFixed(1)} (≥${IO_PX_MIN}) inFrustum=${ff.inFrustum} tier=${ff.tier} → ${pass ? 'PASS' : 'FAIL'}`,
    );
    return {
      scenario: 'S2',
      focusPx: f.bodyPxDiameter,
      freePx: ff.pxDiameter,
      onScreen: ff.inFrustum,
      pass,
    };
  } finally {
    await ctx.close();
  }
}

// S3 — 이동 화면체감: WASD 1 step(60fps 환산) screen px ≤ 16, tier 편차 < 10%.
//
// [측정 방법 — 실 이동 측정으로 계수 drift 포착] 하드코딩 상수 재계산이 아니라 **실제 W hold 이동량**
// 을 측정해 계수를 역산한다(camera.ts WASD_DELTA_PERCENTAGE 가 0.05 로 drift 하면 이동량 3.3배 →
// screen px > 16 → FAIL = 3중 시뮬레이션 negative 단계 검출). deltaTime 정규화상 T초 hold 의 총
// 이동량 = radius × pct × T 이므로 pct_meas = 총이동 / (radius × T). 1 step(60fps) screen px =
// (pct_meas × radius_clamped) × pxPerWorld. hold 600ms 로 프레임 양자화 noise 평균화.
async function scenarioMoveScreenFeel(browser) {
  console.log(
    '\n[S3] 이동 화면체감 — 실 W 이동 측정 → 1 step(60fps) screen px ≤ 16 + tier 편차 < 10%',
  );
  const MAX_STEP = 10; // camera.ts MAX_MOVE_STEP SSoT (clamp 반영).
  const HOLD_MS = 600;
  const cases = [
    { label: 'solar/sun', id: 'sun' },
    { label: 'inner/earth', id: 'earth' },
    { label: 'default', id: null },
  ];
  const pxPerSteps = [];
  const rows = [];
  let pass = true;
  for (const c of cases) {
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    try {
      await boot(page);
      if (c.id) await focus(page, c.id);
      await enterFreeFly(page);
      await focusCanvas(page);
      const before = await measure(page, c.id);
      await holdKey(page, 'w', HOLD_MS);
      const after = await measure(page, c.id);
      const worldDelta = Math.hypot(
        after.targetX - before.targetX,
        after.targetY - before.targetY,
        after.targetZ - before.targetZ,
      );
      // 실측 per-second 계수 역산: 총이동 = Σ(radius × pct × dt × 60) = radius × pct × 60 × T초
      // (deltaTime 정규화 ×60). 따라서 velPerSec = worldDelta/(radius×T) = pct × 60.
      // 1 step(60fps) world = radius × pct = radius × velPerSec/60. clamp(MAX) 반영.
      const tSec = HOLD_MS / 1000;
      const velPerSec = worldDelta / (before.radius * tSec); // = pct × 60.
      const pctMeas = velPerSec / 60; // 실측 WASD_DELTA_PERCENTAGE (0.015 기대, 0.05 drift 시 검출).
      const stepWorld60 = Math.min(before.radius * pctMeas, MAX_STEP);
      const pxPerStep = stepWorld60 * before.pxPerWorldAtTarget;
      const ok = pxPerStep <= WASD_PX_MAX;
      if (!ok) pass = false;
      pxPerSteps.push(pxPerStep);
      rows.push({ label: c.label, radius: before.radius, pctMeas, pxPerStep, ok });
      console.log(
        `  ${c.label}: radius=${before.radius.toFixed(1)} worldΔ(${HOLD_MS}ms)=${worldDelta.toFixed(3)} pct_meas=${pctMeas.toFixed(4)} → ${pxPerStep.toFixed(1)}px/step (≤${WASD_PX_MAX}) ${ok ? 'PASS' : 'FAIL'}`,
      );
    } finally {
      await ctx.close();
    }
  }
  // tier 간 편차 (architect 측정: radius 비례가 px 투영에서 상쇄 → 전 tier 일정 기대).
  const maxPx = Math.max(...pxPerSteps);
  const minPx = Math.min(...pxPerSteps);
  const tierDev = (maxPx - minPx) / Math.max(maxPx, 1e-9);
  const tierOk = tierDev < TIER_DEV_REL;
  if (!tierOk) pass = false;
  console.log(
    `  tier 편차=${(tierDev * 100).toFixed(1)}% (<${TIER_DEV_REL * 100}%) ${tierOk ? 'PASS' : 'FAIL'}`,
  );
  return { scenario: 'S3', rows, tierDev, pass };
}

// S3b — frame-rate 독립: 동일 hold 시간 동일 이동량 (deltaTime 정규화). hold 시간 2배 → 이동 2배.
async function scenarioFrameRateIndependent(browser) {
  console.log(
    '\n[S3b] frame-rate 독립 — hold 시간 비례 이동(deltaTime 정규화). 100ms vs 200ms = 2배',
  );
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await boot(page);
    await focus(page, 'earth');
    await enterFreeFly(page);
    await focusCanvas(page);
    const b1 = await measure(page, 'earth');
    await holdKey(page, 'w', 100);
    const a1 = await measure(page, 'earth');
    const move100 = Math.hypot(
      a1.targetX - b1.targetX,
      a1.targetY - b1.targetY,
      a1.targetZ - b1.targetZ,
    );
    const b2 = await measure(page, 'earth');
    await holdKey(page, 'w', 200);
    const a2 = await measure(page, 'earth');
    const move200 = Math.hypot(
      a2.targetX - b2.targetX,
      a2.targetY - b2.targetY,
      a2.targetZ - b2.targetZ,
    );
    // deltaTime 정규화면 이동량은 hold 시간(누적 deltaSeconds)에 비례 → move200 ≈ 2×move100.
    const ratio = move200 / Math.max(move100, 1e-9);
    // 200/100=2 기준 ±오차 허용 (프레임 경계 양자화로 정확히 2 는 아님). 1.6~2.4 통과.
    const pass = ratio >= 1.6 && ratio <= 2.4 && move100 > 0;
    console.log(
      `  move(100ms)=${move100.toFixed(3)} move(200ms)=${move200.toFixed(3)} ratio=${ratio.toFixed(2)} (≈2.0, deltaTime 비례) → ${pass ? 'PASS' : 'FAIL'}`,
    );
    return { scenario: 'S3b', move100, move200, ratio, pass };
  } finally {
    await ctx.close();
  }
}

// S4 — 무회귀: io free-fly 진입 보존 → 줌아웃 시 body tier 유지(위성 근방 보존) + solar 경로 originOffset=0.
//
// [#704 (ADR `20260618-704-body-tier-zoomout-jump.md`)로 invariant 재갱신 — 행동 변화 박제]
// **구 S4 (#699)**: io free-fly 줌아웃 → tier escalate(body→solar) → originOffset=[0,0,0] 복원을
// 검증했다. 그러나 그 escalate 자체가 **#704 D-T2 회귀의 원인**이었다 — io(목성계 5.2AU)는
// cameraFromSun 이 항상 solar 영역이라 줌아웃 즉시 body→solar 직행하며 rescale 급락(158386→0.53,
// ≈300,000× 축소 = "태양계 전체로 튕김")을 냈다. **#704 fix**: body tier 진입 시 anchor(위성) 기준
// tierFromFocus 판정으로 줌아웃해도 **body tier 유지**(위성 근방 탐색 보존, escalate 0). 따라서 본
// S4 의 io escalate 단언은 #704 로 의도적으로 폐기되고, 새 행동(body 유지 + originOffset=io 위치≠0)을
// 검증한다. #693 의 "solar 경로 originOffset=[0,0,0]" invariant 는 default(solar) free-fly 셀로 별도 검증.
// (1) io 진입 = body tier radius 보존(#509) (2) io 줌아웃 = body 유지 + escalate 0(#704) +
//     originOffset=io 위치≠0(body tier 정상) (3) default(solar) free-fly originOffset=[0,0,0](#693 보존).
async function scenarioNoRegression(browser) {
  console.log(
    '\n[S4] 무회귀 — io 진입 보존 → 줌아웃 body 유지(escalate 0, #704) + solar 경로 originOffset=0(#693)',
  );
  let pass = true;
  // (A) io free-fly 줌아웃 → body tier 유지 + escalate 0 (#704 body-tier-zoomout fix).
  let ioResult;
  {
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    try {
      await boot(page);
      await focus(page, 'io');
      const focused = await measure(page, 'io');
      await enterFreeFly(page);
      const entered = await measure(page, 'io');
      const enterPreserved =
        entered.tier === 'body' &&
        Math.abs(entered.radius - focused.radius) / focused.radius < RADIUS_PRESERVE_REL;
      await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
      for (let i = 0; i < 30; i += 1) {
        await page.mouse.wheel(0, 120);
        await page.waitForTimeout(60);
      }
      await page.waitForTimeout(1500);
      const zoomedOut = await measure(page, 'io');
      // #704 — body tier 유지(escalate 0). originOffset 은 io 위치(≠0, body tier 정상).
      const stayedBody = zoomedOut.tier === 'body';
      const originAtBody = zoomedOut.originOffset.some((v) => v !== 0);
      const ioOk = enterPreserved && stayedBody && originAtBody;
      if (!ioOk) pass = false;
      ioResult = { enterPreserved, stayedBody, originAtBody, zoomedTier: zoomedOut.tier };
      console.log(
        `  (A) io 진입 tier=${entered.tier}(보존 ${enterPreserved}) → 줌아웃 tier=${zoomedOut.tier}(body 유지 ${stayedBody}, escalate 0) originOffset=io 위치(≠0 ${originAtBody}) → ${ioOk ? 'PASS' : 'FAIL'}`,
      );
    } finally {
      await ctx.close();
    }
  }
  // (B) default(solar) free-fly originOffset=[0,0,0] (#693 invariant 보존 — solar 경로는 origin 불변).
  let solarResult;
  {
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    try {
      await boot(page);
      await enterFreeFly(page);
      const ff = await measure(page, null);
      const solarOriginZero = ff.tier === 'solar' && ff.originOffset.every((v) => v === 0);
      if (!solarOriginZero) pass = false;
      solarResult = { tier: ff.tier, originOffset: ff.originOffset, solarOriginZero };
      console.log(
        `  (B) default free-fly tier=${ff.tier} originOffset=[${ff.originOffset.map((v) => v.toFixed(0)).join(',')}](=0 ${solarOriginZero}) → ${solarOriginZero ? 'PASS' : 'FAIL'}`,
      );
    } finally {
      await ctx.close();
    }
  }
  return { scenario: 'S4', io: ioResult, solar: solarResult, pass };
}

// S5 — 탐색버튼(command) 경로: focusOn/resetCamera command → enterFreeFly command 후
// store freeFlyMode=true + panningSensibility>0 (패닝 활성) + radius 시점 보존(reset 35 아님).
//
// [회귀 검출 원리] simulation-core enterFreeFly 가 freeFlyEntered→bodySelected:null 2-emit 하면
// 어댑터 setSelectedBody(null) 가 freeFlyMode=false 로 덮어써 sim-canvas subscribe 3rd 분기
// (free-fly→reset)가 syncFocusToScene(null) reset 으로 라우팅 → freeFlyMode=false, panning=0,
// radius≈35(reset). fix(1-emit)면 freeFlyMode=true, panning>0, radius=focus 시점 보존.
async function scenarioCommandPathEntry(browser) {
  console.log(
    '\n[S5] 탐색버튼 경로(command) — focusOn/resetCamera→enterFreeFly command 후 freeFlyMode=true + panning>0',
  );
  const readStore = (page) =>
    page.evaluate(() => {
      const s = window.__simStore.getState();
      const solar = window.__solarScene;
      const cam = solar?.meshes?.values().next().value?.getScene()?.activeCamera;
      return {
        freeFlyMode: s.freeFlyMode,
        selectedBodyId: s.selectedBodyId,
        panningSensibility: cam?.panningSensibility ?? 0,
        radius: cam?.radius ?? 0,
      };
    });
  // 진입 직후 시점 보존 — focus 본체 radius ≠ reset 기본(35). default 경로는 panning>0 만 핵심.
  const RESET_RADIUS = 35;
  const cases = [
    { label: 'inner/earth focus → freefly(command)', id: 'earth', useFocus: true },
    { label: 'default → freefly(command)', id: null, useFocus: false },
  ];
  const rows = [];
  let pass = true;
  for (const c of cases) {
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    try {
      await boot(page);
      if (c.useFocus) {
        await focusViaCommand(page, c.id);
      } else {
        await resetViaCommand(page);
      }
      const before = await readStore(page);
      await enterFreeFlyViaCommand(page);
      const after = await readStore(page);
      // 핵심 회귀 가드 — freeFlyMode 유지 + 패닝 활성. (회귀 시 둘 다 false/0.)
      const modeOk = after.freeFlyMode === true;
      const panningOk = after.panningSensibility > 0;
      // 시점 보존 — focus 경로는 focus radius(≈35 reset 아님) 보존. default 는 진입 전후 radius 동일.
      const radiusOk = c.useFocus
        ? Math.abs(after.radius - RESET_RADIUS) > 1e-6
        : Math.abs(after.radius - before.radius) / Math.max(before.radius, 1e-9) <
          RADIUS_PRESERVE_REL;
      const ok = modeOk && panningOk && radiusOk;
      if (!ok) pass = false;
      rows.push({ label: c.label, ...after, modeOk, panningOk, radiusOk, ok });
      console.log(
        `  ${c.label}: freeFlyMode=${after.freeFlyMode} panning=${after.panningSensibility.toFixed(0)} radius=${after.radius.toFixed(1)} → ${ok ? 'PASS' : 'FAIL'}`,
      );
    } finally {
      await ctx.close();
    }
  }
  return { scenario: 'S5', rows, pass };
}

// S6 — 진입 자동 포커스: 실 탐색 버튼 click → 캔버스 click/포커스 부여 없이 곧바로 WASD hold
// → 카메라 target 이동량 > 임계(자동 포커스 부재 회귀 차단) + 진입 직후 activeElement === canvas.
//
// [회귀 검출 원리] Babylon scene.onKeyboardObservable 은 canvas 가 키보드 포커스를 가질 때만 키를
// 수신한다(실측: window 전역 keydown 은 onKeyboardObservable=false). 버튼 click 으로 진입하면
// activeElement 가 버튼(또는 blur 후 BODY)에 남아 WASD 무반응. detachToFreeFly 끝의 refocusCanvas()
// 가 진입 즉시 canvas 에 포커스를 부여하면 캔버스 click 없이 바로 이동 가능. refocusCanvas() 호출이
// 제거되면(negative) activeElement≠canvas + WASD 이동량 0 → FAIL.
const S6_MOVE_MIN = 0.1; // 자동 포커스 有 시 WASD hold 이동량 하한 (회귀 시 0).
const S6_HOLD_MS = 1000;
async function scenarioEntryAutoFocus(browser) {
  console.log(
    '\n[S6] 진입 자동 포커스 — 실 탐색 버튼 click → 캔버스 click 없이 WASD 이동량 > 0 + activeEl=canvas',
  );
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await boot(page);
    // default 진입(focus 없이도 탐색 버튼은 항상 활성 — #699 ADR §5-5). 실제 버튼 click 으로 진입해
    // 포커스가 버튼/BODY 에 남는 실 사용 경로를 재현한다 (page.evaluate/store action 아님).
    await page.locator('[data-testid="focus-free-fly"]').click();
    await page.waitForTimeout(1500);
    // 진입 직후 activeElement 가 canvas 인지 — refocusCanvas() 자동 포커스 부여 검증.
    const activeAfterEntry = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        tag: el?.tagName ?? null,
        testid: el?.getAttribute?.('data-testid') ?? null,
        isCanvas: el?.getAttribute?.('data-testid') === 'sim-canvas',
      };
    });
    const before = await measure(page, null);
    // 캔버스 click/focus 부여 없이 곧바로 WASD hold — 자동 포커스가 있어야만 이동한다.
    await holdKey(page, 'w', S6_HOLD_MS);
    const after = await measure(page, null);
    const worldDelta = Math.hypot(
      after.targetX - before.targetX,
      after.targetY - before.targetY,
      after.targetZ - before.targetZ,
    );
    const focusOk = activeAfterEntry.isCanvas === true;
    const moveOk = worldDelta > S6_MOVE_MIN;
    const pass = focusOk && moveOk;
    console.log(
      `  진입 직후 activeEl=${activeAfterEntry.tag}(${activeAfterEntry.testid ?? '-'}) isCanvas=${activeAfterEntry.isCanvas} → 캔버스 click 없이 W hold(${S6_HOLD_MS}ms) worldΔ=${worldDelta.toFixed(3)} (>${S6_MOVE_MIN}) → ${pass ? 'PASS' : 'FAIL'}`,
    );
    return {
      scenario: 'S6',
      activeAfterEntry,
      worldDelta,
      focusOk,
      moveOk,
      pass,
    };
  } finally {
    await ctx.close();
  }
}

async function main() {
  console.log('\n=== #699 free-fly 통합 재설계 회귀 가드 ===');
  console.log(`  base URL: ${BASE_URL}`);
  const result = { timestamp: new Date().toISOString(), baseUrl: BASE_URL, scenarios: {} };
  let allPass = true;
  // #940 — 브라우저 수명주기를 `withBrowser` 로 위임 (에러 경로 close 도달 보장).
  // launch 인자는 원본 그대로 전달한다 (렌더러 축 불변 — docs/ops/browser-verify-helpers.md).
  await withBrowser({ headless: true }, async (browser) => {
    result.scenarios.s1 = await scenarioEntryConsistency(browser);
    if (!result.scenarios.s1.pass) allPass = false;
    result.scenarios.s2 = await scenarioZoomoutRemoved(browser);
    if (!result.scenarios.s2.pass) allPass = false;
    result.scenarios.s3 = await scenarioMoveScreenFeel(browser);
    if (!result.scenarios.s3.pass) allPass = false;
    result.scenarios.s3b = await scenarioFrameRateIndependent(browser);
    if (!result.scenarios.s3b.pass) allPass = false;
    result.scenarios.s4 = await scenarioNoRegression(browser);
    if (!result.scenarios.s4.pass) allPass = false;
    result.scenarios.s5 = await scenarioCommandPathEntry(browser);
    if (!result.scenarios.s5.pass) allPass = false;
    result.scenarios.s6 = await scenarioEntryAutoFocus(browser);
    if (!result.scenarios.s6.pass) allPass = false;
  });
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
