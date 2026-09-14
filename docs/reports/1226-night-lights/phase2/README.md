# #1226 Phase 2 — 정지 기록 (2026-09-14)

Phase 2 (신규 가드 `verify:1226-night-lights` baseline 도출) 첫 profile 실행에서 **계약 D7(1) 이 제품 속성으로 성립하지 않고**, **D7(2) 쌍에 계약 전제 3 이 구조적으로 성립하지 않음**이 드러나 작업을 멈췄다. 임계는 도출하지 않았다 (가드 상수 전부 `null` — 기본 모드는 fail-closed).

## 측정 조건

- 로컬 headless chromium `--use-angle=swiftshader` (`SWIFTSHADER=1`) · 1280×720 · `next dev` · `packages/core` = `ff203b0` (g1 접기) 빌드
- `verify:1202` 결정적 프레임 · JD `2451808.0` (U1) · DOM 숨김 (canvas 만 visible — #1219)
- 원자료: `profile-trial-1.log` · `profile-trial-1.json` (가드 `MODE=profile` 1회)

## 발견 1 — mid LOD variant 에서 불빛이 `0` 이다 (선재 결함 상속)

[실측] `profile-trial-1` mid 정착 쌍 (P1 ↔ P2, `setLodOverride('mid')`): NI 평균 기여 `0` · NI 변화 px `0` · disk 변화 px `0`. high 주 쌍은 NI 평균 기여 `0.02187` · 변화 px `655`.

[실측 — 임시 스크립트, 삭제함] 같은 프레임에서 `setLodOverride('mid')` 뒤 지구 표면 머티리얼 uniform:

| 서버                           | mesh                              | 머티리얼                    | `uMaskEnabled` | `nightLightStrength` |
| ------------------------------ | --------------------------------- | --------------------------- | -------------: | -------------------: |
| feature (`3000`)               | `earth` (host, `isVisible false`) | `earth-surface-mat`         |            `1` |                `0.9` |
| feature (`3000`)               | `earth-lod-mid`                   | `earth-lod-mid-surface-mat` |        **`0`** |                `0.9` |
| develop tip `8a61508` (`3100`) | `earth`                           | `earth-surface-mat`         |            `1` |       (uniform 없음) |
| develop tip `8a61508` (`3100`) | `earth-lod-mid`                   | `earth-lod-mid-surface-mat` |        **`0`** |       (uniform 없음) |

- **mid variant 의 마스크 비활성은 불빛 도입 전부터 있다** (develop tip 동일).
- 기전 [파일 판독 — `camera-controller.ts` `resolveMeshVisualRadius`]: 반경 = `extendSize × |mesh.scaling|`. mid 는 host 의 **자식** (`createBodyMeshMid` — `parent = host`, `scaling 1`) 이라 부모 scaling (`18.33`) 이 반영되지 않는다 → `projectedDiskRadiusPx` 가 약 `1/18.33` 로 작게 나와 `SURFACE_MASK_MIN_DISK_PX = 16` 아래 → `uMaskEnabled = 0`. [실측] 두 mesh 의 `absoluteScaling` 은 `18.33` 으로 같고 `scaling` 만 `18.33` 대 `1` 이다. ⚠️ 투영 반경 값 자체는 인쇄하지 않았다 — 기전은 판독이다.
- 게이트 (γ) `landMask × (1 − iceMask) × uMaskEnabled` (§A11.4) 가 이 값을 곱하므로 **mid 에서 불빛이 구조적으로 `0`** 이다. 계약 D7 (1) 「mid 정착 쌍 D2 량 ≥ `T_NIGHT`」 는 현 코드에서 FAIL 한다.
- 제품 영향 [추론, 미실측]: focus 가 아닌 거리에서 지구가 mid 로 그려지는 구간 (§A4.3 결정 4 의 「mid variant 원거리 끝」) 과 LOD cross-fade 창에서 불빛이 꺼진다. 같은 이유로 **대륙 마스크도 mid 에서 절차 대륙으로 바뀌어 있었다** (선재).

## 발견 2 — low 쌍에 전제 3 (DI 휘도 ≥ `MIN_DAY_LIT_LUM`) 은 구조적으로 성립하지 않는다

[실측] low 정착 쌍 DI 평균 휘도 `0.035593` — 씬 배경색 (clear color 8-bit `(8, 9, 13)`) 의 Rec.709 휘도와 같다. `verify:1215` judge 주석이 같은 값을 이미 실측했다 (low 대역은 배경). 계약 「측정 불가」 전제 3 원문 「low 쌍처럼 대역이 배경이면 걸린다」 · D7 ⚠️ 「전제를 low 쌍에도 적용한다」 대로 걸면 **가드가 매 실행 `exit 2`** 다.

## 그 외 profile 1회 관측 (판정 아님 — 임계 도출 전)

| 량                                                            | 값                                            |
| ------------------------------------------------------------- | --------------------------------------------- |
| NI / DI / NI_land / NI_sea N                                  | `7225` / `7225` / `4104` / `3121`             |
| D2 NI 평균 기여                                               | `0.02187`                                     |
| D3 DI 변화 px                                                 | `0`                                           |
| D4 NI_land 변화 없는 비율                                     | `0.8404`                                      |
| D5 NI_sea 변화 px                                             | `0`                                           |
| D6 R (구름 ON / OFF 기여 비)                                  | `0.69931` (분자 `0.026925` / 분모 `0.038502`) |
| 전제 7 NI_land P4 ≠ P2                                        | `2083 px`                                     |
| 불빛 ∩ 구름 px · NI_land 채널 포화 px (P1 · P3)               | `360` · `0` · `0`                             |
| D8 rotate=off · ON 독립 2회 로드 NI 변화 px                   | `0` · `0` (rotate ON NI N `5740`)             |
| 게이트 맵 주입 원복 P2 full frame                             | `0 px`                                        |
| G ↔ GA NI 변화 px (`R == 0` 불일치 계열 포함, 채널 전체 비교) | `605`                                         |
| 콘솔 에러                                                     | 전 페이지 `0`                                 |

⚠️ 1회 실행이다. baseline 반복 · 산포 · MN-6 `R_C4` · V1~V4 는 실행하지 않았다.

## D10 「전」 (develop tip)

`d10-before/` — develop tip `8a61508` 빌드 (`3100`) 에서 12종 전건 `exit 0`. 「후」 는 실행하지 않았다 (위 정지).
