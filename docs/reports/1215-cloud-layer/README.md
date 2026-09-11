# #1215 Phase 0 — 알파 축 재판정 측정 기록

[이슈 #1215](https://github.com/coseo12/astro-simulator/issues/1215) Phase 0 의 산출물이다.
**판정 본문은 이슈 코멘트**에 있고, 이 디렉토리는 그 판정이 인용하는 **원자료**다.

⚠️ 프로토타입 셰이더/주입 스크립트는 **커밋하지 않았다.** 계약이 _"Phase 0 의 산출은 코드가 아니라
판정"_ / _"프로토타입 코드는 판정을 위한 수단이며 머지 대상이 아니어도 된다"_ 로 규정했고,
프로토타입은 프로덕션 소스 **0 줄 변경**으로 런타임 주입했다 (`verify:1119` `injectMaskDisabled` ·
`verify:1202` `injectFloats` 와 같은 계열). 측정 후 스크래치는 삭제했다 (volt #67).

## 측정 조건

| 축         | 값                                                                        |
| ---------- | ------------------------------------------------------------------------- |
| URL        | `?gpu=a&focus=earth&lod=auto&rotate=off&orbits=off`                       |
| JD         | `2451626.0` (`verify:1202` 와 동일) + `pause`                             |
| 카메라     | `beta = π/2` (오클루전 시나리오만 `alpha = 0` — 아래 참조)                |
| 정착       | `waitForLodSettle` — 전 조건 `dist 9/6/17`, `fading 0`, `timedOut false`  |
| 뷰포트     | `1280×720`, `deviceScaleFactor 1`                                         |
| 프로토타입 | earth mesh clone, `scale 1.02`, fbm 5-옥타브, `cover 0.52` / `sharp 0.10` |

렌더러는 **두 축 모두** 돌렸다.

- `phase0-measurements.json` — **실 Chrome GUI** (`channel: chrome`, `--use-angle=metal`, headful).
  §915 예외 불가 조항 + CLAUDE.md §headless 브라우저 검증 대응. `*.png` / `zoom-*.png` 가 이 판본이다.
- `phase0-measurements-swiftshader.json` — headless `--use-angle=swiftshader` (CI 재현 축).
  ⚠️ **프레임 시간은 이쪽만 유효하다** — 실 GPU 는 vsync 락으로 전 조건 `16.6~16.7ms` 에 붙는다.
- `phase0-occlusion.json` — (c) 달 transit/occultation + M5(강등) 축. swiftshader.

## 파일

| 파일                                                     | 내용                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------- |
| `off.png` / `off-control.png`                            | 구름 없음 ×2 — **결정성 대조군**. 실 GPU 에서 전 화면 diff `0`            |
| `alphatest.png`                                          | ALPHATEST (`alphaCutOff 0.5` discard)                                     |
| `alphablend.png`                                         | ALPHABLEND (`needAlphaBlending: true`, `alphaMode = 2`)                   |
| `dither.png`                                             | 제3 후보 — ALPHATEST + 4×4 Bayer dither                                   |
| `alphablend-nologdepth.png` / `alphatest-nologdepth.png` | P0-4 대조군 — log-depth 기록 **미삽입**                                   |
| `alphablend-nodepthwrite.png`                            | P0-4 — `disableDepthWrite = true`                                         |
| `zoom-*.png`                                             | 위 4종의 `(600,340)` 중심 `180×180` 영역 4× 확대. **알파 축 육안 비교용** |
| `occl-transit-*.png`                                     | (c) transit 시나리오 (`jd 2451638.75`) 프레임                             |

## Phase 1 architect 실측 (2026-09-11)

ADR `20260628-756` Amendment 10 §A10.12 의 원자료다. 결정 3 (`disableDepthWrite`) · 결정 4 (LOD fade 창
정렬 동률) · 결정 5 (LOD low 거동) 를 판정했다. 런타임 주입만 했고 (프로덕션 코드 0 줄), 임시 스크립트는
실행 후 삭제했다 (volt #67). headless `--use-angle=swiftshader`, 측정 조건은 위 표와 같다 (오클루전 제외).

| 파일                                      | 내용                                                                                                                             |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `phase1-architect-depthwrite-lodlow.json` | depth write 기본/비활성 × 구름 순서 (자연 / `alphaIndex 0`) × 지구 투명 큐 강제 + LOD low                                        |
| `phase1-architect-fade-order.json`        | 실경로 — lazy 생성된 `earth-lod-mid` 의 fade 정지 재현 (구름 idx 88 < mid idx 90)                                                |
| `phase1-architect-u1-opaque-fade.json`    | cross-validate U1 대안 — host 계열 불투명 강제 (`transparencyMode 0`) vs 현행 fade. earth · mars, disk 픽셀 H/M 분류 + 구름 결합 |
| `phase1-architect-u1-determinism.json`    | U1 결정성 대조 — H · 현행 fade · 불투명 강제 fade 각 독립 2회 로드 diff (disk / 림 링 / 바깥)                                    |

## Phase 1a dev 실측 (2026-09-11)

구현 커밋 (`feat(core): [#1215] ... Phase 1a`) 위에서 잰 **판정용 사전 측정**이다. 가드 임계를 정하지
않는다 — 임계는 D1 승인 파라미터로 baseline 을 다시 재는 Phase 1b 몫이다 (§A10.11). 측정 스크립트는
실행 후 삭제했다 (volt #67).

| 파일                                 | 내용                                                                                                                                                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `phase1-1a-c5-first-run.json`        | C5 첫 실행 — 정렬 키 치환 설치 / 제거 / 재설치 × LOD fade 창 정지 재현 (swiftshader, 독립 2회 로드)                                                                                                                          |
| `phase1-1a-guards-cloud-on-off.json` | 기존 지구 가드 11 실행을 구름 ON (web 기본값) / OFF 에서 1회씩 — 판정과 핵심 값 (가드·임계 무수정)                                                                                                                           |
| `phase1-d1-static-{off,A,B,C}.png`   | D1 후보 — 실 Chrome GUI 정지 프레임 (`?gpu=a&focus=earth&lod=auto`, JD `2451626.0`, pause). `-zoom` = 2× 확대                                                                                                                |
| `phase1-d1-drift-jd{0,1,2}-zoom.png` | 차등 자전 재료 — 후보 B, JD 를 항성일 간격으로 3점 (표면 방위는 거의 같고 구름만 상대각만큼 이동)                                                                                                                            |
| `phase1-d1-measurements.json`        | D1 정지·차등 캡처의 기하 · 엔진 (WebGPU 여부) · 후보별 disk 변화 px · 구름 quaternion. ⚠️ 이 파일의 `lodZoom` 은 **focus 상태**라 지구가 전 프레임 `high` 였다 (focus body 는 LOD 가 항상 high) — LOD 판정 재료로 쓰지 말 것 |
| `phase1-d1-lod-roundtrip/*.png`      | LOD 경계 줌 왕복 (**`detachFocus()` 후**) — 지구 variant 상태가 바뀌거나 지구 fade 창인 프레임 (지구 중심 crop)                                                                                                              |
| `phase1-d1-lod-measurements.json`    | 위 왕복의 프레임별 지구 LOD · variant 가시성/alpha · 구름 가시성 · 계열 draw 순서                                                                                                                                            |

D1 후보 (런타임 주입 — 코드 기본값은 B):

| 후보 | 반경비  | cover  | opacity | 결정적 프레임 림 돌출 (`98.32 px × (반경비 − 1)`) |
| ---- | ------- | ------ | ------- | ------------------------------------------------- |
| A    | `1.005` | `0.55` | `0.8`   | `0.49 px`                                         |
| B    | `1.01`  | `0.5`  | `0.9`   | `0.98 px`                                         |
| C    | `1.02`  | `0.45` | `0.95`  | `1.97 px`                                         |

## 오클루전 시나리오의 카메라가 다른 이유

`verify:1202` 의 `alpha = -π/2, beta = π/2` 는 **달 궤도면을 정면(face-on)으로 보는 시점**이다.
[실측] 그 시점에서 `jd 2451626.0` 부터 30일을 `0.05` 일 간격으로 601 표본 스캔했을 때 달–지구
시선 이각(`sepDeg`)이 `24.798 ~ 26.655` 로만 움직였고, 지구 disk(각반경 `6.631°`)와 겹치는 표본이
**`0`** 이었다. 즉 그 시점에서는 (c) 가 **구조적으로 발생하지 않는다**.

`alpha = 0` (황도면 안)으로 옮기면 `sepDeg` 가 `1.373 ~ 30.237` 을 쓸고 겹침 표본이 **79** 개
(앞 18 / 뒤 61) 생긴다. 그중 결정적으로 고른 두 시점:

- **transit** `jd 2451638.75` — `sep 3.838° < 6.631°`, `camToMoon 19.308 < camToEarth 36.827`
- **occultation** `jd 2451651.55` — `sep 1.373° < 6.631°`, `camToMoon 54.632 > 36.827`

## 폐기한 술어 2건 (같은 실수 반복 방지)

1. **「배경이 아닌 픽셀 = earth disk」** — 배경이 `(8,9,13)` 이라 이 술어가 화면의 `99.7%`
   (`919277 / 921600`) 를 disk 로 셌다. `verify:1202` 의 ray-sphere 역투영으로 교체했다
   (실제 disk `30768 px`).
2. **「달 기하 원판 + `pad 2px`」** — 마스크 `691 px` 중 달 실면적이 약 `515 px` 라, 구름이 달을
   덮지 않아도 `changedPx > 0` 이 나왔다. **달을 껐을 때 실제로 변한 픽셀 집합**(실루엣, `538 px`)
   과 침식 원판(`304 px`)으로 교체했다.
