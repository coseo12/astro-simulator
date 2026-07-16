import {
  Color3,
  Color4,
  DynamicTexture,
  HemisphericLight,
  MeshBuilder,
  PointLight,
  Quaternion,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
  type Mesh,
  type Scene,
} from '@babylonjs/core';
import { AU, GRAVITATIONAL_CONSTANT, J2000_JD } from '@astro-simulator/shared';
import { getSolarSystem, type LoadedCelestialBody } from '../ephemeris/solar-system-loader.js';
import { positionAt } from '../physics/kepler.js';
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
import { createStarfield } from './starfield.js';
import { hexToColor3 } from './color-utils.js';
import {
  createProceduralPlanetMaterial,
  type PlanetLightingConstants,
} from './procedural-planet-shader.js';
// #774 — 태양 emissive 절차 표면 셰이더 (granulation + limb darkening + 색온도).
// ADR `docs/decisions/20260703-774-sun-emissive-shader.md` §결정 1 — SURFACE_TYPE_BY_BODY 미등록
// 유지 (테이블은 "외부광 반사 표면" 전용), star 분기가 직접 본 팩토리 호출.
import { createSunSurfaceMaterial } from './sun-shader.js';
import {
  renderScaleForTier,
  initialTier as defaultInitialTier,
  tierFromFocus,
  tierFromCameraDistance,
  computeFloatingOriginForTier,
  type Tier,
} from './tier.js';
import { runTierTransition } from './tier-transition.js';
import { R_PHASE_BODY_ALLOWLIST } from './r-phase-allowlist.js';
import { getOrbitVisualScale } from './orbit-visual-scale.js';
import { applySatelliteVisibilityGuard } from './satellite-visibility.js';
import {
  GLOW_MARKER_DEFAULT_SATELLITE_RATIO,
  GLOW_MARKER_RESTORE_EMISSIVE_SCALE_NON_STAR,
  resolveGlowMarker,
  resolveGlowMarkerRestoreEmissiveScale,
} from './glow-marker.js';
import {
  lodFromScreenCoverage,
  screenCoverageRadius,
  type LodLevel,
  type LodOverride,
} from '../render/lod.js';
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
 * `process` 는 브라우저 번들 runtime 에 존재하지 않을 수 있다 (#715 부터 `@types/node` 로
 * 타입은 있으나 — core 는 브라우저 타겟이라 런타임 부재 가능). 따라서 `globalThis.process?.env?.NODE_ENV`
 * 를 안전하게 읽고, Next.js webpack 이 빌드 시점에 `NODE_ENV` 를 리터럴 치환 → prod bundle 에선
 * 이 함수가 `false` 를 반환해 하위 assert 블록이 DCE 된다.
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

/**
 * Ambient 라이팅 가시성 floor — 회귀 #372 fix (R3 venus 동봉, ambient 약점은 R2 머지부터 잠재).
 *
 * sun.disableLighting=true 라 sun 자체에는 영향이 없고, 행성 mesh sun-반대측의 평균 luminance
 * 만 인상하여 그림자측 윤곽이 사라지지 않게 한다. 0.3 / (0.15, 0.15, 0.18) 은 architect 가
 * debug 패치로 검증한 박제값 (1280×720 ?gpu=a 기준 sun 점유율 +0.07%p, 행성 그림자측 인지 가능).
 *
 * 가드 테스트(`solar-system-scene.test.ts`) 가 회귀 임계 (intensity ≥ 0.25, groundColor 비-검정)
 * 를 검증하므로 본 상수를 임의 하향 조정하면 단위 테스트가 실패한다.
 *
 * 근거: docs/decisions/20260429-r3-venus-visualization.md (회귀 #372 amendment),
 *       volt #77 (headless false positive — tier-c 자동 진입으로 자동화 가드 통과)
 */
export const AMBIENT_INTENSITY = 0.3;
export const AMBIENT_GROUND_COLOR_RGB = { r: 0.15, g: 0.15, b: 0.18 } as const;

/**
 * #773 Amendment 1 — 광원 물리 상수 SSoT (PointLight + HemisphericLight).
 *
 * 절차 표면 셰이더 (`procedural-planet-shader.ts`) 가 단색 행성 (StandardMaterial) 과 **동일한 명암**
 * 을 내려면 PointLight/HemisphericLight 의 값을 정확히 재현해야 한다. 셰이더는 scene 를 import 하지
 * 않으므로 (순환 회피), 이 상수들을 `createProceduralPlanetMaterial` 인자로 주입한다 (단방향 의존,
 * volt #69 마법 숫자 중복 금지). 아래 sunLight/ambient 생성부가 이 상수를 그대로 사용한다 (SSoT).
 *
 * AMBIENT_SKY 는 HemisphericLight 의 `diffuse` (Babylon 기본 흰색 (1,1,1)), AMBIENT_UP 은 light
 * direction (0,1,0). 셰이더 hemispheric mix(ground, sky, dot(N,up)*0.5+0.5) 재현용.
 */
export const SUN_INTENSITY = 2.5;
export const SUN_DIFFUSE_RGB = { r: 1, g: 0.95, b: 0.8 } as const;
export const AMBIENT_SKY_COLOR_RGB = { r: 1, g: 1, b: 1 } as const;
export const AMBIENT_UP_DIR = { x: 0, y: 1, z: 0 } as const;

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
   * #704 (ADR `20260618-704-body-tier-zoomout-jump.md` §5 옵션 c, 이견 3 Core 계약화) —
   * free-fly 가 body tier 에서 시작한 경우 `freeFlyAnchorBodyId` (탐색 시작 body 의 id) 를 명시 전달하면,
   * `cameraFromSunMeters` (외행성 위성은 본질적으로 solar 영역) 대신 **anchor 로부터 거리
   * (`cameraFromFocusMeters`) 기준**으로 tier 를 판정한다. 외행성계 위성(io=5.2AU) focus → free-fly
   * → 줌아웃 시 cameraFromSun 이 항상 solarUpper(3AU) 초과라 body→solar 직행 escalate(rescale 급락
   * ×3.35e-6) 하던 회귀를, anchor 기준 판정으로 위성 근방 탐색을 보존(점프 배율 < 5×)한다. 판정 좌표
   * 기준(sun vs anchor)을 Core API 가 책임지고(kind 룩업도 Core `bodiesById` 가 소유), web 은 진입 시
   * anchor body id 만 전달한다(레이어 침범 방지 — 외/내행성 위성 무관 동일 적용, 이견 4).
   *
   * @param cameraFromSunMeters 카메라 위치에서 원점(태양)까지 거리 (m)
   * @param cameraFromFocusMeters focus body / anchor 에서 카메라까지 거리 (m). focus/anchor 부재 시 무시
   * @param freeFlyAnchorBodyId free-fly 진입 시점 탐색 body 의 id (body tier 진입 한정). 전달 시 anchor 기준 판정
   */
  updateTierByCamera: (
    cameraFromSunMeters: number,
    cameraFromFocusMeters: number,
    freeFlyAnchorBodyId?: string | null,
  ) => Tier;
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
  /**
   * R4 #539 Amendment 3 — body id 로 parentId 조회 (focus multiplier 분기 결정 입력).
   *
   * `sim-canvas.tsx syncFocusToScene` 가 `resolveFocusMultiplier(parentId)` 식 후보 2 적용 시
   * 사용. id 미존재 시 `undefined` 반환 (호출자 fallback). ADR §Amendment 3 §식 후보 2 정합.
   */
  getBodyParentId: (id: string) => string | null | undefined;
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
   * **호출 타이밍**: sim-canvas `syncFocusToScene` helper 에서 `controller.focusOn` 과 같은 프레임에 호출
   * (R1 #334+#335 — store-scene 동기화 단일 경로 통합. ADR `20260425-r1-store-scene-sync-unification.md`).
   * 내부적으로 `updateAt` 이 다음 프레임에 origin 반영된 local 좌표로 mesh.position 을 재기록하므로
   * focus animation (300ms) 중에도 일관된 좌표계 유지.
   */
  setFocusOrigin: (bodyId: string) => void;
  /**
   * #408 F1 — focus 진입 시 final tier 사전 결정 + setTier 호출 (의존 역전 (c) 채택).
   *
   * `controller.focusOn` 의 cam-target tween (300ms) 보간 중간 프레임에서 `cameraFromFocusMeters` 가
   * 일시적으로 0.1 AU 미만으로 떨어져 `tierFromFocus` 가 잘못된 tier (planet → body) 를 반환하는
   * race 를 차단하기 위해, focusOn animation 시작 **전에** final tier 를 결정하고 즉시 setTier.
   *
   * 호출 시점: `sim-canvas.tsx syncFocusToScene` 헬퍼에서 `setFocusOrigin` 직후 + `controller.focusOn` 직전.
   * camera-controller 단일 책임 (camera 전용) 보존을 위해 도메인 정책 (tierFromFocus) 은 scene 측에 캡슐화.
   *
   * @param bodyId focus 대상 body id (존재해야 함, 미존재 시 현 tier 반환 + no-op)
   * @param cameraDistMeters focus body 로부터 카메라 목표 거리 (m). 통상 `desiredRadius × metersPerSceneUnit`.
   * @returns 적용된 (또는 현재) tier
   *
   * ADR `docs/decisions/20260504-focus-tier-oscillate-fix.md` §결정 1.
   */
  applyFocusTier: (bodyId: string, cameraDistMeters: number) => Tier;
  /**
   * P12-A #298 — focus 해제 (reset 등). tier 가 free-fly 경로로 자동 전환되도록 focus id 를 null 로 돌린다.
   */
  clearFocus: () => void;
  /**
   * #509 — 자유시점 (free-fly) 진입. `clearFocus` 와 달리 **tier/origin 을 유지**한다.
   *
   * 동작:
   *  - focusBodyIdForAssert = null (focus tracking 해제)
   *  - **setTier 미호출** — activeTier / floatingOrigin / mesh.scaling 등 모두 보존
   *  - 카메라 alpha/beta/radius/target 도 호출자가 별도 변경하지 않으면 그대로 유지
   *
   * 사용: sim-canvas 의 freeFlyMode 진입 분기에서 호출 + camera-controller.clearFollow() 동반.
   */
  detachFocus: () => void;
  /**
   * P11-B #289 — LOD override 설정. URL `?lod=high|mid|low` 는 전 body 강제, `'auto'` 는 거리 자동 판정 (기본).
   *
   * 런타임 1회 변경 전제 — 반복 호출도 허용되지만 매 updateAt 에서 즉시 반영.
   */
  setLodOverride: (level: LodOverride) => void;
  /**
   * P11-B #289 — 마지막 `updateAt` 에서 집계된 LOD 분포. dev overlay (draw call) 표시용.
   *
   * `{ high, mid, low }` 는 각 LOD 단계로 판정된 body 개수. 합은 전체 body 수 (고리/HUD 제외).
   */
  getLodStats: () => { high: number; mid: number; low: number; override: LodOverride };
  /**
   * #388 — 마지막 `runLodPass` 에서 결정된 body 별 LOD 상세. dev overlay 시각화 용도.
   *
   * 각 항목:
   *  - `id`: body 식별자 (예: `'sun'`, `'mercury'`)
   *  - `level`: 결정된 LOD 단계
   *  - `screenCoverage`: `screenCoverageRadius` 결과 (pixel) — 화면 점유 반지름
   *  - `pxDiameter`: 시각 직경 추정 (`screenCoverage × 2`, pixel) — 사용자가 보는 크기 직관용
   *  - `cameraDistanceMeters`: 카메라-body 실세계 거리 (m) — #387 reviewer 권고 #1 의 actualCameraRadius 변별
   *
   * 빈 배열 반환 = `runLodPass` 미실행 (씬 초기화 직후 / dev overlay 가 frame 보다 빠르게 polling).
   * dev/prod 무관 노출 (overlay 컴포넌트가 prod 빌드에서 DCE 되므로 prod bundle 에 호출 코드 없음).
   *
   * **재할당 회피**: 반환 배열은 내부 버퍼 (frozen 아님). 호출자가 mutate 하면 안 됨 (read-only 계약).
   */
  getLodInfo: () => readonly LodBodyInfo[];
  dispose: () => void;
}

/**
 * #388 — body 별 LOD raw 데이터. dev overlay (`lod-dev-overlay.tsx`) 시각화 + 회귀 진단 용도.
 *
 * `runLodPass` 가 매 프레임 갱신. `null` 좌표 (frustum 밖) 가 아닌 raw 결정 입력값을 보존하여
 * #387 reviewer non-blocking #1 (actualCameraRadius 변별) / #2 (pixelDiameter null 박제) 직접 해소.
 */
export interface LodBodyInfo {
  id: string;
  level: LodLevel;
  screenCoverage: number;
  pxDiameter: number;
  cameraDistanceMeters: number;
  /**
   * #393 — low variant (billboard) 의 alpha mask 적용 여부.
   *
   * - `true`: pxDiameter ≥ 4 — alpha mask 적용 (원형 disc 인지)
   * - `false`: pxDiameter < 4 — 4px fallback (사각형 quad, sub-pixel flickering 회피)
   * - `null`: low variant 아직 lazy-create 안 됨 또는 level ≠ 'low'
   *
   * ADR [`20260502-391-phase2-billboard.md`](../../docs/decisions/20260502-391-phase2-billboard.md) §결정 §"4px fallback 분기".
   * dev overlay 시각화 + 회귀 진단 용도.
   */
  billboardAlphaMask: boolean | null;
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
  /**
   * R1 #329 — body 별 시각 과장 배수 콜백 (DI).
   *
   * `apps/web/src/constants/body-scale.ts` 의 `getBodyScale` 같은 룩업을 주입.
   * 미주입 시 default `() => 1.0` (실측 그대로, 테스트 회귀 0).
   *
   * **레이어 의존 역전 방지**: `BODY_SCALE` 룩업은 `apps/web` 에 박제 (시각 과장 데이터 ≠ physics).
   * `packages/core` 가 직접 import 하지 않고 콜백으로 주입받아 데이터 모름.
   *
   * 적용 지점:
   *   1. `createBodyMesh` (high) / `createBodyMeshMid` (mid) 의 `diameter` 계산식
   *   2. `screenCoverageRadius` 입력 — effective radius (`body.radius × bodyScale`) 로 LOD 결정 정합
   *
   * **Phase 2 #333 — billboard variant 는 미적용**: `createBodyBillboard` 는 `bodyScale` 미곱.
   * 책임 분리 — sphere/mid 가 시각 과장 전담, billboard 는 sub-pixel draw call 절감 책임 단독.
   * ADR `20260425-r1-sun-visualization.md` §"Phase 2 결정 (#333)" amendment 참조.
   *
   * ADR `docs/decisions/20260425-r1-sun-visualization.md` §결정 3 후보 a.
   *
   * **R2+ 인계**: tier 차등 필요 시 `(bodyId: string, tier?: Tier) => number` 로 확장 가능.
   * 현재는 단일 인자 시그니처 (Q3=C 비-범위 가드 — tier 변경 자체에 손대지 않음).
   */
  bodyScale?: (bodyId: string) => number;

