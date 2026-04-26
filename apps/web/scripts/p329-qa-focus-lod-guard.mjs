#!/usr/bin/env node
/**
 * R1 #329 — `?focus=<body>` 진입 시 LOD/billboard 회귀 검증 가드.
 *
 * 회귀 배경 (PR #332 QA 단계 발견):
 *   `?focus=sun` URL 진입 시 sun 이 화면 중앙에 거대 노란 **사각형 quad** 로 렌더되는 회귀.
 *   원인 — store `selectedBodyId` 변화가 scene `setFocusOrigin` 호출로 이어지지 않아
 *   `lodFromScreenCoverage` 의 `isFocused` 분기가 false → low billboard quad 가
 *   ×75 시각 과장과 곱해져 화면을 가득 채움. Phase 1 fix (`acfcb74`) 가
 *   `useSimStore.subscribe` + 마운트 직후 1회 sync 로 차단.
 *
 * 본 가드 — 동일 회귀가 향후 재발하면 즉시 FAIL.
 *
 * 검증 시그니처:
 *   1. `__simStore.getState().selectedBodyId === <body>` 동기화 확인
 *   2. `__solarScene.getLodStats().high >= 1` — focus body 가 high LOD 진입
 *   3. **billboard quad 시그니처 부재** — 화면 중앙 480×480 영역에서
 *      "균일 색 직사각형" 패턴이 임계 이상 차지하면 FAIL
 *      (billboard 는 카메라 정렬 plane 이라 음영 변화가 거의 없고 모서리가 직선).
 *      sphere 정상 시그니처 — luminance gradient (구체 음영) 존재.
 *
 * 사용법:
 *   BASE_URL=http://localhost:3000/en node apps/web/scripts/p329-qa-focus-lod-guard.mjs
 *   BASE_URL=http://localhost:3000/en node apps/web/scripts/p329-qa-focus-lod-guard.mjs --headed
 *   BASE_URL=http://localhost:3000/en node apps/web/scripts/p329-qa-focus-lod-guard.mjs --body=earth
 *
 * volt 근거: #33 (headless software WebGPU false positive) 변형 케이스 — headless
 * 베이스라인이 회귀 자체이면 baseline pixel diff 만으론 안 잡힌다. 본 가드는 시그니처
 * 기반이라 baseline 갱신 누락 위험 없음.
 *
 * **중요 — channel: 'chrome' 강제**:
 *   기본 chromium 은 swiftshader fallback 으로 detect-gpu-tier 가 'c' 판정 → LOD 'low'
 *   강제로 sun mesh 가 invisible + low billboard variant 가 ×75 sunScale 곱해져 거대
 *   사각형 quad 출력 (false positive 회귀 시그니처). 실 Chrome (channel: 'chrome') 은
 *   tier 'b' 이상이라 정상 sphere 렌더 — 본 가드가 보호하려는 사용자 환경.
 *   `--use-chromium` 플래그로 디버그 시 swiftshader 회귀를 일부러 재현 가능.
 */

import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACT_DIR = path.join(__dirname, '__artifacts__', 'p329-focus-lod');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000/en';

const args = process.argv.slice(2);
const flags = {
  headed: args.includes('--headed'),
  // 디버그 옵션 — 기본 chromium 사용 (swiftshader 재현). 운영 가드는 channel 'chrome' 강제.
  useChromium: args.includes('--use-chromium'),
  body: args.find((a) => a.startsWith('--body='))?.split('=')[1] ?? 'sun',
};

/**
 * 화면 중앙 영역 PNG 의 billboard quad 시그니처 검출.
 *
 * billboard quad 회귀 시그니처:
 *  - 균일 색 픽셀 비율 ≥ uniformRatioFail (음영 변화가 거의 없는 plane)
 *  - 또는 채워진 사각형 영역이 화면의 absoluteAreaFail 이상 차지
 *
 * sphere 정상 시그니처:
 *  - luminance gradient (음영) 존재 — 균일 비율 < uniformRatioFail
 *  - 둥근 윤곽 — 동일 색이 직선 경계로 끊어지지 않음
 *
 * @param {Buffer} pngBuffer 화면 중앙 480×480 영역 PNG
 * @returns {{ uniformRatio: number, brightCount: number, gradientStdev: number, verdict: 'sphere'|'billboard'|'unclear', reasons: string[] }}
 */
