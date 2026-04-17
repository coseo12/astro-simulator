# ADR: 신규 함수 중복 방지 가드 — pre-commit + CI warn-only

- 일자: 2026-04-17
- 상태: Accepted
- 관련: P6-E #193 (E4), P5 회고 "stateVectorAt 중복" 교훈 (`docs/retrospectives/p5-retrospective.md` §어려웠던 것 5)

## 배경

P5-D 구현 중 `physics/kepler.ts`에 `stateVectorAt`을 새로 작성한 뒤,
`physics/state-vector.ts`에 동일 기능의 `orbitalStateAt`이 이미 존재함을 발견했다
(P4-A에서도 사용됨). 코드베이스 탐색 누락으로 인한 **함수 중복**.

P5 회고는 이를 **자동화로 제도화**하기로 인계했다 — 수작업 가이드("grep 의무화")는
이미 CLAUDE.md·AGENTS.md에 있어도 경험적으로 스킵된다. P6-E는 이 가드를
**기계가 강제**하는 수준으로 박제한다.

**제약**:

- false positive는 반드시 warn-only (PR 차단 금지) — agent/사용자가 "의도된 신규 함수"를 증명할 수단이 별도 설계되지 않았음.
- Rust(`pub fn`)와 TypeScript(`export function`) 양쪽 커버 필수 — 중복은 양쪽 모두에서 발생 가능.
- CI만으로는 피드백 루프가 늦다 — 로컬에서 빠르게 발견해야 편집 중 바로잡기 쉽다.

## 후보 비교

### (1) 실행 지점

| 항목        | A: ESLint custom rule               | B: pre-commit 스크립트             | C: CI workflow (PR diff 대비 main)     | D: pre-commit(로컬) + CI(강제) 조합   |
| ----------- | ----------------------------------- | ---------------------------------- | -------------------------------------- | ------------------------------------- |
| 언어 커버   | TS만 (Rust 별도 custom lint 필요)   | **TS + Rust 모두** (grep·git diff) | TS + Rust 모두                         | TS + Rust 모두                        |
| 피드백 속도 | 편집 중 (가장 빠름)                 | 커밋 시 (중간)                     | PR 후 (가장 느림)                      | 커밋 + PR 2단계                       |
| 구현 비용   | 높음 (ESLint rule + Rust lint 신규) | **낮음** (쉘 스크립트 ~50줄)       | 낮음 (workflow YAML + 스크립트 재사용) | 중간 (스크립트 1개 + YAML)            |
| 회피 용이성 | ESLint disable 주석                 | `--no-verify` 커밋                 | **회피 불가** (PR 게이트)              | 둘 다 회피 시도 가능하지만 CI는 강제  |
| 유지보수    | 규칙 갱신 난도 높음                 | 스크립트 갱신 쉬움                 | 동일 스크립트 공유 가능                | 스크립트 1개 공유 — 유지보수 포인트 1 |

### (2) 매칭 알고리즘

| 항목                                          | A: 완전 일치만 | B: 부분 문자열 포함                    | C: Levenshtein 거리 ≤ k           | D: 정규화(camelCase/snake_case 통일) 후 부분 일치 |
| --------------------------------------------- | -------------- | -------------------------------------- | --------------------------------- | ------------------------------------------------- |
| 중복 `orbitalStateAt` vs `stateVectorAt` 탐지 | ✗ (글자 다름)  | ✗ (공유 부분 문자열 없음)              | △ (거리 ~7, 임계 낮춤 시 FP 폭주) | **✓** (`state` 공통 토큰 매칭)                    |
| false positive                                | 거의 없음      | 드물지만 `updateUser` vs `userUpdater` | 흔함 (임계 튜닝 어려움)           | 중간 (토큰 2개 이상 일치 조건으로 억제 가능)      |
| 구현 복잡도                                   | trivial        | trivial                                | 중간 (편집거리 계산)              | **낮음** (정규화 + 토큰 교집합)                   |

### (3) 실패 정책

