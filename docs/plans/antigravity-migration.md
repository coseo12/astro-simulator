# Antigravity 마이그레이션 기획서

- 날짜: 2026-05-21
- 작성자: harness 메인 오케스트레이터 (사용자 보고 기반)
- 상태: **Draft — 사용자 검토 대기**
- 관련 ADR: [20260521-gemini-to-antigravity](../decisions/20260521-gemini-to-antigravity.md) (Proposed)
- 관련 이슈: #267 (트래킹) / #268 (Phase 0) / #269 (Phase 1A) / #270 (Phase 2) / #271 (Phase 3) / #272 (Phase 4)

## TL;DR

사용자 보고에 따라 **Gemini CLI 지원 종료가 임박**, Google 의 후속 도구인 **Antigravity** 로 교체한다. 단순 명령어 치환이 아니라 **cross-validate 스킬의 핵심 외부 검증 백엔드 교체** 이며, 박제 범위가 43 파일 / 334 라인에 걸쳐 있다. Antigravity CLI 의 **headless (`-p "prompt"`) 호출 가능 여부가 미확인** 상태이므로 Phase 0 PoC 결과에 따라 Phase 1 이 두 갈래 (A: 어댑터 교체 / B: cross-validate 자체 재설계) 로 분기한다.

## 1. 배경

### 1.1 트리거
- 사용자 보고 (2026-05-21): "Gemini 에 대한 지원이 끝나가서 교체해야 돼" + Antigravity OAuth callback URL 공유 + `antigravity.google/docs/getting-started` 링크
- **지원 종료의 공식 출처/마감일은 본 기획서 작성 시점 미확인** — `docs/announcement` 페치 실패 (SPA JS 미렌더). 사용자 추가 정보 또는 별도 출처 확인 필요 → §4 미확인 사항 항목 R-2

### 1.2 현황 실측
- gemini-cli: `gemini@0.38.2` (npm `@google/gemini-cli`) 정상 설치, `~/.gemini/` 디렉토리 + OAuth `oauth_creds.json` 보유
- Antigravity CLI: **`agy` v1.0.0** 설치 완료 (`/Users/seo/.local/bin/agy`), 사용자 인증 완료, headless 호출 정상 (2026-05-21 사용자 보고 + 실측)
  - Go 기반 server + Language Server (gRPC `localhost:54628`, HTTP `localhost:54629`)
  - product 식별자 `antigravity`, gemini-cli 의 `~/.gemini/config/` 인프라 재사용 (auto-migrate 확인)
  - 인증: **OAuth (Code Assist 백엔드)** — 사용자 보낸 callback URL 이 이 흐름의 일부
  - TUI 기반 fullscreen (`terminal_info_manager`, `cli.enter` 키바인딩) — Claude Code 와 유사한 인터랙티브 UX, **단 `-p / --print` 로 비대화식 호출 가능**
- 배포 경로: npm 패키지 / GitHub 저장소 모두 미공개 (closed source). 사용자 환경은 `/Users/seo/.local/bin/agy` 에 직접 배치 (Antigravity installer 가 PATH 구성)
- 보낸 callback URL 의 OAuth scope: `cloud-platform`, `cclog`, `experimentsandconfigs`, `userinfo.{email,profile}`, `openid` → Antigravity 가 **GCP Code Assist 백엔드 + 실험/로깅 권한** 을 요구

### 1.3 `agy --help` 실측 결과 (2026-05-21, v1.0.0)

```
Usage of agy:
  --add-dir                       Add a directory to the workspace (repeatable)
  -c / --continue                 Continue the most recent conversation
  --conversation <ID>             Resume a previous conversation by ID
  --dangerously-skip-permissions  Auto-approve all tool permission requests
  -i / --prompt-interactive       Run an initial prompt interactively and continue
  --log-file                      Override CLI log file path
  -p / --print / --prompt         Run a single prompt non-interactively and print the response
  --print-timeout                 Timeout for print mode wait (default 5m0s)
  --sandbox                       Run in a sandbox with terminal restrictions enabled
Subcommands: changelog, help, install, plugin/plugins, update
```

**gemini-cli 와의 차이점 (마이그레이션 영향 큰 항목만)**:

