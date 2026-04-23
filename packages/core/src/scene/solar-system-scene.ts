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
import { FloatingOrigin } from '../coords/floating-origin.js';
import {
  NBodyEngine,
  buildInitialState,
  type GrMode,
  type IntegratorKind,
} from '../physics/nbody-engine.js';
import { BarnesHutNBodyEngine } from '../physics/barnes-hut-engine.js';
import { WebGpuNBodyEngine } from '../physics/webgpu-nbody-engine.js';
import { isWebGpuEngine, WebGpuUnavailableError } from '../gpu/index.js';
import { createAsteroidBelt, type AsteroidBeltHandles } from './asteroid-belt.js';
import { createRingPlaceholder, type RingPlaceholderHandles } from './ring-placeholder.js';
import { createRingShaderMesh, type RingShaderHandles } from './ring-shader.js';
import {
  renderScaleForTier,
  initialTier as defaultInitialTier,
  tierFromFocus,
  tierFromCameraDistance,
  type Tier,
} from './tier.js';
import { runTierTransition } from './tier-transition.js';
import type { ArcRotateCamera } from '@babylonjs/core';

// P12-A #298 — Display-Relative Scale Unification 계약 (ADR 20260423, §결정):
//   1. renderScale 은 tier 함수. SCENE_UNIT_PER_METER 하드코딩 금지 (R4 DoD)
//   2. body mesh 본체는 실측 radius × renderScale — scaling 조작으로 왜곡 금지 (원칙 #1, R3 DoD)
//   3. 거리도 동일 renderScale 적용 (원칙 #4) — orbit line / trail 동일 규칙
//   4. Rust engine 반환 좌표는 heliocentric 절대 m — tier 변환은 렌더 레이어 책임 (R6 DoD)
//   5. [Phase B 활성] tier 전환 시 scale 즉시 setAll + camera.radius 300ms ExponentialEase interp,
//      카메라 입력 500ms 잠금 + onAnimationEnd / fallback setTimeout(lockMs) / visibilitychange 이중·삼중 안전장치
//      (apparent size 불변: radius_old / oldScale == radius_new / newScale, tier-transition.ts)
//   6. Floating Origin: Phase A 는 기존 P11-A 배선 유지 (Phase C 에서 simplify, Q10)
// 위 계약 위배 변경은 즉시 버그로 간주 (CLAUDE.md "주석 계약 vs 구현 drift" 교훈)

/**
 * Floating Origin safety net threshold (P11-A #288, ADR §4).
 *
 * 1 AU (1.496e11 m) — focus body origin shift (primary) 가 이미 focus 전환마다 origin 재배치를 처리하므로
 * safety net 은 free-fly 탐색 중 카메라가 1 AU 이상 이동한 경우만 발동한다.
 * threshold 를 낮추면 빈번한 shift 로 log-depth 재계산 오버헤드 증가 가능.
 */
const FLOATING_ORIGIN_THRESHOLD_METERS = AU;

/**
 * P11-A #288 — dev-only assert gate.
 *
 * core 패키지는 `@types/node` 를 의존으로 두지 않으므로 `process` 가 types 에 없다.
 * runtime 에 `globalThis.process?.env?.NODE_ENV` 를 안전하게 읽고, Next.js webpack 이
 * 빌드 시점에 `NODE_ENV` 를 리터럴 치환 → prod bundle 에선 이 함수가 `false` 를 반환해
 * 하위 assert 블록이 DCE 된다.
 */
function floatingOriginAssertEnabled(): boolean {
  const g = globalThis as { process?: { env?: { NODE_ENV?: string } } };
  const env = g.process?.env?.NODE_ENV;
  return env !== 'production';
}

/**
 * 시각 스케일 — P12-A (#298) 부터 tier 기반 단일 동적 스케일 모드.
 *
 * 메쉬는 실측 반경 × `renderScaleForTier(tier)` 로 고정 크기 생성. `mesh.scaling = 1` 유지
 * (kind 차등 과거 MAX_VISUAL_SCALE_* 폐기, 원칙 #1 상대 비율 실측 고정).
 *
 * Tier 전환 시 orbit line / mesh 직경은 `updateAt` 루프에서 renderScale 재적용으로 일관성 유지.
 * Phase A 는 즉시 점프 flicker 허용 (Phase B 애니메이션 도입 예정).
 */

