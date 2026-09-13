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

전 후보 `max(color) × strength ≤ 1` (§A11.15 조건 2) · `K ≤ 98` (§A11.5 상한) — 단위 테스트 N1 이 assert 한다.

## 로컬에서 직접 보기

```text
pnpm --filter @astro-simulator/core build
pnpm --filter @astro-simulator/web dev
http://localhost:3000/?focus=earth&nightlightsCandidate=a
http://localhost:3000/?focus=earth&nightlightsCandidate=b
http://localhost:3000/?focus=earth&nightlightsCandidate=c
http://localhost:3000/?focus=earth&nightlights=off
```

자전 ON 이 기본이라 shimmer (§A11.5 · D13) 는 위 URL 에서 그대로 관찰된다. 결정적 프레임은 `&rotate=off` 를 붙인다.
