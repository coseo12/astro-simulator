#!/usr/bin/env node
/**
 * #535 — WCAG AA 자동 측정 가드 (R4 cross-validate Gemini 고유 발견 2 후속).
 *
 * 목적: axe-core WCAG 2.2 AA + non-text contrast + 폰트 크기 + 모바일/데스크톱 viewport
 *       baseline 박제 및 회귀 비교. CI 통합으로 PR diff 자동 검증.
 *
 * 측정 항목:
 *   1. axe-core WCAG 2.2 AA (canvas 제외) — viewport 별 violation 수
 *   2. shortcut bar 폰트 크기 — `--text-mini = 0.625rem` 이 모바일에서 가시성 확보 가능한지
 *   3. moon orbit 라인 색상 명도 대비 — WCAG 2.2 AA non-text contrast ≥ 3:1
 *      - default (sun 시점) + earth focus 두 색상 모두 측정
 *   4. (#740) 주요 모달/패널 OPEN 상태 color-contrast 스캔 — 기존 3 항목은 `/ko`
 *      기본 상태만 측정해 패널/모달을 열지 않아 본 결함을 못 봤다 (게이트 사각).
 *      research 패널 + about/sensitivity 모달을 열어 axe `color-contrast` violation 을
 *      surface 별로 측정. baseline 초과 시 fail-fast.
 *
 * 운영:
 *   - 일반 실행: `node scripts/verify-a11y-baseline.mjs` — baseline JSON 과 비교, 회귀 시 fail
 *   - baseline 갱신: `node scripts/verify-a11y-baseline.mjs --update-baseline`
 *   - CI 환경: `BASE_URL=http://localhost:3001 node scripts/verify-a11y-baseline.mjs`
 *
 * 가드 도입 PR DoD §4축 (CLAUDE.md `### 가드 도입 PR DoD`):
 *   (1) 격리 동적 테스트 — 본 스크립트 단독 실행으로 작동 검증
 *   (2) 3중 시뮬레이션 — `scripts/_debug-a11y-guard-tmp.mjs` 로 positive→negative→recovery
 *   (3) 5 페르소나 self-consistency — 본 PR 범위 밖 (추후 별도 이슈)
 *   (4) 메타 안정성 — baseline 재실행 시 결과 일관 (확률적 noise 0)
 *
 * #740 open surface 스캔 설계 (ADR `20260626-740-fg-tertiary-aa-contrast.md` 결정 3-B):
 *   - cross-validate (가) flakiness 방지: 모달/패널 open 후 페이드인 transition
 *     (framer-motion 0.25s slide+opacity, 모달 backdrop-blur) 중 스캔하면 일시 대비 미달
 *     오탐. open 트리거 후 `waitForSurfaceStable` 로 opacity=1 + transition 정착을 보장한
 *     뒤 axe 스캔.
 *   - cross-validate (다) 테스트 전용 셀렉터: open 시퀀스는 마크업 변경에 침묵적 실패
 *     안 하도록 `data-testid` 셀렉터에만 의존 (임의 CSS 클래스 금지). 트리거 부재 시
 *     명시 throw — 가드가 조용히 통과하지 않음.
 */
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const positionalUrl = process.argv.slice(2).find((a) => !a.startsWith('--'));
const baseUrl = process.env.BASE_URL ?? positionalUrl ?? 'http://localhost:3001';
const __dirname = dirname(fileURLToPath(import.meta.url));
const baselinePath = join(__dirname, '..', 'docs', 'benchmarks', 'a11y-baseline.json');
const reportDir = join(__dirname, '..', '.verify-screenshots', 'a11y-baseline');
mkdirSync(reportDir, { recursive: true });

const UPDATE_BASELINE = process.argv.includes('--update-baseline');

// WCAG AA 임계 (1.4.11 Non-text Contrast)
const WCAG_AA_NONTEXT_MIN_CONTRAST = 3.0;
// 실용 폰트 임계 — WCAG 절대 임계 없으나 모바일 가시성 권고치 (--text-mini = 0.625rem = 10px)
const SHORTCUT_BAR_FONT_MIN_PX = 12;

const VIEWPORTS = [
  { id: 'desktop', width: 1280, height: 720 },
  { id: 'mobile', width: 375, height: 667 },
];

