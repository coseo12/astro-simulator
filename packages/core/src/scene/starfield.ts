/**
 * #738 — 은하수 띠 배경 구 (라이브러리/에셋 0). #1373 부터 별은 실측 카탈로그 (`star-catalog.ts`) 가 그린다.
 *
 * **#1373 변경** (ADR `docs/decisions/20261018-1373-star-catalog-constellations.md` 결정 R4): 절차 별 (view direction
 * 셀 해시) 경로를 지우고 은하수 띠만 남긴다 — 실제 하늘에 없는 별이 실측 별 옆에 찍히면 이슈 목표와 충돌한다.
 * 띠 법선을 「감상용 임의 방향」 에서 **은하 북극** (J2000 RA 192.85948° · Dec +27.12825°) 의 장면 방향으로 바꿨다.
 * 아래 §결정 2 · 4 (셀 해시 · 색온도) 서술은 ADR 738 의 이력이다.
 *
 * **목적** (ADR 738 이력 — #1373 이후 이 구에는 별이 없다): 단색 배경 (`scene.clearColor`) 위에 절차적 별 배경 + 은하수 띠를 단일 draw call
 * 로 렌더해 "우주에 있다" 는 몰입을 제공한다 (방향성 기획서 트랙 A1 — `principles.md §1
 * Visual Fidelity`). 외부 star catalog / 에셋 / 신규 라이브러리 0.
 *
 * **설계 근거**: ADR `docs/decisions/20260624-738-procedural-starfield.md`
 *   - §결정 1 — `infiniteDistance=true` inverted sphere + 절차 fragment ShaderMaterial.
 *     `PointsCloudSystem.pointSize` 가 WebGPU 에서 무효 (v9 실측) → PCS 배제. skybox/PhotoDome
 *     은 외부 에셋 필요 → 배제. `infiniteDistance` 가 floating-origin shift / tier scale / 줌
 *     불변을 **엔진 레벨**로 보장 (별 추종 코드 0).
 *   - §결정 2 — view direction (카메라 ray) 을 3D 셀로 양자화 → per-cell hash 로 별 유무/밝기/
 *     색온도 결정 (cell noise). UV 가 아닌 view direction 기반 → resize/aspect 왜곡 0.
 *   - §결정 3 — 같은 fragment 에서 대원(은하수 평면) 따라 별 밀도 증가 + 희미한 발광 띠 합성.
 *   - §결정 4 — 색온도 분포 (다수 백색~담황 저채도 + 소수 청백/적황). 보라/마젠타 그라데이션
 *     금지 (디자인 루브릭 Originality).
 *   - §결정 5 — `renderingGroupId = 0` (background queue) + `depthWrite = false`. 별이 가장
 *     먼저 그려지고 이후 모든 body/orbit/ring 이 그 위에 덮어쓴다. **`gl_FragDepth` 미사용**
 *     (cross-validate 갱신 — Early-Z 최적화 보존, ring-shader 의 log-depth `gl_FragDepth` 부담 0).
 *   - §결정 6 — `isPickable = false` (#713 raycast 별 hit 0) + LOD 미대상 (body mesh 아님) +
 *     자체 발광 shader (ambient/sun 무영향).
 *
 * **WebGPU↔WebGL parity**: ShaderMaterial GLSL 은 양 백엔드 동작 (ring-shader 선례 — Babylon
 *   GLSL→WGSL 변환). WGSL 별도 작성 불필요.
 *
 * **D1 실측 (developer Phase)**: `infiniteDistance` 가 ArcRotateCamera 줌(radius 변동) + tier
 *   scale 전환 + floating-origin shift 환경에서 별을 가까워지지 않게 하는지 dev 실측 확인 (PASS).
 */

import {
  Color3,
  Effect,
  MeshBuilder,
  ShaderMaterial,
  Vector3,
  type Mesh,
  type Scene,
} from '@babylonjs/core';
import { equatorialJ2000ToEcliptic } from '../coords/equatorial.js';
import { toScene } from '../coords/scene-handedness.js';

