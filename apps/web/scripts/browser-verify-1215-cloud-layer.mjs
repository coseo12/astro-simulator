#!/usr/bin/env node
/**
 * #1215 — 지구 구름 레이어 동적 검증 (ADR `20260628-756` Amendment 10 §A10.11).
 *
 * **무엇을 재는가**: 같은 결정적 프레임을 구름 ON (기본) / OFF (`&clouds=off`) **두 페이지**에서 찍어
 * 지구 disk 를 **기하로만** (ray-sphere 역투영 법선 — `verify:1202` 와 같은 식) 대역으로 나누고,
 * 대역별 휘도 차이·맑은 하늘 비율·투명 큐·LOD 거동·자전 결정성을 판정한다.
 *
 * ⚠️ OFF 는 런타임 비활성이 아니라 **URL flag 로 연 두 번째 페이지**다 — `?clouds=off` 는 구름 mesh
 * 미생성 + 정렬 함수 미설치로 구름 도입 전과 같은 코드 경로이고 (§A10.9), 런타임 `setEnabled(false)` 는
 * mesh 와 정렬 함수가 남아 동일성을 따로 증명해야 한다 (§A10.10).
 *
 * ## 게이트 (§A10.11 — C1~C8)
 *   C1  대역 평균 |lum(ON) − lum(OFF)| ≥ T_DELTA                  — 「구름이 안 보인다」의 문자 그대로의 부정
 *   C2  대역 중 OFF 채널에 정확히 255 가 없는 픽셀만 표본으로, 맑은 하늘 비율 (채널 최대차 == 0) ≥ T_CLEAR
 *                                                                  — 과다 상한 (C1 이 눈먼 방향 — §A8.8 M-6 동형)
 *   C3  투명 큐: ON 개수 − OFF 개수 == 1 ∧ ON 이름 목록에 earth-cloud — 계약 재조정 1 (큐를 잰다)
 *   C4  !hasSimErrors (두 페이지 · 전 페이지, pageerror 포함)
 *   C5  mid 정착 쌍 C1 량 ≥ T_DELTA ∧ fade 창 정지 쌍 C1 량 ≥ mid 정착 쌍 C1 량 ÷ 3  — 결정 4
 *   C6  low 정착: cloud.isVisible === false ∧ low 쌍 disk 변화 px == 0 (∧ C1 PASS 선행 결합) — 결정 5
 *   C7  rotate ON: 같은 JD 독립 2회 로드 disk 변화 px == 0 ∧ JD+Δjd 구름 local 회전각 차 = Δjd × ω (구조 읽기)
 *   C8  rotate=off: JD 2점 모두 구름 local 회전 identity ∧ 독립 2회 로드 disk 변화 px == 0
 *
 * ## 「측정 불가」 (exit 2 — PASS 도 FAIL 도 아니다. fallback 분기 금지)
 *   1 어느 페이지든 waitForLodSettle timedOut   2 OFF 대역 표본 N < MIN_EXPECTED
 *   3 OFF 대역 평균 휘도 < MIN_DAY_LIT_LUM       4 위상각 < MIN_PHASE_ALPHA_DEG
 *   5 ?clouds=off 페이지에 구름 mesh 존재         6 measure() 가 error 를 반환 — **모든 게이트보다 먼저 본다**
 *   7 C2 표본 (포화 제외 후) N < MIN_EXPECTED
 *   8 fade 정지 재현의 투명 큐에 earth-cloud 와 earth-lod-mid 가 둘 다 있지 않다 (C5b 전제)
 *   ⚠️ 2 · 3 은 주 쌍만이 아니라 **판정에 쓰이는 모든 쌍**에 건다 (low 는 2 만) — judge() 의 표 주석.
 *   6 에는 비유한 · 퇴화 기하 (반경 ≤ 0) 와 쌍별 페이지 기하 불일치도 포함된다.
 *
 * ## `== 0` 술어는 지구 disk 내부로 한정한다 (#1215 Phase 1a 실측)
 * 같은 조건 독립 로드에서 **disk 밖** 픽셀이 실행에 따라 달라지는 비결정이 관측됐다 (disk 내부는 동일 —
 * 원인 미규명, 실행마다 개수가 달라 수치는 적지 않는다). full frame 으로 재면 그 비결정에 걸린다.
 *
 * ## 주입 대상 한정 (#1215 Phase 1a 실측)
 * 기존 injector (`verify:783` · `verify:1119` · `verify:1202` `injectFloats`) 는 `earth.getChildMeshes()`
 * 를 순회해 **구름 머티리얼까지** 패치한다 (구름 ON 에서 「머티리얼 2개 패치」, OFF 에서 `1`). 이 가드의
 * 런타임 변이는 `scene.getMeshByName('earth-cloud').material` **하나만** 건드린다 — 표면 셰이더를 건드리면
 * C1 의 OFF 항까지 움직여 변이가 겨냥한 축이 섞인다.
 *
 * ## 모드 / 변이
 *   node browser-verify-1215-cloud-layer.mjs             # 게이트
 *   MODE=profile ...                                     # 게이트 없이 대역별 baseline 인쇄 (임계 도출용)
 *   INJECT=mc6 ...   # 과다 커버 (cloudCover −1 · opacity 1) — C2 단독 FAIL 겨냥 (C1 은 PASS)
 *   INJECT=mc7 ...   # 콘솔 에러 1건 — C4
 *   INJECT=mc9 ...   # 구름 needAlphaBlending 거짓 — C3
 *
 * 환경: HEADFUL=0 (CI headless) · SWIFTSHADER=1 (headless + --use-angle=swiftshader) · BASE_URL · CAPTURE_DIR
 */

