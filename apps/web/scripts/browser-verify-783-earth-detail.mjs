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
 */

import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const CAPTURE_DIR = process.env.CAPTURE_DIR ?? null;
const HEADFUL = process.env.HEADFUL !== '0';
const MODE = process.env.MODE ?? 'dod';

/** 결정적 프레임 고정 JD — 2000-03-22 (춘분 근방, 태양 ⊥ 패턴 극축 — 헤더 주석 3). */
const T_JD = 2451626.0;
const NEAR_WHITE_MIN = 140; // DoD 1 — min(R,G,B) 하한 (/255)
const NEAR_WHITE_SPREAD = 40; // DoD 1 — 채널 max−min 상한
const POLAR_BAND = 0.12; // disk 세로 극단 — |dy| ≥ (1−0.12)R (sin-space 0.88 — ICE ramp 0.84~0.92 완료 구간 포함, #783 measurement-first 하향 후 기준)
const MAGENTA_TAU = 15; // DoD 3 — R>G+τ && B>G+τ
// disk 픽셀 멤버십 임계 — 성운 배경 (lum ~8–15) 배제, 밤면 ambient (~30) 포함 (실측 보정).
const DISK_LUM_MIN = 20;

async function launch() {
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

/** MODE=diff — 두 캡처 dir 의 동명 PNG 픽셀 diff (Concrete Prediction: mars/jupiter/moon ≈ 0). */
async function diffDirs(dirA, dirB, names) {
  for (const name of names) {
    const a = PNG.sync.read(await readFile(path.join(dirA, `${name}.png`)));
    const b = PNG.sync.read(await readFile(path.join(dirB, `${name}.png`)));
    if (a.width !== b.width || a.height !== b.height) {
      console.log(`  ${name}: 크기 불일치 ${a.width}x${a.height} vs ${b.width}x${b.height} — FAIL`);
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
    console.log(
      `  ${name}: diffPx=${diffPx}/${total} (${pct}%) maxDelta=${maxDelta} → ${diffPx / total < 0.001 ? 'PASS (≈0)' : 'CHECK'}`,
    );
  }
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
    await diffDirs(
      dirA,
      dirB,
      OTHER_BODIES.map((id) => `qa-783-${id}`),
    );
    return;
  }

  const browser = await launch();
  try {
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
  } finally {
    await browser.close();
  }
})();
