# ADR: prettier vs harness upstream 포맷 충돌 해결 — 매니페스트 기반 `.prettierignore` 자동 생성

> **Superseded** — 본 결정의 대상 기계 (`scripts/sync-prettierignore.mjs`, manifest 파생 자동 생성) 는 #907 하네스 디커플로 제거되었고, [20260731-907-harness-decouple.md](20260731-907-harness-decouple.md) §결정 4 (정적 curated 섹션 + live 문서 `!` negation) 가 대체 규약이다. 본문은 이력 보존 (불변).

- 일자: 2026-04-19
- 상태: Superseded (by [20260731-907-harness-decouple.md](20260731-907-harness-decouple.md), 2026-07-31, #907)
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

### drift 파일 ↔ .prettierignore 교차 검증 가드 ([#578](https://github.com/coseo12/astro-simulator/issues/578) — 거부 근거 박제)

PR #569 (Amendment 10) 박제 직후 agy Antigravity cross-validate (2026-05-26) 고유 발견 #3 후속 분리. agy 제안: `verify-harness-drift-decorator.mjs` 가 drift 상태로 판별한 모든 파일 경로가 로컬 `.prettierignore` 패턴에 정상 포함되어 있는지 파일 파싱을 통해 교차 검증 (별도 가드 step 추가).

**baseline 실측 (2026-05-27, develop tip)**: 6 drift 파일 ↔ `.prettierignore` 교차 검증 결과 — **1건 누락** (`docs/phases/roadmap-v3-incremental.md`). 다른 5 파일 (CLAUDE.md / `.claude/agents/architect.md` / `.claude/agents/pm.md` / `.github/workflows/harness-guards.yml` / `scripts/verify-z-pattern-health.mjs`) 은 정합 포함.

**누락 원인 분석**: `docs/phases/roadmap-v3-incremental.md` 는 manifest 에 등록된 harness-managed 파일이나 **CLAUDE.md 예외 경로 SSoT** (CLAUDE.md "프로젝트 고유 보강 교훈" §"prettier 컨벤션 충돌" — `docs/benchmarks/**`, `docs/phases/**`, `docs/reports/**`, `docs/retrospectives/p*-retrospective.md`) 정합 의도적 제외. `scripts/sync-prettierignore.mjs` 가 이 예외 경로 화이트리스트를 적용해 `.prettierignore` 에서 의도적 제외.

**결정: agy 제안 가드 거부** (옵션 B — ADR 거부 근거 박제만, #574 옵션 C 패턴 답습). 근거:

- **본 프로젝트 SSoT (예외 경로) 위반**: agy 가드 도입 시 `docs/phases/roadmap-v3-incremental.md` 1건 즉시 false-positive 발화 — CLAUDE.md 예외 경로 SSoT 와 직접 충돌
- **운영 비용 부담**: 가드 도입 시 화이트리스트 매니페스트 추가 + 운영 부담 +1 — 현재 false-positive 빈도 ↑ 가드 효과 ↓
- **기존 가드로 충분**: `sync-prettierignore.mjs --check` + `.github/workflows/prettierignore-drift.yml` 이 이미 매니페스트 ↔ `.prettierignore` 동기화 검증 + PR 차단 수행 (도입 PR #229/#230 답습). agy 가드는 동일 영역 중복

**미래 재검토 트리거 (옵션 A 승격 경로)**:

- **예외 경로 외 drift 파일 leak 발생** — CLAUDE.md 예외 경로 SSoT 가 아닌 파일이 `.prettierignore` 누락 시 본 가드 도입 가치 발생 (false-positive 0, true-positive 1+)
- **CLAUDE.md 예외 경로 SSoT 폐기** — `docs/phases/**` 등 예외 정책 변경 시 본 §섹션 재검토 의무
- **agy 가드 + 화이트리스트 통합 신규 설계** — 예외 경로 SSoT 를 가드에 통합하면 false-positive 0 가능. 단 운영 부담 +1 trade-off 재검증

**관련 직교 영역**:
- [#578 agy 권고 영역 자체 거부] — 본 §섹션
- [markdownlint 정합성 사전 박제] (#559) — 직교 도구 영역, 본 ADR 다른 §섹션
- [Amendment 10 [TODO] 자동 해소] (#569) — 직교 (drift 해소 차원)

### markdownlint 등 정적 검사 도구 충돌 가능성 ([#559](https://github.com/coseo12/astro-simulator/issues/559) — 사전 박제)

PR #555 (ADR 20260515 Amendment 7) cross-validate agy Antigravity 고유 발견 #4 후속 분리. 본 ADR 의 prettier 경계 drift 답습 패턴 적용 — 미래 markdownlint / stylelint / eslint markdown 플러그인 등 다른 정적 검사 도구 도입 시 동일 경계 위험.

**경계 위험 가설 (markdownlint 도입 시 가정 — 본 프로젝트 현재 미도입)**:
- harness-managed `.md` (`CLAUDE.md`, `.claude/agents/*.md`, `.claude/skills/*/SKILL.md` 등) 가 markdownlint 규칙 위반 시 local fix → harness sha256 drift (prettier 경계 drift 답습)
- IDE 자동 fix on save 가 동일 함정 (volt #35 prettier 재포맷 경계 drift 답습)

**예방 가드 (도입 시점 박제 의무)**:
1. **`.markdownlintignore` 매니페스트 동기화**: `scripts/sync-prettierignore.mjs` 패턴 답습 — manifest 의 harness-managed 경로를 `.markdownlintignore` 의 `# --- harness-managed ---` 블록으로 자동 동기화 (`sync-prettierignore.mjs` 일반화 또는 신규 `sync-markdownlintignore.mjs`)
2. **CI drift 가드**: `.github/workflows/markdownlintignore-drift.yml` 신설 — `--check` 모드로 drift 차단 (`prettierignore-drift.yml` 답습)
3. **운영 의무**: `harness update --apply-*` 직후 `pnpm sync:markdownlintignore` 실행 후 동일 커밋에 포함 (prettier 정합 의무 답습)
4. **데코레이터 의무**: ADR `20260515` Amendment 8 의 HARNESS-DRIFT 데코레이터가 markdownlint 규칙 (`MD041: first-line-h1` / `MD013: line-length` 등) 위반 시 → `.markdownlint.json` 의 `default: false` 또는 inline disable (`<!-- markdownlint-disable -->`) 박제 가이드 필요

**현재 박제 상태 (2026-05-27)**: 본 프로젝트 markdownlint 미도입. 본 §섹션은 미래 도입 시점 SSoT 박제 (사전 가드, 도입 PR 시 본 §섹션 참조 의무).

**관련 후속 분리**: [#578](https://github.com/coseo12/astro-simulator/issues/578) (Prettier 정합성 자동 교차 검증) — Amendment 12 영역 / 본 §섹션 (markdownlint) 영역 직교. 둘 다 미래 도입 시점 박제.
