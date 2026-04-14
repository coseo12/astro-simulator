import type { Material, Scene } from '@babylonjs/core';

/**
 * 로그 뎁스 버퍼 활성화.
 *
 * 태양계 규모(~10^13m)부터 행성 표면(~10m)까지 동시 렌더 시 선형 depth buffer는
 * Z-fighting 및 정밀도 부족을 유발한다. 로그 뎁스는 원거리까지 정밀도를 유지한다.
 *
 * Babylon은 material 단위 플래그 — 씬 전체 적용과 향후 생성될 머티리얼도 자동 적용한다.
 */
export function enableLogarithmicDepth(scene: Scene): void {
  for (const m of scene.materials) {
    m.useLogarithmicDepth = true;
  }

  // 이후 추가되는 머티리얼에도 자동 적용
  scene.onNewMaterialAddedObservable.add((m: Material) => {
    m.useLogarithmicDepth = true;
  });
}
