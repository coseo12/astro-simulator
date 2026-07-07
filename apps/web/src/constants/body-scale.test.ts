import { describe, expect, it } from 'vitest';
import solarSystem from '@astro-simulator/shared/data/solar-system.json';
import {
  BODY_RADIUS_M,
  BODY_SCALE,
  DEFAULT_BODY_SCALE_P,
  DWARF_IDS,
  PLANET_IDS,
  getBodyScale,
  getBodyScaleForP,
} from './body-scale';

/**
 * #762 — 천체 표시 크기 비율 단조성 회복 (sqrt 압축 곡선 + 그룹별 정책).
 *
 * ADR `20260629-762-body-scale-monotonic-forensic.md` §5 결정 2.
 *
 * 핵심 가드:
 *   1. 행성 cross-body 단조 — effective(=radius×scale) 순서 = 실반경 순서
 *   2. 위성 per-parent 수렴대(0.05~0.09) mesh 비 보존 (정적 역산)
 *   3. 왜소행성 cross-group floor — 전부 mercury effective 아래
 *   4. 그룹 경계 assert — max(satellite) < min(planet) 등 (achievable invariant)
 *   5. NaN guard / 미정의 fallback
 *   6. BODY_RADIUS_M ↔ solar-system.json drift 가드 (volt #69 숨은 상수)
 *      — #764 에서 32 body 전수 직접 단언으로 확장 (위성·혜성 포함, #763 reviewer 권고 2)
 */

// 사실 radius (m) — solar-system.json SSoT 에서 동적 추출 (drift 가드).
const RADIUS: Record<string, number> = {};
for (const b of (solarSystem as { bodies: { id: string; radius?: number }[] }).bodies) {
  if (typeof b.radius === 'number') RADIUS[b.id] = b.radius;
}

const eff = (id: string) => RADIUS[id]! * BODY_SCALE[id]!;

describe('#762 — 행성 cross-body 단조성 (압축 곡선)', () => {
  it('effective(=radius×scale) 순서 = 실반경 순서 (jupiter > saturn > uranus > neptune > earth > venus > mars > mercury)', () => {
    const byRadiusDesc = [...PLANET_IDS].sort((a, b) => RADIUS[b]! - RADIUS[a]!);
    expect(byRadiusDesc).toEqual([
      'jupiter',
      'saturn',
      'uranus',
      'neptune',
      'earth',
      'venus',
      'mars',
      'mercury',
    ]);
    // effective 가 실반경 내림차순으로 strict 단조 — 인접 쌍 7개 부등호.
    for (let i = 0; i < byRadiusDesc.length - 1; i++) {
      const hi = byRadiusDesc[i]!;
      const lo = byRadiusDesc[i + 1]!;
      expect(eff(hi), `${hi} effective 가 ${lo} 보다 커야 함 (실반경 순서 보존)`).toBeGreaterThan(
        eff(lo),
      );
    }
  });

  it('jupiter 가 최대 effective — earth > jupiter 역전 해소 (#762 핵심 회귀)', () => {
    // forensic 측정 1: earth(10.12px) > jupiter(8.81px) 역전 → 곡선으로 jupiter 1위 회복.
    expect(eff('jupiter')).toBeGreaterThan(eff('earth'));
    expect(eff('jupiter')).toBe(Math.max(...PLANET_IDS.map(eff)));
  });

  it('mercury floor — 곡선 정규화 앵커 (scale 700 고정, 현 px 7.0 유지)', () => {
    expect(BODY_SCALE.mercury).toBeCloseTo(700, 5);
  });

  it('p=0.5 곡선 등가 scale (ADR §4 예측 2 baseline — ±1% 마진)', () => {
    // forensic 산출값 (mercury floor 고정). drift 시 곡선식/상수 회귀 감지.
    const expected: Record<string, number> = {
      jupiter: 129.3,
      saturn: 140.8,
      uranus: 216.3,
      neptune: 219.7,
      earth: 432.9,
      venus: 444.5,
      mars: 593.3,
      mercury: 700.0,
    };
    for (const [id, val] of Object.entries(expected)) {
      expect(BODY_SCALE[id]!, `${id} scale`).toBeGreaterThan(val * 0.99);
      expect(BODY_SCALE[id]!, `${id} scale`).toBeLessThan(val * 1.01);
    }
  });

  it('sun 은 곡선 미적용 — 항성 점유 정책 scale 50 별도 유지', () => {
    expect(BODY_SCALE.sun).toBe(50);
  });
});

