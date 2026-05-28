# 아키텍처 원칙 (Architecture Principles)

본 문서는 astro-simulator 의 설계 의사결정에서 반복 등장하는 **횡단 원칙 (cross-cutting principles)** 을 박제한다. 개별 ADR 은 한 결정의 맥락 + 비교 + 선택을 다루는 반면, 본 문서는 그 ADR 들이 공유하는 **상위 설계 철학** 을 명문화하여 향후 유사 트레이드오프 상황에서 일관성 있는 의사결정 기반을 제공한다.

> **버전 / 출처**: 2026-05-24, R4 #539 ADR cross-validate (Gemini 2.5 pro 2026-05-21) 고유 발견 2 → 이슈 #541. **Visual Fidelity** 원칙이 첫 박제 항목.

---

## 1. Visual Fidelity (시각 충실도)

### 원칙

> **데이터의 과학적 정확성은 유지하되, 사용자의 인지를 돕기 위해 시각적 표현은 의도적으로 왜곡할 수 있다.**

천체 시뮬레이터처럼 **실측 데이터의 스케일 격차가 사람 시각 인지 범위를 초과** 하는 도메인에서는, 데이터를 그대로 렌더링하면 사용자가 정보를 인지하지 못한다. 이때 데이터 SSoT 는 보존하되 **rendering 시점에만 시각 과장 (visual exaggeration)** 을 도입하여 인지 가능성을 확보한다.

### 적용 위치 원칙 (Locality of Distortion)

| 계층 | 정책 | 예시 |
|---|---|---|
| **데이터 SSoT** (e.g. `solar-system.json`, NASA/JPL Fact Sheet 인용 상수) | **불변** — 실측값 그대로 보존 | `body.radius (m)`, `semiMajorAxisAU`, `eccentricity` |
| **physics 엔진** (`packages/core/physics-engine`, Rust+wasm) | **불변** — 적분기는 실측 m / AU 좌표 사용 | Yoshida4, EIH 1PN, heliocentric 좌표 계약 |
| **scene rendering** (`packages/core/src/scene`, `apps/web`) | **왜곡 허용** — body mesh radius / orbit 거리 / billboard fallback | `sunScale=50`, `mercuryScale=700`, `EARTH_MOON_ORBIT_VISUAL_SCALE=30` |
| **UI overlay** (focus 패널, Info 패널) | 실측값 표기 의무 — 왜곡된 시각값을 표기하지 않음 | "지구 반지름 6,371 km" (mesh radius `5.103e9 m` 아님) |

**경계 위반 금지** — physics 엔진이 BODY_SCALE 에 의존하면 적분기가 왜곡된 거리로 계산해 P11-A `Rust engine 좌표는 heliocentric 절대 m` 계약을 위반한다. 본 경계는 R1 ADR §결정 2 (상수 위치) 에서 `apps/web/src/constants/body-scale.ts` 로 격리한 근거의 일반화.

### 적용 트리거

다음 중 **하나 이상** 충족 시 Visual Fidelity 왜곡 도입을 검토한다:

1. **mesh 가시성 임계 미달** — body mesh px diameter < 4 px (sub-pixel 잔재, billboard fallback 발동)
2. **mesh-mesh / mesh-orbit fusion** — sum mesh radius > 실측 거리 (parent-satellite 분리 불가)
3. **점유율 임계 미달** — 화면 점유율 < 사용자 인지 임계 (R1 baseline: brightRatio ≥ 3% 모바일)
4. **사실 비례 역전** — 실측 비율 보존 시 사용자 mental model 역전 발생 (예: 시각상 venus < mercury)

### 적용 사례 표

| R-Phase | ADR | 왜곡 대상 | 박제값 | 트리거 | 데이터 SSoT 보존 |
|---|---|---|---|---|---|
| **R1** (sun) | `20260425-r1-sun-visualization.md` | sun mesh radius | `sunScale = 50` (Amendment 2026-05-01) | 점유율 임계 미달 — 모바일 brightRatio | ✓ `sun.radius = 6.957e8 m` 보존 |
| **R2** (mercury) | `20260428-r2-mercury-visualization.md` | mercury mesh radius | `mercuryScale = 700` (Amendment 2026-05-03 라운드 3) | sub-pixel 잔재 + 사실 비율 강화 | ✓ `mercury.radius = 2.44e6 m` 보존 |
| **R3** (venus) | `20260429-r3-venus-visualization.md` | venus mesh radius | `venusScale = 800` (Amendment 2026-05-03 라운드 3) | 사실 비례 역전 (venus > mercury 강화) | ✓ `venus.radius = 6.0518e6 m` 보존 |
| **R4** (earth + moon) | `20260520-r4-earth-moon-visualization.md` §결정 1 | earth/moon mesh radius | `earthScale = 800`, `moonScale = 800` | Q2=B 비례 결정 정책 (사실 비례 보존) | ✓ `earth.radius = 6.371e6 m` 보존 |
| **R4** (earth + moon) | `20260520-r4-earth-moon-visualization.md` §결정 6 (Amendment 2 forensic) | earth-moon orbit 거리 | `EARTH_MOON_ORBIT_VISUAL_SCALE = 30` | mesh-mesh fusion (sum mesh > 실측 거리 16.9배) | ✓ `semiMajorAxisAU = 0.00257189` 보존 |
| **R4 후속** (a11y) | `20260525-552-a11y-baseline-fix.md` §결정 3 | moon orbit color (RGB) | `MOON_ORBIT_COLOR_DEFAULT = Color3(0.30, 0.35, 0.50)` (2026-05-25) | WCAG 1.4.11 non-text 2.32:1 → 3.06:1 (a11y baseline 격차) | ✓ rendering-only 상수, `solar-system.json` 변경 0 — §의무 체크리스트 4항목 첫 본 인스턴스화 |

