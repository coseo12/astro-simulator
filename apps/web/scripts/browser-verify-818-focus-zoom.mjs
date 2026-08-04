#!/usr/bin/env node
/**
 * #818 fix 회귀 가드 — 대형 body focus 휠 줌인 tier 진동(runaway) stall 차단.
 *
 * 사용법:
 *   pnpm --filter @astro-simulator/web verify:818-focus-zoom
 *   CAPTURE_DIR=docs/reports/818-focus-zoom pnpm --filter @astro-simulator/web verify:818-focus-zoom
 *
 * ## 배경 (architect forensic 실측, #790 PR #816 후속 분리)
 *
 * jupiter/saturn focus 는 inner tier 에 정착(r≈130). 휠 줌인으로 cameraFromFocus 가 0.1 AU
 * (=23.04 unit) 경계를 넘어 inner→body crossing 이 발생하면, 기존 `runTierTransition` 이
 * focus-entry 공식(`boundingR_body × 5.9 ≈ 수백만 unit`) 으로 재프레이밍 → 카메라를 mesh 규모
 * 밖(≈0.89 AU)으로 catapult → cameraFromFocus 가 다시 0.1 AU 밖으로 튐 → tierFromFocus 가 inner
 * 를 역판정 → 무한 진동(runaway). 사용자에겐 lowerRadiusLimit 도달 전 ~34 unit 부근 정지로 관찰.
 *
 * fix (c)+(e): 줌 crossing (`updateTierByCamera → setTier(_, true)`) 은 focusMesh 경로에서도
 * `computeTargetRadius`(실거리/apparent-size 보존) 로 재프레이밍 → crossing 후에도
 * cameraFromFocus < 0.1 AU 유지 → body 안정 → floor 까지 seamless 줌인. planet body↔inner 경계
 * ±15% 히스테리시스로 경계 flip-flop 추가 차단.
 *
 * ## 판정 기준 (tier-불변 실거리 기반 — raw camera.radius 는 crossing 시 16,299× 점프하므로 부적합)
 *
 * ArcRotateCamera.radius 는 tier renderScale 에 종속(scene unit). tier crossing 시 renderScale 이
 * inner(1.54e-9)→body(2.51e-5) 로 16,299× 커지므로 raw radius 는 crossing 에서 불연속 점프한다.
 * 따라서 단조성 판정은 tier-불변 **실거리** `cameraFromFocusAU = radius / renderScale(tier) / AU`
 * 로 한다 (사용자가 체감하는 focus body 까지 실제 거리 — crossing 을 관통해 연속이어야 정상).
 *
 * | DoD | 정의 | 임계 |
 * |---|---|---|
 * | D1. tier 역진동 0 | 줌인 중 body→inner 역전(backward) 전환 횟수 | = 0 (하드페일) |
 * | D2. tier thrash 억제 | 총 tier 전환 횟수 (정상: inner→body 1회) | ≤ 2 |
 * | D3. 실거리 단조 감소 | 연속 측정 간 cameraFromFocusAU 증가(catapult) 최대 배율 | < 1.2 (20% 이내) |
 * | D4. floor 도달 | 최종 radius / lowerRadiusLimit | ≤ 1.05 (±5% 수렴) |
 *
 * ## 시나리오
 *
 * | # | body | 경로 | 기대 |
 * |---|---|---|---|
 * | S1 | jupiter | inner 정착 → 줌인 crossing → body (+왕복 줌아웃) | D1~D4 + D1'~D4' PASS |
 * | S2 | saturn (ring 동반 대형) | 동일 (+왕복 줌아웃) | D1~D4 + D1'~D4' PASS |
 * | S3 | earth (무회귀) | 줌인만 | D1~D4 PASS |
 *
 * ## 줌아웃 왕복 대칭 (cross-validate Q3a, #818 후속) — jupiter/saturn 만
 *
 * updateTierByCamera 는 **양방향** crossing 을 모두 `setTier(nextTier, true)` 로 처리하므로
 * 줌아웃(body→inner) 도 apparent-size 보존이 코드상 대칭 보장된다. empirical 커버가 없어
 * guard teeth 를 추가한다. 줌인으로 floor 도달 후 줌아웃(`wheel(0, +120)`)으로 inner 복귀 궤적 기록.
 *
 * | DoD' | 정의 | 임계 |
 * |---|---|---|
 * | D1'. tier 역진동 0 | 줌아웃 중 inner→body 재전환(inward) 횟수 | = 0 (하드페일) |
 * | D2'. 왕복 완료 | 줌아웃이 실제로 inner 로 복귀했는지 | reached inner (하드페일) |
 * | D3'. 실거리 단조 증가 | 연속 측정 간 cameraFromFocusAU 역방향(감소/bounce) 최대 비율 | < 0.2 (20% 이내) |
 * | D4'. clamp-safe | body→inner crossing 시 radius / lowerRadiusLimit (inner floor pin 여부) | > 1.05 (floor 에 clamp-pin 안 됨 — Q3a) |
 *
 * dev 빌드 의존: window.__solarScene (meshes Map / getTier) + window.__simStore (setSelectedBody)
 * 환경변수: BASE_URL (기본 http://localhost:3000) / CAPTURE_DIR (PNG 저장, 미지정 시 생략)
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { withBrowser } from '../../../scripts/browser-verify-utils.mjs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const CAPTURE_DIR = process.env.CAPTURE_DIR ?? '';
const args = process.argv.slice(2);
const flags = { json: args.includes('--json') };

const VIEWPORT = { width: 1280, height: 720 };
const SETTLE_MS = 2500;
const AU = 1.495978707e11;
// tier.ts RENDER_SCALE SSoT (m → scene unit). tier-불변 실거리 환산에 사용.
const RENDER_SCALE = { solar: 8.4e-11, inner: 1.54e-9, body: 2.51e-5 };

// 줌인 시퀀스 파라미터.
const MAX_ZOOM_ITERS = 60;
const WHEEL_TICKS_PER_ITER = 6;
// 줌아웃은 crossing tween 잔상 회피 위해 iter 당 틱을 줄여 궤적을 촘촘히 샘플 (settle-until-stable 병행).
const ZOOMOUT_TICKS_PER_ITER = 3;
// D3 — 연속 측정 간 실거리(cameraFromFocusAU) 증가 허용 배율. 정상 tween 노이즈 흡수, catapult 검출.
const CATAPULT_RATIO = 1.2;
// D4 — floor 도달 판정: radius / lowerRadiusLimit ≤ 1.05.
const LIMIT_MARGIN = 1.05;
// 수렴 조기 종료: 최근 실거리 상대 변화 < 0.5% 면 floor 도달로 간주.
const CONVERGE_EPS = 0.005;

async function bootstrap(page, urlSuffix = '') {
  await page.goto(`${BASE_URL}/?gpu=a&lod=auto${urlSuffix}`, {
    waitUntil: 'networkidle',
    timeout: 30_000,
  });
  await page.waitForFunction(
    () => typeof window.__solarScene !== 'undefined' && typeof window.__simStore !== 'undefined',
    { timeout: 15_000 },
  );
  await page.waitForTimeout(SETTLE_MS);
}

/** 카메라/tier 상태 측정. 시각 반경은 회전 불변 (local extendSize × scaling). */
async function measure(page, bodyId) {
  return await page.evaluate((id) => {
    const solar = window.__solarScene;
    const mesh = solar?.meshes?.get?.(id);
    if (!mesh) return { error: `no mesh: ${id}` };
    const scene = mesh.getScene();
    const cam = scene?.activeCamera;
    if (!cam) return { error: 'no camera' };
    mesh.computeWorldMatrix(true);
    const bi = mesh.getBoundingInfo();
    const ext = bi.boundingBox.extendSize;
    const s = mesh.scaling;
    const visualRadius = Math.max(
      ext.x * Math.abs(s.x),
      ext.y * Math.abs(s.y),
      ext.z * Math.abs(s.z),
    );
    return {
      tier: solar.getTier ? solar.getTier() : 'unknown',
      radius: cam.radius,
      lowerRadiusLimit: cam.lowerRadiusLimit,
      visualRadius,
    };
  }, bodyId);
}

