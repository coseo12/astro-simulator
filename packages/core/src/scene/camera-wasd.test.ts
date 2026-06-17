/**
 * #696 — free-fly WASD/QE 키보드 이동 회귀 가드 (camera.ts attachWasdControl 순수 로직).
 *
 * ADR `docs/decisions/20260617-696-freefly-wasd-movement.md` §결정 2~5 + §4 Concrete Prediction.
 *
 * 검증 대상 (Babylon 엔진/WebGL 불필요 — 실 `Observable`/`Vector3` + duck-typed 카메라·엔진 모킹):
 *  - WASD_DELTA_PERCENTAGE 박제값 (D-T2 튜닝 SSoT)
 *  - 이동 벡터 산출: W=+forward / S=−forward / D=+right / A=−right / Q=+worldUp / E=−worldUp
 *  - target + position 동시 평행이동 (offset 보존 = radius/시선 불변, dolly 아님)
 *  - 프레임 레이트 독립 (deltaTime 곱산 — 16ms vs 32ms 이동량 2배)
 *  - 대각 정규화 (W+D 합벡터 정규화 → 단일 키와 동일 step, √2 아님)
 *  - Q/E 월드 절대 up (시점 기울어도 항상 월드 +Y/−Y)
 *  - 토글 (setEnabled false → 이동 0 / focus follow 충돌 회피) + reset(clearKeys)
 *  - detach 후 키 이벤트 무시 (observer 해제)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Observable, Vector3, KeyboardEventTypes } from '@babylonjs/core';
import type { ArcRotateCamera, Scene, KeyboardInfo } from '@babylonjs/core';
import { WASD_DELTA_PERCENTAGE, attachWasdControl } from './camera.js';

/**
 * 실 Observable/Vector3 + duck-typed 카메라·엔진을 갖춘 최소 씬 모킹.
 *
 * - `getDirection(Forward)` 는 forward 방향을 그대로 반환 (회전 행렬 모사 불필요 — 산식 검증 목적).
 * - `getDeltaTime()` 은 가변 deltaTime (frame-rate 독립 검증).
 * - `document.activeElement` 가드는 jsdom 기본(body 포커스)에서 통과한다.
 */
function makeHarness(opts: {
  forward?: Vector3;
  radius?: number;
  deltaTimeMs?: number;
}) {
  const forward = (opts.forward ?? new Vector3(0, 0, 1)).clone();
  let deltaTimeMs = opts.deltaTimeMs ?? 16;
  const onKeyboardObservable = new Observable<KeyboardInfo>();
  const onBeforeRenderObservable = new Observable<Scene>();

  const camera = {
    target: Vector3.Zero(),
    position: forward.scale(-(opts.radius ?? 100)), // position = target − forward×radius
    radius: opts.radius ?? 100,
    getDirection: (axis: Vector3) => {
      // Forward → forward, Up → 카메라 local up (여기선 월드 Up 과 분리 위해 기울인 값 주입 가능).
      if (axis.equals(Vector3.Forward())) return forward.clone();
      return Vector3.Up().clone();
    },
    onDisposeObservable: new Observable<unknown>(),
  } as unknown as ArcRotateCamera;

  const engine = {
    getRenderingCanvas: () => null,
    getDeltaTime: () => deltaTimeMs,
  };
  const scene = {
    onKeyboardObservable,
    onBeforeRenderObservable,
    getEngine: () => engine,
  } as unknown as Scene;

  const press = (key: string) =>
    onKeyboardObservable.notifyObservers({
      type: KeyboardEventTypes.KEYDOWN,
      event: { key },
    } as unknown as KeyboardInfo);
  const release = (key: string) =>
    onKeyboardObservable.notifyObservers({
      type: KeyboardEventTypes.KEYUP,
      event: { key },
    } as unknown as KeyboardInfo);
  const frame = () => onBeforeRenderObservable.notifyObservers(scene);
  const setDeltaTime = (ms: number) => {
    deltaTimeMs = ms;
  };

  const handle = attachWasdControl(camera, scene);
  return { camera, scene, handle, press, release, frame, setDeltaTime, forward };
}

