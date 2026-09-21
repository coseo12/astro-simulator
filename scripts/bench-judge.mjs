#!/usr/bin/env node
/**
 * bench:scene 회귀 판정선 (#1209 B7).
 *
 * 왜 교체했는가
 * ------------
 * 구판은 `fps − baseline < −10` (절대 fps 차) 하나였다. baseline 을 현재 빌드로 재측정한
 * 뒤에도 **`⚠` 가 멎지 않았다**: 같은 커밋 10 회차를 새 baseline 으로 재판정하면 `4/10`
 * 회차 (셀 `13/110`) 에서 발화한다 (run 35589678686). 원인은 노후한 기준선이 아니라
 * **판정선의 단위**다 —
 *
 *   - GH Actions 러너의 회차간 산포는 **상대량**이다. 10 회차 실측에서 회차 전역 인자
 *     (머신 속도) 의 상대표준편차가 `14.9%`, 셀별 잔차가 `6.0%` 였다. 한 회차가 느리면
 *     11 셀이 **동시에** 느리다 (r4 = 전 셀 `0.77×`, r3 = `1.32×`).
 *   - 절대 `−10 fps` 는 이 상대 산포와 단위가 맞지 않는다. `idle` (baseline `106.50`) 에는
 *     `9.4%` 하락에서 발화하는 **과민** 선이고, `N=5000` (`4.14`) · `N=10000` (`2.28`) 에는
 *     **구조적으로 발화 불가능**한 선이다 (100% 정지해도 Δ 가 `−10` 에 못 미친다).
 *
 * 신판 — `fps < baseline × (1 − REGRESSION_RATIO)`
 * -----------------------------------------------
 * 판정 단위를 측정량과 같은 **상대량**으로 맞춘다. 셀마다 baseline 에 비례하므로 저 fps
 * 셀의 구조적 사각이 사라지고, 고 fps 셀의 과민도 사라진다.
 *
 * ⚠️ **허용치를 다른 측정량에 연동하지 않는다** (#1226 교훈 — 고장 난 측정량이 허용치를
 * 부풀려 결함이 통과했다). 판정에 쓰는 입력은 **그 셀 자신의 측정값과 그 셀의 baseline**
 * 둘뿐이다.
 *
 * 셀 간 비율로 회차 전역 인자를 걷어내는 정규화안은 **두 근거로 기각**했다 — 원칙(#1226
 * 공격면: 분모가 다른 시나리오의 측정값이라 한 셀의 고장이 다른 셀의 허용치를 움직인다) 과
 * **실측**이다. 같은 10 회차로 재보니 (LOO 오발화 `0` 기준) 단일 셀 회귀 하한은
 * `45% → 33%` 로 내려가지만 **균일 감속은 어떤 수준에서도 검출되지 않는다** — 정규화가
 * 걷어내는 성분이 곧 **전역 회귀가 사는 성분**이기 때문이다. 엔진 전체가 느려지는 회귀가
 * 가장 중요한 축이므로 이 교환은 성립하지 않는다.
 *
 * 같은 이득을 안전하게 얻으려면 분모가 제품 성능과 무관한 **독립 머신 속도 프로브**여야
 * 하고 (전역 회귀를 흡수하지 않는다), 그건 baseline 재측정을 요구하므로 이번 범위 밖이다
 * (후속 축으로 박제).
 */

