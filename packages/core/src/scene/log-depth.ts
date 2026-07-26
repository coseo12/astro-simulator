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

/**
 * #845 — 커스텀 ShaderMaterial fragment 의 로그 depth 기록 GLSL 문장 (rule-of-three SSoT).
 *
 * ring-shader (#641) / sun-shader / procedural-planet-shader (#756) 3곳의 동일 텍스트 복제를
 * 단일화 (#789 hexToColor3 선례). scene 이 `enableLogarithmicDepth` 로 StandardMaterial 을
 * 로그 depth 공간에 기록하므로, 커스텀 ShaderMaterial 도 동일 공간에 기록해야 depth 비교가
 * 정합한다 (Babylon logDepth 공식 — `logDepthConstant = 2 / log2(camera.maxZ + 1)`).
 *
 * 사용 전제 (각 셰이더가 선언 책임):
 *  - fragment: `varying float vFragmentDepth;` + `uniform float logDepthConstant;`
 *  - vertex: `vFragmentDepth = 1.0 + <clip>.w;` 기록
 *
 * ⚠️ 텍스트 동일성이 픽셀 불변의 전제 — 본 상수 수정 시 3 셰이더 최종 GLSL 이 함께 변하므로
 * shader-pixel-guard 재실측 의무. 정합 가드: `log-depth-glsl.test.ts` (3 fragment toContain).
 */
export const LOG_DEPTH_FRAGMENT_WRITE_GLSL =
  'gl_FragDepth = log2(max(vFragmentDepth, 1e-6)) * logDepthConstant * 0.5;';
