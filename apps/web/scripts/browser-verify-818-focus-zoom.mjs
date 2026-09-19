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
 * ## S4 — earth 경계 왕복 · 관성 생존 (#1232, ADR 380 §Amendment 3 A3.6 8~11)
 *
 * S1~S3 은 iter 사이 settle 로 **관성이 빠진 상태**를 재고, S3 earth 는 줌인 전용이라 #1232 의
 * 두 결함 (줌인 전환 프레임 흔들림 / 줌아웃 관성 잔량 이탈) 이 둘 다 통과했다. S4 는 매 **렌더
 * 프레임**을 `scene.onAfterRenderObservable` 로 기록해 전환 프레임을 직접 본다. 판정은 전부
 * tier-불변 실거리 (`radius / RENDER_SCALE[tier] / AU`) 로 한다.
 *
 * | 단계 | 설정 | 판정 |
 * |---|---|---|
 * | S4c 대조군 (줌아웃) | inner `0.2 AU` → `+120` × 4틱 (50 ms) → 3 s | `F_c` = 최종/시작 (경계 없음) |
 * | S4a D1 | `?focus=earth` inner → `−120` 50 ms 연속, body 전환 시 중단 → 800 ms | `min(실거리[ci], 실거리[ci+1]) ≥ 0.08 AU` ∧ `ci~ci+30` 의 `r == lowerRadiusLimit` 프레임 0 (tier 무관) ∧ 추가 전이 0 |
 * | S4b D2·D3 (줌아웃 통과군) | body `0.097 AU` → S4c 와 같은 4틱 → 3 s | D2 `maxPost / (x₀ × F_c) ≤ 1.05` · D3 `|ln F_x / ln F_c − 1| ≤ 0.10` |
 * | S4e 대조군 (줌인) | inner `0.2 AU` → `−120` × 4틱 → 3 s | `F_c↓` |
 * | S4d D3 (줌인 통과군) | inner `S4D_START_AU` → S4e 와 같은 4틱 → 3 s | `|ln F_x / ln F_c↓ − 1| ≤ 0.10` (D3 임계 재사용 — 새 임계 0개) |
 *
 * **계약 재조정 (사용자 승인 2026-09-19, #1232 코멘트) — D2·D3 은 수치를 그대로 두고 측정량만 바꿨다.**
 *  - D2 「기대 r」 = 대조군 예측 `x₀ × F_c`. 이슈 본문의 `r_pre × newScale/oldScale` 은 관성이 **옳게**
 *    이어지는 판본을 FAIL (`×1.066`), 관성을 tween 이 먹는 판본을 PASS (`×1.014`) 시킨다 — 틀린 설계를
 *    고르는 측정량이라 쓰지 않는다. 휠 줌은 `wheelDeltaPercentage` 라 배율이 시작 거리와 무관 (곱셈적)
 *    이므로 같은 틱 묶음의 경계 없는 배율 `F_c` 가 기대 배율이다. `maxPost` (전환 프레임 이후 최댓값)
 *    로 정착과 과도 (전환 프레임 튐) 를 한 술어로 잡는다.
 *  - D3 「줌 속도」 = 틱 묶음의 로그 배율 비. 시간창 속도 (`ln 실거리 / s`) 는 body tier 렌더 부하로
 *    Playwright 틱 처리량이 tier 마다 달라 옳은 판본에서도 경계 후가 `+9 ~ +22 %` 계통적으로 빠르다 —
 *    재는 것이 줌이 아니라 프레임 부하다.
 *  - 설정값 근거: `0.097 AU` 는 4틱 묶음 (`×1.275`) 의 약 70 % 지점에서 줌아웃 경계 (`0.115 AU`) 를
 *    넘겨 전환 순간 관성이 크다. 경계를 관성 꼬리에서 넘기면 「관성 0 대입」 변이가 통과한다
 *    (`0.075 AU` · 8틱 → `−9.1 %`, 판별력 소실 — ADR A3.6 10 항 architect 실측).
 *
 * **전제 (fail-closed, exit 2)** — 하네스가 통제하는 설정만 묻는다: 통과군 **기대 방향 전이 ≥ 1** /
 * 대조군 전이 0회 / 설정 직후 tier 가 기대값 / 기록 프레임 > 0 / D1 창의 `lowerRadiusLimit` 기록.
 * 하나라도 어긋나면 FAIL 이 아니라 **전제 위반**으로 exit 2 (공허 통과 금지). 측정 오류 (mesh 부재 등)
 * 도 exit 2 다.
 *
 * **추가 전이는 FAIL (exit 1)** — 기대 전이 뒤에 다시 되돌아오는 전이 (경계 진동) 는 하네스가 아니라
 * 제품 결함이다 (#1232 reviewer 권고 1(가)). 전제에 넣으면 결함이 전제 위반 뒤에 숨는다.
 *
 * **종료 코드 합성** — 확정 FAIL 이 어느 시나리오에든 있으면 exit 1 이 우선한다. S4 의 전제 위반이
 * 독립 시나리오 S1~S3 의 FAIL 을 exit 2 로 가리지 않는다 (권고 1(나)).
 *
 * **진단값** — 기록기가 매 프레임 `engine.getDeltaTime()` 을 남기고 D1 출력에 `dt[ci]`·`dt[ci+1]` 를
 * 찍는다. D1 의 `ci+1` 은 경계 `0.085 AU` 에서 관성 1프레임 분 내려간 값이라 프레임 간격에 걸려
 * 있다 (여유 ≈3 %, ~32 fps 아래에서 수정판도 `< 0.08` 가능). 판정식·임계는 계약 그대로 두고, FAIL 시
 * 프레임 간격 문제인지 결함 (`5.2e-6 AU`, 4자릿수 차) 인지 가르는 용도다 (권고 3).
 *
 * dev 빌드 의존: window.__solarScene (meshes Map / getTier) + window.__simStore (setSelectedBody)
 * 환경변수: BASE_URL (기본 http://localhost:3000) / CAPTURE_DIR (PNG 저장, 미지정 시 생략)
 * 플래그: `--json` / `--only=s4` (S4 만 실행 — 변이 테스트용. 전체 판정은 플래그 없이)
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { withBrowser } from '../../../scripts/browser-verify-utils.mjs';
import {
  AU,
  RENDER_SCALE,
  drainFrameRecorder,
  installFrameRecorder,
  tierTransitions,
} from './tier-frame-recorder.mjs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const CAPTURE_DIR = process.env.CAPTURE_DIR ?? '';
const args = process.argv.slice(2);
const flags = {
  json: args.includes('--json'),
  onlyS4: args.includes('--only=s4'),
};

const VIEWPORT = { width: 1280, height: 720 };
const SETTLE_MS = 2500;
// AU · RENDER_SCALE (tier.ts SSoT 사본) 은 `tier-frame-recorder.mjs` 로 이관 — 380 S2 와 공용 (#1232).

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

// ─── S4 — earth 경계 왕복 · 관성 생존 (#1232) ────────────────────────────────

// D1 — 전환 프레임 ci · ci+1 실거리 하한 (AU). 계약 D1 수치.
const S4_D1_MIN_AU = 0.08;
// D1 — clamp 탐색 창 (ci ~ ci+CLAMP_WINDOW 프레임).
const S4_CLAMP_WINDOW = 30;
// D1 — `r == lowerRadiusLimit` 판정 상대 허용 (부동소수 동등성).
const S4_CLAMP_EPS = 1e-9;
// D2 — 경계 통과 후 최대 실거리 / 대조군 예측. 계약 D2 수치.
const S4_D2_MAX_RATIO = 1.05;
// D3 — 로그 배율 비 편차. 계약 D3 수치 (S4d 도 재사용 — 새 임계 없음).
const S4_D3_MAX_DEV = 0.1;
// 틱 묶음 — 50 ms 간격 4틱 (ADR A3.6 9 항 설정).
const S4_TICKS = 4;
const S4_TICK_MS = 50;
const S4_WHEEL_DELTA = 120;
// S4a 줌인 연속 틱 상한 (진입 0.21 AU → 경계 0.085 AU 는 실측 수십 틱).
const S4A_MAX_TICKS = 200;
const S4A_POST_MS = 800;
// 설정 후 정착 / 묶음 후 정착 (관성 완전 소멸).
const S4_SETUP_SETTLE_MS = 1200;
const S4_BUNDLE_SETTLE_MS = 3000;
// 시작 실거리 (AU).
const S4B_START_AU = 0.097; // body — 줌아웃 경계 0.115 AU 를 묶음 약 70 % 지점에서 통과
const S4_CONTROL_START_AU = 0.2; // inner — 경계 없는 대조군
// S4d — 줌인 경계 0.085 AU 를 묶음 약 70 % 지점에서 통과 (S4b 와 대칭 설계, 실측 확정).
const S4D_START_AU = 0.101;

/** 관성 제거 후 실거리 `au` 로 radius 설정 (현 tier 단위) → 정착 → 측정. */
async function setRealDistance(page, bodyId, au) {
  await page.evaluate(
    ({ id, au: target, AU: au1, RS }) => {
      const solar = window.__solarScene;
      const cam = solar.meshes.get(id).getScene().activeCamera;
      // setter 0 대입은 resetZoomVelocity 를 호출 — 설정 전용 (관성 제거).
      cam.inertialRadiusOffset = 0;
      cam.radius = target * au1 * RS[solar.getTier()];
    },
    { id: bodyId, au, AU, RS: RENDER_SCALE },
  );
  await page.waitForTimeout(S4_SETUP_SETTLE_MS);
  return withRealDistance(await measure(page, bodyId));
}

/**
 * 틱 묶음 1회 — 시작 실거리 설정 → 기록기 → 4틱 → 정착. 반환: {x0, xEnd, F, frames, setupTier}.
 * `x0` 는 설정 후 정착 측정값 (틱 직전), `xEnd` 는 정착 후 측정값.
 */
async function runBundle(page, bodyId, { startAu, deltaY }) {
  const setup = await setRealDistance(page, bodyId, startAu);
  const rec = await installFrameRecorder(page, bodyId);
  if (rec.error) return { error: rec.error };
  for (let t = 0; t < S4_TICKS; t += 1) {
    await page.mouse.wheel(0, deltaY);
    await page.waitForTimeout(S4_TICK_MS);
  }
  await page.waitForTimeout(S4_BUNDLE_SETTLE_MS);
  const end = withRealDistance(await measure(page, bodyId));
  const frames = await drainFrameRecorder(page);
  return {
    setupTier: setup.tier,
    x0: setup.cameraFromFocusAU,
    xEnd: end.cameraFromFocusAU,
    F: end.cameraFromFocusAU / setup.cameraFromFocusAU,
    frames,
  };
}

/**
 * D1 clamp 프레임 판정 — 계약 D1 문구 그대로 `r == lowerRadiusLimit` (tier·부호 한정 없음).
 *
 * #1232 reviewer 권고 2 — 이전 판본은 `tier === 'body' && lo > 0` 인 프레임만 세서 계약보다 좁았다
 * (창 안에서 inner 로 되돌아간 프레임 · `lo` 가 `0` 인 프레임은 세지 않고 통과). 지금은:
 *  - `lo === null` → Babylon 에서 「하한 없음」 이라 clamp 가 **정의상 불가** → 비계수 (의미론상 참)
 *  - `lo === 0` → `r === 0` 이면 clamp (상대 오차 분모 0 회피)
 *  - 그 밖 → 상대 오차 `< S4_CLAMP_EPS` (부동소수 동등성 — Babylon clamp 는 정확 대입)
 * `lo` 가 기록되지 않았거나 비유한이면 판정 불가다 — 호출부가 **전제 위반**으로 올린다 (공허 통과 금지).
 */
function isClampFrame(f) {
  if (f.lo === null) return false;
  if (f.lo === 0) return f.radius === 0;
  return Math.abs(f.radius - f.lo) / Math.abs(f.lo) < S4_CLAMP_EPS;
}

/**
 * S4a — D1. 진입 (inner) 에서 −120 을 50 ms 간격 연속, tier 가 body 가 되면 중단 → 800 ms 기록.
 *
 * 전제 (exit 2) 는 **하네스가 통제하는 것만** 묻는다 — 시작 tier · 기록 프레임 · 기대 전이 ≥ 1 ·
 * `ci+1` 존재 · 창 안 `lo` 기록. 기대 전이 **뒤의 추가 전이** (body→inner 진동) 는 제품 결함이라
 * FAIL 이다 (#1232 reviewer 권고 1(가) — 결함이 전제 뒤에 숨는 #1215 MC-9 모양 차단).
 */
async function runS4a(page, bodyId) {
  const rec = await installFrameRecorder(page, bodyId);
  if (rec.error) return { error: rec.error };
  const startTier = (await measure(page, bodyId)).tier;
  let ticks = 0;
  for (; ticks < S4A_MAX_TICKS; ticks += 1) {
    await page.mouse.wheel(0, -S4_WHEEL_DELTA);
    await page.waitForTimeout(S4_TICK_MS);
    if ((await measure(page, bodyId)).tier === 'body') break;
  }
  await page.waitForTimeout(S4A_POST_MS);
  const frames = await drainFrameRecorder(page);
  const trans = tierTransitions(frames);
  const ci = trans.find((x) => x.from === 'inner' && x.to === 'body')?.i ?? -1;
  const pre = [];
  if (startTier !== 'inner') pre.push(`startTier=${startTier}≠inner`);
  if (frames.length === 0) pre.push('기록 프레임 0');
  if (!(ci > 0 && ci + 1 < frames.length)) pre.push(`기대 전이 inner→body 부재/창 부족 ci=${ci}`);
  const clampEnd = Math.min(ci + S4_CLAMP_WINDOW, frames.length - 1);
  if (ci > 0) {
    for (let i = ci; i <= clampEnd; i += 1) {
      const lo = frames[i].lo;
      if (lo !== null && !Number.isFinite(lo)) {
        pre.push(`frame ${i} lowerRadiusLimit 미기록/비유한 (${lo})`);
        break;
      }
    }
  }
  if (pre.length > 0) return { precondition: pre.join('; '), ticks };

  const minAu = Math.min(frames[ci].au, frames[ci + 1].au);
  let clampFrames = 0;
  for (let i = ci; i <= clampEnd; i += 1) {
    if (isClampFrame(frames[i])) clampFrames += 1;
  }
  // 기대 전이 1회 외의 전이 전부 — 진동 (body→inner 되돌아감) 은 제품 결함.
  const extraTransitions = trans.length - 1;
  const window3 = frames.slice(ci, ci + 3).map((f) => f.au);
  // 진단 전용 (판정량 아님, reviewer 권고 3) — 관성 변위는 dt 에 비례하므로 D1 FAIL 시 원인 분리용.
  const dtCi = frames[ci].dt;
  const dtCi1 = frames[ci + 1].dt;
  const pass = minAu >= S4_D1_MIN_AU && clampFrames === 0 && extraTransitions === 0;
  return { ticks, ci, minAu, clampFrames, extraTransitions, window3, dtCi, dtCi1, pass };
}

/**
 * 통과군 판정. 전제 (exit 2) = 설정 tier · 기록 프레임 · 대조군 무전이 · `F_c` 비퇴화 · **기대 전이
 * (from→to) ≥ 1**. 그 뒤의 **추가 전이** 는 제품 결함 (경계 진동) 이라 FAIL — #1232 reviewer 권고
 * 1(가). D2 는 줌아웃 통과군만 (`withD2`) — `maxPost` = 전환 프레임 이후 실거리 최댓값.
 */
function judgeCrossing(bundle, control, { from, to, withD2 }) {
  const trans = tierTransitions(bundle.frames);
  const ctrlTrans = tierTransitions(control.frames);
  const pre = [];
  if (bundle.setupTier !== from) pre.push(`setupTier=${bundle.setupTier}≠${from}`);
  if (control.setupTier !== 'inner') pre.push(`control.setupTier=${control.setupTier}≠inner`);
  if (bundle.frames.length === 0 || control.frames.length === 0) pre.push('기록 프레임 0');
  const expected = trans.find((x) => x.from === from && x.to === to);
  if (!expected) {
    pre.push(
      `통과군 기대 전이 ${from}→${to} 0회 (관측 ${JSON.stringify(trans.map((x) => `${x.from}→${x.to}`))})`,
    );
  }
  if (ctrlTrans.length !== 0) pre.push(`대조군 전이 ${ctrlTrans.length}회 ≠ 0`);
  if (!(control.F > 0) || Math.abs(Math.log(control.F)) < 1e-6) pre.push(`F_c=${control.F} 퇴화`);
  if (pre.length > 0) return { precondition: pre.join('; ') };

  const ci = expected.i;
  const extraTransitions = trans.length - 1;
  const d3Dev = Math.log(bundle.F) / Math.log(control.F) - 1;
  const d3 = Math.abs(d3Dev) <= S4_D3_MAX_DEV;
  const out = { ci, x0: bundle.x0, Fx: bundle.F, Fc: control.F, d3Dev, d3, extraTransitions };
  let pass = d3 && extraTransitions === 0;
  if (withD2) {
    const maxPost = Math.max(...bundle.frames.slice(ci).map((f) => f.au));
    const d2Ratio = maxPost / (bundle.x0 * control.F);
    out.maxPost = maxPost;
    out.d2Ratio = d2Ratio;
    out.d2 = d2Ratio <= S4_D2_MAX_RATIO;
    pass = pass && out.d2;
  }
  out.pass = pass;
  return out;
}

const fmtPct = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(2)}%`;

/**
 * 시나리오 상태 — 종료 코드 합성의 입력 (#1232 reviewer 권고 1(나)).
 *  - `FAIL` — 평가된 술어가 하나라도 거짓 (확정 결함)
 *  - `PRECONDITION` — 평가 전제 위반 / 측정 오류 (판정 불가)
 *  - `PASS`
 */
const STATUS = Object.freeze({ PASS: 'PASS', FAIL: 'FAIL', PRECONDITION: 'PRECONDITION' });

async function runS4(browser) {
  const bodyId = 'earth';
  console.log(`\n[S4] ${bodyId} 경계 왕복 · 관성 생존 (#1232 — 매 렌더 프레임 기록)`);
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  try {
    await bootstrap(page, `&focus=${bodyId}`);
    await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);

    // S4c — 줌아웃 대조군 (inner, 경계 없음).
    const ctrlOut = await runBundle(page, bodyId, {
      startAu: S4_CONTROL_START_AU,
      deltaY: +S4_WHEEL_DELTA,
    });
    // S4e — 줌인 대조군 (inner, 경계 없음: 0.2 / 1.275 ≈ 0.157 AU > 0.085).
    const ctrlIn = await runBundle(page, bodyId, {
      startAu: S4_CONTROL_START_AU,
      deltaY: -S4_WHEEL_DELTA,
    });
    // S4a — D1: 0.21 AU 진입 거리로 되돌린 뒤 연속 줌인.
    await setRealDistance(page, bodyId, 0.21);
    const a = await runS4a(page, bodyId);
    // S4b — 줌아웃 통과군 (body 0.097 AU).
    const b = await runBundle(page, bodyId, { startAu: S4B_START_AU, deltaY: +S4_WHEEL_DELTA });
    // S4d — 줌인 통과군 (inner S4D_START_AU).
    const d = await runBundle(page, bodyId, { startAu: S4D_START_AU, deltaY: -S4_WHEEL_DELTA });

    // 측정 오류 (mesh/camera 부재) 는 판정 **전에** 걸러 원인 메시지를 보존한다 — reviewer 권고 6.
    // 이전 판본은 `a` 를 이 루프에서 빠뜨려, `a.error` 일 때 아래 로그가 `a.window3.map` TypeError 로
    // 죽고 하네스 오류가 FAIL(1) 로 분류됐다. 측정 불가는 판정 불가 (exit 2) 다 — fail-closed 유지.
    for (const [k, v] of Object.entries({ ctrlOut, ctrlIn, a, b, d })) {
      if (v.error) {
        console.log(`  [측정 오류] ${k}: ${v.error}`);
        return {
          scenario: 'S4',
          bodyId,
          error: `${k}: ${v.error}`,
          status: STATUS.PRECONDITION,
          pass: false,
        };
      }
    }
    const jb = judgeCrossing(b, ctrlOut, { from: 'body', to: 'inner', withD2: true });
    const jd = judgeCrossing(d, ctrlIn, { from: 'inner', to: 'body', withD2: false });

    const preconditions = [
      a.precondition && `S4a: ${a.precondition}`,
      jb.precondition && `S4b: ${jb.precondition}`,
      jd.precondition && `S4d: ${jd.precondition}`,
    ].filter(Boolean);

    console.log(
      `  [S4c] 줌아웃 대조군 F_c=${ctrlOut.F?.toFixed(4)} (x0=${ctrlOut.x0?.toFixed(4)}AU) | ` +
        `[S4e] 줌인 대조군 F_c↓=${ctrlIn.F?.toFixed(4)} (x0=${ctrlIn.x0?.toFixed(4)}AU)`,
    );
    if (!a.precondition) {
      console.log(
        `  [S4a] D1 ticks=${a.ticks} ci=${a.ci} 창[ci..ci+2]=${a.window3.map((x) => x.toExponential(4)).join(' · ')}AU | ` +
          `min=${a.minAu.toExponential(4)} (≥${S4_D1_MIN_AU}?) clamp=${a.clampFrames} (=0?) ` +
          `추가전이=${a.extraTransitions} (=0?) → ${a.pass ? 'PASS' : 'FAIL'} | ` +
          `dt[ci]=${a.dtCi?.toFixed(1)}ms dt[ci+1]=${a.dtCi1?.toFixed(1)}ms (진단)`,
      );
    }
    if (!jb.precondition) {
      console.log(
        `  [S4b] 줌아웃 통과 x0=${jb.x0.toFixed(4)}AU F_x=${jb.Fx.toFixed(4)} maxPost=${jb.maxPost.toExponential(4)}AU | ` +
          `D2 maxPost/(x0·F_c)=${jb.d2Ratio.toFixed(4)} (≤${S4_D2_MAX_RATIO}? ${jb.d2 ? 'PASS' : 'FAIL'}) | ` +
          `D3 ${fmtPct(jb.d3Dev)} (|·|≤${S4_D3_MAX_DEV * 100}%? ${jb.d3 ? 'PASS' : 'FAIL'}) | ` +
          `추가전이=${jb.extraTransitions} (=0?)`,
      );
    }
    if (!jd.precondition) {
      console.log(
        `  [S4d] 줌인 통과 x0=${jd.x0.toFixed(4)}AU F_x=${jd.Fx.toFixed(4)} | ` +
          `D3 ${fmtPct(jd.d3Dev)} (|·|≤${S4_D3_MAX_DEV * 100}%? ${jd.d3 ? 'PASS' : 'FAIL'}) | ` +
          `추가전이=${jd.extraTransitions} (=0?)`,
      );
    }
    for (const p of preconditions) console.log(`  [전제 위반] ${p}`);
    console.log(`  콘솔에러=${consoleErrors.length}`);

    // 평가된 술어가 하나라도 거짓이면 확정 FAIL — 다른 하위 단계의 전제 위반이 이를 가리지 않는다.
    const evaluated = [a, jb, jd].filter((x) => !x.precondition);
    const confirmedFail = evaluated.some((x) => !x.pass) || consoleErrors.length > 0;
    const status = confirmedFail
      ? STATUS.FAIL
      : preconditions.length > 0
        ? STATUS.PRECONDITION
        : STATUS.PASS;
    return {
      scenario: 'S4',
      bodyId,
      s4a: a,
      s4b: jb,
      s4d: jd,
      controls: { zoomOut: ctrlOut.F, zoomIn: ctrlIn.F },
      preconditions,
      consoleErrors: consoleErrors.length,
      status,
      pass: status === STATUS.PASS,
    };
  } finally {
    await context.close();
  }
}

/**
 * 종료 코드 합성 (#1232 reviewer 권고 1(나)) — 확정 FAIL 이 하나라도 있으면 **exit 1 우선**.
 * S1~S3 은 S4 와 독립이라, S4 의 전제 위반이 S1~S3 의 확정 FAIL 을 exit 2 로 가리면 안 된다.
 * FAIL 없음 + 전제 위반/측정 오류 있음 → exit 2. 전부 PASS → exit 0.
 */
function exitCodeFor(statuses) {
  if (statuses.includes(STATUS.FAIL)) return 1;
  if (statuses.includes(STATUS.PRECONDITION)) return 2;
  return 0;
}

async function main() {
  console.log('\n=== #818 대형 body focus 휠 줌인 tier 진동 stall 회귀 가드 ===');
  console.log(
    `  base URL: ${BASE_URL}  임계: 역진동=0 AND 총전환≤2 AND catapult<${CATAPULT_RATIO} AND r/lower≤${LIMIT_MARGIN}`,
  );

  const result = { timestamp: new Date().toISOString(), baseUrl: BASE_URL, scenarios: {} };
  // #940 — 브라우저 수명주기를 `withBrowser` 로 위임 (에러 경로 close 도달 보장).
  // launch 인자는 원본 그대로 전달한다 (렌더러 축 불변 — docs/ops/browser-verify-helpers.md).
  await withBrowser({ headless: true }, async (browser) => {
    if (!flags.onlyS4) {
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
    }
    result.scenarios.s4 = await runS4(browser);
  });
  // S1~S3 은 기존 판정 그대로 PASS/FAIL 이분. S4 만 전제 위반 (exit 2) 을 가진다.
  for (const s of Object.values(result.scenarios)) {
    s.status ??= s.pass ? STATUS.PASS : STATUS.FAIL;
  }
  const exitCode = exitCodeFor(Object.values(result.scenarios).map((s) => s.status));

  console.log('\n=== 최종 요약 ===');
  for (const [k, s] of Object.entries(result.scenarios)) {
    console.log(`  ${k} (${s.bodyId}): ${s.status}`);
  }
  if (flags.onlyS4) console.log('  (⚠️ --only=s4 — S1~S3 미실행. 전체 판정은 플래그 없이 실행)');
  console.log(
    `  overall: ${exitCode === 0 ? 'PASS' : exitCode === 1 ? 'FAIL' : 'PRECONDITION VIOLATED (exit 2)'}`,
  );

  if (flags.json) {
    console.log('\n--- JSON ---');
    console.log(JSON.stringify(result, null, 2));
  }
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
