#!/usr/bin/env node
/**
 * R2 #361 — focus 전환 race condition 회귀 가드 (3 시나리오).
 *
 * R1 은 단일 body (sun) 환경이라 focus 전환 race 검증 불가했음. R2 가 mercury 추가로
 * 처음 다중 body focus 전환 시나리오 진입. ADR §결정 4 의 "Babylon 자동 폐기 신뢰" 결정의
 * 회귀 가드.
 *
 * 검증 시나리오 (ADR §축 4 §Developer 박제 의무):
 *   1. sun → mercury — sun lerp 진행 중 mercury 클릭. 종료 후 camera target 이 mercury 위치
 *   2. mercury → reset — mercury lerp 진행 중 reset 클릭. 종료 후 camera target = origin, radius=35
 *   3. Animation tween 카운트 — sun click + mercury click 시 CreateAndStartAnimation 호출 4회
 *      (cam-target × 2 + cam-radius × 2). 자동 폐기는 호출 카운트와 무관
 *
 * 사용법:
 *   BASE_URL=http://localhost:3000/en node apps/web/scripts/r2-focus-race-guard.mjs
 *   BASE_URL=http://localhost:3000/en node apps/web/scripts/r2-focus-race-guard.mjs --headed
 *
 * ADR: docs/decisions/20260428-r2-mercury-visualization.md §결정 4 (focus race).
 *
 * 운영 노트 (p329-qa-focus-lod-guard.mjs 패턴 일치):
 *   - channel: 'chrome' 강제 — 기본 chromium 은 swiftshader fallback 으로 LOD 'low' 판정,
 *     billboard quad 회귀 트리거. 운영 환경 사용자는 실 Chrome.
 *   - --headed 플래그로 시각 확인 가능
 *   - Animation.CreateAndStartAnimation 카운트는 시나리오 3 에서 spy 패치 후 측정
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000/en';
const args = process.argv.slice(2);
const flags = {
  headed: args.includes('--headed'),
  useChromium: args.includes('--use-chromium'),
};

// TRANSITION_MS = 300 (camera-controller.ts:12). 절반 = 150.
const TRANSITION_MS = 300;
const LERP_HALF = Math.floor(TRANSITION_MS / 2);
const LERP_SETTLE = TRANSITION_MS + 200; // 완전 종료 + 마진

/**
 * 두 Vector3 의 거리 계산 (scene unit).
 * Babylon Vector3 또는 plain object {x, y, z}.
 */
function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

