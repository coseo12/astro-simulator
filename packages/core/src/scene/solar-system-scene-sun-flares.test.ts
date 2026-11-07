/**
 * #1428 PR2 — 태양 플레어가 장면에 붙는 방식 (NullEngine 실 scene, ADR 20261107-1428 결정 3 · 4 · §교차검증 합의 4).
 *
 *  1. 흑점 목록 공유 (합의 4) — 흑점을 꺼도 (`sunspots: false`) 플레어 자리는 있다 (`spotCount = 0` · `flareCount > 0`).
 *     플레어를 끄면 (`flares` 미지정 · `false`) `flareCount = 0` 이고 흑점 uniform 은 흑점 단독 경로와 같다.
 *  2. 토글 수명주기 — 일시정지 중 `setFlaresVisible(true)` 가 현재 장면 시계 jd 의 플레어를 즉시 기록하고, 끄면 0.
 *  3. 감쇠 계수 (결정 3) — 장면이 넘기는 계수가 플레어 `c = 48 /일` 이라 `1h` 재생은 보이고 `1d` 재생은 숨는다.
 *
 * 픽스처는 `solar-system-scene-sun-prominences.test.ts` 와 같다 (OffscreenCanvas 스텁 포함). sun 절차 셰이더가 있어야 하므로
 * `surfaceDetail: true`.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ArcRotateCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { createSolarSystemScene, type SolarSystemSceneHandles } from './solar-system-scene.js';
import { writeSunFlareUniforms, writeSunspotUniforms } from './sun-shader.js';
import { MAX_SUN_FLARES } from './sun-flares.js';
import { SUNSPOT_MAX, createHeliographicSpots, generateHeliographicSunspots } from './sunspots.js';

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

interface Fixture {
  engine: NullEngine;
  scene: Scene;
  handles: SolarSystemSceneHandles;
}
const fixtures: Fixture[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const f of fixtures.splice(0)) {
    f.handles.dispose();
    f.scene.dispose();
    f.engine.dispose();
  }
});

const J2000 = 2_451_545.0;
/** 2014-04-01 15:21.6 UT — 플레어 2 개 (sun-flares.test.ts 골든). */
const JD_FLARES = 2_456_749.14;
const FRAME_MS = 1000 / 60;

function makeScene(options: { flares?: boolean; sunspots?: boolean } = {}): Fixture {
  const engine = new NullEngine({
    renderWidth: 1280,
    renderHeight: 800,
    textureSize: 512,
    deterministicLockstep: false,
    lockstepMaxSteps: 1,
  });
  const scene = new Scene(engine);
  const camera = new ArcRotateCamera('cam', 0, Math.PI / 3, 35, Vector3.Zero(), scene);
  scene.activeCamera = camera;
  const handles = createSolarSystemScene(scene, {
    surfaceDetail: true,
    starfield: false,
    initialJulianDate: J2000,
    ...(options.flares === undefined ? {} : { flares: options.flares }),
    ...(options.sunspots === undefined ? {} : { sunspots: options.sunspots }),
  });
  const f = { engine, scene, handles };
  fixtures.push(f);
  return f;
}

interface SunUniforms {
  _floats: Record<string, number>;
  _vectors4Arrays: Record<string, number[]>;
}
function sunUniforms(f: Fixture): SunUniforms {
  return f.scene.getMeshByName('sun')!.material as unknown as SunUniforms;
}

/** 기대값 — 같은 jd 의 흑점 목록에서 기록기를 직접 부른 결과. */
function expectedFlares(jd: number) {
  const spots = createHeliographicSpots();
  const spotCount = generateHeliographicSunspots(jd, spots);
  const flares = new Array<number>(4 * MAX_SUN_FLARES).fill(0);
  const params = new Array<number>(4 * MAX_SUN_FLARES).fill(0);
  const n = writeSunFlareUniforms(jd, spots, spotCount, flares, params);
  return { n, flares, params };
}

