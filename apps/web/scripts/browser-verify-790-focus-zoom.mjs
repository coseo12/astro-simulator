#!/usr/bin/env node
/**
 * #790 fix 회귀 가드 — focus body 최대 줌인 시 카메라 mesh 내부 진입 암전 차단.
 *
 * 사용법:
 *   pnpm --filter @astro-simulator/web verify:790-focus-zoom
 *   CAPTURE_DIR=docs/reports/790-focus-zoom pnpm --filter @astro-simulator/web verify:790-focus-zoom
 *
 * ## 배경 (#774 qa 발견, 사전 존재)
 *
 * `?focus=sun` 최대 줌인 시 lowerRadiusLimit(0.5) < sun mesh 시각 반경(2.92) → 카메라가
 * mesh 내부 진입 → backface culling 으로 화면 암전. 대조표 실측 32/32 body 전수 침범
 * (tier 전환 body 는 가드 A `targetRadius×0.01` ≈ 표면 94% 안쪽).
 * fix = focus 경로 2곳 (focusOn / runTierTransition) 에서 `min(visualR × 1.05, desiredR)` 하한 상향.
 *
 * ## 검증 시나리오 (3 — focus 경로 × tier 전환 유무 직교)
 *
 * | 시나리오 | 경로 | DoD |
 * |---|---|---|
 * | S1. ?focus=sun (URL, 원 재현) | focusOn 단독 (tier 무전환 solar) | radius ≥ visualR + 중앙 luminance ≥ 임계 |
 * | S2. jupiter focus (버튼 경로) | focusOn + 줌인 중 inner→body 전환 | 동일 |
 * | S3. saturn focus (버튼 경로) | 동일 (ring 동반 대형 body) | 동일 |
 *
 * 판정 (2축 AND):
 *  1. 기하: 최대 줌인 radius ≥ mesh 시각 반경 — 표면 밖 보장. 시각 반경은 회전 불변 정의
 *     `max(boundingBox.extendSize × |scaling|)` (core resolveMeshVisualRadius 와 동일 식).
 *     boundingSphere.radiusWorld 는 box 외접구 √3 과대 + #782 자전 위상 진동 (jupiter 실측
 *     33.2~34.8 unit) 이라 판정 기반 부적합 — 진단 보고만.
 *  2. 픽셀: 중앙 crop 평균 luminance ≥ DARK_THRESHOLD (암전 0 정량) — 침범 시 mesh 미렌더
 *     (backface culling) 로 배경 starfield/글로우 잔존만 남아 ≈ 9 (수정 전 실측), 정상 시
 *     표면이 화면을 채워 ≫ 임계 (Playwright composited screenshot + 페이지 내 2D getImageData —
 *     WebGPU drawImage readback 빈 버퍼 함정 회피, #728 SSoT)
 *
 * dev 빌드 의존: window.__solarScene (meshes Map / getTier) + window.__simStore (setSelectedBody)
 * 환경변수: BASE_URL (기본 http://localhost:3000) / CAPTURE_DIR (PNG 저장, 미지정 시 생략)
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const CAPTURE_DIR = process.env.CAPTURE_DIR ?? '';
const args = process.argv.slice(2);
const flags = { json: args.includes('--json') };

const VIEWPORT = { width: 1280, height: 720 };
const SETTLE_MS = 2500;
// 암전 판정 임계 (0~255 luminance). 수정 전 실측 (2026-07-09, PR #790 본문 대조표):
// 침범 상태 sun 중앙 crop 평균 = 9.2 (backface culling — 잔존 glow/starfield 만).
// 정상 상태 실측: jupiter 36.6 / saturn 42.2 / sun 150+. 20 은 두 상태를 양방향 마진으로 분리.
const DARK_THRESHOLD = 20;
// 중앙 crop 크기 — 화면 중앙 정사각 (짧은 축의 1/3). focus body 는 항상 화면 중앙.
const CROP_RATIO = 1 / 3;
// 최대 줌인 수렴 판정: 1 iteration (휠 8틱) 후 radius 상대 변화 < 0.3% 면 lowerRadiusLimit 도달.
const ZOOM_CONVERGE_EPS = 0.003;
const MAX_ZOOM_ITERS = 80;
const WHEEL_TICKS_PER_ITER = 8;

async function bootstrap(page, urlSuffix = '') {
  await page.goto(`${BASE_URL}/?gpu=a&lod=auto${urlSuffix}`, {
    waitUntil: 'networkidle',
    timeout: 30_000,
  });
  await page.waitForFunction(
    () => typeof window.__solarScene !== 'undefined' && typeof window.__simStore !== 'undefined',
    { timeout: 15_000 },
  );
  await page.waitForTimeout(SETTLE_MS);
}

/** 카메라/focus mesh 상태 측정 — 시각 반경은 회전 불변 (local extendSize × scaling, #611 갱신 후). */
async function measure(page, bodyId) {
  return await page.evaluate((id) => {
    const solar = window.__solarScene;
    const mesh = solar?.meshes?.get?.(id);
    if (!mesh) return { error: `no mesh: ${id}` };
    const scene = mesh.getScene();
    const cam = scene?.activeCamera;
    if (!cam) return { error: 'no camera' };
    mesh.computeWorldMatrix(true);
    const bi = mesh.getBoundingInfo();
    const ext = bi.boundingBox.extendSize;
    const s = mesh.scaling;
    // core resolveMeshVisualRadius 와 동일 식 (회전 불변 시각 반경).
    const visualRadius = Math.max(
      ext.x * Math.abs(s.x),
      ext.y * Math.abs(s.y),
      ext.z * Math.abs(s.z),
    );
    return {
      tier: solar.getTier ? solar.getTier() : 'unknown',
      radius: cam.radius,
      lowerRadiusLimit: cam.lowerRadiusLimit,
      visualRadius,
      boundingRadiusWorld: bi.boundingSphere.radiusWorld, // 진단 보고용 (판정 미사용)
    };
  }, bodyId);
}

