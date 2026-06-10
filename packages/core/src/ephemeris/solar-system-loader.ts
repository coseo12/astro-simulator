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
  // R8 #647 (agy 고유 발견 수용 ①) — `.max(16)`: ring-shader `MAX_DENSITY_POINTS = 16` 정합.
  // uranus composite 15점이 상한 1점 여유뿐 — 초과 데이터를 파싱 레벨에서 차단해 shader
  // uniform overflow / 컴파일 실패를 방지. ADR `20260610-r8-uranus-titania-rings-visualization.md` §교차검증.
  densityProfile: z
    .array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]))
    .min(2)
    .max(16),
  /**
   * R7 #641 — 층별 색 (body colorHint 동형, optional). saturn 5층 (D/C/B/A/F) 층별 톤 분리.
   * 미지정 시 scene 이 undefined 전달 → ring-shader DEFAULT `#887766` 폴백 (jupiter.rings 무회귀).
   * ADR `20260610-r7-saturn-titan-rings-visualization.md` §축 2b.
   */
  colorHint: z
    .object({
      hex: z.string().optional(),
      colorSource: z.enum(['observed', 'artistic', 'inferred']).optional(),
    })
    .optional(),
});

/**
 * P10-B #274 — 불확실성 스키마 (Fact-First 원칙 §3).
 * 모든 필드 optional, 상대 오차 (0.15 = ±15%).
 */
const UncertaintyRawSchema = z.object({
  mass: z.number().nonnegative().optional(),
  radius: z.number().nonnegative().optional(),
  semiMajorAxis: z.number().nonnegative().optional(),
  eccentricity: z.number().nonnegative().optional(),
  inclination: z.number().nonnegative().optional(),
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
  // #613 — body 최초 등장 R-Phase (메타데이터 SSoT). R_PHASE_BODY_ALLOWLIST 자동 생성 소스.
  // 로드맵 v3 (R1=sun … R10=왜소행성/혜성) 정합. ADR `20260604-613-r-phase-metadata-ssot.md` §결정 A.
  introducedInRPhase: z.number().int().positive(),
  // #617 — shortcut bar 노출 대상 메타 SSoT. "focus 가능"(introducedInRPhase)과 직교 축 —
  // satellite(phobos/deimos 등)는 focus 가능하나 shortcut bar 미등록 (R5 Q4a=A 모바일 너비 정책).
  // RPHASE_EXPECTED_ENABLED / FOCUS_BUTTONS 정적 매칭 가드 소스 (r-phase-allowlist.test.ts).
  showInShortcutBar: z.boolean(),
  orbit: OrbitalElementsRawSchema.optional(),
  colorHint: z
    .object({
      hex: z.string().optional(),
      temperatureK: z.number().optional(),
      /**
       * P10-B #274 — 색상 출처 분류 (Fact-First 원칙 §6, Gemini 2차 교차검증 수용).
       * `observed` / `artistic` / `inferred` 3종.
       */
      colorSource: z.enum(['observed', 'artistic', 'inferred']).optional(),
    })
    .optional(),
  /**
   * P9 #254 — 행성 고리 데이터 (선택). 목성/토성/천왕성/해왕성 전용.
   * 없으면 undefined → 고리 렌더 스킵.
   */
  rings: z.array(RingLayerRawSchema).optional(),
  /**
   * R7 #641 — ring 전역 alpha rendering hint (0~1, optional). prominent (saturn 0.9) vs
   * faint (jupiter 0.15) 대조 (PM Q3). 미지정 시 scene 이 전달 생략 → shader 기본 0.6 (하위 호환).
   * densityProfile (실측 상대 밀도 분포) 와 직교하는 rendering hint — 데이터 SSoT 보존.
   * ADR `20260610-r7-saturn-titan-rings-visualization.md` §축 2c.
   */
  ringAlphaHint: z.number().min(0).max(1).optional(),
  /**
   * R8 #647 §축 2a — 자전축 기울기 (NASA "obliquity to orbit", 도 단위, optional).
   * ring disc 생성 3경로 (shader/fallback/placeholder) 의 `rotation.x = π/2 + tiltRad` 에 사용
   * (ring-only tilt — 본체 자전/텍스처 미구현이라 host 통합 불필요, 후보 A).
   * 0~180 범위 가드 (97.77° 같은 역행 자전 포함, NaN 전파 차단 — agy 합의 ③).
   * 미지정 시 scene 이 0 폴백 → 기존 동작 (XZ 공전면) 하위 호환 (jupiter 무회귀).
   * ADR `20260610-r8-uranus-titania-rings-visualization.md` §축 2a.
   */
  axialTiltDeg: z.number().min(0).max(180).optional(),
  /**
   * P10-B #274 — 데이터 출처 (Fact-First 원칙 §5). 문자열 또는 배열.
   * P10-B 감사 이후 모든 body 필수 예정. 스키마 확장 기간 중에는 optional.
   */
  dataSource: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]).optional(),
  /**
   * P10-B #274 — 마지막 검증 일자 (ISO YYYY-MM-DD). P10-B 감사 시점부터 업데이트.
   */
  lastVerified: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'ISO-8601 date (YYYY-MM-DD)')
    .optional(),
  /**
   * P10-B #274 — 불확실성. IAU 공식값 없는 body 필수.
   */
  uncertainty: UncertaintyRawSchema.optional(),
  /**
   * P10-B #274 — body 의 epoch. root epoch 과 다를 때만 명시.
   * 문자열 (`"J2000.0"`, `"2451545.0 TDB"`) 또는 숫자 (JD). 부재 시 root epoch 상속.
   */
  epoch: z.union([z.string().min(1), z.number()]).optional(),
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
  /** R7 #641 — 층별 색 (optional). 미지정 시 ring-shader DEFAULT `#887766` 폴백. */
  colorHint?: {
    hex?: string | undefined;
    colorSource?: 'observed' | 'artistic' | 'inferred' | undefined;
  };
}