export interface SolarSystemSceneHandles {
  /** id → 메쉬 */
  meshes: Map<string, Mesh>;
  /** 주어진 Julian Date 시점으로 모든 천체 위치 갱신 */
  updateAt: (julianDate: number) => void;
  /** 궤도선 가시성 토글 */
  setOrbitLinesVisible: (visible: boolean) => void;
  /**
   * P12-A #298 — 현재 활성 tier.
   *
   * 하이브리드 트리거로 자동 결정되지만, 외부에서 강제 지정하고 싶을 때 `setTier` 사용.
   */
  getTier: () => Tier;
  /**
   * P12-A #298 — tier 강제 전환. Phase A 는 즉시 점프 flicker 허용 (Phase B 에서 300ms interp).
   *
   * tier 전환 시:
   *  - orbit line 재샘플링 (새 renderScale 반영)
   *  - mesh 직경 재계산 (실측 radius × 새 renderScale)
   *  - 다음 `updateAt` 호출부터 mesh.position 이 새 renderScale 로 기록
   */
  setTier: (tier: Tier) => void;
  /**
   * P12-A #298 — 하이브리드 트리거 자동 판정 (Q7=7-d2).
   *
   * focus 있으면 focus body kind + 카메라 거리로, 없으면 카메라-원점 거리로 tier 결정.
   * 히스테리시스 ±15% 로 왕복 flicker 방지 (A2 DoD).
   *
   * @param cameraFromSunMeters 카메라 위치에서 원점(태양)까지 거리 (m)
   * @param cameraFromFocusMeters focus body 에서 카메라까지 거리 (m). focusBodyId=null 이면 무시
   */
  updateTierByCamera: (cameraFromSunMeters: number, cameraFromFocusMeters: number) => Tier;
  /**
   * P10-D #263 — body 의 위치/속도 state vector (parent-centric, m / m·s⁻¹).
   * Newton 경로: 엔진 state 에서 직접 추출 (forward-diff noise 없음).
   * Kepler 경로 및 state 미존재 시 null — 호출자가 polling fallback 처리.
   *
   * @param id body id (예: 'io', 'earth')
   * @param parentId parent body id (예: Galilean 은 'jupiter'). id 와 동일하면 null 반환.
   */
  getBodyState: (
    id: string,
    parentId: string,
  ) => { pos: [number, number, number]; vel: [number, number, number] } | null;
  /** 런타임 엔진 전환. 현재 jd에서 Newton 초기 상태 재빌드 (심리스). */
  setPhysicsEngine: (kind: PhysicsEngineKind) => void;
  /** 현재 활성 엔진 */
  getPhysicsEngine: () => PhysicsEngineKind;
  /** 바디 질량 배수 설정. Newton 엔진 재빌드를 유발한다. Kepler 모드에서는 저장만 됨. */
  setBodyMassMultiplier: (bodyId: string, multiplier: number) => void;
  /** 모든 배수를 1.0으로 리셋 + Newton 재빌드. */
  resetMassMultipliers: () => void;
  /** P5-C #179 — force/integrator 셰이더별 GPU ms. WebGPU 엔진 + gpuTimer 활성 시만. */
  readShaderTimings: () => { forceMs: number | null; integratorMs: number | null } | null;
  /**
   * P11-A #288 — Floating Origin 인스턴스.
   *
   * T3 body tier (P12 단일 모드) 에서 float32 jitter 해소를 위해 scene 내부가 매 프레임
   * `fo.toLocal(world)` 적용. T1/T2 에서는 originOffset=[0,0,0] 유지 (ADR §4 Q10 판정).
   * 외부 노출은 (a) dev 빌드 `__floatingOrigin` 전역 + (b) 미래 Trail 모듈의 `onOriginShift`
   * 구독을 위함. Zustand store 는 이 값을 저장하지 않는다 (Heliocentric 불변식 — ADR §3).
   */
  floatingOrigin: FloatingOrigin;
  /**
   * P11-A #288 — focus 전환 hook (primary origin shift).
   *
   * `CameraController.focusOn(mesh)` 와 동일 시점에 호출. 해당 body 의 월드 좌표로 origin 즉시 재배치
   * → focus body 는 scene 원점 근처에서 렌더되어 float32 jitter 제거. `bodyId` 미존재 시 no-op.
   *
   * **호출 타이밍**: `setCameraHandlers` focus 콜백에서 `controller.focusOn` 과 같은 프레임에 호출.
   * 내부적으로 `updateAt` 이 다음 프레임에 origin 반영된 local 좌표로 mesh.position 을 재기록하므로
   * focus animation (300ms) 중에도 일관된 좌표계 유지.
   */
  setFocusOrigin: (bodyId: string) => void;
  /**
   * P12-A #298 — focus 해제 (reset 등). tier 가 free-fly 경로로 자동 전환되도록 focus id 를 null 로 돌린다.
   */
  clearFocus: () => void;
  dispose: () => void;
}

export type PhysicsEngineKind = 'kepler' | 'newton' | 'barnes-hut' | 'webgpu' | 'auto';