  /**
   * #444 — tier transition 윈도우 (`runTierTransition` detachControl ~ cleanup) 에서 도달한
   * 사용자 입력 (wheel/touchstart) 카운트 콜백. transition 종료 시점에 1회 호출 (count > 0 일 때만).
   *
   * 호출자 (sim-canvas / SimulationCore) 가 metrics 객체로 누적 → DevTools 노출
   * (`window.__simCore.metrics.tierTransitionInputDrops`). G8b (input 큐잉) 격상 결정 데이터.
   */
  onTierTransitionInputAttempts?: (count: number) => void;

  /**
   * #675 — glow pixel marker. 줌아웃 시 sub-pixel (시각 비식별) body 를 화면 고정 크기의
   * 둥근 글로우 픽셀로 표기 (ADR `20260613-675-glow-pixel-marker.md`).
   *
   * 기본값 **false** (core 라이브러리 보수 기본 — 기존 NullEngine 단위 테스트 무회귀).
   * **기본 ON 은 web 레이어 결정** — `parseMarkerMode` (apps/web) 기본값이 'glow' 이며
   * `?marker=off` 가 옵트아웃 (ADR §축 1). false 면 runLodPass 의 glow 분기가 무조건
   * inactive — 기존 동작과 100% 동일 (연산 0 수준).
   *
   * 동작 (true 일 때): low LOD (billboard) + 실 billboard 렌더 px (측정 pxDiameter ÷
   * bodyScale) < 4px 인 body (sun 포함 27 전수) 의 low variant quad 를 화면 고정 크기로
   * 역보정 + emissive boost. 판정 식·상수는 `glow-marker.ts` SSoT (PM 확정값 2026-06-13).
   */
  glowMarker?: boolean;

  /**
   * #675 — glow marker 의 모행성:위성 크기 비율 (PM 확정 기본 2:1).
   *
   * 위성 (parentId !== 'sun') 의 targetPx = GLOW_MARKER_TARGET_PX_PARENT / ratio.
   *  - 2 (기본): parent 4.5px / satellite 2.25px
   *  - `?ratio=` URL 파라미터로 디버그/후속 PM 튜닝 가능 (ADR §축 7 — 1~10 유한 수)
   *
   * glowMarker=false 면 미사용.
   */
  glowMarkerSatelliteRatio?: number;

  /**
   * #738 — 절차적 별 배경 + 은하수 띠 (`starfield.ts`).
   *
   * 기본값 **false** (core 라이브러리 보수 기본 — 기존 NullEngine 단위 테스트 무회귀, #675 레이어
   * 분리 정합). **기본 ON 은 web 레이어 결정** — `parseStarsVisible` (apps/web) 기본값이 true 이며
   * `?stars=off` 가 옵트아웃 (ADR §결정 7). false 면 starfield mesh 자체를 생성하지 않음 (연산 0).
   *
   * 동작 (true 일 때): `infiniteDistance=true` inverted sphere + 절차 fragment ShaderMaterial 을
   * clearColor 직후 1개 추가. floating-origin/tier/줌 불변 (엔진 레벨), `isPickable=false` (raycast
   * 비간섭), `renderingGroupId=0` (background queue — 모든 body/orbit/ring 이 그 위에 덮어씀).
   * ADR `docs/decisions/20260624-738-procedural-starfield.md`.
   */
  starfield?: boolean;

  /**
   * #756 — 절차적 행성 표면 셰이더 (`procedural-planet-shader.ts`).
   *
   * 기본값 **false** (core 라이브러리 보수 기본 — 기존 NullEngine 단위 테스트 무회귀, #675/#738
   * 레이어 분리 정합). **기본 ON 은 web 레이어 결정** — `parseSurfaceVisible` (apps/web) 기본값이
   * true 이며 `?surface=off` 가 옵트아웃 (ADR §결정 4). false 면 `createBodyMesh`/`createBodyMeshMid`
   * 가 기존 StandardMaterial 경로를 그대로 탄다 (절차 셰이더 미적용 — 현행 동작 100% 복귀).
   *
   * 동작 (true 일 때): `SURFACE_TYPE_BY_BODY` 테이블 등록 body (earth/mars/jupiter/moon) 의
   * high/mid variant 머티리얼을 절차 ShaderMaterial 로 교체 (base color = colorHint.hex 위 변조).
   * low (billboard) + tier-c (`forceOverride:'low'`) 는 자동 단색 (별도 코드 0 — ADR §결정 3).
   * 미등록 body 는 테이블 부재로 자동 단색 (무회귀). ADR `docs/decisions/20260628-756-procedural-planet-surface.md`.
   */
  surfaceDetail?: boolean;

  /**
   * #782 §A2 — 행성 self-rotation (자전).
   *
   * 기본값 **false** (core 라이브러리 보수 기본 — 기존 NullEngine 단위 테스트 무회귀, surfaceDetail
   * 동형). **기본 ON 은 web 레이어 결정** — `parseRotateEnabled` (apps/web) 기본값이 true 이며
   * `?rotate=off` 가 옵트아웃 (ADR §A2.3 결정 7). false 면 자전 정지 — 자전 도입 전 픽셀과 100% 동일
   * (snapshot 가드 격리).
   *
   * 동작 (true 일 때): `rotationPeriodHours` 데이터를 가진 body (major 9 + moon) 의 host mesh 에
   * `rotationQuaternion = tilt(axialTilt) ∘ spin(spinAngle(jd))` 를 매 프레임 설정. 자전각은 jd 순수
   * 함수 (`(jd − epoch) × ω mod 2π`, 누적 금지 — frame-rate 독립·결정적). ring 있는 body 4개는
   * ring-anchor (비회전 tilt-only 노드) 로 ring disc 를 격리해 wobble 0 (ADR §A2.3 결정 1).
   */
  selfRotation?: boolean;
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
    bodyScale = defaultBodyScale,
    onTierTransitionInputAttempts,
    glowMarker = false,
    glowMarkerSatelliteRatio = GLOW_MARKER_DEFAULT_SATELLITE_RATIO,
    starfield = false,
    surfaceDetail = false,
    selfRotation = false,
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

  // #738 — 절차적 별 배경 + 은하수 띠 (clearColor 위 background queue 레이어). 기본 false —
  // web 레이어가 `?stars=off` 옵트아웃으로 기본 ON 결정 (ADR §결정 7). infiniteDistance 가
  // floating-origin/tier/줌 불변을 엔진 레벨로 보장 → 별 추종 코드 0 (ADR §결정 1).
  if (starfield) {
    const sf = createStarfield(scene);
    disposables.push({ dispose: () => sf.dispose() });
  }

  // 회귀 #372 fix — 행성 그림자측 인지 가능 ambient (AMBIENT_* 상수 SSoT, 단위 테스트 가드).
  // #773 — 절차 표면 셰이더가 이 HemisphericLight 식을 재현하므로 값은 PLANET_LIGHTING 으로도 전달.
  const ambient = new HemisphericLight(
    'hemi',
    new Vector3(AMBIENT_UP_DIR.x, AMBIENT_UP_DIR.y, AMBIENT_UP_DIR.z),
    scene,
  );
  ambient.intensity = AMBIENT_INTENSITY;
  ambient.groundColor = new Color3(
    AMBIENT_GROUND_COLOR_RGB.r,
    AMBIENT_GROUND_COLOR_RGB.g,
    AMBIENT_GROUND_COLOR_RGB.b,
  );

  // 태양 중심 포인트 라이트 (#773 — SUN_* 상수 SSoT, 절차 표면 셰이더와 공유).
  const sunLight = new PointLight('sun-light', new Vector3(0, 0, 0), scene);
  sunLight.intensity = SUN_INTENSITY;
  sunLight.diffuse = new Color3(SUN_DIFFUSE_RGB.r, SUN_DIFFUSE_RGB.g, SUN_DIFFUSE_RGB.b);

  // #773 Amendment 1 — 절차 표면 셰이더 광원 상수 묶음 (scene SSoT → createProceduralPlanetMaterial
  // 단방향 주입). PointLight/HemisphericLight 와 동일 값 (위 생성부) — 마법 숫자 중복 0 (volt #69).
  const planetLighting: PlanetLightingConstants = {
    sunIntensity: SUN_INTENSITY,
    sunDiffuse: [SUN_DIFFUSE_RGB.r, SUN_DIFFUSE_RGB.g, SUN_DIFFUSE_RGB.b],
    ambientIntensity: AMBIENT_INTENSITY,
    ambientGround: [
      AMBIENT_GROUND_COLOR_RGB.r,
      AMBIENT_GROUND_COLOR_RGB.g,
      AMBIENT_GROUND_COLOR_RGB.b,
    ],
    ambientSky: [AMBIENT_SKY_COLOR_RGB.r, AMBIENT_SKY_COLOR_RGB.g, AMBIENT_SKY_COLOR_RGB.b],
    ambientUp: [AMBIENT_UP_DIR.x, AMBIENT_UP_DIR.y, AMBIENT_UP_DIR.z],
  };
  // #773 — 태양 월드 위치 provider (scene-unit world). updateAt 가 매 프레임 sunLight.position 을
  // 갱신 (Floating Origin shift + tier scale 반영) → 셰이더 onBind 가 이 값으로 sunDir 계산.
  const sunPositionProvider = (): Vector3 => sunLight.position;
  // #773 — createBodyMesh/createBodyMeshMid 에 단방향 전달할 광원 배선 묶음 (surfaceDetail=true 일 때만 사용).
  const surfaceLightingArgs: SurfaceLightingArgs = {
    lighting: planetLighting,
    sunPositionProvider,
  };

  // 각 바디 메쉬 생성 — Phase A: 생성 시점 tier 의 renderScale 로 실측 직경 계산 (ADR §주석 계약 §2).
  //
  // Tier 전환 시 mesh.scaling 을 **절대 값** `newScale / initialRenderScale` 로 설정한다.
  // 과거 `scaleInPlace(ratio)` 반복 호출은 부동소수점 누적 오차를 남겼다 (N2 권고).
  const bodyInitialRenderScale = activeTier; // 모든 body 가 동일 tier 로 생성됨 → Tier 만 기억하면 충분.
  const bodyBaseDiameter = new Map<string, number>(); // body.radius × 2 (m, tier 중립, 진단용)
  for (const body of system.bodies) {
    const mesh = createBodyMesh(
      body,
      scene,
      activeTier,
      bodyScale,
      surfaceDetail,
      surfaceLightingArgs,
    );
    meshes.set(body.id, mesh);
    bodyBaseDiameter.set(body.id, body.radius * 2);
  }

  // #782 §A2 — self-rotation 상태 (rotationPeriodHours 보유 body 만). selfRotation=false 면 빈 Map →
  // updateAt 자전 루프가 전체 skip (연산 0, 자전 정지 = 현행 픽셀 100% 복귀). ADR §A2.3 결정 5/7.
  const rotationStates = new Map<string, RotationState>();
  // ring-anchor: ring 있는 body 의 ring disc 를 host 자전에서 격리하는 비회전 tilt-only 노드
  // (ADR §A2.3 결정 1 — wobble 구조적 0). host 자전은 host mesh 에 직접, ring 은 이 anchor 자식으로.
  const ringAnchors = new Map<string, TransformNode>();
  // 자전각 quaternion 재사용 버퍼 (매 프레임 alloc 0 — cross-validate 고유 발견 1). body 별 out 은 각
  // mesh.rotationQuaternion 이 소유하므로 여기선 spin/tilt 중간 버퍼만 공유 (단일 프레임 순차 계산).
  const tmpSpinQuat = new Quaternion();
  const tmpTiltQuat = new Quaternion();
  const rotationEpoch = system.epoch;
  if (selfRotation) {
    for (const body of system.bodies) {
      const state = computeRotationState(body);
      if (state) {
        rotationStates.set(body.id, state);
        // host mesh 에 rotationQuaternion 을 쓰려면 초기화 필요 (Babylon 은 rotation Euler ↔ quaternion
        // 배타 — quaternion 설정 시 rotation Euler 무시). Identity 로 초기화 후 updateAt 이 매 프레임 갱신.
        const host = meshes.get(body.id);
        if (host) host.rotationQuaternion = Quaternion.Identity();
      }
    }
  }

  // P11-B #289 — LOD mid/low variant lazy-create 저장소 (ADR 20260424-p11-b §축 4).
  //
  // mid (segments=12 low-poly sphere) / low (BILLBOARDMODE_ALL quad) 변형 메쉬는 **첫 전환 시점에**
  // 생성되어 `setEnabled(false)` 로 숨겨둔다. high variant (`meshes.get(id)`) 가 position/transform 의
  // 유일한 owner — mid/low 는 `parent = highMesh` 로 붙어 좌표 추종. `mesh.scaling` 은 high variant 만
  // 건드린다. **예외 1건 (ADR 20260613-675-glow-pixel-marker §축 2)**: low variant quad 는 glow marker
  // 의 화면 고정 크기 역보정 (`scaling = targetPx × bodyScale / pxDiameter`) 에 한해 자체 scaling 을
  // 사용한다. low quad 는 BILLBOARDMODE_ALL + parent 좌표 추종이므로 scaling 은 local 크기에만 작용 —
  // position owner 단일성 (계약의 본질) 은 불변. mid variant 는 여전히 금지.
  const midVariants = new Map<string, Mesh>();
  const lowVariants = new Map<string, Mesh>();
  const bodyCurrentLod = new Map<string, LodLevel>();
  // LOD 집계 — getLodStats 반환 값 재사용 버퍼 (매 프레임 객체 할당 회피).
  const lodStats = { high: 0, mid: 0, low: 0, override: 'auto' as LodOverride };
  // #388 — body 별 LOD raw 데이터 버퍼. runLodPass 가 매 프레임 in-place 갱신.
  // 배열 자체는 매 frame 동일 참조 — body 추가/제거 시에만 길이 조정. 행 객체도 mutable in-place.
  const lodInfo: LodBodyInfo[] = [];
  let lodOverride: LodOverride = 'auto';
  // LOD cross-fade 상태 (ADR §축 3 — 200ms linear interp).
  // 각 body 의 전환 진행 상태 보관. `nowMs - startMs >= LOD_FADE_DURATION_MS` 이면 정착.
  interface LodFadeState {
    fromLevel: LodLevel;
    toLevel: LodLevel;
    startMs: number;
  }
  const lodFadeState = new Map<string, LodFadeState>();
  // ADR §축 3: UX 일관성 + headless 검증 안정화 (middle frame capture) 200ms 고정.
  const LOD_FADE_DURATION_MS = 200;

