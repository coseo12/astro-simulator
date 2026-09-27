#!/usr/bin/env node
/**
 * #1265 — 런타임 표시 토글 동적 검증 (ADR `docs/decisions/20260927-1265-runtime-display-toggles.md`).
 *
 * **무엇을 재는가 (PR1 — core)**: `window.__solarScene` 의 신규 setter 3종 (`setCloudsVisible` ·
 * `setNightLightsVisible` · `setStarfieldVisible`) 을 **직접 호출**해 끈/켠 화면이 해당 `?x=off` **로드
 * 화면**과 같은지를 같은 결정적 프레임 쌍으로 비교한다. UI (패널) 는 PR2 에서 이 스크립트에 섹션으로 더한다 —
 * 여기서는 core 기전만 격리해 잰다 (ADR §결정 8).
 *
 * ## 판정식은 기존 가드의 것을 그대로 쓴다 (새 임계 0)
 *   - 프레임 · 쿼리: 구름 = `verify:1215` (`QUERY_ON` · JD `2451626.0` · pause · `beta = π/2` · LOD 정착),
 *     불빛 = `verify:1226` (`FOCUS` · JD `2451808.0` · 구름 OFF 쌍 P1 ↔ P2).
 *   - 픽셀 술어: 지구 disk (ray-sphere 역투영) 안 변화 px `== 0`. disk 밖은 같은 조건 독립 로드에서도
 *     비결정이 관측돼 (`verify:1215` §`== 0` 술어는 지구 disk 내부로 한정) 쓰지 않는다 — 별 배경 (D8) 만
 *     full frame 이고, 그래서 D8 은 독립 2 로드 결정성을 전제로 건다.
 *   - 역투영 식은 `verify:1226` `measurePair` 의 **사본**이다 (필요한 대역만 남김). 저장소에 같은 식의 사본이
 *     이미 있고 (783/1119/1202/1215/1226), D12 가 기존 가드 무수정을 요구해 공용 모듈 추출은 범위 밖이다
 *     (ADR §받아들인 비용).
 *   - 캡처 전 `hideDomOverlays` (#1219 — canvas element 캡처가 겹친 DOM 을 찍는다).
 *
 * ## 판정 (계약 재조정 코멘트 `issuecomment-5852573137` 의 PR1 배정분)
 *   D5   구름 OFF: 로드 ON 페이지에서 `setCloudsVisible(false)` ↔ `&clouds=off` 로드 — disk 변화 0
 *        ∧ **구조**: `earth-cloud` 0 개 ∧ 그룹 0 투명 정렬 = `defaultTransparentSortCompare` · 불투명 정렬 =
 *        `PainterSortCompare` (로드 OFF 페이지와 같은 값). 구조 술어를 두는 이유: 비활성 mesh 는 그려지지 않아
 *        `setEnabled(false)` 만 한 변이가 픽셀로는 통과할 수 있다 (ADR 축 2 · 변이 MV-1).
 *   D6   구름 ON: `&clouds=off` 로드 (**자전 ON** — 일시정지 중 켤 때의 드리프트 동기를 판별하려면 자전이
 *        돌아야 한다) 에서 `setCloudsVisible(true)` ↔ 기본 로드 — disk 변화 0 ∧ on/off 3 왕복 동안 구름 ≤ 1
 *        ∧ 같은 상태로 돌아왔을 때 `scene.meshes` · `scene.materials` 개수가 왕복 전과 같다 ∧ 왕복 후 화면도 disk 변화 0.
 *   D6f  구름 ON 이전에 lazy 생성된 mid 가 있는 상태 — mid 선생성 → auto → ON → fade 정지 재현
 *        (`verify:1215` `installFadeFreeze` 동형) ↔ 로드 ON 페이지의 같은 절차 — disk 변화 0.
 *   D7   불빛 OFF: P1 에서 `setNightLightsVisible(false)` ↔ P2 로드 — disk 변화 0 ∧ `nightLightStrength` 를
 *        가진 머티리얼 **전부** 0. D7m: 이어서 두 페이지 mid 정착 쌍 disk 변화 0.
 *   D7e  개요 (focus 없음 — 지구 mid 미생성) 에서 끈 뒤 지구 focus + mid 정착 → 지구 high·mid 머티리얼 전부 0.
 *   D8   별: `&stars=off` 로드 → ON 후 starfield 정확히 1 · 10 왕복 뒤에도 1 · 같은 인스턴스 (전 환경 — 구조).
 *        픽셀 (하드웨어 전용, `__isSoftwareRenderer === false`): 로드 ON 에서 OFF ↔ `&stars=off` 로드 full frame 0.
 *   D8p  그룹 0 불투명 큐에서 starfield 외 mesh 는 전부 depth write 를 한다 (ADR R1 논증의 두 번째 전제 — 전 환경).
 *   D15  4 토글 (궤도선 포함) × 10 왕복 × (재생 / 일시정지) — `!hasSimErrors` ∧ 전 페이지 콘솔 에러 0.
 *
 * ## 「측정 불가」 (exit 2 — PASS 도 FAIL 도 아니다. fallback 분기 금지). **모든 게이트보다 먼저** 본다
 *   1 LOD 정착 상한 초과   2 measure() error · 비유한/퇴화 기하 · 캔버스 개수 ≠ 1 · 쌍 기하 불일치
 *   3 양성 대조 실패 — 로드 ON ↔ 로드 OFF disk 변화 `== 0` (쌍이 효과를 담지 못하면 `== 0` 술어가 공허 참)
 *   4 런타임 생성 머티리얼 준비 대기 초과     5 D6f fade 재현 큐에 `earth-lod-mid` 부재
 *   6 D7e 엣지 미실행 (토글 시점 mid 존재 또는 정착 후 부재)   7 `?stars=off` 로드에 starfield 존재
 *   8 D8p 불투명 큐 비었음 또는 starfield 부재   9 D8 (하드웨어) 독립 2 로드 full frame 비결정 또는 로드 ON ↔ OFF 동일
 *
 * ## 모드 / 변이
 *   node browser-verify-1265-display-panel.mjs      # 게이트 (CI)
 *   INJECT=console ...   # D15 페이지에 콘솔 에러 1건 — D15 FAIL 기대 (하네스 negative)
 *   INJECT=geom ...      # D5 쌍 캡처 뒤 카메라 이동 — 쌍 기하 불일치로 exit 2 기대 (측정 불가 negative)
 *   소스 변이 (MV-1 ~ MV-6 · clear 누락) 는 소스를 바꾸고 core dist 를 재빌드해 기본 모드로 돌린다 (PR 기록).
 *   변이 주입은 CI 에 배선하지 않는다 — 판별력 실증은 PR 시점 1회 의무 (1215 · 1226 선례).
 *
 * 환경: SWIFTSHADER=1 (headless + --use-angle=swiftshader) · BROWSER_VERIFY_GPU=metal (D8 픽셀 — 하드웨어 경로) ·
 *       HEADFUL · BASE_URL · CAPTURE_DIR
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
const CAPTURE_DIR = process.env.CAPTURE_DIR ?? null;
const SWIFTSHADER = process.env.SWIFTSHADER === '1';
const INJECT = process.env.INJECT ?? 'none';

const EXIT_UNMEASURABLE = 2;

/** 구름 결정적 프레임 JD — `verify:1215` `T_JD` 와 동일. */
const T_JD_CLOUD = 2451626.0;
/** 불빛 결정적 프레임 JD — `verify:1226` `T_JD` 와 동일 (U1). */
const T_JD_NIGHT = 2451808.0;