export interface SolarSystemSceneOptions {
  /** 초기 시각 (Julian Date). 기본: J2000.0 */
  initialJulianDate?: number;
  /** 궤도선 초기 가시성. 기본: true */
  showOrbitLines?: boolean;
  /** 물리 엔진 선택. 기본: 'kepler' (해석해). 'newton'은 #86에서 추가. */
  physicsEngine?: PhysicsEngineKind;
  /** 소행성대 샘플 수. 0 또는 undefined면 생성 안 함. */
  asteroidBeltN?: number;
  /**
   * P4-A #165 — true면 소행성대를 N-body 엔진에 편입한다.
   * Kepler 경로에서는 무시. Newton/Barnes-Hut/WebGPU 선택 시 전체 N이 (행성+소행성)으로 커져
   * BH tree / GPU compute 가속 효과 실측 가능. 기본 false (기존 Kepler 해석해 경로 유지).
   */
  asteroidNbody?: boolean;
  /**
   * P5-A #178 — 1PN GR 보정 활성 (호환 boolean).
   * `true` → `'single-1pn'`, `false` → `'off'` 으로 매핑. Newton 엔진에만 적용.
   * @deprecated P6-C부터 `grMode` 사용 권장.
   */
  enableGR?: boolean;
  /**
   * P6-C #191 — GR 모드. 'off' / 'single-1pn' / 'eih'. 기본 'off'.
   * `enableGR` 와 함께 지정하면 `grMode` 가 우선.
   * Newton 엔진에만 적용 (Barnes-Hut/WebGPU 미지원).
   */
  grMode?: GrMode;
  /**
   * P7-B #207 — 적분기 종류. `'velocity-verlet'` (기본) 또는 `'yoshida4'`.
   * Newton 엔진에만 적용 (Barnes-Hut/WebGPU 는 자체 적분기 사용).
   * 런타임 스위치는 비지원 — 초기화 시점만 결정.
   */
  integrator?: IntegratorKind;
  /**
   * P9 #254 PR-2.5 — 행성 고리 렌더 경로.
   *   - `'shader'` (기본) — `densityProfile[]` uniform + GLSL 선형 보간 (Halo/Main/Gossamer 구분 가능)
   *   - `'fallback'` — M1 백업 (InstancedMesh 입자 분포). shader 실패 또는 수동 테스트용
   *   - `'placeholder'` — PR-1 단색 disk (회귀 검증용, 운영 권장하지 않음)
   * URL `?ring=fallback` 또는 `?ring=placeholder` 로 페이지 측에서 override 가능.
   */
  ringRenderMode?: 'shader' | 'fallback' | 'placeholder';
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
  const {
    initialJulianDate = J2000_JD,
    showOrbitLines = true,
    physicsEngine = 'kepler',
    asteroidBeltN = 0,
    asteroidNbody = false,
    enableGR = false,
    grMode,
    integrator = 'velocity-verlet',
    ringRenderMode = 'shader',
  } = options;
  // grMode 우선 — 미지정 시 enableGR (호환) 반영.
  const resolvedGrMode: GrMode = grMode ?? (enableGR ? 'single-1pn' : 'off');
  const SECONDS_PER_DAY = 86_400;

  const system = getSolarSystem();
  const bodiesById = new Map(system.bodies.map((b) => [b.id, b]));
  const meshes = new Map<string, Mesh>();
  const disposables: { dispose: () => void }[] = [];

  // P12-A #298 — 활성 tier (ADR §1). 초기값 'solar' (전체 태양계 뷰).
  let activeTier: Tier = defaultInitialTier();
  const getTier = (): Tier => activeTier;

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

  // 각 바디 메쉬 생성 — Phase A: 생성 시점 tier 의 renderScale 로 실측 직경 계산 (ADR §주석 계약 §2).
  //
  // Tier 전환 시 mesh.scaling 을 **절대 값** `newScale / initialRenderScale` 로 설정한다.
  // 과거 `scaleInPlace(ratio)` 반복 호출은 부동소수점 누적 오차를 남겼다 (N2 권고).
  const bodyInitialRenderScale = activeTier; // 모든 body 가 동일 tier 로 생성됨 → Tier 만 기억하면 충분.
  const bodyBaseDiameter = new Map<string, number>(); // body.radius × 2 (m, tier 중립, 진단용)
  for (const body of system.bodies) {
    const mesh = createBodyMesh(body, scene, activeTier);
    meshes.set(body.id, mesh);
    bodyBaseDiameter.set(body.id, body.radius * 2);
  }

  // P9 #254 PR-2.5 — rings 가 있는 행성에 shader 기반 3층 렌더.
  //   - 'shader' (기본): `densityProfile[]` uniform + GLSL 선형 보간
  //   - 'fallback': M1 InstancedMesh 입자 분포 (shader 실패 또는 `?ring=fallback`)
  //   - 'placeholder': PR-1 단색 disk (회귀 검증용)
  const ringHandlesByBody = new Map<string, RingPlaceholderHandles | RingShaderHandles>();
  for (const body of system.bodies) {
    if (!body.rings || body.rings.length === 0) continue;
    const host = meshes.get(body.id);
    if (!host) continue;

    let handles: RingPlaceholderHandles | RingShaderHandles;
    if (ringRenderMode === 'placeholder') {
      handles = createRingPlaceholder(scene, host, body.rings, { tier: activeTier });
    } else {
      handles = createRingShaderMesh(scene, host, body.rings, {
        forceFallback: ringRenderMode === 'fallback',
        tier: activeTier,
      });
    }
    ringHandlesByBody.set(body.id, handles);
    disposables.push({ dispose: () => handles.dispose() });
  }

  // 궤도선 — P12-A: tier 전환 시 재샘플링. 개별 Mesh 대신 LineSystem 하나로 통합해 draw call 감소 (#77).
  let orbitLines: ReturnType<typeof MeshBuilder.CreateLineSystem> | null = null;
  let orbitLinesVisible = showOrbitLines;
  const rebuildOrbitLines = () => {
    // 기존 라인 제거 후 현재 tier 의 renderScale 로 재샘플링.
    if (orbitLines) {
      orbitLines.dispose();
      orbitLines = null;
    }
    const batches: Vector3[][] = [];
    for (const body of system.bodies) {
      if (!body.orbit) continue;
      const pts = sampleOrbitPoints(body, activeTier);
      if (pts) batches.push(pts);
    }
    if (batches.length > 0) {
      orbitLines = MeshBuilder.CreateLineSystem('orbit-lines', { lines: batches }, scene);
      orbitLines.color = new Color3(0.25, 0.28, 0.4);
      orbitLines.isVisible = orbitLinesVisible;
    }
  };
  rebuildOrbitLines();
  disposables.push({
    dispose: () => {
      orbitLines?.dispose();
      orbitLines = null;
    },
  });

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

