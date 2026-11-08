/**
 * #1428 — 태양 홍염이 장면에 붙는 방식 (NullEngine 실 scene, ADR 20261107-1428 결정 1 · 3 · §교차검증 합의 5 · 6).
 *
 *  1. 지연 생성 직후 동기화 (합의 6) — 일시정지 상태 (`updateAt` 이 더 돌지 않음) 에서 `setFlaresVisible(true)` 가 메시를 처음
 *     만들면 같은 호출 안에서 현재 장면 시계 jd 의 루프가 기록되고 LOD 가시성이 맞춰진다. 다시 켤 때도 그 사이 시각으로 즉시 기록.
 *  2. 감쇠 단계 실행 조건 (합의 5) — 홍염 감쇠는 `surfaceDetail` 과 무관하게 프레임 위상에서 진행한다 (`?surface=off` 에서도).
 *  3. 감쇠 계수 (결정 3) — 장면이 넘기는 계수가 홍염 `c = 1 /일` 이라 `1d` 재생은 보이고 `1M` 재생은 숨는다.
 *
 * 픽스처는 `solar-system-scene-sun-corona.test.ts` 와 같다 (OffscreenCanvas 스텁 포함).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ArcRotateCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { createSolarSystemScene, type SolarSystemSceneHandles } from './solar-system-scene.js';
import {
  SUN_PROMINENCES_MESH_NAME,
  createProminenceList,
  generateProminences,
} from './sun-prominences.js';

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
/** ADR 1428 시안 시각 (2014-04-01, 사이클 24 극대) — 생성기 활성 6 개 (sun-prominences.test.ts 골든). */
const JD_MAX = 2_456_748.5;
const FRAME_MS = 1000 / 60;
/** LOD cross-fade 지속 (ms) 보다 충분히 긴 시간 진행 — fade 를 정착시킨다 (코로나 장면 테스트와 같은 값). */
const SETTLE_ADVANCE_MS = 10_000;

function makeScene(options: { flares?: boolean; surfaceDetail?: boolean } = {}): Fixture {
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
    surfaceDetail: options.surfaceDetail ?? false,
    starfield: false,
    initialJulianDate: J2000,
    ...(options.flares === undefined ? {} : { flares: options.flares }),
  });
  const f = { engine, scene, handles };
  fixtures.push(f);
  return f;
}

/** 홍염 머티리얼에 실린 감쇠 가시도 (`uVisibility`). */
function fadeOf(f: Fixture): number {
  const material = f.handles.getSunProminences()!.material;
  return (material as unknown as { _floats: Record<string, number> })._floats.uVisibility!;
}

/** 곡선 점 버퍼의 0 아닌 성분 수 — 퇴화 슬롯만 있으면 0. */
function nonZeroPositions(f: Fixture): number {
  const data = f.handles.getSunProminences()!.mesh.getVerticesData('position')!;
  let n = 0;
  for (let i = 0; i < data.length; i++) if (data[i] !== 0) n++;
  return n;
}

/** 시간을 앞으로 돌려 LOD fade 를 정착시킨다 (프레임 위상 2회 — 전환 등록 · 정착). */
function settleLod(f: Fixture, level: 'high' | 'mid' | 'low' | 'auto') {
  let now = performance.now();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  f.handles.setLodOverride(level);
  f.handles.runFramePass();
  now += SETTLE_ADVANCE_MS;
  f.handles.runFramePass();
  vi.restoreAllMocks();
}

/**
 * 렌더 루프 흉내 — 프레임마다 시간 위상 (`updateAt`, jd 가 움직일 때만) 과 프레임 위상 (`runFramePass`) 을 돈다.
 * 실시간은 `performance.now` 모의로 1/60 s 씩 진행한다. 마지막 장면 시계 jd 를 반환한다.
 */
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

