#!/usr/bin/env node
/**
 * #1226 — 지구 야간 도시 불빛 동적 검증 (ADR `20260628-756` Amendment 11 §A11.10 · §A11.17).
 *
 * **무엇을 재는가**: 같은 결정적 프레임을 네 페이지 (P1 구름 OFF · 불빛 ON / P2 구름 OFF · 불빛 OFF /
 * P3 구름 ON · 불빛 ON / P4 구름 ON · 불빛 OFF) 에서 찍고, 지구 disk 를 **기하로만** (ray-sphere 역투영
 * 법선 — `verify:1202` `measure()` 와 같은 식) 대역으로 나눠 불빛 ON/OFF **같은 프레임 쌍의 차분**을 판정한다.
 * 불빛 기여는 차분으로만 정의한다 (계약 Q3 (i)). 기존 가드의 판정량은 건드리지 않는다.
 *
 * 표본 집합: `NI` = 밤면 내부 (`ndl ≤ NIGHT_NDL_MAX` ∧ `ndv ≥ INNER_NDV_MIN`), `DI` = 낮면 내부 — 기하.
 * `NI_land` / `NI_sea` = `NI` ∩ 증폭 게이트 맵 `R > 0` / `R == 0` (U2 — D4 · D5 표본은 게이트 맵 G).
 * 게이트 맵은 **불빛 강도 0 페이지 (P2)** 에서 불빛과 무관한 uniform 으로 렌더되므로 불빛 결함이 집합을
 * 옮기지 못한다 (§A11.10 보강 1 — #1197 M-i 클래스 점검).
 *
 * ## 게이트 (계약 D2~D9 · D11)
 *   D2  NI 평균 lum(P1) − lum(P2) ≥ T_NIGHT                                  — 「불빛이 안 보인다」의 문자 그대로의 부정
 *   D3  DI 변화 px (P1 ↔ P2) == 0 ∧ D2 PASS                                  — 낮면 불변
 *   D4  NI_land 불빛 ON/OFF 변화 없는 비율 ≥ T_DARK                           — 과다 상한 (전면 발광)
 *   D5  NI_sea 변화 px (P1 ↔ P2) == 0 ∧ D2 PASS                              — 분포 정합 (Q1 (c))
 *   D6  R = mean_NI_land(lum(P3) − lum(P4)) / mean_NI_land(lum(P1) − lum(P2)) ≤ 1 − K_OCC ∧ D2 PASS — 구름이 불빛을 가린다
 *   D7  (1) mid 정착 쌍 NI 기여 ≥ T_NIGHT (2) low 정착 쌍 disk 변화 px == 0 ∧ D2 PASS
 *       (3) Q2=(A) 라 **구조적으로 해당 없음** — 불빛은 표면 셰이더 항이고 low billboard 는 `StandardMaterial`
 *           이라 표면 셰이더를 타지 않는다. 불빛 mesh · 가시성 파생이 없다 (§A11.2 · §A11.1 축 3)
 *   D8  rotate=off · rotate ON 각각 같은 JD 독립 2회 로드 NI 변화 px == 0 ∧ D2 PASS
 *   D9  `MODE=d9` — develop tip 서버 (`BASE_URL_TIP`) 와 full frame 동일성 3종 + 양성 대조
 *   D11 !hasSimErrors — 전 페이지 (pageerror 포함)
 *
 * ## 「측정 불가」 (exit 2 — PASS 도 FAIL 도 아니다. fallback 분기 금지). **모든 프레임 쌍 각각**에 건다
 *   1 waitForLodSettle timedOut           2 대역 표본 N 하한 미달 (NI · DI · NI_land · NI_sea — 쌍이 쓰는 대역만)
 *   3 같은 페이지 DI 평균 휘도 < MIN_DAY_LIT_LUM (지구가 실제로 그려졌다)      4 위상각 < MIN_PHASE_ALPHA_DEG
 *   5 불빛 OFF 페이지에 불빛 uniform 이 비-0 (하네스 설정만 묻는다 — 제품 속성은 게이트가 잰다, #1215 X2)
 *   6 measure() error · 비유한 기하 · 반경 ≤ 0 · 캔버스 개수 ≠ 1 · 쌍별 페이지 기하 불일치 — **모든 게이트보다 먼저**
 *   7 D6 양성 대조 — NI_land 에서 P4 ≠ P2 픽셀 수 < MIN_EXPECTED_CLOUDED_LAND (§A11.10 보강 2) · D9 양성 대조
 *   적용표 (쌍 × 전제) 는 `judge()` 의 `PREMISE_TABLE` 이 SSoT 이고 실행마다 인쇄한다.
 *
 * ## 모드 / 변이
 *   node browser-verify-1226-night-lights.mjs              # 게이트 (CI)
 *   MODE=profile ...                                       # 게이트 없이 baseline 인쇄 (임계 도출용)
 *   MODE=d9 BASE_URL_TIP=http://localhost:3100 ...         # D9 — develop tip 과 동일성 (PR 시점 1회)
 *   INJECT=mn6 ...   # §A11.17.3 레시피 — 불빛 항만 구름 블렌드 뒤에 가산 (D6 FAIL 기대) + V1~V4 주입 유효성
 *   INJECT=mn7 ...   # low billboard 발광 — D7 (2)
 *   INJECT=mn9 ...   # 콘솔 에러 1건 — D11
 *   INJECT=mn10-scale|mn10-camera|mn10-settle ...  # 측정 실패 주입 — exit 2
 *   소스 변이 (MN-1 · 2 · 3 · 4 · 5 · 5b · 8) 는 소스를 바꾸고 dist 를 재빌드해 기본 모드로 돌린다 (PR 기록).
 *
 * 환경: SWIFTSHADER=1 (headless + --use-angle=swiftshader) · BASE_URL · BASE_URL_TIP · CAPTURE_DIR
 */

import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  bootstrapScene,
  collectConsoleErrors,
  hasSimErrors,
  hideDomOverlays,
  launchBrowser,
  resolveBaseUrl,
  waitForLodSettle,
  withBrowser,
} from '../../../scripts/browser-verify-utils.mjs';

const BASE_URL = resolveBaseUrl();
const BASE_URL_TIP = process.env.BASE_URL_TIP ? process.env.BASE_URL_TIP.replace(/\/+$/, '') : null;
const CAPTURE_DIR = process.env.CAPTURE_DIR ?? null;
const SWIFTSHADER = process.env.SWIFTSHADER === '1';
const MODE = process.env.MODE ?? 'dod';
const INJECT = process.env.INJECT ?? 'none';
/**
 * §A11.17.3 보강 1 (`disableDepthWrite = true` 명시) 철회 스위치 — 보강이 V1~V4 위배의 원인인지 가르는 용도.
 * ADR 은 이 플래그가 블렌드 draw 에서 **무효**라고 적었으므로 (§A10.5 실측) 값 변화가 없어야 한다.
 */
const MN6_SKIP_DEPTH_WRITE = process.env.MN6_SKIP_DEPTH_WRITE === '1';

/** U1 (사용자 결정 2026-09-13) — 신규 가드 전체를 이 JD 에서 잰다. 계약 공통 JD `2451626.0` 에서는 D6 신호가 `0` (§A11.11). */
const T_JD = 2451808.0;

/** 결정적 프레임 쿼리 — `verify:1202` `FOCUS_QUERY` 와 동일 (`gpu=a` 필수 — 1202 주석 참조). */
const FOCUS = '?gpu=a&focus=earth&lod=auto&rotate=off&orbits=off';
const Q = {
  P1: `${FOCUS}&clouds=off`,
  P2: `${FOCUS}&clouds=off&nightlights=off`,
  P3: FOCUS,
  P4: `${FOCUS}&nightlights=off`,
  /** D8 rotate ON — 구름 OFF 로 불빛 축만 본다 (구름 자전 결정성은 verify:1215 C7). */
  ROT: '?gpu=a&focus=earth&lod=auto&orbits=off&clouds=off',
};

const EXIT_UNMEASURABLE = 2;

