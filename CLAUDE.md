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

## 브랜치 전략

- `main`: 안정 브랜치, 직접 푸시 금지
- `develop`: 통합 브랜치, PR을 통해서만 머지
- `feature/<이슈번호>-<설명>`: 기능 브랜치
- `fix/<이슈번호>-<설명>`: 버그 수정 브랜치

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

### 마일스톤 회고 루틴

마일스톤(또는 Phase) 종료 시 **회고 문서 작성은 의무**다.

- 위치: `docs/retrospectives/<phase-or-milestone>-retrospective.md`
- 고정 4섹션: **달성도(완료 기준 표) / 잘 된 것 / 어려웠던 것 / 다음 인수인계**
- 테스트 증분·성능 변화는 baseline 대비 수치로 기록
- 회고에서 도출된 프로세스 교훈은 다음 마일스톤 가드(PR 템플릿/검사 스크립트)로 **제도화**한다

## 디자인 품질 루브릭 (UI 프로젝트)

UI가 포함된 작업에서 4축으로 품질을 평가한다:

| 기준           | 가중치 | 설명                                                                     |
| -------------- | ------ | ------------------------------------------------------------------------ |
| Design Quality | 30%    | 색상, 타이포그래피, 레이아웃이 일관된 전체로 느껴지는가                  |
| Originality    | 30%    | 템플릿/라이브러리 기본값/AI 생성 패턴(보라색 그라데이션 등)을 탈피했는가 |
| Craft          | 20%    | 타이포그래피 계층, 간격 일관성, 색상 조화, 대비 비율                     |
| Functionality  | 20%    | 미학과 무관한 사용성 (내비게이션, 폼, 인터랙션)                          |

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
<!-- harness:managed:real-lessons:end -->

---

## 교차검증 (cross-validate)

정답이 없는 의사결정에서 Gemini의 두 번째 시각을 활용한다.

- Gemini 실패 시 스킵하고 "Claude 단독 분석"을 명시한다
- 경량 모델 폴백은 하지 않는다 — 교차검증의 가치는 깊은 분석에 있다

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

- Semantic Versioning 사용: breaking change → MAJOR, 기능 추가 → MINOR, 버그 수정 → PATCH
- 의미 있는 마일스톤마다 `git tag` + `gh release create`로 릴리스

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

- 신규 워크스페이스(`apps/*`, `packages/*`) 추가 시 **테스트 설정(vitest/jest config + scripts.test) 필수**
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
