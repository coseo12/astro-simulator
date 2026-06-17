#!/usr/bin/env node
/**
 * #696 free-fly WASD/QE 키보드 이동 회귀 가드 — 7 시나리오.
 *
 * ADR `docs/decisions/20260617-696-freefly-wasd-movement.md` §결정 §회귀 가드.
 *
 * 사용법:
 *   pnpm --filter @astro-simulator/web verify:696-freefly-wasd
 *   pnpm --filter @astro-simulator/web verify:696-freefly-wasd -- --json
 *
 * ## 배경
 *
 * free-fly 에서 WASD(전후좌우)/QE(상하) 키로 카메라를 target+position 동시 평행이동(dolly 아님).
 * 좌표계는 #693 패닝과 동형 — free-fly originOffset=[0,0,0] 불변식상 #631 cameraFromSunMeters
 * 가산식이 그대로 정합(좌표 보정 0). 이동량 = dir × radius × WASD_DELTA_PERCENTAGE × deltaSeconds
 * (프레임 레이트 독립). Q/E 는 월드 절대 up(`Vector3.Up()`) 사용.
 *
 * ## 검증 시나리오 (7 직교)
 *
 * | S | DoD (PASS) | 회귀 시 |
 * |---|---|---|
 * | S1 free-fly WASD 작동 | free-fly W keydown → target+position 전진 + globalPos 추적(offset 불변) + radius 불변 | 핸들러 미작동 → target 불변 (FAIL) |
 * | S2 focus 중 WASD 비활성 | earth focus 중 W keydown → target 불변(follow 유지) | focus 중 활성 → jitter/이탈 (FAIL) |
 * | S3 deep-tier floating origin 정합 | io→free-fly(pull-back) W 이동 후 originOffset=[0,0,0] + tier 일관 | originOffset≠0 / tier 오판 (FAIL) |
 * | S4 WASD 후 reset 원복 + 키 클리어 | free-fly W 이동 → reset → target 원점 복원 + keyup 유실해도 정지 | reset 분기/키 클리어 누락 → target 잔존/이동 (FAIL) |
 * | S5 화살표 회전 무충돌 | free-fly ArrowUp → beta 회전 + target 평행이동 0 | WASD 가 화살표 가로채면 회전 미발생 (FAIL) |
 * | S6 프레임 레이트 독립 + 대각 정규화 | W 대각(W+D) 이동량 = 단일 W × √1 (정규화) | 미정규화 → 대각 √2배 (FAIL) |
 * | S7 Q/E world-up 직관 | 수직 하향 시점에서 Q keydown → 월드 +Y 이동(globalPos.y 증가) | local up 사용 시 수평 (FAIL) |
 *
 * dev 빌드 의존: window.__solarScene(getTier/floatingOrigin) / window.__simStore(setSelectedBody/enterFreeFly)
 * 환경변수: BASE_URL (기본 http://localhost:3000)
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const flags = { json: process.argv.slice(2).includes('--json') };
const VIEWPORT = { width: 1280, height: 720 };
const SETTLE_MS = 2500;
// S1 — WASD 이동 후 target 이 측정 가능 수준으로 이동해야 한다 (scene unit).
const MOVE_MIN_TARGET_DELTA = 0.01;
// S1 — globalPos 가 target 추적: offset(globalPos − target) 가 이동 전후 거의 불변.
const TRACK_TOLERANCE = 1.0;
// S4 — reset 후 target 이 원점 복원됐는지 (controller.reset → target 0).
const RESET_TARGET_TOLERANCE = 0.1;
// S6 — 대각 이동량이 단일 키 대비 정규화됐는지 (√2 가속 아님). 상대 편차 임계.
const DIAGONAL_REL_TOLERANCE = 0.15;
// S5 — 화살표 회전 시 target 평행이동이 사실상 0 이어야 한다 (회전은 alpha/beta 만 변동).
const ROTATE_TARGET_TOLERANCE = 0.05;

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
      alpha: cam.alpha,
      beta: cam.beta,
      targetX: t.x,
      targetY: t.y,
      targetZ: t.z,
      targetDist: Math.hypot(t.x, t.y, t.z),
      globalX: g.x,
      globalY: g.y,
      globalZ: g.z,
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
async function resetCamera(page) {
  await page.evaluate(() => window.__simStore.getState().setSelectedBody(null));
  await page.waitForTimeout(SETTLE_MS);
}
// canvas 포커스 — WASD 키 이벤트가 scene.onKeyboardObservable 에 도달하려면 canvas 가 포커스를
// 가져야 하고, document.activeElement 가드(input 차단)도 canvas/body 포커스를 요구한다.
async function focusCanvas(page) {
  await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="sim-canvas"]');
    if (canvas) canvas.focus();
  });
}
// 키를 holdMs 동안 누르며 그 사이 매 프레임 이동이 누적되도록 대기.
// 기본 120ms — solar tier(radius≈35)에서 tier 임계를 넘지 않을 만큼 짧게(평행이동 invariant 보존).
// WASD_DELTA_PERCENTAGE=0.5/sec 라 120ms 면 radius×0.5×0.12≈2.1 unit (solar tier 내).
async function holdKey(page, key, holdMs = 120) {
  await page.keyboard.down(key);
  await page.waitForTimeout(holdMs);
  await page.keyboard.up(key);
  await page.waitForTimeout(200);
}
async function holdKeys(page, keys, holdMs = 120) {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(holdMs);
  for (const k of keys) await page.keyboard.up(k);
  await page.waitForTimeout(200);
}

async function scenarioWasdWorks(browser) {
  console.log('\n[S1] free-fly WASD 작동 — W keydown target+position 전진 + globalPos 추적 + radius 불변');
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await boot(page);
    await freeFly(page);
    await focusCanvas(page);
    const before = await measure(page);
    await holdKey(page, 'w');
    const after = await measure(page);
    const targetDelta = Math.hypot(
      after.targetX - before.targetX,
      after.targetY - before.targetY,
      after.targetZ - before.targetZ,
    );
    // globalPos 가 target 을 추적: target+position 동시 평행이동이므로 globalDelta ≈ targetDelta.
    const globalDelta = Math.hypot(
      after.globalX - before.globalX,
      after.globalY - before.globalY,
      after.globalZ - before.globalZ,
    );
    const trackDrift = Math.abs(globalDelta - targetDelta);
    // 짧은 hold(120ms)로 tier 임계 미초과 → radius 불변(dolly 아님, ADR §1 관찰 2 radiusInvariant=0).
    const radiusInvariant = Math.abs(after.radius - before.radius);
    const tierStable = after.tier === before.tier;
    const pass =
      targetDelta >= MOVE_MIN_TARGET_DELTA &&
      tierStable &&
      trackDrift <= Math.max(TRACK_TOLERANCE, targetDelta * 0.02) &&
      radiusInvariant <= Math.max(0.01, before.radius * 0.001);
    console.log(
      `  targetΔ=${targetDelta.toFixed(3)} (≥${MOVE_MIN_TARGET_DELTA}) | globalΔ=${globalDelta.toFixed(3)} trackDrift=${trackDrift.toExponential(2)} | radiusΔ=${radiusInvariant.toExponential(2)} (≈0) | tier=${before.tier}→${after.tier} → ${pass ? 'PASS' : 'FAIL'}`,
    );
    return { scenario: 'S1', targetDelta, globalDelta, trackDrift, radiusInvariant, tierStable, pass };
  } finally {
    await ctx.close();
  }
}

async function scenarioFocusInactive(browser) {
  console.log('\n[S2] focus 중 WASD 비활성 — earth focus 중 W keydown target 불변 (#509 follow 유지)');
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await boot(page);
    await focus(page, 'earth');
    await focusCanvas(page);
    // focus 중 target 은 followObserver 가 earth(공전 중)로 매 프레임 덮어쓴다 → 자연 drift 존재.
    // WASD 가 무효임을 보이려면: 동일 시간의 (키 없음) baseline drift 와 (W held) drift 가 일치해야
    // 한다(WASD 가 추가 이동 0). W held drift 가 baseline 대비 유의미하게 크면 WASD 누수(FAIL).
    const b0 = await measure(page);
    await page.waitForTimeout(320); // holdKey(120)+200 과 동일 경과.
    const b1 = await measure(page);
    const baselineDrift = Math.hypot(b1.targetX - b0.targetX, b1.targetY - b0.targetY, b1.targetZ - b0.targetZ);
    const c0 = await measure(page);
    await holdKey(page, 'w');
    const c1 = await measure(page);
    const wDrift = Math.hypot(c1.targetX - c0.targetX, c1.targetY - c0.targetY, c1.targetZ - c0.targetZ);
    // WASD 누수 시 wDrift 가 step(radius×0.5×0.12≈수 unit) 만큼 추가됨. baseline + 작은 여유 이내면 PASS.
    const pass = wDrift <= baselineDrift + Math.max(0.5, baselineDrift * 0.5);
    console.log(
      `  focus=earth tier=${c1.tier} | baselineDrift=${baselineDrift.toFixed(3)} vs W-held drift=${wDrift.toFixed(3)} (WASD 추가 이동 0) → ${pass ? 'PASS' : 'FAIL'}`,
    );
    return { scenario: 'S2', baselineDrift, wDrift, pass };
  } finally {
    await ctx.close();
  }
}

async function scenarioDeepTierOrigin(browser) {
  console.log('\n[S3] deep-tier floating origin 정합 — io→free-fly(pull-back) W 이동 후 origin=0');
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await boot(page);
    await focus(page, 'io');
    await freeFly(page);
    await focusCanvas(page);
    const before = await measure(page);
    await holdKey(page, 'w');
    const after = await measure(page);
    const originZero = after.originOffset.every((v) => v === 0);
    const tierConsistent = after.tier === before.tier;
    const pass = originZero && tierConsistent;
    console.log(
      `  io→free-fly tier=${before.tier}→${after.tier} | originOffset=[${after.originOffset.join(',')}] (=0) → ${pass ? 'PASS' : 'FAIL'}`,
    );
    return { scenario: 'S3', tier: after.tier, originOffset: after.originOffset, pass };
  } finally {
    await ctx.close();
  }
}

async function scenarioResetRestore(browser) {
  console.log('\n[S4] WASD 후 reset 원복 + 키 클리어 — target 원점 복원');
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await boot(page);
    await freeFly(page);
    await focusCanvas(page);
    await holdKey(page, 'w');
    const moved = await measure(page);
    await resetCamera(page);
    const after = await measure(page);
    const movedAway = moved.targetDist >= MOVE_MIN_TARGET_DELTA;
    const restored = after.targetDist <= RESET_TARGET_TOLERANCE;
    const pass = movedAway && restored;
    console.log(
      `  이동후 targetDist=${moved.targetDist.toFixed(3)} (≥${MOVE_MIN_TARGET_DELTA}) → reset후 targetDist=${after.targetDist.toFixed(3)} (≤${RESET_TARGET_TOLERANCE}) → ${pass ? 'PASS' : 'FAIL'}`,
    );
    return { scenario: 'S4', movedTargetDist: moved.targetDist, resetTargetDist: after.targetDist, pass };
  } finally {
    await ctx.close();
  }
}

async function scenarioArrowRotation(browser) {
  console.log('\n[S5] 화살표 회전 무충돌 — free-fly ArrowUp → beta 회전 + target 평행이동 0 (Q1)');
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await boot(page);
    await freeFly(page);
    await focusCanvas(page);
    const before = await measure(page);
    await holdKey(page, 'ArrowUp', 800);
    const after = await measure(page);
    // ArcRotate 기본 화살표 = alpha/beta 회전. WASD 핸들러가 가로채지 않으므로 회전 발생.
    const rotated =
      Math.abs(after.alpha - before.alpha) > 1e-3 || Math.abs(after.beta - before.beta) > 1e-3;
    const targetDelta = Math.hypot(
      after.targetX - before.targetX,
      after.targetY - before.targetY,
      after.targetZ - before.targetZ,
    );
    const pass = rotated && targetDelta <= ROTATE_TARGET_TOLERANCE;
    console.log(
      `  alphaΔ=${(after.alpha - before.alpha).toFixed(4)} betaΔ=${(after.beta - before.beta).toFixed(4)} (회전) | targetΔ=${targetDelta.toExponential(3)} (≤${ROTATE_TARGET_TOLERANCE}) → ${pass ? 'PASS' : 'FAIL'}`,
    );
    return { scenario: 'S5', rotated, targetDelta, pass };
  } finally {
    await ctx.close();
  }
}

async function scenarioDiagonalNormalize(browser) {
  console.log('\n[S6] 대각 정규화 — W+D 대각 이동량 = 단일 W × √1 (deltaTime 독립 동일 시간)');
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await boot(page);
    // 단일 W 이동량.
    await freeFly(page);
    await focusCanvas(page);
    const b1 = await measure(page);
    await holdKey(page, 'w', 600);
    const a1 = await measure(page);
    const singleDist = Math.hypot(a1.targetX - b1.targetX, a1.targetY - b1.targetY, a1.targetZ - b1.targetZ);
    // reset 후 대각 W+D 이동량 (동일 hold 시간).
    await resetCamera(page);
    await freeFly(page);
    await focusCanvas(page);
    const b2 = await measure(page);
    await holdKeys(page, ['w', 'd'], 600);
    const a2 = await measure(page);
    const diagDist = Math.hypot(a2.targetX - b2.targetX, a2.targetY - b2.targetY, a2.targetZ - b2.targetZ);
    // 정규화 시 diag ≈ single. 미정규화면 diag ≈ single × √2.
    const relDiff = Math.abs(diagDist - singleDist) / Math.max(singleDist, 1e-9);
    const pass = singleDist >= MOVE_MIN_TARGET_DELTA && relDiff <= DIAGONAL_REL_TOLERANCE;
    console.log(
      `  singleDist=${singleDist.toFixed(3)} diagDist=${diagDist.toFixed(3)} | relDiff=${(relDiff * 100).toFixed(1)}% (≤${DIAGONAL_REL_TOLERANCE * 100}%, √2=41.4% FAIL) → ${pass ? 'PASS' : 'FAIL'}`,
    );
    return { scenario: 'S6', singleDist, diagDist, relDiff, pass };
  } finally {
    await ctx.close();
  }
}

async function scenarioQeWorldUp(browser) {
  console.log('\n[S7] Q/E world-up 직관 — 수직 하향 시점에서 Q keydown → 월드 +Y 이동');
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await boot(page);
    await freeFly(page);
    await focusCanvas(page);
    // 수직 하향 시점으로 회전 — beta≈0 (카메라가 위에서 아래를 내려다봄). ArrowDown 으로 beta 감소.
    await page.evaluate(() => {
      const solar = window.__solarScene;
      const cam = solar?.meshes?.values().next().value?.getScene()?.activeCamera;
      if (cam) cam.beta = 0.05; // 거의 수직 하향 (top-down).
    });
    await page.waitForTimeout(400);
    const before = await measure(page);
    await holdKey(page, 'q');
    const after = await measure(page);
    // 월드 up 고정이면 globalPos.y 증가. local up(수평) 이면 y 거의 불변 + 수평 이동.
    const dy = after.globalY - before.globalY;
    const horizontal = Math.hypot(after.globalX - before.globalX, after.globalZ - before.globalZ);
    const pass = dy > MOVE_MIN_TARGET_DELTA && dy > horizontal;
    console.log(
      `  beta≈${after.beta.toFixed(2)}(하향) | globalΔy=${dy.toExponential(3)} (>0, 위로) | 수평Δ=${horizontal.toExponential(3)} (dy 우세) → ${pass ? 'PASS' : 'FAIL'}`,
    );
    return { scenario: 'S7', dy, horizontal, pass };
  } finally {
    await ctx.close();
  }
}

async function main() {
  console.log('\n=== #696 free-fly WASD 키보드 이동 회귀 가드 ===');
  console.log(`  base URL: ${BASE_URL}`);
  const browser = await chromium.launch({ headless: true });
  const result = { timestamp: new Date().toISOString(), baseUrl: BASE_URL, scenarios: {} };
  let allPass = true;
  try {
    result.scenarios.s1 = await scenarioWasdWorks(browser);
    if (!result.scenarios.s1.pass) allPass = false;
    result.scenarios.s2 = await scenarioFocusInactive(browser);
    if (!result.scenarios.s2.pass) allPass = false;
    result.scenarios.s3 = await scenarioDeepTierOrigin(browser);
    if (!result.scenarios.s3.pass) allPass = false;
    result.scenarios.s4 = await scenarioResetRestore(browser);
    if (!result.scenarios.s4.pass) allPass = false;
    result.scenarios.s5 = await scenarioArrowRotation(browser);
    if (!result.scenarios.s5.pass) allPass = false;
    result.scenarios.s6 = await scenarioDiagonalNormalize(browser);
    if (!result.scenarios.s6.pass) allPass = false;
    result.scenarios.s7 = await scenarioQeWorldUp(browser);
    if (!result.scenarios.s7.pass) allPass = false;
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
