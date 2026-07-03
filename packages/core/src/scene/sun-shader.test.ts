/**
 * #774 — 태양 emissive 절차 표면 셰이더 단위 테스트.
 *
 * 검증 축 (ADR `docs/decisions/20260703-774-sun-emissive-shader.md` §DoD 7):
 *   1. GLSL↔JS 미러 결정성 (동일 입력 동일 출력).
 *   2. limb darkening 단조성 (μ↓ ⇒ 휘도↓ — Eddington 근사).
 *   3. warm 색역 (R ≥ B 유지 — 보라·마젠타 부재, starfield/planet anti-pattern 가드 동형).
 *   4. 상수 SSoT drift 가드 (LIMB_DARKENING_U_RGB / GRANULATION_SCALE / GRANULATION_CONTRAST).
 *   5. GLSL 정적 계약 — switch 부재 (if-else only) / gl_FragDepth 존재 (log-depth §결정 7) /
 *      world normal 배선 (#782 옵션 e §결정 3) / 광원 uniform 부재 (emissive 전용 §결정 4) /
 *      noise 텍스트 planet 동일성 (fbmMirror 재사용 계약).
 *   6. 색온도 그라데이션 — 가장자리 B/R 채널비 < 중심 B/R (§결정 2 — 채널별 u 자동 도출).
 *   7. SURFACE_TYPE_BY_BODY sun 미등록 유지 (§결정 1 — planet 테이블 "외부광 반사" 전용).
 */

import { describe, expect, it } from 'vitest';
import {
  LIMB_DARKENING_U_RGB,
  GRANULATION_SCALE,
  GRANULATION_CONTRAST,
  limbDarkeningMirror,
  sunColorMirror,
  SUN_VERTEX_SHADER,
  SUN_FRAGMENT_SHADER,
} from './sun-shader.js';
import {
  SURFACE_TYPE_BY_BODY,
  luminance709,
  PLANET_FRAGMENT_SHADER,
} from './procedural-planet-shader.js';

/** 태양 실측 base 발광색 (colorHint.hex #FFE9A8 — 데이터 SSoT read-only). */
const SUN_BASE: readonly [number, number, number] = [1.0, 233 / 255, 168 / 255];

