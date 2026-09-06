#!/usr/bin/env node
/**
 * #783 — 지구 디테일 (극관 + biome 위도 색 변화) 동적 검증 (Amendment 3 §A3.5 DoD 1~3 산식).
 *
 * 실 Chrome GUI (headless:false, channel:chrome) — WebGPU swiftshader freeze 회피 (#663/#756).
 * 픽셀 측정 = composited canvas.screenshot() → 페이지 내 Image 디코드 → 2D getImageData
 * (WebGPU drawImage readback 빈버퍼 함정 회피 — #728 SSoT).
 *
 * 결정적 프레임 레시피 (실측 근거 — PR 본문 박제):
 *   1. `?focus=earth&rotate=off&orbits=off` 로 로드 — identity rotation → local Y = world Y
 *      = 화면 세로축 (tilt 오염 제거, ADR §A3.2-5). ⚠️ `?speed=0` 를 로드 쿼리에 넣으면
 *      focus 정착(LOD/광원 per-frame 갱신)이 완주하지 않아 disk 가 렌더되지 않는다 (실측)
 *      — 로드는 기본 speed 로 진행.
 *   2. 정착 후 런타임 `__simCore.command(jumpToJulianDate T_JD)` + `command(pause)` 동기 연속
 *      호출 — 프레임 고정 (재현 결정적).
 *   3. T_JD = 2451626.0 (2000-03-22, 춘분 근방) — 지구 공전 방위 ~182° 에서 태양 방향이
 *      world +X (⊥ 패턴 극축 world Y) → terminator 세로 = 남북 극 밴드 양쪽에 낮면 존재
 *      (§A3.5 DoD 1 "남북 모두 낮면" 측정 가능 조건. dataset epoch J2000 은 태양이 −Y 로
 *      남극만 낮면이라 측정 불능 — 실측).
 *
 * disk 기하: 중심 = mesh 위치 화면 투영, 반경 = boundingSphere.radiusWorld/√3 (실 구 반경) 의
 * edge 점 화면 투영 (bbox cube 모서리 투영은 ~1.2x 과대, 마스크 count 는 밤면 limb 탈락으로
 * ~7% 과소 — 실측 보정 이력, 둘 다 밴드를 캡 밖으로 어긋나게 함).
 *
 * 측정 축 (§A3.5):
 *  - DoD 1 극관: disk 세로 양극단 12% (낮면 측, 남북 각각) near-white (min(R,G,B)≥140 &&
 *    max−min≤40) 비율 ≥ 50% + OFF(&surface=off) 대비 유의 증가.
 *  - DoD 2 biome: 적도 밴드 (|dy|≤0.15R) land 픽셀 평균 G-share > 중위도 밴드 (0.4–0.65R).
 *  - DoD 3 마젠타 0: disk 픽셀 중 R>G+15 && B>G+15 개수 0.
 *  - DoD 4: 밤면 극 휘도 < 낮면 극 휘도 × 1/3 (#773 무회귀 — 극관도 shade 곱 아래).
 *
 * 모드:
 *   node browser-verify-783-earth-detail.mjs                     # DoD 측정 (earth ON vs OFF)
 *   MODE=others CAPTURE_DIR=/abs node ...                        # mars/jupiter/moon 결정적 캡처 (분기 격리 diff 용)
 *   MODE=diff node ... <dirA> <dirB>                             # 캡처 dir 픽셀 diff (Concrete Prediction: ≈0)
 *   MODE=ocean node ...                                          # #1197 바다 깊이 그라데이션 (D5/D6/D6-b, uniform 주입 내장)
 *
 * ── Amendment 7 (#1197) MODE=ocean — 바다 깊이 색 (ADR §A7.5 D5/D6) ──────────────
 * **무엇을 재는가**: 지구 disk 픽셀을 구면 역투영해 sub-solar 근방 낮면 바다 픽셀만 고르고,
 * 그 집합의 Rec.709 휘도 **P10 ↔ P90 상대 갭** `(P90 − P10) / P90` 을 낸다. 깊이 색이 없으면
 * 바다가 단일 albedo 라 갭이 `0` 근처로 붕괴한다.
 *
 * **왜 `ndl >= 0.9` 로 좁히는가**: ocean 픽셀 휘도는 `col *= shade` 때문에 광원 항이 깊이 신호를
 * 압도한다. 좁은 대역에서는 shade 가 준일정이라 휘도 차 ≈ albedo 차가 된다. [실측] `sunFactor` 는
 * `ndl >= SOFT_TERMINATOR_WIDTH(0.12)` 에서 이미 포화하므로 이 대역의 실효는 광원 균일화가 아니라
 * **`hemiFactor`(위도) 변동 억제**다.
 *
 * **판별력 내장 (#1123 「테스트가 있다 ≠ 작동한다」)**: 같은 실행 안에서 `deepOceanFactor` uniform 을
 * 매 프레임 덮어쓴 프레임을 **두 개** 함께 측정한다.
 *  - `(1,1,1)` = negative. D12 가 지정한 결함 보유판(변이 M-a)과 **동일한 변이**다 — 두 요구가
 *    한 변이로 닫힌다.
 *  - `(0,0,0)` = zero probe. 바인딩이 소실됐을 때(변이 M-h) uniform 이 남는 값이라 **M-h 상태의
 *    대조군**이다.
 * 두 프레임 모두 `patchedMaterials > 0` 을 함께 assert 해 「초록 no-op」이 통과 증거로 오채택되는
 * 것을 막는다.
 *
 * **게이트는 3조건 동시** — D5 `ON >= τ` · D6 `ON − negative >= M` · D6-b `zero − ON >= M`.
 * 부호 비교만으로는 낙차가 `0` 에 임의로 가까워도 통과한다 (#1163
 * 라운드 2 [B4] 반증). 임계는 절대값이 아니라 **상대 성질**이며 ADR `20260705-759` 결정 3 규약을
 * 따른다. 표본 하한은 세 프레임 **전부**에 건다 — 갭이 기대 방향으로 낮거나 높은 이유가 「감쇠가
 * 죽어서」가 아니라 「표본이 말라서」일 수 있고, 그 상태의 낙차 술어는 오히려 초록으로 보인다.
 *
 * ── 픽셀 층 변이 실증 (원본 PASS · 변이 결과) ────────────────────────────────
 * PR 본문의 변이 표는 **단위 테스트 층** (`procedural-planet-shader.test.ts`) 전수 재현이다.
 * 아래는 **픽셀 층** (본 게이트) 에서 별도로 실측한 변이다.
 *
 * | 변이 | 단위 층 | 본 게이트 |
 * | --- | --- | --- |
 * | (없음 — 원본) | `88 passed (88)` | `exit 0` · D5 갭 `0.2317` · D6 낙차 `0.2289` · D6-b 상승 `0.3388` · [진단] 최심부 평균 RGB `(73.74, 170.01, 251.81)` |
 * | **M-h** — `material.setColor3('deepOceanFactor', …)` 바인딩 블록 삭제 | `88 passed (88)` | **`exit 1`** (D6-b 만 FAIL) · D5 갭 `0.5704` (PASS) · D6 낙차 `0.5677` (PASS) · **D6-b 상승 `0.0000` (FAIL)** · [진단] 최심부 `(29.66, 58.39, 73.93)` |
 * | **M-i** — `deepOceanFactor` 채널 역전 `(0.62, 0.45, 0.35)` 을 ON 프레임에 주입 | 해당 없음 (셰이더 소스 무변경) | **`exit 0` — 전 게이트 PASS (미검출)** · D5 갭 `0.1926` · D6 낙차 `0.1899` · D6-b 상승 `0.3778` · [진단] 최심부 `(110.68, 178.54, 196.53)` |
 *
 * [실측] 2026-09-06, 로컬 `SWIFTSHADER=1 HEADFUL=0` + `next dev :3000` (각 변이 → revert 후
 * 원본 재실행에서 위 원본 값 전건 재현). **M-h 를 잡는 것은 D6-b 하나뿐이다** — 나머지 둘은
 * 이 변이에서 PASS 로 남는다. uniform 이 `(0,0,0)` 으로 남아
 * `mix(vec3(1.0), vec3(0.0), d) = 1 - d` 가 되고, 이는 채널 공통 스칼라 감쇠라 (a) 색 순서를
 * 보존하고 (b) 갭을 **키우는** 방향이라 D5 의 단측 술어를 통과하기 때문이다. D6-b 가 재는 것은
 * 그 정적 속성이 아니라 **바인딩이 렌더 결과에 기여하는 양**이며, M-h 하에서는 zero 프레임과
 * ON 프레임의 uniform 이 같은 값이 되어 상승이 `0` 으로 붕괴한다 (게이트 근처 주석 참조).
 *
 * ⚠️ **M-i 는 어느 게이트도 잡지 못한다 — 알려진 사각이고, 여기서 닫지 않았다.** 기전은 이 파일의
 * ocean 표본 필터다: `if (b < g) { excludedLand++; continue; }` 가 색조 뒤집힌 픽셀을 land 로
 * 분류해 측정 집합에서 **배제**한다 ([실측] 원본 → M-i 에서 `nOcean` `3612 → 3557` ·
 * `excludedLand` `3566 → 3621`, 양쪽 델타 `55`). 이 필터를 통과한 표본은 코드상 `b >= g` 다.
 *
 * **한때 이 사각을 겨냥한 게이트 `D5-b` 가 있었으나 (최심부 색 순서 `b > g > r` strict) 삭제했다.**
 * 겨냥한 M-h 도 (색 순서는 채널 공통 스칼라 감쇠에 눈이 먼다) 스스로 선언한 색조 역전 M-i 도
 * (위 표본 필터에 막혀 술어에 도달하지 못한다) 잡지 못했고, 유일하게 실증된 검출이던 `(1,1,1)`
 * 주입은 D6 가 낙차로 이미 닫는다. 최심부 색은 지금도 인쇄하되 **판정에는 쓰지 않는다**.
 */