/** `verify:1215` `QUERY_ON` · `verify:1226` `FOCUS` 와 동일 (둘은 같은 문자열이다). */
const FOCUS = '?gpu=a&focus=earth&lod=auto&rotate=off&orbits=off';
/** `verify:1215` `QUERY_ROTATE` 와 동일 — 자전 ON. */
const FOCUS_ROTATE = '?gpu=a&focus=earth&lod=auto&orbits=off';
/** D7e — 태양계 개요 (focus 없음). 나머지 축은 `FOCUS` 와 같게 둔다. */
const OVERVIEW = '?gpu=a&lod=auto&rotate=off&orbits=off';
/** D15 — 기본 로드 (4 효과 전부 켜진 상태에서 시작). */
const STRESS = '?gpu=a&focus=earth&lod=auto';

const Q = {
  cloudOn: FOCUS,
  cloudOff: `${FOCUS}&clouds=off`,
  cloudRotOn: FOCUS_ROTATE,
  cloudRotOff: `${FOCUS_ROTATE}&clouds=off`,
  // verify:1226 P1 · P2
  nightP1: `${FOCUS}&clouds=off`,
  nightP2: `${FOCUS}&clouds=off&nightlights=off`,
  nightOverview: `${OVERVIEW}&clouds=off`,
  starsOn: FOCUS,
  starsOff: `${FOCUS}&stars=off`,
  stress: STRESS,
};

const CLOUD_MESH = 'earth-cloud';
const STARFIELD_MESH = 'starfield';
const EARTH_MID = 'earth-lod-mid';

/** 계약 D6 「on/off 3회 왕복」. */
const CLOUD_ROUND_TRIPS = 3;
/** 계약 D15 「각 10회 왕복」 — D8 구조 왕복도 같은 값을 쓴다 (새 상수 0). */
const STRESS_ROUND_TRIPS = 10;
/** 부트스트랩 안정화 대기 — `verify:1215` · `verify:1226` 과 같은 값. */
const BOOT_SETTLE_MS = 2800;
/** 런타임 생성 머티리얼 준비 대기 상한 — `bootstrapScene` `handleTimeout` 기본값과 같은 값 (새 임계 0). */
const READY_TIMEOUT_MS = 20_000;

async function setupPage(browser, query, label, jd) {
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
    settleMs: BOOT_SETTLE_MS,
    label,
  });
  // #1219 — 캔버스 위 DOM 이 캡처에 섞이지 않게 숨긴다 (캔버스 개수 fail-fast 포함).
  await hideDomOverlays(page);
  await page.evaluate((j) => {
    window.__simCore.command({ type: 'jumpToJulianDate', julianDate: j });
    window.__simCore.command({ type: 'pause' });
  }, jd);
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
    await writeFile(path.join(CAPTURE_DIR, `1265-${name}.png`), buf);
  }
  return buf.toString('base64');
}

async function settleLod(ctx, step, override) {
  await ctx.page.evaluate((o) => window.__solarScene.setLodOverride(o), override);
  await frames(ctx.page, 2);
  const s = await waitForLodSettle(ctx.page);
  ctx.settles.push({ step, ...s });
}

/** scene setter 직접 호출 (PR1 — UI 경로 없음). */
const callSetter = (ctx, setter, visible) =>
  ctx.page.evaluate(({ s, v }) => window.__solarScene[s](v), { s: setter, v: visible });

/**
 * 런타임에 새로 만든 mesh 의 머티리얼이 컴파일될 때까지 대기 — 준비 전 프레임에서는 mesh 가 그려지지 않아
 * 「런타임 ON = 로드 ON」 비교가 결함 없이도 FAIL 한다. 초과는 측정 불가 (4).
 */