| 항목 | gemini-cli | agy v1.0.0 | 마이그레이션 영향 |
|---|---|---|---|
| headless 호출 | `gemini -p "prompt"` | `agy -p "prompt"` (alias `--print` / `--prompt`) | **호환** — 옵션 이름 그대로 |
| 모델 지정 | `gemini -m gemini-2.5-pro` | **모델 옵션 없음** (단일 모델 또는 백엔드 자동 선택) | `GEMINI_MODEL` 환경변수 의존 코드 제거 필요. 모델 선택은 Antigravity 백엔드 위임 |
| 권한 모드 (read-only) | `--approval-mode plan` (도구 호출 차단) | **등가 옵션 부재**. 대신 `--sandbox` (터미널 제한) 또는 `--dangerously-skip-permissions` (반대 방향) | **#479 plan-mode 우회 가드 재설계 필수** — 우리 가드는 plan 모드가 강제된다는 가정. agy 는 default 가 도구 권한 요청 (`toolPermission=request-review`, log 확인) 이라 다른 보호 메커니즘 필요 |
| capacity probe | `gemini -p "hello"` (즉시 응답) | `agy -p "hello"` 정상 동작 + exit 0 (실측) | 동일 패턴 적용 가능. timeout 은 `--print-timeout` 으로 조정 |
| 출력 형식 | text (stdout) | text (stdout) — JSON 출력 옵션 미발견 | outcome JSON 생성 로직은 우리 측 (`cross_validate.sh`) 에서 그대로 처리 |
| exit code | 다양 (0/1/429 매핑) | 미확인 — 정상 시 0 확인. capacity/429 시 동작 미확인 | Phase 0 잔여 PoC 항목 (§3 갱신 참조) |
| 대화 이어가기 | (없음) | `-c` / `--conversation <ID>` | 우리 cross-validate 는 1회성 호출이라 미사용 |
| sandbox | (없음) | `--sandbox` (터미널 제한) | 도구 권한 가드 후보 — Phase 0 에서 동작 확인 필요 |

