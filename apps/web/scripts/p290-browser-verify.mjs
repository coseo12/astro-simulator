/**
 * P11-C #290 — 3단계 브라우저 검증 + D5 idle fps smoke (headless)
 *
 * 본 스크립트는 단발성 smoke — baseline 저장 없이 현재 구현의 동작을 실 브라우저에서 확인.
 * 실기기 3종 수동 검증은 C.2 에서 추가.
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

async function setupPage(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  // __gpuTier / __simCore 전역 노출까지 대기 (1.5s hydration + detectGpuCapability async)
  await page.waitForFunction(
    () => typeof window.__gpuTier !== 'undefined' && typeof window.__simCore !== 'undefined',
    { timeout: 10_000 },
  );
  return { context, page, consoleErrors };
}

async function runLevel1(url) {
  console.log(`\n=== Level 1 (정적) — ${url} ===`);
  const browser = await chromium.launch({ headless: true });
  const { context, page, consoleErrors } = await setupPage(browser, url);
  try {
    const tier = await page.evaluate(() => window.__gpuTier);
    const notice = await page.evaluate(() => window.__simStore?.getState()?.engineNotice);
    const forceLod = await page.evaluate(() => window.__gpuTierForceLod);
    console.log(`  __gpuTier = ${tier}`);
    console.log(`  engineNotice = ${JSON.stringify(notice)}`);
    console.log(`  __gpuTierForceLod = ${forceLod ?? '(none)'}`);
    console.log(`  console errors = ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      for (const e of consoleErrors.slice(0, 5)) console.log(`    ! ${e}`);
    }
    return { tier, notice, forceLod, consoleErrors };
  } finally {
    await context.close();
    await browser.close();
  }
}

async function runLevel2_urlOverride() {
  console.log('\n=== Level 2 (인터랙션) — URL ?gpu= override ===');
  const results = {};
  for (const override of ['a', 'b', 'c', 'd']) {
    const url = `${BASE_URL}/?gpu=${override}`;
    const browser = await chromium.launch({ headless: true });
    const warnings = [];
    try {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      page.on('console', (msg) => {
        if (msg.type() === 'warning') warnings.push(msg.text());
      });
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForFunction(() => typeof window.__gpuTier !== 'undefined', {
        timeout: 10_000,
      });
      const tier = await page.evaluate(() => window.__gpuTier);
      console.log(`  ?gpu=${override} → __gpuTier=${tier}`);
      results[override] = { tier, warnings: warnings.filter((w) => w.includes('parse-gpu-tier')) };
      if (override === 'd') {
        console.log(
          `    ✓ 거부값 'd' 경고: ${results[override].warnings.length > 0 ? 'YES' : 'NO'}`,
        );
      }
      await context.close();
    } finally {
      await browser.close();
    }
  }
  return results;
}

async function runLevel3_idleFps() {
  console.log('\n=== Level 3 (흐름) — tier-c idle fps smoke (DoD #5) ===');
  const url = `${BASE_URL}/?gpu=c`;
  const browser = await chromium.launch({ headless: true });
  try {
    const { context, page } = await setupPage(browser, url);
    // idle 상태 = play 하지 않음. store의 fps 필드가 setFps 를 통해 갱신됨.
    console.log('  10초 간 fps 샘플링 시작...');
    const samples = [];
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(1000);
      const fps = await page.evaluate(() => window.__simStore?.getState()?.fps);
      if (typeof fps === 'number') samples.push(fps);
    }
    const avg = samples.length > 0 ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;
    const min = samples.length > 0 ? Math.min(...samples) : 0;
    const tier = await page.evaluate(() => window.__gpuTier);
    console.log(`  samples (${samples.length}): [${samples.map((v) => v.toFixed(1)).join(', ')}]`);
    console.log(`  avg=${avg.toFixed(1)} min=${min.toFixed(1)} (tier=${tier})`);
    console.log(`  DoD #5 idle fps ≥ 30 ? ${min >= 30 ? 'PASS' : 'FAIL'}`);
    await context.close();
    return { samples, avg, min, tier };
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log(`BASE_URL = ${BASE_URL}`);

  // Level 1 — 정적
  const level1 = await runLevel1(BASE_URL);

  // Level 2 — URL override
  const level2 = await runLevel2_urlOverride();

  // Level 3 — tier-c idle fps smoke
  const level3 = await runLevel3_idleFps();

  console.log('\n=== 요약 ===');
  console.log(`Level 1: tier=${level1.tier} errors=${level1.consoleErrors.length}`);
  console.log(
    `Level 2: ?gpu=a→${level2.a.tier} ?gpu=b→${level2.b.tier} ?gpu=c→${level2.c.tier} ?gpu=d→${level2.d.tier}`,
  );
  console.log(
    `Level 3: tier-c min=${level3.min.toFixed(1)} fps (DoD #5 ${level3.min >= 30 ? 'PASS' : 'FAIL'})`,
  );

  // 결과 전역 객체로 출력
  console.log('\n=== JSON ===');
  console.log(
    JSON.stringify(
      {
        level1,
        level2,
        level3,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
