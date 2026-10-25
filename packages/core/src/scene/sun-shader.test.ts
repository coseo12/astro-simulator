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
  SUNSPOT_SIZE_EXAGGERATION,
  UMBRA_LUMINANCE_RATIO,
  PENUMBRA_LUMINANCE_RATIO,
  SUN_EFFECTIVE_TEMPERATURE_K,
  SUNSPOT_CHANNEL_WAVELENGTHS_UM,
  UMBRA_RGB,
  PENUMBRA_RGB,
  UMBRA_RADIUS_RATIO,
  FILAMENT_CONTRAST,
  FILAMENT_AZIMUTH_FREQUENCY,
  FILAMENT_SEED_SCALE,
  PENUMBRA_GRANULATION_SUPPRESSION,
  planckChannelRatio,
  sunspotShadeMirror,
  sunspotFilamentBasisMirror,
  writeSunspotUniforms,
} from './sun-shader.js';
import {
  SUNSPOT_MAX,
  SUN_AXIS_SCENE,
  createHeliographicSpots,
  generateHeliographicSunspots,
} from './sunspots.js';
import {
  SURFACE_TYPE_BY_BODY,
  luminance709,
  PLANET_FRAGMENT_SHADER,
} from './procedural-planet-shader.js';
import { CLOUD_FRAGMENT_SHADER } from './cloud-layer.js';
import { SUN_CORONA_FRAGMENT_SHADER } from './sun-corona.js';

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

  // #789 — sun↔planet 실제 공유 라인만 계약에 포함한다 (양쪽 동일성 계약).
  // granulation 합성 (`fbm(p * granulationScale)`) 은 sun-specific (planet 부재) 이라 제외 —
  // 넣으면 PLANET_FRAGMENT_SHADER 쪽 toContain 이 FAIL (그게 계약이 잡아야 할 오염).
  const NOISE_CONTRACT_LINES = [
    // hash33 (3줄 전체 — sin-free fract-mix)
    'p = fract(p * vec3(0.1031, 0.1030, 0.0973));', // hash33 시드
    'p += dot(p, p.yxz + 33.33);', // hash33 mix
    'return fract((p.xxy + p.yxx) * p.zyx);', // hash33 최종 반환
    'return hash33(p).x;', // hash13 — hash33 첫 채널 축약
    // valueNoise (trilinear smoothstep 본체)
    'vec3 i = floor(p);', // valueNoise 격자 셀 인덱스
    'vec3 f = fract(p);', // valueNoise 셀 내 좌표
    'vec3 u = f * f * (3.0 - 2.0 * f);', // valueNoise smoothstep 보간
    'mix(hash13(i + vec3(0.0, 0.0, 0.0)), hash13(i + vec3(1.0, 0.0, 0.0)), u.x),', // trilinear 하단·앞 x-보간
    'mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), u.x),', // trilinear 하단·뒤 x-보간
    'mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), u.x),', // trilinear 상단·앞 x-보간
    'mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), u.x),', // trilinear 상단·뒤 x-보간
    // fbm (3-옥타브 합성)
    '0.55 * valueNoise(p) + 0.30 * valueNoise(p * 2.3) + 0.15 * valueNoise(p * 4.7)', // fbm 3-옥타브
  ];

  for (const line of NOISE_CONTRACT_LINES) {
    it(`핵심 식 동일 존재 — ${line.slice(0, 40)}…`, () => {
      expect(SUN_FRAGMENT_SHADER).toContain(line);
      expect(PLANET_FRAGMENT_SHADER).toContain(line);
      // #1215 — 구름 셰이더가 4번째 사본 (ADR 20260628-756 §A10.4 — 같은 계약으로 묶는다).
      expect(CLOUD_FRAGMENT_SHADER).toContain(line);
      // #1335 — 코로나 셰이더가 5번째 사본 (ADR 20261014-1335 결정 1 재사용 — 미러는 같은 fbmMirror).
      expect(SUN_CORONA_FRAGMENT_SHADER).toContain(line);
    });
  }
});

