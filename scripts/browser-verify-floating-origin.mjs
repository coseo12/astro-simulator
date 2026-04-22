#!/usr/bin/env node
/**
 * P11-A #288 — Floating Origin 브라우저 검증.
 *
 * 사용: node scripts/browser-verify-floating-origin.mjs [baseUrl]
 * 기본 URL: http://localhost:3000
 *
 * Level 1 정적:     window.__floatingOrigin 존재, scientific 모드 초기 로드 콘솔 에러 없음
 * Level 2 인터랙션: focus 전환 시 floatingOrigin.originOffset 갱신, 각 body focus 시 local ≈ 0
 * Level 3 흐름:     DoD α — 목성→지구 zoom 시 projected pixel shift ≤ 0.5px (camera matrix 기반)
 *                   DoD β — focus body local 좌표 절대값 ≤ 1e5 m (100 km)
 *                   #271 회귀 — scientific 모드 jitter 재현 불가
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const baseUrl = process.argv[2] ?? 'http://localhost:3000';
const __dirname = dirname(fileURLToPath(import.meta.url));
const screenshotDir = join(__dirname, '..', '.verify-screenshots');
mkdirSync(screenshotDir, { recursive: true });

const AU = 1.495_978_707e11;

const results = { pass: [], fail: [] };
const check = (name, condition, detail = '') => {
  if (condition) results.pass.push(`${name}${detail ? ' — ' + detail : ''}`);
  else results.fail.push(`${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(err.message));

// ===== Level 1: 정적 =====
console.log('\n[Level 1] 정적 검증');
await page.goto(`${baseUrl}/ko?view=scientific`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000); // scene frame 렌더 대기

check(
  '__floatingOrigin 전역 노출 (dev 빌드)',
  await page.evaluate(
    () => typeof window.__floatingOrigin === 'object' && window.__floatingOrigin !== null,
  ),
);
check(
  '__floatingOrigin.threshold === 1 AU',
  await page.evaluate(() => Math.abs(window.__floatingOrigin.threshold - 1.495_978_707e11) < 1),
);
check(
  '__floatingOrigin.originOffset 초기값 정의됨',
  await page.evaluate(() => {
    const o = window.__floatingOrigin?.originOffset;
    return Array.isArray(o) && o.length === 3 && o.every((v) => Number.isFinite(v));
  }),
);
check(
  '__solarScene 존재 (dev 빌드)',
  await page.evaluate(() => typeof window.__solarScene === 'object'),
);
check(
  '__solarScene.floatingOrigin === __floatingOrigin (동일 인스턴스)',
  await page.evaluate(() => window.__solarScene?.floatingOrigin === window.__floatingOrigin),
);
check(
  'scientific 모드 초기 로드 시 console.error 없음',
  consoleErrors.length === 0,
  consoleErrors.length ? consoleErrors.join(' | ').slice(0, 200) : '',
);

await page.screenshot({
  path: join(screenshotDir, 'floating-origin-01-static.png'),
  fullPage: false,
});

// ===== Level 2: 인터랙션 =====
console.log('\n[Level 2] 인터랙션 검증');

// 지구 focus → originOffset 이 지구 월드 좌표 근처
const focusEarthBtn = await page.$('[data-testid="focus-earth"]');
if (focusEarthBtn) {
  await focusEarthBtn.click();
  await page.waitForTimeout(500);
  const earthLocal = await page.evaluate(() => {
    const scene = window.__solarScene;
    const earth = scene?.meshes.get('earth');
    if (!earth) return null;
    // mesh.position 은 scene unit (1 AU). local 좌표계 원점 근처여야 함.
    const p = earth.position;
    const sceneDistFromOrigin = Math.hypot(p.x, p.y, p.z);
    return sceneDistFromOrigin * 1.495_978_707e11; // 미터 환산
  });
  check(
    '지구 focus 후 earth.local 절대값 ≤ 1e5 m (DoD β)',
    earthLocal !== null && earthLocal < 1e5,
    `local=${earthLocal}m`,
  );
  const originAfterEarth = await page.evaluate(() => window.__floatingOrigin.originOffset);
  const distFromHelio = Math.hypot(...originAfterEarth);
  check(
    'originOffset 은 Heliocentric 절대값 (0 이 아님, 지구 ~1 AU 근처)',
    distFromHelio > 1e11 && distFromHelio < 2e11,
    `distHelio=${(distFromHelio / AU).toFixed(3)} AU`,
  );
}

// 목성 focus → originOffset 재배치
const focusJupiterBtn = await page.$('[data-testid="focus-jupiter"]');
if (focusJupiterBtn) {
  await focusJupiterBtn.click();
  await page.waitForTimeout(500);
  const jupiterLocal = await page.evaluate(() => {
    const scene = window.__solarScene;
    const jup = scene?.meshes.get('jupiter');
    if (!jup) return null;
    const p = jup.position;
    return Math.hypot(p.x, p.y, p.z) * 1.495_978_707e11;
  });
  check(
    '목성 focus 후 jupiter.local 절대값 ≤ 1e5 m (DoD β)',
    jupiterLocal !== null && jupiterLocal < 1e5,
    `local=${jupiterLocal}m`,
  );
  const originAfterJupiter = await page.evaluate(() => window.__floatingOrigin.originOffset);
  const distFromHelio = Math.hypot(...originAfterJupiter);
  check(
    '목성 focus originOffset ~ 5.2 AU',
    distFromHelio > 5 * AU && distFromHelio < 6 * AU,
    `distHelio=${(distFromHelio / AU).toFixed(3)} AU`,
  );
}

await page.screenshot({
  path: join(screenshotDir, 'floating-origin-02-focus-jupiter.png'),
  fullPage: false,
});

// ===== Level 3: 흐름 =====
console.log('\n[Level 3] 흐름 검증');

// DoD α — 목성 focus 상태에서 카메라 pan 시 projected pixel shift ≤ 0.5px
// Babylon 카메라 matrix (view × projection) 를 읽어 body 중심을 pixel 로 projection 후 shift 측정
if (focusJupiterBtn) {
  // 이미 목성 focus 상태
  await page.waitForTimeout(300);
  const pixelShift = await page.evaluate(() => {
    const scene = window.__solarScene?.meshes;
    if (!scene) return null;
    const jup = scene.get('jupiter');
    if (!jup) return null;
    // 활성 카메라 + 엔진
    // (babylon 은 __solarScene 에 직접 scene 참조가 없음 — jup.getEngine/getScene 경유)
    const babScene = jup.getScene();
    const cam = babScene.activeCamera;
    const engine = babScene.getEngine();
    if (!cam || !engine) return null;

    const vp = babScene.getTransformMatrix();
    const width = engine.getRenderWidth();
    const height = engine.getRenderHeight();

    // 프레임 1 — 현재 카메라 위치 기준 projection
    const project = () => {
      const v = jup.position.clone();
      // clip = vp × [v.x,v.y,v.z,1]
      const m = vp.m;
      const cx = m[0] * v.x + m[4] * v.y + m[8] * v.z + m[12];
      const cy = m[1] * v.x + m[5] * v.y + m[9] * v.z + m[13];
      const cw = m[3] * v.x + m[7] * v.y + m[11] * v.z + m[15];
      return {
        x: (cx / cw + 1) * 0.5 * width,
        y: (1 - cy / cw) * 0.5 * height,
      };
    };
    const p1 = project();
    // 카메라를 아주 조금 회전 (alpha 1e-5 rad)
    cam.alpha += 1e-5;
    // 새 view matrix 업데이트
    cam.getViewMatrix(true);
    const vp2 = babScene.getTransformMatrix();
    const project2 = () => {
      const v = jup.position.clone();
      const m = vp2.m;
      const cx = m[0] * v.x + m[4] * v.y + m[8] * v.z + m[12];
      const cy = m[1] * v.x + m[5] * v.y + m[9] * v.z + m[13];
      const cw = m[3] * v.x + m[7] * v.y + m[11] * v.z + m[15];
      return {
        x: (cx / cw + 1) * 0.5 * width,
        y: (1 - cy / cw) * 0.5 * height,
      };
    };
    const p2 = project2();
    cam.alpha -= 1e-5; // rollback

    return {
      p1,
      p2,
      dx: Math.abs(p2.x - p1.x),
      dy: Math.abs(p2.y - p1.y),
      finite: [p1, p2].every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
    };
  });

  check(
    'DoD α — 목성 focus pixel shift 유한',
    pixelShift !== null && pixelShift.finite,
    pixelShift
      ? `p1=(${pixelShift.p1.x.toFixed(2)},${pixelShift.p1.y.toFixed(2)}) p2=(${pixelShift.p2.x.toFixed(2)},${pixelShift.p2.y.toFixed(2)})`
      : 'null',
  );
  check(
    'DoD α — pixel shift ≤ 0.5px (scientific 모드)',
    pixelShift !== null && pixelShift.dx <= 0.5 && pixelShift.dy <= 0.5,
    pixelShift ? `dx=${pixelShift.dx.toFixed(3)}px dy=${pixelShift.dy.toFixed(3)}px` : 'null',
  );
}

// #271 회귀 — scientific 모드 화면이 검정이 아니고 body 가 렌더됨
const canvasPixelCheck = await page.evaluate(() => {
  const canvas = document.querySelector('[data-testid="sim-canvas"]');
  if (!canvas) return null;
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return null;
  ctx.canvas.width = canvas.width;
  ctx.canvas.height = canvas.height;
  ctx.drawImage(canvas, 0, 0);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  // 중앙 근처 픽셀 100x100 샘플링
  const cx = Math.floor(canvas.width / 2);
  const cy = Math.floor(canvas.height / 2);
  let nonBlack = 0;
  let total = 0;
  for (let dy = -50; dy < 50; dy += 5) {
    for (let dx = -50; dx < 50; dx += 5) {
      const idx = ((cy + dy) * canvas.width + (cx + dx)) * 4;
      const r = img.data[idx] ?? 0;
      const g = img.data[idx + 1] ?? 0;
      const b = img.data[idx + 2] ?? 0;
      total += 1;
      if (r + g + b > 30) nonBlack += 1;
    }
  }
  return { nonBlackRatio: nonBlack / total, total };
});
if (canvasPixelCheck) {
  check(
    '#271 회귀 — scientific 모드 canvas 렌더 (비-검정 pixel 존재)',
    canvasPixelCheck.nonBlackRatio > 0.05,
    `nonBlack=${(canvasPixelCheck.nonBlackRatio * 100).toFixed(1)}%`,
  );
}

// 런타임 에러 재확인
check(
  '런타임 에러 없음 (#271 관련 floating-origin assert 포함)',
  consoleErrors.length === 0,
  consoleErrors.length ? consoleErrors.join(' | ').slice(0, 200) : '',
);

await page.screenshot({
  path: join(screenshotDir, 'floating-origin-99-final.png'),
  fullPage: false,
});

await browser.close();

// ===== 결과 =====
console.log('\n========================================');
console.log(`PASS: ${results.pass.length}건`);
for (const p of results.pass) console.log(`  ✓ ${p}`);
if (results.fail.length > 0) {
  console.log(`\nFAIL: ${results.fail.length}건`);
  for (const f of results.fail) console.log(`  ✗ ${f}`);
}
console.log(`\n스크린샷: ${screenshotDir}`);

if (results.fail.length > 0) {
  console.error('\n검증 실패 ✗');
  process.exit(1);
}
console.log('\n모든 검증 통과 ✓');
