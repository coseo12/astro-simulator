#!/usr/bin/env node
/**
 * P11-B.2 #289 D3b — LOD Screenshot diff E2E.
 *
 * 목적: 3 tier × 3 LOD = 9 조합의 baseline 스크린샷을 캡처하고, 이후 변경 PR 이
 * baseline 대비 max pixel diff < 15% 를 유지하는지 회귀 가드한다.
 *
 * 사용:
 *   node apps/web/scripts/browser-verify-lod.mjs [baseUrl] [--update-baseline]
 *   기본 URL: http://localhost:3001
 *
 *   --update-baseline  : baseline 재생성 (최초 1회 또는 의도적 시각 변경 시 PR 본문에 근거 박제)
 *
 * ## 구조
 *
 *  - 3 tier: solar / inner / body
 *      - solar: 태양 focus (__solarScene.getTier() === 'solar' 보장)
 *      - inner: 화성 focus (inner 또는 body 경로 허용 — planet focus 거리 임계)
 *      - body:  지구 focus + 추가 zoom-in (body tier 강제)
 *  - 3 LOD: high / mid / low (__solarScene.setLodOverride(level))
 *  - 9 조합 = 3 tier × 3 LOD
 *
 * ## state.transitioning 대안 (R4 — flag 부재)
 *
 * B.1 머지 결과에서 scene 전역에 `state.transitioning` flag 는 **노출되지 않았다**.
 * `tier-transition.ts` 의 `runTierTransition` 은 camera.radius 300ms dolly + 500ms 입력 잠금 +
 * 200ms 마진 으로 총 800~1000ms 안정화. LOD 분기는 mesh.scaling / mesh.position 이 **즉시**
 * 반영되므로 camera.radius interp 만 LOD 결과에 영향 (screenCoverage ∝ 1/radius). 따라서
 * tier 변경 명령 후 **1200ms 대기** (300+500+400 margin) 로 transitioning 경과. LOD override
 * 변경 후에도 400ms 안정화 대기.
 *
 * 이 대안은 R4 "부재 시 architect 경량 자문" 을 대체 — `runTierTransition` 내부 타이밍 상수
 * (300/500) 는 tier-transition.ts 수식 주석 박제. 향후 scene 에 `state.transitioning` 을 정식
 * export 하면 polling 기반 대기로 개선 가능 (후속 이슈 후보).
 *
 * ## pixel diff 방식
 *
 * pixelmatch + pngjs 로 baseline PNG 와 현재 screenshot PNG 의 pixel-level diff 를 계산.
 *  - threshold 0.1 (매칭 민감도) — 미세 anti-alias 변동 흡수
 *  - max diff pct = (diffPixels / totalPixels) × 100
 *  - DoD: 각 조합 max diff < 15% (계약 Q2-A)
 *
 * ## headless swiftshader freeze 완화 (volt #33)
 *
 * 3D/shader 경로 + headless 환경에서 partial freeze 가능성. 본 스크립트는 수치 검증
 * (diff pct) 만 수행하며, 시각 실 Chrome 검증은 `README` 수동 체크리스트로 보완.
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const baseUrl = process.argv[2]?.startsWith('--')
  ? 'http://localhost:3001'
  : (process.argv[2] ?? 'http://localhost:3001');
const updateBaseline = process.argv.includes('--update-baseline');

const __dirname = dirname(fileURLToPath(import.meta.url));
const baselineDir = join(__dirname, '__baselines__');
const diffDir = join(__dirname, '..', '..', '..', '.verify-screenshots', 'lod-diff');
mkdirSync(baselineDir, { recursive: true });
mkdirSync(diffDir, { recursive: true });

const VIEWPORT = { width: 1280, height: 800 };

// DoD 임계값 (계약 Q2-A).
const MAX_DIFF_PCT_THRESHOLD = 15.0;

// 9 조합 매트릭스.
const COMBOS = [
  { tier: 'solar', lod: 'high' },
  { tier: 'solar', lod: 'mid' },
  { tier: 'solar', lod: 'low' },
  { tier: 'inner', lod: 'high' },
  { tier: 'inner', lod: 'mid' },
  { tier: 'inner', lod: 'low' },
  { tier: 'body', lod: 'high' },
  { tier: 'body', lod: 'mid' },
  { tier: 'body', lod: 'low' },
];

/**
 * tier 별 focus body id. FocusQuickButtons 는 sun/earth/jupiter/neptune 4개만 노출하므로
 * mars (inner tier 대표) 는 __simCore.command 로 직접 호출.
 *  - solar: 태양 focus → tier='solar'
 *  - inner: 화성 focus → tier='inner' (planet focus 거리 임계)
 *  - body:  지구 focus + setTier('body') 강제
 */
const TIER_FOCUS_BODY = {
  solar: 'sun',
  inner: 'mars',
  body: 'earth',
};

const results = [];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEWPORT });
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(err.message));

console.log('\n[P11-B.2 D3b] LOD Screenshot diff E2E — 9 조합');
console.log(`baseUrl: ${baseUrl}`);
console.log(`updateBaseline: ${updateBaseline}`);
console.log(`threshold: max diff < ${MAX_DIFF_PCT_THRESHOLD}%\n`);

await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// __solarScene 노출 확인
const sceneReady = await page.evaluate(
  () => typeof window.__solarScene === 'object' && window.__solarScene !== null,
);
if (!sceneReady) {
  console.error('[FAIL] __solarScene 전역 미노출 — dev 빌드 아님 또는 초기화 실패');
  await browser.close();
  process.exit(1);
}

/**
 * tier + LOD 조합 적용 후 안정화 대기 → screenshot 캡처 → baseline diff.
 *
 * @param {{ tier: string, lod: string }} combo
 * @returns {Promise<{ combo: string, diffPct: number, pass: boolean, reason: string }>}
 */
