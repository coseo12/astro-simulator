// P11-C #290 QA — 실 Chrome(headed) 3단계 검증 + 추가 케이스 (A 대문자, ?focus 조합)
// volt #33 방어: headless software WebGPU false positive 회피

import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const SCR = '/tmp/p327-screenshots';

async function launchHeaded() {
  // 실제 Chrome channel 사용 (system Chrome). 없으면 Chromium 대체.
  try {
    return await chromium.launch({ headless: false, channel: 'chrome' });
  } catch {
    return await chromium.launch({ headless: false });
  }
}

async function readEngineState(page) {
  return await page.evaluate(() => ({
    tier: window.__gpuTier,
    forceLod: window.__gpuTierForceLod ?? null,
    notice: window.__simStore?.getState()?.engineNotice ?? null,
  }));
}

async function visit(browser, url, label, { captureConsole = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errs = [];
  const warns = [];
  if (captureConsole) {
    page.on('console', (m) => {
      if (m.type() === 'error') errs.push(m.text());
      if (m.type() === 'warning') warns.push(m.text());
    });
  }
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForFunction(() => typeof window.__gpuTier !== 'undefined', { timeout: 10_000 });
  const state = await readEngineState(page);
  await page.screenshot({ path: `${SCR}/${label}.png`, fullPage: false });
  return { page, ctx, state, errs, warns };
}

async function main() {
  const browser = await launchHeaded();
  const report = {};
  try {
    // Level 1 — auto detect
    {
      const r = await visit(browser, `${BASE}/`, 'L1-auto');
      report.L1 = { ...r.state, consoleErrors: r.errs.length };
      console.log(`[L1] auto → tier=${r.state.tier} errors=${r.errs.length}`);
      await r.ctx.close();
    }

    // Level 2 — URL overrides (a, b, c, A 대문자, invalid)
    report.L2 = {};
    for (const q of ['a', 'b', 'c', 'A', 'invalid']) {
      const r = await visit(browser, `${BASE}/?gpu=${q}`, `L2-gpu-${q}`);
      const warnMatched = r.warns.filter((w) => w.includes('parse-gpu-tier'));
      report.L2[q] = {
        tier: r.state.tier,
        forceLod: r.state.forceLod,
        notice: r.state.notice,
        errs: r.errs.length,
        warns: warnMatched,
      };
      console.log(
        `[L2] ?gpu=${q} → tier=${r.state.tier} forceLod=${r.state.forceLod ?? '(none)'} warn=${warnMatched.length}`,
      );
      await r.ctx.close();
    }

    // Level 3 — URL 조합: ?gpu=c&focus=earth (도메인 흐름)
    {
      const r = await visit(browser, `${BASE}/?gpu=c&focus=earth`, 'L3-gpu-c-focus-earth');
      report.L3 = { ...r.state, consoleErrors: r.errs.length };
      console.log(`[L3] gpu=c&focus=earth → tier=${r.state.tier} errors=${r.errs.length}`);
      await r.ctx.close();
    }

    // Level 3b — ?gpu=b 에서 tier-c 강제 LOD 없음 확인
    {
      const r = await visit(browser, `${BASE}/?gpu=b`, 'L3b-gpu-b-no-forceLod');
      report.L3b = { ...r.state };
      console.log(`[L3b] gpu=b forceLod=${r.state.forceLod ?? '(none)'} (기대: none)`);
      await r.ctx.close();
    }

    // Promise race 재현 시도 — tier-c 로 진입 후 HMR-like 네비게이션 반복
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await ctx.newPage();
      const errs = [];
      page.on('console', (m) => {
        if (m.type() === 'error') errs.push(m.text());
      });
      let consistent = true;
      for (let i = 0; i < 5; i++) {
        await page.goto(`${BASE}/?gpu=c&t=${i}`, { waitUntil: 'networkidle', timeout: 30_000 });
        await page.waitForFunction(() => typeof window.__gpuTier !== 'undefined', {
          timeout: 10_000,
        });
        const s = await readEngineState(page);
        console.log(
          `  [race-${i}] tier=${s.tier} forceLod=${s.forceLod ?? '(none)'} notice=${s.notice?.key ?? '(none)'}`,
        );
        if (s.tier !== 'c' || s.forceLod !== 'low') consistent = false;
      }
      report.raceReproduction = { attempts: 5, consistent, errors: errs.length };
      await ctx.close();
    }

    // Level 3c — ?gpu=c 진입 후 scene 렌더 확인 (canvas 존재)
    {
      const r = await visit(browser, `${BASE}/?gpu=c`, 'L3c-gpu-c-canvas');
      const hasCanvas = await r.page.evaluate(() => !!document.querySelector('canvas'));
      const pixelCheck = await r.page.evaluate(() => {
        const c = document.querySelector('canvas');
        if (!c) return null;
        return { width: c.width, height: c.height };
      });
      report.L3c = { ...r.state, hasCanvas, pixelCheck, errs: r.errs.length };
      console.log(
        `[L3c] canvas=${hasCanvas} size=${pixelCheck?.width}x${pixelCheck?.height} errors=${r.errs.length}`,
      );
      await r.ctx.close();
    }

    console.log('\n=== JSON ===');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
