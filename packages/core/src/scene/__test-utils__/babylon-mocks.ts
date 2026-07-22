/**
 * #849 — core scene 테스트 공용 Babylon duck-typed mock 헬퍼.
 *
 * 추출 전 중복 실측 (2026-07-22 grep 전수):
 *  - mockCamera: camera-panning / camera-sensitivity-injection (동일 구현 2곳) +
 *    focus-lower-radius-floor (minZ/target 변형 1곳) → `mockArcRotateCamera` 로 통합
 *  - mockScene 2종: focus-lower-radius-floor (제어 표면) → `mockControlScene`,
 *    body-picking (pick/multiPick 표면) → `mockPickingScene`
 *  - keyboard Observable 셋업 3곳: camera-wasd makeHarness + 동일 파일 Q/E 인라인 +
 *    camera-sensitivity-injection makeWasdHarness → `makeKeyboardSceneHarness`
 *
 * 격리 원칙 (volt #120 — 테스트 더블 격리): 본 파일은 SUT (camera.ts / body-picking.ts /
 * camera-controller.ts 등) 를 **import 하지 않는다**. 순수 mock 빌더만 제공하며, SUT 배선
 * (`attachWasdControl` 호출 등) 은 각 테스트 파일이 수행한다 — helper 가 SUT 를 끌어오면
 * 테스트 대상과 더블이 결합해 mock 무결성이 깨진다.
 *
 * vitest include glob 은 `.{test,spec}.ts` 파일만 수집하므로 본 파일은 테스트로
 * 오인 수집되지 않는다. dist 출하 제외는 tsconfig.build.json 의 __test-utils__ exclude.
 */
import { vi } from 'vitest';
import { KeyboardEventTypes, Matrix, Observable, Vector3 } from '@babylonjs/core';
import type { ArcRotateCamera, KeyboardInfo, Scene } from '@babylonjs/core';

// ---------------------------------------------------------------------------
// 카메라
// ---------------------------------------------------------------------------

/**
 * duck-typed ArcRotateCamera 옵션.
 * `| undefined` 허용은 exactOptionalPropertyTypes 하에서 호출측 조건부 전달을 허용하기 위함.
 */
export interface MockCameraOptions {
  radius?: number | undefined;
  lowerRadiusLimit?: number | undefined;
  minZ?: number | undefined;
}

/**
 * focusOn / runTierTransition / panning 산식이 만지는 속성만 갖는 최소 카메라 모킹.
 *
 * 소비처별 사용 속성 (superset — 미사용 속성은 duck-typing 상 무해):
 *  - focus-lower-radius-floor: radius(고정 30) / minZ / lowerRadiusLimit / target
 *  - camera-panning, camera-sensitivity-injection: radius / lowerRadiusLimit / panningSensibility
 */
export function mockArcRotateCamera(opts: MockCameraOptions = {}): ArcRotateCamera {
  return {
    radius: opts.radius ?? 30,
    minZ: opts.minZ ?? 0.01,
    lowerRadiusLimit: opts.lowerRadiusLimit ?? 0.5,
    panningSensibility: 0,
    target: new Vector3(0, 0, 0),
  } as unknown as ArcRotateCamera;
}

// ---------------------------------------------------------------------------
// 씬 — 제어 표면 (focus / tier 전환 계열)
// ---------------------------------------------------------------------------

/**
 * focusOn / runTierTransition 이 만지는 제어 표면만 갖는 최소 씬 모킹.
 * observable/컨트롤 호출 여부만 spy — 렌더링/애니메이션 실행은 브라우저 가드 영역.
 */
export function mockControlScene(): Scene {
  return {
    onBeforeRenderObservable: { add: vi.fn(), remove: vi.fn() },
    detachControl: vi.fn(),
    attachControl: vi.fn(),
    stopAnimation: vi.fn(),
    stopAllAnimations: vi.fn(),
  } as unknown as Scene;
}

// ---------------------------------------------------------------------------
// 씬 — picking 표면 (#713/#719 body-picking 계열)
// ---------------------------------------------------------------------------

/** `mockPickingScene` 기본 렌더 크기 — worldForScreen 역산 등 화면 좌표 통제의 SSoT. */
export const MOCK_PICKING_SCENE_WIDTH = 1000;
export const MOCK_PICKING_SCENE_HEIGHT = 1000;

export interface MockPickMeshOptions {
  bodyId?: string | null | undefined;
  isVisible?: boolean | undefined;
  isEnabled?: boolean | undefined;
  /** fallback 투영용 world 위치 (마커 화면 좌표 통제). */
  world?: Vector3 | undefined;
  /** metadata 자체를 없앰 (궤도선/배경 mesh 모사). */
  noMetadata?: boolean | undefined;
}

/** picking 헬퍼가 실제 호출하는 표면(metadata/isVisible/isEnabled/getAbsolutePosition)만 모킹. */
export function mockPickMesh(o: MockPickMeshOptions) {
  const world = o.world ?? new Vector3(0, 0, 0);
  return {
    metadata: o.noMetadata ? null : { bodyId: o.bodyId ?? null },
    isVisible: o.isVisible ?? true,
    isEnabled: () => o.isEnabled ?? true,
    getAbsolutePosition: () => world,
  };
}

