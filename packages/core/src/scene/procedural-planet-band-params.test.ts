/**
 * #1274 PR1 — 밴드 파라미터 body 별 테이블 (ADR `20260628-756` Amendment 12 §A12.4 결정 1).
 *
 * 계약 D1 (계약 조정 C1 반영): `SURFACE_TYPE_BY_BODY` 중 **밴드 타입 (`BAND_SURFACE_TYPES`) 키
 * 부분집합** ↔ `SURFACE_BAND_PARAMS_BY_BODY` 키 집합 **양방향 일치**, 누락 · 초과 시 기본값 fallback
 * 없이 throw.
 *
 * 변이 주입 (PR 기록): ① 밴드 테이블 행 1개 삭제 ② 비-밴드 body 행 1개 추가 — 둘 다 아래 「불변식」
 * 테스트가 FAIL 해야 한다.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ArcRotateCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import type { LoadedCelestialBody } from '../ephemeris/solar-system-loader.js';
import {
  BAND_SURFACE_TYPES,
  GAS_BAND_AMPLITUDE,
  GAS_BAND_COUNT,
  GAS_TURBULENCE,
  SURFACE_BAND_PARAMS_BY_BODY,
  SURFACE_TYPE_BY_BODY,
  SurfaceType,
  createProceduralPlanetMaterial,
  resolveSurfaceBandParams,
  surfaceColorMirror,
  type SurfaceBandParams,
} from './procedural-planet-shader.js';

const sorted = (xs: Iterable<string>): string[] => [...xs].sort();

/** `SURFACE_TYPE_BY_BODY` 에서 밴드 타입 body 만 — 불변식의 한쪽 변 (데이터 파생). */
const bandTypedBodies = (): string[] =>
  Object.entries(SURFACE_TYPE_BY_BODY)
    .filter(([, type]) => BAND_SURFACE_TYPES.has(type))
    .map(([id]) => id);

describe('#1274 D1 — 밴드 테이블 ↔ 밴드 타입 body 불변식 (양방향)', () => {
  it('keys(SURFACE_BAND_PARAMS_BY_BODY) == { id | SURFACE_TYPE_BY_BODY[id] ∈ BAND_SURFACE_TYPES }', () => {
    const derived = bandTypedBodies();
    // 공허 통과 차단 — 한쪽이라도 비면 「둘 다 빈 집합」 이 같다고 읽힌다.
    expect(derived.length).toBeGreaterThan(0);
    expect(sorted(Object.keys(SURFACE_BAND_PARAMS_BY_BODY))).toEqual(sorted(derived));
  });

  it('PR1 의 정확한 집합 — 밴드 타입 {GasBands} · 밴드 행 {jupiter}', () => {
    expect([...BAND_SURFACE_TYPES]).toEqual([SurfaceType.GasBands]);
    expect(sorted(Object.keys(SURFACE_BAND_PARAMS_BY_BODY))).toEqual(['jupiter']);
  });

  it('jupiter 행 값 == 기존 밴드 상수 (값 동일 — 참조 여부는 아래 소스 정적 검사)', () => {
    expect(SURFACE_BAND_PARAMS_BY_BODY.jupiter).toEqual({
      amplitude: GAS_BAND_AMPLITUDE,
      count: GAS_BAND_COUNT,
      turbulence: GAS_TURBULENCE,
    });
  });

  it('jupiter 행은 GAS_BAND_* 식별자를 참조한다 — 리터럴 사본 금지 (소스 정적 검사, volt #69)', () => {
    // 숫자 원시값은 런타임에서 「참조」와 「사본」을 구분할 수 없다 (PR #1276 리뷰 R1 — 리터럴 사본
    // 변이가 위 값 동일 테스트를 통과했다). 그래서 선언 소스에서 jupiter 행의 우변을 직접 읽는다.
    const src = readFileSync(new URL('./procedural-planet-shader.ts', import.meta.url), 'utf8');
    const table = src.match(/export const SURFACE_BAND_PARAMS_BY_BODY[^=]*=\s*\{([\s\S]*?)\n\};/);
    const tableBody = table?.[1] ?? '';
    expect(tableBody).not.toBe('');
    const rowBody = tableBody.match(/\bjupiter:\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rowBody).not.toBe('');
    const fields = Object.fromEntries(
      rowBody
        .split(',')
        .map((part) => part.split(':').map((t) => t.trim()))
        .filter((kv) => kv.length === 2 && kv[0] !== ''),
    );
    expect(fields).toEqual({
      amplitude: 'GAS_BAND_AMPLITUDE',
      count: 'GAS_BAND_COUNT',
      turbulence: 'GAS_TURBULENCE',
    });
  });

  it('등록된 전 body 가 해석된다 — 밴드 타입은 자기 행, 비-밴드 타입은 0', () => {
    const entries = Object.entries(SURFACE_TYPE_BY_BODY);
    expect(entries.some(([, t]) => BAND_SURFACE_TYPES.has(t))).toBe(true);
    expect(entries.some(([, t]) => !BAND_SURFACE_TYPES.has(t))).toBe(true);
    for (const [id, type] of entries) {
      const resolved = resolveSurfaceBandParams(id, type);
      if (BAND_SURFACE_TYPES.has(type)) {
        expect(resolved).toBe(SURFACE_BAND_PARAMS_BY_BODY[id]);
      } else {
        expect(resolved).toEqual({ amplitude: 0, count: 0, turbulence: 0 });
      }
    }
  });
});

