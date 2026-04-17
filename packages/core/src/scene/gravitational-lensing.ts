/**
 * P5-D #180 — 중력렌즈 시각화 (Schwarzschild 블랙홀).
 *
 * Babylon PostProcess fragment shader로 화면 공간에서 광선 편향을 시뮬레이트.
 * 블랙홀 스크린 좌표 기준으로 각 프래그먼트의 UV를 radial deflection하여
 * Einstein ring + event horizon 시각화.
 *
 * 물리:
 *   deflection angle α = 2 Rs / b  (weak-field 근사)
 *   Rs = 2GM/c² (Schwarzschild 반경)
 *   b = impact parameter (프래그먼트 ↔ 블랙홀 스크린 거리)
 *
 * 한계:
 *   - 화면 공간 근사 (3D ray tracing 아님)
 *   - 단일 블랙홀만 지원
 *   - thin-lens 근사 (블랙홀 앞뒤 거리 무시)
 */
import { Effect } from '@babylonjs/core/Materials/effect.js';
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { PostProcess } from '@babylonjs/core/PostProcesses/postProcess.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import {
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  type Camera,
  type Mesh,
  type Scene,
  type Viewport,
} from '@babylonjs/core';

const LENSING_SHADER_NAME = 'gravitationalLensing';

// GLSL fragment shader — WebGL2 + WebGPU 양쪽에서 Babylon이 자동 변환.
// WGSL PostProcess shader — WebGPU 엔진에서 직접 실행.
// Babylon의 PostProcess는 `input.vUV`와 `textureSampler`/`textureSamplerSampler`를 자동 제공.
const LENSING_FRAGMENT_WGSL = /* wgsl */ `
varying vUV: vec2f;
var textureSamplerSampler: sampler;
var textureSampler: texture_2d<f32>;
uniform bhScreenPos: vec2f;
uniform bhScreenRs: f32;
uniform lensStrength: f32;

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let dir = input.vUV - uniforms.bhScreenPos;
  let dist = length(dir);
  let rs = uniforms.bhScreenRs;

  // UV 왜곡 계산 — 분기 없이 (WGSL textureSample uniform control flow 제약)
  let alpha = uniforms.lensStrength * 2.0 * rs / max(dist, 0.001);
  let offset = normalize(dir) * alpha * 0.02;
  let deflectedUV = clamp(input.vUV + offset, vec2f(0.0), vec2f(1.0));

  // textureSample은 분기 밖에서 1회만 호출 (WGSL 제약)
  let originalColor = textureSample(textureSampler, textureSamplerSampler, input.vUV);
  let lensedColor = textureSample(textureSampler, textureSamplerSampler, deflectedUV);

  // 영향 밖 → 패스스루, event horizon → 흑색, 그 외 → 왜곡
  let outsideInfluence = step(rs * 5.0, dist) + step(0.001, -rs + 0.001);
  let insideHorizon = step(dist, rs * 0.5) * step(0.001, rs);

  // Einstein ring
  let ringDist = abs(dist - rs * 1.5);
  let ring = smoothstep(rs * 0.3, 0.0, ringDist);
  let ringColor = vec3f(0.3, 0.5, 0.9) * ring * 0.4;

  // mix: outside → original, horizon → black, lensing zone → deflected + ring
  var result = mix(
    mix(
      vec4f(lensedColor.rgb + ringColor, lensedColor.a),
      vec4f(0.0, 0.0, 0.0, 1.0),
      clamp(insideHorizon, 0.0, 1.0)
    ),
    originalColor,
    clamp(outsideInfluence, 0.0, 1.0)
  );

  fragmentOutputs.color = result;
  return fragmentOutputs;
}
`;

// GLSL 폴백 (WebGL2 경로용)
const LENSING_FRAGMENT_GLSL = /* glsl */ `
uniform vec2 bhScreenPos;
uniform float bhScreenRs;
uniform float lensStrength;

void main(void) {
  vec2 dir = vUV - bhScreenPos;
  float dist = length(dir);
  if (dist > bhScreenRs * 5.0 || bhScreenRs < 0.001) {
    gl_FragColor = texture2D(textureSampler, vUV);
    return;
  }
  if (dist < bhScreenRs * 0.5) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  float alpha = lensStrength * 2.0 * bhScreenRs / max(dist, 0.001);
  vec2 offset = normalize(dir) * alpha * 0.02;
  vec2 deflectedUV = clamp(vUV + offset, vec2(0.0), vec2(1.0));
  vec4 color = texture2D(textureSampler, deflectedUV);
  float ringDist = abs(dist - bhScreenRs * 1.5);
  float ring = smoothstep(bhScreenRs * 0.3, 0.0, ringDist);
  color.rgb += vec3(0.3, 0.5, 0.9) * ring * 0.4;
  gl_FragColor = color;
}
`;

