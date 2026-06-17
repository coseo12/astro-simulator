# ADR: free-fly 카메라 통합 재설계 — 진입/줌/이동/시점 일관 모델 (단편 누적 #509/#629/#631/#693/#696 통합)

- **상태**: **Provisional** (cross-validate 발동 ADR — `## 교차검증` 박제 직후 1회 루틴 대상. cross-validate 결과 §교차검증 반영 사항 통합 후 Accepted 전이. **추가로 본 ADR 의 진입 방향/속도 계수는 "1차 제안" — 사용자 D-T2 조정 라운드 예상**)
- **날짜**: 2026-06-17
- **결정자**: architect (#699 통합 재설계 단계, measurement-first 진단 선행)
- **변형**: **Forensic ADR** (8섹션) — 5조건 전부 충족 (아래 근거)
- **관련**:
  - [#699](https://github.com/coseo12/astro-simulator/issues/699) (본 이슈 — 단편 누적 통합 재설계, PM 합의 2026-06-17)
  - 흡수: [#696](https://github.com/coseo12/astro-simulator/issues/696) (WASD — PR #698 닫고 통합 재구현) / [#693](https://github.com/coseo12/astro-simulator/issues/693) (패닝 — develop 머지 코드 재설계 조정)
  - 계승 (좌표계 SSoT 재사용): [`20260616-693-freefly-panning.md`](20260616-693-freefly-panning.md) (free-fly originOffset=[0,0,0] 불변식 + globalPos 의 target 추적) / [`20260617-696-freefly-wasd-movement.md`](20260617-696-freefly-wasd-movement.md) (forward 벡터 = `getDirection(Forward)`, deltaTime frame-rate 독립) / [`20260607-629-freefly-camera-zoom-forensic.md`](20260607-629-freefly-camera-zoom-forensic.md) (`wheelDeltaPercentage` scale-invariant 줌) / [`20260608-631-freefly-tier-escalation-forensic.md`](20260608-631-freefly-tier-escalation-forensic.md) (`cameraFromSunMeters` + body tier pull-back — **본 ADR 이 과도 줌아웃 원인으로 재평가**)
  - [#509](https://github.com/coseo12/astro-simulator/issues/509) (free-fly 진입 설계 — tier/origin/시점 보존)
  - [`20260422-floating-origin.md`](20260422-floating-origin.md) (Floating Origin SSoT) / [`docs/glossary.md`](../glossary.md) — [free-fly](../glossary.md) / [Tier](../glossary.md) / [dolly](../glossary.md) / [Floating Origin](../glossary.md) / [D-T2](../glossary.md)
- **교훈 적용**:
  - **measurement-first** (volt [#32](https://github.com/coseo12/volt/issues/32)) — 3대 문제를 정적 추론이 아닌 runtime 정량 측정으로 확정. 특히 P3(이동 과속)은 "radius 비례라 과속"이라는 직관 가설을 **screen-space px/step 일정(42.57px)** 실측으로 **부분 기각** — 진짜 원인은 계수 크기 + 진입 줌아웃 결합.
  - **DoD PASS ≠ 제품 동작** (volt [#74](https://github.com/coseo12/volt/issues/74)) — #631 가 자동 DoD(tier escalate, target≈0)는 PASS 였으나 사용자 체감은 "focus 한 곳이 사라짐". 본 재설계의 진입/줌/속도는 D-T2 게이트 필수.
  - "신규 함수 ≠ 신규 구현" (volt [#21](https://github.com/coseo12/volt/issues/21)) — 새 속도 모델도 #693 `PANNING_DELTA_PERCENTAGE` / #696 `getDirection` / #629 `wheelDeltaPercentage` 인프라를 재구성할 뿐 신규 산식 최소화.
  - "headless ≠ 실 브라우저" (volt [#77](https://github.com/coseo12/volt/issues/77)) — tier/radius/px 수치는 headless 신뢰, 진입·이동 체감은 D-T2 위임.

> **Forensic 변형 채택 근거 (5조건 전부 충족)**: ① 가설 N≥2 (P1/P2/P3 각 원인 + 진입 방향 3옵션) ② Runtime 측정 필수 (`_debug-699-freefly-tmp.mjs` volt #67 패턴, 사용 후 rm — 3 tier × 진입 전후 좌표/px/속도) ③ DoD PASS 인데 사용자 회귀 (#631) ④ 5±2 옵션 비교 (진입 방향 (가)~(다) + 속도 모델 3종) ⑤ Amendment 라운드 N 예상 (사용자 D-T2 진입 방향/속도 조정 — **본 ADR 핵심**). #693/#696 forensic 구조 답습.

---

## §1 배경

### 본 이슈 핵심

free-fly 카메라가 #509(진입)→#629(줌)→#631(허공 fix)→#693(패닝)→#696(WASD) 로 **단편 누적**돼 일관 모델이 없다. 각 PR 이 직전 PR 의 임시 결정 위에 또 임시 결정을 쌓아 진입/줌/이동/시점이 서로 다른 가정을 따른다. 사용자 D-T2 (2026-06-17) 3대 문제 보고:

1. **진입 일관성 부재** — `detachToFreeFly` 가 tier 별 다른 거동.
2. **과도 줌아웃** — #631(허공 방지)이 body tier 진입을 radius 35(태양계 전체)로 강제.
3. **이동 과속** — WASD 속도 = radius 비례 → 줌아웃 상태에서 순식간 화면 이탈.

### 단편 누적의 구조 (왜 통합 모델이 없는가)

| PR   | 결정                                     | 가정                      | 충돌                                           |
| ---- | ---------------------------------------- | ------------------------- | ---------------------------------------------- |
| #509 | 진입 시 tier/origin/**시점 보존**        | "현 위치에서 자유 탐색"   | body tier 에서 target 이 먼 위성에 동결 → 허공 |
| #631 | body tier 진입만 reset(35) **pull-back** | "허공 방지 = 태양계 개요" | focus 한 곳이 사라짐 (과도 줌아웃)             |
| #629 | 줌 = radius 비례 % (scale-invariant)     | "모든 tier 일정 비율 줌"  | (정합 — 본 재설계 계승)                        |
| #693 | 패닝 = radius 비례 (`pct=0.01`)          | "화면 px↔world 일정"      | (부분 정합 — 속도 계수 미통합)                 |
| #696 | WASD = radius 비례 (`pct=0.05`)          | "패닝과 동형 frame 이동"  | 계수 0.05 가 과대 → 과속. PR #698 닫힘         |

**근본**: 진입 줌 레벨 + 이동 속도 기준 + 시점이 각 PR 에서 독립 결정 — 통합 부재.

### Forensic 측정 결과 (2026-06-17, develop tip `f33e79c`, 1280×720, headless)

`apps/web/scripts/_debug-699-freefly-tmp.mjs`(volt #67 패턴, 실행 후 `rm`)로 실측. dev 핸들: `window.__solarScene` / `window.__simStore`. **각 tier 에서 `setSelectedBody(id)` focus → `enterFreeFly()` 진입 전후** 카메라 radius/target/tier + **focus body 화면 px 직경** + **이동 1 step 의 screen-space px** 측정. raw: [`docs/reports/699-freefly-redesign-debug-output.json`](../reports/699-freefly-redesign-debug-output.json).

#### 측정 1 — P1 진입 일관성 (tier 별 진입 거동 비교)

| 진입 경로         | focus radius | free-fly radius | free-fly tier   | target 거동    | 거동 종류                                   |
| ----------------- | -----------: | --------------: | --------------- | -------------- | ------------------------------------------- |
| **sun (solar)**   |         25.3 |       **463.9** | solar→**inner** | 원점 유지      | ⚠️ **18× 줌아웃 + tier escalate** (예상 밖) |
| **earth (inner)** |         68.1 |        **68.1** | inner (불변)    | 226.5 **보존** | #509 시점 보존                              |
| **io (body)**     |       158386 |        **35.0** | body→**solar**  | 11132→**0**    | #631 pull-back (개요)                       |
| **default 직접**  |         35.0 |            35.0 | solar (불변)    | 0              | 보존 (변화 없음)                            |

→ **4가지 서로 다른 거동**. 동일한 "탐색 진입" 액션이 진입 위치에 따라 (a)줌아웃+escalate (b)완전 보존 (c)개요 pull-back (d)무변화. **일관 규칙 0**.

> **sun 줌아웃 메커니즘** (forensic 추가 측정): sun focus 시 `lowerRadiusLimit` 이 4.64 로 완화(#378)된 상태에서 free-fly 진입 → tier 가 solar→inner escalate → `runTierTransition` 의 apparent-size 보존 수식 `radius_new = radius_old × newScale / oldScale` (glossary dolly) 가 발화해 radius 25.3→463.9 로 rescale. **#509 "시점 보존"의 의도와 어긋남** — tier escalation 부작용이 비-body tier 에서도 줌아웃을 유발.

#### 측정 2 — P2 과도 줌아웃 (focus body 화면 px)

| 진입 경로     | focus body px 직경 | free-fly body px 직경 | onScreen (free-fly) | 체감                                      |
| ------------- | -----------------: | --------------------: | ------------------- | ----------------------------------------- |
| **io (body)** |         **85.1px** |             **1.3px** | **false (화면 밖)** | focus 한 io 가 **65× 축소 + 프레임 이탈** |
| earth (inner) |            340.6px |        340.6px (보존) | true                | 정상 (보존)                               |

→ **io focus 후 탐색 = io 가 85px → 1.3px 서브픽셀 점으로 줄고 화면 밖으로 사라짐**. 사용자는 "focus 한 곳 근처 탐색" 기대인데 태양계 전체로 빠져 focus 대상을 잃음. **P2 = #631 의 직접 부작용 정량 확정**.

#### 측정 3 — P3 이동 과속 (screen-space px/step)

| tier            | free-fly radius | WASD stepWorld (=radius×0.05) | **screen px/step** | 화면 밖까지 steps | 초 @60fps |
| --------------- | --------------: | ----------------------------: | -----------------: | ----------------: | --------: |
| solar (sun)     |           463.9 |                          23.2 |          **42.57** |               8.5 | **0.14s** |
| inner (earth)   |            68.1 |                           3.4 |          **42.57** |               8.5 | **0.14s** |
| body→solar (io) |            35.0 |                           1.8 |          **42.57** |               8.5 | **0.14s** |
| default         |            35.0 |                           1.8 |          **42.57** |               8.5 | **0.14s** |

→ **screen px/step = 42.57 모든 tier 일정** (핵심 발견). radius 비례 stepWorld 가 target 평면 px 투영에서 정확히 상쇄돼 **화면 체감 속도는 radius 무관 이미 일정**. "radius 비례라 줌아웃 상태에서 과속"이라는 직관 가설은 **부분 기각** — 진짜 과속 원인은 **계수 0.05 자체가 과대** (화면 절반을 8.5 step = 0.14초만에 통과). 그리고 **P2(과도 줌아웃)와 결합**하면 줌아웃된 상태에서 작은 디테일이 순식간에 지나가 "이탈" 체감 증폭.

### 가설 검증 결론 (measurement-first)

- **P1 (진입 불일치)**: ✅ **확정** — 4가지 거동 정량. tier escalation 부작용까지 포착.
- **P2 (과도 줌아웃)**: ✅ **확정** — io 85px→1.3px+화면 밖. #631 pull-back 의 직접 결과.
- **P3 (이동 과속)**: ⚠️ **가설 부분 기각 → 재정의** — radius 비례는 screen-space 일정(42.57px)이라 무죄. 진짜 원인 = **계수 과대 (0.05)** + P2 결합. **올바른 fix = 계수 하향 (radius 비례 모델 유지)**, "화면공간 모델로 전면 교체" 불필요.

> **measurement-first 가치 (volt #32 재현)**: 이슈 본문은 P3 를 "radius 비례 → 화면공간 모델 전환"으로 진단했으나, 실측은 radius 비례가 **이미 화면공간 일정**임을 보였다. 식부터 갈아엎으면 올바른 모델을 "틀렸다"고 오진하는 역방향 손실(스프린트 계약 §10). 계수 튜닝 + 상한이 정답.

---

## §2 영향 모듈/파일

### 재설계 대상 (구현은 developer — 본 ADR 은 결정만)

- `apps/web/src/components/sim-canvas.tsx:469` `detachToFreeFly` — **tier 분기 제거** → 단일 진입 규칙. body tier reset(35) pull-back 삭제, 비-body tier escalation 부작용 차단.
- `packages/core/src/scene/camera.ts` — `WASD_DELTA_PERCENTAGE` 신설(계수 하향) + 패닝/WASD 공통 속도 상수 SSoT. `attachWasdControl`(#696 재구현).
- `packages/core/src/scene/camera-controller.ts` — `reset()` 호출 제거 영향 (body tier 진입이 더 이상 reset 호출 안 함). 진입 줌 보존/적정거리 헬퍼 신설 검토.
- `apps/web/src/components/layout/focus-quick-buttons.tsx:110` — `disabled={selected === null}` (탐색 버튼 focus 전제) — **default 진입 허용 여부 결정 대상** (§3 축 4).

### 계승 (어긋남 0 실측 확인 — 재사용)

- free-fly originOffset=[0,0,0] 불변식 (#693 §1) → WASD/패닝 평행이동 좌표 보정 0.
- `cameraFromSunMeters` + originOffset 가산 (#631 core) — tier escalation 산식 자체는 유지(줌아웃 시 tier 정상 escalate 필요). **진입 시점 강제 pull-back 만 제거**.
- `wheelDeltaPercentage`/`pinchDeltaPercentage`=0.01 (#629) — 줌 모델 정합, 변경 없음.

### 측정/가드 박제

- `apps/web/scripts/browser-verify-699-freefly-unified.mjs` (신규) — 진입 일관/줌 적정/속도 화면체감/무회귀 4 시나리오.
- `_debug-699-freefly-tmp.mjs` — 측정 후 rm (본 ADR 진단에 사용, 잔존 금지).

---

## §3 옵션 비교

### 축 1 — 진입 방향 모델 (P1+P2 통합 해소) ★ 핵심 결정

| 옵션                                  | 진입 거동                                                    | P2(줌아웃)          | tier 일관성  | "허공" 위험                                                                                                     | 사용자 직관                              |
| ------------------------------------- | ------------------------------------------------------------ | ------------------- | ------------ | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **(가) focus 위치·줌 보존 자유 이동** | 모든 tier: radius/target/시점 **그대로** 유지, focus 만 해제 | ✅ 줌아웃 0         | ✅ tier 불변 | ⚠️ body tier 에서 target 먼 위성 동결 (#631 원래 문제) → **줌아웃 상한 + safety-net origin shift 로 대체 처리** | ✅ "focus 한 곳에서 자유 이동" 직관 정합 |
| (나) 모든 tier 태양계 개요 pull-back  | 모든 tier reset(35)                                          | ❌ 전부 과도 줌아웃 | ✅ 일관      | ✅ 없음                                                                                                         | ❌ focus 무의미 (어디서 들어와도 태양계) |
| (다) 적정 거리 정규화                 | 진입 시 focus body 가 화면 N% 되는 radius 로 정규화          | △ tier 별 차등      | ✅ 일관      | ✅ 없음                                                                                                         | △ "줌이 살짝 바뀜" 체감                  |

**(가)+허공 대체 처리 = PM 권장 기본**. #631 의 "허공" 위험(body tier target 동결)은 진입 시 강제 줌아웃이 아니라 **(a) 줌아웃 상한(`upperRadiusLimit`)으로 빈 공간 도달 차단 + (b) safety-net origin shift(free-fly 1 AU 이동 시, glossary Floating Origin)로 좌표 정밀도 보존**으로 해소. 즉 "진입 순간 줌아웃" 대신 "사용자가 줌아웃할 때 상한에서 멈춤".

### 축 2 — 진입 줌 레벨 (P2)

| 옵션                    | 정책                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **(A) 현 시점 줌 보존** | 진입 시 radius 그대로. tier escalation 부작용(sun 463.9) 차단 위해 진입 직후 tier 재산정 **억제** (focus radius 유지) |
| (B) 적정 거리 정규화    | focus body px = 화면 40% 되는 radius 로 1회 정규화                                                                    |

**(A) 채택 (1차 제안)** — 축 1 (가)와 정합. 단 sun anomaly(tier escalate→rescale) 차단 필수: 진입 시 `lowerRadiusLimit` 원복 + tier 강제 재산정 회피.

### 축 3 — 이동 속도 모델 (P3, 패닝+WASD 공통)

| 옵션                                   | 모델                                                                                 | 측정 근거                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| **(I) radius 비례 + 계수 하향 + 상한** | step = `clamp(radius × pct, maxStep)`. WASD pct 0.05→**0.015 (1차)**, 패닝 0.01 유지 | screen px/step 42.57 이미 일정 → 계수만 ⅓ 하향하면 14px/step (화면밖 25 step=0.42s) |
| (II) 화면공간 절대 모델                | step = 화면 px 고정값 / pxPerWorld 역산                                              | 측정상 radius 비례가 이미 등가 → 추가 복잡도만                                      |
| (III) 화면 높이 비례                   | step = radius × tan(fov/2) × screenFraction                                          | (I)과 수학적 동치 (perspective)                                                     |

**(I) 채택 (1차 제안)** — 측정이 radius 비례=screen-space 일정을 보였으므로 모델 교체 불필요. **계수 하향(0.015) + 상한(maxStep)** 으로 과속 해소. 패닝(#693 0.01)과 WASD 를 `MOVE_DELTA_PERCENTAGE` 계열 SSoT 로 통합하되 입력 특성(드래그 vs 키 hold) 차이로 별도 계수 허용. **정확한 계수는 D-T2 튜닝 대상**.

### 축 4 — 진입 트리거 (default 진입 허용)

| 옵션                       | 트리거                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| (가) 현행 유지             | 탐색 버튼 `disabled={selected===null}` — focus 필수                                        |
| **(나) default 진입 허용** | focus 없이도 탐색 진입 허용 (`disabled` 제거). default 화면도 free-fly = 패닝/WASD/줌 활성 |

**(나) 채택 (1차 제안)** — 측정상 default 직접 진입은 이미 무변화(안전)하고 subscribe 의 freeFlyMode 전이 경로(#693)가 이미 존재. `disabled` 제거 + 라벨/툴팁 조정만. **focus 전제 폐기 여부는 PM/D-T2 최종 확인**.

### 결정 (1차 제안 — 사용자 D-T2 조정 라운드 예상)

- **축 1: (가) focus 위치·줌 보존 자유 이동** + #631 허공 위험을 줌아웃 상한 + safety-net origin shift 로 대체.
- **축 2: (A) 현 시점 줌 보존** + sun anomaly(tier escalate rescale) 차단.
- **축 3: (I) radius 비례 + 계수 하향(WASD 0.05→0.015) + 상한**. radius 비례 모델 유지(measurement 근거), 화면공간 전면 교체 기각.
- **축 4: (나) default 진입 허용** (focus 전제 폐기).
- **#693 패닝**: 좌표계/감도 모델 유지, 계수 SSoT 통합만. **#696 WASD**: PR #698 닫고 계수 0.015 + 상한으로 재구현.

---

## §4 Concrete Prediction (사전 박제 → 구현 후 실측 대조)

1. **진입 일관성**: 모든 tier(solar/inner/body/default)에서 free-fly 진입 후 `|radius_after − radius_before| / radius_before < 5%` (보존). io(body) 진입도 radius 35 강제 안 됨.
2. **과도 줌아웃 제거**: io focus(85px) → free-fly 후 io px **≥ 40px 유지 + onScreen=true** (현 1.3px/false 회귀 차단).
3. **이동 화면체감**: WASD 1 step screen px **≤ 16px** (현 42.57 → 0.015 계수 시 ~13px), 화면밖 도달 ≥ 25 step(≥0.4s). tier 간 편차 < 10%.
4. **코어 변경 라인 ≤ 25** (camera.ts WASD 재구현 + sim-canvas 진입 분기 단순화 — tier 분기 제거로 **순 감소** 예상).
5. **무회귀**: #629 줌(scale-invariant) / #693 패닝 좌표(originOffset=0) / #378 focus follow / tier escalation 산식(줌아웃 시 정상 escalate) 전부 PASS.

---

## §5 결정 (구현 가이드 + 회귀 가드 설계)

### 구현 가이드 (developer 인수인계)

1. **sim-canvas `detachToFreeFly` 단일화** — `if (solar.getTier() === 'body')` 분기 **삭제**. 모든 tier: `solar.detachFocus()` + `controller.clearFollow()` + `freeFlyActive=true` + `setMoveEnabled(true)`. body tier reset(35) pull-back 제거.
2. **sun anomaly 차단** — 진입 시 focus 로 완화된 `lowerRadiusLimit` 원복 + 진입 직후 tier 강제 재산정 억제 (radius rescale 회피). onBeforeRender tier escalation 은 사용자 줌 시에만 동작하도록.
3. **허공 대체 처리** — 진입 시 강제 줌아웃 대신 (a) `upperRadiusLimit` 로 줌아웃 상한 (빈 공간 도달 차단) (b) free-fly safety-net origin shift 유지(#631 core 산식).
4. **속도 통합** — `camera.ts` 에 `WASD_DELTA_PERCENTAGE = 0.015` (1차) + `MAX_MOVE_STEP` 상한 신설. 패닝 `PANNING_DELTA_PERCENTAGE=0.01` 유지. WASD = `getDirection(Forward/Up)` × `clamp(radius × pct, MAX_MOVE_STEP)`, deltaTime frame-rate 독립(#696 계승).
5. **default 진입** — `focus-quick-buttons.tsx:110` `disabled={selected===null}` 제거 + 툴팁/라벨 조정.

### 회귀 가드 — `browser-verify-699-freefly-unified.mjs` (3중 시뮬레이션 설계)

| 시나리오                 | DoD                                                         | 회귀 시               |
| ------------------------ | ----------------------------------------------------------- | --------------------- |
| S1. 진입 일관성 (4 tier) | 진입 전후 radius 편차 < 5% (전 tier)                        | tier별 분기 거동 부활 |
| S2. 줌아웃 제거 (io)     | io free-fly px ≥ 40 + onScreen                              | 1.3px/화면밖 회귀     |
| S3. 이동 화면체감        | WASD px/step ≤ 16, tier 편차 < 10%                          | 계수 과대 회귀        |
| S4. 무회귀               | #629 줌 % / #693 패닝 originOffset=0 / tier 줌아웃 escalate | 좌표계 깨짐           |

3중 시뮬레이션 (positive PASS → negative 계수 0.05 복원 시 FAIL → recovery 0.015 PASS) 으로 가드 작동 입증 (guard-pr-dod, volt #96/#109).

### 무회귀 실측 (developer 단계)

- `verify:629-freefly-zoom` / `verify:631-freefly-tier` / `verify:378-focus` / `verify:693-freefly-panning` 전부 재실행 PASS. **단 #631 가드는 본 재설계로 의도 변경** — S1(io pull-back) 시나리오는 **재설계되어 폐기/수정**(io 가 더 이상 reset 35 안 됨). #631 가드 수정 시 ADR 양방향 cross-link.

### Fix 후 박제 의무

- 코드 주석 (계수 SSoT + 진입 단일 규칙 + sun anomaly 차단 근거) / PR 본문 (3대 문제 정량 before-after) / CHANGELOG Behavior Changes (진입/줌/속도 체감 변화) 3곳 동시.

---

## §6 위험 / 재검토 트리거

| 위험                                                     | 가능성 | 완화                                                                          |
| -------------------------------------------------------- | ------ | ----------------------------------------------------------------------------- |
| body tier 진입 후 줌아웃 시 "허공" 재현 (#631 원래 문제) | 중     | 줌아웃 상한 `upperRadiusLimit` + safety-net origin shift. D-T2 로 상한값 튜닝 |
| WASD 계수 0.015 가 너무 느림/빠름                        | 중     | D-T2 튜닝 지점. 1차 제안일 뿐                                                 |
| #631 가드 폐기로 회귀 사각 발생                          | 저     | S1/S2 신규 가드가 의도(과도 줌아웃 제거)를 역으로 보호                        |
| tier 재산정 억제가 정상 줌아웃 escalation 막음           | 중     | "진입 직후 1회 억제" 한정, 사용자 줌 시 escalation 정상 동작 — S4 가드        |

### 재검토 트리거

1. 사용자 D-T2 "진입 방향 (가)/(나)/(다) 부적절" → 축 1 재결정 (Amendment).
2. 사용자 D-T2 "이동 속도 부적절" → `WASD_DELTA_PERCENTAGE` / `MAX_MOVE_STEP` 튜닝.
3. 줌아웃 상한값 부적절 (너무 좁음/넓음) → `upperRadiusLimit` 튜닝.
4. default 진입 허용이 혼란 유발 → 축 4 재결정.

---

## §교차검증 반영 사항

(cross-validate 실행 후 본 섹션에 4축 분류 — 합의 / 이견 수용 / Claude 재분석 기각 / 고유 발견 후속 분리 — 통합 예정. 통합 후 상태 Provisional → Accepted 전이.)

### 호출 전 Claude 편향 셀프 체크 (CLAUDE.md 교차검증 4종)

- **낙관적 일정**: ⚠️ 부분 통과 — "코어 ≤25 라인 순감소" 예측은 sun anomaly 차단 + 줌아웃 상한 신규 로직이 추가될 수 있어 낙관 가능성. cross-validate 에 "진입 단일화로 정말 순감소인가, 아니면 안전장치 추가로 증가하는가" 명시 질문 삽입.
- **결합 간과**: ⚠️ 부분 통과 — P2(줌아웃)와 P3(속도)의 결합("줌아웃된 상태에서 작은 디테일 순간 통과")을 측정으로 포착했으나, tier escalation 억제가 다른 free-fly 경로(safety-net origin shift)와 결합하는 부작용 미검증. cross-validate 명시 질문.
- **폐기 프레이밍**: ✅ 통과 — #631 을 "틀렸다"가 아니라 "DoD PASS 였으나 체감 회귀, 의도(허공 방지)는 줌아웃 상한으로 계승"으로 재평가. #629/#693 좌표계는 계승.
- **순수주의**: ✅ 통과 — "화면공간 모델로 전면 재설계"라는 순수한 재설계 유혹을 measurement(42.57px 일정)로 기각하고 계수 튜닝이라는 최소 변경 채택.

---

## §7 Amendment 라운드 N

(사용자 D-T2 / cross-validate 후속으로 결정 갱신 시 추가. 본 ADR 은 진입 방향/속도가 1차 제안이라 Amendment 다회 예상.)

---

## §8 후속 / 분리 이슈

- 사용자 줌/이동 감도 **설정 UI** (#629 §6 에서 박제된 후속) — 본 재설계 비목표. 수요 확인 후 분리.
- (cross-validate 고유 발견 시 여기에 분리 이슈 링크 박제.)

---

## 변경 이력

- 2026-06-17: 최초 작성 (Provisional). measurement-first 진단 (P1 4거동 / P2 io 85→1.3px / P3 42.57px 일정 → 계수 과대 재정의). 진입 (가)+(A)+(I)+(나) 1차 제안. cross-validate + D-T2 대기.
