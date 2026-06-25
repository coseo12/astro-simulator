# ADR: 절차적 starfield + 은하수 우주 배경 — #738

- **상태**: **Accepted** (cross-validate 2026-06-24 agy 통합 — §교차검증 반영 사항 4+1축 박제 완료. ADR Status 워크플로 §부분 도입 #370). **§Amendment 2 (#745) 는 Provisional** — developer 구현 + qa 실 GUI 후 Accepted 전이.
- **날짜**: 2026-06-24 (§Amendment 2: 2026-06-25, #745)
- **결정자**: architect (#738 설계 / #745 Amendment 2)
- **관련**:
  - [#738](https://github.com/coseo12/astro-simulator/issues/738) (본 이슈 — 별 배경 + 은하수)
  - [#745](https://github.com/coseo12/astro-simulator/issues/745) (§Amendment 2 — tier-c 과잉 비활성 회귀 → 소프트웨어 렌더만 비활성 정정)
  - 방향성 기획서 2026-06-22 트랙 A1 (몰입·정체성 핵심) — `docs/architecture/principles.md §1 Visual Fidelity`
  - [`20260422-floating-origin.md`](20260422-floating-origin.md) (P11-A #288 — floating origin 좌표 계약, 별 무한원경 정합의 출처)
  - [`20260613-675-glow-pixel-marker.md`](20260613-675-glow-pixel-marker.md) (#675 — ShaderMaterial + URL 토글 + parse-\* 패턴 선례)
  - [`20260610-r7-saturn-titan-visualization.md`](20260610-r7-saturn-titan-visualization.md) (#641 — `ring-shader.ts` 커스텀 ShaderMaterial + log-depth `gl_FragDepth` 선례)
  - `packages/core/src/scene/log-depth.ts` (`enableLogarithmicDepth` — minZ 0.01 / maxZ 1e14 극단 near/far)
  - 진입점: `packages/core/src/scene/solar-system-scene.ts:442` (`scene.clearColor`), `apps/web/src/components/sim-canvas.tsx:338~367` (URL 파싱 → scene 옵션)
- **교훈 적용**: "신규 함수 ≠ 신규 구현" (기존 `ring-shader.ts` ShaderMaterial + `log-depth.ts` + `parse-marker-mode.ts` 패턴 재사용) / "measurement-first" (별 개수·밝기는 가설이 아닌 fps + px 실측으로 박제) / "DoD PASS ≠ 제품 동작" (시각 품질은 headless 미재현 → 실 Chrome GUI 의무) / Visual Fidelity §의무 체크리스트 4항목 (rendering-only, 데이터 SSoT 0).

---

## §1 배경

astro-simulator 의 정체성은 "감상/탐험형" (`principles.md §1 Visual Fidelity`) 이다. 그러나 현재 배경은 **단색 `Color4(0.031, 0.035, 0.051, 1)`** (짙은 남색, `solar-system-scene.ts:442`) 뿐이고, 별/은하수/성운은 **0** (저장소 전체 grep 실측 확정 — `packages/core/src` 에 starfield/skybox/PhotoDome/PointsCloudSystem 사용 없음). 도표형 화면이라 "우주에 있다" 는 몰입이 부재하다.

본 이슈 (#738) 는 방향성 기획서 (2026-06-22) 의 **트랙 A1 (몰입·정체성 핵심)** 첫 라운드로, "도표형 → 감상형" 전환의 첫 걸음이다. #737 (온보딩, 트랙 B) 과 달리 **렌더링 feature** 이므로 `packages/core/src/scene` 변경을 동반한다 (core 0 이 아님).

### 범위 (사용자 확정 대기 — 본 설계안의 제안)

- **만든다**: (1) 절차적 별 배경 — 신규 라이브러리/외부 에셋 0, (2) 은하수 띠 (절차적, 같은 shader 내), (3) Floating Origin / Tier 전환과 정합 (별 = 무한원경, 카메라 회전만 반응), (4) `?stars=off` 토글 (기본 ON), (5) fps 무회귀.
- **만들지 않는다 (비-범위)**: 실측 star catalog (Hipparcos/Tycho 등 — 과학 정확성 ≠ 감상 미학, 후속 분리 가능) / 별자리 선/이름 라벨 / 성운·은하 텍스처 에셋 / 별 패럴랙스 (parallax — 무한원경 계약과 상충) / 런타임 별 개수 슬라이더 UI.

### Explore 검증 코드 사실 (출발점)

- **배경 SSoT 단일 지점**: `solar-system-scene.ts:442` `scene.clearColor = new Color4(0.031, 0.035, 0.051, 1)`. starfield 는 이 위에 렌더되는 별도 레이어.
- **카메라**: `setupArcRotateCamera` (`camera.ts:273~`) — `ArcRotateCamera`, `minZ=0.01`, `maxZ=1e14`, **log-depth 버퍼** 전제. `radius` 는 tier 별 0.5 ~ 1e14 범위 (solar≈35~464, body≈158386).
- **Floating Origin**: `floating-origin.ts` 는 **좌표 계산만** — 실제 노드 이동은 `solar-system-scene.ts` 가 매 프레임 **각 mesh 의 `mesh.position.set(local...)`** 로 수행 (단일 scene root 노드 없음). 별은 이 origin shift 에 **불변** 이어야 한다 (행성처럼 가까워지면 안 됨).
- **WebGPU 우선**: `WebGpuNBodyEngine` import + `?gpu=a` 경로. Babylon `PointsCloudSystem.pointSize` 는 **"Has no effect on a WebGPU engine"** (v9 `pointsCloudSystem.d.ts:93` 실측) — PCS 점 크기 제어 불가가 WebGPU 에서 결정적 결함.
- **`infiniteDistance`**: Babylon v9 `transformNode.d.ts:80` 에 존재 (Mesh 상속). `true` 면 mesh 가 **카메라 위치를 추종** (origin shift / tier 이동 / 줌으로 가까워지지 않음) 하되 **회전은 정상 반영** — 별의 "무한원경" 계약을 라이브러리 레벨로 충족.
- **ShaderMaterial 선례**: `ring-shader.ts` 가 커스텀 GLSL ShaderMaterial + `gl_FragDepth` log-depth 정합을 이미 구현 (R7 #641 §축에서 log-depth 불일치 fix 박제). starfield shader 는 이 패턴을 직접 답습.
- **URL 파싱 선례**: `parse-marker-mode.ts` / `parse-orbits-mode.ts` — 순수 함수 + 기본 ON + `?x=off` opt-out + unknown → 기본 폴백 + warn. `sim-canvas.tsx:338~367` 에서 `URLSearchParams.get` → `createSolarSystemScene` 옵션 주입.

---

## §2 결정할 항목 (축별 후보 비교)

### 결정 1 — 무한원경 렌더 방식 (별이 floating-origin/tier 에 불변)

| 후보                                                                                   | 장점                                                                                                                                                                                                                                                                                                                                     | 단점                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(A) `infiniteDistance=true` 거대 inverted 박스/구 + 절차적 fragment ShaderMaterial** | 단일 draw call (별 N 과 무관한 고정 비용). `infiniteDistance` 가 카메라 위치 추종 + 회전 반영을 **라이브러리 레벨**로 보장 → origin shift listener 불필요, tier/줌 불변 자동. WebGPU pointSize 문제 회피 (별을 fragment 에서 절차 생성). 은하수 띠를 같은 fragment 에 합성 (추가 draw call 0). 에셋 0. `ring-shader.ts` 패턴 직접 재사용 | GLSL hash 기반 절차 별 분포 작성 필요 (shader authoring 비용). log-depth 정합 (별은 항상 최배경 = 최대 depth) 수동 처리. 점멸/색온도 미학 튜닝                                                                                                                                                  |
| (B) `PointsCloudSystem` (점 별)                                                        | "진짜 점" 직관적. 별 개수/색/위치 per-particle 제어                                                                                                                                                                                                                                                                                      | **WebGPU 에서 pointSize 무효** (v9 실측) → 핵심 WebGPU 경로에서 별이 1px 고정/비가시 위험. N 개 vertex 비용 (감상 밀도 수천~만 → fps 위험). floating-origin/tier 불변을 별도 메커니즘 (camera-parent or per-frame translate) 으로 직접 구현 — `infiniteDistance` 미적용 시 줌으로 별이 가까워짐 |
| (C) skybox `CubeTexture` (6면 이미지)                                                  | Babylon 표준 skybox. 고품질 사전 렌더 가능                                                                                                                                                                                                                                                                                               | **외부 에셋 6장 필요** (이슈 제약 "신규 에셋 비선호" + 사용자 승인 필요). 절차 생성 불가 (런타임 토글 시 텍스처 로드 비용). 번들 크기 증가                                                                                                                                                      |
| (D) `PhotoDome` / 단일 파노라마 텍스처                                                 | 단일 에셋                                                                                                                                                                                                                                                                                                                                | (C) 와 동일하게 에셋 필요. 구 매핑 왜곡                                                                                                                                                                                                                                                         |

**채택 제안: (A) `infiniteDistance` mesh + 절차적 fragment ShaderMaterial.** 결정적 근거 3가지: (1) **WebGPU 우선** 환경에서 PCS pointSize 무효 (B) 는 핵심 경로 결함, (2) **에셋 0 제약** 이 (C)(D) 를 배제, (3) `infiniteDistance` 가 floating-origin/tier 불변을 라이브러리 레벨로 보장해 좌표 정합 코드를 최소화. 은하수 띠도 같은 fragment 에 합성 → 추가 비용 0.

> **구 vs 박스 (A 내부 선택)**: 거대 **inverted sphere** (안쪽을 향한 법선) 채택. 박스는 모서리 distortion + 별 분포 균질성이 떨어진다. **방향별 절차 생성은 sphere UV 가 아닌 `view direction` (카메라 ray) 기반** — view direction 은 projection 을 이미 반영하므로 **resize / aspect ratio 변동 시 별 찌그러짐 (stretching) 이 설계상 발생하지 않는다** (agy 고유 발견 §누락 요소 반영 — UV 방식이었으면 aspect uniform 보정 필요). `infiniteDistance` 라 실제 크기는 무관.
>
> **depth 정합 (cross-validate 갱신)**: 초안의 "fragment 에서 `gl_FragDepth` 최대치 기록" 은 **폐기**. agy 고유 발견대로 `gl_FragDepth` 수동 쓰기는 GPU **Early-Z 최적화를 비활성화** → fragment 비용 상승. 대신 **`renderingGroupId = 0` (background queue) + depth write 비활성** 표준 skybox 패턴 채택 — 별이 가장 먼저 그려지고 이후 모든 body/orbit/ring 이 그 위에 덮어쓴다. log-depth 의 `gl_FragDepth` 정합 부담 0 + Early-Z 보존. (`ring-shader.ts` 의 `gl_FragDepth` 패턴은 ring 처럼 다른 불투명체와 섞이는 경우에만 필요 — 항상 최배경인 starfield 는 render order 로 더 단순·빠르게 해결.)

### 결정 2 — 별 절차 생성 방식 (fragment shader 내부)

| 후보                                             | 장점                                                                                                                                                                      | 단점                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **(A) 방향 벡터 hash → 셀 기반 별 (cell noise)** | view direction 을 grid 셀로 양자화 → 셀당 hash 로 별 유무/밝기/색 결정. 무한 해상도 (줌/회전 무관 선명). 별 개수 = grid 밀도 파라미터 1개. 분포 균질 + 클러스터 변조 가능 | hash 함수 품질에 따라 격자 패턴 잔재 위험 (jitter 로 완화) |
| (B) precomputed 별 위치 uniform 배열             | 정확한 별 배치                                                                                                                                                            | uniform 배열 크기 한계 (수백 개), 감상 밀도 (수천) 부족    |

**채택 제안: (A) 셀 기반 hash 별.** fragment 에서 view direction → 3D 셀 → per-cell hash → 별 유무 (threshold) + 밝기 (지수 분포로 소수 밝은 별 + 다수 희미한 별) + 색온도. grid 밀도 1개 uniform 로 별 개수 제어 → fps trade-off 튜닝 단순.

### 결정 3 — 은하수 띠 포함 여부 + 방식

| 후보                                                                                    | 장점                                                                                                 | 단점                                             |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **(A) 포함 — 같은 fragment 에서 대원(great circle) 따라 별 밀도 + 희미한 발광 띠 변조** | 감상 미학 핵심 (은하수 = "우주에 있다" 의 상징). 추가 draw call 0 (같은 shader). 띠 방향 1개 uniform | shader 복잡도 소폭 증가. 띠 색/폭/밝기 미학 튜닝 |
| (B) 미포함 (별만)                                                                       | shader 단순                                                                                          | "감상형" 정체성 핵심 결손 (이슈 목표 §은하수 띠) |

**채택 제안: (A) 포함.** 이슈 범위에 명시 + 감상 미학 핵심. 단 **저강도 fallback** — tier-c (저성능) 에서 띠 발광이 비용이면 별 밀도 변조만 유지하고 발광은 약화 (결정 5 성능 가드 참조). 은하수 평면 방향은 황도/은하 좌표와 정렬할 필요 없음 (감상용 — 임의 미학 방향, ADR §점유율에 박제). **Visual Fidelity §의무 체크리스트 정합**: 은하수 방향은 데이터 SSoT 아님 (rendering-only 미학 상수).

### 결정 4 — 색온도 분포 (감상 미학, AI 기본값 탈피)

별 색은 **실측 흑체 색온도 분포 근사** (감상용, 과학 catalog 아님): 다수 백색~담황 (G/K type 다수), 소수 청백 (O/B, 밝은 별) + 소수 적황 (M). 채도는 **낮게** (실제 밤하늘 별은 거의 백색에 가깝고 미세한 tint) — 과채도 (rainbow 별) 는 AI 생성/게임 기본값 anti-pattern. **금지**: 보라/마젠타 그라데이션 (디자인 루브릭 Originality — AI 기본값 탈피). 배경 clearColor (현 짙은 남색) 는 유지 — 별이 그 위에 렌더.

### 결정 5 — 성능 가드 (fps-baseline-guard 무회귀)

| 항목                | 설계                                                                                                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **렌더 비용**       | (A) 방식은 별 개수와 무관한 **단일 full-screen-ish fragment pass** (inverted sphere). 비용 = fragment 당 hash 연산 × 화면 픽셀. tier-c 부담 시 grid 밀도 / 은하수 발광을 URL/tier 로 약화 |
| **tier-c (저성능)** | 은하수 발광 띠 비활성 + 별 hash 반복 횟수 축소 옵션. 단 기본 동작은 무회귀 우선 — fps 측정으로 최종 파라미터 박제 (measurement-first)                                                     |
| **무회귀 기준**     | `verify:fps-baseline` desktop/mobile 양 scenario 가 baseline 대비 회귀 임계 내 (CI fps-baseline-guard PASS). 별 도입 전후 fps delta 를 ADR §점유율에 박제                                 |

### 결정 6 — picking / LOD / 라이팅 비간섭

- **picking 제외**: starfield mesh 는 `isPickable = false` — `body-picking.ts` raycast (#713) 가 별을 절대 hit 하지 않음. (별 클릭 → focus 전환 사고 차단)
- **LOD 제외**: starfield 는 LOD 시스템 (`runLodPass`) 대상 아님 — body mesh 가 아니므로 자동 미포함. metadata.bodyId 미박제 (#713 역매핑 무관).
- **라이팅 제외**: starfield material 은 `disableLighting=true` 류 — ambient/sun light 영향 0 (별은 자체 발광). `ring-shader.ts` 와 동일하게 커스텀 shader 라 표준 라이팅 미적용.
- **log-depth 정합**: fragment 에서 depth 를 최대 (최배경) 로 기록 → 모든 body/orbit/ring 이 별 앞에 렌더. `ring-shader.ts` 의 log-depth `gl_FragDepth` 처리 (R7 #641 잠복버그 fix) 를 답습.

### 결정 7 — URL 토글

`parse-stars-mode.ts` 순수 함수 신규 — `parse-orbits-mode.ts` 구조 직접 답습:

- 미지정 / `on` → `true` (기본 ON)
- `off` → `false` (`?stars=off`)
- unknown → `true` 폴백 + `console.warn`

`sim-canvas.tsx` 에서 `URLSearchParams.get('stars')` → `parseStarsVisible` → `createSolarSystemScene({ starfield: ... })`. **런타임 토글 UI 는 비-범위** (초기 옵트아웃만 — #675 marker 와 동일. 향후 토글 버튼은 `setOrbitLinesVisible` 패턴으로 후속 가능).

---

## §3 구현 설계 (Concrete Prediction)

### 신규 파일

| 파일                                         | 책임                                                                                                                                                                                                                                                                                                                                                                                                                                             | 예상 라인                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| `packages/core/src/scene/starfield.ts`       | `createStarfield(scene, options): StarfieldHandles` → inverted sphere mesh + 절차 fragment ShaderMaterial (별 + 은하수). `infiniteDistance=true`, `isPickable=false`, `renderingGroupId=0` + depth-write off (cross-validate 갱신). 반환 타입은 **`{ mesh: Mesh; material: ShaderMaterial; dispose: () => void }` 명시 인터페이스** (agy 액션 1 — `RingShaderHandles` / `AsteroidBeltHandles` repo 관습 정합. ShaderMaterial GPU 자원 누수 차단) | ~120~180 (shader GLSL 포함) |
| `packages/core/src/scene/starfield.test.ts`  | 별 파라미터 상수 가드 (grid 밀도 / 색온도 분포 / 은하수 방향 상수 SSoT), `createStarfield` 가 `infiniteDistance`/`isPickable=false` 설정 단언 (#69 숨은 상수 drift 차단)                                                                                                                                                                                                                                                                         | ~60~100                     |
| `apps/web/src/core/parse-stars-mode.ts`      | `parseStarsVisible(urlParam)` 순수 함수 (parse-orbits-mode 답습)                                                                                                                                                                                                                                                                                                                                                                                 | ~30                         |
| `apps/web/src/core/parse-stars-mode.test.ts` | on/off/unknown/대소문자 케이스                                                                                                                                                                                                                                                                                                                                                                                                                   | ~40                         |
| `scripts/browser-verify-starfield.mjs`       | S1 정적 (별 가시) / S2 floating-origin 불변 (focus 전환·줌 전후 별 위치 불변) / S3 회전 반영 / S4 `?stars=off` 비가시 / S5 picking 비간섭                                                                                                                                                                                                                                                                                                        | ~150                        |

### 변경 파일 (Concrete Prediction — "데이터/배선만, 로직 최소")

| 파일                                            | 변경                                                                                                                                                                                                                                | 예상 라인 |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `packages/core/src/scene/solar-system-scene.ts` | (1) `SolarSystemSceneOptions` 에 `starfield?: boolean` (기본 false — web 레이어가 기본 ON 결정, #675 레이어 분리 정합), (2) clearColor 직후 `if (starfield) { const sf = createStarfield(scene, ...); disposables.push(sf); }` 배선 | ~8~12     |
| `packages/core/src/scene/index.ts`              | `createStarfield` + 타입 export                                                                                                                                                                                                     | ~3        |
| `apps/web/src/components/sim-canvas.tsx`        | `URLSearchParams.get('stars')` → `parseStarsVisible` → `createSolarSystemScene({ starfield })` 주입 (#675 marker 배선 패턴)                                                                                                         | ~4~6      |
| `package.json`                                  | `verify:738-starfield` 스크립트 1줄                                                                                                                                                                                                 | ~1        |

### Concrete Prediction 명시

- **core 신규**: `starfield.ts` ~120~180 라인 (shader 포함) — 이번 라운드는 **순수 신규 렌더 모듈** 이라 "core 0" 이 아니다 (#737 온보딩과 대비, 이슈 §맥락 명시 정합).
- **core 변경 (기존 파일)**: `solar-system-scene.ts` ~8~12 (배선) + `index.ts` ~3 (export) — **로직 변경 최소, 배선만**. clearColor 위에 레이어 1개 추가, 기존 body/orbit/ring/LOD/picking 경로 **무수정** (별은 독립 레이어).
- **web 변경**: parse-stars-mode 신규 ~70 + sim-canvas 배선 ~4~6.
- **floating-origin 정합 코드 0** — `infiniteDistance` 가 라이브러리 레벨로 처리 (origin shift listener 구독 불필요). 이것이 결정 1-(A) 채택의 핵심 이득. **검증 필요 가정**: `infiniteDistance` 가 ArcRotateCamera + log-depth + tier scale 변동 환경에서 줌 시 별을 가까워지지 않게 하는지 **dev 실측** (developer Phase D1). 가정이 깨지면 fallback = per-frame `mesh.position = camera.position` 직접 추종 (~5 라인).
- **"신규 함수 ≠ 신규 구현" 재사용**: `ring-shader.ts` (ShaderMaterial + log-depth), `log-depth.ts` (`enableLogarithmicDepth`), `parse-orbits-mode.ts` (URL 파싱) — 신규 starfield 는 이들 패턴을 재사용, 신규 추상화 최소.

---

## §4 검증 계획

| 레벨                            | 검증                                                                                                                                                                                                                                                                                                    | 도구                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 단위                            | starfield 상수 SSoT 가드 (#69 drift) + `infiniteDistance`/`isPickable=false` 단언 / parse-stars-mode on·off·unknown                                                                                                                                                                                     | vitest                                                                         |
| browser-verify (S1~S5)          | S1 별 가시 (스크린샷 px 밝기 > clearColor) / **S2 floating-origin 불변** (earth focus → jupiter focus → 줌 전후 별 화면 위치 불변, `__solarScene` / `__floatingOrigin` 전역 활용) / S3 회전 반영 (alpha 변경 시 별 이동) / S4 `?stars=off` 비가시 / S5 별 picking 비간섭 (별 영역 클릭 시 focus 무변화) | Playwright (`browser-verify-starfield.mjs`)                                    |
| fps                             | desktop/mobile baseline 무회귀 + 별 도입 전후 fps delta 박제                                                                                                                                                                                                                                            | `verify:fps-baseline`                                                          |
| 실 Chrome GUI (headless 미재현) | 시각 품질 — 별 밝기/분포 자연스러움, 은하수 띠 미학, 색온도 (보라 anti-pattern 부재), tier-c 비교                                                                                                                                                                                                       | 사용자 D-T2 + 메인 GUI 검증 (CRITICAL #3 / headless-browser-verification 교훈) |

**신규 verify 스크립트 필요**: 예 — `browser-verify-starfield.mjs` (S2 floating-origin 불변이 본 feature 의 핵심 회귀 가드, 기존 verify 로 대체 불가).

**가드 도입 PR DoD 4축** (guard-pr-dod 교훈): S2 floating-origin 불변 가드는 negative-test 성격 → (1) 격리 동적 테스트 (2) 3중 시뮬 (별 정상 → 의도적 origin-coupled 별 negative → recovery) (3) 5 페르소나 self-consistency (4) 메타 측정 안정성 — developer Phase 에서 적용.

---

## §5 시각 품질 가이드 (감상 미학)

- **밝기 분포**: 지수 분포 — 소수 (수십) 밝은 별 + 다수 (수천) 희미한 별. 균일 밝기 (게임 기본값) 금지.
- **색온도**: 다수 백색~담황 (저채도), 소수 청백 (밝은 별), 소수 적황. **과채도 rainbow 별 금지 / 보라·마젠타 그라데이션 금지** (디자인 루브릭 Originality).
- **은하수**: 희미한 발광 띠 + 띠 영역 별 밀도 증가. 과도한 발광 (네온) 금지 — 실제 밤하늘 은하수는 미묘.
- **배경**: 현 clearColor (짙은 남색) 유지 — 별이 그 위에 렌더. 별이 배경과 충분히 대비.
- **점멸 (twinkle)**: 선택 — 미묘한 시간 변조 (감상 살아있음). 과도한 깜빡임 금지. 비용 시 비활성.

---

## §6 위험 / 미해결

| 위험                                                                              | 완화                                                                                                                                                                      |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`infiniteDistance` 가 줌/tier 변동 시 별을 가까워지지 않게 하는지 미검증 가정** | developer Phase D1 dev 실측 (focus 전환·줌·tier 전환 전후 별 화면 위치 불변 측정). 깨지면 per-frame camera.position 추종 fallback (~5라인)                                |
| **log-depth 정합 — 별이 body 앞에 렌더되거나 z-fighting**                         | `renderingGroupId=0` (background queue) + depth write off (cross-validate 갱신 — `gl_FragDepth` 폐기, Early-Z 보존). 별이 가장 먼저 렌더 → 모든 body/orbit/ring 이 덮어씀 |
| **WebGPU ↔ WebGL shader parity**                                                  | ShaderMaterial GLSL 은 양 백엔드 동작 (ring-shader 선례). WGSL 별도 작성 불필요 (Babylon GLSL→WGSL 변환). 단 양 백엔드 실 GUI 검증 의무                                   |
| **fps 회귀 (별 hash 연산)**                                                       | grid 밀도 / 은하수 발광 파라미터를 measurement-first 로 박제 — fps-baseline-guard PASS 가 DoD                                                                             |
| **헤드리스 false positive** (volt #74/#77)                                        | 시각 품질은 headless 미재현 — 실 Chrome GUI 의무 (CRITICAL #3)                                                                                                            |
| **별 분포 격자 패턴 잔재**                                                        | hash jitter + 셀 내 별 위치 무작위화                                                                                                                                      |

### 후속 분리 후보 (비-범위)

- 실측 star catalog (Hipparcos/Tycho) 기반 정확 별 배치 — 과학 정확성 트랙 (감상 미학과 직교)
- 별자리 선/이름 라벨 — 교육 트랙
- 런타임 starfield 토글 UI 버튼 (현재는 `?stars=off` 초기 옵트아웃만)
- 성운/은하 텍스처 (에셋 필요 → 사용자 승인)

---

## §7 신규 의존성 판단

**신규 라이브러리 0 / 외부 에셋 0.** 절차적 ShaderMaterial (Babylon 기본 기능) 만 사용. (C)(D) skybox/PhotoDome 이미지 에셋 경로는 배제 (이슈 제약 + 사용자 승인 회피). 따라서 **사용자 의존성 승인 불필요**.

---

## §8 결과·재검토 조건

- **재검토 트리거**: (1) `infiniteDistance` 가정이 dev 실측에서 깨지면 결정 1-(A) fallback 메커니즘 박제 (Amendment), (2) fps 회귀가 파라미터 튜닝으로 해소 안 되면 tier-c 별 비활성 정책 추가, (3) 사용자가 실측 star catalog 정확성을 요구하면 후속 트랙 ADR.
- **Concrete Prediction 재현**: developer 머지 후 `git diff --stat` 으로 core 신규 ~120~180 / 기존 파일 변경 ~11~15 / web ~70~76 예측 검증.
- **cross-validate**: 본 ADR Provisional → agy 교차검증 → §교차검증 반영 사항 4+1축 박제 → Accepted 전이.

---

## §Amendment 1 — GPU tier-c 별 배경 비활성 (fill-rate graceful degradation) (2026-06-25, #738 PR #742)

**상태**: Accepted. **트리거**: §8 재검토 트리거 (2) "fps 회귀가 파라미터 튜닝으로 해소 안 되면 tier-c 별 비활성 정책 추가" 가 발동. 본 ADR 이 예견한 fallback 정책의 실현.

### 발견 (CI fps 실측 — measurement-first)

PR #742 CI 에서 fps-baseline-guard + r1-guard 2 가드가 fail (각 2회 연속 재시도 후 fail — runner variance 가 아닌 진짜 회귀):

| guard                      | scenario                                | 측정값                    | baseline / 임계 | 판정             |
| -------------------------- | --------------------------------------- | ------------------------- | --------------- | ---------------- |
| fps-baseline-guard         | desktop / default (tier=c override=low) | **7.0 / 12.7 / 13.5 fps** | baseline 49.9   | FAIL (~73% 하락) |
| fps-baseline-guard         | desktop / earth focus                   | 13.0 / 13.2 / 13.3 fps    | baseline ~57    | FAIL             |
| fps-baseline-guard         | mobile / default                        | 27.4~28.5 fps             | —               | 동반 하락        |
| r1-guard (detect-and-test) | shortcut-bar (1920)                     | mismatch **25.062%**      | 0.5%            | FAIL             |
| r1-guard                   | hud-top-right                           | mismatch 0.696%           | 0.5%            | FAIL             |

**원인 1 (fps)**: 별 배경은 전체화면 inverted-sphere fragment shader 다. CI runner 는 항상 **gpu tier-c** (swiftshader 소프트웨어 래스터라이저). tier-c 에서 전 화면 fragment 의 cell-noise + fbm 비용이 fill-rate 치명타가 되어 desktop ~13fps 로 급락한다. sin-free hash + band-guarded fbm 등 §5 measurement-first 완화로도 tier-c 의 fill-rate 한계는 못 넘는다 (트리거 (2) 의 "파라미터 튜닝으로 해소 안 됨" 충족). 로컬 dev (실 GPU = tier-a/b) 의 fps-baseline (CPU 4x throttle, 실 GPU) 은 무회귀였으나, CI 의 swiftshader 환경은 재현 불가했던 사각.

**원인 2 (r1-guard)**: tier-c 에서 반투명 UI (shortcut-bar `bg-surface/80`, hud-top-right) 뒤로 별이 비쳐 기존 baseline (별 없는 단색 배경) 과 pixel mismatch. 별을 tier-c 에서 안 그리면 mismatch 가 사라진다 (baseline 재생성 불필요).

### 결정

**GPU tier-c 에서는 starfield 를 생성하지 않는다** (web 레이어 `sim-canvas.tsx`):

```
starfieldVisible = (parseStarsVisible(?stars=) === true) && resolveGpuTier(gpuCap) !== 'c'
```

- **레이어 분리 정합**: starfield 기본 ON 결정권은 web 레이어 (§결정 7). tier-c 스킵도 web 레이어 책임 — core `createSolarSystemScene` 의 `starfield` 옵션 기본값 false 는 불변.
- **tier-c 자동 억제 철학 정합**: `detect-gpu-tier.ts §계약 6` ("tier-c 자동 억제: LOD low 강제 + 파티클 0 + shadow OFF + post-proc OFF + bloom OFF") 의 **starfield 확장**. 별 배경은 post-proc 성 전체화면 효과이므로 동일 graceful-degradation 범주.
- **race-safe 구현**: GPU capability 감지 (`detectGpuCapability`) 와 scene 생성 (`instance.start`) 은 별개 async chain (#677 race 윈도우). 단일 `gpuCapPromise` 를 두 chain 이 공유 + `Promise.all([instance.start(), gpuCapPromise])` 로 scene 콜백 진입 시점에 tier 동기 확정. tier 판정식은 `resolveGpuTier` helper 로 추출 (capability then / scene 콜백 SSoT 단일 — drift 차단).
- **fallback 메커니즘 미박제 (결정 1-(A) 와 무관)**: 트리거 (1) `infiniteDistance` 가정은 dev 실측 PASS (Δ=0.000px) 라 결정 1-(A) fallback 은 여전히 불필요. 본 Amendment 는 트리거 (2) 전용.

### 효과

- tier-c: 별 미생성 → (a) fill-rate 회복 → fps 무회귀 (b) 반투명 UI 뒤 별 없음 → r1-guard 기존 baseline 일치.
- tier-a/b (실 GPU): 별 배경 유지 (감상 미학 보존 — 사용자가 실제 보는 대다수 환경).
- 사용자 수동 상향 경로 보존: `?gpu=b` / `?gpu=a` 로 tier-c 환경에서도 별 배경 강제 가능 (URL override 우선).

### 회귀 가드

- 단위 테스트: `parse-stars-mode.test.ts` 에 "tier-c 일 때 starfield false" 합성식 단언 (web 레이어 결정식 직접 검증).
- CI: fps-baseline-guard + r1-guard 가 tier-c (CI 항상 tier-c) 에서 회귀 시 재차단.

---

## §Amendment 2 — tier-c 전체 비활성 → 소프트웨어 렌더만 비활성 (과잉 비활성 회귀 정정) (2026-06-25, #745)

**상태**: **Provisional** (cross-validate 2026-06-25 agy 통합 완료 — 아래 §Amendment 2 교차검증 반영 사항 박제. developer 구현 + qa 실 GUI 후 Accepted 전이). **트리거**: Amendment 1 의 `gpuTier !== 'c'` 비활성 기준이 production 에서 **과잉**으로 판명 (v0.35.0 회귀, #745 high).

### 발견 (production 회귀 + Playwright 실측 — measurement-first)

Amendment 1 은 fps 회귀의 진짜 원인을 **소프트웨어 렌더(swiftshader) 의 fill-rate 한계** 로 정확히 진단했으나, 비활성 **기준** 을 `detect-gpu-tier.ts` 의 `tier-c` 로 잡았다. 그런데 `detect-gpu-tier.ts §분기 2` 의 tier-c 정의는 **"WebGPU 미지원 데스크톱 전부"** (소프트웨어 swiftshader + WebGL2 **하드웨어** 가속 무구분) 이다. 따라서:

- **WebGPU 미지원이지만 WebGL2 하드웨어 가속인 PC 크롬** (Firefox / 구 Safari / WebGPU·하드웨어가속 OFF Chrome 다수) 에서도 tier-c → **별이 사라짐**. 사용자 실측 — `?gpu=b` 강제 시 정상 표시 (원인 확정). qa "WebGL2 parity 별 보임" (Amendment 1 PR #742 qa) 과 모순 — 그 qa 환경이 곧 tier-c 인데 비활성이 그것을 막았다.
- WebGPU 는 비교적 최신 기능 — 미지원 실사용자 상당수가 **기본 진입에서 별 못 봄** → "기능이 없다" 오인. v0.35.0 production 가시성 회귀.

**Playwright 실측 (chromium.launch 플래그 차이 — CI 와 동일/하드웨어 비교):**

| 시나리오                                        | WebGPU | WebGL `UNMASKED_RENDERER_WEBGL`                                                                    | app `__gpuTier` | 별  |
| ----------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------- | --------------- | --- |
| **CI-default (fps/r1-guard 와 동일, 플래그 0)** | false  | `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)` | `c`             | ✕   |
| **WebGPU-enabled (`--enable-unsafe-webgpu`)**   | true   | `ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)`                           | `b`             | ○   |

**핵심 확정 사실**: (1) CI swiftshader 는 **WebGL2 경로** (WebGPU 미지원 = 분기 2) 이고 RENDERER 에 **`SwiftShader` 문자열이 확실히 포함** → software 감지가 CI 에서 결정적으로 true → fps 무회귀 유지 가능. (2) WebGPU adapterInfo 는 빈 객체 `{}` (Chrome privacy) → WebGPU 경로 software 감지 신뢰 낮음, **WebGL UNMASKED 가 주(primary) 신뢰 소스**.

### 결정

별 비활성 기준을 **"WebGPU 미지원 (tier-c)" → "소프트웨어 렌더 (swiftshader/llvmpipe/swrast/...)"** 로 정정한다.

- **신규 순수 함수** `detectSoftwareRenderer(rendererString): boolean` (`apps/web/src/core/detect-software-renderer.ts`) — 보수적 패턴 `/swiftshader|llvmpipe|microsoft basic render|software rasterizer|apple software renderer|swrast/i`. **확실한 software 패턴만 true, 불확실/빈 문자열이면 false (별 표시 = 보수적 — false positive 로 하드웨어에서 별 사라지는 것을 차단)**. `"software"` 단독 단어는 제외 (가상화 게스트 드라이버 false positive 위험 — agy Q2 수용).
- **별 비활성 조건**: `resolveStarfieldVisible(starsVisible, gpuTier !== 'c')` → `resolveStarfieldVisible(starsVisible, !isSoftwareRenderer)`. 시그니처를 `(starsVisible: boolean, allowStarfield: boolean)` 의미로 일반화 (gpuTier 결합 제거).
- **renderer 문자열 추출** (web 레이어, `sim-canvas.tsx`): WebGL `UNMASKED_RENDERER_WEBGL` **1차/주** (CI swiftshader 확실 감지 — 핵심 제약), WebGPU `adapterInfo.description` 보조 OR 결합 (빈 `{}` 라 신뢰 낮음). **임시 canvas** (`document.createElement` + `WEBGL_debug_renderer_info`) 로 추출 — 동기 + Babylon engine lifecycle 결합도 0 (agy Q3 수용). 실측상 임시 canvas 와 실 engine context 가 동일 SwiftShader 반환 확인.
- **`detect-gpu-tier` 무수정** — software 감지는 **별도 helper** (SRP — agy Q4 수용). tier 는 LOD 억제 등 기존 graceful degradation 유지, 별 비활성만 software 기준으로 격리. tier-c 의 다른 억제 (LOD low / 파티클 0 / post-proc OFF) 는 **불변** (별 배경만 software 기준으로 분리 — WebGL2 하드웨어 tier-c 는 별 표시하되 LOD 억제는 유지가 의도).

### 효과

- **PC 크롬 (WebGPU 미지원, WebGL2 하드웨어)**: RENDERER 에 SwiftShader 없음 → `isSoftwareRenderer=false` → **별 표시** (회귀 해소).
- **CI swiftshader** (항상 software): RENDERER `SwiftShader` → `isSoftwareRenderer=true` → 별 비활성 → **fps-baseline-guard / r1-guard 통과 유지** (가장 큰 위험 = 회귀 재발 차단).
- WebGPU tier-a/b (실 GPU): software 아님 → 별 표시 (Amendment 1 효과 보존).
- `?stars=off` / `?gpu=` override 보존 — `?gpu=` 는 tier 만 강제하므로 software 감지와 직교. (단 §재검토 조건: software 환경에서 `?gpu=b` 강제 시 별이 다시 켜지면 fps 위험 — 아래 위험 참조.)

### 위험

| 위험                                                        | 완화                                                                                                                                                                                                                                     |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CI software 미감지 → fps 회귀 재발** (가장 큰 위험)       | 실측 확정 — CI RENDERER 에 `SwiftShader` 문자열 확실 포함. `detect-software-renderer.test.ts` 가 정확한 CI 문자열 fixture 단언 + browser-verify 가 CI(software) 에서 별 비활성 assertion (agy Q5 수용 — `__starfieldVisible` 전역 노출). |
| **false positive — 하드웨어인데 software 오판 → 별 사라짐** | 보수적 정규식 (명시적 software 엔진 이름만, `"software"` 단독 제외). 하드웨어 RENDERER (Apple M1 Pro / NVIDIA RTX / Intel Iris) fixture 단언으로 false 확인.                                                                             |
| **`?gpu=b` 강제 시 software 환경에서 별 재활성 → fps 위험** | software 비활성은 `?gpu=` 와 직교 (별도 gate). 단 `?gpu=` 는 디버그 override 라 사용자 명시 의도 — software 환경 `?gpu=b` 는 드물고 의도적. 후속 분리 여지 (software gate 가 `?gpu=` override 보다 우선할지) — §재검토 조건.             |

### 회귀 가드

- 단위: `detect-software-renderer.test.ts` — CI swiftshader 정확 문자열 + 하드웨어 RENDERER (Apple/NVIDIA/Intel) + 빈 문자열/null fixture. `parse-stars-mode.test.ts` 의 `resolveStarfieldVisible` 단언을 boolean 시그니처로 갱신.
- browser-verify: `browser-verify-738-starfield.mjs` 에 software 환경 별 비활성 + 하드웨어 환경 별 표시 assertion 추가 (또는 `__starfieldVisible` / `__isSoftwareRenderer` 전역 노출 후 CI assertion).
- CI: fps-baseline-guard + r1-guard 가 software 미감지 시 재차단 (이미 항상 software 환경이라 자동 가드).

### §Amendment 2 교차검증 반영 사항

- **수행**: 2026-06-25, `cross_validate.sh architecture` (agy / Antigravity). outcome=`applied` (exit 0), plan_bypass=false, rollback_failed=false. 로그: `.claude/logs/cross-validate-architecture-20260625-234622.log`.
- **호출 전 Claude 편향 4종 셀프 체크**: 통과 — 낙관적 일정 (false negative/positive 위험 + CI 의존을 §위험에 명시) / 결합 간과 (WebGL UNMASKED + WebGPU adapterInfo 빈 객체 + CI swiftshader WebGL2 경로 결합을 agy 핵심 질문 1·5 에 명시 삽입) / 폐기 프레이밍 (Amendment 1 폐기 아님 — 진단 유지 + 기준만 정정) / 순수주의 (software 감지 보수적 — 확실한 패턴만, 과일반화 회피). **미통과 축 없음**.
- **합의 (즉시 반영)**: ① `detectSoftwareRenderer` 별도 helper 분리 = SRP 정합 (agy Q4) ② WebGL UNMASKED 1차/주 + WebGPU 보조 = 누락 위험 극히 낮음 — "WebGPU 가속이어도 동일 브라우저 WebGL 은 동일 software 백엔드 99%+ 일치" (agy Q1) ③ 임시 canvas 방식 = 동기 + 결합도 0 (agy Q3) ④ 보수적 정규식 + `"software"` 단독 제외 (agy Q2).
- **이견 수용**: ① **정규식에 `swrast` (Linux 소프트웨어 래스터라이저) + `apple software renderer` 추가** — 원안 `/swiftshader|llvmpipe|software|microsoft basic render/i`, agy 가 `"software"` 단독은 가상화 게스트 드라이버 false positive 위험 지적 + `swrast`/`apple software renderer` 누락 지적 → 수정안 `/swiftshader|llvmpipe|microsoft basic render|software rasterizer|apple software renderer|swrast/i` (수용 근거: 보수성 강화 + Linux/Apple software 경로 커버). ② **r1-guard/CI assertion 으로 fps 회귀 사전 차단** — `__starfieldVisible` / `__isSoftwareRenderer` 전역 노출 → browser-verify 가 software 환경 비활성 assertion (수용 근거: fps 테스트 회귀 전 로직 단계 조기 검출 — agy Q5).
- **Claude 재분석으로 기각 (맹목 수용 회피 — volt #51)**: ① **WebGPU `powerPreference: 'low-power'` / 가상 어댑터 비표준 플래그 탐색** — 기각 (과설계). agy 자신도 "WebGL 검사만으로 CI 및 실기 커버리지 충분" 이라 명시 → 비표준 플래그는 미사용 분기 부채. WebGL UNMASKED 단일 신뢰 소스로 충분 (실측 확정).
- **고유 발견 (후속 분리)**: 없음 — agy 발견은 모두 (a) 즉시 반영 (합의/이견 수용) 또는 (b) 기각 으로 처리. `?gpu=b` 강제 시 software 환경 별 재활성 fps 위험은 §위험 + §재검토 조건에 박제 (후속 이슈 분리는 발생 시 — 현재 드문 디버그 경로).

### §Amendment 2 재검토 조건

- **재검토 트리거**: (1) software 환경에서 `?gpu=b/a` 강제 시 별 재활성으로 fps 회귀가 사용자 실측되면 → software gate 를 `?gpu=` override 보다 우선시키는 정책 추가 (현재는 디버그 의도 존중). (2) WebGPU + software (미래 WebGPU swiftshader) 환경이 등장해 WebGL UNMASKED 만으로 미감지되면 → WebGPU adapterInfo.description software 패턴 보조 강화. (3) 신규 software 래스터라이저 (예: ARM software, 신규 가상화) RENDERER 가 패턴 누락이면 → fixture + 패턴 추가.
- **Concrete Prediction 재현**: developer 머지 후 `git diff --stat` 으로 core 변경 **0** (별 비활성은 web 레이어 전용 — `parse-stars-mode.ts` 시그니처 + `detect-software-renderer.ts` 신규 + `sim-canvas.tsx` 배선) 검증. **core 0 예측** (Amendment 1 도 web 레이어 결정이었으므로 정합).

---

## §교차검증 반영 사항

- **수행**: 2026-06-24, `cross_validate.sh architecture` (agy / Antigravity). outcome=`applied` (exit 0), plan_bypass=false, rollback_failed=false. 로그: `.claude/logs/cross-validate-architecture-20260624-203521.log`.
- **호출 전 Claude 편향 4종 셀프 체크**: 통과 — 낙관적 일정 (shader authoring + WebGPU parity + fps 튜닝 비용을 §6 위험 + 본 ADR §3 라인 예측에 명시 박제) / 결합 간과 (log-depth·infiniteDistance·WebGPU parity·picking·LOD·라이팅 6개 결합을 §6 + 결정 6 전수) / 폐기 프레이밍 (해당 없음 — 신규 레이어, 폐기 0) / 순수주의 (실측 catalog·strategy pattern 을 비-범위 후속 분리로 처리, 과설계 회피). **미통과 축 없음** — 단 결합 간과·방식 선택 축을 agy 호출 프롬프트에 명시 질문으로 삽입 (ADR §6 위험에 동일 결합 명시).

### 합의 (Claude 설계와 일치 — 즉시 반영됨)

1. **결정 1-(A) `infiniteDistance` + 절차 ShaderMaterial 채택 타당** — agy "매우 타당함". WebGPU PCS pointSize 무효 사전 차단 + floating-origin 프레임별 리스너/연산 0 (엔진 레벨 처리) 호평. 본 ADR 핵심 근거 재확인.
2. **셀 기반 hash 별 + 은하수 단일 draw call 합성 타당** — agy "타당함". CPU-GPU 오버헤드 최소화 재확인.
3. **measurement-first + 가드 PR DoD 4축 적용** — agy "아키텍처 관점 매우 안심". §4 검증 계획 유지.

### 이견 수용 (외부 모델 근거가 합리적 → 원안 수정)

1. **depth 정합 방식: `gl_FragDepth` 최대 기록 → `renderingGroupId=0` + depth write off (supersede)**
   - 원안 (§결정 1 / §6): `ring-shader.ts` 답습해 fragment 에서 `gl_FragDepth` 최대치 기록.
   - 수정: agy 고유 발견 — `gl_FragDepth` 수동 쓰기는 **Early-Z 최적화 비활성** → fragment 비용 상승. starfield 는 항상 최배경이므로 render order (background queue) 로 더 단순·빠르게 해결. **수용 근거**: ring 은 다른 불투명체와 섞여 `gl_FragDepth` 가 필요했지만 starfield 는 항상 최배경 = render order 만으로 충분. fps DoD 직접 이득.
2. **`createStarfield` 반환 타입을 명시 `StarfieldHandles` 인터페이스로**
   - 원안: "dispose 핸들 반환" (타입 모호).
   - 수정: `{ mesh; material; dispose }` 명시 인터페이스. **수용 근거**: `RingShaderHandles`/`AsteroidBeltHandles` repo 관습 정합 + ShaderMaterial GPU 자원 누수 차단 (scene dispose 시 명시 해제).
3. **resize/aspect ratio 왜곡 — `view direction` 기반 확정으로 설계상 해소**
   - 원안: "sphere UV (또는 view direction)" 모호.
   - 수정: `view direction` (카메라 ray) 기반 확정. **수용 근거**: view direction 은 projection 반영 → aspect uniform 보정 불필요. agy 의 "aspect uniform 추가" 제안보다 더 단순한 해법 (uniform 추가 0).

### Claude 재분석으로 기각한 외부 모델 제안 (맹목 수용 회피 — volt #51)

1. **URL 파라미터 DoS clamping** — 기각 (현재 범위). agy 는 `?stars=<숫자>` → 셰이더 uniform DoS 우려. 그러나 본 설계 URL 은 `on/off` boolean 만 (숫자 uniform 노출 0). 현 범위 비해당. **단** 향후 `?stars=quality` 등 숫자 파라미터 추가 시 clamping 의무 — §확장 가드 노트로만 박제.
2. **`quality?: 'high'|'medium'|'low'` 3단 품질 경로 사전 구현** — 부분 기각 (YAGNI). 옵션 **타입은 확장 가능하게** 열어두되 (`starfield?: boolean` → 향후 객체 수용 여지), 실제 3 품질 경로는 **fps 실측이 필요하다 증명한 만큼만** 구현. 근거: fps 무회귀가 기본값으로 달성되면 3 경로 사전 구축은 미사용 분기 부채 (measurement-first + 순수주의 가드).
3. **catalog 확장 strategy pattern 사전 도입** — 기각 (과설계). 실측 star catalog 는 비-범위 후속 트랙 (감상 미학과 직교). 지연된 트랙용 추상화를 지금 구축하는 것은 YAGNI. `infiniteDistance` sphere 외벽 재사용 여지만 §8 재검토 조건으로 박제 (구조 여지는 자연 확보, 추상화 레이어는 후속).
4. **VR/XR stereoscopic 고려** — 기각 (범위 밖). 프로젝트 WebXR 미지원. 후속 트랙 노트로만 박제.

### 고유 발견 (후속 분리)

- 없음 — agy 발견은 모두 (a) 현재 PR 즉시 반영 (이견 수용 1~3) 또는 (b) 범위 밖 기각 (위 1~4) 으로 처리. 별도 후속 이슈 분리 대상 없음. (비-범위 실측 catalog / 패럴랙스 / 런타임 토글 UI 는 본 ADR §6 후속 분리 후보에 이미 박제 — agy 도 "현재 스프린트 필수 포함 항목 없음" 동의.)
