#!/usr/bin/env node
/**
 * R1 #329 — UI 회귀 가드 (4 영역 × 3 viewport pixel diff).
 *
 * playwright + pixelmatch + pngjs 로 baseline 대비 mismatch ratio ≤ 0.5% 검증.
 * 캔버스 (3D scene) 영역은 제외 — sun mesh 추가가 의도 변화 (PM Q2 비-범위).
 *
 * 사용법:
 *   node apps/web/scripts/r1-ui-regression-guard.mjs              # 회귀 검증
 *   node apps/web/scripts/r1-ui-regression-guard.mjs --update     # baseline 갱신
 *   node apps/web/scripts/r1-ui-regression-guard.mjs --viewport=1280x720
 *   node apps/web/scripts/r1-ui-regression-guard.mjs --measure-sun-coverage  # 점유율만 측정
 *
 * 환경변수 계약:
 *   BASE_URL    — 웹 서버 URL (기본 http://localhost:3000, CI 에서 http://localhost:3001 등 오버라이드 가능)
 *   SKIP_LOCAL  — '1' + macOS darwin 한정 즉시 PASS 종료 (Linux baseline 과 폰트 차이 false positive 회피)
 *
 * ADR `docs/decisions/20260425-r1-ui-pixel-diff-guard.md` §결정 4 + §Amendment 2026-04-26.
 */

import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MISMATCH_RATIO_LIMIT,
  PIXELMATCH_THRESHOLD,
  R1_UI_REGIONS,
  R1_VIEWPORTS,
} from './r1-ui-regions.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_DIR = path.join(__dirname, '__baselines__', 'r1');
const DIFF_DIR = path.join(__dirname, '__diff__', 'r1');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

const args = process.argv.slice(2);
const flags = {
  update: args.includes('--update'),
  measureSunCoverage: args.includes('--measure-sun-coverage'),
  viewportFilter: args.find((a) => a.startsWith('--viewport='))?.split('=')[1] ?? null,
};

/** 영역 클립 좌표 추출 (selector 우선, 없으면 fallback). */
async function clipForRegion(page, region, viewport) {
  // selector 우선 — 안정적 DOM 추적.
  const handle = await page.$(region.selector);
  if (handle) {
    const box = await handle.boundingBox();
    if (box && box.width > 0 && box.height > 0) {
      // 정수 픽셀 (pixelmatch 는 정확한 width/height 요구).
      return {
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
      };
    }
  }
  // fallback — 1280×720 viewport 한정. 다른 viewport 는 selector 가 우선.
  if (viewport.id === '1280x720' && region.fallback1280x720) {
    return region.fallback1280x720;
  }
  throw new Error(
    `[r1-guard] region "${region.id}" — selector="${region.selector}" 미발견 + viewport=${viewport.id} fallback 부재. ` +
      `해당 컴포넌트에 data-r1-region="${region.id}" attribute 박제 누락 의심.`,
  );
}

/** Mesh viewport 점유율 측정 — sun 한정 (canvas 중앙 brightness threshold 추출). */
async function measureSunCoverage(page, viewport) {
  // canvas 의 픽셀 데이터를 읽어 밝기 임계 (≥ 200/255 grayscale) 픽셀 비율을 점유율로 간주.
  // sun emissiveColor=#FFE9A8 (밝은 노랑) 이라 disableLighting=true 이고 배경 (#0808 0d) 와 명확 구분.
  const coverage = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    const w = canvas.width;
    const h = canvas.height;
    // canvas → offscreen 으로 픽셀 데이터 복사.
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const ctx = off.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(canvas, 0, 0);
    const img = ctx.getImageData(0, 0, w, h);
    const data = img.data;
    const total = w * h;
    let bright = 0;
    // 8 픽셀 보폭 샘플링 (full pass 는 1280×720 = 921k 픽셀, evaluate 직렬화 부담).
    // 보폭 8 → 14k 샘플, 통계적으로 ±0.1% 오차 충분.
    const stride = 8;
    let sampled = 0;
    for (let y = 0; y < h; y += stride) {
      for (let x = 0; x < w; x += stride) {
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        // 밝기 (luminance): 0.299 R + 0.587 G + 0.114 B (Rec.601). 200/255 임계.
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (lum >= 200) bright += 1;
        sampled += 1;
      }
    }
    return { ratio: bright / sampled, totalPixels: total, sampled };
  });
  return coverage;
}

/** crop + PNG 인코딩. */
async function captureRegion(page, clip) {
  const buffer = await page.screenshot({ clip, type: 'png' });
  return PNG.sync.read(buffer);
}

function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function baselinePath(viewportId, regionId) {
  return path.join(BASELINE_DIR, viewportId, `${regionId}.png`);
}

function diffPath(viewportId, regionId) {
  return path.join(DIFF_DIR, viewportId, `${regionId}.png`);
}

async function setupPage(browser, viewport, queryString = '') {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const url = `${BASE_URL}${queryString}`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  // hydration + scene 초기화 대기.
  await page.waitForFunction(
    () => typeof window.__gpuTier !== 'undefined' && typeof window.__simCore !== 'undefined',
    { timeout: 10_000 },
  );
  // 추가 안정 대기 — sun mesh 생성 + 첫 프레임 렌더 완료.
  await page.waitForTimeout(800);
  return { context, page };
}