export type MockPickMesh = ReturnType<typeof mockPickMesh>;

export interface MockPickingSceneOptions {
  /** scene.pick 결과 (1차) — { hit, pickedMesh } 또는 miss. */
  pickResult?: { hit: boolean; pickedMesh?: MockPickMesh } | undefined;
  meshes?: MockPickMesh[] | undefined;
  /**
   * #719 — scene.multiPick 결과 (복수형). { distance, pickedMesh }[] 의 PickingInfo 배열 모사.
   * **의도적으로 distance 비정렬 순서로 줄 수 있다** — resolvePickedBodyIds 가 명시 정렬하는지 검증.
   */
  multiPickResult?: { distance: number; pickedMesh: MockPickMesh }[] | undefined;
}

/**
 * pick/multiPick/투영 행렬 표면만 갖는 최소 씬 모킹.
 * `getTransformMatrix` 는 호출측이 항등 행렬 전제로 화면 좌표를 역산하므로 여기서 고정하지 않고
 * 호출측 좌표 통제 규약 (worldForScreen) 과 함께 항등을 유지한다.
 */
export function mockPickingScene(o: MockPickingSceneOptions) {
  const meshes = o.meshes ?? [];
  return {
    // predicate 를 받지만 1차 테스트는 미리 정한 pickResult 반환 (Babylon ray 모킹 회피).
    pick: (_x: number, _y: number, _pred: (m: unknown) => boolean) =>
      o.pickResult ?? { hit: false },
    // #719 — multiPick 은 predicate 통과 mesh 만 (있으면). multiPickResult 의 mesh 에 predicate 적용.
    multiPick: (_x: number, _y: number, pred?: (m: unknown) => boolean) => {
      const all = o.multiPickResult ?? [];
      return pred ? all.filter((pk) => pred(pk.pickedMesh)) : all;
    },
    getTransformMatrix: () => Matrix.Identity(),
    getEngine: () => ({
      getRenderWidth: () => MOCK_PICKING_SCENE_WIDTH,
      getRenderHeight: () => MOCK_PICKING_SCENE_HEIGHT,
    }),
    meshes,
  };
}

/** #719 — PickingInfo 모사 헬퍼 ({ distance, pickedMesh }). */
export function pickInfo(distance: number, mesh: MockPickMesh) {
  return { distance, pickedMesh: mesh };
}

// ---------------------------------------------------------------------------
// 키보드 씬 하니스 (#699/#704 WASD 계열)
// ---------------------------------------------------------------------------

export interface KeyboardSceneHarnessOptions {
  /** 카메라 시선 방향 (기본 +Z). `getDirection(Forward)` 가 그대로 반환. */
  forward?: Vector3 | undefined;
  radius?: number | undefined;
  deltaTimeMs?: number | undefined;
  /**
   * `getDirection(Up)` 반환값 (기본 월드 Up). Q/E 월드 절대 up 검증 시
   * 기울인 local up (예: +X 수평) 을 주입해 "local up 미사용" 을 판별한다.
   */
  localUp?: Vector3 | undefined;
}

export interface KeyboardSceneHarness {
  camera: ArcRotateCamera;
  scene: Scene;
  press: (key: string) => void;
  release: (key: string) => void;
  frame: () => void;
  setDeltaTime: (ms: number) => void;
  forward: Vector3;
}

/**
 * 실 Observable/Vector3 + duck-typed 카메라·엔진을 갖춘 최소 키보드 씬 하니스.
 *
 * - `getDirection(Forward)` 는 forward 방향을 그대로 반환 (회전 행렬 모사 불필요 — 산식 검증 목적).
 * - `getDeltaTime()` 은 가변 deltaTime (frame-rate 독립 검증) — `setDeltaTime` 으로 변경.
 * - position = target − forward×radius (ArcRotate 기하 일관).
 * - `document.activeElement` 가드는 node/jsdom 기본 상태에서 통과한다.
 *
 * SUT 배선 (`attachWasdControl(h.camera, h.scene, ...)`) 은 호출측 책임 (파일 상단 격리 원칙).
 */
export function makeKeyboardSceneHarness(
  opts: KeyboardSceneHarnessOptions = {},
): KeyboardSceneHarness {
  const forward = (opts.forward ?? new Vector3(0, 0, 1)).clone();
  const localUp = opts.localUp ?? Vector3.Up();
  let deltaTimeMs = opts.deltaTimeMs ?? 16;
  const onKeyboardObservable = new Observable<KeyboardInfo>();
  const onBeforeRenderObservable = new Observable<Scene>();

  const camera = {
    target: Vector3.Zero(),
    position: forward.scale(-(opts.radius ?? 100)), // position = target − forward×radius
    radius: opts.radius ?? 100,
    getDirection: (axis: Vector3) =>
      axis.equals(Vector3.Forward()) ? forward.clone() : localUp.clone(),
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

  return { camera, scene, press, release, frame, setDeltaTime, forward };
}
