#!/usr/bin/env node
/**
 * #774 — 태양 emissive 절차 표면 셰이더 dev 동적 검증.
 *
 * 실 Chrome GUI (headless: false, channel: chrome) — WebGPU swiftshader freeze 회피 (#663).
 * 픽셀 측정 = composited canvas.screenshot() (PNG) → 페이지 내 Image 디코드 → 2D getImageData.
 *   ⚠️ WebGPU drawImage readback 빈버퍼 함정 회피 (#728 SSoT) — page.evaluate 내 2D canvas 경로만.
 *
 * 측정 (ADR 20260703-774 §DoD):
 *   DoD 1 — granulation: 태양 disk 라플라시안 고주파 에너지/엔트로피 ON > OFF.
 *   DoD 2 — limb darkening: radial Rec.709 휘도 프로파일 단조 감소 + edge(r≈0.9R)/center < 0.85.
 *   DoD 3 — 색온도: 가장자리 B/R 채널비 < 중심 B/R.
 *   DoD 4 — ?surface=off 단색 복귀 (hf ≈ 0) + planet 4종 ON 무회귀.
 *
 * 사용법:
 *   node apps/web/scripts/browser-verify-774-sun.mjs
 *   HEADFUL=0 node apps/web/scripts/browser-verify-774-sun.mjs     # headless 폴백
 *   CAPTURE_DIR=/abs/dir node ...                                  # 캡처 PNG 저장
 */

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const CAPTURE_DIR = process.env.CAPTURE_DIR ?? null;
const HEADFUL = process.env.HEADFUL !== '0';

