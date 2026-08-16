# ADR: branch protection required status check 정책 — main 한정 단계적 도입, develop 은 required check 미채택 (#971)

- **상태**: **Accepted** (2026-08-08 — §10-2 전이 조건 **6/6 전건 충족**. cross-validate agy 3회 반영 §11 / reviewer 정적 리뷰 **4회** 반영 — 아래)

  | 전이 조건 | 충족 근거 |
  |---|---|
  | 1. 사용자 §8 적용 승인 | 2026-08-07 |
  | 2. release PR G1+G2 동시 실측 | v0.62.0 ([#985](https://github.com/coseo12/astro-simulator/pull/985)) — `cancelled` **7 → 0** |
  | 2-bis. P1-G 통과 | S1~S4 전건 + 빈 출력 |
  | 3. Phase 1 후 release PR 1건 오차단 0 | **v0.63.0** ([#992](https://github.com/coseo12/astro-simulator/pull/992)) — required 3종 전부 `success`, `mergeStateStatus=CLEAN` |
  | 4. §9 롤백 런북 링크 | [#986](https://github.com/coseo12/astro-simulator/pull/986) |
  | 5. 다음 release PR 관찰 | v0.62.0 |
  | 6. Phase 0 이후 head 로 P1-G 재실행 | `2553c80` |

  > **A1 실행: 2026-08-08** (#985 head 인용 `05:30Z` 이후 ~ #992 머지 `13:33Z` 이전). 조건 **2·5·6 은 v0.62.0 단일 사건이 동시 충족**한 것이며(§10-2 부기가 설계 의도로 명시), 중복 계상이 아니다.
  >
  > ⚠️ **Accepted 는 한계를 닫지 않는다** — §10-1 **한계 13개**(특히 한계 13 *"동명 축 열거 미완결"*)와 §10-5 **재검토 조건 12개**는 전이 이후에도 **그대로 유효**하다.
  >
  > — **승계 부기 (2026-08-14, [#1035](https://github.com/coseo12/astro-simulator/issues/1035))**: 위 *"재검토 조건 12개"* 는 **Accepted 전이 시점(2026-08-08) 값**이다. 이후 §10-5 에 **재검토 조건 13** (`pr-template-checklist` escape 재발 → 결정 9-1 재검토) 이 신설돼 **현재 13개**다. 원문은 이력이므로 치환하지 않는다.
  >
  > — **승계 부기 2 (2026-08-14, [#1027](https://github.com/coseo12/astro-simulator/issues/1027))**: **재검토 조건 14** (`branch-name` base 편집 우회 escape 재발 → `types` 에 `edited` 추가안 재검토) 가 신설돼 **현재 14개**다. 위 두 수치 (`12` / `13`) 는 각 시점 값이므로 치환하지 않는다. ⚠️ 본 신설은 **§10-5 additive** 이며 **§결정 1 · §결정 9-1 · Phase 1 면제 근거 · 조건 13 은 전부 무접촉**이다 (본 ADR 상태도 `Accepted` 유지).
  >
  > — **승계 부기 3 (2026-08-16, [#1073](https://github.com/coseo12/astro-simulator/issues/1073))**: 조건 **개수는 14 로 불변**이고 **조건 13 내부**가 개정됐다 — ① «관측 주체 · 주기 · 실패 시 조치» 서브블록 신설 (실행 주체 = 비-required workflow, 판단은 사람) ② **관측 시점 정정** (초판 _"release PR 1건"_ → 그 사이클의 **릴리스 클래스 머지 PR 전건** — 초판이 모집단 (1) 의 진부분집합이라 prep PR 이 빠졌다). 판정 근거는 ADR [20260816-1073](20260816-1073-clause13-observation-wiring.md). ⚠️ **§결정 1 · §결정 9-1 · §결정 9-2 · Phase 1 면제 근거 · 조건 14 는 전부 무접촉**이고 저장소 보호 설정 변경 `0` 이다 (본 ADR 상태도 `Accepted` 유지).

  > **조건 3 의 핵심 관측**: release PR #992 head `614f1d9` 에서 `project-guards` 가 **`n=2` 인 채 둘 다 `success`** 였고 GitHub 이 머지를 허용했다. §2-11 이 예측한 *"Phase 0 는 동명을 없애는 게 아니라 **완주 쌍을 늘린다**. 그럼에도 전부 통과 결론이면 어떤 해석 규칙에서도 통과한다"* 가 **required check 하에서 실증**된 것이며, §2-2 가 *"미문서화"* 로 분류한 동명 해석 규칙이 **적어도 전부 `success` 인 경우에는 통과**임이 관측으로 확인된다. ⚠️ **다만 규칙 자체는 미판별이다** — `{success, success}` 는 세 해석 규칙(latest / all-must-pass / first)이 **같은 답**을 내므로 어느 규칙인지 구별되지 않는다. **불일치 시 동작은 여전히 미관측**이고(표본 n=1), §2-2 의 미기술 행과 §10-4 단계 2-bis(**미실행**)는 유효하다. Phase 2/3 은 별도 판단 (§6 결정 1).

- **errata 정정 (Accepted 전이 동봉, 2026-08-08)**: reviewer 가 4라운드에 걸쳐 지적한 4클래스 8줄. ① 결정 5 의 `§8-R1/R2/R3` → 실제 **§9** (5곳) ② §10-6 *"**실측** 2초"* → **추정** (R1~R4 실 발동 이력 **0**) ③ §9 *"2~3초"* 동일 ④ §9-R1 검증 줄의 `→ null` → **`| tojson` 필수** — 없으면 미적용 시 **빈 줄**이 나와 *"조용한 실패"* 와 구분되지 않는다. ④ 는 PR [#986](https://github.com/coseo12/astro-simulator/pull/986) 🔴-2 가 **런북에서 먼저 잡은 결함이 ADR 본문에 잔존**한 것이고, §8-A1 *"실행 전 준비"* 가 운영자를 §9-R1 로 직접 보내므로 **다음 A1 전 필수**였다.
- **reviewer 반영 1차** (2026-08-07, PR [#977](https://github.com/coseo12/astro-simulator/pull/977)): 초판의 *"Phase 0 이 동명 체크런 조건을 소멸시킨다"* 서술이 **실측과 반대**임이 독립 재현으로 드러났다. §2-2 / §5 (b) / §6-2 / §10-1 한계 3 을 정정하고 **§2-11 (동명 체크런 전수 집계) 신설** + **§8-P0 `G2` 게이트 (동명 결론 불일치 검출) 신설**. 설계 자체 (단계 구성 / required 집합 / develop 보호 수준 / `enforce_admins` 판정) 는 **무변경** — reviewer 가 판정 6건을 전부 정합으로 확인했다.
- **reviewer 반영 2차 — Phase 1 착수 전 필수 정정** (2026-08-07, PR [#978](https://github.com/coseo12/astro-simulator/pull/978) = Phase 0 머지분의 리뷰): **사실 전제 3건이 반증됐고, 결정 조항이 그 위에 서 있었다.** 1차 정정과 달리 이번에는 **설계 자체가 바뀐다**.

  | 반증 | 초판 서술 | 실측 |
  |---|---|---|
  | 1 | "잔여 위험은 flake 하나" (§2-11 / §10-1 한계 3) | **거짓** — event *type* 축이라는 **결정론적** 제2 원인이 실재하고 Phase 1 후보 위에서 이미 발화했다 (§2-12) |
  | 2 | "교차 취소는 릴리스 경로 SHA 에서만" (§2-7) | **거짓** — B2 (PR↔PR) 가 일상 PR 경로에서 실재 (단 base rate 는 낮음 — §2-7 / [779](20260701-779-ci-alert-fatigue-concurrency.md) §A2-3) |
  | 3 | C 클래스 0 = "재트리거가 드물어서" (암묵) | **거짓** — 재트리거는 6일에 23 group. C=0 은 **취소할 concurrency 가 없어서** (§2-12 실측 4) |

  **결정 변경**: **결정 9 신설** (`pr-template-checklist` required 제외 + concurrency 추가 금지 + `label-pr` 조건부) / **Phase 1 required 4개 → 3개** / **`G2` 를 Phase 1 진입 조건으로 격상** (§8-P1-G 신설). **사실 정정**: §2-5 (축 2개 → **3개**) / §2-7 / §2-11 / §2-12 신설 / §10-1 한계 3·10 / §5 (a) 잣대 일관성 주석. **선행 ADR 회수**: [20260701-779](20260701-779-ci-alert-fatigue-concurrency.md) §A2-3 (단위 라벨 + 창 경계 + B2 base rate + C=0 원인) / §A2-5 (결정 회수) / §A2-6 조건 10 **[2/2] 명령 교체** (창 종속 → 창 무관 API — qa 발견).
- **reviewer 반영 3차 — 신설 게이트의 자기 결함 교정** (2026-08-07, PR [#979](https://github.com/coseo12/astro-simulator/pull/979)): 2차가 신설한 **§8-P1-G 가 ADR 이 지정한 대상 SHA 에서 구조적으로 발화하지 못했다** — 일상 PR head 는 required 3개가 전부 `n=1` 이라, required 3개가 전부 `failure` 여도 전제 확인 통과 + `exit=0` + 빈 출력 → 판정표상 *"통과"* 가 나온다 (reviewer 합성 픽스처 결정적 실증). **§10-1 한계 3 이 초판을 두고 쓴 진단 (*"측정하지 않은 축을 위험 없음으로 결론"*) 의 재생산**이다. 조치는 **문서·명령만** — 결정 9 / required 3개 / ADR Status / 롤백은 무변경.

  | # | 항목 | 조치 |
  |---|---|---|
  | 🔴-1 | P1-G 대상 SHA 가 판정 불능 | 선정 조건 **S1·S2(`max_n ≥ 2`)·S3** 신설 + 판정표에 **판정 불가 2행** + `base=main` PR head 고정 + **개정 절차 1회 직접 실행 박제** (§8-P1-G). 결정 1 개정 표의 *"전 축 커버"* **회수** → 소급 리허설 **병존** 복원 (3항 직교) |
  | 🟡-1 | `ee64871` 겹침이 **job 레벨** 서술 | **run 레벨** 정본 신설 (§2-12 실측 1-b) — 여유 12초 → **2초**. 1차 근거는 전칭이 아니라 22/27 |
  | 🟡-2 | `gh pr create --json` 부재 | `gh pr view` 2단계로 교체 (§10-4 단계 2-bis) |
  | 🟡-3 | probe 가 표본 SHA 를 변형 | 부작용 박제 (§10-4 단계 2-bis / §8-P1-G negative baseline) |
  | 🟡-4 | `per_page=100` cap 미방어 | `total_count ≤ 100` 을 S3 로 승격 (§8-P0 / §8-P1-G) |
  | 🟡-5 | §10-2 조건 3 ↔ §8-P1-G 구분선 부재 | **판정 관측 vs 결론 관측** 구분표 (§8-P1-G 말미) |
  | 부수 | 판정 대상 SHA 정의 부재 | *"required 판정 단위 = PR head SHA, 머지 커밋 아님"* 박제 (§8 서두) — 실측 반례 `58ccfcf` |

- **reviewer 반영 4차 — 제4의 동명 축 + Phase 1 착수 판정 "기다린다"** (2026-08-07, PR [#979](https://github.com/coseo12/astro-simulator/pull/979) 2차 리뷰): 3차가 🔴-1 을 메우며 세운 다리 (*"event *type* 축은 구조적 부재로 닫힌다"* + *"3항 병존"*) 가 **또 하나의 미측정 축을 "위험 없음" 으로 결론**지었다. 그 축은 이 저장소에서 **이미 발화했고 Phase 1 required 컨텍스트 위에서 결론이 갈렸다** (`4f7366e`: `branch-name` = `{failure, success, success}`). 조치는 다시 **문서 + 게이트 1줄** — **결정 9 / required 3개 / ADR Status / §9 롤백은 무변경**.

  | # | 항목 | 조치 |
  |---|---|---|
  | 🔴-2 | **제4의 동명 축 (동일 SHA 복수 PR head) 미열거** — `cancelled` 도 flake 도 아니라 **rerun·Phase 0 어느 쪽으로도 수렴하지 않는다**. 게다가 3차가 신설한 **S2 가 이 축을 표본에서 구조적으로 배제**한다 (*"표본을 고치는 동작이 새 사각을 만들었다"*) | §2-5 표에 **PR 다중성 축** 4행 신설 (표제 3개 → **4개**) / §2-12 **원인 ③** 신설 + 실측 5 박제 / 실측 3 표 **열 정의 한정** (event *type* 축 한정) / 결정 1 면제 근거 **3항 → 4항** / 결정 9-3 부기에 **`branch-name` 특수성** (판정이 브랜치 이름의 함수 → 정당한 모순) / §8-P1-G **`S4` 신설** (`distinct_head_branch = 1`, 직접 실행 박제) + 판정표 S4 행 / §10-4 단계 3 S4 / §10-1 **한계 12** / §10-5 **재검토 조건 12** |
  | 🟡-7 | §8 서두가 `ab05620` 을 **B1 제거의 확인 증거**로 인용 — **성립 불가** (develop push 단독 SHA 라 push 쌍이 구조적으로 불가능) | 인용 **회수** → *"Phase 0 이후 릴리스 경로 0건이라 B1 제거는 미실측"* 로 정정 (§8 서두). §10-2 조건 5·6 의 직접 근거 |
  | 🟡-8 | S2 는 *"최소 1개"* 조건이라 `c2732ae` 에서 검증된 이름은 `project-guards` **하나**뿐 | *"과장 금지"* 박스에 **이름별 커버리지 1줄** 박제 의무 + 실행 결과에 적용 (§8-P1-G) |
  | 사소 | *"`pull_request` 트리거 워크플로 12개"* | **실측 11개** 로 정정 + 모수 전체 열거 (§10-4 2-bis). *"`branch-name-guard` 만 `branches:` 필터 부재"* 결론은 불변 |
  | **착수 판정** | Phase 1 을 지금 켤 것인가 | **아니다 — 다음 release PR 1건을 기다린다.** §10-2 에 **전이 조건 5·6 신설** (다음 release PR 관찰 / Phase 0 이후 head 로 P1-G 재실행) + **§10-6 첫 릴리스 5 시나리오 표** 신설. 근거: Phase 0 효과가 **릴리스 경로에서 0회 실측** (Phase 0 머지 후 `base=main` 머지 0건 / `main` push 0건) 이고, P1-G 의 유일한 표본 `c2732ae` 는 **Phase 0 이전 SHA** 다 |

- **수치 재현 규약** (#897 §수치 박제 규약): 2~4차 라운드의 모든 수치 주장은 재실행해 출력을 박제했다 — **2차 2026-08-07T11:50~11:55Z / 3차 2026-08-07T12:42~12:44Z / 4차 2026-08-07T13:29~13:31Z** (UTC, `gh` 2.88.1 / `jq` 1.7.1-apple). 창 종속 수치는 **창 경계를 함께** 기록한다 (§2-6 스냅샷 / §10-1 한계 10).
- **상태 판정 (architect, 2026-08-07)**: 본 라운드에서 cross-validate 를 **수행·통합했으므로** CLAUDE.md §ADR Status 워크플로의 *"cross-validate 결과 본문 통합 전까지 Provisional"* 조건은 **해소**됐다. 그럼에도 **Provisional 을 유지한다** — 그 조건은 Accepted 의 **필요조건**이지 충분조건이 아니고, 본 ADR 스스로 §10-2 에 **6+1 개의 추가 전이 조건** (사용자 승인 / Phase 0 후 `G1`+`G2` 실측 / **Phase 1 진입 게이트 통과** / Phase 1 후 release PR 오차단 0 / 롤백 런북 링크 / **다음 release PR 1건 관찰** / **Phase 0 이후 head 로 P1-G 재실행** — 뒤 2개는 4차 신설) 을 박제했고 **하나도 충족되지 않았다**. 여기서 Accepted 로 올리면 §10-2 를 스스로 위반하며, 이는 ADR 을 **사후 정당화 도구로 쓰는** 전형이다.
- **날짜**: 2026-08-07
- **결정자**: architect (실측 기반 설계). 적용 권한은 사용자
- **관련**:
  - [#971](https://github.com/coseo12/astro-simulator/issues/971) (본 이슈)
  - [20260806-962-branch-name-guard](20260806-962-branch-name-guard.md) §6-2 — "물리적 차단은 required check 없이는 절반만 성립" 인계 원문. §6-4 재검토 조건 3
  - upstream ADR [20260419-gitflow-main-develop](https://github.com/coseo12/harness-setting/blob/main/docs/decisions/20260419-gitflow-main-develop.md) — **상위** 브랜치 전략
  - upstream ADR [20260419-release-merge-strategy](https://github.com/coseo12/harness-setting/blob/main/docs/decisions/20260419-release-merge-strategy.md) — release PR `--merge` + fast-forward 의무. 본 ADR 의 develop 결정이 보호하는 대상
  - [`docs/guides/branch-strategy-workflow.md`](../guides/branch-strategy-workflow.md) — 릴리스 의례 3단계
  - [20260701-779-ci-alert-fatigue-concurrency](20260701-779-ci-alert-fatigue-concurrency.md) — **직접 선행**. 본 ADR 은 그 §재검토 조건 1 을 발동시키고 §재검토 조건 2 의 사실 가정을 실측으로 정정한다 (§2-10)
  - [`docs/ops/operational-friction.md`](../ops/operational-friction.md) §4 — CANCELLED 코스메틱 판별법. 본 ADR 이 그 "코스메틱" 전제가 required check 하에서 무너지는 조건을 규명
  - [`docs/lessons/guard-pr-dod.md`](../lessons/guard-pr-dod.md) / [`docs/lessons/guard-design-principles.md`](../lessons/guard-design-principles.md) — 가드 도입 DoD·설계 원칙
- **교훈 적용**: "가드 설계 원칙 — measurement-first". 후보를 산문에서 추론하지 않고 **release PR 6건 × 후보 9개 = 54셀 소급 대조** + **workflow 13개 트리거 전수 분류** + **취소 메커니즘 run 단위 역추적**으로 확정했다.

---

## §1 배경

#962 축 B (PR [#969](https://github.com/coseo12/astro-simulator/pull/969)) 가 `branch-name` 가드를 만들었으나, required status check 가 없으면 GitHub 은 붉은 X 를 표시할 뿐 **머지를 기계적으로 막지 않는다**. 이는 축 B 만의 문제가 아니라 전 워크플로 공통 상태다.

그러나 required check 는 **비대칭 위험**을 갖는다. 켜지 않으면 가드가 권고에 머무를 뿐이지만, **잘못 켜면 릴리스가 하드 블록**된다. 본 저장소는 1인 개발자–AI 페어 환경이라 "다른 관리자에게 부탁" 이라는 우회로가 없고, `enforce_admins: true` 라 규칙 자체를 우회할 수도 없다.

따라서 본 ADR 의 1차 목표는 "무엇을 required 로 올릴까" 가 아니라 **"어떤 조건에서 오차단이 발생하는가" 를 먼저 실측으로 소진하는 것**이다.

---

## §2 실측 (2026-08-07)

### 2-1 현재 보호 상태

| 브랜치 | 상태 |
|---|---|
| `main` | 보호 있음. `required_status_checks: null` / `enforce_admins: true` / `required_pull_request_reviews` 존재 (`required_approving_review_count: 0`) / `allow_force_pushes: false` / `allow_deletions: false` |
| `develop` | **404 Branch not protected** — 보호 자체 없음 |

토큰: `gh auth status` scope 에 `repo` 포함, repo permission `admin: true`. 즉 **보호 규칙의 편집·삭제는 언제든 가능**하다 (§6 결정 5 의 핵심 전제).

저장소: `visibility: public` / `owner.type: User` / `default_branch: main` / 현재 열린 PR **0건**.

### 2-2 GitHub 공식 의미론 (문서 근거)

| 항목 | 사실 | 출처 |
|---|---|---|
| 통과로 인정되는 상태 | `success`, `skipped`, `neutral` **3종만** | GitHub Docs "About protected branches" / "Troubleshooting required status checks" |
| `cancelled` | 위 3종에 **없음 → 미통과** | 동상 (부재로 확인) |
| **workflow 단위** 스킵 (`paths` / `paths-ignore` / `branches` 필터 / 커밋 메시지) | 체크가 **아예 생성되지 않음** → 영구 `Pending` → **머지 영구 차단**. 공식 권고는 *"Avoid requiring workflows that can be skipped"* | GitHub Docs "Troubleshooting required status checks" |
| **job 단위** 스킵 (`if:` 조건 false, 또는 `needs` 실패로 인한 스킵) | 체크런이 `skipped` 로 **보고됨 → 통과** | 동상 |
| 동명 체크가 여럿일 때의 **해소 규칙** | *"If a check and a commit status have the same name, both must pass"* 만 기술. **동명 체크런 N개 중 어느 것이 채택되는지는 미기술** | 동상 (미기술 확인) |
| 동명 체크가 여럿일 때의 **위험** | **미기술이 아니라 명시 경고**다 — *"Using the same job name in multiple workflows can cause ambiguous status check results and **block pull requests from being merged**."* 즉 회색지대가 아니라 GitHub 이 문서화한 위험이며, 침묵하는 것은 *해소 규칙*이지 *위험의 존재*가 아니다 | GitHub Docs "About protected branches" (2026-08-07 원문 대조) |
| 직접 push (PR 아님) | required check 가 있으면 **push 되는 커밋의 required context 가 전부 통과해야** 하며, 아니면 `Protected branch update failed` 로 거부 | GitHub Docs / community discussion #170641 |

### 2-3 workflow 13개 트리거 전수 분류

required 후보 자격은 **"모든 대상 PR 에서 반드시 체크런을 보고하는가"** 하나로 갈린다.

| 클래스 | 체크 이름 (워크플로) | 실측 소요 (PR #969) | 판정 |
|---|---|---|---|
| **A — workflow 단위 path 필터 보유** | `a11y-baseline-guard` (a11y) / `measure`·`retry-fresh-runner` (fps) / `verify` (shader-pixel) / `bench` (bench) | 140s / 156s·— / 363s / — | **required 절대 금지**. docs-only PR 에서 workflow 자체가 스킵 → 체크 미생성 → 영구 pending. `bench` 는 positive `paths:` 라 더 좁다 |
| **B — path 필터 없음 + `pull_request` 전용** | `branch-name` (branch-name-guard) / `label-pr` (harness-pr-review) / `pr-template-checklist` (pr-template-checklist-guard) | 9s / 5s / 10s | **main required 가능**. 단 **push 커밋에는 영원히 미보고** → develop 직접 push 와 구조적 비호환 (§6 결정 2). 셋 다 job 단위 `if:` 보유 — `label-pr` = `github.event.pull_request.draft == false` / `pr-template-checklist` = `github.actor != 'github-actions[bot]'` / `branch-name` = 없음. **전부 `skipped` = 통과라 안전** (§2-2 job 단위 스킵 행) |
| **C — path 필터 없음 + `pull_request`·`push` 양쪽** | `project-guards` (project-guards) / `diff-scope` (ci) / `detect-and-test` (ci) / `diff-scope`·`verify-and-rust`·`long-integration-rust`·`duplicate-function-guard` (ci-physics-wasm) | 6s / 9s / 779s / 8s·113s·514s·12s | **required 가능**. `verify-and-rust`·`long-integration-rust`·`duplicate-function-guard` 는 job 단위 `if: code_changed == 'true'` → 미해당 시 `skipped` = 통과 |
| **D — 구조적 부적격** | `close-linked-issues` (PR `closed` 이벤트 전용) / `bootstrap` (`workflow_dispatch` 전용) / `plan`·`bench`·`aggregate` (bench-baseline-remeasure, `workflow_dispatch` 전용) / `Vercel Preview Comments` (외부 앱) / `GitGuardian Security Checks` (외부 앱) | — | **required 절대 금지**. 앞 셋은 대상 PR 에서 미보고, 뒤 둘은 외부 서비스 장애가 릴리스 하드 블록으로 직결 |

> 클래스 A 가 그대로 **본 정책의 최대 손실**이다. 실행 시간 상위 4개 중 3개 (`verify` 363s / `measure` 156s / `a11y-baseline-guard` 140s) 가 여기 속해 required 화가 불가능하다. 회복 경로는 §10-3 후속 1.

### 2-4 `needs` 스킵 구멍 — `detect-and-test` 단독 required 는 무의미

`ci.yml` 의 `detect-and-test` 는 `needs: diff-scope` 이고 **job 단위 `if:` 가 없다** (게이트는 step 단위). 따라서:

```
diff-scope 실패 → detect-and-test 는 conclusion=skipped → GitHub 은 통과로 인정
```

즉 `detect-and-test` 만 required 로 올리면 **상류 실패가 그대로 통과한다**. `ci-physics-wasm.yml` 의 3개 job 도 동일 구조 (`needs: diff-scope`). 구멍을 닫으려면 `diff-scope` 자체를 required 로 올려야 한다 — 그런데 §2-5 의 이름 충돌이 걸린다.

### 2-5 동명 체크런의 축은 **최소 4개**다 — workflow 축 × event 축 × event *type* 축 × PR 다중성 축

> ⚠️ **"4개" 는 상한이 아니라 현재까지 열거된 수다** (PR #979 3차 리뷰 🟡-9). 본 ADR 은 3라운드 연속으로 새 축을 발견했고 (event *type* → PR 다중성 → 아래 제5축), **열거가 닫혔다는 근거는 없다**. 실제로 reviewer 3차가 **제5축 — `push` 다중 ref** 를 실측했다: `58ccfcf` (v0.61.0 release merge) 는 `pull_request` run 이 **0개**인데 `project-guards` 가 `{push/develop=success, push/main=cancelled}` 로 갈린다 — 한 SHA 가 **N개 브랜치의 tip** 인 경우이며(ff-sync 산물), 신설된 PR 다중성 축의 **정확한 쌍둥이**다. **required 판정 대상(PR head SHA)과 만나는 경로가 확인되지 않아 결정 조항에는 영향이 없으나**, 축 열거의 미완결성 자체를 §10-1 **한계 13** 으로 박제한다. 다음 축이 발견되면 그것은 **뒤집힘이 아니라 예고된 관측**이다.

> **개정 1 (2026-08-07, PR [#978](https://github.com/coseo12/astro-simulator/pull/978) 리뷰 🔴-1)**: 초판은 축을 2개로 서술했다. **제3의 축 (event `types`) 이 실재하며, 그 노출은 Phase 1 required 후보 위에서 이미 발화한 이력이 있다.** 근거는 아래 표 3행 + §2-12.
>
> **개정 2 (2026-08-07, PR [#979](https://github.com/coseo12/astro-simulator/pull/979) 리뷰 🔴-2)**: 개정 1 이 *"축이 3개다"* 를 **표제 정정 사실**로 올렸으나 **실측상 ≥4** 다. **제4의 축 (PR 다중성 — 한 SHA 가 N개 PR 의 head)** 이 이 저장소에서 **이미 발화했고, Phase 1 required 컨텍스트 위에서 결론이 갈렸다** (`4f7366e`: `branch-name` = `{failure, success, success}`). 본 ADR 은 이 현상 자체를 [20260701-779](20260701-779-ci-alert-fatigue-concurrency.md) §A2-3 **B2 클래스**로 5회 이상 인용해 왔으나 **`cancelled`(교차 취소) 프레임으로만** 다뤘고, 같은 현상이 **동명 축**이라는 점은 이 표에 없었다. 근거는 아래 표 4행 + §2-12 원인 ③.

`ci.yml` 과 `ci-physics-wasm.yml` 이 **둘 다 job id `diff-scope`** 를 쓴다. 여기에 이벤트 2종 (`pull_request` + `push`) 이 겹쳐 release PR head SHA 마다 **`diff-scope` 체크런이 4개** 생성된다 (실측: release PR 6/6 전건 `pass=4`).

| 축 | 원인 | 배수 | 제거 수단 |
|---|---|---|---|
| **workflow 축** | 서로 다른 워크플로가 같은 job id 사용 | ×2 (`diff-scope` 한정) | 결정 6-2 리네임 (`diff-scope-wasm`) |
| **event 축** | 같은 워크플로가 `pull_request` + `push` 양쪽 트리거 보유 | ×2 (**push 트리거를 가진 모든 컨텍스트**) | **없음** — 제거하려면 §5 (c) (push 트리거 삭제) 인데 기각됨 |
| **event *type* 축** (신설) | 같은 워크플로가 **한 SHA 위에서 여러 번 트리거**됨 — `types:` 에 `edited` 등 SHA 를 바꾸지 않는 이벤트가 있고 concurrency 가 없을 때 | ×N (**편집 횟수만큼 무한**) | **없음 — 그리고 concurrency 추가는 해법이 아니다** (결정 9). 실질 대응은 required 제외 또는 `edited` 트리거 제거 |
| **PR 다중성 축** (신설 2026-08-07, 🔴-2) | **한 SHA 가 N개 PR 의 head** — `pull_request` 이벤트가 **PR 마다 1회** 발생하므로 `pull_request` 트리거를 가진 **모든** 컨텍스트가 그 SHA 위에 N개씩 쌓인다 | ×N (**그 SHA 를 head 로 삼는 PR 수**) | **없음 — 그리고 concurrency 로는 제거되지 않는다.** `branch-name-guard.yml` 의 PR 번호 키 concurrency 는 세 run 을 **정상 분리**하며, 그 정상 분리의 결과가 영구 공존하는 결론 불일치다. 실질 대응은 **대상 SHA 가 단일 PR head 임을 사전 확인** (§8-P1-G **S4**) |

**결정 6-2 의 리네임은 workflow 축만 없앤다 (4→2). event 축 · event *type* 축 · PR 다중성 축은 그대로 남는다.** 그리고 event 축은 `diff-scope` 만의 문제가 아니라 클래스 C 전체 (`project-guards` / `detect-and-test` / `verify-and-rust` / `long-integration-rust` / `duplicate-function-guard`) 에 해당한다 — 셋 다 `on: {pull_request, push}` `branches: [develop, main]` 이다.

**event *type* 축이 왜 별개인가**: 앞의 두 축은 *서로 다른 트리거 원천*이 한 SHA 에 모이는 구조라 배수가 유한하고 (×2, ×4) 정적으로 계산된다. 세 번째 축은 **같은 원천이 같은 SHA 위에서 반복**되는 구조라 배수가 사용자 행동 (본문 편집 횟수) 에 종속돼 상한이 없다. 결정적으로, 앞의 두 축이 만드는 동명 쌍은 **동시 실행이라 concurrency 로 취소 가능**했던 반면, 세 번째 축의 반복은 **시간적으로 떨어져 있는 경우가 많아 concurrency 가 발화조차 하지 않는 경로가 열려 있다** (§2-12 실측 1-b: 관측된 실발화 사례의 **run 레벨** 여유 10분 28초 / 2초, 겹침 0. 단 저장소 전체로는 27쌍 중 5쌍이 겹치므로 **항상 떨어져 있는 것은 아니다** — §2-12 실측 4).

**PR 다중성 축이 왜 또 별개인가**: 앞의 세 축은 전부 **한 PR 안에서** 트리거 원천이 늘어나는 구조라, 배수가 워크플로 정의 (`on:` / `types:`) 또는 사용자의 편집 행동에 종속된다. 네 번째 축은 **PR 자체가 늘어나는** 구조다 — 같은 커밋을 서로 다른 브랜치가 가리키고 그 각각으로 PR 을 열면, `pull_request` 트리거를 가진 **모든** 컨텍스트가 그 SHA 위에서 ×N 이 된다 (실측 `4f7366e`: `label-pr`·`project-guards`·`branch-name`·`pr-template-checklist` 가 전부 `n=3`). 결정적으로 **판정이 커밋 내용의 함수가 아닌 컨텍스트가 섞여 있으면 N개의 결론이 정당하게 갈린다** — 상세는 §2-12 원인 ③.

§2-2 대로 동명 체크런 N개의 **해소 규칙**은 GitHub 이 문서화하지 않았고, 그 **위험**은 명시 경고돼 있다. 전수 집계와 Phase 0 이후 투영은 §2-11.

> **부수 발견 — `diff-scope` 는 유일한 동명 쌍이 아니다.** `bench.yml` 의 job id `bench` (L40) 와 `bench-baseline-remeasure.yml` 의 job id `bench` (L51) 도 동명이다. 양쪽 다 required 절대 금지 목록 (클래스 A / 클래스 D) 이라 **정책 영향 0** 이고, 결정 8 의 가드는 *선언된 context 가 실재하는가* 를 대조하므로 오탐도 없다. 다만 "동명은 `diff-scope` 하나뿐" 이라는 인상을 남기지 않기 위해 박제한다.

### 2-6 CANCELLED — release PR 6/6 에서 100% 재현되는 구조적 현상

`gh api commits/{sha}/check-runs` 로 최근 release PR 6건의 head SHA 를 전수 대조했다.

| release PR | `project-guards` | `branch-name` | `pr-template-checklist` | `label-pr` | `diff-scope` | `detect-and-test` | `verify-and-rust` | `long-integration-rust` | `duplicate-function-guard` |
|---|---|---|---|---|---|---|---|---|---|
| #974 (v0.61.0) | pass 2 | pass 1 | pass 1 | pass 1 | pass 4 | pass 1 / **cancel 1** | pass 1 / **cancel 1** | pass 1 / **cancel 1** | pass 2 |
| #965 (v0.60.0) | pass 2 | **부재** | pass 1 | pass 1 | pass 4 | pass 1 / **cancel 1** | pass 1 / **cancel 1** | pass 1 / **cancel 1** | pass 2 |
| #956 | pass 2 | **부재** | pass 1 | pass 1 | pass 4 | pass 1 / **cancel 1** | pass 1 / **cancel 1** | pass 1 / **cancel 1** | pass 2 |
| #948 | pass 2 | **부재** | pass 1 | pass 1 | pass 4 | pass 1 / **cancel 1** | pass 1 / **cancel 1** | pass 1 / **cancel 1** | pass 2 |
| #938 | pass 2 | **부재** | pass 1 | pass 1 | pass 4 | pass 1 / **cancel 1** | pass 1 / **cancel 1** | pass 1 / **cancel 1** | pass 2 |
| #930 | pass 2 | **부재** | pass 1 | pass 1 | pass 4 | pass 1 / **cancel 1** | pass 1 / **cancel 1** | pass 1 / **cancel 1** | pass 2 |

**단위**: 위 표의 `pass` / `cancel` 수치는 전부 **check-run (job) 레벨**이다 (`GET /commits/{sha}/check-runs`). run 레벨 (`GET /actions/runs?head_sha=`) 과 값이 다르므로 혼용 금지 — 아래 스냅샷 참조. **required check 의 판정 단위는 job (= check-run context) 이므로 본 ADR 의 정책 판단은 전부 job 레벨을 쓴다.** run 레벨 수치는 "무엇이 취소됐는가" 의 원인 추적 (event / head_branch 분류) 에만 쓴다.

읽는 법:
- `branch-name` **부재 5건** = 가드가 2026-08-06 에 신설돼 그 이전 release PR 에는 존재하지 않음. 소급 근거는 `n=1` 뿐 (#974). 현재 열린 PR 0건이라 "옛 PR 이 영구 pending 으로 남는" 리스크는 없다.
- 무거운 3개 (`detect-and-test` / `verify-and-rust` / `long-integration-rust`) 는 **6/6 전건에서 cancelled 쌍둥이 보유**. 우연이 아니라 구조다.
- Phase 1 후보 4개 (`project-guards` / `branch-name` / `pr-template-checklist` / `label-pr`) 는 **cancel 0 / 부재 0** (branch-name 은 존재하는 1건 기준). ⚠️ **`cancel 0` 을 "위험 0" 으로 읽으면 안 된다** — `pr-template-checklist` 는 `cancelled` 가 아닌 **`failure` + `success` 혼재**로 이미 실발화한 이력이 있다 (§2-12). 위 표는 `cancelled` 축만 본 것이라 그 축을 원리적으로 담지 못한다.

#### 2-6 측정 스냅샷 (#897 §수치 박제 규약 — 측정 시각 박제)

수치가 창 (window) 에 종속되는 명령이 섞여 있어, **측정 시각과 창 경계를 함께 박제**한다. `gh run list --limit N` 의 `N` 은 **날짜 범위가 아니라 개수 cap** 이므로 창의 시작 경계가 **측정 시각마다 이동한다** — 같은 명령이 다른 날 다른 답을 낸다.

```text
측정 주체: architect / 측정 시각: 2026-08-07T11:51~11:55Z (UTC)
저장소 run 생성률: 100.3 run/일 (20일 창) / 162.7 run/일 (직전 6일 창)

[창 종속 — gh run list --limit N]
  --limit 1000  → 창 2026-08-01T08:19:08Z ~ 2026-08-07T11:48:08Z (6.15일)
                  cancelled 72 (run 레벨) = A 35 / B1 21 / B2 16 / C 0
  --limit 2000  → 창 2026-07-18T13:03:48Z ~ 2026-08-07T11:48:08Z (19.95일)
                  cancelled 118 (run 레벨) = A 62 / B1 40 / B2 16 / C 0
  --limit 200   → 창 2026-08-05T14:43:32Z ~ 2026-08-07T11:48:08Z (1.88일)  ← §10-1 한계 10

[창 무관 — gh api actions/runs?head_sha=<full>]
  c2732ae (release PR #974 head, merged 2026-08-06T09:54:14Z)
    run  레벨: total 15 / cancelled 5
    job  레벨: check_runs 27 / names 15 / cancelled 7
    → 같은 SHA 인데 run 5 ≠ job 7. 단위 혼용이 곧 오독이다
```

> 재현: `gh run list --limit 1000 --json databaseId,headSha,event,headBranch,name,conclusion,createdAt` 후 `(headSha, name)` 그룹의 peer `event`/`head_branch` 로 분류. 위 A/B1/B2/C 정의는 [20260701-779](20260701-779-ci-alert-fatigue-concurrency.md) §A2-3 분류표와 동일하다.

### 2-7 취소 메커니즘 확정 — concurrency 그룹 키에 **ref 가 없다**

7개 워크플로가 전부 아래 키를 쓴다 (`branch-name-guard.yml` 만 PR 번호 키로 예외).

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.head.sha || github.sha }}
  cancel-in-progress: true
```

**ref 가 키에 없으므로, 같은 SHA 가 다른 ref 로 등장하면 서로를 취소한다.** run 단위 역추적으로 두 경로가 확인됐다.

1. **release PR 생성 시** — `develop` push run 과 release PR 의 `pull_request` run 이 같은 SHA. 실측 (SHA `c2732ae`): `CI` / `CI (physics-wasm)` / `a11y` / `fps` / `shader` 의 `event=push, head_branch=develop` run 이 전부 `cancelled`, 생존자는 `event=pull_request` run.
2. **ff-sync 시** — `git push origin main:develop` 이 **main 과 동일한 SHA** 를 develop 에 올려 두 번째 push run 을 만든다. 실측 (main tip `58ccfcf`): `CI` / `CI (physics-wasm)` / `Project Guards` 의 `head_branch=main` run 3개가 `cancelled`, 생존자는 `head_branch=develop` run.

즉 현재 concurrency 설정의 **실질 효과 대부분이 이 유해한 교차 취소**다. 일상 feature PR 에서는 push 이벤트가 `branches: [develop, main]` 로 걸러져 발생하지 않고, PR 에 새 커밋을 올리면 SHA 가 바뀌어 키도 달라지므로 취소가 일어나지 않는다. 남는 정당한 dedup 은 "같은 ref·같은 SHA 의 재트리거" 뿐이다.

**이 두 경로는 릴리스 경로의 SHA 에서 발생한다. 단 "교차 취소는 릴리스 경로에서만 일어난다" 로 일반화하면 틀린다** (초판 서술 정정 — PR [#978](https://github.com/coseo12/astro-simulator/pull/978) 리뷰):

- 세 번째 경로 **B2 (PR ↔ PR)** 가 실재한다. 한 SHA 가 여러 PR 의 head 가 되면 `pull_request` run 의 `github.ref` 가 `refs/pull/<번호>/merge` 로 PR 마다 다른데, 구 group 키에 ref 가 없어 셋이 한 group 으로 붕괴해 서로를 취소했다. **push 이벤트가 0인 일상 PR 경로에서도 교차 취소가 발생한다는 직접 증거**다 ([20260701-779](20260701-779-ci-alert-fatigue-concurrency.md) §A2-3 분류표 B2 — 실측 16건).
- **단 B2 의 base rate 는 낮다** (§2-6 하단 스냅샷): 20일 표본 118 `cancelled` 중 B2 16건이 **전부 2026-08-06 하루 / SHA 2개** (`4f7366e` 9건 + `995b8b5` 7건) 에 몰려 있다 — #962 축 B 실험에서 한 커밋을 세 브랜치가 공유한 단일 사건이다. 즉 **∃ 주장 (일상 경로에서도 일어난다) 은 유효하되 상시 현상은 아니다**. 이 구분을 지우면 이번엔 반대 방향으로 과장하게 된다.

따라서 정확한 서술은 *"릴리스 경로 SHA 에서 **확정적으로** (6/6), 일상 PR 경로에서 **조건부로** (한 SHA 다중 PR head) 발생한다"* 이며, required check 가 가장 위험한 지점 (릴리스) 과 최대 빈도 지점이 겹치는 것은 그대로 참이다.

### 2-8 동명 cancelled/success 해석은 **사전 실증이 불가능하다**

“cancelled 쌍둥이가 있어도 최신 success 가 채택된다” 는 가설은 다음 이유로 **검증할 수 없다**:

- GitHub 이 동명 체크런 해석 규칙을 문서화하지 않았다 (§2-2).
- 임의 conclusion 의 체크런을 합성하려면 Checks API `POST /check-runs` 가 필요한데, 이는 **GitHub App 토큰 전용**이다. PAT 로는 403 → 일회용 브랜치로도 재현 불가.
- ruleset `enforcement: evaluate` (dry-run) 은 **organization 소유 저장소 전용**이고 본 저장소는 `owner.type: User` → 사용 불가 (§3-3).

따라서 **가정에 기대지 않고 구조적으로 제거**하는 것 외에 안전한 선택지가 없다 (§6 결정 3).

> **⚠️ 이 불가능 주장은 2026-08-07 에 <b>좁혀졌다</b>** (cross-validate Q1 이견 수용, §11). 위 논거는 *"임의 conclusion 의 체크런을 **합성**할 수 없다"* 를 근거로 삼는데, **합성할 필요가 없다** — 자연 발생한 불일치가 이미 존재한다 (`ee64871`: `pr-template-checklist` = `failure, failure, success`, §2-12 실측 1). 이 SHA 를 **일회용 probe 브랜치**의 PR head 로 세우고 그 브랜치에만 required check 를 걸면, GitHub 이 동명 불일치를 어떻게 판정하는지 **`mergeStateStatus` 로 직접 읽을 수 있다**. 설계는 §10-4 **단계 2-bis**.
>
> 정정된 서술: *"사전 실증이 불가능하다"* → **"체크런 합성은 불가능하나, 자연 발생 표본을 쓰면 실증 가능하다. 본 ADR 은 아직 수행하지 않았다."** 이 구분이 중요한 이유는 §5 (a) 기각과 결정 9-1 이 **둘 다 "규칙을 모른다" 를 근거의 일부로 쓰기** 때문이다 — 규칙을 알아낼 경로가 있다면 그 근거는 영구가 아니라 **잠정**이다 (§10-5 재검토 조건 10).

### 2-9 봇 PR 실측

`peter-evans/create-pull-request` 가 생성한 PR 20건 조회 결과:

- **최근 17건이 `base=feature/*` 또는 `base=fix/*`** (예: #925 `base=fix/887-css-reset-layer`, 2026-08-02). `main`/`develop` 보호의 적용 대상이 아니다.
- #925 의 체크런은 GitGuardian·Vercel 뿐 — Actions 체크 0. 원인은 다른 워크플로의 `branches: [develop, main]` 필터 (base 가 feature 브랜치) + `branch-name` 가드가 아직 없던 시점.
- `base=develop` 이던 과거 봇 PR **#600 (2026-05-30) 에서는 `event=pull_request` 워크플로가 정상 트리거됐다**. 즉 "`GITHUB_TOKEN` 으로 만든 PR 은 워크플로가 트리거되지 않는다" 는 일반 제약이 **본 저장소에서는 발현하지 않았다** (`n=1` 실측). 단 이를 정책의 전제로 삼지는 않는다 — §6 결정 4 는 이 사실에 의존하지 않는 방향으로 결정한다.
- #600 당시 `pr-template-checklist` 는 **failure** 였다. 현재는 job 단위 `if: github.actor != 'github-actions[bot]'` 로 `skipped` = 통과.

### 2-10 선행 ADR #779 와의 결합 — 예고된 조건의 발동 + 사실 가정 1건 정정

[20260701-779](20260701-779-ci-alert-fatigue-concurrency.md) 이 concurrency 를 도입하면서 **재검토 조건 2개를 미리 박제**했다. 본 ADR 이 그 회수 시점이다.

**재검토 조건 1 (발동 확인)**

> "branch protection 도입 시: required status check 가 생기면 concurrency cancel 이 required check 를 cancelled 로 만들어 PR 머지를 막을 수 있다. 그 시점에 **required check 를 PR 트리거에만 연결** + cancelled→재실행 또는 **cancel-in-progress 를 PR 에 한정**하는 재설계 필요."

정확한 예고였다. 본 ADR §5 는 그 두 제안을 후보 (c)/(e) 로 실제 비교했고 (e) 는 §5 의 사유로 기각된다.

**재검토 조건 2 (사실 가정 정정)**

> "group 식이 sha 기준이라 같은 sha 가 develop+main 양쪽 push 시 group 값은 같으나 **ref 가 달라 별도 group 으로 동작할 수 있음**"

**실측이 반증한다.** GitHub 의 concurrency group 은 **평가된 문자열 그 자체**이며 ref 는 암묵적으로 포함되지 않는다. main tip `58ccfcf` 실측 (§2-7): `head_branch=main` 의 `CI`·`CI (physics-wasm)`·`Project Guards` run 3개가 `head_branch=develop` run 에 의해 **실제로 취소됐다**. 즉 별도 group 이 아니라 **동일 group** 이었고, ff-sync 의 branch-cross 중복은 "못 잡은" 게 아니라 **잡되 유해한 방향으로 잡았다**.

이 정정은 #779 의 §CRITICAL ("concurrency cancel = 중복 제거, 가드 약화 아님") 을 뒤집지 않는다 — **사람이 판정하는 한** 여전히 참이다. 다만 **판정 주체가 GitHub 으로 바뀌는 순간** (required check) 그 전제가 무효가 된다는 경계가 추가된다.

### 2-11 동명 체크런 전수 집계 — **Phase 0 은 동명을 없애지 않고 늘린다**

> 본 절은 초판의 사실 오류를 정정한 결과다. 초판은 §10-1 한계 3 / §5 (b) / §6-2 에서 *"Phase 0 이 동명 조건을 소멸시킨다"* 고 서술했으나 **실측이 반대를 가리킨다**. 정정 근거를 재현 명령 + 출력 원문으로 박제한다 (reviewer 독립 재현과 대조 가능).

**재현 명령** (release PR [#974](https://github.com/coseo12/astro-simulator/pull/974) head `c2732ae`):

```bash
gh api "repos/coseo12/astro-simulator/commits/c2732ae/check-runs?per_page=100" \
  -q '[.check_runs[] | {name, conclusion}] | group_by(.name)[]
      | "\(.[0].name)\tn=\(length)\t\(map(.conclusion) | sort | join(","))"'
```

**출력 원문** (2026-08-07 실측, 15 이름 / 27 체크런):

```text
GitGuardian Security Checks	n=1	success
Vercel Preview Comments	n=1	success
a11y-baseline-guard	n=2	cancelled,success
branch-name	n=1	success
detect-and-test	n=2	cancelled,success
diff-scope	n=4	success,success,success,success
duplicate-function-guard	n=2	success,success
label-pr	n=1	success
long-integration-rust	n=2	cancelled,success
measure	n=2	cancelled,success
pr-template-checklist	n=1	success
project-guards	n=2	success,success
retry-fresh-runner	n=2	cancelled,skipped
verify	n=2	cancelled,success
verify-and-rust	n=2	cancelled,success
```

**세 가지가 동시에 참이다.**

1. **동명 다중은 미래 조건이 아니라 현재 상태다.** `project-guards` 는 **Phase 0 이전인 지금도 동명 2개**이고 (6초짜리라 push run 과 PR run 이 교차 취소 전에 둘 다 완주한다), 이것이 바로 **Phase 1 의 required 후보**다. `duplicate-function-guard` (2), `diff-scope` (4) 도 마찬가지다.
2. **Phase 0 는 동명을 줄이는 게 아니라 늘린다.** 교차 취소가 사라지면 위 `cancelled` 7건이 전부 완주로 바뀐다.
3. **결정 6-2 리네임은 workflow 축만 없앤다** (§2-5). `diff-scope` 4 → `diff-scope` 2 + `diff-scope-wasm` 2 이며, event 축 ×2 는 남는다.

**Phase 0 이후 투영** (required 후보 10개):

| 단계 | context | 트리거 축 | 현재 (`c2732ae`) | Phase 0 이후 |
|---|---|---|---|---|
| 1 | `project-guards` | push + PR | n=2 `success,success` | n=2 (불변 — 이미 양쪽 완주) |
| 1 | `branch-name` | PR 전용 | n=1 | **n=1** (동명 없음) |
| 1 | `pr-template-checklist` | PR 전용 | n=1 | **n=1** (동명 없음) |
| 1 | `label-pr` | PR 전용 | n=1 | **n=1** (동명 없음) |
| 2 | `diff-scope` | push + PR (× workflow 2) | n=4 | n=2 (workflow 축 제거) |
| 2 | `diff-scope-wasm` | push + PR | 미존재 | n=2 (신설) |
| 2 | `detect-and-test` | push + PR | n=2 `cancelled,success` | n=2 **양쪽 완주로 전환** |
| 3 | `verify-and-rust` | push + PR | n=2 `cancelled,success` | n=2 **양쪽 완주로 전환** |
| 3 | `long-integration-rust` | push + PR | n=2 `cancelled,success` | n=2 **양쪽 완주로 전환** |
| 3 | `duplicate-function-guard` | push + PR | n=2 `success,success` | n=2 (불변) |

즉 **required 후보 10개 중 7개가 동명 쌍을 갖고**, 동명 쌍이 전부 완주하는 이름은 **3개 (`project-guards` / `diff-scope` / `duplicate-function-guard`) → 7개**로 **증가**한다.

> ⚠️ **위 표의 "동명 없음" 3칸은 틀렸다** (2026-08-07 정정, PR [#978](https://github.com/coseo12/astro-simulator/pull/978) 리뷰 🔴-1). 초판은 여기서 *"동명이 원천적으로 없는 것은 `pull_request` 전용인 클래스 B 3개뿐이다"* 로 마감했으나, **클래스 B 안에서도 `pr-template-checklist` 는 동명이 원천적으로 없지 않다** — event *type* 축 (§2-5 3행) 으로 한 SHA 위에 N개가 누적되며, 그 누적이 **통과/미통과 혼재로 실발화한 이력**이 있다. 위 표는 event 축 (`push` × `pull_request`) 만 투영했기 때문에 이 축을 구조적으로 못 본다. 정정된 사실과 전수 실측은 **§2-12**.
>
> 표의 나머지 (event 축 투영 자체) 는 유효하다 — Phase 0 이후 `0e193d2` (PR #978 head, base=develop) 실측에서 `diff-scope` / `diff-scope-wasm` 이 각각 `n=1` 로 분리됐고 (workflow 축 제거 확인), 같은 SHA 에서 `pr-template-checklist` 만 `n=2` 였다.

**Phase 0 는 이 노출을 "남기는" 게 아니라 <b>새로 연다</b>** (reviewer 2차 🟡-D 수용): 교차 취소 하에서는 무거운 3개가 6/6 `cancelled` 라 **두 결론이 원천적으로 공존할 수 없었다**. 즉 Phase 0 는 **확정 차단(cancelled) ↔ 확률적 차단(flake)** 의 교환이며, 그럼에도 채택하는 것은 확정 차단이 릴리스마다 100% 발생하는 반면 flake 는 확률적이고 §9-R1 약 2초 롤백 (추정)으로 흡수되기 때문이다. **그럼에도 안전한 이유 — 잔여 위험의 정확한 위치.** 동명 N개가 **전부 **통과 결론**(`success` / `skipped` / `neutral` — §2-2) 이면 어떤 해석 규칙에서도 통과한다** (latest 채택 / all-must-pass / first 채택 무관). 따라서 위험은 "동명이 여럿인 것" 자체가 아니라 **오직 결론이 갈리는 경우**다. Phase 0 가 실제로 사는 것은 "동명 소멸" 이 아니라 **결론 불일치 확률의 하락**이다 — `cancelled` (미통과 결론) 을 구조적으로 제거하므로 불일치의 **가장 빈번하고 100% 재현되던 원인 (6/6)** 이 사라진다.

> ⚠️ **초판은 여기서 *"남는 불일치 원인은 flake 뿐"* 으로 마감했다. 이는 거짓이다** (2026-08-07 정정). 두 번째 원인이 실재하며 **확률적이지 않고 결정론적**이고, Phase 1 required 후보 위에서 **이미 발화했다**. §2-12.

### 2-12 결론 불일치 원인은 **3종**이다 — event *type* 축은 flake 가 아니라 결정론적이고, PR 다중성 축은 결정론적이면서 **양쪽 결론이 둘 다 정당**하다

> **신설 (2026-08-07, PR [#978](https://github.com/coseo12/astro-simulator/pull/978) 리뷰 🔴-1).** 초판 §2-11 / §10-1 한계 3 의 *"잔여 위험은 flake 하나"* 서술을 반증한다. 반증 근거는 **본 ADR 의 Phase 0 PR 자신의 데이터**다.
>
> **개정 (2026-08-07, PR [#979](https://github.com/coseo12/astro-simulator/pull/979) 리뷰 🔴-2).** *"2종"* 도 거짓이다 — **원인 ③ (PR 다중성 × 브랜치명 의존 판정)** 이 실재하며, ①②와 달리 **재실행으로도 Phase 0 로도 수렴하지 않는다**.

| # | 원인 | 성격 | Phase 0 가 해소하는가 | 관측 게이트 |
|---|---|---|---|---|
| ① | flake 발 `failure` + `success` 혼재 | **확률적** | 아니오 (직교 — retry 설계 영역) | §8-P0 `G2` |
| ② | **다중 `types:` + concurrency 부재 워크플로의 동일 SHA 누적** | **결정론적** | **아니오** — Phase 0 는 이 축을 건드리지도 않는다 | 동일 `G2` (원인만 다름) |
| ③ | **PR 다중성 × 브랜치명 의존 판정** — 한 SHA 가 N개 PR 의 head 이고, 판정이 커밋 내용이 아니라 **브랜치 이름**의 함수인 컨텍스트가 required 에 있을 때 | **결정론적이고 두 결론이 둘 다 정당** | **아니오** — `cancelled` 가 아니므로 Phase 0 의 사정권 밖이다. flake 도 아니므로 **재실행으로 수렴하지도 않는다** | `G2` 는 **사후 검출**만 한다. 사전 차단은 **§8-P1-G S4** (대상 SHA 가 단일 PR head 인가) |

**② 의 메커니즘.** `pr-template-checklist-guard.yml` 은 `types: [opened, edited, synchronize]` 인데 **concurrency 블록이 없다**. PR 본문을 편집 (`edited`) 할 때마다 **같은 SHA 에 체크런이 누적**되고, 처음 실패했다가 지적대로 고쳐서 통과하면 `failure` + `success` 가 그 SHA 에 **영구히** 공존한다. 이 가드가 하필 *"본문을 고치라고 요구하는 가드"* 라 **편집 루프가 설계상 유도된다** — 즉 이것은 이상 동작이 아니라 **가드가 의도대로 작동한 정상 루프의 부산물**이다.

**③ 의 메커니즘.** 한 커밋을 여러 브랜치가 가리키고 그 각각으로 PR 을 열면 `pull_request` 이벤트가 **PR 마다 1회** 발생한다 (§2-5 PR 다중성 축). 여기까지는 ② 와 마찬가지로 "한 SHA 위의 누적" 이지만, 결정적 차이는 **누적된 run 들의 입력이 서로 다르다**는 점이다 — `branch-name` 의 판정 입력은 커밋이 아니라 **PR 의 head 브랜치 이름**이다. 따라서 `feat/*` (규약 밖) 에서 `failure`, `release/*` 에서 `success` 가 나오는 것은 **양쪽 다 가드가 정확히 동작한 결과**다. 셋 중 어느 것도 틀리지 않았으므로:

- **flake 가 아니다** → 재실행해도 그 PR 의 브랜치명은 그대로라 `failure` 가 다시 난다. **수렴하지 않는다.**
- **`cancelled` 이 아니다** → Phase 0 (concurrency 그룹 키에 `github.ref` 삽입) 의 사정권 밖이다.
- **concurrency 부재 탓도 아니다** → `branch-name-guard.yml` 은 concurrency 를 **보유**하며 (PR 번호 키) 세 run 을 **정상 분리**한다. 그 정상 분리의 결과가 곧 영구 공존하는 모순 결론이다. 즉 이 축에서는 concurrency 가 문제의 원인도, 해법도 아니다.

**즉 ③ 은 사후 수렴 수단이 원리적으로 없는 유일한 원인이며, 복구 경로는 §9-R1 롤백 또는 head SHA 교체 (develop 커밋 1개 추가 + release PR 재생성) 뿐이다.** 그래서 대응이 사후 게이트가 아니라 **사전 확인** (§8-P1-G **S4**) 이다.

> **`branch-name` 은 required 3개 중 이 축에서 질적으로 최악이다.** required 3개 가운데 **판정이 커밋 내용의 함수가 아닌 유일한 컨텍스트**이기 때문이다 — `project-guards` 와 `label-pr` 은 같은 커밋을 보므로 여러 PR 에서 트리거돼도 결론이 같아야 정상이고, 갈리면 그것은 flake (원인 ①) 다. `branch-name` 만이 **갈리는 것이 정상**인 구조를 갖는다. 부수로 `branch-name-guard.yml` 은 `pull_request` 트리거 워크플로 11개 중 **유일하게 `branches:` 필터가 없어** (2026-08-07T13:3xZ 정적 전수 확인, §10-4 2-bis 부작용 박스와 동일 사실) **어떤 base 를 향한 PR이든** 그 SHA 에 체크런을 얹는다. 즉 노출 표면이 가장 넓은 컨텍스트이기도 하다. 이 성질이 required 후보로서 갖는 위험은 결정 9-3 부기에 박제한다.

**실측 1 — 실발화 (PR [#964](https://github.com/coseo12/astro-simulator/pull/964) head `ee64871`, `release/0.60.0-prep`, 2026-08-07T11:50Z 재조회)**

```bash
gh api "repos/$REPO/commits/ee6487178ec590663cd25368750efa5b29b472b7/check-runs?per_page=100" \
  -q '.check_runs[] | select(.name=="pr-template-checklist")
      | "\(.started_at)  →  \(.completed_at)  \(.conclusion)"'
```
```text
2026-08-05T12:50:51Z  →  2026-08-05T12:51:04Z  failure
2026-08-05T13:01:35Z  →  2026-08-05T13:01:47Z  failure
2026-08-05T13:01:59Z  →  2026-08-05T13:02:09Z  success   ← 통과/미통과 혼재. flake 0
```

`G2` 를 이 SHA 에 돌리면 `pr-template-checklist` 1건이 출력된다 (실행 확인).

**실측 1-b — 같은 사건의 run 레벨 (2026-08-07 신설, PR [#979](https://github.com/coseo12/astro-simulator/pull/979) 리뷰 🟡-1 수용)**

> ⚠️ **단위 주의 — 위 실측 1 은 job (check-run) 레벨이고, `cancel-in-progress` 는 run 레벨에서 동작한다.** [20260701-779](20260701-779-ci-alert-fatigue-concurrency.md) §A2-3 이 신설한 단위 라벨 (*"run 5 ≠ job 7, 혼용 금지"*) 이 여기에도 적용된다. concurrency 가 점유하는 구간은 job 의 `started_at → completed_at` 이 아니라 **run 의 `created_at → updated_at`** 이다 (러너 픽업 대기 포함). 아래가 그 단위의 값이며, **본 절의 겹침 판정은 이 표를 정본으로 삼는다**.

```bash
gh api "repos/$REPO/actions/runs?head_sha=ee6487178ec590663cd25368750efa5b29b472b7&per_page=100" \
  -q '.workflow_runs[] | select(.name=="PR Template Checklist Guard")
      | "\(.created_at)  →  \(.updated_at)  \(.conclusion)"'
```
```text
2026-08-05T12:50:47Z  →  2026-08-05T12:51:05Z  failure
2026-08-05T13:01:33Z  →  2026-08-05T13:01:48Z  failure
2026-08-05T13:01:50Z  →  2026-08-05T13:02:10Z  success
```

| 쌍 | job 레벨 (실측 1) | **run 레벨 (정본)** |
|---|---|---|
| 1→2 | 12:51:04 → 13:01:35 = **10분 31초** | 12:51:05 → 13:01:33 = **10분 28초** |
| 2→3 | 13:01:47 → 13:01:59 = **12초** | 13:01:48 → 13:01:50 = **2초** |

측정 2026-08-07T12:42Z (`gh` 2.88.1 / `jq` 1.7.1-apple). **겹침 0 이라는 결론은 유지된다** — 두 단위 모두 후행 run 의 시작이 선행 run 의 종료 *이후*다. 다만 여유는 12초가 아니라 **2초**이며, 이는 저장소 전체 겹침 분포 **1~9초** (실측 4) 의 한가운데다. 따라서 이 사례를 *"과대/과소 논쟁이 무의미해지는 지점"* 으로 격상해서는 안 된다 (아래 실측 4 말미 정정).

**실측 2 — 실시간 재현 (PR [#978](https://github.com/coseo12/astro-simulator/pull/978) head `0e193d2`)**

Phase 0 PR 본문을 편집하자 같은 SHA 에서 `n=1 → n=2` 로 늘었다. **같은 SHA 의 다른 14개 이름은 전부 `n=1`** 이라 대조군이 자체 내장돼 있다.

```text
branch-name             n=1  success
detect-and-test         n=1  success
diff-scope              n=1  success        ← Phase 0 6-2 리네임 효과 (종전 n=4)
diff-scope-wasm         n=1  success
label-pr                n=1  success
pr-template-checklist   n=2  success,success  ← 편집 1회로 누적. 이번엔 둘 다 통과라 G2 침묵
project-guards          n=1  success
(외 7개 전부 n=1)
```

이번엔 두 run 이 모두 `success` 라 `G2` 는 침묵한다 — **즉 ② 는 "항상 터지는" 게 아니라 "첫 run 이 실패하면 터지는" 조건부다.** 그리고 첫 run 실패는 이 가드에서 드물지 않다 (본문 체크박스 7개 원문 대조라 초안이 자주 걸린다).

**실측 3 — event *type* 축의 노출 범위는 `pr-template-checklist` 단독이다 (전수)**

> ⚠️ **열 정의 한정 (2026-08-07 개정, PR [#979](https://github.com/coseo12/astro-simulator/pull/979) 리뷰 🔴-2 요구 조치 3).** 아래 표의 관측 열은 **event *type* 축 한정** — 정확히는 *"동일 (SHA, name, event, head_branch) 재트리거 누적"* 이다. 초판 열 이름은 *"동일 SHA 누적 관측"* 이었고 `branch-name` / `label-pr` 이 **0** 으로 적혀 있었는데, **같은 창의 `4f7366e` 에서 둘 다 `n=3`** 이다 (실측 5). 그 `n=3` 은 **PR 다중성 축 (원인 ③)** 산이라 이 표가 세는 대상이 아니다. 열 이름을 한정하지 않으면 *"`branch-name` 은 동일 SHA 누적이 0" → "동명 노출이 없다"* 로 오독된다 — 그 오독이 🔴-2 의 발생 지점이다.

| 워크플로 (체크 이름) | `types:` | concurrency | **동일 ref 재트리거 누적 (event *type* 축)** | **PR 다중성 축 누적 (원인 ③)** |
|---|---|---|---|---|
| `pr-template-checklist-guard.yml` (`pr-template-checklist`) | `[opened, edited, synchronize]` | **없음** | **35 group** (20일) / **23 group** (6일) | `4f7366e` **n=3** / `995b8b5` n=2 |
| `harness-pr-review.yml` (`label-pr`) | `[opened, synchronize, ready_for_review]` | **없음** | **0** (55일 창 실측 — 아래 각주) | `4f7366e` **n=3** |
| `branch-name-guard.yml` (`branch-name`) | `[opened, synchronize]` | 있음 (PR 번호 키) | **0** | `4f7366e` **n=3** ← **결론까지 갈렸다** |

`label-pr` 은 concurrency 가 없다는 **구조는 같으나** `types` 에 `edited` 가 없어 event *type* 축 노출이 낮다 — `ready_for_review` 는 draft→ready 1회성이고 `synchronize` 는 SHA 를 바꾼다. 즉 **event *type* 축의 누적을 만드는 것은 "concurrency 부재" 가 아니라 "SHA 를 바꾸지 않는 반복 이벤트" 이며, `edited` 가 그 유일한 실사례**다. 이 구분을 흐리면 `branch-name` 까지 같은 클래스로 오분류하게 된다 (reviewer 2차에서 자기 증거 철회한 지점). **단 이 문장은 event *type* 축 한정이며, 오른쪽 열이 보이듯 PR 다중성 축에서는 세 컨텍스트가 전부 노출된다.**

> **`label-pr` 의 `ready_for_review` — 정밀화 (2026-08-07, 🔴-2 (4) 부수 지적 수용).** `ready_for_review` 는 **SHA 를 바꾸지 않는 이벤트**이므로 *"SHA 불변 반복 이벤트가 하나도 없다"* 는 문자 그대로는 성립하지 않는다. 구조적으로도 경로가 있다 — `harness-pr-review.yml` 의 job 은 `if: github.event.pull_request.draft == false` 라 draft 로 열린 PR 은 `opened` 에서 **`skipped` 체크런**을 남기고 (스킵도 체크런을 만든다 — `4f7366e` 의 `close-linked-issues n=2 skipped,skipped` 실측), ready 전환 시 두 번째가 붙어 같은 SHA 에 `n=2` 가 된다. **그러나 (a) 실측 0** — `harness-pr-review.yml` run 300건 (창 2026-06-13T04:55Z ~ 2026-08-07T12:55Z, **55일**) 에서 동일 `(headSha, headBranch)` 재트리거 group 은 **0** 이다 (2026-08-07T13:3xZ 측정). **(b) 발생해도 결론이 `{skipped, success}` 로 통과 3종 안이라 `G2` 기준 불일치가 아니다** (§2-2). 따라서 이 경로는 **위험이 아니라 정밀도 문제**이며, 결정 1 §Phase 1 면제 근거의 서술을 *"하나도 없다"* → *"통과 3종 밖 결론을 만드는 것은 하나도 없다"* 로 한정한다.

**실측 4 — 동일 ref 재트리거는 드물지 않다. C=0 의 원인은 "취소할 concurrency 가 없어서" 다**

이것이 결정 9 의 `concurrency 추가 금지` 를 원리 주장에서 **실측 주장**으로 바꾼다.

```text
동일 (headSha, name, event, headBranch) 가 2회 이상 등장한 group
  6.15일 창: 23 group / 50 run  — 전부 "PR Template Checklist Guard"
 19.95일 창: 54 group           — PR Template Checklist Guard 35 + agent-dispatch 19(*)
  (*) agent-dispatch.yml 은 bc7f3db(#844)에서 삭제됨 → 현행 저장소에서는 pr-template-checklist 단독
그 group 안 run 의 conclusion 분포: success 48 / failure 2 / cancelled 0
```

즉 [20260701-779](20260701-779-ci-alert-fatigue-concurrency.md) §A2-3 분류표의 **C 클래스 = 0** 은 *"동일 ref 재트리거가 드물어서"* 가 **아니다**. 재트리거는 6일에 23 group 발생한다. C=0 인 이유는 **그것을 겪는 유일한 워크플로에 concurrency 가 없어 취소가 일어나지 않았기 때문**이다. `cancel-in-progress: true` 를 넣었다면 그 취소가 실제로 발생했을 것이고, `cancelled` 는 통과 3종에 없다.

**단 "23회 취소" 는 과대 추정이다 — 정확값은 5** (본 정정의 자기 적용). `cancel-in-progress` 는 **진행 중인** run 만 취소하므로, 후행 run 이 선행 run 완료 *전에* 시작한 쌍만 발화한다:

```text
6.15일 창 재트리거 group 23 / 연속 쌍 27
  후행이 선행 완료 전 시작 (취소 발화 조건 충족): 5     ← 겹침 1~9초
  선행 완료 후 시작 (취소 미발생):              22
```

**그리고 관측된 그 불일치 사례에서는 concurrency 가 애초에 발화하지 않는다.** 실측 1-b 의 **run 레벨** 타임라인에서 후행 run 은 선행 run 종료 후에 시작하므로 (여유 10분 28초 / **2초**) **겹침이 0** 이고, `pr-template-checklist-guard.yml` 에 concurrency 를 추가했더라도 `ee64871` 의 `{failure, failure, success}` 는 **한 글자도 바뀌지 않는다**. 이것이 결정 9 의 concurrency 금지 조항이 서는 **1차 근거**이며, "`cancelled` 로 더 나빠진다" 는 발화하는 5건에 대한 **2차 근거**다.

> **1차 근거의 적용 범위를 과장하지 말 것** (2026-08-07 정정, PR [#979](https://github.com/coseo12/astro-simulator/pull/979) 리뷰 🟡-1). 초판은 이를 *"과대/과소 논쟁 전체가 무의미해지는 지점"* 으로 적었으나 그 전칭은 성립하지 않는다. **1차 근거가 덮는 것은 겹침 0 인 22/27 쌍** (`ee64871` 포함) 이고, 나머지 **5쌍은 2차 근거가 아니면 덮이지 않는다**. 두 근거는 겹침 0 / 겹침 >0 의 **배타적 케이스 분할**이라 합집합이 전체이며, 1차가 성립해도 2차가 불필요해지지 않는다. 게다가 `ee64871` 의 run 레벨 여유는 **2초**로 관측 분포 (1~9초) 안쪽이라, 1차는 *"이 사례에서는 발화하지 않았다"* 는 **사후 관측**이지 *"발화할 수 없다"* 는 구조적 보장이 아니다.

**실측 5 — 원인 ③ 의 실발화 (`4f7366e`, 2026-08-06 에 세 브랜치가 한 커밋을 공유. 신설 2026-08-07, PR [#979](https://github.com/coseo12/astro-simulator/pull/979) 리뷰 🔴-2)**

측정 2026-08-07T13:29~13:31Z (`gh` 2.88.1 / `jq` 1.7.1-apple). 명령은 §8-P1-G 의 보조 확인 / 전제 확인 / 게이트 본체 **원문 그대로**다.

```text
[보조 확인 — 동명 누적]
branch-name             n=3  failure,success,success       ← Phase 1 required
label-pr                n=3  success,success,success       ← Phase 1 required
project-guards          n=3  cancelled,success,success     ← Phase 1 required
pr-template-checklist   n=3  failure,failure,success
close-linked-issues     n=2  skipped,skipped
(외 11개 이름도 전부 n=2~6)

[전제 확인 — S1·S2·S3]
total_count=46  completed=9  names=branch-name,label-pr,project-guards
n=branch-name:3 label-pr:3 project-guards:3   max_n=3      ← S1·S2·S3 전건 충족

[게이트 본체 — Phase 1 required 3개 한정 G2]
branch-name
project-guards
exit=0                                                      ← 침묵하지 않는다
```

**결론이 갈린 이유는 서로 다르다 — 그래서 이 SHA 가 원인 ③ 의 분리 실증이다.**

```text
[branch-name run 별 head_branch ↔ conclusion]
feature/962-branch-name-guard   pull_request   success   ← 규약 준수 브랜치명
feat/962-guard-negative         pull_request   failure   ← 규약 밖 (feat 는 허용 type 아님) — 가드가 정확히 동작
release/9.99.9-prep             pull_request   success   ← 규약 준수

[S4 — 대상 SHA 가 단일 PR 의 head 인가]
4f7366e  distinct_head_branch=3  feat/962-guard-negative, feature/962-branch-name-guard, release/9.99.9-prep
995b8b5  distinct_head_branch=2  feat/962-guard-negative, release/9.99.9-prep
c2732ae  distinct_head_branch=1  develop
```

- `branch-name` 의 `{failure, success, success}` 는 **원인 ③** — 세 결론이 **전부 정당**하다. 재실행해도 `feat/962-guard-negative` 의 브랜치명은 그대로라 `failure` 가 다시 난다.
- `project-guards` 의 `{cancelled, success, success}` 는 **B2 클래스 교차 취소** — Phase 0 6-1 이 제거하는 축이다 (같은 SHA 위 세 `pull_request` run 의 `github.ref` 가 `refs/pull/<번호>/merge` 로 달랐으나 구 group 키에 ref 가 없어 붕괴, §2-7). 즉 **같은 SHA 에서 두 축이 동시에 발화했고 Phase 0 는 그중 하나만 닫는다.**
- **`995b8b5` 도 같은 구조다** (`branch-name n=2` / `project-guards n=2`). 두 SHA 모두 [#962](https://github.com/coseo12/astro-simulator/issues/962) 가드 라이브 실증 (2026-08-06) 이라는 **인위적 단일 사건**이고 둘 다 `base=develop` 이다 — base rate 평가는 §10-1 한계 12.

> **이 SHA 는 본 ADR 이 이미 5회 이상 인용해 온 표본이다** (§2-7 / §2-6 스냅샷 / §10-1 등, [20260701-779](20260701-779-ci-alert-fatigue-concurrency.md) §A2-3 **B2 클래스** 근거). 그런데 **인용은 전부 `cancelled` 열만 읽었고 required 컨텍스트의 결론 열은 한 번도 읽지 않았다.** 축 열거 (§2-5) 가 불완전하면 어떤 표본 규칙도 완전할 수 없다는 것이 이 라운드의 실질 교훈이며, 대응은 축 추가 (§2-5 4행) + 사전 확인 (§8-P1-G **S4**) 두 층이다.

---

## §3 후보 비교 — 관리 방식

### 3-1 후보 (a) `.github/settings.yml` (Probot Settings App)

| 축 | 평가 |
|---|---|
| 재현성 | 높음 (파일이 SSoT) |
| 권한 비용 | **서드파티 GitHub App 에 `administration: write` 상시 부여**. 1인 저장소에서 공급망 노출 > 이득 |
| 자기 무력화 | **치명적** — default branch 의 `settings.yml` 을 신뢰 근거로 삼으므로, 그 파일을 약화시키는 PR 이 머지되면 보호가 조용히 사라진다. 가드가 자기 자신을 끌 수 있는 구조는 CLAUDE.md §가드 설계 원칙 (fail-fast / silent 약화 금지) 위반 |
| 커버리지 | rulesets 미지원 |

### 3-2 후보 (b) repo 내 JSON 선언 + `gh api` 스크립트

| 축 | 평가 |
|---|---|
| 재현성 | 높음 (payload 전문이 저장소에 박제) |
| 권한 비용 | **0** — 신규 앱·시크릿 없음. 사람이 실행 |
| 자기 무력화 | 없음 — 파일 변경만으로는 아무 일도 일어나지 않고, 적용은 명시적 실행이 필요 |
| 한계 | **CI 자동 드리프트 검사 불가** — Actions `GITHUB_TOKEN` 에 `administration: read` 가 없어 워크플로가 보호 상태를 읽을 수 없다. PAT 시크릿 도입은 비목표 (§7). 따라서 검증 스크립트는 **로컬/메인 전용** |

### 3-3 후보 (c) Repository rulesets

| 축 | 평가 |
|---|---|
| 가용성 | 공개 저장소 + Free 라 **사용 가능** |
| 매력 | bypass actor 지정 (classic protection 의 이진 `enforce_admins` 보다 세밀), JSON export/import |
| 치명적 결함 1 | `enforcement: evaluate` (dry-run) 은 **organization 소유 전용**. 본 저장소는 `owner.type: User` → **안전한 사전 관측 모드를 쓸 수 없다** (rulesets 채택의 최대 유인이 사라짐) |
| 치명적 결함 2 | 지정 가능한 bypass actor 중 본 저장소에 존재하는 것은 사실상 **repository admin = 사용자 본인 = 에이전트가 쓰는 토큰**. 즉 bypass 를 켜면 규칙이 대상에게 항상 열려 있어 실효 0 |
| 이전 비용 | classic protection 과 병존 시 평가 규칙이 합집합으로 복잡해짐 |

**→ (b) 채택.** (a) 기각 (권한 + 자기 무력화), (c) 기각 (dry-run 불가 + bypass 실효 0).

---

## §4 후보 비교 — `develop` 보호 수준

`git push origin main:develop` (fast-forward, force 아님) 은 릴리스 의례의 **필수 단계**다 ([release-merge-strategy ADR](https://github.com/coseo12/harness-setting/blob/main/docs/decisions/20260419-release-merge-strategy.md) — merge-back PR 을 없애기 위해 도입된 구조).

| 후보 | `required_pull_request_reviews` | `required_status_checks` | ff-sync 영향 | 판정 |
|---|---|---|---|---|
| (a) 무보호 유지 | — | — | 없음 | 안전하나 **force-push·삭제로 develop 이력을 잃을 수 있음** (현재 상태) |
| (b) **최소 보호** | `null` | `null` | **없음** — ff push 는 non-force 일반 push 라 통과 | **채택** |
| (c) 클래스 B·C 체크 required | `null` | 클래스 B·C | **영구 차단** — `branch-name`·`label-pr`·`pr-template-checklist` 는 `pull_request` 전용이라 push 커밋에 **영원히 미보고**. 클래스 C 만 걸어도 main push run 완료까지 13분+ 거부되고, ff-sync push 자체가 §2-7 의 교차 취소를 새로 만든다 | 기각 |
| (d) PR 필수 (`required_pull_request_reviews` 존재) | 존재 | — | **즉사** — 모든 직접 push 금지 | 기각 |
| (e) (d) + 릴리스 의례를 merge-back PR 로 변경 | 존재 | 선택 | 의례 자체 변경 | 기각 — [release-merge-strategy ADR](https://github.com/coseo12/harness-setting/blob/main/docs/decisions/20260419-release-merge-strategy.md) 이 명시적으로 제거한 매 릴리스 merge-back PR 비용을 되살린다. 정책을 위해 상위 결정을 뒤집는 역전 |

---

## §5 후보 비교 — CANCELLED 대응

| 후보 | 내용 | 판정 |
|---|---|---|
| (a) 무대응 — "최신 success 가 채택될 것" 가정 | 현행 concurrency 유지 | **기각**. §2-8 대로 검증 불가한 가정이고, 틀리면 **모든 release PR 이 하드 블록**된다 (6/6 재현이므로 확률적 사고가 아니라 확정 사고). **잣대 일관성 (아래 주석)** |
| (b) **concurrency 키에 `github.ref` 추가** | `group: ${{ github.workflow }}-${{ github.ref }}-${{ ...sha }}` | **채택**. `pull_request` 는 `refs/pull/N/merge`, push 는 `refs/heads/*` 로 분리 → **교차 *취소* 의 소멸**. ⚠️ **동명 체크런 자체는 소멸하지 않는다 — 오히려 완주 쌍이 3→7 로 늘어난다** (§2-11). 정확히는 **#779 결정 1 의 적용 범위를 릴리스 SHA 에서 철회**하는 것이다: #779 가 정의한 중복의 본질이 *"같은 sha 가 두 event 로 2번 검증"* 이었고 Phase 0 가 없애는 것이 바로 그 dedup 이다. 잔존 dedup (같은 ref·같은 SHA 재트리거) 은 #779 스스로 *"다른 sha (새 커밋 push) → group 식 값이 달라 취소 안 됨"* 이라 명시했듯 실무상 거의 발생하지 않는 잔여분이다. 대가: 릴리스 경로 SHA 에서 무거운 워크플로가 2회 완주 (월 수 회) |
| (c) push 트리거 제거 | `on.push` 를 무거운 워크플로에서 삭제 | 기각 — 통합 브랜치의 머지 후 신호를 잃는다. 취소 문제는 해결되나 관측 손실이 대가 |
| (d) cancelled 를 required 대상에서 빼기 | 무거운 체크를 영구 비-required 로 | 기각 — `detect-and-test` (13분, 최대 커버리지) 를 영원히 포기하게 된다 |
| (e) **`cancel-in-progress` 를 PR 에 한정** (#779 §재검토 조건 1 의 자체 제안) | `cancel-in-progress: ${{ github.event_name == 'pull_request' }}` | **기각 — 효과가 없다.** `cancel-in-progress` 는 *새로 들어오는* run 의 속성이라, 뒤늦게 도착한 `pull_request` run (값 `true`) 이 진행 중인 push run 을 **여전히 취소한다**. release PR 실측 (§2-7 경로 1) 이 정확히 이 순서다. 취소를 막으려면 PR run 쪽을 `false` 로 해야 하는데 그러면 dedup 자체가 사라진다 |
| (f) cancelled 감지 시 자동 재실행 (#779 §재검토 조건 1 의 다른 제안) | 별도 워크플로가 cancelled 를 감시해 rerun | 기각 — CLAUDE.md §가드 설계 원칙의 "drift 가드에 fallback 분기 금지" 와 같은 구조. 취소의 **원인**을 두고 증상만 되돌리며, 재실행 자체가 또 취소될 경합을 만든다 |

> **잣대 일관성 — (a) 기각과 §2-11 "동명 완주 쌍 7개 수용" 은 같은 기준을 쓴다** (2026-08-07 신설, PR [#978](https://github.com/coseo12/astro-simulator/pull/978) 리뷰).
>
> 표면적으로 두 판단은 모순처럼 보인다. (a) 는 *"GitHub 의 동명 해소 규칙을 모르니 가정에 기대지 말라"* 로 기각되는데, §2-11 / §10-1 한계 3 은 *"동명 완주 쌍이 3→7 로 늘어도 안전하다"* 를 **받아들인다**. 같은 미지수 위에서 한쪽은 기각, 한쪽은 수용이면 잣대가 둘이다.
>
> **실제로는 잣대가 하나다 — 구분선은 "가정의 유무" 가 아니라 <b>가정이 해석 규칙에 종속되는가</b>이다.**
>
> | | (a) 의 근거 | §2-11 의 근거 |
> |---|---|---|
> | 주장 | "동명 중 **최신** `success` 가 채택된다" | "동명이 **전부 통과 결론**이면 통과한다" |
> | 성격 | **규칙 종속** — `latest 채택` 에서만 참. `all-must-pass` 나 `first 채택` 이면 거짓 | **규칙 독립** — latest / all-must-pass / first 어느 규칙에서도 참 |
> | 미지수 노출 | 미지의 규칙이 곧 결론을 뒤집는다 | 미지의 규칙과 무관하게 결론이 같다 |
>
> 즉 본 ADR 이 일관되게 요구하는 것은 *"가정 금지"* 가 아니라 **"미지의 해석 규칙 위에서 결론이 불변일 것"** 이다. (a) 는 이 요구를 통과하지 못하고, §2-11 의 수용은 통과한다. 그리고 이 잣대가 그대로 `G2` 게이트의 판정식 (§8-P0) 을 규정한다 — `G2` 가 결론 문자열이 아니라 **통과/미통과 이분법**으로 묶는 이유가 여기다. 규칙 독립성이 깨지는 순간 (= 통과/미통과가 갈리는 순간) 에만 발화해야 하기 때문이다.
>
> **§2-12 추가 후에도 이 잣대는 그대로다**: event *type* 축 (②) 이 만드는 `{failure, success}` 는 규칙 독립성이 깨진 상태이므로 (a) 와 같은 편에 선다 → 수용 불가 → 결정 9.

---

## §6 결정

### 결정 1 — required 체크 집합 (main 전용, 단계적)

`strict: false` (= "Require branches to be up to date before merging" **미사용**) 고정. `strict: true` 는 release PR 머지 직전마다 develop 이 main tip 을 포함할 것을 요구해 릴리스 직후 상태와 순환 교착을 만든다.

| 단계 | 추가 컨텍스트 | 누적 대기 | 진입 게이트 | 근거 |
|---|---|---|---|---|
| **Phase 1** | `project-guards`, `branch-name`, `label-pr` **(3개)** | ~10s | **`G2` + `S4` 직접 실행 (아래)** + **다음 release PR 1건 관찰** (§10-2 조건 5 — 2026-08-07 신설) | 전부 path 필터 0. `cancelled` 축은 release PR 6/6 소급 대조에서 cancel 0, **동명 쌍이 실재하는 SHA 의 결론 불일치는 `G2` 직접 실행**으로, **event *type* 축은 required 3개의 `types:` 전수로**, **PR 다중성 축은 `S4` (대상 SHA 가 단일 PR head) 로** 각각 덮는다 (아래 4항 병존). 실패 시 원인이 즉시 자명하고 롤백이 2초 |
| — | ~~`pr-template-checklist`~~ | — | — | **required 제외** — 결정 9 (event *type* 축 실발화 이력) |
| **Phase 2** | `diff-scope`, `diff-scope-wasm`, `detect-and-test` | ~13분 | **release PR 1회 관찰 통과 후** (`G1` + `G2` 동시 빈 출력) | §2-4 의 `needs` 스킵 구멍을 닫으려면 `diff-scope` 계열이 필수. 이 3개가 정확히 cancelled 쌍둥이 6/6 을 갖던 대상이라 관찰 게이트를 여기에 집중한다 |
| **Phase 3** (선택) | `verify-and-rust`, `long-integration-rust`, `duplicate-function-guard` | ~13분 (병렬) | release PR 1회 관찰 통과 후 | job 단위 `if` 로 코드 무변경 PR 에서는 `skipped` = 통과. Phase 2 관찰 후 판단 |

#### Phase 1 면제 근거 — 재작성 (2026-08-07)

> **초판의 면제 근거는 이 실패 모드를 원리적으로 커버하지 못했다** (PR [#978](https://github.com/coseo12/astro-simulator/pull/978) 리뷰 🔴-1 수용). 초판은 *"release PR 6/6 에서 cancel 0 + 롤백 2초"* 를 근거로 Phase 1 에 관찰 게이트를 두지 않았다. 그러나 §2-12 의 원인 ② 는 **`cancelled` 가 아니라 `failure` + `success` 혼재**다 — `cancel 0` 이라는 관측은 이 축을 **측정하지도 않았다**. 근거와 위험이 서로 다른 축에 있었다.

관찰 게이트를 Phase 2 앞에만 두는 판단 자체는 유지한다 (cross-validate 이견 수용, §11 — 릴리스 3주기 소요 회피). 다만 **면제의 근거를 보강한다 — 교체가 아니라 병존이다** (2026-08-07 2차 정정, PR [#979](https://github.com/coseo12/astro-simulator/pull/979) 리뷰 🔴-1 수용):

> ⚠️ **위 첫 문장은 4차 라운드에 부분 철회됐다** (2026-08-07, PR [#979](https://github.com/coseo12/astro-simulator/pull/979) 2차 리뷰). **Phase 1 도 release PR 1건을 기다린다** — §10-2 **전이 조건 5·6** 신설. 근거는 *"cancel 0 이 축을 잘못 쟀다"* (2차 정정) 가 아니라 **Phase 0 효과 자체가 릴리스 경로에서 0회 실측**이라는 점이다: Phase 0 머지 (2026-08-07T11:48Z) 이후 `base=main` 머지 0건 / `main` push 0건이라, 아래 4항이 서 있는 유일한 표본 `c2732ae` 는 **Phase 0 이전 SHA** 다. 즉 4항은 *"Phase 0 가 적용되지 않은 세계"* 를 덮는다. **단 릴리스 소요는 3주기가 아니라 1주기**이므로 cross-validate 수용의 실질 (3주기 회피) 은 유지된다 (§11 라운드 2 합의 4 각주).

| | 초판 근거 (**유지**) | 신설 근거 (**추가**) |
|---|---|---|
| 무엇 | 소급 리허설 — release PR 6건 × 후보 전수 대조 (§10-4 단계 1) | **`G2` 를 대상 SHA 에 직접 1회 실행해 빈 출력 확인** (§8-P1-G) |
| 커버 축 | **`cancelled` 축**을 release SHA **6건** 위에서 | 그 SHA 에 **실재하는 동명 쌍**의 통과/미통과 불일치 — `cancelled` 든 flake 든 **원인 무관** |
| 표본 폭 | 넓음 (6 SHA) | 좁음 (1 SHA) — 대신 원인 축이 넓음 |
| 비용 | 0 (수행 완료) | **수 초** (릴리스 대기 아님 — 릴리스 3주기 회피는 그대로 유지) |

**두 근거는 직교하며, 아래 4항을 전부 합쳐야 Phase 1 required 3개의 위험 축이 덮인다.** 초판 정정문이 소급 리허설을 *"cancelled 축만"* 으로 격하해 폐기한 것은 과잉이었다 — 좁은 것은 **원인 축**이지 **표본 폭**이 아니었고, `G2` 는 반대로 원인 축이 넓은 대신 표본이 1건이다.

**event *type* 축은 위 둘 중 어느 쪽도 아닌 세 번째 경로로 닫힌다 — 구조적 부재의 정적 확인이다.** Phase 1 required 3개 중 `edited` 처럼 SHA 를 바꾸지 않는 반복 이벤트로 **통과 3종 밖 결론을 만들 수 있는 것은 하나도 없다** (§2-12 실측 3 전수: `branch-name` = `[opened, synchronize]` + concurrency 보유 / `label-pr` = `[opened, synchronize, ready_for_review]` / `project-guards` 는 `push` × `pull_request` 의 event 축만). 유일한 노출자였던 `pr-template-checklist` 는 결정 9-1 로 제외했다. 즉 이 축은 **측정이 아니라 트리거 정의로** 닫혀 있고, 그 전제가 깨지는 순간을 §10-5 재검토 조건 8·9 가 감시한다.

> **한정어 주의 (2026-08-07, 🔴-2 (4) 수용)**: 위 문장은 초판에서 *"…반복 이벤트를 가진 것은 **하나도 없다**"* 였고 그것은 **문자 그대로 거짓**이다 — `label-pr` 의 `ready_for_review` 는 SHA 를 바꾸지 않는다. 다만 그 경로가 만드는 결론은 `{skipped, success}` 로 **통과 3종 안**이라 `G2` 기준 불일치가 아니고, 55일 창 실측 재트리거도 **0** 이다 (§2-12 실측 3 각주). 그래서 *"하나도 없다"* 가 아니라 **"통과 3종 밖 결론을 만드는 것이 하나도 없다"** 가 정확한 서술이다.

**PR 다중성 축은 네 번째 다리로 닫힌다 — 사후 게이트가 아니라 사전 확인이다** (신설 2026-08-07, PR [#979](https://github.com/coseo12/astro-simulator/pull/979) 리뷰 🔴-2). 대상 릴리스 SHA 가 **단일 PR 의 head 임을 A1 직전에 확인**한다 (§8-P1-G **S4**, 1줄 / 1초). 이 축은 앞의 세 다리 **어느 것도 덮지 못한다**:

| 다리 | PR 다중성 축을 덮는가 | 왜 |
|---|---|---|
| 소급 리허설 (release 6 SHA · `cancelled` 축) | ✗ | 원인 ③ 은 `cancelled` 를 만들지 않는다 (`branch-name` 은 `{failure, success, success}`) |
| `G2` 1회 실행 | ✗ (**사전** 차단으로는) | `G2` 는 *과거 SHA* 의 결과를 읽는 사후 검출이다. 게다가 **S2 (`base=main` 고정) 가 이 축을 표본에서 구조적으로 배제**한다 — 관측된 2건 (`4f7366e` / `995b8b5`) 은 둘 다 `base=develop` PR head 라 영원히 표본에 들어오지 않는다 |
| `types:` 전수 (정적) | ✗ | PR 다중성은 `types:` 정의와 무관하다. `branch-name` 은 `types` 가 좁고 concurrency 도 보유하는데 발화했다 |
| **`S4` (신설)** | **✓** | 대상 SHA 를 head 로 삼는 PR 수를 직접 센다. `1` 이 아니면 A1 진행 금지 |

> **표본을 고치는 동작이 새 사각을 만들었다** — 이것이 §10-1 한계 3 의 *"측정하지 않은 축을 위험 없음으로 결론"* 의 **세 번째 재생산**이다. 라운드 1 진단은 *"식은 고칠 필요가 없었으나 표본은 고쳐야 했다"* 였는데, 라운드 2 실측은 **고친 표본 규칙(S2)이 실제로 발화한 유일한 축을 배제한다**를 보였다. 문제는 한 층 (표본) 이 아니라 두 층 — **모델 층 (축 열거, §2-5) 과 표본 규칙 층 (S2 ↔ S4)** — 에 있었다. 판정식 `G2` 는 이번에도 정상이었다 (`4f7366e` 에서 `branch-name` 을 정확히 잡았다 — §2-12 실측 5).

> ⚠️ **`G2` 1회 실행이 "전 축 커버" 라는 서술은 거짓이었다 — 회수한다** (PR #979 리뷰 🔴-1). `G2` 의 판정식은 한 이름 그룹에 항목이 **2개 이상**일 때만 발화하므로 (`group_by(.name) | select((map(.pass)|unique|length) > 1)`), 동명 쌍이 없는 SHA (`n=1`) 에서는 **결론이 무엇이든 빈 출력**이다. 판정식이 원인을 구분하지 않는다는 성질은 **대상 SHA 가 그 축을 표본에 포함한다**는 것까지 보장하지 않는다 — *"식은 고칠 필요가 없었으나 표본은 고쳐야 했다."* 이것은 §10-1 한계 3 이 초판을 두고 쓴 진단 (*"측정하지 않은 축을 위험 없음으로 결론"*) 의 재생산이며, 조치는 §8-P1-G 의 **대상 SHA 선정 조건 (`max_n ≥ 2`) + 판정표의 부분 판정 행**이다.

**즉 Phase 1 은 "게이트 없음" 에서 "릴리스 무관 게이트 1개" 로 바뀐다.** 이것이 `G2` 를 **Phase 1 의 진입 조건으로 격상**한다는 의미이며, 절차 원문은 §8-P1-G 다. `G2` 는 원래 Phase 2 진입 조건으로만 정의돼 있었으나, 그 판정식이 (원인 무관하게) 결론 불일치를 직접 보므로 event *type* 축에도 **수정 없이 그대로 적용**된다 — 실제로 `ee64871` 에서 `pr-template-checklist` 1건을 잡는 것이 확인됐다 (§2-12 실측 1).

**required 절대 금지 목록** (ADR 로 박제 — 미래에 "왜 안 넣었지?" 재발 방지):
`a11y-baseline-guard` / `measure` / `retry-fresh-runner` / `verify` (shader-pixel) / `bench` (`bench.yml`) — **workflow 단위 path 필터** 보유 (docs-only PR 에서 영구 pending).
`close-linked-issues` / `bootstrap` / `plan`·`bench`·`aggregate` (`bench-baseline-remeasure.yml`) — 대상 PR 에서 미보고 (각각 PR `closed` 이벤트 전용 / `workflow_dispatch` 전용).
`Vercel Preview Comments` / `GitGuardian Security Checks` — 외부 서비스 장애 = 릴리스 하드 블록.

> `bench` 가 두 줄에 등장하는 것은 오기가 아니다 — `bench.yml` 과 `bench-baseline-remeasure.yml` 이 **동명 job id `bench`** 를 쓴다 (§2-5 부수 발견). 금지 사유는 서로 다르지만 (path 필터 / `workflow_dispatch` 전용) 양쪽 다 금지다.

### 결정 2 — `develop` 보호: **최소 보호 채택, required check 는 미채택 (영구)**

`allow_force_pushes: false` + `allow_deletions: false` 만 걸고 `required_status_checks: null` / `required_pull_request_reviews: null` 로 둔다. ff-sync 는 non-force 일반 push 라 영향 0이며, 이력 파괴 (force-push·브랜치 삭제) 만 차단된다.

"develop 직접 push 금지" 라는 CLAUDE.md 산문 규약은 **기계적으로 강제하지 않는다**. 강제하면 §4 (c)/(d) 대로 릴리스 의례가 깨지기 때문이다. 이 격차는 은폐하지 않고 §10-1 에 한계로 명시한다.

부수 효과 (수용): develop 의 긴급 force-push 복구가 불가능해진다. 대체 경로는 revert 커밋이며, 정말 필요하면 §9-R2 롤백으로 5초 내 해제 가능.

### 결정 3 — CANCELLED: **가정하지 않고 구조적으로 제거**

§5 (b) 채택. concurrency 그룹 키에 `${{ github.ref }}` 를 추가해 교차 취소를 소멸시킨다. 이것을 **Phase 1 을 포함한 모든 단계의 선행 조건 (Phase 0)** 으로 둔다.

> ⚠️ **제거 대상은 `cancelled` 결론이지 동명 체크런이 아니다.** Phase 0 이후에도 동명 쌍은 남으며 오히려 **완주 쌍이 3 → 7 로 는다** (§2-11). 이 결정이 사는 것은 "결론 불일치의 100% 재현되던 원인" 이고, flake 발 불일치는 §10-1 한계 3 의 잔여 위험으로 남아 §8-P0 `G2` 게이트가 관측한다.

Phase 1 후보 (초판 4개 → 결정 9 로 3개) 는 실측상 cancel 0 이지만, 그것은 "짧아서 두 번째 이벤트 run 이 시작되기 전에 끝났다" 는 **경합 결과**일 뿐 보장이 아니다 (#974 실측: push run 09:34:29 종료, PR run 09:35:26 시작 — 57초 여유가 우연히 있었을 뿐). 하드 블록의 비대칭 비용을 감안하면 PR 1건의 선행 비용이 훨씬 싸다.

`docs/ops/operational-friction.md` §4 의 "CANCELLED = 코스메틱" 판별법은 **사람이 눈으로 판정할 때만** 유효하다. required check 하에서는 GitHub 이 판정하며 그 규칙은 문서화돼 있지 않다 — 같은 문서를 갱신해 이 경계를 박제한다 (§8-P0 산출물).

### 결정 4 — 봇 PR: **정책적으로 영향 0, 단 방어적으로 고정**

develop 에 required check 를 도입하지 않고 (결정 2) 봇 PR 은 main 을 대상으로 하지 않으므로 영향은 0이다. 추가로:

- 봇 PR 의 `base` 는 **feature 브랜치 유지** (현행). `base=develop` 으로 되돌리지 않는다 — 되돌릴 경우 `GITHUB_TOKEN` 워크플로 미트리거 제약이 발현하면 required check 가 영구 pending 이 될 수 있다 (#600 에서는 미발현했으나 `n=1` 이라 전제로 삼지 않는다).
- 만약 향후 봇 PR 을 develop 대상으로 되돌린다면, 그 PR 의 DoD 에 "체크런 실보고 확인" 을 넣는다 (§10-3 후속 3).

### 결정 5 — `enforce_admins`: **`true` 유지 (낮추지 않음)**

`enforce_admins` 는 **규칙의 우회**를 통제할 뿐 **규칙의 편집·삭제**를 막지 않는다. 토큰이 `repo` scope + repo `admin: true` 이므로 (§2-1) §9-R1 의 한 줄로 **약 2초 만에** required check 를 걷어낼 수 있다. 즉 탈출구는 이미 존재한다.

반대로 `false` 로 낮추면 "빨간 체크인 채로 실수 머지" 라는 **새로운 사고 클래스**가 열린다. 이 저장소는 자기 자신을 머지하는 1인 환경이라 그 실수를 잡아 줄 관찰자가 없다 — `enforce_admins: true` 야말로 유일한 관찰자다.

**추가 논거 (cross-validate 이견 수용, §11)**: 두 선택지는 "우회 가능 여부" 가 아니라 **흔적이 남는가**에서 갈린다. `enforce_admins: false` 의 우회 머지는 아무 기록도 남기지 않는 반면, `true` 를 유지한 채 §9-R1 로 규칙을 걷어내면 보호 규칙 변경이 **계정 보안 로그와 API 상태에 남는다**. 즉 `true` 유지는 탈출구를 없애는 게 아니라 **탈출을 관찰 가능하게 만든다**. (Organization 수준 audit log 만큼 상세하지는 않다 — 개인 계정은 security log 범위다.)

**전제 (성립 조건)**: 본 결정은 **작업 토큰이 해당 저장소의 admin 권한을 갖는다**는 사실에 의존한다. fine-grained PAT 로 전환해 `Administration` 권한이 빠지면 §9-R1 이 `403` 으로 실패하고 **탈출구가 실제로 사라진다**. 따라서 §8 의 사전 확인 1줄 (`.permissions.admin == true`) 은 선택이 아니라 **적용 전 필수 게이트**이며, 토큰 정책 변경은 §10-5 재검토 조건 6 에 걸어 둔다.

**단 조건부 결정이다**: 탈출구가 문서화되지 않으면 존재하지 않는 것과 같다. §9-R1/R2/R3 롤백 명령 원문을 본 ADR 과 이슈 #971 코멘트 양쪽에 박제하고, 릴리스 런북 (`docs/guides/branch-strategy-workflow.md`) 에서 링크하는 것을 Phase 1 의 산출물로 고정한다.

### 결정 6 — Phase 0 (코드 선행 작업, 설정 변경 0)

| # | 변경 | 대상 | 이유 |
|---|---|---|---|
| 6-1 | concurrency 그룹 키에 `${{ github.ref }}` 삽입 | `ci.yml`, `ci-physics-wasm.yml`, `project-guards.yml`, `a11y-baseline-guard.yml`, `fps-baseline-guard.yml`, `shader-pixel-guard.yml`, `bench.yml` (7개. `branch-name-guard.yml` 은 PR 번호 키라 제외) | 결정 3 |
| 6-2 | `ci-physics-wasm.yml` 의 `diff-scope` job 에 `name: diff-scope-wasm` 부여 | `ci-physics-wasm.yml` | §2-5 **workflow 축** 제거 (`diff-scope` 4 → `diff-scope` 2 + `diff-scope-wasm` 2). ⚠️ **event 축 ×2 는 남으므로 동명 "해소" 가 아니라 "축소"** 다. job id 는 유지하고 `name:` 만 추가하면 `needs:` 참조 3곳을 건드리지 않는다 |
| 6-3 | `ci.yml` 상단 주석의 *"required check 도입 시 본 전제 재검토"* 를 본 ADR 링크로 갱신 | `ci.yml` | 이미 있는 예고 주석의 회수 |
| 6-4 | `docs/ops/operational-friction.md` §4 에 "required check 하에서는 코스메틱 전제가 무효" 경계 박제 | 동 문서 | 결정 3 후단 |
| 6-5 | [20260701-779](20260701-779-ci-alert-fatigue-concurrency.md) 에 Amendment 추가 — **(i)** §재검토 조건 2 의 "ref 가 달라 별도 group" **가설을 실측으로 해소** + **(ii) 결정 1 (push+PR 교차 dedup) 의 적용 범위가 릴리스 SHA 에서 축소됨을 박제** + 본 ADR 역링크 | 동 ADR | §2-10 / §5 (b). **"사실 오류" 가 아니라 "예고된 가설의 실측 해소"** 다 — #779 원문은 hedge (*"별도 group 으로 동작할 **수 있음**"*) 에 더해 정확한 진단 지시 (*"group 에 ref 미포함 확인"*) 까지 남겼고, 본 ADR 은 그 절차를 그대로 수행해 답을 채웠다. 선행 저자가 남긴 것은 오판이 아니라 **미해소 가설 + 검증 절차**다. (ii) 를 함께 박제해야 다음 회수자가 "왜 concurrency 가 릴리스 경로에서 안 먹지?" 를 추적할 수 있다 |

Phase 0 은 일반 dev PR (base=develop) 이며 저장소 설정을 만지지 않는다. **머지 직후 Phase 1 로 진행한다** (release PR 대기 없음 — 결정 1 의 관찰 게이트 표 참조). Phase 0 의 효과 실측 (release PR 에서 cancelled 0) 은 **Phase 2 의 진입 게이트**다.

### 결정 7 — 선언적 관리: repo 내 JSON + 스크립트 (§3-2 (b))

- SSoT: `.github/branch-protection/main.json` / `develop.json` (payload 전문). 본 ADR §8 이 그 초판 원문이다.
- 적용: `scripts/apply-branch-protection.sh <branch> [--dry-run]`
- 드리프트 검사: `scripts/verify-branch-protection.sh` — **로컬/메인 전용** (§3-2 한계). CI 배선 안 함.
- 구현은 developer 후속 (§10-3 후속 2). Phase 1/2 는 §8 의 heredoc 명령으로 선행 가능하다 — 스크립트 부재가 정책 도입을 막지 않도록 순서를 분리한다.

### 결정 8 — required 컨텍스트 이름의 정적 가드 (신설, cross-validate 이견 수용)

required 목록은 **job 이름 문자열**로 저장되므로, 훗날 누군가 `.github/workflows/**` 의 job 이름을 바꾸면 GitHub 은 사라진 옛 이름을 **영구 `Expected`** 로 기다린다. 보호 설정과 워크플로가 서로를 모르는 채 drift 하는 구조다.

이 구멍은 **admin 권한 없이 CI 에서 닫을 수 있다**. §3-2 의 한계는 "보호 상태를 *읽는* 것" 에 관한 것이고, 반대 방향 — **repo 안의 required 목록 선언이 실재하는 job 이름과 일치하는가** — 는 워크플로 YAML 만으로 검사 가능하기 때문이다.

- SSoT: `.github/branch-protection/main.json` (결정 7) 의 `required_status_checks.checks[].context` 배열.
- 가드: 각 context 가 `.github/workflows/**` 의 job id 또는 job `name:` 으로 **실재**하는지 대조. 불일치 시 exit 1.
- 배선: `project-guards` 워크플로 (path 필터 0 — 자기 자신이 required 후보라 항상 돈다).
- fail-fast — fallback 분기 금지 (CLAUDE.md §가드 설계 원칙). 파일 부재는 "배포 시나리오" 가 아니라 가드 삭제 회귀다.

이 가드가 있어야 결정 7 의 JSON 선언이 장식이 아니라 **강제력**을 갖는다. 구현은 §10-3 후속 2 에 포함.

### 결정 9 — `pr-template-checklist` 는 required 에서 **제외**한다. 그리고 `concurrency` 를 추가하지 **않는다** (신설, 2026-08-07)

> 신설 근거: §2-12 (event *type* 축). PR [#978](https://github.com/coseo12/astro-simulator/pull/978) 리뷰 🔴-1.

#### 9-1 결정 — required 제외

`pr-template-checklist` 를 **Phase 1 required 집합에서 뺀다** (결정 1 표). Phase 2/3 에서도 재편입하지 않는다.

**근거**: 이 컨텍스트는 event *type* 축 노출을 가진 **유일한 required 후보**이며 (§2-12 실측 3), 그 노출이 **이미 실발화했다** (`ee64871`: `failure, failure, success`). 그리고 노출의 원인이 버그가 아니라 **가드의 설계 목적 그 자체** — *"본문을 고쳐라"* 라고 요구하는 가드이므로 편집 루프가 구조적으로 유도된다. 즉 시간이 지나도 자연 소멸하지 않는다.

**대가 (명시)**: PR 템플릿 7 체크박스 가드가 **권고로 남는다** (붉은 X 는 표시되나 머지를 막지 않음). 그러나 이 가드의 대상은 `base=develop` 일상 PR 이 대부분이고, develop 에는 애초에 required check 를 영구 미채택한다 (결정 2). **즉 이 가드를 main 의 required 로 올려도 실제 강제력이 미치는 범위는 release/hotfix PR 뿐**이라, 제외로 잃는 실효는 처음부터 작았다. 손실을 과장하지 않기 위해 박제한다.

#### 9-2 결정 — `pr-template-checklist-guard.yml` 에 `concurrency` 를 **추가 금지**

⚠️ **이것은 해결책이 아니다.** 직관적으로는 "concurrency 를 넣어 누적을 없애면 required 로 올릴 수 있다" 로 보이지만, 실측이 두 겹으로 반박한다.

**1차 근거 — 관측된 사례에서 concurrency 는 애초에 발화하지 않는다.** `ee64871` 의 세 run 은 시간적으로 분리돼 있다 (**run 레벨** 여유 10분 28초 / **2초** → **겹침 0**. 단위는 `created_at → updated_at` — §2-12 실측 1-b). `cancel-in-progress` 는 *진행 중인* run 만 취소하므로 **한 번도 발동하지 않으며**, `{failure, failure, success}` 는 **한 글자도 바뀌지 않는다**. 저장소 전체로도 재트리거 연속 쌍 27 중 겹치는 것은 **5** 뿐이다 (§2-12 실측 4).

> ⚠️ **1차 근거는 22/27 쌍만 덮는다 — 전칭이 아니다** (2026-08-07 정정, PR [#979](https://github.com/coseo12/astro-simulator/pull/979) 리뷰 🟡-1). 2초 여유는 관측된 겹침 분포 (1~9초) 안쪽 값이므로 1차는 *"발화할 수 없다"* 가 아니라 *"이 사례에서는 발화하지 않았다"* 다. 두 근거의 관계는 아래와 같은 **배타적 케이스 분할**이며, 그래서 1차가 성립해도 2차가 불필요해지지 않는다.
>
> | 경우 | 커버 | 결과 |
> |---|---|---|
> | 겹침 0 (27쌍 중 **22쌍**, `ee64871` 포함) | **1차** | concurrency 미발화 → `{failure, failure, success}` 불변 → `G2` 발화 |
> | 겹침 >0 (27쌍 중 **5쌍**, 1~9초) | **2차** | `cancelled` 제조 → `{cancelled, success}` → `G2` 여전히 발화 |

**2차 근거 — 발화하는 경우엔 오히려 나빠진다.** 겹치는 5건에서 `cancel-in-progress: true` 는 선행 run 을 `cancelled` 로 만든다. `cancelled` 는 GitHub 의 통과 3종 (`success`/`skipped`/`neutral`) 에 **없다** (§2-2). 즉 결과 집합이 `{failure, success}` → `{cancelled, success}` 로 바뀔 뿐 **여전히 `G2` 기준 불일치**다. Phase 0 가 저장소 전체에서 없애려던 바로 그 결론을, 한 워크플로에 국소 재도입하는 셈이다.

**결론**: 두 근거 중 어느 쪽 경로를 타든 `G2` 는 계속 발화한다. concurrency 추가는 **문제를 옮길 뿐 해소하지 않는다.**

**그럼 진짜 대응은?** 두 가지뿐이며 본 ADR 은 (i) 을 택한다.

| | 대응 | 판정 |
|---|---|---|
| (i) | **required 제외** (9-1) | **채택** — 워크플로 무변경. 가드의 동작·목적을 그대로 보존한다 |
| (ii) | `types` 에서 `edited` 제거 | **본 ADR 범위 밖 → 후속 분리** (§10-3 후속 5). 누적 원인은 근절되나 *"본문 고치면 즉시 재검사"* 라는 UX 를 잃고, §10-1 한계 6 이 박제한 **유일한 초 단위 복구 경로**까지 함께 사라진다 — required 화를 위해 가드의 사용성을 깎는 교환이라 별도 판단이 필요하다 |

#### 9-3 조건부 기술 — `label-pr` 은 **같은 구조이나 같은 클래스가 아니다**

`harness-pr-review.yml` (`label-pr`) 도 **concurrency 블록이 없다** — 구조는 `pr-template-checklist-guard.yml` 과 동일하다. 그럼에도 Phase 1 required 에 **유지**한다.

**근거**: 누적을 만드는 것은 concurrency 부재가 아니라 **SHA 를 바꾸지 않는 반복 이벤트**이고, `label-pr` 의 `types: [opened, synchronize, ready_for_review]` 에는 그런 이벤트가 없다 — `opened` 는 1회, `ready_for_review` 는 draft→ready 1회성, `synchronize` 는 정의상 SHA 를 바꾼다. 실측 동일 SHA 누적 **0건** (20일 창).

**단 이것은 조건부다 — 재검토 트리거를 건다** (§10-5 재검토 조건 8): `harness-pr-review.yml` 의 `types` 에 `edited`·`labeled`·`unlabeled`·`reopened` 등 **SHA 를 바꾸지 않는 이벤트가 추가되면** 즉시 `pr-template-checklist` 와 같은 클래스가 되며, 그때는 required 에서 빼거나 트리거를 되돌려야 한다. 현재 안전한 이유가 "concurrency 를 갖췄기 때문" 이 아니라 **"트리거 목록이 우연히 좁기 때문"** 이므로, 그 좁음이 유지되는지가 감시 대상이다.

> **`branch-name` 은 이 논의에 해당하지 않는다** (오분류 주의). `types: [opened, synchronize]` 로 `edited` 가 없고 **concurrency 도 보유**한다 (PR 번호 키). 두 겹 방어라 event *type* 축 노출이 0 이다. 초기 분석에서 이를 같은 클래스로 묶은 서술이 있었으나 실측으로 철회됐다 (§2-12 실측 3).
>
> ⚠️ **위 *"두 겹 방어라 노출 0"* 은 event *type* 축 한정이다 — 다른 축으로 일반화하지 말 것** (정정 2026-08-07, PR [#979](https://github.com/coseo12/astro-simulator/pull/979) 리뷰 🔴-2 요구 조치 6). **PR 다중성 축 (§2-5 4행 / §2-12 원인 ③) 에서는 `branch-name` 이 required 3개 중 노출이 가장 크다.** 두 겹 방어 중 어느 쪽도 이 축에 작용하지 않는다 — `types` 가 좁은 것은 *같은 PR 안의* 반복을 줄일 뿐이고, PR 번호 키 concurrency 는 오히려 PR 마다의 run 을 **정상 분리**해 결론을 영구 공존시킨다.
>
> | 축 | `branch-name` 노출 | 근거 |
> |---|---|---|
> | event *type* 축 | **0** (required 3개 중 가장 안전) | `edited` 부재 + concurrency 보유 |
> | **PR 다중성 축** | **required 3개 중 최대** | 판정이 **커밋 내용이 아니라 브랜치 이름의 함수**인 유일한 컨텍스트 → N개 결론이 **정당하게** 갈린다 (`4f7366e` 실발화). 부수로 `pull_request` 워크플로 11개 중 **유일하게 `branches:` 필터 부재**라 어떤 base 를 향한 PR이든 체크런을 얹는다 |
>
> **required 후보로서의 위험**: 이 축이 릴리스 SHA 위에서 발화하면 **rerun 으로도 Phase 0 로도 회복되지 않는다** (§10-6 시나리오 D). 그럼에도 `branch-name` 을 required 에 **유지**하는 근거는 (a) base rate 가 20일 창 **0건** (§10-1 한계 12) (b) **A1 직전 `S4` 1줄로 사전 확인 가능** (§8-P1-G) (c) 발생 시 §9-R1 롤백이 2초 — 즉 위험이 **사전 관측 가능하고 사후 탈출 가능**하기 때문이다. 이 세 조건 중 하나라도 깨지면 §10-5 재검토 조건 12 가 발동한다.

---

## §7 비목표 (이번 범위에서 절대 손대지 않음)

1. `required_approving_review_count` 상향 — 1인 저장소에서 자기 PR 승인이 불가하므로 즉시 교착.
2. `develop` 의 required status check / PR 필수화 — 결정 2 에서 **영구 미채택**.
3. 클래스 A 워크플로의 `paths-ignore` → job 단위 `if:` 전환 — 별건 (§10-3 후속 1).
4. Repository rulesets 전환 — §3-3 기각.
5. `strict: true` (up-to-date 요구) — 결정 1.
6. 외부 앱 체크 (Vercel / GitGuardian) 의 required 화 — 결정 1.
7. 보호 상태의 **CI 자동 검증** — PAT 시크릿이 필요하고 그 자체가 새로운 자격증명 노출.
8. 릴리스 의례 변경 (merge-back PR 도입 등) — §4 (e) 기각.
9. 봇 PR 의 `base` 를 develop 으로 되돌리기 — 결정 4.

---

## §8 적용 절차 (사용자 승인 후 메인이 실행)

> 전부 복붙 가능한 원문. **`REPO` 를 한 번만 export** 하고 나머지는 그대로 붙여 넣는다.
>
> **필수 사전 게이트 (결정 5 의 성립 조건)** — `true` 가 아니면 **어떤 단계도 적용하지 않는다**. admin 권한 없이 required check 를 켜면 §9 롤백이 `403` 으로 실패해 탈출구가 사라진다.
> ```bash
> gh api repos/coseo12/astro-simulator -q '.permissions.admin'   # 기대: true
> ```
> **이 게이트의 정밀도 한계 — 그리고 왜 무해한가**: `.permissions.admin` 은 **사용자의 저장소 역할**을 반환하므로, fine-grained PAT 로 전환해 `Administration` 권한만 빠진 경우에도 `true` 를 반환할 수 있다. 즉 §10-5 재검토 조건 6 이 걱정하는 바로 그 시나리오를 못 잡을 수 있다. **그러나 위험은 구조적으로 자기 제한된다** — GitHub REST 문서상 `PUT .../branches/{b}/protection` (§8-A1) 과 `DELETE .../protection/required_status_checks` (§9-R1) 은 **동일한 admin/owner 권한 클래스**다. 따라서 **A1 이 성공하면 R1 은 반드시 허용된다**: 적용과 롤백 사이에 토큰을 교체하지 않는 한 탈출구를 잃을 수 없다. 게이트의 정밀도 부족이 하드 블록으로 이어지는 경로가 없다. (부수: §2-1 의 `GET .../protection` 성공 자체가 admin 을 요구하므로 `.permissions` 조회보다 강한 신호다.)

```bash
export REPO=coseo12/astro-simulator
```

> **[판정 대상 SHA 의 정의 — 전 §8 공통]** (신설 2026-08-07, PR [#979](https://github.com/coseo12/astro-simulator/pull/979) 리뷰 부수 발견)
>
> **required status check 의 판정 단위는 PR 의 head SHA 다 — 머지 커밋이 아니다.** GitHub 은 PR 머지 가능 여부를 평가할 때 `head_sha` 위의 체크런을 읽으며, 머지 후 생성되는 머지 커밋의 체크런은 어떤 required 판정에도 쓰이지 않는다. 본 §8 의 모든 게이트 (`G1` / `G2` / `P1-G`) 와 §10-4 의 모든 관측이 이 단위를 쓴다.
>
> ```bash
> SHA=$(gh pr view <PR번호> --json headRefOid -q .headRefOid)   # 판정 대상. full SHA 반환
> ```
>
> **왜 명시하는가 — 머지 커밋을 보면 위험을 과대 판정한다.** v0.61.0 release 머지 커밋 `58ccfcf` 는 `project-guards` 가 **`{cancelled, success}`** 로 갈린다 (2026-08-07T12:43Z 실측):
>
> ```text
> project-guards  push / main      2026-08-06T09:54:18Z→09:54:28Z  cancelled
> project-guards  push / develop   2026-08-06T09:54:26Z→09:54:44Z  success
> ```
>
> 이는 ff-sync 가 만드는 **B1 클래스** (push↔push, 다른 branch) 로 [20260701-779](20260701-779-ci-alert-fatigue-concurrency.md) §A2-3 이 분류한 것이며 **Phase 0 6-1 이 제거하려는 축**이다. 그러나 **이 SHA 는 애초에 required 판정 대상이 아니다** — 같은 릴리스의 판정 대상은 PR #974 의 head `c2732ae` 이고 거기서는 `n=2 [success, success]` 다. 이 정의가 없으면 머지 커밋의 불일치를 required 위험으로 오독하게 된다.
>
> ⚠️ **B1 제거는 아직 실측되지 않았다 — 초판의 확인 근거를 회수한다** (정정 2026-08-07, PR [#979](https://github.com/coseo12/astro-simulator/pull/979) 리뷰 🟡-7. reviewer 가 자기 1차 문장을 자기 정정한 항목이며 본 ADR 이 그것을 인용했으므로 함께 정정한다). 초판은 위 문장에 *"(Phase 0 이후 develop push `ab05620` 에서는 `project-guards n=1 success` 로 확인)"* 을 달았으나 **성립하지 않는다**. `ab05620` 은 **develop push 단독** SHA 로 `main` 에 도달한 적이 없어 **push 쌍이 구조적으로 존재할 수 없다**. B1 은 ff-sync (`main`·`develop` 이 같은 SHA) 에서만 성립하므로 `n=1` 은 Phase 0 와 무관한 **자명값**이며, *"Phase 0 가 B1 을 제거함이 확인됐다"* 로 읽히는 것은 오독 유도다. 실측 재확인 (2026-08-07T13:3xZ):
>
> ```text
> Phase 0 머지 커밋   : ab05620  2026-08-07T11:48:05Z  (develop tip)
> 최근 base=main 머지 : #974 c2732ae  2026-08-06T09:54:14Z   ← Phase 0 머지보다 이전
> main tip            : 58ccfcf  2026-08-06T09:54:13Z        ← Phase 0 이후 main push 0건
> → Phase 0 이후 release/hotfix PR 0건 / main push 0건 → B1 제거는 릴리스 경로에서 0회 실측
> ```
>
> 정확한 서술: **"Phase 0 머지 (2026-08-07T11:48Z) 이후 `base=main` 머지·`main` push 가 0건이라 B1 제거는 아직 미실측이다."** 이 공백이 §10-2 전이 조건 5·6 (다음 release PR 1건 관찰 / Phase 0 이후 head 로 P1-G 재실행) 의 직접 근거다.

### P0 — Phase 0 (코드 PR. 설정 변경 없음)

developer 디스패치. 결정 6 의 6-1~6-5. 머지 후 **P1-G (Phase 1 진입 게이트) → A1** 순으로 진행한다.

아래 **게이트 2개**가 **Phase 2 (A3) 의 진입 조건**이다 — 다음 release PR 1건에서 **둘 다 빈 출력**이어야 한다. (`G2` 는 추가로 **Phase 1 진입 조건**이기도 하다 — §8-P1-G.)

> ⚠️ **`G1`·`G2` 에도 §8-P1-G 의 [전제 확인] 과 `exit` 판정이 동일하게 적용된다.** 빈 출력은 *"위반 0"* 과 *"측정 실패"* 를 구분하지 못하므로, 두 게이트 모두 **① required 대상 이름이 실제로 존재 (S1) ② `gh api` 가 exit 0 ③ `total_count ≤ 100` (S3 — `per_page` cap 미도달)** 를 전건 충족한 경우에만 빈 출력을 통과로 읽는다 (cross-validate Q4 이견 수용 §11 + PR [#979](https://github.com/coseo12/astro-simulator/pull/979) 리뷰 🟡-4). 이 실패 클래스는 §10-1 한계 10 (창 cap 오통과) 과 **같은 클래스** — *"없는 것"* 과 *"못 본 것"* 이 같은 모양으로 나오는 구조다.
>
> **`total_count` 검증이 왜 별도 조건인가** (🟡-4): `check-runs?per_page=100` 의 `100` 은 §10-1 한계 10 의 `gh run list --limit N` 과 **동일한 개수 cap** 이다. 응답이 cap 에 닿으면 잘린 표본을 전수로 오독하고, 그 결과는 다시 **빈 출력 = 통과** 방향으로 기운다. 응답이 `total_count` 를 주므로 한 줄로 닫힌다 — **`total_count > 100` 이면 판정 불가**, `--paginate` 로 전량 수집 후 재판정. 현재 여유는 충분하다 (2026-08-07T12:42~13:31Z 실측: release SHA 6건 전부 `total_count=27` / `ee64871` 18 / `0e193d2` 15 / **`4f7366e` 46 — 관측 최대**) 하지만 `edited` 누적 워크플로를 보유한 저장소라 **상한 보장이 아니다**. **PR 다중성 축 (§2-5 4행) 이 발화하면 총량이 PR 수만큼 배가된다** — `4f7366e` 의 46 이 정확히 그 사례 (27 → ×3 규모) 이므로, 이 축은 S3 압박 요인이기도 하다.
>
> ⚠️ **`G2` 는 동명 쌍이 없는 SHA (`max_n = 1`) 에서 결론과 무관하게 빈 출력을 낸다** (S2 — §8-P1-G 대상 SHA 선정). `G1`·`G2` 의 대상은 **release PR head** 로 고정돼 있어 (`project-guards n=2`) 이 조건은 구조적으로 충족되나, 다른 SHA 로 대체할 때는 `max_n ≥ 2` 를 먼저 확인해야 한다.

SHA 를 한 번만 잡아 둔다:

```bash
SHA=$(gh pr view <releasePR> --json headRefOid -q .headRefOid)   # full SHA 가 반환된다
```

**G1 — `cancelled` 체크런 0** (Phase 0 의 직접 효과 확인):

```bash
gh api "repos/$REPO/commits/$SHA/check-runs?per_page=100" \
  -q '.check_runs[] | select(.conclusion=="cancelled") | .name'
```

> ⚠️ **`G1` 이 붉어져도 즉시 Phase 0 실패로 판정하지 말 것 — 선분류 의무가 있다.**
> [20260701-779](20260701-779-ci-alert-fatigue-concurrency.md) **§A2-6 재검토 조건 10** 이 이 게이트의 정본 판정 절차다. Phase 0 는 C 클래스 (동일 ref 재트리거) 의 취소를 **의도적으로 보존**하므로, C 잔존은 Phase 0 실패가 **아니다**. A / B1 / B2 가 잔존할 때만 실패다. 분류 명령 원문과 클래스 정의는 §A2-6 조건 10 을 따른다 (본 ADR 이 명령을 사본으로 갖지 않는 이유 — 두 곳에 두면 drift 한다).
>
> 반대 방향 참조도 성립한다: §A2-6 조건 10 은 *"ADR 971 §8-P0 `G1` 이 게이트다"* 로 본 절을 가리킨다. **판정식은 여기, 분류 절차는 저기** 가 두 문서의 역할 분담이다.

**G2 — 동명 체크런의 결론 불일치 0** (§2-12 의 잔여 위험 3종을 **원인 무관하게** 한 번에 확인 — 단 각 축이 표본에 실제로 포함될 때만. §10-1 한계 11·12):

```bash
gh api "repos/$REPO/commits/$SHA/check-runs?per_page=100" \
  -q '[.check_runs[] | select(.status=="completed")
       | {name, pass: (.conclusion | IN("success","skipped","neutral"))}]
      | group_by(.name)[] | select((map(.pass) | unique | length) > 1) | .[0].name'
```

> **판정 기준이 "결론 문자열 불일치" 가 아니라 "통과/미통과 불일치" 인 이유** (reviewer 2차 🟡-C 수용):
> 초판은 `(map(.conclusion) | unique | length) > 1` 이라 §2-2 가 확정한 **통과 3종 분할을 쓰지 않았다**. 그 결과 `success`+`skipped`(조건부 job) / 금지 목록 체크의 flake / 미완주 `null` **세 경로에서 양성이나 무해한 발화**가 가능하고, `G2` 빈 출력은 **Phase 2 하드 진입 조건 + Accepted 조건 2** 이므로 게이트가 스스로 진행을 막는 자기모순이 된다. 정밀화 후에도 **발화력 손실은 0** — `c2732ae` 에서 현행식과 **동일 7건**을 잡는다(메인·reviewer 각각 실행 확인). `retry-fresh-runner`(`cancelled,skipped`)가 여전히 잡히는 것이 근거다 — `cancelled` 는 미통과, `skipped` 는 통과라 **이것도 진짜 통과/미통과 불일치**이기 때문이다.


> **G1 과 G2 는 직교다 — 어느 쪽도 다른 쪽을 포함하지 않는다.**
> - **G1 만 잡는 것**: 동명 N개가 *전부* `cancelled` 인 경우 — 결론이 일치하므로 G2 는 침묵한다.
> - **G2 만 잡는 것**: **`failure` + `success` 혼재** — §10-1 한계 3 이 지목하는 잔여 위험 **3종 모두** (① flake 발 / ② event *type* 축 누적 / ③ PR 다중성 × 브랜치명 의존 판정 — §2-12) 가 여기 속한다. `cancelled` 가 하나도 없으므로 **G1 은 이를 원리적으로 검출하지 못한다.** `G2` 가 원인이 아니라 **결과**를 보는 판정식이라 축이 둘 더 발견돼도 **식을 고칠 필요가 없었던** 것이 이 설계의 실효 증거다 (`4f7366e` 에서 ③ 을 정확히 잡는다 — §2-12 실측 5).
>   - ⚠️ **단 `G2` 는 사후 검출이다.** ③ 은 발화하면 rerun 으로 수렴하지 않으므로 (§10-1 한계 12), `G2` 가 잡아 주는 것으로는 부족하고 **사전 확인 `S4`** 가 필요하다 (§8-P1-G). *"식이 원인을 구분하지 않는다"* 는 성질이 *"표본이 그 축을 포함한다"* 도, *"검출이 곧 회복 가능"* 도 보장하지 않는다.
>
> **게이트 발화 확인 (negative baseline)**: Phase 0 *이전* 상태인 `c2732ae` 에 G2 를 돌리면 7개 이름이 출력된다 (§2-11 의 `cancelled,success` **6건** + `cancelled,skipped` 1건 = 7 = `a11y-baseline-guard` / `detect-and-test` / `long-integration-rust` / `measure` / `retry-fresh-runner` / `verify` / `verify-and-rust`). 게이트가 침묵하는 가드가 아님을 확인한 값이며, **Phase 0 이후 이 출력이 비는 것**이 진입 조건이다. 2026-08-07T11:50Z 재실행에서 동일 7건 재현.

### P1-G — **Phase 1 진입 게이트** (A1 실행 전 필수, 신설 2026-08-07)

> 결정 1 §Phase 1 면제 근거 재작성 / 결정 9. **이 게이트 자체는 릴리스를 기다리지 않는다** — 소요 수 초.
>
> ⚠️ **단 Phase 1 *착수* 는 릴리스 1건을 기다린다** (2026-08-07 4차 정정, PR [#979](https://github.com/coseo12/astro-simulator/pull/979) 2차 리뷰). 본 게이트를 통과해도 §10-2 **전이 조건 5·6** (다음 release PR 1건 관찰 / Phase 0 이후 head 로 P1-G 재실행) 이 남는다. 이유는 **Phase 0 효과가 릴리스 경로에서 0회 실측**이라 아래 박제된 표본 `c2732ae` 가 **Phase 0 이전 SHA** 이기 때문이다 — 게이트가 통과시킨 것은 *"Phase 0 가 적용되지 않은 세계의 릴리스 SHA"* 다. **게이트의 릴리스 비의존성 (설계 속성) 과 착수의 릴리스 의존성 (표본 요구) 은 별개**이며, 이 게이트를 없애는 게 아니라 그 위에 조건을 얹은 것이다.
>
> **왜 필요한가**: Phase 1 의 면제 근거였던 *"release PR 6/6 cancel 0"* 은 `cancelled` 축만 측정한 값이다. `G2` 는 원인을 구분하지 않고 **결과인 통과/미통과 불일치**를 보므로, 동명 쌍이 실재하는 SHA 위에서 `cancelled` 와 flake 를 **한 번에** 덮는다. (event *type* 축은 이 게이트가 아니라 required 3개의 `types:` 전수로, **PR 다중성 축은 아래 `S4` 사전 확인으로** 각각 닫힌다 — 결정 1 §Phase 1 면제 근거 **4항 병존**.)
>
> **[판정 대상 SHA 의 정의 — 전 §8 공통]** required status check 의 판정 단위는 **PR 의 head SHA** 다. 머지 커밋이 아니다. 아래 모든 게이트 (`G1` / `G2` / `P1-G`) 도 같은 단위를 쓴다. 상세와 실측 반례는 §8 서두 박스를 참조한다.

#### 대상 SHA 선정 — 조건 4개 (2026-08-07 개정, PR [#979](https://github.com/coseo12/astro-simulator/pull/979) 리뷰 🔴-1·🔴-2)

> **초판은 *"최근 PR head 아무거나. 릴리스 PR 일 필요 없다"* 였고, 그것이 이 게이트를 무력화했다.** 일상 PR head 는 required 3개가 **전부 `n=1`** 이라 판정식 (`select((map(.pass)|unique|length) > 1)`) 이 **구조적으로 발화할 수 없다** — required 3개가 전부 `failure` 여도 빈 출력 + `exit=0` 이 나와 판정표상 *"통과"* 로 읽힌다 (reviewer 합성 픽스처 결정적 실증). 아래 조건이 그 경로를 닫는다.

| # | 조건 | 왜 | 무엇에 관한 조건인가 |
|---|---|---|---|
| S1 | required 3개 이름이 **전부** 보고됨 (`names` 3개, `completed ≥ 3`) | 이름 부재는 *"불일치 없음"* 과 형태가 같다 (초판부터 존재) | **표본 SHA** |
| S2 | **`max_n ≥ 2`** — required 3개 중 최소 1개가 동명 쌍을 보유 | `n=1` 만 있으면 판정식이 발화 불가. **신설 🔴-1** | **표본 SHA** |
| S3 | `total_count ≤ 100` — 응답이 `per_page` cap 에 닿지 않음 | cap 초과 시 잘린 표본을 전수로 오독 (§10-1 한계 10 과 동일 클래스). **신설 🟡-4** | **표본 SHA** |
| **S4** | **`distinct_head_branch = 1`** — **적용 대상 릴리스 SHA** 가 단일 PR 의 head | PR 다중성 축 (§2-5 4행 / §2-12 원인 ③) 부재 확인. 이 축은 `cancelled` 도 flake 도 아니라 **rerun·Phase 0 어느 쪽으로도 수렴하지 않는다**. **신설 🔴-2** | **적용 대상 SHA** (S1~S3 과 **적용 시점이 다르다** — 아래) |

> ⚠️ **S4 는 S1~S3 과 적용 대상이 다르다 — 이 구분이 S4 존재 이유의 핵심이다.**
>
> | | S1 · S2 · S3 | **S4** |
> |---|---|---|
> | 대상 | **P1-G 의 표본 SHA** (과거 `base=main` PR head) | **A1 을 켠 뒤 실제로 판정받을 릴리스 SHA** |
> | 시점 | P1-G 실행 시 | **A1 실행 직전** (그리고 각 release PR 머지 직전) |
> | 성격 | 사후 관측의 유효성 확보 | **사전 차단** |
>
> **S2 가 표본을 `base=main` PR head 로 고정하면서 PR 다중성 축을 구조적으로 배제한다** — 실측된 2건 (`4f7366e` / `995b8b5`) 은 둘 다 `base=develop` PR head 라 영원히 표본에 들어오지 않는다 (§2-12 실측 5). 즉 **S2 를 아무리 잘 만족시켜도 이 축은 관측되지 않으므로**, 사후 게이트가 아니라 별도의 사전 확인이 필요하다. 이것이 🔴-2 가 *"표본을 고치는 동작이 새 사각을 만들었다"* 로 진단한 지점이다.

**S4 — 대상 SHA 가 단일 PR 의 head 인가 (PR 다중성 축 부재 확인)**:

```bash
# 1 이어야 한다. 2 이상이면 A1 진행 금지 (§10-6 시나리오 D — rerun 으로 회복 불가).
gh api "repos/$REPO/actions/runs?head_sha=$SHA&per_page=100" \
  --jq '[.workflow_runs[] | select(.event=="pull_request") | .head_branch] | unique | "distinct_head_branch=\(length)  \(join(", "))"'
```

> **왜 `GET /commits/{sha}/pulls` 가 아닌가** (실측 확인, 2026-08-07T13:3xZ): 그 엔드포인트는 *"이 커밋을 **포함하는** PR"* 을 반환하므로 head 가 아닌 연관 PR 이 섞인다. `4f7366e` 에 대해 `PR#969 head=feature/962-branch-name-guard head_sha=15e3724` **한 건**만 나오는데 — 반환된 PR 의 head SHA 가 조회 SHA 와 **다르다**. `c2732ae` 에서는 아예 `PR#973 (base=develop, head_sha=44101b8)` 이 나온다. 둘 다 **오답**이므로 위 `actions/runs?head_sha=` 방식을 정본으로 쓴다 (`head_sha` 는 **full SHA 필수** — 축약형은 조용히 `total_count: 0` 을 반환한다, §10-1 한계 10).
>
> **`distinct_head_branch = 0` 의 의미**: 그 SHA 를 head 로 하는 `pull_request` run 이 없다는 뜻으로, **PR head 가 아니다** (예: `ab05620` = develop push 단독 머지 커밋 → `0`). 이 경우도 A1 대상으로 부적격이며, 애초에 §8 서두 박스의 *"판정 단위는 PR head SHA"* 정의에 어긋난다.

**S4 실행 결과 박제 — 직접 실행 (2026-08-07T13:29Z, `gh` 2.88.1 / `jq` 1.7.1-apple)**

위 명령 원문을 그대로 실행한 결과다. **발화 SHA 와 통과 SHA 를 양쪽 박제**해 침묵하는 장식이 아님을 보인다.

```text
4f7366e  distinct_head_branch=3  feat/962-guard-negative, feature/962-branch-name-guard, release/9.99.9-prep   ← 차단
995b8b5  distinct_head_branch=2  feat/962-guard-negative, release/9.99.9-prep                                  ← 차단
c2732ae  distinct_head_branch=1  develop                                                                       ← 통과 (현행 P1-G 표본)
163ad01  distinct_head_branch=1  docs/971-adr-corrections                                                      ← 통과
0e193d2  distinct_head_branch=1  chore/971-phase0-concurrency                                                  ← 통과
ee64871  distinct_head_branch=1  release/0.60.0-prep                                                           ← 통과
ab05620  distinct_head_branch=0  (없음)                                                                        ← 부적격 (PR head 아님 — develop push 단독)
```

**차단 SHA 에서 실제로 무엇이 갈리는가** — `4f7366e` 에 required 3개 한정 `G2` 를 돌리면 침묵하지 않는다 (같은 세션 2026-08-07T13:31Z 실행, 전문은 §2-12 실측 5):

```text
[전제 확인] total_count=46  completed=9  names=branch-name,label-pr,project-guards  max_n=3   ← S1·S2·S3 전건 충족
[게이트 본체] branch-name
              project-guards
              exit=0
```

즉 **S1·S2·S3 를 전건 충족하고도 `G2` 가 두 이름을 뱉는 SHA 가 실재**하며, 그중 `branch-name` 은 세 결론이 **전부 정당**해 rerun 으로 수렴하지 않는다. `c2732ae` 는 같은 명령에서 **빈 출력 / exit=0** 이다.

**S2 를 만족하는 SHA 는 `base=main` PR (release / hotfix) 의 head 다.** `project-guards` 가 `push` × `pull_request` 양 트리거를 가져 release SHA 에서 **항상 `n=2`** 를 내기 때문이다 (§2-11). 일상 PR (`base=develop`) head 는 push run 이 없어 `n=1` 이다. **이 게이트를 돌리기 위해 릴리스를 기다릴 필요는 없다** — **이미 머지된 과거 release PR head** 로 충분하므로 게이트 자체의 *"릴리스 비의존"* 속성은 유지된다. (**Phase 1 착수** 는 별도로 §10-2 조건 5·6 을 기다린다 — 위 박스.)

```bash
export REPO=coseo12/astro-simulator
# base=main 머지 PR (release/hotfix) 의 head 후보 — S2 를 구조적으로 만족한다.
# ⚠️ 최신 1건이 S1 (required 3개 전부 보고) 을 만족한다는 보장은 없다 (새 가드가 도입된 직후 등).
#    후보를 여러 개 뽑아 아래 [전제 확인] 을 각각 돌려 S1·S2·S3 를 전건 충족하는 것을 고른다.
gh pr list --state merged --base main --limit 6 --json number,headRefOid,mergedAt \
  -q '.[] | "\(.number)\t\(.headRefOid)\t\(.mergedAt)"'
SHA=<위에서 고른 full SHA>
echo "대상 SHA: $SHA   (측정 시각: $(date -u '+%Y-%m-%dT%H:%M:%SZ'))"
```

**[전제 확인 — 반드시 먼저]** `G2` 의 빈 출력은 *"불일치 없음"* / *"측정 대상이 없음"* / *"측정 대상은 있으나 판정식이 발화 불가"* 셋을 **구분하지 못한다**. 아래가 S1·S2·S3 를 한 줄로 판정한다 (cross-validate Q4 이견 수용 §11 + PR #979 리뷰 🔴-1·🟡-4):

```bash
gh api "repos/$REPO/commits/$SHA/check-runs?per_page=100" \
  -q '{tc: .total_count, g: [.check_runs[] | select(.name | IN("project-guards","branch-name","label-pr"))]}
      | "total_count=\(.tc)  completed=\([.g[]|select(.status=="completed")]|length)"
      + "  names=\([.g[]|.name]|unique|join(","))"
      + "  n=\(.g|group_by(.name)|[.[]|"\(.[0].name):\(length)"]|join(" "))"
      + "  max_n=\((.g|group_by(.name)|[.[]|length]|max) // 0)"'
```

**기대 출력**: `total_count ≤ 100` **그리고** `names=` 에 3개 이름이 전부 **그리고** `completed ≥ 3` **그리고** `max_n ≥ 2`. 하나라도 어긋나면 **다른 SHA 를 고른다** (게이트 실행 금지 — 실행해 봐야 빈 출력이 나오고 그것은 통과가 아니다).

> **실측 근거 4종** (앞 3종은 이 전제 확인이 없으면 "통과" 로 읽히는 경로, 4번째는 **전제 확인을 전건 통과하고도 남는** 경로다):
>
> | 경로 | 관측 | 어느 조건이 닫는가 |
> |---|---|---|
> | 초기 커밋 `11c7b4f` — 유효 SHA / 체크런 2개 / required 3개 **0개** | `completed=0 names=` → `G2` 빈 출력 | **S1** (2026-08-07T11:5xZ 확인) |
> | 일상 PR head `0e193d2`·`163ad01` — required 3개 전부 존재하나 **전부 `n=1`** | `completed=3 names=`3개 → S1 통과 → `G2` 빈 출력 **(결론 무관)** | **S2** (2026-08-07T12:42Z 확인) |
> | `per_page=100` cap 초과 응답 | 잘린 표본으로 전수 판정 | **S3** (현재 실측 최대 `total_count=46` — `4f7366e`. 여유 충분하나 상한 보장은 아님) |
> | **`4f7366e` — S1·S2·S3 전건 충족인데 `G2` 가 `branch-name`·`project-guards` 를 뱉는다.** 그중 `branch-name` 은 세 결론이 **전부 정당**해 rerun 으로 수렴하지 않는다 | `max_n=3` → 전제 전건 통과 → **게이트 본체가 2건 출력** | **S4** — 단 **표본이 아니라 적용 대상**에 대해 (2026-08-07T13:29~13:31Z 확인). S2 는 이 SHA 를 `base=develop` 이라는 이유로 **표본에서 배제**하므로 사후 게이트로는 닿지 않는다 |

**게이트 본체 — Phase 1 required 3개로 한정한 `G2`**:

```bash
gh api "repos/$REPO/commits/$SHA/check-runs?per_page=100" \
  -q '[.check_runs[]
       | select(.status=="completed")
       | select(.name | IN("project-guards","branch-name","label-pr"))
       | {name, pass: (.conclusion | IN("success","skipped","neutral"))}]
      | group_by(.name)[] | select((map(.pass) | unique | length) > 1) | .[0].name'
echo "exit=$?"
```

**판정 기준**:

| 조건 | 판정 | 조치 |
|---|---|---|
| 전제 확인 **S1·S2·S3 전건 충족** 그리고 `exit=0` 그리고 빈 출력 **그리고 적용 대상 SHA 가 S4 충족** | **통과** | A1 진행 |
| 이름이 1개 이상 출력 | **차단** | 해당 컨텍스트를 required 집합에서 제외하거나 원인 해소 후 재실행. **A1 진행 금지** |
| `exit≠0` (API 오류 / 4xx / 5xx / rate limit) | **판정 불가 — 차단** | 빈 출력을 통과로 읽지 말 것. 재실행 |
| S1 실패 (required 이름 누락) | **판정 불가 — 차단** | SHA 재선정 |
| **S2 실패 (`max_n = 1`)** — S1 은 통과했으나 동명 쌍이 없음 | **판정 불가 — 차단** (신설 2026-08-07, 🔴-1) | 빈 출력은 *"불일치 없음"* 이 아니라 **판정식이 발화할 수 없는 표본**이라는 뜻이다. `base=main` PR head 로 SHA 재선정 |
| **S3 실패 (`total_count > 100`)** — 응답이 cap 에 닿음 | **판정 불가 — 차단** (신설 2026-08-07, 🟡-4) | 표본이 잘렸으므로 전수 판정 불가. `--paginate` 로 전량 수집 후 재판정 |
| **S4 실패 (`distinct_head_branch ≠ 1`)** — **적용 대상** 릴리스 SHA 가 복수 PR 의 head (또는 PR head 아님) | **차단** (신설 2026-08-07, 🔴-2) | **SHA 재선정이 아니라 A1 연기다** — 표본이 아니라 실제 판정 대상이 오염된 상태다. develop 에 커밋 1개를 추가해 head SHA 를 교체하고 release PR 을 재생성하거나, 그 릴리스 동안 Phase 1 을 켜지 않는다 (§10-6 시나리오 D) |

> **`exit=$?` 를 함께 보는 이유**: `gh api` 가 HTTP 오류로 실패하면 stdout 은 비고 에러는 stderr 로 간다. **파이프 끝만 보면 성공과 구분되지 않는다.** 존재하지 않는 SHA 는 `422` 로 시끄럽게 실패하지만 (실측), rate limit·5xx 는 조용할 수 있다. 이 게이트가 막으려는 것 자체가 "조용한 오통과" 이므로 게이트가 조용히 오통과하면 자기모순이다 — [guard-design-principles](../lessons/guard-design-principles.md) §fail-fast.

**보조 확인 — 동명 누적 자체의 가시화** (게이트는 아니나 원인 파악용. `n>1` 이어도 결론이 전부 통과면 정상):

```bash
gh api "repos/$REPO/commits/$SHA/check-runs?per_page=100" \
  -q '[.check_runs[] | {name, conclusion}] | group_by(.name)[]
      | "\(.[0].name)\tn=\(length)\t\(map(.conclusion) | sort | join(","))"'
```

> **게이트 발화 확인 (negative baseline)** — 이 게이트가 침묵하는 가드가 아님을 확인한 값. 위 본체 명령의 `IN(...)` 목록에 `"pr-template-checklist"` 를 임시로 넣고 `SHA=ee6487178ec590663cd25368750efa5b29b472b7` (PR #964 head) 로 실행하면 `pr-template-checklist` 1건이 출력된다 (2026-08-07T11:50Z 실행 확인). **결정 9 로 이 컨텍스트를 required 에서 뺐기 때문에** 정규 게이트에서는 나오지 않는다 — 즉 이 negative baseline 은 *"게이트가 작동한다"* 와 *"제외 결정이 바로 이걸 피한 것이다"* 를 동시에 보인다.
>
> ⚠️ **이 negative baseline 표본은 §10-4 단계 2-bis 실행으로 변형된다** — 그 probe 는 `ee64871` 에 새 `branch-name` 체크런을 추가한다 (🟡-3). 두 절차를 같은 세션에서 수행할 경우 **P1-G 의 negative baseline 을 먼저** 재현해 둔다.

#### 실행 결과 박제 — 개정된 절차의 1회 실행 (2026-08-07T12:42~12:43Z, `gh` 2.88.1 / `jq` 1.7.1-apple)

> 개정된 선정 조건 (S1·S2·S3) 대로 대상을 고르고 **위 명령 원문을 그대로 직접 실행**한 결과다. PR [#979](https://github.com/coseo12/astro-simulator/pull/979) 리뷰 🔴-1 이 요구한 재실행이며, reviewer 의 보완 측정 (release PR head 3건, 2026-08-07T12:33Z) 과 독립적으로 재현됐다.

**[1] 전제 확인 — `base=main` 머지 PR 6건 전수**

```text
c2732ae  total_count=27  completed=4  names=branch-name,label-pr,project-guards  n=branch-name:1 label-pr:1 project-guards:2  max_n=2   ← S1·S2·S3 전건 충족
370d1c6  total_count=27  completed=3  names=label-pr,project-guards              n=label-pr:1 project-guards:2                max_n=2   ← S1 미충족 (branch-name 부재)
5479837  total_count=27  completed=3  names=label-pr,project-guards              n=label-pr:1 project-guards:2                max_n=2   ← S1 미충족
9530cdd  total_count=27  completed=3  names=label-pr,project-guards              n=label-pr:1 project-guards:2                max_n=2   ← S1 미충족
6840afe  total_count=27  completed=3  names=label-pr,project-guards              n=label-pr:1 project-guards:2                max_n=2   ← S1 미충족
9dda762  total_count=27  completed=3  names=label-pr,project-guards              n=label-pr:1 project-guards:2                max_n=2   ← S1 미충족
```

> `branch-name` 이 `c2732ae` 에만 있는 것은 이상이 아니다 — `branch-name-guard.yml` 이 [#962](https://github.com/coseo12/astro-simulator/issues/962) 로 2026-08-06 에 도입돼 그 이전 release SHA 에는 **원천적으로 부재**한다 (§10-1 한계 4 의 *"소급 근거는 `n=1` (#974)"* 과 같은 사실). 즉 **현 시점 S1·S2·S3 를 전건 충족하는 SHA 는 `c2732ae` 하나**이며, 다음 release PR 이 머지되면 표본이 는다.

**[2] 게이트 본체 — `SHA=c2732aee60017e9934345dd3156b5c70f412c6c4`**

```text
(빈 출력)
exit=0
```

**판정: 통과** (S1·S2·S3 전건 충족 + `exit=0` + 빈 출력 → 판정표 1행). **커버리지 박제** (🟡-8 — S2 는 *"최소 1개"* 조건이므로 의무):

```text
c2732ae 커버리지: project-guards 동명 축 ✓(n=2) / branch-name ✗(n=1, 노출 부재) / label-pr ✗(n=1, 노출 부재)
c2732ae S4      : distinct_head_branch=1 (develop) → PR 다중성 축 부재 ✓   (2026-08-07T13:29Z)
```

참고로 같은 6건의 required 3개 결론 전수는 아래와 같아, 동명 쌍 (`project-guards n=2`) 에서 **불일치 0** 이다:

```text
c2732ae  branch-name=n1[success]  label-pr=n1[success]  project-guards=n2[success,success]
370d1c6                           label-pr=n1[success]  project-guards=n2[success,success]
5479837                           label-pr=n1[success]  project-guards=n2[success,success]
9530cdd                           label-pr=n1[success]  project-guards=n2[success,success]
6840afe                           label-pr=n1[success]  project-guards=n2[success,success]
9dda762                           label-pr=n1[success]  project-guards=n2[success,success]
```

**[3] S2 조건의 negative control — 초판이 지정하던 대상이 이제 차단되는가**

신설 조건이 침묵하는 장식이 아님을 확인한 값이다. 초판 §8-P1-G 가 지정하던 유형 (일상 PR head, `base=develop`) 에 개정 전제 확인을 그대로 돌린 결과:

```text
163ad01 (본 PR head, base=develop)
  total_count=12  completed=3  names=branch-name,label-pr,project-guards
  n=branch-name:1 label-pr:1 project-guards:1   max_n=1     ← S2 실패 → 판정표 5행 "판정 불가 — 차단"
```

**S1 은 통과하는데 S2 에서 막힌다** — 이것이 🔴-1 이 지적한 정확한 구멍이며, 초판 조건으로는 여기서 게이트 본체가 실행되어 빈 출력 → *"통과"* 로 읽혔다. 측정 2026-08-07T12:54Z.

**[4] S4 조건의 negative control — S1·S2·S3 를 전건 충족하고도 남는 경로 (신설 2026-08-07, 🔴-2)**

`4f7366e` 는 S1·S2·S3 를 **전건 충족**하는데 게이트 본체가 2건을 뱉는다. 즉 S4 가 없으면 *"전제 확인 전건 통과"* 라는 신호가 안전 신호로 오독된다. 명령 원문·출력 전문은 §8-P1-G **S4 실행 결과 박제** 및 §2-12 실측 5 (측정 2026-08-07T13:29~13:31Z).

```text
4f7366e  전제 확인   total_count=46  completed=9  names=3개  max_n=3        ← S1·S2·S3 전건 충족
4f7366e  게이트 본체 branch-name / project-guards  exit=0                    ← 2건 출력
4f7366e  S4          distinct_head_branch=3                                  ← 차단 (PR 다중성 축)
c2732ae  S4          distinct_head_branch=1 (develop)                        ← 통과 (대조군)
```

`branch-name` 의 세 결론 (`failure` / `success` / `success`) 은 **전부 정당**하다 — 브랜치명이 각각 `feat/962-guard-negative` (규약 밖) / `feature/962-branch-name-guard` / `release/9.99.9-prep` 이기 때문이다. **rerun 으로 수렴하지 않고 Phase 0 로도 제거되지 않는** 유일한 클래스이며 (§2-12 원인 ③), 그래서 조치가 사후 게이트가 아니라 **A1 직전 사전 확인**이다.

> **이 게이트가 실제로 무엇을 보증하는가 (과장 금지)**: 대상 SHA 위에서 **동명 쌍을 가진 이름의 결론이 갈리지 않았다**는 것. `n=1` 인 이름 (`branch-name` / `label-pr`) 은 그 SHA 에 **동명 쌍 자체가 없어** 불일치가 원리적으로 불가능하며 — 이는 *"검출 실패"* 가 아니라 *"노출 부재"* 다 — 그들의 미래 노출 여부는 §2-12 실측 3 의 `types:` 전수가 담당한다. flake 는 확률적이라 1회 관측이 부재를 증명하지 못하고 (§10-1 한계 3 ①), 이 게이트는 *"이 SHA 의 현재 상태가 깨끗하다"* 만 말한다.
>
> **S2 는 *"최소 1개"* 조건이다 — 판정 결과에 이름별 커버리지를 함께 박제한다** (신설 2026-08-07, PR [#979](https://github.com/coseo12/astro-simulator/pull/979) 리뷰 🟡-8). S2 (`max_n ≥ 2`) 는 required 3개 중 **하나라도** 동명 쌍을 가지면 충족되므로, **S2 충족 = 3개 전부 검증** 이 아니다. reviewer 합성 픽스처가 이를 결정적으로 보였다 — `project-guards n=2 {success, success}` + `branch-name n=1 failure` + `label-pr n=1 cancelled` 는 **S1·S2·S3 를 전건 충족하고도 빈 출력 = 통과**다 (`n=1` 이라 판정식이 그 둘에 대해 발화 불가). 따라서 판정 시 아래 1줄을 함께 남긴다:
>
> ```text
> c2732ae 커버리지: project-guards 동명 축 ✓(n=2) / branch-name ✗(n=1, 노출 부재) / label-pr ✗(n=1, 노출 부재)
> ```
>
> 현행 유일한 적격 SHA `c2732ae` 에서 S2 를 실제로 만족시키는 이름은 **`project-guards` 하나**다. 즉 이 게이트가 말하는 것은 정확히 *"한 릴리스 SHA 에서 `project-guards` 의 push run 과 PR run 이 같은 결론을 냈다"* — **required 3개 중 1개, 1회**다. 노출 부재는 검출 실패가 아니므로 차단 사유는 아니나, 미래 회수자가 이를 *"3개 전부 검증됐다"* 로 오독하지 않도록 커버리지 표기를 의무화한다. 표본 확대는 §10-2 전이 조건 5 (다음 release PR 1건) 가 담당한다.

> **§10-2 조건 3 (*"일상 PR 은 검증력 0"*) 과 모순 아님 — 구분선** (🟡-5, 2026-08-07 신설). 두 절은 **관측 대상이 다르다**.
>
> | | §10-2 조건 3 | §8-P1-G |
> |---|---|---|
> | 무엇을 읽는가 | **GitHub 의 판정** (`mergeStateStatus` / 머지 가능 여부) | **check-run 의 결론 집합** (`conclusion` 배열) |
> | 일상 PR 에서 | **검증력 0** — `base=develop` 이라 main 의 required check 를 애초에 통과하지 않는다 (결정 2). *"일상 PR 이 통과했으니 안전"* 은 거짓 확신 | **검증력 0에 가깝다** — 다른 이유로. required 3개가 전부 `n=1` 이라 판정식이 발화 불가 (S2) |
> | 결론 | 일상 PR 은 **조건에서 제외** | 일상 PR head 는 **대상 SHA 에서 제외** (S2 가 기계적으로 배제) |
>
> 즉 초판의 *"릴리스 PR 일 필요 없다 (일상 PR 도 세 컨텍스트를 전부 낸다)"* 는 **철회됐다** — 세 컨텍스트를 내는 것은 맞으나 **각 1개씩**이라 동명 쌍을 만들지 않는다. 두 절은 이제 같은 방향을 가리킨다: **release/hotfix PR head 만이 판정 가치를 갖는다.**

### A1 — Phase 1 적용 (main: 초 단위 체크 3개)

현재 보호값을 그대로 보존하고 `required_status_checks` 만 추가하는 **전체 PUT** 이다 (부분 PATCH 는 기존 필드를 잃을 수 있다). `app_id: 15368` 은 GitHub Actions — 다른 앱이 동명 체크로 요구를 만족시키는 경로를 막는다.

> **실행 전 준비**: §9-R1 명령 한 줄을 손 닿는 곳 (다른 터미널 탭) 에 띄워 둔다. Phase 1 의 첫 실전은 구조상 어차피 release PR 이므로 (§10-2 조건 3), 오차단이 나는 순간은 **릴리스가 진행 중인 상태**다.

```bash
gh api -X PUT "repos/$REPO/branches/main/protection" --input - <<'JSON'
{
  "required_status_checks": {
    "strict": false,
    "checks": [
      { "context": "project-guards",        "app_id": 15368 },
      { "context": "branch-name",           "app_id": 15368 },
      { "context": "label-pr",              "app_id": 15368 }
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false,
    "require_last_push_approval": false,
    "required_approving_review_count": 0
  },
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": false,
  "lock_branch": false,
  "allow_fork_syncing": false
}
JSON
```

적용 직후 확인:

```bash
gh api "repos/$REPO/branches/main/protection" \
  -q '{strict: .required_status_checks.strict, contexts: .required_status_checks.contexts, admins: .enforce_admins.enabled, force: .allow_force_pushes.enabled}'
```

### A2 — `develop` 최소 보호 (결정 2)

```bash
gh api -X PUT "repos/$REPO/branches/develop/protection" --input - <<'JSON'
{
  "required_status_checks": null,
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": false,
  "lock_branch": false,
  "allow_fork_syncing": false
}
JSON
```

### A3 — Phase 2 확대 (Phase 0 + Phase 1 관찰 통과 후)

```bash
gh api -X PATCH "repos/$REPO/branches/main/protection/required_status_checks" --input - <<'JSON'
{
  "strict": false,
  "checks": [
    { "context": "project-guards",        "app_id": 15368 },
    { "context": "branch-name",           "app_id": 15368 },
    { "context": "label-pr",              "app_id": 15368 },
    { "context": "diff-scope",            "app_id": 15368 },
    { "context": "diff-scope-wasm",       "app_id": 15368 },
    { "context": "detect-and-test",       "app_id": 15368 }
  ]
}
JSON
```

> `pr-template-checklist` 가 이 배열에 없는 것은 누락이 아니라 **결정 9 의 명시적 제외**다. 추가하지 말 것.

> `diff-scope-wasm` 은 Phase 0 6-2 가 머지·1회 실행된 뒤에만 존재한다. **존재 확인 전 추가 금지** — 없는 컨텍스트를 요구하면 영구 pending 이다.
> ```bash
> gh api "repos/$REPO/commits/develop/check-runs?per_page=100" -q '[.check_runs[].name] | index("diff-scope-wasm")'
> ```
> 출력이 `null` 이 아니어야 한다.

### A4 — Phase 3 확대 (선택)

A3 의 `checks` 배열에 `verify-and-rust` / `long-integration-rust` / `duplicate-function-guard` (전부 `app_id: 15368`) 를 추가해 동일 PATCH.

---

## §9 롤백 절차

각 명령은 **단독으로 완결**되며 사전 상태 조회가 필요 없다. 실행 시간은 **약 2~3초 (추정)** — R1~R4 는 **아직 실 발동 이력이 0** 이라 실측치가 아니다 (PR [#986](https://github.com/coseo12/astro-simulator/pull/986) 리뷰).

### R1 — required check 만 제거 (Phase 1/2/3 공통, **1차 대응**)

```bash
gh api -X DELETE "repos/$REPO/branches/main/protection/required_status_checks"
```

보호의 나머지 (PR 필수 / force-push 차단 / enforce_admins) 는 그대로 유지된다. **릴리스가 막혔을 때 최우선으로 이것만 실행**하고, 원인 분석은 릴리스 완료 후에 한다.

검증: `gh api "repos/$REPO/branches/main/protection" -q '.required_status_checks | tojson'` → `null`.

> ⚠️ **R1 실행 = Phase 1 이 조용히 롤백된 상태다.** 원인 해소 후 **§8-A1 로 재적용**해야 한다. R3 는 보호가 전량 사라져 404 로 즉시 드러나지만, **R1 은 나머지 보호가 남아 무증상**이다 — 잊으면 required check 없는 채로 운영이 계속된다. (**5번째 errata**, PR [#993](https://github.com/coseo12/astro-simulator/pull/993) 리뷰 🟡-1: 이 의무가 런북 [`branch-strategy-workflow.md`](../guides/branch-strategy-workflow.md) 에만 있고 **정본인 여기엔 없었다** — errata ④ 가 박제한 *"파생본을 고치고 정본을 안 고치면 다음 회수자가 정본에서 같은 함정을 밟는다"* 의 **두 번째 실례**다.)

> ⚠️ **`| tojson` 필수** — 없으면 미적용 시 **빈 줄**이 출력돼 *"명령이 조용히 실패한 것"* 과 구분되지 않는다 (실측 2026-08-07). 릴리스가 막힌 상태에서 이 모호함은 치명적이다. (**`gh --jq` 특유** — 순수 `jq -r` 로는 `null` 이 나와 재현되지 않으므로, 미래 회수자가 *"재현 안 되니 불필요"* 로 되돌리지 않도록 명시한다.) PR [#986](https://github.com/coseo12/astro-simulator/pull/986) 🔴-2 가 런북에서 먼저 잡은 결함이 **ADR 본문에 잔존**해 있던 것이며, §8-A1 *"실행 전 준비"* 가 운영자를 여기로 직접 보내므로 **다음 A1 전 필수 정정**이었다.

### R2 — `develop` 보호 전체 제거 (A2 롤백)

```bash
gh api -X DELETE "repos/$REPO/branches/develop/protection"
```

검증: `gh api "repos/$REPO/branches/develop/protection"` → `404 Branch not protected`.

### R3 — `main` 보호 전체 제거 (**최후 수단**)

R1 로도 머지가 불가할 때만. 실행 후 **반드시 §8-A1 로 재적용**해야 한다 (보호 공백 상태를 방치하면 안 됨).

```bash
gh api -X DELETE "repos/$REPO/branches/main/protection"
```

### R4 — Phase 2/3 → Phase 1 부분 축소

§8-A1 의 `checks` 배열 3개짜리 (`project-guards` / `branch-name` / `label-pr`) 로 §8-A3 형식의 PATCH 재실행.

> **런북 배치**: R1/R2/R3 원문을 `docs/guides/branch-strategy-workflow.md` 의 릴리스 절차 옆에 링크로 노출하는 것이 Phase 1 산출물이다 (결정 5 조건).

---

## §10 결과 / 한계 / 재검토 조건

### 10-1 한계

1. **클래스 A 가드 5종은 required 화 불가** — 실행 시간 상위 4개 중 3개 (`verify` / `measure` / `a11y-baseline-guard`) 가 여기 속한다. 즉 본 정책이 커버하는 것은 "빠르고 항상 도는 가드" 이지 "무거운 시각·성능 회귀 가드" 가 아니다.
2. **`develop` 직접 push 는 기계적으로 막히지 않는다** — 산문 규약과 기계 강제 사이의 격차가 남는다 (결정 2). ff-sync 를 지키기 위한 의도적 선택이다.
3. **동명 체크런은 상존한다 — Phase 0 는 조건을 없애지 않고 완주 쌍을 늘린다** (초판 서술 정정). 초판은 *"Phase 0 이 그 조건을 소멸시켜 회피한다"* 고 썼으나 **실측이 반증했다** (§2-11). `push` + `pull_request` 양 트리거를 가진 required context — `project-guards` / `diff-scope` / `diff-scope-wasm` / `detect-and-test` (+ Phase 3 의 `verify-and-rust` / `long-integration-rust` / `duplicate-function-guard`) — 는 release PR SHA 에서 **항상 동명 2개**를 내고, `project-guards` 는 **Phase 0 이전인 지금 이미 그렇다** (`n=2 success,success`). 나아가 Phase 0 는 `cancelled` 를 완주로 바꾸므로 **완주 동명 쌍을 3 → 7 로 늘린다**.
   - **2026-08-07 2차 정정 — "동명이 원천적으로 없는 것은 클래스 B 3개뿐" 도 거짓이다.** 초판 정정문은 여기서 `branch-name` / `label-pr` / `pr-template-checklist` 를 "동명 없음" 으로 묶었으나, **`pr-template-checklist` 는 event *type* 축으로 동명이 누적된다** (§2-5 3행 / §2-12). 동명이 실제로 원천 부재인 것은 **`branch-name` (concurrency 보유 + `edited` 부재) 과 `label-pr` (`edited` 부재)** 2개다. 이 오류의 구조적 원인: 초판 투영표가 event 축 (`push` × `pull_request`) 만 축으로 잡아, **같은 event 가 한 SHA 위에서 반복되는 축을 볼 자리가 없었다.**
   - **그럼에도 안전한 이유 (calibration — 이 정정이 공포 조장이 아닌 근거)**: 동명 N개가 **전부 **통과 결론**(`success` / `skipped` / `neutral` — §2-2) 이면 어떤 해석 규칙에서도 통과한다** (latest 채택 / all-must-pass / first 채택 무관). 따라서 위험은 "동명이 여럿" 자체가 아니라 **결론 불일치** 하나로 국한된다. Phase 0 가 실제로 사는 것은 "동명 소멸" 이 아니라 **불일치 확률의 하락**이다 — 100% 재현되던 불일치 원인 (`cancelled`, release PR 6/6) 을 구조적으로 제거한다.
   - **실질 잔여 위험은 <b>3종</b>이다 — 초판의 "flake 하나" 는 거짓** (2026-08-07 정정, §2-12. **③ 은 2차 정정 — 🔴-2**).
     - **① flake 발 `failure` + `success` 혼재 (확률적).** Phase 0 는 flake 를 제거하지 못한다. 본 저장소는 flake 전례를 보유한다 (`verify:699 deltaTime` / r1-guard Playwright / fps 부하 spike — #779 §매핑표에 자체 박제). 무거운 required check 의 **push run 만** flake 로 `failure` 가 되면 GitHub 의 해소 규칙은 미규정이고 (§2-2) 릴리스가 `BLOCKED` 될 수 있다.
     - **② event *type* 축 누적 (결정론적).** `types` 에 SHA 를 바꾸지 않는 이벤트 (`edited`) 를 가진 워크플로가 한 SHA 위에 체크런을 누적하고, 첫 run 이 실패했다 통과하면 `failure` + `success` 가 **영구 공존**한다. **확률적이지 않고, Phase 1 required 후보 위에서 이미 발화했다** (`ee64871`). 본 ADR 은 이를 **결정 9 (required 제외) 로 봉인**하므로 required 집합에 대한 잔여 위험은 아니지만, **required 집합이 확대되면 다시 열린다** — 그래서 `G2` 를 Phase 1 진입 조건으로 상시 배치했다 (§8-P1-G).
     - **③ PR 다중성 × 브랜치명 의존 판정 (결정론적이고 양쪽 결론이 정당).** 한 SHA 가 N개 PR 의 head 이면 `branch-name` 의 N개 결론이 갈리는데 **셋 다 옳다** (`4f7366e` 실발화 — §2-12 실측 5). **flake 가 아니라 rerun 으로 수렴하지 않고, `cancelled` 가 아니라 Phase 0 로도 제거되지 않는다.** 관측 수단은 사후 `G2` 가 아니라 **사전 확인 §8-P1-G `S4`** 이며, 상세는 한계 12.
     - **초판이 ② 를 놓친 구조적 이유**: 소급 리허설 (§10-4 단계 1) 이 `cancelled` 축만 집계했고, ② 는 `cancelled` 를 하나도 만들지 않는다. **측정하지 않은 축을 "위험 없음" 으로 결론지은 것** — 근거와 결론의 축이 어긋난 전형이다.
     - **1차 정정이 ③ 을 놓친 구조적 이유** (같은 클래스의 3번째 재생산): 본 ADR 은 `4f7366e` 를 B2 클래스 근거로 5회 이상 인용하면서 **`cancelled` 열만 읽었고 required 컨텍스트의 결론 열은 한 번도 읽지 않았다**. 축 열거 (§2-5) 가 불완전하면 어떤 표본 규칙도 완전할 수 없다.
   - **관측 수단**: §8-P0 의 **G2 게이트**가 이 조건을 직접 검사한다 (G1 의 `cancelled` 검사로는 원리적으로 검출 불가). 발생 시 대응은 §9-R1 (2초) 로 required 를 걷어내고 릴리스를 완주시킨 뒤, 재실행으로 결론을 수렴시키는 순서다 — **릴리스를 인질로 잡고 디버깅하지 않는다** (§10-4).
   - **잔존 미검증**: GitHub 의 동명 **해소 규칙 자체**는 여전히 모른다 (§2-8 대로 사전 실증이 불가능하다). 본 정책은 규칙을 알아낸 것이 아니라 **불일치가 잘 일어나지 않게 만들고, 일어나면 잡히게** 한 것이다.
4. **`branch-name` 의 소급 근거는 `n=1`** (#974) — release PR 에서의 보고 안정성 표본이 1건이다.
5. **보호 상태 드리프트를 CI 가 감시하지 못한다** — 사람이 스크립트를 돌려야 한다 (§3-2). 반대 방향 (선언 ↔ job 이름 실재) 은 결정 8 이 CI 로 닫는다. 실행 절차는 §10-3 후속 2 에서 릴리스 런북 체크리스트로 편입한다 (cross-validate 보완 제안 ① 수용).
6. **가드가 없던 시절 열린 PR 을 reopen 하면 영구 pending 이 될 수 있다** — `branch-name` 은 `types: [opened, synchronize]` 라 reopen 으로 재실행되지 않는다 (#962 ADR §5-2 의 **의도된** 설계). 현재 열린 PR 이 0건이라 노출은 없으나, 장수 PR 이 생기면 해당된다. **완화**: 빈 커밋 1개 push (`git commit --allow-empty` → `synchronize` 발화) 또는 Actions UI 재실행. required check 를 켠 뒤에는 이 절차를 알고 있어야 한다.
   - **복구 경로는 체크마다 다르다 (비대칭)** — `types` 에 `edited` 를 가진 것은 `pr-template-checklist` (`[opened, edited, synchronize]`) **하나뿐**이라 **PR 본문 수정만으로 즉시 재실행**되어 초 단위로 복구된다. 반면 `branch-name` (`[opened, synchronize]`) 과 `label-pr` (`[opened, synchronize, ready_for_review]`) 은 본문 편집으로 재실행되지 않아 **빈 커밋 또는 Actions 재실행**이 필요하다. 릴리스 중 대응 속도가 갈리는 지점이므로 "어느 체크가 막혔는가" 를 먼저 확인해야 한다.
7. **GitHub Actions 장애 시 릴리스가 멈춘다** — 체크가 보고되지 않으면 required 는 pending 이다. 대응은 §9-R1 (2초) 후 릴리스 완주.
8. **fork PR 이 `main` 을 대상으로 하면 차단된다** — `label-pr` 은 `pull-requests: write` 가 필요한데 fork PR 의 `GITHUB_TOKEN` 은 read-only 라 실패한다. 단 **본 정책의 영향은 0** 이다: fork PR 은 `develop` 을 대상으로 하고 develop 에는 required check 가 없다 (결정 2). `main` 은 release/hotfix 전용이라 fork PR 이 도달할 경로가 정책상 존재하지 않으며, 도달한다면 차단이 옳은 동작이다.
9. **hotfix 경로는 실측 표본이 0건이다** — 정적으로는 통과한다 (`hotfix` 는 `branch-name` 허용 type, base=main 이라 클래스 B/C 전부 트리거). 그러나 소급 대조에 쓸 실제 hotfix PR 이 없다 → §10-4 단계 4 에서 확인.
10. **본 ADR 의 run 레벨 수치는 창 (window) 종속이며, 그 창은 측정 시각마다 이동한다** (신설 2026-08-07). `gh run list --limit N` 의 `N` 은 **날짜 범위가 아니라 개수 cap** 이라, 저장소 run 생성률 (실측 100~163 run/일) 에 따라 창 길이가 달라진다. 본 ADR 과 [20260701-779](20260701-779-ci-alert-fatigue-concurrency.md) §A2-3 의 분류 수치가 측정 주체마다 미세하게 다른 것은 오류가 아니라 **cap 경계 이동** 때문이다. 그래서 §2-6 스냅샷에 **측정 시각과 창 경계를 명시 박제**했다.
    - **위험 방향이 비대칭이다** — 창이 짧아지면 결과가 **빈 출력**이 되는데, 이는 *"위반 0"* 과 형태가 **구분 불가능**하다. 즉 오차가 **안전 방향이 아니라 오통과 방향**으로 난다. 실측: `--limit 200` 은 2026-08-07T11:53Z 시점에 **1.88일**만 덮어, 2026-08-05 머지된 release PR #965 (`370d1c6`) 조회가 **0건**을 반환한다 — 같은 SHA 를 창 무관 API 로 조회하면 **run 15 / cancelled 5** 다.
    - **완화**: SHA 를 아는 조회는 **창 무관 API** (`GET /actions/runs?head_sha=<full-sha>`) 를 쓴다. [20260701-779](20260701-779-ci-alert-fatigue-concurrency.md) §A2-6 조건 10 이 이 방식으로 개정됐다. `head_sha` 는 **full SHA 필수** — 축약형은 에러가 아니라 조용히 `total_count: 0` 을 반환해 같은 오독을 만든다.
    - **잔존**: 창 종속이 불가피한 조회 (SHA 를 모르는 전수 분류) 는 여전히 창 안에서만 유효하다. 그 결론 (예: C 클래스 0건) 을 인용할 때는 **창 경계를 함께 인용**해야 한다.
11. **`G2` 계열 게이트는 "대상 SHA 가 그 축을 표본에 포함할 때만" 검증력을 갖는다** (신설 2026-08-07, PR [#979](https://github.com/coseo12/astro-simulator/pull/979) 리뷰 🔴-1). 판정식 `group_by(.name)[] | select((map(.pass)|unique|length) > 1)` 은 한 이름 그룹에 항목이 **2개 이상**일 때만 발화하므로, `n=1` 인 SHA 에서는 **결론이 무엇이든 빈 출력**이다. 판정식이 원인을 구분하지 않는다는 성질 (§8-P0 `G2` 직교 박스) 은 **표본 선정까지 보장하지 않는다** — *"식은 고칠 필요가 없었으나 표본은 고쳐야 했다."*
    - **초판 §8-P1-G 가 정확히 이 함정에 빠졌다**: 대상을 *"최근 PR head 아무거나 (일상 PR 도 가능)"* 로 지정했는데 일상 PR head 는 required 3개가 전부 `n=1` 이라, required 3개가 **전부 `failure` 여도** 전제 확인 통과 + `exit=0` + 빈 출력 → 판정표상 *"통과"* 가 나온다 (reviewer 합성 픽스처 결정적 실증). 이는 위 한계 3 의 *"측정하지 않은 축을 위험 없음으로 결론"* 과 **같은 클래스의 재생산**이다.
    - **완화 (적용됨)**: §8-P1-G 대상 SHA 선정에 **S2 (`max_n ≥ 2`)** 를 추가하고 판정표에 **S2 실패 → 판정 불가** 행을 넣었다. 실측상 `base=main` PR head 가 이를 구조적으로 만족한다 (`project-guards n=2`).
    - **잔존**: `n=1` 인 이름 (`branch-name` / `label-pr`) 의 동명 축은 **게이트로 관측할 수 없다** — 그 SHA 에 노출 자체가 없기 때문이다. 이들은 §2-12 실측 3 의 `types:` 전수 (정적) 와 §10-5 재검토 조건 8·9 가 담당하며, **동적 게이트와 정적 확인의 역할 분담**이 필요하다는 것이 이 한계의 실질이다.
    - **그리고 S2 자신이 새 사각을 만든다 → 한계 12** (2026-08-07 2차, 🔴-2). 표본을 `base=main` 으로 고정한 것이 **실제로 발화한 유일한 축 (PR 다중성) 을 배제**했다.
12. **PR 다중성 축은 사후 게이트로 닿지 않는다 — 그리고 발화 시 rerun 으로 회복되지 않는다** (신설 2026-08-07, PR [#979](https://github.com/coseo12/astro-simulator/pull/979) 리뷰 🔴-2). 한 SHA 가 N개 PR 의 head 이면 `pull_request` 컨텍스트가 ×N 으로 쌓이고, 판정이 **브랜치 이름의 함수**인 `branch-name` 은 N개 결론이 **정당하게** 갈린다 (§2-12 원인 ③ / 실측 5: `4f7366e` = `{failure, success, success}`).
    - **base rate 는 0** — 20일 창에서 `base=main` PR head 가 복수 PR 의 head 였던 사례는 **0건**이다. 관측된 2건 (`4f7366e` / `995b8b5`) 은 전부 2026-08-06 의 **인위적 단일 사건** ([#962](https://github.com/coseo12/astro-simulator/issues/962) 가드 라이브 실증) 이고 둘 다 `base=develop` 이다. 이 저장소는 **한 커밋에 여러 브랜치를 다는 패턴을 실제로 쓰므로**, 그 패턴이 릴리스 SHA 와 만나면 발화한다.
    - **실현 시 복구가 비대칭이다** — 갈린 `failure` 체크런은 그 SHA 에 **영구 기록**된다. 재실행해도 그 PR 의 브랜치명이 그대로라 다시 실패한다. 복구는 §9-R1 롤백 (2초) 또는 develop 커밋 1개 추가 후 release PR 재생성 (릴리스 1주기) 뿐이다 (§10-6 시나리오 D — 5 시나리오 중 유일하게 rerun 회복 불가).
    - **왜 사후 게이트로 닿지 않는가**: 한계 11 의 완화책 **S2 의 표본 선정 관행(`base=main` PR head 고정)** 이 이 축을 배제한다 (형식 조건 `max_n ≥ 2` 자체는 `4f7366e` 도 충족한다 — PR #979 3차 리뷰 🟡-11). 또한 `4f7366e` 는 **"S1~S3 만으로 오통과한다" 는 증명이 아니다** — 그 SHA 를 표본으로 골랐다면 본체가 2건을 출력해 판정표 2행(차단)에 떨어진다. S4 의 유효 근거는 **"표본이 깨끗해도 적용 대상이 오염될 수 있다"** 하나이며 그것으로 충분하다 — 관측된 2건이 둘 다 `base=develop` 이라 **영원히 표본에 들어오지 않는다**. *"표본을 고치는 동작이 새 사각을 만들었다."*
    - **완화 (적용됨)**: §8-P1-G **S4** (`distinct_head_branch = 1`) 를 **적용 대상 SHA 에 대한 사전 확인**으로 신설. S1~S3 (표본 SHA 조건) 과 적용 대상·시점이 다르다.
    - **잔존**: **S4 자신의 cap 한계 (PR #979 3차 리뷰 🟡-10)**: `S4` 는 `actions/runs?per_page=100` 을 쓰므로 **S3 가 `check-runs` 에서 닫은 cap 오통과 클래스가 여기서 재개방**된다. 잘리면 `distinct_head_branch` 가 **과소 집계**되어 `1` 로 오통과하는 방향이라 위험 쪽이다. 따라서 S4 실행 시 `total_count ≤ 100` 을 함께 확인한다 (현재 여유 29/100 — `4f7366e` 가 46). S4 는 *"확인 시점"* 의 상태만 본다. A1 이후 릴리스 head SHA 를 다른 브랜치에 얹고 PR 을 열면 새 체크런이 붙는다. 기술 게이트만으로는 닫히지 않으므로 §10-5 재검토 조건 12 를 **작업 습관 쪽**에 병행해 건다.

13. **동명 축 열거는 닫히지 않았다 — 본 ADR 이 아는 축은 "현재까지 4개" 이지 "전부 4개" 가 아니다** (신설 2026-08-07, PR [#979](https://github.com/coseo12/astro-simulator/pull/979) 3차 리뷰 🟡-9).

    - **실적이 그렇게 말한다** — 초판(workflow 축 × event 축) → 2차(event *type* 축) → 3차(PR 다중성 축) → 3차 리뷰(**`push` 다중 ref 축**). **라운드마다 새 축이 나왔고, 매번 직전 라운드가 "이번엔 닫았다" 고 서술한 뒤였다.**
    - **제5축 실측** — `58ccfcf` (v0.61.0 release merge commit) 는 `pull_request` run 이 **0개**인데 `project-guards` 가 `{push/develop = success, push/main = cancelled}` 로 갈린다. 한 SHA 가 **N개 브랜치의 tip** 인 경우이며(ff-sync 가 `main` 의 merge commit 을 `develop` tip 으로 만든 산물), **PR 다중성 축의 정확한 쌍둥이**다.
    - **정책 영향 0 (현재까지)** — required 판정 단위는 **PR head SHA** 인데(§8 서두), 제5축은 `pull_request` run 이 0인 SHA 에서 발현하므로 **만나는 경로가 확인되지 않았다**. 다만 *"확인되지 않았다"* 는 *"없다"* 가 아니다 — 한계 11 이 진단한 **"측정하지 않은 축을 위험 없음으로 결론"** 이 정확히 이 자리에 다시 선다.
    - **운영 규약**: 다음 축이 발견되면 그것은 **뒤집힘이 아니라 예고된 관측**이다. 발견 시 §2-5 표에 행을 추가하고 required 판정 대상과의 접점만 판정한다 — ADR 전체 재작성은 불요.

### 10-2 Accepted 전이 조건

아래 **전건** 충족 시 상태를 `Accepted` 로 갱신한다.

1. 사용자가 §8 적용을 승인.
2. Phase 0 머지 + release PR 1건에서 §8-P0 의 **G1 (`cancelled` 0) 과 G2 (동명 결론 불일치 0) 동시** 실측. `G1` 이 붉으면 [20260701-779](20260701-779-ci-alert-fatigue-concurrency.md) §A2-6 조건 10 의 **선분류** 를 거쳐 A/B1/B2 잔존일 때만 실패로 판정한다 (C 잔존은 설계상 정상).
2-bis. **Phase 1 진입 게이트 `G2` (§8-P1-G) 통과** — 릴리스 무관, 수 초. 신설 2026-08-07. **대상 SHA 는 S1·S2·S3 를 전건 충족해야 한다** (2026-08-07 개정 — `max_n ≥ 2` 미충족 SHA 의 빈 출력은 통과가 아니다). **A1 실행 직전에 재실행**한다 — 아래 §8-P1-G 에 박제된 2026-08-07T12:43Z 실행은 그 시점의 표본 (`c2732ae`) 에 대한 기록이며, 승인 시점에 더 새로운 release PR head 가 있으면 그것으로 갱신한다.
3. Phase 1 적용 후 **release PR 1건** (+ 가능하면 hotfix PR 1건 — §10-1 한계 9) 에서 오차단 0 실증 (§10-4 판정 기준). ⚠️ **일상 PR 은 검증력이 0 이라 조건에서 제외한다** — 일상 개발 PR 은 `base=develop` 이고 develop 에는 required check 를 영구 미채택하므로 (결정 2) **main 의 required check 를 한 번도 통과하지 않는다**. *"일상 PR 이 통과했으니 안전"* 은 거짓 확신이다. `main` 을 대상으로 하는 PR 은 release PR 과 hotfix PR 뿐이며, 그래서 Phase 1 의 첫 실전은 어차피 release PR 이다.
4. §9 롤백 명령이 릴리스 런북에 링크됨. **⚠️ 조건 5 이전에 완료 권고** — 오차단이 나는 순간은 릴리스 진행 중이라 즉시 필요하다 (reviewer 2차 권고).
5. **다음 release PR 1건 관찰** (신설 2026-08-07, PR [#979](https://github.com/coseo12/astro-simulator/pull/979) 리뷰 🔴-2 / Phase 1 착수 판정). **required 를 켜지 않은 상태로** 통과시키며 `G1` + `G2` 가 동시에 빈 출력임을 확인한다.
6. **`P1-G` 를 Phase 0 이후 head SHA 로 재실행** (신설 2026-08-07). 조건 5 에 종속되며 표본이 `n=2` 가 된다.

> **조건 5·6 이 왜 필수인가 — Phase 0 효과가 릴리스 경로에서 0회 실측이다** (2026-08-07 신설. 🟡-7 정정의 직접 귀결).
>
> ```text
> Phase 0 머지        : ab05620  2026-08-07T11:48:05Z  (develop)
> 이후 base=main 머지 : 0건        ← 최근은 #974 c2732ae 2026-08-06T09:54:14Z (Phase 0 이전)
> 이후 main push      : 0건        ← main tip 58ccfcf 2026-08-06T09:54:13Z
> ```
>
> Phase 0 6-1 (concurrency 그룹 키에 `github.ref` 삽입) 이 노리는 A/B1 교차 취소는 **릴리스 경로에서만** 발생하는데, Phase 0 머지 이후 릴리스 경로가 한 번도 돌지 않았다. 따라서 **`P1-G` 의 유일한 표본 `c2732ae` 는 Phase 0 *이전* SHA** 이며, 게이트가 통과시킨 것은 *"Phase 0 가 적용되지 않은 세계의 릴리스 SHA"* 다. §8 서두 박스가 초판에서 인용하던 `ab05620` 은 이 공백을 메우지 못한다 (develop push 단독 SHA — push 쌍이 구조적으로 불가능).
>
> **비용 대비**: 기다림 = **릴리스 1주기 지연**. 조기 적용 = **릴리스 하드 블록** 위험이고, §10-6 시나리오 D 면 그 SHA 가 영구 오염돼 develop 커밋 추가 + release PR 재생성이 필요하다 (릴리스 1주기 — 같은 비용을 사고 상태에서 치른다). 그리고 **기다림이 사실상 공짜다** — 다음 release PR 1건이 ① `G1`+`G2` (**어차피 Phase 2 진입 조건인 조건 2**) ② `P1-G` 표본 `n=2` + Phase 0 적용 후 SHA (조건 6) ③ `branch-name` 의 릴리스 경로 **2번째** 관측 (§10-1 한계 4 의 `n=1` 해소) 을 **동시에** 해결한다. Phase 1 이 잃는 것은 *"릴리스 비의존"* 이라는 **속성 하나**뿐이다.
>
> **즉 조건 2-bis 는 유지하되 (표본 `c2732ae`), 그것만으로는 A1 을 켜지 않는다.** 조건 2-bis 는 *"게이트가 작동하고 판정 표본이 유효하다"* 를, 조건 5·6 은 *"Phase 0 이후 세계에서도 그렇다"* 를 각각 보증한다.

### 10-3 후속 이슈 (분리 필요 — 본 ADR 범위 밖)

1. **클래스 A 가드의 required 화 경로** — `paths-ignore` (workflow 단위) 를 `dorny/paths-filter` 등 job 단위 게이트로 전환하면 스킵이 `skipped` = 통과로 보고돼 required 화가 가능해진다. 다만 이는 5개 워크플로의 트리거 재설계라 별건.
2. **선언적 관리 구현 + 이름 정적 가드** — `.github/branch-protection/*.json` + `apply`/`verify` 스크립트 2종 (결정 7) + **결정 8 의 context↔job 이름 대조 가드** (`project-guards` 배선). 릴리스 런북 (`docs/guides/branch-strategy-workflow.md`) 에 `verify` 수동 실행 체크리스트 항목 추가 포함.
3. **봇 PR base 정책** — 봇 PR 을 develop 대상으로 되돌릴 필요가 생기면 `GITHUB_TOKEN` 워크플로 트리거를 먼저 실증 (결정 4).
4. **작업 토큰 권한 분리 검토** (cross-validate 고유 발견) — 일상 에이전트 토큰에서 `Administration` 권한을 제거하고 비상용 admin 토큰을 분리하면 보호의 실효 강제력이 오른다. 단 §9 롤백이 "토큰 교체" 를 거치게 되어 **탈출 경로가 2초에서 수 분으로 늘어난다** — 강제력 ↔ 복구 속도의 정면 교환이라 별도 결정이 필요하다. 본 ADR 은 현 토큰 상태를 전제로만 유효하다 (§10-5 재검토 조건 6).
5. **`pr-template-checklist` 의 required 복권 경로** (신설 2026-08-07, 결정 9-2 (ii)) — `types` 에서 `edited` 를 제거하면 event *type* 축 누적이 근절돼 required 화가 가능해진다. 그러나 (a) *"본문 고치면 즉시 재검사"* UX 를 잃고 (b) §10-1 한계 6 이 박제한 **유일한 초 단위 복구 경로** (본문 편집으로 재실행) 가 함께 사라진다. **required 강제력 ↔ 가드 사용성 + 복구 속도**의 3자 교환이라 별건. 착수 시 §10-1 한계 6 의 복구 비대칭 표를 함께 갱신해야 한다.

### 10-4 릴리스 리허설 계획 — "오차단 0" 판정 기준

> **설계 단계에서 실행하지 않는다.** 아래는 절차 정의다.

**단계 1 — 소급 리허설 (무위험, §2-6 에서 이미 수행 완료)**
최근 release PR 6건 × 후보 9개 전수 대조 (check-run 레벨). 결과: Phase 1 후보 (당시 4개) 는 cancel 0 / 부재 0 (`branch-name` 은 존재 1건 기준). 무거운 3개는 cancel 6/6 → Phase 0 필요성의 근거.

> **이 리허설은 `cancelled` 축만 덮는다 — 그러나 폐기 대상이 아니라 병존 근거다** (2026-08-07 2차 정정, PR [#979](https://github.com/coseo12/astro-simulator/pull/979) 리뷰 🔴-1). 좁은 것은 **원인 축**이고 **표본 폭은 6 SHA 로 가장 넓다**. 나머지 두 축의 담당은 이렇게 나뉜다 — **동명 쌍의 결론 불일치 (원인 무관)** 는 §8-P1-G 의 `G2` 1회 실행 (표본 1 SHA), **event *type* 축**은 §2-12 실측 3 의 required 3개 `types:` 전수 (SHA 불변 반복 이벤트 0). 셋을 합쳐야 Phase 1 면제 근거가 성립한다 (결정 1 §Phase 1 면제 근거).

**단계 2 — push 의미론 리허설 (일회용 브랜치. `main`/`develop` 무접촉)**
`develop` 최소 보호(§8-A2)가 ff-sync 를 막지 않음을 **실제 push 로** 확인한다. 대조군으로 required check 를 건 변형이 직접 push 를 거부하는 것까지 확인해 §4 (c) 기각 근거를 실증한다.

```bash
export REPO=coseo12/astro-simulator
git push origin origin/develop:refs/heads/chore/971-protection-probe     # 일회용 브랜치 생성

# (1) 최소 보호 적용 — §8-A2 와 동일 payload, 대상만 probe 브랜치
gh api -X PUT "repos/$REPO/branches/chore%2F971-protection-probe/protection" --input - <<'JSON'
{ "required_status_checks": null, "enforce_admins": true, "required_pull_request_reviews": null,
  "restrictions": null, "required_linear_history": false, "allow_force_pushes": false,
  "allow_deletions": false, "block_creations": false, "required_conversation_resolution": false,
  "lock_branch": false, "allow_fork_syncing": false }
JSON

# (2) ff push 시도 — 통과해야 정상 (main tip 은 develop tip 의 후손)
git push origin origin/main:refs/heads/chore/971-protection-probe        # 기대: 성공

# (3) force push 시도 — 거부돼야 정상
git push --force origin origin/develop:refs/heads/chore/971-protection-probe   # 기대: 거부

# (4) 대조군 — required check 를 걸면 직접 push 가 거부되는가 (§4 (c) 실증)
gh api -X PATCH "repos/$REPO/branches/chore%2F971-protection-probe/protection/required_status_checks" \
  --input - <<'JSON'
{ "strict": false, "checks": [ { "context": "branch-name", "app_id": 15368 } ] }
JSON
git push origin origin/develop:refs/heads/chore/971-protection-probe     # 기대: 거부 (branch-name 은 push 커밋에 미보고)

# (5) 정리 — 규칙 먼저, 브랜치 나중
gh api -X DELETE "repos/$REPO/branches/chore%2F971-protection-probe/protection"
git push origin --delete chore/971-protection-probe
```

> probe 브랜치명은 `chore/971-protection-probe` — `branch-name` 가드의 허용 집합 (`<type>/<이슈번호>-<설명>`) 을 만족시켜 리허설 자체가 규약을 위반하지 않게 한다.
> **required check 의 "동명 `cancelled` 쌍둥이" 거동은 이 리허설로 재현할 수 없다** (§2-8: 임의 conclusion 체크런 합성은 GitHub App 토큰 전용). 그래서 Phase 0 로 조건 자체를 없앤다. 단 **`{failure, success}` 불일치는 재현 가능하다** — 단계 2-bis.

**단계 2-bis — 동명 결론 불일치의 실제 판정 관측 (신설 2026-08-07, cross-validate Q1 이견 수용)**

> **설계만 박제한다. 실행은 사용자 승인 후.** 본 ADR 라운드에서는 수행하지 않았다.

§2-8 은 *"동명 해소 규칙은 사전 실증 불가"* 로 결론지었으나 그 논거는 **체크런 합성 불가**에 기댄다. **합성이 필요 없다** — `ee64871` 이 `pr-template-checklist` = `{failure, failure, success}` 를 자연 보유한다 (§2-12 실측 1).

```bash
export REPO=coseo12/astro-simulator
MIXED=ee6487178ec590663cd25368750efa5b29b472b7      # 불일치를 자연 보유한 SHA

# (1) probe 브랜치 2개 — base(보호 대상) 와 head
git push origin ${MIXED}:refs/heads/chore/971-mixed-head
git push origin origin/develop:refs/heads/chore/971-mixed-base

# (2) base 에만 pr-template-checklist 를 required 로 건다 (main/develop 무접촉)
gh api -X PUT "repos/$REPO/branches/chore%2F971-mixed-base/protection" --input - <<'JSON'
{ "required_status_checks": { "strict": false,
    "checks": [ { "context": "pr-template-checklist", "app_id": 15368 } ] },
  "enforce_admins": true, "required_pull_request_reviews": null,
  "restrictions": null, "required_linear_history": false, "allow_force_pushes": false,
  "allow_deletions": false, "block_creations": false, "required_conversation_resolution": false,
  "lock_branch": false, "allow_fork_syncing": false }
JSON

# (3) PR 을 열고 GitHub 의 판정을 읽는다
#     ⚠️ gh pr create 에는 --json 플래그가 없다 (gh 2.88.1 확인: `gh pr create --help | grep -c '\-\-json'` → 0).
#        URL 을 반환받아 gh pr view 로 번호를 얻는다.
URL=$(gh pr create --base chore/971-mixed-base --head chore/971-mixed-head \
      --title "[#971] probe — 동명 결론 불일치 판정 관측" --body "probe. 머지하지 않음.")
PR=$(gh pr view "$URL" --json number -q .number)
gh pr view $PR --json mergeable,mergeStateStatus,statusCheckRollup \
  -q '{mergeable, state: .mergeStateStatus, rollup: [.statusCheckRollup[]|select(.name=="pr-template-checklist")|{name, conclusion}]}'

# (4) 정리 — PR 닫고, 규칙 먼저, 브랜치 나중
gh pr close $PR
gh api -X DELETE "repos/$REPO/branches/chore%2F971-mixed-base/protection"
git push origin --delete chore/971-mixed-head chore/971-mixed-base
```

**해석표**:

| `mergeStateStatus` | 시사 | 본 ADR 에의 영향 |
|---|---|---|
| `BLOCKED` | 불일치가 **차단을 만든다** (all-must-pass 또는 first 채택 계열) | 결정 9-1 (제외) 이 **필수**임이 실증됨. §5 (a) 기각도 강화 |
| `CLEAN` / `UNSTABLE` | **최신 `success` 가 채택**된다 (latest 계열) | 결정 9-1 은 **과잉 회피**일 수 있다 → §10-5 재검토 조건 10 발동, 결정 9-1 재검토 |

**⚠️ 결과가 `CLEAN` 이어도 자동 복권은 아니다.** latest 채택이 확인되면 남는 위험은 *"가장 마지막에 완료된 run 이 실패인 경우"* 로 좁혀지는데, concurrency 부재 상태에서는 **선행 run 이 후행보다 늦게 끝나는 순서 역전**이 가능하다 (cross-validate Q2 지적). 즉 `CLEAN` 은 결정 9-1 을 **재검토 대상으로 만들 뿐 뒤집지 않는다** — 복권하려면 순서 역전 부재까지 별도 실증이 필요하다.

**비용 대비**: probe 브랜치 2개 + 보호 규칙 1회 PUT/DELETE + PR 1건. `main`/`develop` 무접촉. §10-4 단계 2 와 동일한 위험 등급이다.

> ⚠️ **부작용 1건 — probe 는 표본 SHA 의 check-run 집합을 변형시킨다** (신설 2026-08-07, PR [#979](https://github.com/coseo12/astro-simulator/pull/979) 리뷰 🟡-3).
>
> `pull_request` 트리거 워크플로 **11개** 중 **`branch-name-guard.yml` 만 base(`branches:`) 필터가 없다** (2026-08-07T13:3xZ 정적 전수 재확인 — 초판의 *"12개"* 는 오기이며 **실측 11개**다. `bench-baseline-remeasure.yml` / `r1-baseline-bootstrap.yml` 은 `workflow_dispatch` 전용이라 모수에서 빠진다. 필터 부재가 `branch-name-guard.yml` 단 1개라는 결론은 불변). 모수 전체: `a11y-baseline-guard` / `auto-close-issues` / `bench` / `branch-name-guard` / `ci-physics-wasm` / `ci` / `fps-baseline-guard` / `harness-pr-review` / `pr-template-checklist-guard` / `project-guards` / `shader-pixel-guard`. 따라서 probe PR (`base=chore/971-mixed-base`) 에서 나머지는 전부 미발화하지만 **`branch-name` 은 발화하며, `ee64871` 에 새 `branch-name` 체크런을 추가한다** (실행 전 현재값: `branch-name` **0건**, 2026-08-07T12:44Z).
>
> - **실험 자체는 무효화되지 않는다** — 판정 대상은 `pr-template-checklist` 이고, `pr-template-checklist-guard.yml` 은 base 필터를 보유해 probe 에서 미발화한다. 즉 자연 표본 `{failure, failure, success}` 는 **보존**된다. `harness-pr-review.yml`(`label-pr`) 도 미발화하므로 라벨 오염도 0이다.
> - **그러나 `ee64871` 은 §8-P1-G 의 negative baseline 표본이기도 하다.** probe 실행은 그 SHA 의 체크런 집합을 되돌릴 수 없게 바꾸므로, **negative baseline 재현이 필요하면 probe 실행 전에** 수행한다.
> - probe 브랜치명 `chore/971-mixed-head` / `chore/971-mixed-base` 는 `branch-name` 가드를 통과하므로 (`verify-branch-name --branch` PASS) 발화가 **실패를 만들지는 않는다**.

**단계 3 — Phase 1 적용 직후 라이브 관찰**

대상은 **release PR 또는 hotfix PR** 이다 (일상 PR 은 `base=develop` 이라 main 의 required check 를 통과하지 않는다 — §10-2 조건 3).

**먼저 `S4` — 그 릴리스 head SHA 가 단일 PR 의 head 인가** (신설 2026-08-07, PR [#979](https://github.com/coseo12/astro-simulator/pull/979) 리뷰 🔴-2 요구 조치 5). **A1 직전과 각 release PR 머지 직전에 1회씩.** `1` 이 아니면 §10-6 시나리오 D 로 진입한다 — 그 경우만 rerun 으로 회복되지 않는다.

```bash
SHA=$(gh pr view <release 또는 hotfix PR> --json headRefOid -q .headRefOid)
# 1 이어야 한다. 2 이상 → A1 연기 또는 head SHA 교체 (§10-6 시나리오 D)
gh api "repos/$REPO/actions/runs?head_sha=$SHA&per_page=100" \
  --jq '[.workflow_runs[] | select(.event=="pull_request") | .head_branch] | unique | "distinct_head_branch=\(length)  \(join(", "))"'
```

```bash
gh pr view <release 또는 hotfix PR> --json mergeable,mergeStateStatus,statusCheckRollup \
  -q '{mergeable, state: .mergeStateStatus, required: [.statusCheckRollup[] | {name, conclusion}]}'
```

**오차단 0 판정 기준** (전건 충족):
- **`S4` = `distinct_head_branch = 1`** (PR 다중성 축 부재 — §2-12 원인 ③).
- `mergeStateStatus` 가 **`BLOCKED` 이 아님** (`CLEAN` 또는 `UNSTABLE` — `UNSTABLE` 은 비-required 체크 실패라 머지 가능).
- required 3개 컨텍스트 (`project-guards` / `branch-name` / `label-pr`) 가 전부 `SUCCESS` 또는 `SKIPPED`.
- release PR 에서 §8-P0 **G1 + G2 가 동시에 빈 출력** (`cancelled` 0 **그리고** 동명 결론 불일치 0).
- ff-sync `git push origin main:develop` 가 거부 없이 완료.

**단계 4 — hotfix 경로 정적 확인 (§10-1 한계 9)**
hotfix PR 은 실측 표본이 0건이다. Phase 1 적용 후 **hotfix 가 실제로 필요해지는 시점 이전에** 아래로 확인한다 — 긴급 상황에서 처음 마주치면 안 된다.

```bash
node scripts/verify-branch-name.mjs --branch hotfix/999-probe    # 기대: 통과 (허용 type)
# 클래스 B/C 워크플로가 base=main PR 에서 트리거되는지: on.pull_request.branches 에 main 포함 확인
grep -A3 "^on:" .github/workflows/harness-pr-review.yml .github/workflows/pr-template-checklist-guard.yml \
  .github/workflows/project-guards.yml .github/workflows/ci.yml | grep -c "main"
```

**미달 시**: 즉시 §9-R1 실행 → 릴리스 완주 → 원인 분석 후 재설계. **릴리스를 인질로 잡고 디버깅하지 않는다.**

### 10-5 재검토 조건

1. 릴리스 1회라도 오차단 발생 → Phase 후퇴 + 본 ADR Amendment.
2. 클래스 A 후속 (§10-3 후속 1) 완료 → required 집합 확대 재검토.
3. GitHub 이 동명 체크런 해석 규칙을 문서화 → §2-8 의 회피 구조 재검토.
4. 저장소가 organization 소유로 이전 → ruleset `enforcement: evaluate` 사용 가능해지므로 §3-3 기각 재검토.
5. 봇 PR 의 base 가 develop 으로 환원 → 결정 4 재검토.
6. **작업 토큰이 저장소 admin 권한을 잃음** (fine-grained PAT 전환 등) → 결정 5 의 전제가 깨지므로 **required check 를 즉시 §9-R1 로 내리고** 재설계. 판정 1줄: `gh api repos/coseo12/astro-simulator -q '.permissions.admin'`.
7. 저장소가 organization 으로 이전 → classic `restrictions` (push allowance) 가 사용 가능해져 §11 기각-5 의 전제가 바뀐다. develop 직접 push 의 기계적 강제가 릴리스 의례를 깨지 않고 가능해지므로 결정 2 재검토.
8. **`harness-pr-review.yml` (`label-pr`) 의 `types:` 에 SHA 를 바꾸지 않는 이벤트가 추가됨** (`edited` / `labeled` / `unlabeled` / `reopened` 등) → 결정 9-3 의 조건부 안전 전제가 깨진다. 즉시 `pr-template-checklist` 와 같은 클래스가 되므로 **required 에서 제외하거나 트리거를 되돌린다**. 판정 1줄 (현재 기대: `[opened, synchronize, ready_for_review]`):
   ```bash
   grep -A3 "^on:" .github/workflows/harness-pr-review.yml | grep "types:"
   ```
9. **required 집합에 새 컨텍스트를 추가할 때 (Phase 2/3 포함)** → 추가 대상 워크플로의 `types:` 를 먼저 확인하고, SHA 를 바꾸지 않는 반복 이벤트가 있으면 §8-P1-G 의 `G2` 를 **그 컨텍스트를 포함한 목록으로** 1회 실행한다. 결정 9 는 `pr-template-checklist` 하나를 처리한 것이지 **축 자체를 닫은 것이 아니다**. ⚠️ **재실행 시 대상 SHA 가 그 컨텍스트에 대해 `n ≥ 2` 인지 먼저 확인한다** (§8-P1-G S2 / §10-1 한계 11) — `n=1` SHA 에서의 빈 출력은 통과가 아니라 판정 불가다.
10. **§10-4 단계 2-bis (동명 결론 불일치 판정 관측) 를 수행했고 결과가 `CLEAN`/`UNSTABLE`** → GitHub 이 최신 `success` 를 채택한다는 뜻이므로 **결정 9-1 (required 제외) 이 과잉일 수 있다**. 다만 자동 복권은 금지 — 순서 역전 (선행 run 이 후행보다 늦게 완료) 부재를 별도 실증한 뒤에만 재검토한다. 결과가 `BLOCKED` 이면 결정 9-1 이 실증된 것이며 재검토 불필요.
11. **GitHub 의 branch protection API 자체가 장애** → §9 롤백이 호출 불가해진다. 한계 7 (Actions 장애) 과 **다른 층**이다: Actions 장애는 체크가 안 오는 것이고, 이쪽은 **탈출구가 안 열리는 것**이다. 현재 완화책 없음 — 장애 복구까지 릴리스 대기가 유일한 경로다. 이것이 required check 도입의 **잔여 가용성 비용**이며 설계로 제거되지 않는다 (cross-validate Q5 부분 수용).
12. **한 커밋에 복수 브랜치를 달아 가드를 실증하는 작업 (#962 패턴) 을 수행할 때** → 그 커밋이 **릴리스 경로 SHA 가 아님을 확인**한다 (신설 2026-08-07, PR [#979](https://github.com/coseo12/astro-simulator/pull/979) 리뷰 🔴-2 요구 조치 7). PR 다중성 축 (§2-12 원인 ③ / §10-1 한계 12) 은 **기술 게이트만으로 닫히지 않는다** — §8-P1-G `S4` 는 *"확인 시점"* 의 상태만 보므로, A1 이후 릴리스 head SHA 를 다른 브랜치에 얹으면 새 체크런이 붙는다. 판정 1줄 (기대: `1`):
    ```bash
    gh api "repos/coseo12/astro-simulator/actions/runs?head_sha=<full-sha>&per_page=100" \
      --jq '[.workflow_runs[] | select(.event=="pull_request") | .head_branch] | unique | length'
    ```
    발화 시 조치: 그 커밋을 릴리스 head 로 삼지 않는다 (develop 에 커밋 1개 추가 후 release PR 재생성) 또는 그 릴리스 동안 §9-R1 로 required 를 내린다.
13. **`pr-template-checklist` 의 escape (무정정 머지) 재발** (신설 2026-08-14, [#1035](https://github.com/coseo12/astro-simulator/issues/1035)) → **결정 9-1 (required 제외) 재검토.** 본 항은 [20260813-1014](20260813-1014-release-pr-class-no-op.md) §재검토 조건 1-B 부기 · §재검토 조건 3 이 본 ADR 로 보낸 위임의 **수신 착지점**이다.

    **왜 본 ADR 관할인가** — escape 4건 (#636 #646 #652 #658) 은 **탐지 실패가 아니라 차단 실패**다. 가드는 4/4 정상 발화했고 사람이 빨간 X 를 단 채 머지했다. 따라서 탐지 축의 신규 가드는 한계 수율 **0** 이고 (ADR 1014 §잔여 갭 (iii) 기각), 차단력을 주는 유일한 수단이 **required 편입** = 결정 9-1 관할이다. 그런데 종전 12항 중 결정 9-1 을 되여는 항은 **10번뿐**이고 그 트리거는 §10-4 단계 2-bis 라는 **미수행 실험**이라, escape 가 재발해도 발화하는 조건이 **없었다**.

    **escape 정의 (기계 판정, 머지 시점 앵커)** — 릴리스 클래스 (`baseRefName == "main"` ∨ `headRefName` 이 `release/` 로 시작) **머지** PR 의 head SHA 위 `pr-template-checklist` 체크런 중 **`started_at ≤ mergedAt` 인 것만** 추려 `success = 0 ∧ failure ≥ 1`. 즉 **머지 시점에 이미 발화한 판정**을 잰다 — _"머지 버튼을 누른 사람의 눈에 보인 색"_ 이 아니다 (아래 ⚠️). **머지 이후에 시작된 run 은 계수에 들어오지 않는다** — 이 앵커가 T1 조치의 자기 소거를 구조적으로 막는다 (아래 §T1 이 계수를 지우지 않는 이유).

    ⚠️ **앵커 기준이 `completed_at` 이 아니라 `started_at` 인 이유** (PR [#1069](https://github.com/coseo12/astro-simulator/pull/1069) reviewer 🟡-7). `completed_at ≤ mergedAt` 은 **머지 시점에 돌고 있던 run** (`started_at ≤ mergedAt < completed_at`) 을 배제하는데, 그 run 이 결국 `failure` 였다면 **가드는 잡았고 사람은 완료를 기다리지 않고 머지한 것**이다 — 차단 실패의 가장 순수한 형태이며, 본 가드가 non-required (**결정 9-1**) 라 그 경로가 구조적으로 열려 있다 (소요 `12`초). `started_at` 기준은 그 구멍을 닫으면서 자기 소거 면역도 유지한다 (사후 정정 run 은 `started_at > mergedAt`). 부수로 `!= null` 분기가 사라진다 — `started_at` 이 `null` 이면 jq 정렬 규약상 `null ≤ <문자열>` 이 **참**이라 그 run 은 **포함**되고, 이는 거짓 양성 방향이라 안전하다 (실측 `null` 보유 `0 / 117`).

    **관측 창** — **90일 rolling, 하한은 본 항 신설일 `2026-08-14`**. 실효 창 = `[max(2026-08-14T00:00:00Z, now-90d), now]`. 하한을 두는 이유는 소급 4건이 전부 `2026-06-08~10` 에 몰려 있어 하한이 없으면 **신설 당일 자동 발화**하기 때문이다 — 그 4건은 발화 입력이 아니라 **기준선**이다 (1014 §1-B 가 창 하한을 _"결정 4 머지 이후"_ 로 둔 것과 동형).

    **관측 시점** — 릴리스 사이클 종료 직후, 그 사이클의 **릴리스 클래스 머지 PR 전건**을 각각 `O(1)` 로 판정한다. 그 경로가 아래 **(0)** 이며 (1) 이 만드는 파일에 의존하지 않는다 (**복붙 실행 가능**). 창 전수 재산출이 필요할 때만 (1) + (2) 를 돌린다.

    > **정정 (2026-08-16, [#1073](https://github.com/coseo12/astro-simulator/issues/1073) / ADR [20260816-1073](20260816-1073-clause13-observation-wiring.md) §3-2).** 초판은 _"release PR 머지 직후 그 PR **1건**만"_ 이었는데, 이는 위 **모집단 (1)** 필터 (`base == "main"` **∨** `head` 가 `release/` 로 시작) 의 **진부분집합**이다. 릴리스 1사이클은 PR **2건**이며 (실측: `#1087` `base=develop` `head=release/0.74.0-prep` → `#1088` `base=main` `head=develop`), 초판 서술로는 **prep PR 이 관측에서 통째로 빠진다** (전 기간 `65`건). 소급 기준선 escape `4/4` 는 전부 `base=main` 이라 **현재 갈림은 `0`** 이나, `pr-template-checklist` 첫 run `failure` 3건 (`#912` `#964` `#1032`) 이 **전부 prep PR** 이므로 ([`operational-friction.md`](../ops/operational-friction.md) §릴리스 부수 마찰) 방향이 거짓 음성이다 — 위 두 assertion 이 닫은 것과 **같은 클래스**라 함께 닫는다. 사이클당 실행 횟수만 `1 → 2` 로 늘고 PR 당 비용은 `O(1)` 불변이다.

    ```bash
    # (0) 단일 PR 판정 — 관측 시점 경로. N 만 바꾼다
    N=1068; REPO=coseo12/astro-simulator
    read -r SHA MERGED_AT <<<"$(gh pr view "$N" --repo "$REPO" --json headRefOid,mergedAt -q '.headRefOid + " " + .mergedAt')"
    [ -n "$SHA" ] && [ -n "$MERGED_AT" ] || { echo "FAIL: #$N 조회 실패 — 재실행"; exit 1; }
    gh api "repos/$REPO/commits/$SHA/check-runs?per_page=100" \
    | jq -r --arg ma "$MERGED_AT" \
        '[.check_runs[] | select(.name=="pr-template-checklist")
                        | select(.started_at <= $ma)]
         | {s:([.[]|select(.conclusion=="success")]|length),
            f:([.[]|select(.conclusion=="failure")]|length)}
         | if .s==0 and .f>=1 then "ESCAPE" else "clean" end'
    ```

    #### 관측 주체 · 주기 · 실패 시 조치 (신설 2026-08-16, [#1073](https://github.com/coseo12/astro-simulator/issues/1073))

    초판은 _"무엇을 어떻게 재는가"_ 만 닫고 _"**누가** 매 사이클 그것을 돌리는가"_ 를 열어 뒀다. 조건을 평가하는 주체가 없으면 **결과는 조건이 없는 것과 같다** — 이 저장소가 [#962](https://github.com/coseo12/astro-simulator/issues/962) → [#970](https://github.com/coseo12/astro-simulator/issues/970) / [#1014](https://github.com/coseo12/astro-simulator/issues/1014) → [#1035](https://github.com/coseo12/astro-simulator/issues/1035) 로 두 번 겪은 형태다. 판정 근거 전문은 ADR [20260816-1073](20260816-1073-clause13-observation-wiring.md).

    | 항목 | 내용 |
    | --- | --- |
    | **실행 주체** | **기계** — `.github/workflows/release-escape-watch.yml` (비-required). 위 **(0)** 을 그대로 실행한다. **판단은 사람** (T1 대장 원인 분류 / T1 (b) 사후 정정 / T2 재개봉). ⚠️ **그 workflow 는 아직 없다 — 구현은 [#1096](https://github.com/coseo12/astro-simulator/issues/1096)** (PR [#1098](https://github.com/coseo12/astro-simulator/pull/1098) reviewer 실측 `0` hit). 배선 전까지는 릴리스 직후 **메인이 (0) 을 1회 수동 실행**하며, 이 잠정 조치는 #1096 머지와 동시에 소멸한다 |
    | **주기** | 릴리스 클래스 머지 **이벤트마다** (`pull_request: types: [closed]` + `merged` ∧ 모집단 조건). 실측 빈도 **`26` 회/30일** (`base=main` 기준) · **`52` 회/30일** (릴리스 클래스 전건) — 사람 스텝으로 올리지 않는 근거. ⚠️ 두 값은 **`2026-08-16` 측정 시점 스냅샷**이며 시간에 따라 이동한다 (`20260808-983` §수치 박제 규약 4항). 재산출 술어와 도출 근거는 ADR [`20260816-1073`](20260816-1073-clause13-observation-wiring.md) §결정 2 가 정본이고 여기서 값을 복제하지 않는다 — 본 표의 두 값은 «사람 스텝 미채택» 판단의 근거 인용이지 감시값이 아니다 (PR [#1098](https://github.com/coseo12/astro-simulator/pull/1098) reviewer 🟡-3) |
    | **실패 — `ESCAPE` 출력** | T1: **(a) 먼저** 아래 §escape 대장 박제 → **(b) 그 다음** 사후 정정. `escape >= 2` 도달 시 T2 = **결정 9-1 재개봉** (편입 승인 아님) |
    | **실패 — job 실패** | run 재실행. `2` 사이클 연속 실패 시 사람이 (0) 을 수동 1회 실행 + [20260816-1073](20260816-1073-clause13-observation-wiring.md) §재검토 조건 3 발동 |
    | **실패 — run 부재** (미발화) | **창 이탈 전** 사람이 (1)+(2) 전수 재산출 **1회**. `check-runs` 는 영구 보존이라 90일 창 안에서 **정보 손실 `0`** — 매 사이클 관측은 데이터 보존 요구가 아니라 **latency 요구**다. 이것이 fallback 이며 사람 규약은 폐지가 아니라 **강등**됐다 |

    ⚠️ **workflow 를 쓰는 결정적 근거는 부담이 아니라 «실행 증거» 다.** 아래 두 assertion 이 지키는 것은 _"`0 hit` 의 의미"_ 인데, **관측 자체가 스킵되면 그 방어가 술어 밖에서 무효화**된다 — 사람 규약은 미실행과 `clean` 을 구별할 산출물을 남기지 않는다. workflow 는 `clean` 이어도 run 이력을 남겨 둘을 분리한다. 이 배선이 [20260814-1031-1064](20260814-1031-1064-committed-claim-guard-rejected.md) §결정 6 (_"대조 주체는 사람"_) 과 충돌하지 않는 이유는 **기계가 관측값 출력까지만** 담당하기 때문이며, 근거 대조표는 [20260816-1073](20260816-1073-clause13-observation-wiring.md) §결정 2 에 있다.

    ```bash
    REPO=coseo12/astro-simulator
    LIMIT=1000
    # (1) 모집단 — 창 안의 릴리스 클래스 머지 PR (ADR 20260813-1014 §1-A 와 동일 필터)
    SINCE=$(date -u -v-90d +%Y-%m-%dT%H:%M:%SZ)   # GNU: date -u -d '90 days ago' +%Y-%m-%dT%H:%M:%SZ
    LOWER=2026-08-14T00:00:00Z                    # 본 항 신설일 하한
    if [[ "$SINCE" < "$LOWER" ]]; then SINCE=$LOWER; fi
    gh pr list --repo "$REPO" --state merged --limit "$LIMIT" \
      --json number,baseRefName,headRefName,mergedAt > /tmp/merged.json

    # ⚠️ 포화 assertion (fail-fast) — gh pr list 는 최신순 반환이라 LIMIT 포화 = 창의 오래된 쪽이 잘렸다는 뜻
    [ "$(jq length /tmp/merged.json)" -lt "$LIMIT" ] \
      || { echo "FAIL: --limit $LIMIT 포화 — 창 절단. LIMIT 를 올려 재실행"; exit 1; }

    jq -r --arg since "$SINCE" \
      '.[] | select((.baseRefName=="main" or (.headRefName|startswith("release/")))
                    and .mergedAt > $since) | "\(.number)\t\(.mergedAt)"' \
      /tmp/merged.json > /tmp/rel-esc.tsv

    # (2) escape 판정 — 머지 시점 앵커 (started_at ≤ mergedAt 인 run 만)
    : > /tmp/escaped-prs.txt
    while IFS=$'\t' read -r N MERGED_AT; do
      SHA=$(gh pr view "$N" --repo "$REPO" --json headRefOid -q .headRefOid) \
        || { echo "FAIL: #$N headRefOid 조회 실패 — 일시 오류. 전건 재실행"; exit 1; }
      [ -n "$SHA" ] || { echo "FAIL: #$N headRefOid 빈 값 — 전건 재실행"; exit 1; }
      gh api "repos/$REPO/commits/$SHA/check-runs?per_page=100" > /tmp/cr.json \
        || { echo "FAIL: #$N check-runs 조회 실패 — 일시 오류. 전건 재실행"; exit 1; }
      jq -r --arg n "$N" --arg ma "$MERGED_AT" \
          '[.check_runs[] | select(.name=="pr-template-checklist")
                          | select(.started_at <= $ma)]
           | {s:([.[]|select(.conclusion=="success")]|length),
              f:([.[]|select(.conclusion=="failure")]|length)}
           | select(.s==0 and .f>=1) | $n' /tmp/cr.json >> /tmp/escaped-prs.txt
    done < /tmp/rel-esc.tsv
    wc -l < /tmp/escaped-prs.txt      # 계수. **어떤 PR 인지는 /tmp/escaped-prs.txt 에 보존된다**
    ```

    ⚠️ **두 assertion 은 장식이 아니라 `0 hit` 의 의미를 지킨다.** 이 술어는 틀릴 때 **거짓 음성 방향으로만** 틀리므로 (escape 를 놓친다) 조용한 실패가 곧 _"escape 없음"_ 으로 읽힌다. ① **포화** — `gh pr list` 최신순 반환 특성상 `LIMIT` 포화는 창의 오래된 쪽이 잘렸다는 뜻이다 (PR [#1069](https://github.com/coseo12/astro-simulator/pull/1069) reviewer 🔴-1 — 초판이 `--limit 300` 을 쓴 결과 모집단이 실제로 절단됐다). ② **일시 조회 실패** — `gh` 가 `HTTP 504`/`422` 를 내면 그 PR 이 평가에서 조용히 빠진다 (실측: 초판 검증 중 실제 발생). 둘 다 `exit 1` 로 즉시 멈춘다. **negative 실증**: `LIMIT=300` 으로 돌리면 `FAIL: --limit 300 포화 — 창 절단` + exit `1` / 조회 불가 PR 주입 시 `FAIL: #999999 headRefOid 조회 실패` + exit `1`. `jq -r --arg since` 는 `date` 산출 문자열을 그대로 받으므로 셸 확장이 개입하지 않는다.

    **머지 시점 앵커를 쓰는 이유 — T1 조치가 계수를 지우지 못하게 한다**

    `pr-template-checklist-guard.yml` 은 트리거가 `types: [opened, edited, synchronize]` 이고 job 가드가 `if: github.actor != 'github-actions[bot]'` **뿐이라 PR state 조건이 없다** (실측 2026-08-14). 따라서 **머지된 PR 본문을 정정하면 같은 head SHA 에 `success` 체크런이 추가된다.** 종전 초판이 쓴 _"전역 `success run = 0`"_ 술어였다면 아래 T1 (b) 를 수행하는 순간 그 PR 이 계수에서 사라져 **`escape ≥ 2` 가 원리적으로 성립 불가능**했다 (PR [#1069](https://github.com/coseo12/astro-simulator/pull/1069) reviewer 🔴-2). 머지 시점 앵커는 사후 run 을 `started_at > mergedAt` 으로 배제하므로 이 자기 소거가 **구조적으로 불가능**하다.

    > **앵커 전환의 정확도 비용은 0 이다 (실측).** 창 `SINCE=2026-05-16T00:00:00Z` 의 릴리스 클래스 **117 PR 전건**에 세 술어를 돌려 대조했다 (2026-08-14).
    >
    > | 술어 | escape 집합 | 갈림 |
    > | --- | --- | --- |
    > | 전역 (무앵커) `success = 0 ∧ failure ≥ 1` | `{#636, #646, #652, #658}` | — |
    > | 앵커 `completed_at ≤ mergedAt` | `{#636, #646, #652, #658}` | **`0`** |
    > | **앵커 `started_at ≤ mergedAt` (채택)** | `{#636, #646, #652, #658}` | **`0`** |
    >
    > 부수 계수 — **머지 후 run** (`completed_at > mergedAt`) 보유 PR **`0`건** (즉 앵커가 실제로 배제한 run 은 현재 `0`), **in-flight run** (`started_at ≤ mergedAt < completed_at`) 보유 PR **`0`건** (🟡-7 구멍은 현재 미발현), `started_at == null` 보유 PR **`0`건**. ⇒ 앵커는 오늘의 판정을 바꾸지 않고 **미래의 구멍만 닫는다.** 세 값이 모두 `0` 이라는 것은 _"앵커가 불필요하다"_ 가 아니라 _"아직 발현하지 않았다"_ 는 뜻이다 — 본 항이 감시하는 사건 자체가 실효 창에서 `0` 인 것과 같은 성격이다.

    **임계 — 2단.** 단발과 재발을 가른다.

    | 단계 | 조건 (실효 창) | 조치 | 결정 9-1 |
    | --- | --- | --- | --- |
    | **T1** | `escape ≥ 1` | **(a) 먼저** 사례를 아래 §escape 대장에 박제 — PR / head SHA / 첫 run `started_at` / 머지 시각 / 간격 / 머지 시점 run 수 / 원인 분류 (작성 행위 · 도구 · 게이트). **(b) 그 다음** 그 PR 본문을 사후 정정해 재발화시켜 빨간 X 해소 | **유지** |
    | **T2** | `escape ≥ 2` | **결정 9-1 재개봉.** 필수 입력 3건 — §10-3 후속 5 (required 복권 경로의 3자 교환) / §10-1 한계 6 (복구 비대칭) / §10-6 (첫 릴리스 5 시나리오) | **재개봉** |

    - ⚠️ **T2 는 재개봉이지 편입 승인이 아니다** — 자동 required 화 금지. 옵션 비교를 다시 여는 것까지가 본 항의 효력이다
    - **T2 의 계수 출처는 위 (0)/(2) 술어다** (대장이 아니다). 머지 시점 앵커라 T1 (b) 를 수행해도 계수가 유지되므로 T2 가 도달 가능하다. **대장은 계수원이 아니라 증거·원인 분류 기록**이며, 술어가 복원할 수 없는 것 (원인 분류 / 당시 본문 형태) 만 담는다
    - **(a) → (b) 순서는 구속이다.** 앵커 덕에 계수는 (b) 에 영향받지 않으나, (b) 를 먼저 하면 _"머지 시점 run 수"_ 같은 대장 필드를 재구성하기 어려워진다. 순서를 지키면 대장이 술어와 **독립적인 두 번째 증거**가 된다
    - **대장을 계수원으로 삼는 안은 기각했다** (reviewer 권장안). 그 경우 T2 가 _"사람이 표를 채웠는가"_ 에 종속되어, **#1035 가 고친 «조건은 있는데 발화 경로가 닫힘» 이 한 층 아래에서 재생산**된다. 앵커는 사람 의존 없이 같은 목적을 달성한다

    #### escape 대장 (T1 (a) 착지점)

    | # | PR | head SHA | 첫 run `started_at` | 머지 시각 | 간격 | 머지 시점 run 수 | 원인 분류 |
    | --- | --- | --- | --- | --- | --- | --- | --- |
    | — | _(현재 0행)_ | | | | | | |

    > 소급 4건 (`#636` `#646` `#652` `#658`) 은 **본 대장에 넣지 않는다** — 실효 창 하한(`2026-08-14`) 이전이라 발화 입력이 아니라 **기준선**이고, 상세는 ADR [20260813-1014](20260813-1014-release-pr-class-no-op.md) §FAIL 축 표에 이미 박제돼 있다.

    **기준선 (창 명시)** — 술어 검증: 위 (1)+(2) 를 **하한을 창 시작으로 내려** (`SINCE=2026-05-16T00:00:00Z`, `LIMIT=1000`, 릴리스 클래스 **117 PR**) 1회 실행해 **4건 = `{#636, #646, #652, #658}`** 를 얻었다 — ADR [20260813-1014](20260813-1014-release-pr-class-no-op.md) §FAIL 축 표의 **전건 재현**이다 (실행 2026-08-14, `gh` GET 전용).

    | 창 | 릴리스 클래스 PR | escape |
    | --- | --- | --- |
    | 1014 선언 모집단 (`#592` 2026-05-27 ~ `#1033` 2026-08-13) | 107 | **4** — 전부 `2026-06-08~10` (3일) |
    | `#667` 이후 (2026-06-11 ~ 2026-08-13, 63일) | 96 | **0** |
    | 본 항 술어 검증 창 (`SINCE=2026-05-16T00:00:00Z`, 하한 미적용) | **117** | **4** |
    | **본 항 실효 창 (신설 시점 실행)** | **2** (#1067 #1068) | **0** |

    > ⚠️ **1행을 _"전수"_ 로 읽지 말 것** (PR [#1069](https://github.com/coseo12/astro-simulator/pull/1069) reviewer 🟡-3). 전 기간 릴리스 클래스는 **212** 다 (술어: 위 (1) 을 `SINCE` 필터 없이 `LIMIT=1000` — 반환 `617` 건으로 포화 아님, 바닥 `#41` / `2026-04-14`). `107` 은 1014 가 **선언한 구간**의 값이고, 그 하한 `#592` 는 다름 아닌 `--limit 300` 의 **절단 바닥**이다 (2026-08-14 실측: `limit 300` 반환 `300` 건 / 바닥 `#592` / `2026-05-27T09:25:23Z`). 같은 절단이 본 항 초판의 `115` 를 낳았고 실값은 **117** 이다 (누락분 `#519` · `#494` — 둘 다 escape 아님이라 **escape 4건은 무영향**).

    ⇒ 현 체제 base rate 가 **`0 / 63일`** 이므로 `escape ≥ 1` 은 이탈 신호로 충분하고, T2 의 `≥ 2` 는 결정 9-1 재개봉 비용 (§10-6 오차단 시나리오 A~E) 에 비례하는 **최소 재발 증거**다 (1014 §1-B 의 임계 근거와 같은 논법 — 단발은 일회성 머지 판단과 구별되지 않는다).

    > **1014 §1-B 의 _"첫 run"_ 술어와 형태가 다르다 — cancelled-first 에서 갈린다.** 1014 는 `sort_by(.started_at) | .[0].conclusion == "failure"` 이고 본 항은 `success = 0 ∧ failure ≥ 1` (머지 시점) 이다. `첫 run = cancelled, 이후 failure` 인 PR 에서 전자는 미계상 / 후자는 계상되므로 **본 항이 초집합**이고 방향이 보수적이다. **다만 이 갈림은 현재 실측 0 이다** — 위 117 PR 전건에서 `pr-template-checklist` 의 `cancelled` run 보유 PR **`0`건**, 첫 run 분포는 `success 104 / failure 12 / run 없음 1`. 우연이 아니라 **결정 9-2 (`pr-template-checklist-guard.yml` 에 `concurrency` 추가 금지) 의 귀결**이다 (실측: 해당 워크플로 `concurrency` grep **0 hit**). 결정 9-2 가 뒤집히면 이 갈림이 실재하게 되므로 그때 두 술어를 재정합한다.
    >
    > 부수 확인 — 첫 run `failure` 인 PR 은 117 창에서 **12건** (`#519` `#592` `#636` `#646` `#652` `#658` `#668` `#702` `#829` `#912` `#964` `#1032`) 이고, 1014 선언 모집단(`#592`~) 으로 좁히면 `#519` 가 빠져 **11건** — 1014 §FAIL 축의 _"첫 run `failure` 11"_ 과 **정확히 일치**한다.

    **창을 30일이 아니라 90일로 잡은 근거는 밀도 차다.** 1014 §1-B 의 "첫 run failure" 축은 기준선이 `6.92건/30일` 이라 30일 창에서도 T2 도달이 관측되지만, escape 축은 `0 / 63일` 이라 30일 창에서는 **간헐 재발 (예: 45일 간격) 이 영구히 T1 에 머문다** — T2 가 원리적으로 도달 불가능해진다. 90일은 그 대역을 사정권에 넣는다. ⚠️ 반대급부로 T2 가 더 이르게 발화하나, T2 의 조치가 **재검토**이지 편입이 아니므로 방향이 보수적이다.

14. **`branch-name` 의 base 편집 우회 — escape 재발** (신설 2026-08-14, [#1027](https://github.com/coseo12/astro-simulator/issues/1027)) → **`branch-name-guard.yml` 의 `types` 에 `edited` 를 추가하는 안 (이하 «후보 1») 재검토.** 본 항은 ADR [20260814-1027](20260814-1027-pr-base-edit-guard.md) §6 이 후보 1 을 **기각이 아니라 유예**하며 본 ADR 로 보낸 위임의 **수신 착지점**이다.

    **왜 본 ADR 관할인가** — 후보 1 은 저장소 설정을 바꾸지 않으므로 (`gh api -X PUT` 불요) 권한 경계 밖이 아니다. 넘는 것은 **결정 조항의 전제**다: 후보 1 은 `branch-name` 에 event _type_ 축을 부여하여 §결정 1 **Phase 1 면제 근거**의 세 번째 다리 (_"required 3개 중 `edited` 처럼 SHA 를 바꾸지 않는 반복 이벤트로 통과 3종 밖 결론을 만들 수 있는 것은 하나도 없다"_) 를 **문자 그대로 거짓으로 만든다**. 즉 재개봉 대상은 required 목록이 아니라 **면제 근거 자체**이며, 그 근거가 사는 문서가 여기다. 종전 13개 조건 중 이 다리를 되여는 항은 **하나도 없었다** — 조건 8·9 는 _"새 컨텍스트가 추가될 때"_ 를 감시하지 _"기존 required 컨텍스트가 새 event type 을 얻을 때"_ 를 감시하지 않는다.

    **1027 이 채택한 것은 후보 1 이 아니다** — 같은 판정을 신규 **비-required** 컨텍스트 `pr-base-edit` (`.github/workflows/pr-base-edit-guard.yml`, `types: [edited]`) 로 복제해 required 3개의 `types:` 를 **무변경**으로 두었다. 따라서 **본 항 신설 시점에 §결정 1 · §결정 9-1 · Phase 1 면제 근거는 전부 무접촉**이며, 본 항은 그 상태가 깨질 조건만 감시한다.

    **escape 정의 (기계 판정)** — 머지 PR 중 `BaseRefChangedEvent` 를 보유하고 그 **최종 `(base, head)`** 가 `scripts/verify-pr-base-rule.mjs` 로 `exit != 0` 인 것. 술어 원문과 완결성 assertion (`totalCount == fetched_nodes`) 은 [20260814-1027](20260814-1027-pr-base-edit-guard.md) **§9-2 조건 1** 이 정본이며 여기서 복제하지 않는다 (판정식 사본 `0`).

    **관측 창** — 정본은 [20260814-1027](20260814-1027-pr-base-edit-guard.md) **§9-2** 다. 본 항 머리가 선언한 _"판정식 사본 `0`"_ 과 같은 원칙으로 **여기서 값을 복제하지 않는다** (초판은 _"1027 구현 PR 머지일"_ 로 복제해 정본과 갈렸고, PR [#1085](https://github.com/coseo12/astro-simulator/pull/1085) 리뷰가 적발했다). 하한을 두는 이유는 항 13 과 동형이다 — 소급 3건 (`#170` `#212` `#217`, 전부 `2026-04-16~18`) 은 **dual PR 폐기 (`2026-04-19`) 이전**이라 당시 정책상 적법했고, 하한이 없으면 신설 즉시 자동 발화한다. 그 3건은 발화 입력이 아니라 **기준선**이다.

    **기준선 (창 명시, 2026-08-14 실측)** — 전 상태 PR **640건 전수**에서 `BaseRefChangedEvent` 보유 PR **`5`** (occurrence 도 `5` — **한 PR 에서 2회 이상 바꾼 사례 `0`**), 그중 머지 **`3`** (전부 dual PR 시기), gitflow 복원 (`2026-04-19`) 이후 organic 편집 **`1`** (`#356`, `→ develop`, 미머지) 이며 그 뒤 **`110일` 무발생**. 즉 현 체제 base rate 는 **`0 / 110일`** 이다.

    **임계 — 2단.**

    | 단계 | 조건 (실효 창) | 조치 | Phase 1 면제 근거 |
    | --- | --- | --- | --- |
    | **T1** | `escape >= 1` | [20260814-1027](20260814-1027-pr-base-edit-guard.md) §9-2 의 **base 편집 escape 대장**에 박제 + 해당 머지의 revert 판단 | **유지** |
    | **T2** | `escape >= 2` | **후보 1 재개봉.** 필수 입력 3건 — 본 ADR §결정 9-1 (판정 입력이 **본문**인 컨텍스트와 **ref** 인 컨텍스트의 비대칭) / §10-1 한계 6 (복구 비대칭) / §10-6 (첫 릴리스 5 시나리오) | **재작성 대상** |

    - ⚠️ **T2 는 재개봉이지 `types` 변경 승인이 아니다** — 자동 적용 금지.
    - **선행 절차 구속**: 후보 1 을 실제로 적용하려면 위 **재검토 조건 9** 를 먼저 수행해야 하는데, 그 조건은 대상 SHA 가 해당 컨텍스트에 대해 `n >= 2` 일 것을 요구한다. `branch-name` 은 **최근 머지 PR 40건 전건 `n=1`** (2026-08-14 실측) 이라 그 표본이 **구조적으로 존재하지 않으며**, 일회용 PR 로 먼저 만들어야 한다. 이 순서를 건너뛰면 조건 9 가 §10-1 한계 3 (_"측정하지 않은 축을 위험 없음으로 결론"_) 을 네 번째로 재생산한다.

### 10-6 Phase 1 첫 릴리스 예측 — 5 시나리오 (신설 2026-08-07)

> PR [#979](https://github.com/coseo12/astro-simulator/pull/979) 리뷰 2차의 Phase 1 착수 판정에서 도출. **사용자가 A1 을 승인하기 전에 읽는 표**이며, §10-4 단계 3 의 라이브 관찰과 §9 롤백을 잇는다.

**정상 경로 (확률 높음).** release PR (head=`develop`, base=`main`) 생성 → required 3개가 붙는다. 소요는 `project-guards` ~10s / `branch-name` ~12s / `label-pr` ~4s. `develop` 브랜치명은 `verify-branch-name` 을 **PASS 한다** (직접 실행 확인: `[PASS] rule: gitflow`) — 릴리스 head 가 규약 밖 이름이라 막히는 시나리오는 **없다**. 체감 변화는 *"머지 버튼이 10~15초 늦게 활성화된다"* 정도다.

**오차단 시나리오:**

| # | 시나리오 | 증상 | 대응 | 회복 비용 |
|---|---|---|---|---|
| **A** | `project-guards` 가 **`cancelled`** 로 남음 (Phase 0 미작동) | 회색 취소 표시 + *"Required statuses must pass"* 로 머지 차단 | 해당 run **rerun** → `success` 면 진행. 반복되면 §9-R1 | **rerun** |
| **B** | 세 체크 중 하나가 **flake `failure`** (원인 ①) | 빨간 X + 머지 차단 | rerun (같은 머신 재시도로 충분한 클래스) | **rerun** |
| **C** | 동명 쌍 결론 불일치 (`{failure, success}`) — 원인 ①·② 계열 | GitHub 이 어느 쪽을 채택하는지 **미문서화** (§2-2). 초록인데 차단되거나 `mergeStateStatus=BLOCKED` 가 이유 없이 붙는 것처럼 보임 | rerun 으로 회복 안 되면 **즉시 §9-R1** | rerun 또는 **약 2초 롤백 (추정)** |
| **D** | **PR 다중성 축 (§2-12 원인 ③)** — release head SHA 가 다른 PR 의 head 이기도 해 `branch-name` 이 `{failure, success}` | rerun 해도 **`failure` 가 사라지지 않는다** (다른 PR 의 브랜치명은 그대로) | **§9-R1 롤백 필수**. 또는 develop 에 커밋 1개 추가 → 새 head SHA 로 release PR 재생성 | **rerun 회복 불가** — 약 2초 롤백 (추정) 또는 **릴리스 1주기** |
| **E** | Actions 장애 / 외부 지연 (한계 7) | 체크가 **영구 Pending** — 빨강도 초록도 아님 | §9-R1 (Pending 은 rerun 대상이 없다) | **약 2초 롤백 (추정)** |

> **한 줄 요약 (사용자용)**: **A·B·C·E 는 rerun 또는 약 2초 롤백 (추정)으로 회복된다. D 만 회복이 비싸다.** 그리고 D 의 base rate 는 20일 창 **0건** (§10-1 한계 12) 이고, 발생 조건 (*"릴리스 SHA 가 다른 PR 의 head 이기도 함"*) 은 **A1 직전 1줄로 사전 확인 가능**하다 (§8-P1-G **S4**). 그 1줄을 절차에 넣었으므로 **D 는 사실상 닫힌다** — 남는 것은 *"확인을 건너뛰는"* 운영 실수뿐이고, 그쪽은 §10-5 재검토 조건 12 가 담당한다.

**롤백 — §9-R1, 약 2초 (추정 — 실 발동 이력 0).** 증상 확인 즉시 실행한다. 판단을 오래 끌지 않는다. 명령 원문은 §9-R1.

---

## §11 교차검증 반영 사항

> **라운드 1 (초판, 2026-08-07 오전)** — 아래 §11-1. 2회 호출.
> **라운드 2 (Phase 1 착수 전 정정, 2026-08-07 오후)** — §11-2. 2회 호출. **결정 9 신설이 신규 결정 조항이라 수행 판정.**

---

## §11-2 교차검증 — 라운드 2 (결정 9 신설 / Phase 1 게이트 격상)

> **수행 판정 근거**: 본 라운드의 A (사실 정정) 는 cross-validate 불요이나, **B-4 (Phase 1 면제 근거 재작성) 와 B-5 (결정 9 신설) 는 결정 조항의 신설·변경**이다. CLAUDE.md §교차검증 의 앵커 4종 중 *"ADR 신규·개정/폐기"* 에 해당 → **수행**.
>
> **1차**: `.claude/skills/cross-validate/scripts/cross_validate.sh architecture docs/decisions/20260807-971-required-status-checks.md`
> — outcome **`applied`** (exit 0) / `plan_bypass: **false**` / `rollback_failed: false` / `reminder_issue: none`
> — 로그: `.claude/logs/cross-validate-architecture-20260807-210725.log` / outcome: `...-210725-outcome.json`
> — `scripts/parse-cross-validate-outcome.sh` 로 파싱해 `plan_bypass == false` 확인 (#479 의무).
>
> **2차 (반증 전용)**: 1차가 6기준 전부 ★★★★☆~★★★★★ 로 수렴해 **반증 산출이 사실상 0** 이었다 (미세 제안 3건뿐). `cross_validate.sh` 는 프롬프트가 고정이라 편향 셀프 체크 질문을 주입할 수 없으므로, 스킬 문서가 명시한 **직접 호출 경로** (`agy -p` + L1 strict prefix 수동 포함) 로 **"동의 금지, 반대 논거만" 프롬프트** 를 재호출했다. 질문 5개는 아래 §편향 셀프 체크의 미통과 축에서 직접 도출했다.
> — L3 등가 검증: 호출 전후 `git status --porcelain` **동일** (워킹트리 변경 0, `diff` 실행 확인).

### 합의 (라운드 2)

외부 모델이 독립적으로 지지 — 추가 변경 없음.

1. **결정 9-1 (`pr-template-checklist` required 제외)** — *"본문 수정을 유도하는 가드 특성상 동일 SHA 에 failure/success 가 영구 공존하므로 required 화 시 결정론적 릴리스 블록"* 이라는 §2-12 판정에 동의.
2. **결정 9-2 (concurrency 추가 금지)** — *"직관적으로는 넣고 싶어지지만, 겹침 0 이라 발화하지 않고 발화하면 cancelled 로 더 나빠진다"* 는 2겹 근거를 그대로 재구성.
3. **`G2` 판정식이 통과/미통과 이분법인 것** — *"규칙 독립성(Rule Independence)을 확보한 판정 인터페이스"* 로 평가. §5 (a) 잣대 일관성 주석과 독립적으로 같은 결론에 도달.
4. **Phase 1 게이트를 릴리스 비의존으로 둔 것** — 릴리스 3주기 회피와 안전 확보의 양립.
   - ⚠️ **2026-08-07 4차 정정 (PR [#979](https://github.com/coseo12/astro-simulator/pull/979) 2차 리뷰)**: **게이트 `P1-G` 자체는 여전히 릴리스 비의존**이다 (과거 release PR head 로 실행). 그러나 **Phase 1 *착수* 는 더 이상 릴리스 비의존이 아니다** — §10-2 전이 조건 5·6 이 *"다음 release PR 1건 관찰"* 을 필수로 추가했다. 근거는 **Phase 0 효과가 릴리스 경로에서 0회 실측**이라 `P1-G` 의 유일한 표본 `c2732ae` 가 **Phase 0 이전 SHA** 라는 것 (§10-2 박스). 즉 이 합의 항목은 *"게이트 설계"* 에 대해서는 유효하고 *"착수 시점"* 에 대해서는 초과됐다. 대신 릴리스 3주기 회피는 그대로 유지된다 — 늘어난 것은 **1주기**다.

### 이견 수용 (라운드 2)

| # | 원안 | 수정안 | 수용 근거 |
|---|---|---|---|
| 1 | **`G2`/`G1`/`P1-G` 의 "빈 출력 = 통과"** (Q4) | **전제 확인 + `exit` 판정 추가** — required 이름이 실제 존재하는지 먼저 확인하고, `gh api` 가 exit 0 일 때만 빈 출력을 통과로 읽는다 (§8-P1-G / §8-P0) | **본 라운드 최대 수확.** 게이트가 *"측정 실패"* 와 *"위반 0"* 을 구분하지 못하는 구조였다. **실측으로 확정**: 저장소 초기 커밋 `11c7b4f` 는 유효 SHA 이고 체크런 2개가 있으나 required 3개는 하나도 없어, `G2` 가 **빈 출력 = 통과**를 낸다. 이는 방금 정정한 qa 발견 (창 cap 오통과, §10-1 한계 10) 과 **정확히 같은 클래스** — 게이트 자신이 그 클래스에 걸려 있었다. 조용한 오통과를 막는 가드가 조용히 오통과하면 자기모순 |
| 2 | **§2-8 "동명 해소 규칙은 사전 실증 불가"** (Q1) | **불가능 주장을 좁힘** — 체크런 *합성*은 불가하나 **자연 발생 불일치 표본** (`ee64871`) 이 이미 있으므로 probe 브랜치로 **실증 가능**. §10-4 **단계 2-bis** 신설 (설계만, 실행은 사용자 승인 후) + §10-5 재검토 조건 10 | 원 논거는 *"임의 conclusion 합성 = GitHub App 전용"* 에 기댔는데, **합성할 필요가 없다는 것을 놓쳤다**. 이 구분이 중요한 이유: §5 (a) 기각과 결정 9-1 이 둘 다 *"규칙을 모른다"* 를 근거의 일부로 쓰므로, 알아낼 경로가 있다면 그 근거는 영구가 아니라 **잠정**이다. 단 **결정 9-1 자체는 유지** — `BLOCKED` 이면 실증되고 `CLEAN` 이어도 순서 역전 (아래 #3) 이 남아 자동 복권이 아니다 |
| 3 | 결정 9-2 의 근거를 "겹침 5/27" 실측으로만 제시 (Q2) | **순서 역전 위험을 단계 2-bis 해석표에 편입** — concurrency 부재 시 선행 run 이 후행보다 늦게 완료돼 stale 결론이 최신을 덮을 수 있다 | 외부 모델은 이를 *"concurrency 를 넣어야 할 이유"* 로 제시했으나 **재분석 결과 반대 방향으로 작동한다** — 순서 역전은 latest 채택 규칙 하에서 위험하고, 그 위험은 `pr-template-checklist` 를 **required 에서 뺀 결정 9-1 을 더 정당화**한다. 즉 지적은 유효하되 결론은 원안 강화. 단계 2-bis 의 *"`CLEAN` 이어도 자동 복권 아님"* 단서가 이 수용의 산물 |
| 4 | §10-1 한계 7 (GitHub Actions 장애) 만 기술 (Q5) | **재검토 조건 11 신설** — branch protection **API 자체**의 장애 시 §9 롤백이 호출 불가 | 두 장애는 **다른 층**이다: Actions 장애는 *체크가 안 오는 것*, protection API 장애는 *탈출구가 안 열리는 것*. 후자는 완화책이 없으며 **required check 도입의 잔여 가용성 비용**이다. 숨기지 않고 명시 |

### Claude 재분석으로 기각한 외부 모델 제안 (라운드 2)

| # | 제안 | 기각 근거 |
|---|---|---|
| 1 | **`jq` 의 `IN()` 이 구버전 호환성 문제를 낼 수 있으니 `or` 체인으로 바꿔라** (1차 제안 1) | **실측 후 기각.** 본 환경 (`gh 2.88.1`) 에서 `IN()` 식과 `or` 체인 식이 `c2732ae` 에 대해 **동일 7건**을 반환함을 직접 대조 확인했다. 더 결정적으로, 만약 비호환이 발생하면 게이트는 **parse error 로 시끄럽게 죽는다** — 조용한 오통과가 아니라 **fail-loud** 다. 본 게이트의 안전 속성 (빈 출력 오독 방지) 을 위협하지 않으므로 교체 이익이 없다. 다만 미래에 실제로 마주칠 경우를 위해 **동치 대체식을 이 표에 남긴다**: `pass: (.conclusion=="success" or .conclusion=="skipped" or .conclusion=="neutral")` |
| 2 | **`label-pr` 도 `labeled`/`unlabeled`/`reopened` 로 동일 SHA 중복을 만드니 이중잣대다** (Q3) | **사실 오류 — 실측 반증.** `harness-pr-review.yml` 의 `types` 는 `[opened, synchronize, ready_for_review]` 로, `labeled`·`unlabeled`·`reopened` 가 **없다** (2026-08-07 파일 직접 확인). 라벨을 아무리 갈아 끼워도 이 워크플로는 트리거되지 않는다. 실측 동일 SHA 누적도 20일 창 **0건**이다. 외부 모델이 *"구조가 같으니 거동도 같을 것"* 으로 추정한 오류 — 본 ADR 이 §2-12 실측 3 에서 정확히 이 오분류를 경계한 지점이다. **단 "우연에 의존하는 안전" 이라는 프레이밍 자체는 타당**하므로 §10-5 재검토 조건 8 (트리거 추가 시 재검토) 로 이미 수용돼 있다 |
| 3 | `label-pr` 의 권한 부재 / rate limit / 봇 계정 실패도 위험이다 (Q3) | **required check 가 의도대로 작동하는 경우이지 오차단이 아니다.** 이 경로들은 `failure` **단일** 결론을 만들 뿐 동명 불일치를 만들지 않는다 (`label-pr` 은 n=1). 실패한 가드가 머지를 막는 것은 **설계 목적 그 자체**다. fork PR 의 read-only 토큰 경로는 §10-1 한계 8 에 이미 기술돼 있고 영향 0 이다 |
| 4 | 결정 9-1 대신 **"릴리스 직전 rerun 강제"** 로 대체하라 (Q1) | **메커니즘상 무효.** rerun 은 기존 체크런을 **제거하지 않고 새 체크런을 추가**한다. `{failure, success}` → `{failure, success, success}` 가 될 뿐 불일치는 그대로다. 이 대안이 성립하려면 latest 채택이 참이어야 하는데, 그렇다면 rerun 없이도 이미 통과다 — **즉 이 제안은 문제가 없을 때만 작동한다** |
| 5 | 결정 9-1 대신 **"PR 본문 편집 금지 규약"** 으로 대체하라 (Q1) | **가드의 목적과 정면 충돌.** `pr-template-checklist` 는 *"본문 7 체크박스를 채워라"* 를 요구하는 가드다. 편집을 금지하면 가드가 요구하는 수정 자체가 불가능해진다. 규약으로 사람 행동을 제약해 기계 결함을 우회하는 것은 CLAUDE.md §가드 설계 원칙 (silent 약화 금지) 위반 |
| 6 | **`P1-G` 대상 SHA 자동 추출에 에지 케이스 검증을 덧붙여라** (1차 제안 2) | **기각 아님 — 이견 수용 1 로 흡수.** 외부 모델은 이를 "편의 개선" 으로 제시했으나, 재분석 결과 **안전 속성의 결함**이었다 (측정 실패 = 통과 오독). 제안보다 강한 형태 (전제 확인 + `exit` 판정 + 실측 근거 박제) 로 수용했다 |
| 7 | 복구 런북에 `gh run rerun <run-id>` 를 추가하라 (1차 제안 3) | **범위 밖 — §10-3 후속 2 에 이미 포함.** 릴리스 런북 편입은 후속 2 (선언적 관리 구현 + 런북 체크리스트) 의 산출물이며, 본 ADR 라운드는 저장소 설정·워크플로 무변경이 전제다. §10-1 한계 6 이 복구 경로 비대칭을 이미 박제하고 있어 맥락 유실 위험도 없다 |

### 고유 발견 (후속 분리 — 라운드 2)

1. **동명 결론 불일치의 실제 판정 관측 실험** (§10-4 단계 2-bis) — 본 ADR 은 **설계만** 박제하고 실행하지 않았다. 실행에 보호 설정 PUT/DELETE 가 필요해 사용자 승인 사항이며, 본 라운드의 범위 (설정 변경 0) 밖이다. 결과에 따라 결정 9-1 이 재검토된다 (§10-5 재검토 조건 10).
2. **`pr-template-checklist` 의 `edited` 트리거 제거안** — §10-3 후속 5 로 분리 (복구 경로 비대칭과의 3자 교환).

### 호출 전 Claude 편향 셀프 체크 (라운드 2, architect, 2026-08-07)

| 축 | 판정 | 조치 |
|---|---|---|
| 낙관적 일정 | **미통과** — Phase 1 게이트를 *"수 초"* 로 적었으나 실패 시 대응 비용을 정량화하지 않았다 | 2차 호출 **Q5** 로 주입 → 재검토 조건 11 (protection API 장애 시 롤백 불가) 신설 |
| 결합 간과 | **미통과** — 결정 9-1 이 `pr-template-checklist` 를 required 에서 뺀 것이 **§10-1 한계 6 의 유일한 초 단위 복구 경로** (본문 편집 재실행) 와 결합돼 있음을 초안 작성 후에야 인지 | 2차 호출 **Q3** 로 주입 (자의적 이중잣대 반증 요구) → 결정 9-2 (ii) 의 교환 구조를 §10-3 후속 5 에 명시 분리 |
| 폐기 프레이밍 | **미통과** — *"concurrency 추가는 해법이 아니다"* 를 원리로 단정하려는 관성이 있었다 (실측 없이) | 2차 호출 **Q2** 로 주입 → 겹침 5/27 실측 + `ee64871` 겹침 0 타임라인으로 **2겹 근거화**. 그 과정에서 **"6일 23회 취소" 라는 자기 과대 주장을 5회로 정정**했다 (본 라운드의 자기 적용 사례) |
| 순수주의 | **미통과** — *"규칙을 모르니 required 에서 뺀다"* 가 과잉 회피일 가능성 | 2차 호출 **Q1** 로 주입 → §2-8 불가능 주장이 **좁혀짐** (합성 불가 ≠ 실증 불가). 단계 2-bis 로 실증 경로 확보. 결정 9-1 은 유지하되 **잠정 근거임을 명시** |

> **4축 전부 미통과** 였다는 사실 자체를 박제한다. 라운드 1 은 3/4 미통과였고 라운드 2 는 4/4 다 — 셀프 체크가 통과 도장이 아니라 **질문 생성기**로 작동했다는 증거이며, 실제로 4개 축 전부가 §11-2 의 이견 수용·기각 항목으로 이어졌다.

---

## §11-1 교차검증 — 라운드 1 (초판)

> 수행: architect, 2026-08-07 오전. **2회 호출**.
> 1차: `cross_validate.sh architecture docs/decisions/20260807-971-required-status-checks.md` — outcome `applied` (exit 0) / `plan_bypass: false` / `rollback_failed: false` / `reminder_issue: none`. 로그: `.claude/logs/cross-validate-architecture-20260807-130621.log`
> 2차: 1차가 전 항목 5/5 동의로 수렴해 반증 산출이 0이었다. `cross_validate.sh` 는 프롬프트가 고정이라 편향 셀프 체크 질문을 주입할 수 없으므로, 스킬 문서가 명시한 **직접 호출 경로** (`agy -p`, L1 strict prefix 수동 포함) 로 **반증 전용 프롬프트** 를 재호출했다. L3 등가 검증: 호출 전후 `git status --porcelain` 동일 (워킹트리 변경 0).

### 합의

외부 모델이 독립적으로 지지 — 추가 변경 없음.

1. **클래스 A required 금지** — workflow 단위 path 스킵이 영구 pending 을 만든다는 §2-3 판정.
2. **Phase 0 (`github.ref` 추가)** — 교차 취소의 구조적 원인 규명과 해법.
3. **`develop` required check 미채택** — fast-forward 릴리스 전략과의 호환이 상위라는 §4 판정.
4. **Rulesets 기각** — User 소유라 `evaluate` 미지원 + bypass actor 무력화.
5. **Probot Settings App 기각** — 서드파티 `administration: write` 상시 부여 회피.
6. **`app_id: 15368` 명시** — 외부 앱의 동명 체크런 주입 차단.

### 이견 수용

| # | 원안 | 수정안 | 수용 근거 |
|---|---|---|---|
| 1 | Phase 0→1→2 각 단계마다 release PR 1회 관찰 (릴리스 3주기) | **관찰 게이트를 Phase 2 앞에만** 배치. Phase 0 머지 직후 Phase 1 적용 | 위험이 균등하지 않다. cancelled 쌍둥이 6/6 은 **Phase 2 대상 3개에만** 관측됐고 Phase 1 후보 4개는 cancel 0 + 롤백 2초다. 관찰 비용을 위험이 있는 곳에만 지출하는 것이 옳다 (결정 1 표). **⚠️ 2026-08-07 부분 정정** — 이 수용의 근거였던 `cancel 0` 이 event *type* 축을 커버하지 못함이 드러나 **릴리스와 무관한 게이트 `G2` 1회 (§8-P1-G) 를 추가**했다. 즉 "게이트 없음" 이 아니라 "릴리스 비의존 게이트" 다. **⚠️ 4차 재정정 (🔴-2 라운드)** — *"릴리스 대기 없음"* 은 **더 이상 유지되지 않는다**. Phase 0 효과가 릴리스 경로에서 0회 실측이라 §10-2 **전이 조건 5·6** (다음 release PR 1건) 이 추가됐다. 단 원안의 *"릴리스 3주기"* 대비로는 **1주기**이므로 이 수용의 실질 (3주기 회피) 은 유지된다 |
| 2 | 결정 5 논거 = "DELETE 한 줄이 탈출구" | **감사 궤적 논거 추가** — `false` 의 우회 머지는 무흔적, `true` + DELETE 는 기록이 남는다. 즉 `true` 는 탈출을 **관찰 가능하게** 만든다 | 같은 결론의 더 강한 근거. 단 개인 계정은 org audit log 가 아닌 security log 범위임을 calibration 으로 명시 |
| 3 | 결정 5 의 토큰 전제 암묵 | **전제 명시 + §8 필수 사전 게이트** (`.permissions.admin == true`) + §10-5 재검토 조건 6 신설 | fine-grained PAT 로 `Administration` 이 빠지면 §9-R1 이 403 → **탈출구가 실제로 사라진다**. 원안은 현 토큰 상태에 암묵 의존하고 있었다 |
| 4 | job 이름 변경 시 영구 `Expected` 위험에 대한 가드 없음 (§8-A3 의 `diff-scope-wasm` 존재 확인 1건뿐) | **결정 8 신설** — in-repo required 목록 선언 ↔ `.github/workflows/**` job 이름 정적 대조 가드, `project-guards` 배선 | 본 ADR 최대 수확. §3-2 의 "CI 는 admin 권한이 없어 검증 불가" 한계는 *보호 상태를 읽는* 방향에만 적용된다. **반대 방향은 YAML 만으로 검사 가능**하다는 것을 놓치고 있었다 — 결정 7 의 JSON 선언에 강제력을 부여한다 |
| 5 | reopen/draft·GHA 장애·fork PR·hotfix 경로 미기술 | **§10-1 한계 6~9 신설** + §10-4 단계 4 (hotfix 정적 확인) | 각각 실재하는 경로다. 특히 한계 6 (reopen 시 `branch-name` 미재실행 → 영구 pending) 은 #962 §5-2 의 **의도된** 설계와 required check 가 충돌하는 지점이라 완화 절차 (빈 커밋) 를 알고 있어야 한다 |

### Claude 재분석으로 기각한 외부 모델 제안

| # | 제안 | 기각 근거 |
|---|---|---|
| 1 | "과거 release PR 의 check-runs 를 정적 조회하면 100% 검증되므로 **Phase 0/1/2 를 단일 적용으로 통합**하라" | 과거 데이터가 증명하는 것은 **컨텍스트의 존재**뿐이다. 미지수는 "cancelled 쌍둥이가 있을 때 GitHub 이 required 를 어떻게 판정하는가" 이고, **required check 가 없던 시절의 데이터로는 원리적으로 알 수 없다** (§2-8). Phase 2 앞 관찰 게이트는 유지 — 부분 수용에 그친다 |
| 2 | "`branch-name` 이 release PR 의 head=`develop` 에서 실패·스킵할 수 있다" | **실측 반증.** #974 (head=develop) 에서 `branch-name` = `success`. 정본 상수 `GITFLOW_HEADS = ['develop', 'main']` 이 허용 집합 1행이다. 외부 모델이 문서만 보고 추정한 오류 |
| 3 | "모든 PR 워크플로의 `types` 에 `[opened, synchronize, reopened, ready_for_review]` 를 필수 명시하라" | **#962 ADR §5-2 를 되돌리는 제안.** `reopened` 제외는 실수가 아니라 "과거 PR reopen 이라는 유일한 잔여 노출을 닫는" 명시적 결정이었다. 무비판 수용 시 그 구멍이 재개방된다. 잔여 위험 (한계 6) 은 가드를 약화하는 대신 **완화 절차 박제**로 처리 |
| 4 | "required 대상 워크플로에서 workflow 단위 `paths`/`paths-ignore` 를 전면 제거하라" | 방향은 옳으나 **본 ADR 범위 밖**이다. 이미 §10-3 후속 1 로 분리돼 있다 (5개 워크플로 트리거 재설계). 정책 도입 PR 에 끼워 넣으면 오차단 원인 분리가 불가능해진다 |
| 5 | "**`develop` 에 push allowance (직접 push 제한) 를 걸고 릴리스 주체만 bypass 로 등록**하면 의례 변경 없이 100% 기계적 강제가 가능하다 — 설계안의 '강제 0' 주장은 허위 대립이다" | **두 축 모두 본 저장소에서 불성립.** (a) classic branch protection 의 `restrictions` (push allowance) 는 **organization 소유 저장소 전용**이다 (GitHub Docs). 본 저장소는 `owner.type: User` — 현재 보호 응답에 `restrictions` 키가 아예 없는 것과 정합한다. (b) rulesets 로 우회하려 해도 지정 가능한 bypass actor 는 사실상 repository admin = **사용자 본인 = 에이전트가 쓰는 동일 토큰**이라, 릴리스 스크립트와 일상 push 를 구분할 신원이 존재하지 않는다 (§3-3 결함 2). 별도 릴리스 봇 신원을 만들면 성립하나 그것은 §10-3 후속 4 의 토큰 분리 결정에 종속된다. 다만 지적 자체는 **조건부로 옳으므로** §10-5 재검토 조건 7 (org 이전 시) 로 박제 |
| 6 | "fork PR 이 secret 부재로 실패해 릴리스가 블록된다" | fork PR 은 `develop` 을 대상으로 하고 **develop 에는 required check 가 없다** (결정 2). `main` 은 release/hotfix 전용이라 fork PR 이 도달할 정책 경로가 없다. 영향 0 — 근거는 §10-1 한계 8 에 명시 |

### 고유 발견 (후속 분리)

1. **작업 토큰 권한 분리** — 일상 에이전트 토큰에서 `Administration` 을 제거하고 비상용 admin 토큰을 분리. 강제력은 오르지만 §9 롤백이 2초 → 수 분으로 늘어나는 **정면 교환**이라 별도 결정이 필요하다 → §10-3 후속 4.
2. **릴리스 런북에 보호 상태 수동 검증 체크리스트** (1차 호출 보완 제안 ①) → §10-3 후속 2 에 편입.

### 호출 전 Claude 편향 셀프 체크 (architect, 2026-08-07)

| 축 | 판정 | 조치 |
|---|---|---|
| 낙관적 일정 | **미통과** — 3단계 × release 주기 = 3주 소요를 ADR 이 정량화하지 않았다 | 2차 호출 Q1 로 명시 질문 삽입 → 이견 수용 1 (관찰 게이트 1개 제거) |
| 결합 간과 | **미통과** — 선행 ADR 20260701-779 (concurrency) 와의 결합을 초안 작성 후 자체 점검에서야 발견 | §2-10 신설 + 2차 호출 Q4 로 잔여 결합 질문 → 이견 수용 4·5 |
| 폐기 프레이밍 | 통과 — rulesets / settings.yml 기각이 전부 문서·실측 근거 기반이며, 외부 반박 (Q5) 도 문서로 재검증 후 기각 | — |
| 순수주의 | **미통과** — "가정에 의존 금지" 를 이유로 Phase 0 를 release 관찰 게이트로 승격한 것이 과잉일 가능성 | 2차 호출 Q2 로 명시 질문 삽입 → Phase 0 는 선행 유지하되 **release 대기 게이트에서 같은 세션 선행으로 완화** |