/** WCAG relative luminance — sRGB 색상 채널 (0~1) 입력. */
function relativeLuminance({ r, g, b }) {
  const toLinear = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG contrast ratio — 두 luminance 입력. */
function contrastRatio(l1, l2) {
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

// Babylon Color3 (0~1 range) 와 동일 색상 베이스 (SSoT: solar-system-scene.ts L482~)
// #552 — MOON_ORBIT_COLOR_DEFAULT WCAG 1.4.11 ≥ 3:1 (3.06:1) 갱신. SSoT mirror 동기화 (drift 차단, volt #69 패턴).
const MOON_ORBIT_COLORS = {
  default: { r: 0.3, g: 0.35, b: 0.5 }, // MOON_ORBIT_COLOR_DEFAULT — sun 시점 (#552: 0.25/0.28/0.40 → 0.30/0.35/0.50)
  earthFocus: { r: 0.65, g: 0.7, b: 0.85 }, // MOON_ORBIT_COLOR_EARTH_FOCUS — earth focus 강조
};
// 우주 배경 (Babylon scene default clearColor — 일반적으로 black)
const SPACE_BACKGROUND = { r: 0, g: 0, b: 0 };

async function measureViewport(page, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(`${baseUrl}/ko`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // ===== axe-core WCAG 2.2 AA =====
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .exclude('canvas')
    .analyze();

  const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const v of axe.violations) {
    const impact = v.impact ?? 'minor';
    if (byImpact[impact] !== undefined) byImpact[impact] += 1;
  }

  // ===== shortcut bar 폰트 크기 측정 =====
  const shortcutBarFontPx = await page.evaluate(() => {
    const region = document.querySelector('[data-r1-region="shortcut-bar"]');
    if (!region) return null;
    const button = region.querySelector('button');
    if (!button) return null;
    const style = window.getComputedStyle(button);
    return parseFloat(style.fontSize);
  });

  // ===== screenshot (디버그용) =====
  await page.screenshot({
    path: join(reportDir, `${viewport.id}-default.png`),
    fullPage: false,
  });

  return {
    axe: {
      violations: axe.violations.length,
      byImpact,
      ids: axe.violations.map((v) => `${v.impact ?? '?'}:${v.id}`),
    },
    shortcutBar: {
      fontSizePx: shortcutBarFontPx,
      wcagAaMinPx: SHORTCUT_BAR_FONT_MIN_PX,
      marginPx:
        shortcutBarFontPx !== null
          ? +(shortcutBarFontPx - SHORTCUT_BAR_FONT_MIN_PX).toFixed(2)
          : null,
    },
  };
}

function computeMoonOrbitContrast() {
  const bgL = relativeLuminance(SPACE_BACKGROUND);
  const defaultL = relativeLuminance(MOON_ORBIT_COLORS.default);
  const focusL = relativeLuminance(MOON_ORBIT_COLORS.earthFocus);
  return {
    backgroundColorRgb: '#000000',
    default: {
      colorRgb: 'rgb(77, 89, 128)', // #552 — 0.30/0.35/0.50 × 255 = 76.5/89.25/127.5 (반올림)
      contrastRatio: +contrastRatio(defaultL, bgL).toFixed(2),
      meetsAA: contrastRatio(defaultL, bgL) >= WCAG_AA_NONTEXT_MIN_CONTRAST,
    },
    earthFocus: {
      colorRgb: 'rgb(166, 178, 217)',
      contrastRatio: +contrastRatio(focusL, bgL).toFixed(2),
      meetsAA: contrastRatio(focusL, bgL) >= WCAG_AA_NONTEXT_MIN_CONTRAST,
    },
    wcagAaNonTextMin: WCAG_AA_NONTEXT_MIN_CONTRAST,
  };
}

// ===== #740 — OPEN 상태 모달/패널 color-contrast 스캔 =====

// 스캔 대상 surface 정의 (SSoT). 각 surface 는 testid 트리거로만 진입 (cross-validate (다)).
// readyTestId = open 완료를 관측할 컨테이너 testid (마크업 변경 시 명시 실패 → 침묵 통과 차단).
const OPEN_SURFACES = ['research-panels', 'about-modal', 'sensitivity-modal'];

// open 후 페이드인 transition 정착 대기 (cross-validate (가) flakiness 방지).
// framer-motion (패널 0.25s) / backdrop-blur (모달) 가 정착하기 전 axe 스캔하면
// 일시적 낮은 opacity 로 대비 오탐. 컨테이너 opacity===1 + 2프레임 연속 동일을 폴링.
async function waitForSurfaceStable(page, containerSelector, timeoutMs = 5000) {
  await page.waitForSelector(containerSelector, { state: 'visible', timeout: timeoutMs });
  const deadline = Date.now() + timeoutMs;
  let prevOpacity = null;
  let stableCount = 0;
  // opacity 가 1 (또는 변동 없음) 으로 2회 연속 관측되면 정착으로 판정.
  while (Date.now() < deadline) {
    const opacity = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      return parseFloat(window.getComputedStyle(el).opacity);
    }, containerSelector);
    if (opacity === null) {
      await page.waitForTimeout(50);
      continue;
    }
    if (opacity >= 0.99 && prevOpacity !== null && Math.abs(opacity - prevOpacity) < 0.001) {
      stableCount += 1;
      if (stableCount >= 2) return;
    } else {
      stableCount = 0;
    }
    prevOpacity = opacity;
    await page.waitForTimeout(80);
  }
  // 타임아웃 시에도 진행 — axe 가 실 대비를 측정하므로 fail-safe (정착 보장 실패는 측정 noise 로 흡수).
}

