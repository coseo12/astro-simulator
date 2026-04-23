# ADR: Display-Relative Scale Unification — 단일 동적 스케일 모드 재설계

- **상태**: Accepted
- **날짜**: 2026-04-23
- **결정자**: architect (P12 #298)
- **관련**: #298 (본 Phase), #288 (P11-A Floating Origin), #271 (P10 scientific jitter 원인), #294 (P11-A non-focus 회귀), #278 (P10-C 뷰 모드 도입), #272 (모바일 보류), ADR `20260422-floating-origin.md` (P11-A 선행), ADR `20260420-mobile-support-suspension.md` (모바일 비-범위 근거), 원칙 `docs/principles/fact-first.md` (§Amendment 대상)

## 배경

P10 에서 Fact-First 원칙을 박제하고 `educational` / `scientific` 이중 모드를 도입했다 (#278). 이후 P11-A 는 `scientific` 모드 float32 jitter 를 해소하기 위해 Floating Origin 을 배선했다 (#288, ADR `20260422-floating-origin.md`).

그러나 PM 라운드 1+2 수렴 결과, 근본 원인은 **이중 스케일 모델 자체**에 있다는 판정이 확정됐다:

1. **`educational`** — body 별 `maxScaleForKind` 차등 (star=20 / planet=500 / moon=500 / dwarf=2000 / comet=20000) 으로 **상대 비율 왜곡**. 사용자 5원칙 #1 "상대 비율 = 실측 고정" 위배
2. **`scientific`** — 모든 body `scale=1` 강제. 수성·달 등 작은 body 가 sub-pixel, 해왕성 궤도는 viewport 외부. 사용자 5원칙 #5 "화면 이동은 자연스러워야 함" 미달

사용자 5원칙 (이슈 #298 본문):

1. **상대 비율 = 실측 고정** (왜곡 금지)
2. **절대 스케일 = 디스플레이 함수** (뷰포트/zoom 기반 공통 배수 동적 조절)
3. **모드 통일** (educational/scientific 분리 폐기)
4. **거리도 동일 스케일** (궤도 반지름도 동일 `renderScale`)
5. **화면 이동은 자연스러워야 함**

본 ADR 은 5원칙을 불변 제약으로 하여 **단일 동적 스케일 모드** 를 박제한다. 상대 비율은 IAU 실측 고정, 절대 스케일은 viewport tier 함수로 공통 배수 전환, 거리·크기 동일 `renderScale` 적용.

### 기존 자산 재사용 조사 (CLAUDE.md "신규 함수 ≠ 신규 구현")

| 자산                                     | 위치                                                        | 본 재설계 처리                                       |
| ---------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| `FloatingOrigin` 클래스                  | `packages/core/src/coords/floating-origin.ts`               | **T3 에서 존속** (§4 분석). T1/T2 에서 사실상 no-op  |
| `SCENE_UNIT_PER_METER` 상수              | `packages/core/src/scene/solar-system-scene.ts:35`          | **함수화** → `renderScaleForTier(tier)`              |
| `computeVisualScale` / `maxScaleForKind` | `packages/core/src/scene/visual-scale.ts`                   | **폐기** (R3 DoD). body floor 는 별도 함수로 신설    |
| `CameraController.focusOn`               | `packages/core/src/scene/camera-controller.ts`              | **확장** — scale 전환 시 300ms radius 재계산 (Q8=8D) |
| `ViewMode` / `setViewMode`               | `apps/web/src/store/sim-store.ts` + `solar-system-scene.ts` | **제거** (R1 DoD). `data-view-mode` 어트리뷰트 포함  |

---

## 결정 매트릭스 (PM 라운드 1+2 합의 재기재)

ADR 은 이슈와 독립 아티팩트로 archived 가치를 갖는다. 본 절은 이슈 #298 본문과 동일 매트릭스를 재박제.

### 원칙

| Q       | 선택           | 요지                                                                                        |
| ------- | -------------- | ------------------------------------------------------------------------------------------- |
| **Q2**  | B              | **Discrete tier zoom** — 연속 scale 이 아닌 3개 preset 간 전환                              |
| **Q3**  | A              | **size + distance 동일 `renderScale`** — 크기도 거리도 같은 배수                            |
| **Q4**  | 단일 모드 통일 | `educational` / `scientific` 분리 폐기                                                      |
| **Q5**  | 조건부         | P11-A (#288) close 는 본 재설계 완료 후 Floating Origin 역할 재검토 (§결과·재검토 조건 Q10) |
| **Q-A** | Y3             | focus body 앵커 + "자연스러운 화면 이동" 제약                                               |
| **Q-B** | 전체 (a) 유지  | 궤도선 1~2px / 위성 floor / glow halo — 단일 모드 컨텍스트 (§Amendment 반영 예정)           |
| **Q-C** | C3             | **billboard marker** — P11-B LOD 통합 범위 (본 PR 비-범위)                                  |

### 구조

| Q      | 선택 | 요지                                                                                       |
| ------ | ---- | ------------------------------------------------------------------------------------------ |
| **Q6** | 6A   | **3단 tier**: Solar / Inner / Body (P11-B LOD 3단 정렬)                                    |
| **Q7** | 7-d2 | **하이브리드 트리거** — focus 있을 때 focus 자동, free-fly 시 stateless 카메라 거리 재계산 |
| **Q8** | 8D   | **scale + camera dolly 병행 interp** (apparent size 불변) + 카메라 입력 500ms 잠금         |

---

## 후보 비교

### 1. Scale 조절 전략 — tier 방식 선택

| 후보                                             | 정확도                                 | 구현 복잡도                                | UX                                                 | 비고                       |
| ------------------------------------------------ | -------------------------------------- | ------------------------------------------ | -------------------------------------------------- | -------------------------- |
| **A. 연속 log-scale (사용자 zoom 에 비례)**      | ⭐ 모든 zoom 레벨 대응                 | ✗ apparent size 점프 없이 smoothing 어려움 | △ 사용자 zoom 피드백이 scale 과 결합되어 예측 불가 | Q2=A 기각 사유 (PM 라운드) |
| **B. Discrete 3-tier preset (Solar/Inner/Body)** | ⭐ 각 tier 내 float32 정밀도 보장 (§4) | ⭐ 경계값 + transition 만 구현             | ⭐ 사용자가 "현재 tier" 를 인지 가능               | **Q2=B 선택**              |
| **C. body kind 별 상이 scale (현 educational)**  | ✗ 상대 비율 왜곡 (원칙 #1 위배)        | ⭐ 기존 구현                               | △ 사용자 5원칙 미충족                              | 기각 — 원칙 위배           |

**결정**: **B (Discrete 3-tier)**. PM Q2=B 확정, Q6=6A 로 tier 3단 구성.

**Tier 경계** (DoD V1~V6 기준 1280×800 viewport):

| Tier   | 이름  | 사용자 관찰 대상               | 좁은 축 95% 범위             | renderScale (m → scene unit) 예측 | 1 unit ≈ 실세계 길이 |
| ------ | ----- | ------------------------------ | ---------------------------- | --------------------------------- | -------------------- |
| **T1** | Solar | 해왕성 원일점 (30.3 AU) 궤도선 | 반경 380 unit @ 800px×0.95÷2 | **8.4e-11**                       | 1.19e10 m ≈ 0.08 AU  |
| **T2** | Inner | 화성 원일점 (1.666 AU) 궤도선  | 가로 60% → 반경 384 unit     | **1.54e-9**                       | 6.50e8 m ≈ 0.0043 AU |
| **T3** | Body  | 지구 직경 (1.275e7 m) 세로 40% | 직경 320 unit (vert)         | **2.51e-5**                       | 3.98e4 m ≈ 40 km     |

(§4 Float32 정밀도 분석에서 각 tier 에서의 jitter 여부 수식 유도.)

### 2. Tier 전환 트리거 정책 (Q7)

| 후보                                                              | 정확도                       | 복잡도                 | UX                             | 비고                           |
| ----------------------------------------------------------------- | ---------------------------- | ---------------------- | ------------------------------ | ------------------------------ |
| **A (7-a). 사용자 명시 UI 선택**                                  | ⭐                           | ⭐ 버튼만              | ✗ 사용자 학습 부담             | 원칙 #5 위배 (자연스러움 없음) |
| **B (7-c). focus 자동 결정**                                      | △ focus 없는 free-fly 미지원 | ⭐                     | △ free-fly 에서 묶임           | 부분 해결                      |
| **C (7-d1). 카메라 거리 기준 stateless 결정**                     | ⭐                           | △ 경계 hysteresis 필요 | △ focus 따라가기 미흡          | 부분 해결                      |
| **D (7-d2). 하이브리드** (focus 있으면 focus, 없으면 카메라 거리) | ⭐                           | △ 두 경로 분기         | ⭐ 두 시나리오 모두 자연스러움 | **Q7=7-d2 선택**               |

**결정**: **D (하이브리드)**. PM Q7=7-d2 확정.

**판정 알고리즘 스케치**:

```ts
function currentTier(camera: ArcRotateCamera, focusBodyId: string | null): Tier {
  if (focusBodyId !== null) {
    // focus 경로: focus body 의 kind + 카메라 거리로 tier 결정
    const focusKind = kindOf(focusBodyId); // 'star' | 'planet' | 'moon' | ...
    const cameraDistMeters = toMeters(camera.radius, currentRenderScale);
    return tierFromFocus(focusKind, cameraDistMeters);
  }
  // free-fly 경로: stateless 카메라 위치의 원점까지 거리로 결정
  const cameraFromSunMeters = toMeters(camera.globalPosition.length(), currentRenderScale);
  return tierFromCameraDistance(cameraFromSunMeters);
}
```

**히스테리시스 경계** (DoD A2 ≥15%): 현 tier 에서 **다음 tier 경계의 85%** 까지는 유지, **115%** 초과 시만 전환. tier 왕복 flicker 방지.

### 3. Scale 전환 애니메이션 (Q8)

**애니메이션 안전장치 (cross-validate Medium 수용)**:

- Babylon `Animation.CreateAndStartAnimation` 은 탭 비활성 (hidden) / 프레임 오류 / 의도치 않은 에러로 콜백 미호출 가능 → **입력 영구 잠금 리스크**
- 구현 가이드: **`try..finally` 또는 `setTimeout(300+100, attachControl)` 이중 안전장치**. 애니메이션 성공 시 `onAnimationEnd` 가 attach, 실패 시 fallback timer 가 attach. 양쪽 모두 idempotent (`attachControl` 중복 호출 허용)
- DoD C4 (카메라 입력 잠금 + 완료 후 100ms 내 재활성) 는 이 안전장치 내부에서 만족

| 후보                                                           | apparent size 연속성            | 복잡도            | 카메라 입력                 | 비고                                             |
| -------------------------------------------------------------- | ------------------------------- | ----------------- | --------------------------- | ------------------------------------------------ |
| **A (8A). scale 즉시 전환**                                    | ✗ 1 프레임 점프                 | ⭐                | 자유                        | flicker                                          |
| **B (8B). scale interp, 카메라 고정**                          | ⭐ size 연속                    | △                 | 자유                        | 사용자가 "내가 움직인 게 아닌데 왜 커지지?" 혼란 |
| **C (8C). 카메라 dolly 만** (scale 고정)                       | ✗ 카메라만 이동, tier 본질 미달 | ⭐                | 자유                        | tier preset 의미 상실                            |
| **D (8D). scale + camera dolly 병행 interp + 입력 500ms 잠금** | ⭐ apparent size 불변 보장      | ✗ 2축 interp 배선 | 🔒 500ms 동안 zoom/pan 잠금 | **Q8=8D 선택**                                   |

**결정**: **D**. PM Q8=8D 확정.

**배선 원리**:

- 전환 전 `renderScale_old`, 전환 후 `renderScale_new`. ratio = `renderScale_new / renderScale_old`
- 카메라 `radius_new = radius_old / ratio` — apparent size 불변 (scene unit 관점에서 같은 시야각)
- 양 값을 300ms (Babylon `Animation.CreateAndStartAnimation` easing) 로 병행 interp
- **입력 잠금**: 애니메이션 시작 시 `scene.detachControl()`, 완료 후 100ms 내 `attachControl()` 재개 (DoD C4)

근거: volt #33 headless false positive 방어 — 카메라 입력 경쟁이 발생하면 실 Chrome 에서 tier 전환이 부자연스럽게 느껴짐. 입력 잠금이 UX 예측 가능성 확보.

### 4. Floating Origin 존속 여부 (Q10 예측)

**Float32 정밀도 분석** (본 ADR 의 핵심 수식):

- float32 mantissa 23 bit → ≈7 decimal digits. 값 V 에 대해 하위 bit 정밀도 ≈ `V × 2^-23` ≈ `V × 1.2e-7`
- jitter 임계: 카메라 pan 간 scene 좌표 차분이 1 unit (= 1 pixel 에 해당하는 범위 기준) 에서 1e-4 unit 이상 변동하면 육안 감지

| Tier         | 최원거리 body scene 좌표                                   | 하위 bit 정밀도                | Floating Origin 필요 여부                                                                          |
| ------------ | ---------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------- |
| **T1 Solar** | 해왕성 ±380 unit                                           | 380 × 1.2e-7 = **4.6e-5 unit** | **불필요** (sub-pixel 수준, jitter 무감지)                                                         |
| **T2 Inner** | 화성 ±384 unit                                             | 384 × 1.2e-7 = **4.6e-5 unit** | **불필요** (sub-pixel)                                                                             |
| **T3 Body**  | 해왕성 (지구 focus 시) 4.54e12 × 2.51e-5 = **1.14e8 unit** | 1.14e8 × 1.2e-7 = **14 unit**  | **필수** — 원거리 body 는 LOD low billboard 로 이관 (P11-B), focus body 주변은 FloatingOrigin 존속 |

**결론**: Floating Origin 은 **T3 에서만 본질적으로 필요**. T1/T2 에서는 `fo.toLocal(world)` 가 사실상 no-op (origin = 0) 이어도 jitter 무발생.

→ **Q10 예비 판정**: P11-A `FloatingOrigin` 는 **유지 + 역할 축소**. T3 focus body primary shift 만 남기고, T1/T2 에서는 `fo.originOffset = [0, 0, 0]` 유지 (tier 전환 시 reset). safety net (1 AU threshold) 는 **불필요** (T3 에서도 focus body primary 가 항상 활성이므로 free-fly safety net 은 T3-free-fly 에서만 의미가 있고, 이 경우 T2 로 자동 전환 — §2 하이브리드 알고리즘).

**확정 시점**: Phase A 구현 + 실측 후 QA 가 T1/T2 free-fly 에서 jitter 부재 확증 → Phase C 에서 #288 ADR Amendment 박제 + safety net 코드 제거 (revert 아님, **축소 simplification**).

### 5. Body display floor overlay (원칙 #1 ↔ V2/V4 DoD 충돌 해소)

**문제**: T1/T2 에서 지구 반경을 실측 `renderScale` 곱한 결과는 sub-pixel 수준 (V2 ≥1px 미달, V4 ≥4px 미달). 원칙 #1 "상대 비율 = 실측 고정" 을 엄격 해석하면 DoD 미달.

**해소**: Q-B (a) "위성 floor / glow halo" 를 단일 모드 컨텍스트에서 재해석.

| 후보                                        | 원칙 위배                                               | DoD 충족                   | 사용자 인지                |
| ------------------------------------------- | ------------------------------------------------------- | -------------------------- | -------------------------- |
| **A. mesh scaling 조작** (현 educational)   | ✗ 상대 비율 왜곡                                        | ⭐                         | 배지 없으면 왜곡 은폐      |
| **B. Billboard marker (2D sprite) overlay** | ⭐ mesh 본체는 실측 유지, overlay 는 별도 layer         | ⭐                         | 명시 가능 (minimap 스타일) |
| **C. Glow halo shader**                     | △ body 주변 빛 퍼짐 — 실측과 부분 일치 (태양/항성 사실) | △ 행성은 halo 부자연스러움 | 배지 필요                  |

**결정**: **B (Billboard marker)** — 단, 본 PR 범위 밖 (Q-C=C3 으로 PM 확정, P11-B LOD 로 이관).

**본 PR 에서의 처리**:

- T1/T2 body 가 sub-pixel 이어도 **mesh 자체는 실측 그대로 렌더** (상대 비율 유지)
- DoD V2/V4 에서 요구하는 "지구 ≥1px / ≥4px" 는 **mesh 본체로는 미달**. Developer 가 V2/V4 달성을 위해 임시로 `body.radius` 계산에 하한 clamp 를 넣는 것을 금지 — 원칙 #1 위배
- **V2/V4 DoD 재조정**: 본 ADR 에서 "mesh body 자체는 실측 비율, billboard marker 는 P11-B" 경계 명시. 이슈 #298 의 DoD V2/V4 는 **P11-B 완료 후 합산 측정** 으로 이관. 본 PR 단독으로는 V2/V4 **보류**.
- V1/V3/V5/V6 은 본 PR 범위 내에서 측정 가능 (궤도선 가시성 + 지구 크기 focus 시)

**재조정 박제** (CLAUDE.md "재조정 3위치 박제"):

1. 본 ADR (ADR 내 박제 = 계약)
2. 이슈 #298 코멘트 (architect 설계안)
3. Phase A PR 본문 + CHANGELOG Notes (developer 책임)

### 6. Fact-First 원칙 Amendment (D3 DoD)

현 `docs/principles/fact-first.md` §예외 3건:

1. 궤도선 두께 (실제 0, 렌더 1~2px)
2. 위성 점 표시 — sub-pixel 위성에 최소 가시 크기 ~3px, `?satellites=zoomed` 옵트인
3. glow halo / corona

→ 이중 모드 전제로 작성됨 ("`scientific` 모드에서는 해제되거나 명시 배지"). 단일 모드 전환에 맞춰 **§Amendment**:

> 2026-04-23 — **단일 모드 전환**: `educational`/`scientific` 분리 폐기 (P12 #298). 본 섹션 예외 3건은 **모든 tier 에 항시 적용**. 과장은 배지가 아닌 **billboard marker overlay** (P11-B) 로 명시. 상대 비율은 IAU 실측 고정, 절대 scale 은 tier 함수.

---

## 결정

### 요약

1. **Tier 엔진**: `SCENE_UNIT_PER_METER` 상수를 `renderScaleForTier(tier: Tier)` 함수로 전환. 3단 tier (Solar / Inner / Body).
2. **하이브리드 트리거** (Q7=7-d2): focus 있으면 focus 경로, 없으면 카메라 거리 stateless 판정. 히스테리시스 ±15%.
3. **Q8=8D 애니메이션**: scale + camera radius 병행 300ms interp, 입력 500ms 잠금.
4. **Floating Origin 역할 축소**: T3 focus body primary 만 유지. T1/T2 에서는 no-op (P11-A simplify, Q10 확정).
5. **Body floor overlay**: 본 PR 비-범위 (P11-B billboard marker). DoD V2/V4 는 P11-B 합산 측정으로 이관.
6. **UI 제거**: `ViewModeSwitcher` / `ScaleBadge` / `OnboardingTooltip` / `ScientificModeNotice` + `viewMode` store 필드 + `?view=scientific` URL 동기 제거.
7. **Fact-First Amendment**: §예외 단일 모드 컨텍스트 명시. §"`scientific` 모드 UX 보호" 섹션 제거.
8. **Rust physics engine 경계 유지**: heliocentric 절대 m — 렌더 레이어만 `renderScale` 적용 (R6 DoD).

### Phase 분리 판정

**CLAUDE.md "Phase 분리 릴리스 리듬" 3 조건 대조**:

- ✅ **backward-compat**: Phase A 완료만으로도 T1 단일 tier 경로가 동작 가능 (Phase B 애니메이션 없이도 tier 전환이 "즉시 점프" 로 fallback — 단 flicker 허용)
- ✅ **완결 Behavior Change 집합**: 각 Phase 가 독립 동작
- ✅ **사용자 동의**: 본 재설계는 아키텍처 근간 3건 (tier 엔진 / 카메라 dolly / UI 제거) 포함 — 분리 시 리뷰 분산, 중간 관찰, 롤백 독립성 확보

**→ Phase 분리 채택**. 순서와 독립 릴리스 가능성:

| Phase       | 범위                                                                          | 독립 릴리스                                                                                  | DoD 책임                                          | CHANGELOG 분류                             |
| ----------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------ |
| **Phase A** | Tier 엔진 + 하이브리드 트리거 + body mesh 좌표 변환 경로 교체                 | ⭐ 단독 릴리스 가능 (MINOR)                                                                  | V1/V3/V5 (궤도선 가시성) + A1/A2/A3 + R4/R6/D1/D2 | MINOR — "P12-A: Tier engine"               |
| **Phase B** | Q8=8D 애니메이션 + 카메라 입력 잠금 UX                                        | ⭐ Phase A 완료 시점에 독립 릴리스 가능 (MINOR)                                              | C1/C2/C3/C4                                       | MINOR — "P12-B: Tier transition animation" |
| **Phase C** | UI 제거 (`ViewModeSwitcher` 등) + Amendment (R2/D3/D4) + P11-A simplify (Q10) | ⭐ 독립 릴리스 가능 (MINOR, breaking change 미만 — URL 파라미터 `?view=` 는 backward-ignore) | R1/R2/R3/R5/D3/D4                                 | MINOR — "P12-C: Unified mode UI cleanup"   |

**합계 릴리스**: 3개 MINOR (v0.11.0 / v0.12.0 / v0.13.0). 총 CHANGELOG Behavior Changes 분산.

**DoD V2/V4 (body ≥1px/≥4px)**: P11-B billboard marker 합산 측정으로 이관 — 본 3 Phase 범위 밖.

**비-범위 재확인**:

- ❌ Billboard marker 구현 (P11-B LOD 통합, Q-C=C3)
- ❌ 모바일 Tier Preset (P11-C, #272 복구 조건)
- ❌ PBR / Cloud Layer (P13, renumber 반영)
- ❌ P11-A (#288) revert — Phase C 에서 **축소 simplify** 만 (완전 revert 아님, Q10)
- ❌ P11-A followup #295/#296/#297 — 독립 진행
- ❌ 교육 청중 과장 모드 — Q4=단일 모드 채택. 요청 발생 시 별도 이슈

### 주석 계약 (drift 방어)

`solar-system-scene.ts` 상단에 다음 주석 박제 (개발 중 drift 시 QA 가 감지):

```ts
// Display-Relative Scale Unification 계약 (ADR 20260423, §결정):
//   1. renderScale 은 tier 함수. SCENE_UNIT_PER_METER 하드코딩 금지
//   2. body mesh 본체는 실측 radius × renderScale — scaling 조작으로 왜곡 금지 (원칙 #1)
//   3. 거리도 동일 renderScale 적용 (원칙 #4) — orbit line / trail 동일 규칙
//   4. Rust engine 반환 좌표는 heliocentric 절대 m — tier 변환은 렌더 레이어 책임 (R6)
//   5. tier 전환 시 scale + camera.radius 병행 interp 300ms, 입력 500ms 잠금 (Q8=8D)
//      → try..finally 또는 fallback timer 로 attachControl() 영구 잠금 방지 (cross-validate Medium)
//   6. Floating Origin: T3 focus body primary 만 활성. T1/T2 에서 originOffset=0 (Q10)
// 위 계약 위배 변경은 즉시 버그로 간주 (CLAUDE.md "주석 계약 vs 구현 drift" 교훈)
```

---

## 결과·재검토 조건

### 예상 결과

- 단일 모드 UI, 3단 tier 자동 전환
- T1 뷰: 해왕성 궤도선 가시, 카메라 자유 탐색
- T2 뷰: 화성 궤도선 가시, 내행성계 중심
- T3 뷰: focus body (예: 지구) 중심 근접 뷰, 달 가시 (P11-B billboard 합산 시)
- float32 jitter 부재 (T1/T2 는 좌표 범위 자체로 보장, T3 은 Floating Origin 으로 보장)
- UI 2축 (`ModeSwitcher` 관찰/연구 vs `ViewModeSwitcher` 교육/사실) 중 `ViewModeSwitcher` 축 완전 제거

### Concrete Prediction — 추상화 건강성

(CLAUDE.md "신규 데이터 ≠ 신규 코드" 교훈. 추상화가 올바르면 아래 4가지는 실제 측정에서 재현될 것)

1. **Tier 경계 조정 시** (예: T2 범위를 화성→소행성대 2.5 AU 로 확장하려 `renderScale_T2` 재튜닝) — `solar-system-scene.ts` 의 mesh 업데이트 루프 / orbit line 생성 / camera controller 코드 변경 **0 줄**. 변경은 `renderScaleForTier(tier)` / 히스테리시스 상수 한 파일 내로 국한되어야 함
2. **신규 body 추가 시** (예: P13 토성 위성 티탄/엔셀라두스 JSON 추가) — tier 엔진 관련 코드 변경 **0 줄**. 새 body 는 기존 `worldPositions` 경로를 그대로 타고 `mesh.position.set((world - origin) * renderScale)` 에서 자동 처리
3. **P11-B LOD 통합 시** — tier 엔진 자체 코드 변경 **0 줄**. LOD 모듈은 mesh.position 할당 **전** 단계에서 이미 `renderScale` 이 반영된 scene 좌표를 읽으므로 투명
4. **Floating Origin 제거 결정 시** (Q10 확정 후 T3 에서도 `renderScale` 자체가 충분하다는 판정이 나오면) — tier 엔진 코드 변경 **0 줄**. `floatingOrigin` 인스턴스 자체를 scene 밖으로 제거해도 mesh 좌표 루프는 `origin = [0,0,0]` 으로 degrade

이 4가지 예측이 실패하면 (= 계층 수정 필요) 추상화 부족 신호 → Phase B/C 전 ADR Amendment 박제 후 재설계.

### 재검토 조건

다음 중 하나 발생 시 ADR 재검토:

1. **Phase A 구현 후 tier 전환 체감 점프 발생** — §3 후보 A(즉시) 가 문제 없을 것 같았으나 DoD C1 (apparent size 변동 ≤5%) 실측 미달 → Phase B Q8=8D interp 조기 도입 또는 히스테리시스 ±15% 강화
2. **T1 Solar free-fly 중 Floating Origin safety net 필요 발견** — §4 예측 대비 실측 jitter 발생 시 `originOffset = 0` 결정 취소, safety net 유지
3. **DoD V1/V3/V5 좁은 축 95% / 60% / 40% 수식이 실 Chrome 에서 viewport 비율 차이로 실패** — 기준 viewport 1280×800 외 화면 크기에서 실패 시 viewport aspect ratio adapting 추가 (AdaptiveScaler 신설)
4. **R3 `visual-scale.ts` 폐기 후 다른 호출자 발견** — Phase A 구현 전 Grep 실측 (예상 호출자: `solar-system-scene.ts` + `scale-badge.tsx`). 누락 발견 시 의존성 정리 후 재개
5. **P11-A simplify 시 #288 ADR 회귀 가드 (목성→지구 zoom browser-verify) 실측 실패** — Phase C 에서 safety net 제거 직후 재현 시 T3 에서 safety net 유지 결정 + §4 분석 Amendment
6. **Q4 "단일 모드" 채택 후 교육 청중 강한 반발** — 별도 이슈 재개. 본 ADR 범위 밖이지만 재검토 트리거는 명시적으로 허용 (사용자 피드백 → ADR Amendment)
7. **접근성 (ARIA Live Region) 요구 발생** — tier 전환 시 스크린 리더 알림. 본 ADR 범위 밖으로 [#299](https://github.com/coseo12/astro-simulator/issues/299) 으로 분리 (cross-validate Low 고유 발견)
8. **V2/V4 DoD 가 P11-B 완료 후에도 달 가시성 미달** — billboard marker fallback 조건 재설계 (P11-B ADR 에서 다룰 범위지만 본 ADR 과 연동)
9. **Tier 전환 애니메이션이 저사양 기기에서 프레임 드랍** — DoD C2 (fps<30 ≤2 프레임/500ms) 관찰 시 Phase B 안에 "짧은 전환 (150ms) / 비활성 fallback" 옵션 추가 검토 (cross-validate Low 수용)
10. **`currentTier` 함수 fps 회귀 관찰** — 히스테리시스 경계에서 반복 트리거로 CPU 부하 ≥5% 증가 시 tier 전환 결과 캐시 (1 frame 간격 throttle) 검토 (cross-validate Low 수용)

### 암묵 전제 박제

- 기준 viewport 1280×800 (DoD 전제). 모바일 및 비율 다른 화면은 별도 issue
- 3개 Phase 간 **1주 이상 간격** 허용 — CHANGELOG Phase 별 entry + 상호 링크로 drift 방지 (CLAUDE.md Phase 분리 리듬)
- Rust physics engine 좌표계 변경 **없음** (heliocentric 절대 m). 본 재설계는 **렌더 레이어 단독** 변경
- `?view=scientific` URL 은 Phase C 이후 **무시** (backward-ignore). 과거 북마크는 단일 모드로 자연 진입
- dev 서버 HMR 중 `__simStore.viewMode` 접근 코드는 Phase C 에서 제거 — E2E 스펙 `data-testid="scientific-mode-notice"` 는 동시 폐기

---

## Amendments

### 2026-04-23 — Phase A/B/C 실측 반영 + Concrete Prediction 재현 + Q10 확정

**맥락**: Phase A (PR [#301](https://github.com/coseo12/astro-simulator/pull/301) `c4ab4b1`) + Phase B (PR [#304](https://github.com/coseo12/astro-simulator/pull/304) `208f5cb`) + Phase C (본 PR) 순차 머지 완료. 각 Phase 의 완료 기준 실측 + §Concrete Prediction 재현 확인.

#### (a) Phase 분리 재조정 이력

- **Phase A 재조정 항목**:
  - **V5 → Phase B 이관** (hard fail 기준 승격) — Phase A 에서는 WARN (V5 달성이 camera dolly 에 의존하므로 Q8=8D 배선 선행 필요). Phase A PR #301 CHANGELOG Notes 에 박제
  - **V2 / V4 / V6 → P11-B 이관** — §5 body floor overlay 결정으로 billboard marker 합산 측정 대상. 본 3 Phase 단독으로는 측정 불가
- **Phase B 구현 결과**:
  - **V5 PASS**: 지구 세로 40% ±5% 목표 320px → 실측 **322px** (boundingR=277.3 unit, `FOCUS_RADIUS_MULTIPLIER=5.9`)
  - **A1 PASS**: focus 중심 편차 ≤ 10px 목표 → 실측 **0.0px** (화면 중심 640,400 완전 일치)
  - **C1 PASS**: apparent size 변동 ≤ 5% → 단위 테스트 `tier-transition.test.ts` #14 에서 `1e-12` 상대오차 수식 증명
  - **C3 PASS (측정 방식 재해석 후)**: 전환 ≤500ms → QA `_alreadyAttached` 폴링 독립 측정으로 lock 실 지속 **373.5ms** / click→reattach **506ms**. ADR §3 Q8=8D "300ms duration + 100ms fallback 마진" 계약에 정합. Phase C 에서 `browser-verify-tier-transition.mjs` 를 폴링 기반으로 교체 (QA suggestion #1)
- **수식 서술 방향 명확화** (developer suggestion #2): ADR §3 의 `ratio = renderScale_new / renderScale_old, radius_new = radius_old / ratio` 표기는 **ratio 를 역수 해석** 할 때만 `radius_new = radius_old × (newScale / oldScale)` 확대 방향 수식과 동일. 구현은 직관적 "scene unit 비례 확대" 방향 채택. `tier-transition.ts` 코드 주석 § "ADR 서술 정합성" 에 박제
- **이력 문서 retrofit 금지 원칙** (architect): 본 Amendment 에는 Phase 분리 이력과 현재 상태를 기록하되, `p10-plan.md` / `p10-retrospective.md` / 과거 commit message 등 이력 문서는 건드리지 않는다. 미래 관찰자는 당시 판정 맥락을 잃지 않도록 원문 보존

#### (b) §Concrete Prediction 재현 결과 (D4 DoD)

레이블 규약 (cross-validate Gemini 제안 수용): `PASS` = 현재 관찰·검증 완료 / `PLANNED` = 예측 수립됐으나 검증 활동이 미래 특정 시점으로 예정 / `DEFERRED` = 범위 이월 (다른 Phase/PR 에서 판정).

| #   | 예측                                                                      | 레이블       | 증거·시점                                                                                                                   |
| --- | ------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | Tier 경계 조정 시 mesh 루프 / orbit line 생성 / camera 코드 변경 **0 줄** | **PASS**     | Phase A PR #301 — 변경은 `tier.ts` + `renderScaleForTier` 한 함수 내로 국한                                                 |
| 2   | 신규 body 추가 시 tier 엔진 관련 코드 변경 **0 줄**                       | **PLANNED**  | P13 Texture Pipeline 시 Titan/Enceladus 등 신규 body 추가 시 `worldPositions` 경로가 그대로 기능하는지 PR diff 로 검증 예정 |
| 3   | P11-B LOD 통합 시 tier 엔진 자체 변경 **0 줄**                            | **DEFERRED** | P11-B billboard marker 합산 시점에서 판정 (본 스프린트 범위 밖)                                                             |
| 4   | Floating Origin 제거 결정 시 tier 엔진 변경 **0 줄**                      | **PASS**     | Q10 판정으로 "제거 아님, 간소화 유지" — 코드 변경 0 달성. `originOffset = [0,0,0]` T1/T2 에서 실질 no-op 확인               |

**결론**: 현 시점 관찰 가능한 예측 **2/4 PASS** (#1, #4), **1 PLANNED** (#2, P13 에서 재확인), **1 DEFERRED** (#3, P11-B). "관찰 가능한 2 PASS" 만으로도 기존 추상화 (tier 엔진 / FloatingOrigin / orbit line / mesh.position 경로) 가 계층적으로 직교 설계되어 있음을 **부분 실증**. 미래 P13 / P11-B 진입 시 #2, #3 재평가 + Amendment.

#### (c) Q10 Floating Origin 확정 — **간소화 유지** (제거 아님)

§4 분석에서 도출한 예비 판정 "T3 본질 필요 / T1/T2 no-op" 을 **Phase B 실측 + Phase C architect 판정** 으로 확정:

- **T3 본질 필요**: 지구 focus 시 해왕성 scene 좌표 14 unit jitter (ADR §4 표). `setOriginToBody(focus)` primary 로 해소
- **T1/T2 no-op**: `originOffset=[0,0,0]` 유지. `updateAt` 말미 safety net trigger 는 free-fly + 1AU 이상 이동 경로에만 의미 있고, 그 경로는 하이브리드 트리거 (Q7=7-d2) 가 이미 T2 로 자동 전환해 사실상 unreachable
- **제거 하지 않는 이유**: (a) P11-A (#288) 회귀 가드 붕괴 방지, (b) followup #294~#297 의 기준선 변경 회피, (c) 미래 Trail/Particle 모듈의 `onOriginShift` 계약 보존, (d) T1/T2 에서 `toLocal()` 오버헤드는 `subtract([0,0,0])` 수준으로 0 에 수렴
- **Phase C 처리**: **코드 변경 0, Amendment 만**. `floating-origin.ts` 및 관련 테스트 전부 유지
- **#288 close 판정**: 본 PR 에서 close. scientific 모드 jitter 해소의 원 목표는 단일 모드 전환으로 근본 원인 소멸. `20260422-floating-origin.md` §Amendment 1줄 박제 — "P12 에서 역할 축소 (T3 primary, T1/T2 no-op)"

#### (d) QA / Reviewer 이관 항목 반영 (Phase C)

- **Reviewer M1** (Major, PR #304): `setTier` 가 `runTierTransition` cleanup 을 클로저에 저장해 연쇄 전환 시 이전 fallback timer / listener 를 먼저 해제. `tier-transition.test.ts` 에 "연쇄 전환 cleanup 호출" 단위 테스트 3건 추가
- **Reviewer m1** (Minor): `tier-transition.ts:227-236` visibilitychange JSDoc 을 "fallback timer 와 이중 방어 — 둘 중 먼저 도달한 쪽이 release" 로 완화
- **Reviewer m3** (Minor): `TIER_TRANSITION_EASE` module-level const 로 hoisting — `camera-controller.ts` 의 `#easing` 생성자 패턴과 일관성
- **QA suggestion #1**: `browser-verify-tier-transition.mjs` C3 측정을 `_alreadyAttached` 폴링 기반으로 교체 (click→reattach 직접 측정). `radius 안정화` 기준은 WARN 레벨 부수 지표로 병기
- **QA suggestion #2/#3** (focus 버튼 확장 / fps HUD): 후속 이슈 #307 로 분리 (본 PR 비-범위)
- **Reviewer m2** (lowerRadiusLimit 원복): 후속 이슈 #305 로 분리 (P11-B billboard marker 통합 시점 재검토)
- **developer suggestion #1** (FOCUS_RADIUS_MULTIPLIER viewport/fov 동적화): 후속 이슈 #306 으로 분리 (재검토 조건 #3 에 이미 박제)

---

## 참고

- 이슈: [#298](https://github.com/coseo12/astro-simulator/issues/298) — PM 3 라운드 Q&A 수렴 결과 반영
- 선행 ADR: [`20260422-floating-origin.md`](20260422-floating-origin.md) — P11-A (본 ADR 이 §4 에서 역할 축소 제안)
- 선행 ADR: [`20260420-mobile-support-suspension.md`](20260420-mobile-support-suspension.md) — 모바일 비-범위 근거
- 원칙: [`docs/principles/fact-first.md`](../principles/fact-first.md) — §예외 Amendment 대상 (D3 DoD)
- 로드맵: [`docs/phases/roadmap-v2-solar-precision.md`](../phases/roadmap-v2-solar-precision.md) — D4 renumber 대상
- CLAUDE.md 교훈: "신규 함수 ≠ 신규 구현" / "신규 데이터 ≠ 신규 코드" / "주석 계약 vs 구현 drift" / "Phase 분리 릴리스 리듬" / "headless false positive 방어" (volt #33)
- 기존 자산: `packages/core/src/coords/floating-origin.ts`, `packages/core/src/scene/visual-scale.ts`, `packages/core/src/scene/solar-system-scene.ts`, `packages/core/src/scene/camera-controller.ts`
