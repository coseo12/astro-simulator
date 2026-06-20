/**
 * Orbit Visual Scale SSoT 회귀 가드.
 *
 * R4 #539 Amendment 2 (earth-moon) + R5 #594 (mars-satellites) 박제값 보호.
 */
import { describe, it, expect } from 'vitest';
import {
  EARTH_MOON_ORBIT_VISUAL_SCALE,
  MARS_SATELLITES_ORBIT_VISUAL_SCALE,
  JUPITER_SATELLITES_ORBIT_VISUAL_SCALE,
  SATURN_SATELLITES_ORBIT_VISUAL_SCALE,
  URANUS_SATELLITES_ORBIT_VISUAL_SCALE,
  NEPTUNE_SATELLITES_ORBIT_VISUAL_SCALE,
  ORBIT_VISUAL_SCALE_BY_PARENT,
  ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY,
  getOrbitVisualScale,
} from './orbit-visual-scale.js';

describe('orbit-visual-scale SSoT (R4 #539 Amendment 2)', () => {
  it('EARTH_MOON_ORBIT_VISUAL_SCALE 박제값 = 30 (D-T2 미통과 시 fallback 50/75)', () => {
    expect(EARTH_MOON_ORBIT_VISUAL_SCALE).toBe(30);
  });

  it('ORBIT_VISUAL_SCALE_BY_PARENT.earth = EARTH_MOON_ORBIT_VISUAL_SCALE', () => {
    expect(ORBIT_VISUAL_SCALE_BY_PARENT.earth).toBe(EARTH_MOON_ORBIT_VISUAL_SCALE);
  });

  it('parent=earth 룩업 = 30 (moon)', () => {
    expect(getOrbitVisualScale('earth')).toBe(30);
  });

  it('parent=sun 미정의 → 1.0 (실측 그대로, mercury/venus/earth 무영향)', () => {
    expect(getOrbitVisualScale('sun')).toBe(1.0);
  });

  it('parent=null/undefined → 1.0 (free-fly / root body)', () => {
    expect(getOrbitVisualScale(null)).toBe(1.0);
    expect(getOrbitVisualScale(undefined)).toBe(1.0);
  });

  it('미매핑 parent (pluto / halley — 진입했으나 위성 0) → 1.0', () => {
    // R10a #659 — pluto 는 allowlist 진입했으나 charon 등 위성 데이터 부재 (R9 인계 #6 이월)
    // → ORBIT_VISUAL_SCALE_BY_PARENT 미매핑이 정합. halley 도 R10b #664 진입 후 동일 분류 —
    // semantics "미진입" → "미매핑 (위성 0)" 전환 (단언 불변, ADR 20260612-r10b §축 5 변경 0 행).
    expect(getOrbitVisualScale('pluto')).toBe(1.0);
    expect(getOrbitVisualScale('halley')).toBe(1.0);
  });

  it('ORBIT_VISUAL_SCALE_BY_PARENT 는 frozen (런타임 변경 차단)', () => {
    expect(Object.isFrozen(ORBIT_VISUAL_SCALE_BY_PARENT)).toBe(true);
  });

  it('분리 마진 산출 검증 — visual_scale=30 → sum mesh < visual 거리 (≥ 1.5x 안전 임계)', () => {
    // ADR §Amendment 2 §측정 1 박제값 (실측 거리 + earthScale=800 + moonScale=800)
    const EM_DISTANCE_M = 3.847e8;
    const EARTH_MESH_RADIUS_M = 5.103e9;
    const MOON_MESH_RADIUS_M = 1.39e9;
    const SUM_MESH_M = EARTH_MESH_RADIUS_M + MOON_MESH_RADIUS_M;

    const visualScale = getOrbitVisualScale('earth');
    const visualDistance = EM_DISTANCE_M * visualScale;
    const separationMargin = visualDistance / SUM_MESH_M;

    // ADR §결정 6 §Visual scale 후보 비교 §×30 = 1.78배 분리 마진 통과
    expect(separationMargin).toBeGreaterThanOrEqual(1.5);
    expect(separationMargin).toBeCloseTo(1.78, 1);
  });
});

