/**
 * #738 — 절차적 starfield + 은하수 단위 테스트.
 *
 * `createStarfield` 는 Babylon 엔진 (ShaderMaterial 컴파일 / MeshBuilder) 이 필요하므로 NullEngine
 * 헤드리스로는 비결정적 (solar-system-scene.test.ts 의 NullEngine 회피 패턴 동일) — 대신:
 *   1. 미학 상수 SSoT 가드 (#69 숨은 상수 drift 차단 — ADR 박제값과 동기)
 *   2. GLSL/소스 계약 markers 정적 검증 (mesh.infiniteDistance/isPickable=false/renderingGroupId=0 +
 *      depthWrite off + gl_FragDepth 미사용 — ADR §결정 1/5/6)
 *   3. 색온도 anti-pattern 부재 (`starColorMirror` — 보라/마젠타 금지, 단조 tint — ADR §결정 4)
 *
 * 실 mesh 의 infiniteDistance 불변 거동 (floating-origin/tier/줌) 은 browser-verify-738-starfield.mjs
 * S2 (실 Chrome) 가 담당 — 단위 테스트는 코드 계약 markers + 미학 상수만 가드.
 *
 * ADR `docs/decisions/20260624-738-procedural-starfield.md` §3 검증 + §4 테스트 전략.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  STARFIELD_SPHERE_DIAMETER,
  STARFIELD_SPHERE_SEGMENTS,
  STARFIELD_GRID_DENSITY,
  STARFIELD_THRESHOLD,
  MILKY_WAY_NORMAL,
  MILKY_WAY_GLOW_INTENSITY,
  MILKY_WAY_BAND_WIDTH,
  MILKY_WAY_GLOW_COLOR,
  STARFIELD_VERTEX_SHADER,
  STARFIELD_FRAGMENT_SHADER,
  starColorMirror,
} from './starfield.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(__dirname, 'starfield.ts'), 'utf8');

describe('#738 starfield — 미학 상수 SSoT (ADR §결정 — drift 가드)', () => {
  // ADR 박제값. 값 변경은 Amendment 의무 (이 단언이 fail 하면 ADR 와 drift).
  it('inverted sphere 형상 상수', () => {
    expect(STARFIELD_SPHERE_DIAMETER).toBe(1000);
    expect(STARFIELD_SPHERE_SEGMENTS).toBe(16);
  });

  it('별 격자 밀도 / 유무 임계 (measurement-first 박제)', () => {
    expect(STARFIELD_GRID_DENSITY).toBe(240);
    expect(STARFIELD_THRESHOLD).toBeGreaterThan(0.9);
    expect(STARFIELD_THRESHOLD).toBeLessThan(1.0);
  });

  it('은하수 법선은 단위 벡터 근사 (정규화 전 합리 범위)', () => {
    const [x, y, z] = MILKY_WAY_NORMAL;
    const len = Math.hypot(x, y, z);
    // shader 가 normalize 하므로 정확히 1 일 필요 없으나, 0 벡터/극단값 방어.
    expect(len).toBeGreaterThan(0.5);
    expect(len).toBeLessThan(2.0);
  });

  it('은하수 발광은 미묘 (네온 금지 — §5 시각 품질)', () => {
    expect(MILKY_WAY_GLOW_INTENSITY).toBeGreaterThan(0);
    // 과도한 발광 (네온) 금지 — 0.5 미만 (미묘한 산광).
    expect(MILKY_WAY_GLOW_INTENSITY).toBeLessThan(0.5);
    expect(MILKY_WAY_BAND_WIDTH).toBeGreaterThan(0);
    expect(MILKY_WAY_BAND_WIDTH).toBeLessThan(1.0);
  });
});

describe('#738 starfield — mesh/material 계약 markers (ADR §결정 1/5/6 정적 가드)', () => {
  // ADR §결정 1 — infiniteDistance (floating-origin/tier/줌 불변, 엔진 레벨).
  it('mesh.infiniteDistance = true 박제', () => {
    expect(SOURCE).toMatch(/mesh\.infiniteDistance\s*=\s*true/);
  });

  // ADR §결정 6 — picking 비간섭 (#713 raycast 별 hit 0).
  it('mesh.isPickable = false 박제', () => {
    expect(SOURCE).toMatch(/mesh\.isPickable\s*=\s*false/);
  });

  // ADR §결정 5 — background queue (별이 가장 먼저 → 모든 body/orbit/ring 이 덮어씀).
  it('mesh.renderingGroupId = 0 박제 (background queue)', () => {
    expect(SOURCE).toMatch(/mesh\.renderingGroupId\s*=\s*0/);
  });

  // ADR §결정 5 (cross-validate 갱신) — depth write off (Early-Z 보존).
  it('material.disableDepthWrite = true 박제 (Early-Z 보존)', () => {
    expect(SOURCE).toMatch(/disableDepthWrite\s*=\s*true/);
  });

  // ADR §결정 5 cross-validate — gl_FragDepth 미사용 (Early-Z 최적화 보존, ring-shader 와 대비).
  it('gl_FragDepth 미사용 (cross-validate 갱신 — render order 로 해결)', () => {
    expect(STARFIELD_FRAGMENT_SHADER).not.toContain('gl_FragDepth');
    expect(STARFIELD_VERTEX_SHADER).not.toContain('gl_FragDepth');
  });

  it('vertex shader 가 view direction 을 fragment 로 전달 (UV 미사용 — aspect 왜곡 0)', () => {
    expect(STARFIELD_VERTEX_SHADER).toContain('varying vec3 vDirection');
    // UV attribute 미사용 — view direction 기반 (resize/aspect 왜곡 0, ADR §결정 1 cross-validate 3).
    expect(STARFIELD_VERTEX_SHADER).not.toContain('attribute vec2 uv');
  });

  it('fragment shader 가 은하수 띠 + 별 셀 noise 합성 (단일 draw call — ADR §결정 3)', () => {
    expect(STARFIELD_FRAGMENT_SHADER).toContain('milkyWay');
    expect(STARFIELD_FRAGMENT_SHADER).toContain('gridDensity');
    expect(STARFIELD_FRAGMENT_SHADER).toContain('hash33');
  });
});

describe('#738 starfield — 색온도 anti-pattern 부재 (ADR §결정 4 — Originality)', () => {
  // §결정 4 — 다수 백색~담황 + 소수 청백/적황. 보라/마젠타 그라데이션 금지.
  it('starColorMirror: t 전 구간에서 보라/마젠타 부재 (R+B 동시 우세 & G 결핍 금지)', () => {
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const [r, g, b] = starColorMirror(t);
      // 보라/마젠타 = R, B 높고 G 낮음. 별색은 G 가 항상 R 와 B 사이 또는 그 이상이어야 (백색 근처).
      // 마젠타 판정: G 가 min(R,B) 보다 현저히 낮으면 안 됨.
      expect(g).toBeGreaterThanOrEqual(Math.min(r, b) - 1e-6);
    }
  });

  it('starColorMirror: 모든 채널 [0,1] 범위 내', () => {
    for (let i = 0; i <= 20; i++) {
      const [r, g, b] = starColorMirror(i / 20);
      for (const c of [r, g, b]) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });

  it('starColorMirror: 양 끝이 적황(warm)/청백(cool), 중앙이 백색', () => {
    const warm = starColorMirror(0);
    const white = starColorMirror(0.5);
    const cool = starColorMirror(1);
    // 적황: R > B (따뜻).
    expect(warm[0]).toBeGreaterThan(warm[2]);
    // 청백: B > R (차가움).
    expect(cool[2]).toBeGreaterThan(cool[0]);
    // 백색: R ≈ B (저채도, 거의 백색).
    expect(Math.abs(white[0] - white[2])).toBeLessThan(0.1);
  });

  it('은하수 발광 색조도 저채도 (보라/마젠타 부재)', () => {
    const [r, g, b] = MILKY_WAY_GLOW_COLOR;
    // 담청백 — G 가 min(R,B) 이상 (마젠타 부재).
    expect(g).toBeGreaterThanOrEqual(Math.min(r, b) - 1e-6);
  });
});
