# ADR: free-fly WASD 키보드 이동 — 카메라 로컬 좌표계 평행이동 + floating origin 정합 (#693 인프라 계승)

- **상태**: **Accepted** (cross-validate 2026-06-17 agy outcome=applied — §교차검증 반영 사항 본문 통합 완료. 4 고유 발견 반영: deltaTime frame-rate 독립 / 대각 정규화 기본값 / Q·E world-up 축 / attach·detach 키보드 인터페이스)
- **날짜**: 2026-06-17
- **결정자**: architect (#696 설계 단계, #693 forensic 좌표계 계승 + runtime 재확인)
- **관련**:
  - [#696](https://github.com/coseo12/astro-simulator/issues/696) (본 이슈 — #693 §8 WASD 후속, PM 합의 Q1~Q5)
  - [`20260616-693-freefly-panning.md`](20260616-693-freefly-panning.md) §1 (free-fly originOffset=0 불변식 + globalPos 의 target 추적 — 본 ADR 의 좌표계 SSoT. WASD 는 패닝과 동형 frame 이동)
  - [`20260608-631-freefly-tier-escalation-forensic.md`](20260608-631-freefly-tier-escalation-forensic.md) (`cameraFromSunMeters` + originOffset 가산 — 좌표계 SSoT)
  - [#509](https://github.com/coseo12/astro-simulator/issues/509) (free-fly 진입 설계 — tier/origin/시점 보존, focus 정책)
  - [`20260422-floating-origin.md`](20260422-floating-origin.md) (Floating Origin SSoT — originOffset 좌표계)
  - [`docs/glossary.md`](../glossary.md) — [free-fly](../glossary.md) / [Tier](../glossary.md) / [Floating Origin](../glossary.md) / [D-T2](../glossary.md) 정의
- **교훈 적용**:
  - **measurement-first** (volt [#32](https://github.com/coseo12/volt/issues/32)) — #693 가 "floating origin × panning 결합 위험"을 runtime 으로 기각했듯, WASD 도 동일 frame(target+position 평행이동)이면 어긋남 0 을 **재확인 측정**으로 확정. 정적 가정에 의존해 좌표 보정 코드를 선반영하지 않는다.
  - "신규 함수 ≠ 신규 구현" (volt [#21](https://github.com/coseo12/volt/issues/21)) — WASD forward/up 벡터는 신규 산식이 아니라 `camera.getDirection(Forward/Up)` (black-hole-rendering.ts:614 선례) 재사용. 토글/감도/focus 처리는 #693 인프라(`PANNING_DELTA_PERCENTAGE`, focus 옵션 A, free-fly→reset 분기) 계승.
  - "DoD PASS ≠ 제품 동작" (volt [#74](https://github.com/coseo12/volt/issues/74)) — 키보드 이동 방향 직관/체감 속도는 자동 DoD(수치)만으론 검증 불가 → D-T2 실 Chrome 필수.
  - "headless 브라우저 검증 ≠ 실 브라우저" (volt [#77](https://github.com/coseo12/volt/issues/77)) — tier/origin 수치 state 는 headless 신뢰 가능, 방향 체감은 D-T2 위임.

> **Forensic 변형 채택 근거 (5조건 중 3 충족 → 8섹션)**: ① 가설 N≥2 (forward 벡터 산출식 2종 + 좌표계 어긋남 가설) ② Runtime 측정 필수 (WASD 입력은 아직 미구현 → 효과를 setter 모사 후 `getViewMatrix(true)` 로 좌표계 반응 관찰) ③ 카메라 좌표계 (floating origin × ArcRotate target+position 평행이동). ④/⑤ 부분 충족 (옵션 비교는 단순, Amendment 는 cross-validate 후속 예상). #693 forensic 구조 답습 — 좌표계 결정의 trace 가능성 + 재현 가능성 동시 확보 (#381 모범).

---

## §1 배경

### 본 이슈 핵심

free-fly(focus 없는 자유 시점)에서 WASD/QE 키보드로 카메라를 **카메라 로컬 좌표계** 이동: W=시선 전진 / S=후진 / A·D=좌우 strafe / Q·E=상하. #693 우클릭 패닝(드래그 평면 이동)의 자연 후속 — 패닝(평면) + WASD(전후좌우상하) = 완전한 자유 이동. ArcRotateCamera 기본 화살표 키 회전(`keysUp/Down/Left/Right`)과 무충돌(Q1).

### #693 과의 관계 (좌표계 동형)

#693 패닝은 `camera.target` 을 **스크린 평면(viewport XY)** 으로 이동시킨다 (ArcRotate 가 position 을 자동 추종). WASD 는 `target + position` 을 **카메라 로컬 basis 벡터(forward/right/up)** 방향으로 **동시 평행이동**한다. 두 경우 모두:

- radius/alpha/beta(회전·줌 offset) **불변** → 시선 방향·거리 유지 (dolly 와 구분).
- `globalPosition = target + offset(α,β,r)` 이므로 target 을 `Δ` 옮기면 globalPos 도 정확히 `Δ` 추적.
- free-fly originOffset=[0,0,0] 불변식(#693 §1) → #631 `cameraFromSunMeters` 가산식이 그대로 정합.

차이는 **이동 방향 basis 뿐**(스크린 평면 vs 카메라 로컬 3D basis) → 좌표계 정합 분석은 #693 §1 을 그대로 계승하되, "카메라 로컬 forward/up 을 더해도 originOffset 불변식이 유지되는가"를 runtime 으로 재확인한다.

### Forensic 측정 결과 (2026-06-17, develop tip `6b21dea`, 1280×720, headless)

`apps/web/scripts/_debug-696-wasd-tmp.mjs`(volt #67 패턴, 실행 후 `rm`)로 실측. WASD 입력은 미구현 → 이동 **효과**(target+position 을 `forward × step` 만큼 평행이동)를 setter 로 직접 모사 후 `getViewMatrix(true)` 로 `globalPosition`/`originOffset`/`tier` 반응을 관찰. dev 핸들: `window.__solarScene.meshes[0].getScene().activeCamera` / `window.__simStore.enterFreeFly()`. 데이터: [`docs/reports/696-freefly-wasd-debug-output.json`](../reports/696-freefly-wasd-debug-output.json) (raw).

#### 측정 1 — free-fly 직접 진입(solar) 후 W(전진) 이동 전/후 좌표계 (α=−π/4, β=π/3 로 회전해 forward.x≠0 확보)

| 항목 | 측정값 | 판정 |
| --- | --- | --- |
| **originOffset (전→후)** | **[0,0,0] → [0,0,0]** | ✅ 불변식 유지 (좌표 보정 0) |
| **tier (전→후)** | solar → solar | ✅ 작은 이동, 임계 미초과 |
| **targetDelta.x** | −1.0716517 | (W step=radius×0.05=1.75) |
| **expectedDeltaX (= forward.x × step)** | −1.0716517 | ✅ 이동량 = forward.x × step 정확 일치 |
| **globalDelta.x** | −1.0716514 | ✅ targetDelta 추적 (Δ ~3e-7 = float32 반올림) |
| **offset(globalPos − target) 전→후** | 21.433035 → 21.433035 | ✅ radius/α/β offset 불변 (평행이동) |
| **radiusInvariant (after − before)** | 0 | ✅ dolly 아님 — radius 불변 |
| **forwardFromTargetPos** | [−0.61237, −0.50000, 0.61237] | (= normalize(target − position)) |
| **forwardGetDirection** | [−0.61237, −0.50000, 0.61237] | ✅ `getDirection(Forward)` 와 ~7 자리 일치 |
| **rightStrafe (= forward × up)** | [−0.70711, 0, −0.70711] | (A/D strafe 축) |
| **forward · right (직교성)** | 0 | ✅ 정규직교 basis |

#### 측정 핵심 (3 관찰)

- **관찰 1 — originOffset 불변식 [0,0,0] 유지**: WASD 평행이동(forward × step) 전·후 originOffset=[0,0,0]. #693 §1 관찰 1 동형 — free-fly 는 T1/T2 에서 origin 항상 0, body tier 는 `detachToFreeFly` pull-back 으로 진입 시 0 복원. **WASD 이동은 originOffset≠0 frame 에서 절대 발생하지 않는다.** 따라서 #631 `cameraFromSunMeters = |globalPos|×metersPerSceneUnit + originOffset` 의 originOffset 가산은 no-op 이지만 코드 정합 유지.
- **관찰 2 — `globalPosition` 이 `target` 을 정확 추적 + 이동량 = forward·step**: target 과 position 을 동시에 `forward × step` 평행이동하면 globalPos 도 정확히 같은 양 이동 (targetDelta.x=globalDelta.x=expectedDeltaX=−1.0716517, 오차 < 1e-6). offset(globalPos−target) 불변(21.433035) → radius·회전 offset 보존. **즉 카메라 로컬 평행이동이 #631 좌표계와 어긋나지 않는다.**
- **관찰 3 — forward 벡터 산출식 2종 합의 + 직교 basis**: `getDirection(Vector3.Forward())`(black-hole-rendering.ts:614 선례) ≡ `normalize(target − position)` 가 ~7 자리 일치. right = forward × up = [−0.707, 0, −0.707], forward·right=0(정규직교) → A/D strafe 축 정확. radiusInvariant=0 으로 dolly(줌)와 명확히 구분됨이 실측.

### 가설 검증 결론

| 가설 | 결론 | 근거 |
| --- | --- | --- |
| **가설 1: WASD 카메라 로컬 평행이동이 #631 cameraFromSunMeters tier 좌표계와 어긋난다** | **기각** | 측정 관찰 2 — globalPos 가 target 정확 추적 + 이동량=forward·step → cameraFromSunMeters 자동 정합. 어긋남 0 (#693 동형) |
| **가설 2: deep-tier(body) WASD 시 originOffset≠0 으로 좌표 깨짐** | **기각** | 측정 관찰 1 — body tier 는 #631 pull-back 으로 free-fly 진입 시 origin=0. WASD 가 originOffset≠0 frame 에서 발생 불가 |
| **가설 3: forward 벡터를 view matrix 에서 수동 복원해야 한다 (getDirection 부정확)** | **기각 (불필요)** | 측정 관찰 3 — `getDirection(Forward)` ≡ `normalize(target−position)` ~7 자리 일치. 기존 API 정확, 수동 복원 코드 0 |
| **가설 4: target+position 동시 이동이 radius 를 변동시킨다 (dolly 오염)** | **기각** | radiusInvariant=0 — 동시 평행이동은 offset 보존 → radius 불변 |

---

## §2 영향 모듈/파일

### Fix 대상 (구현은 developer — 본 ADR 은 결정만)

- `packages/core/src/scene/camera.ts` — WASD/QE 이동 헬퍼 신규:
  - `WASD_DELTA_PERCENTAGE` named const (radius 비례 이동 속도 SSoT — `ZOOM_DELTA_PERCENTAGE`/`PANNING_DELTA_PERCENTAGE` 인접 박제, D-T2 튜닝 단일점).
  - 눌림 키 상태 추적(`Set<string>`) + `scene.onKeyboardObservable`(KeyDown/KeyUp) 핸들러. 매 프레임(onBeforeRender) `forward/right/up` × `radius × WASD_DELTA_PERCENTAGE` 만큼 target+position 평행이동.
  - forward = `camera.getDirection(Vector3.Forward())`, up = `getDirection(Vector3.Up())`, right = forward × up (측정 관찰 3 산출식). **ArcRotateCamera 기본 화살표 회전(`keysUp/Down/Left/Right`) 미변경** (Q1 무충돌).
- `apps/web/src/components/sim-canvas.tsx` — free-fly↔focus 토글 시 WASD 핸들러 활성/비활성 (`freeFlyActive` 플래그 재사용 — #693 패닝과 동일 토글 SSoT). reset 시 눌림 키 상태 클리어 + 카메라 복원(#693 free-fly→reset 분기 재사용).

### focus/reset 연동 (§결정 4 = #693 옵션 A 답습)

- WASD 는 **free-fly 에서만 활성**, focus 중 비활성 (Q3). focus 중 `#followObserver`(camera-controller.ts:100)가 매 프레임 target 을 focus mesh 로 덮어쓰므로 WASD 이동이 즉시 상쇄됨 → 무의미 + jitter. 토글은 #693 `freeFlyActive` 플래그 + onBeforeRender 분기 재사용.
- reset(free-fly→reset 분기, sim-canvas.tsx:537~550)에서 **눌림 키 상태 클리어** + `controller.reset(35)` target 원점 복원.

### 측정/가드 박제

- `docs/reports/696-freefly-wasd-debug-output.json` — forensic raw 데이터 (본 ADR §1 측정 SSoT).
- `apps/web/scripts/browser-verify-696-freefly-wasd.mjs` — 회귀 가드 (verify:696-freefly-wasd, §결정 §회귀 가드).
- `.github/workflows/ci.yml` — detect-and-test 통합 (**port 3010** — 3009 패닝 다음 미사용 포트).

### Fix 가 깨지 않는 영역 (실측/분석 확인)

- **화살표 키 회전** — WASD/QE 는 별도 키, ArcRotate `keysUp/Down/Left/Right` 미변경 → 회전 무회귀 (Q1).
- `#693` 패닝 — WASD 는 target+position 평행이동(키), 패닝은 target 평면 이동(드래그). 동일 free-fly frame 공유, 입력 채널만 별개. `freeFlyActive` 토글 공유로 정합.
- `#629` 줌(`wheelDeltaPercentage`) — WASD 는 radius 불변(측정 관찰), 줌은 radius 변동. 직교.
- `#631` tier escalation — 측정 관찰 1·2, 기존 `cameraFromSunMeters` 경로 그대로.
- `#509`/`#378` focus 정책 — §결정 4 옵션 A 가 focus 중 WASD 비활성으로 focus follow 무회귀.

---

## §3 옵션 비교

### 축 1 — forward 벡터 산출식 (Q2 핵심)

| 축 | **(가) `getDirection(Forward/Up)` + 외적 (채택)** | (나) `normalize(target − position)` 직접 | (다) view matrix row 수동 복원 |
| --- | --- | --- | --- |
| 정확성 | ✅ (관찰 3 — (나)와 ~7 자리 일치) | ✅ (동일 결과) | △ (전치/부호 실수 위험) |
| 코드베이스 선례 | ✅ (black-hole-rendering.ts:614 — getDirection 채택 선례) | △ (산식 직접) | ❌ (#208 fallback 경로, 본 용도 과함) |
| up 축 동시 산출 | ✅ (`getDirection(Up)` 동일 API) | ❌ (up 별도 산출 필요) | △ |
| 신규 코드 | 0 (기존 API) | 1식 | 다수 (matrix 분해) |

### 축 2 — 이동 의미 (Q2: 평행이동 vs dolly)

| 축 | **(가) target+position 동시 평행이동 (채택)** | (나) target 만 이동 (패닝식) | (다) radius 변경 (dolly) |
| --- | --- | --- | --- |
| 시선 방향 보존 | ✅ (offset 불변, 관찰 2) | ❌ (회전 발생) | ✅ |
| W=전진 직관 | ✅ (카메라 전체가 전진) | △ (target 만 — 회전 효과) | △ (전진처럼 보이나 radius 변동) |
| radius/줌 직교 | ✅ (radiusInvariant=0) | ✅ | ❌ (줌과 충돌) |

### 축 3 — 속도 모델 (Q4)

| 축 | **(가) radius 비례 (`WASD_DELTA_PERCENTAGE`, 채택)** | (나) 정적 절대 속도 |
| --- | --- | --- |
| tier 무관 체감 속도 일정 | ✅ (deep tier radius≈158386 도 동일 비율) | ❌ (#629/#693 교훈 위반 — 스케일 비대칭에서 깨짐) |
| #693 `PANNING_DELTA_PERCENTAGE` 일관성 | ✅ 동일 비례 철학 | ❌ |

### 결정

- **축 1 채택: (가) `getDirection(Forward/Up)` + 외적.** 측정 관찰 3 으로 (나)와 동치 확인 + black-hole-rendering.ts 선례 + up 축 동일 API 산출 + 신규 코드 0. (다) 수동 복원은 본 용도 과함 → 기각.
- **축 2 채택: (가) target+position 동시 평행이동.** 측정 관찰 2(offset 불변) + radiusInvariant=0 으로 시선 방향·radius 보존 확정 → "W=카메라 전체 전진" 직관 정합. (나) target 만 이동은 회전 부작용, (다) dolly 는 줌과 충돌 → 기각.
- **축 3 채택: (가) radius 비례 `WASD_DELTA_PERCENTAGE`.** #629/#693 비례 철학 일관. 절대 속도는 tier 스케일 비대칭에서 깨짐 → 기각.
- **좌표 보정 코드: 없음.** §1 측정으로 free-fly originOffset=0 불변식 + globalPos 의 target 추적 + 이동량=forward·step 이 확정되어, #631 기존 `cameraFromSunMeters` 가산식이 WASD 에 그대로 정합. 가설 1~4 전부 기각 → 신규 좌표 보정 0 (volt #21).

---

## §4 Concrete Prediction (사전 박제 → 구현 후 실측 대조)

| 예측 | 임계 | 실측 (developer 단계 기입) | 정합 |
| --- | --- | --- | --- |
| 예측 1 — 코어 변경 라인 수 (camera.ts WASD 헬퍼: const + 키 상태 + attach/detach + onBeforeRender 이동 + deltaTime/normalize/world-up) | **≤ 45 라인** (cross-validate 반영: deltaTime·정규화·Q/E world-up·attach/detach 인터페이스로 35→45 상향. forward 산식은 기존 `getDirection` API) | (TBD) | (TBD) |
| 예측 2 — sim-canvas 토글/reset 배선 라인 수 | **≤ 8 라인** (freeFlyActive 토글 + reset 키 클리어 — #693 분기 재사용) | (TBD) | (TBD) |
| 예측 3 — D-696-1 (free-fly WASD W 이동 후 globalPos 가 target 추적 + 이동량=forward·step) | targetDelta=expectedDelta (오차<1%) + offset(globalPos−target) 불변 | (TBD) | (TBD) |
| 예측 4 — D-696-2 (deep-tier(io) free-fly WASD 시 originOffset=[0,0,0] + tier 무결) | originOffset=[0,0,0] + tier 일관 | (TBD) | (TBD) |
| 예측 5 — #693 패닝 / #629 줌 / #631 tier / #378 focus / 화살표 회전 무회귀 | 각 verify 가드 PASS | (TBD) | (TBD) |

> **Concrete Prediction 의도**: 좌표 보정 코드 0(예측 1 forward 산식은 기존 `getDirection` API)이 "#693 패닝 인프라 + 기존 추상화가 WASD 를 자연 흡수" 가설의 실측 증거. 예측 1 이 35 라인을 크게 초과(좌표 보정/matrix 분해 출현)하면 §1 측정 재검토.

---

## §5 결정 (구현 가이드 + 회귀 가드 설계)

### 구현 가이드 (developer 인수인계)

1. `camera.ts` — `WASD_DELTA_PERCENTAGE` const 도입(`ZOOM_DELTA_PERCENTAGE`/`PANNING_DELTA_PERCENTAGE` 인접, D-T2 튜닝 SSoT). 초기값 권장 `0.05` 부근(틱당 radius 비율) — measurement-first 로 D-T2 체감 후 조정. **PANNING 과 별개 상수** (드래그 vs 키 지속 체감 다름 — 단일 공유는 한쪽 튜닝이 다른 쪽 오염).
2. **키 상태 추적 + attach/detach 인터페이스 (agy 고유 발견 ④)**: `scene.onKeyboardObservable` 으로 `KeyboardEventTypes.KEYDOWN`/`KEYUP` 시 눌린 WASD/QE 키를 `Set<string>` 에 add/delete. **`key` 비교는 소문자화** (`e.key.toLowerCase()`) — Shift 동반/CapsLock 대문자 변형 방어. 화살표 키는 Set 에 넣지 않음(ArcRotate 회전에 위임, Q1). **리스너 수명 주기는 명시적 `attachWasdControl(camera, scene)` / `detachWasdControl()` 인터페이스로 봉인** — `camera.ts` 가 observer/`window.blur` 리스너를 내부 등록하고, sim-canvas 가 free-fly 토글·unmount·HMR 시 detach 호출(#693 contextmenu handler `onDisposeObservable` 선례). `camera.ts` 가 `window` 전역을 직접 산발 구독하지 않고 단일 attach/detach 로 누수 0.
3. **매 프레임 이동(onBeforeRender)**: free-fly 활성 중에만, 눌린 키마다 방향 벡터를 합벡터로 누적 후 `camera.target` 과 `camera.position` 에 **동시 가산**(§결정 축 2). 산출식 (agy 고유 발견 ①②③ 반영):
   - **forward / right / up 축**: forward=`getDirection(Vector3.Forward())`, right=`Vector3.Cross(forward, worldUp)`. **W/S(전후)·A/D(strafe)는 카메라 로컬 forward/right** 사용. **Q/E(상하)는 카메라 local up 이 아닌 월드 절대 up(`Vector3.Up()`) 사용** (agy 고유 발견 ③): 사용자가 수직 아래를 내려다보는 시점(pitch≈−π/2)에서 local up 은 월드 수평을 가리켜 "Q=위로" 가 수평 전진으로 둔갑 → 비직관. 월드 up 고정으로 "Q=항상 위 / E=항상 아래" 직관 보장. 매핑: W=+forward / S=−forward / D=+right / A=−right / Q=+worldUp / E=−worldUp (Q1).
   - **대각 정규화 기본값 (agy 이견 수용)**: 여러 키 동시 입력 시 합벡터를 **정규화(`.normalize()`) 후** 속도 곱산 — 대각 이동이 단일 키와 동일 속도. 미정규화 시 2키 대각 √2배·3키 √3배 가속은 3D 내비게이션 표준상 명백 버그 → D-T2 보류 아닌 **아키텍처 기본값 규정**. (D-T2 는 속도 절대값만 튜닝.)
   - **프레임 레이트 독립 (agy 고유 발견 ①, 치명적)**: 이동량에 프레임 델타 타임 곱산 필수 — `move = normalizedDir × radius × WASD_DELTA_PERCENTAGE × (engine.getDeltaTime() / 1000)`. 미적용 시 144Hz 모니터가 60Hz 대비 2.4배 빠르고 프레임 드랍 시 카메라 둔화. `WASD_DELTA_PERCENTAGE` 의미는 "초당 radius 비율" 로 재정의(틱당 아님). 초기값은 deltaSeconds 곱산 기준으로 측정 후 결정(measurement-first).
4. **floating origin 정합**: WASD 이동은 target+position 평행이동이라 originOffset 불변(§1 측정 관찰 1). **좌표 보정 코드 추가 금지** — 기존 `cameraFromSunMeters`(#631) 그대로. onBeforeRender 의 tier 판정(sim-canvas.tsx:599)이 globalPos 추적값으로 자동 escalate/de-escalate.
5. **focus↔free-fly 토글 + reset**: #693 `freeFlyActive` 플래그 재사용 — free-fly 진입 시 WASD 핸들러 작동, focus 진입 시 비작동. **reset(free-fly→reset 분기, sim-canvas.tsx:537~550)에서 눌림 키 Set 클리어** — reset 후에도 키가 "눌린 채"로 남아 카메라가 계속 이동하는 버그 방지(키업 이벤트 유실 대비). 키 Set 은 camera dispose / observer cleanup 시 함께 정리(HMR/StrictMode 리스너 누수 방지 — #693 contextmenu handler 선례).
6. **입력 포커스 가드 (agy 고유 발견 ⑤ 보강)**: 텍스트 입력 필드(`input`/`textarea`/`contenteditable`) 포커스 중 WASD 가 카메라를 움직이면 안 됨. **2중 가드**: (a) onBeforeRender 이동 연산 초입에 `document.activeElement` 가 입력 필드면 조기 return, (b) canvas 포커스 여부(`scene.getEngine().getRenderingCanvas()` 가 `document.activeElement` 인지) 확인. Babylon 기본 동작이 input 포커스를 존중하는지 developer 실측 후 부족분 명시 가드.

### 회귀 가드 — 3중 시뮬레이션 (guard-pr-dod, volt #96/#109)

`apps/web/scripts/browser-verify-696-freefly-wasd.mjs` (CI `detect-and-test` port 3010). WASD 입력은 `page.keyboard.down('w')` 등 실제 키 이벤트로 구동(canvas 포커스 후):

| 시나리오 (직교) | DoD (PASS 조건) | 회귀 시 |
| --- | --- | --- |
| **S1. free-fly WASD 이동 작동** | free-fly 진입 후 W keydown → target+position 전진 이동 + globalPos 추적(Δ 일치) + radius 불변 | 핸들러 미작동 → target 불변 (FAIL) |
| **S2. focus 중 WASD 비활성 (#509)** | body focus 중 W keydown → target 불변(follow 유지) | focus 중 활성 → jitter/이탈 (FAIL) |
| **S3. deep-tier WASD floating origin 정합 (#631)** | io→free-fly(pull-back) W 이동 후 originOffset=[0,0,0] + tier 일관 | originOffset≠0 / tier 오판 (FAIL) |
| **S4. WASD 후 reset 원복 + 키 클리어** | free-fly W 이동 → reset → target 원점 복원(targetDist≈0) + keyup 유실해도 정지 | reset 분기/키 클리어 누락 시 target 잔존 또는 계속 이동 (FAIL) |
| **S5. 화살표 회전 무충돌 (Q1)** | free-fly ArrowUp keydown → 회전(alpha/beta 변동) 발생, target 평행이동 0 | WASD 핸들러가 화살표를 가로채면 회전 미발생 (FAIL) |
| **S6. 프레임 레이트 독립 + 대각 정규화 (agy ①②)** | 동일 시간 W 입력 시 deltaTime 보정으로 프레임 수 무관 이동거리 일정 + W+D 대각 이동량 = 단일 키 × √1 (정규화, √2 아님) | deltaTime 미곱산 → 프레임 종속 / 미정규화 → 대각 √2배 (FAIL) |
| **S7. Q/E world-up 직관 (agy ③)** | pitch≈−π/2(수직 하향 시점)에서 Q keydown → 월드 +Y 이동(globalPos.y 증가), 수평 이동 아님 | local up 사용 시 수평 전진 (FAIL) |

3중 시뮬레이션: positive(WASD 핸들러 fix) PASS → negative(핸들러 제거) FAIL exit 1 → recovery(fix 복원) PASS. developer 가 가드 도입 PR DoD 4축(격리 동적 / 3중 시뮬 / N×5 self-consistency 는 본 가드 비대상 / 메타 측정 안정성) 적용.

### 무회귀 실측 (developer 단계)

- #693 패닝(verify:693-freefly-panning) PASS / #629 줌(verify:629-freefly-zoom) PASS / #631 tier(verify:631-freefly-tier) PASS / #378 focus 26/26 PASS.
- core/web 단위 테스트 전체 PASS.

### Fix 후 박제 의무

- **#693 ADR §8 cross-link Amendment** — "WASD 키보드 이동 = #696 에서 구현(좌표계 동형 재확인)" 갱신.

---

## §6 위험 / 재검토 트리거

| 위험 | 회귀 시점 | 임계 | 완화 |
| --- | --- | --- | --- |
| 이동 속도 체감 (radius 비례 상수) | fix 머지 직후 D-T2 | "너무 빠름/느림" | `WASD_DELTA_PERCENTAGE` 단일 SSoT 튜닝 |
| 키업 이벤트 유실 → 카메라 계속 이동 | 포커스 이탈/alt-tab 중 keyup 유실 | 손 뗀 후에도 이동 | reset/blur 시 키 Set 클리어(§결정 5) + `window.blur` 리스너 |
| 텍스트 입력 필드와 WASD 충돌 | input 포커스 중 타이핑 | "w" 입력이 카메라 이동 | `document.activeElement` 가드 / Babylon input 포커스 존중 실측(§결정 6) |
| 대각 이동 속도 √2 배 | 2키 동시 입력 | 대각이 단일보다 빠름 | 합벡터 정규화(§결정 3) — D-T2 체감 후 결정 |
| 모바일 키보드 부재 | iOS/Android | WASD 작동 불가 | Q1 데스크톱 한정 — 모바일은 패닝(#693)/터치 후속 (비목표) |

### 재검토 트리거

1. D-T2 "이동 속도 부적절" → `WASD_DELTA_PERCENTAGE` 튜닝.
2. 사용자가 focus 중에도 WASD 원함 → #693 축 1 옵션 (B) 재검토 (현 옵션 A 명시 기각 답습).
3. 키 리매핑 수요(WASD 외 커스텀) → 후속 이슈 (설정 UI).

---

## §교차검증 반영 사항 (cross-validate 2026-06-17 agy outcome=applied)

agy 가 본 ADR 을 "#693 프레임 이동 수학 모델 + Floating Origin 논리를 훌륭히 계승" 으로 평가하며 `getDirection` 활용·target+position 평행이동·감도 상수 분리를 타당하다고 지지. Accepted 전이 전 4 개선 반영 권고. 4축 분류:

- **합의 (4)**: ① `getDirection(Forward)` + 외적 forward 산출(축 1) ② target+position 동시 평행이동으로 시선·radius 보존(축 2) ③ `WASD_DELTA_PERCENTAGE` ↔ `PANNING_DELTA_PERCENTAGE` 상수 분리(튜닝 독립성) ④ focus 옵션 A(free-fly 만 활성)로 followObserver 충돌 0.
- **고유 발견 수용 (3, 본 ADR 반영)**:
  - ① **프레임 레이트 독립 (deltaTime)** — Claude 원안 `move = dir × radius × pct` 는 매 프레임 가산이라 144Hz 가 60Hz 대비 2.4배 빠르고 프레임 드랍 시 둔화. agy 지적 수용 → `× (engine.getDeltaTime()/1000)` 곱산 필수 박제(§결정 3), `WASD_DELTA_PERCENTAGE` 의미를 "초당 radius 비율" 로 재정의 + S6 가드 신설. **치명적 수정** — 패닝(#693)은 드래그 이벤트 구동이라 frame 독립이 자동이었으나 WASD 는 매 프레임 구동이라 명시 보정 필요(동형 프레이밍의 사각).
  - ③ **Q/E world-up 축** — Claude 원안은 Q/E 를 local up 사용. pitch≈−π/2 하향 시점에서 local up 이 월드 수평을 가리켜 "Q=위로" 가 수평 전진으로 둔갑. agy 지적 수용 → **Q/E 는 월드 절대 `Vector3.Up()` 고정**(§결정 3) + S7 가드 신설. W/S·A/D 는 로컬 forward/right 유지(시선 종속이 직관적).
  - ④ **attach/detach 키보드 인터페이스** — Claude 원안은 리스너 등록/해제 위치 모호. agy 지적 수용 → `attachWasdControl`/`detachWasdControl` 명시 인터페이스로 봉인(§결정 2, #693 contextmenu `onDisposeObservable` 선례) + `document.activeElement` 외 canvas 포커스 2중 가드(§결정 6).
- **이견 수용 (1, 원안 → 수정)**: **대각 정규화 기본값** — Claude 원안은 합벡터 정규화 여부를 "D-T2 체감 후 결정"(measurement-first)으로 보류. agy 가 "대각 √2·√3배 가속은 3D 내비 표준상 명백 버그, 체감 전 기본값 규정" 지적. **수용** — 정규화를 아키텍처 기본값으로 규정(§결정 3), D-T2 는 속도 절대값만 튜닝. 수용 근거: 정규화는 취향 문제가 아니라 표준 정합성 문제 → measurement-first 대상(체감 모호) 아님.
- **Claude 재분석으로 후속 분리 (2)**:
  - **Shift/Ctrl 속도 모디파이어(5x/0.2x)** — agy 가 광대 스케일 조작성 위해 가속/정밀 배율 권고. PM Q1~Q5 비목표(키 매핑은 WASD/QE 6키 한정) → YAGNI, 현재 PR 비목표. §8 후속 분리.
  - **키 바인딩 Map 추상화** — agy 가 리매핑 UI 대비 `Map<string,string>` 추상화 권고. #693 감도 헬퍼 모듈화 후속 분리 선례 동일(YAGNI — 2번째 사용처(리매핑 UI) 등장 시 분리). §8 "키 리매핑 설정 UI" 후속과 병합.
- **Claude 재분석으로 보강 (1)**: **극단 장거리 이동 정밀도 assertion** — agy 가 deep-tier WASD 후 floating origin 재정렬 jitter 우려. **재분석**: free-fly originOffset=0 불변식(§1 측정)상 free-fly 에서 origin 재정렬은 발생하지 않음(재정렬은 body-tier focus 영역) → agy 가 free-fly/focus 좌표계를 혼동. 단 "큰 이동 후 originOffset 안정성" 검증 가치는 유효 → S3 가드에 극단 이동 후 originOffset=[0,0,0] assertion 유지(이미 §결정 회귀 가드 S3 커버).
- **Claude 편향 셀프 체크 (cross-validate 호출 전 통과)**:
  - **낙관적 일정**: 코어 ≤35 라인 예측 → cross-validate 반영(deltaTime/정규화/world-up/attach-detach)으로 **≤45 라인 상향**(§4 예측 1). 정직한 재산정 — forward 산식은 여전히 기존 API.
  - **결합 간과**: floating origin × WASD §1 실측 통과. **줌 × WASD** 직교(radiusInvariant=0 실측). **frame-rate × WASD** 는 agy 지적 수용해 deltaTime + S6 로 해소(동형 프레이밍이 가린 사각 — 자기 비판 박제).
  - **폐기 프레이밍**: #693 "동형" 프레이밍은 좌표계(target 평행이동)에 한해 정확하나, **입력 구동 모델(드래그 이벤트 vs 매 프레임 키)이 다르다는 차이를 frame-rate 사각으로 노출** → "동형" 을 좌표계 한정으로 정밀화(§1 "차이는 이동 방향 basis 뿐" → frame 구동 차이 추가 인지). 통과.
  - **순수주의**: 옵션 A(focus 중 WASD 비활성) 과대 제약 우려 → §6 재검토 트리거 2 박제(focus 중 WASD 수요 시 재검토). 통과.

---

## §7 Amendment 라운드 N

(현재 없음 — cross-validate / D-T2 / developer 측정 후속 시 추가)

---

## §8 후속 / 분리 이슈

- **모바일 터치 WASD 대체** — Q1 데스크톱 키보드 한정. 모바일은 #693 2지 패닝/가상 조이스틱 후속.
- **키 리매핑 설정 UI + 키 바인딩 Map 추상화** — WASD 외 커스텀 키 매핑. agy 가 `Map<string,string>` 추상화 권고했으나 2번째 사용처(리매핑 UI) 등장 시 분리(YAGNI). 수요 확인 후 후속.
- **Shift/Ctrl 속도 모디파이어 (5x 가속 / 0.2x 정밀)** — agy 고유 발견. 광대 스케일 조작성 향상. Q1~Q5 비목표(6키 한정)라 후속 분리. D-T2 에서 단일 속도 답답함 확인 시 우선순위 상향.
- **이동 속도 슬라이더** — `WASD_DELTA_PERCENTAGE` 를 사용자 조정 가능하게. D-T2 후 수요 시 분리.

---

## 변경 이력

- 2026-06-17: 초안 (architect, #696 설계). Provisional — free-fly WASD 카메라 로컬 좌표계 평행이동(target+position 동시 이동)이 floating origin originOffset=0 불변식을 유지함을 runtime 재확인(#693 동형). forward=`getDirection(Forward/Up)`+외적(black-hole-rendering 선례, normalize(target−position) 와 ~7 자리 일치 실측). radius 비례 `WASD_DELTA_PERCENTAGE` + focus 옵션 A(free-fly 만 활성) + 좌표 보정 코드 0 + 5 시나리오 3중 시뮬 가드 설계.
- 2026-06-17: **Accepted 전이** (cross-validate agy outcome=applied). 4 고유 발견 반영: ① **deltaTime frame-rate 독립**(매 프레임 가산이라 주사율 종속 — `× engine.getDeltaTime()/1000` 필수 + S6 가드, "동형" 프레이밍이 가린 입력 구동 차이 사각) ② **대각 정규화 기본값**(원안 D-T2 보류 → 표준 정합성 문제로 기본값 규정, 이견 수용) ③ **Q/E world-up 축**(local up 은 하향 시점에서 수평 둔갑 → 월드 `Vector3.Up()` 고정 + S7 가드) ④ **attach/detach 키보드 인터페이스**(리스너 누수 봉인 + canvas 포커스 2중 가드). 예측 1 코어 라인 ≤35→≤45 상향. Shift/Ctrl 모디파이어·키 바인딩 Map 추상화는 후속 분리(YAGNI).