> R5+ (mars/phobos/deimos, jupiter/galilean, saturn/titan) 진입 시 satellite 가 있는 모든 case 에 동일한 평가를 의무화한다 — R4 §결정 6 Amendment 2 의 R5+ 확장 박제 참조.

### 의무 체크리스트 (왜곡 적용 시)

ADR 박제 단계에서 다음 4 항목을 명시한다:

- [ ] **데이터 SSoT 보존 확인** — 왜곡 대상 값이 `apps/web/src/constants/body-scale.ts` 또는 `packages/core/src/scene/*.ts` 의 rendering-only 상수인가? `solar-system.json` 직접 수정 금지
- [ ] **rendering 시점 분리** — physics 엔진 (`packages/core/physics-engine`, Rust+wasm) 이 본 상수에 의존하지 않는가? 의존 발견 시 P11-A 좌표 계약 위반
- [ ] **사용자 D-T2 가이드** — UI overlay (focus 패널 / Info 패널) 가 실측값을 표기하는가? 시각 왜곡과 데이터 표기를 사용자에게 명시적으로 구분
- [ ] **점유율 / 사실 비율 baseline 박제** — 박제값 도입 시 viewport 별 px diameter / sun 대비 px 비 / mesh-orbit 분리 마진을 ADR §점유율 산출 또는 §결정 N 표에 박제 (회귀 가드 baseline 제공)

### 폐기 ADR cross-link (Anti-pattern 참고)

본 원칙은 다음 폐기 ADR 의 교훈을 명문화한 것이다 — 폐기 사례는 "Visual Fidelity 의 정반대 극단" 으로 참고:

- [`docs/deprecated/principles/fact-first.md`](../deprecated/principles/fact-first.md) — **Fact-First 폐기**. "데이터 = 시각 표현 = 일치 강제" 가 사용자 인지 불가능 (sun 외 모든 body 가 sub-pixel) 으로 UX 회귀
- [`docs/deprecated/decisions/20260423-display-relative-scale-unification.md`](../deprecated/decisions/20260423-display-relative-scale-unification.md) — **P12 Display-Relative Scale Unification 폐기**. 단일 통합 식이 점유율은 PASS 했으나 default 진입 화면이 "궤도 라인 + 해왕성 1개" 빈 상태로 UX 회귀 (volt [#74](https://github.com/coseo12/volt/issues/74))

### Anti-pattern (적용 금지)

- ❌ **데이터 SSoT 수정** — `solar-system.json` 의 `radius`, `semiMajorAxisAU`, `eccentricity` 등을 시각 가시성 사유로 수정. **금지** — physics 엔진 적분 정확성 / Info 패널 표기 실측값 / cross-link 일관성 동시 파괴
- ❌ **physics 엔진 의존** — Rust+wasm 적분기가 `BODY_SCALE` / `ORBIT_VISUAL_SCALE` 에 의존. P11-A `Rust engine 좌표는 heliocentric 절대 m` 계약 위반
- ❌ **UI overlay 왜곡값 표기** — focus 패널이 mesh radius (왜곡값) 를 표기. 사용자가 데이터 자체를 오인 — 실측값 표기 의무 위반
- ❌ **임의 임계** — 박제값 근거 없이 "보기 좋은 값" 으로 설정. ADR §점유율 산출 또는 §결정 N 표에 viewport / sun 대비 비 / 분리 마진 baseline 박제 의무

---

## 관련 문서

- **이슈**: [#541](https://github.com/coseo12/space/issues/541) (본 원칙 명문화 트리거)
- **상위 로드맵**: [`docs/phases/roadmap-v3-incremental.md`](../phases/roadmap-v3-incremental.md) §R-Phase 공통 DoD 템플릿
- **데이터 SSoT vs 왜곡 경계 ADR**: [`docs/decisions/20260425-r1-sun-visualization.md`](../decisions/20260425-r1-sun-visualization.md) §결정 2 (상수 위치) — `apps/web` 격리 근거
- **Q2=B 비례 결정 정책**: [`docs/decisions/20260430-r3-followup-body-proportion.md`](../decisions/20260430-r3-followup-body-proportion.md) — 본 원칙의 R-Phase 적용 절차
- **forensic 모범 (R4 Amendment 2)**: [`docs/decisions/20260520-r4-earth-moon-visualization.md`](../decisions/20260520-r4-earth-moon-visualization.md) §결정 6 — orbit visual scale 첫 인스턴스