describe('#1428 — 태양 홍염 장면 통합', () => {
  it('flares 미지정 → 생성 0 (core 기본 false) · 프레임 위상이 메시 없이도 돈다', () => {
    const f = makeScene();
    expect(f.handles.getSunProminences()).toBeNull();
    expect(f.scene.getMeshByName(SUN_PROMINENCES_MESH_NAME)).toBeNull();
    expect(() => {
      f.handles.runFramePass();
      settleLod(f, 'low');
      settleLod(f, 'auto');
    }).not.toThrow();
  });

  it('합의 6 — 일시정지 중 지연 생성은 같은 호출 안에서 현재 jd 의 루프를 기록하고, 다시 켤 때도 즉시 기록한다', () => {
    const f = makeScene();
    const expected = createProminenceList();
    // 일시정지 — 시간 위상은 이 1 회 뒤로 돌지 않는다.
    f.handles.updateAt(JD_MAX);
    f.handles.setFlaresVisible(true);
    const prominences = f.handles.getSunProminences()!;
    const n = generateProminences(JD_MAX, expected);
    expect(n, '전제: 이 jd 에 활성 홍염이 있다').toBeGreaterThan(0);
    expect(prominences.activeCount()).toBe(n);
    expect(nonZeroPositions(f), '정점 버퍼가 퇴화 슬롯만이 아니다').toBeGreaterThan(0);

    // 끈 동안 시각이 바뀐다 (꺼진 메시는 시간 위상에서 기록하지 않는다) → 다시 켜면 그 시각으로 즉시 기록.
    f.handles.setFlaresVisible(false);
    const jdLater = JD_MAX + 40;
    f.handles.updateAt(jdLater);
    expect(prominences.activeCount(), '꺼진 동안은 기록하지 않는다').toBe(n);
    const later = createProminenceList();
    const nLater = generateProminences(jdLater, later);
    // 전제 — 두 시각의 목록 (id) 이 달라야 「즉시 기록」 을 가른다 (40 일 > 최장 수명 15 일이라 겹치는 개체가 없다).
    const ids = (l: typeof later, k: number) =>
      Array.from({ length: k }, (_, i) => `${l.idSlot[i]}/${l.idIndex[i]}`);
    expect(ids(later, nLater)).not.toEqual(ids(expected, n));
    f.handles.setFlaresVisible(true);
    expect(f.handles.getSunProminences(), '같은 메시를 다시 켠다 (재생성 아님)').toBe(prominences);
    expect(prominences.activeCount()).toBe(nLater);
  });

  it('합의 6 — 지연 생성 직후 LOD 가시성을 맞추고, LOD low → 끔 · high → 켬 (일시정지 중)', () => {
    const f = makeScene();
    f.handles.updateAt(JD_MAX);
    settleLod(f, 'low');
    f.handles.setFlaresVisible(true);
    const prominences = f.handles.getSunProminences()!;
    expect(prominences.mesh.isVisible, '생성 직후 — 다음 프레임 위상 전').toBe(false);
    settleLod(f, 'high');
    expect(prominences.mesh.isVisible).toBe(true);
    settleLod(f, 'low');
    expect(prominences.mesh.isVisible).toBe(false);
  });

  for (const surfaceDetail of [false, true]) {
    it(`결정 3 · 합의 5 — surfaceDetail=${surfaceDetail}: 1d 재생 가시도 1 · 1M 재생 0 · 일시정지 1 복귀`, () => {
      const f = makeScene({ flares: true, surfaceDetail });
      const clock = { jd: JD_MAX, ms: 1000 };
      f.handles.updateAt(clock.jd);
      play(f, clock, 0, 0.5);
      expect(fadeOf(f)).toBe(1);
      // 1d (1 일/s) — 홍염 c = 1 이면 1 Hz ≤ 3 Hz. 장면 계수가 틀리면 (예: 30 배) 여기서 숨는다.
      play(f, clock, 1, 2);
      expect(fadeOf(f), '1d 재생').toBe(1);
      // 1M (30 일/s) — 30 Hz > 3 Hz → 0. 감쇠 단계가 surfaceDetail 조건 뒤에 있으면 surfaceDetail=false 에서 1 로 남는다.
      play(f, clock, 30, 2);
      expect(fadeOf(f), '1M 재생').toBe(0);
      play(f, clock, 0, 1);
      expect(fadeOf(f), '일시정지 뒤').toBe(1);
    });
  }

  it('dispose — 메시 · 머티리얼 해제', () => {
    const f = makeScene({ flares: true });
    const prominences = f.handles.getSunProminences()!;
    f.handles.dispose();
    fixtures.splice(fixtures.indexOf(f), 1);
    expect(prominences.mesh.isDisposed()).toBe(true);
    expect(f.scene.getMeshByName(SUN_PROMINENCES_MESH_NAME)).toBeNull();
    f.scene.dispose();
    f.engine.dispose();
  });
});
