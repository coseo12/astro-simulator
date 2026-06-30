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
  fbmMirror,
  surfaceColorMirror,
  lightingShadeMirror,
  luminance709,
  PLANET_VERTEX_SHADER,
  PLANET_FRAGMENT_SHADER,
} from './procedural-planet-shader.js';

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

  it('rocky 대륙 mix — ocean(landMask=0) + land(landMask=1) 색 둘 다 존재', () => {
    // continents 가 LO 미만이 되는 표면점을 찾아 ocean 색 유지 확인 — 다수 샘플 중 ocean/land 둘 다 존재.
    let foundOcean = false;
    let foundLand = false;
    for (let i = 0; i < 400; i++) {
      const t = i * 0.0157;
      const x = Math.sin(t * 1.3) * Math.cos(t * 0.7);
      const y = Math.cos(t * 1.1);
      const z = Math.sin(t * 0.9) * Math.sin(t * 0.6);
      const len = Math.hypot(x, y, z) || 1;
      const p: [number, number, number] = [x / len, y / len, z / len];
      const continents = fbmMirror(p[0] * 2.4, p[1] * 2.4, p[2] * 2.4);
      const [r, g, b] = surfaceColorMirror(EARTH_OCEAN, SurfaceType.Rocky, p);
      if (continents <= LAND_THRESHOLD_LO) {
        // ocean 색 (baseColor) 에 근접.
        expect(r).toBeCloseTo(EARTH_OCEAN[0], 4);
        expect(g).toBeCloseTo(EARTH_OCEAN[1], 4);
        expect(b).toBeCloseTo(EARTH_OCEAN[2], 4);
        foundOcean = true;
      }
      if (continents >= LAND_THRESHOLD_HI) {
        // land 색 (LAND_COLOR_RGB) 에 근접.
        expect(r).toBeCloseTo(LAND_COLOR_RGB.r, 4);
        expect(g).toBeCloseTo(LAND_COLOR_RGB.g, 4);
        expect(b).toBeCloseTo(LAND_COLOR_RGB.b, 4);
        foundLand = true;
      }
    }
    // 지구 표면에 대륙과 바다가 둘 다 존재해야 (mix 가 의미 있음).
    expect(foundOcean).toBe(true);
    expect(foundLand).toBe(true);
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

  it('GLSL rocky 분기가 mix(baseColor, landColor, landMask) 사용 (밝기 변조 → 색 mix)', () => {
    expect(PLANET_FRAGMENT_SHADER).toContain('mix(baseColor, landColor, landMask)');
    expect(PLANET_FRAGMENT_SHADER).toContain('smoothstep(landThresholdLo, landThresholdHi');
    expect(PLANET_FRAGMENT_SHADER).toContain('uniform vec3 landColor');
  });
});

describe('Amendment 1 — 신규 미학 상수 SSoT (#69 drift 가드)', () => {
  it('soft terminator / 육지색 / 임계 박제값 (drift 시 시각 회귀)', () => {
    expect(SOFT_TERMINATOR_WIDTH).toBe(0.12);
    expect(LAND_COLOR_RGB).toEqual({ r: 0.34, g: 0.4, b: 0.24 });
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

describe('Amendment 1 — 회전 0 전제 계약 박제 (drift 가드, ADR §A1.5 DoD 8)', () => {
  // world normal == local normal 은 "body mesh 회전 0" 에 의존. self-rotation 도입 시 normalMatrix 필요.
  // 셰이더는 vNormal(local) 을 그대로 dot 에 사용 — normalMatrix / world matrix uniform 부재 확인.

  it('vertex shader 가 vNormal 을 local normal 그대로 전달 (normalMatrix 변환 부재)', () => {
    expect(PLANET_VERTEX_SHADER).toContain('vNormal = normalize(normal)');
    // 회전 도입 전까지 normalMatrix uniform 이 없어야 한다 (있으면 옵션 e 전환된 것 — 계약 변경 신호).
    expect(PLANET_VERTEX_SHADER).not.toContain('normalMatrix');
  });

  it('fragment shader 가 vNormal(local) 을 광원 dot 에 직접 사용 (회전 0 전제)', () => {
    expect(PLANET_FRAGMENT_SHADER).toContain('vec3 N = normalize(vNormal)');
    expect(PLANET_FRAGMENT_SHADER).toContain('dot(N, uSunDirection)');
  });

  it('셰이더 주석에 회전 0 전제 계약 박제 (self-rotation 도입 시 normalMatrix)', () => {
    // 후속 개발자가 self-rotation 도입 시 광원 모델 깨짐을 인지하도록 주석 계약 박제 (DoD 8).
    expect(PLANET_FRAGMENT_SHADER + PLANET_VERTEX_SHADER).toMatch(/world normal == local normal/);
  });
});
