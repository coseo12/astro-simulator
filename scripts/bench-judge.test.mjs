#!/usr/bin/env node
/**
 * #1209 B7 — bench 회귀 판정선 (`bench-judge.mjs`) 회귀 가드.
 *
 * stand-alone node 테스트 (`bench-aggregate-median.test.mjs` 선례 계승 — 루트 `scripts/` 는
 * vitest workspace 밖). CI `ci.yml` 에 배선한다 — **테스트가 있다 ≠ 그 테스트가 돈다** (#1103).
 *
 * 이 파일이 지키는 것 셋:
 *   1. **fail-open 차단** — 「못 쟀다」가 `✓` 로 새지 않는다 (#1201 클래스).
 *   2. **B8 실증의 상시 재현** — 판정선을 유도한 10 회차 원본(`docs/benchmarks/1209-rebaseline-samples.json`)을
 *      **프로덕션 판정 함수 그대로** 재판정해 `⚠ 0` 을 확인한다. 판정식 사본을 만들지 않는다.
 *   3. **판별력** — 완화 변이(실제 회귀를 통과시키는 판정선)가 테스트를 깨뜨린다.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CALIBRATION_SAFETY,
  MIN_BASELINE_SAMPLES,
  REGRESSION_RATIO,
  STATUS,
  calibrationLines,
  checkCalibration,
  judgeCell,
  judgeReport,
  regressionFloor,
  worstObservedDrop,
} from './bench-judge.mjs';

let passed = 0;
const run = (name, fn) => {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed += 1;
  } catch (e) {
    console.error(`  ✗ ${name}\n    ${e.message}`);
    process.exitCode = 1;
  }
};

const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const baseline = readJson('../docs/benchmarks/baseline.json');
const samples = readJson('../docs/benchmarks/1209-rebaseline-samples.json');

console.log('bench-judge');

// ── 판정선 산술 ──────────────────────────────────────────────────────────────

run('regressionFloor — baseline 에 비례한다 (절대 fps 차가 아니다)', () => {
  assert.equal(regressionFloor(100), 70);
  assert.equal(Number(regressionFloor(2.28).toFixed(4)), 1.596);
});

run('judgeCell — 판정선 경계: 미만만 ⚠, 같으면 ✓', () => {
  const b = { fps: 100 };
  assert.equal(judgeCell('x', 70, b).status, STATUS.OK); // 정확히 판정선 = 통과
  assert.equal(judgeCell('x', 69.99, b).status, STATUS.REGRESSION);
  assert.equal(judgeCell('x', 70.01, b).status, STATUS.OK);
});

run('judgeCell — 저 fps 셀도 같은 비율로 판정된다 (구판의 구조적 사각 해소)', () => {
  // 구판 `−10 fps` 는 baseline 2.28 셀에서 **100% 정지해도** 발화하지 못했다.
  const b = { fps: 2.28 };
  assert.equal(judgeCell('N=10000', 0.01, b).status, STATUS.REGRESSION);
  assert.equal(judgeCell('N=10000', 1.5, b).status, STATUS.REGRESSION);
  assert.equal(judgeCell('N=10000', 2.2, b).status, STATUS.OK);
});

// ── fail-open 차단 (#1201) ───────────────────────────────────────────────────

run('judgeCell — baseline 값이 유효하지 않으면 ✓ 가 아니라 ⛔', () => {
  for (const bad of [0, -1, null, undefined, NaN, Infinity, '100']) {
    const r = judgeCell('x', 100, { fps: bad });
    assert.equal(r.status, STATUS.UNJUDGEABLE, `baseline fps=${String(bad)}`);
    assert.match(r.line, /판정 불가/);
  }
});

run('judgeCell — 측정값이 유효하지 않으면 ✓ 가 아니라 ⛔', () => {
  for (const bad of [0, -5, null, undefined, NaN, Infinity, '90']) {
    const r = judgeCell('x', bad, { fps: 100 });
    assert.equal(r.status, STATUS.UNJUDGEABLE, `measured=${String(bad)}`);
  }
});

run('judgeCell — baseline 에 없는 셀은 신규 (⚠ 도 ✓ 도 아니다)', () => {
  const r = judgeCell('new-scenario', 42, undefined);
  assert.equal(r.status, STATUS.NEW);
});

run('judgeReport — baseline 파일 자체가 없으면 판정 불가 (초록으로 새지 않는다)', () => {
  const v = judgeReport({ scenarios: [{ name: 'idle', fps: 100 }] }, null);
  assert.equal(v.counts.unjudgeable, 1);
  assert.equal(v.counts.ok, 0);
  assert.match(v.lines.join('\n'), /baseline\.json 이 없다/);
});

run(
  'judgeReport — baseline 에 있는 시나리오를 안 쟀으면 ⛔ (누락이 판정에서 사라지지 않는다)',
  () => {
    const v = judgeReport(
      { scenarios: [{ name: 'idle', fps: 100 }] },
      {
        scenarios: [
          { name: 'idle', fps: 100, min: 95 },
          { name: 'focus-neptune', fps: 50, min: 46 },
        ],
      },
    );
    assert.equal(v.counts.unjudgeable, 1);
    assert.match(v.lines.join('\n'), /focus-neptune: 판정 불가 — 미측정/);
  },
);

run('judgeReport — N-sweep 미실행(비 sweep run)은 ⛔ 가 아니다', () => {
  const v = judgeReport(
    { scenarios: [{ name: 'idle', fps: 100 }], nBody: [] },
    { scenarios: [{ name: 'idle', fps: 100, min: 95 }], nBody: [{ n: 10, fps: 90, min: 80 }] },
  );
  assert.equal(v.counts.unjudgeable, 0);
  assert.equal(v.counts.ok, 1);
});

run('judgeReport — sweep 를 돌렸는데 baseline N 이 빠졌으면 ⛔', () => {
  const v = judgeReport(
    { scenarios: [], nBody: [{ n: 10, fps: 90 }] },
    {
      scenarios: [],
      nBody: [
        { n: 10, fps: 90, min: 80 },
        { n: 100, fps: 60, min: 52 },
      ],
    },
  );
  assert.equal(v.counts.unjudgeable, 1);
  assert.match(v.lines.join('\n'), /N=100: 판정 불가 — 미측정/);
});

// ── 판정선 보정 (상수 노후 감지) ─────────────────────────────────────────────

run('checkCalibration — 산포가 판정선을 넘으면 위반 (판정 불가로 승격)', () => {
  const bad = { scenarios: [{ name: 'wide', fps: 100, min: 60 }] }; // 하락폭 40% > 30%
  const c = checkCalibration(bad);
  assert.equal(c.violations.length, 1);
  assert.match(calibrationLines(c).join('\n'), /재유도 필요/);
  const v = judgeReport({ scenarios: [{ name: 'wide', fps: 100 }] }, bad);
  assert.equal(v.counts.unjudgeable, 1, '위반은 exit 2 로 올라가야 한다');
});

run('checkCalibration — 산포 기록이 없으면 checked=false (ℹ, 판정은 성립)', () => {
  const noMin = { scenarios: [{ name: 'x', fps: 100 }] };
  const c = checkCalibration(noMin);
  assert.equal(c.checked, false);
  assert.match(calibrationLines(c).join('\n'), /ℹ .*보정 확인 불가/);
  // 판정 술어는 산포를 입력으로 쓰지 않으므로 판정 자체는 성립한다 (exit 2 아님).
  const v = judgeReport({ scenarios: [{ name: 'x', fps: 99 }] }, noMin);
  assert.equal(v.counts.unjudgeable, 0);
  assert.equal(v.counts.ok, 1);
});

run('checkCalibration — source_count 가 median 전제 미달이면 ℹ', () => {
  const c = checkCalibration({ scenarios: [{ name: 'x', fps: 100, min: 90 }], source_count: 2 });
  assert.equal(c.samplesWarning, 2);
  assert.match(calibrationLines(c).join('\n'), new RegExp(`≥ ${MIN_BASELINE_SAMPLES} 회차`));
});

run('worstObservedDrop — 산포 기록이 없으면 0 이 아니라 null (공허 통과 차단)', () => {
  assert.equal(worstObservedDrop({ scenarios: [{ name: 'x', fps: 100 }] }), null);
  assert.equal(worstObservedDrop(null), null);
  const w = worstObservedDrop({
    scenarios: [
      { name: 'a', fps: 100, min: 90 },
      { name: 'b', fps: 50, min: 40 },
    ],
  });
  assert.equal(w.name, 'b');
  assert.equal(Number(w.drop.toFixed(2)), 0.2);
});

// ── 실물 baseline 에 대한 유도 전제 (재측정 PR 이 판정선 재유도를 동반하게 만든다) ──

run('실물 baseline — 모든 셀이 산포(min/max)를 갖는다', () => {
  const entries = [...baseline.scenarios, ...baseline.nBody];
  assert.ok(entries.length > 0);
  for (const e of entries) {
    const label = e.name ?? `N=${e.n}`;
    assert.equal(typeof e.min, 'number', `${label}.min`);
    assert.equal(typeof e.max, 'number', `${label}.max`);
    assert.ok(e.min <= e.fps && e.fps <= e.max, `${label}: min ≤ fps ≤ max`);
  }
});

run('실물 baseline — 판정선 유도 전제 (관측 최대 하락폭 × 여유배수 ≤ 판정선)', () => {
  const w = worstObservedDrop(baseline);
  assert.notEqual(w, null, 'baseline 에 산포 기록이 없다 — 전제를 검사할 수 없다');
  assert.ok(
    w.drop * CALIBRATION_SAFETY <= REGRESSION_RATIO,
    `판정선 재유도 필요 — 관측 최대 하락폭 ${(w.drop * 100).toFixed(2)}% (${w.name}) × ${CALIBRATION_SAFETY} ` +
      `= ${(w.drop * CALIBRATION_SAFETY * 100).toFixed(2)}% > REGRESSION_RATIO ${(REGRESSION_RATIO * 100).toFixed(0)}%. ` +
      'baseline 을 재측정했다면 scripts/bench-judge.mjs 의 상수를 새 분포에서 다시 유도하라 (#1209 B7).',
  );
});

// ── B8 — 판정선을 유도한 10 회차 원본 재판정 ────────────────────────────────

const judgeAllSamples = (transform = (fps) => fps) =>
  samples.runs.map((r) =>
    judgeReport(
      {
        scenarios: r.scenarios.map((s) => ({ name: s.name, fps: transform(s.fps) })),
        nBody: r.nBody.map((x) => ({ n: x.n, fps: transform(x.fps) })),
      },
      baseline,
    ),
  );

run('B8 — 같은 커밋 10 회차를 새 baseline 으로 재판정하면 ⚠ 0 · ⛔ 0', () => {
  assert.equal(samples.runs.length, 10);
  const verdicts = judgeAllSamples();
  const warnCells = verdicts.reduce((a, v) => a + v.counts.regression, 0);
  const warnRuns = verdicts.filter((v) => v.counts.regression > 0).length;
  const unjudgeable = verdicts.reduce((a, v) => a + v.counts.unjudgeable, 0);
  const cells = verdicts.reduce((a, v) => a + v.counts.ok + v.counts.regression, 0);
  assert.equal(cells, 110, '11 셀 × 10 회차가 모두 판정돼야 한다');
  assert.equal(warnCells, 0, `⚠ 셀 ${warnCells}/110 (구판 −10 fps 는 13/110)`);
  assert.equal(warnRuns, 0, `⚠ 회차 ${warnRuns}/10 (구판 −10 fps 는 4/10)`);
  assert.equal(unjudgeable, 0);
});

// 아래 두 상수는 **실측된 검출 곡선의 양 끝**이다 (같은 10 회차 · 같은 baseline).
//   x=3% → 셀 0 / x=4% → 1 회차 / 25% → 5 회차 / 38% → 10 회차 전건.
// 경계에 딱 붙여 박는 것이 의도다 — 판정선이 조금이라도 느슨해지면 38% 쪽이,
// 조여지면 3% 쪽이 먼저 깨진다.
const DETECT_ALL_RUNS = 0.38;
const NO_FALSE_FIRE = 0.03;

run(`판별력 — ${DETECT_ALL_RUNS * 100}% 균일 감속은 10 회차 전건에서 ⚠ (완화 변이 차단)`, () => {
  const verdicts = judgeAllSamples((fps) => fps * (1 - DETECT_ALL_RUNS));
  assert.equal(
    verdicts.filter((v) => v.counts.regression > 0).length,
    10,
    '판정선이 느슨해지면 여기가 먼저 깨진다',
  );
});

run(`판별력 — ${NO_FALSE_FIRE * 100}% 감속은 발화 0 (가장 가까운 건강 관측치 여유 3.86%)`, () => {
  const verdicts = judgeAllSamples((fps) => fps * (1 - NO_FALSE_FIRE));
  assert.equal(
    verdicts.reduce((a, v) => a + v.counts.regression, 0),
    0,
  );
});

run('완전 정지(0 fps)는 ⚠ 가 아니라 ⛔ — 더 강한 신호로 올라간다', () => {
  // ⚠️ 검출 곡선 표에서 `x=100%` 행의 `⚠ 0` 은 미검출이 아니다: 측정값이 유효한 양수가
  //    아니게 되어 **판정 불가(exit 2)** 로 승격된다. 구판은 이 경우 N=5000/10000 셀에서
  //    아예 발화하지 못했다 (Δ 가 −10 에 못 미쳐서).
  const verdicts = judgeAllSamples(() => 0);
  assert.equal(
    verdicts.reduce((a, v) => a + v.counts.regression, 0),
    0,
  );
  assert.equal(
    verdicts.reduce((a, v) => a + v.counts.unjudgeable, 0),
    110,
  );
});

run('샘플 원본 — 판정선을 유도한 측정과 baseline 이 같은 집계다', () => {
  // median 이 baseline 과 일치해야 「이 원본에서 유도했다」가 참이다.
  const med = (v) => {
    const s = [...v].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return Number((s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]).toFixed(2));
  };
  for (const b of baseline.scenarios) {
    const vals = samples.runs.map((r) => r.scenarios.find((s) => s.name === b.name).fps);
    assert.equal(med(vals), b.fps, `${b.name} median`);
    assert.equal(Math.min(...vals), b.min, `${b.name} min`);
  }
  for (const b of baseline.nBody) {
    const vals = samples.runs.map((r) => r.nBody.find((x) => x.n === b.n).fps);
    assert.equal(med(vals), b.fps, `N=${b.n} median`);
    assert.equal(Math.min(...vals), b.min, `N=${b.n} min`);
  }
});

console.log(`\n${passed} passed`);