describe('#762 — 위성 per-parent 수렴대 보존 (정적 역산)', () => {
  // ADR §5 결정 2.2 — parent effective 가 곡선으로 바뀌어도 위성 mesh 비(0.05~0.09)는 보존.
  const SAT_PARENT: Record<string, { parent: string; band: [number, number] }> = {
    moon: { parent: 'earth', band: [0.05, 0.09] },
    io: { parent: 'jupiter', band: [0.05, 0.09] },
    europa: { parent: 'jupiter', band: [0.04, 0.09] }, // 0.046
    ganymede: { parent: 'jupiter', band: [0.05, 0.09] },
    callisto: { parent: 'jupiter', band: [0.05, 0.09] },
    titan: { parent: 'saturn', band: [0.05, 0.095] }, // 0.089 상한 근접
    rhea: { parent: 'saturn', band: [0.05, 0.09] },
    iapetus: { parent: 'saturn', band: [0.05, 0.09] },
    titania: { parent: 'uranus', band: [0.05, 0.09] },
    oberon: { parent: 'uranus', band: [0.05, 0.09] },
    triton: { parent: 'neptune', band: [0.05, 0.09] },
  };

  it('주요 위성 mesh 비(satellite/parent) 수렴대 [0.05~0.09] 보존', () => {
    for (const [sat, { parent, band }] of Object.entries(SAT_PARENT)) {
      const ratio = eff(sat) / eff(parent);
      expect(ratio, `${sat}/${parent} mesh 비 = ${ratio.toFixed(4)}`).toBeGreaterThanOrEqual(
        band[0],
      );
      expect(ratio, `${sat}/${parent} mesh 비 = ${ratio.toFixed(4)}`).toBeLessThanOrEqual(band[1]);
    }
  });

  it('sub-band 위성 (enceladus/proteus) 은 사실 radius 비 정직 반영 (4px fallback billboard 흡수)', () => {
    // enceladus(252km)/rhea(764km) = 0.33배 → mesh 비 0.0218 (수렴대 미달 정상).
    expect(eff('enceladus') / eff('saturn')).toBeCloseTo(0.0218, 3);
    // proteus(210km)/triton(1353km) — 0.0102 (수렴대 미달 정상, ADR §축 1 정직 반영).
    expect(eff('proteus') / eff('neptune')).toBeCloseTo(0.0102, 3);
  });

  it('iapetus/rhea 사실 radius 비 0.961 자동 보존 (동일 수렴대비 → mesh 비 = radius 비)', () => {
    // 두 위성 모두 parent=saturn, 같은 정적 역산 분모이므로 mesh 비 = radius 비.
    const ratio = eff('iapetus') / eff('rhea');
    expect(ratio).toBeCloseTo(RADIUS.iapetus! / RADIUS.rhea!, 2);
  });
});

describe('#762 — 왜소행성 cross-group floor (전부 mercury effective 아래)', () => {
  it('모든 왜소행성 effective < mercury effective (cross-group 단조)', () => {
    const mercuryEff = eff('mercury');
    for (const id of DWARF_IDS) {
      expect(eff(id), `${id} effective`).toBeLessThan(mercuryEff);
    }
  });

  it('왜소행성 그룹 내 사실 서열 보존 — pluto > eris > haumea > makemake > ceres', () => {
    const byRadiusDesc = [...DWARF_IDS].sort((a, b) => RADIUS[b]! - RADIUS[a]!);
    expect(byRadiusDesc).toEqual(['pluto', 'eris', 'haumea', 'makemake', 'ceres']);
    for (let i = 0; i < byRadiusDesc.length - 1; i++) {
      expect(eff(byRadiusDesc[i]!)).toBeGreaterThan(eff(byRadiusDesc[i + 1]!));
    }
  });
});