// ── 대역 정의 — `verify:1202` 가 SSoT (정의·값 동일, 주석으로 참조 — 계약 「대역 상수 신설 0」) ──────
/** `browser-verify-1202-atmosphere-rim.mjs` `NIGHT_NDL_MAX` 와 동일. */
const NIGHT_NDL_MAX = -0.15;
/** `browser-verify-1202-atmosphere-rim.mjs` `DAY_NDL_MIN` 과 동일. */
const DAY_NDL_MIN = 0.15;
/** `browser-verify-1202-atmosphere-rim.mjs` `INNER_NDV_MIN` 과 동일. */
const INNER_NDV_MIN = 0.6;
/** `browser-verify-1202-atmosphere-rim.mjs` `MIN_DAY_LIT_LUM` 과 정의·값 동일 (측정 불가 3). */
const MIN_DAY_LIT_LUM = 0.15;
/** `browser-verify-1202-atmosphere-rim.mjs` `MIN_PHASE_ALPHA_DEG` 와 정의·값 동일 (측정 불가 4). */
const MIN_PHASE_ALPHA_DEG = 10;

// ── 임계 — 계약 도출 규칙: D1 승인 파라미터 (g1) baseline ÷ 3 (§A8.8 · §A10.11 1/3 관례) ─────────
// baseline [실측]: D1 승인 파라미터 g1 (#1226 코멘트 5663330554) · headless chromium `--use-angle=swiftshader`
// (`SWIFTSHADER=1`) · 1280×720 · `next dev` · `packages/core` = `e39b6d9` (#1228 fix 포함) 빌드 · JD 2451808.0 ·
// DOM 숨김 · `MODE=profile` **5회 — 다섯 실행이 아래 판정량 전 항목에서 동일 (산포 `0`)**. **로컬** swiftshader 에
// 한한다 — CI 렌더러 (GitHub Actions ubuntu headless) 와의 동일성은 미확인이다 (`verify:1215` 는 소수 4~5 자리
// 차이를 실측했다). 원자료: `docs/reports/1226-night-lights/phase2/baseline/`.
// `null` 로 되돌리면 MODE=profile 외에서 fail-closed (throw → exit 1).
/** D2 · D7 (1) 하한 = baseline NI 평균 기여 `0.02187` ÷ 3. 비교: mid 정착 쌍 `0.021659` (D7 (1) 여유 2.97배). */
const T_NIGHT = 0.00729;
/** D4 하한 = baseline NI_land 불빛 ON/OFF 변화 없는 비율 `0.8404` ÷ 3 = `0.280133`. */
const T_DARK = 0.28013;
/**
 * D6 = baseline 감쇠율 `(1 − R_baseline)` ÷ 3. `R_baseline = 0.026925 / 0.038502 = 0.699314` → `0.300686 / 3
 * = 0.100229`. 판정 `R ≤ 1 − K_OCC = 0.89977`.
 */
const K_OCC = 0.10023;
/** 측정 불가 2 — ⌊baseline NI N `7225` ÷ 3⌋. rotate ON 쌍 NI `5740` 도 이 하한 위다. */
const MIN_EXPECTED_NIGHT = 2408;
/** 측정 불가 2 — ⌊baseline DI N `7225` ÷ 3⌋. */
const MIN_EXPECTED_DAY = 2408;
/** 측정 불가 2 (D2 · D4 · D6) — ⌊baseline NI_land N `4104` ÷ 3⌋. */
const MIN_EXPECTED_NIGHT_LAND = 1368;
/** 측정 불가 2 (D5) — ⌊baseline NI_sea N `3121` ÷ 3⌋. */
const MIN_EXPECTED_NIGHT_SEA = 1040;
/** 측정 불가 7 (D6 양성 대조 — §A11.10 보강 2) — ⌊baseline NI_land P4≠P2 `2083` ÷ 3⌋. */
const MIN_EXPECTED_CLOUDED_LAND = 694;

// ── 게이트 맵 주입 (§A11 공통 레시피 — `docs/reports/1226-night-lights/README.md`) ──────────────
const GATE_AMBIENT = 1;
/** 증폭 게이트 맵 — `R > 0` ⇔ `landMask · (1 − iceMask) ≥ 약 0.5/255²` (§A11.10). */
const GATE_AMBIENT_AMPLIFIED = 255;
const gateFloats = (amb) => [
  ['sunIntensity', 0],
  ['ambientIntensity', amb],
  ['rimStrength', 0],
  ['nightLightStrength', 0],
];
const GATE_COLORS = [
  ['ambientGround', [1, 1, 1]],
  ['ambientSky', [1, 1, 1]],
  ['baseColor', [0, 0, 0]],
  ['landColor', [1, 1, 1]],
  ['biomeTropicalColor', [1, 1, 1]],
  ['biomeTundraColor', [1, 1, 1]],
  ['iceColor', [0, 0, 1]],
];

/**
 * #1228 B1 교훈 — 결함 빌드 판정이 로드 타이밍 경주에 기대지 않는지 확인하는 대기 당김 (ms).
 * 부트스트랩 안정화 대기 `BOOT_SETTLE_MS` 에서 뺀다. 기본 `0` — D12 변이 실증에서만 `1000` 으로 돌린다.
 */
const WAIT_ADVANCE_MS = Number(process.env.WAIT_ADVANCE_MS ?? 0);
/** 부트스트랩 안정화 대기 — `verify:1202` · `verify:1215` 와 같은 값. */
const BOOT_SETTLE_MS = 2800;

async function setupPage(browser, baseUrl, query, label, settleOptions = {}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors = collectConsoleErrors(page);
  await bootstrapScene(page, {
    baseUrl,
    query,
    handles: ['__simCore', '__solarScene'],
    settleMs: BOOT_SETTLE_MS - WAIT_ADVANCE_MS,
  });
  // #1219 · #1228 B1 — 캔버스 위 DOM (HUD · 토스트) 이 캡처에 섞이지 않게 숨긴다 (캔버스 개수 fail-fast 포함).
  // 페이지 스타일 규칙이라 이후 등장하는 토스트 (focus 1500ms 뒤) 에도 적용된다.
  await hideDomOverlays(page);
  await page.evaluate((jd) => {
    window.__simCore.command({ type: 'jumpToJulianDate', julianDate: jd });
    window.__simCore.command({ type: 'pause' });
  }, T_JD);
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    window.__simCore.scene.activeCamera.beta = Math.PI / 2;
  });
  const settle = await waitForLodSettle(page, settleOptions);
  return { context, page, errors, settles: [{ step: 'boot', ...settle }], label };
}

const frames = (page, n = 4) =>
  page.evaluate(
    (k) =>
      new Promise((res) => {
        let i = 0;
        const f = () => (++i >= k ? res() : requestAnimationFrame(f));
        requestAnimationFrame(f);
      }),
    n,
  );

async function capture(ctx, name) {
  await frames(ctx.page, 4);
  const buf = await ctx.page.locator('canvas').first().screenshot();
  if (CAPTURE_DIR) {
    await mkdir(CAPTURE_DIR, { recursive: true });
    await writeFile(path.join(CAPTURE_DIR, `1226-${name}.png`), buf);
  }
  return buf.toString('base64');
}

async function settleLod(ctx, step, override) {
  await ctx.page.evaluate((o) => window.__solarScene.setLodOverride(o), override);
  await frames(ctx.page, 2);
  const s = await waitForLodSettle(ctx.page);
  ctx.settles.push({ step, ...s });
}

/** 전제 5 — 이 페이지의 지구 표면 머티리얼 (host + LOD variant) 의 불빛 세기 uniform 값들. */
const readLightStrengths = (ctx) =>
  ctx.page.evaluate(() => {
    const earth = window.__solarScene.meshes.get('earth');
    const meshes = [earth, ...earth.getChildMeshes()].filter(
      (m) => m === earth || m.name.startsWith('earth-lod-'),
    );
    return meshes
      .map((m) => m.material?._floats?.nightLightStrength)
      .filter((v) => v !== undefined);
  });

