# Claude Code 워크플로우 템플릿

<!-- harness:managed:critical-directives:start -->
## 🚫 CRITICAL DIRECTIVES (NEVER BYPASS)

**아래 규칙은 세션 초기화/신규 프로젝트 셋업/모호한 지시 상황에서도 예외 없이 적용된다.**
세부 근거는 하단 섹션에 있으며, 이 블록은 어텐션 환기용 요약이다.

1. **브랜치 보호** — `main` 직접 수정/푸시 금지. 모든 변경은 `feature/*` 또는 `fix/*` 브랜치에서 PR로만 반영.
2. **모호한 지시 사전 확인** — "리뉴얼", "개선", "셋팅해줘" 등 범위 불명 지시는 **작업 전** 범위를 사용자에게 제시하고 승인받는다. 보수적 해석으로 임의 진행 금지.
3. **UI 작업 3단계 검증** — 빌드/테스트 통과는 "동작" 증거가 아니다. 정적 → 인터랙션 → 흐름 3단계를 브라우저에서 확인 후 커밋.
4. **한글 인코딩 검증** — 한국어 포함 파일 Edit 후 `grep -rn '�'` 실행. U+FFFD 발견 시 즉시 수정.
5. **파괴적 작업 사전 경고** — `rm -rf`, force-push, DB drop 등은 사용자 cwd/데이터 영향을 사전에 고지하고 확인.
6. **스프린트 계약** — 구현 착수 전 검증 가능한 완료 기준 목록을 사용자와 합의한다.

> **세션 시작 시 자기 점검**: 새 대화에서 첫 작업을 시작하기 전, 본 블록을 인지했는지 확인하고 위반 가능성이 있는 경우 사용자에게 명시한다. 프레임워크 구성 이상이 의심되면 `harness doctor`를 실행한다.
<!-- harness:managed:critical-directives:end -->

---

## 개요
AI 에이전트 기반 개발 워크플로우 템플릿. 1인 개발자-AI 페어 프로그래밍에 최적화.

---

## 브랜치 전략 (classic gitflow)

> 과거 이력: v2.12.0 이전까지 `feature → develop` + `feature → main` 의 **dual PR** 변형을 썼고, 고비용으로 인해 2026-04-15 부터 `develop` 이 방치되는 drift 가 발생했다. v2.13.0 부터 정석 gitflow 로 복원 — 자세한 결정 근거는 [ADR 20260419](docs/decisions/20260419-gitflow-main-develop.md) 참조.

> **develop 의 두 가지 핵심 역할**: (1) **통합 스테이징** — 여러 feature 가 상호작용하는 기능일 때 main 으로 가기 전에 함께 동작하는지 검증하는 공간. tag trigger 로는 대체 불가. (2) **PaaS staging environment 매핑** — Vercel/Netlify/Amplify 등 브랜치 기반 자동 배포 도구에서 `main=production / develop=staging / feature/*=preview` 로 자연스럽게 매핑. 자세한 패턴: [docs/deployment-patterns.md](docs/deployment-patterns.md).

> **이 저장소 자체의 릴리스 vs 하네스 사용 프로젝트 릴리스**: 이 하네스 저장소는 수동 `git tag + gh release create` 방식이라 `main push = 배포` 가 아니다. 반면 하네스를 사용하는 웹 앱 프로젝트 대부분은 PaaS 자동 배포 (브랜치 기반 push 트리거) 를 쓴다. 양쪽 모두 **gitflow 브랜치 전략은 동일**하게 적용되며 배포 트리거만 다르다.

| 브랜치 | 역할 | 진입 경로 | 금지 사항 |
|---|---|---|---|
| `main` | **배포 anchor**. 태그된 릴리스만 존재 | `develop → main` **release PR** 로만 / `hotfix/* → main` PR | 직접 push 금지. feature/fix PR 의 `base=main` 금지 |
| `develop` | **개발 통합**. 모든 완성된 변경이 먼저 도착 | `feature/*`, `fix/*` PR / `main → develop` merge-back (hotfix 후) | 직접 push 금지 |
| `feature/<이슈번호>-<설명>` | 신기능 | `develop` 에서 분기 | `main` 대상 PR 생성 금지 |
| `fix/<이슈번호>-<설명>` | 개발 중 발견된 버그 수정 | `develop` 에서 분기 | `main` 대상 PR 생성 금지 |
| `hotfix/<이슈번호>-<설명>` | **prod 긴급 패치** | `main` 에서 분기. 머지 후 즉시 `main → develop` merge-back | 드물게 사용. develop merge-back 누락 금지 |

