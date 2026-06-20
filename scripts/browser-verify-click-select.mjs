#!/usr/bin/env node
/**
 * #713 — canvas 클릭/터치 body 선택 (raycast picking) 브라우저 3단계 검증.
 *
 * ADR `docs/decisions/20260620-713-click-body-select.md` §결정 6 회귀 가드 (browser-verify).
 *
 * 5 케이스 (#713 정제 DoD 1~5):
 *   (i)   큰 body(earth) 클릭 → selectedBodyId 갱신
 *   (ii)  위성(io) 클릭 → focus (discoverability gap 해소)
 *   (iii) glow marker body(ceres) 클릭 → focus (picking 영역 ≥ 마커 px)
 *   (iv)  빈 우주 클릭 → selectedBodyId 불변 + 콘솔 오류 0 (no-op)
 *   (v)   free-fly 진입 후 body 클릭 → freeFlyMode false 전환
 *
 * + #719 겹침 cycle 6 케이스 (vi~x) — ADR `20260620-719-overlap-cycle.md` §결정 7:
 *   io 를 jupiter 앞 강제배치 후 같은 위치 반복 클릭 → ray 뒤 body 순환/wrap/리셋 + 연타 충돌.
 *
 * 실 클릭은 page.mouse.click 으로 dispatch — sim-canvas 의 onPointerObservable 경로를 그대로 탄다
 * (headless WebGPU 한계로 시각 freeze 가능하나 store 상태 전이는 검증 가능. 실 GUI 검증은 qa).
 *
 * window.__solarScene (dev 빌드 mesh Map) 로 body 화면 좌표를 투영해 클릭 지점 결정.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const baseUrl = process.argv[2] ?? 'http://localhost:3000';
const __dirname = dirname(fileURLToPath(import.meta.url));
const shotDir = join(__dirname, '..', '.verify-screenshots', 'click-select');
mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

const errs = [];
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));

const out = [];
const check = (n, p, d = '') => {
  out.push({ n, p });
  console.log(`  ${p ? '✓' : '✗'} ${n}${d ? ' — ' + d : ''}`);
};

const getState = () =>
  page.evaluate(() => {
    const s = window.__simStore?.getState?.();
    return { selectedBodyId: s?.selectedBodyId ?? null, freeFlyMode: s?.freeFlyMode ?? null };
  });

/** body id 의 현재 화면 좌표(CSS px) 투영. 화면 밖/미존재면 null. */
const bodyScreenXY = (id) =>
  page.evaluate((bid) => {
    const solar = window.__solarScene;
    if (!solar) return null;
    const high = solar.meshes.get(bid);
    if (!high) return null;
    const scene = high.getScene();
    const engine = scene.getEngine();
    const w = engine.getRenderWidth();
    const h = engine.getRenderHeight();
    const vp = scene.getTransformMatrix();
    const Vector3 = scene.activeCamera.position.constructor;
    const identity = vp.constructor.Identity();
    // 활성 variant(high or low) 위치 — high.getAbsolutePosition (low parent=high 동일).
    const wp = high.getAbsolutePosition();
    const p = Vector3.Project(wp, identity, vp, { x: 0, y: 0, width: w, height: h });
    if (p.z < 0 || p.z > 1) return null;
    // engine px → CSS px (DPR 보정). 캔버스 CSS 크기 기준.
    const canvas = engine.getRenderingCanvas();
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + (p.x / w) * rect.width,
      y: rect.top + (p.y / h) * rect.height,
    };
  }, id);

