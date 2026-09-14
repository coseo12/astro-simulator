# #1226 야간 도시 불빛 — architect 실측 원자료

ADR [`20260628-756` Amendment 11](../../decisions/20260628-756-procedural-planet-surface.md) 의 「실측」 근거다. 측정 스크립트는 임시였고 커밋 전에 삭제했다 (volt #67). 재현은 아래 레시피로 한다.

## 공통 조건

- 로컬 headless chromium `--use-angle=swiftshader` · 1280×720 · `deviceScaleFactor 1`
- `packages/core` 를 develop tip `808b574` 에서 빌드 · `next dev`
- 결정적 프레임 = `verify:1202` 레시피 — `?gpu=a&focus=earth&lod=auto&rotate=off&orbits=off` · 2.8 s 대기 · `jumpToJulianDate` + `pause` · `beta = π/2` · `waitForLodSettle` (전 실행 `timedOut false`)
- 기하 표본 = `verify:1202` `measure()` 의 ray-sphere 역투영 (`ndl` · `ndv`). `NI` = `ndl ≤ −0.15` ∧ `ndv ≥ 0.6`, `DI` = `ndl ≥ 0.15` ∧ `ndv ≥ 0.6`
- 프로덕션 코드 `0` 줄. 지구 host · `earth-lod-*` 머티리얼에 `onBindObservable` 로 uniform 을 매 프레임 덮어쓴다

## 주입 레시피

| 이름         | 덮어쓰는 uniform                                                                                                                                                                                              | 셰이더 식상 결과                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 게이트 맵    | `sunIntensity 0` · `ambientIntensity 1` · `ambientGround = ambientSky = (1,1,1)` · `baseColor (0,0,0)` · `landColor = biomeTropicalColor = biomeTundraColor = (1,1,1)` · `iceColor (0,0,1)` · `rimStrength 0` | `R = landMask·(1−iceMask)` · `B − R = iceMask` |
| 구름 알파 맵 | 위 + `baseColor = iceColor = deepOceanFactor = (1,1,1)`, 구름 머티리얼 `cloudColor (0,0,0)`                                                                                                                   | `R = 255·(1−α)`                                |

## 파일

| 파일                                     | 내용                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `architect-probe-gate-lod-773-glow.json` | JD `2451626.0` 게이트 맵 대역 계수 (구름 OFF · ON) · `?focus=earth` 카메라 반경 스윕 (LOD level · `uMaskEnabled`) · `verify:773` earth 프레임의 반평면 × `ndl` 교차 계수 · glow-marker 40/100 AU 의 지구 LOD. ⚠️ `detCloudsOffReload.identicalToFirstLoad` 와 `cloudAttenuation` 은 1차 판본 값이다 — 앞의 것은 full-frame PNG base64 비교라 캔버스 위 DOM HUD 가 섞여 **판별력이 없고** (#1219 동형), 뒤의 것은 JD 한 점이다. 둘 다 아래 파일이 대체한다 |
| `architect-probe-clouds-jd.json`         | JD 4점 (`2451626.0` · `2451717.0` · `2451808.0` · `2451899.0`) 의 `NI` / `DI` 육지 · 구름 · 육지∩구름 표본 수와 게이트 가중 구름 감쇠 · 독립 2회 로드 disk 내부 (반경 ×1.05) 픽셀 결정성                                                                                                                                                                                                                                                                  |

## dev Phase 1 (2026-09-14) — 선행 실측 · D10 조기 경보 · D1 후보

측정 스크립트는 임시였고 커밋 전에 삭제했다 (volt #67). 재현은 아래 레시피로 한다.

| 파일                                     | 내용                                                                                                                                            |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `dev-phase1-premeasure-jd2451808.json`   | §A11.16 선행 실측 3건 + 후보별 X · 미리보기 (아래 레시피). 판정이 아니라 **관측**이다 — 임계는 D1 승인 뒤 도출                                  |
| `d10-early-warning/{before,after}-*.log` | `verify:773-light` · `verify:783-earth-detail` (`MODE=dod` · `ocean`) 원 출력. 전 = 분기 직후 `8a61508` core 빌드, 후 = 불빛 구현 (기본 후보 a) |
| `d1-candidates/`                         | D1 후보 비교 캡처 (실 Chrome GUI · WebGPU) — 그 폴더 README                                                                                     |

### 선행 실측 레시피 (`dev-phase1-premeasure-jd2451808.json`)

- 공통 조건은 위 §공통 조건과 같다 (headless chromium swiftshader · 1280×720 · `verify:1202` 결정적 프레임). JD `2451808.0` (U1). 전 페이지 `lodSettle.timedOut false` · 콘솔 에러 `0` · 카메라 위치 8 페이지 동일
- 페이지: P2 `&clouds=off&nightlights=off` · P4 `&nightlights=off` · 후보 c 마다 P1 `&clouds=off&nightlightsCandidate=c` · P3 `&nightlightsCandidate=c`
- 같은 P2 페이지에 주입해 찍은 맵 3종 — **G** 게이트 맵 (위 주입 레시피, `nightLightStrength 0` 추가) · **GA** 증폭 게이트 맵 (G 에서 `ambientIntensity 255`) · **L** 육지 맵 (GA 에서 `iceLatLo 5` · `iceLatHi 6` → `iceMask = 0`, `R > 0` ⇔ `landMask > 0`)
- `NI` / `DI` = `verify:1202` 기하 대역, `NI_land` = `NI` ∩ `GA.R > 0`, `NI_sea` = `NI` ∩ `GA.R == 0`
- 산출: (1) `NI_land` 평균 `lum709(P2) − lum709(P4)` (2) `NI` ∩ `L.R > 0` ∩ `G.B − G.R ≥ 254` 픽셀 수 (+ `≥ 128`, `NI` ∩ `L.R > 0` ∩ `GA.R == 0`, G/GA 의 `R == 0` 불일치) (3) 후보별 `X = Σ_NI (lum601(P1) − lum601(P2)) / Σ_NI (G.R / 255)` (8-bit) 와 §A11.12 식의 `773` 밤면 예측 `30.58 + 0.28642·X`

## dev D1 2차 (2026-09-14) — a 기반 밀도 하향

사용자 결정 ([#1226 코멘트 `5662682559`](https://github.com/coseo12/astro-simulator/issues/1226#issuecomment-5662682559)) — 1차 a/b/c 전건 미승인, a 의 분포 · 색 · 황혼 폭은 유지하고 켜지는 면적만 줄인 변형을 추가했다.

| 파일                                                   | 내용                                                                                                                                                                                                                                          |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dev-phase1-d1r2-area-jd2451808.json`                  | 후보 a · a1 · a2 · a3 의 켜진 게이트 면적 비율 (위 선행 실측 레시피의 P2 · P1 · G · GA 페이지 재사용). `litRatio` = `NI_land` 에서 불빛 ON/OFF 로 픽셀이 바뀐 비율, `brightRatio` = `lum709` 증가 `≥ 0.1` 비율 (진단용 기준 — 가드 임계 아님) |
| `d10-early-warning/after-{a1,a2,a3}-{773,783-dod}.log` | 변형별 `verify:773-light` · `verify:783-earth-detail` (`MODE=dod`) 원 출력. 가드는 URL 후보 파라미터를 받지 않으므로 측정 동안만 `NIGHT_LIGHT_DEFAULT_CANDIDATE` 를 변형으로 바꿔 core 를 빌드했다 (커밋된 기본값은 `a`)                      |
| `d1-candidates/a{1,2,3}-*.png`                         | 2차 캡처 (1차와 같은 레시피)                                                                                                                                                                                                                  |