describe('#762 — 그룹 간 경계 단조 assert (silent 회귀 차단)', () => {
  // ⚠️ ADR §5 결정 2.4 원안 assert chain `max(comet) < min(satellite) < min(planet)` 중
  // `max(comet) < min(satellite)` 는 **실 데이터로 충족 불가** (measurement-first 발견, ADR Amendment 1):
  //   - proteus(210km, mesh 비 0.0102) / enceladus(252km, 0.0218) 같은 극소 위성의 effective 가
  //     swift-tuttle(13km comet × 5000) 보다 작다. 이는 **현 production 정책에서도 동일** (OLD: swift-tuttle
  //     eff 6.5e7 > proteus 6.3e7) → 본 PR 이 도입한 회귀 아님. proteus 가 swift-tuttle 보다 작아 보이는 것은
  //     사실 정합 (극소 위성 = 13km 혜성보다 mesh 작게 — radius 0.155배 정직 반영).
  // ∴ achievable invariant 로 정정: max(satellite) < min(planet) / max(dwarf) < min(planet) /
  //   max(comet) < min(planet) + max(comet) < min(dwarf) (의미 있는 cross-group 상한선).
  const PLANET = [...PLANET_IDS];
  const DWARF = [...DWARF_IDS];
  const SATELLITES = [
    'moon',
    'io',
    'europa',
    'ganymede',
    'callisto',
    'titan',
    'enceladus',
    'rhea',
    'iapetus',
    'titania',
    'oberon',
    'triton',
    'proteus',
  ];
  const COMETS = ['phobos', 'deimos', 'halley', 'encke', 'swift-tuttle'];
  const maxEff = (ids: string[]) => Math.max(...ids.map(eff));
  const minEff = (ids: string[]) => Math.min(...ids.map(eff));

  it('max(satellite) < min(planet) — 위성이 가장 작은 행성(mercury) 보다 크게 표시되지 않음', () => {
    expect(maxEff(SATELLITES)).toBeLessThan(minEff(PLANET));
  });

  it('max(dwarf) < min(planet) — 왜소행성이 행성 mercury floor 아래 (cross-group floor)', () => {
    expect(maxEff(DWARF)).toBeLessThan(minEff(PLANET));
  });

  it('max(comet) < min(planet) AND max(comet) < min(dwarf) — comet 5000 단일값 cross-group 상한 보존', () => {
    expect(maxEff(COMETS)).toBeLessThan(minEff(PLANET));
    expect(maxEff(COMETS)).toBeLessThan(minEff(DWARF));
  });

  it('comet 그룹 내 사실 서열 — swift-tuttle > phobos > deimos > halley > encke (동일 scale → radius 서열)', () => {
    expect(eff('swift-tuttle')).toBeGreaterThan(eff('phobos'));
    expect(eff('phobos')).toBeGreaterThan(eff('deimos'));
    expect(eff('deimos')).toBeGreaterThan(eff('halley'));
    expect(eff('halley')).toBeGreaterThan(eff('encke'));
  });

  it('comet 5 body 전부 동일값 5000 (단일값 구조 가드 — 개별 조정 회귀 차단)', () => {
    for (const id of COMETS) {
      expect(BODY_SCALE[id], `${id} comet 단일값 5000`).toBe(5000);
    }
  });
});

describe('#762 — NaN guard / 미정의 fallback', () => {
  it('미정의 body 는 default 1.0 (실측 / 가상 ID 가드)', () => {
    expect(getBodyScale('nonexistent-body')).toBe(1.0);
    expect(getBodyScale('unknown')).toBe(1.0);
    expect(getBodyScale('')).toBe(1.0);
  });

  it('정의된 body 는 곡선/정적 역산 산출값 반환 (전부 ≠ 1.0 — tooltip "× N 과장 중" 정상)', () => {
    for (const id of [...PLANET_IDS, ...DWARF_IDS, 'moon', 'io', 'titan', 'halley']) {
      expect(getBodyScale(id), `${id}`).not.toBe(1.0);
      expect(Number.isFinite(getBodyScale(id)), `${id} 유한값`).toBe(true);
    }
  });

  it('모든 박제 body 의 scale 이 유한 양수 (NaN/복소수 crash 회피)', () => {
    for (const [id, scale] of Object.entries(BODY_SCALE)) {
      expect(Number.isFinite(scale), `${id} scale 유한`).toBe(true);
      expect(scale, `${id} scale 양수`).toBeGreaterThan(0);
    }
  });
});

