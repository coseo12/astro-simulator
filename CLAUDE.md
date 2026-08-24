# Claude Code 워크플로우 템플릿

## 🚫 CRITICAL DIRECTIVES (NEVER BYPASS)

**아래 규칙은 세션 초기화/신규 프로젝트 셋업/모호한 지시 상황에서도 예외 없이 적용된다.**
세부 근거는 하단 섹션에 있으며, 이 블록은 어텐션 환기용 요약이다.

1. **브랜치 보호** — `main` 직접 수정/푸시 금지. 모든 변경은 `<type>/*` 브랜치에서 PR로만 반영 (type 정의는 §브랜치 전략).
2. **모호한 지시 사전 확인** — "리뉴얼", "개선", "셋팅해줘" 등 범위 불명 지시는 **작업 전** 범위를 사용자에게 제시하고 승인받는다. 보수적 해석으로 임의 진행 금지.
3. **UI 작업 3단계 검증** — 빌드/테스트 통과는 "동작" 증거가 아니다. 정적 → 인터랙션 → 흐름 3단계를 브라우저에서 확인 후 커밋.
4. **한글 인코딩 검증** — 한국어 포함 파일 Edit 후 `grep -rn '�'` 실행. U+FFFD 발견 시 즉시 수정.
5. **파괴적 작업 사전 경고** — `rm -rf`, force-push, DB drop 등은 사용자 cwd/데이터 영향을 사전에 고지하고 확인.
6. **스프린트 계약** — 구현 착수 전 검증 가능한 완료 기준 목록을 사용자와 합의한다.

> **세션 시작 시 자기 점검**: 새 대화에서 첫 작업을 시작하기 전, 본 블록을 인지했는지 확인하고 위반 가능성이 있는 경우 사용자에게 명시한다. 구성 이상이 의심되면 `project-guards` 가드 스크립트 (`scripts/verify-*.{sh,mjs}`) 를 로컬 실행한다.

---

## 개요
AI 에이전트 기반 개발 워크플로우 템플릿. 1인 개발자-AI 페어 프로그래밍에 최적화.

---

## 브랜치 전략 (classic gitflow)

> 배경 (dual PR 폐기 이력 / develop 2역할 / PaaS 환경 매핑): [docs/deployment-patterns.md](docs/deployment-patterns.md)