/** 구면 표면점 샘플 생성 (정규화 단위 벡터). */
function spherePoint(t: number): [number, number, number] {
  const x = Math.sin(t * 1.7) * Math.cos(t);
  const y = Math.cos(t * 0.9);
  const z = Math.sin(t * 0.5) * Math.sin(t);
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

describe('#774 sun-shader — GLSL↔JS 미러 결정성 (ADR §DoD 7)', () => {
  it('sunColorMirror: 동일 입력 동일 출력 (결정성)', () => {
    const p: [number, number, number] = [0.3, 0.6, 0.74];
    expect(sunColorMirror(SUN_BASE, p, 0.7)).toEqual(sunColorMirror(SUN_BASE, p, 0.7));
  });

  it('limbDarkeningMirror: 동일 입력 동일 출력 + μ 범위 밖 clamp (GLSL clamp 정합)', () => {
    expect(limbDarkeningMirror(0.5)).toEqual(limbDarkeningMirror(0.5));
    // GLSL `clamp(dot(N, viewDir), 0.0, 1.0)` 과 동일 — 범위 밖 입력이 경계값으로 수렴.
    expect(limbDarkeningMirror(-0.3)).toEqual(limbDarkeningMirror(0));
    expect(limbDarkeningMirror(1.7)).toEqual(limbDarkeningMirror(1));
  });

  it('sunColorMirror: 출력 [0,1] 범위 (clamp 보장 — 다수 표면점 × μ 전수)', () => {
    for (let i = 0; i < 100; i++) {
      const p = spherePoint(i * 0.0628);
      const mu = (i % 11) / 10;
      for (const c of sunColorMirror(SUN_BASE, p, mu)) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('#774 sun-shader — limb darkening 단조성 (μ↓ ⇒ 휘도↓, ADR §결정 2)', () => {
  it('Eddington 근사 — μ 1→0 감소 시 휘도 strict 단조 감소', () => {
    // granulation 제외 (limb 만) — 고정 표면점에서 μ 만 변화시켜 limb 항 단조성 격리 검증.
    const lums: number[] = [];
    for (let i = 10; i >= 0; i--) {
      const mu = i / 10; // 1.0 (중심) → 0.0 (가장자리)
      lums.push(luminance709(limbDarkeningMirror(mu)));
    }
    for (let i = 1; i < lums.length; i++) {
      const cur = lums[i] ?? Number.NaN;
      const prev = lums[i - 1] ?? Number.NaN;
      expect(cur).toBeLessThan(prev); // strict (1차식 — plateau 없음)
    }
  });

  it('가장자리 (r≈0.9R, μ≈0.436) / 중심 휘도비 < 0.85 (ADR §DoD 2 미러 사전 검증)', () => {
    // disk 반경 r/R = sin(θ) → μ = cos(θ) = √(1 − (r/R)²). r=0.9R → μ ≈ 0.436.
    const muEdge = Math.sqrt(1 - 0.9 * 0.9);
    const center = luminance709([
      SUN_BASE[0] * limbDarkeningMirror(1)[0],
      SUN_BASE[1] * limbDarkeningMirror(1)[1],
      SUN_BASE[2] * limbDarkeningMirror(1)[2],
    ]);
    const edge = luminance709([
      SUN_BASE[0] * limbDarkeningMirror(muEdge)[0],
      SUN_BASE[1] * limbDarkeningMirror(muEdge)[1],
      SUN_BASE[2] * limbDarkeningMirror(muEdge)[2],
    ]);
    expect(edge / center).toBeLessThan(0.85);
    expect(edge / center).toBeGreaterThan(0.3); // 완전 소등 아님 (u ≤ 1 — disk 가장자리 가시 유지)
  });

  it('중심 (μ=1) 은 감광 0 — limb = [1,1,1] (base 발광색 보존)', () => {
    expect(limbDarkeningMirror(1)).toEqual([1, 1, 1]);
  });

  it('granulation 포함 (sunColorMirror) 에서도 μ 감소 추세 유지 (변조 진폭 < limb 격차)', () => {
    // 동일 표면점 고정 — granulation 은 상수, μ 만 변화 → limb 단조가 그대로 드러남.
    const p = spherePoint(1.234);
    const lumCenter = luminance709(sunColorMirror(SUN_BASE, p, 1));
    const lumEdge = luminance709(sunColorMirror(SUN_BASE, p, 0.1));
    expect(lumEdge).toBeLessThan(lumCenter);
  });
});

describe('#774 sun-shader — warm 색역 (R ≥ B — 보라·마젠타 부재, ADR §DoD 7)', () => {
  it('다수 표면점 × μ 전수 — 출력 R ≥ B (u_R < u_B 라 limb 가 warm 방향으로만 이동)', () => {
    // base (#FFE9A8) 는 R > G > B. limb 는 B 를 더 감광 (u_B > u_R) → R ≥ B 구조 보장.
    // granulation 은 채널 공통 스칼라 곱이라 채널 순서 불변.
    let violations = 0;
    for (let i = 0; i < 200; i++) {
      const p = spherePoint(i * 0.0314);
      const mu = (i % 11) / 10;
      const [r, , b] = sunColorMirror(SUN_BASE, p, mu);
      if (r < b - 1e-9) violations++;
    }
    expect(violations).toBe(0);
  });

  it('보라/마젠타 부재 — G ≥ min(R,B) 위배 없음 (planet/starfield anti-pattern 가드 동형)', () => {
    let violations = 0;
    for (let i = 0; i < 200; i++) {
      const p = spherePoint(i * 0.0314);
      const mu = (i % 11) / 10;
      const [r, g, b] = sunColorMirror(SUN_BASE, p, mu);
      if (g < Math.min(r, b) - 1e-9) violations++;
    }
    expect(violations).toBe(0);
  });

  it('granulation 변조가 실재 (단색 아님 — 표면점 간 출력 분산 > 0)', () => {
    const samples: number[] = [];
    for (let i = 0; i < 50; i++) {
      samples.push(luminance709(sunColorMirror(SUN_BASE, spherePoint(i * 0.13), 1)));
    }
    const spread = Math.max(...samples) - Math.min(...samples);
    expect(spread).toBeGreaterThan(0.01); // 변조 진폭 0 이면 feature 무의미
  });
});

describe('#774 sun-shader — 색온도 그라데이션 (가장자리 B/R < 중심 B/R, ADR §DoD 3 미러)', () => {
  it('채널별 u 계수만으로 가장자리가 더 주황 (별도 색 mix 없이 자동 도출 — §결정 2)', () => {
    const p = spherePoint(0.777);
    const [rC, , bC] = sunColorMirror(SUN_BASE, p, 1); // 중심
    const [rE, , bE] = sunColorMirror(SUN_BASE, p, 0.1); // 가장자리
    expect(bE / rE).toBeLessThan(bC / rC);
  });

  it('u 계수 파장 순서 — u_R < u_G < u_B (blue 가 더 감광 = warm 그라데이션의 구조 전제)', () => {
    expect(LIMB_DARKENING_U_RGB[0]).toBeLessThan(LIMB_DARKENING_U_RGB[1]);
    expect(LIMB_DARKENING_U_RGB[1]).toBeLessThan(LIMB_DARKENING_U_RGB[2]);
  });
});

describe('#774 sun-shader — 상수 SSoT (#69 drift 가드)', () => {
  it('rendering-only 미학 상수 박제값 (measurement-first — drift 시 시각 회귀)', () => {
    expect(LIMB_DARKENING_U_RGB).toEqual([0.5, 0.6, 0.9]);
    expect(GRANULATION_SCALE).toBe(48);
    expect(GRANULATION_CONTRAST).toBe(0.12);
  });

  it('u 계수 유효 범위 (0 < u ≤ 1 — limb ≥ 0 구조 보장, 완전 소등 방지)', () => {
    for (const u of LIMB_DARKENING_U_RGB) {
      expect(u).toBeGreaterThan(0);
      expect(u).toBeLessThanOrEqual(1);
    }
  });

  it('granulation 진폭은 base 를 묻지 않는 합리 범위 (0 < contrast < 0.5 — #756 상수 철학)', () => {
    expect(GRANULATION_CONTRAST).toBeGreaterThan(0);
    expect(GRANULATION_CONTRAST).toBeLessThan(0.5);
  });

  it('GLSL fragment 에 상수 uniform 선언 존재 (미러와 동기)', () => {
    expect(SUN_FRAGMENT_SHADER).toContain('uniform vec3 limbDarkeningU');
    expect(SUN_FRAGMENT_SHADER).toContain('uniform float granulationScale');
    expect(SUN_FRAGMENT_SHADER).toContain('uniform float granulationContrast');
    expect(SUN_FRAGMENT_SHADER).toContain('uniform vec3 baseColor');
  });
});

describe('#774 sun-shader — GLSL 정적 계약 (ADR §DoD 7)', () => {
  it('switch 키워드 부재 — if-else only (WGSL 변환 깨짐 차단, #756 이견 수용 1)', () => {
    expect(SUN_FRAGMENT_SHADER).not.toMatch(/\bswitch\b/);
    expect(SUN_VERTEX_SHADER).not.toMatch(/\bswitch\b/);
  });

  it('log-depth — fragment 가 gl_FragDepth 를 로그 공간으로 기록 (§결정 7, ring #641 정합)', () => {
    expect(SUN_FRAGMENT_SHADER).toContain('gl_FragDepth');
    expect(SUN_FRAGMENT_SHADER).toContain('logDepthConstant');
  });

  it('log-depth — vertex 가 vFragmentDepth = 1.0 + clip.w 전달 (Babylon logDepth 공식)', () => {
    expect(SUN_VERTEX_SHADER).toContain('vFragmentDepth');
    expect(SUN_VERTEX_SHADER).toMatch(/vFragmentDepth\s*=\s*1\.0\s*\+/);
  });

  it('world normal 배선 (#782 옵션 e 규약 답습 — §결정 3)', () => {
    expect(SUN_VERTEX_SHADER).toContain('uniform mat4 world');
    expect(SUN_VERTEX_SHADER).toContain('vNormal = normalize((world * vec4(normal, 0.0)).xyz)');
    // uniform scale 전제 — normalMatrix 도입은 비균일 scale 전환 신호 (planet 계약 동형).
    expect(SUN_VERTEX_SHADER).not.toContain('uniform mat3 normalMatrix');
  });

  it('vLocalPos 는 local 유지 (painted-on granulation — §결정 3, world 변환 금지)', () => {
    expect(SUN_VERTEX_SHADER).toContain('vLocalPos = normalize(position)');
  });

  it('viewDir 배선 — vWorldPos varying + cameraPosition auto-bind uniform (§결정 8)', () => {
    expect(SUN_VERTEX_SHADER).toContain('vWorldPos = (world * vec4(position, 1.0)).xyz');
    expect(SUN_FRAGMENT_SHADER).toContain('uniform vec3 cameraPosition');
    expect(SUN_FRAGMENT_SHADER).toContain('normalize(cameraPosition - vWorldPos)');
    expect(SUN_FRAGMENT_SHADER).toMatch(/clamp\(dot\(N,\s*viewDir\),\s*0\.0,\s*1\.0\)/);
  });

  it('emissive 전용 — 광원 uniform 부재 (§결정 4, planet 광원 모델의 역방향)', () => {
    // planet 셰이더의 광원 uniform 9종이 하나도 선언되지 않아야 한다 (외부광 무간섭 = 자동 무광).
    for (const lightUniform of [
      'uSunDirection',
      'sunIntensity',
      'sunDiffuse',
      'ambientIntensity',
      'ambientGround',
      'ambientSky',
      'ambientUp',
      'softTerminatorWidth',
    ]) {
      expect(SUN_FRAGMENT_SHADER).not.toContain(lightUniform);
    }
  });

  it('Eddington 근사 식 존재 — vec3(1.0) − limbDarkeningU × (1 − μ) (미러와 동일 식)', () => {
    expect(SUN_FRAGMENT_SHADER).toContain('vec3(1.0) - limbDarkeningU * (1.0 - mu)');
  });
});

describe('#774 sun-shader — noise 텍스트 planet 동일성 (fbmMirror 재사용 계약)', () => {
  // JS 미러는 procedural-planet-shader 의 fbmMirror 를 재사용한다 (volt #21 중복 구현 금지).
  // 전제: sun GLSL 의 hash33/valueNoise/fbm 이 planet GLSL 과 동일 텍스트. 갈라지면 미러가
  // 한쪽과 어긋난다 (조용한 drift) — 핵심 식 라인 동일성을 정적 계약으로 가드.

  const NOISE_CONTRACT_LINES = [
    'p = fract(p * vec3(0.1031, 0.1030, 0.0973));', // hash33 시드
    'p += dot(p, p.yxz + 33.33);', // hash33 mix
    'vec3 u = f * f * (3.0 - 2.0 * f);', // valueNoise smoothstep 보간
    '0.55 * valueNoise(p) + 0.30 * valueNoise(p * 2.3) + 0.15 * valueNoise(p * 4.7)', // fbm 3-옥타브
  ];

  for (const line of NOISE_CONTRACT_LINES) {
    it(`핵심 식 동일 존재 — ${line.slice(0, 40)}…`, () => {
      expect(SUN_FRAGMENT_SHADER).toContain(line);
      expect(PLANET_FRAGMENT_SHADER).toContain(line);
    });
  }
});

describe('#774 sun-shader — SURFACE_TYPE_BY_BODY sun 미등록 유지 (ADR §결정 1)', () => {
  it('planet 테이블에 sun 부재 — 테이블은 "외부광 반사 표면" 전용 (procedural-planet 변경 0)', () => {
    expect(SURFACE_TYPE_BY_BODY.sun).toBeUndefined();
  });
});