/** 최대 줌인 — radius 수렴 (lowerRadiusLimit 도달) 까지 실 휠 이벤트 반복. */
async function zoomInToLimit(page, bodyId) {
  await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
  let prev = await measure(page, bodyId);
  for (let iter = 0; iter < MAX_ZOOM_ITERS; iter += 1) {
    for (let t = 0; t < WHEEL_TICKS_PER_ITER; t += 1) {
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(60);
    }
    // tier 전환 (입력 잠금 ≤ 500ms + radius tween) 완료 대기 여유.
    await page.waitForTimeout(400);
    const cur = await measure(page, bodyId);
    if (cur.error) return cur;
    const rel = Math.abs(cur.radius - prev.radius) / Math.max(prev.radius, 1e-12);
    prev = cur;
    if (rel < ZOOM_CONVERGE_EPS) break;
  }
  return prev;
}

/**
 * 중앙 crop 평균 luminance — canvas composited screenshot → 페이지 내 Image 디코드 →
 * 2D getImageData (Rec.601). WebGPU readback 함정 회피 (#728 SSoT, glow-marker 동일 경로).
 */
async function centerLuminance(page, captureName) {
  const canvas = page.locator('canvas').first();
  const buf = await canvas.screenshot();
  if (CAPTURE_DIR && captureName) {
    await mkdir(CAPTURE_DIR, { recursive: true });
    await writeFile(path.join(CAPTURE_DIR, `${captureName}.png`), buf);
  }
  const b64 = buf.toString('base64');
  return page.evaluate(
    async ({ b64, cropRatio }) => {
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
      const crop = Math.floor(Math.min(w, h) * cropRatio);
      const x0 = Math.floor((w - crop) / 2);
      const y0 = Math.floor((h - crop) / 2);
      const data = ctx.getImageData(x0, y0, crop, crop).data;
      let sum = 0;
      const n = crop * crop;
      for (let i = 0; i < n; i += 1) {
        // Rec.601 luminance — r1-guard / glow-marker 와 동일 식.
        sum += 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
      }
      return { meanLum: sum / n, crop };
    },
    { b64, cropRatio: CROP_RATIO },
  );
}

