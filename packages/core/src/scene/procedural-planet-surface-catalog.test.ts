/**
 * #1419 — 지구 밖 천체 표면 카탈로그 (ADR `docs/decisions/20261030-1419-body-surface-catalog.md`).
 *
 * 검증 축 (ADR §DoD 5):
 *   1. 테이블 집합 — 크레이터 · 패턴 테이블 키 == 소비 타입 body (양방향) + 정확한 집합.
 *   2. 불변식 — §5-A 동결값 · `depth` 범위 `−1 ≤ depth < 1` · 보조색 `[0,1]` · 달 행 = 기존 상수 참조.
 *   3. 누락 · 초과 · 타입 불일치 시 throw (기본값 fallback 금지).
 *   4. Icy `lineCount` 정수 `0 ≤ n ≤ 12` (GLSL 루프 상한 상수와 같은 값).
 *   5. 정적 분석 — GLSL 루프 상수 상한 · uniform 4중 SSoT · 예약어 · 분기 수식 · 밤면 자체 발광 없음.
 *   6. 바인딩 (NullEngine) — 등록 body 전건의 uniform == 해석 함수 결과 + high · mid variant 의 uniform
 *      동일 (§5-5 — `createBodyMesh` · `createBodyMeshMid` 경유).
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ArcRotateCamera, NullEngine, Scene, Vector3, type ShaderMaterial } from '@babylonjs/core';
import type { LoadedCelestialBody } from '../ephemeris/solar-system-loader.js';
import { createBodyMesh, createBodyMeshMid } from './body-mesh-factory.js';
import {
  CRATER_DENSITY,
  CRATER_DEPTH,
  CRATER_DEPTH_MAX_EXCLUSIVE,
  CRATER_DEPTH_MIN,
  CRATER_TERRAIN_AMP,
  ICY_MAX_LINE_COUNT,
  MOON_CRATER_PARAMS,
  PATTERN_SURFACE_TYPES,
  PLANET_FRAGMENT_SHADER,
  SURFACE_CRATER_PARAMS_BY_BODY,
  SURFACE_PATTERN_PARAMS_BY_BODY,
  SURFACE_TYPE_BY_BODY,
  SurfaceType,
  createProceduralPlanetMaterial,
  packPatternParams,
  resolveSurfaceCraterParams,
  resolveSurfacePatternParams,
  type IcyPatternParams,
  type SurfaceCraterParams,
} from './procedural-planet-shader.js';

const sorted = (xs: Iterable<string>): string[] => [...xs].sort();

const bodiesOfType = (pred: (t: SurfaceType) => boolean): string[] =>
  Object.entries(SURFACE_TYPE_BY_BODY)
    .filter(([, t]) => pred(t))
    .map(([id]) => id);

/** GLSL 주석을 지운 코드 줄만 — 주석 속 예시가 정적 검사에 매칭되지 않게. */
const FRAGMENT_CODE = PLANET_FRAGMENT_SHADER.split('\n')
  .map((line) => line.replace(/\/\/.*$/, ''))
  .join('\n');