describe('#774 sun-shader — SURFACE_TYPE_BY_BODY sun 미등록 유지 (ADR §결정 1)', () => {
  it('planet 테이블에 sun 부재 — 테이블은 "외부광 반사 표면" 전용 (procedural-planet 변경 0)', () => {
    expect(SURFACE_TYPE_BY_BODY.sun).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// #1412 — 흑점 (ADR `docs/decisions/20261025-1412-sunspots.md` §DoD D10)
// ─────────────────────────────────────────────────────────────────────────────

describe('#1412 sun-shader 흑점 — 상수 SSoT · 본영/반영 인자 유도식 (결정 4 · 7)', () => {
  it('승인 상수 — 배율 ×2.5 (각반경) · 필라멘트 대비 0.35 · 본영 반경비 1/√5.5 · 반영 granulation 억제 0.7', () => {
    expect(SUNSPOT_SIZE_EXAGGERATION).toBe(2.5);
    expect(FILAMENT_CONTRAST).toBe(0.35);
    expect(UMBRA_RADIUS_RATIO).toBeCloseTo(1 / Math.sqrt(5.5), 15);
    expect(PENUMBRA_GRANULATION_SUPPRESSION).toBe(0.7);
    expect(FILAMENT_AZIMUTH_FREQUENCY).toBe(9);
    expect(FILAMENT_SEED_SCALE).toBe(17);
  });

  it('휘도비 20 % · 75 % → Stefan–Boltzmann 온도 3860 K · 5371 K (T☉ 5772 K)', () => {
    expect(UMBRA_LUMINANCE_RATIO).toBe(0.2);
    expect(PENUMBRA_LUMINANCE_RATIO).toBe(0.75);
    expect(SUN_EFFECTIVE_TEMPERATURE_K).toBe(5772);
    expect(SUN_EFFECTIVE_TEMPERATURE_K * UMBRA_LUMINANCE_RATIO ** 0.25).toBeCloseTo(3860, 0);
    expect(SUN_EFFECTIVE_TEMPERATURE_K * PENUMBRA_LUMINANCE_RATIO ** 0.25).toBeCloseTo(5371, 0);
  });

  it('Planck 비 채널 인자 — 본영 (0.130, 0.105, 0.070) · 반영 (0.734, 0.711, 0.669) (ADR POC 값)', () => {
    expect(SUNSPOT_CHANNEL_WAVELENGTHS_UM).toEqual([0.61, 0.55, 0.465]);
    [0.13, 0.105, 0.07].forEach((v, i) => expect(UMBRA_RGB[i]).toBeCloseTo(v, 3));
    [0.734, 0.711, 0.669].forEach((v, i) => expect(PENUMBRA_RGB[i]).toBeCloseTo(v, 3));
    // 기준 온도에서는 1, 낮은 온도일수록 짧은 파장이 더 어둡다 (R > G > B — 붉은 흑점).
    expect(planckChannelRatio(0.55, 5772, 5772)).toBeCloseTo(1, 15);
    expect(UMBRA_RGB[0]).toBeGreaterThan(UMBRA_RGB[1]);
    expect(UMBRA_RGB[1]).toBeGreaterThan(UMBRA_RGB[2]);
    expect(PENUMBRA_RGB[0]).toBeGreaterThan(PENUMBRA_RGB[2]);
  });
});

describe('#1412 sun-shader 흑점 — GLSL 정적 계약 (D10)', () => {
  it('uniform vec4 spots[48] + spotCount + spotVisibility + sunAxis 선언', () => {
    expect(SUNSPOT_MAX).toBe(48);
    expect(SUN_FRAGMENT_SHADER).toContain('uniform vec4 spots[48];');
    expect(SUN_FRAGMENT_SHADER).toContain('uniform float spotCount;');
    expect(SUN_FRAGMENT_SHADER).toContain('uniform float spotVisibility;');
    expect(SUN_FRAGMENT_SHADER).toContain('uniform vec3 sunAxis;');
    // jd 는 셰이더로 가지 않는다 (#782 규약 · ADR 774 재검토 조건 3).
    expect(SUN_FRAGMENT_SHADER).not.toMatch(/uniform\s+float\s+\w*(jd|julian|time)\w*\s*;/i);
  });

  it('루프 상수 상한 48 + spotCount 조기 탈출 (if-else 만, switch 없음)', () => {
    expect(SUN_FRAGMENT_SHADER).toContain('for (int i = 0; i < 48; i++) {');
    expect(SUN_FRAGMENT_SHADER).toContain('if (float(i) >= spotCount) break;');
    expect(SUN_FRAGMENT_SHADER).not.toMatch(/\bswitch\b/);
  });

  it('원판 판정은 현 거리 length(p − c) · 합성 baseColor × granulation′ × spotFactor × limb · gl_FragDepth 유지', () => {
    expect(SUN_FRAGMENT_SHADER).toContain('vec3 dv = p - c;');
    expect(SUN_FRAGMENT_SHADER).toContain('float d = length(dv);');
    expect(SUN_FRAGMENT_SHADER).toContain(
      'vec3 col = baseColor * granulation * spotFactor * limb;',
    );
    expect(SUN_FRAGMENT_SHADER).toContain(
      'spotFactor = mix(vec3(1.0), spotFactor, spotVisibility);',
    );
    expect(SUN_FRAGMENT_SHADER).toContain('gl_FragDepth');
  });

  it('필라멘트 기저는 자전축 고정 — t = normalize(cross(sunAxis, c)) · b = cross(c, t) · 시드 dot(c, sunAxis)', () => {
    expect(SUN_FRAGMENT_SHADER).toContain('vec3 t = normalize(cross(sunAxis, c));');
    expect(SUN_FRAGMENT_SHADER).toContain('vec3 b = cross(c, t);');
    expect(SUN_FRAGMENT_SHADER).toContain('dot(c, sunAxis) * 17.0');
    // POC 시안 C 의 흐르는 입력 (`+ c * 17.0`) 은 쓰지 않는다 (결정 4 ⚠️).
    expect(SUN_FRAGMENT_SHADER).not.toContain('c * 17.0');
  });
});

describe('#1412 sun-shader 흑점 — JS 미러 (D10)', () => {
  it('중심은 본영색 · 바깥은 인자 1 (granulation 억제 0) — spotCount = 0 경로와 같은 값', () => {
    const r = 0.02;
    const center = sunspotShadeMirror(0, r, 0, 1);
    center.factor.forEach((v, i) => expect(v).toBeCloseTo(UMBRA_RGB[i]!, 12));
    expect(center.granulationWeight).toBe(1);
    const outside = sunspotShadeMirror(r, r, 0.3, 1);
    expect(outside.factor).toEqual([1, 1, 1]);
    expect(outside.granulationWeight).toBe(0);
  });

  it('반영 띠 — 반영색 × (1 ± 대비 × 필라멘트), granulation 억제 0.7', () => {
    const r = 0.02;
    // 본영 바깥 · 반영 smoothstep 안쪽 (0.8 R 미만) — 반영 마스크 1, 본영 마스크 0.
    const d = (r * UMBRA_RADIUS_RATIO + r * 0.8) / 2;
    const plain = sunspotShadeMirror(d, r, 0, 1);
    plain.factor.forEach((v, i) => expect(v).toBeCloseTo(PENUMBRA_RGB[i]!, 12));
    expect(plain.granulationWeight).toBeCloseTo(0.7, 12);
    const bright = sunspotShadeMirror(d, r, 0.5, 1);
    bright.factor.forEach((v, i) => expect(v).toBeCloseTo(PENUMBRA_RGB[i]! * (1 + 0.35 * 0.5), 12));
  });

  it('가시도 0 — 흑점 위치에서도 인자 1 · 억제 0 (감쇠 끝 = 흑점 없음)', () => {
    const z = sunspotShadeMirror(0, 0.02, 0.2, 0);
    expect(z.factor).toEqual([1, 1, 1]);
    expect(z.granulationWeight).toBe(0);
  });

  it('필라멘트 기저가 흑점과 함께 돈다 — c 를 자전축 둘레로 θ 회전하면 t · b 도 같은 회전', () => {
    const axis = SUN_AXIS_SCENE;
    // Rodrigues 회전 (axis 단위벡터).
    const rot = (v: readonly number[], th: number): [number, number, number] => {
      const k = axis;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const kv = k[0] * v[0]! + k[1] * v[1]! + k[2] * v[2]!;
      const x = [
        k[1] * v[2]! - k[2] * v[1]!,
        k[2] * v[0]! - k[0] * v[2]!,
        k[0] * v[1]! - k[1] * v[0]!,
      ];
      return [0, 1, 2].map((i) => v[i]! * c + x[i]! * s + k[i]! * kv * (1 - c)) as [
        number,
        number,
        number,
      ];
    };
    // 실제 흑점 중심 (기록기 출력) 들로 검사한다.
    const buf = new Array<number>(4 * SUNSPOT_MAX).fill(0);
    const n = writeSunspotUniforms(2456748.5, buf);
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const c: [number, number, number] = [buf[4 * i]!, buf[4 * i + 1]!, buf[4 * i + 2]!];
      const base = sunspotFilamentBasisMirror(c, axis);
      for (const th of [0.3, 1.7, -2.4]) {
        const moved = sunspotFilamentBasisMirror(rot(c, th), axis);
        const tR = rot(base.t, th);
        const bR = rot(base.b, th);
        for (let k = 0; k < 3; k++) {
          expect(moved.t[k]).toBeCloseTo(tR[k]!, 12);
          expect(moved.b[k]).toBeCloseTo(bR[k]!, 12);
        }
      }
    }
  });
});

describe('#1412 sun-shader 흑점 — 기록기 writeSunspotUniforms (결정 1 · 2)', () => {
  it('vec4 배열 — xyz 단위벡터 · w = 2.5 × 물리 각반경 · 개수 뒤 0', () => {
    const jd = 2456748.5;
    const spots = createHeliographicSpots();
    const n = generateHeliographicSunspots(jd, spots);
    const buf = new Array<number>(4 * SUNSPOT_MAX).fill(7);
    expect(writeSunspotUniforms(jd, buf)).toBe(n);
    for (let i = 0; i < n; i++) {
      const v = buf.slice(4 * i, 4 * i + 3);
      expect(Math.hypot(v[0]!, v[1]!, v[2]!)).toBeCloseTo(1, 12);
      // 장면 자전축과의 내적 = sin 위도.
      const sinLat =
        v[0]! * SUN_AXIS_SCENE[0] + v[1]! * SUN_AXIS_SCENE[1] + v[2]! * SUN_AXIS_SCENE[2];
      expect(sinLat).toBeCloseTo(Math.sin((spots.latDeg[i]! * Math.PI) / 180), 12);
      expect(buf[4 * i + 3]).toBeCloseTo(2.5 * spots.radiusRad[i]!, 15);
    }
    for (let k = 4 * n; k < 4 * SUNSPOT_MAX; k++) expect(buf[k]).toBe(0);
  });

  it('범위 밖 jd → 0 개 · 배열 전부 0', () => {
    const buf = new Array<number>(4 * SUNSPOT_MAX).fill(3);
    expect(writeSunspotUniforms(Number.NaN, buf)).toBe(0);
    expect(buf.every((v) => v === 0)).toBe(true);
  });
});
