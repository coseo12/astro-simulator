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

/*
 * thickness → ellipse 단축 가산 가중치 (셰이더에 직접 인라인된 0.5):
 *   D' 화면공간 모델에 진정한 z-깊이가 없으므로 두께를 단축 확장으로 표현한다.
 *   thickness ∈ [0.02, 1.0]에서 최대 +0.5 단축 → face-on에 가까워지는 시각 효과.
 *   K=0.5는 슬라이더 양 끝에서 disk 외형 변화가 본질적으로 보이는 균형점.
 *   WGSL/GLSL이 상수 블록을 공유하지 못해 코드에 직접 박았다 — 변경 시 양쪽 동시 수정.
 */

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
uniform useRay3D: f32;
uniform bhWorldPos: vec3f;
uniform bhRsWorld: f32;
uniform cameraPos: vec3f;
// P7-C #208 3차 (후보 E — Frustum Corner Interpolation).
// CPU에서 camera frustum의 far-plane 4 corners를 world-space로 계산.
// WGSL은 vUV bilinear 보간으로 ray 방향 복원 — GPU mat4 역행렬 0회.
// WebGPU/WebGL Y-flip·Z-range 차이는 CPU 시점에 흡수되어 셰이더는 동일.
// TL=Top-Left, TR=Top-Right, BL=Bottom-Left, BR=Bottom-Right (vUV 좌표계: y=0 하단).
uniform cornerBL: vec3f;
uniform cornerBR: vec3f;
uniform cornerTL: vec3f;
uniform cornerTR: vec3f;

