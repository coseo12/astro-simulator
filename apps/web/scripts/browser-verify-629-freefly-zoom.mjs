#!/usr/bin/env node
/**
 * #629 fix 회귀 가드 — free-fly 진입 시 줌 "고정" 회귀 차단.
 *
 * ADR `docs/decisions/20260607-629-freefly-camera-zoom-forensic.md` §결정 §회귀 가드.
 *
 * 사용법:
 *   pnpm --filter @astro-simulator/web verify:629-freefly-zoom
 *   pnpm --filter @astro-simulator/web verify:629-freefly-zoom -- --json
 *
 * ## 배경 (forensic 확정)
 *
 * 위성(galilean) focus → free-fly 진입 시 카메라가 tier=body / radius≈158386 으로 잔존.
 * 절대 `wheelPrecision=3` 은 틱당 수십 unit (절대) 만 변경 → radius 158386 대비 변화율 0.03%
 * → 줌이 체감상 완전히 멈춤 ("탐색 시 시점 고정"). fix = `wheelDeltaPercentage` (radius 비례 %).
 *
 * ## 검증 시나리오 (2 직교)
 *
 * | 시나리오 | DoD | 회귀 시 |
 * |---|---|---|
 * | S1. free-fly 직접 (baseline) | 줌 5틱 누적 상대변화 ≥ 1% (#509 시점 보존 + 줌 작동) | baseline 줌 죽음 |
 * | S2. io(galilean) focus → free-fly | 줌 5틱 누적 상대변화 ≥ 1% + 회전 작동 | 0.03% (절대 wheelPrecision 회귀) |
 *
 * dev 빌드 의존:
 *  - window.__solarScene (getTier / meshes) — solar-system-scene export
 *  - window.__simStore  — zustand store (setSelectedBody / enterFreeFly)
 *
 * 환경변수: BASE_URL (기본 http://localhost:3000)
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const args = process.argv.slice(2);
const flags = { json: args.includes('--json') };

const VIEWPORT = { width: 1280, height: 720 };
const SETTLE_MS = 2500;
// 줌 체감 임계 — 5틱 누적 상대변화율. fix(wheelDeltaPercentage=0.01) 후 ~5%, 회귀(절대) 시 ~0.15%.
// 1% 임계는 두 상태를 안전 마진으로 분리.
const ZOOM_PERCEPTIBLE_THRESHOLD = 0.01;
const WHEEL_TICKS = 5;
// 위성 focus 가 push 하는 deep tier. fix 전 radius≈158386 에서 줌 정지가 발현된 케이스.
const SATELLITE_ID = 'io';

async function measure(page) {
  return await page.evaluate(() => {
    const solar = window.__solarScene;
    const meshes = solar?.meshes;
    const firstMesh = meshes?.values().next().value;
    const scene = firstMesh?.getScene();
    const cam = scene?.activeCamera;
    if (!cam) return { error: 'no camera' };
    const t = cam.target;
    return {
      tier: solar.getTier ? solar.getTier() : 'unknown',
      radius: cam.radius,
      alpha: cam.alpha,
      beta: cam.beta,
      targetDistToOrigin: Math.hypot(t.x, t.y, t.z),
    };
  });
}

async function realWheel(page, deltaY, count) {
  await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
  for (let i = 0; i < count; i += 1) {
    await page.mouse.wheel(0, deltaY);
    await page.waitForTimeout(120);
  }
}

async function dragRotate(page) {
  const cx = VIEWPORT.width / 2;
  const cy = VIEWPORT.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 120, cy + 60, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);
}

async function bootstrap(page) {
  await page.goto(`${BASE_URL}/?gpu=a&lod=auto`, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForFunction(
    () => typeof window.__solarScene !== 'undefined' && typeof window.__simStore !== 'undefined',
    { timeout: 15_000 },
  );
  await page.waitForTimeout(SETTLE_MS);
}

async function enterFreeFly(page) {
  await page.evaluate(() => window.__simStore?.getState?.().enterFreeFly?.());
  await page.waitForTimeout(600);
}

/** 줌 체감 측정 — 줌인/줌아웃 각 WHEEL_TICKS 틱 누적 상대변화율의 큰 쪽 반환. */
async function measureZoomPerceptibility(page) {
  const beforeIn = await measure(page);
  await realWheel(page, -120, WHEEL_TICKS);
  const afterIn = await measure(page);
  const relIn = beforeIn.radius ? Math.abs(afterIn.radius - beforeIn.radius) / beforeIn.radius : 0;

  const beforeOut = await measure(page);
  await realWheel(page, 120, WHEEL_TICKS);
  const afterOut = await measure(page);
  const relOut = beforeOut.radius
    ? Math.abs(afterOut.radius - beforeOut.radius) / beforeOut.radius
    : 0;

  return { relIn, relOut, rel: Math.max(relIn, relOut) };
}

