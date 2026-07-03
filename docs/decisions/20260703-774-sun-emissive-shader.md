# ADR 20260703-774 — 태양 emissive 절차 표면 셰이더 (granulation / limb darkening / 색온도 그라데이션)

- **상태**: Accepted (cross-validate 2026-07-03)
- **날짜**: 2026-07-03
- **결정자**: architect (sub-agent), 이슈 [#774](https://github.com/coseo12/astro-simulator/issues/774)
- **관련**: #756 (절차적 행성 표면 셰이더 — 본 ADR 의 직접 선행), #782 (self-rotation + 광원 world normal 옵션 e), #675 (glow pixel marker), #738 (starfield)

## 배경

#756 이 절차적 행성 표면 셰이더 (rocky/desert/gas-bands/cratered 4종) 를 도입했으나 태양은 의도적으로 범위 밖이었다 (`SURFACE_TYPE_BY_BODY` 미등록 → 자동 단색). 현재 태양은 `createBodyMesh` 의 star 분기에서 `mat.emissiveColor = colorHint.hex; mat.disableLighting = true` — **단색 발광 disk** 로만 렌더된다. 사용자 관찰 (2026-06-30, #774): "태양의 사실적 표현이 가장 핵심일 수 있으나 적용되지 않음" — granulation (쌀알 무늬) / limb darkening (주연 감광) / 색온도 그라데이션 전부 0.

태양이 #756 셰이더를 재사용할 수 없는 근본 이유: **광원 모델이 정반대다**. #756 fragment 는 "외부 광원 (PointLight+HemisphericLight) 재현 명암 (`shade`) × 절차 변조" 구조인데, 태양은 self-luminous 라 외부광 명암이 무의미하다 (태양 자신이 그 PointLight 의 광원). 필요한 것은 **emissive 전용** 절차 셰이더 — `gl_FragColor` 가 곧 발광색이며, 명암 대신 **limb darkening** (시선각 μ = dot(N, viewDir) 기반 주연 감광 — 광구 깊이별 온도 차의 시각 결과) 이 사실감의 핵심이다.

## 후보 비교

### 결정 1 — 모듈 구조: 별도 `sun-shader.ts` vs `SurfaceType.Star` 추가 (이슈 설계 고려 1)

| 축                       | A. `SurfaceType.Star = 4` 를 `procedural-planet-shader.ts` 에 추가                                                                      | B. 신규 `sun-shader.ts` (독립 모듈, 4번째 절차 셰이더)                                                                                                              | C. `procedural-planet-shader.ts` 내 별도 star ShaderMaterial (동일 파일 2 셰이더) |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 광원 모델 정합           | ✗ 기존 fragment 말미 `col *= shade` (외부광 곱) 를 star 분기만 우회하는 특수화 — "광원 적용 여부" 라는 직교 관심사가 4 타입 계약에 혼입 | ✓ emissive 전용 fragment — 외부광 uniform 자체가 없음 (uSunDirection/ambient 4종/land 3종 등 9+ uniform 무의미 제거)                                                | ✓ 셰이더는 분리되나                                                               |
| uniform 표면             | ✗ 태양에 무의미한 광원 uniform 9종 + 유의미한 신규 uniform (cameraPosition/limb 상수) 이 한 셰이더에 동거                               | ✓ 각 셰이더가 자기 uniform 만 소유                                                                                                                                  | △ 파일 비대 (이미 824줄)                                                          |
| viewDir (limb darkening) | ✗ 기존 4 타입은 viewDir 불필요 — star 만 위해 varying/uniform 추가                                                                      | ✓ vWorldPos varying + cameraPosition uniform 을 sun 셰이더만 소유                                                                                                   | ✓ 동일                                                                            |
| #756 무회귀              | ✗ 기존 셰이더 소스 수정 → planet 4종 재검증 필요                                                                                        | ✓ **`procedural-planet-shader.ts` 변경 0** — planet 4종 픽셀 불변 구조 보장                                                                                         | ✗ 파일 수정 발생                                                                  |
| 모듈 구조 정합           | ✗                                                                                                                                       | ✓ ring/starfield/procedural-planet 과 동형 "1 모듈 = 1 셰이더군" (#756 결정 1 의 "ring 과 표면은 책임 다름" 논리 재적용 — 반사광 표면 vs 자체발광 표면은 책임 다름) | △                                                                                 |
| 단위 테스트              | △ 미러 함수에 star 분기 혼입                                                                                                            | ✓ 독립 `sun-shader.test.ts` (sunColorMirror)                                                                                                                        | △                                                                                 |

→ **B 채택**. 신규 `packages/core/src/scene/sun-shader.ts`. ring/starfield/procedural-planet 의 모듈 구조 (ShaderMaterial 팩토리 + GLSL 미러 + 상수 SSoT re-export + ShadersStore 1회 등록) 를 답습한다. `SURFACE_TYPE_BY_BODY` 에 sun 을 **등록하지 않는다** — 테이블은 "외부광 반사 표면" 전용으로 유지 (#756 결정 2 의 의미 보존). 호출부 (`createBodyMesh`/`createBodyMeshMid`) 의 기존 star 분기가 `surfaceDetail=true` 일 때 `createSunSurfaceMaterial` 을 호출한다.

### 결정 2 — 표면 효과 범위: granulation + limb darkening + 색온도 (sunspot/코로나 제외)

| 효과                                            | 1차 포함  | 근거                                                                                                                                                                                                                                                                         |
| ----------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| granulation (쌀알 무늬)                         | ✓         | fbm 고주파 변조 (starfield/planet 미러 재사용) — 이슈 핵심 요구. DoD 라플라시안 엔트로피로 측정 가능                                                                                                                                                                         |
| limb darkening (주연 감광)                      | ✓         | μ = dot(N, viewDir) 기반 — 태양 사실감의 최대 기여 요소. 물리 근사 `I(μ) = 1 − u(1 − μ)` (Eddington 근사)                                                                                                                                                                    |
| 색온도 그라데이션 (중심 흰노랑 → 가장자리 주황) | ✓         | **별도 색 mix 가 아닌 채널별 limb darkening 계수로 자동 도출** — 실제 물리에서 u 는 파장 함수 (blue 가 더 어두워짐: u_B > u_G > u_R). `LIMB_DARKENING_U_RGB ≈ [0.5, 0.6, 0.9]` (Allen's Astrophysical Quantities 근사) 하나로 감광 + 붉어짐 동시 달성. 상수 1묶음 = 효과 2개 |
| sunspot (흑점)                                  | ✗ 후속    | 이슈 명시 "선택". 저주파 어두운 패치는 granulation 과 시각 혼동 → DoD 측정 기준 (엔트로피/휘도 프로파일) 오염. §재검토 조건 2                                                                                                                                                |
| 시간 변동 granulation                           | ✗ 후속    | (a) #782 규약 — jd 를 float32 uniform 으로 넘기면 하위 비트 손실 jitter (금지, cross-validate Q3 박제). (b) 시간 변동 픽셀은 r1-guard / browser-verify 의 **결정적 스크린샷 비교를 비결정화** — 검증 인프라 정합이 우선. §재검토 조건 3                                      |
| 코로나 / 플레어                                 | ✗ 비-범위 | 이슈 명시 권장 — disk 밖 효과는 별도 빌보드/glow 레이어 (mesh fragment 로 불가). 후속 이슈 분리 대상                                                                                                                                                                         |

### 결정 3 — 자전 / painted-on (이슈 "설계 고려" — #782 정합)

**실측**: `solar-system.json` 의 sun 레코드에 `rotationPeriodHours` **없음** (2026-07-03 확인 — major 9 행성 + moon 만 보유). 즉 sun 은 #782 self-rotation **비대상** 이며 `rotationStates` 에 포함되지 않는다 (mesh rotationQuaternion identity).

| 축          | A. sun 에 `rotationPeriodHours` 추가 (Carrington ~609h) + granulation 자전 추종                                                                                                                             | B. 데이터 불변 — granulation 은 painted-on 정적                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 물리 사실성 | △ 실제 태양은 **차등 자전** (적도 25일 / 극 35일) — 강체 자전 데이터 1개는 이미 근사 왜곡. 게다가 실제 granule 수명은 ~10분 — 자전 추종 자체가 물리적으로 무의미 (자전 1회전 동안 granule 은 3500세대 교체) | ✓ 정적 패턴도 물리 대비 왜곡 정도는 동급 (rendering-only 근사)                          |
| 데이터 SSoT | ✗ 데이터 파일 수정 — "데이터 0" 예측 파괴                                                                                                                                                                   | ✓ **데이터 0** 유지                                                                     |
| 검증        | ✗ 자전 픽셀 변동 — 스크린샷 결정성 훼손                                                                                                                                                                     | ✓ 결정적                                                                                |
| #782 규약   | 강체 근사 값 논쟁 (적도? Carrington?)                                                                                                                                                                       | ✓ 비대상 경계가 데이터 부재로 자동 표현 (#756 "테이블 미등록 = 자동 단색" 과 동형 원리) |

→ **B 채택**. granulation 은 **painted-on 정적** (vLocalPos 기반 — #782 규약의 vLocalPos local 유지 원칙 그대로). 단 **vNormal 은 #782 옵션 e 규약대로 world 변환을 답습한다** — sun 은 현재 회전 identity 지만 (i) limb darkening 의 viewDir(world) 와 dot 정합에 world normal 이 필요하고 (tier scaling 은 uniform scale 이라 normalize 로 해소), (ii) 미래 sun 자전 데이터 추가 시 셰이더 무수정 안전. 태양 차등 자전의 사실적 표현은 §재검토 조건 4.

### 결정 4 — emissive 메커니즘: `disableLighting` 대응 (이슈 설계 고려 3)

`ShaderMaterial` 에는 `StandardMaterial.disableLighting` 개념 자체가 없다 — **씬 광원을 명시적으로 uniform 배선하지 않는 한 fragment 출력이 곧 최종색** 이다. 따라서 "emissive 전용" 은 별도 플래그가 아니라 **광원 uniform 을 선언하지 않는 것** 으로 자동 달성된다 (#756 planet 셰이더가 광원을 재현하려고 9 uniform 을 _일부러_ 주입한 것의 정확한 역방향). 태양 중심의 PointLight (`sun-light`) 는 sun mesh 내부에 있지만 ShaderMaterial 이 이를 참조하지 않으므로 간섭 0.

- `gl_FragColor = vec4(baseColor × granulation × limbDarkening, 1.0)` — 알파 1 고정 (OPAQUE, 기존 star StandardMaterial 과 동일 블렌딩 특성 → 렌더 순서/투명도 정렬 무회귀)
- `?surface=off` 시 기존 star 분기 (emissiveColor + disableLighting) 100% 복귀 — #756 결정 4 의 생성 시점 분기 메커니즘 재사용 (`surfaceDetail=false` → 셰이더 미생성)

### 결정 5 — glow-marker / 줌아웃 정합 (이슈 설계 고려 2)

**구조적 자동 보장** — 코드 변경 0. 근거 체인:

1. sun 표면 셰이더는 **high/mid variant 에만** 적용 (#756 결정 3 동형 — 아래 결정 6)
2. glow marker 는 `resolveGlowMarker` 판정상 `nextLevel === 'low'` (billboard) 에서만 발동 (`glow-marker.ts` L131)
3. low variant (`createBodyBillboard`) 의 star 분기 (full emissive StandardMaterial + alpha mask) 는 **본 ADR 이 건드리지 않는다**
4. `resolveGlowMarkerRestoreEmissiveScale('star') = 1` 원복도 low variant material 에만 작용 — high/mid ShaderMaterial 과 무관

∴ 줌아웃 → LOD low 진입 → billboard 전환 → glow marker 발동의 전 경로가 현행과 동일 코드 (sun 포함 27 body 전수 계약 유지, `glowMarker` scene 옵션 주석 L409). DoD 5 가 이를 실측 재확인한다.

### 결정 6 — LOD / tier 적용 범위

#756 결정 3 을 그대로 답습 (동형이라 표만 요약):

| variant                        | 적용                           | 근거                                                                            |
| ------------------------------ | ------------------------------ | ------------------------------------------------------------------------------- |
| high (seg=32)                  | ✓ sun 셰이더                   | focus=sun 근접 관찰 대상                                                        |
| mid (seg=12)                   | ✓ 동일 셰이더 공유             | LOD 전환 표면 연속성 (팝핑 0 — #756 qa "구조적 불가" 실증 선례)                 |
| low (billboard)                | ✗ 현행 star full emissive 유지 | glow-marker 정합 (결정 5) + sub-pixel 에서 무의미                               |
| tier-c (`forceOverride:'low'`) | ✗ 자동 단색                    | 전 body low 강제 → 셰이더 자동 미진입 (swiftshader fill-rate 보호, 별도 코드 0) |

**fill-rate 주의** (이슈 DoD 명시): 태양은 `?focus=sun` 에서 화면 대면적 점유 — fragment 비용이 planet 대비 큰 화면 배수로 곱해진다. 예산 근거: fbm 3-옥타브 + limb darkening (dot 1회 + 채널별 1차식) 은 #756 planet fragment (fbm 3-옥타브 + 광원 모델 + 분기 4종) **이하** 비용이고, planet 은 earth focus 대면적에서 fps-baseline-guard PASS 실증. tier-c 는 구조 차단. → 1차 상수 예산으로 수용, 회귀 시 §재검토 조건 1 (detailLevel 약화 훅 — #756 과 동일한 YAGNI 예약).

### 결정 7 — log-depth 정합 (이슈 설계 고려 4)

ring-shader (#641 D-T2 fix) → planet-shader (#756 핵심 위험 1) 로 2회 실증된 패턴 그대로 복제: vertex 에서 `vFragmentDepth = 1.0 + clip.w`, fragment 에서 `gl_FragDepth = log2(max(vFragmentDepth, 1e-6)) × logDepthConstant × 0.5`, `logDepthConstant = 2 / log2(maxZ + 1)` (camera maxZ=1e14, 부재 시 fallback). 누락 시 태양이 수성/금성 통과 시 항상 위로 그려지는 가림 버그 — 단위 테스트가 GLSL 소스에 `gl_FragDepth` 존재를 정적 계약으로 가드.

### 결정 8 — 상수 SSoT (rendering-only 미학 상수)

`sun-shader.ts` 가 SSoT 소유 (starfield/planet 패턴 — export + 단위 테스트 가드). 물리 근사 출발값 (measurement-first 로 시각 튜닝 후 최종 박제 — developer 실측 재량):

| 상수                   | 출발값            | 근거                                                                                                                   |
| ---------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `LIMB_DARKENING_U_RGB` | `[0.5, 0.6, 0.9]` | 태양 가시광 limb darkening 계수 u(λ) 근사 (700nm ~0.5 / 550nm ~0.6 / 400nm ~0.85–0.9) — 감광 + 가장자리 주황 동시 달성 |
| `GRANULATION_SCALE`    | ~48               | fbm 입력 배율 — 쌀알 크기 (화면 실측 튜닝 대상)                                                                        |
| `GRANULATION_CONTRAST` | ~0.12             | 변조 진폭 — 실제 granule 명암 대비는 낮음 (base 색 보존 우선, #756 상수 철학 동형)                                     |

`baseColor` 는 `colorHint.hex` (#FFE9A8) read-only uniform — 데이터 SSoT 불변 (#756 결정 5 동형). viewDir 용 `cameraPosition` 은 Babylon ShaderMaterial 표준 auto-bind uniform (uniforms 배열 선언 시 bind 단계에서 `scene.activeCamera.globalPosition` 자동 설정) — developer 가 dev 빌드에서 배선 실측 확인, 미동작 시 onBind 갱신 폴백 (planet uSunDirection 패턴).

---

## 결정 (요약)

1. **모듈** — 신규 `packages/core/src/scene/sun-shader.ts` (emissive 전용, ring/starfield/planet 답습 4번째 절차 셰이더). `SURFACE_TYPE_BY_BODY` 에 sun **미등록 유지** — `procedural-planet-shader.ts` 변경 0.
2. **효과 범위** — granulation (fbm, painted-on 정적) + limb darkening + 색온도 그라데이션 (채널별 u 계수로 자동 도출). sunspot / 시간 변동 / 코로나는 후속.
3. **자전** — sun `rotationPeriodHours` 데이터 부재 유지 (자전 비대상, 데이터 0). vNormal 은 #782 옵션 e (world normal) 규약 답습, vLocalPos 는 local (painted-on).
4. **emissive 메커니즘** — ShaderMaterial 은 광원 uniform 미선언으로 자동 무광 — fragment 출력 = 발광색. 알파 1 (OPAQUE).
5. **glow-marker 정합** — low variant 불변으로 구조적 자동 보장 (변경 0). DoD 실측 재확인.
6. **LOD/tier** — high/mid 공유, low + tier-c 자동 단색 (#756 결정 3 동형).
7. **log-depth** — ring/planet 2회 실증 패턴 복제 (`gl_FragDepth` 로그 공간 기록).
8. **`?surface=off` 재사용** — 신규 URL 파라미터 0. OFF = 현행 star 단색 emissive 100% 복귀.

---

## Visual Fidelity §의무 체크리스트 4항목 (principles.md §1)

- [x] **데이터 SSoT 보존 확인** — limb/granulation 상수는 `sun-shader.ts` 의 rendering-only 상수. `solar-system.json` 직접 수정 0 (`rotationPeriodHours` sun 미추가 포함). base color 는 기존 `colorHint.hex` read-only uniform.
- [x] **rendering 시점 분리** — physics 엔진 (Rust+wasm) 은 sun 셰이더에 의존 0. 표면 효과는 `packages/core/src/scene` 레이어 단독 — P11-A 좌표 계약 위반 0.
- [x] **사용자 D-T2 가이드** — granulation/limb darkening 은 순수 시각 표현 (물리 근사 왜곡). Info/focus 패널은 여전히 실측값 (반경 km / temperatureK 5778 / colorSource) 표기 — 표기 대상 변경 0.
- [x] **점유율 / 사실 비율 baseline 박제** — mesh diameter 식 불변 (머티리얼만 교체) → px diameter / 점유율 / bodyScale 단조성 (#762) 에 영향 0. r1-guard baseline 은 태양 표면 픽셀 변경분만 재생성 가능성 (qa 실측 판정).

---

## Concrete Prediction (구현 후 `git diff --stat` 실측 재현)

| 영역                 | 파일                                       | 예측 라인 (신규/변경) | 근거                                                                                                                                                     |
| -------------------- | ------------------------------------------ | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **core 셰이더 신설** | `sun-shader.ts` (신규)                     | ~220–320 신규         | planet (824줄) 대비 소형 — 표면 타입 1, 광원 모델 0, land/ambient uniform 0. GLSL (vertex+fragment) + 팩토리 + 상수 3묶음 + JS 미러                      |
| **core 배선**        | `solar-system-scene.ts`                    | ~10–25 변경           | `createBodyMesh`/`createBodyMeshMid` star 분기 2곳에서 `surfaceDetail` 시 `createSunSurfaceMaterial` 호출 + import 1줄. LOD pass / tier / picking 무변경 |
| **단위 테스트**      | `sun-shader.test.ts` (신규)                | ~100–170 신규         | 미러 결정성 / limb 단조성 / warm 색역 / 상수 SSoT / GLSL 정적 계약                                                                                       |
| **planet 셰이더**    | `procedural-planet-shader.ts`              | **0**                 | sun 미등록 유지 (결정 1). 예측 실패 시 = 관심사 혼입 신호                                                                                                |
| **web 레이어**       | `parse-surface-mode.ts` / `sim-canvas.tsx` | **0**                 | `?surface=off` 플래그 재사용 (결정 8). `surfaceDetail` 옵션이 이미 scene 에 도달                                                                         |
| **데이터**           | `solar-system.json`                        | **0**                 | 자전 비대상 유지 (결정 3). 예측 실패 시 = SSoT 누수 신호                                                                                                 |

**핵심 예측** (reviewer/qa 실측 대상):

- **web 0 / 데이터 0 / planet 셰이더 0** — 신규 효과가 core scene 레이어 2 파일 (신규 1 + 배선 1) 로 수렴.
- **무침범 모듈**: picking (#713 bodyId metadata 는 mesh 에 있고 불변) / camera / orbit / tier-transition / LOD pass / `glow-marker.ts` / `createBodyBillboard` — 변경 0.
- 예측 초과 시 = sun 셰이더가 LOD/광원 레이어를 침범 (재검토).

---

## DoD (측정 가능 — 실 Chrome GUI 필수, CRITICAL #3 + WebGPU readback 금지 #756/#728 교훈)

| #   | 기준                                                                                                                                                                              | 측정 방법                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | granulation 실재: 태양 disk 라플라시안 고주파 엔트로피 **ON > OFF**                                                                                                               | `?focus=sun` vs `?focus=sun&surface=off` — Playwright composited screenshot + pngjs (#756 qa 방법론. WebGPU canvas drawImage readback = 빈 버퍼 금지) |
| 2   | limb darkening: disk 반경 방향 Rec.709 휘도 프로파일 **단조 감소** + 가장자리 (r≈0.9R) / 중심 휘도비 **< 0.85**                                                                   | 스크린샷 disk 중심→가장자리 radial 샘플링                                                                                                             |
| 3   | 색온도: 가장자리 B/R 채널비 **< 중심 B/R 채널비** (가장자리가 더 주황)                                                                                                            | 동일 radial 샘플링의 채널비 비교                                                                                                                      |
| 4   | `?surface=off` 복귀: 태양 disk 픽셀 분산 ≈ 단색 수준 (현행 동일) + planet 4종 OFF 동작 유지                                                                                       | OFF 스크린샷 disk 내부 stddev 비교                                                                                                                    |
| 5   | glow-marker 무회귀: 대줌아웃에서 sun glow marker 발동 유지 + 줌아웃 연속 경로에서 LOD mid→low 전환 경계 급변 (팝핑) 관찰 (cross-validate Q1 부분 수용)                            | 기존 `browser-verify-glow-marker.mjs` 시나리오 PASS + 전환 경계 연속 캡처 관찰                                                                        |
| 6   | fps 회귀 0: fps-baseline-guard PASS (CI swiftshader tier-c 포함) — `?focus=sun` 대면적 fill-rate                                                                                  | CI workflow                                                                                                                                           |
| 7   | 단위 테스트: 미러 결정성 / limb 단조성 (μ↓ ⇒ 휘도↓) / warm 색역 (R ≥ B 유지 — 보라·마젠타 부재) / 상수 SSoT / GLSL 정적 계약 (if-else only·`gl_FragDepth` 존재·world normal 배선) | `sun-shader.test.ts`                                                                                                                                  |
| 8   | 무회귀: 26 body (planet 셰이더 4 + 단색 22) 픽셀 불변 + `pnpm --filter core typecheck` 0 (#719) + r1-guard                                                                        | 기존 가드 전수                                                                                                                                        |
| 9   | 자전 비대상 유지: `rotationStates` 에 sun 미포함 (데이터 부재로 자동)                                                                                                             | 기존 #782 단위 테스트 무회귀                                                                                                                          |

---

## 결과 · 재검토 조건

**기대 결과**: `?focus=sun` 에서 granulation + limb darkening + 색온도 그라데이션의 사실적 태양 (실 Chrome GUI). 나머지 26 body + ring + starfield + glow-marker 무회귀. `?surface=off` 로 100% 현행 복귀.

**수용한 트레이드오프**: (a) granulation 정적 (시간 변동/자전 없음) — 검증 결정성 우선. (b) sunspot/코로나 미포함 — 범위 절제. (c) 강체 자전 데이터 미추가 — 차등 자전을 강체 근사로 왜곡 박제하는 것보다 부재가 정직.

**재검토 조건**:

1. **fps 회귀 발생** (focus=sun 대면적 fill-rate 초과) — detailLevel 약화 훅 측정 기반 도입 (#756 재검토 1 동형).
2. **sunspot 요구** — 저주파 fbm threshold 패치 추가 (상수 2개 + fragment ~5줄 예상). DoD 1/2 측정 기준과의 분리 방법 선행 설계.
3. **시간 변동 granulation 요구** — jd 직접 전달 금지 (#782 규약) 유지. wrap-around 소수 시간 uniform (engine 시간 mod 주기) 설계 + r1-guard/verify 결정성 대책 (surface=off 캡처 등) 동시 필요.
4. **태양 자전 사실 표현 요구** — 차등 자전 (위도별 각속도) 은 mesh 강체 회전으로 불가 — 셰이더 내 위도별 경도 offset 접근 검토. `rotationPeriodHours` 데이터 추가는 그때 재론.
5. **코로나/플레어** — 별도 빌보드/glow 레이어 후속 이슈 (mesh fragment 범위 밖).
6. **시각 튜닝 분리 요구** (cross-validate Q4) — 단일 `LIMB_DARKENING_U_RGB` 로 감광 프로파일과 색온도를 독립 조정할 수 없다는 요구가 실제 발생하면, 감광 지수 (exponent) 와 색 보간 (mix) 상수 분리로 전환 (fragment 수 줄 추가 예상).

---

## 교차검증 반영 사항 (agy, 2026-07-03 — 로그 `.claude/logs/cross-validate-architecture-774.log`)

**합의 (즉시 반영 또는 이미 반영됨)**:

1. **Q2 모듈 분리 지지** — 관심사 분리 / uniform 표면 분리 근거로 별도 `sun-shader.ts` 채택 타당 판정. 결정 1 유지.
2. **Q3 정적 granulation 단기 타당** — 스크린샷 검증 결정성 확보 평가. 장기 차등 자전은 "셰이더 내 위도별 경도 offset" 경량 GPU 접근 제안 — **재검토 조건 4 에 이미 동일 내용 박제됨** (맥락 보존 완료, 별도 이슈 불요. 발동 트리거: 사용자 요구).
3. **cameraPosition auto-bind 신뢰성** — 결정 8 의 developer 실측 확인 + onBind 폴백과 동일 지적 (합의 재확인).

**부분 수용**:

4. **Q1 glow-marker "변경 0 자동 보장" 단정 반박** — agy 는 mid(셰이더)→low(billboard) LOD 전환 경계 팝핑 위험 지적. 사실관계 재검증: (i) LOD cross-fade 는 존재하나 #756 에서 ShaderMaterial alpha 1.0 고정 + high·mid 동일 셰이더로 "구조적 비문제" 실증, (ii) mid→low 전환은 #756 이후 planet 도 동일 구조 (셰이더→billboard) 로 운영 중 무보고 — 전환 거리에서 disk 가 소면적이라 휘도 차 비가시. 단 **limb darkening 은 disk 평균 휘도를 낮추므로 sun 은 신규 휘도 스텝이 생기는 것이 사실** → 설계 변경 없이 **DoD 5 실측에 "줌아웃 연속 경로에서 LOD 전환 경계 급변 관찰" 을 포함** 하는 것으로 수용. 결정 5 의 "코드 변경 0" 은 유지 (marker 발동 로직 자체는 low 전용 사실 불변).

**기각 (오탐 — 근거 실측)**:

5. **머티리얼 dispose 수명주기 부재** — `surfaceDetail` 은 scene **생성 시점** 옵션 (기본 false, 런타임 토글 없음 — `?surface=off` 는 페이지 로드 시 적용). 머티리얼은 1회 생성 후 LOD 는 `isVisible` 토글만 (dispose/재생성 없음, `solar-system-scene.ts` L1805 주석 계약). 런타임 교체 시나리오 자체가 부재.
6. **Glow/HDR 톤매핑 에너지 정합 규약 부재** — 씬에 GlowLayer / 톤매퍼 / bloom 포스트 프로세싱 파이프라인이 **존재하지 않음** (grep 실측 — glow-marker 는 billboard 마커이며 포스트 프로세싱 아님). 전제 부재로 기각.
7. **근접 시 granulation 앨리어싱/모아레** — fbm 은 밴드리미티드 smooth noise 로 텍스처 샘플링 앨리어싱과 발생 기전이 다르고, #756 planet 4종이 동일 fbm 구조로 focus 근접 운영 중 무보고. 카메라 lowerRadiusLimit 이 근접 거리를 제한. qa DoD 1 근접 캡처에서 자연 관찰되므로 별도 대책 불요.

**이견 — 기각 (YAGNI, 재검토 경로 박제)**:

8. **Q4 감광 지수 / 색 mix 분리 설계** — agy 는 아티스트 튜닝 유연성을 위해 감광 커브 (exponent) 와 색 보간 (mix) 분리를 권장. 기각 근거: (i) 본 프로젝트는 1인 개발 + 사용자 D-T2 피드백 구조로 "아티스트 별도 튜닝 요구" 는 현재 가설적, (ii) 물리 근사 단일 상수는 감광·색이 실제 물리처럼 결합된 정직한 표현 + 상수 표면 최소, (iii) 분리가 필요해지면 fragment 수 줄 추가로 후속 가능. → **재검토 조건 6 신설** 로 경로 박제.

**Claude 편향 셀프 체크 결과**: 결합 간과 (주의 축이었던 glow-marker 단정) 는 agy 반박 → 사실 재검증 → DoD 관찰 보강으로 해소. 낙관적 일정 / 폐기 프레이밍 / 순수주의는 초안 판정 유지 (agy 도 반대 근거 미제시).

## 참고

- 이슈: [#774](https://github.com/coseo12/astro-simulator/issues/774) / 선행: [#756](https://github.com/coseo12/astro-simulator/issues/756), [#782](https://github.com/coseo12/astro-simulator/issues/782)
- 선행 ADR: [`20260628-756-procedural-planet-surface.md`](20260628-756-procedural-planet-surface.md) (결정 1–5 + Amendment 1–2), [`20260613-675-glow-pixel-marker.md`](20260613-675-glow-pixel-marker.md), [`20260624-738-procedural-starfield.md`](20260624-738-procedural-starfield.md)
- 횡단 원칙: [`docs/architecture/principles.md`](../architecture/principles.md) §1 Visual Fidelity
- limb darkening 물리 근거: Eddington 근사 `I(μ)/I(1) = 1 − u(1−μ)`, u(λ) 파장 의존 (Allen's Astrophysical Quantities)
