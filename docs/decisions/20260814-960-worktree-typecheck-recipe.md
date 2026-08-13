# ADR: 격리 worktree typecheck 선행 조건 — 기존 `pnpm build` 채택 + `next-env.d.ts` tracked 화 기각 (#960)

- 일자: 2026-08-14
- **상태**: **Accepted** (cross-validate agy 2026-08-14 — §교차검증 반영 사항 4축 통합 완료). ⚠️ 본 라인은 [`20260812-1005`](20260812-1005-adr-index-status-guard.md) §재검토 조건의 **어순 제약** 대상이다 — 현재 상태 토큰이 최선두여야 한다
- 관련: 이슈 [#960](https://github.com/coseo12/astro-simulator/issues/960) / PR [#941](https://github.com/coseo12/astro-simulator/pull/941) · [#959](https://github.com/coseo12/astro-simulator/pull/959) (증상 2회 보고) / 이슈 [#952](https://github.com/coseo12/astro-simulator/issues/952) (worktree `install` 선행 규약 — 본 ADR 의 선행)
- **번복 대상**: 이슈 [#210](https://github.com/coseo12/astro-simulator/issues/210) / PR [#222](https://github.com/coseo12/astro-simulator/pull/222) (`a5b00f6`) 가 `git rm --cached` 로 확립한 `apps/web/next-env.d.ts` untracked 결정. 본 ADR 은 **번복하지 않고 재확인**한다
- 측정 rev: `7ca1cd1` (`origin/develop` tip, 2026-08-14). 본 문서의 모든 수치는 이 rev 단일 시점에 **격리 worktree** (`git worktree add --detach`) 1개에서 일괄 도출 ([`20260808-983`](20260808-983-measurement-recording-convention.md) §부분 재측정 금지)

## 배경

격리 worktree 에서 `pnpm install --frozen-lockfile` 후 `pnpm --filter web typecheck` 이 실패한다. PR #941 / #959 에서 **2회 독립 보고**됐고, #959 reviewer 가 `apps/web/next-env.d.ts` 부재를 원인으로 지목하며 *"표준 2줄로 수동 생성 후 재실행 → 에러 0, exit 0"* 을 기록했다.

**그 기록은 rev `7ca1cd1` 에서 재현되지 않는다.** 결손은 하나가 아니라 둘이다.

### 실측 — 결손 2축

술어: 격리 worktree (`origin/develop` detached) 에서 각 단계 직후 `pnpm --filter web typecheck` 의 종료 코드와 `error TS` 문자열을 포함하는 행 수.

| 단계 | exit | `error TS` 행 | 내역 |
|---|---|---|---|
| `pnpm install --frozen-lockfile` 직후 (baseline) | 2 | **76** | TS2882 `2` + TS2307 `52` + 파생 `22` (TS7006 `13` / TS18048 `4` / TS2339 `4` / TS7031 `1`) |
| `+` `next-env.d.ts` 표준 2줄 수동 작성 | 2 | **74** | TS2882 만 소멸 |
| `+` `packages/{shared,core}` 빌드 | **0** | **0** | — |

- **축 (i)** — `apps/web/next-env.d.ts` 부재 → `TS2882` `2` 건 (`app/layout.tsx` 의 CSS side-effect import)
- **축 (ii)** — `packages/{shared,core}/dist` 부재 → `TS2307` `52` 건 (`@astro-simulator/shared` · `@astro-simulator/core`) + 그로부터 파생된 implicit-any 계열 `22` 건

⚠️ 축 (ii) 는 **baseline 부터 이미 존재**한다. 축 (i) 을 고쳐야 "드러나는" 것이 아니라, TS2882 가 헤드라인이었을 뿐이다. 따라서 이슈 §DoD 1 (*"fresh worktree 에서 typecheck exit 0"*) 은 `next-env.d.ts` 만으로 달성되지 않는다.

## 후보 비교

이슈가 제시한 3안에, 실측 과정에서 드러난 2안을 더해 비교한다.

| 안 | 내용 | 판정 |
|---|---|---|
| **A** | 디스패치 절차에 *"`next-env.d.ts` 를 표준 2줄로 생성"* 추가 | **기각** — 축 (ii) 미해결. 게다가 "표준 2줄"이 틀렸다 (아래 §B-1) |
| **B** | `next-env.d.ts` 를 tracked 로 전환 | **기각** — 실측으로 반증 (§B-1 · §B-2) |
| **C** | `docs/ops` 에 알려진 환경 요인으로 박제 | **채택 (정본)** — 단 2축을 모두 적을 때만 실효 |
| **D** | 루트 `postinstall` 에 typegen + 빌드 자동화 | **기각** — CI 과세 (§D) |
| **E** | `apps/web` 의 `typecheck` 스크립트에 선행 빌드 체이닝 (cross-validate 제안) | **기각** — 기존 명령으로 충분 + 부작용 (§E) |

### B-1. "내용이 2줄 고정" 은 거짓 — 동일 rev 에서 진동한다

이슈 §옵션 표는 B 의 비용을 *"Next.js 공식 권장 위배가 유일 … 내용이 2줄 고정이라 실질 위험 낮음"* 으로 평가했다. **동일 worktree · 동일 rev `7ca1cd1` · 동일 Next `16.2.12`** 에서 생성 명령만 바꿔 측정했다.

| 생성 명령 | `next-env.d.ts` 의 import 행 | md5 |
|---|---|---|
| `next typegen` (= `next build` 계열) | `import "./.next/types/routes.d.ts";` | `2a74d3909800ca5467fa83b0ab4a4890` |
| `next dev` | `import "./.next/dev/types/routes.d.ts";` | `d0f8375ae1199dc7acd3977fc33b78b8` |

`next dev` 기동 후 **2회 폴링 (약 2초) 이내**에 파일이 덮어써졌다. 실제 파일은 2줄이 아니라 **6줄**이며, 가변 import 행을 포함한다.

즉 tracked 로 두면 `next dev` ↔ `next build`/`typegen` 을 오갈 때마다 워킹트리가 dirty 해진다. #210 이 `.gitignore` 주석에 적은 예측 — *"`next dev`/`next build` 마다 자동 재생성되는 타입 shim. tracked 시 diff 노이즈 + 협업자간 재생성 충돌 유발"* — 이 Next 16 에서 그대로 성립한다. **B 는 선행 결정의 번복이 아니라, 선행 결정이 옳았다는 재확인으로 귀결한다.**

### B-2. B 는 typecheck 를 깨뜨리지는 않는다 (기각 근거를 과장하지 않기 위해)

`apps/web/tsconfig.json` 의 `skipLibCheck: true` 때문에, `.next/` 가 없는 상태에서 위 import 가 미해결이어도 **에러는 발생하지 않는다** (실측: `next dev` 산출 6줄본을 `.next/` 삭제 상태에서 typecheck → `next-env.d.ts` 기인 에러 `0`). B 의 비용은 순수하게 **diff 진동**이며, 안전성 문제가 아니다. 그럼에도 기각하는 이유는 그 진동이 상시적이고 (개발 중 `next dev` 는 일상), 이득이 축 (i) 하나뿐이어서 **DoD 1 을 단독으로 닫지 못하기** 때문이다.

### E. 스크립트 체이닝 — 기존 명령이 이미 있다

cross-validate 는 `apps/web` 의 `typecheck` 를 `next typegen && <deps build> && tsc --noEmit` 로 재정의하는 구조적 해소를 제안했다. **프로토타입을 만들어 실행했다** — `packages/physics-wasm/pkg` 가 없는 격리 worktree 에서 `pnpm --filter web typecheck` 는 **exit `2` 로 중단되고 `tsc --noEmit` 에 도달하지 못한다** (`packages/core` 빌드가 `@astro-simulator/physics-wasm` 미해결로 exit `2`). 즉 제안대로면 **정상 트리에서도 typecheck 가 실패**한다.

더 중요한 것은 **그 명령이 이미 존재한다**는 사실이다 (CLAUDE.md §신규 함수 ≠ 신규 구현). 루트 `pnpm build` (`pnpm -r build`) 는 wasm → shared → core → web 순으로 돌며 축 (i)(ii) 를 **동시에** 닫는다.

| 명령 (rev `7ca1cd1`, 완전 초기화 후) | exit | 소요 |
|---|---|---|
| `pnpm install --frozen-lockfile` | 0 | `4.5s` |
| `pnpm build` | **0** | **`17s`** |
| `pnpm --filter web typecheck` | **0** (`error TS` `0` 행) | `3s` |

이는 CI 의 `setup-and-build` composite (8 워크플로가 소비) 가 수행하는 것과 **동일한 2 명령**이다 — 로컬 절차가 CI 를 미러링하면 두 번째 출처가 생기지 않는다 (volt [#120](https://github.com/coseo12/volt/issues/120)).

### D. `postinstall` 자동화 기각

루트 `postinstall` 에 붙이면 #952 가 이미 의무화한 `pnpm install` 만으로 2축이 닫히고 *"규약을 잊는"* 실패 모드가 사라진다. 그러나 `pnpm install` 실행 지점이 워크플로 파일 `4` 개 + composite `setup-and-build` `1` 개 (워크플로 `8` 개가 소비) 라, 아래 §빈도 측정이 보인 **로컬 마찰 `2` 건**을 없애려고 PR 마다 다수 job 에 빌드를 과세하게 된다. 불비례로 판단한다.

### 빈도 측정 — 비례성 근거

술어 셋 (모두 rev `7ca1cd1`):

```bash
# (1) 에이전트 설정 전체에서 typecheck 지시 = 0
grep -rniE "typecheck" .claude/ CLAUDE.md
# (2) typecheck / tsc --noEmit 을 직접 호출하는 CI 스텝 = 0
grep -rn "typecheck\|tsc " .github/
# (3) 증상 보고 = 2건 (PR #941 / #959)
```

- `.claude/` 및 CLAUDE.md 의 `typecheck` 언급 **`0` 회** → typecheck 는 sub-agent **재량** 실행이다
- `typecheck` 를 직접 호출하는 CI 스텝 **`0` 개**
- ⚠️ **그러나 타입 오류가 CI 를 빠져나가지는 않는다** — `setup-and-build` 가 도는 `pnpm build` 안의 `next build` 가 TypeScript 검사를 수행하고 (`apps/web/next.config.*` 에 `ignoreBuildErrors` **없음**), `packages/{shared,core}` 의 `build` 는 `tsc -p tsconfig.build.json` 자체다. 즉 본 이슈는 **정확성 결손이 아니라 개발자 경험 마찰**이다
- 이슈 등록(2026-08-04) 이후 `10` 일 / 2026-08-01 이후 머지 PR `88` 건 동안 **3번째 보고 `0` 건**

→ **저빈도 · 저위험 · 고오진비용**. 구조 자동화(D·E)는 과잉이고, 비례하는 처방은 *"정확한 레시피 + 발견가능성"* 이다.

## 결정

1. **정본 레시피는 기존 명령 2개다.** 격리 worktree 에서 typecheck 가 필요하면 `pnpm install --frozen-lockfile` 다음에 **`pnpm build`** 를 돌린다. 신규 스크립트를 만들지 않는다.
2. **`apps/web/next-env.d.ts` 는 untracked 를 유지한다** (#210 재확인). `.gitignore` 의 해당 주석은 삭제·완화하지 않는다.
3. **폴백 (Rust 툴체인 부재로 `pnpm build` 불가 시)** — `pnpm --filter web exec next typegen` + `pnpm --filter @astro-simulator/shared --filter @astro-simulator/core -r build`. 후자는 exit `2` 지만 `dist` 는 **완전 산출**된다 (아래 §결과 3). "표준 2줄 수동 작성" 은 **금지** — §B-1 이 보인 대로 그 2줄은 표류하는 산출물의 한 스냅샷이라, 절차 문서에 하드코딩하면 B 와 같은 실패 클래스를 문서로 옮기는 것에 불과하다.
4. **박제 위치**는 `docs/ops/operational-friction.md` (#952 §7 인접) 이며, `TS2882` / `TS2307` **리터럴을 포함**한다 — 에이전트가 실제로 보는 토큰이 그 두 문자열이고, 결손은 레시피 부재가 아니라 **오진**이기 때문이다.

## 결과

1. **`pnpm build` 는 축 (i)(ii) 를 동시에 닫는다** — `next build` 가 `next-env.d.ts` 를 생성하고, `-r build` 가 `dist` 를 만든다. 실측 exit `0` / `17s`.
2. **폴백 경로의 exit `2` 는 예상된 것이다** — `packages/core` 빌드가 `@astro-simulator/physics-wasm` 미해결로 exit `2` 를 내지만, `packages/physics-wasm` 을 먼저 빌드하면 (`9s`, exit `0`) `shared` + `core` 빌드도 exit `0` (`2s`) 이 된다. 즉 부분 실패에 의존할 필요 자체가 없다.
3. **부분 실패 산출물은 타입 손상이 아니다** (cross-validate 우려 검증) — exit `2` 상태의 `packages/core/dist` 는 `.d.ts` **`58` 개**를 방출했고, 이는 `tsconfig.build.json` 이 `exclude` 하는 `__test-utils__` `1` 개를 뺀 **의도 대상 전량**이다. 방출된 공개 타입 표면에 `@astro-simulator/physics-wasm` 참조는 **`0` 건** — wasm 핸들이 `private wasm;` 으로 캡슐화돼 공개 API 에 새지 않는다.
4. **CI 와 동일 경로** — 로컬 1순위 레시피가 `setup-and-build` composite 과 같은 2 명령이라 절차 SSoT 가 하나로 유지된다.

## 재검토 조건

1. **Next.js 가 `next-env.d.ts` 내용을 고정하면 B 를 재평가한다.** 트리거: `next dev` 산출물과 `next typegen` 산출물의 md5 가 같아지는 마이너 버전. 판정 술어는 §B-1 표의 재측정이다.
2. **증상 보고가 누적 `5` 건을 넘으면 D 또는 E 를 재평가한다.** 현재 `2` 건 / 88 PR. 본 ADR 의 비례성 논거는 빈도에 의존하므로 빈도가 바뀌면 결론도 바뀐다.
3. **`packages/physics-wasm` 이 사라지거나 `pkg/` 가 tracked 로 바뀌면** §결정 3 폴백의 exit `2` 서술은 무효가 된다 — 그때 §결과 2·3 을 재측정한다.
4. **`.gitignore` 의 `apps/web/next-env.d.ts` 행을 지우려는 PR 은 본 ADR 을 근거로 차단한다.** 그 행을 지우는 것이 B 의 실행 형태다.

## 교차검증 반영 사항

cross-validate (agy, 2026-08-14, outcome `applied`, `plan_bypass=false`). 호출 전 **Claude 편향 4종 셀프 체크**: 낙관적 일정 = 통과 (전량 실측, 단 warm pnpm/cargo 캐시 조건 명시) / 결합 간과 = 통과 (`verify-agent-ssot.sh` 검사 범위와 CI `install` 지점 수를 사전 계수) / **폐기 프레이밍 = 미통과** (B 를 실측만으로 기각하려 해 steelman 부재) → 호출 프롬프트에 *"B 옹호 논리를 무너뜨렸는가"* 를 명시 질문으로 삽입 / 순수주의 = 통과 (D 기각을 미학이 아니라 job 과세로 근거화).

### 합의

- **축 (ii) 진단과 B 기각 방향** — agy 도 B 를 *"재고할 필요 전혀 없음"* 으로 판정. 추가 근거로 **`assume-unchanged`/`skip-worktree` 는 로컬 인덱스 플래그라 공유 불가**, `.gitattributes` 는 로컬 프로세스의 덮어쓰기를 막지 못함을 지적 — §B-1 의 steelman 봉쇄로 채택했다.
- **"표준 2줄" 하드코딩 기각** — 가변 산출물을 문서에 고정하는 것이 B 와 동일 실패 클래스라는 판단에 합의.

### 이견 수용

- **`next typegen` 호출 형태** — 원안은 `cd apps/web && npx next typegen` 이었다. agy 가 monorepo CWD 민감도를 지적해 **`pnpm --filter web exec next typegen`** 으로 교체했다 (실측 exit `0`). 실행 컨텍스트가 명령에 박혀 있어 호출 위치에 의존하지 않는다.
- **`postinstall` vs 문서 이분법이 거짓이라는 지적** — 수용했고, 그 결과가 §E 다. 다만 agy 가 제시한 해법(스크립트 체이닝)이 아니라 **이미 존재하는 `pnpm build`** 로 착지했다. agy 의 문제 제기(*"규약은 잊히지만 구조는 안 잊힌다"* 와의 충돌)가 없었다면 루트 `pnpm build` 측정 자체를 하지 않았을 것이다.

### Claude 재분석으로 기각한 외부 모델 제안

- **`apps/web` 의 `typecheck` 스크립트 재정의** — 프로토타입 실행 결과 격리 worktree 에서 **exit `2` 로 중단**되어 `tsc` 에 도달하지 못한다 (§E). 채택하려면 agy 자신의 축 (iii) 선결이 필요한데, 그 선결(`build:types` 분리 + wasm 타입 stub)은 stub ↔ 실물 drift 라는 새 출처를 만든다. 기존 `pnpm build` 로 같은 목적을 달성하므로 불필요.
- ***"부분 실패로 생긴 `dist` 는 불완전한 `.d.ts` (Corrupted `.d.ts`) 를 남긴다"*** — **반증**. `tsc` 는 `noEmitOnError` 기본값에서 *"에러 난 파일 이전까지"* 가 아니라 **전량 방출**한다. 실측 `58/58` (의도 대상 전량), 공개 `.d.ts` 의 `physics-wasm` 참조 `0` 건 (§결과 3). 다만 agy 의 나머지 두 근거 — `&&` 체인 파탄, 에이전트 오진 유발 — 은 타당해 §결정 3 이 exit `2` 의 이유를 명시하는 형태로 반영했다.
- ***"Next.js CLI 가 `tsconfig.json` 을 자동 변조한다"*** — 본 저장소에서 **미재현**. `next typegen` 과 `next dev` 를 모두 돌린 뒤 `git status --porcelain` 이 **빈 출력**이다. `apps/web/tsconfig.json` 의 `include` 에 `.next/types/**/*.ts` · `.next/dev/types/**/*.ts` 가 이미 있어 Next 가 써넣을 것이 없다. (일반론으로는 참이나 현 구성에는 비적용.)

### 고유 발견 (후속 분리)

- **`packages/{shared,core}` 의 테스트 파일이 CI 타입 검사 밖에 있다** — agy 의 *"CI 에 typecheck 0 개는 기술 부채"* 를 실측으로 좁힌 결과다. `next build` 가 `apps/web` 을 (테스트 포함) 검사하고 `tsconfig.build.json` 이 `packages` 소스를 검사하지만, 후자는 `**/*.test.ts` 를 `exclude` 한다. `pnpm --filter core typecheck` 는 현재 exit `0` (`error TS` `0`) 이라 **지금은 무결**하지만 강제 지점이 없다. 본 이슈(worktree 마찰)와 직교하므로 후속 이슈로 분리한다.