/** 측정값에 tier-불변 실거리(AU) 부착. */
function withRealDistance(m) {
  const rs = RENDER_SCALE[m.tier] ?? RENDER_SCALE.inner;
  return { ...m, cameraFromFocusAU: m.radius / rs / AU };
}

/**
 * 줌인 시퀀스 전 구간을 기록 — 각 iteration 후 (tier, radius, lowerRadiusLimit, 실거리) 캡처.
 * raw radius 는 crossing 시 불연속이므로 궤적 분석은 실거리(AU) 기반.
 */
async function zoomInTrajectory(page, bodyId) {
  await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
  const trajectory = [];
  let prevReal = null;
  for (let iter = 0; iter < MAX_ZOOM_ITERS; iter += 1) {
    for (let t = 0; t < WHEEL_TICKS_PER_ITER; t += 1) {
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(50);
    }
    // tier 전환 입력 잠금(≤500ms) + radius tween(300ms) 완료 대기.
    await page.waitForTimeout(450);
    const m = await measure(page, bodyId);
    if (m.error) return { error: m.error, trajectory };
    const withReal = withRealDistance(m);
    trajectory.push(withReal);
    // 수렴 조기 종료 (실거리 상대 변화 < 0.5%).
    if (prevReal != null) {
      const rel = Math.abs(withReal.cameraFromFocusAU - prevReal) / Math.max(prevReal, 1e-30);
      if (rel < CONVERGE_EPS) break;
    }
    prevReal = withReal.cameraFromFocusAU;
  }
  return { trajectory };
}

