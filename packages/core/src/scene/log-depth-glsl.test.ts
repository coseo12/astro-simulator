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
import {
  LOG_DEPTH_FRAGMENT_WRITE_GLSL,
  LOG_DEPTH_VERTEX_Z_GLSL,
  LOG_DEPTH_VERTEX_Z_INSET,
} from './log-depth.js';
import { RING_FRAGMENT_SHADER, RING_VERTEX_SHADER } from './ring-shader.js';
import { SUN_FRAGMENT_SHADER, SUN_VERTEX_SHADER } from './sun-shader.js';
import { PLANET_FRAGMENT_SHADER, PLANET_VERTEX_SHADER } from './procedural-planet-shader.js';
import { CLOUD_FRAGMENT_SHADER, CLOUD_VERTEX_SHADER } from './cloud-layer.js';
import { BELT_FRAGMENT_SHADER } from './belt-particles.js';
import { SUN_CORONA_FRAGMENT_SHADER } from './sun-corona.js';
import { SUN_PROMINENCE_FRAGMENT_SHADER } from './sun-prominences.js';

describe('#845 LOG_DEPTH_FRAGMENT_WRITE_GLSL — 커스텀 셰이더 공용 조각 정합', () => {
  // #1215 — 구름 셰이더 추가로 3 → 4 (ADR 20260628-756 §A10.4 — 없으면 shell 이 표면에 depth 거부된다).
  // #1319 — 띠 입자 셰이더 추가로 4 → 5 (ADR 20261008-1319 결정 1 — 불투명 · depth write 라 행성 앞뒤 판정이 같은 공간이어야 한다).
  const SHADERS: ReadonlyArray<readonly [string, string]> = [
    ['ring-shader', RING_FRAGMENT_SHADER],
    ['sun-shader', SUN_FRAGMENT_SHADER],
    ['procedural-planet-shader', PLANET_FRAGMENT_SHADER],
    ['cloud-layer', CLOUD_FRAGMENT_SHADER],
    ['belt-particles', BELT_FRAGMENT_SHADER],
    // #1335 — 코로나 셰이더 (ADR 20261014-1335 결정 1 — 코로나 구 뒷면 평면의 깊이가 수성 · 앞쪽 천체와 같은 공간이어야 한다).
    ['sun-corona', SUN_CORONA_FRAGMENT_SHADER],
    // #1428 — 홍염 셰이더 (ADR 20261107-1428 결정 1 — 실제 3D 위치에 depth test on 이라 달 · 앞쪽 천체 깊이가 가린다).
    ['sun-prominences', SUN_PROMINENCE_FRAGMENT_SHADER],
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

/** GLSL 블록 · 줄 주석 제거 (판정 전처리). */
function stripGlslComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/** `gl_Position` 쓰기 — 전체 · 성분 대입과 복합 대입. 비교 연산 `==` 는 제외한다. */
const GL_POSITION_WRITE = /gl_Position(\.[xyzw]+)?\s*[-+*/]?=(?!=)/g;

describe('#1422 LOG_DEPTH_VERTEX_Z_GLSL — vertex clip z 보정 (WebGL2 far clip 구멍)', () => {
  // 적용 대상 = WebGL2 노출이 실측된 셰이더만 (#1422 PR 본문 노출 측정 표). sun-corona · comet-tail ·
  // belt-particles 는 같은 패턴이나 측정 시점에서 보정 전후 픽셀 차이가 0 이라 범위 밖이다.
  // sun-prominences (ADR 20261107-1428 결정 2) 도 같은 패턴이나 위성 focus 후 시간 점프 시나리오에서 보정 전후 픽셀
  // 차이가 0 이라 범위 밖이다 (하드웨어 WebGL2 · 같은 장면의 sun-shader 대조군 노출 37612 px — PR #1430 본문 D10 표).
  // starfield · star-catalog 는 노출을 재지 않았고, fragment 가 gl_FragDepth 를 쓰지 않아 이 보정을 넣으면
  // depth 값도 바뀐다 (log-depth.ts 사용 전제) — PR #1425 코멘트 기록.
  const SHADERS: ReadonlyArray<readonly [string, string]> = [
    ['procedural-planet-shader', PLANET_VERTEX_SHADER],
    ['ring-shader', RING_VERTEX_SHADER],
    ['sun-shader', SUN_VERTEX_SHADER],
    ['cloud-layer', CLOUD_VERTEX_SHADER],
  ];

  it('공용 조각이 clip z 를 w 의 선형 비율만큼 안쪽으로 당긴다 (log 식 회귀 차단)', () => {
    expect(LOG_DEPTH_VERTEX_Z_GLSL).toBe('gl_Position.z -= gl_Position.w * 1e-5;');
    expect(LOG_DEPTH_VERTEX_Z_INSET).toBe(1e-5);
    // Babylon logDepthVertex 동형 (비선형) 식은 WebGPU 고리 픽셀을 바꿔 기각됐다 (#1422).
    expect(LOG_DEPTH_VERTEX_Z_GLSL).not.toContain('log2');
  });

  for (const [name, vertex] of SHADERS) {
    // 주석을 지운 GLSL 로 판정한다 — 보정 줄을 `//` 로 막아도 텍스트 포함 검사는 통과하기 때문 (PR #1425 리뷰 변이 M2).
    const code = stripGlslComments(vertex);

    it(`${name} vertex 가 공용 조각을 정확히 1회 포함 (주석 제외)`, () => {
      expect(code.split(LOG_DEPTH_VERTEX_Z_GLSL).length - 1).toBe(1);
    });

    it(`${name} vertex 의 gl_Position 쓰기는 「전체 대입 1회 → 보정 1회」 뿐이다`, () => {
      // 성분 대입 (`gl_Position.z =`) · 복합 대입 (`-=` 등) 까지 잡는다. 보정 앞뒤 어디에 다른 쓰기가 끼어도
      // (기각된 log 식 재도입 포함 — 변이 M3 · M4 · M6) 개수가 2 를 넘거나 순서가 어긋난다.
      const writes = [...code.matchAll(GL_POSITION_WRITE)];
      expect(writes.map((m) => m[0].replace(/\s+/g, ''))).toEqual([
        'gl_Position=',
        'gl_Position.z-=',
      ]);
      expect(writes[1]?.index).toBe(code.indexOf(LOG_DEPTH_VERTEX_Z_GLSL));
    });
  }
});