/**
 * 지구 표면 머티리얼 (host + `earth-lod-*`) 에 uniform 을 **매 bind 덮어쓰는** observer 를 설치한다
 * (`verify:1202` `injectFloats` 선례). 원래 값을 저장해 `clearInjection` 이 복원한다 — observer 만 떼면
 * 마지막 주입값이 `_floats` 에 남는다.
 */
const injectUniforms = (ctx, floats, colors) =>
  ctx.page.evaluate(
    ({ floats, colors }) => {
      const earth = window.__solarScene.meshes.get('earth');
      const meshes = [earth, ...earth.getChildMeshes()].filter(
        (m) => m === earth || m.name.startsWith('earth-lod-'),
      );
      window.__inj ??= [];
      let patched = 0;
      for (const mesh of meshes) {
        const mat = mesh.material;
        if (!mat || typeof mat.setFloat !== 'function' || !mat._colors3?.baseColor) continue;
        const Color3 = mat._colors3.baseColor.constructor;
        const orig = {
          floats: floats.map(([n]) => [n, mat._floats[n]]),
          colors: colors.map(([n]) => [n, mat._colors3[n]?.clone()]),
        };
        const obs = mat.onBindObservable.add(() => {
          for (const [n, v] of floats) mat.setFloat(n, v);
          for (const [n, [r, g, b]] of colors) mat.setColor3(n, new Color3(r, g, b));
        });
        window.__inj.push({ mat, obs, orig });
        patched += 1;
      }
      return { patched };
    },
    { floats, colors },
  );

const clearInjection = (ctx) =>
  ctx.page.evaluate(() => {
    for (const { mat, obs, orig } of window.__inj ?? []) {
      mat.onBindObservable.remove(obs);
      for (const [n, v] of orig.floats) if (v !== undefined) mat.setFloat(n, v);
      for (const [n, c] of orig.colors) if (c) mat.setColor3(n, c);
    }
    window.__inj = [];
  });

// ── MN-6 — §A11.17.3 레시피 (보강 3건 반영판). 프로덕션 코드 0 줄 ─────────────────────────────
// 1. host · earth-lod-* 에 nightLightStrength = 0 매 bind 덮어쓰기 (주입 전 S 를 먼저 읽는다)
// 2. overlay = host.clone(…, null, true); parent = host; 변환 초기화
// 3. overlayMat = host.material.clone(…); _options 복사 + needAlphaBlending; alphaMode ALPHA_ADD(1);
//    disableDepthWrite = true (블렌드 draw 에서 무효 — §A10.5 규약상 명시)
// 4. renderingGroupId 1 · setRenderingAutoClearDepthStencil(1, false, false, false) · alwaysSelectAsActiveMesh
// 5. onBeforeRender 마다 host 머티리얼 맵을 overlayMat 에 복사 후 sunIntensity 0 · ambientIntensity 0 ·
//    rimStrength 0 · nightLightStrength S
// 6. 원복 — observer 제거 · overlay.dispose() · overlayMat.dispose(false, false) ·
//    setRenderingAutoClearDepthStencil(1, true, true, true) · host nightLightStrength S 복원
// 하네스는 1~5 를 try, 6 을 finally 에서 부른다 (try 안 process.exit 는 finally 를 건너뛴다 — #940).
const installOverlay = (ctx, { blockHost, overlay, strength }) =>
  ctx.page.evaluate(
    ({ blockHost, overlay, strength, skipDepthWrite }) => {
      const scene = window.__simCore.scene;
      const host = window.__solarScene.meshes.get('earth');
      const st = { hostBlock: [], S: host.material._floats.nightLightStrength };
      window.__mn6 = st;
      if (blockHost) {
        const meshes = [host, ...host.getChildMeshes()].filter(
          (m) => m === host || m.name.startsWith('earth-lod-'),
        );
        for (const m of meshes) {
          const mat = m.material;
          if (!mat?.onBindObservable || mat._floats?.nightLightStrength === undefined) continue;
          const obs = mat.onBindObservable.add(() => mat.setFloat('nightLightStrength', 0));
          st.hostBlock.push({ mat, obs, orig: mat._floats.nightLightStrength });
        }
      }
      if (!overlay) return { S: st.S, hostBlocked: st.hostBlock.length };
      const S = strength ?? st.S;
      const o = host.clone('mn6-overlay', null, true);
      o.parent = host;
      o.position.set(0, 0, 0);
      o.rotationQuaternion = null;
      o.rotation.set(0, 0, 0);
      o.scaling.set(1, 1, 1);
      const hm = host.material;
      const om = hm.clone('mn6-overlay-mat');
      om._options = { ...hm._options, needAlphaBlending: true };
      om.alphaMode = 1;
      if (!skipDepthWrite) om.disableDepthWrite = true;
      o.material = om;
      o.renderingGroupId = 1;
      scene.setRenderingAutoClearDepthStencil(1, false, false, false);
      o.alwaysSelectAsActiveMesh = true;
      const copy = () => {
        for (const k of ['_floats', '_ints', '_vectors3', '_colors3', '_textures'])
          if (hm[k]) Object.assign(om[k], hm[k]);
        om.setFloat('sunIntensity', 0);
        om.setFloat('ambientIntensity', 0);
        om.setFloat('rimStrength', 0);
        om.setFloat('nightLightStrength', S);
      };
      st.overlay = o;
      st.overlayMat = om;
      st.renderObs = scene.onBeforeRenderObservable.add(copy);
      return {
        S,
        hostBlocked: st.hostBlock.length,
        hostNeedsAlpha: hm.needAlphaBlending(),
        overlayNeedsAlpha: om.needAlphaBlending(),
        disableDepthWrite: om.disableDepthWrite,
        optionsShared: om._options === hm._options,
      };
    },
    { blockHost, overlay, strength, skipDepthWrite: MN6_SKIP_DEPTH_WRITE },
  );

const uninstallOverlay = (ctx) =>
  ctx.page.evaluate(() => {
    const scene = window.__simCore.scene;
    const st = window.__mn6;
    if (!st) return { restored: false };
    if (st.renderObs) scene.onBeforeRenderObservable.remove(st.renderObs);
    if (st.overlay) st.overlay.dispose();
    if (st.overlayMat) st.overlayMat.dispose(false, false);
    scene.setRenderingAutoClearDepthStencil(1, true, true, true);
    for (const { mat, obs, orig } of st.hostBlock) {
      mat.onBindObservable.remove(obs);
      mat.setFloat('nightLightStrength', orig);
    }
    window.__mn6 = null;
    return { restored: true };
  });

/**
 * 프레임 비교 1쌍 (a ↔ b) — 기하는 이 페이지 (ctx) 의 카메라. `land` 이미지 (증폭 게이트 맵) 를 주면
 * NI_land / NI_sea 로 나눈 통계, `ref` 이미지를 주면 NI_land 에서 a ↔ ref 픽셀 차 (MN-6 V2) 를 함께 낸다.
 */
