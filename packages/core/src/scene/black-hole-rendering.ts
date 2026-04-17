/**
 * P6-B #190 — Accretion disk + 정확 shadow 시각화 (Schwarzschild 블랙홀).
 *
 * P5-D `gravitational-lensing.ts` (`?bh=1`)는 화면공간 thin-lens 근사 PostProcess.
 * 본 모듈 (`?bh=2`)은 P6-A geodesic 솔버가 사전 계산한 LUT를 통해 정확한 shadow와
 * accretion disk 교차 색상을 렌더한다.
 *
 * 파이프라인 (ADR `20260417-accretion-disk-shadow-pipeline.md` 결정):
 *   1. Rust `build_lensing_lut(samples)` — b ∈ [0.5, 10] Rs sweep, outcome/deflection 사전 계산
 *   2. RGBA32F 텍스처(width=samples, height=1)로 업로드 — R=outcome, G=deflection
 *   3. WGSL/GLSL fragment shader가 픽셀별 ray construction → impact parameter b → LUT 샘플링
 *   4. shadow(outcome=0) → 검은색 / disk 평면 교차 → 색상 그라데이션 / escape → background
 *
 * 회귀 격리: `createGravitationalLensing` (`?bh=1`)와 별도 PostProcess. 기존 P5-D 동작 보존.
 *
 * 한계 (ADR 비-범위):
 *   - 평면 thin disk만 (volumetric / Doppler boost 등 P6 범위 외)
 *   - 단일 블랙홀
 *   - escape 광선의 background 휨은 deflection 기반 화면공간 보조 효과 (전체 ray-marching 아님)
 */
import { Effect } from '@babylonjs/core/Materials/effect.js';
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { PostProcess } from '@babylonjs/core/PostProcesses/postProcess.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
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

import { createLensingLut, type LensingLut } from '../physics/lensing-lut.js';

const SHADER_NAME = 'blackHoleRendering';
/** 자연단위 Rs (Rust LUT_B_MIN/MAX와 동일 단위계). */
const RS_NATURAL = 2.0;

