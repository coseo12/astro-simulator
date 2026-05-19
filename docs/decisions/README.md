# Architecture Decision Records (ADR)

코어 기술 결정의 **배경 / 후보 비교 / 결정 / 재검토 조건**을 박제하는 디렉토리.

## 규약

- 파일명: `<YYYYMMDD>-<kebab-case-topic>.md`
- **같은 날짜에 여러 ADR 이 발생할 경우 topic 접미사로 관계 표현**: 상위 결정은 `<topic>` (예: `-gitflow-main-develop`), 세부 결정은 `<topic>-<하위범위>` (예: `-release-merge-strategy`). 상위 ADR 은 하위 ADR 에서 "선행 ADR" 로 인용
- 본문 구조와 작성 절차는 `record-adr` 스킬을 참조 (또는 호출).
- 결정이 무효화/대체될 때는 **삭제하지 않고** 상태를 `Superseded by [신규 ADR]`로 갱신한다.
- 1 ADR = 1 결정. 여러 결정을 묶지 않는다.

## ADR 수정 컨벤션 — Amendment B 형식 (immutable + 별도 §Amendment N 섹션)

ADR 의 §배경 / §후보 비교 / §결정 / §운영 절차 / §교차검증 반영 사항 는 **immutable** — 본문 직접 수정 금지. Michael Nygard ADR 원형 정신 (결정 이력 보존) + 의사결정 추적성 보장. 본문을 직접 갱신하면 미래의 독자가 "원래 무엇을 결정했는지" 와 "왜 바뀌었는지" 를 구분할 수 없다.

**수정 발생 시 의무 절차**:

1. 원본 §섹션 본문 **그대로 보존** (strikethrough / footnote / 인라인 주석 박제 금지 — Amendment A 형식 금지)
2. ADR 파일 끝에 **별도 `## Amendment N — YYYY-MM-DD — <한 줄 요약>`** 섹션 신설 (1부터 시작, 누적 1씩 증가)
3. Amendment N 섹션 표준 구조 (`docs/decisions/_amendment-template.md` 참조):
   - **발의** — `[#이슈](URL) (트리거 발화 일자, deadline 등)`
   - **트리거** — 측정 임계값 / cross-validate 합의 / 사용자 의사 결정 / 실측 발견 중 분류 명시
   - **변경 내용** — 폐기되는 가정 / 정정안 / 측정 지표 갱신 / 옵션 비교 등
   - **결정** — 사용자 / Gemini cross-validate / architect 의 명시 결정
   - **영향** — 코드 수정 여부 / 다른 §섹션 강화 여부 / 후속 이슈
   - **cross-link** — 본 Amendment / 발의 이슈 / 선행 Amendment / 관련 PR

**Amendment 분류 (변경 성격)**:

- **결정 폐기** — §결정 의 한 항목을 명시적으로 폐기 + 정정안 박제
- **재검토 조건 강화** — §재검토 조건 의 기존 항목 옵션 추가 / 새 측정 지표 박제
- **측정 지표 갱신** — 임계값 / health metric 정정 (식 자체 정확, 자릿수 오차 등)
- **트리거 발화 박제** — §재검토 조건 임계값 충족으로 Amendment 가 자동 발화 (B 형식 ADR Z 패턴)

**비대상 (Amendment 박제 불필요)**:

- §배경 본문의 typo / 단순 정정 (식 자체 정확) — 본문 직접 정정 + PR 본문에 검산 박제로 충분
- 외부 cross-link 추가 / URL 유효성 정정 — 본문 직접 정정 가능
- §교차검증 반영 사항 의 cross-validate 추가 항목 (정책상 누적 박제 영역)

**1차 적용 사례**:

- `20260515-harness-managed-divergent-pattern.md` Amendment 1~6 (2026-05-16 ~ 2026-05-18) — Phase 2 임계값 / 옵션 A/B/C 분기 누적 박제
- `20260512-au-slider-semantics.md` Amendment 1 (2026-05-18) — sun focus desiredRadius drift 박제 (결정 폐기 + 재검토 조건 강화 동시)

**회귀 가드**:

- 다음 ADR 수정 시 본 컨벤션 따르는지 reviewer 단계 확인 (단, `.claude/agents/reviewer.md` §절차 5 ADR 호환성 의미론적 검증 의 grep 1차 키워드 `Amendment` 가 1차 가드)
- 기존 ADR 본문 직접 수정 사례 발견 시 별도 회귀 이슈 분리 (`Builds on:` 명시)

## 현재 ADR 인덱스

| 날짜 | 주제 | 상태 | 상하 관계 |
|---|---|---|---|
| 2026-04-19 | [gitflow-main-develop](20260419-gitflow-main-develop.md) | Accepted | **상위** — `main=배포 / develop=개발` 브랜치 전략 결정 |
| 2026-04-19 | [release-merge-strategy](20260419-release-merge-strategy.md) | Accepted | **세부** — 위 gitflow 의 release PR merge 방식 결정 (`--merge` + fast-forward). 선행 ADR: `20260419-gitflow-main-develop` |
| 2026-04-20 | [jq-based-parsing-no-op](20260420-jq-based-parsing-no-op.md) | Accepted (NO-OP) | cross-validate outcome JSON 파싱의 jq 전환 **기각** — grep/sed 파이프라인 유지 + 경계 가드 테스트 추가 |
| 2026-05-15 | [harness-managed-divergent-pattern](20260515-harness-managed-divergent-pattern.md) | Accepted | harness-managed 파일 (atomic) 의 프로젝트 고유 확장 + upstream 기여 병행 (Z 패턴). 선행 ADR: `20260419-prettier-harness-conflict` |

## 언제 작성하는가

- 코어 언어/런타임/프레임워크 도입·교체
- 주요 외부 의존성 추가 (DB, 메시지 큐, 인증 등)
- 프로젝트 전반 영향 패턴 채택 (상태 관리, 빌드 도구, 모노레포 구조)

일회성 코드 결정은 ADR 대상이 아니다 (PR 본문/커밋 메시지로 충분).

## 참고

- harness CLAUDE.md "아키텍처 결정 기록 (ADR)" 절
- ADR 원형: https://adr.github.io
