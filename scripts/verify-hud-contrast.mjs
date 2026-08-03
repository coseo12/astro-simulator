#!/usr/bin/env node
/**
 * #749 — canvas 위 HUD 텍스트 배경 무관 대비 정적 가드.
 *
 * ## 왜 axe 가 아닌 별도 가드인가
 * `verify-a11y-baseline.mjs` 의 axe `color-contrast` 스캔은 `.exclude('canvas')` 라
 * canvas 바로 위에 떠 있는 반투명 HUD 의 실효 대비를 **원천 측정 불가**(ADR 측정 3-1).
 * 밝은 천체(태양 disk 등)가 HUD 박스 뒤로 투과하면 텍스트 실효 대비가 1.86~2.65:1 로
 * AA 미달이지만 axe 는 더미/기본 canvas 만 봐서 못 잡는다 (#740 cross-validate agy 지적).
 *
 * ## 가드 방식 — 정적 CSS 속성 검사 (ADR §결정 3, ROI (i))
 * `[data-hud-chip]` 마커가 붙은 모든 HUD 텍스트 박스에 대해 computed style 을 읽어:
 *   1. 배경(`background-color`) 이 canvas 휘도 무관 대비를 보장할 만큼 충분히 어두운가:
 *      해당 backing 을 **worst-case canvas (sun-white rgb 255,255,255)** 위에
 *      alpha-composite 한 유효 배경 vs 텍스트색(computed `color`) 의 WCAG 대비 ≥ 4.5:1.
 *   2. 시각 보조 `text-shadow` 가 존재하는가 (정량 보장 아님 — 글리프 외곽 가독성 보강).
 * 둘 중 (1) 배경 강화가 정량 1차 보장. (2) 는 device 존재만 추가 확인.
 *
 * ## precision 매칭 (ADR §가드 precision 주의, guard-design-principles)
 * broad 정규식(예: "hud-corners 에 text-shadow 클래스 존재") 금지. `data-hud-chip`
 * **명시 마커**가 붙은 요소만 대상 — false-positive/negative 차단. 마커 부재 시 빈 집합
 * 이 되어 가드가 조용히 통과하지 않도록, 최소 기대 개수 미만이면 fail-fast.
 *
 * ## fail-fast (fallback 금지, guard-design-principles)
 * 대상 박스 중 하나라도 sun-white 위 < 4.5:1 이면 즉시 fail (exit 1). fallback 분기 없음.
 *
 * 운영:
 *   - 일반: `node scripts/verify-hud-contrast.mjs` (BASE_URL 또는 positional URL, 기본 :3001)
 *   - 3중 시뮬레이션 (가드 자기검증, ADR DoD negative 입증):
 *       `node scripts/verify-hud-contrast.mjs --simulate-fail`  → 더미 미달 backing 주입 후 fail 확인
 */
import { withBrowser } from './browser-verify-utils.mjs';

const positionalUrl = process.argv.slice(2).find((a) => !a.startsWith('--'));
const baseUrl = process.env.BASE_URL ?? positionalUrl ?? 'http://localhost:3001';

// negative 입증 모드 — 의도적으로 미달 backing 을 주입해 가드가 fail 하는지 확인.
const SIMULATE_FAIL = process.argv.includes('--simulate-fail');

// WCAG AA 본문 대비 임계.
const WCAG_AA_TEXT_MIN = 4.5;
// HUD 박스 최소 기대 개수 — 마커 누락/오타로 0 개가 되면 가드가 조용히 통과하는 사각 차단.
// 기본 진입 화면에서 항상 보이는 박스: JD(좌상) / renderer(우상) / tier(우하) / scale-label = 4.
const MIN_EXPECTED_CHIPS = 3;
// worst-case canvas 픽셀 — 태양 disk / 밝은 천체 white-out.
const SUN_WHITE = { r: 255, g: 255, b: 255 };

/** WCAG relative luminance (sRGB 0~255). */
function relLum({ r, g, b }) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrastRatio(a, b) {
  const la = relLum(a);
  const lb = relLum(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
/** src(α) over 불투명 dst — alpha compositing. */
function over(src, alpha, dst) {
  return {
    r: src.r * alpha + dst.r * (1 - alpha),
    g: src.g * alpha + dst.g * (1 - alpha),
    b: src.b * alpha + dst.b * (1 - alpha),
  };
}

/**
 * computed `background-color` / `color` 직렬화 파싱 → { r, g, b, a } (r,g,b: 0~255, a: 0~1).
 * 두 형태 모두 지원:
 *   - `rgb(r, g, b)` / `rgba(r, g, b, a)`  (0~255 정수)
 *   - `color(srgb R G B / A)`  (0~1 부동소수, CSS Color L4 — `color-mix()` 가 이 형태로 직렬화됨)
 */
function parseColor(str) {
  // color(srgb R G B / A) — color-mix(in srgb, ...) computed 직렬화.
  const cm = str.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/);
  if (cm) {
    return {
      r: parseFloat(cm[1]) * 255,
      g: parseFloat(cm[2]) * 255,
      b: parseFloat(cm[3]) * 255,
      a: cm[4] !== undefined ? parseFloat(cm[4]) : 1,
    };
  }
  // rgb()/rgba() — 일반 직렬화.
  const m = str.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
  }
  return null;
}