async function waitMaterialReady(ctx, meshName) {
  try {
    await ctx.page.waitForFunction(
      (n) => {
        const m = window.__simCore.scene.getMeshByName(n);
        return !!m && !!m.material && m.material.isReady(m);
      },
      meshName,
      { timeout: READY_TIMEOUT_MS },
    );
    return { ok: true };
  } catch {
    return { error: `${ctx.label}: ${meshName} 머티리얼 준비 대기 ${READY_TIMEOUT_MS}ms 초과` };
  }
}

const readCounts = (ctx) =>
  ctx.page.evaluate(
    ({ cloud, star }) => {
      const s = window.__simCore.scene;
      return {
        meshes: s.meshes.length,
        materials: s.materials.length,
        clouds: s.meshes.filter((m) => m.name === cloud).length,
        stars: s.meshes.filter((m) => m.name === star).length,
      };
    },
    { cloud: CLOUD_MESH, star: STARFIELD_MESH },
  );

/** 그룹 0 정렬 함수가 생성자 기본값인가 (Babylon internal — 구조 술어). */
const readSortState = (ctx) =>
  ctx.page.evaluate(() => {
    const g = window.__simCore.scene._renderingManager?._renderingGroups?.[0];
    if (!g) return { error: '렌더링 그룹 0 조회 실패' };
    const C = g.constructor;
    return {
      transparentDefault: g._transparentSortCompareFn === C.defaultTransparentSortCompare,
      opaqueDefault: g._opaqueSortCompareFn === C.PainterSortCompare,
    };
  });

const readQueue = async (ctx, field) => {
  await frames(ctx.page, 2);
  return ctx.page.evaluate((f) => {
    const q = window.__simCore.scene._renderingManager?._renderingGroups?.[0]?.[f];
    if (!q) return { error: `렌더링 그룹 0 ${f} 조회 실패` };
    return {
      entries: q.data.slice(0, q.length).map((s) => {
        const m = s.getMesh();
        return { name: m.name, noDepthWrite: m.material?.disableDepthWrite === true };
      }),
    };
  }, field);
};

/** `nightLightStrength` uniform 을 가진 머티리얼 전부의 값 (절차 행성 머티리얼만 가진다). */
const readAllLightStrengths = (ctx) =>
  ctx.page.evaluate(() =>
    window.__simCore.scene.materials
      .filter((m) => m._floats && m._floats.nightLightStrength !== undefined)
      .map((m) => ({ name: m.name, v: m._floats.nightLightStrength })),
  );

const hasMesh = (ctx, name) =>
  ctx.page.evaluate((n) => window.__simCore.scene.getMeshByName(n) !== null, name);

/** fade 창 정지 재현 — `verify:1215` `installFadeFreeze` 와 같은 본문 (host · mid 매 프레임 가시 + alpha 0.999). */
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

/**
 * 프레임 쌍의 지구 disk 측정 — `verify:1226` `measurePair` 의 역투영 식 사본 (disk · 낮면/밤면 내부 대역 +
 * full frame). 기하는 이 페이지 (ctx) 의 카메라로 계산하고 쌍 기하 일치는 호출부 (`measureCheckedPair`) 가 본다.
 */
async function measurePair(ctx, aB64, bB64) {
  return ctx.page.evaluate(
    async ({ a, b, P }) => {
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
      // Babylon 구의 boundingSphere 는 AABB 반대각선 (r√3) — 1202 · 1215 · 1226 과 같은 보정.
      const R = mesh.getBoundingInfo().boundingSphere.radiusWorld / Math.sqrt(3);
      let sunPos = null;
      for (const l of scene.lights) {
        if (l.position && (l.name === 'sun-light' || l.getClassName?.() === 'PointLight')) {
          sunPos = l.position;
          break;
        }
      }
      if (!sunPos) return { error: 'sunLight 부재' };
      const nums = [fw.x, fw.y, fw.z, rt.x, rt.y, rt.z, up.x, up.y, up.z];
      nums.push(cp.x, cp.y, cp.z, ct.x, ct.y, ct.z, R, camera.fov, sunPos.x, sunPos.y, sunPos.z);
      // 비유한 값이면 `disc < 0` 이 거짓이라 프레임 전체가 disk 로 잡히고, 반경 0 이면 disk 가 비어 `== 0`
      // 술어가 공허 참이 된다 — 둘 다 판정 전에 측정 오류로 끝낸다 (1215 reviewer R1 · R2).
      if (!nums.every(Number.isFinite) || !(R > 0))
        return { error: `기하 무효 — 비유한 값 또는 반경 ≤ 0 (radius ${R})` };
      const sd = sunPos.subtract(ct).normalize();

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
      if (A.d.length !== B.d.length) return { error: '캔버스 크기 불일치' };
      const sx = A.w / rw;
      const sy = A.h / rh;
      const same = (p, q, i) => p[i] === q[i] && p[i + 1] === q[i + 1] && p[i + 2] === q[i + 2];
      const th = Math.tan(camera.fov / 2);
      const asp = rw / rh;

      const mk = () => ({ n: 0, changed: 0 });
      const disk = mk();
      const DI = mk();
      const NI = mk();
      const push = (acc, i) => {
        acc.n += 1;
        if (!same(A.d, B.d, i)) acc.changed += 1;
      };
      const inDisk = new Uint8Array(A.w * A.h);
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
          if (ndl <= P.NIGHT_NDL_MAX) push(NI, i);
        }
      }
      let fullChanged = 0;
      let outsideChanged = 0;
      for (let p = 0; p < A.w * A.h; p += 1) {
        if (!same(A.d, B.d, p * 4)) {
          fullChanged += 1;
          if (!inDisk[p]) outsideChanged += 1;
        }
      }
      return { disk, DI, NI, fullChanged, outsideChanged };
    },
    // 대역 정의 — `verify:1202` SSoT 값 (1215 · 1226 과 동일, 새 상수 0).
    { a: aB64, b: bB64, P: { INNER_NDV_MIN: 0.6, DAY_NDL_MIN: 0.15, NIGHT_NDL_MAX: -0.15 } },
  );
}