| 항목      | A: error (exit 1)              | B: **warn-only** (exit 0 + 출력) | C: 환경변수 opt-in error    |
| --------- | ------------------------------ | -------------------------------- | --------------------------- |
| 피로도    | 높음 (false positive마다 차단) | 낮음                             | 중간                        |
| 실효성    | 강제력 최대                    | 중간 (무시 가능)                 | 릴리스 전 검사 시 강제 가능 |
| 초기 운영 | 위험 (규칙 정착 전)            | **안전**                         | 복잡                        |

## 결정

**(1) D + (2) D + (3) B 채택.**

### (1) 실행 지점 — pre-commit + CI 조합

- **pre-commit 훅**: `.husky/pre-commit` 에 스크립트 호출 추가. 빠른 피드백.
  - 대상: staged 파일 중 `*.ts`, `*.rs`. 변경된 함수 이름만 검사 (성능).
- **CI workflow**: `.github/workflows/ci.yml` 에 신규 job "duplicate-function-guard" 추가.
  - 대상: PR diff (base branch 대비). 변경된 함수 이름 전체 검사.
  - **두 경로 모두 동일 스크립트 호출** — 단일 진실 공급원 (`scripts/check-duplicate-functions.mjs`).

### (2) 매칭 알고리즘 — 정규화 + 토큰 교집합

- **정규화**: camelCase/snake_case를 lower 토큰 배열로 분리.
  - `orbitalStateAt` → `[orbital, state, at]`
  - `stateVectorAt` → `[state, vector, at]`
- **매칭 조건**: 기존 함수와 토큰 2개 이상 공유 **+ 같은 언어** (TS ↔ TS, Rust ↔ Rust).
  - `[orbital, state, at]` ∩ `[state, vector, at]` = `{state, at}` → 중복 후보.
- **토큰 stop-list**: `[get, set, at, from, to, of, is, has]` 같은 공통 접미/접두는 제외.
  - 위 예시에서 `at`은 stop-list → 실제 공유 토큰은 `{state}` 1개 → 기본 조건(≥2) 미달.
  - **보강**: `{state}` 같은 "의미 보유 도메인 토큰" 1개 공유 + 인자 수 동일 시 WARN으로 격상. (구체 튜닝은 dev 단계에서 실측 후 확정.)

### (3) 실패 정책 — warn-only (출력 + exit 0)

- **pre-commit / CI 둘 다 exit 0** — 개발 흐름 차단 안 함.
- 콘솔/PR log에 다음 형식으로 후보 출력:
  ```
  [duplicate-function-guard] WARN — 신규 함수가 기존과 유사합니다:
    신규: packages/core/src/physics/kepler.ts:123  export function stateVectorAt(...)
    기존: packages/core/src/physics/state-vector.ts:26  export function orbitalStateAt(...)
    공유 토큰: {state, at}
    → 기존 함수를 재사용하거나 의도적 신규임을 PR 본문에 명시하세요.
  ```
- **회피 근거**: 기존 함수 재사용 / 의도적 신규 (PR 본문에 1줄 명시)
- **격상 조건** (재검토 트리거): false negative 누적 (중복이 warn 없이 머지된 사례) ≥ 2건 → (3) C (환경변수 opt-in error)로 격상.

## 인터페이스 (예상 — 최종은 dev 단계에서 확정)

### 스크립트: `scripts/check-duplicate-functions.mjs`

```
# 사용법:
#   스테이지 모드 (pre-commit): staged 파일의 신규 함수만 검사
#   diff 모드 (CI): $BASE..HEAD 의 신규 함수만 검사
node scripts/check-duplicate-functions.mjs --staged
node scripts/check-duplicate-functions.mjs --base origin/main

# 출력: WARN 라인 (중복 후보마다 1블록). exit code = 0 (warn-only 정책).
# 회귀 테스트용 환경변수: DUPLICATE_GUARD_STRICT=1 → exit 1 (의도적 회귀 테스트 전용)
```

**동작**:

1. staged/diff 범위에서 추가된 라인 수집 (`git diff --cached` / `git diff $BASE..HEAD`)
2. 정규식으로 신규 `export (async )?function NAME` · `pub (async )?fn NAME` 추출
3. 각 NAME에 대해 코드베이스 전체 grep (`git grep -n`) → 동일 언어 기존 함수 수집
4. 정규화·토큰 교집합 → 조건 만족 시 WARN 블록 출력

### pre-commit 훅

```bash
# .husky/pre-commit
#!/usr/bin/env bash
./scripts/check-encoding.sh
node scripts/check-duplicate-functions.mjs --staged || true   # warn-only
pnpm lint-staged
```

### CI job

```yaml
# .github/workflows/ci.yml (신규 job)
duplicate-function-guard:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
      with: { fetch-depth: 0 } # base 대비 diff 필요
    - uses: actions/setup-node@v4
      with: { node-version: 20 }
    - name: 중복 함수 가드
      run: node scripts/check-duplicate-functions.mjs --base origin/${{ github.base_ref }}
```

## 회귀 테스트

`packages/*/tests/duplicate-guard.test.ts` 또는 Rust `#[test]`로 **의도적 중복 케이스**를 합성:

- 픽스처 1: `orbitalStateAt` (기존) + 신규 `stateVectorAt` → WARN 1건 출력 확인
- 픽스처 2: `measurePerihelionAngle` (기존) + 신규 `measurePerihelionPrecessionEih` → WARN 출력 확인
- 픽스처 3: 완전히 다른 함수 (`buildTree` vs `renderHud`) → WARN 출력 없음

`DUPLICATE_GUARD_STRICT=1` 로 스크립트 실행 → exit 1 확인 (회귀 테스트 전용 모드).

## 결과·재검토 조건

### OK 조건

- 회귀 테스트 픽스처 통과 (의도적 중복 케이스 WARN 출력 / 비중복 케이스 침묵)
- pre-commit 실 커밋 흐름에서 P6-E PR에서 false positive ≤ 1회
- CI 경로에서 P6-E 전 merge PR 대상 dry-run 시 false positive ≤ 3회

### 재검토 트리거

1. **false negative 누적** (중복 함수가 warn 없이 머지) ≥ 2건 → 매칭 알고리즘 강화
   - 임계 토큰 수를 1개로 낮추거나, Levenshtein 거리 병용 ((2) C 하이브리드)
2. **false positive 피로도** (개발자 무시 패턴) — PR 본문 주석 템플릿 자동화
3. **스크립트 성능 저하** (pre-commit 1초 초과) — staged 파일 증분 캐시 도입
4. **Rust 커버리지 부족** — `impl Trait` / `fn` 내부의 중첩 함수 미탐지 시 AST 기반 파서로 격상 (syn 크레이트)
5. **warn 무시 패턴 정착** — (3) C 환경변수 opt-in error 격상 (릴리스 전 검사 시 강제)

## 비-범위 (P6-E에서 하지 않음)

- ESLint custom rule 구현 ((1) A)
- Rust AST 파서 기반 정밀 추출 (syn) — (4) 재검토 트리거 발동 시 별도 ADR
- 함수 시그니처(인자 타입) 비교 — 이름 기반만으로 충분 (초기 운영)
- 파일 이동/리네임 추적 — git mv 후 동일 함수는 WARN에 잡히지만 false positive로 받아들임
- 테스트 파일 내 함수 검사 — `tests/**`, `*.test.*` 제외 (테스트 헬퍼 중복은 허용)

## 참고

- P5 회고: `docs/retrospectives/p5-retrospective.md` §어려웠던 것 5 (stateVectorAt 중복 계기)
- CLAUDE.md "CRITICAL DIRECTIVES" — "모호한 지시 사전 확인" / "실측 우선" 원칙의 자동화 버전
- Husky 9: https://typicode.github.io/husky
- GitHub Actions `fetch-depth: 0` 권장: https://github.com/actions/checkout#fetch-all-history-for-all-tags-and-branches