// #933 — 에러 경로(goto 실패 / evaluate throw)에서도 close 도달 보장 (#927 헬퍼 재사용).
//   launch 인자는 원본 그대로 (무인자) — 수명주기만 위임하고 렌더러 축은 건드리지 않는다.
async function measure() {
  return withBrowser({}, async (browser) => {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // negative 입증 — 더미 미달 backing 을 주입한 chip 을 추가해 가드 fail 을 강제.
    if (SIMULATE_FAIL) {
      await page.evaluate(() => {
        const el = document.createElement('div');
        el.setAttribute('data-hud-chip', '');
        // 반투명 밝은 배경 → sun-white 위 미달 (회귀 시나리오 재현).
        el.style.backgroundColor = 'rgba(20, 23, 33, 0.6)';
        el.style.color = 'rgb(155, 163, 184)';
        el.style.position = 'fixed';
        el.style.top = '0';
        el.style.left = '0';
        el.textContent = 'SIMULATED FAIL CHIP';
        document.body.appendChild(el);
      });
    }

    // [data-hud-chip] 박스 전수 computed style 수집 (precision 매칭 — 마커 기반).
    const chips = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('[data-hud-chip]'));
      return nodes.map((n) => {
        const cs = window.getComputedStyle(n);
        return {
          testid: n.getAttribute('data-testid') ?? n.getAttribute('data-r1-region') ?? '(unnamed)',
          backgroundColor: cs.backgroundColor,
          color: cs.color,
          textShadow: cs.textShadow,
        };
      });
    });

    return chips;
  });
}

const chips = await measure();

console.log('========================================');
console.log(`HUD 텍스트 배경 무관 대비 가드 (#749) — ${baseUrl}/`);
console.log(`worst-case canvas = sun-white rgb(255,255,255), WCAG AA ≥ ${WCAG_AA_TEXT_MIN}:1\n`);

const failures = [];

if (chips.length < MIN_EXPECTED_CHIPS) {
  failures.push(
    `[data-hud-chip] 박스 ${chips.length}개 발견 — 최소 ${MIN_EXPECTED_CHIPS}개 기대. 마커 누락/오타 의심 (가드 사각 방지 fail-fast).`,
  );
}

for (const chip of chips) {
  const bg = parseColor(chip.backgroundColor);
  const fg = parseColor(chip.color);
  if (!bg || !fg) {
    failures.push(
      `[${chip.testid}] color 파싱 실패 (bg="${chip.backgroundColor}" fg="${chip.color}")`,
    );
    continue;
  }
  // backing 을 sun-white 위에 alpha-composite → 유효 배경.
  const eff = over({ r: bg.r, g: bg.g, b: bg.b }, bg.a, SUN_WHITE);
  const cr = contrastRatio({ r: fg.r, g: fg.g, b: fg.b }, eff);
  const hasShadow = chip.textShadow && chip.textShadow !== 'none';
  const pass = cr >= WCAG_AA_TEXT_MIN;
  const mark = pass ? '✅' : '❌';
  console.log(
    `  ${String(chip.testid).padEnd(18)} sun-white 위 ${cr.toFixed(2)}:1 ${mark}  (bg α=${bg.a}, text-shadow=${hasShadow ? 'yes' : 'NONE'})`,
  );
  if (!pass) {
    failures.push(
      `[${chip.testid}] sun-white 위 ${cr.toFixed(2)}:1 < ${WCAG_AA_TEXT_MIN}:1 — backing 이 밝은 천체 투과 시 AA 미달. bg=${chip.backgroundColor}`,
    );
  }
  // text-shadow 부재는 정량 미달이 아니므로 fail 은 아니나 시각 보조 누락 경고.
  if (!hasShadow) {
    console.log(
      `    ⚠ ${chip.testid}: text-shadow 부재 — 시각 보조 누락 (정량은 backing 으로 충족됨).`,
    );
  }
}

if (failures.length > 0) {
  console.log('\n✗ HUD 대비 가드 실패:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}

console.log(
  `\n✓ HUD 박스 ${chips.length}개 전부 sun-white worst-case 위 ≥ ${WCAG_AA_TEXT_MIN}:1 (배경 무관 대비 보장)`,
);
process.exit(0);
