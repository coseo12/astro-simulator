/**
 * P9 #254 D7 — Osculating Kepler 원소 추출 (TS 래퍼).
 *
 * physics-wasm `extract_osculating_elements` 의 flat Float64Array(7) 반환을
 * 타입 안전한 `OscElements` 로 변환한다.
 *
 * ADR `docs/decisions/20260420-p9-galilean-laplace-rings.md` §인터페이스 박제 L213~L226.
 *
 * 사용처: `apps/web/src/hooks/use-osculating-sync.ts` (1Hz polling).
 */
import { extract_osculating_elements } from '@astro-simulator/physics-wasm';

/**
 * 단일 위성의 Osculating Kepler 원소.
 * 단위: a=m, e=dimensionless, i/Ω/ω/M=rad, singularity=0|1.
 */
export interface OscElements {
  /** 장반경 [m] */
  semiMajorAxis: number;
  /** 이심률 (0~1) */
  eccentricity: number;
  /** 경사 [rad] */
  inclination: number;
  /** 승교점 경도 Ω [rad] */
  longitudeOfAscendingNode: number;
  /** 근점편각 ω [rad] */
  argumentOfPeriapsis: number;
  /** 평균근점이각 M [rad] */
  meanAnomaly: number;
  /** 특이점 플래그 — 1=원순환 근사 적용 (e<1e-6 또는 i<1e-6) */
  singularity: 0 | 1;
}

/**
 * Jupiter-centric (pos [m], vel [m/s], muParent [m^3/s^2]) 로부터 Osculating 원소 추출.
 *
 * WASM 호출 래퍼 — flat Float64Array(7) `[a, e, i, Ω, ω, M, singularity]` 를 구조체로 변환.
 *
 * 실패 시 null 반환 (호출자가 정적 JSON 폴백 수행).
 */
export function extractOsculatingElements(
  pos: readonly [number, number, number],
  vel: readonly [number, number, number],
  muParent: number,
): OscElements | null {
  try {
    const out = extract_osculating_elements(
      pos[0],
      pos[1],
      pos[2],
      vel[0],
      vel[1],
      vel[2],
      muParent,
    );
    if (!out || out.length < 7) return null;
    return {
      semiMajorAxis: out[0]!,
      eccentricity: out[1]!,
      inclination: out[2]!,
      longitudeOfAscendingNode: out[3]!,
      argumentOfPeriapsis: out[4]!,
      meanAnomaly: out[5]!,
      singularity: (out[6] === 1 ? 1 : 0) as 0 | 1,
    };
  } catch {
    return null;
  }
}
