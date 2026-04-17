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
import { PostProcess } from '@babylonjs/core/PostProcesses/postProcess.js';
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
const LENSING_FRAGMENT = /* glsl */ `
precision highp float;

varying vec2 vUV;
uniform sampler2D textureSampler;

// 블랙홀 스크린 좌표 (0~1 UV space)
uniform vec2 bhScreenPos;
// Schwarzschild 반경 (스크린 space 단위)
uniform float bhScreenRs;
// 렌즈 강도 배율 (시각적 과장용, 기본 1.0)
uniform float lensStrength;

void main(void) {
  vec2 dir = vUV - bhScreenPos;
  float dist = length(dir);

  // event horizon 내부 → 순수 흑색
  if (dist < bhScreenRs * 0.5) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // weak-field deflection: 이미지를 radially outward로 밀어냄
  // α = 2 Rs / b → UV offset = α * normalized direction
  float alpha = lensStrength * 2.0 * bhScreenRs / max(dist, 0.001);

  // 안쪽으로 당기는 왜곡 (배경이 블랙홀 뒤에서 감싸듯)
  vec2 deflectedUV = vUV + dir / dist * alpha * 0.1;

  // 클램프 (화면 밖 참조 방지)
  deflectedUV = clamp(deflectedUV, vec2(0.0), vec2(1.0));

  vec4 color = texture2D(textureSampler, deflectedUV);

  // Einstein ring 하이라이트 — Rs 근처에서 밝기 증폭
  float ringDist = abs(dist - bhScreenRs * 1.5);
  float ring = smoothstep(bhScreenRs * 0.3, 0.0, ringDist);
  color.rgb += vec3(0.3, 0.5, 0.9) * ring * 0.5;

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

  // fragment shader 등록 (1회)
  if (!Effect.ShadersStore[LENSING_SHADER_NAME + 'FragmentShader']) {
    Effect.ShadersStore[LENSING_SHADER_NAME + 'FragmentShader'] = LENSING_FRAGMENT;
  }

  const pp = new PostProcess(
    'gravitational-lensing',
    LENSING_SHADER_NAME,
    ['bhScreenPos', 'bhScreenRs', 'lensStrength'],
    null,
    1.0,
    camera,
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
