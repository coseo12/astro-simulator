#!/usr/bin/env node
/**
 * #1119 — 지구 대륙 마스크 동적 검증 (ADR `20260628-756` Amendment 4 §A4.5 DoD 1·2·14).
 *
 * **무엇을 재는가**: 화면에 그려진 지구 disk 의 각 픽셀을 **구면 역투영**해 위경도를 복원하고,
 * 그 지점의 커밋된 마스크 값과 **화면 픽셀의 육지/바다 분류**를 비교해 **IoU** 를 낸다.
 * 즉 "대륙이 실제와 같은 자리에 있는가" 를 사람 눈이 아니라 **픽셀 집합 연산**으로 판정한다.
 *
 * ⚠️ **이 스크립트가 유일하게 잡는 결함이 있다** — Phase 0 이 실측한 `invertY` 함정이다.
 * `new Texture(url, scene)` 로 인자를 생략하면 v 축이 뒤집히는데, **뒤집힌 채로 WebGPU/WebGL2 두
 * 백엔드가 사이좋게 일치한다.** cross-backend 일치만 보는 판정도, §결정 3-a 의 14점 단위 테스트
 * (위도 반전 잔존율 42.9%) 도 이를 통과시킨다. **DoD 1 임계 `0.80` 을 낮추지 말 것** — 낮추는
 * 순간 이 축의 유일한 방어가 사라진다.
 *
 * 결정적 프레임 레시피는 `browser-verify-783-earth-detail.mjs` 를 그대로 재사용한다:
 *   1. `?focus=earth&rotate=off&orbits=off` — identity rotation → local 축 = world 축 = 화면 축
 *      (tilt 오염 제거). `rotate=off` 면 `axialTilt` 도 적용되지 않는다 (#782 계약).
 *   2. 정착 후 `jumpToJulianDate(T_JD)` + `pause` 동기 연속 호출.
 *   3. `beta = π/2` 적도면 시점 — 화면 세로축이 극축과 정렬.
 *
 * 모드:
 *   node browser-verify-1119-earth-mask.mjs            # DoD 1 (IoU) + DoD 2 (negative)
 *   MODE=lod node browser-verify-1119-earth-mask.mjs   # DoD 14 (원거리 축소 uMaskEnabled 0 전환)
 *   MODE=seam node browser-verify-1119-earth-mask.mjs  # 자오선 u=0/1 경계 (Phase 0 잔여 미측정 2)
 *
 * 환경:
 *   HEADFUL=0     headless chromium (CI). 기본은 실 Chrome GUI.
 *   SWIFTSHADER=1 headless + --use-angle=swiftshader (CI WebGL2 재현)
 *   BASE_URL      기본 http://localhost:3000
 *   CAPTURE_DIR   지정 시 판정 프레임 PNG 저장
 */

import { chromium } from 'playwright';
import { withBrowser } from '../../../scripts/browser-verify-utils.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const CAPTURE_DIR = process.env.CAPTURE_DIR ?? null;
const HEADFUL = process.env.HEADFUL !== '0';
const SWIFTSHADER = process.env.SWIFTSHADER === '1';
const MODE = process.env.MODE ?? 'dod';

/** 결정적 프레임 고정 JD — 783 과 동일 (춘분 근방, 태양 ⊥ 극축이라 남북 양쪽에 낮면). */
const T_JD = 2451626.0;

/** §A4.5 DoD 1 — 화면 ↔ 마스크 IoU 하한. **낮추지 말 것** (모듈 헤더 참조). */
const IOU_THRESHOLD = 0.8;

/** 마스크 육지 판정 임계 (0~1 정규화 — 계조 128 과 동일). */
const MASK_LAND_LEVEL = 0.5;

/**
 * IoU 측정 대상 disk 반경 비율 상한. limb (r → 1) 은 원근 왜곡 + 접선 방향 texel 압축으로
 * 역투영 오차가 급증하므로 제외한다 (§A4.5 DoD 1 임계 근거 (iii)).
 */
const DISK_SAMPLE_RADIUS = 0.85;

