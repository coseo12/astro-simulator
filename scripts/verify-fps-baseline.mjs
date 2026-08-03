#!/usr/bin/env node
/**
 * #536 — 저사양 모바일 FPS 회귀 가드 (R4 cross-validate Gemini 고유 발견 3 후속).
 *
 * 목적: CPU 4x throttling 환경 + 모바일/데스크톱 viewport + default/earth/moon focus
 *       시나리오 baseline 박제 및 회귀 비교. CI 통합으로 PR diff 마다 자동 검증.
 *
 * 측정 환경:
 *   - Playwright chromium headless
 *   - CDP `Emulation.setCPUThrottlingRate` 4x (저사양 기기 모의)
 *   - Mobile viewport 375×667 + Desktop 1280×720
 *   - rAF 카운트 5초 윈도우 (noise 완화)
 *
 * 시나리오 (이슈 #536 명시):
 *   1. default (sun 시점, 진입 직후)
 *   2. earth focus (close-up)
 *   3. moon focus (satellite — R4 신규 인스턴스)
 *
 * 회귀 임계:
 *   - baseline 대비 ≥ 30% 저하 = FAIL (headless rAF noise ±12% 실측 후 보수 마진)
 *   - 절대 < 30 FPS = FAIL (사용자 인지 임계)
 *
 * Note on noise: baseline 첫 측정과 직후 재측정에서 ±12% 변동 관찰 (CPU throttling 4x +
 * dev server hot reload 누적 영향). 마진 ±10% 는 false positive 빈발 → ±30% 채택.
 * 사용자 인지 가능 회귀 ("프레임 1/3 감소") 는 여전히 잡되 noise 흡수.
 *
 * 운영:
 *   - 일반 실행: `node scripts/verify-fps-baseline.mjs`
 *   - baseline 갱신: `node scripts/verify-fps-baseline.mjs --update-baseline`
 *   - CI: `BASE_URL=http://localhost:3001 node scripts/verify-fps-baseline.mjs`
 *   - #820 Phase 0 진단 (측정 전용, 판정 없음): render-capacity 프로브를 rafFps 옆에 병기해
 *     H2(presentation-side, capacity 정상) vs H3(deadline-miss, capacity 저)를 판별한다.
 *     `CPU_THROTTLING_RATE=10 node scripts/verify-fps-baseline.mjs --diagnose-variance`
 *   - #820 Phase 1 판정 (H2 확정 후): 최종 rafFps 가 30Hz 락 대역 [28,36] 이면 render-capacity
 *     프로브로 락(capacity ≥ CAPACITY_FULL_MIN, presentation 아티팩트)/회귀(capacity 저)를 분류.
 *     락은 회귀 실패에서 제외 + STEP_SUMMARY annotation. fail-fast 불변식 — capacity 양성 입증
 *     하에서만 흡수 (capacity 저/null 은 대역 안이어도 흡수 안 함). 결정적 검증용 script-level simulate:
 *     `SIMULATE_VSYNC_LOCK=1 …`(→ 락, exit 0) / `SIMULATE_REGRESSION=1 …`(→ 회귀, exit 1).
 *
 * 가드 도입 PR DoD §4축 (CLAUDE.md `### 가드 도입 PR DoD`):
 *   (1) 격리 동적 테스트 — 본 스크립트 단독 실행
 *   (2) 3중 시뮬레이션 — `scripts/_debug-fps-guard-tmp.mjs`
 *   (3) 5 페르소나 self-consistency — 본 PR 범위 밖
 *   (4) 메타 안정성 — rAF noise ±5% 인지, 회귀 임계 ±10% margin 적용
 */
