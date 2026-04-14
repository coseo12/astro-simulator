#!/usr/bin/env node
/**
 * #108 브라우저 3단계 — 시간 포함 URL 북마크.
 * 1. 정적: TopBar에 북마크 버튼 렌더
 * 2. 인터랙션: 시간 이동 + Newton 전환 + focus → 북마크 클릭 → 클립보드 URL 유효
 * 3. 흐름: 복사된 URL로 새 페이지 로드 → 상태(engine/focus) 복원
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const baseUrl = process.argv[2] ?? 'http://localhost:3001';
const __dirname = dirname(fileURLToPath(import.meta.url));
const shotDir = join(__dirname, '..', '.verify-screenshots', 'bookmark');
mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));

const out = [];
const check = (n, p, d = '') => {
  out.push({ n, p });
  console.log(`  ${p ? '✓' : '✗'} ${n}${d ? ' — ' + d : ''}`);
};

console.log('\n[1/3] 정적');
await page.goto(`${baseUrl}/ko`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
check('북마크 버튼 렌더', (await page.locator('[data-testid="bookmark-button"]').count()) === 1);
await page.screenshot({ path: join(shotDir, '1-static.png') });

console.log('\n[2/3] 인터랙션 — Newton + focus + 북마크 클릭');
await page.click('[data-testid="engine-newton"]');
await page.waitForTimeout(300);
await page.click('[data-testid="focus-jupiter"]');
await page.waitForTimeout(500);
await page.click('[data-testid="bookmark-button"]');
await page.waitForTimeout(400);
const copiedText = await page.evaluate(() => navigator.clipboard.readText());
check('클립보드 URL 획득', typeof copiedText === 'string' && copiedText.length > 0, copiedText);
check('URL에 engine=newton 포함', copiedText.includes('engine=newton'));
check('URL에 focus=jupiter 포함', copiedText.includes('focus=jupiter'));
check('URL에 t= 포함', /t=\d+/.test(copiedText));
await page.screenshot({ path: join(shotDir, '2-copied.png') });

console.log('\n[3/3] 흐름 — 새 페이지에서 상태 복원');
await page.goto(copiedText, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const engineActive = await page.getAttribute('[data-testid="engine-newton"]', 'data-active');
check('URL 진입 Newton active', engineActive === 'true');
await page.screenshot({ path: join(shotDir, '3-restored.png') });

await browser.close();
const pass = out.filter((r) => r.p).length;
console.log(`\n결과: ${pass}/${out.length} PASS`);
if (errs.length) errs.slice(0, 5).forEach((e) => console.log(' ', e));
if (pass < out.length) process.exit(1);
