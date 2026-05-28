# PR / 커밋 컨벤션

> PR #290 reviewer 권고 3 (PR #293) — `docs/guides/branch-strategy-workflow.md` 의 §커밋 컨벤션 + §PR 규칙 단독 분리 (파일명 중심 검색 시 PR/커밋 규칙이 "브랜치 전략" 키워드에 묻히는 가시성 문제 해소).

## 커밋 컨벤션

```
<type>(<scope>): <description>
```

- type: feat, fix, refactor, test, docs, chore
- scope: 변경 대상 모듈/컴포넌트

## PR 규칙

- PR 제목에 이슈 번호 포함: `[#이슈번호] 설명`
- PR 본문에 변경 사항, 테스트 계획, 영향 범위 명시
- **여러 이슈 auto-close 시 각 이슈마다 keyword 반복 또는 줄 분리** — GitHub 은 각 이슈 바로 앞 단어에 closing keyword (`close[s|d]` / `fix[es|ed]` / `resolve[s|d]`) 가 있어야 인식한다. 잘못된 문법은 **조용히 누락**되어 이슈가 OPEN 으로 잔존.
  - **단일 원리**: GitHub 은 **각 이슈 번호 직전에 closing keyword 가 토큰으로 인접해야** 인식한다. 콜론/콤마/공백 등으로 keyword 와 번호 사이를 끊거나 두 번째 번호 앞에 keyword 가 없으면 모두 **동일한 결함** (두 번째 이슈 앞 keyword 부재) 으로 수렴해 #B 미인식.
  - ✅ `Closes #A, closes #B` — 각 이슈에 keyword 반복
  - ✅ 줄 분리 — `Closes #A\nCloses #B`
  - ❌ `Closes: #A, #B` / `Closes #A, #B` / `Closes #A #B` — 모두 #B 앞 keyword 부재 (콜론·콤마·공백은 동일 결함의 표면 변형)
- **머지 직후 auto-close 검증 루틴** — release/feature PR 머지 후 close 대상 이슈 전부에 `gh issue view <n> --json state` 로 실제 close 여부를 확인. default branch (main) 머지가 아닌 경우 (feature PR → develop) 는 릴리스 시점까지 OPEN 유지가 정상
- 근거: volt [#41](https://github.com/coseo12/volt/issues/41) — harness PR [#108](https://github.com/coseo12/harness-setting/pull/108) (v2.14.0) 커밋 메시지 `Closes: #105, #110` 에서 #105 만 auto-close 되고 #110 은 수동 close 필요했던 실측 사례

## 관련

- [docs/guides/branch-strategy-workflow.md](branch-strategy-workflow.md) — gitflow 워크플로 3단계 + drift 감지
- [.github/PULL_REQUEST_TEMPLATE.md](../../.github/PULL_REQUEST_TEMPLATE.md) — PR 본문 7 체크박스 + ADR 호환성 체크 prefill
