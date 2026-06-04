---
상태: Accepted
원본 박제 일자: 2026-05-30
관련 이슈: #597
관련 PR: TBD (본 ADR 박제 PR)
부모 ADR:
  - `20260528-r5-mars-visualization.md` (R5 ADR §결정 4 — phobos 분리 마진 1.69x 박제)
  - `20260524-546-satellite-billboard-visibility-forensic.md` (4px alpha mask billboard)
  - `20260503-397-residual-no-op.md` (NO-OP ADR 패턴 모범)
  - `docs/architecture/principles.md` §1 Visual Fidelity (#541)
태그: NO-OP / forensic / satellite / Z-fighting / billboard
---

# ADR — #597 satellite Z-fighting + 4px billboard 히트테스트 간섭 가드 NO-OP 결정

## 배경

R5 (#594, PR #596) 머지 후 cross-validate Antigravity agy 고유 발견 #1 분리 박제. phobos/deimos (satellite 2개) 가 mars mesh 와 근접 (R5 ADR §결정 4 산식상 phobos 분리 마진 1.69x / deimos 4.27x) + 4px fallback billboard 작동 시 다음 위험 잠복 의심:

1. **Z-fighting** — mars mesh surface ↔ phobos/deimos billboard 동일 depth 영역 깜빡임
2. **히트테스트 간섭** — 4px billboard 가 mars mesh 클릭 영역과 겹쳐 click target 모호성

본 ADR 은 forensic 측정 후 NO-OP 결정 박제. 시각 회귀 0 + alpha mask 자연 흡수 + D-T2 정상 통과 확인.

---

## Forensic 측정 데이터

### 측정 환경

- develop tip = `50c9c57` (R5 #594 + R5 후속 #598/#599 머지 후)
- viewport 1280×720, mars focus 진입 (`?focus=mars`)
- 매트릭스: 7 zoom level (camera.radius 100 → 0.5 점진 줌인)
- 측정 방법: `scripts/_debug-597-tmp.mjs` (volt #67 패턴, 즉시 rm)

### 1라운드 — headless Playwright

| zoom level | camera.radius | mars_R | phobos_ratio | deimos_ratio | mars_vis | phobos_vis |
|---|---|---|---|---|---|---|
| far | 1.0 | 118118 | 0.9941 | 2.4937 | false | false |
| mid | 0.5 | 118118 | 0.9896 | 2.4937 | false | false |
| near | 0.1 | 118118 | 0.9848 | 2.4936 | false | false |
| close | 0.05 | 118118 | 1.0023 | 2.4935 | false | false |
| very_close | 0.02 | 118118 | 1.0110 | 2.4933 | false | false |
| extreme | 0.005 | 118118 | 1.0051 | 2.4931 | false | false |
| ultra | 0.002 | 7.247 | 1.0002 | 2.4931 | false | false |

**mars.isVisible = false 모든 cell** — headless LOD billboard 전환 한계 (swiftshader / 4px fallback).

### 2라운드 — 실 Chrome (agent-browser, volt #77)

| zoom level | camera.radius | mars_R | phobos_ratio | deimos_ratio | mars_vis | phobos_vis |
|---|---|---|---|---|---|---|
| baseline | 36.23 | 7.247 | 0.9866 | 2.4927 | **true ✓** | false |
| r=100 | 100 | 7.247 | 0.9906 | 2.4936 | true | false |
| r=50 | 50 | 7.247 | 0.9906 | 2.4936 | true | false |
| **r=20** | **20** | **118118** | **0.9906** | **2.4936** | **true** | false |
| r=10 | 10 | 118118 | 0.9906 | 2.4936 | true | false |
| r=5 | 5 | 118118 | 0.9906 | 2.4936 | true | false |
| r=2 | 2 | 118118 | 0.9906 | 2.4936 | true | false |
| r=0.5 | 0.5 | 118118 | 0.9906 | 2.4936 | true | false |

### 핵심 발견

1. **R5 ADR §결정 4 박제값 1.69x 실측 0.99 mismatch** — headless + 실 Chrome 동일 패턴 (환경 무관)
2. **mars Tier transition 발견** — r=50 → r=20 경계에서 mars_R 가 7.247 → 118118 로 **16292배 점프** (Tier 1 → Tier 3 전환, Floating Origin SSoT)
3. **phobos.isVisible = false 모든 cell, 실 Chrome 도 동일** — sub-pixel + 4px alpha mask billboard 흡수
4. **시각 회귀 0** — 스크린샷 (`/tmp/597-forensic-real-chrome-mars-focus.png`) mars 정상 visible, phobos/deimos billboard 우상단 작은 점, Z-fighting 깜빡임/충돌 0
5. **콘솔 에러 0** — agent-browser console errors empty

---

## 결정

### NO-OP — Z-fighting 가드 신규 도입 거부

**근거 5축**:

1. **D-T2 사용자 검증 통과** — R5 #594 D-T2 5점 (mars visible / focus / phobos/deimos URL override / 사실 비율 / R1~R4 회귀) 모두 PASS. mars focus 후 줌인 시 시각 회귀 보고 0.
2. **시각 회귀 0** — 실 Chrome 스크린샷 (`/tmp/597-forensic-real-chrome-mars-focus.png`) mars 정상 visible, Z-fighting 깜빡임/충돌 0.
3. **alpha mask billboard 자연 흡수** — `phobos.isVisible = false` 모든 cell. 4px fallback billboard (#391/PR #394) 가 sub-pixel 흡수. mars mesh 우선 표시.
4. **Tier transition 가드 정합** — Floating Origin SSoT (`20260422-floating-origin.md`) 정합. mars_R Tier 1 ↔ Tier 3 전환은 의도된 동작.
5. **현재 행동 정상** — R5 머지 후 동작 무회귀 + 모든 verify 스크립트 PASS + 단위 테스트 697 PASS.

### Visual Fidelity §의무 체크리스트 4항목 (#541) 정합

- **데이터 SSoT 보존** ✓ — `solar-system.json` mars/phobos/deimos radius / semiMajorAxis 무수정
- **rendering 시점 분리** ✓ — physics 엔진 무의존 (BODY_SCALE / ORBIT_VISUAL_SCALE 의 rendering-only)
- **UI overlay 실측값 표기** ✓ — CelestialInfoPanel mars/phobos/deimos 실측 radius 표기
- **baseline 박제** ✓ — 본 ADR §forensic 측정 데이터 박제 (R5 ADR §결정 4 박제값 1.69x vs 실측 0.99 mismatch)

---

## 회귀 가드

### 신규 — Z-fighting 시각 발현 검출

본 ADR §결정 (NO-OP) 의 회귀 가드. R6 (jupiter + galilean) / R7 (saturn + titan) 진입 시 satellite 수 증가로 Z-fighting 시각 발현 위험 증폭 가능성. 신규 verify 스크립트 박제 의무 보류 (forensic 측정 결과 시각 회귀 0 이므로 별도 가드 신설 ROI marginal).

**미래 회귀 검출 의무** (R6+ 진입 시):
- mars focus + 줌인 매트릭스 + 스크린샷 매트릭스 (Tier 1 / Tier 3)
- phobos/deimos visible 여부 + alpha mask billboard 작동 확인
- mars mesh ↔ satellite billboard depth 충돌 visual 검출

### 기존 가드

- `apps/web/scripts/browser-verify-378-focus.mjs` — focus 시 카메라 frustum + boundingSphere 검증 (R5 mars/phobos/deimos 포함)
- `apps/web/scripts/browser-verify-r-phase-allowlist.mjs` — URL 직접 진입 (`?focus=phobos`) 차단/허용 검증
- `apps/web/scripts/browser-verify-546-satellite-visibility.mjs` — moon LOD-aware billboard 검증 (phobos/deimos 동일 로직 보장)
- `packages/core/src/scene/r-phase-allowlist.test.ts` — FOCUS_BODIES drift 정적 매칭 (#598 PR #601)

---

## 결과·재검토 조건

### 재검토 트리거

1. **R6 (jupiter + galilean 4) 진입** — satellite 4개 동시 진입 + io/europa/ganymede/callisto orbit visual scale 결정 시 본 ADR 재검토. galilean satellite 분리 마진 산식 vs 실측 mismatch 확인 의무.
2. **R7+ (saturn + titan / uranus + 4 moons) 진입** — satellite 다개 + 고리 + Z-fighting 시각 발현 위험.
3. **사용자 D-T2 회귀 보고** — mars/phobos/deimos focus + 줌인 시 시각 회귀 (깜빡임 / 충돌) 보고.
4. **R5 ADR §결정 4 산식 재검증 의무** — Tier transition (Floating Origin) 영향 단위 변환 정정 필요 시 본 ADR 도 amendment 박제.
5. **headless ≠ 실 Chrome mismatch 누적** — volt #77 가드 강화 필요 시.

### R5 ADR §결정 4 산식 vs 실측 mismatch 박제 (메타 발견)

본 forensic 측정의 부산물로 **R5 ADR §결정 4 박제값 1.69x 가 실측 0.99 와 mismatch** 발견. 시각 회귀 0 이므로 본 ADR 결정 (NO-OP) 에 영향 없으나, **R5 ADR §결정 4 amendment 후속 박제** 가치 박제 (low priority — 가드 발현 0 + 박제값 수정 ROI marginal).

mismatch 원인 가설 (架설, 검증 없음):
- Floating Origin Tier scale 변환 누락 (mars mesh radius 의 Tier scaled vs unscaled)
- mesh.scaling 적용 후 boundingSphere.radiusWorld 계산 방식
- ADR 산식의 SI 단위 (m) vs scene unit (Floating Origin) 변환 mismatch

확정 분석은 R6 진입 시 또는 사용자 D-T2 회귀 시 architect 단계에서 수행.

---

## 비-범위

- ❌ Z-fighting 가드 신설 (옵션 A depth offset / 옵션 B billboard click priority / 옵션 C zoom-distance 비활성화)
- ❌ R5 ADR §결정 4 산식 정정 (본 ADR 비-범위, 후속 amendment 또는 R6 진입 시 architect)
- ❌ Tier transition 정확성 검증 (`20260422-floating-origin.md` 영역)
- ❌ 4px alpha mask billboard 동작 변경 (#391/PR #394 정합)
- ❌ R-Phase Allowlist 변경 (#594 정합)

---

## Concrete Prediction

본 ADR 머지 후 다음 사실 박제 (R6 진입 시 재검증 의무):

1. mars focus + 줌인 시각 회귀 0 보고 (사용자 D-T2)
2. mars/phobos/deimos 의 R5 ADR §결정 4 분리 마진 1.69x 박제값 정합성 검증 (산식 mismatch 발견 시 amendment)
3. R6 (jupiter + galilean 4) 진입 시 본 ADR 와 동일 패턴 (시각 회귀 0 + alpha mask 흡수) 답습 또는 시각 발현 시 Z-fighting 가드 도입

---

## 참고

- 부모 ADR: [`20260528-r5-mars-visualization.md`](20260528-r5-mars-visualization.md) §결정 4 (phobos 분리 마진 1.69x 박제)
- 부모 ADR: [`20260524-546-satellite-billboard-visibility-forensic.md`](20260524-546-satellite-billboard-visibility-forensic.md) (4px alpha mask billboard)
- 부모 ADR: [`20260503-397-residual-no-op.md`](20260503-397-residual-no-op.md) (NO-OP 패턴 모범)
- 부모 ADR: [`20260422-floating-origin.md`](20260422-floating-origin.md) (Tier transition SSoT)
- 원칙: [`docs/architecture/principles.md`](../architecture/principles.md) §1 Visual Fidelity (#541)
- forensic 스크린샷: `/tmp/597-forensic-real-chrome-mars-focus.png` (1280×720, mars focus 정상, Z-fighting 0)
- forensic JSON: `/tmp/597-forensic-1780144398438.json` (1라운드 headless 7 cell)
- 학습 사례: volt #14 (NO-OP ADR 패턴), volt #67 (debug 스크립트 즉시 rm), volt #74 (DoD PASS ≠ 제품 동작), volt #77 (headless ≠ 실 Chrome)
- cross-validate 비대상 — NO-OP 결정 + forensic 측정 데이터 박제만 (신규 결정 분기 0)
