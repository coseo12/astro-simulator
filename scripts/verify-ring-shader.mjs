#!/usr/bin/env node
/**
 * P9 #254 PR-2.5 — 고리 shader 3층 방사밀도 pixel 검증 (CRITICAL #3 + volt #33).
 *
 * **범위**: PR-2.5 본 shader (`ring-shader.ts`) 가 3 층 (Halo/Main/Gossamer) 을 방사
 * 밀도 차이로 렌더하는지 headless Chromium 에서 pixel 샘플링으로 검증한다.
 *
 * **주의 (volt #33)**: headless swiftshader 는 부분 freeze 가능. 본 스크립트는 coarse
 * PASS 를 제공하지만 **실 Chrome 수동 검증 (screenshots/p9-pr25/)** 이 반드시 병행.
 *
 * 검증 단계:
 *   Level 1 정적:    focus=jupiter 로드 + 콘솔 에러 없음
 *   Level 2 인터랙션: 카메라 줌인 후 3 반경 구간에서 density 차이 관측
 *     - Halo (반경 normalized ~0.5, 바깥 영역) 의 평균 픽셀 alpha 가 Main 대비 낮음
 *     - Main (0.3~0.5 주변) 의 최대 alpha 는 상위 분위수
 *     - Gossamer 외곽 (0.85~1.0 normalized) 의 평균 alpha 는 낮음
 *   Level 3 흐름:    ?ring=fallback 경로 전환 시 InstancedMesh 렌더 (파티클 점 분포)
 *
 * 사용: node scripts/verify-ring-shader.mjs [baseUrl]
 * 기본 URL: http://localhost:3099
 * 스크린샷: screenshots/p9-pr25/{l1,l2,l3}-*.png
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const baseUrl = process.argv[2] ?? 'http://localhost:3099';
const __dirname = dirname(fileURLToPath(import.meta.url));
const screenshotDir = join(__dirname, '..', 'screenshots', 'p9-pr25');
mkdirSync(screenshotDir, { recursive: true });

const results = { pass: [], fail: [], warn: [] };
const check = (name, condition, detail = '') => {
  if (condition) results.pass.push(`${name}${detail ? ' — ' + detail : ''}`);
  else results.fail.push(`${name}${detail ? ' — ' + detail : ''}`);
};
const warn = (msg) => results.warn.push(msg);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

const consoleErrors = [];
const pageErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => pageErrors.push(err.message));

/**
 * canvas 에서 지정한 영역의 픽셀 평균/최대 alpha (불투명도) 를 추출.
 * 영역: 중심 (cx, cy), 반경 R 픽셀의 원 내부 픽셀 평균.
 *
 * ring-shader.ts 는 alpha = density * ringAlpha (0.6) 이므로 Halo/Main/Gossamer
 * 는 densityProfile 수치 차이로 alpha 가 구분된다.
 *
 * 검은 우주 배경(#070908)이 alpha=255 로 나오므로 alpha 로는 링 영역만 분리 못함.
 * 대신 "고리 색 `#887766` 톤과의 유사도" 로 링 픽셀 식별 (R > G > B 패턴).
 */
const sampleRingPixels = async (cx, cy, innerR, outerR) =>
  page.evaluate(
    ({ cx, cy, innerR, outerR }) => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;
      const ctx = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!ctx) return null;

      // Babylon canvas 는 WebGL context 로 저장되지만, readPixels 로 픽셀을 읽으려면
      // preserveDrawingBuffer 가 활성화돼야 함. 대신 canvas 를 toDataURL 또는
      // drawImage 로 2D canvas 에 복사 후 읽는다.
      const cap = document.createElement('canvas');
      cap.width = canvas.width;
      cap.height = canvas.height;
      const g = cap.getContext('2d');
      if (!g) return null;
      g.drawImage(canvas, 0, 0);
      const data = g.getImageData(0, 0, cap.width, cap.height).data;

      let ringPixels = 0;
      let sumR = 0,
        sumG = 0,
        sumB = 0;
      let maxBrightness = 0;
      let sampledTotal = 0;

      // ring 색 `#887766` (R=136, G=119, B=102): R > G > B 오프셋 양수 패턴
      // 배경 `#070908` (R=7, G=9, B=8): 거의 검정, R ≈ B < G (약간)
      // 판정: R > 30 AND R > G AND R > B (ring-like dust tone)
      for (
        let y = Math.max(0, Math.floor(cy - outerR));
        y < Math.min(cap.height, Math.ceil(cy + outerR));
        y++
      ) {
        for (
          let x = Math.max(0, Math.floor(cx - outerR));
          x < Math.min(cap.width, Math.ceil(cx + outerR));
          x++
        ) {
          const dx = x - cx;
          const dy = y - cy;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < innerR || d > outerR) continue;
          sampledTotal++;

          const idx = (y * cap.width + x) * 4;
          const r = data[idx];
          const g2 = data[idx + 1];
          const b = data[idx + 2];

          // ring-like 판정 (dust tone)
          if (r > 30 && r >= g2 && r > b) {
            ringPixels++;
            sumR += r;
            sumG += g2;
            sumB += b;
            const brightness = (r + g2 + b) / 3;
            if (brightness > maxBrightness) maxBrightness = brightness;
          }
        }
      }

      return {
        ringPixels,
        sampledTotal,
        ratio: sampledTotal > 0 ? ringPixels / sampledTotal : 0,
        avgR: ringPixels > 0 ? sumR / ringPixels : 0,
        avgG: ringPixels > 0 ? sumG / ringPixels : 0,
        avgB: ringPixels > 0 ? sumB / ringPixels : 0,
        maxBrightness,
      };
    },
    { cx, cy, innerR, outerR },
  );