import { withBrowser } from './browser-verify-utils.mjs';
import { mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const positionalUrl = process.argv.slice(2).find((a) => !a.startsWith('--'));
const baseUrl = process.env.BASE_URL ?? positionalUrl ?? 'http://localhost:3001';
const __dirname = dirname(fileURLToPath(import.meta.url));
const baselinePath = join(__dirname, '..', 'docs', 'benchmarks', 'fps-lowend-baseline.json');
const reportDir = join(__dirname, '..', '.verify-screenshots', 'fps-baseline');
mkdirSync(reportDir, { recursive: true });

const UPDATE_BASELINE = process.argv.includes('--update-baseline');

// #709 — variance 진단 모드. 판정 없이 각 scenario 를 N회 연속 측정 → min/max/mean/std/cv 박제.
//   swiftshader runner 의 fps variance 분포를 정량화해 best-of-N 의 N / margin 결정 근거로 삼는다.
//   measurement-first (CLAUDE.md §스프린트 계약 10) — flake 임계 조정 전 분포부터 실측.
const DIAGNOSE_VARIANCE = process.argv.includes('--diagnose-variance');
const VARIANCE_SAMPLES = (() => {
  const arg = process.argv.find((a) => a.startsWith('--variance-samples='));
  const fromArg = arg ? Number.parseInt(arg.split('=')[1], 10) : Number.NaN;
  const fromEnv = Number.parseInt(process.env.VARIANCE_SAMPLES ?? '', 10);
  // 양수만 허용 — 0/음수는 빈 samples → fpsStats NaN/Infinity 방지 (reviewer 권고, PR #710).
  if (Number.isFinite(fromArg) && fromArg > 0) return fromArg;
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return 10;
})();

// #820 Phase 0 — CPU throttle rate env 오버라이드 (VARIANCE_SAMPLES 파싱 패턴 답습).
//   기본 4x 유지 → 일반 실행(판정 경로)은 완전 불변. diagnostic dispatch 에서 8~10x 로 강화해
//   데드라인 미스를 결정적 유발 → render-capacity 로 H2(presentation-side, capacity 정상) vs
//   H3(deadline-miss, capacity 저) 판별 (ADR 20260710-820 §5 Phase 0 게이트).
const CPU_THROTTLING_RATE = (() => {
  const fromEnv = Number.parseInt(process.env.CPU_THROTTLING_RATE ?? '', 10);
  // 양수만 허용 — 0/음수/비수치는 기본 4x 로 폴백 (VARIANCE_SAMPLES 동형 검증).
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return 4; // 4x slowdown — 저사양 기기 모의 (기본값)
})();
const MEASURE_DURATION_MS = 5_000; // noise 완화 위해 3초 → 5초 확장
const MIN_FPS_ABSOLUTE = 30;
const REGRESSION_MARGIN = 0.3; // baseline 대비 30% 저하 허용 (rAF noise ±12% 실측 후 보수 마진)

// #680 — tier-c LOD override race 잔존 flake 진단 + 처치.
//   LOD_SETTLE_TIMEOUT_MS: tier-c 일 때 측정 직전 override='low' 정착 대기 상한.
//     race fix (#677) 가 정상 작동하면 즉시 충족. 미충족 (영구 'auto' 잔존) 이면 timeout 후
//     auto LOD (sun high + mid sphere) 상태로 측정 → FAIL 표면화 (회귀 은폐 아님).
//   MEASURE_MAX_ATTEMPTS: 1차 측정이 절대/회귀 임계 미달이면 best-of-N 재측정.
//     transient (runner 이웃 부하 — 가설 2) 흡수용. 단 측정값을 모두 로깅하고
//     판정은 best (max) 사용 → 진짜 회귀는 매번 fail 하므로 은폐 불가 (volt #32).
//
// #709 measurement-first 결론 (docs/benchmarks/fps-variance-diagnosis-20260619.json):
//   정상 run 의 scenario-내 variance 는 극히 작다 (cv 0~3.8%, p50 전부 60.1, 유일 outlier 는
//   desktop default 첫 1~2 샘플 = 워밍업). 즉 flake 는 scenario-내 noise 가 아니라 "runner
//   전체가 일시 느려지는 전역 부하 spike" (불운한 run 은 전 scenario 동반 40대 하락 — v0.30.0).
//   ⇒ best-of-N (같은 run 내 재측정) 은 부하 spike 를 흡수하지 못한다 (윈도우 전체 동반 하락).
//   2→3 은 워밍업/짧은 transient 흡수용 보조일 뿐이며, 부하 spike 의 주 방어는 워크플로
//   레벨 1회 자동 재시도 (fps-baseline-guard.yml, 시간차/새 시도로 spike 회피 + 메일 차단).
const LOD_SETTLE_TIMEOUT_MS = 8_000;
const MEASURE_MAX_ATTEMPTS = 3;

// #820 Phase 1 — vsync 30Hz 반속 락 감지·분류 상수 (ADR 20260710-820-fps-vsync-lock-forensic.md §5).
//   판정식: vsyncLock(viewport, sc) := rafFps ∈ [VSYNC_BAND_LO, VSYNC_BAND_HI]
//                                      ∧ renderCapacityFps ≥ CAPACITY_FULL_MIN
//   낮은 rafFps 는 분류만으로 절대 PASS 안 됨 — capacity 양성 측정이 있을 때만 락으로 흡수 (fail-fast 불변식).
const VSYNC_BAND_LO = 28; // 30Hz 락 대역 하한 (이슈 #820 명시)
const VSYNC_BAND_HI = 36; // 30Hz 락 대역 상한 (이슈 #820 명시)
// CAPACITY_FULL_MIN — 대역 내 rafFps 가 "락(presentation 아티팩트)이냐 진짜 회귀냐" 를 가르는
//   render-capacity 하한. Phase 1 simulate + 자연 락 확정 기준, 4x 운영 throttle 전제,
//   락 실측 하한 ~557 (Amendment 1, 4x desktop capacity 557.8~1450) 의 70% → 잠정 400.
//   throttle/머신 의존 절대값이므로 머지 후 자연 락에서 최종 확정 (ADR §5 Phase 2 / §6 재검토 2).
const CAPACITY_FULL_MIN = 400;

// #820 Phase 1 — script-level simulate hook (분류 로직 결정적 검증, #779 워크플로 레벨 hook 과 직교).
//   SIMULATE_VSYNC_LOCK=1 → desktop rafFps=대역(31) + capacity=healthy(1000) + mobile=full(60)
//     → 분류=락 → 최종 PASS + annotation (락 흡수 경로 재현).
//   SIMULATE_REGRESSION=1 → desktop rafFps=대역(30) + capacity=저(300) + mobile=동반 저(25)
//     → 분류=회귀 → 최종 FAIL (진짜 회귀 미은폐 재현 — capacity 저는 대역 안이어도 흡수 안 됨).
//   미설정 시 실측 (기존 판정 경로 완전 불변). 주입은 measureFps/measureRenderCapacity wrapper 로만 캡슐화.
const SIMULATE_VSYNC_LOCK = process.env.SIMULATE_VSYNC_LOCK === '1';
const SIMULATE_REGRESSION = process.env.SIMULATE_REGRESSION === '1';

const VIEWPORTS = [
  { id: 'desktop', width: 1280, height: 720 },
  { id: 'mobile', width: 375, height: 667 },
];

const SCENARIOS = [
  { id: 'default', label: 'default (sun 시점)', focusTestId: null },
  { id: 'earth-focus', label: 'earth focus', focusTestId: 'focus-earth' },
  { id: 'moon-focus', label: 'moon focus', focusTestId: 'focus-moon' },
];

async function measureFps(page, durationMs) {
  return page.evaluate(
    (d) =>
      new Promise((resolve) => {
        let count = 0;
        const start = performance.now();
        const loop = () => {
          count += 1;
          if (performance.now() - start < d) requestAnimationFrame(loop);
          else resolve((count * 1000) / (performance.now() - start));
        };
        requestAnimationFrame(loop);
      }),
    durationMs,
  );
}

/**
 * #820 Phase 0 — render-capacity 프로브 (측정 전용, H2/H3 판별 게이트).
 *
 * rAF(vsync presentation rate) 를 우회한 순수 CPU raster 처리량을 측정한다. `page.evaluate` 내
 * 동기 렌더 루프로 `scene.render()` 를 최대 속도로 반복해 "앱이 얼마나 빠르게 렌더 가능한가"의
 * vsync-decoupled 프록시를 얻는다. 30Hz vsync 락 상태에서 rafFps 는 ~30 이지만 capacity 가
 * 여전히 높으면 H2(presentation-side, 락은 아티팩트), capacity 도 낮으면 H3(deadline-miss,
 * 진짜 렌더 느림)로 판별한다. (ADR 20260710-820-fps-vsync-lock-forensic.md §5 프로브 안전 규약)
 *
 * 안전 규약 (ADR §5 — cross-validate agy 수용):
 *   - 워밍업(warmupMs, 카운트 제외) — GC/JIT 안정화로 벤치마크 오염 완화.
 *   - 측정은 시간(windowMs) AND 반복(maxIterations) 2중 종료조건 — CPU throttle + 클럭 정밀도
 *     하에서 시간 루프가 hang 될 위험을 반복 상한으로 원천 봉쇄(좀비 방지).
 *   - 재진입: page.evaluate 내 동기 루프라 JS 단일 스레드가 rAF runRenderLoop 를 프로브 동안
 *     starve → 진짜 동시성 없음 (별도 pause API 불요, 무침범 b1 유지).
 *   - null 가드: __simCore.scene 부재 시 throw 아닌 null 반환 (미상 → 실패 방향 fail-safe).
 *
 * Phase 0 범위 엄수: 측정만 수행. 감지/분류/판정 로직은 Phase 1 — 본 함수는 값만 반환한다.
 */
async function measureRenderCapacity(
  page,
  { windowMs = 150, warmupMs = 50, maxIterations = 5000 } = {},
) {
  return page.evaluate(
    ({ windowMs, warmupMs, maxIterations }) => {
      const scene = /** @type {any} */ (window).__simCore?.scene;
      if (!scene || typeof scene.render !== 'function') return null;
      // 워밍업 — GC/JIT 안정화 (카운트 제외).
      const w0 = performance.now();
      while (performance.now() - w0 < warmupMs) scene.render();
      // 측정 — 시간 AND 반복횟수 2중 종료조건.
      let n = 0;
      const s0 = performance.now();
      while (performance.now() - s0 < windowMs && n < maxIterations) {
        scene.render();
        n += 1;
      }
      const elapsed = performance.now() - s0;
      return elapsed > 0 ? (n * 1000) / elapsed : null;
    },
    { windowMs, warmupMs, maxIterations },
  );
}

/**
 * #820 Phase 1 — simulate 주입 wrapper (측정 호출 캡슐화). env 미설정 시 실측 그대로 위임.
 *   주입 지점을 이 두 함수로 격리 → 스크립트 전반(setup/navigation/판정) 오염 0. (ADR §5 주입 캡슐화)
 */
async function measureFpsInjectable(page, durationMs, viewportId) {
  if (SIMULATE_VSYNC_LOCK) {
    // desktop 은 30Hz 락 대역(31), mobile 은 full-rate(60) — viewport 비대칭 락 재현.
    return viewportId === 'desktop' ? 31 : 60;
  }
  if (SIMULATE_REGRESSION) {
    // desktop 은 대역 내(30) 저하 → capacity 프로브 발동 → 회귀 분류 검증(대역 안 미은폐).
    //   mobile 은 대역 밖 동반 저하(25) → 전역 회귀(비-락) 재현.
    return viewportId === 'desktop' ? 30 : 25;
  }
  return measureFps(page, durationMs);
}

async function measureRenderCapacityInjectable(page) {
  // 락 시뮬레이션 → healthy capacity(≥ CAPACITY_FULL_MIN) 로 "빠르게 렌더 가능" 양성 입증.
  if (SIMULATE_VSYNC_LOCK) return 1000;
  // 회귀 시뮬레이션 → 저 capacity(< CAPACITY_FULL_MIN) 로 "실제 렌더 느림" 입증 (흡수 차단).
  if (SIMULATE_REGRESSION) return 300;
  return measureRenderCapacity(page);
}

/**
 * #680 진단 — 측정 시점 LOD 상태 캡처 (가설 1 vs 2/3 판별의 핵심 데이터).
 *   tier='c' & override='low'  → race fix 정상. FPS 가 낮으면 runner variance (가설 2/3).
 *   tier='c' & override='auto' → race 제3 윈도우 잔존 (가설 1) — sun high + mid sphere 렌더.
 * dev 빌드 전역 (`__gpuTier` / `__solarScene.getLodStats`) 의존 — prod 미노출 시 null.
 */
async function captureLodDiag(page) {
  return page
    .evaluate(() => {
      const w = /** @type {any} */ (window);
      const stats = w.__solarScene?.getLodStats?.() ?? null;
      return {
        tier: w.__gpuTier ?? null,
        override: stats ? stats.override : null,
        lodCounts: stats ? { high: stats.high, mid: stats.mid, low: stats.low } : null,
      };
    })
    .catch(() => ({ tier: null, override: null, lodCounts: null }));
}

/**
 * #680 처치 (가설 1 대응, 안전) — tier-c 면 측정 직전 override='low' 정착을 bounded 대기.
 *   race fix (#677) 가 정상이면 즉시 충족. 영구 'auto' 잔존이면 timeout 후 그대로 측정 →
 *   FPS FAIL 로 회귀 표면화 (대기가 회귀를 은폐하지 않음 — volt #32).
 *   tier !== 'c' (desktop swiftshader 등 tier-c 미감지) 면 즉시 통과 (대기 불필요).
 */
async function waitForLodSettle(page) {
  const diag = await captureLodDiag(page);
  if (diag.tier !== 'c') return diag;
  try {
    await page.waitForFunction(
      () => /** @type {any} */ (window).__solarScene?.getLodStats?.().override === 'low',
      { timeout: LOD_SETTLE_TIMEOUT_MS },
    );
  } catch {
    // 미정착 → 그대로 측정 (FAIL 표면화). 아래 재캡처로 'auto' 상태 로깅.
  }
  return captureLodDiag(page);
}

/**
 * focus 셋업 + LOD 정착 대기 — measureScenario / variance 진단 (#709) 공용.
 *   반환: 측정 시점 LOD 진단 (tier/override/lodCounts).
 */
async function setupScenario(page, scenario) {
  if (scenario.focusTestId) {
    const sel = `[data-testid="${scenario.focusTestId}"]`;
    const count = await page.locator(sel).count();
    if (count > 0) {
      await page.locator(sel).click();
      await page.waitForTimeout(800); // focus 카메라 전환 안정화
    } else {
      // moon focus 가 default 진입 시 셀렉터 미노출 가능 — URL override 사용
      if (scenario.id === 'moon-focus') {
        await page.goto(`${baseUrl}/?focus=moon`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1500);
      }
    }
  }

  // #680 — tier-c 면 override='low' 정착 대기 (race 제3 윈도우 처치) + 측정 시점 LOD 진단.
  return waitForLodSettle(page);
}

async function measureScenario(page, scenario) {
  const diag = await setupScenario(page, scenario);

  // #680 — 1차 측정이 임계 미달이면 1회 재측정 (transient 흡수). best (max) 채택.
  //   진짜 회귀는 두 번 다 fail → 은폐 불가. 두 값 모두 attempts 에 로깅.
  const attempts = [];
  let fps = 0;
  for (let i = 0; i < MEASURE_MAX_ATTEMPTS; i += 1) {
    const v = +(await measureFpsInjectable(page, MEASURE_DURATION_MS, currentViewportId)).toFixed(
      1,
    );
    attempts.push(v);
    fps = Math.max(fps, v);
    const base = baselineForCompare?.viewports?.[currentViewportId]?.[scenario.id];
    const passesAbsolute = v >= MIN_FPS_ABSOLUTE;
    const passesRegression = base === undefined || v >= base * (1 - REGRESSION_MARGIN);
    if (passesAbsolute && passesRegression) break; // 첫 통과 시 재측정 불필요
  }

  // #820 Phase 1 — vsync 락 band 감지 + render-capacity 분류.
  //   최종 rafFps 가 30Hz 락 대역 [VSYNC_BAND_LO, VSYNC_BAND_HI] 이면 capacity 프로브 1회로
  //   락(presentation 아티팩트)/회귀(진짜 렌더 느림)를 판별. 대역 밖(정상 60 / 심한 저하 <28)이면
  //   프로브 생략 → vsyncLock=false → 정상 경로 오버헤드 0 (#820 정상 경로 회귀 0 제약).
  let vsyncLock = false;
  let renderCapacity = null;
  if (fps >= VSYNC_BAND_LO && fps <= VSYNC_BAND_HI) {
    const cap = await measureRenderCapacityInjectable(page);
    renderCapacity = cap !== null ? +cap.toFixed(1) : null;
    // fail-fast 불변식: capacity 양성 측정(≥ CAPACITY_FULL_MIN)일 때만 락 흡수.
    //   capacity 저(< MIN) 또는 null(scene 부재) → 락 아님 → 기존 FAIL 경로 (회귀 미은폐).
    vsyncLock = renderCapacity !== null && renderCapacity >= CAPACITY_FULL_MIN;
    console.log(
      `    └ #820 band 감지: ${currentViewportId}/${scenario.id} rafFps=${fps} ∈ ` +
        `[${VSYNC_BAND_LO},${VSYNC_BAND_HI}], capacity=${renderCapacity ?? 'null'} → ` +
        `${vsyncLock ? 'vsync 락 (흡수 후보)' : '회귀 (capacity 미달 — 흡수 안 함)'}`,
    );
  }

  return { fps, attempts, diag, vsyncLock, renderCapacity };
}

// 재측정 판정에 쓰는 현재 viewport/baseline (measureScenario 가 모듈 스코프에서 참조).
let currentViewportId = null;
let baselineForCompare = null;

async function measureViewport(page, client, viewport) {
  currentViewportId = viewport.id; // #680 재측정 판정 컨텍스트
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // 정지 (pause) 로 시작점 안정화 — 모든 시나리오 동일 시작
  try {
    await page.locator('[data-testid="time-pause"]').click({ timeout: 1000 });
  } catch {}

  const results = {};
  const diagnostics = {};
  for (const sc of SCENARIOS) {
    console.log(`  ${viewport.id} / ${sc.label} 측정 중...`);
    const { fps, attempts, diag, vsyncLock, renderCapacity } = await measureScenario(page, sc);
    results[sc.id] = fps;
    // #820 — vsyncLock/renderCapacity 를 진단에 병기 (compareBaseline 이 흡수 판정에 참조).
    diagnostics[sc.id] = { attempts, vsyncLock, renderCapacity, ...diag };
    // #680 진단 로깅 — fail 분석의 핵심 (tier/override/lodCounts + 재측정 attempts).
    console.log(
      `    └ LOD diag: tier=${diag.tier} override=${diag.override} ` +
        `lod=${diag.lodCounts ? `${diag.lodCounts.high}/${diag.lodCounts.mid}/${diag.lodCounts.low}` : 'n/a'} ` +
        `attempts=[${attempts.join(', ')}]`,
    );
  }
  return { results, diagnostics };
}

function compareBaseline(current, baseline) {
  const failures = [];
  const absorptions = []; // #820 — vsync 락으로 흡수된 scenario 목록 (annotation 기록용)
  for (const vp of VIEWPORTS) {
    for (const sc of SCENARIOS) {
      const cur = current.viewports[vp.id]?.[sc.id];
      const base = baseline.viewports[vp.id]?.[sc.id];
      if (cur === undefined || base === undefined) {
        failures.push(`[${vp.id}/${sc.id}] baseline 또는 측정 누락`);
        continue;
      }
      const belowAbsolute = cur < MIN_FPS_ABSOLUTE;
      const belowRegression = cur < base * (1 - REGRESSION_MARGIN);
      if (!belowAbsolute && !belowRegression) continue; // 정상 — 실패 아님

      // #820 Phase 1 — vsync 락 흡수. capacity 양성 입증(vsyncLock=true) 하에서만 회귀 실패에서 제외.
      //   fail-fast 불변식: vsyncLock 은 measureScenario 에서 rafFps ∈ band ∧ capacity ≥ CAPACITY_FULL_MIN
      //   일 때만 true → capacity 저/null 은 여기 도달해도 흡수 안 됨 (기존 FAIL 유지, 진짜 회귀 미은폐).
      const diag = current.diagnostics?.[vp.id]?.[sc.id];
      if (diag?.vsyncLock === true) {
        absorptions.push({ vp: vp.id, sc: sc.id, rafFps: cur, capacity: diag.renderCapacity });
        continue; // 회귀 실패 목록에서 제외
      }

      if (belowAbsolute) {
        failures.push(`[${vp.id}/${sc.id}] 절대 임계 미달: ${cur} FPS < ${MIN_FPS_ABSOLUTE} FPS`);
      }
      if (belowRegression) {
        const dropPct = (((base - cur) / base) * 100).toFixed(1);
        failures.push(
          `[${vp.id}/${sc.id}] baseline 회귀 ${dropPct}%: ${base} → ${cur} FPS (margin ${REGRESSION_MARGIN * 100}%)`,
        );
      }
    }
  }
  return { failures, absorptions };
}

// #820 Phase 1 — GITHUB_STEP_SUMMARY 파일에 append (CI 는 GitHub 이 주입; 로컬/미CI 는 미설정 → no-op).
//   #779 흡수 기록 패턴(retry-fresh-runner STEP_SUMMARY)을 script-level 로 확장. 경계 회귀 추적용.
function appendStepSummary(lines) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return; // 로컬 실행 — no-op (판정 무관).
  try {
    appendFileSync(summaryPath, lines.join('\n') + '\n');
  } catch {
    // STEP_SUMMARY append 실패는 판정에 영향 없음 (best-effort 기록).
  }
}

