# workflow_dispatch 2단계 함정 (GitHub Actions)

> **요지**: CLAUDE.md 실전 교훈의 GitHub Actions `workflow_dispatch` 트리거 함정 블록 상세. 본문 요약은 CLAUDE.md `## 실전 교훈` 의 포인터 참조.
>
> **근거**: harness [#199](https://github.com/coseo12/harness-setting/issues/199) Phase 3-A 에서 추출.

---

## 개요

`workflow_dispatch` 트리거를 쓰는 workflow 는 default branch (보통 `main`) 반영 후에만 UI/CLI 에서 discover 된다. feature/develop 에만 머지된 상태에서는 `gh workflow run ... --ref develop` 이 `HTTP 404: workflow not found on the default branch` 로 실패한다. 추가로 workflow 가 PR 을 자동 생성하려 하면 저장소 Settings 의 `can_approve_pull_request_reviews` 가 기본 OFF 라서 `##[error]GitHub Actions is not permitted to create or approve pull requests` 로 거부된다.

## 함정 1 — default branch 종속

GitHub UI 의 "Run workflow" 버튼 + `gh workflow run` 둘 다 default branch 의 파일 목록을 기준으로 workflow 를 찾는다. `--ref <branch>` 로 실행할 브랜치는 고를 수 있으나, **파일 자체는 default branch 에 존재해야** 함. 결과: "설계 PR 머지 → 즉시 실행" 흐름이 기본 gitflow 에서 불가 — release 까지 가야 실행 가능.

## 함정 2 — PR 자동 생성 권한 기본 OFF

저장소 기본값 `{"can_approve_pull_request_reviews": false}` 이면 workflow 가 `permissions: pull-requests: write` 를 선언해도 PR 생성 API 가 거부. 조치:

```bash
gh api -X PUT /repos/{OWNER}/{REPO}/actions/permissions/workflow \
  -f default_workflow_permissions=read \
  -F can_approve_pull_request_reviews=true
```

변경 후 즉시 효과 (재시작 불필요).

## 예방 규약

- **workflow_dispatch 도입 PR 의 DoD 에 "default branch 반영 후 실행 검증" 명시** — 설계 PR 만 머지하고 DoD 체크박스 "실행 검증" 을 못 채우는 함정 방지
- **PR 자동 생성 workflow 는 상단 주석에 사전 조건 박제**:

  ```yaml
  # 사전 조건: Settings → Actions → "Allow GitHub Actions to create and approve pull requests" ON
  # 또는: gh api -X PUT /repos/{OWNER}/{REPO}/actions/permissions/workflow -F can_approve_pull_request_reviews=true
  ```

## 근거

- volt [#45](https://github.com/coseo12/volt/issues/45) — astro-simulator `bench:baseline-remeasure` workflow (PR #238) 도입 후 develop 에서 dispatch 실패 → v0.7.1 release 로 main 반영 → 2차 시도에서 권한 OFF 로 실패 → Settings API 로 플래그 전환 후 성공. 첫 실행 로그: actions/runs/24621714905, 성공 실행: actions/runs/24624988691
