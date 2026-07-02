import { AU, J2000_JD } from '@astro-simulator/shared';
import { z } from 'zod';
import solarSystemRaw from '@astro-simulator/shared/data/solar-system.json' with { type: 'json' };

const DEG = Math.PI / 180;

/**
 * #728 — ring layer 당 azimuthal arc 최대 개수 (GLSL uniform 고정 배열 상한).
 *
 * WebGL/WebGPU uniform 배열은 런타임 동적 길이 불가 → ring-shader `MAX_ARCS` 와 정합하는
 * 컴파일 타임 상한을 두고 loader 에서 `.max(MAX_ARCS)` 로 초과 데이터를 파싱 레벨 차단한다
 * (densityProfile `.max(16)` 선례 동형 — uniform overflow / 셰이더 컴파일 실패 방지).
 * Adams 가시 클러스터 aggregate 는 1~2 bump 로 충분하나, 5 arc 개별 데이터 박제 여지를
 * 위해 4 로 둔다 (ADR 20260621-728 §교차검증 이견 수용 2 — agy MAX_ARCS 발견).
 */
export const MAX_ARCS = 4;

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
  /**
   * #728 — azimuthal arc (부분 호) 데이터 (optional). 해왕성 Adams ring 전용 —
   * 밝은 호 영역(arc cluster) vs 어두운 나머지의 각도 방향 alpha 대조 변조에 사용.
   *
   * - `centerDeg`: arc 중심 방위각 (disc local UV X축 기준 CCW degree, 0~360). fragment 에서
   *   `radians(centerDeg)` 변환 (ADR 20260621-728 §결정 4 azimuth 기준축 계약). 절대 천문
   *   longitude 정렬은 ring tilt 와 동일 world X 고정 근사 (R8 §위험 #6 동형, 정밀 아님).
   * - `widthDeg`: arc 각폭 (full width, degree, 0~360). fragment 는 half-width 로 환산해 사용.
   * - `brightness`: arc 영역 밝기 배율 (≥ 0). 1.0 = 기본 ring alpha, > 1 = 밝게.
   *
   * `.max(MAX_ARCS)`: GLSL uniform 고정 배열 상한 (uniform overflow 차단 — densityProfile 동형).
   * 미지정 층은 균질 환형 (azFactor 1.0 무회귀 — jupiter/saturn/uranus 무영향).
   */
  arcs: z
    .array(
      z.object({
        centerDeg: z.number().min(0).max(360),
        widthDeg: z.number().positive().max(360),
        brightness: z.number().nonnegative(),
      }),
    )
    .min(1)
    .max(MAX_ARCS)
    .optional(),
  /**
   * #728 — arc 밖(어두운 나머지) 영역의 밝기 배율 (0~1, optional). arcs 보유 층에만 의미.
   * arc bright vs dark 대조비 = brightness / darkFactor. 미지정 시 ring-shader 기본 (0.35).
   * D-T2 실측 조정값 (ADR 20260621-728 §결정 2).
   */
  arcDarkFactor: z.number().min(0).max(1).optional(),
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
   * #782 §A2 결정 4 — 항성일 자전 주기 (NASA/JPL sidereal rotation period, hours, optional).
   *
   * 규약 (i): **항상 양수 magnitude** — 자전 방향(역행)은 `axialTiltDeg` (IAU obliquity, 0~180) 에
   * 내재한다 (uranus 97.77°/venus 177.36° 처럼 obliquity>90 = 역행). period 를 음수로 주면 방향이
   * 이중 적용되어 뒤집히므로 금지 (ADR §A2.3 결정 4 각주). `.refine(v => v !== 0)` = 0 만 차단
   * (`ω = 2π×24 / period` division-by-zero 방어). `.positive()`/`.nonnegative()` 사용 금지 —
   * 규약 (i) 은 항상 양수라 실질 동치이나, 미래 규약 (ii) 전환 시 음수 표기 여지를 스키마가 막지
   * 않도록 `!== 0` 만 명문화 (cross-validate 고유 발견 3). 미지정 body 는 자전 없음 (현행 정지 유지,
   * 하위 호환). scene 이 `ω[rad/day] = 2π × 24 / rotationPeriodHours` 로 자전각 산출.
   * ADR `20260628-756-procedural-planet-surface.md` §Amendment 2.
   */
  rotationPeriodHours: z
    .number()
    .refine((v) => v !== 0, 'rotationPeriodHours must be non-zero (division-by-zero 차단)')
    .optional(),
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
  /**
   * #728 — azimuthal arc 데이터 (optional, neptune Adams 전용). 미지정 시 균질 환형 (무회귀).
   * centerDeg/widthDeg 는 degree (shader 가 radian 변환), brightness 는 alpha 배율.
   */
  arcs?: ReadonlyArray<{ centerDeg: number; widthDeg: number; brightness: number }>;
  /** #728 — arc 밖 영역 밝기 배율 (optional). 미지정 시 ring-shader 기본 (0.35). */
  arcDarkFactor?: number;
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
  /**
   * R8 #647 — 자전축 기울기 (도). ring tilt + #782 self-rotation body 자전축 공유 (동일 SSoT).
   * uranus 97.77 / saturn 26.73 / earth 23.44 등. 미지정 시 tilt 0.
   */
  axialTiltDeg?: number;
  /**
   * #782 §A2 — 항성일 자전 주기 (hours, 양수 magnitude — 방향은 axialTiltDeg 에 내재).
   * 미지정 시 자전 없음 (현행 정지 유지). scene 이 `ω = 2π×24/period [rad/day]` 로 자전각 산출.
   */
  rotationPeriodHours?: number;
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
              // #728 — azimuthal arc (optional, neptune Adams 전용). 미지정 시 필드 생략 (무회귀).
              ...(r.arcs ? { arcs: r.arcs.map((a) => ({ ...a })) } : {}),
              ...(r.arcDarkFactor !== undefined ? { arcDarkFactor: r.arcDarkFactor } : {}),
            })),
          }
        : {}),
      // R7 #641 — ring 전역 alpha rendering hint (optional).
      ...(b.ringAlphaHint !== undefined ? { ringAlphaHint: b.ringAlphaHint } : {}),
      // R8 #647 — 자전축 기울기 (optional, ring tilt + #782 body 자전축 공유).
      ...(b.axialTiltDeg !== undefined ? { axialTiltDeg: b.axialTiltDeg } : {}),
      // #782 §A2 — 자전 주기 (optional, 양수 magnitude). 미지정 시 자전 정지 (하위 호환).
      ...(b.rotationPeriodHours !== undefined
        ? { rotationPeriodHours: b.rotationPeriodHours }
        : {}),
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
