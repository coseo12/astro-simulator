/**
 * #738 — 절차적 별 배경 + 은하수 띠 (라이브러리/에셋 0).
 *
 * **목적**: 단색 배경 (`scene.clearColor`) 위에 절차적 별 배경 + 은하수 띠를 단일 draw call
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
 * 별 격자 밀도 (셀/방향). 값이 클수록 별이 촘촘 (별 개수 ∝ density³ 근사). fps trade-off 핵심
 * 파라미터 — measurement-first 박제 (감상 밀도 충분 + fps 무회귀). 줌/회전 무관 무한 해상도.
 */
const STARFIELD_GRID_DENSITY = 240;

/**
 * 별 유무 임계 (per-cell hash > threshold 이면 별). 높을수록 별이 적다. 지수 분포로 다수 희미한
 * 별 + 소수 밝은 별을 만들기 위한 1차 필터.
 */
const STARFIELD_THRESHOLD = 0.965;

/**
 * 은하수 평면 법선 (정규화). 대원(great circle)이 은하수 띠 — view direction 과의 내적이 0 근처
 * 면 띠 영역. 황도/은하 좌표 정렬 불필요 (감상용 임의 미학 방향 — Visual Fidelity rendering-only).
 */
const MILKY_WAY_NORMAL: readonly [number, number, number] = [0.2, 0.92, 0.34];

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
 * GLSL fragment shader — 절차적 별 (cell noise) + 은하수 띠.
 *
 * uniforms:
 *   - gridDensity: 별 격자 밀도 (셀/방향)
 *   - starThreshold: 별 유무 임계 (hash > threshold 이면 별)
 *   - milkyWayNormal: 은하수 평면 법선 (정규화)
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

uniform float gridDensity;
uniform float starThreshold;
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

// 색온도 → RGB 근사 (저채도 흑체). t ∈ [0,1]: 0=적황(M), 0.5=백색~담황(G/K 다수), 1=청백(O/B).
// 보라/마젠타 그라데이션 금지 (디자인 루브릭 Originality) — R↗ 또는 B↗ 단조 tint 만 사용.
vec3 starColor(float t) {
  // 백색 기준에서 양 끝으로 미세 tint (채도 낮게 — 실제 밤하늘 별은 거의 백색).
  vec3 warm = vec3(1.0, 0.86, 0.72); // 적황 (M/K)
  vec3 white = vec3(1.0, 0.98, 0.96); // 백색~담황 (G — 다수)
  vec3 cool = vec3(0.78, 0.86, 1.0); // 청백 (O/B)
  if (t < 0.5) {
    return mix(warm, white, t * 2.0);
  }
  return mix(white, cool, (t - 0.5) * 2.0);
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

  // ── 별 (cell noise) ──────────────────────────────────────────────────────
  // view direction 을 grid 셀로 양자화. 셀 내 무작위 jitter 로 격자 패턴 잔재 차단.
  vec3 scaled = dir * gridDensity;
  vec3 cell = floor(scaled);
  vec3 frac = fract(scaled);
  vec3 rnd = hash33(cell);

  // 은하수 띠 영역은 별 밀도 증가 — threshold 를 띠 안에서 낮춘다 (별이 더 자주 등장).
  float localThreshold = starThreshold - bandFactor * 0.02;

  vec3 star = vec3(0.0);
  // rnd.x 가 임계 초과 → 이 셀에 별 존재.
  if (rnd.x > localThreshold) {
    // 셀 내 별 위치 무작위화 (격자 패턴 차단) — rnd.yz 로 jitter.
    vec2 starPos = vec2(rnd.y, rnd.z);
    float dist = length(frac.xy - starPos);

    // 밝기: 지수 분포 — 다수 희미 + 소수 밝음. (rnd.x - threshold) 를 정규화 후 거듭제곱.
    float norm = (rnd.x - localThreshold) / max(1.0 - localThreshold, 1e-6);
    float brightness = pow(norm, 3.0);

    // 점 형태 — 거리 기반 falloff (작고 또렷한 점, 셀 크기에 비례).
    float pointFalloff = 1.0 - smoothstep(0.0, 0.08, dist);

    // 색온도 — 별마다 다른 분포. 다수 백색 근처 (rnd 를 중앙 편향).
    float temp = hash33(cell + 1.7).x;
    vec3 col = starColor(temp);

    star = col * brightness * pointFalloff;
  }

  vec3 finalColor = star + milkyWay;
  gl_FragColor = vec4(finalColor, 1.0);
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
  /**
   * 별 격자 밀도 override. 기본 `STARFIELD_GRID_DENSITY`. tier-c (저성능) 약화 / 디버그용.
   * (향후 `quality` 3단 경로는 fps 실측이 필요 증명한 만큼만 — ADR §교차검증 기각 2 YAGNI.)
   */
  gridDensity?: number;
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
 * 절차적 별 배경 + 은하수 띠 생성 (단일 inverted sphere + fragment ShaderMaterial).
 *
 * `infiniteDistance=true` 가 카메라 위치 추종 + 회전 반영을 라이브러리 레벨로 보장하므로,
 * floating-origin shift / tier scale 전환 / 줌(radius 변동) 에 별이 불변이다 (별 추종 코드 0).
 * 별/은하수는 fragment 에서 view direction 기반 절차 생성 — 별 개수와 무관한 단일 draw call.
 *
 * @param scene Babylon 씬
 * @param options 별 밀도 / 은하수 발광 override (tier-c 약화 / 디버그용)
 */
export function createStarfield(
  scene: Scene,
  options: CreateStarfieldOptions = {},
): StarfieldHandles {
  registerStarfieldShader();

  const gridDensity = options.gridDensity ?? STARFIELD_GRID_DENSITY;
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
        'gridDensity',
        'starThreshold',
        'milkyWayNormal',
        'milkyWayGlow',
        'milkyWayBandWidth',
        'milkyWayColor',
      ],
    },
  );

  material.setFloat('gridDensity', gridDensity);
  material.setFloat('starThreshold', STARFIELD_THRESHOLD);
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