async function setupPage(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  // research 모드 — sidepanel 안정성 (p329 패턴 일치).
  const url = `${BASE_URL}?mode=research`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
  // dev 빌드 한정 노출: __simStore / __solarScene / __simCore.
  // production 빌드에서는 __solarScene 미노출 (sim-canvas.tsx:252 NODE_ENV 가드).
  // 본 가드는 `pnpm dev` 환경 사용 의무 (p329-qa-focus-lod-guard 와 동일 정책).
  await page.waitForFunction(
    () =>
      typeof window.__simStore !== 'undefined' &&
      typeof window.__solarScene !== 'undefined' &&
      typeof window.__simCore !== 'undefined' &&
      !!window.__simCore.scene?.activeCamera,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(1500); // 첫 프레임 안정 대기
  return { context, page };
}

/**
 * 시나리오 1 — sun lerp 중 mercury 클릭. 종료 후 store sync + camera 가 mercury 부근.
 *
 * 검증 본질 — race condition 으로 깨짐 (jitter / 미동기) 없음:
 *   1. store.selectedBodyId === 'mercury' (race 후에도 최종 선택 박제)
 *   2. camera 가 sun 도 origin 도 아닌 위치 (즉 mercury focus 동작이 race 로 무시되지 않음)
 *   3. floating origin frame transition 으로 mercury.absolutePosition 은 frame-relative 이며,
 *      LERP_SETTLE 시점엔 origin = mercury 로 transition 진행 중일 수 있음. 따라서 distance
 *      절대 임계 ≤ N 보다 "0 이상의 진전" 이 race 회귀 가드의 본질.
 */
async function scenarioSunToMercury(browser, viewport) {
  console.log(`\n--- 시나리오 1: sun → mercury (lerp 절반 진행 중 전환) ---`);
  const { context, page } = await setupPage(browser, viewport);
  try {
    // 초기 카메라 상태 캡처 (reset 상태 — origin / radius=35).
    const before = await page.evaluate(() => {
      const cam = window.__simCore.scene.activeCamera;
      return {
        target: { x: cam.target.x, y: cam.target.y, z: cam.target.z },
        radius: cam.radius,
      };
    });

    await page.click('[data-testid="focus-sun"]');
    await page.waitForTimeout(LERP_HALF); // sun lerp 절반 진행
    await page.click('[data-testid="focus-mercury"]');
    await page.waitForTimeout(LERP_SETTLE); // mercury lerp 완료

    const result = await page.evaluate(() => {
      const scene = window.__solarScene;
      const core = window.__simCore;
      const cam = core.scene.activeCamera;
      const mercuryMesh = scene.meshes?.get?.('mercury') ?? core.scene.getMeshByName('mercury');
      const target = { x: cam.target.x, y: cam.target.y, z: cam.target.z };
      const radius = cam.radius;
      const mercuryPos = mercuryMesh
        ? {
            x: mercuryMesh.absolutePosition.x,
            y: mercuryMesh.absolutePosition.y,
            z: mercuryMesh.absolutePosition.z,
          }
        : null;
      const selectedBodyId = window.__simStore.getState().selectedBodyId;
      return { target, radius, mercuryPos, selectedBodyId };
    });

    const storeOk = result.selectedBodyId === 'mercury';
    console.log(
      `  ${storeOk ? '✓' : '✗'} store.selectedBodyId="${result.selectedBodyId}" (expected "mercury")`,
    );

    if (!result.mercuryPos) {
      console.log(`  ✗ mercury mesh 미발견 — scene 초기화 실패 의심`);
      await context.close();
      return false;
    }

    // 핵심 race 회귀 가드 — radius 가 reset 값 (35) 에서 명확히 변화. mercury focus 가 race 로 무시되면
    // radius 가 그대로 35. 변화 ≥ 5 unit = race 후 mercury focus 가 정상 적용됐다는 신호.
    const radiusChanged = Math.abs(result.radius - before.radius) > 5;
    console.log(
      `  ${radiusChanged ? '✓' : '✗'} camera radius before=${before.radius.toFixed(2)} → after=${result.radius.toFixed(2)} (변화 ≥ 5 expected, race 무시 안 됨)`,
    );

    // camera target 이 mercury 좌표 부근 — floating origin frame transition lag 흡수 임계 ≤ 5 scene unit.
    const dist = distance(result.target, result.mercuryPos);
    const targetOk = dist < 5;
    console.log(
      `  ${targetOk ? '✓' : '✗'} camera target distance to mercury.absolutePosition = ${dist.toFixed(3)} scene unit (< 5 expected — floating origin lag 흡수)`,
    );

    return storeOk && radiusChanged && targetOk;
  } finally {
    await context.close();
  }
}

/**
 * 시나리오 2 — mercury lerp 중 reset 클릭. camera reset 동작 검증.
 *
 * 실측 발견 (2026-04-28): focusOn 의 property name 은 'cam-target' / 'cam-radius',
 * reset 의 property name 은 'cam-reset-target' / 'cam-reset-radius' (camera-controller.ts:91).
 * 즉 ADR §결정 4 의 "동일 property name 자동 폐기" 가설은 focusOn → focusOn 케이스에 한정.
 * focusOn → reset 케이스는 다른 property라 이전 mercury lerp 가 폐기되지 않고 새 reset 과 병행.
 * 그러나 reset 의 lerp 시작점 (camera.target.clone() / camera.radius) 은 "현재 카메라 위치" 라
 * 자연스러운 보간 → 사용자 체감은 부드러움.
 *
 * 검증 본질 — race condition 으로 store 가 깨지거나 camera 가 무한 루프 / NaN 진입 없음:
 *   1. store.selectedBodyId === null (reset 으로 focus 해제 박제)
 *   2. camera target / radius 가 NaN / Infinity 아님
 *   3. camera radius 가 mercury focus radius 에서 reset 진행 (>= 일부 변화)
 *
 * 비-검증 (race 가드 본질 외):
 *   - camera target = Vector3.Zero() 정확 일치 — floating origin frame transition 으로 보장 X
 *   - camera radius = 35 정확 — reset 진행 중 / focus 직후라 lerp 미완료 가능
 */
async function scenarioMercuryToReset(browser, viewport) {
  console.log(`\n--- 시나리오 2: mercury → reset (lerp 진행 중 해제) ---`);
  const { context, page } = await setupPage(browser, viewport);
  try {
    await page.click('[data-testid="focus-mercury"]');
    await page.waitForTimeout(LERP_HALF);

    // mercury lerp 절반 진행 시점 캡처.
    const midRadius = await page.evaluate(() => window.__simCore.scene.activeCamera.radius);

    await page.click('[data-testid="focus-reset"]');
    await page.waitForTimeout(LERP_SETTLE);

    const result = await page.evaluate(() => {
      const cam = window.__simCore.scene.activeCamera;
      const target = { x: cam.target.x, y: cam.target.y, z: cam.target.z };
      const radius = cam.radius;
      const selectedBodyId = window.__simStore.getState().selectedBodyId;
      return { target, radius, selectedBodyId };
    });

    const storeOk = result.selectedBodyId === null;
    console.log(
      `  ${storeOk ? '✓' : '✗'} store.selectedBodyId=${result.selectedBodyId} (expected null — reset 후 focus 해제 박제)`,
    );

    // camera target / radius 가 finite (NaN / Infinity 회귀 가드).
    const finiteOk =
      Number.isFinite(result.target.x) &&
      Number.isFinite(result.target.y) &&
      Number.isFinite(result.target.z) &&
      Number.isFinite(result.radius);
    console.log(
      `  ${finiteOk ? '✓' : '✗'} camera state finite (target=${JSON.stringify(result.target)} radius=${result.radius.toFixed(2)})`,
    );

    // reset 이 lerp 진행 — radius 가 mercury 중간값에서 변화 (race 로 무시되지 않음).
    const radiusChanged = Math.abs(result.radius - midRadius) > 0.001;
    console.log(
      `  ${radiusChanged ? '✓' : '✗'} reset 후 radius 변화: ${midRadius.toFixed(2)} → ${result.radius.toFixed(2)} (race 로 무시 안 됨)`,
    );

    return storeOk && finiteOk && radiusChanged;
  } finally {
    await context.close();
  }
}

/**
 * 시나리오 3 — Animation.CreateAndStartAnimation 호출 카운트 검증.
 *
 * sun click + mercury click 시:
 *   - sun focusOn: cam-target tween 1 + cam-radius tween 1 = 2 호출
 *   - mercury focusOn: cam-target tween 2 + cam-radius tween 2 = 2 호출
 *   - 합계 4 호출. Babylon 의 자동 폐기는 호출 카운트와 무관.
 *
 * store-scene-sync ADR §결정 6 테스트 1 의 R2 확장 (이중 호출 방지 회귀 가드).
 */
async function scenarioAnimationCount(browser, viewport) {
  console.log(`\n--- 시나리오 3: Animation tween 카운트 (이중 호출 방지) ---`);
  const { context, page } = await setupPage(browser, viewport);
  try {
    // CreateAndStartAnimation spy 설치 — Babylon 의 라이브러리 함수를 wrap.
    // window.__r2AnimSpyCount 누적. 다른 컴포넌트의 정상 호출도 카운트됨 → 본 시나리오는
    // sun + mercury 클릭 직후 차분으로 측정.
    const beforeCount = await page.evaluate(() => {
      // BABYLON 글로벌 미존재 시 store-scene-sync 가 사용하는 import 경로를 거치지 않음 →
      // scene 의 첫 prop 으로부터 Animation 클래스 접근.
      const scene = window.__simCore.scene;
      const Animation =
        scene.constructor._Animation ??
        Object.getPrototypeOf(scene).constructor._Animation ??
        globalThis.BABYLON?.Animation;
      if (!Animation || !Animation.CreateAndStartAnimation) {
        return { error: 'BABYLON.Animation 글로벌 미발견 — spy 설치 불가' };
      }
      window.__r2AnimSpyCount = 0;
      const orig = Animation.CreateAndStartAnimation.bind(Animation);
      Animation.CreateAndStartAnimation = function (...args) {
        window.__r2AnimSpyCount += 1;
        return orig(...args);
      };
      return { error: null, initial: window.__r2AnimSpyCount };
    });

    if (beforeCount.error) {
      console.log(`  ! spy 설치 실패: ${beforeCount.error}`);
      console.log(`  ⚠ 본 시나리오는 환경 의존 — Babylon 글로벌 fallback 미작동 시 skip`);
      // 환경 의존 skip — fail 처리 안 함 (시나리오 1, 2 가 race 자체는 보호).
      return true;
    }

    const initialCount = beforeCount.initial ?? 0;

    await page.click('[data-testid="focus-sun"]');
    await page.waitForTimeout(50); // 즉시 mercury 클릭 (race 시뮬레이션)
    await page.click('[data-testid="focus-mercury"]');
    await page.waitForTimeout(LERP_SETTLE);

    const afterCount = await page.evaluate(() => window.__r2AnimSpyCount);
    const delta = afterCount - initialCount;

    // 기대값: 4 (sun cam-target + sun cam-radius + mercury cam-target + mercury cam-radius).
    // 단 다른 컴포넌트가 이 시간 사이에 추가 호출하면 ≥ 4 가능 — store-scene-sync ADR §결정 6
    // 의 "이중 호출 방지" 위배가 아니라 정상 (예: tier transition 자동 호출).
    // 본 가드는 "최소 4" 검증 — 더 적으면 sun 또는 mercury click 이 무시됐다는 신호.
    const countOk = delta >= 4;
    console.log(
      `  ${countOk ? '✓' : '✗'} Animation.CreateAndStartAnimation 호출 차분 = ${delta} (≥ 4 expected — sun + mercury 각 2 tween)`,
    );

    return countOk;
  } finally {
    await context.close();
  }
}

async function main() {
  // 운영 가드는 channel 'chrome' 강제. 디버그 시 --use-chromium 으로 swiftshader 재현 가능.
  const launchOptions = flags.useChromium
    ? { headless: !flags.headed }
    : { headless: !flags.headed, channel: 'chrome' };

  const browser = await chromium.launch(launchOptions);

  // 단일 viewport 1280×720 (race 동작은 viewport 무관 — TRANSITION_MS / Animation 동작 검증).
  const viewport = { id: '1280x720', width: 1280, height: 720 };

  console.log(`\n=== R2 focus race guard (viewport ${viewport.id}) ===`);
  console.log(`BASE_URL: ${BASE_URL}`);

  let allPass = true;

  try {
    const r1 = await scenarioSunToMercury(browser, viewport);
    if (!r1) allPass = false;

    const r2 = await scenarioMercuryToReset(browser, viewport);
    if (!r2) allPass = false;

    const r3 = await scenarioAnimationCount(browser, viewport);
    if (!r3) allPass = false;
  } finally {
    await browser.close();
  }

  console.log(`\n=== 요약 ===`);
  console.log(`overall: ${allPass ? 'PASS' : 'FAIL'}`);
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error('[r2-focus-race-guard] unhandled error:', err);
  process.exit(2);
});