// ─────────────────────────────────────────────────────────────────────────────
// 미학 상수 SSoT (#69 숨은 상수 drift 차단 — starfield.test.ts 가드 대상).
// 데이터 SSoT 아님 (rendering-only 미학 상수 — Visual Fidelity §의무 체크리스트 정합).
// 박제값 근거는 measurement-first (별 밀도/은하수 발광은 fps + 시각 품질 실측으로 박제).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * inverted sphere 반지름 (scene unit). `infiniteDistance=true` 라 실제 크기는 무관 — 카메라가
 * 항상 구 중심에 위치하므로 클리핑 회피용 충분히 큰 값이면 된다. minZ(0.01)~maxZ(1e14) 범위 내.
 */
const STARFIELD_SPHERE_DIAMETER = 1000;

/** sphere tessellation — fragment 절차 생성이라 geometry 디테일 불요 (저 segment 로 draw cost 절감). */
const STARFIELD_SPHERE_SEGMENTS = 16;

/**
 * 은하 북극 J2000 적도 좌표 [°] (IAU 1958 은하 좌표계의 FK5 J2000 값 — RA 12h51m26.275s · Dec +27°07′41.70″).
 * #1373 결정 R4 — 은하수 띠를 실제 은하면에 놓는다 (ADR §축 M (a)).
 */
const GALACTIC_NORTH_POLE_RA_DEG = 192.85948;
const GALACTIC_NORTH_POLE_DEC_DEG = 27.12825;

/**
 * 은하수 평면 법선 = 은하 북극의 **장면** 방향 (적도 → 황도 데이터 → `toScene`). 대원 (great circle) 이 은하수 띠 —
 * view direction 과의 내적이 0 근처면 띠 영역. ADR 1373 §축 M 기대값 `(−0.86767, −0.00035, −0.49715)`.
 */
const MILKY_WAY_NORMAL: readonly [number, number, number] = toScene(
  equatorialJ2000ToEcliptic(GALACTIC_NORTH_POLE_RA_DEG, GALACTIC_NORTH_POLE_DEC_DEG),
);

/**
 * 은하수 띠 발광 강도 (0~1). 과도한 네온 금지 — 실제 밤하늘 은하수는 미묘 (§5 시각 품질 가이드).
 * tier-c (저성능) fallback 시 약화 대상. measurement-first 박제.
 */
const MILKY_WAY_GLOW_INTENSITY = 0.16;

/** 은하수 띠 폭 (대원 법선 내적 기준). 클수록 띠가 넓다. */
const MILKY_WAY_BAND_WIDTH = 0.32;

/** 은하수 띠 발광 색조 (담청백 — 실제 은하수 산광 근사, 저채도). 보라/마젠타 금지. */
const MILKY_WAY_GLOW_COLOR: readonly [number, number, number] = [0.62, 0.66, 0.78];

/** shader 이름 prefix — ShadersStore key 충돌 방지 (ring-shader 패턴 답습). */
const SHADER_NAME = 'starfield';

/**
 * GLSL vertex shader — inverted sphere. world position 을 view direction 으로 fragment 에 전달.
 *
 * `infiniteDistance` 라 sphere 가 카메라를 추종하므로, **로컬 정점 방향** (`position`) 이 곧
 * 카메라 기준 view direction 이다. (sphere 중심 = 카메라 = 원점). aspect ratio 변동에 불변
 * (UV 가 아닌 방향 벡터 기반 — ADR §결정 1 cross-validate 수용 3).
 */
