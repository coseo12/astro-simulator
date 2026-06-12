#!/usr/bin/env node
/**
 * #675 — glow pixel marker 회귀 가드.
 *
 * ADR `docs/decisions/20260613-675-glow-pixel-marker.md` §축 6 (헤드리스/CI 가드).
 *
 * 검증 매트릭스:
 *   1. 식별 천체 카운트 (40 AU / 100 AU): default (glow ON) − `?marker=off` 의 luminance
 *      cluster 증가분 ≥ 프리뷰 실측 기준 (40 AU +10 / 100 AU +11). 궤도선은 luminance 오염원이라
 *      측정 전 OFF (R10a qa 선례 — 궤도선 lum 오염 분리 샘플링).
 *   2. `?marker=off` 격리: low variant (`<id>-lod-low`) 전수 scaling=1 (glow 역보정 무적용 —
 *      기존 동작 100% 보존. scene 통합 검증을 본 스크립트가 담당 — 기존 NullEngine 회피 컨벤션).
 *   3. off-frustum 가드: glow ON 에서 lodInfo.pxDiameter ≤ 0 (화면 밖) body 의 low variant
 *      scaling=1 유지 (marker 부재 — ADR §축 4 fail-safe).
 *   4. 전수 발동: 100 AU 에서 lodInfo.pxDiameter > 0 + level='low' body 전수 scaling > 1.
 *   5. 하위 호환: `?marker=glow` 명시 = default (미지정) 와 식별 천체 카운트 동일.
 *
 * 사용법:
 *   node apps/web/scripts/browser-verify-glow-marker.mjs
 *   BASE_URL=http://localhost:3000/ko node apps/web/scripts/browser-verify-glow-marker.mjs
 *   CAPTURE_DIR=docs/reports node ...  # 캡처 PNG 저장 (PR 박제용 — 미지정 시 저장 생략)
 *
 * dev 빌드 의존: `window.__solarScene` / `window.__simStore` / `window.__simCore` (sim-canvas.tsx).
 * `?gpu=a` 고정 — headless GPU adapter 부재 시 tier-c LOD low 아티팩트 함정 회피 (R7 선례).
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000/ko';
const CAPTURE_DIR = process.env.CAPTURE_DIR ?? '';

const VIEWPORT = { width: 1280, height: 720 };
const POST_INIT_WAIT_MS = 1500;
const POST_CAMERA_WAIT_MS = 1000;
const AU_METERS = 1.495978707e11;

/** 프리뷰 실측 기준 (2026-06-12) — 식별 천체 증가분 하한. ADR §축 6 박제값. */
const EXPECTED_DELTA = [
  { au: 40, minDelta: 10 },
  { au: 100, minDelta: 11 },
];

/** luminance cluster 식별 임계 (0~255). glow marker 피크 휘도 173~252 (프리뷰 실측) ≫ 40. */
const LUMINANCE_THRESHOLD = 40;

function buildUrl(query) {
  const sep = BASE_URL.includes('?') ? '&' : '?';
  return query ? `${BASE_URL}${sep}${query}` : BASE_URL;
}

