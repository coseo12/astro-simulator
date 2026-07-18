# docs/lessons/ — 실전 교훈 모음

CLAUDE.md `## 실전 교훈` 섹션에서 추출된 상세 문서 디렉토리. CLAUDE.md 본문은 1~3 줄 포인터만 유지하고, 전문은 이 디렉토리의 개별 파일에 박제한다.

## 디렉토리 원칙

- **1 블록 = 1 파일** (kebab-case) — CLAUDE.md `### <제목>` 블록 당 `docs/lessons/<kebab>.md` 한 파일
- **원본 출처 명시** — 각 파일 상단에 `> **근거**: harness #<PR 번호> Phase 3-X 에서 추출` 라인 필수
- **볼트 이슈 ↔ 레슨 매핑** — 볼트 knowledge 이슈 (coseo12/volt) 가 본 파일의 근거 체인
- **신규 파일 추가 시 본 README 동기화 필수** — `scripts/verify-lessons-readme.sh` 가 CI 에서 drift 차단

## 파일 목록

| 파일 | 요지 | 관련 볼트 이슈 |
|---|---|---|
| [ci-and-downstream-verification.md](ci-and-downstream-verification.md) | CI 초록 체크 ≠ 테스트 실행 + upstream 3중 방어의 다운스트림 blindspot. `[실측]` / `[가정]` 라벨 규약 + 박제 문턱 공식 | [#48](https://github.com/coseo12/volt/issues/48) / [#60](https://github.com/coseo12/volt/issues/60) |
| [comment-implementation-drift.md](comment-implementation-drift.md) | 파일 상단 주석이 선언한 계약이 구현에 반영되지 않는 drift 는 default fallback 이 조용히 흡수하는 버그 생성원 | [#49](https://github.com/coseo12/volt/issues/49) |
| [data-not-code-extension.md](data-not-code-extension.md) | 레이어/플러그인/스키마 구조에서 "데이터만 추가, 코드 변경 0" 을 ADR Concrete Prediction 으로 박제하여 추상화 건강성 실증 + 흩어진 상수 drift 자동 생성 vs 정적 가드 구분 | [#47](https://github.com/coseo12/volt/issues/47) / [#120](https://github.com/coseo12/volt/issues/120) |
| [dead-wait-guard.md](dead-wait-guard.md) | 세션 중단 시 background 대기·sub-agent 가 SIGKILL 소멸 → 무기한 침묵(dead-wait). ScheduleWakeup heartbeat + SessionStart 훅 + 대기 상태 파일 3계층 직교 방어 | [#121](https://github.com/coseo12/volt/issues/121) |
| [gh-cli-execsync-pitfall.md](gh-cli-execsync-pitfall.md) | Node.js execSync 가 gh CLI body 의 백틱/$/!/;  등 shell metachar 를 해석해 silent syntax error — spawnSync + stdin 3축 우회 의무 | [#114](https://github.com/coseo12/volt/issues/114) |
| [guard-design-principles.md](guard-design-principles.md) | 가드 설계 3원칙 — measurement-first (broad 권고 → 실측 precision) / 의식적 silent 약화 (운영 피로 ≥ 1/주 시 Amendment) / fail-fast (fallback 금지) | [#101](https://github.com/coseo12/volt/issues/101) / [#106](https://github.com/coseo12/volt/issues/106) / [#107](https://github.com/coseo12/volt/issues/107) |
| [guard-pr-dod.md](guard-pr-dod.md) | 가드 도입 PR DoD 4축 — 격리 동적 테스트 / 3중 시뮬레이션 / 5 페르소나 self-consistency / 메타 측정 안정성 | [#96](https://github.com/coseo12/volt/issues/96) / [#100](https://github.com/coseo12/volt/issues/100) / [#109](https://github.com/coseo12/volt/issues/109) / [#112](https://github.com/coseo12/volt/issues/112) |
| [headless-browser-verification.md](headless-browser-verification.md) | Playwright headless + swiftshader 는 3D/WebGPU 경로에서 부분 freeze false positive. 실 Chrome GUI 수동 검증 필수 | [#33](https://github.com/coseo12/volt/issues/33) |
| [manifest-partial-failure-recovery.md](manifest-partial-failure-recovery.md) | 매니페스트와 디스크가 어긋난 부분 실패 교착 — 즉시 복구 절차 + formatter 재포맷 drift + v2.8.0/v2.9.0 코드 레벨 원자성 개선 이력 | [#27](https://github.com/coseo12/volt/issues/27) / [#13](https://github.com/coseo12/volt/issues/13) / [#35](https://github.com/coseo12/volt/issues/35) |
| [monorepo-dist-stale.md](monorepo-dist-stale.md) | pnpm workspace 등에서 core 패키지 `src/` 수정이 dev 서버의 `dist/` 아티팩트에 미반영 — QA 결정적 동일 실패 재현 시 dist stale 가설 우선 | [#70](https://github.com/coseo12/volt/issues/70) |
| [no-op-adr-pattern.md](no-op-adr-pattern.md) | 인계 항목 실측 재검증 — 환경 변화로 이미 해소된 항목은 NO-OP ADR + 회귀 가드. Explore 미결정 시 debug 스크립트 runtime 실측 선행 | [#14](https://github.com/coseo12/volt/issues/14) / [#67](https://github.com/coseo12/volt/issues/67) |
| [session-intent-drift.md](session-intent-drift.md) | 세션 의도 이탈 감지 (메인 오케스트레이터) — 4 시그널 중 2 충족 시 사용자 명시적 선택 요청 + 사전 분리 + escape hatch 방지 | [#63](https://github.com/coseo12/volt/issues/63) / [#24](https://github.com/coseo12/volt/issues/24) / [#34](https://github.com/coseo12/volt/issues/34) |
| [sprint-contract-roi.md](sprint-contract-roi.md) | 스프린트 계약 재조정 — ROI 5문 + 보강 3문 + 순수 함수 추출 우선 + 수치 DoD 4단계 + 메인 오케스트레이터 SSoT JSON 부호 규약 자기 점검 | [#71](https://github.com/coseo12/volt/issues/71) / [#32](https://github.com/coseo12/volt/issues/32) / [#53](https://github.com/coseo12/volt/issues/53) / [#73](https://github.com/coseo12/volt/issues/73) / [#75](https://github.com/coseo12/volt/issues/75) |
| [strict-principle-dynamic-context.md](strict-principle-dynamic-context.md) | 단일 축 엄격 원칙 + 동적 적응 부재는 자동 검증 PASS / 실사용 실패를 생성 (뷰포트·해상도 등 동적 문맥 시뮬레이션 필수) | [#68](https://github.com/coseo12/volt/issues/68) |
| [sub-agent-multiturn-drift.md](sub-agent-multiturn-drift.md) | sub-agent multi-turn 세션에서 세부 매트릭스가 라운드 간 이탈. SendMessage 로 이전 라운드 매트릭스 재첨부 필수 | [#34](https://github.com/coseo12/volt/issues/34) / [#76](https://github.com/coseo12/volt/issues/76) |
| [sub-agent-ssot-handoff.md](sub-agent-ssot-handoff.md) | sub-agent 외부 가시성 박제 9 필드 SSoT + bg 프로세스 인계 + 메인 단계 게이트 + closing keyword base=develop 함정 통합 | [#24](https://github.com/coseo12/volt/issues/24) / [#46](https://github.com/coseo12/volt/issues/46) / [#52](https://github.com/coseo12/volt/issues/52) / [#77](https://github.com/coseo12/volt/issues/77) / [#115](https://github.com/coseo12/volt/issues/115) / [#117](https://github.com/coseo12/volt/issues/117) |
| [ux-dod-vs-product-behavior.md](ux-dod-vs-product-behavior.md) | 수치 DoD 전부 PASS 여도 사용자가 인지하는 제품은 회귀 가능. 원칙 폐기 ADR 은 downstream UX 계약 재검증 동반 + UX DoD 별도 박제 필수 | [#72](https://github.com/coseo12/volt/issues/72) / [#74](https://github.com/coseo12/volt/issues/74) |
| [verify-script-authoring.md](verify-script-authoring.md) | `verify-*.sh` 작성 모범 — macOS bash 3.2 호환 (parallel index array + `sort -u`) + 격리 동적 테스트 (mktemp + env override + 4~5 케이스) | [#95](https://github.com/coseo12/volt/issues/95) / [#98](https://github.com/coseo12/volt/issues/98) |
| [workflow-dispatch-pitfalls.md](workflow-dispatch-pitfalls.md) | GitHub Actions 4 함정 — `workflow_dispatch` default branch 종속 + PR 자동 생성 권한 + YAML 1.1 `on:` boolean coercion + block scalar heredoc indent | [#45](https://github.com/coseo12/volt/issues/45) / [#102](https://github.com/coseo12/volt/issues/102) / [#103](https://github.com/coseo12/volt/issues/103) |

## 신규 파일 추가 루틴

1. 새 블록이 CLAUDE.md 에서 추출 대상이 되면 `docs/guides/claudemd-governance.md` §5 가지치기 프로토콜 확인
2. 파일명은 kebab-case (`<topic>.md`), `## <제목>` / `> **근거**: ...` / `## 근거` 섹션 포함
3. **본 README 의 "파일 목록" 표에 한 줄 추가** — 파일 / 요지 / 관련 볼트 이슈
4. `bash scripts/verify-lessons-readme.sh` 로 동기화 확인 후 커밋

## 관련 가이드

- [docs/guides/claudemd-governance.md](../guides/claudemd-governance.md) — CLAUDE.md 비대화 방지 9 섹션 지침 (임계 / 가지치기 / 예외 ADR 등)
- [docs/plans/phase3-extraction-plan.md](../plans/phase3-extraction-plan.md) — 본 디렉토리를 도입한 Phase 3-A 설계 계획
