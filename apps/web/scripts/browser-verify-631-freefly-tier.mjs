#!/usr/bin/env node
/**
 * #631 fix 회귀 가드 — free-fly deep-tier 줌아웃 "허공" 회귀 차단.
 *
 * ADR `docs/decisions/20260608-631-freefly-tier-escalation-forensic.md` §결정 §회귀 가드.
 *
 * 사용법:
 *   pnpm --filter @astro-simulator/web verify:631-freefly-tier
 *   pnpm --filter @astro-simulator/web verify:631-freefly-tier -- --json
 *
 * ## 배경 (forensic 확정)
 *
 * 위성(galilean) focus → free-fly 진입 시 카메라가 tier=body / target=위성 먼 위치(io ~5.2 AU)에
 * 동결 → 줌아웃해도 태양계가 frame 밖("허공"). 원인 (1) sim-canvas `cameraFromSunMeters` 가
 * floating origin 오프셋 누락으로 sun 거리 과소측정 → tier escalate 안 됨 (2) target stranding.
 * fix = (core) originOffset 가산 + (UX) body tier free-fly 진입 시 태양계 개요 pull-back(target→sun).
 *
 * ## 검증 시나리오 (2 직교)
 *
 * | 시나리오 | DoD | 회귀 시 |
 * |---|---|---|
 * | S1. io(body tier) focus → free-fly | tier=solar + targetDist≈0 (개요 pull-back) | target stranded(8000+) → 허공 |
 * | S2. earth(inner tier) focus → free-fly | tier 불변 + targetDist 보존 (#509) | 개요로 잘못 리셋 |
 *
 * dev 빌드 의존: window.__solarScene(getTier) / window.__simStore(setSelectedBody/enterFreeFly)
 * 환경변수: BASE_URL (기본 http://localhost:3000)
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const flags = { json: process.argv.slice(2).includes('--json') };
const VIEWPORT = { width: 1280, height: 720 };
const SETTLE_MS = 2500;
// S1 — pull-back 후 target 이 sun(원점) 근처여야 한다. 회귀(stranding) 시 수천 unit.
const PULLBACK_TARGET_MAX = 5;
// S2 — #509 보존: earth free-fly 후 target 이 focus 위치(수백 unit)에 남아야 한다.
const PRESERVE_TARGET_MIN = 50;

async function measure(page) {
  return await page.evaluate(() => {
    const solar = window.__solarScene;
    const cam = solar?.meshes?.values().next().value?.getScene()?.activeCamera;
    if (!cam) return { error: 'no camera' };
    const t = cam.target;
    return { tier: solar.getTier(), radius: cam.radius, targetDist: Math.hypot(t.x, t.y, t.z) };
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

async function scenarioBodyPullback(browser) {
  console.log('\n[S1] io(body tier) focus → free-fly — 태양계 개요 pull-back');
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await boot(page);
    await focus(page, 'io');
    const f = await measure(page);
    await freeFly(page);
    const ff = await measure(page);
    const pass = ff.tier === 'solar' && ff.targetDist <= PULLBACK_TARGET_MAX;
    console.log(
      `  focus tier=${f.tier} → free-fly tier=${ff.tier} targetDist=${ff.targetDist.toFixed(2)} (≤${PULLBACK_TARGET_MAX}) → ${pass ? 'PASS' : 'FAIL'}`,
    );
    return {
      scenario: 'S1',
      focusTier: f.tier,
      freeTier: ff.tier,
      targetDist: ff.targetDist,
      pass,
    };
  } finally {
    await ctx.close();
  }
}

async function scenarioPlanetPreserve(browser) {
  console.log('\n[S2] earth(inner tier) focus → free-fly — #509 시점 보존');
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await boot(page);
    await focus(page, 'earth');
    const f = await measure(page);
    await freeFly(page);
    const ff = await measure(page);
    // #509: tier 불변 + target 보존 (개요로 리셋되지 않음). earth focus 가 body 가 아닌 한해서만 의미.
    const pass =
      f.focusTier !== 'body' &&
      ff.tier === f.tier &&
      ff.targetDist >= PRESERVE_TARGET_MIN &&
      Math.abs(ff.targetDist - f.targetDist) < Math.max(5, f.targetDist * 0.1);
    console.log(
      `  focus tier=${f.tier} targetDist=${f.targetDist.toFixed(2)} → free-fly tier=${ff.tier} targetDist=${ff.targetDist.toFixed(2)} → ${pass ? 'PASS' : 'FAIL'}`,
    );
    return {
      scenario: 'S2',
      focusTier: f.tier,
      freeTier: ff.tier,
      focusTargetDist: f.targetDist,
      freeTargetDist: ff.targetDist,
      pass,
    };
  } finally {
    await ctx.close();
  }
}

async function main() {
  console.log('\n=== #631 free-fly deep-tier 줌아웃 허공 회귀 가드 ===');
  console.log(`  base URL: ${BASE_URL}`);
  const browser = await chromium.launch({ headless: true });
  const result = { timestamp: new Date().toISOString(), baseUrl: BASE_URL, scenarios: {} };
  let allPass = true;
  try {
    result.scenarios.s1 = await scenarioBodyPullback(browser);
    if (!result.scenarios.s1.pass) allPass = false;
    result.scenarios.s2 = await scenarioPlanetPreserve(browser);
    if (!result.scenarios.s2.pass) allPass = false;
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
