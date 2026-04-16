#!/usr/bin/env node
/**
 * P4-C #167 — 모바일 (iPhone Safari) 1차 검증.
 *
 * DoD:
 *   1. N=200 @ 60fps 유지 (5초 평균) — `fps >= 55`로 가드 (±8% 노이즈 허용)
 *   2. N=10000 크래시 없음 (fps 목표 없음, best-effort)
 *   3. WebGPU 미지원 iOS 버전 폴백 확인 — `navigator.gpu` 미노출 시 barnes-hut 폴백
 *
 * 한계:
 *   - Playwright는 **Chromium 엔진** 기반 iPhone emulation (userAgent/viewport만 Safari 흉내).
 *   - 실제 WebKit+Safari WebGPU 동작은 실기기에서만 정확 측정 가능.
 *   - 본 스크립트는 1차 게이트 — 구조적 회귀(크래시/레이아웃/capability 경로)만 방지.
 *   - 실기기 측정 결과는 docs/reports/p4c-mobile-실기기-YYYYMMDD.md에 별도 기록 필요.
 *
 * 사용: node scripts/browser-verify-mobile-p4c.mjs [baseUrl]
 */
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const baseUrl = process.argv[2] ?? 'http://localhost:3001';
const __dirname = dirname(fileURLToPath(import.meta.url));
const shotDir = join(__dirname, '..', '.verify-screenshots', 'mobile-p4c');
mkdirSync(shotDir, { recursive: true });
const reportsDir = join(__dirname, '..', 'docs', 'reports');
mkdirSync(reportsDir, { recursive: true });

// iPhone 14 — A15 Bionic, 현대 기준점. 실기기와 성능 프로필은 다름(Chromium/데스크톱 CPU).
const deviceProfile = devices['iPhone 14'];
const browser = await chromium.launch({
  headless: true,
  args: [
    // 모바일 리얼리티와 별개로 WebGPU 경로 검증은 가능하게 한다 (실기기 iOS Safari는 별도).
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan',
    '--use-angle=metal',
    '--disable-gpu-vsync',
    '--disable-frame-rate-limit',
  ],
});
const ctx = await browser.newContext({ ...deviceProfile });
const page = await ctx.newPage();

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
};

const measureFps = (ms) =>
  page.evaluate(
    (duration) =>
      new Promise((resolve) => {
        let count = 0;
        const t0 = performance.now();
        const loop = () => {
          count += 1;
          if (performance.now() - t0 < duration) requestAnimationFrame(loop);
          else resolve((count * 1000) / (performance.now() - t0));
        };
        requestAnimationFrame(loop);
      }),
    ms,
  );