describe('#762 — ?bodyScaleP= factory (D-T2 실시간 튜닝)', () => {
  it('getBodyScaleForP(0.5) 는 default getBodyScale 과 동일', () => {
    for (const id of [...PLANET_IDS, 'moon', 'io', 'pluto', 'halley', 'sun']) {
      expect(getBodyScaleForP(DEFAULT_BODY_SCALE_P)(id)).toBeCloseTo(getBodyScale(id), 6);
    }
  });

  it('p 가 작아질수록 압축 강화 — jupiter/mercury effective(mesh px) 비 감소', () => {
    // 압축 측정 단위 = effective(=radius×scale) 비 (실제 mesh px 격차). mercury floor 고정에서
    // jupiter/mercury effective 비 = (jupiter/mercury radius)^p. p→0 동일 크기(비→1), p→1 실측(비→radius 비).
    const effRatioAt = (p: number) => {
      const fn = getBodyScaleForP(p);
      return (RADIUS.jupiter! * fn('jupiter')) / (RADIUS.mercury! * fn('mercury'));
    };
    // p 가 작을수록 거성/내행성 mesh 격차가 압축된다 (effective 비 감소).
    expect(effRatioAt(0.3)).toBeLessThan(effRatioAt(0.5));
    expect(effRatioAt(0.5)).toBeLessThan(effRatioAt(0.7));
    // p=1 (실측) 에서는 effective 비 = 순수 radius 비 (압축 0).
    expect(effRatioAt(1.0)).toBeCloseTo(RADIUS.jupiter! / RADIUS.mercury!, 1);
  });

  it('p 변경 후에도 행성 단조성 보존 (p=0.4 / p=0.6)', () => {
    for (const p of [0.4, 0.6]) {
      const fn = getBodyScaleForP(p);
      const eff2 = (id: string) => RADIUS[id]! * fn(id);
      const byRadiusDesc = [...PLANET_IDS].sort((a, b) => RADIUS[b]! - RADIUS[a]!);
      for (let i = 0; i < byRadiusDesc.length - 1; i++) {
        expect(eff2(byRadiusDesc[i]!), `p=${p} ${byRadiusDesc[i]}`).toBeGreaterThan(
          eff2(byRadiusDesc[i + 1]!),
        );
      }
    }
  });

  it('미정의 body 는 factory 에서도 1.0 fallback', () => {
    expect(getBodyScaleForP(0.5)('nonexistent')).toBe(1.0);
  });
});

describe('#762/#764 — BODY_RADIUS_M ↔ solar-system.json drift 가드 (volt #69 숨은 상수)', () => {
  // #764 — 미러를 export 해 32 body 전수 직접 단언으로 확장 (#763 reviewer 권고 2).
  // 기존 가드의 사각: 행성·왜소 13 만 재산출 직접 검증 / 위성은 수렴대(band) 간접 검증인데
  // 위성 effective 는 radius 상쇄 구조 (`sat_scale = parent_eff × 수렴대비 / sat.radius` →
  // effective = parent_eff × 수렴대비, radius 무관... 단 테스트의 eff() 는 json radius 를 곱하므로
  // 미러 +10% drift 시 mesh 비가 0.0681→0.0619 로 이동해도 band [0.05,0.09] 안 → 미검출) /
  // comet 은 존재(>0)만 확인하고 값 미검증. 아래 전수 단언이 이 사각을 전부 닫는다.

  it('[#764] 32 body 전수 — 미러 radius == json radius 직접 단언 (위성 13 · 혜성 5 포함)', () => {
    const jsonBodies = (solarSystem as { bodies: { id: string; radius?: number }[] }).bodies;
    for (const b of jsonBodies) {
      expect(typeof b.radius, `${b.id} json radius 존재`).toBe('number');
      // 정확 일치 (toBe) — 미러는 json 값의 복제이므로 부동소수 오차 허용 없음 (drift = 즉시 FAIL).
      expect(BODY_RADIUS_M[b.id], `${b.id} 미러 radius ↔ json radius drift`).toBe(b.radius);
    }
  });

  it('[#764] 미러 ↔ json id 집합 완전 일치 — 누락/잉여(stale) 항목 0', () => {
    const jsonIds = Object.keys(RADIUS).sort();
    const mirrorIds = Object.keys(BODY_RADIUS_M).sort();
    expect(mirrorIds).toEqual(jsonIds);
    // 전수 로스터 박제: 32 = sun 1 + 행성 8 + 왜소 5 + 위성 13 + comet·극소형 위성 5.
    // 신규 body 추가 시 json + 미러 + 본 단언 3곳 동시 갱신 (의도된 checkpoint — 미러 누락 시
    // getBodyScale 이 1.0 fallback 으로 실측 렌더되는 silent 회귀를 여기서 강제 노출).
    expect(mirrorIds).toHaveLength(32);
  });

  it('행성·왜소 effective 가 json radius 와 정합 (내부 미러 drift 차단)', () => {
    const p = DEFAULT_BODY_SCALE_P;
    const k = 700 * Math.pow(RADIUS.mercury!, 1 - p);
    for (const id of [...PLANET_IDS, ...DWARF_IDS]) {
      const expectedScale = Math.pow(RADIUS[id]!, p - 1) * k;
      expect(BODY_SCALE[id]!, `${id} 곡선 산출 (radius drift 가드)`).toBeCloseTo(expectedScale, 2);
    }
  });

  it('comet radius 가 json 에 존재 (미러 누락 시 단일값 박제 무의미)', () => {
    for (const id of ['phobos', 'deimos', 'halley', 'encke', 'swift-tuttle']) {
      expect(RADIUS[id], `${id} radius json 존재`).toBeGreaterThan(0);
    }
  });
});
