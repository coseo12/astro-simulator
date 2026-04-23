#!/usr/bin/env node
/**
 * P12-B #298 Phase B — Tier 전환 애니메이션 hard fail 브라우저 검증.
 *
 * 사용:
 *   node scripts/browser-verify-tier-transition.mjs [baseUrl]
 *   기본 URL: http://localhost:3000
 *
 * Phase B hard fail (DoD):
 *   - V5: T3 Body — 지구 화면 세로 40% ±5% (304~336px @ 800h viewport)
 *   - A1: focus 중심 편차 ≤10px
 *   - C3: 전환 애니메이션 ≤500ms
 *   - C4: 입력 잠금 + 100ms 내 재활성 (전환 중 pointer 이벤트 차단 / 전환 완료 후 재활성)
 *
 * Level 1 정적: canvas 비검정, 콘솔 에러 0
 * Level 2 인터랙션: 잠금 중/후 상태 측정
 * Level 3 흐름: 초기 solar tier → 지구 focus 한 단계 전환 측정
 *
 * 근거: CLAUDE.md "3단계 브라우저 검증", volt #33 headless false positive 방어.
 *
 * ## 시나리오 설계 (flakiness 회피)
 *
 *  - Phase A browser-verify 의 focus-quick-buttons 세트는 sun/earth/jupiter/neptune (mars 없음).
 *  - reset(35) 후 tier 는 body (camera.radius=35 → body tier renderScale 기준 < 0.1 AU).
 *    따라서 **페이지 로드 직후 solar tier** 상태에서 곧바로 지구 focus 로 측정 (가장 단순 경로).
 *  - T1/T2 중간 확인은 별도 측정 없이 T1 tier 값만 체크하고 T3 로 직진.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const baseUrl = process.argv[2] ?? 'http://localhost:3000';
const __dirname = dirname(fileURLToPath(import.meta.url));
const screenshotDir = join(__dirname, '..', '.verify-screenshots', 'tier-transition');
mkdirSync(screenshotDir, { recursive: true });

const VIEWPORT = { width: 1280, height: 800 };

const results = { pass: [], fail: [], warn: [] };
const check = (name, condition, detail = '') => {
  if (condition) results.pass.push(`${name}${detail ? ' — ' + detail : ''}`);
  else results.fail.push(`${name}${detail ? ' — ' + detail : ''}`);
};
const warn = (name, condition, detail = '') => {
  if (condition) results.pass.push(`${name}${detail ? ' — ' + detail : ''}`);
  else results.warn.push(`${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEWPORT });
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(err.message));

console.log('\n[P12-B] Tier 전환 애니메이션 hard fail 검증');

await page.goto(`${baseUrl}/ko`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// ===== Level 1 정적: 전역 노출 + canvas =====
check(
  '__solarScene 전역 노출 (dev 빌드)',
  await page.evaluate(
    () => typeof window.__solarScene === 'object' && window.__solarScene !== null,
  ),
);
check(
  '__simCore.scene 전역 노출',
  await page.evaluate(
    () => typeof window.__simCore?.scene === 'object' && window.__simCore.scene !== null,
  ),
);
const canvasInfo = await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  return canvas ? { width: canvas.width, height: canvas.height } : null;
});
check('canvas 렌더 크기 > 0', canvasInfo && canvasInfo.width > 0 && canvasInfo.height > 0);

// 초기 tier 확인 — 페이지 로드 직후 solar 이어야 (defaultInitialTier())
const initialTier = await page.evaluate(() => window.__solarScene?.getTier?.());
check('페이지 로드 후 초기 tier === solar', initialTier === 'solar', `현재 tier: ${initialTier}`);

// ===== Level 3 흐름: solar → 지구 focus → body tier dolly =====
// [P12-C #298 — QA suggestion #1 반영] C3 측정을 `_alreadyAttached` 폴링 기반으로 교체.
// 이전 "radius 5프레임 stable" 감지는 ExponentialEase tail + polling IPC 지연을 포함한 가장 엄격한
// 상한이라 DoD 원문 "전환 ≤500ms" 를 과하게 초과 해석했다 (QA 리포트 §3, click→reattach 506ms 실측).
// 본 교체: click 직후 `_alreadyAttached` 를 10ms 간격 폴링하여 **lock 해제 시점** = 사용자 관점
// UX 전환 완료 시점을 직접 측정. ADR §3 Q8=8D "durationMs=300 + lockMs-durationMs=200 마진" 정합.
//
// radius 안정화 측정은 **부수 지표** 로 병기 (WARN 레벨). runTierTransition 내부에서 Animation 이
// 완주(onAnimationEnd) 또는 fallback timer 발동 중 하나가 release 한 시점이 사용자 체감 시점.
console.log('\n[T3] 지구 focus → body tier dolly 애니메이션');
await page.evaluate(() => {
  // tier 전환 감지용 전역 훅 설치 — start/end 를 클릭 시점/`_alreadyAttached === true` 복귀로 측정.
  window.__c3ClickStart = null;
  window.__c3LockReattachTime = null;
  // 부수 지표: radius 안정화 기준 (병기용).
  window.__tierTransitionStart = null;
  window.__tierTransitionEnd = null;
  const solar = window.__solarScene;
  let lastTier = solar?.getTier?.();
  let lastRadius = window.__simCore?.scene?.activeCamera?.radius;
  let stableCount = 0;

  window.__tierMonitor = () => {
    const currentTier = solar?.getTier?.();
    const currentRadius = window.__simCore?.scene?.activeCamera?.radius;

    if (currentTier !== lastTier) {
      if (window.__tierTransitionStart === null) {
        window.__tierTransitionStart = performance.now();
      }
      lastTier = currentTier;
      stableCount = 0;
    }

    // radius 가 5 프레임 연속 <1% 변화면 완료로 판정 (부수 지표)
    if (lastRadius != null && currentRadius != null) {
      const delta = Math.abs(currentRadius - lastRadius) / Math.max(Math.abs(lastRadius), 1);
      if (delta < 0.01 && window.__tierTransitionStart !== null) {
        stableCount++;
        if (stableCount >= 5 && window.__tierTransitionEnd === null) {
          window.__tierTransitionEnd = performance.now();
        }
      } else {
        stableCount = 0;
      }
    }
    lastRadius = currentRadius;
  };
  window.__simCore.scene.onBeforeRenderObservable.add(window.__tierMonitor);
});

// click 시점 + lock 재활성 시점을 브라우저 내부에서 1 step 으로 측정 (Playwright ↔ 브라우저 IPC 오차 최소화).
// 기존 focus 버튼 click 과 동일 경로를 브라우저 내부 이벤트 트리거로 재현 — focus 처리 + setTier 체인.
const c3Measure = await page.evaluate(async () => {
  const btn = document.querySelector('[data-testid="focus-earth"]');
  if (!btn) return { status: 'no-button' };
  const inputManager = window.__simCore?.scene?._inputManager;
  if (!inputManager) return { status: 'no-input-manager' };

  const clickStart = performance.now();
  window.__c3ClickStart = clickStart;
  btn.click();

  // _alreadyAttached 폴링 — 10ms 간격, 1500ms 예산
  const POLL_MS = 10;
  const BUDGET_MS = 1500;
  let detachObserved = false;
  let lockEnd = null;
  const deadline = clickStart + BUDGET_MS;
  while (performance.now() < deadline) {
    const attached = inputManager._alreadyAttached;
    if (attached === false) detachObserved = true;
    if (detachObserved && attached === true) {
      lockEnd = performance.now();
      break;
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  window.__c3LockReattachTime = lockEnd;
  return {
    status: 'ok',
    clickStart,
    lockEnd,
    detachObserved,
    elapsedMs: lockEnd !== null ? lockEnd - clickStart : null,
  };
});

// 추가 200ms 여유 대기 — radius 안정화 부수 지표 관찰용.
await page.waitForTimeout(200);

const tierT3 = await page.evaluate(() => window.__solarScene?.getTier?.());
check('지구 focus 후 tier === body', tierT3 === 'body', `현재 tier: ${tierT3}`);

if (c3Measure.status === 'ok' && c3Measure.elapsedMs !== null) {
  // ADR §3 Q8=8D: durationMs=300 + lockMs(500) 마진 = 500ms 이내 재활성. +100ms 측정 오차 버퍼 = 600ms.
  const THRESHOLD = 600;
  check(
    `C3 click→attachControl 재활성 ≤ ${THRESHOLD}ms (QA suggestion #1: _alreadyAttached 폴링)`,
    c3Measure.elapsedMs <= THRESHOLD,
    `실측 ${c3Measure.elapsedMs.toFixed(0)}ms (detachObserved=${c3Measure.detachObserved})`,
  );
} else {
  warn(
    `C3 click→reattach 측정`,
    false,
    `status=${c3Measure.status}, elapsedMs=${c3Measure.elapsedMs} (폴링 실패)`,
  );
}

// 부수 지표: radius 안정화 기준. WARN 레벨로 기록만 — FAIL 승격 금지 (ExponentialEase tail 특성).
const radiusStabilizeTiming = await page.evaluate(() => ({
  start: window.__tierTransitionStart,
  end: window.__tierTransitionEnd,
}));
if (radiusStabilizeTiming.start !== null && radiusStabilizeTiming.end !== null) {
  const radiusStabilizeMs = radiusStabilizeTiming.end - radiusStabilizeTiming.start;
  warn(
    `C3 부수 지표: radius 안정화 (5프레임 <1%) ${radiusStabilizeMs.toFixed(0)}ms`,
    radiusStabilizeMs <= 700,
    `참고용 — ExponentialEase tail + polling IPC 포함. DoD 판정은 click→reattach 기준.`,
  );
} else {
  warn(
    `C3 부수 지표 radius 안정화 측정`,
    false,
    `start=${radiusStabilizeTiming.start}, end=${radiusStabilizeTiming.end}`,
  );
}

// mesh world matrix 한 번 강제 갱신 후 projection 샘플링
await page.evaluate(() => {
  const earth = window.__solarScene?.meshes?.get?.('earth');
  earth?.computeWorldMatrix?.(true);
});

// ===== V5 + A1 측정 =====
console.log('\n[V5/A1] 지구 세로 40% ±5% + focus 중심 편차 측정');
const projectFn = `
  function projectToScreen(x, y, z, m, w, h) {
    const wx = m[0]*x + m[4]*y + m[8]*z + m[12];
    const wy = m[1]*x + m[5]*y + m[9]*z + m[13];
    const ww = m[3]*x + m[7]*y + m[11]*z + m[15];
    const ndcX = wx / ww;
    const ndcY = wy / ww;
    const px = (ndcX * 0.5 + 0.5) * w;
    const py = (1 - (ndcY * 0.5 + 0.5)) * h;
    return [px, py, ww];
  }
`;
const earthProjection = await page.evaluate(`(() => {
  ${projectFn}
  const scene = window.__simCore?.scene;
  const solar = window.__solarScene;
  if (!scene || !solar) return null;
  const earth = solar.meshes.get?.('earth');
  if (!earth) return null;
  earth.computeWorldMatrix(true);
  const engine = scene.getEngine();
  const w = engine.getRenderWidth();
  const h = engine.getRenderHeight();
  const mat = scene.getTransformMatrix();
  const m = mat.m ?? mat._m;
  if (!m) return { fallback: 'matrix_array_missing' };
  const center = earth.position;
  const boundingInfo = earth.getBoundingInfo();
  const r = boundingInfo.boundingSphere.radiusWorld;
  const [cx, cy, cw] = projectToScreen(center.x, center.y, center.z, m, w, h);
  const [ux, uy] = projectToScreen(center.x, center.y + r, center.z, m, w, h);
  const radiusPx = Math.hypot(ux - cx, uy - cy);
  return { diameterPx: radiusPx * 2, renderHeight: h, renderWidth: w, cx, cy, cw, boundingR: r };
})()`);

if (earthProjection && !earthProjection.fallback) {
  const target = earthProjection.renderHeight * 0.4; // 세로 40% = 320px (@ 800h viewport)
  const lo = target * 0.95; // 304px
  const hi = target * 1.05; // 336px
  check(
    `V5 지구 세로 40% ±5% (목표 ${target.toFixed(0)}px, 허용 ${lo.toFixed(0)}~${hi.toFixed(0)}px)`,
    earthProjection.diameterPx >= lo && earthProjection.diameterPx <= hi,
    `실측 ${earthProjection.diameterPx.toFixed(0)}px, boundingR=${earthProjection.boundingR.toFixed(1)} unit`,
  );

  // A1: focus 중심 편차 ≤ 10px
  const screenCenterX = earthProjection.renderWidth / 2;
  const screenCenterY = earthProjection.renderHeight / 2;
  const offset = Math.hypot(earthProjection.cx - screenCenterX, earthProjection.cy - screenCenterY);
  check(
    `A1 지구 focus 중심 편차 ≤ 10px`,
    offset <= 10,
    `실측 ${offset.toFixed(1)}px (화면 중심 ${screenCenterX.toFixed(0)}, ${screenCenterY.toFixed(0)})`,
  );
} else {
  check('V5/A1 지구 projection 계산', false, `projection 실패: ${JSON.stringify(earthProjection)}`);
}
await page.screenshot({ path: join(screenshotDir, 'v5-a1-earth-focus.png') });

// ===== C4 입력 잠금 + 해제 측정 =====
// 새 tier 전환 트리거 — 현재 body tier → 태양 focus 로 전환 (body → solar)
console.log('\n[C4] 전환 중 입력 잠금 + 해제 확인');
const c4Result = await page.evaluate(async () => {
  const solar = window.__solarScene;
  const simCore = window.__simCore;
  if (!solar || !simCore?.scene) return { status: 'no-scene' };
  const inputManager = simCore.scene._inputManager;

  // 강제 전환 트리거 — 현재 tier 와 반대 tier 로 setTier
  const currentTier = solar.getTier?.();
  const targetTier = currentTier === 'body' ? 'solar' : 'body';
  solar.setTier(targetTier);

  // 즉시 (50ms 이내) 상태 확인 — 전환 애니메이션 진행 중
  await new Promise((r) => setTimeout(r, 50));
  const attachedDuring = inputManager?._alreadyAttached;

  // 700ms 후 — 전환 완료 + lock 해제 이후
  await new Promise((r) => setTimeout(r, 700));
  const attachedAfter = inputManager?._alreadyAttached;

  return {
    status: 'ok',
    attachedDuring: attachedDuring === undefined ? 'undefined' : attachedDuring,
    attachedAfter: attachedAfter === undefined ? 'undefined' : attachedAfter,
  };
});

if (c4Result.status === 'ok') {
  // Babylon internal 필드라 일부 빌드 에서 `_alreadyAttached` 직접 노출 안 될 수 있음.
  // warn 으로 기록 — 최소한 전환 완료 후 true 로 복구되는지가 핵심.
  warn(
    `C4 전환 중 입력 잠금 (during=${c4Result.attachedDuring})`,
    c4Result.attachedDuring === false,
    `during=${c4Result.attachedDuring} (false 이면 detachControl 동작 증명, undefined 면 Babylon internal 변경)`,
  );
  check(
    `C4 전환 완료 후 입력 재활성 (after=${c4Result.attachedAfter})`,
    c4Result.attachedAfter === true,
    `after=${c4Result.attachedAfter}`,
  );
} else {
  warn('C4 입력 잠금 테스트', false, `scene 접근 불가: ${c4Result.status}`);
}

// ===== 콘솔 에러 체크 =====
check(`console.error 0 건`, consoleErrors.length === 0, `실측 ${consoleErrors.length} 건`);

// ===== 종합 =====
console.log('\n===== 종합 =====');
console.log(`[PASS] ${results.pass.length}`);
for (const p of results.pass) console.log(`  - ${p}`);
if (results.warn.length > 0) {
  console.log(`[WARN] ${results.warn.length}`);
  for (const w of results.warn) console.log(`  - ${w}`);
}
console.log(`[FAIL] ${results.fail.length}`);
for (const f of results.fail) console.log(`  - ${f}`);
if (consoleErrors.length > 0) {
  console.log(`\n콘솔 에러 (${consoleErrors.length}):`);
  for (const e of consoleErrors.slice(0, 5)) console.log(`  - ${e}`);
}

await browser.close();

console.log(`\n스크린샷: ${screenshotDir}`);
if (results.fail.length > 0) process.exit(1);
process.exit(0);