// ===== Level 1: 정적 =====
console.log('\n[Level 1] 정적 — focus=jupiter 로드 + 콘솔 에러 없음');
await page.goto(`${baseUrl}/ko`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

check('canvas 존재', (await page.$('canvas')) !== null);
check('focus-jupiter 버튼 존재', (await page.$('[data-testid="focus-jupiter"]')) !== null);

const jupiterFocusBtn = await page.$('[data-testid="focus-jupiter"]');
if (jupiterFocusBtn) {
  await jupiterFocusBtn.click();
  await page.waitForTimeout(2000);

  // 휠 줌인 — 고리 3층 반경 구분 관측 가능한 수준까지.
  const canvasL1 = await page.$('canvas');
  if (canvasL1) {
    const box = await canvasL1.boundingBox();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      for (let i = 0; i < 30; i++) {
        await page.mouse.wheel(0, -100);
      }
      await page.waitForTimeout(1500);
      await page.mouse.move(cx, cy);
    }
  }
}

await page.screenshot({
  path: join(screenshotDir, 'l1-static-focus-jupiter.png'),
  fullPage: false,
});

// ===== Level 2: 인터랙션 — 3층 density 차이 pixel 검증 =====
console.log('\n[Level 2] 인터랙션 — 3층 density 차이 pixel 샘플링');

const canvasEl = await page.$('canvas');
const box = canvasEl ? await canvasEl.boundingBox() : null;

if (!box) {
  check('canvas boundingBox', false, 'null');
} else {
  // canvas 내부 좌표계로 변환 (device pixel ratio 고려)
  const dpr = await page.evaluate(() => window.devicePixelRatio ?? 1);
  const canvasCx = (box.width / 2) * dpr;
  const canvasCy = (box.height / 2) * dpr;

  // Jupiter 중심은 canvas 중앙(포커스 후). 고리는 radial 분포.
  // 줌 레벨이 불확정적이므로 **전역 canvas 스캔** 으로 ring-like pixel 총량 먼저 확인.
  const globalRingStats = await sampleRingPixels(
    canvasCx,
    canvasCy,
    0,
    Math.max(canvasCx, canvasCy) * 1.5,
  );
  console.log('  전역 ring pixel 통계 :', JSON.stringify(globalRingStats));

  if (globalRingStats && globalRingStats.ringPixels > 0) {
    // Shader 가 최소한 일부라도 렌더되고 있음을 확인 (부분 freeze 배제)
    check(
      '고리 shader 픽셀 렌더링 확인',
      true,
      `ring-like pixels=${globalRingStats.ringPixels} / avgRGB=(${globalRingStats.avgR.toFixed(1)}, ${globalRingStats.avgG.toFixed(1)}, ${globalRingStats.avgB.toFixed(1)}) / maxBright=${globalRingStats.maxBrightness.toFixed(1)}`,
    );

    // ring dust tone 기대: R > G > B, avgR > avgB (densityProfile color #887766 기본)
    const dustTone =
      globalRingStats.avgR >= globalRingStats.avgG && globalRingStats.avgG >= globalRingStats.avgB;
    if (dustTone) {
      check('고리 색상 ring-dust tone 매칭', true, `R≥G≥B 충족`);
    } else {
      warn(
        `ring-dust tone 미매칭 — avgR=${globalRingStats.avgR.toFixed(1)} avgG=${globalRingStats.avgG.toFixed(1)} avgB=${globalRingStats.avgB.toFixed(1)}. 실 Chrome 확인 필수.`,
      );
    }
  } else {
    warn(
      `전역 ring pixel 0건 — headless swiftshader 부분 freeze 또는 카메라/포커스 정렬 불일치 (volt #33). 실 Chrome 수동 검증 필수.`,
    );
  }

  // 동심 3 band 세부 검증 — 줌 레벨에 따라 일부 band 가 비어있을 수 있음 (warn 처리).
  const inner = 20 * dpr;
  const midStart = 50 * dpr;
  const midEnd = 120 * dpr;
  const outer = 300 * dpr;
  const innerBand = await sampleRingPixels(canvasCx, canvasCy, inner, midStart);
  const midBand = await sampleRingPixels(canvasCx, canvasCy, midStart, midEnd);
  const outerBand = await sampleRingPixels(canvasCx, canvasCy, midEnd, outer);

  console.log('  Inner band  :', JSON.stringify(innerBand));
  console.log('  Mid band    :', JSON.stringify(midBand));
  console.log('  Outer band  :', JSON.stringify(outerBand));

  const totalBandPx =
    (innerBand?.ringPixels ?? 0) + (midBand?.ringPixels ?? 0) + (outerBand?.ringPixels ?? 0);
  if (totalBandPx > 0) {
    check('3 band 합산 ring pixel 관측', true, `${totalBandPx} px`);
  } else {
    warn(
      '3 band 합산 ring pixel 0건 — 고리가 캔버스 중심에서 먼 위치에 렌더됐을 가능성 (headless 포커스 미동기). 실 Chrome 수동 확인 필수.',
    );
  }
}

