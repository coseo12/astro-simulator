/**
 * #756 — 절차적 행성 표면 셰이더 단위 테스트.
 *
 * 검증 축 (ADR `docs/decisions/20260628-756-procedural-planet-surface.md` §Concrete Prediction
 * 단위 테스트 + §교차검증 수용):
 *   1. surfaceType enum ↔ uniform int 매핑 SSoT drift 가드 (ring-shader MAX_ARCS parity #728 패턴).
 *   2. SURFACE_TYPE_BY_BODY 테이블 — 대표 4개 등록 / 미등록 자동 단색 (무회귀).
 *   3. GLSL 분기 = if-else만 (switch-case 금지 — WGSL 변환 깨짐, cross-validate 이견 수용 1).
 *   4. GLSL↔JS 미러 결정성 (동일 입력 동일 출력).
 *   5. 보라/마젠타 부재 (디자인 루브릭 Originality — starfield starColorMirror 패턴).
 *   6. 변조 강도 상수 SSoT drift 가드.
 *   7. log-depth gl_FragDepth 기록 (§핵심 위험 1 — ring-shader #641 정합).
 */

import { describe, expect, it } from 'vitest';
import {
  SurfaceType,
  SURFACE_TYPE_BY_BODY,
  ROCKY_CONTRAST,
  DESERT_DETAIL,
  DESERT_RUST_TINT,
  GAS_BAND_AMPLITUDE,
  GAS_BAND_COUNT,
  GAS_TURBULENCE,
  CRATER_DEPTH,
  CRATER_DENSITY,
  SOFT_TERMINATOR_WIDTH,
  LAND_COLOR_RGB,
  LAND_THRESHOLD_LO,
  LAND_THRESHOLD_HI,
  BIOME_TROPICAL_RGB,
  BIOME_TUNDRA_RGB,
  ICE_COLOR_RGB,
  BIOME_TEMPERATE_LO,
  BIOME_TEMPERATE_HI,
  BIOME_TUNDRA_LO,
  BIOME_TUNDRA_HI,
  ICE_LAT_LO,
  ICE_LAT_HI,
  BIOME_LAT_JITTER,
  fbmMirror,
  surfaceColorMirror,
  lightingShadeMirror,
  luminance709,
  PLANET_VERTEX_SHADER,
  PLANET_FRAGMENT_SHADER,
} from './procedural-planet-shader.js';

/** 구면 골든앵글 샘플 (결정적) — 위도/경도 고른 커버리지 (#783 밴드 테스트 공용). */
function spherePoints(n: number): Array<[number, number, number]> {
  const pts: Array<[number, number, number]> = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(Math.max(1 - y * y, 0));
    const th = ga * i;
    pts.push([r * Math.cos(th), y, r * Math.sin(th)]);
  }
  return pts;
}

/** #783 검증용 — GLSL 과 동일 smoothstep (테스트 로컬 미러). */
function smoothstepMirror(e0: number, e1: number, x: number): number {
  const t = Math.min(Math.max((x - e0) / Math.max(e1 - e0, 1e-6), 0), 1);
  return t * t * (3 - 2 * t);
}

describe('#756 procedural-planet — surfaceType enum ↔ uniform int 매핑 SSoT (ADR §교차검증 이견 수용 2)', () => {
  // #719 교훈 + cross-validate 이견 수용 2 — JS enum 정수가 곧 GLSL `uniform int surfaceType` 값.
  // drift 시 셰이더 분기가 엉뚱한 표면을 그린다 (조용한 회귀). enum 값 고정 + GLSL 분기 정수 정합.

  it('enum 정수 값 고정 (rocky=0 / desert=1 / gas-bands=2 / cratered=3)', () => {
    expect(SurfaceType.Rocky).toBe(0);
    expect(SurfaceType.Desert).toBe(1);
    expect(SurfaceType.GasBands).toBe(2);
    expect(SurfaceType.Cratered).toBe(3);
  });

  it('GLSL fragment 분기 정수가 enum 값과 정합 (uSurfaceType == 0/1/2/3 모두 존재)', () => {
    // enum 값마다 대응하는 GLSL if 분기가 있어야 한다 (한쪽만 추가/삭제 시 drift).
    expect(PLANET_FRAGMENT_SHADER).toMatch(/uSurfaceType\s*==\s*0/);
    expect(PLANET_FRAGMENT_SHADER).toMatch(/uSurfaceType\s*==\s*1/);
    expect(PLANET_FRAGMENT_SHADER).toMatch(/uSurfaceType\s*==\s*2/);
    expect(PLANET_FRAGMENT_SHADER).toMatch(/uSurfaceType\s*==\s*3/);
  });

  it('enum 멤버 수 = GLSL 분기 수 (4종 완비, 추가 시 양쪽 동기화 강제)', () => {
    // enum 멤버 (숫자 키만) 개수.
    const enumCount = Object.values(SurfaceType).filter((v) => typeof v === 'number').length;
    // GLSL `uSurfaceType ==` 분기 개수.
    const glslBranches = PLANET_FRAGMENT_SHADER.match(/uSurfaceType\s*==\s*\d/g) ?? [];
    expect(enumCount).toBe(4);
    expect(glslBranches.length).toBe(enumCount);
  });
});

