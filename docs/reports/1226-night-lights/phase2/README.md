# #1226 Phase 2 — 측정 기록

두 라운드다. **재개 (2026-09-18)** 가 현재 상태이고, 아래 §이력 의 정지 기록 (2026-09-14) 은 그 원인이 된 두 선결 문제의 원자료다.

---

## 재개 (2026-09-18) — 임계 도출 완료 · 변이 3건 미해결

선결 문제 2건이 해소된 뒤 (1 = #1228 머지로 제품 fix · 2 = 사용자 결정으로 계약 재조정, `verify:1215` 선례) 다시 돌렸다. `packages/core` = `e39b6d9` (#1228 fix 포함) 빌드 · 나머지 측정 조건은 아래 §이력 의 §측정 조건 과 같다 (그 절이 적은 빌드 `ff203b0` 만 다르다).

### 도출한 임계 (계약 규칙 = baseline ÷ 3)

[실측] `MODE=profile` **5회 — 다섯 실행이 판정량 전 항목에서 동일 (산포 `0`)**. 원자료 `baseline/profile-1.log` ~ `profile-5.log`.

| 상수                                 |              값 |                baseline | 여유                           |
| ------------------------------------ | --------------: | ----------------------: | ------------------------------ |
| `T_NIGHT` (D2 · D7(1))               |       `0.00729` |  NI 평균 기여 `0.02187` | mid 쌍 `0.021659` → **2.97배** |
| `T_DARK` (D4)                        |       `0.28013` | 변화 없는 비율 `0.8404` | 3.00배                         |
| `K_OCC` (D6)                         |       `0.10023` |          `R = 0.699314` | 판정 `R ≤ 0.89977`             |
| `MIN_EXPECTED_NIGHT` / `_DAY`        | `2408` / `2408` |       N `7225` / `7225` | —                              |
| `MIN_EXPECTED_NIGHT_LAND` / `_SEA`   | `1368` / `1040` |       N `4104` / `3121` | —                              |
| `MIN_EXPECTED_CLOUDED_LAND` (전제 7) |           `694` |            P4≠P2 `2083` | —                              |

⚠️ **로컬 swiftshader 에 한한다** — CI 렌더러와의 동일성은 미확인이다 (`verify:1215` 는 소수 4~5 자리 차이를 실측했다).

### 통과한 것

- **선결 1 해소 확인** — mid 정착 쌍 `uMaskEnabled = 1` · NI 평균 기여 `0.021659` (정지 시점 `0`). 계약 D7(1) 이 제품 속성으로 성립한다.
- **D9** (`d9.log`) — (a)(b)(c) full frame 변화 `0 px` · 양성 대조 `987 px` · 콘솔 에러 `0`. `exit 0`
- **D10** — 선재 가드 12종을 develop tip (`d10-before/`, 서버 `3100`) 과 feature (`d10-after/`) 양쪽에서 돌려 **전건 `exit 0`**. ⚠️ `d10-before/` 는 #1228 머지로 develop tip 이 움직여 **재측정한 값**이다 — `before-1215.log` 의 mid 항 (`C5a 0.019252 → 0.034293`) 이 #1228 의 구조 변화이고, `before-756` · `before-773` 의 소수 차이는 swiftshader 재실행 산포다 (판정 불변).
- **변이 검출** — `mutations/` 의 MN-1 · 2 · 3 · 4 · 5 전건 `exit 1`. **MN-2 는 단위 테스트 1130/1130 통과인데 가드가 FAIL** 로 잡았다 (가드 고유 검출력). MN-8 은 전제 5 가 `exit 2` 로 잡는다 (설계대로 — 하네스 설정 실패).

### 미해결 3건

1. **MN-6 이 4회 전건 `exit 2` (주입 무효)** — `mn6.log` · `mn6-repeat2` · `mn6-repeat3` · `mn6-no-depthwrite` 모두 같은 지점에서 멈춘다. [실측] V1 full `0` · V3 full `0` · V4 full `0` · 변이 full `988` 은 충족인데, **V2** (overlay 를 P2 에 올린 프레임 ↔ P1 이 같아야 한다) 가 `NI_land` 기여 `0.038509` vs P1 `0.038502` · 최대 `|Δlum| 0.005059` · **1 LSB 초과 `1 px`** 로 위배다. 술어는 `0 px` 를 요구한다. ⇒ **D6 (구름 차폐) 의 변이 검출력이 미확인**이다. `MN6_SKIP_DEPTH_WRITE=1` 로 §A11.17.3 보강 1 을 철회해도 같으므로 `disableDepthWrite` 축은 원인이 아니다 (ADR §A10.5 「블렌드 draw 에서 무효」 와 일치).
2. **MN-7 미측정** — `mn7.log` 8행 전부 `Target page … has been closed` (부트스트랩 중 크래시). 재실행이 필요하다.
3. **MN-5b 가 `exit 0`** — ADR §A11.16 기각 1 은 극관 억제 `(1 − iceMask)` 제거 결함의 픽셀이 _"G 에서 `R == 0` 이라 `NI_sea` 에 들어가 **D5 가 잡는 자리**"_ 로 예측했으나 통과했다. [실측] 기전은 「`NI_sea` 가 못 잡음」이 아니라 **표본 대역 밖**이다 — `mn5b.log` 의 `NI` · `NI_land` · `NI_sea` 판정량이 baseline 과 소수 6자리까지 **완전히 같고** (`NI 0.02187` · `NI_land 0.038502` · `NI_sea changed 0`), 달라진 것은 `disk` 뿐이다 (`changed 995 → 1045` · `fullChanged 1006 → 1061`). 즉 결함은 disk 픽셀을 `+50` 바꾸지만 **그 픽셀이 `NI` 표본에 하나도 들어오지 않는다** — `NI_sea` 가 잡고도 통과한 것이 아니라 셋 다 결함을 보지 못했다. [추론, 미실측] 극관 (그린란드 · 남극) 은 고위도라 `NI` 의 내부 조건 `ndv ≥ INNER_NDV_MIN 0.6` 밖의 disk 주변부에 있을 것이다 — 바뀐 `+50 px` 의 위치는 인쇄하지 않았으므로 확정이 아니다. 단위 테스트는 1건 잡는다 (`mutations/unit-tests.txt`). **판정 필요**: 예측 반증을 ADR 에 Amendment 로 박고 「단위 테스트가 잡는 자리」로 남길지, `NI` 대역을 넓힐지.

---

## 이력 — 정지 (2026-09-14)

Phase 2 (신규 가드 `verify:1226-night-lights` baseline 도출) 첫 profile 실행에서 **계약 D7(1) 이 제품 속성으로 성립하지 않고**, **D7(2) 쌍에 계약 전제 3 이 구조적으로 성립하지 않음**이 드러나 작업을 멈췄다. 임계는 도출하지 않았다 (가드 상수 전부 `null` — 기본 모드는 fail-closed). 아래는 그 시점 기록이고, 두 발견은 위 §재개 에서 각각 #1228 머지와 계약 재조정으로 해소되었다.

### 측정 조건

- 로컬 headless chromium `--use-angle=swiftshader` (`SWIFTSHADER=1`) · 1280×720 · `next dev` · `packages/core` = `ff203b0` (g1 접기) 빌드
- `verify:1202` 결정적 프레임 · JD `2451808.0` (U1) · DOM 숨김 (canvas 만 visible — #1219)
- 원자료: `profile-trial-1.log` · `profile-trial-1.json` (가드 `MODE=profile` 1회)

### 발견 1 — mid LOD variant 에서 불빛이 `0` 이다 (선재 결함 상속)

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

### 발견 2 — low 쌍에 전제 3 (DI 휘도 ≥ `MIN_DAY_LIT_LUM`) 은 구조적으로 성립하지 않는다

[실측] low 정착 쌍 DI 평균 휘도 `0.035593` — 씬 배경색 (clear color 8-bit `(8, 9, 13)`) 의 Rec.709 휘도와 같다. `verify:1215` judge 주석이 같은 값을 이미 실측했다 (low 대역은 배경). 계약 「측정 불가」 전제 3 원문 「low 쌍처럼 대역이 배경이면 걸린다」 · D7 ⚠️ 「전제를 low 쌍에도 적용한다」 대로 걸면 **가드가 매 실행 `exit 2`** 다.

### 그 외 profile 1회 관측 (판정 아님 — 임계 도출 전)

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

### D10 「전」 (develop tip)

`d10-before/` — develop tip `8a61508` 빌드 (`3100`) 에서 12종 전건 `exit 0`. 「후」 는 이 시점에 실행하지 않았다 (위 정지). ⚠️ **현재 저장소의 `d10-before/` 는 이 값이 아니다** — #1228 머지로 develop tip 이 움직여 §재개 에서 재측정했다.