  // #675 — glow pixel marker: 현재 glow 상태인 body id 집합 (ADR 20260613-675 §축 1-3).
  // material (emissive) 토글은 상태 전이 시점 1회만 수행하기 위한 추적 (매 프레임 material 쓰기 회피
  // — Babylon shader cache 보존). glowMarker=false 면 본 Set 은 영구 비어있음 (연산 0 보장).
  const glowActiveBodies = new Set<string>();

  // P9 #254 PR-2.5 — rings 가 있는 행성에 shader 기반 3층 렌더.
  //   - 'shader' (기본): `densityProfile[]` uniform + GLSL 선형 보간
  //   - 'fallback': M1 InstancedMesh 입자 분포 (shader 실패 또는 `?ring=fallback`)
  //   - 'placeholder': PR-1 단색 disk (회귀 검증용)
  const ringHandlesByBody = new Map<string, RingPlaceholderHandles | RingShaderHandles>();
  for (const body of system.bodies) {
    if (!body.rings || body.rings.length === 0) continue;
    const host = meshes.get(body.id);
    if (!host) continue;

    // R7 #641 — ring × bodyScale 결합 (ADR 20260610-r7 §축 2a, R7 유일 코어 인프라 확장).
    // body mesh 는 생성 시점 `× bodyScale` bake (createBodyMesh) 인데 ring disc 는 실반경 ×
    // renderScale 만이라, 미결합 시 saturn F ring outer (1.4018e8 m) 가 mesh 반경 (×48 =
    // 2.8929e9 m) 의 4.8% — 고리가 mesh 안에 완전히 묻힌다. host bodyScale 을 ring 반경에
    // rendering 시점 곱해 ring/body 비율 = 사실 비율 (saturn 2.326배) 자동 보존. 데이터 SSoT
    // (실측 km) 무수정. generic 결합이므로 jupiter ring 도 가시화 (R6 비-범위 해제 —
    // Behavior Change, ringAlphaHint 0.15 faint 처리로 PM "jupiter faint 대조" 충족).
    const hostBodyScale = bodyScale(body.id);
    const scaledRings = body.rings.map((r) => ({
      ...r,
      innerRadius: r.innerRadius * hostBodyScale,
      outerRadius: r.outerRadius * hostBodyScale,
    }));
    // R7 #641 §축 2b — 층별 colorHint → RGB tuple. 미지정 층은 undefined → DEFAULT `#887766` 폴백.
    const layerColors = body.rings.map((r) => {
      if (!r.colorHint?.hex) return undefined;
      const c = hexToColor3(r.colorHint.hex);
      return [c.r, c.g, c.b] as const;
    });

    // R8 #647 §축 2a — axial tilt (ring-only, 후보 A). 미지정 body 폴백 0 (jupiter 무회귀).
    // uranus 97.77° (세로 고리 — R8 핵심 showcase) / saturn 26.73° (R7 비-범위 동반 해소).
    const axialTiltRad = ((body.axialTiltDeg ?? 0) * Math.PI) / 180;

    let handles: RingPlaceholderHandles | RingShaderHandles;
    if (ringRenderMode === 'placeholder') {
      handles = createRingPlaceholder(scene, host, scaledRings, { tier: activeTier, axialTiltRad });
    } else {
      handles = createRingShaderMesh(scene, host, scaledRings, {
        forceFallback: ringRenderMode === 'fallback',
        tier: activeTier,
        layerColors,
        axialTiltRad,
        // R7 #641 §축 2c — ringAlphaHint (saturn 0.9 prominent / jupiter 0.15 faint).
        // 미지정 시 필드 생략 → shader 기본 0.6 (하위 호환).
        ...(body.ringAlphaHint !== undefined ? { ringAlpha: body.ringAlphaHint } : {}),
      });
    }
    ringHandlesByBody.set(body.id, handles);
    disposables.push({ dispose: () => handles.dispose() });

    // #782 §A2.3 결정 1 — ring wobble 격리. selfRotation + 이 body 가 자전하면 host mesh 가 spin 하는데
    // ring disc 가 host 자식이면 함께 spin → ring tilt 가 자전축 주위로 wobble (R8 세로 고리 붕괴).
    // ring-anchor (비회전 TransformNode) 로 ring disc 를 host 자전에서 격리한다: ring meshes 를 anchor
    // 자식으로 재parent (host 직속 해제) → host 자전 미상속. anchor 는 자체 rotation 0 이고 ring disc 는
    // 여전히 `rotation.x = π/2 + tiltRad` (tilt 보존). anchor 의 position/scaling 은 updateAt 이 host 값으로
    // 동기 (tier scale + origin shift 추종). host 자전(rotation) 만 상속 안 함 → wobble 구조적 0.
    // (cross-validate 이견 수용 1 의 scene graph 격리 — 역회전 보정 없이 구조로 해결.)
    if (selfRotation && rotationStates.has(body.id)) {
      const ringAnchor = new TransformNode(`${body.id}-ring-anchor`, scene);
      // 초기 host transform 복사 (첫 프레임 전 정합 — updateAt 이 이후 매 프레임 동기).
      ringAnchor.position.copyFrom(host.position);
      ringAnchor.scaling.copyFrom(host.scaling);
      for (const m of handles.meshes) m.parent = ringAnchor;
      ringAnchors.set(body.id, ringAnchor);
      disposables.push({ dispose: () => ringAnchor.dispose() });
    }
  }

  // 궤도선 — P12-A: tier 전환 시 재샘플링. 개별 Mesh 대신 LineSystem 하나로 통합해 draw call 감소 (#77).
  //
  // R4 #532 — ADR `20260520-r4-earth-moon-visualization.md` §결정 4:
  //   달 궤도 라인은 별도 LineSystem 으로 분리하여 earth focus 진입 시 색상 강조.
  //   - 일반 시점 (focusBodyIdForAssert !== 'earth'): MOON_ORBIT_COLOR_DEFAULT (Color3(0.30, 0.35, 0.50), #552 a11y 갱신 — WCAG 1.4.11 3.06:1 PASS)
  //   - earth focus 시점 (focusBodyIdForAssert === 'earth'): MOON_ORBIT_COLOR_EARTH_FOCUS (Color3(0.65, 0.7, 0.85)) — 명도 ~2.6배
  //   WebGL 한계로 LineSystem thickness 직접 조절 불가 → 색상 명도 강조로 ADR 의도 (시각 강조) 실현.
  //
  // #627 — satellite 궤도선 구조 결함 fix (ADR `20260606-627-satellite-orbit-structure-forensic.md` §5 옵션 A).
  //   R5 까지 moon 만 별도 LineSystem (parent 추적 + visual scale) 이었고 phobos/deimos/galilean 은
  //   sun 중심 `orbitLines` batch 로 처리 → parent 미추적 (position 0,0,0) + visual scale 미적용 →
  //   궤도선이 태양 원점에 잘못 렌더 (forensic 실측 vertex 54% 원점 밀집). moon 패턴을 parent 별
  //   `Map<string, LineSystem>` 으로 일반화 — earth/mars/jupiter 각 parent 의 모든 satellite 궤도를
  //   하나의 LineSystem 에 담고 (a) updateAt 에서 parent scene 좌표로 position 동기화 + (b)
  //   `getOrbitVisualScale(parentId)` scaling 적용. R7+ (titan/saturn moons) 자동 확장.
  let orbitLines: ReturnType<typeof MeshBuilder.CreateLineSystem> | null = null;
  // #627 — parentId → satellite 궤도 LineSystem (moon 의 'earth' 포함). moon 특수 케이스 제거.
  const satelliteOrbitLines = new Map<string, ReturnType<typeof MeshBuilder.CreateLineSystem>>();
  let orbitLinesVisible = showOrbitLines;

  // R4 #532 — moon orbit line 색상 SSoT (결정 4). #627 — moon 은 satelliteOrbitLines.get('earth').
  const MOON_ORBIT_COLOR_DEFAULT = new Color3(0.3, 0.35, 0.5); // #552 — WCAG 1.4.11 ≥ 3:1 (3.06:1) 충족. 톤 보존으로 EARTH_FOCUS 자연 그라데이션 유지
  const MOON_ORBIT_COLOR_EARTH_FOCUS = new Color3(0.65, 0.7, 0.85); // earth focus 강조 (~2.6배 명도)
  // #627 — 일반 satellite 궤도선 색상 (moon 외 phobos/deimos/galilean). orbitLines (planet) 와 동일 톤.
  const SATELLITE_ORBIT_COLOR_DEFAULT = new Color3(0.25, 0.28, 0.4);

  // #627 — parent 별 satellite 궤도 LineSystem 전체 안전 dispose (agy 보강 ① 다중 LineSystem
  // 라이프사이클). rebuildOrbitLines 재호출 + scene dispose 둘 다에서 호출되어 메모리 누수 차단.
  const disposeSatelliteOrbitLines = () => {
    for (const ls of satelliteOrbitLines.values()) ls.dispose();
    satelliteOrbitLines.clear();
  };

  const rebuildOrbitLines = () => {
    // 기존 라인 제거 후 현재 tier 의 renderScale 로 재샘플링.
    if (orbitLines) {
      orbitLines.dispose();
      orbitLines = null;
    }
    // #627 — satellite 궤도 LineSystem 전체 안전 dispose (agy 보강 ①). tier 전환마다 재호출되므로
    // Map 전체 순회 dispose 없이는 매 전환마다 LineSystem 누수.
    disposeSatelliteOrbitLines();

    // planet 궤도 (sun 중심) batch + parent 별 satellite 궤도 batch 분리 수집.
    const batches: Vector3[][] = [];
    // #627 — parentId → 해당 parent 의 satellite 궤도점 배열 묶음 (한 LineSystem 에 다수 satellite).
    const satellitePtsByParent = new Map<string, Vector3[][]>();
    for (const body of system.bodies) {
      if (!body.orbit) continue;
      // defense-in-depth #5 (이슈 #439): R-Phase 미진입 body 는 본체가 점 수준이라
      // 궤도선만 그리면 시각 혼란. R_PHASE_BODY_ALLOWLIST SSoT 직접 참조 (BODY_SCALE 의존 역전 회피).
      if (!(R_PHASE_BODY_ALLOWLIST as readonly string[]).includes(body.id)) continue;
      const pts = sampleOrbitPoints(body, activeTier);
      if (!pts) continue;
      // #627 — satellite (parentId !== 'sun') 는 parent 별 별도 LineSystem (parent 추적 + visual scale).
      //   sampleOrbitPoints 는 parent 0 원점 기준 ellipse 점을 반환하므로 sun 중심 batch 에 넣으면
      //   태양 원점에 잘못 렌더된다 (forensic 결함). 분류 정책은 isSatelliteOrbit 단일 SSoT (단위 테스트 가드).
      if (isSatelliteOrbit(body.parentId)) {
        // R11 #721 — per-body orbit visual scale 적용 (점 좌표에 직접 곱).
        //   #627 까지는 parent 별 단일 LineSystem 의 `.scaling` 으로 visual scale 일괄 적용했으나,
        //   saturn 위성 4개 (titan 10 / rhea 20 / enceladus 47 / iapetus 10) 가 per-body 로 서로 다른
        //   scale 을 가지면서 같은 LineSystem 에 묶이면 단일 `.scaling` 으로 표현 불가.
        //   → 점 좌표 생성 시점에 per-body scale 을 곱하고 LineSystem `.scaling` 은 1.0 으로 통일.
        //   per-body 미정의 위성 (moon/galilean/titania/triton 등) 은 parent 룩업 fallback 으로 동일값 →
        //   기존 LineSystem `.scaling` × 동일 결과 (회귀 0). resolveWorld 의 mesh position 과 동일 scale 정합.
        //   ADR 20260620-721 §축 2 (Concrete Prediction "코드 0 보장 불가 축").
        const perBodyScale = getOrbitVisualScale(body.parentId, body.id);
        const scaledPts = pts.map((p) => p.scale(perBodyScale));
        const arr = satellitePtsByParent.get(body.parentId!) ?? [];
        arr.push(scaledPts);
        satellitePtsByParent.set(body.parentId!, arr);
      } else {
        batches.push(pts);
      }
    }
    if (batches.length > 0) {
      orbitLines = MeshBuilder.CreateLineSystem('orbit-lines', { lines: batches }, scene);
      // 일반 (planet) 궤도선. satellite orbit 은 satelliteOrbitLines 별도 SSoT.
      // 본 색상은 #552 a11y fix 비대상 (moon orbit 만 WCAG 1.4.11 격차였음).
      orbitLines.color = new Color3(0.25, 0.28, 0.4);
      orbitLines.isVisible = orbitLinesVisible;
    }

    // #627 — parent 별 satellite 궤도 LineSystem 생성 (moon 패턴 일반화).
    for (const [parentId, ptsBatches] of satellitePtsByParent) {
      const ls = MeshBuilder.CreateLineSystem(
        `satellite-orbit-line-${parentId}`,
        { lines: ptsBatches },
        scene,
      );
      // 색상 — earth (moon) 는 a11y 강조 색상 (#552), 나머지 satellite 는 planet 톤.
      // earth 초기 색상은 default — focus 상태에 따라 setMoonOrbitHighlight 가 갱신.
      // (focusBodyIdForAssert TDZ 회피 위해 default 로 시작. tier 전환 후 setFocusOrigin 이
      //  setMoonOrbitHighlight('earth') 재호출해 강조 복원.)
      ls.color = parentId === 'earth' ? MOON_ORBIT_COLOR_DEFAULT : SATELLITE_ORBIT_COLOR_DEFAULT;
      ls.isVisible = orbitLinesVisible;
      // R11 #721 — visual scale 은 위 점 좌표 생성 시점에 per-body 로 이미 곱해졌다 (scaledPts).
      //   #627 까지는 여기서 LineSystem `.scaling` 으로 일괄 적용했으나, saturn 위성 per-body scale
      //   (titan/rhea/enceladus/iapetus 4개 상이) 이 같은 LineSystem 에 묶이면 단일 `.scaling` 표현 불가.
      //   따라서 `.scaling` 은 1.0 (default) 유지 — 이중 적용 방지. resolveWorld mesh position 도 동일
      //   per-body scale 곱해진 좌표라 정합. ADR 20260620-721 §축 2.
      // position 은 parent 가 매 프레임 공전하므로 updateAt 루프에서 parent scene-unit 좌표로 동기화.
      // 초기 position 은 default (0,0,0) — 첫 updateAt 호출 시점에 갱신됨.
      satelliteOrbitLines.set(parentId, ls);
    }
  };

