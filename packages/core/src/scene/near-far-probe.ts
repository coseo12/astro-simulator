import {
  Color3,
  MeshBuilder,
  StandardMaterial,
  Vector3,
  type Mesh,
  type Scene,
} from '@babylonjs/core';

export interface NearFarProbeHandles {
  near: Mesh;
  far: Mesh;
  dispose: () => void;
}

/**
 * B5 (#12) 검증용 — 근거리 1m + 원거리 10^12m 구체 동시 배치.
 *
 * 로그 뎁스 버퍼 작동 여부를 육안으로 확인하는 디버그 씬.
 * 두 구체 모두 선명하게 그려지고 Z-fighting이 없어야 한다.
 *
 * E2 (#31) 브라우저 3단계 검증에서 시각 확인.
 */
export function createNearFarProbe(scene: Scene): NearFarProbeHandles {
  // 근거리 — 카메라 앞 1m 지점
  const near = MeshBuilder.CreateSphere('probe-near', { diameter: 0.5, segments: 24 }, scene);
  near.position = new Vector3(1, 0, 0);
  const nearMat = new StandardMaterial('probe-near-mat', scene);
  nearMat.emissiveColor = new Color3(0.44, 0.87, 0.7); // nebula-teal
  nearMat.disableLighting = true;
  near.material = nearMat;

  // 원거리 — 10^12m (천왕성 궤도 수준)
  const far = MeshBuilder.CreateSphere('probe-far', { diameter: 1e10, segments: 24 }, scene);
  far.position = new Vector3(1e12, 0, 0);
  const farMat = new StandardMaterial('probe-far-mat', scene);
  farMat.emissiveColor = new Color3(1, 0.72, 0.47); // star-k
  farMat.disableLighting = true;
  far.material = farMat;

  return {
    near,
    far,
    dispose: () => {
      nearMat.dispose();
      farMat.dispose();
      near.dispose();
      far.dispose();
    },
  };
}