function analyzeFocusSignature(pngBuffer) {
  const png = PNG.sync.read(pngBuffer);
  const { width: w, height: h, data } = png;
  const total = w * h;

  // 노란 (focus body=sun) 또는 밝은 픽셀 (lum ≥ 180) 만 분석 대상.
  // 다른 body 면 brightness 임계는 동일하되 billboard 회귀는 색 무관 — 형태만으로 판정.
  const luminances = new Float32Array(total);
  let bright = 0;
  let lumSum = 0;
  let lumSqSum = 0;

  for (let i = 0; i < total; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    luminances[i] = lum;
    if (lum >= 180) {
      bright += 1;
      lumSum += lum;
      lumSqSum += lum * lum;
    }
  }

  if (bright < total * 0.001) {
    // 밝은 픽셀이 거의 없으면 focus body 자체가 보이지 않음 — 별도 검증 항목.
    return {
      uniformRatio: 0,
      brightCount: bright,
      gradientStdev: 0,
      verdict: 'unclear',
      reasons: [`bright pixels < 0.1% (focus body 자체 미가시 — selectedBodyId/scene sync 의심)`],
    };
  }

  // 밝은 픽셀들의 luminance 표준편차 — sphere 는 음영 변화로 stdev 가 크고, billboard quad 는
  // 거의 균일이라 stdev 가 작다.
  const lumMean = lumSum / bright;
  const lumVar = lumSqSum / bright - lumMean * lumMean;
  const gradientStdev = Math.sqrt(Math.max(0, lumVar));

  // 균일 색 비율 — 가장 흔한 luminance 버킷 (8 단위) 의 점유율.
  // billboard quad 는 단일 버킷이 80%+, sphere 는 음영으로 분산.
  const buckets = new Map();
  for (let i = 0; i < total; i++) {
    if (luminances[i] >= 180) {
      const bucket = Math.floor(luminances[i] / 8);
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    }
  }
  let topBucketCount = 0;
  for (const c of buckets.values()) if (c > topBucketCount) topBucketCount = c;
  const uniformRatio = topBucketCount / bright;

  // 직사각형 윤곽 검출 — bright pixels 의 bounding box 와 실제 채우기 비율 (fillRatio).
  // billboard quad: bbox 안 채우기 비율 ≥ 0.85 (사각형 가득), sphere: ~0.785 (π/4 = 원 면적/사각형).
  let minX = w,
    maxX = -1,
    minY = h,
    maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (luminances[y * w + x] >= 180) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const bboxArea = (maxX - minX + 1) * (maxY - minY + 1);
  const fillRatio = bboxArea > 0 ? bright / bboxArea : 0;

  // 판정 임계 — 보수적 (false positive 우려 낮은 쪽).
  // billboard quad 회귀: stdev < 12 (거의 균일) AND uniformRatio > 0.7 AND fillRatio > 0.85
  const reasons = [];
  reasons.push(`brightCount=${bright}/${total}`);
  reasons.push(`gradientStdev=${gradientStdev.toFixed(2)}`);
  reasons.push(`uniformRatio=${uniformRatio.toFixed(3)} (top bucket / bright)`);
  reasons.push(`fillRatio=${fillRatio.toFixed(3)} (bright / bbox)`);

  const isBillboardLike =
    gradientStdev < 12 && uniformRatio > 0.7 && fillRatio > 0.85 && bright > total * 0.05;

  if (isBillboardLike) {
    return {
      uniformRatio,
      brightCount: bright,
      gradientStdev,
      verdict: 'billboard',
      reasons: [
        ...reasons,
        '회귀 의심: billboard quad 시그니처 (저 stdev + 고 uniform + 고 fill).',
        '대응: sim-canvas 의 selectedBodyId ↔ setFocusOrigin sync 확인 (PR #332 Phase 1 fix).',
      ],
    };
  }

  return {
    uniformRatio,
    brightCount: bright,
    gradientStdev,
    verdict: 'sphere',
    reasons,
  };
}

