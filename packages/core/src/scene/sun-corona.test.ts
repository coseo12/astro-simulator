/**
 * #1335 — 태양 코로나 순수 함수 · GLSL 정적 계약 (ADR `20261014-1335` 결정 1 · 3 · 7 · §교차검증 합의 1 · 이견 2, DoD D6 · D9).
 *
 *  1. 반경 프로파일 미러 — ρ = 1 최대 (= 1) · 단조 감소 · ρ_out 에서 0 · 범위 밖 0 (discard 경계).
 *  2. 반경식 · 각반경 · 펼침 — `lowerRadiusLimit` 근접 (d/R ≈ 1.05) 과 태양 안 (d ≤ R) 에서 유한 (D7 의 정적 짝).
 *  3. 각도 상한 — 화면 대각 반시야각 (기본 fov · 1280×800 ≈ 38.6°) 보다 크고 π/2 보다 작다 (§교차검증 이견 2 구현 계약).
 *     상한 페이드 (ADR Amendment 1) — 시작각이 대각 반시야각보다 크고, 상한에서 기여 0.
 *  4. 고리 기하 — 정점 수 · 매개변수 범위 · 인덱스 범위.
 *  5. GLSL 정적 — 시간 · jd uniform 없음 (D6) · acos clamp (합의 1) · switch 없음 · 상수가 셰이더 텍스트에 실린다.
 */