import { chromium } from 'playwright';
import { withBrowser } from '../../../scripts/browser-verify-utils.mjs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const CAPTURE_DIR = process.env.CAPTURE_DIR ?? null;
const HEADFUL = process.env.HEADFUL !== '0';
const MODE = process.env.MODE ?? 'dod';
// #759 — CI 실패 로컬 재현 (--use-angle=swiftshader). browser-verify-756-surface.mjs 주석 참조.
const SWIFTSHADER = process.env.SWIFTSHADER === '1';

/** 결정적 프레임 고정 JD — 2000-03-22 (춘분 근방, 태양 ⊥ 패턴 극축 — 헤더 주석 3). */
const T_JD = 2451626.0;
const NEAR_WHITE_MIN = 140; // DoD 1 — min(R,G,B) 하한 (/255)
const NEAR_WHITE_SPREAD = 40; // DoD 1 — 채널 max−min 상한
const POLAR_BAND = 0.12; // disk 세로 극단 — |dy| ≥ (1−0.12)R (sin-space 0.88 — ICE ramp 0.84~0.92 완료 구간 포함, #783 measurement-first 하향 후 기준)
const MAGENTA_TAU = 15; // DoD 3 — R>G+τ && B>G+τ
// disk 픽셀 멤버십 임계 — 성운 배경 (lum ~8–15) 배제, 밤면 ambient (~30) 포함 (실측 보정).
const DISK_LUM_MIN = 20;

// ─────────────────────────────────────────────────────────────────────────────
// Amendment 7 (#1197) MODE=ocean 상수 — 바다 깊이 그라데이션 (§A7.5 D5/D6).
// ─────────────────────────────────────────────────────────────────────────────

/** sub-solar 근방 대역 — 이 위를 재야 shade 가 준일정이라 휘도 차 ≈ albedo 차 (pm 확정 파라미터). */
const OCEAN_NDL_MIN = 0.9;

/** 극관 제외 (sin-space) — `ICE_LAT_LO` 와 같은 값. 흰 극관이 바다 휘도 분포를 오염시킨다. */
const OCEAN_POLAR_EXCLUDE_SIN_LAT = 0.84;

/** disk 역투영 표본 반경 (정규화) — limb 왜곡 대역 배제. `verify:1119` 와 같은 값. */
const OCEAN_DISK_SAMPLE_RADIUS = 0.85;

/** 해안 밴드 진단(비-게이트) 의 마스크 계조 대역 — `0.1 < maskLand < 0.9`. */
const OCEAN_COAST_BAND_LO = 0.1;
const OCEAN_COAST_BAND_HI = 0.9;

/**
 * §A7.5 D5 — **표본 하한**. 이보다 적으면 fail-fast (측정 불가를 조용히 통과시키지 않는다).
 *
 * 표본이 마르면 백분위가 잡음이 되는데 **그 상태는 초록으로 보인다** — 그래서 관측 수를 항상
 * 출력하고 하한 미달이면 즉사시킨다 (cross-validate 이견 수용 1). 밴드를 임의로 넓히는 우회는
 * 금지다 (`ndl` 대역은 pm 확정 파라미터).
 *
 * 값 근거 [실측] (2026-09-06, 로컬 `SWIFTSHADER=1 HEADFUL=0` + `next dev :3001`, 3회 전건
 * 동일 = sd `0`): ON `n = 3,612`. 하한은 그 **1/4** 로 잡는다 — AA·해상도·드라이버 변동을
 * 흡수하되 P10/P90 이 여전히 수백 표본 위에서 잡히는 대역이다.
 */
const OCEAN_MIN_SAMPLES = 900;

/**
 * §A7.5 D5 — ON 프레임 상대 갭 하한 `τ`. **D1 GPU 실측으로 확정**.
 *
 * ⚠️ **설계의 [산식] 값 `0.4477` 을 옮겨 적지 않았다** — 실측은 `0.2317` 로 그 절반 수준이다
 * (투영 foreshortening · AA · swiftshader · `ndl >= 0.9` cap 이 disk 중앙만 보므로 산식이 가정한
 * 전 구간 depth 분포와 다르다). 설계가 「그대로 옮겨 적지 말 것」이라 명시한 이유가 실측으로
 * 확인됐다.
 *
 * [실측] 3회 전건 동일 (sd `0`): ON `0.2317` / negative `0.0027` (같은 실행).
 * `τ` 는 ON 실측의 **절반** — 하드웨어/드라이버 편차 여유를 두되 negative 대역(`0.003` 급)과는
 * 한 자릿수 이상 떨어진다.
 */
const OCEAN_GAP_TAU = 0.11;

