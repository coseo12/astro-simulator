#!/usr/bin/env node
/**
 * bench:scene — P2 성능 회귀 감지용 자동 벤치.
 *
 * 배경
 * ----
 * P2에서 Newton N-body 전환 시 성능 회귀 위험이 크다. PR마다 시나리오별 FPS를
 * JSON으로 기록해두고 baseline과 diff를 표기한다. P1 E3(browser-verify-perf)는
 * PASS/FAIL 게이트 용도, bench:scene은 시계열 수치 아카이브 용도.
 *
 * 현재 지원
 * --------
 * - 시나리오별 FPS (정지/재생/포커스) — browser-verify-perf 시나리오 재사용
 * - JSON 리포트 .bench-out/{timestamp}.json 저장 (#905 — gitignored, 커밋 경로 오염 방지)
 * - docs/benchmarks/baseline.json (tracked) 대비 diff 콘솔 출력
 *
 * N-sweep 모드
 * ------------
 * `BENCH_N_SWEEP=10,100,200,1000` 설정 시 각 N마다 `/?belt=N`을 재방문해
 * play-1y 시나리오 fps를 측정하고 리포트에 `nBody: [{ n, fps }]`로 기록한다.
 * 시간이 길어지므로 시나리오 측정과 병행 실행된다.
 *
 * 종료 코드 (#1209)
 * ----------------
 * - `0` — 측정 성공. baseline 대비 회귀는 `⚠` 마크로 **출력에만** 표기한다
 *         (판정선 자체의 게이트 승격은 #1209 B3 에서 의도적으로 뒤로 미룬 축).
 * - `1` — **측정 실패 = 판정 불가.** 시나리오 prep 셀렉터 부재 / 브라우저 오류 등.
 *         이전에는 `page.click(...).catch(() => {})` 가 이 경우를 삼켜 **다른 화면을 측정한
 *         값**이 정상 판정으로 흘렀다. 이제 리포트를 쓰지 않고 실패 요약만 남긴다.
 *
 * ⇒ 「느려졌다 (회귀)」와 「못 쟀다 (판정 불가)」가 종료 코드와 출력 양쪽에서 갈린다.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { clickTestId, setTimePlayback, withBrowser } from './browser-verify-utils.mjs';

const baseUrl = process.argv[2] ?? 'http://localhost:3001';
const SCENARIO_DURATION_MS = 3_000;
const __dirname = dirname(fileURLToPath(import.meta.url));
// #905 — 타임스탬프 리포트는 gitignored `.bench-out/` 에 기록 (실행마다 커밋 경로에
// 새 파일이 쌓이던 재발 구조 제거). baseline.json 은 tracked docs/benchmarks/ 유지.
const outDir = join(__dirname, '..', '.bench-out');
const baselineDir = join(__dirname, '..', 'docs', 'benchmarks');
mkdirSync(outDir, { recursive: true });

// 경로 쿼리는 BENCH_PATH 환경변수로 추가 가능 (예: /?belt=200)
const path = process.env.BENCH_PATH ?? '/';

/**
 * baseline 출처 기록용 커밋 sha (#1209 과업 3).
 *
 * 리포트 자신이 「어느 빌드를 쟀는가」를 들고 있어야 `bench-set-baseline` (단순 복사) 과
 * `bench-aggregate-median` (median 집계) **두 경로 모두**에서 자동으로 이어진다 —
 * 워크플로 한쪽에만 심으면 다른 경로에서 다시 빈다.
 */