import { describe, expect, it } from 'vitest';
import { ArcRotateCamera, Constants, Mesh, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import {
  baumbachProfile,
  buildSunCoronaGeometry,
  coronaAngleCapFadeMirror,
  coronaAngularRadius,
  coronaEquatorMirror,
  coronaProfileMirror,
  coronaSpreadRadius,
  coronaStreamerMirror,
  createSunCorona,
  sunCoronaFrame,
  CORONA_ANGLE_CAP_FADE_RAD,
  CORONA_ANGLE_CAP_RAD,
  CORONA_DISPLAY_GAMMA,
  CORONA_OUTER_RHO,
  CORONA_SEGMENTS,
  CORONA_STREAMER_AMPLITUDE,
  SUN_CORONA_FRAGMENT_SHADER,
  SUN_CORONA_MESH_NAME,
  SUN_CORONA_VERTEX_SHADER,
} from './sun-corona.js';

/** 앱 기준 뷰포트 (ADR 1-A 실측 환경). */
const VIEW_W = 1280;
const VIEW_H = 800;

describe('#1335 반경 프로파일 미러 (결정 3, D9)', () => {
  it('Baumbach 형태는 ρ = 1 에서 1 로 정규화된다', () => {
    expect(baumbachProfile(1)).toBeCloseTo(1, 12);
  });

  it('ADR 계산값 재현 — f(1.5) ≈ 0.026 · f(2) ≈ 0.0051 · f(2)^γ ≈ 0.205 · f(3)^γ ≈ 0.126', () => {
    expect(baumbachProfile(1.5)).toBeCloseTo(0.026, 3);
    expect(baumbachProfile(2)).toBeCloseTo(0.0051, 4);
    expect(Math.pow(baumbachProfile(2), CORONA_DISPLAY_GAMMA)).toBeCloseTo(0.205, 3);
    expect(Math.pow(baumbachProfile(3), CORONA_DISPLAY_GAMMA)).toBeCloseTo(0.126, 3);
  });

  it('ρ = 1 최대 (= 1) · [1, ρ_out] 에서 strict 단조 감소 · ρ_out 에서 0', () => {
    expect(coronaProfileMirror(1)).toBeCloseTo(1, 12);
    const N = 200;
    let prev = coronaProfileMirror(1);
    for (let i = 1; i <= N; i += 1) {
      const rho = 1 + ((CORONA_OUTER_RHO - 1) * i) / N;
      const cur = coronaProfileMirror(rho);
      expect(cur, `ρ=${rho}`).toBeLessThan(prev);
      prev = cur;
    }
    expect(coronaProfileMirror(CORONA_OUTER_RHO)).toBe(0);
  });

  it('범위 밖 (disk 안쪽 · ρ_out 바깥 · NaN) 은 0 — fragment discard 경계와 같다', () => {
    for (const rho of [0, 0.5, 0.999, CORONA_OUTER_RHO + 1e-9, 10, Number.NaN]) {
      expect(coronaProfileMirror(rho), `ρ=${rho}`).toBe(0);
    }
  });

  it('스트리머 배율은 1 ± 진폭 안 · 방향에 따라 실제로 변한다 (등방 아님)', () => {
    const vals: number[] = [];
    for (let i = 0; i < 64; i += 1) {
      const phi = (i / 64) * 2 * Math.PI;
      vals.push(coronaStreamerMirror([Math.cos(phi), Math.sin(phi), 0]));
    }
    for (const v of vals) {
      expect(v).toBeGreaterThanOrEqual(1 - CORONA_STREAMER_AMPLITUDE);
      expect(v).toBeLessThanOrEqual(1 + CORONA_STREAMER_AMPLITUDE);
    }
    expect(Math.max(...vals) - Math.min(...vals)).toBeGreaterThan(0.05);
  });

  it('적도 집중 — 적도 (e_z = 0) 가 극 (|e_z| = 1) 보다 밝거나 같다 (Q1 (c))', () => {
    expect(coronaEquatorMirror([1, 0, 0])).toBe(1);
    expect(coronaEquatorMirror([0, 0, 1])).toBeLessThanOrEqual(coronaEquatorMirror([1, 0, 0]));
    expect(coronaEquatorMirror([0, 0, -1])).toBe(coronaEquatorMirror([0, 0, 1]));
  });
});

describe('#1335 반경식 · 각반경 · 펼침 (결정 1 · 2, D7 정적 짝)', () => {
  it('반경 = 반경(m) × 기록 스케일 · 중심 = 태양 위치 그대로', () => {
    const f = sunCoronaFrame([1.5, -2, 3], 6.957e8 * 50, 1e-10);
    expect(f.center).toEqual([1.5, -2, 3]);
    expect(f.radius).toBeCloseTo(6.957e8 * 50 * 1e-10, 12);
  });

  it('각반경 — d/R = 11.978 (기본 화면) 에서 asin(R/d), 태양 안 · d = 0 은 π/2 포화', () => {
    expect(coronaAngularRadius(11.978, 1)).toBeCloseTo(Math.asin(1 / 11.978), 12);
    expect(coronaAngularRadius(0.5, 1)).toBe(Math.PI / 2);
    expect(coronaAngularRadius(0, 1)).toBe(Math.PI / 2);
  });

  it('펼침 반경 — 안쪽 테두리의 시선각은 정확히 α (평면 거리 L 에서 L·tan α)', () => {
    const d = 8.66;
    const R = 1;
    const L = d + CORONA_OUTER_RHO * R;
    const inner = coronaSpreadRadius(d, R, 1);
    expect(Math.atan(inner / L)).toBeCloseTo(coronaAngularRadius(d, R), 12);
    expect(coronaSpreadRadius(d, R, CORONA_OUTER_RHO)).toBeGreaterThan(inner);
  });

  it('lowerRadiusLimit 근접 (d/R 1.05) · 태양 안 · 원거리에서 전부 유한 (NaN · Infinity 없음)', () => {
    for (const dOverR of [1e-6, 0.5, 1, 1.0001, 1.05, 1.549, 6.831, 11.978, 1e6]) {
      for (const rho of [1, CORONA_OUTER_RHO]) {
        const v = coronaSpreadRadius(dOverR, 1, rho);
        expect(Number.isFinite(v), `d/R=${dOverR} ρ=${rho}`).toBe(true);
        expect(v).toBeGreaterThan(0);
      }
    }
  });
});

/** 화면 대각 반시야각 — 기본 fov 는 Babylon 카메라 기본값에서 읽는다 (하드코딩 금지 — tier-transition.ts:65 의 0.8 rad). */
function diagonalHalfAngle(): number {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const fov = new ArcRotateCamera('c', 0, 0, 1, Vector3.Zero(), scene).fov;
  scene.dispose();
  engine.dispose();
  const aspect = VIEW_W / VIEW_H;
  return Math.atan(Math.tan(fov / 2) * Math.sqrt(1 + aspect * aspect));
}

describe('#1335 각도 상한 계약 (§교차검증 이견 2 — D9)', () => {
  it('화면 대각 반시야각 (Babylon 기본 fov · 1280×800 ≈ 38.6°) 보다 크고 π/2 보다 작다', () => {
    const diag = diagonalHalfAngle();
    expect((diag * 180) / Math.PI).toBeCloseTo(38.6, 1);
    expect(CORONA_ANGLE_CAP_RAD).toBeGreaterThan(diag);
    expect(CORONA_ANGLE_CAP_RAD).toBeLessThan(Math.PI / 2);
  });
});

describe('#1335 각도 상한 페이드 (ADR Amendment 1 — D-T2)', () => {
  it('페이드 시작각 (상한 − 폭) 은 화면 대각 반시야각보다 크다 — 태양을 보는 화면에는 걸리지 않는다', () => {
    expect(CORONA_ANGLE_CAP_FADE_RAD).toBeGreaterThan(0);
    expect(CORONA_ANGLE_CAP_RAD - CORONA_ANGLE_CAP_FADE_RAD).toBeGreaterThan(diagonalHalfAngle());
    // 시작각 이하에서는 정확히 1 (곱해도 값이 바뀌지 않는다).
    expect(coronaAngleCapFadeMirror(CORONA_ANGLE_CAP_RAD - CORONA_ANGLE_CAP_FADE_RAD)).toBe(1);
    expect(coronaAngleCapFadeMirror(diagonalHalfAngle())).toBe(1);
  });

  it('상한각에서 기여 0 · 시작각 → 상한 사이 단조 비증가', () => {
    expect(coronaAngleCapFadeMirror(CORONA_ANGLE_CAP_RAD)).toBe(0);
    expect(coronaAngleCapFadeMirror(CORONA_ANGLE_CAP_RAD + 0.1)).toBe(0);
    const start = CORONA_ANGLE_CAP_RAD - CORONA_ANGLE_CAP_FADE_RAD;
    let prev = 1;
    for (let i = 0; i <= 100; i += 1) {
      const v = coronaAngleCapFadeMirror(start + (CORONA_ANGLE_CAP_FADE_RAD * i) / 100);
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
  });

  it('GLSL — fragment 가 같은 smoothstep 식으로 기여에 곱한다', () => {
    expect(SUN_CORONA_FRAGMENT_SHADER).toContain(
      `const float ANGLE_CAP_FADE = ${CORONA_ANGLE_CAP_FADE_RAD.toFixed(6)};`,
    );
    expect(SUN_CORONA_FRAGMENT_SHADER).toContain(
      'float capFade = 1.0 - smoothstep(ANGLE_CAP - ANGLE_CAP_FADE, ANGLE_CAP, theta);',
    );
    expect(SUN_CORONA_FRAGMENT_SHADER).toMatch(/equator \* capFade\)/);
  });
});

describe('#1335 고리 기하 (결정 1, D9)', () => {
  it('정점 = (분절 + 1) × 2 · 삼각형 = 분절 × 2 · 매개변수 u ∈ [0,1] · v ∈ {0,1} · z = 0', () => {
    const { positions, indices } = buildSunCoronaGeometry();
    const vertexCount = positions.length / 3;
    expect(vertexCount).toBe((CORONA_SEGMENTS + 1) * 2);
    expect(indices.length).toBe(CORONA_SEGMENTS * 6);
    const us = new Set<number>();
    for (let i = 0; i < vertexCount; i += 1) {
      const u = positions[i * 3]!;
      const v = positions[i * 3 + 1]!;
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
      expect([0, 1]).toContain(v);
      expect(positions[i * 3 + 2]).toBe(0);
      us.add(u);
    }
    // 이음매 — u = 0 과 u = 1 이 둘 다 있어 둘레가 닫힌다.
    expect(us.has(0)).toBe(true);
    expect(us.has(1)).toBe(true);
    for (const idx of indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(vertexCount);
    }
  });
});

describe('#1335 GLSL 정적 계약 (D6 · 합의 1)', () => {
  const uniformNames = (src: string): string[] =>
    [...src.matchAll(/^\s*uniform\s+\w+\s+(\w+)\s*;/gm)].map((m) => m[1]!);

  it('D6 — 시간 · jd uniform 없음 (셰이더 텍스트 · 머티리얼 uniform 목록 모두)', () => {
    const names = [
      ...uniformNames(SUN_CORONA_VERTEX_SHADER),
      ...uniformNames(SUN_CORONA_FRAGMENT_SHADER),
    ];
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) expect(n, n).not.toMatch(/time|jd|julian|day|phase/i);
    // 머티리얼 uniform 목록 쪽은 아래 createSunCorona 테스트가 단언한다.
  });

  it('합의 1 — fragment 의 acos 는 정의역 clamp 를 거친다', () => {
    expect(SUN_CORONA_FRAGMENT_SHADER).toContain('acos(clamp(cosAngle, -1.0, 1.0))');
    expect(SUN_CORONA_FRAGMENT_SHADER).not.toMatch(/acos\((?!clamp)/);
  });

  it('ρ 판정은 fragment 에서 · disk 안쪽 (ρ < 1) 과 ρ_out 바깥을 discard', () => {
    expect(SUN_CORONA_FRAGMENT_SHADER).toContain('if (rho < 1.0 || rho > RHO_OUT)');
    expect(SUN_CORONA_FRAGMENT_SHADER).toContain('discard;');
  });

  it('switch 없음 (WGSL 변환 — if-else 만)', () => {
    expect(SUN_CORONA_VERTEX_SHADER).not.toMatch(/\bswitch\b/);
    expect(SUN_CORONA_FRAGMENT_SHADER).not.toMatch(/\bswitch\b/);
  });

  it('상수가 셰이더 텍스트에 실린다 (미러와 같은 값)', () => {
    expect(SUN_CORONA_VERTEX_SHADER).toContain(
      `const float RHO_OUT = ${CORONA_OUTER_RHO.toFixed(6)};`,
    );
    expect(SUN_CORONA_FRAGMENT_SHADER).toContain(
      `const float RHO_OUT = ${CORONA_OUTER_RHO.toFixed(6)};`,
    );
    expect(SUN_CORONA_VERTEX_SHADER).toContain(
      `const float ANGLE_CAP = ${CORONA_ANGLE_CAP_RAD.toFixed(6)};`,
    );
    expect(SUN_CORONA_FRAGMENT_SHADER).toContain(
      `const float DISPLAY_GAMMA = ${CORONA_DISPLAY_GAMMA.toFixed(6)};`,
    );
  });

  it('펼침 평면은 코로나 구 뒷면 (d + ρ_out·R — 결정 2 · 축 2 (ii))', () => {
    expect(SUN_CORONA_VERTEX_SHADER).toContain('float planeDist = d + RHO_OUT * uSunRadius;');
  });
});

describe('#1335 createSunCorona — 메시 · 머티리얼 속성 (결정 1)', () => {
  it('이름 · 비선택 · alphaIndex 0 · ALPHA_ADD · depth write off · 컬링 off · 시간 uniform 없음', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    scene.activeCamera = new ArcRotateCamera('c', 0, 1, 10, Vector3.Zero(), scene);
    const sunMesh = new Mesh('sun-stub', scene);
    sunMesh.position.set(1, 2, 3);
    const corona = createSunCorona(scene, {
      sunMesh,
      radiusMeters: 2,
      frameProvider: () => ({ originX: 0, originY: 0, originZ: 0, scale: 0.25 }),
    });
    expect(corona.mesh.name).toBe(SUN_CORONA_MESH_NAME);
    expect(corona.mesh.isPickable).toBe(false);
    expect(corona.mesh.alphaIndex).toBe(0);
    expect(corona.mesh.alwaysSelectAsActiveMesh).toBe(true);
    expect(corona.material.disableDepthWrite).toBe(true);
    expect(corona.material.backFaceCulling).toBe(false);
    expect(corona.material.alphaMode).toBe(Constants.ALPHA_ADD);
    const uniforms = (corona.material.options as { uniforms: string[] }).uniforms;
    for (const n of uniforms) expect(n).not.toMatch(/time|jd|julian/i);
    const u = corona.readFrameUniforms()!;
    expect(u.center).toEqual([1, 2, 3]);
    expect(u.radius).toBe(0.5);
    expect(u.scale).toBe(0.25);
    // observer 는 uniform 갱신 1개뿐 — isVisible 을 쓰지 않는다 (결정 4).
    corona.mesh.isVisible = false;
    corona.applyFrameUniforms();
    expect(corona.mesh.isVisible).toBe(false);
    corona.mesh.isVisible = true;
    corona.applyFrameUniforms();
    expect(corona.mesh.isVisible).toBe(true);
    corona.dispose();
    expect(scene.getMeshByName(SUN_CORONA_MESH_NAME)).toBeNull();
    scene.dispose();
    engine.dispose();
  });
});
