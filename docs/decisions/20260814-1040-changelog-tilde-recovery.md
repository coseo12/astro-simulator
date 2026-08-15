# ADR: 릴리스 확정 CHANGELOG 의 GFM 취소선 손상 회수 — 소급 편집 금지의 기계 판정 가능한 예외 (#1040)

- 일자: 2026-08-14
- **상태**: **Provisional** (cross-validate 는 메인 오케스트레이터가 수행 — `.claude/agents/developer.md` §규칙 [#479](https://github.com/coseo12/astro-simulator/issues/479). 결과 통합 후 `Accepted` 전이). ⚠️ 본 라인은 [`20260812-1005`](20260812-1005-adr-index-status-guard.md) §재검토 조건의 **어순 제약** 대상이다 — 현재 상태 토큰이 최선두여야 한다
- 관련: 이슈 [#1040](https://github.com/coseo12/astro-simulator/issues/1040) / 선행 [#982](https://github.com/coseo12/astro-simulator/issues/982) (신규 유입 차단 가드) / [#1013](https://github.com/coseo12/astro-simulator/issues/1013) (§7-1 규약 신설)
- 선행 ADR: [`20260814-982`](20260814-982-changelog-tilde-guard.md) (bare `~~` 금지 가드 — 그 §후보 비교가 존량 회수를 본 이슈로 **명시 위임**했다) / [`20260808-983`](20260808-983-measurement-recording-convention.md) (수치 박제 규약 + **소급 편집 금지의 정본 해석**)
- **측정 rev**: `fe922bb` (`origin/develop` tip, 2026-08-14). 본 문서의 모든 수치는 이 단일 rev 에서 일괄 도출했다 ([`20260808-983`](20260808-983-measurement-recording-convention.md) §부분 재측정 금지)

---

## 배경

### 손상 실측

`CHANGELOG.md` 의 코드 펜스 밖 ∧ 인라인 코드 스팬 밖 `~~` (= [ADR `20260814-982`](20260814-982-changelog-tilde-guard.md) 채택 술어 C):

```bash
# 정본 술어 — 가드의 분류기를 그대로 쓴다 (문서에 판정식을 재서술하지 않는다, #1010)
node --input-type=module -e '
import fs from "node:fs";
import { scanContent } from "./scripts/verify-md-tilde.mjs";
const v = scanContent(fs.readFileSync("CHANGELOG.md", "utf8"));
console.log(v.length + " 줄 / " + v.reduce((a, x) => a + x.columns.length, 0) + " 발생");
console.log("최소 손상 행 " + Math.min(...v.map((x) => x.lineNo)));
'
```

| 값 | rev `fe922bb` |
| --- | ---: |
| 손상 줄 | **21** |
| 손상 발생 | **44** |
| 최소 손상 행번호 | **706** |
| `## [0.73.0]` 헤딩 행 | **71** |

**21 줄 전건이 릴리스 확정 구간**이다 (`[Unreleased]` 침범 **0**). 이슈 본문의 _"최소 12종"_ 은
메인이 출력에 `head -12` 를 붙인 절단값이었고, 이슈 코멘트 3라운드에서 `21 줄 / 44 발생`
(술어 C 기준) 으로 이미 정정돼 있다. 본 rev 재측정이 그 값을 **재현**한다.

의도된 취소선은 이 모집단에 **0 건**이다 — 44 발생 전건이 범위(`R1~R4` / `92k~122.5k`) 또는
근사(`~345px` / `~9%`) 표기다. 정밀도의 출처는 술어가 아니라 **모집단**이라는
[ADR `20260814-982`](20260814-982-changelog-tilde-guard.md) §결정 2 의 판정이 여기서도 유지된다.

### 왜 판정이 필요한가 — 두 규범이 정면으로 부딪힌다

- **(가) 소급 편집 금지** — `.claude/agents/reviewer.md` §절차 4 4항 **2계급**: _"그 시점의 사실 서술인가
  → **이력 기록** (소급 편집 = **기록 위조**)"_. 오판 피해도 명시돼 있다 — _"2 를 1 로는 기록 위조로
  되돌릴 수 없다"_.
- **(나) 가독성 회복** — 회수 전 `CHANGELOG.md:1353` 은 작성자가 쓴 `Amendment 7~12 누적 + R1~R3` 이
  `Amendment 7~~12 누적 + R1~~R3` 으로 정규화돼, GitHub 에서 **`12 누적 + R1` 구간이 취소선**으로
  렌더링됐다. 미래 관찰자에게 _"철회된 내용"_ 신호를 준다.

  > ⚠️ 위 두 형태를 **인라인 코드로 감쌌다.** 감싸지 않으면 이 ADR 자신이 취소선으로 렌더링돼
  > 같은 결함을 시연한다. `docs/decisions/**` 는 prettier 미소유라 `verify-md-tilde.mjs` 모집단
  > **밖**이고, 그래서 이 손상은 **가드가 잡아 주지 않는다** — 초고에서 실제로 발생해 커밋 후
  > 육안 재검에서 잡았다 (본 ADR §결정 4 가 말하는 _"규약은 있는데 발화 지점이 없는"_ 구간).

### 손상은 작성자가 만들지 않았다

`prettier --write` 는 인라인 코드 밖의 단일 `~` 를 GFM 취소선 delimiter 로 정규화한다. 격리 재현
(`pnpm exec prettier --parser markdown`, lockfile 정본 `3.9.6`):

```text
입력:  A~B 그리고 C~D 문장.
출력:  A~~B 그리고 C~~D 문장.      ← 손상 (한 문단에 `~` 2개 → 페어링)

입력:  A~B 문장 하나뿐.
출력:  (불변, --check exit 0)      ← 짝이 없으면 취소선 노드가 아니다
```

즉 **저장소의 `lint-staged` 훅 안에서 손상이 생성**됐고, 작성자는 `~` 를 하나 썼을 뿐 `~~` 를 본 적이
없다. 이 사실이 (가) ↔ (나) 판정의 핵심 재료다 — 규범 (가) 가 겨누는 것은 **사람이 기록을 고쳐 쓰는
행위**인데, 여기서는 **기계가 이미 고쳐 썼다**.

> ⚠️ **[가정]** GFM 명세는 **단일** `~` 도 취소선 delimiter 로 허용하므로, prettier 이전의 원 표기
> (`A~B … C~D`) 도 GitHub 에서 이미 취소선으로 렌더링됐을 가능성이 높다. 위 실측은 **prettier 가
> 번들한 remark GFM 파서**가 취소선 노드로 파싱했다는 사실까지이고, GitHub 렌더러 직접 실측은
> 하지 않았다 (`gh api /markdown` 은 POST 라 본 세션의 GET 전용 제약 밖). 이 가정은 결정의
> **보조 근거**일 뿐이며, 아래 §결정 의 3축은 이 가정 없이도 성립한다.

---

## 규범 실측 — 무엇이 실제로 이 불변식에 의존하는가

이슈 본문은 _"릴리스 태그와의 byte 대조가 이 저장소의 회귀 가드다"_ 라고 적었다. **실측 결과 그
가드는 존재하지 않는다.** 결정 비용을 이 실측 위에 세운다.

```bash
# (P1) 태그 대조 계열 술어 존재 여부
git grep -nE --untracked 'git (tag|describe)|refs/tags' -- scripts .github .husky

# (P2) 확정 구간 불변식 표기 변형 전수 (기계 표면 한정)
git grep -nFi --untracked -e '소급' -e '기록 위조' -e 'byte 대조' -e '바이트 대조' \
  -e '태그 대조' -e '확정 구간' -e '릴리스 확정' -- scripts .github .husky .claude packages apps
```

**(P1) 결과 — hit 1 건**: `.github/PULL_REQUEST_TEMPLATE.md:47` 의 `git tag vX.Y.Z` 는 릴리스 절차의
태그 **생성** 단계다. **대조**하는 술어는 0 건이다.

**(P2) 결과 — hit 7 건, 기계 판정 0 건**:

| 위치 | 성격 | 확정 구간 byte 를 읽는가 |
| --- | --- | --- |
| `.claude/agents/reviewer.md` ×2 | 에이전트 행동 규범 (5분류 2계급) | 아니오 — 사람/LLM 판정 |
| `.github/workflows/ci.yml:86` | 주석 (`[Unreleased]` soft-warn 설명) | 아니오 — 판정은 `changelog_touched` boolean |
| `packages/core/src/scene/tier-proportion.test.ts:165` | 주석 (특정 상수 보존 근거) | 아니오 |
| `scripts/verify-md-tilde.mjs` ×3 | 주석 (§범위 경계 (i) — 확정 구간을 **보고 대상에서 뺀다**) | 아니오 |

`CHANGELOG.md` 를 실제로 **읽는** 기계 술어는 4개이고, 어느 것도 확정 구간 본문 byte 에 의존하지
않는다:

| 술어 | 읽는 것 | 본 회수의 영향 |
| --- | --- | --- |
| `scripts/verify-release-version-bump.sh` | 첫 `## [X.Y.Z]` 헤딩 1줄 (`grep -oE … \| head -1`) | 없음 — 헤딩 무접촉 |
| `scripts/ci-diff-scope.mjs` | 파일명 포함 여부 (boolean) | 없음 |
| `scripts/verify-docs-links.mjs` | 링크 유효성 | 없음 — 실측 exit 0 (링크 2,908건) |
| `scripts/verify-md-tilde.mjs --staged` | **diff 추가 라인**의 bare `~~` | 회수 후 위반 0 → PASS |

즉 **(나) 를 택할 때 무력화되는 검증 술어는 0 곳**이다. 남는 것은 규범 (가) 의 **해석** 문제뿐이고,
그 해석의 정본은 아래에 이미 존재한다.

### 규범 (가) 의 정본 해석은 이미 "무흔 편집" 을 겨눈다

[`20260808-983`](20260808-983-measurement-recording-convention.md) §Amendment 1 (2026-08-10):

> §결과 3 이 금지하는 것은 **소급 무흔 편집**(_"원조를 편집하지 않는다"_ / _"소급 편집은 기록 위조"_)이지
> **날짜가 박힌 Amendment 를 통한 갱신**이 아니다.

같은 Amendment 는 `Accepted` ADR 의 §결정 조항을 dated Amendment 로 갱신한 전례
([`20260701-779`](20260701-779-ci-alert-fatigue-concurrency.md) §Amendment 2) 를 인용하고, 초판이
_"§결정 은 편집 대상이 아니다"_ 라고 적은 것을 **과대 주장**으로 정정한다. 즉 이 저장소는 이미
**"흔적 있는 갱신 ≠ 위조"** 를 판정해 두었다.

---

## 후보 비교

| 축 | (a) 방치 + 문서화 | (b) 무조건 회수 | (c) **술어 한정 1회 회수** | (d) 절충 (신규만 차단) | (e) `.prettierignore` 제외 후 원 바이트 복원 |
| --- | --- | --- | --- | --- | --- |
| 렌더링 손상 해소 | ✗ 영구 잔존 | ✓ | ✓ | ✗ | **✗** (아래) |
| 규범 (가) 저촉 | 없음 | **있음** — 경계가 판단이라 무한 확장 | 없음 — 경계가 **계산** | 없음 | 없음 |
| 무력화되는 기계 술어 | 0 | 0 | 0 | 0 | **1** (`verify-md-tilde` 모집단 이탈) |
| 남는 부채 | 21 줄 × 영구 | 선례 오염 | 없음 | 21 줄 × 영구 | 포맷 정규화 상실 |

- **(a) 기각** — _"확정 구간에 손상 N 건이 있으며 의도된 취소선이 아니다"_ 라는 각주는 **각주를 읽은
  사람에게만** 작동한다. CHANGELOG 는 특정 릴리스를 조회하러 오는 문서라 그 릴리스 구간만 읽고 나가는
  것이 정상 사용이다. 무엇보다 (a) 는 _"위조 방지 규범이 위조 상태를 보존한다"_ 는 목적 역행을 감수한다.
- **(b) 기각** — 결론은 같지만 경계가 **사람의 판단**이다. _"의미는 안 바뀌니까"_ 는 다음 PR 에서
  오타 수정·수치 갱신으로 늘어난다. 이슈 본문이 지적한 위험이 정확히 이것이고, 타당하다.
- **(d) 기각** — 신규 유입 차단은 [#982](https://github.com/coseo12/astro-simulator/issues/982) 가
  **이미 완료**했다 (pre-commit + CI 2 지점). (d) 는 실질적으로 (a) 와 같고, 잔여 이슈만 영구화한다.
- **(e) 기각 — 렌더링을 고치지 못한다.** GFM 은 단일 `~` 도 취소선 delimiter 로 허용하므로 원 바이트
  `R1~R4 … R1~R3` 를 복원해도 **취소선은 그대로**다. 소스에서 손상이 안 보이게 **감출** 뿐이다.
  게다가 `verify-md-tilde.mjs` 의 모집단은 `.prettierignore` 파생이라 CHANGELOG 를 빼면 #982 가 세운
  강제 지점이 **CHANGELOG 에 대해 소멸**한다 — 가장 자주 편집되는 파일에서 가드를 끄는 셈이다.
- **(c) 채택** — 아래.

---

## 결정

### 결정 1 — 회수한다. GFM 취소선 손상 복구는 소급 편집 금지의 **예외**다

근거 3축. **세 축 모두 §배경 의 `[가정]` (원 표기도 이미 취소선이었다) 없이 성립한다.**

1. **금지의 보호 대상이 다르다.** 규범 정본이 겨누는 것은 **소급 무흔 편집**이다
   ([`20260808-983`](20260808-983-measurement-recording-convention.md) §Amendment 1). 본 회수는
   PR 본문 · CHANGELOG `[Unreleased]` entry · 본 ADR **3중 흔적**을 남기고, git 이력에 pre-image 가
   보존된다. 감추는 편집이 아니다.
2. **사실 서술 불변을 기계가 증명한다.** 5분류 2계급이 보호하는 것은 _"그 시점의 사실 서술"_ 인데,
   아래 §예외 술어 가 그 불변을 **계산으로 확정**한다. 판단이 아니라 계산이므로 (b) 의 확장 위험이
   구조적으로 닫힌다.
3. **방치는 중립이 아니다.** 현재 상태는 이미 원저자의 명제를 다르게 렌더링한다. 규범 (가) 가
   막으려는 것이 _"독자가 믿게 되는 기록의 왜곡"_ 이라면, 그 왜곡은 **이미 진행 중**이고 회수는
   그것을 되돌리는 방향이다.

### 결정 2 — 예외 범위는 아래 **기계 판정 술어**를 통과하는 변경으로 한정한다

4 항 **전건 충족**만 예외다. 하나라도 FAIL 이면 그 변경은 소급 편집이며 금지된다.

```bash
# 확정 구간 회수 인증서 — BASE ↔ HEAD 의 CHANGELOG.md **확정 구간**을 대조한다.
#   ANCHOR = 확정 구간의 첫 헤딩. 이 행 **이하**만 본다 ([Unreleased] 증감은 대조에서 뺀다).
#   HEAD=WORKTREE 로 두면 작업 트리 현재 내용을 본다.
BASE=<base-sha> HEAD=<head-sha|WORKTREE> ANCHOR='## [0.73.0]' node --input-type=module -e '
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { scanContent } from "./scripts/verify-md-tilde.mjs";
const read = (r) => r === "WORKTREE"
  ? fs.readFileSync("CHANGELOG.md", "utf8")
  : execFileSync("git", ["show", r + ":CHANGELOG.md"], { encoding: "utf8", maxBuffer: 6e7 });
const norm = (s) => s.replaceAll("`", "").replaceAll("~~", "~");
const A = read(process.env.BASE).split("\n");
const B = read(process.env.HEAD).split("\n");
const hd = (L) => { const i = L.findIndex((l) => l.startsWith(process.env.ANCHOR));
  if (i < 0) { console.error("FAIL: 앵커 미발견 " + process.env.ANCHOR); process.exit(1); } return i; };
const a = A.slice(hd(A)); const b = B.slice(hd(B));
console.log("확정 구간 라인 수: base " + a.length + " / head " + b.length);
if (a.length !== b.length) { console.error("FAIL: 확정 구간 라인 수 이동 (삽입/삭제 금지)"); process.exit(1); }
const ch = a.map((_, i) => i).filter((i) => a[i] !== b[i]);
const ok = [
  ["(1) 변경 라인 전건이 손상 보유 라인", ch.every((i) => scanContent(a[i]).length > 0), ch.length],
  ["(2) 의미 불변 (백틱 제거 + 물결2 -> 물결1 후 동일)", ch.every((i) => norm(a[i]) === norm(b[i])), ch.length],
  ["(3) 변경 후 해당 라인 손상 잔존 0", ch.every((i) => scanContent(b[i]).length === 0), ch.length],
  ["(4) 파일 전체 손상 잔존 0", scanContent(B.join("\n")).length === 0, scanContent(B.join("\n")).length],
];
for (const [name, pass, n] of ok) console.log((pass ? "PASS" : "FAIL") + "  " + name + "  (n=" + n + ")");
process.exit(ok.every(([, p]) => p) ? 0 : 1);
'
```

**앵커 이하로 스코프를 자르는 이유** — 회수 PR 은 `[Unreleased]` 에 entry 를 **추가**하므로 파일
전체 라인 수는 반드시 늘어난다. 앵커를 안 쓰면 (2) 이전에 라인 수 비교에서 먼저 FAIL 하고,
**확정 구간에서 라인이 삽입·삭제되지 않았다** 는 더 강한 조건도 못 잰다. 앵커 이하 라인 수
**동일**은 _"확정 구간은 치환만 있었다"_ 의 기계 증명이다.

**(2) 가 예외의 경계다.** `norm` 은 백틱을 제거하고 `~~` 를 `~` 로 되돌린다. 낱말 하나, 숫자 하나,
링크 하나가 바뀌면 즉시 FAIL 한다 — 즉 _"의미는 안 바뀌니까"_ 를 **사람이 선언하는 것이 아니라
문자열 동일성이 판정한다.** (1)·(3) 은 목적 한정이다: 손상이 없던 라인은 건드릴 수 없고, 건드린
라인은 손상이 0 이 되어야 한다.

**본 PR 적용 결과** (BASE `fe922bb` / HEAD 작업 트리 / ANCHOR `## [0.73.0]`):

```text
확정 구간 라인 수: base 2353 / head 2353
PASS  (1) 변경 라인 전건이 손상 보유 라인  (n=21)
PASS  (2) 의미 불변 (백틱 제거 + 물결2 -> 물결1 후 동일)  (n=21)
PASS  (3) 변경 후 해당 라인 손상 잔존 0  (n=21)
PASS  (4) 파일 전체 손상 잔존 0  (n=0)
exit=0
```

**negative 실증** — 회수 라인 하나에서 사실 서술만 함께 바꾸면 (BASE `:706` 의 _"실 발동 이력 **0**"_
→ _"**3**"_) **(2) 만 FAIL, exit 1**. positive PASS 는 작동 증거가 아니므로
([`docs/lessons/guard-pr-dod.md`](../lessons/guard-pr-dod.md)) 3중 시뮬레이션 (positive `exit 0` →
negative `exit 1` → recovery `exit 0`) 을 돌렸고, 세 실행 모두 **위 코드 펜스를 파일로 추출해
그대로 실행**했다 (박제 술어 ↔ 실행 술어 동일성 확인 — 본 배치에서 _"결론은 맞고 재현 술어가 틀림"_
이 4회 났던 클래스의 예방).

### 결정 3 — 회수 형태는 **인라인 코드 래핑**이다 (물결 축소가 아니다)

`R1~~R4` → `` `R1~R4` ``. 단일 `~` 로만 되돌리는 형태는 **불가능**하다 — `lint-staged` 의
`prettier --write` 가 커밋 시점에 다시 `~~` 로 정규화하고, 그 결과를 `verify-md-tilde.mjs --staged`
가 FAIL 시킨다. 즉 래핑은 미학적 선택이 아니라 **툴체인이 강제하는 유일한 형태**이며, 동시에
§7-1 의 표준 절차 (_"범위·구간 표기는 반드시 인라인 코드로 감싼다"_) 와 같은 낱말이다.

토큰 경계는 보수적으로 잡는다 — 링크·강조 구분자(`[` `]` `(` `)` `*` `` ` ``)는 감싸지 않는다.
양쪽이 전부 구분자면 **물결만** 감싼다 (`…/852)` + `` `~` `` + `[#858](…)`). 이 처리가 없으면
마크다운 링크가 코드 스팬에 먹혀 죽는다.

### 결정 4 — 잔존 단일 `~` 는 회수 대상이 아니다

회수 후 `CHANGELOG.md` 의 코드 밖 단일 `~` 는 **150 발생 / 124 줄**이다 (rev `fe922bb` + 본 회수).
건드리지 않는다:

- ⚠️ **초판 근거는 GitHub 렌더러 실측으로 반증됐다** (PR [#1081](https://github.com/coseo12/astro-simulator/pull/1081) 리뷰).
  초판은 _"짝이 없어 취소선 노드가 되지 않는다"_ 와 _"`prettier --check` exit 0 ≡ 취소선 노드 0"_ 을 적었으나
  **둘 다 거짓**이다. 렌더링 실측 (GET 전용 — `gh api -H "Accept: application/vnd.github.html"
  "/repos/coseo12/astro-simulator/contents/CHANGELOG.md?ref=<ref>" | grep -c "<del>"`):
  `v0.73.0` **`24`** → head **`2`**. **`44` 발생 중 `22` 소거**로 회수는 작동했으나 **`2` 건이 남는다** —
  `CHANGELOG.md:628`(`2026-06-08~06-10` … `PR(#667~#1033)`) · `:958`(`S1~S3` … `(A~E)`) 로 **둘 다 확정 구간**이고
  원인은 **한 문단 안 단일 `~` 페어링**이다. 렌더링 결과는 각각 `2026-06-0806-10` · `S1S3` 로 **취소선 처리된다**.
  같은 ADR §후보 비교 `(e)` 가 _"GFM 은 단일 `~` 도 취소선 delimiter 로 허용"_ 이라 적었고 **그쪽이 옳다** —
  본 항이 자기모순이었다.
- **따라서 완결 주장을 한정한다** — _"회수 후 `0`"_ 은 **술어 C 한정**으로 참이다(그 2건은 `scanContent = 0` 이라
  술어 C 에 보이지 않는다). 그리고 **결정 2 술어 (1) 이 이 2건의 수리를 구조적으로 금지**한다
  (base 에서도 `scanContent = 0` 이라 (1) 이 FAIL 한다). **단일 `~` 페어링 회수는 본 ADR 비목표**이며,
  다루려면 술어 C 와 예외 술어 (1) 을 **함께** 재설계해야 한다 — 별도 판정 대상이다.
- ⚠️ **`[가정]` 을 `[실측]` 으로 승격했다면 초판에서 잡혔다.** 초판은 `gh api /markdown` 이 POST 라
  GET 전용 제약 밖이라고 보고 `[가정]` 으로 남겼는데, **contents API 가 GET 으로 렌더링 HTML 을 준다.**
  _"측정 수단이 없다"_ 가 아니라 _"찾지 않았다"_ 였다.
- **미래 재손상은 이미 막혀 있다** — 같은 문단에 `~` 가 하나 더 붙으면 prettier 가 페어링하고, 그
  라인이 diff 에 들어오므로 `verify-md-tilde.mjs --staged` 가 커밋 시점에 FAIL 한다.
- 150 발생을 전부 감싸면 예외가 _"손상 회수"_ 에서 _"확정 구간 일괄 재작성"_ 으로 성격이 바뀐다.
  결정 2 의 (1) 조건이 이를 구조적으로 금지한다.

### 결정 5 — 예외를 **상설 가드로 만들지 않는다**

결정 2 의 술어는 본 ADR 에 재실행 가능한 명령으로 박제하되 CI 에 배선하지 않는다.

- 신규 유입은 [#982](https://github.com/coseo12/astro-simulator/issues/982) 가드가 **0** 으로 만들었다
  (해당 ADR **§결과**: _"#1040 은 존량 21줄만 다루면 된다"_). 상설 가드는 미래 사건에 대해 **precision 0** 이다.
- 같은 계보의 기각이 이미 둘 있다 — [ADR `20260814-982`](20260814-982-changelog-tilde-guard.md)
  §후보 비교 (g) 매직 넘버 baseline / 같은 ADR §모집단 감시 의 _"계수를 차단 조건으로 걸지 않는다"_.
  **관측은 기계, 판단은 사람**이라는 같은 결론이다.
- 본 예외를 원용하는 **2번째 사례**가 발생하면 그때 상설화를 재검토한다 (§재검토 조건 2).

---

## 결과 · 재검토 조건

1. **회수 완료 판정** — `CHANGELOG.md` 의 술어 C 위반 **0 줄 / 0 발생** (§배경 정본 술어 재실행).
   `[Unreleased]` 를 제외한 구간에서 본 PR 이 변경한 라인은 **21 줄**이며, 그 21 줄 전건이 결정 2 의
   4 항을 통과한다.
2. **재검토 조건 1 — 예외 원용 2회차.** 확정 구간 편집이 다시 제안되면 결정 2 의 술어를 **먼저**
   통과시킨다. 통과하면 예외, 못 하면 금지다. **2회차가 발생하는 순간** 본 결정 5(상설화 기각)를
   재검토한다 — 1회성 전제가 깨진 것이기 때문이다.
3. **재검토 조건 2 — 모집단 이동.** `.prettierignore` 변경으로 `CHANGELOG.md` 가 prettier 모집단을
   벗어나면 결정 3 의 _"툴체인이 강제한다"_ 전제가 무효가 된다. 관측 술어는
   `pnpm exec prettier --file-info CHANGELOG.md` 의 `ignored` 필드다.
4. **비목표 (조용한 스킵 아님)** — ① 소급 편집 금지 규범 **자체의 개정**: 본 ADR 은 예외 범위를
   판정할 뿐 §결과 3 조문을 건드리지 않는다 ② `[Unreleased]` 외 구간의 **내용** 변경 ③ 잔존 단일 `~`
   150 발생 (결정 4) ④ `docs/**` 의 의도된 취소선 (prettier 미소유 — **포맷터가 만드는 손상**은 발생하지 않는다.
   ⚠️ **_"손상 자체가 불가능"_ 은 거짓**이다 — **사람이 손으로 쓴** bare `~~` 는 소유와 무관하며,
   본 ADR 초고가 §배경 대로 **실제로 그 손상을 만들어** 커밋 후 육안 재검에서 잡았다(`36710f6`).
   두 축은 **직교**한다).
5. **선행 ADR 과의 관계** — [`20260814-982`](20260814-982-changelog-tilde-guard.md) §후보 비교 표의
   _"3. 기존 손상 전수 정리 → #1040 위임"_ 행이 본 ADR 로 **닫힌다**. 그 ADR 본문은 릴리스 확정분
   (`v0.72.0`) 이라 **소급 치환하지 않는다** — 본 ADR 이 후속 포인터를 갖는 것으로 연결을 만든다.
