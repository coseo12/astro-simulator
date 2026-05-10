# ADR: #380 줌인 후 카메라 고정 — forensic 정적 조사 + Provisional fix 옵션 비교

- **상태**: **Accepted** (2026-05-11 Amendment — §Amendment 2026-05-11 사용자 D-T2 양상 기반 G8 신규 + Option D+G8a 확정)
- **날짜**: 2026-05-09 (initial Provisional) / 2026-05-11 (Amendment Accepted)
- **결정자**: architect
- **이슈**: [#380](https://github.com/coseo12/astro-simulator/issues/380) (R3 D-T2 가드 발견 #4)
- **선행**:
  - PR #377 (R3 D-T2 5건 회귀 박제 — 본 이슈 발화점, close)
  - 이슈 #373 (D-T2 #1 옵션 c — 별도, 직접 무관)
  - ADR `20260422-floating-origin.md` (Floating Origin primary/safety 분리)
  - ADR `20260423-display-relative-scale-unification.md` (P12 Tier 엔진 — DEPRECATED 이지만 코드 잔존)
  - PR #304 (P12-B 카메라 dolly + 입력 잠금 — `runTierTransition` 도입)
  - PR #410 (#408 focus 전환 시 tier oscillate F1+F2)
- **관련 cross-link**:
  - `20260424-p11-b-lod-design.md` (LOD 3단)
  - `20260425-r1-store-scene-sync-unification.md` (focus ↔ scene 단일 경로)

## 배경

R3 (#369) PR #371 머지 후, R3 fix PR (#377) 을 기준으로 진행한 D-T2 사용자 검증 (2026-04-30) 에서 **줌인 후 카메라가 고정되어 추가 인터랙션이 반응하지 않는** 회귀가 5건 중 #4 로 발견. #373 옵션 c (mercury/venusScale 인하) 와 직접 무관 — 별도 forensic 트랙.

본 ADR 은 **정적 조사 단계** 의 결과물. 사용자 D-T2 매트릭스 (정확한 거리 임계 / 죽는 인터랙션 분류 / 실 Chrome 재현) 는 본 ADR §재검토 조건 단계에서 별도 요청한다 (volt #67 — Explore 미결정 시 debug 스크립트 실측 선행 → 본 케이스는 정적 조사 + 사용자 D-T2 가 두 단계로 분리된 변형).

## forensic 관찰

### 1. 카메라 시스템 식별 — Babylon ArcRotateCamera + 커스텀 wrapper

이슈 본문은 "OrbitControls" 가설을 시사하나 **실제 코드는 Three.js 가 아닌 Babylon.js 기반** 이다. 정적 조사 결과 카메라 스택은 다음 3계층:

1. **`packages/core/src/scene/camera.ts:setupArcRotateCamera`** — Babylon `ArcRotateCamera` 생성 + 옵션 박제 + `attachControl(canvas, true)`
2. **`packages/core/src/scene/camera-controller.ts:CameraController`** — `focusOn(mesh)` / `reset(35)` 트윈 (Babylon `Animation.CreateAndStartAnimation` 으로 `target` + `radius` interp)
3. **`packages/core/src/scene/tier-transition.ts:runTierTransition`** — tier 전환 시 카메라 dolly + 입력 잠금 (`detachControl` → 300ms 후 `attachControl`)

세 계층이 각각 `camera.radius` 를 변경할 수 있는 진입점을 가진다. 사용자 직접 휠/핀치는 Babylon 내장 `ArcRotateCamera` 입력 핸들러가 담당.

### 2. ArcRotateCamera 옵션 박제값 (`camera.ts:31~43`)

```ts
const {
  alpha = -Math.PI / 2,
  beta = Math.PI / 2.5,
  radius = 30,                           // sim-canvas 에서 35 로 override
  target = Vector3.Zero(),
  lowerRadiusLimit = 0.5,                // ← 줌인 한계 (scene unit)
  upperRadiusLimit = 1e14,
} = options;
camera.lowerRadiusLimit = lowerRadiusLimit;
camera.upperRadiusLimit = upperRadiusLimit;
camera.wheelPrecision = 3;               // 휠 감도 (작을수록 빠름)
camera.pinchPrecision = 50;              // 핀치 감도
camera.panningSensibility = 0;           // ← pan 비활성화
camera.minZ = 0.01;
camera.maxZ = 1e14;
```

**핵심 관찰**:

- `lowerRadiusLimit = 0.5` (scene unit) — 카메라가 target 으로부터 0.5 scene unit 이하로 줌인 못 함. **scene unit 은 tier 별 가변** (`renderScaleForTier`):
  - T1 solar: 0.5 unit ≈ 5.95e9 m ≈ **0.04 AU** (수성 궤도 안쪽)
  - T2 inner: 0.5 unit ≈ 3.25e8 m ≈ **0.0022 AU** (지구-달 거리 ~ 0.5)
  - T3 body: 0.5 unit ≈ 1.99e4 m ≈ **20 km** (지구 직경 1.27e7m 대비 매우 가까움)
- `panningSensibility = 0` — Babylon 의 `panningSensibility` 는 **0 이면 pan 비활성화**. 본 코드는 의도적으로 0 으로 설정 (orbit 시뮬레이션에서 pan 은 혼란 유발). 이슈 본문 "팬 미반응" 은 **버그가 아니라 설계 의도** 일 가능성

### 3. tier 전환 시 lowerRadiusLimit 완화 + **원복 누락**

`packages/core/src/scene/tier-transition.ts:187-191`:

```ts
// lowerRadiusLimit 과도 충돌 가능 — targetRadius 가 lowerRadiusLimit 이하로 내려가면 clamp.
// 전환 중 한시적으로 lowerRadiusLimit 도 완화 (전환 직후 원복은 생략 — 사용자 수동 reset 허용).
if (camera.lowerRadiusLimit != null && targetRadius < camera.lowerRadiusLimit) {
  camera.lowerRadiusLimit = Math.max(newMinZ, targetRadius * 0.5);
}
```

**이 코드는 한 방향 완화만 수행하고 원복하지 않는다**. tier 전환이 반복될수록 `lowerRadiusLimit` 이 점점 작아져 누적 drift 발생. 다만 **줌인 freeze 의 직접 원인은 아님** — 완화는 줌인 가능 한계를 *낮추는* 방향이므로 freeze 가 아닌 "더 가까이 갈 수 있게 됨" 으로 작용.

**진짜 의심 — minZ 도 동일한 패턴으로 완화 후 원복 누락**:

```ts
// (1) minZ 재조정 — radius_new 가 minZ clamp 에 걸리지 않도록 선행 (V5 보장).
const newMinZ = computeNewMinZ(targetRadius);  // = max(1e-6, targetRadius * 0.01)
if (newMinZ < camera.minZ) {
  camera.minZ = newMinZ;
}
```

minZ 도 한 방향만 낮춘다. 줌아웃 시 `radius` 가 커져도 `minZ` 가 작은 값 그대로면 log-depth 정밀도 손실. **이것이 freeze 의 직접 원인은 아니지만 "회전이 무반응" 의 부수 후보** — minZ 가 카메라 radius 의 0.01 배 미만이면 log-depth z-fight 으로 회전 시 화면 깨짐 가능.

### 4. Floating Origin primary follow 와 카메라 거리 계산의 결합 (`solar-system-scene.ts:683-688`)

```ts
// #313 M2 — P12 ADR §Q10 Amendment: T3 (body) 에서만 활성. T1/T2 는 setTier 가 origin 을
// 리셋해 [0,0,0] 유지 → 아래 primary follow skip 으로 매 프레임 setOriginToBody 호출 제거.
if (activeTier === 'body' && focusBodyIdForAssert) {
  const focusWorld = worldPositions.get(focusBodyIdForAssert);
  if (focusWorld) {
    floatingOrigin.setOriginToBody([focusWorld[0], focusWorld[1], focusWorld[2]]);
  }
}
```

T3 body tier + focus 활성 시 **매 프레임 origin 을 focus body world 로 따라간다**. 이 결과 `cam.globalPosition` 은 origin 변화와 함께 **상대 좌표가 동시에 이동**. 카메라가 focus body 에 가까이 줌인하는 순간 다음 frame 의 origin shift 가 카메라를 다시 멀리 밀어내는 **race condition** 가능.

**구체적 시나리오**:
- frame N: 카메라가 Earth focus, radius=10 (scene unit). Earth 가 t=N 에서 world position W_N
- frame N+1: physics advance → Earth world W_{N+1} (조금 이동). origin 이 즉시 W_{N+1} 로 set → mesh.position = (W_{N+1} - W_{N+1}) * scale = 0 (정확)
- 그러나 `cam.globalPosition` 은 **shift 전 origin (W_N) 기준 좌표** 였고, shift 후 같은 globalPosition 을 유지하면 사실상 W_N 을 가리키므로 새 origin (W_{N+1}) 에서 `(W_N - W_{N+1}) * metersPerSceneUnit` 만큼 떨어진 점으로 변환

`updateTierByCamera` (sim-canvas:417-435) 가 매 프레임 `cam.globalPosition` 으로 tier 재판정 + tier 전환 시 lowerRadiusLimit 완화. 만약 위 race 로 tier 가 매 프레임 `body ↔ inner` 진동하면 `runTierTransition` 의 `detachControl` 이 매 프레임 발동 → **사용자 입력이 영구적으로 빨려들어가는 상태** 가능.

**이것이 #408 (focus 전환 시 tier oscillate) 의 변형 가능성** — #408 fix 는 focus 전환 순간만 다뤘고, **줌인 진행 중 tier 경계 왕복은 별개 분기**.

### 5. 회귀 시점 정적 bisect

PR #377 (R3 fix) 머지 시점 (2026-04-30) 직전 카메라/tier 관련 핵심 변경:

| 커밋 | PR | 변경 | 줌 freeze 영향 후보도 |
|---|---|---|---|
| `658d9d7` | #410 | #408 focus 전환 tier oscillate F1+F2 | 中 — focus 전환 oscillate 만 가드, 줌인 진행 중 oscillate 미가드 |
| `541e32a` | #315 | P11 M2 Floating Origin tier-conditional skip (T1/T2 overhead 제거) | 中 — body tier 에서만 primary follow 활성화. T3 진입 후 follow 가 freeze 분기 트리거 가능 |
| `208f5cb` | #304 | P12-B 카메라 dolly + 입력 잠금 (`runTierTransition`) | **高** — `detachControl` + lowerRadiusLimit 완화 도입 시점 |
| `c4ab4b1` | #301 | P12-A Tier 엔진 + renderScale 동적화 | **高** — scene unit 의미가 tier 별 가변이 됨 (lowerRadiusLimit 0.5 의 실거리 의미가 tier 별 100,000배 차이) |
| `8149dd3` | #291 | P11-A Floating Origin scientific 모드 jitter 해소 | 低 — origin shift 만 도입 |

**가장 강한 회귀 후보 ranking**:
1. **PR #304 (P12-B)** — `runTierTransition` 의 `detachControl` 매 프레임 trigger 가능성 (관찰 4)
2. **PR #301 (P12-A)** — tier 별 renderScale → `lowerRadiusLimit = 0.5 scene unit` 의 실거리 의미가 tier 별 비대칭화. T3 body 에서 0.5 unit ≈ 20km 라 지구 표면 근접 시 wall 형성

## 가설 후보 비교

| 가설 | 진단 비용 | fix 비용 | 회귀 위험 | R-Phase 의존 | 우선순위 |
|---|---|---|---|---|---|
| **G1. `lowerRadiusLimit = 0.5` 충돌 (T3 body 에서 20km wall)** | ⭐ console.log 카메라 radius + tier 1회 | ⭐ tier 별 lowerRadiusLimit 동적 (camera.minZ 처럼) | △ tier 전환 race 추가 | 비의존 | **High** |
| **G2. tier oscillate 줌 진행 중 freeze (`detachControl` 매 프레임)** | △ 매 프레임 tier 로깅 + scene.detachControl 호출 횟수 카운터 | △ tier 판정에 줌 in-flight 가드 추가 | 中 — #408 fix 와 충돌 가능 | R-Phase 진입 시 재검증 | **High** |
| **G3. Floating Origin primary follow race (T3 body + focus)** | 中 — origin 추적 로깅 + 카메라 globalPosition 추적 | 中 — primary follow 를 frame 후반으로 이동 또는 cam.target 보정 | 中 — #313 M2 amendment 영향 | T3 body tier 에서만 | **Medium** |
| **G4. `panningSensibility = 0` 의도적 무반응 (사용자 보고 "팬 미반응" 부분)** | ⭐ 코드 주석으로 즉시 확정 | ⭐ "버그 아님" 박제 또는 panning 활성화 후 keybinding 추가 | △ orbit + pan 동시 활성화 시 사용자 혼란 | 비의존 | **Low** |
| **G5. minZ 누적 완화 + log-depth z-fight (회전 무반응)** | △ camera.minZ 실측 로깅 | △ minZ 완화도 원복 추가 | △ V5 apparent size 보장 깨짐 가능 | 비의존 | **Medium** |
| **G6. WebGL context lost (사용자 보고 "전체 무반응" 일치 시)** | ⭐ DevTools console + `webglcontextlost` listener | △ context 복구 로직 (현재 없음) | 中 — 다른 GPU 분기와 충돌 | 비의존 | **Low** (선행 빈도 낮음) |
| **G7. Babylon Animation 누적 — `cam-radius` / `tier-transition-radius` 미정리 잔존 tween** | 中 — `scene.getAnimatableByTarget(camera)` 길이 로깅 | △ pendingTierCleanup 외 추가 cleanup | 中 — focusOn/reset/transition 3 경로 정합 | 비의존 | **Medium** |

### Provisional 결정 — G1 + G2 + G3 동시 가드 권장 (defense-in-depth)

정적 조사만으로 단일 원인 확정 불가. **세 가설이 동시에 freeze 를 만들 수 있는 분기** 가 모두 코드에 존재 — 사용자 실 D-T2 를 받아도 한 가설로 환원되지 않을 가능성 높음 (R-Phase defense-in-depth 시리즈 #402/#403/#404 패턴 재현 — volt #79 외 누적 18회 관찰).

**fix 옵션 비교 (구현 단계용 사전 박제)**:

#### Option A — G1 단독 fix (`lowerRadiusLimit` tier 별 동적)

`tier-transition.ts` 에 `computeLowerRadiusLimit(tier)` 추가, tier 전환 시 lowerRadiusLimit 을 tier 별 적절 값으로 갱신 + 원복도 양방향.
- 장점: 한 곳 변경 + 회귀 위험 최소
- 단점: G2 / G3 race 잔존 시 fix 효과 부분적

#### Option B — G2 가드 (줌 in-flight 동안 tier 판정 잠금)

`updateTierByCamera` 에 "현재 tier transition in-flight" 플래그 추가, in-flight 동안 tier 변경 금지.
- 장점: oscillate 직접 차단
- 단점: 줌이 빠를 때 의도된 tier 전환 지연 (사용자 체감 felicity 저하)

#### Option C — G3 가드 (T3 body primary follow 를 sub-frame 으로 이동)

`updateAt` 의 `setOriginToBody` 호출을 `onAfterRender` 로 미루고, 같은 프레임에서 카메라 좌표 미적용 보장.
- 장점: race 제거
- 단점: shift 가 1 프레임 지연 → focus body 위치가 미세하게 떨림 가능

#### Option D — A+B+C 동시 (defense-in-depth) **권장**

세 가드 직교 적용. R-Phase 시리즈 (#402/#403/#404) 의 defense-in-depth Top 1/2/3 패턴 재현.
- 장점: 어느 가설이 진짜 원인이든 차단
- 단점: 코드 변경량 증가 (3 곳) + qa 매트릭스 확장 (D-T2 + tier 전환 + zoom in-flight)

### Concrete Predictions (검증 가능 박제)

본 fix 가 적용되면:

1. **G1 Prediction**: T3 body 진입 후 `camera.lowerRadiusLimit` 이 `tier=body` 기준 적정값 (예: `1e-6` 또는 `targetRadius * 0.01`) 로 동적 변경. 줌인 시 카메라가 mesh boundingSphere 표면까지 (수 km ~ 100m) 무제한 접근 가능.
2. **G2 Prediction**: tier transition in-flight 동안 추가 tier 변경이 차단되어 `scene.detachControl` 호출 횟수가 단일 줌 동안 1회로 고정 (현재 추정: 매 frame 발동 가능).
3. **G3 Prediction**: T3 body tier + focus 활성 시 frame 내 `setOriginToBody` 호출이 mesh.position 갱신 *후* 발생 → 카메라 globalPosition 이 새 origin 기준으로 일관 (현재: shift 전 좌표로 tier 판정 → race).
4. **D-T2 매트릭스 Prediction**: 사용자가 R3 D-T2 5건 회귀 #4 재현 시 freeze 분기는 (a) T3 진입 직후 줌인, (b) Earth/Mars focus + radius < 1AU, (c) 휠 빠른 회전 셋 중 하나로 분류. 셋 다 위 fix 후 30초 자유 줌 시 freeze 없음.
5. **회귀 가드 Prediction**: 본 ADR §재검토 조건 의 verify 스크립트 (`verify:380-zoom`) 가 단위 테스트 + browser-verify 로 G1~G3 분기 모두 커버.

## 결과·재검토 조건

### 사용자 D-T2 매트릭스 요청 항목 (Provisional → Accepted 전이 조건)

본 ADR 의 Provisional 가설을 단일 원인으로 좁히기 위해 사용자에게 다음 매트릭스를 요청한다 (실 Chrome GUI):

| Cell | 진입 | 조작 | 관찰 항목 |
|---|---|---|---|
| M1 | URL 미지정 (default 진입) | 휠 줌인 5회 천천히 | 카메라 radius 변화, 어떤 거리에서 멈추는지, tier 표시 (dev overlay) |
| M2 | URL 미지정 | 휠 줌인 5회 빠르게 | 동일 + 콘솔 `[tier]` warn 빈도 |
| M3 | `?focus=earth` | 진입 후 핀치/휠 줌인 5회 | radius / tier / focus body 화면 점유율 |
| M4 | `?focus=sun` | 진입 후 줌인 5회 | radius / tier 변화 |
| M5 | M3 freeze 후 | 마우스 우클릭 드래그 (회전) / 좌클릭 드래그 (orbit) / 휠 줌아웃 | 어떤 인터랙션이 죽고 어떤 게 살아있는지 |
| M6 | M3 freeze 후 | DevTools `__simCore.scene.activeCamera.lowerRadiusLimit` / `radius` / `minZ` / `panningSensibility` 값 출력 | 정적 조사 §2 관찰값과 차이 |
| M7 | M3 freeze 후 | DevTools `__simCore.scene.getAnimatableByTarget(scene.activeCamera).length` | 잔존 tween 개수 (G7 검증) |

### Provisional → Accepted 전이 트리거

- 사용자 D-T2 매트릭스에서 G1~G7 중 하나 이상 확정 또는 신규 가설 등장
- developer 단계 진입 — fix Option A/B/C/D 중 사용자 승인 후 선택. Option D (defense-in-depth) 는 R-Phase 시리즈 패턴이라 개별 비교 비용 대비 ROI 합리

### 후속 이슈 (범위 밖)

- **#427 모바일 점유율** (priority:low) — 본 freeze 가 모바일 핀치 경로에서도 재현되는지 별도 검증 (포함 안 함)
- **G6 WebGL context lost** — 사용자 D-T2 에서 `webglcontextlost` 이벤트 관찰되면 별도 이슈로 분리

### 회귀 가드 (fix 단계에서 동시 박제)

- `verify:380-zoom` 스크립트 — agent-browser 로 ?focus=earth 진입 후 휠 줌인 10회 + radius / tier 변화 추적 + freeze 감지 (60s 동안 인터랙션 응답 없으면 fail)
- 단위 테스트 — `tier-transition.test.ts` 에 lowerRadiusLimit 양방향 변경 assertion + race 시나리오 (mock camera + 매 프레임 tier 판정 호출)

## 관련 ADR cross-link

- `20260422-floating-origin.md` — Floating Origin primary/safety 분리 정책. 본 ADR §4 의 G3 race 가설은 본 ADR §1-B 의 primary follow 확장 분기에 해당
- `20260423-display-relative-scale-unification.md` (DEPRECATED) — P12 Tier 엔진 + renderScale 동적화. 코드 잔존 — **scene unit 의미가 tier 별 가변** 인 상태가 본 ADR G1 의 근본 원인
- `20260424-p11-b-lod-design.md` — LOD 3단. 본 ADR §1 카메라 시스템과 직교 (LOD 는 mesh 변환, 본 ADR 은 카메라)
- `20260425-r1-store-scene-sync-unification.md` — focus ↔ scene 단일 경로. 본 ADR §1 의 `syncFocusToScene` 헬퍼는 본 ADR 의 G3 race 가설에 직접 영향 (focus 전환 시 origin shift 가 controller.focusOn 직후 실행)

## 교차검증 반영 사항

본 ADR 은 정적 조사 단계라 **cross-validate 는 사용자 D-T2 매트릭스 수령 후 fix 옵션 결정 단계** 에서 1회 호출 권장 (현재 단계 cross-validate 시 Gemini 가 정적 조사만 보고 단일 원인 confident 답변 위험 — Claude 자체 편향 4종 체크리스트 §순수주의 통과 여부 확인 후 호출).

- **호출 전 Claude 편향 셀프 체크 (현 단계 cross-validate 보류 근거)**:
  - 낙관적 일정: △ Provisional 만 박제 — 단일 PR 머지 일정 불명시
  - 결합 간과: ✓ G1~G7 모두 결합 분기로 박제 (Option D 권장 명시)
  - 폐기 프레이밍: ✓ P12 ADR DEPRECATED 명시 + 코드 잔존 영향 박제
  - 순수주의: △ Option A 단독을 "최소 변경 우선" 으로 미는 편향 가능 — Option D 권장은 R-Phase defense-in-depth 시리즈 18회 누적 근거로 정당화. 다만 fix 단계 cross-validate 에서 Gemini 의 "단일 원인 확정 후 단독 fix" 반론 진지 검토 필요

---

## Amendment 2026-05-11 — 사용자 D-T2 양상 기반 G8 신규 + Option D+G8a 확정

### 사용자 D-T2 응답 인용 (2026-05-11)

원 ADR §재검토 조건 의 M1~M7 매트릭스 (정확한 radius / tier 번호 / DevTools 값) 는 미측정. 그러나 사용자 양상 보고는 명확:

- **A. 어떤 인터랙션 시 발생?** → 줌인/줌아웃 **둘 다**
- **B. 양태?** → "tier 전환 시 카메라가 줌인아웃을 하면서 **흔들려**" (jitter)
- **C. 시점?** → **tier 전환 시점**

### 통합 가설 — G2 + G8 동일 근본 원인의 두 인지

원 이슈 ("줌인 후 카메라 고정") + 본 D-T2 발견 ("tier 전환 시 jitter") 을 동일 원인의 두 단계로 통합 추정:

1. **tier transition tween 시작** — `runTierTransition` 이 카메라 `radius` 를 새 tier 의 target 으로 Babylon `Animation.CreateAndStartAnimation` tween 시작 (`tier-transition.ts:251` 의 `scene.detachControl()` 직전 / 직후 짧은 윈도우 존재)
2. **사용자 줌 입력 동시 발생 (G8 race)** — 사용자가 transition 시작 트리거 직전·직후에 휠/핀치/터치 입력 → ArcRotateCamera 의 내장 input handler 가 `radius` 를 직접 변경 → tween 의 시작값 / 진행값과 즉시 충돌 → **jitter (흔들림)** ← G8 신규 가설
3. **transition 완료 시점** — `tier-transition.ts:189-191` lowerRadiusLimit 한 방향 완화 (G2) → 누적 drift 매 transition 마다 적층
4. **최종 freeze (원 이슈)** — 누적된 lowerRadiusLimit drift + race 잔존으로 radius 가 lowerRadiusLimit 에 도달 + 추가 입력이 tween animatable 잔존과 충돌 → 무반응

→ **G2 (high) + G8 (신규 high)** 결합. 단일 fix (Option D + G8 가드) 로 두 인지 (jitter + freeze) 동시 해결 가능.

### G8 신규 가설 박제

**G8: Tier transition tween + 사용자 입력 race**

- **분기**: tier transition 진행 중 `scene.detachControl()` 가 호출되지만, transition 시작 트리거 (`updateTierByCamera` 가 매 프레임 cam.globalPosition 으로 tier 재판정) 와 detachControl 호출 사이에 **수 ms 윈도우** 존재. 이 윈도우 내 휠/핀치 이벤트가 ArcRotateCamera 의 native handler 에 도달하면 `radius` 를 직접 변경 + tween 도 같은 `radius` 를 변경 → 동일 frame 내 두 변경원 충돌
- **사용자 인지 매핑**: A (줌인/줌아웃 둘 다) — race 는 입력 방향과 무관 / B (jitter) — 두 변경원이 매 frame 다른 값 산출 / C (tier 전환 시점) — race 는 transition 시작 윈도우에서만 발생
- **진단 비용**: △ tier transition 시작 시 wheel event 도달 횟수 카운터
- **fix 비용**: ⭐~△ 가드 옵션에 따라 (G8a 가장 단순)
- **회귀 위험**: △ transition 중 사용자 입력이 즉시 반응하지 않는 UX 변화 (의도된 trade-off)
- **R-Phase 의존**: 비의존 (모든 R-Phase 에서 동일 분기)
- **우선순위**: **High** (사용자 D-T2 양상과 직접 일치)

### G8 가드 옵션 비교

| 옵션 | 메커니즘 | 장점 | 단점 |
|---|---|---|---|
| **G8a** — transition 중 input lock (`scene.detachControl()` 즉시 발동) | tier 전환 결정 직후 (tween 시작 *전*) detachControl 즉시 호출. 트랜지션 종료 후 attachControl | 가장 단순 + UX 명확 (transition 동안 입력 무시). 기존 detachControl/attachControl 인프라 재사용. 구현 1~2 라인 | transition 진행 중 사용자 입력 응답 안 함 (200~500ms 정도). 빠른 연속 줌 시 체감 |
| **G8b** — input 큐잉 + transition 완료 후 적용 | transition 동안 wheel/pinch 이벤트 수집 → 완료 직후 누적값 적용 | 입력 손실 없음 | 구현 복잡 (queue + replay). attachControl 직후 점프 효과 (큐 누적값이 한꺼번에 적용) → 새로운 jitter 생성 위험 |
| **G8c** — transition 자체 취소 가능 (사용자 입력 우선) | 사용자 입력 발생 시 진행 중 transition tween 중단 + animatable 정리 + 새 tier 재판정 | 사용자 의도 우선 | tier oscillate 분기와 충돌 (#408 fix 가 oscillate 차단을 transition 비취소 전제로 박제). animatable 누수 위험 (G7 가설) |

**권장: G8a** — 가장 단순 + 기존 인프라 재사용 + 회귀 위험 최소. detachControl 호출을 **transition 결정 직후 + tween 시작 전** 으로 이동만 하면 race 윈도우 0 으로 축소.

### Option D + G8a 확정 (defense-in-depth 4 가드)

원 ADR Option D (A+B+C) + G8a 추가 = **A+B+C+G8a** 4 가드 직교 적용. R-Phase 시리즈 (#402/#403/#404) defense-in-depth Top 1/2/3 패턴의 4 가드 변형 (#380 = Top 4).

- **A. lowerRadiusLimit tier 별 동적** — `computeLowerRadiusLimit(tier)` 헬퍼, 양방향 변경 (G1)
- **B. tier 판정 in-flight 잠금** — `updateTierByCamera` 에 transition in-flight 플래그 (G2)
- **C. T3 body primary follow sub-frame 이동** — `setOriginToBody` 를 `onAfterRender` 로 (G3)
- **G8a. Transition tween + 사용자 입력 race 차단** — `scene.detachControl()` 호출을 transition 결정 직후로 이동, tween 시작 전 race 윈도우 0 화

### Concrete Predictions 갱신 (5 → 7 건)

원 ADR §Concrete Predictions 의 5 건 + G8 fix 검증 prediction 2 건 추가:

6. **G8 jitter 차단 Prediction**: G8a 가드 적용 후 사용자 D-T2 재현 (tier 전환 시점 휠 회전 5회 / 1초 간격) 시 카메라 `radius` 변화율이 transition 진행 중 단조 (휠 입력으로 인한 spike 없음). jitter 0회.
7. **회귀 가드 Prediction**: 단위 테스트 `tier-transition.test.ts` 에 mock scene `detachControl` spy 추가, transition 시작 시점에 detachControl 이 tween 시작 *전* 호출되는지 assertion. browser-verify 시나리오에 "tier 전환 + 빠른 휠 회전" 케이스 박제.

### Status 전이 — Provisional → Accepted

- 원 사유 (Provisional 보류): "사용자 D-T2 매트릭스 미수령 → 단일 원인 확정 불가"
- 전이 사유 (Accepted): 사용자 D-T2 양상 보고로 G2 + G8 통합 가설 명확화 + Option D+G8a 4 가드 직교 fix 사양 확정. 정확한 radius / tier 번호 측정값은 미수령이나 양상 (jitter at tier transition) 이 가설을 단일 원인 군집으로 좁히기 충분
- developer 단계 진입 가능 — `stage:planning → stage:dev`

### 후속 이슈 분리 가능 항목 (범위 외 잠재 발견)

- **G6 WebGL context lost** — 여전히 미관찰 (사용자 D-T2 에서 freeze 양태가 "흔들림" 으로 한정). 별도 분리 보류 (재발 시 #380 후속으로 분리)
- **모바일 핀치 경로 G8 변형** — #427 에서 별도 검증
- **G8b/G8c 차후 검토** — G8a 의 사용자 입력 손실 UX 가 실측에서 거슬리면 G8b 큐잉으로 격상. 격상 trigger 데이터 수집은 [#444](https://github.com/coseo12/astro-simulator/issues/444) 에서 운영
- **cross-validate 고유 발견 후속 6 건** — [#444](https://github.com/coseo12/astro-simulator/issues/444) (F1 입력 계측) / [#445](https://github.com/coseo12/astro-simulator/issues/445) (F2 CameraLockManager) / [#446](https://github.com/coseo12/astro-simulator/issues/446) (F3 updateTierByCamera 순수 분리) / [#447](https://github.com/coseo12/astro-simulator/issues/447) (F4 시각 큐) / [#448](https://github.com/coseo12/astro-simulator/issues/448) (F5 저사양 프로파일링) / [#449](https://github.com/coseo12/astro-simulator/issues/449) (F6 용어사전) — Gemini 2026-05-11 고유 발견 7 건 중 F7 (주석 보강) 만 현 PR 범위 내

## 교차검증 반영 사항 (Amendment 2026-05-11)

본 Amendment 박제 직후 cross-validate 1회 호출 — Gemini 두 번째 시각으로 G2+G8 통합 가설 / Option D+G8a 부수 영향 / G8a/G8b/G8c 트레이드오프 / Claude 편향 셀프 체크.

### 호출 전 Claude 편향 셀프 체크

- **낙관적 일정**: ✓ Amendment + cross-validate + developer 단계 진입 순차 명시 (단일 PR 일정 미박제는 의도)
- **결합 간과**: ✓ G2 + G8 통합 가설 명시 + Option D 의 A/B/C 와 G8a 직교성 박제
- **폐기 프레이밍**: ✓ Provisional → Accepted 전이 근거 명시 (양상 보고로 가설 군집 좁힘)
- **순수주의**: △ G8a 단독을 "가장 단순" 으로 미는 편향 가능 — G8b/G8c 비교표로 trade-off 명시했으나 Gemini 가 G8b 큐잉을 적극 권장하면 진지 재검토. cross-validate 호출 프롬프트에 "G8a 단순성 편향 가능 — G8b 의 입력 손실 0 가치를 어떻게 평가하는가?" 명시 질문 삽입

### 합의 / 이견 수용 / 기각 / 고유 발견

cross-validate 호출 (2026-05-11, gemini-2.5-pro, outcome=applied, exit 0) — 로그 `.claude/logs/cross-validate-architecture-20260511-030357.log`.

#### 합의 (Claude 설계 + Gemini 일치 — 즉시 강화 박제)

1. **defense-in-depth 4 가드 (Option D + G8a) 합리성** — Gemini: "복잡한 race condition 에서 단일 수정보다 다중 잠재 원인 차단이 장기 안정". R-Phase 시리즈 18회 누적 정당화 + Gemini 독립 동의
2. **G8a 단순성 + 즉시 잠금 채택** — Gemini: "트레이드오프 명확히 인지한 좋은 결정". G8b/G8c 비교표가 결정 투명성 확보
3. **G1 양방향 동기화 (lowerRadiusLimit + minZ)** — Gemini: "단방향 완화 → 양방향 확장성 개선" (확장성 축 평가)
4. **Provisional → Accepted 전이 + Amendment 추적성** — Gemini: "의사결정 투명성 우수". 양상 보고만으로도 가설 군집 좁힘 충분
5. **Claude 편향 셀프 체크 메타인지** — Gemini: "엔지니어링 성숙도 매우 높음" (구조 평가에서 명시)

#### 이견 수용 (Claude 원안 < Gemini 근거 → 수정)

- 없음 — Gemini 가 Option D + G8a 4 가드 사양 자체에 대한 반박 제시하지 않음. Gemini 의 모든 추가 제안은 "현 PR 강화" 또는 "범위 외 후속 분리" 로 분류됨

#### Claude 재분석으로 기각한 Gemini 제안

- 없음 — Gemini 의 모든 지적이 합리적이며 합의 또는 범위 외 후속 분리로 자연 분류됨. 맹목 수용 회피보다 **자연 분류** 케이스

#### 고유 발견 (후속 분리 — 박제 직후 이슈 생성)

Gemini 만의 제안. CLAUDE.md `## 교차검증 고유 발견 수용 vs 후속 분리 3단 프로토콜` 적용 — 현 PR Behavior Changes (Option D + G8a 4 가드 freeze + jitter 차단) 와 **직교** 한 항목은 후속 이슈 분리.

| Gemini 제안 | 범위 판정 | 후속 이슈 / 처리 | 우선순위 |
|---|---|---|---|
| **F1. 전환 중 사용자 입력 시도 횟수 로깅** (G8b 격상 의사결정 데이터) | 범위 외 (계측 코드, fix 동작과 직교) | [#444](https://github.com/coseo12/astro-simulator/issues/444) — G8a 운영 후 G8b 큐잉 격상 여부 데이터 수집 | medium |
| **F2. CameraLockManager 추상화** — 카메라 제어권 요청/해제 일관 인터페이스 | 범위 외 (큰 리팩토링, fix 와 무관) | [#445](https://github.com/coseo12/astro-simulator/issues/445) — 카메라 제어 모듈 통합 (cutscene / 특수 UI 확장 시 유용) | low |
| **F3. `updateTierByCamera` 순수 함수 분리 리팩토링** | 범위 외 (테스트 용이성 향상, fix 와 무관) | [#446](https://github.com/coseo12/astro-simulator/issues/446) — tier 판정 로직 순수성 분리 + 테스트 단순화 | low |
| **F4. G8a 무응답 시각 큐 (vignette / fade)** — 사용자 인지 보강 | 범위 외 (신규 시각 효과 도입, fix DoD 외) | [#447](https://github.com/coseo12/astro-simulator/issues/447) — UX 보강. G8a 운영 후 사용자 체감 거슬림 보고 시 격상 | low |
| **F5. 저사양 기기 성능 프로파일링** | 부분 범위 내 (Option D 가드 부수 비용 측정) | [#448](https://github.com/coseo12/astro-simulator/issues/448) — fix PR DoD 후보로 검토 권장 (agent-browser 또는 단위 bench 1회) | medium |
| **F6. 용어사전 (Glossary) 섹션** — D-T2 / R-Phase / Tier 정의 | 범위 외 (별도 docs) | [#449](https://github.com/coseo12/astro-simulator/issues/449) — 신규 참여자 onboarding 비용 절감 | low |
| **F7. `tier-transition` 카메라 제어권 명시 주석** — `detachControl` 호출 의도 + 보장 행동 | **범위 내** (코드 변경 0, 주석 추가) | **현 PR 반영** — developer 단계에서 `tier-transition.ts:251` 주변 주석 보강 의무 | high |

후속 이슈 6 건 (F1~F6) 는 본 ADR Amendment 박제 직후 이슈 생성 (capture 비용 < 분리 후 발굴 비용). F7 은 developer 단계 의무 항목으로 박제 (Behavior Change 0, 주석만).

#### 호출 후 Claude 편향 셀프 체크 결과

- **낙관적 일정**: ✓ Gemini 일정 관련 별도 지적 없음
- **결합 간과**: ✓ Gemini 가 race condition 결합 분석 (3 모듈 공유 자원 경쟁) 독립 도달 + 동의
- **폐기 프레이밍**: ✓ Gemini 가 P12 ADR DEPRECATED 영향 박제 동의
- **순수주의 (G8a 단순성 편향)**: △ Gemini 가 "G8b 격상 데이터 측정" 제안 — F1 후속 이슈 분리로 수용. G8a 즉시 채택 자체는 합의 정당화. 운영 후 데이터로 G8b 격상 재검토 trigger 명시
