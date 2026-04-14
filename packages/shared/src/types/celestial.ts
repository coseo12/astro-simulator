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
  /** 색상 표시용 힌트 (흑체복사 온도[K] 또는 명시 색) */
  colorHint?: { temperatureK?: number; hex?: string };
}