/**
 * 회귀 판정선 — baseline 대비 상대 하락폭.
 *
 * **유도 (측정 분포에서)** — run 35589678686, ubuntu-latest × 10 회차, 11 셀 (5 시나리오 +
 * 6 N-sweep), 전부 같은 커밋 `7c9652a`:
 *
 *   1. 셀별 **관측 최대 하락폭** `(median − min) / median` 중 최댓값 = `27.19%`
 *      (`N=10000`: median `2.28`, min `1.66`. 2위가 `focus-earth` `27.14%` 로 거의 같다 —
 *      회차 전역 인자가 지배하기 때문에 셀마다 하락폭이 비슷하다). 여기에 여유 배수
 *      `CALIBRATION_SAFETY` 를 곱하면 `0.2719 × 1.1 = 0.2991` → **`0.30`**.
 *   2. 교차 확인 — 회차 전역 인자의 상대표준편차 `14.9%` 의 `2σ` = `29.8%`. 서로 다른 두
 *      유도가 같은 값에 수렴한다.
 *
 * 실측 오발화율 (같은 10 회차, leave-one-out — 회차 하나를 빼고 나머지 9 회차로 baseline 을
 * 만들어 뺀 회차를 판정): 셀 `0/110` · 회차 `0/10`. 구판 `−10 fps` 는 같은 측정에서
 * 셀 `15/110` · 회차 `6/10`.
 *
 * 대가 (검출 하한) — 모든 셀에 균일 감속 x 를 주입했을 때 10 회차 전부가 `⚠` 를 내는 x:
 * 신판 `40%` / 구판 `23%`. ⚠️ 단 구판의 `23%` 는 **x = 0 에서 이미 6 회차가 발화하는** 선의
 * 수치라 회귀 신호로 쓸 수 없다 (그것이 이 이슈다). 상세 표는 PR #1245 §B9.
 */
export const REGRESSION_RATIO = 0.3;

/**
 * 판정선 유도 시 관측 최대 하락폭에 곱한 여유 배수.
 *
 * 상수의 근거가 주석에만 남아 노후하는 것을 막기 위해 **유도식을 2단으로 재실행**한다
 * (#1209 가 바로 그 노후였다) — 단수가 아니라 2단인 이유는 두 검사의 발화 조건과 대가가
 * 다르기 때문이다:
 *
 *   - **유도 전제** `worstObservedDrop × CALIBRATION_SAFETY ≤ REGRESSION_RATIO` — 단위
 *     테스트가 **저장소의 실물 baseline** 에 대해 검사한다 (`bench-judge.test.mjs`).
 *     현재 여유는 `0.2991 vs 0.30` 으로 얇아서 **재측정 PR 은 거의 항상 이 테스트를
 *     깨뜨린다. 그것이 의도다** — 재측정은 판정선을 재유도해야 하는 시점이고, 그 요구가
 *     사람이 보는 CI 실패로 드러나는 편이 낫다. 발화 빈도는 재측정 주기(현재 5개월에 1회).
 *   - **런타임 보정** `worstObservedDrop ≤ REGRESSION_RATIO` — 매 bench run 이 검사한다
 *     (`checkCalibration`). 여유 배수를 빼고 **필요조건만** 본다: 이게 깨지면 baseline 안에
 *     「판정선 아래에 있는 건강한 회차」가 실재한다는 뜻이라 그 셀은 상시 발화가 예정돼
 *     있다. 여기에 여유 배수까지 걸면 매 run 이 재측정 잡음에 반응해 **이 가드 자신이
 *     #1209 (상시 발화) 가 된다.**
 *
 * ⚠️ 두 검사 모두 **baseline 파일에 기록된 산포**만 읽는다 — 이번 run 의 측정값이 아니다.
 * 따라서 측정이 고장 나도 허용치는 움직이지 않는다 (움직이면 #1226 재생산).
 */
export const CALIBRATION_SAFETY = 1.1;

/** 판정선 유도가 전제하는 최소 baseline 회차 수 (median 집계 하한 — bench-aggregate-median 과 동일). */
export const MIN_BASELINE_SAMPLES = 3;

/** 셀 판정 결과 상태. `unjudgeable` 은 **PASS 가 아니다** — 종료 코드 2 로 새어 나간다. */
export const STATUS = Object.freeze({
  OK: 'ok',
  REGRESSION: 'regression',
  UNJUDGEABLE: 'unjudgeable',
  NEW: 'new',
});