/** 페이지 기하 키 — `verify:1226` `readGeomKey` 와 같은 항목 (카메라 위치 · 지구 중심 · fov). */
const readGeomKey = (ctx) =>
  ctx.page.evaluate(() => {
    const cam = window.__simCore.scene.activeCamera;
    const c = window.__solarScene.meshes.get('earth').getAbsolutePosition();
    const p = cam.globalPosition;
    return [p.x, p.y, p.z, c.x, c.y, c.z, cam.fov].join(',');
  });

/** 두 페이지 기하가 정확히 같을 때만 쌍을 잰다 (#1215 cross-validate X3). 판정 기하는 `ctxA`. */
async function measureCheckedPair(ctxA, aB64, ctxB, bB64, label) {
  const gA = await readGeomKey(ctxA);
  const gB = await readGeomKey(ctxB);
  if (gA !== gB) return { error: `${label} 페이지 기하 불일치 (${gA} vs ${gB})` };
  return measurePair(ctxA, aB64, bB64);
}

// ── 섹션 ───────────────────────────────────────────────────────────────────

/** D5 · D6 · D6f — 구름. */
async function runClouds(browser, out, pages) {
  // ── D5 — 로드 ON 에서 런타임 OFF ↔ 로드 OFF (자전 OFF 프레임 — verify:1215 주 쌍) ──
  const A = await setupPage(browser, Q.cloudOn, 'A-cloudOn', T_JD_CLOUD);
  const B = await setupPage(browser, Q.cloudOff, 'B-cloudOff', T_JD_CLOUD);
  pages.push(A, B);
  out.d8pLoad = await readQueue(A, '_opaqueSubMeshes');
  const aPre = await capture(A, 'A-pre');
  const bImg = await capture(B, 'B');
  out.d5Positive = await measureCheckedPair(A, aPre, B, bImg, 'd5Positive');
  await callSetter(A, 'setCloudsVisible', false);
  const aOff = await capture(A, 'A-runtime-off');
  if (INJECT === 'geom') {
    await A.page.evaluate(() => {
      window.__simCore.scene.activeCamera.alpha += 0.5;
    });
    await frames(A.page, 4);
    out.injectNote = 'geom — D5 캡처 뒤 A 카메라 alpha +0.5 rad (쌍 기하 이탈)';
  }
  out.d5 = await measureCheckedPair(A, aOff, B, bImg, 'd5');
  out.d5CountsA = await readCounts(A);
  out.d5SortA = await readSortState(A);
  out.d5SortB = await readSortState(B);

  // ── D6 — 로드 OFF (자전 ON) 에서 런타임 ON ↔ 로드 ON + 왕복 누수 ──
  const C = await setupPage(browser, Q.cloudRotOff, 'C-cloudRotOff', T_JD_CLOUD);
  const D = await setupPage(browser, Q.cloudRotOn, 'D-cloudRotOn', T_JD_CLOUD);
  pages.push(C, D);
  const cPre = await capture(C, 'C-pre');
  const dImg = await capture(D, 'D');
  out.d6Positive = await measureCheckedPair(C, cPre, D, dImg, 'd6Positive');
  const countsOffLoad = await readCounts(C);
  await callSetter(C, 'setCloudsVisible', true);
  out.ready.push(await waitMaterialReady(C, CLOUD_MESH));
  out.d6 = await measureCheckedPair(C, await capture(C, 'C-runtime-on'), D, dImg, 'd6');
  const countsOn = await readCounts(C);
  const trips = [];
  for (let i = 0; i < CLOUD_ROUND_TRIPS; i += 1) {
    await callSetter(C, 'setCloudsVisible', false);
    await frames(C.page, 2);
    const off = await readCounts(C);
    await callSetter(C, 'setCloudsVisible', true);
    out.ready.push(await waitMaterialReady(C, CLOUD_MESH));
    const on = await readCounts(C);
    trips.push({ off, on });
  }
  out.d6Leak = { countsOffLoad, countsOn, trips };
  out.d6AfterTrips = await measureCheckedPair(
    C,
    await capture(C, 'C-after-trips'),
    D,
    dImg,
    'd6AfterTrips',
  );

  // ── D6f — mid 선생성 뒤 ON (자전 OFF 프레임 — 계열 등록 축만 격리) ──
  const E = await setupPage(browser, Q.cloudOff, 'E-cloudOff-mid', T_JD_CLOUD);
  const F = await setupPage(browser, Q.cloudOn, 'F-cloudOn-mid', T_JD_CLOUD);
  pages.push(E, F);
  for (const ctx of [E, F]) {
    await settleLod(ctx, 'mid', 'mid');
    await settleLod(ctx, 'auto', 'auto');
  }
  out.d6fMidBeforeOn = await hasMesh(E, EARTH_MID);
  await callSetter(E, 'setCloudsVisible', true);
  out.ready.push(await waitMaterialReady(E, CLOUD_MESH));
  const fzE = await installFadeFreeze(E);
  const fzF = await installFadeFreeze(F);
  if (fzE.error || fzF.error)
    out.d6f = { error: `fade 정지 설치 실패 (${fzE.error ?? fzF.error})` };
  else
    out.d6f = await measureCheckedPair(
      E,
      await capture(E, 'E-fade'),
      F,
      await capture(F, 'F-fade'),
      'd6f',
    );
  out.d6fQueueE = await readQueue(E, '_transparentSubMeshes');
  out.d6fQueueF = await readQueue(F, '_transparentSubMeshes');
}