import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
// C7 구조 읽기의 기대값 `ω` 는 core SSoT 에서 받는다 (가드 안에 풍속·반경을 다시 적으면 숨은 상수
// drift — volt #69). ⚠️ `@astro-simulator/core/scene` 배럴은 node 에서 로드되지 않는다 — 배럴이 끌어오는
// `dist/gpu/index.js` 의 확장자 없는 import (`./capability`) 가 번들러 전용 해석이라서다 [실측 —
// ERR_MODULE_NOT_FOUND]. 그래서 모듈 파일을 직접 가리킨다 (CI 는 verify 전에 core 를 빌드한다).
import { computeCloudDriftOmega } from '../../../packages/core/dist/scene/cloud-layer.js';
import { getSolarSystem } from '@astro-simulator/core/ephemeris';
import {
  bootstrapScene,
  collectConsoleErrors,
  hasSimErrors,
  launchBrowser,
  resolveBaseUrl,
  waitForLodSettle,
  withBrowser,
} from '../../../scripts/browser-verify-utils.mjs';

const BASE_URL = resolveBaseUrl();
const CAPTURE_DIR = process.env.CAPTURE_DIR ?? null;
const SWIFTSHADER = process.env.SWIFTSHADER === '1';
const MODE = process.env.MODE ?? 'dod';
const INJECT = process.env.INJECT ?? 'none';

/** 결정적 프레임 JD — `verify:1202` / `verify:783` / `verify:1119` 와 동일. */
const T_JD = 2451626.0;
/** C7 · C8 의 두 번째 JD 간격 [day]. `Δjd × ω` 가 `0` 과 `2π` 에서 멀어야 차등이 구조 읽기로 드러난다. */
const DELTA_JD = 1;

/** 결정적 프레임 쿼리 — `verify:1202` `FOCUS_QUERY` 와 동일 (`gpu=a` 필수 — 1202 주석 참조). */
const QUERY_ON = '?gpu=a&focus=earth&lod=auto&rotate=off&orbits=off';
/** 구름 OFF — URL flag 두 번째 페이지 (§A10.10). */
const QUERY_OFF = `${QUERY_ON}&clouds=off`;
/** C7 — 자전 ON (rotate 기본값). */
const QUERY_ROTATE = '?gpu=a&focus=earth&lod=auto&orbits=off';

const CLOUD_MESH = 'earth-cloud';
const EXIT_UNMEASURABLE = 2;

// ── 대역 정의 — `verify:1202` 가 SSoT (정의·값 동일, 주석으로 참조 — §A10.11 「새 대역 상수 0」) ──
/** `browser-verify-1202-atmosphere-rim.mjs` `INNER_NDV_MIN` 과 동일. */
const INNER_NDV_MIN = 0.6;
/** `browser-verify-1202-atmosphere-rim.mjs` `DAY_NDL_MIN` 과 동일. */
const DAY_NDL_MIN = 0.15;
/** `browser-verify-1202-atmosphere-rim.mjs` `NIGHT_NDL_MAX` 와 동일 (후보 대역 진단용). */
const NIGHT_NDL_MAX = -0.15;
/** `browser-verify-1202-atmosphere-rim.mjs` `MIN_DAY_LIT_LUM` 과 정의·값 동일 (측정 불가 3). */
const MIN_DAY_LIT_LUM = 0.15;
/** `browser-verify-1202-atmosphere-rim.mjs` `MIN_PHASE_ALPHA_DEG` 와 정의·값 동일 (측정 불가 4). */
const MIN_PHASE_ALPHA_DEG = 10;

// ── 임계 — §A10.11 도출 규칙 (baseline ÷ 3 — §A8.8 G1~G3 · G6 과 같은 관례) ──────────────
// baseline [실측]: D1 승인 파라미터 (후보 B — 반경비 1.01 · cover 0.5 · opacity 0.9) · headless chromium
// `--use-angle=swiftshader` (`SWIFTSHADER=1 HEADFUL=0`) · 1280×720 · JD 2451626.0 · `MODE=profile` **5회 —
// 다섯 실행이 판정량 전 항목에서 동일 (산포 `0`)** — **로컬** swiftshader 에 한한다. CI 렌더러 (run
// 34591856729, `5f72be7`) 와는 소수 4~5 자리 차이가 있다 (예: C1 `0.034201` vs `0.034194` · 맑은 하늘 비율
// `0.55598` vs `0.55624` · C2 표본 `4225` vs `4223`) — 임계 (÷ 3) 와는 멀어 판정에 영향이 없고 임계는 바꾸지 않았다. (6번째 시도 1건은 동시 실행 중이던 Rust 빌드와의
// 경합으로 `bootstrapScene` 핸들 대기 20 s 가 초과돼 **예외 exit 1** 로 끝났다 — 측정값이 없어 표본에서
// 제외했고 재실행분을 쓴다. 판정 경로에 들어가기 전의 크래시라 fail-closed 방향이다.)
// ⚠️ 이 숫자는 설계 스케치의 예측이 아니라 전부 이 스크립트의 실행 출력이다.
/**
 * C1 · C5a 하한 = baseline 낮면 내부 평균 |ΔL| `0.034201` ÷ 3 = `0.011400`.
 * 비교: 같은 프레임의 밤면 내부 `0.02294` · mid 정착 쌍 `0.019252` (C5a 여유 1.69배).
 */
const T_DELTA = 0.0114;
/**
 * C2 하한 = baseline 맑은 하늘 비율 `0.55598` (OFF 포화 제외 후 표본 `4225` 중 채널 최대차 `0`) ÷ 3
 * = `0.185327`. baseline 이 `0` 이 아니므로 도출 가능 (§A10.11 — `0` 이면 C2 재설계 대상).
 */
