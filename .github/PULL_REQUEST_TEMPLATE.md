## [#이슈번호] 변경 설명

### 변경 사항
-

### 브랜치 / Base 확인 (gitflow)
PR 타입에 맞는 한 줄만 체크. `base=main` 은 release/hotfix PR 만 허용 (CLAUDE.md 금지 사항).
- [ ] **일반 feature/fix**: `base=develop`, `head=feature/*` 또는 `fix/*`
- [ ] **Release PR**: `base=main`, `head=develop` (CHANGELOG 범위 + 태그 계획 하단 release 섹션에 기재)
- [ ] **Hotfix PR**: `base=main`, `head=hotfix/*` (머지 직후 `main → develop` merge-back PR 생성 의무)
- [ ] **Hotfix merge-back**: `base=develop`, `head=main` (hotfix 직후 동기화 전용)

### 스프린트 계약
- [ ] 구현 전 완료 기준 합의 완료
- [ ] 모든 완료 기준 충족

### 테스트
- [ ] 단위 테스트 추가/수정
- [ ] 기존 테스트 통과 확인
- [ ] 모노레포: 신규/변경 워크스페이스에 `scripts.test` 존재 확인

### 브라우저 3단계 검증 (UI 변경 포함 시 필수)
빌드 통과 ≠ 동작 통과. 아래 증거를 첨부한다 (최소 1가지).
- [ ] **[1/3] 정적**: 렌더링 OK, 콘솔 에러 0 — 스크린샷 경로:
- [ ] **[2/3] 인터랙션**: 버튼/폼/토글 동작 — 스크린샷 경로:
- [ ] **[3/3] 흐름**: URL↔상태, 네비게이션 — 스크린샷 경로:
- [ ] verify 스크립트(있는 경우) 경로: `scripts/browser-verify-<feature>.mjs`

### 마일스톤 회고 (마일스톤 종료 PR만)
- [ ] `docs/retrospectives/<phase>-retrospective.md` 작성 (달성도/잘된것/어려웠던것/인수인계)

### Release PR 전용 (base=main, head=develop)
일반 PR 이면 건너뛴다. 릴리스 워크플로 4단계 (ADR 20260419-release-merge-strategy):
- [ ] 포함된 PR 번호 범위: #xxx ~ #yyy
- [ ] CHANGELOG `[vX.Y.Z]` entry 작성 (Added / Behavior Changes / Notes)
- [ ] `package.json` version bump
- [ ] 태그 계획: `vX.Y.Z` (SemVer 분류 근거 명시)
- [ ] **1단계**: `gh pr merge <PR> --merge` (merge commit) 로 머지 — `--squash` 절대 사용 금지
- [ ] **2단계**: `git push origin main:develop` (fast-forward push — force 아님. main 의 merge commit 이 develop 을 직계 조상으로 포함하므로 안전)
- [ ] **3단계**: `git tag vX.Y.Z` + `git push origin vX.Y.Z`
- [ ] **4단계**: `gh release create vX.Y.Z ...`
- [ ] 사후 확인: `harness doctor` 의 gitflow 브랜치 정합성이 "동기" 로 pass

### Hotfix PR 전용 (base=main, head=hotfix/*)
일반 PR 이면 건너뛴다.
- [ ] 패치 버전 bump (vX.Y.Z+1)
- [ ] **머지 직후 `main → develop` merge-back PR 생성 의무** (누락 시 develop drift 발생)
- [ ] merge-back PR 링크:

### 체크리스트
- [ ] 커밋 컨벤션 준수
- [ ] 불필요한 변경 없음
- [ ] 보안 취약점 없음
- [ ] CLAUDE.md `### sub-agent 검증 완료 ≠ GitHub 박제 완료` 의 공통 JSON 스키마 (SSoT 코어 필드 7개) 를 수정한 경우: 5개 에이전트 파일 (`.claude/agents/architect.md` / `developer.md` / `pm.md` / `qa.md` / `reviewer.md`) 의 `## 마무리 체크리스트 JSON 반환` 섹션 동기화 + `bash scripts/verify-agent-ssot.sh` 로컬 pass 확인 (CI 에서도 자동 검사 — #145)

### 관련 이슈
Closes #
