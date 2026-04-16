#!/usr/bin/env node
/**
 * P4-B #164 — WebGPU 엔진 활성 회귀 가드.
 *
 * 목적: `engine=webgpu` URL 진입 시 실제 WebGPU 경로가 사용되는지 실측.
 * P3 회고에서 "Babylon 자동 fallback 정책에 의존하느라 GPU compute 경로 미사용"이
 * 진짜로 해소됐는지 CI에서 지속 감시한다.
 *
 * 검증 조건:
 *   1. `--enable-unsafe-webgpu` flag를 반드시 명시 (기본값 의존 금지)
 *   2. HUD에 "renderer · webgpu" 노출
 *   3. capability polling notice 미표시 (WebGPU 활성 환경 기준)
 *   4. 콘솔에 WebGPU 관련 error 없음
 *
 * 사용: node scripts/browser-verify-webgpu.mjs [baseUrl]
 * 기본 URL: http://localhost:3001
 *
 * 주의: 환경이 WebGPU 미지원이면 (헤드리스 구버전 등) Barnes-Hut 폴백이 정상 동작.
 *       그 경우 본 스크립트는 SKIP 처리하고 exit 0 — 단, warning 로그.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const baseUrl = process.argv[2] ?? 'http://localhost:3001';
const __dirname = dirname(fileURLToPath(import.meta.url));
const shotDir = join(__dirname, '..', '.verify-screenshots', 'webgpu');
mkdirSync(shotDir, { recursive: true });

// P3-D #154 · P4-B #164 — vsync 해제 + WebGPU flag 명시 (기본값 의존 금지).
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=metal'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  const mark = pass ? '✓' : '✗';
  console.log(`  ${mark} ${name}${detail ? ' — ' + detail : ''}`);
};

// ===== 0. WebGPU capability 감지 =====
console.log('\n[0/3] WebGPU capability 감지');
await page.goto(`${baseUrl}/ko`, { waitUntil: 'networkidle' });
const hasAdapter = await page.evaluate(async () => {
  if (!navigator.gpu) return false;
  try {
    return (await navigator.gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
});

if (!hasAdapter) {
  console.log('  ⊘ WebGPU adapter 없음 — 환경 미지원, 가드 SKIP (exit 0)');
  console.log('     (프로덕션 Chrome/Edge는 자동 폴백으로 Barnes-Hut 사용 — 정상)');
  await browser.close();
  process.exit(0);
}
check('navigator.gpu adapter 획득', true);

// ===== 1. 정적: engine=webgpu URL 진입 =====
console.log('\n[1/3] 정적 — engine=webgpu 진입');
await page.goto(`${baseUrl}/ko?engine=webgpu&belt=2000`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000); // Babylon 초기화 + scene mount

// HUD 우상단 뱃지에서 직접 읽는다. body textContent는 인접 뱃지와 합쳐져
// "webgpuTier 1" 같은 토큰 경계 없는 문자열이 되므로 selector 기반으로 격리.
const hudText = (await page.textContent('[data-testid="hud-top-right"]')) ?? '';
const rendererMatch = hudText.match(/renderer\s*·\s*(webgpu|webgl2)/)?.[1];
check(
  'HUD renderer · webgpu 표시',
  rendererMatch === 'webgpu',
  `실제: renderer · ${rendererMatch ?? '없음'}`,
);

const noticeText = await page
  .locator('[data-testid="engine-notice"]')
  .textContent()
  .catch(() => null);
check(
  'capability polling notice 미표시',
  !noticeText || !/WebGPU 미지원/.test(noticeText),
  noticeText ? `notice: ${noticeText.slice(0, 80)}` : '없음',
);

await page.screenshot({ path: join(shotDir, '1-webgpu-static.png') });

// ===== 2. 인터랙션: 시간 재생 중 런타임 오류 없음 =====
console.log('\n[2/3] 인터랙션 — 시간 재생 + GPU compute 경로');
await page.click('[data-testid="time-play"]').catch(() => {});
await page.waitForTimeout(2500);

const hasWebGpuErr = consoleErrors.some((e) =>
  /webgpu|WebGPUEngine|createComputeShader|ComputeShader/i.test(e),
);
check(
  'WebGPU 관련 console error 없음',
  !hasWebGpuErr,
  hasWebGpuErr ? consoleErrors.filter((e) => /webgpu/i.test(e)).join(' | ') : '',
);
await page.screenshot({ path: join(shotDir, '2-webgpu-playing.png') });

// ===== 3. 흐름: reload 후에도 webgpu 유지 =====
console.log('\n[3/3] 흐름 — reload 후 WebGPU 경로 유지');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const hudAfterReload = (await page.textContent('[data-testid="hud-top-right"]')) ?? '';
const rendererAfter = hudAfterReload.match(/renderer\s*·\s*(webgpu|webgl2)/)?.[1];
check(
  'reload 후 renderer · webgpu 유지',
  rendererAfter === 'webgpu',
  `실제: renderer · ${rendererAfter ?? '없음'}`,
);
await page.screenshot({ path: join(shotDir, '3-webgpu-reload.png') });

await browser.close();

console.log('\n========================================');
const pass = results.filter((r) => r.pass).length;
const fail = results.filter((r) => !r.pass).length;
console.log(`통과: ${pass} / 실패: ${fail}`);
if (fail > 0) {
  console.log('\n실패 항목:');
  results
    .filter((r) => !r.pass)
    .forEach((r) => console.log(`  ✗ ${r.name}${r.detail ? ' — ' + r.detail : ''}`));
  process.exit(1);
}
console.log('✓ P4-B WebGPU 회귀 가드 통과');