/**
 * baseline 에 **항목이 없는** 셀의 분류 (PR #1245 권고 2).
 *
 * 「이번 run 이 쟀는데 baseline 에 항목이 없다」는 서로 전혀 다른 두 사건이 같은 모양으로
 * 보이는 자리다:
 *
 *   - **진짜 신규** — 코드가 시나리오를 추가했고 baseline 은 그 이전에 측정됐다. 정상 경로다.
 *   - **baseline 소실** — baseline 이 알던 셀을 잃었다 (부분 편집 · 잘못된 갱신 경로 · 절단된
 *     아티팩트). 가드가 **조용해지는** 방향이므로 통과시키면 안 된다.
 *
 * 이번 run 의 리포트와 baseline 의 **항목 배열**만으로는 둘이 구분되지 않는다 — 양쪽 다
 * `measured ∖ baseline ≠ ∅` 로 똑같이 보이고, 구판은 둘 다 `+ 신규` (exit 0) 로 흘려보냈다.
 * 그래서 baseline 이 **자기가 덮는 셀 집합을 항목과 별도로 선언**한다 (`cells` 매니페스트 —
 * `bench-aggregate-median.buildBaseline` 이 기록). 차집합을 항목이 아니라 **매니페스트**와
 * 잡으면 방향이 갈린다:
 *
 *   | 항목 | 매니페스트 | 해석 | 결과 |
 *   | --- | --- | --- | --- |
 *   | 없음 | 그 이름이 실려 있다 | baseline 이 **잃었다** | `⛔ LOST` |
 *   | 없음 | 그 그룹이 비어 있다 | baseline 이 그 그룹을 **안 덮는다** | `⛔ UNCOVERED` |
 *   | 없음 | 있고, 그 이름은 없다 | **진짜 신규** | `+ NEW` |
 *   | 없음 | 매니페스트 자체가 없다 | **구분 불가** | `⛔ INDETERMINATE` |
 *
 * ⚠️ 마지막 줄이 `+` 가 **아닌** 이유 — 「기록이 없으니 통과」는 이 저장소가 반복해 닫아 온
 * fail-open 이다 (#1201 — 「없음/불변/비어있음」 술어의 공허 통과). 구분할 수 없으면 판정하지
 * 않는다. 매니페스트 없는 baseline 은 `bench:baseline-remeasure` 로 갱신하면 채워지고,
 * 그때까지 **정상 run 은 영향을 받지 않는다** (이 분기는 항목이 없는 셀에만 닿는다).
 */
export const ABSENT = Object.freeze({
  NEW: 'new',
  LOST: 'lost',
  UNCOVERED: 'uncovered',
  INDETERMINATE: 'indeterminate',
});

const isPositiveFinite = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** baseline fps 에 대한 판정선 (이 값 **미만**이면 회귀). */
export function regressionFloor(baselineFps) {
  return baselineFps * (1 - REGRESSION_RATIO);
}

/**
 * baseline 이 **덮는다고 선언한** 셀 집합 (`cells` 매니페스트) 을 읽는다.
 *
 * 매니페스트는 항목 배열의 사본이 아니라 **재고 선언**이다 — 둘이 어긋나는 것 자체가 신호다
 * (§`ABSENT`). 그래서 항목에서 유도하지 않고 파일이 따로 담은 값만 읽는다. 유도해 버리면
 * 항상 일치해 검출력이 `0` 이 된다.
 *
 * @returns `{ scenarios: Set<string>, nBody: Set<number> }`, 또는 매니페스트가 없으면 `null`
 */
export function baselineCoverage(baseline) {
  const cells = baseline?.cells;
  if (cells == null || typeof cells !== 'object') return null;
  return {
    scenarios: new Set(Array.isArray(cells.scenarios) ? cells.scenarios : []),
    nBody: new Set(Array.isArray(cells.nBody) ? cells.nBody.map(Number) : []),
  };
}

/**
 * baseline 에 항목이 없는 셀을 §`ABSENT` 표대로 분류한다.
 *
 * @param {string|number} key 매니페스트에 실리는 키 (시나리오는 이름, N-sweep 은 N 값)
 * @param {'scenarios'|'nBody'} group
 * @param {ReturnType<typeof baselineCoverage>} coverage
 */
