/**
 * P6-B #190 — 광선 geodesic LUT (TS wrapper).
 *
 * `@astro-simulator/physics-wasm`의 `build_lensing_lut(samples)`이 반환하는
 * flat `Float32Array`를 outcome/deflection 두 채널로 디코딩한다.
 *
 * ADR: docs/decisions/20260417-accretion-disk-shadow-pipeline.md (3)-α
 *   - flat 포맷: `[outcome_flag, deflection]` × samples
 *   - outcome_flag: 0.0 = Captured, 1.0 = Escaped
 *   - b 범위: 자연단위 [B_MIN, B_MAX] Rs (Rust 모듈 상수)
 *
 * `B_MIN`, `B_MAX`는 Rust 측 `LUT_B_MIN`, `LUT_B_MAX`와 일치해야 한다 (수동 동기화).
 */
import { build_lensing_lut } from '@astro-simulator/physics-wasm';

/** LUT b sweep 하한 (Rs 단위). Rust `LUT_B_MIN`과 일치. */
export const LUT_B_MIN = 0.5;
/** LUT b sweep 상한 (Rs 단위). Rust `LUT_B_MAX`와 일치. */
export const LUT_B_MAX = 10.0;

/** 디코딩된 LUT — 셰이더 업로드 직전 형태. */
export interface LensingLut {
  /** 샘플 수. */
  samples: number;
  /** b sweep 하한 (Rs 단위). */
  bMin: number;
  /** b sweep 상한 (Rs 단위). */
  bMax: number;
  /** outcome 채널: 0.0 = Captured, 1.0 = Escaped. 길이 = samples. */
  outcomes: Float32Array;
  /** deflection 채널 (rad). Captured 영역은 0.0. 길이 = samples. */
  deflections: Float32Array;
  /**
   * RG 텍스처 업로드용 interleaved Float32Array (셰이더가 textureLoad/Sample로 직접 사용).
   * 길이 = 2 * samples. R = outcome_flag, G = deflection.
   */
  interleaved: Float32Array;
}

/**
 * b를 LUT 인덱스(부동소수)로 변환. 셰이더 측 샘플링 보조용.
 * `index = (b - bMin) / (bMax - bMin) * (samples - 1)`.
 */
export function bToLutIndex(b: number, lut: LensingLut): number {
  const t = (b - lut.bMin) / (lut.bMax - lut.bMin);
  return t * (lut.samples - 1);
}

/**
 * WASM에서 LUT를 빌드하여 디코딩한다.
 *
 * @param samples 샘플 수. ADR B2 ±5% 검증에서 256으로 0.26% 오차 측정 → 기본 256.
 *                512/1024로 올리면 정밀도 향상 (CPU/메모리 비용은 미미).
 */
export function createLensingLut(samples = 256): LensingLut {
  if (!Number.isInteger(samples) || samples < 2) {
    throw new Error(`createLensingLut: samples는 2 이상의 정수여야 함 (got ${samples})`);
  }
  const flat = build_lensing_lut(samples);
  if (flat.length !== 2 * samples) {
    throw new Error(
      `createLensingLut: WASM 반환 길이 불일치 (expected ${2 * samples}, got ${flat.length})`,
    );
  }
  const outcomes = new Float32Array(samples);
  const deflections = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    // flat 길이 검증 후이므로 인덱스는 안전.
    outcomes[i] = flat[2 * i] as number;
    deflections[i] = flat[2 * i + 1] as number;
  }
  return {
    samples,
    bMin: LUT_B_MIN,
    bMax: LUT_B_MAX,
    outcomes,
    deflections,
    // 셰이더로 그대로 업로드 가능하도록 원본 flat을 interleaved로 보존.
    // (Float32Array는 SharedArrayBuffer 호환을 깨지 않게 새 ArrayBuffer로 복사.)
    interleaved: new Float32Array(flat),
  };
}
