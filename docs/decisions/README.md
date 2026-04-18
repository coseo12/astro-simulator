# Architecture Decision Records (ADR)

코어 기술 결정의 **배경 / 후보 비교 / 결정 / 재검토 조건**을 박제하는 디렉토리.

## 규약

- 파일명: `<YYYYMMDD>-<kebab-case-topic>.md`
- **같은 날짜에 여러 ADR 이 발생할 경우 topic 접미사로 관계 표현**: 상위 결정은 `<topic>` (예: `-gitflow-main-develop`), 세부 결정은 `<topic>-<하위범위>` (예: `-release-merge-strategy`). 상위 ADR 은 하위 ADR 에서 "선행 ADR" 로 인용
- 본문 구조와 작성 절차는 `record-adr` 스킬을 참조 (또는 호출).
- 결정이 무효화/대체될 때는 **삭제하지 않고** 상태를 `Superseded by [신규 ADR]`로 갱신한다.
- 1 ADR = 1 결정. 여러 결정을 묶지 않는다.

## 현재 ADR 인덱스

| 날짜 | 주제 | 상태 | 상하 관계 |
|---|---|---|---|
| 2026-04-19 | [gitflow-main-develop](20260419-gitflow-main-develop.md) | Accepted | **상위** — `main=배포 / develop=개발` 브랜치 전략 결정 |
| 2026-04-19 | [release-merge-strategy](20260419-release-merge-strategy.md) | Accepted | **세부** — 위 gitflow 의 release PR merge 방식 결정 (`--merge` + fast-forward). 선행 ADR: `20260419-gitflow-main-develop` |

## 언제 작성하는가

- 코어 언어/런타임/프레임워크 도입·교체
- 주요 외부 의존성 추가 (DB, 메시지 큐, 인증 등)
- 프로젝트 전반 영향 패턴 채택 (상태 관리, 빌드 도구, 모노레포 구조)

일회성 코드 결정은 ADR 대상이 아니다 (PR 본문/커밋 메시지로 충분).

## 참고

- harness CLAUDE.md "아키텍처 결정 기록 (ADR)" 절
- ADR 원형: https://adr.github.io