/** D7 · D7m · D7e — 야간 불빛. */
async function runNightLights(browser, out, pages) {
  const P1 = await setupPage(browser, Q.nightP1, 'P1-night', T_JD_NIGHT);
  const P2 = await setupPage(browser, Q.nightP2, 'P2-nightOff', T_JD_NIGHT);
  pages.push(P1, P2);
  const p1Pre = await capture(P1, 'P1-pre');
  const p2Img = await capture(P2, 'P2');
  out.d7Positive = await measureCheckedPair(P1, p1Pre, P2, p2Img, 'd7Positive');
  out.d7MidBeforeOff = await hasMesh(P1, EARTH_MID);
  await callSetter(P1, 'setNightLightsVisible', false);
  out.d7 = await measureCheckedPair(P1, await capture(P1, 'P1-runtime-off'), P2, p2Img, 'd7');
  out.d7Strengths = await readAllLightStrengths(P1);
  // D7m — 끈 뒤 두 페이지 모두 mid 정착 (P1 의 mid 가 OFF 이후 생성이면 lazy 상태 경로를 탄다).
  await settleLod(P1, 'mid', 'mid');
  await settleLod(P2, 'mid', 'mid');
  out.ready.push(await waitMaterialReady(P1, EARTH_MID));
  out.ready.push(await waitMaterialReady(P2, EARTH_MID));
  out.d7m = await measureCheckedPair(
    P1,
    await capture(P1, 'P1-mid'),
    P2,
    await capture(P2, 'P2-mid'),
    'd7m',
  );

  // ── D7e — 개요에서 끈 뒤 지구 focus → mid 정착 ──
  const O = await setupPage(browser, Q.nightOverview, 'O-overview', T_JD_NIGHT);
  pages.push(O);
  out.d7eMidAtToggle = await hasMesh(O, EARTH_MID);
  await callSetter(O, 'setNightLightsVisible', false);
  await O.page.evaluate(() => window.__simCore.command({ type: 'focusOn', bodyId: 'earth' }));
  const focusSettle = await waitForLodSettle(O.page);
  O.settles.push({ step: 'focus', ...focusSettle });
  await settleLod(O, 'mid', 'mid');
  out.d7eMidAfter = await hasMesh(O, EARTH_MID);
  out.d7eEarth = await O.page.evaluate(() => {
    const earth = window.__solarScene.meshes.get('earth');
    return [earth, ...earth.getChildMeshes()]
      .filter((m) => m === earth || m.name.startsWith('earth-lod-'))
      .map((m) => ({ name: m.name, v: m.material?._floats?.nightLightStrength ?? null }))
      .filter((e) => e.v !== null);
  });
  out.d7eAll = await readAllLightStrengths(O);
}

/** D8 · D8p — 별 배경. */
async function runStars(browser, out, pages) {
  const S = await setupPage(browser, Q.starsOff, 'S-starsOff', T_JD_CLOUD);
  pages.push(S);
  out.software = await S.page.evaluate(() => window.__isSoftwareRenderer === true);
  out.d8LoadCounts = await readCounts(S);
  await callSetter(S, 'setStarfieldVisible', true);
  out.ready.push(await waitMaterialReady(S, STARFIELD_MESH));
  const firstId = await S.page.evaluate(
    (n) => window.__simCore.scene.getMeshByName(n)?.uniqueId ?? null,
    STARFIELD_MESH,
  );
  out.d8AfterOn = await readCounts(S);
  out.d8pRuntime = await readQueue(S, '_opaqueSubMeshes');
  for (let i = 0; i < STRESS_ROUND_TRIPS; i += 1) {
    await callSetter(S, 'setStarfieldVisible', false);
    await callSetter(S, 'setStarfieldVisible', true);
  }
  await frames(S.page, 2);
  out.d8AfterTrips = await readCounts(S);
  out.d8SameInstance =
    firstId !== null &&
    (await S.page.evaluate(
      ({ n, id }) => window.__simCore.scene.getMeshByName(n)?.uniqueId === id,
      { n: STARFIELD_MESH, id: firstId },
    ));
  await callSetter(S, 'setStarfieldVisible', false);
  out.d8OffEnabled = await S.page.evaluate(
    (n) => window.__simCore.scene.getMeshByName(n)?.isEnabled() ?? null,
    STARFIELD_MESH,
  );

  // ── D8 픽셀 — 하드웨어 전용 (소프트웨어 렌더는 로드 ON 에서도 별을 만들지 않는다 — #745) ──
  if (out.software) {
    out.d8Pixel = {
      skipped:
        '소프트웨어 렌더 — 로드 ON 에 별이 없어 쌍이 성립하지 않는다 (D8b 와 함께 실 Chrome 수동)',
    };
    return;
  }
  const H1 = await setupPage(browser, Q.starsOn, 'H1-starsOn', T_JD_CLOUD);
  const H2 = await setupPage(browser, Q.starsOff, 'H2-starsOff', T_JD_CLOUD);
  const H3 = await setupPage(browser, Q.starsOn, 'H3-starsOn', T_JD_CLOUD);
  pages.push(H1, H2, H3);
  const h1Pre = await capture(H1, 'H1-pre');
  const h2Img = await capture(H2, 'H2');
  const h3Img = await capture(H3, 'H3');
  out.d8Determinism = await measureCheckedPair(H1, h1Pre, H3, h3Img, 'd8Determinism');
  out.d8Positive = await measureCheckedPair(H1, h1Pre, H2, h2Img, 'd8Positive');
  await callSetter(H1, 'setStarfieldVisible', false);
  out.d8Pixel = await measureCheckedPair(H1, await capture(H1, 'H1-runtime-off'), H2, h2Img, 'd8');
  // D8b (진단 전용 — 판정은 PR2 실 Chrome 수동): `?stars=off` 로드 후 켠 화면 ↔ 로드 ON.
  await callSetter(H2, 'setStarfieldVisible', true);
  const ready = await waitMaterialReady(H2, STARFIELD_MESH);
  out.d8bDiag = ready.error
    ? ready
    : await measureCheckedPair(H2, await capture(H2, 'H2-runtime-on'), H1, h1Pre, 'd8b');
}