export function classifyAbsent(key, group, coverage) {
  if (coverage == null) return ABSENT.INDETERMINATE;
  const known = coverage[group];
  if (known.has(key)) return ABSENT.LOST;
  if (known.size === 0) return ABSENT.UNCOVERED;
  return ABSENT.NEW;
}

/** 매니페스트 부재를 침묵시키지 않는다 (`checkCalibration` 의 `checked=false` 와 같은 축). */
export function coverageLines(coverage) {
  if (coverage != null) return [];
  return [
    '  ℹ [매니페스트] baseline 에 `cells` 기록이 없다 — 「신규 셀 추가」와 「baseline 셀 소실」을 ' +
      '구분할 수 없다. 항목이 없는 셀이 나오면 `+` 가 아니라 `⛔ 판정 불가`로 처리한다 ' +
      '(`bench:baseline-remeasure` 로 갱신하면 채워진다).',
  ];
}

/**
 * 셀 하나를 판정한다.
 *
 * ⚠️ **측정 실패·표본 부족이 PASS 로 새지 않게** 한다 (#1201 클래스 — 「없음/불변」 술어가
 * 표본이 비면 공허 통과한다). baseline 값이나 측정값이 유효한 양수가 아니면 `✓` 도 `⚠` 도
 * 아닌 `⛔ 판정 불가`이고, 호출부가 이를 종료 코드로 올린다.
 *
 * @param {string} name 셀 이름 (`idle` / `N=1000` 등)
 * @param {unknown} measuredFps 이번 run 측정값
 * @param {{ fps?: unknown } | undefined} baselineEntry baseline 항목 (없으면 §`ABSENT` 분류로 넘어간다)
 * @param {string} absent 항목이 없을 때의 분류 (§`ABSENT`). 기본값은 **fail-closed** 쪽인
 *        `INDETERMINATE` — 호출부가 분류를 주지 않았다면 그건 구분 근거가 없다는 뜻이다.
 */
export function judgeCell(name, measuredFps, baselineEntry, absent = ABSENT.INDETERMINATE) {
  if (baselineEntry == null) {
    if (absent === ABSENT.NEW) {
      return {
        name,
        status: STATUS.NEW,
        mark: '+',
        line: `  + ${name}: ${measuredFps} fps (신규)`,
      };
    }
    const why = {
      [ABSENT.LOST]:
        'baseline 이 이 셀을 잃었다 — `cells` 매니페스트에는 실려 있는데 항목이 없다 (부분 편집/절단된 갱신?)',
      [ABSENT.UNCOVERED]:
        'baseline 이 이 그룹을 덮지 않는다 — `cells` 매니페스트의 해당 그룹이 비어 있다',
      [ABSENT.INDETERMINATE]:
        'baseline 에 `cells` 매니페스트가 없어 「신규 셀」과 「baseline 셀 소실」을 구분할 수 없다',
    }[absent];
    return {
      name,
      status: STATUS.UNJUDGEABLE,
      mark: '⛔',
      line: `  ⛔ ${name}: 판정 불가 — ${why}`,
    };
  }
  const base = baselineEntry.fps;
  if (!isPositiveFinite(base)) {
    return {
      name,
      status: STATUS.UNJUDGEABLE,
      mark: '⛔',
      line: `  ⛔ ${name}: 판정 불가 — baseline fps 가 유효한 양수가 아니다 (${JSON.stringify(base)})`,
    };
  }
  if (!isPositiveFinite(measuredFps)) {
    return {
      name,
      status: STATUS.UNJUDGEABLE,
      mark: '⛔',
      line: `  ⛔ ${name}: 판정 불가 — 측정값이 유효한 양수가 아니다 (${JSON.stringify(measuredFps)})`,
    };
  }
  const floor = regressionFloor(base);
  const delta = measuredFps - base;
  const pct = (delta / base) * 100;
  const regressed = measuredFps < floor;
  return {
    name,
    status: regressed ? STATUS.REGRESSION : STATUS.OK,
    mark: regressed ? '⚠' : '✓',
    line:
      `  ${regressed ? '⚠' : '✓'} ${name}: ${measuredFps} fps ` +
      `(baseline ${base} → Δ ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}, ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%` +
      ` · 판정선 ${floor.toFixed(2)})`,
  };
}

