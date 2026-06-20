import { describe, expect, it } from 'vitest';
import { loadSolarSystem } from './solar-system-loader.js';

describe('loadSolarSystem', () => {
  it('로드 성공 + 30개 바디 (sun + 8행성 + moon 13 + 왜소행성 5 + 혜성 3)', () => {
    // P8 #244: 포보스/데이모스 추가 → moon 엔티티 3개 (moon + phobos + deimos).
    // P9 #254: Galilean 4체 (io/europa/ganymede/callisto) 추가 → moon 엔티티 7개.
    // R7 #641: titan 추가 → moon 엔티티 8개, 총 25 바디.
    // R8 #647: titania 추가 → moon 엔티티 9개, 총 26 바디.
    // R9 #653: triton 추가 → moon 엔티티 10개, 총 27 바디.
    // R11 #721: enceladus/rhea/iapetus 추가 → moon 엔티티 13개, 총 30 바디 (토성계 위성 4개째~6개째).
    const data = loadSolarSystem();
    expect(data.epoch).toBe(2451545.0);
    expect(data.tier).toBe(1);
    expect(data.bodies).toHaveLength(30);
    expect(data.bodies.filter((b) => b.kind === 'moon')).toHaveLength(13);
    expect(data.bodies.filter((b) => b.kind === 'dwarf-planet')).toHaveLength(5);
    expect(data.bodies.filter((b) => b.kind === 'comet')).toHaveLength(3);
  });

  it('태양은 궤도가 없다', () => {
    const sun = loadSolarSystem().bodies.find((b) => b.id === 'sun');
    expect(sun).toBeDefined();
    expect(sun?.orbit).toBeUndefined();
    expect(sun?.parentId).toBeNull();
  });

  it('지구 궤도 요소 — AU를 m로, 각도를 rad로 변환됨', () => {
    const earth = loadSolarSystem().bodies.find((b) => b.id === 'earth');
    expect(earth).toBeDefined();
    expect(earth?.orbit).toBeDefined();
    // a ≈ 1 AU = 1.496e11 m
    expect(earth!.orbit!.semiMajorAxis).toBeCloseTo(1.496e11, -9);
    // e ≈ 0.0167
    expect(earth!.orbit!.eccentricity).toBeCloseTo(0.0167, 3);
    // i ≈ 0 (거의 황도면)
    expect(Math.abs(earth!.orbit!.inclination)).toBeLessThan(1e-4);
    expect(earth!.orbit!.epoch).toBe(2451545.0);
  });

  it('달의 부모는 지구', () => {
    const moon = loadSolarSystem().bodies.find((b) => b.id === 'moon');
    expect(moon?.parentId).toBe('earth');
  });

  it('포보스/데이모스의 부모는 화성 (P8 #244)', () => {
    const bodies = loadSolarSystem().bodies;
    const phobos = bodies.find((b) => b.id === 'phobos');
    const deimos = bodies.find((b) => b.id === 'deimos');
    expect(phobos?.parentId).toBe('mars');
    expect(phobos?.kind).toBe('moon');
    expect(deimos?.parentId).toBe('mars');
    expect(deimos?.kind).toBe('moon');
  });

  it('모든 행성의 부모는 태양, 각도는 [-π, π]로 정규화됨', () => {
    const data = loadSolarSystem();
    const planets = data.bodies.filter((b) => b.kind === 'planet');
    expect(planets).toHaveLength(8);
    for (const p of planets) {
      expect(p.parentId).toBe('sun');
      expect(p.orbit).toBeDefined();
      expect(p.orbit!.longitudeOfAscendingNode).toBeGreaterThanOrEqual(-Math.PI);
      expect(p.orbit!.longitudeOfAscendingNode).toBeLessThanOrEqual(Math.PI);
      expect(p.orbit!.argumentOfPeriapsis).toBeGreaterThanOrEqual(-Math.PI);
      expect(p.orbit!.argumentOfPeriapsis).toBeLessThanOrEqual(Math.PI);
      expect(p.orbit!.meanAnomalyAtEpoch).toBeGreaterThanOrEqual(-Math.PI);
      expect(p.orbit!.meanAnomalyAtEpoch).toBeLessThanOrEqual(Math.PI);
    }
  });

  it('반경과 질량은 양수', () => {
    for (const b of loadSolarSystem().bodies) {
      expect(b.mass).toBeGreaterThan(0);
      expect(b.radius).toBeGreaterThan(0);
    }
  });

  it('P9 #254 — Galilean 4체 + Jupiter.rings 3층 로드 성공 (필드 접근 무결성)', () => {
    // ADR 20260420-p9-galilean-laplace-rings.md §JSON 스키마 확장 (L319~L374) 박제값 검증.
    const bodies = loadSolarSystem().bodies;

    // (1) Galilean 4체 존재 + 부모·kind·특성 수치 확인.
    const io = bodies.find((b) => b.id === 'io');
    const europa = bodies.find((b) => b.id === 'europa');
    const ganymede = bodies.find((b) => b.id === 'ganymede');
    const callisto = bodies.find((b) => b.id === 'callisto');

    for (const m of [io, europa, ganymede, callisto]) {
      expect(m).toBeDefined();
      expect(m?.kind).toBe('moon');
      expect(m?.parentId).toBe('jupiter');
      expect(m?.orbit).toBeDefined();
    }

    // P10-D #261 — JPL Horizons 재쿼리 (2026-01-01 TDB, J2000 ecliptic).
    // ADR §결정 #3 특이점 가드 경계 e > 1e-6 은 여전히 만족 (모두 > 2e-3).
    // Io 이심률 = 0.003988 (JPL 2026-01-01)
    expect(io!.orbit!.eccentricity).toBeCloseTo(0.003988, 5);
    // Europa 이심률 = 0.009286
    expect(europa!.orbit!.eccentricity).toBeCloseTo(0.009286, 5);
    // Ganymede 이심률 = 0.002186
    expect(ganymede!.orbit!.eccentricity).toBeCloseTo(0.002186, 5);
    // Callisto 이심률 = 0.007347
    expect(callisto!.orbit!.eccentricity).toBeCloseTo(0.007347, 5);

    // 질량 순서: Europa < Io < Callisto < Ganymede (태양계 최대 위성)
    // JPL: Europa 4.8e22 / Io 8.93e22 / Callisto 1.08e23 / Ganymede 1.48e23
    expect(europa!.mass).toBeLessThan(io!.mass);
    expect(io!.mass).toBeLessThan(callisto!.mass);
    expect(callisto!.mass).toBeLessThan(ganymede!.mass);

    // (2) Jupiter.rings 3층 (halo/main/gossamer) 로드 확인 + 순서·반경 무결성.
    const jupiter = bodies.find((b) => b.id === 'jupiter');
    expect(jupiter).toBeDefined();
    expect(jupiter?.rings).toBeDefined();
    expect(jupiter!.rings).toHaveLength(3);

    const [halo, main, gossamer] = jupiter!.rings!;
    expect(halo!.id).toBe('halo');
    expect(main!.id).toBe('main');
    expect(gossamer!.id).toBe('gossamer');

    // 반경 (km → m 변환 확인): halo 92000~122500 km → 9.2e7 ~ 1.225e8 m
    expect(halo!.innerRadius).toBeCloseTo(92000 * 1000, -3);
    expect(halo!.outerRadius).toBeCloseTo(122500 * 1000, -3);
    expect(main!.innerRadius).toBeCloseTo(122500 * 1000, -3);
    expect(main!.outerRadius).toBeCloseTo(129000 * 1000, -3);
    expect(gossamer!.innerRadius).toBeCloseTo(129000 * 1000, -3);
    expect(gossamer!.outerRadius).toBeCloseTo(226000 * 1000, -3);

    // 층간 연속성: halo.outer == main.inner, main.outer == gossamer.inner
    expect(halo!.outerRadius).toBeCloseTo(main!.innerRadius, -3);
    expect(main!.outerRadius).toBeCloseTo(gossamer!.innerRadius, -3);

    // (3) densityProfile 범위·형식 무결성.
    for (const ring of jupiter!.rings!) {
      expect(ring.densityProfile.length).toBeGreaterThanOrEqual(2);
      for (const [rNorm, density] of ring.densityProfile) {
        expect(rNorm).toBeGreaterThanOrEqual(0);
        expect(rNorm).toBeLessThanOrEqual(1);
        expect(density).toBeGreaterThanOrEqual(0);
        expect(density).toBeLessThanOrEqual(1);
      }
    }

    // main 링 피크 밀도 1.0 (중앙 segment) — JSON 박제값 (ADR §JSON 스키마 L360)
    const mainPeakDensity = Math.max(...main!.densityProfile.map(([, d]) => d));
    expect(mainPeakDensity).toBeCloseTo(1.0, 5);

    // (4) rings 가 없는 엔티티 (예: earth) 의 rings 는 undefined
    const earth = bodies.find((b) => b.id === 'earth');
    expect(earth?.rings).toBeUndefined();
  });

  it('R7 #641 — titan 로드 (parentId=saturn, Saturn-centric J2000 Ecliptic 각도 요소)', () => {
    const titan = loadSolarSystem().bodies.find((b) => b.id === 'titan');
    expect(titan).toBeDefined();
    expect(titan?.kind).toBe('moon');
    expect(titan?.parentId).toBe('saturn');
    expect(titan?.introducedInRPhase).toBe(7);
    expect(titan?.showInShortcutBar).toBe(false); // galilean 패턴 (URL ?focus=titan 진입)
    // ADR §축 3 박제값 — a=8.1677e-3 AU (NASA Fact Sheet), e=0.0288
    expect(titan!.orbit!.semiMajorAxis).toBeCloseTo(8.1677e-3 * 1.495978707e11, -5);
    expect(titan!.orbit!.eccentricity).toBeCloseTo(0.0288, 4);
    // Horizons 쿼리 (Saturn-centric J2000 Ecliptic) — inclination 27.709° (ecliptic 기준)
    expect(titan!.orbit!.inclination).toBeCloseTo((27.709 * Math.PI) / 180, 3);
  });

  it('R7 #641 — saturn.rings 5층 (D/C/B/A/F) + 층별 colorHint + ringAlphaHint 로드', () => {
    const bodies = loadSolarSystem().bodies;
    const saturn = bodies.find((b) => b.id === 'saturn');
    expect(saturn).toBeDefined();
    expect(saturn?.showInShortcutBar).toBe(true); // R7 §축 5 — false → true 전환
    expect(saturn?.rings).toHaveLength(5);

    const [d, c, b, a, f] = saturn!.rings!;
    expect([d!.id, c!.id, b!.id, a!.id, f!.id]).toEqual(['d', 'c', 'b', 'a', 'f']);

    // km → m 변환 + Cassini Division = B(117,580 km)–A(122,170 km) 층간 gap (비연속 층)
    expect(b!.outerRadius).toBeCloseTo(117580 * 1000, -3);
    expect(a!.innerRadius).toBeCloseTo(122170 * 1000, -3);
    expect(a!.innerRadius - b!.outerRadius).toBeCloseTo(4590 * 1000, -3);

    // F ring (140,180 km) = saturn 반경의 2.326배 (PM "~2.3배" 정합 상한 — ADR §축 2 기준점)
    expect(f!.innerRadius / saturn!.radius).toBeCloseTo(2.326, 2);

    // 층별 colorHint (R7 optional 스키마 확장) — B ring 최대 광학 깊이 톤
    expect(b!.colorHint?.hex).toBe('#D8C9A8');
    expect(f!.colorHint?.hex).toBe('#B0A48E');

    // ringAlphaHint — saturn 0.9 prominent / jupiter 0.15 faint (PM Q3 대조)
    expect(saturn?.ringAlphaHint).toBe(0.9);
    const jupiter = bodies.find((b2) => b2.id === 'jupiter');
    expect(jupiter?.ringAlphaHint).toBe(0.15);
  });

  it('R7 #641 — 하위 호환 폴백: jupiter.rings 층은 colorHint 미지정 (undefined → DEFAULT 폴백)', () => {
    const jupiter = loadSolarSystem().bodies.find((b) => b.id === 'jupiter');
    for (const ring of jupiter!.rings!) {
      expect(ring.colorHint).toBeUndefined();
    }
    // ringAlphaHint 미지정 body (earth) 는 undefined — scene 이 전달 생략 → shader 기본 0.6
    const earth = loadSolarSystem().bodies.find((b) => b.id === 'earth');
    expect(earth?.ringAlphaHint).toBeUndefined();
  });

  it('R8 #647 — titania 로드 (parentId=uranus, Uranus-centric J2000 Ecliptic 각도 요소)', () => {
    const titania = loadSolarSystem().bodies.find((b) => b.id === 'titania');
    expect(titania).toBeDefined();
    expect(titania?.kind).toBe('moon');
    expect(titania?.parentId).toBe('uranus');
    expect(titania?.introducedInRPhase).toBe(8);
    expect(titania?.showInShortcutBar).toBe(false); // galilean/titan 패턴 (URL ?focus=titania 진입)
    // ADR §축 3 박제값 — a=2.91388e-3 AU (NASA Fact Sheet 435,910 km), e=0.0011
    expect(titania!.orbit!.semiMajorAxis).toBeCloseTo(2.91388e-3 * 1.495978707e11, -5);
    expect(titania!.orbit!.eccentricity).toBeCloseTo(0.0011, 4);
    // Horizons 쿼리 (Uranus-centric J2000 Ecliptic) — inclination 97.7633° (ecliptic 기준).
    // ~98° 세로 궤도가 사실 정합 (uranus 계 전체 누움 — tilt 97.77° 고리 평면과 정렬, §축 3 사전 등록)
    expect(titania!.orbit!.inclination).toBeCloseTo((97.7633 * Math.PI) / 180, 3);
  });

  it('R8 #647 — uranus.rings 1 composite layer (densityProfile 15점 ≤ MAX 16) + ringAlphaHint 0.8', () => {
    const bodies = loadSolarSystem().bodies;
    const uranus = bodies.find((b) => b.id === 'uranus');
    expect(uranus).toBeDefined();
    expect(uranus?.showInShortcutBar).toBe(true); // R8 §축 5 — false → true 전환
    expect(uranus?.rings).toHaveLength(1);

    const [main] = uranus!.rings!;
    expect(main!.id).toBe('main');
    // km → m 변환 — ring 6 inner (41,837 km) ~ ε outer (51,149 km) 실측 경계
    expect(main!.innerRadius).toBeCloseTo(41837 * 1000, -3);
    expect(main!.outerRadius).toBeCloseTo(51149 * 1000, -3);
    // ε ring outer = uranus 반경의 2.001배 (orbit binding 분모 — §축 4)
    expect(main!.outerRadius / uranus!.radius).toBeCloseTo(2.001, 2);

    // composite densityProfile 15점 (zod .max(16) 상한 1점 여유 — agy 고유 발견 ① 정합)
    expect(main!.densityProfile).toHaveLength(15);
    // ε ring @1.0 최대 밀도 1.0 (우라누스계 지배 ring)
    const last = main!.densityProfile[main!.densityProfile.length - 1]!;
    expect(last[0]).toBe(1.0);
    expect(last[1]).toBe(1.0);

    // colorHint #5A5E66 (observed dark gray) + ringAlphaHint 0.8 (saturn 0.9 / jupiter 0.15 사이)
    expect(main!.colorHint?.hex).toBe('#5A5E66');
    expect(uranus?.ringAlphaHint).toBe(0.8);
  });

  it('R8 #647 — axialTiltDeg 로드 (uranus 97.77 / saturn 26.73) + 미지정 body 폴백 (하위 호환)', () => {
    const bodies = loadSolarSystem().bodies;
    expect(bodies.find((b) => b.id === 'uranus')?.axialTiltDeg).toBe(97.77);
    expect(bodies.find((b) => b.id === 'saturn')?.axialTiltDeg).toBe(26.73);
    // 미지정 body (jupiter — 3.13° 는 R8 비-범위) 는 undefined → scene 폴백 0 (tilt 없음, 무회귀)
    expect(bodies.find((b) => b.id === 'jupiter')?.axialTiltDeg).toBeUndefined();
    expect(bodies.find((b) => b.id === 'earth')?.axialTiltDeg).toBeUndefined();
  });

  it('R9 #653 — triton 로드 (parentId=neptune, Neptune-centric J2000 Ecliptic — 역행 inclination > 90°)', () => {
    const triton = loadSolarSystem().bodies.find((b) => b.id === 'triton');
    expect(triton).toBeDefined();
    expect(triton?.kind).toBe('moon');
    expect(triton?.parentId).toBe('neptune');
    expect(triton?.introducedInRPhase).toBe(9);
    expect(triton?.showInShortcutBar).toBe(false); // galilean/titan/titania 패턴 (URL ?focus=triton 진입)
    // ADR §축 3 박제값 — a=2.37142e-3 AU (NASA Fact Sheet 354,759 km), e=0.000016 (대형 위성 중 최소)
    expect(triton!.orbit!.semiMajorAxis).toBeCloseTo(2.37142e-3 * 1.495978707e11, -5);
    expect(triton!.orbit!.eccentricity).toBeCloseTo(0.000016, 5);
    // Horizons 쿼리 (Neptune-centric J2000 Ecliptic, 2026-01-01 TDB) — IN=129.1418° (ecliptic 기준).
    // ⚠️ 역행 핵심 단언: inclination > 90° 는 frame 무관 불변량 (NASA 적도면 통념 157° 와 다른 값이
    // 정상 — ADR §위험 #2). 역행 = 사실 정합 (태양계 유일 대형 역행 위성, 포획 기원) — 공전
    // 애니메이션 방향 반전은 버그 아님 (D-T2 사전 등록, PM Q1). "보정" 시도 자체가 회귀.
    expect(triton!.orbit!.inclination).toBeGreaterThan(Math.PI / 2); // > 90° (역행)
    expect(triton!.orbit!.inclination).toBeCloseTo((129.1418 * Math.PI) / 180, 3);
  });

  it('R9 #653 — neptune.rings 1 composite layer (densityProfile 12점 ≤ MAX 16) + ringAlphaHint 0.7', () => {
    const bodies = loadSolarSystem().bodies;
    const neptune = bodies.find((b) => b.id === 'neptune');
    expect(neptune).toBeDefined();
    expect(neptune?.showInShortcutBar).toBe(true); // R9 §축 5 — 이미 true (변경 0, #613 Concrete Prediction)
    expect(neptune?.rings).toHaveLength(1);

    const [main] = neptune!.rings!;
    expect(main!.id).toBe('main');
    // km → m 변환 — Galle inner (41,000 km) ~ Adams outer (62,930 km) 실측 경계
    expect(main!.innerRadius).toBeCloseTo(41000 * 1000, -3);
    expect(main!.outerRadius).toBeCloseTo(62930 * 1000, -3);
    // Adams ring outer = neptune 반경의 2.541배 (orbit binding 분모 — §축 4, uranus ε 2.001 초과)
    expect(main!.outerRadius / neptune!.radius).toBeCloseTo(2.541, 2);

    // composite densityProfile 12점 (zod .max(16) 상한 4점 여유 — R8 15점 대비 margin)
    expect(main!.densityProfile).toHaveLength(12);
    // Adams ring @1.0 최대 밀도 1.0 (해왕성계 지배 ring — arcs 균질 근사는 PM Q2 의도된 근사)
    const last = main!.densityProfile[main!.densityProfile.length - 1]!;
    expect(last[0]).toBe(1.0);
    expect(last[1]).toBe(1.0);

    // colorHint #6F635A (observed dark reddish gray) + ringAlphaHint 0.7 (jupiter 0.15 / uranus 0.8 사이)
    expect(main!.colorHint?.hex).toBe('#6F635A');
    expect(neptune?.ringAlphaHint).toBe(0.7);
  });

  it('R9 #653 — neptune axialTiltDeg 28.32 로드 (R8 tilt 인프라 재사용 — 코드 0, 데이터 1값)', () => {
    const bodies = loadSolarSystem().bodies;
    expect(bodies.find((b) => b.id === 'neptune')?.axialTiltDeg).toBe(28.32);
    // R8 기존값 무회귀 (saturn/uranus tilt 데이터 불변)
    expect(bodies.find((b) => b.id === 'uranus')?.axialTiltDeg).toBe(97.77);
    expect(bodies.find((b) => b.id === 'saturn')?.axialTiltDeg).toBe(26.73);
  });

  it('R8 #647 — densityProfile zod .max(16) 가드: 모든 ring layer 가 shader MAX_DENSITY_POINTS 이내', () => {
    // ring-shader MAX_DENSITY_POINTS=16 정합 — 초과 데이터는 loadSolarSystem 파싱 단계에서
    // ZodError 로 차단된다 (agy 고유 발견 ① — uniform overflow/컴파일 실패 방지).
    // 본 단언은 현재 데이터 전체가 가드 이내임을 회귀 박제 (스키마 자체는 내부 비공개).
    for (const body of loadSolarSystem().bodies) {
      if (!body.rings) continue;
      for (const ring of body.rings) {
        expect(ring.densityProfile.length).toBeGreaterThanOrEqual(2);
        expect(ring.densityProfile.length).toBeLessThanOrEqual(16);
      }
    }
  });
});
