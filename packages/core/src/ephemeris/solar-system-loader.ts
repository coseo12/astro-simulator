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

/**
 * P9 #254 — 목성 고리 3층 (Halo/Main/Gossamer) 데이터 스키마.
 *
 * densityProfile 튜플: [r_normalized ∈ [0,1], density ∈ [0,1]]
 *   - r_normalized: (r - innerRadius) / (outerRadius - innerRadius)
 *   - density: 방사 밀도 상대값 (shader alpha 에 직접 매핑)
 *
 * ADR `docs/decisions/20260420-p9-galilean-laplace-rings.md` §결정 #2 참조.
 * P10 토성(카시니 간극 등) 재사용 전제 — 층 수·배열 길이는 행성별로 유연.
 */
const RingLayerRawSchema = z.object({
  id: z.string().min(1),
  innerRadiusKm: z.number().positive(),
  outerRadiusKm: z.number().positive(),
  densityProfile: z.array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)])).min(2),
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
  /**
   * P9 #254 — 행성 고리 데이터 (선택). 목성/토성/천왕성/해왕성 전용.
   * 없으면 undefined → 고리 렌더 스킵.
   */
  rings: z.array(RingLayerRawSchema).optional(),
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

/**
 * P9 #254 — 고리 1층 로드 결과. 반경은 km → m 로 환산.
 * densityProfile 은 원본 그대로 (정규화된 r, density 튜플 배열).
 */
export interface LoadedRingLayer {
  id: string;
  innerRadius: number; // m
  outerRadius: number; // m
  densityProfile: ReadonlyArray<readonly [number, number]>;
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
  /** P9 #254 — 고리 3층 (목성·토성 등). 없으면 undefined. */
  rings?: ReadonlyArray<LoadedRingLayer>;
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
      // P9 #254 — 고리 3층 (km → m 변환). densityProfile 는 정규화된 튜플이라 단위 변환 불필요.
      ...(b.rings
        ? {
            rings: b.rings.map((r) => ({
              id: r.id,
              innerRadius: r.innerRadiusKm * 1000,
              outerRadius: r.outerRadiusKm * 1000,
              densityProfile: r.densityProfile.map(([rn, d]) => [rn, d] as const),
            })),
          }
        : {}),
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
