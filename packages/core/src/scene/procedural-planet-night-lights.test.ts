/**
 * #1226 — 야간 도시 불빛 (ADR `20260628-756` Amendment 11) 단위 테스트.
 *
 * Phase 1 범위 — 픽셀 가드 (`verify:1226-night-lights`) 의 임계는 D1 승인 뒤에 도출하므로 여기서는
 * **GPU 무관한 구조 계약**만 고정한다:
 *   N1. 후보 파라미터 정의역 불변식 (smoothstep 미정의 차단 · §A11.15 조건 2 · 주파수 상한)
 *   N2. OFF = strength 0 (같은 프로그램 no-op) · 미지 후보 폴백
 *   N3. GLSL 배치 — 연산은 rocky 분기 안, 합성은 rim 옆 · clamp 앞 · 가산
 *   N4. 입력 공간 — vLocalPos 파생 p 만 (painted-on, 계약 D8) · noise 함수 사본 증가 0 (§A11.8)
 *   N5. 극관 억제 · 황혼 게이트 · 마스크 게이트 — 결정적 프레임에서 픽셀 판별 불가라 미러로 고정 (§A11.4)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NIGHT_LIGHT_CANDIDATES,
  NIGHT_LIGHT_DEFAULT_CANDIDATE,
  NightLightPattern,
  PLANET_FRAGMENT_SHADER,
  nightLightTermMirror,
  resolveNightLightParams,
} from './procedural-planet-shader.js';

/** 주석을 뺀 GLSL 실행 코드 사본 — 주석이 토큰을 인용해 자기 자신을 매칭하는 것을 막는다. */
const CODE = PLANET_FRAGMENT_SHADER.split('\n')
  .map((line) => line.replace(/\/\/.*$/, ''))
  .join('\n');

/** §A11.5 주파수 상한 [도출] — 결정적 프레임 disk 반경 98.32 px 에서 셀 폭이 1 px 가 되는 K. */
const MAX_FREQUENCY = 98;

const candidateEntries = Object.entries(NIGHT_LIGHT_CANDIDATES);