async function measurePair(ctx, aB64, bB64, extra = {}) {
  return ctx.page.evaluate(
    async ({ a, b, land, ref, cloudOff, cloudOn, P }) => {
      const scene = window.__simCore?.scene;
      const mesh = window.__solarScene?.meshes?.get('earth');
      if (!scene || !mesh) return { error: 'earth mesh/scene 부재' };
      const canvasCount = document.querySelectorAll('canvas').length;
      if (canvasCount !== 1) return { error: `캔버스 개수 ${canvasCount} ≠ 1 (#1219)` };
      const engine = scene.getEngine();
      const rw = engine.getRenderWidth();
      const rh = engine.getRenderHeight();
      const camera = scene.activeCamera;
      const V = mesh.getAbsolutePosition().constructor;
      const fw = camera.getDirection(new V(0, 0, 1));
      const rt = camera.getDirection(new V(1, 0, 0));
      const up = camera.getDirection(new V(0, 1, 0));
      const cp = camera.globalPosition ?? camera.position;
      const ct = mesh.getAbsolutePosition();
      const R = mesh.getBoundingInfo().boundingSphere.radiusWorld / Math.sqrt(3);
      let sunPos = null;
      for (const l of scene.lights) {
        if (l.position && (l.name === 'sun-light' || l.getClassName?.() === 'PointLight')) {
          sunPos = l.position;
          break;
        }
      }
      if (!sunPos) return { error: 'sunLight 부재' };
      const nums = [
        fw.x,
        fw.y,
        fw.z,
        rt.x,
        rt.y,
        rt.z,
        up.x,
        up.y,
        up.z,
        cp.x,
        cp.y,
        cp.z,
        ct.x,
        ct.y,
        ct.z,
        R,
        camera.fov,
        sunPos.x,
        sunPos.y,
        sunPos.z,
      ];
      if (!nums.every(Number.isFinite) || !(R > 0))
        return { error: `기하 무효 — 비유한 값 또는 반경 ≤ 0 (radius ${R})` };
      const sd = sunPos.subtract(ct).normalize();
      const cu = cp.subtract(ct).normalize();
      const phaseAlphaDeg =
        (Math.acos(Math.max(-1, Math.min(1, cu.x * sd.x + cu.y * sd.y + cu.z * sd.z))) * 180) /
        Math.PI;

      const load = async (src) => {
        const img = new Image();
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = rej;
          img.src = `data:image/png;base64,${src}`;
        });
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        return {
          d: c.getContext('2d').getImageData(0, 0, img.width, img.height).data,
          w: img.width,
          h: img.height,
        };
      };
      const A = await load(a);
      const B = await load(b);
      const L = land ? await load(land) : null;
      const X = ref ? await load(ref) : null;
      const COFF = cloudOff ? await load(cloudOff) : null;
      const CON = cloudOn ? await load(cloudOn) : null;
      for (const img of [B, L, X, COFF, CON])
        if (img && img.d.length !== A.d.length) return { error: '캔버스 크기 불일치' };
      const sx = A.w / rw;
      const sy = A.h / rh;
      const lum = (d, i) => (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      const same = (p, q, i) => p[i] === q[i] && p[i + 1] === q[i + 1] && p[i + 2] === q[i + 2];
      const sat = (p, i) => p[i] === 255 || p[i + 1] === 255 || p[i + 2] === 255;
      const th = Math.tan(camera.fov / 2);
      const asp = rw / rh;

      const mk = () => ({ n: 0, sumContrib: 0, changed: 0, sumLumA: 0, sumLumB: 0 });
      const NI = mk();
      const DI = mk();
      const disk = mk();
      const NIL = {
        ...mk(),
        unchanged: 0,
        satA: 0,
        cloudChanged: 0,
        overlap: 0,
        sumCloudContrib: 0,
        refMaxAbs: 0,
        refOver1Lsb: 0,
        sumRefContrib: 0,
      };
      const NIS = mk();
      const inDisk = new Uint8Array(A.w * A.h);
      const push = (acc, i) => {
        acc.n += 1;
        const la = lum(A.d, i);
        const lb = lum(B.d, i);
        acc.sumContrib += la - lb;
        acc.sumLumA += la;
        acc.sumLumB += lb;
        if (!same(A.d, B.d, i)) acc.changed += 1;
      };
      for (let y = 0; y < rh; y += 1) {
        for (let x = 0; x < rw; x += 1) {
          const nx0 = ((x + 0.5) / rw) * 2 - 1;
          const ny0 = 1 - ((y + 0.5) / rh) * 2;
          const rx = fw.x + rt.x * nx0 * th * asp + up.x * ny0 * th;
          const ry = fw.y + rt.y * nx0 * th * asp + up.y * ny0 * th;
          const rz = fw.z + rt.z * nx0 * th * asp + up.z * ny0 * th;
          const rl = Math.hypot(rx, ry, rz);
          const dx = rx / rl;
          const dy = ry / rl;
          const dz = rz / rl;
          const ox = cp.x - ct.x;
          const oy = cp.y - ct.y;
          const oz = cp.z - ct.z;
          const bq = ox * dx + oy * dy + oz * dz;
          const disc = bq * bq - (ox * ox + oy * oy + oz * oz - R * R);
          if (disc < 0) continue;
          const t = -bq - Math.sqrt(disc);
          if (t < 0) continue;
          const nx = (ox + t * dx) / R;
          const ny = (oy + t * dy) / R;
          const nz = (oz + t * dz) / R;
          const vx = cp.x - (ct.x + nx * R);
          const vy = cp.y - (ct.y + ny * R);
          const vz = cp.z - (ct.z + nz * R);
          const ndv = (nx * vx + ny * vy + nz * vz) / Math.hypot(vx, vy, vz);
          const ndl = nx * sd.x + ny * sd.y + nz * sd.z;
          const px = Math.round(x * sx);
          const py = Math.round(y * sy);
          if (px < 0 || py < 0 || px >= A.w || py >= A.h) continue;
          const i = (py * A.w + px) * 4;
          inDisk[py * A.w + px] = 1;
          push(disk, i);
          if (ndv < P.INNER_NDV_MIN) continue;
          if (ndl >= P.DAY_NDL_MIN) push(DI, i);
          if (ndl > P.NIGHT_NDL_MAX) continue;
          push(NI, i);
          if (!L) continue;
          if (L.d[i] > 0) {
            push(NIL, i);
            if (same(A.d, B.d, i)) NIL.unchanged += 1;
            if (sat(A.d, i)) NIL.satA += 1;
            if (COFF && CON) {
              // 전제 7 · 겹침 — COFF = P2 (구름 OFF · 불빛 OFF), CON = P4 (구름 ON · 불빛 OFF)
              const cloudCh = !same(CON.d, COFF.d, i);
              if (cloudCh) NIL.cloudChanged += 1;
              if (cloudCh && !same(A.d, B.d, i)) NIL.overlap += 1;
            }
            if (X) {
              const diff = Math.abs(lum(X.d, i) - lum(A.d, i));
              if (diff > NIL.refMaxAbs) NIL.refMaxAbs = diff;
              const chMax = Math.max(
                Math.abs(X.d[i] - A.d[i]),
                Math.abs(X.d[i + 1] - A.d[i + 1]),
                Math.abs(X.d[i + 2] - A.d[i + 2]),
              );
              if (chMax > 1) NIL.refOver1Lsb += 1;
              NIL.sumRefContrib += lum(X.d, i) - lum(B.d, i);
            }
          } else {
            push(NIS, i);
          }
        }
      }
      let fullChanged = 0;
      let outsideChanged = 0;
      for (let p = 0; p < A.w * A.h; p += 1) {
        const i = p * 4;
        if (!same(A.d, B.d, i)) {
          fullChanged += 1;
          if (!inDisk[p]) outsideChanged += 1;
        }
      }
      const r6 = (v) => Number(v.toFixed(6));
      const pack = (acc) => ({
        n: acc.n,
        meanContrib: acc.n ? r6(acc.sumContrib / acc.n) : null,
        changed: acc.changed,
        lumA: acc.n ? r6(acc.sumLumA / acc.n) : null,
        lumB: acc.n ? r6(acc.sumLumB / acc.n) : null,
      });
      return {
        phaseAlphaDeg: Number(phaseAlphaDeg.toFixed(4)),
        radiusWorld: R,
        geomKey: [cp.x, cp.y, cp.z, ct.x, ct.y, ct.z, R, camera.fov, rw, rh].join(','),
        NI: pack(NI),
        DI: pack(DI),
        disk: pack(disk),
        NI_land: L
          ? {
              ...pack(NIL),
              unchangedRatio: NIL.n ? r6(NIL.unchanged / NIL.n) : null,
              saturatedPxA: NIL.satA,
              cloudChanged: NIL.cloudChanged,
              overlap: NIL.overlap,
              refMaxAbsLum: X ? r6(NIL.refMaxAbs) : null,
              refOver1LsbPx: X ? NIL.refOver1Lsb : null,
              refMeanContrib: X && NIL.n ? r6(NIL.sumRefContrib / NIL.n) : null,
            }
          : null,
        NI_sea: L ? pack(NIS) : null,
        fullChanged,
        outsideChanged,
      };
    },
    {
      a: aB64,
      b: bB64,
      land: extra.land ?? null,
      ref: extra.ref ?? null,
      cloudOff: extra.cloudOff ?? null,
      cloudOn: extra.cloudOn ?? null,
      P: { INNER_NDV_MIN, DAY_NDL_MIN, NIGHT_NDL_MAX },
    },
  );
}