/** `} else if (uSurfaceType == N) {` 부터 다음 `} else if` 또는 분기 사슬 끝 `}` 까지의 본문. */
function branchBody(n: number): string {
  const start = FRAGMENT_CODE.indexOf(`} else if (uSurfaceType == ${n}) {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = FRAGMENT_CODE.slice(start + 1);
  const next = rest.search(/\n {2}\}/);
  expect(next).toBeGreaterThan(0);
  return rest.slice(0, next);
}

describe('#1419 테이블 집합 — 소비 타입 body 만 행을 가진다 (양방향)', () => {
  it('keys(SURFACE_CRATER_PARAMS_BY_BODY) == { id | type == Cratered } · 정확한 집합', () => {
    const derived = bodiesOfType((t) => t === SurfaceType.Cratered);
    expect(derived.length).toBeGreaterThan(0);
    expect(sorted(Object.keys(SURFACE_CRATER_PARAMS_BY_BODY))).toEqual(sorted(derived));
    expect(sorted(derived)).toEqual(['callisto', 'ganymede', 'mercury', 'moon']);
  });

  it('keys(SURFACE_PATTERN_PARAMS_BY_BODY) == { id | type ∈ {Volcanic, Icy} } · 정확한 집합', () => {
    expect(sorted([...PATTERN_SURFACE_TYPES].map(String))).toEqual(
      sorted([SurfaceType.Volcanic, SurfaceType.Icy].map(String)),
    );
    const derived = bodiesOfType((t) => PATTERN_SURFACE_TYPES.has(t));
    expect(derived.length).toBeGreaterThan(0);
    expect(sorted(Object.keys(SURFACE_PATTERN_PARAMS_BY_BODY))).toEqual(sorted(derived));
    expect(sorted(derived)).toEqual(['europa', 'io']);
  });

  it('패턴 행의 type == 등록 타입 (판별 필드와 SURFACE_TYPE_BY_BODY 의 일치)', () => {
    for (const [id, row] of Object.entries(SURFACE_PATTERN_PARAMS_BY_BODY)) {
      expect(row.type, id).toBe(SURFACE_TYPE_BY_BODY[id]);
    }
  });

  it('등록 body 전건이 throw 없이 해석된다 — 비-Cratered 는 달 값 · 비-패턴은 null', () => {
    const entries = Object.entries(SURFACE_TYPE_BY_BODY);
    for (const [id, type] of entries) {
      const crater = resolveSurfaceCraterParams(id, type);
      const pattern = resolveSurfacePatternParams(id, type);
      if (type === SurfaceType.Cratered) expect(crater).toBe(SURFACE_CRATER_PARAMS_BY_BODY[id]);
      else expect(crater).toBe(MOON_CRATER_PARAMS);
      if (PATTERN_SURFACE_TYPES.has(type)) expect(pattern).toBe(SURFACE_PATTERN_PARAMS_BY_BODY[id]);
      else expect(pattern).toBeNull();
    }
  });
});

describe('#1419 §5-A 동결값 (사용자 결정 2026-10-30 — 안 1)', () => {
  it('크레이터 3 body', () => {
    expect(SURFACE_CRATER_PARAMS_BY_BODY.mercury).toEqual({
      density: 14,
      depth: 0.4,
      terrainAmp: 0.15,
      regionAmp: 0.12,
      regionFreq: 2.0,
      albedo: 0.68,
    });
    expect(SURFACE_CRATER_PARAMS_BY_BODY.callisto).toEqual({
      density: 22,
      depth: -0.7,
      terrainAmp: 0.12,
      regionAmp: 0,
      regionFreq: 2.0,
      albedo: 0.69,
    });
    expect(SURFACE_CRATER_PARAMS_BY_BODY.ganymede).toEqual({
      density: 12,
      depth: -0.4,
      terrainAmp: 0.12,
      regionAmp: 0.3,
      regionFreq: 2.0,
      albedo: 0.61,
    });
  });

  it('패턴 2 body (io Volcanic · europa Icy)', () => {
    expect(SURFACE_PATTERN_PARAMS_BY_BODY.io).toEqual({
      type: SurfaceType.Volcanic,
      sulfurFreq: 3.0,
      sulfurAmp: 0.45,
      calderaFreq: 9.0,
      calderaAmp: 0.9,
      accentA: { r: 0.85, g: 0.45, b: 0.15 },
      accentB: { r: 0.12, g: 0.08, b: 0.05 },
      albedo: 0.4,
    });
    expect(SURFACE_PATTERN_PARAMS_BY_BODY.europa).toEqual({
      type: SurfaceType.Icy,
      mottleFreq: 2.5,
      mottleAmp: 0.35,
      lineWidth: 0.01,
      lineCount: 10,
      accentA: { r: 0.62, g: 0.42, b: 0.3 },
      accentB: { r: 0.55, g: 0.32, b: 0.22 },
      albedo: 0.45,
    });
  });

  it('달 행 == 기존 상수 · regionAmp 0 · albedo 1 (달 픽셀 불변의 전제)', () => {
    expect(SURFACE_CRATER_PARAMS_BY_BODY.moon).toBe(MOON_CRATER_PARAMS);
    expect(MOON_CRATER_PARAMS).toEqual({
      density: CRATER_DENSITY,
      depth: CRATER_DEPTH,
      terrainAmp: CRATER_TERRAIN_AMP,
      regionAmp: 0,
      regionFreq: 2.0,
      albedo: 1,
    });
    // #1419 이전 GLSL 리터럴 값 그대로 (추출 시 값 불변).
    expect(CRATER_TERRAIN_AMP).toBe(0.15);
  });

  it('달 행은 기존 상수 식별자를 참조한다 — 리터럴 사본 금지 (소스 정적 검사, volt #69)', () => {
    // 숫자 원시값은 런타임에서 참조와 사본을 구분할 수 없다 (PR #1276 리뷰 R1) — 선언 소스를 읽는다.
    const src = readFileSync(new URL('./procedural-planet-shader.ts', import.meta.url), 'utf8');
    const decl = src.match(
      /export const MOON_CRATER_PARAMS[^=]*=\s*Object\.freeze\(\{([\s\S]*?)\}\);/,
    );
    const body = (decl?.[1] ?? '').replace(/\/\/.*$/gm, '');
    expect(body.trim()).not.toBe('');
    const fields = Object.fromEntries(
      body
        .split(',')
        .map((part) => part.split(':').map((t) => t.trim()))
        .filter((kv) => kv.length === 2 && kv[0] !== ''),
    );
    expect(fields).toMatchObject({
      density: 'CRATER_DENSITY',
      depth: 'CRATER_DEPTH',
      terrainAmp: 'CRATER_TERRAIN_AMP',
    });
    const table = src.match(/export const SURFACE_CRATER_PARAMS_BY_BODY[^=]*=\s*\{([\s\S]*?)\n\};/);
    expect(table?.[1] ?? '').toMatch(/\n\s*moon:\s*MOON_CRATER_PARAMS,/);
  });
});

describe('#1419 §5-3 불변식 — depth 범위 · 보조색 · lineCount', () => {
  it(`크레이터 행 전건 ${CRATER_DEPTH_MIN} ≤ depth < ${CRATER_DEPTH_MAX_EXCLUSIVE} (음수 = 밝은 크레이터)`, () => {
    expect(CRATER_DEPTH_MIN).toBe(-1);
    expect(CRATER_DEPTH_MAX_EXCLUSIVE).toBe(1);
    const rows = Object.entries(SURFACE_CRATER_PARAMS_BY_BODY);
    expect(rows.length).toBeGreaterThan(0);
    for (const [id, row] of rows) {
      expect(row.depth, id).toBeGreaterThanOrEqual(CRATER_DEPTH_MIN);
      expect(row.depth, id).toBeLessThan(CRATER_DEPTH_MAX_EXCLUSIVE);
    }
    // 음수 depth 행이 실제로 있다 (범위 하한이 공허하지 않음 — callisto · ganymede).
    expect(rows.some(([, r]) => r.depth < 0)).toBe(true);
  });

  it('albedo 는 (0, 1] (렌더 배율 — 밝히는 방향 없음)', () => {
    const albedos = [
      ...Object.entries(SURFACE_CRATER_PARAMS_BY_BODY).map(([id, r]) => [id, r.albedo] as const),
      ...Object.entries(SURFACE_PATTERN_PARAMS_BY_BODY).map(([id, r]) => [id, r.albedo] as const),
    ];
    for (const [id, a] of albedos) {
      expect(a, id).toBeGreaterThan(0);
      expect(a, id).toBeLessThanOrEqual(1);
    }
  });

  it('보조색 {r,g,b} 각 성분 [0,1]', () => {
    for (const [id, row] of Object.entries(SURFACE_PATTERN_PARAMS_BY_BODY)) {
      for (const accent of [row.accentA, row.accentB]) {
        expect(Object.keys(accent).sort(), id).toEqual(['b', 'g', 'r']);
        for (const v of [accent.r, accent.g, accent.b]) {
          expect(v, id).toBeGreaterThanOrEqual(0);
          expect(v, id).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it(`Icy 행 전건 lineCount 는 정수 0 ≤ n ≤ ${ICY_MAX_LINE_COUNT}`, () => {
    expect(ICY_MAX_LINE_COUNT).toBe(12);
    const icy = Object.values(SURFACE_PATTERN_PARAMS_BY_BODY).filter(
      (r): r is IcyPatternParams => r.type === SurfaceType.Icy,
    );
    expect(icy.length).toBeGreaterThan(0);
    for (const row of icy) {
      expect(Number.isInteger(row.lineCount)).toBe(true);
      expect(row.lineCount).toBeGreaterThanOrEqual(0);
      expect(row.lineCount).toBeLessThanOrEqual(ICY_MAX_LINE_COUNT);
    }
  });
});

describe('#1419 packPatternParams — 명명 필드 → vec4 (§5-3 표)', () => {
  const ICY: IcyPatternParams = {
    type: SurfaceType.Icy,
    mottleFreq: 1,
    mottleAmp: 2,
    lineWidth: 3,
    lineCount: 4,
    accentA: { r: 0, g: 0, b: 0 },
    accentB: { r: 0, g: 0, b: 0 },
    albedo: 1,
  };

  it('Volcanic = (sulfurFreq, sulfurAmp, calderaFreq, calderaAmp)', () => {
    expect(packPatternParams(SURFACE_PATTERN_PARAMS_BY_BODY.io!)).toEqual([3.0, 0.45, 9.0, 0.9]);
  });

  it('Icy = (mottleFreq, mottleAmp, lineWidth, lineCount)', () => {
    expect(packPatternParams(SURFACE_PATTERN_PARAMS_BY_BODY.europa!)).toEqual([
      2.5, 0.35, 0.01, 10,
    ]);
    expect(packPatternParams(ICY)).toEqual([1, 2, 3, 4]);
  });

  it('Icy lineCount 경계 — 0 · 12 는 통과, 13 · −1 · 2.5 · NaN 은 throw', () => {
    expect(packPatternParams({ ...ICY, lineCount: 0 })[3]).toBe(0);
    expect(packPatternParams({ ...ICY, lineCount: ICY_MAX_LINE_COUNT })[3]).toBe(12);
    for (const bad of [ICY_MAX_LINE_COUNT + 1, -1, 2.5, Number.NaN]) {
      expect(() => packPatternParams({ ...ICY, lineCount: bad })).toThrow(/lineCount/);
    }
  });
});

describe('#1419 해석 함수 — 누락 · 초과 · 타입 불일치 throw (기본값 fallback 금지)', () => {
  const CR: SurfaceCraterParams = {
    density: 1,
    depth: 0.1,
    terrainAmp: 0.1,
    regionAmp: 0,
    regionFreq: 1,
    albedo: 1,
  };

  it('크레이터 누락 — Cratered 인데 행이 없으면 throw', () => {
    expect(() => resolveSurfaceCraterParams('mercury', SurfaceType.Cratered, {})).toThrow(
      /행이 없다/,
    );
  });

  it('크레이터 초과 — 비-Cratered 인데 행이 있으면 throw', () => {
    expect(() => resolveSurfaceCraterParams('io', SurfaceType.Volcanic, { io: CR })).toThrow(
      /행이 있다/,
    );
  });

  it('패턴 누락 — 패턴 타입인데 행이 없으면 throw', () => {
    expect(() => resolveSurfacePatternParams('europa', SurfaceType.Icy, {})).toThrow(/행이 없다/);
  });

  it('패턴 초과 — 비-패턴 타입인데 행이 있으면 throw', () => {
    const row = SURFACE_PATTERN_PARAMS_BY_BODY.io!;
    expect(() => resolveSurfacePatternParams('moon', SurfaceType.Cratered, { moon: row })).toThrow(
      /행이 있다/,
    );
  });

  it('패턴 타입 불일치 — Icy 로 등록됐는데 Volcanic 행이면 throw', () => {
    const row = SURFACE_PATTERN_PARAMS_BY_BODY.io!;
    expect(() => resolveSurfacePatternParams('europa', SurfaceType.Icy, { europa: row })).toThrow(
      /type/,
    );
  });

  it('프로토타입 키 (`toString`) 를 행으로 읽지 않는다 — 누락이 그대로 throw', () => {
    expect(() => resolveSurfaceCraterParams('toString', SurfaceType.Cratered, {})).toThrow(
      /행이 없다/,
    );
    expect(() => resolveSurfacePatternParams('toString', SurfaceType.Icy, {})).toThrow(/행이 없다/);
  });

  it('주입 테이블의 행을 그대로 돌려준다 (테이블 인자를 실제로 쓴다)', () => {
    expect(resolveSurfaceCraterParams('x', SurfaceType.Cratered, { x: CR })).toBe(CR);
  });
});

describe('#1419 정적 분석 — GLSL 분기 계약 (§5-4)', () => {
  it('Icy 루프 상한은 상수 12 · uniform 은 break 조건에만 (무한 루프 · TDR 경로 없음)', () => {
    const icy = branchBody(6);
    expect(icy).toContain(`for (int i = 0; i < ${ICY_MAX_LINE_COUNT}; i++) {`);
    expect(icy).toContain('for (int i = 0; i < 12; i++) {');
    expect(icy).toContain('if (float(i) >= patternParams.w) break;');
    // 루프 조건에 uniform 이 들어가면 상수 상한 계약이 깨진다.
    expect(icy).not.toMatch(/for \([^)]*patternParams/);
    expect(FRAGMENT_CODE.match(/for \(/g) ?? []).toHaveLength(1);
  });

  it('GLSL 예약어를 지역 변수명으로 쓰지 않는다 (M4 — `patch` 컴파일 실패)', () => {
    for (const reserved of ['patch', 'sample', 'filter', 'input', 'output']) {
      expect(FRAGMENT_CODE).not.toMatch(
        new RegExp(`\\b(float|vec2|vec3|vec4|int)\\s+${reserved}\\b`),
      );
    }
  });

  it('크레이터 분기 — 결 진폭은 uniform (리터럴 0.15 제거) · 지역 항 · albedo 곱', () => {
    const cr = branchBody(3);
    expect(cr).toContain('float terrain = (fbm(p * 5.0) - 0.5) * 2.0 * craterTerrainAmp;');
    expect(cr).toContain(
      'float region = (valueNoise(p * craterRegionFreq) - 0.5) * 2.0 * craterRegionAmp;',
    );
    expect(cr).toContain(
      'col = baseColor * surfaceAlbedo * (1.0 + terrain + region) * (1.0 - crater * craterDepth);',
    );
    expect(cr).not.toContain('0.15');
  });

  it('신규 분기의 noise 는 기존 fbm · valueNoise · hash33 만 (정의 사본 증가 0)', () => {
    expect(PLANET_FRAGMENT_SHADER.match(/float fbm\(/g) ?? []).toHaveLength(1);
    expect(PLANET_FRAGMENT_SHADER.match(/float valueNoise\(/g) ?? []).toHaveLength(1);
    expect(PLANET_FRAGMENT_SHADER.match(/vec3 hash33\(/g) ?? []).toHaveLength(1);
    const volcanic = branchBody(5);
    expect(volcanic.split('fbm(').length - 1).toBe(1);
    expect(volcanic).toContain('fbm(p * patternParams.x)');
    const icy = branchBody(6);
    expect(icy.split('fbm(').length - 1).toBe(2);
    expect(icy).toContain('fbm(p * patternParams.x)');
    expect(icy).toContain('fbm(p * patternParams.x * 1.7 + 7.0)');
  });

  it('밤면 자체 발광 없음 — 신규 분기는 col (반사율) 만 쓰고 rim · lights 를 대입하지 않는다', () => {
    for (const n of [5, 6]) {
      const b = branchBody(n);
      expect(b).toMatch(/col = \w+ \* surfaceAlbedo;/);
      expect(b).not.toMatch(/\brim\s*=/);
      expect(b).not.toMatch(/\blights\s*=/);
      expect(b).not.toContain('shade');
    }
    // 분기 사슬 뒤 공통 합성이 col 에 shade 를 **무조건** 곱한다 (보조색은 shade 곱 앞에만 들어간다).
    // 위치만 보면 `if (uSurfaceType < 5) col *= shade;` 변이를 놓친다 (PR #1421 리뷰 권고 1) — main()
    // 최상위 들여쓰기 (2칸) 의 조건 없는 단독 1줄이고, 정확히 1회임을 단언한다.
    const shadeLines = FRAGMENT_CODE.match(/^ {2}col \*= shade;$/gm) ?? [];
    expect(shadeLines).toHaveLength(1);
    expect(FRAGMENT_CODE.match(/col \*= shade/g) ?? []).toHaveLength(1);
    const chainEnd = FRAGMENT_CODE.indexOf('} else if (uSurfaceType == 6) {');
    const shadeMul = FRAGMENT_CODE.search(/^ {2}col \*= shade;$/m);
    expect(chainEnd).toBeGreaterThan(0);
    expect(shadeMul).toBeGreaterThan(chainEnd);
  });

  it('uniform 4중 SSoT — 신규 7종이 GLSL 선언 · uniforms 배열 · 바인딩에 모두 있다', () => {
    const decls: Array<[string, string]> = [
      ['float', 'craterTerrainAmp'],
      ['float', 'craterRegionAmp'],
      ['float', 'craterRegionFreq'],
      ['float', 'surfaceAlbedo'],
      ['vec3', 'patternAccentA'],
      ['vec3', 'patternAccentB'],
      ['vec4', 'patternParams'],
    ];
    for (const [type, name] of decls) {
      expect(PLANET_FRAGMENT_SHADER).toContain(`uniform ${type} ${name};`);
    }
    const src = readFileSync(new URL('./procedural-planet-shader.ts', import.meta.url), 'utf8');
    for (const [, name] of decls) {
      expect(src).toContain(`'${name}',`);
      expect(src).toMatch(new RegExp(`material\\.set(Float|Color3|Vector4)\\(\\s*'${name}'`));
    }
  });
});

// ─── 바인딩 (NullEngine) ────────────────────────────────────────────────────
// 마스크 placeholder 의 `DynamicTexture` 가 node 에서 `OffscreenCanvas` 를 만든다 — 2D 호출을 삼키는
// 스텁 (`procedural-planet-band-params.test.ts` 와 같은 처리. 텍스처 내용은 판정 대상 아님).
class StubOffscreenCanvas {
  constructor(
    public width: number,
    public height: number,
  ) {}
  getContext(): unknown {
    return new Proxy({} as Record<string | symbol, unknown>, {
      get: (target, key) =>
        key in target ? target[key] : () => ({ data: new Uint8ClampedArray(4) }),
      set: (target, key, value) => {
        target[key] = value;
        return true;
      },
    });
  }
}
const globalWithCanvas = globalThis as { OffscreenCanvas?: unknown };
let savedOffscreenCanvas: unknown;
beforeAll(() => {
  savedOffscreenCanvas = globalWithCanvas.OffscreenCanvas;
  globalWithCanvas.OffscreenCanvas = StubOffscreenCanvas;
});
afterAll(() => {
  globalWithCanvas.OffscreenCanvas = savedOffscreenCanvas;
});

interface BoundStores {
  _floats: Record<string, number>;
  _colors3: Record<string, { r: number; g: number; b: number }>;
  _vectors4: Record<string, { x: number; y: number; z: number; w: number }>;
}

describe('#1419 바인딩 — 등록 body 전건의 uniform == 해석 함수 결과 (NullEngine)', () => {
  it('크레이터 5 · albedo · 보조색 · patternParams', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    scene.activeCamera = new ArcRotateCamera('cam', 0, Math.PI / 2, 50, Vector3.Zero(), scene);
    try {
      const ids = Object.keys(SURFACE_TYPE_BY_BODY);
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) {
        const type = SURFACE_TYPE_BY_BODY[id]!;
        const body = { id, colorHint: { hex: '#808080' } } as unknown as LoadedCelestialBody;
        const m = createProceduralPlanetMaterial(scene, body, `${id}-catalog-mat`);
        expect(m).not.toBeNull();
        const s = m as unknown as BoundStores;
        const crater = resolveSurfaceCraterParams(id, type);
        const pattern = resolveSurfacePatternParams(id, type);
        expect(
          {
            depth: s._floats.craterDepth,
            density: s._floats.craterDensity,
            terrainAmp: s._floats.craterTerrainAmp,
            regionAmp: s._floats.craterRegionAmp,
            regionFreq: s._floats.craterRegionFreq,
          },
          id,
        ).toEqual({
          depth: crater.depth,
          density: crater.density,
          terrainAmp: crater.terrainAmp,
          regionAmp: crater.regionAmp,
          regionFreq: crater.regionFreq,
        });
        expect(s._floats.surfaceAlbedo, id).toBe(pattern?.albedo ?? crater.albedo);
        const v = s._vectors4.patternParams!;
        const a = s._colors3.patternAccentA!;
        const b = s._colors3.patternAccentB!;
        if (pattern) {
          expect([v.x, v.y, v.z, v.w], id).toEqual([...packPatternParams(pattern)]);
          expect({ r: a.r, g: a.g, b: a.b }, id).toEqual({ ...pattern.accentA });
          expect({ r: b.r, g: b.g, b: b.b }, id).toEqual({ ...pattern.accentB });
        } else {
          expect([v.x, v.y, v.z, v.w], id).toEqual([0, 0, 0, 0]);
          expect([a.r, a.g, a.b, b.r, b.g, b.b], id).toEqual([0, 0, 0, 0, 0, 0]);
        }
      }
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });

  it('비-Cratered body 의 크레이터 uniform = #1419 이전 바인딩 (달 상수) · albedo 1 (비-패턴)', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    scene.activeCamera = new ArcRotateCamera('cam', 0, Math.PI / 2, 50, Vector3.Zero(), scene);
    try {
      for (const id of ['earth', 'mars', 'jupiter', 'uranus', 'neptune', 'saturn']) {
        const body = { id, colorHint: { hex: '#808080' } } as unknown as LoadedCelestialBody;
        const s = createProceduralPlanetMaterial(
          scene,
          body,
          `${id}-neutral-mat`,
        ) as unknown as BoundStores;
        expect(s._floats.craterDepth, id).toBe(CRATER_DEPTH);
        expect(s._floats.craterDensity, id).toBe(CRATER_DENSITY);
        expect(s._floats.surfaceAlbedo, id).toBe(1);
      }
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });

  // §5-5 — high · mid 는 같은 생성 함수를 부른다는 구조 판독을 실행으로 확인한다 (PR #1421 리뷰 권고 2).
  // mid 에 다른 body 를 넘기는 변이 (`{ ...body, id: 'moon' }`) 는 여기서 FAIL 한다.
  it('high · mid variant 의 표면 uniform 이 같다 (createBodyMesh · createBodyMeshMid 경유)', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    scene.activeCamera = new ArcRotateCamera('cam', 0, Math.PI / 2, 50, Vector3.Zero(), scene);
    try {
      const ids = Object.keys(SURFACE_TYPE_BY_BODY);
      expect(ids.length).toBeGreaterThan(0);
      const snapshot = (mat: unknown) => {
        const s = mat as BoundStores & { _ints: Record<string, number>; getClassName(): string };
        expect(s.getClassName()).toBe('ShaderMaterial');
        const vec = (v: { x: number; y: number; z: number; w: number }) => [v.x, v.y, v.z, v.w];
        const rgb = (c: { r: number; g: number; b: number }) => [c.r, c.g, c.b];
        return {
          floats: { ...s._floats },
          ints: { ...s._ints },
          colors3: Object.fromEntries(Object.entries(s._colors3).map(([k, c]) => [k, rgb(c)])),
          vectors4: Object.fromEntries(Object.entries(s._vectors4).map(([k, v]) => [k, vec(v)])),
        };
      };
      for (const id of ids) {
        const body = {
          id,
          kind: 'planet',
          radius: 1000,
          colorHint: { hex: '#808080' },
        } as unknown as LoadedCelestialBody;
        const high = createBodyMesh(body, scene, 'solar', () => 1, true);
        const mid = createBodyMeshMid(body, scene, 'solar', high, () => 1, true);
        const h = snapshot(high.material);
        const m = snapshot(mid.material);
        // 공허 통과 차단 — 신규 uniform 이 실제로 바인딩돼 있다.
        expect(h.floats.surfaceAlbedo, id).toBeTypeOf('number');
        expect(h.vectors4.patternParams, id).toHaveLength(4);
        expect(m, id).toEqual(h);
      }
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });

  // 계수 단언은 두지 않는다 — 다음 uniform 추가마다 깨지는 계수 대신, 중복 0 과 신규 7종 포함을 잰다.
  it('uniforms 배열 — 중복 0 · #1419 신규 7종 포함 (ADR §5-6)', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    scene.activeCamera = new ArcRotateCamera('cam', 0, Math.PI / 2, 50, Vector3.Zero(), scene);
    try {
      const body = { id: 'io', colorHint: { hex: '#808080' } } as unknown as LoadedCelestialBody;
      const m = createProceduralPlanetMaterial(scene, body, 'io-count-mat') as ShaderMaterial;
      const uniforms = m.options.uniforms;
      expect(new Set(uniforms).size).toBe(uniforms.length);
      for (const name of [
        'craterTerrainAmp',
        'craterRegionAmp',
        'craterRegionFreq',
        'surfaceAlbedo',
        'patternAccentA',
        'patternAccentB',
        'patternParams',
      ]) {
        expect(uniforms).toContain(name);
      }
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
});