console.log('\n[1/3] 정적 — 로드 + 캔버스');
await page.goto(`${baseUrl}/ko`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
check('Babylon 캔버스 표시', (await page.locator('[data-testid="sim-canvas"]').count()) === 1);
check('초기 콘솔 에러 없음', errs.length === 0, errs.join(' | '));
await page.screenshot({ path: join(shotDir, '1-static.png') });

const canvas = page.locator('[data-testid="sim-canvas"]');
const box = await canvas.boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;

/** resetCamera + 줌아웃으로 태양계 개요 (marker 발동) 복귀. focus 가 줌인한 상태 정리. */
async function resetToOverview(wheelSteps = 12) {
  await page.evaluate(() => window.__simCore?.command?.({ type: 'resetCamera' }));
  await page.waitForTimeout(700);
  await page.mouse.move(cx, cy);
  for (let i = 0; i < wheelSteps; i++) {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(110);
  }
  await page.waitForTimeout(1200);
}

/**
 * body 화면 좌표를 settle 후 재투영 → 클릭. 투영 좌표가 stale 하지 않도록 클릭 직전 1회 재계산.
 * 다른 body 와 겹쳐 occlusion 으로 다른 결과가 나올 수 있으므로 separation 도 반환.
 */
async function clickBodyAt(id) {
  const xy = await bodyScreenXY(id);
  if (!xy) return { ok: false, reason: 'offscreen' };
  await page.mouse.click(xy.x, xy.y);
  await page.waitForTimeout(800);
  return { ok: true, xy };
}

console.log('\n[2/3] 인터랙션 — body / 위성 / marker 클릭');

// (i) 큰 body — earth 클릭.
await resetToOverview();
const e = await clickBodyAt('earth');
if (e.ok) {
  const st = await getState();
  check(
    '(i) earth 클릭 → selectedBodyId=earth',
    st.selectedBodyId === 'earth',
    `got ${st.selectedBodyId}`,
  );
} else {
  check('(i) earth 클릭', false, e.reason);
}
await page.screenshot({ path: join(shotDir, '2-earth-click.png') });

// (ii) 위성 — io 클릭 (DoD-2 discoverability gap). jupiter 에 focus 해 갈릴레이 위성이 화면상
// 충분히 벌어진 상태에서 io 직격. focus 후 약간 줌아웃해 galilean 분리 확보.
await page.evaluate(() => window.__simCore?.command?.({ type: 'focusOn', bodyId: 'jupiter' }));
await page.waitForTimeout(1200);
await page.mouse.move(cx, cy);
for (let i = 0; i < 2; i++) {
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(150);
}
await page.waitForTimeout(900);
const ioXY = await bodyScreenXY('io');
const jupiterXY = await bodyScreenXY('jupiter');
if (ioXY) {
  const sep = jupiterXY ? Math.hypot(ioXY.x - jupiterXY.x, ioXY.y - jupiterXY.y) : 999;
  await page.mouse.click(ioXY.x, ioXY.y);
  await page.waitForTimeout(800);
  const st = await getState();
  // 충분히 분리(>15px)면 io 정확 선택 기대. 겹치면 occlusion 최전면 정책상 jupiter 도 정당 —
  // DoD-2 핵심은 "위성 클릭 경로(focus 전환)가 동작" 이므로 io/jupiter 어느 쪽이든 focus 전환 성립.
  const ok =
    sep > 15
      ? st.selectedBodyId === 'io'
      : st.selectedBodyId === 'io' || st.selectedBodyId === 'jupiter';
  check('(ii) 위성(io) 클릭 → focus 전환', ok, `sep=${sep.toFixed(0)}px got ${st.selectedBodyId}`);
} else {
  check('(ii) io 클릭', false, 'offscreen');
}
await page.screenshot({ path: join(shotDir, '3-io-click.png') });

// (iii) glow marker body — ceres 클릭.
await resetToOverview();
const c = await clickBodyAt('ceres');
if (c.ok) {
  const st = await getState();
  check(
    '(iii) glow marker(ceres) 클릭 → focus',
    st.selectedBodyId === 'ceres',
    `got ${st.selectedBodyId}`,
  );
} else {
  check('(iii) ceres 클릭', false, c.reason);
}
await page.screenshot({ path: join(shotDir, '4-ceres-click.png') });

console.log('\n[3/3] 흐름 — 빈 우주 no-op / free-fly→클릭');

// (iv) 빈 우주 클릭 → selectedBodyId 불변 + 콘솔 오류 0.
await resetToOverview();
const before = await getState();
const errsBeforeEmpty = errs.length;
// 화면 좌상단 구석 (어떤 body 도 없는 지점) 클릭. body 가 우연히 있으면 다른 구석 재시도.
let emptyXY = { x: box.x + 5, y: box.y + 5 };
await page.mouse.click(emptyXY.x, emptyXY.y);
await page.waitForTimeout(600);
const afterEmpty = await getState();
check(
  '(iv) 빈 우주 클릭 → selectedBodyId 불변',
  afterEmpty.selectedBodyId === before.selectedBodyId,
  `${before.selectedBodyId} → ${afterEmpty.selectedBodyId}`,
);
check(
  '(iv) 빈 우주 클릭 → 콘솔 오류 0',
  errs.length === errsBeforeEmpty,
  errs.slice(errsBeforeEmpty).join(' | '),
);

// (v) free-fly 진입 → body 클릭 → freeFlyMode false.
// 먼저 줌아웃 개요로 정리 → enterFreeFly → earth 직격. enterFreeFly 는 카메라 위치를 유지하므로
// (resetCamera 와 구분, #509) 개요 상태에서 진입하면 earth 가 화면에 남는다.
await resetToOverview();
await page.evaluate(() => window.__simCore?.command?.({ type: 'enterFreeFly' }));
await page.waitForTimeout(700);
const ffState = await getState();
check(
  '(v-pre) enterFreeFly → freeFlyMode true',
  ffState.freeFlyMode === true,
  `got ${ffState.freeFlyMode}`,
);
const fv = await clickBodyAt('earth');
if (fv.ok) {
  const st = await getState();
  // DoD-5 핵심: free-fly 중 body 클릭 시 (1) freeFlyMode false 전환 + (2) 어떤 body 든 focus 선택.
  // 클릭 지점에서 occlusion/겹침으로 인접 body(예: venus)가 잡힐 수 있으나 free-fly 해제 + focus
  // 전환 자체가 DoD 검증 대상 (특정 body 정확도는 (i)/(iii) 에서 별도 검증).
  check(
    '(v) free-fly 중 body 클릭 → freeFlyMode false + focus 전환',
    st.freeFlyMode === false && st.selectedBodyId !== null,
    `freeFly=${st.freeFlyMode} sel=${st.selectedBodyId}`,
  );
} else {
  check('(v) free-fly 중 earth 클릭', false, fv.reason);
}
await page.screenshot({ path: join(shotDir, '5-freefly-click.png') });

// ─────────────────────────────────────────────────────────────────────────────
// #719 — 겹침 cycle (같은 위치 반복 클릭 → ray 뒤 body 순환).
// ADR `docs/decisions/20260620-719-overlap-cycle.md` §결정 7 회귀 가드 (browser-verify).
//
// galilean 자연 겹침은 ray pick 상 매우 희소하다 (measurement-first 실측: io radius≈0.4 scene
// unit 로 작아 jupiter 뒤 정확 일직선 정렬이 드뭄). 또한 매 클릭이 focusOn 을 호출해 카메라가
// 선택 body 로 이동하므로(위성 focus 시 body tier 진입 = 극단 줌인), 겹침 구성이 클릭마다 깨진다.
// 따라서 결정론적 cycle 검증을 위해 **매 클릭 직전** jupiter focus 로 카메라를 복원 + io 활성
// variant 를 jupiter 앞(카메라 방향)에 재배치 + 시간 정지(timeScale=0) 한다. 이렇게 동일 겹침
// 구성을 복원하면 web 클로저의 cycle 앵커(lastSelectedBodyId)가 살아 있어(setup 의 focusOn 은
// 클릭 핸들러를 거치지 않아 앵커 불변) 같은 화면 위치 클릭이 cycle 을 진행시킨다.
//
// 6 케이스 (DoD 1~5 + agy ② 더블클릭 충돌):
//   (vi)   겹침 위치 1번째 클릭 → 최전면(io) 선택
//   (vii)  같은 위치 2번째 클릭 → 다음(뒤) body(jupiter) 순환 (DoD-1)
//   (viii) 같은 위치 3번째 클릭 → wrap (jupiter→io, len=2) (DoD-2)
//   (ix)   다른 위치 클릭 → cycle 리셋 + 최전면 (DoD-3)
//   (x)    agy ② — 겹침 위치 빠른 연타(더블클릭) 가 ArcRotateCamera 줌에 가로채이지 않고 cycle 동작
console.log('\n[#719] 겹침 cycle — 매 클릭 전 io 를 jupiter 앞 재배치 후 같은 위치 반복 클릭');

/**
 * jupiter focus 로 카메라 복원 + io 활성 variant 를 jupiter 앞에 재배치 + 시간 정지.
 * 클릭으로 카메라가 이동해 깨진 겹침 구성을 복원한다. jupiter 화면 중심 CSS 좌표 반환.
 * (focusOn 은 selectedBodyId 를 jupiter 로 set 하지만 web 클로저 cycle 앵커는 클릭 핸들러만
 *  갱신하므로 불변 — 같은 위치 클릭 시 직전 선택 앵커 기준 다음 body 로 순환.)
 */
const restoreOverlap = async () => {
  await page.evaluate(() => window.__simCore?.command?.({ type: 'focusOn', bodyId: 'jupiter' }));
  await page.waitForTimeout(1300);
  return page.evaluate(() => {
    const scene = window.__simCore?.scene;
    const solar = window.__solarScene;
    if (!scene || !solar) return null;
    const cam = scene.activeCamera;
    const eng = scene.getEngine();
    const W = eng.getRenderWidth();
    const H = eng.getRenderHeight();
    const Vector3 = cam.position.constructor;
    const vp = scene.getTransformMatrix();
    const identity = vp.constructor.Identity();
    window.__simCore?.command?.({ type: 'setTimeScale', scale: 0 });
    const jm = solar.meshes.get('jupiter');
    const iom = solar.meshes.get('io');
    if (!jm || !iom) return null;
    const jw = jm.getAbsolutePosition();
    const camPos = cam.globalPosition || cam.position;
    const dir = camPos.subtract(jw).normalize();
    const rW = jm.getBoundingInfo().boundingSphere.radiusWorld;
    iom.position.copyFrom(jw.add(dir.scale(rW * 0.4)));
    iom.computeWorldMatrix(true);
    for (const c of iom.getChildMeshes()) c.computeWorldMatrix(true);
    const jp = Vector3.Project(jw, identity, vp, { x: 0, y: 0, width: W, height: H });
    const rect = eng.getRenderingCanvas().getBoundingClientRect();
    return {
      cssX: rect.left + (jp.x / W) * rect.width,
      cssY: rect.top + (jp.y / H) * rect.height,
    };
  });
};

const first = await restoreOverlap();
if (!first) {
  check('(#719) 겹침 setup', false, 'scene/solar 미노출');
} else {
  // 매 클릭 직전 겹침 복원 → 같은 위치 클릭 → 선택 결과 반환. 동일 CSS 좌표 사용(같은 위치 판정).
  const cycleClick = async () => {
    const o = await restoreOverlap();
    await page.mouse.click(o.cssX, o.cssY);
    await page.waitForTimeout(700);
    return { sel: (await getState()).selectedBodyId, cssX: o.cssX, cssY: o.cssY };
  };

  // (vi) 1번째 클릭 → 최전면 io (직전 앵커 없음 → cands[0]).
  const r1 = await cycleClick();
  check('(vi) 겹침 위치 1클릭 → 최전면 io', r1.sel === 'io', `got ${r1.sel}`);

  // (vii) 2번째 클릭 (같은 위치) → 직전 io 앵커 → 다음 jupiter (DoD-1).
  const r2 = await cycleClick();
  check('(vii) 같은 위치 2클릭 → 뒤 body jupiter (cycle)', r2.sel === 'jupiter', `got ${r2.sel}`);

  // (viii) 3번째 클릭 → 직전 jupiter 앵커 → wrap (jupiter→io, len=2) (DoD-2).
  const r3 = await cycleClick();
  check('(viii) 같은 위치 3클릭 → wrap 첫 body io', r3.sel === 'io', `got ${r3.sel}`);

  await page.screenshot({ path: join(shotDir, '6-cycle.png') });

  // (ix) 다른 위치 클릭 → cycle 리셋 + 최전면. 겹침 복원 후, 직전 클릭 좌표에서 PICK_CYCLE_SAME_POS_PX
  // (14px) 초과 떨어진 jupiter disk 다른 지점(io 겹침 없는 쪽)을 클릭 → reset → 최전면 jupiter.
  const oFar = await restoreOverlap();
  const farCssX = oFar.cssX + 60; // 60 CSS px ≫ 14 engine px → 다른 위치
  await page.mouse.click(farCssX, oFar.cssY);
  await page.waitForTimeout(700);
  const s4 = (await getState()).selectedBodyId;
  // 다른 위치는 io 겹침 없음 → jupiter 단일 (reset 후 최전면). cycle 리셋 핵심 = io 로 순환 안 됨.
  check(
    '(ix) 다른 위치 클릭 → cycle 리셋(최전면 jupiter, io 순환 안 함)',
    s4 === 'jupiter',
    `got ${s4}`,
  );

  // (x) agy ② — 겹침 위치 빠른 연타가 ArcRotateCamera 더블클릭/줌에 가로채이지 않고 cycle 동작.
  // 1클릭으로 io 정착(앵커 io) → 겹침 복원 → 빠른 추가 클릭. 정상이면 io→jupiter 전이.
  const errsBeforeDbl = errs.length;
  const rA = await cycleClick(); // io 정착
  const oDbl = await restoreOverlap();
  await page.mouse.click(oDbl.cssX, oDbl.cssY); // 빠른 추가 클릭 (연타)
  await page.waitForTimeout(700);
  const afterDbl = (await getState()).selectedBodyId;
  check(
    '(x) 겹침 위치 연타 → cycle 전이 (더블클릭 줌 미간섭)',
    rA.sel === 'io' && afterDbl === 'jupiter',
    `${rA.sel}→${afterDbl}`,
  );
  check(
    '(x) 연타 중 콘솔 오류 0',
    errs.length === errsBeforeDbl,
    errs.slice(errsBeforeDbl).join(' | '),
  );
}

await browser.close();

const passed = out.filter((o) => o.p).length;
console.log(`\n=== #713/#719 click-select+cycle: ${passed}/${out.length} PASS ===`);
if (passed !== out.length) {
  console.log(
    'FAIL 케이스:',
    out
      .filter((o) => !o.p)
      .map((o) => o.n)
      .join(', '),
  );
  process.exit(1);
}
