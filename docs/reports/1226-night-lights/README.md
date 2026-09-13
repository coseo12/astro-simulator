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