const T_CLEAR = 0.1853;
/**
 * 측정 불가 2 · 7 의 표본 하한 = ⌊baseline 낮면 내부 N `7225` ÷ 3⌋ = `2408` (C2 표본에도 같은 값 재사용 —
 * 새 상수 `0`). baseline C2 표본은 포화 `3000` 제외 후 `4225` 로 하한의 1.75배.
 *
 * **대역 판단 (#1215 Phase 1b)** — §A10.11 이 낮면 내부를 고른 근거 문장 (「밤면은 구름도 어두워 변화
 * 없음과 섞인다」) 은 D1 캡처에서 반증됐다 (밤면 구름이 밝은 회색 — 코멘트 5632521560). 그래서 대역을
 * 미리 정하지 않고 baseline 으로 다시 재서 **낮면 내부를 유지**했다: 포화 제외 후에도 C2 표본이 하한
 * 위에 있고 (`4225 ≥ 2408`), C1 량은 밤면 내부 `0.02294` 보다 크다 (`0.034201`) — 대역을 옮겨 얻는
 * 판별력이 없다. 하한 미달 시에는 「측정 불가」 로 끝나므로 어느 쪽이든 fail-closed 다.
 */
const MIN_EXPECTED = 2408;
/** C7 구조 읽기의 부동소수 왕복 허용 (quaternion → atan2). 임계가 아니라 수치 표현 오차 상한. */
const ANGLE_EPS_RAD = 1e-9;

async function setupPage(browser, query, label) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors = collectConsoleErrors(page);
  await bootstrapScene(page, {
    baseUrl: BASE_URL,
    query,
    handles: ['__simCore', '__solarScene'],
    settleMs: 2800,
  });
  await page.evaluate((jd) => {
    window.__simCore.command({ type: 'jumpToJulianDate', julianDate: jd });
    window.__simCore.command({ type: 'pause' });
  }, T_JD);
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    window.__simCore.scene.activeCamera.beta = Math.PI / 2;
  });
  const settle = await waitForLodSettle(page);
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
    await writeFile(path.join(CAPTURE_DIR, `1215-${name}.png`), buf);
  }
  return buf.toString('base64');
}

async function settleLod(ctx, step, override) {
  await ctx.page.evaluate((o) => window.__solarScene.setLodOverride(o), override);
  await frames(ctx.page, 2);
  const s = await waitForLodSettle(ctx.page);
  ctx.settles.push({ step, ...s });
}

async function jumpTo(ctx, jd) {
  await ctx.page.evaluate((j) => {
    window.__simCore.command({ type: 'jumpToJulianDate', julianDate: j });
    window.__simCore.command({ type: 'pause' });
  }, jd);
  // 일시정지 중 jump 는 프레임을 양보해야 updateAt 이 돈다 (Phase 0 실측 — 양보 없이 읽으면 전부 같은 값).
  await ctx.page.waitForTimeout(400);
  await frames(ctx.page, 4);
}

/** 구름 local 회전 quaternion — 구조 읽기 (C7 · C8). mesh 부재면 null. */
const readCloudQuat = (ctx) =>
  ctx.page.evaluate((n) => {
    const q = window.__simCore.scene.getMeshByName(n)?.rotationQuaternion;
    return q ? [q.x, q.y, q.z, q.w] : null;
  }, CLOUD_MESH);

/** 렌더링 그룹 0 투명 큐 (Babylon internal — 계약 재조정 1: 픽셀이 아니라 **큐**를 잰다). */
const readTransparentQueue = async (ctx) => {
  await frames(ctx.page, 2);
  return ctx.page.evaluate(() => {
    const g = window.__simCore.scene._renderingManager?._renderingGroups?.[0];
    const q = g?._transparentSubMeshes;
    if (!q) return { error: '렌더링 그룹 0 투명 큐 조회 실패' };
    return { names: q.data.slice(0, q.length).map((s) => s.getMesh().name) };
  });
};

/** fade 창 정지 재현 — architect §A10.12 동형 (host · mid 매 프레임 isVisible + material.alpha 0.999). */
const installFadeFreeze = (ctx) =>
  ctx.page.evaluate(() => {
    const scene = window.__simCore.scene;
    const host = window.__solarScene.meshes.get('earth');
    const mid = scene.getMeshByName('earth-lod-mid');
    if (!host || !mid) return { error: 'earth / earth-lod-mid 부재' };
    window.__fadeFreeze = scene.onBeforeRenderObservable.add(() => {
      host.isVisible = true;
      mid.isVisible = true;
      host.material.alpha = 0.999;
      mid.material.alpha = 0.999;
    });
    return { ok: true };
  });
const removeFadeFreeze = (ctx) =>
  ctx.page.evaluate(() => {
    const scene = window.__simCore.scene;
    if (window.__fadeFreeze) scene.onBeforeRenderObservable.remove(window.__fadeFreeze);
    window.__fadeFreeze = null;
  });

/**
 * ON/OFF 프레임 쌍의 대역별 측정. 역투영은 `verify:1202` `measure()` 와 같은 식 (카메라 basis + 수직 FOV
 * 로 픽셀별 world ray 를 만들어 구와 교차). 기하는 **이 페이지 (ctx) 의 카메라**로 계산하고, 다른
 * 페이지의 기하와 **정확히 같은지** 호출부가 대조한다 (`geomKey`).
 */