describe('orbit-visual-scale SSoT (R5 #594 mars-satellites — satellite 2개 첫 본 사례)', () => {
  it('MARS_SATELLITES_ORBIT_VISUAL_SCALE 박제값 = 500 (D-T2 미통과 시 fallback 600/750)', () => {
    expect(MARS_SATELLITES_ORBIT_VISUAL_SCALE).toBe(500);
  });

  it('ORBIT_VISUAL_SCALE_BY_PARENT.mars = MARS_SATELLITES_ORBIT_VISUAL_SCALE', () => {
    expect(ORBIT_VISUAL_SCALE_BY_PARENT.mars).toBe(MARS_SATELLITES_ORBIT_VISUAL_SCALE);
  });

  it('parent=mars 룩업 = 500 (phobos + deimos 둘 다 적용)', () => {
    expect(getOrbitVisualScale('mars')).toBe(500);
  });

  it('phobos 분리 마진 산출 — binding constraint, visual_scale=500 → 1.69배 (≥ 1.5 통과 +0.19)', () => {
    // ADR §결정 4 §축 4 박제값 (실측 거리 + marsScale=800 + phobosScale=5000)
    const MARS_PHOBOS_DISTANCE_M = 9.376e6;
    const MARS_MESH_RADIUS_M = 2.717e9; // 3.3962e6 × 800
    const PHOBOS_MESH_RADIUS_M = 5.54e7; // 1.108e4 × 5000
    const SUM_MESH_M = MARS_MESH_RADIUS_M + PHOBOS_MESH_RADIUS_M;

    const visualScale = getOrbitVisualScale('mars');
    const visualDistance = MARS_PHOBOS_DISTANCE_M * visualScale;
    const separationMargin = visualDistance / SUM_MESH_M;

    // ADR §결정 4 §축 4 §×500 = 1.69배 분리 마진 통과
    expect(separationMargin).toBeGreaterThanOrEqual(1.5);
    expect(separationMargin).toBeCloseTo(1.69, 1);
  });

  it('deimos 분리 마진 산출 — 자동 안전, visual_scale=500 → 4.27배 (phobos binding 자동 통과)', () => {
    // ADR §결정 4 §축 4 박제값 (실측 거리 + marsScale=800 + deimosScale=5000)
    const MARS_DEIMOS_DISTANCE_M = 23.463e6;
    const MARS_MESH_RADIUS_M = 2.717e9; // 3.3962e6 × 800
    const DEIMOS_MESH_RADIUS_M = 3.135e7; // 6.27e3 × 5000
    const SUM_MESH_M = MARS_MESH_RADIUS_M + DEIMOS_MESH_RADIUS_M;

    const visualScale = getOrbitVisualScale('mars');
    const visualDistance = MARS_DEIMOS_DISTANCE_M * visualScale;
    const separationMargin = visualDistance / SUM_MESH_M;

    // ADR §결정 4 §축 4 §×500 = 4.27배 분리 마진 (phobos 1.69배 의 2.53배 더 안전)
    expect(separationMargin).toBeGreaterThanOrEqual(1.5);
    expect(separationMargin).toBeCloseTo(4.27, 1);
  });
});