/** D15 — 4 토글 × 10 왕복 × (재생 / 일시정지). */
async function runStress(browser, out, pages) {
  const T = await setupPage(browser, Q.stress, 'T-stress', T_JD_CLOUD);
  pages.push(T);
  const setters = [
    'setOrbitLinesVisible',
    'setStarfieldVisible',
    'setCloudsVisible',
    'setNightLightsVisible',
  ];
  for (const playback of ['play', 'pause']) {
    await T.page.evaluate((p) => window.__simCore.command({ type: p }), playback);
    for (const s of setters) {
      for (let i = 0; i < STRESS_ROUND_TRIPS; i += 1) {
        await callSetter(T, s, false);
        await frames(T.page, 1);
        await callSetter(T, s, true);
        await frames(T.page, 1);
      }
    }
  }
  await T.page.evaluate(() => window.__simCore.command({ type: 'pause' }));
  if (INJECT === 'console') {
    await T.page.evaluate(() => console.error('[1265 inject] runtime error canary'));
    out.injectNote = 'console — D15 페이지 콘솔 에러 1건';
  }
  await frames(T.page, 4);
  out.d15Counts = await readCounts(T);
  out.d15Errors = [...T.errors];
}

/**
 * 섹션이 끝날 때마다 그 섹션의 페이지를 닫는다 — 열린 컨텍스트가 쌓이면 뒤 페이지의 부팅 (핸들 노출) 이
 * 누적으로 느려져 `bootstrapScene` 핸들 대기 20 s 에 접근한다 (1차 실행 실측: 11 페이지를 끝까지 열어 두면
 * 핸들 대기가 `2.3 s → 13.4 s` 로 단조 증가). 닫기 전에 정착 기록 · 콘솔 에러를 결과로 옮긴다.
 */
async function retirePages(out, pages) {
  for (const p of pages.splice(0)) {
    out.settles.push(...p.settles.map((s) => ({ page: p.label, ...s })));
    out.consoleErrors[p.label] = [...p.errors];
    await p.context.close();
  }
}

async function run(browser) {
  const out = { inject: INJECT, ready: [], settles: [], consoleErrors: {} };
  const pages = [];
  try {
    for (const section of [runClouds, runNightLights, runStars, runStress]) {
      await section(browser, out, pages);
      await retirePages(out, pages);
    }
  } finally {
    await retirePages(out, pages);
  }
  return out;
}