/**
 * baseline 항목들의 **관측 최대 하락폭** `(fps − min) / fps`.
 *
 * 판정선 유도의 입력이자, 유도 전제를 단위 테스트가 재실행할 때 쓰는 값.
 * 산포 기록이 하나도 없으면 `null` (「0」 이 아니다 — 0 이면 전제를 공허 통과시킨다).
 */
export function worstObservedDrop(baseline) {
  const entries = [...(baseline?.scenarios ?? []), ...(baseline?.nBody ?? [])];
  let worst = null;
  for (const e of entries) {
    if (!isPositiveFinite(e?.fps) || !isPositiveFinite(e?.min)) continue;
    const drop = (e.fps - e.min) / e.fps;
    if (worst == null || drop > worst.drop) worst = { name: e.name ?? `N=${e.n}`, drop };
  }
  return worst;
}

/**
 * 판정선이 **지금 baseline 의 산포를 여전히 덮는지** 재확인한다 (런타임 보정 — 필요조건).
 *
 * - `violations` — `관측 하락폭 > REGRESSION_RATIO` 인 셀. baseline 을 만든 회차들 중에
 *   판정선 아래로 떨어지는 **건강한 회차가 실재**한다 = 상시 발화가 예정돼 있다 ⇒ 재유도 필요.
 * - `checked = false` — baseline 에 산포(`min`) 기록이 아예 없다 (구버전 baseline 이거나
 *   `bench:scene:set-baseline` 단일 리포트 복사). 판정 자체는 성립하지만 **보정을 확인할 수
 *   없다**는 사실을 침묵시키지 않는다.
 * - `samplesWarning` — `source_count < MIN_BASELINE_SAMPLES`. median 집계 전제 미달.
 */
export function checkCalibration(baseline) {
  const entries = [...(baseline?.scenarios ?? []), ...(baseline?.nBody ?? [])];
  const violations = [];
  let withMin = 0;
  for (const e of entries) {
    if (!isPositiveFinite(e?.fps) || !isPositiveFinite(e?.min)) continue;
    withMin += 1;
    const drop = (e.fps - e.min) / e.fps;
    if (drop > REGRESSION_RATIO) violations.push({ name: e.name ?? `N=${e.n}`, drop });
  }
  const sourceCount = baseline?.source_count;
  return {
    checked: withMin > 0,
    cellsWithDispersion: withMin,
    violations,
    samplesWarning:
      typeof sourceCount === 'number' && sourceCount < MIN_BASELINE_SAMPLES ? sourceCount : null,
  };
}

/**
 * 보정 확인 결과를 출력 줄로 변환.
 *
 * 글리프가 곧 계약이다 — `⛔` 만 종료 코드 `2` 로 올라간다:
 *   - **위반** (`⛔`) — 판정선이 baseline 산포를 덮지 못한다는 **적극적 증거**. 그 아래
 *     `✓`/`⚠` 마크는 신뢰할 수 없으므로 판정 불가로 취급한다.
 *   - **확인 불가 / 회차 부족** (`ℹ`) — 증거의 **부재**. 판정 술어 자체는 산포를 입력으로
 *     쓰지 않으므로 판정은 성립한다. 다만 침묵시키지 않는다.
 */