/** 페이지 기하 키 — 두 페이지가 같은 프레임을 찍었는지 대조 (다르면 픽셀 쌍이 무의미 → 측정 오류). */
const readGeomKey = (ctx) =>
  ctx.page.evaluate(() => {
    const scene = window.__simCore.scene;
    const cam = scene.activeCamera;
    const c = window.__solarScene.meshes.get('earth').getAbsolutePosition();
    const p = cam.globalPosition;
    return [p.x, p.y, p.z, c.x, c.y, c.z, cam.fov].join(',');
  });

/** 두 페이지 기하가 정확히 같을 때만 쌍을 잰다 (#1215 cross-validate X3). 판정 기하는 `ctxA`. */
async function measureCheckedPair(ctxA, aB64, ctxB, bB64, label, extra) {
  const gA = await readGeomKey(ctxA);
  const gB = await readGeomKey(ctxB);
  if (gA !== gB) return { error: `${label} 페이지 기하 불일치 (${gA} vs ${gB})` };
  return measurePair(ctxA, aB64, bB64, extra);
}

async function applyRuntimeInject(pages) {
  if (INJECT === 'mn9') {
    await pages.P1.page.evaluate(() => console.error('[mn9] injected runtime error canary'));
    return 'mn9 — P1 콘솔 에러 1건';
  }
  if (INJECT === 'mn10-scale') {
    await pages.P1.page.evaluate(() =>
      window.__solarScene.meshes.get('earth').scaling.set(0, 0, 0),
    );
    await frames(pages.P1.page, 4);
    return 'mn10-scale — P1 지구 scaling 0';
  }
  if (INJECT === 'mn10-camera') {
    await pages.P1.page.evaluate(() => {
      window.__simCore.scene.activeCamera.alpha += 0.5;
    });
    await frames(pages.P1.page, 4);
    return 'mn10-camera — P1 카메라 alpha +0.5 rad (쌍 기하 이탈)';
  }
  return null;
}

async function runMain(browser) {
  const out = { mode: MODE, inject: INJECT };
  const settleP1 = INJECT === 'mn10-settle' ? { timeoutMs: 1 } : {};
  const P1 = await setupPage(browser, BASE_URL, Q.P1, 'P1', settleP1);
  const P2 = await setupPage(browser, BASE_URL, Q.P2, 'P2');
  const P3 = await setupPage(browser, BASE_URL, Q.P3, 'P3');
  const P4 = await setupPage(browser, BASE_URL, Q.P4, 'P4');
  const pages = { P1, P2, P3, P4 };
  out.injectNote =
    INJECT === 'mn10-settle' ? 'mn10-settle — P1 waitForLodSettle timeoutMs 1' : null;
  const p1Pre = await capture(P1, 'P1-pre');
  out.injectNote = (await applyRuntimeInject(pages)) ?? out.injectNote;

  const img = {
    P1: await capture(P1, 'P1'),
    P2: await capture(P2, 'P2'),
    P3: await capture(P3, 'P3'),
    P4: await capture(P4, 'P4'),
  };
  out.strengths = {
    P1: await readLightStrengths(P1),
    P2: await readLightStrengths(P2),
    P3: await readLightStrengths(P3),
    P4: await readLightStrengths(P4),
  };

  // ── 게이트 맵 (P2 페이지 — 불빛 강도 0, 같은 기하) ──
  out.injG = await injectUniforms(P2, gateFloats(GATE_AMBIENT), GATE_COLORS);
  img.G = await capture(P2, 'G');
  await clearInjection(P2);
  out.injGA = await injectUniforms(P2, gateFloats(GATE_AMBIENT_AMPLIFIED), GATE_COLORS);
  img.GA = await capture(P2, 'GA');
  await clearInjection(P2);
  out.p2Restore = await measurePair(P2, await capture(P2, 'P2-restored'), img.P2);
  // G ↔ GA 의 R == 0 불일치 (§A11.14 미확인 항목) — NI 한정 계수는 게이트 맵끼리 비교로 낸다.
  out.gateVsAmp = await measurePair(P2, img.G, img.GA);

  // ── 주 측정 — P1 ↔ P2 (D2 · D3 · D4 · D5) + D6 (P3 ↔ P4) + 전제 7 ──
  out.main = await measureCheckedPair(P1, img.P1, P2, img.P2, 'main', {
    land: img.GA,
    cloudOff: img.P2,
    cloudOn: img.P4,
  });
  out.cloud = await measureCheckedPair(P3, img.P3, P4, img.P4, 'cloud', { land: img.GA });
  const g4 = await readGeomKey(P4);
  const g1 = await readGeomKey(P1);
  if (!out.cloud.error && g4 !== g1)
    out.cloud = { error: `cloud ↔ main 기하 불일치 (${g4} vs ${g1})` };

  // ── MN-6 (INJECT=mn6) — §A11.17.3 레시피 + 주입 유효성 V1~V4 ──
  if (INJECT === 'mn6') out.mn6 = await runMn6(pages, img);

  // ── D7 (1) mid 정착 쌍 ──
  await settleLod(P1, 'mid', 'mid');
  await settleLod(P2, 'mid', 'mid');
  out.mid = await measureCheckedPair(
    P1,
    await capture(P1, 'mid-P1'),
    P2,
    await capture(P2, 'mid-P2'),
    'mid',
  );
  // #1228 선결 확인 — mid variant 머티리얼이 마스크 경로 (uMaskEnabled 1) 에 있어야 게이트 (γ) 가 불빛을 통과시킨다.
  out.midMaskP1 = await P1.page.evaluate(
    () =>
      window.__simCore.scene.getMeshByName('earth-lod-mid')?.material?._floats?.uMaskEnabled ??
      null,
  );
  out.midStrengthP2 = await readLightStrengths(P2);

  // ── D7 (2) low 정착 쌍 ──
  await settleLod(P1, 'low', 'low');
  await settleLod(P2, 'low', 'low');
  if (INJECT === 'mn7') {
    out.injectNote = await P1.page.evaluate(() => {
      const low = window.__simCore.scene.getMeshByName('earth-lod-low');
      if (!low?.material) return 'mn7 — earth-lod-low 부재 (주입 실패)';
      const C = low.material.emissiveColor.constructor;
      low.material.emissiveColor = new C(1, 1, 1);
      return 'mn7 — P1 earth-lod-low emissiveColor 백색';
    });
  }
  out.low = await measureCheckedPair(
    P1,
    await capture(P1, 'low-P1'),
    P2,
    await capture(P2, 'low-P2'),
    'low',
  );

  // ── D8 rotate=off — P1 독립 두 번째 로드 ↔ P1 주입 전 프레임 ──
  const P1b = await setupPage(browser, BASE_URL, Q.P1, 'P1b');
  out.d8Off = await measureCheckedPair(P1b, await capture(P1b, 'P1b'), P1, p1Pre, 'd8Off');
  // ── D8 rotate ON — 독립 2회 로드 ──
  const R1 = await setupPage(browser, BASE_URL, Q.ROT, 'R1');
  const R2 = await setupPage(browser, BASE_URL, Q.ROT, 'R2');
  out.d8On = await measureCheckedPair(
    R1,
    await capture(R1, 'R1'),
    R2,
    await capture(R2, 'R2'),
    'd8On',
  );

  const all = [P1, P2, P3, P4, P1b, R1, R2];
  out.settles = all.flatMap((p) => p.settles.map((s) => ({ page: p.label, ...s })));
  out.consoleErrors = Object.fromEntries(all.map((p) => [p.label, [...p.errors]]));
  for (const p of all) await p.context.close();
  return out;
}