  // 소행성대 (#99) — ThinInstances 단일 draw call.
  // Kepler 경로: 각 소행성 독립 해석해.
  // N-body 경로 (P4-A #165, `asteroidNbody=true`): engine state에 편입.
  let asteroidBelt: AsteroidBeltHandles | null = null;
  if (asteroidBeltN > 0) {
    asteroidBelt = createAsteroidBelt(scene, {
      n: asteroidBeltN,
      epoch: initialJulianDate,
    });
    disposables.push({ dispose: () => asteroidBelt?.dispose() });
  }

  // Newton / Barnes-Hut / WebGPU 경로 — 세 엔진 모두 동일 advance/positions 인터페이스 (positions는
  // WebGPU의 경우 마지막 readback 캐시 — 1-frame 지연 허용).
  let activeEngine: PhysicsEngineKind = physicsEngine;
  let newtonEngine: NBodyEngine | BarnesHutNBodyEngine | WebGpuNBodyEngine | null = null;
  let newtonLastJd = initialJulianDate;
  let currentJd = initialJulianDate;
  let newtonIdIndex: Map<string, number> | null = null;
  // P4-A #165 — 소행성대가 N-body에 편입된 경우 flat positions 버퍼에서의 시작 인덱스.
  // (행성 개수). belt 미편입 시 -1.
  let asteroidStartIndex = -1;

  const massMultipliers = new Map<string, number>();
  const buildNewton = (jd: number, kind: 'newton' | 'barnes-hut' | 'webgpu' = 'newton') => {
    newtonEngine?.dispose();
    const planetState = buildInitialState(system, jd);
    // 질량 배수 적용 (#107) — 초기 상태 생성 후 엔진에 주입.
    for (const [id, mul] of massMultipliers) {
      const idx = planetState.ids.indexOf(id);
      if (idx >= 0) planetState.masses[idx] = (planetState.masses[idx] ?? 0) * mul;
    }

    // P4-A #165 — 소행성대 편입. asteroidNbody=true이고 belt가 있을 때만.
    let initial = planetState;
    asteroidStartIndex = -1;
    if (asteroidNbody && asteroidBelt && asteroidBelt.n > 0) {
      const sun = system.bodies.find((b) => b.id === 'sun');
      const sunMu = GRAVITATIONAL_CONSTANT * (sun?.mass ?? 1.98892e30);
      const ast = asteroidBelt.getNbodyState(jd, sunMu);
      const pN = planetState.ids.length;
      const aN = ast.masses.length;
      const totalN = pN + aN;
      const ids = [...planetState.ids, ...Array.from({ length: aN }, (_, i) => `asteroid-${i}`)];
      const masses = new Float64Array(totalN);
      const positions = new Float64Array(3 * totalN);
      const velocities = new Float64Array(3 * totalN);
      masses.set(planetState.masses, 0);
      masses.set(ast.masses, pN);
      positions.set(planetState.positions, 0);
      positions.set(ast.positions, 3 * pN);
      velocities.set(planetState.velocities, 0);
      velocities.set(ast.velocities, 3 * pN);
      initial = { ids, masses, positions, velocities };
      asteroidStartIndex = pN;
    }

    if (kind === 'webgpu') {
      const engine = scene.getEngine();
      if (!isWebGpuEngine(engine)) {
        throw new WebGpuUnavailableError(
          'scene engine is not WebGPU — auto fallback에서 처리 필요',
        );
      }
      newtonEngine = new WebGpuNBodyEngine(initial, engine);
    } else if (kind === 'barnes-hut') {
      newtonEngine = new BarnesHutNBodyEngine(initial);
    } else {
      newtonEngine = new NBodyEngine(initial, { grMode: resolvedGrMode, integrator });
    }
    newtonIdIndex = new Map(initial.ids.map((id, i) => [id, i]));
    newtonLastJd = jd;
  };
  const disposeNewton = () => {
    newtonEngine?.dispose();
    newtonEngine = null;
    newtonIdIndex = null;
  };
  if (physicsEngine === 'newton' || physicsEngine === 'barnes-hut' || physicsEngine === 'webgpu') {
    buildNewton(initialJulianDate, physicsEngine);
  }
  disposables.push({ dispose: disposeNewton });

  // P12-C #298 — viewMode 필드 + setViewMode API 제거 (단일 모드 전환, #288 연계 close).

