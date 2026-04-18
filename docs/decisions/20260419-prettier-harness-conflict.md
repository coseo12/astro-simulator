# ADR: prettier vs harness upstream 포맷 충돌 해결 — 매니페스트 기반 `.prettierignore` 자동 생성

- 일자: 2026-04-19
- 상태: Accepted
- 관련: 이슈 [#229](https://github.com/coseo12/astro-simulator/issues/229), PR [#228](https://github.com/coseo12/astro-simulator/pull/228), volt [#27](https://github.com/coseo12/volt/issues/27) / [#29](https://github.com/coseo12/volt/issues/29), CLAUDE.md §"매니페스트 최신 ≠ 파일 적용 완료"

## 배경

harness-setting upstream 의 포맷 컨벤션(double quote / 섹션 헤더 뒤 빈 줄 / 테이블 공백 정렬)과 프로젝트 `.prettierrc.json`(`singleQuote: true`, `printWidth: 100`)이 충돌한다.

결과적으로 다음 사이클이 반복된다:

1. `harness update --apply-all-safe` 가 upstream 파일 적용
2. git 스테이징된 파일을 lint-staged `prettier --write` 가 로컬 컨벤션으로 재포맷
3. 실질 콘텐츠 변경이 없는 파일은 pre-commit hook 에 의해 자동 unstage (부분 커밋)
4. `.harness/manifest.json` 은 upstream 해시를 기록했으나 디스크는 로컬-포맷 버전 → **파일 내용 ↔ 매니페스트 해시 불일치**
5. 다음 `harness update --check` 가 "안전 업데이트 38~39개"를 지속 표시 → **신호 품질 저하**

PR #228 에서 `--bootstrap` 으로 매니페스트 baseline 을 로컬-포맷 버전으로 재박제해 일시 해소했으나, upstream 신규 마이너 릴리스(v2.12.0 이미 존재) 시마다 동일 패턴이 재발된다. 근본 해결 필요.

## 제약

- **astro-simulator 고유 docs**(`docs/phases/`, `docs/benchmarks/`, `docs/reports/`, `docs/retrospectives/p*`) 는 기존 prettier 컨벤션 유지 — 프로젝트 자체 문서는 통일된 포맷을 유지해야 읽기 편함.
- harness-managed 파일은 140개이며 버전 업그레이드 시 경로 목록이 변동(v2.11 → v2.12 에서 39개 변경).
- 수동 유지는 volt #13 (lint-staged silent partial commit) 및 volt #27 (매니페스트 교착 복구) 의 교훈과 상충 — 자동화 원칙과 맞아야 함.

## 후보 비교

| 항목            | A: `.prettierignore` 수동 추가                    | B: `.prettierrc.json` 을 upstream 포맷으로 조정   | **C: 매니페스트 기반 `.prettierignore` 자동 생성** |
| --------------- | ------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------- |
| 해결 범위       | harness-managed 파일만 prettier 제외              | 프로젝트 전체 포맷 전환                           | **harness-managed 파일만 prettier 제외 (자동)**    |
| 구현 비용       | 낮음 (수동 경로 추가 ~10줄)                       | 매우 높음 (전체 재포맷 + PR 대규모)               | **중간 (스크립트 ~50줄 + CI 가드)**                |
| 재발 방지       | ✗ (버전업마다 수동 동기화)                        | △ (포맷 일치하지만 upstream 취향 변경 시 재충돌)  | **✓ (매니페스트 변경 시 자동 반영)**               |
| astro 고유 영향 | 없음                                              | **대규모 재포맷** (singleQuote 변경)              | 없음                                               |
| 회피 용이성     | `.prettierignore` 직접 삭제 가능                  | `.prettierrc.json` 직접 수정 가능                 | 스크립트 우회 가능 — CI 가드로 보완                |
| 유지보수        | 낮지만 **재발 위험 높음**                         | 매우 낮음 (한 번 세팅 후 영구)                    | **중간 (스크립트 1개 + 가드 1개)**                 |
| 실패 모드       | 버전업 후 수동 업데이트 누락 시 조용히 drift 재발 | upstream 컨벤션 변경 시(예: single→double) 재충돌 | **스크립트 실패 시 CI 가드가 감지 → PR 차단**      |
| 확장성          | 신규 harness 스킬/에이전트 추가 시 수동 추가      | 영향 없음                                         | **자동 포함 — 매니페스트에 들어오면 자동 제외**    |

## 결정

**후보 C 채택** — `.prettierignore` 를 매니페스트에서 자동 생성하고 CI 가드로 드리프트 재발을 감지한다.

구성 요소:

1. **`scripts/sync-prettierignore.mjs`**: `.harness/manifest.json` 에서 파일 경로 목록을 읽어 `.prettierignore` 의 `# --- harness-managed (auto-generated, do not edit) ---` ~ `# --- end harness-managed ---` 블록을 재생성. 블록 바깥의 사용자 항목은 보존.
2. **`package.json` scripts**: `sync:prettierignore` (수동 실행), `postinstall` 에 추가해 `pnpm install` 직후 자동 실행.
3. **CI 가드** (`.github/workflows/` 또는 기존 verify-and-rust 에 추가): `pnpm sync:prettierignore && git diff --exit-code -- .prettierignore` 로 drift 감지, 있으면 PR 실패.
4. **harness post-apply 통합**: `harness update --apply-*` 실행 후 사용자가 `pnpm sync:prettierignore` 를 수동 실행하도록 CLAUDE.md "매니페스트 최신 ≠ 파일 적용 완료" 섹션에 체크포인트 추가.

### 제외 대상 정책

매니페스트의 모든 파일을 일괄 제외하되, **다음 예외**는 매니페스트에 포함되더라도 제외하지 않는다:

- `docs/benchmarks/**` — astro-simulator bench 결과물 (프로젝트 고유)
- `docs/phases/**` — Phase 계약 문서 (프로젝트 고유)
- `docs/reports/**` — Phase 보고서 (프로젝트 고유)
- `docs/retrospectives/p*-retrospective.md` — Phase 회고 (프로젝트 고유)

위 경로들은 매니페스트 상으로는 tracked 이지만 프로젝트 작업물로 취급 → 로컬 prettier 컨벤션 적용.

> **근거**: 이슈 #229 비-범위 항목에 명시된 제약. 해당 경로들은 upstream 이 seed 제공한 뒤 로컬에서 갱신되는 live 문서이므로, 로컬 컨벤션이 일관성을 해치지 않는다.

## 결과 · 재검토 조건

### 성공 신호

- `harness update --check` 결과: 동일 140 (drift 0) — 이슈 #229 완료 조건 검증.
- 후속 harness 마이너 업그레이드 시뮬레이션(예: v2.11.0 → v2.12.0 apply) 후 `pnpm sync:prettierignore && pnpm install` → drift 없음.
- CI 가드가 `.prettierignore` 수동 수정 또는 매니페스트 변경 후 sync 미실행을 감지 → PR 실패.

### 재검토 조건

- upstream harness-setting 이 `.prettierrc` 컨벤션을 프로젝트와 정렬한 경우(`singleQuote: true` 채택) → 본 ADR 폐기, `.prettierignore` harness 블록 제거.
- 매니페스트 포맷 breaking change (files 키 구조 변경) → 스크립트 수정 필요.
- `docs/phases/**` 등 예외 경로 정책 변경 (예: Phase 문서를 upstream 제공으로 전환) → 예외 목록 재검토.
- lint-staged 설정이 변경되어 `*.md/*.json/*.yaml` 외 패턴이 추가되는 경우 → 제외 규칙 확장 검토.

### 의도적 비채택 근거

- **후보 A**: 버전업마다 수동 경로 업데이트 — volt #27 이 경고한 "조용한 drift" 패턴의 정확한 재연. 자동화 우선 원칙과 맞지 않음.
- **후보 B**: upstream 과의 포맷 합의는 조직 경계 외(harness-setting 저장소 이슈). 프로젝트 단독 해결 범위 초과 + 대규모 PR 리스크.
