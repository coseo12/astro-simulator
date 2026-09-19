/**
 * #1226 — 야간 도시 불빛 (ADR `20260628-756` Amendment 11) 단위 테스트.
 *
 * 픽셀 가드 (`verify:1226-night-lights`) 가 GPU 에서 재는 축과 겹치지 않는 **구조 계약**을 고정한다:
 *   N1. D1 승인 상수 (g1) 박제 + 정의역 불변식 (smoothstep 미정의 차단 · §A11.15 조건 2 · 주파수 상한)
 *   N2. OFF = strength 0 (같은 프로그램 no-op)
 *   N3. GLSL 배치 — 연산은 rocky 분기 안, 합성은 rim 옆 · clamp 앞 · 가산
 *   N4. 입력 공간 — vLocalPos 파생 p 만 (painted-on, 계약 D8) · noise 함수 사본 증가 0 (§A11.8)
 *   N5. 극관 억제 · 황혼 게이트 · 마스크 게이트 — 결정적 프레임에서 픽셀 판별 불가라 미러로 고정 (§A11.4)
 *
 * ⚠️ 이 파일이 전건 통과해도 **바인딩 블록이 사라진 결함**은 잡지 못한다 (계약 변이 MN-2 — §A8.8 M-2
 * 동형). 그 축은 픽셀 가드 D2 가 잰다.
 */

import { describe, expect, it } from 'vitest';
import {
  NIGHT_LIGHT_CLUSTER_HI,
  NIGHT_LIGHT_CLUSTER_LO,
  NIGHT_LIGHT_CLUSTER_MIX,
  NIGHT_LIGHT_COLOR_RGB,
  NIGHT_LIGHT_DENSITY_HI,
  NIGHT_LIGHT_DENSITY_LO,
  NIGHT_LIGHT_FREQUENCY,
  NIGHT_LIGHT_STRENGTH,
  NIGHT_LIGHT_TWILIGHT_WIDTH,
  PLANET_FRAGMENT_SHADER,
  nightLightTermMirror,
  resolveNightLightStrength,
} from './procedural-planet-shader.js';

/** 주석을 뺀 GLSL 실행 코드 사본 — 주석이 토큰을 인용해 자기 자신을 매칭하는 것을 막는다. */
const CODE = PLANET_FRAGMENT_SHADER.split('\n')
  .map((line) => line.replace(/\/\/.*$/, ''))
  .join('\n');

/** §A11.5 주파수 상한 [도출] — 결정적 프레임 disk 반경 98.32 px 에서 셀 폭이 1 px 가 되는 K. */
const MAX_FREQUENCY = 98;

