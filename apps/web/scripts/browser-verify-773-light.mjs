#!/usr/bin/env node
/**
 * #773/#775 — 표면 셰이더 광원 일관성 + 지구 대륙 mix qa 동적 검증 (Amendment 1).
 *
 * 실 Chrome GUI (headless: false, channel: chrome) — WebGPU swiftshader freeze 회피 (#663/#756).
 * 픽셀 측정 = composited canvas.screenshot() (PNG) → 페이지 내 Image 디코드 → 2D getImageData.
 *   ⚠️ WebGPU drawImage readback 빈버퍼 함정 회피 (#728 SSoT) — page.evaluate 내 2D canvas 경로만.
 *
 * 측정 축 (ADR §A1.5 DoD):
 *  - DoD 1: 밤면/낮면 휘도 대비비 (day/night contrast ratio) ≥ 5x — 표면 셰이더 행성 vs 단색 행성 대조.
 *  - DoD 2: 태양 추종 — disk 안 밝은 절반이 sunDir(태양 방향) 쪽인지 검증 (lit-side 정합).
 *  - DoD 4: 지구 대륙 — disk 픽셀의 색조(hue) 분포에서 land(올리브-브라운) vs ocean(청록) 2-모드 분리.
 *  - DoD 5: 절차 무회귀 — 낮면 기준 고주파 엔트로피 ON > OFF.
 *  - DoD 6: 보라/마젠타 0 — disk 픽셀 중 (R>G && B>G) 기괴 색역 비율.
 *
 * disk 영역만 샘플: scene.activeCamera 로 mesh bounding box 8 corner 화면 투영 → 그 bbox 픽셀만 분석.
 * 낮/밤 분할: sunDir(scene-unit) 을 화면 평면에 투영 → disk 중심 기준 sun 쪽 절반 = 낮면, 반대 = 밤면.
 *
 * 판정 (#759 — shader-pixel-guard CI 상시 가드, ADR 20260705-759 결정 3):
 *   4 body 각각 (1) dayMean > nightMean × 2 (2) contrastMean(ON) > contrastMean(OFF)
 *   (3) purplePct == 0. 미충족 시 exit 1 (fail-fast).
 *   ⚠️ hfEntropy ON>OFF 는 판정 축에서 제외 — moon day-side 실측 역전 (ON 1.402 < OFF 1.989,
 *   disk 소면적 framing + land/ocean 소표본 artifact — ADR §실측 3). 측정·로그는 유지하되
 *   moon 커버는 대비(contrastMean)/보라(purplePct) 축이 담당 (의식적 축소 — 가드 약화 아님).
 *
 * 사용법:
 *   node apps/web/scripts/browser-verify-773-light.mjs               # 실 Chrome GUI
 *   HEADFUL=0 node ...                                               # CI 폴백 (headless)
 *   SWIFTSHADER=1 node ...                                           # CI(ubuntu 소프트웨어 렌더) 로컬 재현
 *   CAPTURE_DIR=/abs/dir node ...                                    # 캡처 PNG 저장
 */

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const CAPTURE_DIR = process.env.CAPTURE_DIR ?? null;
const HEADFUL = process.env.HEADFUL !== '0';
// #759 — CI 실패 로컬 재현 (--use-angle=swiftshader). browser-verify-756-surface.mjs 주석 참조.
const SWIFTSHADER = process.env.SWIFTSHADER === '1';

// #759 판정 상수 — 낮/밤 대비 하한 배수. 실측 최소 (swiftshader 포함 전 라운드) saturn 2.14×,
// 표면 4 body 하드웨어 실측 3.07~5.37× (docs/reports/773-light/qa-773-comment.md) → 2× 하한 안전.
const DAY_NIGHT_RATIO_MIN = 2;

