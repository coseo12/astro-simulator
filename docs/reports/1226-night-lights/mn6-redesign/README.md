# #1226 MN-6 재설계 — architect 실측 원자료 (2026-09-14)

ADR [`20260628-756` §A11.17](../../../decisions/20260628-756-procedural-planet-surface.md) 의 「실측」 근거다. 측정 스크립트는 임시였고 커밋 전에 삭제했다 (volt #67). 재현은 아래 레시피로 한다.

## 공통 조건

- 로컬 headless chromium `--use-angle=swiftshader` · 1280×720 · `deviceScaleFactor 1` · `isWebGPU false`
- `packages/core` = `feature/1226-night-lights` `3dfe672` 빌드 · `next dev` (포트 3100)
- 결정적 프레임 = `verify:1202` 레시피 — `?gpu=a&focus=earth&lod=auto&rotate=off&orbits=off` · 2.8 s 대기 · `jumpToJulianDate` `2451808.0` + `pause` · `beta = π/2` · `waitForLodSettle` (전 페이지 `timedOut false`, 분포 `7/6/19`)
- **DOM 전 요소 `visibility: hidden` · canvas 만 `visible`** (`addStyleTag`) — canvas 영역 캡처에 HUD 글리프가 섞이지 않게 한다 (#1219). 전 페이지 canvas 개수 `1` · 콘솔 에러 `0` · 카메라 · 중심 · 태양 · fov 페이지 간 동일 (`geomIdentical true`)
- 기하 표본 = `verify:1202` `measure()` 의 ray-sphere 역투영. `NI` = `ndl ≤ −0.15` ∧ `ndv ≥ 0.6`, `NI_land` = `NI` ∩ 증폭 게이트 맵 `R > 0` (§A11.10 · 상위 폴더 README 레시피)
- 휘도 = `lum709` (8-bit ÷ 255)

## 페이지와 프레임

| 이름 | 페이지 · 조작                                  | 용도                                                    |
| ---- | ---------------------------------------------- | ------------------------------------------------------- |
| P1   | `&clouds=off`                                  | 구름 OFF · 불빛 ON                                      |
| P2   | `&clouds=off&nightlights=off`                  | 구름 OFF · 불빛 OFF                                     |
| C1   | P2 + overlay (세기 = P3 host 값)               | 주입 유효성 V2 — overlay 가 불빛 항을 충실히 재현하는가 |
| GA   | P2 + 증폭 게이트 맵 주입                       | `NI_land` 정의                                          |
| WH   | P2 + 백색 표면 주입 (구름 알파 맵의 표면 부분) | 백색 표면 점검 (진단)                                   |
| P3   | 쿼리 그대로                                    | 구름 ON · 불빛 ON (건강판)                              |
| M6a  | P3 + `earth-cloud` `setEnabled(false)`         | 원안 MN-6 (§A11.10)                                     |
| P4   | `&nightlights=off`                             | 구름 ON · 불빛 OFF                                      |
| C0   | P4 + overlay (세기 `0`)                        | 주입 유효성 V1 — overlay 설치 자체의 부작용             |
| M6b  | P4 + overlay (세기 = P3 host 값)               | 채택안 MN-6 (P4 페이지 판본)                            |
| AM   | P4 + 백색 표면 + 구름 `cloudColor (0,0,0)`     | 구름 알파 맵 `R = 255·(1 − α)`                          |
| R3   | P3 독립 재로드                                 | 결정성 · 건강판 반복                                    |

**overlay** (채택안 주입 — ADR §A11.17.3 레시피): `host.clone(…, null, true)` 를 host 자식 · 항등 변환으로 붙이고, `host.material.clone` 에 `_options` 를 **복사해** `needAlphaBlending: true` · `alphaMode = 1` (`ALPHA_ADD`) 를 준다. `renderingGroupId = 1` + `scene.setRenderingAutoClearDepthStencil(1, false, false, false)`. `onBeforeRenderObservable` 에서 매 프레임 host 머티리얼의 `_floats` · `_ints` · `_vectors3` · `_colors3` · `_textures` 를 복사한 뒤 `sunIntensity 0` · `ambientIntensity 0` · `rimStrength 0` · `nightLightStrength <세기>` 로 덮어쓴다.

**D1 대리 변형**: `a` = 후보 a 그대로 · `a-d1` = 전 페이지 host 에 `nightLightLo 0.65` · `nightLightHi 0.80` 주입 · `a-d2` = `0.72` · `0.85`. 사용자 방향 「a 기반 밀도 하향」의 **대리**이며 dev 의 최종 파라미터가 아니다.

## 파일

| 파일                                                               | 내용                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mn6-probe-a.json` · `mn6-probe-a-d1.json` · `mn6-probe-a-d2.json` | 변형별 위 표 전 프레임의 집합별 (`NI` · `NI_land` · `NI_sea` · `NI_land_cloudedP4P2` · `NI_land_alpha` · `NI_land_lit_clouded`) 평균 기여 · 구름 자체 항 · `(1 − α)` 예측과 잔차 · 비 (건강판 · R3 · M6a · M6b) · 판정 예시 · 대조 V1/V2 · 결정성. `meta.fullFrame` 은 full frame 픽셀 비교 (`C0 ≠ P4` · `R3 ≠ P3` · `M6a ≠ P1`) |
| `mn6-probe-p3inject-a.json`                                        | 채택안을 **불빛 ON 페이지 (P3)** 에 거는 판본 — host `nightLightStrength 0` 주입 ↔ P4 (V3) · + overlay ↔ M6b (페이지 판본 동일성) · 주입 전 대비 변화 · 원복 ↔ 주입 전 (V4), 전부 full frame                                                                                                                                     |

## 판독 주의

- `K_example_baselineAttenuationDiv3` · `judge_*` 는 도출 규칙 (baseline 감쇠율 ÷ 3) 을 **같은 실행의 건강판**에 적용한 **예시**다. 임계 확정이 아니며, 건강판 PASS 는 이 구성에서 산술상 자명하다 — 판별력은 주입판 판정에서만 읽는다.
- `meta.pages.*.geom.hostLo` 는 주입 observer 가 첫 bind 를 돌기 **전에** 읽은 값이라 늦게 반영될 수 있다 (`a-d2` R3 가 `0.55` 로 찍힘). 픽셀로는 `a-d2` R3 ↔ P3 full frame `0 px` — 주입은 캡처 시점에 적용돼 있었다.
- `diskWhiteNot255 = 271` (백색 표면 점검에서 disk 전체 중 `R ≠ 255` 픽셀) 의 위치는 식별하지 않았다. `NI_land` 에서 건강판 기여와 `(1 − α)` 예측의 평균 잔차가 `≤ 2e-5` 라 판정 집합에는 영향이 없다고 본다 [도출].
- `niLandGateVsAlphaMismatch` = `NI_land` 에서 `α > 0` 과 `P4 ≠ P2` 가 갈리는 픽셀 수 (진단).