// ============================================================================
// WGSL fragment shader (WebGPU)
// ============================================================================
//
// 선언 순서 (P5-D 확립 규약): varying → sampler → texture (씬 + LUT) → uniform.
// `textureSample`은 uniform control flow 안에서만 호출 — `step()/mix()` branchless.
//
const FRAGMENT_WGSL = /* wgsl */ `
varying vUV: vec2f;
var textureSamplerSampler: sampler;
var textureSampler: texture_2d<f32>;
var lutSamplerSampler: sampler;
var lutSampler: texture_2d<f32>;

uniform bhScreenPos: vec2f;
uniform bhScreenRs: f32;
uniform diskInner: f32;
uniform diskOuter: f32;
uniform diskEccentricity: f32;
uniform diskThickness: f32;
uniform diskTilt: f32;
uniform diskAxisX: f32;
uniform diskAxisY: f32;
uniform lutSamples: f32;
uniform aspect: f32;

const LUT_B_MIN: f32 = 0.5;
const LUT_B_MAX: f32 = 10.0;
const PI: f32 = 3.141592653589793;

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  // 화면공간 ray construction — 픽셀 ↔ 블랙홀 화면 거리로 b/Rs 정의.
  // (ADR D 채택의 단순화 변형: ray 재구성 대신 화면공간 근사로 LUT/disk 평면 결정.
  //  카메라 거리 변화는 bhScreenRs로 흡수, disk 평면 회전은 화면공간 affine으로 근사.)
  let dx = (input.vUV.x - uniforms.bhScreenPos.x) * uniforms.aspect;
  let dy = input.vUV.y - uniforms.bhScreenPos.y;
  let dist = sqrt(dx * dx + dy * dy);
  let rs = max(uniforms.bhScreenRs, 1e-5);
  let bRs = dist / rs;

  // --- LUT 샘플링: b/Rs → u 좌표 ---
  let t = clamp((bRs - LUT_B_MIN) / (LUT_B_MAX - LUT_B_MIN), 0.0, 1.0);
  let lutU = (t * (uniforms.lutSamples - 1.0) + 0.5) / uniforms.lutSamples;
  let lutTexel = textureSample(lutSampler, lutSamplerSampler, vec2f(lutU, 0.5));
  let outcomeFlag = lutTexel.r; // 0=Captured, 1=Escaped
  let deflection = lutTexel.g;
  let outRange = step(LUT_B_MAX, bRs);
  let escapeOutcome = max(outcomeFlag, outRange);
  let capturedFinal = 1.0 - escapeOutcome;

  // --- Disk 평면 교차 (화면공간 ellipse 근사) ---
  // tilt = 0 → 화면 면에 수직 (얇은 선처럼 보임). tilt = π/2 → 화면 평면 (원).
  // 화면상의 disk 평면 = 카메라가 보는 disk plane의 화면 투영 = ellipse.
  // major axis 방향: bh를 중심으로 cos(tiltAxis)·dx + sin(tiltAxis)·dy.
  // disk 단축(thickness 방향) = sin(tilt)·rDisk_world / dist_to_cam.
  let cosTilt = cos(uniforms.diskTilt);
  let sinTilt = sin(uniforms.diskTilt);
  // disk axis는 별도 회전(z축 회전) 가정 — 단순화로 화면 x축에 정렬.
  let xMaj = uniforms.diskAxisX * dx + uniforms.diskAxisY * dy;
  let yMin = -uniforms.diskAxisY * dx + uniforms.diskAxisX * dy;
  // ellipse 단축 = 장축 · |sin(tilt)| (face-on이면 1, edge-on이면 0).
  let minorScale = max(abs(sinTilt), 0.05);
  let rEll = sqrt((xMaj * xMaj) + (yMin * yMin) / (minorScale * minorScale)) / rs;
  let ecc = clamp(uniforms.diskEccentricity, 0.0, 0.9);
  // eccentricity는 장축 stretch.
  let xMajN = xMaj / rs;
  let yMinN = (yMin / rs) / minorScale;
  let rEcc = sqrt((xMajN * xMajN) / max(1.0 - ecc, 1e-3) + yMinN * yMinN);

  let inDiskRing = step(uniforms.diskInner, rEcc) * (1.0 - step(uniforms.diskOuter, rEcc));
  // thickness는 화면공간에서 ellipse "두께" — minorScale·thickness.
  let inDiskThick = step(0.0, rEcc); // 평면 두께는 단축에 묻힘
  let diskMask = inDiskRing * inDiskThick * escapeOutcome;

  let radialT = clamp(
    (rEcc - uniforms.diskInner) / max(uniforms.diskOuter - uniforms.diskInner, 1e-3),
    0.0,
    1.0,
  );
  let hot = vec3f(1.0, 0.95, 0.7);
  let warm = vec3f(1.0, 0.55, 0.15);
  let cool = vec3f(0.5, 0.1, 0.05);
  let coreCol = mix(hot, warm, smoothstep(0.0, 0.4, radialT));
  let edgeCol = mix(coreCol, cool, smoothstep(0.4, 1.0, radialT));
  // disk 두께 fade — minorScale로 부드럽게.
  let thicknessAlpha = clamp(uniforms.diskThickness * 4.0, 0.2, 1.0);
  let diskColor = vec4f(edgeCol, thicknessAlpha);

  // --- background ---
  let bgOriginal = textureSample(textureSampler, textureSamplerSampler, input.vUV);
  // deflection을 화면공간 휨에 사용 (escape 영역만).
  let dirToBh = vec2f(uniforms.bhScreenPos.x - input.vUV.x, uniforms.bhScreenPos.y - input.vUV.y);
  let lenDir = max(length(dirToBh), 1e-5);
  let dirNorm = dirToBh / lenDir;
  let lensedUV = clamp(input.vUV + dirNorm * deflection * 0.01, vec2f(0.0), vec2f(1.0));
  let bgLensed = textureSample(textureSampler, textureSamplerSampler, lensedUV);

  let shadowColor = vec4f(0.0, 0.0, 0.0, 1.0);
  let escapeAndDisk = diskMask;
  let escapeNoDisk = escapeOutcome * (1.0 - diskMask);

  var result = bgOriginal;
  result = mix(result, bgLensed, escapeNoDisk);
  // disk는 alpha blending.
  result = mix(result, vec4f(diskColor.rgb, 1.0), escapeAndDisk * diskColor.a);
  result = mix(result, shadowColor, capturedFinal);

  // 출력 alpha=1 강제. WebGPU PostProcess는 backbuffer compositor가 alpha를 곱하므로,
  // textureSample이 반환한 alpha (Babylon RT는 0일 수 있음)를 그대로 쓰면 화면이 검정으로 보인다.
  // P5-D 경로는 우연히 mix 마지막 분기로 originalColor 전체(.a 포함)를 통과시켜 회피했음.
  fragmentOutputs.color = vec4f(result.rgb, 1.0);
  return fragmentOutputs;
}
`;

