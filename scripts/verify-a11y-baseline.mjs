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
        shortcutBarFontPx !== null ? +(shortcutBarFontPx - SHORTCUT_BAR_FONT_MIN_PX).toFixed(2) : null,
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

await browser.close();

const current = {
  version: 1,
  measuredAt: new Date().toISOString().slice(0, 10),
  issue: '#535',
  wcagVersion: '2.2 AA',
  viewports: viewportResults,
  moonOrbitContrast: computeMoonOrbitContrast(),
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