function judge(r) {
  // 2 · 4 — 측정 오류는 **모든 게이트보다 먼저** (#1214 시그니처 5 — 부분 결과로 게이트를 계산하지 않는다).
  const unmeasurable = [];
  const pairKeys = [
    'd5Positive',
    'd5',
    'd6Positive',
    'd6',
    'd6AfterTrips',
    'd6f',
    'd7Positive',
    'd7',
    'd7m',
  ];
  if (!r.software) pairKeys.push('d8Determinism', 'd8Positive', 'd8Pixel');
  for (const k of pairKeys) if (r[k]?.error) unmeasurable.push(`(2) ${k}: ${r[k].error}`);
  for (const k of ['d5SortA', 'd5SortB', 'd6fQueueE', 'd6fQueueF', 'd8pLoad', 'd8pRuntime'])
    if (r[k]?.error) unmeasurable.push(`(2) ${k}: ${r[k].error}`);
  for (const x of r.ready) if (x.error) unmeasurable.push(`(4) ${x.error}`);
  if (unmeasurable.length) return { unmeasurable };

  for (const s of r.settles)
    if (s.timedOut)
      unmeasurable.push(
        `(1) LOD 정착 상한 초과 — ${s.page}/${s.step} (${s.waitedMs}ms, dist=${s.dist})`,
      );
  // 3 — 양성 대조: 쌍이 그 효과를 실제로 담고 있어야 `== 0` 술어가 판별력을 가진다.
  for (const k of ['d5Positive', 'd6Positive', 'd7Positive'])
    if (!(r[k].disk.changed > 0))
      unmeasurable.push(
        `(3) ${k} — 로드 ON ↔ 로드 OFF disk 변화 ${r[k].disk.changed} (효과가 쌍에 없다)`,
      );
  // 5 — fade 재현이 하네스 설정 (mid 를 투명 큐에) 을 실제로 만들었는가. 구름 존재는 제품 속성이라 게이트가 잰다.
  for (const k of ['d6fQueueE', 'd6fQueueF'])
    if (!r[k].entries.some((e) => e.name === EARTH_MID))
      unmeasurable.push(`(5) ${k} — fade 재현 투명 큐에 ${EARTH_MID} 부재`);
  // 6 — D7e 엣지가 실제로 실행됐는가 (토글 시점 mid 없음 ∧ 이후 생성).
  if (r.d7eMidAtToggle !== false || r.d7eMidAfter !== true)
    unmeasurable.push(
      `(6) D7e 엣지 미실행 — 토글 시점 mid ${r.d7eMidAtToggle} · 정착 후 mid ${r.d7eMidAfter}`,
    );
  // 7 — 로드 경로 전제 (이 가드가 아니라 verify:738 이 지키는 계약 — 여기서는 쌍 성립 조건).
  if (r.d8LoadCounts.stars !== 0)
    unmeasurable.push(`(7) ?stars=off 로드에 starfield ${r.d8LoadCounts.stars}개`);
  // 8 — D8p 가 공허 참이 아니려면 큐가 비어 있지 않고 starfield 가 그 안에 있어야 한다.
  const rq = r.d8pRuntime.entries;
  if (rq.length === 0 || !rq.some((e) => e.name === STARFIELD_MESH))
    unmeasurable.push(
      `(8) D8p 불투명 큐 ${rq.length}개 · starfield 포함 ${rq.some((e) => e.name === STARFIELD_MESH)}`,
    );
  // 9 — D8 (하드웨어) 결정성 · 양성 대조.
  if (!r.software) {
    if (r.d8Determinism.fullChanged !== 0)
      unmeasurable.push(
        `(9) D8 독립 2 로드 full frame 변화 ${r.d8Determinism.fullChanged} px (비결정)`,
      );
    if (!(r.d8Positive.fullChanged > 0))
      unmeasurable.push(
        `(9) D8 로드 ON ↔ OFF full frame 변화 ${r.d8Positive.fullChanged} (별이 쌍에 없다)`,
      );
  }
  if (unmeasurable.length) return { unmeasurable };

  const leak = r.d6Leak;
  const tripsOk = leak.trips.every(
    (t) =>
      t.off.clouds === 0 &&
      t.on.clouds === 1 &&
      t.off.meshes === leak.countsOffLoad.meshes &&
      t.off.materials === leak.countsOffLoad.materials &&
      t.on.meshes === leak.countsOn.meshes &&
      t.on.materials === leak.countsOn.materials,
  );
  const maxClouds = Math.max(leak.countsOn.clouds, ...leak.trips.map((t) => t.on.clouds));
  const nonStarNoDepth = [...r.d8pLoad.entries, ...rq].filter(
    (e) => e.name !== STARFIELD_MESH && e.noDepthWrite,
  );
  const allErrors = Object.values(r.consoleErrors).flat();
  const gates = [
    [
      'D5 구름 런타임 OFF ↔ 로드 OFF disk 변화 px',
      r.d5.disk.changed,
      '== 0',
      r.d5.disk.changed === 0,
    ],
    [
      'D5 구조 — earth-cloud 수 · 그룹 0 정렬 (A/B)',
      `${r.d5CountsA.clouds} · A ${JSON.stringify(r.d5SortA)} · B ${JSON.stringify(r.d5SortB)}`,
      '0 ∧ A·B 둘 다 투명/불투명 기본값',
      r.d5CountsA.clouds === 0 &&
        r.d5SortA.transparentDefault &&
        r.d5SortA.opaqueDefault &&
        r.d5SortB.transparentDefault &&
        r.d5SortB.opaqueDefault,
    ],
    [
      'D6 구름 런타임 ON (자전 ON) ↔ 로드 ON disk 변화 px',
      r.d6.disk.changed,
      '== 0',
      r.d6.disk.changed === 0,
    ],
    [
      `D6 ${CLOUD_ROUND_TRIPS}왕복 누수 — 최대 구름 수 · 상태별 meshes/materials`,
      `${maxClouds} · ${JSON.stringify(leak)}`,
      '≤ 1 ∧ OFF = 로드 OFF 개수 ∧ ON = 첫 ON 개수',
      maxClouds <= 1 && tripsOk,
    ],
    [
      'D6 왕복 후 ↔ 로드 ON disk 변화 px',
      r.d6AfterTrips.disk.changed,
      '== 0',
      r.d6AfterTrips.disk.changed === 0,
    ],
    [
      'D6f mid 선생성 뒤 ON · fade 정지 ↔ 로드 ON disk 변화 px',
      r.d6f.disk.changed,
      '== 0',
      r.d6f.disk.changed === 0,
    ],
    [
      'D7 불빛 런타임 OFF ↔ 로드 OFF disk 변화 px',
      r.d7.disk.changed,
      '== 0',
      r.d7.disk.changed === 0,
    ],
    [
      'D7 uniform — nightLightStrength 보유 머티리얼 전부',
      JSON.stringify(r.d7Strengths.map((e) => e.v)),
      '전부 0 ∧ 1개 이상',
      r.d7Strengths.length > 0 && r.d7Strengths.every((e) => e.v === 0),
    ],
    ['D7m 끈 뒤 mid 정착 쌍 disk 변화 px', r.d7m.disk.changed, '== 0', r.d7m.disk.changed === 0],
    [
      'D7e 개요 OFF → focus → mid: 지구 high·mid · 전 머티리얼',
      `earth ${JSON.stringify(r.d7eEarth)} · all ${r.d7eAll.length}`,
      '지구 high·mid 둘 다 존재 ∧ 전부 0',
      r.d7eEarth.some((e) => e.name === 'earth') &&
        r.d7eEarth.some((e) => e.name === EARTH_MID) &&
        r.d7eEarth.every((e) => e.v === 0) &&
        r.d7eAll.every((e) => e.v === 0),
    ],
    [
      `D8 구조 — stars=off → ON 수 · ${STRESS_ROUND_TRIPS}왕복 후 수 · 같은 인스턴스 · OFF 후 enabled`,
      `${r.d8AfterOn.stars} · ${r.d8AfterTrips.stars} · ${r.d8SameInstance} · ${r.d8OffEnabled}`,
      '1 · 1 · true · false',
      r.d8AfterOn.stars === 1 &&
        r.d8AfterTrips.stars === 1 &&
        r.d8SameInstance === true &&
        r.d8OffEnabled === false,
    ],
    r.software
      ? ['D8 픽셀 (하드웨어 전용)', 'SKIP — 소프트웨어 렌더', '—', true]
      : [
          'D8 별 런타임 OFF ↔ 로드 OFF full frame 변화 px',
          r.d8Pixel.fullChanged,
          '== 0',
          r.d8Pixel.fullChanged === 0,
        ],
    [
      'D8p 그룹 0 불투명 큐 — starfield 외 depth write off mesh',
      JSON.stringify(nonStarNoDepth.map((e) => e.name)),
      '없음',
      nonStarNoDepth.length === 0,
    ],
    [
      `D15 ${STRESS_ROUND_TRIPS}왕복 × 4 토글 × 재생/일시정지 — 콘솔 에러 (스트레스 페이지)`,
      String(r.d15Errors.length),
      '!hasSimErrors',
      !hasSimErrors(r.d15Errors),
    ],
    [
      'D15 전 페이지 콘솔 에러',
      String(allErrors.length),
      '!hasSimErrors',
      !hasSimErrors(allErrors),
    ],
  ];
  return { gates };
}