describe('#696 WASD_DELTA_PERCENTAGE 박제값', () => {
  it('= 0.5 (초당 radius 비율, D-T2 튜닝 SSoT)', () => {
    expect(WASD_DELTA_PERCENTAGE).toBe(0.5);
  });
});

describe('#696 이동 벡터 산출 (방향 매핑)', () => {
  // forward = +Z, worldUp = +Y → right = forward × up = (+Z) × (+Y) = −X.
  const FORWARD = new Vector3(0, 0, 1);
  const RADIUS = 100;
  const DELTA = 16;
  // step = radius × pct × (delta/1000) = 100 × 0.5 × 0.016 = 0.8.
  const STEP = RADIUS * WASD_DELTA_PERCENTAGE * (DELTA / 1000);

  let h: ReturnType<typeof makeHarness>;
  beforeEach(() => {
    h = makeHarness({ forward: FORWARD, radius: RADIUS, deltaTimeMs: DELTA });
    h.handle.setEnabled(true);
  });

  it('W → +forward (target+position 동시 +Z step 이동)', () => {
    const t0 = h.camera.target.clone();
    const p0 = h.camera.position.clone();
    h.press('w');
    h.frame();
    expect(h.camera.target.z - t0.z).toBeCloseTo(STEP, 6);
    expect(h.camera.position.z - p0.z).toBeCloseTo(STEP, 6);
    // offset(position − target) 불변 → radius/시선 보존 (dolly 아님).
    expect(h.camera.position.subtract(h.camera.target).length()).toBeCloseTo(
      p0.subtract(t0).length(),
      6,
    );
  });

  it('S → −forward', () => {
    h.press('s');
    h.frame();
    expect(h.camera.target.z).toBeCloseTo(-STEP, 6);
  });

  it('D → +right (= −X)', () => {
    h.press('d');
    h.frame();
    expect(h.camera.target.x).toBeCloseTo(-STEP, 6);
  });

  it('A → −right (= +X)', () => {
    h.press('a');
    h.frame();
    expect(h.camera.target.x).toBeCloseTo(STEP, 6);
  });

  it('Q → +worldUp (+Y)', () => {
    h.press('q');
    h.frame();
    expect(h.camera.target.y).toBeCloseTo(STEP, 6);
  });

  it('E → −worldUp (−Y)', () => {
    h.press('e');
    h.frame();
    expect(h.camera.target.y).toBeCloseTo(-STEP, 6);
  });

  it('keyup → 이동 정지 (눌림 키 해제)', () => {
    h.press('w');
    h.frame();
    const afterPress = h.camera.target.clone();
    h.release('w');
    h.frame();
    expect(h.camera.target.z).toBeCloseTo(afterPress.z, 6); // 추가 이동 없음.
  });

  it('W+S 상쇄 → 이동 0 (합벡터 0)', () => {
    h.press('w');
    h.press('s');
    h.frame();
    expect(h.camera.target.length()).toBeCloseTo(0, 6);
  });
});

describe('#696 프레임 레이트 독립 (agy 고유 발견 ①, 치명적)', () => {
  it('deltaTime 2배 → 이동량 2배 (60/144Hz 무관 동일 속도)', () => {
    const h = makeHarness({ forward: new Vector3(0, 0, 1), radius: 100, deltaTimeMs: 16 });
    h.handle.setEnabled(true);
    h.press('w');
    h.frame();
    const move16 = h.camera.target.z;

    h.handle.clearKeys();
    h.camera.target.copyFrom(Vector3.Zero());
    h.setDeltaTime(32);
    h.press('w');
    h.frame();
    const move32 = h.camera.target.z;

    expect(move32).toBeCloseTo(move16 * 2, 6);
  });
});

describe('#696 대각 정규화 (agy 이견 수용)', () => {
  it('W+D 대각 이동량 = 단일 키 step (√2 가속 아님)', () => {
    const single = makeHarness({ forward: new Vector3(0, 0, 1), radius: 100, deltaTimeMs: 16 });
    single.handle.setEnabled(true);
    single.press('w');
    single.frame();
    const singleDist = single.camera.target.length();

    const diag = makeHarness({ forward: new Vector3(0, 0, 1), radius: 100, deltaTimeMs: 16 });
    diag.handle.setEnabled(true);
    diag.press('w');
    diag.press('d');
    diag.frame();
    const diagDist = diag.camera.target.length();

    // 정규화 시 대각 거리 = 단일 키 거리. 미정규화면 √2 ≈ 1.414 배.
    expect(diagDist).toBeCloseTo(singleDist, 6);
  });
});

