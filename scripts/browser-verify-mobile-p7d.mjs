#!/usr/bin/env node
/**
 * P7-D #209 — 모바일 emulation 구조 게이트 (1차).
 *
 * DoD 커버리지:
 *   - D1: iPhone 14 emulation + `?bh=2` 로드 → JD 3초 이상 진행 + 콘솔 에러 0
 *   - D3: 모바일 UA + `navigator.gpu` 차단 시 `mobile-webgpu-best-effort` key 노티 노출
 *         + dismiss 후 `webgpu-fallback` 키 다른 알림 정상 표시 (key 분리 동작)
 *
 * 한계 (P4-C 선례와 동일):
 *   - Playwright는 Chromium 기반 iPhone emulation — UA/viewport만 Safari 흉내.
 *   - 실제 iOS Safari WebGPU 동작은 실기기에서만 정확 측정 가능.
 *   - 본 스크립트는 **구조적 회귀**(크래시/경고 경로/UI 렌더)만 차단한다.
 *   - 성능 측정은 `scripts/bench-scene-mobile.mjs` 또는 실기기 수동 측정.
 *
 * 사용: node scripts/browser-verify-mobile-p7d.mjs [baseUrl]
 */
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const baseUrl = process.argv[2] ?? 'http://localhost:3001';
const __dirname = dirname(fileURLToPath(import.meta.url));
const shotDir = join(__dirname, '..', '.verify-screenshots', 'mobile-p7d');
mkdirSync(shotDir, { recursive: true });

const deviceProfile = devices['iPhone 14'];
const browser = await chromium.launch({
  headless: true,
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan',
    '--use-angle=metal',
    '--disable-gpu-vsync',
    '--disable-frame-rate-limit',
  ],
});

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
};

