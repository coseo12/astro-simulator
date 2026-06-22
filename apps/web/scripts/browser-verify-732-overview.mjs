#!/usr/bin/env node
/**
 * #732 회귀 가드 — "위성/body focus / free-fly → reset = 태양계 개요 복귀" 동작 보존.
 *
 * ADR `docs/decisions/20260621-732-overview-transition-mostly-no-op.md` §6 회귀 가드.
 *
 * 사용법:
 *   pnpm --filter @astro-simulator/web verify:732-overview
 *   pnpm --filter @astro-simulator/web verify:732-overview -- --json
 *
 * ## 배경 (NO-OP 종결)
 *
 * #732 는 "위성/body focus → 태양계 개요 전환" UX 인계 이슈였으나, architect runtime 실측
 * (ADR §2~§4) 결과 #699/#704 가 이미 충족 → **코드 동작 변경 0 (NO-OP)**. 단 현 "reset 이
 * 위성/free-fly 에서도 개요로 매끄럽게 복귀"하는 동작에 **전용 회귀 가드가 없다** (verify:378-focus
 * 는 focus 진입만, verify:629/631 은 줌/escalation 만 커버 — ADR §5 위험 2). 미래 카메라 리팩토링이
 * reset 천이를 조용히 깨뜨릴 수 있어 본 가드를 신설한다.
 *
 * ## 검증 시나리오 (3 — io 위성 / earth 행성 / free-fly)
 *
 * | 시나리오 | DoD | 회귀 시 |
 * |---|---|---|
 * | S1. io(위성) focus → reset       | 종료 tier=solar radius≈35 |target|≈0 + 천이 단조 감소 | 위성에서 개요 복귀 깨짐 |
 * | S2. earth(행성) focus → reset    | 동일 | 행성에서 개요 복귀 깨짐 |
 * | S3. io focus → free-fly → reset  | 동일 (free-fly→reset 라우팅 #693 보존) | 패닝/시점 잔류 |
 *
 * ⚠️ **입력 없는 reset 경로 한정** (ADR §5-4 실측): reset tween 중 사용자 휠 입력 시 종료 radius 가
 * 35 가 아닐 수 있으므로(실측 45.3), 본 가드는 reset 후 입력 주입 없이 순수 종료 상태만 검증한다.
 *
 * **도달 시간/frame-count 는 가드하지 않는다** (ADR §6 — easing 구현 세부 과결합 + 60↔144Hz frame-count
 * flake 회피). "종료 상태 + 단조성"만 검증 (agy §6 FPS 비의존성 정합).
 *
 * reset 트리거 = window.__simCore.command({type:'resetCamera'}) — reset 버튼(sendCommand)과 동일 경로.
 * focus 진입 = window.__simStore.getState().setSelectedBody(id).
 * free-fly 진입 = window.__simStore.getState().enterFreeFly().
 *
 * dev 빌드 의존: window.__solarScene(getTier/meshes) / window.__simStore / window.__simCore(command).
 * 환경변수:
 *   BASE_URL  — 웹 서버 URL (기본 http://localhost:3000)
 *   SIMULATE_RESET_RADIUS_FAULT — (테스트 전용) 설정 시 종료 radius 측정값에 결함 주입 → negative 시뮬.
 *                                 3중 시뮬(가드 도입 PR DoD)에서 가드 자체 작동 입증용. 정상 운영 미설정.
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const flags = { json: process.argv.slice(2).includes('--json') };

const VIEWPORT = { width: 1280, height: 720 };
const SETTLE_MS = 2500;
// 종료 상태 임계 — 실측(2026-06-21 dev server, ADR §6): io/earth/free-fly 모두 정확히 radius=35.0000
// |target|=0.0000 종료. ±0.5 마진이 부동소수 jitter 흡수 + 회귀(개요 복귀 깨짐) 안전 분리.
const RESET_END_RADIUS = 35;
const RADIUS_TOLERANCE = 0.5;
const TARGET_DIST_TOLERANCE = 0.5;
const RESET_END_TIER = 'solar';
// 천이 단조성 — reset tween 중 어느 프레임도 radius/|target| 이 직전 프레임 대비 증가하지 않아야 함
// (되돌아가는 oscillation = race 신호). 부동소수 jitter 흡수 1% + 절대 0.01 마진(target 0 근방).
const MONOTONIC_REL_MARGIN = 0.01;
const MONOTONIC_ABS_MARGIN = 0.01;
// 천이 샘플 — 16ms(≈1 프레임) 간격. 실측상 reset tween 은 ~80ms(5프레임)에 정착하나, 단조성 검증을
// 위해 천이 전 구간(12 샘플 ≈ 192ms)을 커버한다. 정착 후 추가 샘플은 동일값이라 단조성 무해.
const TRANSITION_SAMPLES = 12;
const SAMPLE_INTERVAL_MS = 16;
// (테스트 전용) negative 시뮬 — 종료 radius 측정값에 결함 주입. 3중 시뮬에서만 사용.
const FAULT = process.env.SIMULATE_RESET_RADIUS_FAULT
  ? Number(process.env.SIMULATE_RESET_RADIUS_FAULT)
  : 0;

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
    () =>
      typeof window.__solarScene !== 'undefined' &&
      typeof window.__simStore !== 'undefined' &&
      typeof window.__simCore !== 'undefined',
    { timeout: 15_000 },
  );
  await page.waitForTimeout(SETTLE_MS);
}

async function focus(page, id) {
  await page.evaluate((bodyId) => window.__simStore.getState().setSelectedBody(bodyId), id);
  await page.waitForTimeout(SETTLE_MS);
}

async function freeFly(page) {
  await page.evaluate(() => window.__simStore.getState().enterFreeFly());
  await page.waitForTimeout(1200);
}

/** reset 트리거(버튼 경로) 후 천이 샘플 + 정착 종료 상태 측정 (입력 주입 없음). */
async function resetAndSample(page) {
  await page.evaluate(() => window.__simCore.command({ type: 'resetCamera' }));
  const seq = [];
  for (let i = 0; i < TRANSITION_SAMPLES; i += 1) {
    seq.push(await measure(page));
    await page.waitForTimeout(SAMPLE_INTERVAL_MS);
  }
  await page.waitForTimeout(600); // 완전 정착 마진
  const final = await measure(page);
  return { seq, final };
}

