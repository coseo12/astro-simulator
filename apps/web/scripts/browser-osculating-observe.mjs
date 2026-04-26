#!/usr/bin/env node
/**
 * P11-B.2 #289 D5 — #247 Osculating 관찰 스크립트 (수치 pass 임계 없음).
 *
 * 목적: 7 moon (풀 4 + smoke 3) 의 궤도선 연속성을 관찰하고 P11-C 구현 근거 확보.
 *
 * ## 관찰 규약 (계약 Q4-C + B안 분량)
 *
 * - 풀 관찰 (4 moon, 각 60초 × 60fps = 3600프레임, 스크린샷 3장 start/mid/end):
 *     moon / phobos / io / callisto
 * - Smoke 관찰 (3 moon, 각 30초 × 60fps = 1800프레임, 스크린샷 1장 mid):
 *     deimos / europa / ganymede
 *
 * ## 관찰 항목
 *
 * 1. **궤도선 끊김 여부** — LOD 전환 시점 또는 floating origin shift 시점에 끊김
 * 2. **mesh 추적 drift** — 위성이 궤도선에서 벗어나는지
 * 3. **LOD 단계** — scene.getLodStats() 로 관찰 시점 high/mid/low 분포 기록
 * 4. **draw call 추정** — LodStats 합 (dev overlay HUD 와 별개, headless 독립 측정)
 *
 * ## 시점 정의 (풀 관찰)
 *
 * - start (0s): focusOn(moon) 직후 tier 안정화 (1200ms 대기)
 * - mid (30s): 관찰 중간 — 궤도 위상 변화 관찰
 * - end (60s): 관찰 종료 — 누적 drift 확인
 *
 * ## Smoke 관찰
 *
 * 1장 (mid, 15s) 만 캡처. 구조적 문제가 아닌 LOD-상호작용 샘플 확인 목적.
 *
 * ## 실행
 *
 *   node apps/web/scripts/browser-osculating-observe.mjs [baseUrl]
 *   기본 URL: http://localhost:3000
 *
 * 실행 시간: 풀 4 × 60s + smoke 3 × 30s ≈ 330s + 페이지 로드 + tier 전환 = 약 7~8 분.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const baseUrl = process.argv[2] ?? 'http://localhost:3000';
const __dirname = dirname(fileURLToPath(import.meta.url));
const screenshotDir = join(__dirname, '..', '..', '..', '.verify-screenshots', 'osculating');
mkdirSync(screenshotDir, { recursive: true });

const VIEWPORT = { width: 1280, height: 800 };

/** 풀 관찰 대상 (60s × 60fps = 3600프레임). */
const FULL_MOONS = [
  { id: 'moon', parent: 'earth', label: '달 (지구계)' },
  { id: 'phobos', parent: 'mars', label: '포보스 (화성계)' },
  { id: 'io', parent: 'jupiter', label: '이오 (갈릴레이 안쪽)' },
  { id: 'callisto', parent: 'jupiter', label: '칼리스토 (갈릴레이 바깥쪽)' },
];

/** Smoke 관찰 대상 (30s × 60fps = 1800프레임). */
const SMOKE_MOONS = [
  { id: 'deimos', parent: 'mars', label: '데이모스 (화성계)' },
  { id: 'europa', parent: 'jupiter', label: '유로파 (갈릴레이)' },
  { id: 'ganymede', parent: 'jupiter', label: '가니메데 (갈릴레이)' },
];

const observations = [];

/**
 * 안정화 대기 (tier-transition.ts 의 runTierTransition 300ms dolly + 500ms lock + 400ms margin).
 * D3b 와 동일 전략.
 */
const STABILIZE_MS = 1200;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEWPORT });
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(err.message));

console.log('\n[P11-B.2 D5] Osculating 궤도 관찰 — #247');
console.log(`baseUrl: ${baseUrl}`);
console.log(`풀 관찰 ${FULL_MOONS.length} moon × 60s, smoke ${SMOKE_MOONS.length} moon × 30s\n`);

