#!/usr/bin/env node
/**
 * #704 free-fly 카메라 감도 설정 회귀 가드 — 4축 슬라이더 → 런타임 카메라 거동 + localStorage 왕복.
 *
 * ADR `docs/decisions/20260618-704-freefly-sensitivity-settings-ui.md` §결정 5 (무회귀 = 축 5).
 *
 * 사용법:
 *   pnpm --filter @astro-simulator/web verify:704-sensitivity
 *   pnpm --filter @astro-simulator/web verify:704-sensitivity -- --json
 *
 * ## 검증 시나리오
 *
 * | S   | DoD (PASS)                                                                | 회귀 시                      |
 * |-----|---------------------------------------------------------------------------|------------------------------|
 * | S1  | 4축 슬라이더 변경 → 런타임 카메라 거동 변화 (zoom/panning/zoomout/wasd)    | 정적 const 잔존(미반영)      |
 * | S2  | 기본값 복원 → 4축 = 0.015/5/0.01/0.01 + 카메라 속성 default 환원          | reset 미동기화               |
 * | S3  | localStorage 왕복 — 변경 → reload 후 유지 + 손상값 주입 시 default 폴백   | 영속 미작동/손상값 흡수      |
 * | S4  | focus/reset 무회귀 — 감도 변경이 focus follow / reset 원복에 영향 0       | 감도 변경이 focus/reset 오염 |
 * | S5  | D-T2 — zoomoutFactor 가 줌아웃 한계 제어(upper=entryR×factor 유지) + 급락 0| gate 가 upper→1000 덮어쓰기   |
 * | S6  | body tier 줌아웃 — io/europa/titan 진입 점프 < 5× + body→solar setTier 0회 | escalation rescale 급락 부활  |
 *
 * ## S6 배경 (#704 body tier 줌아웃 급변 — forensic ADR `20260618-704-body-tier-zoomout-jump.md`)
 *
 * 외행성계 위성(io=목성계 5.2AU) focus → free-fly → 줌아웃 시, detachFocus 가 focus tracking 을
 * 해제하면 updateTierByCamera 가 tierFromCameraDistance(cameraFromSun) 경로를 탔다. io 는
 * cameraFromSun 이 본질적으로 solar 영역(5.2AU > solarUpper 3AU)이라 줌아웃 즉시 body→solar 직행
 * escalate → rescale 급락(measurement-first: io 158386→0.53 ≈ ×3.35e-6, 인접 프레임 비 ≈1530×)을
 * 유발해 "태양계 전체로 튕김" UX 회귀(D-T2). earth/default(inner/solar)는 cameraFromSun 정상 클램프라
 * 무영향(#704 B-1). [fix] body tier 진입 시 anchor(탐색 위성 id)를 updateTierByCamera 에 전달 → Core 가
 * anchor 기준 tierFromFocus 판정 → 위성 kind('moon')는 항상 body 반환 → 줌아웃해도 body 유지(escalate
 * 0, 위성 근방 보존). ADR §4 Concrete Prediction: 인접 프레임 radius 비 < 5× + body→solar setTier 0회.
 *
 * dev 빌드 의존: window.__simStore (freeFlySensitivity / setFreeFlySensitivity / reset /
 *               setSelectedBody / enterFreeFly) / window.__solarScene (meshes/activeCamera/getTier).
 * 환경변수: BASE_URL (기본 http://localhost:3000)
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const flags = { json: process.argv.slice(2).includes('--json') };
const VIEWPORT = { width: 1280, height: 720 };
const SETTLE_MS = 2500;
const STORAGE_KEY = 'astro:free-fly-sensitivity';
const SCHEMA_VERSION = 1;
// 4축 default (camera.ts const SSoT — store default 와 일치해야 함).
const DEFAULTS = { wasd: 0.015, zoomoutFactor: 5, panning: 0.01, zoom: 0.01 };

async function boot(page) {
  await page.goto(`${BASE_URL}/?gpu=a&lod=auto`, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForFunction(
    () => typeof window.__solarScene !== 'undefined' && typeof window.__simStore !== 'undefined',
    { timeout: 15_000 },
  );
  await page.waitForTimeout(SETTLE_MS);
}

// 카메라 + store 감도 스냅샷.
async function snapshot(page) {
  return page.evaluate(() => {
    const s = window.__simStore.getState();
    const solar = window.__solarScene;
    const cam = solar?.meshes?.values().next().value?.getScene()?.activeCamera;
    return {
      sensitivity: { ...s.freeFlySensitivity },
      wheelDeltaPercentage: cam?.wheelDeltaPercentage ?? null,
      pinchDeltaPercentage: cam?.pinchDeltaPercentage ?? null,
      panningSensibility: cam?.panningSensibility ?? null,
      upperRadiusLimit: cam?.upperRadiusLimit ?? null,
      radius: cam?.radius ?? null,
    };
  });
}

async function enterFreeFly(page) {
  await page.evaluate(() => window.__simStore.getState().enterFreeFly());
  await page.waitForTimeout(1200);
}
async function setAxis(page, axis, value, persist = true) {
  await page.evaluate(
    ({ axis, value, persist }) =>
      window.__simStore.getState().setFreeFlySensitivity(axis, value, persist),
    { axis, value, persist },
  );
  await page.waitForTimeout(300);
}

// S1 — 4축 슬라이더 변경 → 런타임 카메라 거동 변화.
//   zoom: camera.wheelDeltaPercentage / pinchDeltaPercentage = 새 값 (즉시 set).
//   panning: free-fly 활성 중 panningSensibility 가 새 값 비례로 변화 (값↑ = sensibility↓).
//   zoomoutFactor: free-fly 활성 중 upperRadiusLimit = entryRadius × factor 재산정.
//   wasd: getter pull — store 값이 바뀌면 다음 프레임부터 반영(여기선 store 값 반영만 확인).
async function scenarioRuntimeApply(browser) {
  console.log('\n[S1] 4축 슬라이더 → 런타임 카메라 거동 변화 (zoom/panning/zoomout/wasd)');
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await boot(page);
    await enterFreeFly(page);
    const before = await snapshot(page);
    // zoom — 0.01 → 0.025 (카메라 wheel/pinch 속성 즉시 set).
    await setAxis(page, 'zoom', 0.025);
    // panning — 0.01 → 0.02 (sensibility 절반 = 화면 px↔world 이동량 2배).
    await setAxis(page, 'panning', 0.02);
    // zoomoutFactor — 5 → 12 (upperRadiusLimit = entryRadius × 12 재산정).
    await setAxis(page, 'zoomoutFactor', 12);
    // wasd — 0.015 → 0.03 (store 반영, getter pull 로 다음 프레임부터 산식 적용).
    await setAxis(page, 'wasd', 0.03);
    await page.waitForTimeout(400);
    const after = await snapshot(page);

    const zoomOk =
      Math.abs(after.wheelDeltaPercentage - 0.025) < 1e-9 &&
      Math.abs(after.pinchDeltaPercentage - 0.025) < 1e-9;
    // panning sensibility 는 값↑ → sensibility↓ (반비례). before/after 둘 다 free-fly 활성이라 >0.
    const panningOk =
      before.panningSensibility > 0 &&
      after.panningSensibility > 0 &&
      after.panningSensibility < before.panningSensibility; // 0.02 > 0.01 → sensibility 작아짐.
    // upperRadiusLimit 가 factor 변경으로 증가 (5 → 12).
    const zoomoutOk = after.upperRadiusLimit > before.upperRadiusLimit * 1.5;
    const wasdOk = Math.abs(after.sensitivity.wasd - 0.03) < 1e-9;
    const pass = zoomOk && panningOk && zoomoutOk && wasdOk;
    console.log(
      `  zoom wheelΔ%=${after.wheelDeltaPercentage}(=0.025 ${zoomOk}) | panning sens ${before.panningSensibility?.toFixed(1)}→${after.panningSensibility?.toFixed(1)}(감소 ${panningOk}) | upperLimit ${before.upperRadiusLimit?.toExponential(2)}→${after.upperRadiusLimit?.toExponential(2)}(증가 ${zoomoutOk}) | wasd=${after.sensitivity.wasd}(=0.03 ${wasdOk}) → ${pass ? 'PASS' : 'FAIL'}`,
    );
    return { scenario: 'S1', before, after, zoomOk, panningOk, zoomoutOk, wasdOk, pass };
  } finally {
    await ctx.close();
  }
}

// S2 — 기본값 복원 → 4축 = default + 카메라 zoom 속성 default 환원.
async function scenarioResetDefaults(browser) {
  console.log('\n[S2] 기본값 복원 → 4축 = 0.015/5/0.01/0.01 + 카메라 zoom 속성 default');
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await boot(page);
    await enterFreeFly(page);
    // 4축 전부 비-default 로 변경 후 reset.
    await setAxis(page, 'wasd', 0.045);
    await setAxis(page, 'zoomoutFactor', 18);
    await setAxis(page, 'panning', 0.028);
    await setAxis(page, 'zoom', 0.028);
    await page.evaluate(() => window.__simStore.getState().resetFreeFlySensitivity());
    await page.waitForTimeout(500);
    const s = await snapshot(page);
    const axesOk =
      Math.abs(s.sensitivity.wasd - DEFAULTS.wasd) < 1e-9 &&
      Math.abs(s.sensitivity.zoomoutFactor - DEFAULTS.zoomoutFactor) < 1e-9 &&
      Math.abs(s.sensitivity.panning - DEFAULTS.panning) < 1e-9 &&
      Math.abs(s.sensitivity.zoom - DEFAULTS.zoom) < 1e-9;
    // 카메라 zoom 속성도 default 로 환원 (구독 push).
    const zoomPropOk = Math.abs(s.wheelDeltaPercentage - DEFAULTS.zoom) < 1e-9;
    const pass = axesOk && zoomPropOk;
    console.log(
      `  store=${JSON.stringify(s.sensitivity)} (default ${axesOk}) | wheelΔ%=${s.wheelDeltaPercentage}(=0.01 ${zoomPropOk}) → ${pass ? 'PASS' : 'FAIL'}`,
    );
    return { scenario: 'S2', sensitivity: s.sensitivity, axesOk, zoomPropOk, pass };
  } finally {
    await ctx.close();
  }
}

// S3 — localStorage 왕복: 변경(persist) → reload 후 유지 + 손상값 주입 시 default 폴백.
async function scenarioPersistence(browser) {
  console.log('\n[S3] localStorage 왕복 — 변경→reload 유지 + 손상값 주입 시 default 폴백');
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await boot(page);
    // (a) 변경 persist → reload → 유지.
    await setAxis(page, 'wasd', 0.04, true);
    await setAxis(page, 'zoomoutFactor', 14, true);
    await page.reload({ waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForFunction(() => typeof window.__simStore !== 'undefined', { timeout: 15_000 });
    await page.waitForTimeout(SETTLE_MS);
    const afterReload = await page.evaluate(() => ({
      ...window.__simStore.getState().freeFlySensitivity,
    }));
    const persistOk =
      Math.abs(afterReload.wasd - 0.04) < 1e-9 && Math.abs(afterReload.zoomoutFactor - 14) < 1e-9;

    // (b) 손상값 주입 → reload → 폴백/clamp 가드.
    //   - wasd 999 (범위 max 0.05 초과, 유한) → max clamp (0.05)
    //   - zoomoutFactor 'corrupt' (비-숫자 타입 손상) → default (5)
    //   - panning null (비-숫자) → default (0.01)
    //   - zoom 0 (유한이나 범위 min 0.005 미만) → min clamp (0.005)
    // 핵심: NaN/비-숫자는 default, 범위 이탈 유한값은 min/max clamp (둘 다 silent 흡수 아님 — 명시 정정).
    await page.evaluate(
      ({ key, version }) => {
        localStorage.setItem(
          key,
          JSON.stringify({
            version,
            value: { wasd: 999, zoomoutFactor: 'corrupt', panning: null, zoom: 0 },
          }),
        );
      },
      { key: STORAGE_KEY, version: SCHEMA_VERSION },
    );
    await page.reload({ waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForFunction(() => typeof window.__simStore !== 'undefined', { timeout: 15_000 });
    await page.waitForTimeout(SETTLE_MS);
    const afterCorrupt = await page.evaluate(() => ({
      ...window.__simStore.getState().freeFlySensitivity,
    }));
    // wasd 999 → max clamp / zoomoutFactor·panning 비-숫자 → default / zoom 0 → min clamp.
    // (NaN/비-숫자를 silent 흡수하면 FAIL — 명시 default/clamp 정정 검증.)
    const fallbackOk =
      afterCorrupt.wasd === 0.05 && // max clamp (유한 범위 초과)
      afterCorrupt.zoomoutFactor === DEFAULTS.zoomoutFactor && // 'corrupt' → default
      afterCorrupt.panning === DEFAULTS.panning && // null → default
      afterCorrupt.zoom === 0.005; // 0 (범위 min 미만) → min clamp
    const pass = persistOk && fallbackOk;
    console.log(
      `  reload 유지 wasd=${afterReload.wasd} zoomout=${afterReload.zoomoutFactor}(${persistOk}) | 손상 주입→폴백 ${JSON.stringify(afterCorrupt)}(${fallbackOk}) → ${pass ? 'PASS' : 'FAIL'}`,
    );
    return { scenario: 'S3', afterReload, afterCorrupt, persistOk, fallbackOk, pass };
  } finally {
    await ctx.close();
  }
}

// S4 — focus/reset 무회귀: 감도 변경 후 focus 진입 → follow 정상(panning=0) / reset → target 원점 복원.
async function scenarioNoRegression(browser) {
  console.log('\n[S4] focus/reset 무회귀 — 감도 변경이 focus follow / reset 원복에 영향 0');
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await boot(page);
    // 감도 4축 비-default 로 변경 (무회귀 = 변경 상태에서도 focus/reset 정상).
    await enterFreeFly(page);
    await setAxis(page, 'panning', 0.025);
    await setAxis(page, 'zoom', 0.02);
    // focus 진입 → panningSensibility=0 (focus follow, #693 무회귀).
    await page.evaluate(() => window.__simStore.getState().setSelectedBody('earth'));
    await page.waitForTimeout(SETTLE_MS);
    const focusSnap = await snapshot(page);
    const focusPanningOff = focusSnap.panningSensibility === 0;
    // zoom 속성은 사용자 변경값 유지 (focus 중에도 줌 동일 속성 — 거동 모델 불변, 회귀 아님).
    const zoomPreserved = Math.abs(focusSnap.wheelDeltaPercentage - 0.02) < 1e-9;
    // reset → target 원점 복원.
    await page.evaluate(() => window.__simStore.getState().setSelectedBody(null));
    await page.waitForTimeout(SETTLE_MS);
    const resetSnap = await page.evaluate(() => {
      const solar = window.__solarScene;
      const cam = solar?.meshes?.values().next().value?.getScene()?.activeCamera;
      const t = cam?.target;
      return { targetDist: t ? Math.hypot(t.x, t.y, t.z) : null, panning: cam?.panningSensibility };
    });
    const resetOk =
      resetSnap.targetDist !== null && resetSnap.targetDist < 1 && resetSnap.panning === 0;
    const pass = focusPanningOff && zoomPreserved && resetOk;
    console.log(
      `  focus panning=${focusSnap.panningSensibility}(=0 ${focusPanningOff}) zoom유지=${focusSnap.wheelDeltaPercentage}(=0.02 ${zoomPreserved}) | reset targetDist=${resetSnap.targetDist?.toFixed(2)} panning=${resetSnap.panning}(원복 ${resetOk}) → ${pass ? 'PASS' : 'FAIL'}`,
    );
    return { scenario: 'S4', focusSnap, resetSnap, focusPanningOff, zoomPreserved, resetOk, pass };
  } finally {
    await ctx.close();
  }
}

// S5 — #704 D-T2 회귀 가드: zoomoutFactor 가 줌아웃 한계를 실제 제어 + escalation 급락 제거.
//
// [회귀 검출 원리] 구 escalation gate 는 진입 ×1.15 줌아웃 시 upperRadiusLimit 을 즉시
// SOLAR_ZOOMOUT_LIMIT(1000)으로 덮어쓰고 freeFlyEntryRadius=null 로 만들어, 사용자 zoomoutFactor
// 설정을 무력화 + radius 가 solar escalation 임계(≈690)를 넘어 rescale 급락(690→40, 17×)을 냈다.
// fix 후: factor=5(default)면 upper=entryRadius×5(≈340) 유지 + radius 가 그 한계에서 멈춰
// escalation 미발생(tier 불변) → 급락 0. earth focus(진입 radius≈68) 기준 측정.
async function scenarioZoomoutCeilingControl(browser) {
  console.log(
    '\n[S5] D-T2 회귀 — zoomoutFactor 가 줌아웃 한계 제어 + escalation 급락 제거 (factor=5)',
  );
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await boot(page);
    // factor=5(default) 명시 + earth focus → free-fly.
    await setAxis(page, 'zoomoutFactor', 5, true);
    await page.evaluate(() => window.__simStore.getState().setSelectedBody('earth'));
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.__simStore.getState().enterFreeFly());
    await page.waitForTimeout(400);
    const entry = await snapshot(page);
    const entryRadius = entry.radius;
    const expectedUpper = entryRadius * 5;

    // 휠 줌아웃 24회 — factor=5 한계(≈340)를 충분히 넘기는 입력량. 각 스텝 radius/upper/tier 기록.
    let maxJumpRatio = 1;
    let prevRadius = entryRadius;
    let escalated = false;
    let lastSnap = entry;
    for (let i = 0; i < 24; i++) {
      await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(150);
      lastSnap = await snapshot(page);
      const r = lastSnap.radius;
      if (r !== null && prevRadius !== null && prevRadius > 0) {
        const ratio = Math.max(r / prevRadius, prevRadius / r);
        if (ratio > maxJumpRatio) maxJumpRatio = ratio;
        prevRadius = r;
      }
    }
    // tier 가 escalate 했는지 (inner → solar) — solar.getTier() 로 확인.
    const finalTier = await page.evaluate(() => window.__solarScene?.getTier?.() ?? null);
    escalated = finalTier !== 'inner';

    // (1) upper 가 entryRadius×5 로 유지 (1000 으로 덮어쓰지 않음). 허용 오차 ±2%.
    const ceilingOk =
      lastSnap.upperRadiusLimit !== null &&
      Math.abs(lastSnap.upperRadiusLimit - expectedUpper) / expectedUpper < 0.02;
    // (2) radius 가 한계(≈340)에서 멈춤 — 마지막 radius ≤ upper×1.02.
    const clampedOk =
      lastSnap.radius !== null && lastSnap.radius <= lastSnap.upperRadiusLimit * 1.02;
    // (3) escalation 급락 제거 — 줌아웃 시퀀스 중 radius 급변(>2×) 없음 + tier 불변.
    const noJumpOk = maxJumpRatio < 2 && !escalated;
    const pass = ceilingOk && clampedOk && noJumpOk;
    console.log(
      `  진입 radius=${entryRadius?.toFixed(1)} → 줌아웃 24회: upper=${lastSnap.upperRadiusLimit?.toFixed(0)}(=${expectedUpper.toFixed(0)} ${ceilingOk}) radius=${lastSnap.radius?.toFixed(1)}(clamp ${clampedOk}) maxJump=${maxJumpRatio.toFixed(2)}× tier=${finalTier}(급락없음 ${noJumpOk}) → ${pass ? 'PASS' : 'FAIL'}`,
    );
    return {
      scenario: 'S5',
      entryRadius,
      expectedUpper,
      finalUpper: lastSnap.upperRadiusLimit,
      finalRadius: lastSnap.radius,
      maxJumpRatio,
      finalTier,
      ceilingOk,
      clampedOk,
      noJumpOk,
      pass,
    };
  } finally {
    await ctx.close();
  }
}

// S6 — body tier 줌아웃 급변 가드 (#704 forensic ADR §4 Concrete Prediction).
//
// body tier(외행성 위성 io/europa/titan) focus → free-fly → 줌아웃 sweep 의 인접 프레임 radius 비
// (점프 배율) < 5× + body→solar setTier 0회 + 좌표 NaN 0. earth(inner)/default(solar) 대조 셀은
// escalate 0(클램프) 무회귀 확인. anchor 기준 판정 회귀 시 io 가 줌아웃 즉시 body→solar 직행하며
// 점프 배율 > 1000× → FAIL.
const BODY_TIER_JUMP_MAX = 5; // 인접 프레임 radius 비 상한 (ADR Concrete Prediction).
const S6_WHEEL_TICKS = 40;
async function scenarioBodyTierZoomout(browser) {
  console.log(
    '\n[S6] body tier 줌아웃 — io/europa/titan 진입 점프 < 5× + body→solar setTier 0회 + NaN 0',
  );
  // body tier(위성) — 줌아웃해도 body 유지 + 점프 < 5×. earth/default 대조 셀(escalate 0 무회귀).
  const cases = [
    { label: 'io(body,5.2AU)', id: 'io', expectTier: 'body', expectNoEscalate: true },
    { label: 'europa(body,5.2AU)', id: 'europa', expectTier: 'body', expectNoEscalate: true },
    { label: 'titan(body,9.5AU)', id: 'titan', expectTier: 'body', expectNoEscalate: true },
    { label: 'earth(inner,대조)', id: 'earth', expectTier: 'inner', expectNoEscalate: true },
    { label: 'default(solar,대조)', id: null, expectTier: 'solar', expectNoEscalate: true },
  ];
  const sample = (page) =>
    page.evaluate(() => {
      const solar = window.__solarScene;
      const cam = solar?.meshes?.values().next().value?.getScene()?.activeCamera;
      const t = cam?.target;
      const g = cam?.globalPosition;
      return {
        tier: solar.getTier(),
        radius: cam?.radius ?? 0,
        nan:
          !!cam &&
          (Number.isNaN(g.x) ||
            Number.isNaN(g.y) ||
            Number.isNaN(g.z) ||
            (t && (Number.isNaN(t.x) || Number.isNaN(t.y) || Number.isNaN(t.z)))),
      };
    });
  const rows = [];
  let pass = true;
  for (const c of cases) {
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    try {
      await boot(page);
      if (c.id) {
        await page.evaluate((id) => window.__simStore.getState().setSelectedBody(id), c.id);
        await page.waitForTimeout(SETTLE_MS);
      }
      await page.evaluate(() => window.__simStore.getState().enterFreeFly());
      await page.waitForTimeout(1200);
      const seq = [await sample(page)];
      await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
      for (let i = 0; i < S6_WHEEL_TICKS; i += 1) {
        await page.mouse.wheel(0, 120);
        await page.waitForTimeout(70);
        seq.push(await sample(page));
      }
      // 인접 프레임 radius 점프 배율 max + body→solar setTier 횟수 + NaN.
      let maxJump = 1;
      let bodyToSolar = 0;
      let anyNaN = false;
      for (let i = 1; i < seq.length; i += 1) {
        const r0 = seq[i - 1].radius || 1e-9;
        const r1 = seq[i].radius || 1e-9;
        maxJump = Math.max(maxJump, r0 / r1, r1 / r0);
        if (seq[i - 1].tier === 'body' && seq[i].tier === 'solar') bodyToSolar += 1;
        if (seq[i].nan) anyNaN = true;
      }
      const finalTier = seq[seq.length - 1].tier;
      // 위성 셀: body 유지 + 점프 < 5× + escalate 0 + NaN 0.
      // 대조 셀(earth/default): tier 유지(escalate 0) + 점프 < 5× + NaN 0.
      const jumpOk = maxJump < BODY_TIER_JUMP_MAX;
      const tierOk = finalTier === c.expectTier;
      const escalateOk = bodyToSolar === 0;
      const nanOk = !anyNaN;
      const ok = jumpOk && tierOk && escalateOk && nanOk;
      if (!ok) pass = false;
      rows.push({ label: c.label, maxJump, bodyToSolar, finalTier, anyNaN, ok });
      console.log(
        `  ${c.label}: maxJump=${maxJump.toExponential(2)}×(<${BODY_TIER_JUMP_MAX} ${jumpOk}) body→solar=${bodyToSolar}(=0 ${escalateOk}) tier=${finalTier}(=${c.expectTier} ${tierOk}) NaN=${anyNaN}(${nanOk}) → ${ok ? 'PASS' : 'FAIL'}`,
      );
    } finally {
      await ctx.close();
    }
  }
  return { scenario: 'S6', rows, pass };
}

async function main() {
  console.log('\n=== #704 free-fly 감도 설정 회귀 가드 ===');
  console.log(`  base URL: ${BASE_URL}`);
  const browser = await chromium.launch({ headless: true });
  const result = { timestamp: new Date().toISOString(), baseUrl: BASE_URL, scenarios: {} };
  let allPass = true;
  try {
    result.scenarios.s1 = await scenarioRuntimeApply(browser);
    if (!result.scenarios.s1.pass) allPass = false;
    result.scenarios.s2 = await scenarioResetDefaults(browser);
    if (!result.scenarios.s2.pass) allPass = false;
    result.scenarios.s3 = await scenarioPersistence(browser);
    if (!result.scenarios.s3.pass) allPass = false;
    result.scenarios.s4 = await scenarioNoRegression(browser);
    if (!result.scenarios.s4.pass) allPass = false;
    result.scenarios.s5 = await scenarioZoomoutCeilingControl(browser);
    if (!result.scenarios.s5.pass) allPass = false;
    result.scenarios.s6 = await scenarioBodyTierZoomout(browser);
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