// #709 — variance 진단 통계. cv (변동계수 = std/mean %) 가 best-of-N / margin 결정의 핵심 지표.
function fpsStats(arr) {
  const n = arr.length;
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  // median — 짝수 N 은 두 중앙값 평균 (reviewer 권고, PR #710).
  const p50 = n % 2 === 0 ? +((sorted[mid - 1] + sorted[mid]) / 2).toFixed(1) : sorted[mid];
  return {
    min: Math.min(...arr),
    max: Math.max(...arr),
    mean: +mean.toFixed(2),
    std: +std.toFixed(2),
    cv: +((std / mean) * 100).toFixed(1), // 변동계수 (%)
    p50,
  };
}

// ===== main =====
// #680 — 재측정 판정에 baseline 이 필요하므로 측정 전 로드 (update 모드는 baseline 부재 허용).
if (existsSync(baselinePath)) {
  try {
    baselineForCompare = JSON.parse(readFileSync(baselinePath, 'utf8'));
  } catch {}
}

// #933 — 에러 경로(goto 실패 / CDP throw / evaluate 예외)에서도 close 도달 보장 (#927 헬퍼 재사용).
//   본 스크립트는 close() 호출이 2곳(진단 모드 / 판정 모드)이라 일직선 나열의 누락 위험이 배가된다.
//   두 분기를 하나의 콜백으로 합치고 **어느 분기인지를 반환값으로 표현**해, 판정·박제·process.exit 은
//   전부 브라우저가 닫힌 뒤 호출부에서 수행한다 (콜백 안 process.exit 은 finally 를 건너뛴다 — 헬퍼 계약).
//   launch 인자는 원본 그대로 (무인자) — 수명주기만 위임하고 판정 로직/임계값은 무변경.
const measured = await withBrowser({}, async (browser) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const client = await context.newCDPSession(page);

  // CPU throttling 적용
  await client.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLING_RATE });

  // #709 — variance 진단 모드: 판정 없이 각 scenario N회 연속 측정 → 분포 통계 박제 후 종료.
  if (DIAGNOSE_VARIANCE) {
    console.log(
      `[diagnose-variance] N=${VARIANCE_SAMPLES} 샘플/scenario, CPU ${CPU_THROTTLING_RATE}x` +
        ` (+ #820 render-capacity 프로브 병기 — H2/H3 판별)`,
    );
    const report = {
      measuredAt: new Date().toISOString().slice(0, 10),
      samples: VARIANCE_SAMPLES,
      // #820 Phase 0 — 실제 사용 CPU throttle rate 박제 (env 오버라이드 반영). 8~10x diagnostic
      //   에서 어떤 rate 로 데드라인 미스를 유발했는지 보고서 단독 판독 가능하게 한다.
      environment: {
        cpuThrottling: `${CPU_THROTTLING_RATE}x`,
      },
      viewports: {},
    };
    for (const vp of VIEWPORTS) {
      currentViewportId = vp.id;
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
      try {
        await page.locator('[data-testid="time-pause"]').click({ timeout: 1000 });
      } catch {}
      report.viewports[vp.id] = {};
      console.log(`\n[${vp.id}] ${vp.width}×${vp.height}`);
      for (const sc of SCENARIOS) {
        const diag = await setupScenario(page, sc);
        const samples = [];
        // #820 Phase 0 — rafFps 샘플과 나란히 render-capacity 프로브를 캡처. null(scene 부재)은
        //   제외 수집 → 전 샘플 null 이면 renderCapacity=null 박제(실패 방향 fail-safe).
        const capacitySamples = [];
        for (let i = 0; i < VARIANCE_SAMPLES; i += 1) {
          samples.push(+(await measureFps(page, MEASURE_DURATION_MS)).toFixed(1));
          const cap = await measureRenderCapacity(page);
          if (cap !== null) capacitySamples.push(+cap.toFixed(1));
        }
        const s = fpsStats(samples);
        // #820 — capacity 통계는 기존 fpsStats 재사용 (min/max/mean/std/cv/p50 동형).
        const capStats = capacitySamples.length > 0 ? fpsStats(capacitySamples) : null;
        report.viewports[vp.id][sc.id] = {
          samples,
          ...s,
          tier: diag.tier,
          override: diag.override,
          renderCapacity: capStats ? { samples: capacitySamples, ...capStats } : null,
        };
        const capStr = capStats
          ? `min=${capStats.min} max=${capStats.max} mean=${capStats.mean} std=${capStats.std} cv=${capStats.cv}% p50=${capStats.p50}`
          : 'null (__simCore.scene 부재)';
        console.log(
          `  ${sc.label}: rafFps min=${s.min} max=${s.max} mean=${s.mean} std=${s.std} cv=${s.cv}% p50=${s.p50} ` +
            `(tier=${diag.tier} override=${diag.override})\n    rafFps samples=[${samples.join(', ')}]` +
            `\n    renderCapacity: ${capStr}` +
            (capStats ? `\n    capacity samples=[${capacitySamples.join(', ')}]` : ''),
        );
      }
    }
    return { mode: 'diagnose', report };
  }

  const viewportResults = {};
  const viewportDiagnostics = {};
  for (const vp of VIEWPORTS) {
    console.log(`[verify-fps-baseline] ${vp.id} (${vp.width}×${vp.height}) 측정 중...`);
    const { results, diagnostics } = await measureViewport(page, client, vp);
    viewportResults[vp.id] = results;
    viewportDiagnostics[vp.id] = diagnostics;
  }

  return { mode: 'measure', viewportResults, viewportDiagnostics };
});