### 1.4 박제 범위 (43 파일, grep `-i gemini`)
| 계층 | 파일 수 | 변경 성격 | 릴리스 분류 |
|---|---|---|---|
| **A. 코드 호출부** | 1 | `cross_validate.sh` 의 `run_gemini()` / `check_gemini_capacity()` / `GEMINI_MODEL` 환경변수 / CLI 옵션 (`-m`, `-p`, `--approval-mode plan`) | **MAJOR** (스킬 인터페이스 변경) |
| **B. 테스트** | 7 | `test/cross-validate-*.test.js` 의 mock gemini 바이너리 + sentinel/leak 검증 | A 와 동기화 |
| **C. 스킬·에이전트 행동 박제** | 4 | `SKILL.md`, `architect.md`, `reviewer.md`, `capture-merge.md` 의 절차/조건 | **MINOR** (행동 변경) |
| **D. CI 워크플로** | 1 | `.github/workflows/ci.yml` 의 주석 2건 (`volt #51`, PR #178 참조) | PATCH |
| **E. 문서·회고·CHANGELOG·과거 ADR** | 30 | CLAUDE.md / docs/{lessons,guides,architecture,decisions,plans,report-*,*-REPORT,*.md} / README / CHANGELOG / scripts/verify-lessons-readme.sh | **PATCH** (역사적 인용 — 다수 보존, 일부 교체) |

전체 분류 표는 §5 교체 범위 매핑 참조.

## 2. 목표 / 비목표

### 2.1 목표
1. cross-validate 스킬이 Antigravity 백엔드로 동작 (가능한 경우 headless, 불가 시 대체 워크플로)
2. 사용자 보고 시점 ~ 실제 Gemini 종료일 사이에 **자동화 검증 단절 없음** (마이그레이션 중 cross-validate 가 단 한번도 broken 상태가 되지 않음)
3. Gemini 박제를 **MAJOR 릴리스 1회** 또는 **MINOR 2~3회 Phase 분할** 로 완결, CHANGELOG `### Behavior Changes` 에 다운스트림 영향 명시
4. 새 외부 도구 (Antigravity) 의 인증·CI 환경 변수·할당량·실패 시나리오를 ADR 에 박제

### 2.2 비목표 (스프린트 계약 §6 — CRITICAL #6)
- **Gemini 와 Antigravity 의 응답 품질 비교 (벤치마크)** — cross-validate 의 "단일 모델 편향 노출" 가치는 *두 번째 시각의 존재* 이며 어느 모델이 더 정확한가가 아님. 비교는 별도 후속 이슈
- **다른 외부 검증 모델 (claude-cli, gpt CLI) 동시 채택** — 본 마이그레이션은 1:1 교체로 한정. 다중 백엔드는 별도 ADR
- **cross-validate 스킬의 호출 정책 변경** (어느 박제 직후 호출할지 등) — 현 정책 유지
- **gemini-cli 의 다른 잠재 용도 (대화형 보조, 코드 생성)** — 본 저장소는 cross-validate 외 Gemini 의존 없음을 확인했으므로 대상 없음

## 3. 미확인 사항 → PoC 로 해소 (Phase 0)

**갱신 (2026-05-21 실측 반영)**: 다수 항목 해소. Phase 0 잔여 항목만 남김.

| ID | 질문 | 상태 (2026-05-21) | 결과 |
|---|---|---|---|
| ~~Q-1~~ | headless 호출 가능 여부 | **해소 ✅** | `agy -p "prompt"` 정상 + exit 0. **Phase 1A 확정** |
| ~~Q-2 (부분)~~ | text/exit code | **부분 해소** | 정상 시 stdout 텍스트 + exit 0. **429/rate-limit/timeout 시 동작은 미확인** → Q-2' |
| **Q-2'** | agy 의 capacity 실패 / rate-limit / 인증 만료 시 exit code 와 stderr 포맷 | 실측 PoC (의도적 429 유도 또는 빈 토큰으로 호출) | `cross_validate.sh::check_capacity()` 429 폴백 분기 조건문 결정 |
| **Q-3** | CI 환경에서 비대화식 인증 (서비스 계정, API key, refresh token) 지원 | Antigravity 문서 + GCP IAM 페이지 (사용자 도움 필요 — SPA JS 렌더 차단됨) | CI 통합 가능 여부 (현재 cross-validate 는 로컬 전용이므로 후속 이슈로 분리 가능) |
| ~~Q-4~~ | Gemini 지원 종료 마감일 | **해소 ✅ (사용자 보고 2026-05-21)** | **2026-06-18** (28일 / 4주 여유). 종료 범위 (gemini-cli npm 만? Code Assist 백엔드도?) 는 후속 확인 |
| ~~Q-5~~ | 모델 라인업 | **해소 (다른 의미로) ✅** | `agy --help` 에 `-m` 옵션 없음 → **모델 선택 불가, 백엔드 자동**. `GEMINI_MODEL` 환경변수는 제거 대상 |
| ~~Q-6~~ | Chrome 의존 | **해소 ✅** | 사용자 인증 후 정상 동작 — `local chrome mode! This is WRONG` 은 OAuth 브라우저 호출 단계 경고였음. headless `-p` 모드에선 무관 |
| **Q-7 (신규)** | `--approval-mode plan` 등가 옵션 부재 → 도구 호출/파일 수정 차단 어떻게 강제할 것인가 | (1) `--sandbox` 동작 실측 (2) `agy` 의 도구 권한 모델 (`toolPermission=request-review`) 분석 (3) `--print` 모드는 도구 호출 자체가 차단되는지 확인 | **#479 plan-mode 우회 가드 재설계 필수**. 옵션:<br>- `--sandbox` 가 충분히 안전하면 채택<br>- 부족하면 워킹트리 snapshot diff 만으로 사후 검증 (현 가드의 일부) 강화<br>- 최악의 경우 read-only chroot 또는 별도 워크스페이스 디렉토리 분리 |

### Phase 0 잔여 DoD
- [ ] Q-2' 실측: 인증 만료 / 429 시 agy 의 exit code 와 stderr 포맷
- [ ] Q-7 실측: `agy --sandbox -p "..."` 가 파일 시스템 수정을 차단하는지 + plan-mode 우회 가드 (#479) 의 재설계안 결정
- [ ] (블로킹 아님) Q-3, Q-4 사용자 또는 후속 조사로 해소

## 4. 교체 범위 매핑

### 4.1 계층별 작업 카탈로그

#### A. 코드 호출부 (1 파일, MAJOR)
| 파일 | 변경 항목 | 비고 |
|---|---|---|
| `.claude/skills/cross-validate/scripts/cross_validate.sh` | (1) `command -v gemini` → 새 도구 명령 (2) `GEMINI_MODEL` → 새 환경변수 이름 (예: `ANTIGRAVITY_MODEL`) (3) `run_gemini()` 함수 시그니처 + 호출 옵션 (4) `check_gemini_capacity()` probe 명령 (5) capacity 폴백 시 안내 메시지 (`gemini -p "hello"` → 새 명령) | Phase 1A 인 경우 어댑터로 추상화 (변수 + 함수 이름 통일), Phase 1B 인 경우 스크립트 자체 재작성 |

#### B. 테스트 (7 파일)
| 파일 | 변경 항목 |
|---|---|
| `test/cross-validate-fallback.test.js` | mock gemini 바이너리 → mock antigravity (스크립트 내 변수명 + 헬퍼 함수명) |
| `test/cross-validate-diff-truncation.test.js` | 동일 |
| `test/parse-cross-validate-outcome-boundary.test.js` | outcome JSON 스키마 영향만 — 모델명/도구명 변경이 스키마 깨면 동기화 |
| `test/sentinels-invariance.test.js` | sentinel 문자열에 "Gemini" / "gemini" 포함 시 갱신 |
| `test/package-files-no-test-leak.test.js` | "gemini" 파일명 누수 검사 패턴 → 갱신 |
| `test/doctor-gitflow-drift.test.js` | 간접 (gemini 주석 1건만 인용) |
| `test/verify-docs-links.test.js` | 새 문서 추가 시 링크 검증 |

#### C. 스킬·에이전트 행동 박제 (4 파일, MINOR)
| 파일 | 변경 항목 |
|---|---|
| `.claude/skills/cross-validate/SKILL.md` | (1) skill description (2) 설치 확인 명령 (3) 호출 예제 4종 (structure/code/architecture/skill) (4) `--approval-mode plan` flag 대응 명령 (5) 출력 분석 §0 sanity check 본문 |
| `.claude/agents/architect.md` | "cross-validate 1회" 절차 표현 ("Gemini 교차검증" → "Antigravity 교차검증" 또는 도구중립 "외부 모델 교차검증") |
| `.claude/agents/reviewer.md` | 동일 (선택 절차 안내) |
| `.claude/commands/capture-merge.md` | "Gemini의 마찰 없는 자동화 통찰" — **역사적 인용** 이므로 보존 권고 (변경 시 출처 무효화). 단, 신규 독자 혼동 방지 주석 1줄 추가 가능 |

#### D. CI 워크플로 (1 파일, PATCH)
| 파일 | 변경 항목 |
|---|---|
| `.github/workflows/ci.yml` | 주석 2건 — `volt #51 Gemini 단일화 권고`, `PR #178 Gemini cross-validate 보안 권고`. **역사적 출처** 이므로 원문 보존 + (선택) 신규 도구 적용 주석 1줄 병기 |

#### E. 문서·회고·CHANGELOG·과거 ADR (30 파일, PATCH)
**보존 vs 교체 판정 규칙**:
- **역사적 인용** (volt 이슈 번호 인용, PR 권고 인용, 회고 시점의 실측 기록): **보존**. 사후 교체 시 출처 추적 단절 + drift 위험
- **현재 행동을 안내하는 본문**: **교체** (도구 이름)
- **CHANGELOG**: 기존 엔트리는 **불변**, 신규 엔트리에 마이그레이션 박제

대상 후보 30 파일은 grep 결과로 카탈로그가 잡혀 있으나 (`docs/lessons/`, `docs/guides/`, `docs/architecture/`, `docs/decisions/2026042*`, `docs/report-*`, `docs/*REPORT*`, `CLAUDE.md`, `README.md`, `CHANGELOG.md`, `scripts/verify-lessons-readme.sh`), **개별 판정은 Phase 3 에서 1 PR 1 파일 또는 1 PR N 파일 묶음으로 처리**. 본 기획서에서 일괄 결정하지 않음 — drift 위험 회피.

## 5. Phase 설계

### Phase 0 — PoC 잔여 (필수 선행)
- 산출물: §3 Q-2', Q-7 답변 + (가능하면) Q-3 결정. 이슈 코멘트 또는 ADR §부록 박제
- 소요: 30분 ~ 1시간 (Q-1 해소 후 잔여만)
- **결정 게이트**: Q-7 (plan-mode 우회 가드 재설계) 의 구체 방안 합의

### Phase 1A — 어댑터 교체 (Phase 1B 는 제거 — Q-1 해소로 불필요)
**범위**: 코드 호출부 (A) + 테스트 (B) + 스킬 SKILL.md (C 일부)

**핵심 변경**:
1. `cross_validate.sh` 의 `gemini` → `agy` 교체 — **함수 이름은 도구 중립으로 일반화**
   - `run_gemini` → `run_external_validator`
   - `check_gemini_capacity` → `check_external_capacity`
   - `GEMINI_MODEL` 환경변수 → **제거** (agy 는 모델 옵션 부재). 기본 모델은 Antigravity 백엔드 위임. 호환 alias 는 v1 동안 무시 + WARN
   - 호출: `gemini -m "${GEMINI_MODEL}" -p "${prompt}" --approval-mode plan` → `agy -p "${prompt}" --sandbox` (Q-7 결정에 따라 옵션 조정)
2. capacity probe / fallback / outcome JSON / sentinels 동일 동작 유지
3. **plan-mode 우회 가드 (#479) 재설계** — `--approval-mode plan` 부재로 사전 차단 불가능. 사후 검증 (워킹트리 snapshot diff + 자동 롤백) 만으로 가드 유지 + `--sandbox` 채택 여부에 따라 도구 권한 모델 검증 추가
4. 테스트 mock 동기화 — sentinel 문자열은 도구 중립 ("외부 검증 모델") 로 표현, mock `agy` 바이너리로 대체

**릴리스**: **MAJOR** (스킬 인터페이스 변경 + `GEMINI_MODEL` 환경변수 제거)
- CHANGELOG `### Behavior Changes`:
  - "`cross-validate` 스킬이 `gemini-cli` 대신 `agy` (Antigravity CLI) 호출"
  - "`GEMINI_MODEL` 환경변수 무시. agy 는 모델 선택 옵션 없음 (백엔드 자동)"
  - "**다운스트림 필수 조치**: `agy` 설치 (Antigravity 공식 installer) + OAuth 로그인. `gemini` 명령은 더 이상 호출되지 않음"
  - "plan-mode 우회 가드 (#479) 동작 모델 변경 — 사전 차단 → 사후 snapshot diff 강화. 동일 보호 효과 유지"

**DoD** (Phase 1A 단독):
- [ ] `cross_validate.sh structure` 정상 실행, outcome JSON 9 필드 무손실
- [ ] capacity 폴백 (mock 의도적 실패) 정상 — `claude-only fallback` 메시지 + exit 77
- [ ] sub-agent 매트릭스 (architect / reviewer / qa) cross-validate 호출이 agy 로 동작
- [ ] `verify-agent-ssot.sh` 9 필드 통과
- [ ] plan-mode 우회 가드 negative test (sandbox 우회 시도) 3건 차단 확인
- [ ] 본 PR 머지 직후 사용자가 `harness update` 한 다운스트림 1 곳 (astro-simulator) 에서 cross-validate 1회 실측 성공

### Phase 2 — 행동 박제 동기화 (Phase 1 머지 후)
- 범위: C 계층 잔여 (architect/reviewer/capture-merge) + agents SSoT 9 필드 동기화 + `verify-agent-ssot.sh` 무결성
- 릴리스: **MINOR** (행동 박제 변경)
- DoD:
  - [ ] 5 agents `.md` 의 cross-validate 절차 표현 통일
  - [ ] `scripts/verify-agent-ssot.sh` 무결성 검증
  - [ ] CHANGELOG `### Behavior Changes` 에 "agents 절차 표현 갱신" 명시

### Phase 3 — 문서 batch update
- 범위: E 계층 30 파일 중 "현재 행동 안내" 본문만 (역사적 인용 제외)
- 릴리스: **PATCH** (행동 변화 없음 — `### Behavior Changes: None — 문서/문구만`)
- 분할 가능: CLAUDE.md / docs/lessons / docs/guides / docs/architecture / docs/decisions / docs/report-* 카테고리별 별도 PR 가능

### Phase 4 — Gemini 완전 제거 (옵션, Q-4 결과에 따라)
- 전제: Gemini 가 실제로 종료된 시점 또는 다운스트림 마이그레이션 완료 확인
- 작업: gemini-cli npm uninstall, `~/.gemini/` 정리 안내 (사용자 결정), CI fallback 분기 제거
- 릴리스: **MINOR** (의식적 silent fallback 제거 — guard-design-principles §fail-fast)

**갱신 (2026-05-21)**: Phase 4 **완료** — PR [#283](https://github.com/coseo12/harness-setting/pull/283) (cross_validate.sh GEMINI_* alias 분기 완전 제거 + fail-fast 회귀 가드 신설) + v4.1.0 release ([#286](https://github.com/coseo12/harness-setting/pull/286)) 박제. 원안의 권장 시점 (2026-06-25) 대신 사용자 자동 모드 명시 지시로 2026-05-21 진행. 위험 완화 — v4.0.0 (PR #280) 의 alias WARN 1 릴리스 사전 안내 충분성 reviewer #283 approve.

## 6. 완료 기준 (Sprint Contract)

전체 마이그레이션 종료 시점에 다음을 모두 충족:

1. [ ] `cross_validate.sh` 가 Gemini 호출 없이 Antigravity (또는 결정된 대체) 로 동작
2. [ ] cross-validate 단위/통합 테스트 100% 통과 + sentinel 검증 통과
3. [ ] sub-agent 매트릭스 (architect/reviewer/qa 3 페르소나) 의 cross-validate 호출 1회씩 실측 성공
4. [ ] `verify-agent-ssot.sh` 9 필드 무결성 통과
5. [ ] CHANGELOG `### Behavior Changes` 에 다운스트림 환경변수/명령 호환성 명시
6. [ ] ADR `20260521-gemini-to-antigravity.md` Accepted 상태
7. [ ] 다운스트림 1 곳 (예: astro-simulator) 에서 `harness update` 후 cross-validate 실측 정상

## 7. 리스크

| ID | 리스크 | 영향 | 확률 | 완화 |
|---|---|---|---|---|
| ~~R-1~~ | ~~Antigravity headless 미지원~~ | **해소 ✅ (2026-05-21 실측)** | — | `agy -p` 정상 |
| **R-1'** | `--approval-mode plan` 등가 옵션 부재로 plan-mode 우회 가드 (#479) 재설계 필요 | 중 | 중 | Phase 0 Q-7 에서 sandbox 채택 + 사후 snapshot diff 강화안 결정 |
| R-2 | Gemini 종료 마감일 불명 → 마이그레이션 너무 늦거나 너무 일찍 | 자동화 단절 또는 불필요한 조기 전환 | 중 | 사용자에게 출처 확인 요청 (Q-4). 마감일 미확인 동안 듀얼 지원 유지 검토 |
| R-3 | Antigravity 응답 품질이 Gemini 대비 저하 → 교차검증 가치 감소 | 비목표지만 실측 시 발견될 수 있음 | 저 | Phase 1A 머지 후 1~2주간 outcome JSON 의 "고유 발견" 비율 모니터링. 저하 시 별도 이슈 |
| R-4 | OAuth 인증 흐름이 CI/headless 환경에서 동작 불가 | CI cross-validate 자동화 차단 | 중 | 현재 cross-validate 는 **로컬 전용** (CI 미통합) 이므로 본 기획 직접 영향 없음. CI 통합은 별도 후속 이슈 |
| R-5 | `~/.gemini/` 디렉토리 공유로 Antigravity 가 기존 OAuth 토큰을 오인 사용 → 인증 혼선 | 인증 실패 또는 의도치 않은 계정 전환 | 저 | 로그에 `migrate.go:148` 자동 마이그레이션 확인됨. 별도 대응 불필요하나 PoC 에서 재확인 |
| R-6 | 박제 일괄 교체 시 **역사적 인용** (volt 이슈/PR 권고) 의 출처 추적이 끊김 | 회고/디버깅 시 근거 소실 | 중 | §4.1 E 계층 "보존 vs 교체 판정 규칙" 적용. 역사적 인용은 원문 보존 |
| R-7 | Phase 1A MAJOR 릴리스 후 다운스트림이 `GEMINI_MODEL` 환경변수에 의존하고 있을 가능성 | 다운스트림 빌드 깨짐 | 저 | grep 으로 다운스트림 (astro-simulator, simple-shop 등) 사전 점검 + CHANGELOG `### Behavior Changes` 명시 + 1 릴리스 동안 호환 alias 환경변수 (`GEMINI_MODEL=...` 도 인식) 유지 검토 |
| R-8 | 단일 모델 편향 가드 (CLAUDE.md §교차검증) 의 의의가 도구 교체 중에도 유지된다는 합의 부재 | 옵션 Z (cross-validate 폐지) 가 무의식적으로 선택될 위험 | 저 | ADR 본문에 가드 유지 의의를 명시. 옵션 Z 채택 시 별도 ADR 의무 |

## 8. 롤백 전략

각 Phase 별 독립 롤백:

- **Phase 1A**: 단일 PR revert + gemini-cli 재설치 안내 (다운스트림 README 1줄)
- **Phase 1B (옵션 Y)**: 새 도구 채택 revert + gemini-cli 잔존 시 즉시 복귀
- **Phase 2**: 5 agents `.md` revert (single commit)
- **Phase 3**: 문서 PR 별 독립 revert

전 단계 공통: `~/.gemini/` 와 Antigravity 데이터 디렉토리는 **로컬 사용자 자산** 이므로 코드 롤백이 인증 토큰을 건드리지 않음 (CRITICAL #5 파괴적 작업 사전 경고 해당 없음).

## 9. 일정 / 우선순위

**Gemini CLI 지원 종료**: **2026-06-18** (사용자 보고 2026-05-21 확인) — 본 기획 시점 기준 **28일 (4주) 여유**

| Phase | 우선순위 | 예상 소요 | 목표 머지일 | 데드라인 여유 |
|---|---|---|---|---|
| 0 PoC 잔여 (Q-2', Q-7) | P0 (최우선) | 30분 ~ 1시간 | 2026-05-23 | 26일 |
| 1A 어댑터 교체 (MAJOR) | P0 | 4~6 시간 | **2026-06-04** (목표) / 2026-06-11 (지연 한계) | 14일 / 7일 |
| 2 행동 박제 (MINOR) | P1 | 1~2 시간 | 2026-06-11 | 7일 |
| 3 문서 batch (PATCH) | P2 | 카테고리별 2~3 시간 × N | 2026-06-15 ~ 마감 후 점진 | 3일 / 마감 후 가능 |
| 4 Gemini 제거 (MINOR) | P3 | 1~2 시간 | 2026-06-25 (마감 후 1주, 다운스트림 마이그레이션 완료 확인) | 마감 후 |

**리스크 버퍼**: Phase 1A 목표 머지 2026-06-04 + 다운스트림 (astro-simulator 등) 실측 1주 = 2026-06-11 까지 완전 안정화. 마감 (6/18) 까지 1주 응급 hotfix 여유.

## 10. 참고 자료

- 사용자 보고 OAuth callback URL (인증 token 부분 마스킹) — Phase 0 OAuth 흐름 단서
- `~/.gemini/antigravity-cli/log/cli-20260521_143650.log` — Antigravity CLI 실행 흔적
- `~/.gemini/oauth_creds.json` — 기존 Gemini OAuth (Antigravity 와 공유 가능성)
- [docs/decisions/20260423-ci-fixture-pnpm-workspace.md](../decisions/20260423-ci-fixture-pnpm-workspace.md) — ADR 형식 참고
- CLAUDE.md §교차검증 — 단일 모델 편향 가드의 의의
- CLAUDE.md §릴리스 — Phase 분리 원칙 (backward-compat / 완결 Behavior Change 집합 / 사용자 동의)

## 11. 후속 결정 트리거

본 기획의 어느 가정이 무너지면 ADR 또는 본 기획서 자체를 재검토:

- Antigravity Phase 0 PoC 결과 Q-1 = 불가 → §5 Phase 1B 옵션 재계약 의무
- Gemini 종료 마감일이 **3 일 이내** 로 확인 → Phase 0 와 1 을 동시 진행 + 응급 우회 검토
- Antigravity 가 유료 전환 또는 GCP 결제 강제 → 비용 평가 후 옵션 Y (다른 무료 CLI) 재고
- 다운스트림 1 곳 실측 (Phase 1 DoD #7) 실패 → 머지 후 즉시 hotfix 또는 revert
