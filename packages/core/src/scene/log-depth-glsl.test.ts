/**
 * #845 — log-depth GLSL 공용 조각 SSoT 정적 가드.
 *
 * ring-shader (#641) / sun-shader / procedural-planet-shader (#756) 3곳에 3중 복제되어 있던
 * fragment 로그 depth 기록 문장을 `log-depth.ts` 의 `LOG_DEPTH_FRAGMENT_WRITE_GLSL` 상수로
 * 추출 (#789 hexToColor3 rule-of-three 선례). 텍스트 동일성이 픽셀 불변의 전제이므로,
 * 세 셰이더 최종 GLSL 문자열이 공용 조각을 그대로 포함하는지 정적 검증한다
 * (NOISE_CONTRACT — `sun-shader.test.ts` — toContain 패턴 답습).
 *
 * 픽셀 레벨 회귀 없음의 SSoT 는 shader-pixel-guard CI (완료 조건 4).
 */
import { describe, expect, it } from 'vitest';
import { LOG_DEPTH_FRAGMENT_WRITE_GLSL } from './log-depth.js';
import { RING_FRAGMENT_SHADER } from './ring-shader.js';
import { SUN_FRAGMENT_SHADER } from './sun-shader.js';
import { PLANET_FRAGMENT_SHADER } from './procedural-planet-shader.js';

describe('#845 LOG_DEPTH_FRAGMENT_WRITE_GLSL — 3 셰이더 공용 조각 정합', () => {
  const SHADERS: ReadonlyArray<readonly [string, string]> = [
    ['ring-shader', RING_FRAGMENT_SHADER],
    ['sun-shader', SUN_FRAGMENT_SHADER],
    ['procedural-planet-shader', PLANET_FRAGMENT_SHADER],
  ];

  it('공용 조각 텍스트 자체가 Babylon logDepth 공식 형태를 유지한다', () => {
    // 상수가 실수로 비거나 다른 문장으로 바뀌면 아래 toContain 이 모두 무의미해지므로
    // 핵심 토큰 3개 (gl_FragDepth / vFragmentDepth / logDepthConstant) 를 선행 단언.
    expect(LOG_DEPTH_FRAGMENT_WRITE_GLSL).toContain('gl_FragDepth');
    expect(LOG_DEPTH_FRAGMENT_WRITE_GLSL).toContain('vFragmentDepth');
    expect(LOG_DEPTH_FRAGMENT_WRITE_GLSL).toContain('logDepthConstant');
  });

  for (const [name, fragment] of SHADERS) {
    it(`${name} fragment 가 공용 조각을 그대로 포함 (텍스트 동일성 = 픽셀 불변 전제)`, () => {
      expect(fragment).toContain(LOG_DEPTH_FRAGMENT_WRITE_GLSL);
    });

    it(`${name} fragment 의 gl_FragDepth 기록은 정확히 1회 (독립 재선언 재발 차단)`, () => {
      const writes = fragment.split('gl_FragDepth =').length - 1;
      expect(writes).toBe(1);
    });

    it(`${name} fragment 가 공용 조각의 사용 전제 선언을 보유 (varying + uniform)`, () => {
      expect(fragment).toContain('varying float vFragmentDepth;');
      expect(fragment).toContain('uniform float logDepthConstant;');
    });
  }
});