describe('#696 Q/E 월드 절대 up (agy 고유 발견 ②)', () => {
  it('카메라 local up 이 기울어도 Q 는 월드 +Y 이동 (수평 둔갑 회피)', () => {
    // getDirection(Up) 이 월드 수평(local up = +X)을 반환하도록 모킹 — pitch≈−π/2 하향 시점 모사.
    // 구현이 local up 을 썼다면 Q 가 +X(수평) 로 이동하지만, 월드 Up() 고정이라 +Y 로 이동해야 한다.
    const onKeyboardObservable = new Observable<KeyboardInfo>();
    const onBeforeRenderObservable = new Observable<Scene>();
    const forward = new Vector3(0, -1, 0); // 수직 하향 시선.
    const camera = {
      target: Vector3.Zero(),
      position: new Vector3(0, 100, 0),
      radius: 100,
      getDirection: (axis: Vector3) =>
        axis.equals(Vector3.Forward()) ? forward.clone() : new Vector3(1, 0, 0), // local up = +X (수평).
      onDisposeObservable: new Observable<unknown>(),
    } as unknown as ArcRotateCamera;
    const scene = {
      onKeyboardObservable,
      onBeforeRenderObservable,
      getEngine: () => ({ getRenderingCanvas: () => null, getDeltaTime: () => 16 }),
    } as unknown as Scene;
    const handle = attachWasdControl(camera, scene);
    handle.setEnabled(true);

    onKeyboardObservable.notifyObservers({
      type: KeyboardEventTypes.KEYDOWN,
      event: { key: 'q' },
    } as unknown as KeyboardInfo);
    onBeforeRenderObservable.notifyObservers(scene);

    expect(camera.target.y).toBeGreaterThan(0); // 월드 +Y (위로) — 정상.
    expect(camera.target.x).toBeCloseTo(0, 6); // local up(+X) 미사용 → 수평 이동 0.
  });
});

describe('#696 토글 + reset(clearKeys) + detach', () => {
  it('setEnabled(false) → 이동 0 (focus follow 충돌 회피)', () => {
    const h = makeHarness({ forward: new Vector3(0, 0, 1), radius: 100, deltaTimeMs: 16 });
    h.handle.setEnabled(false);
    h.press('w');
    h.frame();
    expect(h.camera.target.length()).toBeCloseTo(0, 6);
  });

  it('setEnabled(false) 가 눌림 키 클리어 → 재활성 시 이동 없음(키 잔류 방지)', () => {
    const h = makeHarness({ forward: new Vector3(0, 0, 1), radius: 100, deltaTimeMs: 16 });
    h.handle.setEnabled(true);
    h.press('w');
    h.handle.setEnabled(false); // focus 진입.
    h.handle.setEnabled(true); // 다시 free-fly.
    h.frame();
    expect(h.camera.target.length()).toBeCloseTo(0, 6); // 'w' 잔류 안 함.
  });

  it('clearKeys → reset 후 키업 유실해도 정지 (ADR §결정 5)', () => {
    const h = makeHarness({ forward: new Vector3(0, 0, 1), radius: 100, deltaTimeMs: 16 });
    h.handle.setEnabled(true);
    h.press('w');
    h.handle.clearKeys();
    h.frame();
    expect(h.camera.target.length()).toBeCloseTo(0, 6);
  });

  it('detach 후 키 이벤트 무시 (observer 해제)', () => {
    const h = makeHarness({ forward: new Vector3(0, 0, 1), radius: 100, deltaTimeMs: 16 });
    h.handle.setEnabled(true);
    h.handle.detach();
    h.press('w');
    h.frame();
    expect(h.camera.target.length()).toBeCloseTo(0, 6);
  });
});
