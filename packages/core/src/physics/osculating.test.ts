/**
 * #849 — osculating.ts (TS Kepler 파이프라인 래퍼) 왕복 property 테스트.
 *
 * cargo test 는 Rust 측 원소 추출 수치를 검증한다. 본 파일은 TS 래퍼 층에서
 * (1) flat Float64Array(7) → OscElements 필드 매핑 순서 [a, e, i, Ω, ω, M, singularity],
 * (2) elements → state → extract 왕복 복원 (결정적 (a, e, i) 격자 property),
 * (3) singularity 플래그의 0|1 타입 협착 계약을 고정한다.
 *
 * 실 WASM 바인딩 사용 (nbody-engine.test.ts 컨벤션 동형) — pkg/ 선빌드 필요 (CI 는
 * ci-physics-wasm.yml 의 workspace 빌드 스텝이 보장).
 *
 * 결정성: 샘플 격자는 전부 고정 상수 (Math.random 금지) — 실패 시 항상 재현 가능.
 */
import { describe, expect, it } from 'vitest';
import { GRAVITATIONAL_CONSTANT } from '@astro-simulator/shared';
import { extractOsculatingElements } from './osculating.js';

const JUPITER_MASS_KG = 1.898_2e27;
const MU_JUPITER = GRAVITATIONAL_CONSTANT * JUPITER_MASS_KG;

/**
 * 알려진 (a, e, i) 로부터 근점 상태 벡터를 결정적으로 합성한다.
 * 근점: pos = (a(1−e), 0, 0), vel = v_p × (0, cos i, sin i) — 승교점이 +x 축인 경사 궤도.
 * v_p = √(μ(1+e)/(a(1−e))) (vis-viva 근점 특수화).
 */
function periapsisState(a: number, e: number, inc: number) {
  const rp = a * (1 - e);
  const vp = Math.sqrt((MU_JUPITER * (1 + e)) / rp);
  return {
    pos: [rp, 0, 0] as const,
    vel: [0, vp * Math.cos(inc), vp * Math.sin(inc)] as const,
  };
}

describe('#849 extractOsculatingElements — 원궤도 (singularity 경로)', () => {
  it('Europa 장반경 원속도 → a 복원 + e≈0 + singularity=1', () => {
    const r = 671_100_000; // Europa a [m]
    const v = Math.sqrt(MU_JUPITER / r);
    const el = extractOsculatingElements([r, 0, 0], [0, v, 0], MU_JUPITER);
    expect(el).not.toBeNull();
    expect(Math.abs(el!.semiMajorAxis - r) / r).toBeLessThan(1e-6);
    expect(el!.eccentricity).toBeLessThan(1e-6);
    expect(el!.singularity).toBe(1); // 원순환 근사 플래그 (e<1e-6)
  });
});

describe('#849 extractOsculatingElements — (a, e, i) 격자 왕복 property', () => {
  // 결정적 격자: Galilean 위성 스케일 a × 저/중/고 이심률 × 2 경사.
  // i 는 1e-6 초과 (singularity 회피) — 평면 궤도(i=0) 는 위 원궤도 케이스가 커버.
  const A_SAMPLES = [421_800_000, 671_100_000, 1_882_700_000]; // Io / Europa / Callisto a [m]
  const E_SAMPLES = [0.05, 0.3, 0.7];
  const I_SAMPLES = [0.3, 1.2]; // [rad]

  for (const a of A_SAMPLES) {
    for (const e of E_SAMPLES) {
      for (const inc of I_SAMPLES) {
        it(`a=${a.toExponential(3)} e=${e} i=${inc} → 근점 상태 왕복 복원`, () => {
          const { pos, vel } = periapsisState(a, e, inc);
          const el = extractOsculatingElements(pos, vel, MU_JUPITER);
          expect(el).not.toBeNull();
          expect(Math.abs(el!.semiMajorAxis - a) / a).toBeLessThan(1e-6);
          expect(el!.eccentricity).toBeCloseTo(e, 6);
          expect(el!.inclination).toBeCloseTo(inc, 6);
          expect(el!.singularity).toBe(0);
          // 근점 시작 → 평균근점이각 M ≈ 0 (mod 2π).
          const m = el!.meanAnomaly % (2 * Math.PI);
          expect(Math.min(m, 2 * Math.PI - m)).toBeCloseTo(0, 5);
          // 나머지 각 원소도 유한 (Ω/ω — 값 자체는 Rust 수치 검증 영역).
          expect(Number.isFinite(el!.longitudeOfAscendingNode)).toBe(true);
          expect(Number.isFinite(el!.argumentOfPeriapsis)).toBe(true);
        });
      }
    }
  }
});

describe('#849 extractOsculatingElements — 실패/경계 계약', () => {
  it('퇴화 입력 (영벡터 + μ=0) 에도 throw 하지 않는다 (null 또는 객체 — 폴백 계약)', () => {
    // 래퍼 계약: 실패 시 null 반환 (호출자가 정적 JSON 폴백 수행). 어떤 입력에도 throw 금지.
    let el: ReturnType<typeof extractOsculatingElements> | undefined;
    expect(() => {
      el = extractOsculatingElements([0, 0, 0], [0, 0, 0], 0);
    }).not.toThrow();
    // null 이면 폴백 경로, 객체면 singularity 는 0|1 로 협착되어야 한다.
    if (el) expect([0, 1]).toContain(el.singularity);
  });

  it('singularity 는 정확히 0|1 로 협착 (원궤도=1 / 경사 타원=0 대조)', () => {
    const circular = extractOsculatingElements(
      [671_100_000, 0, 0],
      [0, Math.sqrt(MU_JUPITER / 671_100_000), 0],
      MU_JUPITER,
    );
    const { pos, vel } = periapsisState(671_100_000, 0.3, 0.5);
    const inclined = extractOsculatingElements(pos, vel, MU_JUPITER);
    expect(circular!.singularity).toBe(1);
    expect(inclined!.singularity).toBe(0);
  });
});
