#!/usr/bin/env node
/**
 * P7-D #209 — 모바일 emulation 구조 게이트 (1차).
 *
 * DoD 커버리지:
 *   - D1: iPhone 14 emulation + `?bh=2` 로드 → JD 3초 이상 진행 + 콘솔 에러 0
 *   - D3: 모바일 UA + `navigator.gpu` 차단 시 `tier-c-graceful-degradation` key 노티 노출
 *         + dismiss 후 `webgpu-fallback` 키 다른 알림 정상 표시 (key 분리 동작)
 *
 * ## 알림 키 기대값 갱신 (#932 — P11-C #290 리네임 미반영 drift)
 *
 * 본 스크립트는 P7-D #209 시점의 구 키 `mobile-webgpu-best-effort` 를 기대하고 있었고,
 * 로컬에서 **선재 실패 4건**(exit 1) 으로 잔존했다 (PR #931 검증 중 발견). 실측 관측값은
 * `tier-c-graceful-degradation`.
 *
 * 판별 결과 = **(c) 기대값 낡음** (환경 특성 아님). 근거 2축:
 *   1. 리네임이 명시 계약이다 — `apps/web/src/core/detect-gpu-tier.ts` 헤더 §7:
 *      "알림 키는 반드시 'tier-c-graceful-degradation' 사용. 구 키 'mobile-webgpu-best-effort' 금지".
 *      저장소 전체에 구 키를 발행하는 코드 경로는 **0개** (주석 참조만 잔존) → 구 키 기대는
 *      구조적으로 도달 불가능했다.
 *   2. 환경 비의존이 순수 함수로 증명된다 — 시나리오 3/4 는 `navigator.gpu` 를 명시 차단하므로
 *      `detectGpuTier()` 의 분기 1(모바일+WebGPU 미지원 → 'c') 과 분기 2(WebGPU 미지원 → 'c')
 *      **양쪽 모두** tier-c 를 반환한다. adapter 분류(분기 3) 에 도달하지 않으므로 호스트
 *      GPU/렌더러 경로(metal vs swiftshader)가 판정을 바꿀 여지가 없다.
 *      (이슈 #932 가 의심한 "로컬 렌더러 경로 의존" 가설은 이 지점에서 기각된다.)
 *
 * 한계 (P4-C 선례와 동일):
 *   - Playwright는 Chromium 기반 iPhone emulation — UA/viewport만 Safari 흉내.
 *   - 실제 iOS Safari WebGPU 동작은 실기기에서만 정확 측정 가능.
 *   - 본 스크립트는 **구조적 회귀**(크래시/경고 경로/UI 렌더)만 차단한다.
 *   - 성능 측정은 `scripts/bench-scene-mobile.mjs` 또는 실기기 수동 측정.
 *
 * 사용: node scripts/browser-verify-mobile-p7d.mjs [baseUrl]
 */
import { devices } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  pressTimePlay,
  hasSimErrors,
  withBrowser,
  buildLaunchOptions,
  resolveBaseUrl,
} from './browser-verify-utils.mjs';

// argv[2] 는 로컬 수동 실행 편의 (포트 임의 지정). 미지정 시 resolveBaseUrl() 로
// BASE_URL 해석 + 후행 슬래시 정규화 (docs/ops/browser-verify-helpers.md 체크리스트).
const baseUrl = process.argv[2]?.replace(/\/+$/, '') ?? resolveBaseUrl('http://localhost:3001');

/**
 * tier-c graceful degradation 알림 키 (#290 SSoT — `detect-gpu-tier.ts` 헤더 §7).
 * 구 키 `mobile-webgpu-best-effort` 는 폐기됐다 (위 헤더 §알림 키 기대값 갱신 참조).
 */
const TIER_C_NOTICE_KEY = 'tier-c-graceful-degradation';
/** key 분리(dismiss 격리) 검증용 대조 키 — tier-c 와 무관한 별개 알림. */
const FALLBACK_NOTICE_KEY = 'webgpu-fallback';
const __dirname = dirname(fileURLToPath(import.meta.url));
const shotDir = join(__dirname, '..', '.verify-screenshots', 'mobile-p7d');
mkdirSync(shotDir, { recursive: true });