/**
 * 극관 제외 위도 (|sin lat|). `ICE_LAT_LO = 0.84` 아래로 여유를 둔 값 — 극관은 육지/바다를
 * 가리지 않고 흰색으로 덮으므로 **양쪽 집합에서 동시에** 빼야 IoU 가 정의된다.
 *
 * ⚠️ **`DISK_SAMPLE_RADIUS = 0.85` 에서는 실제로 한 픽셀도 걸리지 않는다** (실측 `excludedPolar: 0`).
 * 원근 투영이 disk 가장자리를 바깥으로 확대하기 때문이다 — 1280×720 · focus=earth 실측에서 disk
 * 비율 `0.85` 는 `|sin lat| = 0.7898` 에 대응한다 (직교 근사라면 `0.85`). 즉 극관 밴드는 이미
 * 표본 밖이며, 본 상수는 `DISK_SAMPLE_RADIUS` 를 올릴 때를 위한 **보험**이다. 출력의
 * `excludedPolar` 를 그대로 노출해 이 사실이 숨지 않게 한다 (0 이 정상이라는 것도 측정 결과다).
 */
const POLAR_EXCLUDE_SIN_LAT = 0.8;

/** 낮면 판정 하한 (`dot(n, sunDir)`) — terminator 부근은 색이 눌려 분류가 흔들린다. */
const DAY_SIDE_MIN_NDL = 0.15;

/** §A4.5 DoD 14 — 원거리 축소 판정 임계 (셰이더 `SURFACE_MASK_MIN_DISK_PX` 와 동일 값). */
const MASK_MIN_DISK_PX = 16;

async function launch() {
  if (SWIFTSHADER) {
    console.log('[browser] headless chromium + --use-angle=swiftshader (CI 재현 — #759)');
    return chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });
  }
  const opts = HEADFUL ? { headless: false, channel: 'chrome' } : { headless: true };
  try {
    const browser = await chromium.launch(opts);
    console.log(`[browser] ${HEADFUL ? '실 Chrome GUI' : 'headless chromium'}`);
    return browser;
  } catch (e) {
    console.error(`[launch] chrome channel 부재 (${e.message}) — chromium 폴백`);
    return chromium.launch({ headless: !HEADFUL });
  }
}

async function setupPage(browser, query, { equatorialView = true, julianDate = T_JD } = {}) {
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
  await page.evaluate((jd) => {
    window.__simCore.command({ type: 'jumpToJulianDate', julianDate: jd });
    window.__simCore.command({ type: 'pause' });
  }, julianDate);
  await page.waitForTimeout(1000);
  if (equatorialView) {
    await page.evaluate(() => {
      window.__simCore.scene.activeCamera.beta = Math.PI / 2;
    });
    await page.waitForTimeout(600);
  }
  return { context, page, consoleErrors };
}

/**
 * 지구 머티리얼(high + LOD variant) 전부에 `uMaskEnabled = 0` 을 **매 프레임 덮어쓰는** observer 를
 * 추가한다 (§A4.5 DoD 2 negative injection).
 *
 * Babylon 은 `bind()` 에서 uniform 을 먼저 올린 뒤 `onBindObservable` 을 알린다. 즉 우리 observer 가
 * 머티리얼 자신의 observer **뒤에** 등록되면 다음 프레임 업로드 값이 항상 `0` 이 된다 —
 * **프로덕션 코드 0 줄로** "마스크가 0 으로 고착된 상태" 를 재현한다.
 */
async function injectMaskDisabled(page) {
  return page.evaluate(() => {
    const earth = window.__solarScene?.meshes?.get('earth');
    if (!earth) return { patched: 0, error: 'earth mesh 부재' };
    const meshes = [earth, ...earth.getChildMeshes()];
    let patched = 0;
    for (const mesh of meshes) {
      const mat = mesh.material;
      if (mat && typeof mat.setFloat === 'function' && mat.onBindObservable) {
        mat.onBindObservable.add(() => mat.setFloat('uMaskEnabled', 0));
        patched += 1;
      }
    }
    return { patched };
  });
}

/**
 * 화면 disk 역투영 ↔ 마스크 IoU 측정.
 *
 * 역투영: 카메라 basis + 수직 FOV 로 픽셀별 world ray 를 만들고 구와 교차시켜 표면 법선을 얻는다
 * (직교 근사가 아니라 실제 원근 ray — limb 왜곡의 주 성분을 제거한다). `rotate=off` 이므로
 * local 축 = world 축이라 그 법선이 곧 셰이더의 `p` 다.
 */
