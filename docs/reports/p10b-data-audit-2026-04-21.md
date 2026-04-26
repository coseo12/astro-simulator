# P10-B-2 데이터 감사 보고서

> **Phase**: P10-B-2 (IAU 2015 전수 대조 + JSON 수정)
> **Issue**: [#274](https://github.com/coseo12/astro-simulator/issues/274)
> **Date**: 2026-04-21
> **감사 대상**: `packages/shared/data/solar-system.json` (24 bodies) + `packages/shared/src/constants/solar-system.ts`
> **방법론**: [docs/reports/p10b-audit-methodology.md](./p10b-audit-methodology.md)

---

## 요약

- **감사 대상 body**: 24 (태양 1 + 행성 8 + 위성 5 + 왜소행성 5 + 혜성 3 + Phobos/Deimos 2)
- **IAU 대조 테이블 커버리지**: 24/24 (100%)
- **공차**: ±0.01% (Fact-First 원칙 §2)
- **수정 항목 (mass/radius)**: 9건
- **신규 필드 적용**: `dataSource` 24건 / `lastVerified` 24건 / `colorSource` 24건 / `uncertainty` 8건 (irregular body)
- **최종 `verify-iau-data.mjs` 결과**: **0 errors / 0 warnings** ✅

## 구조적 결정: radius 규약 (A안)

### 배경

JSON `radius` 필드가 mean/equatorial 혼재. B-1 방법론에서 옵션 A/B/C 제시 → **A안 (equatorial 통일) 채택**.

### 규약

| 분류                      | radius 정의                                 | 대상                                                                     |
| ------------------------- | ------------------------------------------- | ------------------------------------------------------------------------ |
| near-spherical 거대 행성  | IAU 2015 equatorial nominal                 | Jupiter/Saturn/Uranus/Neptune/Earth/Mars                                 |
| small-oblate (편평도 ≈ 0) | mean radius (eq ≈ mean, 공차 내)            | Mercury/Venus/Moon/Io/Europa/Ganymede/Callisto/Ceres/Pluto/Makemake/Eris |
| irregular body            | volumetric mean + `uncertainty.radius` 필수 | Phobos/Deimos/Haumea/3 혜성                                              |

### 근거

1. 계약 §11 "±0.01% 초과 시 즉시 수정" 정책 정합
2. IAU 2015 B3 nominal = equatorial 국제 표준
3. 렌더 영향 < 시각 과장 오차 (educational 디폴트 ×20 과장)
4. 스키마 확장 (`radiusEquatorial`/`radiusPolar`/`radiusMean`) 없이 JSON 상단 주석 + 본 보고서 + CLAUDE.md 연결로 의미 명시

### 후속 (별도 이슈 권장)

radius 3필드 분리 (B안) 는 polar/mean 데이터가 추가 필요한 Phase 에서 재검토. 현재 스프린트 범위 외.

## 수정 항목 (9건)

### `solar-system.json` (8건)

| Body    | 필드   | Before          | After      | 차이    | 출처                         |
| ------- | ------ | --------------- | ---------- | ------- | ---------------------------- |
| mars    | radius | 3.3895e6 (mean) | 3.3962e6   | +0.197% | NASA equatorial              |
| phobos  | radius | 1.1267e4        | 1.108e4    | -1.69%  | JPL SSD mean (irregular)     |
| deimos  | radius | 6.2e3           | 6.27e3     | +1.12%  | JPL SSD mean                 |
| jupiter | mass   | 1.8982e27       | 1.89813e27 | -0.004% | IAU 2015 B3 §3 (정밀도 제고) |
| jupiter | radius | 6.9911e7 (mean) | 7.1492e7   | +2.26%  | IAU 2015 B3 equatorial       |
| saturn  | radius | 5.8232e7 (mean) | 6.0268e7   | +3.50%  | NASA equatorial              |
| uranus  | radius | 2.5362e7 (mean) | 2.5559e7   | +0.777% | NASA equatorial              |
| neptune | mass   | 1.0243e26       | 1.02413e26 | -0.017% | NASA Fact Sheet 2024         |
| neptune | radius | 2.4622e7 (mean) | 2.4764e7   | +0.577% | NASA equatorial              |

### `constants/solar-system.ts` (2건 — legacy 상수, 실제 코드 사용 없음)

| 상수             | Before     | After      | 출처                      |
| ---------------- | ---------- | ---------- | ------------------------- |
| `SOLAR_MASS`     | 1.98847e30 | 1.98892e30 | IAU 2015 B3 §1            |
| `JUPITER_RADIUS` | 6.9911e7   | 7.1492e7   | IAU 2015 B3 §3 equatorial |

> `constants/solar-system.ts` 의 값은 현재 코드에서 실제 데이터 소스로 사용되지 않음 (테스트 `SOLAR_MASS` 참조만 존재). 실 데이터는 `solar-system.json` 경유. 그러나 legacy 상수도 IAU 정합화하여 혼선 방지.

## 신규 필드 적용 현황 (24 bodies)

### `dataSource` 분류

| 출처                             | 건수 | body                                                              |
| -------------------------------- | ---- | ----------------------------------------------------------------- |
| IAU 2015 Resolution B3           | 3    | sun, earth, jupiter                                               |
| NASA Planetary Fact Sheet (2024) | 6    | mercury, venus, mars, saturn, uranus, neptune                     |
| JPL Horizons / NASA Galilean     | 4    | io, europa, ganymede, callisto                                    |
| JPL SSD (소천체)                 | 2    | phobos, deimos                                                    |
| NASA/JPL Moon Fact Sheet         | 1    | moon                                                              |
| 탐사선/관측 (peer-reviewed)      | 8    | ceres, pluto, haumea, makemake, eris, halley, encke, swift-tuttle |

### `colorSource` 분류

| 분류       | 건수 | 예시                                                                              |
| ---------- | ---- | --------------------------------------------------------------------------------- |
| `observed` | 17   | 탐사선/망원경 직접 관측 (Mercury MESSENGER / Voyager / Galileo / New Horizons 등) |
| `artistic` | 4    | sun (시각적 warm yellow), halley/encke/swift-tuttle (generic comet tint)          |
| `inferred` | 2    | haumea, eris (너무 먼 거리로 관측 부정확, Hubble photometry 제한적)               |

### `uncertainty` 필드 (8 irregular/관측 불확실 body)

| Body         | mass (상대 오차) | radius (상대 오차) | 근거                                                  |
| ------------ | ---------------- | ------------------ | ----------------------------------------------------- |
| phobos       | 0.05             | 0.03               | irregular 26.8×22.4×18.4 km, JPL SSD                  |
| deimos       | 0.1              | 0.05               | irregular 15×12.2×11 km                               |
| haumea       | 0.04             | 0.1                | 1161×852×513 km ellipsoid                             |
| makemake     | 0.5              | 0.01               | mass 추정 불확실 (위성 S/2015 (136472) 1 관측 미성숙) |
| halley       | 0.5              | 0.1                | Keller et al. 1987 Giotto flyby 추정                  |
| encke        | 0.5              | 0.2                | 추정값, 직접 관측 미성숙                              |
| swift-tuttle | 0.5              | 0.2                | Jorda & Licandro 2003 추정                            |

## 기타 감사 결과

### `astronomy.ts` (AU/거리 단위)

- `AU = 149_597_870_700` — IAU 2012 정확 ✅
- `JULIAN_YEAR_SECONDS = 365.25 * 86400` ✅
- `J2000_JD = 2_451_545.0` ✅
- `LIGHT_YEAR = 9_460_730_472_580_800` — IAU 정의 ✅
- `PARSEC = 3.085_677_581_491_367e16` — IAU 정의 ✅
- **수정 없음**

### `physics.ts` (CODATA 2018)

- `GRAVITATIONAL_CONSTANT = 6.674_30e-11` — CODATA 2018/2022 ✅
- `SPEED_OF_LIGHT = 299_792_458` ✅
- `PLANCK_CONSTANT = 6.626_070_15e-34` ✅
- `BOLTZMANN_CONSTANT = 1.380_649e-23` ✅
- `STEFAN_BOLTZMANN_CONSTANT = 5.670_374_419e-8` ✅
- **수정 없음**

### `epoch` 필드

- root `epoch: 2451545.0` (J2000.0 JD) 박제됨 ✅
- body 별 epoch 은 root 상속 (별도 명시 없음) — Fact-First 원칙 §4 정합

## 회귀 영향 분석

### 렌더링

- `solar-system-scene.ts:346,486` — 행성 radius 를 시각 스케일 계산에 사용
- **영향 body**: jupiter (+2.26%), saturn (+3.50%), uranus (+0.78%), neptune (+0.58%), mars (+0.20%), phobos (-1.69%), deimos (+1.12%)
- educational 디폴트 모드 ×20 과장 하에서 체감 크기 변화 < 1%. 시각 과장 범위 내.
- `scientific` 모드 1.0 스케일에서는 실제 크기 반영 — **정확도 개선** (IAU 공식값 정합)

### 궤도 역학

- radius 필드는 궤도 적분에 사용되지 않음 (질량만 사용)
- jupiter.mass 변경 (-0.004%) / neptune.mass 변경 (-0.017%) — 공차 내, 장기 적분 궤도 편차 미미

### 테스트

- `kepler.test.ts` / `p2b-1year-position.test.ts` / `jpl-validation.test.ts` 가 `SOLAR_MASS` 참조
- 변경: 1.98847e30 → 1.98892e30 (+0.023%)
- 영향: `MU_SUN = G * SOLAR_MASS` 가 동일 비율 변화 → Kepler 궤도 주기 T ∝ 1/√(MU_SUN) 이므로 +0.011% 주기 단축
- 기존 테스트 tolerance 확인 필요 — B-2 검증 단계에서 `pnpm -r test` 실측

## 출처 링크

- IAU 2015 Resolution B3: https://www.iau.org/static/resolutions/IAU2015_English.pdf
- NASA Planetary Fact Sheet: https://nssdc.gsfc.nasa.gov/planetary/factsheet/
- JPL Horizons: https://ssd.jpl.nasa.gov/horizons/
- JPL SSD: https://ssd.jpl.nasa.gov/
- JPL SBDB: https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html

## B-2 산출물 체크리스트

- [x] `verify-iau-data.mjs` 전수 확장 (24 bodies IAU/NASA/JPL 공식값 하드코딩)
- [x] severity 승격 (warning → error) — dataSource/lastVerified/colorSource 부재 시 error
- [x] `solar-system.json` 8건 mass/radius 수정 (±0.01% 공차 초과 항목)
- [x] 24 bodies 에 `dataSource` / `lastVerified: 2026-04-21` / `colorSource` 추가
- [x] 8 irregular body 에 `uncertainty` 추가
- [x] `constants/solar-system.ts` legacy 상수 2건 IAU 정합화
- [x] radius 규약 결정 (A안 equatorial 통일) — JSON 최상단 주석 + 본 보고서 박제
- [x] `verify-iau-data.mjs` 최종 실행: 0 errors / 0 warnings
- [ ] `pnpm -r test` 전체 통과 (SOLAR_MASS 변경으로 tolerance 재확인)
- [ ] 브라우저 3단계 검증 (CRITICAL #3)

## 다음 (B-3) 작업

- CI 통합 (`verify-and-rust` 또는 별도 workflow)
- PR 머지 게이트로 `verify:iau-data` 동작 확인
- #274 이슈 auto-close (B-3 PR 에서 `Closes #274`)

## 참조

- 원칙: [docs/deprecated/principles/fact-first.md](../deprecated/principles/fact-first.md)
- 계약: [docs/deprecated/phases/p10-plan.md](../deprecated/phases/p10-plan.md) §P10-B
- 방법론: [docs/reports/p10b-audit-methodology.md](./p10b-audit-methodology.md)
- 이슈: [#274](https://github.com/coseo12/astro-simulator/issues/274)
- 선행 PR: [#275 (P10-B-1)](https://github.com/coseo12/astro-simulator/pull/275)