describe('orbit-visual-scale SSoT (R6 #621 — jupiter-galilean)', () => {
  it('JUPITER_SATELLITES_ORBIT_VISUAL_SCALE = 16 (R6 #621 박제값)', () => {
    expect(JUPITER_SATELLITES_ORBIT_VISUAL_SCALE).toBe(16);
  });

  it('ORBIT_VISUAL_SCALE_BY_PARENT.jupiter == JUPITER_SATELLITES_ORBIT_VISUAL_SCALE (룩업 정합)', () => {
    expect(ORBIT_VISUAL_SCALE_BY_PARENT.jupiter).toBe(JUPITER_SATELLITES_ORBIT_VISUAL_SCALE);
  });

  it('getOrbitVisualScale(jupiter) == 16', () => {
    expect(getOrbitVisualScale('jupiter')).toBe(16);
  });

  it('io 분리 마진 산출 (산식 A, binding constraint) — visual_scale=16 → 1.69x (R5 phobos 정합)', () => {
    // R6 ADR §결정 4 §축 4 박제값 (실측 거리 + jupiterScale=48 + ioScale=300)
    const JUPITER_IO_DISTANCE_M = 4.2023e8; // semiMajorAxisAU 0.00280906
    const JUPITER_MESH_RADIUS_M = 3.4316e9; // 7.1492e7 × 48
    const IO_MESH_RADIUS_M = 5.465e8; // 1.8216e6 × 300
    const SUM_MESH_M = JUPITER_MESH_RADIUS_M + IO_MESH_RADIUS_M;

    const visualScale = getOrbitVisualScale('jupiter');
    const visualDistance = JUPITER_IO_DISTANCE_M * visualScale;
    const separationMargin = visualDistance / SUM_MESH_M;

    // ADR §결정 4 — io binding 분리 마진 1.69x (≥ 1.5 임계 +0.19, R5 phobos 1.69x 정확 정합)
    expect(separationMargin).toBeGreaterThanOrEqual(1.5);
    expect(separationMargin).toBeCloseTo(1.69, 1);
  });

  it('callisto 분리 마진 산출 (자동 안전) — visual_scale=16 → 7.25x (io binding 자동 통과)', () => {
    // R6 ADR §결정 4 §축 4 박제값 (실측 거리 + jupiterScale=48 + callistoScale=300)
    const JUPITER_CALLISTO_DISTANCE_M = 1.8826e9; // semiMajorAxisAU 0.0125847
    const JUPITER_MESH_RADIUS_M = 3.4316e9; // 7.1492e7 × 48
    const CALLISTO_MESH_RADIUS_M = 7.231e8; // 2.4103e6 × 300
    const SUM_MESH_M = JUPITER_MESH_RADIUS_M + CALLISTO_MESH_RADIUS_M;

    const visualScale = getOrbitVisualScale('jupiter');
    const visualDistance = JUPITER_CALLISTO_DISTANCE_M * visualScale;
    const separationMargin = visualDistance / SUM_MESH_M;

    // ADR §결정 4 — callisto 자동 안전 7.25x (io 가 binding constraint, 나머지 3개 자동 통과)
    expect(separationMargin).toBeGreaterThanOrEqual(1.5);
    expect(separationMargin).toBeCloseTo(7.25, 0);
  });
});

describe('orbit-visual-scale SSoT (R7 #641 — saturn-titan, binding=ring outer 신규 유형)', () => {
  it('SATURN_SATELLITES_ORBIT_VISUAL_SCALE = 10 (R7 #641 박제값)', () => {
    expect(SATURN_SATELLITES_ORBIT_VISUAL_SCALE).toBe(10);
  });

  it('ORBIT_VISUAL_SCALE_BY_PARENT.saturn == SATURN_SATELLITES_ORBIT_VISUAL_SCALE (룩업 정합)', () => {
    expect(ORBIT_VISUAL_SCALE_BY_PARENT.saturn).toBe(SATURN_SATELLITES_ORBIT_VISUAL_SCALE);
  });

  it('getOrbitVisualScale(saturn) == 10', () => {
    expect(getOrbitVisualScale('saturn')).toBe(10);
  });

  it('titan 분리 마진 산출 (산식 A, binding=ring outer mesh) — visual_scale=10 → 1.75x', () => {
    // R7 ADR §축 4 박제값. binding constraint 가 parent mesh 가 아닌 ring outer mesh —
    // ring × bodyScale 결합 (§축 2a) 으로 F ring outer 가 saturn mesh 의 2.326배까지 확장.
    const SATURN_TITAN_DISTANCE_M = 1.22187e9; // semiMajorAxisAU 8.1677e-3
    const F_RING_OUTER_MESH_M = 1.4018e8 * 48; // F ring outer 실반경 × saturnScale=48 = 6.7286e9
    const TITAN_MESH_RADIUS_M = 2.575e6 * 100; // titanScale=100 = 2.575e8
    const SUM_MESH_M = F_RING_OUTER_MESH_M + TITAN_MESH_RADIUS_M;

    const visualScale = getOrbitVisualScale('saturn');
    const visualDistance = SATURN_TITAN_DISTANCE_M * visualScale;
    const separationMargin = visualDistance / SUM_MESH_M;

    // ADR §축 4 — titan 분리 마진 1.75x (≥ 1.5 통과 +0.25, R4 moon 1.78x 근접 정합)
    expect(separationMargin).toBeGreaterThanOrEqual(1.5);
    expect(separationMargin).toBeCloseTo(1.75, 1);
  });

  it('ring 미고려 함정값 검증 — saturn mesh 만 분모로 쓰면 ×10 마진 3.88x 로 과대평가', () => {
    // R7 ADR §축 4 — ring 미고려 시 ×4 가 1.55x 로 통과 오판하는 함정. binding 정의가
    // ring outer 임을 회귀 가드 (R8+ uranus ring 보유 진입 시 동일 유형 답습).
    const SATURN_TITAN_DISTANCE_M = 1.22187e9;
    const SATURN_MESH_RADIUS_M = 6.0268e7 * 48; // 2.8929e9
    const TITAN_MESH_RADIUS_M = 2.575e6 * 100;
    const marginVsMeshOnly =
      (SATURN_TITAN_DISTANCE_M * getOrbitVisualScale('saturn')) /
      (SATURN_MESH_RADIUS_M + TITAN_MESH_RADIUS_M);
    expect(marginVsMeshOnly).toBeCloseTo(3.88, 1);
  });
});