/** MN-6 하네스 — 1~5 try / 6 finally. 결과 판정 (주입 유효성 · D6 R) 은 judge 가 한다. */
async function runMn6(pages, img) {
  const { P2, P3, P4 } = pages;
  const r = {};
  // V1 — P4 에 세기 0 overlay ↔ 설치 전 P4 (full frame 0 px)
  try {
    r.v1Install = await installOverlay(P4, { blockHost: false, overlay: true, strength: 0 });
    r.v1 = await measurePair(P4, await capture(P4, 'mn6-v1'), img.P4);
  } finally {
    r.v1Uninstall = await uninstallOverlay(P4);
  }
  // V2 — P2 (구름 OFF · 불빛 OFF) 에 세기 S overlay ↔ P1 (NI_land 기여 동일 · 픽셀당 ≤ 1 LSB)
  const S = (await readLightStrengths(P3))[0];
  try {
    r.v2Install = await installOverlay(P2, { blockHost: false, overlay: true, strength: S });
    r.v2 = await measurePair(P2, await capture(P2, 'mn6-v2'), img.P2, {
      land: img.GA,
      ref: img.P1,
    });
  } finally {
    r.v2Uninstall = await uninstallOverlay(P2);
  }
  // V3 — P3 에 1 단계만 ↔ P4 (full frame 0 px)
  try {
    r.v3Install = await installOverlay(P3, { blockHost: true, overlay: false });
    r.v3 = await measurePair(P3, await capture(P3, 'mn6-v3'), img.P4);
  } finally {
    r.v3Uninstall = await uninstallOverlay(P3);
  }
  // 변이 — P3 에 1~5 → D6 분자 프레임
  try {
    r.mnInstall = await installOverlay(P3, { blockHost: true, overlay: true });
    img.P3X = await capture(P3, 'mn6-P3X');
    r.mutated = await measurePair(P3, img.P3X, img.P4, { land: img.GA });
  } finally {
    r.mnUninstall = await uninstallOverlay(P3);
  }
  // V4 — 6 단계 원복 후 ↔ 주입 전 P3 (full frame 0 px)
  r.v4 = await measurePair(P3, await capture(P3, 'mn6-v4'), img.P3);
  return r;
}

/** D9 — develop tip (`BASE_URL_TIP`) 과 feature 의 full frame 동일성 3종 + 양성 대조. */
async function runD9(browser) {
  if (!BASE_URL_TIP) throw new Error('MODE=d9 는 BASE_URL_TIP 이 필요하다 (develop tip dev 서버)');
  const out = { mode: MODE, inject: INJECT, pairs: {} };
  const specs = [
    ['a', `${FOCUS}&nightlights=off`, FOCUS],
    ['b', `${FOCUS}&surface=off`, `${FOCUS}&surface=off`],
    ['c', `${FOCUS}&clouds=off&nightlights=off`, `${FOCUS}&clouds=off`],
    ['positive', FOCUS, FOCUS],
  ];
  const all = [];
  for (const [key, fq, tq] of specs) {
    const f = await setupPage(browser, BASE_URL, fq, `d9-${key}-feature`);
    const t = await setupPage(browser, BASE_URL_TIP, tq, `d9-${key}-tip`);
    all.push(f, t);
    out.pairs[key] = await measureCheckedPair(
      f,
      await capture(f, `d9-${key}-f`),
      t,
      await capture(t, `d9-${key}-t`),
      `d9-${key}`,
    );
    out.pairs[key].strengthsFeature = await readLightStrengths(f);
  }
  out.settles = all.flatMap((p) => p.settles.map((s) => ({ page: p.label, ...s })));
  out.consoleErrors = Object.fromEntries(all.map((p) => [p.label, [...p.errors]]));
  for (const p of all) await p.context.close();
  return out;
}

/**
 * 쌍 × 전제 적용표 (SSoT — 실행마다 인쇄). ✅ = 적용, ❌ = 비적용 (사유 열).
 *   전제 1 (settle) · 4 (위상각) · 6 (측정 오류 · 기하) 은 모든 쌍에 적용한다.
 */
const PREMISE_TABLE = [
  // [쌍, 쓰는 게이트, 전제2 대역, 전제3 DI 휘도 페이지, 전제5 OFF 페이지, 전제7, 비고]
  ['main', 'D2 D3 D4 D5', 'NI · DI · NI_land · NI_sea', 'P2', 'P2', '—', ''],
  ['cloud', 'D6', 'NI_land', 'P4', 'P4', 'NI_land P4≠P2', ''],
  ['mid', 'D7(1)', 'NI', 'P2 (mid)', 'P2 (mid)', '—', ''],
  [
    'low',
    'D7(2)',
    'NI',
    '— (재조정 — 대역이 씬 배경)',
    '— (billboard 에 uniform 없음)',
    '—',
    '지구가 그려졌는지 보증 안 함',
  ],
  ['d8Off', 'D8', 'NI', 'P1b', '— (두 페이지 모두 불빛 ON)', '—', ''],
  ['d8On', 'D8', 'NI', 'R1', '— (두 페이지 모두 불빛 ON)', '—', ''],
  ['p2Restore', '(주입 원복 확인)', '—', '—', '—', '—', 'full frame 0 px 아니면 측정 오류'],
  [
    'd9 a/b/c',
    'D9',
    '—',
    'feature 페이지 (b 는 surface off 라 적용)',
    'a · c feature 페이지',
    'positive 쌍 변화 > 0',
    'MODE=d9',
  ],
];

function requireThresholds() {
  const t = {
    T_NIGHT,
    T_DARK,
    K_OCC,
    MIN_EXPECTED_NIGHT,
    MIN_EXPECTED_DAY,
    MIN_EXPECTED_NIGHT_LAND,
    MIN_EXPECTED_NIGHT_SEA,
    MIN_EXPECTED_CLOUDED_LAND,
  };
  const missing = Object.entries(t)
    .filter(([, v]) => v === null)
    .map(([k]) => k);
  if (missing.length && MODE !== 'profile')
    throw new Error(
      `임계 미도출 — ${missing.join(', ')} (MODE=profile 로 baseline 을 먼저 잰다) — fail-closed`,
    );
}