function play(f: Fixture, clock: { jd: number; ms: number }, daysPerSec: number, seconds: number) {
  vi.spyOn(performance, 'now').mockImplementation(() => clock.ms);
  const frames = Math.round((seconds * 1000) / FRAME_MS);
  for (let k = 0; k < frames; k++) {
    clock.ms += FRAME_MS;
    if (daysPerSec !== 0) {
      clock.jd += (daysPerSec * FRAME_MS) / 1000;
      f.handles.updateAt(clock.jd);
    }
    f.handles.runFramePass();
  }
  vi.restoreAllMocks();
}

describe('#1428 PR2 — 태양 플레어 장면 통합', () => {
  it('합의 4 — 흑점 끔 · 플레어 켬: spotCount 0 · 플레어는 같은 jd 흑점 목록에서 (기록기 직접 호출과 같은 값)', () => {
    const f = makeScene({ flares: true, sunspots: false });
    f.handles.updateAt(JD_FLARES);
    const u = sunUniforms(f);
    const want = expectedFlares(JD_FLARES);
    expect(want.n, '전제: 이 jd 에 플레어가 있다').toBe(2);
    expect(u._floats.spotCount).toBe(0);
    expect(u._floats.flareCount).toBe(want.n);
    expect(u._vectors4Arrays.flares).toEqual(want.flares);
    expect(u._vectors4Arrays.flareParams).toEqual(want.params);
  });

  it('플레어 끔 (미지정) · 흑점 켬: flareCount 0 · 흑점 uniform 은 흑점 단독 기록기와 같다', () => {
    const f = makeScene({ sunspots: true });
    f.handles.updateAt(JD_FLARES);
    const u = sunUniforms(f);
    const spots = new Array<number>(4 * SUNSPOT_MAX).fill(0);
    const n = writeSunspotUniforms(JD_FLARES, spots);
    expect(u._floats.flareCount).toBe(0);
    expect(u._floats.spotCount).toBe(n);
    expect(u._vectors4Arrays.spots).toEqual(spots);
    expect(u._vectors4Arrays.flareParams!.every((v) => v === 0)).toBe(true);
  });

  it('토글 — 일시정지 중 켜기는 현재 jd 의 플레어를 즉시 기록, 끄기는 0', () => {
    const f = makeScene({ sunspots: true });
    f.handles.updateAt(JD_FLARES);
    expect(sunUniforms(f)._floats.flareCount).toBe(0);
    f.handles.setFlaresVisible(true);
    expect(sunUniforms(f)._floats.flareCount).toBe(expectedFlares(JD_FLARES).n);
    expect(sunUniforms(f)._vectors4Arrays.flareParams).toEqual(expectedFlares(JD_FLARES).params);
    f.handles.setFlaresVisible(false);
    expect(sunUniforms(f)._floats.flareCount).toBe(0);
  });

  it('결정 3 — 플레어 감쇠: 1h 재생 가시도 1 · 1d 재생 0 · 일시정지 1 복귀 (흑점 가시도는 1d 에서 1)', () => {
    const f = makeScene({ flares: true, sunspots: true });
    const clock = { jd: JD_FLARES, ms: 1000 };
    f.handles.updateAt(clock.jd);
    play(f, clock, 0, 0.5);
    const u = sunUniforms(f);
    expect(u._floats.flareVisibility).toBe(1);
    // 1h (1/24 일/s) — c = 48 이면 2 Hz ≤ 3 Hz.
    play(f, clock, 1 / 24, 2);
    expect(u._floats.flareVisibility, '1h 재생').toBe(1);
    // 1d (1 일/s) — 48 Hz > 3 Hz → 0. 흑점 (c = 0.04) 은 그대로 1.
    play(f, clock, 1, 2);
    expect(u._floats.flareVisibility, '1d 재생').toBe(0);
    expect(u._floats.spotVisibility, '1d 재생 — 흑점').toBe(1);
    play(f, clock, 0, 1);
    expect(u._floats.flareVisibility, '일시정지 뒤').toBe(1);
  });
});