### 워크플로 3단계

**1. 일상 개발**
```
feature/123-xxx   (develop 에서 분기)
   ↓ PR (base=develop)
develop
```

**2. 릴리스 (MAJOR/MINOR/PATCH 공통)**
```
develop   (충분히 쌓이면)
   ↓ 단일 release PR (base=main, head=develop)
   ↓ merge commit 방식으로 머지 — gh pr merge <PR> --merge
main   (merge commit 이 develop tip 을 부모로 포함)
   ↓ git push origin main:develop   (fast-forward, force 아님)
develop  (main tip 과 완전 동기화)
   ↓ git tag vX.Y.Z + gh release create
```
- release PR 본문에 CHANGELOG 범위, Behavior Changes, 태그 계획 명시
- **release PR 은 반드시 `--merge` (merge commit) 방식으로 머지** — `--squash` 금지. squash 로 머지하면 main 에 새 커밋이 생겨 develop 과 diverge 하며 매 릴리스마다 merge-back PR 이 강제된다. merge commit 은 main tip 이 develop tip 을 직계 조상으로 포함하게 하여 **merge-back 이 불필요**해진다. 결정 근거: [ADR 20260419-release-merge-strategy](docs/decisions/20260419-release-merge-strategy.md)
- **merge commit 직후 `git push origin main:develop` (fast-forward) 필수** — main 의 merge commit 자체가 develop 에 없으므로 doctor 가 일시적으로 warn (main 이 1 커밋 앞섬). fast-forward push 로 즉시 해소. force-push 가 아니며 (main 이 develop 의 후손), CRITICAL #5 해당 없음
- **dual PR 재발 방지**: feature/fix PR 은 `base=main` 을 사용하지 않는다 (PR 템플릿 가드)

**3. 핫픽스 (prod 이슈)**
```
hotfix/99-critical   (main 에서 분기)
   ↓ PR (base=main, squash 또는 merge commit 가능)
main   ← 머지 + 태그 vX.Y.Z+1
   ↓ 즉시 merge-back PR (base=develop, head=main)
develop   ← 동기화 유지 (누락 시 drift)
```
- hotfix 는 release 경로를 우회하므로 main 이 develop 보다 앞서게 되어 **merge-back 필수**. 이 경우만 merge-back PR 로 develop 을 동기화
- merge commit 으로 release 를 해온 정상 운영에서는 hotfix 빈도가 적으므로 merge-back 오버헤드도 최소

### drift 감지
- `harness doctor` 의 "gitflow 브랜치 정합성" 항목이 `origin/main` vs `origin/develop` 커밋 격차를 점검한다 (v2.15.0 에서 `--is-ancestor` / hotfix 문맥 / unrelated histories 분류 추가)
- **정상 (pass)**:
  - 동일 커밋 — 릴리스 직후 또는 초기 상태
  - `develop > main` — 다음 릴리스 대기 (정상)
  - `main > develop` 이지만 `git merge-base --is-ancestor develop main` 가 참 — **fast-forward 동기화 대기 중** (release PR merge commit 직후 정상 상태. `git push origin main:develop` 로 해소)
- **경고 (warn)**:
  - `hotfix/*` 브랜치 존재 + `main > develop` — hotfix 진행 중 (머지 후 merge-back PR 필요)
  - develop 이 main 의 조상이 아닌 채 `main > develop` — hotfix merge-back 누락 또는 release PR 을 실수로 `--squash` 로 머지한 가능성. `git show main --format=%P | wc -w` 로 merge commit 여부 확인 (2 이면 merge commit, 1 이면 squash)
  - `git rev-list` 실패 (unrelated histories 등) — `git merge-base origin/main origin/develop` 로 공통 조상 확인

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
6. 재조정 시 **테스트 ROI 5문 체크** 후 대체재를 우선 검토한다:
   - 테스트 환경 구축 비용이 검증 대상 코드 라인 수의 5배 이상인가? (git fixture / DB seed / 네트워크 mock 등)
   - 몇 줄을 보호하는가? 1~2줄짜리 스킵 조건은 **주석 계약 + 인접 속성 테스트**가 충분할 수 있다
   - 회귀 시 조용히 퇴행 vs 빌드 실패? 조용히 퇴행 → 테스트 필수, 빌드 실패 → 주석 계약으로 충분 가능
   - 인접 유닛 테스트 / 타입 가드 / 문서로 간접 보증 가능한가?
   - 미래 fixture 인프라 구축 후 저렴해질 수 있는가? → **별도 인프라 이슈로 분리**
