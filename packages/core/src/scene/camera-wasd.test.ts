/**
 * #699 — free-fly WASD/QE 키보드 이동 회귀 가드 (camera.ts attachWasdControl 순수 로직).
 *
 * ADR `docs/decisions/20260617-699-freefly-camera-unified-redesign.md` §5-4 + §4 Concrete Prediction.
 * (#696 PR #698 의 camera-wasd.test.ts 재사용 — 계수/산식만 #699 ADR 로 교체.)
 *
 * 검증 대상 (Babylon 엔진/WebGL 불필요 — 실 `Observable`/`Vector3` + duck-typed 카메라·엔진 모킹):
 *  - WASD_DELTA_PERCENTAGE 박제값 0.015 (D-T2 튜닝 SSoT — 구 0.05 에서 ⅓ 하향)
 *  - MAX_MOVE_STEP clamp (큰 radius 에서 상한 적용 — 줌아웃 극단 과속 안전망)
 *  - 이동 벡터 산출: W=+forward / S=−forward / D=+right / A=−right / Q=+worldUp / E=−worldUp
 *  - deltaTime 정규화 (deltaTime/(1/60) — 16ms vs 32ms 이동량 2배, 동일 시간 동일 이동)
 *  - 대각 정규화 (W+D 합벡터 정규화 → 단일 키와 동일 step, √2 아님)
 *  - Q/E 월드 절대 up (시점 기울어도 항상 월드 +Y/−Y)
 *  - 토글 (setEnabled false → 이동 0 / focus follow 충돌 회피) + reset(clearKeys)
 *  - detach 후 키 이벤트 무시 (observer 해제)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Observable, Vector3, KeyboardEventTypes } from '@babylonjs/core';
import type { ArcRotateCamera, Scene, KeyboardInfo } from '@babylonjs/core';
import { WASD_DELTA_PERCENTAGE, MAX_MOVE_STEP, attachWasdControl } from './camera.js';

/**
 * 실 Observable/Vector3 + duck-typed 카메라·엔진을 갖춘 최소 씬 모킹.
 *
 * - `getDirection(Forward)` 는 forward 방향을 그대로 반환 (회전 행렬 모사 불필요 — 산식 검증 목적).
 * - `getDeltaTime()` 은 가변 deltaTime (frame-rate 독립 검증).
 * - `document.activeElement` 가드는 jsdom 기본(body 포커스)에서 통과한다.
 */
function makeHarness(opts: { forward?: Vector3; radius?: number; deltaTimeMs?: number }) {
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

describe('#699 WASD_DELTA_PERCENTAGE / MAX_MOVE_STEP 박제값', () => {
  it('WASD_DELTA_PERCENTAGE = 0.015 (구 0.05 에서 ⅓ 하향, D-T2 튜닝 SSoT)', () => {
    expect(WASD_DELTA_PERCENTAGE).toBe(0.015);
  });
  it('MAX_MOVE_STEP = 10 (줌아웃 극단 과속 상한 — solar 개요 6.96 < 10 통과)', () => {
    expect(MAX_MOVE_STEP).toBe(10);
  });
});

describe('#699 이동 벡터 산출 (방향 매핑)', () => {
  // forward = +Z, worldUp = +Y → right = forward × up = (+Z) × (+Y) = −X.
  const FORWARD = new Vector3(0, 0, 1);
  const RADIUS = 100;
  const DELTA = 16;
  // #699 산식: step = min(radius×pct, MAX) × (deltaMs/1000)/(1/60).
  //   radius×pct = 100×0.015 = 1.5 (< MAX 10) → clamp 미적용.
  //   step = 1.5 × (16/1000)/(1/60) = 1.5 × 0.96 = 1.44.
  const STEP = Math.min(RADIUS * WASD_DELTA_PERCENTAGE, MAX_MOVE_STEP) * (DELTA / 1000 / (1 / 60));

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

describe('#699 MAX_MOVE_STEP clamp (줌아웃 극단 과속 안전망)', () => {
  it('큰 radius 에서 step 이 MAX_MOVE_STEP 으로 잘린다 (io deep tier radius≈158386)', () => {
    // radius 158386 × 0.015 = 2375.79 → MAX 10 으로 clamp.
    // 60fps(16.667ms) 기준 정규화 시 step = 10 × (16.667/1000)/(1/60) = 10 × 1.0 = 10.
    const h = makeHarness({
      forward: new Vector3(0, 0, 1),
      radius: 158386,
      deltaTimeMs: 1000 / 60,
    });
    h.handle.setEnabled(true);
    h.press('w');
    h.frame();
    // clamp 없으면 2375.79, 있으면 MAX_MOVE_STEP(10). 정확히 상한값이어야 한다.
    expect(h.camera.target.z).toBeCloseTo(MAX_MOVE_STEP, 4);
  });

  it('정상 tier(solar radius≈464)는 상한에 걸리지 않는다 (비례식 그대로 적용)', () => {
    // 464 × 0.015 = 6.96 (< MAX 10) → clamp 미적용, 비례식 통과.
    const h = makeHarness({ forward: new Vector3(0, 0, 1), radius: 464, deltaTimeMs: 1000 / 60 });
    h.handle.setEnabled(true);
    h.press('w');
    h.frame();
    expect(h.camera.target.z).toBeCloseTo(6.96, 2);
  });
});

describe('#699 deltaTime 정규화 (144Hz↔60Hz 속도 불일치 회귀 방지)', () => {
  it('deltaTime 2배 → 이동량 2배 (60/144Hz 무관 동일 시간 동일 이동)', () => {
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

  it('60fps(16.667ms) deltaTime 에서 step = clamp(radius×pct, MAX) (정규화 계수 = 1)', () => {
    // deltaTime = 1/60s 일 때 (deltaMs/1000)/(1/60) = 1 → step = radius×pct (정규화 항이 항등).
    const h = makeHarness({ forward: new Vector3(0, 0, 1), radius: 200, deltaTimeMs: 1000 / 60 });
    h.handle.setEnabled(true);
    h.press('w');
    h.frame();
    expect(h.camera.target.z).toBeCloseTo(200 * WASD_DELTA_PERCENTAGE, 5); // 3.0.
  });
});

describe('#699 대각 정규화', () => {
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

describe('#699 Q/E 월드 절대 up', () => {
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

describe('#699 토글 + reset(clearKeys) + detach', () => {
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

  it('clearKeys → reset 후 키업 유실해도 정지 (ADR §5-4)', () => {
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
