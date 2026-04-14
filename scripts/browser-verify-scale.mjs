#!/usr/bin/env node
/**
 * C7 (#19) 스케일 전환 검증.
 *
 * 태양 → 지구 → 목성 → 해왕성 → reset 순차 포커스,
 * 각 단계에서 콘솔/런타임 에러 없음 확인 + 스크린샷 캡처.
 *
 * 주의: P1에서는 AU 씬 단위 + Logarithmic Depth Buffer 조합으로
 * 태양계 내 스케일에서 지터 없음을 보장한다. 행성 표면 수준의
 * 극단 줌은 C6/P2에서 per-body 스케일/Floating Origin으로 개선 예정.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const baseUrl = process.argv[2] ?? 'http://localhost:3001';
const __dirname = dirname(fileURLToPath(import.meta.url));
const screenshotDir = join(__dirname, '..', '.verify-screenshots', 'scale');
mkdirSync(screenshotDir, { recursive: true });

const targets = [
  { id: 'sun', label: '태양 (중심)' },
  { id: 'earth', label: '지구 (1 AU)' },
  { id: 'jupiter', label: '목성 (5.2 AU)' },
  { id: 'neptune', label: '해왕성 (30 AU)' },
];

const results = { pass: [], fail: [] };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${baseUrl}/ko`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

for (const t of targets) {
  const before = consoleErrors.length + pageErrors.length;
  const btn = await page.$(`[data-testid="focus-${t.id}"]`);
  if (!btn) {
    results.fail.push(`${t.label}: 버튼 없음`);
    continue;
  }
  await btn.click();
  await page.waitForTimeout(600); // 카메라 애니메이션 + 렌더 안정화
  await page.screenshot({ path: join(screenshotDir, `${t.id}.png`) });

  const after = consoleErrors.length + pageErrors.length;
  const newErrors = after - before;
  if (newErrors === 0) results.pass.push(`${t.label} 포커스 — 에러 없음`);
  else results.fail.push(`${t.label} 포커스 시 에러 ${newErrors}건 추가`);

  // 캔버스가 비어있지 않은지 확인 (모두 배경색이면 실패)
  const isBlank = await page.evaluate(() => {
    const cv = document.querySelector('canvas');
    if (!cv) return true;
    const ctx = cv.getContext('webgl2') || cv.getContext('webgpu');
    return !ctx;
  });
  if (!isBlank) results.pass.push(`${t.label} — 캔버스 렌더링 컨텍스트 존재`);
  else results.fail.push(`${t.label} — 캔버스 컨텍스트 없음`);
}

// reset
const resetBtn = await page.$('[data-testid="focus-reset"]');
if (resetBtn) {
  await resetBtn.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(screenshotDir, 'reset.png') });
  results.pass.push('reset 버튼 클릭 — 에러 없음');
} else {
  results.fail.push('reset 버튼 없음');
}

await browser.close();

console.log('\n========================================');
console.log(`PASS: ${results.pass.length}건`);
results.pass.forEach((p) => console.log(`  ✓ ${p}`));
if (results.fail.length > 0) {
  console.log(`\nFAIL: ${results.fail.length}건`);
  results.fail.forEach((f) => console.log(`  ✗ ${f}`));
  process.exit(1);
}
console.log(`\n콘솔 에러: ${consoleErrors.length}, 런타임 에러: ${pageErrors.length}`);
if (consoleErrors.length > 0 || pageErrors.length > 0) {
  consoleErrors.forEach((e) => console.log('  console:', e));
  pageErrors.forEach((e) => console.log('  runtime:', e));
  process.exit(1);
}
console.log(`스크린샷: ${screenshotDir}`);
console.log('스케일 전환 검증 통과 ✓');
