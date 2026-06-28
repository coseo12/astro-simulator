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
  fbmMirror,
  surfaceColorMirror,
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
