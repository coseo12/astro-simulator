# ADR: free-fly 패닝 (F3) — 우클릭 드래그 target 평면 이동 + floating origin 정합 (#629 §8 인계)

- **상태**: **Accepted** (cross-validate 2026-06-16 agy outcome=applied — §교차검증 반영 사항 본문 통합 완료. 3 고유 발견 반영: zero-division 가드 / 줌 중 감도 재산출 명시 / 패닝 축 평면 결정)
- **날짜**: 2026-06-16
- **결정자**: architect (#693 설계 단계, forensic runtime 측정 선행)
- **관련**:
  - [#693](https://github.com/coseo12/astro-simulator/issues/693) (본 이슈 — #629 §8 F3 인계, PM 합의 Q1~Q5)
  - [`20260607-629-freefly-camera-zoom-forensic.md`](20260607-629-freefly-camera-zoom-forensic.md) §3 / §8 (F3 기각 사유 = "floating origin 결합 위험" + `wheelDeltaPercentage` 비례 교훈 — 본 ADR 이 그 위험을 실측으로 해소)
  - [`20260608-631-freefly-tier-escalation-forensic.md`](20260608-631-freefly-tier-escalation-forensic.md) (`cameraFromSunMeters` + originOffset 가산 — 본 ADR 의 좌표계 SSoT)
  - [#509](https://github.com/coseo12/astro-simulator/issues/509) (free-fly 진입 설계 — tier/origin/시점 보존, focus 정책)
  - [`20260422-floating-origin.md`](20260422-floating-origin.md) (Floating Origin SSoT — originOffset 좌표계)
  - [`docs/glossary.md`](../glossary.md) — [free-fly](../glossary.md) / [Tier](../glossary.md) / [Floating Origin](../glossary.md) / [D-T2](../glossary.md) 정의
- **교훈 적용**:
  - **measurement-first** (volt [#32](https://github.com/coseo12/volt/issues/32)) — #629 §3 이 F3 를 "floating origin × panning 결합 위험" 으로 정적 기각. 본 ADR 이 runtime 실측으로 그 위험이 **이미 해소됨**(free-fly = originOffset 0 불변식)을 확정. 정적 추정에 의존해 방어 코드를 선반영했으면 불필요 복잡도.
  - "DoD PASS ≠ 제품 동작" (volt [#74](https://github.com/coseo12/volt/issues/74)) — 카메라 UX 는 자동 DoD(px/tier 수치)만으로 체감 검증 불가 → D-T2 실 Chrome 필수.
  - "headless 브라우저 검증 ≠ 실 브라우저" (volt [#77](https://github.com/coseo12/volt/issues/77)) — tier/target 수치 state 는 headless 신뢰 가능하나, 패닝 감도 체감은 사용자 D-T2 위임.
  - "신규 함수 ≠ 신규 구현" (volt [#21](https://github.com/coseo12/volt/issues/21)) — 패닝 좌표 보정은 신규 코드 0. 기존 `cameraFromSunMeters`(#631) + reset(target→origin) 이 이미 커버.

> **Forensic 변형 채택 근거 (5조건 중 4 충족 → 8섹션)**: ① 가설 N≥2 (좌표계 어긋남 가설 3종) ② Runtime 측정 필수 (`panningSensibility=0` 이라 정적 분석만으론 frame 정합 판정 불가) ③ 카메라 좌표계 (floating origin × ArcRotate target) ④ 5±2 옵션 비교 (focus 처리 A~C / 감도 모델). ⑤ Amendment 라운드 (cross-validate 후속) 예상.

---

## §1 배경

### 본 이슈 핵심

free-fly(focus 없는 자유 시점)에서 우클릭/중클릭 드래그로 카메라 `target` 을 평면 이동(패닝)하는 "진짜 자유 이동". 현재 `camera.panningSensibility = 0`(camera.ts:60, 의도적 비활성). #629 §8 F3 인계 — F3 기각 사유였던 "floating origin 결합 위험" 을 #631(tier escalation fix) 이 부분 해소했고, 본 ADR 이 패닝 경로의 좌표계 정합을 runtime 으로 확정한다.

### #629 §3 의 F3 정적 기각 (본 forensic 이 정정)

#629 §3 옵션 비교는 F3(패닝 활성화)를 두 사유로 기각했다: (1) 줌 정지(주 원인) 미해소 — 이는 #629 F1(`wheelDeltaPercentage`)이 별도 해결, (2) **floating origin × panning 결합 위험** — 패닝이 `camera.target` 자체를 옮기므로 #631 의 `cameraFromSunMeters` tier 좌표계와 재결합할 수 있다는 우려. 본 ADR §1 Forensic 측정이 (2)를 실측으로 정정한다.

### Forensic 측정 결과 (2026-06-16, develop tip `1d723a4`, 1280×720, headless)

`apps/web/scripts/_debug-693-pan-tmp.mjs`(volt #67 패턴, 실행 후 `rm`)로 실측. 패닝은 `panningSensibility=0` 이라 입력 시뮬 불가 → 패닝의 **효과**(=`camera.target` 평면 이동)를 setter 로 직접 모사 후 `getViewMatrix(true)` 로 `globalPosition` 재계산하여 좌표계 반응을 관찰. 데이터: [`docs/reports/693-freefly-panning-debug-output.json`](../reports/693-freefly-panning-debug-output.json) (raw).

dev 핸들: `window.__solarScene`(getTier/floatingOrigin) / `window.__simStore`(setSelectedBody/enterFreeFly). free-fly = UI 버튼과 동일 store 경로.

#### 측정 1 — free-fly 진입 후 패닝(target 평면 이동 = radius×0.3) 전/후 좌표계

| 시나리오 (free-fly 진입 경로) | tier (전→후) | **originOffset (전→후)** | target.x (전→후) | globalPos.x (전→후) | `globalPos 가 target 추적` |
| --- | --- | --- | --- | --- | --- |
| **A. free-fly 직접** | solar → solar | **[0,0,0] → [0,0,0]** | 0 → 10.5 | ~0 → **10.5** | ✅ (Δ=step) |
| **B. earth focus → free-fly** (inner) | inner → inner | **[0,0,0] → [0,0,0]** | -62.60 → -42.19 | -62.60 → **-42.19** | ✅ (Δ=step) |
| **C. io focus → free-fly** (body→#631 pull-back) | solar → solar | **[0,0,0] → [0,0,0]** | 0 → 10.5 | -0.57 → **9.93** | ✅ (Δ=step) |

#### 측정 핵심 (3 관찰)

- **관찰 1 — free-fly 의 originOffset 불변식 = [0,0,0]**: 세 진입 경로 모두 패닝 전·후 `originOffset = [0,0,0]`. inner/solar tier 는 ADR [20260422-floating-origin](20260422-floating-origin.md) §4 Q10 정책상 T1/T2 에서 origin 을 항상 [0,0,0] 유지. body tier(io)는 #631 의 `detachToFreeFly` 가 태양계 개요로 **pull-back**(`clearFocus` + `reset` → solar tier)하므로 free-fly 진입 시점에 이미 origin 이 0 으로 복원됨. **즉 패닝은 originOffset≠0 인 frame 에서 절대 발생하지 않는다.**
- **관찰 2 — `globalPosition` 이 `target` 을 정확히 추적**: ArcRotateCamera 는 `globalPosition = target + offset(alpha,beta,radius)` 이고 패닝은 offset(회전/줌) 불변 + target 평면 이동이므로, target 을 `step` 만큼 옮기면 globalPos 도 정확히 `step` 만큼 이동 (`globalFollowedTarget=true` 3/3, Δx 오차 < 1%). 따라서 #631 의 `cameraFromSunMeters = |globalPos|×metersPerSceneUnit + originOffset` 이 **패닝 후에도 자동으로 참 sun 거리**를 측정 (originOffset=0 가산은 no-op 이지만 코드 정합 유지).
- **관찰 3 — tier 판정 무결**: 작은 패닝(radius×0.3)은 tier 임계를 넘지 않아 tier 불변(A solar/B inner/C solar). 큰 패닝으로 sun 거리가 임계를 넘으면 기존 `tierFromCameraDistance(cameraFromSunMeters)` 경로가 globalPos 추적값으로 **정상 escalate/de-escalate** (#631 메커니즘 그대로 동작) — 패닝 전용 보정 코드 불필요.

### 가설 검증 결론

| 가설 | 결론 | 근거 |
| --- | --- | --- |
| **가설 1 (#629 §3): 패닝 target 이동이 #631 cameraFromSunMeters tier 좌표계와 어긋난다** | **기각 (핵심)** | 측정 1 관찰 2 — globalPos 가 target 을 정확 추적 → cameraFromSunMeters 가 패닝 후 참 sun 거리 자동 산출. 어긋남 0 |
| **가설 2: deep-tier(body) 패닝 시 originOffset≠0 으로 좌표가 focus body 기준이 되어 깨진다** | **기각** | 측정 1 관찰 1 — body tier 는 #631 pull-back 으로 free-fly 진입 시 origin=0. **패닝이 originOffset≠0 frame 에서 발생 불가** |
| **가설 3: 패닝 target 이동에 originOffset 가산을 별도 적용해야 한다** | **기각 (불필요)** | free-fly originOffset=0 불변식 → 기존 #631 가산식이 패닝에 그대로 정합 (가산값 0) |

---

## §2 영향 모듈/파일

### Fix 대상 (구현은 developer — 본 ADR 은 결정만)

- `packages/core/src/scene/camera.ts:60` — `panningSensibility = 0` → **radius 비례 동적 설정** (§결정 2 산출식). `ZOOM_DELTA_PERCENTAGE`(#629) 와 동일 SSoT 패턴으로 `PANNING_DELTA_PERCENTAGE` named const 도입.
  - **주의**: Babylon `panningSensibility` 는 정적 스칼라(값↑ = 둔감, 역수 감각)이고 `radius` 에 자동 비례하지 않는다. `wheelDeltaPercentage` 같은 "deltaPercentage" 패닝 옵션은 **존재하지 않음** → free-fly 진입 시점(또는 줌으로 radius 변동 시) `panningSensibility` 를 radius 기반으로 갱신해야 한다 (§결정 2). 단발 갱신 위치는 developer 판정 (진입 시 1회 vs onBeforeRender 매 프레임 — 후자는 줌 중 일관성↑, 전자는 비용 0).
- `packages/core/src/scene/camera.ts` — `panningInertia` 기존값 확인 (기본 0.9, 그대로 유지 권장 — 자연스러운 감속).

### focus 상태 처리 (§결정 3 = 옵션 A)

- 패닝은 **free-fly 에서만 활성**, focus 중 비활성. focus 중에는 `#followObserver`(camera-controller.ts:100)가 매 프레임 `camera.target` 을 focus mesh 로 덮어쓰므로 패닝 입력이 즉시 상쇄됨 → 패닝 활성화는 무의미하고 시각 jitter 유발. 따라서 focus ↔ free-fly 전환 시 `panningSensibility` 를 토글한다 (free-fly 진입 시 활성, focus 진입 시 0).

### 측정/가드 박제

- `docs/reports/693-freefly-panning-debug-output.json` — forensic raw 데이터 (본 ADR §1 측정 1 SSoT)
- `apps/web/scripts/browser-verify-693-freefly-panning.mjs` — 회귀 가드 (verify:693-freefly-panning, §결정 5)
- `.github/workflows/ci.yml` — detect-and-test 통합 (**port 3009** — 3008 glow marker 다음 미사용 포트)

### Fix 가 깨지 않는 영역 (실측/분석 확인)

- `#629` 줌(`wheelDeltaPercentage`) — 패닝은 target 이동, 줌은 radius 변동. 직교. 단 패닝 감도가 radius 기반이면 §결정 5 가드가 줌 후 패닝 일관성도 검사.
- `#631` tier escalation — 측정 1 관찰 3, 기존 `cameraFromSunMeters` 경로 그대로 동작.
- `#509` focus 정책 — §결정 3 옵션 A 가 focus 중 패닝 비활성으로 focus follow 무회귀.

---

## §3 옵션 비교

### 축 1 — focus 상태 처리 (Q2)

| 축 | **(A) focus 중 패닝 비활성, free-fly 만 활성 (채택)** | (B) focus 중 패닝 시 focus 해제 후 자유 이동 | (C) focus target 기준 패닝 (focus 유지) |
| --- | --- | --- | --- |
| `#followObserver` 충돌 | ✅ 없음 (focus 중 panningSensibility=0) | △ (해제 시점 race) | ❌ **충돌** (매 프레임 target 덮어씀 → jitter) |
| #509 focus 정책 정합 | ✅ "focus=고정 추적 / free-fly=자유" 명료 | △ (패닝 입력이 focus 를 암묵 해제 — 예측성↓) | ❌ (focus 의미 훼손) |
| 입력 모델 단순성 | ✅ free-fly 진입(Esc/버튼) → 패닝, 명시적 2단계 | ❌ (우클릭이 focus 해제 부수효과) | △ |
| 구현 복잡도 | 낮음 (sensibility 토글 1곳) | 중 (우클릭 핸들러 → enterFreeFly 트리거) | 높음 (follow vs pan 우선순위 조정) |

### 축 2 — 패닝 감도 모델 (Q4)

| 축 | **(가) radius 비례 동적 panningSensibility (채택)** | (나) 정적 panningSensibility (절대값) | (다) Babylon panningDistanceLimit |
| --- | --- | --- | --- |
| tier 무관 화면 px↔world 일정 | ✅ (radius 변하면 sensibility 재산출) | ❌ **#629 교훈 위반** (solar↔body radius 비대칭에서 깨짐) | ❌ (감도 아닌 범위 제한) |
| #629 `wheelDeltaPercentage` 일관성 | ✅ 동일 비례 철학 | ❌ | △ |
| 구현 비용 | 낮음 (radius→sensibility 1식) | 0 (그러나 부적합) | 낮음 (그러나 목적 불일치) |

### 결정

- **축 1 채택: (A) focus 중 패닝 비활성, free-fly 에서만 활성.** `#followObserver` 충돌 0, #509 focus 정책("focus=추적 고정 / free-fly=자유 탐색")과 가장 명료하게 정합. focus↔free-fly 전환 시 `panningSensibility` 토글.
  - (B) 기각: 우클릭이 focus 를 암묵 해제하면 사용자 예측성 저하 + 해제 시점 race. PM Q2 "또는 비활성" 선택지를 명시 채택 (focus 중 비활성).
  - (C) 기각: focus follow 와 패닝이 매 프레임 target 경쟁 → jitter, focus 의미 훼손.
- **축 2 채택: (가) radius 비례 동적 `panningSensibility`.** #629 의 `wheelDeltaPercentage` 비례 철학과 일관. 절대값(나)은 tier 별 renderScale 비대칭(solar r≈35 ↔ body r≈158386)에서 화면 px↔world 비율이 깨진다는 #629 교훈을 직접 위반 → 기각. (다)는 감도가 아닌 범위 제한이라 목적 불일치.
- **좌표 보정 코드: 없음.** §1 측정으로 free-fly originOffset=0 불변식 + globalPos 의 target 추적이 확정되어, #631 의 기존 `cameraFromSunMeters` 가산식이 패닝에 그대로 정합. 가설 1~3 전부 기각 → 신규 좌표 보정 0 (volt #21 "신규 함수 ≠ 신규 구현").

---

## §4 Concrete Prediction (사전 박제 → 구현 후 실측 대조)

| 예측 | 임계 | 실측 (developer 단계 기입) | 정합 |
| --- | --- | --- | --- |
| 예측 1 — 코어 변경 라인 수 (camera.ts panning 활성 + 토글) | **≤ 12 라인** (const + sensibility 산식 + free-fly/focus 토글) | (TBD) | (TBD) |
| 예측 2 — D-693-1 (free-fly 패닝 후 globalPos 가 target 추적) | Δ(globalPos.x − target.x) 패닝 전후 불변 | (TBD) | (TBD) |
| 예측 3 — D-693-2 (deep-tier(io) free-fly 패닝 시 originOffset=0 + tier 무결) | originOffset=[0,0,0] + tier 일관 | (TBD) | (TBD) |
| 예측 4 — D-693-3 (화면 px↔world 일정 비율 — solar vs inner tier 동일 px 드래그 시 world 이동량/radius 비율 일치) | tier 간 비율 편차 < 10% | (TBD) | (TBD) |
| 예측 5 — #629/#631/#509 무회귀 | 각 verify 가드 PASS | (TBD) | (TBD) |

> **Concrete Prediction 의도**: 좌표 보정 코드 0 (예측 1 ≤12 라인)이 "기존 추상화(#631 cameraFromSunMeters)가 패닝을 자연 흡수" 가설의 실측 증거. 12 라인 초과 시 좌표 보정이 필요했다는 신호 → §1 측정 재검토.

---

## §5 결정 (구현 가이드 + 회귀 가드 설계)

### 구현 가이드 (developer 인수인계)

1. `camera.ts` — `PANNING_DELTA_PERCENTAGE` const 도입 (`ZOOM_DELTA_PERCENTAGE` 인접 박제, D-T2 튜닝 SSoT). 초기값 권장 = `0.01`~`0.02` (틱당 화면 비율). **단 Babylon panningSensibility 는 비례 옵션이 없으므로** radius→sensibility 변환식 필요: `panningSensibility = referenceCanvasHeightPx / (max(radius, lowerRadiusLimit) × PANNING_DELTA_PERCENTAGE)` 형태로 "drag 1px = radius×k world 이동" 보장 (정확한 상수는 developer 가 Babylon panning 내부식 측정 후 결정 — measurement-first).
   - **zero-division 가드 (agy 고유 발견 반영)**: 분모 radius 가 0/NaN 이면 `panningSensibility` 가 Infinity/NaN 으로 발산 → 렌더링 먹통(DoS) 위험. `Math.max(radius, lowerRadiusLimit)` 로 하한 가드 **필수**. radius 는 `lowerRadiusLimit`(tier 별 양수, 기본 0.5)에서 clamp 되지만 산식 분모는 방어적으로 명시 하한 적용.
2. **줌 중 감도 재산출 (agy 고유 발견 반영)**: 갱신 위치는 **`onBeforeRender` 매 프레임 재산출** 채택 (free-fly 진입 1회 ❌). 사용자가 우클릭 패닝 유지 중 휠 줌하면 radius 가 변하므로 진입 시 1회 계산이면 줌 후 감도가 어긋나 "튀는" UX (§6 위험). 매 프레임 비용 = 산술 1식(무시 가능, 기존 `onBeforeRender` tier 판정에 병합 가능). 캡슐화: `camera.ts` 가 radius 변화를 감지해 자체 갱신 또는 sim-canvas `onBeforeRender` 에서 갱신 — developer 가 결합도 최소 경로 선택 (camera 내부 캡슐화 권장, agy 인터페이스 명확성 권고).
3. **패닝 축 평면 결정 (agy 고유 발견 반영)**: Babylon ArcRotateCamera 기본 패닝 = **스크린 평면(viewport XY) 기준** target 이동 (카메라 pitch 에 따라 우주 Z 깊이 동반 이동). 본 ADR 은 **스크린 평면 기준 채택** (직관적 "보이는 화면을 미는" 드래그 = 사용자 멘탈 모델 정합, free-fly 자유 탐색 목적). 황도면(horizontal) 고정 패닝은 비채택 — free-fly 는 임의 시점이라 황도면 강제 시 오히려 부자연. **D-T2 검증 항목**: 패닝 후 시점이 예측대로 이동하는지 육안 확인 (Z 깊이 왜곡 위화감 여부).
4. focus↔free-fly 토글: free-fly 진입(`detachToFreeFly` / 직접 free-fly) 시 `panningSensibility = 계산값`, focus 진입(`syncFocusToScene` body≠null) 시 `panningSensibility = 0`.
5. **우클릭 컨텍스트 메뉴 차단 주체 명시 (agy 권고)**: 우클릭 드래그 패닝 시 브라우저 contextmenu 팝업 차단 책임 = developer 가 Babylon `attachControl`/`useCtrlForPanning` 동작 실측 후 결정 (Babylon canvas 자체 preventDefault 의존 vs 명시 리스너). §6 위험 항목 참조.
6. **좌표 보정 코드 추가 금지** — §1 측정 결론. 기존 `cameraFromSunMeters`(#631) 그대로.

### 회귀 가드 — 3중 시뮬레이션 (guard-pr-dod, volt #96/#109)

`apps/web/scripts/browser-verify-693-freefly-panning.mjs` (CI `detect-and-test` port 3009):

| 시나리오 (직교) | DoD (PASS 조건) | 회귀 시 |
| --- | --- | --- |
| **S1. free-fly 패닝 작동** | free-fly 진입 후 패닝 입력 → target 평면 이동 + globalPos 추적 (Δ 일치) | panningSensibility=0 잔존 → target 불변 (FAIL) |
| **S2. focus 중 패닝 비활성 (#509)** | body focus 중 패닝 입력 → target 불변 (follow 유지) | focus 중 패닝 활성 → jitter/target 이탈 (FAIL) |
| **S3. deep-tier 패닝 floating origin 정합 (#631)** | io→free-fly(pull-back) 패닝 후 originOffset=[0,0,0] + tier 일관 | originOffset≠0 또는 tier 오판 (FAIL) |
| **S4. 줌 중 패닝 감도 일관성 (agy 고유 발견)** | free-fly 에서 줌(radius 변동) 후 동일 px 패닝 → world 이동량/radius 비율 일치 (진입 시점 잔존 감도 아님) | 진입 1회 감도 잔존 시 줌 후 비율 어긋남 (FAIL) |

3중 시뮬레이션: positive(패닝 활성 fix) PASS → negative(panningSensibility=0 환원) FAIL exit 1 → recovery(fix 복원) PASS. developer 가 가드 도입 PR DoD 4축(격리 동적 / 3중 시뮬 / N×5 self-consistency 는 본 가드 비대상 / 메타 측정) 적용.

### 무회귀 실측 (developer 단계)

- #629 줌 가드 (verify:629-freefly-zoom) PASS / #631 tier 가드 (verify:631-freefly-tier) PASS / #378 focus follow 26/26 PASS.
- core/web 단위 테스트 전체 PASS.

### Fix 후 박제 의무

- **#629 ADR §8 cross-link Amendment** — "F3 패닝 = #693 에서 floating origin 결합 위험 실측 기각 후 구현" 갱신.
- **#631 ADR §8 cross-link Amendment** — 동일.

---

## §6 위험 / 재검토 트리거

| 위험 | 회귀 시점 | 임계 | 완화 |
| --- | --- | --- | --- |
| 패닝 감도 체감 (radius 비례 상수) | fix 머지 직후 D-T2 | "너무 빠름/느림" | `PANNING_DELTA_PERCENTAGE` 단일 SSoT 튜닝 |
| 우클릭 ↔ 컨텍스트 메뉴 충돌 | 브라우저 우클릭 메뉴 | 패닝 중 메뉴 팝업 | Babylon 이 canvas contextmenu preventDefault — 기존 동작 확인 (developer) |
| 패닝으로 sun 거리 임계 초과 시 tier 전환 jank | 큰 패닝 | tier flicker | 측정 1 관찰 3 — 기존 히스테리시스(±15%) 흡수. D-T2 육안 |
| 모바일 2지 드래그 패닝 (`panningSensibility` 는 데스크톱/터치 공유) | iOS/Android | 핀치(줌)와 2지 패닝 제스처 충돌 | #219 iOS 실기기 측정 시 동반 확인. Q1 은 데스크톱 우클릭 한정 — 모바일 패닝은 후속 분리 후보 |

### 재검토 트리거

1. D-T2 "패닝 감도 부적절" → `PANNING_DELTA_PERCENTAGE` 튜닝.
2. 사용자가 focus 중에도 패닝 원함 → 축 1 옵션 (B) 재검토 (현 옵션 A 명시 기각).
3. 모바일 2지 패닝 수요 → 후속 이슈 (WASD 키보드 비목표와 동반).

---

## §교차검증 반영 사항 (cross-validate 2026-06-16 agy outcome=applied)

agy 가 본 ADR 을 "매우 정교한 실측(Forensic) 기반 설계, 완성도 높음" 으로 평가하며 measurement-first 가설 기각(originOffset=0 불변식) + 동적 radius 비례 감도 채택을 "이 프로젝트에 가장 적합한 필수적 선택" 으로 지지. 3 보완 반영 후 Accepted 권고. 4축 분류:

- **합의 (3)**: ① measurement-first 로 "floating origin 결합 위험"(#629 §3 정적 기각 사유)을 runtime 으로 기각해 불필요 보정 코드를 막은 결정 ② radius 비례 동적 감도(축 2-가) — 행성↔태양계 스케일 극차에 필수 ③ 데스크톱 한정 + 모바일/WASD 후속 분리로 오버엔지니어링 예방(§8).
- **고유 발견 수용 (3, 본 ADR 반영)**:
  - ① **zero-division 가드** — `panningSensibility` 분모 radius 가 0/NaN 이면 Infinity/NaN 발산 → 렌더링 먹통(DoS). `Math.max(radius, lowerRadiusLimit)` 하한 가드 필수 박제 (§결정 1). radius 는 lowerRadiusLimit clamp 로 0 미도달이나 산식 분모는 방어적 명시.
  - ② **줌 중 감도 재산출 명시** — Claude 원안은 "진입 시 1회 + (선택) 줌 후 재산출" 으로 모호. agy 지적대로 우클릭 패닝 유지 중 휠 줌 시 진입 감도가 잔존하면 "튀는" UX → **`onBeforeRender` 매 프레임 재산출 확정** (§결정 2) + 회귀 가드 S4 신설.
  - ③ **패닝 축 평면 결정** — Claude 원안에 패닝 이동 평면(스크린 vs 황도면) 미명시. agy 가 pitch 종속 Z 깊이 왜곡 가능성 지적 → **스크린 평면 기준 채택** 명시(자유 탐색 멘탈 모델 정합) + D-T2 육안 검증 항목 박제 (§결정 3).
- **Claude 재분석으로 수용 보강 (1)**: **우클릭 컨텍스트 메뉴 차단 주체** — Claude 원안 §6 에 위험으로만 언급. agy "처리 주체 명시 필요" 권고 수용해 §결정 5 로 developer 인수인계에 명시 (Babylon canvas preventDefault 실측 후 결정).
- **Claude 재분석으로 후속 분리 (1)**: **감도 공식 헬퍼 모듈화** — agy 가 "모바일/WASD 에 재사용 가능하니 유틸 분리" 권고. 현재 데스크톱 패닝 단일 사용처라 YAGNI (volt #21 정신과 반대 방향 — 추상화 선반영). 모바일 2지 패닝/WASD 후속 이슈(§8)에서 2번째 사용처 등장 시 분리 검토. **본 PR 비목표** (Q1 데스크톱 우클릭 한정).
- **Claude 편향 셀프 체크 (cross-validate 호출 전 통과)**:
  - **낙관적 일정**: 코어 ≤12 라인 예측 — §1 측정으로 좌표 보정 0 확정 후라 근거 있음. 단 zero-division 가드 + 매 프레임 재산출 반영으로 예측 1 상향 가능성 → §4 예측 1 임계 ≤12 유지하되 developer 실측 시 초과면 §1 재검토 (가드/재산출 라인이 보정 코드는 아님).
  - **결합 간과**: floating origin × panning 결합 §1 실측 통과. **줌 × 패닝 결합**은 agy 지적 수용해 S4 가드 + §결정 2 매 프레임 재산출로 해소.
  - **폐기 프레이밍**: #629 F3 기각을 "복원" 아닌 "실측 재평가" 프레이밍 — 통과.
  - **순수주의**: 옵션 A(focus 중 비활성) 과대 제약 우려 → §6 재검토 트리거 2 박제. 통과.

## §7 Amendment 라운드 N

(현재 없음 — cross-validate / D-T2 / developer 측정 후속 시 추가)

---

## §8 후속 / 분리 이슈

- **WASD 키보드 free-fly 이동** — PM Q1 비목표. 패닝(드래그)과 별개 입력 채널. 수요 확인 후 후속.
- **모바일 2지 드래그 패닝** — Q1 데스크톱 우클릭 한정. 핀치(줌) 제스처 충돌 검토 필요 → #219 iOS 실기기 측정 동반 후속.

---

## 변경 이력

- 2026-06-16: 초안 (architect, #693 설계). Provisional — free-fly 패닝의 floating origin 결합 위험(#629 §3 정적 기각 사유)을 runtime 실측으로 기각(free-fly originOffset=0 불변식 + globalPos 의 target 추적). focus 처리 옵션 A(free-fly 만 활성) + 감도 radius 비례 동적 panningSensibility 채택 + 좌표 보정 코드 0 + 3중 시뮬레이션 가드 설계.
- 2026-06-16: **Accepted 전이** (cross-validate agy outcome=applied). 3 고유 발견 반영: ① zero-division 가드(radius 하한) ② 줌 중 감도 `onBeforeRender` 매 프레임 재산출 확정 + S4 가드 신설 ③ 패닝 축 = 스크린 평면 기준 결정 + D-T2 검증. 컨텍스트 메뉴 차단 주체 §결정 5 명시. 감도 헬퍼 모듈화는 후속 분리(YAGNI).
