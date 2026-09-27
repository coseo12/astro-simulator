/**
 * #1265 — 런타임 표시 토글 scene setter 3종 (NullEngine — 실 GPU 불필요).
 *
 * ADR `docs/decisions/20260927-1265-runtime-display-toggles.md` §결정 2 · 3 · 4 를 **구조**로 잰다.
 * 픽셀 동등성 (런타임 OFF 화면 = `?x=off` 로드 화면) 은 브라우저 가드 `verify:1265-display-panel` 이 잰다 —
 * 여기서는 픽셀이 못 보는 축 (계열 레지스트리 누적 · lazy variant 등록 · 일시정지 중 드리프트 동기 ·
 * 이후 생성되는 머티리얼의 uniform) 을 직접 읽는다.
 *
 * 비교 기준은 항상 **같은 옵션의 로드 경로 scene** 이다 (「런타임 = 로드」 계약). 로드 쪽 값을 기대값으로
 * 하드코딩하지 않는다 — 로드 경로가 바뀌면 두 쪽이 함께 움직여야 한다.
 *
 * ⚠️ 전체 scene 을 NullEngine 에서 세우려면 `OffscreenCanvas` 가 필요하다 — 절차 표면 머티리얼이 1×1
 * placeholder 를 `DynamicTexture` 로 만들고 (`surface-mask-texture.ts`), Babylon 은 node 에서 그 캔버스를
 * `OffscreenCanvas` 로 만든다. 아래 스텁은 2D 컨텍스트 호출을 삼키기만 한다 (텍스처 내용은 이 테스트의
 * 판정 대상이 아니다).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ArcRotateCamera,
  NullEngine,
  Quaternion,
  RenderingGroup,
  Scene,
  StandardMaterial,
  Vector3,
  type AbstractMesh,
  type Material,
} from '@babylonjs/core';
import { createSolarSystemScene, type SolarSystemSceneHandles } from './solar-system-scene.js';
import { HOST_FAMILY_RANK, HostFamilyRegistry } from './cloud-layer.js';
import { isProceduralPlanetMaterial, NIGHT_LIGHT_STRENGTH } from './procedural-planet-shader.js';

/** 앱 기본 뷰포트와 같은 종횡비 (`procedural-planet-mask-lod.test.ts` 와 같은 값). */
const RENDER_WIDTH = 1280;
const RENDER_HEIGHT = 720;
/** 왕복 횟수 — 계약 D6 「on/off 3회 왕복 후 누수 0」. */
const ROUND_TRIPS = 3;
/** 자전 ON 에서 구름 상대 자전이 identity 가 아닌 JD (가드 `verify:1215` 결정적 프레임 JD 와 같은 값). */
const T_JD = 2451626.0;

const CLOUD_MESH = 'earth-cloud';
const STARFIELD_MESH = 'starfield';
const EARTH_MID = 'earth-lod-mid';
const EARTH_LOW = 'earth-lod-low';

