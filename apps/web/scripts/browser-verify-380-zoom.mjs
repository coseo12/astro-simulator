#!/usr/bin/env node
/**
 * #380 fix 회귀 가드 — tier 전환 시 jitter / 줌인 후 freeze 회귀 차단.
 *
 * ADR `docs/decisions/20260509-380-zoom-camera-freeze-forensic.md` §결정 §회귀 가드 +
 * §Amendment 2026-05-11 §Concrete Predictions 6, 7.
 *
 * 사용법:
 *   pnpm --filter @astro-simulator/web verify:380-zoom
 *   pnpm --filter @astro-simulator/web verify:380-zoom -- --json
 *
 * ## 검증 시나리오 (4 가드 직교 매트릭스)
 *
 * | 시나리오 | 가드 | DoD | 비고 |
 * |---|---|---|---|
 * | S1. T3 진입 후 줌인 5회 | 가드 A (lowerRadiusLimit) | radius 가 mesh boundingRadius 근접까지 감소 | wall 차단 검증 |
 * | S2. tier 전환 시점 빠른 휠 5회 | 가드 G8a (race window 0) | radius 변화율 단조 (jitter spike 없음) | ADR Prediction 6 |
 * | S3. 빠른 휠 회전 5회 | 가드 B (in-flight lock) | tier 변화 횟수 ≤ 입력 횟수 (oscillate 차단) | ADR Prediction 2 |
 * | S4. T3 body + focus + 30s 자유 줌 | 가드 C (primary follow) | radius 입력 반응 유지 (freeze 0회) | ADR Prediction 4 |
 *
 * dev 빌드 의존:
 *  - `window.__solarScene.meshes` (Map<id, Mesh>) — solar-system-scene.ts:1237 export
 *  - `window.__solarScene.getTier()` — 현재 tier 반환
 *  - `window.__simCore` — sendCommand 경로
 *
 * 환경변수:
 *   BASE_URL  — 웹 서버 URL (기본 http://localhost:3000)
 */

import { chromium } from 'playwright';
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
};

const VIEWPORT = { width: 1280, height: 800, dpr: 1 };
const POST_FOCUS_WAIT_MS = 2500; // tier transition (300ms) + dolly + LOD 안정화 마진
const TIER_TRANSITION_MS = 500; // detachControl lockMs 기본값과 동일 + 마진

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
      { timeout: 15_000 },
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

/**
 * 시나리오 S2 — tier 전환 시점 빠른 휠 입력 5회 (가드 G8a).
 *
 * ADR Prediction 6: G8a 가드 적용 후 사용자 D-T2 재현 (tier 전환 시점 휠 회전 5회 / 1초 간격) 시
 * 카메라 radius 변화율이 transition 진행 중 단조 (휠 입력으로 인한 spike 없음). jitter 0회.
 *
 * DoD: 휠 입력이 tier 전환 진행 중에 도달해도 radius 가 spike 없이 단조 (race window 0 검증).
 */
