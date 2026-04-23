import type { DataTier } from './tier.js';

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

/**
 * 천체 단일 레코드.
 */
export interface CelestialBody {
  /** 고유 ID (예: 'earth', 'jupiter') */
  id: string;
  /** 분류 */
  kind: CelestialKind;
  /** 한국어 이름 */
  nameKo: string;
  /** 영문 이름 */
  nameEn: string;
  /** 질량 [kg] */
  mass: number;
  /** 반경 [m] */
  radius: number;
  /** 데이터 신뢰성 티어 */
  tier: DataTier;
  /** 부모 천체 ID (예: 달의 부모는 지구) — 없으면 null (태양 등) */
  parentId: string | null;
  /** 궤도 요소 — 태양/최상위 천체는 없을 수 있음 */
  orbit?: OrbitalElements;
  /** 색상 표시용 힌트 (흑체복사 온도[K] 또는 명시 색) + 출처 분류 */
  colorHint?: { temperatureK?: number; hex?: string; colorSource?: ColorSource };
  /**
   * P10-B #274 — 데이터 출처. `"IAU 2015"` 또는 `["IAU 2015", "JPL Horizons (2024-06)"]`.
   * P10-B 감사 이후 모든 body 필수. 스키마 확장 기간 중에는 optional.
   */
  dataSource?: DataSource;
  /**
   * P10-B #274 — 마지막 검증 일자 (ISO YYYY-MM-DD). 예: `"2026-04-22"`.
   * P10-B 감사 시점부터 업데이트. 초기 값은 감사일 고정.
   */
  lastVerified?: IsoDate;
  /**
   * P10-B #274 — 불확실성. IAU 공식값 없는 body (소행성/혜성/외곽 위성) 필수.
   * 각 필드는 상대 오차 (0.15 = ±15%).
   */
  uncertainty?: Uncertainty;
  /**
   * P10-B #274 — body 의 epoch. root 의 epoch (기본 J2000.0 = 2451545.0 JD) 과 다를 때만 명시.
   * 문자열 (`"J2000.0"`, `"2451545.0 TDB"`) 또는 숫자 (JD). 부재 시 root epoch 상속.
   */
  epoch?: string | number;
}