  /**
   * R4 #532 — moon orbit line 색상 강조 토글 (ADR §결정 4).
   *
   * earth focus 진입 / 해제 시 호출되어 moon orbit line 색상을 default ↔ earth-focus 강조 사이 전환.
   * rebuildOrbitLines 가 tier 전환 시 호출되어 초기값으로 재설정되므로, focus 변경 시점에 별도 호출 필요.
   */
  const setMoonOrbitHighlight = (focusedBodyId: string | null) => {
    // #627 — moon 궤도는 satelliteOrbitLines.get('earth') (parent='earth' LineSystem).
    const earthOrbitLine = satelliteOrbitLines.get('earth');
    if (!earthOrbitLine) return;
    earthOrbitLine.color =
      focusedBodyId === 'earth' ? MOON_ORBIT_COLOR_EARTH_FOCUS : MOON_ORBIT_COLOR_DEFAULT;
  };
  rebuildOrbitLines();
  disposables.push({
    dispose: () => {
      orbitLines?.dispose();
      orbitLines = null;
      // #627 — satellite 궤도 LineSystem 전체 dispose (agy 보강 ① — Map 순회 안전 dispose).
      disposeSatelliteOrbitLines();
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
  /**
   * #408 F2 — runTierTransition 진행 중 tier 재판정 lock.
   *
   * `controller.focusOn` 의 cam-target tween 보간과 매 프레임 `updateTierByCamera` 가 race 를 일으켜
   * inner → body → inner oscillate 발생. transition 진행 중에는 `updateTierByCamera` 가 no-op 하도록
   * 전환 시작 시 true, cleanup 완료 시 false.
   *
   * idempotent 보장: `runTierTransition` 의 cleanup 은 정상 종료 / fallback timer / visibilitychange
   * 어느 경로로도 정확히 1회만 발동 (`released` 플래그). onComplete 콜백도 동일하게 1회만 호출.
   *
   * ADR `docs/decisions/20260504-focus-tier-oscillate-fix.md` §결정 2.
   */
  let tierTransitionInProgress = false;
  const setTier = (tier: Tier) => {
    if (tier === activeTier) return;
    // 가드 G8a (#380 G8 fix) — tier 전환 결정 직후 즉시 입력 잠금.
    // ADR `docs/decisions/20260509-380-zoom-camera-freeze-forensic.md` §Amendment 2026-05-11 §G8a.
    //
    // setTier 진입 후 mesh.scaling / boundingInfo / origin shift / mesh.position 루프 등
    // 수 ms 작업 동안 wheel/pinch 입력이 ArcRotateCamera native handler 에 도달해 `radius` 를
    // 직접 변경하면, 곧이어 시작될 tween 의 시작값과 충돌해 jitter (사용자 D-T2 양상 B) 발생.
    // 본 가드는 **준비 작업 시작 전** 입력을 차단하여 race 윈도우를 0 ms 로 축소.
    //
    // 가드 B (`tierTransitionInProgress = true`, 아래 line 663) 와 직교 — 본 가드는 입력 자체를
    // scene 차원에서 차단, 가드 B 는 매 프레임 tier 재판정에서 setTier 재진입 차단.
    // runTierTransition 내부의 detachControl 은 idempotent 흡수.
    scene.detachControl();
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
    // R4 #532 — tier 전환으로 moon orbit line 이 재생성되어 default 색상 초기화됨.
    // focus 가 earth 라면 강조 복원 (ADR §결정 4).
    setMoonOrbitHighlight(focusBodyIdForAssert);

    // #313 M2 — P12 ADR §Q10 Amendment 구현 정합성. tier 전환 시 origin 을 대칭 처리.
    //  - T1/T2 진입 → [0,0,0] reset (T1/T2 에서 매 프레임 FO overhead 제거)
    //  - T3 진입 + focus 있음 → setOriginToBody(focusWorld) 즉시 동기 (QA 회귀 수정: 비대칭 처리 시
    //    runTierTransition 이 focusMesh.absolutePosition 을 이전 origin 기준으로 읽어 카메라 target
    //    mismatch 발생 — PR #315 QA A1 119.9px / V5 296px 퇴행 재현)
    //  - T3 진입 + focus 없음 (free-fly) → null (기존 origin 유지, 다음 updateAt 의 safety net 이 처리)
    const originTarget = computeFloatingOriginForTier(tier, focusBodyIdForAssert, (id) =>
      worldPositions.get(id),
    );
    if (originTarget !== null) {
      if (originTarget[0] === 0 && originTarget[1] === 0 && originTarget[2] === 0) {
        floatingOrigin.reset();
      } else {
        floatingOrigin.setOriginToBody(originTarget);
      }
    }

    // origin 과 newScale 기준으로 mesh.position 즉시 재계산 — `runTierTransition` 이 읽는
    // `focusMesh.absolutePosition` (tier-transition.ts:216-219) 이 새 tier 좌표계여야 카메라 target 정합.
    // updateAt 의 mesh.position 루프 (line 595-610) 와 동일 수식 (의도된 duplication — tier 전환 시점에
    // 1회 추가 실행으로 transition 이 올바른 좌표를 읽게 함).
    const tierTransitionOrigin = floatingOrigin.originOffset;
    for (const [id, world] of worldPositions) {
      const mesh = meshes.get(id);
      if (!mesh) continue;
      mesh.position.set(
        (world[0] - tierTransitionOrigin[0]) * newScale,
        (world[1] - tierTransitionOrigin[1]) * newScale,
        (world[2] - tierTransitionOrigin[2]) * newScale,
      );
      mesh.computeWorldMatrix(true);
    }

    // #782 Amendment 2-i fix (PR #785 reviewer 권고 1 / qa 실측) — ring-anchor 를 setTier 에서도 즉시 동기.
    // updateAt 의 anchor 동기 (`:1318`) 는 `timeChanged` 바인딩이라 speed=0 (pause) 중 tier 전환 시
    // 미발동 → ring-anchor 가 구 tier scale/position 으로 stale (ring/host 스케일 mismatch, 실측 drift
    // 최대 1733% = ring 이 body 대비 28배 어긋난 채 렌더). setTier 는 pause 무관 경로이므로 여기서 host
    // 값으로 즉시 동기해야 tier 전환 즉시 ring 이 body 와 스케일 정합 (updateAt `:1318-1323` 와 동일 수식).
    // ring host 4개 한정 (ringAnchors 는 selfRotation + 자전 ring body 만 보유). host.position/scaling 은
    // 위 루프에서 새 tier 값으로 확정된 상태 (rotation 은 제외 — anchor 는 비회전으로 wobble 0 유지).
    for (const [id, anchor] of ringAnchors) {
      const host = meshes.get(id);
      if (!host) continue;
      anchor.position.copyFrom(host.position);
      anchor.scaling.copyFrom(host.scaling);
    }

    // Phase B — camera dolly interp. scene.activeCamera 가 ArcRotateCamera 가 아니면 skip.
    // (e.g. 테스트 셋업 / 비정상 초기화 경로). 통상 경로는 setupArcRotateCamera 에서 항상 ArcRotateCamera.
    //
    // focus 가 있으면 해당 mesh 전달 — runTierTransition 이 `boundingRadius × 5` (V5 달성 공식) 로
    // 목표 radius 계산. 없으면 실거리 보존 수식 fallback (free-fly 전환 경로).
    const cam = scene.activeCamera;
    if (cam && isArcRotateCamera(cam)) {
      // P12-C M1 — 이전 전환의 fallback timer / visibility listener 를 먼저 정리.
      // 이전 cleanup 이 아직 살아있다면 그 onComplete 가 호출되어 tierTransitionInProgress 가
      // 일시 false 가 되지만, 바로 아래에서 새 transition 진입과 함께 다시 true 로 set 되므로 안전.
      pendingTierCleanup?.();
      const focusMesh = focusBodyIdForAssert ? meshes.get(focusBodyIdForAssert) : undefined;
      // #408 F2 — lock 진입. updateTierByCamera 가 transition 중 no-op.
      tierTransitionInProgress = true;
      pendingTierCleanup = runTierTransition({
        scene,
        camera: cam,
        oldScale,
        newScale,
        // focusMesh 를 조건부 spread — exactOptionalPropertyTypes 대응 (undefined 명시 금지).
        ...(focusMesh ? { focusMesh } : {}),
        // durationMs / lockMs 기본값 (300 / 500) 사용 — ADR §결정 §주석 계약 §5.
        // #408 F2 — cleanup 완료 시 lock 해제. runTierTransition 의 released 플래그 기반
        // idempotent (정상 종료 / fallback timer / visibilitychange 어느 경로로도 1회만 호출).
        onComplete: () => {
          tierTransitionInProgress = false;
        },
        // #444 — tier transition 윈도우에서 도달한 사용자 입력 시도 횟수. G8b 격상 결정 데이터.
        // 콜백은 transition 종료 시점에 1회 호출 (count > 0 일 때만). 호출자 (SimulationCore) 의
        // metrics 객체로 누적 전달.
        ...(onTierTransitionInputAttempts
          ? { onInputAttempts: onTierTransitionInputAttempts }
          : {}),
      });
    }
  };

  const updateTierByCamera = (
    cameraFromSunMeters: number,
    cameraFromFocusMeters: number,
    freeFlyAnchorBodyId?: string | null,
  ): Tier => {
    // #408 F2 — transition 진행 중에는 재판정 no-op. cam-target tween 보간 race 차단.
    // lock 해제 후 다음 frame 에서 정상 재판정 (focus body 가 정착된 시점).
    if (tierTransitionInProgress) {
      return activeTier;
    }
    // #704 (ADR §5 옵션 c) — 판정 좌표 기준 선택. kind 룩업은 Core `bodiesById` 가 소유(이견 3):
    //  1. 활성 focus 있음 → focus body kind + cameraFromFocus (기존 경로).
    //  2. focus 없음 + free-fly anchor 있음(body tier 진입) → anchor kind + cameraFromFocus(=anchor 거리).
    //     외행성 위성(io=5.2AU)은 cameraFromSun 이 항상 solar 영역이라 tierFromCameraDistance 경로가
    //     body→solar 직행 escalate 하던 회귀를, anchor 기준으로 위성 근방 탐색을 보존한다(외/내행성 통일).
    //  3. focus/anchor 모두 없음 → cameraFromSun (free-fly 탐색 = 자유 시점).
    const referenceBodyId = focusBodyIdForAssert ?? freeFlyAnchorBodyId ?? null;
    const referenceKind = referenceBodyId ? (bodiesById.get(referenceBodyId)?.kind ?? null) : null;
    const nextTier = referenceKind
      ? tierFromFocus(referenceKind, cameraFromFocusMeters)
      : tierFromCameraDistance(cameraFromSunMeters, activeTier);
    if (nextTier !== activeTier) {
      setTier(nextTier);
    }
    return activeTier;
  };

  /**
   * #408 F1 — focusOn 진입 시 final tier 사전 결정 + setTier (의존 역전 (c) 채택).
   *
   * `tierFromFocus(body.kind, cameraDistMeters)` 으로 final tier 를 결정한 뒤 필요 시 `setTier`.
   * `setTier` 가 origin shift / mesh.scaling / runTierTransition 까지 처리하므로 본 함수는 wrapper.
   *
   * 호출 시점 (sim-canvas `syncFocusToScene`):
   *   solar.setFocusOrigin(bodyId)
   *   solar.applyFocusTier(bodyId, cameraDistMeters)   ← 여기
   *   controller.focusOn({ mesh })
   *
   * 이렇게 하면 controller.focusOn 의 cam-target tween 보간 시작 전에 이미 final tier 가 정착되어
   * 보간 중간 frame 의 tierFromFocus 재판정이 동일 tier 를 반환 → setTier no-op → race 차단.
   *
   * @param bodyId focus 대상 body id
   * @param cameraDistMeters focus body 로부터 카메라 목표 거리 (m)
   * @returns 적용 (또는 현재) tier
   *
   * ADR `docs/decisions/20260504-focus-tier-oscillate-fix.md` §결정 1.
   */
  const applyFocusTier = (bodyId: string, cameraDistMeters: number): Tier => {
    const body = bodiesById.get(bodyId);
    if (!body) return activeTier;
    const finalTier = tierFromFocus(body.kind, cameraDistMeters);
    if (finalTier !== activeTier) {
      setTier(finalTier);
    }
    return finalTier;
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
    // R4 #532 — earth focus 진입 시 moon orbit line 강조 (ADR §결정 4).
    setMoonOrbitHighlight(bodyId);
  };
  // P12-A #298 — focus 해제 (reset) 시 tier 는 free-fly 경로로 전환.
  //
  // R-Phase #510 H6 fix — focus 해제는 **tier 까지 default 복원**해야 한다.
  // 이전: focusBodyIdForAssert = null 만 → tier (focus 시 sub-tier) + origin (focus body 위치) 잔존.
  // 잔존 상태에서 sim-canvas 가 controller.reset(35) Animation 시작하면 매 프레임
  // updateTierByCamera 가 잘못된 tier 판정 → setTier 트리거 → tier-transition.ts:288-296 의
  // stopAnimation 이 cam-reset-radius/target 까지 stop + computeTargetRadius(35, oldScale, newScale)
  // 로 radius 폭증 (forensic 실측: 35 → 688,901 ≈ ×19,683).
  //
  // setTier(defaultInitialTier()) 호출은 내부에서 floatingOrigin.reset() (T1/T2 경로) 도 자동
  // 동반하므로 origin 도 함께 복원. focus 진입 시 applyFocusTier + setFocusOrigin 의 대칭.
  const clearFocus = () => {
    focusBodyIdForAssert = null;
    setTier(defaultInitialTier());
    // R4 #532 — focus 해제 시 moon orbit line 강조 해제 (ADR §결정 4).
    setMoonOrbitHighlight(null);
  };

  // #509 — 자유시점 진입. focus tracking 만 해제 (tier/origin 보존).
  // clearFocus 와 분리된 이유는 free-fly UX 가 "현재 시점 그대로 자유 탐색" 의도이므로
  // tier/origin 까지 default 복원하면 사용자 시점이 깨짐 (예: venus 가까이 → 갑자기 solar 뷰).
  const detachFocus = () => {
    focusBodyIdForAssert = null;
    // R4 #532 — 자유시점 진입 시도 moon orbit line 강조 해제 (focus 상태 아님).
    setMoonOrbitHighlight(null);
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

    // 가드 C (#380 G3 fix) — Floating Origin primary follow sub-frame 이동.
    // ADR `docs/decisions/20260509-380-zoom-camera-freeze-forensic.md` §결정 §가드 C.
    //
    // ## 변경 전 race 분기 (G3)
    //
    // 이전 순서: (a) setOriginToBody → (b) mesh.position 갱신 → (c) Babylon render → (d)
    // cam.globalPosition 산출 → (e) updateTierByCamera 가 (d) 로 tier 재판정.
    // T3 body + focus 활성 시 (a) 가 origin 을 매 프레임 W_N 으로 점프시키지만, (d) 의
    // cam.globalPosition 은 ArcRotateCamera 가 alpha/beta/radius/target 으로 산출 — target
    // 이 mesh.absolutePosition 추적이 1 frame 지연되면 (e) 가 shift 전 좌표로 tier 판정 →
    // 매 프레임 tier oscillate → setTier 매 프레임 발동 → detachControl race window 누적 →
    // 최종 freeze.
    //
    // ## fix 사양 (mesh.position 갱신 후 setOriginToBody)
    //
    // 새 순서: (a') mesh.position 갱신 (이전 origin 기준) → (b') setOriginToBody → (c') 다음
    // frame 의 mesh.position 은 새 origin 기준. 한 frame 내에서 mesh.position 과 origin 이
    // 같은 reference frame 으로 정합 → cam.globalPosition 도 일관 → tier 재판정 race 차단.
    //
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

    // #627 — satellite orbit line position 동기화 (moon 패턴 일반화, ADR §5 옵션 A 구현 절차 3).
    // satellite orbit ellipse 점은 sampleOrbitPoints 가 parent 0 원점 기준으로 산출.
    // parent (earth/mars/jupiter) 가 sun 주위를 매 프레임 공전하므로 각 satellite 궤도 LineSystem 의
    // position 을 parent scene-unit 좌표로 동기 (parent 추적). satellite mesh 위치는 worldPositions 가
    // sun 중심 좌표라 위 루프에서 처리됨 (별도 처리 불필요).
    for (const [parentId, ls] of satelliteOrbitLines) {
      const parentWorld = worldPositions.get(parentId);
      if (parentWorld) {
        ls.position.set(
          (parentWorld[0] - ox) * sceneUnitPerMeter,
          (parentWorld[1] - oy) * sceneUnitPerMeter,
          (parentWorld[2] - oz) * sceneUnitPerMeter,
        );
      }
    }

    // #782 §A2.3 결정 5 — self-rotation (자전). rotationStates 는 selfRotation=true 일 때만 채워지므로
    // selfRotation=false 면 이 루프 전체 skip (연산 0, 자전 정지 = 현행 픽셀 100% 복귀).
    //
    // ⚠️ position 루프 (위, `:1213` 계약) 는 mesh.position 만 건드리고 rotation 을 절대 건드리지 않는다
    // (§A2.2-2 실측). 자전은 여기서 rotationQuaternion 만 설정 — position 과 TRS 분해 상 독립 (충돌 0).
    // 자전각 = jd 순수 함수 (누적 아님) → frame-rate 독립·timeScale 자동 연동·결정적 재현.
    if (rotationStates.size > 0) {
      for (const [id, state] of rotationStates) {
        const mesh = meshes.get(id);
        if (!mesh || !mesh.rotationQuaternion) continue;
        // host mesh 에 tilt ∘ spin quaternion 직접 (mid variant 는 parent 상속으로 자동 동기 회전).
        computeSpinQuaternion(
          jd,
          rotationEpoch,
          state,
          tmpSpinQuat,
          tmpTiltQuat,
          mesh.rotationQuaternion,
        );
      }
      // ring-anchor 동기 — ring disc 를 host 자전에서 격리 (wobble 0). host 의 position/scaling 만
      // 복사 (rotation 제외) → ring 은 host 자전 미상속, tilt 만 (ring disc `rotation.x = π/2 + tiltRad`).
      // ring host 4개 한정 (ringAnchors 는 자전하는 ring body 만 보유). tier scale = host.scaling 추종.
      for (const [id, anchor] of ringAnchors) {
        const host = meshes.get(id);
        if (!host) continue;
        anchor.position.copyFrom(host.position);
        anchor.scaling.copyFrom(host.scaling);
      }
    }

    // Floating Origin primary follow (ADR §1-B 확장) — **mesh.position 갱신 후 발동**.
    //
    // focus body 는 태양을 공전하므로 매 프레임 world 좌표가 바뀐다. origin 을 고정하면
    // 다음 프레임에 focus body 가 local 에서 멀어져 jitter 재발 → 매 프레임 origin 을
    // 현재 focus body 의 world 로 따라가게 한다. `setOriginToBody` 가 변화 없으면 no-op
    // 반환하므로 listener 는 델타가 0 인 프레임에는 호출되지 않는다 (Trail 불필요 호출 방지).
    //
    // #313 M2 — P12 ADR §Q10 Amendment: T3 (body) 에서만 활성. T1/T2 는 setTier 가 origin 을
    // 리셋해 [0,0,0] 유지 → 아래 primary follow skip 으로 매 프레임 setOriginToBody 호출 제거.
    //
    // #380 가드 C — 본 호출이 mesh.position 루프 **이후** 에 위치하는 것이 핵심 race 차단.
    // 이 순서를 역전하면 G3 분기 재발 — 위 주석 계약 SSoT 참조.
    if (activeTier === 'body' && focusBodyIdForAssert) {
      const focusWorld = worldPositions.get(focusBodyIdForAssert);
      if (focusWorld) {
        floatingOrigin.setOriginToBody([focusWorld[0], focusWorld[1], focusWorld[2]]);
      }
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
    // `process` 는 브라우저 번들 런타임에 없을 수 있어 runtime guard 사용. Next.js webpack 이 `process.env.NODE_ENV`
    // 를 빌드 타임 치환 → prod bundle 에서는 `'development' !== 'production'` 이 false 가 되어 DCE.
    // SSR / 테스트 환경은 `globalThis.process` 유/무 가드로 안전 접근.
    //
    // 카메라 local 불포함 (2026-04-22 재정정): Floating Origin 의 목적은 렌더 대상(mesh) 의 scene
    // 좌표 jitter 해소. 카메라는 focus body 를 관찰하기 위해 수 AU 떨어진 위치가 정상이며, 카메라
    // local 에 1e5 m 제한을 두면 T3 body tier (P12 단일 모드) 가 물리적으로 동작 불가. float32 jitter 는
    // mesh local (작은 값) 에서만 발생하므로 카메라 local 은 Three.js/Babylon 내부 부동소수점 관리에
    // 위임한다. ADR 20260422-floating-origin.md §6-β / §Amendments 2026-04-22 참조.
    //
    // #313 M2 reviewer 권고 — T3 (body) 에서만 assert 활성. T1/T2 는 `floatingOrigin.reset()` 으로
    // origin=[0,0,0] 유지 → focus body local = 절대 월드 좌표 (지구 = 1 AU ≈ 1.5e11 m) 로 항상 ≥1e5
    // 임계 초과 → dev 빌드 console.error spam 발생. assert 자체가 T3 primary follow 불변식 검증 목적
    // 이므로 T1/T2 에서는 무의미. primary follow / safety net 가드와 동일 조건으로 통일.
    if (floatingOriginAssertEnabled() && cam && activeTier === 'body') {
      const focusId = focusBodyIdForAssert;
      const focusWorld = focusId ? worldPositions.get(focusId) : null;
      if (focusWorld) {
        // #380 가드 C 후속 fix — 가드 C 가 setOriginToBody 호출을 mesh.position 루프 후로
        // 옮겼기 때문에 line 826 의 ox/oy/oz 는 *변경 전 origin* 이다. assert 는 *변경 후*
        // origin 기준으로 focus body local 좌표를 검증해야 mercury 같이 멀리 있는 body 의
        // 첫 frame stale origin 박제로 인한 console.error spam (CI verify:378-focus FAIL 원인)
        // 을 회피. originOffset 은 setOriginToBody 호출 시 mutate 되므로 다시 읽음.
        const currentOrigin = floatingOrigin.originOffset;
        const fx = focusWorld[0] - currentOrigin[0];
        const fy = focusWorld[1] - currentOrigin[1];
        const fz = focusWorld[2] - currentOrigin[2];
        const focusLocalMax = Math.max(Math.abs(fx), Math.abs(fy), Math.abs(fz));
        if (focusLocalMax >= 1e5) {
          console.error(
            `[floating-origin] focus body '${focusId}' local 좌표 초과 (≥1e5m): ${fx},${fy},${fz}`,
          );
        }
      }
    }

    // P11-B #289 — LOD 3단 분기 hook (ADR 20260424-p11-b-lod-design §결정).
    //
    // 선행 ADR `20260424-tier-naming-policy.md` §Prediction 1 Amendment — 본 파일에 LOD 분기 hook 추가는
    // 예외 허용. 금지 조건 (mesh.position 수식 / renderScaleForTier 적용 지점 / Tier 상수 / activeTier
    // 의미 / FloatingOrigin 상호작용 / setTier origin 로직) 은 본 hook 에서 건드리지 않음.
    //
    // hook 책임:
    //  1. 각 body 의 `screenCoverageRadius` 계산 → `lodFromScreenCoverage` 로 LOD 결정
    //  2. LOD 변경된 body 는 `lodFadeState` 에 200ms cross-fade 등록
    //  3. variant visibility / alpha 갱신
    //  4. 집계 `lodStats` 갱신 (dev overlay 용)
    if (cam) {
      runLodPass(cam);
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

  // P11-B #289 — LOD 분기 / variant lazy-create / alpha blend.
  //
  // 매 updateAt 에서 한 번 호출. body 개수 O(N) 선형이며 태양계 100+ body 기준 프레임당 몇 마이크로초.
  // 내부 정책:
  //  - variant (mid / low) 는 lazy-create: 첫 전환 시점에 생성 → 초기 로딩 비용 분산 (ADR 교차검증 반영)
  //  - 정착 상태는 `bodyCurrentLod` 에서 읽고, 변경 감지 시 `lodFadeState` 로 200ms cross-fade 시작
  //  - fade 중에는 fromVariant.alpha=1→0, toVariant.alpha=0→1. 종료 프레임에 fromVariant.setEnabled(false)
  const runLodPass = (camera: { getViewMatrix?: unknown; globalPosition: Vector3 }) => {
    lodStats.high = 0;
    lodStats.mid = 0;
    lodStats.low = 0;
    lodStats.override = lodOverride;
    // #388 — body 별 raw 데이터 버퍼 인덱스. system.bodies 길이 변동 없음 (정적 SSoT).
    let lodInfoIndex = 0;

    // view × projection 결합 행렬. Babylon `scene.getTransformMatrix()` 는 `viewMatrix × projectionMatrix` 의
    // column-major 16 원소 Float32Array (`.m` 필드). 카메라 타입 관계없이 scene 단위로 호출 가능.
    const vp = scene.getTransformMatrix();
    const vpArr = vp.m;
    const viewportHeight = scene.getEngine().getRenderHeight() || 800;

    // #379 fix — screenCoverageRadius 의 edge offset 을 camera-up basis 로 박제.
    // viewMatrix 는 world-to-view 변환. invert 결과의 col 1 = world space camera-up basis.
    // edge offset 을 cameraUp 으로 두면 NDC y 변화가 주성분 → viewportHeight 환산이 정확.
    // (cameraRight 면 NDC x 가 주성분이 되어 perspective anisotropy 로 viewportWidth 환산 필요)
    // 매 프레임 1회 계산 후 모든 body 에 재사용 (성능 영향 0).
    //
    // 첫 frame 에 scene._viewMatrix 가 lazy 초기화 안 된 경우 null 가능 — fallback `[0, 1, 0]`
    // 으로 두면 world-up 근사. ArcRotateCamera default 자세에서 cameraUp 이 world-up 의
    // view-forward 성분 제거 후 정규화된 형태라 ±10% 이내. 두 번째 frame 부터 정확한 invView 사용.
    const viewMatrix = scene.getViewMatrix();
    let cameraUpWorld: [number, number, number] = [0, 1, 0];
    if (viewMatrix && typeof viewMatrix.clone === 'function') {
      const invView = viewMatrix.clone().invert();
      const ivm = invView.m;
      cameraUpWorld = [ivm[4] ?? 0, ivm[5] ?? 1, ivm[6] ?? 0];
    }

    const now = performance.now();

    // 카메라 월드 좌표 (m) — mesh 의 world (worldPositions) 와 동일 좌표계에서 거리 계산.
    // scene 카메라 globalPosition 은 scene unit → sceneUnitPerMeter 로 역환산.
    const sceneUnitPerMeter = renderScaleForTier(activeTier);
    const metersPerSceneUnit = sceneUnitPerMeter > 0 ? 1 / sceneUnitPerMeter : 1;
    const origin = floatingOrigin.originOffset;
    // camera.globalPosition 은 local (floating origin 적용된 scene unit). 월드 m 환산 = local(m) + origin.
    const camWorldX = camera.globalPosition.x * metersPerSceneUnit + origin[0];
    const camWorldY = camera.globalPosition.y * metersPerSceneUnit + origin[1];
    const camWorldZ = camera.globalPosition.z * metersPerSceneUnit + origin[2];

    for (const body of system.bodies) {
      const world = worldPositions.get(body.id);
      const highMesh = meshes.get(body.id);
      if (!world || !highMesh) continue;

      // body 의 local 좌표 (m, FO 적용된) — screenCoverageRadius 에 전달할 scene 좌표 basis.
      const localX = world[0] - origin[0];
      const localY = world[1] - origin[1];
      const localZ = world[2] - origin[2];

      // 카메라-body 실세계 거리 (m).
      const dx = world[0] - camWorldX;
      const dy = world[1] - camWorldY;
      const dz = world[2] - camWorldZ;
      const cameraDistanceMeters = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // R1 #329 — LOD 결정에 사용하는 effective radius 는 `body.radius × bodyScale`.
      // sun (× 75) 같이 시각 과장된 body 는 화면 점유가 실제로 큰 픽셀이므로 high LOD 가 자연스럽다.
      // ADR `20260425-r1-sun-visualization.md` §결정 4 (축 4 후보 α).
      // #675 — bodyScale 값을 변수로 hoisting: glow marker 발동 판정 (실 billboard px 환산) 에서
      // 재사용. glowMarker=false 경로의 호출 횟수/결과는 기존과 동일 (semantic 불변).
      const bodyScaleVal = bodyScale(body.id);
      const effectiveRadius = body.radius * bodyScaleVal;
      const coverage = screenCoverageRadius(
        [localX, localY, localZ],
        effectiveRadius,
        sceneUnitPerMeter,
        vpArr,
        viewportHeight,
        cameraUpWorld,
      );

      const isFocused = focusBodyIdForAssert === body.id;
      const baselineLevel = lodFromScreenCoverage({
        body,
        cameraDistanceMeters,
        screenCoverage: coverage,
        isFocused,
        override: lodOverride,
      });

      // #546 — parent-focus aware satellite LOD floor + 4 px guard (외부 가드 후처리, SRP 단방향).
      // ADR `docs/decisions/20260524-546-satellite-billboard-visibility-forensic.md` §5 §결정.
      //
      // - earth focus + moon (parentId='earth') → low → mid 승격 (사용자 형태 인지 충족)
      // - earth focus + mercury (parentId='sun') → 가드 비활성 (행성 분기 — Q3=(c))
      // - default sun 시점 → 가드 비활성 (Q2=(a) — moonScale 200 의도 보존)
      // - pxDiameter < 4 → low 유지 (alpha mask Amendment 1 보호, cross-validate 이견 수용 #1)
      //
      // 호출 시퀀스: lod.ts 가 baseline 반환 → 본 가드 후처리 → effective level 출력
      // (Split-brain SRP 회피 — lod.ts 입력 무영향, 출력만 후처리). agy 이견 수용 #2.
      const nextLevel = applySatelliteVisibilityGuard({
        parentId: body.parentId,
        focusedBodyId: focusBodyIdForAssert,
        baselineLodLevel: baselineLevel,
        pxDiameter: coverage * 2,
      });

      const prevLevel = bodyCurrentLod.get(body.id);
      if (prevLevel !== nextLevel) {
        // 전환 시작 — 200ms cross-fade 등록. mid/low variant 는 lazy-create.
        if (prevLevel !== undefined) {
          lodFadeState.set(body.id, {
            fromLevel: prevLevel,
            toLevel: nextLevel,
            startMs: now,
          });
        }
        bodyCurrentLod.set(body.id, nextLevel);
      }

      // variant visibility / alpha 갱신. fade 중이면 alpha interp, 정착이면 단일 variant.
      applyLodVariantState(body, highMesh, nextLevel, now);

      // 집계.
      if (nextLevel === 'high') lodStats.high += 1;
      else if (nextLevel === 'mid') lodStats.mid += 1;
      else lodStats.low += 1;

      // #391 Phase 2 — billboard alpha mask 4px fallback 토글 (cross-validate 이견 수용 #1).
      // ADR `docs/decisions/20260502-391-phase2-billboard.md` §결정 §"4px fallback 분기".
      //  - pxDiameter ≥ 4px: alpha mask 적용 (원형 disc 인지)
      //  - pxDiameter < 4px: alpha mask 바이패스 (사각형 quad 유지) — sub-pixel flickering 회피
      //
      // low variant 가 lazy-create 된 후에만 의미 있음. 미생성 시 토글 skip.
      // billboard fade 중에도 정확한 mask 상태 유지 — fade 는 material.alpha (0~1) 를 건드리지만
      // opacityTexture 자체는 별개 채널. fade 종료 후에도 fallback 상태가 보존됨.
      const pxDiameter = coverage * 2;
      const lowVariantMesh = lowVariants.get(body.id);

      // #675 — glow pixel marker 발동 판정 (순수 함수 — ADR 20260613-675-glow-pixel-marker §축 6).
      // 판정 식 (발동 임계 실 billboard px 환산 / off-frustum 가드 / 2:1 크기 계층 / emissive 계층)
      // 전부 glow-marker.ts 에 박제 — scene 은 mesh/material 적용만 담당.
      // glowMarker=false (`?marker=off`) 면 무조건 inactive — 기존 동작 100% 보존 (연산 0 수준).
      const glow = resolveGlowMarker({
        glowMarker,
        nextLevel,
        pxDiameter,
        bodyScaleVal,
        parentId: body.parentId,
        kind: body.kind,
        satelliteRatio: glowMarkerSatelliteRatio,
      });

      if (lowVariantMesh) {
        const lowMat = lowVariantMesh.material as StandardMaterial | null;
        if (lowMat) {
          // #675 — glow 중에는 radial gradient alpha mask 를 강제 적용해 "둥근 글로우 점" 형상 유지.
          // (4px fallback 의 사각 quad 는 glow 마커로 부적합 — 기존 동작은 glow.active=false 면 불변)
          const wantsMask = glow.active || shouldApplyBillboardAlphaMask(pxDiameter);
          // 매 프레임 호출되므로 토글 변경이 있을 때만 material 갱신 (Babylon shader cache 보존).
          // opacityTexture 의 boolean 비교는 reference equality — null 또는 동일 인스턴스 비교.
          const hasMask = lowMat.opacityTexture !== null && lowMat.opacityTexture !== undefined;
          if (wantsMask !== hasMask) {
            if (wantsMask) {
              lowMat.opacityTexture = getOrCreateBillboardAlphaMask(scene);
              lowMat.transparencyMode = 1; // ALPHATEST
            } else {
              lowMat.opacityTexture = null;
              lowMat.transparencyMode = 0; // OPAQUE
            }
          }
        }
      }

      // #675 — glow pixel marker 적용 (화면 고정 크기 역보정 + emissive boost).
      //
      // 주석 계약 예외 1건 (ADR 20260613-675-glow-pixel-marker §축 2): low variant quad 에 한해
      // glow marker 의 화면 고정 크기 역보정 scaling 사용 — 본 파일 변수 선언부 주석 계약의 개정문 참조.
      //
      // scaling = glow.scale = targetPx × bodyScale / pxDiameter (산식·클램프는 glow-marker.ts SSoT).
      // scaling 은 매 프레임 갱신 (줌 변화 연속 추종), material (emissive) 쓰기는 상태 전이 시 1회만
      // (glowActiveBodies Set 추적 — Babylon shader cache 보존, ADR §축 1-3 fps 영향 0 근거).
      if (glowMarker) {
        const wasGlow = glowActiveBodies.has(body.id);
        if (glow.active && lowVariantMesh) {
          lowVariantMesh.scaling.setAll(glow.scale);
          if (!wasGlow) {
            glowActiveBodies.add(body.id);
            const mat = lowVariantMesh.material as StandardMaterial | null;
            if (mat) {
              // createBodyBillboard 의 non-star emissive (c×0.3) 대비 boost — "빛나는" 인상.
              // 계층값 (parent 1.6 / satellite 2.0) 은 glow-marker.ts PM 확정값 SSoT.
              const c = hexToColor3(body.colorHint?.hex ?? '#888888');
              mat.emissiveColor = c.scale(glow.emissiveScale);
            }
          }
        } else if (wasGlow) {
          // low 이탈 (LOD 경계) — 원복. popping 은 명시 수용 (ADR §축 3 — 발동/해제 경계가 LOD low
          // 경계와 일치해 기존 200ms LOD cross-fade 가 마스킹. 히스테리시스는 dead-code 가드로 기각).
          glowActiveBodies.delete(body.id);
          if (lowVariantMesh) {
            lowVariantMesh.scaling.setAll(1);
            const mat = lowVariantMesh.material as StandardMaterial | null;
            if (mat) {
              const c = hexToColor3(body.colorHint?.hex ?? '#888888');
              // createBodyBillboard 기본값 원복 — star full emissive / non-star ×0.3 (SSoT 대조는
              // glow-marker.test.ts 가 박제).
              mat.emissiveColor = c.scale(resolveGlowMarkerRestoreEmissiveScale(body.kind));
            }
          }
        }
      }

      // #388 — body 별 raw 데이터 박제. lodInfo 버퍼는 매 프레임 in-place 갱신 (객체 재할당 회피).
      // 시각 직경 추정 (pxDiameter) = coverage × 2 — screenCoverageRadius 가 반지름이므로 직경은 두 배.
      //
      // #393 — billboard alpha mask 상태 박제 (low variant 만 의미 있음, null 외 경우 dev overlay 표시).
      // pxDiameter 와 shouldApplyBillboardAlphaMask 임계 (4px) 비교 결과를 즉시 노출 — 4px fallback
      // 트리거 / mask 적용 / sphere 분기 모두 시각화 가능.
      const billboardAlphaMask: boolean | null =
        nextLevel === 'low' && lowVariants.has(body.id)
          ? shouldApplyBillboardAlphaMask(pxDiameter)
          : null;
      const existing = lodInfo[lodInfoIndex];
      if (existing) {
        existing.id = body.id;
        existing.level = nextLevel;
        existing.screenCoverage = coverage;
        existing.pxDiameter = pxDiameter;
        existing.cameraDistanceMeters = cameraDistanceMeters;
        existing.billboardAlphaMask = billboardAlphaMask;
      } else {
        lodInfo.push({
          id: body.id,
          level: nextLevel,
          screenCoverage: coverage,
          pxDiameter,
          cameraDistanceMeters,
          billboardAlphaMask,
        });
      }
      lodInfoIndex += 1;
    }
    // body 가 줄었을 가능성 — trailing slot 잘라내기 (현재 시스템에선 정적이지만 미래 안전).
    if (lodInfo.length > lodInfoIndex) lodInfo.length = lodInfoIndex;
  };

  /**
   * body 의 현재 LOD 상태를 variant mesh 에 반영.
   *
   * 전환 중 (lodFadeState 에 등록) 이면 fromVariant.alpha + toVariant.alpha 양방향 interp.
   * 정착 상태면 해당 variant 만 setEnabled(true) + alpha=1.
   */
  const applyLodVariantState = (
    body: LoadedCelestialBody,
    highMesh: Mesh,
    level: LodLevel,
    nowMs: number,
  ) => {
    const fade = lodFadeState.get(body.id);
    if (fade) {
      const elapsed = nowMs - fade.startMs;
      if (elapsed >= LOD_FADE_DURATION_MS) {
        // fade 종료 — from variant hide, to variant show (alpha=1).
        lodFadeState.delete(body.id);
        hideVariantEntirely(body, highMesh, fade.fromLevel);
        showVariantEntirely(body, highMesh, fade.toLevel);
        return;
      }
      const t = elapsed / LOD_FADE_DURATION_MS;
      // alpha linear interp. to: 0→1, from: 1→0.
      const fromAlpha = 1 - t;
      const toAlpha = t;
      setVariantAlpha(body, highMesh, fade.fromLevel, fromAlpha, true);
      setVariantAlpha(body, highMesh, fade.toLevel, toAlpha, true);
      return;
    }
    // 정착 상태 — level 만 보이기.
    showVariantEntirely(body, highMesh, level);
    // 나머지 variant 는 숨기기.
    for (const other of ['high', 'mid', 'low'] as LodLevel[]) {
      if (other !== level) hideVariantEntirely(body, highMesh, other);
    }
  };

  const getVariantMesh = (body: LoadedCelestialBody, highMesh: Mesh, level: LodLevel): Mesh => {
    if (level === 'high') return highMesh;
    // ADR `20260424-tier-naming-policy.md` §Prediction 1 Amendment 금지 조건 준수 — variant factory 는
    // `bodyInitialRenderScale` 로 diameter 를 고정하고, tier 전환으로 인한 크기 변화는 parent highMesh
    // 의 `scaling = newScale / initialScale` 에서 자동 상속된다. `activeTier` 를 전달하면 생성 시점에
    // 이미 parent scaling 이 반영된 값 위에 `renderScaleForTier(activeTier)` 가 한 번 더 곱해져 이중
    // scale 이 발생 (리뷰 #321 Blocking 2 지적).
    if (level === 'mid') {
      let m = midVariants.get(body.id);
      if (!m) {
        m = createBodyMeshMid(
          body,
          scene,
          bodyInitialRenderScale,
          highMesh,
          bodyScale,
          surfaceDetail,
          surfaceLightingArgs,
        );
        midVariants.set(body.id, m);
      }
      return m;
    }
    // low
    let m = lowVariants.get(body.id);
    if (!m) {
      m = createBodyBillboard(body, scene, bodyInitialRenderScale, highMesh, bodyScale);
      lowVariants.set(body.id, m);
    }
    return m;
  };

  const showVariantEntirely = (body: LoadedCelestialBody, highMesh: Mesh, level: LodLevel) => {
    const m = getVariantMesh(body, highMesh, level);
    // isVisible 로 렌더 여부만 제어 — setEnabled(true/false) 는 parent-child 전파 때문에
    // high variant 에 쓰면 자식(mid/low) 도 렌더 중단됨 (리뷰 #321 Blocking 1 지적).
    m.setEnabled(true);
    m.isVisible = true;
    setVariantAlpha(body, highMesh, level, 1, false);
  };

  const hideVariantEntirely = (body: LoadedCelestialBody, highMesh: Mesh, level: LodLevel) => {
    // parent-child 전파 차단을 위해 `isVisible` 로만 렌더 여부 토글. `setEnabled` 는 자식 variant 로
    // 전파되어 mid/low 가 정착 상태여도 함께 숨겨지는 버그 유발 (리뷰 #321 Blocking 1).
    // - high: 반드시 `setEnabled(true)` 유지 (mid/low 의 parent 로 transform 공급)
    // - mid/low: `isVisible=false` 로 통일. `setEnabled(false)` 사용 금지
    if (level === 'high') {
      highMesh.isVisible = false;
      return;
    }
    const m = level === 'mid' ? midVariants.get(body.id) : lowVariants.get(body.id);
    if (m) m.isVisible = false;
  };

  const setVariantAlpha = (
    body: LoadedCelestialBody,
    highMesh: Mesh,
    level: LodLevel,
    alpha: number,
    _duringFade: boolean,
  ) => {
    const m = getVariantMesh(body, highMesh, level);
    m.setEnabled(true);
    m.isVisible = true;
    const mat = m.material;
    if (mat && 'alpha' in mat) {
      (mat as { alpha: number }).alpha = alpha;
    }
    // fade 중에는 둘 다 보여야 하므로 isVisible 유지. 정착 시 hideVariantEntirely 로 반대편 숨김.
  };

  // P11-B #289 — LOD API 외부 노출.
  const setLodOverride = (level: LodOverride) => {
    lodOverride = level;
    lodStats.override = level;
  };
  const getLodStats = () => lodStats;
  // #388 — body 별 LOD raw 데이터 노출. dev overlay 가 frame 간격으로 polling.
  const getLodInfo = (): readonly LodBodyInfo[] => lodInfo;

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
        // R4 #539 Amendment 2 — parent-satellite orbit visual scale 적용 (rendering 시점만).
        // 실측 데이터 SSoT (`solar-system.json` semiMajorAxis 등) 보존 + mesh radius
        // 박제값 (BODY_SCALE) 보존 양립을 위한 시각 분리. earth-moon 기본값 30.
        // ADR `20260520-r4-earth-moon-visualization.md` §Amendment 2 §결정.
        // R11 #721 — body.id 2번째 인자 전달로 per-body 룩업 우선 (saturn 위성 enceladus 47/rhea 20/
        // titan 10/iapetus 10). per-body 미정의 위성은 parent 룩업 fallback (회귀 0). ADR 20260620-721 §축 2.
        const visualScale = getOrbitVisualScale(body.parentId, body.id);
        const parentWorld = resolveWorld(body.parentId);
        world[0] = parentWorld[0] + local[0] * visualScale;
        world[1] = parentWorld[1] + local[1] * visualScale;
        world[2] = parentWorld[2] + local[2] * visualScale;
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
    // #627 — 모든 satellite orbit line 도 동일하게 가시성 토글 (moon 패턴 일반화).
    for (const ls of satelliteOrbitLines.values()) ls.isVisible = visible;
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

  // R4 #539 Amendment 3 — body id → parentId lookup (focus multiplier 분기 입력).
  // sim-canvas syncFocusToScene 의 식 후보 2 적용 SSoT. id 미존재 시 undefined 반환.
  const getBodyParentId = (id: string): string | null | undefined => {
    return bodiesById.get(id)?.parentId;
  };

  return {
    meshes,
    updateAt,
    setOrbitLinesVisible,
    getTier,
    setTier,
    updateTierByCamera,
    getBodyState,
    getBodyParentId,
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
    applyFocusTier,
    clearFocus,
    detachFocus,
    setLodOverride,
    getLodStats,
    getLodInfo,
    dispose: () => {
      ambient.dispose();
      sunLight.dispose();
      for (const d of disposables) d.dispose();
      for (const m of meshes.values()) {
        m.material?.dispose();
        m.dispose();
      }
      // P11-B #289 — lazy-create 된 LOD variant mesh 정리.
      for (const m of midVariants.values()) {
        m.material?.dispose();
        m.dispose();
      }
      for (const m of lowVariants.values()) {
        m.material?.dispose();
        m.dispose();
      }
      midVariants.clear();
      lowVariants.clear();
      meshes.clear();
      // #391 Phase 2 — scene 공유 alpha mask 텍스처 정리 (cross-validate 이견 수용 #2).
      // ADR `docs/decisions/20260502-391-phase2-billboard.md` §결정 §"공유 텍스처 dispose 책임".
      // billboard material 들이 모두 dispose 된 후 호출 (참조 정리 후 텍스처 해제 순서 보장).
      disposeBillboardAlphaMask(scene);
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

/**
 * R1 #329 — body 별 시각 과장 배수 default 콜백.
 *
 * 옵션 미주입 시 모든 body 가 실측 그대로 (1.0). 본 default 는 `createSolarSystemScene` 호출자가
 * `apps/web/src/constants/body-scale.ts` 의 `getBodyScale` 을 주입하지 않은 경우 회귀 0 보장.
 */
function defaultBodyScale(_bodyId: string): number {
  return 1.0;
}

// ─────────────────────────────────────────────────────────────────────────────
// #782 §A2 — self-rotation (자전) 인프라.
//
// 자전각 = jd 순수 함수 (`spinAngle(jd) = ((jd − epoch) × ω) mod 2π`, ADR §A2.3 결정 5). 매 프레임
// 누적 금지 — frame-rate 독립·float drift 0·timeScale 자동 연동·결정적 재현 (`?t=<jd>&speed=0`).
//
// 규약 (i) (ADR §A2.3 결정 4 각주): `rotationPeriodHours` 는 항상 양수 magnitude. 자전 방향(역행)은
// `axialTiltDeg` (IAU obliquity, 0~180) 에 내재 — uranus 97.77°/venus 177.36° 처럼 obliquity>90 이면
// pole 이 뒤집혀 양수 spin 이 역행으로 보인다. period 부호를 음수로 주면 방향이 이중 적용되어 뒤집힌다.
//
// 축 방위각 (azimuth) 은 ring 답습 world X 고정 근사 — tilt 는 X 축 주위 회전 (`Quaternion.RotationAxis
// (X, tiltRad)`). ring disc 의 `rotation.x = π/2 + tiltRad` 와 동일 축 → body 자전축 ⊥ ring plane 정합.
// ─────────────────────────────────────────────────────────────────────────────

/** #782 — body 별 자전 파라미터 (데이터에서 1회 산출, 매 프레임 재계산 회피). */
interface RotationState {
  /** 각속도 ω [rad/day] = 2π × 24 / rotationPeriodHours (양수 — 방향은 tiltRad 에 내재, 규약 i). */
  omega: number;
  /** 자전축 기울기 [rad] (axialTiltDeg — obliquity, X 축 주위. 0~π 범위). */
  tiltRad: number;
}

/**
 * #782 — body 데이터에서 자전 파라미터 산출. `rotationPeriodHours` 미지정 시 null (자전 없음).
 * 규약 (i): ω 는 양수 magnitude (방향은 tiltRad 에 내재). loader schema 가 0 을 차단하나 방어적 재확인.
 */
function computeRotationState(body: LoadedCelestialBody): RotationState | null {
  const periodHours = body.rotationPeriodHours;
  if (periodHours === undefined || periodHours === 0) return null;
  // ω [rad/day] = 2π / (period_h / 24). period 는 양수 magnitude — Math.abs 로 방어 (음수 데이터가
  // 실수로 들어와도 방향은 tiltRad(obliquity) 가 결정하므로 magnitude 만 사용, 이중 적용 차단).
  const omega = (2 * Math.PI * 24) / Math.abs(periodHours);
  const tiltRad = ((body.axialTiltDeg ?? 0) * Math.PI) / 180;
  return { omega, tiltRad };
}

/**
 * #782 §A2.3 결정 5 — jd 순수 함수 자전각 → `tilt(axialTilt) ∘ spin(spinAngle)` quaternion.
 *
 * `spinAngle = ((jd − epoch) × ω) mod 2π` (float64 CPU — jd 큰 수 뺄셈을 먼저 수행해 정밀도 보존,
 * cross-validate Q3 실측 ≤ 3.1e-8° 오차). `q = tilt.multiply(spin)` = spin(local Y) 먼저 적용 후
 * tilt(X) — pole 을 tiltRad 만큼 기울인 뒤 그 (기운) 축 주위로 자전 (Babylon multiply 순서: A.multiply(B)
 * 는 B 를 먼저 적용). tmpSpin/tmpTilt 재사용으로 매 프레임 alloc 0 (cross-validate 고유 발견 1).
 *
 * @param jd 현재 Julian Date
 * @param epoch 기준 epoch (JD) — spinAngle 0 기준
 * @param state 자전 파라미터
 * @param tmpSpin 재사용 spin quaternion 버퍼
 * @param tmpTilt 재사용 tilt quaternion 버퍼
 * @param out 결과를 기록할 quaternion (mesh.rotationQuaternion)
 */
function computeSpinQuaternion(
  jd: number,
  epoch: number,
  state: RotationState,
  tmpSpin: Quaternion,
  tmpTilt: Quaternion,
  out: Quaternion,
): void {
  // (jd − epoch) 뺄셈을 float64 로 먼저 (큰 수 − 큰 수 = 작은 수) → mod 2π 로 각 누적 없이 결정적.
  const spinAngle = (((jd - epoch) * state.omega) % (2 * Math.PI)) as number;
  // spin: local Y (자전축) 주위. tilt: world X 주위 (ring 답습 — 자전축 ⊥ ring plane 정합).
  Quaternion.RotationAxisToRef(ROT_SPIN_AXIS, spinAngle, tmpSpin);
  Quaternion.RotationAxisToRef(ROT_TILT_AXIS, state.tiltRad, tmpTilt);
  // q = tilt ∘ spin (spin 먼저 적용 후 tilt — Babylon A.multiply(B) = B 먼저).
  tmpTilt.multiplyToRef(tmpSpin, out);
}

/** #782 — 자전축 (local Y = pole) / tilt 축 (world X = ring 답습). 모듈 상수 (alloc 0). */
const ROT_SPIN_AXIS = new Vector3(0, 1, 0);
const ROT_TILT_AXIS = new Vector3(1, 0, 0);

/**
 * #773 Amendment 1 — 절차 표면 셰이더 광원 배선 인자 (createBodyMesh/createBodyMeshMid 공유).
 * scene 가 소유한 광원 상수 + sun position provider 를 셰이더 팩토리로 단방향 전달.
 */
interface SurfaceLightingArgs {
  lighting: PlanetLightingConstants;
  sunPositionProvider: () => Vector3;
}

function createBodyMesh(
  body: LoadedCelestialBody,
  scene: Scene,
  tier: Tier,
  bodyScale: (bodyId: string) => number,
  surfaceDetail = false,
  surfaceLighting?: SurfaceLightingArgs,
): Mesh {
  // P12-A #298 — 실측 직경 × 현재 tier 의 renderScale 로 메쉬 생성.
  // R1 #329 — × bodyScale (시각 과장 배수, ADR `20260425-r1-sun-visualization.md` §결정 3).
  // `mesh.scaling` 은 1 유지 (tier 전환 시 scaling.scaleInPlace 로 비율 적용, ADR §주석 §2).
  const diameter = body.radius * 2 * renderScaleForTier(tier) * bodyScale(body.id);
  const mesh = MeshBuilder.CreateSphere(body.id, { diameter, segments: 32 }, scene);

  // #756 — 절차적 표면 셰이더 (surfaceDetail=true + 테이블 등록 body 만). 미등록/OFF 면 null →
  // 기존 StandardMaterial 경로 (단색, 무회귀).
  // ADR `docs/decisions/20260628-756-procedural-planet-surface.md` §결정 1·4 + Amendment 1 (#773).
  // #774 — 항성(star)은 emissive 전용 sun 셰이더 (광원 인자 불요 — ADR 20260703-774 §결정 1·4).
  // `?surface=off` (surfaceDetail=false) 면 기존 star 단색 emissive 100% 복귀 (§결정 8).
  const surfaceMat = surfaceDetail
    ? body.kind === 'star'
      ? createSunSurfaceMaterial(scene, body, `${body.id}-surface-mat`)
      : createProceduralPlanetMaterial(scene, body, `${body.id}-surface-mat`, surfaceLighting ?? {})
    : null;
  if (surfaceMat) {
    mesh.material = surfaceMat;
  } else {
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
  }
  // #713 — mesh → bodyId 역매핑 (high variant). ADR `20260620-713-click-body-select.md` §결정 1.
  // pick 결과(pickedMesh)에서 O(1) 역변환. high/mid/low 전 variant 동일 id 박제 (단위 테스트 가드).
  mesh.metadata = { ...(mesh.metadata as object | null), bodyId: body.id };
  return mesh;
}

/**
 * P11-B #289 — mid LOD variant: 저폴리 sphere (segments=12).
 *
 * ADR `docs/decisions/20260424-p11-b-lod-design.md` §축 4.
 * high (segments=32) 대비 약 85% 버텍스 감소 — draw call 비용 동일하나 GPU fill-rate / transform 절감.
 *
 * parent 를 high variant 로 지정 — position / scale 은 high 에서 자동 상속.
 * `scaling = 1` 유지 → tier 전환 시 high 와 동일 배수로 확대 (parent 상속).
 */
function createBodyMeshMid(
  body: LoadedCelestialBody,
  scene: Scene,
  tier: Tier,
  parent: Mesh,
  bodyScale: (bodyId: string) => number,
  surfaceDetail = false,
  surfaceLighting?: SurfaceLightingArgs,
): Mesh {
  // R1 #329 — high variant 와 동일 식 (× bodyScale) 로 비율 보존. LOD 전환 시 사용자가 크기 변화 인지 못함.
  const diameter = body.radius * 2 * renderScaleForTier(tier) * bodyScale(body.id);
  const mesh = MeshBuilder.CreateSphere(`${body.id}-lod-mid`, { diameter, segments: 12 }, scene);
  mesh.parent = parent;
  // parent local 기준 원점 (high mesh 와 동일 위치).
  mesh.position.set(0, 0, 0);

  // #756 — mid variant 도 high 와 동일 절차 셰이더 공유 (segments 만 다름 — ADR §결정 1).
  // LOD 전환 시 표면 연속성 (사용자 인지 불변). 미등록/OFF 면 null → StandardMaterial 무회귀.
  // #773 Amendment 1 — 동일 광원 인자 (high/mid 명암 일관 — 각 variant 의 onBind 가 자기 sunDir 갱신).
  // #774 — 항성(star)은 high 와 동일 sun 셰이더 공유 (팝핑 0 — ADR 20260703-774 §결정 6).
  const surfaceMat = surfaceDetail
    ? body.kind === 'star'
      ? createSunSurfaceMaterial(scene, body, `${body.id}-lod-mid-surface-mat`)
      : createProceduralPlanetMaterial(
          scene,
          body,
          `${body.id}-lod-mid-surface-mat`,
          surfaceLighting ?? {},
        )
    : null;
  if (surfaceMat) {
    mesh.material = surfaceMat;
  } else {
    const mat = new StandardMaterial(`${body.id}-lod-mid-mat`, scene);
    const hex = body.colorHint?.hex ?? '#888888';
    const c = hexToColor3(hex);
    if (body.kind === 'star') {
      mat.emissiveColor = c;
      mat.disableLighting = true;
    } else {
      mat.diffuseColor = c;
      mat.specularColor = new Color3(0.05, 0.05, 0.05);
    }
    // alpha blend 허용 — 200ms cross-fade 에서 material.alpha 조작.
    mat.useAlphaFromDiffuseTexture = false;
    mesh.material = mat;
  }
  // #713 — mesh → bodyId 역매핑 (mid variant). high/low 와 동일 id (ADR §결정 1).
  mesh.metadata = { ...(mesh.metadata as object | null), bodyId: body.id };
  mesh.setEnabled(false); // 기본 숨김 — 첫 전환 시 enable.
  return mesh;
}

/**
 * #391 Phase 2 — billboard quad 의 alpha mask fallback 임계 (pxDiameter, 픽셀).
 *
 * ADR `docs/decisions/20260502-391-phase2-billboard.md` §결정 + cross-validate 이견 수용 #1.
 *
 * **계약 (drift 방어)**:
 *  - pxDiameter ≥ 4px → alpha mask 적용 (원형 disc 인지)
 *  - pxDiameter < 4px → alpha mask 바이패스, 사각형 quad 그대로 유지
 *  - 근거: smoothstep(0.4, 0.5) 의 0.53px 전이 구간이 1 hardware pixel 미만 → GPU sampler aliasing
 *    + sub-pixel flickering 발생. 사용자 D-T2 가 3px 이하 객체에서 원/사각형 구분 불가 →
 *    사각형 quad 가 시각 안정성 우위.
 *
 * 본 임계값을 변경하려면 ADR Amendment 박제 의무 (volt #49 — 주석 계약 vs 구현 drift).
 */
export const LOD_BILLBOARD_ALPHA_MASK_MIN_PX_DIAMETER = 4;

/**
 * #391 Phase 2 — billboard alpha mask 적용 여부 결정 헬퍼.
 *
 * ADR `docs/decisions/20260502-391-phase2-billboard.md` §결정 §"4px fallback 분기".
 * runLodPass 가 매 프레임 호출 + lod.test.ts 단위 테스트에서 경계 검증 (3.9 / 4.1px).
 *
 * @param pxDiameter — 현재 측정된 billboard 직경 (pixel). `screenCoverage * 2` SSoT.
 * @returns true = alpha mask 적용 / false = 사각형 quad 유지 (fallback)
 */
export function shouldApplyBillboardAlphaMask(pxDiameter: number): boolean {
  // NaN / 음수 / undefined → fallback (alpha mask 미적용 안전 측).
  if (!Number.isFinite(pxDiameter) || pxDiameter <= 0) return false;
  return pxDiameter >= LOD_BILLBOARD_ALPHA_MASK_MIN_PX_DIAMETER;
}

/**
 * #391 Phase 2 — alpha mask 텍스처 캐시 키 (scene.metadata 단일 SSoT).
 *
 * scene 단위 1회 생성 + 모든 billboard material 공유. per-body 생성 금지 (메모리 24배).
 * scene dispose 시 함께 dispose 의무 (cross-validate 이견 수용 #2).
 */
const ALPHA_MASK_METADATA_KEY = '__lodBillboardAlphaMask';

/**
 * #391 Phase 2 — billboard 용 procedural 원형 alpha mask 텍스처 (scene 공유 인스턴스).
 *
 * ADR `docs/decisions/20260502-391-phase2-billboard.md` §"developer 단계 작업 명세" §1
 * (옵션 A 채택 — DynamicTexture 64×64 + scene 공유).
 *
 * 동작:
 *  - 첫 호출 시 64×64 DynamicTexture 생성 (≈ 16KB VRAM, Babylon Uber-shader 캐시 호환)
 *  - radial gradient: alpha = 1 - smoothstep(0.4 * size, 0.5 * size, length(uv - 0.5))
 *    → 64.6% 면적이 opaque 원형 disc, 가장자리 ~3.2px 안티앨리어싱 전이
 *  - 두 번째+ 호출은 캐시된 동일 인스턴스 반환 (메모리 1× 보장)
 *  - 캐시는 `scene.metadata.__lodBillboardAlphaMask` 에 저장 — scene dispose 시 함께 정리
 *
 * 텍스처 자체는 모든 billboard material 의 `opacityTexture` 로 공유 참조. material 인스턴스는
 * body 별 emissiveColor / diffuseColor 를 분리 유지하되 mask 만 공유.
 */
function getOrCreateBillboardAlphaMask(scene: Scene): DynamicTexture {
  const meta = (scene.metadata ?? (scene.metadata = {})) as Record<string, unknown>;
  const cached = meta[ALPHA_MASK_METADATA_KEY];
  if (cached instanceof DynamicTexture) return cached;

  const SIZE = 64;
  const texture = new DynamicTexture(
    'lod-billboard-alpha-mask',
    { width: SIZE, height: SIZE },
    scene,
    /* generateMipMaps */ false,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  texture.hasAlpha = true;
  // Babylon DynamicTexture 가 wrap clamp 미설정 시 sub-pixel 가장자리에서 1px 라인 누설 가능.
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;

  const ctx = texture.getContext() as CanvasRenderingContext2D;
  // 투명 초기화 (clearRect 사용 — fillStyle 'transparent' 보다 명시적).
  ctx.clearRect(0, 0, SIZE, SIZE);

  // smoothstep(0.4, 0.5) 의 직접 캔버스 구현 — radial gradient 로 근사.
  // 0.0 ~ 0.4 = alpha 1.0 (완전 opaque)
  // 0.4 ~ 0.5 = smoothstep 전이 구간
  // 0.5 ~ 1.0 = alpha 0 (완전 transparent)
  // 캔버스 픽셀 직접 조작이 가장 정확 (gradient API 의 cubic interp 와 smoothstep 미일치).
  const imageData = ctx.createImageData(SIZE, SIZE);
  const data = imageData.data;
  const cx = (SIZE - 1) / 2;
  const cy = (SIZE - 1) / 2;
  const halfSize = SIZE / 2;
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const dx = (x - cx) / halfSize; // -1 ~ 1
      const dy = (y - cy) / halfSize;
      const dist = Math.sqrt(dx * dx + dy * dy); // 0 ~ √2 (코너 = 1.414)
      // smoothstep(edge0, edge1, x) = clamp((x - edge0) / (edge1 - edge0), 0, 1) ^ 2 * (3 - 2 * t)
      // ADR SSoT — 0.4/0.5 경계 (반지름 기준).
      // dist 는 캔버스 가장자리에서 1.0 (반지름 = halfSize) 이므로 0.4/0.5 = 캔버스 반경의 80%/100%.
      // 단, ADR 박제 0.4/0.5 는 quad UV 0~1 좌표계 (0.5 = 중심, 0~0.5 = 반지름) 기준이라 dist 직접 사용.
      const t = Math.max(0, Math.min(1, (dist - 0.8) / (1.0 - 0.8))); // 0.4*2/0.5*2 = 0.8/1.0
      const smoothstep = t * t * (3 - 2 * t);
      const alpha = 1 - smoothstep;
      const idx = (y * SIZE + x) * 4;
      data[idx + 0] = 255; // R — opacity 텍스처라 RGB 무시되나 white 박제
      data[idx + 1] = 255; // G
      data[idx + 2] = 255; // B
      data[idx + 3] = Math.round(alpha * 255); // A
    }
  }
  ctx.putImageData(imageData, 0, 0);
  texture.update(false /* invertY 무관 */);

  meta[ALPHA_MASK_METADATA_KEY] = texture;
  return texture;
}

/**
 * #391 Phase 2 — scene dispose 시 alpha mask 텍스처 정리 (cross-validate 이견 수용 #2).
 *
 * scene 단위 1회 생성된 DynamicTexture 가 누수되지 않도록 명시 dispose. scene 의 dispose 콜백에서
 * 호출. metadata 키도 함께 정리하여 dispose 후 stale 참조 회피.
 */
function disposeBillboardAlphaMask(scene: Scene): void {
  const meta = scene.metadata as Record<string, unknown> | null;
  if (!meta) return;
  const cached = meta[ALPHA_MASK_METADATA_KEY];
  if (cached instanceof DynamicTexture) {
    cached.dispose();
    delete meta[ALPHA_MASK_METADATA_KEY];
  }
}

/**
 * P11-B #289 — low LOD variant: billboard quad (BILLBOARDMODE_ALL).
 *
 * ADR `docs/decisions/20260424-p11-b-lod-design.md` §축 4.
 * 2 triangle. T1 solar 뷰에서 sub-pixel 로 모이는 100+ body 에 대해 draw call 최소화.
 *
 * billboard 는 카메라를 항상 바라보므로 albedo 단색 quad 가 sphere 느낌을 대체.
 *
 * Phase 2 #333 — billboard 는 sphere/mid variant 와 달리 `bodyScale` 미적용.
 * 책임 분리: sphere/mid 가 시각 과장 (sun ×75) 을 전담, billboard 는 sub-pixel draw call 절감만.
 * focus 강제 해제 + 1 AU+ 카메라 거리 + 픽셀 경계 부족 케이스에서 거대 quad 회귀 차단.
 * ADR `docs/decisions/20260425-r1-sun-visualization.md` §"Phase 2 결정 (#333)" amendment 참조.
 *
 * #391 Phase 2 — alpha mask 적용 의무 (drift 방어).
 *  - quad 의 정사각형 윤곽이 픽셀 그리드에 그대로 노출 → 사용자 D-T2 회귀 (mercury/venus 사각형)
 *  - 본 함수는 항상 alpha mask 적용된 material 로 생성 (기본 상태). LOD pass 가 매 프레임 측정한
 *    pxDiameter < 4px 진입 시 runLodPass 가 opacityTexture = null + transparencyMode = 0 (OPAQUE)
 *    로 fallback 토글. ADR `docs/decisions/20260502-391-phase2-billboard.md` §결정 §"4px fallback".
 *  - 공유 텍스처는 `getOrCreateBillboardAlphaMask(scene)` 가 scene 단위 1회 생성, 24 body 가 동일
 *    인스턴스를 `opacityTexture` 로 참조 → 메모리 ≈ 16KB VRAM (per-body 생성 금지).
 *  - alpha mask threshold (smoothstep 0.4/0.5) 변경 시 ADR Amendment 의무.
 *  - transparencyMode = 1 (ALPHATEST) — ALPHABLEND (2) 는 24 body back-to-front CPU 정렬 부하.
 */
function createBodyBillboard(
  body: LoadedCelestialBody,
  scene: Scene,
  tier: Tier,
  parent: Mesh,
  bodyScale: (bodyId: string) => number,
): Mesh {
  // Phase 2 #333 — billboard 는 sphere/mid variant 와 달리 bodyScale 미적용.
  // 책임 분리: sphere/mid = 가시 과장 책임 (sun ×75), billboard = sub-pixel draw call 절감 책임 단독.
  // ADR `docs/decisions/20260425-r1-sun-visualization.md` §"Phase 2 결정 (#333) — billboard 에서 bodyScale 제거 (후보 A 채택)" 참조.
  // bodyScale 인자 자체는 시그니처 호환성 유지 위해 보존 (호출부 통일 + 미래 변경 가능성).
  void bodyScale; // Phase 2 #333 — 시그니처 보존, 식에서 미사용 명시.
  const diameter = body.radius * 2 * renderScaleForTier(tier);
  const mesh = MeshBuilder.CreatePlane(
    `${body.id}-lod-low`,
    { size: diameter, sideOrientation: 2 /* DOUBLESIDE */ },
    scene,
  );
  mesh.parent = parent;
  mesh.position.set(0, 0, 0);
  mesh.billboardMode = 7; // BILLBOARDMODE_ALL

  const mat = new StandardMaterial(`${body.id}-lod-low-mat`, scene);
  const hex = body.colorHint?.hex ?? '#888888';
  const c = hexToColor3(hex);
  if (body.kind === 'star') {
    mat.emissiveColor = c;
    mat.disableLighting = true;
  } else {
    mat.diffuseColor = c;
    // billboard 는 구형 음영이 없으므로 약한 emissive 로 가시성 보장 — 값은 glow-marker.ts
    // RESTORE 상수와 양방향 SSoT (#675 reviewer 권고 2: 인라인 리터럴은 cross-assert 불가한 단방향 pin)
    mat.emissiveColor = c.scale(GLOW_MARKER_RESTORE_EMISSIVE_SCALE_NON_STAR);
    mat.specularColor = new Color3(0, 0, 0);
  }

  // #391 Phase 2 — alpha mask 적용 (기본 상태).
  // ADR `docs/decisions/20260502-391-phase2-billboard.md` §결정 §"developer 단계 작업 명세" §1.
  // - opacityTexture 로 procedural 원형 alpha mask 적용 (scene 공유 1회 생성)
  // - transparencyMode = ALPHATEST (1) — ALPHABLEND (2) 는 24 body back-to-front 정렬 매 프레임 부하
  //   ALPHATEST 는 fragment shader discard + Z-buffer write → CPU 정렬 비용 0 + 하드웨어 occlusion
  // - useAlphaFromDiffuseTexture = false — opacityTexture 채널 단독 사용 (diffuse 와 분리)
  // 4px fallback 진입 시 runLodPass 가 opacityTexture = null + transparencyMode = OPAQUE (0) 토글.
  mat.opacityTexture = getOrCreateBillboardAlphaMask(scene);
  // Babylon `Material.MATERIAL_ALPHATEST = 1`. 정적 상수 직접 import 시 일부 빌드 환경에서
  // tree-shake 충돌 가능 — 숫자 리터럴 + 주석 SSoT 로 박제 (ADR `20260502-391-phase2-billboard.md`).
  mat.transparencyMode = 1; // ALPHATEST
  mat.useAlphaFromDiffuseTexture = false;
  // ALPHATEST 의 cutoff. opacityTexture alpha < alphaCutOff 면 fragment discard.
  // smoothstep 0.4~0.5 전이 구간의 중간값 (alpha ≈ 0.5) 을 cutoff 로 두면 원형 외곽 ≈ 1px 안티앨리어싱.
  mat.alphaCutOff = 0.5;

  mesh.material = mat;
  // #713 — mesh → bodyId 역매핑 (low/billboard variant). high/mid 와 동일 id (ADR §결정 1).
  // glow marker body 클릭 시 picked mesh 가 low variant 이므로 본 박제가 marker 선택의 핵심.
  mesh.metadata = { ...(mesh.metadata as object | null), bodyId: body.id };
  mesh.setEnabled(false); // 기본 숨김.
  return mesh;
}

/**
 * #627 — 궤도선이 satellite 궤도 (parent 추적 + visual scale 필요) 인지 판정 SSoT.
 *
 * ADR `docs/decisions/20260606-627-satellite-orbit-structure-forensic.md` §5 옵션 A.
 *
 * satellite (moon/phobos/deimos/galilean 등) 의 `sampleOrbitPoints` 는 parent 0 원점 기준
 * ellipse 점을 반환하므로, sun 중심 `orbit-lines` batch 에 넣으면 태양 원점에 잘못 렌더된다
 * (forensic 실측 vertex 54% 원점 밀집). 따라서 parent 가 sun 이 아닌 (= 행성을 도는) body 는
 * parent 별 별도 LineSystem 으로 분리해 (a) position 을 parent scene 좌표로 동기화 +
 * (b) `getOrbitVisualScale(parentId)` scaling 을 적용한다.
 *
 * - parentId === null (sun) → planet batch (false)
 * - parentId === 'sun' (행성) → planet batch (false)
 * - parentId === 'earth'/'mars'/'jupiter' 등 (satellite) → satellite 분리 (true)
 *
 * @param parentId body 의 parentId (LoadedCelestialBody.parentId)
 */
export function isSatelliteOrbit(parentId: string | null | undefined): parentId is string {
  return parentId !== null && parentId !== undefined && parentId !== 'sun';
}

function sampleOrbitPoints(body: LoadedCelestialBody, tier: Tier): Vector3[] | null {
  if (!body.orbit || !body.parentId) return null;
  const orbit = body.orbit;
  // 궤도 한 바퀴 샘플링 (진근점각 기준 등간격)
  // R10b #664 — 고이심률 (e ≥ 0.6) body 는 256 seg: 진근점각 등간격은 근일점 자동 밀집 +
  // 원일점 희소가 구조라, halley (e 0.967) 원일점측 chord sagitta 가 프레임핏 13.97px 로
  // 다각형 꺾임이 육안 식별됨 (D-T2 실측 발동 — ADR 20260612-r10b §축 3 fix 1순위.
  // 256 seg → 1.52px, eris 식별-불가 기준선 1.10px 근접). 임계 0.6 근거: 실측 검증된 최대
  // OK (eris 0.436 — 꺾임 식별 불가) 와 최소 혜성 (encke 0.848) 사이 — e < 0.6 인 기존
  // 24 body 는 seg 64 불변 (vertex 동일, pixel-diff 기존 궤도선 무영향).
  const segments = orbit.eccentricity >= 0.6 ? 256 : 64; // 성능 최적화 (P1 E3) + 고이심률 예외
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
