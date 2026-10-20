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
 *   4. belt-forced (#1319 PR3, desktop 만) — 소행성대 · 카이퍼 띠 **기본 켜짐 구성** 강제 생성 (`?belt=3900` — 아래 상수 주석)
 *   5. comet-forced (#1329, desktop 만) — 혜성 꼬리 강제 생성 (`?t=2446479.5&comettails=force` — 아래 상수 주석)
 *   6. corona-forced (#1335, desktop 만) — 태양 코로나 강제 생성 (`?corona=force` — 아래 상수 주석)
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
import { openBodyMenu, setTimePlayback, withBrowser } from './browser-verify-utils.mjs';
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
//     ⚠️ #1256 이전에는 이 계약이 **거짓**이었다 — 옵션 객체를 `waitForFunction` 의 두 번째
//     인자(= `arg`)로 넘겨 이 상수가 한 번도 적용되지 않았고 실제 상한은 playwright 기본값
//     `30_000` 이었다. 위 "상한" 서술이 다시 실물과 어긋나지 않게 하는 것은
//     `scripts/verify-waitforfunction-args.mjs` 가드다.
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

// #1378 — 측정 창 정지 보장. 이 가드의 측정 대상은 **정지 상태**다 — 모든 셀이 같은 시작점에서 재도록 pause 를 누른다
//   (아래 `measureViewport` · `enterScenarioQuery` 주석이 처음부터 그 의도를 적어 두었다). 그런데 종전 절차는
//   `click({ timeout: 1000 })` 실패를 `catch {}` 로 삼켜, CI 에서 측정 창의 40~80% 가 시간이 흐르는 상태로 재졌다
//   (#1377 Phase 0 — 시간이 흐르면 앱 UI 전체가 프레임마다 재렌더된다). 그래서 측정값이 「정지 비용」 과 「진행 비용」 의
//   확률 혼합이었다.
//   - `ensurePaused` — 클릭의 성공이 아니라 **코어 시계 상태** (`__simCore.time.scale === 0`) 를 확인한다. 아니면
//     재시도하고, `PAUSE_MAX_ATTEMPTS` 회 뒤에도 아니면 throw (fail-fast).
//   - 측정 창마다 시작 · 끝의 시계를 기록하고, 정지가 아닌 창이 하나라도 있으면 그 셀은 판정 전에 실패다 (fail-closed).
//   판정식 · 임계는 바꾸지 않는다 — 측정 전제만 보강한다.
//   ⚠️ 타임아웃 값의 근거: 로컬(M1 · CPU 4x) 클릭 실측 238~421 ms. CI 러너는 같은 throttle 에서 몇 배 느리므로 종전
//   `1000` 은 여유가 없었다. 이 값들은 **상한**일 뿐 정상 경로에서는 정지가 확인되는 즉시 반환한다.
const PAUSE_MAX_ATTEMPTS = 3;
const PAUSE_CLICK_TIMEOUT_MS = 5_000;
const PAUSE_SETTLE_TIMEOUT_MS = 5_000;

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

/**
 * #1319 PR3 (ADR `20261008-1319` §교차검증 이견 수용 2) — CI 기본 켜짐 성능 셀.
 *
 * 소프트웨어 렌더 게이트 (결정 3) 로 CI 의 기본 화면은 띠를 그리지 않는다 — 그대로면 「CI 통과 → 하드웨어 사용자
 * 프레임 하락」 경로를 CI 가 못 본다. 그래서 띠를 **강제** 생성한 셀을 하나 둔다. 판정은 이 가드의 기존 규칙
 * (baseline 대비 `REGRESSION_MARGIN` 저하 · 절대 `MIN_FPS_ABSOLUTE`) 그대로 — 새 임계 0.
 *
 * 쿼리 수 3900 의 출처: `?belt=N` 의 N 은 **소행성대 그룹 총수**다 (결정 6). 기본 켜짐 구성은 소행성대 3900
 * (주 띠 3000 + 힐다 300 + 트로이 600) + 카이퍼 1500 (고전대 1200 + 플루티노 300) = 입자 5400 (결정 4 · Q1 —
 * `BELT_DEFAULT_COUNTS`). 카이퍼는 N 과 무관하게 기본 수로 함께 강제 생성되므로, 기본 구성을 재현하는 N 은 5400 이
 * 아니라 3900 이다 (`?belt=5400` 은 소행성대 5400 + 카이퍼 1500 = 6900 입자가 된다).
 *
 * desktop 1 셀만 둔다 — ADR 이 정한 것은 강제 셀 1개이고, desktop default 가 두 viewport 중 baseline 이 가장 낮은 셀이다.
 * 측정 순서상 맨 끝 (자기 쿼리로 다시 진입) 이라 앞 시나리오의 측정 조건을 바꾸지 않는다.
 */
const BELT_FORCED_QUERY = '?belt=3900';

/**
 * #1329 (ADR `20261010-1329` §교차검증 이견 수용 2) — 혜성 꼬리 강제 셀. 소프트웨어 렌더 게이트 (결정 4) 만 있으면 CI 가
 * 꼬리 셰이더를 한 번도 컴파일 · 실행하지 않아 GLSL 오류 · Babylon 업그레이드 회귀가 그대로 통과한다. 그래서 `force` 로
 * 게이트를 우회한 셀을 하나 둔다. 판정은 이 가드의 기존 규칙 그대로 — 새 임계 0.
 *
 * 시각 `t=2446479.5` = 핼리 **장면** 근일점 (ADR 1-A — 2체 Kepler 라 역사 근일점 1986-02-09 과 다르다). 기본 카메라에서
 * 꼬리가 실제로 그려지는 시각이다 (활동도 1.486 · 이온 꼬리 ≈ 99 px, PR1 실측). 전제는 꼬리 메시 **활성 + 머티리얼 준비**
 * (`requireMaterialReady`) — 셰이더 컴파일이 실패하면 메시는 활성이어도 그려지지 않아 꼬리 없는 장면을 잰다 (fail-open).
 */
const COMET_FORCED_QUERY = '?t=2446479.5&comettails=force';

/**
 * #1335 (ADR `20261014-1335` 결정 5 · 사용자 결정 Q7 (a)) — 태양 코로나 강제 셀. 혜성 셀과 같은 이유다: 소프트웨어 렌더
 * 게이트만 있으면 CI 가 코로나 셰이더를 한 번도 컴파일 · 실행하지 않는다.
 *
 * ⚠️ 스프린트 계약 재조정 (PR #1337 · 사용자 결정 2026-10-14, ADR Amendment 2): 이 셀은 **존재 · 그려짐 확인 전용**이다
 * (`fpsJudged: false`). fps 는 재고 로그에 남기지만 절대 하한 · baseline 회귀 판정에서 뺀다 — baseline 값도 두지 않는다.
 * 측정 전제 (`requiredMeshes` · 머티리얼 준비 · `requireVisible`) 는 그대로 FAIL 이다. 근거 (gate 판정 경로 실측, CI 진단
 * run 38529487674 · ubuntu-latest · CPU 4x · 소프트웨어 렌더): 같은 run 의 `?gpu=a&corona=off` 대비 on/off 비 `0.620 ~ 0.644`,
 * 1번 머신 on `25.0 ~ 26.4` (절대 하한 30 미만) · 2번 머신 on `31.9` — 머신에 따라 하한을 사이에 두고 갈린다. 소프트웨어
 * 렌더 사용자에게는 코로나를 만들지 않으므로 (결정 5) 이 셀의 fps 는 사용자 비용이 아니다. 하드웨어 비용은 `bench:scene` 이
 * 계속 감시한다. baseline 을 diag 모드 값 (`37.5`) 으로 박제했던 것이 gate 값과 어긋난 원인은 분리하지 않았다.
 *
 * `gpu=a` 를 함께 거는 이유: CI (소프트웨어 렌더) 는 GPU tier 가 `c` 라 LOD 가 `low` 로 강제되고, 태양이 billboard 가 되면
 * 코로나는 LOD 추종 (결정 4 의 1) 으로 `isVisible = false` 다 — 머티리얼은 컴파일되지만 **draw 가 0** 인 장면을 재게 된다
 * (로컬 swiftshader 실측: `?corona=force` 단독은 코로나 캔버스 휘도 합 on = off, `&gpu=a` 를 더하면 on > off).
 * tier 를 `a` 로 올려 기본 카메라 (J2000) 에서 태양이 LOD high 가 되게 한다. 전제는 메시 **활성 + 머티리얼 준비 + 가시**.
 */
const CORONA_FORCED_QUERY = '?corona=force&gpu=a';

const SCENARIOS = [
  { id: 'default', label: 'default (sun 시점)', focusBodyId: null },
  { id: 'earth-focus', label: 'earth focus', focusBodyId: 'earth' },
  { id: 'moon-focus', label: 'moon focus', focusBodyId: 'moon' },
  {
    id: 'belt-forced',
    label: `belt 기본 구성 강제 (${BELT_FORCED_QUERY})`,
    focusBodyId: null,
    query: BELT_FORCED_QUERY,
    // 측정 전제 — 강제 경로가 깨져 띠가 안 만들어지면 띠 없는 장면을 재고 통과한다 (fail-open). 그래서 측정 직전
    // 이 메시들이 **활성으로 존재**하는지 기록하고 `compareBaseline` 이 판정 전에 본다 (PR #1326 리뷰 R1).
    requiredMeshes: ['belt-particles', 'kuiper-particles'],
    viewports: ['desktop'],
  },
  {
    id: 'comet-forced',
    label: `혜성 꼬리 강제 (${COMET_FORCED_QUERY})`,
    focusBodyId: null,
    query: COMET_FORCED_QUERY,
    // 혜성 3개 (`kind: 'comet'` 전수) 의 꼬리 메시. 장면은 전수를 한꺼번에 만든다 (하나라도 누락이면 생성 실패).
    requiredMeshes: ['comet-tail-halley', 'comet-tail-encke', 'comet-tail-swift-tuttle'],
    requireMaterialReady: true,
    viewports: ['desktop'],
  },
  {
    id: 'corona-forced',
    label: `태양 코로나 강제 (${CORONA_FORCED_QUERY})`,
    focusBodyId: null,
    query: CORONA_FORCED_QUERY,
    requiredMeshes: ['sun-corona'],
    requireMaterialReady: true,
    // PR #1337 리뷰 권고 2 — 활성 + 준비만으로는 LOD 추종 (`isVisible = false`, draw 0) 상태에서도 통과한다.
    // 이 셀은 「코로나가 그려지는 장면」을 재야 하므로 가시성까지 요구한다 (새 임계 아님 — 전제 술어 보강).
    requireVisible: true,
    // 존재 · 그려짐 확인 전용 — fps 판정 제외 (위 상수 주석 ⚠️ 계약 재조정). baseline 키도 두지 않는다.
    fpsJudged: false,
    viewports: ['desktop'],
  },
];

/** viewport 별 측정 대상 시나리오 — `viewports` 미지정이면 전 viewport. */
const scenariosFor = (viewportId) =>
  SCENARIOS.filter((sc) => !sc.viewports || sc.viewports.includes(viewportId));

/** 시나리오 자체 쿼리로 재진입 + 측정 전 정지 (`measureViewport` 시작 절차와 같다). */
async function enterScenarioQuery(page, query) {
  await page.goto(`${baseUrl}/${query}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await ensurePaused(page, `재진입 ${query}`);
}

/** #1378 — 코어 시계 (`__simCore.time`) 를 읽는다. 코어 부재 · 평가 실패는 `null` (정지 아님으로 취급 — 실패 방향). */
async function readSimClock(page) {
  return page
    .evaluate(() => {
      const t = /** @type {any} */ (window).__simCore?.time;
      if (!t) return null;
      return { scale: t.scale, julianDate: t.julianDate };
    })
    .catch(() => null);
}

/**
 * #1378 — 시간을 정지 상태로 만들고 **코어 시계로 확인**한다. 이미 정지면 클릭하지 않는다 (멱등).
 *
 * 클릭이 「성공」 해도 정지가 보장되지 않는다 — 판정은 클릭 결과가 아니라 `scale === 0` 이다. 클릭 실패 (타임아웃 ·
 * 버튼 부재) 는 삼키지 않고 시도 기록에 남긴 뒤 재시도한다. `PAUSE_MAX_ATTEMPTS` 회 뒤에도 정지가 아니면 throw — 정지가
 * 아닌 장면을 재고 통과하는 경로를 없앤다 (fail-fast).
 *
 * @returns 정지까지 누른 클릭 수 (`0` = 이미 정지)
 */
async function ensurePaused(page, context) {
  const tries = [];
  for (let attempt = 1; attempt <= PAUSE_MAX_ATTEMPTS; attempt += 1) {
    const before = await readSimClock(page);
    if (before?.scale === 0) return logPauseResult(context, attempt - 1, tries);
    try {
      // 상태 단언 헬퍼 (#1209) — 「이미 정지 (time-play)」 와 「시간 컨트롤 부재」 를 구분한다.
      await setTimePlayback(page, 'paused', { timeout: PAUSE_CLICK_TIMEOUT_MS });
      await page.waitForFunction(
        () => /** @type {any} */ (window).__simCore?.time?.scale === 0,
        undefined,
        { timeout: PAUSE_SETTLE_TIMEOUT_MS },
      );
      return logPauseResult(context, attempt, tries);
    } catch (error) {
      tries.push(
        `#${attempt} scale=${before?.scale ?? 'n/a'}: ${String(error?.message ?? error).split('\n')[0]}`,
      );
    }
  }
  const last = await readSimClock(page);
  throw new Error(
    `[#1378] 정지 실패 (${context}) — pause ${PAUSE_MAX_ATTEMPTS}회 시도 후 scale=${last?.scale ?? 'n/a'}. ` +
      `정지가 아닌 장면은 재지 않는다. 시도: ${tries.join(' / ')}`,
  );
}

/** #1378 — 정지 확인 결과 1줄 (클릭 수 · 실패했던 시도). 첫 클릭 실패가 얼마나 잦은지 CI 로그로 판독한다. */
function logPauseResult(context, clicks, tries) {
  console.log(
    `    └ #1378 정지 확인 (${context}): 클릭 ${clicks}회` +
      (tries.length > 0 ? ` — 실패 시도: ${tries.join(' / ')}` : ''),
  );
  return clicks;
}

/**
 * #1378 — rAF 측정 창 1개를 재고, 창 시작 · 끝의 코어 시계로 「정지였는가」 를 함께 낸다.
 * 정지 = 시작 · 끝 모두 `scale === 0` 이고 `julianDate` 가 같다 (창 안에서 재생됐다가 다시 멈춘 경우도 JD 차이로 잡힌다).
 */
async function measurePausedWindow(page, durationMs, viewportId, measure = measureFpsInjectable) {
  const start = await readSimClock(page);
  const fps = await measure(page, durationMs, viewportId);
  const end = await readSimClock(page);
  const paused =
    start !== null &&
    end !== null &&
    start.scale === 0 &&
    end.scale === 0 &&
    start.julianDate === end.julianDate;
  return {
    fps,
    window: {
      jdStart: start?.julianDate ?? null,
      jdEnd: end?.julianDate ?? null,
      scaleStart: start?.scale ?? null,
      scaleEnd: end?.scale ?? null,
      paused,
    },
  };
}

/** #1378 — 측정 창 기록 1줄 (로그 · 실패 메시지 공용). */
function formatPauseWindow(w, index) {
  return (
    `창${index + 1} jd ${w.jdStart ?? 'n/a'}→${w.jdEnd ?? 'n/a'} ` +
    `scale ${w.scaleStart ?? 'n/a'}/${w.scaleEnd ?? 'n/a'} ${w.paused ? '정지' : '✗ 정지 아님'}`
  );
}

/**
 * #1378 — 셀의 측정 창이 **전부** 정지였는가. 창 기록이 없거나 시도 수와 어긋나면 거짓이다 — 빈 배열의 `every` 는
 * 공허하게 참이므로 (기록 누락이 통과로 읽히는 fail-open) 길이를 먼저 본다.
 */
function allWindowsPaused(diag) {
  const windows = diag?.pauseWindows;
  return (
    Array.isArray(windows) &&
    windows.length > 0 &&
    windows.length === diag?.attempts?.length &&
    windows.every((w) => w.paused === true)
  );
}

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
      undefined,
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
  if (scenario.query) await enterScenarioQuery(page, scenario.query);
  if (scenario.focusBodyId) {
    // #1281 — 천체 바로가기는 「천체 ▾」 메뉴 항목이다. 메뉴를 연 뒤 항목 유무를 본다 (기존 분기 의미 유지).
    await openBodyMenu(page);
    const sel = `[data-testid="focus-${scenario.focusBodyId}"]`;
    const count = await page.locator(sel).count();
    if (count > 0) {
      await page.locator(sel).click();
      await page.waitForTimeout(800); // focus 카메라 전환 안정화
    } else {
      await page.keyboard.press('Escape'); // 항목이 없으면 연 메뉴를 닫는다 (메뉴 Esc 는 자유시점 비발화 — D6)
      // moon focus 가 default 진입 시 셀렉터 미노출 가능 — URL override 사용
      if (scenario.id === 'moon-focus') {
        await page.goto(`${baseUrl}/?focus=moon`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1500);
      }
    }
  }

  // #1378 — 측정 직전 정지 확인. 진입 시 이미 정지했으면 클릭 0회로 통과한다 (멱등). 위 `?focus=moon` 재진입처럼
  //   진입 뒤 페이지를 다시 연 경로는 종전에 pause 를 누르지 않았다 — 이 호출이 그 경로까지 덮는다.
  const pauseClicks = await ensurePaused(page, `${currentViewportId}/${scenario.id} 측정 직전`);

  // #680 — tier-c 면 override='low' 정착 대기 (race 제3 윈도우 처치) + 측정 시점 LOD 진단.
  const diag = await waitForLodSettle(page);
  diag.pauseClicks = pauseClicks;
  return diag;
}