| 브랜치 | 역할 | 진입 경로 | 금지 사항 |
|---|---|---|---|
| `main` | **배포 anchor**. 태그된 릴리스만 존재 | `develop → main` **release PR** 로만 / `hotfix/* → main` PR | 직접 push 금지 |
| `develop` | **개발 통합**. 모든 완성된 변경이 먼저 도착 | `<type>/*`·`release/*-prep` PR / `main → develop` merge-back (hotfix 후) | 직접 push 금지 |
| `<type>/<이슈번호>-<설명>` | 일상 개발. type 은 §커밋 컨벤션 의 type 과 동일 (신기능 = `feature`) | `develop` 에서 분기 | `main` 대상 PR 생성 금지 |
| `release/<X.Y.Z>-prep` | 릴리스 준비 (이슈번호 없는 예외) | `develop` 에서 분기 | 기능 변경 금지. `v` 접두 금지 (#972 — 태그만 `v0.71.0`) |
| `hotfix/<이슈번호>-<설명>` | **prod 긴급 패치** | `main` 에서 분기. 머지 후 즉시 `main → develop` merge-back | 드물게 사용. develop merge-back 누락 금지 |

### 워크플로 3단계
1. **일상 개발** — `<type>/*` → PR(base=develop) → develop
2. **릴리스** — develop → release PR(base=main) → **`gh pr merge <PR> --merge` 의무** (`--squash` 금지 — main/develop diverge + merge-back 강제) → **`git push origin main:develop`(fast-forward) 필수** → tag + release
3. **핫픽스** — `hotfix/*`(main) → PR(base=main) → 태그 → **즉시 merge-back PR(base=develop)** 필수
- **dual PR 금지**: 일상 개발 PR 은 `base=main` 사용 금지 (PR 템플릿 가드)
- 상세: [branch-strategy-workflow.md](docs/guides/branch-strategy-workflow.md)

### drift 감지
- `git fetch origin` + `git merge-base --is-ancestor origin/develop origin/main` + `git rev-list --count origin/main..origin/develop`
- 반직관 함정: `main > develop` 여도 develop 이 조상이면 **정상** (ff 대기 — `git push origin main:develop`) / 아니면 warn

## 커밋 컨벤션
```
<type>(<scope>): <description>
```
- type: feat, fix, refactor, test, docs, chore
- scope: 변경 대상 모듈/컴포넌트

## PR 규칙
- PR 제목에 이슈 번호 포함: `[#이슈번호] 설명`
- PR 본문에 변경 사항, 테스트 계획, 영향 범위 명시

---

## 스프린트 계약 (Sprint Contract)

구현 전에 "완료"의 정의를 검증 가능한 기준으로 합의한다.
AI는 자기 작업을 과도하게 긍정 평가하는 경향이 있으므로, 사전 합의된 기준이 객관적 검증의 기반이 된다.

1. 이슈/기능 착수 전 **완료 기준 목록**을 작성한다
2. 각 기준은 **측정 가능**해야 한다 — 정성적 표현 금지, 수치/관찰 가능한 동작으로 표현
   - 좋은 예: "버튼 클릭 시 모달 열림", "API 응답 200", "axe 0 위반", "60fps 유지", "회귀율 < 25%"
   - 나쁜 예: "성능 좋아짐", "UX 개선", "안정적"
3. 기준 미충족 시 **구체적 피드백과 함께 반려** — 단순 "실패"가 아닌 원인+수정점 명시
4. 표면적 테스트가 아닌 **엣지 케이스까지 탐색**한다
5. 합의된 기준은 실측 후 **재조정 가능** — 단, 사용자와 명시적으로 합의 후 갱신
6. 재조정 시 **테스트 ROI 5문 체크** 후 대체재 우선 — [상세](docs/lessons/sprint-contract-roi.md)
7. 재조정 사실은 **세 위치에 동시 박제** (누락 방지):
   - **코드 주석** — 계약 자체 (무엇을 의도적으로 스킵했는지)
   - **PR 본문** — 결정 근거 (왜 재조정했는지)
   - **CHANGELOG Notes** — 미래 관찰자용 기록 (재발견 시 "누락"으로 오인 방지)
8. 반대 함정: "완료 기준에 있으니 무조건 테스트 작성" (의존성 복잡도 무시한 단발성 부채) vs "ROI 낮다고 조용히 스킵" (재조정 박제 누락). 둘 다 금지.
9. 근거: volt [#31](https://github.com/coseo12/volt/issues/31)
10. **수치 DoD 미달 시 측정 방법 검증 우선** — **(0) 측정 방법 → (1) 식/구현 → (2) 알고리즘 → (3) 데이터 신뢰성** 순. 상세 [sprint-contract-roi.md](docs/lessons/sprint-contract-roi.md) §10항

### 마일스톤 회고 루틴

마일스톤(또는 Phase) 종료 시 **회고 문서 작성은 의무**다.
- 위치: `docs/retrospectives/<phase-or-milestone>-retrospective.md`
- 고정 4섹션: **달성도(완료 기준 표) / 잘 된 것 / 어려웠던 것 / 다음 인수인계**
- 테스트 증분·성능 변화는 baseline 대비 수치로 기록
- 회고에서 도출된 프로세스 교훈은 다음 마일스톤 가드(PR 템플릿/검사 스크립트)로 **제도화**한다

## 디자인 품질 루브릭 (UI 프로젝트)

4축: Design Quality 30% / Originality 30% / Craft 20% / Functionality 20% — [상세](docs/guides/design-quality-rubric.md)

---

## 실전 교훈 (portfolio-26, simple-shop 등에서 추출)

> **블록 내 포인터 포맷 컨벤션**: 각 실전 교훈 블록은 내용 불릿 → **회수 포인터 불릿** (`근거:` / `상세:`) → (선택) `일반화된 설계 지식:` 불릿 순서로 마감한다. `docs/architecture/` 나 `docs/decisions/` 로 승격된 지식이 있을 때만 마지막 포인터를 추가하고, 없으면 생략한다 (빈 placeholder 금지). 형식: `- 일반화된 설계 지식: [docs/architecture/<파일>.md](경로) — 한 줄 요약` (축약 `일반화:` 금지 — #1047). 본 컨벤션은 **작성 순서**를 규정하고, 형식 충족의 **계수 술어** (`^- (근거|상세):`) 는 [claudemd-governance.md](docs/guides/claudemd-governance.md) §2.1 이 정본이다 — 승격 포인터는 회수 키가 아니라 계수 대상 밖이다. 근거: PR [#113](https://github.com/coseo12/harness-setting/pull/113) reviewer 권고 3, 이슈 [#114](https://github.com/coseo12/harness-setting/issues/114) / [#1047](https://github.com/coseo12/astro-simulator/issues/1047).

### 빌드 성공 ≠ 동작하는 앱
빌드/단위 테스트 통과 ≠ 브라우저 동작. 커밋 전 **3단계 브라우저 검증 의무**:
1. **정적**: 이미지 로드 / 콘솔 에러 0 / 모바일·데스크톱 레이아웃
2. **인터랙션**: 버튼·링크·검색·필터·폼
3. **흐름**: 네비게이션 → 페이지 → 데이터 연동, URL ↔ 상태 동기화

> 스크린샷 = Level 1. "렌더링 = 동작" 아님.

- 상세: 변형 3종 — **monorepo dist stale** ([docs/lessons/monorepo-dist-stale.md](docs/lessons/monorepo-dist-stale.md), volt #70) / **엄격 원칙 + 동적 적응 부재** ([docs/lessons/strict-principle-dynamic-context.md](docs/lessons/strict-principle-dynamic-context.md), volt #68) / **DoD PASS ≠ 제품 동작** ([docs/lessons/ux-dod-vs-product-behavior.md](docs/lessons/ux-dod-vs-product-behavior.md), volt #72/#74)

### CI 통과 ≠ 테스트 실행
"언어 자동 감지" 범용 CI 템플릿이 `echo` 만 수행하고 실제 `npm test` 를 돌리지 않는 경우 — 초록 체크 머지 뒤에도 테스트 미실행. 실행 시간/Actions 로그/CI 구조 3개 진단 신호로 감지, 고의적 실패 PR 실측으로 게이트 작동 확인.
- 상세: [docs/lessons/ci-and-downstream-verification.md](docs/lessons/ci-and-downstream-verification.md)

### 다운스트림 실측이 최종 가드 — upstream 3중 방어 blindspot
upstream 의 단위 테스트 / reviewer / cross-validate 3중 방어가 통과해도 다운스트림 환경 매트릭스에서만 드러나는 결함 존재. release 를 막는 대신 **역방향 피드백 속도 최대화**. "N 적용 시나리오" 근거는 `[실측]` / `[가정]` 라벨 부착 + 박제 문턱 (실측 ≥ 1 + 가정 ≥ 3 + 공통 조건 매트릭스) 충족 필수 (#195).
- 상세: [docs/lessons/ci-and-downstream-verification.md](docs/lessons/ci-and-downstream-verification.md)

### workflow_dispatch 2단계 함정 (GitHub Actions)
`workflow_dispatch` 트리거는 default branch 반영 후에만 discover 된다 (feature/develop push 로는 실행 불가). 추가로 PR 자동 생성 workflow 는 저장소 Settings `can_approve_pull_request_reviews` 가 기본 OFF 라 거부된다. 도입 PR DoD 에 "default branch 반영 후 실행 검증" 명시.
- 상세: [docs/lessons/workflow-dispatch-pitfalls.md](docs/lessons/workflow-dispatch-pitfalls.md)
- **함정의 양면성 — release 가속 트리거 변형 (volt [#97](https://github.com/coseo12/volt/issues/97))**: 검증 차단이 사용자에게 release 결정 강제 노출하는 부산물 + 자연 리듬 정렬 효과. 단 모든 차단이 정당화 아님 — 누적 < 10 커밋이면 옵션 B (대기) / C (cherry-pick) 합리. release-cadence-check workflow 신설로 함정 의존 제거 가능.

### 셸 경유 마크다운·코드 전달 — metachar 함정 (volt #114 / #996)
대상은 **명령 이름이 아니라 문자열이 셸 파서에 리터럴로 닿는 경로** — `gh` 계열뿐 아니라 **`git commit -m`** 도 같은 클래스다. 큰따옴표가 `<` `>` `;` `|` `&` 는 격리하지만 **최소 `` ` `` · `$` · `\` · `"` 넷은 관통**하며 (닫힌 열거 아님), 이들은 **exit 0 인 채** 본문 일부를 지운 채 영구 박제한다 — 축이 둘이라 **치환·확장** (`` ` `` `$`) 만 세면 **소실** (`\` `"`) 을 놓친다. Node.js 는 `spawnSync('gh', [...args])` + `--body-file -` + `{ input: body, stdio: ['pipe', 'inherit', 'inherit'] }`, **셸 직접 타이핑** (에이전트 Bash 도구) 은 넷 중 **하나라도 있으면** `--body-file -` / `git commit -F -` + **따옴표 친 heredoc** (`<<'EOF'`) 의무.
- 상세: [docs/lessons/gh-cli-execsync-pitfall.md](docs/lessons/gh-cli-execsync-pitfall.md) — 사거리 판정 (`gh issue create` · `gh issue comment` 의 `--body` / `--title` 포함) / 회귀 가드 기각 3축

### 주석 계약 vs 구현 drift — 버그 생성원
파일 상단 주석 / JSDoc 이 선언한 계약과 구현의 drift 는 **버그 생성원**. default fallback 이 누락을 조용히 흡수해 테스트도 fail 하지 않는다. 주석에 선언된 규칙은 테스트 커버리지 대상이며, enum 분기 fallback 에 경고·assert 추가로 drift 감지.
- 상세: [docs/lessons/comment-implementation-drift.md](docs/lessons/comment-implementation-drift.md)
- **숨은 상수 변형 (volt [#69](https://github.com/coseo12/volt/issues/69))**: 위성 모듈 독립 선언 잔존 → 상대 비율/단위/스케일 drift 조용히 생성. 저장소 전체 `git grep -F "<CONST_NAME>"` + 주석 SSoT 참조 dead reference 차단 의무 (reviewer.md §4).
- **drift 근본 제거 — 자동 생성 vs 정적 가드 구분 (volt [#120](https://github.com/coseo12/volt/issues/120))**: "drift 감지"(매칭 가드)보다 "중복 출처 제거"(데이터 메타 SSoT + 자동 생성)가 근본 해결. 단 사본마다 격리성/직교 축이 달라, **자동 생성 가능**(단일 메타 파생 + 소비처의 SUT import 허용)과 **정적 가드로 묶어야 함**(테스트 더블 격리 위반 / 직교 축은 별도 boolean 메타 + "데이터 파생 == 하드코딩" 단위 테스트)을 구분하는 게 핵심 판단. 상세: [docs/lessons/data-not-code-extension.md](docs/lessons/data-not-code-extension.md).

### HTTP 200 ≠ 올바른 리소스
- 이미지 URL이 200을 반환해도 **내용이 의도와 다를 수 있다**
- `next/image` 프록시는 쿼리 파라미터 포함 URL에서 실패할 수 있다
- 외부 리소스는 반드시 다운로드하여 내용을 직접 확인한다

### display-only 버그 패턴
AI가 생성하는 코드에서 반복되는 실패 패턴:
- UI가 존재하지만 이벤트 핸들러가 없음 (버튼 렌더링만, 클릭 미동작)
- 조건 논리 버그로 삭제/수정이 실제로 반영되지 않음
- 입력 필드가 사용자 입력에 반응하지 않음

### 프로젝트 재구축 시 주의
`rm -rf`로 재구축 시 사용자 터미널의 cwd가 삭제된 디렉토리를 가리킬 수 있다.
반드시 사전 경고한다.

### 인계 항목 실측 재검증 — NO-OP ADR 패턴
인계 "수정 필요 항목" 이 환경 변화로 착수 시점 이미 해소된 경우 — 실측 → NO-OP ADR (`docs/decisions/<YYYYMMDD>-<topic>-no-op.md`) + 회귀 가드. Explore 미결정 시 debug 스크립트 (`scripts/_debug-<topic>-tmp.mjs`, 즉시 `rm`) 로 runtime 실측 선행.
- 상세: [docs/lessons/no-op-adr-pattern.md](docs/lessons/no-op-adr-pattern.md)
- 근거: volt [#14](https://github.com/coseo12/volt/issues/14) / [#67](https://github.com/coseo12/volt/issues/67)

### 신규 함수 ≠ 신규 구현
새 함수/헬퍼/유틸리티를 쓰기 전 "이미 있을 수 있다"를 기본 가설로 둔다. AI는 "없다"고 가정하고 바로 구현으로 들어가는 편향이 있어, 이전 마일스톤에서 구축된 공용 함수를 재발견하지 못한 채 중복 코드와 테스트를 생성한 사례가 반복된다.

- 구현 착수 전 `Grep`으로 함수명·핵심 키워드 검색 (예: `stateVector`, `velocity.*orbital`, `parse.*X`)
- 같은 패키지의 `index.ts` export 목록을 먼저 훑는다 — 한 파일만 봐도 재사용 대상이 드러나는 경우가 많다
- 중복을 발견하면 미련 없이 삭제하고 기존 함수 import로 대체 (sunk cost 편향 경계)
- 근거: volt [#21](https://github.com/coseo12/volt/issues/21) — 50줄 + 테스트 70줄 작성 후 동일 기능 함수가 동일 패키지에 이미 존재함을 발견한 사례

### 신규 데이터 ≠ 신규 코드 — ADR 예측 재현
레이어/플러그인/스키마 구조에서 "데이터만 추가, 코드 변경 0" 예측을 ADR 에 Concrete Prediction 으로 박제하고 `git diff --stat` 로 실측 재현. 예측 성공은 추상화 건강성의 구체 증거, 실패는 리팩토링 필요 신호.
- 상세: [docs/lessons/data-not-code-extension.md](docs/lessons/data-not-code-extension.md)

### 커밋 성공 ≠ 의도한 변경 커밋됨
`git commit` 종료 코드 0과 "커밋 성공" 메시지만 믿지 말 것. 특히 lint-staged + tracked/ignored 혼재 상황에서 staged 변경 일부가 **조용히 유실**될 수 있다.

- lint-staged 출력에서 `[FAILED]` 키워드를 발견하면 **커밋 후 필수 검증**
- 커밋 직후 `git diff <base> HEAD -- <예상 파일 목록>` 또는 `git show --stat HEAD` 로 실제 반영된 파일 확인
- `.gitignore` 규칙을 새로 추가할 때는 `git ls-files <path>` 로 이미 tracked된 파일이 있는지 확인 후 `git rm --cached` 로 정리
- 근거: volt [#13](https://github.com/coseo12/volt/issues/13) — "빌드 성공 ≠ 동작", "HTTP 200 ≠ 올바른 리소스" 원칙의 연장선

### 매니페스트 최신 ≠ 파일 적용 완료 — 부분 실패 교착 복구
매니페스트 기반 패키지 관리자(Nix, brew, dpkg/apt 등)는 파일 적용과 해시 기록이 **원자적 트랜잭션이 아닐** 수 있어, 부분 롤백 시 "동일 상태" 오판 스킵이 **복구 불가능한 교착** 을 만든다.

- 상세: [docs/lessons/manifest-partial-failure-recovery.md](docs/lessons/manifest-partial-failure-recovery.md)
- 일반화된 설계 지식: [docs/architecture/state-atomicity-3-layer-defense.md](docs/architecture/state-atomicity-3-layer-defense.md) — 도중/사후/안내 3계층 직교 방어

### sub-agent 검증 완료 ≠ GitHub 박제 완료
sub-agent(dev/qa 페르소나 등) 는 **검증** 까지는 신뢰하되 **박제** (커밋/푸시/PR 생성/`gh pr comment`/auto-close) 는 신뢰하지 말 것. sub-agent 보고는 *의도* 이고 실제 외부 가시성은 별도. 메인이 `git log --oneline -1` / `gh pr view` / `gh issue view --json state` 로 직접 확인.

- 상세: [docs/lessons/sub-agent-ssot-handoff.md](docs/lessons/sub-agent-ssot-handoff.md) — **공통 SSoT 9 필드 + 메인 게이트 + bg 인계 + base=develop 함정** 통합
- **SSoT 동기화 자동 가드** (#145, v2.23.0~): 9 필드는 5 에이전트 `.md` 의 체크리스트 JSON 에 그대로 등장해야 하며 `scripts/verify-agent-ssot.sh` 가 CI `detect-and-test` 에서 drift 차단. SSoT 블록 수정 PR 은 5 에이전트 파일 동시 갱신 + 로컬 verify 사전 확인 필수.
- **`--edit-last`·`--delete-last` 금지** (#1099 — 실사고 #1082): `gh issue comment`·`gh pr comment` 의 두 플래그는 「그 이슈/PR 의 마지막」이 아니라 **「인증 사용자가 마지막으로 단」** 코멘트를 잡는다. 메인과 전 sub-agent 가 같은 `gh` 인증을 공유해 API 가 둘을 **구별하지 못하므로**, 병행 중이면 **남의 코멘트를 exit `0` 인 채 덮어쓰거나 지운다**. **메인도 가해자다** — 이 규칙이 여기 있는 이유이고, 에이전트 쪽 박제(5 파일)만으로는 축이 하나 빈다. 갱신은 **새 코멘트** 또는 `gh api -X PATCH …/issues/comments/<id> -F body=@-` (`-f` 는 리터럴 `@-` 가 박히는 silent 버그).
- **메인 오케스트레이터 단계 게이트** (volt [#77](https://github.com/coseo12/volt/issues/77)): `developer → reviewer → qa → 사용자/머지` 순서 강제. 상세: [docs/lessons/headless-browser-verification.md](docs/lessons/headless-browser-verification.md)
- **qa 게이트 예외 규약** (#915 — 전례 PR #910/#911/#916/#917 추출): 메인은 아래 4조건 **전건 충족** 시에만 qa 디스패치를 생략할 수 있다. (a) **앱 runtime 표면 0** — docs·리포 자산 / CI·workflow 설정 / 인프라 스크립트 전용, `apps/**`·`packages/**` 소스 무접촉을 diff 로 실증 (소스 = 빌드·번들 유입 경로. `apps/*/scripts/**` 검증 스크립트는 인프라 범주) (b) **동적 검증 대체 실증** — 본 PR CI run 가드 실발화 / 실 스크립트 1회 실행 / reviewer 독립 재현 등, **변경 대상의 동작을 직접 발화시킨 구체 증거** 명시 의무 ("docs 라서 생략"·"CI green 이니 충분" 단독 사유 금지 — CI green 은 실행 사실이지 대체 실증이 아님) (c) **근거 코멘트 박제** — `## qa 게이트 예외 판단` 제목으로 (a)(b) 근거를 PR 코멘트에 박제 (d) **메인 직접 전이** — `stage:qa → stage:done` 은 메인이 직접 수행. **예외 불가 (정식 qa 의무)**: runtime 의존/라우팅/렌더 경로 변경 (next 업그레이드 #906 / i18n 라우팅 #914 전례), runtime 의존성·lockfile 갱신, 시각 효과 (실 Chrome GUI 수동 검증 별도 의무 — 아래 headless 교훈). **회색지대**: 검증 스크립트 (`scripts/**` 로직) 수정은 해당 스크립트 실제 1회 실행 로그 박제 시에만 예외 허용 (#911/#917 전례, 실행 증거 요구는 #916), 에이전트 행동 규칙 (`.claude/**`) 은 SSoT·정적 가드 실발화가 대체 실증. **Fail-safe**: 4조건·회색지대 판정이 조금이라도 애매하면 정식 qa 디스패치 (비용 절감 < 회귀 차단 — cross-validate 2026-08-01 반영)

### sub-agent multi-turn 라운드 이탈 — 매트릭스 일관성 검증
sub-agent 에 multi-turn 세션 위임 시 세부 매트릭스가 다음 라운드에서 이탈. SendMessage 는 **이전 라운드 매트릭스를 본문에 인라인 재첨부** ("권고 A" 참조 레이블만으론 부족). 메인 오케스트레이터가 핵심 키워드 대조로 이탈 즉시 감지. PM 재계약 시 DoD 자체 재구조화 금지 — 사용자 응답은 파라미터만 조정.
- 상세: [docs/lessons/sub-agent-multiturn-drift.md](docs/lessons/sub-agent-multiturn-drift.md) (라운드 이탈 / PM DoD drift 재현 / 예방 규약) — volt [#34](https://github.com/coseo12/volt/issues/34) / [#76](https://github.com/coseo12/volt/issues/76)

### headless 브라우저 검증 ≠ 실 브라우저 동작
`agent-browser` / Playwright headless (특히 swiftshader adapter) 는 3D/WebGPU 경로에서 부분 freeze 로 false positive 를 낸다. "headless 8/8 PASS" 만 믿지 말 것. 시각 효과 포함 작업은 `status:review` 전 **실 Chrome GUI 수동 검증 최소 1회** 필수. CRITICAL #3 의 확장.
- 상세: [docs/lessons/headless-browser-verification.md](docs/lessons/headless-browser-verification.md)

### 가드 도입 PR DoD — 4축 검증 의무
신규 `verify-*.sh` + CI step 등 negative-test 성격 가드 도입 PR 은 positive PASS 만으론 작동 보장 불가. 4축 명시: (1) 격리 동적 테스트 / (2) 3중 시뮬레이션 (positive→negative→recovery) / (3) 5 페르소나 self-consistency N×5 셀 결정적 일치 / (4) 메타 측정 도구 자기 적용 안정성. harness `verify-agent-ssot.sh` (#145) 도입 시 3중 시뮬레이션 누락 회고 포함.
- 상세: [docs/lessons/guard-pr-dod.md](docs/lessons/guard-pr-dod.md) — volt [#96](https://github.com/coseo12/volt/issues/96) / [#100](https://github.com/coseo12/volt/issues/100) / [#109](https://github.com/coseo12/volt/issues/109) / [#112](https://github.com/coseo12/volt/issues/112)

### 가드 설계 원칙 — measurement-first / 의식적 silent 약화 / fail-fast
가드 무력화 3축 (설계/구현/운영) 차단: (1) architect broad 권고 → dev D1 실측 false-positive → precision 정정 3중 박제 (measurement-first), (2) 발화 빈도 ≥ 1/주 시 의식적 silent 약화 + ADR §결정 CRITICAL 명시, (3) drift 가드는 fail-fast 만 — fallback 분기 절대 금지 (strict assertion 자기모순 회피).
- 상세: [docs/lessons/guard-design-principles.md](docs/lessons/guard-design-principles.md) — volt [#101](https://github.com/coseo12/volt/issues/101) / [#106](https://github.com/coseo12/volt/issues/106) / [#107](https://github.com/coseo12/volt/issues/107)

### 세션 중단 dead-wait 방지 — 스케줄러 heartbeat 3계층 가드
세션 재시작 시 waiter 는 소멸하고 대기만 남는다 (무인지 침묵).
- **행동 규약 (메인)**: 대기 진입 = fallback `ScheduleWakeup`(1200~1800s) 예약 + 상태파일 append 를 **원자 단위**로. 훅 경고 시 **재개 금지** — `상태 조회 → 생사 판단 → 항목 제거/재개`.
- 상세: [dead-wait-guard.md](docs/lessons/dead-wait-guard.md) — volt [#121](https://github.com/coseo12/volt/issues/121)
- 일반화된 설계 지식: [state-atomicity-3-layer-defense.md](docs/architecture/state-atomicity-3-layer-defense.md) — 도중/사후/안내 3계층 직교 방어

## 프로젝트 고유 보강 교훈

> 본 섹션은 프로젝트 고유 해결책/가드를 박제한다.

Z 패턴: **폐기** (2026-07-31, #907 / ADR [20260731-907-harness-decouple.md](docs/decisions/20260731-907-harness-decouple.md)). 이력: ADR 20260515 (Superseded).

### 프로젝트 접근 — Incremental Body-by-Body Build (v3)

2026-04-25 기획 전면 재구성. Fact-First 원칙 / 로드맵 v2 / P10~P12 ADR (scale unification 포함) 전부 폐기 (`docs/deprecated/`). **태양부터 하나씩** 사용자가 명시적으로 visible 하게 incremental build. 각 R-Phase DoD 는 "사용자가 실제로 보이는 body" 중심. 로드맵: [`docs/phases/roadmap-v3-incremental.md`](docs/phases/roadmap-v3-incremental.md) (**완주** 2026-06-12, R10b #664) → 현행 [`docs/phases/roadmap-track-ab.md`](docs/phases/roadmap-track-ab.md) (v3 완주 이후 트랙 A 몰입 / B 온보딩 작업 축 + 후보 백로그, #794).

- **폐기 배경**: P12 Display-Relative Scale Unification 후 기본 진입 화면이 궤도 라인 + 해왕성 1개만 보이는 빈 상태로 UX 회귀. DoD 수치는 모두 PASS 였음 (volt [#74](https://github.com/coseo12/volt/issues/74) 근거)
- **유지 대상**: Floating Origin (`20260422-floating-origin.md`), LOD 3단 (`20260424-p11-b-lod-design.md`), Tier 네이밍 정책 (`20260424-tier-naming-policy.md`), Tier Preset 설계 (`20260424-tier-preset-design.md`) — 기술 가치 유지
- **참고 (폐기)**: `docs/deprecated/principles/fact-first.md`, `docs/deprecated/phases/roadmap-v2-solar-precision.md`, `docs/deprecated/phases/p10-plan.md`, `docs/deprecated/decisions/20260423-display-relative-scale-unification.md`
- **횡단 원칙**: [`docs/architecture/principles.md`](docs/architecture/principles.md) §1 **Visual Fidelity** — 데이터 SSoT 보존 + rendering 시점 왜곡 허용. R-Phase ADR 박제 시 §의무 체크리스트 4항목 적용 (#541, R4 cross-validate 후속)

### sub-agent 이탈의 프로세스 레벨 확장 — cargo/next dev 좀비 누적

- **sub-agent 반환 직전**: 띄운 PID → `spawned_bg_pids`, 미확인 시 `bg_process_handoff` 인계. `agent-browser` 사용 시 `bash scripts/cleanup-browser.sh` **기본 모드** (전량 pkill 금지 — 병행 오살 방지 #926). `--all` 은 **병행 브라우저 작업 부재 확인 후** **메인 전용**.
- **메인, 복귀 직후**: `ps -axww -o pid=,etime=,command= | grep -E "cargo|next dev|physics_wasm-" | grep -v grep` + `pgrep -f "agent-browser-chrome[-]"` (bracket **유지 필수** + **`-a` 금지** — #1054) → 세션 이전 것만 정리. 자기 오탐은 **조상 셸 축**(`-a` 가 유입 → `-a` 제거로 해소)과 **형제 subshell 축**(비-exec fork 의 argv 상속 → `-a` 제거로 **안 없어짐**)의 직교 2축이다. bracket 은 두 축 모두 **argv 순도 조건부**로만 막고(명령행에 un-bracketed 리터럴이 없어야 함), `grep -v grep` 은 **순도와 무관하게** 둘 다 막는다. ETIME 은 `[[dd-]hh:]mm:ss` — 전환점이 1시간이라 `30~59분` 도 2필드(`mm:ss`)다.
- 상세: [zombie-process-guards.md](docs/ops/zombie-process-guards.md) — volt #24 / #79

> **잔여 계약** (#980): 본 절(위 `--all` 전제 포함) 의 가드 A~C 는 **행동 규칙만** 남기고 서사는 [zombie-process-guards.md](docs/ops/zombie-process-guards.md) 로 이관. **인간-루프 의무(사용자 보고·확인)는 잔여 필수** — 1차 이관이 8회→1회로 강등시킨 전례.

#### 가드 A — 메인 spawn 시점 lsof 선행

장기 프로세스 spawn **직전** 사용 포트(3000/4000 등) `lsof -i :$PORT` 의무 — 좀비가 HTTP 응답해 "ready" 오인 (#440). 점유 시 `ps -p $(lsof -t -i :$PORT) -o pid,etime,command` → 좀비 인지 + **사용자 보고·확인 후** 정리·재시작 (kill 승인 게이트).

#### 가드 B — sub-agent-confirmed-done 카나리아

포트 사용 sub-agent 복귀 직후 **보고와 무관하게** 위 명령 1회. `spawned_bg_pids` 는 자기 spawn PID 만 추적 → 이전 세션 좀비는 추적 밖 (`"sub-agent-confirmed-done"` 도 정의상 정합 PASS). **ETIME ≥ 30분 = 이전 세션 좀비 의심** (가드 C hook / `qa.md` — 3곳 SSoT). 발견 시 **사용자 보고 + 정리 후** 다음 작업.

#### 가드 C — 세션 시작 hook

`.claude/hooks/session-start-zombie-check.sh` (SessionStart hook) 이 ETIME 30분 이상 dev/test 프로세스를 경고. 회귀 차단 `verify-zombie-check.mjs`. 경고 시 **사용자에게 정리 권고**.

#### 가드 D — 세션 중단 dead-wait (대기 라이프사이클 + fallback heartbeat)

가드 A/B/C 가 **좀비 프로세스**(포트 점유·CPU 폭주)를 다룬다면, 가드 D 는 **대기 라이프사이클** 을 다루는 직교 확장이다. 행동 규약은 §실전 교훈 dead-wait 블록, 상세는 [docs/lessons/dead-wait-guard.md](docs/lessons/dead-wait-guard.md).

### 반복 운영 마찰 원인 박제 (#795)

매 세션·릴리스 반복되던 저비용 마찰의 **구조 원인 + 표준 절차**는 [`docs/ops/operational-friction.md`](docs/ops/operational-friction.md) 에 박제한다. 아래는 **접촉 빈도가 높은 것만 추린 발췌**이고 **절 목록의 정본은 그 문서다** — 절이 늘어도 이 목록은 갱신 의무가 없다 (하드코딩 계수가 drift 생성원이었다, #1149):

1. **squash auto-close 미발동** — GitHub **네이티브** auto-close 는 default branch(main) 머지만. `base=develop` 은 구조적 미발동이나 `auto-close-issues.yml`(#915)이 대체 → 메인은 `gh issue view <N> --json state` 로 **결과만 확인**, OPEN 이면 폴백 수동 close (§1-1 미발동 조건).
2. **`gh pr merge --delete-branch` worktree 충돌** — Conductor 멀티 워크스페이스 브랜치 점유 → `--delete-branch` **생략** + `git push origin --delete <branch>` 분리.
3. **pgrep self-match 오탐** — `pgrep -f "패턴"` 이 자기 셸 명령행 매칭 → **bracket `[-]`** (`agent-browser-chrome[-]`). pkill 은 자기 셸 kill 위험이라 **안전 개선**. hook 은 `grep -v` 로 이미 안전. ⚠️ 자기 오탐은 **직교 2축** (#1054): **조상 셸**(macOS `pgrep -a` 가 유입 — **`-a` 금지**) + **형제 subshell**(비-exec fork 의 argv 상속 — `-a` 제거로 안 없어짐). bracket 은 두 축 다 **argv 순도 조건부**라 좀비 카나리아 정본은 **순도와 무관하게** 둘 다 막는 `ps … | grep -E … | grep -v grep` (§3).
4. **concurrency CANCELLED = 코스메틱** — `cancel-in-progress`(#779) 로 superseded run 이 `CANCELLED`/UNSTABLE 표기. 각 체크 최신 run 이 SUCCESS 면 안전(§릴리스 판별법).

⚠️ **worktree·본문 편집 경로에서 매번 밟는 절차가 같은 문서에 더 있다** — §7 `npx prettier` 버전 skew(코드 스팬 손상) · §8 워크스페이스 의존 명령 결손(`pnpm build` 선행) · §9 백틱 본문의 **셸 명령 치환**(stderr·종료 코드·U+FFFD **세 축이 동시에 무효**이고 유효 명령이면 **실행·주입**된다) · §10 `--body-file` **stale 업로드 3박자**. §7·§8 은 [`developer.md`](.claude/agents/developer.md) 가 이미 「절차 SSoT」로 참조한다.

---

## 검증 강도 게이트 (2026-08-16)

**PR 의 검증 강도를 변경 성격에 맞춘다.** 전 PR 에 풀 파이프라인을 걸면 인프라 작업이 제품 작업을 밀어낸다 — 실측: `type:feat` 이슈 **27(6월) → 5(7월) → 0(8월)**, 8월 머지 PR **60건 중 앱 소스 접촉 1건**.

| 변경 성격 | reviewer | cross-validate | qa |
| --- | :---: | :---: | :---: |
| `apps/**`·`packages/**` **소스** 접촉 | 필수 | 필수 | **정식 qa** |
| 가드·CI·`scripts/**` 로직 | 필수 | 트리거 시 | §915 예외 (실행 로그) |
| 문서·ADR·CHANGELOG 전용 | **메인 자체 검증** | 트리거 시 | §915 예외 |

- **소스 접촉 판정** (표 셀 밖 — 이스케이프 금지, #1079):

  ```bash
  gh pr diff <N> --name-only \
    | grep -E '^(apps|packages)/' \
    | grep -vE '^apps/[^/]+/scripts/' \
    | grep -cE '\.(ts|tsx|jsx|js|mjs|cjs|rs|wgsl|css)$|/package\.json$|/Cargo\.toml$'
  ```

  3단으로 나눈 이유 — ① `-P` 부정 전방탐색은 **이식성이 낮다**(BSD/GNU 차) ② `apps/*/scripts/**` 제외는 §915 가 이미 *"검증 스크립트는 인프라 범주"* 로 규정한 것을 술어에 반영한 것이다(실측 `29`건) ③ 매니페스트(`package.json`·`Cargo.toml`)를 포함하는 것은 **의존성 변경이 런타임**이기 때문이다.
  ⚠️ **매니페스트는 과발화한다** — `scripts` 키만 바꾼 PR 도 잡힌다(예: PR #1111). **fail-safe 방향이라 그대로 둔다.** 강도를 낮추려면 근거 코멘트에 *"`dependencies`·`devDependencies` 무변경"* 을 diff 로 실증하고 메인이 판정한다.
  ⚠️ `grep -c` 는 **0 매칭 시 exit `1`** 이다. `set -e`/`pipefail` 스크립트에 넣을 땐 `|| true` 를 붙인다 (단독 실행용 명령이라 위 형태는 그대로 쓴다).

- **루트 설정**(`/package.json` · `/tsconfig.json` · `pnpm-lock.yaml` · `.github/**`)은 위 술어에서 `0` 이며 **2행(가드·CI)** 으로 간다. 단 **`pnpm-lock.yaml` 변경은 §915 «예외 불가»** 라 qa 는 정식이다.

- **범위 밖 발견의 기본 처분은 «PR 코멘트 기록»** 이다. 이슈는 **실피해가 관측됐을 때** 만든다 — 「이론적으로 뚫린다」는 발견은 `deferred:no-incident` 라벨로 격리한다. **가드를 하나 만들 때마다 그 가드를 검사할 표면이 하나 늘어나므로, 발견을 전부 이슈화하면 루프가 수렴하지 않는다.**
- **예외** — 실사고가 이미 발생한 건은 성격 무관 풀 파이프라인.
- **`deferred:no-incident` 수명주기** — 무기한 방치를 막는다. **해당 컴포넌트를 다음에 건드릴 때** 그 이슈를 함께 재판정하고, 그 시점에도 실피해가 없으면 **`wontfix` 로 close** 한다. 즉 해제 트리거는 시간이 아니라 **접촉**이다 (시간 기준은 또 하나의 추정 임계가 된다 — ADR `20260816-850` 결정 1 과 같은 논거).

---

## 교차검증 (cross-validate)

- **박제 직후 1회 루틴** — 정책·ADR·CRITICAL DIRECTIVE 박제 직후 1회 호출. 실패 시 스킵 + **"Claude 단독 분석" 명시** (경량 모델 폴백 금지)
- 결과는 Claude 가 **재분석** (맹목 수용 금지). 고유 발견이 스프린트 **비목표**와 상충하면 후속 이슈 분리 — 비목표 무시는 CRITICAL #6 침범
- 상세: [docs/guides/cross-validate-protocol.md](docs/guides/cross-validate-protocol.md)

---

## 원칙

### 우선순위
```
사용자 명시적 지시 > 프레임워크 기본 원칙
```
예외: 보안 취약점, 데이터 손실이 예상될 때만 경고 후 사용자 확인

### 모호한 지시 대응
"리뉴얼", "개선" 등 범위가 넓은 지시 → 작업 전 범위를 사용자에게 제시하고 확인
- 보수적 해석 편향 금지
- 기존 코드 보존 관성 금지
- 확신이 없으면 3번 재작업보다 1번 질문

### 릴리스
- **SemVer 분류** (판정 애매 시 낮은 쪽): **MAJOR** = 하위 호환 파괴 / **MINOR** = 코드 **또는 에이전트 행동**의 신규 기능·행동 변화 / **PATCH** = **행동 변화 없는** 문서·문구 변경, 버그 수정
- **판정 질문**: 이 변경으로 에이전트가 같은 입력에 다르게 동작하는가? 예 → MINOR, 아니오 → PATCH
- MINOR/MAJOR 는 CHANGELOG `### Behavior Changes` **필수**. PATCH 도 `.claude/` 변경 시 `### Behavior Changes: None — 문서/문구만` 명시
- 상세 (예시 / Phase 분리 리듬 / version bump / 근거): [docs/guides/release-process.md](docs/guides/release-process.md)

### CLAUDE.md 예산 (각인층)
신규 블록 전 **① 동일 주제 `docs/` 파일 존재?** (있으면 포인터만) → **② 안 읽으면 즉시 오작동?** (아니오 → `docs/`). 33k 경보 / 40k PR warn / 45k fail: `verify-claudemd-size.mjs` — [governance](docs/guides/claudemd-governance.md). 근거 링크(볼트 번호)는 자르지 않는다 — `grep` 도달 불가능한 유일 회수 키

### 문서 동기화
- 에이전트/스킬/설정을 삭제하거나 변경할 때, docs/ 하위 관련 문서를 확인하고 업데이트한다
- 삭제된 구성요소를 참조하는 문서가 남아 있으면 안 된다

### 파일명 규칙
- **기본**: kebab-case (`user-profile.ts`, `api-client.js`)
  - 이유: macOS APFS(case-insensitive) ↔ Linux(case-sensitive) 간 유령 파일/충돌 방지
- **예외** (언어·프레임워크 관습 우선):
  - React/Vue/Svelte 컴포넌트: `PascalCase.tsx`
  - Python 모듈: `snake_case.py` (PEP 8)
  - Java/Kotlin 클래스: `PascalCase.java`
  - 프레임워크 특수 파일: `page.tsx`, `layout.tsx`, `[id].tsx`, `Dockerfile`, `Makefile`, `README.md` 등 관습 고정값
- **기존 파일 수정·추가 시**: 주변 디렉토리의 기존 컨벤션을 따른다 (일관성 > 규칙)

### 모노레포 가드
- 신규 워크스페이스(apps/*, packages/*) 추가 시 **테스트 설정(vitest/jest config + scripts.test) 필수**
- `pnpm -r test` / `npm -ws test` 는 scripts.test 누락 워크스페이스를 **조용히 스킵**한다 — 사고 방지를 위해 루트에 `verify:test-coverage` 스크립트(각 워크스페이스에 테스트 설정 존재 검사) 운용을 권장
- 신규 패키지 스캐폴딩 시 테스트 베이스를 기본 포함시킨다

### 아키텍처 결정 기록 (ADR)
- 코어 기술 스택 선택(언어/런타임/프레임워크/주요 라이브러리)을 도입·교체할 때는 `docs/decisions/<YYYYMMDD>-<topic>.md` 로 ADR을 남긴다
- 섹션: **배경 / 후보 비교(축별) / 결정 / 결과·재검토 조건**
- 프로젝트별 고유 패턴(상태 관리, 씬 동기화 등)도 추후 에이전트가 참조 가능하도록 `docs/architecture/` 또는 해당 프로젝트 CLAUDE.md에 명시 기록한다
- 프로젝트 고유 용어 (D-T2 / R-Phase / Tier / Floating Origin / EIH 등) 는 [`docs/glossary.md`](docs/glossary.md) 에 일괄 정의 (#449) — ADR 본문 첫 등장 시 glossary 링크 권장

#### ADR Status 워크플로 (Provisional → Accepted, 부분 도입 — #370 옵션 C)

- 기본: 단순 결정 ADR (NO-OP / Phase 진입 / 라이브러리 채택 등) 은 **Accepted 직접 박제**
- 예외 (Provisional 의무): **cross-validate 발동 ADR** (`## 교차검증` 의 박제 직후 1회 루틴 대상 — CRITICAL DIRECTIVE 개정 / ADR 신규·개정/폐기 / MINOR 이상 릴리스 Behavior Changes / 프로젝트 원칙·철학 선언) 은 cross-validate 결과 본문 통합 전까지 **Provisional** 박제. 통합 후 Accepted 전이
- 전이 절차: ADR 메타데이터 `상태: Provisional` → `상태: Accepted (cross-validate <YYYY-MM-DD>)` 명시. §교차검증 반영 사항 4축 분류 (합의 / 이견 / 고유 발견 / Claude 편향 셀프 체크) 박제 후 전이
- 근거: #370 (R3 cross-validate Gemini 고유 발견 — ADR 머지 시점 cross-validate 결과 미통합 잠재 위험)

#### ADR 본문 시각 자료 embed 표준 (#382)

forensic ADR 의 측정 데이터 (스크린샷 / 차트 / diagram) 는 별도 파일 박제 + ADR 본문 markdown image embed (`![desc](../reports/<이슈>-debug-<resolution>.png)`) 형식. ADR 단독 가독성 보장 — GitHub 렌더링에서 측정 시각 자료가 본문에 보임.

- 적용 대상: 모든 forensic ADR (§Forensic 측정 결과 섹션) + 시각 자료가 있는 일반 ADR
- 위치: 측정 데이터 표 직전 또는 직후
- 표준 alt text: `<이슈번호> <측정 이름> <viewport 또는 시나리오>` (예: `373 forensic 측정 1280×720`)

#### Forensic ADR 변형 (복잡 회귀 전용)

단순 기술 선택과 달리 **다중 가설 + runtime 측정 + 사용자 인지 단위 ↔ 박제 단위 mismatch** 가 있는 회귀는 일반 ADR 4섹션으로 부족. 아래 5조건 중 **3개 이상** 충족하면 forensic 변형 사용 — [`docs/templates/forensic-adr-template.md`](docs/templates/forensic-adr-template.md) 의 8 섹션 구조 채택.

1. **가설 N≥2** — 단일 원인 확정 안 되고 후보 가설 비교 필요
2. **Runtime 측정 데이터 필수** — 정적 분석 + 코드 리뷰만으로 결정 불가, `scripts/_debug-<이슈>-tmp.mjs` (volt #67 패턴) 실측 선행
3. **DoD PASS 인데 사용자/제품 회귀** — 자동 검증 통과 + 실 사용 회귀 (volt #74, #76)
4. **5±2 옵션 비교** — 단순 채택/기각이 아닌 (a)~(e) 옵션의 축별 trade-off 비교
5. **Amendment 라운드 N 예상** — cross-validate / 사용자 D-T2 후속 응답으로 결정이 갱신될 가능성

조건 미달 시 일반 ADR 사용 (forensic 변형 의 8섹션이 잡음). 판정 애매하면 **일반 ADR 로 시작 후 Amendment 1회 필요해지면 forensic 으로 승격** — 양방향 cross-link 박제.

- 모범 사례: [`20260430-r3-followup-body-proportion.md`](docs/decisions/20260430-r3-followup-body-proportion.md) (#373), [`20260509-380-zoom-camera-freeze-forensic.md`](docs/decisions/20260509-380-zoom-camera-freeze-forensic.md) (#380), [`20260504-411-r1-guard-shortcut-bar-forensic.md`](docs/decisions/20260504-411-r1-guard-shortcut-bar-forensic.md) (#411)
- 근거: #381 — #373 cross-validate Gemini 고유 발견 (의사결정 trace 가능성 + 재현 가능성 동시 확보 → 다른 복잡 회귀에도 모범)

### 한글 인코딩 검증
- 한국어가 포함된 파일을 Edit한 후, 깨진 문자(U+FFFD, �)가 없는지 확인한다
- 커밋 전 `grep -rn '�' <수정한 파일>` 실행을 권장한다
- 긴 한국어 텍스트를 Edit으로 삽입할 때 깨짐이 발생할 수 있으므로, 깨짐 발견 시 즉시 수정한다

### 금지 사항
- main 브랜치 직접 수정 금지
- 리뷰 없이 머지 금지
- 테스트 없이 PR 생성 금지
- `<type>/*`·`release/*-prep` PR 의 `base=main` 금지 — `base=main` 은 release PR(head=develop)/hotfix 전용
- hotfix 머지 후 `main → develop` merge-back 누락 금지 — 누락 시 §drift 감지 의 git 직접 점검에서 warn 으로 드러남