function judgeMain(r) {
  const errs = [];
  for (const k of ['main', 'cloud', 'mid', 'low', 'd8Off', 'd8On', 'p2Restore', 'gateVsAmp'])
    if (r[k]?.error) errs.push(`${k}: ${r[k].error}`);
  if (r.mn6)
    for (const k of ['v1', 'v2', 'v3', 'v4', 'mutated'])
      if (r.mn6[k]?.error) errs.push(`mn6.${k}: ${r.mn6[k].error}`);
  const unmeasurable = errs.map((e) => `(6) 측정 오류 — ${e}`);
  if (unmeasurable.length) return { unmeasurable };
  if (r.p2Restore.fullChanged !== 0)
    unmeasurable.push(
      `(6) 게이트 맵 주입 원복 실패 — P2 full frame 변화 ${r.p2Restore.fullChanged} px`,
    );

  for (const s of r.settles)
    if (s.timedOut)
      unmeasurable.push(
        `(1) LOD 정착 상한 초과 — ${s.page}/${s.step} (${s.waitedMs}ms, dist=${s.dist} fading=${s.fading})`,
      );
  if (r.midMaskP1 !== 1)
    unmeasurable.push(
      `(6) mid variant uMaskEnabled ${r.midMaskP1} ≠ 1 — mid 정착이 마스크 경로가 아니다 (#1228 회귀 — D7(1) 이 게이트 (γ) 로 구조적 0)`,
    );
  // 전제 5 — **하네스 설정**만 묻는다: OFF 페이지에서 읽힌 불빛 세기 값 중 비-0 이 있으면 설정 실패다.
  // uniform 이 아예 읽히지 않으면 (`[]`) 「불빛 활성」 이 아니므로 전제 위배가 아니다 — 바인딩이 사라진 결함
  // (MN-2) 은 GL 기본값 `0` 으로 불빛이 꺼지는 **제품 속성**이라 D2 가 FAIL 로 잡아야 한다 (#1215 X2 —
  // 전제에 제품 속성을 섞으면 결함이 exit 2 뒤로 숨는다).
  for (const [label, v] of [
    ['P2', r.strengths.P2],
    ['P4', r.strengths.P4],
    ['P2 (mid)', r.midStrengthP2],
  ])
    if (v.some((x) => x !== 0))
      unmeasurable.push(
        `(5) 불빛 OFF 페이지 ${label} 의 nightLightStrength ${JSON.stringify(v)} — 비-0 (플래그가 불빛을 끄지 못했다)`,
      );

  const prof = MODE === 'profile';
  const lt = (n, min) => min !== null && n < min;
  const m = r.main;
  const pairs = [
    ['main', m],
    ['cloud', r.cloud],
    ['mid', r.mid],
    ['low', r.low],
    ['d8Off', r.d8Off],
    ['d8On', r.d8On],
  ];
  for (const [label, p] of pairs) {
    if (p.phaseAlphaDeg < MIN_PHASE_ALPHA_DEG)
      unmeasurable.push(`(4) [${label}] 위상각 ${p.phaseAlphaDeg}deg < ${MIN_PHASE_ALPHA_DEG}deg`);
    if (label !== 'cloud' && lt(p.NI.n, MIN_EXPECTED_NIGHT))
      unmeasurable.push(`(2) [${label}] NI N=${p.NI.n} < MIN_EXPECTED_NIGHT ${MIN_EXPECTED_NIGHT}`);
    // 전제 3 — 불빛 OFF (또는 두 번째) 페이지 DI 평균 휘도. low 쌍을 **제외한** 전 쌍에 적용한다.
    // ⚠️ 계약 재조정 (사용자 결정 — #1226 코멘트 5682445336, `verify:1215` judge 선례 채택):
    // low 정착 쌍의 DI 평균 휘도는 [실측] `0.035593` 으로 씬 배경색 (clear color 8-bit `(8, 9, 13)`) 의
    // Rec.709 휘도와 같다 — low 대역은 배경이라 전제 3 을 걸면 가드가 매 실행 `exit 2` 다. low 에는 전제 2
    // (표본 수) 만 건다. ⚠️ 한계: **low 프레임에 지구가 실제로 그려졌는지는 보증하지 않는다** — 전제 2 는
    // 기하 계수이고 D2 는 high 프레임 값이다. D7 (2) 의 픽셀 항은 「배경 위에 불빛이 그려짐」 (MN-7) 만 잡는다.
    if (label !== 'low' && (p.DI.lumB === null || p.DI.lumB < MIN_DAY_LIT_LUM))
      unmeasurable.push(`(3) [${label}] DI 평균 휘도 ${p.DI.lumB} < ${MIN_DAY_LIT_LUM}`);
  }
  if (lt(m.DI.n, MIN_EXPECTED_DAY))
    unmeasurable.push(`(2) [main] DI N=${m.DI.n} < MIN_EXPECTED_DAY ${MIN_EXPECTED_DAY}`);
  if (lt(m.NI_land.n, MIN_EXPECTED_NIGHT_LAND))
    unmeasurable.push(
      `(2) [main] NI_land N=${m.NI_land.n} < MIN_EXPECTED_NIGHT_LAND ${MIN_EXPECTED_NIGHT_LAND}`,
    );
  if (lt(m.NI_sea.n, MIN_EXPECTED_NIGHT_SEA))
    unmeasurable.push(
      `(2) [main] NI_sea N=${m.NI_sea.n} < MIN_EXPECTED_NIGHT_SEA ${MIN_EXPECTED_NIGHT_SEA}`,
    );
  if (lt(r.cloud.NI_land.n, MIN_EXPECTED_NIGHT_LAND))
    unmeasurable.push(
      `(2) [cloud] NI_land N=${r.cloud.NI_land.n} < MIN_EXPECTED_NIGHT_LAND ${MIN_EXPECTED_NIGHT_LAND}`,
    );
  if (lt(m.NI_land.cloudChanged, MIN_EXPECTED_CLOUDED_LAND))
    unmeasurable.push(
      `(7) D6 양성 대조 — NI_land P4≠P2 ${m.NI_land.cloudChanged} px < MIN_EXPECTED_CLOUDED_LAND ${MIN_EXPECTED_CLOUDED_LAND}`,
    );

  // MN-6 주입 유효성 (V1~V4) — 위배 시 변이 실행은 PASS/FAIL 이 아니라 무효 (§A11.17.3)
  if (r.mn6) {
    const x = r.mn6;
    const invalid = [];
    if (x.v1.fullChanged !== 0)
      invalid.push(`V1 세기 0 overlay ↔ P4 full frame ${x.v1.fullChanged} px`);
    if (x.v2.NI_land.refOver1LsbPx !== 0)
      invalid.push(`V2 overlay-on-P2 ↔ P1 NI_land 채널차 > 1 LSB ${x.v2.NI_land.refOver1LsbPx} px`);
    if (x.v3.fullChanged !== 0)
      invalid.push(`V3 host 차단 P3 ↔ P4 full frame ${x.v3.fullChanged} px`);
    if (x.v4.fullChanged !== 0)
      invalid.push(`V4 원복 P3 ↔ 주입 전 P3 full frame ${x.v4.fullChanged} px`);
    if (invalid.length) unmeasurable.push(...invalid.map((s) => `(MN-6 주입 무효) ${s}`));
  }
  if (unmeasurable.length) return { unmeasurable };
  if (prof) return { profile: true };

  const d2 = m.NI.meanContrib;
  const d2Pass = d2 >= T_NIGHT;
  const num = r.mn6 ? r.mn6.mutated.NI_land.meanContrib : r.cloud.NI_land.meanContrib;
  const den = m.NI_land.meanContrib;
  const ratio = den > 0 ? num / den : null;
  const allErrors = Object.values(r.consoleErrors).flat();
  const gates = [
    ['D2 NI 평균 기여 lum(P1) − lum(P2)', d2, `>= ${T_NIGHT}`, d2Pass],
    ['D3 DI 변화 px (P1 ↔ P2)', m.DI.changed, '== 0 ∧ D2 PASS', m.DI.changed === 0 && d2Pass],
    [
      'D4 NI_land 변화 없는 비율',
      m.NI_land.unchangedRatio,
      `>= ${T_DARK}`,
      m.NI_land.unchangedRatio >= T_DARK,
    ],
    [
      'D5 NI_sea 변화 px (P1 ↔ P2)',
      m.NI_sea.changed,
      '== 0 ∧ D2 PASS',
      m.NI_sea.changed === 0 && d2Pass,
    ],
    [
      `D6 R = NI_land (P3${r.mn6 ? 'X' : ''} − P4) / (P1 − P2)`,
      ratio,
      `<= 1 − K_OCC = ${(1 - K_OCC).toFixed(6)} ∧ D2 PASS`,
      ratio !== null && ratio <= 1 - K_OCC && d2Pass,
    ],
    [
      'D7(1) mid 정착 쌍 NI 기여',
      r.mid.NI.meanContrib,
      `>= ${T_NIGHT}`,
      r.mid.NI.meanContrib >= T_NIGHT,
    ],
    [
      'D7(2) low 정착 쌍 disk 변화 px',
      r.low.disk.changed,
      '== 0 ∧ D2 PASS',
      r.low.disk.changed === 0 && d2Pass,
    ],
    [
      'D8 rotate=off 독립 2회 로드 NI 변화 px',
      r.d8Off.NI.changed,
      '== 0 ∧ D2 PASS',
      r.d8Off.NI.changed === 0 && d2Pass,
    ],
    [
      'D8 rotate ON 독립 2회 로드 NI 변화 px',
      r.d8On.NI.changed,
      '== 0 ∧ D2 PASS',
      r.d8On.NI.changed === 0 && d2Pass,
    ],
    [
      'D11 콘솔 에러 (전 페이지)',
      String(allErrors.length),
      '!hasSimErrors',
      !hasSimErrors(allErrors),
    ],
  ];
  return { gates };
}

