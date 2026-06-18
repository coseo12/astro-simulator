# ADR: free-fly 카메라 감도 설정 UI — 4축 계수 정적 const → 런타임 가변 + localStorage 영속

- **상태**: **Accepted** (cross-validate 2026-06-18 agy outcome=applied — §교차검증 반영 사항 4축 분류 통합 완료. Provisional → Accepted 전이)
- **날짜**: 2026-06-18
- **결정자**: architect (#704 설계 단계 — 구현 직전 결정 박제)
- **변형**: **일반 ADR** (forensic 5조건 미달 — 측정보다 설계 결정 위주. 가설 비교 N≥2 ① 충족하나 runtime 측정 필수 ②·DoD PASS 회귀 ③·5±2 옵션 ④는 미충족)
- **관련**:
  - [#704](https://github.com/coseo12/astro-simulator/issues/704) (본 이슈 — PM 합의 2026-06-18, 4축 슬라이더 + localStorage + 기본값 복원)
  - 계승: [`20260617-699-freefly-camera-unified-redesign.md`](20260617-699-freefly-camera-unified-redesign.md) §8 (감도 설정 UI 후속 분리 — "1차 named const SSoT, 가변화는 설정 UI 도입 시 `CameraController` 옵션/simStore 바인딩") + §교차검증 고유 발견 1 (계수 동적 설정 인터페이스)
  - 계승: [`20260607-629-freefly-camera-zoom-forensic.md`](20260607-629-freefly-camera-zoom-forensic.md) §6 (설정 UI 박제) / [`20260616-693-freefly-panning.md`](20260616-693-freefly-panning.md) (패닝 `computePanningSensibility` 재산출 SSoT)
  - UI 패턴 선례: `apps/web/src/components/layout/scale-control.tsx` (Radix Slider 양방향 sync + isDraggingRef 무한루프 가드), `about-modal.tsx` (모달 + Esc 닫기), `physics-engine-toggle.tsx`
  - [`docs/glossary.md`](../glossary.md) — [free-fly](../glossary.md) / [Tier](../glossary.md) / [D-T2](../glossary.md) / [Floating Origin](../glossary.md)
- **교훈 적용**:
  - **신규 데이터 ≠ 신규 코드** (volt [#47](https://github.com/coseo12/volt/issues/47)) — 본 ADR §결과 Concrete Prediction 에서 "계수 1개 추가 시 store 1필드 + 슬라이더 1개" 추상화를 사전 예측 + 구현 후 `git diff --stat` 대조.
  - **신규 함수 ≠ 신규 구현** (volt [#21](https://github.com/coseo12/volt/issues/21)) — `computePanningSensibility` / `attachWasdControl` / `wheelDeltaPercentage` 기존 주입 경로를 재구성할 뿐, 새 산식 도입 0.
  - **DoD PASS ≠ 제품 동작** (volt [#74](https://github.com/coseo12/volt/issues/74)) — 슬라이더 즉시 반영은 자동 단위 테스트로는 "store 갱신" 까지만 보장. 실 카메라 거동 변화는 D-T2 실 Chrome 검증 필수.
  - **가드 설계 measurement-first / fail-fast** — localStorage 폴백은 silent default 흡수가 아니라 명시 로깅 + 스키마 버전 가드. drift 가드 fail-fast.

---

## 배경

free-fly 카메라 감도 4축 계수가 #699 까지 named const "D-T2 튜닝 지점" 으로 박제됐다 — 코드 수정 + 재배포 없이는 사용자가 조정할 수 없다. #699 ADR §8 + #629 §6 + #699 cross-validate 고유 발견 1 이 모두 "설정 UI 도입 시 가변화" 를 후속으로 분리했고, PM 이 2026-06-18 수요를 확인해 본 이슈로 착수한다.

4축의 **현재 위치 + 주입 경로가 서로 다르다** — 이것이 본 ADR 의 핵심 설계 난점이다:

| 계수           | 현재 기본값                       | 현재 위치        | 런타임 주입 경로 (정적 const 가 쓰이는 지점)                                                                                    |
| -------------- | --------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| WASD 이동 속도 | `WASD_DELTA_PERCENTAGE = 0.015`   | `camera.ts`      | `attachWasdControl` 내부 `onBeforeRender` 의 `camera.radius * WASD_DELTA_PERCENTAGE` **산식 상수** + `MAX_MOVE_STEP = 10` clamp |
| 줌아웃 배율    | `FREE_FLY_ZOOMOUT_FACTOR = 5`     | `sim-canvas.tsx` | free-fly 진입 시 `camera.upperRadiusLimit = camera.radius * FACTOR` **1회 산정**                                                |
| 패닝 감도      | `PANNING_DELTA_PERCENTAGE = 0.01` | `camera.ts`      | `computePanningSensibility(camera)` 가 `radius × pct` 로 `panningSensibility` **매 프레임 재산출** (`onBeforeRender`)           |
| 줌 감도        | `ZOOM_DELTA_PERCENTAGE = 0.01`    | `camera.ts`      | `setupArcRotateCamera` 초기화 시 `camera.wheelDeltaPercentage` / `pinchDeltaPercentage` **속성 직접 set**                       |

주입 경로가 (A) 매 프레임 산식 상수 / (B) 진입 시 1회 산정 / (C) 매 프레임 재산출 함수 / (D) 카메라 속성 직접 set 으로 **4종 모두 다르다**. 단일 "값 주입" 추상화로는 4축을 일관 처리할 수 없으며, 어느 계층에 동적 상태를 두느냐(camera.ts 정적 export ↔ sim-canvas wiring ↔ store)가 결정의 본질이다.

제약:

- **named const 는 default SSoT 로 유지** — store 초기값 = const. #699 cross-validate 교훈(방어 로직 우선, 압축 강제 금지)에 따라 const 를 제거하고 store 로 일원화하지 않는다.
- **localStorage 영속 선례 없음** — store 에 직접 구현. `dismissedNoticeKeys` 도 "영속화는 후속 분리" 로 미구현 상태(sim-store.ts:67). zustand persist 미들웨어 미사용(의존 최소 — PM 합의).
- **무회귀 경계** — 감도 변경이 focus/reset 거동에 영향 0. free-fly 한정. verify:699 S1~S6 + verify:693 무회귀.

---

## 후보 비교

### 축 1 — 계수 동적 주입 아키텍처 (정적 const → 런타임 가변)

| 후보                                            | 설명                                                                                                                                                                                                                                                                           | 장점                                                                                                              | 단점                                                                                                                                                      | 비고                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **A — 경로별 최소 침습 (선택)**                 | 각 축의 기존 주입 지점만 동적화: `attachWasdControl` 에 `getCoefficients` getter 주입(매 프레임 최신 읽기) → WASD; `setPanningEnabled` 의 `computePanningSensibility` 에 pct 인자 → 패닝; `camera.wheelDeltaPercentage` 직접 set → 줌; `upperRadiusLimit` 재산정 헬퍼 → 줌아웃 | 4축 각 경로 특성 보존(프레임/속성/1회 산정 차이 그대로) / 기존 산식 0 변경 / camera.ts 가 default const SSoT 유지 | 주입 지점 4곳 산재 → 동적화 wiring 이 sim-canvas 에 분산                                                                                                  | **#699 §8 "CameraController 옵션/simStore 바인딩" 정합. 신규 산식 0** |
| B — CameraController 단일 SSoT 객체             | `CameraController`(camera-controller.ts)에 `sensitivity` 상태 객체 통합 + 4축 일괄 적용 메서드                                                                                                                                                                                 | 단일 진입점 / 미래 프리셋 확장 용이                                                                               | 줌(camera 속성)/줌아웃(upperRadiusLimit)/패닝(매 프레임)/WASD(산식)가 controller 책임 밖 → controller 가 sim-canvas wiring 영역까지 흡수해야 함(SRP 침범) | 4축 라이프사이클 비대칭이라 단일 객체로 흡수 시 leaky                 |
| C — sim-canvas store 구독 후 4축 매 변경 재적용 | camera.ts 는 default 만 export, 값은 sim-canvas 가 store 구독해 매 변경 시 4축 재적용. WASD 도 외부 주입                                                                                                                                                                       | 동적화 wiring 1곳 집중                                                                                            | WASD 는 매 프레임 읽어야 하는데(키 hold 중 변경 즉시 반영) store 구독 push 모델과 pull(매 프레임) 모델 충돌 → WASD 만 getter 필요 → A 로 수렴             | A 의 부분집합. WASD 특성이 순수 push 를 깸                            |

**축 1 결정 = A (경로별 최소 침습)**. 근거: 4축 주입 라이프사이클(프레임 산식 / 1회 산정 / 매 프레임 재산출 / 속성 set)이 본질적으로 비대칭이라, 단일 SSoT 객체(B)나 순수 push 구독(C)은 어느 한 축에서 leaky abstraction 을 만든다. WASD 가 "키 hold 중 슬라이더 변경 즉시 반영" 을 요구하므로 `attachWasdControl` 은 값 스냅샷이 아닌 **getter 주입**(매 프레임 최신 읽기)이 필수다 — 이 한 축이 B/C 를 모두 A 로 수렴시킨다.

### 축 2 — store 스키마 + setter 입도

| 후보                                        | 설명                                                                                                                                                            | 장점                                                                                                | 단점                                                                                  |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **A — 단일 중첩 객체 + 개별 setter (선택)** | `freeFlySensitivity: { wasd, zoomoutFactor, panning, zoom }` + `setFreeFlySensitivity(axis, value)` (개별 축) + `resetFreeFlySensitivity()` (일괄 default 복원) | 슬라이더 1개 = setter 1호출(부분 갱신 자연) / localStorage 직렬화 단위가 객체 1개 / 복원 = 1 action | 중첩 객체 immutable spread 필요                                                       |
| B — 4 평면 필드 + 4 setter                  | `freeFlyWasd` / `freeFlyZoomout` / ... 각 setter                                                                                                                | spread 불필요                                                                                       | 4축이 의미적으로 1 그룹인데 평면화 → 직렬화/복원이 4필드 수동 나열(추가 시 누락 위험) |

**축 2 결정 = A**. `setFreeFlySensitivity(axis, value)` 개별 + `resetFreeFlySensitivity()` 일괄. 객체 단위가 localStorage 직렬화/복원/Concrete Prediction(계수 추가 = 객체 1키 + 슬라이더 1개)과 정합.

### 축 3 — localStorage 영속 (무패키지)

| 후보                                                     | 설명                                                                                                                                                                                            | 장점                                                                                      | 단점                                                                                                                        |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **A — store 내부 직접 구현 + 스키마 버전 + 폴백 (선택)** | store 생성 시 `loadPersisted()` (window 가드 + JSON.parse try/catch + 스키마 버전 + 범위 clamp → 실패 시 default) / setter 마다 `savePersisted()` (debounce 불요 — 슬라이더 commit 시점 저빈도) | 의존 0 / SSR(Next.js) window 부재 가드 명시 / 손상값·구버전·범위 이탈 fail-fast → default | 직렬화/역직렬화 boilerplate 직접 작성                                                                                       |
| B — zustand persist 미들웨어                             | `persist(store, { name })`                                                                                                                                                                      | boilerplate 0                                                                             | 신규 의존(미들웨어) / PM 비목표 / partialize·merge·version migrate 커스텀 시 결국 A 수준 코드 / SSR hydration mismatch 함정 |

**축 3 결정 = A**. PM 합의 "별도 패키지 없이 직접 구현, zustand persist 미사용". 핵심 방어 3종(fail-fast, silent 흡수 금지): **(1) SSR 가드** `typeof window === 'undefined'` → default 반환(Next.js 서버 렌더 시 localStorage 부재). **(2) 스키마 버전** `SENSITIVITY_SCHEMA_VERSION` 불일치 → default(구버전 폴백). **(3) 범위·타입 가드** 각 축 파싱값이 `Number.isFinite` + min/max 범위 내가 아니면 해당 축만 default 로 clamp(손상값 흡수가 아니라 명시 정정 — 가드 fail-fast 원칙, silent 흡수는 drift 생성원). 저장 시점 = setter 호출 시 즉시(슬라이더 `onValueCommit` 저빈도라 debounce 불요).

### 축 4 — UI 형태 + 슬라이더 범위/스텝

| 후보                | 설명                                                  | 결정                                                                                                                                       |
| ------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 모달 vs 인라인 패널 | about-modal 패턴(useState open + 고정 오버레이 + Esc) | **모달** — PM 합의, about-modal 패턴 재사용                                                                                                |
| 슬라이더            | scale-control Radix Slider 4개                        | **Radix Slider 4개** — 기존 패턴 재사용(단 ScaleControl 의 양방향 camera sync 는 불필요 — 본 슬라이더는 store→camera 단방향 + 기본값 마커) |
| 진입 버튼           | 헤더 TopBar 우측                                      | **`⚙ 카메라` 버튼** — app-shell.tsx `right` 슬롯 AboutModal 옆                                                                             |

**슬라이더 범위/스텝 (D-T2 튜닝 여지 + 극단값 방어)** — 1차 제안값(D-T2 조정 대상):

| 축          | min   | max  | step  | default | 근거                                                                  |
| ----------- | ----- | ---- | ----- | ------- | --------------------------------------------------------------------- |
| WASD        | 0.005 | 0.05 | 0.001 | 0.015   | default ⅓~3배. max 0.05 = #699 측정 "과대" 구 계수 상한(그 이상 방어) |
| 줌아웃 배율 | 2     | 20   | 1     | 5       | default 0.4~4배. max 20 = 빈 공간 진입 직전 안전망                    |
| 패닝        | 0.005 | 0.03 | 0.001 | 0.01    | default 0.5~3배                                                       |
| 줌          | 0.005 | 0.03 | 0.001 | 0.01    | default 0.5~3배. wheelDeltaPercentage 비례                            |

각 슬라이더에 **기본값 마커**(track 상 default 위치 시각 표시) + **"기본값 복원" 버튼**(`resetFreeFlySensitivity()`).

### 축 5 — 무회귀 경계

- 감도 4축은 **free-fly 진입 시에만** 카메라에 적용. focus/reset 경로(`setPanningEnabled(camera, false)`, `controller.focusOn`)는 불변 — 감도 변경이 focus/reset 거동에 영향 0.
- 줌(`wheelDeltaPercentage`)은 카메라 전역 속성이라 focus 중에도 적용되지만, focus 중 줌은 기존에도 동일 상수를 썼으므로 "사용자 조정 가능" 이 추가될 뿐 거동 모델 불변(회귀 아님).
- 신규 가드 시나리오(verify:704): (S1) 슬라이더 변경 → free-fly 런타임 반영(WASD step px 변화 / 줌 델타 변화 / 패닝 sensibility 변화 / upperRadiusLimit 변화) / (S2) "기본값 복원" → 4축 = 0.015/5/0.01/0.01 / (S3) localStorage 왕복(set → reload → 유지 + 손상값 주입 시 default 폴백) / (S4) 무회귀 — verify:699 S1~S6 + verify:693 PASS 유지.

---

## 결정

1. **주입 아키텍처 = 축 1-A (경로별 최소 침습)**. `attachWasdControl(camera, scene, getCoefficients?)` 에 getter 주입(매 프레임 `getCoefficients()` 로 wasd/maxStep 최신 읽기) / `computePanningSensibility` 와 `setPanningEnabled` 에 pct 인자(default = `PANNING_DELTA_PERCENTAGE`) / `camera.wheelDeltaPercentage`·`pinchDeltaPercentage` 직접 set / `FREE_FLY_ZOOMOUT_FACTOR` 를 store 값으로 읽어 `upperRadiusLimit` 재산정. **named const 4종은 default SSoT 로 잔존** — store 초기값이 const 를 import.
   - **줌아웃 배율 실시간 반영 (agy 이견 수용)**: 줌아웃은 진입 시 1회 산정이라, free-fly 활성 중 슬라이더 변경이 즉시 반영되지 않는다(재진입 필요 → DoD-1 "재진입 불요" 위반). **해결**: `setFreeFlySensitivity('zoomoutFactor', …)` 시 sim-canvas 가 store 구독해 `freeFlyActive === true` 이면 `upperRadiusLimit = freeFlyEntryRadius × factor` 를 즉시 재산정한다(entry radius 스냅샷은 이미 sim-canvas 에 보존됨 — `freeFlyEntryRadius`). 줌아웃만 push 구독(나머지 3축은 pull). dev 인수인계 주입 경로 B 참조.
   - **axis 리터럴 유니온 (agy 합의)**: `setFreeFlySensitivity(axis, value)` 의 `axis` 는 `'wasd' | 'zoomoutFactor' | 'panning' | 'zoom'` 리터럴 유니온 타입 — 컴파일 시점 오타 차단.
   - **getter 시그니처 명세 (agy 합의)**: `getCoefficients()` 는 `{ wasd: number; maxStep: number }` 반환(WASD onBeforeRender 가 매 프레임 호출). maxStep 도 향후 가변 대비 포함하되 1차 슬라이더는 wasd 만 노출(maxStep=`MAX_MOVE_STEP` 고정).

2. **store 스키마 = 축 2-A**. `freeFlySensitivity: { wasd, zoomoutFactor, panning, zoom }` + `setFreeFlySensitivity(axis, value)` + `resetFreeFlySensitivity()`. 초기값 = camera.ts const import(`WASD_DELTA_PERCENTAGE` 등) — default SSoT 일원화(하드코딩 0.015 재선언 금지, 주석-구현 drift 차단). **⚠️ 정정 (Amendment 2026-06-18 SSR 격리) — 아래 §Amendment 참조: const 값 import → 리터럴 + drift 가드 테스트로 SSoT 전환.**

3. **영속 = 축 3-A (직접 구현)**. `SENSITIVITY_SCHEMA_VERSION` + SSR 가드 + try/catch + 범위 clamp 3종 방어. zustand persist 미사용.
   - **Hydration 안전 (agy 이견 수용)**: store 생성 시점에 `loadPersisted()` 를 호출하면 Next.js SSR 초기 상태(default)와 클라이언트 localStorage 값 불일치로 **Hydration Mismatch** 발생 위험. **해결**: store 초기값은 **항상 const default**(서버·클라 동일)로 두고, localStorage 로드는 **클라이언트 mount 후 `useEffect` 1회**(설정 모달 컴포넌트 또는 전용 hydration hook)에서 `setFreeFlySensitivity` 로 덮어쓴다. 서버 렌더 HTML 은 default 로 고정되어 mismatch 0. (선례: `dismissedNoticeKeys` 도 store 초기값을 비영속 default 로 둠.)
   - **저장 시점 분리 (agy 합의/정교화)**: 슬라이더 `onValueChange` → store 즉시 갱신(런타임 카메라 즉시 반영) / localStorage 디스크 쓰기는 `onValueCommit`(드래그 종료) 시점 — 드래그 중 매 픽셀 `localStorage.setItem` 폭주 회피.
   - **reset 영속 동기화 (agy 합의)**: `resetFreeFlySensitivity()` 호출 시 **localStorage 도 즉시 갱신**(default 값 쓰기). 누락 시 복원 후 새로고침하면 이전 영속값 재로드되는 버그(agy 누락 요소 1 지적).
   - **역직렬화 안전 할당 (agy 부분 수용)**: `JSON.parse` 결과를 store 에 병합할 때 `{ ...parsed }` spread 가 아닌 **4축 속성별 명시 할당 + clamp**(`__proto__` 등 임의 키 주입 차단 + 손상값 정정). 범위 clamp 가 이미 임의 값 주입을 무력화하므로 prototype pollution 위험은 낮으나, 명시 할당이 방어와 가독성 모두 우수.

4. **UI = 축 4**. 헤더 `⚙ 카메라` 버튼 → 모달(about-modal 패턴) + Radix Slider 4개(범위/스텝 위 표) + 기본값 마커 + "기본값 복원". free-fly 비활성 중에도 조정 가능(다음 진입 시 반영) — 단 즉시 체감은 free-fly 중.

5. **무회귀 = 축 5**. focus/reset 불변. verify:704 신규 가드 + verify:699/693 무회귀.

---

## Amendment 2026-06-18 — SSR 격리 (축 2-A "camera.ts const import SSoT" 정정)

**발견 (qa #704)**: `develop` = SSR 200 / 본 #704 브랜치 = SSR 500 직접 대조. `apps/web/src/store/free-fly-sensitivity.ts` 의 `import { scene } from '@astro-simulator/core'` 가 `scene` 네임스페이스의 **값**을 import 하고, 그 `camera.ts` 가 `@babylonjs/core` 를 import → physics_wasm 체인까지 끌어들인다. 이 모듈을 `sim-store.ts`(이전엔 `import type { physics }` = type-only 라 SSR 안전)가 값 import 하면서, Next.js server component 그래프 평가 시 `physics_wasm_bg.wasm` ENOENT(`Error occurred prerendering page "/ko"`)로 SSR prerender 500. 클라이언트 hydrate 는 정상(실 사용 영향 0)이나 production(main) SSR 위험은 미검증 상태였다.

**정정**: 축 2-A 의 "default = camera.ts const **값 import**" SSoT 모델을 **리터럴 + drift 가드 테스트** 모델로 전환한다. `free-fly-sensitivity.ts` 에서 `scene` import 를 제거하고 default 를 숫자 리터럴(`{ wasd: 0.015, zoomoutFactor: 5, panning: 0.01, zoom: 0.01 }`)로 박제하되, SSoT 보증은 `free-fly-sensitivity.test.ts` 의 drift 가드가 담당한다(`FREE_FLY_SENSITIVITY_DEFAULT.wasd === scene.WASD_DELTA_PERCENTAGE` 등 — 테스트는 SSR 그래프 밖이라 babylon import 무방, 리터럴이 const 와 drift 하면 FAIL). babylon 의존을 SSR 격리하면서 SSoT(drift 0)는 테스트로 보존한다.

**일반화**: store/server-component 그래프에 babylon/wasm 같은 **side-effect 무거운 패키지의 값을 import 하지 않는다**. 상수 SSoT 가 필요하면 (a) 리터럴 + drift 가드 테스트 또는 (b) babylon-free 순수 상수 모듈로 분리한다. type-only(`import type`)는 컴파일 시 erase 되어 SSR 안전.

---

## 결과·재검토 조건

- **기대 효과** (측정 가능):
  - 4축 슬라이더 조정 → free-fly 중 즉시 카메라 거동 변화(재진입 불요, 줌아웃 배율 포함 — store 구독 push 재산정) — verify:704 S1
  - "기본값 복원" → 4축 = 0.015/5/0.01/0.01 — verify:704 S2
  - 새로고침 후 설정 유지 + 손상값 default 폴백 — verify:704 S3
  - focus/reset 영향 0 — verify:699 S1~S6 + verify:693 PASS — verify:704 S4
- **트레이드오프로 받아들인 비용**:
  - 주입 지점 4곳 산재(축 1-A) — 단일 SSoT 객체보다 wiring 분산. 단 4축 라이프사이클 비대칭상 불가피.
  - localStorage boilerplate 직접 작성(축 3-A) — zustand persist 대비 코드↑. PM 비목표 의존 회피로 상쇄.
- **재검토 트리거**:
  - 슬라이더 4축으로 사용자 조정 범위가 부족하다는 D-T2 피드백 → min/max/step Amendment
  - "느림/보통/빠름 프리셋" 수요 확인 → 후속 이슈(비목표). store 스키마가 객체 단위라 프리셋 = 객체 3종 매핑으로 확장 가능(축 2-A 가 프리셋 확장 정합)
  - 모바일 별도 감도 수요 → 후속(비목표). 현 단일 감도 객체에 viewport 분기 추가 시 재검토

### Concrete Prediction (신규 데이터 ≠ 신규 코드 — volt #47)

본 ADR 의 핵심 추상화 건강성 가설: **계수 1개 추가 시 store 1필드 + 슬라이더 1개로 끝나는가, 아니면 4축 주입 경로 차이로 코드가 증가하는가**.

- **예측 (4축 동질화 후)**: 본 PR 로 4축 주입 경로가 store 바인딩으로 동질화되면, **5번째 계수 추가 시** `sim-store.ts`(객체 1키 + 1 setter 분기) + `sensitivity-settings-modal.tsx`(슬라이더 1개 + 범위 엔트리) 만 변경. **camera.ts / sim-canvas.tsx 주입 로직 변경 0 줄**(단, 신규 계수의 주입 경로가 기존 4종 중 하나에 매핑될 때만 — 완전 신규 라이프사이클이면 예외).
  - 검증 방법: 후속 5번째 계수 추가 PR 에서 `git diff --stat packages/core/src/scene/camera.ts apps/web/src/components/sim-canvas.tsx` — 주입 로직 변경 0이면 예측 성공.
  - 실패 시 대응: (a) 신규 계수 라이프사이클이 기존 4종과 다름 → 주입 추상화 1종 추가 후 ADR Amendment (b) 하드코딩 잔존 발견 → 리팩토링 후 재개.
- **본 PR 자체 예측 (4축 도입 비용)**: 4축 주입 경로가 **모두 다르므로**, 본 PR 은 "store 1필드 + 슬라이더 1개" 의 4배가 아니라 **주입 wiring 4종 + store 객체 + 모달 + localStorage 모듈**이 든다. 즉 본 PR 은 추상화 건강성을 _만드는_ PR 이고, 위 5번째 계수 예측은 _그 추상화가 건강한지 검증하는_ 후속 측정이다. dev 는 본 PR diff 가 "1축당 균일 비용" 이 아님(WASD getter > 줌 속성 set)을 인지하고 작업.

### 교차검증 반영 사항

cross-validate 2026-06-18 (agy outcome=applied, exit 0, plan_bypass=false). 외부 모델 6 기준(구조/타당성/인터페이스/확장성/보안/누락) 평가. 4축 분류:

**호출 전 Claude 편향 셀프 체크** — 4종 통과 여부: (1) 낙관적 일정 — Concrete Prediction "5번째 계수=주입 0줄" 에 "기존 4종 라이프사이클 매핑 시에만" 단서 명시(과도 낙관 차단, agy 가 확장성 우수로 확인) ✅ / (2) 결합 간과 — **미통과**(localStorage hydration + zoomout 실시간 반영 결합을 cross-validate 프롬프트에 명시 질문으로 삽입했고, agy 가 둘 다 고유 발견으로 확정 → 본 통합으로 보정) ⚠️→보정 / (3) 폐기 프레이밍 — N/A(additive, 폐기 0) ✅ / (4) 순수주의 — zustand persist 거부(NIH 여부)·4축 wiring 분산(단순주의 여부)을 명시 질문 삽입, agy 가 둘 다 타당으로 확인 ✅.

**합의** (Claude 설계와 일치 — 본 PR 즉시 반영 항목):

- 축 1-A(경로별 최소 침습) 타당 — 4축 비대칭상 B/C 강제 수렴 시 leaky abstraction. agy "매우 타당".
- 축 3-A(직접 영속화) 3종 방어(SENSITIVITY_SCHEMA_VERSION + Number.isFinite + min/max clamp)로 오염 데이터 차단 — agy "오염 영속 데이터 유입 완벽 차단".
- Concrete Prediction + `git diff --stat` 검증법 — agy "아키텍처 지속 가능성 검증에 모범적".
- 중첩 객체 스키마(축 2-A)가 프리셋 확장 정합 — agy "프리셋 명칭 매핑 확장 매끄럽게 호환".
- 저장 시점 `onValueChange`(store 즉시) / `onValueCommit`(localStorage I/O) 분리 — 결정 3 정교화 반영.

**이견 수용** (Claude 원안과 다르나 agy 근거 합리 → 수정):

- **Hydration Mismatch 방지** — 원안: 축 3-A "store 생성 시 `loadPersisted()`". agy: Next.js SSR 초기 상태 ↔ 클라 localStorage 불일치로 Hydration Mismatch 위험. **수용**: store 초기값 = const default(서버·클라 동일) + localStorage 로드는 mount 후 `useEffect` 1회 덮어쓰기로 변경(결정 3 Hydration 안전 항목). 원안이 SSR 가드만 두고 hydration 타이밍을 간과했음(셀프 체크 결합 간과 축 보정).
- **줌아웃 배율 실시간 반영** — 원안: 줌아웃 "진입 시 1회 산정". agy: free-fly 중 슬라이더 변경이 즉시 반영 안 됨(DoD-1 "재진입 불요" 위반). **수용**: zoomout 만 store 구독 push 로 `freeFlyEntryRadius × factor` 즉시 재산정(결정 1 줌아웃 실시간 반영 항목). 4축을 균일 pull 로 본 원안의 사각.

**Claude 재분석으로 부분 기각** (맹목 수용 회피 — volt #51):

- **Prototype pollution(`__proto__`) 방어** — agy: `{ ...parsed }` 병합 전 안전 파싱 권장. **부분 수용**: 범위 clamp + `Number.isFinite` 가 이미 임의 값 주입을 무력화하므로 별도 sanitizer 라이브러리는 과잉(순수주의 역방향). 대신 **4축 속성별 명시 할당**(spread 미사용)으로 1줄 비용으로 동일 방어 확보(결정 3 역직렬화 안전 할당). agy 제안의 핵심(spread 회피)은 수용하되 무게(전용 방어 계층)는 기각.

**고유 발견 (범위 밖 — 후속 분리)**:

- 없음. agy 발견 2건(Hydration / zoomout 실시간)은 모두 본 이슈 DoD(즉시 반영·새로고침 유지) 범위 **내** 라 즉시 반영(후속 분리 0). 비목표(프리셋 / 키바인딩 / 모바일 별도 감도)는 agy 도 침범하지 않음.

---

## 참고

- [#704](https://github.com/coseo12/astro-simulator/issues/704) — 본 이슈 (PM 합의 2026-06-18)
- [`20260617-699-freefly-camera-unified-redesign.md`](20260617-699-freefly-camera-unified-redesign.md) §8 / §교차검증 고유 발견 1
- [`20260607-629-freefly-camera-zoom-forensic.md`](20260607-629-freefly-camera-zoom-forensic.md) §6
- [`20260616-693-freefly-panning.md`](20260616-693-freefly-panning.md) — `computePanningSensibility` 재산출 SSoT
- 구현 선례: `apps/web/src/components/layout/scale-control.tsx` (Radix Slider), `about-modal.tsx` (모달), `sim-store.ts` (setter), `packages/core/src/scene/camera.ts` (4축 const + 주입), `apps/web/src/components/sim-canvas.tsx` (`FREE_FLY_ZOOMOUT_FACTOR` wiring)
- ADR 원형: https://adr.github.io