  // P12-A #298 — tier 전환. 즉시 모든 body mesh 직경 재계산 + orbit line 재샘플링.
  //
  // [P12-B Phase B (#298)] — camera.radius 300ms ExponentialEase interp 추가 (`runTierTransition`).
  // scale (mesh scaling / orbit line) 은 여전히 **즉시** 적용 — `radius_old / oldScale == radius_new / newScale`
  // 실거리 보존으로 apparent size 불변 (tier-transition.ts 수식 유도 주석 참조). 입력 500ms 잠금 +
  // visibilitychange resume 으로 UX 안전장치 박제.
  //
  // N2 권고 반영: 매 tier 전환마다 `scaling.scaleInPlace(ratio)` 누적은 부동소수점 drift 위험.
  // 대신 mesh 가 생성된 **초기 tier** 의 renderScale 기준으로 **절대** scaling 을 계산한다.
  //   mesh diameter(actual) = base × initialScale × mesh.scaling
  //   원하는 diameter       = base × newScale
  //   ⇒ mesh.scaling        = newScale / initialScale
  // rings 는 host mesh 의 자식이므로 host.scaling 이 바뀌면 ring radius 도 같은 배수로 확대 (B1).
  //
  // [P12-C #298 — M1 하드닝] 연쇄 전환 race 방지: 이전 `runTierTransition` 의 cleanup 을
  // 클로저 변수에 보관해 다음 전환 진입 시 먼저 호출한다. 미해제 fallback timer 가 두 번째
  // 전환 중 `releaseControl` 을 조기 발동해 입력 잠금이 느슨해지는 edge case 를 제거
  // (Phase B PR #304 Reviewer M1). `cleanup` 은 idempotent (`released` 플래그).
  let pendingTierCleanup: (() => void) | null = null;
  const setTier = (tier: Tier) => {
    if (tier === activeTier) return;
    const oldScale = renderScaleForTier(activeTier);
    activeTier = tier;
    const newScale = renderScaleForTier(activeTier);
    const initialScale = renderScaleForTier(bodyInitialRenderScale);
    const absoluteScaling = newScale / initialScale;
    for (const mesh of meshes.values()) {
      mesh.scaling.setAll(absoluteScaling);
      // P12-B #298 — scaling 변경 즉시 boundingSphere.radiusWorld 가 새 값을 반영하도록 강제 갱신.
      // runTierTransition 이 focusMesh.boundingSphere.radiusWorld 로 `×5` 공식을 계산하므로
      // 여기서 world matrix 를 동기 계산해두지 않으면 다음 프레임 전까지 이전 값 반환.
      mesh.computeWorldMatrix(true);
    }
    rebuildOrbitLines();

    // #313 M2 — P12 ADR §Q10 Amendment 구현 정합성. T3 (body) 이탈 시 originOffset 을 [0,0,0] 으로
    // 리셋하여 T1/T2 에서 mesh.position 이 shift 없는 절대 월드 좌표 × renderScale 로 계산되도록 한다.
    // T1/T2 는 renderScale 이 작아 origin shift 의 visible 효과가 sub-pixel 이지만, 매 프레임
    // setOriginToBody / update() overhead 는 실재 (#294 non-focus −38~−44% 회귀). reset 1 회로 이후
    // 프레임의 primary follow / safety net 이 조건부 skip 가능.
    if (tier !== 'body') {
      floatingOrigin.reset();
    }

    // Phase B — camera dolly interp. scene.activeCamera 가 ArcRotateCamera 가 아니면 skip.
    // (e.g. 테스트 셋업 / 비정상 초기화 경로). 통상 경로는 setupArcRotateCamera 에서 항상 ArcRotateCamera.
    //
    // focus 가 있으면 해당 mesh 전달 — runTierTransition 이 `boundingRadius × 5` (V5 달성 공식) 로
    // 목표 radius 계산. 없으면 실거리 보존 수식 fallback (free-fly 전환 경로).
    const cam = scene.activeCamera;
    if (cam && isArcRotateCamera(cam)) {
      // P12-C M1 — 이전 전환의 fallback timer / visibility listener 를 먼저 정리.
      pendingTierCleanup?.();
      const focusMesh = focusBodyIdForAssert ? meshes.get(focusBodyIdForAssert) : undefined;
      pendingTierCleanup = runTierTransition({
        scene,
        camera: cam,
        oldScale,
        newScale,
        // focusMesh 를 조건부 spread — exactOptionalPropertyTypes 대응 (undefined 명시 금지).
        ...(focusMesh ? { focusMesh } : {}),
        // durationMs / lockMs 기본값 (300 / 500) 사용 — ADR §결정 §주석 계약 §5.
      });
    }
  };

  const updateTierByCamera = (cameraFromSunMeters: number, cameraFromFocusMeters: number): Tier => {
    const focusInfo = focusBodyIdForAssert
      ? (() => {
          const body = bodiesById.get(focusBodyIdForAssert!);
          return body ? { kind: body.kind } : null;
        })()
      : null;
    const nextTier = focusInfo
      ? tierFromFocus(focusInfo.kind, cameraFromFocusMeters)
      : tierFromCameraDistance(cameraFromSunMeters, activeTier);
    if (nextTier !== activeTier) {
      setTier(nextTier);
    }
    return activeTier;
  };

  // P11-A #288 — Floating Origin 인스턴스 (scene-scoped).
  //
  // - Primary trigger: `setFocusOrigin(bodyId)` 가 focus 전환 시 origin 을 body 월드 좌표로 이동.
  // - Secondary trigger: `updateAt` 말미에서 `fo.update(cameraWorldMeters)` safety net (1 AU).
  // - mesh.position 할당은 `fo.toLocal(world)` 경유 — ADR §3 주석 계약 아래 박제.
  //
  // Zustand store / Rust engine / worldPositions 는 Heliocentric 절대 좌표 유지 — ADR §3 불변식.
  const floatingOrigin = new FloatingOrigin(FLOATING_ORIGIN_THRESHOLD_METERS);
  // DoD β dev-only assert 용 — 현재 focus body id 추적. `null` 이면 자유 탐색 (assert 스킵).
  let focusBodyIdForAssert: string | null = null;
  const setFocusOrigin = (bodyId: string) => {
    const world = worldPositions.get(bodyId);
    if (!world) return;
    floatingOrigin.setOriginToBody([world[0], world[1], world[2]]);
    focusBodyIdForAssert = bodyId;
  };
  // P12-A #298 — focus 해제 (reset) 시 tier 는 free-fly 경로로 전환.
  const clearFocus = () => {
    focusBodyIdForAssert = null;
  };