/** 궤적 분석 → D1~D4 판정. */
function analyze(trajectory) {
  // D1/D2 — tier 전환 분석 (줌인 방향: inner → body 만 정상).
  const TIER_ORDER = { solar: 0, inner: 1, body: 2 }; // 클수록 근접(줌인 방향).
  let totalTransitions = 0;
  let backwardTransitions = 0;
  for (let i = 1; i < trajectory.length; i += 1) {
    const prev = trajectory[i - 1].tier;
    const cur = trajectory[i].tier;
    if (prev !== cur) {
      totalTransitions += 1;
      // 줌인 중 tier order 가 감소(body→inner) 하면 역진동(catapult 후 역판정).
      if ((TIER_ORDER[cur] ?? 1) < (TIER_ORDER[prev] ?? 1)) backwardTransitions += 1;
    }
  }
  // D3 — 실거리 단조 감소 (연속 증가 최대 배율).
  let maxUpRatio = 1;
  for (let i = 1; i < trajectory.length; i += 1) {
    const prev = trajectory[i - 1].cameraFromFocusAU;
    const cur = trajectory[i].cameraFromFocusAU;
    if (prev > 1e-30 && cur > prev) maxUpRatio = Math.max(maxUpRatio, cur / prev);
  }
  // D4 — floor 도달.
  const last = trajectory[trajectory.length - 1];
  const radiusOverLimit =
    last && last.lowerRadiusLimit ? last.radius / last.lowerRadiusLimit : Infinity;

  const d1 = backwardTransitions === 0;
  const d2 = totalTransitions <= 2;
  const d3 = maxUpRatio < CATAPULT_RATIO;
  const d4 = radiusOverLimit <= LIMIT_MARGIN;
  return {
    totalTransitions,
    backwardTransitions,
    maxUpRatio,
    radiusOverLimit,
    finalTier: last?.tier,
    finalRadius: last?.radius,
    finalLowerLimit: last?.lowerRadiusLimit,
    d1,
    d2,
    d3,
    d4,
    pass: d1 && d2 && d3 && d4,
  };
}

/**
 * wheel 조작 후 radius 가 안정될 때까지 폴링 후 측정.
 *
 * tier crossing(body→inner) 시 runTierTransition 이 radius 를 300ms tween + 500ms input-lock 로
 * 애니메이션한다. tier(activeTier) 는 setTier 진입 즉시 flip 되지만 radius 는 아직 이전(큰 body)
 * 값에서 목표(작은 inner)로 이동 중 → mid-tween 측정 시 `radius/renderScale(inner)` 이 순간 거대값
 * (샘플링 transient). 안정 후 측정으로 이 잔상을 제거한다 (실 사용자가 보는 최종 상태와 일치).
 */
async function settleAndMeasure(page, bodyId, maxPolls = 10) {
  let prev = await measure(page, bodyId);
  for (let p = 0; p < maxPolls; p += 1) {
    await page.waitForTimeout(200);
    const cur = await measure(page, bodyId);
    if (cur.error) return cur;
    const rel = Math.abs(cur.radius - prev.radius) / Math.max(Math.abs(prev.radius), 1e-12);
    prev = cur;
    if (rel < 0.005) break; // radius 안정 (tween 완료).
  }
  return prev;
}

/**
 * 줌아웃 왕복 궤적 (body → inner 대칭 검증, cross-validate Q3a). wheel(0, +120) 반복.
 * body 를 벗어난 뒤 2 iter 안정되면 조기 종료 (planet focus 는 solar escalate 안 하지만 안전).
 * crossing tween/lock 잔상 제거 위해 iter 당 틱을 줄이고(3) settle-until-stable 측정.
 */