/**
 * §A7.5 D6 — `ON − negative` 낙차 하한 `M`. **부호 비교만으로는 낙차가 `0` 에 임의로 가까워도
 * 통과한다** (#1163 라운드 2 [B4] 가 반증한 것) — 그래서 `τ` 와 **동시** 요구한다.
 *
 * [실측] 낙차 `0.2289` (= ON `0.2317` − negative `0.0027`), 3회 전건 동일. `M` 은 그 **절반**.
 *
 * §A7.5 D6-b 의 `zero − ON` 상승 하한도 **같은 상수를 재사용**한다 (새 임계 숫자를 만들지 않는다).
 * [실측] 그 상승은 `0.3388` (= zero `0.5704` − ON `0.2317`) 로 `M` 위쪽에 있고, 변이 M-h 에서는
 * `0.0000` 으로 붕괴한다 — 두 대역 사이에 `M` 이 놓인다.
 */
const OCEAN_GAP_MARGIN = 0.11;

async function launch() {
  if (SWIFTSHADER) {
    console.log('[browser] headless chromium + --use-angle=swiftshader (CI 재현 — #759)');
    return chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });
  }
  const opts = HEADFUL ? { headless: false, channel: 'chrome' } : { headless: true };
  try {
    const b = await chromium.launch(opts);
    console.log(`[browser] ${HEADFUL ? '실 Chrome GUI' : 'headless chromium'}`);
    return b;
  } catch (e) {
    console.error(`[launch] chrome channel 부재 (${e.message}) — chromium 폴백`);
    return chromium.launch({ headless: !HEADFUL });
  }
}