// ─── OffscreenCanvas 스텁 (파일 헤더 ⚠️) ────────────────────────────────────
class StubOffscreenCanvas {
  constructor(
    public width: number,
    public height: number,
  ) {}
  getContext(): unknown {
    // 어떤 2D 호출도 삼킨다. `getImageData` 류가 호출돼도 최소 형태를 돌려준다.
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

// ─── 픽스처 ──────────────────────────────────────────────────────────────
interface Fixture {
  scene: Scene;
  handles: SolarSystemSceneHandles;
  dispose: () => void;
}

const fixtures: Fixture[] = [];
afterEach(() => {
  for (const f of fixtures.splice(0)) f.dispose();
  vi.restoreAllMocks();
});

type SceneOptions = Parameters<typeof createSolarSystemScene>[1];

/** web 기본 로드 (`surface` · `clouds` · `nightlights` · `stars` 전부 ON) 에서 필요한 축만 덮어쓴다. */
function makeScene(overrides: SceneOptions = {}): Fixture {
  const engine = new NullEngine({
    renderWidth: RENDER_WIDTH,
    renderHeight: RENDER_HEIGHT,
    textureSize: 512,
    deterministicLockstep: false,
    lockstepMaxSteps: 1,
  });
  const scene = new Scene(engine);
  scene.activeCamera = new ArcRotateCamera('cam', 0, Math.PI / 2, 50, Vector3.Zero(), scene);
  const handles = createSolarSystemScene(scene, {
    initialJulianDate: T_JD,
    starfield: true,
    surfaceDetail: true,
    clouds: true,
    nightLights: true,
    ...overrides,
  });
  const f: Fixture = {
    scene,
    handles,
    dispose: () => {
      handles.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
  fixtures.push(f);
  return f;
}

const countByName = (scene: Scene, name: string) =>
  scene.meshes.filter((m) => m.name === name).length;

/** Babylon internal — 렌더링 그룹 0 (없으면 생성자 기본값으로 만든다 — `setRenderingOrder` 가 남긴 custom 반영). */
interface GroupInternals {
  _transparentSortCompareFn: unknown;
  _opaqueSortCompareFn: unknown;
}
const group0 = (scene: Scene): GroupInternals =>
  (
    scene as unknown as {
      _renderingManager: { getRenderingGroup: (id: number) => GroupInternals };
    }
  )._renderingManager.getRenderingGroup(0);

/** 계열 레지스트리 인스턴스 포착 — scene 클로저 내부라 `registerHost` 의 `this` 로 잡는다. */
function captureRegistry(): () => HostFamilyRegistry | undefined {
  const spy = vi.spyOn(HostFamilyRegistry.prototype, 'registerHost');
  return () => spy.mock.contexts[0] as HostFamilyRegistry | undefined;
}

/** LOD 를 강제해 variant 를 lazy 생성시킨다 (프레임 위상 1회). */
function forceLod(f: Fixture, level: 'mid' | 'low' | 'auto') {
  f.handles.setLodOverride(level);
  f.handles.runFramePass();
}

const lightStrength = (m: Material | null | undefined) =>
  (m as unknown as { _floats?: Record<string, number> })?._floats?.nightLightStrength;

// ─── 구름 (§결정 2) ────────────────────────────────────────────────────────
describe('#1265 setCloudsVisible — OFF 는 로드 OFF 와 구조 동일', () => {
  it('로드 ON → 런타임 OFF: 구름 mesh 0 · 그룹 0 투명/불투명 정렬 = 생성자 기본값', () => {
    const f = makeScene();
    expect(countByName(f.scene, CLOUD_MESH)).toBe(1);
    expect(group0(f.scene)._transparentSortCompareFn).not.toBe(
      RenderingGroup.defaultTransparentSortCompare,
    );

    f.handles.setCloudsVisible(false);

    expect(countByName(f.scene, CLOUD_MESH)).toBe(0);
    expect(group0(f.scene)._transparentSortCompareFn).toBe(
      RenderingGroup.defaultTransparentSortCompare,
    );
    expect(group0(f.scene)._opaqueSortCompareFn).toBe(RenderingGroup.PainterSortCompare);
    // 로드 OFF 페이지와 같은 값인지 — 기대값을 하드코딩하지 않고 로드 경로에서 읽는다.
    const loadOff = makeScene({ clouds: false });
    expect(group0(f.scene)._transparentSortCompareFn).toBe(
      group0(loadOff.scene)._transparentSortCompareFn,
    );
  });

  it('OFF 는 계열 레지스트리를 비운다 — dispose 된 구름 mesh 가 키로 남지 않는다 (clear 누락 변이)', () => {
    const registry = captureRegistry();
    const f = makeScene();
    const reg = registry();
    expect(reg).toBeDefined();
    const earth = f.handles.meshes.get('earth')!;
    const firstCloud = f.scene.getMeshByName(CLOUD_MESH)!;
    expect(reg!.resolve(firstCloud)).toBeDefined();

    const deadClouds: AbstractMesh[] = [firstCloud];
    f.handles.setCloudsVisible(false);
    for (let i = 0; i < ROUND_TRIPS; i += 1) {
      f.handles.setCloudsVisible(true);
      deadClouds.push(f.scene.getMeshByName(CLOUD_MESH)!);
      f.handles.setCloudsVisible(false);
    }

    for (const dead of deadClouds) expect(reg!.resolve(dead)).toBeUndefined();
    expect(reg!.isHost(earth)).toBe(false);
  });

  it(`on/off ${ROUND_TRIPS}회 왕복 — 구름 mesh ≤ 1 · meshes/materials 개수 왕복 전과 동일 (누수 0)`, () => {
    const f = makeScene();
    const meshesBefore = f.scene.meshes.length;
    const materialsBefore = f.scene.materials.length;
    for (let i = 0; i < ROUND_TRIPS; i += 1) {
      f.handles.setCloudsVisible(false);
      expect(countByName(f.scene, CLOUD_MESH)).toBe(0);
      f.handles.setCloudsVisible(true);
      expect(countByName(f.scene, CLOUD_MESH)).toBe(1);
    }
    expect(f.scene.meshes.length).toBe(meshesBefore);
    expect(f.scene.materials.length).toBe(materialsBefore);
  });

  it('같은 상태 요청은 멱등 — ON 반복은 새 구름을 만들지 않는다', () => {
    const f = makeScene();
    const cloud = f.scene.getMeshByName(CLOUD_MESH);
    f.handles.setCloudsVisible(true);
    f.handles.setCloudsVisible(true);
    expect(f.scene.getMeshByName(CLOUD_MESH)).toBe(cloud);
    f.handles.setCloudsVisible(false);
    expect(() => f.handles.setCloudsVisible(false)).not.toThrow();
  });

  it('surfaceDetail=false 면 no-op (유효 조건 `clouds && surfaceDetail`)', () => {
    const f = makeScene({ surfaceDetail: false, clouds: false });
    const meshesBefore = f.scene.meshes.length;
    f.handles.setCloudsVisible(true);
    expect(countByName(f.scene, CLOUD_MESH)).toBe(0);
    expect(f.scene.meshes.length).toBe(meshesBefore);
  });
});

describe('#1265 setCloudsVisible — ON 은 로드 ON 과 같은 상태', () => {
  it('로드 OFF → 런타임 ON: 구름 1 · 정렬 함수 설치 (로드 ON 과 같이 기본값이 아니다)', () => {
    const f = makeScene({ clouds: false });
    f.handles.setCloudsVisible(true);
    expect(countByName(f.scene, CLOUD_MESH)).toBe(1);
    expect(group0(f.scene)._transparentSortCompareFn).not.toBe(
      RenderingGroup.defaultTransparentSortCompare,
    );
  });

  it('OFF 동안 lazy 생성된 earth mid·low 를 계열에 편입한다 (등록 누락 변이)', () => {
    const registry = captureRegistry();
    const f = makeScene({ clouds: false });
    forceLod(f, 'mid');
    forceLod(f, 'low');
    const mid = f.scene.getMeshByName(EARTH_MID)!;
    const low = f.scene.getMeshByName(EARTH_LOW)!;
    expect(mid).not.toBeNull();
    expect(low).not.toBeNull();

    f.handles.setCloudsVisible(true);

    const reg = registry()!;
    const earth = f.handles.meshes.get('earth')!;
    expect(reg.resolve(mid)?.host).toBe(earth);
    expect(reg.resolve(low)?.host).toBe(earth);
    // 로드 ON 의 lazy 생성 지점 (`getVariantMesh`) 과 같은 rank — 구름 (`CLOUD_SORT_RANK`) 보다 앞에 그려진다.
    expect(reg.resolve(mid)?.rank).toBe(HOST_FAMILY_RANK);
    expect(reg.resolve(low)?.rank).toBe(HOST_FAMILY_RANK);
  });

  it('일시정지 (updateAt 없음) 중 켜도 구름 상대 자전이 로드 ON 과 같다 (즉시 동기 누락 변이)', () => {
    const f = makeScene({ clouds: false, selfRotation: true });
    f.handles.setCloudsVisible(true);
    const runtimeQ = f.scene.getMeshByName(CLOUD_MESH)!.rotationQuaternion!;

    const loadOn = makeScene({ selfRotation: true });
    const loadQ = loadOn.scene.getMeshByName(CLOUD_MESH)!.rotationQuaternion!;

    // 전제 — 이 JD 에서 드리프트가 identity 가 아니어야 이 검사가 판별력을 가진다.
    expect(loadQ.equalsWithEpsilon(Quaternion.Identity(), 1e-9)).toBe(false);
    expect([runtimeQ.x, runtimeQ.y, runtimeQ.z, runtimeQ.w]).toEqual([
      loadQ.x,
      loadQ.y,
      loadQ.z,
      loadQ.w,
    ]);
  });

  it('자전 OFF 면 켤 때 드리프트를 쓰지 않는다 (`?rotate=off` 구조적 상속 — identity)', () => {
    const f = makeScene({ clouds: false, selfRotation: false });
    f.handles.setCloudsVisible(true);
    const q = f.scene.getMeshByName(CLOUD_MESH)!.rotationQuaternion!;
    expect([q.x, q.y, q.z, q.w]).toEqual([0, 0, 0, 1]);
  });
});

// ─── 별 배경 (§결정 3) ─────────────────────────────────────────────────────
describe('#1265 setStarfieldVisible — 없을 때만 생성, 이후 setEnabled', () => {
  it('로드 OFF → ON: starfield 정확히 1 · 이후 왕복은 같은 인스턴스 (재생성 0)', () => {
    const f = makeScene({ starfield: false });
    expect(countByName(f.scene, STARFIELD_MESH)).toBe(0);
    f.handles.setStarfieldVisible(true);
    const created = f.scene.getMeshByName(STARFIELD_MESH)!;
    const materialId = created.material!.uniqueId;
    for (let i = 0; i < ROUND_TRIPS; i += 1) {
      f.handles.setStarfieldVisible(false);
      expect(created.isEnabled()).toBe(false);
      f.handles.setStarfieldVisible(true);
      expect(created.isEnabled()).toBe(true);
    }
    expect(countByName(f.scene, STARFIELD_MESH)).toBe(1);
    expect(f.scene.getMeshByName(STARFIELD_MESH)).toBe(created);
    expect(created.material!.uniqueId).toBe(materialId);
  });

  it('로드 ON → OFF: 로드 시 생성된 인스턴스를 비활성화만 한다 (불투명 큐 순서 보존)', () => {
    const f = makeScene();
    const loaded = f.scene.getMeshByName(STARFIELD_MESH)!;
    f.handles.setStarfieldVisible(false);
    expect(loaded.isEnabled()).toBe(false);
    f.handles.setStarfieldVisible(true);
    expect(f.scene.getMeshByName(STARFIELD_MESH)).toBe(loaded);
    expect(countByName(f.scene, STARFIELD_MESH)).toBe(1);
  });

  it('로드 OFF 에서 OFF 요청은 생성하지 않는다', () => {
    const f = makeScene({ starfield: false });
    f.handles.setStarfieldVisible(false);
    expect(countByName(f.scene, STARFIELD_MESH)).toBe(0);
  });

  it('런타임 생성분도 scene dispose 에서 해제된다 (슬롯 disposer)', () => {
    const f = makeScene({ starfield: false });
    f.handles.setStarfieldVisible(true);
    const created = f.scene.getMeshByName(STARFIELD_MESH)!;
    f.handles.dispose();
    expect(created.isDisposed()).toBe(true);
    // afterEach 의 dispose 재호출에 대비해 handles.dispose 를 no-op 으로 바꾸지 않는다 — 두 번 불려도 안전해야 한다.
  });
});

// ─── 야간 불빛 (§결정 4) ───────────────────────────────────────────────────
describe('#1265 setNightLightsVisible — 상태 + 기존 머티리얼 uniform', () => {
  const proceduralMaterials = (f: Fixture) =>
    f.scene.materials.filter((m) => isProceduralPlanetMaterial(m));

  it('로드 ON → OFF: 절차 행성 머티리얼 전부 0 · 다시 ON 이면 로드 값', () => {
    const f = makeScene();
    const mats = proceduralMaterials(f);
    expect(mats.length).toBeGreaterThan(0);
    const loadValue = lightStrength(mats[0]);
    expect(loadValue).toBe(NIGHT_LIGHT_STRENGTH);

    f.handles.setNightLightsVisible(false);
    for (const m of mats) expect(lightStrength(m), m.name).toBe(0);

    f.handles.setNightLightsVisible(true);
    for (const m of mats) expect(lightStrength(m), m.name).toBe(loadValue);
  });

  it('OFF 이후 lazy 생성되는 mid 도 0 (상태 미갱신 변이) — 로드 OFF 와 같다', () => {
    const f = makeScene();
    f.handles.setNightLightsVisible(false);
    forceLod(f, 'mid');
    const mid = f.scene.getMeshByName(EARTH_MID)!;
    expect(mid).not.toBeNull();
    expect(lightStrength(mid.material)).toBe(0);
    for (const m of proceduralMaterials(f)) expect(lightStrength(m), m.name).toBe(0);

    const loadOff = makeScene({ nightLights: false });
    forceLod(loadOff, 'mid');
    expect(lightStrength(mid.material)).toBe(
      lightStrength(loadOff.scene.getMeshByName(EARTH_MID)!.material),
    );
  });

  it('이미 생성된 mid 도 갱신한다 (기존 머티리얼 미갱신 변이)', () => {
    const f = makeScene();
    forceLod(f, 'mid');
    const mid = f.scene.getMeshByName(EARTH_MID)!;
    expect(lightStrength(mid.material)).toBe(NIGHT_LIGHT_STRENGTH);
    f.handles.setNightLightsVisible(false);
    expect(lightStrength(mid.material)).toBe(0);
  });

  it('로드 OFF → ON: 기존 · 이후 생성 머티리얼 모두 로드 ON 값', () => {
    const f = makeScene({ nightLights: false });
    f.handles.setNightLightsVisible(true);
    forceLod(f, 'mid');
    for (const m of proceduralMaterials(f))
      expect(lightStrength(m), m.name).toBe(NIGHT_LIGHT_STRENGTH);
  });

  it('surfaceDetail=false 면 no-op (절차 머티리얼이 없다 · 이후 생성분에도 영향 0)', () => {
    const f = makeScene({ surfaceDetail: false, nightLights: false });
    expect(proceduralMaterials(f)).toHaveLength(0);
    expect(() => f.handles.setNightLightsVisible(true)).not.toThrow();
    forceLod(f, 'mid');
    expect(proceduralMaterials(f)).toHaveLength(0);
  });
});

describe('#1265 isProceduralPlanetMaterial — 생성 함수가 등록한 것만 참', () => {
  it('지구 표면 = 참 / 태양 · 구름 · 별 배경 · StandardMaterial = 거짓', () => {
    const f = makeScene();
    expect(isProceduralPlanetMaterial(f.handles.meshes.get('earth')!.material)).toBe(true);
    expect(isProceduralPlanetMaterial(f.handles.meshes.get('sun')!.material)).toBe(false);
    expect(isProceduralPlanetMaterial(f.scene.getMeshByName(CLOUD_MESH)!.material)).toBe(false);
    expect(isProceduralPlanetMaterial(f.scene.getMeshByName(STARFIELD_MESH)!.material)).toBe(false);
    expect(isProceduralPlanetMaterial(new StandardMaterial('x', f.scene))).toBe(false);
    expect(isProceduralPlanetMaterial(null)).toBe(false);
  });
});