// ============================================================================
// GLSL fragment shader (WebGL2)
// ============================================================================
const FRAGMENT_GLSL = /* glsl */ `
precision highp float;

uniform sampler2D lutSampler;
uniform vec2 bhScreenPos;
uniform float bhScreenRs;
uniform float diskInner;
uniform float diskOuter;
uniform float diskEccentricity;
uniform float diskThickness;
uniform float diskTilt;
uniform float diskAxisX;
uniform float diskAxisY;
uniform float lutSamples;
uniform float aspect;

const float LUT_B_MIN = 0.5;
const float LUT_B_MAX = 10.0;

void main(void) {
  float dx = (vUV.x - bhScreenPos.x) * aspect;
  float dy = vUV.y - bhScreenPos.y;
  float dist = sqrt(dx * dx + dy * dy);
  float rs = max(bhScreenRs, 1e-5);
  float bRs = dist / rs;

  float t = clamp((bRs - LUT_B_MIN) / (LUT_B_MAX - LUT_B_MIN), 0.0, 1.0);
  float lutU = (t * (lutSamples - 1.0) + 0.5) / lutSamples;
  vec4 lutTexel = texture2D(lutSampler, vec2(lutU, 0.5));
  float outcomeFlag = lutTexel.r;
  float deflection = lutTexel.g;
  float outRange = step(LUT_B_MAX, bRs);
  float escapeOutcome = max(outcomeFlag, outRange);
  float capturedFinal = 1.0 - escapeOutcome;

  float sinTilt = sin(diskTilt);
  float xMaj = diskAxisX * dx + diskAxisY * dy;
  float yMin = -diskAxisY * dx + diskAxisX * dy;
  float minorScale = max(abs(sinTilt), 0.05);
  float xMajN = xMaj / rs;
  float yMinN = (yMin / rs) / minorScale;
  float ecc = clamp(diskEccentricity, 0.0, 0.9);
  float rEcc = sqrt((xMajN * xMajN) / max(1.0 - ecc, 1e-3) + yMinN * yMinN);

  float inDiskRing = step(diskInner, rEcc) * (1.0 - step(diskOuter, rEcc));
  float diskMask = inDiskRing * escapeOutcome;

  float radialT = clamp(
    (rEcc - diskInner) / max(diskOuter - diskInner, 1e-3),
    0.0,
    1.0
  );
  vec3 hot = vec3(1.0, 0.95, 0.7);
  vec3 warm = vec3(1.0, 0.55, 0.15);
  vec3 cool = vec3(0.5, 0.1, 0.05);
  vec3 coreCol = mix(hot, warm, smoothstep(0.0, 0.4, radialT));
  vec3 edgeCol = mix(coreCol, cool, smoothstep(0.4, 1.0, radialT));
  float thicknessAlpha = clamp(diskThickness * 4.0, 0.2, 1.0);
  vec4 diskColor = vec4(edgeCol, thicknessAlpha);

  vec4 bgOriginal = texture2D(textureSampler, vUV);
  vec2 dirToBh = vec2(bhScreenPos.x - vUV.x, bhScreenPos.y - vUV.y);
  float lenDir = max(length(dirToBh), 1e-5);
  vec2 dirNorm = dirToBh / lenDir;
  vec2 lensedUV = clamp(vUV + dirNorm * deflection * 0.01, vec2(0.0), vec2(1.0));
  vec4 bgLensed = texture2D(textureSampler, lensedUV);

  vec4 shadowColor = vec4(0.0, 0.0, 0.0, 1.0);
  float escapeAndDisk = diskMask;
  float escapeNoDisk = escapeOutcome * (1.0 - diskMask);

  vec4 result = bgOriginal;
  result = mix(result, bgLensed, escapeNoDisk);
  result = mix(result, vec4(diskColor.rgb, 1.0), escapeAndDisk * diskColor.a);
  result = mix(result, shadowColor, capturedFinal);

  // WGSL 경로와 동일하게 alpha=1 강제 (compositor 검정화 방지).
  gl_FragColor = vec4(result.rgb, 1.0);
}
`;