async function measureIoU(page, screenshotB64) {
  return page.evaluate(
    async ({
      b64,
      MASK_LAND_LEVEL,
      DISK_SAMPLE_RADIUS,
      POLAR_EXCLUDE_SIN_LAT,
      DAY_SIDE_MIN_NDL,
    }) => {
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

      // 태양 방향 (낮면 판정).
      let sunPos = null;
      for (const l of scene.lights) {
        if (l.position && (l.name === 'sun-light' || l.getClassName?.() === 'PointLight')) {
          sunPos = l.position;
          break;
        }
      }
      if (!sunPos) return { error: 'sunLight 부재' };
      const sunDir = sunPos.subtract(center).normalize();

      // 화면 disk 반경 (px) — 셰이더 LOD 판정과 **같은 산식** (camera right edge 투영).
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

      // ── 마스크 원본 로드 (실제 서빙 경로 — 에셋이 배포되는지도 함께 검증된다) ──
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
      // GPU 와 동일한 BILINEAR (픽셀 중심 · u WRAP · v CLAMP).
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

      // ── 화면 스크린샷 디코드 (WebGPU drawImage readback 함정 회피 — #728 SSoT) ──
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

      let inter = 0;
      let union = 0;
      let screenLand = 0;
      let maskLand = 0;
      let domain = 0;
      let excludedPolar = 0;
      let excludedNight = 0;

      const cxShot = centerScreen.x * sx;
      const cyShot = centerScreen.y * sy;
      const rShot = diskR * Math.max(sx, sy);
      const span = Math.ceil(rShot) + 2;

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
          if (dx * dx + dy * dy > DISK_SAMPLE_RADIUS * DISK_SAMPLE_RADIUS) continue;

          // 픽셀 → world ray (원근). NDC 는 렌더 해상도 기준이라 shot 좌표를 되돌린다.
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

          // ray-sphere 교차 (근측 해).
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

          // 극관 제외 — 흰색이 육지/바다를 동시에 덮으므로 양쪽 집합에서 함께 뺀다.
          if (Math.abs(ny) >= POLAR_EXCLUDE_SIN_LAT) {
            excludedPolar++;
            continue;
          }
          // 밤면·terminator 제외.
          const ndl = nx * sunDir.x + ny * sunDir.y + nz * sunDir.z;
          if (ndl < DAY_SIDE_MIN_NDL) {
            excludedNight++;
            continue;
          }

          // 셰이더와 동일한 equirectangular UV (§A4.3 결정 3).
          const u = Math.atan2(nz, nx) / (2 * Math.PI) + 0.5;
          const v = Math.acos(Math.min(1, Math.max(-1, ny))) / Math.PI;
          const isMaskLand = maskSample(u, v) >= MASK_LAND_LEVEL;

          const i = (y * img.width + x) * 4;
          const r = shot[i];
          const g = shot[i + 1];
          const b = shot[i + 2];
          // 화면 분류 — ocean(baseColor) 은 청록(B ≥ G), land(biome 3밴드) 는 B < G.
          const isScreenLand = b < g;

          domain++;
          if (isScreenLand) screenLand++;
          if (isMaskLand) maskLand++;
          if (isScreenLand && isMaskLand) inter++;
          if (isScreenLand || isMaskLand) union++;
        }
      }

      // sub-solar 경도 — 낮면(=측정 가능 영역)이 어느 경도대를 덮는지 드러낸다.
      // `rotate=off` 라 지구 local frame 이 고정이므로 이 값은 **카메라가 아니라 JD 가** 정한다.
      const subSolarLonDeg = (Math.atan2(sunDir.z, sunDir.x) * 180) / Math.PI;

      return {
        diskR: Number(diskR.toFixed(2)),
        subSolarLonDeg: Number(subSolarLonDeg.toFixed(1)),
        domain,
        screenLandPct: domain ? Number(((screenLand / domain) * 100).toFixed(2)) : null,
        maskLandPct: domain ? Number(((maskLand / domain) * 100).toFixed(2)) : null,
        excludedPolar,
        excludedNight,
        iou: union ? Number((inter / union).toFixed(4)) : 0,
      };
    },
    {
      b64: screenshotB64,
      MASK_LAND_LEVEL,
      DISK_SAMPLE_RADIUS,
      POLAR_EXCLUDE_SIN_LAT,
      DAY_SIDE_MIN_NDL,
    },
  );
}