describe('orbit-visual-scale SSoT (R8 #647 — uranus-titania, binding=ring outer 2번째 인스턴스)', () => {
  it('URANUS_SATELLITES_ORBIT_VISUAL_SCALE = 50 (R8 #647 박제값)', () => {
    expect(URANUS_SATELLITES_ORBIT_VISUAL_SCALE).toBe(50);
  });

  it('ORBIT_VISUAL_SCALE_BY_PARENT.uranus == URANUS_SATELLITES_ORBIT_VISUAL_SCALE (룩업 정합)', () => {
    expect(ORBIT_VISUAL_SCALE_BY_PARENT.uranus).toBe(URANUS_SATELLITES_ORBIT_VISUAL_SCALE);
  });

  it('getOrbitVisualScale(uranus) == 50', () => {
    expect(getOrbitVisualScale('uranus')).toBe(50);
  });

  it('titania 분리 마진 산출 (산식 A, binding=ring outer mesh) — visual_scale=50 → 1.65x', () => {
    // R8 ADR §축 4 박제값. binding constraint = ε ring outer mesh — ring × bodyScale 결합으로
    // ε ring outer (5.1149e7 m) × uranusScale 250 = 1.2787e10 m (uranus mesh 의 2.001배).
    const URANUS_TITANIA_DISTANCE_M = 4.3591e8; // semiMajorAxisAU 2.91388e-3
    const EPSILON_RING_OUTER_MESH_M = 5.1149e7 * 250; // 1.2787e10
    const TITANIA_MESH_RADIUS_M = 7.884e5 * 500; // 3.942e8
    const SUM_MESH_M = EPSILON_RING_OUTER_MESH_M + TITANIA_MESH_RADIUS_M;

    const visualScale = getOrbitVisualScale('uranus');
    const visualDistance = URANUS_TITANIA_DISTANCE_M * visualScale;
    const separationMargin = visualDistance / SUM_MESH_M;

    // ADR §축 4 — titania 분리 마진 1.65x (≥ 1.5 통과 +0.15, R5 phobos/R6 io 1.69x 근접 정합)
    expect(separationMargin).toBeGreaterThanOrEqual(1.5);
    expect(separationMargin).toBeCloseTo(1.65, 1);
  });

  it('ring 미고려 함정값 검증 — uranus mesh 만 분모로 쓰면 ×30 이 2.05x 통과 오판 (실제 0.99x fail)', () => {
    // R8 ADR §축 4 — ×30 함정값: uranus mesh 만 보면 2.05x 통과처럼 보이나 ring outer 분모로는
    // 0.99x fail (titania 가 고리 안에 묻힘). binding = ring outer 정의 회귀 가드.
    const URANUS_TITANIA_DISTANCE_M = 4.3591e8;
    const URANUS_MESH_RADIUS_M = 2.5559e7 * 250; // 6.3898e9
    const EPSILON_RING_OUTER_MESH_M = 5.1149e7 * 250; // 1.2787e10
    const TITANIA_MESH_RADIUS_M = 7.884e5 * 500;

    const trapScale = 30;
    // ADR §축 4 "vs uranus mesh 만 (참고)" 열 — parent mesh 단독 분모 (satellite mesh 미포함)
    const marginVsMeshOnly = (URANUS_TITANIA_DISTANCE_M * trapScale) / URANUS_MESH_RADIUS_M;
    const marginVsRingOuter =
      (URANUS_TITANIA_DISTANCE_M * trapScale) / (EPSILON_RING_OUTER_MESH_M + TITANIA_MESH_RADIUS_M);
    expect(marginVsMeshOnly).toBeCloseTo(2.05, 1); // 통과처럼 보이는 함정
    expect(marginVsRingOuter).toBeLessThan(1.5); // 실제 fail (0.99x)
    expect(marginVsRingOuter).toBeCloseTo(0.99, 1);
  });
});