const LUT_B_MIN: f32 = 0.5;
const LUT_B_MAX: f32 = 10.0;
const PI: f32 = 3.141592653589793;

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  // --- ray construction ---
  // useRay3D=0: D' 화면공간 근사 (P6-B 확정 동작).
  // useRay3D=1: P7-C 1차 (후보 A) — 단일 invViewProj uniform로 world-ray 복원.
  //   NDC (vUV.xy * 2 - 1, z=1) → world → 방향 = world - cameraPos
  //   이후 disk normal을 world-space에서 회전하여 ray ↔ disk plane 교차.
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

  // --- Disk 평면 교차 ---
  // useRay3D=0: 화면공간 ellipse 근사 (P6-B D').
  // useRay3D=1: world-ray ↔ disk plane 교차 (P7-C 1차 후보 A).
  let sinTilt = sin(uniforms.diskTilt);
  let cosTilt = cos(uniforms.diskTilt);
  let ecc = clamp(uniforms.diskEccentricity, 0.0, 0.9);

  // ===== 화면공간 (D') 계산 (항상 수행하여 mix로 선택) =====
  let xMaj = uniforms.diskAxisX * dx + uniforms.diskAxisY * dy;
  let yMin = -uniforms.diskAxisY * dx + uniforms.diskAxisX * dy;
  let baseMinor = max(abs(sinTilt), 0.05);
  let minorScale = clamp(baseMinor + uniforms.diskThickness * 0.5, 0.05, 1.0);
  // 이심률 정의: 장축 stretch factor 1/(1-e). 천체역학 표준 e (b² = a²(1-e²))와 다름.
  let xMajN = xMaj / rs;
  let yMinN = (yMin / rs) / minorScale;
  let rEccScreen = sqrt((xMajN * xMajN) / max(1.0 - ecc, 1e-3) + yMinN * yMinN);
  let inRingScreen = step(uniforms.diskInner, rEccScreen) * (1.0 - step(uniforms.diskOuter, rEccScreen));
  let radialTScreen = clamp(
    (rEccScreen - uniforms.diskInner) / max(uniforms.diskOuter - uniforms.diskInner, 1e-3),
    0.0,
    1.0,
  );

  // ===== 3D ray (ray3d=1, 3차 후보 E — Frustum Corner Interpolation) =====
  // GPU 역행렬 없이 bilinear 보간으로 ray 방향 복원.
  // CPU에서 이미 WebGPU/WebGL Y-flip·Z-range 차이를 corners 계산 시 흡수하므로
  // 셰이더는 플랫폼 불문 동일 코드.
  let uvU = input.vUV.x;
  let uvV = input.vUV.y;
  let cornerBottom = mix(uniforms.cornerBL, uniforms.cornerBR, uvU);
  let cornerTop = mix(uniforms.cornerTL, uniforms.cornerTR, uvU);
  let cornerAt = mix(cornerBottom, cornerTop, uvV);
  let rayDir = normalize(cornerAt - uniforms.cameraPos);
  // disk는 y-up 기준 (0,1,0) normal을 x축 기준 diskTilt 만큼 회전:
  //   n = (0, cos(tilt), sin(tilt)) — tilt=0 edge-on(y-normal), tilt=π/2 face-on(xz-plane).
  let diskNormal = normalize(vec3f(0.0, cosTilt, sinTilt));
  // ray ↔ plane(normal=n, through bhWorldPos) 교차:
  //   t = dot(bh - cam, n) / dot(rayDir, n)
  let denom = dot(rayDir, diskNormal);
  let tHit = dot(uniforms.bhWorldPos - uniforms.cameraPos, diskNormal) / select(denom, 1e-5, abs(denom) < 1e-5);
  let hitPos = uniforms.cameraPos + rayDir * tHit;
  let local = hitPos - uniforms.bhWorldPos;
  // disk 평면 좌표계: 장축 = world x축(우선 단순화), 단축 = n × x축.
  // world x 축을 disk plane에 투영: uMajor = x - (x·n)n (정규화).
  let xAxisW = vec3f(1.0, 0.0, 0.0);
  let uMajor = normalize(xAxisW - diskNormal * dot(xAxisW, diskNormal));
  let vMinor = cross(diskNormal, uMajor);
  let u3d = dot(local, uMajor) / max(uniforms.bhRsWorld, 1e-5);
  let v3d = dot(local, vMinor) / max(uniforms.bhRsWorld, 1e-5);
  let rEcc3d = sqrt((u3d * u3d) / max(1.0 - ecc, 1e-3) + v3d * v3d);
  // 3D 교차 유효성: t>0 (카메라 앞) + denom이 0이 아님.
  let tFront = step(0.0, tHit);
  let denomValid = step(1e-5, abs(denom));
  let valid3d = tFront * denomValid;
  let inRing3d = step(uniforms.diskInner, rEcc3d) * (1.0 - step(uniforms.diskOuter, rEcc3d)) * valid3d;
  let radialT3d = clamp(
    (rEcc3d - uniforms.diskInner) / max(uniforms.diskOuter - uniforms.diskInner, 1e-3),
    0.0,
    1.0,
  );

  // ===== D' vs ray3d 선택 =====
  let useR3 = step(0.5, uniforms.useRay3D);
  let inDiskRing = mix(inRingScreen, inRing3d, useR3);
  let radialT = mix(radialTScreen, radialT3d, useR3);
  let diskMask = inDiskRing * escapeOutcome;

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
uniform float useRay3D;
uniform vec3 bhWorldPos;
uniform float bhRsWorld;
uniform vec3 cameraPos;
// P7-C #208 3차 (후보 E — Frustum Corner Interpolation).
// GPU mat4 역행렬 0회 — 4 corners + bilinear 보간. (교차검증 고유 발견)
uniform vec3 cornerBL;
uniform vec3 cornerBR;
uniform vec3 cornerTL;
uniform vec3 cornerTR;

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
  float cosTilt = cos(diskTilt);
  float ecc = clamp(diskEccentricity, 0.0, 0.9);

  // ===== D' 화면공간 계산 =====
  float xMaj = diskAxisX * dx + diskAxisY * dy;
  float yMin = -diskAxisY * dx + diskAxisX * dy;
  float baseMinor = max(abs(sinTilt), 0.05);
  float minorScale = clamp(baseMinor + diskThickness * 0.5, 0.05, 1.0);
  float xMajN = xMaj / rs;
  float yMinN = (yMin / rs) / minorScale;
  float rEccScreen = sqrt((xMajN * xMajN) / max(1.0 - ecc, 1e-3) + yMinN * yMinN);
  float inRingScreen = step(diskInner, rEccScreen) * (1.0 - step(diskOuter, rEccScreen));
  float radialTScreen = clamp(
    (rEccScreen - diskInner) / max(diskOuter - diskInner, 1e-3),
    0.0,
    1.0
  );

  // ===== 3D ray (P7-C 3차 후보 E — Frustum Corner Interpolation) =====
  // GPU mat4 역행렬 없이 bilinear 보간만으로 ray 방향 복원.
  vec3 cornerBottom = mix(cornerBL, cornerBR, vUV.x);
  vec3 cornerTop = mix(cornerTL, cornerTR, vUV.x);
  vec3 cornerAt = mix(cornerBottom, cornerTop, vUV.y);
  vec3 rayDir = normalize(cornerAt - cameraPos);
  vec3 diskNormal = normalize(vec3(0.0, cosTilt, sinTilt));
  float denom = dot(rayDir, diskNormal);
  float denomSafe = (abs(denom) < 1e-5) ? 1e-5 : denom;
  float tHit = dot(bhWorldPos - cameraPos, diskNormal) / denomSafe;
  vec3 hitPos = cameraPos + rayDir * tHit;
  vec3 localHit = hitPos - bhWorldPos;
  vec3 xAxisW = vec3(1.0, 0.0, 0.0);
  vec3 uMajor = normalize(xAxisW - diskNormal * dot(xAxisW, diskNormal));
  vec3 vMinor = cross(diskNormal, uMajor);
  float u3d = dot(localHit, uMajor) / max(bhRsWorld, 1e-5);
  float v3d = dot(localHit, vMinor) / max(bhRsWorld, 1e-5);
  float rEcc3d = sqrt((u3d * u3d) / max(1.0 - ecc, 1e-3) + v3d * v3d);
  float tFront = step(0.0, tHit);
  float denomValid = step(1e-5, abs(denom));
  float valid3d = tFront * denomValid;
  float inRing3d = step(diskInner, rEcc3d) * (1.0 - step(diskOuter, rEcc3d)) * valid3d;
  float radialT3d = clamp(
    (rEcc3d - diskInner) / max(diskOuter - diskInner, 1e-3),
    0.0,
    1.0
  );

  // ===== D' vs ray3d 선택 =====
  float useR3 = step(0.5, useRay3D);
  float inDiskRing = mix(inRingScreen, inRing3d, useR3);
  float radialT = mix(radialTScreen, radialT3d, useR3);
  float diskMask = inDiskRing * escapeOutcome;

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
  /**
   * P7-C #208 — 3D ray construction 사용 여부 (`?ray3d=1` 옵트인).
   *
   * true: WGSL/GLSL에서 `invViewProj` 기반으로 world-ray 복원 → disk plane 3D 교차.
   *       카메라 회전에 따라 disk 장축이 화면 x축을 벗어난다.
   * false (기본): D' 화면공간 근사 (P6-B 확정 동작 · `diskAxisX/Y=(1,0)` 고정).
   *
   * 실패 시 `?ray3d` 파라미터를 제거하면 기존 D' 동작으로 즉시 회귀 (회귀 격리).
   */
  useRay3D?: boolean;
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
  const useRay3D = options.useRay3D === true;
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
      'useRay3D',
      'bhWorldPos',
      'bhRsWorld',
      'cameraPos',
      'cornerBL',
      'cornerBR',
      'cornerTL',
      'cornerTR',
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

  // P7-C #208 3차 — onApply에서 GC 부담 줄이기 위한 벡터 버퍼 재사용.
  // 4 corners를 far-plane world-space에서 계산. NDC 변환 불필요 = Y-flip/Z-range 버그 차단.
  const cornerBL_v = new Vector3();
  const cornerBR_v = new Vector3();
  const cornerTL_v = new Vector3();
  const cornerTR_v = new Vector3();
  const camForward = new Vector3();
  const camRight = new Vector3();
  const camUp = new Vector3();
  const camCenter = new Vector3();

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

    // disk axis: D' 경로에서 tilt 회전축을 화면 x축으로 가정.
    // useRay3D=true일 때는 셰이더가 3D 경로를 선택하므로 이 값은 무시됨.
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

    // P7-C #208 3차 (후보 E) — far-plane 4 corners world-space 계산.
    // 수식:
    //   forward = camera.getDirection(Z+) (view의 -Z world-space 방향)
    //   up = camera.getDirection(Y+)
    //   right = forward × up
    //   fov = camera.fov (radians, vertical)
    //   farH = 2 * maxZ * tan(fov/2)  (far-plane height)
    //   farW = farH * aspect
    //   center_far = camPos + forward * maxZ
    //   corner[BL] = center_far - right*(farW/2) - up*(farH/2)
    //   corner[BR] = center_far + right*(farW/2) - up*(farH/2)
    //   corner[TL] = center_far - right*(farW/2) + up*(farH/2)
    //   corner[TR] = center_far + right*(farW/2) + up*(farH/2)
    // 주의: vUV y=0 은 하단 (Babylon RenderTarget 관례) → BL/BR이 y=0, TL/TR이 y=1.
    // Babylon ArcRotateCamera는 FreeCamera와 동일 getDirection 지원.
    const anyCamera = camera as unknown as {
      fov?: number;
      maxZ?: number;
      getDirection?: (axis: Vector3, result?: Vector3) => Vector3;
    };
    const fov = anyCamera.fov ?? Math.PI / 3;
    const maxZ = anyCamera.maxZ ?? 1e5;
    // getDirection이 없으면 view 행렬에서 복원.
    if (typeof anyCamera.getDirection === 'function') {
      anyCamera.getDirection(Vector3.Forward(), camForward);
      anyCamera.getDirection(Vector3.Up(), camUp);
    } else {
      // view matrix row 3 (transposed)이 forward. row 2가 up.
      // Babylon Matrix is row-major. world→view.
      // viewMatrix.m: Float32Array 길이 16 (Babylon 스펙 고정).
      const m = viewMatrix.m;
      camForward.set(m[2] ?? 0, m[6] ?? 0, m[10] ?? 1);
      camUp.set(m[1] ?? 0, m[5] ?? 1, m[9] ?? 0);
    }
    Vector3.CrossToRef(camForward, camUp, camRight);
    camRight.normalize();
    camForward.normalize();
    camUp.normalize();

    const halfH = maxZ * Math.tan(fov / 2);
    const halfW = halfH * aspect;

    // center_far = camPos + forward*maxZ
    camCenter.copyFrom(camPos);
    camCenter.addInPlace(camForward.scale(maxZ));

    // 4 corners (vUV y=0 하단)
    cornerBL_v
      .copyFrom(camCenter)
      .subtractInPlace(camRight.scale(halfW))
      .subtractInPlace(camUp.scale(halfH));
    cornerBR_v
      .copyFrom(camCenter)
      .addInPlace(camRight.scale(halfW))
      .subtractInPlace(camUp.scale(halfH));
    cornerTL_v
      .copyFrom(camCenter)
      .subtractInPlace(camRight.scale(halfW))
      .addInPlace(camUp.scale(halfH));
    cornerTR_v.copyFrom(camCenter).addInPlace(camRight.scale(halfW)).addInPlace(camUp.scale(halfH));

    effect.setFloat('useRay3D', useRay3D ? 1 : 0);
    effect.setFloat3('bhWorldPos', worldPos.x, worldPos.y, worldPos.z);
    effect.setFloat('bhRsWorld', visualRadius);
    effect.setFloat3('cameraPos', camPos.x, camPos.y, camPos.z);
    effect.setFloat3('cornerBL', cornerBL_v.x, cornerBL_v.y, cornerBL_v.z);
    effect.setFloat3('cornerBR', cornerBR_v.x, cornerBR_v.y, cornerBR_v.z);
    effect.setFloat3('cornerTL', cornerTL_v.x, cornerTL_v.y, cornerTL_v.z);
    effect.setFloat3('cornerTR', cornerTR_v.x, cornerTR_v.y, cornerTR_v.z);
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