async function measurePair(ctx, onB64, offB64) {
  return ctx.page.evaluate(
    async ({ on, off, P }) => {
      const scene = window.__simCore?.scene;
      const mesh = window.__solarScene?.meshes?.get('earth');
      if (!scene || !mesh) return { error: 'earth mesh/scene 부재' };
      const engine = scene.getEngine();
      const rw = engine.getRenderWidth();
      const rh = engine.getRenderHeight();
      const camera = scene.activeCamera;
      const Vector3 = mesh.getAbsolutePosition().constructor;
      const forward = camera.getDirection(new Vector3(0, 0, 1));
      const right = camera.getDirection(new Vector3(1, 0, 0));
      const up = camera.getDirection(new Vector3(0, 1, 0));
      const camPos = camera.globalPosition ?? camera.position;
      const center = mesh.getAbsolutePosition();
      // Babylon 구의 boundingSphere 는 AABB 반대각선 (r√3) — 1202 와 같은 보정.
      const radiusWorld = mesh.getBoundingInfo().boundingSphere.radiusWorld / Math.sqrt(3);
      let sunPos = null;
      for (const l of scene.lights) {
        if (l.position && (l.name === 'sun-light' || l.getClassName?.() === 'PointLight')) {
          sunPos = l.position;
          break;
        }
      }
      if (!sunPos) return { error: 'sunLight 부재' };
      // 기하 유효성 — 비유한 값 (NaN quaternion 등) 이나 반경 ≤ 0 에서는 ray-sphere 판정이 무의미해진다.
      // NaN 이면 `disc < 0` 이 거짓이라 **프레임 전체가 disk 로** 잡히고 (reviewer R1 실측 — disk n 921600),
      // 반경 0 이면 disk 가 빈 집합이라 `changed == 0` 술어가 공허하게 참이 된다 (reviewer R2). 둘 다
      // 판정에 들어가기 전에 측정 오류로 끝낸다 (#1214 시그니처 5 — error 를 모든 게이트보다 먼저).
      const geomNums = [
        forward.x,
        forward.y,
        forward.z,
        right.x,
        right.y,
        right.z,
        up.x,
        up.y,
        up.z,
        camPos.x,
        camPos.y,
        camPos.z,
        center.x,
        center.y,
        center.z,
        radiusWorld,
        camera.fov,
        sunPos.x,
        sunPos.y,
        sunPos.z,
      ];
      if (!geomNums.every(Number.isFinite) || !(radiusWorld > 0))
        return { error: `기하 무효 — 비유한 값 또는 반경 ≤ 0 (radius ${radiusWorld})` };
      const sunDir = sunPos.subtract(center).normalize();
      const camUnit = camPos.subtract(center).normalize();
      const cosA = Math.max(
        -1,
        Math.min(1, camUnit.x * sunDir.x + camUnit.y * sunDir.y + camUnit.z * sunDir.z),
      );
      const phaseAlphaDeg = (Math.acos(cosA) * 180) / Math.PI;

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
          data: c.getContext('2d').getImageData(0, 0, img.width, img.height).data,
          w: img.width,
          h: img.height,
        };
      };
      const A = await load(on);
      const B = await load(off);
      if (A.data.length !== B.data.length) return { error: 'ON/OFF 캔버스 크기 불일치' };
      const sx = A.w / rw;
      const sy = A.h / rh;
      const lum = (d, i) => (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      const tanHalf = Math.tan(camera.fov / 2);
      const aspect = rw / rh;

      const mk = () => ({ n: 0, sumAbs: 0, sumLumOff: 0, changed: 0, n2: 0, clear2: 0 });
      const bands = { dayInner: mk(), nightInner: mk(), disk: mk() };
      const pushPx = (acc, i) => {
        const dr = Math.abs(A.data[i] - B.data[i]);
        const dg = Math.abs(A.data[i + 1] - B.data[i + 1]);
        const db = Math.abs(A.data[i + 2] - B.data[i + 2]);
        const maxCh = Math.max(dr, dg, db);
        acc.n += 1;
        acc.sumAbs += Math.abs(lum(A.data, i) - lum(B.data, i));
        acc.sumLumOff += lum(B.data, i);
        if (maxCh > 0) acc.changed += 1;
        // C2 표본 — OFF 의 어느 채널도 정확히 255 가 아닌 픽셀 (포화 채널은 흰 구름이 덮어도 diff 0 이라
        // 「맑음」으로 오계수된다 — cross-validate U2, 새 상수 0).
        if (B.data[i] !== 255 && B.data[i + 1] !== 255 && B.data[i + 2] !== 255) {
          acc.n2 += 1;
          if (maxCh === 0) acc.clear2 += 1;
        }
      };
      let outsideChanged = 0;
      const inDisk = new Uint8Array(A.w * A.h);
      for (let y = 0; y < rh; y += 1) {
        for (let x = 0; x < rw; x += 1) {
          const ndcX = ((x + 0.5) / rw) * 2 - 1;
          const ndcY = 1 - ((y + 0.5) / rh) * 2;
          const rxv = forward.x + right.x * ndcX * tanHalf * aspect + up.x * ndcY * tanHalf;
          const ryv = forward.y + right.y * ndcX * tanHalf * aspect + up.y * ndcY * tanHalf;
          const rzv = forward.z + right.z * ndcX * tanHalf * aspect + up.z * ndcY * tanHalf;
          const rl = Math.hypot(rxv, ryv, rzv);
          const dx = rxv / rl;
          const dy = ryv / rl;
          const dz = rzv / rl;
          const ocx = camPos.x - center.x;
          const ocy = camPos.y - center.y;
          const ocz = camPos.z - center.z;
          const bq = ocx * dx + ocy * dy + ocz * dz;
          const cq = ocx * ocx + ocy * ocy + ocz * ocz - radiusWorld * radiusWorld;
          const disc = bq * bq - cq;
          if (disc < 0) continue;
          const t = -bq - Math.sqrt(disc);
          if (t < 0) continue;
          const nx = (ocx + t * dx) / radiusWorld;
          const ny = (ocy + t * dy) / radiusWorld;
          const nz = (ocz + t * dz) / radiusWorld;
          let vx = camPos.x - (center.x + nx * radiusWorld);
          let vy = camPos.y - (center.y + ny * radiusWorld);
          let vz = camPos.z - (center.z + nz * radiusWorld);
          const vl = Math.hypot(vx, vy, vz);
          vx /= vl;
          vy /= vl;
          vz /= vl;
          const ndv = nx * vx + ny * vy + nz * vz;
          const ndl = nx * sunDir.x + ny * sunDir.y + nz * sunDir.z;
          const px = Math.round(x * sx);
          const py = Math.round(y * sy);
          if (px < 0 || py < 0 || px >= A.w || py >= A.h) continue;
          const i = (py * A.w + px) * 4;
          inDisk[py * A.w + px] = 1;
          pushPx(bands.disk, i);
          if (ndv >= P.INNER_NDV_MIN && ndl >= P.DAY_NDL_MIN) pushPx(bands.dayInner, i);
          if (ndv >= P.INNER_NDV_MIN && ndl <= P.NIGHT_NDL_MAX) pushPx(bands.nightInner, i);
        }
      }
      for (let p = 0; p < A.w * A.h; p += 1) {
        if (inDisk[p]) continue;
        const i = p * 4;
        if (
          A.data[i] !== B.data[i] ||
          A.data[i + 1] !== B.data[i + 1] ||
          A.data[i + 2] !== B.data[i + 2]
        )
          outsideChanged += 1;
      }
      const pack = (acc) => ({
        n: acc.n,
        c1: acc.n ? Number((acc.sumAbs / acc.n).toFixed(6)) : null,
        lumOff: acc.n ? Number((acc.sumLumOff / acc.n).toFixed(5)) : null,
        changed: acc.changed,
        n2: acc.n2,
        satExcluded: acc.n - acc.n2,
        clearRatio: acc.n2 ? Number((acc.clear2 / acc.n2).toFixed(5)) : null,
      });
      return {
        phaseAlphaDeg: Number(phaseAlphaDeg.toFixed(4)),
        geomKey: [
          camPos.x,
          camPos.y,
          camPos.z,
          center.x,
          center.y,
          center.z,
          radiusWorld,
          rw,
          rh,
        ].join(','),
        dayInner: pack(bands.dayInner),
        nightInner: pack(bands.nightInner),
        disk: pack(bands.disk),
        outsideChanged,
      };
    },
    { on: onB64, off: offB64, P: { INNER_NDV_MIN, DAY_NDL_MIN, NIGHT_NDL_MAX } },
  );
}