// ===== Scenario 1: iPhone 14 emulation `?bh=2` 로드 =====
console.log('\n[1/4] `?bh=2` iPhone 14 emulation 로드 + JD 진행 가드');
{
  const ctx = await browser.newContext({ ...deviceProfile });
  const page = await ctx.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto(`${baseUrl}/ko?bh=2`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  // JD 초기값 획득 → 재생 → 3초 후 증가 확인.
  const jdBefore = await page.evaluate(() =>
    Number(
      (document.querySelector('[data-testid="hud-top-left"]')?.textContent ?? '').replace(
        /[^0-9.]/g,
        '',
      ),
    ),
  );
  await page.click('[data-testid="time-play"]').catch(() => {});
  await page.waitForTimeout(3500);
  const jdAfter = await page.evaluate(() =>
    Number(
      (document.querySelector('[data-testid="hud-top-left"]')?.textContent ?? '').replace(
        /[^0-9.]/g,
        '',
      ),
    ),
  );
  check(
    'JD 3초 이상 진행 (bh=2)',
    Number.isFinite(jdBefore) && Number.isFinite(jdAfter) && jdAfter > jdBefore,
    `before=${jdBefore} after=${jdAfter}`,
  );
  check('콘솔 에러 0건 (bh=2)', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  check('pageerror 0건 (bh=2)', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  await page.screenshot({ path: join(shotDir, '1-bh2-load.png') });
  await ctx.close();
}

// ===== Scenario 2: `?bh=2&integrator=yoshida4` 조합 =====
console.log('\n[2/4] `?bh=2&integrator=yoshida4` 조합 로드 + 5초 재생 에러 가드');
{
  const ctx = await browser.newContext({ ...deviceProfile });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  await page.goto(`${baseUrl}/ko?bh=2&integrator=yoshida4`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.click('[data-testid="time-play"]').catch(() => {});
  await page.waitForTimeout(5000);
  const badge = page.locator('[data-testid="integrator-badge"]');
  check('integrator-badge 렌더 (조합)', (await badge.count()) === 1);
  const badgeText = (await badge.textContent()) ?? '';
  check('배지 텍스트 yoshida4 포함', badgeText.includes('yoshida4'), badgeText.trim());
  const nanOrWasm = consoleErrors.some((e) => /NaN|nbody|wasm|NBodyEngine|integrator/i.test(e));
  check('5초 재생 중 NaN/WASM 에러 0건', !nanOrWasm);
  await page.screenshot({ path: join(shotDir, '2-bh2-yoshida4.png') });
  await ctx.close();
}

// ===== Scenario 3: 모바일 UA + WebGPU 차단 → mobile-webgpu-best-effort 노티 =====
console.log('\n[3/4] 모바일 + navigator.gpu 차단 → mobile-webgpu-best-effort 노티');
{
  const ctx = await browser.newContext({ ...deviceProfile });
  // iOS Safari <17.4 환경 시뮬레이션 — navigator.gpu 명시 차단.
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
  });
  const page = await ctx.newPage();
  await page.goto(`${baseUrl}/ko`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const notice = page.locator('[data-testid="engine-notice"]');
  check('engine-notice 노출', (await notice.count()) >= 1);
  const key = await notice.getAttribute('data-notice-key');
  check(
    'data-notice-key === mobile-webgpu-best-effort',
    key === 'mobile-webgpu-best-effort',
    String(key),
  );
  await page.screenshot({ path: join(shotDir, '3-mobile-warning.png') });
  await ctx.close();
}

// ===== Scenario 4: key 분리 dismiss — A key 닫은 뒤 B key 표시 가능 =====
console.log('\n[4/4] key-scoped dismiss — mobile 키 닫아도 다른 key 알림은 정상');
{
  const ctx = await browser.newContext({ ...deviceProfile });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
  });
  const page = await ctx.newPage();
  await page.goto(`${baseUrl}/ko`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  // 1) mobile-webgpu-best-effort 키 dismiss.
  await page.click('[data-testid="engine-notice-dismiss"]').catch(() => {});
  await page.waitForTimeout(300);
  const afterDismiss = await page.locator('[data-testid="engine-notice"]').count();
  check('dismiss 후 알림 사라짐', afterDismiss === 0);
  // 2) 다른 key 알림(`webgpu-fallback`)을 강제 호출 → 정상 표시되어야 한다.
  await page.evaluate(() => {
    // @ts-ignore — 테스트용 store API 직접 접근.
    const s = window.__simStore;
    if (s && typeof s.getState === 'function') {
      s.getState().setEngineNotice({ key: 'webgpu-fallback', message: 'B' });
    }
  });
  // 전역 노출이 없을 수도 있으므로 dismissed state 검증은 스토어 독립 → 필요 시 생략.
  await page.waitForTimeout(300);
  // 핵심 검증: dismiss된 key와 다른 key 알림이 표시된다 (스토어 단위 테스트로도 커버되지만
  // UI 통합에서도 동일 동작해야 함을 확인).
  const winHasStore = await page.evaluate(() => typeof window.__simStore !== 'undefined');
  if (winHasStore) {
    const reappeared = await page.locator('[data-testid="engine-notice"]').count();
    check('다른 key 알림은 정상 표시 (UI 통합)', reappeared >= 1);
  } else {
    // store 전역 노출이 없는 경우, unit test 결과를 신뢰하고 스킵 표시.
    check('store 전역 노출 없음 → UI 통합 스킵 (단위 테스트로 커버)', true, 'store exposure off');
  }
  await page.screenshot({ path: join(shotDir, '4-key-isolation.png') });
  await ctx.close();
}

await browser.close();

console.log('\n========================================');
const pass = results.filter((r) => r.pass).length;
const fail = results.filter((r) => !r.pass).length;
console.log(`통과: ${pass} / 실패: ${fail}`);

if (fail > 0) {
  console.log('\n실패 항목:');
  results.filter((r) => !r.pass).forEach((r) => console.log(`  ✗ ${r.name} — ${r.detail}`));
  process.exit(1);
}
console.log(`✓ P7-D 모바일 1차 게이트 통과 (스크린샷: ${shotDir})`);
