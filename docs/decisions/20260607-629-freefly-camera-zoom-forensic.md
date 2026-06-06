# ADR: free-fly 진입 시 줌 "고정" 회귀 — 절대 wheelPrecision 이 tier=body(renderScale 거대화)에서 줌 정지 (R6 #621 D-T2 표면화, R5 잠복)

- **상태**: **Accepted** (cross-validate 2026-06-07 agy outcome=applied — §교차검증 반영 사항 본문 통합 완료. 옵션 F1 채택 + fix 구현 + 3중 시뮬레이션 + 상수화)
- **날짜**: 2026-06-07
- **결정자**: developer (#629 fix 단계, forensic 실측 선행)
- **관련**:
  - [#629](https://github.com/coseo12/astro-simulator/issues/629) (본 이슈 — R6 D-T2 발견, R5 잠복)
  - [`20260606-627-satellite-orbit-structure-forensic.md`](20260606-627-satellite-orbit-structure-forensic.md) §8 (본 회귀 분리 출발점 — **정적 가설 "lowerRadiusLimit 미원복" 을 본 forensic 이 실측으로 정정**)
  - [`20260509-380-zoom-camera-freeze-forensic.md`](20260509-380-zoom-camera-freeze-forensic.md) (camera lowerRadiusLimit / tier 별 renderScale 비대칭 SSoT — 본 회귀의 scale 비대칭 근거)
  - [#509](https://github.com/coseo12/astro-simulator/issues/509) (free-fly 진입 설계 — tier/origin/시점 보존 의도)
  - [`docs/glossary.md`](../glossary.md) — [free-fly](../glossary.md) / [Tier](../glossary.md) / [D-T2](../glossary.md) 정의
- **교훈 적용**:
  - "수치 DoD 미달 시 측정 방법 검증 우선" / **measurement-first** (volt [#32](https://github.com/coseo12/volt/issues/32)) — #627 ADR §8 정적 가설(lowerRadiusLimit 극소 잔존)을 실측이 정정. 식부터 고쳤으면 오진 손실.
  - "DoD PASS ≠ 제품 동작" (volt [#74](https://github.com/coseo12/volt/issues/74)) — 자동 DoD(px 비율/a11y/fps)는 줌 응답성을 검증하지 않아 잠복.
  - "headless 브라우저 검증 ≠ 실 브라우저" (volt [#77](https://github.com/coseo12/volt/issues/77)) — 본 줌 응답은 수치 state 측정이라 headless 신뢰 가능하나, 최종 D-T2 육안은 사용자 위임.

---

## §1 배경

### 본 이슈 핵심

R6 PR [#627](https://github.com/coseo12/astro-simulator/pull/627) 실 Chrome D-T2 에서 사용자 보고: **"탐색(free-fly) 버튼 사용 시 자유롭게 시점이동이 안되고 고정되서 오히려 불편"**.

- **회귀 발화점**: R6 galilean(io/europa/ganymede/callisto) focus 후 free-fly. 단 **R6 무관** — `git diff origin/develop HEAD -- camera-controller.ts sim-canvas.tsx camera.ts` = 0 라인. develop(R5)에서도 동일 재현 → **선행 잠복 결함**.
- **영향 범위**: tier=body 로 진입하는 모든 body(위성 + 근접 행성) focus → free-fly. 위성(galilean)이 대표 케이스.

### #627 ADR §8 정적 가설 (본 forensic 이 정정)

#627 ADR §8 은 정적 분석으로 추정: `focusOn`(camera-controller.ts:150-152)이 satellite focus 시 `lowerRadiusLimit` 을 `desiredRadius × 0.5`(극소)로 완화하나 free-fly 진입 시 원복 안 함 → 좁은 줌 한계 잔존이 "고정" 원인. **본 forensic 이 이 가설을 기각** (lowerRadiusLimit 실측 = 467, 극소 아님).

### Forensic 측정 결과 (2026-06-07, develop tip `7695a03`, 1280×720, headless)

`apps/web/scripts/_debug-629-freefly-tmp.mjs`(volt #67 패턴, 실행 후 `rm`)로 실측. 데이터: [`docs/reports/629-freefly-camera-zoom-debug-output.json`](../reports/629-freefly-camera-zoom-debug-output.json) (raw).

dev 핸들: `window.__solarScene`(getTier/meshes) / `window.__simStore`(setSelectedBody/enterFreeFly). focus = UI 버튼과 동일 store 경로.

#### 측정 1 — free-fly 진입 후 카메라 state (3 시나리오)

| 시나리오                             | tier     | radius     | lowerRadiusLimit | targetDistToOrigin               |
| ------------------------------------ | -------- | ---------- | ---------------- | -------------------------------- |
| A. free-fly 직접 (baseline)          | solar    | 35         | 0.5              | 0                                |
| B. jupiter(행성) focus → free-fly    | solar    | 2.5        | 0.025            | 1144                             |
| **C. io(galilean) focus → free-fly** | **body** | **158386** | **467**          | **8413 (io 위치, 공전 이동 중)** |

#### 측정 2 — 입력별 응답 (5틱 누적 상대 변화율)

| 시나리오            | 회전 (Δα) | **줌 (틱당 상대변화)** | 줌 체감            |
| ------------------- | --------- | ---------------------- | ------------------ |
| A. baseline         | ✅ 1.12   | 큼                     | ✅                 |
| B. jupiter          | ✅ 1.17   | 큼                     | ✅                 |
| **C. io(galilean)** | ✅ 1.12   | **0.03% / 0.03%**      | ❌ **사실상 정지** |

- **관찰 1**: 위성 focus 는 tier=body 로 진입하고 free-fly 후에도 잔존. body tier 의 renderScale 은 거대화(io mesh radius ≈ 31677 scene unit → focus radius = ×5 ≈ 158386).
- **관찰 2**: Babylon ArcRotateCamera 의 `wheelPrecision = 3` 은 **절대 줌 델타**(틱당 ~수십 unit). radius 158386 대비 변화율 **0.03%** → 줌이 체감상 완전히 멈춤.
- **관찰 3**: 회전(alpha/beta)은 정상. 패닝은 설계상 비활성(`panningSensibility = 0`, camera.ts:40). target 은 io 의 동결 위치(공전으로 이미 이동)라 먼 빈 점만 공전.
- **결론**: 사용자 "고정" = **줌 응답 정지(주 원인) + 먼 빈 점 공전(부 원인) + 패닝 부재**. lowerRadiusLimit(467)은 줌 한계 467~1e14 로 충분히 넓어 **원인 아님** (#627 §8 가설 기각).

### 가설 검증 결론

| 가설                                                                  | 결론                    | 근거                                                                                                                                                                                      |
| --------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **가설 1 (#627 §8): satellite focus 의 극소 lowerRadiusLimit 미원복** | **기각**                | 측정 1 (C 의 lowerRadiusLimit = 467, 극소 아님). camera-controller.ts:150 의 완화 분기는 `desiredRadius < lowerRadiusLimit` 조건인데 body tier 의 desiredRadius(158386)는 미충족 → 미발동 |
| **가설 2: 절대 wheelPrecision 이 tier=body 거대 radius 에서 줌 정지** | **확정 (주 원인)**      | 측정 2 (C 줌 rel 0.03% vs A/B 체감). 절대 델타 ÷ 거대 radius = 무시 가능 변화율                                                                                                           |
| **가설 3: 회전도 고정**                                               | **기각**                | 측정 2 (C 회전 Δα 1.12, 정상)                                                                                                                                                             |
| **가설 4: target 이 먼 동결점이라 공전만 가능**                       | **부분 확정 (부 원인)** | 측정 1 (C targetDist 8413, io 공전 이동). 줌 복구 시 줌아웃으로 탈출 가능하므로 2차                                                                                                       |

---

## §2 영향 모듈/파일

### Fix 대상

- `packages/core/src/scene/camera.ts:38-39` — 절대 `wheelPrecision`/`pinchPrecision` → `wheelDeltaPercentage`/`pinchDeltaPercentage` (radius 비례).

### 측정/가드 박제

- `docs/reports/629-freefly-camera-zoom-debug-output.json` — forensic raw 데이터
- `apps/web/scripts/browser-verify-629-freefly-zoom.mjs` — 회귀 가드 (verify:629-freefly-zoom)
- `.github/workflows/ci.yml` — detect-and-test 통합 (port 3006)

### Fix 가 깨지 않는 영역 (검증됨)

- `#380` 줌 freeze 가드 — tier 전환은 프로그램적 radius 애니메이션이라 wheel 감도와 직교. develop baseline 과 동일 결과 (§4 예측 3).

---

## §3 옵션 비교

| 축                      | **(F1) wheelDeltaPercentage**  | (F2) free-fly 진입 시 카메라 정규화   | (F3) 패닝 활성화                   |
| ----------------------- | ------------------------------ | ------------------------------------- | ---------------------------------- |
| 측정 근본(줌 정지) 해소 | ✅ 직접 (모든 scale 일정 %)    | △ (tier 복원으로 간접)                | ❌ (줌 정지 잔존)                  |
| #509 시점 보존 의도     | ✅ 유지 (진입 로직 무변경)     | ❌ **충돌** (tier/radius/target 변경) | ✅ 유지                            |
| 변경 범위               | 2 라인 (전역 카메라 설정)      | 다 (detachToFreeFly + tier 전환)      | 1 라인 + floating origin 결합 검토 |
| 부수 회귀 위험          | low (#380 직교 검증됨)         | 중 (#509 회귀)                        | 중 (floating origin × panning)     |
| mobile(pinch) 동시 해소 | ✅ (pinchDeltaPercentage 동반) | ❌                                    | ❌                                 |

### 결정

- **채택: (F1) `wheelDeltaPercentage`/`pinchDeltaPercentage` = 0.01.** 측정된 근본 원인(절대 델타 ÷ 거대 radius)을 직접 해소하고, #509 시점 보존을 유지하며, 위험이 가장 낮다. pinch 동시 적용으로 모바일 동일 잠복(절대 pinchPrecision) 선제 차단.
- **F2 기각**: #509 "시점 보존" 의도와 충돌.
- **F3 기각**: 줌 정지(주 원인) 미해소 + floating origin 결합 위험. 단 "진짜 자유 이동(패닝)" UX 는 별도 가치 → §8 후속 분리 후보.

---

## §4 Concrete Prediction (사전 박제 → 실측 대조)

| 예측                                               | 임계                          | 실측                                    | 정합 |
| -------------------------------------------------- | ----------------------------- | --------------------------------------- | ---- |
| 예측 1 — 코드 변경 라인 수                         | 카메라 설정 2~3 라인          | 2 라인 (wheel/pinch)                    | ✅   |
| 예측 2 — D-629-1 (C 위성 free-fly 줌 5틱 누적 rel) | ≥ 0.5%(체감)                  | **38.85% / 55.30%** (fix 전 0.03%)      | ✅   |
| 예측 3 — #380 무회귀                               | develop 과 동일 S1/S3/S4 PASS | 동일 (S2 는 develop 도 기존 FAIL, 후술) | ✅   |
| 예측 4 — baseline(A) 줌 체감 유지 (#509)           | 체감 유지                     | rel 큼, PASS                            | ✅   |

---

## §5 결정 (구현 완료)

채택 옵션 = **F1**. 구현:

```ts
// camera.ts — 절대 precision 제거, radius 비례 % 적용
camera.wheelDeltaPercentage = 0.01;
camera.pinchDeltaPercentage = 0.01;
```

### 회귀 가드 — 3중 시뮬레이션 (guard-pr-dod, volt #96/#109)

| 단계                | 상태              | S2(io free-fly) 줌 rel | overall |
| ------------------- | ----------------- | ---------------------- | ------- |
| Positive (fix 적용) | PASS              | 38.85% / 55.30%        | PASS    |
| Negative (fix 환원) | **FAIL** (exit 1) | **0.03% / 0.03%**      | FAIL    |
| Recovery (fix 복원) | PASS              | 38.85% / 55.30%        | PASS    |

가드: `browser-verify-629-freefly-zoom.mjs` — 2축 (S1 baseline 줌 체감 / S2 io focus→free-fly 줌 5틱 누적 rel ≥ 1% + 회전 작동). CI `detect-and-test` 통합 (port 3006).

### #380 무회귀 실측

develop baseline #380 = `S1 PASS / S2 FAIL / S3 PASS / S4 PASS`. fix 적용 후 **동일**. #380 S2 는 50ms race window 측정의 **기존 headless 타이밍 flaky** (signs=[1,-1], develop 3회 일관 FAIL)이며 **CI 미포함** — 본 fix 무관.

### Fix 후 박제 의무

- **#627 ADR §8 cross-link Amendment** — "lowerRadiusLimit 미원복 가설은 #629 forensic 에서 기각, 실제 원인은 절대 wheelPrecision" 정정 박제.

---

## §6 위험 / 재검토 트리거

| 위험                       | 회귀 시점     | 임계                         | 완화                                                     |
| -------------------------- | ------------- | ---------------------------- | -------------------------------------------------------- |
| 줌 감도 체감 변화 (전역 %) | fix 머지 직후 | 사용자 D-T2 "너무 빠름/느림" | `0.01`(틱당 ~1%) 조정 가능. D-T2 피드백 시 튜닝          |
| pinch 모바일 미검증        | iOS/Android   | 실기기 pinch 줌 응답         | 동일 메커니즘(% 비례). #219 iOS 실기기 측정 시 동반 확인 |
| 신규 tier 추가 시 재발     | R7+           | 절대 precision 부활          | 본 가드(S2)가 deep tier 줌 자동 검사                     |

### 재검토 트리거

1. 사용자 D-T2 "줌 감도 부적절" → `wheelDeltaPercentage` 값 튜닝.
2. free-fly 후 "먼 점 공전" 잔존 불편(부 원인) → §8 F3(패닝) 또는 target 정규화 후속.

---

## §교차검증 반영 사항 (cross-validate 2026-06-07 agy outcome=applied)

agy 가 F1(반지름 비례 줌) 결정을 "거대 척도 시뮬레이션에 매우 타당" 으로 지지. 4축 분류:

- **합의 (2)**: ① forensic 흐름(실측 → 가설 1 기각 → 원인 규명 → 옵션 비교 → 가드)의 정밀성 ② radius 비례 줌이 deep tier 확장(성간/은하 신규 tier)에도 재조정 불필요 — 확장성 우수.
- **고유 발견 수용 (2, 본 PR 반영)**:
  - ① **입력 채널 다각도 (키보드/트랙패드 줌)** — `grep` 전수 확인 결과 커스텀 줌 입력 채널 **없음** (focus-quick-buttons 키보드 핸들러는 Escape→free-fly 로 줌 무관, 트랙패드 2지 스크롤은 wheel 이벤트로 `wheelDeltaPercentage` 가 흡수). wheel + pinch 가 전 줌 경로 → fix 가 완전 커버. (실측 해소)
  - ② **상수화** — `0.01` 리터럴을 `ZOOM_DELTA_PERCENTAGE` named const 로 승격 (프로젝트 매직넘버 상수화 원칙). 휠/핀치 단일 SSoT + D-T2 튜닝 지점 명확화.
- **반려/과대 대응 필터 (2)**:
  - ① **NaN/zero-division 방어** — radius=0 시 우려. 그러나 `lowerRadiusLimit`(tier 별 양수, 기본 0.5)이 radius 를 0 에 도달하지 못하게 보장하며 Babylon 내부가 비례 델타를 처리 → 추가 방어 코드 불필요 (기존 가드 충족, 과대 대응).
  - ② **clamping 부드러운 감속** — Babylon ArcRotateCamera 가 lower/upperRadiusLimit 에서 자동 clamp + inertia 처리 → 별도 구현 불필요.
- **고유 발견 후속 분리 (1)**: **OS/디바이스 감도 편차 + 사용자 줌 감도 설정 옵션** — `wheelDeltaPercentage` 가 deltaY 정규화로 OS 편차를 1차 흡수하나, 사용자 노출 줌 감도 설정은 현 PR 비목표(회귀 fix)와 직교 → §6 재검토 트리거에 박제(별도 이슈 생성은 수요 확인 후, 과한 이슈 자제). **부 원인(먼 빈 점 target 재설정)** 은 §8 후속 유지(#509 시점 보존 의도와 충돌 검토 필요).
- **Claude 편향 셀프 체크**: F1 의 전역 줌 감도 변화가 baseline(solar tier)에서 "과민" 일 수 있다는 우려 — 측정 2 (baseline rel 큼, 기존 develop 도 동일 빠른 줌) 로 회귀 아님 확인. 단 D-T2 사용자 육안에서 감도 피드백 시 `ZOOM_DELTA_PERCENTAGE` 튜닝 (§6).

## §7 Amendment 라운드 N

(현재 없음 — D-T2 사용자 피드백 또는 후속 발견 시 추가)

---

## §8 후속 / 분리 이슈

- **free-fly 패닝/탐색 UX (F3)** — 본 fix 는 줌 정지(주 원인)를 해소하나, target 이 동결점에 고정되어 "공전만 가능"한 부 원인은 남는다. "진짜 자유 이동(WASD/패닝)" 은 별도 가치 → 사용자 수요 확인 후 분리 검토 (floating origin 결합 설계 필요).
- **#627 ADR §8** — 본 forensic 이 §8 정적 가설을 정정. #627 ADR 에 cross-link 박제.

---

## 변경 이력

- 2026-06-07: 초안 (developer, #629 fix). Provisional — 절대 wheelPrecision 이 tier=body 거대 radius 에서 줌 정지(주 원인) 실측 확정 + #627 §8 lowerRadiusLimit 가설 기각 + 옵션 F1/F2/F3 비교 + 3중 시뮬레이션. cross-validate 후 Accepted 전이 예정.