/** 페이지 기하 키 — 두 페이지가 같은 프레임을 찍었는지 대조 (다르면 픽셀 쌍이 무의미 → 측정 오류). */
const readGeomKey = (ctx) =>
  ctx.page.evaluate(() => {
    const scene = window.__simCore.scene;
    const cam = scene.activeCamera;
    const c = window.__solarScene.meshes.get('earth').getAbsolutePosition();
    const p = cam.globalPosition;
    return [p.x, p.y, p.z, c.x, c.y, c.z].join(',');
  });

/**
 * 두 페이지의 프레임 쌍을 재기 전에 **두 페이지 기하가 정확히 같은지** 대조한다 (cross-validate X3).
 * 쌍의 기하가 다르면 `changed == 0` 술어에는 FAIL 방향이지만 `≥` 술어 (C5a · C5b) 에는 차이를 부풀려
 * **통과 방향**이다 — 불일치는 측정 오류로 끝낸다. 판정 기하는 `ctxA` 의 카메라다.
 */
async function measureCheckedPair(ctxA, aB64, ctxB, bB64, label) {
  const gA = await readGeomKey(ctxA);
  const gB = await readGeomKey(ctxB);
  if (gA !== gB) return { error: `${label} 페이지 기하 불일치 (${gA} vs ${gB})` };
  return measurePair(ctxA, aB64, bB64);
}

/** quaternion → local Y 회전각 [rad] (구름 상대 자전은 Y 축 회전뿐 — x·z 성분 0 도 함께 확인). */
const yAngle = (q) => 2 * Math.atan2(q[1], q[3]);
const wrapPi = (a) => {
  let w = a % (2 * Math.PI);
  if (w > Math.PI) w -= 2 * Math.PI;
  if (w <= -Math.PI) w += 2 * Math.PI;
  return w;
};

async function applyInject(on) {
  if (INJECT === 'none') return null;
  if (INJECT === 'mc6') {
    // MC-6 과다 커버 — 밀도 1 전면 + 불투명 1. 주입 대상은 구름 머티리얼 하나 (위 「주입 대상 한정」).
    return on.page.evaluate((n) => {
      const m = window.__simCore.scene.getMeshByName(n)?.material;
      if (!m) return 'cloud 머티리얼 부재';
      m.setFloat('cloudCover', -1);
      m.setFloat('cloudOpacity', 1);
      return 'mc6 — cloudCover −1 · cloudOpacity 1';
    }, CLOUD_MESH);
  }
  if (INJECT === 'mc7') {
    await on.page.evaluate(() => console.error('[mc7] injected runtime error canary'));
    return 'mc7 — 콘솔 에러 1건';
  }
  if (INJECT === 'mc9') {
    return on.page.evaluate((n) => {
      const m = window.__simCore.scene.getMeshByName(n)?.material;
      if (!m) return 'cloud 머티리얼 부재';
      m.needAlphaBlending = () => false;
      m.markDirty?.();
      return 'mc9 — cloud needAlphaBlending → false';
    }, CLOUD_MESH);
  }
  throw new Error(`미지원 INJECT=${INJECT}`);
}