describe('#1226 N1 — D1 승인 상수 (g1) · 정의역 불변식', () => {
  it('승인값 박제 — #1226 코멘트 5663330554 (값 변경 시 verify:1226 임계 재도출 의무)', () => {
    expect(NIGHT_LIGHT_STRENGTH).toBe(0.9);
    expect(NIGHT_LIGHT_COLOR_RGB).toEqual({ r: 1.0, g: 0.72, b: 0.38 });
    expect(NIGHT_LIGHT_TWILIGHT_WIDTH).toBe(0.12);
    expect(NIGHT_LIGHT_FREQUENCY).toBe(48);
    expect(NIGHT_LIGHT_DENSITY_LO).toBe(0.55);
    expect(NIGHT_LIGHT_DENSITY_HI).toBe(0.72);
    expect(NIGHT_LIGHT_CLUSTER_MIX).toBe(0.5);
    expect(NIGHT_LIGHT_CLUSTER_LO).toBe(0.52);
    expect(NIGHT_LIGHT_CLUSTER_HI).toBe(0.6);
  });

  it('twilightWidth > 0 (smoothstep(−W, 0, ndl) 의 edge0 < edge1)', () => {
    expect(NIGHT_LIGHT_TWILIGHT_WIDTH).toBeGreaterThan(0);
  });

  it('분포 · 군집 게이트 smoothstep 정의역 — LO < HI', () => {
    expect(NIGHT_LIGHT_DENSITY_LO).toBeLessThan(NIGHT_LIGHT_DENSITY_HI);
    expect(NIGHT_LIGHT_CLUSTER_LO).toBeLessThan(NIGHT_LIGHT_CLUSTER_HI);
  });

  it('군집 게이트는 continents 치역 (0, 1) 안 — 밖이면 게이트가 상수가 된다', () => {
    expect(NIGHT_LIGHT_CLUSTER_LO).toBeGreaterThan(0);
    expect(NIGHT_LIGHT_CLUSTER_HI).toBeLessThan(1);
  });

  it('max(color) × strength ≤ 1 (§A11.15 조건 2) · 색 채널 ∈ [0,1]', () => {
    const { r, g, b } = NIGHT_LIGHT_COLOR_RGB;
    expect(Math.max(r, g, b) * NIGHT_LIGHT_STRENGTH).toBeLessThanOrEqual(1);
    for (const v of [r, g, b]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('0 < frequency ≤ 98 · clusterMix ∈ [0,1] · strength > 0', () => {
    expect(NIGHT_LIGHT_FREQUENCY).toBeGreaterThan(0);
    expect(NIGHT_LIGHT_FREQUENCY).toBeLessThanOrEqual(MAX_FREQUENCY);
    expect(NIGHT_LIGHT_CLUSTER_MIX).toBeGreaterThanOrEqual(0);
    expect(NIGHT_LIGHT_CLUSTER_MIX).toBeLessThanOrEqual(1);
    expect(NIGHT_LIGHT_STRENGTH).toBeGreaterThan(0);
  });
});

describe('#1226 N2 — resolveNightLightStrength (OFF = strength 0)', () => {
  it('nightLights=false → 0', () => {
    expect(resolveNightLightStrength(false)).toBe(0);
  });
  it('nightLights=true → 승인 세기', () => {
    expect(resolveNightLightStrength(true)).toBe(NIGHT_LIGHT_STRENGTH);
  });
});

describe('#1226 N3 — GLSL 배치 (§A11.3)', () => {
  it('박제 형태 — nightFactor · 게이트 (γ) · 분포 · 군집 게이트 · lights · 합성', () => {
    expect(CODE).toContain(
      'float nightFactor = 1.0 - smoothstep(-nightLightTwilightWidth, 0.0, ndl)',
    );
    expect(CODE).toContain('float lightGate = landMask * (1.0 - iceMask) * uMaskEnabled');
    expect(CODE).toContain(
      'float lightDensity = smoothstep(nightLightLo, nightLightHi, valueNoise(p * nightLightFrequency))',
    );
    expect(CODE).toContain('lightDensity *= mix(1.0, continents, nightLightClusterMix)');
    expect(CODE).toContain(
      'lightDensity *= smoothstep(nightLightClusterLo, nightLightClusterHi, continents)',
    );
    expect(CODE).toContain('lights = nightLightStrength * nightFactor * lightGate * lightDensity');
    expect(CODE).toContain('col += nightLightColor * lights');
  });

  it('D1 전환 장치가 남지 않았다 — 패턴 정수 분기 · 셀 해시 경로 부재', () => {
    expect(PLANET_FRAGMENT_SHADER).not.toContain('nightLightPattern');
    expect(CODE).not.toContain('hash13(floor(p * nightLightFrequency))');
  });

  it('연산은 rocky 분기 안 (iceMask mix 뒤 · desert dispatch 앞), 초기화는 분기 앞', () => {
    const rockyIdx = CODE.lastIndexOf('if (uSurfaceType == 0) {');
    const iceIdx = CODE.indexOf('col = mix(col, iceColor, iceMask)');
    const calcIdx = CODE.indexOf('lights = nightLightStrength');
    const dispatchIdx = CODE.indexOf('} else if (uSurfaceType == 1)');
    const initIdx = CODE.indexOf('float lights = 0.0');
    expect(initIdx).toBeGreaterThan(0);
    expect(initIdx).toBeLessThan(rockyIdx);
    expect(calcIdx).toBeGreaterThan(iceIdx);
    expect(calcIdx).toBeLessThan(dispatchIdx);
  });

  it('합성은 분기 밖 — col *= shade 뒤 · rim 합성 뒤 · clamp 앞, 가산', () => {
    const shadeIdx = CODE.indexOf('col *= shade');
    const rimIdx = CODE.indexOf('col += rimColor * rim');
    const lightsIdx = CODE.indexOf('col += nightLightColor * lights');
    const clampIdx = CODE.indexOf('col = clamp(col, 0.0, 1.0)');
    const dispatchIdx = CODE.indexOf('} else if (uSurfaceType == 1)');
    expect(lightsIdx).toBeGreaterThan(dispatchIdx);
    expect(lightsIdx).toBeGreaterThan(shadeIdx);
    expect(lightsIdx).toBeGreaterThan(rimIdx);
    expect(clampIdx).toBeGreaterThan(lightsIdx);
    expect(CODE).not.toContain('mix(col, nightLightColor');
  });

  it('uniform 9종 GLSL 선언', () => {
    for (const decl of [
      'uniform float nightLightStrength',
      'uniform vec3 nightLightColor',
      'uniform float nightLightTwilightWidth',
      'uniform float nightLightFrequency',
      'uniform float nightLightLo',
      'uniform float nightLightHi',
      'uniform float nightLightClusterMix',
      'uniform float nightLightClusterLo',
      'uniform float nightLightClusterHi',
    ]) {
      expect(PLANET_FRAGMENT_SHADER).toContain(decl);
    }
  });
});

describe('#1226 N4 — 입력 공간 · noise 사본 (계약 D8 · §A11.8)', () => {
  it('분포 입력은 p (vLocalPos 파생) 와 continents (p 파생 fbm) 뿐이다 — painted-on', () => {
    expect(CODE).toContain('vec3 p = normalize(vLocalPos)');
    expect(CODE).toContain('valueNoise(p * nightLightFrequency)');
    expect(CODE).toContain('continents = fbm(p * 2.4)');
    // vWorldPos 는 여전히 varying 선언 1 + viewDir 1 (U11 과 같은 계수 — 불빛이 새지 않았다).
    expect(CODE.split('vWorldPos').length - 1).toBe(2);
  });

  it('noise 함수 정의 사본 증가 0 — hash13 · valueNoise · fbm 정의 각 1', () => {
    expect((CODE.match(/float hash13\(/g) ?? []).length).toBe(1);
    expect((CODE.match(/float valueNoise\(/g) ?? []).length).toBe(1);
    expect((CODE.match(/float fbm\(/g) ?? []).length).toBe(1);
  });

  it('fbm 신규 호출 0 (§A11.5 기각) — 불빛 블록에 fbm( · texture2D( · vWorldPos 없음', () => {
    const start = CODE.indexOf('float nightFactor');
    const end = CODE.indexOf('lights = nightLightStrength');
    const block = CODE.slice(start, end);
    expect(block.length).toBeGreaterThan(0);
    expect(block).not.toContain('fbm(');
    expect(block).not.toContain('texture2D(');
    expect(block).not.toContain('vWorldPos');
  });
});

describe('#1226 N5 — 게이트 미러 (극관 억제 · 황혼 · 마스크, §A11.4)', () => {
  const deepNight = -1;
  const full = { ndl: deepNight, landMask: 1, iceMask: 0, maskEnabled: 1, density: 1 };

  it('완전 밤 · 육지 · 극관 없음 · 마스크 경로 · 밀도 1 → strength', () => {
    expect(nightLightTermMirror(full)).toBeCloseTo(NIGHT_LIGHT_STRENGTH, 12);
  });

  it('Q1-b 극관 억제 — iceMask 1 → 정확히 0', () => {
    expect(nightLightTermMirror({ ...full, iceMask: 1 })).toBe(0);
  });

  it('Q5 황혼 게이트 — ndl ≥ 0 에서 정확히 0 (낮면 불변 D3 의 구조적 근거)', () => {
    for (const ndl of [0, 1e-6, 0.15, 1]) {
      expect(nightLightTermMirror({ ...full, ndl })).toBe(0);
    }
  });

  it('게이트 (γ) — uMaskEnabled 0 → 0 · landMask 0 (바다) → 0', () => {
    expect(nightLightTermMirror({ ...full, maskEnabled: 0 })).toBe(0);
    expect(nightLightTermMirror({ ...full, landMask: 0 })).toBe(0);
  });

  it('OFF (strength 0) → 0', () => {
    expect(nightLightTermMirror(full, resolveNightLightStrength(false))).toBe(0);
  });
});