describe('#756 procedural-planet — SURFACE_TYPE_BY_BODY 테이블 (ADR §결정 2)', () => {
  it('대표 4개만 등록 (earth=rocky / mars=desert / jupiter=gas-bands / moon=cratered)', () => {
    expect(SURFACE_TYPE_BY_BODY.earth).toBe(SurfaceType.Rocky);
    expect(SURFACE_TYPE_BY_BODY.mars).toBe(SurfaceType.Desert);
    expect(SURFACE_TYPE_BY_BODY.jupiter).toBe(SurfaceType.GasBands);
    expect(SURFACE_TYPE_BY_BODY.moon).toBe(SurfaceType.Cratered);
  });

  it('1차 범위는 정확히 4개 (이후 확장 = 데이터 추가 아닌 상수 추가)', () => {
    expect(Object.keys(SURFACE_TYPE_BY_BODY)).toHaveLength(4);
  });

  it('비-범위 body 는 미등록 → undefined (자동 단색 무회귀)', () => {
    // venus/saturn/io 등 23개 비-범위 body 는 테이블 부재로 자동 단색 (명시적 opt-in).
    expect(SURFACE_TYPE_BY_BODY.venus).toBeUndefined();
    expect(SURFACE_TYPE_BY_BODY.saturn).toBeUndefined();
    expect(SURFACE_TYPE_BY_BODY.io).toBeUndefined();
    expect(SURFACE_TYPE_BY_BODY.sun).toBeUndefined();
  });
});

