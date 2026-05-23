# verify-*.sh 작성 모범 — bash 3.2 호환 + 격리 동적 테스트

> **요지**: `verify-*.sh` 류 SSoT/drift 가드 스크립트는 (1) macOS 시스템 bash 3.2 호환 (CI Ubuntu 의 bash 4+ 통과해도 로컬 개발자가 첫 실행에서 차단) + (2) `mktemp` 격리 + env override + 4~5 케이스 매트릭스 동적 테스트가 필수.
>
> **근거**: volt [#95](https://github.com/coseo12/volt/issues/95) (bash 3.2) + [#98](https://github.com/coseo12/volt/issues/98) (격리 동적 테스트). harness `scripts/verify-agent-ssot.sh` (#145) / `verify-release-version-bump.sh` 등 이미 본 패턴으로 운영 중 — 신규 verify 스크립트 추가 시 회귀 방지용 박제.

---

## 1. macOS bash 3.2 호환 (#95)

### 배경

macOS 는 Apple 의 GPLv3 회피 정책으로 시스템 `/bin/bash` 가 GNU bash 3.2.57 (2007년) 에 고정. `brew install bash` 로 4+ 설치 가능하지만 별도 경로 (`/usr/local/bin/bash`, `/opt/homebrew/bin/bash`) 라 shebang `#!/usr/bin/env bash` 가 PATH 우선순위에 의존. **CI Ubuntu runner 는 bash 4+ 라 통과하지만 로컬 macOS 개발자가 즉시 차단당함**.

### bash 3.2 미지원 기능 (verify-*.sh 작성 시 자주 쓰이는 것)

- `declare -A` / 모든 associative array (`map[key]=val`) — bash 4.0+
- `${parameter,,}` / `${parameter^^}` 대소문자 변환 — bash 4.0+
- `mapfile` / `readarray` — bash 4.0+
- `coproc` — bash 4.0+
- `&>>` redirect append — bash 4.0+

### 미지원 패턴 (bash 4+) — 사용 금지

```bash
declare -A captured_content
for agent in "${AGENTS[@]}"; do
  captured_content[$agent]=$(grep ...)
done
```

증상:
```
scripts/verify-X.sh: line 32: declare: -A: invalid option
declare: usage: declare [-afFirtx] [-p] [name[=value] ...]
```

### 호환 패턴 — parallel index array + `sort -u`

```bash
captured_content=()  # AGENTS[i] 와 1:1 대응 index
for agent in "${AGENTS[@]}"; do
  captured_content+=("$(grep ...)")
done

# 동일성 검증: sort -u 패턴
unique_count=$(printf '%s\n' "${captured_content[@]}" | sort -u | wc -l | tr -d ' ')
```

harness 선례: `scripts/verify-agent-ssot.sh` (PR [#145](https://github.com/coseo12/harness-setting/pull/145)) — 5 페르소나 × N 필드 SSoT 검증을 parallel index array 로 작성. AGENT_DIR override 패턴도 동일 PR 에서 도입.

### 예방 박제

- 신규 `verify-*.sh` 첫 줄 주석 박제 의무:
  ```bash
  # 호환성 메모: macOS 시스템 bash 3.2 호환 위해 associative array 미사용 — parallel index array + sort -u 로 동일성 검증.
  ```
- 로컬 macOS 개발자 실측 의무 — CI 만 믿으면 사용자 첫 실행 차단

---

## 2. 격리 동적 테스트 — `mktemp` + env override (#98)

### 배경

`verify-*.sh` 류 SSoT 가드는 본질적으로 **negative-test 성격** (drift 를 fail 로 분류). 정적 분석 / lint 만으로는 가드 로직 자체 작동 보장 불가. **격리 디렉토리 + 4~5 케이스 매트릭스** 로 가드의 fail 분기까지 입증.

### 스크립트 측 박제 — env override 의무

```bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
# 테스트 격리용 — 기본 .claude/agents 외 경로 검사 시 AGENT_DIR override
AGENT_DIR="${AGENT_DIR:-${PROJECT_DIR}/.claude/agents}"
```

`AGENT_DIR` / `CHECK_DIR` / `BASE_DIR` 등 검사 대상 디렉토리는 env var override 가능하게 설계 (선행 의무). 격리 테스트가 시작점.

### 4~5 케이스 매트릭스

```bash
set -e
TMPDIR=$(mktemp -d -t verify-XXXXXX)
trap "rm -rf $TMPDIR" EXIT
cp -r .claude/agents "$TMPDIR/agents"

# 케이스 1: 정상 (PASS 기대)
AGENT_DIR="$TMPDIR/agents" bash scripts/verify-X.sh

# 케이스 2: SSoT 키 라인 제거 (FAIL 기대)
sed -i.bak '/SSoT 키 패턴/d' "$TMPDIR/agents/pm.md"
AGENT_DIR="$TMPDIR/agents" bash scripts/verify-X.sh || true

# 케이스 3: SSoT 키 한 글자 변경 (FAIL 기대)
cp .claude/agents/pm.md "$TMPDIR/agents/pm.md"  # 원본 복구
sed -i.bak 's/스킬 사용/스킬 호출/' "$TMPDIR/agents/qa.md"
AGENT_DIR="$TMPDIR/agents" bash scripts/verify-X.sh || true

# 케이스 4: 파일 부재 (FAIL 기대)
cp .claude/agents/qa.md "$TMPDIR/agents/qa.md"
rm "$TMPDIR/agents/developer.md"
AGENT_DIR="$TMPDIR/agents" bash scripts/verify-X.sh || true

# 케이스 5: SSoT 키 유지 + 부수 텍스트 drift (FAIL drift detect 기대)
cp .claude/agents/developer.md "$TMPDIR/agents/developer.md"
sed -i.bak 's/(#471)/(#999)/' "$TMPDIR/agents/reviewer.md"
AGENT_DIR="$TMPDIR/agents" bash scripts/verify-X.sh || true
```

### 매트릭스 의의

| 케이스 | 검증 대상 |
|--------|-----------|
| 1. 정상 | false-positive 부재 (정상을 정상으로 분류) |
| 2. SSoT 라인 완전 제거 | 누락 감지 분기 |
| 3. SSoT 키 자체 변형 | 누락 감지 분기 (키 매칭 변형 흡수) |
| 4. 파일 부재 | 파일 시스템 분기 |
| 5. SSoT 키 유지 + 부수 텍스트 drift | drift 감지 분기 (동일성 검증) |

### 자명 함정 회피

- **케이스 5 박제 의무** — 케이스 2/3 만 검증하면 "키 변경 = 누락" 분기만 검증되고 "부수 텍스트 drift" 분기 (실제 운영 빈도 1순위) 미검증
- **`trap EXIT` cleanup 의무** — 케이스 도중 fail 해도 TMPDIR 정리 (`set -e` 와 조합 시 trap 이 안전망)
- **`set +e` / `|| true` 박제** — fail 기대 케이스에서 종료 코드 활용 + 검증 누락 없이 다음 케이스 진행

### 적용 조건

- 신규 `verify-*.sh` / SSoT 가드 / 보안 가드 / drift 감지 스크립트
- env var override 가능한 설계 선행

---

## 3. 회귀 가드 시뮬레이션과의 직교성

격리 동적 테스트 (본 문서) 는 **스크립트 로직** 검증. 별도로 **CI 통합 + hashFiles 조건 + 실제 차단** 검증은 [guard-pr-dod.md](guard-pr-dod.md) 의 3중 시뮬레이션 (positive → negative → recovery) 으로 입증. 둘 다 통과해야 가드 작동이 완전 입증된다 (둘 중 하나만 통과 시 어딘가에 함정 잔존).

---

## 근거

- volt [#95](https://github.com/coseo12/volt/issues/95) — astro-simulator PR #496 `scripts/verify-create-pr-ssot.sh` 가 macOS 첫 실행에서 `declare: -A: invalid option` 차단. 호환 패턴 (`scripts/verify-agent-ssot.sh` harness #145) 일관성 유지로 해결
- volt [#98](https://github.com/coseo12/volt/issues/98) — 동일 PR 에서 격리 동적 테스트 5/5 PASS. AGENT_DIR override + 4~5 케이스 매트릭스 정립
- harness 선례: `scripts/verify-agent-ssot.sh` (PR [#145](https://github.com/coseo12/harness-setting/pull/145)) / `scripts/verify-release-version-bump.sh` — bash 3.2 호환 작성된 운영 사례
- GNU bash 4.0 release note (associative array 도입): 2009-02-20
- Apple bash 3.2 freeze 배경: GPLv3 회피
