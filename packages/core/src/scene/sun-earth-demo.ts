import {
  Color3,
  HemisphericLight,
  MeshBuilder,
  PointLight,
  StandardMaterial,
  Vector3,
  type Mesh,
  type Scene,
} from '@babylonjs/core';

export interface SunEarthDemoHandles {
  sun: Mesh;
  earth: Mesh;
  dispose: () => void;
}

/**
 * B3 (#10) 검증용 임시 씬 — 태양 + 지구 프록시 구체.
 *
 * C3 (#15)에서 실제 행성 8개 + 달로 교체된다.
 * 좌표 단위는 데모용 임의 단위 (씬 단위 = AU/10 수준).
 */
export function createSunEarthDemo(scene: Scene): SunEarthDemoHandles {
  // 약한 전역 조명 + 태양 중심 포인트 라이트
  const ambient = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.15;
  ambient.groundColor = new Color3(0.02, 0.02, 0.05);

  const sunLight = new PointLight('sun-light', new Vector3(0, 0, 0), scene);
  sunLight.intensity = 2.5;
  sunLight.diffuse = new Color3(1, 0.95, 0.8);

  // 태양 — 자체 발광 구체
  const sun = MeshBuilder.CreateSphere('sun', { diameter: 4, segments: 48 }, scene);
  const sunMat = new StandardMaterial('sun-mat', scene);
  sunMat.emissiveColor = new Color3(1, 0.91, 0.66); // star-g 계열
  sunMat.disableLighting = true;
  sun.material = sunMat;

  // 지구 프록시 — 태양에서 임의 거리 배치
  const earth = MeshBuilder.CreateSphere('earth', { diameter: 1.2, segments: 32 }, scene);
  earth.position = new Vector3(20, 0, 0);
  const earthMat = new StandardMaterial('earth-mat', scene);
  earthMat.diffuseColor = new Color3(0.25, 0.45, 0.78); // star-o 계열 약화
  earthMat.specularColor = new Color3(0.1, 0.1, 0.1);
  earth.material = earthMat;

  return {
    sun,
    earth,
    dispose: () => {
      ambient.dispose();
      sunLight.dispose();
      sunMat.dispose();
      earthMat.dispose();
      sun.dispose();
      earth.dispose();
    },
  };
}