  // P10-D #263 — Newton 엔진 state 에서 body pos/vel 직접 추출 (timeScale 내성).
  // WebGPU 엔진은 velocities() 가 Promise 반환 → 동기 경로 지원 불가 → null 반환.
  // Kepler 경로·엔진 미활성 시 null 반환 → 호출자 fallback.
  const getBodyState = (
    id: string,
    parentId: string,
  ): { pos: [number, number, number]; vel: [number, number, number] } | null => {
    if (id === parentId) return null;
    // WebGPU 는 async velocities() — 본 동기 API 미지원.
    if (!(activeEngine === 'newton' || activeEngine === 'barnes-hut')) {
      return null;
    }
    if (!newtonEngine || !newtonIdIndex) return null;
    const idx = newtonIdIndex.get(id);
    const parentIdx = newtonIdIndex.get(parentId);
    if (idx == null || parentIdx == null) return null;
    const positions = newtonEngine.positions();
    const velResult = newtonEngine.velocities();
    // Promise 반환 (WebGPU) 는 진입 직전 가드로 배제되지만 타입 narrowing 보강.
    if (!(velResult instanceof Float64Array)) return null;
    const velocities = velResult;
    const pos: [number, number, number] = [
      (positions[3 * idx] ?? 0) - (positions[3 * parentIdx] ?? 0),
      (positions[3 * idx + 1] ?? 0) - (positions[3 * parentIdx + 1] ?? 0),
      (positions[3 * idx + 2] ?? 0) - (positions[3 * parentIdx + 2] ?? 0),
    ];
    const vel: [number, number, number] = [
      (velocities[3 * idx] ?? 0) - (velocities[3 * parentIdx] ?? 0),
      (velocities[3 * idx + 1] ?? 0) - (velocities[3 * parentIdx + 1] ?? 0),
      (velocities[3 * idx + 2] ?? 0) - (velocities[3 * parentIdx + 2] ?? 0),
    ];
    return { pos, vel };
  };

