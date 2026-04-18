#!/usr/bin/env node
/**
 * #107 브라우저 3단계 — 질량 슬라이더.
 * 1. 정적: 연구 모드 + jupiter 선택 시 슬라이더 렌더, Kepler면 disabled
 * 2. 인터랙션: Newton 전환 + 프리셋 5× 클릭 → store + UI 반영
 * 3. 흐름: 리셋 → 슬라이더 1.0 복귀, 시간 재생 중 콘솔 에러 없음
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pressTimePlay } from './browser-verify-utils.mjs';

const baseUrl = process.argv[2] ?? 'http://localhost:3001';
const __dirname = dirname(fileURLToPath(import.meta.url));
const shotDir = join(__dirname, '..', '.verify-screenshots', 'mass-slider');
mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errs = [];
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));

const out = [];
const check = (n, p, d = '') => {
  out.push({ n, p });
  console.log(`  ${p ? '✓' : '✗'} ${n}${d ? ' — ' + d : ''}`);
};

console.log('\n[1/3] 정적 — 연구 모드 + jupiter focus (Kepler)');
await page.goto(`${baseUrl}/ko?mode=research`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
// focus 버튼으로 선택 (URL focus 파라미터는 적용 시점이 불확정이라 클릭이 안정적)
await page.click('[data-testid="focus-jupiter"]');
await page.waitForTimeout(800);
check('정보 패널 표시', (await page.locator('[data-testid="panel-right"]').count()) === 1);
await page.locator('[data-testid="mass-slider"]').waitFor({ timeout: 5000 });
check('질량 슬라이더 존재', (await page.locator('[data-testid="mass-slider"]').count()) === 1);
const kDisabled = await page.locator('[data-testid="mass-slider-input"]').isDisabled();
check('Kepler 모드에서 disabled', kDisabled);
await page.screenshot({ path: join(shotDir, '1-kepler-disabled.png') });

console.log('\n[2/3] 인터랙션 — Newton 전환 + 5× 프리셋');
await page.click('[data-testid="engine-newton"]');
await page.waitForTimeout(500);
const nDisabled = await page.locator('[data-testid="mass-slider-input"]').isDisabled();
check('Newton 전환 후 enabled', !nDisabled);
await page.click('[data-testid="mass-preset-5"]');
await page.waitForTimeout(500);
const valueAfterPreset = await page.locator('[data-testid="mass-slider-input"]').inputValue();
check('5× 프리셋 → 슬라이더 값 5', valueAfterPreset === '5');
await page.screenshot({ path: join(shotDir, '2-newton-5x.png') });

console.log('\n[3/3] 흐름 — 리셋 + 재생');
await page.click('[data-testid="mass-reset"]');
await page.waitForTimeout(300);
const afterReset = await page.locator('[data-testid="mass-slider-input"]').inputValue();
check('리셋 → 1', afterReset === '1');
const before = errs.length;
// P7-E #210 — silent-fail 방지.
await pressTimePlay(page, { skipIfAbsent: true });
await page.waitForTimeout(1500);
check('재생 중 콘솔 에러 없음', errs.length === before);
await page.screenshot({ path: join(shotDir, '3-after-reset-playing.png') });

await browser.close();
const pass = out.filter((r) => r.p).length;
console.log(`\n결과: ${pass}/${out.length} PASS`);
if (errs.length) errs.slice(0, 5).forEach((e) => console.log(' ', e));
if (pass < out.length) process.exit(1);
