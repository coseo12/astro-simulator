import { AU, J2000_JD } from '@astro-simulator/shared';
import { z } from 'zod';
import solarSystemRaw from '@astro-simulator/shared/data/solar-system.json' with { type: 'json' };

const DEG = Math.PI / 180;

/**
 * Raw JSON 스키마 — 소스 파일에서 읽은 궤도 요소는 도/AU 단위.
 */
const OrbitalElementsRawSchema = z.object({
  semiMajorAxisAU: z.number(),
  eccentricity: z.number().nonnegative().lt(1),
  inclinationDeg: z.number(),
  longitudeOfAscendingNodeDeg: z.number(),
  longitudeOfPerihelionDeg: z.number(),
  meanLongitudeDeg: z.number(),
});

const CelestialBodyRawSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    'star',
    'planet',
    'dwarf-planet',
    'moon',
    'asteroid',
    'comet',
    'spacecraft',
    'black-hole',
    'nebula',
    'galaxy',
    'star-cluster',
  ]),
  nameKo: z.string(),
  nameEn: z.string(),
  mass: z.number().positive(),
  radius: z.number().positive(),
  parentId: z.string().nullable(),
  orbit: OrbitalElementsRawSchema.optional(),
  colorHint: z
    .object({
      hex: z.string().optional(),
      temperatureK: z.number().optional(),
    })
    .optional(),
});

const SolarSystemRawSchema = z.object({
  epoch: z.number(),
  source: z.string(),
  tier: z.number(),
  bodies: z.array(CelestialBodyRawSchema).min(1),
});

/**
 * 변환된 궤도 요소 — SI 단위 (m, rad), Kepler 적분에 바로 사용.
 *
 * 저장된 longitudeOfPerihelion ϖ와 meanLongitude L을 표준 Kepler 6요소로 변환:
 *   argumentOfPeriapsis ω = ϖ - Ω
 *   meanAnomalyAtEpoch M₀ = L - ϖ
 */
export interface LoadedOrbitalElements {
  semiMajorAxis: number; // m
  eccentricity: number;
  inclination: number; // rad
  longitudeOfAscendingNode: number; // rad
  argumentOfPeriapsis: number; // rad
  meanAnomalyAtEpoch: number; // rad
  epoch: number; // JD
}

export interface LoadedCelestialBody {
  id: string;
  kind: string;
  nameKo: string;
  nameEn: string;
  mass: number;
  radius: number;
  parentId: string | null;
  orbit?: LoadedOrbitalElements;
  colorHint?: { hex?: string | undefined; temperatureK?: number | undefined };
}

export interface LoadedSolarSystem {
  epoch: number;
  source: string;
  tier: number;
  bodies: LoadedCelestialBody[];
}

/**
 * 각도를 [-π, π] 범위로 정규화.
 */
function normalizeAngle(rad: number): number {
  const twoPi = Math.PI * 2;
  let a = rad % twoPi;
  if (a > Math.PI) a -= twoPi;
  if (a < -Math.PI) a += twoPi;
  return a;
}

/**
 * 태양계 데이터를 로드·검증·변환한다.
 * JSON import는 번들러가 정적으로 포함 — 런타임 네트워크 요청 없음.
 */
export function loadSolarSystem(): LoadedSolarSystem {
  const parsed = SolarSystemRawSchema.parse(solarSystemRaw);
  const epoch = parsed.epoch;

  const bodies: LoadedCelestialBody[] = parsed.bodies.map((b) => {
    const base: LoadedCelestialBody = {
      id: b.id,
      kind: b.kind,
      nameKo: b.nameKo,
      nameEn: b.nameEn,
      mass: b.mass,
      radius: b.radius,
      parentId: b.parentId,
      ...(b.colorHint ? { colorHint: b.colorHint } : {}),
    };

    if (!b.orbit) return base;

    const Omega = b.orbit.longitudeOfAscendingNodeDeg * DEG;
    const varpi = b.orbit.longitudeOfPerihelionDeg * DEG;
    const L = b.orbit.meanLongitudeDeg * DEG;

    base.orbit = {
      semiMajorAxis: b.orbit.semiMajorAxisAU * AU,
      eccentricity: b.orbit.eccentricity,
      inclination: b.orbit.inclinationDeg * DEG,
      longitudeOfAscendingNode: normalizeAngle(Omega),
      argumentOfPeriapsis: normalizeAngle(varpi - Omega),
      meanAnomalyAtEpoch: normalizeAngle(L - varpi),
      epoch,
    };

    return base;
  });

  return {
    epoch: parsed.epoch,
    source: parsed.source,
    tier: parsed.tier,
    bodies,
  };
}

/** 싱글톤 인스턴스 — 첫 호출 시 로드, 이후 캐시 */
let cached: LoadedSolarSystem | null = null;
export function getSolarSystem(): LoadedSolarSystem {
  cached ??= loadSolarSystem();
  return cached;
}

export { J2000_JD };
