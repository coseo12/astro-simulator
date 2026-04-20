#!/usr/bin/env node
/**
 * P9 #254 PR-2.5 — 실 Chromium (headful, hardware-accel) 스크린샷 캡처.
 *
 * **volt #33 대응**: headless swiftshader 는 부분 freeze 가능. 본 스크립트는
 * playwright 의 `headless: false` + `--use-angle=default` 로 GPU 하드웨어 가속
 * 경로를 사용하여 실 사용자가 보는 렌더와 근접한 스크린샷을 박제한다.
 *
 * 캡처 시나리오:
 *   1. l1-real-jupiter-zoomed.png      — Jupiter 포커스 + 충분한 줌인
 *   2. l2-real-camera-rotated.png      — 카메라 회전 후 3층 측면 관측
 *   3. l3-real-fallback-mode.png       — ?ring=fallback M1 백업 경로
 *
 * 사용: node scripts/capture-ring-shader-headful.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const baseUrl = process.argv[2] ?? 'http://localhost:3099';
const __dirname = dirname(fileURLToPath(import.meta.url));
const screenshotDir = join(__dirname, '..', 'screenshots', 'p9-pr25');
mkdirSync(screenshotDir, { recursive: true });

const browser = await chromium.launch({
  headless: false,
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

page.on('pageerror', (err) => console.error('[pageerror]', err.message));

console.log('[Scenario 1] Jupiter focus + zoom in');
await page.goto(`${baseUrl}/ko`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const focusBtn = await page.$('[data-testid="focus-jupiter"]');
if (focusBtn) {
  await focusBtn.click();
  await page.waitForTimeout(2500);

  const canvas = await page.$('canvas');
  const box = canvas ? await canvas.boundingBox() : null;
  if (box) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    // 더 강한 줌인 (50회 wheel)
    for (let i = 0; i < 50; i++) {
      await page.mouse.wheel(0, -100);
      if (i % 10 === 0) await page.waitForTimeout(100);
    }
    await page.waitForTimeout(2000);
  }
}

await page.screenshot({
  path: join(screenshotDir, 'l1-real-jupiter-zoomed.png'),
  fullPage: false,
});
console.log('  saved: l1-real-jupiter-zoomed.png');

console.log('[Scenario 2] Camera rotated — ring side view');
const canvas2 = await page.$('canvas');
if (canvas2) {
  const box2 = await canvas2.boundingBox();
  if (box2) {
    const cx = box2.x + box2.width / 2;
    const cy = box2.y + box2.height / 2;
    // 카메라 수직 회전 — 고리 평면을 기울여 측면 관측
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 80, cy - 200, { steps: 30 });
    await page.mouse.up();
    await page.waitForTimeout(1000);
  }
}
await page.screenshot({
  path: join(screenshotDir, 'l2-real-camera-rotated.png'),
  fullPage: false,
});
console.log('  saved: l2-real-camera-rotated.png');

console.log('[Scenario 3] ?ring=fallback M1 백업 경로');
await page.goto(`${baseUrl}/ko?ring=fallback`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const focusBtn3 = await page.$('[data-testid="focus-jupiter"]');
if (focusBtn3) {
  await focusBtn3.click();
  await page.waitForTimeout(2500);

  const canvas3 = await page.$('canvas');
  const box3 = canvas3 ? await canvas3.boundingBox() : null;
  if (box3) {
    const cx = box3.x + box3.width / 2;
    const cy = box3.y + box3.height / 2;
    await page.mouse.move(cx, cy);
    for (let i = 0; i < 50; i++) {
      await page.mouse.wheel(0, -100);
      if (i % 10 === 0) await page.waitForTimeout(100);
    }
    await page.waitForTimeout(2000);
  }
}

await page.screenshot({
  path: join(screenshotDir, 'l3-real-fallback-mode.png'),
  fullPage: false,
});
console.log('  saved: l3-real-fallback-mode.png');

await browser.close();
console.log(`\n모든 스크린샷 저장: ${screenshotDir}`);