describe('#756 procedural-planet — GLSL 분기 = if-else만 (cross-validate 이견 수용 1)', () => {
  // agy 지적 — Babylon GLSL→WGSL 변환기가 switch-case 에서 컴파일 에러/최적화 깨짐. ring/starfield
  // 모두 if 만 사용 (기존 선례 정합). switch 키워드가 셰이더에 등장하면 즉시 fail.

  it('fragment shader 에 switch 키워드 부재', () => {
    expect(PLANET_FRAGMENT_SHADER).not.toMatch(/\bswitch\b/);
  });

  it('vertex shader 에 switch 키워드 부재', () => {
    expect(PLANET_VERTEX_SHADER).not.toMatch(/\bswitch\b/);
  });

  it('fragment shader 가 if / else if 로 분기 (보수적 분기 박제)', () => {
    expect(PLANET_FRAGMENT_SHADER).toMatch(/if\s*\(\s*uSurfaceType/);
    expect(PLANET_FRAGMENT_SHADER).toContain('else if');
  });
});

describe('#756 procedural-planet — log-depth gl_FragDepth (§핵심 위험 1, ring-shader #641 정합)', () => {
  // 커스텀 ShaderMaterial 이 본체 StandardMaterial(useLogarithmicDepth)과 같은 depth 공간을
  // 기록해야 가림(occlusion)이 정상. 누락 시 표면이 항상 다른 body 위로 그려진다.

  it('fragment shader 가 gl_FragDepth 를 로그 공간으로 기록', () => {
    expect(PLANET_FRAGMENT_SHADER).toContain('gl_FragDepth');
    expect(PLANET_FRAGMENT_SHADER).toContain('logDepthConstant');
  });

  it('vertex shader 가 vFragmentDepth = 1.0 + clip.w 전달 (Babylon logDepth 공식)', () => {
    expect(PLANET_VERTEX_SHADER).toContain('vFragmentDepth');
    expect(PLANET_VERTEX_SHADER).toMatch(/vFragmentDepth\s*=\s*1\.0\s*\+/);
  });
});

describe('#756 procedural-planet — GLSL↔JS 미러 결정성 (#719 SSoT 가드)', () => {
  it('fbmMirror: 동일 입력 동일 출력 (결정성)', () => {
    const a = fbmMirror(1.23, 4.56, 7.89);
    const b = fbmMirror(1.23, 4.56, 7.89);
    expect(a).toBe(b);
  });

  it('fbmMirror: 출력 [0,1] 범위 (value noise 가중합)', () => {
    for (let i = 0; i < 50; i++) {
      const v = fbmMirror(i * 0.37, i * 1.13, i * 0.71);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('surfaceColorMirror: 동일 입력 동일 출력 (결정성)', () => {
    const base: [number, number, number] = [0.2, 0.5, 0.8];
    const p: [number, number, number] = [0.3, 0.6, 0.74];
    expect(surfaceColorMirror(base, SurfaceType.Rocky, p)).toEqual(
      surfaceColorMirror(base, SurfaceType.Rocky, p),
    );
  });
});

describe('#756 procedural-planet — 보라/마젠타 부재 (디자인 루브릭 Originality, ADR §고유 발견 3)', () => {
  // starfield starColorMirror 패턴 — 변조 후 출력 RGB 가 기괴 색역 (R+B 동시 우세 & G 결핍) 미진입.
  // 실측 자연색 baseColor 위 단조 변조이므로 구조적 보장 — 4 타입 × 다수 표면점으로 전수 확인.

  // 실측 자연색 base (지구 청록 / 화성 적갈 / 목성 담갈 / 달 회색 근사).
  const BASES: Array<[string, SurfaceType, [number, number, number]]> = [
    ['earth/rocky', SurfaceType.Rocky, [0.23, 0.45, 0.6]],
    ['mars/desert', SurfaceType.Desert, [0.7, 0.4, 0.28]],
    ['jupiter/gas-bands', SurfaceType.GasBands, [0.78, 0.68, 0.55]],
    ['moon/cratered', SurfaceType.Cratered, [0.55, 0.55, 0.52]],
  ];

  for (const [label, type, base] of BASES) {
    it(`${label}: 다수 표면점에서 보라/마젠타 부재 (G ≥ min(R,B) 위배 없음)`, () => {
      let violations = 0;
      for (let i = 0; i < 200; i++) {
        // 구면 표면점 샘플 (정규화).
        const t = i * 0.0314;
        const x = Math.sin(t * 1.7) * Math.cos(t);
        const y = Math.cos(t * 0.9);
        const z = Math.sin(t * 0.5) * Math.sin(t);
        const len = Math.hypot(x, y, z) || 1;
        const p: [number, number, number] = [x / len, y / len, z / len];
        const [r, g, b] = surfaceColorMirror(base, type, p);
        // 보라/마젠타 = R 과 B 가 동시에 우세하면서 G 가 결핍 (G < min(R,B)).
        if (g < Math.min(r, b) - 1e-6) violations++;
      }
      expect(violations).toBe(0);
    });

    it(`${label}: 변조 후 모든 채널 [0,1] 범위 내 (clamp 보장)`, () => {
      for (let i = 0; i < 100; i++) {
        const t = i * 0.0628;
        const p: [number, number, number] = [Math.sin(t), Math.cos(t * 1.3), Math.sin(t * 0.7)];
        const len = Math.hypot(...p) || 1;
        const np: [number, number, number] = [p[0] / len, p[1] / len, p[2] / len];
        for (const c of surfaceColorMirror(base, type, np)) {
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThanOrEqual(1);
        }
      }
    });
  }

  it('변조는 base 색을 의미 있게 바꾼다 (단색 대비 디테일 존재 — 0 변조 아님)', () => {
    // 표면 디테일이 실제로 존재해야 한다 (변조 진폭 0 이면 단색과 동일 = feature 무의미).
    const base: [number, number, number] = [0.5, 0.5, 0.5];
    const samples: number[] = [];
    for (let i = 0; i < 50; i++) {
      const t = i * 0.13;
      const p: [number, number, number] = [Math.sin(t), Math.cos(t), Math.sin(t * 0.5)];
      const len = Math.hypot(...p) || 1;
      const np: [number, number, number] = [p[0] / len, p[1] / len, p[2] / len];
      samples.push(surfaceColorMirror(base, SurfaceType.Rocky, np)[0]);
    }
    // 분산이 0 이 아니어야 (변조 존재). max-min 으로 간이 확인.
    const spread = Math.max(...samples) - Math.min(...samples);
    expect(spread).toBeGreaterThan(0.01);
  });
});

describe('#756 procedural-planet — 변조 강도 미학 상수 SSoT (#69 drift 가드)', () => {
  it('변조 강도 상수 박제값 (measurement-first — drift 시 시각 회귀)', () => {
    expect(ROCKY_CONTRAST).toBe(0.35);
    expect(DESERT_DETAIL).toBe(0.3);
    expect(DESERT_RUST_TINT).toBe(0.18);
    expect(GAS_BAND_AMPLITUDE).toBe(0.28);
    expect(GAS_BAND_COUNT).toBe(9);
    expect(GAS_TURBULENCE).toBe(0.12);
    expect(CRATER_DEPTH).toBe(0.4);
    expect(CRATER_DENSITY).toBe(14);
  });

  it('변조 진폭은 base 색을 묻지 않는 합리 범위 (< 0.5 — base 보존)', () => {
    // 변조가 1.0 이상이면 base 색이 완전히 묻힘. 디테일 ↔ base 보존 균형 (Visual Fidelity).
    expect(ROCKY_CONTRAST).toBeGreaterThan(0);
    expect(ROCKY_CONTRAST).toBeLessThan(0.5);
    expect(DESERT_DETAIL).toBeLessThan(0.5);
    expect(GAS_BAND_AMPLITUDE).toBeLessThan(0.5);
    expect(CRATER_DEPTH).toBeLessThan(0.6);
  });

  it('GLSL fragment 에 변조 강도 uniform 선언 존재 (미러와 동기)', () => {
    expect(PLANET_FRAGMENT_SHADER).toContain('uniform float rockyContrast');
    expect(PLANET_FRAGMENT_SHADER).toContain('uniform float desertDetail');
    expect(PLANET_FRAGMENT_SHADER).toContain('uniform float gasBandAmplitude');
    expect(PLANET_FRAGMENT_SHADER).toContain('uniform float craterDepth');
  });
});

describe('#756 procedural-planet — baseColor 데이터 SSoT (ADR §결정 5)', () => {
  it('fragment shader 가 baseColor uniform 을 변조 기준으로 사용 (read-only)', () => {
    expect(PLANET_FRAGMENT_SHADER).toContain('uniform vec3 baseColor');
    expect(PLANET_FRAGMENT_SHADER).toContain('col = baseColor');
  });

  it('surfaceColorMirror: 변조 0 근처 입력에서 base 색에 근접 (base 보존 확인)', () => {
    // fbm 이 0.5 근처면 변조 ≈ 0 → base 색 유지 (변조는 base 위 합성, 대체 아님).
    const base: [number, number, number] = [0.4, 0.5, 0.6];
    // gas-bands 는 sin 밴드라 base 근처 지점이 명확 (latitude=0 + turb 작은 지점).
    const out = surfaceColorMirror(base, SurfaceType.GasBands, [1, 0, 0]);
    // latitude(y)=0 이면 sin(turb*count*π) ≈ 작음 → base 에 근접 (shade 미적용 미러).
    expect(Math.abs(out[0] - base[0])).toBeLessThan(0.35);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Amendment 1 (#773/#775) — 광원 일관성 회귀 + 지구 대륙 mix.
// ═══════════════════════════════════════════════════════════════════════════════

describe('#773 광원식 미러 — 밤면 < 낮면 단조 + soft terminator (ADR §A1.5 DoD 1·2)', () => {
  // 단색 행성(StandardMaterial + PointLight + HemisphericLight)과 동일 명암 재현 검증.
  // 태양 방향 = +X 가정 (단색 행성 forensic 측정 §A1.2 와 동일 좌표계).
  const SUN_DIR: [number, number, number] = [1, 0, 0];

  it('낮면(N=+X) 휘도 > 밤면(N=−X) 휘도 (밤면 존재 — "밤면 없음" 회귀 해소)', () => {
    const day = luminance709(lightingShadeMirror([1, 0, 0], SUN_DIR));
    const night = luminance709(lightingShadeMirror([-1, 0, 0], SUN_DIR));
    expect(day).toBeGreaterThan(night);
    // 단색 행성 대비비 14.74x — 변조가 밤면을 살짝 올릴 수 있어 보수적 하한 5x (ADR §A1.5 DoD 1).
    expect(day / night).toBeGreaterThan(5);
  });

  it('낮→밤 단조 감소 (태양 방향에서 멀어질수록 어두움)', () => {
    // sunDir(+X) 과의 각도를 0 → 180° 로 증가시키며 휘도 단조 감소 확인.
    const samples: number[] = [];
    for (let i = 0; i <= 10; i++) {
      const theta = (i / 10) * Math.PI; // 0 (낮면) → π (밤면)
      const N: [number, number, number] = [Math.cos(theta), 0, Math.sin(theta)];
      samples.push(luminance709(lightingShadeMirror(N, SUN_DIR)));
    }
    // soft terminator smoothstep 라 strict 단조는 아닐 수 있으나 (양 끝 plateau), 전체 추세 감소.
    for (let i = 1; i < samples.length; i++) {
      const cur = samples[i] ?? Number.NaN;
      const prev = samples[i - 1] ?? Number.NaN;
      expect(cur).toBeLessThanOrEqual(prev + 1e-9);
    }
    const first = samples[0] ?? Number.NaN;
    const last = samples[samples.length - 1] ?? Number.NaN;
    expect(first).toBeGreaterThan(last);
  });

  it('forensic 측정 §A1.2 재현 — 낮면 ≈ 2.55 / terminator ≈ 0.17 / 밤면하단 ≈ 0.046 휘도', () => {
    // 단색 행성 라이팅 계수 (diffuseColor 곱 전) — ADR 측정값 (Rec.709 휘도) 와 정합.
    const dayCenter = luminance709(lightingShadeMirror([1, 0, 0], SUN_DIR)); // N=+X
    const terminator = luminance709(lightingShadeMirror([0, 0, 1], SUN_DIR)); // N=+Z
    const pole = luminance709(lightingShadeMirror([0, 1, 0], SUN_DIR)); // N=+Y (밤면 위쪽)
    const nightBottom = luminance709(lightingShadeMirror([0, -1, 0], SUN_DIR)); // N=−Y
    expect(dayCenter).toBeGreaterThan(2.3); // 측정 2.547
    expect(dayCenter).toBeLessThan(2.8);
    expect(terminator).toBeGreaterThan(0.1); // 측정 0.173 (smoothstep 라 약간 변동)
    expect(terminator).toBeLessThan(0.35);
    expect(pole).toBeGreaterThan(0.25); // 측정 0.300 (hemispheric 극 그라데이션)
    expect(pole).toBeLessThan(0.35);
    expect(nightBottom).toBeGreaterThan(0.03); // 측정 0.046 (ground 단독)
    expect(nightBottom).toBeLessThan(0.07);
  });

  it('hemispheric 그라데이션 — 극(+Y) > 밤면하단(−Y) (스칼라 floor 로 재현 불가, ADR §A1.2-3)', () => {
    // 밤면이라도 위쪽(+Y) 향한 면이 아래쪽(−Y) 보다 밝다 (HemisphericLight mix). 결정 2 (B) 핵심.
    const SUN_DIR_FAR: [number, number, number] = [0, 0, 1]; // 둘 다 밤면이 되도록 sunDir=+Z
    const up = luminance709(lightingShadeMirror([0, 1, 0], SUN_DIR_FAR));
    const down = luminance709(lightingShadeMirror([0, -1, 0], SUN_DIR_FAR));
    expect(up).toBeGreaterThan(down);
  });

  it('soft terminator — clamp 가 아닌 smoothstep (경계 톱니 완화, cross-validate 이견 1)', () => {
    // terminator 근처(ndl ≈ 0) 에서 부드럽게 전이 — ndl 미세 변화에 휘도가 연속적.
    const near0a = luminance709(lightingShadeMirror([0.01, 0, 0.9999], [1, 0, 0]));
    const near0b = luminance709(lightingShadeMirror([-0.01, 0, 0.9999], [1, 0, 0]));
    // soft 폭 내에서 둘 다 0/full 이 아닌 중간 값 (clamp 였으면 한쪽이 0).
    expect(near0a).toBeGreaterThan(near0b); // ndl 양수가 더 밝음 (단조)
    // 둘 차이가 크지 않음 (smoothstep 연속) — clamp 였으면 step 불연속.
    expect(Math.abs(near0a - near0b)).toBeLessThan(1.0);
  });

  it('GLSL fragment 광원식 uniform 선언 존재 (미러와 동기)', () => {
    expect(PLANET_FRAGMENT_SHADER).toContain('uniform vec3 uSunDirection');
    expect(PLANET_FRAGMENT_SHADER).toContain('uniform float sunIntensity');
    expect(PLANET_FRAGMENT_SHADER).toContain('uniform vec3 sunDiffuse');
    expect(PLANET_FRAGMENT_SHADER).toContain('uniform float ambientIntensity');
    expect(PLANET_FRAGMENT_SHADER).toContain('uniform vec3 ambientGround');
    expect(PLANET_FRAGMENT_SHADER).toContain('uniform vec3 ambientSky');
    expect(PLANET_FRAGMENT_SHADER).toContain('uniform vec3 ambientUp');
    expect(PLANET_FRAGMENT_SHADER).toContain('uniform float softTerminatorWidth');
  });

  it('GLSL fragment 가 smoothstep soft terminator + hemispheric mix 사용 (식 정합)', () => {
    // smoothstep(0, W, ndl) — ndl ≤ 0 (밤면/terminator) 은 0, 0~W soft 전이 (ADR §A1.5 DoD 2).
    expect(PLANET_FRAGMENT_SHADER).toContain('smoothstep(0.0, softTerminatorWidth, ndl)');
    expect(PLANET_FRAGMENT_SHADER).toContain('mix(ambientGround, ambientSky');
    // 고정 방향 회귀 벡터 (0.5, 0.7, 0.5) 가 더 이상 없어야 한다 (#773 회귀 원인 제거).
    expect(PLANET_FRAGMENT_SHADER).not.toContain('vec3(0.5, 0.7, 0.5)');
  });
});

describe('#773 광원식 미러 — SUN/AMBIENT 상수 일관성 (단색 행성 SSoT 일치)', () => {
  it('기본 광원값이 단색 행성 PointLight/HemisphericLight 와 동일 (DEFAULT 미전달 경로)', () => {
    // lightingShadeMirror 기본값 (DEFAULT_PLANET_LIGHTING) 이 scene 의 sunLight/ambient 와 같은 식 산출.
    // 밤면하단(N=−Y) = ambientIntensity(0.3) × groundColor(0.15,0.15,0.18) → ground 단독.
    const [r, g, b] = lightingShadeMirror([0, -1, 0], [1, 0, 0]);
    expect(r).toBeCloseTo(0.3 * 0.15, 5); // 0.045
    expect(g).toBeCloseTo(0.3 * 0.15, 5);
    expect(b).toBeCloseTo(0.3 * 0.18, 5); // 0.054
  });
});

describe('#775 지구 대륙 mix — ocean ↔ land 색 분리 (ADR §A1.5 DoD 4)', () => {
  // earth base = 청록 (ocean), land = 올리브-브라운. landMask 로 색조(hue) mix → "바다만" 회귀 해소.
  const EARTH_OCEAN: [number, number, number] = [0.23, 0.45, 0.6];

  it('rocky 대륙 mix — ocean(landMask=0) + land(landMask=1) 색 둘 다 존재 (#783 밴드 조건 반영)', () => {
    // Amendment 3 (#783) 후 land 색은 위도 의존 (biome 3밴드) + 고위도는 극관이 덮는다.
    // 따라서 박제값 대조는 밴드가 확정되는 latJ 구간으로 조건화한다:
    //  - ocean: continents ≤ LO && latJ ≤ ICE_LAT_LO → baseColor 그대로 (#775 read-only 규약 유지)
    //  - land(tropical): continents ≥ HI && latJ ≤ TEMPERATE_LO → BIOME_TROPICAL_RGB
    //  - land(temperate): continents ≥ HI && TEMPERATE_HI ≤ latJ ≤ TUNDRA_LO → LAND_COLOR_RGB
    let foundOcean = false;
    let foundTropical = false;
    let foundTemperate = false;
    for (const p of spherePoints(4000)) {
      const continents = fbmMirror(p[0] * 2.4, p[1] * 2.4, p[2] * 2.4);
      const latJ = Math.abs(p[1]) + (continents - 0.5) * BIOME_LAT_JITTER;
      const [r, g, b] = surfaceColorMirror(EARTH_OCEAN, SurfaceType.Rocky, p);
      if (continents <= LAND_THRESHOLD_LO && latJ <= ICE_LAT_LO) {
        // ocean 색 (baseColor) 그대로 — 중·저위도 해안선/바다 불변 (#775 무회귀, §A3.5 DoD 5).
        expect(r).toBeCloseTo(EARTH_OCEAN[0], 4);
        expect(g).toBeCloseTo(EARTH_OCEAN[1], 4);
        expect(b).toBeCloseTo(EARTH_OCEAN[2], 4);
        foundOcean = true;
      }
      if (continents >= LAND_THRESHOLD_HI) {
        if (latJ <= BIOME_TEMPERATE_LO) {
          expect(r).toBeCloseTo(BIOME_TROPICAL_RGB.r, 4);
          expect(g).toBeCloseTo(BIOME_TROPICAL_RGB.g, 4);
          expect(b).toBeCloseTo(BIOME_TROPICAL_RGB.b, 4);
          foundTropical = true;
        } else if (latJ >= BIOME_TEMPERATE_HI && latJ <= BIOME_TUNDRA_LO) {
          expect(r).toBeCloseTo(LAND_COLOR_RGB.r, 4);
          expect(g).toBeCloseTo(LAND_COLOR_RGB.g, 4);
          expect(b).toBeCloseTo(LAND_COLOR_RGB.b, 4);
          foundTemperate = true;
        }
      }
    }
    // 지구 표면에 바다 + 열대 대륙 + 온대 대륙이 모두 존재해야 (mix/밴드가 의미 있음).
    expect(foundOcean).toBe(true);
    expect(foundTropical).toBe(true);
    expect(foundTemperate).toBe(true);
  });

  it('ocean 과 land 가 색조(hue) 다름 — "바다만 밝기 변조" 회귀 해소', () => {
    // ocean 청록 (B 우세) vs land 올리브-브라운 (R/G 우세) — B 채널 우세 관계 역전.
    expect(EARTH_OCEAN[2]).toBeGreaterThan(EARTH_OCEAN[0]); // ocean: B > R
    expect(LAND_COLOR_RGB.r).toBeGreaterThan(LAND_COLOR_RGB.b); // land: R > B
    expect(LAND_COLOR_RGB.g).toBeGreaterThan(LAND_COLOR_RGB.b); // land: G > B (녹/갈)
  });

  it('land 색 보라/마젠타 부재 (R/G 우세, G ≥ min(R,B))', () => {
    expect(LAND_COLOR_RGB.g).toBeGreaterThanOrEqual(Math.min(LAND_COLOR_RGB.r, LAND_COLOR_RGB.b));
  });

  it('GLSL rocky 분기가 mix(baseColor, landCol, landMask) 사용 (밝기 변조 → 색 mix — #783 landCol 밴드)', () => {
    // Amendment 3 (#783): 단일 landColor → 위도 밴드 합성 landCol 로 확장 (ocean=baseColor 불변).
    expect(PLANET_FRAGMENT_SHADER).toContain('mix(baseColor, landCol, landMask)');
    expect(PLANET_FRAGMENT_SHADER).toContain('smoothstep(landThresholdLo, landThresholdHi');
    expect(PLANET_FRAGMENT_SHADER).toContain('uniform vec3 landColor');
  });
});

describe('Amendment 1 — 신규 미학 상수 SSoT (#69 drift 가드)', () => {
  it('soft terminator / 육지색 / 임계 박제값 (drift 시 시각 회귀)', () => {
    expect(SOFT_TERMINATOR_WIDTH).toBe(0.12);
    // #783 튜닝: 올리브 (0.34,0.40,0.24) → 황토 (temperate 밴드 재문서화 — §A3.3 결정 3-b,
    // DoD 2 적도>중위도 G-share 분리 마진 확보. SSoT 갱신 = 정상 경로).
    expect(LAND_COLOR_RGB).toEqual({ r: 0.44, g: 0.38, b: 0.23 });
    expect(LAND_THRESHOLD_LO).toBe(0.48);
    expect(LAND_THRESHOLD_HI).toBe(0.62);
  });

  it('LAND_THRESHOLD_LO < HI (smoothstep 유효 구간)', () => {
    expect(LAND_THRESHOLD_LO).toBeLessThan(LAND_THRESHOLD_HI);
  });

  it('soft terminator 폭이 합리 범위 (0 < W < 0.5 — 톱니 완화 ↔ 대비 보존)', () => {
    expect(SOFT_TERMINATOR_WIDTH).toBeGreaterThan(0);
    expect(SOFT_TERMINATOR_WIDTH).toBeLessThan(0.5);
  });
});

describe('Amendment 2 (#782) — 옵션 e (world normal) 계약 박제 (drift 가드, ADR §A2.3 결정 2)', () => {
  // self-rotation 도입으로 body mesh 가 회전 → vNormal(local) ≠ world normal. 옵션 e 활성화:
  // VERTEX 가 world matrix 로 vNormal 을 world 공간 변환 → 광원 dot 이 태양 방향에 고정 (자전 무관).
  // Amendment 1 의 "회전 0 전제 → local normal 직접 사용" 계약을 옵션 e 계약으로 반전한다.

  it('vertex shader 가 world uniform 으로 vNormal 을 world normal 변환 (옵션 e)', () => {
    // 옵션 e — world matrix uniform 존재 + vNormal 을 world 공간으로 변환.
    expect(PLANET_VERTEX_SHADER).toContain('uniform mat4 world');
    expect(PLANET_VERTEX_SHADER).toContain('vNormal = normalize((world * vec4(normal, 0.0)).xyz)');
    // uniform scale + 순수 회전 전제라 normalMatrix (inverse-transpose) 불요 — world matrix 로 충분
    // (cross-validate Q2 합의). normalMatrix uniform *선언* 이 도입되면 비균일 scale 전환 신호 (계약
    // 변경). 주석에 "normalMatrix 불요" 언급은 허용 — 실 GLSL 선언 (`uniform mat3 normalMatrix`) 부재만 검증.
    expect(PLANET_VERTEX_SHADER).not.toContain('uniform mat3 normalMatrix');
  });

  it('vertex shader 가 vLocalPos 는 local 유지 (절차 패턴 painted-on — self-rotation 시 mesh 추종)', () => {
    // vNormal 만 world, vLocalPos 는 local — 이 분리가 핵심 (표면 패턴은 mesh 와 함께 회전).
    expect(PLANET_VERTEX_SHADER).toContain('vLocalPos = normalize(position)');
  });

  it('fragment shader 가 vNormal(world normal) 을 광원 dot 에 직접 사용', () => {
    expect(PLANET_FRAGMENT_SHADER).toContain('vec3 N = normalize(vNormal)');
    expect(PLANET_FRAGMENT_SHADER).toContain('dot(N, uSunDirection)');
  });

  it('셰이더 주석에 옵션 e (world normal) 계약 박제 — jd 미전달 회귀 가드 포함', () => {
    // 미러 계약 주석 갱신 (N 이 world normal) + jd/큰 수 uniform 미전달 계약 (float32 jitter 차단,
    // cross-validate Q3). 후속 개발자가 시간 기반 셰이더 효과 추가 시 jd 직접 전달 회귀 차단.
    const src = PLANET_FRAGMENT_SHADER + PLANET_VERTEX_SHADER;
    expect(src).toMatch(/world normal/);
    // jd 를 셰이더 uniform 으로 넘기지 않는다는 계약 주석 (jitter/float32 가드).
    expect(src).toMatch(/jd/);
  });
});

describe('Amendment 2 (#782) — JS 미러 world normal 계약 (미러 식 불변, N 인자 좌표계만 갱신)', () => {
  // 옵션 e 는 vNormal 을 world 좌표로 변환하나, lightingShadeMirror 는 N 을 인자로 받는 순수 함수라
  // 식 자체가 불변 (N 이 무슨 좌표계든 dot 정합만 유지). world normal + world sunDir 로 자전 무관 명암.

  it('lightingShadeMirror 는 N/sunDir 좌표계 무관하게 dot 정합 유지 (밤면 < 낮면 단조)', () => {
    // world normal 이 태양을 정면으로 향할 때 (낮면) > 등질 때 (terminator) > 반대 (밤면) 순 휘도 단조.
    const sunDir: [number, number, number] = [1, 0, 0];
    const dayN: [number, number, number] = [1, 0, 0]; // 태양 정면 (낮면)
    const termN: [number, number, number] = [0, 1, 0]; // terminator
    const nightN: [number, number, number] = [-1, 0, 0]; // 태양 반대 (밤면)
    const dayLum = luminance709(lightingShadeMirror(dayN, sunDir));
    const termLum = luminance709(lightingShadeMirror(termN, sunDir));
    const nightLum = luminance709(lightingShadeMirror(nightN, sunDir));
    expect(dayLum).toBeGreaterThan(termLum);
    expect(termLum).toBeGreaterThanOrEqual(nightLum);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Amendment 3 (#783) — 지구 극관 + biome 위도 색 변화 (ADR §A3.3 결정 3·4 + §A3.5).
// ═══════════════════════════════════════════════════════════════════════════════

describe('#783 극관 — 극 위도 ice 수렴 (landMask 양극단 — continents 무관, §A3.3 결정 4 B)', () => {
  const EARTH_OCEAN: [number, number, number] = [0.23, 0.45, 0.6];
  // §A3.5 DoD 1 near-white 산식 (/255 → [0,1] 정규화): min(R,G,B) ≥ 140/255 && max−min ≤ 40/255.
  const NEAR_WHITE_MIN = 140 / 255;
  const NEAR_WHITE_SPREAD = 40 / 255;
  const isNearWhite = (rgb: readonly [number, number, number]): boolean =>
    Math.min(...rgb) >= NEAR_WHITE_MIN && Math.max(...rgb) - Math.min(...rgb) <= NEAR_WHITE_SPREAD;

  it('정확한 남북극 (p = [0,±1,0]) 에서 near-white 수렴 — jitter 최악 경우 포함', () => {
    // 극점 latRaw=1, latJ = 1 + (continents−0.5)×0.12 ∈ [0.94, 1.06] — iceMask ≥ smoothstep(0.84,0.92,0.94)
    // = 1.0 (포화) 로 어느 continents 값이든 (ocean/land 무관) near-white 에 수렴한다.
    for (const pole of [1, -1] as const) {
      const out = surfaceColorMirror(EARTH_OCEAN, SurfaceType.Rocky, [0, pole, 0]);
      expect(isNearWhite(out)).toBe(true);
    }
  });

  it('근극 위도 (|sin lat| ≥ 0.995) 전 샘플 near-white — ocean/land(landMask 양극단) 모두', () => {
    // 남북 각각 경도 스캔 — continents 값과 무관하게 (landMask 0/1 어느 쪽이든) 극관이 덮는다.
    let north = 0;
    let south = 0;
    for (let i = 0; i < 64; i++) {
      const th = (i / 64) * Math.PI * 2;
      const rho = Math.sqrt(1 - 0.995 * 0.995);
      for (const sign of [1, -1] as const) {
        const p: [number, number, number] = [rho * Math.cos(th), sign * 0.995, rho * Math.sin(th)];
        const out = surfaceColorMirror(EARTH_OCEAN, SurfaceType.Rocky, p);
        expect(isNearWhite(out)).toBe(true);
        if (sign > 0) north++;
        else south++;
      }
    }
    expect(north).toBeGreaterThan(0);
    expect(south).toBeGreaterThan(0);
  });

  it('중·저위도 (latJ ≤ ICE_LAT_LO) 는 iceMask = 0 — 극관이 해안선 전이를 침범하지 않음 (Q2 합의)', () => {
    for (const p of spherePoints(2000)) {
      const continents = fbmMirror(p[0] * 2.4, p[1] * 2.4, p[2] * 2.4);
      const latJ = Math.abs(p[1]) + (continents - 0.5) * BIOME_LAT_JITTER;
      if (latJ > ICE_LAT_LO) continue;
      expect(smoothstepMirror(ICE_LAT_LO, ICE_LAT_HI, latJ)).toBe(0);
    }
  });
});

describe('#783 biome — 적도 vs 중위도 G-share 순서 (§A3.5 DoD 2 단위축)', () => {
  const EARTH_OCEAN: [number, number, number] = [0.23, 0.45, 0.6];
  const gShare = (rgb: readonly [number, number, number]): number =>
    rgb[1] / Math.max(rgb[0] + rgb[1] + rgb[2], 1e-6);

  it('full-land 픽셀: 적도 밴드 (|sin lat| ≤ 0.15) 평균 G-share > 중위도 밴드 (0.4–0.65)', () => {
    const eq: number[] = [];
    const mid: number[] = [];
    for (const p of spherePoints(6000)) {
      const continents = fbmMirror(p[0] * 2.4, p[1] * 2.4, p[2] * 2.4);
      if (continents < LAND_THRESHOLD_HI) continue; // full land 만 (해안 전이 배제)
      const absY = Math.abs(p[1]);
      const out = surfaceColorMirror(EARTH_OCEAN, SurfaceType.Rocky, p);
      if (absY <= 0.15) eq.push(gShare(out));
      else if (absY >= 0.4 && absY <= 0.65) mid.push(gShare(out));
    }
    // 통계 유의성 — 밴드당 표본 최소 확보 (스캔 커버리지 가드).
    expect(eq.length).toBeGreaterThan(20);
    expect(mid.length).toBeGreaterThan(20);
    const mean = (a: number[]): number => a.reduce((s, v) => s + v, 0) / a.length;
    expect(mean(eq)).toBeGreaterThan(mean(mid));
  });

  it('색 상수 제약: G-share(BIOME_TROPICAL) > G-share(LAND_COLOR=temperate) (§A3.3 결정 3-b)', () => {
    const gs = (c: { r: number; g: number; b: number }): number => c.g / (c.r + c.g + c.b);
    expect(gs(BIOME_TROPICAL_RGB)).toBeGreaterThan(gs(LAND_COLOR_RGB));
  });
});

describe('#783 anti-pattern — 신규 색 G ≥ min(R,B) (보라/마젠타 구조 회피, §A3.5 DoD 3)', () => {
  it('biome/극관 색 4종 전부 G ≥ min(R,B)', () => {
    for (const c of [BIOME_TROPICAL_RGB, BIOME_TUNDRA_RGB, ICE_COLOR_RGB, LAND_COLOR_RGB]) {
      expect(c.g).toBeGreaterThanOrEqual(Math.min(c.r, c.b));
    }
  });

  it('rocky 미러 전 표면 샘플 G ≥ min(R,B) 위배 0 (mix 결과 포함 — DoD 3 미러축)', () => {
    const EARTH_OCEAN: [number, number, number] = [0.23, 0.45, 0.6];
    let violations = 0;
    for (const p of spherePoints(4000)) {
      const [r, g, b] = surfaceColorMirror(EARTH_OCEAN, SurfaceType.Rocky, p);
      if (g < Math.min(r, b) - 1e-6) violations++;
    }
    expect(violations).toBe(0);
  });
});

describe('#783 상수 SSoT drift 가드 (#69 — 4중 SSoT: 상수/uniforms/바인딩/GLSL + 미러)', () => {
  it('박제값 (sin-space 위도 임계 — 주석 각도 병기, drift 시 시각 회귀)', () => {
    expect(BIOME_TROPICAL_RGB).toEqual({ r: 0.2, g: 0.38, b: 0.16 });
    expect(BIOME_TUNDRA_RGB).toEqual({ r: 0.55, g: 0.56, b: 0.52 });
    expect(ICE_COLOR_RGB).toEqual({ r: 0.93, g: 0.95, b: 0.96 });
    expect(BIOME_TEMPERATE_LO).toBe(0.3);
    expect(BIOME_TEMPERATE_HI).toBe(0.55);
    expect(BIOME_TUNDRA_LO).toBe(0.72);
    // #783 measurement-first 튜닝: 출발값 (TUNDRA_HI 0.88 / ICE 0.88·0.96) 은 ice ramp 가
    // DoD 1 측정 밴드 (≥0.88) 전체와 겹쳐 실측 10.2% 미달 → 0.84/0.84·0.92 하향 (상수 주석 참조).
    expect(BIOME_TUNDRA_HI).toBe(0.84);
    expect(ICE_LAT_LO).toBe(0.84);
    expect(ICE_LAT_HI).toBe(0.92);
    expect(BIOME_LAT_JITTER).toBe(0.12);
  });

  it('위도 임계 순서 — 밴드 겹침 없이 순차 (tropical → temperate → tundra → ice, Q2 합의)', () => {
    expect(BIOME_TEMPERATE_LO).toBeGreaterThan(0);
    expect(BIOME_TEMPERATE_LO).toBeLessThan(BIOME_TEMPERATE_HI);
    expect(BIOME_TEMPERATE_HI).toBeLessThanOrEqual(BIOME_TUNDRA_LO);
    expect(BIOME_TUNDRA_LO).toBeLessThan(BIOME_TUNDRA_HI);
    // 툰드라→극관 연속 전이 (이슈 "툰드라→극관 연결") — TUNDRA_HI 가 ICE_LAT_LO 와 맞닿음.
    expect(BIOME_TUNDRA_HI).toBeLessThanOrEqual(ICE_LAT_LO);
    expect(ICE_LAT_LO).toBeLessThan(ICE_LAT_HI);
    expect(ICE_LAT_HI).toBeLessThanOrEqual(1);
    // jitter 진폭 (±0.06 요동) 이 밴드 폭을 넘지 않는 합리 범위.
    expect(BIOME_LAT_JITTER).toBeGreaterThan(0);
    expect(BIOME_LAT_JITTER).toBeLessThan(0.25);
  });

  it('GLSL fragment 에 biome/극관 uniform 10종 선언 존재 (미러와 동기)', () => {
    expect(PLANET_FRAGMENT_SHADER).toContain('uniform vec3 biomeTropicalColor');
    expect(PLANET_FRAGMENT_SHADER).toContain('uniform vec3 biomeTundraColor');
    expect(PLANET_FRAGMENT_SHADER).toContain('uniform vec3 iceColor');
    expect(PLANET_FRAGMENT_SHADER).toContain('uniform float biomeTemperateLo');
    expect(PLANET_FRAGMENT_SHADER).toContain('uniform float biomeTemperateHi');
    expect(PLANET_FRAGMENT_SHADER).toContain('uniform float biomeTundraLo');
    expect(PLANET_FRAGMENT_SHADER).toContain('uniform float biomeTundraHi');
    expect(PLANET_FRAGMENT_SHADER).toContain('uniform float iceLatLo');
    expect(PLANET_FRAGMENT_SHADER).toContain('uniform float iceLatHi');
    expect(PLANET_FRAGMENT_SHADER).toContain('uniform float biomeLatJitter');
  });

  it('GLSL rocky 분기 식 계약 — §A3.3 결정 3 스케치 그대로 (fbm 신규 호출 0)', () => {
    // 위도 파라미터 (sin-space) + 기존 continents 재사용 jitter.
    expect(PLANET_FRAGMENT_SHADER).toContain('float latRaw = abs(p.y)');
    expect(PLANET_FRAGMENT_SHADER).toContain('(continents - 0.5) * biomeLatJitter');
    // 2 smoothstep 연쇄 biome mix → landMask mix → iceMask 최종 mix (합성 순서 계약).
    expect(PLANET_FRAGMENT_SHADER).toContain(
      'mix(biomeTropicalColor, landColor, smoothstep(biomeTemperateLo, biomeTemperateHi, latJ))',
    );
    expect(PLANET_FRAGMENT_SHADER).toContain(
      'mix(landCol, biomeTundraColor, smoothstep(biomeTundraLo, biomeTundraHi, latJ))',
    );
    expect(PLANET_FRAGMENT_SHADER).toContain('smoothstep(iceLatLo, iceLatHi, latJ)');
    expect(PLANET_FRAGMENT_SHADER).toContain('mix(col, iceColor, iceMask)');
    // 핵심 예측 "noise +0" — rocky 분기의 fbm 호출은 continents 1회뿐 (결정 3-c 위반 가드).
    const rockyBranch = PLANET_FRAGMENT_SHADER.slice(
      PLANET_FRAGMENT_SHADER.indexOf('uSurfaceType == 0'),
      PLANET_FRAGMENT_SHADER.indexOf('uSurfaceType == 1'),
    );
    expect((rockyBranch.match(/fbm\(/g) ?? []).length).toBe(1);
  });
});