async function scenarioBaseline(browser) {
  console.log('\n[S1] free-fly 직접 (baseline) — 줌 체감 + 시점 보존');
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await bootstrap(page);
    await enterFreeFly(page);
    const zoom = await measureZoomPerceptibility(page);
    const pass = zoom.rel >= ZOOM_PERCEPTIBLE_THRESHOLD;
    console.log(
      `  rel(in/out)=${(zoom.relIn * 100).toFixed(2)}%/${(zoom.relOut * 100).toFixed(2)}% → ${pass ? 'PASS' : 'FAIL'}`,
    );
    return { scenario: 'S1', zoom, pass };
  } finally {
    await context.close();
  }
}

async function scenarioSatellite(browser) {
  console.log(`\n[S2] ${SATELLITE_ID}(galilean) focus → free-fly — 줌 체감 + 회전`);
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await bootstrap(page);
    // 위성 focus (UI 버튼 경로 = store.setSelectedBody)
    await page.evaluate(
      (id) => window.__simStore?.getState?.().setSelectedBody?.(id),
      SATELLITE_ID,
    );
    await page.waitForTimeout(SETTLE_MS);
    await enterFreeFly(page);

    // 회전 작동
    const preRot = await measure(page);
    await dragRotate(page);
    const postRot = await measure(page);
    const dAlpha = Math.abs(postRot.alpha - preRot.alpha);
    const dBeta = Math.abs(postRot.beta - preRot.beta);
    const rotates = dAlpha > 1e-4 || dBeta > 1e-4;

    // 줌 체감 (회귀 핵심 — fix 전 0.03%)
    const zoom = await measureZoomPerceptibility(page);
    const state = await measure(page);
    const zoomPass = zoom.rel >= ZOOM_PERCEPTIBLE_THRESHOLD;
    const pass = zoomPass && rotates;
    console.log(
      `  tier=${state.tier} rel(in/out)=${(zoom.relIn * 100).toFixed(2)}%/${(zoom.relOut * 100).toFixed(2)}% 회전=${rotates}(dα=${dAlpha.toFixed(3)}) → ${pass ? 'PASS' : 'FAIL'}`,
    );
    return { scenario: 'S2', tier: state.tier, zoom, rotates, dAlpha, dBeta, pass };
  } finally {
    await context.close();
  }
}

async function main() {
  console.log('\n=== #629 free-fly 줌 고정 회귀 가드 (wheelDeltaPercentage) ===');
  console.log(
    `  base URL: ${BASE_URL}  임계: 줌 5틱 누적 rel ≥ ${ZOOM_PERCEPTIBLE_THRESHOLD * 100}%`,
  );

  const browser = await chromium.launch({ headless: true });
  const result = { timestamp: new Date().toISOString(), baseUrl: BASE_URL, scenarios: {} };
  let allPass = true;
  try {
    result.scenarios.s1 = await scenarioBaseline(browser);
    if (!result.scenarios.s1.pass) allPass = false;
    result.scenarios.s2 = await scenarioSatellite(browser);
    if (!result.scenarios.s2.pass) allPass = false;
  } finally {
    await browser.close();
  }

  console.log('\n=== 최종 요약 ===');
  for (const [k, s] of Object.entries(result.scenarios)) {
    console.log(`  ${k}: ${s.pass ? 'PASS' : 'FAIL'}`);
  }
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
