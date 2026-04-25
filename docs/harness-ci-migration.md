# harness v3.0.0 수동 마이그레이션 — `.github/workflows/` 책임 분리

> **대상**: `harness update` 자동 마이그레이션이 **6c 경로로 스킵**된 다운스트림 프로젝트.
>
> **자동 마이그레이션 성공 (6a / 6b)** 이면 본 문서를 읽을 필요 없음.

## 배경

v3.0.0 부터 `.github/workflows/` 가 책임 경계로 분리됐다:

| 파일 | 카테고리 | 소유 | 의미 |
|---|---|---|---|
| `.github/workflows/harness-*.yml` | `frozen` | upstream | harness 가 자동 덮어쓰기 |
| `.github/workflows/ci.yml` | `user-only` | 다운스트림 | harness 는 손대지 않음 |
| `.github/workflows/기타 *.yml` | `user-only` | 다운스트림 | 자유 |

**왜 분리했는가?** ci.yml 에 upstream 가드 (`verify-agent-ssot` / `verify-release-version-bump` 등) 와 다운스트림 빌드·테스트 (`detect-and-test`) 가 한 파일에 공존했다. upstream 가드 한 줄 개선만 있어도 ci.yml 전체가 frozen 덮어쓰기 대상이 되어 다운스트림 수정이 충돌했다 (volt #62 관찰).

근거: [ADR 20260421-workflows-responsibility-split](decisions/20260421-workflows-responsibility-split.md)

## 자동 마이그레이션 3단 매칭

`harness update --apply-all-safe` 가 본 릴리스에서 하는 일:

- **6a** (ci.yml 순정 v2.31.0) → 전체 덮어쓰기
- **6b** (detect-and-test 만 수정, 가드 블록 원형) → 가드 블록만 제거
- **6c** (**가드 블록 자체를 수정**) → **스킵** + 본 가이드로 유도

6a/6b 는 자동 완료. 6c 는 자동 분리가 위험하므로 수동 절차가 필요하다.

## 6c 감지 시 리포팅 (선택적이나 권장)

`harness update --apply-all-safe` 가 6c 경로를 감지하면 stderr 로 **`[ACTION REQUIRED]` 헤더 + pre-filled 이슈 URL** 을 출력한다. 예:

```
[ACTION REQUIRED] harness: ci.yml 가드 블록 마이그레이션 스킵 (6c — 사용자 수정 감지)
  수동 가이드: docs/harness-ci-migration.md
  리포트 (pre-filled URL, 클릭 후 관찰/동기만 보완): https://github.com/coseo12/harness-setting/issues/new?template=6c-migration-report.md&title=...&body=...
```

URL 을 브라우저에서 열면 `.github/ISSUE_TEMPLATE/6c-migration-report.md` 템플릿이 로드되며, 다음 환경 메타가 **자동 채워져 있다**:

- harness version (다운스트림 `node_modules/@seo/harness-setting/package.json::version`)
- Node version (`process.version`)
- OS (`process.platform-process.arch`, 예: `darwin-arm64`)
- ci.yml sha256 앞 12자리 (이슈 중복 제출 식별용)

제출자는 남은 섹션 (가드 블록 수정 방법 / 수정 동기 / upstream 확장 제안) 만 보완하면 된다. 본 리포트는 upstream 이 6c 경로 발동 빈도·패턴을 수집해 향후 자동 분리 로직이나 공식 `--verbose` 같은 옵션을 검토하는 근거가 된다 (ADR `## 결과·재검토 조건` 연계).

> URL 만 클릭하고 닫아도 괜찮다 — 이슈 제출 의무는 없다. 제출이 부담스럽다면 수동 마이그레이션만 진행하고 넘어가도 된다.

## 수동 마이그레이션 절차 (6c 경로)

### 1. 사전 백업

```bash
# 이미 harness 가 생성한 백업이 있는지 확인
ls -la .harness/backup/ci-split-*/

# 없다면 수동으로
mkdir -p .harness/backup/ci-split-manual-$(date +%Y%m%d-%H%M%S)
cp .github/workflows/ci.yml .harness/backup/ci-split-manual-*/
cp .github/workflows/pr-review.yml .harness/backup/ci-split-manual-*/ 2>/dev/null || true
```

### 2. `ci.yml` 에서 가드 블록 수동 제거

`.github/workflows/ci.yml` 를 열어 다음 섹션을 **삭제**한다:

- 섹션 시작: `      # ============================================================`
  바로 다음에 `      # harness 저장소 전용 가드 (다운스트림은 hashFiles 조건으로 skip)`
- 섹션 종료: 파일 끝 또는 다음 `# ============================================================` 구분선 직전

**제거 대상 step 목록** (v2.31.0 기준):

- `agent SSoT drift 가드`
- `release version bump 가드`
- `CLAUDE.md 각인 예산 가드`
- `CLAUDE.md 상대 링크 무결성 가드`

**선택적**: 제거된 자리에 아래 안내 주석을 삽입하여 협업자가 이해하기 쉽게 한다:

```yaml
      # ============================================================
      # NOTE: harness 저장소 전용 가드는 `.github/workflows/harness-guards.yml` 로 이동됨
      # (v3.0.0, #196). 다운스트림은 본 ci.yml 을 자유롭게 수정해도 업스트림과 충돌하지 않는다.
      # ============================================================
```

### 3. `pr-review.yml` → `harness-pr-review.yml` 리네임

**주의**: pr-review.yml 을 다운스트림이 수정하지 않았다면 `harness update --apply-all-safe` 가 자동 처리한다. 수정했다면 수동으로:

```bash
git mv .github/workflows/pr-review.yml .github/workflows/harness-pr-review.yml
```

내부 `name: PR 자동 리뷰 트리거` → `name: Harness PR 자동 리뷰 트리거` 로 갱신.

### 4. `harness-guards.yml` 자동 배치

위 2~3 을 마친 후:

```bash
npx github:coseo12/harness-setting update --apply-all-safe
```

이 명령은 (a) `.github/workflows/harness-guards.yml` 을 다운스트림에 새로 배치하고 (b) `harness-pr-review.yml` 을 최신 upstream 내용으로 갱신한다. ci.yml 은 이제 user-only 이므로 건드리지 않는다.

### 5. 검증

```bash
# 다음 3개가 존재해야 함
ls .github/workflows/
#   ci.yml                  (다운스트림 소유)
#   harness-guards.yml      (upstream 소유, 새로 생김)
#   harness-pr-review.yml   (upstream 소유, rename 결과)

# doctor 로 매니페스트 정합성 확인
npx github:coseo12/harness-setting doctor
```

`harness update --check` 가 depth 변화 없이 green 이면 마이그레이션 성공.

## 자주 묻는 질문

### Q1. ci.yml 에 특수 스텝 (wasm-pack / cargo 등) 을 이미 추가했다 — 문제되는가?

**아니다.** v3.0.0 부터 ci.yml 은 `user-only` 이므로 어떤 커스텀 스텝이라도 upstream 과 충돌하지 않는다. `harness update` 가 ci.yml 을 덮어쓰지 않는다.

### Q2. 실수로 가드 블록을 지웠다가 다시 복원하고 싶다

`.harness/backup/ci-split-*/` 에 원본이 보존되어 있다. 또는 이전 git 커밋에서:

```bash
git log --oneline .github/workflows/ci.yml
git show <commit>:.github/workflows/ci.yml > .github/workflows/ci.yml
```

### Q3. `harness-guards.yml` 도 프로젝트별로 수정하고 싶다

가능하지만 frozen 이므로 다음 `harness update` 에서 덮어씌워진다. 다운스트림 고유 가드가 필요하면 별도 `project-guards.yml` 같은 파일로 분리 (`harness-` prefix 를 쓰지 말 것).

`.harnessignore` 에 등록하면 추적에서 제외된다.

## 관련

- 이슈: [#196](https://github.com/coseo12/harness-setting/issues/196)
- ADR: [decisions/20260421-workflows-responsibility-split.md](decisions/20260421-workflows-responsibility-split.md)
- frozen 파일 분리 패턴: [frozen-file-split.md](frozen-file-split.md)
- harness update 부합성 사전 체크리스트: [harness-update-compat-checklist.md](harness-update-compat-checklist.md)
- 근거: volt [#62](https://github.com/coseo12/volt/issues/62)
