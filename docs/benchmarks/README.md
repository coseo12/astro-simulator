# Benchmarks

`bench:scene` 자동 벤치 리포트 저장소. P2에서 N-body 전환 시 성능 회귀 감지용.

## 실행

```bash
# 별도 터미널: 앱 서버 기동 (3001 포트)
pnpm dev

# 벤치 실행 → docs/benchmarks/{timestamp}.json 생성
BENCH_PHASE=p1-end pnpm bench:scene

# N-sweep 모드 (소행성대 N=10,100,200,1000 각각 play-1y fps)
BENCH_PHASE=p2-0-end pnpm bench:scene:sweep

# 첫 실행 시 baseline 설정
pnpm bench:scene:set-baseline
```

### 환경변수

- `BENCH_PATH` — 측정 경로 (기본 `/ko`). 예: `BENCH_PATH=/ko?belt=200`
- `BENCH_N_SWEEP` — N-sweep 대상 (쉼표구분). 설정 시 각 N마다 `?belt=N` 재방문
- `BENCH_REGRESSION_FPS` — 회귀 판정 임계값 (기본 `-2`, CI는 `-10`)
- `BENCH_SUMMARY_OUT` — Markdown 요약 출력 경로 (CI 코멘트용)

## 파일 규칙

- `{ISO-timestamp}.json` — 개별 측정 리포트 (타임스탬프 슬러그)
- `baseline.json` — 비교 기준선. 의미 있는 성능 기준점(예: P1 종료, P2-0 완료) 갱신 시 업데이트
- 각 리포트 JSON은 `{ timestamp, phase, scenarios: [{ name, fps }] }` 스키마

## 회귀 판정

bench 실행 시 baseline 대비 각 시나리오의 fps 변화율을 출력한다.
`Δ < -2 fps` 인 시나리오는 `⚠` 마크. PR에 그 출력을 첨부하거나 값 악화 원인을 분석 후 PR 본문에 기록한다.

## N-sweep 리포트 스키마

`bench:scene:sweep` 실행 시 리포트에 `nBody: [{ n, fps }]` 필드가 추가된다. P3-0부터 N=[10, 100, 200, 1000, 5000, 10000] 샘플을 `/ko?belt=N` 경로에서 play-1y 시나리오로 측정한다 (10000은 sim-canvas의 ThinInstances cap과 일치).

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