describe('orbit-visual-scale SSoT (R9 #653 — neptune-triton, binding=ring outer 3번째 인스턴스)', () => {
  it('NEPTUNE_SATELLITES_ORBIT_VISUAL_SCALE = 75 (R9 #653 박제값)', () => {
    expect(NEPTUNE_SATELLITES_ORBIT_VISUAL_SCALE).toBe(75);
  });

  it('ORBIT_VISUAL_SCALE_BY_PARENT.neptune == NEPTUNE_SATELLITES_ORBIT_VISUAL_SCALE (룩업 정합)', () => {
    expect(ORBIT_VISUAL_SCALE_BY_PARENT.neptune).toBe(NEPTUNE_SATELLITES_ORBIT_VISUAL_SCALE);
  });

  it('getOrbitVisualScale(neptune) == 75', () => {
    expect(getOrbitVisualScale('neptune')).toBe(75);
  });

  it('triton 분리 마진 산출 (산식 A, binding=ring outer mesh) — visual_scale=75 → 1.65x', () => {
    // R9 ADR §축 4 박제값. binding constraint = Adams ring outer mesh — ring × bodyScale 결합으로
    // Adams ring outer (6.293e7 m) × neptuneScale 250 = 1.57325e10 m (neptune mesh 의 2.541배).
    const NEPTUNE_TRITON_DISTANCE_M = 3.54759e8; // semiMajorAxisAU 2.37142e-3
    const ADAMS_RING_OUTER_MESH_M = 6.293e7 * 250; // 1.57325e10
    const TRITON_MESH_RADIUS_M = 1.3534e6 * 300; // 4.0602e8
    const SUM_MESH_M = ADAMS_RING_OUTER_MESH_M + TRITON_MESH_RADIUS_M;

    const visualScale = getOrbitVisualScale('neptune');
    const visualDistance = NEPTUNE_TRITON_DISTANCE_M * visualScale;
    const separationMargin = visualDistance / SUM_MESH_M;

    // ADR §축 4 — triton 분리 마진 1.65x (≥ 1.5 통과 +0.15, R8 titania 1.65x 정확 동률)
    expect(separationMargin).toBeGreaterThanOrEqual(1.5);
    expect(separationMargin).toBeCloseTo(1.65, 1);
  });

  it('ice giant 답습 함정값 검증 — ×50 (uranus 답습) 은 neptune mesh 분모로 2.69x 통과 오판 (실제 1.10x fail)', () => {
    // R9 ADR §축 4 — ×50 함정값: Adams ring 상대 확장 (2.541) 이 uranus ε (2.001) 보다 커서
    // ice giant 동일 scale 답습이 미달. binding = ring outer 정의 회귀 가드 (3번째 인스턴스).
    const NEPTUNE_TRITON_DISTANCE_M = 3.54759e8;
    const NEPTUNE_MESH_RADIUS_M = 2.4764e7 * 250; // 6.191e9
    const ADAMS_RING_OUTER_MESH_M = 6.293e7 * 250; // 1.57325e10
    const TRITON_MESH_RADIUS_M = 1.3534e6 * 300;

    const trapScale = 50;
    // ADR §축 4 "vs neptune mesh 만 (참고)" 열 — ring 미고려 분모 (neptune mesh + triton mesh)
    const marginVsMeshOnly =
      (NEPTUNE_TRITON_DISTANCE_M * trapScale) / (NEPTUNE_MESH_RADIUS_M + TRITON_MESH_RADIUS_M);
    const marginVsRingOuter =
      (NEPTUNE_TRITON_DISTANCE_M * trapScale) / (ADAMS_RING_OUTER_MESH_M + TRITON_MESH_RADIUS_M);
    expect(marginVsMeshOnly).toBeCloseTo(2.69, 1); // 통과처럼 보이는 함정 (ring 미고려)
    expect(marginVsRingOuter).toBeLessThan(1.5); // 실제 fail (1.10x — 고리 안에 묻힘)
    expect(marginVsRingOuter).toBeCloseTo(1.1, 1);
  });
});