async function zoomOutTrajectory(page, bodyId) {
  await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
  const trajectory = [];
  let leftBodySeen = 0;
  for (let iter = 0; iter < MAX_ZOOM_ITERS; iter += 1) {
    for (let t = 0; t < ZOOMOUT_TICKS_PER_ITER; t += 1) {
      await page.mouse.wheel(0, +120);
      await page.waitForTimeout(80);
    }
    const m = await settleAndMeasure(page, bodyId);
    if (m.error) return { error: m.error, trajectory };
    const withReal = withRealDistance(m);
    trajectory.push(withReal);
    // body 이탈(inner) 2 iter 안정 시 조기 종료.
    if (withReal.tier !== 'body') {
      leftBodySeen += 1;
      if (leftBodySeen >= 2) break;
    } else {
      leftBodySeen = 0;
    }
  }
  return { trajectory };
}

/** 줌아웃 궤적 분석 → D1'~D4' (줌인 D1~D4 대칭). */
function analyzeZoomOut(trajectory) {
  const TIER_ORDER = { solar: 0, inner: 1, body: 2 }; // 클수록 근접.
  let totalTransitions = 0;
  let inwardTransitions = 0; // 줌아웃 중 tier order 증가(inner→body 재전환) = 역진동.
  let crossingIdx = -1; // 첫 body→inner crossing.
  for (let i = 1; i < trajectory.length; i += 1) {
    const prev = trajectory[i - 1].tier;
    const cur = trajectory[i].tier;
    if (prev !== cur) {
      totalTransitions += 1;
      if ((TIER_ORDER[cur] ?? 1) > (TIER_ORDER[prev] ?? 1)) inwardTransitions += 1;
      if (prev === 'body' && cur === 'inner' && crossingIdx < 0) crossingIdx = i;
    }
  }
  // D3' — 실거리 단조 증가 (줌아웃은 멀어짐). 역방향(감소) 최대 비율 = inward bounce.
  let maxBackward = 0; // (prev - cur)/prev, cur < prev 일 때.
  for (let i = 1; i < trajectory.length; i += 1) {
    const prev = trajectory[i - 1].cameraFromFocusAU;
    const cur = trajectory[i].cameraFromFocusAU;
    if (prev > 1e-30 && cur < prev) maxBackward = Math.max(maxBackward, (prev - cur) / prev);
  }
  // D4' clamp-safe — body→inner crossing 시점 radius / lowerRadiusLimit (floor 에 pin 되면 ≈1).
  const crossing = crossingIdx >= 0 ? trajectory[crossingIdx] : null;
  const crossingRadiusOverLimit =
    crossing && crossing.lowerRadiusLimit ? crossing.radius / crossing.lowerRadiusLimit : Infinity;
  const reachedInner = trajectory.some((m) => m.tier === 'inner');

  const d1 = inwardTransitions === 0;
  const d2 = reachedInner;
  const d3 = maxBackward < CATAPULT_RATIO - 1; // < 0.2 (20% 이내 역방향 = bounce 없음).
  const d4 = crossingRadiusOverLimit > LIMIT_MARGIN; // crossing 시 inner floor clamp-pin 안 됨.
  return {
    totalTransitions,
    inwardTransitions,
    maxBackward,
    reachedInner,
    crossingRadiusOverLimit,
    finalTier: trajectory[trajectory.length - 1]?.tier,
    finalRadius: trajectory[trajectory.length - 1]?.radius,
    d1,
    d2,
    d3,
    d4,
    pass: d1 && d2 && d3 && d4,
  };
}