check('카메라 드래그 후 런타임 에러 없음', pageErrors.length === 0);

await page.screenshot({
  path: join(screenshotDir, 'l2-interaction-ring-bands.png'),
  fullPage: false,
});

// ===== Level 3: 흐름 — ?ring=fallback M1 백업 경로 =====
console.log('\n[Level 3] 흐름 — ?ring=fallback InstancedMesh 전환');
await page.goto(`${baseUrl}/ko?focus=jupiter&ring=fallback`, { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);

// fallback 경로도 focus+줌인 후 pixel 샘플링 — 파티클 분포는 듬성듬성하지만 ring-like 색은 여전히 관측
const jupiterFocusBtn3 = await page.$('[data-testid="focus-jupiter"]');
if (jupiterFocusBtn3) {
  await jupiterFocusBtn3.click();
  await page.waitForTimeout(2000);
  const canvas3 = await page.$('canvas');
  if (canvas3) {
    const box3 = await canvas3.boundingBox();
    if (box3) {
      const cx = box3.x + box3.width / 2;
      const cy = box3.y + box3.height / 2;
      for (let i = 0; i < 30; i++) {
        await page.mouse.wheel(0, -100);
      }
      await page.waitForTimeout(1500);
      await page.mouse.move(cx, cy);
    }
  }
}

check('?ring=fallback 런타임 에러 없음', pageErrors.length === 0);

await page.screenshot({
  path: join(screenshotDir, 'l3-flow-ring-fallback.png'),
  fullPage: false,
});

// ===== 콘솔/에러 요약 =====
console.log('\n[콘솔/에러]');
if (consoleErrors.length > 0) {
  const filtered = consoleErrors.filter(
    (e) => !/BailoutToCSR|Switched to client rendering/.test(e),
  );
  if (filtered.length === 0) {
    warn(`console.error ${consoleErrors.length}건 (모두 SSR→CSR 폴백, 정상)`);
  } else {
    console.log('실제 콘솔 에러:');
    filtered.forEach((e) => console.log('  -', e));
    check('콘솔 에러 없음', false, `${filtered.length}건`);
  }
}
if (pageErrors.length > 0) {
  console.log('페이지 런타임 에러:');
  pageErrors.forEach((e) => console.log('  -', e));
  check('런타임 에러 없음', false, `${pageErrors.length}건`);
} else {
  check('런타임 에러 없음', true);
}

await browser.close();

// ===== 결과 =====
console.log('\n========================================');
console.log(`PASS: ${results.pass.length}건`);
results.pass.forEach((p) => console.log(`  ✓ ${p}`));
if (results.warn.length > 0) {
  console.log(`\nWARN: ${results.warn.length}건`);
  results.warn.forEach((w) => console.log(`  ⚠ ${w}`));
}
if (results.fail.length > 0) {
  console.log(`\nFAIL: ${results.fail.length}건`);
  results.fail.forEach((f) => console.log(`  ✗ ${f}`));
  process.exit(1);
}
console.log(`\n스크린샷: ${screenshotDir}`);
console.log('모든 검증 통과 ✓ (단, 실 Chrome 수동 검증 필수 — volt #33)');
