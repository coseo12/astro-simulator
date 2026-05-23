# GitHub Actions workflow 함정 (workflow_dispatch + YAML)

> **요지**: GitHub Actions workflow 도입 시 (1) `workflow_dispatch` 의 default branch 종속 / PR 자동 생성 권한 + (2) YAML 1.1 `on:` boolean coercion + (3) block scalar + bash heredoc indent 의 4가지 silent 함정. **모두 CI statusCheckRollup 은 PASS 로 보이지만 trigger 자체 미발화** — 머지 후에야 발견되는 패턴이 공통.
>
> **근거**: harness [#199](https://github.com/coseo12/harness-setting/issues/199) Phase 3-A 에서 추출. volt [#45](https://github.com/coseo12/volt/issues/45) / [#102](https://github.com/coseo12/volt/issues/102) / [#103](https://github.com/coseo12/volt/issues/103) 누적.

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

## 함정 3 — YAML 1.1 `on:` → `True` boolean coercion (#102)

YAML 1.1 spec 에서 `on` / `off` / `yes` / `no` 가 boolean 으로 자동 coercion. GitHub Actions workflow 의 `on:` 트리거 키가 일부 parser (Python `yaml.safe_load` 폴백 등) 에서 `True` boolean 키로 해석되어 트리거 인식 실패. **CI statusCheckRollup PASS** (PR CI 와 무관) 라 PR 머지 후에야 발견.

증상:

```yaml
on:        # ← YAML 1.1 spec 에서 True 로 coercion
  schedule:
    - cron: '0 0 1 * *'
  workflow_dispatch:
```

→ `yaml.safe_load` 가 `{True: {schedule: [...], workflow_dispatch: None}}` 로 파싱 → GitHub Actions 가 트리거 key 미인식 → workflow 영구 무효화.

우회 (string 강제 quote):

```yaml
"on":      # ← 또는 'on':
  schedule:
    - cron: '0 0 1 * *'
  workflow_dispatch:
```

도구별 처리 차이 (참고):

- Node.js `js-yaml` (1.2 기본): `on` 을 string 유지 ✓
- Python `yaml.safe_load` (1.1): `on` 을 `True` 로 coercion ✗
- Go `gopkg.in/yaml.v3` (1.2): `on` 을 string 유지 ✓
- GitHub Actions runner internal: 1.1 spec (2026-05 기준 — 확인 권장)

### 동일 파일명 stale ID 변형

workflow 파일이 한 번 invalid 상태로 인덱싱되면 GitHub 가 ID 를 frozen 처리. 동일 파일명으로 fix push 해도 stale ID 유지 (404 지속). 우회: 파일명 변경 (`adr-z-pattern-health.yml` → `adr-z-pattern-health-v2.yml`) → 새 ID 발급.

## 함정 4 — YAML block scalar + bash heredoc indent (#103)

`run: |` step 안에 bash heredoc 본문 (`<<HEREEND ... HEREEND`) 을 박을 때, heredoc body 가 column 0 에서 시작하면 YAML block scalar parser 가 step 종료로 오인 → workflow 등록 실패. **silent 함정 — CI 가 workflow 파일 검증을 별도로 안 하면 PR PASS 유지**.

증상:

```yaml
- name: Create issue
  run: |
    gh issue create \
      --body "$(cat <<HEREEND
## 배경
자동 탐지 workflow 발화. 임계값 충족.
HEREEND
)"
```

`run: |` block scalar 인덴트 기준 = 처음 비공백 라인의 column. heredoc body 의 `## 배경` 이 column 0 에서 시작 → block scalar 종료 + step 종료 + 후속 YAML 키 (`## 배경`) 를 next step 으로 해석 시도.

우회 (heredoc body 에 10 space indent prepend):

```yaml
- name: Create issue
  run: |
    gh issue create \
      --body "$(cat <<HEREEND
          ## 배경
          자동 탐지 workflow 발화. 임계값 충족.
          HEREEND
    )"
```

bash heredoc 의 `<<HEREEND` 는 indent 보존 (`<<-HEREEND` 는 leading tab 만 제거). 본문에 10 space 가 그대로 박혀 issue body 로 출력되지만 마크다운 렌더링은 leading whitespace 무시 → **rendered 의도 유지** ✓.

대안 (검토 후 미채택):

- `<<-` + tab indent — tab 만 제거하므로 mixed indent 위험
- external 파일 (`issue-body.md`) 참조 — workflow 자체 검증 부담 + 동적 변수 보간 어려움
- one-liner string concat — 가독성 매우 떨어짐

## 예방 규약

- **workflow_dispatch 도입 PR 의 DoD 에 "default branch 반영 후 실행 검증" 명시** — 설계 PR 만 머지하고 DoD 체크박스 "실행 검증" 을 못 채우는 함정 방지
- **PR 자동 생성 workflow 는 상단 주석에 사전 조건 박제**:

  ```yaml
  # 사전 조건: Settings → Actions → "Allow GitHub Actions to create and approve pull requests" ON
  # 또는: gh api -X PUT /repos/{OWNER}/{REPO}/actions/permissions/workflow -F can_approve_pull_request_reviews=true
  ```

- **`on:` 키는 항상 quote** — `"on":` / `'on':` 둘 다 가능. raw `on:` 금지 (YAML 1.1 boolean coercion 회피)
- **`run: |` + heredoc body 는 indent 의무** — 10 space 또는 부모 step indent 보존
- (선택) **`actionlint` / `yamllint` strict mode pre-commit hook** — `on` 키 boolean coercion + block scalar indent 경고

## 근거

- volt [#45](https://github.com/coseo12/volt/issues/45) — astro-simulator `bench:baseline-remeasure` workflow (PR #238) 도입 후 develop 에서 dispatch 실패 → v0.7.1 release 로 main 반영 → 2차 시도에서 권한 OFF 로 실패 → Settings API 로 플래그 전환 후 성공. 첫 실행 로그: actions/runs/24621714905, 성공 실행: actions/runs/24624988691
- volt [#102](https://github.com/coseo12/volt/issues/102) — astro-simulator PR #491 hotfix (YAML on quote) + PR #492 hotfix-2 (file rename `-v2.yml`, stale ID 우회). YAML 1.1 spec: https://yaml.org/type/bool.html
- volt [#103](https://github.com/coseo12/volt/issues/103) — astro-simulator PR #490 (ADR Z 패턴 자동 탐지) qa 차단 → fix `5272f61` (10 space indent prepend)
