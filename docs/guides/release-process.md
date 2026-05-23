# 릴리스 프로세스 상세

> CLAUDE.md `### 릴리스` 본문 가지치기 위임 (이슈 #266 / PR #287). CLAUDE.md 본문은 SemVer 분류 매트릭스 (각인층) + 1줄 포인터만 유지.

## SemVer 분류 기준 (판정 애매 시 낮은 쪽 선택)

- **MAJOR** — 하위 호환을 깨는 변경. CLI 인자 제거/시그니처 변경, 기존 스킬·에이전트 계약 파괴, `.harness` 스키마 breaking, 설정 키 제거
- **MINOR** — 코드 **또는 에이전트 행동**이 포함된 신규 기능·행동 변화 추가
  - 신규 CLI 서브커맨드, 신규 에이전트/스킬, 신규 hook/automation, 신규 옵션(기본값이 기존 동작 유지)
  - **에이전트 지시어·스킬 절차·체크리스트·행동 제약의 추가·수정** (`.claude/agents/*.md`, `.claude/skills/*/SKILL.md` 의 **행동을 바꾸는** 변경)
- **PATCH** — **행동 변화가 없는** 문서·문구 변경. CLAUDE.md 교훈/배경 설명 추가, README·docs 문서화 보강, 주석·문구·오타 개선, 버그 수정

## 행동 변화 vs 문서 변경 판정 질문

이 변경으로 에이전트가 같은 입력에 다르게 동작하는가? 예(= 행동 변화 = MINOR), 아니오(= 문서 = PATCH).

- 예시 **MINOR**: developer 에이전트 워크플로 단계 추가, 스킬 DO NOT TRIGGER 조건 변경, 금지 규칙 추가
- 예시 **PATCH**: 실전 교훈 섹션에 사례 추가, README 문구 개선, 오타 수정, 버그 수정

## CHANGELOG 작성 규칙

- MINOR/MAJOR 릴리스는 **`### Behavior Changes`** 섹션을 필수 포함하여 다운스트림이 `harness update` 후 관찰할 행동 변화를 bullet 으로 나열한다
- PATCH 릴리스도 frozen 파일(`.claude/`)이 변경됐다면 `### Behavior Changes: None — 문서/문구만` 을 명시해 자동 업데이트 신뢰 모델을 보호한다
- 볼트 반영은 변경 성격에 따라 분류 — 에이전트·스킬 행동 변경이면 MINOR, 단순 교훈·문서 보강이면 PATCH
- 의미 있는 마일스톤마다 `git tag` + `gh release create`로 릴리스

## `package.json::version` bump 필수

chore(release) PR 에서 `CHANGELOG.md` 엔트리 추가와 **동일 커밋** 에 `package.json::version` 을 새 버전으로 bump. 누락 시 다운스트림이 `harness update` 에서 구 버전으로 인식. `scripts/verify-release-version-bump.sh` 가 CI `detect-and-test` 에서 CHANGELOG 최신 엔트리 ↔ `package.json::version` 일치를 검증하여 drift 시 exit 1 (v2.28.1 복구와 함께 도입). 로컬에서 chore release 커밋 전에 `bash scripts/verify-release-version-bump.sh` 실행 권장.

## Phase 분리 릴리스 리듬

완료 기준이 많은 이슈는 한 스프린트에 몰아 처리하지 말고, 각 Phase 가 **독립 릴리스 가능한 관찰 단위**가 되도록 나눈다. 적용 조건(3가지 전부 필요):

- **backward-compat** — 앞 Phase 만 배포돼도 시스템이 정상 동작
- 각 Phase 가 **완결 Behavior Change 집합** — 중간 Phase 가 부분 구현 상태가 아님
- 사용자가 **점진 릴리스 리듬에 동의** — 주간 단위로 여러 릴리스 허용

**적용 불가**: Phase 간 필수 의존(앞 Phase 단독 배포 시 불안정), 파이프라인 변경이 전체를 통째로 요구. 판정 애매 시 단일 릴리스로 통합.

**분할 시 CHANGELOG 작성**: Phase 별 별도 entry + 상호 링크 박제 (사용자에게 "왜 쪼개졌는지"가 drift 되지 않도록). 원 이슈는 마지막 Phase 완료 시 한 번에 close.

## 근거

- volt [#30](https://github.com/coseo12/volt/issues/30) — harness [#92](https://github.com/coseo12/harness-setting/issues/92) (`previousSha256` 자가 복구) 를 Phase 1 (로직, v2.9.0) / Phase 2 (가시성 + 회귀 가드, v2.10.0) 로 분할. 리뷰 분산 + 중간 관찰 + 롤백 독립성 확보
- Antigravity 마이그레이션 (이슈 [#267](https://github.com/coseo12/harness-setting/issues/267), 2026-05-21) — Phase 0~4 + #276 분할로 v4.0.0 (MAJOR) + v4.1.0 (MINOR) 2 릴리스 완결. 각 Phase 별 독립 reviewer + 사용자 합의 + Behavior Changes 명시

## 관련

- [docs/guides/branch-strategy-workflow.md](branch-strategy-workflow.md) — release PR 머지 절차 (workflow 2단계)
- [docs/decisions/20260419-release-merge-strategy.md](../decisions/20260419-release-merge-strategy.md) — release PR `--merge` 의무 ADR
