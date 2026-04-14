import {
  Color3,
  Color4,
  HemisphericLight,
  MeshBuilder,
  PointLight,
  StandardMaterial,
  Vector3,
  type Mesh,
  type Scene,
} from '@babylonjs/core';
import { AU, GRAVITATIONAL_CONSTANT, J2000_JD } from '@astro-simulator/shared';
import { getSolarSystem, type LoadedCelestialBody } from '../ephemeris/solar-system-loader.js';
import { positionAt } from '../physics/kepler.js';
import { add } from '../coords/vec3.js';

/**
 * 씬 단위: 1 scene unit = 1 AU.
 * float32/logarithmic depth 조합으로 지구 표면(수 μ AU) ~ 해왕성 궤도(30 AU) 범위 커버.
 */
const SCENE_UNIT_PER_METER = 1 / AU;

/**
 * 행성/달 시각 스케일 — 실제 크기로 표시하면 점으로만 보이므로 배율 적용.
 * 시각 일관성을 위해 종류별로 다른 배율 사용.
 * C3에서 실용 검증, C7에서 스케일 전환 시 동적 조정 가능성 있음.
 */
const PLANET_VISUAL_SCALE = 500;
const STAR_VISUAL_SCALE = 20;
const MOON_VISUAL_SCALE = 500;

export interface SolarSystemSceneHandles {
  /** id → 메쉬 */
  meshes: Map<string, Mesh>;
  /** 주어진 Julian Date 시점으로 모든 천체 위치 갱신 */
  updateAt: (julianDate: number) => void;
  /** 궤도선 가시성 토글 */
  setOrbitLinesVisible: (visible: boolean) => void;
  dispose: () => void;
}

export interface SolarSystemSceneOptions {
  /** 초기 시각 (Julian Date). 기본: J2000.0 */
  initialJulianDate?: number;
  /** 궤도선 초기 가시성. 기본: true */
  showOrbitLines?: boolean;
}

/**
 * 태양계 씬 — JPL 궤도 요소 + Kepler 해석해로 천체 배치.
 *
 * B3 createSunEarthDemo를 대체한다.
 * C4 (#16)에서 달 궤도 세부 조정, C5/C6에서 시간·카메라 시스템과 연동.
 */
export function createSolarSystemScene(
  scene: Scene,
  options: SolarSystemSceneOptions = {},
): SolarSystemSceneHandles {
  const { initialJulianDate = J2000_JD, showOrbitLines = true } = options;

  const system = getSolarSystem();
  const bodiesById = new Map(system.bodies.map((b) => [b.id, b]));
  const meshes = new Map<string, Mesh>();
  const orbitLines: Mesh[] = [];
  const disposables: { dispose: () => void }[] = [];

  // 배경 톤
  scene.clearColor = new Color4(0.031, 0.035, 0.051, 1);

  // 약한 전역 조명 (태양 뒤편도 약간 보이게)
  const ambient = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.08;
  ambient.groundColor = new Color3(0.01, 0.01, 0.02);

  // 태양 중심 포인트 라이트
  const sunLight = new PointLight('sun-light', new Vector3(0, 0, 0), scene);
  sunLight.intensity = 2.5;
  sunLight.diffuse = new Color3(1, 0.95, 0.8);

  // 각 바디 메쉬 생성
  for (const body of system.bodies) {
    const mesh = createBodyMesh(body, scene);
    meshes.set(body.id, mesh);
  }

  // 궤도선 생성 (부모 중심)
  for (const body of system.bodies) {
    if (!body.orbit) continue;
    const line = createOrbitLine(body, scene);
    if (line) {
      line.isVisible = showOrbitLines;
      orbitLines.push(line);
      disposables.push({ dispose: () => line.dispose() });
    }
  }

  // 재사용 버퍼 — 프레임당 Map/Vec3 재할당을 피한다 (#76).
  // Vec3Double은 readonly 튜플이라 내부 계산 버퍼는 mutable tuple로 유지.
  type MutVec3 = [number, number, number];
  const localPositions = new Map<string, MutVec3>();
  const worldPositions = new Map<string, MutVec3>();
  const ZERO: MutVec3 = [0, 0, 0];
  for (const body of system.bodies) {
    localPositions.set(body.id, [0, 0, 0]);
    worldPositions.set(body.id, [0, 0, 0]);
  }
  const resolved = new Set<string>();

  const updateAt = (jd: number) => {
    // 1) 각 바디의 부모-로컬 좌표 계산 (부모가 없으면 (0,0,0))
    for (const body of system.bodies) {
      const buf = localPositions.get(body.id)!;
      if (!body.orbit || !body.parentId) {
        buf[0] = 0;
        buf[1] = 0;
        buf[2] = 0;
        continue;
      }
      const parent = bodiesById.get(body.parentId);
      if (!parent) continue;
      const mu = GRAVITATIONAL_CONSTANT * parent.mass;
      const p = positionAt(body.orbit, jd, mu);
      buf[0] = p[0];
      buf[1] = p[1];
      buf[2] = p[2];
    }

    // 2) 월드 절대 좌표 — 부모 체인 누적 (태양이 원점)
    resolved.clear();
    const resolveWorld = (id: string): MutVec3 => {
      if (resolved.has(id)) return worldPositions.get(id) ?? ZERO;
      const body = bodiesById.get(id);
      if (!body) return ZERO;
      const local = localPositions.get(id) ?? ZERO;
      const world = worldPositions.get(id)!;
      if (!body.parentId) {
        world[0] = local[0];
        world[1] = local[1];
        world[2] = local[2];
      } else {
        const parentWorld = resolveWorld(body.parentId);
        const sum = add(parentWorld, local);
        world[0] = sum[0];
        world[1] = sum[1];
        world[2] = sum[2];
      }
      resolved.add(id);
      return world;
    };
    for (const body of system.bodies) resolveWorld(body.id);

    // 3) 메쉬 위치 갱신 (미터 → 씬 단위)
    for (const [id, world] of worldPositions) {
      const mesh = meshes.get(id);
      if (!mesh) continue;
      mesh.position.set(
        world[0] * SCENE_UNIT_PER_METER,
        world[1] * SCENE_UNIT_PER_METER,
        world[2] * SCENE_UNIT_PER_METER,
      );
    }

    // 4) 태양 포인트 라이트를 태양 위치로 이동 (태양 이동은 없지만 안전장치)
    const sunWorld = worldPositions.get('sun') ?? [0, 0, 0];
    sunLight.position.set(
      sunWorld[0] * SCENE_UNIT_PER_METER,
      sunWorld[1] * SCENE_UNIT_PER_METER,
      sunWorld[2] * SCENE_UNIT_PER_METER,
    );
  };

  const setOrbitLinesVisible = (visible: boolean) => {
    for (const line of orbitLines) line.isVisible = visible;
  };

  // 초기 시점 적용
  updateAt(initialJulianDate);

  return {
    meshes,
    updateAt,
    setOrbitLinesVisible,
    dispose: () => {
      ambient.dispose();
      sunLight.dispose();
      for (const d of disposables) d.dispose();
      for (const m of meshes.values()) {
        m.material?.dispose();
        m.dispose();
      }
      meshes.clear();
    },
  };
}