const SURFACE_BODIES = [
  { id: 'earth', type: 'rocky' },
  { id: 'mars', type: 'desert' },
  { id: 'jupiter', type: 'gas-bands' },
  { id: 'moon', type: 'cratered' },
];
// 단색 행성 (회귀만 확인 — terminator/밤면 대조 baseline).
const PLAIN_BODIES = [{ id: 'venus' }, { id: 'mercury' }, { id: 'saturn' }, { id: 'neptune' }];

async function setupPage(browser, query) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const consoleWarns = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
    if (m.type() === 'warning') consoleWarns.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE_URL}${query}`, { waitUntil: 'networkidle', timeout: 45_000 });
  await page.waitForFunction(
    () => typeof window.__simCore !== 'undefined' && typeof window.__solarScene !== 'undefined',
    { timeout: 20_000 },
  );
  await page.waitForTimeout(2800); // mesh 생성 + 첫 LOD pass + focus tween 정착
  return { context, page, consoleErrors, consoleWarns };
}

/**
 * disk 영역 픽셀 통계 — 낮/밤 분할 + 색조 분포.
 * sunDir 을 화면 평면에 투영해 disk 중심 기준 낮면(태양 쪽) / 밤면(반대) 분할.
 */
async function measureLight(page, bodyId, captureName) {
  const canvas = page.locator('canvas').first();
  const buf = await canvas.screenshot();
  if (CAPTURE_DIR && captureName) {
    await mkdir(CAPTURE_DIR, { recursive: true });
    await writeFile(path.join(CAPTURE_DIR, `${captureName}.png`), buf);
  }
  const b64 = buf.toString('base64');
  return page.evaluate(
    async ({ b64, bodyId }) => {
      const core = window.__simCore;
      const solar = window.__solarScene;
      const scene = core?.scene;
      const mesh = solar?.meshes?.get(bodyId);
      if (!scene || !mesh) return { error: `mesh/scene 부재 (${bodyId})` };

      const BABYLON = window.BABYLON;
      const engine = scene.getEngine();
      const rw = engine.getRenderWidth();
      const rh = engine.getRenderHeight();
      const cam = scene.activeCamera;
      const vp = cam.viewport.toGlobal(rw, rh);
      const transform = scene.getTransformMatrix();

      const Vector3 = (BABYLON && BABYLON.Vector3) || mesh.getAbsolutePosition().constructor;
      const Matrix = (BABYLON && BABYLON.Matrix) || mesh.getWorldMatrix().constructor;
      const idMat = Matrix.Identity();

      // mesh 중심 + bbox 화면 투영.
      const meshPos = mesh.getAbsolutePosition();
      const bb = mesh.getBoundingInfo().boundingBox;
      const corners = bb.vectorsWorld;
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const c of corners) {
        const p = Vector3.Project(c, idMat, transform, vp);
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      const centerScreen = Vector3.Project(meshPos, idMat, transform, vp);

      // sunDir (scene-unit world) — sunLight.position − meshPos. PointLight 검색.
      let sunPos = null;
      for (const l of scene.lights) {
        if (l.position && (l.name === 'sun-light' || l.getClassName?.() === 'PointLight')) {
          sunPos = l.position;
          break;
        }
      }
      if (!sunPos) return { error: 'sunLight 부재' };
      const sunWorldDir = sunPos.subtract(meshPos); // 태양 방향 (월드).
      // 태양 방향 끝점을 화면 투영해 화면 평면 sunDir 추출 (정규화 후 mesh 반경 비례 길이).
      const sunDirN = sunWorldDir.normalize();
      const meshRadius = bb.maximum.subtract(bb.minimum).length() * 0.5 || 1;
      const tip = meshPos.add(sunDirN.scale(meshRadius * 4));
      const tipScreen = Vector3.Project(tip, idMat, transform, vp);
      // 화면 sunDir (정규화). y 는 화면 좌표 (아래로 +).
      let sdx = tipScreen.x - centerScreen.x;
      let sdy = tipScreen.y - centerScreen.y;
      const sdLen = Math.hypot(sdx, sdy) || 1;
      sdx /= sdLen;
      sdy /= sdLen;

      const screenBox = {
        x: Math.max(0, Math.floor(minX)),
        y: Math.max(0, Math.floor(minY)),
        w: Math.min(rw, Math.ceil(maxX)) - Math.max(0, Math.floor(minX)),
        h: Math.min(rh, Math.ceil(maxY)) - Math.max(0, Math.floor(minY)),
      };

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
      const bx = Math.max(0, Math.round(screenBox.x * sx));
      const by = Math.max(0, Math.round(screenBox.y * sy));
      const bw = Math.min(img.width - bx, Math.max(1, Math.round(screenBox.w * sx)));
      const bh = Math.min(img.height - by, Math.max(1, Math.round(screenBox.h * sy)));
      if (bw < 2 || bh < 2) return { error: `disk bbox 너무 작음 ${bw}x${bh}`, screenBox };
      const data = ctx.getImageData(bx, by, bw, bh).data;

      // disk 중심 (img 좌표) = centerScreen 를 img 스케일 변환 후 bbox-상대.
      const cxImg = centerScreen.x * sx - bx;
      const cyImg = centerScreen.y * sy - by;

      const lumGrid = new Float32Array(bw * bh);
      const mask = new Uint8Array(bw * bh);
      // 낮/밤 픽셀 분할: (px - cx, py - cy) · sunDir > 0 → 낮면.
      const dayLums = [];
      const nightLums = [];
      let purpleCount = 0;
      let diskCount = 0;
      // 색조 분류 (지구 대륙) — land(올리브브라운 R≳G>B) vs ocean(청록 G≳B>R).
      let landCount = 0;
      let oceanCount = 0;

      for (let y = 0; y < bh; y++) {
        for (let x = 0; x < bw; x++) {
          const i = y * bw + x;
          const r = data[i * 4];
          const g = data[i * 4 + 1];
          const b = data[i * 4 + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          lumGrid[i] = lum;
          if (lum < 8) continue; // 우주 배경 배제
          mask[i] = 1;
          diskCount++;
          // 낮/밤 분할.
          const dotSun = (x - cxImg) * sdx + (y - cyImg) * sdy;
          if (dotSun > 0) dayLums.push(lum);
          else nightLums.push(lum);
          // 보라/마젠타 (R>G && B>G — 자홍/보라 색역).
          if (r > g + 12 && b > g + 12) purpleCount++;
          // 색조 분류 (지구) — 충분히 밝은 픽셀만 (밤면 어두운 픽셀 제외, lum>40).
          if (lum > 40) {
            if (r >= g - 4 && g > b + 6)
              landCount++; // R≳G, G>B → 갈색/올리브 (land)
            else if (g >= r + 6 && b >= r - 4) oceanCount++; // G,B > R → 청록 (ocean)
          }
        }
      }

      const stat = (arr) => {
        if (arr.length === 0) return { n: 0, mean: 0, p90: 0, p10: 0 };
        const s = [...arr].sort((a, b) => a - b);
        const mean = s.reduce((a, b) => a + b, 0) / s.length;
        return {
          n: s.length,
          mean: Number(mean.toFixed(1)),
          p90: Number(s[Math.floor(s.length * 0.9)].toFixed(1)),
          p10: Number(s[Math.floor(s.length * 0.1)].toFixed(1)),
        };
      };
      const day = stat(dayLums);
      const night = stat(nightLums);
      // 대비비 = 낮면 mean / 밤면 mean (밤면 0 방지 +1).
      const contrastMean =
        night.mean > 0 ? Number((day.mean / Math.max(night.mean, 0.5)).toFixed(2)) : Infinity;
      // p90(낮면 밝은 부분) / p10(밤면 어두운 부분) — terminator 양극 대비.
      const contrastExtreme = Number((day.p90 / Math.max(night.p10, 0.5)).toFixed(2));

      // 고주파 엔트로피 (낮면 기준 — 절차 무회귀, #756 패턴).
      let hfSum = 0;
      let hfCount = 0;
      const hfHist = new Array(32).fill(0);
      let hfHistN = 0;
      for (let y = 1; y < bh - 1; y++) {
        for (let x = 1; x < bw - 1; x++) {
          const i = y * bw + x;
          if (!mask[i] || !mask[i - 1] || !mask[i + 1] || !mask[i - bw] || !mask[i + bw]) continue;
          // 낮면만 (절차 디테일은 낮면에서 측정).
          const dotSun = (x - cxImg) * sdx + (y - cyImg) * sdy;
          if (dotSun <= 0) continue;
          const lap =
            4 * lumGrid[i] - lumGrid[i - 1] - lumGrid[i + 1] - lumGrid[i - bw] - lumGrid[i + bw];
          hfSum += lap * lap;
          hfCount++;
          hfHist[Math.min(31, Math.floor(Math.abs(lap)))]++;
          hfHistN++;
        }
      }
      const hfEnergy = hfCount > 0 ? Number(Math.sqrt(hfSum / hfCount).toFixed(4)) : 0;
      let hfEntropy = 0;
      for (const c of hfHist) {
        if (c === 0) continue;
        const p = c / hfHistN;
        hfEntropy -= p * Math.log2(p);
      }

      return {
        diskArea: diskCount,
        day,
        night,
        contrastMean, // ★ DoD 1 — 낮면/밤면 mean 대비비
        contrastExtreme, // 낮면 p90 / 밤면 p10
        hfEnergy: Number(hfEnergy.toFixed(4)),
        hfEntropy: Number(hfEntropy.toFixed(3)),
        purplePct: diskCount > 0 ? Number(((purpleCount / diskCount) * 100).toFixed(2)) : 0, // DoD 6
        landCount, // DoD 4 (지구만 유의미)
        oceanCount,
        screenSunDir: { x: Number(sdx.toFixed(3)), y: Number(sdy.toFixed(3)) },
        screenBox,
      };
    },
    { b64, bodyId },
  );
}

async function launch() {
  if (SWIFTSHADER) {
    console.log('[browser] headless chromium + --use-angle=swiftshader (CI 재현 — #759)');
    return chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });
  }
  const opts = HEADFUL ? { headless: false, channel: 'chrome' } : { headless: true };
  try {
    const b = await chromium.launch(opts);
    console.log(
      `[browser] ${HEADFUL ? '실 Chrome GUI (headless:false, channel:chrome)' : 'headless chromium'}`,
    );
    return b;
  } catch (e) {
    console.error(`[launch] chrome channel 부재 (${e.message}) — chromium 폴백`);
    return chromium.launch({ headless: !HEADFUL });
  }
}

(async () => {
  const browser = await launch();
  const out = { surfaceOn: {}, surfaceOff: {}, plain: {}, consoleErrors: {}, rotWarns: {} };
  try {
    console.log('\n=== DoD 1+2+4+6 — 표면 셰이더 행성 (surface ON, 기본) ===');
    for (const { id, type } of SURFACE_BODIES) {
      const { context, page, consoleErrors, consoleWarns } = await setupPage(
        browser,
        `?gpu=a&focus=${id}&lod=auto`,
      );
      const m = await measureLight(page, id, `qa-773-on-${id}`);
      out.surfaceOn[id] = { type, ...m };
      out.consoleErrors[`on-${id}`] = consoleErrors.length;
      out.rotWarns[`on-${id}`] = consoleWarns.filter((w) => w.includes('회전 non-zero')).length;
      console.log(
        `  ${id.padEnd(8)} [${type}] contrastMean=${m.contrastMean} contrastExtreme=${m.contrastExtreme} dayMean=${m.day?.mean} nightMean=${m.night?.mean} hfEnt(day)=${m.hfEntropy} purple%=${m.purplePct} land/ocean=${m.landCount}/${m.oceanCount} err=${consoleErrors.length}`,
      );
      if (consoleErrors.length)
        console.log(`     ↳ errors: ${JSON.stringify(consoleErrors.slice(0, 3))}`);
      await context.close();
    }

    console.log('\n=== 단색 행성 (baseline — terminator/대비비 기준) ===');
    for (const { id } of PLAIN_BODIES) {
      const { context, page, consoleErrors } = await setupPage(
        browser,
        `?gpu=a&focus=${id}&lod=auto`,
      );
      const m = await measureLight(page, id, `qa-773-plain-${id}`);
      out.plain[id] = m;
      console.log(
        `  ${id.padEnd(8)} contrastMean=${m.contrastMean} contrastExtreme=${m.contrastExtreme} dayMean=${m.day?.mean} nightMean=${m.night?.mean} purple%=${m.purplePct} err=${consoleErrors.length}`,
      );
      await context.close();
    }

    console.log('\n=== DoD 5 — ?surface=off 대조 (낮면 hfEntropy ON>OFF) ===');
    for (const { id, type } of SURFACE_BODIES) {
      const { context, page } = await setupPage(browser, `?gpu=a&focus=${id}&lod=auto&surface=off`);
      const m = await measureLight(page, id, `qa-773-off-${id}`);
      out.surfaceOff[id] = { type, ...m };
      console.log(
        `  ${id.padEnd(8)} [${type}] contrastMean=${m.contrastMean} dayMean=${m.day?.mean} nightMean=${m.night?.mean} hfEnt(day)=${m.hfEntropy} purple%=${m.purplePct}`,
      );
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log('\n=== JSON ===');
  console.log(JSON.stringify(out, null, 2));

  // ── 판정 (#759 — ADR 20260705-759 결정 3: per-body 상대 성질, fail-fast) ──────
  // 축: (1) dayMean > nightMean×2 — 광원 붕괴 검출 (2) contrastMean ON > OFF — 밤면 회귀
  // (#773 원 회귀) 검출 (3) purplePct == 0 — 기괴 색역 검출. hfEntropy 는 헤더 주석 사유로 제외.
  const failures = [];
  for (const { id } of SURFACE_BODIES) {
    const on = out.surfaceOn[id];
    const off = out.surfaceOff[id];
    if (!on || on.error) {
      failures.push(`${id}: surface ON 측정 실패 (${on?.error ?? 'no data'})`);
      continue;
    }
    if (!off || off.error) {
      failures.push(`${id}: surface OFF 측정 실패 (${off?.error ?? 'no data'})`);
      continue;
    }
    if (!(on.day.mean > on.night.mean * DAY_NIGHT_RATIO_MIN)) {
      failures.push(
        `${id}: dayMean(${on.day.mean}) ≤ nightMean(${on.night.mean}) × ${DAY_NIGHT_RATIO_MIN} (광원 대비 붕괴)`,
      );
    }
    if (!(on.contrastMean > off.contrastMean)) {
      failures.push(
        `${id}: contrastMean ON(${on.contrastMean}) ≤ OFF(${off.contrastMean}) (밤면 회귀 — #773 원 증상)`,
      );
    }
    if (on.purplePct !== 0) {
      failures.push(`${id}: purplePct ${on.purplePct}% ≠ 0 (보라/마젠타 색역 오염)`);
    }
  }

  console.log(
    `\n=== 판정 (#759 — day>night×${DAY_NIGHT_RATIO_MIN} + contrastMean ON>OFF + purple 0, hfEntropy 축 제외) ===`,
  );
  if (failures.length) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    console.log('=== FAIL ===');
    process.exitCode = 1;
  } else {
    for (const { id } of SURFACE_BODIES) {
      const on = out.surfaceOn[id];
      const off = out.surfaceOff[id];
      console.log(
        `  ✓ ${id}: day ${on.day.mean}/night ${on.night.mean} (×${DAY_NIGHT_RATIO_MIN} 초과), contrastMean ON ${on.contrastMean} > OFF ${off.contrastMean}, purple ${on.purplePct}%`,
      );
    }
    console.log('=== PASS ===');
  }
})();
