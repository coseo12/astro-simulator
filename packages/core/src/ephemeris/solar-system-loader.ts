import {
  AU,
  GENERAL_PRECESSION_DEG_PER_CENTURY,
  J2000_JD,
  JULIAN_CENTURY_DAYS,
} from '@astro-simulator/shared';
import { z } from 'zod';
import solarSystemRaw from '@astro-simulator/shared/data/solar-system.json' with { type: 'json' };

const DEG = Math.PI / 180;

/**
 * #728 — ring layer 당 azimuthal arc 최대 개수 (GLSL uniform 고정 배열 상한).
 *
 * WebGL/WebGPU uniform 배열은 런타임 동적 길이 불가 → ring-shader `MAX_ARCS` 와 정합하는
 * 컴파일 타임 상한을 두고 loader 에서 `.max(MAX_ARCS)` 로 초과 데이터를 파싱 레벨 차단한다
 * (densityProfile `.max(MAX_DENSITY_POINTS)` 선례 동형 — uniform overflow / 셰이더 컴파일 실패 방지).
 * Adams 가시 클러스터 aggregate 는 1~2 bump 로 충분하나, 5 arc 개별 데이터 박제 여지를
 * 위해 4 로 둔다 (ADR 20260621-728 §교차검증 이견 수용 2 — agy MAX_ARCS 발견).
 */
export const MAX_ARCS = 4;

/**
 * #845 — ring layer 당 densityProfile 최대 포인트 수 (GLSL uniform 고정 배열 상한).
 *
 * ring-shader `MAX_DENSITY_POINTS = 16` 과 독립 선언 parity (MAX_ARCS 동형 — 순환 import
 * 회피를 위해 양쪽 독립 선언 + `ring-shader-arcs.test.ts` 대조 테스트). R8 (#647) uranus
 * composite 15점 + 1 여유 = 16. 정합이 깨지면 파싱 상한과 shader uniform 길이가 어긋나
 * 데이터 silent drop 또는 uniform overflow.
 */
export const MAX_DENSITY_POINTS = 16;

/**
 * #1354 결정 M2 — 궤도 요소의 시간 변화 율 (optional). 값은 출처 문헌 숫자 그대로 [도/율리우스 세기] 이고, `frame` 이
 * 그 숫자의 경도 기준을 밝힌다. 로더가 장면 좌표 (J2000 고정 분점) 율로 옮긴다 — `rate − p_A`
 * (`GENERAL_PRECESSION_DEG_PER_CENTURY`). `frame` 은 `z.literal` 이라 다른 값은 파싱 실패다 (변환 규칙이 없는 틀을
 * 조용히 받지 않는다). ADR `docs/decisions/20261017-1354-lunar-precession-eclipses.md`.
 */
const OrbitalRatesRawSchema = z.object({
  frame: z.literal('mean-equinox-of-date'),
  meanLongitudeDegPerCentury: z.number(),
  longitudeOfAscendingNodeDegPerCentury: z.number(),
  longitudeOfPerihelionDegPerCentury: z.number(),
});

/** #1404 — 달 이론 인자 이름 (Meeus 47장 기호: L′ 평균경도 · D 이각 · M 태양 평균근점이각 · M′ 달 평균근점이각 · F 위도 인수 · A1 ~ A3 부가 인자). */
export const LUNAR_ARGUMENT_KEYS = ['D', 'M', 'Mp', 'F', 'Lp', 'A1', 'A2', 'A3'] as const;
export type LunarArgumentKey = (typeof LUNAR_ARGUMENT_KEYS)[number];

/** 다항식 계수 `[c₀, c₁, …]` (T 오름차순). */
const PolynomialRawSchema = z.array(z.number()).min(1);
const IntSchema = z.number().int();

