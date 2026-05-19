# ADR: [#383] verify-visual-proportion 공식화 — NO-OP 결정

- **상태**: Accepted
- **날짜**: 2026-05-20
- **결정자**: architect (#383 인계 항목 실측 재검증 — NO-OP ADR 패턴, volt #14)
- **관련**: #383 (본 이슈), #373 (forensic 모범 사례, cross-validate 고유 발견 #3 발화점), [`docs/decisions/20260430-r3-followup-body-proportion.md`](20260430-r3-followup-body-proportion.md)
- **교훈 적용**:
  - "인계 항목 실측 재검증 — NO-OP ADR 패턴" (CLAUDE.md / volt #14) — 본 케이스 정확 적용
  - "신규 함수 ≠ 신규 구현" (volt #21) — 새 스크립트 작성 전 기존 인프라 (r1-guard) 재사용 확인 필요
  - "조사 국면 확장 — debug 스크립트 실측 선행" (volt #67) — 공식화 결정 전 실 측정 도구 현황 확인

---

## §1 배경

### #383 본 이슈 핵심

#373 cross-validate Gemini 고유 발견 #3 — 발화 시점 (2026-04-30) 에 `_debug-373-proportion-tmp.mjs` 가 다음 측정 매트릭스를 커버했음:

- 다중 metric (brightRatio / sunDiskRatio / planetDiskRatio / visibleRatio / disk area)
- body 간 px diameter 비 + disk area 비
- orbit 거리 / sun radius 비율

본 이슈는 이 debug 패턴을 **공식 스크립트** (`scripts/verify-visual-proportion.mjs`) 로 승격할지 평가 요청.

### 인계 항목 실측 재검증 (2026-05-20)

`apps/web/scripts/r1-ui-regression-guard.mjs` 의 현재 상태 확인:

- **line 13**: `--measure-px-ratio` CLI 옵션 박제 (#373 ADR `20260430-r3-followup-body-proportion.md` §결정 2 §5)
- **line 56**: `args.includes('--measure-px-ratio')` 파싱
- **line 574**: `console.log('mode: measure-px-ratio')` 진입
- **line 581-582**: SKIP_LOCAL 무관 (px ratio 가 viewport 무관 — renderScale 결합 기반)
- **line 592, 612**: `flags.measurePxRatio` 분기에서 body 간 px 비 + 모바일 누적 disk area 측정

→ **r1-guard 가 본 이슈가 요구하던 측정 인프라를 이미 흡수 완료**.

---

## §2 NO-OP 결정 근거

### 본 이슈 (a) 공식화 vs (b) NO-OP 비교

| 축 | (a) 공식화 (신규 스크립트) | (b) NO-OP (r1-guard 단독) |
|---|---|---|
| 측정 커버리지 | 신규 viewport / 카메라 거리 / DPR 매트릭스 확장 가능 | 현재 r1-guard 가 viewport 무관 + body 매트릭스 + 모바일 누적 disk area 모두 커버 |
| 유지 비용 | 신규 스크립트 + npm script + 단위 테스트 + ADR 박제 (60~120 라인) | 0 (기존 r1-guard 재사용) |
| 중복 위험 | r1-guard `--measure-px-ratio` 와 기능 중복 → drift 위험 | 단일 SSoT |
| 회귀 가드 | 별도 매트릭스 — r1-guard 회귀와 분리 추적 | r1-guard 회귀 게이트와 자연 통합 |
| 가치 | 미래 R4+ 추가 측정 요구 시 진입 비용 절감 | 현 시점 추가 측정 요구 0 |

**결정**: **NO-OP** — r1-guard `--measure-px-ratio` 가 본 이슈의 의도된 측정 매트릭스를 충분 커버. 별도 `verify-visual-proportion.mjs` 신설은 중복 + drift 위험 + 유지 비용 발생.

### "신규 함수 ≠ 신규 구현" 원칙 적용

CLAUDE.md §"신규 함수 ≠ 신규 구현" 교훈 — 새 스크립트 작성 전 기존 인프라 재사용 확인 의무. 본 이슈에서는:

1. **Grep 으로 `measureSunCoverage` / `measurePxRatio` 패턴 확인** → r1-guard 의 5+ 라인 흡수 확인
2. **인계 시점 (2026-04-30 → 2026-05-20) 사이 r1-guard 의 자연 확장으로 본 이슈 의도 충족**

→ 별도 함수/스크립트 신설은 sunk cost 편향 (인계 항목이라 작업 의무 느낌) 의 함정.

---

## §3 재검토 트리거

본 NO-OP 결정은 다음 조건 중 1개 발생 시 재검토:

1. **R4+ 진입 시 r1-guard 가 커버하지 못하는 신규 측정 요구 발생** — 예: 모바일 DPR 매트릭스, AR/VR viewport, multi-tier 시뮬레이션 비교
2. **r1-guard `--measure-px-ratio` 가 빌드/유지 부담으로 분리 필요** — 단일 스크립트가 너무 비대해져 단일 책임 위배 시
3. **사용자 또는 외부 분석가가 별도 측정 도구 요청** — 표준화된 JSON 출력 / CI 통합 / 회귀 baseline 별도 추적 필요

---

## §4 회귀 가드 박제

본 NO-OP 결정의 회귀 (즉 r1-guard `--measure-px-ratio` 의 우발적 제거) 방어:

- **CI 가드**: `apps/web/scripts/r1-ui-regression-guard.mjs` 의 `--measure-px-ratio` 옵션 제거 시 본 ADR §재검토 트리거 1번 발동
- **명시 주석**: `r1-ui-regression-guard.mjs` 상단 docstring 에 본 ADR cross-link 추가 (이미 line 21 에서 #373 ADR §결정 2 §5 인용으로 정합)

추가 코드 변경 0 — 기존 인프라 재사용 결정만 박제.

---

## §5 결과

- `scripts/verify-visual-proportion.mjs` **신설 안 함**
- `package.json` 신규 npm script **추가 안 함**
- 기존 r1-guard `--measure-px-ratio` 그대로 사용 (변경 0)
- 본 ADR 박제로 미래 재검토 트리거 정합 (인계 항목 sunk cost 편향 회피)

## 변경 이력

- 2026-05-20: NO-OP 결정 박제 (인계 항목 실측 재검증, r1-guard 이미 흡수 확인)