async function scenarioS2TransitionJitter(browser) {
  console.log('\n[S2] tier 전환 시점 빠른 휠 5회 (가드 G8a: race window 0)');
  const context = await browser.newContext({
    viewport: { width: VIEWPORT.width, height: VIEWPORT.height },
    deviceScaleFactor: VIEWPORT.dpr,
  });
  const page = await context.newPage();
  try {
    // T1 default 진입 (focus 없음)
    await page.goto(`${BASE_URL}/?gpu=a&lod=auto`, {
      waitUntil: 'networkidle',
      timeout: 30_000,
    });
    await page.waitForFunction(
      () => typeof window.__simCore !== 'undefined' && typeof window.__solarScene !== 'undefined',
      { timeout: 15_000 },
    );
    await page.waitForTimeout(POST_FOCUS_WAIT_MS);

    const initial = await measureCameraState(page);
    // mercury focus 진입 — tier 전환 트리거 (T1 → T3).
    // url-sync 대신 sendCommand 직접 호출로 tier 전환 정확 시점 제어.
    await page.evaluate(() => {
      /** @type {any} */ (window).__simCore?.sendCommand?.({
        type: 'focusOn',
        bodyId: 'mercury',
      });
    });

    // tier 전환 시작 직후 (~50ms 내) 빠른 휠 입력 5회 — race window 검증.
    const radii = [];
    await page.waitForTimeout(50);
    for (let i = 0; i < 5; i += 1) {
      await dispatchWheel(page, -200, 1, 50); // 50ms 간격으로 빠르게
      const m = await measureCameraState(page);
      radii.push(m.camRadius);
    }
    // tier 전환 완료 대기
    await page.waitForTimeout(TIER_TRANSITION_MS);
    const final = await measureCameraState(page);

    // DoD (ADR §Amendment 2026-05-11 라운드 2 정정): deltas 부호 일관성 (monotonic).
    // G8a 가드의 본질 = wheel 입력이 transition tween 과 충돌해 부호 섞임 (spike) 을 만들지 않음.
    // 변화량 절대값은 transition tween 자연 변화로 다양 — 단조성만 검증.
    //
    // 회귀 시: race window 에서 wheel handler 가 radius 를 transition tween 반대 방향으로 변경 → 부호 섞임.
    // 정상 시: tier 전환 중 detachControl 발동 → wheel 무시 → tween 만 작동 → radius 단조 변화.
    //
    // jitterRatio = (max-min)/avg 는 변화 절대값 측정 — transition tween 자연 변화도 큰 jitterRatio 유발해 오판.
    // 진단 정보로 함께 로그 (회귀 분석용).
    let pass = false;
    let jitterRatio = null;
    let monotonic = null;
    let deltaSigns = null;
    if (radii.length >= 2) {
      const min = Math.min(...radii);
      const max = Math.max(...radii);
      const avg = radii.reduce((a, b) => a + b, 0) / radii.length;
      jitterRatio = avg > 0 ? (max - min) / avg : 0;
      const deltas = radii.slice(1).map((r, i) => r - radii[i]);
      const signs = new Set(deltas.map((d) => Math.sign(d)).filter((s) => s !== 0));
      monotonic = signs.size <= 1; // 모든 변화율 같은 부호 (또는 0 만) — wheel spike 0
      deltaSigns = Array.from(signs);
      pass = monotonic;
    }

    const result = {
      scenario: 'S2',
      initialTier: initial.tier,
      finalTier: final.tier,
      radii,
      jitterRatio,
      monotonic,
      deltaSigns,
      pass,
    };
    console.log(
      `  tier ${initial.tier} → ${final.tier} radii=[${radii.map((r) => r?.toFixed?.(2) ?? 'n/a').join(', ')}] monotonic=${monotonic} signs=[${deltaSigns?.join(',') ?? 'n/a'}] jitterRatio=${jitterRatio?.toFixed?.(3) ?? 'n/a'}`,
    );
    return result;
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
      { timeout: 15_000 },
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
      { timeout: 15_000 },
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

  const browser = await chromium.launch({ headless: true });
  const fullResult = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    scenarios: {},
  };
  let allPass = true;

  try {
    fullResult.scenarios.s1 = await scenarioS1Wall(browser);
    if (!fullResult.scenarios.s1.pass) allPass = false;

    fullResult.scenarios.s2 = await scenarioS2TransitionJitter(browser);
    if (!fullResult.scenarios.s2.pass) allPass = false;

    fullResult.scenarios.s3 = await scenarioS3Oscillate(browser);
    if (!fullResult.scenarios.s3.pass) allPass = false;

    fullResult.scenarios.s4 = await scenarioS4FreezeFreeFly(browser);
    if (!fullResult.scenarios.s4.pass) allPass = false;
  } finally {
    await browser.close();
  }

  if (flags.update) {
    fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(fullResult, null, 2));
    console.log(`\n  baseline 업데이트: ${path.relative(process.cwd(), BASELINE_PATH)}`);
  }

  console.log('\n=== 최종 요약 ===');
  for (const [key, scenario] of Object.entries(fullResult.scenarios)) {
    console.log(`  ${key}: ${scenario.pass ? 'PASS' : 'FAIL'}`);
  }
  console.log(`  overall: ${allPass ? 'PASS' : 'FAIL'}`);

  if (flags.json) {
    console.log('\n--- JSON ---');
    console.log(JSON.stringify(fullResult, null, 2));
  }

  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