async function runScenario(browser, { name, bodyId, urlFocus }) {
  console.log(`\n[${name}] ${bodyId} focus → 최대 줌인 (침범/암전 판정)`);
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  try {
    if (urlFocus) {
      await bootstrap(page, `&focus=${bodyId}`);
    } else {
      await bootstrap(page);
      await page.evaluate((id) => window.__simStore?.getState?.().setSelectedBody?.(id), bodyId);
      await page.waitForTimeout(SETTLE_MS);
    }

    const atFocus = await measure(page, bodyId);
    const atLimit = await zoomInToLimit(page, bodyId);
    if (atLimit.error) {
      console.log(`  측정 실패: ${atLimit.error}`);
      return { scenario: name, bodyId, error: atLimit.error, pass: false };
    }
    const lum = await centerLuminance(page, `790-${bodyId}-max-zoom`);

    const geomPass = atLimit.radius >= atLimit.visualRadius;
    const pixelPass = lum.meanLum >= DARK_THRESHOLD;
    const pass = geomPass && pixelPass;
    console.log(
      `  focus(tier=${atFocus.tier} r=${atFocus.radius?.toFixed(2)}) → max-zoom(tier=${atLimit.tier} ` +
        `r=${atLimit.radius.toFixed(2)} lower=${atLimit.lowerRadiusLimit?.toFixed(2)} ` +
        `visualR=${atLimit.visualRadius.toFixed(2)} boundingRW=${atLimit.boundingRadiusWorld?.toFixed(2)})`,
    );
    console.log(
      `  기하 r/visualR=${(atLimit.radius / atLimit.visualRadius).toFixed(3)} (≥1 요구) → ${geomPass ? 'PASS' : 'FAIL'} | ` +
        `픽셀 중앙 lum=${lum.meanLum.toFixed(1)} (≥${DARK_THRESHOLD} 요구) → ${pixelPass ? 'PASS' : 'FAIL'} | ` +
        `콘솔 에러=${consoleErrors.length}`,
    );
    return {
      scenario: name,
      bodyId,
      tierAtLimit: atLimit.tier,
      radiusAtLimit: atLimit.radius,
      lowerRadiusLimit: atLimit.lowerRadiusLimit,
      visualRadius: atLimit.visualRadius,
      boundingRadiusWorld: atLimit.boundingRadiusWorld,
      radiusOverVisualR: atLimit.radius / atLimit.visualRadius,
      meanLum: lum.meanLum,
      consoleErrors: consoleErrors.length,
      geomPass,
      pixelPass,
      pass,
    };
  } finally {
    await context.close();
  }
}

async function main() {
  console.log('\n=== #790 focus 최대 줌인 mesh 침범/암전 회귀 가드 ===');
  console.log(`  base URL: ${BASE_URL}  임계: r/visualR ≥ 1 AND 중앙 lum ≥ ${DARK_THRESHOLD}`);

  const browser = await chromium.launch({ headless: true });
  const result = { timestamp: new Date().toISOString(), baseUrl: BASE_URL, scenarios: {} };
  let allPass = true;
  try {
    result.scenarios.s1 = await runScenario(browser, {
      name: 'S1',
      bodyId: 'sun',
      urlFocus: true, // 원 재현 경로 (?focus=sun)
    });
    result.scenarios.s2 = await runScenario(browser, { name: 'S2', bodyId: 'jupiter' });
    result.scenarios.s3 = await runScenario(browser, { name: 'S3', bodyId: 'saturn' });
    for (const s of Object.values(result.scenarios)) {
      if (!s.pass) allPass = false;
    }
  } finally {
    await browser.close();
  }

  console.log('\n=== 최종 요약 ===');
  for (const [k, s] of Object.entries(result.scenarios)) {
    console.log(`  ${k} (${s.bodyId}): ${s.pass ? 'PASS' : 'FAIL'}`);
  }
  console.log(`  overall: ${allPass ? 'PASS' : 'FAIL'}`);

  if (flags.json) {
    console.log('\n--- JSON ---');
    console.log(JSON.stringify(result, null, 2));
  }
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
