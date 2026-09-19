# #1226 Phase 2 — 측정 기록

두 라운드다. **재개 (2026-09-18)** 가 현재 상태이고, 아래 §이력 의 정지 기록 (2026-09-14) 은 그 원인이 된 두 선결 문제의 원자료다.

---

## 재개 (2026-09-18) — 임계 도출 완료 · 변이 3건 해소

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

### 변이 3건 — 해소 (2026-09-18)

1. **MN-6 — `D6` 의 변이 검출력을 처음으로 확인했다.** 4회 `exit 2` 의 원인은 `V2` **초판 술어** (`NI_land` 범위 · 픽셀당 `≤ 1 LSB`) 가 건강판을 `1 px` 로 위배한 것이었고, ADR §A11.17.9 확정안 (판정 집합 **`disk`** · 술어 **둘** · **새 임계 `0` 개**) 으로 교체했다. [실측] `diag/m4a-mn6-v2final.log`: `V1` full `0 px` · **`V2-①` disk `chMax ≥ 3` `0 px`** · **`V2-②` disk `> 1 LSB` 크기 `≥ 2` 성분 `0` 개** · `V3` full `0 px` · `V4` full `0 px` · 변이 full `988 px` ⇒ 주입 유효, 그리고 **`D6` FAIL** — `R_C4 = 1.000208` > `1 − K_OCC = 0.899770` (판별 여유 `K_OCC / |1 − R_C4| = 482배`). 나머지 9 게이트 PASS · `exit 1`. `MN6_SKIP_DEPTH_WRITE=1` 판본도 판정량 동일 (`diag/m4b-mn6-nodepthwrite.log`, `exit 1`) — `disableDepthWrite` 축은 이 술어에서도 무관하다 (ADR §A10.5 와 일치).
   - 초판 술어가 폐기된 이유 (ADR §A11.17.9 §초판 처방의 반증): (i) **MSAA 4x resolve** 가 삼각형 경계 픽셀에서 표본별로 양자화된 값을 평균해 단일 fragment + round-to-nearest 의 산술 상한 `1 LSB` 를 깬다 — `antialias:false` 개입에서 그 픽셀이 소멸하는 것으로 기전을 확정했다. (ii) **`NI_land` 한정이 누출을 놓친다** — overlay 가 밤면 육지 밖으로 불빛을 누출하는 결함에서 `NI_land` 판정량이 건강판과 같다 (주간 반구 누출 실측 `NI_land 0 px` 대 `disk 442 px`).
   - 진단 인쇄 (술어 아님) 건강 overlay 기준: disk `> 1 LSB` `1 px` · 최대 `|Δlum| 0.005059` · 기여 상대오차 disk `0.0059 %` / `NI_land` `0.0184 %` · `chMaxHist {0: 30177, 1: 590, 2: 1}` · 성분 크기 `{1: 1}`.
2. **MN-7 — 해소.** 원 `mn7.log` 은 부트스트랩 크래시 (6번째 브라우저 컨텍스트 생성 시점) 로 판정에 도달하지 못한 로그였다. 동일 명령·환경 **3/3 재현 실패**이고 원인은 [추론] 메모리 압력이다 (성공 실행 peak RSS `1.11~1.15 GB` — ADR §A11.18.2). 정상 실행은 **`D7(2)` FAIL** (low 정착 쌍 disk 변화 `12 px`) · 나머지 9 게이트 PASS · `exit 1`. `mutations/mn7.log` 를 정상 실행 로그로 교체했다 (원 크래시 사실은 파일 머리 2줄).
3. **MN-5b — 처분 확정: 「단위 테스트가 잡는 자리」** (ADR §A11.18.1). §A11.16 기각 1 의 예측 (_"`R == 0` 이라 `NI_sea` 에 들어가 `D5` 가 잡는다"_) 은 **두 겹으로 반증**됐다. [실측] 결함 렌더 (`diag/m3-mn5b-defect.log` — `disk changed 995 → 1045` · `fullChanged 1006 → 1061` 재현) 에서 「새로 변한」 픽셀은 **정확히 `50 px`** 이고 `ndv ∈ [0.0482, 0.3752]` (전량 `INNER_NDV_MIN 0.6` 미만) · `r/R ∈ [0.927, 0.9988]` (disk 주변부) · `|lat| ∈ [61.63°, 79.41°]` · 게이트 `R == 0` 이 `41` / `R > 0` 이 **`9`** 다. 즉 (i) `NI` 표본에 하나도 들어오지 않고 (ii) `9 px` 은 예측 전제 (`R == 0`) 자체가 성립하지 않는다.
   - 축은 **카메라 고도 `beta = π/2` 고정**이다 — JD 4대 거점 + 대조 `5` 개와 카메라 방위각 `α` `7` 개에서 `NI ∩ 육지 ∩ ice = 0` (극축↔카메라 전부 정확히 `90°`) 이나, `beta ≤ 70°` 에서는 `25 ~ 833 px` 로 들어온다. 가드 프레임 (`?rotate=off`) 은 `rotationQuaternion = null` 이라 자전축 기울기가 `0°` 다 (`rotate` ON 은 `66.56°`).
   - 단위 테스트가 1건 잡는다 (`mutations/unit-tests.txt` — `1 failed / 1129`). ⚠️ **하중을 지는 것은 `procedural-planet-night-lights.test.ts` 의 `lightGate` 문자열 assert 하나**다 (qa D12 독립 재현, ADR §A11.20). 같은 파일의 미러 테스트 (`iceMask 1 → 정확히 0`) 는 **GLSL 변이에서 통과한다** — JS 미러를 재는 직교 축이라 셰이더 소스 변경을 보지 못한다. 두 단언이 함께 잡는 것처럼 읽히지 않게 구분해 적는다.

⚠️ `mutations/mn6*.log` 4종은 **초판 술어 시점의 `exit 2` 기록**이다 (이력 보존). 현행 판정은 위 `diag/m4a-*` · `diag/m4b-*` 다.

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
