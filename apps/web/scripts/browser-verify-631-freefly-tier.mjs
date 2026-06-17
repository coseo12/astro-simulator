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
 * ## 배경 (forensic 확정 + #699 의도 변경)
 *
 * 위성(galilean) focus → free-fly 진입 시 카메라가 tier=body / target=위성 먼 위치(io ~5.2 AU)에
 * 동결 → 줌아웃해도 태양계가 frame 밖("허공"). 원인 (1) sim-canvas `cameraFromSunMeters` 가
 * floating origin 오프셋 누락으로 sun 거리 과소측정 → tier escalate 안 됨 (2) target stranding.
 * 구 fix = (core) originOffset 가산 + (UX) body tier free-fly 진입 시 태양계 개요 pull-back(target→sun).
 *
 * ⚠️ **#699 의도 변경 (재설계로 S1 시나리오 갱신 — ADR `20260617-699-freefly-camera-unified-redesign.md`
 * §5-1/§5-2/§5-3)**: #631 의 "body tier 강제 pull-back(reset 35)" 은 사용자 D-T2 에서 "focus 한 곳이
 * 사라짐(io 85px→1.3px+화면밖)" 회귀로 판명돼 **폐기**됐다. #699 는 모든 tier 진입을 단일 규칙으로
 * **시점 보존**하고, #631 "허공" 위험은 진입 강제 줌아웃이 아니라 (a) 진입 radius 비례 upperRadiusLimit
 * + (b) tier escalation gate(사용자 줌아웃 시에만 escalate)로 대체 처리한다. 따라서 S1 은
 * "pull-back(solar+targetDist≈0)" 이 아니라 **"진입 radius 보존(body tier 유지) + 줌아웃 시 escalate"**
 * 를 검증하도록 갱신됐다. (core originOffset 가산식(S2)/줌아웃 escalation 능력은 계승 — 무회귀 유지.)
 *
 * ## 검증 시나리오 (2 직교)
 *
 * | 시나리오 | DoD | 회귀 시 |
 * |---|---|---|
 * | S1. io(body tier) focus → free-fly | radius 보존(편차<5%) + 줌아웃 시 tier escalate (#699 의도) | 강제 pull-back(35) 부활 or 줌아웃 escalate 안 됨(허공) |
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
// S1 (#699 갱신) — 진입 radius 보존 편차 임계 (구 PULLBACK_TARGET_MAX 폐기).
const RADIUS_PRESERVE_REL = 0.05;
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
  // #699 의도 변경 — 구 "태양계 개요 pull-back" 폐기, "진입 radius 보존 + 줌아웃 시 escalate" 검증.
  console.log('\n[S1] io(body tier) focus → free-fly — #699 radius 보존 + 줌아웃 escalate');
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await boot(page);
    await focus(page, 'io');
    const f = await measure(page);
    await freeFly(page);
    const ff = await measure(page);
    // (1) #699 진입 보존: body tier 유지 + radius 편차 < 5% (강제 pull-back 폐기).
    const radiusRel = Math.abs(ff.radius - f.radius) / Math.max(f.radius, 1e-9);
    const preserved = ff.tier === f.tier && radiusRel < RADIUS_PRESERVE_REL;
    // (2) 줌아웃 → tier escalate (허공 방지 능력 계승 — originOffset 가산식 + escalation gate).
    await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
    for (let i = 0; i < 30; i += 1) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(1200);
    const zoomed = await measure(page);
    const escalated = zoomed.tier !== 'body';
    const pass = preserved && escalated;
    console.log(
      `  focus tier=${f.tier} radius=${f.radius.toFixed(1)} → free-fly tier=${ff.tier} radius=${ff.radius.toFixed(1)}(보존 ${preserved}) → 줌아웃 tier=${zoomed.tier}(escalate ${escalated}) → ${pass ? 'PASS' : 'FAIL'}`,
    );
    return {
      scenario: 'S1',
      focusTier: f.tier,
      freeTier: ff.tier,
      freeRadius: ff.radius,
      zoomedTier: zoomed.tier,
      preserved,
      escalated,
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
    // (measure() 는 `tier` 필드 반환 — focusTier 아님. reviewer #632 권고 정정.)
    const pass =
      f.tier !== 'body' &&
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
