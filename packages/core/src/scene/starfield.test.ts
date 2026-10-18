/**
 * #738 — 은하수 배경 구 단위 테스트. #1373 (ADR `20261018-1373` 결정 R4) 로 재작성 — 절차 별 셀 경로가 지워지고
 * 띠 법선이 은하 북극 장면 방향이 됐다. 별 (색 · 크기 · 위치) 은 `star-catalog-data.test.ts` · `star-catalog.test.ts`.
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
import { toScene } from '../coords/scene-handedness.js';
import { equatorialJ2000ToEcliptic } from '../coords/equatorial.js';
import {
  STARFIELD_SPHERE_DIAMETER,
  STARFIELD_SPHERE_SEGMENTS,
  MILKY_WAY_NORMAL,
  MILKY_WAY_GLOW_INTENSITY,
  MILKY_WAY_BAND_WIDTH,
  MILKY_WAY_GLOW_COLOR,
  STARFIELD_VERTEX_SHADER,
  STARFIELD_FRAGMENT_SHADER,
} from './starfield.js';
import { STAR_CATALOG_RADIUS } from './star-catalog.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(__dirname, 'starfield.ts'), 'utf8');

describe('#738 starfield — 미학 상수 SSoT (ADR §결정 — drift 가드)', () => {
  // ADR 박제값. 값 변경은 Amendment 의무 (이 단언이 fail 하면 ADR 와 drift).
  it('inverted sphere 형상 상수', () => {
    expect(STARFIELD_SPHERE_DIAMETER).toBe(1000);
    expect(STARFIELD_SPHERE_SEGMENTS).toBe(16);
  });

  it('#1373 R4 — 은하수 법선 = 은하 북극 (RA 192.85948° · Dec +27.12825°) 장면 방향 (ADR §축 M 기대값)', () => {
    const [x, y, z] = MILKY_WAY_NORMAL;
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 12);
    // ADR 1373 §축 M — `(−0.86767, −0.00035, −0.49715)` (5자리 반올림).
    expect(x).toBeCloseTo(-0.86767, 4);
    expect(y).toBeCloseTo(-0.00035, 4);
    expect(z).toBeCloseTo(-0.49715, 4);
    // 같은 변환 경로 (적도 → 황도 데이터 → toScene) 를 거친다 — 장면 경계 z 반전 (ADR 1366).
    expect(MILKY_WAY_NORMAL).toEqual(toScene(equatorialJ2000ToEcliptic(192.85948, 27.12825)));
  });

  it('#1373 R4 — 결함판 판별: z 반전을 빠뜨린 법선 · 구 임의 법선과는 수십 도 어긋난다', () => {
    const angle = (a: readonly number[], b: readonly number[]) =>
      (Math.acos(
        Math.abs(a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!) /
          (Math.hypot(...a) * Math.hypot(...b)),
      ) *
        180) /
      Math.PI;
    const noFlip = equatorialJ2000ToEcliptic(192.85948, 27.12825);
    expect(angle(MILKY_WAY_NORMAL, noFlip)).toBeGreaterThan(30);
    expect(angle(MILKY_WAY_NORMAL, [0.2, 0.92, 0.34])).toBeGreaterThan(30);
  });

  it('#1373 D7 — 별 쿼드 반지름은 은하수 구 안쪽 (< 500)', () => {
    expect(STAR_CATALOG_RADIUS).toBeLessThan(STARFIELD_SPHERE_DIAMETER / 2);
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

  it('#1373 R4 — fragment 는 은하수 띠만 (절차 별 셀 경로 삭제 — 실제 하늘에 없는 별 0)', () => {
    expect(STARFIELD_FRAGMENT_SHADER).toContain('milkyWay');
    // 구름 결 fbm 은 남는다 (hash33 → valueNoise).
    expect(STARFIELD_FRAGMENT_SHADER).toContain('fbm');
    // 별 셀 경로 표지 — 격자 밀도 · 임계 · 셀 색온도 · 점 falloff.
    expect(STARFIELD_FRAGMENT_SHADER).not.toContain('gridDensity');
    expect(STARFIELD_FRAGMENT_SHADER).not.toContain('starThreshold');
    expect(STARFIELD_FRAGMENT_SHADER).not.toContain('starColor');
    expect(STARFIELD_FRAGMENT_SHADER).not.toContain('pointFalloff');
    expect(SOURCE).not.toMatch(/setFloat\('gridDensity'/);
  });
});

describe('#738 starfield — 은하수 색조 anti-pattern 부재 (ADR 738 §결정 4 — Originality)', () => {
  // 별 색 (B−V → RGB) 의 보라/마젠타 부재 단언은 #1373 `star-catalog-data.test.ts` (bvToRgb) 로 이어진다.
  it('은하수 발광 색조도 저채도 (보라/마젠타 부재)', () => {
    const [r, g, b] = MILKY_WAY_GLOW_COLOR;
    // 담청백 — G 가 min(R,B) 이상 (마젠타 부재).
    expect(g).toBeGreaterThanOrEqual(Math.min(r, b) - 1e-6);
  });
});