// ============================================================================
// 공개 API
// ============================================================================

export interface BlackHoleRenderingOptions {
  /** 블랙홀 위치 — 씬 단위. 기본 (3,0,0). */
  position?: [number, number, number];
  /** 블랙홀 시각 반경 (씬 단위, = 1 Rs). 기본 0.3. */
  visualRadius?: number;
  /** disk 안쪽 반경 (Rs 단위). 기본 1.5. (photon sphere 안쪽은 비물리이므로 ≥1.5 권장) */
  diskInnerRs?: number;
  /** disk 바깥 반경 (Rs 단위). 기본 6.0. */
  diskOuterRs?: number;
  /** disk 이심률 (0~0.9). 기본 0.0 (원형). */
  diskEccentricity?: number;
  /** disk 두께 (Rs 단위). 기본 0.15. */
  diskThicknessRs?: number;
  /** disk 기울기 (rad). 기본 0.3 (≈17°). */
  diskTiltRad?: number;
  /** LUT 해상도. 기본 256 (cargo test 측정 ±0.26%). */
  lutSamples?: number;
  /** 화면공간 lensing 보조 강도. 본 모듈은 0으로 비활성 (P5-D `?bh=1`에 위임). */
  lensStrength?: number;
}

export interface BlackHoleRenderingHandles {
  /** 블랙홀 메쉬 */
  mesh: Mesh;
  postProcess: PostProcess;
  setPosition: (x: number, y: number, z: number) => void;
  setDiskInner: (rs: number) => void;
  setDiskOuter: (rs: number) => void;
  setDiskEccentricity: (e: number) => void;
  setDiskThickness: (rs: number) => void;
  setDiskTilt: (rad: number) => void;
  /** 현재 LUT (테스트/inspector용). */
  lut: LensingLut;
  dispose: () => void;
}

/**
 * Accretion disk + 정확 shadow PostProcess.
 *
 * `?bh=2` URL 옵트인 시 sim-canvas에서 호출. P5-D `createGravitationalLensing`
 * (`?bh=1`)과 회귀 격리되어 있으므로 두 경로는 동시 활성 금지 (PostProcess 우선순위 충돌 방지).
 */
