// 행성 가시성 진단 — 관찰/연구 모드 + 기본 focus 상태 + mesh 수 + tier 상태 + 콘솔 로그
import { chromium } from 'playwright';
const BASE = 'http://localhost:3000';
const mkdir = (await import('fs')).mkdirSync;
const path = (await import('path')).default;
const OUT = '/tmp/p290-diag';
try {
  mkdir(OUT, { recursive: true });
} catch {}

const browser = await chromium.launch({ headless: false, channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const logs = [];
page.on('console', (m) => logs.push({ type: m.type(), text: m.text() }));
page.on('pageerror', (e) => logs.push({ type: 'pageerror', text: String(e.message) }));

const scenarios = [
  { name: 'default', url: BASE + '/' },
  { name: 'observe', url: BASE + '/?mode=observe' },
  { name: 'research', url: BASE + '/?mode=research' },
  { name: 'focus-earth', url: BASE + '/?focus=earth' },
  { name: 'focus-jupiter', url: BASE + '/?focus=jupiter' },
  { name: 'focus-mars', url: BASE + '/?focus=mars' },
];

for (const s of scenarios) {
  logs.length = 0;
  await page.goto(s.url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  const state = await page.evaluate(() => {
    const w = window;
    const store = w.__simStore?.getState?.();
    const canvas = document.querySelector('canvas');
    return {
      gpuTier: w.__gpuTier,
      activeTier: store?.activeTier,
      focusBodyId: store?.focusBodyId,
      mode: store?.mode,
      lodStats: store?.lodStats ?? w.__lodStats ?? null,
      scene: w.__sceneDebug?.() ?? null,
      canvasSize: canvas ? { w: canvas.clientWidth, h: canvas.clientHeight } : null,
    };
  });
  await page.screenshot({ path: path.join(OUT, `${s.name}.png`), fullPage: false });
  const errs = logs.filter((l) => l.type === 'error' || l.type === 'pageerror');
  const warns = logs.filter((l) => l.type === 'warning');
  console.log(`\n=== ${s.name} (${s.url}) ===`);
  console.log('  state:', JSON.stringify(state, null, 2));
  console.log(`  errors: ${errs.length}`);
  errs.slice(0, 5).forEach((e) => console.log(`    - [${e.type}] ${e.text}`));
  console.log(`  warnings: ${warns.length}`);
  warns.slice(0, 5).forEach((w) => console.log(`    - ${w.text}`));
}

await browser.close();
