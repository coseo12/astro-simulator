# ADR 20260512 — AU 슬라이더 의미 정의 (DoD-2 / DoD-4)

> **Status**: Proposed (2026-05-12 박제, architect 단계)
> **이슈**: [#400](https://github.com/coseo12/astro-simulator/issues/400) — 우측 AU 슬라이더 (ScaleControl)
> **관련**: PR #399 (발화점 D-T2 2026-05-03) · ADR `20260424-tier-naming-policy.md` (tier renderScale SSoT) · ADR `20260424-p11-b-lod-design.md` (LOD/tier 설계) · ADR `20260422-floating-origin.md` · ADR `20260429-r3-venus-visualization.md` §재검토 트리거 #3 (R4 viewport-aware scaling 박제 의무)
> **Supersedes**: 없음 (신규 박제)
> **선결 가드**: #412 R-Phase 진입 체크리스트 / #403 R-Phase UI 가드 ADR Amendment 2026-05-11 (본 ADR 결정 시 UI 가드 직교 검증 필수)
> **교차검증**: Gemini 2.5 Pro (cross-validate 스킬, 본 ADR 박제 직후 1회 — CLAUDE.md "정책·설계·ADR 박제 직후 1회 루틴")

---

## 배경

`ScaleControl` 컴포넌트 (`apps/web/src/components/layout/scale-control.tsx`) 우측 중앙 수직 슬라이더는 다음을 수행한다:

```ts
const handleChange = (v: number[]) => {
  // v[0] 은 log10(scene unit) — `radius` = 10^v[0]
  sendCommand({ type: 'setCameraRadius', radius: Math.pow(10, logV) });
};
const displayAU = Math.pow(10, value);  // 라벨에 "AU" 단위로 표시
```

라벨은 `displayAU < 1 ? '... mAU' : '... AU'` 형식. 그러나 `radius` 의 단위는 **AU 가 아니라 Babylon scene unit** 이며, scene unit 의 실제 m → AU 변환은 **현재 tier 의 `renderScaleForTier(tier)` 역수**에 의존한다 (sim-canvas.tsx:380, 453 / `packages/core/src/scene/tier.ts` SSoT):

| Tier | renderScale | 1 scene unit ≈ m | 1 scene unit ≈ AU |
| ---- | ----------- | ---------------- | ----------------- |
| T1 solar | 8.4e-11 | 1.19e10 m | **0.0795 AU** |
| T2 inner | 1.54e-9 | 6.50e8 m | **4.35e-3 AU** (≈ 0.0043 AU) |
| T3 body | 2.51e-5 | 3.98e4 m | **2.66e-7 AU** (≈ 39.8 km) |

즉 슬라이더 라벨 "1 AU" 가 실제로는:
- T1 solar 진입 상태 → 약 **0.0795 AU** (≈ 1.19e10 m, 해왕성 평균 궤도 30.1 AU 의 ~1/378)
- T2 inner 진입 상태 → 약 **0.0043 AU** (≈ 643,000 km, 달 거리의 ~1.7배)
- T3 body 진입 상태 → 약 **2.66e-7 AU** (≈ 39.8 km)

**최대 ~30만배의 의미 drift** (T1 0.0795 AU ÷ T3 2.66e-7 AU ≈ 298,872). 본 ADR 박제 이전의 라벨은 사실상 가짜 (volt #74 "DoD PASS ≠ 제품 동작" 패턴 — 슬라이더는 측정적으론 "AU 단위 표시" 인데 실 의미는 가짜).

추가로 focus 모드 (sun / mercury / venus R-Phase Allowlist `[sun, mercury, venus]`) 진입 시 `controller.focusOn({ mesh })` 가 `camera.target` 을 focus body 로 이동시키므로 ArcRotateCamera 의 `radius` 의미는 "**카메라-focus body** 거리 (scene unit)" 로 바뀐다. free-fly 일 때만 "카메라-원점 (태양)" 거리. 슬라이더 라벨이 이 변화를 반영하지 않으면 focus 진입 즉시 라벨 사실성 추가 붕괴.

본 ADR 은 다음 3 결정을 단일 SSoT 로 박제한다 (3 결정 결합도가 높아 분리 ADR 시 drift 위험):

- **결정 A**: AU 라벨 환산 공식 (tier × focus 모드 매트릭스)
- **결정 B**: focus 모드 진입 시 슬라이더 동작
- **결정 C**: R4 viewport-aware scaling 진입 시 본 ADR 의 재평가 / Amendment 조건

본 ADR 은 **설계만**. 구현은 후속 developer 단계 (이슈 #400 DoD-1/2/3/4/5/6 통합 PR).

---

## 후보 비교

### 결정 A — AU 라벨 환산 공식

| 축 | 후보 A1 (현행 유지 — scene unit ≡ AU) | 후보 A2 (단일 환산 — tier 무시, 고정 m/unit 가정) | 후보 A3 (**tier-aware 환산** — 현 tier × focus 모드 분기) | 후보 A4 (AU 외 단위로 전환 — scene unit 그대로 표시) |
| --- | --- | --- | --- | --- |
| 라벨 사실성 | × (최대 3억배 drift) | × (T1↔T3 사이 ~1e6배 drift 잔존) | **○ (실측 ± 5% 일치)** | △ (사실 정확하나 사용자 직관 ↓) |
| 구현 복잡도 | (현행) | 낮음 (1 상수 추가) | **중간 (tier subscribe + focus 거리 lookup)** | 낮음 |
| 사용자 직관 (AU = 천문단위 보편) | × (보편 단위 표기 자체가 거짓) | × (동일) | **○ (라벨 = 표기 = 보편 단위)** | × ("scene unit" 표기는 천문 사용자에 무의미) |
| R-Phase 가드 직교성 | (현행) | (영향 없음) | **○ (R_PHASE_BODY_ALLOWLIST 직교, focus body 만 사용)** | (영향 없음) |
| R4 viewport-aware 결합 위험 | × (R4 에서 모두 재작성) | × (R4 에서 식 변경 시 단일 상수 폐기) | **△ (R4 진입 시 환산 식이 viewport scale 추가 반영 필요 — Amendment 박제)** | ○ (R4 영향 없음, 표시 단위 무관) |
| 사용자 인지 비용 | 0 (현행) | 0 | **낮음 (라벨 텍스트 변화 없음, 값만 정확화)** | 큼 (라벨 텍스트 자체 변경) |
| volt #74 패턴 해소 | × (가짜 AU 라벨 유지) | × (tier 무시 → 부분 해소) | **○ (실 천체간 거리 일치)** | △ (사실성은 해소, "AU" 자체 폐기로 회피) |

**A1 (현행)**: 슬라이더 unit ↔ AU 1:1 가정 유지. 최대 3억배 drift. volt #74 미해소. **탈락**.

**A2 (단일 환산)**: tier 와 무관하게 고정 `m/unit` 상수 (예: T1 기준 8.4e-11 역수) 만 적용. T1 solar 에서는 정확하나 T3 body 에서 여전히 1e6배 drift. **탈락**.

**A3 (tier-aware 환산)**: 현재 tier 의 `renderScaleForTier(tier)` 역수로 m 계산 + focus 모드일 때는 카메라-focus body 거리 (m → AU), free-fly 일 때는 카메라-원점 거리. **채택 후보**.

**A4 (AU 외 단위)**: "scene unit" 또는 "log10 unit" 으로 라벨 변경. 사실성은 해소되나 천문 사용자 보편 단위 (AU) 자체를 폐기하는 비용 큼. **탈락**.

**결정**: **A3 채택**.

### 결정 B — focus 모드 진입 시 슬라이더 동작

| 축 | 후보 B1 (현행 — 단방향 + 라벨 그대로) | 후보 B2 (focus 진입 시 disable + 시각 큐) | 후보 B3 (focus 진입 시 hide) | 후보 B4 (**focus 진입 시 의미 재정의 + 양방향 sync** — 라벨이 "카메라-focus body 거리 AU" 로 자동 전환) |
| --- | --- | --- | --- | --- |
| 사용자가 슬라이더로 focus 거리 조절 가능 | △ (조절은 되나 라벨 ≠ 실 의미) | × (조절 불가) | × (UI 부재) | **○ (조절 + 라벨 사실성 일치)** |
| 라벨 의미의 일관성 | × | ○ (조절 불가하므로 라벨 의미 정의 회피) | ○ (slider 자체 부재) | **○ (focus 모드에서 명시적 "카메라-focus body 거리")** |
| 구현 비용 | 0 (현행) | 낮음 (focus state subscribe + disabled prop) | 낮음 (조건부 unmount) | **중간 (focus state subscribe + 라벨 분기 + 카메라 양방향 sync)** |
| focus body 클릭 후 줌인 / 줌아웃 UX | × (라벨 거짓) | × (불가능) | × (불가능) | **○ (사용자 직관 — focus 상태에서 거리 조절)** |
| R-Phase 가드 직교성 | (현행) | ○ | ○ | **○ (focus body 가 R_PHASE_BODY_ALLOWLIST 에 있으므로 직교)** |
| 사용자 학습 비용 | 0 (현행) | 낮음 (disable 큐) | 낮음 (사라짐) | **낮음 (라벨이 자동 전환되어 사용자가 인지)** |
| 결정 A 와의 정합 | × | △ (조절 불가하므로 A 효과 부분) | △ (slider 자체 없음) | **○ (A 의 환산 식 + 양방향 sync 가 완전한 사실성 보장)** |

**B1 (현행)**: focus 진입 시 슬라이더 라벨이 거짓 (radius 의미가 카메라-focus body 거리로 바뀌었는데 라벨은 그대로). **탈락**.

**B2 (disable + 시각 큐)**: focus 진입 시 슬라이더 회색 + 비활성. 라벨 의미 정의 회피 가능하나 사용자가 focus 상태에서 거리 조절 못 함. focus → 줌인 UX 손실. **탈락**.

**B3 (hide)**: focus 진입 시 슬라이더 자체 제거. UI 흐름 변화 큼. **탈락**.

**B4 (의미 재정의 + 양방향 sync)**: focus 진입 시 라벨이 "카메라-focus body 거리 AU" 로 자동 전환 (결정 A 의 tier 분기 + focus 모드 분기). 양방향 sync 로 슬라이더 ↔ camera.radius 일치. **채택 후보**.

**결정**: **B4 채택**.

### 결정 C — R4 viewport-aware scaling 진입 시 본 ADR 의 재평가 / Amendment 조건

R3 ADR `20260429-r3-venus-visualization.md` §재검토 트리거 #3 + §위험·미해결 SSoT 박제 (Gemini cross-validate 2026-04-29 권고 1):

> "**R4 ADR 박제 시점에 viewport-aware scaling 도입 여부 명시적 결정 박제 의무**. R4 architect 단계에서 도입 / 미도입 / 부분 도입 (모바일 only) 3 후보 비교 후 결정 박제 의무. 미결정 또는 미루기 금지."

본 ADR 의 환산 식 (`metersPerSceneUnit = 1 / renderScaleForTier(tier)`) 은 tier 별 고정 renderScale 에 의존한다. R4 viewport-aware scaling 이 도입되면:
- (a) renderScale 자체가 viewport 함수 → 환산 식이 viewport 도 변수로 받아야 함
- (b) tier 경계 (`BOUNDARY.innerUpper` / `solarUpper`) 가 viewport 적응 → 슬라이더 LOG_MIN/LOG_MAX 범위 적응 필요
- (c) 모바일 only 부분 도입 시 데스크톱은 본 ADR 그대로 유지 가능

| 후보 | 본 ADR 변경 범위 |
| --- | --- |
| C1 R4 에서 viewport-aware 미도입 | 본 ADR 그대로 유지. Amendment 불요 |
| C2 R4 에서 viewport-aware 전체 도입 | 결정 A 환산 식이 `renderScaleForTier(tier, viewport)` 로 확장 → Amendment 의무 |
| C3 R4 에서 모바일 only 부분 도입 | 결정 A 환산 식이 viewport breakpoint 분기 → Amendment 의무 (모바일 분기만) |

**결정**: **본 ADR 은 결정 A/B 의 1차 박제 SSoT 로 유지. R4 architect 단계에서 viewport-aware scaling 도입 여부 박제 시 본 ADR 의 §재검토 조건 자동 발동 — Amendment 또는 폐기 결정**. R4 진입 전까지는 본 ADR 의 환산 식이 effective SSoT.

---

## 결정

### 결정 A — AU 라벨 환산 공식 (A3 tier-aware 환산 채택)

`displayAU` 계산을 다음과 같이 변경 (의사 코드):

```ts
// 현재 활성 tier subscribe (sim-canvas onBeforeRender 의 `solar.getTier()` 와 동일 SSoT)
const tier: Tier = useActiveTier();
const focusBodyId: string | null = useSelectedBodyId();

// scene unit → m 환산: 현재 tier 의 renderScale 역수 (sim-canvas.tsx:380, 453 와 정합)
const metersPerSceneUnit = 1 / renderScaleForTier(tier);

// 슬라이더 값 (scene unit) → m → AU
const radiusSceneUnit = Math.pow(10, value);  // 슬라이더 LOG_MIN..LOG_MAX (현행 -2..2)
const radiusMeters = radiusSceneUnit * metersPerSceneUnit;
const radiusAU = radiusMeters / AU;  // AU 상수: 149_597_870_700 m (packages/shared)

// 라벨 의미 (focus 모드 분기)
const labelMeaning: 'origin-distance' | 'focus-distance' =
  focusBodyId === null ? 'origin-distance' : 'focus-distance';

const displayAU = radiusAU;  // 단위 분기 (mAU / AU / kAU) 는 기존 displayAU < 1 분기 확장
```

**라벨 텍스트 사양** (결정 B 와 결합):
- free-fly (focusBodyId === null): `"{value} AU"` (또는 mAU / kAU 자동 단위 — 현행 mAU 분기 확장)
- focus 모드 (focusBodyId !== null): `"{value} AU (focus)"` 또는 별도 시각 큐 (예: 라벨 색상 / 작은 "📍" 아이콘 — UI 디자인 후속)

**측정 가능한 expected behavior (DoD 후속 검증 기준)**:
1. T1 solar / free-fly 진입 (default `/?`, sun 미 focus) 에서 슬라이더 thumb 의 라벨 표시값 ↔ `Math.sqrt(camera.position.x^2 + y^2 + z^2) / renderScaleForTier('solar') / AU` 가 **± 1% 이내 일치** (수식 자체 오차는 float32 누적 / `Math.sqrt` 계산 시에도 0% 에 근접해야 함. ± 1% 는 측정 도구 노이즈 마진. **Gemini cross-validate 2026-05-12 Q2 이견 수용** — 초안 ± 5% 는 셀프 체크 "순수주의" 미통과)
2. T3 body / focus venus 상태 진입 (`?focus=venus`) 에서 슬라이더 thumb 의 라벨 ↔ `camera.radius / renderScaleForTier('body') / AU` 가 **± 1% 이내 일치**
3. tier transition (T1 → T2 → T3 자연 줌인) 의 **전환 순간 1 프레임 한정**으로 라벨 값이 **± 5% 까지** 일시 drift 가능 (React render cycle 과 Babylon render cycle 사이 1~2 프레임 stale read — **Gemini cross-validate Q4 합의 — 허용 trade-off**). 전환 완료 후 다음 React render (≤ 50ms) 에 ± 1% 마진으로 수렴. 라벨 값이 순간 점프하는 것 자체는 사용자에게 보이지만 (renderScale 불연속) drift 잔존은 금지
4. focus 진입 / 해제 시 라벨 텍스트 분기 변화 (`(focus: <bodyName>)` 표시 등) 가 발생
5. **단위 자동 분기 (Gemini Q3 추가 검증 고유 발견 수용)** — T3 body 에서 `mAU` (≈ 149,597 km) 도 슬라이더 최소값 0.01 AU 환산 시 너무 큰 단위. **km 단위 추가 박제 의무**. 분기 사양:
   - `< 1e-3 AU` (≈ 149,597 km 미만) → **`{value} km`** 표시 (T3 body 진입 시 일상 단위)
   - `1e-3 AU ≤ value < 1 AU` → **`{value} mAU`** 표시
   - `1 AU ≤ value < 1000 AU` → **`{value} AU`** 표시
   - `≥ 1000 AU` (T1 solar 의 극단 줌아웃) → **`{value} kAU`** 표시
   - `ly` (광년) / `pc` (파섹) / `Gm` 은 R10+ 항성계 확장 시 비-범위 (별도 이슈)

### 결정 B — focus 모드 진입 시 슬라이더 동작 (B4 의미 재정의 + 양방향 sync 채택)

1. **양방향 sync** — `camera.radius` 변화를 ScaleControl 이 subscribe → 슬라이더 thumb 위치 갱신. 구현 경로 (**Gemini cross-validate 2026-05-12 Q1 이견 수용** — onBeforeRender 폭주 위험 + store mirror 무한 루프 위험 박제):
   - **권장 (단일 경로 박제)**: `camera.onViewMatrixChangedObservable` + **throttle ≥ 33ms** → ScaleControl 로컬 state 갱신 (Zustand store 미경유)
     - 근거: ArcRotateCamera 의 onViewMatrixChangedObservable 은 카메라 위치/회전/줌이 실제 변경될 때만 fire (애니메이션/스크롤 중에는 매 프레임 가능하나 throttle 로 React 트리 갱신 제어)
     - Zustand store 미경유 → React render 사이클 폭주 회피 + 양방향 바인딩 무한 피드백 루프 방지
   - **금지**: `onBeforeRender` 에서 store 직접 갱신 (Gemini Q1 — 매 프레임 React render 폭주). `onBeforeRender` 는 Babylon render 사이클 전용으로 유지 (sim-canvas tier observer 와 동일 격리)
   - **금지**: store 양방향 mirror (drift 위험 + 결합도 상승)
   - throttle 임계: **≥ 33ms** (≈ 30fps 갱신 빈도). 16ms (60fps) 는 React 트리 과부하 위험 (Gemini Q3 추가 검증 — 33~50ms 가 fps drop 방어 + 사용자 인지 부드러움 trade-off 최적). DoD 검증 시 fps drop ≤ 1fps 확인 + 슬라이더 thumb 갱신 지연 ≤ 50ms 확인

2. **의미 재정의** — focus 진입 시 슬라이더가 조절하는 값:
   - **현행 그대로**: `camera.radius` (scene unit) 를 조절. `setCameraRadius` command 그대로 사용
   - **라벨만 분기**: free-fly 일 때 "카메라-원점 거리 AU" / focus 일 때 "카메라-focus body 거리 AU"
   - **B4 의 핵심**: 슬라이더가 조절하는 **물리량은 동일 (camera.radius)** , 라벨 의미만 분기. 구현 단순 + 사용자 직관 일치

3. **focus 모드 시각 큐** — 라벨 텍스트에 `(focus: <bodyName>)` 추가 또는 작은 indicator. 디자인 후속 (developer + UX 협의)

**측정 가능한 expected behavior**:
1. 마우스 휠 줌 / 핀치 줌 / `?focus=X` URL 진입으로 `camera.radius` 변경 후 **≤ 50ms 이내** (throttle 33ms + React render 17ms ≈ 50ms) 슬라이더 thumb 위치 갱신
2. tier transition (`camera.radius` 가 tier 경계 통과로 renderScale 변경) 시 슬라이더 thumb 위치가 새 tier 환산식에 맞게 즉시 (≤ 50ms) 갱신. 전환 순간 1 프레임 stale read 허용 (결정 A expected behavior #3 정합)
3. focus 진입 시 라벨 텍스트가 `(focus: <bodyName>)` 표기 추가 — 사용자 인지 가능
4. focus 해제 (`resetCamera` command) 시 라벨 텍스트가 free-fly 표기로 복귀
5. focus 모드 + 슬라이더 드래그 → `setCameraRadius` command → `camera.radius` 변경 → focus 거리 조절 가능 (양방향 일관성)
6. **엣지 케이스 — sun focus (Gemini cross-validate Q3 추가 검증 고유 발견 수용)**: focus body 가 sun 일 때 sun 위치 = 원점 (`Vec3 [0,0,0]`) 이므로 free-fly 모드의 "카메라-원점 거리" 와 focus 모드의 "카메라-sun 거리" 의 환산 값이 **수학적으로 동일**. 라벨 텍스트만 `(focus: sun)` 추가되어 분기 — 값 변화 없음을 사용자가 인지하도록 시각 큐 박제 (label tooltip 또는 indicator). DoD 검증: sun focus 진입/해제 시 라벨 **값 변화 0** + **텍스트 분기만** 발생
7. **엣지 케이스 — focus target 소실 (Gemini Q3 고유 발견 수용)**: focus 중인 body 가 R-Phase 진입/이탈로 `R_PHASE_BODY_ALLOWLIST` 에서 제거되거나 store 의 `selectedBodyId` 가 null 로 바뀌는 경우 자동 free-fly 복귀. 라벨 텍스트가 `(focus: <bodyName>)` 에서 free-fly 표기로 전환. `isRPhaseFocusable` 가드와 정합 — 가드가 차단한 focus 시도는 본 엣지 케이스에 도달 전에 거부됨

### 결정 C — R4 viewport-aware scaling 진입 시 본 ADR 의 재평가 / Amendment 조건

본 ADR 은 결정 A/B 의 1차 박제 SSoT 로 유지하며, R4 architect 단계에서 viewport-aware scaling 도입 여부가 박제되는 시점에 다음을 수행한다:

1. **R4 architect**: viewport-aware scaling 도입 결정 박제 (R3 ADR §재검토 트리거 #3 의무) 시 본 ADR (`20260512-au-slider-semantics.md`) 을 **명시적으로 참조** + Amendment 필요 여부 판정
2. **Amendment 작성 시점**: R4 ADR 박제와 **동일 PR** 에 본 ADR Amendment 추가 (분리 PR 금지 — drift 위험)
3. **Amendment 조건**:
   - C1 viewport-aware 미도입 → Amendment 불요 (본 ADR 그대로 유지)
   - C2 viewport-aware 전체 도입 → 결정 A 환산 식 확장 (`renderScaleForTier(tier, viewport)` 또는 SSoT 함수 시그니처 변경 반영) + Amendment 박제
   - C3 모바일 only 부분 도입 → viewport breakpoint 분기 추가 + Amendment 박제 (모바일 분기만)
4. **본 ADR 폐기 조건**: 결정 A/B 의 사용자 인지 패턴이 R4 에서 근본적으로 부적합 (예: viewport-aware 가 슬라이더 자체를 폐기 권고) 시 본 ADR 폐기 + 신규 ADR 박제

**구조적 가드 (Gemini cross-validate 2026-05-12 Q5 이견 수용 — ADR 텍스트만으로 차단 불가 박제)**:

ADR §재검토 조건 #1 + 결정 C 텍스트만으로는 인적 오류 (R4 architect 가 본 ADR 참조 누락) 차단 불가. 다음 구조적 가드 의무:

- **#412 R-Phase 진입 체크리스트 amendment 후속 이슈 분리 박제 의무** — "R4 진입 시 ADR `20260512-au-slider-semantics.md` Amendment / 폐기 검토" 항목을 R-Phase 진입 체크리스트 SSoT 에 추가. 본 ADR 박제와 **동일 PR** 에 후속 이슈 즉시 생성 (volt #29 분리 박제 규칙). **후속 이슈 [#454](https://github.com/coseo12/astro-simulator/issues/454) 박제 완료** (priority:high, 2026-05-12)
- **본 ADR 박제 시 #454 우선순위 high 박제** — R4 진입 (~1주 이내 예상) 전 amendment 박제 완료 필요. cross-validate Q5 + #412 R-Phase 진입 체크리스트 SSoT 직교성 확보
- **PR 템플릿 ADR 호환성 체크 강제 (Gemini Q5 추가 권고)** — 모든 PR 에 적용되는 일반 가드. **후속 이슈 [#455](https://github.com/coseo12/astro-simulator/issues/455) 박제 완료** (priority:medium, 2026-05-12). 결정 C 구조적 가드 #454 와 직교

---

## 결과 / 재검토 조건

### 결과

- **DoD-2 (AU 라벨 사실 정확성)** 해소 — 결정 A 의 tier-aware 환산식이 정의되어 라벨 값이 실 천체간 거리 (m → AU) 와 ± 5% 일치
- **DoD-4 (focus 모드 동작 결정)** 해소 — 결정 B 의 양방향 sync + 의미 재정의 + 시각 큐 정의
- **DoD-1 (양방향 sync)** 의 부분 해소 — 결정 B 의 양방향 sync 가 구현 경로 박제 (구현은 developer 단계)
- **DoD-3 (초기값 hardcode)** 미해소 — 초기값 동기화는 결정 B 의 양방향 sync 가 자동 처리 (마운트 시점 camera.radius 가 슬라이더에 반영)
- **DoD-5 (사용자 D-T2)** 의 검증 기준 박제 — 결정 A/B 의 expected behavior 가 D-T2 체크리스트와 1:1 대응
- **DoD-6 (테스트 + 회귀 가드)** 의 검증 기준 박제 — 결정 A/B 의 expected behavior 가 단위/통합 테스트 SSoT

### 재검토 조건

1. **R4 viewport-aware scaling 결정 박제** (R3 ADR §재검토 트리거 #3 의무 발동 시) — 본 ADR Amendment 또는 폐기. **R4 architect 단계에서 본 ADR 명시 참조 의무**
2. **focus 모드 슬라이더 의미 재정의의 사용자 인지 미달** — D-T2 사용자 검증에서 "focus 모드 슬라이더 라벨 의미가 헷갈린다" 평가 시 결정 B 의 시각 큐 강화 또는 후보 B2 (disable) / B3 (hide) 로 전환 재평가
3. **tier transition 시 라벨 점프의 UX 침습성** — 자연 줌인 시 T1 → T2 → T3 경계 통과로 라벨 값이 4-5 자릿수 점프 (1.2 AU → 0.005 AU) 발생. 사용자 D-T2 에서 "값이 갑자기 튄다" 평가 시 보간 / 표기 단위 자동 전환 (mAU / km) 강화 재평가
4. **양방향 sync 비용 fps drop ≥ 1fps** — onBeforeRender + store mirror 비용이 fps 에 가시적 영향 → throttle 임계 ≥ 33ms 로 완화 또는 subscribe 경로 단순화 재평가
5. **AU 외 단위 (km / Gm / ly) 보편 단위 사용자 요구** — 사용자 피드백에서 "AU 단위가 직관적이지 않다" 평가 시 결정 A 의 단위 분기 확장 (mAU < km < AU < ly) 또는 후보 A4 (단위 자체 전환) 재평가
6. **AU 상수 정합 drift** — `packages/shared/src/constants/astronomy.ts` 의 `AU = 149_597_870_700` 변경 시 본 ADR 결정 A 환산식의 정확도 영향 검토 (현재 IAU 2012 정의)
7. **React stale read 의 사용자 인지 (Gemini cross-validate Q4 합의 박제)** — Babylon render 사이클 (60fps) 과 React render 사이클 사이 1~2 프레임 stale read 불가피. tier transition 직후 슬라이더 라벨 값이 50ms 까지 ± 5% drift 가능 (전환 완료 후 ± 1% 마진으로 수렴). 사용자 D-T2 검증에서 "tier transition 시 라벨이 튄다" 평가 시 throttle 임계 완화 (≥ 16ms 로 다시 강화) 또는 onBeforeRender 우회 경로 (Babylon → React 단방향 즉시 동기) 재평가
8. **결정 B 양방향 sync 의 무한 피드백 루프 (Gemini Q1 이견 박제)** — 슬라이더 드래그 → `setCameraRadius` command → `camera.radius` 변경 → `onViewMatrixChangedObservable` fire → ScaleControl state 갱신 → 슬라이더 thumb 위치 변경 ↻. throttle 33ms 만으로 충분한지 검증 의무. 무한 루프 발견 시 발신자 source 비교 가드 (`if (source === 'slider') skip`) 추가 재평가

### 비-범위 (본 ADR 결정 대상 외)

- 슬라이더 UI 디자인 변경 (위치 / 폭 / 색상 / 아이콘 디자인) — 후속 UX 협의
- 마우스 휠 외 인터랙션 (touch gesture / keyboard shortcut) — 별도 이슈 (#400 비-범위와 일치)
- AU 외 추가 단위 토글 (`unit-toggle` 같은 별도 컨트롤) — 별도 이슈
- R4 의 viewport-aware scaling 자체 설계 — R4 architect 단계 (별도 ADR)
- focus body 가 R_PHASE_BODY_ALLOWLIST 에 없는 경우의 fallback — `isRPhaseFocusable` 가 차단 (직교)

---

## R4 와의 관계

| 항목 | 본 ADR (결정 A/B) | R4 viewport-aware scaling (예정) |
| --- | --- | --- |
| 직접 결합 | renderScale → m → AU 환산식 | renderScale 자체 (viewport 함수) |
| 결합 위험 | △ (R4 가 환산식 시그니처 변경 시 본 ADR Amendment 의무) | (본 ADR 가 R4 의 결정 강도에 영향 미미) |
| 결합 박제 | 본 ADR §재검토 조건 #1 + 결정 C | R4 ADR §재검토 조건 (R4 작성 시 박제) |
| 폐기 가능성 | R4 가 슬라이더 자체 재설계 권고 시 본 ADR 폐기 + 신규 ADR | (R4 는 본 ADR 와 무관하게 진행 가능) |

R4 architect 단계 진입 시 본 ADR 의 §재검토 조건 #1 이 자동 발동되어 Amendment / 폐기 결정 박제 의무. 이는 R3 ADR §재검토 트리거 #3 의 "R4 ADR 박제 시점에 viewport-aware scaling 도입 여부 명시적 결정 박제 의무" 와 정합한다.

---

## 후속 작업 인계 (developer)

본 ADR 박제 후 이슈 #400 의 잔여 작업은 다음으로 분류:

### ADR 으로 해소 (구현 대기)

- **DoD-1 양방향 sync** — 결정 B 의 양방향 sync 경로 (구현 경로는 sim-canvas onBeforeRender 또는 camera observable 권장). throttle ≥ 16ms 임계 박제
- **DoD-2 AU 라벨 사실 정확성** — 결정 A 의 tier-aware 환산식 구현. `useActiveTier` / `useSelectedBodyId` hook 또는 store subscribe 경로 결정 (developer 단계)
- **DoD-3 초기값 hardcode** — 결정 B 의 양방향 sync 가 마운트 시점 camera.radius 자동 반영으로 해소. 별도 초기값 계산 불요
- **DoD-4 focus 모드 동작** — 결정 B 의 의미 재정의 + 양방향 sync + 시각 큐 (`(focus: <bodyName>)`)

### 구현 잔여 (developer 결정)

- **양방향 sync 경로 선택** — sim-canvas onBeforeRender / camera observable / store mirror 중 선택. 성능 / 코드 단순성 / 결합도 trade-off
- **focus 모드 시각 큐 디자인** — 라벨 텍스트에 `(focus: <bodyName>)` 추가 형식 또는 indicator. UX 디자인
- **단위 분기 확장** — 현행 `mAU / AU` → `mAU / AU / kAU` 또는 자동 단위 선택 알고리즘. tier transition 시 자연 전환
- **DoD-5 D-T2 사용자 검증** — 결정 A/B expected behavior 1~5 (결정 A) + 1~5 (결정 B) 의 실 Chrome GUI 검증
- **DoD-6 테스트** — 단위 테스트 (환산식 정확성 / focus 모드 분기 / throttle 동작) + 통합 테스트 (tier transition + slider sync) + 회귀 가드

### 비-범위 (본 ADR + 이슈 #400 모두 비-범위)

- AU 외 단위 토글
- 슬라이더 UI 디자인 변경
- 마우스 휠 외 인터랙션
- R4 viewport-aware scaling 자체 설계 (R4 architect 단계 별도)

---

## 교차검증 반영 사항

> **호출 전 Claude 편향 셀프 체크** (CLAUDE.md `## 교차검증` 4종): 낙관적 일정 (해당 없음 — 본 ADR 은 설계 박제만, 일정 미박제) / 결합 간과 (검증 대상 — 결정 A 의 tier subscribe 가 sim-canvas onBeforeRender 와 결합 가능) / 폐기 프레이밍 (해당 없음 — 폐기 결정 없음, 신규 박제) / 순수주의 (검증 대상 — 결정 A 의 ± 5% 마진이 측정 노이즈 핑계로 과대 허용 가능). 미통과 축: **결합 간과** + **순수주의** → cross-validate 호출 시 명시 질문 삽입 (Q1, Q2).

> **cross-validate 호출 결과 (2026-05-12, Gemini 2.5 Pro, outcome=applied)**: ADR 박제 직후 1회 루틴 (CLAUDE.md "정책·설계·ADR 박제 직후 1회 루틴"). 로그: `.logs/cv-400-20260512-220606.log`. 셀프 체크 미통과 2축 (결합 간과 + 순수주의) 모두 Gemini 가 동일하게 미통과로 평가 → 본 ADR 실제 박제 직전에 즉시 수정.

### 합의 (Claude 설계와 일치, 현재 ADR 에 즉시 반영)

- **Gemini Q3 합의 — R4 미정 상태 선 박제 (a) 안전 — 즉시 반영**: 본 ADR 박제를 R4 ADR 박제와 분리 진행. 결정 C 의 박제 SSoT 그대로 유지 ("본 ADR 은 결정 A/B 의 1차 박제 SSoT 로 유지"). 근거 — volt #74 "거짓 정보 노출" 패턴이 D-T2 전체 오염 위험 → 즉각 해소가 R4 지연보다 안전. 점진적 개선 원칙 부합
- **Gemini Q4 합의 — React 1~2 프레임 stale read 허용 trade-off — 즉시 반영**: 결정 A expected behavior #3 + §재검토 조건 #7 박제 ("전환 순간 1 프레임 한정 ± 5% 일시 drift 허용, 전환 완료 후 ≤ 50ms 에 ± 1% 마진 수렴")

### 이견 수용 (Claude 원안과 다르나 Gemini 근거 합리적 — 본 ADR 즉시 수정 박제)

- **Gemini Q1 이견 수용 — 양방향 sync 경로 단일 박제**: Claude 원안 = "onBeforeRender / observable / store mirror 중 developer 선택" → Gemini 권고 수용 = **`camera.onViewMatrixChangedObservable` + throttle ≥ 33ms 단일 경로 박제** (onBeforeRender / store mirror 금지). 근거 — onBeforeRender 매 프레임 React 폭주 위험 + store mirror 무한 루프 위험. 결정 B 본문 박제 갱신
- **Gemini Q2 이견 수용 — ± 5% → ± 1% 마진 강화** (셀프 체크 "순수주의" 미통과 적중): Claude 원안 = ± 5% → Gemini 권고 수용 = **수식 자체 오차 ≈ 0%, 측정 마진 ± 1%**. tier transition 1 프레임 stale read 만 ± 5% 한정 허용. 근거 — float32 누적 오차 / Math.sqrt 도 5% 까지 벌어질 수 없음. 결정 A expected behavior #1/#2/#3 박제 갱신
- **Gemini Q3 추가 검증 이견 수용 — throttle 16ms → 33ms 박제**: Claude 원안 = throttle ≥ 16ms (60fps) → Gemini 권고 수용 = **≥ 33ms (≈ 30fps)**. 근거 — 16ms 는 React 트리 과부하 위험. 33~50ms 가 fps drop 방어 + 사용자 인지 부드러움 trade-off 최적. 결정 B 본문 박제 갱신
- **Gemini 추가 검증 이견 수용 — km 단위 분기 추가**: Claude 원안 = mAU / AU / kAU (3 단위) → Gemini 권고 수용 = **km / mAU / AU / kAU (4 단위)** 박제. 근거 — T3 body 진입 시 0.01 AU ≈ 149,597 km × 0.01 = 1,496 km. mAU (149 km) 도 너무 큰 단위. 결정 A expected behavior #5 신규 박제
- **Gemini Q5 이견 수용 — 구조적 가드 추가 (ADR 텍스트만으론 차단 불가)**: Claude 원안 = "본 ADR §재검토 조건 #1 + 결정 C 만으로 차단" → Gemini 권고 수용 = **#412 R-Phase 진입 체크리스트 amendment 후속 이슈 분리 박제 의무**. 결정 C 본문에 구조적 가드 박제 + 후속 이슈 본 PR 박제와 동시 생성

### Claude 재분석으로 기각한 Gemini 제안

- (없음) — Gemini Q1~Q5 + 추가 검증 모두 합리적 근거를 갖춰 전부 반영 또는 후속 분리 (맹목 수용 회피 — volt #51) 처리. 미반려 = 셀프 체크 미통과 2축 (결합 간과 + 순수주의) 이 정확히 적중하여 Gemini 가 동일 결론 도출했기 때문 (단일 모델 편향 노출 효율 최대)

### 고유 발견 (후속 분리)

- **Gemini Q3 추가 검증 — sun focus 엣지 케이스**: focus body 가 sun 일 때 sun 위치 = 원점이므로 free-fly 와 focus 거리 계산 동일. **본 ADR 결정 B expected behavior #6 으로 즉시 반영** (범위 내 — DoD-4 focus 모드 동작 결정 포함). 후속 분리 불요
- **Gemini Q3 추가 검증 — focus target 소실 fallback**: focus 중인 body 가 R-Phase 진입/이탈로 R_PHASE_BODY_ALLOWLIST 에서 제거되거나 selectedBodyId 가 null 로 바뀌는 경우. **본 ADR 결정 B expected behavior #7 으로 즉시 반영** (범위 내 — `isRPhaseFocusable` 가드와 정합). 후속 분리 불요
- **Gemini Q5 — #412 R-Phase 진입 체크리스트 amendment**: ADR 텍스트만으론 R4 진입 시 본 ADR Amendment 누락 차단 불가. **후속 이슈 [#454](https://github.com/coseo12/astro-simulator/issues/454) 박제 완료** (범위 밖 — 본 ADR 결정 대상은 슬라이더 의미, #412 는 R-Phase 가드 SSoT). 본 ADR PR 박제와 동시 생성 (volt #29 분리 박제 규칙 — 즉시 생성 + Builds on 링크 + 우선순위 high)
- **PR 템플릿 ADR 호환성 체크 강제 (Gemini Q5 추가 권고)**: PR 템플릿 또는 ISSUE_TEMPLATE 에 "이전 ADR 호환성 체크" 항목 강제. **본 ADR 박제 PR 의 비-범위** (PR 템플릿 변경은 별도 영역). **후속 이슈 [#455](https://github.com/coseo12/astro-simulator/issues/455) 박제 완료** (priority:medium)

## Amendment 1 — 2026-05-18 — sun focus desiredRadius drift 박제

- **발의**: [#459](https://github.com/coseo12/astro-simulator/issues/459) (PR [#457](https://github.com/coseo12/astro-simulator/pull/457) reviewer 정적 리뷰 + developer 헤드리스 실측 발견)
- **트리거**: 결정 B expected behavior #6 의 가정 ("sun focus 시 sun 위치 = 원점이므로 카메라-sun = 카메라-원점, 수학적으로 동일, 값 변화 0") 과 실 R3 동작의 28% drift 실측 발견.
- **헤드리스 실측 (developer 보고)**:
  - T1 solar 기본 진입: `2.79 AU`
  - focus sun 진입: `2.01 AU (focus: sun)`
  - 차이: 28%
- **원인 분석 (reviewer)**: `packages/core/src/scene/camera-controller.ts:82-87` `controller.focusOn` 의 `desiredRadius` 식 — `desiredRadius = max(meshRadius × 5, meshRadius + 0.01)`. sun mesh `boundingSphere.radiusWorld` ≈ 5.06 scene unit (SUN_RADIUS 6.957e8 m × T1 renderScale 8.4e-11 × SUN_BODY_SCALE ~86배). `desiredRadius = max(5.06 × 5, 5.06 + 0.01) ≈ 25.3 scene unit ≈ 2.01 AU`. sun focus 진입 시 카메라가 원점이 아닌 sun 표면에서 25.3 unit 떨어진 위치로 강제 이동되므로 ADR 가정 무효.
- **결정 (Gemini cross-validate Q5 합의 — 옵션 A 채택)**: 결정 B expected behavior #6 의 "값 변화 0 / 텍스트 분기만" 가정 **폐기**. 정정안 — **"sun focus 진입 시 desiredRadius 강제 재설정으로 값 변화 발생 (T1 기준 ~28%). 라벨 텍스트 `(focus: sun)` 분기 + 값 변화 모두 사용자가 인지하도록 시각 큐 박제."** 옵션 B (sun bypass 코드 수정) 는 sun mesh 거대 → 카메라 박힘 위험 + 일관성 깨짐으로 기각.
- **결정 B expected behavior #6 정정 (Amendment 적용 후 실효 SSoT)**:
  > **엣지 케이스 — sun focus**: focus body 가 sun 일 때도 `controller.focusOn` 의 `desiredRadius` 강제 재설정이 발생 (sun mesh `boundingSphere.radiusWorld` 5.06 scene unit × 5 ≈ 25.3 unit ≈ 2.01 AU at T1 solar). free-fly "카메라-원점 거리" 대비 ~28% drift. 라벨 텍스트 `(focus: sun)` 분기 **+ 값 변화 발생** 모두 시각 큐로 사용자에게 인지. DoD 검증: sun focus 진입/해제 시 라벨 **텍스트 분기 + desiredRadius 환산 값 일치** (라벨 값이 `2.79 AU` → `2.01 AU` 자연 전환 — 사용자 위화감 평가는 §재검토 조건 #2 강화 항목).
- **§재검토 조건 #2 강화 (Amendment 적용 후 실효 SSoT)**: 기존 "focus 모드 슬라이더 의미 재정의의 사용자 인지 미달" 평가에 **sun focus 진입 시 28% 값 변화에 대한 사용자 위화감 평가 추가**. D-T2 검증에서 "sun focus 진입 시 라벨 값이 갑자기 변한다 (튀는 느낌)" 평가 시:
  - 옵션 1 — 시각 큐 강화 (tooltip / animation 으로 값 변화 자연스럽게)
  - 옵션 2 — `desiredRadius` 식 별도 분기 (sun = `meshRadius + ε` 처럼 표면 근접 거리 박제, 단 mesh 박힘 위험 검증 후)
  - 옵션 3 — sun focus 자체 비허용 (R_PHASE_BODY_ALLOWLIST 에서 sun 제거) — 사용자 UX 손실로 최후 옵션
- **영향**: PR [#457](https://github.com/coseo12/astro-simulator/pull/457) 코드 + 단위 테스트 **수정 불요** (정확 동작). ADR 본문 정정 + Amendment 박제만.
- **cross-link**: 본 Amendment, [#459](https://github.com/coseo12/astro-simulator/issues/459), 발견 PR [#457](https://github.com/coseo12/astro-simulator/pull/457), 직전 Amendment 없음 (본 ADR 의 첫 Amendment)
- **참조 SSoT**: `packages/core/src/scene/camera-controller.ts:82-87` (`focusOn` desiredRadius 식), `packages/core/src/scene/sun-body.ts` (`SUN_RADIUS` / `SUN_BODY_SCALE`)