// 진단 모드 — 브라우저 종료 후 박제 + 종료 (원본과 동일 순서: close → write → log → exit 0).
if (measured.mode === 'diagnose') {
  const outPath = join(reportDir, 'variance-diagnosis.json');
  writeFileSync(outPath, JSON.stringify(measured.report, null, 2) + '\n');
  console.log(`\n✓ variance 진단 박제: ${outPath}`);
  process.exit(0);
}

const { viewportResults, viewportDiagnostics } = measured;

// baseline 의 environment 메타데이터 보존 (measuredOn / note 등 사람이 박제한 정보)
let preservedEnvironment = {};
if (existsSync(baselinePath)) {
  try {
    const existing = JSON.parse(readFileSync(baselinePath, 'utf8'));
    preservedEnvironment = existing.environment ?? {};
  } catch {}
}

const current = {
  version: 2,
  measuredAt: new Date().toISOString().slice(0, 10),
  issue: '#536',
  environment: {
    ...preservedEnvironment,
    cpuThrottling: `${CPU_THROTTLING_RATE}x`,
    measureDurationMs: MEASURE_DURATION_MS,
    minFpsAbsolute: MIN_FPS_ABSOLUTE,
    regressionMargin: REGRESSION_MARGIN,
  },
  viewports: viewportResults,
  // #680 — 측정 시점 LOD 상태 + 재측정 attempts (가설 판별 진단 데이터, baseline 비교에는 미사용).
  diagnostics: viewportDiagnostics,
};

