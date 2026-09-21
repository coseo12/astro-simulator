# Benchmarks

`bench:scene` 자동 벤치 리포트 저장소. P2에서 N-body 전환 시 성능 회귀 감지용.

## 실행

```bash
# 별도 터미널: 앱 서버 기동 (3001 포트)
pnpm dev

# 벤치 실행 → .bench-out/{timestamp}.json 생성 (#905 — gitignored 산출물)
BENCH_PHASE=p1-end pnpm bench:scene

# N-sweep 모드 (소행성대 N=10,100,200,1000 각각 play-1y fps)
BENCH_PHASE=p2-0-end pnpm bench:scene:sweep

# 첫 실행 시 baseline 설정
pnpm bench:scene:set-baseline
```

### 환경변수

- `BENCH_PATH` — 측정 경로 (기본 `/`). 예: `BENCH_PATH=/?belt=200`
- `BENCH_N_SWEEP` — N-sweep 대상 (쉼표구분). 설정 시 각 N마다 `?belt=N` 재방문
- `BENCH_SUMMARY_OUT` — Markdown 요약 출력 경로 (CI 코멘트용)

> `BENCH_REGRESSION_FPS` 는 [#1209](https://github.com/coseo12/astro-simulator/issues/1209) B7 에서
> **제거**됐다 (절대 fps 차 판정선 폐기). 판정선은 `scripts/bench-judge.mjs` 의 상수이며
> **환경변수 우회 knob 을 두지 않는다** — 워크플로에서 판정선을 조용히 끌 수 있는 손잡이는
> 그 자체로 가드 무력화 경로다.

## 파일 규칙

- `{ISO-timestamp}.json` — 개별 측정 리포트 (타임스탬프 슬러그). **#905 부터 gitignored
  `.bench-out/` 에 기록** — 본 디렉토리에는 커밋하지 않는다 (실행마다 커밋 경로가 오염되던 재발 구조 제거)
- `baseline.json` — 비교 기준선 (tracked). 의미 있는 성능 기준점(예: P1 종료, P2-0 완료) 갱신 시 업데이트
- `1209-rebaseline-samples.json` — **판정선을 유도한 10 회차 측정 원본** (tracked, #1209 B7).
  GH Actions 아티팩트는 7일 뒤 만료되므로 원본이 저장소에 없으면 유도 근거를 재실행할 수 없다.
  `scripts/bench-judge.test.mjs` 가 이 파일로 판정선을 상시 재판정한다
- 각 리포트 JSON은 `{ timestamp, phase, commit, scenarios: [{ name, fps }] }` 스키마
- `commit` — **측정 대상 빌드의 sha** ([#1209](https://github.com/coseo12/astro-simulator/issues/1209)).
  리포트가 스스로 담으므로 `bench:scene:set-baseline`(단순 복사)·`bench-aggregate-median`(median 집계)
  두 갱신 경로 모두에서 baseline 으로 이어진다. 재측정 워크플로는 `--commit "${GITHUB_SHA}"` 로
  교차 검증한다 (회차별 sha 가 갈리면 exit 1).

## 회귀 판정

bench 실행 시 baseline 대비 각 셀(5 시나리오 + N-sweep)의 fps 변화율을 출력한다.
판정선은 **`fps < baseline × (1 − 30%)`** — 판정 단위를 측정량과 같은 **상대량**으로 맞춘 선이다
([#1209](https://github.com/coseo12/astro-simulator/issues/1209) B7, 구현·유도 SSoT는
`scripts/bench-judge.mjs`). 판정 출력에는 **비교 대상 baseline 의 timestamp·phase·commit** 이
함께 찍힌다 — 「언제 잰 값과 비교 중인가」가 안 보이면 노후한 기준선의 상시 발화를 회귀로 오인한다.

### 왜 절대 fps 차를 버렸는가 (#1209 B7)

baseline 을 현재 빌드로 재측정한 뒤에도 구판 `Δ < −10 fps` 는 **같은 커밋 10 회차 중 4 회차**
(셀 `13/110`) 에서 발화했다. GH Actions 러너의 산포가 **상대량**이기 때문이다 — 10 회차 실측에서
회차 전역 인자(머신 속도)의 상대표준편차가 `14.9%`, 셀별 잔차가 `6.0%` 였다. 절대 임계는
`idle`(baseline `106.50`)에 `9.4%` 하락에서 발화하는 과민 선이면서, `N=5000`(`4.14`) ·
`N=10000`(`2.28`) 에는 **100% 정지해도 발화 불가능**한 선이다.

|                                      |     구판 `−10 fps` |          신판 `−30%` |
| ------------------------------------ | -----------------: | -------------------: |
| 같은 커밋 10 회차 오발화 (셀 / 회차) |  `13/110` · `4/10` | **`0/110` · `0/10`** |
| leave-one-out 오발화 (셀 / 회차)     |  `15/110` · `6/10` | **`0/110` · `0/10`** |
| 균일 감속 검출 — 10 회차 전건 발화   | `20%` <sup>†</sup> |                `38%` |
| `N=5000` · `N=10000` 검출 가능성     |           **불가** |                 가능 |

<sup>†</sup> 구판의 `20%` 는 **감속 `0%` 에서 이미 4 회차가 발화하는** 선의 수치라 회귀 신호로
쓸 수 없다 — 그것이 이 이슈다. 신판이 산포를 흡수한 대가로 검출 하한이 올라간 것은 사실이며,
그 하한을 더 낮추려면 러너 산포 자체를 걷어내야 한다 (§후속 축).

판정선 상수는 측정 분포에서 유도한다: 관측 최대 하락폭 `27.19%` × 여유 배수 `1.1` = `29.91%` → `0.30`
(교차 확인 — 회차 전역 인자 rsd `14.9%` 의 `2σ` = `29.8%`). 유도 근거인 10 회차 원본은
`1209-rebaseline-samples.json` 에 커밋돼 있고, `scripts/bench-judge.test.mjs` 가 **프로덕션 판정
함수 그대로** 매 CI 에서 재판정한다.

### 회귀(⚠) ↔ 측정 실패 ↔ 판정 불가 (#1209)

| 상황                                                                         | 출력                            | 종료 코드 |
| ---------------------------------------------------------------------------- | ------------------------------- | --------- |
| 측정·판정 성립, baseline 대비 `−30%` 미만 하락                               | `⚠ <cell>: … Δ …`               | `0`       |
| 시나리오 prep 셀렉터 부재 / 브라우저 오류                                    | `⛔ 측정 실패 (판정 불가)` 블록 | `1`       |
| baseline 부재·무효, 측정값이 유효한 양수 아님, baseline 셀 미측정, 보정 위반 | `⛔ <cell>: 판정 불가 — …`      | `2`       |

⚠️ **「못 쟀다」가 `✓` 로 새지 않는다** — 판정이 성립하지 않은 셀은 종료 코드 `2` 로 드러난다
(#1201 클래스: 「없음/불변」 술어가 표본이 비면 공허 통과하는 문제). 예컨대 완전 정지(`0 fps`)는
`⚠` 가 아니라 `⛔` 다.

시나리오 prep 은 `.catch(() => {})` 로 클릭 실패를 삼키지 않는다. 필수 셀렉터
(`time-preset-1d`·`time-preset-1y`·`focus-earth`·`focus-neptune`)는 부팅 직후 전건 존재를
단언하고, 부재 시 fps 를 만들지 않는다 — 없으면 **직전 시나리오의 화면**을 그 이름으로 계속
재게 되기 때문이다. `time-play`↔`time-pause` 토글 쌍만 한쪽 부재가 정상이며(같은 버튼의 상태별
testid), **양쪽 다 부재면 실패**다.

## N-sweep 리포트 스키마

`bench:scene:sweep` 실행 시 리포트에 `nBody: [{ n, fps }]` 필드가 추가된다. P3-0부터 N=[10, 100, 200, 1000, 5000, 10000] 샘플을 `/?belt=N` 경로에서 play-1y 시나리오로 측정한다 (#908 이전 이력 리포트는 `/ko?belt=N` 경로 기준) (10000은 sim-canvas의 ThinInstances cap과 일치).

### baseline 갱신 절차

성능 기준점이 의미 있게 바뀐 시점(예: P3-0 도구 확장, P3-A Barnes-Hut 도입)에 다음 순서로 갱신:

```bash
pnpm dev                                 # 별도 터미널
BENCH_PHASE=p3-0-end pnpm bench:scene:sweep
pnpm bench:scene:set-baseline            # 가장 최근 리포트를 baseline으로 승격
git add docs/benchmarks/baseline.json && git commit -m "bench: baseline 갱신 (p3-0)"
```

## CI 연동

`.github/workflows/bench.yml` — PR 이벤트에서 sweep을 실행해 baseline 대비 diff를 sticky comment로 게시한다 (best-effort). 헤드리스 GitHub Actions runner의 변동성이 크므로 판정선을 **상대 하락폭 `−30%`** 로 두며(#1209 B7 — 구 `-10 fps` 완화값 대체), 정식 성능 게이트는 로컬 실 GPU 측정(#116, `scripts/bench-scene-real-gpu.mjs`)을 기준으로 한다.

### baseline 재측정 — `bench:baseline-remeasure` (#225)

헤드리스 ubuntu 환경과 기존 baseline 사이의 구조적 편차로 `bench.yml` 이 특정 scenario(예: focus-earth/neptune) 에서 반복 경고를 띄우면, `.github/workflows/bench-baseline-remeasure.yml` 을 **수동 트리거** 하여 ubuntu 환경 median 으로 재설정한다.

```
GitHub → Actions → bench:baseline-remeasure → Run workflow
  inputs:
    sample_count: "10"     # 3 이상 권장
    phase_label: "remeasure"
    target_branch: "develop"
```

동작:

1. `plan` job 이 `sample_count` 를 검증하고 matrix 배열을 생성
2. `bench` job 이 matrix 로 **N 회 병렬** `bench:scene:sweep` 실행 → 각 회차 JSON 아티팩트 업로드
3. `aggregate` job 이 모든 아티팩트 다운로드 → `scripts/bench-aggregate-median.mjs` 로 median 계산 → `baseline.json` 덮어쓰기 → `chore/baseline-remeasure-<run_id>` 브랜치에 PR 자동 생성

새 baseline 에는 `source_count` 와 각 항목의 `samples` / `min` / `max` 필드가 추가되어 재측정
근거를 추적 가능. `commit` 필드(#1209)에는 aggregate 가 `--commit "${GITHUB_SHA}"` 와 회차 리포트
기록을 대조한 sha 가 들어간다 — **어느 빌드를 잰 기준선인가**가 baseline 파일 자체에 남는다.

⚠️ **재측정 PR 은 판정선 재유도를 동반한다** (#1209 B7). `bench-judge.test.mjs` 의
「판정선 유도 전제」 검사가 새 baseline 의 관측 최대 하락폭을 다시 재므로, 산포가 커진 재측정은
CI 에서 **의도적으로 실패**한다. 그때 할 일은 테스트를 고치는 것이 아니라 새 분포에서
`REGRESSION_RATIO` 를 다시 유도하고 그 근거를 `bench-judge.mjs` 에 박제하는 것이다.
`bench:scene:set-baseline`(단일 리포트 복사) 경로는 `min`/`max` 가 없어 보정을 확인할 수 없고,
판정 출력에 `ℹ [보정] 판정선 보정 확인 불가` 가 찍힌다.

### 후속 축 — 검출 하한을 더 낮추려면

산포의 지배 성분은 **회차 전역 인자**(러너 머신 속도)다 — 전역 인자 rsd `14.9%` vs 셀별 잔차
rsd `6.0%` (10 회차 실측 분해).

⚠️ **셀 간 비율로 이를 걷어내는 정규화는 답이 아니다** — 원칙과 실측 양쪽에서 막힌다.
(i) 분모가 다른 시나리오의 측정값이라 **한 셀의 고장이 다른 셀의 허용치를 움직인다**
([#1226](https://github.com/coseo12/astro-simulator/issues/1226) 재생산).
(ii) 같은 10 회차로 재보면 (LOO 오발화 `0` 기준) 단일 셀 회귀 하한은 `45% → 33%` 로 내려가지만
**균일 감속은 어떤 수준에서도 검출되지 않는다** — 정규화가 걷어내는 성분이 곧 **전역 회귀가
사는 성분**이기 때문이다.

안전하게 같은 이득을 얻으려면 분모가 제품 성능과 무관한 **독립 머신 속도 프로브**(고정 CPU
워크로드)여야 한다 — 전역 회귀를 흡수하지 않으면서 러너 속도만 나눈다. 이는 baseline 재측정을
요구하므로 #1209 범위 밖이다.