function visualScaleOf(body: LoadedCelestialBody): number {
  if (body.kind === 'star') return STAR_VISUAL_SCALE;
  if (body.kind === 'moon') return MOON_VISUAL_SCALE;
  return PLANET_VISUAL_SCALE;
}

function createBodyMesh(body: LoadedCelestialBody, scene: Scene): Mesh {
  const scale = visualScaleOf(body);
  const diameter = body.radius * 2 * scale * SCENE_UNIT_PER_METER;
  const mesh = MeshBuilder.CreateSphere(body.id, { diameter, segments: 32 }, scene);

  const mat = new StandardMaterial(`${body.id}-mat`, scene);
  const hex = body.colorHint?.hex ?? '#888888';
  const c = hexToColor3(hex);
  if (body.kind === 'star') {
    mat.emissiveColor = c;
    mat.disableLighting = true;
  } else {
    mat.diffuseColor = c;
    mat.specularColor = new Color3(0.05, 0.05, 0.05);
  }
  mesh.material = mat;
  return mesh;
}

function createOrbitLine(body: LoadedCelestialBody, scene: Scene): Mesh | null {
  if (!body.orbit || !body.parentId) return null;
  const orbit = body.orbit;
  // 궤도 한 바퀴 샘플링 (진근점각 기준 등간격)
  const segments = 64; // 성능 최적화 (P1 E3)
  const points: Vector3[] = [];

  const cosO = Math.cos(orbit.longitudeOfAscendingNode);
  const sinO = Math.sin(orbit.longitudeOfAscendingNode);
  const cosI = Math.cos(orbit.inclination);
  const sinI = Math.sin(orbit.inclination);
  const cosW = Math.cos(orbit.argumentOfPeriapsis);
  const sinW = Math.sin(orbit.argumentOfPeriapsis);

  for (let s = 0; s <= segments; s += 1) {
    const nu = (s / segments) * Math.PI * 2;
    const r =
      (orbit.semiMajorAxis * (1 - orbit.eccentricity * orbit.eccentricity)) /
      (1 + orbit.eccentricity * Math.cos(nu));
    const xOrb = r * Math.cos(nu);
    const yOrb = r * Math.sin(nu);
    const x1 = cosW * xOrb - sinW * yOrb;
    const y1 = sinW * xOrb + cosW * yOrb;
    const y2 = cosI * y1;
    const z2 = sinI * y1;
    const x = cosO * x1 - sinO * y2;
    const y = sinO * x1 + cosO * y2;
    points.push(
      new Vector3(x * SCENE_UNIT_PER_METER, y * SCENE_UNIT_PER_METER, z2 * SCENE_UNIT_PER_METER),
    );
  }

  const line = MeshBuilder.CreateLines(`${body.id}-orbit`, { points }, scene);
  line.color = new Color3(0.25, 0.28, 0.4);
  return line;
}

function hexToColor3(hex: string): Color3 {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return new Color3(r, g, b);
}
