# #1228 — mid LOD variant 표면 마스크 판정 반경 원자료

## 측정 조건

- macOS · 로컬 `next dev -p 3000` (`apps/web`) · `packages/core` dist 를 판마다 재빌드해 서버 재기동
- 가드 · 프로브: headless chromium `--use-angle=swiftshader` (`SWIFTSHADER=1 HEADFUL=0`) · 1280×720
- F7 캡처: 실 Chrome GUI (`headless:false`, `channel:'chrome'`) · WebGPU (`engine.isWebGPU === true`)
- 「전」 = `origin/develop` (`8a61508`) 빌드 · 「후」 = 본 브랜치 빌드
- 임시 스크립트 (`apps/web/scripts/_debug-1228-*-tmp.mjs`) 는 측정 후 삭제했다 (volt #67). 결과만 여기 남는다.

## F1 — 수정 전 재현

원자료: `f1-before-probe.json` (`?gpu=a&focus=earth&lod=auto&orbits=off`, `rotate=off` · `rotate ON` 2 페이지, `jumpToJulianDate 2451626.0` + `pause` + `beta = π/2` → `setLodOverride('mid')` → `waitForLodSettle`).

| 페이지     | mesh            | `scaling` | `absoluteScaling` | 판정 반경 px (local scaling 식 = 수정 전 SUT 산식) | 참 반경 px (부모 포함) | `uMaskEnabled` (onBind 1.5 s 표본)       |
| ---------- | --------------- | --------: | ----------------: | -------------------------------------------------: | ---------------------: | ---------------------------------------- |
| rotate=off | `earth` (host)  | `18.3333` |         `18.3333` |                                            `98.32` |                `98.32` | `1` (host 숨김이라 bind `0`회 — 직전 값) |
| rotate=off | `earth-lod-mid` |       `1` |         `18.3333` |                                        **`5.363`** |                `98.32` | **`0`** (bind `75`회 전건)               |
| rotate ON  | `earth` (host)  | `18.3333` |         `18.3333` |                                           `74.753` |               `74.753` | `1` (bind `0`회 — 직전 값)               |
| rotate ON  | `earth-lod-mid` |       `1` |         `18.3333` |                                        **`4.077`** |               `74.753` | **`0`** (bind `74`회 전건)               |

- 가설 일치: mid 판정 반경 `< 16` · `uMaskEnabled 0`. 비 `98.32 / 5.363 = 18.333` = tier scaling.
- ⚠️ px 는 **SUT 산식의 페이지 내 복제**로 잰 값이다 (SUT 함수는 번들 밖에서 호출할 수 없다). SUT 출력은 onBind 시점 `uMaskEnabled` 로 직접 관측했다.
- host `parent` 체인 `[]`.

## F2 — 수정 후

원자료: `f2-after-probe.json` (F1 과 같은 절차, 수정판 dist).

| 페이지     | mesh            | 참 반경 px | `uMaskEnabled` (onBind)    |
| ---------- | --------------- | ---------: | -------------------------- |
| rotate=off | `earth-lod-mid` |    `98.32` | **`1`** (bind `73`회 전건) |
| rotate ON  | `earth-lod-mid` |   `74.753` | **`1`** (bind `73`회 전건) |

- mid · host 판정 반경 비 `98.32 / 98.32` = `1.000` (소수 3자리 반올림 범위). SUT 는 부모 체인 `scaling` 곱 (float64) 이고 프로브 복제는 `absoluteScaling` 기준이라 두 값은 반올림 범위에서 같다.

## F3 — 단위 테스트

`packages/core/src/scene/procedural-planet-mask-lod.test.ts` 에 `#1228` describe 4건 추가 (NullEngine, 16 위상 순회).

- 원본: `11 passed (11)` · core 전체 `1108 passed (1108)`
- 변이 (`projectedDiskRadiusPx` 가 local scaling 식을 쓰게 import alias): **`2 failed | 9 passed`** — `projectedDiskRadiusPx` 판정 2건 FAIL. 나머지 2건은 신규 함수를 직접 검사해 변이 비대상이다.
- 원복: `11 passed (11)`
- ⚠️ **초판 산식 `mesh.absoluteScaling` 기각 실측** — Float32 world matrix 분해가 위상마다 흔들려 자식 반경 폭 `2.2061e-7`, #1157 기존 단언 (c) 의 px 폭 `2.3827e-7` 로 `< 1e-9` 가 깨졌다 (기존 테스트 1건 포함 4건 FAIL). 부모 체인 곱으로 교체 후 전건 통과.

## F4 — #790 floor 경로

- 선택: **마스크 LOD 호출부 (`projectedDiskRadiusPx`) 만** 새 함수 `resolveMeshWorldVisualRadius` 로 교체. `resolveMeshVisualRadius` 와 floor 호출부 2곳 diff `0` 행.
- 근거: `f4-host-parent-check.json` — `meshes` Map 32 host 전건 `parent` 없음 → floor 가 받는 mesh 에서 두 식이 비트 동일. 함수 자체를 바꾸면 얻는 것 없이 #790 단위 테스트 mock (`scaling` 만 보유) 과 가드 산식 사본 (`browser-verify-756/773/774/790`) 이 함께 움직여야 한다.
- 가드: `verify:790-focus-zoom` 전 · 후 `exit 0` (F6 표), `focus-lower-radius-floor.test.ts` · `tier-transition.test.ts` 통과.

## F5 — `verify:1119` `MODE=lod` mid 정착 양성

원자료: `f5/`.

| 단계                 | dist                  | mid 판정                                                                             | exit |
| -------------------- | --------------------- | ------------------------------------------------------------------------------------ | ---: |
| (참고) 초판 판정     | develop               | **PASS** — 결함 판인데 diff `13432 px` (`new-guard-on-develop-dist.log`) — fail-open |  `0` |
| (참고) 개정 판정     | develop               | FAIL — sham `[13432, 0]` · 주입 diff `0 px` (`step0-new-guard-on-develop-dist.log`)  |  `1` |
| 1 원본               | 수정판                | PASS — sham `[0]` · 주입 diff `25018 px` · mid `uMaskEnabled` 진단 `1`               |  `0` |
| 2 변이 (수정 되돌림) | 수정판 + import alias | **FAIL** — sham `[13432, 0]` · 주입 diff `0 px` · 진단 `0`                           |  `1` |
| 3 원복               | 수정판                | PASS — sham `[0]` · 주입 diff `25018 px` · 진단 `1`                                  |  `0` |

- **fail-open 경위**: 초판 판정은 develop dist 에서 `exit 0`. 진단 (`settle-diagnosis-develop-dist.json`) — `setLodOverride` 후 `waitForLodSettle` 통과 뒤에도 **무주입** 연속 캡처가 첫 간격에서 1회 갈리고 (high `9554` · mid `13432 px`, bbox `[524,583,755,642]` = 지구 disk 밖 화면 하단 띠) 이후 9 간격 전건 `0`. 그 1회가 주입 전후 창에 걸려 diff 를 만들었다.
- ⚠️ `confound-diagnosis-develop-dist.json` 의 `high except:earth-surface-mat` `13432 px` 는 **구름 머티리얼 패치 효과로 확정되지 않았다** — 같은 수치가 무주입 시간 축 변화와 겹친다. 원인 분리는 하지 않았다 (본 이슈 범위 밖).
- 개정: (1) mid 로 그려짐 전제 (2) mid 머티리얼 **단독** 주입 (3) sham 대조군 (무주입 연속 두 캡처 동일, 상한 `10`회) 을 판정 앞에 결합. 콘솔 에러 축은 기존 `hasSimErrors`.
- ⚠️ 1단은 prettier 적용 **전**, 2·3단은 **후** 판본이다 (형식 변경만).

## F6 — 기존 가드 전 · 후

원자료: `f6-before/` (develop dist) · `f6-after/` (수정판 dist). 각 디렉토리 `exit-codes.txt` + 가드별 로그. 환경은 전 · 후 동일 (`SWIFTSHADER=1 HEADFUL=0`, `next dev :3000`).

| 가드 · 모드                  | 판정량 (전)                                                                                         | 판정량 (후)                                                                                       | exit 전 · 후 |
| ---------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -----------: |
| `verify:1119` `dod`          | IoU ON `0.936` · 고착 `0.3072` · surface=off `0` · 낙차 `0.9360`                                    | 동일                                                                                              |    `0` · `0` |
| `verify:1119` `lod`          | near diff `38741` · far R `5.619` · far diff `0%` (mid 판정 **없음** — 구판)                        | near 동일 · **mid** R `98.32` · sham `[13432, 0]` · diff `25018` · far 동일                       |    `0` · `0` |
| `verify:1119` `seam`         | IoU `0.9599` · `0.877` · 표본 `21953`                                                               | 동일                                                                                              |    `0` · `0` |
| `verify:783` `dod`           | 극관 N `76.8%` / S `57.9%` · G-share `0.4838` > `0.3954` · 마젠타 `0` · 극 휘도 `52.8` < `71.0`     | 동일                                                                                              |    `0` · `0` |
| `verify:783` `ocean`         | 상대 갭 `0.2703` · 낙차 `0.1994` · zero 상승 `0.3032`                                               | 동일                                                                                              |    `0` · `0` |
| `verify:756-surface`         | hfEntropy 갭 earth `2.456` · mars `1.032` · jupiter `1.202` · moon `0.956` · DoD3 earth mid `2.943` | 갭 `2.457` · `1.029` · `1.203` · `0.960` · DoD3 earth mid **`3.07`** (high `3.06`)                |    `0` · `0` |
| `verify:1215-cloud-layer`    | C1 `0.034201` · C5a mid 쌍 `0.019252` · C5b `0.019252`                                              | C1 `0.034201` · C5a mid 쌍 **`0.034293`** · C5b `0.034293` (임계 `mid ÷ 3` 가 `0.011431` 로 이동) |    `0` · `0` |
| `verify:1202-atmosphere-rim` | G1 `0.07110` · G2 `0.07135` · G3 `0.06870` · G4 `0.07132` · G6 `0.06086`                            | 동일                                                                                              |    `0` · `0` |
| `verify:675-glow-marker`     | 40 AU `+11` · 100 AU `+14` · 미발동 `0`                                                             | 동일                                                                                              |    `0` · `0` |
| `verify:790-focus-zoom` (F4) | r/visualR `1.050` ×3 · 중앙 lum sun `231.8` · jupiter `35.4` · saturn `42.3`                        | r/visualR `1.050` ×3 · lum `231.8` · jupiter **`28.9`** · saturn `42.3`                           |    `0` · `0` |

- **fix 가 움직인 판정량 2종** — 둘 다 mid variant 를 재는 항목이고 방향이 「high 와 같아지는」 쪽이다: 756 DoD3 earth mid hfEntropy `2.943` → `3.07` (high `3.06`), 1215 C5a mid 쌍 `0.019252` → `0.034293` (C1 high `0.034201`). mid 가 절차 대륙에서 마스크 경로로 옮겨 간 결과로 읽힌다 (각 가드 내부 산식은 확인하지 않았다).
- ⚠️ 1215 C5b 는 임계가 `C5a ÷ 3` 인 **상대 판정**이라 C5a 상승과 함께 임계도 `0.006417` → `0.011431` 로 올라갔다. 후 판정량 `0.034293` 은 새 임계의 `3.0` 배로 여유가 같다.
- ⚠️ 790 S2 jupiter 중앙 lum `35.4` → `28.9` (임계 `20`). floor 경로 소스 diff 는 `0` 행이고 기하 판정 `1.050` 은 불변이다. 원인은 분리하지 않았다 — 각 1회 실행이다.
- 756 의 earth 외 body 갭 변화 (`±0.004` 이내) 도 각 1회 실행 값이다. 산포는 재지 않았다.

## F7 — 실 Chrome GUI 준비물 (사용자 육안 확인 전)

⚠️ 이 절은 **준비물**이다. 사용자 육안 확인 결과는 기록하지 않았다.

### 사용자 확인 절차

⚠️ focus 된 body 는 LOD 가 항상 high 로 강제된다 (`packages/core/src/render/lod.ts` `isFocused`). 그래서 **`?focus=earth` 에서 휠로 줌아웃만 해서는 mid 로 가지 않는다** — 제품 경로의 mid 대역은 focus 를 풀었을 때만 나온다.

1. `pnpm dev` (포트 `3000`) 후 실 Chrome 에서 `http://localhost:3000/?focus=earth` 를 연다.
2. **대조 A (강제)** — `http://localhost:3000/?focus=earth&lod=mid` 를 새 탭으로 열어 1 의 대륙 윤곽과 비교한다. 수정 후에는 두 탭의 대륙 모양 (아프리카 · 유럽 해안선 등) 이 같아야 하고, 수정 전에는 mid 탭이 절차 대륙 (실제 해안선과 무관한 얼룩 모양) 이다.
3. **대조 B (제품 경로)** — 1 의 탭에서 focus 바의 **「탐색」** 버튼 (툴팁 「자유시점 (Esc)」, `data-testid="focus-free-fly"`) 으로 자유시점에 들어간 뒤 휠로 천천히 줌아웃한다. 지구 disk 가 화면에서 지름 약 `100 px` (반경 `50 px`) 아래로 줄어드는 순간 high → mid 로 바뀐다. 그 전후로 대륙 윤곽이 **절차 대륙으로 바뀌지 않는지** 본다. 반경 `16 px` 아래 (지름 약 `32 px`) 는 설계상 절차 경로로 돌아간다 (#1119 원거리 LOD — 비-범위).
4. 줌인으로 되돌아와 high 로 복귀할 때도 같은 것을 본다.

### 캡처 (`f7/`)

`_debug-1228-f7-tmp.mjs` (삭제함) — 시나리오 A: `?focus=earth` · `jumpToJulianDate 2451626.0` + `pause` · `setLodOverride('high'|'mid')`. 시나리오 B: 같은 진입 → `enterFreeFly` → `camera.radius` 를 focus 프레이밍 radius 의 `1, 1.5, 2, 3, 4, 5, 6` 배 → `waitForLodSettle`.

「전」 (`before-*.png`, `before-state.json`) — develop dist, WebGPU, 콘솔 에러 A `0` · B `0`:

| 캡처                        | disk 반경 px | 지구 variant | host `uMaskEnabled` | mid `uMaskEnabled` |
| --------------------------- | -----------: | ------------ | ------------------: | -----------------: |
| `before-A-forced-high`      |      `74.75` | high         |                 `1` |                  — |
| `before-A-forced-mid`       |      `74.75` | mid          |                 `1` |            **`0`** |
| `before-B-freefly-zoom1x`   |      `74.75` | high         |                 `1` |                  — |
| `before-B-freefly-zoom1.5x` |      `49.84` | mid          |                 `1` |            **`0`** |
| `before-B-freefly-zoom2x`   |      `37.38` | mid          |                 `1` |            **`0`** |
| `before-B-freefly-zoom3x`   |      `24.92` | mid          |                 `1` |            **`0`** |
| `before-B-freefly-zoom4x`   |      `18.69` | mid          |                 `1` |            **`0`** |
| `before-B-freefly-zoom5x`   |      `14.95` | mid          |                 `1` |    `0` (임계 아래) |
| `before-B-freefly-zoom6x`   |      `14.95` | mid          |                 `1` |    `0` (임계 아래) |

- host `uMaskEnabled` 는 host 가 숨겨진 뒤 bind 되지 않아 **직전 값**이다 (판정 의미 없음).
- `zoom6x` 는 `camera.radius` 가 `242.185` 에서 멈췄다 (`zoom5x` 와 같은 값 — 상한 clamp 로 보이나 원인은 확인하지 않았다).

「후」 (`after-*.png`, `after-state.json`) — 수정판 dist, WebGPU, 콘솔 에러 A `0` · B `0`:

| 캡처                       | disk 반경 px | 지구 variant | mid `uMaskEnabled` |
| -------------------------- | -----------: | ------------ | -----------------: |
| `after-A-forced-high`      |      `74.75` | high         |                  — |
| `after-A-forced-mid`       |      `74.75` | mid          |            **`1`** |
| `after-B-freefly-zoom1x`   |      `74.75` | high         |                  — |
| `after-B-freefly-zoom1.5x` |      `49.84` | mid          |            **`1`** |
| `after-B-freefly-zoom2x`   |      `37.38` | mid          |            **`1`** |
| `after-B-freefly-zoom3x`   |      `24.92` | mid          |            **`1`** |
| `after-B-freefly-zoom4x`   |      `18.69` | mid          |            **`1`** |
| `after-B-freefly-zoom5x`   |      `14.95` | mid          |    `0` (임계 아래) |
| `after-B-freefly-zoom6x`   |      `14.95` | mid          |    `0` (임계 아래) |

- 전 · 후 disk 반경 · LOD 분포 · variant 는 전 표본 같다 — 달라진 것은 mid `uMaskEnabled` 뿐이다.
- 육안 대조 권장 쌍: `before-A-forced-mid.png` ↔ `after-A-forced-mid.png` ↔ `after-A-forced-high.png`, 그리고 `before-B-freefly-zoom2x.png` ↔ `after-B-freefly-zoom2x.png`.