// 특정 root 하위에서 axe color-contrast violation 만 카운트.
// WCAG 2.2 AA color-contrast 규칙만 활성 (다른 규칙은 본 가드 범위 외 — surface 별 회귀 추적 명료화).
async function scanColorContrast(page, includeSelector) {
  const builder = new AxeBuilder({ page }).withRules(['color-contrast']).exclude('canvas');
  if (includeSelector) builder.include(includeSelector);
  const result = await builder.analyze();
  const cc = result.violations.filter((v) => v.id === 'color-contrast');
  // node 별 target 셀렉터 + 실패 색상 요약 (회귀 디버깅용).
  const nodes = cc.flatMap((v) =>
    v.nodes.map((n) => ({
      target: Array.isArray(n.target) ? n.target.join(' ') : String(n.target),
      summary: n.failureSummary ?? '',
    })),
  );
  return { violations: cc.reduce((sum, v) => sum + v.nodes.length, 0), nodes };
}

// research 패널 + about/sensitivity 모달을 순차 open 하며 color-contrast 측정.
// desktop viewport 단일 (패널/모달 텍스트 색은 viewport 비의존 — 폰트 크기·대비는 동일).
async function measureOpenSurfaces(page) {
  const results = {};

  // ----- 1. research 패널 (좌/우 사이드 패널 — celestial-info / satellite-info / scenario / tree) -----
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${baseUrl}/ko`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const modeResearch = page.locator('[data-testid="mode-research"]');
  if ((await modeResearch.count()) === 0) {
    throw new Error('[open-surface] mode-research 트리거 부재 — 마크업 변경? (testid 셀렉터 깨짐)');
  }
  await modeResearch.click();
  // AnimatePresence 패널 슬라이드+페이드 정착 대기 (우 패널 = celestial/satellite/scenario).
  await waitForSurfaceStable(page, '[data-testid="panel-right"]');
  await waitForSurfaceStable(page, '[data-testid="panel-left"]');

  // celestial-info-panel 상세를 채우기 위해 천체 1개 선택 (tree-sun — R1 부터 항상 focusable).
  const treeSun = page.locator('[data-testid="tree-sun"]');
  if ((await treeSun.count()) === 0) {
    throw new Error('[open-surface] tree-sun 트리거 부재 — 마크업 변경? (testid 셀렉터 깨짐)');
  }
  await treeSun.click();
  await page.waitForSelector('[data-testid="info-panel"]', { state: 'visible', timeout: 5000 });
  await page.waitForTimeout(500); // 카메라 tween/패널 내용 갱신 안정화.

  results['research-panels'] = await scanColorContrast(page, '[data-testid="panel-right"]');
  // 좌 패널 (celestial-tree nameEn 보조 텍스트) 도 별도 측정 후 합산.
  const left = await scanColorContrast(page, '[data-testid="panel-left"]');
  results['research-panels'].violations += left.violations;
  results['research-panels'].nodes.push(...left.nodes);

  // 패널을 닫는다 (observe 모드 복귀). 패널은 z-[var(--z-panel)] 로 모달 backdrop(z-40)보다 위라,
  // 패널이 열린 채 모달을 열면 패널이 모달 close 버튼의 pointer event 를 가로챈다 (실측 확인).
  await page.locator('[data-testid="mode-observe"]').click();
  await page.waitForSelector('[data-testid="panel-right"]', { state: 'detached', timeout: 5000 });

  // ----- 2. about-modal -----
  const aboutBtn = page.locator('[data-testid="about-button"]');
  if ((await aboutBtn.count()) === 0) {
    throw new Error('[open-surface] about-button 트리거 부재 — 마크업 변경? (testid 셀렉터 깨짐)');
  }
  await aboutBtn.click();
  await waitForSurfaceStable(page, '[data-testid="about-modal"]');
  results['about-modal'] = await scanColorContrast(page, '[data-testid="about-modal"]');
  // 모달 닫기 (다음 모달과 z-index 간섭 방지).
  await page.locator('[data-testid="about-close"]').click();
  await page.waitForSelector('[data-testid="about-modal"]', { state: 'detached', timeout: 5000 });

  // ----- 3. sensitivity-settings-modal -----
  const sensBtn = page.locator('[data-testid="sensitivity-settings-button"]');
  if ((await sensBtn.count()) === 0) {
    throw new Error(
      '[open-surface] sensitivity-settings-button 트리거 부재 — 마크업 변경? (testid 셀렉터 깨짐)',
    );
  }
  await sensBtn.click();
  await waitForSurfaceStable(page, '[data-testid="sensitivity-settings-modal"]');
  results['sensitivity-modal'] = await scanColorContrast(
    page,
    '[data-testid="sensitivity-settings-modal"]',
  );
  await page.locator('[data-testid="sensitivity-close"]').click();

  return results;
}

function compareBaseline(current, baseline) {
  const failures = [];
  for (const vp of VIEWPORTS) {
    const cur = current.viewports[vp.id];
    const base = baseline.viewports[vp.id];
    if (!base) {
      failures.push(`[${vp.id}] baseline 누락 — --update-baseline 로 박제 필요`);
      continue;
    }
    // axe 신규 위반 = 회귀
    if (cur.axe.violations > base.axe.violations) {
      failures.push(
        `[${vp.id}] axe 위반 회귀: ${base.axe.violations}건 → ${cur.axe.violations}건 (신규: ${cur.axe.ids.join(', ')})`,
      );
    }
    // shortcut bar 폰트 축소 = 회귀
    if (
      cur.shortcutBar.fontSizePx !== null &&
      base.shortcutBar.fontSizePx !== null &&
      cur.shortcutBar.fontSizePx < base.shortcutBar.fontSizePx
    ) {
      failures.push(
        `[${vp.id}] shortcut bar 폰트 축소 회귀: ${base.shortcutBar.fontSizePx}px → ${cur.shortcutBar.fontSizePx}px`,
      );
    }
  }
  // moon orbit contrast 회귀
  const curC = current.moonOrbitContrast;
  const baseC = baseline.moonOrbitContrast;
  if (baseC) {
    if (curC.default.contrastRatio < baseC.default.contrastRatio - 0.01) {
      failures.push(
        `moon orbit default 색상 명도 대비 회귀: ${baseC.default.contrastRatio} → ${curC.default.contrastRatio}`,
      );
    }
    if (curC.earthFocus.contrastRatio < baseC.earthFocus.contrastRatio - 0.01) {
      failures.push(
        `moon orbit earth-focus 색상 명도 대비 회귀: ${baseC.earthFocus.contrastRatio} → ${curC.earthFocus.contrastRatio}`,
      );
    }
  }
  // #740 — open surface color-contrast 회귀 (baseline 초과 = 신규 대비 미달 유입).
  const curO = current.openSurfaces;
  const baseO = baseline.openSurfaces;
  if (curO) {
    for (const surface of OPEN_SURFACES) {
      const cur = curO[surface];
      if (!cur) continue;
      // baseline 에 해당 surface 가 없으면 0 을 기준선으로 (신규 surface 는 무위반이 baseline).
      const baseViolations = baseO?.[surface]?.violations ?? 0;
      if (cur.violations > baseViolations) {
        const detail = cur.nodes
          .slice(0, 5)
          .map((n) => n.target)
          .join(', ');
        failures.push(
          `[open:${surface}] color-contrast 위반 회귀: ${baseViolations}건 → ${cur.violations}건 (${detail}${cur.nodes.length > 5 ? ' …' : ''})`,
        );
      }
    }
  }
  return failures;
}

// ===== main =====
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

const viewportResults = {};
for (const vp of VIEWPORTS) {
  console.log(`[verify-a11y-baseline] ${vp.id} (${vp.width}×${vp.height}) 측정 중...`);
  viewportResults[vp.id] = await measureViewport(page, vp);
}

// #740 — open 상태 모달/패널 color-contrast 측정 (게이트 사각 메움).
console.log('[verify-a11y-baseline] open 상태 모달/패널 color-contrast 측정 중...');
const openSurfaces = await measureOpenSurfaces(page);

await browser.close();

const current = {
  version: 1,
  measuredAt: new Date().toISOString().slice(0, 10),
  issue: '#535',
  wcagVersion: '2.2 AA',
  viewports: viewportResults,
  moonOrbitContrast: computeMoonOrbitContrast(),
  openSurfaces, // #740 — surface 별 color-contrast violation 수
};

// 보고서 출력
console.log('\n========================================');
console.log(`WCAG 2.2 AA baseline (#535) — ${current.measuredAt}`);
for (const vp of VIEWPORTS) {
  const r = current.viewports[vp.id];
  console.log(`\n[${vp.id}] ${vp.width}×${vp.height}`);
  console.log(`  axe 위반: ${r.axe.violations}건`);
  if (r.axe.violations > 0) {
    console.log(`    상세: ${r.axe.ids.join(', ')}`);
  }
  console.log(
    `  shortcut bar fontSize: ${r.shortcutBar.fontSizePx}px (WCAG 권고 ≥ ${SHORTCUT_BAR_FONT_MIN_PX}px, margin: ${r.shortcutBar.marginPx ?? 'N/A'}px)`,
  );
}
console.log('\nmoon orbit 색상 명도 대비 (WCAG 2.2 AA non-text ≥ 3:1):');
console.log(
  `  default: ${current.moonOrbitContrast.default.contrastRatio}:1 (${current.moonOrbitContrast.default.meetsAA ? 'PASS' : 'FAIL'})`,
);
console.log(
  `  earth-focus: ${current.moonOrbitContrast.earthFocus.contrastRatio}:1 (${current.moonOrbitContrast.earthFocus.meetsAA ? 'PASS' : 'FAIL'})`,
);

// #740 — open 상태 surface color-contrast 보고
console.log('\nopen 상태 모달/패널 color-contrast (#740, axe color-contrast 규칙):');
for (const surface of OPEN_SURFACES) {
  const r = current.openSurfaces[surface];
  if (!r) {
    console.log(`  ${surface}: 측정 누락`);
    continue;
  }
  console.log(`  ${surface}: ${r.violations}건 위반 (${r.violations === 0 ? 'PASS' : 'FAIL'})`);
  if (r.violations > 0) {
    r.nodes.slice(0, 5).forEach((n) => console.log(`    - ${n.target}`));
  }
}

// baseline 모드 분기
if (UPDATE_BASELINE) {
  writeFileSync(baselinePath, JSON.stringify(current, null, 2) + '\n');
  console.log(`\n✓ baseline 박제: ${baselinePath}`);
  process.exit(0);
}

if (!existsSync(baselinePath)) {
  console.log(`\n⚠ baseline 부재 — --update-baseline 로 첫 박제 필요`);
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const failures = compareBaseline(current, baseline);

if (failures.length > 0) {
  console.log('\n✗ 회귀 감지:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('\n✓ baseline 대비 회귀 없음');

// 보고서 박제
writeFileSync(join(reportDir, 'current.json'), JSON.stringify(current, null, 2) + '\n');
process.exit(0);
