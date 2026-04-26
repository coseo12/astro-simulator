# ADR: Tier 네이밍 정책 — 4 네임스페이스 충돌 해소

- **상태**: Accepted
- **날짜**: 2026-04-24
- **결정자**: architect (issue #310 / P11 재개 선행 블로커)
- **관련**: #310 (본 이슈), #289 (P11-B LOD 3단계 + Distance Scale), #290 (P11-C Tier Preset + detect-gpu-tier), ADR `../deprecated/decisions/20260423-display-relative-scale-unification.md` (P12 Scale Tier 확정), ADR `20260420-mobile-support-suspension.md` (#290 선행), 원칙 `docs/deprecated/principles/fact-first.md` (Data Tier 근거)
- **교훈 적용**: CLAUDE.md "주석 계약 vs 구현 drift" (카테고리 enum drift 방지), "신규 데이터 ≠ 신규 코드 — ADR 예측 재현" (Concrete Prediction 박제), "Phase 분리 릴리스 리듬" (본 ADR 릴리스 분할 판정)

---

## 배경

프로젝트에 "Tier" 단어가 **4개 독립 네임스페이스**에서 사용되어 UI 텍스트 / 코드 심볼 / URL 파라미터 3계층에서 관찰자·AI 에이전트·사용자 모두에게 오인을 유발한다.

### 4 네임스페이스 현황 (2026-04-24 실측)

| #   | 네임스페이스       | 상태                 | 의미                                  | 값 domain                  | 현재 코드 심볼 / UI 텍스트                                                                                                  |
| --- | ------------------ | -------------------- | ------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | **P12 Scale Tier** | 구현 완료 (#298)     | 카메라 거리 기반 3단 렌더 스케일      | `solar` / `inner` / `body` | `activeTier` / `setTier` / `Tier` type (`packages/core/src/scene/tier.ts:40`)                                               |
| 2   | **Data Tier**      | 구현 완료 (#278 P10) | 데이터 신뢰도 라벨 (Fact-First 원칙)  | `1` / `2` / `3` / `4`      | `DataTier` type (`packages/shared/src/types/tier.ts:16`) / HUD "Tier 1 관측" (`hud-corners.tsx:113`) / `TierBadge` 컴포넌트 |
| 3   | **LOD level**      | 미구현 (#289 P11-B)  | 거리 기반 렌더 디테일                 | `high` / `mid` / `low`     | 없음 (본 ADR 에서 심볼 확정)                                                                                                |
| 4   | **GPU tier**       | 미구현 (#290 P11-C)  | 기기 성능 등급 + Graceful Degradation | `a` / `b` / `c`            | 없음. `is-mobile.ts` → `detect-gpu-tier.ts` 승격 예정                                                                       |

### 관찰된 충돌 사례

**1. HUD 범례 오인 (#310 원본, 2026-04-23)**

- P12-C 브라우저 재검증 중 "지구 focus 후 Scale Tier=body 동작 확인" 중 우하단 "Tier 1 관측" 을 Scale Tier 상태로 오해
- 실제는 `hud-corners.tsx:113` Data Tier 범례 하드코딩 — scene tier 와 무관
- 원인: 두 개념 모두 "Tier" 단어 + UI 시각 분리 부재

**2. URL 파라미터 `?tier=` 이중 바인딩 (#289 / #290 재계약 탐지)**

- #289 P11-B 스프린트 계약: `?distance=log|linear|uniform` — Distance Scale 모드 (충돌 없음)
- #290 P11-C 스프린트 계약: `?tier=a|b|c` — GPU tier 수동 override
- **충돌**: `?tier=` 는 사용자 정신 모델상 P12 Scale Tier 로 먼저 연상됨 (`solar` / `inner` / `body`). GPU tier 가 선점하면 Scale Tier URL 공유 불가

**3. 코드 심볼 검색 오인 (2026-04-24 실측)**

- `grep -rn 'tier' packages/ apps/` 결과 227건 — 절반은 Scale Tier, 1/3 은 Data Tier, 1/6 은 solar-system-loader 의 JSON 필드 `tier` (Data Tier 정수)
- 본 ADR 전 상태에서 LOD 를 `tier: 'high'|'mid'|'low'` 로 구현하면 `activeTier` / `DataTier` / `tier:LOD` 3 심볼 혼재 → Git blame / 전역 검색 drift 가속

### P11 재개 블로커 판정 근거

#289 / #290 DoD 에 `?tier=` / LOD tier 용어가 이미 고정된 상태로 구현 착수하면 사후 rename PR 이 최소 2개 필요하며, **주석 계약 vs 구현 drift** 패턴(CLAUDE.md 교훈) 의 교과서 재현. 본 ADR 박제 → #289 / #290 DoD 코멘트 재계약 순서로 차단.

### 기존 자산 재사용 조사 (CLAUDE.md "신규 함수 ≠ 신규 구현")

| 자산                                         | 위치                                            | 본 정책 처리                                                                              |
| -------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `Tier` type (값: 'solar' / 'inner' / 'body') | `packages/core/src/scene/tier.ts:40`            | **유지** — Scale Tier 전용 보존. rename 없음                                              |
| `activeTier` / `setTier` / `getTier`         | `packages/core/src/scene/solar-system-scene.ts` | **유지** — Scale Tier 전용 보존                                                           |
| `DataTier` type (값: 1 / 2 / 3 / 4)          | `packages/shared/src/types/tier.ts:16`          | **유지** — 이미 구분 명확. HUD UI 텍스트만 `T1~T4` 라벨 prefix 로 치환                    |
| `TierBadge` 컴포넌트                         | `apps/web/src/components/ui/tier-badge.tsx`     | **유지** — "T1~T4" 라벨 표시로 이미 Scale Tier 단어 회피. rename 선택적 (§§§결정 §2 참조) |
| `CSS 변수 --tier-{1..4}-*`                   | `apps/web/app/[locale]/globals.css:35-36`       | **유지** — 내부 토큰, UI 노출 없음                                                        |
| `detectIsMobile`                             | `apps/web/src/core/is-mobile.ts`                | **존속** (#290 에서 `detect-gpu-tier.ts` 로 승격. 본 ADR 은 용어만 확정)                  |
| URL 파라미터 `?fps=` / `?integrator=` 등     | `apps/web/src/components/sim-canvas.tsx` 외     | **영향 없음** — 기존 파라미터는 단어 충돌 무관                                            |

---

## 후보 비교

### 축 1: 코드 심볼 — Scale Tier 의 `Tier` / `activeTier` 유지 여부

| 축                  | 후보 A (권장)                                                                                | 후보 B                                                                     | 후보 C                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **정책**            | Scale Tier 가 `Tier` / `activeTier` 선점 유지. 다른 네임스페이스는 별 심볼                   | 모두 rename (`ScaleTier` / `activeScaleTier` / `LodLevel` / `GpuPerfTier`) | Scale Tier 도 rename (`RenderScaleTier`), 모든 네임스페이스 동격           |
| **rename 비용**     | 0 (Scale Tier 건드리지 않음)                                                                 | 높음 (scene/ 다수 파일 영향, Git blame drift)                              | 매우 높음 (scene/ 전면 rename, P12 구현 직후 재rename 은 사용자 합의 없음) |
| **선점 기준 근거**  | "첫 박제 자가 `Tier` 를 선점한다" — Scale Tier 가 구현 완료 + ADR 박제된 유일한 네임스페이스 | 공정성 최우선 — 모두 동격                                                  | 중립성 최우선 — 아무도 `Tier` 독점 금지                                    |
| **오인 위험**       | 낮음 — `Tier` / `activeTier` 가 "scene scale" 로 고정 판독됨                                 | 낮음 — 모든 심볼이 자기 문맥 명시                                          | 낮음 — 동일                                                                |
| **P12 코드 재작업** | 0 라인                                                                                       | scene/ 약 30 라인 수정                                                     | 동일                                                                       |

**선택: 후보 A** — "첫 박제 선점" 원칙. P12 ADR (`../deprecated/decisions/20260423-display-relative-scale-unification.md`) 이 이미 `Tier` 를 Scale Tier 전용으로 박제했고, rename 은 볼륨만 늘리고 의미 개선이 미미.

### 축 2: URL 파라미터 — `?tier=` 선점 정책

| 축                           | 후보 A (권장)                                                                                           | 후보 B                                                                                    | 후보 C                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **정책**                     | `?tier=solar\|inner\|body` 는 Scale Tier 전용. GPU tier 는 `?gpu=a\|b\|c`. LOD 는 `?lod=high\|mid\|low` | `?tier=` 는 네임스페이스 prefix 필수: `?tier=scale:body`, `?tier=gpu:a`, `?tier=lod:high` | `?tier=` 는 예약어 금지. 모두 네임스페이스별 전용 키 (`?scale=`, `?gpu=`, `?lod=`) |
| **사용자 정신 모델 일치**    | 높음 — `?tier=` 가 Scale Tier 직행                                                                      | 중간 — prefix 학습 필요                                                                   | 높음 — 의미 명확                                                                   |
| **URL 길이/공유성**          | 짧음 (`?tier=body`)                                                                                     | 길음 (`?tier=scale:body`)                                                                 | 짧음 (`?scale=body`)                                                               |
| **스프린트 재작업**          | #290 DoD 가 `?gpu=` 로 변경 (1줄)                                                                       | #290 DoD prefix 도입 (1줄) + 사용자 전체 재교육                                           | #290 `?gpu=` + P12 도 `?scale=` 로 변경 (미래 기능)                                |
| **Scale Tier URL 노출 시점** | P11 이후 (현 미구현, 정책 선박제)                                                                       | 동일                                                                                      | 동일                                                                               |
| **후방 호환**                | 영향 없음 (현재 `?tier=` 구현 안 됨)                                                                    | 동일                                                                                      | 동일                                                                               |

**선택: 후보 A** — Scale Tier 가 `Tier` 단어를 선점하는 것과 일관. GPU tier 는 기기 등급이라 도메인 네임이 `gpu` 인 것이 오히려 자연스러움.

### 축 3: HUD 범례 UI 텍스트 치환 전략

| 축                 | 후보 A (권장)                                         | 후보 B                                  | 후보 C                                            |
| ------------------ | ----------------------------------------------------- | --------------------------------------- | ------------------------------------------------- |
| **치환 방식**      | prefix 추가: `데이터 정확도 T1 관측`                  | 단어 교체: `T1 관측` (Tier 단어 제거)   | 컴포넌트 rename: `DataAccuracyBadge`              |
| **UI 변화**        | 약간 (텍스트 1줄 늘어남)                              | 없음 (라벨 그대로)                      | 없음 (내부 rename)                                |
| **오인 해소 강도** | 강함 — "데이터 정확도" prefix 로 Scale Tier 오인 차단 | 중간 — "Tier" 삭제만으론 의도 전달 약함 | 약함 — UI 텍스트는 그대로 `Tier 1 관측` 이면 무효 |
| **구현 비용**      | 낮음 (`hud-corners.tsx:113` 1줄)                      | 낮음 (동일)                             | 중간 (컴포넌트 rename + import 전환)              |
| **i18n 영향**      | 작음 (현 한글 하드코딩)                               | 작음                                    | 작음                                              |

**선택: 후보 A + 후보 B 조합** — `hud-corners.tsx:113` 는 "정확도 · T1 관측" 으로 치환 (후보 A prefix + 단어 "Tier" 제거). `TierBadge` 컴포넌트는 rename 없이 유지 (값이 `T1~T4` 라벨이라 내부에서만 `tier` 명칭 사용, 외부 노출 텍스트 아님).

### 축 4: LOD 심볼 명명

| 축                   | 후보 A (권장)                                         | 후보 B                 | 후보 C                                 |
| -------------------- | ----------------------------------------------------- | ---------------------- | -------------------------------------- |
| **타입**             | `type LodLevel = 'high' \| 'mid' \| 'low'`            | `type Lod = ...`       | `type DetailTier = ...`                |
| **변수/함수**        | `activeLodLevel` / `setLodLevel` / `lodFromDistance`  | `activeLod` / `setLod` | `activeDetailTier` / `setDetailTier`   |
| **"Tier" 단어 포함** | 없음                                                  | 없음                   | **있음** (Scale Tier 충돌 가능성 재발) |
| **업계 관용**        | 표준 ("LOD" = Level Of Detail, Three.js/Babylon 통용) | 약함                   | 약함                                   |
| **URL 파라미터**     | `?lod=high\|mid\|low`                                 | `?lod=...`             | `?detail=...`                          |

**선택: 후보 A** — `LodLevel` 은 업계 표준 용어 (Three.js `LOD` 객체, Babylon.js `Mesh.addLODLevel`). Scale Tier 와 시맨틱 겹침 0.

### 축 5: GPU tier 심볼 명명

| 축                       | 후보 A (권장)                                                      | 후보 B                | 후보 C                   |
| ------------------------ | ------------------------------------------------------------------ | --------------------- | ------------------------ |
| **타입**                 | `type GpuTier = 'a' \| 'b' \| 'c'`                                 | `type PerfTier = ...` | `type DeviceClass = ...` |
| **변수/함수**            | `detectedGpuTier` / `detectGpuTier` / `applyGpuTierPreset`         | `detectedPerfTier`    | `detectedDeviceClass`    |
| **모듈명**               | `detect-gpu-tier.ts` (#290 이미 제안)                              | `detect-perf-tier.ts` | `detect-device-class.ts` |
| **"Tier" 단어 포함**     | 있음 **(의도적)**                                                  | 있음                  | 없음                     |
| **GPU 도메인 명시**      | 강함 — 기기 성능 = GPU                                             | 약함                  | 약함                     |
| **Scale Tier 충돌 위험** | 낮음 — 항상 `gpu` prefix (`GpuTier` / `detectedGpuTier` / `?gpu=`) | 낮음                  | 없음                     |

**선택: 후보 A** — #290 에서 이미 `detect-gpu-tier.ts` 네이밍을 제안했고, `Gpu` prefix 가 항상 동반되므로 `Tier` 단어가 남아도 Scale Tier 와 혼동 없음. `?gpu=a|b|c` URL 파라미터와 대칭.

---

## 결정

### §1. 공식 용어 표 (4 네임스페이스 SSoT)

| 네임스페이스       | 타입       | 값 domain                      | 주 변수 / 함수                                                                         | 모듈 경로                                          | URL 파라미터               | UI 노출 텍스트                                                |
| ------------------ | ---------- | ------------------------------ | -------------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------- | ------------------------------------------------------------- |
| **P12 Scale Tier** | `Tier`     | `'solar' \| 'inner' \| 'body'` | `activeTier` / `setTier` / `getTier` / `tierFromCameraDistance` / `renderScaleForTier` | `packages/core/src/scene/tier.ts`                  | `?tier=solar\|inner\|body` | "관찰 모드" / "T1/T2/T3 스케일" 등. **`Tier` 단어 노출 허용** |
| **Data Tier**      | `DataTier` | `1 \| 2 \| 3 \| 4`             | `DataTier` (enum) / `<TierBadge tier={...}/>`                                          | `packages/shared/src/types/tier.ts`                | 없음 (UI 라벨 고정)        | "정확도 · T1 관측" 등. **prefix 필수**, `Tier` 단어 단독 금지 |
| **LOD level**      | `LodLevel` | `'high' \| 'mid' \| 'low'`     | `activeLodLevel` / `setLodLevel` / `lodFromDistance` / `lodFromScreenCoverage`         | `packages/core/src/render/lod.ts` (#289 신설)      | `?lod=high\|mid\|low`      | "디테일 · High" 등. `LOD` 약어 허용                           |
| **GPU tier**       | `GpuTier`  | `'a' \| 'b' \| 'c'`            | `detectedGpuTier` / `detectGpuTier` / `applyGpuTierPreset`                             | `apps/web/src/core/detect-gpu-tier.ts` (#290 승격) | `?gpu=a\|b\|c`             | "GPU tier-A/B/C" 등. **`gpu` prefix 필수**                    |

### §2. HUD 범례 용어 치환 (본 ADR 구현 의무)

- **대상 파일**: `apps/web/src/components/layout/hud-corners.tsx:113`
- **before**: `Tier 1 관측`
- **after**: `정확도 · T1 관측`
- **근거**: "정확도" prefix 로 Data Tier 문맥 확립 + `T1` 축약 라벨로 Scale Tier 의 `solar` / `inner` / `body` 와 시각 완전 분리. 우하단 위치는 유지.

### §3. URL 파라미터 정책 (향후 구현 가이드)

- **`?tier=`** → Scale Tier 전용. 값: `solar` / `inner` / `body`. 구현 시점: P12 후속 또는 별도 이슈 (현재 미구현)
- **`?gpu=`** → GPU tier 전용. 값: `a` / `b` / `c`. 구현 시점: #290 P11-C DoD
- **`?lod=`** → LOD level 전용. 값: `high` / `mid` / `low`. 구현 시점: #289 P11-B DoD (Distance Scale 의 `?distance=` 는 별개 유지)
- **`?mode=`** → 기존 scientific/educational 이중 모드는 P12 #298 에서 폐기됨 (ADR `../deprecated/decisions/20260423-display-relative-scale-unification.md` R1). 재도입 금지
- **`?distance=`** → Distance Scale 모드 (`log` / `linear` / `uniform`). #289 P11-B DoD. 본 ADR 정책과 독립 (Tier 도메인 아님)
- **충돌 방지 규칙**: 신규 URL 파라미터 도입 시 본 표의 예약어 (`tier`, `gpu`, `lod`, `mode`, `distance`) 재사용 금지. 이름 충돌 시 네임스페이스 prefix 사용 (`?xxx-tier=` 등)

### §4. 코드 심볼 규약

- Scale Tier 의 `Tier` / `activeTier` / `setTier` **선점 유지** — 관련 파일: `packages/core/src/scene/tier.ts`, `solar-system-scene.ts`, `tier-transition.ts`, `ring-placeholder.ts`, `ring-shader.ts`, `asteroid-belt.ts`, `camera-controller.ts`
- `Tier` 단어 단독 사용은 **Scale Tier 만 허용**. 다른 네임스페이스는 반드시 prefix 동반 (`DataTier`, `LodLevel`, `GpuTier`)
- JSON 스키마 필드명 `tier` (solar-system-loader `tier: z.number()`) 는 Data Tier 에 해당하며 코드 외 data-only 계약이므로 유지 허용 (rename 시 ephemeris JSON 전체 재작성 필요 → ROI 부정적)
- 테스트 파일명 규약: `tier.test.ts` 는 Scale Tier 전용 유지. LOD/GPU 는 `lod.test.ts` / `detect-gpu-tier.test.ts` 로 네이밍

### §5. Fact-First 원칙 일치 확인

- Data Tier 는 `docs/deprecated/principles/fact-first.md` "사실(fact)이 1차 SSoT" 에서 직접 유도된 개념. 본 ADR 은 Data Tier 의 **정의·역할** 을 변경하지 않고 **UI 표기** 만 치환 (원칙 무영향)
- Scale Tier 는 "절대 스케일 = 디스플레이 함수" 5원칙 #2 의 구현체. 본 ADR 은 Scale Tier 를 건드리지 않음
- 결론: 원칙 레벨 위반 0, ADR `../deprecated/decisions/20260423-display-relative-scale-unification.md` §Amendment 불요

---

## 영향 범위

### 본 ADR 박제 PR (ADR 파일만, 코드 수정 없음)

- 신규: `docs/decisions/20260424-tier-naming-policy.md` (본 파일)

### 후속 rename PR (Phase 분리 판정 §참조) — 본 ADR 과 별도

| 대상           | 파일                                                 | 변경 내용                          | 라인 수 |
| -------------- | ---------------------------------------------------- | ---------------------------------- | ------- |
| HUD 범례 치환  | `apps/web/src/components/layout/hud-corners.tsx:113` | `Tier 1 관측` → `정확도 · T1 관측` | 1       |
| #310 기대 치환 | (필요 시) `celestial-info-panel.tsx` 주변 표기 검토  | 확인 후 결정                       | 0~2     |

### Scale Tier 관련 파일 (변경 없음, 규약 선언 대상만)

`packages/core/src/scene/{tier.ts, tier-transition.ts, solar-system-scene.ts, ring-placeholder.ts, ring-shader.ts, asteroid-belt.ts, camera-controller.ts, index.ts}` + 테스트 7개 — 코드 수정 0 라인

### Data Tier 관련 파일 (변경 없음)

`packages/shared/src/types/tier.ts`, `apps/web/src/components/ui/tier-badge.tsx`, `celestial-info-panel.tsx` — 코드 수정 0 라인

### LOD / GPU tier 구현 시 (#289 / #290) 영향

- `packages/core/src/render/lod.ts` (신규, #289) — 약 150~200 라인
- `apps/web/src/core/detect-gpu-tier.ts` (신규 승격, #290) — 약 100~150 라인 (`is-mobile.ts` 을 import 재사용)

### 검색 기준 (grep 실측, 2026-04-24)

- `grep -rn 'activeTier\|setTier' packages/ apps/` → 13건 (모두 Scale Tier, 의도된 선점)
- `grep -rn 'Tier 1\|Tier 2\|Tier 3' apps/` → 1건 (`hud-corners.tsx:113`, 본 ADR 후속 PR 대상)
- `grep -rn 'tier\|Tier' packages/core/src/ apps/web/src/` → 227건 (분포: Scale Tier 60% / Data Tier 25% / JSON field 15%)

---

## Concrete Prediction (CLAUDE.md "신규 데이터 ≠ 신규 코드")

본 ADR 박제 후 #289 / #290 구현 시 아래 **예측** 을 재현해야 한다. 실패 시 **ADR Amendment 트리거** (추상화 부족 또는 예외 인정).

### Prediction 1: LOD 도입 → Scale Tier 코드 라인 변화 0

- **예측**: #289 P11-B 에서 `packages/core/src/render/lod.ts` (신규) + `sim-canvas.tsx` LOD 통합만으로 Distance-based mesh swap 이 동작해야 한다. `packages/core/src/scene/tier.ts` / `solar-system-scene.ts` / `tier-transition.ts` 의 **코드 라인 변화 0**.
- **재현 검증**: PR #289 머지 후 `git diff main..<PR-head> -- packages/core/src/scene/tier.ts packages/core/src/scene/solar-system-scene.ts packages/core/src/scene/tier-transition.ts | grep -E '^[+-][^+-]' | wc -l` → `0`
- **예측 실패 시**: Scale Tier 와 LOD 가 잘못 결합되었다는 신호. (a) LOD 입력이 `activeTier` 를 의존하면 정당할 수 있으나 `setTier` 호출 또는 `Tier` type 확장은 부당. ADR Amendment 박제 후 추상화 재조정

#### Amendment (2026-04-24) — `solar-system-scene.ts` 부분 예외 허용

본 Prediction 1 박제 직후 #289 P11-B 설계 단계(ADR `20260424-p11-b-lod-design.md`) 에서 `solar-system-scene.ts` **0 라인** 예측이 구조적으로 위배될 수 없음이 reviewer 지적으로 확인됐다. `createBodyMesh` 가 mesh 객체의 유일한 owner 이고 LOD 는 mesh 의 geometry variant 스왑이 필요하므로 외부 주입 없이 LOD 를 도입하려면 scene API 확장이 불가피하다.

P12 ADR `../deprecated/decisions/20260423-display-relative-scale-unification.md` §Amendments (2026-04-23 Q10 재평가 + QA 회귀 수정, line 379) 에서도 동일 파일에 `activeTier === 'body'` 분기 3지점을 추가하며 "코드 변경 0" 예측을 부분 수정한 선례가 있다.

**예외 허용 계약** (본 Amendment):

- `solar-system-scene.ts` 는 **LOD 분기 hook 추가 용도에 한해 예외 허용**
- **금지 조건** (예외 범위 밖, 계속 0 라인 유지):
  - `mesh.position` 좌표 수식 / `renderScaleForTier` 적용 지점
  - `Tier` 상수 / `activeTier` 의미 변경
  - `FloatingOrigin` 상호작용 (`fo.toLocal` / `fo.update` / `fo.reset`)
  - `setTier` 의 origin 갱신 로직
- **재현 검증 갱신** — Prediction 1 의 `wc -l → 0` 을 다음 2건으로 분할:
  - `tier.ts` + `tier-transition.ts` 변화 라인: `git diff <base>..<head> -- packages/core/src/scene/tier.ts packages/core/src/scene/tier-transition.ts --numstat | awk '{s+=$1+$2} END {print s+0}'` → **`0`** (유지)
  - `solar-system-scene.ts` 변화: **LOD hook 추가 용도만 허용**. 수기 diff 리뷰로 "금지 조건 위배 0" 확인 (자동 수치 검증 불가)
- **근거**: P11-B 설계 PR #320 리뷰 Blocking B-1 해소. 선례 P12 ADR §Amendments (2026-04-23)

### Prediction 2: GPU tier 도입 → Scale Tier 코드 라인 변화 0

- **예측**: #290 P11-C 에서 `apps/web/src/core/detect-gpu-tier.ts` (승격) + 자동 억제 조합 + 알림 키 치환 (`tier-c-graceful-degradation`) + URL sync 만으로 GPU tier 분기 동작. Scale Tier 파일 **코드 라인 변화 0**
- **재현 검증**: PR #290 머지 후 동일 grep 명령 → `0`
- **예측 실패 시**: GPU tier 프로파일이 Scale Tier 계산에 침투했다는 신호. 예: GPU tier-c 에서 Scale Tier `body` 강제 제외 같은 로직. ADR Amendment 박제

### Prediction 3: URL 파라미터 `?gpu=` / `?lod=` 도입 → `?tier=` 관련 코드 변화 0

- **예측**: #290 의 `?gpu=a|b|c`, #289 의 `?lod=high|mid|low` 도입이 Scale Tier 의 `?tier=` 구현 경로 (미구현이지만 향후 추가 예정) 와 코드 분리 유지
- **재현 검증**: #289 / #290 머지 후 `grep -rn "?tier=" apps/ packages/` 결과가 Scale Tier 용도만 포함 (또는 미구현 상태 유지)
- **예측 실패 시**: URL parser 가 `?tier=` 를 다른 의미로 파싱하는 로직이 침투. 파라미터 네임스페이스 분리 원칙 위배

**성공 시 수확**: 본 네이밍 정책이 "데이터로만 확장되는 계층" 임을 실증 (volt #47 패턴). 4 네임스페이스가 독립 modular 하며 미래 5번째 도메인 추가 시 동일 프로세스로 확장 가능.

---

## Phase 분리 릴리스 리듬 판정

CLAUDE.md "Phase 분리 릴리스 리듬" 3조건 적용.

### 판정: **단일 PR 로 통합** (분리 불가)

| 조건                                        | 충족   | 근거                                                                                                                                               |
| ------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| backward-compat (앞 Phase 만 배포돼도 정상) | ✗      | "ADR 박제만" 은 단독 관찰 단위가 아님. ADR 과 HUD 치환 1줄이 함께 가야 본 이슈 (#310) 의 완료 조건 "HUD 범례 용어 치환 + 사용자 confirm" 이 관찰됨 |
| 각 Phase 가 완결 Behavior Change 집합       | ✗      | ADR-only PR 은 행동 변화 없음 (문서). HUD-only PR 은 근거 문서 없이 선행 착수 불가                                                                 |
| 사용자 점진 릴리스 리듬 동의                | 미확인 | PM 재계약이 본 이슈를 "P11 재개 선행 블로커" 로 명시, 신속 해소가 우선                                                                             |

### 단일 PR 권장 구성

- **PR 내용**: ADR 파일 1개 + `hud-corners.tsx:113` 1줄 치환 + 본 이슈 completed checkbox 토글
- **검증**: ADR 파일 리뷰 + 브라우저 3단계 HUD 표시 확인
- **릴리스 분류**: **MINOR** (에이전트 행동 규약 추가 + UI 텍스트 변경 = CLAUDE.md §"릴리스" 에서 "행동 변화 vs 문서 변경" 판정 시 "행동 변화 = MINOR")
- **CHANGELOG Behavior Changes**:
  - HUD 우하단 범례 `Tier 1 관측` → `정확도 · T1 관측` (Data Tier UI 표기 명확화)
  - 네이밍 정책 ADR 박제로 #289 / #290 후속 구현 심볼 규약 확정

### 예외 (분리 고려 가능 케이스)

- 본 ADR + HUD 치환을 분리할 경우: (a) ADR PR (선행) → (b) HUD 치환 PR (후행) 순서로 5 영업일 이내 연속 머지만 허용. **5일 초과 시 drift 위험** (CLAUDE.md "주석 계약 vs 구현 drift" 재현) → 단일 PR 권장을 유지
- P11 재개 DoD 변경 (#289 `?distance=` 유지 / #290 `?tier=` → `?gpu=`) 은 **본 ADR 머지 후 이슈 코멘트 재계약** 으로 처리. 스프린트 계약 재조정이라 본 PR 범위 외

---

## 리스크

| 리스크                                                                                       | 영향 | 완화                                                                                                                                              |
| -------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TierBadge` 컴포넌트 rename 누락 인식                                                        | 낮음 | 본 ADR §축 3 에서 rename 불필요 명시 (내부 `tier` 명칭은 외부 UI 텍스트 아님). 축별 후보 비교 박제로 미래 질문 차단                               |
| 원본 이슈 DoD "의도치 않은 충돌 0" 해석 차이                                                 | 중간 | grep 기준 명시 (§영향 범위). "Scale Tier 선점된 `activeTier` / `setTier` / `Tier` type 은 기대된 사용" — 충돌 0 의 의미는 의도된 선점 외 용례 0   |
| 본 ADR 머지 전 #289 / #290 DoD 가 이미 확정된 상태                                           | 중간 | PM 재계약 시 본 ADR 링크 첨부 + #289 는 `?distance=` 유지 (문제 없음), #290 은 `?tier=` → `?gpu=` 변경 재계약 (architect 인계인 후속 작업)        |
| JSON 필드 `tier` (solar-system-loader) 가 Data Tier 이지만 심볼 rename 하지 않음 — 미래 혼동 | 낮음 | §축 규약 §3 JSON 스키마 예외 명시. 필드명 rename 시 ephemeris data 전체 재작성 비용 → ROI 부정적. 해당 파일 상단에 주석 계약 추가 권장            |
| Git blame drift (파일 이동 / 변수 rename 로 저자 추적 손실)                                  | 0    | 본 ADR 은 rename 0. HUD 1줄 변경만 blame 이동                                                                                                     |
| 외부 문서 / 블로그 링크 깨짐                                                                 | 0    | 심볼 rename 0. URL 파라미터는 모두 향후 구현                                                                                                      |
| Scale Tier "선점" 규칙을 미래 에이전트가 잊어버림                                            | 중간 | 본 ADR §§§결정 §1 표 + §4 코드 규약으로 명문화. `packages/core/src/scene/tier.ts` 상단 주석에 "Scale Tier 선점" 1줄 추가 (본 PR 범위 고려 — 선택) |

---

## 결과·재검토 조건

### 재검토 트리거 3가지

1. **Concrete Prediction 실패** — §Prediction 1~3 중 하나라도 #289 / #290 구현 PR 에서 `git diff` 가 Scale Tier 파일에 예상외 변경을 요구할 때. ADR Amendment 로 예외 인정 또는 재설계 판정
2. **5번째 Tier 네임스페이스 등장** — 예: 애니메이션 LOD, 모바일 GPU 세분화, 새 데이터 분류. 4 네임스페이스 표 확장 + URL 파라미터 예약어 추가
3. **사용자 UX 테스트에서 "정확도 · T1 관측" prefix 도 오인 유발 확인** — HUD 치환이 충분하지 않다고 실증되면 `TierBadge` → `DataAccuracyBadge` 컴포넌트 rename 검토 (축 3 후보 C 재부상)

### 관찰 지표

- 본 ADR 머지 후 30일 내 Tier 관련 "무엇이 어느 네임스페이스" 질문 건수 (target: 0)
- #289 / #290 구현 PR 에서 Prediction 1~3 재현 성공률 (target: 3/3)

---

## Developer 인수인계 요약

### 시작 지점

1. `apps/web/src/components/layout/hud-corners.tsx:113` — `Tier 1 관측` → `정확도 · T1 관측` 치환 (1줄)
2. 본 ADR 링크를 `hud-corners.tsx:104` 주석 `우하 — Tier 범례 (D8에서 동적화)` 아래 추가 검토 (선택) — Data Tier 범례임을 명시

### 재사용 자산 (CLAUDE.md "신규 함수 ≠ 신규 구현")

- `DataTier` type: `packages/shared/src/types/tier.ts` — 이미 존재, 재사용
- `TierBadge` 컴포넌트: `apps/web/src/components/ui/tier-badge.tsx` — 이미 존재 (celestial-info-panel 등에서 사용 중)
- `detectIsMobile`: `apps/web/src/core/is-mobile.ts` — #290 구현 시 `detect-gpu-tier.ts` 로 승격 (본 ADR 은 용어만 확정)
- Scale Tier API (`Tier` / `activeTier` / `renderScaleForTier`): 이미 #298 에서 완성, 본 ADR 은 건드리지 않음

### 주의사항

- **코드 직접 수정은 developer 단계에서** — 본 ADR PR 은 ADR 파일 + HUD 1줄 치환만 (architect 는 박제만 수행)
- **#289 / #290 DoD 재계약** 은 본 ADR 머지 후 **PM 에게 인계**. architect 범위 외 (스프린트 계약 재작성은 PM 책임)
- **브라우저 3단계 검증 의무** — HUD 텍스트 변경은 CRITICAL #3 UI 검증 3단계 (정적 → 인터랙션 → 흐름) 대상. 최소 정적 확인 + 우하단 범례 표시 + 기존 Scale Tier 전환 (지구 focus 등) 시 범례 유지 관찰
- **한글 인코딩 검증** — CRITICAL #4. U+FFFD replacement character 부재 확인 (`grep -nP '\x{FFFD}' <file>`) 실행 필수

### 비-범위 (scope creep 금지)

- LOD 구현 자체 (→ #289)
- GPU tier 감지 로직 (→ #290)
- Scale Tier 전환 알고리즘 변경
- `TierBadge` 컴포넌트 rename (§축 3 에서 기각)
- JSON 필드 `tier` rename (§결정 §4 에서 기각)

---

## 부록 A: 교차검증 반영 사항

- **호출 전 Claude 편향 셀프 체크 (CLAUDE.md 4종 체크리스트)**:
  - 낙관적 일정: 본 ADR + HUD 1줄 치환은 반일 작업 — 낙관 편향 없음
  - 결합 간과: §Concrete Prediction 3개로 4 네임스페이스 결합도를 실측 의무화 — 완화 박제됨
  - 폐기 프레이밍: 본 ADR 은 기존 심볼 폐기 없음 (rename 0)
  - 순수주의: 축 3 에서 `TierBadge` rename 을 ROI 로 기각, 축 4 JSON 필드 rename 도 기각 — 완화 적용
- **교차검증 실행**: 2026-04-24 gemini-2.5-pro, outcome=applied (exit 0). 로그: `.claude/logs/cross-validate-architecture-20260424-134439.log`

### 합의

Gemini 는 본 ADR 의 다음 판정에 명시적으로 동의:

- **'첫 박제 선점' 원칙** (축 1 후보 A) — "이미 구현된 코드의 변경 비용(ROI 부정적)을 최소화하는 현실적이고 현명한 선택"
- **URL 파라미터 선점 정책** (축 2 후보 A, §3) — "`?tier=`를 가장 직관적인 Scale Tier에 할당하고 나머지는 `?gpu=`, `?lod=` 처럼 명시적인 이름을 부여한 것은 사용자 정신 모델과 일치"
- **HUD 텍스트 치환** (축 3 후보 A+B) — "UI 오인을 '정확도 · T1 관측'이라는 명확한 표현으로 수정하여 직접적으로 해결"
- **LOD/GPU 네이밍 규약** (축 4/5) — "`LodLevel` 은 업계 표준을 따르고, `GpuTier` 는 `Gpu` 접두사를 통해 혼동을 방지"
- **Concrete Prediction 3건** — "아키텍처 결정의 유효성을 지속적으로 증명하려는 높은 수준의 엔지니어링 문화", "모듈 간의 결합도가 낮게 유지되도록 강제하는 훌륭한 장치"
- **SSoT 표 (§결정 §1)** — "향후 혼동을 원천적으로 차단하는 가장 효과적인 장치"
- **5번째 네임스페이스 등장 시 재검토 트리거** — 확장성 판정 "높음"

**축 1~5 5개 축 모두 Claude 원안 유지** — Gemini 가 후보 B/C 재조사 요청 5건 전체에 이견 없음.

### 이견 수용

없음. Gemini 피드백 중 Claude 원안을 수정해야 할 항목 부재.

### Claude 재분석으로 기각한 Gemini 제안

없음. Gemini 가 개선 제안 3건 (i18n / Linter / URL 입력 검증) 을 제시했으나 모두 기각이 아닌 **후속 분리** 판정 (아래 §고유 발견 참조). 제안 자체는 타당.

### 고유 발견 (후속 분리)

Gemini 가 **현재 스프린트 계약의 비목표** 와 직교하는 3건의 장기 인프라 제안 제기. 본 ADR / PR 범위 외 (CRITICAL #6 준수):

1. **i18n 문자열 분리 규약** — "`정확도 · T1 관측` 같은 UI 문자열을 별도 `messages`/`locales` 파일로 분리하는 규칙화". 현재 프로젝트는 한글 하드코딩 전면 사용, i18n 도입 자체가 별도 결정 사항. **분리 대상** — 후속 이슈 후보 (우선순위: low, `type:infra`, 다국어 지원 결정 후 착수)
2. **ESLint 커스텀 규칙으로 네이밍 정책 강제** — "`packages/core/src/scene/tier.ts` 외 파일에서 접두사 없는 `Tier` 타입 선언 시 경고". 아키텍처 결정을 코드로 강제하는 강력한 방법이지만 본 ADR 의 "선언적 규약" 범위 외. **분리 대상** — 후속 이슈 후보 (우선순위: medium, 네이밍 drift 재발 관찰 시 착수)
3. **URL 파라미터 값 검증 구현 가이드** — "SSoT 표에 정의된 값 (`a|b|c`, `high|mid|low`) 만 허용" 코드 가드. 본 ADR 은 **정책** 박제, 실제 검증 구현은 #289/#290 구현 범위. **분리 대상** — #289/#290 DoD 에 "URL 파라미터 값 검증 (invalid 시 기본값 fallback)" 완료 기준 추가를 PM 재계약 시 반영 권고 (본 PR 범위 외)

위 3건은 본 PR 머지 후 **PM 에게 인계**. 본 ADR 은 네이밍 정책 박제가 일차 목표이며, 제안 3건은 정책 "실행 보조 장치" 로 독립 릴리스 가능.

## 부록 B: cross-validate 결과 요약

- **실행**: 2026-04-24T04:44:39Z ~ 04:45:31Z (52초), gemini-2.5-pro, `--approval-mode plan`
- **판정**: **조건부 통과 없음 — 원안 전체 승인**. Gemini 6개 축 평가 결과:

  | 항목              | 평가        |
  | ----------------- | ----------- |
  | 구조적 완성도     | 매우 뛰어남 |
  | 기술 결정 타당성  | 매우 타당함 |
  | 인터페이스 명확성 | 매우 뛰어남 |
  | 확장성            | 높음        |
  | 보안              | 문제 없음   |
  | 누락 요소         | 거의 없음   |

- **outcome**: applied (exit 0)
- **reminder_issue**: 해당 없음 (429 fallback 미발동)

---

**박제 완료.** 본 ADR 은 #310 P11 재개 선행 블로커 해소의 규약 부분을 구성하며, HUD 1줄 치환 및 #289 / #290 DoD 재계약은 별도 PR / PM 라운드에서 진행한다.
