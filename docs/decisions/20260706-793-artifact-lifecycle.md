# ADR 20260706-793 — 산출물 수명주기 규약 (verify / reports / \_debug / 스크래치 처분 기준)

- **상태**: Accepted (cross-validate agy 2026-07-06)
- **관련**: [#793](https://github.com/coseo12/astro-simulator/issues/793) (본 이슈, 2026-07-04 회고 발원), [#759](https://github.com/coseo12/astro-simulator/issues/759) (verify 4종 선커밋), volt [#67](https://github.com/coseo12/volt/issues/67) (\_debug 즉시 rm 패턴), [`20260628-756`](20260628-756-procedural-planet-surface.md) §ADR embed 표준 (#382)

## 배경

qa/dev 산출물 (browser-verify 스크립트 / docs/reports 스크린샷 / \_debug 임시 스크립트 / 세션 스크래치) 의 수명주기 규약이 없어 커밋 기준이 세션마다 상이했다 (2026-07-04 프로젝트 회고 실측):

- **untracked 누적**: 워크스페이스에 21건 — reports 디렉토리 5개 + verify 4종 + `_debug-783-camera-tmp.mjs` (volt #67 "사용 후 즉시 rm" 위반 잔존) + 루트 stray png + `.logs/`
- **커밋 기준 비일관**: #782 verify 는 커밋 / #756~#774 는 미커밋. `docs/reports/` 기커밋분 이미 **21MB** (png 누적, 저장소 비대화)
- **위치 이원화**: verify 스크립트가 root `scripts/` (#738) vs `apps/web/scripts/` (나머지 현행)

**착수 시점 실측 재검증** (volt #14/#67 인계 재검증 패턴): #759 (v0.46.0) 가 verify 4종 (756/762/773/774) 커밋 + `_debug` rm 을 이미 해소 — 잔존은 **15건 ~20MB** (reports 미참조 스크린샷 14건 + `.logs/` + stray png).

## 후보 비교

| 축                     | 후보                                                                                                                                                      | 판정                                                                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **reports 커밋 기준**  | (a) 전부 커밋 / (b) 전부 rm / **(c) ADR·PR embed 참조분만 커밋, 나머지 rm**                                                                               | **(c) 채택** — embed (#382 표준) 는 파일 실재가 렌더 전제. 나머지는 PR 코멘트 텍스트 증거로 족함 (경로 언급 ≠ embed). (a) 는 저장소 비대화 가속 (기커밋 21MB), (b) 는 forensic ADR 렌더 파괴 |
| **세션 스크래치 로그** | (a) `.logs/` 를 .gitignore 추가 / **(b) `.claude/logs/` (기존 gitignored) 로 통일 + `.logs/` 금지**                                                       | **(b) 채택** — (a) 는 silent 누적 (git status 감지 신호 상실). cross-validate 스킬 기본 `LOG_DIR` 도 이미 `.claude/logs/`                                                                    |
| **verify 위치 단일화** | (a) root `scripts/` 20종 전부 이동 / **(b) 신규 의무 + legacy 동결, 현행 시대 이원화 #738 만 이동**                                                       | **(b) 채택** — legacy 20종 이동은 참조 연쇄 (root package.json 등록 17건 + ADR 이력 참조) 비용 > 가치. #738 은 자기완결적 (외부 상대 import 0, `__dirname` 기준 출력) 으로 이동 비용 최소    |
| **에이전트 처분 의무** | (a) SSoT 코어 JSON 필드 추가 (5 파일 동기 + `verify-agent-ssot.sh` + upstream 스키마 개정) / **(b) 필드 설명 bullet + 자가 점검 항목 (JSON 스키마 불변)** | **(b) 채택** — measurement-first: 게이트 비용 최소로 시작, 처분 누락 재발 실측 시 필드 승격 (§재검토 조건 2). (a) 는 스키마 개정 왕복 비용이 현재 발화 빈도 대비 과잉                        |

## 결정 (규약 5항)

> **적용 범위**: 로컬 워크스페이스에서 qa/dev/메인이 생성하는 산출물. CI 자동 생성 산출물은 GitHub Actions artifact retention (예: shader-pixel-guard 7일) 으로 저장소 밖 관리 — 본 규약 범위 밖.

1. **`docs/reports/`** — ADR/PR 본문에서 **markdown embed 로 참조되는 파일만 커밋** (`![...](../reports/...)` — #382 표준). 나머지 스크린샷/중간 산출물은 세션 종료 전 rm. 기커밋 21MB 는 소급 정리 **비대상** (history rewrite 리스크 — 비목표).
2. **verify 스크립트** — 커밋 의무 (재현 가능 검증 자산). 신규 파일 위치는 **`apps/web/scripts/`** 단일, npm 등록은 **`apps/web/package.json`** (#759 표준). legacy root `scripts/` 스크립트는 동결 (이동 금지 아닌 이동 불요 — 참조 이력 보존). 현행 시대 유일 이원화였던 `browser-verify-738-starfield.mjs` 는 본 PR 에서 이동 (root package.json 등록 경로만 갱신 — 기존 root 등록 패턴 3건과 동일 형식).
3. **`scripts/_debug-<topic>-tmp.mjs`** — 사용 후 **즉시 rm** (volt #67 재확인). 세션 넘김 금지.
4. **세션 스크래치** (드래프트 md / cross-validate 로그 / dev 로그) — **`.claude/logs/`** (gitignored) 사용. `.logs/` 등 비표준 디렉토리 신설 금지. 기존 `.logs/` 는 본 PR 에서 rm (ADR `20260512-au-slider-semantics.md` 의 `.logs/cv-400-*.log` 경로 언급은 워크스페이스 로컬 참조였으므로 저장소 관점 기변경 없음 — 커밋된 적 없는 파일).
5. **qa/dev 반환 직전 산출물 처분 확인** — `git status --porcelain` 카나리아로 자신이 생성한 untracked 산출물을 확인하고 본 규약대로 처분, 처분 불가 잔존물은 `non_blocking_suggestions` 에 경로 목록 인계 (규격: 기존 필드 스키마 그대로 문자열 배열, 원소 = 저장소 상대 경로 + 1줄 사유 — 예: `"docs/reports/799-x/shot.png — embed 미확정, 메인 판단 대기"`). `.claude/agents/{qa,developer}.md` 는 harness-managed 이므로 **Z-패턴** 적용 (Phase 1 선반영 + 데코레이터 + Phase 2 upstream PR [harness-setting#309](https://github.com/coseo12/harness-setting/pull/309) — 본 PR 에서 수행).

## 결과 · 재검토 조건

**일괄 처분 실측 (2026-07-06, 본 PR)**:

- rm 15건 ~20MB — `docs/reports/{756-surface,773-light,774-sun,782-rotation,783-earth}/` 전체 + `762-monotonic/qa-762-*` 8건 (ADR 762 embed 는 기커밋 `762-*` forensic 세트만 — qa 세션분 참조 0 확인) + 루트 `1-static-focus-sun.png` + `.logs/` (35건). 처분 전 `/tmp/793-disposed-artifacts-backup-20260706.tar.gz` 백업.
- 이동 1건 — `browser-verify-738-starfield.mjs` → `apps/web/scripts/` (`node --check` PASS + **runtime 스모크**: dead server 대상 실행으로 모듈 해석·playwright 기동까지 정상 진행 후 `ERR_CONNECTION_REFUSED` 에서만 실패 확인 — 경로/의존성 해석 실증. CI/workflow 참조 0 확인).
- 백업 성격 — `/tmp/793-disposed-artifacts-backup-20260706.tar.gz` 는 처분 직전 일회성 안전장치 (로컬 /tmp, 재부팅/주기 정리 시 소멸). 규약상 처분 확정본이므로 영구 보존 대상 아님.

**재검토 조건**:

1. embed 외 커밋 필요 사례 등장 (예: 외부 문서가 raw URL 로 reports 참조) → 규약 1 항 예외 절차 신설
2. 처분 누락 재발 **≥ 2회/월** 실측 → 규약 5 항을 extends JSON 필드 (`artifacts_disposed`) 로 승격 (후보 (a) 재평가). 대안 병기 (cross-validate agy 권고): pre-commit hook 에서 `_debug-*-tmp.mjs` / `.logs/` staged 감지 시 차단 — 단 발화 0 상태 선제 도입은 가드 과잉 (measurement-first), 재발 실측 시 필드 승격과 비교 평가
3. legacy root `scripts/` 정리 수요 발생 (참조 정리 포함) → 별도 이슈 분리 (본 ADR 범위 밖). 동결 상태 식별이 어려워지면 (cross-validate agy 권고) `scripts/README.md` 동결 선언문 신설을 같은 이슈에 포함

## 교차검증 반영 사항 (agy, 2026-07-06 — 로그 `.claude/logs/cross-validate-architecture-20260706-181307.log`)

- **합의**: 결정 4축 전부 승인 — (c) embed 기준 "훌륭한 타협점" / (b) measurement-first "오버엔지니어링 회피 패턴" / history rewrite 회피 "현실적·안전" / 재검토 조건 정량화 "우수"
- **수용 5건**: (1) 738 이동 runtime 스모크 실행 (§결과 실측 보강 — node --check 만으론 불충분 지적 타당), (2) `non_blocking_suggestions` 경로 목록 규격 명시 (결정 5 항), (3) 백업 tar 보존 성격 명시 (§결과), (4) CI 산출물 적용 범위 밖 명시 (§결정 서두), (5) pre-commit hook 대안 + legacy README 를 재검토 조건에 병기 (즉시 도입은 발화 0 상태 가드 과잉으로 이연)
- **이견 → 반려 2건**: (1) 백업 공유 저장소 이관 (공동 작업자 접근) — 1인 개발자-AI 페어 전제와 불일치, (2) Z-패턴 세부 명세 ADR 부록 — `20260515-harness-managed-divergent-pattern.md` 가 SSoT (중복 박제 금지)
- **Claude 편향 셀프 체크**: "규약 문서만으로 충분" 편향 가능성 → 에이전트 .md bullet (Z-패턴) 동반으로 이미 완화, hook 은 재검토 조건으로 관찰 계약화