export interface BlackHoleOptions {
  /** 블랙홀 위치 — 씬 단위 (AU 변환된 좌표). 기본: 태양 위치(0,0,0). */
  position?: [number, number, number];
  /** 블랙홀 질량 (kg). 기본: 태양 질량 × 10 (시각적 과장). */
  mass?: number;
  /** 렌즈 강도 배율. 1.0 = 물리 정확, >1 = 시각적 과장. 기본 50. */
  lensStrength?: number;
  /** 블랙홀 시각 크기 (씬 단위). 기본 0.3. */
  visualRadius?: number;
}

export interface LensingHandles {
  /** 블랙홀 메쉬 */
  mesh: Mesh;
  /** PostProcess (dispose 필요) */
  postProcess: PostProcess;
  /** 블랙홀 위치 갱신 */
  setPosition: (x: number, y: number, z: number) => void;
  /** 렌즈 강도 갱신 */
  setLensStrength: (s: number) => void;
  dispose: () => void;
}

/**
 * 중력렌즈 PostProcess + 블랙홀 메쉬 생성.
 *
 * `?bh=1` URL 옵트인 시 sim-canvas에서 호출. 기본값은 비활성 (프로덕션 회귀 없음).
 */
export function createGravitationalLensing(
  scene: Scene,
  camera: Camera,
  options: BlackHoleOptions = {},
): LensingHandles {
  const pos = options.position ?? [0, 0, 0];
  let lensStrength = options.lensStrength ?? 3;
  const visualRadius = options.visualRadius ?? 0.3;

  // 블랙홀 메쉬 — 순수 흑색 구
  const bhMesh = MeshBuilder.CreateSphere(
    'blackhole',
    { diameter: visualRadius * 2, segments: 16 },
    scene,
  );
  const mat = new StandardMaterial('bh-mat', scene);
  mat.diffuseColor = new Color3(0, 0, 0);
  mat.specularColor = new Color3(0, 0, 0);
  mat.emissiveColor = new Color3(0, 0, 0);
  mat.disableLighting = true;
  bhMesh.material = mat;
  bhMesh.position.set(pos[0], pos[1], pos[2]);
  bhMesh.isPickable = false;

  // 엔진 종류에 따라 WGSL(WebGPU) 또는 GLSL(WebGL2) shader 등록.
  const isWebGpu = (scene.getEngine() as { isWebGPU?: boolean }).isWebGPU === true;

  if (isWebGpu) {
    if (!ShaderStore.ShadersStoreWGSL[LENSING_SHADER_NAME + 'FragmentShader']) {
      ShaderStore.ShadersStoreWGSL[LENSING_SHADER_NAME + 'FragmentShader'] = LENSING_FRAGMENT_WGSL;
    }
  } else {
    if (!Effect.ShadersStore[LENSING_SHADER_NAME + 'FragmentShader']) {
      Effect.ShadersStore[LENSING_SHADER_NAME + 'FragmentShader'] = LENSING_FRAGMENT_GLSL;
    }
  }

  const shaderLang = isWebGpu ? ShaderLanguage.WGSL : ShaderLanguage.GLSL;
  const pp = new PostProcess(
    'gravitational-lensing',
    LENSING_SHADER_NAME,
    ['bhScreenPos', 'bhScreenRs', 'lensStrength'],
    null,
    1.0,
    camera,
    undefined, // samplingMode
    undefined, // engine
    undefined, // reusable
    undefined, // defines
    undefined, // textureType
    undefined, // vertexUrl
    undefined, // indexParameters
    undefined, // blockCompilation
    undefined, // textureFormat
    shaderLang,
  );

  pp.onApply = (effect) => {
    // 블랙홀 월드 → 스크린 좌표 변환
    const engine = scene.getEngine();
    const viewMatrix = scene.getViewMatrix();
    const projMatrix = scene.getProjectionMatrix();
    const vp = camera.viewport;
    const width = engine.getRenderWidth() * vp.width;
    const height = engine.getRenderHeight() * vp.height;

    const worldPos = bhMesh.position;
    const screenCoord = Vector3.Project(worldPos, viewMatrix, projMatrix, {
      x: 0,
      y: 0,
      width,
      height,
    } as Viewport);

    // UV space (0~1)
    const screenU = screenCoord.x / width;
    const screenV = 1 - screenCoord.y / height;

    // 스크린 공간 Rs 근사 — 카메라 거리 기반
    const camPos = camera.globalPosition;
    const dx = worldPos.x - camPos.x;
    const dy = worldPos.y - camPos.y;
    const dz = worldPos.z - camPos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    // 시각 반경 = atan(visualRadius / dist) * (height / FOV) / height → 대략 visualRadius / dist
    const screenRs = Math.max(0.005, visualRadius / Math.max(dist, 0.01));

    effect.setFloat2('bhScreenPos', screenU, screenV);
    effect.setFloat('bhScreenRs', screenRs);
    effect.setFloat('lensStrength', lensStrength);
  };

  return {
    mesh: bhMesh,
    postProcess: pp,
    setPosition: (x, y, z) => bhMesh.position.set(x, y, z),
    setLensStrength: (s) => {
      lensStrength = s;
    },
    dispose: () => {
      pp.dispose();
      mat.dispose();
      bhMesh.dispose();
    },
  };
}