const deviceProfile = devices['iPhone 14'];

// 결과 집계는 브라우저 종료 뒤라 콜백 밖에 둔다 (#927).
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
};

// #927 — 에러 경로(goto 실패 등)에서도 close 도달 보장.
// 시나리오별 ctx.close() 는 원본 유지 — 본 래퍼는 browser 수명주기만 책임진다.
//
// #932 — 렌더러 축을 하드코딩 `--use-angle=metal` 에서 `GPU_LAUNCH_ARGS` SSoT 로 이관.
//   metal 백엔드는 macOS 전용이라 ubuntu CI 배선 시 그대로는 이식 불가능하다.
//   로컬 기본값은 'metal' 로 **불변**(기존 측정 조건 보존)이고, CI 는 `BROWSER_VERIFY_GPU=swiftshader`
//   로 결정성 렌더러를 주입한다 (browser-verify-utils.mjs §렌더러 선택 축 SSoT / 체크리스트 1번).
await withBrowser(
  buildLaunchOptions({
    gpu: process.env.BROWSER_VERIFY_GPU ?? 'metal',
    args: [
      '--enable-unsafe-webgpu',
      '--enable-features=Vulkan',
      '--disable-gpu-vsync',
      '--disable-frame-rate-limit',
    ],
  }),
  async (browser) => {
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

      await page.goto(`${baseUrl}/?bh=2`, { waitUntil: 'networkidle' });
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
      // P7-E #210 — pre-assert 후 click.
      await pressTimePlay(page, { skipIfAbsent: true });
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
      check(
        '콘솔 에러 0건 (bh=2)',
        consoleErrors.length === 0,
        consoleErrors.slice(0, 3).join(' | '),
      );
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
      await page.goto(`${baseUrl}/?bh=2&integrator=yoshida4`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      // P7-E #210 — pre-assert 후 click.
      await pressTimePlay(page, { skipIfAbsent: true });
      await page.waitForTimeout(5000);
      const badge = page.locator('[data-testid="integrator-badge"]');
      check('integrator-badge 렌더 (조합)', (await badge.count()) === 1);
      const badgeText = (await badge.textContent()) ?? '';
      check('배지 텍스트 yoshida4 포함', badgeText.includes('yoshida4'), badgeText.trim());
      // P7-E #210 — 1차 기준 + 상세 regex 보조.
      check(
        '5초 재생 중 콘솔 에러 0건 (1차)',
        consoleErrors.length === 0,
        `errors=${consoleErrors.length}`,
      );
      check(
        '5초 재생 중 시뮬레이션 핵심 에러 0건 (2차)',
        !hasSimErrors(consoleErrors, { allowExternal: true }),
      );
      await page.screenshot({ path: join(shotDir, '2-bh2-yoshida4.png') });
      await ctx.close();
    }

    // ===== Scenario 3: 모바일 UA + WebGPU 차단 → tier-c-graceful-degradation 노티 =====
    console.log(`\n[3/4] 모바일 + navigator.gpu 차단 → ${TIER_C_NOTICE_KEY} 노티`);
    {
      const ctx = await browser.newContext({ ...deviceProfile });
      // iOS Safari <17.4 환경 시뮬레이션 — navigator.gpu 명시 차단.
      await ctx.addInitScript(() => {
        Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
      });
      const page = await ctx.newPage();
      await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
      const notice = page.locator('[data-testid="engine-notice"]');
      check('engine-notice 노출', (await notice.count()) >= 1);
      const key = await notice.getAttribute('data-notice-key');
      check(`data-notice-key === ${TIER_C_NOTICE_KEY}`, key === TIER_C_NOTICE_KEY, String(key));
      await page.screenshot({ path: join(shotDir, '3-mobile-warning.png') });
      await ctx.close();
    }

    // ===== Scenario 4: key 분리 dismiss — A key 닫은 뒤 B key 표시 가능 =====
    // P7-E #210 / #221 — dev-only `window.__simStore` 노출로 스킵 분기 제거, 실제
    // dismiss 통합 검증 (architect §핵심 결정 4). store 미노출 환경에서는 명시 FAIL.
    console.log('\n[4/4] key-scoped dismiss — mobile 키 닫아도 다른 key 알림은 정상 (UI 통합)');
    {
      const ctx = await browser.newContext({ ...deviceProfile });
      await ctx.addInitScript(() => {
        Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
      });
      const page = await ctx.newPage();
      await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);

      // Pre-assert: dev-only `window.__simStore` 가 반드시 노출되어야 한다.
      // (prod 빌드에서 이 스크립트를 실행하는 경우 FAIL — dev 서버로만 실행해야 함.)
      const winHasStore = await page.evaluate(
        () =>
          typeof window.__simStore !== 'undefined' &&
          typeof window.__simStore.getState === 'function',
      );
      check(
        'window.__simStore dev-only 노출 확인 (#221)',
        winHasStore === true,
        String(winHasStore),
      );

      // 1) tier-c 키가 실제 노출되었는지 pre-check (scenario 3 회귀 방지).
      const initialKey = await page
        .locator('[data-testid="engine-notice"]')
        .first()
        .getAttribute('data-notice-key')
        .catch(() => null);
      check(
        `초기 알림 key === ${TIER_C_NOTICE_KEY} (pre-check)`,
        initialKey === TIER_C_NOTICE_KEY,
        String(initialKey),
      );

      // 2) tier-c 키 dismiss — 버튼 존재 assert + 실제 dismiss.
      const dismissBtn = page.locator('[data-testid="engine-notice-dismiss"]');
      const dismissCount = await dismissBtn.count();
      check('engine-notice-dismiss 버튼 존재', dismissCount === 1, String(dismissCount));
      await dismissBtn.click();
      await page.waitForTimeout(300);
      const afterDismissCount = await page.locator('[data-testid="engine-notice"]').count();
      check('dismiss 후 알림 사라짐', afterDismissCount === 0);

      // 3) dismissedNoticeKeys 에 tier-c 키가 기록됨을 스토어에서 직접 확인 (차단 근거).
      const dismissedHasTierC = await page.evaluate((noticeKey) => {
        const st = window.__simStore.getState();
        return st.dismissedNoticeKeys instanceof Set
          ? st.dismissedNoticeKeys.has(noticeKey)
          : false;
      }, TIER_C_NOTICE_KEY);
      check(
        `store.dismissedNoticeKeys 에 ${TIER_C_NOTICE_KEY} 기록`,
        dismissedHasTierC === true,
        String(dismissedHasTierC),
      );

      // 4) 같은 key 재노출 시도 → 차단되어야 한다 (no-op 검증).
      await page.evaluate((noticeKey) => {
        window.__simStore.getState().setEngineNotice({
          key: noticeKey,
          message: '중복 재노출 시도',
        });
      }, TIER_C_NOTICE_KEY);
      await page.waitForTimeout(200);
      const reBlockedCount = await page.locator('[data-testid="engine-notice"]').count();
      check('dismiss된 key 재노출 차단', reBlockedCount === 0, String(reBlockedCount));

      // 5) 다른 key 알림(`webgpu-fallback`) 호출 → 정상 표시되어야 한다 (key 분리 핵심).
      await page.evaluate((noticeKey) => {
        window.__simStore.getState().setEngineNotice({
          key: noticeKey,
          message: 'WebGPU 미지원 — Barnes-Hut로 폴백 (테스트).',
        });
      }, FALLBACK_NOTICE_KEY);
      await page.waitForTimeout(300);
      const reappearedCount = await page.locator('[data-testid="engine-notice"]').count();
      check('다른 key 알림은 정상 표시 (UI 통합)', reappearedCount >= 1, String(reappearedCount));
      const reappearedKey = await page
        .locator('[data-testid="engine-notice"]')
        .first()
        .getAttribute('data-notice-key')
        .catch(() => null);
      check(
        `재노출된 알림 key === ${FALLBACK_NOTICE_KEY}`,
        reappearedKey === FALLBACK_NOTICE_KEY,
        String(reappearedKey),
      );

      await page.screenshot({ path: join(shotDir, '4-key-isolation.png') });
      await ctx.close();
    }
  },
);

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
