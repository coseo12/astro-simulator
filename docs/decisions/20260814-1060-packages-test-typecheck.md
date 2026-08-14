# ADR: `packages/{shared,core}` 테스트 파일 타입 검사 강제 지점 — `verify-and-rust` 배선 + 다중 `--filter` 단일 호출 금지 (#1060)

- 일자: 2026-08-14
- **상태**: **Provisional** (cross-validate 미수행 — 메인 오케스트레이터 수행 후 `Accepted` 전이. architect 는 직접 호출 금지 [#479](https://github.com/coseo12/astro-simulator/issues/479)). ⚠️ 본 라인은 [`20260812-1005`](20260812-1005-adr-index-status-guard.md) §재검토 조건의 **어순 제약** 대상이다 — 현재 상태 토큰이 최선두여야 한다
- 관련: 이슈 [#1060](https://github.com/coseo12/astro-simulator/issues/1060) / 분리 출처 [#960](https://github.com/coseo12/astro-simulator/issues/960) §교차검증 반영 사항 고유 발견 / 선행 ADR [`20260814-960`](20260814-960-worktree-typecheck-recipe.md) (typecheck 선행 조건 2축) · [`20260807-971`](20260807-971-required-status-checks.md) 결정 1·9-1 (required check 관할) · [`20260808-983`](20260808-983-measurement-recording-convention.md) (수치 박제 규약)
- 측정 rev: `fe922bb` (`origin/develop` tip, 2026-08-14). 본 문서의 모든 수치는 이 rev 단일 시점에 **격리 worktree** 1개에서 `pnpm install --frozen-lockfile` + `pnpm build` 후 일괄 도출 ([`20260808-983`](20260808-983-measurement-recording-convention.md) §부분 재측정 금지). 실행 환경은 macOS / pnpm `10.32.1` / TypeScript `6.0.3` / Next `16.2.12`

## 배경

#960 architect 판정 중 cross-validate (agy) 가 _"CI 13개 워크플로에 타입 검사 스텝이 0개"_ 를 제기했고, 실측으로 대부분 거짓이고 잔여 결손 1건만 실재함이 밝혀져 본 이슈로 분리됐다. 분리 시점 측정 rev 는 `7ca1cd1` 이었다.

**본 ADR 은 착수 시점 rev `fe922bb` 에서 결손을 재측정한다** (CLAUDE.md §인계 항목 실측 재검증 — 해소됐으면 NO-OP ADR 이 정답이다). **결과: 해소되지 않았다. NO-OP 아님.** 그리고 재측정 과정에서 **이슈 본문 전제 1건이 반증**됐다 (§실측 B).

## 실측 A — 결손 재확인 (`fe922bb`)

### A-1. CI 에 타입 검사 호출 스텝이 없다

```bash
grep -rn "typecheck" .github/ ; echo "rc=$?"          # rc=1 — 0 hit
grep -rniE 'type[-_ ]?check' .github/ ; echo "rc=$?"  # rc=1 — 0 hit
grep -rnE '\btsc\b' .github/                          # 1 hit — ci-physics-wasm.yml:184 (주석)
```

⚠️ **이슈 본문의 `grep -rn "typecheck\|tsc " .github/` 는 `fe922bb` 에서 재현되지 않는다** — 이슈는 _"주석 1건만 hit"_ 이라 적었으나 `typecheck` 문자열 자체는 **0 hit** 이고 남은 1건은 `tsc` 쪽이다. 결론(호출 스텝 `0`)은 같고 계수만 갈린다. `tsc ` 의 **후행 공백**이 줄 끝 `tsc` 를 놓치므로 위 형태(`\btsc\b`)로 대체한다.

`pnpm typecheck` 를 호출하는 지점은 CI 외에도 없다 — pre-commit hook (`.husky/pre-commit`) 은 인코딩 검사 · 중복 함수 가드 · `lint-staged` · md tilde 가드 `4` 스텝이고, `lint-staged` 설정은 `prettier --write` 뿐이다. `.husky/pre-push` 는 **존재하지 않는다**.

### A-2. 빌드는 테스트를 제외하고, 테스트를 포함하는 것은 `typecheck` 뿐이다

```bash
node -p "JSON.stringify(require('./packages/shared/tsconfig.build.json').exclude)"
# ["node_modules","dist","**/*.test.ts"]
node -p "JSON.stringify(require('./packages/core/tsconfig.build.json').exclude)"
# ["node_modules","dist","**/*.test.ts","**/__test-utils__/**"]
node -p "JSON.stringify(require('./packages/core/tsconfig.json').include)"    # ["src/**/*"]
node -p "JSON.stringify(require('./packages/shared/tsconfig.json').include)"  # ["src/**/*"]
```

두 패키지의 `build` 는 `tsc -p tsconfig.build.json`, `typecheck` 는 `tsc --noEmit` (= `tsconfig.json` 기반) 이다.

### A-3. 모집단 — `58` 파일

```bash
# 비-ASCII 경로 0 확인 (git 의 C-인용이 grep 앵커를 깨는 함정 배제)
git ls-files -z -- packages | tr '\0' '\n' | grep -cP '[^\x00-\x7F]'                          # 0
git ls-files -z -- packages/shared packages/core | tr '\0' '\n' \
  | grep -cE '(\.test\.ts|__test-utils__/.*\.ts)$'                                            # 58
```

`tsc` 가 실제로 그 파일들을 프로그램에 넣는지도 직접 확인했다 (구성 추론이 아니라 컴파일러 출력).

```bash
cd packages/core   && npx tsc --noEmit --listFiles | grep -cE 'packages/core/src/.*(\.test\.ts|__test-utils__)'  # 57
cd packages/shared && npx tsc --noEmit --listFiles | grep -c  'packages/shared/src'                              # 12 (테스트 1 포함)
```

`57 + 1 = 58` 로 위 `git ls-files` 계수와 일치한다.

⚠️ **모집단 술어의 한계**: 위 술어는 `*.test.ts` 접미 + `__test-utils__/` 경로만 덮는다. 다른 이름의 테스트 헬퍼가 생기면 이 계수 밖이다 — `58` 은 _"이 술어가 잡는 전부"_ 이지 _"테스트 성격 파일 전부"_ 가 아니다.

### A-4. 3중 시뮬레이션 (격리 worktree, positive → negative → recovery)

probe = `packages/core/src/scene/color-utils.test.ts` 말미에 `const __probe1060: number = 'not-a-number';` 주입.

```bash
# positive (주입 전)
pnpm --filter @astro-simulator/core typecheck   ; echo $?   # 0 / `error TS` 0 행

# negative (주입 후) — 현행 CI 가 통과시키는 경로 3개
pnpm --filter @astro-simulator/core build       ; echo $?   # 0  ← tsconfig.build.json 이 테스트 제외
pnpm --filter @astro-simulator/core exec vitest run src/scene/color-utils.test.ts ; echo $?
                                                            # 0  ← 2 tests passed (vitest 는 타입을 안 본다)
pnpm build                                      ; echo $?   # 0  ← CI `setup-and-build` composite 와 동일 경로

# negative (주입 후) — 닫으려는 경로
pnpm --filter @astro-simulator/core typecheck   ; echo $?   # 2
# src/scene/color-utils.test.ts(25,7): error TS2322: Type 'string' is not assignable to type 'number'.

# recovery
git checkout -- packages/core/src/scene/color-utils.test.ts
pnpm --filter @astro-simulator/core typecheck   ; echo $?   # 0
```

**즉 결손은 실재하며 형태는 "깨져 있음" 이 아니라 "강제 지점 부재"** 다 — baseline 은 무결(`error TS` `0` 행)하고, 타입 오류가 들어와도 CI 전 경로가 초록이다. #840 (`--if-present` silent no-op) 과 같은 클래스다.

## 실측 B — 이슈 본문 전제 1건 반증: `next build` 는 `apps/web` **테스트**를 검사하지 않는다

이슈 본문 표의 첫 행은 _"`apps/web` 소스 + **테스트** ✅ 된다 … `tsconfig.json` 의 `include` 가 `**/*.ts`·`**/*.tsx` 라 테스트 포함"_ 이라 적었고, 그 위에 **비목표** (_"`apps/web` 타입 검사 중복 추가"_) 가 서 있다. 전제를 상속하지 않고 직접 측정했다.

| 프로브 | 파일 | `pnpm --filter web build` | 해석 |
| --- | --- | ---: | --- |
| B-1 | `src/components/layout/about-modal.test.tsx` (기존 테스트) | exit `0` | **안 잡힌다** |
| B-1' | 위와 동일, `.next` + `tsconfig.tsbuildinfo` 삭제 후 cold | exit `0` | 증분 캐시 아님 |
| B-2 | `app/layout.tsx` (도달 가능 소스) — **양성 대조군** | exit `1` `Type error:` | next build 는 타입 검사를 **한다** |
| B-3 | `src/__probe1060-unreachable.ts` (도달 불가 **비**-테스트) | exit `1` `Type error:` | **도달성 축이 아니다** |
| B-4 | `src/components/layout/__probe1060-t.test.tsx` (같은 디렉토리, 테스트 이름) | exit `0` | 파일명 축이다 |

B-4 와 동일 파일을 `tsc` 로 보면 잡힌다.

```bash
pnpm --filter @astro-simulator/web typecheck   # exit 2
# src/components/layout/__probe1060-t.test.tsx(1,44): error TS2322: ...
```

네 프로브 모두 **같은 내용의 오류**(`(): number => 'not-a-number'` 계열)를 썼고, B-3·B-4 는 **디렉토리 변수를 제거**하기 위해 같은 디렉토리에서 대조했다.

**결론: `next build` (Next `16.2.12`) 은 `*.test.*` 파일을 타입 검사 대상에서 제외한다.** 이슈 표 첫 행은 **소스에 대해서만 참**이고 테스트에 대해서는 거짓이다.

⚠️ **기전(Next 내부 구현)은 미판별이다.** `next/dist/lib/typescript/writeConfigurationDefaults.js` 에 `'**/*.test.ts'` · `'**/*.test.tsx'` 제외 로직이 있으나 `process.env.NEXT_PRIVATE_LOCAL_DEV` 게이트 안이라 **본 경로가 아니다**. 관측된 계약만 박제하고 기전은 열어 둔다 — 그래서 **Next 버전 의존 가정**이며 §재검토 조건 3 이 감시한다.

**모집단 (저장소 전체)**:

```bash
git ls-files -z | tr '\0' '\n' | grep -cE '\.test\.tsx?$'                       # 103
git ls-files -z | tr '\0' '\n' | grep -E '\.test\.tsx?$' \
  | sed -E 's#^(apps/[^/]+|packages/[^/]+|scripts).*#\1#' | sort | uniq -c
#   45 apps/web / 56 packages/core / 1 packages/physics-wasm / 1 packages/shared
pnpm --filter @astro-simulator/web typecheck ; echo $?                          # 0 (baseline 무결)
```

즉 실제 사각은 `58` 이 아니라 **`58` + `apps/web` `45` + `physics-wasm` `1`** 이다. `packages/physics-wasm` 은 `tsconfig.json` 이 없고 `typecheck` 가 `echo` no-op 이라 세 번째 종류의 결손이다.

**본 ADR 은 그럼에도 범위를 `packages/{shared,core}` 로 유지하고 나머지를 후속 이슈로 분리한다** (§비-범위). 이슈의 비목표를 architect 재량으로 뒤집지 않는다 (CLAUDE.md CRITICAL #6 / §스프린트 계약).

## 후보 비교 1 — 배선 지점

`main` 브랜치 보호 실측 (GET only):

```bash
gh api repos/coseo12/astro-simulator/branches/main/protection \
  --jq '{required: .required_status_checks.contexts, strict: .required_status_checks.strict, enforce_admins: .enforce_admins.enabled}'
# {"enforce_admins":true,"required":["project-guards","branch-name","label-pr"],"strict":false}
gh api repos/coseo12/astro-simulator/branches/develop/protection
# 404 Branch not protected
```

| 안 | 지점 | 선행 조건 | 판정 |
| --- | --- | --- | --- |
| **(a)** | `ci-physics-wasm.yml` / `verify-and-rust` | **이미 충족** — `pnpm install` + `physics-wasm build` + `shared`·`core` `-r build` 3 스텝이 이 job 안에 있다 | **채택** |
| (b) | `ci.yml` / `detect-and-test` (composite `setup-and-build` **이후**) | 충족되나 `timeout-minutes: 20` 의 무거운 composite 뒤 | 기각 (아래) |
| (c) | `project-guards.yml` / `project-guards` | **미충족** — 의존성 `0` 워크플로 (pnpm·node setup·install 전부 없음) | 기각 |
| (d) | 로컬 `verify:*` 스크립트 · pre-commit hook 만 | 해당 없음 | 기각 |
| (e) | 신규 워크플로 파일 | 새로 세워야 함 | 기각 |

### (a) 채택 근거

`verify-and-rust` 는 **바로 이 `58` 파일의 단위 테스트를 돌리는 job** 이다 (`pnpm -r test`). 그 job 의 기존 주석이 vitest 를 여기 둔 이유를 이미 선언해 뒀고 — _"core 소스 4파일이 `@astro-simulator/physics-wasm` (pkg/, gitignored) 을 직접 import → wasm-pack 빌드 선행 필수 … shared/core 는 exports 가 dist/ 기반 (gitignored) 이라 tsc 빌드도 선행한다"_ — **그 논거는 typecheck 에 축자 그대로 적용된다.** 같은 파일 집합의 두 검증(실행 · 타입)을 한 job 이 소유하면 선행 조건 유지 책임이 한 곳에 남는다 (volt [#120](https://github.com/coseo12/volt/issues/120) _"중복 출처 제거"_).

### (b) 기각 근거 — 그리고 기각을 과장하지 않기 위해

(b) 에는 **진짜 장점이 있다**: `detect-and-test` 는 ADR [`20260807-971`](20260807-971-required-status-checks.md) 결정 1 의 **Phase 2** required 후보이고 `verify-and-rust` 는 **Phase 3 (선택)** 이라, (b) 가 하드 블록으로 승격될 순서가 앞선다.

그럼에도 기각하는 이유는 **그 장점이 본 이슈에서 실현되지 않기 때문**이다.

1. Phase 2·3 어느 쪽도 **일정이 확정돼 있지 않다** (Phase 2 진입 게이트 = _"release PR 1회 관찰 통과 후"_, Phase 3 = _"Phase 2 관찰 후 판단"_). 그리고 required 승격은 **저장소 설정 변경**이라 결정 9-1 이 속한 그 ADR 관할이다 — 본 이슈가 앞당길 근거가 없다.
2. 본 이슈가 겨냥하는 **일상 PR 은 `base=develop` 이고, develop 은 required check 를 영구 미채택**한다 (그 ADR 결정 2 / 위 `404 Branch not protected` 실측). 즉 (a)(b) 어느 쪽에 붙여도 일상 PR 에서의 강제력 등급은 **같다** — _"체크런 붉은 X + 메인 오케스트레이터의 CI 확인"_.
3. (b) 는 선행 조건이 `timeout-minutes: 20` composite 뒤에 있어 **피드백이 늦고 실패 표면이 넓다**. (a) 의 선행 조건은 shared·core 만을 위해 존재하는 표적 2 명령이다.

### (c)(d)(e) 기각 근거

- **(c)**: `project-guards` 는 required 3종 중 하나지만 **의존성 `0`** 이 그 job 의 성립 조건이다 (누적 대기 `~10s` — ADR `20260807-971` 결정 1 표). pnpm·node setup + install + build 를 들이면 그 전제가 깨진다. `npx tsc@<버전>` 하드핀은 `pnpm-lock.yaml` 에 이은 **세 번째 버전 출처**를 만든다 — `ci.yml` `#952` 주석이 prettier 에 대해 같은 이유로 이미 기각한 형태다.
- **(d)**: 결손의 정의가 _"CI 강제 지점 부재"_ 이므로 로컬 스크립트만으로는 닫히지 않는다. pre-commit hook 도 대체재가 아니다 — **격리 worktree sub-agent 는 `--no-verify` 를 상시 쓴다** (`ci.yml` `#952` 주석의 실측 선언). 단 로컬 재현 경로로서의 가치는 있으므로 루트 `package.json` 에 이미 있는 `typecheck` 를 그대로 쓴다 (신규 스크립트 미도입 — [`20260814-960`](20260814-960-worktree-typecheck-recipe.md) §E 정합).
- **(e)**: 이슈 명시 비목표. 부수로 신규 체크런 이름은 required check 표면과 동명 축(ADR `20260807-971` §2-5)에 영향을 준다.

## 후보 비교 2 — 명령 형태 (**본 ADR 의 핵심 발견**)

이슈 제안 1안의 문자열은 `pnpm --filter @astro-simulator/shared --filter @astro-simulator/core typecheck` 였다. **이 형태는 silent no-op 2축을 갖는다.** 실측 (pnpm `10.32.1`):

```bash
# (i) 이중 --filter 단일 호출 + 한쪽 패키지의 스크립트 소실 → exit 0, 조용히 스킵
#     (packages/shared/package.json 에서 scripts.typecheck 를 제거한 상태)
pnpm --filter @astro-simulator/shared --filter @astro-simulator/core typecheck ; echo $?
# 0   ← 출력에 core 만 등장. shared 는 검사되지 않았는데 초록이다

# (ii) 단일 --filter + 스크립트 소실 → exit 1 (ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT)
pnpm --filter @astro-simulator/shared typecheck ; echo $?
# 1   ← "None of the selected packages has a \"typecheck\" script"

# (iii) 필터가 0개 매칭 (패키지 리네임·삭제) → exit 0
pnpm --filter @astro-simulator/nonexistent typecheck ; echo $?
# 0   ← "No projects matched the filters in ..."

# (iv) --fail-if-no-match 부착 → exit 1
pnpm --fail-if-no-match --filter @astro-simulator/nonexistent typecheck ; echo $?
# 1
```

(i) 은 **`--if-present` 와 정확히 같은 클래스**다 (#840 — 스크립트 entry 소실이 출력 없이 exit `0`). (iii) 은 `hashFiles` silent-skip 정책 (#945) 이 다루는 것과 같은 클래스다 — _"가드 대상의 부재는 배포 시나리오가 아니라 가드가 삭제된 회귀"_.

| 형태 | (i) 스크립트 소실 | (iii) 필터 0 매칭 | 판정 |
| --- | --- | --- | --- |
| 이중 `--filter` 단일 호출 | **exit 0 (silent)** | **exit 0 (silent)** | 기각 |
| 패키지별 분리 호출 | exit 1 | **exit 0 (silent)** | 부분 |
| 패키지별 분리 호출 + `--fail-if-no-match` | exit 1 | exit 1 | **채택** |
| `pnpm -C <dir> run typecheck` | exit 1 (`ERR_PNPM_NO_SCRIPT`) | exit 1 (`ENOENT`) | 대안 (아래) |

`pnpm -C` 형태도 두 축을 닫는다 (실측: 디렉토리 부재 시 `ENOENT` exit `1`). 채택하지 않은 이유는 **주소 체계 일관성**이다 — 같은 job 의 기존 빌드 스텝이 패키지 **이름**(`@astro-simulator/*`)으로 주소한다. 경로 주소를 섞으면 워크스페이스 이동 시 두 곳이 따로 논다. `--fail-if-no-match` 는 pnpm 이 정확히 이 목적으로 제공하는 플래그다.

⚠️ **별도 `verify-*.mjs` 단언 스크립트를 만들지 않는다.** 같은 job 의 vitest 스텝은 실행 수 단언을 손으로 짰지만(#840), 여기서는 **pnpm 자체 종료 코드가 이미 fail-fast** 다. 가드를 위한 가드를 신설하면 그것이 다시 검증 대상이 된다.

## 비용

로컬 (macOS, warm, `pnpm build` 이후) 3회 wall:

```bash
pnpm --fail-if-no-match --filter @astro-simulator/shared typecheck \
  && pnpm --fail-if-no-match --filter @astro-simulator/core typecheck
# 3149 ms / 2623 ms / 2511 ms
```

⚠️ **이 값은 CI 비용이 아니다.** ubuntu 러너 · 냉시작 · 캐시 상태가 모두 다르다. **CI 비용은 job-level API 로 실측해 PR 에 박제**하며 그것이 이슈 완료 기준 3항이다 ([`operational-friction.md`](../ops/operational-friction.md) §6):

```bash
# 총 소요 = job-level (verify-and-rust 의 before / after)
gh api repos/coseo12/astro-simulator/actions/runs/<RUN_ID>/jobs \
  --jq '.jobs[] | select(.name=="verify-and-rust") | {name, started_at, completed_at}'

# 신규 스텝 단독 = step 단위 (위 표와 같은 표에 섞지 말 것 — §6 표준)
gh api repos/coseo12/astro-simulator/actions/runs/<RUN_ID>/jobs \
  --jq '.jobs[] | select(.name=="verify-and-rust") | .steps[] | {name, started_at, completed_at}'
```

단일 run 대조는 러너 편차가 섞이므로 **한계를 함께 적는다** (§6 명시 요구).

## 결정

1. **`packages/{shared,core}` 테스트 파일 타입 검사를 CI 에 배선한다.** 결손은 `fe922bb` 에서 재확인됐다 — NO-OP 아님.
2. **배선 지점은 `.github/workflows/ci-physics-wasm.yml` 의 `verify-and-rust` job**, `workspace 빌드 (wasm → shared → core)` 스텝 **직후** · 단위 테스트 스텝 **직전**. 스텝 `1` 개.
3. **명령 형태는 패키지별 분리 호출 + `--fail-if-no-match`.** 다중 `--filter` 단일 호출은 **silent no-op 이므로 가드 배선에 쓰지 않는다** (§후보 비교 2 실측 (i)). 이 조항은 본 스텝에 한정되지 않는 **일반 규약**이다 — pnpm 기반 CI 가드를 새로 배선하는 모든 작업에 적용된다.
4. **저장소 설정은 변경하지 않는다.** required status check 목록 · branch protection 무접촉. 그 관할은 ADR [`20260807-971`](20260807-971-required-status-checks.md) 결정 1(Phase 2·3) 이며 본 ADR 은 그 일정에 개입하지 않는다. 따라서 본 가드의 강제력 등급은 **체크런 붉은 X + 메인의 CI 확인**이고, 이는 `pnpm -r test` 를 포함해 이 저장소 CI 가드 대부분과 **같은 등급**이다.
5. **`apps/web` (`45`) · `packages/physics-wasm` (`1`) 결손은 후속 이슈로 분리한다** — 본 ADR §실측 B 가 근거를 박제했다. 이슈 비목표를 architect 재량으로 확대하지 않는다.

박제할 스텝 (dev 인계용 원문):

```yaml
- name: 'packages 타입 검사 (테스트 파일 포함, #1060)'
  run: |
    pnpm --fail-if-no-match --filter @astro-simulator/shared typecheck
    pnpm --fail-if-no-match --filter @astro-simulator/core typecheck
```

## 의도적 비-범위

- **`apps/web` 타입 검사 추가** — 이슈 명시 비목표. §실측 B 가 그 비목표의 **근거**를 반증했으나 **범위 자체는 유지**한다. 구조적으로도 별개다: `apps/web` 의 `typecheck` 는 `next-env.d.ts` + `.next/types` 를 요구하므로 (`20260814-960` §결손 2축 (i)) `verify-and-rust` 에서는 `TS2882` 로 죽는다 — 배선 지점이 다르다.
- **`packages/physics-wasm`** — `tsconfig.json` 부재 + `typecheck` 가 `echo` no-op. 위와 함께 후속.
- **기존 빌드 스텝(`--filter shared --filter core -r build`)의 같은 silent no-op 축 수리** — §후보 비교 2 (i) 는 그 스텝에도 성립한다. 다만 `build` 는 소실 시 산출물이 안 생겨 후속 스텝(`pnpm -r test`)이 큰 소리로 죽으므로 **결과가 다르다**. 별도 판단이 필요해 손대지 않는다.
- **required check 승격** — 결정 4.

## 결과

- `58` 파일이 CI 타입 검사 안으로 들어온다. 현재 baseline 은 무결하므로 도입 시 초록이며, **그 초록은 작동 증거가 아니다** — 증거는 negative 축(의도적 오류 주입 PR 의 CI FAIL)이다 (CLAUDE.md §가드 도입 PR DoD).
- 다중 `--filter` 단일 호출 금지가 저장소 규약으로 박제된다 (결정 3).
- `apps/web` `45` + `physics-wasm` `1` 은 후속 이슈로 추적된다.

## 재검토 조건

1. `packages/shared` 또는 `packages/core` 의 `tsconfig.json` `include` 가 좁아지거나 `exclude` 에 테스트 패턴이 추가되면 — 본 가드는 **조용히 커버리지를 잃는다** (`tsc` 는 검사할 파일이 없어도 exit `0`). §실측 A-3 의 `--listFiles` 계수(`57` / `12`)가 그때의 대조 기준이다.
2. 워크스페이스 이름(`@astro-simulator/shared` · `@astro-simulator/core`) 이 바뀌면 — `--fail-if-no-match` 가 exit `1` 로 잡는다. 그때 스텝을 갱신한다.
3. **Next 메이저 업그레이드 시 §실측 B 를 재측정한다** — `next build` 의 테스트 제외는 관측된 계약일 뿐 기전이 미판별이다. 제외가 사라지면 후속 이슈의 근거 일부가 소멸한다.
4. ADR [`20260807-971`](20260807-971-required-status-checks.md) 의 Phase 2 또는 Phase 3 가 실행되면 — 본 스텝의 강제력 등급이 바뀌므로 결정 4 의 서술을 갱신한다.
5. pnpm 메이저 업그레이드 시 §후보 비교 2 의 4개 종료 코드를 재측정한다 — 채택 근거가 pnpm 의 종료 코드 의미론에 직접 의존한다.

## Forensic 변형 판정 — **일반 ADR** (5조건 중 `2`)

| 조건 | 충족 | 근거 |
| --- | :---: | --- |
| 1. 가설 `N≥2` | ✗ | 원인이 단일 확정 (CI 호출 스텝 부재). 경쟁 가설 없음 |
| 2. Runtime 측정 필수 | ✓ | 정적 구성 독해만으로는 (i) vitest 가 타입을 안 본다 (ii) `next build` 가 테스트를 뺀다 (iii) pnpm 다중 filter 가 silent 다 — 셋 다 **추론에 그친다**. 전부 실행으로 확정했다 |
| 3. DoD PASS 인데 제품 회귀 | ✗ | 회귀 발생 이력 없음. baseline 무결 |
| 4. `5±2` 옵션 비교 | ✓ | 배선 지점 `5` 안 + 명령 형태 `4` 안 |
| 5. Amendment 라운드 `N` 예상 | ✗ | 가산 스텝 `1` 개. cross-validate 1회 외 추가 라운드 근거 없음 |

**판정: `2 / 5` → 일반 ADR.** CLAUDE.md §Forensic ADR 변형 의 _"일반 ADR 로 시작 후 Amendment 1회 필요해지면 forensic 으로 승격"_ 경로를 열어 둔다.

## 교차검증 반영 사항

**미수행.** 본 ADR 은 cross-validate 발동 대상(ADR 신규)이나 architect 는 직접 호출이 금지돼 있다 ([#479](https://github.com/coseo12/astro-simulator/issues/479)). **메인 오케스트레이터가 수행**한 뒤 4축(합의 / 이견 수용 / Claude 재분석 기각 / 고유 발견)을 본 절에 통합하고 `Provisional → Accepted` 로 전이한다.

**호출 전 Claude 편향 셀프 체크** ([cross-validate-protocol.md](../guides/cross-validate-protocol.md) §5 4종):

- **낙관적 일정** — 해당 없음 (스텝 `1` 개 · 로컬 `~3s` 실측).
- **결합 간과** — ⚠️ **초안이 걸렸다.** 이슈 제안 문자열을 그대로 채택할 뻔했고, pnpm 다중 filter 의 silent no-op 축(§후보 비교 2)은 **측정해 보고서야** 드러났다. 교정 후 통과.
- **폐기 프레이밍** — 해당 없음 (기존 자산 폐기 없음).
- **순수주의** — ⚠️ **경계선.** 별도 단언 스크립트 신설 유혹이 있었고 _"pnpm 종료 코드로 충분"_ 으로 기각했다. 이 판단은 cross-validate 에서 **명시 질문 대상**으로 올린다.
