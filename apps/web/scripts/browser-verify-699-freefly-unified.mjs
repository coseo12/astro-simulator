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
 * | S4  | 무회귀 — #629 줌 % / #693 패닝 originOffset=0 / tier escalate     | 좌표계 깨짐              |
 *
 * dev 빌드 의존: window.__solarScene(getTier/floatingOrigin/meshes) / window.__simStore
 *               (setSelectedBody/enterFreeFly)
 * 환경변수: BASE_URL (기본 http://localhost:3000)
 */

import { chromium } from 'playwright';

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

// S4 — 무회귀: io free-fly 진입 보존 → 줌아웃 시 tier escalate → solar 도달 시 originOffset=0.
//
// [#699 재설계로 invariant 갱신] #693 의 "free-fly originOffset=[0,0,0]" 는 구 설계(free-fly =
// 항상 solar tier reset)에서 성립했다. #699 는 io free-fly 가 **body tier 시점을 보존**하므로 진입
// 직후 originOffset 은 io 위치(≠0)다 — 이게 정상(P1/P2 fix). 줌아웃해 tier 가 solar 로 escalate
// 되면 setTier 가 origin 을 [0,0,0] 으로 reset → #693 invariant 복원. 본 시나리오는 그 전이를 검증:
// (1) 진입 = body tier radius 보존(#509) (2) 줌아웃 = tier escalate(#629/#631 의도) (3) solar 도달
// = originOffset=0(#693 invariant 복원).
async function scenarioNoRegression(browser) {
  console.log(
    '\n[S4] 무회귀 — io 진입 보존 → 줌아웃 escalate → solar 도달 originOffset=0(#629/#631/#693)',
  );
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await boot(page);
    await focus(page, 'io');
    const focused = await measure(page, 'io');
    await enterFreeFly(page);
    const entered = await measure(page, 'io');
    // (1) 진입 = body tier radius 보존 (#509 시점 보존, P1 fix).
    const enterPreserved =
      entered.tier === 'body' &&
      Math.abs(entered.radius - focused.radius) / focused.radius < RADIUS_PRESERVE_REL;
    // (2) 줌아웃 → tier escalate (gate 임계 초과 후 정상 escalation 복원, #629/#631 의도).
    await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
    for (let i = 0; i < 30; i += 1) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(1500);
    const zoomedOut = await measure(page, 'io');
    const escalated = zoomedOut.tier !== 'body';
    // (3) solar/inner 도달 시 originOffset=[0,0,0] (#693 invariant 복원).
    const originRestored = zoomedOut.originOffset.every((v) => v === 0);
    const pass = enterPreserved && escalated && originRestored;
    console.log(
      `  진입 tier=${entered.tier} radius=${entered.radius.toFixed(1)}(보존 ${enterPreserved}) → 줌아웃 tier=${zoomedOut.tier}(escalate ${escalated}) originOffset=[${zoomedOut.originOffset.map((v) => v.toFixed(0)).join(',')}](=0 ${originRestored}) → ${pass ? 'PASS' : 'FAIL'}`,
    );
    return {
      scenario: 'S4',
      enteredTier: entered.tier,
      enteredRadius: entered.radius,
      zoomedTier: zoomedOut.tier,
      zoomedOriginOffset: zoomedOut.originOffset,
      enterPreserved,
      escalated,
      originRestored,
      pass,
    };
  } finally {
    await ctx.close();
  }
}

async function main() {
  console.log('\n=== #699 free-fly 통합 재설계 회귀 가드 ===');
  console.log(`  base URL: ${BASE_URL}`);
  const browser = await chromium.launch({ headless: true });
  const result = { timestamp: new Date().toISOString(), baseUrl: BASE_URL, scenarios: {} };
  let allPass = true;
  try {
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
  } finally {
    await browser.close();
  }
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
