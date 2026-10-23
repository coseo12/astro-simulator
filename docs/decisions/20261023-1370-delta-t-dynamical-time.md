# ADR 20261023-1370 — 위치는 역학시(TT), 자전 · 표시는 장면 시계(UTC): ΔT 를 진입점 3곳에서 한 번씩 더한다

- **상태**: Provisional — cross-validate · 사용자 결정 (Q1~Q6) 대기. 메인이 둘을 거친 뒤 Accepted 로 전이한다
- **날짜**: 2026-10-23
- **결정자**: 사용자 (Q 표 — 대기) · 설계 architect (이슈 [#1370](https://github.com/coseo12/astro-simulator/issues/1370) · 사용자 선택 2026-10-23)
- **관련**:
  - [ADR 20261018-1360](20261018-1360-moon-phase-eclipse-shadows.md) — 일식 그림자 · §1-D NASA 거리. 지리 오차 축 분해는 PR [#1369 반영 코멘트](https://github.com/coseo12/astro-simulator/pull/1369#issuecomment-6248802718) (R1)
  - #1362 — 지구 자전 ERA (`earthRotationAngle`, 장면 jd 를 UT1 근사로 쓴다 — `|UT1 − UTC| < 0.9 s`)
  - [ADR 20261017-1354](20261017-1354-lunar-precession-eclipses.md) — 달 세차 B9 · 식 판정 (`syzygy-eclipse`)
  - [ADR 20261016-1347](20261016-1347-event-markers.md) Amendment 2 — `time-events.json` 사전 계산 · drift 테스트 (`time-events-data.test.ts`)
  - #1349 — 태양 GM 교정 때 「위치 모델 변경 → 사건 파일 재생성 + 기대값 갱신 근거 표」 절차
  - [ADR 20261021-1390](20261021-1390-education-tour.md) — 교육 투어 (일식 투어의 사건 id · offset, 계절 · 별자리 투어의 USNO UT 상수)
  - [`principles.md`](../architecture/principles.md) §1 Visual Fidelity
- **용어**: 장면 시계 (clock) = `TimeController` · store · URL `t` · 화면 표시 · 사건 파일이 쓰는 JD (`dateToJulianDate` — Unix ms 기반 UTC 해석). TT = 지구시 (역학시 TD 와 같은 값으로 쓴다, TDB 와의 차 `< 2 ms` 는 무시). ΔT = TT − UT1. [Tier](../glossary.md#tier-t1--t2--t3)

> **forensic 변형 판정 — 일반 ADR.** 5조건 중 (2) runtime 측정 · (4) 옵션 비교만 해당한다. 가설은 하나 (ΔT 미적용) 이고 이슈에서 이미 실측됐다.

---

## 배경

장면은 천체 위치 식 (Kepler 요소 · 달 B9 · N-body 초기 상태 · 사건 판정) 에 **장면 시계 JD 를 그대로** 넣는다. 그 식들의 시각 인자는 역학시 (요소 epoch · 율이 TDB 기준) 다. 그래서 위치가 ΔT (2017~2024년 약 69 s) 만큼 늦다. 지구 자전 (#1362) 은 장면 시계를 UT1 로 쓰므로 그쪽은 맞다. 두 규약이 한 장면 안에서 다른 시각척도를 쓰고 있다.

### 실측 (2026-10-23, architect — 앱 코드 변경 0)

**환경**: macOS · Apple M1 Pro · Node 24.14.0. 모델 계산은 develop `f26466b8` 를 빌드한 `packages/core/dist` 를 import 해 썼다 (`syzygyGeometryAt` · `heliocentricPositionAt` · `computeEventsForKind` · `earthRotationAngle` · `getSolarSystem`). 측정 스크립트는 일회성 (`scripts/_debug-1370-tmp.mjs`, 측정 직후 삭제 — volt #67 패턴).

**변이 실측** — 아래 결정 P3 를 scratch worktree 에 실제로 넣어 (`git worktree` · 커밋 안 함) core `tsc` 빌드와 core · web 단위 테스트를 돌렸다. Concrete Prediction 과 「갱신될 기대값」 목록은 이 변이의 결과다.

**기준값 출처** (2026-10-23 조회):

- Espenak–Meeus ΔT 다항식 — NASA GSFC `eclipse.gsfc.nasa.gov/SEhelp/deltatpoly2004.html` (Espenak & Meeus, *Five Millennium Canon of Solar Eclipses*, NASA/TP-2006-214141. 값의 원 출처 Morrison & Stephenson 2004, *J. Hist. Astron.* 35, 327–336). 연도 `y = 연 + (월 − 0.5)/12`.
- 윤초 표 (TAI − UTC) — IERS Bulletin C 를 옮긴 IANA `data.iana.org/time-zones/tzdb/leap-seconds.list`. 28행 (1972-01-01 `10 s` ~ 2017-01-01 `37 s`), 파일 만료일 **2027-06-28** (그 전까지 새 윤초 없음을 IERS 가 공지했다는 뜻). `TT − TAI = 32.184 s` (정의).
- NASA 최대식 — 2017-08-21 `18:26:40.3 TD` (ΔT `68.4 s`, 36.97°N 87.67°W) · 2024-04-08 `18:18:29 TD` (ΔT `69.2 s`, 25.29°N 104.13°W). 시각 · ΔT 는 PR #1369 R1 표와 같은 값이다.

#### 1-A. ΔT 모델 값 [s]

| 연 | (a) E–M 다항식 | (b) 윤초 표 + 1972 이전 E–M + 이후 상수 | (c) 상수 |
| --- | ---: | ---: | ---: |
| 1900.0 | −2.79 | −2.790 | 69 |
| 1940.0 | 24.41 | 24.407 | 69 |
| 1971.99 | 42.24 | 42.241 | 69 |
| 1972.0 | 42.25 | **42.184** | 69 |
| 2000.0 | 63.86 | 64.184 | 69 |
| 2017.64 (일식) | 70.34 | 69.184 | 69 |
| 2024.27 (일식) | 74.03 | 69.184 | 69 |
| 2026.0 | 75.07 | 69.184 | 69 |
| 2050.0 | 93.00 | 69.184 | 69 |
| 2100.0 | 202.74 | 69.184 | 69 |

- 1972년 이후 (b) 는 **TT − UTC 의 정의값**이다. 실제 ΔT (TT − UT1) 는 UTC 정의상 `|UT1 − UTC| < 0.9 s` 이므로 (b) 의 `±0.9 s` 안에 있다. 2026년이면 `68.3 ~ 70.1 s` 다.
- (a) 의 2005~2050 구간은 2005년 시점의 예측식이다. 2026.0 값 `75.07 s` 는 위 상한 `70.1 s` 를 `5 s` 넘는다. 이 구간은 이미 관측에서 벗어났다.
- (b) 의 1972 이음매는 `42.241 → 42.184` (`−0.057 s`) 다. 윤초마다 `+1 s` 계단이 생긴다 — 정의상 그렇다.

#### 1-B. 일식 그림자 지표 교점 — ΔT 축만 분리

같은 순간 (NASA UT = TD − ΔT_NASA), 같은 자전 (ERA(UT)), 같은 구 (지구 반경 데이터값) · J2000 황도 경사에서 **위치 시각만** 바꿔 지표 교점 사이 거리를 쟀다. 기준 = 위치를 TD 로 계산한 교점.

| | 2017-08-21 | 2024-04-08 |
| --- | ---: | ---: |
| 현행 (위치 = UT) ↔ 기준 | **68.5 km** | **72.6 km** |
| (a) E–M (ΔT `70.341` / `74.031` s) | 1.94 km | 5.08 km |
| (b) 윤초 표 (`69.184` / `69.184` s) | **0.78 km** | **0.02 km** |
| (c) 상수 69 s | 0.60 km | 0.21 km |

- 현행 행은 이슈의 `68.4 / 72.5 km` 를 `0.1 km` 안에서 재현한다.
- 잔차는 우리 ΔT 와 **NASA 가 가정한 ΔT** 의 차 × 약 `1 km/s` 다. 2017 의 NASA `68.4 s` 는 사전 예측값이고, 그 날의 TT − UTC 는 `69.184 s` 다. 그래서 2017 의 (b) 잔차 `0.78 km` 는 우리 쪽 오차가 아니다.

#### 1-C. 사건 시각 변화 — 사전 계산 1,510건

변환 후 사건 시각 (장면 시계) = 현행 시각 − ΔT(t). 종류별 변화 범위 [s]:

| 종류 | 건수 | (a) | (b) | (c) |
| --- | ---: | --- | --- | --- |
| 일식 | 455 | −202.0 ~ +2.2 | **−69.2 ~ +2.2** | −69.0 |
| 월식 | 458 | −202.1 ~ +2.1 | −69.2 ~ +2.1 | −69.0 |
| 화성 충 | 94 | −202.3 ~ +1.1 | −69.2 ~ +1.1 | −69.0 |
| 금성 내합 | 125 | −199.8 ~ +2.0 | −69.2 ~ +2.0 | −69.0 |
| 목성 충 · 토성 충 | 183 · 193 | −201.0 ~ +2.2 | −69.2 ~ +2.2 | −69.0 |
| 핼리 · 스위프트–터틀 근일점 | 1 · 1 | −54.9 · −59.1 | −55.2 · −59.2 | −69.0 |

- 양수는 1900년대 초다 (ΔT 가 음수).
- (b) 로 전 범위를 다시 계산했다 (범위를 TT 로 옮겨 계산 → 결과를 장면 시계로 되돌림, 아래 결정 P3 의 방식). 「현행 시각 − ΔT」 와의 최대 차는 `0 s`, 식 종류 변경 `0`건, 종류별 건수는 변하지 않는다 (`time-events-data.test.ts` 의 `EXPECTED_COUNTS` 그대로).
- **사건 id 날짜 변경 2건** (세 모델 모두 같은 2건): `solar-eclipse:1997-09-02 → 1997-09-01` (현행 `00:00:16 UTC`) · `lunar-eclipse:1996-04-04 → 1996-04-03` (현행 `00:00:27 UTC`). 범위 밖으로 나가는 사건은 `0`건.
- NASA 대조 (E4) — 일식 최대 오차 `0.02756 → 0.02832` 일, 월식 `0.02790 → 0.02870` 일 (장면 시계를 TD 와 그대로 비교한 경우). 허용치 규칙 `ceil(max × 10)/10 + 0.2 = 0.3` 일은 두 경우 모두 그대로다.

#### 1-D. 사건 선택 시각 t* 의 그림자 중심 ↔ NASA 최대식 지점

| | 2017-08-21 | 2024-04-08 |
| --- | ---: | ---: |
| 현행 (t* `18:39:38` / `17:56:58` UTC) | 339 km | 505 km |
| (b) 적용 후 (t* `18:38:29` / `17:55:49` UTC) | 314 km | 535 km |

- 이 거리는 **줄 것이라고 약속하지 않는다.** t* 의 오차는 달 모델 (분 단위) 이 지배한다. ΔT 적용 후 같은 위치가 69 s 이른 시계 시각에 오므로, 그 시각의 자전만큼 교점이 동쪽으로 `0.29°` 옮겨 간다. 그 방향이 NASA 지점 쪽이냐 반대쪽이냐가 사건마다 다르다.
- 이슈 DoD 의 「72.5 km 해소」 는 1-B (같은 순간의 ΔT 축) 의 값이다.

#### 1-E. 교육 투어

- **일식 투어** — 사건 id `solar-eclipse:2024-04-08` (`17:56:58 → 17:55:49 UTC`) · `lunar-eclipse:2025-03-14` (`07:06:51 → 07:05:41 UTC`) 모두 id 가 유지된다. offset (`−3 h`) 은 사건 시각 기준이라 따라 움직인다. 변이에서 `tours-content` · `plan-tour-step` 테스트는 그대로 통과했다.
- **계절 · 별자리 투어** — USNO 시각 (UT) 에서 장면 태양의 지심 황경 (J2000 황도, 장면 「지구」 = EMB):

| 상수 | 현행 λ☉ | (b) 적용 후 λ☉ | 이동 | 장면 J2000 지점 · 분점까지 |
| --- | ---: | ---: | ---: | ---: |
| 2024 하지 (`06-20 20:51 UT`) | 89.61599° | 89.61676° | 2.75″ | 9.658 → 9.639 h |
| 2024 추분 (`09-22 12:44 UT`) | 179.61400° | 179.61479° | 2.82″ | 9.468 → 9.449 h |
| 2024 동지 (`12-21 09:20 UT`) | −90.38865° | −90.38783° | 2.94″ | 9.159 → 9.140 h |

- ΔT 적용은 투어 장면을 `0.02 h` 옮긴다. 장면의 J2000 지점 · 분점은 USNO (그 날의 춘분점 기준) 보다 약 `9.1 ~ 9.7 h` 늦다. 이 차는 J2000 고정 좌표계 (세차 `≈ 0.34°`) · EMB · Kepler 요소에서 온다. ΔT 와 무관하고, 이번 범위 밖이다 (§비-범위).
- 근원일점 (EMB 모델 극값) — 2024 원일점 `−8.98 h`, 2025 근일점 `−26.25 h` (USNO 대비). ADR 1347 이 알려 둔 EMB 차다. ΔT 는 여기에 `−69.2 s` 를 더할 뿐이다.
- 그래서 계절 · 별자리 투어 상수 5개는 **값을 바꾸지 않는다.** 주석의 「TT≈UT 구분 없이 장면 시각」 만 「UT (= 장면 시계)」 로 고친다 — 이 ADR 이후에는 구분이 있고, 그 값들은 UT 쪽에 맞다.

#### 1-F. 변이에서 바뀐 기존 테스트 (결정 P3 · 기대값 미갱신 상태)

전부 「장면 시계 jd 로 기대값을 만들어 물리 함수 출력과 비교」 하는 parity 테스트다. 위치 경로가 실제로 바뀌었음을 보여 준다 — 기대값을 `clockJdToTt(jd)` 로 만들면 된다.

| 파일 | 실패 | 내용 |
| --- | ---: | --- |
| `packages/core/src/events/compute-events.test.ts` | 6 | M1 — t* 에서 Δλ · M 조건 (t* 를 TT 로 옮겨 평가해야 함) |
| `packages/core/src/events/eclipse-events.test.ts` | 4 | 최대식 정합 · 사전 필터 대조 (내부 함수는 TT, `computeEventsForKind` 는 시계) |
| `packages/core/src/scene/solar-system-scene-physical-phase.test.ts` | 8 | G3 · G4 — 장면 달 물리 위치 ↔ 체인 위치 |
| `packages/core/src/scene/solar-system-scene-lunar-orbit-line.test.ts` | 5 | V1 · M4 — 궤도선 · 궤적 시각 요소 |
| `packages/core/src/scene/solar-system-scene-eclipse-shadow.test.ts` | 2 | 그림자 uniform ↔ 판정식 기하 |
| `packages/core/src/scene/solar-system-scene-belt-frame.test.ts` | 2 | 지연 생성 epoch = 현재 장면 시각 |
| `packages/core/src/scene/solar-system-scene-trails.test.ts` | 1 | 역재생 꼬리 |
| `apps/web/src/lib/body-distance.test.ts` | 10 | 거리 == 독립 Kepler 계산 |
| `apps/web/src/lib/time-events-data.test.ts` | 1 | drift — 파일 재생성 후 통과 (변이에서 재생성 → `4 passed` 확인) |

- 변경 없이 통과한 것: 자전 (`self-rotation.test.ts` — 자전은 시계 그대로), NASA E4 · JPL 외부 기준 (`external-reference.test.ts`) · DE441 삭망 E1, N-body 계열, `EXPECTED_COUNTS`, 투어 테스트 전부.
- core `tsc` 빌드 0 error. web typecheck 는 변이에서 돌리지 않았다 (PR1 에서 확인).

---

## 후보 비교

### 축 M — ΔT 모델

| 축 | (a) Espenak–Meeus 다항식 | (b) 윤초 표 + 1972 이전 E–M + 표 이후 상수 | (c) 상수 69 s |
| --- | --- | --- | --- |
| 1차 출처 | NASA/TP-2006-214141 (Morrison & Stephenson 2004 기반) | IERS Bulletin C (IANA `leap-seconds.list`) + TT − TAI 정의 · 1972 이전 구간은 (a) | 없음 (2017~2024 근방 값) |
| 1972~현재 정확도 | 2005 이후 예측식이 관측을 벗어남 (2026년 `+5 s` 이상) | **정의값** (UT1 기준으로도 `±0.9 s`) | 2000년 `+4.8 s` · 1980년 `+17.8 s` 과다 |
| 1900~1972 | 관측 맞춤식 | (a) 와 같음 | 1900년 `+71.8 s` 오차 |
| 미래 (2027~2100) | 2100년 `202.7 s` — 외삽 | `69.184 s` 고정 — 「이후 윤초 없음」 가정 | `69 s` |
| ΔT 축 잔차 (1-B, 2024) | 5.08 km | **0.02 km** | 0.21 km |
| 코드 | 7구간 다항식 | 4구간 다항식 + 28행 표 | 상수 1개 |
| 갱신 | 없음 | 새 윤초 공지 시 표 1행 (표 만료 2027-06-28) | 없음 |

### 축 F — 표 이후 (미래) 외삽 [(b) 를 고를 때]

| 축 | F1 상수 `69.184 s` | F2 E–M 을 이음매 값에 맞춰 이어 붙임 | F3 E–M 그대로 |
| --- | --- | --- | --- |
| 시계 해석 | 장면 시계 = UTC (윤초 추가 없음) | 장면 시계 = UT1 근사 (예측) | 같음 |
| 이음매 | 없음 | 연속 (오프셋 필요) | 2027년 약 `+6.8 s` 계단 |
| 2100년 사건 시계 시각 | TT − 69.184 s | NASA 목록 UT 에 근접 | NASA 목록 UT 와 같음 |
| 근거 | 2017 이후 윤초 0건 · 표 만료 2027-06-28 | 예측식의 형태만 빌림 — 2026년에 이미 관측 상한 초과 | 같음 |

- F1 의 대가: 2100년 사건의 시계 시각이 NASA 목록 UT (ΔT 예측 `≈ 203 s` 적용) 보다 약 `134 s` 늦게 표시된다. 그리고 자전을 시계로 하므로 지표 교점이 NASA 예측 지도와 경도 약 `0.56°` 다르다 (`134 s × 15.04″/s`). 미래 UT1 은 누구도 모르는 값이고, 자전 근사 (#1362) 쪽 축이다.

### 축 P — 적용 지점

| 축 | P1 단일 변환점 (`SimulationCore` 가 TT 를 내보냄) | P2 물리 함수 내부 (`parentRelativePositionAt` 등이 시계를 받음) | **P3 진입점 3곳에서 한 번씩** |
| --- | --- | --- | --- |
| 자전 · 표시 · URL | 다시 시계로 역변환해야 함 (변환 2회) | 그대로 | 그대로 |
| web 거리 카드 · 사건 계산 | `SimulationCore` 를 거치지 않음 — 단일점이 성립하지 않음 | 덮임 | 진입점이 각각 1회 |
| 이중 변환 위험 | 낮음 | **높음** — 체인 (`resolveBodyChainPosition → parentRelativePositionAt`) · N-body 초기 (`buildInitialState → elementsAt`) · trail (`M(jd)`) 이 서로 부른다 | 진입점이 물리 함수 밖이라 없음 |
| JPL · DE441 기준 테스트 | 영향 없음 | TDB 입력 테스트가 시계로 바뀌어 깨짐 | 영향 없음 (물리 함수는 TT 그대로) |
| 변이 실측 | — | — | 소스 5파일 · typecheck 0 · 실패는 parity 테스트만 (1-F) |

---

## 결정 (권고안 — 사용자 결정 대기)

### M — ΔT 모델: (b) 윤초 표 + 1972 이전 E–M + 표 이후 상수 (Q1 · Q2 · Q3)

`packages/core/src/time/` 에 신규 모듈 하나를 둔다. 이름은 아래로 고정한다 (dev · 리뷰 · 문서가 같은 이름을 쓰도록).

- `ttMinusClockSeconds(clockJd)` — TT − 장면 시계 [s]
  - `clockJd ≥ 1972-01-01` → `32.184 + TAI−UTC(clockJd)` (윤초 표 28행, 키 = 시계 JD. 2017-01-01 이후 `69.184`)
  - `1900 ≤ y < 1972` → E–M 다항식 (1900–1920 · 1920–1941 · 1941–1961 · 1961–1986 구간식, 1-A 출처)
  - `y < 1900` → 1900.0 값 (`−2.79`) 유지 (Q3)
- `clockJdToTt(clockJd)` = `clockJd + ttMinusClockSeconds(clockJd) / 86400`
- `ttJdToClock(ttJd)` — 역변환. 고정점 반복 (`c ← tt − Δ(c)/86400`) 2~3회로 충분하다 (ΔT 변화율 `≤ 1 s/년`). 윤초 직후 TT `1 s` 구간은 역상이 없다 — 근처 값을 돌려준다 (사건 시각이 그 1초에 들 확률은 무시).
- 표 · 다항식 계수 주석에 1-A 의 출처 URL 과 조회일 · 표 만료일을 적는다 (principles §1 — 하드코딩 + 출처).

### P — 적용 지점: 진입점 3곳 (P3)

**규약 (주석 계약으로 박제한다):**

- 물리 함수 (`positionAt` · `elementsAt` · `parentRelativePositionAt` · `resolveBodyChainPosition` · `heliocentricPositionAt` · `buildInitialState` · `syzygyTimes` · `eclipseEvents` · `greatestEclipseNear` · `perihelionTimes` · `heliocentricAlignmentTimes` · 소행성대 · 궤적 샘플러) 의 시각 인자는 **TT JD** 다. 함수 본문은 바꾸지 않는다.
- 장면 시계 JD 는 진입점에서 **정확히 한 번** TT 로 바뀐다.
- 자전 (`computeSpinQuaternion` — 지구 ERA 포함 전 천체) · 구름 드리프트 (`applyCloudDrift`) 는 **시계 JD** 를 쓴다.

**진입점:**

1. **장면** — `solar-system-scene.ts` `updateAt(clockJd)` 첫 줄에서 `jd = clockJdToTt(clockJd)`. 장면 안 `currentJd` 는 TT, 새 `currentClockJd` 는 시계다.
   - TT 를 쓰는 곳 (변경 없음 — 이미 `jd` · `currentJd` 를 쓴다): Kepler (`updateAtKepler`) · N-body `advance` 간격과 `buildNewton` · 궤도선 (`rebuildOrbitLines` · `refreshPrecessingOrbitLines`) · 궤적 · 소행성대 · 카이퍼대. 식 그림자 uniform 과 장면 거리 자는 `worldPositions` · 메시에서 읽으므로 따라온다.
   - 시계로 바꾸는 곳 4개: `computeSpinQuaternion(clockJd, …)` · `applyCloudDrift(cloudLayer, clockJd, …)` · 구름 지연 생성의 `applyCloudDrift(layer, currentClockJd, …)` · 엔진 복귀 재진입 `updateAt(currentClockJd)`.
   - 초기값: `currentJd = clockJdToTt(initialJulianDate)` · `newtonLastJd` 도 같다.
2. **사건 계산** — `compute-events.ts` `computeEventsForKind` 가 `[from, to)` (시계, `window` 포함) 를 TT 로 옮겨 내부 함수를 부르고, 결과 시각을 `ttJdToClock` 으로 되돌린다. id 날짜 (`eventDateIso`) 는 되돌린 시계 시각으로 만든다. 내부 함수 시그니처는 그대로 (TT).
3. **web 거리** — `apps/web/src/lib/body-distance.ts` `resolveBodyChain` 이 `clockJdToTt(jd)` 를 `resolveBodyChainPosition` 에 넘긴다. 정보 카드 · 거리 자 행이 모두 이 함수를 지난다. N-body 엔진 상태 (`getBodyState`) 는 엔진 시각이라 그대로다.

- 새 모듈은 core 루트 `index.ts` 에 named export 한다 — web 카드는 SSR 평가 대상이라 `time` namespace 를 쓰지 않는다 (ADR `20260504-r-phase-allowlist-guard` §Amendment 결정 D1 패턴, `body-distance.ts` 의 기존 사유와 같다). 모듈은 import 0 이라 모듈 그래프 영향이 없다.

**경로 간 불일치가 생기지 않는 이유:** 시계 → TT 변환이 물리 함수 **밖** 에만 있다. 그래서 물리 함수끼리 서로 불러도 이중 변환이 생기지 않는다. 진입점 셋은 각자 1회 바꾼 뒤 같은 물리 함수를 부른다 — 장면 (Kepler) · 사건 · 거리 카드가 같은 시계 시각에서 같은 TT 위치를 얻는다. 이것을 확인하는 것은 기존 parity 테스트다 (1-F — 장면 달 ↔ 체인, 거리 ↔ 독립 Kepler, 사건 t* ↔ 조건식). 변이에서 이 테스트들이 시계 기대값으로 **실패** 했으므로 판별력이 있다. 새 가드는 만들지 않는다 (사용자 방침).

### T — 기준값 대조 테스트 (Q4)

`computeEventsForKind` 출력 (시계) 을 NASA (TD) · JPL Horizons (TDB) 와 비교하는 테스트 (`eclipse-events.test.ts` E4 · `external-reference.test.ts`) 는 모델 사건 시각을 `clockJdToTt(t*)` 로 옮긴 뒤 비교한다. 같은 시각척도끼리 비교하면 오차가 순수 모델 오차가 된다. 1-C 실측대로 옮기지 않아도 허용치 규칙은 바뀌지 않는다. `EVENT_KIND_TOLERANCE_DAYS` 는 바꾸지 않는다. DE441 삭망 E1 은 내부 함수 `syzygyTimes` (TT) 를 직접 부르므로 이미 같은 척도다 — 바꾸지 않는다.

### E — 사건 id 날짜 변경 2건 수용 (Q5)

`solar-eclipse:1997-09-01` · `lunar-eclipse:1996-04-03` 이 된다. id 날짜는 「모델 t* 의 UTC 날짜」 규칙 그대로다. 코드 · 투어 · URL 어디에도 이 두 id 를 참조하는 곳이 없다 (`git grep` 결과 NASA fixture 의 날짜 행 2개뿐이고, fixture 는 시각으로 짝짓는다).

### R — 1347 사전 계산 파일 재생성 (#1349 절차)

같은 PR 에서 core 를 빌드한 뒤 `pnpm --filter @astro-simulator/web generate:time-events` 로 다시 만든다 (ADR 1347 Amendment 2). PR 본문에 「사건 시각 변화량 표 (1-C 형식) · 갱신한 테스트 기대값 표 (1-F 형식)」 를 남긴다 — #1349 가 GM 교정 때 남긴 근거 표와 같은 구성이다.

### PR 분할 (Q6)

- **PR0** — 이 ADR (`docs/1370-delta-t-adr`).
- **PR1** — 구현 1개: 신규 모듈 + 진입점 3곳 + 자전 분리 + 테스트 기대값 갱신 + 사건 파일 재생성 + 주석 정정. 변이 실측 기준 소스 5파일 · 테스트 9파일 · 데이터 1파일이라 나누면 중간 상태 (장면은 TT · 사건 파일은 옛 시각) 가 develop 에 남는다. 그 상태가 이슈가 없애려는 「경로 간 불일치」 다.

---

## 사용자 결정 (Q 표)

| Q | 질문 | 선택지 | 권고 | 근거 |
| --- | --- | --- | --- | --- |
| Q1 | ΔT 모델 | (a) E–M / **(b) 윤초 표 + 1972 이전 E–M** / (c) 69 s | **(b)** | 2024 ΔT 축 잔차 `0.02 km` (a `5.08` · c `0.21`). 1972 이후는 정의값이라 출처 검증이 가능하다. (c) 는 1900년 `72 s` 틀린다 |
| Q2 | 표 이후 (2017-01-01~) 외삽 | **F1 상수 `69.184 s`** / F2 E–M 이어 붙이기 / F3 E–M 그대로 | **F1** | 2017 이후 윤초 0건 · 표 만료 2027-06-28. E–M 예측식은 2026년에 이미 관측 상한을 `5 s` 넘었다. 대가 — 2100년 사건 시계 시각이 NASA 목록 UT 보다 약 `134 s` 늦다 (축 F) |
| Q3 | 1900 이전 (스크러버 밖) | **1900.0 값 유지** / E–M 이전 구간 추가 | **유지** | 스크러버 범위 밖. 재생 · URL 로만 닿는다. 구간을 늘리면 출처 · 테스트가 는다 |
| Q4 | NASA · JPL 대조 테스트 (`computeEventsForKind` 출력) | **TT 로 옮겨 비교** / 그대로 | **TT 로** | 같은 척도끼리 비교. 줄 수는 테스트당 1식. 허용치는 어느 쪽이든 불변 (1-C) |
| Q5 | 사건 id 날짜 변경 2건 | **수용** / id 만 TT 날짜 유지 | **수용** | id 규칙 (모델 t* 의 UTC 날짜) 을 지킨다. 참조처 0 |
| Q6 | PR 분할 | **구현 1 PR** / 모듈 · 장면 · 사건 분리 | **1 PR** | 분리하면 경로 간 불일치 중간 상태가 develop 에 남는다 |

---

## 완료 기준 (DoD — 측정 가능)

수치의 측정 환경은 §실측 과 같다 (Node 24.14.0 · `packages/core/dist`). PR1 의 dev 는 같은 방식의 일회성 스크립트로 D1 을 재고 PR 본문에 적는다 (스크립트는 커밋하지 않는다).

- **D1** — 2024-04-08 NASA 최대식 순간 (`18:17:19.8 UT`) 그림자 지표 교점: 위치를 TD 로 계산한 교점까지 거리 `72.6 km → ≤ 0.1 km`. 2017-08-21 (`18:25:31.9 UT`) `68.5 km → ≤ 1.0 km` (NASA 가정 ΔT `68.4 s` 와 TT − UTC `69.184 s` 의 차가 남는다).
- **D2** — `ttMinusClockSeconds` 단위 테스트: `2024-04-08T18:17:20Z` → `69.184` · `2016-12-31T23:59:59Z` → `68.184` · `2017-01-01T00:00:00Z` → `69.184` · `1972-01-01T00:00:00Z` → `42.184` · `1900-01-01` → `−2.79 ± 0.01` · `2100-01-01` → `69.184`. `ttJdToClock(clockJdToTt(t))` 왕복 오차 `≤ 1e-6 s` (윤초 경계 1초 제외).
- **D3** — 사전 계산 파일: 재생성 후 drift 테스트 통과 · 종류별 건수 불변 (`EXPECTED_COUNTS` 무변경) · 각 사건 시각 변화 = `−ttMinusClockSeconds` (`|차| ≤ 1e-6 s`) · id 변경 정확히 2건 (§결정 E) · 식 종류 변경 0건.
- **D4** — parity: 1-F 표의 테스트가 기대값을 `clockJdToTt` 로 만들어 통과한다. 장면 Kepler 메시 위치 (시계 `t`) 는 체인 위치 (`clockJdToTt(t)`) 와 비트 동일 (기존 M4 · G3 단언 형식).
- **D5** — 자전 불변: 시계 `t` 의 지구 · 행성 자전 quaternion 이 변경 전과 비트 동일 (`self-rotation.test.ts` 무수정 통과).
- **D6** — 대조 테스트 (Q4): NASA E4 · JPL 외부 기준 (TT 로 옮겨 비교) · DE441 E1 (무수정) 통과 · `EVENT_KIND_TOLERANCE_DAYS` 무변경.
- **D7** — 투어: `tours-content` · `plan-tour-step` 무수정 통과. `season-dates.ts` · `eclipse-tour.ts` 상수 값 무변경 (주석만).
- **D8** — 실브라우저 (실 Chrome 1회): 콘솔 에러 0 · 사건 「2024-04-08 개기일식」 선택 시 store 시각이 `17:55:49 UTC` (변경 전 `17:56:58`) · 일식 투어 2단계에서 달 그림자가 지구 위에 보인다.

---

## Visual Fidelity (principles §1 의무 체크리스트)

- [x] **데이터 SSoT 보존** — `solar-system.json` 무변경. 시각척도만 맞춘다.
- [x] **rendering 시점 분리** — 변환은 시각 입력에만 있다. 위성 시각 배율 · tier 배율과 만나지 않는다.
- [x] **사용자 가이드** — 고지 신설 없음 (사용자 결정 2026-10-18 — 지리 오차는 따로 알리지 않는다).
- [x] **비율 baseline** — 1-B · 1-C 표.

---

## 결과 · 재검토 조건

### Concrete Prediction (PR1)

변이 실측 (§실측 1-F) 에 근거한다.

- **소스 6파일 (신규 1 + 기존 5)**: 신규 `packages/core/src/time/<ΔT 모듈>.ts` · 기존 `packages/core/src/time/index.ts` (export) · `packages/core/src/index.ts` (named export) · `packages/core/src/scene/solar-system-scene.ts` · `packages/core/src/events/compute-events.ts` · `apps/web/src/lib/body-distance.ts`. 변이가 건드린 파일과 같다.
- **변환 호출 지점 = 3** (진입점 1 · 2 · 3) + 역변환 1 (사건 결과). **자전 쪽 시계 전환 = 4곳** (§결정 P 진입점 1).
- **물리 함수 본문 변경 = 0.**
- **테스트**: 신규 1 (ΔT 모듈) + 기대값 갱신 9파일 (1-F) + Q4 대조 테스트 비교식 (`eclipse-events.test.ts` E4 · `external-reference.test.ts`).
- **데이터 1파일**: `time-events.json` 재생성.
- **주석 정정**: `season-dates.ts` · `eclipse-tour.ts` (「TT≈UT 구분 없이」) · NASA · 외부 · DE441 fixture 머리 주석 (「모델 JD 는 앱과 같이 그대로」) · `AstroEvent.julianDate` · `earthRotationAngle` (시계 = UT1 근사 문장은 유지).
- 반증 조건: PR1 에서 위 밖의 소스 파일이 바뀌면 (예: 다른 web 위치 계산 경로 발견) PR 본문에 반증으로 적고 이 ADR 을 Amendment 한다.

### 재검토 조건

1. IERS 가 새 윤초를 공지하거나 `leap-seconds.list` 가 만료 (2027-06-28) 를 넘기면 → 표 1행 추가 또는 만료일 주석 갱신 (데이터 변경, 사건 파일 재생성 동반).
2. 자전을 GMST · UT1 실측으로 바꾸는 이슈가 생기면 → 축 F 를 다시 판정한다 (그때 시계 = UT1 해석이 필요해진다).
3. 위치 모델이 J2000 고정 좌표계에서 「그 날의 좌표계」 로 바뀌면 → 계절 투어 상수의 장면 지점 정합 (1-E, 약 9 h) 을 다시 잰다.

---

## 비-범위

- 자전 ERA → GMST, 지심 → 측지 위도 (사용자 결정 2026-10-18 — 이 이슈 범위 밖).
- 지리 오차 화면 고지 (사용자 결정 2026-10-18).
- TT ↔ TDB (`< 2 ms`) · 광행차 · 광시간.
- 계절 투어의 장면 지점 ↔ USNO 약 9 h (1-E — J2000 좌표계 · EMB 기원, ΔT 무관). 범위 밖 발견으로 PR 코멘트에만 기록한다 (검증 강도 게이트 — 실피해 관측 전 이슈화하지 않음).
- 근원일점 EMB 차 (ADR 1347 기지).
- 신규 가드 스크립트 · CI 단계 (사용자 방침).

---

## 구현 인계 (PR1)

- **시작 지점**: 신규 ΔT 모듈 → 단위 테스트 (D2) → `solar-system-scene.ts` `updateAt` (진입점 1) → `computeEventsForKind` (진입점 2) → `body-distance.ts` `resolveBodyChain` (진입점 3) → 1-F 테스트 기대값 → core 빌드 → `generate:time-events` → 주석.
- 자전 쪽 4곳은 `jd` 를 `clockJd` 로 **이름부터** 바꿔 둔다 — `updateAt` 안에서 `jd` 가 TT 를, `clockJd` 가 시계를 뜻하게 하면 이후 수정자가 헷갈리지 않는다.
- **명시적 비-범위 (손대지 말 것)**: 물리 함수 본문 · `self-rotation.ts` 의 식 · `EVENT_KIND_TOLERANCE_DAYS` · 투어 상수 값 · `solar-system.json`.
- 참조: §실측 1-F (변이에서 실패한 테스트와 이유), ADR 1347 Amendment 2 (재생성 절차 — core `dist` 선행 빌드).

---

## 교차검증 반영 사항

메인 오케스트레이터가 cross-validate 1회를 수행한 뒤 이 절을 채우고 상태를 Accepted 로 전이한다 (Provisional — CLAUDE.md ADR Status 워크플로).

### 호출 전 Claude 편향 셀프 체크

- 낙관적 일정 — Concrete Prediction 을 변이 실측 파일 목록으로만 적었다. 통과.
- 결합 간과 — 자전 · 구름 · 엔진 복귀 재진입 · 초기값 (`newtonLastJd`) 을 변이로 찾았다. **미확인 축**: CI 브라우저 가드 (`verify:*`) 중 고정 시각 장면을 비교하는 것의 기대값 변동 — 변이에서 돌리지 않았다. cross-validate 질문에 넣는다.
- 폐기 프레이밍 — (a) · (c) 를 수치로 기각했다. 통과.
- 순수주의 — TT ↔ TDB · UT1 실측표를 넣지 않는 쪽을 골랐다 (`< 0.9 s` · `< 2 ms`). 통과.