async function run(browser) {
  const out = { mode: MODE, inject: INJECT };
  const on = await setupPage(browser, QUERY_ON, 'on');
  const off = await setupPage(browser, QUERY_OFF, 'off');
  // C8b 기준 프레임은 **주입 전**에 찍는다. C8b 의 계약은 「제품 코드의 독립 2회 로드가 같다」 인데,
  // 주 프레임 (`onB64`) 은 런타임 변이 (INJECT) 가 얹힌 뒤라 그것을 기준으로 쓰면 주입이 곧 비결정으로
  // 오계수된다 — 변이 실증 1차 실행에서 MC-6 · MC-9 가 C8b 까지 FAIL 시켰다 (disk `30180` · `30205 px`).
  // 주입이 없으면 이 프레임은 주 프레임과 바이트 동일하다 (같은 페이지 · 같은 결정적 상태).
  const onPreInjectB64 = await capture(on, 'on-pre-inject');
  out.injectNote = await applyInject(on);
  await frames(on.page, 4);

  // ── 주 쌍 (C1 · C2 · 측정 불가 2·3·4·7) ──
  const onB64 = await capture(on, 'on');
  const offB64 = await capture(off, 'off');
  const gOn = await readGeomKey(on);
  const gOff = await readGeomKey(off);
  out.main = await measurePair(on, onB64, offB64);
  if (!out.main.error && gOn !== gOff)
    out.main = { error: `ON/OFF 페이지 기하 불일치 (${gOn} vs ${gOff})` };
  out.offHasCloud = await off.page.evaluate(
    (n) => window.__simCore.scene.getMeshByName(n) !== null,
    CLOUD_MESH,
  );

  // ── C3 투명 큐 ──
  out.queueOn = await readTransparentQueue(on);
  out.queueOff = await readTransparentQueue(off);

  // ── C8 첫 JD 구조 읽기 (rotate=off) ──
  out.c8QuatJd0 = await readCloudQuat(on);

  // ── C5 — mid 정착 쌍 → fade 창 정지 쌍 ──
  await settleLod(on, 'mid', 'mid');
  await settleLod(off, 'mid', 'mid');
  out.mid = await measureCheckedPair(
    on,
    await capture(on, 'mid-on'),
    off,
    await capture(off, 'mid-off'),
    'mid',
  );
  const fzOn = await installFadeFreeze(on);
  const fzOff = await installFadeFreeze(off);
  if (fzOn.error || fzOff.error)
    out.fade = { error: `fade 정지 설치 실패 (${fzOn.error ?? fzOff.error})` };
  else
    out.fade = await measureCheckedPair(
      on,
      await capture(on, 'fade-on'),
      off,
      await capture(off, 'fade-off'),
      'fade',
    );
  out.fadeQueueOn = await readTransparentQueue(on);
  await removeFadeFreeze(on);
  await removeFadeFreeze(off);

  // ── C6 — low 정착 ──
  await settleLod(on, 'low', 'low');
  await settleLod(off, 'low', 'low');
  out.low = await measureCheckedPair(
    on,
    await capture(on, 'low-on'),
    off,
    await capture(off, 'low-off'),
    'low',
  );
  out.lowCloudVisible = await on.page.evaluate(
    (n) => window.__simCore.scene.getMeshByName(n)?.isVisible ?? null,
    CLOUD_MESH,
  );

  // ── C8 — rotate=off 독립 두 번째 로드 + JD 두 번째 점 ──
  const on2 = await setupPage(browser, QUERY_ON, 'on2');
  // 기준 프레임은 `on` 페이지의 주입 전 프레임이라 기하 대조 상대는 `on` 이다 (LOD override 는 카메라를 옮기지 않는다).
  out.c8Load = await measureCheckedPair(
    on2,
    await capture(on2, 'on2'),
    on,
    onPreInjectB64,
    'c8Load',
  );
  await jumpTo(on2, T_JD + DELTA_JD);
  out.c8QuatJd1 = await readCloudQuat(on2);

  // ── C7 — rotate ON 독립 두 로드 + JD+Δjd 구조 읽기 ──
  const rotA = await setupPage(browser, QUERY_ROTATE, 'rotA');
  const rotB = await setupPage(browser, QUERY_ROTATE, 'rotB');
  out.c7Load = await measureCheckedPair(
    rotA,
    await capture(rotA, 'rotA'),
    rotB,
    await capture(rotB, 'rotB'),
    'c7Load',
  );
  out.c7QuatJd0 = await readCloudQuat(rotA);
  await jumpTo(rotA, T_JD + DELTA_JD);
  out.c7QuatJd1 = await readCloudQuat(rotA);

  const pages = [on, off, on2, rotA, rotB];
  out.settles = pages.flatMap((p) => p.settles.map((s) => ({ page: p.label, ...s })));
  out.consoleErrors = Object.fromEntries(pages.map((p) => [p.label, [...p.errors]]));
  for (const p of pages) await p.context.close();
  return out;
}

