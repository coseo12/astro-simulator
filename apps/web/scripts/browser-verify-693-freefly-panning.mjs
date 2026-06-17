#!/usr/bin/env node
/**
 * #693 free-fly 패닝(F3) 회귀 가드 — 3중 시뮬레이션 (positive / negative / recovery).
 *
 * ADR `docs/decisions/20260616-693-freefly-panning.md` §결정 §회귀 가드.
 *
 * 사용법:
 *   pnpm --filter @astro-simulator/web verify:693-freefly-panning
 *   pnpm --filter @astro-simulator/web verify:693-freefly-panning -- --json
 *
 * ## 배경 (forensic 확정)
 *
 * free-fly 에서 우클릭 드래그로 카메라 target 을 스크린 평면 이동(패닝)한다. floating origin ×
 * panning 결합 위험(#629 §3 정적 기각 사유)을 §1 runtime 실측으로 기각: free-fly originOffset=0
 * 불변식 + globalPos 의 target 추적 → 기존 cameraFromSunMeters(#631) 가산식이 그대로 정합
 * (좌표 보정 코드 0). 감도 = radius 비례 panningSensibility (줌 일관성 위해 매 프레임 재산출).
 *
 * ## 검증 시나리오 (5 직교)
 *
 * | S | DoD (PASS 조건) | 회귀 시 |
 * |---|---|---|
 * | S1 free-fly 패닝 작동 | free-fly 진입 → panningSensibility>0 + 우클릭 드래그 → target 평면 이동 + globalPos 추적 (Δ 일치) | sensibility=0 잔존 → target 불변 (FAIL) |
 * | S2 focus 중 패닝 비활성 | body focus 중 panningSensibility=0 (follow 유지) | focus 중 활성 → jitter (FAIL) |
 * | S3 deep-tier 패닝 floating origin 정합 | io→free-fly(pull-back) 패닝 후 originOffset=[0,0,0] + tier 일관 | originOffset≠0 / tier 오판 (FAIL) |
 * | S4 줌 중 패닝 감도 일관성 | free-fly 줌(radius 변동) 후 sensibility×radius 곱 불변 (진입 시점 잔존 아님) | 진입 1회 감도 잔존 → 곱 어긋남 (FAIL) |
 * | S5 free-fly 패닝 후 reset 원복 | free-fly 패닝(target 이동) → reset → target 원점 복원(targetDist≈0) + 패닝 비활성 | subscribe free-fly→reset 분기 누락 시 target 잔존 (FAIL) — qa 차단 사유 #695 |
 *
 * dev 빌드 의존: window.__solarScene(getTier/floatingOrigin) / window.__simStore(setSelectedBody/enterFreeFly)
 * 환경변수: BASE_URL (기본 http://localhost:3000)
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const flags = { json: process.argv.slice(2).includes('--json') };
const VIEWPORT = { width: 1280, height: 720 };
const SETTLE_MS = 2500;
// S1 — 우클릭 드래그 후 target 이 측정 가능 수준으로 이동해야 한다 (scene unit).
const PAN_MIN_TARGET_DELTA = 0.01;
// S1 — globalPos 가 target 을 추적: Δ(globalPos - target) 가 패닝 전후 거의 불변 (회전/줌 offset 불변).
const TRACK_TOLERANCE = 1.0;
// S4 — sensibility × radius 곱이 줌 전후 일정한지 (radius 비례 → 곱 상수). 상대 편차 임계.
const PRODUCT_REL_TOLERANCE = 0.1;
// S5 — reset 후 카메라 target 이 원점(sun 중심)으로 복원됐는지 (controller.reset → target 0).
// scene unit 기준. 패닝으로 옮긴 targetDist(≥PAN_MIN_TARGET_DELTA)가 reset 후 임계 이내로 줄어야 PASS.
const RESET_TARGET_TOLERANCE = 0.1;

async function measure(page) {
  return await page.evaluate(() => {
    const solar = window.__solarScene;
    const cam = solar?.meshes?.values().next().value?.getScene()?.activeCamera;
    if (!cam) return { error: 'no camera' };
    const t = cam.target;
    const g = cam.globalPosition;
    const o = solar.floatingOrigin?.originOffset ?? [0, 0, 0];
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
      // globalPos − target 차이 벡터 크기 (회전/줌 offset). 패닝(target 평면 이동)은 이 offset 불변.
      offsetDist: Math.hypot(g.x - t.x, g.y - t.y, g.z - t.z),
      originOffset: [o[0], o[1], o[2]],
    };
  });
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
async function freeFly(page) {
  await page.evaluate(() => window.__simStore.getState().enterFreeFly());
  await page.waitForTimeout(1200);
}
// #696 D-T2 — 실제 "탐색" 버튼/Esc 와 동일한 command 경로 (sendCommand → core.command → emit).
// store action 직접 호출(freeFly)은 simulation-core 의 enterFreeFly command 2단 emit 을 우회해
// "진입이 reset 으로 귀결되는 회귀"(panning=0)를 가렸다. command 경로로 진입 직후 panning 활성을 검증.
async function freeFlyViaCommand(page) {
  await page.evaluate(() => window.__simCore.command({ type: 'enterFreeFly' }));
  await page.waitForTimeout(1200);
}
// reset 버튼 = resetCamera command → store setSelectedBody(null) (selectedBodyId=null, freeFlyMode=false).
// 실 reset 버튼이 sendCommand({type:'resetCamera'}) → core 'bodySelected:{id:null}' → setSelectedBody(null)
// 으로 귀결되므로 store action 직접 호출로 동일 상태 전이를 재현한다.
async function resetCamera(page) {
  await page.evaluate(() => window.__simStore.getState().setSelectedBody(null));
  await page.waitForTimeout(SETTLE_MS);
}
// 우클릭(button: 'right') 드래그 = ArcRotateCamera 기본 패닝 입력.
async function dragPan(page) {
  const cx = VIEWPORT.width / 2;
  const cy = VIEWPORT.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(cx + 200, cy + 100, { steps: 10 });
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(300);
}
async function zoomOut(page) {
  await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
  for (let i = 0; i < 8; i += 1) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(120);
  }
}

async function scenarioPanWorks(browser) {
  console.log('\n[S1] free-fly 패닝 작동 — 우클릭 드래그 target 평면 이동 + globalPos 추적');
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await boot(page);
    await freeFly(page);
    const before = await measure(page);
    await dragPan(page);
    const after = await measure(page);
    const targetDelta = Math.hypot(
      after.targetX - before.targetX,
      after.targetY - before.targetY,
      after.targetZ - before.targetZ,
    );
    // globalPos 가 target 을 추적 → offset(globalPos−target) 가 패닝 전후 거의 불변.
    const offsetDrift = Math.abs(after.offsetDist - before.offsetDist);
    const pass =
      before.panningSensibility > 0 &&
      targetDelta >= PAN_MIN_TARGET_DELTA &&
      offsetDrift <= Math.max(TRACK_TOLERANCE, before.offsetDist * 0.01);
    console.log(
      `  sensibility=${before.panningSensibility.toFixed(2)} (>0) | targetΔ=${targetDelta.toExponential(3)} (≥${PAN_MIN_TARGET_DELTA}) | offsetDrift=${offsetDrift.toExponential(3)} (track) → ${pass ? 'PASS' : 'FAIL'}`,
    );
    return {
      scenario: 'S1',
      sensibility: before.panningSensibility,
      targetDelta,
      offsetDrift,
      pass,
    };
  } finally {
    await ctx.close();
  }
}

async function scenarioFocusInactive(browser) {
  console.log('\n[S2] focus 중 패닝 비활성 — panningSensibility=0 (#509 follow 유지)');
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await boot(page);
    await focus(page, 'earth');
    const m = await measure(page);
    const pass = m.panningSensibility === 0;
    console.log(
      `  focus=earth tier=${m.tier} panningSensibility=${m.panningSensibility} (=0) → ${pass ? 'PASS' : 'FAIL'}`,
    );
    return { scenario: 'S2', panningSensibility: m.panningSensibility, pass };
  } finally {
    await ctx.close();
  }
}

async function scenarioDeepTierOrigin(browser) {
  console.log('\n[S3] deep-tier 패닝 floating origin 정합 — io→free-fly(pull-back) 후 origin=0');
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await boot(page);
    await focus(page, 'io');
    await freeFly(page);
    const before = await measure(page);
    await dragPan(page);
    const after = await measure(page);
    const originZero = after.originOffset.every((v) => v === 0);
    const tierConsistent = after.tier === before.tier;
    const pass = originZero && tierConsistent && before.panningSensibility > 0;
    console.log(
      `  io→free-fly tier=${before.tier}→${after.tier} | originOffset=[${after.originOffset.join(',')}] (=0) | sensibility=${before.panningSensibility.toFixed(2)} → ${pass ? 'PASS' : 'FAIL'}`,
    );
    return {
      scenario: 'S3',
      tier: after.tier,
      originOffset: after.originOffset,
      sensibility: before.panningSensibility,
      pass,
    };
  } finally {
    await ctx.close();
  }
}

async function scenarioZoomConsistency(browser) {
  console.log('\n[S4] 줌 중 패닝 감도 일관성 — radius 변동 후 sensibility×radius 곱 불변');
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await boot(page);
    await freeFly(page);
    const before = await measure(page);
    await zoomOut(page);
    const after = await measure(page);
    const prodBefore = before.panningSensibility * before.radius;
    const prodAfter = after.panningSensibility * after.radius;
    const radiusChanged = Math.abs(after.radius - before.radius) > 1e-3;
    const relDiff = Math.abs(prodAfter - prodBefore) / Math.max(prodBefore, 1e-9);
    const pass =
      before.panningSensibility > 0 &&
      after.panningSensibility > 0 &&
      radiusChanged &&
      relDiff <= PRODUCT_REL_TOLERANCE;
    console.log(
      `  radius ${before.radius.toFixed(2)}→${after.radius.toFixed(2)} | sensibility ${before.panningSensibility.toFixed(2)}→${after.panningSensibility.toFixed(2)} | (s×r) relDiff=${(relDiff * 100).toFixed(2)}% (≤${PRODUCT_REL_TOLERANCE * 100}%) → ${pass ? 'PASS' : 'FAIL'}`,
    );
    return {
      scenario: 'S4',
      radiusBefore: before.radius,
      radiusAfter: after.radius,
      relDiff,
      pass,
    };
  } finally {
    await ctx.close();
  }
}

async function scenarioPanResetRestore(browser) {
  console.log(
    '\n[S5] free-fly 패닝 후 reset 원복 — target 원점 복원 + 패닝 비활성 (qa 차단 사유 #695)',
  );
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await boot(page);
    await freeFly(page);
    await dragPan(page);
    const panned = await measure(page);
    await resetCamera(page);
    const after = await measure(page);
    // 1) 패닝이 실제로 target 을 옮겼는지(전제) 2) reset 후 target 이 원점 복원됐는지 3) 패닝 비활성.
    const pannedAway = panned.targetDist >= PAN_MIN_TARGET_DELTA;
    const restored = after.targetDist <= RESET_TARGET_TOLERANCE;
    const panningOff = after.panningSensibility === 0;
    const pass = pannedAway && restored && panningOff;
    console.log(
      `  패닝후 targetDist=${panned.targetDist.toFixed(3)} (≥${PAN_MIN_TARGET_DELTA}) → reset후 targetDist=${after.targetDist.toFixed(3)} (≤${RESET_TARGET_TOLERANCE}) | sensibility=${after.panningSensibility} (=0) → ${pass ? 'PASS' : 'FAIL'}`,
    );
    return {
      scenario: 'S5',
      pannedTargetDist: panned.targetDist,
      resetTargetDist: after.targetDist,
      panningSensibility: after.panningSensibility,
      pass,
    };
  } finally {
    await ctx.close();
  }
}

async function scenarioFocusToFreeFlyCommand(browser) {
  console.log(
    '\n[S6] focus→탐색(command 경로) 패닝 활성 — earth focus → enterFreeFly command → panning>0 + 시점 보존 (#696 D-T2)',
  );
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await boot(page);
    await focus(page, 'earth');
    const focused = await measure(page);
    // 실제 "탐색" 버튼/Esc 와 동일 command 경로 (store action 직접 호출 우회 — 회귀 재현 핵심).
    await freeFlyViaCommand(page);
    const entered = await measure(page);
    // (1) 패닝 활성: panningSensibility>0 (reset 귀결 시 0 — D-T2 회귀 시그니처).
    const panningActive = entered.panningSensibility >= 1;
    // (2) 시점 보존: radius 가 reset(35)으로 귀결되지 않음 (earth focus radius 유지).
    const viewPreserved = Math.abs(entered.radius - 35) > 1;
    // (3) 패닝 작동: 진입 후 우클릭 드래그 → target 이동.
    const before = await measure(page);
    await dragPan(page);
    const after = await measure(page);
    const panDelta = Math.hypot(
      after.targetX - before.targetX,
      after.targetY - before.targetY,
      after.targetZ - before.targetZ,
    );
    const panWorks = panDelta >= PAN_MIN_TARGET_DELTA;
    const pass = panningActive && viewPreserved && panWorks;
    console.log(
      `  focus=earth radius=${focused.radius.toFixed(1)} → 탐색(command) panning=${entered.panningSensibility.toFixed(0)} (>1) radius=${entered.radius.toFixed(1)} (≠35=시점보존) | 드래그 targetΔ=${panDelta.toFixed(3)} (≥${PAN_MIN_TARGET_DELTA}) → ${pass ? 'PASS' : 'FAIL'}`,
    );
    return {
      scenario: 'S6',
      panningSensibility: entered.panningSensibility,
      radius: entered.radius,
      panDelta,
      panningActive,
      viewPreserved,
      panWorks,
      pass,
    };
  } finally {
    await ctx.close();
  }
}

async function main() {
  console.log('\n=== #693 free-fly 패닝(F3) 회귀 가드 ===');
  console.log(`  base URL: ${BASE_URL}`);
  const browser = await chromium.launch({ headless: true });
  const result = { timestamp: new Date().toISOString(), baseUrl: BASE_URL, scenarios: {} };
  let allPass = true;
  try {
    result.scenarios.s1 = await scenarioPanWorks(browser);
    if (!result.scenarios.s1.pass) allPass = false;
    result.scenarios.s2 = await scenarioFocusInactive(browser);
    if (!result.scenarios.s2.pass) allPass = false;
    result.scenarios.s3 = await scenarioDeepTierOrigin(browser);
    if (!result.scenarios.s3.pass) allPass = false;
    result.scenarios.s4 = await scenarioZoomConsistency(browser);
    if (!result.scenarios.s4.pass) allPass = false;
    result.scenarios.s5 = await scenarioPanResetRestore(browser);
    if (!result.scenarios.s5.pass) allPass = false;
    result.scenarios.s6 = await scenarioFocusToFreeFlyCommand(browser);
    if (!result.scenarios.s6.pass) allPass = false;
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