export interface LoadedCelestialBody {
  id: string;
  kind: string;
  nameKo: string;
  nameEn: string;
  mass: number;
  radius: number;
  parentId: string | null;
  /** #613 — body 최초 등장 R-Phase. R_PHASE_BODY_ALLOWLIST 자동 생성 SSoT. */
  introducedInRPhase: number;
  /** #617 — shortcut bar 노출 대상 메타. focus 가능과 직교 (satellite 는 focus 가능하나 미등록). */
  showInShortcutBar: boolean;
  orbit?: LoadedOrbitalElements;
  colorHint?: {
    hex?: string | undefined;
    temperatureK?: number | undefined;
    /** P10-B #274 — 색상 출처. 부재 시 loader 는 legacy 로 간주. */
    colorSource?: 'observed' | 'artistic' | 'inferred' | undefined;
  };
  /** P9 #254 — 고리 층 배열 (목성 3층·토성 5층 등). 없으면 undefined. */
  rings?: ReadonlyArray<LoadedRingLayer>;
  /** R7 #641 — ring 전역 alpha rendering hint (saturn 0.9 / jupiter 0.15). 미지정 시 기본 0.6. */
  ringAlphaHint?: number;
  /** R8 #647 — 자전축 기울기 (도). ring tilt 전용 (uranus 97.77 / saturn 26.73). 미지정 시 tilt 0. */
  axialTiltDeg?: number;
  /** P10-B #274 — 데이터 출처. */
  dataSource?: string | ReadonlyArray<string>;
  /** P10-B #274 — 마지막 검증 일자 (ISO YYYY-MM-DD). */
  lastVerified?: string;
  /** P10-B #274 — 불확실성 (상대 오차). exactOptionalPropertyTypes 로 undefined 명시. */
  uncertainty?: {
    mass?: number | undefined;
    radius?: number | undefined;
    semiMajorAxis?: number | undefined;
    eccentricity?: number | undefined;
    inclination?: number | undefined;
  };
  /** P10-B #274 — body 의 epoch (root 와 다를 때만). */
  epoch?: string | number;
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
      introducedInRPhase: b.introducedInRPhase,
      showInShortcutBar: b.showInShortcutBar,
      ...(b.colorHint ? { colorHint: b.colorHint } : {}),
      // P9 #254 — 고리 층 (km → m 변환). densityProfile 는 정규화된 튜플이라 단위 변환 불필요.
      ...(b.rings
        ? {
            rings: b.rings.map((r) => ({
              id: r.id,
              innerRadius: r.innerRadiusKm * 1000,
              outerRadius: r.outerRadiusKm * 1000,
              densityProfile: r.densityProfile.map(([rn, d]) => [rn, d] as const),
              // R7 #641 — 층별 colorHint (optional, 미지정 시 필드 자체 생략 — exactOptionalPropertyTypes).
              ...(r.colorHint ? { colorHint: r.colorHint } : {}),
            })),
          }
        : {}),
      // R7 #641 — ring 전역 alpha rendering hint (optional).
      ...(b.ringAlphaHint !== undefined ? { ringAlphaHint: b.ringAlphaHint } : {}),
      // R8 #647 — 자전축 기울기 (optional, ring tilt 전용).
      ...(b.axialTiltDeg !== undefined ? { axialTiltDeg: b.axialTiltDeg } : {}),
      // P10-B #274 — 감사 메타데이터 (optional, 감사 진행 중 일부 body 만 채워질 수 있음).
      ...(b.dataSource ? { dataSource: b.dataSource } : {}),
      ...(b.lastVerified ? { lastVerified: b.lastVerified } : {}),
      ...(b.uncertainty ? { uncertainty: b.uncertainty } : {}),
      ...(b.epoch !== undefined ? { epoch: b.epoch } : {}),
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