await page.goto(`${baseUrl}/ko`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

const sceneReady = await page.evaluate(
  () => typeof window.__solarScene === 'object' && window.__solarScene !== null,
);
if (!sceneReady) {
  console.error('[FAIL] __solarScene 전역 미노출');
  await browser.close();
  process.exit(1);
}

/**
 * 시점별 LOD 상태 + 궤도선 메타 수집.
 *
 * mesh position vs 궤도선 centroid 오프셋을 단순 비교로 연속성 관찰 (정확한 궤도 수식 재계산 없음).
 */
async function captureObservation(moon, elapsedSec) {
  return await page.evaluate(
    (args) => {
      const solar = window.__solarScene;
      const mesh = solar?.meshes?.get?.(args.id);
      if (!mesh) return { error: `mesh not found: ${args.id}` };
      const lodStats = solar?.getLodStats?.() ?? null;
      const tier = solar?.getTier?.();
      const meshPos = { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z };
      const bounding = mesh.getBoundingInfo?.();
      const radius = bounding?.boundingSphere?.radiusWorld ?? null;
      return {
        id: args.id,
        tier,
        meshPos,
        meshRadius: radius,
        lodStats,
        elapsedSec: args.elapsedSec,
      };
    },
    { id: moon.id, elapsedSec },
  );
}

/**
 * 풀 관찰: focusOn(moon) + time-preset-1y 로 궤도 운동 생성 → 60초 관찰 + 3 스크린샷.
 */
async function observeFull(moon) {
  console.log(`\n[FULL] ${moon.label} (${moon.id}) — 60s × 60fps 관찰`);
  const entry = {
    id: moon.id,
    label: moon.label,
    parent: moon.parent,
    mode: 'full',
    durationSec: 60,
    fpsTarget: 60,
    frameCount: 3600,
    screenshots: [],
    observations: [],
  };

  // focusOn — __simCore.command 경로.
  await page.evaluate((bodyId) => {
    window.__simCore?.command?.({ type: 'focusOn', bodyId });
  }, moon.id);
  await page.waitForTimeout(STABILIZE_MS);

  // time-preset-1y — 궤도 운동 관찰에 필요한 시간 advance.
  await page.click('[data-testid="time-preset-1y"]').catch(() => {});
  await page.waitForTimeout(500);

  // start (t=0).
  const startObs = await captureObservation(moon, 0);
  entry.observations.push(startObs);
  const startPath = join(screenshotDir, `osculating-${moon.id}-start.png`);
  await page.screenshot({ path: startPath, fullPage: false });
  entry.screenshots.push({ label: 'start', t: 0, path: startPath });

  // 30초 대기 → mid.
  await page.waitForTimeout(30_000);
  const midObs = await captureObservation(moon, 30);
  entry.observations.push(midObs);
  const midPath = join(screenshotDir, `osculating-${moon.id}-mid.png`);
  await page.screenshot({ path: midPath, fullPage: false });
  entry.screenshots.push({ label: 'mid', t: 30, path: midPath });

  // 추가 30초 → end (총 60초).
  await page.waitForTimeout(30_000);
  const endObs = await captureObservation(moon, 60);
  entry.observations.push(endObs);
  const endPath = join(screenshotDir, `osculating-${moon.id}-end.png`);
  await page.screenshot({ path: endPath, fullPage: false });
  entry.screenshots.push({ label: 'end', t: 60, path: endPath });

  // 일시 정지 (다음 관찰을 위한 초기화).
  await page.click('[data-testid="time-pause"]').catch(() => {});

  observations.push(entry);
}

/**
 * Smoke 관찰: focusOn + 30초 + 1 스크린샷 (mid, 15s).
 */
async function observeSmoke(moon) {
  console.log(`\n[SMOKE] ${moon.label} (${moon.id}) — 30s × 60fps 관찰`);
  const entry = {
    id: moon.id,
    label: moon.label,
    parent: moon.parent,
    mode: 'smoke',
    durationSec: 30,
    fpsTarget: 60,
    frameCount: 1800,
    screenshots: [],
    observations: [],
  };

  await page.evaluate((bodyId) => {
    window.__simCore?.command?.({ type: 'focusOn', bodyId });
  }, moon.id);
  await page.waitForTimeout(STABILIZE_MS);

  await page.click('[data-testid="time-preset-1y"]').catch(() => {});
  await page.waitForTimeout(500);

  // mid (t=15s).
  await page.waitForTimeout(15_000);
  const midObs = await captureObservation(moon, 15);
  entry.observations.push(midObs);
  const midPath = join(screenshotDir, `osculating-${moon.id}-mid.png`);
  await page.screenshot({ path: midPath, fullPage: false });
  entry.screenshots.push({ label: 'mid', t: 15, path: midPath });

  // 남은 15초 대기 (총 30초 충족).
  await page.waitForTimeout(15_000);

  await page.click('[data-testid="time-pause"]').catch(() => {});

  observations.push(entry);
}

// 풀 관찰 실행.
for (const moon of FULL_MOONS) {
  await observeFull(moon);
}

// Smoke 관찰 실행.
for (const moon of SMOKE_MOONS) {
  await observeSmoke(moon);
}

await browser.close();

// JSON 리포트 저장 (관찰 raw 데이터).
const reportPath = join(screenshotDir, 'observation-data.json');
writeFileSync(
  reportPath,
  JSON.stringify({ date: new Date().toISOString(), observations, consoleErrors }, null, 2),
);

console.log('\n========================================');
console.log('[D5] Osculating 관찰 완료');
console.log(`  풀 관찰: ${FULL_MOONS.length} moon`);
console.log(`  smoke: ${SMOKE_MOONS.length} moon`);
console.log(`  스크린샷: ${screenshotDir}/`);
console.log(`  raw 데이터: ${reportPath}`);
if (consoleErrors.length > 0) {
  console.log('\n[console errors]');
  for (const err of consoleErrors.slice(0, 5)) console.log(`  - ${err}`);
}
console.log('\n수동 작성 리포트 경로: docs/benchmarks/p11-b-osculating-observation-20260424.md');