/** 천이 단조 감소 위반 카운트 (race oscillation 신호 검출). */
function countMonotonicViolations(seq) {
  let radius = 0;
  let target = 0;
  for (let i = 1; i < seq.length; i += 1) {
    if (seq[i].radius > seq[i - 1].radius * (1 + MONOTONIC_REL_MARGIN) + MONOTONIC_ABS_MARGIN) {
      radius += 1;
    }
    if (
      seq[i].targetDist >
      seq[i - 1].targetDist * (1 + MONOTONIC_REL_MARGIN) + MONOTONIC_ABS_MARGIN
    ) {
      target += 1;
    }
  }
  return { radius, target };
}

async function runScenario(browser, scenario, label, setup) {
  console.log(`\n[${scenario}] ${label}`);
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await boot(page);
    await setup(page);
    const before = await measure(page);
    const { seq, final } = await resetAndSample(page);

    // (테스트 전용) negative 시뮬 결함 주입 — 종료 radius 측정값 왜곡.
    const finalRadius = final.radius + FAULT;

    const radiusOk = Math.abs(finalRadius - RESET_END_RADIUS) <= RADIUS_TOLERANCE;
    const targetOk = final.targetDist <= TARGET_DIST_TOLERANCE;
    const tierOk = final.tier === RESET_END_TIER;
    const mono = countMonotonicViolations(seq);
    const monoOk = mono.radius === 0 && mono.target === 0;
    const pass = radiusOk && targetOk && tierOk && monoOk;

    console.log(
      `  reset 전: tier=${before.tier} radius=${before.radius.toFixed(1)} |target|=${before.targetDist.toFixed(1)}`,
    );
    console.log(
      `  종료: tier=${final.tier}(=${RESET_END_TIER}? ${tierOk}) radius=${finalRadius.toFixed(3)}(≈${RESET_END_RADIUS}? ${radiusOk}) |target|=${final.targetDist.toFixed(3)}(≈0? ${targetOk})`,
    );
    console.log(
      `  단조성 위반: radius=${mono.radius} target=${mono.target} (0? ${monoOk}) → ${pass ? 'PASS' : 'FAIL'}`,
    );

    return {
      scenario,
      before,
      final: { ...final, radius: finalRadius },
      radiusOk,
      targetOk,
      tierOk,
      mono,
      monoOk,
      pass,
    };
  } finally {
    await ctx.close();
  }
}

async function main() {
  console.log('\n=== #732 위성/free-fly → reset = 개요 복귀 회귀 가드 ===');
  console.log(
    `  base URL: ${BASE_URL}  임계: radius=${RESET_END_RADIUS}±${RADIUS_TOLERANCE} |target|≤${TARGET_DIST_TOLERANCE} tier=${RESET_END_TIER} 단조감소`,
  );
  if (FAULT)
    console.log(
      `  ⚠️ SIMULATE_RESET_RADIUS_FAULT=${FAULT} (negative 시뮬 — 종료 radius 결함 주입)`,
    );

  const browser = await chromium.launch({ headless: true });
  const result = { timestamp: new Date().toISOString(), baseUrl: BASE_URL, scenarios: {} };
  let allPass = true;
  try {
    result.scenarios.s1 = await runScenario(browser, 'S1', 'io(위성) focus → reset', async (p) => {
      await focus(p, 'io');
    });
    result.scenarios.s2 = await runScenario(
      browser,
      'S2',
      'earth(행성) focus → reset',
      async (p) => {
        await focus(p, 'earth');
      },
    );
    result.scenarios.s3 = await runScenario(
      browser,
      'S3',
      'io focus → free-fly → reset',
      async (p) => {
        await focus(p, 'io');
        await freeFly(p);
      },
    );
    for (const s of Object.values(result.scenarios)) if (!s.pass) allPass = false;
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