async function runCombo(combo) {
  const key = `${combo.tier}-${combo.lod}`;
  const baselinePath = join(baselineDir, `lod-${key}.png`);

  // 1. focus 전환 → __simCore.command 로 직접 호출 (FocusQuickButtons 는 4개만 노출).
  //    tier-transition.ts 의 runTierTransition 은 300ms dolly + 500ms lock 보장.
  //    추가 400ms margin 으로 animating 상태 완전 경과 (state.transitioning flag 부재 대안 — 파일 상단 주석 참조).
  const focusBodyId = TIER_FOCUS_BODY[combo.tier];
  const focusResult = await page.evaluate((bodyId) => {
    if (!window.__simCore || typeof window.__simCore.command !== 'function') {
      return { ok: false, reason: '__simCore.command 미노출' };
    }
    try {
      window.__simCore.command({ type: 'focusOn', bodyId });
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: String(err) };
    }
  }, focusBodyId);
  if (!focusResult.ok) {
    return {
      combo: key,
      diffPct: 100,
      pass: false,
      reason: `focus 실패 (${focusBodyId}): ${focusResult.reason}`,
    };
  }
  await page.waitForTimeout(1200);

  // 2. body tier 는 추가 zoom-in 필요 — focus-earth 만으로는 inner 로 남을 수 있음.
  //    지구 반경 × 5 공식이 body tier 판정 거리 (0.1 AU 임계 이하로 진입).
  if (combo.tier === 'body') {
    // scene API 로 직접 tier 강제 (테스트 안정성 우선).
    await page.evaluate(() => {
      window.__solarScene?.setTier?.('body');
    });
    await page.waitForTimeout(1200);
  }

  // 실제 tier 확인 (solar 는 확정, inner/body 는 허용 범위 넓게)
  const actualTier = await page.evaluate(() => window.__solarScene?.getTier?.());
  if (combo.tier === 'solar' && actualTier !== 'solar') {
    return {
      combo: key,
      diffPct: 100,
      pass: false,
      reason: `tier solar 전환 실패 (실제: ${actualTier})`,
    };
  }

  // 3. LOD override 설정 + 안정화 대기.
  await page.evaluate((lod) => {
    window.__solarScene?.setLodOverride?.(lod);
  }, combo.lod);
  // LOD 는 매 프레임 즉시 반영되지만 200ms cross-fade 가 있으므로 400ms 대기.
  await page.waitForTimeout(400);

  // 4. screenshot 캡처.
  const screenshotBuffer = await page.screenshot({ type: 'png', fullPage: false });

  // 5. baseline 처리: 없으면 생성, 있으면 diff.
  if (!existsSync(baselinePath) || updateBaseline) {
    writeFileSync(baselinePath, screenshotBuffer);
    return {
      combo: key,
      diffPct: 0,
      pass: true,
      reason: updateBaseline ? 'baseline 갱신' : 'baseline 신규 생성',
    };
  }

  // 6. pixelmatch diff.
  const currentPng = PNG.sync.read(screenshotBuffer);
  const baselinePng = PNG.sync.read(readFileSync(baselinePath));

  if (currentPng.width !== baselinePng.width || currentPng.height !== baselinePng.height) {
    return {
      combo: key,
      diffPct: 100,
      pass: false,
      reason: `viewport 크기 불일치: baseline ${baselinePng.width}x${baselinePng.height} vs current ${currentPng.width}x${currentPng.height}`,
    };
  }

  const { width, height } = currentPng;
  const diffPng = new PNG({ width, height });
  const diffPixels = pixelmatch(baselinePng.data, currentPng.data, diffPng.data, width, height, {
    threshold: 0.1,
    includeAA: false,
  });
  const totalPixels = width * height;
  const diffPct = (diffPixels / totalPixels) * 100;

  // diff 시각화 PNG 는 .verify-screenshots/lod-diff/ 에 저장 (커밋 대상 아님, 디버그 용도)
  const diffPath = join(diffDir, `lod-${key}-diff.png`);
  writeFileSync(diffPath, PNG.sync.write(diffPng));

  return {
    combo: key,
    diffPct,
    pass: diffPct < MAX_DIFF_PCT_THRESHOLD,
    reason:
      diffPct < MAX_DIFF_PCT_THRESHOLD
        ? `diff ${diffPct.toFixed(2)}% < ${MAX_DIFF_PCT_THRESHOLD}%`
        : `diff ${diffPct.toFixed(2)}% ≥ ${MAX_DIFF_PCT_THRESHOLD}% (회귀)`,
  };
}

for (const combo of COMBOS) {
  const result = await runCombo(combo);
  results.push(result);
  const mark = result.pass ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${result.combo}: ${result.reason}`);
}

await browser.close();

// 최종 리포트.
console.log('\n========================================');
console.log('[D3b] LOD Screenshot diff 결과');
console.log('----------------------------------------');
const passCount = results.filter((r) => r.pass).length;
const failCount = results.length - passCount;
const maxDiffPct = Math.max(...results.map((r) => r.diffPct));

console.log(`  pass: ${passCount}/${results.length}`);
console.log(`  fail: ${failCount}`);
console.log(`  max diff: ${maxDiffPct.toFixed(2)}%`);
console.log(`  threshold: ${MAX_DIFF_PCT_THRESHOLD}%`);

if (consoleErrors.length > 0) {
  console.log('\n[console errors]');
  for (const err of consoleErrors) console.log(`  - ${err}`);
}

if (failCount > 0) {
  console.error('\n[FAIL] 1개 이상 조합이 임계 초과 또는 오류');
  process.exit(1);
}
console.log('\n[PASS] 9 조합 전체 통과\n');