async function openSim(browser, query) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(buildUrl(query), { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForFunction(
    () =>
      typeof window.__simStore !== 'undefined' &&
      typeof window.__solarScene !== 'undefined' &&
      typeof window.__simCore !== 'undefined',
    { timeout: 30_000 },
  );
  await page.waitForTimeout(POST_INIT_WAIT_MS);
  return { context, page };
}

/**
 * 카메라를 태양으로부터 au (AU) 거리로 이동.
 *
 * scene unit ↔ meter 환산은 lodInfo(sun).cameraDistanceMeters / camera.radius 실측비 사용 —
 * tier renderScale 하드코딩 회피. tier 전환 (radius 점프로 renderScale 변경 가능) 수렴을 위해
 * 2-pass 적용.
 */
async function setCameraAu(page, au) {
  for (let pass = 0; pass < 2; pass++) {
    await page.evaluate(
      ({ au, AU_METERS }) => {
        const scene = window.__solarScene.meshes.get('sun').getScene();
        const cam = scene.activeCamera;
        const sunInfo = window.__solarScene.getLodInfo().find((i) => i.id === 'sun');
        if (!sunInfo || !(sunInfo.cameraDistanceMeters > 0) || !(cam.radius > 0)) return;
        const metersPerUnit = sunInfo.cameraDistanceMeters / cam.radius;
        const target = (au * AU_METERS) / metersPerUnit;
        if (cam.upperRadiusLimit !== null && cam.upperRadiusLimit < target * 1.5) {
          cam.upperRadiusLimit = target * 1.5;
        }
        cam.radius = target;
      },
      { au, AU_METERS },
    );
    await page.waitForTimeout(POST_CAMERA_WAIT_MS);
  }
  // 실측 거리 확인용 반환 (AU).
  return page.evaluate(() => {
    const sunInfo = window.__solarScene.getLodInfo().find((i) => i.id === 'sun');
    return sunInfo ? sunInfo.cameraDistanceMeters / 1.495978707e11 : NaN;
  });
}

/** 궤도선 OFF — luminance cluster 측정 오염 분리 (R10a qa 선례). */
async function disableOrbitLines(page) {
  await page.evaluate(() => window.__solarScene.setOrbitLinesVisible(false));
  await page.waitForTimeout(400);
}

/**
 * 식별 천체 카운트 — canvas 캡처의 luminance ≥ 40 픽셀 8-이웃 연결 성분 수.
 *
 * WebGL drawing buffer 미보존 함정 회피: playwright element screenshot (PNG) → 페이지 내
 * Image 디코드 → 2D canvas getImageData 로 분석 (프리뷰 측정과 동일 경로).
 */
async function countIdentifiableBodies(page, captureName) {
  const canvas = page.locator('canvas').first();
  const buf = await canvas.screenshot();
  if (CAPTURE_DIR && captureName) {
    await mkdir(CAPTURE_DIR, { recursive: true });
    await writeFile(path.join(CAPTURE_DIR, `${captureName}.png`), buf);
  }
  const b64 = buf.toString('base64');
  return page.evaluate(
    async ({ b64, threshold }) => {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = `data:image/png;base64,${b64}`;
      });
      const w = img.width;
      const h = img.height;
      const off = document.createElement('canvas');
      off.width = w;
      off.height = h;
      const ctx = off.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, w, h).data;
      const bright = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        // Rec.601 luminance — r1-guard sun 점유율 측정과 동일 식.
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (lum >= threshold) bright[i] = 1;
      }
      // 8-이웃 BFS 연결 성분 카운트.
      const visited = new Uint8Array(w * h);
      const stack = [];
      let clusters = 0;
      for (let start = 0; start < w * h; start++) {
        if (!bright[start] || visited[start]) continue;
        clusters++;
        visited[start] = 1;
        stack.push(start);
        while (stack.length > 0) {
          const cur = stack.pop();
          const cx = cur % w;
          const cy = (cur - cx) / w;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = cx + dx;
              const ny = cy + dy;
              if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
              const ni = ny * w + nx;
              if (bright[ni] && !visited[ni]) {
                visited[ni] = 1;
                stack.push(ni);
              }
            }
          }
        }
      }
      return clusters;
    },
    { b64, threshold: LUMINANCE_THRESHOLD },
  );
}