function resolveCommitSha() {
  const fromEnv = process.env.GITHUB_SHA?.trim();
  if (fromEnv) return fromEnv;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: join(__dirname, '..'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * 측정 실패를 **판정과 구분되는 형태로** 박제하고 종료한다 (#1209 과업 1).
 *
 * `bench.yml` 은 `continue-on-error: true` + sticky 코멘트 `ignore_empty: true` 라,
 * 요약 파일을 쓰지 않고 죽으면 **PR 에 아무것도 남지 않는다** — 그것이 이 클래스를
 * 8 PR 동안 숨긴 구조다. 따라서 실패 경로도 반드시 요약을 쓴다.
 */
function reportMeasurementFailure(error) {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error('\n========================================');
  console.error('bench:scene — ⛔ 측정 실패 (판정 불가)');
  console.error('----------------------------------------');
  console.error(detail);
  console.error('----------------------------------------');
  console.error('baseline 비교를 수행하지 않았다. 이 run 의 fps 값은 존재하지 않는다.');
  if (process.env.BENCH_SUMMARY_OUT) {
    const md = [
      '### bench:scene 리포트 — ⛔ 측정 실패 (판정 불가)',
      '',
      '시나리오 prep 또는 측정 단계가 실패했다. **회귀(느려짐)가 아니라 측정 자체가 성립하지 않았다** —',
      'fps 수치도 baseline diff 도 이 run 에는 없다.',
      '',
      '```',
      detail,
      '```',
    ].join('\n');
    writeFileSync(process.env.BENCH_SUMMARY_OUT, md + '\n');
  }
}

/**
 * 시나리오 prep 셀렉터 계약 (#1209 과업 1).
 *
 * **필수 (부재 = 측정 실패)** — `clickTestId` pre-assert 로 throw:
 *   `time-preset-1d` · `time-preset-1y` · `focus-earth` · `focus-neptune`
 *   ⚠️ `focus-*` 는 `focus-quick-buttons.tsx` 가 `focus-${b.id}` 로 **동적 생성**한다.
 *      버튼 목록이 바뀌면 통째로 사라지므로, 여기서 실패하지 않으면 「해왕성을 잡지 않은
 *      화면」을 `focus-neptune` 이라는 이름으로 계속 재게 된다.
 *
 * **선택 (부재가 정상일 수 있는 유일한 자리)** — `setTimePlayback` 이 상태로 단언:
 *   `time-play` ↔ `time-pause` **토글 쌍**. 한 버튼의 testid 가 상태에 따라 갈리므로
 *   (`time-controls.tsx:70`) 한쪽 부재는 「이미 그 상태」를 뜻한다. 단 **양쪽 다 부재면
 *   실패** — 「없으면 건너뛴다」를 이 쌍에만, 그리고 형제의 존재를 조건으로 가둔다.
 *
 * 이 목록 밖에 `.catch(() => {})` 를 새로 들이지 않는다.
 */
const REQUIRED_TESTIDS = Object.freeze([
  'time-preset-1d',
  'time-preset-1y',
  'focus-earth',
  'focus-neptune',
]);

/**
 * prep 클릭 타임아웃 — **새 임계가 아니라 변경 전 값의 명시**다.
 *
 * 이 스크립트가 쓰던 `page.click(sel)` 은 Playwright 기본 타임아웃 `30_000ms` 로 동작했다.
 * `clickTestId` 의 기본값 (`2_000ms` — `pressTimePlay` #210 계약 승계) 을 그대로 쓰면
 * **무거운 N-sweep 구간에서 거짓 실패**가 난다: 메인 스레드가 포화돼 클릭 디스패치 자체가
 * 늦어지기 때문이다.
 *
 * 실측 (로컬 macOS, `next start` prod, belt 별 `locator.click` 왕복):
 *   `N=10` 246ms · `100` 230ms · `200` 328ms · `1000` 1_065ms · `5000` 4_572ms ·
 *   `10000` **9_377ms** ← `bench:scene:sweep` 최대 N. 여유 배수 `30_000 / 9_377 ≈ 3.2×`.
 *   (CI ubuntu headless 는 더 느리므로 배수는 이보다 작아질 수 있다. 상한을 키우는 대신
 *    변경 전 실효값을 유지해 **본 PR 이 측정 조건을 바꾸지 않았음**을 보장한다.)
 */
const PREP_CLICK_TIMEOUT_MS = 30_000;

/**
 * 부팅 직후 필수 셀렉터 전건 존재를 단언한다 (fail-fast).
 *
 * 각 prep 의 `clickTestId` 가 이미 pre-assert 하지만, 그건 **2분짜리 측정 도중**에
 * 터진다. 여기서 먼저 걸러야 「어느 시나리오까지는 유효했나」를 따질 필요가 없다.
 */
async function assertRequiredTestIds(page) {
  const missing = [];
  for (const id of REQUIRED_TESTIDS) {
    if ((await page.locator(`[data-testid="${id}"]`).count()) === 0) missing.push(id);
  }
  if (missing.length > 0) {
    throw new Error(
      `[bench-scene] 필수 셀렉터 부재 — ${missing.map((m) => `data-testid="${m}"`).join(', ')}. ` +
        '시나리오 prep 이 다른 화면을 측정하게 되므로 측정을 중단한다 (#1209).',
    );
  }
}

// #242 — vsync 페그 해소 (P8 선행 인프라).
// 기존 baseline(#241, ubuntu median N=10) 은 페그 환경 기준이므로, 플래그 추가 후
// `bench:baseline-remeasure` workflow_dispatch 재실행하여 baseline 재재측정 필요.
// 선례: PR #234 (bench-p7-lens3d), PR #243 (bench-scene-real-gpu).
//
// #933 — 에러 경로(goto 실패 등)에서도 close 도달 보장 (#927 헬퍼 재사용).
//   launch 인자는 원본 그대로 전달 (위 #242 vsync 플래그 — 측정값을 좌우하므로 무변경).
//   리포트 write/baseline diff 는 브라우저 종료 뒤 수행하므로 콜백은 측정값만 반환한다.
// #1209 — 측정 실패(셀렉터 부재 등)는 리포트/판정을 만들지 않고 exit 1 로 끝낸다.
//   `.catch` 로 붙인 이유: `withBrowser` 의 finally(브라우저 close)가 먼저 돌고 난 뒤에
//   이 핸들러가 실행되므로, 측정 블록 전체를 try 로 감싸 재들여쓰기하지 않아도 된다.
const { scenarios, nBody } = await withBrowser(
  {
    args: ['--disable-frame-rate-limit', '--disable-gpu-vsync'],
  },
  async (browser) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    const measureFps = (durationMs) =>
      page.evaluate(
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

    await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await assertRequiredTestIds(page);

    // P7-E #210 — time-play silent-fail 방지 (유틸 pressTimePlay 선적용).
    // #1209 — 나머지 셀렉터의 `.catch(() => {})` 도 제거. 「시나리오 의존이라 관대 허용」은
    //   `time-play`/`time-pause` 토글 쌍에만 해당하는 성질이었고 (위 `REQUIRED_TESTIDS`
    //   선언부의 §시나리오 prep 셀렉터 계약), preset/focus 는 상시 렌더되는 상수
    //   셀렉터라 부재 = 회귀다.
    const click = (testId) => clickTestId(page, testId, { timeout: PREP_CLICK_TIMEOUT_MS });
    const playback = (mode) => setTimePlayback(page, mode, { timeout: PREP_CLICK_TIMEOUT_MS });
    const steps = [
      { name: 'idle', prep: () => playback('paused') },
      {
        name: 'play-1d',
        prep: async () => {
          await playback('playing');
          await click('time-preset-1d');
        },
      },
      { name: 'play-1y', prep: () => click('time-preset-1y') },
      { name: 'focus-earth', prep: () => click('focus-earth') },
      { name: 'focus-neptune', prep: () => click('focus-neptune') },
    ];

    const collected = [];
    for (const s of steps) {
      await s.prep();
      await page.waitForTimeout(500);
      const fps = await measureFps(SCENARIO_DURATION_MS);
      collected.push({ name: s.name, fps: Number(fps.toFixed(2)) });
    }

    // N-sweep: 소행성대 개수별 fps 측정 (play-1y 시나리오 기준)
    const sweep = [];
    const sweepEnv = process.env.BENCH_N_SWEEP;
    if (sweepEnv) {
      const ns = sweepEnv
        .split(',')
        .map((x) => Number.parseInt(x.trim(), 10))
        .filter((n) => Number.isFinite(n) && n > 0);
      for (const n of ns) {
        await page.goto(`${baseUrl}${path.split('?')[0]}?belt=${n}`, {
          waitUntil: 'networkidle',
        });
        await page.waitForTimeout(1500);
        // P7-E #210 / #1209 — 재생 상태 단언 후 pre-assert click.
        await playback('playing');
        await click('time-preset-1y');
        await page.waitForTimeout(500);
        const fps = await measureFps(SCENARIO_DURATION_MS);
        sweep.push({ n, fps: Number(fps.toFixed(2)) });
      }
    }

    return { scenarios: collected, nBody: sweep };
  },
).catch((e) => {
  reportMeasurementFailure(e);
  // POSIX 파이프/파일 stdout 은 동기 flush 라 여기서 종료해도 위 출력이 잘리지 않는다.
  process.exit(1);
});

const timestamp = new Date().toISOString();
const report = {
  timestamp,
  phase: process.env.BENCH_PHASE ?? 'unlabeled',
  // #1209 — 「어느 빌드를 쟀는가」. baseline 으로 승격될 때 그대로 따라간다.
  commit: resolveCommitSha(),
  durationMs: SCENARIO_DURATION_MS,
  environment: 'playwright-chromium-headless',
  viewport: '1280x800',
  scenarios,
  ...(nBody.length > 0 && { nBody }),
};

const slug = timestamp.replace(/[:.]/g, '-');
const outPath = join(outDir, `${slug}.json`);
writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');

// baseline diff — CI 환경 변동성 고려해 임계값은 환경변수로 조정 (기본 -2 fps)
const regressionThreshold = Number.parseFloat(process.env.BENCH_REGRESSION_FPS ?? '-2');
const baselinePath = join(baselineDir, 'baseline.json');
let diffLines = [];
// #1209 과업 4 — 「언제·어느 커밋에서 잰 값과 비교 중인가」를 판정 출력에 노출한다.
//   이 한 줄이 있었다면 8 PR 동안 `focus-neptune ⚠` 를 회귀로 오인하지 않았다:
//   baseline timestamp 가 로드맵 v3 재구성 이전이라는 게 바로 보였을 것이다.
let baselineProvenance = null;
if (existsSync(baselinePath)) {
  const base = JSON.parse(readFileSync(baselinePath, 'utf8'));
  baselineProvenance = {
    timestamp: base.timestamp ?? '(미기록)',
    phase: base.phase ?? '(미기록)',
    commit: base.commit ?? '(미기록)',
  };
  const byName = new Map(base.scenarios.map((s) => [s.name, s.fps]));
  const measuredNames = new Set(scenarios.map((s) => s.name));
  for (const s of scenarios) {
    const b = byName.get(s.name);
    if (b == null) {
      diffLines.push(`  ${s.name}: ${s.fps} fps (신규)`);
    } else {
      const delta = s.fps - b;
      const pct = ((delta / b) * 100).toFixed(1);
      const mark = delta >= regressionThreshold ? '✓' : '⚠';
      diffLines.push(
        `  ${mark} ${s.name}: ${s.fps} fps (baseline ${b} → Δ ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}, ${pct}%)`,
      );
    }
  }
  // baseline 에만 있고 이번 run 에 없는 시나리오 — 측정 누락이 판정에서 사라지는 것을 막는다.
  for (const name of byName.keys()) {
    if (!measuredNames.has(name)) {
      diffLines.push(`  ⚠ ${name}: 미측정 (baseline ${byName.get(name)} fps — 시나리오 소실?)`);
    }
  }
  if (nBody.length > 0) {
    const baseN = new Map((base.nBody ?? []).map((x) => [x.n, x.fps]));
    diffLines.push('  --- N-sweep ---');
    for (const x of nBody) {
      const b = baseN.get(x.n);
      if (b == null) diffLines.push(`  N=${x.n}: ${x.fps} fps (신규)`);
      else {
        const delta = x.fps - b;
        const mark = delta >= regressionThreshold ? '✓' : '⚠';
        diffLines.push(
          `  ${mark} N=${x.n}: ${x.fps} fps (baseline ${b} → Δ ${delta >= 0 ? '+' : ''}${delta.toFixed(2)})`,
        );
      }
    }
  }
} else {
  diffLines.push(
    '  (baseline.json 없음 — 이 리포트를 baseline으로 복사하려면: `pnpm bench:scene:set-baseline`)',
  );
}

console.log('\n========================================');
console.log(`bench:scene — ${timestamp}`);
console.log(`리포트: ${outPath}`);
console.log('----------------------------------------');
for (const s of scenarios) console.log(`  ${s.name}: ${s.fps} fps`);
for (const x of nBody) console.log(`  N=${x.n}: ${x.fps} fps`);
console.log('----------------------------------------');
if (baselineProvenance) {
  console.log(
    `baseline 출처: ${baselineProvenance.timestamp} · phase=${baselineProvenance.phase} · commit=${baselineProvenance.commit}`,
  );
}
console.log('baseline diff:');
diffLines.forEach((l) => console.log(l));

// CI 연동: Markdown 요약을 BENCH_SUMMARY_OUT 경로에 기록 (PR 코멘트용)
if (process.env.BENCH_SUMMARY_OUT) {
  const md = [
    '### bench:scene 리포트',
    `- timestamp: \`${timestamp}\``,
    `- phase: \`${report.phase}\``,
    `- commit: \`${report.commit ?? '(미기록)'}\``,
    ...(baselineProvenance
      ? [
          `- **비교 대상 baseline**: \`${baselineProvenance.timestamp}\` · phase \`${baselineProvenance.phase}\` · commit \`${baselineProvenance.commit}\``,
        ]
      : []),
    '',
    '#### 시나리오 (fps)',
    '| scenario | fps |',
    '| --- | --- |',
    ...scenarios.map((s) => `| ${s.name} | ${s.fps} |`),
    ...(nBody.length > 0
      ? [
          '',
          '#### N-sweep (play-1y, fps)',
          '| N | fps |',
          '| --- | --- |',
          ...nBody.map((x) => `| ${x.n} | ${x.fps} |`),
        ]
      : []),
    '',
    '#### baseline diff',
    '```',
    ...diffLines,
    '```',
  ].join('\n');
  writeFileSync(process.env.BENCH_SUMMARY_OUT, md + '\n');
}
