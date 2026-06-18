# ADR: free-fly body tier 줌아웃 시 tier escalation rescale 급변 (forensic)

- 상태: **Accepted** (cross-validate 2026-06-18, agy outcome=applied — §7 교차검증 반영 사항 4축 통합 완료)
- 날짜: 2026-06-18
- 유형: Forensic ADR 변형 (다중 가설 + runtime 측정 + DoD PASS 인데 D-T2 회귀 + 5 옵션 — 5조건 중 4 충족)
- 이슈: [#704](https://github.com/coseo12/astro-simulator/issues/704) D-T2 회귀 대응 (별도 이슈 분리 아님 — **PR #705 에 통합 fix**, 사용자 합의 (A))
- 계승 / cross-link:
  - [`20260617-699-freefly-camera-unified-redesign.md`](20260617-699-freefly-camera-unified-redesign.md) §5-2 (sun anomaly 구조적 차단) / §5-3 (허공 대체 처리) — **본 회귀는 #699 잠복 버그**. #699 가 진입 시점 강제 pull-back 만 제거하고 "사용자 줌 시 정상 escalate" 를 의도로 박제했으나, 그 escalate 전환의 **rescale 급락(체감 급변)** 이 body tier(특히 외행성계 위성)에서 미해결로 잔존.
  - [`20260618-704-freefly-sensitivity-settings-ui.md`](20260618-704-freefly-sensitivity-settings-ui.md) §Amendment B-1 — earth focus 경로의 rescale(690→40, 17×)을 fix 했으나, **body tier 진입 경로(io 158386→0.53, ×3.35e-6)는 별개 메커니즘으로 미해결**. 본 ADR 이 그 잔존을 forensic 진단.
  - [`20260608-631-freefly-tier-escalation-forensic.md`](20260608-631-freefly-tier-escalation-forensic.md) — `cameraFromSunMeters` + originOffset 가산 (escalation 판정 산식 원천).
- glossary: [free-fly](../glossary.md) / [Tier](../glossary.md) / [D-T2](../glossary.md) / [Floating Origin](../glossary.md) / [renderScale](../glossary.md)
- 관련 교훈:
  - **DoD PASS ≠ 제품 동작** (volt [#74](https://github.com/coseo12/volt/issues/74)) — #699 자동 DoD(S1~S6) + #704 B-1 fix DoD 모두 PASS 였으나, 외행성계 위성(io) focus → free-fly → 줌아웃 경로의 체감 급변은 D-T2 실 Chrome 에서만 드러남.
  - **수치 DoD 미달 시 측정 방법 검증 우선** (CLAUDE.md 스프린트 계약 §10, volt [#32](https://github.com/coseo12/volt/issues/32)) — "rescale 산식 버그" 1차 가설을 측정으로 능동 검증하여 **산식은 정상, escalation 판정 경로가 진짜 원인** 으로 재정의.
  - **인계 항목 실측 재검증 — NO-OP 회피** ([no-op-adr-pattern](../lessons/no-op-adr-pattern.md), volt #67) — `scripts/_debug-704-*-tmp.mjs` 로 rescale 배율 + escalation 발화 조건을 runtime 산출 후 즉시 rm.

---

## §1 배경

### 본 이슈 핵심 — body tier 줌아웃 급변

free-fly 진입 후 휠 줌아웃 시, **위성/근접 천체 focus 진입(body tier)** 경로에서만 카메라 radius 가 급락(시야 급변)한다. 메인 오케스트레이터가 전 경로(default/earth/io)를 직접 측정해 body tier 단독 회귀로 특정했다.

| 진입 경로     | tier     | 줌아웃 거동                                 | 판정    |
| ------------- | -------- | ------------------------------------------- | ------- |
| default(탐색) | solar    | r 35→175 클램프, tier 불변                  | ✅ 정상 |
| earth(행성)   | inner    | r 68→340 클램프, tier 불변                  | ✅ 정상 |
| **io(위성)**  | **body** | **r 158386→1000→0.8 급락, tier body→solar** | ❌ 급변 |

### Forensic 측정 결과 (2026-06-18, develop tip = `89a60c6`, feature/704 tip = `0d1f7b9`)

`scripts/_debug-704-tier-jump-tmp.mjs` (runTierTransition 의 non-focusMesh fallback `computeTargetRadius = radiusOld × newScale/oldScale` 산식 재현, 사용 후 rm) + `_debug-704-escalation-trigger-tmp.mjs` (escalation 발화 조건 검증) 측정값:

**측정 1 — tier escalation 시 radius rescale 배율** (RENDER_SCALE: body=2.51e-5, inner=1.54e-9, solar=8.4e-11)

| 전환                       | 산식                         | radius_old → radius_new | rescale 배율                  |
| -------------------------- | ---------------------------- | ----------------------- | ----------------------------- |
| **body→solar (현행 직행)** | 158386 × (8.4e-11 / 2.51e-5) | 158386 → **0.5301**     | **×3.35e-6** (≈300,000× 축소) |
| body→inner (단계 1/2)      | 158386 × (1.54e-9 / 2.51e-5) | 158386 → 9.72           | ×6.14e-5 (≈16,300× 축소)      |
| inner→solar (단계 2/2)     | 9.72 × (8.4e-11 / 1.54e-9)   | 9.72 → 0.53             | ×5.46e-2 (≈18× 축소)          |

> 실측 raw 의 z1 `158386→1000` 은 위 rescale(→0.53) + `upperRadiusLimit = SOLAR_ZOOMOUT_LIMIT(1000)` clamp 동시작용 결과. 이후 z3 `1000→0.8`, z4~15 `1→17` 점진 회복은 escalate 직후 새 solar tier 좌표계에서의 정상 클램프/줌인 거동.

**측정 2 — escalation 발화 조건** (io = 목성계, 궤도 5.203 AU)

| zoomoutFactor | upperRadiusLimit (unit) | = focus 거리(AU) | io cameraFromSun | body 이탈임계(innerUpper×1.15=0.345AU) | escalation        |
| ------------- | ----------------------- | ---------------- | ---------------- | -------------------------------------- | ----------------- |
| 2             | 3.17e5                  | 0.084            | **5.203 AU**     | 0.345 AU                               | **발화 (불가피)** |
| 5 (default)   | 7.92e5                  | 0.211            | **5.203 AU**     | 0.345 AU                               | **발화 (불가피)** |
| 10            | 1.58e6                  | 0.422            | **5.203 AU**     | 0.345 AU                               | **발화 (불가피)** |

### 가설 검증 결론 — 1차 분석(rescale 산식 버그)의 정정

메인 1차 분석은 "rescale 산식 `radius_new = radius_old × newScale/oldScale` 가 158배 점프 유발" 로 진단. 측정으로 **2단 정정**:

1. **rescale 산식은 정상** — apparent-size(화면 px) 보존 관점에서 수학적으로 옳다. body→solar 시 mesh 도 동일 비율로 작아지므로 화면 픽셀은 보존. **버그가 아니라 의도된 산식**. 따라서 "산식 수정" 방향(옵션 e 의 변형)은 회피해야 한다(올바른 식을 틀렸다고 오진하는 역방향 손실 — volt #32).

2. **진짜 원인 = escalation 판정 경로의 좌표 기준 mismatch** (1차 분석보다 깊은 층):
   - free-fly 진입 시 `enterFreeFly` 가 `focusBodyIdForAssert = null` 로 설정(focus tracking 해제, [solar-system-scene.ts §enterFreeFly](../../packages/core/src/scene/solar-system-scene.ts) line 223).
   - 그 결과 `updateTierByCamera` 가 `tierFromFocus(cameraFromFocus)` 대신 **`tierFromCameraDistance(cameraFromSun)`** 경로를 탄다(line 905-907).
   - **io 같은 외행성계 위성은 본체가 태양에서 5.2 AU 떨어져 있으므로 `cameraFromSun` 이 항상 `solarUpper(3 AU)` 를 초과** → escalation gate(진입 ×1.15 margin)가 풀리는 순간 `tierFromCameraDistance` 가 즉시 `solar` 판정 → body→solar 직행 setTier.
   - 즉 **gate margin(15%)이나 zoomoutFactor(상한)로는 escalation 자체를 막을 수 없다** — 외행성 위성은 "조금만 줌아웃해도" `cameraFromSun` 기준이 이미 solar 영역. 이것이 #704 B-1 fix(earth 경로 한정)가 io 경로를 못 잡은 이유.

> **#704 B-1 과의 메커니즘 분기**: earth(inner tier)는 `cameraFromSun ≈ 1 AU` 로 solarUpper(3AU) 미만 → escalation 이 radius/upperLimit 증가로만 트리거(B-1 이 gate↔upperLimit 분리로 차단). 반면 io(body, 5.2AU)는 cameraFromSun 이 본질적으로 solar 영역 → upperLimit 과 무관하게 escalation 불가피. **두 회귀는 동일 증상, 다른 원인.**

### 잠재 시점 분석

본 회귀는 #631(body tier escalation 산식 도입) ~ #699(진입 단일화)에 걸친 **누적 잠복 버그**. #699 가 진입 시점 pull-back 만 제거하고 escalation 산식을 보존했으므로, 외행성계 위성 free-fly 줌아웃 경로는 #699 머지 시점부터 본 급변을 내포. DoD(S1~S6)는 earth/sun 중심 + apparent-size px 기준이라 body tier 체감 급변을 검출 못 함(DoD PASS ≠ 제품 동작).

---

## §2 영향 모듈/파일

### 측정 결과 박제 (본 ADR 동반)

- 측정 스크립트는 `scripts/_debug-704-*-tmp.mjs` 로 산출 후 즉시 rm (volt #67 패턴). 본 ADR §1 표가 측정 SSoT.

### Fix 후보별 영향 모듈 (옵션 선택 후 dev 변경 대상)

- **escalation 판정 경로** (가장 유력): `apps/web/src/components/sim-canvas.tsx:717-760` `onBeforeRender` escalation gate — `updateTierByCamera` 호출 인자/조건. body-tier-origin free-fly 에서는 `cameraFromFocus` 기준 판정 또는 escalation 억제.
- **tier 전환 dolly**: `packages/core/src/scene/tier-transition.ts:117` `computeTargetRadius` (산식 자체는 보존) / `runTierTransition` line 392 Animation(이미 300ms ExponentialEase 존재 — 옵션 (a) tween 의 duration/easing 만 조정 대상).
- **진입 스냅샷**: `apps/web/src/components/sim-canvas.tsx:546-562` `detachToFreeFly` — `freeFlyEntryRadius` / `upperRadiusLimit` 산정.
- **tier 판정 코어**: `packages/core/src/scene/solar-system-scene.ts:893-912` `updateTierByCamera` / `tier.ts:98-133` `tierFromFocus` / `tierFromCameraDistance`.

### Fix 가 깨는 박제값 (ADR amendment 후보)

- #699 ADR §5-2 "사용자 줌 시에만 정상 escalate" — body tier 외행성 위성은 escalate 를 억제/지연하므로 본 ADR 이 §5-2 의 body-tier 예외를 명시(#699 ADR Amendment 또는 본 ADR cross-link).
- #699 ADR §5-3 "허공 대체 처리" — escalate 억제 시 "허공" 재현 위험 검토 필수(아래 옵션 (c) trade-off).

---

## §3 옵션 비교 (5축)

> **측정이 옵션 가치를 재정렬했다**: 1차 옵션 목록은 (a) tween 보간을 유력으로 봤으나, 측정 1 이 body↔solar/inner renderScale 간극(16,300×~300,000×)을 드러내 **단순 보간/단계화로는 체감 급변 해소 불충분** 임을 정량 증명. 진짜 레버는 **escalation 발화 자체의 제어**(옵션 c/d 계열).

### 옵션 (a) — tier 전환 radius rescale 애니메이션 보간 강화

158386→0.53 점프를 짧은 tween 으로 부드럽게. **runTierTransition 에 이미 300ms ExponentialEase 존재** → duration 연장/easing 변경만.

- **장점**: 코드 변경 최소(duration 상수). apparent-size 보존 유지. escalation 의도(#699 §5-2) 보존.
- **치명적 단점 (측정 근거)**: 300,000× radius 변화를 300ms→예: 800ms 로 늘려도 **여전히 "태양계 끝까지 빨려나가는" 체감 급변**. 보간은 _점프를 부드럽게_ 할 뿐 _목적지(solar 개요)가 위성에서 너무 멈_ 을 바꾸지 못한다. D-T2 회귀의 본질(사용자가 io 옆에 있고 싶은데 태양계 전체로 튕김)을 해소 못 함.
- **판정**: 단독 기각. 다른 옵션과 결합 시 보조(전환이 불가피할 때의 완충)로만 가치.

### 옵션 (b) — body tier 줌아웃 시 단계적 tier 강하 (body→inner→solar)

단일 점프를 중간 tier 경유로 분산.

- **장점**: 각 전환 배율이 작아짐(직관적 기대).
- **치명적 단점 (측정 근거)**: 측정 1 이 반증 — **body→inner 단계가 이미 ×6.14e-5(16,300× 축소)**. 가장 큰 단일 점프가 거의 그대로 잔존. body↔inner renderScale 간극(2.51e-5 vs 1.54e-9)이 근본이라 단계화의 이득 미미. 게다가 외행성 위성은 cameraFromSun 기준 inner 영역(0.3~3AU)도 건너뛰어 곧장 solar → 중간 tier 가 안정 체류하지 못함.
- **판정**: 기각 (측정으로 무효 입증).

### 옵션 (c) — body tier 진입 시 escalation 판정을 cameraFromFocus 기준으로 + 별도 "개요로" 트리거

free-fly 가 **body tier 에서 시작**한 경우, escalation 판정을 `cameraFromSun`(외행성은 항상 solar 영역) 대신 **`cameraFromFocus`(탐색 중인 위성으로부터 거리)** 기준으로 둔다. 위성 주변에서 줌아웃하면 위성 근방을 탐색(태양계로 안 빠짐), 명시적 "개요로"(reset/단축키)로만 solar 전이.

- **장점**: D-T2 회귀의 본질(위성 옆 머무름) 직접 해소. escalation 빈도 격감 → rescale 급락 발생 자체 차단. zoomoutFactor 슬라이더가 body tier 에서 진짜 의미(위성 근방 줌아웃 범위 제어).
- **단점**: #631 "허공" 재현 위험 — 위성에서 멀리 줌아웃하면 body tier renderScale 로 빈 공간(별 없는 검은 화면). → `upperRadiusLimit`(=entryRadius×zoomoutFactor) 상한 + safety-net origin shift(#631 core)로 빈 공간 도달 차단(#699 §5-3 계승). 구현 복잡도 중(escalation gate 에 body-origin 분기 1개 추가).
- **판정**: **유력 (PM 권장 기본)**. #631 허공 위험은 이미 #699 §5-3 메커니즘으로 대응 가능.

### 옵션 (d) — escalation 임계/히스테리시스를 body tier 에서 확대

body tier 진입 시 `TIER_HYSTERESIS`(15%) 또는 escalation margin 을 크게(예: ×3) 잡아 escalate 를 늦춤.

- **장점**: 코드 변경 작음(상수 1개 분기).
- **단점**: 외행성 위성은 cameraFromSun 이 본질적으로 solar 영역이라 **margin 을 아무리 키워도 결국 발화**(측정 2). 점프 빈도만 줄고 크기/불가피성 불변. 근본 해결 아님(증상 완화).
- **판정**: 기각 (측정 2 가 margin 무력 입증). 단 옵션 (c) 의 보조(진입 직후 즉시 발화 방지)로 잔존 가치.

### 옵션 (e) — 현행 유지 + "의도된 동작" 문서화

- **판정**: 기각 (사용자 D-T2 회귀라 부적절 — 명시 기각 후보).

### 축별 비교 매트릭스

| 옵션                                       | #631 허공 방지         | #699 진입 보존 | apparent-size 정합 | 체감 급변 해소 | zoomoutFactor 의미 | 구현 복잡도 | 판정          |
| ------------------------------------------ | ---------------------- | -------------- | ------------------ | -------------- | ------------------ | ----------- | ------------- |
| (a) tween 강화                             | N/A                    | ✅             | ✅                 | ❌ (측정 반증) | ❌                 | 낮음        | 보조만        |
| (b) 단계 강하                              | △                      | ✅             | ✅                 | ❌ (측정 반증) | ❌                 | 중          | **기각**      |
| **(c) cameraFromFocus 기준 + 개요 트리거** | ✅ (상한+origin shift) | ✅             | ✅                 | ✅             | ✅                 | 중          | **채택 후보** |
| (d) 히스테리시스 확대                      | △                      | ✅             | ✅                 | △ (빈도만)     | △                  | 낮음        | 보조만        |
| (e) 현행 유지                              | ✅                     | ✅             | ✅                 | ❌             | ✅                 | 0           | **기각**      |

### 권장 안 (사전 선호)

**(c) 채택 + (a)/(d) 보조**. body tier(특히 외행성 위성) free-fly 줌아웃을 `cameraFromFocus` 기준으로 판정해 위성 근방 탐색을 보존하고, escalation 이 불가피하게 발생하는 경계(상한 도달 또는 명시적 "개요로")에서만 전환하되 그 전환에 (a) tween 완충을 적용. #631 허공은 `upperRadiusLimit`(entryRadius×zoomoutFactor) + origin shift 로 차단.

---

## §4 Concrete Prediction (사전 박제 → 구현 후 실측 대조)

### 예측 1 — 코드 변경 라인 수

- `updateTierByCamera` referenceOrigin 파라미터 계약(solar-system-scene.ts) + sim-canvas anchor 스냅샷/전달 + anchor 기준 판정: **코어 ≤ 16 라인** (옵션 c, cross-validate 이견 3 계약화 반영해 12→16 상향). tier-transition.ts duration 상수(옵션 a 보조): ≤ 2 라인. 초과 시 추상화 누락 신호 → ADR Amendment.

### 예측 2 — 수치 DoD (신규 가드 시나리오)

- **body tier 줌아웃 점프 배율 < 5×** (인접 프레임 radius 비). 현행 ×3.35e-6(역수 약 300,000×) → fix 후 단일 프레임 radius 변화율 5× 이내(부드러운 dolly). io/europa/titan(외행성계 위성 3종) 측정.
- **escalation 발생 횟수**: 진입 후 zoomoutFactor 상한 내 줌아웃 sweep 에서 body→solar setTier 호출 0회(옵션 c 정상 동작 시). 명시적 "개요로" 트리거 시에만 1회 + tween.

### 예측 3 — 인접 영역 무영향 (보조)

- earth/default 경로 줌아웃 거동 byte-identical (verify:699 S1~S6 / verify:693 PASS). #704 B-1 fix(earth rescale) 무회귀.

---

## §5 결정 (사용자 선택 박제 후 — dev 인수인계)

> **본 §5 는 사전 권장(옵션 c + a/d 보조)을 박제. cross-validate(§7) 및 사용자 D-T2 후속으로 Amendment 가능. dev 는 §3 매트릭스 + 측정값 기준으로 옵션 c 우선 구현하되, 측정 2 의 "외행성 위성 cameraFromSun 항상 solar" 제약을 반드시 재현 검증 후 착수.**

### 구현 절차 (옵션 c 기준 — cross-validate 이견 3/4/5 반영)

1. **escalation 판정을 Core 계약으로 (이견 3 — 레이어 침범 방지)**: sim-canvas.tsx `onBeforeRender` 프레임 루프에 분기를 산재시키지 말고, **`updateTierByCamera` 가 `referenceOrigin` (또는 `freeFlyAnchorBody`) 파라미터를 명시 인자로 받도록 계약 정형화** (`packages/core/src/scene/solar-system-scene.ts:893`). 판정 좌표 기준(sun vs focus anchor)을 Core API 가 책임지고, sim-canvas 는 진입 시 anchor 정보만 전달.
2. **body tier free-fly = 외/내행성 무관 cameraFromFocus(anchor) 기준 (이견 4 — 일관성)**: free-fly 가 body tier 에서 시작한 경우(진입 시 `detachToFreeFly` 에서 `solar.getTier()` + focus body id 스냅샷), escalation 판정을 `cameraFromSun` 대신 **anchor(탐색 시작 body) 로부터 거리** 기준. 달(1AU)/io(5.2AU) 모두 동일 거동(위성 근방 보존). cameraFromSun 직행 차단.
3. **개요로 명시 트리거**: 위성 근방 줌아웃 상한(`upperRadiusLimit` = entryRadius × zoomoutFactor) 도달 시 solar escalate 를 **자동 발화하지 않고**, reset/단축키로만. (또는 상한 도달 시 옵션 a tween 으로 1회 완충 전환 — D-T2 로 둘 중 택일.)
4. **anchor 스냅샷 생명주기 (이견 5 — cleanup)**: anchor 스냅샷은 진입 시 1회 캡처, **free-fly 해제 / focus 전환 시 reset** (기존 `freeFlyEntryRadius=null` 정리 경로에 동반). stale 시 다음 판정 오작동 방지.
5. **(a) 보조**: escalate 가 불가피한 경계(수동 "개요로") 전환에 `runTierTransition` durationMs 를 600~800ms 로(상수, ≤2라인). 단 측정상 단독으로 부족하므로 c 와 결합 시에만.
6. **무회귀 가드**: `scripts/browser-verify-704-body-tier-zoomout.mjs` 신설 — body tier(io/europa/titan **+ 달(내행성 일관성 셀)**) 진입 → 줌아웃 sweep → 인접 프레임 radius 비 < 5×, setTier(body→solar) 0회. earth/default 대조 셀 포함. **전환 후 `camera.position`/`target` NaN assertion** 포함(이견 6).

### Fix 후 박제 의무

- 측정값(fix 전/후 점프 배율) ADR §7 Amendment 표로 박제.
- #699 ADR §5-2 에 body-tier 외행성 위성 예외 cross-link.
- CHANGELOG `### Behavior Changes`: "free-fly body tier 줌아웃 시 위성 근방 탐색 보존(태양계 전체 급변 제거)".

---

## §6 위험 / 재검토 트리거

| 위험                                                                   | 정도 | 완화                                                                                                         |
| ---------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------ |
| 옵션 c 가 #631 "허공" 재현 (위성에서 멀리 줌아웃 시 빈 공간)           | 중   | `upperRadiusLimit`(entryRadius×zoomoutFactor) 상한 + safety-net origin shift(#631 core). D-T2 로 상한값 튜닝 |
| `freeFlyEntryTier` 스냅샷이 진입 후 tier 변동과 어긋남                 | 중   | 진입 시 1회 캡처(detachToFreeFly), 명시적 "개요로" 시에만 갱신. snap-back 0                                  |
| cameraFromFocus 기준이 inner tier 행성(earth)에도 의도치 않게 적용     | 낮   | body tier 진입 한정 분기. earth(inner)는 기존 cameraFromSun 경로 유지(#704 B-1 보존)                         |
| tween(옵션 a) 단독 채택 유혹 (측정 무시)                               | 중   | 측정 1 박제 — 보간은 점프 부드럽게만, 목적지(태양계 끝)는 불변. c 필수                                       |
| floating-origin 300,000× 전환 시 NaN/우주 미아 (cross-validate 이견 6) | 중   | 전환 후 `camera.position`/`target` NaN assertion + 가드 셀. 발견 시 전환 전 좌표 동기화 트랜잭션 검토        |

### 재검토 트리거

- 사용자 D-T2 가 "위성 근방 머무름" 보다 "줌아웃하면 태양계 보고 싶다" 선호 시 → 개요 트리거 자동화(상한 도달 시 tween 전환)로 Amendment.
- 내행성계 위성(달=earth-moon, 1AU)은 cameraFromSun 이 inner 영역이라 옵션 c 분기 불필요할 수 있음 → 측정으로 body-origin 분기 조건 정밀화.

---

## §7 Amendment 라운드 (cross-validate / D-T2 후속)

### 교차검증 반영 사항 (cross-validate 2026-06-18, agy outcome=applied, exit 0, plan_bypass=false)

> 로그: `.claude/logs/cross-validate-architecture-20260618-175048.log`. 앵커: ADR 신규.

**호출 전 Claude 편향 셀프 체크** (4종): (낙관적 일정) 옵션 c 코어 ≤12라인 예측이 과소평가일 수 있음 → cross-validate 에 검증 질문 (1)(2) 명시 삽입. (결합 간과) body tier 스냅샷 ↔ #699 진입 단일화 ↔ #631 허공 3자 결합 — 질문 (3) 삽입. (폐기 프레이밍) 옵션 a/b/d 를 측정으로 기각 — 질문 (4)로 측정 결론 타당성 외부 검증. (순수주의) 통과.

#### 합의 — Claude 설계와 일치한 agy 지적 (즉시 반영)

1. **옵션 (a)/(b)/(d) 측정 기각 타당성** (질문 4) — agy 가 "300,000× 스케일 변화가 물리적으로 존재함을 수학적으로 명쾌히 논증, 단순 보간/단계화/마진 조정으로 외행성 위성 줌아웃 급변 차단 불가" 동의. 측정 1/2 결론 = escalation 발화 제어가 진짜 레버 → **합의 확정**. §3 매트릭스 유지.
2. **옵션 (c) 채택 타당성** — agy "위성(Focus) 중심 거리(`cameraFromFocus`)로 줌아웃 범위를 zoomoutFactor 상한 내 강제 제어 → D-T2 회귀 근본 해소" 동의. §5 결정 유지.

#### 이견 수용 — agy 근거가 합리적이어서 수정 (원안 → 수정안)

3. **레이어 침범 방지 — escalation 판정을 Core 계약으로 (agy IMPORTANT)** — 원안: sim-canvas.tsx `onBeforeRender` 프레임 루프에 body-origin 분기 추가. 수정안: **`updateTierByCamera` 가 `referenceOrigin`(또는 `freeFlyAnchorBody`) 파라미터를 명시 인자로 받도록 계약 정형화** → 판정 좌표 기준(sun vs focus anchor)을 Core API 가 책임. sim-canvas 는 진입 시 anchor 정보만 전달. 수용 근거: 현재도 escalation 판정 산식(cameraFromSun/Focus 계산)이 sim-canvas 와 solar-system-scene 에 산재해 레이어 오염 잠재. 계약 1개 추가로 결합도 하락 — #705 범위 내(이미 두 파일 모두 손대므로 추가 비용 작음). 단 **full anchor 추상화(Adaptive Reference Origin 패턴 전면 도입)는 분리** — 아래 기각 참조.
4. **내행성/외행성 위성 일관성 (agy 누락 1)** — 원안 §6 재검토 트리거에 "달(1AU)은 cameraFromSun inner 영역이라 분기 불필요할 수 있음" 으로 약하게 기재. 수정안: agy 지적("외행성 위성은 묶이는데 달은 태양계로 탈출하는 UX 불일치")대로 **body tier free-fly 는 외/내행성 무관 동일하게 cameraFromFocus(anchor) 기준 적용**으로 §5 결정 강화. 수용 근거: cameraFromSun 분기는 본질적으로 "본체가 태양에서 얼마나 머냐"에 따라 거동이 갈리는 비결정적 UX. anchor 기준 통일이 일관 모델(#699 철학)과 정합.
5. **freeFlyEntryTier/anchor 스냅샷 생명주기 (agy 미비점 1)** — 원안 §5 에서 진입 시 캡처만 명시, cleanup 미정의. 수정안: **free-fly 해제 / focus 전환 시 anchor 스냅샷 reset** 을 §5 구현 절차에 명시(기존 `freeFlyEntryRadius=null` 정리 경로에 동반). 수용 근거: 스냅샷 stale 시 다음 줌아웃 판정 오작동 — 명백한 결함 방지.
6. **floating-origin 300,000× 전환 NaN/수치 안정성 (agy 미비점 5)** — 수정안: §6 위험표 + 가드에 **전환 후 `camera.position`/`target` NaN assertion** 추가. 수용 근거: 대규모 스케일 전환 + origin shift 동시 발생 시 수치 불안정 가능 — 저비용 가드.

#### Claude 재분석으로 기각한 agy 제안 (맹목 수용 회피 — volt #51)

7. **Adaptive Reference Origin 패턴 전면 추상화 (agy 확장성 §4)** — agy 는 `freeFlyEntryTier === 'body'` 하드코딩 분기를 "최종 포커스 천체 앵커 기준 통일 추상화"로 전면 일반화 권고. **부분 수용 + 부분 기각**: anchor 기준 _판정_ 은 수용(이견 3/4), 그러나 미래 tier(Galactic/Exoplanet 등 — **현존하지 않음**)를 위한 전면 추상화는 **YAGNI 기각**. 현재 tier 는 solar/inner/body 3종 고정. 추상화는 4번째 tier 가 실제 등장할 때 도입(그때 ADR Amendment). 근거: 측정 가능한 현재 회귀 해소가 목표(CRITICAL #6 스프린트 범위), 가상 미래 확장은 비목표.
8. **줌 한계 탄성 감쇄 / 멀미 방지 연출 (Motion Blur / Dolly-Zoom FOV / 페이드 / 마이크로 가이드 — agy 누락 2/3)** — **#705 범위 밖 → 후속 분리**. 판단 질문("이 변경이 #705 Behavior Changes 에 원 완료 기준과 직교하는 항목을 추가하는가?") = 예. D-T2 회귀의 완료 기준은 "줌아웃 급변 제거(점프 배율 < 5×)" 이지 "줌 한계 시각 피드백/멀미 완화 연출" 이 아니다. elastic damping / motion blur / dolly-zoom 은 net-new UX feature 로 #705 와 직교. **고유 발견 (후속 분리)** 로 §8 에 기록 — 우선순위 low.

#### 고유 발견 (후속 분리)

- **줌 한계 도달 UX 피드백 + 개요 복귀 멀미 완화 연출** (agy 누락 2/3) — 위 기각 8 항목. 본 #705 머지 후 사용자 D-T2 반응 관찰 후 필요 시 별도 이슈. 우선순위 **low** (회귀 fix 후 polish). 설계 스케치: (a) upperRadiusLimit 도달 시 elastic dampening visual cue 또는 "[개요로] 키 안내" 마이크로 가이드 (b) body→solar 수동 전환 시 600~800ms tween 에 더해 FOV dolly-zoom 변형 또는 fade. **Builds on: #704 / PR #705**.

---

## §8 후속 / 분리 이슈

- 본 회귀는 **#704 PR #705 에 통합 fix** (별도 이슈 분리 아님 — 사용자 합의 (A)).
- **후속 분리 (cross-validate 고유 발견, 우선순위 low)** — 줌 한계 도달 UX 피드백(elastic dampening / "[개요로]" 마이크로 가이드) + 개요 복귀 멀미 완화 연출(FOV dolly-zoom 변형 / fade). #705 머지 후 D-T2 반응 관찰 후 필요 시 이슈 생성. **Builds on: #704 / PR #705**. (§7 기각 8 참조 — net-new UX feature 로 회귀 fix 와 직교.)
- **후속 분리 (cross-validate 기각 7, 우선순위 deferred)** — Adaptive Reference Origin 패턴 전면 추상화. 4번째 tier(Galactic/Exoplanet 등) 실제 등장 시 도입(현재 YAGNI).
- 잠재 후속(범위 밖 시 분리): "개요로" 단축키 신설(현재 reset 재사용).

---

## 변경 이력

- 2026-06-18 (Provisional): forensic 측정 + 5옵션 비교 + 옵션 c 권장 박제. cross-validate 대기.
- 2026-06-18 (Accepted): cross-validate(agy outcome=applied) 4축 통합 — 이견 3/4/5/6 수용(Core 계약화 + 외/내행성 anchor 일관 + 스냅샷 생명주기 + NaN 가드), 기각 7/8(Adaptive Origin 전면추상 YAGNI / UX 연출 후속분리). 코어 라인 예측 12→16 상향.