async function main() {
  // SWIFTSHADER 미지정이면 렌더러 축을 `BROWSER_VERIFY_GPU` (기본 `default`) 에 맡긴다 — D8 픽셀은 하드웨어
  // 렌더에서만 성립하므로 로컬에서 `BROWSER_VERIFY_GPU=metal` 로 실 GPU 경로를 열 수 있어야 한다.
  const r = await withBrowser({ gpu: SWIFTSHADER ? 'swiftshader' : undefined }, run, {
    launch: launchBrowser,
  });
  console.log(
    `=== #1265 런타임 표시 토글 (core) — 진단 (INJECT=${INJECT}${r.injectNote ? ` — ${r.injectNote}` : ''}) ===`,
  );
  const show = (label, m) =>
    m?.error
      ? console.log(`${label}: error ${m.error}`)
      : console.log(
          `${label}: ${JSON.stringify({ disk: m?.disk, DI: m?.DI, NI: m?.NI, fullChanged: m?.fullChanged, outsideChanged: m?.outsideChanged })}`,
        );
  console.log(`renderer software=${r.software}`);
  for (const k of [
    'd5Positive',
    'd5',
    'd6Positive',
    'd6',
    'd6AfterTrips',
    'd6f',
    'd7Positive',
    'd7',
    'd7m',
  ])
    show(k, r[k]);
  if (!r.software)
    for (const k of ['d8Determinism', 'd8Positive', 'd8Pixel', 'd8bDiag']) show(k, r[k]);
  else console.log(`d8Pixel: ${JSON.stringify(r.d8Pixel)}`);
  console.log(
    `d5 sort A ${JSON.stringify(r.d5SortA)} · B ${JSON.stringify(r.d5SortB)} · counts A ${JSON.stringify(r.d5CountsA)}`,
  );
  console.log(`d6 leak ${JSON.stringify(r.d6Leak)}`);
  console.log(
    `d6f mid 존재(ON 직전) ${r.d6fMidBeforeOn} · queue E ${JSON.stringify(r.d6fQueueE)} · F ${JSON.stringify(r.d6fQueueF)}`,
  );
  console.log(
    `d7 mid 존재(OFF 직전) ${r.d7MidBeforeOff} · strengths ${JSON.stringify(r.d7Strengths)}`,
  );
  console.log(
    `d7e mid 토글 시점 ${r.d7eMidAtToggle} · 정착 후 ${r.d7eMidAfter} · earth ${JSON.stringify(r.d7eEarth)}`,
  );
  console.log(
    `d8 counts load ${JSON.stringify(r.d8LoadCounts)} · on ${JSON.stringify(r.d8AfterOn)} · trips ${JSON.stringify(r.d8AfterTrips)}`,
  );
  console.log(`d8p load ${JSON.stringify(r.d8pLoad)} · runtime ${JSON.stringify(r.d8pRuntime)}`);
  console.log(`d15 counts ${JSON.stringify(r.d15Counts)}`);
  console.log(
    `settles ${JSON.stringify(r.settles.map((s) => `${s.page}/${s.step}:${s.dist}/${s.fading}/${s.timedOut ? 'TIMEOUT' : 'ok'}`))}`,
  );
  console.log(`consoleErrors ${JSON.stringify(r.consoleErrors)}`);

  const v = judge(r);
  if (v.unmeasurable) {
    console.error('\n[측정 불가] 유효성 전제 미충족 — PASS 도 FAIL 도 내지 않는다:');
    for (const u of v.unmeasurable) console.error(`  - ${u}`);
    return EXIT_UNMEASURABLE;
  }
  console.log('\n=== 게이트 ===');
  let anyFail = false;
  for (const [name, value, cond, ok] of v.gates) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name} = ${value}  (${cond})`);
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
