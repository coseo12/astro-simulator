# ADR — focus 전환 시 tier oscillate (inner→body→inner) 회귀 fix

- **상태**: Accepted
- **날짜**: 2026-05-04
- **결정자**: architect (#408 사용자 D-T2 forensic 확정 후 위임)
- **관련 이슈**: [#408](https://github.com/coseo12/astro-simulator/issues/408)
- **관련 ADR**: [`20260503-378-focus-frustum-fix.md`](20260503-378-focus-frustum-fix.md) (옵션 D 패턴 인용 — 본질 보존), [`20260504-r-phase-allowlist-guard.md`](20260504-r-phase-allowlist-guard.md) (defense-in-depth 패턴 SSoT), [`20260423-display-relative-scale-unification.md`](../deprecated/decisions/20260423-display-relative-scale-unification.md) (Tier 시스템 SSoT — 폐기 처리되었으나 코드는 유지), [`20260425-r1-store-scene-sync-unification.md`](20260425-r1-store-scene-sync-unification.md) (event 단일 진실원 — 본 ADR §결정 1 의 의존 역전 해결의 근거)
- **교훈 적용**: "주석 계약 vs 구현 drift" (volt [#49](https://github.com/coseo12/volt/issues/49) — `tierFromFocus` 의 0.1 AU 임계가 focusOn 진입 시 보장 안 됨, JSDoc 갱신 의무), "DoD PASS ≠ 제품 동작" (volt [#74](https://github.com/coseo12/volt/issues/74) — #378 옵션 D fix 후 verify 매트릭스 PASS 였으나 사용자 실측 회귀 확정), "헤드리스 ≠ 실 브라우저" (volt [#78](https://github.com/coseo12/volt/issues/78) — DoD-2 사용자 D-T2 실 Chrome 의무), "PM DoD 구조 drift" (volt [#76](https://github.com/coseo12/volt/issues/76) — 본 ADR 의 DoD-1~6 박제 시 ID/산출물/의미 변경 금지)

---

## 배경

PR #399 ([#378](https://github.com/coseo12/astro-simulator/issues/378) 옵션 D fix) + PR #401 ([#397](https://github.com/coseo12/astro-simulator/issues/397) NO-OP 재평가) + PR #406 ([#402](https://github.com/coseo12/astro-simulator/issues/402) R-Phase allowlist) 머지 후 사용자 D-T2 (2026-05-04) frame-by-frame 측정에서 **신규 회귀 확정**:

> "다시 포커스 시 이상현상이 재발했어"
> "금성 클릭시 허공에 포커스됨 또한 한번에 포커스가 자연스럽게 되지않고 반복되듯 줌하는 현상도 발생"
> "한가지 찾은 것은 다른 행성 포커스에서 포커스 이동시 발생하는 것으로 생각됨"

#378 옵션 D 가 **부분 fix** 였음을 16ms frame-by-frame 측정으로 확정. 구체 메커니즘은 다른 행성 focus 상태에서 **다른 행성을 클릭 시** focusOn 의 cam-target tween 보간과 매 frame 의 tier 재판정이 race condition 을 일으키는 것.

### Forensic 데이터 (이슈 본문 §Forensic 매트릭스 인용)

venus focus 상태 (camR=64.569, target=venus pos `(-152.6, -65.5, 7.9)`) → mercury 클릭:

| 단계         | 시간        | tier                     | camR                | target                             | 현상                                         |
| ------------ | ----------- | ------------------------ | ------------------- | ---------------------------------- | -------------------------------------------- |
| 0            | 0~1800ms    | inner                    | 64.569              | venus                              | stable                                       |
| 클릭         | 1817ms      | inner                    | 64.569              | venus                              | mercury 클릭 (animations 0→2)                |
| **1단계**    | 1840~2098ms | inner                    | 64 → 23             | venus → mercury 점진 보간          | 정상 줌                                      |
| **🚨 2단계** | 2116ms      | **inner→body 잘못 진입** | 22.829 → **372982** | mercury → **(0,0,0) origin reset** | **38만 unit jump** + mesh.scaling 4e4배 폭증 |
| **🚨 3단계** | 2353ms      | **body→inner 복귀**      | 387만 → 26.876      | (0,0,0) → mercury                  | tier 복귀 + camR 정상화                      |
| stable       | 2673ms~     | inner                    | 26.876              | mercury                            | 정상                                         |

### 메커니즘 (코드 추적 + 사용자 실측 매칭)

1. `controller.focusOn(mesh)` — `Animation.CreateAndStartAnimation('cam-target', ...)` 가 `camera.target` 을 venus pos → mercury pos 점진 보간 (300ms ExponentialEase)
2. 보간 중간 어느 frame: `cameraFromFocusMeters = camera.radius × metersPerSceneUnit` 가 일시적으로 작아짐 (target 이 mercury 에 가까워질수록)
3. **`updateTierByCamera` (sim-canvas:434, onBeforeRender 매 frame 호출)** → `tierFromFocus(planet, distance)` 가 0.1 AU 미만 임계 트리거 → **tier=body 잘못 반환**
4. `solar-system-scene:setTier('body')` (line 502~) 발동:
   - mesh.scaling = `newScale (T3 body 2.51e-5) / initialScale (T1 solar 8.4e-11)` ≈ 4e4 배 폭증
   - `computeFloatingOriginForTier('body', 'mercury', ...)` → mercury world 좌표로 origin shift
   - mesh.position 즉시 재계산 (line 540~549) → mercury 가 origin = mercury 가 되어 mesh.position ≈ (0,0,0)
   - `runTierTransition({focusMesh, ...})` 발동 → `boundingRadius × 5.9` 로 `targetRadius` 산출. mesh.scaling 4e4 배 폭증 + mercury radius 2.44e6 m → boundingRadius_world ≈ 6.13 (T3) → targetRadius ≈ 36 unit. **그러나 실측 38만 unit 은** mesh.scaling 적용 전 boundingInfo stale 또는 다른 force 가 작용한 결과 (정확한 38만 도출 식은 fix 단계에서 재실측)
   - `camera.target.copyFrom(focusMesh.absolutePosition)` (tier-transition.ts:220) — origin shift 후 mercury mesh 가 (0,0,0) 부근이므로 target 도 (0,0,0) 으로 설정 — **사용자 실측 "target=(0,0,0)" 매칭**
5. 다음 frame: cameraFromFocusMeters 다시 0.1 AU 초과 → `tierFromFocus` 'inner' 반환 → `setTier('inner')` 재발동
6. 사용자 시각상: 1단계 부드러운 줌 + 2단계 잘못된 tier 진입 (body)으로 "허공 점프" + 3단계 inner 복귀 줌 = **3단계 줌 + 허공**

### #378 옵션 D 가 본 회귀를 못 잡은 이유

- 옵션 A (lowerRadiusLimit 동적 완화): focusOn 진입 시 cam-radius animation 의 clamp 차단. 본 회귀는 cam-radius 보다 cam-target tween 의 race 가 원인 → 직교
- 옵션 B (boundingInfo 강제 갱신): mesh.scaling 변경 직후 boundingInfo 정확. 본 회귀는 mesh.scaling 자체가 잘못 발동 (tier oscillate) → 직교

본 회귀는 **focusOn 의 cam-target tween + 매 frame tier 재판정** 의 새로운 race 메커니즘.

---

## 후보 비교 (4 옵션 + 의존 역전 해결 방법)

### F1 — focusOn 진입 시 final tier 사전 결정 + setTier 호출 (사전 정착)

**변경**: `focusOn(target)` 진입 시 첫 줄에서 `tierFromFocus(focusBody.kind, finalDistance)` 호출 → `solar-system-scene.setTier(finalTier)` 사전 호출 → 그 다음 `Animation.CreateAndStartAnimation` 시작. tier 가 보간 시작 전 정착되므로 frame race 자체 차단.

| 축        | 평가                                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------- |
| 효과      | tier oscillate 원천 차단. 보간 진행 중 `updateTierByCamera` 가 동일 tier 반환 → no-op                    |
| 위험      | `focusOn` 이 simulation-core 또는 solar-system-scene 의 setTier 를 호출해야 함 — **의존 역전 검토 필요** |
| 비용      | 의존 역전 해결 방법 (a/b/c) 에 따라 5~30줄                                                               |
| 회귀 가드 | tier 가 사전 결정되므로 cam-target tween 보간 race 와 무관                                               |

#### F1 의존 역전 해결 방법 (a/b/c)

현재 의존 흐름:

```
sim-canvas (UI) → sendCommand({type:'focusOn', bodyId})
                → simulation-core 'focusOn' case → bodySelected event emit
                → core-adapter → store.setSelectedBody(id)
                → sim-canvas subscribe → syncFocusToScene(id)
                  ├─ solar.setFocusOrigin(bodyId)  // origin shift
                  └─ controller.focusOn({mesh})    // animation 시작
```

`controller.focusOn` (camera-controller.ts) 가 simulation-core / solar-system-scene 을 모름 (단방향 — camera 전용 클래스). setTier 주입 방법:

**(a) focusOn 에 finalTier 인자 주입** — `controller.focusOn({mesh, finalTier})` 시그니처 확장. sim-canvas 의 syncFocusToScene 이 호출 전 tierFromFocus 계산 후 전달.

- 장점: camera-controller 가 setTier 자체 호출 안 함 — 단방향 의존 유지. 인자 1개 추가만.
- 단점: setTier 호출 시점이 syncFocusToScene 으로 이동 (camera animation 시작 전).

**(b) syncFocusToScene 이 setTier 직접 호출 후 focusOn** — sim-canvas:347~361 의 syncFocusToScene 헬퍼가 `solar.setTier(finalTier)` 를 setFocusOrigin 직후 + focusOn 직전에 호출.

- 장점: camera-controller 변경 0. focusOn 시그니처 그대로.
- 단점: tier 결정 로직이 sim-canvas 에 있게 됨 — 도메인 정책 (tierFromFocus) 이 UI 레이어에 노출. 향후 다른 진입점 (URL / programmatic) 추가 시 동일 로직 중복.

**(c) syncFocusToScene 헬퍼 자체에 wrap** — 현재 syncFocusToScene 이 setFocusOrigin + focusOn 묶음. 여기에 setTier 추가하면 (b) 와 동일하지만 **헬퍼 추출** (예: `solar.applyFocusTier(focusBody)`) 로 도메인 로직을 scene API 로 노출.

- 장점: 도메인 로직이 scene 으로 이동 — UI 가 정책 모름. 향후 진입점 추가 시 1곳 수정.
- 단점: solar-system-scene 신규 API 추가 (1개).

**채택**: **(c)** — `solar.applyFocusTier(bodyId, cameraDistMeters)` 를 solar-system-scene 에 신규 API 박제. setFocusOrigin + setTier 를 묶어 도메인 정책을 scene 단일 진실원에 집중. sim-canvas 의 syncFocusToScene 은 `applyFocusTier` 호출 후 `controller.focusOn` 호출. UI 는 정책 모름.

근거:

- (a) 는 camera-controller 가 tier 라는 도메인 개념을 입력 받게 되어 단일 책임 위배 (camera 는 camera 만)
- (b) 는 sim-canvas 가 tier 정책 보유 — URL/programmatic 진입 추가 시 drift
- (c) 는 R1 #334+#335 ADR 의 "event 단일 진실원" 정책 정합 — sim-canvas 는 store subscribe 후 scene API 1개 호출

### F2 — runTierTransition 진행 중 tier 재판정 lock

**변경**: `tier-transition.ts` 의 `runTierTransition` 이 module-level 또는 closure 레벨 `transitionInProgress` 플래그를 set/clear (animation 시작/cleanup 시점). `solar-system-scene.updateTierByCamera` 가 lock 일 때 no-op (현 tier 반환만).

| 축        | 평가                                                                                                                                                           |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 효과      | runTierTransition 진행 중 oscillate 차단 — F1 만으로 못 잡는 edge case (예: focus body 변경 + focusOn 호출 누락 경로, 또는 animation 진행 중 다른 동작) 안전망 |
| 위험      | lock 해제 시점 결정 필요 (cleanup 콜백 / fallback timer 둘 다 idempotent 처리)                                                                                 |
| 비용      | tier-transition.ts 5줄 + solar-system-scene.updateTierByCamera 1줄                                                                                             |
| 회귀 가드 | F1 만으로 정상 케이스 처리 + F2 가 edge case 안전망 (defense-in-depth — #378 옵션 D 패턴 동일)                                                                 |

#### F2 lock 메커니즘 상세

- **위치**: `tier-transition.ts` 의 `runTierTransition` 클로저 내부 + 외부에서 읽을 수 있는 getter export. 또는 `solar-system-scene.ts` 의 closure 변수로 박제 후 `updateTierByCamera` 가 직접 참조 (closure 공유로 단순).
- **set 시점**: `runTierTransition` 진입 직후 (line 165 직후) `transitionInProgress = true`
- **clear 시점**: `cleanup` 함수 내부 (line 260~264 의 `releaseControl()` 직후) `transitionInProgress = false`. `released` 플래그처럼 idempotent — 정상 종료 (onAnimationEnd) / fallback timer / visibilitychange 어느 쪽이 먼저 발동하든 안전.
- **`updateTierByCamera` 분기**:
  ```ts
  if (transitionInProgress) {
    return activeTier; // no-op, 현 tier 반환 (호출자 스킴 변경 없음)
  }
  ```
- **lock 시간 한계**: 정상 300ms (Animation 종료) ~ 500ms (fallback). 그 안에 사용자가 다른 body 클릭 시 → focusOn 의 setTier 가 lock 해제 후 발동. 이 케이스 자체가 드물고 lock 해제 후 정상 흐름.

**채택 시 lock 해제 시점**: `cleanup` 함수 내부 — `releaseControl()` 와 동일 순서로 idempotent 처리. visibilitychange 경로도 동일하게 cleanup 호출하므로 안전.

### F3 — hysteresis 마진 강화 (±15% → ±50%)

**변경**: `tier.ts` 의 `TIER_HYSTERESIS = 0.15` → 0.50 으로 상수 변경. 또는 `tierFromFocus` 의 `0.1 * AU` 임계를 ±50% 마진 적용 함수로 교체.

| 축        | 평가                                                                                                                                                                                                                    |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 효과      | tier 경계 근처 왕복 빈도 감소 — **부분 해결**                                                                                                                                                                           |
| 위험      | legitimate tier 전환도 지연. 사용자가 의도적 fast zoom 시 응답성 저하. ±50% 가 적절한가? venus → mercury target 보간 거리 (~150 → ~200 unit) 의 race 시간 (~250ms) 안에 0.1 AU 임계가 ±50% 마진을 넘는지 정량 산출 필요 |
| 비용      | 1줄 (상수 변경) ~ 5줄 (함수 분기)                                                                                                                                                                                       |
| 회귀 가드 | **불충분** — F1+F2 의 source-level 차단 대비 임시 완화                                                                                                                                                                  |

**기각 사유**: forensic 데이터의 38만 unit jump 가 단순 hysteresis 부족이 아닌 race 자체. 마진을 늘려도 보간 시간 동안 임계 통과 가능. 또한 `tierFromFocus` 는 hysteresis 가 적용되지 않음 (focus 경로는 절대 임계). hysteresis 는 free-fly 경로 전용 메커니즘이므로 본 회귀에 직교.

### F4 — focusOn cam-target tween 폐기 + 즉시 jump

**변경**: `camera-controller.ts focusOn()` 의 cam-target Animation 제거. `camera.target.copyFrom(targetPos)` 즉시 할당. cam-radius 만 ExponentialEase 보간.

| 축        | 평가                                                                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 효과      | target 이 처음부터 mercury 위치 → cameraFromFocusMeters 가 보간 중간값 거치지 않음 → race 차단                                                        |
| 위험      | UX 부자연성. 사용자 시각상 "카메라가 회전하지 않고 줌만" 보임. 다른 행성으로 시점이 jump 하는 효과 — **현재 부드러운 회전 + 줌 vs 줌만** UX 비교 필요 |
| 비용      | 8줄 (Animation 호출 제거 + 즉시 할당)                                                                                                                 |
| 회귀 가드 | F1 / F2 와 직교 (cam-target tween 자체 폐기)                                                                                                          |

**기각 사유**:

1. UX 후퇴 — 현재 venus → mercury 전환 시 **부드러운 호 회전** (camera target Animation 의 시각 효과) 가 사라짐. ArcRotateCamera 는 target 회전 + radius 줌이 결합되어 자연스러운 궤도 시각 효과를 만든다. target jump 시 1단계 줌만 남아 평면 줌 인 → 줌 아웃 효과
2. **폐기 프레이밍 함정 회피** — F4 가 단순해 보이지만 UX 평가 누락. F1+F2 가 race 만 정확히 차단하면서 UX 보존
3. **camera-controller 의 단일 책임 강화 방향에 역행** — focusOn 은 "특정 mesh 로 부드러운 전환" 이 SSoT. cam-target Animation 폐기는 SSoT 의 핵심을 제거

### **권장: F1 + F2 defense-in-depth (#378 옵션 D 패턴 재사용)**

- **F1 사전 결정**: 정상 케이스 oscillate 100% 차단. focusOn 진입 시 final tier 정착으로 "보간 중 race" 자체 발생 안 함
- **F2 lock**: edge case 안전망. F1 누락 경로 (예: 향후 다른 진입점 추가 시 applyFocusTier 호출 누락) 또는 transition 진행 중 user manual zoom 등 미지 케이스 차단
- 의존 역전 해결: **(c) `solar.applyFocusTier(bodyId, cameraDistMeters)` 신규 scene API**

#### 사용자 D-T2 시각 검증 의무 (헤드리스 ≠ 실 브라우저, volt #78)

- F1+F2 적용 후 자동 verify 매트릭스 PASS 와 별도로 사용자 D-T2 (실 Chrome) 의무
- focus 전환 매트릭스 9 cells (sun/mercury/venus × sun/mercury/venus, 본인 → 본인 제외 6 cells)
- 단일 줌 + tier oscillate 0 + camR animation 단조 (단조 감소 또는 단조 증가) 시각 확인

---

## 결정

**F1 + F2 채택. defense-in-depth 적용.**

### 결정 1 — F1 의존 역전: (c) `solar.applyFocusTier` 신규 scene API

```typescript
// packages/core/src/scene/solar-system-scene.ts (신규 export)
applyFocusTier: (bodyId: string, cameraDistMeters: number) => Tier;

// 구현 (focusBodyIdForAssert + setTier 묶음)
const applyFocusTier = (bodyId: string, cameraDistMeters: number): Tier => {
  const body = bodiesById.get(bodyId);
  if (!body) return activeTier;
  // 1. setFocusOrigin + tier 결정을 묶어 단일 시점 정착
  const finalTier = tierFromFocus(body.kind, cameraDistMeters);
  if (finalTier !== activeTier) {
    setTier(finalTier); // 기존 setTier 가 origin shift + mesh rebuild + runTierTransition 까지 처리
  }
  return finalTier;
};
```

**호출 시점**: `sim-canvas.tsx` 의 `syncFocusToScene` 헬퍼에서 `solar.setFocusOrigin(bodyId)` 직후 + `controller.focusOn({mesh})` 직전:

```typescript
const syncFocusToScene = (bodyId: string | null) => {
  if (bodyId !== null) {
    const mesh = solar.meshes.get(bodyId);
    if (mesh) {
      solar.setFocusOrigin(bodyId);
      // F1: focusOn 진입 시 final tier 사전 결정 + setTier
      // cameraDistMeters 는 focusOn 후 desiredRadius × metersPerSceneUnit (newTier)
      // = max(meshRadius × 5, meshRadius + 0.01) × metersPerSceneUnit
      // 단순화: 현재 tier 의 meshRadius × 5 × renderScaleForTier(activeTier) 역수
      const meshRadius = mesh.getBoundingInfo().boundingSphere.radiusWorld;
      const desiredRadius = Math.max(meshRadius * 5, meshRadius + 0.01);
      const metersPerSceneUnit = 1 / renderScaleForTier(solar.getTier());
      const cameraDistMeters = desiredRadius * metersPerSceneUnit;
      solar.applyFocusTier(bodyId, cameraDistMeters);
      controller.focusOn({ mesh });
    }
  } else {
    solar.clearFocus();
    controller.reset(35);
  }
};
```

**근거**:

- R1 #334+#335 ADR 의 "event 단일 진실원" 정책 정합 — sim-canvas 는 store subscribe 후 scene API 호출 (도메인 정책 미보유)
- camera-controller 의 단일 책임 (camera 전용) 보존
- 향후 진입점 추가 시 `applyFocusTier` 1곳만 호출하면 정합

### 결정 2 — F2 lock: closure 변수 in solar-system-scene.ts

```typescript
// packages/core/src/scene/solar-system-scene.ts
let tierTransitionInProgress = false;

const setTier = (tier: Tier) => {
  if (tier === activeTier) return;
  // ... 기존 mesh.scaling / origin / mesh.position 재계산 ...

  const cam = scene.activeCamera;
  if (cam && isArcRotateCamera(cam)) {
    pendingTierCleanup?.();
    tierTransitionInProgress = true; // F2: lock 진입
    const focusMesh = focusBodyIdForAssert ? meshes.get(focusBodyIdForAssert) : undefined;
    pendingTierCleanup = runTierTransition({
      scene,
      camera: cam,
      oldScale,
      newScale,
      ...(focusMesh ? { focusMesh } : {}),
      onComplete: () => {
        tierTransitionInProgress = false;
      }, // F2: lock 해제 (cleanup 시점 idempotent)
    });
  }
};

const updateTierByCamera = (cameraFromSunMeters, cameraFromFocusMeters): Tier => {
  if (tierTransitionInProgress) {
    return activeTier; // F2: transition 중 no-op
  }
  // ... 기존 로직 ...
};
```

**lock 해제 옵션**:

- (i) `runTierTransition` 의 cleanup 함수 내부에서 `tierTransitionInProgress = false` (호출자가 onComplete 콜백 주입)
- (ii) tier-transition.ts 자체에 module-level export `isTierTransitionInProgress()` getter
- (iii) Animation onAnimationEnd 콜백 직접 등록 — 단 fallback timer / visibilitychange 도 발동 가능 → 다중 해제 idempotent 처리 필요

**채택**: **(i) onComplete 콜백 주입** — `runTierTransition` 시그니처에 `onComplete?: () => void` 추가. 정상 종료 (onAnimationEnd) / fallback timer / visibilitychange 모두 cleanup 호출하므로 onComplete 가 idempotent 1회 호출. tier-transition.ts 의 `released` 플래그 패턴과 동일.

근거: tier-transition.ts 의 cleanup 메커니즘이 이미 idempotent (released 플래그) → onComplete 도 동일 패턴 박제. closure 변수 in solar-system-scene 으로 단순 (module-level export 회피).

### 결정 3 — DoD 박제 (이슈 본문 SSoT, volt #76 PM DoD 구조 drift 가드)

이슈 본문 §DoD 1~6 를 그대로 박제. ID/산출물/의미 변경 금지. 파라미터 (수치/경계) 만 조정 가능.

- **DoD-1**: tier oscillate 차단 — venus → mercury 시 tier 전환 횟수 ≤ 1 / camR animation 단일 단계 / target jump 0
- **DoD-2**: 사용자 D-T2 (실 Chrome 의무) — 9 cells (3×3) 매트릭스 (자기 → 자기 6 제외)
- **DoD-3**: 회귀 가드 신설 — `apps/web/scripts/browser-verify-focus-transition.mjs`
- **DoD-4**: 단위 테스트 — `tier-transition.test.ts` + `simulation-core-camera-sync.test.ts` 갱신
- **DoD-5**: ADR 박제 (본 문서)
- **DoD-6**: CHANGELOG `### Behavior Changes`

### 결정 4 — wasm-safe 패턴 강제 (PR #407 학습)

PR #407 (R-Phase allowlist) 의 turbopack `__dirname` `/ROOT/...` SSR 500 회귀 학습:

- **sub-path export 금지**: `packages/core/package.json` 의 `exports` field 에 신규 sub-path 추가 금지. `applyFocusTier` 는 기존 `./scene` namespace 또는 main entry (`@astro-simulator/core`) 로 export
- **SSoT 위치 권장**: `solar-system-scene.ts` 인라인 또는 동일 파일 내 helper. 별도 파일 분리 시 `scene/index.ts` re-export 만 사용
- **dev 환경 SSR 200 사전 검증 의무 (DoD 격상)**: developer 단계 PR 생성 전 필수. `pnpm --filter @astro-simulator/core build` 직후 `pnpm --filter @astro-simulator/web dev` 기동 + `curl -I http://localhost:3000/ko | head -1` 으로 `HTTP/1.1 200` 확인. **DoD-7 신규 항목** (이슈 본문 §DoD 갱신 권고 — PM/사용자 승인 후 박제)
- **CI 가드 (후속 인프라 이슈 분리)**: 향후 `verify:ssr-200` 같은 step 통합 가능 — 본 ADR 비-범위. **근거**: 현재 스프린트는 #408 focus tier oscillate fix 가 핵심이며 SSR CI 인프라는 직교 비목표 (CRITICAL #6 보존). 단발 fix 와 인프라 변경 동시 진행은 Phase 분리 릴리스 리듬 정책 (CLAUDE.md `### 릴리스` §Phase 분리) 위반. cross-validate Gemini 권고 "필수 DoD 격상" 은 dev selfcheck 강화로 수용, CI 격상은 후속 분리

근거: PR #407 reviewer/qa BLOCK 4건 발생 후 dev 환경 검증 누락이 원인으로 확정. wasm-pack + turbopack + sub-path export 결합 환경에서 dist 의존이 SSR 빌드 시 `__dirname` resolution 실패 → 500 에러. 본 ADR 작성 단계에서 사전 박제로 회귀 차단.

### 결정 5 — 회귀 가드 신설 (DoD-3 상세)

`apps/web/scripts/browser-verify-focus-transition.mjs` 신규:

- **매트릭스**: 활성 R-Phase body 3개 (sun/mercury/venus) × 3개 = 9 cells. 자기 → 자기 3 제외 → **6 transition cells**
- **각 cell 측정 항목**:
  - tier 전환 횟수 — `solar.getTier()` snapshot 을 click 직후 0~1000ms 동안 16ms 간격 캡처. 변화 횟수 ≤ 1 단언
  - target jump (origin reset) — `camera.target` snapshot 동일 간격. `(0,0,0)` 등장 0 단언 (단 `sun → ?` 케이스는 제외 — sun 자체 origin 이 (0,0,0))
  - camR animation 단조성 — `camera.radius` snapshot 동일 간격. **단조 변화** 단언 (감소 또는 증가, jump > 1000 unit 0)
- **CI 통합**: `.github/workflows/ci.yml` 의 `detect-and-test` job 에 step 추가. R-Phase 진입 시 매트릭스 활성 body 동기 갱신 의무 (#406 ADR §결정 4 의 4곳 박제 패턴 재사용)

---

## 결과·재검토 조건

### 재검토 트리거

1. **사용자 D-T2 회귀 보고**: F1+F2 적용 후에도 다른 회귀 발현 시 본 ADR 재검토 + 새로운 ADR 분리
2. **R4+ 진입 시 (지구/목성/해왕성)**: 활성 body 추가 시 매트릭스 6 → 12 → 20 → 30 cells 확장. 새로운 oscillate 패턴 발현 가능성 점검
3. **tier 시스템 폐기 시**: P12 ADR 폐기되었으나 코드 잔존. 향후 v3 tier 폐기 진행 시 본 ADR 도 동반 폐기 (`docs/deprecated/decisions/`)
4. **headless 검증과 사용자 실측 불일치 누적**: agent-browser 실측 PASS 였으나 사용자 D-T2 FAIL 패턴이 3회 이상 반복 → headless verify 매트릭스 자체 재설계 필요 (volt #78 가드 강화)

### Concrete Prediction (검증)

- **Prediction A (F1 효과)**: F1 만 적용 시 venus → mercury 전환 시 tier 전환 횟수 = 1, camR animation 단일 단계, target jump 0
- **Prediction B (F2 안전망)**: F1 누락 경로 인공 시뮬 (예: applyFocusTier 호출 직접 우회) 시에도 transitionInProgress lock 으로 oscillate 차단 — 단위 테스트 작성 가능
- **Prediction C (UX 보존)**: F1+F2 적용 후 cam-target Animation 보간 효과 유지 — 사용자 시각 검증 시 "부드러운 회전 + 줌" 인지

각 Prediction 은 developer 구현 후 실측 매트릭스에서 확인. 위반 시 본 ADR Amendment 또는 신규 ADR 분리.

### 비-범위

- #378 옵션 D 본질 (lowerRadiusLimit 동적 완화 + boundingInfo 강제 갱신) **보존** — 두 메커니즘 모두 다른 회귀 (T1 시점 clamp + boundingInfo stale) 차단용. 본 ADR 변경과 직교
- #402 R-Phase allowlist 가드 (#406 ADR) 침범 금지 — 본 ADR 은 활성 body 의 focus 전환만 다룸
- #380 줌 고정 / #400 AU 슬라이더 — 별도 sprint
- hysteresis 마진 강화 (F3) — 기각 (race 자체 차단이 아닌 부분 완화)
- focusOn cam-target tween 폐기 (F4) — 기각 (UX 후퇴)
- PR 템플릿 R-Phase 진입 체크리스트 — 후속 인프라 이슈 분리 (#406 ADR 비-범위와 동일)
- ssr-200 CI step — 후속 인프라 이슈 분리

### 비-목표 가드 (PM DoD 구조 drift 방지, volt #76)

본 ADR 의 DoD-1~6 ID/산출물/의미는 라운드 N+1 에서 재구조화 금지. 사용자 응답으로 조정 가능한 항목은 **각 DoD 의 파라미터** (예: tier 전환 횟수 임계, lock 해제 시점, hysteresis 마진 수치) 만. 변경 시 본 ADR 에 Amendment 섹션 추가 + diff 명시.

---

## 교차검증 반영 사항

> developer 단계 진입 전 필수 — Gemini cross-validate 1회 호출 결과 박제 (anchor=ADR 신규)

### 호출 전 Claude 편향 셀프 체크 (4종)

| 축            | 통과 여부 | 비고                                                                                                                                                       |
| ------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 낙관적 일정   | 통과      | F1 의존 역전 (a/b/c) 비교 + (c) 채택 근거 명시. F1 만으로 단순 해결 함정 회피 — F2 defense-in-depth 필수 박제                                              |
| 결합 간과     | 통과      | event 단일 진실원 정책 (R1 #334+#335) 과의 정합성 명시. focusOn 의 도메인 결합 (camera-controller / simulation-core / solar-system-scene) 분석 후 (c) 채택 |
| 폐기 프레이밍 | 통과      | F4 (cam-target tween 폐기) 의 단순함 함정 회피 — UX 후퇴 + 단일 책임 위배 근거로 기각                                                                      |
| 순수주의      | 통과      | F3 (hysteresis ±50%) 의 "제대로 fix" 함정 회피 — race 자체 차단이 아닌 부분 완화로 기각. 비-범위 (#378 옵션 D 보존) 침범 0                                 |

### cross-validate 결과 분류

- **호출 일시**: 2026-05-04 04:13~04:14 KST
- **anchor**: ADR 신규 — 20260504-focus-tier-oscillate-fix (#408)
- **outcome**: applied (exit 0)
- **로그**: `.claude/logs/cross-validate-architecture-20260504-041344.log`
- **모델**: gemini-2.5-pro

#### 합의 (Claude 설계와 일치한 Gemini 지적)

1. **F1+F2 defense-in-depth 채택 타당성** — Gemini: "정상 케이스 race 원천 차단 + 엣지 케이스 2중 방어, 검증된 패턴". Claude 원안 동일.
2. **(c) `applyFocusTier` 신규 scene API 의 SRP/SSoT 원칙 준수** — Gemini: "도메인 로직을 UI 레이어가 아닌 도메인 레이어에 캡슐화하여 응집도와 재사용성 확보". Claude 원안 동일.
3. **F3 (hysteresis ±50%) / F4 (cam-target tween 폐기) 기각 근거** — Gemini: "임시방편 또는 UX 후퇴, 본질과 직교". Claude 원안 동일.
4. **회귀 가드 신설 + R4+ 매트릭스 확장 인지** — Gemini: "유사 회귀 자동 감지 안전망". Claude 원안 동일 (재검토 트리거 §2 R4+ 진입).
5. **wasm-safe 패턴 사전 박제 (결정 4)** — Gemini: "많은 설계 문서가 놓치는 부분, 과거 SSR 500 교훈 반영". Claude 원안 동일.
6. **DoD 명세 완결성 (테스트/문서/CHANGELOG)** — Gemini: "단순 해결을 넘어 미래 유지보수 고려". Claude 원안 동일.

#### 이견 수용 (Gemini 근거가 합리적이어서 수정)

1. **dev 환경 SSR 200 검증의 DoD 격상** — Gemini 권고: "결정 4 의 SSR 200 검증을 '선택'에서 '필수 DoD' 로 격상 (4건 BLOCK 사례)". Claude 원안: "후속 인프라 이슈 분리". **수용 (부분)**: dev 단계 selfcheck 의무 (수동 `curl -I http://localhost:3000/ko`) 를 **DoD-7 신규 항목 권고** 로 격상 + 결정 4 본문에 박제. CI 격상은 후속 분리 유지 (스프린트 비목표 보존, Phase 분리 릴리스 리듬). 변경: 결정 4 §"dev 환경 SSR 200 사전 검증 의무 (DoD 격상)" 박제 + DoD-7 권고 명시
2. **"매직 넘버" 상수화** — Gemini 권고: "결정 1 의 `cameraDistMeters` 계산 `5`/`0.01` 을 `FOCUS_RADIUS_MULTIPLIER=5` 같은 명명 상수로 추출". Claude 재분석: `tier-transition.ts:63` 에 이미 `FOCUS_RADIUS_MULTIPLIER = 5.9` (focus 경로 V5 달성 공식) 박제됨. `camera-controller.ts:56` 의 `5` 는 user-trigger 한정 분리 의도 (주석 line 46~50). **수용 (부분 — developer 단계 권고)**: 본 ADR 코드 스니펫은 설계안 레벨이고, developer 가 syncFocusToScene 헬퍼 구현 시 `meshRadius * 5` 를 camera-controller 의 `FOCUS_USER_RADIUS_MULTIPLIER` 같은 명명 상수로 추출 권고. ADR 본문 변경 0, **developer 인계 §매직 넘버 상수화** 항목 추가

#### Claude 재분석으로 기각한 Gemini 제안

(없음 — Gemini 의 모든 지적이 합리적이거나 부분 수용)

#### 고유 발견 (후속 분리)

(현재 PR 범위 내 모든 합의/이견 수용 처리 — 후속 분리 항목 없음)

> **호출 전 Claude 편향 셀프 체크 통과**: 4종 모두 통과. 호출 시 명시 질문으로 삽입한 축은 없음 (모든 축 사전 통과).

---

## Developer 인계

### 시작 지점 (구현 순서)

1. **packages/core/src/scene/solar-system-scene.ts**
   - `applyFocusTier(bodyId, cameraDistMeters): Tier` 신규 export 박제 (결정 1)
   - `tierTransitionInProgress` closure 변수 + `setTier` 분기 (결정 2)
   - `updateTierByCamera` 의 lock 분기 (결정 2)
2. **packages/core/src/scene/tier-transition.ts**
   - `TierTransitionOptions` 에 `onComplete?: () => void` 추가
   - `runTierTransition` 의 cleanup 함수에서 `onComplete()` 호출 (idempotent)
3. **packages/core/src/scene/index.ts**
   - `applyFocusTier` export 추가 (sub-path export 추가 금지 — 기존 scene namespace 활용, 결정 4)
4. **apps/web/src/components/sim-canvas.tsx**
   - `syncFocusToScene` 헬퍼 변경 (결정 1 코드 스니펫 참조)
5. **apps/web/scripts/browser-verify-focus-transition.mjs** (신규, 결정 5)
   - 6 transition cells 매트릭스 자동화
6. **.github/workflows/ci.yml**
   - `detect-and-test` job 에 verify step 추가 (#378/#379/#391/#402 패턴 일관)
7. **apps/web/package.json**
   - `verify:focus-transition` script
8. **단위 테스트**
   - `packages/core/src/scene/tier-transition.test.ts` 갱신 — onComplete 콜백 호출 단언
   - `packages/core/src/scene/solar-system-scene-apply-focus-tier.test.ts` (신규) — applyFocusTier 동작 단언
   - `apps/web/src/components/__tests__/sim-canvas.test.ts` (있다면) 갱신
9. **CHANGELOG.md**
   - `### Behavior Changes` — focus 전환 시 tier 사전 결정 정책 박제

### 매직 넘버 상수화 (Gemini cross-validate 부분 수용 권고)

`syncFocusToScene` 헬퍼의 `meshRadius * 5` / `meshRadius + 0.01` 은 camera-controller.ts 의 user focus 트리거와 동일 식. **권고**: `camera-controller.ts` 에 `FOCUS_USER_RADIUS_MULTIPLIER = 5` / `FOCUS_USER_RADIUS_MIN_PADDING = 0.01` 명명 상수 추출 + sim-canvas 의 헬퍼가 import 하여 사용. ADR §결정 1 코드 스니펫의 가독성 권고 — 본 ADR 결정 사항 아님 (developer 자율).

### dev 환경 SSR 200 사전 검증 의무 (결정 4)

PR 생성 전 필수 selfcheck:

```bash
pnpm --filter @astro-simulator/core build
pnpm --filter @astro-simulator/web dev &  # background
sleep 5
curl -I http://localhost:3000/ko | head -1
# 기대: HTTP/1.1 200 OK
```

PR 본문에 결과 (status code) 박제. PR #407 의 turbopack `__dirname` `/ROOT/...` SSR 500 회귀 재발 방지.

### 참조 문서

- 본 ADR (이 파일)
- [`20260503-378-focus-frustum-fix.md`](20260503-378-focus-frustum-fix.md) — 옵션 D 패턴 (defense-in-depth 본질)
- [`20260504-r-phase-allowlist-guard.md`](20260504-r-phase-allowlist-guard.md) — defense-in-depth 패턴 SSoT + 4곳 동시 박제 절차 인용
- [`20260425-r1-store-scene-sync-unification.md`](20260425-r1-store-scene-sync-unification.md) — event 단일 진실원 정책 (의존 역전 (c) 채택 근거)
- 이슈 [#408](https://github.com/coseo12/astro-simulator/issues/408) — 사용자 D-T2 forensic 매트릭스 SSoT

### 명시적 비-범위 (이번 PR 에 절대 손대지 말 것)

- #378 옵션 D 코드 (lowerRadiusLimit / boundingInfo 강제 갱신) — 보존
- #402 R-Phase allowlist (PR #406 머지) — 침범 금지
- #380 줌 고정 — 별도 sprint
- #400 AU 슬라이더 — 별도 sprint
- hysteresis 마진 (TIER_HYSTERESIS = 0.15) — 본 ADR §F3 기각, 변경 0
- camera-controller.ts focusOn 의 cam-target Animation — 본 ADR §F4 기각, 보존
- ssr-200 CI step 추가 — 후속 인프라 이슈 분리
