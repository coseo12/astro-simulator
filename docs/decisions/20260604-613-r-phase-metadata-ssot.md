# ADR 20260604 — R-Phase body 메타데이터 SSoT (`introducedInRPhase`)

- **상태**: Provisional (cross-validate 발동 ADR — CLAUDE.md §ADR Status #370. 본문 §교차검증 반영 사항 통합 후 Accepted 전이)
- **날짜**: 2026-06-04
- **결정자**: architect (#613 설계 위임, 2026-06-04)
- **관련**: #613 (본 이슈), #598 (PR #601 — `R_PHASE_BODY_ALLOWLIST` ↔ `FOCUS_BODIES` 정적 매칭 가드), #602 (browser-verify-397-residual.mjs 폐기 — cross-validate agy 고유 발견 발화), [`20260504-r-phase-allowlist-guard.md`](20260504-r-phase-allowlist-guard.md) (R-Phase 진입 5곳 동시 박제 절차 SSoT — 본 ADR 이 그 절차의 일부를 자동화), [`20260528-r5-mars-visualization.md`](20260528-r5-mars-visualization.md) (R5 본 진입 §결정 7 R-Phase Allowlist), [`docs/architecture/principles.md`](../architecture/principles.md) §1 Visual Fidelity (데이터 SSoT 보존 원칙), [`docs/glossary.md`](../glossary.md) (R-Phase / R_PHASE_BODY_ALLOWLIST / 5곳 동시 박제)

---

## 배경

R-Phase 진입 시 body 의 **"최초 등장 R-Phase" 정보가 SSoT 단일 출처가 아니라 여러 파일에 흩어져 수동 동기화** 되어 반복적 drift 를 유발한다.

현재 R-Phase 진입 의무 **5곳 동시 박제** (glossary §"BODY_SCALE / R-Phase 정책 매트릭스"):

1. `BODY_SCALE` (`apps/web/src/constants/body-scale.ts`) — **시각 활성** (Visual Fidelity 왜곡 값, 본 ADR 범위 밖)
2. `R_PHASE_BODY_ALLOWLIST` (`packages/core/src/scene/r-phase-allowlist.ts`) — **focus 활성** 하드코딩 8개
3. `FOCUS_BODIES` (`apps/web/scripts/browser-verify-378-focus.mjs`) — verify 매트릭스 하드코딩
4. R-Phase ADR §결정 cross-link
5. CHANGELOG `### Behavior Changes`

이 중 **(2) `R_PHASE_BODY_ALLOWLIST` 와 (3) `FOCUS_BODIES` 가 동일한 "최초 등장 R-Phase" 정보를 두 곳에 손으로 옮기는 구조** 라 drift 가 반복 발생했다:

- **#598 (PR #601)**: `R_PHASE_BODY_ALLOWLIST` ↔ `FOCUS_BODIES` drift → 정적 매칭 가드 추가 (사후 안전망)
- **#602**: `browser-verify-397-residual.mjs` 의 `FOCUS_BODIES` 가 R3 baseline 잔존 (R4/R5 누락) → 폐기

근본 원인은 "drift 를 감지" 가 아니라 **"drift 가 발생할 수 있는 중복 출처 자체"** 다. body 데이터에 `introducedInRPhase` 메타데이터를 추가해 `R_PHASE_BODY_ALLOWLIST` 를 **자동 생성** 하면, (2)·(3) 의 수동 동기화 자체가 구조적으로 사라진다.

`#602` cross-validate (agy, 2026-06-04) 고유 발견에서 분리된 후속 이슈이며, agy 가 제시한 설계 스케치(각 body 정의에 `introducedInRPhase` 속성 부여 → allowlist 자동 생성)를 본 ADR 이 구체화한다.

### 확정된 코드베이스 사실 (실측)

- **데이터 소스**: `packages/shared/data/solar-system.json` 에 전체 태양계 **24 body** 이미 정의 (sun ~ swift-tuttle). 본 이슈 착수 시점 `python3 json.load` 로 실측: sun / mercury / venus / earth / moon / mars / phobos / deimos / jupiter / io / europa / ganymede / callisto / saturn / uranus / neptune / ceres / pluto / haumea / makemake / eris / halley / encke / swift-tuttle.
- **zod 스키마**: `packages/core/src/ephemeris/solar-system-loader.ts` `CelestialBodyRawSchema` + `LoadedCelestialBody` interface. `dataSource`/`lastVerified`/`uncertainty`/`epoch` 등 optional 메타 필드 확장 선례 존재.
- **현재 allowlist**: `R_PHASE_BODY_ALLOWLIST = Object.freeze([...8개] as const)`. `RPhaseBodyId = (typeof R_PHASE_BODY_ALLOWLIST)[number]` — **8개 union literal 타입**. `isRPhaseFocusable` helper.
- **#598 정적 가드 메커니즘**: `packages/core/src/scene/r-phase-allowlist.test.ts:94-103` 이 `browser-verify-378-focus.mjs` 소스를 regex (`const FOCUS_BODIES = [...]`) 로 파싱해 `R_PHASE_BODY_ALLOWLIST` 와 `toEqual` 정합 단언. **`browser-verify-r-phase-allowlist.mjs` 의 `RPHASE_EXPECTED_ENABLED` (62줄) 는 shortcut bar 등록 대상만 (satellite 제외) 이라 정적 가드 비대상** — 별도 수동 list.
- **로드맵 R-Phase ↔ body 매핑** (`docs/phases/roadmap-v3-incremental.md`): R1=sun / R2=+mercury / R3=+venus / R4=+earth+moon / R5=+mars+phobos+deimos / R6=+jupiter+galilean4(io/europa/ganymede/callisto) / R7=+saturn+고리 / R8=+uranus / R9=+neptune / R10=왜소행성(ceres/pluto/haumea/makemake/eris)+혜성(halley/encke/swift-tuttle).

---

## 후보 비교

### 결정 A — `introducedInRPhase` 위치 (데이터 vs 코드)

| 축 | A1: JSON 데이터 SSoT | A2: 코드 (`r-phase-allowlist.ts` 내 매핑 객체) |
|---|---|---|
| **Visual Fidelity 정합** | ✓ R-Phase 등장 순서는 **실측 사실** (반지름·궤도와 동급 body 정적 속성). 데이터 SSoT 가 자연 위치 | △ R-Phase 매핑이 코드에 갇혀 데이터-코드 경계 흐려짐 |
| **drift 표면** | ✓ body 정의 1곳에 등장 페이즈 박제 → loader 가 단일 소스로 읽음 | △ JSON body 추가 시 코드 매핑도 갱신 (2곳) — drift 재발 여지 |
| **타입 안전성** | △ JSON import 는 wide `number` 추론 (zod 로 runtime 검증) | ✓ 코드 const 객체는 literal 타입 추론 가능 |
| **R6+ 확장** | ✓ JSON 에 이미 24 body 존재 → 번호만 부여 | △ 코드 매핑에 24 entry 별도 유지 |

**선택: A1 (JSON 데이터 SSoT)**. 근거: `docs/architecture/principles.md` §1 Visual Fidelity 의 "데이터 SSoT 불변" 계층 정책 — body 의 정적 속성(반지름·질량·궤도·**최초 등장 페이즈**)은 데이터 계층에 박제. R-Phase 등장 순서는 로드맵이 정한 사실이며 body 고유 메타로 자연스럽다. 단, JSON 은 시각 왜곡 값(`BODY_SCALE`)이 아니므로 Visual Fidelity 의 "rendering 시점 왜곡" 과 무관 — 순수 메타데이터 추가다.

### 결정 B — `RPhaseBodyId` 타입 처리 (자동 생성 시 union literal 보존 vs 약화)

현재 `RPhaseBodyId = (typeof R_PHASE_BODY_ALLOWLIST)[number]` = `'sun' | 'mercury' | ... | 'deimos'` (8 union literal).

`R_PHASE_BODY_ALLOWLIST` 를 런타임 필터(`bodies.filter(b => b.introducedInRPhase <= CURRENT_R_PHASE)`)로 생성하면 — JSON import 가 wide `string` 추론이므로 **결과 배열 원소 타입은 `string`** 으로 약화되어 8개 union literal 이 소실된다.

| 축 | B1: union literal 약화 수용 (`type RPhaseBodyId = string`) | B2: 별도 `as const` 마스터 튜플 유지 + 런타임 일치 검증 |
|---|---|---|
| **타입 안전성** | △ `RPhaseBodyId` 가 `string` 으로 wide — 컴파일타임 오타 차단 소실 | ✓ literal union 유지 — 기존 소비처 타입 계약 무변경 |
| **SSoT 단일성** | ✓ 진짜 단일 출처 (JSON) | △ 마스터 튜플(코드) + JSON 두 출처 — 런타임 검증으로 정합 |
| **소비처 영향** | △ 13 소비처 중 타입 의존처(`url-sync.tsx` 등) 점검 필요 | ✓ 무변경 |
| **drift 재발** | ✓ 0 (단일 출처) | △ 마스터 튜플 ↔ JSON drift 여지 (런타임 가드로 차단) |

**선택: B1 (union literal 약화 수용) + 보완**. 근거:
- 실측 조사 결과 **13 소비처 중 `RPhaseBodyId` 타입을 import 해 타입 파라미터로 쓰는 곳은 없다** — 전부 `R_PHASE_BODY_ALLOWLIST` (값) + `isRPhaseFocusable` (런타임 helper) 만 사용. `RPhaseBodyId` 는 `index.ts` 에서 re-export 만 될 뿐 실 소비처 타입 의존 없음 (`grep` 실측). 따라서 union literal 약화의 실제 비용이 낮다.
- **보완**: `RPhaseBodyId` 를 완전히 `string` 으로 두지 않고, **JSON body `id` 전체의 union 타입**(`type BodyId = (typeof SOLAR_SYSTEM_BODY_IDS)[number]`)을 별도로 추출해 `RPhaseBodyId = BodyId` 로 둔다. JSON `id` 는 zod 검증 + `satisfies` 로 const literal 추출 가능(아래 결정 C 참조). 이 경우 union 은 **24 body 전체** 로 wide 되지만 여전히 literal (임의 string 아님) — 오타 차단은 유지되고 "8개로 좁힘" 만 포기. **재검토 조건**: 향후 `RPhaseBodyId` 를 "현재 R-Phase focus 가능 body" 로 좁혀야 하는 타입 소비처가 생기면 B2(마스터 튜플)로 전환 검토.

> Developer 재량 여지: B1 보완(24 body union)이 타입 추출 복잡도(JSON `satisfies` const) 대비 ROI 낮다고 실측되면, 단순 `type RPhaseBodyId = string` + 주석 계약(런타임 `isRPhaseFocusable` 가드가 실질 방어)로 후퇴 가능. 단 그 경우 **소비처 13곳 타입 에러 0 을 빌드로 실증** + 후퇴 사실을 PR 본문에 박제.

### 결정 C — `CURRENT_R_PHASE` 상수 + `R_PHASE_BODY_ALLOWLIST` 자동 생성 로직 위치

| 축 | C1: `r-phase-allowlist.ts` 내 (loader 호출) | C2: `solar-system-loader.ts` 내 (`LoadedSolarSystem` 에 필드 추가) |
|---|---|---|
| **wasm-safe 경계** | ✓ 기존 모듈 위치 유지 — `scene/index.ts` re-export 패턴 보존 (turbopack `__dirname` SSR 500 회귀 가드, ADR §Amendment D1) | △ loader 는 ephemeris 도메인 — scene allowlist 책임 혼입 |
| **책임 분리** | ✓ R-Phase allowlist = scene 책임. loader 는 데이터 로드만 | △ loader 가 R-Phase 정책까지 알게 됨 |
| **import 방향** | ✓ allowlist → loader (`getSolarSystem`/`loadSolarSystem`) 단방향 | — |

**선택: C1**. `CURRENT_R_PHASE` 상수와 자동 생성 로직을 `r-phase-allowlist.ts` 내에 둔다. loader(`solar-system-loader.ts`)는 zod 스키마 + `LoadedCelestialBody.introducedInRPhase` 필드 노출까지만 담당하고, allowlist 생성(필터)은 scene 책임으로 유지한다.

```typescript
// r-phase-allowlist.ts (자동 생성 예시 — Developer 가 실 구현)
import { getSolarSystem } from '../ephemeris/solar-system-loader.js';

/** 현재 도달한 R-Phase. R-Phase 진입 시 이 상수 1줄만 증가. */
export const CURRENT_R_PHASE = 5;

export const R_PHASE_BODY_ALLOWLIST = Object.freeze(
  getSolarSystem()
    .bodies.filter((b) => b.introducedInRPhase !== undefined && b.introducedInRPhase <= CURRENT_R_PHASE)
    .map((b) => b.id),
);
```

> **wasm-safe 주의 (Developer 필독)**: `r-phase-allowlist.ts` 가 `solar-system-loader.ts` 를 import 하면 module dep graph 가 변경된다. 기존 ADR §Amendment D1 (turbopack `__dirname` SSR 500 회귀) 은 **`package.json` exports sub-path entry 추가** 가 트리거였으므로 import 추가 자체는 별개일 가능성이 높으나, **반드시 dev 빌드 SSR 200 + `verify-core-exports-immutable.sh` 통과를 구현 단계에서 실증** 한다. loader 는 이미 scene 모듈들이 의존하는 core 내부 모듈이므로 신규 외부 sub-path 노출은 없다.

### 결정 D — `#598` 정적 매칭 가드 재설계

자동 생성 후 `R_PHASE_BODY_ALLOWLIST` 가 데이터에서 파생되므로, `FOCUS_BODIES` (browser-verify-378-focus.mjs) 와의 관계를 재정의한다.

| 축 | D1: `FOCUS_BODIES` 도 자동 생성 (import) | D2: `FOCUS_BODIES` 하드코딩 유지 + 정적 가드 존속 |
|---|---|---|
| **drift 표면** | ✓ 0 (단일 출처) | △ 하드코딩 잔존하나 정적 가드가 CI 차단 |
| **browser-verify 독립성** | △ verify 스크립트가 core 빌드 산출물에 의존 → dev 빌드 전 실행 불가 케이스 | ✓ verify 는 정적 list 로 독립 실행 (현 구조 유지) |
| **#598 가드 존속 의미** | 가드 무의미(자기참조) → 폐기 | ✓ 가드가 "데이터 파생 allowlist ↔ 하드코딩 verify list" 정합 보증 |

**선택: D2 (하드코딩 유지 + 정적 가드 존속)**. 근거:
- browser-verify 스크립트는 **Playwright runtime 에서 실행되는 독립 검증 도구** 로, core 모듈 import 없이 정적 list 로 동작하는 게 격리성 측면에서 옳다(테스트 더블이 SUT 를 import 하지 않는 원칙).
- `#598` 정적 가드(`r-phase-allowlist.test.ts`)는 **`R_PHASE_BODY_ALLOWLIST` (이제 자동 생성) ↔ `FOCUS_BODIES` (하드코딩) 정합** 을 계속 보증한다. 자동 생성으로 (2)↔(3) 의 "값 자체 drift" 는 사라지지만, R-Phase 진입 시 **`FOCUS_BODIES` 하드코딩 갱신 누락** 은 여전히 가능 → 정적 가드가 그 누락을 CI fail-fast 로 잡는다.
- 단, 자동 생성으로 **수동 박제 부담은 5곳 → 3곳으로 감소**: `CURRENT_R_PHASE` 1줄 증가 + `introducedInRPhase` 데이터(R6+ 사전 부여 시 0줄) + `FOCUS_BODIES` 하드코딩. `R_PHASE_BODY_ALLOWLIST` 직접 박제는 소멸.

> 가드 재설계의 가드 무력화 회피(`docs/lessons/guard-design-principles.md`): #598 가드를 폐기하지 않고 **존속** 시키는 것이 fail-fast 원칙 정합. "자동 생성했으니 가드 불필요" 는 `FOCUS_BODIES` 하드코딩이 남는 한 거짓.

### 결정 E — R6+ body 의 `introducedInRPhase` 사전 부여 범위

| 축 | E1: 전체 24 body 에 지금 부여 | E2: R5 까지 8 body 만, R6+ 는 진입 시 부여 |
|---|---|---|
| **Concrete Prediction 강도** | ✓ R6 진입 = `CURRENT_R_PHASE` 1줄만 (데이터 0줄) — "데이터+상수만, 코드 0" 예측 강함 | △ R6 진입 시 데이터 4줄(jupiter+galilean) + 상수 1줄 |
| **데이터 정확성** | ✓ 로드맵 v3 가 R6~R10 매핑 확정 (사실) | △ 미래 매핑이 바뀌면 데이터 수정 — 단 로드맵 안정적 |
| **회귀 위험** | ✓ `CURRENT_R_PHASE=5` 필터가 R6+ body 를 자동 제외 → 현재 동작 무변경 보장 | ✓ 동일 |
| **마이그레이션 검증** | ✓ 24 body 전체 번호 부여 후 필터 결과 == 현 8개 검증 (E2 와 동일 강도) | ✓ |

**선택: E1 (전체 24 body 사전 부여)**. 근거:
- 로드맵 v3 (`roadmap-v3-incremental.md`) 가 R1~R10 ↔ body 매핑을 **이미 확정** 했다 — `introducedInRPhase` 는 그 확정 사실의 데이터 박제일 뿐 추측이 아니다.
- **Concrete Prediction 극대화**: R6 진입이 `CURRENT_R_PHASE = 5 → 6` 단 1줄(데이터 변경 0)이 되어, "신규 데이터 ≠ 신규 코드" ADR 예측 재현(`docs/lessons/data-not-code-extension.md`)의 강한 실증이 된다.
- `CURRENT_R_PHASE=5` 필터가 R6+ body(`introducedInRPhase >= 6`)를 자동 제외하므로 **현재 동작은 정확히 무변경** (마이그레이션 안전성, 결정 F).

**전체 24 body `introducedInRPhase` 매핑** (로드맵 v3 정합):

| R-Phase | body |
|---|---|
| 1 | sun |
| 2 | mercury |
| 3 | venus |
| 4 | earth, moon |
| 5 | mars, phobos, deimos |
| 6 | jupiter, io, europa, ganymede, callisto |
| 7 | saturn |
| 8 | uranus |
| 9 | neptune |
| 10 | ceres, pluto, haumea, makemake, eris, halley, encke, swift-tuttle |

> R7 saturn 고리는 별도 `rings` 데이터(이미 존재)라 body entry 추가 아님. R10 은 왜소행성 5 + 혜성 3 = 8 body 동시 진입(로드맵 표기). 만약 R10 을 세분(왜소행성/혜성 분리)하기로 추후 결정되면 해당 body 의 `introducedInRPhase` 만 데이터 수정 — 이는 로드맵 변경 동반이므로 정당.

### 결정 F — 마이그레이션 안전성 (회귀 0 검증 방법)

자동 생성 결과가 현재 하드코딩 8개와 **정확히 일치** 함을 단위 테스트로 강제한다:

1. **순서 보존**: `R_PHASE_BODY_ALLOWLIST` 는 현재 `['sun','mercury','venus','earth','moon','mars','phobos','deimos']` 순서. 자동 생성은 `solar-system.json` 의 `bodies` 배열 순서를 따르므로, **JSON body 정의 순서가 R-Phase 등장 순서와 일치** 함을 검증해야 한다. 실측: JSON 순서 == 로드맵 등장 순서(sun→mercury→...→deimos→jupiter→...) 이미 일치(위 §확정 사실 body 목록). 단위 테스트로 `toEqual` (순서 포함) 박제.
2. **#598 정적 가드 존속**: `r-phase-allowlist.test.ts` 의 `toEqual([...R_PHASE_BODY_ALLOWLIST])` 가 자동 생성값 == `FOCUS_BODIES` 를 계속 단언 → 회귀 차단.
3. **R6 시뮬레이션 테스트**: `CURRENT_R_PHASE` 를 6 으로 가정한 순수 함수(필터 로직 분리) 단위 테스트로 jupiter+galilean4 가 추가됨을 검증 → R6 진입 동작 사전 실증.

---

## 결정 (요약)

| # | 결정 | 박제 위치 |
|---|---|---|
| A | `introducedInRPhase` 는 **JSON 데이터 SSoT** (`solar-system.json`) | `packages/shared/data/solar-system.json` |
| B | `RPhaseBodyId` 는 JSON body `id` union(24 body literal)으로 추출, 8개 좁힘 포기. 소비처 타입 의존 0 실측 → 비용 낮음. Developer 재량으로 `string` 후퇴 가능(빌드 실증 + PR 박제 조건) | `r-phase-allowlist.ts` |
| C | `CURRENT_R_PHASE` 상수 + 자동 생성 필터는 `r-phase-allowlist.ts` 내. loader 는 zod 필드 + interface 만 | `r-phase-allowlist.ts` / `solar-system-loader.ts` |
| D | `#598` 정적 매칭 가드 **존속** (`FOCUS_BODIES` 하드코딩 유지). 자동 생성은 (2)↔(3) 값 drift 만 제거, 하드코딩 누락은 가드가 계속 차단 | `r-phase-allowlist.test.ts` / `browser-verify-378-focus.mjs` |
| E | 전체 **24 body** 에 `introducedInRPhase` 사전 부여 (로드맵 v3 확정 매핑) | `solar-system.json` |
| F | 자동 생성 == 하드코딩 8개 회귀 검증: 순서 보존 `toEqual` + #598 가드 존속 + R6 필터 시뮬레이션 테스트 | `r-phase-allowlist.test.ts` |

---

## 결과·재검토 조건

### Concrete Prediction (신규 데이터 ≠ 신규 코드 — `docs/lessons/data-not-code-extension.md`)

> **R6 (jupiter + galilean4) 진입 시 `git diff --stat` 예측**:
> - `r-phase-allowlist.ts`: `CURRENT_R_PHASE = 5` → `6` — **1 라인 변경**
> - `solar-system.json`: **0 라인** (jupiter/io/europa/ganymede/callisto 의 `introducedInRPhase: 6` 이미 본 ADR 에서 사전 부여)
> - `r-phase-allowlist.ts` `R_PHASE_BODY_ALLOWLIST` 본체: **0 라인** (자동 생성)
> - 13 소비처: **0 라인** (값/helper 만 소비, 무변경)
> - `FOCUS_BODIES` (browser-verify-378-focus.mjs): **+5 토큰** (jupiter/io/europa/ganymede/callisto — 하드코딩 verify list 갱신, #598 가드가 누락 시 fail)
> - `RPHASE_EXPECTED_ENABLED`/`RPHASE_EXPECTED_DISABLED` (browser-verify-r-phase-allowlist.mjs): shortcut bar 정책(Q4a) 에 따라 수동 — 본 ADR 범위 밖(별도 정적 가드 비대상)
>
> **핵심 예측**: R-Phase 진입의 코드 변경이 `CURRENT_R_PHASE` 1줄로 수렴. 데이터(`introducedInRPhase`)는 사전 부여로 0줄. 이 예측이 R6 에서 재현되면 데이터-코드 분리 추상화의 건강성 실증, 실패하면 추상화 누수 신호.

### 본 PR 직후 검증 (마이그레이션 안전성)

- `R_PHASE_BODY_ALLOWLIST` 자동 생성값 `toEqual` 현 하드코딩 8개 (순서 포함) — 단위 테스트 PASS
- `pnpm -F @astro-simulator/core test` 전체 PASS (기존 r-phase-allowlist.test.ts 무수정 통과 — 값·순서·freeze·타입 추출)
- `#598` 정적 가드 (`FOCUS_BODIES` ↔ allowlist) PASS
- dev 빌드 SSR 200 + `scripts/verify-core-exports-immutable.sh` PASS (loader import 추가의 wasm-safe 실증)
- 13 소비처 타입 빌드 에러 0 (`pnpm -F @astro-simulator/core build` + web 빌드)

### 재검토 조건

- **결정 B 전환**: `RPhaseBodyId` 를 "현재 focus 가능 body"(8개)로 좁혀야 하는 타입 소비처 등장 → B2(마스터 튜플 + 런타임 정합 검증)로 전환
- **결정 D 전환**: browser-verify 를 core 빌드 산출물 기반으로 통합하기로 한다면 `FOCUS_BODIES` 자동 생성(D1) 재검토 — 단 verify 격리성 손실 trade-off
- **로드맵 R6~R10 매핑 변경**: `introducedInRPhase` 데이터 수정 (로드맵 변경 동반이므로 정당)
- **R10 세분화**: 왜소행성/혜성 분리 진입 시 해당 body `introducedInRPhase` 만 조정

---

## 교차검증 반영 사항

> cross-validate (agy) 호출 후 본 섹션을 4축(합의 / 이견 수용 / Claude 재분석 기각 / 고유 발견 후속 분리)으로 채우고 상태를 Accepted 로 전이한다. (CLAUDE.md §교차검증 / §ADR Status #370)

- **호출 전 Claude 편향 셀프 체크** (CLAUDE.md §교차검증 4종): 낙관적 일정 — 해당 없음(설계만) / **결합 간과 — 부분 미통과**: `r-phase-allowlist.ts` → `solar-system-loader.ts` import 추가가 turbopack module dep graph 를 바꿔 `__dirname` SSR 500(ADR §Amendment D1) 을 재발시킬 결합 위험. cross-validate 명시 질문으로 삽입 / 폐기 프레이밍 — 통과(#598 가드 존속, 결정 D) / 순수주의 — 통과(결정 B union 약화 수용 + Developer `string` 후퇴 재량).
