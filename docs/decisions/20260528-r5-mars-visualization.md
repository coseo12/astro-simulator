# ADR: R5 화성 + 포보스 + 데이모스 시각화 — Q2=B 정책 2번째 본 인스턴스화 + satellite 2개 첫 본 사례

- **상태**: Accepted (cross-validate 2026-05-28 Antigravity `agy` outcome=applied 후 본문 통합 완료 — CLAUDE.md §ADR Status 워크플로 #370 의 cross-validate 발동 ADR 전이) **+ Amendment 1 Accepted (#604, cross-validate 2026-05-31 agy outcome=applied 후 본문 통합 완료)**
- **날짜**: 2026-05-28
- **결정자**: architect (#594 R5 PM 합의 라운드 1, 2026-05-28 후 위임)
- **관련**: #594 (본 R5 스프린트), [`20260520-r4-earth-moon-visualization.md`](20260520-r4-earth-moon-visualization.md) (R4 SSoT — earthScale=800 / moonScale=200 Amendment 4 / EARTH_MOON_ORBIT_VISUAL_SCALE=30 / satellite 첫 본 사례 패턴 + R-Phase 단일 ADR + forensic 변형 패턴), [`20260430-r3-followup-body-proportion.md`](20260430-r3-followup-body-proportion.md) (Q2=B 비례 결정 정책 SSoT — 본 R5 가 R4 이후 2번째 본 인스턴스화), [`20260504-r-phase-allowlist-guard.md`](20260504-r-phase-allowlist-guard.md) (R-Phase 진입 5곳 동시 박제 절차 SSoT), [`20260424-p11-b-lod-design.md`](20260424-p11-b-lod-design.md) (LOD × scale 합성 순서), [`20260422-floating-origin.md`](20260422-floating-origin.md), [`docs/architecture/principles.md`](../architecture/principles.md) §1 Visual Fidelity (#541, 의무 체크리스트 4항목), [`docs/templates/forensic-adr-template.md`](../templates/forensic-adr-template.md) (Amendment 라운드 N 예상 시 승격 SSoT)
- **교훈 적용**:
  - "신규 함수 ≠ 신규 구현" (volt [#21](https://github.com/coseo12/volt/issues/21) — R1+R2+R3+R4 인프라 100% 재사용 검증, **satellite 2개 첫 본 사례** = R4 moon 단일 satellite 패턴 일반화)
  - "신규 데이터 ≠ 신규 코드 — ADR 예측 재현" (R4 ADR §결과·재검토 조건 §Concrete Prediction "R5 추가 시 코드 변경 ≤ 7 라인" 검증 — mars + 2 satellites 모두 진입 시 BODY_SCALE 3 + R_PHASE_BODY_ALLOWLIST 3 + FOCUS_BUTTONS 1 (mars 만, Q4a=A) + ORBIT_VISUAL_SCALE_BY_PARENT 1 (mars) = **8 라인** 예상)
  - "headless 브라우저 검증 ≠ 실 브라우저" (volt [#77](https://github.com/coseo12/volt/issues/77) — 실 Chrome GUI 수동 D-T2 의무 명시)
  - "DoD PASS ≠ 제품 동작" (volt [#74](https://github.com/coseo12/volt/issues/74) — moon Amendment 4 학습 의무 적용. 사실 비율 vs 사용자 천문 직관 mismatch 검증)
  - "엄격 원칙 + 동적 적응 부재 함정" (volt [#68](https://github.com/coseo12/volt/issues/68) — Q2=B 임계가 satellite sub-pixel 잔재 환경 (phobos 11 km / deimos 6 km) 과 직교 확인)
  - "인계 항목 실측 재검증" (volt [#14](https://github.com/coseo12/volt/issues/14) — R5 진입 시점 baseline 실측: sun=50 / mercury=700 / venus=800 / earth=800 / moon=200 / EARTH_MOON_ORBIT_VISUAL_SCALE=30 보존 검증 후 박제. develop tip = 21da828 v0.18.0)
  - "PM DoD 구조 drift 금지" (volt [#76](https://github.com/coseo12/volt/issues/76) — Q2/Q3 (architect 위임) 만 인스턴스화, 다른 PM 합의 항목 (Q1=B / Q4a=A / Q5=A) 재구조화 금지)
  - "결합 간과 — Claude 4종 편향" (volt [#29](https://github.com/coseo12/volt/issues/29) — mars 와 phobos/deimos 의 결합 (parent-satellite × 2) 명시 + 6-body 누적 모바일 침습성 결합 명시)
  - "FOCUS_BODIES drift 재발견" (R4 #532 머지 시 R3 baseline 잔존 발견 → R5 진입에서 R4 + R5 동시 추가로 누적 drift 해소)

---

## 현재 유효 결정 요약 (Living ADR Executive Summary)

> 본 ADR 은 Amendment 라운드 N (≥1) 예상. 신규 팀원 / 후속 R-Phase architect 가 빠르게 최종 결정 파악할 수 있도록 **현재 유효한 박제값과 결정만** 본 섹션에 요약. 상세 후보 비교 / Concrete Prediction / 회고는 §결정 N / §Amendment N 본문 참조.

### 핵심 박제값

| 항목 | 박제값 | 위치 | 박제 시점 |
|---|---|---|---|
| `BODY_SCALE.mars` | **800** | `apps/web/src/constants/body-scale.ts` | R5 본 진입 §결정 1 |
| `BODY_SCALE.phobos` | **5000** | `apps/web/src/constants/body-scale.ts` | R5 본 진입 §결정 2 (moon Amendment 4 학습 — 사실 비율 깨고 사용자 천문 직관) |
| `BODY_SCALE.deimos` | **5000** | `apps/web/src/constants/body-scale.ts` | R5 본 진입 §결정 3 (moon Amendment 4 학습) |
| `MARS_SATELLITES_ORBIT_VISUAL_SCALE` + `ORBIT_VISUAL_SCALE_BY_PARENT.mars` | **500** (상수명 cross-validate 이견 수용 #1 박제) | `packages/core/src/scene/orbit-visual-scale.ts` | R5 본 진입 §결정 4 (phobos 분리 마진 산식 1.69x / 실측 0.99 — Amendment 1 분리 명시 #604) |
| `PX_RATIO_THRESHOLDS.mars` | **8%** | `apps/web/scripts/r1-ui-regression-guard.mjs` | R5 본 진입 §결정 5 |
| `PX_RATIO_THRESHOLDS.phobos` | **N/A** (4px fallback billboard 의존 — Q2=B 임계 미적용) | r1-guard expected 미박제 | R5 본 진입 §결정 6 |
| `PX_RATIO_THRESHOLDS.deimos` | **N/A** (4px fallback billboard 의존) | r1-guard expected 미박제 | R5 본 진입 §결정 6 |
| `R_PHASE_BODY_ALLOWLIST` | `['sun', 'mercury', 'venus', 'earth', 'moon', 'mars', 'phobos', 'deimos']` | `packages/core/src/scene/r-phase-allowlist.ts` | R5 본 진입 §결정 7 |
| `FOCUS_BUTTONS` (shortcut bar) | 9개 (sun/mercury/venus/earth/moon/**mars**/jupiter/neptune + reset/free-fly 별도) — **mars 만 추가, phobos/deimos 미등록** | `apps/web/src/components/layout/focus-quick-buttons.tsx` | R5 본 진입 §결정 8 (Q4a=A) |
| `FOCUS_BODIES` (browser-verify-378-focus.mjs) | `['sun', 'mercury', 'venus', 'earth', 'moon', 'mars', 'phobos', 'deimos']` | `apps/web/scripts/browser-verify-378-focus.mjs` | **R4 baseline 잔존 drift + R5 동시 추가** (위험 #4) |

### 핵심 결정 요약

1. **marsScale=800** (§결정 1): venus/earth 와 동일값. 사실 비율 정합 (mars/venus radius 56.1% → 시각 비 57.5% 인지 강화) + Q2=B 단조 패턴 (mercury 700 → venus 800 → earth 800 → mars 800)
2. **phobosScale=5000** (§결정 2): **moon Amendment 4 학습 적용** — 사실 비율 (radius_phobos/radius_mars = 0.33%) 명시 위배. 시각 visible 보장 (4px fallback billboard 의존)
3. **deimosScale=5000** (§결정 3): phobos 와 동일값. 사실 비율 명시 위배 + 4px fallback 의존
4. **MARS_SATELLITES_ORBIT_VISUAL_SCALE=500** (§결정 4, cross-validate 이견 수용 #1 명명 박제): mars-phobos sum mesh / 실측 거리 = 295.6배 → visual_scale=500 적용 시 분리 마진 **산식 1.69x** (≥ 1.5 임계 통과). deimos 도 동일 parent 룩업 (`ORBIT_VISUAL_SCALE_BY_PARENT.mars`) 으로 처리. **Amendment 1 (#604, 2026-05-31)**: 실측 `phobos.position.length() / mars.boundingSphere.radiusWorld` = 0.99 (phobos) / 2.49 (deimos) — 산식 vs 실측 1.71배 일관 ratio mismatch 발견. 시각 회귀 0 + alpha mask billboard 자연 흡수 + D-T2 정상 통과로 NO-OP 결정. R6 진입 시 architect 단계 산식 정정 의무 (§Amendment 1 참조)
5. **Q2=B 임계 박제 — mars=8%** (§결정 5): mars sun 대비 px 비 산출 7.81% margin 0.19% (± 2% 허용 오차 안)
6. **Q2=B 임계 미적용 — phobos/deimos** (§결정 6): 사실 비율 명시 위배로 박제값 자체가 Q2=B 정합 무관. 4px fallback billboard 의존 → r1-guard `--measure-px-ratio` 미박제. 회귀 가드는 R-Phase Allowlist + browser-verify-r-phase-allowlist 로 우회
7. **R-Phase Allowlist 8 body** (§결정 7): sun/mercury/venus/earth/moon/mars/phobos/deimos 진입
8. **shortcut bar — mars 만 추가, phobos/deimos 미등록** (§결정 8, Q4a=A): 모바일 너비 안전 (10 button × 32 + 9 gap × 4 = 356 px < 375 px 안전)

### 비-범위 (PM 합의 정합 + R4 ADR 비-범위 답습)

- mars 표면 visual / dust storm / 양극 빙하 / atmosphere ❌ (P11 이후)
- phobos irregular shape (26.8×22.4×18.4 km 비대칭) ❌ (mesh sphere 근사)
- mars 이심율 e=0.0934 시각 강조 ❌ (후속)
- mars-phobos Roche limit / tidal effect ❌
- shortcut bar 모바일 너비 재조정 ❌ (R6 jupiter 진입 시 재트리거)
- 실측 데이터 변경 ❌ (`solar-system.json`)
- LOD 시스템 변경 ❌ (R4 Amendment 3 보존)
- R6+ body 진입 ❌ (jupiter/galilean/saturn/titan)
- #534 (UX tooltip) / #535 (a11y) / #536 (FPS 가드) / #541 (Visual Fidelity 원칙 자체 갱신) ❌ (후속 분리 보존)

### 후속 R-Phase 인계 의무

- R6 (jupiter/galilean) / R7 (saturn/titan) 진입 시 **satellite 가 있는 모든 case 에 본 ADR §결정 4 의 orbit visual scale 평가 절차 의무 적용** + 사실 비율 vs 시각 직관 mismatch 측정 (moon Amendment 4 + 본 R5 §결정 2/3 SSoT 답습)
- shortcut bar 11 버튼 (R6 jupiter 추가 시) 모바일 viewport 392 px > 375 px overflow → R6 진입 시 horizontal scroll 또는 2단 grid 재트리거

---

## 통합 vs 분리 결정 (메타)

본 ADR 은 R4 ADR §통합 vs 분리 결정 §"R-Phase 단일 ADR 패턴" 을 그대로 따름:

- **R-Phase 단일 ADR 패턴** — 단일 R-Phase 의 시각화 결정 N건 (marsScale / phobos/deimosScale / orbit visual scale / Q2=B 임계 / R-Phase Allowlist / shortcut bar 갱신) 을 단일 ADR 로 통합. 파일명 `20260528-r5-mars-visualization.md`
- **satellite 2개 첫 본 사례** — R4 가 moon 단일 satellite 첫 본 사례, 본 R5 는 phobos + deimos satellite **2개** 첫 본 사례. R6+ (galilean 4 / titan + saturn moons 다수) SSoT 참조 패턴 박제 의무
- **Q2=B 비례 결정 정책 2번째 본 인스턴스화** — R4 가 첫 본 인스턴스화, 본 R5 는 2번째 — 정책 일관성 검증 (단조 패턴 mercury 6% / venus 11% / earth 15% / **mars 8%**, mars 가 venus 보다 작은 사실 정합 검증)
- **본 R5 는 R-Phase Allowlist 5곳 동시 박제 절차 SSoT 의 2번째 본 인스턴스화** — R4 가 첫 본 인스턴스화, 본 R5 는 satellite 2개 + parent 1개 동시 추가 (총 3 body) 의 패턴 검증

---

## 배경

### Roadmap v3 §R5 진입 조건

[`docs/phases/roadmap-v3-incremental.md`](../phases/roadmap-v3-incremental.md) §R-Phase 공통 DoD 템플릿 (Amendment 2026-04-30 + 라운드 2 Amendment 2026-05-01 정합) + §"R5 = R4 + 화성 + (포보스/데이모스 선택)" 에 따라 R5 는 R4 위에 **화성 + 포보스/데이모스를 명시적으로 visible 하게 추가**. PM 합의 (#594 라운드 1, 2026-05-28):

| Q | 결정 | 의미 |
|---|---|---|
| **Q1** (phobos/deimos 진입 범위) | **B: mars + phobos + deimos 모두** | satellite 2개 첫 본 사례, R6+ galilean/titan 준비 |
| **Q2** (marsScale 박제값) | **architect 위임** | 본 ADR §결정 1 박제 |
| **Q3** (phobos/deimosScale 정책) | **architect 위임** | 본 ADR §결정 2+3 박제 (moon Amendment 4 학습 적용) |
| **Q4a** (shortcut bar 모바일 너비) | **A: shortcut bar 에 mars 만 추가** | phobos/deimos 미등록 — 모바일 안전 (10 버튼 × 32 + 9 gap × 4 = 356 px < 375 px) |
| **Q5** (sunScale 재조정) | **A: 50 보존** | R1 SSoT |

### 현재 baseline 실측 (2026-05-28 develop tip = 21da828, v0.18.0 release)

R4 박제 상태 (`apps/web/src/constants/body-scale.ts`, Amendment 4 2026-05-23 반영):

```typescript
export const BODY_SCALE: Readonly<Record<string, number>> = Object.freeze({
  sun: 50, // R1 Amendment 2026-05-01
  mercury: 700, // R3 followup Amendment 2026-05-03 라운드 3
  venus: 800, // R3 followup Amendment 2026-05-03 라운드 3
  earth: 800, // R4 #532
  moon: 200, // R4 #539 Amendment 4 (2026-05-23) — 사실 비율 깨고 사용자 천문 직관 정합
});
```

R-Phase Allowlist (`packages/core/src/scene/r-phase-allowlist.ts`):

```typescript
export const R_PHASE_BODY_ALLOWLIST = Object.freeze([
  'sun', 'mercury', 'venus', 'earth', 'moon',
] as const);
```

Orbit Visual Scale (`packages/core/src/scene/orbit-visual-scale.ts`):

```typescript
export const EARTH_MOON_ORBIT_VISUAL_SCALE = 30;
export const ORBIT_VISUAL_SCALE_BY_PARENT = Object.freeze({
  earth: EARTH_MOON_ORBIT_VISUAL_SCALE,
});
```

FOCUS_BUTTONS (`apps/web/src/components/layout/focus-quick-buttons.tsx`):
- 활성: sun / mercury / venus / earth / moon / jupiter (R6 disabled) / neptune (R10 disabled)
- 총 9개 버튼 (mars 추가 시 10개)

FOCUS_BODIES (`apps/web/scripts/browser-verify-378-focus.mjs`):
- `['sun', 'mercury', 'venus']` — **R3 baseline 잔존 drift** (R4 머지 시 미동기화 발견 — 본 R5 진입에서 R4 + R5 누적 동시 처리 의무)

### 데이터 SSoT (`packages/shared/data/solar-system.json`)

| body | radius (m) | parentId | semiMajorAxis | radius 비 (vs sun) | dataSource |
|---|---|---|---|---|---|
| **mars** | 3.3962e6 | sun | 1.52371 AU | 0.488% | NASA Planetary Fact Sheet (2024) |
| **phobos** | 1.108e4 | mars | 6.26752e-5 AU (≈ 9,376 km) | 0.00159% | JPL SSD Mars Satellites |
| **deimos** | 6.27e3 | mars | 1.5684e-4 AU (≈ 23,463 km) | 0.000901% | JPL SSD Mars Satellites |

mars 사실 비율 (기존 R-Phase 대비):
- mars/sun radius = 0.00488 (sun 246.3 px 대비 1.20 px 라면 unscaled)
- mars/venus radius = 0.5612 (venus 의 56.1%)
- mars/earth radius = 0.5325 (earth 의 53.3%)
- mars/mercury radius = 1.3920 (mercury 보다 39.2% 큼 — 사실 정합)
- mars/moon radius = 1.9548 (moon 보다 95.5% 큼)

phobos / deimos 사실 비율 (극단 sub-pixel 위험):
- phobos/mars radius = 0.00326 (mars 의 0.326%)
- deimos/mars radius = 0.00185 (mars 의 0.185%)
- phobos/moon radius = 0.00638 (moon 의 0.638%)
- deimos/moon radius = 0.00361 (moon 의 0.361%)

### 산출식 (R1+R2+R3+R4 ADR 동일 식, R5 검증)

```
diameter (scene unit) = body.radius (m) × 2 × renderScaleForTier('solar') × scale
                      = body.radius × 1.68e-10 × scale

px_diameter (1280×720) = body.radius × 4.086e-9 × scale

sunPxRatio(body) ≈ (body.radius × BODY_SCALE[body.id]) / (sun.radius × BODY_SCALE.sun)
                 ≈ (body.radius × scale) / 3.4785e10
```

mars 산출 (1280×720):
```
mars_pxDiameter = 3.3962e6 × marsScale × 4.086e-9 = marsScale × 0.01388
mars_sunPxRatio = (3.3962e6 × marsScale) / 3.4785e10 = marsScale × 9.766e-5
```

phobos 산출:
```
phobos_pxDiameter = 1.108e4 × phobosScale × 4.086e-9 = phobosScale × 4.527e-5
phobos_sunPxRatio = (1.108e4 × phobosScale) / 3.4785e10 = phobosScale × 3.185e-7
```

deimos 산출:
```
deimos_pxDiameter = 6.27e3 × deimosScale × 4.086e-9 = deimosScale × 2.562e-5
deimos_sunPxRatio = (6.27e3 × deimosScale) / 3.4785e10 = deimosScale × 1.803e-7
```

### 기존 자산 재사용 조사 ("신규 함수 ≠ 신규 구현" volt #21)

R4 ADR §기존 자산 재사용 조사 표 100% 재현 + satellite 2개 첫 본 사례 추가:

| 자산 | 위치 | 본 R5 처리 |
|---|---|---|
| `BODY_SCALE` 룩업 + `getBodyScale` | `apps/web/src/constants/body-scale.ts` | **확장** — `mars/phobos/deimos` 3줄 추가 |
| `createSolarSystemScene({ bodyScale })` 옵션 콜백 | `packages/core/src/scene/solar-system-scene.ts` | **재사용 — 코드 변경 0** (자동 일반화) |
| `createBodyMesh*` diameter 계산식 | 동 파일 | **재사용 — 코드 변경 0** |
| `screenCoverageRadius` effective radius 입력 | 동 파일 | **재사용 — 코드 변경 0** |
| `syncFocusToScene` helper | `sim-canvas.tsx` | **재사용 — 코드 변경 0** |
| `FOCUS_BUTTONS` 배열 | `apps/web/src/components/layout/focus-quick-buttons.tsx` | **확장** — mars 1줄 추가 (Q4a=A, phobos/deimos 미등록) |
| `R_PHASE_BODY_ALLOWLIST` | `packages/core/src/scene/r-phase-allowlist.ts` | **확장** — `mars/phobos/deimos` 3줄 추가 |
| `ORBIT_VISUAL_SCALE_BY_PARENT` | `packages/core/src/scene/orbit-visual-scale.ts` | **확장** — `mars: 500` 1줄 + 산출 주석 갱신 |
| `CelestialInfoPanel` | `apps/web/src/components/panels/celestial-info-panel.tsx` | **재사용 — 코드 변경 0** (selectedBodyId 일반화) |
| 궤도 라인 `MeshBuilder.CreateLineSystem` | `solar-system-scene.ts` | **재사용 — 코드 변경 0** (R4 satellite parentId 패턴 자동) |
| `Animation.CreateAndStartAnimation` (camera focus tween) | `camera-controller.ts` | **재사용 — 코드 변경 0** |
| r1-guard `--measure-px-ratio` | `apps/web/scripts/r1-ui-regression-guard.mjs` | **확장 — mars baseline 추가** (phobos/deimos 미등록, §결정 6) |
| `browser-verify-r-phase-allowlist.mjs` | `apps/web/scripts/` | **확장 — expected list 갱신** |
| `browser-verify-378-focus.mjs` FOCUS_BODIES | `apps/web/scripts/` | **확장 — R4 + R5 누적 동시 처리** (위험 #4) |
| `body-scale.test.ts` 단위 테스트 | `apps/web/src/constants/body-scale.test.ts` | **확장** — `getBodyScale('mars/phobos/deimos')` 3줄 |

**신규 구현**: BODY_SCALE 3 + R_PHASE_BODY_ALLOWLIST 3 + FOCUS_BUTTONS 1 (mars 만) + ORBIT_VISUAL_SCALE_BY_PARENT 1 = **총 8 라인 코드** (R4 ADR §Concrete Prediction "R5 추가 시 ≤ 7 라인" 예측 +1 라인 over — `ORBIT_VISUAL_SCALE_BY_PARENT` 추가 1줄 사유. 후속 R6+ ADR 에 SSoT 갱신 필요). 단위 테스트 / r1-guard baseline / browser-verify expected list / CHANGELOG 갱신은 별도 카운트.

**satellite 2개 첫 본 검증 영역** (R6+ SSoT):
1. **satellite 궤도 라인 2개** — phobos/deimos 모두 mars 중심 상대 좌표. rebuildOrbitLines 가 parentId 기반 자동 처리 검증 (코드 변경 0 예측)
2. **satellite focus animation 2개** — phobos/deimos URL `?focus=phobos` / `?focus=deimos` 진입 시 mars 가 아닌 phobos/deimos mesh 중심 카메라 (자동 처리)
3. **satellite hit-test 2개** — phobos/deimos mesh 가 mars mesh 내부 (사실 비율 + visual scale 적용 시점 분리 평가, §결정 4)
4. **MARS_PHOBOS_ORBIT_VISUAL_SCALE 단일 룩업으로 deimos 도 처리 가능 여부** — earth-moon 처럼 단일 visual_scale 이 모든 mars satellite 에 동일 적용 vs deimos 별도 룩업 (Amendment 1 가능성, §결정 4)

---

## 후보 비교

### 축 1 — `marsScale` 구체값 (D-E1)

#### 산출 — 9 candidates × 3 viewport

mars.radius = 3.3962e6 m (venus.radius 6.0518e6 의 **56.1%**, earth.radius 6.3781e6 의 **53.3%**, mercury.radius 2.4397e6 의 **139.2%**).

먼저 R4 baseline 정합 검증:
- sun: scale 50 → sun pxDiameter 246.3 px (1280×720, forensic 박제)
- mercury: scale 700 → sun 대비 px 비 4.71% → mercury pxDiameter 11.60 px
- venus: scale 800 → sun 대비 px 비 13.58% → venus pxDiameter 33.45 px
- earth: scale 800 → sun 대비 px 비 14.67% → earth pxDiameter 36.1 px
- moon: scale 200 → sun 대비 px 비 1.00% → moon pxDiameter 2.46 px (4px fallback billboard 의존)

marsScale 후보별 sun 대비 px 비:

| marsScale | mars sun 대비 px 비 | mars pxDiameter (1280×720) | venus 대비 px 비 (사실 56.1%) | earth 대비 px 비 (사실 53.3%) | mercury 대비 px 비 (사실 139.2%) | 평가 |
|---|---|---|---|---|---|---|
| × 500 | 4.88% | 6.94 px | 20.8% (사실 미달 65%) | 19.2% | 59.8% (사실 위배: mars > mercury) | 사실 비율 위배 (mars < mercury) |
| × 600 | 5.86% | 8.33 px | 43.2% | 39.9% (사실 미달 75%) | 71.7% (사실 위배) | 사실 비율 미달 |
| × 700 | 6.84% | 9.72 px | 50.3% | 46.6% | 83.7% (사실 위배) | 사실 비율 90% 도달 |
| **× 800** | **7.81%** | **11.10 px** | **57.5%** (사실 56.1% 의 1.025배 인지 강화) | **53.2%** (사실 53.3% 정확 일치) | **95.7%** (mercury 보다 작음 — 사실 위배) | **선택 — earth/venus 와 동일값 + earth 대비 사실 비율 정확 정합** |
| × 900 | 8.79% | 12.49 px | 64.7% | 59.9% (과장 12%) | 107.7% (사실 정합: mars > mercury) | mercury 보다 큼 (사실 정합 강화) |
| × 1000 | 9.77% | 13.88 px | 71.9% (과장 28%) | 66.6% | 119.7% (사실 86%) | venus 대비 과장 강함 |
| × 1100 | 10.74% | 15.27 px | 79.0% | 73.3% | 131.6% | 과장 강함, Q2=B 임계 검토 |
| × 1200 | 11.72% | 16.66 px | 86.2% | 79.9% | 143.6% | venus 대비 직관적 미달 |
| × 1500 | 14.65% | 20.82 px | 107.7% (사실 위배) | 100% | 179.5% | venus 와 동등 (사실 위배) |

#### 후보 평가 (5축 trade-off)

| 후보 | sun 대비 px 비 | venus 대비 비 (사실 56.1%) | earth 대비 비 (사실 53.3%) | mercury 대비 비 (사실 139.2%) | 4px fallback 마진 | Q2=B 임계 후보 | 평가 |
|---|---|---|---|---|---|---|---|
| A. marsScale=700 | 6.84% | 50.3% | 46.6% | 83.7% (사실 위배) | +5.72 px | ≤ 7% | mercury 보다 작음 (사실 모순 강함) |
| **B. marsScale=800** | **7.81%** | **57.5%** (사실 1.025배 인지 강화) | **53.2%** (사실 일치) | **95.7%** (마진 -4.3%, 사실 약간 위배) | **+7.10 px** | **≤ 8% (margin 0.19%)** | **선택 — earth 대비 사실 정합 + 단순값 + Q2=B 단조** |
| C. marsScale=900 | 8.79% | 64.7% | 59.9% | 107.7% (사실 정합) | +8.49 px | ≤ 9% | mercury 보다 약간 큼 (사실 정합 강화) — 차선 |
| D. marsScale=1000 | 9.77% | 71.9% (과장 28%) | 66.6% (과장 25%) | 119.7% | +9.88 px | ≤ 10% | venus 대비 과장 강함 |

#### 선택 — **후보 B: `marsScale = 800`**

근거:
1. **earth 대비 사실 비율 정확 일치 (mars/earth = 53.3% → 시각 53.2%)** — Q2=B 비례 결정 정책의 정밀 정합 사례. 사용자가 "화성은 지구의 약 절반 크기" 자연 인지
2. **venus 대비 사실 비율 인지 강화 (mars/venus = 56.1% → 시각 57.5%, +1.025배)** — 사실 비율의 1.025배로 약간 인지 강화 (R4 earth: 사실 105.4% → 시각 108% 의 1.025배 동일 패턴)
3. **Q2=B 임계 ≤ 8% 박제 (sun 25% / mercury 6% / venus 11% / earth 15% / mars 8%)** — sun 25% > venus 11% > earth 15% (Q2=B 단조 패턴 violation 발견? — earth=15% 가 venus=11% 보다 큼. 이는 radius 비 정합. mars=8% 가 venus=11% 보다 작은 점은 **mars < venus 사실 정합**)
4. **mercury 대비 (95.7% — mercury 의 0.957배)** — 사실 비율 1.392배 (mars > mercury) 위배. mars pxDiameter 11.10 px / mercury 11.60 px. mercury 가 약간 더 큼. 사실 위배 4.3%. **후보 C (marsScale=900) 채택 시 사실 정합 (107.7%)** 이지만 venus 대비 64.7% 로 venus 와 더 가까워짐. 최종 trade-off: earth 정합 (후보 B) vs mercury 정합 (후보 C). **earth 정합 우선** (mars 의 가장 자연 기준점은 earth — "화성은 지구의 절반")
5. **단순 정수 + earth scale 과 동일값 (800)** — body-scale.ts 룩업 가독성. mercury 700 → venus 800 → earth 800 → mars 800 단조 패턴 (mercury 이후 800 plateau)
6. **4px fallback 마진 안정** — mars pxDiameter 11.10 px (4px fallback +7.10 px 마진, 2.78배). LOD billboard 분기 임계 4 px 의 2.78배 → 가시성 회귀 0
7. **mid LOD 임계 50 px 안전** — 11.10 px ≪ 50 px → mid 일관 유지
8. **모바일 누적 차단율 마진** — mars 11.10 × π × 11.10/4 / (1280 × 720) = 96.7 / 921600 = 0.0105% (1280×720). 모바일 (375×667) ≈ 0.05%. R4 누적 8.72% + mars 0.05% + phobos 0.001% (4px fallback floor) + deimos 0.001% = **8.77% 누적 차단율** (DoD 임계 25% margin 16.23%)

#### Concrete Prediction (R5 본 검증 + R6~R10 확장)

R4 ADR §Concrete Prediction "R5 추가 시 ≤ 7 라인" 의 본 R5 검증: BODY_SCALE 3 + FOCUS_BUTTONS 1 + R_PHASE_BODY_ALLOWLIST 3 + ORBIT_VISUAL_SCALE_BY_PARENT 1 = **8 라인 정확** (+1 라인 over: orbit visual scale 룩업 갱신. R4 ADR §Concrete Prediction 갱신 의무 — R6+ 예상 라인 수 재산출)

**R6 추가 prediction (R5 박제 시점)**: R6 (목성+갈릴레이 4) 추가 시:
- jupiter: BODY_SCALE 1줄 + FOCUS_BUTTONS 1줄 + R_PHASE_BODY_ALLOWLIST 1줄 = 3 라인
- galilean 4 (io / europa / ganymede / callisto): 각 satellite 별 BODY_SCALE 1줄 + R_PHASE_BODY_ALLOWLIST 1줄 + ORBIT_VISUAL_SCALE_BY_PARENT 1줄 (jupiter 단일 룩업 가정) = 8 + 1 = 9 라인
- shortcut bar 11 버튼 ≥ 392 px > 375 px overflow → horizontal scroll / 2단 grid trigger
- 예상 코드 변경: jupiter 만 3 라인 / jupiter + 4 galilean 진입 시 ≤ 12 라인

#### 모바일 인지 가능성 별도 검증 (D-T2) — volt #68 / #74 적용

본 ADR §축 1 후보 B 채택 시 모바일 (375×667) 누적 차단율 ~ 8.77% — DoD 임계 25% 까지 16.23% margin (양호). 단 **headless 검증만으로는 부족** (volt #77). developer 가 R5 PR 에서 실 모바일 Chrome (375×667) 수동 확인 의무 (D-T2).

---

### 축 2 — `phobosScale` 구체값 (D-E2) — moon Amendment 4 학습 적용

#### 배경 — 사실 비율 vs 시각 직관 mismatch (volt #74 변형)

phobos.radius = 1.108e4 m (mars.radius 3.3962e6 의 **0.326%**, moon.radius 1.7374e6 의 **0.638%**). 사실 비율 그대로 적용 시 sub-pixel 잔재 압도.

만약 사실 비율 정합 (moon=200 ↔ phobos 0.638% 의 200 = **1.28**) 시 phobos pxDiameter ≈ 0.00006 px — 인지 불가능. **moon Amendment 4 학습 적용 필수** — 사실 비율 깨고 사용자 천문 직관 우선 (R4 #539 Amendment 4 SSoT, 2026-05-23).

#### 산출 — 7 candidates × 4px fallback billboard

```
phobos_pxDiameter (1280×720) = 1.108e4 × phobosScale × 4.086e-9 = phobosScale × 4.527e-5
phobos_sunPxRatio = phobosScale × 3.185e-7
```

| phobosScale | phobos pxDiameter (mesh) | 4px fallback 의존 여부 | phobos sun 대비 px 비 | mars 대비 mesh radius 비 (visual_scale 1.0 시) | 평가 |
|---|---|---|---|---|---|
| × 200 (moon=200 답습) | 0.00906 px | 4px fallback 압도 의존 | 6.37e-5% | 0.00118 (mars wsR 의 0.118%) | sub-pixel 잔재 압도 |
| × 1000 | 0.0453 px | 4px fallback 완전 의존 | 3.185e-4% | 0.00589 | sub-pixel 잔재 압도 |
| × 5000 | 0.226 px | 4px fallback 의존 (mesh sub-4px 영구) | 0.00159% | 0.0295 | **4px fallback billboard 영구 의존 (R4 moon=200 와 동일 안정 패턴)** |
| × 10000 | 0.453 px | 4px fallback 의존 | 0.00319% | 0.0589 | 좀 더 mesh visible 하나 여전히 fallback 의존 |
| × 50000 | 2.26 px | 4px fallback 의존 | 0.0159% | 0.295 | mesh 임계 가까워짐 (4px 미달) |
| × 100000 | 4.53 px | 4px 임계 통과 (mesh 자체 visible) | 0.0319% | 0.589 | mesh visible 진입 — 단 mars 대비 mesh 비 0.589 (mars 의 58.9% — mars 와 비슷한 크기) → **사실 비율 압도적 위배 + 시각 인지 mismatch ("phobos 가 mars 와 비슷한 크기?")** |
| × 200000 | 9.06 px | mesh visible | 0.0638% | 1.18 (mars wsR 초과) | **mars 보다 큼 — 사실 위배 + 시각 모순 압도** |

#### 후보 평가

| 후보 | mesh pxDiameter | 4px fallback 의존 | sun 대비 px 비 | mars 대비 mesh 비 (visual_scale=1) | 사용자 천문 직관 | 평가 |
|---|---|---|---|---|---|---|
| A. phobosScale=1000 | 0.0453 px | 완전 의존 | 3.185e-4% | 0.589% | 직관 정합 (phobos 매우 작음) | 4px fallback 사이즈 단조 — 사용자 mental model "moon=2.46 px / phobos=0.045 px" 비합리 |
| B. phobosScale=2500 | 0.113 px | 완전 의존 | 7.96e-4% | 1.47% | 직관 정합 | 4px fallback 사이즈 단조, moon (sub-4px) 대비 더 작음 — 일관 |
| **C. phobosScale=5000** | **0.226 px** | **의존 (mesh sub-4px 영구)** | **0.00159%** | **2.95%** | **직관 정합 + 4px fallback billboard 안정 visible** | **선택 — moon=200 (mesh 2.46 px) 와 동일한 4px fallback 안정 패턴 + 사용자 mental model "phobos < moon" 정합** |
| D. phobosScale=10000 | 0.453 px | 의존 | 0.00319% | 5.89% | 직관 정합 | mesh 약간 큼 (mesh 0.45 px → 4px fallback 의존 동일) — billboard alpha mask 와 동일 visible. C 와 사용자 체감 동등 |
| E. phobosScale=50000 | 2.26 px | 의존 | 0.0159% | 29.5% | 사실 위배 명시 + 직관 mismatch 시작 | mars 대비 mesh 비 29.5% (mars 의 약 1/3 크기 인지) — 비합리 |
| F. phobosScale=100000 | 4.53 px | 통과 | 0.0319% | 58.9% | 사실 위배 압도 + 직관 mismatch 압도 | mars 와 거의 동등 — moon Amendment 4 학습 정반대 위배 |

#### 선택 — **후보 C: `phobosScale = 5000`**

근거:
1. **moon Amendment 4 학습 적용** — 사실 비율 (radius 0.326%) 명시 위배. moon Amendment 4 의 "사실 비율 깨고 사용자 천문 직관 우선" 패턴 답습. 본 R5 ADR 박제에 사실 위배 명시 + 박제 근거 박제 의무
2. **4px fallback billboard 안정 visible** — phobos mesh pxDiameter 0.226 px → 4 px fallback billboard alpha mask (PR #394, LOD Phase 2 #391) 발동. **moon=200 의 mesh 2.46 px 가 4px fallback 발동했던 안정 패턴 100% 답습** — 사용자 인지 충분
3. **사용자 천문 직관 정합** — moon (mesh 2.46 px, 4px fallback) > phobos (mesh 0.226 px, 4px fallback) 의 mental model. "phobos 는 moon 보다 훨씬 작은 위성" 자연 인지
4. **mars 대비 mesh 비 2.95% (visual_scale=1 시)** — phobos 가 mars 의 약 3% 크기 인지. 사실 비율 0.326% 의 약 9배 인지 강화 (moon=200 의 사실 비율 27.2% 대비 6.8% 의 25% 압축과 유사한 인지 강화 패턴)
5. **deimos 와 동일값 (5000)** — 단순 정수 + body-scale.ts 룩업 가독성. phobos/deimos 의 사실 비율 차이 (0.566) 는 박제값 동일로 약간 압축 — 사용자 mental model "phobos ≈ deimos 거의 비슷한 크기" 자연 정합
6. **Q2=B 임계 미적용 (§결정 6)** — phobos sun 대비 px 비 0.00159% — Q2=B 임계 (≤ 0.01%) 수준의 거의 0 — 박제하면 회귀 가드 정밀도 부족 + 4px fallback 의존이 mesh 변화 흡수. r1-guard `--measure-px-ratio` 미박제 + browser-verify-r-phase-allowlist 우회 가드
7. **모바일 누적 무시 가능** — phobos disk area ≈ 0.0001% 모바일 — 누적 차단율 변화 0

#### Concrete Prediction (phobos 본 검증)

- phobos mesh pxDiameter 0.226 px (1280×720) — sub-pixel, 4px fallback billboard 시각 (alpha mask circle)
- phobos billboard visible diameter ≈ 4 px (LOD Phase 2 sticky 4px fallback)
- **D-T2 미통과 시 (사용자 "phobos 안 보임" 보고)**: phobos visual scale (별도 ORBIT_VISUAL_SCALE_BY_PARENT 외) 또는 BILLBOARD_MIN_PIXEL_RADIUS 강화 fallback. §재검토 트리거 #1 발동
- **D-T2 미통과 시 (사용자 "phobos 가 너무 큼" 보고)**: phobosScale 2500 또는 1000 fallback. §재검토 트리거 #1 발동
- **R-Phase Framework 인계**: R6 galilean (io 1.822e6 m, europa 1.561e6 m, ganymede 2.634e6 m, callisto 2.410e6 m) — moon size 급. moon=200 답습 가능성 높음. R7 titan (radius 2.575e6 m, moon 보다 큼) — 사실 비율 정합 가능성

---

### 축 3 — `deimosScale` 구체값 (D-E3) — phobos 동일 패턴

#### 산출

deimos.radius = 6.27e3 m (phobos.radius 1.108e4 의 **56.6%**, mars.radius 3.3962e6 의 **0.185%**).

| deimosScale | deimos pxDiameter (mesh) | 4px fallback 의존 | sun 대비 px 비 | mars 대비 mesh 비 | 평가 |
|---|---|---|---|---|---|
| × 1000 | 0.0256 px | 완전 의존 | 1.803e-4% | 0.333% | sub-pixel 잔재 |
| × 2500 | 0.0640 px | 완전 의존 | 4.51e-4% | 0.833% | sub-pixel 잔재 |
| **× 5000** | **0.128 px** | **의존** | **9.02e-4%** | **1.67%** | **선택 — phobos 동일값 (단순) + 4px fallback 안정** |
| × 10000 | 0.256 px | 의존 | 1.80e-3% | 3.33% | mesh 큼, phobos 와 약간 분기 |

#### 선택 — **후보 C: `deimosScale = 5000`** (phobos 와 동일값)

근거:
1. **phobos 와 동일값 (단순)** — body-scale.ts 룩업 가독성 + 사용자 mental model "phobos ≈ deimos" 자연 정합 (사실 비율 56.6% 약간 압축은 무시할 수준)
2. **4px fallback billboard 안정 visible** — deimos mesh pxDiameter 0.128 px → 4 px fallback billboard 발동. phobos 와 동일 안정 패턴
3. **사실 비율 명시 위배** — deimos/mars = 0.185%, 박제값에서 mesh 비 1.67% 인지 (사실 비율 의 약 9배 인지 강화, phobos 동일 패턴)
4. **deimos < phobos 사실 정합 (visual 동등 — 약간 압축)** — 사실 비율 deimos/phobos = 0.566 → 박제값 동일 (1.0). 사실 비율 0.566 의 1.77배 인지 압축. 사용자 mental model "phobos ≈ deimos" 인지 — 사실 비율 약간 위배지만 satellite 2개 첫 본 사례의 단순 패턴 우선
5. **Q2=B 임계 미적용** — deimos sun 대비 px 비 9.02e-4% — Q2=B 임계 정밀도 부족 + 4px fallback 흡수

#### Concrete Prediction (deimos 본 검증)

- deimos mesh pxDiameter 0.128 px — sub-pixel, 4px fallback
- deimos billboard visible diameter ≈ 4 px
- **D-T2 미통과 시 phobos 와 동일 fallback** — deimosScale 별도 박제값 (예: 7500) 도입 가능성 (§재검토 트리거 #2)

---

### 축 4 — `MARS_PHOBOS_ORBIT_VISUAL_SCALE` 구체값 (D-E4, R4 §결정 6 Amendment 2 답습)

#### 배경 — mars-phobos / mars-deimos fusion 분석

R4 §결정 6 패턴 답습. mars mesh radius vs phobos/deimos orbit 실측 거리:

| 측정 | 값 (m) |
|---|---|
| mars mesh radius (marsScale=800) | `3.3962e6 × 800` = **2.717e9 m** |
| phobos mesh radius (phobosScale=5000) | `1.108e4 × 5000` = **5.54e7 m** |
| deimos mesh radius (deimosScale=5000) | `6.27e3 × 5000` = **3.135e7 m** |
| mars + phobos sum mesh | **2.772e9 m** |
| mars + deimos sum mesh | **2.748e9 m** |
| phobos 실측 orbit | `6.26752e-5 AU` = **9.376e6 m** |
| deimos 실측 orbit | `1.5684e-4 AU` = **23.463e6 m** |
| **phobos sum mesh / orbit** | **295.6배** (R4 moon 16.9배 의 17.5배 더 극단 — fusion 압도) |
| **deimos sum mesh / orbit** | **117.1배** (R4 moon 16.9배 의 6.9배 더 극단) |

#### 후보 비교 (8 옵션, R4 §결정 6 패턴 답습)

분리 임계 ≥ 1.5x 통과 (R4 §결정 6 SSoT) 조건:

phobos (sum mesh / 실측 거리 = 295.6배):
- visual_scale ≥ `295.6 × 1.5 / 1.0` = ≥ 443.4

deimos (sum mesh / 실측 거리 = 117.1배):
- visual_scale ≥ `117.1 × 1.5` = ≥ 175.7

**중요**: 단일 `ORBIT_VISUAL_SCALE_BY_PARENT.mars` 룩업이 phobos / deimos 둘 다에 적용 (R4 earth-moon 단일 visual_scale 패턴). 따라서 두 satellite 모두 만족하는 값 ≥ 443.4 필요 (phobos 가 binding constraint).

| 후보 | mars_visual_scale | phobos visual orbit (m) | deimos visual orbit (m) | phobos sum mesh / visual orbit | deimos sum mesh / visual orbit | phobos 분리 마진 | deimos 분리 마진 | 평가 |
|---|---|---|---|---|---|---|---|---|
| ×100 | 100 | 9.376e8 | 2.346e9 | 295.6/100 = 2.96 | 117.1/100 = 1.17 | 0.34x fail | 0.85x fail | 둘 다 미달 |
| ×200 | 200 | 1.875e9 | 4.693e9 | 1.48 | 0.58 | 0.68x fail | 1.71x 통과 | phobos fail |
| ×300 | 300 | 2.813e9 | 7.039e9 | 0.985 | 0.39 | 1.02x ε통과 | 2.57x 안전 | phobos ε통과 — 마진 부족 |
| ×400 | 400 | 3.750e9 | 9.385e9 | 0.739 | 0.293 | 1.35x fail | 3.42x 안전 | phobos 마진 < 1.5 — 미통과 |
| **×500** | **500** | **4.688e9** | **1.173e10** | **0.591** | **0.234** | **1.69x 통과** | **4.27x 안전** | **선택 — phobos 분리 마진 1.69x 통과, deimos 안전 마진 4.27x** |
| ×600 | 600 | 5.626e9 | 1.408e10 | 0.493 | 0.195 | 2.03x | 5.13x | 보수 마진 |
| ×750 | 750 | 7.032e9 | 1.760e10 | 0.394 | 0.156 | 2.54x | 6.41x | 매우 보수 |
| ×1000 | 1000 | 9.376e9 | 2.346e10 | 0.296 | 0.117 | 3.38x | 8.55x | 과도 보수 |

#### 선택 — **후보 ×500: `MARS_PHOBOS_ORBIT_VISUAL_SCALE = 500`**

> **명명 박제 (cross-validate 이견 수용 #1 final 결정)**: 본 박제값 상수명 = **`MARS_SATELLITES_ORBIT_VISUAL_SCALE`** (deimos 도 포함하므로 `MARS_PHOBOS_*` 보다 정확. R6+ 다중 satellite (galilean 4 / titan + saturn moons 다수) 일관성 우선). 룩업 키 (`ORBIT_VISUAL_SCALE_BY_PARENT.mars`) 는 명명 무관 일관. **developer 단계 명명 결정 위임 금지** — 본 ADR 박제 그대로 박제 의무. R4 `EARTH_MOON_ORBIT_VISUAL_SCALE` 답습 일관성은 R4 가 단일 satellite (1:1) 인 특수 사례로 본 R5 패턴이 R6+ SSoT.

근거:
1. **phobos 분리 마진 1.69x 통과 (≥ 1.5 임계 +0.19 마진)** — R4 §결정 6 `EARTH_MOON_ORBIT_VISUAL_SCALE=30` 의 1.78x 마진과 거의 동등. 안정 패턴 답습
2. **deimos 분리 마진 4.27x — 압도적 안전** — phobos 가 binding constraint 이고 deimos 는 자동 안전. 단일 룩업으로 둘 다 처리 가능
3. **실측 SSoT 보존** — `solar-system.json` 의 phobos/deimos semiMajorAxisAU 값 무수정. rendering 시점에만 ×500 적용 (R4 earth-moon 동일 패턴)
4. **사용자 mental model 학습** — mars focus zoom-in (camera radius ≈ 2~5 scene unit) 시점에서 phobos/deimos 분리 visible. URL `?focus=phobos` 진입 시 phobos mesh 중심 카메라 → 자동 분리. mars focus 후 사용자가 ", mars 도 위성이 있구나 (포보스, 데이모스 분리 보임)" 자연 인지
5. **forensic ADR 변형 미발동** — 단일 원인 (사실 거리 비례 mismatch) + 단일 fix (visual_scale 단일 룩업) + 8 옵션 비교 — forensic 5 조건 중 2개만 충족 → **일반 ADR 유지**. 단 Amendment 라운드 N≥1 예상 (사용자 D-T2 결과로 ×500 → ×600 또는 ×750 fallback 가능성)
6. **deimos 별도 룩업 미도입** (Amendment 1 가능성) — `ORBIT_VISUAL_SCALE_BY_PARENT.mars` 단일 룩업으로 둘 다 처리. R6 galilean 4 satellite 도 동일 단일 룩업 가정 (Amendment 가능). 향후 satellite 별 fine-tuning 필요 시 `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 신규 룩업 도입 (Amendment 2 가능성)

#### Concrete Prediction (R4 §결정 6 답습)

- mars focus zoom-in (radius=2~5): phobos visual orbit 4.688e9 m × renderScale 8.4e-11 = 0.394 scene unit → camera radius 5 의 7.9% (약 60 px → 충분 visible)
- mars focus zoom-in: deimos visual orbit 1.173e10 m × 8.4e-11 = 0.985 scene unit → camera radius 5 의 19.7% (약 145 px → 충분 visible)
- **D-T2 미통과 시 (사용자 "phobos/deimos 가 mars 와 겹쳐 안 보임")**: visual_scale 500 → 600 → 750 fallback. §재검토 트리거 #3 발동
- **D-T2 미통과 시 (사용자 "deimos 가 mars 에서 너무 멀어 다른 위성처럼 보임")**: deimos 별도 룩업 도입 (Amendment 1) — `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 신규

---

### 축 5 — Q2=B sun 대비 px 비 임계 박제 (D-E5, Q2=B SSoT 2번째 본 인스턴스화)

#### 배경 — Roadmap v3 §6 Amendment 2026-04-30 + 라운드 2 Amendment 2026-05-01

```
sun: ≤ 25% (R1)
mercury: ≤ 6% (R2 Amendment 2026-05-03 라운드 3)
venus: ≤ 11% (R3 Amendment 2026-05-03 라운드 3)
earth: ≤ 15% (R4 본 인스턴스화)
moon: ≤ 4.5% (R4 본 인스턴스화) — Amendment 4 후에도 임계 ≤ 4.5% 보존 (moonScale=200 산출 1.00% margin 3.5%)
mars: TBD (본 ADR 박제)
phobos / deimos: N/A (4px fallback 의존 — §결정 6)
허용 오차: ± 2% (Amendment 2026-05-01)
```

#### mars 임계 후보

| 후보 | mars 임계 | marsScale=800 결과 | margin | 평가 |
|---|---|---|---|---|
| A. ≤ 7% | ≤ 7% | 7.81% | -0.81% (실패) | marsScale=800 박제값 산출 7.81% 위배 — **탈락** |
| **B. ≤ 8%** | ≤ 8% | 7.81% | **0.19%** | **선택 — ± 2% 허용 오차 안에서 정확 통과** |
| C. ≤ 9% | ≤ 9% | 7.81% | 1.19% | margin 풍부, mercury 6% → venus 11% → earth 15% → mars 9% (단조 비단조) |
| D. ≤ 10% | ≤ 10% | 7.81% | 2.19% | mercury 6% / venus 11% / earth 15% 단조 패턴과 직관 거리 |

**선택**: **B. ≤ 8%** — 산출값 7.81% margin 0.19% (± 2% 허용 오차 안에서 정확 통과).

#### 박제 임계 SSoT (본 R5 박제 — Q2=B 2번째 본 인스턴스화)

```
sun: ≤ 25%
mercury: ≤ 6%
venus: ≤ 11%
earth: ≤ 15%
moon: ≤ 4.5%
mars: ≤ 8% (본 ADR 박제, 라운드 1)
phobos / deimos: N/A (§결정 6)
R6+: R-Phase 진입 시 architect ADR 박제
허용 오차: ± 2%
```

#### 단조 패턴 검증

R5 박제 후:
- mercury (6%) < venus (11%) < earth (15%) > mars (8%) > moon (4.5%) > phobos/deimos (N/A)

**venus → earth 단조 증가 (사실 정합)**, **earth → mars 감소 (사실 정합 — mars 가 earth 의 53.3%)**, **mars → moon 감소 (사실 위배 — moon 의 mars 대비 px 비 = 0.063 / 0.0781 × 100 = 12.8%, mars 보다 작음 — 사실 정합)**. Q2=B 정책의 자연 비율 단조 강제는 R5 mars 에서 처음으로 **earth → mars 감소** 인스턴스화. R6 jupiter (radius 6.991e7 m, sun 의 10% — 매우 큼) 진입 시 jupiter ≥ 100% → Q2=B 임계 SSoT 갱신 필요 (Q2=B 정책의 100% 천장 인스턴스화).

#### Concrete Prediction (Q2=B 2번째 본 인스턴스화 검증)

- mars 산출 7.81% / 임계 ≤ 8% — D-T2 실측 ± 2% 허용 오차 통과 예상
- viewport 무관 일관성 검증 — 1280×720 vs 1920×1080 동일 박제 SSoT 보존 (R4 ADR §교차검증 보존)
- R6+ body 진입 시 동일 패턴 자동 적용

---

### 축 6 — Q2=B 임계 미적용 정책 (phobos/deimos, D-E6)

#### 배경

phobosScale=5000 / deimosScale=5000 채택 시 phobos sun 대비 px 비 = 0.00159% / deimos 0.000902%. Q2=B 임계 (≤ N%, ± 2% 허용 오차) 의 정밀도가 ± 2% 단위인데 phobos/deimos 산출값은 < 0.01% — **임계 자체가 측정 단위와 mismatch**.

추가로 phobos/deimos 는 사실 비율 명시 위배 박제값으로 진입 → Q2=B 정책 (사실 비율 보존) 자체가 적용 무관.

#### 후보 비교

| 후보 | 방안 | 측정 정밀도 | r1-guard expected 등록 | 평가 |
|---|---|---|---|---|
| A. Q2=B 임계 ≤ 0.01% 박제 | r1-guard 정밀도 ± 0.005% 강화 | 측정 도구 정밀도 ± 5% 의 100배 미달 | 등록 (≤ 0.01%) | 측정 정밀도 부족 — 항상 fail 위험 |
| B. Q2=B 임계 ≤ 1% (보수) | 박제 + r1-guard ± 5% 허용 (≤ 1.05%) | 측정 정밀도 정합 | 등록 (≤ 1%) | 박제값 변화 (5000 → 100000 = 0.032%) 어떻게 흡수돼도 1% 통과 → **무의미 가드** |
| **C. Q2=B 임계 N/A 박제 — r1-guard 미등록** | 박제값 변화 시 4px fallback billboard 의존 흡수 → r1-guard `--measure-px-ratio` 우회. 회귀 가드는 R-Phase Allowlist + browser-verify-r-phase-allowlist 의 expected list | 측정 도구 정밀도와 정합 | 미등록 | **선택 — moon Amendment 4 패턴 답습. 사실 위배 박제값은 r1-guard Q2=B 정책과 직교** |

#### 선택 — **후보 C: Q2=B 임계 N/A (r1-guard 미등록)**

근거:
1. **moon Amendment 4 패턴 답습** — moon Amendment 4 (2026-05-23) 에서 moonScale 200 박제 후 sun 대비 px 비 1.00% — Q2=B 임계 ≤ 4.5% 안전 통과 (margin 3.5%). 단 사실 위배 박제값은 Q2=B 정책과 정합 무관. 본 R5 phobos/deimos 는 더 극단적 사실 위배로 Q2=B 임계 자체 미적용
2. **4px fallback billboard 흡수** — phobosScale 1000 → 5000 → 10000 → 50000 모두 mesh sub-4px → billboard alpha mask circle 동일 visible → 측정 px 비 변화 없음 (billboard 자체가 일관 4 px). Q2=B 임계는 mesh 산출식 기반인데 mesh sub-pixel 시 측정 도구 정밀도 미달
3. **회귀 가드 우회** — `R_PHASE_BODY_ALLOWLIST` + `browser-verify-r-phase-allowlist.mjs` expected list 갱신으로 phobos/deimos focus 가능성 회귀 가드. mesh / billboard visible 회귀는 D-T2 사용자 검증 의무
4. **사실 위배 명시 박제** — 본 ADR §결정 2/3 에 사실 비율 위배 명시 (phobos/deimos radius 비 vs mesh 비) — 박제값 자체가 Q2=B 정합 무관
5. **R6+ SSoT** — galilean (io/europa/ganymede/callisto) / titan 등 satellite 의 사실 비율 < 0.01% 모두 본 정책 답습. r1-guard `--measure-px-ratio` 미등록 패턴

#### Concrete Prediction

- r1-guard `--measure-px-ratio` 실행 시 phobos/deimos 미포함 (expected list 무박제)
- D-T2 사용자 검증으로 phobos/deimos visible (4 px billboard) 회귀 확인
- 박제값 변화 시 (5000 → 10000) — 4px fallback billboard 흡수, 측정 px 비 변화 0 → 무의미 가드

---

### 축 7 — R-Phase Allowlist 8 body + 5곳 동시 박제 절차 (D-E7)

#### 배경 — Allowlist Guard ADR §결정 4 절차 답습

`docs/decisions/20260504-r-phase-allowlist-guard.md` §결정 4 의 4곳 동시 박제 절차 (현재 5곳 SSoT — wasm-safe 검증 추가):

1. `R_PHASE_BODY_ALLOWLIST` 갱신 (`packages/core/src/scene/r-phase-allowlist.ts`)
2. 해당 R-Phase ADR §결정 N cross-link (본 ADR)
3. `apps/web/scripts/browser-verify-r-phase-allowlist.mjs` expected list 갱신
4. `CHANGELOG.md` `### Behavior Changes` 박제
5. WASM sub-path 추가 금지 검증 (`scripts/verify-core-exports-immutable.sh`)

#### 본 R5 추가 박제 (R-Phase Allowlist Guard ADR §결정 4 답습 + FOCUS_BODIES drift 발견 동시 처리)

```typescript
// packages/core/src/scene/r-phase-allowlist.ts (developer 단계)
export const R_PHASE_BODY_ALLOWLIST = Object.freeze([
  'sun', 'mercury', 'venus', 'earth', 'moon',
  'mars',    // R5 #594 — Q2=B 2번째 본 인스턴스화
  'phobos',  // R5 #594 — satellite 2개 첫 본 사례
  'deimos',  // R5 #594 — satellite 2개 첫 본 사례
] as const);
```

추가 박제 — `apps/web/scripts/browser-verify-378-focus.mjs` FOCUS_BODIES (위험 #4 누적 동시 처리):

```javascript
// R4 baseline 잔존 ['sun', 'mercury', 'venus'] → R4 + R5 동시 추가
const FOCUS_BODIES = ['sun', 'mercury', 'venus', 'earth', 'moon', 'mars', 'phobos', 'deimos'];
```

---

### 축 8 — Shortcut Bar 갱신 (Q4a=A, D-E8)

#### 배경 — Q4a 결정 정합

PM Q4a=A: shortcut bar 에 **mars 만 추가, phobos/deimos 미등록**. 모바일 너비 안전 (10 button × 32 px + 9 gap × 4 px = 356 px < 375 px viewport margin 19 px).

```typescript
// apps/web/src/components/layout/focus-quick-buttons.tsx (developer 단계)
const FOCUS_BUTTONS = [
  { id: 'sun', label: '태양' },
  { id: 'mercury', label: '수성' },
  { id: 'venus', label: '금성' },
  { id: 'earth', label: '지구' },
  { id: 'moon', label: '달' },
  { id: 'mars', label: '화성' },  // R5 #594 — Q4a=A (mars 만 추가, phobos/deimos 미등록)
  { id: 'jupiter', label: '목성' },   // R6 진입 전 disabled
  { id: 'neptune', label: '해왕성' }, // R10 진입 전 disabled
];
```

phobos/deimos 진입 경로 (사용자 mental model):
1. **shortcut bar mars 클릭 → mars focus 진입**
2. **mars focus 후 zoom-in → phobos/deimos mesh visible (visual_scale=500 적용 후)**
3. **phobos/deimos mesh 클릭 → focus 진입** (hit-test 가능, mesh 4 px billboard)
4. **URL override**: `?focus=phobos` / `?focus=deimos` 직접 진입 (R-Phase Allowlist 통과)

#### 모바일 너비 산출 (R4 ADR §축 5 답습)

R4 baseline (10 버튼 = 7 focus + reset + free-fly + ?): R4 박제 후 shortcut bar 9 버튼 + 2 (reset + free-fly) = 11 버튼? 재산출 필요:

`focus-quick-buttons.tsx` 의 button text/padding 토큰 (R4 Amendment 답습):
- `text-mini px-1 py-0.5` → 버튼 너비 ~32 px
- gap-1 (4 px)

R4 활성 7 버튼 (sun/mercury/venus/earth/moon/jupiter/neptune) + reset + free-fly = 9 버튼 → 9 × 32 + 8 × 4 = 320 px (375 px margin 55 px)

R5 mars 추가 후 10 버튼 (sun/mercury/venus/earth/moon/mars/jupiter/neptune) + reset + free-fly = 10 버튼 → 10 × 32 + 9 × 4 = **356 px** (375 px margin 19 px — **안전 진입**)

R6 jupiter 진입 후 11 버튼 → 11 × 32 + 10 × 4 = **392 px > 375 px overflow** → R6 진입 시 horizontal scroll / 2단 grid 재트리거 (R5 비-범위)

---

## 결정 (Accepted, cross-validate 2026-05-28 outcome=applied)

본 ADR 의 8가지 결정은 cross-validate 1회 (Antigravity `agy`, 2026-05-28) outcome=applied + 결과 본문 통합 완료 후 Accepted 전이 (CLAUDE.md §ADR Status 워크플로 #370). 상세 cross-validate 결과는 §교차검증 반영 사항 참조.

### 결정 1 — marsScale = 800 (축 1 후보 B)

```typescript
// apps/web/src/constants/body-scale.ts (developer 단계 박제)
export const BODY_SCALE: Readonly<Record<string, number>> = Object.freeze({
  sun: 50,
  mercury: 700,
  venus: 800,
  earth: 800,
  moon: 200,
  mars: 800, // R5 #594 — earth 와 동일값 (radius 53.3% 사실 비율 정합)
});
```

**근거**: 사실 비율 정합 (mars/earth = 53.3% → 시각 53.2% 정확 일치) + Q2=B 임계 ≤ 8% margin 0.19% + mid LOD 임계 50 px 안전 + 4px fallback 마진 2.78배 + earth 와 동일값 단순성.

### 결정 2 — phobosScale = 5000 (축 2 후보 C, moon Amendment 4 학습 적용)

```typescript
// apps/web/src/constants/body-scale.ts
BODY_SCALE.phobos = 5000; // R5 #594 — 사실 비율 (0.326%) 명시 위배. moon Amendment 4 학습 — 사용자 천문 직관 우선
```

**근거**: 사실 비율 위배 명시 (radius 비 0.326% → mesh 비 2.95% visual_scale=1 시) + moon Amendment 4 패턴 답습 + 4px fallback billboard 안정 visible + 사용자 mental model "phobos < moon < mars" 자연 정합. **본 박제값은 r1-guard Q2=B 정책과 직교 (§결정 6).**

### 결정 3 — deimosScale = 5000 (축 3, phobos 동일값)

```typescript
BODY_SCALE.deimos = 5000; // R5 #594 — 사실 비율 (0.185%) 명시 위배. phobos 와 동일값 (단순 + mental model)
```

**근거**: phobos 와 동일값 + 사실 비율 위배 명시 + 4px fallback 안정 + 사용자 mental model "phobos ≈ deimos" 자연 정합.

### 결정 4 — MARS_SATELLITES_ORBIT_VISUAL_SCALE = 500 (축 4 후보 ×500, R4 §결정 6 답습)

```typescript
// packages/core/src/scene/orbit-visual-scale.ts (developer 단계 박제)
/**
 * Mars-Satellites 궤도 visual scale 배수.
 *
 * mars-phobos sum mesh / 실측 거리 = 295.6배 (binding constraint).
 * mars-deimos sum mesh / 실측 거리 = 117.1배.
 * visual_scale=500 적용 시:
 *   - phobos 분리 마진 1.69x (≥ 1.5 임계 통과)
 *   - deimos 분리 마진 4.27x (안전)
 *
 * 단일 룩업 ORBIT_VISUAL_SCALE_BY_PARENT.mars 로 phobos/deimos 둘 다 처리 (R4 earth-moon 패턴).
 * D-T2 미통과 시 fallback: 500 → 600 → 750 (1단계 → 2단계). Amendment 1 발동.
 */
export const MARS_SATELLITES_ORBIT_VISUAL_SCALE = 500;

export const ORBIT_VISUAL_SCALE_BY_PARENT: Readonly<Record<string, number>> = Object.freeze({
  earth: EARTH_MOON_ORBIT_VISUAL_SCALE,    // R4 #539 Amendment 2
  mars: MARS_SATELLITES_ORBIT_VISUAL_SCALE, // R5 #594 — satellite 2개 단일 룩업
});
```

**근거**: phobos binding constraint 분리 마진 1.69x 통과 + deimos 자동 안전 4.27x + R4 earth-moon 단일 룩업 패턴 답습 + 실측 SSoT 보존 (`solar-system.json` 변경 0) + 사용자 mental model "mars focus zoom-in 후 phobos/deimos 분리 visible".

> **명명 결정**: `MARS_SATELLITES_ORBIT_VISUAL_SCALE` (deimos 도 포함하므로 `MARS_PHOBOS_*` 보다 정확). R4 `EARTH_MOON_ORBIT_VISUAL_SCALE` 답습 일관성 무시 — R6+ 다중 satellite (galilean 4) 진입 시 본 명명 패턴이 일관성 우선 (developer 단계 final 결정).

### 결정 5 — Q2=B 임계 박제 (축 5)

```javascript
// apps/web/scripts/r1-ui-regression-guard.mjs --measure-px-ratio expected list
const PX_RATIO_THRESHOLDS = {
  sun: 0.25,     // R1
  mercury: 0.06, // R2
  venus: 0.11,   // R3
  earth: 0.15,   // R4
  moon: 0.045,   // R4
  mars: 0.08,    // R5 #594 — 산출 7.81%, margin 0.19%
  // phobos / deimos: N/A — 4px fallback 의존 (§결정 6)
};
```

**근거**: marsScale=800 산출 7.81% margin 0.19% (± 2% 허용 오차 안에서 정확 통과). 단조 패턴 mercury 6% < earth 15% > mars 8% > moon 4.5% (radius 비 정합).

### 결정 6 — Q2=B 임계 미적용 (phobos/deimos, 축 6)

phobos/deimos 는 사실 비율 명시 위배 박제값 (§결정 2/3) + 4px fallback billboard 흡수로 r1-guard `--measure-px-ratio` 미등록. 회귀 가드는 R-Phase Allowlist (§결정 7) + browser-verify-r-phase-allowlist expected list 갱신으로 우회. D-T2 사용자 검증으로 mesh visible 회귀 확인.

**근거**: moon Amendment 4 패턴 답습 + 측정 정밀도 mismatch (산출 < 0.01% vs 측정 도구 ± 5%) + Q2=B 정책 자체와 정합 무관 (사실 위배 박제값).

### 결정 7 — R-Phase Allowlist 8 body (축 7)

```typescript
// packages/core/src/scene/r-phase-allowlist.ts (developer 단계 박제)
export const R_PHASE_BODY_ALLOWLIST = Object.freeze([
  'sun', 'mercury', 'venus', 'earth', 'moon',
  'mars',    // R5 #594 — Q2=B 2번째 본 인스턴스화
  'phobos',  // R5 #594 — satellite 2개 첫 본 사례
  'deimos',  // R5 #594 — satellite 2개 첫 본 사례
] as const);
```

**근거**: R-Phase Allowlist Guard ADR §결정 4 절차 답습 (5곳 동시 박제) + FOCUS_BODIES drift 누적 동시 처리 (R4 baseline 잔존 + R5 추가).

### 결정 8 — Shortcut Bar (Q4a=A, 축 8)

`apps/web/src/components/layout/focus-quick-buttons.tsx` FOCUS_BUTTONS 에 **mars 1줄만 추가** (phobos/deimos 미등록). 모바일 viewport 10 버튼 + reset + free-fly = 12 버튼? 재산출:

> R4 baseline 7 focus 버튼 (sun/mercury/venus/earth/moon/jupiter/neptune) + 2 (reset + free-fly) = 9 버튼 (320 px). R5 mars 추가 후 8 focus + 2 = 10 버튼 (356 px, margin 19 px 안전).

**근거**: Q4a=A PM 결정 정합 + 모바일 너비 안전 + phobos/deimos 진입 경로 (URL override + mars focus zoom-in 후 mesh 클릭) 보장.

### Visual Fidelity §의무 체크리스트 4항목 (#541) 적용

R-Phase ADR 박제 시 적용 의무 (roadmap-v3 §6 Amendment 2026-04-30):

- [x] **데이터 SSoT 보존 확인** — `solar-system.json` 의 mars/phobos/deimos radius, semiMajorAxis 무수정. mesh radius 왜곡은 `body-scale.ts` 의 rendering-only 상수 (`marsScale=800` / `phobosScale=5000` / `deimosScale=5000`) 에서만. 궤도 거리 왜곡은 `orbit-visual-scale.ts` 의 `MARS_SATELLITES_ORBIT_VISUAL_SCALE=500` 에서만
- [x] **rendering 시점 분리** — physics 엔진 (Rust+wasm `packages/core/physics-engine`) 이 `BODY_SCALE` / `ORBIT_VISUAL_SCALE_BY_PARENT` 에 무의존 (P11-A 좌표 계약 보존). developer 단계 검증 의무
- [x] **UI overlay 실측값 표기** — CelestialInfoPanel mars/phobos/deimos Info 패널이 실측 radius (mars 3,396 km / phobos 11 km / deimos 6 km) 표기. mesh radius (왜곡값 `2.717e9 m` / `5.54e7 m` / `3.135e7 m`) 표기 금지
- [x] **baseline 박제** — 본 §결정 1~8 + 점유율 산출 (1280×720 mars pxDiameter 11.10 px / sun 대비 7.81% / mars mesh radius 2.717e9 m / phobos mesh radius 5.54e7 m / deimos mesh radius 3.135e7 m / phobos visual orbit 4.688e9 m / deimos visual orbit 1.173e10 m / 분리 마진 phobos 1.69x deimos 4.27x). 모바일 (375×667) 누적 차단율 8.77% (R4 8.72% + R5 mars 0.05%)

---

## 위험 / 미해결

### 위험 #1 — phobos/deimos sub-pixel 극단 — moon Amendment 4 학습 본 검증

- phobos mesh pxDiameter 0.226 px (1280×720, phobosScale=5000) — 4px fallback billboard 100% 의존
- moon Amendment 4 의 "사실 비율 깨고 사용자 천문 직관 우선" 패턴 답습 — 첫 본 multi-satellite 사례
- 완화: D-T2 사용자 검증 의무 — phobos/deimos 가시성 (4 px billboard) + 사용자 인지 (moon Amendment 4 처럼 "이상하게 큼" 또는 "안 보임" 보고). 미통과 시 phobosScale/deimosScale fallback 또는 ORBIT_VISUAL_SCALE_BY_PARENT.mars fallback

### 위험 #2 — mars-phobos visual scale 평가

- phobos sum mesh / 실측 거리 = 295.6배 (R4 moon 16.9배 의 17.5배 더 극단)
- visual_scale=500 적용 후 분리 마진 1.69x (≥ 1.5 임계 +0.19) — R4 1.78x 와 거의 동등 안정 패턴
- 완화: D-T2 미통과 시 500 → 600 → 750 fallback. Amendment 1 가능성

### 위험 #3 — D-T2 미통과 시 forensic 승격 가능성

- R4 가 일반 ADR 시작 → Amendment 2 forensic 승격 (#539 fusion 회귀) → Amendment 3/4 누적
- R5 도 satellite 2개 + mars-phobos 극단 fusion 으로 동일 가능성
- 완화: 일반 ADR 유지 + Amendment 라운드 N≥1 예상 명시. forensic 5 조건 중 3개 이상 충족 시 승격

### 위험 #4 — FOCUS_BODIES drift 누적 (R4 baseline 잔존 + R5 추가)

- 현재 `FOCUS_BODIES = ['sun', 'mercury', 'venus']` (R3 baseline 잔존)
- R5 진입 시 mars 만 추가하면 R4 회귀 잠복 (earth/moon 미박제)
- 완화: D17 박제 — R4 + R5 동시 추가 (`['sun', 'mercury', 'venus', 'earth', 'moon', 'mars', 'phobos', 'deimos']`)

### 위험 #5 — Q4a=A phobos/deimos shortcut 미등록 — 사용자 D-T2 발견 가능성

- mars 만 shortcut. phobos/deimos 는 URL override 또는 mars focus zoom-in 후 mesh 클릭
- 완화: D-T2 사용자 검증 명시 — phobos/deimos 진입 경로 작동 확인

### 위험 #6 — `MARS_PHOBOS_ORBIT_VISUAL_SCALE` 단일 룩업의 deimos 적용 — Amendment 1 가능성

- 현재 ORBIT_VISUAL_SCALE_BY_PARENT.mars 단일 룩업으로 phobos/deimos 둘 다 처리. 분리 마진 phobos 1.69x / deimos 4.27x (deimos 가 phobos 의 2.53배 더 멀어 보임)
- D-T2 사용자 인지: deimos 가 mars 에서 너무 멀어 다른 위성처럼 보일 가능성
- 완화: `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 신규 룩업 도입 (Amendment 1) — phobos/deimos 별도 박제값

### 위험 #7 — R6+ shortcut bar 모바일 overflow (R5 비-범위)

- R5 박제 후 10 버튼 + reset + free-fly = 12 버튼? 재산출 11 버튼 = 356 px (margin 19 px)
- R6 jupiter 추가 시 11 → 12 버튼 = 392 px > 375 px overflow
- 완화: R6 진입 시 horizontal scroll / 2단 grid 재트리거 (본 R5 비-범위)

---

## 결과 / 재검토 조건

### 재검토 트리거 (Amendment 발동 조건)

1. **#1 (phobos/deimos sub-pixel 회귀)** — D-T2 사용자 보고 "phobos/deimos 안 보임" → BILLBOARD_MIN_PIXEL_RADIUS 강화 or phobosScale/deimosScale fallback (5000 → 10000 → 50000) — Amendment 1 가능
2. **#2 (phobos/deimos 시각 mismatch)** — D-T2 "phobos 가 너무 큼" → phobosScale fallback (5000 → 2500 → 1000) — moon Amendment 4 재발
3. **#3 (mars-phobos fusion 회귀)** — D-T2 "phobos 가 mars 와 겹쳐 보임" → MARS_SATELLITES_ORBIT_VISUAL_SCALE fallback (500 → 600 → 750) — Amendment 1
4. **#4 (deimos 별도 룩업 필요)** — D-T2 "deimos 가 다른 위성처럼 보임" → `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 신규 룩업 도입 — Amendment 2 가능
5. **#5 (FOCUS_BODIES drift 잔존 회귀)** — browser-verify-378-focus.mjs 실행 후 earth/moon 누락 발견 → 즉시 동시 추가 fix
6. **#6 (mars 사실 비율 mismatch)** — D-T2 "mars 가 이상하게 작음/큼" → marsScale fallback (800 → 700 또는 900) — Amendment 1
7. **#7 (forensic 승격 트리거)** — Amendment 라운드 ≥ 2 누적 + 사용자 D-T2 ↔ DoD 측정 mismatch 또는 5 옵션 비교 신규 → forensic ADR 변형 승격

### Concrete Prediction (본 R5 의 본 검증 + R6~R10 확장 박제)

R5 추가 시 코드 변경 = 8 라인 (BODY_SCALE 3 + R_PHASE_BODY_ALLOWLIST 3 + FOCUS_BUTTONS 1 + ORBIT_VISUAL_SCALE_BY_PARENT 1).

**R6 추가 prediction (R5 박제 시점)**:
- jupiter: BODY_SCALE 1줄 + FOCUS_BUTTONS 1줄 + R_PHASE_BODY_ALLOWLIST 1줄 = 3 라인
- galilean 4 (io / europa / ganymede / callisto): 각 satellite 별 BODY_SCALE 1줄 + R_PHASE_BODY_ALLOWLIST 1줄 = 8 라인 + ORBIT_VISUAL_SCALE_BY_PARENT.jupiter 1줄 (단일 룩업 가정) = 1 라인 + shortcut bar 모바일 너비 fallback (horizontal scroll) 신규 ≥ 5 라인
- 예상 코드 변경: jupiter + 4 galilean 진입 시 ≤ 18 라인 (R4 ADR §Concrete Prediction "≤ 7 라인" 누적 갱신)

### Q2=B 임계 SSoT (R5 박제 후)

```
sun: ≤ 25%
mercury: ≤ 6%
venus: ≤ 11%
earth: ≤ 15%
moon: ≤ 4.5%
mars: ≤ 8% (본 R5 박제)
phobos / deimos: N/A (§결정 6)
R6+: R-Phase 진입 시 architect ADR 박제 (jupiter ≥ 100% 예상 — Q2=B 정책 천장 인스턴스화)
허용 오차: ± 2%
```

---

## 교차검증 반영 사항

> 본 섹션은 cross-validate 1회 (Antigravity `agy`, 2026-05-28) 결과 본문 통합 후 작성. 호출 결과를 합의 / 이견 수용 / Claude 재분석으로 기각 / 고유 발견 (후속 분리) / Claude 편향 셀프 체크 5축 분류 (CLAUDE.md §교차검증 SSoT).

### Claude 편향 셀프 체크 (호출 전, CLAUDE.md §교차검증)

- **낙관적 일정** — R5 1~2d 예상. R4 Amendment 4 누적 라운드 (Amendment 1 → 2 forensic 승격 → 3 → 4) 학습 → R5 도 Amendment N≥1 예상 박제. 통과
- **결합 간과** — mars 와 phobos/deimos 결합 (parent-satellite × 2 첫 본 사례) + Q2=B 단조 (earth → mars 첫 본 감소 인스턴스화) + 6-body 누적 모바일 침습성 결합 모두 명시. 통과
- **폐기 프레이밍** — moon Amendment 4 학습 적용 명시 + R4 §결정 6 답습 명시. 통과
- **순수주의** — 사실 비율 (phobos 0.326%) 정합 시 sub-pixel 잔재 압도 → 사실 위배 박제값 채택 (moon Amendment 4 패턴 답습). 사실 비율 보존 vs 사용자 천문 직관 trade-off 명시. 통과

### 합의 (cross-validate 2026-05-28 외부 모델 지적 → 현재 PR 즉시 반영 또는 사전 박제 일치)

1. **`marsScale = 800` Q2=B 정책 정합** — 외부 모델 "지구(800), 금성(800)과 동일한 스케일 수준을 부여하여 사실 비례(지구 대비 약 53.3%)를 화면상에서 53.2%로 매우 정확하게 유지한 점은 Q2=B 스케일 정책의 의도에 완벽히 정합". §결정 1 박제 보존
2. **`phobosScale / deimosScale = 5000` moon Amendment 4 패턴 답습** — 외부 모델 "실제 크기 비율을 적용할 시 서브픽셀 수준 이하로 떨어져 소멸되는 문제를 Moon Amendment 4의 '사실 비율 왜곡 + 4px sticky fallback billboard 보장' 패턴을 그대로 답습해 해결한 방식은 적절. 사용자의 천문학적 크기 직관(위성은 행성보다 현저히 작다)을 지키면서 렌더링 가시성을 획득하는 균형 잡힌 타당성". §결정 2/3 박제 보존
3. **`MARS_SATELLITES_ORBIT_VISUAL_SCALE = 500` 분리 마진 1.69x 적절** — 외부 모델 "물리 법칙을 해치지 않고 렌더링 단계에서만 궤도 반경을 확장하여 Phobos의 최소 분리 마진을 1.69배(≥ 1.5 임계치)로 설계한 것은 화면 상에서 위성이 행성에 묻히는 'Orbit Fusion' 현상을 예방하는 적절한 수학적 근거". §결정 4 박제 보존
4. **모바일 Viewport Q4a=A 영리한 비-범위 설정** — 외부 모델 "Mars만 추가하고 위성들을 누락시키는 방식(Q4a=A)은 375px 모바일 뷰포트 내 안전성(356px 점유)을 위한 영리한 비-범위 설정". §결정 8 박제 보존
5. **R6 진입 시 모바일 너비 fallback 사전 박제** — 외부 모델 "Jupiter 추가 시 총 11개 버튼으로 인해 392px이 되어 모바일 뷰포트 크기를 무조건 초과함을 기술하고, 가로 스크롤링 혹은 2단 레이아웃 그리드 전환을 미리 R6 후속 이관 의무로 지정한 설계 전개 방식은 매우 훌륭한 장기적 확장성 고려 사례". §위험 #7 박제 보존

### 이견 수용 (외부 모델 근거 합리적, Claude 원안 수정)

1. **상수 명명 일관화 의무** — 외부 모델 "본문 내에서 `MARS_PHOBOS_ORBIT_VISUAL_SCALE`과 `MARS_SATELLITES_ORBIT_VISUAL_SCALE` 상수가 혼용되어 정의될 여지. `ORBIT_VISUAL_SCALE_BY_PARENT` 룩업 테이블 키가 `mars` 단일 부모 명칭으로 제어되므로 구현단에서는 룩업 키를 `mars`로 통일하고 상수의 상세 명명 규칙을 명확히 단일화하는 가이드가 필요". **Claude 원안**: §결정 4 가이드 "developer 단계 명명 결정 위임" (모호 표현). **수정안**: 본 ADR §결정 4 의 final 결정으로 **`MARS_SATELLITES_ORBIT_VISUAL_SCALE`** 채택 박제 (deimos 도 포함 + R6+ 다중 satellite 일관성 우선). 룩업 키는 `mars` 보존. developer 는 본 ADR 박제 명명 그대로 박제 의무 (재해석 금지).

### Claude 재분석으로 기각한 외부 모델 제안

1. **위성 Allowlist URL 가드 코드 재검토 (외부 모델 §5 보안)** — 외부 모델 "`?focus=phobos` / `?focus=deimos` URL 파라미터 조작 시 3D 엔진 코어단 런타임 충돌 가능성". **기각 근거**: R-Phase Allowlist Guard ADR (`docs/decisions/20260504-r-phase-allowlist-guard.md`) §결정 3 (`simulation-core.ts` `case 'focusOn'` emit 차단) + §결정 1 (store-scene-sync event 단일 진실원) 으로 **2-layer defense 이미 박제**. 본 R5 ADR §결정 7 의 R_PHASE_BODY_ALLOWLIST 확장은 위 가드의 expected list 갱신만으로 자동 처리 — 신규 가드 코드 불필요. 외부 모델이 코드 직접 조회 못 한 상태 (STRICT INSTRUCTION 도구 미사용) 에서 발생한 false-positive

### 고유 발견 (후속 분리)

본 R5 비-범위 (스프린트 계약 §비-범위 정합) 로 판정되어 후속 이슈로 분리:

1. **위성 간 Z-fighting / 4px billboard 히트테스트 간섭** — 외부 모델 "Phobos와 Deimos의 물리 크기 비율 왜곡(모두 동일하게 5000배 증폭) 및 궤도 500배 확장을 함께 적용했을 때, 공전 과정에서 두 위성이 시각적으로 겹치는 오버랩(Z-fighting) 현상이나 클릭 히트테스트(Hit-test) 시 두 개의 4px billboard 영역이 서로 포개져 특정 위성을 선택할 수 없게 되는 뷰포트 간섭 현상". **분리 근거**: 본 R5 비-범위 §"phobos irregular shape" 의 satellite 시각 변형 후속 분리 정합. **후속 분리**: 본 ADR 머지 후 신규 이슈 박제 (제목: "[R5 follow-up] satellite Z-fighting + 4px billboard 히트테스트 간섭 가드", 우선순위 medium, 본 ADR §재검토 트리거 #4 와 결합 검토)
2. **`R_PHASE_BODY_ALLOWLIST` ↔ FOCUS_BODIES 정적 정합성 매칭 테스트** — 외부 모델 "R4 병합 당시 누락되었던 `browser-verify-378-focus.mjs` 내의 baseline 불일치(R3 수준인 3개 바디만 잔존) 문제를 R5에서 한꺼번에 패치하겠다는 계획은 긍정적이나, 왜 이러한 drift가 자동 빌드 및 검증 파이프라인에서 감지되지 않았는지에 대한 회고가 빠져 있음. `R_PHASE_BODY_ALLOWLIST`와 자동 검증 스크립트 간의 정적 정합성 매칭 테스트 코드가 추가적으로 동반". **분리 근거**: 본 R5 비-범위 §"PR title commitlint guard / TODO Aging Guard / Prettier 정합성" 등 가드 인프라 도입과 직교. **후속 분리**: 본 ADR 머지 후 신규 이슈 박제 (제목: "[guard] R_PHASE_BODY_ALLOWLIST ↔ FOCUS_BODIES drift 정적 매칭 테스트", 우선순위 low, R5 본 ADR 의 FOCUS_BODIES drift 누적 동시 처리 사례를 회고로 인용)
3. **`ORBIT_VISUAL_SCALE_BY_BODY` 위성별 개별 지정 인터페이스 (R6 보완)** — 외부 모델 "R6(Jupiter + Galilean 4 위성)로 진입할 경우 각 위성의 궤도 반경 편차가 훨씬 커지므로, `ORBIT_VISUAL_SCALE_BY_PARENT`를 넘어서는 `ORBIT_VISUAL_SCALE_BY_BODY` 혹은 위성별 개별 지정이 가능한 보완 인터페이스 정의서가 보완되어야 함". **수용 부분**: 본 ADR §위험 #6 + §재검토 트리거 #4 + Concrete Prediction (R6 prediction) 으로 이미 박제. **분리 근거**: R5 비-범위 (R6 jupiter+galilean 4 ADR 시점에 본격 인터페이스 정의). **후속 분리 불필요** — 본 ADR §재검토 트리거 #4 / §위험 #6 박제로 R6 architect 인계 의무 이미 명시. 외부 모델 지적이 본 R5 ADR 내부 박제와 합치되어 추가 분리 불필요

---

## Amendment 라운드 N (예상)

본 R5 ADR 은 D-T2 사용자 검증 결과로 Amendment 라운드 N≥1 예상. R4 ADR Amendment 1~4 누적 패턴 학습:
- Amendment 1: D8 측정 검증 임계 완화 패턴 (R5 도 mars px 비 ± 2% fallback 가능성)
- Amendment 2: forensic 승격 + satellite visual scale 신규 (R5 도 ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY 신규 가능성)
- Amendment 3: LOD × visual scale 결합 결함 (R5 도 satellite 2개 + LOD 결합 신규 검증)
- Amendment 4: 사실 비율 vs 시각 인지 mismatch (R5 phobos/deimos 사실 위배 박제값 D-T2 검증 필수)

forensic 5 조건 중 3개 이상 충족 시 forensic 변형 승격 ([`docs/templates/forensic-adr-template.md`](../templates/forensic-adr-template.md)). 본 R5 의 satellite 2개 첫 본 사례 + mars-phobos 극단 fusion (R4 의 17.5배) 으로 Amendment 2 forensic 승격 가능성 R4 보다 높음 — 양방향 cross-link 박제 의무.

---

## Amendment 1 (#604, 2026-05-31) — §결정 4 산식 vs 실측 분리 명시

- **상태**: Accepted (cross-validate 2026-05-31 agy Antigravity outcome=applied 후 본문 통합 완료 — CLAUDE.md §ADR Status 워크플로 #370 의 cross-validate 발동 ADR 전이)
- **트리거**: PR #603 ([#597 NO-OP ADR](20260530-597-satellite-z-fighting-no-op.md)) §Forensic 측정 데이터 §핵심 발견 #1 — "R5 ADR §결정 4 박제값 1.69x 실측 0.99 mismatch" 부산물 박제
- **결정**: §결정 4 산식 (1.69x) **유지** + 실측 데이터 (0.99 / 2.49) 분리 박제 + Tier scale 가설 박제 (검증 없음)
- **행동 변화**: 없음 (코드 / 박제값 / 회귀 가드 무수정). ADR 정합성 회복 목적
- **PATCH 분류** — CLAUDE.md §릴리스 §"행동 변화 vs 문서 변경 판정 질문" 기준 (에이전트 동작 변화 없음)

### 배경

#597 (PR #603) NO-OP forensic 측정의 **부산물 발견**. 시각 회귀 0 + alpha mask billboard 자연 흡수 + D-T2 정상 통과 정합 (NO-OP 결정 영향 없음) 이나, **본 ADR §결정 4 박제값 1.69x 와 runtime 실측 0.99 의 mismatch** 가 정합성 회귀로 잠재. R6 (jupiter + galilean) 진입 시 satellite 분리 마진 산식 정합성 의무 (§위험 #6 + §재검토 트리거 #4) 에 영향 가능성 차단 목적.

### 산식 (보존) — §결정 4 SSoT

본 §결정 4 (line 376~410) 의 산출식은 **SI 단위 (m)** 기준 단위 일관:

```
mars mesh radius (marsScale=800) = 3.3962e6 × 800 = 2.717e9 m
phobos mesh radius (phobosScale=5000) = 1.108e4 × 5000 = 5.54e7 m
mars + phobos sum mesh = 2.772e9 m
phobos 실측 orbit = 9.376e6 m
phobos sum mesh / orbit = 295.6배
visual_scale = 500 적용 시 phobos visual orbit = 9.376e6 × 500 = 4.688e9 m
phobos 분리 마진 = (visual orbit) / (sum mesh) = 4.688e9 / 2.772e9 = 1.69x
```

deimos 동일 단위 산출 시 4.27x. **본 산식 보존** — phobos binding constraint 의 ≥ 1.5x 임계 통과 + R4 §결정 6 패턴 답습 일관성 + visual_scale=500 박제값 정정 0.

### 실측 (PR #603 §Forensic 측정 데이터, 신규 박제)

- **measurement metric**: `phobos.position.length() / mars.boundingSphere.radiusWorld` (mars mesh 중심 → phobos mesh 중심 거리 / mars wsR)
- **measurement tool**: `scripts/_debug-597-tmp.mjs` (volt #67 패턴, 즉시 rm)
- **measurement env**: develop tip `50c9c57` (R5 + 후속 #598/#599 머지 후) / viewport 1280×720 / `?focus=mars`

| 측정 환경 | phobos_marsRadiusRatio | deimos_marsRadiusRatio | mars_R (boundingSphere) |
|---|---|---|---|
| headless Playwright (7 cell) | 0.9848 ~ 1.0110 (평균 ≈ 0.998) | 2.4931 ~ 2.4937 (평균 ≈ 2.493) | 118118 → 7.247 (ultra) |
| 실 Chrome agent-browser (8 cell) | 0.9866 ~ 0.9906 (대부분 0.9906) | 2.4927 ~ 2.4936 | 7.247 → 118118 (r=20+ Tier transition) |
| **R5 ADR §결정 4 박제값** | **1.69x** | **4.27x** | **2.717e9 (SI 단위 m)** |

### Mismatch 분석 (산식 vs 실측)

- phobos: 산식 1.69x / 실측 0.99 → **실측이 산식의 약 1.71배 작음** (1.69 / 0.99 = 1.708) — cross-validate agy 정정 (제안 2 수용)
- deimos: 산식 4.27x / 실측 2.49 → **실측이 산식의 약 1.71배 작음** (4.27 / 2.49 = 1.715)
- 두 satellite 동일 ratio (~1.71배) 일관 — 단일 원인 (단위 변환 또는 measurement metric 정의 차이) 강력 시사

### 가설 (架설, 검증 없음 — R6 architect 단계 의무)

본 Amendment 는 산식 정정이 아닌 분리 명시만 박제. 원인 가설 3종:

1. **Floating Origin Tier scale 변환 누락** — mars mesh radius 의 Tier scaled (rendering 시점) vs unscaled (산식) 차이. `mars_R` 가 7.247 (Tier 1) ↔ 118118 (Tier 3) 의 16292배 점프 (PR #603 §핵심 발견 #2) 가 단위 변환 신호 의심
2. **`mesh.scaling` 적용 후 `boundingSphere.radiusWorld` 갱신 시점** — Babylon boundingInfo 가 scaling 후 즉시 갱신되지 않는 경우 measurement metric (`boundingSphere.radiusWorld`) 와 산식 (`radius × scale`) 의 차이
3. **measurement metric vs 산식 metric 정의 차이** — 산식: `(visual orbit) / (mars mesh radius + phobos mesh radius)` (sum mesh 분리 마진) / 실측: `(phobos.position.length()) / (mars.boundingSphere.radiusWorld)` (단순 중심 거리 / mars wsR). 두 metric 정의 자체가 다를 가능성. 1.71배 일관 ratio 가 단순 산식 분모 차이 (sum mesh vs mars only) 일 수 있음 — `2.772e9 / 2.717e9 = 1.02` 로 1.71 미달이므로 본 가설 단독 설명 부족, 가설 1/2 와 결합 가능성

**검증 보류 근거** (옵션 B 선택): priority:low + 시각 회귀 0 + alpha mask billboard 자연 흡수 + D-T2 정상 통과 + R6 진입 시 architect 단계 산식 정합성 의무 (§재검토 트리거 #4) 로 자연 트리거 보존. 단독 산식 정정 작업 ROI marginal (옵션 A 거부 근거).

### 옵션 비교 (Provisional 결정)

| 옵션 | 방안 | 작업량 | 리스크 | 선택 |
|---|---|---|---|---|
| **A. 산식 정정 + Tier scale 변환 추가** | runtime debug 스크립트로 가설 1/2/3 검증 → 산식에 Tier scale 변환 추가 → 실측 0.99 박제 | 큼 (R5 + Floating Origin ADR 동시 영향) | priority:low 대비 작업량 과잉. Floating Origin SSoT 침범 위험 | ❌ |
| **B. 산식 vs 실측 분리 명시 Amendment** (선택) | §결정 4 산식 보존 + 실측 분리 박제 + 가설 박제 + R6 정정 트리거 | 작음 (ADR 1개 + Amendment 헤더) | ADR 정합 회복 + R6 자연 트리거 보존 | ✓ |
| C. R6 진입 시 동시 정정 | 현재 mismatch 박제 보류, R6 architect 단계에 산식 정정 위임 | 0 | mismatch 박제 누락 → R6 architect 가 발견 못 할 위험 (volt #21 신규 함수 ≠ 신규 구현 변형) | ❌ |

옵션 B 선택 근거:
1. **priority:low 정합** — 시각 회귀 0 + D-T2 정상 통과 + 4px alpha mask 자연 흡수 (PR #603 §결정 5축 정합)
2. **ADR 정합 회복** — 미래 reviewer / R6 architect 의 "산식이 틀린데 왜 안 고치냐" 혼란 차단 (분리 명시로 해소)
3. **R6 자연 트리거 보존** — §재검토 트리거 #4 (R6 jupiter + galilean architect 단계 산식 정합성 의무) 에 본 Amendment cross-link 박제 → 자동 트리거
4. **PR #603 §재검토 트리거 #4 cross-link** — "R5 ADR §결정 4 산식 재검증 의무 — Tier transition (Floating Origin) 영향 단위 변환 정정 필요 시 본 ADR 도 amendment 박제" 정합

### §재검토 트리거 갱신 (본 Amendment 추가)

§결과 / 재검토 조건 (line 759~) 의 기존 트리거에 추가:

- **R6 (jupiter + galilean 4) 진입 시 architect 단계 의무**: 본 Amendment 1 §가설 3종 검증 → 산식 정정 (옵션 A 승격) 또는 산식 vs 실측 분리 메트릭 정의 명시. R6 ADR 박제 시점에 본 Amendment 1 cross-link 박제 의무. **Tier 변환 시점 (Floating Origin Tier 1 ↔ Tier 3 전이 구간) edge validation 테스트 의무 추가** — cross-validate agy 고유 발견 #3 수용, mars_R 16292배 점프 (PR #603 §핵심 발견 #2) 구간에서 satellite 분리 마진 실측 (`phobos.position.length() / mars.boundingSphere.radiusWorld`) 가 산식과 일치하는 임계값 확인 의무
- **단독 정정 트리거**: 사용자 D-T2 회귀 보고 (mars/phobos/deimos 줌인 시각 회귀) / Floating Origin Tier scale 변환 정정 작업 (별도 ADR) / measurement metric SSoT 정합 가드 도입

### Visual Fidelity §의무 체크리스트 4항목 (#541) 정합

- **데이터 SSoT 보존** ✓ — `solar-system.json` mars/phobos/deimos radius / semiMajorAxis 무수정
- **rendering 시점 분리** ✓ — physics 엔진 무의존 (산식·실측 모두 rendering-only 영역)
- **UI overlay 실측값 표기** ✓ — CelestialInfoPanel mars/phobos/deimos 실측 radius 표기 유지
- **baseline 박제** ✓ — 본 Amendment §실측 표 박제 (산식 vs 실측 mismatch 1.71배 일관 ratio)

### 교차검증 반영 사항 (cross-validate 2026-05-31 agy Antigravity outcome=applied)

PR #605 박제 직후 1회 cross-validate (CLAUDE.md §교차검증 §"박제 직후 1회 루틴" 의무) 결과 4축 분류 박제:

#### 합의 (agy + Claude 일치)

1. **PATCH 분류 적정** — 런타임 코드 변경 0 (마크다운 문서 편집만) / 보안 취약점 경로 없음 / 성능 영향 0
2. **ADR 정합·cross-link 무결성** — CLAUDE.md §ADR Status 워크플로 정합 + PR #603 양방향 cross-link 추적성 확보
3. **옵션 B 선택 자체 반박 없음** — 산식 보존 + 실측 분리 박제 결정 자체에 이견 0

#### 이견 (없음)

본 Amendment 의 핵심 결정 (옵션 B / 가설 3종 박제 / R6 트리거 갱신) 에 대한 이견 0.

#### Claude 재분석 기각 (agy 제안 거부)

1. **agy 제안 1: CHANGELOG 1500자 한 줄 → 개행 분할 제안 거부** — 본 프로젝트 CHANGELOG.md 컨벤션 (R5 entry 8000+ 자 한 줄 + 굵은 글씨 + 백틱 SSoT 박제 패턴) 답습. agy 가 프로젝트 전체 컨벤션 미인지 → 일관성 손상 회피. 후속 분리 가치도 보존하지 않음 (CHANGELOG 포맷 일괄 개선은 별도 영역, 본 PR 범위 외)

#### 고유 발견 (수용 → 본 PR 즉시 반영)

1. **agy 제안 2 수용 — Mismatch 분석 phobos 수식 오타 정정** (사실 오류 영역): `1.69 / 0.99 = 1.708 ≈ 1.71배` 인데 본문 초안에 "약 1.74배" 로 잘못 표기. 본 Amendment 의 핵심 논지 (1.71배 일관 ratio → 단일 원인 시사) 자체 약화하는 오타. **즉시 정정** (deimos 1.71과 일관성 강화)
2. **agy 제안 3 수용 — R6 architect 단계 Tier 변환 edge validation 테스트 명시 추가**: 가설 1 (Floating Origin Tier scale 변환 누락) + 가설 2 (Babylon `boundingSphere.radiusWorld` 갱신 시점) 의 동적 Tier 전이 구간 edge validation 테스트 의무 추가. mars_R 16292배 점프 (PR #603 §핵심 발견 #2) 구간 임계값 확인 의무 §재검토 트리거에 박제

#### Claude 셀프 체크 (편향 회피)

- **"엄격한 DoD = 안전" 편향** (volt #66) — 본 Amendment 는 산식 정정이 아닌 분리 명시 (옵션 B) 로 priority:low 정합 + 작업량 최소화. agy 가 R6 가드 강화 (제안 3) 만 제안하고 산식 정정 (옵션 A) 자체는 요구하지 않음 → 사용자 합의 옵션 B 결정 정당화 정합
- **단일 모델 합의 편향** — agy 가 옵션 B 결정 자체 반박 0. 본 Amendment §옵션 비교 표가 옵션 A/B/C 명시 박제 + 거부 근거 박제로 합의 편향 완화 정합

### 참고

- 부모 ADR: 본 ADR §결정 4 (line 376~410) — 산식 SSoT 보존
- 부모 ADR: [`20260422-floating-origin.md`](20260422-floating-origin.md) — Tier transition SSoT (가설 1 의 단위 변환 영역)
- 트리거 ADR: [`20260530-597-satellite-z-fighting-no-op.md`](20260530-597-satellite-z-fighting-no-op.md) §Forensic 측정 데이터 §핵심 발견 #1 — 본 Amendment 의 실측 박제 출처
- 학습 사례: volt [#74](https://github.com/coseo12/volt/issues/74) (DoD PASS ≠ 제품 동작), volt [#77](https://github.com/coseo12/volt/issues/77) (headless ≠ 실 Chrome 일관 패턴 확인 → 본 mismatch 는 환경 무관 동일 패턴이므로 가설 1/2/3 모두 환경 독립)
- cross-validate 로그: `.claude/logs/cross-validate-code-20260531-152956.log` + outcome JSON `cross-validate-code-20260531-152956-outcome.json`
- 트리거 이슈: [#604](https://github.com/coseo12/astro-simulator/issues/604)
- Builds on: #597 (PR #603)
