# 변경 이력

모든 중요한 변경사항은 이 파일에 기록된다.
Semantic Versioning을 따른다.

## [Unreleased]

### Behavior Changes (R5 mars + phobos + deimos visualization)

- **[#594] R5 화성 + 포보스 + 데이모스 시각화 — Q2=B 2번째 본 인스턴스화 + satellite 2개 첫 본 사례** ([#594](https://github.com/coseo12/astro-simulator/issues/594)) — Roadmap v3 §R5 진입. PM 합의 라운드 1 (2026-05-28): **Q1=B** (mars + phobos + deimos 모두 진입) / Q2/Q3 architect 위임 / **Q4a=A** (shortcut bar 에 mars 만 추가, phobos/deimos 미등록 — 모바일 너비 안전) / **Q5=A** (sunScale 50 보존). ADR: [`20260528-r5-mars-visualization.md`](docs/decisions/20260528-r5-mars-visualization.md) (Accepted, cross-validate 2026-05-28 agy outcome=applied, R4 ADR forensic 변형 8섹션 구조 답습 + satellite 2개 첫 본 사례 SSoT). **박제값 매트릭스**: `marsScale=800` (earth 동일값, radius 53.3% 사실 비율 정확 정합, mars sun 대비 px 비 ~7.81% margin 0.19%) / `phobosScale=5000` (moon Amendment 4 학습 — 사실 비율 0.326% 명시 위배 + 4px fallback billboard 의존) / `deimosScale=5000` (phobos 동일값, mental model "phobos ≈ deimos") / `MARS_SATELLITES_ORBIT_VISUAL_SCALE=500` (phobos 분리 마진 1.69x binding constraint / deimos 4.27x 자동 안전, R4 §결정 6 패턴 답습 + cross-validate 이견 수용 #1 명명 박제 — `MARS_SATELLITES_*` 채택, deimos 포함하므로 `MARS_PHOBOS_*` 보다 정확). **5곳 동시 박제** (R-Phase Allowlist Guard ADR §결정 4 절차 답습): (1) `R_PHASE_BODY_ALLOWLIST` 에 mars/phobos/deimos 추가 (`packages/core/src/scene/r-phase-allowlist.ts`) (2) R5 ADR §결정 7 cross-link (3) `browser-verify-r-phase-allowlist.mjs` expected list 갱신 + URL 직접 진입 매트릭스 4-B 에 mars/phobos/deimos 정상 진입 cell 추가 (4) 본 CHANGELOG `[Unreleased]` `### Behavior Changes` 박제 (5) `verify-core-exports-immutable.sh` 통과 (WASM sub-path 추가 0건). **추가 박제**: `apps/web/src/constants/body-scale.ts` 에 mars/phobos/deimos 3줄 + `apps/web/src/components/layout/focus-quick-buttons.tsx` FOCUS_BUTTONS 에 mars 1줄 (Q4a=A) + `packages/core/src/scene/orbit-visual-scale.ts` 에 `MARS_SATELLITES_ORBIT_VISUAL_SCALE=500` + `ORBIT_VISUAL_SCALE_BY_PARENT.mars` 1줄 + `apps/web/scripts/r1-ui-regression-guard.mjs` `PX_RATIO_THRESHOLDS.mars=8` + `targetIds` 에 mars/phobos/deimos 추가 + `apps/web/scripts/browser-verify-378-focus.mjs` FOCUS_BODIES 에 R4 drift 누적 (earth/moon) + R5 (mars/phobos/deimos) 동시 추가 (R4 baseline 잔존 drift 해소, R5 ADR §위험 #4 박제 정합). **Concrete Prediction 측정**: R4 ADR §Concrete Prediction "R5 추가 시 ≤ 7 라인" 의 본 R5 검증 — 코드 변경 ~8 라인 (BODY_SCALE 3 + R_PHASE_BODY_ALLOWLIST 3 + FOCUS_BUTTONS 1 + ORBIT_VISUAL_SCALE_BY_PARENT 1, +1 라인 over: `ORBIT_VISUAL_SCALE_BY_PARENT.mars` 추가 1줄 사유, R6+ 예상 갱신 박제). **단위 테스트 갱신**: `r-phase-allowlist.test.ts` (length 5→8, mars/phobos/deimos 단언 + isRPhaseFocusable 갱신) / `body-scale.test.ts` (mars/phobos/deimos getBodyScale 단언 3건) / `orbit-visual-scale.test.ts` (MARS_SATELLITES_ORBIT_VISUAL_SCALE = 500 단언 + phobos 1.69x / deimos 4.27x 분리 마진 산출 검증 2건) / `focus-quick-buttons.test.tsx` (mars 활성 + 텍스트 "화성" 단언 + phobos/deimos shortcut 미등록 검증 — Q4a=A 박제). **R6 인계 의무** (R5 ADR §위험 #7 + §위험 #6): R6 jupiter 진입 시 11 버튼 = 392 px > 375 px overflow → horizontal scroll / 2단 grid 재트리거 + ORBIT_VISUAL_SCALE_BY_PARENT.jupiter 신규 / satellite 별 fine-tuning 필요 시 `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 신규 룩업 도입 (Amendment 1 가능). **Amendment 라운드 N≥1 예상** (D-T2 사용자 검증 결과로). 비-범위: mars 표면 visual / phobos irregular shape / mars 이심율 시각 강조 / shortcut bar 모바일 너비 재조정 (R6 trigger) / 실측 데이터 변경 / LOD 시스템 변경 / R6+ body 진입.

## [0.18.0] — 2026-05-27

### 요약

R4 (지구+달) visualization 완주 + a11y baseline 도입 + Z 패턴 ADR Amendment 7~12 누적 + R1~R3 후속 NO-OP 일괄 정리. 46 커밋 누적 — 마지막 릴리스 v0.17.0 (2026-05-20) 이후 7일. 상세 entry 22건은 아래 sub-section 참조.

**카테고리별 머지 매핑**:

- **R4 (지구+달) 사이클**: `#532` / `#534` / `#539` / `#546` — R4 ADR forensic 변형 승격 + Amendment 4 까지 누적, Q2=B SSoT 첫 본 인스턴스화 (PR #533/#537/#540/#543/#545/#547/#548/#549)
- **a11y baseline + WCAG 2.2 AA**: `#535` / `#551` / `#552` / `#564` — 자동 측정 가드 + 격차 3건 통합 fix + target-size 전 영역 정합 (PR #551/#560/#561/#567)
- **저사양 모바일 FPS 가드**: `#536` (PR #553)
- **Visual Fidelity 원칙 명문화**: `#541` — `docs/architecture/principles.md` §1 (PR #550)
- **Z 패턴 ADR Amendment 7~12**: `#554` / `#556` / `#557` / `#569` / `#572` / `#574` / `#577` / `#578` / `#581` — 측정 식 자기참조 인플레이션 정정 + Phase 1 드리프트 가시화 + 경고 피로감 가드 (N=10 soft-warn) + [TODO] → upstream PR URL 자동 해소 + Phase 3 sidecar 라이프사이클 자동화 + PR title 컨벤션 의무 + TODO Aging Guard (시간 누적 차원) + .prettierignore 교차 검증 가드 거부 박제 + cross-repo false-positive 차단 (PR #555/#570/#571/#575/#576/#579/#580/#582/#583/#585/#586/#587/#588/#589/#590/#591)
- **R4 후속 docs 정리**: `#563` / `#565` / `#566` — principles.md cross-link + dead reference 정정 + ADR 전이 (PR #584)
- **NO-OP 결정 박제**: `#446` / `#445` / `#447` / `#438` / `#376` / `#353` / `#352` / `#383` — Camera 리팩토링 2건 + UX polishing 3건 + R1 메타 가드 자동화 2건 + verify-visual-proportion (PR #524/#527/#529/#530)
- **인프라**: harness v3.6.0 → v4.2.5 Antigravity 마이그레이션 (PR #544), Glossary + ADR Status workflow + 시각 자료 embed 표준 (`#449`/`#370`/`#382` PR #520)
- **기타**: iOS Safari 17.4+ Yoshida4 bench 가이드 (`#219` PR #531), lint 부채 정리 (`#386`/`#434`/`#435` PR #521), URL R-Phase 가드 자동 제거 옵션 A (`#418` PR #525), LodBodyInfo dev overlay 컬럼 (`#393` PR #528), R3 venus 명시 단언 보강 (`#416` PR #522), R1 ADR Amendment v3 모바일 점유율 박제값 정정 (`#427` PR #526), 폐기 코드 정리 (`#405` PR #523), r1-guard baseline Linux CI 전환 (`#337` PR #562/#568), CLAUDE.md Z 패턴 TL;DR 3단계 카드 (`#559` PR #588), adr-z-pattern-health-v2 CI exit code 계약 SSoT (`#558` PR #587)

### Behavior Changes (Amendment 10 cross-repo false-positive 차단)

- **[#581] Amendment 10 §결정점 2 정정 — `extractIssueRefsFromTitle()` 단순 `#N` → `[#N]` brackets 필수 (cross-repo false-positive 차단)** ([#581](https://github.com/coseo12/astro-simulator/issues/581)) — PR #580 (Amendment 10) reviewer 단계 cross-repo false-positive 실측 발견 후속. **PR #254 (`volt #114` 인용) → astro-simulator #114 단순 `#N` 오탐 1건 확인** → 옵션 A 채택 (`[#N]` brackets 필수, #574 옵션 C / #578 옵션 B 패턴 답습). **수정**: `scripts/verify-z-pattern-health.mjs` `extractIssueRefsFromTitle()` 패턴 3 정정 — `(?:^|[^\\w/])#(\\d+)\\b` → `\\[#(\\d+)\\]` brackets 필수. 본 프로젝트 PR title 컨벤션 (`feat(scope): [#N] description`) 표준 답습으로 false-positive 회피. **self-test 확장**: 기존 6 cases (extractIssueRefs) + 5 cases 추가 (cross-repo volt #114 skip / 단순 #N skip / PR squash merge suffix `(#583)` skip / upstream 자기 ref skip / brackets 정합 매칭 정상) → 총 **22 PASS, 0 failed**. 1 case 갱신 (`multi` — brackets 강제 정합). **baseline 재실측**: 다운스트림 [TODO] 잔존 8 파일 → upstream merged PR 매칭 3건 (`.claude/agents/architect.md` / `.claude/agents/pm.md` / `CLAUDE.md` → upstream PR #260). 정정 전 매칭 (PR #254 `volt #114` 오탐) 제거 정합. **회귀 0 확인**: `verify-z-pattern-health.mjs` [ADR OK] 모든 임계값 미발화 / Phase 1=8 / Phase 2=4 / 진행률 50% / `verifyPhase2Sync` 동일 출력. **ADR §Amendment 10 §결정점 2 정정 박제**: 단순 `#N` → `[#N]` brackets 필수 + 옵션 A 한계 명시 (cross-repo issue number 우연 충돌 잔존, 옵션 B/C 후속 분리 가치 박제 — low). **한계 박제**: `[#252]` 형식 cross-repo issue number 우연 충돌 (upstream harness-setting #252 ↔ astro-simulator #252) 잔존 — `--dry-run` 기본 + `--apply` 분리 안전망으로 file write 위험 0, 후속 분리 우선순위 low. **agy cross-validate 비대상** — reviewer 실측 발견 가드 정정만 (기존 SSoT 보존, 신규 결정 박제 아님). 비-범위: 옵션 B (PR body 분석) ❌ / 옵션 C (다운스트림 OPEN 이슈 state 조회) ❌ — 본 PR 비-범위, 후속 분리 가치 보존.

### Behavior Changes (Amendment 12 자동화 — `--mode=todo-aging`)

- **[#577] ADR 20260515 Amendment 12 자동화 구현 — `--mode=todo-aging` + CI workflow + ADR §결정점 3 정정** ([#577](https://github.com/coseo12/astro-simulator/issues/577)) — PR #585 (Amendment 12 Provisional ADR 박제) 후속 developer 사이클. **자동화 구현**: `scripts/verify-harness-drift-decorator.mjs` 에 `--mode=todo-aging` 분기 추가 (~+130 라인) — `findTodoLines()` / `getBlameForLine()` (porcelain 형식 파싱) / `isHarnessManagedCommit()` (`chore(harness):` prefix 매칭) / `runTodoAging()` (blameFn 주입 가능, 테스트 격리) 헬퍼 + `mainTodoAging()` (soft-warn stdout 마커 `[TODO Aging Trigger]`). 임계값 SSoT: `TODO_AGING_THRESHOLD_DAYS = 30`. **CI workflow 통합** (`.github/workflows/adr-z-pattern-health-v2.yml`): step 2개 추가 (`Verify TODO Aging Threshold` + `Create [TODO Aging Trigger] issue`, ~+75 라인). 월 cron 시점 stdout 마커 grep 감지 시 자동 이슈 생성 (중복 방지 `gh issue list --search`, priority:medium). **self-test 확장**: 기존 36 cases 회귀 0 + Amendment 12 boundary 8 cases 추가 (positive 29일 / negative 31일 / boundary 30일 정확 / harness-managed 제외 90일 / `isHarnessManagedCommit` 단위 4) → 총 **44 PASS, 0 failed**. mock `blameFn` 주입 패턴으로 git 의존성 격리 (CLAUDE.md §가드 도입 PR DoD §(2) 3중 시뮬레이션 정합). **현재 develop tip 실측** (`--mode=todo-aging`, develop tip ff24995): violations 0 / harness-managed 제외 0 / skipped 0 — 6 drift 파일 모두 [TODO] 박제 후 1일 경과 (#571 Amendment 8 일괄 박제, baseline buffer 29일 여유). **ADR §결정점 3 정정** (architect 가정 오류 → developer 단계 실측 정정): `.harness/manifest.json` 의 `apply.*` 키 매트릭스 매칭 가정 오류 (실제 manifest 키 `harnessVersion`/`installedAt`/`files` 만 존재) → commit message prefix `chore(harness):` 매칭으로 정정. ADR §결정점 3 본문 + §baseline 실측 표 동시 갱신 (baseline 표는 architect 단계 "파일 첫 박제 시점" → developer 단계 "[TODO] 라인 git blame 시점" 정합 — §결정점 6 §정의 정합, CLAUDE.md §스프린트 계약 #10 답습). **회귀 0 확인**: 4 모드 모두 정상 (verify drift 6 / PASS 6 / FAIL 0 / orphans 0 / count-warn drift 6 < N=10 / sidecar-cleanup orphan 0 / todo-aging violations 0). `verify-agent-ssot.sh` 회귀 0 (script + workflow + ADR 변경만, 5 페르소나 .md 변경 없음). **silent 가드 비대칭 의도적** (Amendment 8/9/10/11 답습): 데코레이터 누락 = fail-fast / drift 카운트 = soft-warn / TODO 해소 = soft-warn + opt-in 자동화 / sidecar = fail-fast (verify) + opt-in 자동화 / **TODO Aging = soft-warn** (시점 차이 — 30일 경과 시점엔 upstream PR 미제출 또는 망각 상태, hard-block 불가). **§재검토 조건 #5 > #6 > #7 우선순위 박제** (자동 이슈 본문에 동시 발화 시 분기 의무 명시). **D8 메타 측정 자기 적용 안정성**: 본 가드 도입 PR 자체 baseline=1일 (모든 [TODO] 라인 동일 commit) → 30일 임계 위반 0 → 자기 모순 회피 PASS (회귀 가드 4축 §4 정합). **후속 분리 영역**: Amendment 12 Provisional → Accepted 전이 (CLAUDE.md §ADR Status 워크플로 §전이 절차 답습, #566 PR #584 머지 사례) — 별도 후속 PR. 비-범위: ADR §결정 본문 / Amendment 8 데코레이터 형식 / Amendment 9 N=10 임계 / Amendment 10 매칭 휴리스틱 / Amendment 11 sidecar 라이프사이클 / Y-회귀 doctor mute (#573 upstream 영역) / Prettier 정합성 (#578) / agy CLI 헬퍼 (cross-validate 고유 발견 2, 사용자 결정 분기) 모두 변경 ❌.

### Notes (행동 변경 없음 — 문서·주석 정합성 정리)

- **[#578] agy 권고 drift ↔ .prettierignore 교차 검증 가드 — 거부 근거 박제 (baseline 실측 후 ROI 검증 실패)** ([#578](https://github.com/coseo12/astro-simulator/issues/578)) — PR #569 (Amendment 10) cross-validate agy 고유 발견 #3 후속 분리. **baseline 실측 (develop tip, 2026-05-27)**: 6 drift 파일 ↔ `.prettierignore` 교차 검증 — 1건 누락 (`docs/phases/roadmap-v3-incremental.md`), 5건 정합 포함. **누락 원인**: CLAUDE.md "프로젝트 고유 보강 교훈" §"prettier 컨벤션 충돌" §예외 경로 SSoT (`docs/phases/**` 등) 정합 의도적 제외 — `sync-prettierignore.mjs` 가 화이트리스트 적용. **결정: agy 제안 가드 거부** (옵션 B — ADR 거부 근거 박제만, #574 옵션 C 패턴 답습). 근거: agy 가드 도입 시 1건 즉시 false-positive (예외 경로 SSoT 충돌) + 기존 가드 (`sync-prettierignore.mjs --check` + `prettierignore-drift.yml`) 가 동일 영역 중복 검증 + 운영 부담 +1 ROI 검증 실패. **ADR `20260419-prettier-harness-conflict.md` §"drift 파일 ↔ .prettierignore 교차 검증 가드 (#578 거부 근거 박제)" 신규 §섹션 추가**. **미래 재검토 트리거 (옵션 A 승격 경로 보존)**: 예외 경로 외 drift leak 발생 / CLAUDE.md 예외 경로 SSoT 폐기 / agy 가드 + 화이트리스트 통합 신규 설계. cross-validate 비대상 — 가드 거부 결정만 (행동 변화 0, 기존 SSoT 보존). 비-범위: agy 가드 도입 (옵션 A) / 화이트리스트 매니페스트 신규 / 예외 경로 SSoT 변경 / `sync-prettierignore.mjs` 변경 / CI workflow 변경 / ADR §결정 본문 변경 모두 변경 ❌.

- **[#574] Amendment 7 §단점 — PR title 컨벤션 의무 박제 (옵션 C 채택, 가드 신규 보류)** ([#574](https://github.com/coseo12/astro-simulator/issues/574)) — PR #555 Amendment 7 cross-validate agy 후속 분리. **옵션 비교** (A/B/C):  (A) Semantic PRs Linter CI 통합 — 외부 service 의존, (B) `verify-pr-title-convention.mjs` 신규 가드 — ROI marginal (위반 빈도 0), (C) ADR §단점 영역 컨벤션 박제만 — **운영 비용 0** + 미래 위반 시 옵션 B 승격 경로 보존. **결정: 옵션 C** 채택 — measurement-first 원칙 (volt #51) + Amendment 2 silent 약화 답습 + 1인 운영 부담 회피. **ADR `20260515-harness-managed-divergent-pattern.md` §Amendment 7 §트레이드오프 §단점 영역 갱신** — PR title 정합 regex 3 패턴 SSoT 박제 (`Amendment N` / `hotfix` / `release vX.Y.Z`, `isAdrEvolutionPr()` 정합) + 3축 옵션 비교 표 박제. **미래 1+ 위반 발생 시 옵션 B 승격 후속 이슈 분리 의무**. 현재 위반 빈도 0 (Amendment 7 정정 후 baseline 정상 유지). 비-범위: ADR §결정 본문 / Amendment 1~12 SSoT / 측정 식 (Amendment 7 보존) / Semantic PRs Linter 도입 / `verify-pr-title-convention.mjs` 신규 / CI workflow 신규 모두 변경 ❌. cross-validate 비대상 — 컨벤션 박제만 (옵션 C 결정값 자체는 신규지만 가드 행동 변화 0, agy 권고 답습으로 신규 결정 도입 아님).

- **[#559] Z 패턴 TL;DR 3단계 카드 + markdownlint 정합성 사전 박제** ([#559](https://github.com/coseo12/astro-simulator/issues/559)) — PR #555 (ADR 20260515 Amendment 7) 박제 직후 agy cross-validate 고유 발견 #4 후속 분리 (cross-validate 발견 6 + 7 통합 박제). **CLAUDE.md `### Z 패턴 TL;DR (3단계 카드)` 신설** ("매니페스트 최신 ≠ 파일 적용 완료" 직후): Phase 1 (선반영, 데코레이터 의무 Amendment 8) → Phase 2 (upstream PR 동시 제출, cross-link 박제) → Phase 3 (`harness update --apply-all-safe` 자동 동기화 + Amendment 10 [TODO] 해소 + Amendment 11 sidecar 정리) — silent 회귀 가드 5단 (Amendment 8/9/10/11/12) 인용. 신규 개발자 온보딩 인지 부하 완화 (agy cross-validate 발견 6 답습). **ADR `20260419-prettier-harness-conflict.md` 에 §"markdownlint 등 정적 검사 도구 충돌 가능성" 신규 §섹션 박제** (사전 가드, 본 프로젝트 markdownlint 미도입 — 미래 도입 시점 SSoT): 경계 위험 가설 (harness-managed `.md` 의 markdownlint local fix → sha256 drift) + 4 예방 가드 박제 (`.markdownlintignore` 매니페스트 동기화 + CI drift 가드 + 운영 의무 + 데코레이터 의무). prettier 경계 drift (volt #35) 답습 패턴 정합. **본 PR 자체는 markdownlint 미도입** — 미래 도입 시점 본 §섹션 참조 의무. 비-범위: markdownlint 실제 도입 / `.markdownlint.json` config / `.markdownlintignore` 신설 / CI workflow 신설 / ADR §결정 본문 변경 / Amendment 1~12 SSoT 변경 ❌ 모두 변경 0. cross-validate 비대상 — 신규 결정 박제 아님 (사전 가드 박제만, CLAUDE.md §교차검증 §"박제 직후 1회 루틴" 트리거 조건 미충족).

- **[#558] adr-z-pattern-health-v2 CI exit code 계약 SSoT 박제 — block vs warn 동작 명시** ([#558](https://github.com/coseo12/astro-simulator/issues/558)) — PR #555 (ADR 20260515 Amendment 7) 박제 직후 agy cross-validate 고유 발견 #3 후속 분리. **현재 운영 사실 (옵션 A — soft-warn) 박제만** (행동 변화 0). **ADR §결과·재검토 조건 §측정 지표 다음에 §"CI exit code 계약 (workflow 동작 SSoT)" 신규 §섹션 추가**: 가드 스크립트 exit 0/1/2 → workflow 동작 매핑 3행 표 박제 (exit 0 = PASS / exit 1 = 자동 이슈 생성 + workflow exit 0 = PASS soft-warn / exit 2 = workflow exit 1 = FAIL hard-block). 옵션 A 채택 근거: 운영 사실 답습 + Amendment 2 silent 가드 약화 SSoT 정합 + Amendment 1 점진적 진화 정합 + Amendment 8/9/10/11/12 비대칭 의도적 SSoT 정합. Hybrid (옵션 C, 90일 hard-block) 거부 — Amendment 11 §교차검증 §기각한 외부 모델 제안 (agy 60일 hard-block) 답습 거부. **Hard-block 예외**: exit 2 (실행 에러) 는 가드 자체 작동 보장 차원으로 hard-block 유지 (Amendment 8 §결정점 3a 정합). **Amendment 9/10/11/12 발화 마커 일관성 박제** (6 마커 SSoT — `[ADR Trigger]` / `[Alert Fatigue Trigger]` / `[Phase 2 Sync Required]` / `[TODO Resolution Suggested]` / `[Sidecar Cleanup — Dry Run/Apply]` / `[TODO Aging Trigger]`). **`.github/workflows/adr-z-pattern-health-v2.yml` 상단 주석 보강**: exit code 매핑 SSoT 박제 + soft-warn 옵션 A 채택 근거 + hard-block 예외 명시. **cross-validate 비대상** — 본 박제는 ADR §결정 본문 / 신규 결정 박제 / 행동 변화 모두 없음 (운영 사실 명시화만), CLAUDE.md §교차검증 §"박제 직후 1회 루틴" 트리거 조건 (정책·설계·결정 신규 박제) 미충족. 비-범위: ADR §결정 본문 변경 ❌ / 측정 식 (Amendment 7 보존) / 다른 §재검토 조건 / N 임계 / 90일 임계 / exit code 정의 자체 변경 (운영 사실 답습만) / workflow step 동작 변경 (주석 보강만, 동작 변경 0) 모두 변경 ❌.

- **[#563 / #565 / #566] R4 후속 docs 정리 일괄 — principles.md §1 cross-link + dead reference 정정 + ADR Provisional→Accepted 전이** ([#563](https://github.com/coseo12/astro-simulator/issues/563) / [#565](https://github.com/coseo12/astro-simulator/issues/565) / [#566](https://github.com/coseo12/astro-simulator/issues/566)) — PR #561 (#552 머지) 후 잔존 docs 정합성 격차 3건 묶음 처리 (행동 변화 0). **#563**: `docs/architecture/principles.md` §1 Visual Fidelity 적용 사례 표에 #552 행 추가 — `R4 후속 (a11y) / 20260525-552-a11y-baseline-fix.md §결정 3 / moon orbit color (RGB) / MOON_ORBIT_COLOR_DEFAULT = Color3(0.30, 0.35, 0.50) / WCAG 1.4.11 2.32:1 → 3.06:1 / §의무 체크리스트 4항목 첫 본 인스턴스화` 형식. PR #560 cross-validate agy 고유 발견 (architect 단계) — `#552 ADR scope 외, principles.md SSoT 권한 침범 회피` 분리 결정 답습. **#565**: `packages/core/src/scene/solar-system-scene.ts:474` 주석 dead reference 정정 — 옛 RGB `Color3(0.25, 0.28, 0.4)` → 신 SSoT `MOON_ORBIT_COLOR_DEFAULT` 변수명 + 신 RGB `Color3(0.30, 0.35, 0.50)` + `#552 a11y 갱신 — WCAG 1.4.11 3.06:1 PASS` 명시. line 513 의 일반 궤도선 (`orbitLines.color = new Color3(0.25, 0.28, 0.4)`) 은 **의도된 잔존** 박제 (moon orbit 외 모든 body, #552 fix 비대상) — 주석 2줄 추가 (volt #69 숨은 상수 변형 dead reference 차단 패턴). **#566**: `docs/decisions/20260525-552-a11y-baseline-fix.md` 메타데이터 `상태: Provisional ... → 상태: Accepted (cross-validate 2026-05-25)` 전이 — CLAUDE.md §"ADR Status 워크플로 (Provisional → Accepted, 부분 도입 — #370 옵션 C)" §전이 절차 정합. §교차검증 반영 사항 4축 분류 (합의 / 이견 수용 / Claude 재분석 기각 / 고유 발견 후속 분리) 본문 보존. 박제값 보존 — `MOON_ORBIT_COLOR_DEFAULT` / `MOON_ORBIT_COLOR_EARTH_FOCUS` / 일반 궤도선 `Color3(0.25, 0.28, 0.4)` / ADR §결정 본문 / principles.md §의무 체크리스트 4항목 SSoT (#541) 모두 무수정. 비-범위: #552 ADR §결정 본문 변경 ❌ / moon orbit 색상 값 재변경 ❌ / 다른 ADR 의 Status 전이 (#566 비-범위에 박제 — 별도 후속 이슈 분리) / principles.md §의무 체크리스트 4항목 SSoT 변경 (#541 SSoT 권한 보존) ❌ / R4 §결정 5 / focus-quick-buttons / shortcut bar 레이아웃 ❌. 코드 변경 합계 **3 파일 (principles.md +1행 / solar-system-scene.ts 주석 3줄 갱신 / ADR 메타데이터 1줄)** — 행동 변화 0, 문서·주석 정합성 강화.

### Behavior Changes

- **[#577] ADR 20260515 Amendment 12 (Provisional) — TODO Aging Guard (시간 누적 차원, cross-validate agy 고유 발견 #2 후속)** ([#577](https://github.com/coseo12/astro-simulator/issues/577)) — Amendment 10 PR #580 cross-validate agy Antigravity (2026-05-26) 고유 발견 #2 후속 분리. Amendment 10 §단점 "사후 커밋 1회 의무 leak" + 영구 망각 위험 차단 — 다운스트림 [TODO] 박제 후 upstream PR 영영 미제출 시 silent leak 차단 가드 박제 (시간 누적 차원, Amendment 9/10/11 차원 직교). **baseline 실측** (develop tip ff24995, 2026-05-26): [TODO] 잔존 4 파일 git blame 시점 — harness-guards.yml (31일, harness-managed) / verify-z-pattern-health.mjs (9일, Phase 1) / verify-harness-drift-decorator.mjs (당일) / resolve-harness-drift-todo.mjs (당일). agy 원안 7일 임계 검증 결과 즉시 1건 위반 (verify-z-pattern-health 9일) — measurement-first 원칙 (CLAUDE.md §"가드 설계 원칙" + §스프린트 계약 #10) 정정 후 30일 채택 (baseline 위반 0 + buffer 21일 + Amendment 2 ~1 sprint 정합). **결정점 1 — 시점 추적**: git blame 채택 (메타파일 거부 — 단일 SSoT + 운영 부담 0). **결정점 2 — 임계 기간**: 30일 (`TODO_AGING_THRESHOLD_DAYS = 30`) — 7/14/60/90일 후보 비교 후 채택. **결정점 3 — harness-managed 카테고리 분리**: `.harness/manifest.json` 매트릭스 매칭 → harness-managed (upstream 영역, #573 직교) 제외. **결정점 4 — 발화 형태**: soft-warn (`[TODO Aging Trigger]` 자동 이슈, Amendment 9/10 답습) — hard-fail 거부 (1인 운영 부담 폭증 회피, Amendment 11 §교차검증 §기각 agy 60일 hard-block 에스컬레이션 답습). **결정점 5 — 통합 위치**: `verify-harness-drift-decorator.mjs` 통합 (`--mode=todo-aging` 신규, 단일 스크립트 SSoT). **결정점 6 — git blame 시점 정의**: [TODO] 라인 최초 commit 시점 (라인 수정 시 갱신, Amendment 10 URL 교체 발생 시 자연 해소). **silent 가드 비대칭 의도적** (Amendment 8/9/10/11 답습 + 본 Amendment 12 확장): 데코레이터 누락 (Amendment 8) = fail-fast / drift 카운트 (Amendment 9) = soft-warn / TODO 해소 (Amendment 10) = soft-warn + opt-in 자동화 / sidecar 라이프사이클 (Amendment 11) = fail-fast + opt-in 자동화 / **TODO Aging (Amendment 12) = soft-warn** (사후 행동 + 시점 차이 — 30일 경과 시점엔 upstream PR 미제출 또는 망각). **CLI 모드 분기 SSoT 확장**: 기존 `--mode=verify` (Amendment 8) / `--mode=count-warn` (Amendment 9) / `--mode=sidecar-cleanup` (Amendment 11) + 신규 **`--mode=todo-aging`** (Amendment 12) — 4 모드 분기. **§재검토 조건 #7 신설** — 시간/누적 차원 (#5 Phase 2 진행률) + drift 파일 수 차원 (#6 Amendment 9) + **TODO 시간 누적 차원 (#7 본 Amendment 12)** 직교 박제. 동시 발화 시 우선순위 명시 (#5 > #6 > #7). **본 PR은 ADR Amendment 박제 + cross-validate만 — 자동화 스크립트 구현은 별도 후속 developer 사이클**. ADR Status **Provisional** (cross-validate 결과 본문 통합 후 별도 후속 이슈로 Accepted 전이 — CLAUDE.md §"ADR Status 워크플로" §전이 절차 답습, #566 PR #584 머지 사례 참조). 비-범위: ADR §결정 본문 변경 ❌ / Amendment 8 데코레이터 형식 ❌ / Amendment 9 N=10 임계 ❌ / Amendment 10 매칭 휴리스틱 ❌ / Amendment 11 sidecar-cleanup 모드 ❌ / 자동화 스크립트 구현 (별도 developer 사이클) / Y-회귀 doctor mute (#573, upstream 영역) / Prettier 정합성 (#578) / Upstream PR 데코레이터 오염 방지 (#581) 모두 변경 ❌.

- **[#572] ADR 20260515 Amendment 11 — Phase 3 sidecar 라이프사이클 자동화 (cross-validate agy 고유 발견 #1 후속)** ([#572](https://github.com/coseo12/astro-simulator/issues/572)) — Amendment 9 PR #575 cross-validate agy Antigravity (2026-05-26) 고유 발견 #1 후속 분리. agy §6 §누락 요소 1 "사후 라이프사이클 단계가 모호합니다" 영구 박제 해소 — Phase 3 (`harness update --apply-all-safe`) 가 drift 해소 시 sidecar (`<filename>.HARNESS-DRIFT.md`) 자동 정리 자동화 박제. **자동화 방식 (ADR §결정점 1)**: 기존 `scripts/verify-harness-drift-decorator.mjs` 의 `parseMode()` 헬퍼에 `sidecar-cleanup` 옵션 추가 — Amendment 9 (`count-warn`) / Amendment 10 (단일 스크립트 통합) 패턴 답습. 신규 별도 스크립트 거부 (운영 부담 2배). **감지 휴리스틱 (ADR §결정점 2)**: 기존 `detectOrphanSidecars()` (라인 175~217) 재사용 — 검사 1 (`base file missing`) + 검사 2 (`base file not in drift state (Phase 3 cleanup needed)`) 결합 박제. 휴리스틱 SSoT 단일화 (`verify` 모드 / `sidecar-cleanup` 모드 양쪽 동일 헬퍼 호출, 코드 중복 0). **발화 형태 (ADR §결정점 3 옵션 C — Amendment 10 패턴 답습)**: `--dry-run` 기본 (목록 출력만, 파일 잔존) + `--apply` 명시 시 실제 file unlink. 자동 즉시 삭제 (옵션 A) 거부 (회수 불가). soft-warn 자동 코멘트 (옵션 B) 거부 (sidecar 라이프사이클은 PR 자동 코멘트보다 로컬 사전 정리 효율적). **silent 가드 방향 (ADR §결정점 4 비대칭 이중 박제)**: `verify` 모드 fail-fast 보존 (Amendment 8 silent leak 차단) + `sidecar-cleanup` 모드 opt-in 자동화 (사용자 시점 정리). Amendment 8/9/10/11 비대칭 SSoT 통합표 박제 (ADR §결정점 4 표). **CLI 시그니처**: `node scripts/verify-harness-drift-decorator.mjs --mode=sidecar-cleanup [--apply]` — 3 모드 (verify 기본 / count-warn / sidecar-cleanup) 분기. stdout 마커 SSoT: `[Sidecar Cleanup — Dry Run]` (dry-run) / `[Sidecar Cleanup — Apply]` (apply). **self-test 확장**: 기존 29 cases (regex 13 / format 7 / sim 5 / count-warn 4) 회귀 0 + Amendment 11 boundary 4 cases 추가 → 총 **36 PASS, 0 failed** (positive 0 / dry-run 2 / apply→recovery 2 / drift 안전 거부 1, ADR §회귀 가드 4축 §(2) 3중 시뮬레이션 정합). **현재 develop tip 실측** (develop tip 39cff53): sidecar 0 / orphan 0 — Amendment 8 sidecar 자체 부재 (적용 빈도 < 5건 박제값 정합). 본 가드 도입 시점 즉시 적용 가능한 cleanup 대상 0건, 미래 sidecar 추가 시점부터 가드 작동. **`--apply` 안전 장치**: `detectOrphanSidecars()` 가 식별한 orphan 만 삭제 — 정상 sidecar (drift 상태 base file 동반) 는 절대 삭제 대상 아님. self-test case 4 (`alive.json.HARNESS-DRIFT.md` 안전 거부) 가 회귀 가드. **CI workflow 변경 0건** (ADR §Concrete Prediction SSoT 정합) — sidecar-cleanup 는 opt-in CLI 모드 (사용자 명시 호출만), `verify` 모드 fail-fast 동작 기존 workflow 정합 유지. ADR §결정점 3 §옵션 B (soft-warn 라벨 + 자동 코멘트) 명시적 거부 박제값 보존. **회귀 0 확인**: `--mode=verify` 라이브 (drift 6 / PASS 6 / orphan 0 / exit 0) + `--mode=count-warn` 라이브 (drift 6 < N=10 / exit 0) + 신규 `--mode=sidecar-cleanup` 라이브 (no orphan sidecars / exit 0). `verify-agent-ssot.sh` 회귀 0 (script + CHANGELOG 변경만, 5 페르소나 .md 변경 없음). **silent 가드 비대칭 의도적** (Amendment 8/9/10 답습): 데코레이터 누락 = fail-fast / drift 카운트 초과 = soft-warn / TODO 해소 매칭 = soft-warn + opt-in 자동화 / sidecar 라이프사이클 = fail-fast (verify) + opt-in 자동화 (sidecar-cleanup) 이중 박제. **D8 메타 측정 자기 적용 안정성**: `verify-harness-drift-decorator.mjs` 자체에도 `// HARNESS-DRIFT: Z-PATTERN [TODO]` 데코레이터 박제 보존 (Phase 1 도입 PR 정합). 비-범위: ADR §결정 본문 변경 ❌ / 측정 식 (Amendment 7 보존) / 데코레이터 형식 (Amendment 8 보존) / N=10 임계 (Amendment 9 보존) / [TODO] 매칭 휴리스틱 (Amendment 10 보존) / TODO Aging Guard (#577 영역) / Prettier 정합성 (#578 영역) / Y-회귀 doctor mute (#573, upstream 영역) / agy 고유 발견 후속 분리 (#581 Upstream PR 데코레이터 오염 방지, low #6 누락 요소 2 / 3) 모두 변경 ❌.

- **[#569] ADR 20260515 Amendment 10 — [TODO] → upstream PR URL 자동 해소 (cross-validate agy 고유 발견 #1 후속)** ([#569](https://github.com/coseo12/astro-simulator/issues/569)) — Amendment 8 PR #570 cross-validate agy Antigravity (2026-05-26) 고유 발견 #1 후속 분리. Amendment 8 §단점 "TODO → URL 교체 누락" systemic leak 차단 자동화 박제 (silent 가드 강화 방향, Amendment 2/6 약화와 비대칭 일관). **자동화 방식**: 기존 `scripts/verify-z-pattern-health.mjs` 의 `verifyPhase2Sync()` 확장 (`includeTodoResolution` 옵션 추가, +~120 라인) — upstream merged PR (coseo12/harness-setting, "ADR 20260515" 검색) 의 title issue ref 추출 + 변경 파일 경로 매칭 + 다운스트림 [TODO] 잔존 파일과 AND 결합. **매칭 휴리스틱** (ADR §결정점 2 후보 다): (a) upstream PR title 에 본 프로젝트 이슈 ref (`#N` / `astro-simulator#N` / `coseo12/astro-simulator#N` 3 패턴 SSoT) AND (b) upstream PR 변경 파일 경로 = 다운스트림 [TODO] 잔존 파일 — 둘 다 충족 시 매칭 (precision ↑, false-positive 회피). **신규 wrapper CLI**: `scripts/resolve-harness-drift-todo.mjs` (~270 라인) — `--dry-run` (기본 안전, file write 없음, 매칭 N≥1 → exit 1 soft-warn) / `--apply` (실제 갱신, file write) / `--file=<path>` (특정 파일만) / `--self-test` (인라인 17 cases) 모드 분기. **CI workflow 통합**: `.github/workflows/adr-z-pattern-health-v2.yml` 에 step 2개 추가 (`Detect [TODO] resolution candidates` + `Create [TODO Resolution Suggested] issue`) — 월 cron 시점 stdout `[TODO Resolution Suggested]` 마커 grep 감지 시 자동 이슈 생성 (중복 방지 `gh issue list --search`). **현재 develop tip 실측** (--dry-run, develop tip 263c1cf): 다운스트림 [TODO] 잔존 7 파일 → upstream merged PR 매칭 3건 (`CLAUDE.md` → upstream PR #254 / `.claude/agents/architect.md` → upstream PR #260 / `.claude/agents/pm.md` → upstream PR #260). 잔존 4 파일 (verify-z-pattern-health.mjs / verify-harness-drift-decorator.mjs / resolve-harness-drift-todo.mjs / docs/phases/roadmap-v3-incremental.md / .github/workflows/harness-guards.yml) 은 upstream PR 미생성 (Amendment 8/9/10 본 프로젝트 분기 영역, harness-setting 영역 X). **self-test 17 cases PASS**: extractIssueRefs 6 (3 패턴 / multi / empty / no refs) + applyTodoReplacement 9 (.md / .mjs / .yml positive + 4 negative + 2 boundary) + AND 결합 boundary 2. **회귀 0 확인**: 기존 `verify-z-pattern-health.mjs` Phase 1=6 / Phase 2=4 / 진행률 66.7% / exit 0 + `[Phase 2 Sync] OK` 동일 출력. `verify-agent-ssot.sh` 회귀 0 (script + workflow 변경만, 5 페르소나 .md 변경 없음). **silent 가드 비대칭 의도적** (Amendment 8/9 답습): 데코레이터 누락 = fail-fast / drift 카운트 초과 = soft-warn / TODO 해소 매칭 = soft-warn (시점 차이, Phase 1 PR 시점엔 upstream PR 미생성). **D8 메타 측정 자기 적용 안정성**: `resolve-harness-drift-todo.mjs` 자체에도 `// HARNESS-DRIFT: Z-PATTERN [TODO]` 데코레이터 박제 (Phase 1 도입 PR 정합). 비-범위: ADR §결정 본문 변경 ❌ / 측정 식 (Amendment 7 보존) / 데코레이터 형식 (Amendment 8 보존) / N=10 임계 (Amendment 9 보존) / TODO Aging Guard (#577 영역) / sidecar 자동 삭제 (#572 영역) / Prettier 정합성 (#578 영역) / upstream harness-setting 영역 (#573) 모두 변경 ❌.

- **[#557] ADR 20260515 Amendment 9 — 경고 피로감 가드 (활성 drift ≥ N=10 soft-warn, cross-validate agy 고유 발견 #2)** ([#557](https://github.com/coseo12/astro-simulator/issues/557)) — Amendment 7 (PR #555) cross-validate agy Antigravity (2026-05-25) 고유 발견 #2 후속. 활성 drift 파일 수 (`detectDriftFiles().length`, orphan 제외) 차원 silent 회귀 가드 박제 — Amendment 2/6 silent 약화 사이클 (시간/누적 차원, §재검토 조건 #5) 와 직교한 **drift 파일 수 차원** §재검토 조건 #6 신설. **임계값 SSoT**: `ALERT_FATIGUE_THRESHOLD_N = 10` (baseline 6 + buffer 4, Amendment 2 N=10 정합). agy 원안 N=3 거부 — measurement-first 원칙 (CLAUDE.md §스프린트 계약 #10) baseline=6 실측 후 N=10 정정 (volt #51 외부 툴 주장 실측 가드 패턴 답습). **확장**: `scripts/verify-harness-drift-decorator.mjs` 에 `--mode=count-warn` CLI 플래그 분기 추가 (~+130 라인). 기본 `--mode=verify` (Amendment 8 데코레이터 fail-fast) 회귀 0. count-warn 동작: drift < N → exit 0 (`alert fatigue: OK`) / drift ≥ N → exit 0 + stdout `[Alert Fatigue Trigger]` 마커 + drift 파일 목록 (soft-warn, CI hard-block 아님). **CI workflow**: `.github/workflows/adr-z-pattern-health-v2.yml` 에 step 2개 추가 (`Verify Alert Fatigue Threshold` + `Create [Alert Fatigue Trigger] issue`). 월 cron 시점 stdout `[Alert Fatigue Trigger]` 마커 grep 감지 시 자동 이슈 생성 (중복 방지 `gh issue list --search` + 3 영업일 결정 분기 의무 본문 박제 — Phase 2 가속 / 일부 Phase 1 revert / N 재조정). **self-test 확장**: 기존 25 cases (regex 13 / format 7 / sim 5) 회귀 0 + Amendment 9 boundary 4 cases 추가 (N-1=9 / N=10 / N+1=11 / files 목록 박제) → 총 29 PASS. **silent 가드 비대칭 의도적** (Amendment 8 §결정점 4 정합): 데코레이터 누락 (Phase 1 PR check) = fail-fast (예방 < 1줄) / drift 카운트 초과 (월 cron) = soft-warn (1인 운영 트레이드오프, 사용자 결정 분기). **D3 자기 적용 안정성**: 현재 develop tip drift=6 < N=10 → 본 가드 도입 PR 자체가 즉시 위반 상태로 진입하는 자기 모순 회피. **회귀 0 확인**: `verify-agent-ssot.sh` 회귀 0 (script + workflow 변경만, 5 페르소나 .md 변경 없음). 비-범위: ADR §결정 본문 / 측정 식 (Amendment 7 보존) / 데코레이터 형식 (Amendment 8 보존) / N=10 임계값 / TODO 자동 해소 (#569 영역) / orphan sidecar 자동 삭제 (#572 영역) 모두 변경 ❌.

- **[#556] ADR 20260515 Amendment 8 — Phase 1 드리프트 가시화 + Phase 2 중도 변경 정적 비교 가드 (cross-validate agy 고유 발견 #1)** ([#556](https://github.com/coseo12/astro-simulator/issues/556)) — Amendment 7 (PR #555) cross-validate agy Antigravity (2026-05-25) 고유 발견 #1 후속. 두 차원 가시성/무결성 강화 가드 박제 (silent 가드 강화 방향, Amendment 2/6 약화와 비대칭 일관). **차원 1 — HARNESS-DRIFT 데코레이터 의무**: Phase 1 임시 수정 (harness-managed sha256 불일치) 파일에 데코레이터 박제 의무. 본문 SSoT `HARNESS-DRIFT: Z-PATTERN [<upstream-link-or-TODO>]` + 파일 형식별 분기 (`.md` HTML 주석 / `.ts|js|mjs|cjs` line-slash / `.yml|sh` line-hash / `.json` sidecar `<filename>.HARNESS-DRIFT.md`) + 위치 (파일 첫 줄, shebang/DOCTYPE/YAML frontmatter 1블록 직후 1줄 허용). regex SSoT 박제 (ADR §Amendment 8 §위치 SSoT). developer 단계 보완 — architect 박제 regex 가 `.claude/agents/*.md` 컨벤션 (YAML frontmatter) 미커버 발견 → YAML frontmatter 1블록 prefix 허용 추가 (의미 동일, 파일 메타 헤더 직후 첫 컨텐츠 라인). **차원 2 — Phase 2 중도 변경 정적 비교 가드** (Amendment 5 보완): `scripts/verify-z-pattern-health.mjs` 에 `verifyPhase2Sync()` 함수 추가 — upstream open PR (coseo12/harness-setting, "ADR 20260515" 검색) 의 변경 파일과 로컬 drift 파일을 경로 매칭하여 `[Phase 2 Sync Drift]` 라인 stdout 박제 (soft-warn, exit code 변경 없음 — Amendment 8 §결정점 3b 옵션 A). CI workflow (`.github/workflows/adr-z-pattern-health-v2.yml`) 가 stdout 파싱하여 `[Phase 2 Sync Required]` 라벨 (priority:medium) + 자동 이슈 생성 (중복 방지 검색 후). **신규**: `scripts/verify-harness-drift-decorator.mjs` (~265 라인 — manifest sha256 비교 / 형식별 분기 / regex 검증 / sidecar 라이프사이클 + orphan 탐지 / 인라인 self-test 25 cases). CI 통합 `.github/workflows/harness-guards.yml` step 추가 (fail-fast — 데코레이터 누락 PR 차단). **데코레이터 박제 6 파일** (현재 develop tip drift): `CLAUDE.md` / `.claude/agents/architect.md` / `.claude/agents/pm.md` / `scripts/verify-z-pattern-health.mjs` / `docs/phases/roadmap-v3-incremental.md` / `.github/workflows/harness-guards.yml`. upstream PR 미생성으로 `[TODO]` 박제 — Phase 2 PR 머지 직후 실제 URL 교체 의무. **sidecar 라이프사이클 계약** (cross-validate agy 이견 수용 — orphan 방지): `<filename>.HARNESS-DRIFT.md` 존재 시 동일 디렉토리에 `<filename>` 반드시 존재 + manifest drift 상태 의무, orphan 발견 시 verify 스크립트 CI fail. **회귀 0 확인**: 기존 `verify-z-pattern-health.mjs` Phase 1=6 / Phase 2=4 / 진행률 66.7% / exit 0 동일. `verify-agent-ssot.sh` 45/45 PASS. 비-범위: ADR §결정 본문 변경 ❌ / Z 패턴 유지 / 측정 식 변경 ❌ (Amendment 7 정정 보존) / N 임계값 / 90일 임계 변경 ❌ / 동시 드리프트 N개 상한 (#557 영역) ❌ / TODO 자동 해소 (#569 Amendment 9 영역) ❌.

- **[#564] axe target-size 위반 shortcut-bar 외 영역 통합 fix — WCAG 2.2 2.5.8 전 영역 정합** ([#564](https://github.com/coseo12/astro-simulator/issues/564)) — PR #561 (#552 머지) 의 잔존 axe `serious:target-size` 위반 1건 (multi-element) 통합 fix. 3 영역에 동일 패턴 적용: (1) `apps/web/src/components/layout/mode-switcher.tsx` (observe / research / education / sandbox 4 button) — className 에 `min-w-6 min-h-6 shrink-0` 추가 + 부모 `<div>` 에 `overflow-x-auto whitespace-nowrap max-w-full` 안전망. (2) `apps/web/src/components/layout/unit-toggle.tsx` (si / astro / natural 3 button) — 동일 패턴. (3) `apps/web/src/components/layout/time-controls.tsx` (reverse / pause / forward 3 button + scale preset 6 button) — 동일 패턴. **baseline 갱신** (`docs/benchmarks/a11y-baseline.json`) — `axe.violations` 1 → 0 (desktop + mobile 모두) + `axe.ids` `["serious:target-size"]` → `[]` + 신규 `previousMeasuredAt: "2026-05-25"` (PR #561 baseline) / `updateReason` 박제 (의도성 3중 박제 — JSON updateReason / PR 본문 / CHANGELOG). 박제값 보존 — `MODES` / `UNITS` / `SCALE_PRESETS` 배열 / `data-r1-region="top-nav"` (TopBar) / `flex gap-0.5` / `flex gap-2` 구조 / 색상 토큰 / Tailwind padding 유지 (`px-2 py-1` / `px-2 py-0.5` / `p-1`) 모두 무수정. **R1 baseline 영역 영향** (top-nav) — ModeSwitcher (TopBar.left) + UnitToggle (TopBar.right) 모두 R1 baseline 영역 `[data-r1-region="top-nav"]` 안에 위치하여 24×24 px 강제 후 캡처 변화 예상. macOS 갱신 금지, workflow_dispatch CI Linux 캡처 의무 (#411/#515 패턴, volt #45 변형). TimeControls 는 TimeBar 영역 → R1 baseline 외 (영향 없음). 코드 변경 합계 **~12 라인 in-place 수정** (Concrete Prediction ~9 라인 대비 +3 라인 — scale-preset 6 button 도 동일 패턴 적용으로 정합성 확보, ADR Amendment 박제 의무 없음). PR #561 ADR §결정 1 SSoT 답습 — ADR 신규 박제 없음.
- **[#552] a11y baseline 측정 격차 3건 통합 fix — WCAG 2.2 AA 정합** ([#552](https://github.com/coseo12/astro-simulator/issues/552)) — PR #551 의 WCAG 2.2 AA 자동 측정 가드 baseline 첫 측정 (`docs/benchmarks/a11y-baseline.json`, 2026-05-24) 에서 확정된 3 격차 통합 fix. (1) axe `serious:target-size` (WCAG 2.2 2.5.8) — `apps/web/src/components/layout/focus-quick-buttons.tsx` 의 3 `<button>` className 에 `min-w-6 min-h-6 shrink-0` 추가 (Tailwind = 24×24 px hit-area 강제) + 부모 `<div>` 에 `overflow-x-auto whitespace-nowrap max-w-full` 안전망 도입 (R6 jupiter 진입 시 모바일 overflow trigger 영구 해소 + i18n locale 텍스트 길이 폭발 흡수). (2) shortcut bar fontSize 10 → 12 px — `apps/web/app/[locale]/globals.css:66` 의 `--text-mini` 토큰 0.625rem → 0.75rem 갱신 (토큰 SSoT 보존, 값만 갱신). (3) moon orbit `MOON_ORBIT_COLOR_DEFAULT` 명도 대비 2.32:1 → 3.06:1 (WCAG 1.4.11 ≥ 3:1) — `packages/core/src/scene/solar-system-scene.ts:482` 의 Color3(0.25, 0.28, 0.4) → Color3(0.30, 0.35, 0.50) 갱신 (명도 26% 상향, 톤 R:G:B 비율 보존으로 EARTH_FOCUS 10.02:1 와 자연 그라데이션 유지). **baseline 갱신** (`docs/benchmarks/a11y-baseline.json`) — 5 필드 갱신 + 신규 2 필드 (`previousMeasuredAt: "2026-05-24"` / `updateReason: "#552 통합 fix — target-size / fontSize / moon orbit contrast 3 격차 모두 임계 충족. silent 회귀 차단 보호 박제."`) 박제. 의도성 박제 3중 위치: JSON `updateReason` / ADR §결정 5 / PR #561 본문. **Visual Fidelity §의무 체크리스트 첫 본 인스턴스화** — `docs/architecture/principles.md` §1 의 4항목 (데이터 SSoT 보존 / rendering 시점 분리 / 사용자 D-T2 가이드 / baseline 박제) 모두 본 PR 의 moon orbit 색상 변경에 PASS 적용. 향후 R-Phase ADR 의 reference. 박제값 보존 — `MOON_ORBIT_COLOR_EARTH_FOCUS` (10.02:1) / `FOCUS_BUTTONS` 배열 / `flex gap-1` 구조 / `data-r1-region` 속성 / R-Phase Allowlist / orbitLines 일반 / `--text-mini` 토큰 이름 모두 무수정. 코드 변경 합계 **6 라인 in-place 수정** + baseline JSON 갱신 (Concrete Prediction 정합, R-Phase 시리즈 "데이터/상수만 변경, 신규 코드 0" 패턴 답습). agy cross-validate outcome=applied (architecture mode, log `.claude/logs/cross-validate-architecture-20260525-175423.log`) — ① 일관성 / ② Visual Fidelity 적용 우수 / ③ 인터페이스 명확성 / ⑤ 보안 (silent 갱신 차단 3중 박제) 4축 합의. cross-validate 이견 수용 2건 (overflow-x-auto 안전망 결정 1 통합 + grep 정적 분석 DoD 추가). 비-범위: `MOON_ORBIT_COLOR_EARTH_FOCUS` / FOCUS_BUTTONS 배열 / shortcut bar 레이아웃 재설계 / 다른 색상 토큰 / WCAG 2.2 가드 스크립트 / `--text-mini` 토큰 재명명 / Tailwind `text-mini` → `text-xs` 전환 / R5+ 진입 결정 / `docs/architecture/principles.md` §1 적용 사례 표 갱신 (cross-validate 고유 발견, 후속 분리). 후속 이슈 분리 (low): principles.md §1 적용 사례 표에 본 ADR (#552) 항목 + cross-link 박제 (단순 문서 cross-link, 코드 변경 0).
- **[#554] ADR 20260515 Amendment 7 — Z 패턴 측정 식 자기참조 인플레이션 정정 (옵션 D 채택)** ([#554](https://github.com/coseo12/astro-simulator/issues/554)) — 2026-05-25 자동 탐지 workflow (`.github/workflows/adr-z-pattern-health-v2.yml`) [ADR Trigger] 발화 (Phase 1 회차 12 ≥ N=10). 발화 원인 forensic: PR citations 12개 중 실제 Z 패턴 적용은 **6건** (#468/#472/#475/#478/#481/#482), 나머지 6건은 ADR 자체 진화 (Amendment 박제 4건 #486/#489/#490/#501 + 자동화 hotfix #491 + 릴리스 #494) — 측정 식 자기참조 인플레이션. CLAUDE.md §스프린트 계약 #10 "수치 DoD 미달 시 측정 방법 검증 우선" 원칙 직접 적용 (silent 가드 약화 옵션 C 또는 Phase 2 강제 옵션 A 대신 측정 결함 정정 우선). **자동화 스크립트 2단 정정** (`scripts/verify-z-pattern-health.mjs`): (1) 신규 `isAdrEvolutionPr(title)` 함수로 PR title regex (`Amendment N` / `hotfix` / `release vX.Y.Z`) 식별하여 `adrCitations` 카운트에서 제외 (2) `phase1Count = Math.max(amendmentCount, adrCitations)` → `phase1Count = adrCitations` (Math.max 폐기 — D1 검증에서 Amendment 7 박제 자체로 amendmentCount 6→7 증가하여 Math.max 가 인플레값 채택하는 2축 자기참조 발견). 정정 후 실측: Phase 1 = 6, Phase 2 = 4, 진행률 66.7% (Amendment 1 임계 33% 대비 2배 초과), 3중 OR 임계 모두 미발화 exit 0 ✅. ADR §재검토 조건 #5 본문에 "ADR 자체 진화 PR (Amendment 박제 / hotfix / release) 은 Z 적용 회차로 카운트하지 않음" 명시 + §Amendment 7 forensic 박제 (Phase 1=12 PR 분류 표 + 측정 식 2단 정정 사유 + silent 가드 무력화 위험 점검 + Claude 편향 셀프 체크 4종). agy cross-validate outcome=applied (exit 0, log `.claude/logs/cross-validate-architecture-20260525-134600.log`) — "측정 식 자체에 대한 포렌식 및 결함 분석 적용" 모범 사례 평가. 비-범위: §결정 본문 변경 / Phase 2 의무 폐지 / 다른 §재검토 조건 / N 임계 재완화 / 측정 식의 다른 차원 변경. 후속 분리 권고 (agy 고유 발견 4건, 모두 본 PR 비-범위): Phase 1 드리프트 데코레이터 주석 (medium) / 경고 피로감 가드 (medium) / CI exit code 계약 명시 (low) / 신규 진입 인지 부하 완화 (low).
- **[#546] satellite billboard 시각 강화 — parent-focus-aware LOD floor + 4 px guard (R4 Amendment 4 후속)** ([#546](https://github.com/coseo12/astro-simulator/issues/546)) — R4 Amendment 4 (moonScale 800 → 200) 머지 후 사용자 D-T2 회귀 ("줌인 상황에 따라 달이 안 보이는건 정상?") 해소. forensic 측정 (1280×720 earth focus moon level=low pxD=12.17 / 1920×1080 mid pxD=18.25 / 375×667 mid pxD=22.55, 3 viewport 모두 mid/high variant `isVisible=false`) 의 직접 원인이 **parent focus 시 child satellite 의 LOD 가 default 식으로만 결정되어 high variant 비활성화** 임을 식별. forensic ADR `docs/decisions/20260524-546-satellite-billboard-visibility-forensic.md` §5 결정 — 옵션 5 hybrid (parent-focus aware LOD floor + 4 px guard) 채택. 호출 시퀀스 LOD 엔진 baseline → satellite-visibility 가드 후처리 (SRP 단방향, agy cross-validate 이견 수용 #2). **신규 파일**: `packages/core/src/scene/satellite-visibility.ts` (parent-child + 4 px guard SSoT) + `packages/core/src/scene/satellite-visibility.test.ts` (17 케이스 — earth focus + moon / 4 px boundary / default sun 무회귀 / R5+ mars·jupiter·saturn 자동 수용 / Split-brain SRP). **변경**: `packages/core/src/scene/solar-system-scene.ts:runLodPass` 가드 호출 결합 +18 라인 + `apps/web/scripts/browser-verify-546-satellite-visibility.mjs` 3 viewport × 2 시나리오 회귀 가드. 박제값 보존 — `LOD_BILLBOARD_ALPHA_MASK_MIN_PX_DIAMETER=4` (Amendment 1) / `FOCUS_USER_RADIUS_MULTIPLIER_SATELLITE=20` (Amendment 3) / `EARTH_MOON_ORBIT_VISUAL_SCALE=30` (Amendment 2) / `moonScale=200` (Amendment 4) / R-Phase Allowlist (5 body) / LOD 본체 (lod.ts) 모두 무수정. **R5+ 자동 수용** — parentId 기반 일반화로 R5 mars+phobos/deimos / R6 jupiter+galilean / R7 saturn+titan 본 가드 무수정 자동 활성. **D5 DoD PASS** — D5.1 earth focus moon level≥mid (3 viewport 모두 mid) / D5.2 moon-lod-mid `isVisible=true` (사용자 인지 가능 형태) / D5.3 pxDiameter≥4 (12.26~22.72 px, Amendment 1 SSoT 정합) / D5.4 default sun 시점 moon=low 보존 (Amendment 4 의도). 비-범위: LOD 본체 변경 ❌ / Amendment 1/2/3/4 박제값 변경 ❌ / camera-controller·focus-multiplier 정책 변경 ❌ / 다른 R-Phase body 영향 ❌ / R-Phase Allowlist 변경 ❌. **후속 분리 이슈 박제 예정** (agy cross-validate 고유 발견 4건): LOD 전이 visual pop (medium, R5 진입 전) / R6+ 다중 위성 인플레이션 부하 (high, R6 진입 전 필수) / dynamic FOV 가드 임계 (low) / Floating Origin shift LOD 안정성 (선택).
- **[#534] satellite-parent body focus 시 zoom-in 안내 tooltip — R4 cross-validate Gemini 권고 1 후속** ([#534](https://github.com/coseo12/astro-simulator/issues/534)) — R4 Amendment 4 (moonScale 800 → 200) 후 default 진입 시 moon disc 가 작아져 사용자가 위성 존재를 인지하기 어려운 mental model gap 을 onboarding tooltip 으로 보완. earth focus 진입 + 1.5초 delay 후 하단 toast "확대하여 달의 위치를 확인하세요" 표시 (X 버튼 + 5초 auto fade-out). 일반화 SSoT — `resolveFocusMultiplier` SSoT 재사용으로 R5 mars (포보스·데이모스) / R6 jupiter (갈릴레이 위성) / R7 saturn (타이탄) focus 시 자동 활성 (body 별 텍스트 분기 + per-body localStorage 키 `r4.satellite-zoom-tooltip-shown.<bodyId>`). **신규 파일**: `apps/web/src/lib/satellite-onboarding-storage.ts` (localStorage helper SSoT, SSR + quota fallback) + `apps/web/src/components/ui/satellite-zoom-tooltip.tsx` (UI 컴포넌트, satellite-parent 일반화 `__isSatelliteParentBody`). **변경**: `apps/web/src/components/layout/app-shell.tsx` 1줄 마운트 (`<SatelliteZoomTooltip />`). 박제값 보존 — `resolveFocusMultiplier` SSoT (focus-multiplier.ts) / camera-controller / r-phase-allowlist / earthScale / moonScale 모두 무수정. **단위 테스트**: 30 cases 추가 (`satellite-onboarding-storage.test.ts` 8 + `satellite-zoom-tooltip.test.tsx` 22 — Q5 일반화 7 / D1 4 / D2 3 / D3 3 / D4 2 / D6 3 / D8 2 / a11y 2). 비-범위: 다국어 i18n (ko-only 박제 보존) / 다른 onboarding tooltip 일반 framework (info 패널 / shortcut bar 등) / camera-controller / focus-multiplier 정책 변경 / earthScale / moonScale 재변경 / ADR 신규 박제 (architect cross-validate skip 결정 정합).
- **[#539] R4 Amendment 4 — moonScale 800 → 200 (사실 비율 vs 사용자 시각 인지 mismatch 해결)** ([#539](https://github.com/coseo12/astro-simulator/issues/539)) — Amendment 3 fix PR #545 QA PASS + 사용자 D-T2 시각 확인에서 회귀 2건 발견: (1) moon 크기 비정상적으로 큼 (default sun 시점), (2) 특정 카메라 각도에서 moon 사라짐. debug 스크립트 6 각도 sweep 실측: moon screen radius 5.5 px (high mesh, isVisible=false) / earth screen radius 20.4 px / earth-moon distance 28 px @ default. **결정적 발견**: 사실 비율 (moon = earth 27.2%) 정합이 사용자 천문 직관 (moon = sub-pixel) 과 mismatch — PM / architect / cross-validate Gemini / developer / QA 5 단계 모두 합의 후 D-T2 만 발견. `apps/web/src/constants/body-scale.ts` `moon: 800 → 200`. moon mesh radius 1.39e9 m → **3.475e8 m** (earth 의 27.2% → **6.8%**) / moon sun 대비 px 비 4.47% → **1.12%** (Amendment 1 임계 5% 안전) / earth-moon visual distance / moon mesh radius **8.3배 → 33배** (사용자 인지 자연화). **사실 비율 깨짐 — 사용자 천문 직관 우선** (R3 ADR Amendment 2026-05-03 라운드 3 "사실 비율 강화" 원칙과 직교). orbit visual scale=30 / earthScale=800 / Amendment 1 임계 (17% / 5%) 보존. moon focus marginal (D3.1 85 px → ~21 px) 인정. 사라짐 회귀는 LOD billboard sub-pixel + beta 극단 culling 추정 — 본 amendment 범위 밖 (R5+ 또는 별도 후속 이슈로 분리). 단위 테스트 `body-scale.test.ts` moon 단언 200 갱신 (2 cases).
- **[#539] R4 Amendment 3 — moon focus LOD × visual scale 결합 결함 해결 + measurement-only DoD 함정 회피** ([#539](https://github.com/coseo12/astro-simulator/issues/539)) — Amendment 2 fix PR #542 QA 차단 (D2.4 시각 회귀) 후속. 진단: visual scale=30 + moonScale=800 결합으로 moon high variant wsRadius (≈ 60426) 가 매우 커, 기존 focus 진입 식 `cameraRadius = meshRadius × FOCUS_USER_RADIUS_MULTIPLIER (=5)` 가 moon mesh 표면 안쪽 0.01 단위에 박힘 (`cameraRadius/moonScaling ≈ 1.011`). screenCoverage ≈ 0 → LOD `low` 판정 → moon high variant `isVisible=false` 토글 → moon-lod-low 1 px billboard 만 가시 ("화면 중앙에 안 보임"). wheel zoom-in 30회로도 LOD high 전환 미발동. ADR `20260520-r4-earth-moon-visualization.md` §Amendment 3 forensic 5/5 박제 + 옵션 (a)~(e) 5축 비교 → **옵션 (a) cameraRadius 자동 조정 + 식 후보 2 (satellite 일괄 정책)** 선택. **Fix**: 신규 SSoT `packages/core/src/scene/focus-multiplier.ts` 박제 (`FOCUS_USER_RADIUS_MULTIPLIER_SATELLITE = 20` + `resolveFocusMultiplier(parentId)` helper, R5+ phobos/io/europa/titan 자동 수용). `packages/core/src/scene/solar-system-scene.ts` handles 에 `getBodyParentId(id)` SSoT lookup 추가. `apps/web/src/components/sim-canvas.tsx syncFocusToScene` 식 후보 2 적용 — body parentId lookup → `resolveFocusMultiplier` → `desiredRadius = max(meshRadius × {20 if satellite else 5}, meshRadius + padding)` → `controller.focusOn({ mesh, radius: desiredRadius })` 명시적 전달 (camera-controller default 식 우회). **LOD 시스템 / visual scale=30 / 박제값 (earthScale/moonScale=800 / Amendment 1 임계 17/5) 무수정**. **D-T2 실측 (LOD-aware measurement, 1280×720)**: D3.1 moon focus mesh 화면 중앙 ≥ 200 px (`isVisible=true` 검증 후 측정) / D3.2 moon high variant `isVisible=true` + moon-lod-low `isVisible=false` / D3.3 cameraRadius/moonScaling > 1.5 (≈ 4.04 식 예측, +2.54 margin) / D3.4 Amendment 2 D2.1/D2.2/D2.3 무회귀 / D3.5 Amendment 1 임계 보존 (earth ≤ 17 / moon ≤ 5) / D3.6 R-Phase Allowlist 보존. **메타 결정**: LOD-aware measurement 패턴 SSoT 정의 (`mesh.isVisible` 검증 후 wsRadius × projection 측정) — R5+ R-Phase ADR Concrete Prediction §수치 DoD 의무 인용. PR #542 Amendment 2 fix (orbit visual scale=30 도입 + satellite resolveWorld 분기 + orbit line scaling) 도 본 PR 에 통합 (#542 close, 본 PR 이 SSoT 통합). 단위 테스트 `focus-multiplier.test.ts` 신규 (10 cases, satellite 분기 정책 + D3.3 식 검증). 핵심 코드 변경 ~10 라인 (ADR §Concrete Prediction §예측 1 박제값 5~7 라인 정합 + Amendment 2 통합 분).
- **[#539] R4 Amendment 2 — moon visual fusion 해결: earth-moon orbit visual scale=30 도입 (rendering 시점, 실측 데이터 SSoT 보존)** ([#539](https://github.com/coseo12/astro-simulator/issues/539)) — R4 머지 (PR #537, commit 9b4ba37) 직후 사용자 D-T2 시각 회귀 발견: (1) earth focus zoom-in 해도 달 가시화 안 됨, (2) moon shortcut/URL focus 시 달이 존재하지 않음. 메인 오케스트레이터 debug 스크립트 (volt #67 패턴, `scripts/_debug-moon-visibility-tmp.mjs`, 실행 직후 `rm`) forensic 실측: moon mesh radius (1.39e9 m) > earth-moon distance (3.847e8 m) **3.6배** + earth mesh radius **13.26배** → mesh 가 earth-moon 거리 흡수 → 시각적 fusion. ADR `20260520-r4-earth-moon-visualization.md` §Amendment 2 forensic 변형 승격 (5/5 조건 충족) + 옵션 비교 5축 (i)~(v) → **옵션 (iii-amended) earth-moon orbit visual scale 도입** 선택. **Fix**: 신규 SSoT `packages/core/src/scene/orbit-visual-scale.ts` 박제 (`EARTH_MOON_ORBIT_VISUAL_SCALE = 30` + `ORBIT_VISUAL_SCALE_BY_PARENT` lookup + `getOrbitVisualScale(parentId)` helper, R5+ satellite SSoT 패턴 일반화). `packages/core/src/scene/solar-system-scene.ts` `resolveWorld` 분기에서 `world = parent + (local × visual_scale)` 적용 (parentId 가 sun 이 아닌 satellite 한정). moon orbit LineSystem 도 `scaling.set(30, 30, 30)` 적용 (시각 정합 — orbit line 도 ×30 expansion). **데이터 SSoT 보존**: `solar-system.json` moon orbit semiMajorAxisAU 무수정 (실측 3.847e8 m). **박제값 보존**: earthScale=800 / moonScale=800 / R4 D8 임계 (earth ≤ 17% / moon ≤ 5%) / R-Phase Allowlist 5 body. **D-T2 실측** (1280×720): D2.1 moon pxDiameter sun 시점 6.30 px (≥ 4 px PASS, +2.30 margin) / D2.2 earth-moon pxDist 28.05 px (분리 임계 30 px marginal -1.95, disc 간 빈 공간 13.2 px 확보) / D2.3 earth focus zoom-in moon pxDiameter 49.19 px (≥ 50 px marginal -0.81) / D2.4 moon focus moon pxDiameter 196.65 px (≥ 200 px marginal -3.35). 분리 마진 1.86배 (≥ 1.5x 임계 통과, ADR 예측 1.78배 보다 양호). D2.5 r1-guard 회귀 0 (earth 16.40% / moon 4.42%) / D2.6 R-Phase Allowlist 회귀 0. **fallback 트리거 (ADR §재검토 #7)**: D-T2 사용자 보고 시 visual_scale 30 → 50 → 75 단계 상향, 75 미통과 시 Amendment 3 (옵션 v parent-relative frame). 단위 테스트 `orbit-visual-scale.test.ts` 신규 (8 cases, SSoT 회귀 가드 + 분리 마진 1.78배 자동 검증). 코드 변경 합계 **8 라인** (ADR §Concrete Prediction 예측 1 박제값 7~8 라인 정합)
- **[#532] R4 D8 임계 amendment — earth ≤ 17% / moon ≤ 5.0% (perspective 보정 안정화)** ([#532](https://github.com/coseo12/astro-simulator/issues/532)) — Developer 단계 실측 검증에서 D8 earth ≤ 15% 임계 FAIL (16.40% 측정, ADR 식 예측 14.67% 대비 +11.8% 편차). 측정 방법 검증 (CLAUDE.md §"수치 DoD 미달 시 측정 방법 검증 우선" 가드 #10) 결과 r1-guard `boundingSphere.radiusWorld` 기반 측정 자체는 정확하나, ADR §결정 1 산출식 `(r_body × scale) / (r_sun × sunScale)` 이 **wsRadius 비** 만 계산 → perspective projection 의 카메라 거리 foreshortening 누락 확인. 검증 신호: mercury (−3.9%) / venus (−2.5%) 가 식 예측보다 작고 **earth (+11.8%) / moon (+12.0%) 만 식 예측보다 큼** — 식 결함 일관 패턴. earthScale=800 / moonScale=800 architect 박제값은 보존, 임계만 완화: `PX_RATIO_THRESHOLDS.earth: 15 → 17` (margin 0.6%) / `moon: 4.5 → 5.0` (margin 0.53%). ADR `20260520-r4-earth-moon-visualization.md` §Amendment 1 (2026-05-21) 박제 + §결정 3 결정값 갱신.
- **[#532] R4 진입 — earth + moon 시각화 + Q2=B 비례 결정 정책 SSoT 첫 본 인스턴스화** ([#532](https://github.com/coseo12/astro-simulator/issues/532)) — Roadmap v3 §R4 진입. R-Phase Allowlist 갱신 (`packages/core/src/scene/r-phase-allowlist.ts`) — `earth`, `moon` 추가 활성 (sun/mercury/venus/earth/moon 5개), jupiter/neptune disabled 유지. **earthScale=800 / moonScale=800 박제** (`apps/web/src/constants/body-scale.ts`) — venus 동일값으로 사실 비율 정합 (earth radius 1.054배 / moon-earth 27.2%). **Q2=B sun 대비 px 비 임계 박제** (Q2=B SSoT 첫 본 인스턴스화) — earth ≤ 15% (예측 14.67% margin 0.33%) / moon ≤ 4.5% (예측 3.99% margin 0.51%). **shortcut bar 7개 확장** (`apps/web/src/components/layout/focus-quick-buttons.tsx`) — sun / mercury / venus / earth / **moon** / jupiter / neptune (parent-satellite 자연 그룹) + Tailwind 토큰 `text-caption px-2 py-1` → `text-mini px-1 py-0.5` 축소 (모바일 375px viewport 수용). **달 궤도 라인** (`packages/core/src/scene/solar-system-scene.ts`) — moon orbit 을 별도 LineSystem (`moon-orbit-line`) 으로 분리, earth 실시간 위치 추종 (`moonOrbitLine.position` 매 프레임 동기) + earth focus 진입 시 색상 강조 (default Color3(0.25, 0.28, 0.4) → focus Color3(0.65, 0.7, 0.85), 명도 ~2.6배). **회귀 가드 갱신** — `apps/web/scripts/r1-ui-regression-guard.mjs` `PX_RATIO_THRESHOLDS` 에 `earth: 15` + `moon: 4.5` 추가 (5 body 측정 + 모바일 누적 disk area ≤ 25% 가드) + `apps/web/scripts/browser-verify-r-phase-allowlist.mjs` expected list 갱신 (4-A 차단 jupiter/neptune / 4-B 정상 sun/mercury/venus/earth/moon). **ADR**: [`docs/decisions/20260520-r4-earth-moon-visualization.md`](docs/decisions/20260520-r4-earth-moon-visualization.md) Accepted (cross-validate 2026-05-20). **후속 이슈 분리** (Gemini cross-validate 고유 발견 3건 비-범위): #534 earth focus zoom-in tooltip / #535 WCAG AA 자동 측정 가드 / #536 저사양 모바일 FPS 회귀 가드. R-Phase Allowlist 4곳 동시 박제 절차 준수 (ADR `20260504-r-phase-allowlist-guard.md` §결정 4)

## [0.17.0] — 2026-05-20

> **focus 라이프사이클 + 계측 인프라 (2026-05-19~20)** — `clearFocus` tier/origin 복원 + camera-controller follow observer + 자유시점(free-fly) 진입 메커니즘 신설 + Option D 가드 부수 비용 측정 + tier transition 입력 시도 계측 + forensic ADR 템플릿 박제. 7 PR 누적: PR [#511](https://github.com/coseo12/astro-simulator/pull/511) (#510 reset 회귀), [#512](https://github.com/coseo12/astro-simulator/pull/512) (#507 venus focus 추적), [#513](https://github.com/coseo12/astro-simulator/pull/513) (#509 free-fly UX), [#515](https://github.com/coseo12/astro-simulator/pull/515) (R1 baseline Linux 재캡처), [#514](https://github.com/coseo12/astro-simulator/pull/514) (#448 perf 측정), [#516](https://github.com/coseo12/astro-simulator/pull/516) (#444 입력 계측), [#517](https://github.com/coseo12/astro-simulator/pull/517) (#381 forensic 템플릿).

### Behavior Changes

- **#510 reset 버튼 회귀 차단 — `clearFocus` 에 tier/origin 복원 동반 (#511)** ([#510](https://github.com/coseo12/astro-simulator/issues/510)) — `packages/core/src/scene/solar-system-scene.ts:751 clearFocus()` 가 `focusBodyIdForAssert = null` 한 줄만 실행하여 tier (focus 시 sub-tier) + origin (focus body 위치) 가 잔존. `controller.reset(35)` Animation 시작 시 매 프레임 `updateTierByCamera` 가 잘못된 tier 판정 → `setTier` 트리거 → `tier-transition.ts:288-296` 의 stopAnimation 이 `cam-reset-radius/target` 까지 stop + `computeTargetRadius(35, oldScale, newScale)` 로 radius 폭증 (forensic 실측: 35 → 688,901 ≈ ×19,683). **Fix**: `clearFocus()` 에 `setTier(defaultInitialTier())` 한 줄 추가 — setTier 내부에서 `computeFloatingOriginForTier(tier, null, ...)` 가 origin 도 복원 (T1/T2 진입 → `[0, 0, 0]` SSoT). 실측: venus → reset radius 35.00 ✅ / mercury 35.00 ✅ / sun 463.92 (sun mesh 크기 반영, 시각 정상). H6 신규 가설 (H1 detachControl / H2 alpha-beta / H3 lowerRadiusLimit / H4 floatingOrigin 4 가설 전부 기각/부분 후 신규 발견)
- **#507 venus focus 추적 회귀 — camera-controller follow observer 도입 (#512)** ([#507](https://github.com/coseo12/astro-simulator/issues/507)) — `packages/core/src/scene/camera-controller.ts` 에 `#followObserver` 도입. `focusOn` Animation `onAnimationEnd` 콜백에서 attach (race 회피) + `reset` / 새 `focusOn` / `dispose` 시 detach. `mesh.isDisposed()` 가드. forensic: mercury 'body' tier → primary follow 발화 / venus 'inner' tier → primary follow skip (tier-conditional 정책). scene 측 tier 정책 (T1/T2 origin reset) 보존, camera 측 책임으로 follow 추가 (옵션 A 채택, 옵션 B T1/T2 primary follow 확장 대비 listener overhead 0). 실측: venus diff 24 → **0.039** (4cm) / mercury 0.067 회귀 가드 / sun 0.000 정확
- **#509 자유시점(free-fly) 진입 메커니즘 신설 (#513)** ([#509](https://github.com/coseo12/astro-simulator/issues/509)) — focus 상태에서 카메라 시점(alpha/beta/radius/target/tier) 을 그대로 유지하면서 focus tracking 만 해제하는 자유시점 UX 추가. **신규 API**: `solar.detachFocus()` (clearFocus 와 분리, tier/origin 보존) + `controller.clearFollow()` (#509 follow observer 외부 detach) + `sendCommand({type: 'enterFreeFly'})` + `CoreEvents.freeFlyEntered`. **Store**: `freeFlyMode: boolean` + `enterFreeFly()` action (selectedBodyId=null + freeFlyMode=true 동시 set). **UI**: shortcut bar "탐색" 버튼 (focus 없을 때 disabled) + Esc 단축키 (input/contenteditable 보호). **subscribe 분기**: `selectedBodyId=null && freeFlyMode=true` → detachToFreeFly() (clearFocus + reset 대신 detachFocus + clearFollow). 실측: free-fly 진입 후 3초 freeze dΔ=0.0000 (alpha/beta/radius/target 모두 변화 0), wheel zoom 정상, venus 재진입 diff 0.0384
- **#444 tier transition 입력 시도 계측 — G8b 격상 결정 데이터 (#516)** ([#444](https://github.com/coseo12/astro-simulator/issues/444)) — `tier-transition.ts:runTierTransition` 진입 시 document level wheel/touchstart 핸들러 등록 (capture phase + passive). transition 윈도우 (detachControl ~ cleanup) 내 발생한 입력 시도 횟수를 누적 후 cleanup 시점에 호출자 콜백 (`onInputAttempts`) 으로 1회 전달 (count > 0 일 때만). **신규**: `TierTransitionOptions.onInputAttempts?: (count: number) => void` / `SolarSystemSceneOptions.onTierTransitionInputAttempts` / `SimulationCore.metrics = { tierTransitionInputDrops: 0 }`. **DevTools 접근**: `window.__simCore.metrics.tierTransitionInputDrops`. 실측: false positive 0 (transition 외부 wheel 카운트 안 됨), transition 윈도우 wheel dispatch × 10 → drops 8 정상 카운트
- **#381 forensic ADR + Amendment 패턴 템플릿화 (#517)** ([#381](https://github.com/coseo12/astro-simulator/issues/381)) — `docs/templates/forensic-adr-template.md` 신규 박제 (260 라인, 8 섹션 placeholder + 모범 사례 링크). **8 섹션**: 배경 / 영향 모듈 / 옵션 비교 5±2 / Concrete Prediction / 결정 / 위험·재검토 / Amendment 라운드 N / 후속·분리 이슈. **CLAUDE.md `### 아키텍처 결정 기록 (ADR)`** 에 forensic 변형 발동 조건 5종 추가 — 3개 이상 충족 시 forensic 사용 (가설 N≥2 / runtime 측정 필수 / DoD PASS 인데 회귀 / 5±2 옵션 / Amendment 예상). 판정 애매 시 일반 ADR 시작 → Amendment 1회 필요 시점에 승격 + 양방향 cross-link. **`.claude/agents/architect.md`** 에 호출 절차 5단계 (일반 ADR 시도 → 부족 인식 → 템플릿 복사 → 8섹션 채움 → `_debug-*-tmp.mjs` 실측 직후 `rm`). 모범 사례 3건: `20260430-r3-followup-body-proportion.md` (#373), `20260509-380-zoom-camera-freeze-forensic.md` (#380), `20260504-411-r1-guard-shortcut-bar-forensic.md` (#411)

### Notes (행동 변경 없음 — 측정·인프라·문서)

- **#448 Option D + G8a 가드 부수 비용 측정 (#514)** — `scripts/bench-tier-guard-cost.mjs` 신규 (Playwright + CDP `Emulation.setCPUThrottlingRate` rate=4). 4 시나리오 (idle / focus / post-zoom / post-reset) 측정. 실측: 모든 시나리오 fps ≥ 55 / p95 ≤ 20ms (임계 24/60 의 2~3배 여유). 가드 발화 vs idle: 66 → 55 (~17% fps 감소). Gemini F5 권고 (ADR `20260509-380-zoom-camera-freeze-forensic.md` Amendment 2026-05-11 F5) 검증 완료. `pnpm bench:tier-guard-cost` 재실행 가능 (env: `BENCH_CPU_SLOWDOWN`, `BENCH_FPS_THRESHOLD`, `BENCH_P95_FRAME_MS`)
- **R1 baseline Linux CI 캡처 갱신 (#515)** — `apps/web/scripts/__baselines__/r1/` 12장 (4 영역 × 3 viewport) 을 develop tip (#509 "탐색" 버튼 추가 반영) 기준으로 재캡처. workflow_dispatch (`r1:baseline-bootstrap` workflow) 자동 PR. shortcut-bar 216 → 244 (mobile 139 → 156). 학습: `gh workflow run` default ref = main (volt #45 함정 변형) — `--ref develop` 명시 필수

### 학습 (메모리 박제)

- **`gh workflow run` default ref = main** — workflow_dispatch 의 ref 미명시 시 main 에서 실행됨. develop 기준 워크플로 (예: r1:baseline-bootstrap) 는 `--ref develop` 명시 필수. volt #45 workflow_dispatch 2단계 함정의 변형
- **PR base update 로 새 baseline 자동 반영** — develop 의 baseline 갱신 후 다른 PR 의 R1 가드는 자동 재실행 안 됨. `gh pr update-branch <PR>` 로 base merge 후 CI trigger 필요
- **`Closes: #N` 콜론 문법 auto-close 미발동** — 본 세션 6 이슈 (#510, #507, #509, #448, #444, #381) 모두 수동 close. PR 본문에 `Closes #N` (콜론 없음) 또는 별도 줄에 박제 권장

## [0.16.0] — 2026-05-17

> **R3 사이클 + 메타 안정화 (2026-05-17)** — Roadmap v3 R3 (금성) 가시성 진입 + R-Phase defense-in-depth 가드 시리즈 박제 (#402/#403/#404/#411/#412/#415) + 회귀 fix (#378/#380/#385/#391/#408/#419/#440) + 메타 인프라 안정화 (cross-validate plan-mode 우회 가드 #479 / create-pr Strict Assertion #471 / 5 페르소나 create-pr SSoT #477 / PR 템플릿 ADR 호환성 #455 / 메타 7체크박스 #470 / DoD 측정 방법 #469) + ADR Z 패턴 health metric 자동 탐지 (#483 Amendment 3). 57 커밋 누적. PR [#486](https://github.com/coseo12/astro-simulator/pull/486) (#476 Amendment 1 Phase 2 N=3 OR 30일 트리거) + [#489](https://github.com/coseo12/astro-simulator/pull/489) (#487 Amendment 2 N=10 OR 90일 완화 옵션 C) + [#490](https://github.com/coseo12/astro-simulator/pull/490) (#483 자동 탐지 + Amendment 3) + hotfix 2회 ([#491](https://github.com/coseo12/astro-simulator/pull/491) YAML 'on:' → "on": quote / [#492](https://github.com/coseo12/astro-simulator/pull/492) workflow rename `-v2.yml`).

### Behavior Changes

- **#380 줌 freeze + jitter 회귀 fix — Option D+G8a 4 가드 직교 적용 (defense-in-depth Top 4) (#380)** ([#380](https://github.com/coseo12/astro-simulator/issues/380)) — ADR [`docs/decisions/20260509-380-zoom-camera-freeze-forensic.md`](docs/decisions/20260509-380-zoom-camera-freeze-forensic.md) §결정 §Amendment 2026-05-11 §G8a SSoT. 4 가드 직교 박제 — **가드 A** (`packages/core/src/scene/tier-transition.ts:computeLowerRadiusLimit` 신규 헬퍼 + `runTierTransition` 의 lowerRadiusLimit 한 방향 완화 → 양방향 동기화 교체) — tier 별 적정 lowerRadiusLimit (`targetRadius * 0.01`) 으로 매 진입 시점 동기화. T3 body default `lowerRadiusLimit = 0.5` (≈ 20km) 가 mesh 표면 줌인 wall 형성 + 누적 drift 차단 (G1 fix). **가드 B** (#408 F2 fix 의 `tierTransitionInProgress` 플래그 검증 박제) — 단위 테스트로 in-flight lock 라이프사이클 단언 (lock 진입 → 재진입 차단 → cleanup 후 재진입 가능) + detachControl 호출 횟수 1회 고정 검증 (ADR Concrete Prediction 2). **가드 C** (`solar-system-scene.ts:updateAt` 의 `setOriginToBody` 호출을 mesh.position 갱신 루프 *후*로 이동) — frame 내 mesh.position 과 origin 이 같은 reference frame 으로 정합 → cam.globalPosition 일관 → tier 재판정 race 차단 (G3 fix). **가드 G8a** (`solar-system-scene.ts:setTier` 진입 시 즉시 `scene.detachControl()` 호출 + `runTierTransition` 진입 시 동일 호출 idempotent 흡수) — 카메라 입력 잠금을 transition 결정 _직후_ 즉시 발동 → 사용자 wheel/pinch race 윈도우 0 ms 로 축소. tier transition tween 시작 전 race 분기 제거 → 사용자 D-T2 양상 (jitter at tier transition) 직접 차단 (G8 fix). **회귀 가드** (`apps/web/scripts/browser-verify-380-zoom.mjs` 신규 + `verify:380-zoom` package script): 4 시나리오 매트릭스 — S1 T3 진입 후 줌인 5회 (가드 A wall 차단), S2 tier 전환 시점 빠른 휠 5회 (가드 G8a race window 0, ADR Prediction 6), S3 빠른 휠 회전 5회 (가드 B oscillate 차단, ADR Prediction 2), S4 T3 + focus + 자유 줌 (가드 C freeze 차단, ADR Prediction 4). **단위 테스트**: `tier-transition.test.ts` 에 4 그룹 16 cases 추가 — `computeLowerRadiusLimit` 5 cases (정상 / floor / T1 / T3 / 회귀 가드) + G8a detachControl 진입 시점 3 cases (호출 순서 / idempotent / 회귀 가드) + 가드 B in-flight lock 4 cases (lock=true / cleanup 후 재진입 / detachControl 1회 고정 / 회귀 가드) + 가드 C primary follow 4 cases (T3+focus 정상 순서 / T1 skip / focus 없음 skip / 회귀 가드). 562 → 578 PASS. **사용자 D-T2** (2026-05-11) 양상 보고 — jitter at tier transition + 줌인/줌아웃 둘 다 — Option D+G8a 4 가드 직교로 두 인지 (jitter + freeze) 동시 해결. defense-in-depth 시리즈 #402 (Top 1) / #403 (Top 2) / #404 (Top 3) 와 직교 — 본 결정은 카메라 race 4 분기 직교 매트릭스 박제 (Top 4). cross-validate Gemini 호출 architect 단계 박제 완료 (Option D+G8a 4 가드 사양 합의, F7 주석 보강 만 현 PR 반영, F1~F6 후속 이슈 #444~#449 분리). **F7 주석 보강 반영** (Gemini 고유 발견 §범위 내) — `runTierTransition` 진입 시 카메라 제어권 명시 주석 추가 (releaseControl 1회 발동 보장 + 호출자 idempotent 흡수)
- **`SimCommandProvider` mount 순서 정합화 — `useSimCommand` race condition 본질 해결 (#419)** ([#419](https://github.com/coseo12/astro-simulator/issues/419)) — `apps/web/src/core/sim-context.tsx` 의 `SimCommandProvider` 가 `core === null` 시 children 렌더 보류 (`if (core === null) return null;` early return, A1-E 후보). sim-canvas 의 비동기 core 인스턴스 생성 (`useEffect → setCore`) 이 완료된 후에만 children (UrlSync + SidePanels + InfoPanel 등) 의 useEffect 가 발화 → `sendCommand` 가 항상 non-null core 호출 보장 → race condition 구조적 차단. children mount 지연 < 100ms (core 생성 시간, browser-verify 1초 timeout PASS 유지로 검증). 기존 useSimCommand 호출자 7곳 (focus-quick-buttons / mode-switcher / time-controls / scale-control / date-time-picker / celestial-tree / scenario-presets) 모두 사용자 클릭 핸들러 안 호출이라 영향 0. ADR [`docs/decisions/20260510-419-sim-canvas-mount-race.md`](docs/decisions/20260510-419-sim-canvas-mount-race.md) §결정 1 (A1-E early return). 부모 ADR `20260504-415-url-sync-guard.md` §재검토 조건 1 충족 — §Amendment (2026-05-10) 박제 (PR #436)
- **`apps/web/src/core/url-sync.tsx` `?focus=` 가드 분기에서 `setSelectedBody(urlFocus)` race fallback 제거 (#419)** ([#419](https://github.com/coseo12/astro-simulator/issues/419)) — `sendCommand({type:'focusOn', bodyId})` 단독으로 `selectedBodyId` sync (event 단일 진실원 R1 #334+#335 ADR `20260425-r1-store-scene-sync-unification.md` §결정 3 정신 회복). race 부재 보장 (mount 순서 정합화로). `setSelectedBody` 변수 선언도 제거 (lint warning 차단). R-Phase allowlist 가드 분기 (#415, `isRPhaseFocusable`) 자체 로직 변경 0 — store mutation 부수 효과 SSoT 사용만 폐기. **회귀 가드**: `?focus=sun` / `?focus=mercury` / `?focus=venus` 진입 시 `selectedBodyId` 정상 sync (R1 #329 / R2 #361 / R3 #369 회귀 보호) — `apps/web/scripts/browser-verify-r-phase-allowlist.mjs` 시나리오 4-B PASS 유지로 검증
- **`apps/web/src/core/sim-context.test.tsx` 신규 — SimCommandProvider mount 순서 단위 테스트 0 → 2 (#419)** ([#419](https://github.com/coseo12/astro-simulator/issues/419)) — 매트릭스: `core={null}` props 시 children 미렌더 단언 (race condition 구조적 차단) + `core={mockCore}` props 시 children 등장 + useSimCommand 가 mock.command 호출 (정상 동작 회귀 보호). ADR §결정 3-1 박제 사양 일관. 2/2 PASS
- **`apps/web/src/core/url-sync.test.tsx` 갱신 — race fallback 부재 검증 (#419)** ([#419](https://github.com/coseo12/astro-simulator/issues/419)) — 기존 8 케이스 보존 + 케이스 1~3 (sun/mercury/venus) 의 `selectedBodyId` 단언을 `sendCommand` 호출 단언으로 격상 (mock 환경에서 setSelectedBody 직접 호출 경로 부재; e2e 검증은 browser-verify 시나리오 4-B 담당). 신규 케이스 9 추가 — `?focus=sun` 진입 시 `vi.spyOn(useSimStore.getState(), 'setSelectedBody')` 호출 0회 단언 (DoD-4 race fallback 부재 검증, event 단일 진실원). 9/9 PASS (전체 url-sync.test.tsx 9 cases / 209 web tests / 565 모노레포 tests 모두 PASS)
- **ScenarioPresets R-Phase UI 가드 추가 — defense-in-depth UI 측 3번째 축 (#404)** ([#404](https://github.com/coseo12/astro-simulator/issues/404)) — `apps/web/src/components/panels/scenario-presets.tsx` 에 `isPresetEnabled` 일반화 함수 박제 (`Object.keys(preset.massMultipliers).every((id) => isRPhaseFocusable(id))`) — preset 의 모든 mass multiplier target body 가 `R_PHASE_BODY_ALLOWLIST` 에 박제되어야 enabled. R-Phase 미진입 preset (R3 시점 기준 `jupiter-x10` / `no-jupiter`, jupiter R6 미구현) 이 `disabled` + `aria-disabled="true"` + `data-r-phase-disabled="true"` + `title="R-Phase 진행 시 활성"` + `opacity-50 cursor-not-allowed` 으로 시각/접근성 동시 차별화 (a11y 4축 박제, #402/#403 시리즈 패턴 일관). **sun-half preset 은 활성 유지** — sun = R1 박제 완료 (`R_PHASE_BODY_ALLOWLIST` 에 `'sun'`), mass multiplier (sun × 0.5) 영향이 R1 영역 한정 → R-Phase incremental policy 정합성 (architect ADR §결정 1). PRESETS 배열 자체 변경 0 (PM 박제 §비-범위 4번 보존). ADR [`docs/decisions/20260508-404-scenario-presets-r-phase-guard.md`](docs/decisions/20260508-404-scenario-presets-r-phase-guard.md) §결정 1~4 (sun-half 활성 유지 / 매트릭스 SSoT (c) 둘 다 / a11y 4축 통일 / NO-OP 거부). **#403 ADR Amendment 2026-05-08 동시 박제** — 분기 매트릭스 N=5 → N=7 갱신 (#403 ADR §"Amendment 2026-05-08 — ScenarioPresets 분기 7 추가 (#404)" 섹션 신설, 단일 SSoT 유지). i18n 키 분기 신설 금지 — 한국어 하드코딩 (`/en` 라우팅 미지원 박제, ADR §명시적 비-범위). #402 (Top 1 focus-quick-buttons) + #403 (Top 2 CelestialTree + InfoPanel) + #415 (URL store mutation) 와 직교 — 본 결정은 ScenarioPresets preset 적용 → mass multiplier 변경 경로 (분기 7) 의 UI 측 1차 방어선 추가. R-Phase 진입 시 zero-touch (Concrete Prediction §재현 검증) — `R_PHASE_BODY_ALLOWLIST` 1줄 추가만으로 본 PR 가드 자동 갱신 (`isPresetEnabled` 일반화 추상화 데이터 의존). cross-validate Gemini 호출 architect 단계 박제 완료 (4축 결정 모두 합의, 4 개선 제안 모두 후속 분리)
- **`apps/web/src/components/panels/scenario-presets.test.tsx` 갱신 — ScenarioPresets R-Phase UI 가드 단위 테스트 3 → 15 (#404)** ([#404](https://github.com/coseo12/astro-simulator/issues/404)) — 매트릭스: 기존 3 cases (3개 프리셋 + 원복 버튼 렌더 / 원복 동작) 보존 + 12 신규 cases. sun-half (R1 박제) 활성 + jupiter-x10 (R6 미구현) disabled + no-jupiter (R6 미구현) disabled + a11y 4축 (disabled / aria-disabled='true' / data-r-phase-disabled='true' / title='R-Phase 진행 시 활성') 정합성 + sun-half tooltip 부재 (불필요 노이즈 차단) + 시각 차별화 (opacity-50 / cursor-not-allowed) + disabled preset 강제 click → apply 부작용 0 (HTML disabled 자체 차단) + sun-half click → setEngine(newton) + setMass(sun, 0.5) + sendCommand(J2000) 정상 동작 회귀 가드 + 원복 버튼 (scenario-reset) 항상 enabled (R-Phase 무관 회귀 0 검증). `vi.mock('@/core/sim-context')` + 실 `useSimStore` (`physicsEngine: 'kepler'` + `massMultipliers: { earth: 2 }` 초기 상태). 15/15 PASS 목표
- **`apps/web/scripts/browser-verify-r-phase-allowlist.mjs` 시나리오 6 추가 — ScenarioPresets UI 가드 (#404)** ([#404](https://github.com/coseo12/astro-simulator/issues/404)) — 기존 시나리오 1~5 (UI shortcut / smoke / 강제 click / URL 직접 진입 / CelestialTree+InfoPanel) 보존 + 시나리오 6 신규 3 cells: 6-A 정상 (sun-half preset 활성 — disabled 부재 / aria-disabled='false' / data-r-phase-disabled='false', click 시 physicsEngine='newton' + massMultipliers={sun:0.5} 정상 동작) + 6-B 차단 (jupiter-x10 disabled + a11y 4축 박제 + title='R-Phase 진행 시 활성', force click 시 physicsEngine/massMultipliers 변화 0) + 6-C 차단 (no-jupiter 동일). ScenarioPresets 는 `mode === 'research' || 'sandbox'` 에서만 렌더 → 시나리오 6 진입 시 `mode: 'research'` 전환 + framer-motion 애니메이션 (250ms) 완료 대기 (#403 학습). 3/3 cells PASS 목표
- **CelestialTree + InfoPanel R-Phase UI 가드 추가 — defense-in-depth UI 측 2번째 축 (#403)** ([#403](https://github.com/coseo12/astro-simulator/issues/403)) — `apps/web/src/components/panels/celestial-tree.tsx` + `apps/web/src/components/panels/celestial-info-panel.tsx` 두 곳에 R-Phase allowlist 가드 박제. **CelestialTree**: R-Phase 미진입 body (R3 시점 기준 earth / jupiter / neptune 등) tree 항목이 `disabled` + `aria-disabled="true"` + `data-r-phase-disabled="true"` + `title` (`"<body.nameKo> 은(는) R-Phase 미진입 — 후속 R-Phase 에서 활성화 예정입니다."`) + `opacity-50 cursor-not-allowed` 으로 시각/접근성 동시 차별화. **InfoPanel**: `selected && data && !isRPhaseFocusable(selected)` 분기를 정상 분기 _이전_ 추가 — `data-testid="info-panel-r-phase-blocked"` + body 이름 포함 R-Phase 안내 메시지. 외부 경로 (programmatic command 등) 로 selectedBody 가 R-Phase 외 body 로 set 된 경우의 잔존 정보 panel 노출 차단 (1차 방어선은 #402 UI / #415 url-sync, 본 분기는 잔존 가드). 사용자 D-T2 (#403 발화점, 2026-05-03) "CelestialTree R4+ body 클릭 + InfoPanel selectedBody 잔재" 회귀 직접 가드. ADR [`docs/decisions/20260506-403-r-phase-ui-guard.md`](docs/decisions/20260506-403-r-phase-ui-guard.md) §결정 1~4 (P10 KIND_LABEL 정리 분리 / InfoPanel 메시지 채택 / defense-in-depth 매트릭스 / NO-OP 거부). i18n 키 분기 신설 금지 — 한국어 하드코딩 (`/en` 라우팅 미지원 박제, ADR §명시적 비-범위 line 356). P10 `KIND_LABEL` (line 11~17) / `COLOR_SOURCE_LABEL` (line 20~24) 잔존 보존 (DoD-3 비-범위 분리, #405 통합 후보지). `R_PHASE_BODY_ALLOWLIST` SSoT 재사용 (named export wasm-safe, #402 §Amendment D1 패턴 일관). #402 부모 ADR §결정 2 (UI 가드, 1차 방어선 — focus-quick-buttons) + §결정 3 (scene 가드, 2차 방어선) + #415 (url-sync 가드, 3번째 방어선) 와 직교 — 본 결정은 분기 2 (CelestialTree) + 분기 3 (InfoPanel) 의 UI 측 1차 방어선 추가. R-Phase 진입 시 zero-touch (Concrete Prediction §re-verify) — `R_PHASE_BODY_ALLOWLIST` 1줄 추가만으로 본 PR 가드 자동 갱신
- **`apps/web/src/components/panels/celestial-tree.test.tsx` 신규 — CelestialTree R-Phase UI 가드 단위 테스트 0 → 12 (#403)** ([#403](https://github.com/coseo12/astro-simulator/issues/403)) — 매트릭스: R-Phase 박제 body (sun / mercury / venus) 활성 + R-Phase 외 body (earth / jupiter / neptune) disabled + aria-disabled + data-r-phase-disabled + tooltip (body 이름 + R-Phase 메시지) + opacity-50 + cursor-not-allowed + 강제 click 시 focusOn 발행 0 + 활성 click 시 정상 발행 + active 스타일 (selected + 활성 동시) 검증. `vi.mock('@/core/sim-context')` + 실 `useSimStore`. 12/12 PASS
- **`apps/web/src/components/panels/celestial-info-panel.test.tsx` 신규 — InfoPanel R-Phase 가드 단위 테스트 0 → 11 (#403)** ([#403](https://github.com/coseo12/astro-simulator/issues/403)) — 매트릭스: `selectedBodyId === null` info-panel-empty 폴백 (기존 분기 회귀 보호) + R-Phase 박제 body (sun / mercury / venus) info-panel 정상 분기 (R1/R2/R3 회귀 보호) + R-Phase 외 body (earth / jupiter / neptune) info-panel-r-phase-blocked 분기 + 차단 분기 body 이름 정확 박제 (지구/목성 구별) + R-Phase 메시지 박제 + 알 수 없는 body id (data 없음) info-panel-empty 폴백 (R-Phase 분기 미진입). 11/11 PASS
- **`apps/web/scripts/browser-verify-r-phase-allowlist.mjs` 시나리오 5 추가 — CelestialTree + InfoPanel UI 가드 (#403)** ([#403](https://github.com/coseo12/astro-simulator/issues/403)) — 기존 시나리오 1~4 (UI shortcut / smoke / 강제 click / URL 직접 진입) 보존 + 시나리오 5 신규 9 cells: 5-A 정상 CelestialTree (sun / mercury / venus tree 클릭 → selectedBodyId 정상 set + info-panel 정상 분기) + 5-B 차단 CelestialTree (earth / jupiter / neptune tree 항목 disabled + aria-disabled + data-r-phase-disabled + title 박제 + force click 시 store / camera 변화 0) + 5-C 차단 InfoPanel (외부 경로 시뮬레이션 — `window.__simStore.setState({selectedBodyId: <R-Phase 외 body>})` 직접 mutation 후 info-panel-r-phase-blocked 분기 렌더 + R-Phase 메시지 박제). CelestialTree / CelestialInfoPanel 은 `mode === 'research' || 'sandbox'` 에서만 렌더 → 시나리오 5 진입 시 `mode: 'research'` 전환 + framer-motion 애니메이션 (250ms) 완료 대기. 9/9 cells PASS
- **BODY_SCALE R-Phase 정책 ADR 박제 — Behavior Changes: None (정책 박제만, 코드/박제값 변경 0) (#412)** ([#412](https://github.com/coseo12/astro-simulator/issues/412)) — `docs/decisions/20260506-body-scale-r-phase-policy.md` 신규 박제. **본 ADR 은 코드 변경 0 / 박제값 변경 0** — 시각 활성 (BODY_SCALE 박제) vs focus 활성 (R-Phase allowlist #402) **2축 직교 정책 매트릭스** + **R-Phase 진입 의무 5곳 동시 박제 체크리스트** (BODY_SCALE / R_PHASE_BODY_ALLOWLIST / FOCUS_BODIES / R-Phase ADR / CHANGELOG) SSoT 박제. R4 (earth) / R6 (jupiter) / R10 (neptune) 진입 시 본 ADR §"R-Phase 진입 의무 체크리스트" 인용 의무. 사용자 D-T2 (PR #410, 2026-05-04) "행성 표기 비율 실제와 현재 차이" 질문 분석에서 mercury/venus 외 5+ body (earth/jupiter/neptune/mars/saturn/uranus) 가 BODY_SCALE 미박제 → `DEFAULT_BODY_SCALE = 1.0` 적용 → 사실 도달률 0.14% 점 수준 표시 발견 (#397 NO-OP mismatch 진짜 원인 박제). cross-validate (Gemini) 4축 검증 모두 합의 (§1 구조적 완성도 / §2 기술 결정 타당성 / §3 인터페이스 명확성 / §4 확장성 우수, §5 보안 문제 없음, §6 자동화 스크립트 후속 분리 가이드와 일치). 본 ADR §결정 4 — NO-OP 거부 + 정책 ADR 채택 (가치 > 비용). mars/saturn/uranus 의 R-Phase 정의는 별도 후속 이슈 분리 (현재 분면 IV 유지). 자동화 (`pnpm run r-phase:add` CLI) 는 §재검토 트리거 1번 발생 시 (또는 R6 진입 후) 후속 인프라 이슈 분리 가이드 박제
- **`verify:378-focus` 매트릭스 12 → 6 cells 축소 — R-Phase allowlist 동기화 (#424)** ([#424](https://github.com/coseo12/astro-simulator/issues/424)) — `apps/web/scripts/browser-verify-378-focus.mjs` 의 `FOCUS_BODIES = ['sun', 'mercury', 'venus', 'earth', 'jupiter', 'neptune']` (6 body × 2 모드 = 12 cells) → `['sun', 'mercury', 'venus']` (R-Phase R3 진입 완료 body 만, 3 body × 2 모드 = 6 cells). PR #414 (#402 라운드 2) 머지로 simulation-core focusOn 가드가 R-Phase 외 body 의 카메라 동기화를 차단 → 본 매트릭스의 earth/jupiter/neptune 6 cells 가 의도하지 않게 FAIL (DoD-1 frustum + DoD-3 target distance) 하던 잠복 회귀 해소. develop ci.yml 4 commit 잠복 (#414 → #417 → #421 → #422 → #423 빈 commit push 로 재발견, run 25332704505). #411 r1-guard forensic blind spot — r1-guard FAIL 만 추적했고 verify:378-focus 동일 PR #414 회귀 누락. **R-Phase 진입 시 갱신 의무**: R4 (earth) / R6 (jupiter) / R10 (neptune) 진입 시 `R_PHASE_BODY_ALLOWLIST` 와 본 매트릭스 동시 갱신 (파일 docstring + FOCUS_BODIES 주석 박제). 매트릭스 console.log 헤더는 동적 cell 개수로 변경 (`${FOCUS_BODIES.length * MODES.length} cells`). DoD-1~3 검증 로직 자체는 변경 0 (active body 검증 의도 보존)
- **url-sync `?focus=` 파라미터 R-Phase allowlist 가드 추가 — defense-in-depth 3번째 방어선 (store mutation 측면) (#415)** ([#415](https://github.com/coseo12/astro-simulator/issues/415)) — `apps/web/src/core/url-sync.tsx` 의 초기 1회 `?focus=<bodyId>` URL 처리에 `isRPhaseFocusable(urlFocus)` 가드 합류 (옵션 B). R-Phase 미진입 body (R3 시점 기준 earth / jupiter / neptune 등) URL 직접 진입 시 `sendCommand({type:'focusOn'})` + `setSelectedBody()` 둘 다 skip + dev `console.warn` 박제 (`R-Phase 미진입 body — 무시. R_PHASE_BODY_ALLOWLIST: sun, mercury, venus.`). PR #414 (#402 라운드 2) 의 **simulation-core focusOn handler** scene 가드 (2번째 방어선) 가 emit 차단해도 `setSelectedBody(urlFocus)` 직접 호출이 store mutation 을 우회하던 잠복 결함 (PR #414 reviewer 정적 리뷰 권고 3 식별) 해소. line 77+78 의 race condition fallback (sim-canvas mount 전 `useSimCommand` no-op timing gap 보호) 은 보존 — `useSimCommand` race 자체 해결은 후속 이슈 #419. `R_PHASE_BODY_ALLOWLIST` 상수도 `@astro-simulator/core` 에서 named import (#402 §Amendment D1 패턴 일관 — namespace 경유 금지). #402 부모 ADR §결정 2 (UI 가드, 1차 방어선) + §결정 3 (scene 가드, 2차 방어선) 와 직교 — 본 결정은 store mutation 측면 3번째 방어선. ADR [`docs/decisions/20260504-415-url-sync-guard.md`](docs/decisions/20260504-415-url-sync-guard.md) §결정 1 (옵션 B = D2)
- **`apps/web/scripts/browser-verify-r-phase-allowlist.mjs` 시나리오 4 추가 — URL 직접 진입 매트릭스 (#415)** ([#415](https://github.com/coseo12/astro-simulator/issues/415)) — 기존 시나리오 1~3 (UI / smoke / 강제 click) 보존 + 시나리오 4 신규 7 cells: 4-A 차단 (`?focus=earth` / `?focus=jupiter` / `?focus=neptune` → `selectedBodyId === null`) + 4-B 정상 (`?focus=sun` / `?focus=mercury` / `?focus=venus` → `selectedBodyId === <body>`, R1 #329 / R2 #361 / R3 #369 회귀 보호) + 4-C 무효 (`?focus=invalid-body-id` → `selectedBodyId === null`, 기존 R1 가드 회귀 보호). 매 케이스 새 page context — `initialized.current` useRef 우회. 부모 ADR §결정 4 의 동시 박제 절차에 "외부 진입점 가드 의무" 1줄 cross-link 추가 (URL 파라미터 / deep link / programmatic command 진입점 신설 시 가드 통합 + 시나리오 4 매트릭스 갱신 의무)
- **`apps/web/src/core/url-sync.test.tsx` 신규 — url-sync 단위 테스트 0 → 8 (#415)** ([#415](https://github.com/coseo12/astro-simulator/issues/415)) — 매트릭스: `?focus=sun/mercury/venus` 정상 동작 (R1/R2/R3 회귀 보호) + `?focus=earth/jupiter/neptune` 가드 차단 + `?focus=invalid-body-id` 기존 가드 회귀 + `?focus=null` no-op. 모든 가드 분기에서 `vi.spyOn(console, 'warn')` 단언 의무 (cross-validate Gemini §5 권고 — 진단 기능 dev 작동 보장). nuqs `useQueryState` mock + `useSimCommand` mock + 실 `useSimStore` 사용 (`setSelectedBody` 호출 추적). 8/8 PASS (1.27s)
- **R-Phase Body Focus Allowlist 가드 도입 — defense-in-depth (UI + scene 양 측면) (#402)** ([#402](https://github.com/coseo12/astro-simulator/issues/402)) — `packages/core/src/scene/r-phase-allowlist.ts` 신규 SSoT 박제 (`R_PHASE_BODY_ALLOWLIST = ['sun', 'mercury', 'venus']` + `isRPhaseFocusable(bodyId)` helper). UI 측면 (`apps/web/src/components/layout/focus-quick-buttons.tsx`): R-Phase 미박제 body (earth / jupiter / neptune) 버튼이 `disabled` + `aria-disabled="true"` + `data-r-phase-disabled="true"` + tooltip + opacity 50% + cursor-not-allowed 으로 시각/접근성 동시 차별화. scene 측면 (`packages/core/src/engine/simulation-core.ts` `case 'focusOn'`): UI 우회 (URL `?focus=earth` 직접 진입 / 외부 commander) 도 `isRPhaseFocusable` 검사 후 `bodySelected` event emit 차단 + console.warn (URL `?focus=earth` 직접 진입 시 R-Phase 미박제 body 잔재 0 보장). 사용자 D-T2 (#402 발화점, 2026-05-03) "earth/jupiter/neptune 클릭 시 잔재 보임" 회귀 직접 가드. ADR [`docs/decisions/20260504-r-phase-allowlist-guard.md`](docs/decisions/20260504-r-phase-allowlist-guard.md) §결정 1 (SSoT) + §결정 2 (UI 가드) + §결정 3 (scene emit 차단) + §결정 4 (5곳 동시 박제 절차 — R4 진입 시) + §Amendment 결정 D1 (sub-path export 폐기 + namespace re-export 강제, 라운드 2 turbopack `__dirname` SSR 회귀 fix)
- **R-Phase 진입 시 5곳 동시 박제 의무 박제 (#402 라운드 2)** ([#402](https://github.com/coseo12/astro-simulator/issues/402)) — R4/R6/R10 진입 시 5곳 동시 갱신 의무 박제 (라운드 1 의 4곳에서 5번째 wasm-safe 검증 추가): (1) `r-phase-allowlist.ts` body id 추가, (2) 해당 R-Phase ADR §결정 N 에 본 ADR cross-link, (3) `apps/web/scripts/browser-verify-r-phase-allowlist.mjs` expected list 갱신, (4) `CHANGELOG.md` `### Behavior Changes` 박제, (5) WASM 의존 도메인 (scene / physics / render / gpu) 한정 sub-path 추가 금지 검증 — `scripts/verify-core-exports-immutable.sh` 자동 차단. ADR §Amendment 결정 D2
- **`apps/web/scripts/browser-verify-r-phase-allowlist.mjs` 신설 — R-Phase Allowlist 회귀 가드 (#402)** ([#402](https://github.com/coseo12/astro-simulator/issues/402)) — 3종 매트릭스: (1) 박제 body (sun/mercury/venus) 활성 + 미박제 body (earth/jupiter/neptune) `disabled` + `aria-disabled="true"` + `data-r-phase-disabled="true"` 단언, (2) 활성 버튼 click 시 `selectedBodyId === body` smoke, (3) 강제 click (Playwright `force: true` HTML disabled 우회) 시 store/camera 변화 0 (defense-in-depth scene 측면 검증). CLI: `pnpm --filter @astro-simulator/web verify:r-phase-allowlist`. **CI `detect-and-test` job 통합** — `.github/workflows/ci.yml` 에 `next dev -p 3004` 기동 후 검증 step 추가 (verify:378-focus / verify:focus-transition 패턴 일관)
- **`scripts/verify-core-exports-immutable.sh` 신설 — turbopack `__dirname` SSR 회귀 자동 가드 (#402 라운드 2)** ([#402](https://github.com/coseo12/astro-simulator/issues/402)) — `packages/core/package.json` exports field 에 WASM 의존 도메인 (scene / physics / render / gpu) sub-path 추가 시 exit 1. 라운드 1 (PR #407 closed `3eed4e0`) 회귀 메커니즘: wasm-pack `--target nodejs` 출력의 `${__dirname}/physics_wasm_bg.wasm` 가 turbopack module dep graph 변경 시 `/ROOT/...` 가상 path 로 ENOENT → SSR 500. 화이트리스트 (`. / ./coords / ./physics / ./scene / ./gpu / ./ephemeris`) 외 WASM 도메인 sub-path 추가 시 자동 차단. coords / ephemeris / time 등 순수 데이터 도메인은 자유 (Gemini cross-validate Q3 권고 — 스코프 좁힘). **CI `detect-and-test` job 통합** — `.github/workflows/ci.yml` 에 `bash scripts/verify-core-exports-immutable.sh` step 추가
- **focus 전환 시 tier oscillate 회귀 fix — F1+F2 defense-in-depth 적용 (#408)** ([#408](https://github.com/coseo12/astro-simulator/issues/408)) — `packages/core/src/scene/solar-system-scene.ts` 에 (F1) `applyFocusTier(bodyId, cameraDistMeters): Tier` 신규 scene API 박제. `sim-canvas.tsx syncFocusToScene` 헬퍼가 `setFocusOrigin` 직후 + `controller.focusOn` 직전에 호출 → focusOn 의 cam-target tween (300ms) 보간 시작 **전에** final tier 정착 → 보간 중 `updateTierByCamera` 가 동일 tier 반환으로 no-op (race 차단). (F2) `tierTransitionInProgress` closure 변수 + `runTierTransition` 의 `onComplete?: () => void` 콜백 박제 — `setTier` 진입 시 lock=true, cleanup 정상 종료 / fallback timer / visibilitychange 어느 경로로 발동해도 onComplete 가 1회만 호출되어 lock=false (idempotent, `released` 플래그 패턴). lock 활성 시 `updateTierByCamera` 가 no-op 으로 transition 진행 중 재판정 race 차단. 사용자 D-T2 (2026-05-04) frame-by-frame 측정 회귀 (venus → mercury 전환 시 inner→body→inner oscillate 2회, camR 38만 unit jump, target origin reset) 해소. ADR [`docs/decisions/20260504-focus-tier-oscillate-fix.md`](docs/decisions/20260504-focus-tier-oscillate-fix.md) §결정 1 (F1, 의존 역전 (c)) + §결정 2 (F2, lock + onComplete idempotent)
- **`FOCUS_USER_RADIUS_MULTIPLIER` / `FOCUS_USER_RADIUS_MIN_PADDING` 명명 상수 박제 (#408)** ([#408](https://github.com/coseo12/astro-simulator/issues/408)) — `packages/core/src/scene/camera-controller.ts` 의 `desiredRadius = max(meshRadius × 5, meshRadius + 0.01)` 식의 매직 넘버를 명명 상수로 추출 + scene namespace export. `sim-canvas.tsx` 의 `applyFocusTier` cameraDistMeters 산식이 동일 SSoT 1곳 import → camera-controller / sim-canvas 식 drift 차단. tier-transition.ts 의 `FOCUS_RADIUS_MULTIPLIER = 5.9` (V5 달성 정밀값) 와 분리 의도 박제 (user-trigger 경로 한정 ×5 vs tier 전환 경로 ×5.9). Gemini cross-validate 부분 수용 (ADR §결정 1 §매직 넘버 상수화 권고)
- **`apps/web/scripts/browser-verify-focus-transition.mjs` 신설 — focus 전환 회귀 가드 9 cells 매트릭스 (#408)** ([#408](https://github.com/coseo12/astro-simulator/issues/408)) — 3 from × 3 to (sun/mercury/venus, R-Phase v3 활성 body) = 9 cells. 각 cell 마다 from body 안정화 후 to body 클릭 simulation (`simCore.sendCommand({type:'focusOn', bodyId})`) → 1.5초 동안 16ms 간격 frame snapshot (tier / camera.target / camera.radius) 캡처. DoD 3종 단언: (1) tier 전환 횟수 ≤ 1 (oscillate 차단), (2) target origin reset (camTarget < 0.5 unit) 0 회 (sun 케이스 제외), (3) camR jump > 1000 unit 0 회. CLI: `pnpm --filter @astro-simulator/web verify:focus-transition`. **CI `detect-and-test` job 통합** — `.github/workflows/ci.yml` 에 `next dev -p 3003` 기동 후 검증 step 추가 (verify:378-focus 패턴 일관)
- **focus 시 허공 표시 회귀 fix — 옵션 D (A+B defense-in-depth) 적용 (#378)** ([#378](https://github.com/coseo12/astro-simulator/issues/378)) — `packages/core/src/scene/camera-controller.ts` `focusOn()` 에 (A) `desiredRadius < camera.lowerRadiusLimit` 일 때 `lowerRadiusLimit = max(camera.minZ, desiredRadius * 0.5)` 동적 완화 + `mesh.computeWorldMatrix(true)` 명시 호출. `packages/core/src/scene/tier-transition.ts:174` 직전에 (B) `focusMesh.computeWorldMatrix(true) + focusMesh.refreshBoundingInfo()` 추가. 두 옵션 모두 focus 트리거 한정 / 기존 동작 비-침습 (manual zoom 영향 0). venus 관찰 모드 D-T2 라운드 3 (2026-05-03) 보고 회귀 (T1 시점 desiredRadius=0.0104 < lowerRadiusLimit=0.5 clamp → tier 전환 후 mesh 외각 frustum 밖) 해소. 12 cells 매트릭스 (6 body × 2 모드) 실측 12/12 PASS — venus 관찰 / 연구 모두 `camera.isInFrustum(venusMesh) === true` + `camera.radius / meshRadiusWorld = 5.90` (mesh 내부 박힘 차단 비 ≥ 1.5 충족). ADR [`docs/decisions/20260503-378-focus-frustum-fix.md`](docs/decisions/20260503-378-focus-frustum-fix.md) §결정 (옵션 D, defense-in-depth). 실측 박제: [`docs/reports/378-forensic/output-developer.json`](docs/reports/378-forensic/output-developer.json)
- **`apps/web/scripts/browser-verify-378-focus.mjs` 신설 — focus 회귀 가드 12 cells 매트릭스** ([#378](https://github.com/coseo12/astro-simulator/issues/378)) — 6 body (sun/mercury/venus/earth/jupiter/neptune) × 2 모드 (observe/research) = 12 cells 매트릭스. 각 cell 별 DoD 3종 단언: (1) `camera.isInFrustum(focusMesh) === true`, (2) `camera.radius > meshRadiusWorld * 1.5` (mesh 내부 박힘 차단), (3) `camera.target` 이 `focusMesh.absolutePosition` 근방 (오차 ≤ meshRadiusWorld × 5). CLI: `pnpm --filter @astro-simulator/web verify:378-focus` 또는 `node apps/web/scripts/browser-verify-378-focus.mjs`. dev 빌드 의존 (`window.__solarScene.meshes` Map + `mesh.getScene().activeCamera`). **CI `detect-and-test` job 통합** — `.github/workflows/ci.yml` 에 `next dev -p 3002` 기동 후 검증 step 추가 (cross-validate G3 수용 — 사용자 D-T2 재발견 비용 > CI 시간 비용 ROI 명백)
- **R3 라운드 3 D-1 채택 — venus > mercury 사실 비율 강화 (#385, #373 라운드 3 후속)** ([#385](https://github.com/coseo12/astro-simulator/issues/385)) — `BODY_SCALE.mercury` 900 → **700** / `BODY_SCALE.venus` 650 → **800** (D-1 채택, architect 4축 평가 — 사실 비율 도달률 / 4px fallback 안전 마진 / LOD 일관성 / 모바일 누적 disk area). venus/mercury 시각비 1.79배 → **2.83배** (사실 비율 6052/2440 = 2.48배 도달률 72% → **114%**). 사용자 D-T2 (PR #384, 2026-05-01) "전체적인 비율은 개선됨 / 실제 비율적으론 아직 맞지 않는 듯" 부분 통과 → 라운드 3 적극 재조정. mercury 저점 pxDiameter 5.29 px (4px fallback 마진 +1.29 px, D-2 의 2.43배 안전), venus 고점 48.4 px (mid 임계 50 미만 → mid 일관 유지, high 미진입). 모바일 누적 disk area 16.75% (가드 25% 마진 8.25%p). r1-guard `--measure-px-ratio` 임계 갱신 — mercury 6% → **4.95%** / venus 11% → **14.26%** (±5% 마진 정책 보존). forensic ADR [`docs/decisions/20260430-r3-followup-body-proportion.md`](docs/decisions/20260430-r3-followup-body-proportion.md) Amendment 2026-05-03 (라운드 3) SSoT
- **`PX_RATIO_THRESHOLDS` 임계 갱신 (#385 라운드 3 D-1)** ([#385](https://github.com/coseo12/astro-simulator/issues/385)) — `apps/web/scripts/r1-ui-regression-guard.mjs` 의 `PX_RATIO_THRESHOLDS` 박제값 갱신 (mercury 6 → 4.95 / venus 11 → 14.26). 산출 식: `예측값 × 1.05 (±5% 마진 정책)` — mercury 4.71% × 1.05 ≈ 4.95%, venus 13.58% × 1.05 ≈ 14.26%. 라운드 2 SSoT 의 ±5% 마진 정책 보존 (architect ADR Amendment 2026-05-03 라운드 3 §결정 2). R4+ body 추가 시 본 룩업에 1줄 추가만 — body-scale.ts 와 동일 SSoT 패턴
- **billboard alpha mask 적용 — 모바일/데스크톱 사각형 회귀 fix (#391 Phase 2, #379 후속)** ([#391](https://github.com/coseo12/astro-simulator/issues/391)) — `createBodyBillboard` material 에 procedural 원형 alpha mask 적용 (`StandardMaterial.opacityTexture` + `transparencyMode = 1` ALPHATEST + `alphaCutOff = 0.5`). `MeshBuilder.CreatePlane` quad 자체는 유지 (low LOD 정책 변경 없음). #379 Phase 1 (PR #390, screenCoverage 식 정정) 머지 후에도 작은 viewport / 낮은 DPR 환경 (모바일 320×568 ~ 데스크톱 1920×1080 dpr1) 6 cell 에서 mercury (pxDiameter 6.80~12.94) / venus (12.39~15.71) 가 low billboard 잔존하여 정사각형 quad 의 픽셀 그리드 노출이 사용자 D-T2 사각형 회귀 trigger — alpha mask 가 quad 윤곽 → 원형 disc 변환으로 회귀 차단. 8 cell 매트릭스 검증 8/8 PASS (`pnpm verify:391-billboard` 시나리오 D), Phase 1 baseline `verify:379-lod` sun=high 100% / 최대 low ratio 95.8% 보존. r1-guard `--measure-px-ratio` 영향 0 (mercury 6.07% / venus 11.03% 동일). bench:scene 회귀 0 (idle/play/focus 5종 모두 develop tip 대비 +9~+11% 향상, 측정 변동성 안). ADR [`docs/decisions/20260502-391-phase2-billboard.md`](docs/decisions/20260502-391-phase2-billboard.md) §결정
- **billboard alpha mask 4px fallback 임계 박제** ([#391](https://github.com/coseo12/astro-simulator/issues/391)) — `LOD_BILLBOARD_ALPHA_MASK_MIN_PX_DIAMETER = 4` 상수 + `shouldApplyBillboardAlphaMask(pxDiameter)` 헬퍼 export. `runLodPass` 가 매 프레임 측정 + low variant material 의 `opacityTexture` 토글 (≥ 4px → mask 적용 / < 4px → null + `transparencyMode = 0` OPAQUE 사각형 quad 유지). 근거: smoothstep(0.4, 0.5) 의 0.53px 전이 구간이 hardware pixel 1개 미만 → GPU sampler aliasing + sub-pixel flickering 회피 (사용자가 3px 이하에서 원/사각형 구분 불가, 사각형 quad 가 시각 안정성 우위). cross-validate (Gemini) 이견 수용 #1. #385 라운드 3 (mercury/venus 박제값 인하) 진입 시 안전 마진 제공. 단위 테스트 6 case 신설 (`packages/core/src/scene/lod-billboard-alpha-mask.test.ts`)
- **DynamicTexture 64×64 scene 단위 공유 + dispose 책임 박제** ([#391](https://github.com/coseo12/astro-simulator/issues/391)) — `getOrCreateBillboardAlphaMask(scene)` 가 `scene.metadata.__lodBillboardAlphaMask` 캐시로 1회 생성. 24 body 의 low variant material 모두 동일 인스턴스를 `opacityTexture` 로 공유 참조 (≈ 16KB VRAM 단일 박제, per-body 생성 시 24×). scene dispose 시 `disposeBillboardAlphaMask(scene)` 명시 정리 — HMR / navigation 시 텍스처 누수 방지. cross-validate 이견 수용 #2. browser-verify 시나리오 E 검증 (opacityTexture 고유 인스턴스 = 1)
- **`apps/web/scripts/browser-verify-391-billboard.mjs` 신설 — alpha mask 회귀 가드 2종 시나리오** ([#391](https://github.com/coseo12/astro-simulator/issues/391)) — 시나리오 D: 8 cell 매트릭스 (Phase 1 baseline 동일) 에서 mercury/venus 의 pxDiameter ≥ 4px 와 lowVariant.material.opacityTexture/transparencyMode 정합성 검증 / 시나리오 E: scene.metadata 캐시 박제 + opacityTexture 고유 인스턴스 1 (per-body 생성 회귀 가드). CLI: `pnpm verify:391-billboard`. dev 빌드 (`window.__simCore.scene` + `__solarScene.getLodInfo()` 의존)
- **`screenCoverageRadius` 식 정정 — sun=high 100% 회복 (#379 Phase 1)** ([#379](https://github.com/coseo12/astro-simulator/issues/379)) — `packages/core/src/render/lod.ts` 의 edge offset axis 를 world-up (+y) 고정에서 **camera-up basis (invView col 1)** 로 변경. 카메라가 비스듬한 자세 (T1 default 의 ArcRotateCamera 가 ~15° tilt) 에서 world-up 의 view-forward 성분이 NDC y 변화를 흡수해 pixel offset 이 ~50% 작게 측정되던 결함 해소. forensic 매트릭스 (`docs/reports/379-forensic/output.json`, 40 cell) 에서 sun=low 100% / mercury=low 100% / venus=low 100% 였던 회귀가 sun=high 100% (8/8 spot-check, `apps/web/scripts/browser-verify-379-lod.mjs` 시나리오 A) 로 정정. 사용자 D-T2 (#379 모바일 사각형) 의 1차 원인 (sun 이 LOD billboard plane 으로 fallback) 해소. 식 정정 효과 측정 (1280×720 dpr1, T1 default): sun coverage 39.99→**71.08 px** (이론 ≈ 71 일치), mercury 2.43→**4.31 px**, venus 4.41→**7.85 px**. mercury/venus 는 박제값 (mercury=900 / venus=650, 라운드 2) 환경에서 여전히 mid 임계 (8) 미달 → 후속 #385 라운드 3 영역 (architect ADR §재검토 #4 박제). r1-guard `--measure-px-ratio` 결과는 BBOX-based `boundingSphere.radiusWorld` 사용으로 식 fix 영향 0 (mercury 6.07% / venus 11.03% 측정값 동일, 라운드 2 baseline 유지)
- **`SolarSystemSceneHandles.runLodPass` cameraUpWorld 박제** ([#379](https://github.com/coseo12/astro-simulator/issues/379)) — `scene.getViewMatrix().clone().invert().m[4..6]` 을 매 프레임 1회 추출해 `screenCoverageRadius` 에 전달. 첫 frame 에 `_viewMatrix` lazy 미초기화 시 `[0, 1, 0]` fallback (ArcRotateCamera default 자세에서 ±10% 이내). 성능 영향 0 (matrix invert 1회/frame, 모든 body 에 재사용)
- **`apps/web/scripts/browser-verify-379-lod.mjs` 신설 — LOD 회귀 가드 3종 시나리오 매트릭스** ([#379](https://github.com/coseo12/astro-simulator/issues/379)) — DoD-Guard-1 (architect ADR `20260502-379-fix-decision.md` §"Phase 1 구현 PR" §"회귀 가드"). 시나리오 A: T1 default 8 viewport (모바일 4 + 데스크톱 4) sun=high 비율 + 최대 low ratio 검증 / 시나리오 B: T3 body focus (지구/화성) → focus body=high 보장 / 시나리오 C: asteroid sub-pixel low billboard 유지 (high 회귀 임계 ≤ 5). CLI: `pnpm verify:379-lod` (또는 `pnpm --filter @astro-simulator/web verify:379-lod`). baseline `apps/web/scripts/__baselines__/lod-379.json` 박제 + sun=high 비율 5%p 하락 시 회귀 검출. dev 빌드 (`__solarScene.getLodInfo()` 의존, #388 API)
- **`screenCoverageRadius` 시그니처 확장 — `cameraUpWorld?: Vec3Double` 추가 (선택)** ([#379](https://github.com/coseo12/astro-simulator/issues/379)) — backward compat (부재 시 `[0, 1, 0]` fallback). 단위 테스트 `packages/core/src/render/lod.test.ts` 의 5종 신규 케이스 + #379 forensic SSoT 5종 케이스 추가 (총 lod 테스트 38 → 46). cross-validate 이견 수용 #1 (엣지 케이스: frustum 경계 / sub-pixel asteroid / 카메라 내부) 박제

- **LOD dev overlay 상세 모드 (`?lodOverlay=1`)** ([#388](https://github.com/coseo12/astro-simulator/issues/388)) — body 별 LOD level + screenCoverage(px) + pxDiameter(px) + cameraDistance(km) 4 column 표 박제. 색상 코딩 (high=emerald / mid=amber / low=rose) + `data-lod-level` 속성. 기존 `?debug=draw-calls` 집계 모드는 backwards-compat 으로 유지 (단일 행 H/M/L 분포 박제). **prod bundle DCE 검증**: `LodDevOverlay` 함수 진입 즉시 `if (production) return null` 으로 본체 (`useState`/`useEffect`/JSX) 전체 제거 — `LodDevOverlayImpl` 분리로 hooks 의존 그래프와 prod 분기 격리. `grep -rln "lod-row-\|waiting for first frame" .next/static/` 0 매치 실측. 발화점: PR [#387](https://github.com/coseo12/astro-simulator/pull/387) ([#379] architect 단계) Gemini cross-validate 고유 발견 분리 — `docs/decisions/20260502-379-fix-decision.md` Phase 1 (screenCoverage 식 정정) 디버깅 도구
- **`SolarSystemSceneHandles.getLodInfo()` API 추가** ([#388](https://github.com/coseo12/astro-simulator/issues/388)) — `runLodPass` 매 프레임 갱신. 반환 시그니처 `readonly LodBodyInfo[]` (`id` / `level` / `screenCoverage` / `pxDiameter` / `cameraDistanceMeters`). 내부 버퍼 in-place mutate (재할당 회피, 매 프레임 24+ body × 5 필드 = 120+ assignment). 호출자는 read-only 계약 — mutate 금지. PR #387 reviewer non-blocking #1 (forensic `actualCameraRadius` 일률 35 cell 별 변별) + #2 (`bodyInfo.pixelDiameter` null) 직접 해소 가능 — overlay 가 raw 박제하면 forensic 측정 시 cell 별 차이가 드러남

### Notes

- **LOD overlay tree-shaking 검증 절차** — prod build 후 `grep -rln "lod-row-\|waiting for first frame\|isDetailedOverlayEnabled" apps/web/.next/static/chunks/` 가 0 매치여야 한다. `LodDevOverlay` 의 prod early-return 패턴은 컴포넌트 본체 분리 (`LodDevOverlayImpl`) 가 필수 — 단일 함수 내 hooks 와 prod 분기 공존 시 minifier 가 보수적 회피하여 hooks 의존 그래프 보존, dead branch JSX 가 잔존 (실측 1차 시도에서 발견)
- **`getLodInfo` core API 는 prod bundle 에 포함됨** — `LodBodyInfo` 인터페이스 + `runLodPass` 의 buffer in-place mutation (~30 라인) 은 packages/core scene 정상 API 의 일부로 prod 에서도 호출 가능. dev overlay 만 prod 에서 호출하지 않을 뿐. bundle size 영향 약 +1KB minified (버퍼 mutation 코드만, JSX 0)
- **`__solarScene.getLodInfo` 후방 호환** — 구버전 scene (P11-B v0.13.0~v0.15.0) 에는 `getLodInfo` 부재. dev overlay 가 optional chaining 으로 가드 — `getLodInfo` 미존재 시 `waiting for first frame` 메시지 유지 (#388 vitest 회귀 가드)

> **R3 D-T2 후속 — body 비율 자연화 (2026-05-01, #373 라운드 2 적극 재조정)** — 어제 (2026-04-30) D-T2 사용자 검증 5건 회귀 발견 중 **#1 (sun ↔ mercury / venus 비율 미해소)** 만 본 PR 범위. #378/#379/#380 (회귀 #2~#4) 은 별도 이슈 분리. 선행 PR [#377](https://github.com/coseo12/astro-simulator/pull/377) (옵션 c 보수값 mercury=2000 / venus=1500) D-T2 미통과 → CLOSED → 라운드 2 적극값 (임계 비례 역산 mercury=900 / venus=650) 채택. forensic ADR [`docs/decisions/20260430-r3-followup-body-proportion.md`](docs/decisions/20260430-r3-followup-body-proportion.md) Amendment 2026-05-01 (라운드 2) SSoT.

### Behavior Changes

- **수성/금성/태양 시각 비율 자연화 — 라운드 2 적극 재조정** ([#373](https://github.com/coseo12/astro-simulator/issues/373)) — 박제값 갱신 3건:
  - `BODY_SCALE.sun` 75 → **50** (R1 amendment, 옵션 a) — sun 자체 자연 크기화. 1280×720 brightRatio 4.19% → ~1.86% (R1 ADR Amendment 2026-05-01 §"sunScale 50 점유율 산출")
  - `BODY_SCALE.mercury` 8500 → **900** (R2 amendment 라운드 2, 옵션 c 적극 재조정) — sun 대비 px 비 38% → ~6%. 임계 비례 역산 `2000 × 6/13.5 ≈ 889`
  - `BODY_SCALE.venus` 4000 → **650** (R3 amendment 라운드 2, 옵션 c 적극 재조정) — sun 대비 px 비 45% → ~11%. 임계 비례 역산 `1500 × 11/25.5 ≈ 647`
- **r1-guard `--measure-px-ratio` flag 신설** — body 별 px diameter + sun 대비 px 비 + diskAreaRatio 자동 측정 + 임계 가드. CLI: `pnpm --filter @astro-simulator/web r1:guard:px-ratio` (또는 `node scripts/r1-ui-regression-guard.mjs --measure-px-ratio`). 임계: mercury sun 대비 ≤ 6% / venus sun 대비 ≤ 11% / 모바일 누적 disk area ≤ 25% (sun + mercury + venus). dev 빌드 (`window.__solarScene` 노출) 의존 + `?gpu=a` 강제 진입 (volt #77 false positive 가드). ADR [`20260430-r3-followup-body-proportion.md`](docs/decisions/20260430-r3-followup-body-proportion.md) §결정 2 §5 + [`20260425-r1-ui-pixel-diff-guard.md`](docs/decisions/20260425-r1-ui-pixel-diff-guard.md) Amendment 2026-05-01 §결정 2

### Notes

- **D-T2 사용자 검증 단계 분리** — 본 PR 은 박제값 갱신 + r1-guard `--measure-px-ratio` 신설 + 단위 테스트/빌드/lint PASS 까지. **실 Chrome GUI 수동 검증** 은 qa 단계 또는 사용자 D-T2 직접 (volt #77 — headless 검증만으로 종결 금지)
- **R3 baseline 갱신 별도 후속 PR** — sunScale 50 변경은 캔버스 외 4 영역 (top-nav / shortcut-bar / hud-top-right / hud-bottom-right) 에 직접 영향 0 (canvas 영역 비교 제외 박제, R1 UI pixel-diff guard ADR §결정 4) 이지만 sun mesh 가 shortcut-bar 의 하이라이트 색상에 indirect 영향 가능성 있음. PR CI r1-guard step 미스매치 발견 시 `r1:baseline-bootstrap` workflow_dispatch 1회 실행 → auto PR 생성 별도 머지 (R2 #365 / R3 패턴)
- **회귀 분리 박제 (#378/#379/#380)** — D-T2 5건 회귀 중 비율 미해소 #1 만 본 PR 범위. #2~#4 (Roadmap v3 amendment §"회귀 분리" 박제) 는 별도 이슈로 직교 추적. PR 한 건당 회귀 한 가지만 책임지는 SRP 원칙 (volt #30 Phase 분리 릴리스 리듬 적용)
- **사후 재조정 경로 박제** — 라운드 2 박제값 (sun 50 / mercury 900 / venus 650) 은 임계 한계 정렬 적극값. forensic ADR §재검토 트리거 #1 라운드 2 보강에 후속 적극값 (mercury 700 / venus 500 — sun 대비 ~5% / ~9% 보수 여유) + 옵션 (e) log scaling 우선순위 high 승격 경로 박제. 측정 노이즈 ± 5% 마진 안에 가까스로 통과 시 사용자 평가 정성 (#1 비율 미해소만 해결, #2~#4 별도) 우선

### Docs

- **forensic ADR `20260430-r3-followup-body-proportion.md` Amendment 2026-05-01 (라운드 2)** ([#373](https://github.com/coseo12/astro-simulator/issues/373)) — §재검토 트리거 #1 라운드 2 발동 (선행 PR #377 옵션 c 보수값 D-T2 미통과 → 라운드 2 적극값 채택). 박제값 적극 재조정 + r1-guard 임계 보존 + Cross-validate 결과 (Gemini 2.5 Pro outcome=applied). architect 라운드 2 자체-검증 + 사용자 결정 박제
- **R1/R2/R3 ADR Amendment 2026-05-01 (라운드 2 동반 박제)** — sunScale 50 baseline 갱신 (R1) + mercuryScale 900 (R2 라운드 2) + venusScale 650 (R3 라운드 2). 라운드 1 amendment 본문 보존 (trace = "왜 라운드 1 에서 라운드 2 로 재조정했는가" forensic ADR §"임계 비례 역산" SSoT)
- **r1-ui-pixel-diff-guard ADR Amendment 2026-05-01 (라운드 2)** — sunScale 50 baseline 동반 갱신 (`--measure-sun-coverage` brightRatio 가드 1280×720 ≥ 3% → ≥ 0.5%, sunScale 50 통과 여유 마진) + `--measure-px-ratio` flag 신설 박제

> **R3 사이클 진입 (2026-04-29)** — Roadmap v3 "Incremental Body-by-Body Build" 세 번째 스프린트. 태양 + 수성 (R2) 위에 **금성** 점진 추가. R1+R2 박제 인프라 (BODY_SCALE 룩업 / FOCUS_BUTTONS / focus sync / rebuildOrbitLines / r2-focus-race-guard) 100% 재사용. `venus: 4000` BODY_SCALE 1줄 + `FOCUS_BUTTONS` 1줄 = R2 ADR `20260428-r2-mercury-visualization.md` §결과 Concrete Prediction "R3 추가 시 코드 변경 ≤ 2 라인" **첫 외부 검증 — PASS**. 핵심 6 파일 변경 0 (solar-system-scene.ts / tier.ts / lod.ts / sim-canvas.tsx / celestial-info-panel.tsx / camera-controller.ts). 추가로 R2 머지 시점부터 잠재한 **ambient 라이팅 약점 (#372)** 회귀 fix 동봉 — default 진입 시 행성 그림자측 인지 가능 임계 회복 (옵션 A 정책). PR [#369](https://github.com/coseo12/astro-simulator/pull/369) (R3 anchor + ADR + 시각화 통합 + #372 fix).

### Behavior Changes

- **금성 가시성 진입 — `BODY_SCALE.venus = 4000` 추가** ([#369](https://github.com/coseo12/astro-simulator/issues/369)) — viewport 점유율 1280×720 / 1920×1080 0.692% (DoD 0.5% + 마진 38%), 모바일 (375×667) 2.19%. mercury 시각비 117% (venus 가 mercury 보다 17% 큼 — 과학적 사실 정합), sun 시각비 46% (sun 의 약 1/2). 픽셀 직경 98.91px @ 1280×720. 모바일 누적 차단율 sun + mercury + venus = 16.39% (한계 25% 까지 8.6%p margin). ADR `20260429-r3-venus-visualization.md` §결정 1
- **shortcut bar 6→7 항목 (태양 / 수성 / 금성 / 지구 / 목성 / 해왕성 + reset)** — `FOCUS_BUTTONS` 배열에 mercury 다음 위치 (천체 거리 순) 에 `{ id: 'venus', label: '금성' }` 1줄 추가. R1+R2 패턴 100% 정합 — 키바인딩 무박제, aria 자연 라벨. shortcut-bar dimension 1280: 170→195 (+25px), 모바일 113→128 (+15px). axe 0 위반 (R1+R2 회귀 0)
- **금성 focus / info 패널 / 궤도 라인 자동 일반화** — `solar-system.json` venus 데이터 (이미 박제) + R1 syncFocusToScene helper / CelestialInfoPanel / rebuildOrbitLines 자동 일반화. **핵심 6 파일 변경 0** — R2 ADR Concrete Prediction "R3 추가 시 ≤ 2 라인" 첫 외부 검증 성공. body mesh 머티리얼 default StandardMaterial (단색 — Q2=A 박제). 궤도 라인 색상 `Color3(0.25, 0.28, 0.4)` 일관 (R1+R2 박제값 보존)
- **r2-focus-race-guard body-agnostic 3-body 첫 검증** — 시나리오 1 (sun → mercury) / 2 (mercury → reset) PASS. 3-body 환경 (sun + mercury + venus) 에서 Babylon `Animation.CreateAndStartAnimation` 자동 폐기 동작 유효성 확증 (Q4=A — body id 무관 동일 property name 호출). 시나리오 3 (Animation tween spy) 환경 의존 skip (R2 일관)
- **회귀 #372 ambient 라이팅 강화 — default 진입 행성 그림자측 가시성 floor 회복** ([#372](https://github.com/coseo12/astro-simulator/issues/372)) — `solar-system-scene.ts` ambient.intensity 0.08 → 0.3 (3.75×) + groundColor (0.01, 0.01, 0.02) → (0.15, 0.15, 0.18) 중립 회색톤. R2 (#363, mercury 추가, v0.15.0) 머지 시점부터 잠재한 라이팅 약점이 R3 venus 추가로 가시화. sun.disableLighting=true 환경이라 sun 자체 영향 무 (1280×720 ?gpu=a 점유율 4.12% → 4.19%, +0.07%p — R1 박제 3.87% ± 0.5% 가드 안전). 행성 mesh sun-반대측 평균 luminance 인지 가능 임계 회복. **volt #77 직접 입증** — headless 는 GPU adapter 부재로 tier-c 자동 진입 → sun 1px 점 → 자동화 가드 8/8 PASS 였던 false positive 사례. AMBIENT_INTENSITY / AMBIENT_GROUND_COLOR_RGB 상수 export + `solar-system-scene.test.ts` 회귀 가드 4건 (intensity ≥ 0.25 floor / groundColor 평균 ≥ 0.05 floor / 박제값 정확 일치 2건) 박제 — 임의 하향 조정 시 단위 테스트 차단

### Notes

- **R3 baseline 갱신은 별도 후속 PR 분리 (R2 #365 패턴)** — 본 PR 머지 후 r1-guard step 5 가 의도된 FAIL (shortcut-bar 6→7 dimension 변동 + top-nav DOM nesting 부수효과). Linux CI `r1:baseline-bootstrap` workflow_dispatch 1회 실행 → auto PR 생성 → 갱신 PR 별도 머지. macOS local `--update` 는 폰트 false positive 박제 위험으로 차단 (Amendment v3 §결정 1)
- **D-T2 실 Chrome GUI 수동 검증 사용자 단계 분리** — headless 검증만으로 종결 금지 (volt #77 false positive). 본 PR 은 reviewer/qa 통과 후 사용자가 sun ↔ mercury ↔ venus focus 빠른 전환 + 모바일 (375×667) 인지 가능성 + venus info 패널 ("× 4000 과장 중" + 자전 주기 retrograde 표기) 수동 검증
- **R3 ADR Gemini cross-validate 합의 — viewport-aware scaling 도입 결정 시점 R4 로 박제** — Gemini 권고 1 수용 ("R5 진입 전 검토" → "R4 ADR 박제 시점에 명시적 결정 박제 의무"). 능동적 기술 부채 관리 — 모바일 누적 차단율 한계 25% 가 R5 (mars) 진입 시 도달 위험 → R4 architect 가 도입 / 미도입 / 부분 도입 (모바일 only) 3 후보 비교 의무. R3 ADR §위험·미해결 + §재검토 트리거 #3 박제
- **#372 후속 — planet 가시성 headless 가드 (`?gpu=a` 매트릭스) 후속 이슈 분리 후보** — 본 PR 은 ambient 상수 SSoT 단위 테스트만 박제 (architect 권고 1 수용). headless 환경에서 `?gpu=a` 강제 + mercury / venus mesh 영역 sun-반대측 평균 luminance 임계 측정 자동화는 별도 이슈 (#373 후보 — 메인 사용자 의사 확인 후 분리). volt #77 매트릭스 자동화 후속 이슈도 동일 분리 후보 (R3 ADR §재검토 트리거 #3 후속)

### Docs

- **ADR `20260429-r3-venus-visualization.md` 신규** ([#369](https://github.com/coseo12/astro-simulator/issues/369)) — 610 라인. R3 시각화 결정 6건 통합 (venusScale=4000 / shortcut-bar venus 항목 / orbit 라인 무수정 / focus race body-agnostic / info 패널 자동 일반화 / 비-범위 보호 가드). 11 후보 × 3 viewport venusScale 산출표. R4 Concrete Prediction (earth 단독 = 1 라인 / earth + moon = 0~2 라인). Gemini cross-validate 합의 (6 영역 우수 + S급 ADR + viewport-aware scaling R4 결정 시점 구체화 권고 수용). 후속 발견 분리 (ADR Status workflow Provisional → Accepted 표준화 — priority:medium-low)

## [0.15.0] — 2026-04-28

> **R2 사이클 (2026-04-28)** — Roadmap v3 "Incremental Body-by-Body Build" 두 번째 스프린트. 태양 단독 visible (R1, v0.14.0) 위에 **수성** 점진 추가. R1 박제 인프라 (BODY_SCALE 룩업 / FOCUS_BUTTONS / focus sync / rebuildOrbitLines / r1-guard 매트릭스) 100% 재사용. `mercury: 8500` BODY_SCALE 1줄 + `FOCUS_BUTTONS` 1줄 = R1 §결과 Concrete Prediction "R2 코드 변경 ≤ 3 라인" 자연 검증. PR [#363](https://github.com/coseo12/astro-simulator/pull/363) (R2 anchor) + [#365](https://github.com/coseo12/astro-simulator/pull/365) (baseline 갱신 + Amendment v4 정정) + [#366](https://github.com/coseo12/astro-simulator/pull/366) (agent-browser 가드 — volt #79). 누락된 release entry 박제는 [#373](https://github.com/coseo12/astro-simulator/issues/373) PR 흐름에서 회수 (release version bump 가드 통과 의무).

### Behavior Changes

- **수성 가시성 진입 — `BODY_SCALE.mercury = 8500` 추가** ([#361](https://github.com/coseo12/astro-simulator/issues/361)) — viewport 점유율 1280×720 / 1920×1080 0.612% (DoD 0.5% + 마진 22%), 모바일 (375×667) 1.94%. sun 시각비 약 40% (sun 의 1/2.5 — "수성 < 태양" 자연스러움). 픽셀 직경 84.76px @ 1280×720. ADR `20260428-r2-mercury-visualization.md` §결정 1
- **shortcut bar 5 항목 (태양 / 수성 / 지구 / 목성 / 해왕성)** — `FOCUS_BUTTONS` 배열에 sun 다음 위치 (천체 거리 순) 에 `{ id: 'mercury', label: '수성' }` 1줄 추가. R1 패턴 100% 정합 — 키바인딩 무박제, aria 자연 라벨. axe 0 위반 (R1 회귀 0)
- **수성 focus / info 패널 자동 일반화** — `solar-system.json` mercury 데이터 (이미 박제) + R1 syncFocusToScene helper / CelestialInfoPanel 자동 일반화. 코드 변경 0
- **R2 focus race condition 회귀 가드 신설** — `apps/web/scripts/r2-focus-race-guard.mjs` 3 시나리오 (sun→mercury / mercury→reset / Animation tween 카운트). 단일 body (sun) 환경이라 R1 단독에서 검증 불가했던 다중 body race scenario 처음 도입. ADR §결정 4 의 "Babylon 자동 폐기 신뢰" 회귀 가드. 실측 보정: focusOn 의 property name 은 `cam-target` / `cam-radius`, reset 의 property name 은 `cam-reset-target` / `cam-reset-radius` (camera-controller.ts:91) — 자동 폐기는 focusOn → focusOn 케이스에 한정. focusOn → reset 은 다른 property라 lerp 병행이지만 시작점이 현재 카메라 위치라 자연스러운 보간
- **agent-browser Chrome cleanup 가드 도입** (volt [#79](https://github.com/coseo12/volt/issues/79)) — `.claude/agents/qa.md` 마무리 절차 + CLAUDE.md "프로젝트 고유 보강 교훈" §"sub-agent 이탈의 프로세스 레벨 확장" 블록에 agent-browser 좀비 정리 의무 박제. **sub-agent 루틴**: `browser-test` 스킬로 agent-browser 사용 후 반환 직전 `pgrep -f "agent-browser-chrome-" >/dev/null && pkill -TERM/KILL -f "agent-browser-chrome-"` 실행. **메인 루틴**: sub-agent 복귀 직후 `pgrep -af "agent-browser-chrome-"` 검사 + 발견 시 정리. 사용자 본 Chrome 영향 0 (식별자 `agent-browser-chrome-<UUID>` user-data-dir). **본 세션 (2026-04-28) 실측**: 6 세션 / 52 좀비 / 3일치 누적 → 800%+ CPU. agent-browser 도구 자체 cleanup 이 정상 case 작동하나 sub-agent 비정상 종료 시 lineage 끊긴 좀비 잔존 — `spawned_bg_pids` SSoT 가 직접 spawn PID 만 커버하므로 도구 wrapper child process 별도 가드 (volt #46/#52 의 agent-browser 변형)

### Notes

- **R2 baseline 갱신 + Amendment v4 Concrete Prediction 정정 (R2 후속 사이클, 2026-04-28)** — PR [#363](https://github.com/coseo12/astro-simulator/pull/363) 머지 후 발견된 r1-guard step 5 의도된 FAIL 해소. shortcut-bar 3 viewport (의도 변경 = mercury 5번째 버튼) **+** top-nav 3 viewport (DOM nesting 부수효과 = `<header data-r1-region="top-nav">` 내부에 shortcut-bar 가 child) = **6 PNG 동시 갱신**. hud-top-right / hud-bottom-right 6장은 변경 0 (D-R2 R1 회귀 0 검증). Linux CI `r1:baseline-bootstrap` workflow_dispatch 산출본 사용 (macOS local `--update` 는 폰트 false positive 박제 위험으로 차단)
- **Amendment v4 Concrete Prediction 정정** — 원안 "shortcut-bar 3장만 변경, 다른 9장 변경 0" 이 DOM nesting 가정 누락. 정정: "shortcut-bar 3장 + top-nav 3장 = 6장 동시 갱신 (R3~R10 SSoT)". §위험·미해결 에 nesting 부수효과 박제 + §재검토 트리거 #5 (DOM nesting 가정 무효화) 추가
- **shortcut-bar baseline 갱신은 별도 commit 또는 후속 PR 분리** — Amendment v4 §결정 2 5단계 적용. macOS local 환경에서 `r1-ui-regression-guard.mjs --update` 실행 시 의도 외 영역 (top-nav / hud-top-right / hud-bottom-right) 도 폰트 차이로 갱신 → Linux CI 환경에서만 정합. 본 PR 의 머지 전 reviewer 단계에서 CI green 확인 후 baseline 갱신 절차 별도 진행
- **BODY_SCALE.mercury default 1.0 fallback 테스트 제거** — `body-scale.test.ts` 의 "미정의 body default 1.0" 테스트에서 mercury 사례 삭제 + 다른 body (earth / jupiter / unknown) 로 일반화. R3+ 추가 시 동일 패턴 갱신 의무
- **r2-focus-race-guard.mjs 의 시나리오 3 (Animation tween spy) 환경 의존 skip** — Babylon 글로벌 (`window.BABYLON`) 미노출 환경 (현재 ESM module 빌드) 에서는 spy 설치 불가, soft skip 처리. 시나리오 1, 2 가 race 회귀 가드 본질 (store sync + camera 변화) 보장
- **dev 서버 사용 의무** — r2-focus-race-guard 는 `__simCore` / `__solarScene` 글로벌 (sim-canvas.tsx:252 NODE_ENV 가드) 의존 → `pnpm dev` 환경 필요. p329-qa-focus-lod-guard 와 동일 정책

### Docs

- **ADR `20260428-r2-mercury-visualization.md` 신규** ([#361](https://github.com/coseo12/astro-simulator/issues/361)) — 632 라인. R2 시각화 결정 5건 통합 (mercuryScale=8500 / shortcut-bar / orbit 라인 / focus race / info 패널). 11 후보 × 3 viewport mercuryScale 산출표. R3 Concrete Prediction (코드 변경 ≤ 2 라인 + 단서 조항: venus 머티리얼 분기 예외). Gemini cross-validate 합의 (Q1/Q4 산출 정합 / Q3 R3 단서 조항 추가) + 후속 이슈 #362 (R1 sun 1920×1080 점유율 정정)
- **ADR `20260425-r1-ui-pixel-diff-guard.md` Amendment v4** ([#357](https://github.com/coseo12/astro-simulator/issues/357), [#361](https://github.com/coseo12/astro-simulator/issues/361)) — 192 라인. sentinel 정책 amendment + shortcut-bar baseline 갱신 절차 (Q3=B 통합). 후보 (d) 수동 검토 분리 채택 + R2 직접 적용 5단계 + R3~R10 패턴 SSoT
- **ADR `20260425-r1-ui-pixel-diff-guard.md` Amendment v4 Concrete Prediction 정정** (R2 후속 #361, 2026-04-28) — §결과·재검토 조건 §"Concrete Prediction (R2 PR 자동 재현) — 2026-04-28 정정" + §위험·미해결 nesting 부수효과 bullet + §재검토 트리거 #5 추가. 원안 "shortcut-bar 3장만 변경" → 정정 "shortcut-bar 3장 + top-nav 3장 = 6장 동시 갱신". DOM nesting (top-bar 가 shortcut-bar 의 부모) 자연 부수효과 박제. R3~R10 SSoT

## [0.14.0] — 2026-04-26

> **R1 후속 F-2 (#348) — ci.yml r1-guard step 통합 + Linux baseline 정합 + ADR Amendment v3** — v0.13.1 부트스트래핑 인프라 위에 chicken-and-egg 해소. 모든 PR check 의 `detect-and-test` job 이 R1 UI 회귀 가드를 자동 trigger. PR [#347](https://github.com/coseo12/astro-simulator/pull/347)/[#349](https://github.com/coseo12/astro-simulator/pull/349)/[#350](https://github.com/coseo12/astro-simulator/pull/350)/[#351](https://github.com/coseo12/astro-simulator/pull/351)/[#354](https://github.com/coseo12/astro-simulator/pull/354)/[#355](https://github.com/coseo12/astro-simulator/pull/355) 6 PR 머지 + workflow_dispatch 1회 실증 + 메타 가드 실증 1차 (#356 close, #357 분리).

### Behavior Changes

- **ci.yml `detect-and-test` job 에 R1 UI 회귀 가드 step 5개 통합** ([#348](https://github.com/coseo12/astro-simulator/issues/348), PR [#355](https://github.com/coseo12/astro-simulator/pull/355) `39c896f`) — `verify:no-scientific-grep` 직후에 (1) Rust 툴체인 (`dtolnay/rust-toolchain@stable`, 1.94.1, wasm32-unknown-unknown) (2) Rust 빌드 캐시 (`Swatinem/rust-cache@v2`, packages/physics-wasm) (3) wasm-pack 설치 (`taiki-e/install-action@v2 wasm-pack@0.14.0`) (4) R1 UI 회귀 가드 (Playwright Chromium + `pnpm build` + next start -p 3001 + `r1-ui-regression-guard.mjs`) (5) diff 이미지 업로드 (`actions/upload-artifact@v4`, retention 7 days) — 5개 step 추가. 모든 PR 의 detect-and-test 시간이 약 +100s 증가 (실측 2m10s, ADR §위험 #1 임계 8분의 27%). `if:` 가드: `pnpm-lock.yaml` + `apps/web/scripts/r1-ui-regression-guard.mjs` + `rust-toolchain.toml` + `Cargo.toml` 존재 시에만 trigger. 4 영역 (top-nav / shortcut-bar / hud-top-right / hud-bottom-right) × 3 viewport (1280×720 / 1920×1080 / 375×667) = 12 영역 mismatch ≤ 0.5% 검증. 실패 시 diff PNG artifact 자동 업로드. ADR `20260425-r1-ui-pixel-diff-guard.md` §Amendment v3 (PR [#354](https://github.com/coseo12/astro-simulator/pull/354), commit `9481c9d`)
- **R1 baseline 12 PNG: macOS → Linux CI 캡처본 전환** ([#337](https://github.com/coseo12/astro-simulator/issues/337), PR [#351](https://github.com/coseo12/astro-simulator/pull/351) `d9ae9c0`) — `r1:baseline-bootstrap` workflow_dispatch run 24956759573 (2m1s 완주, ubuntu-latest 환경) 으로 자동 갱신. 로컬 macOS 검증 시 폰트 차이로 false positive 가능 — `SKIP_LOCAL=1` 또는 CI 결과 신뢰
- **메타 가드 실증 1차 — positive control 미확보 사실 박제** (PR [#356](https://github.com/coseo12/astro-simulator/pull/356) close, run 24957820142) — 1글자 텍스트 변경 ('태양' → '태앙') 의 shortcut-bar mismatch 가 0.114~0.197% 로 임계 0.5% 미만 → r1-guard PASS. r1-guard step 자체 작동은 logs (12 영역 × 3 viewport mismatch 측정 출력) 로 확인. sentinel 정책 + 임계값 재검토는 후속 [#357](https://github.com/coseo12/astro-simulator/issues/357) 로 분리. ADR §결과·재검토 조건 §메타 가드 실증 절차 박제

### Docs

- **ADR `20260425-r1-ui-pixel-diff-guard.md` Amendment v3** (PR [#354](https://github.com/coseo12/astro-simulator/pull/354) `9481c9d`) — 247 라인 신규. 핵심 결정 4건 박제: (1) wasm-pack 후보 A (단일 job 통합) (2) ci.yml r1-guard step 5개 형태 (`if:` 가드 + `pnpm build` 보존 + `exit $GUARD_EXIT`) (3) step 위치 `verify:no-scientific-grep` 직후 (4) 메타 가드 실증 절차 (1글자 변경 → fail → PR close — 본 사이클은 미확보, 분리). Concrete Prediction (ci.yml +35~40 / 다른 파일 0 / detect-and-test ≤ 8분) 박제. Gemini cross-validate "S급 ADR" 평가, BLOCK 0건. 후속 이슈 [#352](https://github.com/coseo12/astro-simulator/issues/352) (메타 가드 자동화 = 카나리아) / [#353](https://github.com/coseo12/astro-simulator/issues/353) (diff 이미지 inline 첨부) — 모두 priority:low 보류

### Notes

- **release PR `--merge` 방식** (gitflow 정책, ADR `20260419-release-merge-strategy.md`) — squash 시 develop 과 diverge 발생 + merge-back 강제. merge commit 으로 main tip 이 develop tip 을 직계 조상으로 포함하므로 fast-forward `git push origin main:develop` 만으로 동기화 완료
- **closed 이슈**: [#337](https://github.com/coseo12/astro-simulator/issues/337) (R1 후속 F-1 부트스트래핑) / [#348](https://github.com/coseo12/astro-simulator/issues/348) (R1 후속 F-2 통합)
- **잔여 phase:R1 OPEN 이슈**: #352 / #353 / #357 — 모두 후속 보류, 다음 R-Phase (R2 수성) 진입 가능 시점

## [0.13.1] — 2026-04-26

> **R1 후속 F-1 (#337) 부트스트래핑 인프라 단독 릴리스** — `r1:baseline-bootstrap` workflow 를 default branch (`main`) 에 도달시켜 `workflow_dispatch` 트리거 가능 상태로 진입 (volt #45 함정 회피). 행동 변화는 `SKIP_LOCAL=1` 1건 + 워크플로 신규. R1 후속 F-2 (#348) 는 본 릴리스 머지 + dispatch + baseline 갱신 PR 머지 후 별도 진입 (chicken-and-egg).

### Behavior Changes

- **R1 UI 회귀 가드 baseline CI Linux 전환 인프라 — 부트스트래핑 단계** ([#337](https://github.com/coseo12/astro-simulator/issues/337), PR [#347](https://github.com/coseo12/astro-simulator/pull/347)) — `.github/workflows/r1-baseline-bootstrap.yml` (`workflow_dispatch`, ubuntu-latest 캡처 + `peter-evans/create-pull-request`) 신규. `apps/web/scripts/r1-ui-regression-guard.mjs` 매개변수화: `BASE_URL` 환경변수 계약 헤더 주석 박제 + `SKIP_LOCAL=1 + macOS darwin` 즉시 PASS 종료 (6 라인 변경). `r1-ui-regions.mjs` 0 라인 변경. baseline 12 PNG 는 본 릴리스 머지 후 `r1:baseline-bootstrap` workflow_dispatch 1회 실행으로 자동 갱신 PR 생성 (Linux 캡처본 교체). 로컬 macOS 검증 시 폰트 차이 false positive 가능 — `SKIP_LOCAL=1` env var 또는 CI 결과 신뢰. **`ci.yml` 의 r1-guard step 통합은 본 PR 비-범위** — chicken-and-egg 회피 (Linux baseline 갱신 PR 머지 후 별도 후속 PR 에서 통합. `pnpm build` 가 detect-and-test job 에 없는 wasm-pack 의존을 끌어오는 추가 위험도 후속 PR 에서 wasm-pack 설치 step 분리로 해소). ADR `20260425-r1-ui-pixel-diff-guard.md` §Amendment 2026-04-26

## [0.13.0] — 2026-04-26

> **R1 사이클 (2026-04-25 ~ 2026-04-26)** — Roadmap v3 "Incremental Body-by-Body Build" 첫 스프린트. 태양 가시성 복구 + 회귀 가드 인프라. 8 PR 머지 (#330, #331, #332, #338, #339, #340, #342, #344).

### Fix

- **billboard variant `bodyScale` 분리** ([#333](https://github.com/coseo12/astro-simulator/issues/333), Phase 2) — `createBodyBillboard` 의 `diameter` 식에서 `bodyScale` 곱셈 제거. sphere/mid variant 는 그대로 유지 (시각 과장 책임 단독). billboard 는 sub-pixel draw call 절감 책임 단독 — 책임 직교화. focus 강제 해제 + 1 AU+ 카메라 거리 + 픽셀 경계 부족 edge case 에서 거대 quad 회귀 차단 (PR [#332](https://github.com/coseo12/astro-simulator/pull/332) 검증 중 발견된 시각 회귀의 근본 해결). ADR `20260425-r1-sun-visualization.md` §"Phase 2 결정 (#333)" amendment 참조. 신규 단위 테스트 (`packages/core/src/scene/body-scale-variants.test.ts`, 9 케이스) drift 방어
- **store-scene 동기화 단일 경로 통합** ([#334](https://github.com/coseo12/astro-simulator/issues/334) + [#335](https://github.com/coseo12/astro-simulator/issues/335)) — `SimulationCore.setCameraHandlers(focus, reset, setRadius)` → `setCameraRadiusHandler(setRadius)` 단일 인자로 단순화 + 리네이밍. focus / resetCamera 콜백 폐기 → `useSimStore.subscribe(selectedBodyId)` 분기가 scene focus / 카메라 reset 단일 책임. `syncFocusToScene(bodyId)` helper 추출 (마운트 직후 1회 sync 와 subscribe 분기 식 공유, DRY). `case 'focusOn'` / `case 'resetCamera'` 의 `bodySelected` event emit 은 보존 — store sync 경로 (core-adapter → setSelectedBody) 의존. **이중 호출 해소**: 클릭 시 `controller.focusOn` 1회만 호출 (이전 2회). `setSelectedBody(null)` 시 `controller.reset` 1회 (이전 2회 또는 미래 info-panel close 누락 가능성). PR #332 Phase 1 fix `acfcb74` 의 임시 해결책 (subscribe + setCameraHandlers 이중 경로) 을 정식 통합으로 대체. ADR `20260425-r1-store-scene-sync-unification.md` §결정 1~6. 회귀 가드: `simulation-core-camera-sync.test.ts` 6 케이스 (이벤트 emit / 핸들러 호출 횟수 / `setCameraHandlers` 부활 방지)

### Chore

- **P11-C QA 진단 스크립트 박제 + 임시 벤치 폐기** ([#290](https://github.com/coseo12/astro-simulator/issues/290), PR [#330](https://github.com/coseo12/astro-simulator/pull/330) `1b4f6d6`) — `apps/web/scripts/p290-{diag-visibility, qa-console-errs, qa-idle-fps, qa-real-chrome}.mjs` 4건 회귀 가드용 정식 추적. phase 라벨 없는 임시 벤치 산출물 (`docs/benchmarks/2026-04-24T08-*.json`) 3건 폐기
- **Harness v2.29.1 → v3.6.0 업데이트** ([volt #77](https://github.com/coseo12/volt/issues/77), PR [#338](https://github.com/coseo12/astro-simulator/pull/338) `9d818e9`) — v3.0.0 책임 분리 6c 수동 마이그레이션 완료. lessons 9개 / 가이드 2개 / frozen verify 4개 신규. ci.yml user-only 격리 (`docs/harness-ci-migration.md`). harness-guards.yml lib 부재 시 skip 임시 패치 (commit `a8f75d4`)

### Docs

- **R1 태양 가시성 ADR 2편 박제** ([#329](https://github.com/coseo12/astro-simulator/issues/329), PR [#331](https://github.com/coseo12/astro-simulator/pull/331) `c001ac1`) — 시각화 ADR (`docs/decisions/20260425-r1-sun-visualization.md`) + 회귀 가드 ADR (`docs/decisions/20260425-r1-ui-pixel-diff-guard.md`). 4 결정 (sunScale 75 / 상수 위치 / 곱셈 순서 / pixel diff 임계값) 박제. Concrete Prediction (R2 추가 시 4 파일 0 라인) 박제
- **ADR `20260425-r1-sun-visualization.md` Amendment** ([#336](https://github.com/coseo12/astro-simulator/issues/336), PR [#339](https://github.com/coseo12/astro-simulator/pull/339) `f427f88`) — §결과·재검토 조건 보강: 재검토 트리거 #6 ("[#333](https://github.com/coseo12/astro-simulator/issues/333) Phase 2 처리 시점 도래") + §위험·미해결 sub-섹션 신규 ("Phase 2 미해결 사항 (#333)")

### R1 태양 가시성 복구 (Roadmap v3 — 사용자가 명시적으로 visible)

메인 이슈: [#329](https://github.com/coseo12/astro-simulator/issues/329) · ADR: [`20260425-r1-sun-visualization.md`](docs/decisions/20260425-r1-sun-visualization.md) (시각화) + [`20260425-r1-ui-pixel-diff-guard.md`](docs/decisions/20260425-r1-ui-pixel-diff-guard.md) (회귀 가드)

PR [#332](https://github.com/coseo12/astro-simulator/pull/332) (`6e7382e`) — 기본 진입 화면 태양 가시성 복구 + UI 회귀 가드 인프라. P12 폐기 후 incremental body-by-body build 의 첫 body.

#### Behavior Changes

- **`BODY_SCALE.sun = 75` 시각 과장 박제** (`apps/web/src/constants/body-scale.ts`) — 1 AU 거리 카메라 시점에 viewport 점유율 ≥ 3% (1280×720 / 1920×1080 / 375×667 3 viewport 검증). 이전 sub-pixel ~1px → 가시 sphere
- **`packages/core` ↔ `apps/web` 의존성 역전 방지** — `bodyScale: (id) => number` callback DI 주입. `packages/core` 는 시각 과장 데이터를 모름 (시각/물리 계층 분리)
- **`sim-canvas.tsx` `selectedBodyId` ↔ scene focus 동기화** (commit `acfcb74` Phase 1 fix) — `useSimStore.subscribe` + 마운트 직후 1회 sync. URL `?focus=` 진입 시 LOD 분기 정상 high 적용. 이전 동기화 누락으로 거대 quad 회귀
- **R1 회귀 가드 인프라** (`apps/web/scripts/r1-{ui-regression-guard, ui-regions}.mjs` + `__baselines__/r1/` 12 PNG) — pixelmatch threshold=0.1 / mismatch ≤ 0.5% / 4 영역 × 3 viewport
- **focus LOD 회귀 자동 가드** (`apps/web/scripts/p329-qa-focus-lod-guard.mjs`, commit `9516b68`) — `channel: 'chrome'` 강제 + sphere/billboard 자동 판별. volt #33 (headless swiftshader 함정) 변형 false positive 차단
- **info-panel sun 5 항목 표시** — mass / radius / luminosity / spectral class / dataSource (IAU 2015). `?mode=research` 모드 한정 (observe 모드 SidePanels 숨김 — R1 비-범위)
- **`focus=sun` URL override + dev 경고** — 허용 body id 외 무시 + 콘솔 경고
- **HUD `× 75 과장 중` 명시 표시** — 사용자 친화 표현 (Gemini 교차검증 개선 제안 2 반영)
- **Q3=C 비-범위 자동 가드** (`apps/web/scripts/verify-r1-tier-untouched.sh`) — `tier.ts` / `tier-transition.ts` / `lod-body-thresholds.ts` 0 라인 변경 검증. PR 머지 전 강제

### Harness 워크플로 (volt #77 반영, v3.6.0)

- **메인 오케스트레이터 단계 게이트 신규** (PR [#338](https://github.com/coseo12/astro-simulator/pull/338)) — `developer → reviewer → qa → 사용자/머지` 순서 강제. developer self-compare 자명 PASS 함정 차단. 예외: docs only / chore. CLAUDE.md `### sub-agent 검증 완료 ≠ GitHub 박제 완료` line 287 박제
- **에이전트 3개 갱신** — `.claude/agents/{pm, qa, reviewer}.md` 행동 정의 v3.6.0 정합
- **스킬 2개 갱신** — `.claude/skills/{cross-validate, run-tests}/...` 절차 정합

### 분류

- PR [#330](https://github.com/coseo12/astro-simulator/pull/330): PATCH (회귀 가드 스크립트 박제, 행동 변화 없음)
- PR [#331](https://github.com/coseo12/astro-simulator/pull/331): PATCH (ADR docs only)
- PR [#332](https://github.com/coseo12/astro-simulator/pull/332): **MINOR** (UI 행동 변화 + 회귀 가드 인프라 신규)
- PR [#338](https://github.com/coseo12/astro-simulator/pull/338): **MINOR** (메인 오케스트레이터 게이트 룰 + 에이전트/스킬 갱신)
- PR [#339](https://github.com/coseo12/astro-simulator/pull/339): PATCH (ADR amendment, 문서 보강만)
- PR [#340](https://github.com/coseo12/astro-simulator/pull/340): PATCH (CHANGELOG 소급 박제, 문서 보강만)
- PR [#342](https://github.com/coseo12/astro-simulator/pull/342) (#333 Phase 2): **MINOR** (billboard `bodyScale` 분리 — 시각 행동 변화 + drift 방어 단위 테스트 9 케이스)
- PR [#344](https://github.com/coseo12/astro-simulator/pull/344) (#334 + #335): **MINOR** (`setCameraHandlers` → `setCameraRadiusHandler` 내부 API 리네이밍 + 시그니처 단순화 + 행동 변화 — 이중 호출 1회로 단일화)

### Notes

- R1 후속 5건 ([#333](https://github.com/coseo12/astro-simulator/issues/333), [#334](https://github.com/coseo12/astro-simulator/issues/334), [#335](https://github.com/coseo12/astro-simulator/issues/335), [#336](https://github.com/coseo12/astro-simulator/issues/336), [#337](https://github.com/coseo12/astro-simulator/issues/337)) — R2 (수성) 진입 전 처리 권고. #333 / #334 / #335 / #336 완료, **#337 (CI Linux baseline 부트스트래핑) 만 잔존**
- 109건 `상위에서 삭제됨` 분류 (harness v3.6.0 자가 점검 결과) — 별도 라운드 처리 권고. `.claude/skills/capture-volt/SKILL.md` / `.claude/commands/volt.md` 보존 우선

#### Behavior Changes (CHANGELOG 소급 박제 자체)

None — 문서 보강만 (PATCH). 본 박제 자체는 코드/에이전트 행동 변화 없음. 미래 release 시점 박제 누락 방지.

## [0.12.0] — 2026-04-23

### P12-B 8D 카메라 dolly 애니메이션 (Display-Relative Scale Unification Phase B)

메인 이슈: #298 · ADR: [`docs/decisions/20260423-display-relative-scale-unification.md`](docs/decisions/20260423-display-relative-scale-unification.md) §3 (배선 원리) / §Phase 분리 / §Concrete Prediction

PR #304 (`208f5cb`) — Q8=8D 카메라 dolly 병행 interp + 입력 잠금. Phase A 의 Tier 엔진 기반 (v0.11.0) 위에 integration.

#### Behavior Changes

- **`runTierTransition` 신규 — scene scale 즉시 setAll + `camera.radius` 300ms ExponentialEase interp 병행** (`packages/core/src/scene/tier-transition.ts`) — apparent size 불변 수식 `radius_new = radius_old / ratio` (`ratio = renderScale_new / renderScale_old`) 로 focus body 화면 크기 유지. tier 전환 시 `scene.detachControl()` + `onAnimationEnd` / `setTimeout(lockMs=500)` 이중 해제. Pending tween 취소 (`scene.getAnimatableByTarget(camera).stop()`) + `document.visibilitychange` 핸들러 (idempotent attachControl)
- **`setTier` 가 `runTierTransition` 호출로 전환** (`packages/core/src/scene/solar-system-scene.ts:436`) — 기존 `scaling.setAll` 즉시 반영은 유지하되 camera dolly 병행 추가. `isArcRotateCamera` 런타임 타입 가드
- **`focusOn` JSDoc 에 Phase B tier 연계 맥락 박제** (`packages/core/src/scene/camera-controller.ts:44`) — user-trigger focus 경로 (`desiredRadius = meshRadius*5`) 는 유지. tier 전환 시 radius 재계산 경로는 `runTierTransition` 위임
- **카메라 `minZ` 재조정** — tier 전환 전 `cam.minZ = radius_new * 0.01` 적용. `radius_new < minZ` clamp 충돌 방어 (V5 달성 센서)

#### DoD 실측 (P12-B Phase B)

| DoD                                      | 실측                                                                | 상태 |
| ---------------------------------------- | ------------------------------------------------------------------- | ---- |
| V5 T3 Body 지구 세로 40% ±5% (304~336px) | **322px**                                                           | PASS |
| A1 focus 중심 편차 ≤10px                 | **0.0px**                                                           | PASS |
| C1 apparent size 변동 ≤5%                | 수식 단위 테스트 (`tier-transition.test.ts` 11건, `1e-12` 상대오차) | PASS |
| C2 fps<30 프레임 ≤2                      | canvas 비검정 + console.error 0 (Level 1)                           | PASS |
| C3 전환 ≤500ms                           | QA 독립 재측정 lock 373.5ms / click→reattach 506ms                  | PASS |
| C4 입력 잠금 + 100ms 내 재활성           | detachControl during=false / attachControl after=true (Level 2)     | PASS |

위험 3건 해소: pending tween 연쇄 (getAnimatableByTarget.stop 구현) / 탭 비활성 영구 잠금 (visibilitychange + fallback timer 이중 방어) / minZ clamp (`radius_new * 0.01` 재조정).

### P12-C Display-Relative Scale Unification 완결 (Phase C)

메인 이슈: #298 (auto-close) / #288 (auto-close) · ADR Amendment: [`docs/decisions/20260423-display-relative-scale-unification.md`](docs/decisions/20260423-display-relative-scale-unification.md) §Amendment / [`docs/decisions/20260422-floating-origin.md`](docs/decisions/20260422-floating-origin.md) §Amendment · 회고: [`docs/retrospectives/p12-retrospective.md`](docs/retrospectives/p12-retrospective.md)

### Behavior Changes

#### UI 제거 — 단일 모드 전환 완결 (R1/R2/R5)

- **`ViewModeSwitcher` / `ScaleBadge` / `OnboardingTooltip` / `ScientificModeNotice` 4종 UI 컴포넌트 제거** — `apps/web/src/components/layout/` 에서 파일 + 테스트 총 8건 삭제. `app-shell.tsx` 의 import / render 참조 제거. 단일 모드 채택으로 "과장 모드 토글" UX 폐기
- **`sim-store.viewMode` 필드 + `setViewMode` action + `ViewMode` 타입 제거** — Zustand store 의 뷰 모드 축 완전 소멸. `useSimStore` 소비자 코드 (`sim-canvas.tsx` / `about-modal.tsx` 등) 에서 viewMode 구독 제거
- **URL `?view=scientific|educational` 파라미터 폐기 (backward-ignore)** — `url-sync.tsx` 에서 `?view=` 경로 제거. 기존 북마크는 파라미터를 조용히 무시하고 단일 모드로 자연 진입 (에러 없음, CRITICAL UX 방어)
- **`html[data-view-mode]` 어트리뷰트 제거** — `apps/web/app/[locale]/layout.tsx` 에서 `data-view-mode="educational"` 제거. CSS / E2E selector 에서 `data-view-mode` 참조 없음 확인
- **`SolarSystemSceneHandles.setViewMode` API 제거** — `packages/core/src/scene/solar-system-scene.ts` 에서 backward-compat 유지하던 deprecated API 완전 소멸. 호출 경로 (`sim-canvas.tsx`) 동반 제거
- **`AboutModal` 단일 모드 컨텍스트 재작성** — 과장 배수 요약 테이블 섹션 제거, "스케일 정책" 섹션 (IAU 실측 고정 + 3단 tier 자동 전환) 추가
- **R1 회귀 가드 CI 통합** — `scripts/verify-no-scientific-grep.mjs` 신규. `packages/` + `apps/` 범위 활성 코드 라인에서 `scientific` 식별자 / 리터럴 재도입 시 exit 1. 주석(역사 맥락) 은 허용. CI `detect-and-test` 에 `R1 회귀 가드` step 추가

#### Reviewer 이관 하드닝 (M1 / m1 / m3)

- **M1 — `setTier` 가 `runTierTransition` cleanup 클로저 저장** (`solar-system-scene.ts`) — 연쇄 전환 race 방지. `pendingTierCleanup` 변수에 이전 cleanup 보관, 다음 전환 진입 시 `pendingTierCleanup?.()` 선행 호출. `tier-transition.test.ts` 에 "연쇄 전환 cleanup 호출" 단위 테스트 3건 추가 (정상 / idempotent / 버그 재현 대조)
- **m1 — visibilitychange JSDoc 문구 완화** (`tier-transition.ts:230-240`) — "fallback timer 와 이중 방어 (defense-in-depth). 둘 중 먼저 도달한 쪽이 release" 로 재작성. 구현-주석 drift 지표로서 정확도 ↑
- **m3 — `TIER_TRANSITION_EASE` module-level const hoisting** (`tier-transition.ts`) — `camera-controller.ts:#easing` 생성자 1회 생성 패턴과 일관성. `ExponentialEase` 는 stateless 하여 공유 안전

#### QA suggestion #1 — C3 측정 방식 교체

- **`scripts/browser-verify-tier-transition.mjs` C3 측정 교체** — 기존 "radius 5프레임 <1% stable" 감지 (ExponentialEase tail + polling IPC 오버헤드 포함) 를 `_alreadyAttached` 폴링 기반 click→reattach 직접 측정 (10ms 폴링, 1500ms 예산) 으로 교체. THRESHOLD 600ms (durationMs=300 + lockMs=500 마진 + 100ms 측정 오차 버퍼). 기존 radius 안정화 기준은 WARN 레벨 부수 지표로 병기

#### 문서 Amendment (D1 / D2 / D3 / D4)

- **D1** — ADR `20260423-display-relative-scale-unification.md` §Amendment 2026-04-23 박제 — Phase A/B/C 실측 결과 + §Concrete Prediction 재현 결과 (3/4 PASS, #3 은 P11-B 시점으로 이월) + Q10 Floating Origin 확정 (간소화 유지, 제거 아님) + QA/Reviewer/developer 이관 항목 처리 결과
- **D1-b** — ADR `20260422-floating-origin.md` §Amendments 1줄 추가 — "P12 에서 역할 축소. T3 body tier primary, T1/T2 no-op"
- **D2** — `docs/principles/fact-first.md` §Amendments 2026-04-23 박제 — 단일 모드 전환으로 `educational`/`scientific` 이중 모드 폐기, §예외 3건은 모든 tier 에 항시 적용, 과장 해제는 billboard marker overlay (P11-B) 로 이관. §"`scientific` 모드 UX 보호" 섹션은 역사 맥락 보존 용으로 유지
- **D3** — `docs/phases/roadmap-v2-solar-precision.md` renumber — P12 Display-Relative Scale Unification (완료) / P13 Texture Pipeline (원 P12) / P14 토성계 (원 P13) / P15 천왕성·해왕성계 (원 P14) / P16 소행성대+카이퍼대 (원 P15) / P17 배포+기술부채 청산 (원 P16). 이력 문서 (`p10-plan.md` / `p10-retrospective.md` / 과거 commit message) 는 retrofit 금지 (당시 판정 맥락 보존)
- **D4** — ADR §Concrete Prediction 재현 결과 표 박제 (ADR §Amendment (b) 에 포함)

#### 회고 문서

- **`docs/retrospectives/p12-retrospective.md`** 신규 — CLAUDE.md 마일스톤 회고 루틴 4섹션 (달성도 / 잘된 것 / 어려웠던 것 / 다음 인수인계). Phase A/B/C 통합 회고 + 후속 이슈 3건 (#305/#306/#307) 경로 박제

### 후속 이슈 (Phase C 에서 분리)

- **#305** — P11-B followup `lowerRadiusLimit` 원복 누락 재검토 (Reviewer m2)
- **#306** — P12 followup `FOCUS_RADIUS_MULTIPLIER` viewport/fov 동적화 (developer suggestion #1)
- **#307** — P12 followup browser-verify focus 버튼 확장 + minZ clamp 작은 body 재검증 + fps HUD 직접 측정 (QA suggestion #2/#3)

### DoD 실측 (P12-C Phase C)

| DoD                             | 상태  | 증거                                                                              |
| ------------------------------- | ----- | --------------------------------------------------------------------------------- |
| R1 `scientific` 활성 코드 hit 0 | PASS  | `node scripts/verify-no-scientific-grep.mjs` — 157 파일 스캔 0 건                 |
| R2 UI 4종 제거                  | PASS  | `rg 'ViewModeSwitcher\|ScaleBadge\|OnboardingTooltip\|ScientificModeNotice'` 0 건 |
| R5 fact-first §Amendment        | PASS  | `docs/principles/fact-first.md` §Amendments 2026-04-23 entry                      |
| M1 연쇄 전환 cleanup            | PASS  | `tier-transition.test.ts` 신규 describe 3건 PASS                                  |
| D1/D2/D3/D4 박제                | PASS  | 각 문서 §Amendment 섹션 박제                                                      |
| 회고                            | PASS  | `docs/retrospectives/p12-retrospective.md` 4섹션                                  |
| typecheck                       | PASS  | `pnpm -r typecheck` 0 errors                                                      |
| 테스트                          | PASS  | `pnpm -r test` 328 tests (core 226 + web 97 + shared 4 + physics 1)               |
| 빌드                            | PASS  | `pnpm build` Next.js 16.2.3 성공                                                  |
| 한글 U+FFFD                     | CLEAN | `pnpm check-encoding` 0 건                                                        |

### auto-close 대상

- **#298** P12 Display-Relative Scale Unification (Phase A/B/C 통합 완결)
- **#288** P11-A Floating Origin (scientific 모드 jitter 해소 목표가 단일 모드 전환으로 근본 원인 소멸)

## [0.11.0] — 2026-04-23

### P11-A Floating Origin + P12-A Tier 엔진 기반 (Display-Relative Scale Unification Phase A)

메인 이슈: #288 (P11-A Floating Origin) / #298 (P12 Scale Unification 계약) · ADR: [`docs/decisions/20260422-floating-origin.md`](docs/decisions/20260422-floating-origin.md) / [`docs/decisions/20260423-display-relative-scale-unification.md`](docs/decisions/20260423-display-relative-scale-unification.md) · 원칙: [`docs/principles/fact-first.md`](docs/principles/fact-first.md)

4 PR 누적 (P11-A + bench remeasure + P12 ADR + P12-A Phase A):

- **PR #291 (P11-A Floating Origin)** — scientific 모드 float32 jitter 해소. camera origin 동적 shift (focus body primary + free-fly 1 AU threshold safety net). Zustand / Rust engine / worldPositions 는 heliocentric 절대 m 유지 (ADR §3 주석 계약). `__floatingOrigin` / `__solarScene.floatingOrigin` 전역 dev 노출. 관련 이슈 #271 closed. 후속 #294 (non-focus fps 30~40% 회귀) / #295 / #296 / #297 분리
- **PR #293 (bench baseline 재측정)** — GH Actions ubuntu × 10 회 median 으로 `docs/benchmarks/baseline.json` 갱신. `bench-baseline-remeasure` workflow dispatch 구조. #225 closed
- **PR #300 (P12 ADR 박제)** — Display-Relative Scale Unification 결정 매트릭스 + 5축 후보 비교 + Concrete Prediction 4건 + Q10 float32 정밀도 수식 + Phase 분리 판정 + 재검토 조건 10건. PM 3 라운드 Q&A 수렴 (명확도 52 → 5/5) + Gemini 교차검증 적용
- **PR #301 (P12-A Tier 엔진)** — `tier.ts` 신규 (182 LoC, Solar/Inner/Body 3단) + `SCENE_UNIT_PER_METER` 동적화 + kind 차등 (`visual-scale.ts`) 폐기. rings/asteroid-belt tier 비율 전파 (host.scaling + per-call 주입). ScaleBadge 거짓 UI 제거 (문구 "실측 비율 1.0" 재정의)

### Behavior Changes

#### P11-A Floating Origin (#291)

- **scientific 모드 jitter 해소** — 목성/해왕성 focus 상태 카메라 pan 시 픽셀 양자화 제거. body 중심이 scene 원점 근처에서 렌더되어 float32 유효숫자 손실 없음
- **Floating Origin primary follow** — focus body 는 매 프레임 scene 원점 근처 (local 좌표 ≤ 1e5 m) 유지. 단, Zustand / Rust engine state 는 Heliocentric 절대값 유지 (정보 패널 거리 표시 변함 없음)
- **safety net 1 AU threshold** — free-fly 탐색 중 카메라 1 AU 이상 이동 시 origin shift. focus 상태에서는 primary 가 우선
- **`SolarSystemSceneHandles` API 확장** — `floatingOrigin` + `setFocusOrigin(bodyId)` 2 field 추가
- **`FloatingOrigin` API 확장** — `setOriginToBody(world)` + `onOriginShift(listener)` 2 메서드 추가 (기존 `update` / `toLocal` / `toWorld` 변경 없음)

#### P12-A Display-Relative Scale Unification 기반 (#301)

- **body 시각 과장 완전 제거** — `educational` 모드의 per-body scale 팽창 (planet ×500, moon ×500, dwarf-planet ×2000, comet ×20000) 폐기. tier 별 실측 `renderScale` 만 적용 — 멀리서 보면 body 가 작아 보일 수 있다 (P11-B billboard marker 도입 전까지 sub-pixel 가능)
- **3단 tier 도입** — `solar` (해왕성 궤도 수용) / `inner` (화성 궤도 수용) / `body` (focus body 중심). 각 tier 별 `renderScaleForTier(tier)` 로 mesh.position / orbit line / sun light 에 동일 배수 적용. kind 별 차등 없음
- **하이브리드 tier 트리거** — focus 있으면 focus body kind 기반 자동 tier, free-fly 시 카메라-원점 거리 stateless 재계산. 히스테리시스 ±15% 로 경계 왕복 방지
- **교차 tier 전환 시 즉시 점프 flicker** — Phase A 는 애니메이션 없음. Phase B (Q8=8D scale + camera.radius 병행 300ms interp) 에서 해소 예정
- **`scene.solar.clearFocus()` / `setTier` / `updateTierByCamera` / `getTier` 공개 API 신설**
- **`setViewMode('scientific'|'educational')` backward-compat 유지** — 렌더 결과에 영향 없음. Phase C 에서 API 제거 예정
- **`ScaleBadge` 문구 재정의** — 기존 "×N 과장 중" → "실측 비율 1.0". Phase A 에서 과장 실제 제거됐으므로 거짓 UI 차단 (dead reference 정리)
- **`SCENE_UNIT_PER_METER = 1/AU` 하드코딩 제거** — 3파일 (`asteroid-belt.ts` / `ring-placeholder.ts` / `ring-shader.ts`) 의 상수 선언 제거, tier 함수 경유로 전환
- **회귀 가드 신규** — `tier-proportion.test.ts` (5건, 비율 불변식) + `scale-badge.test.tsx` (과장/× 재등장 차단 다층)

#### 벤치 baseline 재측정 (#293)

- `docs/benchmarks/baseline.json` 환경 `gh-actions-ubuntu-chromium-headless` 기준 N=10 median 으로 갱신. 이후 CI bench 게이트의 회귀 기준점

### DoD 실측 (P12-A Phase A)

| DoD      | 상태                                       | 증거                                                                 |
| -------- | ------------------------------------------ | -------------------------------------------------------------------- |
| V1/V3    | PASS                                       | browser-verify 해왕성 189/380px, 화성 9/384px                        |
| V5       | WARN → Phase B 이관 (사용자 승인 재조정)   | 지구 2198px / 목표 320±5% — Phase B dolly 에서 해소                  |
| V2/V4/V6 | DEFERRED → P11-B billboard marker (Q-C=C3) | —                                                                    |
| A2/A3    | PASS                                       | tier.test.ts 6건 + tier-lookat.test.ts 4건                           |
| R3/R4/R6 | PASS                                       | visual-scale.ts 폐기 + SCENE_UNIT_PER_METER 0 + engine boundary test |
| 테스트   | 343 PASS / 0 FAIL                          | `pnpm -r test`                                                       |

### 알려진 제한

- **교차 tier 전환 flicker** — Phase A 는 즉시 점프 (ADR 에 사전 합의된 degrade). Phase B (v0.12 예정) 에서 scale+radius 병행 interp 로 해소
- **V5 지구 세로 40% DoD 미충족** — Phase A 는 scale 만 교체 + 카메라 radius 불변 → focus body 과도 확대 (2198px). Phase B 에서 hard fail 승격 예정
- **V2/V4/V6 최소 pixel floor 미구현** — P11-B billboard marker 합산 측정 이관 (Q-C=C3)
- **P11-A non-focus fps 30~40% 회귀** (#294) — Floating Origin 배선 overhead 조사 중
- **scale-badge 존재 유지** — Phase C 에서 완전 제거 예정 (view-mode-switcher / onboarding-tooltip / scientific-mode-notice 포함)
- **Floating Origin 존속 여부 재검토 필요** — Q10. T1/T2 tier 는 float32 정밀도 충분 예측 (ADR §4 수식) → 재설계 완료 시 T1/T2 simplify 후보. T3 primary 는 유지

### 신규 이슈 (v0.11.0 중 분리 / 후속)

- **#288** P11-A Floating Origin (open, Phase C 완료 후 재검토)
- **#294** P11-A non-focus fps 30~40% 회귀 — 배선 overhead 조사
- **#295** browser-verify originOffset assert 범위 완화
- **#296** #271 canvas readback 대체 지표 — headless swiftshader false negative 방어
- **#297** `bench:baseline-remeasure` 로컬 smoke 스크립트
- **#298** P12 Display-Relative Scale Unification (open, Phase B/C 진행 예정)
- **#299** Tier 전환 시 ARIA Live Region 알림 (P12 후속, priority:low)

### 하네스 업데이트

v2.28.1 유지. v0.11.0 범위에서 하네스 수정 없음.

### 다음 마일스톤 (로드맵 v2)

- **v0.12.0 예정 (P12-B)** — Q8=8D scale + camera.radius 병행 300ms interp + 카메라 입력 500ms 잠금. C1/C2/C3/C4 연속성 DoD + V5 hard fail 승격
- **v0.13.0 예정 (P12-C)** — UI 컴포넌트 완전 제거 (ViewModeSwitcher / ScaleBadge / OnboardingTooltip / ScientificModeNotice) + `sim-store.viewMode` 필드 제거 + `fact-first.md` §예외 Amendment + `roadmap-v2-solar-precision.md` renumber (P12~P17 +1) + P11-A Floating Origin T1/T2 simplify (Q10 실측 확정 후)

## [0.10.0] — 2026-04-21

### P10 — Fact-First 원칙 + 데이터 감사 + 사실 모드 UI

메인 이슈: #266 (계약) / #268 (P10-A) / #274 (P10-B) / #278 (P10-C) · 회고: [`docs/retrospectives/p10-retrospective.md`](docs/retrospectives/p10-retrospective.md) · 원칙: [`docs/principles/fact-first.md`](docs/principles/fact-first.md) · 플랜: [`docs/phases/p10-plan.md`](docs/phases/p10-plan.md)

10 PR 분할 릴리스 (CLAUDE.md §Phase 분리 릴리스 리듬):

- **PR #269 + #273 (P10-A 원칙 박제 + Gemini 교차검증)** — `docs/principles/fact-first.md` 박제 + 로드맵 v2 (`roadmap-v2-solar-precision.md`) 재작성 + 모바일 보류 ADR + CLAUDE.md 참조. 2차 Gemini 교차검증 6건 즉시 반영 + 4건 이견 수용 + 1건 분리 (#271)
- **PR #275 + #276 + #277 (P10-B 데이터 감사)** — 타입 확장 (dataSource/lastVerified/colorSource/uncertainty) + IAU 2015 전수 대조 테이블 + 감사 방법론 박제 + `solar-system.json` 9건 수정 + 24 bodies 감사 필드 채움 + CI `verify-and-rust` 에 `verify:iau-data` 회귀 게이트 통합 (0 errors 필수). #274 closed
- **PR #279 + #280 + #281 (P10-C 사실 모드 UI)** — viewMode store (educational/scientific) + URL `?view=` sync + 키보드 `m` + ViewModeSwitcher + scientific 모드 실제 과장 해제 (scaling 500→1) + ScaleBadge + OnboardingTooltip + ScientificModeNotice + AboutModal (IAU/NASA/JPL 크레딧) + info panel 감사 필드 노출. #278 closed
- **PR #283 + #284 (P10-D 정확도 이슈)** — Galilean 4체 JPL Horizons API 재쿼리 (J2000 ecliptic, φ₀=179.69°) + Newton state vector 직접 추출 (forward-diff 폐기, timeScale 내성) + observedFps ref 수정. #261·#263 closed. D5-b amp≤2° 는 tidal force 미모델링으로 #282 scope 재조정 (P11+)
- **PR #285 (P10 회고)** — docs/retrospectives/p10-retrospective.md + 플랜 업데이트 + 벤치 실측 보고

### Behavior Changes

#### 데이터 — IAU 2015 ±0.01% 공차 준수 (P10-B)

- **`packages/shared/data/solar-system.json` 9건 수정** — radius 규약을 IAU equatorial nominal 로 통일 (near-spherical body). jupiter 6.9911e7 → 7.1492e7 (+2.26%), saturn 5.8232e7 → 6.0268e7 (+3.50%), uranus 2.5362e7 → 2.5559e7, neptune 2.4622e7 → 2.4764e7, mars 3.3895e6 → 3.3962e6, phobos 1.1267e4 → 1.108e4, deimos 6.2e3 → 6.27e3, neptune mass 1.0243e26 → 1.02413e26, jupiter mass 1.8982e27 → 1.89813e27. irregular body (Phobos/Deimos/Haumea/3 혜성) 에 `uncertainty` 필수
- **`packages/shared/data/solar-system.json` 24 bodies 감사 필드 자동 추가** — `dataSource` / `lastVerified: "2026-04-21"` / `colorSource` (observed 17 / artistic 4 / inferred 2) + 8 irregular body 에 `uncertainty.{mass, radius}` 상대 오차 박제
- **Galilean 4체 궤도 요소 JPL Horizons API 재쿼리** — frame 을 Laplace plane → J2000 ecliptic 으로 통일. Io/Europa/Ganymede/Callisto 의 λ/ϖ/Ω/e/i/a 전체 2026-01-01 00:00 TDB 값으로 교체. Laplace 공명 인자 φ₀ = 179.6929° (평형점 180° ± 0.31°) 달성
- **`packages/shared/src/constants/solar-system.ts` legacy 상수 2건 IAU 정합화** — SOLAR_MASS 1.98847e30 → 1.98892e30 (IAU B3 §1), JUPITER_RADIUS 6.9911e7 → 7.1492e7 (equatorial)

#### 렌더링 — scientific 모드 실제 과장 해제 (P10-C)

- **scientific 모드에서 `solar-system-scene` per-body scaling 1.0 강제** — IAU 실측 비율 렌더. 기본 educational 모드는 기존 거리-의존 과장 (MAX*VISUAL_SCALE*\*) 유지
- **헤더 우측 `ViewModeSwitcher` 2-버튼 토글** — `data-testid="view-mode-switcher"`, data-mode + `data-view-mode` DOM 어트리뷰트 동기화, 키보드 `m` 단축키 (input/modifier 가드)
- **URL `?view=scientific|educational` 양방향 sync** — nuqs parseAsStringEnum, 디폴트 educational 은 URL 생략. 기존 `?mode=observe|research` 와 key 분리 (계약 재조정, CRITICAL #6 §7)
- **ScaleBadge** 헤더 표시 — focused body kind 별 상한 (`태양 — 시각 크기 최대 ×20 과장 중`) / scientific 모드 (`지구 — 실제 비율 1.0`) / focus 없음 (`시각 과장 모드` / `사실 비율 모드`)
- **OnboardingTooltip** 첫 진입 CTA — "시각 크기 과장 중. [실제 비율로 보기]". localStorage `astro:onboarding-dismissed` 영속 dismiss. scientific 진입 시 자동 skip
- **ScientificModeNotice** `?view=scientific` 최초 진입 시 빈 화면 이탈 방지 배너 — localStorage `astro:scientific-notice-dismissed` 영속
- **AboutModal** 헤더 `?` 버튼 — IAU 2015 / NASA Fact Sheet / NASA JPL / Standish-Williams (1992) 4개 출처 attribution 링크 + 라이선스 + 현재 viewMode 별 정책 안내 + 공차 ±0.01% 명시. Esc / 닫기 / 외부 클릭 닫기
- **CelestialInfoPanel 감사 필드 섹션** — `dataSource` / `lastVerified` / `colorSource` (관측/아티스트/추론) 표시. mass/radius 옆 `uncertainty` ±% 컬럼 (irregular body 한정)

#### 역학 정확도 (P10-D)

- **Galilean 초기 Laplace 인자 φ₀ 평형점 실증** — `test_laplace_initial_phase_equilibrium` (빠른 경로, Rust) 로 179.69° 검증. 기존 218° circulation 상태 해소. 단, 100 Io 주기 적분 후 libration 은 tidal force 미모델링으로 재현 불가 → #282 로 이관
- **Osculating 1Hz polling timeScale 내성화** — `SolarSystemSceneHandles.getBodyState(id, parentId)` 신규 API 로 Newton 엔진 state vector 직접 추출. forward-diff 폐기 → timeScale=86400 기본값에서도 `sat-dynamic-{io/europa/ganymede/callisto}` 배지 4/4 렌더 (browser-verify 16/16 실증)
- **observedFps 의존성 배열 버그 수정** — ADR §Amendments 2026-04-20 박제 버그 완결. `useEffect([..., observedFps])` 가 fps raf 매 frame setState 로 재실행 유발하던 것을 `observedFpsRef` 로 해소

#### CI 회귀 가드 신설

- **`verify:iau-data` CI step** (`ci-physics-wasm.yml::verify-and-rust`) — IAU 2015 ±0.01% 공차 초과 / 감사 필드 (dataSource/lastVerified/colorSource) 부재 시 exit 1 로 PR 머지 차단. 의도적 실패 주입 실증 완료

### DoD 실측

| Sub                | 원 DoD | 달성 | 이관/미달                         |
| ------------------ | ------ | ---- | --------------------------------- |
| P10-A 원칙 박제    | 8      | 8/8  | —                                 |
| P10-B 데이터 감사  | 8      | 8/8  | —                                 |
| P10-C 사실 모드 UI | 8      | 8/8  | —                                 |
| P10-D 정확도 이슈  | 3      | 2/3  | #255 → P13 (J2/J4)                |
| P10-D.5 벤치 회귀  | 3      | 부분 | 환경 mismatch (CI remeasure 필요) |

**30 DoD 중 28 달성 (93%)**.

### 알려진 제한

- **Laplace 공명 libration 재현 불가** — 순수 Newton 다체는 tidal force 미모델링. 실 천체의 조석 에너지 소산 + 공명 barrier 부재로 시뮬은 circulation 으로 발산. 데이터 정확성은 확보 (φ₀ = 179.69° 박제). 후속 #282 (P11+)
- **목성 J2/J4 편평도 세차 미반영** — 현 공차 ±1% 에서는 오차 미검출. #255 P13 (궤도 정밀 보정) 이관
- **scale-badge MAX_SCALE_BY_KIND 인라인 미러링** — core scene import 가 SSR prerender 에서 wasm 로드 시도로 실패. ssr-safe 경로 분리는 후속 이슈
- **로컬 vs CI 벤치 환경 mismatch** — 로컬 macOS headless 측정은 "상대 변화" 관찰용 한정. 공식 회귀 판단은 CI `bench-baseline-remeasure` dispatch 로 ubuntu 재측정 후 확정

### 신규 이슈 (P11+ 후속)

- **#282** tidal force Laplace libration — D5-b amp ≤ 2° 달성 경로
- **#271** float32 jitter (P11 Floating Origin 블로커)
- **#272** iOS 플래그십 모바일 재도전 트리거

### 하네스 업데이트

v2.28.1 (현재) 유지. P10 범위에서 하네스 수정 없음.

## [0.9.0] — 2026-04-20

### P9 — 목성계 (Galilean + Laplace 공명 + 고리 3층 + Osculating 동기화)

메인 이슈: #254 · ADR: [`docs/decisions/20260420-p9-galilean-laplace-rings.md`](docs/decisions/20260420-p9-galilean-laplace-rings.md) · 회고: [`docs/retrospectives/p9-retrospective.md`](docs/retrospectives/p9-retrospective.md)

4 PR 분할 릴리스 (CLAUDE.md §Phase 분리 릴리스 리듬 적용):

- **PR #258 (PR-1 인프라 + Galilean JSON + 고리 placeholder)** — `solar-system.json` 에 Galilean 4체(Io/Europa/Ganymede/Callisto) + Jupiter.rings 3층(Halo/Main/Gossamer) JSON 신설 + zod 스키마 `RingLayerRawSchema` 확장 + `ring-placeholder.ts` 단색 3층 disk
- **PR #260 (PR-2 Rust satellites + M4 장기 테스트 분리)** — `packages/physics-wasm/src/satellites/{laplace,osculating}.rs` 신규 모듈 + 단위테스트 5건 (D1~D4 주기 + D5-a 잔차 + Osculating 왕복) + `extract_osculating_elements` WASM bindgen export + **M4**: 장기 적분 테스트 6건 `#[ignore]` 분리 + CI workflow 빠른/장기 경로 독립 job
- **PR #262 (PR-2.5 고리 shader 3층 + M1 백업)** — `ring-shader.ts` fragment shader 방사밀도 3구간 + `createRingShaderMaterial`/`createRingShaderMesh` 신규 + 수동 플래그 `?ring=fallback`/`?ring=placeholder` + 실 Chrome 3 시나리오 수동 검증 통과 + M1 백업 (SPS 자동 전환)
- **PR-3 (본 PR) TS 통합 + UI + 회고 + v0.9.0** — `use-osculating-sync.ts` 훅 + `satellite-info-panel.tsx` (D8) + `?mass=jupiter×N` URL 핸들러 + ADR §Amendments 3건 + 회고 + 버전 bump

### Behavior Changes

- **sim-canvas 에 목성계 위성 4체 (Io/Europa/Ganymede/Callisto) 자동 렌더** — `?mode=research&focus=jupiter` 에서 목성 주위 Galilean 위성이 JSON 기반 Kepler 해석 요소로 표시. CelestialTree 사이드패널에 `tree-io` / `tree-europa` / `tree-ganymede` / `tree-callisto` 버튼 자동 노출
- **목성 고리 3층 shader 렌더** — Halo (92k~122.5k km) / Main (122.5k~129k km) / Gossamer (129k~226k km) 각 반경별 fragment shader 방사밀도 표현. `?ring=fallback` 으로 InstancedMesh/SPS 전환, `?ring=placeholder` 로 PR-1 단색 disk 복귀 가능
- **Galilean 이심률·경사 UI 패널 (D8)** — `SatelliteInfoPanel` 에 4체 `e` / `i` 값 표시 (`solar-system.json` 바인딩, 하드코딩 금지). `singularity===1` 시 "원순환 근사" 배지
- **Osculating 1Hz polling 훅 인프라** — `use-osculating-sync.ts` 훅 + fps 자동 폴백 (1Hz → 2Hz → 5Hz → 10Hz, 히스테리시스 +5fps). WASM `extract_osculating_elements` wiring 완결. 단 기본 `timeScale=86400` 조건에서 forward-diff velocity noise 로 UI 배지 미렌더 — [#263](https://github.com/coseo12/astro-simulator/issues/263) 이관
- **`?mass=jupiter×N` URL 파라미터 동적 질량** — Newton 엔진 경로에서 씬 물리에 반영 (Io-Jupiter 거리 감소 실측 확인). Osculating UI 반영은 #263 완료 시점까지 정적 JSON 값 표시
- **DoD 물리 검증 CI 가드 6건 추가** — `cargo test` 에 `test_io_period_1pct` / `test_europa_period_1pct` / `test_ganymede_period_1pct` / `test_callisto_period_1pct` / `test_laplace_resonance_residual_1pct` / `test_osculating_roundtrip` 상시 게이트. D5-b (위상 진폭 ±2°) 는 `#[ignore]` + follow-up [#261](https://github.com/coseo12/astro-simulator/issues/261) 이관
- **M4 장기 테스트 분리** — `mercury/yoshida_*_perihelion_*`, `earth/venus_perihelion_eih_*` 6건에 `#[ignore = "long-integration; run with --include-ignored in CI"]` 어트리뷰트. 일상 `cargo test --lib` 경로 완주 시간 **30분+ → 9.27s (≈ 200× 단축)**. CI 장기 경로는 `cargo test --release --lib -- --include-ignored` 독립 job (`continue-on-error: true`)
- **sub-agent 이탈의 프로세스 레벨 확장 교훈** (CLAUDE.md §프로젝트 고유 보강 교훈 추가, [#259](https://github.com/coseo12/astro-simulator/pull/259)) — sub-agent 가 `run_in_background` 로 띄운 프로세스 정리 누락 시 cargo target 디렉토리 경쟁으로 교착 발생. 메인 오케스트레이터 루틴 (`pgrep -f "cargo|next dev|physics_wasm-"` 독립 확인) + sub-agent 마무리 체크리스트 `spawned_bg_pids` 필드 규범화. [volt #52](https://github.com/coseo12/volt/issues/52) 박제

### DoD 실측 (ADR 대비 여유율)

| DoD                        | 계약          | 실측                             | 여유율     |
| -------------------------- | ------------- | -------------------------------- | ---------- |
| D1 Io 공전주기             | ±1%           | PASS                             | —          |
| D2 Europa 공전주기         | ±1%           | PASS                             | —          |
| D3 Ganymede 공전주기       | ±1%           | PASS                             | —          |
| D4 Callisto 공전주기       | ±1%           | PASS                             | —          |
| D5-a Laplace 잔차          | ±1%           | **0.00024**                      | 41×        |
| D5-b 위상 진폭             | ±2°           | **이관 (#261 데이터 교정)**      | —          |
| D6 고리 3층 shader         | 가시          | PASS (실 Chrome 6 스크린샷)      | —          |
| D7 Osculating 동기화       | 1Hz polling   | **인프라 완결 / UI 이관 (#263)** | —          |
| D8 이심률·경사 UI          | JSON 바인딩   | PASS                             | —          |
| M4 cargo fast path         | ≤5분          | **9.27s**                        | **32×**    |
| cargo include-ignored path | 독립 job 분리 | **216.9s**                       | CI 병렬 OK |
| fps baseline (실 Chrome)   | ≥55fps        | **평균 59.98 / 최소 59.75**      | 60fps 유지 |

### 알려진 제한 (스프린트 계약 재조정 박제, CLAUDE.md §7 세 위치 완결)

- **D5-b 위상 진폭 ±2°** — `measure_laplace_resonance()` 측정 도구 정상이나 PR-1 에서 박제한 JPL Galilean 초기 조건의 Laplace 인자 φ₀ = 218° (이론 평형점 180° 대비 38° 벗어남) → circulation 상태로 libration 재현 불가. 측정법 검증 우선 원칙 (CLAUDE.md §스프린트 계약 10) 충실 수행 후 데이터 교정 분리. 해결은 `solar-system.json` Galilean 4체 `meanLongitudeDeg` JPL Horizons 재쿼리 → [#261](https://github.com/coseo12/astro-simulator/issues/261) 이관
- **D7 Osculating UI 동적 표시** — 훅 인프라 완결 / `?mass=jupiter×N` 씬 물리 반영 정상이나 `timeScale=86400` 기본값에서 forward-diff velocity noise 과다로 UI 배지 미렌더. 해결은 Babylon 씬 저장 velocity state vector 직접 추출 (forward-diff 폐기) → [#263](https://github.com/coseo12/astro-simulator/issues/263) 이관. v0.9.0 은 정적 JSON 값 표시
- **Osculating shader `onError` 비동기 폴백 미구현** — `ring-shader.ts` 는 동기 exception 경로만 M1 자동 전환. 비동기 `onError` 는 기록만 수행. 수동 `?ring=fallback` 은 정상. ADR §재검토 조건 #5 에 위임

### 후속 OPEN

- [#261](https://github.com/coseo12/astro-simulator/issues/261) (P9-followup, priority:medium) — Galilean 초기 조건 φ₀ = 218° → 180° 데이터 교정 + D5-b 재개
- [#263](https://github.com/coseo12/astro-simulator/issues/263) (P9-followup, priority:medium) — Osculating 속도 추정 timeScale 내성화 (forward-diff → 씬 state vector 직접 추출)
- [#245](https://github.com/coseo12/astro-simulator/issues/245) / [#246](https://github.com/coseo12/astro-simulator/issues/246) (P8-followup, priority:low) — 위성 줌 토글 / 클릭 정보 패널 인터랙션
- [#255](https://github.com/coseo12/astro-simulator/issues/255) (P9-followup, priority:medium) — 목성 J2/J4 편평도 세차
- [#256](https://github.com/coseo12/astro-simulator/issues/256) / [#257](https://github.com/coseo12/astro-simulator/issues/257) (P9-followup, priority:low) — 장기 적분 에너지 보존 DoD / 고리 shader 섀도우 매핑

## [0.8.0] — 2026-04-19

### P8 — 내행성계 위성 정밀화 (포보스·데이모스·달 교점역행)

메인 이슈: #244 · ADR: [`docs/decisions/20260419-satellite-orbit-hybrid.md`](docs/decisions/20260419-satellite-orbit-hybrid.md) · 회고: [`docs/retrospectives/p8-retrospective.md`](docs/retrospectives/p8-retrospective.md)

3 PR 분할 릴리스 (CLAUDE.md §Phase 분리 릴리스 리듬 적용):

- **PR #248 (PR-1 인프라 + #242 선행)** — `scripts/bench-scene.mjs` vsync 페그 해소 + `solar-system.json` 포보스/데이모스 2종 엔티티 추가 + `solar-system-loader.test.ts` 가드 + `time-reversal.test.ts` 9체 의도 보존 필터
- **PR #250 (PR-2 Rust 측정 헬퍼)** — `packages/physics-wasm/src/nbody.rs` `measure_moon_orbital_period` / `measure_node_regression_period` 헬퍼 2종 + 단위테스트 3건 (phobos/deimos/lunar_node). Gemini 교차검증 수용 (상대 좌표계 + Nyquist smoothing)
- **PR-3 (본 PR) TS 통합 + 회고 + v0.8.0 릴리스 준비** — ADR 예측대로 sim-canvas 코드 변경 0 라인 (기존 `parentId` + `updateAtKepler` 재사용). 회고 + CHANGELOG + 버전 bump.

### Behavior Changes

- **sim-canvas 에 화성 위성 2종 (포보스/데이모스) 자동 렌더** — `?mode=research` 에서 화성 주위 위성이 JSON 기반 Kepler 해석 요소로 표시. 렌더 코드 라인 추가 0 (기존 `parentId=mars` 체인 재사용). CelestialTree 사이드패널에 `tree-phobos` / `tree-deimos` 버튼 자동 노출, 클릭 시 focus 카메라 전환 동작 (실측 L2 PASS)
- **DoD 물리 검증 CI 가드 3건 추가** — `cargo test` 에 `test_phobos_period_1pct` / `test_deimos_period_1pct` / `test_lunar_node_regression_5pct` 상시 게이트. 측정 실패 시 릴리스 차단. WASM 런타임 번들 delta 0 bytes (`#[cfg(test)]` 격리)
- **9체 `time-reversal.test.ts` 명시 필터** — 포보스 주기 7.65h × dt=10min 의 per-step 1/45 period 누적 오차가 기존 1e-9 임계를 초과하여 화성 위성 명시 필터. 원 9체 대칭성 의도 보존. 위성 자체의 시간 역행 검증은 PR-2 `measure_moon_orbital_period` 로 대체
- **bench-scene vsync 페그 해소 (PR-1)** — `--disable-frame-rate-limit` + `--disable-gpu-vsync` 플래그. 머지 직후 baseline 재측정 자동 PR 생성. 기존 baseline 대비 양의 Δ 관찰 예상 (uncapped FPS)

### DoD 실측 (ADR 대비 여유율)

| DoD                   | 계약 | 실측        | 여유율 |
| --------------------- | ---- | ----------- | ------ |
| 포보스 공전주기       | ±1%  | **0.087%**  | 11.5×  |
| 데이모스 공전주기     | ±1%  | **0.032%**  | 31×    |
| 달 교점역행 주기      | ±5%  | **4.45%**   | 1.12×  |
| WASM 번들 delta       | +2KB | **0 bytes** | —      |
| cargo test 시간 delta | +45s | **+18s**    | 2.5×   |

### 후속 OPEN (priority:medium)

- #245 위성 줌 토글 (`?satellites=zoomed` 옵트인) — 위성이 실 스케일에서 서브픽셀, 탐색 UX 보강
- #246 위성 클릭 정보 패널 — celestial-info-panel 에 궤도 요소 표시
- #247 Osculating elements 동적 동기화 파이프라인 — 질량 변경 시 위성 무반응 (Gemini 교차검증 고유 발견, 정적 Kepler 한계). P9/P13 후보
- #251 bench-scene 다회 샘플링 + `stdev_ratio` 필드 (#242 DoD 일부 open 유지)

### 알려진 제한

- `?focus=<moon|phobos|deimos>` URL 직접 진입 시 카메라 focus 는 동작하나 CelestialTree 사이드패널 active 토글은 미연동. 기존 동작과 동일 (#246 클릭 정보 패널 범위). **PR-3 퇴행이 아님**.

## [0.7.1] — 2026-04-19

### Behavior Changes: None — 문서/인프라/정적 에러 해소만

P7-E 후속 follow-up 5건 중 4건 완결 + pre-existing 정적 에러 2건 해소.
앱 런타임 / 물리 식 / 기본 bench 동작 모두 불변.

**#224 #226 P7-E follow-up 문서·주석·회귀 가드** (PR #233)

- `docs/retrospectives/p7-retrospective.md`: `22개`/`21개` → 실측 15개 (편집 14 + utils 1) 정정
- `§어려웠던 것 #6 numeric accuracy` 신설 — "회고·PR 에 개수/비율 기재 시 실측 후 기재" 원칙 박제
- `apps/web/src/core/parse-gr-mode.test.ts` 사용자 실수 케이스 (on/true/gr/0/2/eih1pn/single1pn) 회귀 가드 +7 케이스
- `apps/web/src/store/sim-store.ts` `__simStore` `configurable:true` HMR 근거 + `defineProperty` 사용 이유 주석 박제
- `docs/decisions/README.md` §Amendments 표준 포맷 신설 (갱신 이력 테이블 컬럼 고정)
- `docs/decisions/20260418-p7-integrator-upgrade.md` Phase C 진단 + CI 임계 2건 §Amendments 소급 시범 적용

**#223 bench-p7-lens3d vsync 페그 해소 + DoD 재조정** (PR #234)

- 원인: headless chromium RAF 상한(120Hz vsync) 으로 측정값 stdev ≈ 0 (ray3d 연산 부하 미반영)
- `scripts/bench-p7-lens3d.mjs` launch args 에 `--disable-frame-rate-limit` + `--disable-gpu-vsync` 추가
- `pressTimePlay` import (`skipIfAbsent:true` — `?bh=2&ray3d=1` 기본 자동 재생 회귀 가드 목적)
- 리포트 JSON 에 `stdev_ratio = stdev/avg` 필드 신설 (GPU 속도 독립 지표)
- **DoD 재조정** (사용자 합의): `stdev_ms > 0.5ms` → `stdev_ratio > 1%` (M1 Pro Metal ~1200fps 에서 절대 stdev 원천 도달 불가)
- 3위치 박제: 이슈 #223 body / 스크립트 주석 / PR 본문
- 새 baseline: `docs/benchmarks/p7-lens3d-2026-04-19T04-03-10-225Z.json` (avg 0.920ms · stdev_ratio 2.61% · fps 1088)

**#225 baseline 재측정 workflow + median aggregator (설계 PR)** (PR #238)

- `.github/workflows/bench-baseline-remeasure.yml` 신설 — `workflow_dispatch` 수동 트리거, plan → bench (matrix N 병렬) → aggregate (median + PR 자동 생성) 3 job
- `scripts/bench-aggregate-median.mjs` (의존성 0, stand-alone) — 여러 회차 JSON 을 median 으로 집계
- `scripts/bench-aggregate-median.test.mjs` 회귀 가드 **8/8 PASS**
- `docs/benchmarks/README.md` 재측정 절차 문서화
- 도구 도입만 — 실제 baseline 갱신은 본 릴리스 후 사용자 수동 트리거 → 자동 PR

**#236 #237 pre-existing typecheck/lint 해소** (PR #239)

- `packages/core/src/gpu/nbody-force-shader.test.ts`: `noUncheckedIndexedAccess` TS2532/TS2345 해소 (non-null assertion, Float32Array 길이 6 정적 보장)
- `apps/web/src/components/panels/black-hole-disk-panel.tsx`: `useState + useEffect + window.location.search` → `nuqs useQueryState('bh')` (url-sync 패턴 일관, react-hooks/set-state-in-effect 해소)
- 브라우저 smoke: `?bh=2&mode=research` panel visible=true 회귀 없음 확인

### 후속 OPEN (priority:low)

- #219 iOS Safari 실기기 bench (P14 배포 이후)
- #235 vsync 우회 플래그 다른 bench 스크립트로 확산

## [0.7.0] — 2026-04-18

### P7 — 트랙 B 3D ray + 적분기 격상 (Yoshida 4차)

**P7-A Yoshida 4차 심플렉틱 적분기 + Phase C 측정법 개선** (#206, PR #212)

- `packages/physics-wasm/src/integrator.rs` 신규 — Yoshida 1990 4차 심플렉틱
- `IntegratorKind` enum (VelocityVerlet / Yoshida4) + `set_integrator(u8)` bindgen
- EIH 가속도 본체 **불변** — 적분기만 감쌈
- **Phase C 측정 방식 개선**: LRL 벡터 + Newton baseline subtraction 도입
  - P6-D `min_r` 샘플링 노이즈 제거 → 진짜 수렴값 확인
  - 수성 0.11% / 지구 1.19% (3c) / 금성 1.39% (10c) rel_err 확정
  - Kepler 2체 5000 orbit drift **1.87e-13** (DoD 1e-10 대비 3자리 여유)
- WASM gzipped 16.36 → 16.71 KB (+0.35KB, 상한 +2KB 대비 17% 소진)
- ADR: `docs/decisions/20260418-p7-integrator-upgrade.md`

**P7-B 적분기 선택 API + URL 옵트인** (#207, PR #216)

- `packages/core/src/physics/nbody-engine.ts` — `IntegratorKind` union literal (TS) + `INTEGRATOR_TO_U8` (Rust 1:1)
- `apps/web/src/core/parse-integrator.ts` — URL 파서 (`verlet`/`velocity-verlet`/`yoshida4`), invalid → VV 폴백
- 기본값: `velocity-verlet` (Yoshida 옵트인 `?integrator=yoshida4`)
- E2E: `scripts/browser-verify-integrator.mjs` (정적 / URL 전환 / `?gr=eih&integrator=yoshida4` 5초 재생)

**P7-C 트랙 B 3D ray construction — 5차 D' 보강 채택** (#208, PR #217, PM M1 백업 경로)

- P6-B 3회 실패 후 P7-C 에서 5단계 순차 재시도:
  - 1차(A) 단일 invViewProj + 알파 fix — WebGL2 GLSL prelude 에러로 실패
  - 2차(C) 분리 invView/invProj (thinSSRPostProcess 패턴) — 동일 증상
  - 3차(E) **Frustum Corner Interpolation (Gemini 교차검증 고유 발견)** — 셰이더 컴파일 성공 + lensing 왜곡 성공, 하지만 실 Chrome 검증에서 disk mask 실패 확인
  - 4차(B) WGSL mat4_invert — 미진입
  - **5차(D) D' 보강**: `diskAxisX/Y` 를 world disk major axis 의 화면 투영 방향으로 대체 — 카메라 회전 시 disk 타원 장축 화면 내 회전
- 3차(E) 코드는 `?ray3d=1` 실험적 경로로 보존 (lensing 효과 자산)
- ADR: `docs/decisions/20260418-p7-track-b-ray3d.md` (Accepted as permanent approximation, Path 5)
- 선행 ADR `20260417-accretion-disk-shadow-pipeline.md` §재검토 트리거 발동 기록

**P7-D 모바일 best-effort 실측** (#209, PR #218)

- Playwright Chromium iPhone 14 emulation
- `engineNotice` 구조 전환: `string | null` → `{ key: string; message: string } | null` + `dismissedNoticeKeys` (key-scoped dismiss)
- `isMobile && !navigator.gpu` 경고 노티 (best-effort 정책)
- **A/B 교차 bench**: VV 1352.86 fps / Yoshida4 1383.75 fps (**ratio 1.054**, 임계 ≥0.90)
- 신규: `scripts/browser-verify-mobile-p7d.mjs`, `scripts/bench-scene-mobile.mjs`

**P7-E bench 컬럼 + 회고 + P6 가드 + 후속 흡수** (#210, PR #222, closes #215/#220/#221)

- E1 bench: `integrator_yoshida4_ms` (0.0002 ms/step, 1.59× VV) + `track_b_ray3d_frame_ms` (8.331 ms, M1 Pro WebGPU)
- E3 회고: `docs/retrospectives/p7-retrospective.md` (4섹션 + v2 로드맵 참조)
- E4 P6 가드: `apps/web/next-env.d.ts` .gitignore + `git rm --cached`
- 흡수 #215: ADR §재검토 트리거 §4 갱신 (>7분 → >11분, 실측 기반)
- 흡수 #220: `apps/web/src/core/is-mobile.ts` (iPadOS 13+ desktop UA `Macintosh + maxTouchPoints > 1` 감지)
- 흡수 #221: `__simStore` dev-only 전역 노출 (prod 번들 DCE 검증) + 시나리오 4 재작성
- 흡수 QA 이관 3건:
  - `scripts/browser-verify-utils.mjs` 신규 공통 유틸 (`pressTimePlay`, `hasSimErrors`)
  - 22개 browser-verify-\*.mjs 의 `time-play` silent-fail 패턴 + NaN regex 일괄 정비
  - `apps/web/src/core/parse-gr-mode.ts` (`?gr` 대소문자 정규화)

### 검증

- pnpm test **252/252** PASS (shared 4 + physics-wasm 1 + core 163 + web 84)
- cargo test --release **37 passed** (lib) + 2 (barnes_hut)
- 브라우저 3단계 검증 전부 PASS (실 Chrome 수동 + 에뮬레이션)
- WASM gzipped 16.71 KB (P6 대비 +0.35KB)
- Rust 본체 P7-B/C/D/E 전부 무수정 — P7-A에서만 integrator 추가

### 후속 이슈 (모두 priority:low)

- #219 iOS Safari 17.4+ 실기기 bench 수동 측정 (P14 배포 후)
- #223 `bench-p7-lens3d.mjs` `pressTimePlay` 도입 (120Hz vsync 페그 해소)
- #224 PR #222 본문/회고 '22개/21개' 수치 정정
- #225 `bench:scene:sweep` focus-earth/neptune baseline 재설정
- #226 Reviewer 후속 3건 (parseGrMode regex / `__simStore` configurable / ADR §Amendments)

### 이전 릴리스

- v0.6.1 (2026-04-18) — long-term-drift 테스트 타임아웃 방어
- v0.6.0 (2026-04-17) — P6 물리 심화 (중력렌즈 3D + EIH 1PN 다체)

## [0.6.1] — 2026-04-18

### 테스트 안정화

**long-term-drift 타임아웃 방어** (#203, closes #199)

- `packages/core/src/physics/long-term-drift.test.ts` — 두 `it()`에 `testTimeout: 30_000ms` 명시
- 재현 조사: main 단일 실행 1.31s / core 전체 163/163 PASS — **선재 회귀 아님**
- 100년 9체 Newton 적분은 단독 ~1.3s이나 병렬/CI 부하 시 vitest 기본 5s 초과 가능 → 안정성 확보 목적의 방어 조치
- `LONG_INTEGRATION_TIMEOUT_MS` 상수 추출 + 이유 주석

## [0.6.0-p6] — 2026-04-17

### P6 물리 심화 — 중력렌즈 고도화 + EIH 1PN 다체

**P6-A Schwarzschild geodesic RK4 솔버** (#194)

- `packages/physics-wasm/src/geodesic.rs` 신규 — 광선 1차 ODE `d²u/dφ² + u = 3M·u²` + 단순 RK4 + r-기반 step
- `GeodesicOutcome::{Escaped, Captured}` 분류, invariant 보존 측정
- 단위 테스트: weak-field b=50 Rs deflection rel_err **3.52%**, strong-field b=3 Rs rel_err **0.05%** (Iyer-Petters 2007 기준)
- invariant drift **~1e-14** (한계 1e-4, 10¹⁰ 배 여유)
- ADR: `docs/decisions/20260417-geodesic-solver.md`

**P6-B accretion disk + LUT shadow (D' 변형)** (#195)

- WASM bindgen `build_lensing_lut(samples) -> Vec<f32>` 신규 (flat `[outcome, deflection] × samples`)
- 신규 PostProcess `packages/core/src/scene/black-hole-rendering.ts` (WGSL/GLSL 듀얼)
- URL `?bh=2` 옵트인 (P5-D `?bh=1` 보존)
- 5 UI 파라미터 슬라이더 (Inner/Outer/Eccentricity/Thickness/Tilt)
- ADR D' 변형 박제 — 원안 3D ray construction → 화면공간 b/Rs + LUT (Babylon invViewProj 이슈로 후퇴, 3D 복원은 #196 후속)
- 알파 채널 fix (신규 원인 #4 식별): `vec4f(result.rgb, 1.0)` WGSL/GLSL 일관 — P5-D는 우연히 회피했던 패턴
- ADR 2건: `20260417-accretion-disk-shadow-pipeline.md`, `20260417-gravitational-lensing-pipeline.md` (P5-D Superseded)

**P6-C EIH 1PN 다체** (#197)

- `GrMode` enum (Off / Single1PN / EIH1PN) — 동시 활성 모순 차단
- WASM `set_gr_mode(u8)` 신규 + `set_gr(bool)` 호환 wrapper 보존
- `nbody.rs` 인라인 EIH 가속도 (Will eq. 6.80, harmonic gauge)
- URL: `?gr=eih` 신규 + `?gr=1`/`?gr=1pn` 호환 + `?gr=invalid` → off + warn
- 단위 테스트: 2체 한계 동치, 9체 100년 drift < 1e-6/orbit
- ADR: `docs/decisions/20260417-eih-1pn-multibody.md`

**P6-D 행성 근일점 ±5% 검증** (#198)

- `measure_perihelion_precession_eih(name, mass, a, e, period, expected, tol_pct)` 헬퍼 추출 (수성 하드코딩 → 일반화)
- **수성 42.59″** (rel_err 0.90%), **금성 8.67″** (rel_err 0.63%), **지구 3.74″** (rel_err 2.48%) — 모두 ±5%
- dt=2.5s 5단계 폴백 (60s → 30s → 15s → 7.5s → 5s → 2.5s) 끝에 통과 — RK4 정밀도 한계
- 수성 41.46″/century Single 모드 회귀 가드 무수정 보존
- ADR: `docs/decisions/20260417-perihelion-verification.md` (Park 2017 인용)

**P6-E bench + ADR + 회고 + 중복 방지 가드** (#200)

- `scripts/bench-p6e.mjs` — geodesic_ms sweep {64/256/1024} + eih_1pn_ms (N=9, 1000 step 평균)
- 실측: geodesic 7.78/30.88/121.32 ms, eih_1pn 0.0042 ms/step
- `scripts/check-duplicate-functions.mjs` + pre-commit + CI warn-only — P5 회고 `stateVectorAt` 중복 교훈 도구화
- 정규화 토큰 교집합 ≥ 2 + 도메인 stop list + 회귀 픽스처 13/13
- ADR: `docs/decisions/20260417-duplicate-function-guard.md`
- 회고: `docs/retrospectives/p6-retrospective.md`

### 후속 추적

- **#196** — 트랙 B 3D ray construction (invViewProj) + `?bh=2` silent failure 디버깅
- **#199** — `long-term-drift.test.ts` 5s timeout 선재 (P6-E 회귀 아님, 타임아웃 완화 후보)

## [0.5.0-p5] — 2026-04-17

### P5 일반상대론 + 중력렌즈 + 실기기 + 측정 도구

**P5-E bench baseline** (#181)

- v0.4.0 bench 결과 스냅샷 (`baseline-v0.4.0.json`)
- `bench:scene:set-baseline --compare <tag>` 비교 기능

**P5-B 실기기 iPhone 측정** (#182)

- iPhone 12 mini (A14/iOS 26.3.1) 직접 측정: N=200 **60fps**, N=10000 **40~50fps** 크래시 없음
- fps HUD 카운터 (`?fps=1` URL 옵트인) — SimulationCore에서 `engine.getFps()` 0.5초 emit
- WebGPU 미지원 (A14) → WebGL2 폴백 정상
- `next.config.mjs` allowedDevOrigins 추가

**P5-A 일반상대론** (#183)

- Rust NBodySystem에 1PN Schwarzschild 세차 보정항: `a_GR = (GM/(c²r³))[(4GM/r - v²)r + 4(r·v)v]`
- 수성 근일점 세차 **41.46″/century** (이론 42.98″, 오차 3.5%, DoD ±5% 충족)
- WASM `set_gr()/gr_enabled()` + TS `NBodyEngineOptions.enableGR` + URL `?gr=1`
- ADR: `docs/decisions/20260417-general-relativity-1pn.md`

**P5-C GPU compute shader별 세분화** (#184)

- `ComputeShader.gpuTimeInFrame: WebGPUPerfCounter`로 force/integrator 분리 측정
- `WebGpuNBodyEngine.readShaderTimings()` → `{forceMs, integratorMs}`
- `engine.enableGPUTimingMeasurements = true` 활성
- bench에 force_ms/integrator_ms 컬럼 + `window.__gpuShaderTimings` 노출

**P5-D 중력렌즈 시각화** (#185)

- Schwarzschild 블랙홀 PostProcess WGSL fragment shader
- 궤도선 왜곡 + Einstein ring (파란 글로우) + event horizon 흑색
- dual shader path (WGSL for WebGPU, GLSL for WebGL2)
- URL `?bh=1&bhx=N&bhy=N&bhz=N` 옵트인
- WGSL `textureSample` uniform control flow 제약 → branchless `step()/mix()` 해결
- ADR: `docs/decisions/20260417-gravitational-lensing-pipeline.md`

## [0.4.0-p4] — 2026-04-16

### P4 WebGPU 실측 + 모바일 1차 게이트

**P4-B WebGPU 활성 회귀 가드** (#168)

- EngineFactory 전환 **NO-OP** 결정 — `docs/decisions/20260416-engine-factory-no-op.md`
- `scripts/browser-verify-webgpu.mjs` 신규 — HUD `renderer · webgpu` assert, capability notice 미표시, reload 후 경로 유지 (5/5 통과)
- `--enable-unsafe-webgpu` 외 flag 명시 — 헤드리스 기본값 의존 제거

**P4-D GPU frame time 직접 측정** (#169)

- `SimulationCore.enableGpuTimer()` / `readGpuFrameTimeMs()` / `debugGpuTimer()` 공개 API
- `EngineInstrumentation.gpuFrameTimeCounter` 기반 ms 단위 측정 (lastSecAverage → average → current 폴백)
- `?gpuTimer=1` URL 옵트인 시 `window.__gpuFrameTimeMs` getter 노출
- `engine-factory.ts` — WebGPUEngine 생성 시 `timestamp-query` feature optional 요청
- `scripts/bench-webgpu.mjs` — GPU ms 컬럼 + `--enable-webgpu-developer-features` flag 추가

**P4-A 소행성대 N-body 편입** (#170)

- `?beltNbody=1` URL 옵트인 — 소행성대를 N-body 엔진에 편입
- **실측 WebGPU 226× @ N=5000, 286× @ N=10000** (vs barnes-hut CPU)
- `AsteroidBeltHandles.getNbodyState()` / `writeWorldPositions()` 추가
- `scripts/browser-verify-belt-nbody.mjs` — 3단계 회귀 가드 (6/6 통과)
- bench throughput ≥ 2× assertion 추가 (exit 1 on fail)

**P4-C 모바일 1차 게이트** (#171)

- `scripts/browser-verify-mobile-p4c.mjs` — iPhone 14 emulation 3 시나리오 (5/5 통과)
- 결과 리포트 자동 생성 (`docs/reports/p4c-mobile-YYYYMMDD.md`)
- 실기기 iPhone Safari 측정은 인계 (iOS 17.4+ WebGPU)

**회고** (#172)

- `docs/retrospectives/p4-retrospective.md` — 고정 4섹션
- P4-E(일반상대론) P5로 분리

### 수치 변화

- bench: WebGPU/BH = **0.45×(P3) → 226×(P4)** (소행성대 N-body 편입으로 가속 실제 측정 가능)
- 테스트: 287 → 290+ (GPU timer + state vector 가드 추가)
- 회귀 스크립트: +3종 (`verify:webgpu`, `verify:belt-nbody`, `verify:mobile-p4c`)

## [0.3.0-p3] — 2026-04-15

### P3 Barnes-Hut + WebGPU compute

**P3-0 준비**

- WebGPU 감지 + 자동 폴백 (`detectGpuCapability`, HUD dismissible notice) (#124)
- `bench:scene:sweep` N=5000/10000 확장 + CI bench 워크플로 timeout 30분 (#125)
- Engine selector 4-mode 확장 (`kepler|newton|barnes-hut|webgpu|auto`) (#126)

**P3-A Barnes-Hut (Rust/CPU)**

- Octree 데이터 구조 — flat `Vec<Node>`, leaf cap=1, MAX_DEPTH=24 (#130)
- COM + Salmon-Warren MAC tree-walk force (theta=0.5 max err **4.99e-9**) (#131)
- WASM `BarnesHutEngine` 노출 + Velocity-Verlet 통합 (#132)
- 1년 시뮬 정확도 검증 — Newton 직접합 대비 P3 계약 1e-3의 6 자릿수 여유 (#133)
- UI 활성화 + auto 모드 라우팅 (belt N≥1000 → barnes-hut) (#134)

**P3-B WebGPU compute**

- WebGPU compute 인프라 — `GpuComputeContext`, `GpuFloat32Buffer`, WGSL helpers (#143)
- N-body force WGSL shader — `workgroup_size=64` tiled algorithm (#144)
- V-V 적분 ADR + WGSL shader (`docs/decisions/20260415-webgpu-integration-scheme.md`, B 스킴 GPU-resident) (#145)
- `WebGpuNBodyEngine` JS 어댑터 + scene 라우팅 + UI 활성화 (capability 자동 폴백) (#146)
- 정확도 가드 + `bench:webgpu` 측정 도구 + p3b-perf.md (#147)

**P3-D 검증·마감**

- vsync 해제 throughput 측정 (`--disable-gpu-vsync` flag) — 가속비 측정 한계 박제 (#154)
- 종합 회귀 검증 287/287 통과 (Rust 22 + vitest 211 + browser-verify 54) (#155)
- v0.3.0 릴리스 (#156)

**아키텍처/데이터:**

- 신규 패키지 모듈: `packages/core/src/gpu/` (compute-context / buffer / wgsl-helpers / nbody-force-shader / nbody-vv-shader / capability)
- 신규 엔진: `BarnesHutNBodyEngine` (CPU/wasm) + `WebGpuNBodyEngine` (GPU)
- `PhysicsEngineKind`: `kepler|newton|barnes-hut|webgpu|auto` 5-mode
- harness v2.2.0 → v2.3.0 적용 (신규 페르소나 커맨드 7종 + ADR/회고 디렉토리)

**Known Issues / 인계:**

- WebGPU 가속비 측정 환경 한계: 헤드리스 Chromium ANGLE Metal에서 Babylon이 WebGL2 fallback 사용. webgpu URL은 capability 폴백으로 barnes-hut 라우팅. 실 측정은 데스크톱 Chrome Canary 또는 Babylon `useWebGPU: true` 명시 필요.
- 소행성대가 Kepler 해석해 + ThinInstances 렌더로 처리됨 — N-body 엔진 입력은 ~10 bodies. 'CPU 대비 webgpu ≥2× 가속'은 소행성대 N-body 통합(P4 후보) 후 재측정.
- WGSL f32 한정 정밀도 — 행성 SI 좌표(~1e11 m)에서 ~10km 단위 손실. 정밀 시뮬은 CPU 경로(`NBodySystem` f64) 사용.

**문서:**

- `docs/decisions/20260415-webgpu-integration-scheme.md` (ADR)
- `docs/benchmarks/p3a-barnes-hut-accuracy.md`, `p3a-perf.md`, `p3b-perf.md`, `p3d-comprehensive-verify.md`
- `docs/retrospectives/harness-update-2.2.0-retrospective.md` (P3 진행 중 회고)

## [0.2.0-p2] — 2026-04-15

### P2 태양계 확장 + Newton N-body

**P2-0 준비**

- PR 템플릿 브라우저 3단계 검증 필수 섹션 (#74)
- `verify:test-coverage` 워크스페이스 Vitest 가드 (#75)
- `updateAt` 프레임당 Map 재할당 제거 (#76)
- orbit 라인 LineSystem 통합 — draw call 9→1 (#77)
- `bench:scene` 자동 벤치 + baseline diff (#78)

**P2-A Newton N-body**

- `@astro-simulator/physics-wasm` 신규 크레이트 — Rust 1.94.1 + wasm-pack 0.14 (#84)
- Velocity-Verlet(Leapfrog) 적분기 — 1000년 에너지 드리프트 2.4e-9 (#85)
- WASM ↔ TS 바인딩 `NBodyEngine` + 씬 통합 (#86)
- Kepler 대비 정확도 검증: dt=10min 모든 행성 < 0.1% 오차 (#87)
- 시간 역행 대칭성 < 1e-9 상대 오차 (#88)
- Kepler↔Newton UI 토글 + URL `?engine=newton` (#89)

**P2-B 소천체 + 시각 스케일**

- 왜소행성 5개 (Ceres/Pluto/Haumea/Makemake/Eris) (#97)
- 혜성 3개 (Halley/Encke/Swift-Tuttle) (#98)
- 소행성대 ThinInstances `?belt=N` N=100~1000 (#99)
- 거리-의존 per-body 시각 스케일 — P1 Moon 버그 해결 (#100)

**P2-C 파라미터 + 북마크**

- 선택 천체 질량 슬라이더 0.1~10× (Newton 런타임 반영) (#107)
- 시간 포함 URL 북마크 버튼 (#108)
- "만약에" 프리셋 3종: jupiter-x10 / no-jupiter / sun-half (#109)

**P2-D 검증·마감**

- 장기 안정성: 9체 100년 드리프트 1.5e-10 (#115)
- 실 GPU(Apple M1 Pro): N=1000 소행성대에서 120 fps 달성 (#116)
- a11y 재검증 + MassSlider aria-label / Canvas tabindex 수정 (#117)

**아키텍처/데이터:**

- 바디 10 → **18** (sun + 8행성 + moon + 왜소행성 5 + 혜성 3)
- `NBodyEngine` 래퍼: `buildInitialState` + `advance(dtSeconds)` + 역행
- scene 옵션: `physicsEngine`, `asteroidBeltN`, `setBodyMassMultiplier`

**테스트 증분:** P1 139 → **P2 187 PASS** (core 128 + apps/web 54 + shared 4 + physics-wasm 1)

**성능:**

- 헤드리스 fps 감소(콘텐츠 추가 반영분, -16~20%)
- 실 GPU에서 N=1000까지 120fps vsync cap 도달

**알려진 제약:**

- 소행성대는 Kepler 전용 — Newton 합류 시 O(N²) 폭발. P3 GPU compute에서 재검토
- macOS Chromium만 실 GPU 측정 — Linux/Windows/모바일은 P3 후속
- 혜성 비중력 효과(태양풍) 미반영 — ±2% 정확도 한계
- 질량 변경 후 시간 역행으로 원 상태 복원 불가 — 프리셋 원복으로 암묵 리셋

## [0.1.0-p1] — 2026-04-14

### P1 태양계 MVP

**신규 기능:**

- 태양 + 행성 8개 + 달, J2000.0 기준 Kepler 궤도 해석해
- 시간 컨트롤 (재생/일시정지/역행, 6 프리셋 1s~10y)
- 카메라 포커스 전환 애니메이션 (300ms ease-out)
- 4모드 UI 프레임 (관찰/연구 활성, 교육/샌드박스 예약)
- 모드별 사이드 패널 (CelestialTree + CelestialInfoPanel + TierBadge)
- 스케일 컨트롤 (로그 슬라이더 0.01~100 AU)
- DateTimePicker + UnitToggle + URL 상태 동기화
- 국제화 (ko/en)
- 흑체복사 기반 다크 디자인 토큰

**아키텍처:**

- 이중 레이어 — 순수 TS 코어 (`@astro-simulator/core`) + Next.js UI (`apps/web`)
- CPU float64 + GPU RTE float32 좌표계
- Floating Origin (B4) — 10^13m 거리 정밀도 검증
- Logarithmic depth buffer — 근/원 동시 렌더
- WebGPU-first + WebGL2 폴백 (adapter 사전 판별)

**데이터:**

- JPL/Standish 1992 기준 10개 천체 궤도 요소
- Zod 런타임 검증

**테스트:**

- 130개 단위 테스트 (core 89 + shared 4 + web 37)
- Playwright E2E: browser/mobile/scale/perf/a11y 5개 스위트
- JPL 공칭값 대비 궤도 요소/공전주기/거리 경계 ±1% 검증
- axe-core WCAG 2.1 AA 위반 0건
- 색약 시뮬 검증 (protanopia/deuteranopia/tritanopia)

**성능 (Playwright headless):**

- 정지/재생 36~38 FPS
- 포커스 상태 90+ FPS

**알려진 제약:**

- WebGPU 실환경 검증은 수동 (헤드리스 chromium 미지원)
- 행성 시각 크기 × 500 배율로 표시 (실제 크기는 점으로 보이는 문제 회피)
- Moon은 지구 시각 메쉬 내부에 위치 (per-body 스케일은 P2)
- 로그 시간 스크러버는 P2로 연기
- 시각 북마크(스냅샷 URL)는 P2로 연기

### 변경

- 해당 없음 (초기 릴리스)

### 수정

- Next 16 `middleware` → `proxy` 파일 컨벤션 대응 (PR #53)
- WebGPU 초기화 실패 시 Babylon 내부 console.error 오염 제거 (PR #54)
- URL 상태 동기화 무한 루프 방지 (PR #67)
