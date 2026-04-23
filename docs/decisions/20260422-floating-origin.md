# ADR: Floating Origin — scientific 모드 float32 jitter 해소

- **상태**: Accepted
- **날짜**: 2026-04-22
- **결정자**: architect (P11-A #288)
- **관련**: P11-A #288 (본 마일스톤), #271 (close 대상 — P10 known issue), #247 (P11-B 관찰), #256 (P16), P10-A #268 (로드맵 v2 박제), ADR `20260420-mobile-support-suspension.md` (M1 백업 경로 비현실성 근거), ADR `20260419-satellite-orbit-hybrid.md` (parentId 계층 계약 — 데이터 확장 전제)

## 배경

로드맵 v2 §P11 (`docs/phases/roadmap-v2-solar-precision.md` line 75~96) 의 3-way 분할 중 첫 번째. IAU 2015 실측 거리 (해왕성 궤도 4.5e12 m ≈ 30 AU) 를 `?view=scientific` 모드로 렌더 시 **float32 좌표 정밀도 한계**로 카메라 이동 시 jitter 발생 — P10 known issue #271 + Gemini 교차검증 Medium 고유 발견 근거.

**물리적 원인**:

- GPU 렌더 파이프라인은 float32. 30 AU = 4.5e12 m 스케일에서 float32 유효숫자 ~7자리 → 카메라 pan 마다 하위 비트가 손실되어 body 중심 픽셀이 ±1~3px 점프
- Babylon 씬 단위: `1 scene unit = 1 AU` (`SCENE_UNIT_PER_METER = 1/AU`). scene 좌표로 환산해도 해왕성까지 30 단위, log-depth 와 조합하여 depth 는 해결되지만 position 은 여전히 float32 cast 직전 손실 발생
- P10 educational 모드는 `maxScaleForKind` 로 body 크기를 과장 (`MAX_VISUAL_SCALE_PLANET = 500`) 해 시각적으로 jitter 가 body radius 보다 작아 가려짐. scientific 모드는 scale=1 강제 (P10-C-2 #278) 라 jitter 가 pixel 단위로 노출

**이미 존재하는 자산** (CLAUDE.md "신규 함수 ≠ 신규 구현" 교훈):

- `packages/core/src/coords/floating-origin.ts` — `FloatingOrigin` 클래스 완성 (update/toWorld/toLocal/reset). 단위 테스트 7건 존재
- `packages/core/src/coords/rte.ts` — `toRelativeToEye` / `manyToRelativeToEye` — CPU float64 → GPU float32 RTE 변환
- `packages/core/src/coords/vec3.ts` — `Vec3Double` 타입, `subtract`, `length`, `add`
- `CameraController` (`packages/core/src/scene/camera-controller.ts`) 주석: "C7/P2에서 coords/FloatingOrigin 통합 예정" — **미통합 상태, 본 Phase 에서 배선**

즉 P11-A 는 "구현 신설"이 아니라 **"기존 `FloatingOrigin` 유틸을 scene/카메라/update 루프에 배선"** 이 본질. ADR 의 초점은 알고리즘 선택이 아니라 **배선 지점 / 좌표계 계약 / 트리거 정책 / smoothing 전략 / 회귀 가드** 에 있다.

**Zustand 좌표계 불변식 전제** (cross-validate 반영 §5):

- Rust physics engine state: Heliocentric 절대 좌표 (변경 없음)
- Frontend Zustand store state: Heliocentric 절대 좌표 (정보 패널 거리 표시, JPL 호환)
- Three.js / Babylon scene 좌표: Scene 삽입 직전에만 Floating Origin 행렬 변환 적용

## 후보 비교

### 1. Floating Origin 트리거 알고리즘

| 후보                                                                   | 정확도                            | 구현 복잡도                                       | Discontinuity 위험                                        | 비고                                                          |
| ---------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------- |
| **A. 카메라 위치 기반 threshold shift** (현 `FloatingOrigin.update()`) | ⭐ 어떤 focus 든 카메라 근처 보장 | ⭐ 기존 API 즉시 배선                             | △ 사용자 pan 중 shift → hysteresis 필요                   | 기본 — 임계 초과 시 origin 을 카메라 위치로 1회 이동          |
| **B. focus body 기반 origin = focus target 좌표**                      | ⭐ focus body 가 항상 정확히 원점 | △ focus 전환 시마다 명시적 origin update          | ⭐ focus 전환 = origin shift 1회, 중간 discontinuity 없음 | focus 전환 hook (`controller.focusOn` + `reset`) 에서만 shift |
| **C. 가장 가까운 major body 기반**                                     | △ 카메라가 두 body 사이면 불안정  | ✗ 근접 body 탐색 매 프레임 O(N) + hysteresis 복잡 | ✗ body 경계에서 빈번한 shift                              | 기각 — 상호 이동하는 solar system 에서 flicker 리스크         |

**결정**: **B (focus body origin) + A (카메라 이동 거리 safety net)** 하이브리드.

근거:

- B 단독으로는 free-fly 카메라 (focus 없는 사용자 drag zoom) 에서 jitter 재발 — focus 를 벗어난 pan 에 대응 불가
- A 단독으로는 focus 전환 순간 카메라가 이미 멀리 떨어진 상태에서 shift 가 한 템포 늦게 발동 → focus 전환과 shift 사이 flicker 1 프레임 발생 가능
- **B 가 primary**: `controller.focusOn(mesh)` 호출 시 즉시 `fo.reset()` 후 origin 을 해당 mesh 의 world 좌표로 set. scene 의 모든 body mesh 위치를 새 origin 기준으로 재계산
- **A 가 secondary (safety net)**: focus 없는 자유 탐색 중 카메라 local 좌표 `|cameraLocal| > threshold` 초과 시 기존 `fo.update(cameraWorld)` 로 추가 shift. hysteresis 는 threshold 단일값 (1 AU) 으로 충분 — 카메라가 1 AU 이상 이동해야 shift 발동하므로 빈번한 toggle 위험 낮음
- `FloatingOrigin.update()` API 는 이미 카메라 위치 기반이므로 **신규 코드는 B 전용 `setOriginToBody(bodyWorldPos)` 헬퍼 추가** 1개만 필요. 기존 클래스 파괴적 변경 없음

### 2. Trail / Particle GPU 버퍼 shift 전략 (cross-validate 반영 §3)

| 후보                                                  | 성능                        | 정확도                   | 구현 복잡도                               | 적용 시점       |
| ----------------------------------------------------- | --------------------------- | ------------------------ | ----------------------------------------- | --------------- |
| **A. Origin shift 시 기존 GPU 버퍼 일괄 translation** | ⭐ 1 frame 내 일괄 업데이트 | ⭐ 기존 궤적 연속성 보존 | △ 버퍼 모듈별 `translate(delta)` API 신규 | Trail 도입 시점 |
| **B. Origin 변경 시 Trail/Particle clear 후 재생성**  | △ clear = flicker 1 프레임  | ✗ 궤적 끊김 regression   | ⭐ 기존 buffer 폐기만                     | Trail 도입 시점 |
| **C. 계약만 수립 — Trail 미도입이므로 구현은 후속**   | ⭐ 현재 비용 0              | ⭐ 추상화 명세만         | ⭐ 규약 주석 + 회귀 테스트 skip           | P11-A 본 Phase  |

**결정**: **C (계약 수립) + 향후 Trail 도입 시 A 채택**.

근거:

- **현재 코드베이스에 Trail 모듈 없음** — `Grep "Trail|onBeforeRender|useFrame"` 결과 0건 (`packages/core/src` 전범위). `AsteroidBelt.writeWorldPositions` 는 매 프레임 flat positions 에서 ThinInstance 를 완전 덮어쓰므로 shift 영향 없음 (매 프레임 상태가 engine 에서 다시 옴)
- 따라서 본 Phase 는 "shift 시 GPU 버퍼 translate" 를 **미래 Trail 모듈의 계약 (규약)** 으로 박제. 실제 구현은 Trail 이 도입되는 Phase (현 로드맵엔 없음, 예: P14+ 혜성 궤적)
- **계약 구현**: `FloatingOrigin` 인터페이스에 `onOriginShift(listener: (delta: Vec3Double) => void): () => void` subscription API 추가. 미래 Trail/Particle 모듈이 mount 시 subscribe → delta 만큼 버퍼 translate
- Strategy B 는 원칙적으로 거부 — volt #33 "headless false positive" 계열로 궤적 끊김은 QA 실 브라우저 3단계 검증 대상인데, 본 Phase QA 가 놓치면 회귀 감지 지연

### 3. 좌표계 계약 — 변환 함수 위치와 호출 지점

| 후보                                                | Zustand 불변식 유지 | Rust engine 경계   | 구현 위치                               | 비고                                         |
| --------------------------------------------------- | ------------------- | ------------------ | --------------------------------------- | -------------------------------------------- |
| **A. scene update 루프 마지막 단계에서 shift 적용** | ⭐                  | ⭐ engine 무변경   | `solar-system-scene.ts` `updateAt` 후반 | mesh.position 을 local 좌표로 기록           |
| **B. mesh.position setter 를 wrapper 로 감싸기**    | ⭐                  | ⭐                 | Babylon mesh 전체 hook                  | Babylon 내부 구현 의존, 파손 위험            |
| **C. Rust engine 좌표계 자체를 Floating Origin 화** | ✗                   | ✗ engine 계약 깨짐 | `nbody.rs`                              | 기각 — Rust 는 절대 좌표 (heliocentric) 유지 |

**결정**: **A**.

**구현 위치 명세**:

1. **생성**: `sim-canvas.tsx` 의 `useEffect` 내 `SimulationCore` start 후 `new FloatingOrigin(threshold)` 1개 생성 → window 전역 노출 (`__floatingOrigin`, dev/검증용)
2. **focus 전환 시 reset + setOrigin**: `controller.focusOn(mesh)` 호출 지점 (`instance.setCameraHandlers` 콜백) 에서 `fo.reset()` + `fo.setOriginToBody(meshWorldPos)` 호출
3. **매 프레임 safety net**: `solar-system-scene.ts` `updateAt(jd)` 함수 마지막, 기존 `mesh.position.set(world * SCENE_UNIT_PER_METER)` 루프를 다음으로 교체:
   ```ts
   // 기존: mesh.position.set(world[0] * SCENE_UNIT_PER_METER, ...)
   // 변경: local = fo.toLocal(world_in_meters); mesh.position.set(local[0] * SCENE_UNIT_PER_METER, ...)
   ```
4. **safety net shift 트리거**: `updateAt` 말미에 `fo.update(cameraWorldInMeters)` 1회 호출. shift 발생 시 해당 프레임 mesh 위치는 이미 shift 반영된 local 로 기록됨 (3번 루프가 fo 상태를 읽으므로 자동 일관성)
5. **주석 계약 박제** — mesh.position 할당 지점 직상단에 주석:
   ```ts
   // Floating Origin 계약 (ADR 20260422-floating-origin.md §3):
   //   - world: Heliocentric 절대 좌표 (m) — Rust engine / Zustand store 와 동일
   //   - local: fo.toLocal(world) — scene 삽입 직전 origin shift 적용
   //   - mesh.position: scene unit (local * 1/AU)
   //   이 3단 변환을 우회하면 float32 jitter regression 재발 (#271 재현).
   ```

**CLAUDE.md 주석 계약 vs 구현 drift 교훈 반영** — 본 주석 계약은 테스트로도 커버: `solar-system-scene.test.ts` 에 "mesh.position 이 fo.toLocal(world) 과 일치한다" assert 추가.

### 4. Origin shift threshold 값

| 후보                               | 배경                                              | 장점              | 단점                          |
| ---------------------------------- | ------------------------------------------------- | ----------------- | ----------------------------- |
| **A. 1 AU (1.496e11 m)**           | scene unit 1 = 1 AU, safety net 만 보조           | 분기 빈도 최소    | 1 AU 이동 중 jitter 재발 가능 |
| **B. 0.1 AU (1.496e10 m)**         | DoD β (≤1e5 m) 와 거리 멀지만 jitter 실측 한계 내 | jitter 선제 차단  | focus 전환 주기보다 자주 발동 |
| **C. focus body 주기 의존 (동적)** | 달 (3.84e8 m) 포커스면 threshold ~ 1e9 m          | focus 스케일 적응 | 복잡, 디버깅 어려움           |

**결정**: **A (1 AU = 1.496e11 m)**.

근거:

- B 는 focus 기반 origin shift (결정 1 전략 B) 가 primary 이므로 불필요. safety net 은 focus 없는 free-fly 에서만 발동하며 사용자가 1 AU 이상 이동하는 경우는 "태양계 간 광역 pan" 정도로 빈도 낮음
- C 는 P11-A 비-범위 (Tier Preset 과 유사한 분기 로직). P11-C 에서 재검토
- A 는 `FloatingOrigin` 기본 threshold (10_000 m) 와 다르므로 **생성자에 `threshold = AU` 명시**

### 5. Origin shift 프레임 smoothing (flicker 방어)

| 후보                                  | 효과                 | 구현 복잡도 | 비고                                                                  |
| ------------------------------------- | -------------------- | ----------- | --------------------------------------------------------------------- |
| **A. 즉시 shift (1 프레임 내 적용)**  | ⭐ 단순, 결정론적    | ⭐          | focus 전환은 이미 `Animation.CreateAndStartAnimation` 으로 300ms 보간 |
| **B. 1 프레임 선형 interp**           | △ 수치적 불연속 숨김 | △           | 카메라 interp 와 merge 시 복잡도 증가                                 |
| **C. shift 직후 render skip 1 frame** | ✗ flicker 는 더 보임 | ⭐          | 기각                                                                  |

**결정**: **A (즉시 shift)**.

근거:

- focus 전환은 이미 `CameraController.focusOn` 내 Babylon `Animation` 이 300ms easing 보간 → **animation 시작 시점에 origin shift 1회** 로 처리하면 animation 중간에는 mesh 위치가 local 좌표에서 자연스럽게 animation. 별도 smoothing 불필요
- Safety net shift (A 전략) 는 사용자가 1 AU 이동해야 발동 — 이 순간 사용자는 wide zoom 상태이므로 1 픽셀 shift 는 육안 감지 불가 (scientific 모드 even scale=1 에서 1 AU 이동 중 행성은 sub-pixel)
- 본 Phase 에서 복잡한 smoothing 은 **과공학**. QA 에서 flicker 실측 시 B 로 upgrade 재검토 (재검토 조건 §4)

### 6. DoD 검증 방법

#### 6-α: 픽셀 안정성 DoD (카메라 matrix projection 기반, cross-validate §2 반영)

- **검증 대상**: 1 AU 줌 상태 카메라 pan 시 인접 2프레임 간 body 중심 projected pixel shift
- **측정 방법** (렌더 결과 비의존, 결정론적):
  1. body world 좌표 (m) 를 `fo.toLocal(world) * SCENE_UNIT_PER_METER` 로 scene 좌표 변환
  2. Babylon camera `getViewMatrix()` × `getProjectionMatrix()` 곱을 계산해 clip-space 변환
  3. clip-space → NDC → screen-space (viewport width/height 곱) 로 pixel 좌표 계산
  4. 프레임 N 과 N+1 의 pixel 좌표 차분이 ≤ 0.5px 인지 assert
- **구현 위치**: `apps/web/scripts/browser-verify-floating-origin.mjs` (신규, 기존 browser-verify 스크립트 패턴)
- **보조**: 실 Chrome GUI 육안 확인 (volt #33 "headless false positive" 방어 — headless 만으로 accept 금지)

#### 6-β: 좌표 오차 DoD (dev 빌드 assert) — v2 (2026-04-22 재정정)

- **검증 대상**: 현재 **focus body** 의 `fo.toLocal(world)` 절대값 ≤ 1e5 m (100 km)
- **카메라 local 불포함 (v2 정정)**: Floating Origin 의 목적은 렌더 대상(mesh) 의 scene 좌표 jitter 해소이지 카메라를 원점 근처로 두는 것이 아님. 카메라는 focus body 를 관찰하기 위해 수 AU 떨어진 정상 위치에 배치되며, 카메라 local 에 1e5 m 제한을 두면 scientific 모드 자체가 동작 불가능. float32 jitter 는 mesh local (작은 값) 에서만 발생하므로 카메라 local 은 Three.js/Babylon 내부 부동소수점 관리에 위임
- **비검증 대상**: 원거리 background body (예: 목성 focus 중 태양 좌표 7.7e8 m) — 이들은 LOD low billboard 로 픽셀 오차 은폐 (P11-B 범위). 본 Phase 에선 일반 body 로 렌더되지만 scale=1 scientific 모드에서 sub-pixel 이므로 jitter 가 육안 검출 안 됨
- **cross-validate §2 정정 (2026-04-22)**: 초기 cross-validate 교정안 ([#288 comment](https://github.com/coseo12/astro-simulator/issues/288#issuecomment-4293503652)) 이 "focus 대상 + 카메라" 병행을 제안했으나 실 dev 서버 검증에서 매 프레임 `[floating-origin] camera local 좌표 초과 (≥1e5m)` 로 실패하며 잘못된 설계임을 확인. 카메라 local 조건 제거로 재정정
- **구현 위치**: dev 빌드 한정 (`process.env.NODE_ENV !== 'production'` 가드). `solar-system-scene.ts` `updateAt` 말미:
  ```ts
  if (process.env.NODE_ENV !== 'production') {
    const focusLocal = fo.toLocal(focusBodyWorld);
    console.assert(
      Math.max(Math.abs(focusLocal[0]), Math.abs(focusLocal[1]), Math.abs(focusLocal[2])) < 1e5,
      `[floating-origin] focus body local 좌표 초과: ${focusLocal}`,
    );
    // 카메라 local 체크 없음 — scientific 모드에서 카메라는 수 AU 떨어진 정상 배치.
  }
  ```
- prod 빌드에선 dead-code elimination 으로 제거 (`process.env.NODE_ENV` pattern)

#### 6-γ: Zustand Heliocentric 불변식 테스트 (cross-validate §5 반영)

- **검증 대상**: origin shift 전후 Zustand store state 의 `worldPositions` (있다면) 또는 정보 패널이 읽는 body world 좌표가 절대값 유지 (shift 영향 없음)
- **구현 위치**: `apps/web/src/store/sim-store.test.ts` 에 테스트 1건 추가 ("scientific 모드 origin shift 후에도 store 의 body 좌표는 Heliocentric 절대값 유지"). 단위 테스트 — Babylon scene 없이 `FloatingOrigin` 인스턴스 직접 조작
- **실제로 store 는 현재 body world 좌표를 저장하지 않음** (panels 는 `__solarScene.meshes` 로 접근 또는 어댑터 경유 이벤트). **계약 주석**: `sim-store.ts` 상단에 "만약 body 월드 좌표를 store 에 추가할 때는 반드시 Heliocentric 절대 좌표 (m) 유지. scene 좌표 누출 금지 (#288 ADR §3)" 박제

## 결정

**배선 전략 요약**:

1. **API 확장**: `FloatingOrigin` 에 `setOriginToBody(world: Vec3Double): Vec3Double` 헬퍼 + `onOriginShift(listener): () => void` subscription 2개 추가 (기존 API 파괴적 변경 없음)
2. **Primary (focus body 기반, 결정 §1-B)**: `instance.setCameraHandlers` focus 콜백에서 `fo.setOriginToBody(mesh 의 world 좌표)`
3. **Secondary (safety net, 결정 §1-A)**: `updateAt(jd)` 말미에서 `fo.update(cameraWorldInMeters)` 호출. threshold = 1 AU (§4)
4. **좌표 변환 지점** (결정 §3): `solar-system-scene.ts` `updateAt` 의 mesh.position 할당 루프에서 `fo.toLocal(world)` 사용
5. **Trail/Particle 계약** (결정 §2): subscription API 로 계약만 수립, 실제 구현은 미래 Trail 모듈 도입 시 A 전략 따름
6. **Smoothing**: 없음 — focus animation 기반 자연 smoothing (결정 §5-A)
7. **DoD α 검증**: camera matrix projection 기반 결정론적 pixel shift 계산 + 실 Chrome 육안 (§6-α)
8. **DoD β 검증**: dev 빌드 assert (focus body local ≤ 1e5 m, §6-β v2 — 카메라 local 불포함)
9. **DoD γ 검증**: Zustand Heliocentric 불변식 단위 테스트 + 주석 계약 (§6-γ)
10. **#271 회귀 방어**: 기존 "scientific 모드 jitter" 재현 시나리오 (목성→지구 zoom) 를 browser-verify 스크립트에 영구 등록

**비-범위 재확인** (이슈 #288 본문 + cross-validate §4 반영):

- ❌ LOD 3단계 (P11-B 로 이관)
- ❌ Tier Preset (P11-C 로 이관)
- ❌ Distance Scale 모드 (P11-B)
- ❌ 모바일 Graceful Degradation (P11-C)
- ❌ PBR / Cloud Layer (P12)
- ❌ 토성계 위성 (P13)
- ❌ 위성 Osculating 동기화 구현 (#247, P13 후보)
- ❌ **M1 백업 경로 (double-precision shim)**: WebGPU f64 미지원으로 **폐기** (cross-validate §4). Floating Origin 을 SPOF 로 간주. 실패 판정 시 대체안은 "LOD low billboard 강제 fallback + scientific 모드 경고 배너" (P11-B 에서 결합)
- ❌ Trail/Particle 모듈 실제 구현 (계약만, 미래 Phase)

## 결과·재검토 조건

### 예상 결과

- 목성→지구 zoom in 시 scientific 모드 육안 jitter 제거
- DoD α (projected pixel shift ≤ 0.5px) 충족
- DoD β (focus body local 좌표 ≤ 1e5 m, 카메라 local 불포함 — v2 정정) 충족
- #271 회귀 검증 후 close
- bench 회귀율 < 5% (`fo.toLocal()` 은 subtract 3회 / per-body / per-frame — O(N) 추가, N=태양계 ~100 규모에서 무시 가능)

### Concrete Prediction (CLAUDE.md "신규 데이터 ≠ 신규 코드" 교훈 반영)

추상화 건강성 예측 박제:

1. **P13 토성계 위성 추가 시** (`packages/core/src/ephemeris/solar-system.json` 에 티탄·엔셀라두스·미마스 등 JSON 엔티티 추가) — Floating Origin 관련 코드 변경 **0 줄**. `updateAt` 루프는 body 수에 무관하게 `fo.toLocal(world)` 호출이 동일하게 적용되어야 한다
2. **P11-B LOD 시스템 도입 시** — `FloatingOrigin` 자체 코드 변경 **0 줄**. LOD 모듈은 mesh.position 할당 전에 이미 fo.toLocal 이 적용된 좌표를 읽으므로 투명
3. **P12 PBR 머티리얼 도입 시** — `FloatingOrigin` 자체 코드 변경 **0 줄**. 머티리얼은 좌표와 무관
4. **미래 Trail 모듈 도입 시** — `FloatingOrigin` 코드 변경 **0 줄**. Trail 은 `onOriginShift` subscription 으로 delta 를 받아 자체 버퍼 translate

이 4가지 예측이 실패하면 (= 계층 수정 필요) Floating Origin 추상화가 부족하다는 신호 → ADR Amendment 박제 후 재설계.

### 재검토 조건

다음 중 하나 발생 시 ADR 재검토:

1. **목성→지구 zoom 에서 DoD α 미달 (픽셀 shift > 0.5px)** — §1 알고리즘 재선택 (B→B+A), §4 threshold 강화 (1 AU→0.1 AU) 순으로 조치
2. **focus 전환 시 flicker 관찰** — §5 smoothing A→B upgrade (1 프레임 선형 interp)
3. **Trail 모듈 도입 시 궤적 끊김 regression** — §2 계약 (A: GPU 버퍼 translation) 구현
4. **bench 회귀율 ≥ 5%** — `fo.toLocal` 을 `manyToLocal` batch API 로 전환 (SIMD 최적화 여지)
5. **Zustand store 에 body world 좌표 도입 필요 시** — §3 주석 계약 검증 (Heliocentric 절대값 유지), 위반 시 ADR Amendment
6. **scientific 모드 scale=1 전환에서 jitter 재발견 (다른 경로)** — 원인 추적 후 §3 주석 계약 범위 확장

### 암묵 전제 박제

- Babylon `scene.activeCamera.globalPosition` 단위는 scene unit (1 AU) — `updateAt` 에서 `fo.update` 호출 전 `globalPosition * AU` 로 m 단위 환산 필요
- `controller.focusOn(mesh)` 의 `mesh.absolutePosition` 도 scene unit — 마찬가지로 m 환산 후 `setOriginToBody` 호출
- `FloatingOrigin` 내부는 m 단위 일관 — scene unit 과 혼용 금지 (주석 계약)
- `process.env.NODE_ENV !== 'production'` 가드 — Next.js webpack DCE 로 prod bundle 에서 제거 (기존 `__simStore` 패턴과 동일)

## Amendments

| 날짜       | 변경                                                                                                                                                                                                                                                                                                                                                                             | 이력                     |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 2026-04-22 | DoD β 정의에서 카메라 local 제한 제거 — scientific 모드에서 카메라는 focus body 를 관찰하기 위해 수 AU 떨어진 위치가 정상. cross-validate §2 초기 교정 ("focus 대상 + 카메라" 병행) 이 오류였음을 실 dev 서버 매 프레임 assert 실패로 확인                                                                                                                                       | PR #291 / #292 연쇄 수정 |
| 2026-04-23 | P12 Display-Relative Scale Unification 에서 **역할 축소** (완전 제거 아님, Q10 판정). T3 body tier 에서 focus primary origin 유지, T1/T2 에서 `originOffset=[0,0,0]` no-op. 선행 "scientific 모드 jitter 해소" 는 단일 모드 전환으로 근본 원인 소멸하여 **#288 close**. 상세 맥락은 ADR `20260423-display-relative-scale-unification.md` §Amendment (c) Q10 Floating Origin 확정 | PR #298 Phase C          |

## 참고

- `docs/phases/roadmap-v2-solar-precision.md` §P11 (line 75~96)
- `docs/principles/fact-first.md` §"scientific 모드 UX 보호" (line 89~96)
- `docs/decisions/20260420-mobile-support-suspension.md` — 모바일 보류 (M1 백업 경로 비현실성 근거)
- `docs/retrospectives/p10-retrospective.md` — P10 회고 (#271 known issue 원 기술)
- CLAUDE.md "신규 함수 ≠ 신규 구현" / "신규 데이터 ≠ 신규 코드" / "주석 계약 vs 구현 drift" 교훈
- volt #29 (Phase 분리 릴리스 리듬), volt #33 (headless false positive 방어), volt #47 (ADR Concrete Prediction)
- 기존 자산: `packages/core/src/coords/floating-origin.ts` + `rte.ts` + `vec3.ts`
