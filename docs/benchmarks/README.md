# Benchmarks

`bench:scene` 자동 벤치 리포트 저장소. P2에서 N-body 전환 시 성능 회귀 감지용.

## 실행

```bash
# 별도 터미널: 앱 서버 기동 (3001 포트)
pnpm dev

# 벤치 실행 → docs/benchmarks/{timestamp}.json 생성
BENCH_PHASE=p1-end pnpm bench:scene

# 첫 실행 시 baseline 설정
pnpm bench:scene:set-baseline
```

## 파일 규칙

- `{ISO-timestamp}.json` — 개별 측정 리포트 (타임스탬프 슬러그)
- `baseline.json` — 비교 기준선. 의미 있는 성능 기준점(예: P1 종료, P2-0 완료) 갱신 시 업데이트
- 각 리포트 JSON은 `{ timestamp, phase, scenarios: [{ name, fps }] }` 스키마

## 회귀 판정

bench 실행 시 baseline 대비 각 시나리오의 fps 변화율을 출력한다.
`Δ < -2 fps` 인 시나리오는 `⚠` 마크. PR에 그 출력을 첨부하거나 값 악화 원인을 분석 후 PR 본문에 기록한다.

## P2-A 이후

Newton N-body 전환 후 `nBody: [{ n, fps }]` 필드가 추가된다. N=[10, 100, 200, 1000] 샘플.
