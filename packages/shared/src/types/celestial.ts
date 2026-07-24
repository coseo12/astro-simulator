/**
 * 천체 카테고리.
 */
export const CelestialKind = {
  Star: 'star',
  Planet: 'planet',
  DwarfPlanet: 'dwarf-planet',
  Moon: 'moon',
  Asteroid: 'asteroid',
  Comet: 'comet',
  Spacecraft: 'spacecraft',
  BlackHole: 'black-hole',
  Nebula: 'nebula',
  Galaxy: 'galaxy',
  StarCluster: 'star-cluster',
} as const;

export type CelestialKind = (typeof CelestialKind)[keyof typeof CelestialKind];

/**
 * P10-B #274 — 색상 출처 분류 (Fact-First 원칙 §6, Gemini 2차 교차검증 수용).
 *
 * - `observed`: Cassini/Voyager/지상 망원경 등 실제 관측 기반
 * - `artistic`: 시각적 구분을 위한 의도적 아티스트 선택 (같은 밝기의 위성 2개 구분 등)
 * - `inferred`: 관측 데이터 부재에 따른 기본 추론값 (외곽 소행성 / 혜성 핵 / 탐사 미착지 body)
 *
 * P12-C #298 (단일 모드 전환) 이후 `observed` 가 기본, `artistic` / `inferred` 는 UI 에서 명시.
 */
export type ColorSource = 'observed' | 'artistic' | 'inferred';

/**
 * P10-B #274 — 데이터 출처 (Fact-First 원칙 §5).
 *
 * 문자열 단일 또는 배열. 예:
 *   - `"IAU 2015"`
 *   - `["IAU 2015", "JPL Horizons (2024-06)"]`
 *   - `"IAU 공식값 부재 — NASA JPL SBDB 2024 관측"` (uncertainty 사용 시)
 */
export type DataSource = string | readonly string[];

/**
 * P10-B #274 — ISO-8601 날짜 문자열 (YYYY-MM-DD).
 * 예: `"2026-04-22"`. `lastVerified` 필드에 사용.
 */
export type IsoDate = string;

/**
 * P10-B #274 — 불확실성 (상대 오차).
 *
 * 각 필드 값은 **상대 오차** (0.15 = ±15%). IAU 공식값이 없는 body 는 이 필드를 통해
 * "우리가 얼마나 모르는가" 를 명시한다. UI 의 천체 정보 패널에서 error bar 로 시각화 가능 (P12-C #298).
 *
 * 예: `{ mass: 0.15, radius: 0.05 }` — 질량 ±15%, 반경 ±5%.
 */
export interface Uncertainty {
  /** 질량 상대 오차 */
  mass?: number;
  /** 반경 상대 오차 */
  radius?: number;
  /** 궤도 장반경 상대 오차 */
  semiMajorAxis?: number;
  /** 이심률 상대 오차 */
  eccentricity?: number;
  /** 궤도 경사각 상대 오차 */
  inclination?: number;
}

/**
 * Kepler 궤도 6요소 (J2000.0 기준).
 * 모든 각도는 라디안, 거리는 미터.
 */
export interface OrbitalElements {
  /** 궤도 장반경 a [m] */
  semiMajorAxis: number;
  /** 이심률 e [dimensionless] */
  eccentricity: number;
  /** 궤도 경사각 i [rad] */
  inclination: number;
  /** 승교점 경도 Ω [rad] */
  longitudeOfAscendingNode: number;
  /** 근일점 편각 ω [rad] */
  argumentOfPeriapsis: number;
  /** epoch 시점의 평균 이상 M₀ [rad] */
  meanAnomalyAtEpoch: number;
  /** epoch (Julian Date) */
  epoch: number;
}

/*
 * #844 — 함정 타입 `CelestialBody` 제거.
 *
 * 본 파일에 있던 `CelestialBody` 인터페이스는 import 0곳인 채 운영 스키마
 * (`packages/core/src/ephemeris/solar-system-loader.ts` 의 `LoadedCelestialBody`,
 * zod 파생) 와 크게 drift 한 상태였다 — `tier` 필수 필드가 실데이터에 없고
 * rings 등 운영 필드 부재. 천체 레코드 타입이 필요하면 `LoadedCelestialBody`
 * (@astro-simulator/core) 를 사용할 것.
 */