// 보고서 출력
console.log('\n========================================');
console.log(`저사양 FPS baseline (#536) — CPU ${CPU_THROTTLING_RATE}x throttling`);
for (const vp of VIEWPORTS) {
  console.log(`\n[${vp.id}] ${vp.width}×${vp.height}`);
  const r = current.viewports[vp.id];
  const d = current.diagnostics[vp.id];
  for (const sc of SCENARIOS) {
    const fps = r[sc.id];
    const mark = fps >= MIN_FPS_ABSOLUTE ? '✓' : '✗';
    const diag = d?.[sc.id];
    const diagStr = diag
      ? ` (tier=${diag.tier} override=${diag.override} attempts=[${diag.attempts.join(', ')}])`
      : '';
    console.log(`  ${mark} ${sc.label}: ${fps} FPS${diagStr}`);
  }
}

// baseline 모드 — diagnostics 는 baseline 에 박제하지 않음 (#680, 측정마다 달라지는 진단값).
if (UPDATE_BASELINE) {
  const { diagnostics: _omit, ...baselineDoc } = current;
  writeFileSync(baselinePath, JSON.stringify(baselineDoc, null, 2) + '\n');
  console.log(`\n✓ baseline 박제: ${baselinePath}`);
  process.exit(0);
}

if (!existsSync(baselinePath)) {
  console.log(`\n⚠ baseline 부재 — --update-baseline 로 첫 박제 필요`);
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const { failures, absorptions } = compareBaseline(current, baseline);

// #820 Phase 1 — vsync 락 흡수 기록 (console + GITHUB_STEP_SUMMARY). 흡수는 진짜 회귀와 별개로
//   항상 로깅 (다른 진짜 회귀와 공존해도 흡수 사실은 남긴다). 경계 회귀 추적 — #779 흡수 패턴.
if (absorptions.length > 0) {
  console.log('\n[#820 vsync 락 흡수]');
  for (const a of absorptions) {
    // (a) 보조 신호 — 반대편 viewport 대응 scenario full-rate 여부 (corroborating 로그, 단독 판정 아님).
    const oppo = a.vp === 'desktop' ? 'mobile' : 'desktop';
    const oppoFps = current.viewports?.[oppo]?.[a.sc];
    const oppoStr =
      oppoFps !== undefined && oppoFps > VSYNC_BAND_HI
        ? `${oppo}/${a.sc}=full-rate(${oppoFps}) ✓ 비대칭 락 corroborate`
        : `${oppo}/${a.sc}=${oppoFps ?? 'n/a'}`;
    console.log(
      `  ⚠ #820 vsync 락 흡수 — [${a.vp}/${a.sc}] rafFps=${a.rafFps} band, ` +
        `capacity=${a.capacity} ≥ ${CAPACITY_FULL_MIN} → presentation 아티팩트 (진짜 회귀 아님) [보조: ${oppoStr}]`,
    );
    appendStepSummary([
      `### ⚠ #820 vsync 락 흡수 — [${a.vp}/${a.sc}]`,
      `- rafFps=${a.rafFps} ∈ [${VSYNC_BAND_LO},${VSYNC_BAND_HI}] band + capacity=${a.capacity} ≥ ${CAPACITY_FULL_MIN} → presentation 아티팩트 (진짜 회귀 아님)`,
      `- 보조 신호: ${oppoStr}`,
      `- ADR 20260710-820 §5 — capacity 양성 입증 하 흡수. 반복 관찰 시 CAPACITY_FULL_MIN 재calibration (§6 재검토 2)`,
    ]);
  }
}

if (failures.length > 0) {
  console.log('\n✗ 회귀 감지:');
  failures.forEach((f) => console.log(`  - ${f}`));
  // #680 — 가설 판별 자동 진단. fail 시나리오의 override 상태로 race(가설1) vs variance(가설2/3) 분류.
  const raceLost = [];
  const settledButSlow = [];
  for (const vp of VIEWPORTS) {
    for (const sc of SCENARIOS) {
      const fps = current.viewports[vp.id]?.[sc.id];
      const base = baseline.viewports[vp.id]?.[sc.id];
      const failed =
        fps !== undefined &&
        base !== undefined &&
        (fps < MIN_FPS_ABSOLUTE || fps < base * (1 - REGRESSION_MARGIN));
      if (!failed) continue;
      const diag = current.diagnostics[vp.id]?.[sc.id];
      if (diag?.vsyncLock === true) continue; // #820 — 락 흡수 scenario 는 회귀 진단 대상 아님
      if (diag?.tier === 'c' && diag?.override !== 'low') raceLost.push(`${vp.id}/${sc.id}`);
      else settledButSlow.push(`${vp.id}/${sc.id}`);
    }
  }
  console.log('\n[#680 진단 판별]');
  if (raceLost.length > 0) {
    console.log(`  가설 1 (race 제3 윈도우 — override≠'low' 잔존): ${raceLost.join(', ')}`);
  }
  if (settledButSlow.length > 0) {
    console.log(
      `  가설 2/3 (override 정착했으나 FPS 미달 — runner variance): ${settledButSlow.join(', ')}`,
    );
  }
  writeFileSync(join(reportDir, 'current.json'), JSON.stringify(current, null, 2) + '\n');
  process.exit(1);
}

console.log(
  absorptions.length > 0
    ? `\n✓ baseline 대비 회귀 없음 (#820 vsync 락 ${absorptions.length}건 흡수 — presentation 아티팩트)`
    : '\n✓ baseline 대비 회귀 없음',
);
writeFileSync(join(reportDir, 'current.json'), JSON.stringify(current, null, 2) + '\n');
process.exit(0);
