// tier-c idle fps 실 Chrome (headed) 측정 — D5 재검증
import { chromium } from 'playwright';
const BASE = 'http://localhost:3000';
(async () => {
  let browser;
  try {
    browser = await chromium.launch({ headless: false, channel: 'chrome' });
  } catch {
    browser = await chromium.launch({ headless: false });
  }
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/?gpu=c', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForFunction(
    () => typeof window.__gpuTier !== 'undefined' && typeof window.__simStore !== 'undefined',
    { timeout: 10000 },
  );
  const samples = [];
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(1000);
    const fps = await page.evaluate(() => window.__simStore?.getState()?.fps);
    if (typeof fps === 'number') samples.push(fps);
  }
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  const min = Math.min(...samples);
  const tier = await page.evaluate(() => window.__gpuTier);
  const forceLod = await page.evaluate(() => window.__gpuTierForceLod);
  console.log(`tier=${tier} forceLod=${forceLod}`);
  console.log(`samples=${samples.map((v) => v.toFixed(1)).join(',')}`);
  console.log(`avg=${avg.toFixed(2)} min=${min.toFixed(2)}`);
  console.log(`DoD #5 (≥30) = ${min >= 30 ? 'PASS' : 'FAIL'}`);
  await browser.close();
})();
