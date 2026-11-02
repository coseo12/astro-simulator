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

/**
 * #1422 — 커스텀 ShaderMaterial vertex 의 clip z 를 far clip 평면 안쪽으로 당기는 비율.
 * `LOG_DEPTH_VERTEX_Z_GLSL` 이 `gl_Position.z -= gl_Position.w * <이 값>` 으로 쓴다.
 * PR #1425 본문 「보정식 비교」 표의 6 장면에서 1e-4 와 1e-5 의 결과가 같았다 (그중 magenta 구멍 술어로 잰
 * 5 장면은 둘 다 0). 1e-5 는 float32 상대 ulp (2^-23 ≈ 1.19e-7) 의 약 84 배다.
 */
export const LOG_DEPTH_VERTEX_Z_INSET = 1e-5;

/**
 * #1422 — 커스텀 ShaderMaterial vertex 의 clip z 보정 GLSL 문장.
 *
 * **왜 필요한가**: 카메라가 `minZ = 0.01` · `maxZ = 1e14` 라 투영행렬 z 행의 `A = (f+n)/(f-n)` 가 float32
 * 에서 정확히 `1` 이다. 장면 좌표가 크면 (위성 focus 시 카메라 절대좌표 ~2e6 ~ 5e6 실측) 오프셋
 * `B` (WebGL [-1, 1] 투영에서 `≈ −0.02`, WebGPU half-Z 변환 후 `≈ −0.01`) 가 Babylon CPU 행렬 (Float32Array) 곱셈에서 소실된다. 그러면 world-view-projection 의 z 행과
 * w 행이 float32 비트 동일이 되어 모든 정점이 `clip.z == clip.w`, 즉 far clip 평면 위에 놓인다.
 * WebGL2 (ANGLE Metal Renderer: Apple M1 Pro 실측) 는 이 상태에서 삼각형 일부를 잘라 표면에 구멍을 낸다.
 * 같은 조건의 WebGPU 는 보정 전에도 구멍이 0 이었다.
 *
 * **이 줄이 바꾸는 것은 clip 통과 여부뿐이다.** depth 값은 fragment 의 `LOG_DEPTH_FRAGMENT_WRITE_GLSL`
 * (`gl_FragDepth`) 이 정한다. #1422 Phase 0 에서 z 를 Babylon log 식 · `0` · `0.9999 w` 로 바꾼 세 변형은
 * WebGL2 전체 프레임의 baseline 대비 변화 픽셀 수가 모두 71645 로 같았다
 * (https://github.com/coseo12/astro-simulator/issues/1422#issuecomment-6574985707).
 *
 * 실측 (#1422 PR, 위성 근접 시나리오): WebGL2 구멍 0. WebGPU 는 보정 전 대비 전체 프레임 diff 0 (고리 고립 장면 포함).
 *
 * ⚠️ Babylon `logDepthVertex` 동형 식 (`gl_Position.z = log2(1 + w) * C`) 으로 바꾸지 말 것. 그 식은 z 가 w 에
 * 비선형이라 카메라 평면을 가로지르는 고리 삼각형의 WebGPU near clip (`z ≥ 0`) 교차점이 밀린다 — 고리 bbox
 * w 끝값 `1.414e6 / −5.165e5` 에서 교차 파라미터 `t ≈ 0.732` (선형) → `≈ 0.506` (log) (PR #1425 리뷰 정적 유도).
 * 실측 WebGPU 목성 고리 가장자리 diff 23 px (자연 장면) · 12242 px (고리 고립 장면) 로 기각했다 (#1422).
 *
 * 사용 전제: vertex 에서 `gl_Position` 대입 **뒤** 에 본 문장 (uniform 불요).
 * 사용 전제: fragment 가 `gl_FragDepth` 를 쓰는 셰이더에만 적용한다 — 아니면 clip 뿐 아니라 depth 값도 바뀐다.
 * ⚠️ 텍스트 동일성이 픽셀 불변의 전제 — 수정 시 shader-pixel-guard 재실측 의무.
 * 정합 가드: `log-depth-glsl.test.ts` (적용 셰이더 vertex — 주석 제거 후 보정 1회 · `gl_Position` 쓰기 2회).
 */
export const LOG_DEPTH_VERTEX_Z_GLSL = `gl_Position.z -= gl_Position.w * ${LOG_DEPTH_VERTEX_Z_INSET.toExponential()};`;