describe('orbit-visual-scale SSoT (R11 #721 — ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY per-body 첫 발동)', () => {
  // R5 §위험 #6 (2026-05-28) → R6 §재검토 트리거 #3 (2026-06-05) 인계 → 본 ADR 첫 실전.
  // a 편차 14.96배 (enceladus 최내곽 ↔ iapetus 최외곽) 로 단일 saturn 룩업 양립 불가 → per-body 룩업.

  it('ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY 박제값 (enceladus 47 / rhea 20 / titan 10 / iapetus 10)', () => {
    expect(ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY.enceladus).toBe(47);
    expect(ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY.rhea).toBe(20);
    expect(ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY.titan).toBe(10);
    expect(ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY.iapetus).toBe(10);
  });

  it('ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY 는 frozen (런타임 변경 차단)', () => {
    expect(Object.isFrozen(ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY)).toBe(true);
  });

  describe('getOrbitVisualScale 3계층 우선순위 (per-body > parent > default)', () => {
    it('per-body 룩업 우선 — saturn 위성은 bodyId 로 per-body scale 반환 (parent saturn=10 무시)', () => {
      // bodyId 전달 시 per-body 룩업이 parent 룩업 (saturn=10) 보다 우선.
      expect(getOrbitVisualScale('saturn', 'enceladus')).toBe(47);
      expect(getOrbitVisualScale('saturn', 'rhea')).toBe(20);
      expect(getOrbitVisualScale('saturn', 'titan')).toBe(10);
      expect(getOrbitVisualScale('saturn', 'iapetus')).toBe(10);
    });

    it('per-body 미정의 위성은 parent 룩업 fallback (회귀 0 — moon/galilean/titania/triton)', () => {
      // bodyId 가 per-body 에 없으면 parent 룩업으로 fallback. 기존 동작 보존.
      expect(getOrbitVisualScale('earth', 'moon')).toBe(30); // EARTH_MOON parent 룩업
      expect(getOrbitVisualScale('jupiter', 'io')).toBe(16); // JUPITER parent 룩업
      expect(getOrbitVisualScale('uranus', 'titania')).toBe(50); // URANUS parent 룩업
      expect(getOrbitVisualScale('neptune', 'triton')).toBe(75); // NEPTUNE parent 룩업
      expect(getOrbitVisualScale('mars', 'phobos')).toBe(500); // MARS parent 룩업
    });

    it('bodyId 미전달 (기존 호출처) — parent 룩업 fallback (회귀 0, getOrbitVisualScale(parentId))', () => {
      // bodyId 인자 없이 호출 시 기존 동작 그대로. saturn=10 (per-body 미적용).
      expect(getOrbitVisualScale('saturn')).toBe(10);
      expect(getOrbitVisualScale('earth')).toBe(30);
      expect(getOrbitVisualScale('jupiter')).toBe(16);
    });

    it('bodyId=null/undefined — parent 룩업 fallback (per-body 미적용)', () => {
      expect(getOrbitVisualScale('saturn', null)).toBe(10);
      expect(getOrbitVisualScale('saturn', undefined)).toBe(10);
    });

    it('per-body 정의 + parentId=null — per-body 룩업이 여전히 우선 (parent 무관)', () => {
      // per-body 룩업은 bodyId 만 보므로 parentId 가 null 이어도 적용 (방어적 동작).
      expect(getOrbitVisualScale(null, 'enceladus')).toBe(47);
    });

    it('미매핑 bodyId + 미매핑 parent → 1.0 (DEFAULT_ORBIT_VISUAL_SCALE)', () => {
      expect(getOrbitVisualScale('pluto', 'charon')).toBe(1.0); // 둘 다 미정의
    });
  });

  describe('4 위성 분리 마진 산출 (산식 A, binding=F ring outer mesh — developer 실측 2026-06-20)', () => {
    // ADR §축 2 박제값. binding = F ring outer mesh (140680 km × saturnScale 48 = 6.7526e9 m,
    // saturn mesh 의 2.334배). 4 위성 각각 per-body visual scale 로 margin ≥ 1.5 충족.
    const F_RING_OUTER_MESH_M = 140680 * 1000 * 48; // 6.7526e9
    const KM_M = 1000;

    it('enceladus 분리 마진 (binding, 최내곽) — visual ×47 → 1.64x', () => {
      const A_M = 238040 * KM_M; // NASA Fact Sheet a
      const SAT_MESH_M = 2.521e5 * 250; // enceladusScale=250 = 6.303e7
      const margin =
        (A_M * getOrbitVisualScale('saturn', 'enceladus')) / (F_RING_OUTER_MESH_M + SAT_MESH_M);
      expect(margin).toBeGreaterThanOrEqual(1.5);
      expect(margin).toBeCloseTo(1.64, 1);
    });

    it('rhea 분리 마진 — visual ×20 → 1.52x (×10 시 0.76x 묻힘)', () => {
      const A_M = 527108 * KM_M;
      const SAT_MESH_M = 7.64e5 * 250; // rheaScale=250 = 1.91e8
      const margin =
        (A_M * getOrbitVisualScale('saturn', 'rhea')) / (F_RING_OUTER_MESH_M + SAT_MESH_M);
      expect(margin).toBeGreaterThanOrEqual(1.5);
      expect(margin).toBeCloseTo(1.52, 1);
    });

    it('titan 분리 마진 (R7 박제 보존 — 회귀 0) — visual ×10 → 1.74x', () => {
      const A_M = 1221870 * KM_M;
      const SAT_MESH_M = 2.575e6 * 100; // titanScale=100 = 2.575e8
      const margin =
        (A_M * getOrbitVisualScale('saturn', 'titan')) / (F_RING_OUTER_MESH_M + SAT_MESH_M);
      expect(margin).toBeGreaterThanOrEqual(1.5);
      expect(margin).toBeCloseTo(1.74, 1);
    });

    it('iapetus 분리 마진 (최외곽, 자동 안전) — visual ×10 → 5.13x', () => {
      const A_M = 3560820 * KM_M;
      const SAT_MESH_M = 7.345e5 * 250; // iapetusScale=250 = 1.836e8
      const margin =
        (A_M * getOrbitVisualScale('saturn', 'iapetus')) / (F_RING_OUTER_MESH_M + SAT_MESH_M);
      expect(margin).toBeGreaterThanOrEqual(1.5);
      expect(margin).toBeCloseTo(5.13, 1);
    });
  });

  describe('단일 룩업 한계 입증 (per-body 발동 근거 — 회귀 가드)', () => {
    const F_RING_OUTER_MESH_M = 140680 * 1000 * 48;
    const KM_M = 1000;

    it('단일 ×10 (saturn 기존) 으로는 enceladus 0.35x / rhea 0.76x 묻힘 (per-body 필요 입증)', () => {
      const encMargin = (238040 * KM_M * 10) / (F_RING_OUTER_MESH_M + 2.521e5 * 250);
      const rheaMargin = (527108 * KM_M * 10) / (F_RING_OUTER_MESH_M + 7.64e5 * 250);
      expect(encMargin).toBeLessThan(1.5);
      expect(encMargin).toBeCloseTo(0.35, 1);
      expect(rheaMargin).toBeLessThan(1.5);
      expect(rheaMargin).toBeCloseTo(0.76, 1);
    });

    it('단일 ×47 (enceladus 충족) 으로는 iapetus 24.13x 과분리 (양립 불가 입증)', () => {
      // 단일 visual scale 로 enceladus 를 충족하면 iapetus 가 과분리 → per-body 가 유일 해법.
      const iapMargin = (3560820 * KM_M * 47) / (F_RING_OUTER_MESH_M + 7.345e5 * 250);
      expect(iapMargin).toBeGreaterThan(20); // 과분리 (saturn mesh 의 55배 영역)
      expect(iapMargin).toBeCloseTo(24.13, 0);
    });

    it('a 편차 14.96배 — 단일 룩업 한계 근본 원인 (enceladus 최내곽 ↔ iapetus 최외곽)', () => {
      const ratio = 3560820 / 238040;
      expect(ratio).toBeCloseTo(14.96, 1);
      expect(ratio).toBeGreaterThan(5); // a 편차 > 5배 → per-body 룩업 발동 조건 (titan 단독 R7 / galilean 4.5배 R6 초과)
    });
  });
});