async function setupPage(browser, query) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE_URL}${query}`, { waitUntil: 'networkidle', timeout: 45_000 });
  await page.waitForFunction(
    () => typeof window.__simCore !== 'undefined' && typeof window.__solarScene !== 'undefined',
    { timeout: 20_000 },
  );
  await page.waitForTimeout(2600); // mesh 생성 + 첫 LOD pass + focus tween 정착
  return { context, page, consoleErrors };
}

/**
 * disk 측정 — mesh 화면 bbox 안의 천체 픽셀 분석 (#756 measureDisk 답습) +
 * radial 휘도/채널비 프로파일 (#774 limb darkening / 색온도 전용 확장).
 */
async function measureSunDisk(page, bodyId, captureName) {
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

      const bb = mesh.getBoundingInfo().boundingBox;
      const corners = bb.vectorsWorld;
      const Vector3 = (BABYLON && BABYLON.Vector3) || corners[0].constructor;
      const Matrix = (BABYLON && BABYLON.Matrix) || mesh.getWorldMatrix().constructor;
      const idMat = Matrix.Identity();
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

      // ── #756 답습: 라플라시안 고주파 (granulation 지표) ────────────────────
      const lumGrid = new Float32Array(bw * bh);
      const mask = new Uint8Array(bw * bh);
      const lums = [];
      for (let i = 0; i < bw * bh; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b; // Rec.709 (DoD 2 명시)
        lumGrid[i] = lum;
        if (lum < 8) continue; // 우주 배경 배제
        mask[i] = 1;
        lums.push(lum);
      }
      const n = lums.length;
      if (n === 0) return { error: 'disk 영역 천체 픽셀 0', screenBox };
      const mean = lums.reduce((a, b) => a + b, 0) / n;
      const variance = lums.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
      const stddev = Math.sqrt(variance);

      let hfSum = 0;
      let hfCount = 0;
      const hfHist = new Array(32).fill(0);
      for (let y = 1; y < bh - 1; y++) {
        for (let x = 1; x < bw - 1; x++) {
          const i = y * bw + x;
          if (!mask[i] || !mask[i - 1] || !mask[i + 1] || !mask[i - bw] || !mask[i + bw]) continue;
          const lap =
            4 * lumGrid[i] - lumGrid[i - 1] - lumGrid[i + 1] - lumGrid[i - bw] - lumGrid[i + bw];
          hfSum += lap * lap;
          hfCount++;
          hfHist[Math.min(31, Math.floor(Math.abs(lap)))]++;
        }
      }
      const hfEnergy = hfCount > 0 ? Math.sqrt(hfSum / hfCount) : 0;
      let hfEntropy = 0;
      for (const c of hfHist) {
        if (c === 0) continue;
        const p = c / hfCount;
        hfEntropy -= p * Math.log2(p);
      }

      // ── #774 radial 프로파일 (limb darkening + 색온도) ──────────────────────
      // disk 중심 = bbox 중앙 (bbox 는 disk 외접 사각형), 반경 = min(bw,bh)/2.
      const cx = bw / 2;
      const cy = bh / 2;
      const R = Math.min(bw, bh) / 2;
      const RADII = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95];
      const ANGLES = 48;
      const radial = [];
      for (const rr of RADII) {
        let sumLum = 0,
          sumR = 0,
          sumB = 0,
          cnt = 0;
        for (let a = 0; a < ANGLES; a++) {
          const theta = (a / ANGLES) * Math.PI * 2;
          const px = Math.round(cx + rr * R * Math.cos(theta));
          const py = Math.round(cy + rr * R * Math.sin(theta));
          if (px < 0 || py < 0 || px >= bw || py >= bh) continue;
          const i = py * bw + px;
          if (!mask[i]) continue; // disk 밖 배경 제외
          sumLum += lumGrid[i];
          sumR += data[i * 4];
          sumB += data[i * 4 + 2];
          cnt++;
        }
        radial.push({
          r: rr,
          lum: cnt ? Number((sumLum / cnt).toFixed(2)) : null,
          bOverR: cnt && sumR > 0 ? Number((sumB / sumR).toFixed(4)) : null,
          samples: cnt,
        });
      }

      return {
        area: n,
        stddev: Number(stddev.toFixed(3)),
        hfEnergy: Number(hfEnergy.toFixed(4)),
        hfEntropy: Number(hfEntropy.toFixed(3)),
        meanLum: Number(mean.toFixed(1)),
        radial,
        screenBox,
      };
    },
    { b64, bodyId },
  );
}

async function launch() {
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

/** radial 프로파일 판정 — 단조 감소(허용 오차) + edge/center 비. */
function judgeRadial(radial) {
  const valid = radial.filter((s) => s.lum !== null && s.samples >= 8);
  if (valid.length < 5) return { ok: false, reason: `유효 radial 샘플 부족 (${valid.length})` };
  const center = valid[0].lum;
  const edge = valid.find((s) => s.r === 0.9) ?? valid[valid.length - 1];
  // 단조 감소 (granulation 노이즈 허용 — 3 lum 이내 역전은 무시).
  let monotonicViolations = 0;
  for (let i = 1; i < valid.length; i++) {
    if (valid[i].lum > valid[i - 1].lum + 3) monotonicViolations++;
  }
  const edgeCenterRatio = edge.lum / center;
  const bOverRCenter = valid[0].bOverR;
  const bOverREdge = edge.bOverR;
  return {
    ok: monotonicViolations === 0 && edgeCenterRatio < 0.85 && bOverREdge < bOverRCenter,
    monotonicViolations,
    edgeCenterRatio: Number(edgeCenterRatio.toFixed(4)),
    bOverRCenter,
    bOverREdge,
    center,
    edge: edge.lum,
  };
}

(async () => {
  const browser = await launch();
  const out = { sunOn: null, sunOff: null, planets: {}, consoleErrors: {} };
  try {
    console.log('\n=== DoD 1·2·3 — ?focus=sun (surface ON, 기본) ===');
    {
      const { context, page, consoleErrors } = await setupPage(
        browser,
        `?gpu=a&focus=sun&lod=auto`,
      );
      const m = await measureSunDisk(page, 'sun', 'sun-on');
      out.sunOn = m;
      out.consoleErrors['sun-on'] = consoleErrors;
      const judge = m.radial ? judgeRadial(m.radial) : { ok: false, reason: m.error };
      out.sunOn.judge = judge;
      console.log(`  granulation: hfEnergy=${m.hfEnergy} hfEntropy=${m.hfEntropy} area=${m.area}`);
      console.log(`  radial lum : ${m.radial?.map((s) => s.lum).join(' ')}`);
      console.log(`  radial B/R : ${m.radial?.map((s) => s.bOverR).join(' ')}`);
      console.log(
        `  limb judge : edge/center=${judge.edgeCenterRatio} (<0.85?) monoViol=${judge.monotonicViolations} B/R center=${judge.bOverRCenter} edge=${judge.bOverREdge} → ${judge.ok ? 'PASS' : 'FAIL'}`,
      );
      if (consoleErrors.length)
        console.log(`  console errors: ${JSON.stringify(consoleErrors.slice(0, 3))}`);
      await context.close();
    }

    console.log('\n=== DoD 4 — ?focus=sun&surface=off 단색 복귀 ===');
    {
      const { context, page, consoleErrors } = await setupPage(
        browser,
        `?gpu=a&focus=sun&lod=auto&surface=off`,
      );
      const m = await measureSunDisk(page, 'sun', 'sun-off');
      out.sunOff = m;
      out.consoleErrors['sun-off'] = consoleErrors;
      console.log(
        `  hfEnergy=${m.hfEnergy} hfEntropy=${m.hfEntropy} stddev=${m.stddev} area=${m.area}`,
      );
      console.log(`  radial lum : ${m.radial?.map((s) => s.lum).join(' ')}`);
      await context.close();
    }

    console.log('\n=== DoD 4 — planet 4종 무회귀 (surface ON) ===');
    for (const id of ['earth', 'mars', 'jupiter', 'moon']) {
      const { context, page, consoleErrors } = await setupPage(
        browser,
        `?gpu=a&focus=${id}&lod=auto`,
      );
      const m = await measureSunDisk(page, id, `planet-${id}`);
      out.planets[id] = { hfEnergy: m.hfEnergy, hfEntropy: m.hfEntropy, area: m.area };
      console.log(
        `  ${id.padEnd(8)} hfEnergy=${m.hfEnergy} hfEntropy=${m.hfEntropy} area=${m.area} err=${consoleErrors.length}`,
      );
      await context.close();
    }
  } finally {
    await browser.close();
  }

  console.log('\n=== JSON ===');
  console.log(JSON.stringify(out, null, 2));

  // 종합 판정 — granulation 지표는 hf **엔트로피** (ADR §DoD 1 명시).
  // ⚠️ hfEnergy(RMS) 는 OFF 단색 disk 의 경계 antialiasing 급락 (232→0) 이 소수 픽셀에서
  // 큰 라플라시안을 만들어 오염된다 (측정 방법 검증 — CRITICAL #6.10). 엔트로피는 차분 분포의
  // 다양성이라 "대부분 0 + 경계 소수 대형" (OFF) 과 "전면 미세 변조" (ON) 를 정확히 구분.
  const g1 = out.sunOn?.hfEntropy > (out.sunOff?.hfEntropy ?? 0); // granulation ON > OFF
  const g2 = out.sunOn?.judge?.ok === true;
  const pass = g1 && g2;
  console.log(
    `\n=== 판정: granulation 엔트로피 ON>OFF=${g1} / limb+색온도=${g2} → ${pass ? 'PASS' : 'FAIL'} ===`,
  );
  process.exit(pass ? 0 : 1);
})();