async function capture(page, name) {
  const buf = await page.locator('canvas').first().screenshot();
  if (CAPTURE_DIR) {
    await mkdir(CAPTURE_DIR, { recursive: true });
    await writeFile(path.join(CAPTURE_DIR, `${name}.png`), buf);
  }
  return buf.toString('base64');
}

/** 현재 카메라에서의 지구 disk 투영 반경 (px) — 셰이더 LOD 판정과 동일 산식. */
async function readDiskRadiusPx(page) {
  return page.evaluate(() => {
    const scene = window.__simCore?.scene;
    const mesh = window.__solarScene?.meshes?.get('earth');
    if (!scene || !mesh) return null;
    const engine = scene.getEngine();
    const camera = scene.activeCamera;
    const Vector3 = mesh.getAbsolutePosition().constructor;
    const idMat = mesh.getWorldMatrix().constructor.Identity();
    const transform = scene.getTransformMatrix();
    const vp = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
    const center = mesh.getAbsolutePosition();
    const radiusWorld = mesh.getBoundingInfo().boundingSphere.radiusWorld / Math.sqrt(3);
    const right = camera.getDirection(new Vector3(1, 0, 0));
    const c = Vector3.Project(center, idMat, transform, vp);
    const e = Vector3.Project(center.add(right.scale(radiusWorld)), idMat, transform, vp);
    return Number(Math.hypot(e.x - c.x, e.y - c.y).toFixed(3));
  });
}

/** 두 base64 PNG 의 픽셀 diff 비율 (±2/255 노이즈 허용 — 783 diffDirs 규약 동일). */
async function diffRatio(page, b64A, b64B) {
  return page.evaluate(
    async ({ a, b }) => {
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
        return c.getContext('2d').getImageData(0, 0, img.width, img.height).data;
      };
      const da = await load(a);
      const db = await load(b);
      if (da.length !== db.length) return { error: '크기 불일치' };
      let diff = 0;
      for (let i = 0; i < da.length; i += 4) {
        const d = Math.max(
          Math.abs(da[i] - db[i]),
          Math.abs(da[i + 1] - db[i + 1]),
          Math.abs(da[i + 2] - db[i + 2]),
        );
        if (d > 2) diff++;
      }
      const total = da.length / 4;
      return { diffPx: diff, total, pct: Number(((diff / total) * 100).toFixed(4)) };
    },
    { a: b64A, b: b64B },
  );
}

const FOCUS_QUERY = '?gpu=a&focus=earth&lod=auto&rotate=off&orbits=off';

/**
 * 자오선 seam 측정용 두 번째 JD — 춘분 반대편(추분 근방, 2000-09-22).
 *
 * ⚠️ **카메라를 돌려서는 `u = 0/1` 에 도달할 수 없다.** `rotate=off` 면 지구 local frame 이 world
 * 에 고정돼 **낮면 반구가 JD 로만 정해지고** 카메라는 그 반구의 어느 부분을 보는지만 바꾼다.
 * `T_JD` 에서 sub-solar 경도가 `≈ 0°` (본초자오선) 라 낮면은 `[−90°, +90°]` 이고 **±180° 자오선은
 * 구조적으로 밤면**이다 — 첫 구현이 카메라만 4방위 돌렸다가 `alpha+270°` 에서 낮면 픽셀 `0` 을
 * 얻고 IoU 를 `0` 으로 오판했다. 반년 뒤 JD 는 sub-solar 를 반대편으로 옮겨 **자오선을 낮면
 * 한가운데**에 놓는다.
 */
const T_JD_ANTIMERIDIAN = 2451809.5;

/** seam 판정에 필요한 최소 낮면 표본 (이보다 작으면 "측정 불가" — IoU 를 판정에 쓰지 않는다). */
const SEAM_MIN_DOMAIN = 2000;

/**
 * MODE=seam — **자오선(`u = 0/1`) 경계**를 낮면에 놓고 IoU 를 잰다.
 *
 * Phase 0 게이트는 기본 focus 가시 반구 9점만 덮어 `u = 0/1` 을 **미측정으로 남겼다**
 * (이슈 #1119 게이트 코멘트 §잔여 미측정 2). 두 JD × 카메라 4방위를 전수로 재고, **JD 마다 낮면
 * 표본이 가장 큰 방위**를 판정에 쓴다. `atan` 불연속에서 seam 이 생기면 자오선이 중앙에 오는
 * JD 의 IoU 만 무너지므로 **대조가 측정 자체에 내장**돼 있다.
 */