/**
 * 시나리오 전제 메시 중 활성으로 존재하는 개수 (`requiredMeshes` 없으면 null). `__simCore` 부재도 0 — 실패 방향.
 * `requireMaterialReady` 시나리오는 머티리얼 준비 (`material.isReady(mesh)`) 까지 요구한다 (#1329 — 셰이더 컴파일 실패 =
 * 메시는 활성이나 그려지지 않음). `requireVisible` 시나리오는 `isVisible === true` 까지 요구한다 (#1335 — LOD 추종으로
 * 숨은 메시는 draw 0). 플래그 없는 시나리오 (`belt-forced`) 의 판정은 종전과 같다.
 */
async function countRequiredMeshes(page, scenario) {
  if (!scenario.requiredMeshes) return null;
  return page
    .evaluate(
      ({ names, requireReady, requireVisible }) =>
        (window.__simCore?.scene?.meshes ?? []).filter(
          (m) =>
            names.includes(m.name) &&
            m.isEnabled() &&
            (!requireReady || m.material?.isReady(m) === true) &&
            (!requireVisible || m.isVisible === true),
        ).length,
      {
        names: scenario.requiredMeshes,
        requireReady: scenario.requireMaterialReady === true,
        requireVisible: scenario.requireVisible === true,
      },
    )
    .catch(() => 0);
}

