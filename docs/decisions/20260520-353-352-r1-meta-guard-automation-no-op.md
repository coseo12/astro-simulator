# ADR: [#353][#352] R1 메타 가드 자동화 (diff inline / 카나리아 스케줄) — NO-OP 결정

- **상태**: Accepted
- **날짜**: 2026-05-20
- **결정자**: architect (#353/#352 인계 항목 실측 재검증 — NO-OP ADR 패턴, volt #14)
- **관련**: #353 (diff inline), #352 (카나리아 스케줄), #348 (R1 r1-guard CI 통합 부모 PR), [`20260425-r1-ui-pixel-diff-guard.md`](20260425-r1-ui-pixel-diff-guard.md) §Amendment v3
- **교훈 적용**:
  - "인계 항목 실측 재검증 — NO-OP ADR 패턴" (CLAUDE.md / volt #14) — 본 케이스 정확 적용
  - 보수적 인프라 도입 — 재검토 트리거 명시 박제 후 보류 (R5 진입 또는 누적 신호 발생 전)

---

## §1 배경

### cross-validate 고유 발견 분리 (Gemini 2.5 Pro, 2026-04-26)

R1 ADR Amendment v3 (`20260425-r1-ui-pixel-diff-guard.md`) cross-validate 에서 2개 자동화 제안 분리:

- **#353** — r1-guard fail 시 diff PNG 를 PR 코멘트 inline 첨부 (리뷰 마찰 절감)
- **#352** — 메타 가드 (false positive 검증) 자동화 — 매주 카나리아 PR 생성 + r1-guard fail 단언

### 인계 항목 실측 재검증 (2026-05-20)

R1 운영 약 1개월 경과 시점 (2026-04-25 ADR 박제 → 2026-05-20 현재):

- **r1-guard fail 빈도**: 본 세션 (2026-05-19~20) 의 #506/#508 / PR #513 등에서 R1 가드 fail 케이스 관찰. 그러나 모두 **의도된 UI 변경 + baseline 갱신 워크플로 dispatch** 로 1-step 해소 (#515 패턴). 자동 PR 코멘트 inline 첨부의 ROI 임계 미충족
- **메타 가드 false positive 수동 검증**: 미수행 (1회성 박제 후 재검증 보류 중) — 그러나 R3 까지 r1-guard 자체 동작 안정 + 사용자 D-T2 가드 통과 → 메타 가드 신뢰성 의문 부재
- **R-Phase 누적**: 현재 R3 (3 phase 누적). #352 재검토 트리거 "R5 진입 시점" 미달

→ 두 자동화 모두 **현 시점 도입 ROI < 보류 ROI**.

---

## §2 NO-OP 결정 근거

### #353 (diff inline 첨부) — NO-OP

- 권한 비용: `pull-requests: write` 신설 (ci.yml read-only 원칙 침범)
- 호스팅 비용: GitHub 첨부 API 또는 외부 CDN 검토 필요
- 가독성 한계: 12 PNG (4 영역 × 3 viewport) inline 첨부 시 스크롤 폭주
- 현재 대체: `actions/upload-artifact` 7일 보존 — 다운로드 1-click 마찰만 (실 사용자 보고 0건)

### #352 (카나리아 스케줄) — NO-OP

- 자동화 비용: 워크플로 신설 + 권한 (`contents: write, pull-requests: write, issues: write`) + 디버깅
- 현재 가드 안정성: R3 까지 r1-guard 동작 안정, 사용자 D-T2 가드 통과 — 신뢰성 자동 측정 필요성 미달
- 1회성 메타 가드 박제 (Amendment 1 §Developer 인계 (e)) 가 R5 진입 전까지 충분

---

## §3 재검토 트리거

본 NO-OP 결정은 다음 조건 중 1개 발생 시 재검토:

### #353 재검토 트리거

1. r1-guard fail 빈도가 PR 당 평균 ≥ 1회 (리뷰 마찰 누적)
2. 다른 R-Phase 의 회귀 가드 인프라 누적 → diff artifact 가 빈번하게 발생 (현재 R1 단독으로는 ROI 낮음)
3. ci.yml read-only 원칙 변경 결정 (별도 ADR)

### #352 재검토 트리거

1. R5 진입 시점 (R-Phase 5건 누적 — baseline 안정성 데이터 충분)
2. 메인 ADR §재검토 트리거 #1 (false positive 비율 > 10%) 발생 — 가드 신뢰성 자동 측정 필요성 박제
3. r1-guard 가 운영 6개월 경과 + 메타 가드 수동 실증 누락 (1회성 박제 후 재검증 안 됨) 발견

---

## §4 회귀 가드

본 NO-OP 결정의 회귀 (즉 R5 진입 또는 트리거 충족 후 자동화 누락) 방어:

- 본 ADR §3 재검토 트리거 명시 박제 — 미래 R5 진입 PR 또는 운영 6개월 시점에 본 ADR 자동 인용 가능
- `20260425-r1-ui-pixel-diff-guard.md` §Amendment v3 와 cross-link (양방향 참조)

---

## §5 결과

- `.github/workflows/r1-canary-meta-guard.yml` **신설 안 함** (#352)
- PR 코멘트 inline 첨부 워크플로 **신설 안 함** (#353)
- 현재 `actions/upload-artifact` + 1회성 메타 가드 박제 그대로 유지

## 변경 이력

- 2026-05-20: NO-OP 결정 박제 (인계 항목 실측 재검증 — R3 시점 가드 안정 + R5 진입 트리거 미달)