async function runScenario(browser, { name, bodyId, roundTrip = false }) {
  console.log(
    `\n[${name}] ${bodyId} focus → 휠 줌인${roundTrip ? ' + 줌아웃 왕복' : ''} (tier 진동/실거리 단조 판정)`,
  );
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  try {
    await bootstrap(page);
    await page.evaluate((id) => window.__simStore?.getState?.().setSelectedBody?.(id), bodyId);
    await page.waitForTimeout(SETTLE_MS);

    const atFocus = withRealDistance(await measure(page, bodyId));
    const { trajectory, error } = await zoomInTrajectory(page, bodyId);
    if (error && trajectory.length === 0) {
      console.log(`  측정 실패: ${error}`);
      return { scenario: name, bodyId, error, pass: false };
    }
    const a = analyze(trajectory);

    if (CAPTURE_DIR) {
      const canvas = page.locator('canvas').first();
      const buf = await canvas.screenshot();
      await mkdir(CAPTURE_DIR, { recursive: true });
      await writeFile(path.join(CAPTURE_DIR, `818-${bodyId}-max-zoom.png`), buf);
    }

    console.log(
      `  focus(tier=${atFocus.tier} r=${atFocus.radius?.toFixed(2)} dist=${atFocus.cameraFromFocusAU?.toFixed(4)}AU) → ` +
        `${trajectory.length} iters, final(tier=${a.finalTier} r=${a.finalRadius?.toFixed(2)} lower=${a.finalLowerLimit?.toFixed(2)})`,
    );
    console.log(
      `  [줌인] D1 역진동=${a.backwardTransitions} (=0?${a.d1 ? 'PASS' : 'FAIL'}) | ` +
        `D2 총전환=${a.totalTransitions} (≤2?${a.d2 ? 'PASS' : 'FAIL'}) | ` +
        `D3 catapult배율=${a.maxUpRatio.toFixed(3)} (<${CATAPULT_RATIO}?${a.d3 ? 'PASS' : 'FAIL'}) | ` +
        `D4 r/lower=${a.radiusOverLimit.toFixed(3)} (≤${LIMIT_MARGIN}?${a.d4 ? 'PASS' : 'FAIL'}) | ` +
        `콘솔에러=${consoleErrors.length}`,
    );

    // 줌아웃 왕복 대칭 (cross-validate Q3a) — jupiter/saturn 만.
    let zoomOut = null;
    if (roundTrip) {
      const { trajectory: outTraj, error: outErr } = await zoomOutTrajectory(page, bodyId);
      if (outErr && outTraj.length === 0) {
        console.log(`  [줌아웃] 측정 실패: ${outErr}`);
        zoomOut = { error: outErr, pass: false };
      } else {
        zoomOut = analyzeZoomOut(outTraj);
        console.log(
          `  [줌아웃] ${outTraj.length} iters, final(tier=${zoomOut.finalTier} r=${zoomOut.finalRadius?.toFixed(2)})`,
        );
        console.log(
          `  [줌아웃] D1' 역진동=${zoomOut.inwardTransitions} (=0?${zoomOut.d1 ? 'PASS' : 'FAIL'}) | ` +
            `D2' 왕복=${zoomOut.reachedInner ? 'inner복귀' : '미복귀'} (${zoomOut.d2 ? 'PASS' : 'FAIL'}) | ` +
            `D3' 역방향=${(zoomOut.maxBackward * 100).toFixed(1)}% (<20%?${zoomOut.d3 ? 'PASS' : 'FAIL'}) | ` +
            `D4' clamp-safe r/lower=${Number.isFinite(zoomOut.crossingRadiusOverLimit) ? zoomOut.crossingRadiusOverLimit.toFixed(3) : 'n/a'} (>${LIMIT_MARGIN}?${zoomOut.d4 ? 'PASS' : 'FAIL'})`,
        );
      }
    }

    const pass = a.pass && (!roundTrip || (zoomOut != null && zoomOut.pass));
    return {
      scenario: name,
      bodyId,
      focusTier: atFocus.tier,
      focusDistAU: atFocus.cameraFromFocusAU,
      iters: trajectory.length,
      ...a,
      zoomOut,
      consoleErrors: consoleErrors.length,
      pass,
    };
  } finally {
    await context.close();
  }
}

async function main() {
  console.log('\n=== #818 대형 body focus 휠 줌인 tier 진동 stall 회귀 가드 ===');
  console.log(
    `  base URL: ${BASE_URL}  임계: 역진동=0 AND 총전환≤2 AND catapult<${CATAPULT_RATIO} AND r/lower≤${LIMIT_MARGIN}`,
  );

  const result = { timestamp: new Date().toISOString(), baseUrl: BASE_URL, scenarios: {} };
  let allPass = true;
  // #940 — 브라우저 수명주기를 `withBrowser` 로 위임 (에러 경로 close 도달 보장).
  // launch 인자는 원본 그대로 전달한다 (렌더러 축 불변 — docs/ops/browser-verify-helpers.md).
  await withBrowser({ headless: true }, async (browser) => {
    result.scenarios.s1 = await runScenario(browser, {
      name: 'S1',
      bodyId: 'jupiter',
      roundTrip: true,
    });
    result.scenarios.s2 = await runScenario(browser, {
      name: 'S2',
      bodyId: 'saturn',
      roundTrip: true,
    });
    result.scenarios.s3 = await runScenario(browser, { name: 'S3', bodyId: 'earth' });
    for (const s of Object.values(result.scenarios)) {
      if (!s.pass) allPass = false;
    }
  });

  console.log('\n=== 최종 요약 ===');
  for (const [k, s] of Object.entries(result.scenarios)) {
    console.log(`  ${k} (${s.bodyId}): ${s.pass ? 'PASS' : 'FAIL'}`);
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
  process.exit(1);
});
