# ADR: 행성 근일점 세차 검증 (수성/금성/지구) — 헬퍼 추출 + 적분 정밀도 폴백

- **상태**: Accepted
- **날짜**: 2026-04-17
- **결정자**: architect (P6-D #192)
- **관련**: P6-D #192, P6-C #191 (선행 EIH 구현), P5-A #178 (선행 single 1PN), 마스터 #188

## 배경

P6-C에서 EIH 1PN 다체를 도입해 수성 41~46″/century · 9체 100년 drift `< 1e-6/orbit`을 달성했다.
P6-D는 EIH 식이 다체에서 의도대로 작동함을 직접 보이는 검증 단계다. 측정 대상:

- 수성 42.98″/century (P5 회귀 가드 — Single 모드 무수정 보존)
- 금성 8.62″/century ±5% (신규, GR 기여분만)
- 지구 3.84″/century ±5% (신규, GR 기여분만)

위험: 금성·지구는 신호 크기가 수성의 1/5~1/11(절대 허용 ±0.43″/±0.19″)이고 거의 원형 궤도라
근일점 측정이 노이즈에 민감하다. 100년 적분에서 step 크기·적분기 truncation이 이 신호 아래로 떨어져야 한다.

또한 P6-C에서 이미 `mercury_perihelion_precession_eih` / `mercury_perihelion_precession_43_arcsec` 두 테스트가
유사한 perihelion 측정 패턴을 사용하므로, 행성을 추가할 때 코드 중복을 막을 구조 결정이 필요하다.

## 후보 비교

### 1. 테스트 구조 — 헬퍼 추출 vs 별도 테스트 vs 매크로

| 후보                                                                                   | 장점                         | 단점                            | 비고                                |
| -------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------- | ----------------------------------- |
| A: 별도 테스트 2개 (`venus_perihelion_eih`, `earth_perihelion_eih`) 단순 복붙          | 가장 단순, 변경 영향 좁음    | 측정 로직 3중복(수성 EIH 포함)  | 화성 추가 시 더 비대화              |
| B: 헬퍼 `measure_perihelion_precession_eih(name, M, a, e, period, expected, tol)` 추출 | 중복 제거, 화성 등 확장 용이 | 기존 EIH 수성 테스트 1개 리팩터 | Single 모드 회귀 가드는 무수정 보존 |
| C: `perihelion_test!(venus, ...)` 매크로                                               | DSL 가독성                   | 매크로 디버깅·IDE 지원 약함     | 행성 2개 추가에 매크로 가치 미미    |

### 2. 초기 조건 — JPL ephemeris vs simplified Keplerian

| 후보                                                 | 장점                           | 단점                               | 비고                               |
| ---------------------------------------------------- | ------------------------------ | ---------------------------------- | ---------------------------------- |
| A: JPL DE441 ephemeris (특정 epoch)                  | 실 행성 위상·궤도 평면 정확    | 외부 데이터 의존, 단위 테스트 비대 | P6-D 범위 초과                     |
| B: simplified Keplerian (근일점 시작, vis-viva 속도) | P6-C `eih_9body_*`와 동일 패턴 | 황도 경사·노드 무시                | secular GR 세차는 위상 무관 → 충분 |

### 3. 적분 정밀도 — step / 적분기 격상 트리거

| 후보                                             | 장점                          | 단점                                  | 비고                        |
| ------------------------------------------------ | ----------------------------- | ------------------------------------- | --------------------------- |
| A: 기존 dt=60s(수성) / dt=1hour(9체) 그대로 사용 | 비용 동일, P6-C에서 충분 검증 | 금성·지구 정밀도 미달 가능성 잔존     | 1차 시도, 통과 시 종결      |
| B: 사전 step 절반/1/4 축소 (안전 마진)           | 통과 확률 ↑                   | 시뮬 시간 2~4×, 불필요할 수 있음      | A가 미달 시 폴백            |
| C: Yoshida 4차 심플렉틱 적분기 격상              | 정밀도 차원이 다름            | 코드 변경 큼, EIH 식 검증과 결합 위험 | B도 미달 시 P6-E ADR 재검토 |

### 4. ADR 작성 — 검증 작업의 박제 가치

| 후보                                               | 장점                                | 단점                             | 비고                     |
| -------------------------------------------------- | ----------------------------------- | -------------------------------- | ------------------------ |
| A: ADR 미작성 — 이슈 코멘트 + 테스트 주석으로 충분 | 가벼움                              | 격상 트리거·출처가 코드에 흩어짐 | type:test 작업 통상 패턴 |
| B: 짧은 ADR 작성 (~100줄, 헬퍼·트리거·출처 박제)   | P6-E 회고 시 단일 참조점, 후속 빠름 | 약간의 작성 비용                 | P6-A/B/C 패턴과 일관     |

## 결정

**1B + 2B + 3A(폴백 3B → 3C) + 4B 채택.**

1. **헬퍼 추출**: P6-C의 `measure_perihelion_angle()`은 `MERCURY_PERIOD` 상수에 하드코딩돼 있다.
   이를 행성-일반 헬퍼 `measure_perihelion_precession_eih(name, mass, a, e, period, expected_arcsec, tol_pct)`로 승격한다.
   - 기존 `mercury_perihelion_precession_eih` 함수 본체는 헬퍼 호출 1줄로 변경 (보너스 가드 보존)
   - `mercury_perihelion_precession_43_arcsec` (Single 모드 회귀 가드)는 **무수정 보존** — 헬퍼 추출 대상 제외
   - 신규 테스트: `venus_perihelion_eih_within_5_percent`, `earth_perihelion_eih_within_5_percent`
2. **초기 조건**: simplified Keplerian (근일점 시작 + vis-viva 속도). P6-C `eih_9body_100yr_eccentricity_drift`와 동일 패턴.
   GR 세차는 secular 효과라 노드/경사 평면 무관.
3. **적분 정밀도 1차 시도**: 기존 패턴 그대로 — `dt = 60s`, 100년 적분.
   - P6-C에서 `eih_9body_100yr_eccentricity_drift` (dt=1hour) 가 금성 2.8e-7/orbit · 지구 7.8e-8/orbit drift
     이미 달성 → 2체 EIH (dt=60s)는 더 보수적이라 통과 확률 높음
   - **폴백 트리거**: 미달 시 dt=30s → dt=15s 순차 축소 (3B). 그래도 미달이면 P6-E에서 적분기 격상 ADR (3C)

   **실측 결과 (P6-D 구현 시)** — 1차 시도(dt=60s) 금성 3.38″/century(60% 미달) · 지구 1.27″(67% 미달)로
   대규모 미달. 폴백 dt=30s/15s/7.5s/5s/2.5s 순차 축소 후 dt=2.5s에서 모든 DoD 통과:
   - 수성 EIH 42.59″ (rel_err 0.90%, ±5% PASS)
   - 금성 EIH 8.67″ (rel_err 0.63%, ±5% PASS)
   - 지구 EIH 3.74″ (rel_err 2.48%, ±5% PASS)

   소요시간(release, 4 thread) ≈ 223초. CI 부담 있으나 결정적 검증이라 허용. 적분기 격상(3C)은 P6-E 회고 시 재평가.

4. **ADR 작성** — 본 문서. P6-A/B/C가 모두 ADR을 가진 일관성 + P6-E 회고에서 단일 참조점.

## 측정 알고리즘 (헬퍼 시그니처)

```rust
/// 행성-일반 EIH 1PN 근일점 세차 측정.
/// - 첫 궤도: angle_0 (근일점 방향 라디안)
/// - 중간 (orbits-2)궤도 빠르게 전진
/// - 마지막 궤도: angle_final
/// - precession = (angle_final - angle_0) × 206265″/rad / centuries
/// - 통과: |precession - expected| / expected < tol_pct/100
fn measure_perihelion_precession_eih(
    name: &str,
    planet_mass: f64,
    semi_major: f64,
    eccentricity: f64,
    period: f64,
    expected_arcsec_per_century: f64,
    tol_pct: f64,
) -> f64;
```

P6-C `measure_perihelion_angle` 패턴(`min_r` 추적으로 근일점 통과 시점 발견 → atan2)을 그대로 옮긴다.
하드코딩된 `MERCURY_PERIOD`만 인자화.

## 행성 파라미터 (NIST/IAU)

| 행성 | 질량 (kg) | a (m)     | e       | period (s)    | GR 세차 (″/century) | 출처               |
| ---- | --------- | --------- | ------- | ------------- | ------------------- | ------------------ |
| 수성 | 3.301e23  | 5.791e10  | 0.20563 | 87.969 × DAY  | 42.98               | Einstein 1915      |
| 금성 | 4.867e24  | 1.0821e11 | 0.00677 | 224.701 × DAY | 8.62                | Will (TEGP 2nd)    |
| 지구 | 5.972e24  | 1.4960e11 | 0.01671 | 365.256 × DAY | 3.84                | IAU / Pitjeva 2014 |

값은 P6-C `eih_9body_100yr_eccentricity_drift`와 동일 (수성·금성·지구 행). 출처는 테스트 본문 주석에도 박제.

## 결과·재검토 조건

### 기대 효과 (DoD)

- **D1**: `mercury_perihelion_precession_43_arcsec` 통과 유지 (Single 모드 회귀 가드) — 41.46″/century (P5-A 동일)
- **D2**: `venus_perihelion_eih_within_5_percent` — 8.67″/century (rel_err 0.63%) PASS
- **D3**: `earth_perihelion_eih_within_5_percent` — 3.74″/century (rel_err 2.48%) PASS

#### 적용 dt (실측)

- 1차 시도 dt=60s → D2/D3 모두 60% 이상 미달
- 순차 축소 dt=30s, 15s, 7.5s, 5s 모두 미달
- **dt=2.5s 채택** — 모든 DoD ±5% 이내 통과
- Velocity-Verlet 적분기 그대로 (격상 3C 미발동, P6-E에서 재평가 가능)

### 트레이드오프

- 헬퍼 추출 → 테스트 1개 리팩터 (수성 EIH 보너스 가드). Single 모드 회귀 가드는 무수정.
- simplified Keplerian → JPL ephemeris의 정확한 위상 재현 포기. secular 측정에는 영향 없음.
- 100년 적분 시간 (dt=60s × 8.76e6 step × 2~3 행성 EIH) — 수 분 소요. CI에는 부담 없음.

### 재검토 트리거

1. **D2/D3 미달 (1차 시도, dt=60s)** → dt=30s → dt=15s 순차 축소. 비용 2~4× 증가지만 단위 테스트 단발이라 허용.
2. **적분기 격상 ADR (Yoshida 4차 심플렉틱 또는 RK8) 필요 조건** (갱신 2026-04-17, P6-E reviewer MINOR):
   원래 "dt=15s에서도 미달 시"로 기재했으나 실측에서 dt=2.5s 5단계 폴백으로 **격상 미발동**.
   향후 재격상 트리거는 다음 정량 기준으로 재정의:
   - **지구 rel_err > 4%** (현재 2.48%, 5% 허용치에 1.5% 여유) — 마진이 절반 이하로 축소되면 격상
   - 또는 **dt < 1s 필요** (현재 2.5s, 추가 4배 이상 축소 요구 시 적분기 선택이 문제)
   - 또는 **CI 실행 시간 > 15분** (현재 ~223초, 4배 증가 시 심플렉틱 고차 적분기가 비용-이득 우위)
     EIH 식 자체가 아닌 적분기 truncation이 신호를 잠식한 경우로 한정 — 세 조건 중 하나라도 충족 시 별도 ADR로 격상.
3. **P5 회귀 발생 (D1 실패)** → 본 ADR 즉시 무효화, P6-C EIH 식 회귀 분석 (헬퍼 추출 시 의도치 않은 변경 의심).
4. **화성 등 추가 행성 검증 요구** → 헬퍼 시그니처 그대로 호출, 본 ADR 갱신 불필요.
5. **JPL ephemeris 비교 요구 (행성 섭동 분리 정밀도 검증)** → simplified Keplerian → DE441 마이그레이션 별도 ADR.

## 비-범위 (P6-D에서 절대 손대지 않음)

- 1PN 가속도 식 / EIH 식 / `GrMode` enum (P5-A · P6-C에서 확정)
- `apply_gr_correction()` / `apply_eih_correction()` 함수 본체
- `mercury_perihelion_precession_43_arcsec` 테스트 본문 (Single 모드 회귀 가드)
- WASM bindgen 신규 노출 (검증 작업이므로 새 API 불필요)
- 시각화 (`geodesic.rs`, `black-hole-rendering.ts`, `gravitational-lensing.ts`)
- E2E Playwright (`?gr=eih`) — 별도 후속
- 적분기 변경 (Velocity-Verlet 유지, 격상은 재검토 트리거 발동 시 P6-E에서 별도 ADR)

## 참고

- ADR `20260417-eih-1pn-multibody.md` — P6-C EIH 식 정의, dt 정밀도 폴백 선례
- ADR `20260417-general-relativity-1pn.md` — P5-A Single 1PN 식, 회귀 가드 원본
- 이슈 #192 — P6-D 스프린트 계약
- 마스터 #188 — P6 마일스톤
- Will C.M., _Theory and Experiment in Gravitational Physics_ (2nd ed.) — 금성/지구 GR 세차 출처
- Pitjeva E.V., Pitjev N.P. (2014), _Celestial Mechanics and Dynamical Astronomy_ — 행성 근일점 ephemeris
- Park R.S. et al. (2017), _Astronomical Journal_ 153:121 — 금성 GR 세차 독립 검증치 (테스트 주석 `nbody.rs:690` 박제, P6-E reviewer MINOR로 ADR 참고 섹션에도 명시)