function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function runFocusGuard(body) {
  ensureDirSync(ARTIFACT_DIR);

  const launchOpts = { headless: !flags.headed };
  if (!flags.useChromium) {
    // 운영 가드 — 실 Chrome 채널 강제 (사용자 환경과 동일 GPU adapter 경로).
    launchOpts.channel = 'chrome';
  }
  const browser = await chromium.launch(launchOpts);

  let allPass = true;
  const report = [];

  try {
    const viewports = [
      { id: '1280x720', width: 1280, height: 720 },
      { id: '375x667', width: 375, height: 667 },
    ];

    for (const vp of viewports) {
      console.log(`\n=== viewport ${vp.id} (${vp.width}×${vp.height}) — focus=${body} ===`);
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();

      const consoleErrors = [];
      page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const text = msg.text();
        // favicon.ico 404 — Next.js dev 환경 알려진 noise. R1 본 변경과 무관 (모든 PR 에서
        // 동일 발생). 회귀 가드 신호 오염 방지를 위해 제외.
        if (
          text.includes('Failed to load resource') &&
          msg.location()?.url?.includes('/favicon.ico')
        ) {
          return;
        }
        consoleErrors.push(text);
      });

      // research 모드 강제 — observe 모드는 SidePanels 숨김 (developer 보고).
      const url = `${BASE_URL}?mode=research&focus=${body}`;
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });

      // dev hooks 준비 대기.
      await page.waitForFunction(
        () =>
          typeof window.__simStore !== 'undefined' && typeof window.__solarScene !== 'undefined',
        { timeout: 10_000 },
      );

      // 추가 안정 대기 — focus sync + 첫 프레임 렌더 완료.
      await page.waitForTimeout(1500);

      // 1. store ↔ URL sync 검증.
      const storeState = await page.evaluate((target) => {
        const s = window.__simStore.getState();
        return { selectedBodyId: s.selectedBodyId, expected: target };
      }, body);
      const storeOk = storeState.selectedBodyId === body;
      console.log(
        `  ${storeOk ? '✓' : '✗'} store.selectedBodyId="${storeState.selectedBodyId}" (expected "${body}")`,
      );

      // 2. LOD stats — focus body 는 high LOD 진입해야 함.
      const lodStats = await page.evaluate(() => window.__solarScene.getLodStats());
      const lodOk = lodStats.high >= 1;
      console.log(
        `  ${lodOk ? '✓' : '✗'} LOD stats high=${lodStats.high} mid=${lodStats.mid} low=${lodStats.low} (high≥1 expected)`,
      );

      // 3. 화면 중앙 480×480 영역 캡처 + 시그니처 분석.
      // viewport 작으면 viewport 전체 (375×667 → 360×360).
      const cropSize = Math.min(480, vp.width - 40, vp.height - 40);
      const cx = Math.floor(vp.width / 2 - cropSize / 2);
      const cy = Math.floor(vp.height / 2 - cropSize / 2);
      const buffer = await page.screenshot({
        clip: { x: cx, y: cy, width: cropSize, height: cropSize },
        type: 'png',
      });
      const artifactPath = path.join(ARTIFACT_DIR, `${vp.id}-${body}.png`);
      fs.writeFileSync(artifactPath, buffer);

      const sig = analyzeFocusSignature(buffer);
      const sigOk = sig.verdict === 'sphere';
      console.log(`  ${sigOk ? '✓' : '✗'} signature.verdict=${sig.verdict}`);
      for (const r of sig.reasons) console.log(`     - ${r}`);
      console.log(`     artifact: ${path.relative(process.cwd(), artifactPath)}`);

      // 4. 콘솔 에러.
      const consoleOk = consoleErrors.length === 0;
      console.log(`  ${consoleOk ? '✓' : '✗'} console errors: ${consoleErrors.length}`);
      for (const e of consoleErrors) console.log(`     - ${e}`);

      const viewportPass = storeOk && lodOk && sigOk && consoleOk;
      if (!viewportPass) allPass = false;
      report.push({ viewport: vp.id, body, storeOk, lodOk, sigOk, consoleOk, signature: sig });

      await context.close();
    }
  } finally {
    await browser.close();
  }

  console.log('\n=== 요약 ===');
  console.log(`overall: ${allPass ? 'PASS' : 'FAIL'}`);
  return { allPass, report };
}

const { allPass } = await runFocusGuard(flags.body);
process.exit(allPass ? 0 : 1);
