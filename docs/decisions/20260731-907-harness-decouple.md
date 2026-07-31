# ADR: 하네스 동기화 디커플 — 주기 동기화 중단 + upstream 읽기 전용 강등 + 기계장치 청산

- 일자: 2026-07-31
- 상태: Provisional
- 관련: 이슈 [#907](https://github.com/coseo12/astro-simulator/issues/907), 전수 감사 D3 (2026-07-31), 설계 SSoT `.context/design-907.md` (untracked 인수인계 문서 — 실측 근거는 본 ADR 에 전사), ADR [20260515-harness-managed-divergent-pattern.md](20260515-harness-managed-divergent-pattern.md) (본 ADR 로 **Superseded**), ADR [20260419-prettier-harness-conflict.md](20260419-prettier-harness-conflict.md) (본 ADR §결정 4 가 대체 — Superseded 전이는 Phase B 기계 제거와 동시 수행)

> 상태 워크플로: cross-validate 발동 대상 (ADR 신규 + 프로젝트 원칙 선언 이중 해당) 이므로 **Provisional** 로 박제한다. cross-validate (agy) 결과를 §교차검증 반영 사항으로 통합한 후 `Accepted (cross-validate YYYY-MM-DD)` 로 전이한다 (CLAUDE.md §ADR Status 워크플로 — #370 옵션 C).

## 배경 (전수 감사 D3 실측, 2026-07-31)

본 프로젝트는 coseo12/harness-setting (upstream) 의 워크플로 하네스를 `harness update` 주기 동기화로 소비해 왔고, upstream 과의 이격 (drift) 을 관리하기 위해 Z 패턴 (ADR 20260515 — 프로젝트 선반영 + upstream 기여 병행) 과 그 유지 기계장치 (manifest / 불변식 가드 A~D / drift 데코레이터 판정 / 원자적 apply 래퍼 / Z 패턴 health 자기-거버넌스) 를 누적 구축했다. 2026-07-31 전수 감사 D3 차원이 이 구조의 비용/편익을 실측했다:

- **동기화 기계장치 ~10.1k 줄 vs 보호 대상 11.3k 줄 (비율 0.9:1)** — 가드가 보호 대상 본체만큼 크다
- **7월 한 달 churn 의 30.9%** 가 하네스 유지보수 (Amendment 17~20, 불변식 A~D, safe wrapper 등) 에 소비됨
- **upstream 순유입 0** — 최근 동기화 방향은 다운스트림 → upstream 역방향 기여뿐. Z 패턴의 Phase 2 편익 (upstream 머지 후 자동 전파로 drift 해소) 이 소멸한 상태
- 반면 **`.claude` 페르소나 파이프라인 (4,629줄) 은 리뷰 차단 실효 21%** 로 가치가 입증됨 — 문제는 파이프라인이 아니라 동기화 기계장치
- 본 결정의 집행 설계 실측 (2026-07-31, 기준 커밋 `a638a6c`): 삭제 대상 **19파일 8,537줄** + 부분 삭제 ~240줄 − 신규 상쇄 ~220줄 = **순감 ≈8,550줄** (보수 범위 8,300~8,700 — 이슈 추정 7.8k 상회, ADR/CHANGELOG 상쇄분 반영)

## 후보 비교

| 축                              | (a) 현행 유지 (Z 패턴 지속)                     | **(b) 클린 청산 (채택)**                   | (c) 동결 (기계 유지·실행만 중단)                                                      |
| ------------------------------- | ----------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------- |
| 유지보수 churn                  | 30.9% 지속                                      | **0**                                      | 죽은 코드 8.5k 잔존 — 미실행 가드는 조용히 부식 (#840 "CI 통과 ≠ 테스트 실행" 클래스) |
| upstream 유입 가치              | 실측 0 (Phase 3 자동 전파 편익 소멸)            | 필요 시 수동 cherry-pick                   | 동결 해제 시점에 기계가 이미 낡음                                                     |
| 파이프라인 실효 (리뷰 차단 21%) | 유지                                            | **유지 (`.claude` 프로젝트 소유 전환)**    | 유지                                                                                  |
| 리스크                          | 기회비용 누적 (churn 30.9% 가 제품 개발을 잠식) | 재도입 비용 (§재검토 조건의 트리거로 관리) | 최악 — 비용은 내고 편익은 정지                                                        |

**사용자 결정 (2026-07-31)**: (b) — "불필요한 수준이면 깨끗하게 제거, 필요한 내용 (CLAUDE.md 설정 같은 핵심) 만 유지". 감사 시나리오 (ii) 의 클린 변형 채택.

## 결정

1. **`harness update` 주기 동기화 중단** — upstream coseo12/harness-setting 은 **읽기 전용 부트스트랩 템플릿으로 강등** (본 저장소가 upstream 을 주기적으로 당겨오지 않으며, upstream 저장소 자체에는 별도 조치 없음)
2. **`.claude/` / `CLAUDE.md` / 프로젝트 가드 스크립트의 프로젝트 소유 전환** — "harness-managed (frozen)" 개념 소멸. 페르소나 파이프라인·가드는 본 저장소가 직접 소유·진화
3. **동기화 전용 기계장치 제거** — manifest (`.harness/manifest.json`, `.harnessignore`) / 불변식 가드 (`verify-harness-upstream-baseline.mjs`) / drift 판정 (`verify-harness-drift-decorator.mjs`, `resolve-harness-drift-todo.mjs`) / 원자적 apply 래퍼 (`harness-update-safe.sh`) / Z 패턴 health (`verify-z-pattern-health.mjs`) / manifest 파생 sync (`sync-harnessignore.mjs`, `sync-prettierignore.mjs`) 등 삭제 19파일 8,537줄 (전수 인벤토리는 §배경 실측 + Phase B PR 의 `git diff --stat` 로 확정)
4. **`.prettierignore` 는 manifest 파생 자동 생성 → 정적 curated 섹션 전환** — prettier 재포맷이 에이전트 `.md`/`CLAUDE.md` 의 원문 문자열 매칭 SSoT 가드 (`verify-agent-ssot.sh` 등) 를 깨는 것을 방지. 기존 live 문서 예외 4경로 (`docs/benchmarks/**`, `docs/phases/**`, `docs/reports/**`, `docs/retrospectives/p*-retrospective.md`) 는 `!` negation 으로 포맷 대상 유지 (ADR 20260419-prettier-harness-conflict 의 대체 규약)
5. **`harness-guards.yml` → `project-guards.yml` 재편** — harness 전용 3 스텝 제거 + 프로젝트 가드 6 스텝 유지, 전 스텝 `hashFiles` 조건 제거 (부재 = 가드 삭제 회귀 = hard fail 의 fail-fast 일관, #901 흡수)

### 유지 / 제거 경계 (결정의 적용 범위)

- **유지 (프로젝트 소유 전환)**: `.claude/` 전체 (agents 5종 / skills / hooks 3종 / settings.json), `CLAUDE.md` (동기화 전제 섹션만 Phase C 슬리밍), 프로젝트 보호 가드 (`verify-zombie-check` / `verify-dead-wait-check` / `verify-docs-links` / `verify-claudemd-size` / `verify-agent-ssot` 등 — 하네스 동기화와 무관하게 이 저장소를 보호), `docs/lessons/`·`docs/decisions/` (이력·지식 보존 — ADR 20260515 는 Superseded 전이하되 본문·Amendment 1~20 불변), `harness-pr-review.yml` (실체는 `stage:review` 라벨 자동 부착 = 페르소나 파이프라인 구동부 — 제거 후보 오인 주의)
- **제거**: 위 §결정 3 의 동기화 전용 기계장치 + 동기화 전제 문서 (`docs/harness-ci-migration.md` 등 — 지식 원본은 volt / git 이력에 보존)

### Phase 분리 (집행 경로)

- **Phase A (본 ADR)**: 결정 박제 — ADR 신설 (Provisional) + ADR 20260515 Superseded 전이 + cross-validate 1회 후 Accepted 전이. 문서만이므로 단독 배포 시에도 기계장치는 정상 동작 (backward-compat 완전)
- **Phase B**: 기계장치 제거 + 잔존 참조 정리 + CI 재편 (§결정 3·4·5 집행). ADR 20260419-prettier-harness-conflict Superseded 전이 동반
- **Phase C**: CLAUDE.md 슬리밍 (≤35,000 chars — `verify-claudemd-size` WARN 해소) + obsolete 이슈 정리 (#898 / #901 / #769)
- Phase B/C 는 상호 결합 (B 만 선행하면 CLAUDE.md 가 소멸한 명령을 지시하는 dead reference 창이 열림 — 주석 계약 vs 구현 drift 교훈) 이므로 **PR 2개 (A / B+C 통합) + 단일 MINOR 릴리스** 로 집행

## 결과 / 재검토 조건 (재도입 트리거)

- upstream 신규 릴리스는 **수동 검토 → 필요 파일만 cherry-pick** (기계 동기화 부활 아님). 신규 프로젝트 부트스트랩은 upstream 템플릿을 직접 사용 (본 저장소 경유 아님)
- **재도입 트리거** (충족 시 별도 ADR 로 기계 동기화 재평가):
  1. upstream 유입이 **분기당 2회 이상 실제 채택**으로 관찰되고, 수동 cherry-pick 비용이 **회당 1시간 초과 상태 2회 연속**일 때
  2. **다운스트림 프로젝트 2개 이상에서 동일 하네스 재사용 필요**가 발생할 때 (multi-project SSoT 편익이 부활하는 조건)
- upstream 이슈 #325/#328/#329 는 사용자 판단으로 유지/종결 (본 ADR 무조치)
- Z 패턴 용어·절차 (glossary / CLAUDE.md 카드) 는 Phase B/C 에서 "폐기 (2026-07-31, #907)" 로 표기 전환 — 이력 추적성을 위해 용어 항목 자체는 유지