export function calibrationLines(calibration) {
  const lines = [];
  for (const v of calibration.violations) {
    lines.push(
      `  ⛔ [보정] 판정선 재유도 필요 — ${v.name}: baseline 산포 하락폭 ${(v.drop * 100).toFixed(1)}%` +
        ` > 판정선 ${(REGRESSION_RATIO * 100).toFixed(0)}%. baseline 안에 판정선 아래인 건강한 회차가 있다 = 상시 발화 예정.`,
    );
  }
  if (!calibration.checked) {
    lines.push(
      '  ℹ [보정] 판정선 보정 확인 불가 — baseline 에 산포(`min`) 기록이 없다 ' +
        '(구버전 baseline 또는 `bench:scene:set-baseline` 단일 리포트 복사). ' +
        '`bench:baseline-remeasure` 로 갱신하면 채워진다.',
    );
  }
  if (calibration.samplesWarning != null) {
    lines.push(
      `  ℹ [보정] baseline 이 ${calibration.samplesWarning} 회차 집계 — 판정선 유도 전제(≥ ${MIN_BASELINE_SAMPLES} 회차 median) 미달.`,
    );
  }
  return lines;
}

/**
 * run 전체를 판정한다.
 *
 * @param {{ scenarios: Array, nBody?: Array }} measured 이번 run 리포트
 * @param {object|null} baseline `docs/benchmarks/baseline.json` (없으면 `null`)
 * @returns {{ lines: string[], counts: object, calibration: object|null }}
 */
export function judgeReport(measured, baseline) {
  const lines = [];
  const counts = { ok: 0, regression: 0, unjudgeable: 0, new: 0 };
  const bump = (r) => {
    counts[r.status] += 1;
    lines.push(r.line);
  };

  if (baseline == null) {
    // ⚠️ 「기준선이 없어서 비교를 안 했다」가 초록으로 새면 그게 fail-open 이다.
    lines.push(
      '  ⛔ 판정 불가 — baseline.json 이 없다 (`pnpm bench:scene:set-baseline` 또는 `bench:baseline-remeasure`).',
    );
    counts.unjudgeable += 1;
    return { lines, counts, calibration: null };
  }

  const calibration = checkCalibration(baseline);
  lines.push(...calibrationLines(calibration));
  // 보정 **위반**은 그 아래 모든 마크의 신뢰성을 무효화하므로 판정 불가로 센다 (종료 코드 2).
  counts.unjudgeable += calibration.violations.length;

  // 「baseline 이 셀을 잃었다」를 「신규 셀」과 구분한다 (§`ABSENT` — PR #1245 권고 2).
  const coverage = baselineCoverage(baseline);
  lines.push(...coverageLines(coverage));

  const byName = new Map((baseline.scenarios ?? []).map((s) => [s.name, s]));
  const measuredNames = new Set((measured.scenarios ?? []).map((s) => s.name));
  for (const s of measured.scenarios ?? [])
    bump(
      judgeCell(s.name, s.fps, byName.get(s.name), classifyAbsent(s.name, 'scenarios', coverage)),
    );
  // baseline 에만 있고 이번 run 에 없는 시나리오 — 측정 누락이 판정에서 사라지는 것을 막는다.
  for (const [name, entry] of byName) {
    if (measuredNames.has(name)) continue;
    counts.unjudgeable += 1;
    lines.push(`  ⛔ ${name}: 판정 불가 — 미측정 (baseline ${entry.fps} fps · 시나리오 소실?)`);
  }

  // N-sweep 은 `bench:scene` (비 sweep) 실행에서 아예 측정하지 않는 것이 정상이므로,
  // **측정한 경우에만** baseline 과 대조한다.
  const nBody = measured.nBody ?? [];
  if (nBody.length > 0) {
    const baseN = new Map((baseline.nBody ?? []).map((x) => [x.n, x]));
    lines.push('  --- N-sweep ---');
    for (const x of nBody)
      bump(judgeCell(`N=${x.n}`, x.fps, baseN.get(x.n), classifyAbsent(x.n, 'nBody', coverage)));
    for (const [n, entry] of baseN) {
      if (nBody.some((x) => x.n === n)) continue;
      counts.unjudgeable += 1;
      lines.push(`  ⛔ N=${n}: 판정 불가 — 미측정 (baseline ${entry.fps} fps)`);
    }
  }

  return { lines, counts, calibration };
}