/** low variant (`<id>-lod-low`) 전수의 { id, scalingX, pxDiameter, level } 수집. */
async function collectLowVariantState(page) {
  return page.evaluate(() => {
    const scene = window.__solarScene.meshes.get('sun').getScene();
    const out = [];
    for (const info of window.__solarScene.getLodInfo()) {
      const low = scene.getMeshByName(`${info.id}-lod-low`);
      out.push({
        id: info.id,
        level: info.level,
        pxDiameter: info.pxDiameter,
        scalingX: low ? low.scaling.x : null, // null = low variant 아직 lazy-create 안 됨
      });
    }
    return out;
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  let allPass = true;
  const check = (label, pass, detail) => {
    console.log(`   ${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
    if (!pass) allPass = false;
  };

  try {
    console.log('\n=== #675 glow pixel marker 회귀 가드 ===');
    console.log(`BASE_URL=${BASE_URL}\n`);

    // 모드 3종 (default = glow ON / 명시 glow / off) 페이지 오픈. headless tier-c 함정 회피 ?gpu=a.
    const modes = {
      default: 'gpu=a&lod=auto',
      glow: 'gpu=a&lod=auto&marker=glow',
      off: 'gpu=a&lod=auto&marker=off',
    };
    const counts = {}; // counts[mode][au]
    const lowStates = {}; // lowStates[mode][au]

    for (const [mode, query] of Object.entries(modes)) {
      counts[mode] = {};
      lowStates[mode] = {};
      const { context, page } = await openSim(browser, query);
      await disableOrbitLines(page);
      for (const { au } of EXPECTED_DELTA) {
        const actualAu = await setCameraAu(page, au);
        const captureName = `675-glow-${au}au-${mode}`;
        counts[mode][au] = await countIdentifiableBodies(page, captureName);
        lowStates[mode][au] = await collectLowVariantState(page);
        console.log(
          `   [측정] mode=${mode.padEnd(7)} ${au} AU (실측 ${actualAu.toFixed(1)} AU) → 식별 천체 ${counts[mode][au]}`,
        );
      }
      await context.close();
    }

    // 1) 식별 천체 증가분 (default vs off) — 프리뷰 실측 기준 재현.
    console.log('\n1) 식별 천체 카운트 (default glow ON − ?marker=off) ≥ 프리뷰 기준\n');
    for (const { au, minDelta } of EXPECTED_DELTA) {
      const delta = counts.default[au] - counts.off[au];
      check(
        `${au} AU: +${delta} (glow ${counts.default[au]} / off ${counts.off[au]})`,
        delta >= minDelta,
        `기준 ≥ +${minDelta}`,
      );
    }

    // 2) ?marker=off 격리 — low variant 전수 scaling=1 (glow 역보정 무적용).
    console.log('\n2) ?marker=off 격리 — low variant 전수 scaling=1 (기존 동작 100%)\n');
    for (const { au } of EXPECTED_DELTA) {
      const scaled = lowStates.off[au].filter((s) => s.scalingX !== null && s.scalingX !== 1);
      check(
        `${au} AU: scaling≠1 low variant ${scaled.length}개`,
        scaled.length === 0,
        scaled.length > 0 ? JSON.stringify(scaled.slice(0, 3)) : undefined,
      );
    }

    // 3) off-frustum 가드 — glow ON 에서 pxDiameter ≤ 0 body 는 scaling=1 유지 (ADR §축 4).
    console.log('\n3) off-frustum 가드 — pxDiameter ≤ 0 body 의 marker 부재 (scaling=1)\n');
    for (const { au } of EXPECTED_DELTA) {
      const offFrustum = lowStates.default[au].filter(
        (s) => !(s.pxDiameter > 0) && s.scalingX !== null,
      );
      const violated = offFrustum.filter((s) => s.scalingX !== 1);
      check(
        `${au} AU: off-frustum ${offFrustum.length}개 중 scaling≠1 ${violated.length}개`,
        violated.length === 0,
        violated.length > 0 ? JSON.stringify(violated.slice(0, 3)) : undefined,
      );
    }

    // 4) 전수 발동 — 100 AU 에서 화면 안 (pxDiameter > 0) low body 전수 scaling > 1.
    console.log('\n4) 전수 발동 — 100 AU 화면 안 low body 전수 glow scaling > 1\n');
    {
      const inFrustumLow = lowStates.default[100].filter(
        (s) => s.pxDiameter > 0 && s.level === 'low' && s.scalingX !== null,
      );
      const notGlowing = inFrustumLow.filter((s) => s.scalingX <= 1);
      check(
        `100 AU: 화면 안 low body ${inFrustumLow.length}개 중 미발동 ${notGlowing.length}개`,
        inFrustumLow.length > 0 && notGlowing.length === 0,
        notGlowing.length > 0 ? JSON.stringify(notGlowing.slice(0, 5)) : undefined,
      );
    }

    // 5) 하위 호환 — ?marker=glow 명시도 off 대비 동일 기준의 증가분 충족 (wiring 검증).
    //
    // ⚠️ default 와의 정확 카운트 일치 단언은 금지 — 페이지 로드 간 sim 시각 차이로 body 위치가
    // 미세 이동 → 인접 marker cluster 병합/분리 ±1~2 변동 (2026-06-13 실측: 100 AU 124 vs 125).
    // 명시 glow 의 작동 자체는 off 대비 증가분 (≥ minDelta) 이 직접 검증한다 — wiring 회귀
    // (명시 glow 가 off 로 해석되는 류) 시 증가분이 0 으로 떨어져 즉시 FAIL.
    console.log('\n5) 하위 호환 — ?marker=glow 명시 = off 대비 증가분 동일 기준 충족\n');
    for (const { au, minDelta } of EXPECTED_DELTA) {
      const delta = counts.glow[au] - counts.off[au];
      check(
        `${au} AU: 명시 +${delta} (glow ${counts.glow[au]} / off ${counts.off[au]})`,
        delta >= minDelta,
        `기준 ≥ +${minDelta}`,
      );
    }
  } finally {
    await browser.close();
  }

  console.log('\n=== 최종 요약 ===');
  console.log(`  overall: ${allPass ? 'PASS' : 'FAIL'}`);
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error('\n  FATAL:', err);
  process.exit(2);
});