7. 재조정 사실은 **세 위치에 동시 박제** (누락 방지):
   - **코드 주석** — 계약 자체 (무엇을 의도적으로 스킵했는지)
   - **PR 본문** — 결정 근거 (왜 재조정했는지)
   - **CHANGELOG Notes** — 미래 관찰자용 기록 (재발견 시 "누락"으로 오인 방지)
8. 반대 함정: "완료 기준에 있으니 무조건 테스트 작성" (의존성 복잡도 무시한 단발성 부채) vs "ROI 낮다고 조용히 스킵" (재조정 박제 누락). 둘 다 금지.
9. 근거: volt [#31](https://github.com/coseo12/volt/issues/31) — harness #92 Phase 2 merge 스킵 테스트에서 git fixture 구축 비용이 검증 대상 1줄 대비 역전되어 주석 계약 + 인접 속성 테스트로 대체한 사례
10. **수치 DoD 미달 시 측정 방법 검증 우선** — DoD 수치가 미달이면 **(0) 측정 방법 검증 → (1) 식/구현 수정 → (2) 알고리즘 교체** 순으로 접근한다. 샘플링/윈도우/노이즈 특성이 미달의 진짜 원인인 경우가 잦다. 특히 신호가 약할 때(측정 대상 ≪ baseline) noise 가 이론값 방향으로 우연히 pull 되어 선행 Phase 의 "우연 성공" 기록으로 남아 있을 수 있다. 측정법 전환 전 식부터 수정하면 이미 올바른 식을 "틀렸다" 고 오진하는 역방향 손실이 발생한다. 근거: volt [#32](https://github.com/coseo12/volt/issues/32) — 지구 GR 세차 측정에서 EIH 식 structural bias 로 오진한 현상이 실제로는 `min_r` 샘플링 노이즈였고, LRL 벡터 + Newton baseline subtraction 측정법 전환으로 드러남.

### 마일스톤 회고 루틴

마일스톤(또는 Phase) 종료 시 **회고 문서 작성은 의무**다.
- 위치: `docs/retrospectives/<phase-or-milestone>-retrospective.md`
- 고정 4섹션: **달성도(완료 기준 표) / 잘 된 것 / 어려웠던 것 / 다음 인수인계**
- 테스트 증분·성능 변화는 baseline 대비 수치로 기록
- 회고에서 도출된 프로세스 교훈은 다음 마일스톤 가드(PR 템플릿/검사 스크립트)로 **제도화**한다

## 디자인 품질 루브릭 (UI 프로젝트)

UI가 포함된 작업에서 4축으로 품질을 평가한다:

| 기준 | 가중치 | 설명 |
|------|-------|------|
| Design Quality | 30% | 색상, 타이포그래피, 레이아웃이 일관된 전체로 느껴지는가 |
| Originality | 30% | 템플릿/라이브러리 기본값/AI 생성 패턴(보라색 그라데이션 등)을 탈피했는가 |
| Craft | 20% | 타이포그래피 계층, 간격 일관성, 색상 조화, 대비 비율 |
| Functionality | 20% | 미학과 무관한 사용성 (내비게이션, 폼, 인터랙션) |

---

<!-- harness:managed:real-lessons:start -->
## 실전 교훈 (portfolio-26, simple-shop 등에서 추출)

### 빌드 성공 ≠ 동작하는 앱
빌드 통과 + 단위 테스트 통과여도 실제 브라우저에서 동작하지 않는 경우가 빈번하다.
커밋 전 반드시 브라우저에서 3단계 검증을 수행한다:

1. **정적 확인**: 이미지 로드, 콘솔 에러 없음, 모바일/데스크톱 레이아웃
2. **인터랙션 확인**: 버튼/링크 클릭, 검색/필터/정렬, 폼 제출
3. **흐름 확인**: 네비게이션 → 페이지 → 데이터 연동, URL ↔ 상태 동기화

> 스크린샷 캡처는 Level 1에 불과하다. "렌더링 됨 = 동작함"이 아니다.

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
이전 마일스톤 회고가 인계한 "수정 필요 항목"이 환경/코드 변화로 **착수 시점엔 이미 해소**되어 있는 경우가 있다. AI는 인계 항목을 "해야 할 일"로 과신하는 편향이 있으므로 구현 직전 실측으로 전제를 재검증한다.

- 작업 착수 전 현재 동작을 실측 (브라우저/bench/테스트)
- 이미 만족하면 구현 대신 **NO-OP ADR** 작성: `docs/decisions/<YYYYMMDD>-<topic>-no-op.md`
- NO-OP 결정도 후보 비교 / 실측 결과 / 재검토 조건을 남긴다 — 다음에 재발굴 시 빠르게 기각 근거
- 대신 **회귀 가드**를 박제: 현재 동작이 퇴행하지 않도록 verify 스크립트 또는 테스트 추가
- 근거: volt [#14](https://github.com/coseo12/volt/issues/14) — CRITICAL #2 "모호한 지시 사전 확인"과 상호보완 (명확한 지시를 받았어도 실측으로 범위 축소)

### 신규 함수 ≠ 신규 구현
새 함수/헬퍼/유틸리티를 쓰기 전 "이미 있을 수 있다"를 기본 가설로 둔다. AI는 "없다"고 가정하고 바로 구현으로 들어가는 편향이 있어, 이전 마일스톤에서 구축된 공용 함수를 재발견하지 못한 채 중복 코드와 테스트를 생성한 사례가 반복된다.

- 구현 착수 전 `Grep`으로 함수명·핵심 키워드 검색 (예: `stateVector`, `velocity.*orbital`, `parse.*X`)
- 같은 패키지의 `index.ts` export 목록을 먼저 훑는다 — 한 파일만 봐도 재사용 대상이 드러나는 경우가 많다
- 중복을 발견하면 미련 없이 삭제하고 기존 함수 import로 대체 (sunk cost 편향 경계)
- 근거: volt [#21](https://github.com/coseo12/volt/issues/21) — 50줄 + 테스트 70줄 작성 후 동일 기능 함수가 동일 패키지에 이미 존재함을 발견한 사례

### 커밋 성공 ≠ 의도한 변경 커밋됨
`git commit` 종료 코드 0과 "커밋 성공" 메시지만 믿지 말 것. 특히 lint-staged + tracked/ignored 혼재 상황에서 staged 변경 일부가 **조용히 유실**될 수 있다.

- lint-staged 출력에서 `[FAILED]` 키워드를 발견하면 **커밋 후 필수 검증**
- 커밋 직후 `git diff <base> HEAD -- <예상 파일 목록>` 또는 `git show --stat HEAD` 로 실제 반영된 파일 확인
- `.gitignore` 규칙을 새로 추가할 때는 `git ls-files <path>` 로 이미 tracked된 파일이 있는지 확인 후 `git rm --cached` 로 정리
- 근거: volt [#13](https://github.com/coseo12/volt/issues/13) — "빌드 성공 ≠ 동작", "HTTP 200 ≠ 올바른 리소스" 원칙의 연장선

### 매니페스트 최신 ≠ 파일 적용 완료 — 부분 실패 교착 복구
매니페스트 기반 패키지 관리자(`harness update`, Nix, brew, dpkg/apt, npm package-lock 등)는 파일 적용과 매니페스트 해시 기록이 **원자적 트랜잭션이 아닌** 경우가 많다. 파일 적용 중 일부가 롤백되어도 매니페스트는 최신 해시로 기록되어, 다음 재-apply 가 "동일 상태"로 오판하고 스킵하면 **복구 불가능한 교착 상태**에 빠진다.

- 증상: `harness update --apply-all-safe` 재실행이 롤백된 파일을 "사용자 임의 수정"으로 간주해 건너뜀
- 즉시 복구: 이전 머지 커밋에서 `.harness/manifest.json` 을 복구 후 재-apply
  ```bash
  # 이전 머지 커밋 찾기: git log --oneline --merges -n 5
  git checkout <이전-머지-커밋-해시> -- .harness/manifest.json
  npx github:coseo12/harness-setting update --apply-all-safe
  # 롤백된 파일이 다시 pristine 으로 감지되어 재적용됨
  ```
- 예방 루틴: 패키지 업데이트 커밋 시 매니페스트와 파일을 **동일 커밋**에 묶고, 부분 실패 감지 시 전체 revert + 재시도를 부분 보수보다 우선한다
- 선행 원인 lint-staged silent partial commit (volt [#13](https://github.com/coseo12/volt/issues/13)) 과 연쇄될 때 가장 자주 관찰됨
- **다운스트림 formatter 재포맷 경계 drift** — lint-staged / pre-commit 의 `prettier --write` 류가 파일 적용 **직후** 실행되면 upstream 파일 스타일(따옴표·빈 줄·공백 정렬 등)을 로컬 컨벤션으로 되돌려, 매니페스트엔 upstream 해시가 기록됐어도 디스크 파일은 재포맷 상태로 drift. `--check` 재실행 시 "안전 업데이트 N개" 노이즈가 반복돼 실질 upstream 변경을 놓칠 위험. **예방**: 다운스트림 `.prettierignore` 에 harness-managed 경로(`.claude/`, `.github/ISSUE_TEMPLATE/`, 관리 `docs/*.md` 등) 추가. **탐지**: 커밋 직후 `git show --stat HEAD` 로 실제 반영된 파일 수가 의도와 일치하는지 확인. 근거: volt [#35](https://github.com/coseo12/volt/issues/35) — astro-simulator 에서 v2.7.0 → v2.11.0 적용 시 35 파일이 prettier 재포맷으로 drift. volt [#13](https://github.com/coseo12/volt/issues/13) (staging 성공 ≠ 커밋 내용) 의 formatter 파이프라인 버전
- v2.8.0 (harness [#89](https://github.com/coseo12/harness-setting/issues/89)) 부터 **post-apply 검증 게이트** 도입: 파일 적용 직후 upstream 패키지 해시와 디스크 실측 해시를 비교하여 불일치 파일의 매니페스트 해시는 이전 값으로 유지(재-apply 시 pristine 재감지). 부분 실패 시 exit code 1 + stderr 경고. `harness doctor` 는 "매니페스트 해시 정합성" 항목으로 해시 위조를 감지한다.
- v2.9.0 (harness [#92](https://github.com/coseo12/harness-setting/issues/92) Phase 1) 부터 매니페스트에 **`previousSha256`** 필드 자동 기록: `userSha === previousSha256` 인 파일은 `modified-pristine` 으로 재분류되어 `--apply-all-safe` 가 자가 복구한다. v2.8.0 이 못 잡던 타이밍(커밋 시점 lint-staged 롤백) 도 코드 레벨에서 해소.
- 근거: volt [#27](https://github.com/coseo12/volt/issues/27). harness 코드 레벨 원자성 개선은 [#89](https://github.com/coseo12/harness-setting/issues/89)(v2.8.0) 과 [#92](https://github.com/coseo12/harness-setting/issues/92)(v2.9.0~) 에서 반영

### sub-agent 검증 완료 ≠ GitHub 박제 완료
sub-agent(dev/qa 페르소나 등)는 빌드·테스트·브라우저 검증은 수행하면서도 **커밋/푸시/PR 생성/`gh pr comment` 박제** 같은 외부 가시성 단계에서 이탈하는 패턴이 반복된다(4회 관찰). sub-agent 관점 "작업 완료"와 harness 관점 "외부 가시성 있음"이 어긋나 메인 오케스트레이터가 매번 수동 보완해야 했다.

- sub-agent 위임은 **"검증"까지는 신뢰하되 "박제"는 신뢰하지 말 것** — 메인 컨텍스트가 sub-agent 보고 수신 직후 `git log --oneline -1` / `gh pr list` / `gh pr view <번호> --json comments` 로 GitHub 상태를 직접 확인한다
- sub-agent 프롬프트 말미에 **마무리 체크리스트 JSON 반환** 을 요구한다 — 커밋 SHA / PR URL / 코멘트 URL / 라벨 전이 결과를 field로 명시해 누락을 구조적으로 감지
- 누락 감지 시 메인이 직접 보완 박제 (커밋/PR/코멘트). sub-agent를 재호출해 같은 누락을 반복시키지 않는다
- 근거: volt [#24](https://github.com/coseo12/volt/issues/24) — astro-simulator P6-B~E 에서 dev/qa sub-agent 마무리 단계 누락 4회 연속 관찰

### sub-agent multi-turn 라운드 이탈 — 매트릭스 일관성 검증
sub-agent에 적응적 질답·설계 같은 multi-turn 세션을 위임할 때, SendMessage 로 라운드를 이어가도 전 라운드의 세부 매트릭스(Phase 제목 / DoD 수치 / 의존 관계)가 다음 라운드에서 **이탈**하는 사례가 관찰된다. "권고안 A" 같은 참조 레이블만으로는 세부 컨텍스트 복원이 보장되지 않는다 — sub-agent 는 세션 목적만 유지하고 매트릭스 세부는 잃을 수 있다.

- 메인 오케스트레이터는 라운드 N 출력에서 **핵심 키워드 목록**(매트릭스 행 제목, 수치 DoD, 사용자 답변 Q/A 쌍)을 추출하고, 라운드 N+1 출력과 대조해 이탈을 즉시 감지한다
- SendMessage 로 라운드를 이어갈 때 **이전 라운드 매트릭스를 본문에 인라인 재첨부**한다 — 참조 레이블("권고 A")만으론 부족. 요약 2~3줄로라도 원문 재첨부
- 이탈 발견 시 라운드 N+1 결과를 폐기하고 **사용자에게 불일치 보고 + 이전 라운드 재확인**. 이탈 산출물은 손실로 간주하지 말고 후속 확장(예: P17+ 후보) 로 별도 메모리에 박제해 보너스 자산화
- 근거: volt [#34](https://github.com/coseo12/volt/issues/34) — astro-simulator P8~P16 로드맵 설계 3라운드 중 라운드 3 에서 권고 A(내행성계 위성 / 목성계 / 토성계) 매트릭스가 J2/Yarkovsky/중력파 등 전혀 다른 주제로 이탈. volt [#24](https://github.com/coseo12/volt/issues/24) 의 "sub-agent 신뢰 한계" 계열 확장

### headless 브라우저 검증 ≠ 실 브라우저 동작
`agent-browser` / Playwright headless(특히 `--use-webgpu-adapter=swiftshader` 같은 software adapter)는 3D/WebGPU/카메라 조작 경로에서 **부분 freeze** 가 발생해 coarse assertion(비검정 canvas / fps 유지 / 컴파일 성공) 만으론 기능 실패를 탐지하지 못한다. 한 pipeline(예: background lensing 왜곡) 은 성공하고 다른 pipeline(예: accretion disk mask) 은 실패하는 **부분 성공** 케이스가 "headless 8/8 PASS" false positive 로 "채택" 판정될 수 있다. CRITICAL #3 "3단계 브라우저 검증"의 확장.

- 시각 효과(3D/WebGPU/camera 조작/shader-bound 렌더)를 포함하는 작업은 **실 Chrome GUI 수동 검증 최소 1회**. `status:review` 전이 전 체크리스트에 명시
- browser-verify 스크립트에 **도메인 특화 pixel 검증**(특정 색상 존재, scene object visibility, 카메라 회전 응답 diff)을 추가하되, 단독으론 충분하지 않다 — swiftshader freeze 상황에서 여전히 false positive 가능
- 완전 실패가 아닌 partial 자산은 `?feature=1` 류 옵트인 경로로 보존하고 ADR 에 "향후 디버깅 자산" 명시. 자동 폐기 금지
- PM 계약에 **"M1 백업 경로"** (실패 시 대체안) 을 사전 박제하면 sub-agent 가 실패 판정 후 재승인 없이 대체안으로 자동 전환 가능
- 근거: volt [#33](https://github.com/coseo12/volt/issues/33) — astro-simulator P7-C 에서 5차 재시도 중 3차(Frustum Corner Interpolation) 가 headless 8/8 PASS + fps=23 + 비검정 canvas 로 "채택" 판정받았으나 실 Chrome 에서 accretion disk 렌더 실패 확인, 5차 D' 로 전환
<!-- harness:managed:real-lessons:end -->

## 프로젝트 고유 보강 교훈

> 위 `real-lessons` managed-block 은 harness upstream 이 관리하며 업데이트 시 자동 동기화된다. 본 섹션은 프로젝트 고유 해결책/가드를 별도로 박제한다 (block 외부이므로 upstream 업그레이드에 영향받지 않음).

### prettier 컨벤션 충돌 — 프로젝트 고유 해결책 (astro-simulator)

상위 "다운스트림 formatter 재포맷 경계 drift" 교훈의 프로젝트 구현:

- `scripts/sync-prettierignore.mjs` — 매니페스트에서 harness-managed 경로를 추출해 `.prettierignore` 의 `# --- harness-managed ---` 블록을 자동 재생성
- `.github/workflows/prettierignore-drift.yml` — `sync:prettierignore --check` 로 drift 감지 시 PR 차단
- 예외 경로 (매니페스트 있어도 prettier 제외 안 함, 프로젝트 고유 live 문서): `docs/benchmarks/**`, `docs/phases/**`, `docs/reports/**`, `docs/retrospectives/p*-retrospective.md`
- **운영 필수**: `harness update --apply-*` 직후 `pnpm sync:prettierignore` 실행 후 동일 커밋에 포함
- 근거 ADR: `docs/decisions/20260419-prettier-harness-conflict.md`
- 관련 이슈: [#229](https://github.com/coseo12/astro-simulator/issues/229) (인프라 도입), [#230](https://github.com/coseo12/astro-simulator/issues/230) (v2.15.0 업그레이드 실측)

---

## 교차검증 (cross-validate)

정답이 없는 의사결정에서 Gemini의 두 번째 시각을 활용한다.
- Gemini 실패 시 스킵하고 "Claude 단독 분석"을 명시한다
- 경량 모델 폴백은 하지 않는다 — 교차검증의 가치는 깊은 분석에 있다
- **정책·설계·ADR 박제 직후 1회 루틴** — 정책 문서, ADR, CRITICAL DIRECTIVE 등을 박제한 직후 cross-validate 스킬을 1회 호출한다. 단일 모델 편향(범주 오류/암묵 전제 누락)은 박제 직후가 노출 효율이 가장 높다. v2.6.2→v2.6.3(SemVer 세분화) 사례 참조.
- **교차검증 결과는 Claude가 재분석**: Gemini 산출물을 합의/이견/고유발견으로 분류하고, 과대 대응은 근거와 함께 반려. 맹목 수용 금지.
- **고유 발견의 수용 vs 후속 분리 3단 프로토콜** — #23 의 반려 기준을 보완하는 수용/분리 기준:
  1. **합의 선별** — Claude 설계와 일치하는 Gemini 지적은 현재 PR 에 즉시 반영. 이견은 근거 비교 후 취사
  2. **고유 발견의 범위 체크** — Gemini 만의 제안이면 현재 스프린트 계약(특히 **비목표**)과 대조. 범위 내면 반영, 범위 밖(비목표와 상충)이면 **후속 이슈로 분리**. 판단 질문: "이 변경이 현재 PR 의 `Behavior Changes` 에 원 완료 기준과 직교하는 항목을 추가하는가?"
  3. **분리 시 박제 규칙** — 후속 이슈를 **즉시 생성**해 맥락 유실 방지. 본문에 Gemini 설계 스케치 인용 + `Builds on: #원PR` 링크 + 우선순위 초안(high / medium / low) 명시
- 금지: 스프린트 비목표를 "Gemini 제안이 타당하다"는 이유만으로 무시 (CRITICAL #6 침범). 근본 해결책이라도 현재 스프린트 범위 밖이면 분리
- 근거: volt [#23](https://github.com/coseo12/volt/issues/23), volt [#29](https://github.com/coseo12/volt/issues/29) — harness #89 (post-apply 게이트) 교차검증에서 Gemini 가 `previousSha256` 스키마 확장을 제안했고, 비목표 "매니페스트 스키마 변경 없음"과 상충하여 후속 이슈 #92 로 분리. 결과적으로 3 PR / 3 릴리스로 자연 분할되어 각 단계 위험 독립

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
- **Semantic Versioning 분류 기준** (판정 애매 시 낮은 쪽 선택):
  - **MAJOR** — 하위 호환을 깨는 변경. CLI 인자 제거/시그니처 변경, 기존 스킬·에이전트 계약 파괴, `.harness` 스키마 breaking, 설정 키 제거
  - **MINOR** — 코드 **또는 에이전트 행동**이 포함된 신규 기능·행동 변화 추가
    - 신규 CLI 서브커맨드, 신규 에이전트/스킬, 신규 hook/automation, 신규 옵션(기본값이 기존 동작 유지)
    - **에이전트 지시어·스킬 절차·체크리스트·행동 제약의 추가·수정** (`.claude/agents/*.md`, `.claude/skills/*/SKILL.md` 의 **행동을 바꾸는** 변경)
  - **PATCH** — **행동 변화가 없는** 문서·문구 변경. CLAUDE.md 교훈/배경 설명 추가, README·docs 문서화 보강, 주석·문구·오타 개선, 버그 수정
- **행동 변화 vs 문서 변경 판정 질문**: 이 변경으로 에이전트가 같은 입력에 다르게 동작하는가? 예(= 행동 변화 = MINOR), 아니오(= 문서 = PATCH).
  - 예시 MINOR: developer 에이전트 워크플로 단계 추가, 스킬 DO NOT TRIGGER 조건 변경, 금지 규칙 추가
  - 예시 PATCH: 실전 교훈 섹션에 사례 추가, README 문구 개선, 오타 수정, 버그 수정
- **CHANGELOG 작성 규칙**:
  - MINOR/MAJOR 릴리스는 **`### Behavior Changes`** 섹션을 필수 포함하여 다운스트림이 `harness update` 후 관찰할 행동 변화를 bullet 으로 나열한다
  - PATCH 릴리스도 frozen 파일(`.claude/`)이 변경됐다면 `### Behavior Changes: None — 문서/문구만` 을 명시해 자동 업데이트 신뢰 모델을 보호한다
- 볼트 반영은 변경 성격에 따라 분류 — 에이전트·스킬 행동 변경이면 MINOR, 단순 교훈·문서 보강이면 PATCH
- 의미 있는 마일스톤마다 `git tag` + `gh release create`로 릴리스
- **Phase 분리 릴리스 리듬** — 완료 기준이 많은 이슈는 한 스프린트에 몰아 처리하지 말고, 각 Phase 가 **독립 릴리스 가능한 관찰 단위**가 되도록 나눈다. 적용 조건(3가지 전부 필요):
  - **backward-compat** — 앞 Phase 만 배포돼도 시스템이 정상 동작
  - 각 Phase 가 **완결 Behavior Change 집합** — 중간 Phase 가 부분 구현 상태가 아님
  - 사용자가 **점진 릴리스 리듬에 동의** — 주간 단위로 여러 릴리스 허용
- 적용 불가: Phase 간 필수 의존(앞 Phase 단독 배포 시 불안정), 파이프라인 변경이 전체를 통째로 요구. 판정 애매 시 단일 릴리스로 통합
- 분할 시 CHANGELOG 는 Phase 별 별도 entry + 상호 링크 박제 (사용자에게 "왜 쪼개졌는지"가 drift 되지 않도록). 원 이슈는 마지막 Phase 완료 시 한 번에 close
- 근거: volt [#30](https://github.com/coseo12/volt/issues/30) — harness [#92](https://github.com/coseo12/harness-setting/issues/92) (`previousSha256` 자가 복구) 를 Phase 1 (로직, v2.9.0) / Phase 2 (가시성 + 회귀 가드, v2.10.0) 로 분할. 리뷰 분산 + 중간 관찰 + 롤백 독립성 확보

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

### 한글 인코딩 검증
- 한국어가 포함된 파일을 Edit한 후, 깨진 문자(U+FFFD, �)가 없는지 확인한다
- 커밋 전 `grep -rn '�' <수정한 파일>` 실행을 권장한다
- 긴 한국어 텍스트를 Edit으로 삽입할 때 깨짐이 발생할 수 있으므로, 깨짐 발견 시 즉시 수정한다

### 금지 사항
- main 브랜치 직접 수정 금지
- 리뷰 없이 머지 금지
- 테스트 없이 PR 생성 금지
- feature/fix PR 의 `base=main` 금지 — 반드시 `develop` 대상. `base=main` 은 release/hotfix PR 만 허용
- hotfix 머지 후 `main → develop` merge-back 누락 금지 — 누락 시 `harness doctor` 가 drift 로 감지