function judge(r) {
  // 6 — measure() error 를 **모든 게이트보다 먼저** (#1214 시그니처 5). 부분 결과로 게이트를 계산하지 않는다.
  const errs = [];
  for (const k of ['main', 'mid', 'fade', 'low', 'c8Load', 'c7Load'])
    if (r[k]?.error) errs.push(`${k}: ${r[k].error}`);
  for (const k of ['queueOn', 'queueOff', 'fadeQueueOn'])
    if (r[k]?.error) errs.push(`${k}: ${r[k].error}`);
  const unmeasurable = errs.map((e) => `(6) 측정 오류 — ${e}`);
  if (unmeasurable.length) return { unmeasurable };

  for (const s of r.settles)
    if (s.timedOut)
      unmeasurable.push(
        `(1) LOD 정착 상한 초과 — ${s.page}/${s.step} (${s.waitedMs}ms, dist=${s.dist} fading=${s.fading})`,
      );
  if (r.offHasCloud)
    unmeasurable.push(
      '(5) ?clouds=off 페이지에 earth-cloud mesh 가 있다 — OFF 가 구름 도입 전 경로가 아니다',
    );
  const band = r.main.dayInner;
  if (MIN_EXPECTED !== null) {
    if (band.n < MIN_EXPECTED)
      unmeasurable.push(`(2) OFF 대역 표본 N=${band.n} < MIN_EXPECTED ${MIN_EXPECTED}`);
    if (band.n2 < MIN_EXPECTED)
      unmeasurable.push(
        `(7) C2 표본 (포화 제외 ${band.satExcluded}) N=${band.n2} < MIN_EXPECTED ${MIN_EXPECTED}`,
      );
  }
  if (band.lumOff !== null && band.lumOff < MIN_DAY_LIT_LUM)
    unmeasurable.push(`(3) OFF 대역 평균 휘도 ${band.lumOff} < ${MIN_DAY_LIT_LUM}`);
  if (r.main.phaseAlphaDeg < MIN_PHASE_ALPHA_DEG)
    unmeasurable.push(`(4) 위상각 ${r.main.phaseAlphaDeg}deg < ${MIN_PHASE_ALPHA_DEG}deg`);

  // ── 전제 2 · 3 을 **판정에 쓰이는 모든 쌍**에 건다 (reviewer B1 · cross-validate X1) ──
  // 불변 술어 (C6 · C7a · C8b 의 `changed == 0`) 는 대상이 비면 공허하게 참이고, `≥` 술어 (C5a · C5b) 는
  // 대상이 없는 쌍에서 의미가 없다. 새 상수 없이 주 쌍의 전제를 그대로 재사용한다:
  //   | 쌍      | 쓰는 게이트  | 전제 2 (낮면 내부 N) | 전제 3 (OFF 낮면 휘도) | 전제 7 (C2 표본) |
  //   | main    | C1 C2 C6     | ✅                    | ✅                      | ✅ — C2 를 재는 쌍 |
  //   | mid     | C5a C5b      | ✅                    | ✅                      | ❌ C2 를 안 잰다   |
  //   | fade    | C5b          | ✅                    | ✅                      | ❌                  |
  //   | c7Load  | C7a          | ✅                    | ✅                      | ❌                  |
  //   | c8Load  | C8b          | ✅                    | ✅                      | ❌                  |
  //   | low     | C6           | ✅                    | ❌ billboard 라 설계상 어둡다 | ❌            |
  // 전제 7 을 추가 쌍에 걸지 않는 이유 [실측]: 포화 제외 후 C2 표본이 mid 정착 쌍 `1109` · C7 rotate ON 쌍
  // `350` 으로 하한 `2408` 아래라 (CI 도 `1108` · `349`), 걸면 정상 실행이 상시 「측정 불가」 가 된다.
  // low 에 전제 3 을 걸지 않는 이유 [실측]: low 쌍 OFF 낮면 내부 평균 휘도가 `0.03559` 로 하한 `0.15` 아래다
  // (단색 billboard — 절차 표면이 아니다). low 의 「대상이 화면에 있다」 는 C6 의 `∧ C1 PASS` 결합이 받친다.
  const pairPremises = [
    ['mid', r.mid, true],
    ['fade', r.fade, true],
    ['c7Load', r.c7Load, true],
    ['c8Load', r.c8Load, true],
    ['low', r.low, false],
  ];
  for (const [label, pair, withLum] of pairPremises) {
    const b = pair.dayInner;
    if (MIN_EXPECTED !== null && b.n < MIN_EXPECTED)
      unmeasurable.push(`(2) [${label}] 대역 표본 N=${b.n} < MIN_EXPECTED ${MIN_EXPECTED}`);
    if (withLum && (b.lumOff === null || b.lumOff < MIN_DAY_LIT_LUM))
      unmeasurable.push(`(3) [${label}] OFF 대역 평균 휘도 ${b.lumOff} < ${MIN_DAY_LIT_LUM}`);
  }
  // ── 전제 8 — fade 정지 재현이 **결함 조건**을 실제로 만들었는가 (cross-validate X2) ──
  // C5b 는 「mid variant 가 구름과 함께 투명 큐에 있다」 는 조건 위에서만 정렬 함수를 시험한다. 재현이 그
  // 조건을 못 만들면 fade 프레임 = mid 정착 프레임이 되어 C5b 가 정렬 함수를 시험하지 않고 통과한다.
  const fadeNames = r.fadeQueueOn.names;
  if (!fadeNames.includes(CLOUD_MESH) || !fadeNames.includes('earth-lod-mid'))
    unmeasurable.push(
      `(8) fade 정지 재현의 투명 큐 ${JSON.stringify(fadeNames)} 에 ${CLOUD_MESH} 와 earth-lod-mid 가 둘 다 있지 않다 — C5b 가 결함 조건을 시험하지 않는다`,
    );
  if (unmeasurable.length) return { unmeasurable };
  if (MODE === 'profile') return { profile: true };

  const omega = computeCloudDriftOmega(getSolarSystem().bodies.find((b) => b.id === 'earth'));
  const expectDelta = wrapPi(DELTA_JD * omega);
  const q7a = r.c7QuatJd0;
  const q7b = r.c7QuatJd1;
  const c7Delta = q7a && q7b ? wrapPi(yAngle(q7b) - yAngle(q7a)) : null;
  const c7AxisOk = !!(q7a && q7b && q7a[0] === 0 && q7a[2] === 0 && q7b[0] === 0 && q7b[2] === 0);
  const isIdentity = (q) => !!q && q[0] === 0 && q[1] === 0 && q[2] === 0 && q[3] === 1;
  const onNames = r.queueOn.names;
  const c1 = band.c1;
  const c1Pass = c1 >= T_DELTA;
  const allErrors = Object.values(r.consoleErrors).flat();
  const gates = [
    ['C1 낮면 내부 평균 |ΔL|', c1, `>= ${T_DELTA}`, c1Pass],
    ['C2 맑은 하늘 비율 (포화 제외)', band.clearRatio, `>= ${T_CLEAR}`, band.clearRatio >= T_CLEAR],
    [
      'C3 투명 큐 ON − OFF',
      `${onNames.length - r.queueOff.names.length} ${JSON.stringify(onNames)}`,
      `== 1 ∧ ${CLOUD_MESH} ∈ ON`,
      onNames.length - r.queueOff.names.length === 1 && onNames.includes(CLOUD_MESH),
    ],
    [
      'C4 콘솔 에러 (전 페이지)',
      String(allErrors.length),
      '!hasSimErrors',
      !hasSimErrors(allErrors),
    ],
    ['C5a mid 정착 쌍 C1 량', r.mid.dayInner.c1, `>= ${T_DELTA}`, r.mid.dayInner.c1 >= T_DELTA],
    [
      'C5b fade 정지 쌍 C1 량',
      r.fade.dayInner.c1,
      `>= mid ÷ 3 = ${(r.mid.dayInner.c1 / 3).toFixed(6)} ∧ C5a PASS`,
      // 기준이 0 이면 `0 >= 0` 이 통과로 찍힌다 (reviewer A1 — MC-1 재현) — C6 처럼 C5a PASS 를 결합한다.
      r.fade.dayInner.c1 >= r.mid.dayInner.c1 / 3 && r.mid.dayInner.c1 >= T_DELTA,
    ],
    [
      'C6 low: cloud.isVisible · disk 변화 px',
      `${r.lowCloudVisible} · ${r.low.disk.changed}`,
      'false ∧ == 0 ∧ C1 PASS',
      r.lowCloudVisible === false && r.low.disk.changed === 0 && c1Pass,
    ],
    [
      'C7a rotate ON 독립 2회 로드 disk 변화 px',
      r.c7Load.disk.changed,
      '== 0',
      r.c7Load.disk.changed === 0,
    ],
    [
      'C7b 구름 상대각 차 (Δjd=1)',
      c7Delta,
      `== ${expectDelta} (±${ANGLE_EPS_RAD}) ∧ 축 Y`,
      c7Delta !== null && c7AxisOk && Math.abs(c7Delta - expectDelta) <= ANGLE_EPS_RAD,
    ],
    [
      'C8a rotate=off JD 2점 identity',
      `${JSON.stringify(r.c8QuatJd0)} · ${JSON.stringify(r.c8QuatJd1)}`,
      'identity ×2',
      isIdentity(r.c8QuatJd0) && isIdentity(r.c8QuatJd1),
    ],
    [
      'C8b rotate=off 독립 2회 로드 disk 변화 px',
      r.c8Load.disk.changed,
      '== 0',
      r.c8Load.disk.changed === 0,
    ],
  ];
  return { gates };
}