describe('#1274 D1 — 누락 · 초과 시 throw (기본값 fallback 금지)', () => {
  const ROW: SurfaceBandParams = { amplitude: 0.1, count: 3, turbulence: 0.05 };

  it('누락 — 밴드 타입인데 행이 없으면 throw', () => {
    expect(() => resolveSurfaceBandParams('jupiter', SurfaceType.GasBands, {})).toThrow(
      /행이 없다/,
    );
  });

  it('초과 — 비-밴드 타입인데 행이 있으면 throw', () => {
    expect(() => resolveSurfaceBandParams('earth', SurfaceType.Rocky, { earth: ROW })).toThrow(
      /행이 있다/,
    );
  });

  it('프로토타입 키 (`toString` 등) 를 행으로 읽지 않는다 — 누락이 그대로 throw', () => {
    expect(() => resolveSurfaceBandParams('toString', SurfaceType.GasBands, {})).toThrow(
      /행이 없다/,
    );
  });

  it('주입 테이블의 행을 그대로 돌려준다 (해석 함수가 테이블 인자를 실제로 쓴다)', () => {
    expect(resolveSurfaceBandParams('x', SurfaceType.GasBands, { x: ROW })).toBe(ROW);
  });
});

describe('#1274 §A12.4 계약 6 — surfaceColorMirror 밴드 인자화', () => {
  const base: readonly [number, number, number] = [0.6, 0.5, 0.4];
  const p: readonly [number, number, number] = [0.3, 0.6, 0.74];

  it('밴드 타입에 bands 미전달 시 throw (상수 fallback 없음)', () => {
    expect(() => surfaceColorMirror(base, SurfaceType.GasBands, p)).toThrow(/bands 인자가 없다/);
  });

  it('미러가 인자를 실제로 쓴다 — amplitude 0 이면 정확히 baseColor, jupiter 행이면 다르다', () => {
    const flat = surfaceColorMirror(base, SurfaceType.GasBands, p, undefined, {
      amplitude: 0,
      count: GAS_BAND_COUNT,
      turbulence: GAS_TURBULENCE,
    });
    expect(flat).toEqual(base);
    const banded = surfaceColorMirror(
      base,
      SurfaceType.GasBands,
      p,
      undefined,
      SURFACE_BAND_PARAMS_BY_BODY.jupiter,
    );
    expect(banded).not.toEqual(base);
  });
});

// ─── 바인딩 (NullEngine) ────────────────────────────────────────────────────
// 절차 표면 머티리얼은 1×1 마스크 placeholder 를 `DynamicTexture` 로 만들고 Babylon 은 node 에서 그
// 캔버스를 `OffscreenCanvas` 로 만든다 — 2D 호출을 삼키는 스텁을 둔다
// (`solar-system-scene-display-toggles.test.ts` 와 같은 처리. 텍스처 내용은 판정 대상 아님).
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

describe('#1274 — 밴드 uniform 바인딩이 해석 함수를 따른다 (NullEngine)', () => {
  it('등록 body 전건: gasBand* uniform == resolveSurfaceBandParams(id, type)', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    scene.activeCamera = new ArcRotateCamera('cam', 0, Math.PI / 2, 50, Vector3.Zero(), scene);
    try {
      const ids = Object.keys(SURFACE_TYPE_BY_BODY);
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) {
        const body = { id, colorHint: { hex: '#808080' } } as unknown as LoadedCelestialBody;
        const material = createProceduralPlanetMaterial(scene, body, `${id}-test-mat`);
        expect(material).not.toBeNull();
        const floats = (material as unknown as { _floats: Record<string, number> })._floats;
        const expected = resolveSurfaceBandParams(id, SURFACE_TYPE_BY_BODY[id]!);
        expect({
          amplitude: floats.gasBandAmplitude,
          count: floats.gasBandCount,
          turbulence: floats.gasTurbulence,
        }).toEqual({ ...expected });
      }
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });

  it('jupiter 는 기존 상수, 비-밴드 body 는 0 (종전 「전 body 에 목성 상수」 상속 해소)', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    scene.activeCamera = new ArcRotateCamera('cam', 0, Math.PI / 2, 50, Vector3.Zero(), scene);
    try {
      const amp = (id: string): number | undefined => {
        const body = { id, colorHint: { hex: '#808080' } } as unknown as LoadedCelestialBody;
        const m = createProceduralPlanetMaterial(scene, body, `${id}-amp-mat`);
        return (m as unknown as { _floats: Record<string, number> })._floats.gasBandAmplitude;
      };
      expect(amp('jupiter')).toBe(GAS_BAND_AMPLITUDE);
      expect(amp('earth')).toBe(0);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
});