  const updateAt = (jd: number) => {
    currentJd = jd;
    if (
      (activeEngine === 'newton' || activeEngine === 'barnes-hut' || activeEngine === 'webgpu') &&
      newtonEngine &&
      newtonIdIndex
    ) {
      const dtSec = (jd - newtonLastJd) * SECONDS_PER_DAY;
      if (dtSec !== 0) {
        newtonEngine.advance(dtSec);
        newtonLastJd = jd;
      }
      const flat = newtonEngine.positions();
      for (const body of system.bodies) {
        const idx = newtonIdIndex.get(body.id);
        const world = worldPositions.get(body.id)!;
        if (idx == null) {
          world[0] = 0;
          world[1] = 0;
          world[2] = 0;
          continue;
        }
        world[0] = flat[3 * idx] ?? 0;
        world[1] = flat[3 * idx + 1] ?? 0;
        world[2] = flat[3 * idx + 2] ?? 0;
      }
    } else {
      updateAtKepler(jd);
    }

    // Floating Origin primary follow (ADR §1-B 확장).
    //
    // focus body 는 태양을 공전하므로 매 프레임 world 좌표가 바뀐다. origin 을 고정하면
    // 다음 프레임에 focus body 가 local 에서 멀어져 jitter 재발 → 매 프레임 origin 을
    // 현재 focus body 의 world 로 따라가게 한다. `setOriginToBody` 가 변화 없으면 no-op
    // 반환하므로 listener 는 델타가 0 인 프레임에는 호출되지 않는다 (Trail 불필요 호출 방지).
    //
    // #313 M2 — P12 ADR §Q10 Amendment: T3 (body) 에서만 활성. T1/T2 는 setTier 가 origin 을
    // 리셋해 [0,0,0] 유지 → 아래 primary follow skip 으로 매 프레임 setOriginToBody 호출 제거.
    if (activeTier === 'body' && focusBodyIdForAssert) {
      const focusWorld = worldPositions.get(focusBodyIdForAssert);
      if (focusWorld) {
        floatingOrigin.setOriginToBody([focusWorld[0], focusWorld[1], focusWorld[2]]);
      }
    }

    // Floating Origin 계약 (ADR `docs/decisions/20260422-floating-origin.md` §3):
    //   - `world` (worldPositions): Heliocentric 절대 좌표 (m) — Rust engine / Zustand store 와 동일
    //   - `local = floatingOrigin.toLocal(world)` : scene 삽입 직전 origin shift 적용 (m)
    //   - `mesh.position` : scene unit (local × renderScaleForTier(activeTier))
    // 이 3단 변환을 우회하여 `world * SCENE_UNIT_PER_METER` 를 직접 할당하면 float32 jitter regression
    // 재발 (#271 재현). 아래 루프 수정 시 이 주석 계약 유지 필수. P12-A 부터 SCENE_UNIT_PER_METER 는
    // `renderScaleForTier(activeTier)` 로 교체 — ADR §결정 §1 R4 DoD.
    const origin = floatingOrigin.originOffset;
    const ox = origin[0];
    const oy = origin[1];
    const oz = origin[2];
    const sceneUnitPerMeter = renderScaleForTier(activeTier);
    for (const [id, world] of worldPositions) {
      const mesh = meshes.get(id);
      if (!mesh) continue;
      // float64 뺄셈 (큰 수 - 큰 수 = 작은 수) 을 먼저 수행 후 float32 scene unit 변환.
      // `toRelativeToEye` 와 동일 원리 — double precision 유지 후 결과만 float32 cast.
      mesh.position.set(
        (world[0] - ox) * sceneUnitPerMeter,
        (world[1] - oy) * sceneUnitPerMeter,
        (world[2] - oz) * sceneUnitPerMeter,
      );
    }

    // P12-A #298 — body mesh.scaling 은 1 로 고정 (kind 차등 / 거리 의존 과장 제거).
    // 실측 반경 × tier renderScale 은 이미 `createBodyMesh` + tier 전환 시 `setTier` 의 scaling.setAll 에서 처리.
    // (P12-C #298 — viewMode 분기 삭제: 단일 모드)
    const cam = scene.activeCamera;

    // Sun light — worldPositions['sun'] 도 Heliocentric 절대 좌표 (m). Floating Origin shift + tier scale 반영.
    const sunWorld = worldPositions.get('sun') ?? [0, 0, 0];
    sunLight.position.set(
      (sunWorld[0] - ox) * sceneUnitPerMeter,
      (sunWorld[1] - oy) * sceneUnitPerMeter,
      (sunWorld[2] - oz) * sceneUnitPerMeter,
    );

    // P11-A #288 — safety net (ADR §1-A). focus 가 없는 free-fly 탐색 중 카메라가 1 AU 이상
    // 이동하면 origin 을 카메라 위치로 추가 shift. 다음 프레임의 `updateAt` 이 새 origin 으로
    // 좌표 재기록 — 같은 프레임 내 mesh.position 은 shift 전 좌표라 1 프레임 visible delta 존재 가능.
    // 1 AU 이동 시점에서 scene scale 이 매우 wide 하므로 sub-pixel (ADR §5).
    //
    // #292 회귀 가드: focus 활성 상태에서 safety net 이 primary origin (line 445-450 의
    // `setOriginToBody`) 을 덮어쓰면 originOffset 이 카메라 월드 좌표를 추적 → ADR §3
    // Heliocentric 계약 위배. focus 가 없는 free-fly 탐색에만 safety net 적용한다.
    //
    // #313 M2 — P12 ADR §Q10 Amendment: T3 (body) 에서만 활성. T1/T2 는 renderScale 이 작아
    // 카메라 이동이 AU 단위여도 sub-pixel → safety net skip + origin [0,0,0] 유지. 매 프레임
    // metersPerSceneUnit 환산 + floatingOrigin.update() + AU 곱셈 3회 overhead 제거 (#294 회귀 주범 후보).
    if (cam && !focusBodyIdForAssert && activeTier === 'body') {
      // cam.globalPosition 은 scene unit. P12-A 이후 1 unit 크기는 tier 별 상이 — 환산 factor 는
      // 현재 tier 의 renderScale 역수 (1/sceneUnitPerMeter). fo 는 m 단위 계약.
      const metersPerSceneUnit = sceneUnitPerMeter > 0 ? 1 / sceneUnitPerMeter : AU;
      const cameraLocalMeters = [
        cam.globalPosition.x * metersPerSceneUnit,
        cam.globalPosition.y * metersPerSceneUnit,
        cam.globalPosition.z * metersPerSceneUnit,
      ] as const;
      // local → world = local + current origin (shift 전 기준)
      const cameraWorldMeters: [number, number, number] = [
        cameraLocalMeters[0] + ox,
        cameraLocalMeters[1] + oy,
        cameraLocalMeters[2] + oz,
      ];
      floatingOrigin.update(cameraWorldMeters);
    }

    // P11-A #288 DoD β v2 — dev 빌드 assert: **focus body** local 좌표 절대값 ≤ 1e5 m (100 km).
    // core 패키지는 `process` 타입이 없으므로 runtime guard 사용. Next.js webpack 이 `process.env.NODE_ENV`
    // 를 빌드 타임 치환 → prod bundle 에서는 `'development' !== 'production'` 이 false 가 되어 DCE.
    // SSR / 테스트 환경은 `globalThis.process` 유/무 가드로 안전 접근.
    //
    // 카메라 local 불포함 (2026-04-22 재정정): Floating Origin 의 목적은 렌더 대상(mesh) 의 scene
    // 좌표 jitter 해소. 카메라는 focus body 를 관찰하기 위해 수 AU 떨어진 위치가 정상이며, 카메라
    // local 에 1e5 m 제한을 두면 T3 body tier (P12 단일 모드) 가 물리적으로 동작 불가. float32 jitter 는
    // mesh local (작은 값) 에서만 발생하므로 카메라 local 은 Three.js/Babylon 내부 부동소수점 관리에
    // 위임한다. ADR 20260422-floating-origin.md §6-β / §Amendments 2026-04-22 참조.
    if (floatingOriginAssertEnabled() && cam) {
      const focusId = focusBodyIdForAssert;
      const focusWorld = focusId ? worldPositions.get(focusId) : null;
      if (focusWorld) {
        const fx = focusWorld[0] - ox;
        const fy = focusWorld[1] - oy;
        const fz = focusWorld[2] - oz;
        const focusLocalMax = Math.max(Math.abs(fx), Math.abs(fy), Math.abs(fz));
        if (focusLocalMax >= 1e5) {
          console.error(
            `[floating-origin] focus body '${focusId}' local 좌표 초과 (≥1e5m): ${fx},${fy},${fz}`,
          );
        }
      }
    }

    // 소행성대 업데이트.
    // P4-A #165 — N-body 편입 경로: 엔진이 이미 advance 됐으니 flat positions에서 읽어 ThinInstance에 반영.
    // 그 외(Kepler 모드 또는 asteroidNbody=false): 기존 해석해 경로 유지.
    if (asteroidBelt) {
      // P12-A #298 B1 — 현 tier 의 renderScale 을 매 프레임 주입. tier 전환 시 다음 프레임에 자동 반영.
      if (
        asteroidStartIndex >= 0 &&
        newtonEngine &&
        (activeEngine === 'newton' || activeEngine === 'barnes-hut' || activeEngine === 'webgpu')
      ) {
        const flat = newtonEngine.positions();
        asteroidBelt.writeWorldPositions(
          flat,
          asteroidStartIndex,
          asteroidBelt.n,
          sceneUnitPerMeter,
        );
      } else {
        asteroidBelt.updateAt(jd, sceneUnitPerMeter);
      }
    }
  };