async function main() {
  const r = await withBrowser({ gpu: SWIFTSHADER ? 'swiftshader' : 'default' }, run, {
    launch: launchBrowser,
  });
  console.log(
    `=== #1215 구름 레이어 — 진단 (MODE=${MODE} INJECT=${INJECT}${r.injectNote ? ` — ${r.injectNote}` : ''}) ===`,
  );
  const show = (label, m) =>
    m?.error
      ? console.log(`${label}: error ${m.error}`)
      : console.log(
          `${label}: ${JSON.stringify({ dayInner: m.dayInner, nightInner: m.nightInner, disk: m.disk, outsideChanged: m.outsideChanged })}`,
        );
  console.log(`위상각 ${r.main.phaseAlphaDeg}deg · OFF 페이지 구름 mesh ${r.offHasCloud}`);
  show('main (ON↔OFF)', r.main);
  show('mid 정착', r.mid);
  show('fade 정지', r.fade);
  show('low 정착', r.low);
  show('C8 rotate=off 2회 로드', r.c8Load);
  show('C7 rotate ON 2회 로드', r.c7Load);
  console.log(
    `queue ON ${JSON.stringify(r.queueOn)} · OFF ${JSON.stringify(r.queueOff)} · fade ON ${JSON.stringify(r.fadeQueueOn)}`,
  );
  console.log(
    `quat C8 jd0 ${JSON.stringify(r.c8QuatJd0)} jd1 ${JSON.stringify(r.c8QuatJd1)} · C7 jd0 ${JSON.stringify(r.c7QuatJd0)} jd1 ${JSON.stringify(r.c7QuatJd1)}`,
  );
  console.log(`low cloud.isVisible ${r.lowCloudVisible}`);
  console.log(
    `settles ${JSON.stringify(r.settles.map((s) => `${s.page}/${s.step}:${s.dist}/${s.fading}/${s.timedOut ? 'TIMEOUT' : 'ok'}`))}`,
  );
  console.log(`consoleErrors ${JSON.stringify(r.consoleErrors)}`);
  if (MODE === 'profile') console.log(`BASELINE_JSON ${JSON.stringify(r)}`);

  const v = judge(r);
  if (v.unmeasurable) {
    console.error('\n[측정 불가] 유효성 전제 미충족 — PASS 도 FAIL 도 내지 않는다 (§A10.11):');
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