/**
 * #738 — GLSL fragment `starColor` 함수의 **순수 JS 미러** (색온도 anti-pattern 계약 검증용).
 *
 * GLSL 은 직접 단위 테스트 불가하므로, 이 미러로 색온도 분포가 §결정 4 계약 (다수 백색~담황 +
 * 소수 청백/적황, **보라/마젠타 금지**) 을 따르는지 결정적으로 검증한다 (디자인 루브릭 Originality).
 *
 * ⚠️ 이 함수와 FRAGMENT_SHADER 의 GLSL `starColor` 는 동일 식이어야 한다 (SSoT — 한쪽 수정 시
 * 양쪽 동기화 의무). drift 시 starfield.test.ts 의 색조 단조성 / 보라 부재 단언이 감지.
 *
 * @param t 색온도 ∈ [0,1]: 0=적황(M), 0.5=백색~담황(G/K 다수), 1=청백(O/B)
 * @returns RGB ∈ [0,1]³
 */
export function starColorMirror(t: number): readonly [number, number, number] {
  const warm: readonly [number, number, number] = [1.0, 0.86, 0.72];
  const white: readonly [number, number, number] = [1.0, 0.98, 0.96];
  const cool: readonly [number, number, number] = [0.78, 0.86, 1.0];
  const mix = (
    a: readonly [number, number, number],
    b: readonly [number, number, number],
    f: number,
  ): readonly [number, number, number] => [
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f,
  ];
  if (t < 0.5) return mix(warm, white, t * 2.0);
  return mix(white, cool, (t - 0.5) * 2.0);
}

// ─────────────────────────────────────────────────────────────────────────────
// 테스트/검증용 re-export (starfield.test.ts SSoT 가드 — #69 drift 차단).
// ─────────────────────────────────────────────────────────────────────────────
export {
  STARFIELD_SPHERE_DIAMETER,
  STARFIELD_SPHERE_SEGMENTS,
  STARFIELD_GRID_DENSITY,
  STARFIELD_THRESHOLD,
  MILKY_WAY_NORMAL,
  MILKY_WAY_GLOW_INTENSITY,
  MILKY_WAY_BAND_WIDTH,
  MILKY_WAY_GLOW_COLOR,
  // GLSL 소스 (테스트가 mesh-setting 계약 markers / anti-pattern 부재 정적 검증).
  VERTEX_SHADER as STARFIELD_VERTEX_SHADER,
  FRAGMENT_SHADER as STARFIELD_FRAGMENT_SHADER,
};