/**
 * #1404 결정 L2 — 달 위치 이론 (Meeus 47장 전 항). 표는 원형 4원소 인자 `[D, M, M′, F]` 그대로 둔다 (출처 표와 행 단위
 * 대조). 진폭은 원 단위 (경도 · 위도 `1e-6 °`, 거리 `1e-3 km`) 이고, 다항식은 도 단위다 (`mod 360` 이 도 단위라서).
 * 부가항만 넓은 기저 (`argument` 의 키는 {@link LUNAR_ARGUMENT_KEYS} 만 — strict 객체라 다른 키는 파싱 실패) 를 쓴다.
 * 행 수 (60 · 60 · 9) 는 스키마로 고정하지 않는다 (단위 테스트가 센다). ADR `docs/decisions/20261023-1404-lunar-theory-meeus47.md`.
 */
const LunarTheoryRawSchema = z.object({
  frame: z.literal('mean-equinox-of-date'),
  meanArgumentsDeg: z.object({
    D: PolynomialRawSchema,
    M: PolynomialRawSchema,
    Mp: PolynomialRawSchema,
    F: PolynomialRawSchema,
    Lp: PolynomialRawSchema,
    A1: PolynomialRawSchema,
    A2: PolynomialRawSchema,
    A3: PolynomialRawSchema,
  }),
  eccentricityFactor: PolynomialRawSchema,
  meanDistanceKm: z.number().positive(),
  longitudeDistanceTerms: z
    .array(z.tuple([IntSchema, IntSchema, IntSchema, IntSchema, z.number(), z.number()]))
    .min(1),
  latitudeTerms: z.array(z.tuple([IntSchema, IntSchema, IntSchema, IntSchema, z.number()])).min(1),
  additiveTerms: z.array(
    z.object({
      component: z.enum(['longitude', 'latitude']),
      argument: z
        .strictObject({
          D: IntSchema.optional(),
          M: IntSchema.optional(),
          Mp: IntSchema.optional(),
          F: IntSchema.optional(),
          Lp: IntSchema.optional(),
          A1: IntSchema.optional(),
          A2: IntSchema.optional(),
          A3: IntSchema.optional(),
        })
        .refine((a) => Object.keys(a).length > 0, { message: '부가항 인자가 비었다' }),
      amplitude: z.number(),
    }),
  ),
});

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
  rates: OrbitalRatesRawSchema.optional(),
  lunarTheory: LunarTheoryRawSchema.optional(),
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
  // R8 #647 (agy 고유 발견 수용 ①) — `.max(MAX_DENSITY_POINTS)`: ring-shader 상수와 정합.
  // uranus composite 15점이 상한 1점 여유뿐 — 초과 데이터를 파싱 레벨에서 차단해 shader
  // uniform overflow / 컴파일 실패를 방지. ADR `20260610-r8-uranus-titania-rings-visualization.md` §교차검증.
  // #845 — 리터럴 16 을 상수 참조로 교체 (MAX_ARCS 동형, parity 테스트 가드).
  densityProfile: z
    .array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]))
    .min(2)
    .max(MAX_DENSITY_POINTS),
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
  // RPHASE_EXPECTED_ENABLED / BODY_MENU_ITEMS(#1281 전 FOCUS_BUTTONS) 정적 매칭 가드 소스 (r-phase-allowlist.test.ts).
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
   * ring disc 생성 3경로 (shader/fallback/placeholder) 의 `rotation.x = RING_DISC_BASE_TILT_X + tiltRad` 에 사용
   * (#1130 — base 가 `π/2` → `π`. body 의 `ORBITAL_NORMAL_OFFSET` 과 짝이라 한쪽만 옮기면 깨진다)
   * (ring-only tilt — 본체 자전/텍스처 미구현이라 host 통합 불필요, 후보 A).
   * 0~180 범위 가드 (97.77° 같은 역행 자전 포함, NaN 전파 차단 — agy 합의 ③).
   * 미지정 시 scene 이 0 폴백 → 기존 동작 (기준 궤도면 = **XY**) 하위 호환 (jupiter 무회귀).
   * ⚠️ 「XZ 공전면」은 구 서술 오류다 (#1130 — 실제 궤도면은 XY, `physics/state-vector.ts` 의 `z = sinI·y₁`).
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
  /**
   * #1354 — 시간 변화 율 (장면 좌표 = J2000 고정 분점, rad/일). 있으면 이 요소는 `elementsAt` 로 시각 요소를 만들어 쓴다
   * (`physics/orbit-elements-at.ts`) — 평균근점이각 율이 `√(μ/a³)` 대신 `meanLongitude − longitudeOfPerihelion` 이다.
   * 없으면 고정 요소 (현행 경로 그대로).
   */
  rates?: LoadedOrbitalRates;
  /**
   * #1404 — 달 위치 이론 (결정 L1). 있으면 위치는 이 이론이 정하고 (`physics/lunar-theory.ts`), 위 요소 · `rates` 는 평균 요소
   * (궤도선 · 궤적 · N-body 초기 상태 · 공전주기) 에만 쓰인다 (결정 L4). 「모체가 태양을 도는 위성」 만 가진다 (로더 검사).
   */
  lunarTheory?: LoadedLunarTheory;
}

/** #1354 결정 M2 — 로더가 J2000 고정 분점 틀로 옮긴 율 [rad/일]. */
export interface LoadedOrbitalRates {
  /** 평균경도 L 의 율. */
  meanLongitude: number;
  /** 승교점 경도 Ω 의 율. */
  longitudeOfAscendingNode: number;
  /** 근점 경도 ϖ 의 율. */
  longitudeOfPerihelion: number;
}

/** #1404 — 표 47.A 1행 (진폭 SI). */
export interface LoadedLunarLongitudeDistanceTerm {
  D: number;
  M: number;
  Mp: number;
  F: number;
  /** Σl 진폭 [rad] (`sin`). */
  longitude: number;
  /** Σr 진폭 [m] (`cos`). */
  distance: number;
}

/** #1404 — 표 47.B 1행 (진폭 SI). */
export interface LoadedLunarLatitudeTerm {
  D: number;
  M: number;
  Mp: number;
  F: number;
  /** Σb 진폭 [rad] (`sin`). */
  latitude: number;
}

/** #1404 — 부가항 1행. 인자 = Σ 계수 × 인자 (키는 {@link LUNAR_ARGUMENT_KEYS}). */
export interface LoadedLunarAdditiveTerm {
  component: 'longitude' | 'latitude';
  argument: ReadonlyArray<readonly [LunarArgumentKey, number]>;
  /** [rad] (`sin`). */
  amplitude: number;
}

/** #1404 결정 L2 — 로드한 달 이론. 다항식은 도 그대로 (T 오름차순), 진폭 · 거리는 SI. */
export interface LoadedLunarTheory {
  meanArgumentsDeg: Readonly<Record<LunarArgumentKey, ReadonlyArray<number>>>;
  /** `E = 1 − 0.002516 T − 0.0000074 T²` 의 계수. */
  eccentricityFactor: ReadonlyArray<number>;
  /** Δ 의 상수항 [m]. */
  meanDistance: number;
  longitudeDistanceTerms: ReadonlyArray<LoadedLunarLongitudeDistanceTerm>;
  latitudeTerms: ReadonlyArray<LoadedLunarLatitudeTerm>;
  additiveTerms: ReadonlyArray<LoadedLunarAdditiveTerm>;
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
 * 율 1개 — 문헌 원값 [도/세기, 날짜 평균 분점] → 장면 좌표 [rad/일, J2000 고정 분점]. 평균 요소 (궤도선 · 궤적) 의 율이다.
 * 달 이론 위치의 날짜 → J2000 회전은 Meeus 21장의 `p` (선형항 `5029.0966″` — `physics/lunar-theory.ts`) 를 쓴다.
 * 출처가 다른 두 값이라 합치지 않는다 (ADR 20261023-1404 결정 L2).
 */
function rateToSceneFrame(degPerCenturyOfDate: number): number {
  return ((degPerCenturyOfDate - GENERAL_PRECESSION_DEG_PER_CENTURY) * DEG) / JULIAN_CENTURY_DAYS;
}

/** km → m. */
const METERS_PER_KM = 1000;
/** 달 이론 진폭 단위 — 경도 · 위도 `1e-6 °` · 거리 `1e-3 km` (Meeus 표 원 단위). */
const LUNAR_ANGLE_UNIT_RAD = 1e-6 * DEG;
const LUNAR_DISTANCE_UNIT_M = 1e-3 * METERS_PER_KM;

/**
 * #1404 결정 L2 (ADR 1354 M2 의 규칙을 옮김) — 달 이론의 인자 (D · M …) 는 「모체가 계 뿌리 (태양) 를 도는 위성」 에서만 뜻이
 * 있다. 그 밖의 천체에 `lunarTheory` 가 있으면 거부한다 — 조용히 틀린 위치가 되지 않게.
 */
function assertLunarTheoryHost(bodies: ReadonlyArray<z.infer<typeof CelestialBodyRawSchema>>) {
  const byId = new Map(bodies.map((b) => [b.id, b] as const));
  for (const b of bodies) {
    if (!b.orbit?.lunarTheory) continue;
    const parent = b.parentId === null ? undefined : byId.get(b.parentId);
    const grandparent =
      parent?.parentId === null || parent?.parentId === undefined
        ? undefined
        : byId.get(parent.parentId);
    const isSatelliteOfRootOrbiter =
      parent?.orbit !== undefined && grandparent !== undefined && grandparent.parentId === null;
    if (!isSatelliteOfRootOrbiter) {
      throw new Error(
        `[solar-system] ${b.id}: lunarTheory 는 「모체가 태양을 도는 위성」 에만 둘 수 있다 (모체 ${b.parentId ?? '없음'})`,
      );
    }
  }
}

/** #1404 결정 L2 — 원 단위 → SI (다항식은 도 그대로). */
function toLoadedLunarTheory(raw: z.infer<typeof LunarTheoryRawSchema>): LoadedLunarTheory {
  return {
    meanArgumentsDeg: { ...raw.meanArgumentsDeg },
    eccentricityFactor: [...raw.eccentricityFactor],
    meanDistance: raw.meanDistanceKm * METERS_PER_KM,
    longitudeDistanceTerms: raw.longitudeDistanceTerms.map(([D, M, Mp, F, l, r]) => ({
      D,
      M,
      Mp,
      F,
      longitude: l * LUNAR_ANGLE_UNIT_RAD,
      distance: r * LUNAR_DISTANCE_UNIT_M,
    })),
    latitudeTerms: raw.latitudeTerms.map(([D, M, Mp, F, bAmp]) => ({
      D,
      M,
      Mp,
      F,
      latitude: bAmp * LUNAR_ANGLE_UNIT_RAD,
    })),
    additiveTerms: raw.additiveTerms.map((t) => ({
      component: t.component,
      argument: LUNAR_ARGUMENT_KEYS.flatMap((key) => {
        const c = t.argument[key];
        return c === undefined ? [] : [[key, c] as const];
      }),
      amplitude: t.amplitude * LUNAR_ANGLE_UNIT_RAD,
    })),
  };
}

/**
 * 태양계 데이터를 로드·검증·변환한다.
 * JSON import는 번들러가 정적으로 포함 — 런타임 네트워크 요청 없음.
 *
 * @param raw 원본 JSON — 기본값은 `solar-system.json`. 테스트가 변형 데이터 (예: 달 율 제거판) 를 넣을 때만 준다.
 */
export function loadSolarSystem(raw: unknown = solarSystemRaw): LoadedSolarSystem {
  const parsed = SolarSystemRawSchema.parse(raw);
  assertLunarTheoryHost(parsed.bodies);
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
    const rates = b.orbit.rates;
    if (rates) {
      base.orbit.rates = {
        meanLongitude: rateToSceneFrame(rates.meanLongitudeDegPerCentury),
        longitudeOfAscendingNode: rateToSceneFrame(rates.longitudeOfAscendingNodeDegPerCentury),
        longitudeOfPerihelion: rateToSceneFrame(rates.longitudeOfPerihelionDegPerCentury),
      };
    }
    const theory = b.orbit.lunarTheory;
    if (theory) base.orbit.lunarTheory = toLoadedLunarTheory(theory);

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
