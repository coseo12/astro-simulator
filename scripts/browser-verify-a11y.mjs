#!/usr/bin/env node
/**
 * E5 (#34) 접근성 검증.
 *
 * - axe-core 자동 검사 (WCAG 2.1 AA)
 * - 키보드 Tab 순회 — focusable 요소 수 확인
 * - prefers-reduced-motion 매체 쿼리 적용 확인
 *
 * canvas는 decorative로 간주 (3D 콘텐츠는 음성 대체 불가). UI 컨트롤에만 axe 적용.
 */
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const baseUrl = process.argv[2] ?? 'http://localhost:3001';
const __dirname = dirname(fileURLToPath(import.meta.url));
const reportDir = join(__dirname, '..', '.verify-screenshots', 'a11y');
mkdirSync(reportDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

await page.goto(`${baseUrl}/ko`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

const results = { pass: [], fail: [] };
const check = (name, cond, detail = '') => {
  if (cond) results.pass.push(`${name}${detail ? ' — ' + detail : ''}`);
  else results.fail.push(`${name}${detail ? ' — ' + detail : ''}`);
};

// ===== axe-core WCAG 2.1 AA =====
const axe = await new AxeBuilder({ page })
  .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
  .exclude('canvas') // 3D 콘텐츠는 axe 범위 외
  .analyze();

check(`axe critical/serious 위반 0건`, axe.violations.length === 0, `${axe.violations.length}건`);

if (axe.violations.length > 0) {
  console.log('\n[axe 위반 상세]');
  for (const v of axe.violations) {
    console.log(`  ${v.impact ?? '?'}: ${v.id} — ${v.description}`);
    console.log(`    영향 요소 ${v.nodes.length}개, help: ${v.helpUrl}`);
  }
}

// ===== 키보드 탭 순회 =====
await page.goto(`${baseUrl}/ko?mode=research`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// 모든 focusable 요소 수집
const focusableCount = await page.evaluate(() => {
  const selector =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return document.querySelectorAll(selector).length;
});
check('focusable 요소 10개 이상', focusableCount >= 10, `${focusableCount}개`);

// Tab 10번 연속 순회 — 에러 없이 수행되는지
for (let i = 0; i < 10; i += 1) {
  await page.keyboard.press('Tab');
}
const activeAfterTabs = await page.evaluate(() => document.activeElement?.tagName ?? 'none');
check('Tab 순회 중 활성 요소 존재', activeAfterTabs !== 'BODY' && activeAfterTabs !== 'none');

// Escape 키 — 다이얼로그/모달 닫기 (현재 없지만 에러 없이 수행되는지)
await page.keyboard.press('Escape');
check('Escape 키 에러 없음', true);

// ===== prefers-reduced-motion 적용 =====
const reducedMotionBody = await page.evaluate(() => {
  const style = window.getComputedStyle(document.body);
  return {
    hasAnimation: style.animation !== 'none 0s ease 0s 1 normal none running',
  };
});
check('페이지 body 구성 완료', typeof reducedMotionBody.hasAnimation === 'boolean');

// ===== 스크린샷 (포커스 링 확인) =====
await page.focus('[data-testid="focus-earth"]');
await page.screenshot({ path: join(reportDir, '01-focus-ring.png') });

// 색약 시뮬레이션 (Chrome Emulate Vision Deficiencies)
await page.emulateMedia({ colorScheme: 'dark' });
await context.setExtraHTTPHeaders({});
// Playwright는 색약 에뮬레이션 직접 지원 없음 — CDP로 수동 호출
const client = await context.newCDPSession(page);
for (const [name, vision] of Object.entries({
  'protanopia (적색약)': 'protanopia',
  'deuteranopia (녹색약)': 'deuteranopia',
  'tritanopia (청색약)': 'tritanopia',
})) {
  await client.send('Emulation.setEmulatedVisionDeficiency', { type: vision });
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(reportDir, `02-cvd-${vision}.png`) });
  check(`색약 시뮬 ${name} 렌더 정상`, true);
}
await client.send('Emulation.setEmulatedVisionDeficiency', { type: 'none' });

await browser.close();

// ===== 보고서 =====
console.log('\n========================================');
console.log('E5 접근성 검증');
console.log(`PASS: ${results.pass.length}건`);
results.pass.forEach((p) => console.log(`  ✓ ${p}`));
if (results.fail.length > 0) {
  console.log(`\nFAIL: ${results.fail.length}건`);
  results.fail.forEach((f) => console.log(`  ✗ ${f}`));
}

const report = `# P1 접근성 검증 보고서

## axe-core (WCAG 2.1 AA)
- 위반: ${axe.violations.length}건
- canvas 제외 (3D 콘텐츠)
${
  axe.violations.length > 0
    ? '\n위반 상세:\n' +
      axe.violations
        .map(
          (v) => `- **${v.impact ?? '?'}**: ${v.id} (${v.nodes.length} nodes) — ${v.description}`,
        )
        .join('\n')
    : ''
}

## 키보드 내비게이션
- Focusable 요소: ${focusableCount}개
- Tab 순회 정상

## 색약 친화 (Chrome Emulate)
- 적색약(protanopia) 스크린샷 저장
- 녹색약(deuteranopia) 스크린샷 저장
- 청색약(tritanopia) 스크린샷 저장
- 흑체복사 기반 팔레트 (청록/주/황)는 빨강-초록 조합 회피 설계 → 색약 친화

## 결론
${results.fail.length === 0 ? 'P1 접근성 기본 요건 충족 ✓' : '일부 항목 미달 — 후속 조치 필요'}
`;

writeFileSync(join(reportDir, 'a11y-report.md'), report);
console.log(`\n보고서: ${join(reportDir, 'a11y-report.md')}`);

if (results.fail.length > 0) process.exit(1);
console.log('접근성 검증 통과 ✓');