const VERTEX_SHADER = /* glsl */ `
precision highp float;

attribute vec3 position;

uniform mat4 worldViewProjection;

varying vec3 vDirection;

void main(void) {
  // 별/은하수 절차 생성의 기준 = 카메라에서 본 방향. inverted sphere 라 로컬 정점 방향이 곧
  // view direction (sphere 중심이 카메라). 정규화는 fragment 에서 (보간 후 단위 벡터 복원).
  vDirection = position;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

/**
 * GLSL fragment shader — 은하수 띠 (#1373 결정 R4 — 절차 별 셀 경로 삭제).
 *
 * uniforms:
 *   - milkyWayNormal: 은하수 평면 법선 = 은하 북극 장면 방향 (정규화)
 *   - milkyWayGlow: 은하수 발광 강도
 *   - milkyWayBandWidth: 은하수 띠 폭
 *   - milkyWayColor: 은하수 발광 색조
 *
 * varying:
 *   - vDirection: view direction (보간 — fragment 에서 정규화)
 */
const FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec3 vDirection;

uniform vec3 milkyWayNormal;
uniform float milkyWayGlow;
uniform float milkyWayBandWidth;
uniform vec3 milkyWayColor;

// 3D hash — view direction 셀 좌표 → [0,1) 의사난수. 셀당 여러 채널이 필요해 vec3 반환.
// fps measurement-first: 기존 sin() 기반 hash 는 fragment 당 다수 sin() 호출 (별 매 fragment +
// fbm 16×) → swiftshader/tier-c 에서 비싸다. sin-free fract-mix 해시 (Dave Hoskins
// "Hash without Sine" 변형) 로 교체 — 동일 분포 품질 + sin() 0 (fps 회귀 완화 핵심).
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

// 스칼라 hash (value noise 용 — 코너 값). hash33.x 재사용.
float hash13(vec3 p) {
  return hash33(p).x;
}

// 3D value noise — trilinear 보간 (smooth). floor 셀 hard cut 의 블록 아티팩트를 제거하기 위해
// 은하수 구름 결에 사용. 셀 코너 8개 hash 를 smoothstep 보간 → 부드러운 저주파 텍스처.
float valueNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f); // smoothstep weight
  return mix(
    mix(
      mix(hash13(i + vec3(0.0, 0.0, 0.0)), hash13(i + vec3(1.0, 0.0, 0.0)), u.x),
      mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), u.x),
      u.y
    ),
    mix(
      mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), u.x),
      mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), u.x),
      u.y
    ),
    u.z
  );
}

// 2-옥타브 fbm — 은하수 구름 결에 자연스러운 디테일. (저주파 + 절반 진폭 고주파).
float fbm(vec3 p) {
  return 0.65 * valueNoise(p) + 0.35 * valueNoise(p * 2.7);
}

void main(void) {
  vec3 dir = normalize(vDirection);

  // ── 은하수 띠 ────────────────────────────────────────────────────────────
  // 대원(great circle)까지의 각거리 ∝ |dir · normal|. 0 근처 = 띠 중심.
  float bandDist = abs(dot(dir, normalize(milkyWayNormal)));
  // 띠 중심(0)에서 1, bandWidth 밖에서 0 으로 부드럽게 (smoothstep).
  float bandFactor = 1.0 - smoothstep(0.0, milkyWayBandWidth, bandDist);
  // fps measurement-first: fbm (≈16 hash33) 는 비싸므로 띠 영역(bandFactor>0) 밖에서는 생략.
  // 화면 대부분이 띠 밖이라 fragment 평균 비용 대폭 절감 (swiftshader/tier-c fps 회귀 완화).
  vec3 milkyWay = vec3(0.0);
  if (bandFactor > 0.0) {
    // 띠 내부 미세 명암 변조 (구름 결) — fbm value noise (smooth, 블록 아티팩트 없음).
    // 0.45~1.0 범위로 구름 결 (어두운 흠 + 밝은 산광 — 실제 은하수의 dust lane 근사).
    float cloud = 0.45 + 0.55 * fbm(dir * 6.0);
    milkyWay = milkyWayColor * milkyWayGlow * bandFactor * bandFactor * cloud;
  }

  gl_FragColor = vec4(milkyWay, 1.0);
}
`;

let shaderRegistered = false;

/**
 * GLSL shader 를 Babylon `Effect.ShadersStore` 에 1회 등록 (ring-shader 패턴 답습).
 */
function registerStarfieldShader(): void {
  if (shaderRegistered) return;
  Effect.ShadersStore[`${SHADER_NAME}VertexShader`] = VERTEX_SHADER;
  Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = FRAGMENT_SHADER;
  shaderRegistered = true;
}

export interface CreateStarfieldOptions {
  /** 은하수 발광 강도 override. 기본 `MILKY_WAY_GLOW_INTENSITY`. tier-c 약화용. */
  milkyWayGlow?: number;
}

/**
 * #738 — `createStarfield` 반환 핸들. `RingShaderHandles` / `AsteroidBeltHandles` repo 관습 정합.
 * ShaderMaterial 은 GPU 자원이므로 scene dispose 시 명시 해제 (누수 차단 — ADR §교차검증 이견 수용 2).
 */