async function runSeam(browser) {
  const offsets = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
  const groups = [];
  for (const [label, julianDate] of [
    ['본초자오선 낮면 (JD 2451626.0)', T_JD],
    ['±180° 자오선 낮면 (JD 2451809.5)', T_JD_ANTIMERIDIAN],
  ]) {
    const rows = [];
    for (const offset of offsets) {
      const { context, page, consoleErrors } = await setupPage(browser, FOCUS_QUERY, {
        julianDate,
      });
      await page.evaluate((d) => {
        window.__simCore.scene.activeCamera.alpha += d;
      }, offset);
      await page.waitForTimeout(700);
      const deg = Math.round((offset * 180) / Math.PI);
      const shot = await capture(page, `qa-1119-seam-jd${Math.round(julianDate)}-alpha${deg}`);
      const m = await measureIoU(page, shot);
      rows.push({ alphaOffsetDeg: deg, ...m, consoleErrors: consoleErrors.length });
      await context.close();
    }
    const best = rows.reduce((a, b) => (a.domain >= b.domain ? a : b));
    groups.push({ label, julianDate, rows, best });
  }

  console.log('\n=== 측정 (자오선 u=0/1 경계 — JD 2종 × 카메라 4방위) ===');
  console.log(JSON.stringify(groups, null, 2));

  console.log('\n=== 판정 ===');
  let pass = true;
  for (const g of groups) {
    const ok =
      !g.best.error &&
      g.best.domain >= SEAM_MIN_DOMAIN &&
      g.best.iou >= IOU_THRESHOLD &&
      g.best.consoleErrors === 0;
    if (!ok) pass = false;
    console.log(
      `${g.label}: sub-solar 경도 ${g.best.subSolarLonDeg}° · 낮면 표본 ${g.best.domain} (≥ ${SEAM_MIN_DOMAIN}) · IoU ${g.best.iou} (≥ ${IOU_THRESHOLD}) · alpha+${g.best.alphaOffsetDeg}° → ${ok ? 'PASS' : 'FAIL'}`,
    );
  }
  if (!pass) process.exitCode = 1;
}

async function runDod(browser) {
  const results = {};

  // ── ① 마스크 ON (정상 경로) ──────────────────────────────────────────────
  {
    const { context, page, consoleErrors } = await setupPage(browser, FOCUS_QUERY);
    const shot = await capture(page, 'qa-1119-earth-mask-on');
    results.on = await measureIoU(page, shot);
    results.on.consoleErrors = consoleErrors.length;
    await context.close();
  }

  // ── ② uMaskEnabled 0 고착 주입 (negative — DoD 2) ────────────────────────
  {
    const { context, page, consoleErrors } = await setupPage(browser, FOCUS_QUERY);
    const injected = await injectMaskDisabled(page);
    await page.waitForTimeout(800); // observer 가 다음 bind 부터 유효 — 프레임 몇 개 대기
    const shot = await capture(page, 'qa-1119-earth-mask-forced-off');
    results.forcedOff = await measureIoU(page, shot);
    results.forcedOff.consoleErrors = consoleErrors.length;
    results.forcedOff.patchedMaterials = injected.patched;
    await context.close();
  }

  // ── ③ `?surface=off` (셰이더 자체 미생성 — 단색 StandardMaterial) ─────────
  {
    const { context, page, consoleErrors } = await setupPage(browser, `${FOCUS_QUERY}&surface=off`);
    const shot = await capture(page, 'qa-1119-earth-surface-off');
    results.surfaceOff = await measureIoU(page, shot);
    results.surfaceOff.consoleErrors = consoleErrors.length;
    await context.close();
  }

  console.log('\n=== 측정 ===');
  console.log(JSON.stringify(results, null, 2));

  const on = results.on;
  const forcedOff = results.forcedOff;
  const surfaceOff = results.surfaceOff;

  // DoD 1 — IoU 하한 + 마스크 미적용 경로 대비 유의 증가.
  const dod1 =
    !on.error &&
    on.iou >= IOU_THRESHOLD &&
    on.iou > forcedOff.iou &&
    on.iou > surfaceOff.iou &&
    on.consoleErrors === 0;
  // DoD 2 — 고착 주입 시 DoD 1 이 실제로 FAIL 해야 한다 (가드가 작동한다는 증거).
  const dod2 = !forcedOff.error && forcedOff.patchedMaterials > 0 && forcedOff.iou < IOU_THRESHOLD;

  console.log('\n=== 판정 (§A4.5) ===');
  console.log(
    `DoD 1 대륙 형상 IoU: ON ${on.iou} (≥ ${IOU_THRESHOLD}) / 마스크고착 ${forcedOff.iou} / surface=off ${surfaceOff.iou} · console err ${on.consoleErrors} → ${dod1 ? 'PASS' : 'FAIL'}`,
  );
  console.log(
    `DoD 2 negative (uMaskEnabled 0 고착 주입 → DoD 1 FAIL): 머티리얼 ${forcedOff.patchedMaterials}개 패치, IoU ${forcedOff.iou} < ${IOU_THRESHOLD} → ${dod2 ? 'PASS' : 'FAIL'}`,
  );
  if (!(dod1 && dod2)) process.exitCode = 1;
}