async function runForViewport(browser, viewport) {
  console.log(`\n=== viewport ${viewport.id} (${viewport.width}×${viewport.height}) ===`);

  const { context, page } = await setupPage(browser, viewport);

  ensureDirSync(path.join(BASELINE_DIR, viewport.id));
  ensureDirSync(path.join(DIFF_DIR, viewport.id));

  const results = [];
  let overallPass = true;

  // sun viewport 점유율 측정 (시각화 ADR §결과·재검토 조건 박제용).
  const sunCoverage = await measureSunCoverage(page, viewport);
  if (sunCoverage) {
    const pct = (sunCoverage.ratio * 100).toFixed(2);
    console.log(`  sun viewport 점유율 (밝기 ≥ 200/255 픽셀 비율, stride=8 샘플) = ${pct}%`);
    results.push({ regionId: '__sun_coverage__', ratio: sunCoverage.ratio, pass: true });
  }

  if (flags.measureSunCoverage) {
    await context.close();
    return { results, pass: true };
  }

  for (const region of R1_UI_REGIONS) {
    let clip;
    try {
      clip = await clipForRegion(page, region, viewport);
    } catch (err) {
      console.log(`  ! ${region.id}: ${err.message}`);
      overallPass = false;
      results.push({ regionId: region.id, pass: false, error: err.message });
      continue;
    }

    const currentPng = await captureRegion(page, clip);
    const bp = baselinePath(viewport.id, region.id);

    if (flags.update || !fs.existsSync(bp)) {
      // baseline 갱신 또는 부트스트래핑 (없으면 생성, 회귀 검증 모드여도 첫 실행이면 PASS 로 처리하고 생성).
      const buf = PNG.sync.write(currentPng);
      fs.writeFileSync(bp, buf);
      const action = flags.update ? 'updated' : 'bootstrapped';
      console.log(
        `  ✓ ${region.id} — ${action} (${currentPng.width}×${currentPng.height}) → ${path.relative(process.cwd(), bp)}`,
      );
      results.push({ regionId: region.id, pass: true, action });
      continue;
    }

    // 회귀 검증.
    const baselinePng = PNG.sync.read(fs.readFileSync(bp));
    if (baselinePng.width !== currentPng.width || baselinePng.height !== currentPng.height) {
      console.log(
        `  ! ${region.id}: dimension mismatch baseline=${baselinePng.width}×${baselinePng.height} current=${currentPng.width}×${currentPng.height}`,
      );
      overallPass = false;
      results.push({
        regionId: region.id,
        pass: false,
        error: `dimension mismatch ${baselinePng.width}×${baselinePng.height} vs ${currentPng.width}×${currentPng.height}`,
      });
      continue;
    }

    const { width, height } = baselinePng;
    const diff = new PNG({ width, height });
    const mismatched = pixelmatch(baselinePng.data, currentPng.data, diff.data, width, height, {
      threshold: PIXELMATCH_THRESHOLD,
      includeAA: false,
    });
    const totalPixels = width * height;
    const ratio = mismatched / totalPixels;
    const pass = ratio <= MISMATCH_RATIO_LIMIT;

    if (!pass) {
      // diff 이미지 저장 (CI artifact 업로드 대상).
      const dp = diffPath(viewport.id, region.id);
      fs.writeFileSync(dp, PNG.sync.write(diff));
      overallPass = false;
    }

    const ratioPct = (ratio * 100).toFixed(3);
    const limitPct = (MISMATCH_RATIO_LIMIT * 100).toFixed(1);
    console.log(
      `  ${pass ? '✓' : '✗'} ${region.id} — mismatch ${mismatched}/${totalPixels} (${ratioPct}% ${pass ? '≤' : '>'} ${limitPct}%)`,
    );
    results.push({ regionId: region.id, pass, mismatched, totalPixels, ratio });
  }

  await context.close();
  return { results, pass: overallPass };
}

async function main() {
  // SKIP_LOCAL=1 + darwin — Linux baseline 폰트 차이 false positive 회피 (ADR Amendment 2026-04-26 §결정 1).
  if (process.env.SKIP_LOCAL === '1' && process.platform === 'darwin') process.exit(0);
  ensureDirSync(BASELINE_DIR);
  ensureDirSync(DIFF_DIR);

  const browser = await chromium.launch({ headless: true });
  const allResults = {};
  let overallPass = true;

  try {
    const targets = flags.viewportFilter
      ? R1_VIEWPORTS.filter((v) => v.id === flags.viewportFilter)
      : R1_VIEWPORTS;
    if (targets.length === 0) {
      console.error(`[r1-guard] --viewport=${flags.viewportFilter} 매칭 viewport 없음.`);
      process.exit(2);
    }
    for (const viewport of targets) {
      const { results, pass } = await runForViewport(browser, viewport);
      allResults[viewport.id] = results;
      if (!pass) overallPass = false;
    }
  } finally {
    await browser.close();
  }

  console.log('\n=== 요약 ===');
  console.log(
    `mode: ${flags.update ? 'update' : flags.measureSunCoverage ? 'measure-sun' : 'verify'}`,
  );
  console.log(`overall: ${overallPass ? 'PASS' : 'FAIL'}`);
  if (!overallPass) {
    console.log(`diff PNG: ${path.relative(process.cwd(), DIFF_DIR)} (실패 영역만)`);
  }

  process.exit(overallPass ? 0 : 1);
}

main().catch((err) => {
  console.error('[r1-guard] unhandled error:', err);
  process.exit(2);
});