  const updateAtKepler = (jd: number) => {
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
    // 메쉬 위치·광원 업데이트는 호출자(updateAt)가 worldPositions에서 공통 수행.
  };

  const setOrbitLinesVisible = (visible: boolean) => {
    orbitLinesVisible = visible;
    if (orbitLines) orbitLines.isVisible = visible;
  };

  const setPhysicsEngine = (kind: PhysicsEngineKind) => {
    if (kind === activeEngine) return;
    // P3-B #146 — webgpu 직접 활성화. UI 어댑터(sim-canvas resolveEngine)가
    // capability/auto 분기를 처리한 후 진입한다. 미지원 환경 진입 시 throw.
    const effective: PhysicsEngineKind =
      kind === 'kepler' || kind === 'newton' || kind === 'barnes-hut' || kind === 'webgpu'
        ? kind
        : 'newton';
    if (effective === 'newton' || effective === 'barnes-hut' || effective === 'webgpu') {
      buildNewton(currentJd, effective);
    } else {
      disposeNewton();
    }
    activeEngine = effective;
  };
  const getPhysicsEngine = () => activeEngine;

  const setBodyMassMultiplier = (bodyId: string, multiplier: number) => {
    const clamped = Math.max(0.01, Math.min(1000, multiplier));
    if (clamped === 1) massMultipliers.delete(bodyId);
    else massMultipliers.set(bodyId, clamped);
    if (activeEngine === 'newton' || activeEngine === 'barnes-hut')
      buildNewton(currentJd, activeEngine);
  };
  const resetMassMultipliers = () => {
    massMultipliers.clear();
    if (activeEngine === 'newton' || activeEngine === 'barnes-hut')
      buildNewton(currentJd, activeEngine);
  };

  // 초기 시점 적용
  updateAt(initialJulianDate);

  return {
    meshes,
    updateAt,
    setOrbitLinesVisible,
    getTier,
    setTier,
    updateTierByCamera,
    getBodyState,
    setPhysicsEngine,
    getPhysicsEngine,
    setBodyMassMultiplier,
    resetMassMultipliers,
    readShaderTimings: () => {
      if (newtonEngine && 'readShaderTimings' in newtonEngine) {
        return (newtonEngine as WebGpuNBodyEngine).readShaderTimings();
      }
      return null;
    },
    floatingOrigin,
    setFocusOrigin,
    clearFocus,
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

/**
 * P12-B #298 — Babylon `ArcRotateCamera` 런타임 가드.
 *
 * runTierTransition 은 `camera.radius` interp 을 수행하므로 ArcRotateCamera 여야 한다.
 * 통상 운영 경로에서는 `setupArcRotateCamera` 로 초기화되어 true 이지만, 비정상
 * 초기화 / jsdom 테스트 / FreeCamera 교체 경로 대비 방어 가드. `Camera` base 와 구분용으로
 * `radius` / `target` / `attachControl` 표면 존재만 확인.
 */
function isArcRotateCamera(cam: unknown): cam is ArcRotateCamera {
  if (!cam || typeof cam !== 'object') return false;
  const c = cam as Record<string, unknown>;
  return typeof c.radius === 'number' && typeof c.attachControl === 'function';
}

function createBodyMesh(body: LoadedCelestialBody, scene: Scene, tier: Tier): Mesh {
  // P12-A #298 — 실측 직경 × 현재 tier 의 renderScale 로 메쉬 생성.
  // `mesh.scaling` 은 1 유지 (tier 전환 시 scaling.scaleInPlace 로 비율 적용, ADR §주석 §2).
  const diameter = body.radius * 2 * renderScaleForTier(tier);
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

function sampleOrbitPoints(body: LoadedCelestialBody, tier: Tier): Vector3[] | null {
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
    // P12-A #298 — orbit line 점도 현재 tier 의 renderScale 로 환산 (원칙 #4 거리 동일 스케일).
    const scale = renderScaleForTier(tier);
    points.push(new Vector3(x * scale, y * scale, z2 * scale));
  }

  return points;
}

function hexToColor3(hex: string): Color3 {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return new Color3(r, g, b);
}