function judgeD9(r) {
  const unmeasurable = [];
  for (const [k, p] of Object.entries(r.pairs))
    if (p.error) unmeasurable.push(`(6) 측정 오류 — d9-${k}: ${p.error}`);
  if (unmeasurable.length) return { unmeasurable };
  for (const s of r.settles)
    if (s.timedOut)
      unmeasurable.push(`(1) LOD 정착 상한 초과 — ${s.page}/${s.step} (${s.waitedMs}ms)`);
  for (const [k, p] of Object.entries(r.pairs)) {
    if (p.phaseAlphaDeg < MIN_PHASE_ALPHA_DEG)
      unmeasurable.push(`(4) [d9-${k}] 위상각 ${p.phaseAlphaDeg}deg`);
    if (p.DI.lumA === null || p.DI.lumA < MIN_DAY_LIT_LUM)
      unmeasurable.push(`(3) [d9-${k}] feature DI 평균 휘도 ${p.DI.lumA} < ${MIN_DAY_LIT_LUM}`);
  }
  for (const k of ['a', 'c']) {
    const v = r.pairs[k].strengthsFeature;
    if (v.some((x) => x !== 0))
      unmeasurable.push(`(5) [d9-${k}] feature OFF 페이지 nightLightStrength ${JSON.stringify(v)}`);
  }
  if (r.pairs.positive.fullChanged === 0)
    unmeasurable.push('(7) D9 양성 대조 — 불빛 ON feature ↔ develop tip full frame 변화 0 px');
  if (unmeasurable.length) return { unmeasurable };
  if (MODE === 'profile') return { profile: true };
  const allErrors = Object.values(r.consoleErrors).flat();
  const gates = [
    [
      'D9 (a) ?nightlights=off ↔ tip full frame 변화 px',
      r.pairs.a.fullChanged,
      '== 0',
      r.pairs.a.fullChanged === 0,
    ],
    [
      'D9 (b) ?surface=off ↔ tip ?surface=off full frame 변화 px',
      r.pairs.b.fullChanged,
      '== 0',
      r.pairs.b.fullChanged === 0,
    ],
    [
      'D9 (c) ?clouds=off&nightlights=off ↔ tip ?clouds=off full frame 변화 px',
      r.pairs.c.fullChanged,
      '== 0',
      r.pairs.c.fullChanged === 0,
    ],
    [
      'D9 양성 대조 (진단) 불빛 ON ↔ tip full frame 변화 px',
      r.pairs.positive.fullChanged,
      '> 0',
      r.pairs.positive.fullChanged > 0,
    ],
    [
      'D11 콘솔 에러 (D9 전 페이지)',
      String(allErrors.length),
      '!hasSimErrors',
      !hasSimErrors(allErrors),
    ],
  ];
  return { gates };
}

function printMain(r) {
  const brief = (m) =>
    m?.error
      ? `error ${m.error}`
      : JSON.stringify({
          phase: m.phaseAlphaDeg,
          NI: m.NI,
          DI: m.DI,
          NI_land: m.NI_land,
          NI_sea: m.NI_sea,
          disk: m.disk,
          fullChanged: m.fullChanged,
          outsideChanged: m.outsideChanged,
        });
  console.log(`main (P1↔P2): ${brief(r.main)}`);
  console.log(`cloud (P3↔P4): ${brief(r.cloud)}`);
  console.log(`mid: ${brief(r.mid)}`);
  console.log(`low: ${brief(r.low)}`);
  console.log(`d8Off: ${brief(r.d8Off)}`);
  console.log(`d8On: ${brief(r.d8On)}`);
  console.log(
    `p2Restore fullChanged ${r.p2Restore?.fullChanged} · gate G↔GA NI changed ${r.gateVsAmp?.NI?.changed}`,
  );
  console.log(
    `strengths ${JSON.stringify(r.strengths)} · mid P2 ${JSON.stringify(r.midStrengthP2)} · mid P1 uMaskEnabled ${r.midMaskP1} · WAIT_ADVANCE_MS ${WAIT_ADVANCE_MS}`,
  );
  if (!r.main.error && !r.cloud.error) {
    const den = r.main.NI_land.meanContrib;
    const rBase = den > 0 ? r.cloud.NI_land.meanContrib / den : null;
    console.log(
      `[D6 · §A11.17.5 조건 1] R_baseline ${rBase} · 불빛∩구름 px ${r.main.NI_land.overlap} · NI_land P4≠P2 ${r.main.NI_land.cloudChanged} · NI_land 채널 포화 px P1 ${r.main.NI_land.saturatedPxA} · P3 ${r.cloud.NI_land.saturatedPxA}`,
    );
    if (r.mn6 && !r.mn6.mutated?.error) {
      const rC4 = r.mn6.mutated.NI_land.meanContrib / den;
      const kOcc = K_OCC ?? (rBase !== null ? (1 - rBase) / 3 : null);
      console.log(
        `[MN-6] R_C4 ${rC4} · |1 − R_C4| ${Math.abs(1 - rC4)} · K_OCC ${kOcc} (${K_OCC === null ? '이 실행 baseline ÷ 3 예시' : '가드 상수'}) · 판별 여유 K_OCC/|1−R_C4| ${kOcc !== null ? kOcc / Math.abs(1 - rC4) : null}`,
      );
      console.log(
        `[MN-6 V] V1 full ${r.mn6.v1.fullChanged} · V2 NI_land 기여 overlay ${r.mn6.v2.NI_land.meanContrib} vs P1 ${r.mn6.v2.NI_land.refMeanContrib} · 최대 |Δlum| ${r.mn6.v2.NI_land.refMaxAbsLum} · >1LSB ${r.mn6.v2.NI_land.refOver1LsbPx} px · V3 full ${r.mn6.v3.fullChanged} · V4 full ${r.mn6.v4.fullChanged} · 변이 full ${r.mn6.mutated.fullChanged}`,
      );
      console.log(
        `[MN-6 install] ${JSON.stringify({ v1: r.mn6.v1Install, v2: r.mn6.v2Install, v3: r.mn6.v3Install, mn: r.mn6.mnInstall })}`,
      );
    }
  }
  console.log(
    `settles ${JSON.stringify(r.settles.map((s) => `${s.page}/${s.step}:${s.dist}/${s.fading}/${s.timedOut ? 'TIMEOUT' : 'ok'}`))}`,
  );
  console.log(`consoleErrors ${JSON.stringify(r.consoleErrors)}`);
}

async function main() {
  requireThresholds();
  const gpu = SWIFTSHADER ? 'swiftshader' : 'default';
  const r = await withBrowser({ gpu }, MODE === 'd9' ? runD9 : runMain, { launch: launchBrowser });
  console.log(
    `=== #1226 야간 도시 불빛 — 진단 (MODE=${MODE} INJECT=${INJECT}${r.injectNote ? ` — ${r.injectNote}` : ''}) ===`,
  );
  console.log('쌍 × 전제 적용표 (전제 1 · 4 · 6 은 전 쌍):');
  for (const row of PREMISE_TABLE) console.log(`  ${row.join(' | ')}`);
  if (MODE === 'd9') {
    for (const [k, p] of Object.entries(r.pairs))
      console.log(
        `d9-${k}: ${p.error ? `error ${p.error}` : JSON.stringify({ fullChanged: p.fullChanged, outsideChanged: p.outsideChanged, disk: p.disk, DI: p.DI, strengthsFeature: p.strengthsFeature })}`,
      );
    console.log(`consoleErrors ${JSON.stringify(r.consoleErrors)}`);
  } else {
    printMain(r);
  }
  if (MODE === 'profile') console.log(`BASELINE_JSON ${JSON.stringify(r)}`);

  const v = MODE === 'd9' ? judgeD9(r) : judgeMain(r);
  if (v.unmeasurable) {
    console.error('\n[측정 불가] 유효성 전제 미충족 — PASS 도 FAIL 도 내지 않는다:');
    for (const u of v.unmeasurable) console.error(`  - ${u}`);
    return EXIT_UNMEASURABLE;
  }
  if (v.profile) {
    console.log('\n[profile] 진단 전용 — 게이트 미판정.');
    return 0;
  }
  console.log('\n=== 게이트 ===');
  let anyFail = false;
  for (const [name, value, cond, ok] of v.gates) {
    const s = typeof value === 'number' ? value.toFixed(6) : value;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name} = ${s}  (${cond})`);
    if (!ok) anyFail = true;
  }
  console.log(anyFail ? '\n[FAIL] 게이트 미충족' : `\n[PASS] 게이트 ${v.gates.length}종 전건 충족`);
  return anyFail ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