async function setupPage(browser, query) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE_URL}${query}`, { waitUntil: 'networkidle', timeout: 45_000 });
  await page.waitForFunction(
    () => typeof window.__simCore !== 'undefined' && typeof window.__solarScene !== 'undefined',
    { timeout: 20_000 },
  );
  await page.waitForTimeout(2800); // mesh 생성 + focus tween + LOD 정착
  // 결정적 프레임: 고정 JD 점프 + pause (동기 연속 — 사이 tick 0). 헤더 주석 레시피 2.
  await page.evaluate((jd) => {
    window.__simCore.command({ type: 'jumpToJulianDate', julianDate: jd });
    window.__simCore.command({ type: 'pause' });
  }, T_JD);
  await page.waitForTimeout(1000); // 점프 반영 프레임 정착
  return { context, page, consoleErrors };
}

async function captureBody(page, bodyId, captureName) {
  const canvas = page.locator('canvas').first();
  const buf = await canvas.screenshot();
  if (CAPTURE_DIR && captureName) {
    await mkdir(CAPTURE_DIR, { recursive: true });
    await writeFile(path.join(CAPTURE_DIR, `${captureName}.png`), buf);
  }
  return buf;
}

/** earth disk 픽셀 측정 — DoD 산식 (파일 헤더 주석 참조). */
async function measureEarth(page, buf) {
  const b64 = buf.toString('base64');
  return page.evaluate(
    async ({ b64, NEAR_WHITE_MIN, NEAR_WHITE_SPREAD, POLAR_BAND, MAGENTA_TAU, DISK_LUM_MIN }) => {
      const scene = window.__simCore?.scene;
      const mesh = window.__solarScene?.meshes?.get('earth');
      if (!scene || !mesh) return { error: 'earth mesh/scene 부재' };
      const engine = scene.getEngine();
      const rw = engine.getRenderWidth();
      const rh = engine.getRenderHeight();
      const cam = scene.activeCamera;
      const vp = cam.viewport.toGlobal(rw, rh);
      const transform = scene.getTransformMatrix();
      const Vector3 = mesh.getAbsolutePosition().constructor;
      const idMat = mesh.getWorldMatrix().constructor.Identity();

      const meshPos = mesh.getAbsolutePosition();
      const bb = mesh.getBoundingInfo().boundingBox;
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const c of bb.vectorsWorld) {
        const p = Vector3.Project(c, idMat, transform, vp);
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      const centerScreen = Vector3.Project(meshPos, idMat, transform, vp);

      // sunDir 화면 투영 (낮/밤 분할 — #773 스크립트 방법 답습).
      let sunPos = null;
      for (const l of scene.lights) {
        if (l.position && (l.name === 'sun-light' || l.getClassName?.() === 'PointLight')) {
          sunPos = l.position;
          break;
        }
      }
      if (!sunPos) return { error: 'sunLight 부재' };
      const sunDirN = sunPos.subtract(meshPos).normalize();
      const meshRadius = bb.maximum.subtract(bb.minimum).length() * 0.5 || 1;
      const tipScreen = Vector3.Project(
        meshPos.add(sunDirN.scale(meshRadius * 4)),
        idMat,
        transform,
        vp,
      );
      let sdx = tipScreen.x - centerScreen.x;
      let sdy = tipScreen.y - centerScreen.y;
      const sdLen = Math.hypot(sdx, sdy) || 1;
      sdx /= sdLen;
      sdy /= sdLen;

      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = `data:image/png;base64,${b64}`;
      });
      const off = document.createElement('canvas');
      off.width = img.width;
      off.height = img.height;
      const ctx = off.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const sx = img.width / rw,
        sy = img.height / rh;
      const bx = Math.max(0, Math.round(minX * sx)),
        by = Math.max(0, Math.round(minY * sy));
      const bw = Math.min(img.width - bx, Math.max(1, Math.round((maxX - minX) * sx)));
      const bh = Math.min(img.height - by, Math.max(1, Math.round((maxY - minY) * sy)));
      if (bw < 8 || bh < 8) return { error: `disk bbox 너무 작음 ${bw}x${bh}` };
      const data = ctx.getImageData(bx, by, bw, bh).data;
      const cx = centerScreen.x * sx - bx;
      const cy = centerScreen.y * sy - by;

      // disk 반경 — 투영 기반 (정확): boundingSphere.radiusWorld 는 bounding cube half-diagonal
      // (구 반경 × √3) 이므로 √3 으로 나눠 실 world 반경 복원 → 카메라 right 방향 edge 점을
      // 화면 투영해 px 반경 산출. (마스크 count 기반은 밤면 limb 저휘도 픽셀 탈락으로 ~7%
      // 과소, bbox 투영은 cube 모서리로 ~1.2x 과대 — 실측 보정 이력.)
      const rWorld = mesh.getBoundingInfo().boundingSphere.radiusWorld / Math.sqrt(3);
      const camRight = cam.getDirection(new Vector3(1, 0, 0));
      const edgeScreen = Vector3.Project(meshPos.add(camRight.scale(rWorld)), idMat, transform, vp);
      const R = Math.hypot(
        (edgeScreen.x - centerScreen.x) * sx,
        (edgeScreen.y - centerScreen.y) * sy,
      );
      if (R < 20) return { error: `disk 투영 반경 너무 작음 ${R.toFixed(1)}` };

      // pass 2 — 밴드 집계. north = 화면 위 (dy<0) = local +Y, south = 화면 아래.
      const mkSide = () => ({ nDay: 0, whiteDay: 0 });
      const acc = {
        north: mkSide(),
        south: mkSide(),
        eq: { n: 0, gShareSum: 0 },
        mid: { n: 0, gShareSum: 0 },
        magenta: 0,
        disk: 0,
        dayPolarLum: [],
        nightPolarLum: [],
      };
      for (let y = 0; y < bh; y++) {
        for (let x = 0; x < bw; x++) {
          const i = (y * bw + x) * 4;
          const r = data[i],
            g = data[i + 1],
            b = data[i + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          if (lum < DISK_LUM_MIN) continue; // 우주 배경 + 성운 배제 (disk 멤버십 = R 추정과 동일 임계)
          acc.disk++;
          if (r > g + MAGENTA_TAU && b > g + MAGENTA_TAU) acc.magenta++; // DoD 3
          const dy = (y - cy) / R; // 화면 아래 = +dy (화면 좌표 y 하향) = 남쪽
          const dotSun = (x - cx) * sdx + (y - cy) * sdy;
          const isDay = dotSun > 0;
          const absDy = Math.abs(dy);
          const mn = Math.min(r, g, b),
            mx = Math.max(r, g, b);
          if (absDy >= 1 - POLAR_BAND && absDy <= 1.05) {
            (isDay ? acc.dayPolarLum : acc.nightPolarLum).push(lum);
            if (isDay) {
              const side = dy < 0 ? acc.north : acc.south;
              side.nDay++;
              if (mn >= NEAR_WHITE_MIN && mx - mn <= NEAR_WHITE_SPREAD) side.whiteDay++;
            }
          }
          if (isDay && lum > 40) {
            // land 픽셀 분류 — ocean(B≥G 청록) / near-white(극관 포화) 제외.
            const isLand = b < g && !(mn >= NEAR_WHITE_MIN && mx - mn <= NEAR_WHITE_SPREAD);
            if (isLand) {
              const gShare = g / Math.max(r + g + b, 1);
              if (absDy <= 0.15) {
                acc.eq.n++;
                acc.eq.gShareSum += gShare;
              } else if (absDy >= 0.4 && absDy <= 0.65) {
                acc.mid.n++;
                acc.mid.gShareSum += gShare;
              }
            }
          }
        }
      }
      const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
      const sideOut = (s) => ({
        nDay: s.nDay,
        whiteDayPct: s.nDay ? Number(((s.whiteDay / s.nDay) * 100).toFixed(1)) : null,
      });
      return {
        diskPx: acc.disk,
        R: Number(R.toFixed(1)),
        north: sideOut(acc.north),
        south: sideOut(acc.south),
        eqGShare: acc.eq.n ? Number((acc.eq.gShareSum / acc.eq.n).toFixed(4)) : null,
        midGShare: acc.mid.n ? Number((acc.mid.gShareSum / acc.mid.n).toFixed(4)) : null,
        eqN: acc.eq.n,
        midN: acc.mid.n,
        magenta: acc.magenta,
        dayPolarLum: Number(mean(acc.dayPolarLum).toFixed(1)),
        nightPolarLum: Number(mean(acc.nightPolarLum).toFixed(1)),
        screenSunDir: { x: Number(sdx.toFixed(3)), y: Number(sdy.toFixed(3)) },
      };
    },
    { b64, NEAR_WHITE_MIN, NEAR_WHITE_SPREAD, POLAR_BAND, MAGENTA_TAU, DISK_LUM_MIN },
  );
}

/**
 * MODE=diff — 두 캡처 dir 의 동명 PNG 픽셀 diff (Concrete Prediction: mars/jupiter/moon ≈ 0).
 * #759 (PR #796 reviewer 권고 4): 판정 미달 시 'CHECK' 로그만 남기고 exit 0 이던 것을
 * fail-fast 로 정정 — 불일치/미달 발견 시 true 반환 → 호출부가 exitCode=1 설정.
 */
async function diffDirs(dirA, dirB, names) {
  let anyFail = false;
  for (const name of names) {
    const a = PNG.sync.read(await readFile(path.join(dirA, `${name}.png`)));
    const b = PNG.sync.read(await readFile(path.join(dirB, `${name}.png`)));
    if (a.width !== b.width || a.height !== b.height) {
      console.log(`  ${name}: 크기 불일치 ${a.width}x${a.height} vs ${b.width}x${b.height} — FAIL`);
      anyFail = true;
      continue;
    }
    let diffPx = 0,
      maxDelta = 0;
    for (let i = 0; i < a.data.length; i += 4) {
      const d = Math.max(
        Math.abs(a.data[i] - b.data[i]),
        Math.abs(a.data[i + 1] - b.data[i + 1]),
        Math.abs(a.data[i + 2] - b.data[i + 2]),
      );
      if (d > 2) diffPx++; // 압축/AA 미세 노이즈 허용 (±2/255)
      if (d > maxDelta) maxDelta = d;
    }
    const total = a.data.length / 4;
    const pct = ((diffPx / total) * 100).toFixed(4);
    const pass = diffPx / total < 0.001;
    if (!pass) anyFail = true;
    console.log(
      `  ${name}: diffPx=${diffPx}/${total} (${pct}%) maxDelta=${maxDelta} → ${pass ? 'PASS (≈0)' : 'FAIL'}`,
    );
  }
  return anyFail;
}

/**
 * Amendment 7 (#1197) §A7.5 D6/D6-b — `deepOceanFactor` uniform 을 지정 값으로 **매 프레임
 * 덮어쓴다** (`verify:1119` `injectMaskDisabled` 선례 그대로 per-frame observer).
 *
 * Babylon 은 `bind()` 에서 uniform 을 먼저 올린 뒤 `onBindObservable` 을 알리므로, 우리 observer 가
 * 뒤에 등록되면 다음 프레임 업로드 값이 항상 주입값이 된다 — **프로덕션 코드 0 줄로** 특정
 * uniform 상태를 재현한다.
 *
 * 두 호출처:
 *  - `(1,1,1)` = D6 negative. 「깊이 감쇠가 죽은 상태」이며 D12 가 지정한 결함 보유판(변이 M-a)과
 *    **동일한 변이**다.
 *  - `(0,0,0)` = D6-b probe. 바인딩이 소실됐을 때 uniform 이 남는 값(변이 M-h)이며, 건강한
 *    빌드에서는 ON 프레임과 **다른** 상태여야 한다 (게이트 근처 주석 참조).
 *
 * ⚠️ `deepOceanFactor` 는 `vec3` 라 `setFloat` 로는 쓸 수 없다 — `setColor3` 가 정확한 주입이다.
 * `Color3` 생성자는 번들이라 전역에 없으므로 씬의 기존 Color3 인스턴스에서 얻는다.
 */
async function injectDeepOceanFactor(page, rgb) {
  return page.evaluate(([r, g, b]) => {
    const scene = window.__simCore?.scene;
    const earth = window.__solarScene?.meshes?.get('earth');
    if (!scene || !earth) return { patched: 0, error: 'earth mesh/scene 부재' };
    const sample = scene.ambientColor ?? scene.lights?.find((l) => l.diffuse)?.diffuse;
    const Color3 = sample?.constructor;
    if (typeof Color3 !== 'function') return { patched: 0, error: 'Color3 생성자 획득 실패' };
    const meshes = [earth, ...earth.getChildMeshes()];
    let patched = 0;
    for (const mesh of meshes) {
      const mat = mesh.material;
      if (mat && typeof mat.setColor3 === 'function' && mat.onBindObservable) {
        mat.onBindObservable.add(() => mat.setColor3('deepOceanFactor', new Color3(r, g, b)));
        patched += 1;
      }
    }
    return { patched };
  }, rgb);
}

/**
 * Amendment 7 (#1197) §A7.5 D5 — 낮면 바다 픽셀 휘도 백분위 갭 측정.
 *
 * 역투영은 `verify:1119` 술어를 그대로 재사용한다 (카메라 basis + 수직 FOV 로 픽셀별 world ray →
 * 구 교차 → 표면 법선. `rotate=off` 라 그 법선이 곧 셰이더의 `p`). 픽셀 선별 3조건:
 *   `ndl >= OCEAN_NDL_MIN` ∧ `|sin lat| < OCEAN_POLAR_EXCLUDE_SIN_LAT` ∧ `b >= g` (ocean 청록).
 *
 * 해안 밴드 진단은 **비-게이트 로그 출력**이다 (cross-validate 이견 수용 2). 기본 focus 에서 그
 * 대역은 sub-pixel (ocean 텍셀의 2.96%, 약 2텍셀) 이라 게이트로 걸면 플레이키가 된다 — 목적은
 * 해안 감쇠 항(변이 M-e)을 **관측 가능**하게 만드는 것이지 차단이 아니다.
 */
async function measureOceanDepth(page, buf) {
  const b64 = buf.toString('base64');
  return page.evaluate(
    async ({ b64, NDL_MIN, POLAR_EXCLUDE, SAMPLE_RADIUS, COAST_LO, COAST_HI }) => {
      const scene = window.__simCore?.scene;
      const mesh = window.__solarScene?.meshes?.get('earth');
      if (!scene || !mesh) return { error: 'earth mesh/scene 부재' };
      const engine = scene.getEngine();
      const rw = engine.getRenderWidth();
      const rh = engine.getRenderHeight();
      const camera = scene.activeCamera;
      const Vector3 = mesh.getAbsolutePosition().constructor;

      // 카메라 basis (world). Babylon local Z = forward.
      const forward = camera.getDirection(new Vector3(0, 0, 1));
      const right = camera.getDirection(new Vector3(1, 0, 0));
      const up = camera.getDirection(new Vector3(0, 1, 0));
      const camPos = camera.globalPosition ?? camera.position;
      const center = mesh.getAbsolutePosition();
      const radiusWorld = mesh.getBoundingInfo().boundingSphere.radiusWorld / Math.sqrt(3);

      let sunPos = null;
      for (const l of scene.lights) {
        if (l.position && (l.name === 'sun-light' || l.getClassName?.() === 'PointLight')) {
          sunPos = l.position;
          break;
        }
      }
      if (!sunPos) return { error: 'sunLight 부재' };
      const sunDir = sunPos.subtract(center).normalize();

      const idMat = mesh.getWorldMatrix().constructor.Identity();
      const transform = scene.getTransformMatrix();
      const vp = camera.viewport.toGlobal(rw, rh);
      const centerScreen = Vector3.Project(center, idMat, transform, vp);
      const edgeScreen = Vector3.Project(
        center.add(right.scale(radiusWorld)),
        idMat,
        transform,
        vp,
      );
      const diskR = Math.hypot(edgeScreen.x - centerScreen.x, edgeScreen.y - centerScreen.y);

      // 마스크 원본 (해안 밴드 진단 전용 — 게이트 아님). `verify:1119` 샘플러 그대로.
      const maskRes = await fetch('/textures/earth-land-mask.png');
      if (!maskRes.ok) return { error: `마스크 fetch 실패 HTTP ${maskRes.status}` };
      const maskBitmap = await createImageBitmap(await maskRes.blob());
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = maskBitmap.width;
      maskCanvas.height = maskBitmap.height;
      const maskCtx = maskCanvas.getContext('2d');
      maskCtx.drawImage(maskBitmap, 0, 0);
      const maskData = maskCtx.getImageData(0, 0, maskBitmap.width, maskBitmap.height).data;
      const MW = maskBitmap.width;
      const MH = maskBitmap.height;
      const maskTexel = (x, y) => {
        const wx = ((x % MW) + MW) % MW;
        const wy = Math.min(MH - 1, Math.max(0, y));
        return maskData[(wy * MW + wx) * 4] / 255;
      };
      const maskSample = (u, v) => {
        const fx = u * MW - 0.5;
        const fy = v * MH - 0.5;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const tx = fx - x0;
        const ty = fy - y0;
        const top = maskTexel(x0, y0) * (1 - tx) + maskTexel(x0 + 1, y0) * tx;
        const bot = maskTexel(x0, y0 + 1) * (1 - tx) + maskTexel(x0 + 1, y0 + 1) * tx;
        return top * (1 - ty) + bot * ty;
      };

      // 스크린샷 디코드 (WebGPU drawImage readback 빈버퍼 함정 회피 — #728 SSoT).
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = `data:image/png;base64,${b64}`;
      });
      const off = document.createElement('canvas');
      off.width = img.width;
      off.height = img.height;
      const ctx = off.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const sx = img.width / rw;
      const sy = img.height / rh;
      const shot = ctx.getImageData(0, 0, img.width, img.height).data;

      const tanHalfFov = Math.tan(camera.fov / 2);
      const aspect = rw / rh;
      const cxShot = centerScreen.x * sx;
      const cyShot = centerScreen.y * sy;
      const rShot = diskR * Math.max(sx, sy);
      const span = Math.ceil(rShot) + 2;

      // 휘도만이 아니라 채널값까지 보관한다 — D5 는 휘도 백분위만 쓰지만 최심부 대역의 대표 색
      // (비게이트 진단) 을 내려면 r/g/b 가 필요하다.
      const oceanPx = [];
      let excludedPolar = 0;
      let excludedNight = 0;
      let excludedLand = 0;
      // 표본 고갈 시 「왜 말랐는가」를 로그만으로 진단할 수 있게 disk 상 ndl 최댓값을 함께 낸다
      // (밴드가 낮면 밖에 놓인 것인지 대륙 위에 얹힌 것인지가 이 값으로 갈린다).
      let maxNdl = -1;
      let coastN = 0;
      let coastLumSum = 0;
      let openN = 0;
      let openLumSum = 0;

      for (
        let y = Math.max(0, Math.floor(cyShot - span));
        y < Math.min(img.height, cyShot + span);
        y++
      ) {
        for (
          let x = Math.max(0, Math.floor(cxShot - span));
          x < Math.min(img.width, cxShot + span);
          x++
        ) {
          const dx = (x - cxShot) / rShot;
          const dy = (y - cyShot) / rShot;
          if (dx * dx + dy * dy > SAMPLE_RADIUS * SAMPLE_RADIUS) continue;

          const px = x / sx;
          const py = y / sy;
          const ndcX = ((2 * px) / rw - 1) * aspect * tanHalfFov;
          const ndcY = (1 - (2 * py) / rh) * tanHalfFov;
          const dirX = forward.x + right.x * ndcX + up.x * ndcY;
          const dirY = forward.y + right.y * ndcX + up.y * ndcY;
          const dirZ = forward.z + right.z * ndcX + up.z * ndcY;
          const dlen = Math.hypot(dirX, dirY, dirZ);
          const rx = dirX / dlen;
          const ry = dirY / dlen;
          const rz = dirZ / dlen;

          const ocx = camPos.x - center.x;
          const ocy = camPos.y - center.y;
          const ocz = camPos.z - center.z;
          const bq = rx * ocx + ry * ocy + rz * ocz;
          const cq = ocx * ocx + ocy * ocy + ocz * ocz - radiusWorld * radiusWorld;
          const disc = bq * bq - cq;
          if (disc <= 0) continue;
          const t = -bq - Math.sqrt(disc);
          if (t <= 0) continue;
          const nx = (ocx + t * rx) / radiusWorld;
          const ny = (ocy + t * ry) / radiusWorld;
          const nz = (ocz + t * rz) / radiusWorld;

          if (Math.abs(ny) >= POLAR_EXCLUDE) {
            excludedPolar++;
            continue;
          }
          const ndl = nx * sunDir.x + ny * sunDir.y + nz * sunDir.z;
          if (ndl > maxNdl) maxNdl = ndl;
          if (ndl < NDL_MIN) {
            excludedNight++;
            continue;
          }

          const i = (y * img.width + x) * 4;
          const r = shot[i];
          const g = shot[i + 1];
          const b = shot[i + 2];
          // ocean 분류 — `verify:1119` 화면 분류 술어의 여집합 (land 는 `b < g`).
          if (b < g) {
            excludedLand++;
            continue;
          }
          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          oceanPx.push({ lum, r, g, b });

          // 해안 밴드 진단 (비-게이트) — 셰이더와 동일한 equirectangular UV.
          const u = Math.atan2(nz, nx) / (2 * Math.PI) + 0.5;
          const v = Math.acos(Math.min(1, Math.max(-1, ny))) / Math.PI;
          const m = maskSample(u, v);
          if (m > COAST_LO && m < COAST_HI) {
            coastN++;
            coastLumSum += lum;
          } else if (m === 0) {
            openN++;
            openLumSum += lum;
          }
        }
      }

      if (oceanPx.length === 0) {
        return {
          error: 'ocean 표본 0',
          diskR: Number(diskR.toFixed(2)),
          nOcean: 0,
          maxNdl: Number(maxNdl.toFixed(4)),
          excludedPolar,
          excludedNight,
          excludedLand,
        };
      }
      oceanPx.sort((a, b2) => a.lum - b2.lum);
      const pct = (q) =>
        oceanPx[Math.min(oceanPx.length - 1, Math.floor(q * (oceanPx.length - 1)))].lum;
      const p10 = pct(0.1);
      const p90 = pct(0.9);

      // 최심부 대역 대표 색 — 휘도 하위 10% (P10 이하) 를 「최심부」로 본다. 평균과 중앙값
      // 둘 다 낸다. **어느 게이트도 이 값을 판정에 쓰지 않는다** (진단 인쇄 전용).
      const deepEnd = Math.max(1, Math.floor(0.1 * (oceanPx.length - 1)) + 1);
      const deepBand = oceanPx.slice(0, deepEnd);
      const mean = (k) => deepBand.reduce((s, q) => s + q[k], 0) / deepBand.length;
      const medianOf = (k) => {
        const v = deepBand.map((q) => q[k]).sort((x, y) => x - y);
        return v[Math.floor((v.length - 1) / 2)];
      };
      return {
        diskR: Number(diskR.toFixed(2)),
        nOcean: oceanPx.length,
        maxNdl: Number(maxNdl.toFixed(4)),
        p10Lum: Number(p10.toFixed(2)),
        p50Lum: Number(pct(0.5).toFixed(2)),
        p90Lum: Number(p90.toFixed(2)),
        // 판정량 (b-2) — 상대 갭. raw 로 반환하고 판정은 raw 로 (인쇄만 반올림).
        gap: p90 > 0 ? (p90 - p10) / p90 : 0,
        // 최심부 대표 색 (비게이트 진단) — raw 로 반환하고 인쇄 시점에만 반올림한다.
        deepN: deepBand.length,
        deepMeanR: mean('r'),
        deepMeanG: mean('g'),
        deepMeanB: mean('b'),
        deepMedianRGB: [medianOf('r'), medianOf('g'), medianOf('b')],
        excludedPolar,
        excludedNight,
        excludedLand,
        coastN,
        coastMeanLum: coastN ? Number((coastLumSum / coastN).toFixed(2)) : null,
        openOceanN: openN,
        openOceanMeanLum: openN ? Number((openLumSum / openN).toFixed(2)) : null,
      };
    },
    {
      b64,
      NDL_MIN: OCEAN_NDL_MIN,
      POLAR_EXCLUDE: OCEAN_POLAR_EXCLUDE_SIN_LAT,
      SAMPLE_RADIUS: OCEAN_DISK_SAMPLE_RADIUS,
      COAST_LO: OCEAN_COAST_BAND_LO,
      COAST_HI: OCEAN_COAST_BAND_HI,
    },
  );
}

/**
 * MODE=ocean 공통 프레임 — DoD 레시피 + 적도면 시점 + **sub-solar 정면 방위**.
 *
 * ⚠️ **`alpha + 90°` 가 없으면 이 모드는 표본 `0` 으로 구조적 측정 불능이다** (D1 실측).
 * `?focus=earth` 의 기본 방위에서 **sub-camera 점의 `ndl` 이 정확히 `0`** 이다 — 카메라가
 * terminator 를 정면으로 본다. 그래서 disk 전체의 `ndl` 최댓값이 `0.7869` 에 그치고
 * `ndl >= 0.9` 대역에 **한 픽셀도 들어오지 않는다** (실측: 역투영 성공 픽셀 `21,953` 개 전부
 * `excludedNight`, `maxNdl 0.7869`).
 *
 * 방위 스윕 [실측] (`beta = π/2` 고정, sub-camera 점의 `ndl`):
 * `+0° → 0.0000` / `+30° → 0.4996` / `+60° → 0.8654` / **`+90° → 0.9993`** / `+120° → 0.8654` /
 * `+180° → 0.0000` / `+270° → −0.9993`. `+90°` 가 sub-solar 점을 disk 중심에 놓는다.
 *
 * **JD 는 건드리지 않았다** — `T_JD = 2451626.0` 은 `783`/`1119` 와 공유하는 결정성 앵커이고,
 * `ndl >= 0.9` 대역도 pm 확정 파라미터 그대로다. 바꾼 것은 **카메라 방위 하나**이며, 이는
 * `783` MODE=dod 가 이미 런타임에 `beta` 를 설정하는 것과 같은 계층이고 `verify:1119` MODE=seam
 * 이 카메라 4방위를 도는 선례가 있다 (`alpha += offset`). 방위는 낮면 반구를 **바꾸지 않고**
 * (그것은 JD 가 정한다) 그 반구의 어느 부분을 보는지만 정한다.
 *
 * `ndl >= 0.9` 는 각반경 `acos(0.9) = 25.84°` 라 정규화 disk 반경 `sin(25.84°) = 0.436` 인 원판이고,
 * `OCEAN_DISK_SAMPLE_RADIUS = 0.85` 안에 온전히 든다.
 */
const OCEAN_SUBSOLAR_ALPHA_OFFSET = Math.PI / 2;

async function setupOceanFrame(browser) {
  const ctx = await setupPage(browser, '?gpu=a&focus=earth&lod=auto&rotate=off&orbits=off');
  await ctx.page.evaluate((d) => {
    const cam = window.__simCore.scene.activeCamera;
    cam.beta = Math.PI / 2;
    cam.alpha += d;
  }, OCEAN_SUBSOLAR_ALPHA_OFFSET);
  await ctx.page.waitForTimeout(600);
  return ctx;
}

/** MODE=ocean — Amendment 7 (#1197) §A7.5 D5/D6/D6-b. */
async function runOcean(browser) {
  const results = {};

  // ── ① ON (정상 경로) ────────────────────────────────────────────────────
  {
    const { context, page, consoleErrors } = await setupOceanFrame(browser);
    const buf = await captureBody(page, 'earth', 'qa-1197-ocean-on');
    results.on = await measureOceanDepth(page, buf);
    results.on.consoleErrors = consoleErrors.length;
    await context.close();
  }

  // ── ② negative — deepOceanFactor (1,1,1) 고착 주입 (D6 = D12 결함 보유판 M-a) ──
  {
    const { context, page, consoleErrors } = await setupOceanFrame(browser);
    const injected = await injectDeepOceanFactor(page, [1, 1, 1]);
    await page.waitForTimeout(800); // observer 는 다음 bind 부터 유효 — 프레임 몇 개 대기
    const buf = await captureBody(page, 'earth', 'qa-1197-ocean-negative');
    results.negative = await measureOceanDepth(page, buf);
    results.negative.consoleErrors = consoleErrors.length;
    results.negative.patchedMaterials = injected.patched;
    results.negative.injectError = injected.error ?? null;
    await context.close();
  }

  // ── ③ zero probe — deepOceanFactor (0,0,0) 고착 주입 (D6-b = 변이 M-h 대조군) ──
  {
    const { context, page, consoleErrors } = await setupOceanFrame(browser);
    const injected = await injectDeepOceanFactor(page, [0, 0, 0]);
    await page.waitForTimeout(800);
    const buf = await captureBody(page, 'earth', 'qa-1197-ocean-zero');
    results.zero = await measureOceanDepth(page, buf);
    results.zero.consoleErrors = consoleErrors.length;
    results.zero.patchedMaterials = injected.patched;
    results.zero.injectError = injected.error ?? null;
    await context.close();
  }

  console.log('\n=== 측정 (#1197 바다 깊이 — 낮면 ocean 휘도 백분위 갭) ===');
  console.log(JSON.stringify(results, null, 2));

  const on = results.on;
  const neg = results.negative;
  const zero = results.zero;

  // 표본 고갈 fail-fast — cap 이 대륙 위에 얹히면 τ 가 잡음이 된다. 조용히 통과시키지 않는다.
  // R6 — negative 프레임도 같은 하한을 요구한다. negative 의 갭이 낮은 이유가 「깊이 감쇠가 죽어서」가
  // 아니라 「표본이 말라서」일 수 있고, 그 상태의 D6 는 낙차가 커서 오히려 초록으로 보인다.
  // zero probe 도 같은 이유로 같은 하한을 받는다 — D6-b 는 zero 갭이 **커야** 통과하는 술어라
  // 표본이 마른 프레임의 잡음 갭이 그 방향으로 튀면 역시 초록으로 보인다.
  const negSampleOk = !neg.error && (neg.nOcean ?? 0) >= OCEAN_MIN_SAMPLES;
  const zeroSampleOk = !zero.error && (zero.nOcean ?? 0) >= OCEAN_MIN_SAMPLES;
  const sampleOk = !on.error && on.nOcean >= OCEAN_MIN_SAMPLES && negSampleOk && zeroSampleOk;
  console.log('\n=== 판정 (§A7.5) ===');
  console.log(
    `표본: ON ocean 픽셀 ${on.nOcean ?? 0} / negative ${neg.nOcean ?? 0} / zero ${zero.nOcean ?? 0} (하한 ${OCEAN_MIN_SAMPLES}) · disk R ${on.diskR} · 제외 극관 ${on.excludedPolar} / 밤면·저ndl ${on.excludedNight} / 육지 ${on.excludedLand} → ${sampleOk ? 'PASS' : 'FAIL (측정 불가 — 밴드를 넓히지 말 것)'}`,
  );
  if (!sampleOk) {
    process.exitCode = 1;
    return;
  }

  const gapDrop = on.gap - neg.gap;
  const d5 = on.gap >= OCEAN_GAP_TAU && on.consoleErrors === 0;
  const d6 = !neg.error && neg.patchedMaterials > 0 && gapDrop >= OCEAN_GAP_MARGIN;
  // ── D6-b — 바인딩 기여도 계약 (변이 M-h) ──────────────────────────────────
  // 무엇을 거는가: `deepOceanFactor` 를 `(0,0,0)` 으로 주입한 프레임의 갭 `zeroGap` 이 ON 프레임의
  // 갭보다 **`M` 이상 크다**. 임계는 D6 와 **같은 상수** `OCEAN_GAP_MARGIN` 재사용 — 새 임계
  // 숫자가 없다.
  //
  // **왜 이 술어는 M-h 에 도달하는가**: 최심부 색의 채널 순서 같은 **정적 속성**은 채널 공통
  // 스칼라 감쇠에 눈이 먼다 — M-h 하의 `mix(vec3(1.0), vec3(0.0), d) = 1 - d` 는 세 채널에 같은
  // 배율이라 순서를 보존한다. 이 술어는 대신 **바인딩이 렌더 결과에 실제로 기여하는 양**을
  // 잰다. 건강한 빌드에서는 ON 프레임의
  // uniform 이 `DEEP_OCEAN_FACTOR` 이고 zero 프레임은 `(0,0,0)` 이라 두 프레임이 서로 다른 상태고,
  // 갭이 낙차만큼 벌어진다. M-h 하에서는 ON 프레임의 uniform 도 `(0,0,0)` 이 되어 두 프레임이
  // **같은 값**이 되고 낙차가 `0` 으로 붕괴한다.
  //
  // 부호(`zeroGap > onGap`) 가 아니라 마진을 요구하는 이유는 D6 와 같다 — 부호만으로는 낙차가
  // `0` 에 임의로 가까워도 통과한다 (#1163 라운드 2 [B4]).
  //
  // `patchedMaterials > 0` 을 함께 assert 하는 이유도 D6 와 같다: 주입이 no-op 이면 zero 프레임이
  // ON 프레임과 같아져 낙차가 `0` 이 되므로 **초록이 아니라 붉게** 죽지만, 그 붉음의 원인이
  // 「M-h 검출」인지 「주입 실패」인지 구분되어야 한다.
  const zeroGapRise = (zero.gap ?? 0) - on.gap;
  const d6b = !zero.error && zero.patchedMaterials > 0 && zeroGapRise >= OCEAN_GAP_MARGIN;
  console.log(
    `D5 깊이 그라데이션: ON 상대 갭 ${on.gap.toFixed(4)} (≥ τ ${OCEAN_GAP_TAU}) · P10 ${on.p10Lum} / P50 ${on.p50Lum} / P90 ${on.p90Lum} · console err ${on.consoleErrors} → ${d5 ? 'PASS' : 'FAIL'}`,
  );
  console.log(
    `D6 판별력 (deepOceanFactor (1,1,1) 고착 주입): 머티리얼 ${neg.patchedMaterials}개 패치 · negative 갭 ${neg.gap?.toFixed(4)} · 낙차 ${gapDrop.toFixed(4)} (≥ M ${OCEAN_GAP_MARGIN}) → ${d6 ? 'PASS' : 'FAIL'}`,
  );
  console.log(
    `D6-b 바인딩 기여도 (deepOceanFactor (0,0,0) 고착 주입 = 변이 M-h 대조군): 머티리얼 ${zero.patchedMaterials}개 패치 · zero 갭 ${zero.gap?.toFixed(4)} · ON 대비 상승 ${zeroGapRise.toFixed(4)} (≥ M ${OCEAN_GAP_MARGIN}) → ${d6b ? 'PASS' : 'FAIL'}`,
  );
  console.log(
    `  ↳ negative 프레임에 D5 술어 적용: 갭 ${neg.gap?.toFixed(4)} ≥ τ ${OCEAN_GAP_TAU} → ${neg.gap >= OCEAN_GAP_TAU ? 'PASS (판별력 없음 — 가드 실패)' : 'FAIL (기대대로 — 가드 작동)'}`,
  );
  // 해안 밴드 진단 — **비-게이트**. 결정 2 의 해안 감쇠 항(변이 M-e)을 관측 가능하게 만든다.
  // 기본 focus 에서 이 대역은 sub-pixel 이라 게이트로 걸면 플레이키가 된다.
  console.log(
    `  ↳ [진단·비게이트] 해안 밴드 (0.1<maskLand<0.9) n=${on.coastN} 평균 휘도 ${on.coastMeanLum} vs 원양 (maskLand==0) n=${on.openOceanN} 평균 ${on.openOceanMeanLum}`,
  );
  // 최심부(휘도 하위 10%) 대표 색 — **비게이트 진단**. 한때 이 세 수에 채널 순서 술어를 게이트로
  // 걸었으나, 겨냥한 변이 M-h 도 스스로 선언한 색조 역전 M-i 도 잡지 못해 삭제했다 (헤더 변이 표
  // 참조). 값 자체는 계속 인쇄한다 — M-i 가 뒤집는 것이 바로 이 세 수라, 남은 사각을 로그에서
  // 눈으로 관측할 수 있다.
  console.log(
    `  ↳ [진단·비게이트] ON 최심부 (하위 10% n=${on.deepN}) 평균 RGB (${on.deepMeanR.toFixed(2)}, ${on.deepMeanG.toFixed(2)}, ${on.deepMeanB.toFixed(2)}) · 중앙값 (${on.deepMedianRGB.join(', ')})`,
  );
  if (!(d5 && d6 && d6b)) process.exitCode = 1;
}

const OTHER_BODIES = ['mars', 'jupiter', 'moon'];

(async () => {
  if (MODE === 'diff') {
    const [dirA, dirB] = process.argv.slice(2);
    if (!dirA || !dirB) {
      console.error('usage: MODE=diff node ... <dirA> <dirB>');
      process.exit(2);
    }
    console.log(`=== 분기 격리 diff (${dirA} vs ${dirB}) — Concrete Prediction ≈0 ===`);
    const anyFail = await diffDirs(
      dirA,
      dirB,
      OTHER_BODIES.map((id) => `qa-783-${id}`),
    );
    if (anyFail) process.exitCode = 1; // #759 — fail-fast (PR #796 권고 4)
    return;
  }

  // #940 — 브라우저 수명주기를 `withBrowser` 로 위임 (에러 경로 close 도달 보장).
  //   `launch()` 는 chrome 채널 부재 시 chromium 폴백이라 옵션 조립만으로 표현 불가 →
  //   launcher 주입 seam 으로 그대로 넘긴다 (launch 인자 무변경 = 극관/biome 픽셀 측정 축 보존).
  await withBrowser(
    {},
    async (browser) => {
      if (MODE === 'ocean') {
        console.log(
          '=== #1197 바다 깊이 그라데이션 (D5/D6/D6-b — uniform 주입 프레임 2종 내장) ===',
        );
        await runOcean(browser);
        return;
      }

      if (MODE === 'others') {
        console.log('=== mars/jupiter/moon 결정적 캡처 (분기 격리 diff 용) ===');
        for (const id of OTHER_BODIES) {
          const { context, page, consoleErrors } = await setupPage(
            browser,
            `?gpu=a&focus=${id}&lod=auto&rotate=off&orbits=off`,
          );
          await captureBody(page, id, `qa-783-${id}`);
          console.log(`  ${id} 캡처 완료 (err=${consoleErrors.length})`);
          await context.close();
        }
        return;
      }

      // MODE=dod — DoD 측정 (ON vs OFF).
      const out = {};
      for (const [label, extra] of [
        ['on', ''],
        ['off', '&surface=off'],
      ]) {
        const { context, page, consoleErrors } = await setupPage(
          browser,
          `?gpu=a&focus=earth&lod=auto&rotate=off&orbits=off${extra}`,
        );
        // 적도면 시점 (beta=π/2) — 기본 beta 1.2566 (북쪽 18° 상방) 은 남극이 실루엣 뒤로 숨어
        // 남측 밴드가 저위도를 비춘다 (실측 남측 whiteness 1.6% vs 북측 72.7%). 적도면 시점에서
        // 양극이 실루엣 상/하단에 위치 → 화면 dy/R = sin(위도) 정확 매핑 (§A3.2-5 결정적 측정).
        await page.evaluate(() => {
          window.__simCore.scene.activeCamera.beta = Math.PI / 2;
        });
        await page.waitForTimeout(600);
        const buf = await captureBody(page, 'earth', `qa-783-earth-${label}`);
        const m = await measureEarth(page, buf);
        out[label] = { ...m, consoleErrors: consoleErrors.length };
        console.log(`\n=== earth surface=${label} ===`);
        console.log(JSON.stringify(m, null, 2));
        if (consoleErrors.length) console.log(`  ↳ console errors: ${consoleErrors.length}`);
        await context.close();
      }

      // 판정 (§A3.5 산식).
      const on = out.on,
        off = out.off;
      const capPass = (side) =>
        on[side].whiteDayPct !== null &&
        on[side].whiteDayPct >= 50 &&
        (off[side].whiteDayPct === null || on[side].whiteDayPct > off[side].whiteDayPct);
      const dod1 = capPass('north') && capPass('south');
      const dod2 = on.eqGShare !== null && on.midGShare !== null && on.eqGShare > on.midGShare;
      const dod3 = on.magenta === 0;
      const dod4 = on.nightPolarLum < on.dayPolarLum / 3;
      console.log('\n=== 판정 (§A3.5) ===');
      console.log(
        `DoD 1 극관(낮면 남북): N ${on.north.whiteDayPct}% / S ${on.south.whiteDayPct}% (≥50, OFF N ${off.north.whiteDayPct}% / S ${off.south.whiteDayPct}%) → ${dod1 ? 'PASS' : 'FAIL'}`,
      );
      console.log(
        `DoD 2 biome: 적도 G-share ${on.eqGShare} (n=${on.eqN}) > 중위도 ${on.midGShare} (n=${on.midN}) → ${dod2 ? 'PASS' : 'FAIL'}`,
      );
      console.log(`DoD 3 마젠타: ${on.magenta} px → ${dod3 ? 'PASS' : 'FAIL'}`);
      console.log(
        `DoD 4 극 휘도: 밤면 ${on.nightPolarLum} < 낮면 ${on.dayPolarLum}/3=${(on.dayPolarLum / 3).toFixed(1)} → ${dod4 ? 'PASS' : 'FAIL'}`,
      );
      if (!(dod1 && dod2 && dod3 && dod4)) process.exitCode = 1;
    },
    { launch },
  );
})();
