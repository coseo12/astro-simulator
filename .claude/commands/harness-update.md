---
description: harness 프레임워크 업데이트 확인/적용 (CLI 래퍼 + 인터랙티브 충돌 해결)
argument-hint: [--check | --apply-all-safe | --interactive | --dry-run | --bootstrap]
allowed-tools: [Bash, Read, Edit, Grep]
---

# /harness-update — Harness 업데이트

설치된 harness의 변경을 확인하고 안전하게 적용한다. CLI(`harness update`)의 세션 내 래퍼 + Claude가 release notes 요약 / divergent 충돌 해결을 도와준다.

## 사용자 입력

`$ARGUMENTS`

## 실행 절차

### 1. 변경 요약 (항상 먼저)

```bash
npx @seo/harness-setting@latest update --check
```

- 인자가 비어있거나 `--check` 면 여기까지만.
- 출력의 카테고리별 카운트(added / modified-pristine / divergent / removed-upstream)를 사용자에게 한 줄 요약으로 다시 정리한다.

### 2. 인자 해석

| 인자 | 동작 |
|---|---|
| `--check` | 1단계만, 적용 없음 |
| `--apply-all-safe` | 충돌 없는 변경 자동 적용 (frozen + pristine + added) |
| `--apply-frozen` / `--apply-pristine` / `--apply-added` | 카테고리별 |
| `--interactive` / `-i` | divergent/removed 파일별 결정 (Bash 직접 실행 필요 — 세션 대신 사용자에게 명령 안내) |
| `--dry-run` | 시뮬레이션 |
| `--bootstrap` | 매니페스트 부재 시 baseline 박제 |
| 인자 없음 | `--check` 와 동일하게 동작 후, 다음 단계 옵션 제시 |

### 3. release notes 컨텍스트 (있으면)

```bash
gh release view --repo coseo12/harness-setting --json tagName,name,body 2>/dev/null
```

- 최신 릴리스 노트가 있으면 변경 카테고리별로 **사용자 영향 요약** 제시 (특히 CRITICAL DIRECTIVES / Frozen 변경은 강조).
- 없으면 생략, "release notes 미작성" 이라고만 표시.

### 4. divergent 파일이 있을 때 (Claude의 가치 추가 지점)

자동 머지가 불가능한 `divergent` 파일이 있으면:

1. 사용자에게 파일 목록 표시.
2. 사용자가 원하면 파일별로 `Read` + `Bash`로 패키지 본 읽고 → diff를 사람이 읽기 좋은 형태로 요약 → **수동 머지 제안**(어떤 hunk가 합쳐져야 하는지 자연어 설명).
3. 사용자가 승인하면 `Edit` 으로 직접 머지 적용.
4. 머지 완료 후:
   ```bash
   npx @seo/harness-setting@latest update --bootstrap
   ```
   로 매니페스트 갱신 안내.

### 5. CRITICAL DIRECTIVES 변경 감시

`CLAUDE.md` 가 divergent/modified-pristine 으로 잡혔다면 **반드시 사용자에게 강조**:
- "CRITICAL DIRECTIVES 블록이 변경됐을 가능성. 적용 전 본인이 영향 검토 필수."
- 자동 적용을 권하지 않는다.

### 6. 결과 보고

- 적용된 파일 수 / 미해결 divergent 수 / 매니페스트 갱신 여부.
- 다음 권장 액션 (남은 충돌 해결, 커밋, doctor 재실행 등).

## 금지/주의

- **자동 적용 기본값 금지** — 인자 없으면 `--check` 동작만.
- **divergent 파일을 임의로 덮어쓰기 금지** — 사용자 명시 승인 후에만.
- **CRITICAL DIRECTIVES 블록 변경은 항상 강조** — 조용히 머지 금지.
- **CI/비-TTY 환경에서 `--interactive` 호출 금지** — CLI가 거부함.
- main 브랜치에서 적용 작업 금지 — 사용자에게 feature 브랜치 권장 (CLAUDE.md CRITICAL #1).

## 참고

- harness CLI 명령: `harness update --help` (또는 `bin/harness.js` 참조)
- 카테고리 정의: `lib/categorize.js`
- README "업데이트 확인/적용" 절