export function createBlackHoleRendering(
  scene: Scene,
  camera: Camera,
  options: BlackHoleRenderingOptions = {},
): BlackHoleRenderingHandles {
  const pos = options.position ?? [3, 0, 0];
  const visualRadius = options.visualRadius ?? 0.3;
  let diskInner = options.diskInnerRs ?? 1.5;
  let diskOuter = options.diskOuterRs ?? 6.0;
  let diskEccentricity = options.diskEccentricity ?? 0.0;
  let diskThickness = options.diskThicknessRs ?? 0.15;
  let diskTilt = options.diskTiltRad ?? 0.3;
  const lutSamples = options.lutSamples ?? 256;
  // lensStrength는 화면공간 fallback에선 deflection·고정계수로 흡수 — 옵션은 보존하나 미사용.
  void options.lensStrength;

  // 블랙홀 메쉬 — event horizon 흑색 구.
  const bhMesh = MeshBuilder.CreateSphere(
    'blackhole-p6b',
    { diameter: visualRadius * 2, segments: 16 },
    scene,
  );
  const mat = new StandardMaterial('bh-p6b-mat', scene);
  mat.diffuseColor = new Color3(0, 0, 0);
  mat.specularColor = new Color3(0, 0, 0);
  mat.emissiveColor = new Color3(0, 0, 0);
  mat.disableLighting = true;
  bhMesh.material = mat;
  bhMesh.position.set(pos[0], pos[1], pos[2]);
  bhMesh.isPickable = false;

  // LUT 빌드 → RGBA32F 텍스처 업로드.
  const lut = createLensingLut(lutSamples);
  // RGBA로 패킹: R=outcome, G=deflection, B/A=0. Babylon RawTexture는 RGBA가 가장 안전.
  const rgba = new Float32Array(lutSamples * 4);
  for (let i = 0; i < lutSamples; i++) {
    // outcomes/deflections는 createLensingLut에서 길이 = lutSamples 보장.
    rgba[i * 4 + 0] = lut.outcomes[i] as number;
    rgba[i * 4 + 1] = lut.deflections[i] as number;
    rgba[i * 4 + 2] = 0;
    rgba[i * 4 + 3] = 0;
  }
  const lutTexture = RawTexture.CreateRGBATexture(
    rgba,
    lutSamples,
    1,
    scene,
    false, // generateMipMaps
    false, // invertY
    Constants.TEXTURE_LINEAR_LINEAR, // sampling
    Constants.TEXTURETYPE_FLOAT,
  );
  lutTexture.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE;
  lutTexture.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;

  // 셰이더 등록.
  const isWebGpu = (scene.getEngine() as { isWebGPU?: boolean }).isWebGPU === true;
  if (isWebGpu) {
    if (!ShaderStore.ShadersStoreWGSL[SHADER_NAME + 'FragmentShader']) {
      ShaderStore.ShadersStoreWGSL[SHADER_NAME + 'FragmentShader'] = FRAGMENT_WGSL;
    }
  } else {
    if (!Effect.ShadersStore[SHADER_NAME + 'FragmentShader']) {
      Effect.ShadersStore[SHADER_NAME + 'FragmentShader'] = FRAGMENT_GLSL;
    }
  }
  const shaderLang = isWebGpu ? ShaderLanguage.WGSL : ShaderLanguage.GLSL;

  const pp = new PostProcess(
    'black-hole-rendering',
    SHADER_NAME,
    [
      'bhScreenPos',
      'bhScreenRs',
      'diskInner',
      'diskOuter',
      'diskEccentricity',
      'diskThickness',
      'diskTilt',
      'diskAxisX',
      'diskAxisY',
      'lutSamples',
      'aspect',
    ],
    ['lutSampler'], // 추가 sampler
    1.0,
    camera,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    shaderLang,
  );

  pp.onApply = (effect) => {
    // 블랙홀 → 스크린 좌표 (P5-D 패턴 재사용).
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

    const screenU = screenCoord.x / width;
    const screenV = 1 - screenCoord.y / height;

    // 카메라 거리 기반 시각 Rs (visualRadius = 1 Rs).
    const camPos = camera.globalPosition;
    const dx = worldPos.x - camPos.x;
    const dy = worldPos.y - camPos.y;
    const dz = worldPos.z - camPos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const screenRs = Math.max(0.005, visualRadius / Math.max(dist, 0.01));

    // 스크린 aspect — 화면공간 b 거리를 isotropic하게 만들기 위한 보정.
    const aspect = width / Math.max(height, 1);

    // disk axis: tilt 회전축을 화면 x축으로 가정.
    const diskAxisX = 1;
    const diskAxisY = 0;

    effect.setFloat2('bhScreenPos', screenU, screenV);
    effect.setFloat('bhScreenRs', screenRs);
    effect.setFloat('diskInner', diskInner);
    effect.setFloat('diskOuter', diskOuter);
    effect.setFloat('diskEccentricity', diskEccentricity);
    effect.setFloat('diskThickness', diskThickness);
    effect.setFloat('diskTilt', diskTilt);
    effect.setFloat('diskAxisX', diskAxisX);
    effect.setFloat('diskAxisY', diskAxisY);
    effect.setFloat('lutSamples', lutSamples);
    effect.setFloat('aspect', aspect);
    effect.setTexture('lutSampler', lutTexture);
  };

  return {
    mesh: bhMesh,
    postProcess: pp,
    setPosition: (x, y, z) => bhMesh.position.set(x, y, z),
    setDiskInner: (rs) => {
      diskInner = rs;
    },
    setDiskOuter: (rs) => {
      diskOuter = rs;
    },
    setDiskEccentricity: (e) => {
      diskEccentricity = e;
    },
    setDiskThickness: (rs) => {
      diskThickness = rs;
    },
    setDiskTilt: (rad) => {
      diskTilt = rad;
    },
    lut,
    dispose: () => {
      pp.dispose();
      lutTexture.dispose();
      mat.dispose();
      bhMesh.dispose();
    },
  };
}

// RS_NATURAL은 LUT 단위계 일관성용 — 외부에서 disk 파라미터를 자연단위로 변환할 때 참조.
export const BLACK_HOLE_RS_NATURAL = RS_NATURAL;
