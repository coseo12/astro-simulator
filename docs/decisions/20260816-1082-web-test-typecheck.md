# ADR: `apps/web` 45 + `packages/physics-wasm` 1 테스트 파일 타입 검사 강제 지점 — `ci.yml` `detect-and-test` 배선 + physics-wasm `tsconfig` 신설 (#1082)

- 일자: 2026-08-16
- **상태**: **Provisional** (cross-validate 미수행 — 메인 오케스트레이터가 수행 후 §교차검증 반영 사항 4축 통합 + `Accepted` 전이 + 인덱스 상태 열 동시 갱신). ⚠️ 본 라인은 [`20260812-1005`](20260812-1005-adr-index-status-guard.md) §재검토 조건의 **어순 제약** 대상이다 — 현재 상태 토큰이 최선두여야 한다
- 관련: 이슈 [#1082](https://github.com/coseo12/astro-simulator/issues/1082) / 분리 출처 [#1060](https://github.com/coseo12/astro-simulator/issues/1060) §실측 B / 선행 ADR [`20260814-1060`](20260814-1060-packages-test-typecheck.md) (명령 형태 규약 결정 3 · 배선 지점 선례) · [`20260814-960`](20260814-960-worktree-typecheck-recipe.md) (`apps/web` typecheck 선행 조건 2축) · [`20260807-971`](20260807-971-required-status-checks.md) 결정 1 (required check 관할) · [`20260808-983`](20260808-983-measurement-recording-convention.md) (수치 박제 규약)
- 측정 rev: `d0b5b5e` (`origin/develop` tip, 2026-08-16). 본 문서의 **로컬** 수치는 이 rev 단일 시점에 **격리 worktree** 1개에서 `pnpm install --frozen-lockfile` + `pnpm build` 후 일괄 도출했다 ([`20260808-983`](20260808-983-measurement-recording-convention.md) §부분 재측정 금지). 실행 환경은 macOS / pnpm `10.32.1` (= 루트 `packageManager` 핀) / TypeScript `6.0.3` / Next `16.2.12` / Node `v24.14.0`. ⚠️ **Node 는 `.node-version` 핀 (`22.16.0`) 과 다르다** — 아래 결론 중 Node 버전에 의존하는 것은 없으나(전부 `tsc` · `next` · `pnpm` 종료 코드) 표기해 둔다. **CI** 수치는 `gh api` (GET 전용) job-level 조회이며 run id 를 함께 적는다

## 배경

#1060 이 `packages/{shared,core}` `58` 파일의 타입 검사 강제 지점을 배선하는 과정에서 **이슈 본문 전제 1건이 반증**됐다 — `next build` 는 `*.test.*` 파일을 타입 검사에서 제외한다 (ADR [`20260814-1060`](20260814-1060-packages-test-typecheck.md) §실측 B, 프로브 `4` 개). 그 ADR 은 `apps/web` `45` + `packages/physics-wasm` `1` 을 **의도적 비-범위**로 남기고 후속 분리를 명시했다 (결정 5). 본 ADR 이 그 분리분이다.

본 ADR 은 착수 시점 rev `d0b5b5e` 에서 **결손을 재측정한다** (CLAUDE.md §인계 항목 실측 재검증 — 해소됐으면 NO-OP ADR 이 정답이다). **결과: 해소되지 않았다. NO-OP 아님.** 그리고 재측정 과정에서 **`packages/physics-wasm` 은 배선만으로 닫히지 않는다**는 사실이 새로 드러났다 (§실측 C).

## 실측 A — 결손 재확인 (`d0b5b5e`)

### A-1. 모집단 — `apps/web` `45` + `packages/physics-wasm` `1`

```bash
# 비-ASCII 경로 0 확인 (git 의 C-인용이 grep 앵커를 깨는 함정 배제)
git ls-files -z | tr '\0' '\n' | grep -cP '[^\x00-\x7F]'                       # 0

git ls-files -z | tr '\0' '\n' | grep -E '\.test\.tsx?$' \
  | sed -E 's#^(apps/[^/]+|packages/[^/]+|scripts).*#\1#' | sort | uniq -c
#   45 apps/web / 56 packages/core / 1 packages/physics-wasm / 1 packages/shared
```

**`0` 이 아닌 값을 주장하는 자리마다 같은 실행에 양성 대조군을 붙였다.**

| 대상 | `*.test.tsx?` | 전체 `.tsx?` (양성 대조군) | 술어 |
| --- | ---: | ---: | --- |
| `apps/web` | `45` | `102` | `git ls-files -z -- <경로> \| tr '\0' '\n' \| grep -cE '<패턴>'` |
| `packages/physics-wasm` | `1` | `2` | 같음 |

`tsc` 가 실제로 그 파일들을 **프로그램에 넣는지**도 구성 추론이 아니라 컴파일러 출력으로 확인했다.

```bash
cd apps/web && npx tsc --noEmit --listFiles -p tsconfig.json > /tmp/listfiles.log ; echo $?   # 0
grep -E "apps/web/(src|app)/.*\.test\.tsx?$" /tmp/listfiles.log | wc -l                       # 45
grep -E "apps/web/(src|app)/" /tmp/listfiles.log | grep -vE "\.test\.tsx?$" | wc -l           # 55  (양성 대조군)
grep -cE "^/.*/apps/web/" /tmp/listfiles.log                                                  # 104
```

`git ls-files` 의 `45` 와 `--listFiles` 의 `45` 가 **독립 술어 2개로 일치**한다.

⚠️ **모집단 술어의 한계**: 이 술어는 `*.test.ts` · `*.test.tsx` 접미만 덮는다. `apps/web/scripts/**` 와 루트 `scripts/**` 의 `.mjs` 검증 스크립트는 `allowJs: false` 때문에 애초에 `tsc` 대상이 아니다 (§의도적 비-범위). `45` 는 _"이 술어가 잡는 전부"_ 이지 _"테스트 성격 파일 전부"_ 가 아니다.

### A-2. 3중 시뮬레이션 (positive → negative → recovery) + **같은 실행 양성 대조군**

probe = `apps/web/src/components/layout/about-modal.test.tsx` 말미에 `const __probe1082: number = 'not-a-number';` 주입.

```bash
# positive (주입 전)
pnpm --filter @astro-simulator/web typecheck ; echo $?    # 0 / `error TS` 0 행
#   wall 3회: 2.919s / 2.574s / 1.904s

# negative (주입 후) — 현행 CI 가 통과시키는 경로
pnpm build ; echo $?                                      # 0  ← composite `setup-and-build` 와 동일 명령
grep -c "Type error" <build 로그>                          # 0

# negative (주입 후) — 닫으려는 경로
pnpm --filter @astro-simulator/web typecheck ; echo $?     # 2
# src/components/layout/about-modal.test.tsx(60,7): error TS2322: Type 'string' is not assignable to type 'number'.
# src/components/layout/about-modal.test.tsx(60,7): error TS6133: '__probe1082' is declared but its value is never read.
```

**양성 대조군은 같은 실행 안에 넣었다.** 위 test probe 를 **제거하지 않은 채** 비-테스트 파일 `apps/web/src/__probe1082-control.ts` (도달 불가, 내용은 `export const __probe1082Control: number = 'not-a-number';`) 를 추가하고 `pnpm build` 를 다시 돌렸다.

| 관측 | 값 | 해석 |
| --- | ---: | --- |
| `pnpm build` exit | `1` | `next build` 는 타입 검사를 **하고 있다** (검사 자체가 꺼진 게 아니다) |
| `Type error` 건수 | `1` | 보고된 것은 `./src/__probe1082-control.ts:1:14` **하나뿐** |
| test probe 보고 | `0` | 같은 실행에 **존재했는데도** 보고되지 않았다 |

즉 #1060 §실측 B 의 B-3(도달 불가 비-테스트 → 잡힘) · B-4(테스트 이름 → 안 잡힘) 대조가 **새 rev 에서 단일 실행으로 재현**된다. 축은 도달성이 아니라 **파일명**이다.

```bash
# recovery
rm -f apps/web/src/__probe1082-control.ts
git checkout -- apps/web/src/components/layout/about-modal.test.tsx
pnpm --filter @astro-simulator/web typecheck ; echo $?     # 0 / `error TS` 0 행
git status --porcelain                                     # (빈 출력)
```

**결손의 형태는 "깨져 있음" 이 아니라 "강제 지점 부재"** 다 — baseline 은 무결하고, 타입 오류가 들어와도 CI 경로가 초록이다. #840 (`--if-present` silent no-op) 과 같은 클래스다.

## 실측 B — 선행 조건은 **한 곳에만** 있다 (배선 지점 판정의 입력)

`apps/web` 의 `typecheck` 는 `next-env.d.ts` (축 i) + `packages/{shared,core}/dist` (축 ii) 를 요구한다 (ADR [`20260814-960`](20260814-960-worktree-typecheck-recipe.md) §결손 2축). #1060 이 채택한 `verify-and-rust` job 에서 이것이 실제로 어떻게 죽는지 측정했다.

**시뮬레이션 방법**: `pnpm build` 완료 상태에서 `next build` 산출물만 제거하고 (`apps/web/.next` · `apps/web/next-env.d.ts` · `apps/web/tsconfig.tsbuildinfo`) `packages/{shared,core}/dist` 와 `packages/physics-wasm/pkg` 는 **유지**했다 — 그것이 `verify-and-rust` 의 `workspace 빌드 (wasm → shared → core)` 스텝이 만드는 상태다.

| 상태 | exit | `error TS` 행 | 내역 |
| --- | ---: | ---: | --- |
| `verify-and-rust` 재현 (dist·pkg 있음, `next build` 산출물 없음) | `2` | `2` | **전건 `TS2882`** |
| `+` `pnpm --filter @astro-simulator/web exec next typegen` (`0.552s`, exit `0`) | **`0`** | **`0`** | — |

```
app/layout.tsx(4,8): error TS2882: Cannot find module or type declarations for side-effect import of 'pretendard/dist/web/variable/pretendardvariable.css'.
app/layout.tsx(5,8): error TS2882: Cannot find module or type declarations for side-effect import of './globals.css'.
```

⚠️ **기각 근거를 과장하지 않기 위해**: 이슈 본문의 _"거기서는 죽는다"_ 는 **맞다**. 그러나 _"그래서 불가능하다"_ 는 **거짓**이다 — `next typegen` `0.552s` 1 스텝이면 살아난다 (typegen 후 typecheck `3.829s` / `error TS` `0` 행). 축 (ii) 는 `verify-and-rust` 가 이미 닫아 두므로 `TS2307` 은 애초에 나타나지 않는다. 따라서 배선 지점 선택은 _"가능/불가능"_ 이 아니라 **비교** 문제다 (§후보 비교 1).

`detect-and-test` 쪽은 보정이 `0` 스텝이다. 위 §실측 A-2 의 `pnpm build` (exit `0`, 로컬 wall `31.5s` 냉시작) 가 축 (i)(ii) 를 동시에 닫고, 그 직후 typecheck 이 exit `0` 이다 — 그게 A-2 의 positive 그 자체다.

## 실측 C — `packages/physics-wasm` 은 **배선만으로 닫히지 않는다**

`packages/physics-wasm` 은 `tsconfig.json` 이 **없고** `typecheck` 가 `echo 'typecheck: TS 없음, cargo check 사용'` 이다. 그 문장은 **거짓**이다 — tracked `.ts` 가 `2` 개 있다 (`tests/binding.test.ts` · `vitest.config.ts`, §실측 A-1 양성 대조군).

프로브 `tsconfig.__probe1082.json` 을 만들어 (`packages/core/tsconfig.json` 미러 + `include: ["tests/**/*.ts", "vitest.config.ts"]`) 상태별로 측정했다. 모든 실행은 `pnpm --filter @astro-simulator/physics-wasm exec tsc --noEmit -p <프로브>` 다.

| 프로브 | `pkg/` | `@ts-expect-error` | exit | 보고된 오류 |
| --- | :---: | :---: | ---: | --- |
| **P1** | 있음 | 유지 | `1` | `tests/binding.test.ts(12,1): error TS2578: Unused '@ts-expect-error' directive.` |
| **P2** | **없음** | 유지 | `1` | `TS2578` **그대로** `+` `(18,8) TS2307: Cannot find module '../pkg/physics_wasm.js'` |
| **P3** | 있음 | **12행 삭제** | **`0`** | — |
| **P4** | 없음 | 12행 삭제 | `1` | `(17,8) TS2307` |
| **P5** (negative) | 있음 | 12행 삭제 `+` 타입 오류 주입 | `1` | `(198,7) TS2322` `+` `(198,7) TS6133` |

⚠️ `exit 1` 은 pnpm 이 `tsc` 의 원시 exit `2` 를 `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL` 로 정규화한 값이다. CI 판정에는 무관하다 (비-`0`).

### C-1. 그 `@ts-expect-error` 는 **양쪽 상태 모두에서 죽어 있었다**

`tests/binding.test.ts` 의 해당 구간은 다음과 같다 (행 번호는 rev `d0b5b5e`).

```
11  import { describe, expect, it } from 'vitest';
12  // @ts-expect-error — pkg/는 빌드 산출물(gitignored). test 스크립트가 선빌드한다.
13  import {
14    BarnesHutEngine,
...
18  } from '../pkg/physics_wasm.js';
```

지시자는 `12` 행에 있으므로 **`13` 행**(`import {`)을 겨냥한다. 그런데 `TS2307` 은 **`18` 행 `8` 열**(module specifier 위치)에 보고된다. 즉 이 지시자는 **의도한 오류를 한 번도 억제한 적이 없고** (P2 에서 `TS2307` 이 그대로 살아 있다), 동시에 **자기 자신이 `TS2578` 을 만든다** (P1·P2 양쪽). 주석이 선언한 계약(_"pkg 는 빌드 산출물이라 미해결일 수 있다"_)과 구현이 어긋난 CLAUDE.md §주석 계약 vs 구현 drift 사례이며, **`packages/physics-wasm` 이 한 번도 타입 검사된 적이 없어서** 아무도 몰랐다.

따라서 physics-wasm 편입은 **배선(워크플로 1행) 이 아니라 패키지 변경 3건 + 소스 1행 삭제**를 요구한다.

### C-2. `tsc` 해석 경로가 **암묵 hoist 에 의존**한다

```bash
pnpm --filter @astro-simulator/physics-wasm exec which tsc   # <repo>/node_modules/.bin/tsc   ← 루트
pnpm --filter @astro-simulator/shared       exec which tsc   # ./node_modules/.bin/tsc        ← 자기 것
node -p "JSON.stringify(require('./packages/shared/package.json').devDependencies)"
# {"@vitest/coverage-v8":"^4.1.10","typescript":"^6.0.0","vitest":"^4.1.10"}
node -p "JSON.stringify(require('./packages/physics-wasm/package.json').devDependencies)"
# {"vitest":"^4.1.10"}
```

`shared` · `core` 는 `typescript` 를 **선언**하고 자기 `node_modules/.bin` 에서 해석한다. `physics-wasm` 은 선언이 없어 루트 hoist 로 우연히 동작한다. 지금 동작한다는 사실이 _"선언하지 않아도 된다"_ 의 근거는 아니다 — 이 저장소가 반복 청산해 온 **암묵 의존** 클래스다.

## 명령 형태 규약 재현 (ADR `20260814-1060` 결정 3)

본 ADR 은 그 규약에 의존하므로 같은 rev · 같은 pnpm 핀에서 재현했다.

```bash
pnpm --fail-if-no-match --filter @astro-simulator/web typecheck          ; echo $?   # 0
pnpm --fail-if-no-match --filter @astro-simulator/nonexistent typecheck  ; echo $?   # 1
#   "No projects matched the filters in ..."
pnpm --filter @astro-simulator/nonexistent typecheck                     ; echo $?   # 0  ← silent
```

## 후보 비교 1 — 배선 지점

`main` 브랜치 보호는 **조회만** 했다 (GET). 본 ADR 은 저장소 설정을 변경하지 않는다.

| 안 | 지점 | 선행 조건 보정 | 판정 |
| --- | --- | --- | --- |
| **(a)** | `ci.yml` / `detect-and-test`, `setup-and-build` composite **직후** | **`0` 스텝** — composite 의 루트 `pnpm build` 가 축 (i)(ii) 와 `pkg/` 를 동시에 만든다 | **채택** |
| (b) | `ci-physics-wasm.yml` / `verify-and-rust` (#1060 스텝 인접) | `+1` 스텝 (`next typegen`, `0.552s`) | 기각 (아래) |
| (c) | `project-guards.yml` / `project-guards` | 불가 — 의존성 `0` 워크플로 (pnpm·node setup·install 전부 없음) | 기각 |
| (d) | 신규 워크플로 파일 | 새로 세워야 함 `+` required 표면 동명 축 영향 (ADR `20260807-971` §2-5) | 기각 |
| (e) | `setup-and-build` composite 내부 | `0` — 그러나 composite 소비 워크플로 **전부**에 과세 | 기각 |
| (f) | 로컬 스크립트 · pre-commit hook 만 | 해당 없음 | 기각 |

### (a) 채택 근거

1. **`next build` 가 도는 job 은 저장소에서 여기 하나뿐이다.** `apps/web` typecheck 선행 조건 2축을 **정본 경로**로 만드는 명령이 루트 `pnpm build` 이고 (ADR [`20260814-960`](20260814-960-worktree-typecheck-recipe.md) §결정 1 — _"정본 레시피는 기존 명령 2개다"_), 그 명령을 이미 돌리는 CI job 이 `detect-and-test` 다. **선행 조건 생산자와 소비자가 같은 job 에 있다.**
2. **같은 `pnpm build` 가 `packages/physics-wasm/pkg` 도 만든다** (`pnpm -r build` 에 physics-wasm 이 포함 — 로컬 실행 로그 및 composite `wasm + workspace 빌드` 스텝). 즉 #1082 의 **두 대상이 한 지점에서 동시에 충족**되고 스텝이 `1` 개로 끝난다.
3. **fail-fast 위치 가치.** composite 은 `970s` job 의 `69s` 지점에서 끝나고 그 뒤로 브라우저 회귀 가드 `~900s` 가 이어진다 (§비용). 테스트 파일 타입 오류를 여기서 끊으면 나머지를 태우지 않는다. (소스 타입 오류는 composite 안의 `next build` 가 이미 끊는다 — 이 절약은 **테스트 파일 오류에 한정**된다.)
4. **required 승격 궤도.** `detect-and-test` 는 ADR [`20260807-971`](20260807-971-required-status-checks.md) 결정 1 의 **Phase 2** 후보이고 `verify-and-rust` 는 **Phase 3 (선택)** 이다. #1060 은 이 장점이 _"본 이슈에서 실현되지 않는다"_ 며 기각했는데 (그 ADR §후보 비교 1 (b) 기각 근거 2), 그 논거는 **강제력 등급이 오늘 같다**는 것이었고 오늘도 참이다. 다만 본 ADR 에서는 이 축이 **(a) 를 지지하는 방향**으로 놓인다 — 뒤집힌 것이 아니라, #1060 에서 (b) 의 유일한 진짜 장점이던 것이 여기서는 채택안 쪽에 있다.
5. **한계 비용 비율이 더 낮다** (§비용) — `detect-and-test` `970s` 대비 vs `verify-and-rust` `137s` 대비.

### (b) 기각 근거 — 그리고 **(b) 의 진짜 장점을 먼저 적는다**

(b) 에는 실질 장점이 있다. #1060 이 `verify-and-rust` 를 고른 핵심 논거가 _"같은 파일 집합의 두 검증(실행 · 타입)을 한 job 이 소유하면 선행 조건 유지 책임이 한 곳에 남는다"_ (volt [#120](https://github.com/coseo12/volt/issues/120)) 인데, **그 job 의 `pnpm -r test` 는 `apps/web` 45 파일과 `binding.test.ts` 도 실행한다.** 즉 (b) 를 고르면 저장소의 모든 typecheck 배선이 한 job 에 모이고 그 원칙이 전 파일에 일관되게 적용된다. **본 ADR 은 그 원칙을 이 46 파일에 대해 깨는 것을 인정한다** (§결과 4 · §재검토 조건 8).

그럼에도 기각하는 이유:

1. **선행 조건 출처가 하나 더 생긴다.** (b) 는 `next typegen` 을 CI 에 들인다. 그런데 ADR [`20260814-960`](20260814-960-worktree-typecheck-recipe.md) §결정 3 은 `next typegen` 을 **"Rust 툴체인 부재로 `pnpm build` 불가 시" 폴백**으로 지정했다. `verify-and-rust` 는 Rust 툴체인을 **가진** job 이라 거기서 폴백을 쓰는 것은 위계가 뒤집힌 사용이고, 로컬 정본 레시피(`pnpm install` + `pnpm build`)와 CI 경로가 갈린다 — ADR `20260814-960` §결과 4 가 지키려던 _"절차 SSoT 가 하나"_ 를 CI 쪽에서 되돌리는 셈이다.
2. **그 job 의 자기 선언과 충돌한다.** `verify-and-rust` 의 기존 주석은 _"composite setup-and-build 미사용 … composite 는 Playwright 설치 + 루트 `pnpm build` (web next build 포함) 를 무조건 수행 — vitest 에 불필요한 비용"_ 이라고 적혀 있다. Next 툴링을 그 job 에 들이는 것은 문자 그대로의 위반은 아니나(`next typegen` 은 `next build` 가 아니다) 그 선언이 그은 경계를 흐린다.
3. **한계 비용 비율이 높다** — `137s` job 에 `~7s` 는 `~5%`, `970s` job 에는 `~0.7%` (§비용).
4. **#1060 구현 PR 이 지금 그 job 의 같은 구간을 편집 중이다.** 운영 사유이지 설계 사유는 아니므로 위 3개 뒤에 적는다. 다만 실효적으로 직렬 의존과 충돌을 만든다.

### (c)(d)(e)(f) 기각 근거

- **(c)** `project-guards` 는 required 3종 중 하나지만 **의존성 `0`** 이 성립 조건이다 (ADR `20260807-971` 결정 1). pnpm·node setup + install + `pnpm build` 를 들이면 그 전제가 무너진다. `npx tsc@<버전>` 하드핀은 `pnpm-lock.yaml` 에 이은 세 번째 버전 출처를 만든다 — `ci.yml` `#952` 주석이 prettier 에 대해 같은 이유로 이미 기각한 형태다.
- **(d)** 신규 체크런 이름은 required check 표면의 동명 축에 영향을 준다 (ADR `20260807-971` §2-5). 얻는 것이 없다.
- **(e)** composite 은 `8` 워크플로가 소비한다 (composite 헤더 주석). 타입 검사 1회를 위해 전 소비처에 과세하는 것은 불비례다 — ADR `20260814-960` §D 가 `postinstall` 을 기각한 것과 같은 형태의 논거다.
- **(f)** 결손의 정의가 _"CI 강제 지점 부재"_ 다. pre-commit hook 도 대체재가 아니다 — 격리 worktree sub-agent 는 `--no-verify` 를 상시 쓴다 (`ci.yml` `#952` 주석의 실측 선언).

## 후보 비교 2 — `packages/physics-wasm` 처리 방침

이슈 완료 조건 3항이 _"검사 대상 편입 / 명시적 범위 밖 선언 중 하나. **침묵 기각 금지**"_ 를 요구한다.

| 안 | 내용 | 판정 |
| --- | --- | --- |
| **(A)** | `tsconfig.json` 신설 + `typecheck` 를 `tsc --noEmit` 로 교체 + 죽은 `@ts-expect-error` 삭제 + `typescript` devDep 선언 | **채택** |
| (B) | 명시적 범위 밖 선언 (`echo` no-op 유지) | 기각 |
| (C) | `binding.test.ts` 를 `packages/core` 로 이관해 기존 배선에 편입 | 기각 |
| (D) | (A) 에서 `@ts-expect-error` 를 **삭제 대신 `18` 행으로 이동** | 기각 |

- **(B) 기각** — `echo 'typecheck: TS 없음, cargo check 사용'` 은 **사실이 아닌 문장**이 커밋된 산출물 안에서 exit `0` 을 내는 형태이며 `--if-present` silent no-op (#840) 과 같은 클래스다. 파일이 `1` 개라는 것은 비용이 작다는 뜻이지 남겨 둘 근거가 아니다. 실측 비용은 `0.689~0.802s` (§비용).
- **(C) 기각** — `binding.test.ts` 는 **wasm-bindgen 경계**를 검증한다 (파일 헤더가 그렇게 선언한다). 검증 대상 패키지에서 떼면 `pkg/` 선행 조건이 다른 패키지로 새고, `verify-test-coverage.mjs` 가 강제하는 _"모든 워크스페이스에 vitest 설정"_ 구조와도 어긋난다.
- **(D) 기각** — 지시자를 살리면 `pkg/` 미해결을 **의도적으로 억제**하게 되어 바인딩 표면 전체(`BarnesHutEngine` · `NBodyEngine` · `add` · `extract_osculating_elements`)가 타입 검사에서 빠진다. 그것은 본 ADR 이 얻으려는 커버리지 자체를 지우는 선택이다. 지시자를 지우면 `pkg/` 부재 시 `TS2307` 로 **크게 죽는데** (P4), 이는 `packages/{shared,core}` 가 `dist` 부재 시, `apps/web` 이 `next-env.d.ts` 부재 시 죽는 것과 **같은 계약**이다 — 선행 조건 미충족은 fail-fast 가 정상 동작이다 (CLAUDE.md §가드 설계 원칙).

⚠️ **별도 `verify-*.mjs` 단언 스크립트를 만들지 않는다.** `tsc` · `pnpm` 종료 코드가 이미 fail-fast 다. ADR `20260814-1060` 이 같은 자리에서 내린 판단(_"가드를 위한 가드를 신설하면 그것이 다시 검증 대상이 된다"_)을 일관 적용한다. 이 선택의 대가는 §재검토 조건 2·3 이 감시한다.

## 비용

### CI (job-level, `gh api` GET)

```bash
gh api repos/coseo12/astro-simulator/actions/runs/<RUN_ID>/jobs \
  --jq '.jobs[] | select(.name=="<JOB>") | {conclusion, dur_s: ((.completed_at|fromdate) - (.started_at|fromdate))}'
```

| job | run `31929876027` (`d0b5b5e`) | run `31897129764` (`aa8c379`) | run `31896358263` (`42870a4`, docs-only) |
| --- | ---: | ---: | ---: |
| `detect-and-test` (`ci.yml`) | `970s` | `798s` | `37s` |
| `verify-and-rust` (`ci-physics-wasm.yml`) | `137s` (run `31929875995`) | `119s` (run `31897129772`) | — |

step 분해 (run `31929876027`, `detect-and-test`): composite `69s` / 그 뒤 브라우저 회귀 가드 상위 3개가 `267s` · `121s` · `114s`. **무거운 구간은 composite 이 아니라 브라우저 가드다.**

`42870a4` 의 `37s` 는 docs-only PR 로, composite step conclusion 이 `skipped` 였다 (같은 GET 의 `.steps[]` 조회). **본 스텝의 `if:` 는 composite 과 반드시 같아야 한다** — 다르면 docs-only PR 에서 `next-env.d.ts` 없이 typecheck 이 돌아 `TS2882` 오탐 FAIL 한다 (§실측 B).

### 로컬 (`d0b5b5e`, warm, `pnpm build` 이후) — 3회 wall

| 명령 | 1 | 2 | 3 |
| --- | ---: | ---: | ---: |
| `pnpm --fail-if-no-match --filter @astro-simulator/web typecheck` | `2.919s` | `2.574s` | `1.904s` |
| `pnpm --filter @astro-simulator/physics-wasm exec tsc --noEmit -p <프로브>` | `0.802s` | `0.726s` | `0.689s` |

합산 `2.6~3.7s`.

### CI 외삽 — **[가정]** 이며 실측이 DoD 다

같은 rev 에서 로컬 `pnpm build` 는 `31.5s` (냉시작), CI composite 은 `69s` 로 배율 약 `2.2` 다. 이를 적용하면 신규 스텝은 **`6~8s` [가정]** 이고 `detect-and-test` `970s` 대비 **`0.6~0.8%`**, `verify-and-rust` `137s` 대비 `4.4~5.8%` 다.

⚠️ 이 배율은 상한 성격이 아니다 — composite 은 Playwright 캐시 복원·Rust 툴체인 설치 등 로컬 `pnpm build` 에 없는 작업을 포함한다. **실측은 구현 PR 이 job-level API 로 수행해 박제하며 그것이 이슈 완료 기준 4항이다** ([`operational-friction.md`](../ops/operational-friction.md) §6). 단일 run 대조는 러너 편차가 섞이므로 한계를 함께 적는다 (§6 명시 요구).

**판정: 수용 가능.** 무거운 구간이 브라우저 가드(`~900s`)이고 신규 스텝은 그 앞에서 fail-fast 하므로, 실패 경로에서는 **오히려 순감**한다.

## 결정

1. **`apps/web` `45` + `packages/physics-wasm` `1` 테스트 파일 타입 검사를 CI 에 배선한다.** 결손은 `d0b5b5e` 에서 재확인됐다 — NO-OP 아님 (§실측 A).
2. **배선 지점은 `.github/workflows/ci.yml` 의 `detect-and-test` job**, `r1-guard: 툴체인 + Playwright + build (composite #802)` 스텝 **직후** · `r1-guard: next start 기동 + readiness (3/4)` 스텝 **직전**. 스텝 `1` 개, 명령 `2` 개.
3. **`if:` 는 위 composite 과 동일한 `needs.diff-scope.outputs.code_changed == 'true'` 를 쓴다.** 다르게 두면 docs-only PR 에서 오탐 FAIL 한다 (§비용).
4. **명령 형태는 패키지별 분리 호출 + `--fail-if-no-match`** — ADR [`20260814-1060`](20260814-1060-packages-test-typecheck.md) 결정 3 의 일반 규약을 그대로 따른다 (본 rev 재현 완료).
5. **`packages/physics-wasm` 은 검사 대상에 편입한다** (§후보 비교 2 (A)). 필요한 변경은 `4` 건이다.
   - `packages/physics-wasm/tsconfig.json` **신설** — `packages/core/tsconfig.json` 미러, `include: ["tests/**/*.ts", "vitest.config.ts"]`, `exclude: ["node_modules", "pkg", "pkg-bundler", "target"]`
   - `packages/physics-wasm/package.json` — `"typecheck": "tsc --noEmit"` (기존 `echo` no-op 교체. 그 문장은 사실이 아니었다)
   - `packages/physics-wasm/package.json` — `devDependencies` 에 `"typescript": "^6.0.0"` 선언 (`shared`·`core` 와 동형. 루트 hoist 암묵 의존 제거 — §실측 C-2). **`pnpm-lock.yaml` 갱신 동반**
   - `packages/physics-wasm/tests/binding.test.ts` — **`12` 행 `@ts-expect-error` 삭제**. 그 지시자는 양쪽 상태 모두에서 죽어 있었다 (§실측 C-1)
6. **저장소 설정은 변경하지 않는다.** required status check 목록 · branch protection 무접촉 — ADR [`20260807-971`](20260807-971-required-status-checks.md) 결정 1 관할. 본 가드의 강제력 등급은 **체크런 붉은 X + 메인의 CI 확인**이며 이 저장소 CI 가드 대부분과 같은 등급이다.
7. **`packages/{shared,core}` 경로는 무접촉** — #1060 소관이며 구현이 병행 중이다.

박제할 스텝 (dev 인계용 원문):

```yaml
      # ============================================================
      # #1082 — apps/web (45) + packages/physics-wasm (1) 테스트 파일 타입 검사
      # ============================================================
      # ADR: docs/decisions/20260816-1082-web-test-typecheck.md
      # 왜 필요한가: `next build` 는 `*.test.*` 를 타입 검사에서 제외한다 (도달성 축이 아니라
      #   파일명 축 — ADR 20260814-1060 §실측 B, 본 rev 재현은 20260816-1082 §실측 A-2 의
      #   같은 실행 양성 대조군). 즉 위 composite 의 `pnpm build` 가 초록이어도 테스트 파일의
      #   타입 오류는 그대로 통과한다.
      # 왜 여기인가: apps/web 의 typecheck 은 `next-env.d.ts` + packages/{shared,core}/dist
      #   를 요구하고 (ADR 20260814-960 §결손 2축), 그 2축을 한 번에 만드는 것은 위 composite 의
      #   루트 `pnpm build` 뿐이다 — 저장소에서 `next build` 가 도는 job 은 여기 하나다.
      #   같은 `pnpm build` 가 packages/physics-wasm/pkg 도 만들므로 physics-wasm typecheck 의
      #   선행 조건(wasm-pack 산출 .d.ts)도 여기서 함께 충족된다.
      # 왜 이 위치인가: composite 직후 = 아래 브라우저 회귀 가드 (~900s) 진입 전 fail-fast.
      # `if:` 는 위 composite 과 **반드시 같아야 한다** — docs-only PR 은 composite 가 스킵되어
      #   `next-env.d.ts` 가 없고, 그때 이 스텝만 돌면 TS2882 로 오탐 FAIL 한다 (실측: run
      #   31896358263 에서 composite conclusion=skipped).
      # 명령 형태는 ADR 20260814-1060 결정 3 규약 — 패키지별 분리 호출 + `--fail-if-no-match`.
      #   다중 `--filter` 단일 호출은 한쪽 스크립트 소실 시 exit 0 으로 조용히 스킵된다.
      - name: '#1082 apps/web + physics-wasm 타입 검사 (테스트 파일 포함)'
        if: needs.diff-scope.outputs.code_changed == 'true'
        run: |
          pnpm --fail-if-no-match --filter @astro-simulator/web typecheck
          pnpm --fail-if-no-match --filter @astro-simulator/physics-wasm typecheck
```

## 의도적 비-범위

- **`packages/{shared,core}` `58` 파일** — #1060 소관. 본 PR 은 `ci-physics-wasm.yml` 무접촉.
- **저장소 설정 (required check 승격 · branch protection)** — 결정 6.
- **`.mjs` 검증 스크립트** (`apps/web/scripts/**` · 루트 `scripts/**`) — `apps/web/tsconfig.json` 이 `allowJs: false` 라 `tsc` 대상이 아니다. 편입하려면 별도 구성 결정이 필요하므로 손대지 않는다.
- **`packages/physics-wasm` 의 Rust 측** — `cargo fmt` · `clippy --all-features` · `cargo test` 가 `verify-and-rust` 에 이미 있다.
- **기존 빌드 스텝의 다중 `--filter` silent no-op 수리** — #1060 §의도적 비-범위 와 같은 판단 (build 는 소실 시 후속 스텝이 크게 죽으므로 결과가 다르다).
- **`tsc` 프로그램 파일 수 하한 단언 스크립트 신설** — §후보 비교 2 말미. §재검토 조건 2·3 으로 대체한다.

## 결과

1. `apps/web` `45` + `packages/physics-wasm` `1` = **`46` 파일**이 CI 타입 검사 안으로 들어온다. #1060 의 `58` 과 합쳐 `git ls-files` 기준 `*.test.tsx?` **`103` 전건**이 덮인다.
2. baseline 은 무결하므로 도입 시 초록이며, **그 초록은 작동 증거가 아니다** — 증거는 negative 축(테스트 파일에 의도적 타입 오류를 주입한 PR 의 CI FAIL)이다 (CLAUDE.md §가드 도입 PR DoD).
3. `packages/physics-wasm` 의 `typecheck` 가 **사실이 아닌 문장을 출력하는 exit 0** 에서 실제 검사로 바뀐다. 부수로 죽은 `@ts-expect-error` `1` 개가 제거된다.
4. ⚠️ **typecheck 배선이 2 워크플로로 나뉜다** (`ci-physics-wasm.yml` `verify-and-rust` = shared·core / `ci.yml` `detect-and-test` = web·physics-wasm). #1060 이 세운 _"같은 파일 집합의 실행·타입을 한 job 이 소유"_ 원칙이 이 `46` 파일에 대해 깨진다. **발견성 비용을 인정하고 수용**하며 §재검토 조건 8 이 통합 트리거를 감시한다.

## 재검토 조건

1. **`apps/web/package.json` 의 `next` 버전이 오르면 §실측 A-2 를 재측정한다.** `next build` 의 `*.test.*` 제외는 **관측된 계약일 뿐 기전이 미판별**이다 — `next/dist/lib/typescript/writeConfigurationDefaults.js` 의 `'**/*.test.ts'` · `'**/*.test.tsx'` 제외 로직은 `process.env.NEXT_PRIVATE_LOCAL_DEV` 게이트 안이라 본 경로가 아니다 (측정 시점 Next `16.2.12`). 술어: **test probe 와 비-test control 을 같은 실행에** 넣고 `pnpm build` 의 exit 과 `Type error` 건수를 본다 (§실측 A-2 표 재현).
   ⚠️ **제외가 사라져도 본 스텝을 제거하지 않는다.** `tsc --noEmit` 은 Next 동작에 의존하지 않으므로 중복이 될 뿐 해롭지 않고, _"이제 `next build` 가 본다"_ 를 근거로 한 제거는 이 재측정 없이는 금지다.
2. **Next 가 `apps/web/tsconfig.json` 을 변조하기 시작하면 본 가드는 조용히 커버리지를 잃는다.** 현재는 변조하지 않는다 — 술어 `pnpm build` 후 `git status --porcelain` **빈 출력** (rev `d0b5b5e` 실측, ADR `20260814-960` §Claude 기각 3 과 일치). 트리거: 이 술어가 비어 있지 않게 되는 순간. 대조 기준은 §실측 A-1 의 `--listFiles` 계수 **`45`**.
3. **`apps/web/tsconfig.json` 의 `include` 가 좁아지거나 `exclude` 에 테스트 패턴이 추가되면** — `tsc` 는 검사할 파일이 `0` 개여도 exit `0` 이다. 대조 기준은 같은 `45`. `packages/physics-wasm` 쪽 대조 기준은 `2` (§실측 A-1 양성 대조군).
   ⚠️ 조건 2·3 은 **본 ADR 이 단언 스크립트를 신설하지 않기로 한 대가**다. 이 실패 모드가 **1회라도 실현되면** 후속 이슈로 계수 단언 도입을 재평가한다 (그때는 _"가드를 위한 가드"_ 논거보다 실현된 회귀가 무겁다).
4. **`packages/physics-wasm/pkg` 가 tracked 로 바뀌거나 wasm-pack 이 `.d.ts` 방출을 멈추면** §실측 C 의 P3·P4 를 재측정한다 — 결정 5 의 `@ts-expect-error` 삭제 근거가 그 산출물에 의존한다.
5. **pnpm 메이저 업그레이드 시** ADR [`20260814-1060`](20260814-1060-packages-test-typecheck.md) §후보 비교 2 의 `4` 개 종료 코드를 재측정한다 — 본 ADR 결정 4 가 그 의미론에 직접 의존하며, 그 ADR 이 `9.15.4` 에서 갈리는 반례를 이미 실측했다. SSoT 는 루트 `package.json` 의 `packageManager` 필드다.
6. **ADR [`20260807-971`](20260807-971-required-status-checks.md) Phase 2 또는 Phase 3 가 실행되면** 결정 6 의 강제력 등급 서술을 갱신한다.
7. **`setup-and-build` composite 에서 루트 `pnpm build` 가 빠지거나 `detect-and-test` 가 composite 호출을 멈추면** 본 스텝의 선행 조건이 소멸한다. 그때는 `TS2882` 로 **크게** 죽으므로 조용한 실패는 아니지만, 배선 지점 재평가 트리거다.
8. **#1060 스텝과 본 스텝을 통합해야 할 사유가 생기면** (두 워크플로 중 하나 폐지 / 한쪽만 required 승격 / `verify-and-rust` 가 `next build` 를 갖게 됨) §후보 비교 1 을 재평가한다. §결과 4 가 인정한 비용의 회수 지점이다.

## Forensic 변형 판정 — **일반 ADR** (5조건 중 `2`)

| 조건 | 충족 | 근거 |
| --- | :---: | --- |
| 1. 가설 `N≥2` | ✗ | 원인이 단일 확정 (CI 강제 지점 부재). 경쟁 가설 없음 |
| 2. Runtime 측정 필수 | ✓ | 정적 독해만으로는 (i) `next build` 의 파일명 축 제외 (ii) `verify-and-rust` 에서의 `TS2882` (iii) `@ts-expect-error` 의 사문화 — 셋 다 **추론에 그친다**. 전부 실행으로 확정했다 |
| 3. DoD PASS 인데 제품 회귀 | ✗ | 회귀 이력 없음. baseline 무결 |
| 4. `5±2` 옵션 비교 | ✓ | 배선 지점 `6` 안 + physics-wasm 방침 `4` 안 |
| 5. Amendment 라운드 `N` 예상 | ✗ | 가산 스텝 `1` 개 + 패키지 변경 `4` 건. cross-validate 1회 외 추가 라운드 근거 없음 |

**판정: `2 / 5` → 일반 ADR.** CLAUDE.md §Forensic ADR 변형 의 _"일반 ADR 로 시작 후 Amendment 1회 필요해지면 forensic 으로 승격"_ 경로를 열어 둔다.

## 교차검증 반영 사항

⚠️ **미수행 — 본 ADR 은 `Provisional` 이다.** cross-validate 는 메인 오케스트레이터가 수행하며 (#479 — sub-agent 직접 호출 금지), 통합 후 `Accepted` 전이 + `docs/decisions/README.md` 상태 열 동시 갱신 ([`20260812-1005`](20260812-1005-adr-index-status-guard.md) 가 강제).

**호출 전 Claude 편향 셀프 체크** ([cross-validate-protocol.md](../guides/cross-validate-protocol.md) §5 4종) — architect 자기 점검 결과:

- **낙관적 일정** — 통과. 스텝 `1` 개 + 패키지 변경 `4` 건이고 전부 로컬 실행으로 확인했다. 단 CI 소요는 **[가정]** 라벨을 붙였고 실측을 DoD 로 넘겼다.
- **결합 간과** — ⚠️ **초안이 걸렸다.** physics-wasm 을 _"tsconfig 만 만들면 되는 1 파일"_ 로 보고 넘어갈 뻔했다. 실제로는 `@ts-expect-error` 사문화(§실측 C-1) + `typescript` 미선언(§C-2) + lockfile 갱신이 딸려 있었고, **프로브를 실행하고서야** 드러났다. 교정 후 통과.
- **폐기 프레이밍** — ⚠️ **경계선.** #1060 이 채택한 `verify-and-rust` 를 기각하는 구조라, 선행 ADR 의 논거를 약하게 요약할 유인이 있었다. (b) 의 진짜 장점(_"실행·타입 한 job"_ 원칙이 `pnpm -r test` 를 통해 이 46 파일에도 적용된다)을 §후보 비교 1 (b) **첫 문단**에 먼저 적고 §결과 4 에서 비용으로 인정하는 형태로 교정했다. **cross-validate 호출 프롬프트에 명시 질문으로 삽입할 것**: _"(b) 를 채택하지 않은 결정이 #1060 선례와의 일관성 손실을 정당화하는가?"_
- **순수주의** — ⚠️ **경계선.** `packages/physics-wasm` `1` 파일을 위해 `tsconfig` + devDep + lockfile + 소스 1행을 건드리는 것이 비례하는가. `echo` no-op 이 **거짓 문장 + exit 0** 이라는 #840 클래스 근거로 채택했으나, 미학적 판단이 섞였을 가능성이 있다. **명시 질문으로 삽입할 것**: _"(A) 대신 (B) 명시적 범위 밖 선언이 더 비례하는가?"_
