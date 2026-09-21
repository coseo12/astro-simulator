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
- `BENCH_REGRESSION_FPS` — 회귀 판정 임계값 (기본 `-2`, CI는 `-10`)
- `BENCH_SUMMARY_OUT` — Markdown 요약 출력 경로 (CI 코멘트용)

## 파일 규칙

- `{ISO-timestamp}.json` — 개별 측정 리포트 (타임스탬프 슬러그). **#905 부터 gitignored
  `.bench-out/` 에 기록** — 본 디렉토리에는 커밋하지 않는다 (실행마다 커밋 경로가 오염되던 재발 구조 제거)
- `baseline.json` — 비교 기준선 (tracked). 의미 있는 성능 기준점(예: P1 종료, P2-0 완료) 갱신 시 업데이트
- 각 리포트 JSON은 `{ timestamp, phase, commit, scenarios: [{ name, fps }] }` 스키마
- `commit` — **측정 대상 빌드의 sha** ([#1209](https://github.com/coseo12/astro-simulator/issues/1209)).
  리포트가 스스로 담으므로 `bench:scene:set-baseline`(단순 복사)·`bench-aggregate-median`(median 집계)
  두 갱신 경로 모두에서 baseline 으로 이어진다. 재측정 워크플로는 `--commit "${GITHUB_SHA}"` 로
  교차 검증한다 (회차별 sha 가 갈리면 exit 1).

## 회귀 판정

bench 실행 시 baseline 대비 각 시나리오의 fps 변화율을 출력한다.
`Δ < -2 fps` 인 시나리오는 `⚠` 마크. PR에 그 출력을 첨부하거나 값 악화 원인을 분석 후 PR 본문에 기록한다.
판정 출력에는 **비교 대상 baseline 의 timestamp·phase·commit** 이 함께 찍힌다 (#1209) — 「언제 잰
값과 비교 중인가」가 안 보이면 노후한 기준선의 상시 발화를 회귀로 오인한다.

### 회귀(⚠) ↔ 측정 실패(판정 불가) 구분 (#1209)

| 상황                                      | 출력                            | 종료 코드 |
| ----------------------------------------- | ------------------------------- | --------- |
| 측정 성공, baseline 대비 하락             | `⚠ <scenario>: … Δ …`           | `0`       |
| 시나리오 prep 셀렉터 부재 / 브라우저 오류 | `⛔ 측정 실패 (판정 불가)` 블록 | `1`       |

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

`.github/workflows/bench.yml` — PR 이벤트에서 sweep을 실행해 baseline 대비 diff를 sticky comment로 게시한다 (best-effort). 헤드리스 GitHub Actions runner의 GPU 변동성이 크므로 임계값을 `-10 fps`로 완화하며, 정식 성능 게이트는 로컬 실 GPU 측정(#116, `scripts/bench-scene-real-gpu.mjs`)을 기준으로 한다.

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

새 baseline 에는 `source_count` 와 각 항목의 `samples` 필드가 추가되어 재측정 근거를 추적 가능.
`commit` 필드(#1209)에는 aggregate 가 `--commit "${GITHUB_SHA}"` 와 회차 리포트 기록을 대조한
sha 가 들어간다 — **어느 빌드를 잰 기준선인가**가 baseline 파일 자체에 남는다.
