# #1226 D1 — 야간 도시 불빛 파라미터 후보 캡처

계약 D1 (사용자 육안 파라미터 승인) 의 비교 자료다. **승인은 사용자가 이슈 코멘트로 한다** — 이 폴더는 준비물이고 승인 기록이 아니다.

## 캡처 조건

- 실 Chrome GUI — Playwright `chromium.launch({ headless: false, channel: 'chrome' })` · 1280×720 · `deviceScaleFactor 1`
- 렌더러 **WebGPU** — 전 프레임 `scene.getEngine().isWebGPU === true` (`capture-meta.json`)
- `next dev` (로컬) · `packages/core` 는 `feature/1226-night-lights` 빌드
- 쿼리 `?gpu=a&focus=earth&lod=auto&rotate=off&orbits=off` + 변형 플래그 · JD `2451808.0` (U1) · `jumpToJulianDate` + `pause` · `waitForLodSettle`
- 확대는 **카메라 `fov × 0.4`** 로 한다. `radius` 를 바꾸면 tier 전이 · floating origin 이동이 비동기로 일어나 반경 단위가 바뀐다 (실측 — 1·2차 캡처가 이 이유로 무효였고 덮어썼다)
- 캡처 스크립트는 임시였고 커밋 전에 삭제했다 (volt #67). 위 레시피로 재현한다

## 변형 × 프레임

| 변형  | URL 플래그                                                   |
| ----- | ------------------------------------------------------------ |
| `off` | `&nightlights=off` (대조 — 불빛 없음)                        |
| `a`   | `&nightlightsCandidate=a` (기본 후보 — 플래그 없이 열어도 a) |
| `b`   | `&nightlightsCandidate=b`                                    |
| `c`   | `&nightlightsCandidate=c`                                    |
| `a1`  | `&nightlightsCandidate=a1` (2차)                             |
| `a2`  | `&nightlightsCandidate=a2` (2차)                             |
| `a3`  | `&nightlightsCandidate=a3` (2차)                             |
| `g1`  | `&nightlightsCandidate=g1` (3차)                             |
| `g2`  | `&nightlightsCandidate=g2` (3차)                             |
| `g3`  | `&nightlightsCandidate=g3` (3차)                             |

- 1차 (`off` · `a` · `b` · `c`) — 사용자 결정 2026-09-14 ([#1226 코멘트 `5662682559`](https://github.com/coseo12/astro-simulator/issues/1226#issuecomment-5662682559)) 에서 **전건 미승인** (육지 전면 발광). 파일은 비교 기준으로 보존한다
- 2차 (`a1` · `a2` · `a3`) — 같은 결정의 방향 「a 기반 밀도 하향」. 카메라 레시피는 1차와 동일하다 (`capture-meta.json` 에 병합)
- 2차 — 같은 날 결정 ([#1226 코멘트 `5663066189`](https://github.com/coseo12/astro-simulator/issues/1226#issuecomment-5663066189)) 에서 **미승인** (면적은 줄었으나 몰림 없음). 파일 보존
- 3차 (`g1` · `g2` · `g3`) — 방향 「군집화」. 카메라 레시피는 1·2차와 동일하다

| 프레임           | 시점                                                                                                  | 파일                          |
| ---------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------- |
| terminator       | `beta = π/2` (verify:1202 레시피 — 위상각 90°), 구름 ON                                               | `<변형>-terminator.png`       |
| night            | 반태양 방향에서 40° 올린 시점 (위상각 ≈ 140° — 정확한 반태양점은 태양 glow 가 화면을 덮는다), 구름 ON | `<변형>-night.png`            |
| night-clouds-off | 같은 시점, `&clouds=off`                                                                              | `<변형>-night-clouds-off.png` |

`night` ↔ `night-clouds-off` 를 나란히 보면 구름이 불빛을 덮는 영역이 보인다.

## 후보 파라미터 (`packages/core/src/scene/procedural-planet-shader.ts` `NIGHT_LIGHT_CANDIDATES`)

| id  | 분포                              | 주파수 K | lo / hi         | 대륙 변조 |  세기 | 색 (RGB)                         | 황혼 폭 W |
| --- | --------------------------------- | -------: | --------------- | --------: | ----: | -------------------------------- | --------: |
| a   | (d1) value noise 군집 — hash `+8` |     `48` | `0.55` / `0.72` |     `0.5` | `0.9` | `(1.00, 0.72, 0.38)` 나트륨 주황 |    `0.12` |
| b   | (d2) 셀 점 분포 — hash `+1`       |     `90` | `0.82` (임계)   |       `0` | `1.0` | `(1.00, 0.86, 0.62)` 황백        |    `0.25` |
| c   | (d1) value noise 군집 저밝기      |     `72` | `0.50` / `0.80` |     `0.8` | `0.6` | `(1.00, 0.80, 0.50)` 연주황      |    `0.25` |

2차 — a 의 분포 (d1) · 색 `(1.00, 0.72, 0.38)` · 황혼 폭 `0.12` · 세기 `0.9` · 대륙 변조 `0.5` 를 **그대로** 두고 임계 (lo/hi) 와 군집 크기 (K) 만 바꿨다. 세기는 조정하지 않았다.

| id  | 주파수 K | lo / hi         | 켜진 면적 `litRatio` (a 대비) | 밝은 면적 `brightRatio` (a 대비) | X (8-bit / 게이트) |
| --- | -------: | --------------- | ----------------------------- | -------------------------------- | -----------------: |
| a   |     `48` | `0.55` / `0.72` | `0.3901` (`1.00`)             | `0.2902` (`1.00`)                |            `33.74` |
| a1  |     `48` | `0.65` / `0.78` | `0.2193` (`0.56`)             | `0.1623` (`0.56`)                |            `18.81` |
| a2  |     `64` | `0.70` / `0.82` | `0.1601` (`0.41`)             | `0.1165` (`0.40`)                |            `13.13` |
| a3  |     `40` | `0.75` / `0.86` | `0.0838` (`0.21`)             | `0.0563` (`0.19`)                |             `5.95` |

면적 원자료 `../dev-phase1-d1r2-area-jd2451808.json` (headless swiftshader · JD `2451808.0` · 밤면 내부 육지 `NI_land 4104 px`).

3차 — a 의 분포 · K `48` · lo/hi `0.55`/`0.72` · 대륙 변조 `0.5` · 색 · 황혼 폭 · 세기를 **그대로** 두고 **군집 게이트** `smoothstep(clusterLo, clusterHi, continents)` 만 켰다. `continents` 는 rocky 분기에서 이미 계산된 `fbm(p * 2.4)` 라 noise 호출 증가 `0` (ADR §A11.5 「공통」 행). 1·2차 후보는 게이트 끔 (`clusterLo -2` · `clusterHi -1` → 정확히 `1.0`) 이라 픽셀이 바뀌지 않는다.

| id  | 군집 게이트 lo / hi | 켜진 면적 (a 대비) | 밝은 면적 (a 대비) |       X | 블록 CV | 불빛 없는 블록 비율 | 전구 셀 CV | 전구 불빛 없는 셀 비율 |
| --- | ------------------- | ------------------ | ------------------ | ------: | ------: | ------------------: | ---------: | ---------------------: |
| a   | 끔                  | `0.3901` (`1.00`)  | `0.2902` (`1.00`)  | `33.74` |  `0.21` |              `0.00` |     `0.74` |                 `0.29` |
| a1  | 끔                  | `0.2193` (`0.56`)  | `0.1623` (`0.56`)  | `18.81` |  `0.33` |              `0.00` |     `0.81` |                 `0.29` |
| a2  | 끔                  | `0.1601` (`0.41`)  | `0.1165` (`0.40`)  | `13.13` |  `0.30` |              `0.00` |     `0.83` |                 `0.29` |
| a3  | 끔                  | `0.0838` (`0.21`)  | `0.0563` (`0.19`)  |  `5.95` |  `0.58` |              `0.09` |     `0.96` |                 `0.33` |
| g1  | `0.52` / `0.60`     | `0.1596` (`0.41`)  | `0.1021` (`0.35`)  | `10.84` |  `1.04` |              `0.43` |     `1.21` |                 `0.47` |
| g2  | `0.58` / `0.64`     | `0.0755` (`0.19`)  | `0.0441` (`0.15`)  |  `4.70` |  `1.56` |              `0.48` |     `1.56` |                 `0.58` |
| g3  | `0.60` / `0.66`     | `0.0536` (`0.14`)  | `0.0300` (`0.10`)  |  `3.20` |  `1.97` |              `0.65` |     `1.73` |                 `0.62` |

- 픽셀 지표 (면적 · X · 블록): `../dev-phase1-d1r3-cluster-jd2451808.json` — headless swiftshader · JD `2451808.0` · `NI_land 4104 px`. 블록 = 화면 `16 px` 정사각 중 `NI_land ≥ 32 px` 인 `23` 개, 블록별 켜짐 비율의 CV · `< 1%` 비율. **유효 블록 23 개로 표본이 작다**
- 전구 지표: GLSL 미러 구면 30만 표본 × 육지 마스크 (≥ 0.5, 워프 무시) · 극관 억제 반영 · 위경도 10° 셀 중 육지 표본 ≥ 40 인 `304` 개. 불빛 없는 셀 기저 `0.29` 는 극관 억제 (그린란드 · 남극) 몫이다. 설계 스윕으로 쓴 값이며 캡처와 무관하다
- 이 결정적 프레임의 켜진 면적은 전구 예측 (g1 `0.19` · g2 `0.12` · g3 `0.10`, a `0.34` 대비 약 `0.56` · `0.36` · `0.30`) 보다 작다 — 화면에 보이는 반구의 `continents` 분포가 전구 평균보다 낮은 쪽이라서다 [추론]

전 후보 `max(color) × strength ≤ 1` (§A11.15 조건 2) · `K ≤ 98` (§A11.5 상한) — 단위 테스트 N1 이 assert 한다.

## 로컬에서 직접 보기

```text
pnpm --filter @astro-simulator/core build
pnpm --filter @astro-simulator/web dev
http://localhost:3000/?focus=earth&nightlightsCandidate=a
http://localhost:3000/?focus=earth&nightlightsCandidate=b
http://localhost:3000/?focus=earth&nightlightsCandidate=c
http://localhost:3000/?focus=earth&nightlightsCandidate=a1
http://localhost:3000/?focus=earth&nightlightsCandidate=a2
http://localhost:3000/?focus=earth&nightlightsCandidate=a3
http://localhost:3000/?focus=earth&nightlightsCandidate=g1
http://localhost:3000/?focus=earth&nightlightsCandidate=g2
http://localhost:3000/?focus=earth&nightlightsCandidate=g3
http://localhost:3000/?focus=earth&nightlights=off
```

자전 ON 이 기본이라 shimmer (§A11.5 · D13) 는 위 URL 에서 그대로 관찰된다. 결정적 프레임은 `&rotate=off` 를 붙인다.