export interface StarfieldHandles {
  /** inverted sphere mesh (`infiniteDistance=true`, `isPickable=false`, `renderingGroupId=0`). */
  mesh: Mesh;
  /** 절차 fragment ShaderMaterial. */
  material: ShaderMaterial;
  /** mesh + material GPU 자원 해제. */
  dispose: () => void;
}

/**
 * 은하수 띠 배경 구 생성 (단일 inverted sphere + fragment ShaderMaterial). 별은 `star-catalog.ts` (#1373).
 *
 * `infiniteDistance=true` 가 카메라 위치 추종 + 회전 반영을 라이브러리 레벨로 보장하므로,
 * floating-origin shift / tier scale 전환 / 줌(radius 변동) 에 띠가 불변이다 (추종 코드 0).
 *
 * @param scene Babylon 씬
 * @param options 은하수 발광 override (tier-c 약화 / 디버그용)
 */
export function createStarfield(
  scene: Scene,
  options: CreateStarfieldOptions = {},
): StarfieldHandles {
  registerStarfieldShader();

  const milkyWayGlow = options.milkyWayGlow ?? MILKY_WAY_GLOW_INTENSITY;

  // inverted sphere — 안쪽을 향한 법선 (sideOrientation BACKSIDE). 카메라가 항상 내부에 위치.
  const mesh = MeshBuilder.CreateSphere(
    'starfield',
    {
      diameter: STARFIELD_SPHERE_DIAMETER,
      segments: STARFIELD_SPHERE_SEGMENTS,
      sideOrientation: 1, // Mesh.BACKSIDE — 안쪽 면 렌더 (inverted sphere)
    },
    scene,
  );

  // ADR §결정 1 / §결정 6 — 박제 필수 설정.
  mesh.infiniteDistance = true; // 카메라 추종 (floating-origin/tier/줌 불변, 회전만 반영)
  mesh.isPickable = false; // #713 raycast 별 hit 0 (별 클릭 → focus 사고 차단)
  mesh.renderingGroupId = 0; // background queue (별이 가장 먼저 → 모든 body/orbit/ring 이 덮어씀)

  const material = new ShaderMaterial(
    'starfield-mat',
    scene,
    { vertex: SHADER_NAME, fragment: SHADER_NAME },
    {
      attributes: ['position'],
      uniforms: [
        'worldViewProjection',
        'milkyWayNormal',
        'milkyWayGlow',
        'milkyWayBandWidth',
        'milkyWayColor',
      ],
    },
  );

  material.setVector3('milkyWayNormal', new Vector3(...MILKY_WAY_NORMAL));
  material.setFloat('milkyWayGlow', milkyWayGlow);
  material.setFloat('milkyWayBandWidth', MILKY_WAY_BAND_WIDTH);
  material.setColor3('milkyWayColor', new Color3(...MILKY_WAY_GLOW_COLOR));

  // ADR §결정 5 — depth write off (Early-Z 보존, gl_FragDepth 미사용). 별은 항상 최배경 =
  // renderingGroupId=0 render order 로 모든 불투명체가 그 위에 덮어쓴다 (z-fighting/log-depth 부담 0).
  material.disableDepthWrite = true;
  // ADR §결정 6 — 자체 발광 (ambient/sun 무영향). backface 렌더 불필요 (inverted sphere 안쪽만).
  material.backFaceCulling = true;

  mesh.material = material;

  const dispose = () => {
    material.dispose();
    mesh.dispose();
  };

  return { mesh, material, dispose };
}

// ─────────────────────────────────────────────────────────────────────────────
// 테스트/검증용 re-export (starfield.test.ts SSoT 가드 — #69 drift 차단).
// ─────────────────────────────────────────────────────────────────────────────
export {
  STARFIELD_SPHERE_DIAMETER,
  STARFIELD_SPHERE_SEGMENTS,
  MILKY_WAY_NORMAL,
  MILKY_WAY_GLOW_INTENSITY,
  MILKY_WAY_BAND_WIDTH,
  MILKY_WAY_GLOW_COLOR,
  // GLSL 소스 (테스트가 mesh-setting 계약 markers / anti-pattern 부재 정적 검증).
  VERTEX_SHADER as STARFIELD_VERTEX_SHADER,
  FRAGMENT_SHADER as STARFIELD_FRAGMENT_SHADER,
};