async function measureScenario(page, scenario) {
  const diag = await setupScenario(page, scenario);
  diag.requiredMeshesEnabled = await countRequiredMeshes(page, scenario);

  // #680 — 1차 측정이 임계 미달이면 1회 재측정 (transient 흡수). best (max) 채택.
  //   진짜 회귀는 두 번 다 fail → 은폐 불가. 두 값 모두 attempts 에 로깅.
  const attempts = [];
  // #1378 — 창마다 시작 · 끝 시계 기록 (attempts 와 같은 길이). `compareBaseline` 이 판정 전에 본다.
  const pauseWindows = [];
  let fps = 0;
  for (let i = 0; i < MEASURE_MAX_ATTEMPTS; i += 1) {
    const { fps: raw, window: pauseWindow } = await measurePausedWindow(
      page,
      MEASURE_DURATION_MS,
      currentViewportId,
    );
    const v = +raw.toFixed(1);
    pauseWindows.push(pauseWindow);
    console.log(`    └ #1378 ${formatPauseWindow(pauseWindow, i)} (rafFps=${v})`);
    attempts.push(v);
    fps = Math.max(fps, v);
    if (scenario.fpsJudged === false) break; // #1335 — 판정 제외 셀은 1회 측정 · 기록만
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

  return { fps, attempts, pauseWindows, diag, vsyncLock, renderCapacity };
}

// 재측정 판정에 쓰는 현재 viewport/baseline (measureScenario 가 모듈 스코프에서 참조).
let currentViewportId = null;
let baselineForCompare = null;

async function measureViewport(page, client, viewport) {
  currentViewportId = viewport.id; // #680 재측정 판정 컨텍스트
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // 정지 (pause) 로 시작점 안정화 — 모든 시나리오 동일 시작 (#1378 — 클릭 결과가 아니라 코어 시계로 확인)
  await ensurePaused(page, `${viewport.id} 진입`);

  const results = {};
  const diagnostics = {};
  for (const sc of scenariosFor(viewport.id)) {
    console.log(`  ${viewport.id} / ${sc.label} 측정 중...`);
    const { fps, attempts, pauseWindows, diag, vsyncLock, renderCapacity } = await measureScenario(
      page,
      sc,
    );
    results[sc.id] = fps;
    // #820 — vsyncLock/renderCapacity 를 진단에 병기 (compareBaseline 이 흡수 판정에 참조).
    // #1378 — pauseWindows 도 병기 (compareBaseline 이 정지 전제를 판정 전에 본다).
    diagnostics[sc.id] = { attempts, pauseWindows, vsyncLock, renderCapacity, ...diag };
    // #680 진단 로깅 — fail 분석의 핵심 (tier/override/lodCounts + 재측정 attempts).
    console.log(
      `    └ LOD diag: tier=${diag.tier} override=${diag.override} ` +
        `lod=${diag.lodCounts ? `${diag.lodCounts.high}/${diag.lodCounts.mid}/${diag.lodCounts.low}` : 'n/a'} ` +
        `attempts=[${attempts.join(', ')}] pauseClicks=${diag.pauseClicks}` +
        (diag.requiredMeshesEnabled === null
          ? ''
          : ` requiredMeshes=${diag.requiredMeshesEnabled}`),
    );
  }
  return { results, diagnostics };
}

function compareBaseline(current, baseline) {
  const failures = [];
  const absorptions = []; // #820 — vsync 락으로 흡수된 scenario 목록 (annotation 기록용)
  for (const vp of VIEWPORTS) {
    for (const sc of scenariosFor(vp.id)) {
      const cur = current.viewports[vp.id]?.[sc.id];
      const base = baseline.viewports[vp.id]?.[sc.id];
      // #1335 — `fpsJudged: false` 셀은 baseline 이 없다 (판정 제외). 측정 누락 · 전제 실패는 그대로 FAIL.
      const fpsJudged = sc.fpsJudged !== false;
      if (cur === undefined || (fpsJudged && base === undefined)) {
        failures.push(`[${vp.id}/${sc.id}] baseline 또는 측정 누락`);
        continue;
      }
      // #1378 — 측정 전제: 모든 측정 창이 정지 상태였는가. 아니면 그 셀의 fps 는 「진행 비용」 이 섞인 값이라 판정에
      // 쓰지 않고 실패로 낸다 (아래 필수 메시 전제와 같은 처리 — 새 임계 0). 판정 제외 셀 (`fpsJudged: false`) 에도 적용한다.
      const cellDiag = current.diagnostics?.[vp.id]?.[sc.id];
      if (!allWindowsPaused(cellDiag)) {
        const windows = cellDiag?.pauseWindows ?? [];
        failures.push(
          `[${vp.id}/${sc.id}] 측정 전제 실패: 정지 아닌 측정 창 — ` +
            (windows.length > 0
              ? windows.map((w, i) => formatPauseWindow(w, i)).join(' · ')
              : '창 기록 없음') +
            ` (시도 ${cellDiag?.attempts?.length ?? 0}회)`,
        );
        continue;
      }
      // #1319 PR3 (리뷰 R1) — 측정 전제: 시나리오가 요구한 메시가 전부 활성이었는가. 아니면 그 셀의 fps 는 다른
      // 장면을 잰 값이라 판정에 쓰지 않고 실패로 낸다 (위 「측정 누락」 과 같은 처리 — 새 임계 0).
      if (sc.requiredMeshes) {
        const enabled = current.diagnostics?.[vp.id]?.[sc.id]?.requiredMeshesEnabled;
        if (enabled !== sc.requiredMeshes.length) {
          failures.push(
            `[${vp.id}/${sc.id}] 측정 전제 실패: 필수 메시 ${sc.requiredMeshes.join(', ')} 중 활성 ${enabled ?? 'n/a'}개 (요구 ${sc.requiredMeshes.length}${sc.requireMaterialReady ? ' · 머티리얼 준비 포함' : ''}${sc.requireVisible ? ' · 가시 포함' : ''}) — 전제 메시가 없는 장면을 쟀다`,
          );
          continue;
        }
      }
      if (!fpsJudged) continue; // 존재 · 그려짐 확인 전용 — 절대 하한 · 회귀 판정 제외
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
      await ensurePaused(page, `[diagnose] ${vp.id} 진입`);
      report.viewports[vp.id] = {};
      console.log(`\n[${vp.id}] ${vp.width}×${vp.height}`);
      for (const sc of scenariosFor(vp.id)) {
        const diag = await setupScenario(page, sc);
        // #1319 PR3 (리뷰 R1) — 진단 모드는 판정이 없으므로 전제 메시 수를 기록만 한다 (baseline 출처 확인용).
        const requiredMeshesEnabled = await countRequiredMeshes(page, sc);
        const samples = [];
        // #820 Phase 0 — rafFps 샘플과 나란히 render-capacity 프로브를 캡처. null(scene 부재)은
        //   제외 수집 → 전 샘플 null 이면 renderCapacity=null 박제(실패 방향 fail-safe).
        const capacitySamples = [];
        // #1378 — 진단 모드도 표본마다 정지 여부를 기록한다 (판정은 없지만 분포가 정지 / 진행 혼합인지 판독 가능하게).
        const pauseWindows = [];
        for (let i = 0; i < VARIANCE_SAMPLES; i += 1) {
          const { fps: raw, window: pauseWindow } = await measurePausedWindow(
            page,
            MEASURE_DURATION_MS,
            vp.id,
            measureFps,
          );
          pauseWindows.push(pauseWindow);
          samples.push(+raw.toFixed(1));
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
          requiredMeshesEnabled,
          renderCapacity: capStats ? { samples: capacitySamples, ...capStats } : null,
          pausedSamples: pauseWindows.filter((w) => w.paused).length,
          pauseWindows,
        };
        const capStr = capStats
          ? `min=${capStats.min} max=${capStats.max} mean=${capStats.mean} std=${capStats.std} cv=${capStats.cv}% p50=${capStats.p50}`
          : 'null (__simCore.scene 부재)';
        console.log(
          `  ${sc.label}: rafFps min=${s.min} max=${s.max} mean=${s.mean} std=${s.std} cv=${s.cv}% p50=${s.p50} ` +
            `(tier=${diag.tier} override=${diag.override}` +
            (requiredMeshesEnabled === null ? '' : ` requiredMeshes=${requiredMeshesEnabled}`) +
            `)\n    rafFps samples=[${samples.join(', ')}]` +
            `\n    #1378 정지 표본 ${pauseWindows.filter((w) => w.paused).length}/${pauseWindows.length}` +
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
  for (const sc of scenariosFor(vp.id)) {
    const fps = r[sc.id];
    const judged = sc.fpsJudged !== false;
    const mark = !judged ? '·' : fps >= MIN_FPS_ABSOLUTE ? '✓' : '✗';
    const diag = d?.[sc.id];
    const diagStr = diag
      ? ` (tier=${diag.tier} override=${diag.override} attempts=[${diag.attempts.join(', ')}])`
      : '';
    const judgedStr = judged ? '' : ' [fps 판정 제외 — 존재 · 그려짐 확인 전용]';
    console.log(`  ${mark} ${sc.label}: ${fps} FPS${diagStr}${judgedStr}`);
  }
}

// #1378 — 전 셀 측정 창의 정지 비율 (CI 로그 1줄로 판독). 분모는 실제로 잰 창 수다.
const allPauseWindows = VIEWPORTS.flatMap((vp) =>
  scenariosFor(vp.id).flatMap((sc) => current.diagnostics[vp.id]?.[sc.id]?.pauseWindows ?? []),
);
const pausedWindowCount = allPauseWindows.filter((w) => w.paused).length;
console.log(`\n[#1378] 정지 측정 창 ${pausedWindowCount}/${allPauseWindows.length}`);

// baseline 모드 — diagnostics 는 baseline 에 박제하지 않음 (#680, 측정마다 달라지는 진단값).
if (UPDATE_BASELINE) {
  // #1378 — 정지가 아닌 창이 섞인 측정은 baseline 으로 박제하지 않는다 (baseline 의 의미 = 정지 상태 비용).
  const unpaused = VIEWPORTS.flatMap((vp) =>
    scenariosFor(vp.id)
      .filter((sc) => !allWindowsPaused(current.diagnostics[vp.id]?.[sc.id]))
      .map((sc) => `${vp.id}/${sc.id}`),
  );
  if (unpaused.length > 0) {
    console.log(`\n✗ baseline 박제 거부 — 정지 아닌 측정 창: ${unpaused.join(', ')}`);
    process.exit(1);
  }
  const { diagnostics: _omit, ...baselineDoc } = current;
  // #1335 — 판정 제외 셀은 baseline 에 남기지 않는다 (판정에 쓰이지 않는 수치는 오독된다).
  for (const vp of VIEWPORTS) {
    for (const sc of scenariosFor(vp.id)) {
      if (sc.fpsJudged === false) delete baselineDoc.viewports[vp.id]?.[sc.id];
    }
  }
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
    for (const sc of scenariosFor(vp.id)) {
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