async function runLod(browser) {
  // focus 상태 (마스크 ON 대역) — 양성 대조군.
  const near = {};
  {
    const { context, page } = await setupPage(browser, FOCUS_QUERY);
    near.diskR = await readDiskRadiusPx(page);
    const before = await capture(page, 'qa-1119-lod-near-before');
    await injectMaskDisabled(page);
    await page.waitForTimeout(800);
    const after = await capture(page, 'qa-1119-lod-near-after');
    near.diff = await diffRatio(page, before, after);
    await context.close();
  }

  // 전체 태양계 조감 (disk R < 16 px 대역) — 마스크가 이미 꺼져 있어야 한다.
  const far = {};
  {
    const { context, page } = await setupPage(browser, '?gpu=a&lod=auto&rotate=off&orbits=off', {
      equatorialView: false,
    });
    far.diskR = await readDiskRadiusPx(page);
    const before = await capture(page, 'qa-1119-lod-far-before');
    await injectMaskDisabled(page);
    await page.waitForTimeout(800);
    const after = await capture(page, 'qa-1119-lod-far-after');
    far.diff = await diffRatio(page, before, after);
    await context.close();
  }

  console.log('\n=== 측정 (DoD 14 — 원거리 축소 LOD) ===');
  console.log(JSON.stringify({ near, far }, null, 2));

  // 양성 대조군 — focus 대역에서는 고착 주입이 픽셀을 **실제로 바꿔야** 한다.
  // (안 바뀌면 주입이 무효라는 뜻이고, 그러면 far 의 "안 바뀜" 은 아무것도 증명하지 못한다.)
  const positiveControl = near.diskR >= MASK_MIN_DISK_PX && near.diff.diffPx > 0;
  const farBelowThreshold = far.diskR !== null && far.diskR < MASK_MIN_DISK_PX;
  // 임계 아래 대역에서는 마스크가 이미 꺼져 있으므로 고착 주입이 픽셀을 바꾸지 못한다.
  const farUnchanged = far.diff.pct < 0.001;

  console.log('\n=== 판정 ===');
  console.log(
    `양성 대조군 (focus, R=${near.diskR}px ≥ ${MASK_MIN_DISK_PX}): 고착 주입 diff ${near.diff.diffPx}px (>0 필요) → ${positiveControl ? 'PASS' : 'FAIL'}`,
  );
  console.log(
    `원거리 대역 진입 (조감, R=${far.diskR}px < ${MASK_MIN_DISK_PX}) → ${farBelowThreshold ? 'PASS' : 'FAIL'}`,
  );
  console.log(
    `원거리에서 uMaskEnabled 이미 0 (고착 주입 diff ${far.diff.pct}% < 0.001%) → ${farUnchanged ? 'PASS' : 'FAIL'}`,
  );
  if (!(positiveControl && farBelowThreshold && farUnchanged)) process.exitCode = 1;
}

await withBrowser(
  {},
  async (browser) => {
    if (MODE === 'lod') {
      await runLod(browser);
      return;
    }
    if (MODE === 'seam') {
      await runSeam(browser);
      return;
    }
    await runDod(browser);
  },
  { launch },
);
