// L1 console error 내용 캡처
import { chromium } from 'playwright';
const BASE = 'http://localhost:3000';
(async () => {
  const browser = await chromium.launch({ headless: false, channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errs = [];
  const warns = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push({ text: m.text(), loc: m.location() });
    if (m.type() === 'warning') warns.push(m.text());
  });
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForFunction(() => typeof window.__gpuTier !== 'undefined', { timeout: 10000 });
  console.log('errors:');
  for (const e of errs) console.log('  -', e.text, '@', JSON.stringify(e.loc));
  console.log('warnings(first 10):');
  for (const w of warns.slice(0, 10)) console.log('  -', w);
  await browser.close();
})();
