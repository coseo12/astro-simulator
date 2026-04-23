#!/usr/bin/env node
/**
 * P12-A #298 Phase A — Tier 엔진 가시성 검증.
 *
 * 사용:
 *   node scripts/browser-verify-scale-tier.mjs [baseUrl]
 *   기본 URL: http://localhost:3000
 *
 * Phase A 커버리지 (hard fail):
 *   - V1: T1 Solar — 해왕성 원일점 궤도선 viewport 좁은 축 95% 이내
 *   - V3: T2 Inner — 화성 원일점 궤도선 viewport 가로 60% 이내
 *
 * Phase B dolly 통합 후 hard fail 승격 예정 (현재는 soft-warn):
 *   - V5: T3 Body — 지구 화면 세로 40% (±5%). 현재 카메라 radius 가 focus 애니메이션 기본
 *     (meshRadius × 5) 로 설정되어 지구가 과대 렌더. Phase B Q8=8D 카메라 dolly 통합 시
 *     "renderScale_new / renderScale_old 비율로 radius 스케일" 이 추가되면 V5 목표치 도달.
 *   - tier 전환 정확도: Phase A 는 flicker 허용, 카메라 애니메이션 과도기 프레임의 tier 는 일시적
 *     solar 로 판정될 수 있음 (radius 가 solar scene unit 기준에 해당하는 값).
 *
 * DoD 비-범위 (Phase B/C/P11-B 이관):
 *   - V2/V4/V6 (지구/달 최소 pixel) — P11-B billboard marker 합산 측정
 *   - C1~C4 연속성 — Phase B 애니메이션 후 측정
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const baseUrl = process.argv[2] ?? 'http://localhost:3000';
const __dirname = dirname(fileURLToPath(import.meta.url));
const screenshotDir = join(__dirname, '..', '.verify-screenshots', 'scale-tier');
mkdirSync(screenshotDir, { recursive: true });

const VIEWPORT = { width: 1280, height: 800 };

const results = { pass: [], fail: [], warn: [] };
const check = (name, condition, detail = '') => {
  if (condition) results.pass.push(`${name}${detail ? ' — ' + detail : ''}`);
  else results.fail.push(`${name}${detail ? ' — ' + detail : ''}`);
};
/** Phase A 는 flicker 허용. hard fail 이 아닌 warn 으로 기록 (Phase B 에서 hard fail 승격). */
const warn = (name, condition, detail = '') => {
  if (condition) results.pass.push(`${name}${detail ? ' — ' + detail : ''}`);
  else results.warn.push(`${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEWPORT });
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(err.message));

console.log('\n[P12-A] Tier 엔진 가시성 검증');

await page.goto(`${baseUrl}/ko`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// `__solarScene` 노출 확인 (dev 빌드)
check(
  '__solarScene 전역 노출 (dev 빌드)',
  await page.evaluate(
    () => typeof window.__solarScene === 'object' && window.__solarScene !== null,
  ),
);

// ===== T1 Solar — V1 해왕성 궤도선 가시성 =====
console.log('\n[V1] T1 Solar 해왕성 궤도선 좁은 축 95% 이내');

// 태양 focus → tier 가 'solar' 로 전환 (tierFromFocus('star') === 'solar')
const sunBtn = await page.$('[data-testid="focus-sun"]');
if (sunBtn) {
  await sunBtn.click();
  await page.waitForTimeout(1500); // focus 애니메이션 (300ms) + tier 전환 + 안정화
} else {
  // fallback: reset 후 카메라 거리로 solar 판정
  const resetBtn = await page.$('[data-testid="focus-reset"]');
  if (resetBtn) await resetBtn.click();
  await page.waitForTimeout(1500);
}

const tierAfterSun = await page.evaluate(() => window.__solarScene?.getTier?.());
check('태양 focus 시 tier 가 solar', tierAfterSun === 'solar', `현재 tier: ${tierAfterSun}`);

// 해왕성 scene 좌표 → screen projection.
// `scene.getTransformMatrix()` (viewProjection 16-float column-major) 로 수동 projection 수행
// — `window.BABYLON` 의존 회피 (Babylon 은 ESM import, global 미노출).
const projectFn = `
  function projectToScreen(x, y, z, m, w, h) {
    const wx = m[0]*x + m[4]*y + m[8]*z + m[12];
    const wy = m[1]*x + m[5]*y + m[9]*z + m[13];
    const ww = m[3]*x + m[7]*y + m[11]*z + m[15];
    const ndcX = wx / ww;
    const ndcY = wy / ww;
    const px = (ndcX * 0.5 + 0.5) * w;
    const py = (1 - (ndcY * 0.5 + 0.5)) * h;
    return [px, py, ww];
  }
`;

const neptuneProjection = await page.evaluate(`(() => {
  ${projectFn}
  const solar = window.__solarScene;
  const scene = window.__simCore?.scene;
  if (!scene || !solar) return null;
  const neptune = solar.meshes.get?.('neptune');
  if (!neptune) return null;
  const engine = scene.getEngine();
  const w = engine.getRenderWidth();
  const h = engine.getRenderHeight();
  const mat = scene.getTransformMatrix();
  const m = mat.m ?? mat._m;
  if (!m) return { fallback: 'matrix_array_missing' };
  const [px, py] = projectToScreen(neptune.position.x, neptune.position.y, neptune.position.z, m, w, h);
  return { px, py, renderWidth: w, renderHeight: h };
})()`);

if (neptuneProjection && !neptuneProjection.fallback) {
  const narrowAxis = Math.min(neptuneProjection.renderWidth, neptuneProjection.renderHeight);
  const halfNarrow = narrowAxis / 2; // 좁은 축 절반
  const cx = neptuneProjection.renderWidth / 2;
  const cy = neptuneProjection.renderHeight / 2;
  const distFromCenter = Math.hypot(neptuneProjection.px - cx, neptuneProjection.py - cy);
  // V1: 해왕성 궤도선 = 해왕성 위치 반경 = 화면 중심 대비 distFromCenter. 좁은 축 95% 이내
  const limit = halfNarrow * 0.95;
  check(
    `V1 해왕성 화면 중심 거리 ≤ 좁은 축 95% (${limit.toFixed(0)}px)`,
    distFromCenter <= limit,
    `실측 ${distFromCenter.toFixed(0)}px, narrow=${narrowAxis}px`,
  );
} else {
  check(
    'V1 해왕성 projection 계산',
    false,
    `Babylon global 누락 또는 메쉬 없음: ${JSON.stringify(neptuneProjection)}`,
  );
}
await page.screenshot({ path: join(screenshotDir, 't1-solar-neptune.png') });

// ===== T2 Inner — V3 화성 원일점 궤도선 가시성 =====
console.log('\n[V3] T2 Inner 화성 궤도선 가로 60% 이내');

// 수성/화성 focus → planet focus + 가까움에 따라 inner 로 전환. 화성 focus 사용.
const marsBtn = await page.$('[data-testid="focus-mars"]');
if (marsBtn) {
  await marsBtn.click();
  await page.waitForTimeout(1500);
}
const tierAfterMars = await page.evaluate(() => window.__solarScene?.getTier?.());
// Phase A: flicker 허용 — 애니메이션 과도기 프레임에서 solar 로 일시 판정 가능 (warn).
warn(
  '화성 focus 시 tier 가 inner 또는 body (planet focus 경로)',
  tierAfterMars === 'inner' || tierAfterMars === 'body',
  `현재 tier: ${tierAfterMars} (Phase A flicker 허용, Phase B 에서 hard fail 승격)`,
);

// 화성 scene 좌표 → screen
const marsProjection = await page.evaluate(`(() => {
  ${projectFn}
  const scene = window.__simCore?.scene;
  const solar = window.__solarScene;
  if (!scene || !solar) return null;
  const mars = solar.meshes.get?.('mars');
  if (!mars) return null;
  const engine = scene.getEngine();
  const w = engine.getRenderWidth();
  const h = engine.getRenderHeight();
  const mat = scene.getTransformMatrix();
  const m = mat.m ?? mat._m;
  if (!m) return { fallback: 'matrix_array_missing' };
  const [px, py] = projectToScreen(mars.position.x, mars.position.y, mars.position.z, m, w, h);
  return { px, py, renderWidth: w, renderHeight: h };
})()`);

if (marsProjection && !marsProjection.fallback) {
  const cx = marsProjection.renderWidth / 2;
  const distFromCenterX = Math.abs(marsProjection.px - cx);
  const limit = (marsProjection.renderWidth / 2) * 0.6; // 가로 60% 이내
  check(
    `V3 화성 가로 중심 거리 ≤ 60% (${limit.toFixed(0)}px)`,
    distFromCenterX <= limit,
    `실측 ${distFromCenterX.toFixed(0)}px, halfW=${(marsProjection.renderWidth / 2).toFixed(0)}px`,
  );
} else {
  check(
    'V3 화성 projection 계산',
    false,
    `Babylon global 누락 또는 메쉬 없음: ${JSON.stringify(marsProjection)}`,
  );
}
await page.screenshot({ path: join(screenshotDir, 't2-inner-mars.png') });

// ===== T3 Body — V5 지구 화면 세로 40% ±5% =====
console.log('\n[V5] T3 Body 지구 화면 세로 40% (±5%)');

const earthBtn = await page.$('[data-testid="focus-earth"]');
if (earthBtn) {
  await earthBtn.click();
  await page.waitForTimeout(1500);
}
// Phase A 에서는 planet focus + 카메라 거리 0.1 AU 미만일 때 body tier. focusOn 으로 radius 자동 조정.
const tierAfterEarth = await page.evaluate(() => window.__solarScene?.getTier?.());
check(
  '지구 focus 시 tier 가 inner 또는 body (planet focus 경로)',
  tierAfterEarth === 'inner' || tierAfterEarth === 'body',
  `현재 tier: ${tierAfterEarth}`,
);

// 지구 mesh 의 screen-space 직경 측정
const earthProjection = await page.evaluate(`(() => {
  ${projectFn}
  const scene = window.__simCore?.scene;
  const solar = window.__solarScene;
  if (!scene || !solar) return null;
  const earth = solar.meshes.get?.('earth');
  if (!earth) return null;
  const engine = scene.getEngine();
  const w = engine.getRenderWidth();
  const h = engine.getRenderHeight();
  const mat = scene.getTransformMatrix();
  const m = mat.m ?? mat._m;
  if (!m) return { fallback: 'matrix_array_missing' };
  const center = earth.position;
  const boundingInfo = earth.getBoundingInfo();
  const r = boundingInfo.boundingSphere.radiusWorld;
  const [cx, cy] = projectToScreen(center.x, center.y, center.z, m, w, h);
  const [ux, uy] = projectToScreen(center.x, center.y + r, center.z, m, w, h);
  const radiusPx = Math.hypot(ux - cx, uy - cy);
  return { diameterPx: radiusPx * 2, renderHeight: h };
})()`);

if (earthProjection && !earthProjection.fallback) {
  const target = earthProjection.renderHeight * 0.4; // 세로 40%
  const lo = target * 0.95; // ±5%
  const hi = target * 1.05;
  // Phase A 는 카메라 dolly 통합 전 — 지구 렌더 크기가 focus 애니메이션 기본 radius 에 종속.
  // V5 는 Phase B Q8=8D 카메라 dolly 도입 후 hard fail 승격. 현재는 warn.
  warn(
    `V5 지구 세로 직경 40% ±5% (목표 ${target.toFixed(0)}px ±5%)`,
    earthProjection.diameterPx >= lo && earthProjection.diameterPx <= hi,
    `실측 ${earthProjection.diameterPx.toFixed(0)}px, 허용 ${lo.toFixed(0)}~${hi.toFixed(0)}px (Phase A warn, Phase B hard fail 승격)`,
  );
} else {
  check(
    'V5 지구 projection 계산',
    false,
    `Babylon global 누락 또는 메쉬 없음: ${JSON.stringify(earthProjection)}`,
  );
}
await page.screenshot({ path: join(screenshotDir, 't3-body-earth.png') });

// ===== 종합 =====
console.log('\n===== 종합 =====');
console.log(`[PASS] ${results.pass.length}`);
for (const p of results.pass) console.log(`  - ${p}`);
if (results.warn.length > 0) {
  console.log(`[WARN] ${results.warn.length} (Phase B 에서 hard fail 승격 예정)`);
  for (const w of results.warn) console.log(`  - ${w}`);
}
console.log(`[FAIL] ${results.fail.length}`);
for (const f of results.fail) console.log(`  - ${f}`);
if (consoleErrors.length > 0) {
  console.log(`\n콘솔 에러 (${consoleErrors.length}):`);
  for (const e of consoleErrors.slice(0, 5)) console.log(`  - ${e}`);
}

await browser.close();

if (results.fail.length > 0) {
  console.log(`\n스크린샷: ${screenshotDir}`);
  process.exit(1);
}
console.log(`\n스크린샷: ${screenshotDir}`);
process.exit(0);