// ===== Scenario 1: N=200 60fps 유지 =====
console.log('\n[1/3] N=200 60fps 유지 (iPhone 14 emulation, 5초 평균)');
await page.goto(`${baseUrl}/ko?belt=200`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.click('[data-testid="time-play"]').catch(() => {});
await page.waitForTimeout(500);
const fps200 = await measureFps(5000);
check(
  `N=200 fps ≥ 55 (5s 평균)`,
  fps200 >= 55,
  `${fps200.toFixed(2)} fps (vsync cap = 60fps, 55로 완화)`,
);
await page.screenshot({ path: join(shotDir, '1-n200.png') });

// ===== Scenario 2: N=10000 크래시 없음 =====
console.log('\n[2/3] N=10000 크래시 없음 (best-effort fps)');
const errsBeforeBig = pageErrors.length;
await page.goto(`${baseUrl}/ko?belt=10000`, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
await page.click('[data-testid="time-play"]').catch(() => {});
await page.waitForTimeout(500);
const fps10k = await measureFps(3000);
const bigErrs = pageErrors.slice(errsBeforeBig);
check('N=10000 page error 없음', bigErrs.length === 0, bigErrs.join(' | ').slice(0, 120));
check('N=10000 canvas 유지', (await page.$('canvas')) !== null);
console.log(`  (best-effort) N=10000 fps=${fps10k.toFixed(2)}`);
await page.screenshot({ path: join(shotDir, '2-n10000.png') });

// ===== Scenario 3: WebGPU 미지원 환경 폴백 =====
console.log('\n[3/3] WebGPU 미지원 시뮬레이션 — navigator.gpu 제거 후 barnes-hut 폴백');
// iPhone 16 Pro도 iOS 17 이전에는 webgpu 없음. 여기서는 navigator.gpu를 명시 차단하여
// 모바일 Safari 구버전을 흉내.
const ctx2 = await browser.newContext({ ...deviceProfile });
await ctx2.addInitScript(() => {
  Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
});
const page2 = await ctx2.newPage();
const consoleErrors2 = [];
page2.on('console', (m) => {
  if (m.type() === 'error') consoleErrors2.push(m.text());
});
await page2.goto(`${baseUrl}/ko?engine=webgpu&belt=500`, { waitUntil: 'networkidle' });
await page2.waitForTimeout(2000);
const hud = (await page2.textContent('[data-testid="hud-top-right"]')) ?? '';
const rendererInFallback = hud.match(/renderer\s*·\s*(\w+)/)?.[1];
check(
  'navigator.gpu 없을 때 WebGL2로 폴백 (barnes-hut 경로)',
  rendererInFallback === 'webgl2',
  `renderer=${rendererInFallback ?? '없음'}`,
);
check(
  'capability 안내 notice 표시 (engine=webgpu 요청 시)',
  !!(await page2.$('[data-testid="engine-notice"]')),
);
await page2.screenshot({ path: join(shotDir, '3-webgpu-fallback.png') });
await ctx2.close();

await browser.close();

console.log('\n========================================');
const pass = results.filter((r) => r.pass).length;
const fail = results.filter((r) => !r.pass).length;
console.log(`통과: ${pass} / 실패: ${fail}`);

// 리포트 저장
const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const reportPath = join(reportsDir, `p4c-mobile-${today}.md`);
const report = `# P4-C 모바일 1차 검증 — ${new Date().toISOString().slice(0, 10)}

> **한계 고지**: Playwright Chromium + iPhone 14 emulation. 실제 WebKit/Safari WebGPU
> 동작과 성능 프로필은 실기기에서만 정확 측정 가능. 본 리포트는 **1차 구조적 게이트**.

## 환경

- Engine: Playwright Chromium (headless)
- Device profile: iPhone 14 (\`devices['iPhone 14']\`)
- Viewport: ${deviceProfile.viewport?.width}×${deviceProfile.viewport?.height}
- User agent: ${deviceProfile.userAgent?.slice(0, 80)}…

## 결과

| 시나리오 | 결과 | 측정값 |
| --- | --- | --- |
| N=200 fps ≥ 55 | ${fps200 >= 55 ? '✓' : '✗'} | ${fps200.toFixed(2)} fps |
| N=10000 크래시 없음 | ${bigErrs.length === 0 ? '✓' : '✗'} | ${bigErrs.length} 개 에러 |
| N=10000 best-effort fps | — | ${fps10k.toFixed(2)} fps |
| WebGPU 폴백(navigator.gpu 없음) | ${rendererInFallback === 'webgl2' ? '✓' : '✗'} | renderer=${rendererInFallback ?? '없음'} |

## 인계

- **실기기 측정 TODO**: iPhone Safari 17.4+ 실물에서 동일 시나리오 측정.
  실기기 리포트는 \`docs/reports/p4c-mobile-실기기-YYYYMMDD.md\`에 별도 저장.
- iOS Safari WebGPU 활성 조건: iOS 17.4+ (2024-03 이후). 구버전은 WebGL2 barnes-hut 경로.
`;
writeFileSync(reportPath, report);
console.log(`리포트: ${reportPath}`);

if (fail > 0) {
  console.log('\n실패 항목:');
  results.filter((r) => !r.pass).forEach((r) => console.log(`  ✗ ${r.name} — ${r.detail}`));
  process.exit(1);
}
console.log('✓ P4-C 1차 모바일 게이트 통과');