describe('#1226 N1 — 후보 파라미터 정의역 불변식', () => {
  it('후보가 2개 이상이고 기본 후보가 표에 있다 (계약 D1 「후보 ≥ 2」)', () => {
    expect(candidateEntries.length).toBeGreaterThanOrEqual(2);
    expect(NIGHT_LIGHT_CANDIDATES[NIGHT_LIGHT_DEFAULT_CANDIDATE]).toBeDefined();
  });

  it.each(candidateEntries)(
    '후보 %s — twilightWidth > 0 (smoothstep(−W, 0, ndl) 의 edge0 < edge1)',
    (_id, c) => {
      expect(c.twilightWidth).toBeGreaterThan(0);
    },
  );

  it.each(candidateEntries)('후보 %s — lo < hi (smoothstep 정의역)', (_id, c) => {
    expect(c.lo).toBeLessThan(c.hi);
  });

  it.each(candidateEntries)('후보 %s — max(color) × strength ≤ 1 (§A11.15 조건 2)', (_id, c) => {
    const maxChannel = Math.max(c.color.r, c.color.g, c.color.b);
    expect(maxChannel * c.strength).toBeLessThanOrEqual(1);
    for (const v of [c.color.r, c.color.g, c.color.b]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it.each(candidateEntries)(
    '후보 %s — 0 < frequency ≤ 98 · clusterMix ∈ [0,1] · strength > 0',
    (_id, c) => {
      expect(c.frequency).toBeGreaterThan(0);
      expect(c.frequency).toBeLessThanOrEqual(MAX_FREQUENCY);
      expect(c.clusterMix).toBeGreaterThanOrEqual(0);
      expect(c.clusterMix).toBeLessThanOrEqual(1);
      expect(c.strength).toBeGreaterThan(0);
      expect(Object.values(NightLightPattern)).toContain(c.pattern);
    },
  );
});

describe('#1226 N2 — resolveNightLightParams (OFF = strength 0)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('nightLights=false → strength 만 0, 나머지는 후보 그대로', () => {
    const base = NIGHT_LIGHT_CANDIDATES[NIGHT_LIGHT_DEFAULT_CANDIDATE]!;
    const off = resolveNightLightParams(false);
    expect(off.strength).toBe(0);
    expect({ ...off, strength: base.strength }).toEqual(base);
  });

  it('nightLights=true · 후보 미지정 → 기본 후보', () => {
    expect(resolveNightLightParams(true)).toEqual(
      NIGHT_LIGHT_CANDIDATES[NIGHT_LIGHT_DEFAULT_CANDIDATE],
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it.each(candidateEntries)('후보 %s 지정 → 그 후보', (id, c) => {
    expect(resolveNightLightParams(true, id)).toEqual(c);
  });

  it('미지 후보 → 기본 후보 + console.warn 1회', () => {
    expect(resolveNightLightParams(true, 'zz')).toEqual(
      NIGHT_LIGHT_CANDIDATES[NIGHT_LIGHT_DEFAULT_CANDIDATE],
    );
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

describe('#1226 N3 — GLSL 배치 (§A11.3)', () => {
  it('박제 형태 — nightFactor · 게이트 (γ) · lights · 합성', () => {
    expect(CODE).toContain(
      'float nightFactor = 1.0 - smoothstep(-nightLightTwilightWidth, 0.0, ndl)',
    );
    expect(CODE).toContain('float lightGate = landMask * (1.0 - iceMask) * uMaskEnabled');
    expect(CODE).toContain('lights = nightLightStrength * nightFactor * lightGate * lightDensity');
    expect(CODE).toContain('col += nightLightColor * lights');
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

  it('uniform 8종 GLSL 선언', () => {
    for (const decl of [
      'uniform float nightLightStrength',
      'uniform vec3 nightLightColor',
      'uniform float nightLightTwilightWidth',
      'uniform int nightLightPattern',
      'uniform float nightLightFrequency',
      'uniform float nightLightLo',
      'uniform float nightLightHi',
      'uniform float nightLightClusterMix',
    ]) {
      expect(PLANET_FRAGMENT_SHADER).toContain(decl);
    }
  });
});

describe('#1226 N4 — 입력 공간 · noise 사본 (계약 D8 · §A11.8)', () => {
  it('분포 입력은 p (vLocalPos 파생) 뿐이다', () => {
    expect(CODE).toContain('valueNoise(p * nightLightFrequency)');
    expect(CODE).toContain('hash13(floor(p * nightLightFrequency))');
    // vWorldPos 는 여전히 varying 선언 1 + viewDir 1 (U11 과 같은 계수 — 불빛이 새지 않았다).
    expect(CODE.split('vWorldPos').length - 1).toBe(2);
  });

  it('noise 함수 정의 사본 증가 0 — hash13 · valueNoise · fbm 정의 각 1', () => {
    expect((CODE.match(/float hash13\(/g) ?? []).length).toBe(1);
    expect((CODE.match(/float valueNoise\(/g) ?? []).length).toBe(1);
    expect((CODE.match(/float fbm\(/g) ?? []).length).toBe(1);
  });

  it('fbm 신규 호출 0 (§A11.5 기각) — 불빛 블록에 fbm( · texture2D( 없음', () => {
    const start = CODE.indexOf('float nightFactor');
    const end = CODE.indexOf('lights = nightLightStrength');
    const block = CODE.slice(start, end);
    expect(block.length).toBeGreaterThan(0);
    expect(block).not.toContain('fbm(');
    expect(block).not.toContain('texture2D(');
  });
});

describe('#1226 N5 — 게이트 미러 (극관 억제 · 황혼 · 마스크, §A11.4)', () => {
  const params = NIGHT_LIGHT_CANDIDATES[NIGHT_LIGHT_DEFAULT_CANDIDATE]!;
  const deepNight = -1;
  const full = { ndl: deepNight, landMask: 1, iceMask: 0, maskEnabled: 1, density: 1 };

  it('완전 밤 · 육지 · 극관 없음 · 마스크 경로 · 밀도 1 → strength', () => {
    expect(nightLightTermMirror(full, params)).toBeCloseTo(params.strength, 12);
  });

  it('Q1-b 극관 억제 — iceMask 1 → 정확히 0', () => {
    expect(nightLightTermMirror({ ...full, iceMask: 1 }, params)).toBe(0);
  });

  it('Q5 황혼 게이트 — ndl ≥ 0 에서 정확히 0 (낮면 불변 D3 의 구조적 근거)', () => {
    for (const ndl of [0, 1e-6, 0.15, 1]) {
      expect(nightLightTermMirror({ ...full, ndl }, params)).toBe(0);
    }
  });

  it('게이트 (γ) — uMaskEnabled 0 → 0 · landMask 0 (바다) → 0', () => {
    expect(nightLightTermMirror({ ...full, maskEnabled: 0 }, params)).toBe(0);
    expect(nightLightTermMirror({ ...full, landMask: 0 }, params)).toBe(0);
  });

  it('OFF (strength 0) → 0', () => {
    expect(nightLightTermMirror(full, resolveNightLightParams(false))).toBe(0);
  });
});
