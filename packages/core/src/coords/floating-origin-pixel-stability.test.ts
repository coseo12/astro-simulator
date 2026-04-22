import { describe, expect, it } from 'vitest';
import { FloatingOrigin } from './floating-origin.js';
import { type Vec3Double } from './vec3.js';

/**
 * P11-A #288 DoD α — 픽셀 안정성 (렌더 비의존 결정론적 검증).
 *
 * Babylon 의존 없이 **scene 좌표 float32 quantization error** 를 측정한다.
 *
 * GPU 파이프라인은 float32. scientific 모드에서 mesh.position 은 scene unit (1 unit = 1 AU).
 * 해왕성 30 AU 위치 body 가 baseline (shift 없음) 에선 float32 `fround(30 * SCENE_UNIT_PER_METER)`
 * 근방에 양자화되어 카메라 이동 중 카메라 local 좌표와 body 좌표의 차이가 float32 ε 이하로 떨어지면
 * projection 후 ±1~3 pixel jitter 발생 (#271 관찰 증상).
 *
 * FloatingOrigin 배선 후에는 local ≈ 0 이라 float32 precision 이 원점 근처에서 최대 (ε ~ 1.2e-7).
 *
 * 본 테스트는 **quantization error 의 비율** 을 비교해 shift 의 효과를 증명한다.
 * projection 전체 파이프라인 (view × projection × NDC → pixel) 은 Babylon 의존적이므로 browser-verify
 * 스크립트가 담당 (QA 단계).
 */

const AU = 1.495_978_707e11;
const SCENE_UNIT_PER_METER = 1 / AU;

/** world (m) 를 scene unit 으로 변환 후 float32 cast (GPU 파이프라인 모방). */
function worldToSceneFloat32(
  world: Vec3Double,
  origin: Vec3Double,
): { x: number; y: number; z: number } {
  const lx = world[0] - origin[0];
  const ly = world[1] - origin[1];
  const lz = world[2] - origin[2];
  return {
    x: Math.fround(lx * SCENE_UNIT_PER_METER),
    y: Math.fround(ly * SCENE_UNIT_PER_METER),
    z: Math.fround(lz * SCENE_UNIT_PER_METER),
  };
}

/**
 * scene 좌표의 float32 quantization step — 해당 값 근방의 ULP (unit in last place).
 *
 * 값이 크면 ULP 도 커진다 (float32 는 mantissa 23 비트).
 * 30 AU 위치 (scene = 30) 에선 ULP ≈ 30 × 2^-23 ≈ 3.57e-6 (scene unit).
 * 이를 m 단위로 환산하면 3.57e-6 × AU ≈ 535 km.
 *
 * 카메라가 body 에서 0.01 scene unit (1.5e9 m ≈ 10 million km) 떨어진 위치에서 pan 할 때
 * pixel-level jitter 가 발생할 수 있는 floor 값이다.
 */
function float32ULP(value: number): number {
  // Math.fround(value) 의 인접 float32 값과의 차이.
  const v = Math.fround(value);
  if (v === 0) return Math.fround(1e-45); // 최소 subnormal
  // 지수부 기반: ULP ≈ 2^(floor(log2(|v|)) - 23)
  const exp = Math.floor(Math.log2(Math.abs(v)));
  return Math.pow(2, exp - 23);
}

describe('P11-A #288 DoD α — scene 좌표 float32 quantization', () => {
  const jupiter: Vec3Double = [5.2 * AU, 0, 0]; // ~5.2 AU
  const neptune: Vec3Double = [30 * AU, 0, 0]; // ~30 AU

  it('baseline (shift 없음) — 해왕성 30 AU 위치 ULP 는 m 단위 1e5 이상 (jitter 여지)', () => {
    const scene = worldToSceneFloat32(neptune, [0, 0, 0]);
    const ulpScene = float32ULP(scene.x);
    const ulpMeters = ulpScene * AU;
    // 30 AU scene 좌표 근방 float32 quantization step
    expect(ulpMeters).toBeGreaterThan(1e5); // 100 km 이상
    // 이 ULP 만큼 mesh.position 이 frame 마다 변하면 projection 후 pixel 단위 jitter
  });

  it('baseline — 목성 5.2 AU 위치 ULP (비교)', () => {
    const scene = worldToSceneFloat32(jupiter, [0, 0, 0]);
    const ulpScene = float32ULP(scene.x);
    const ulpMeters = ulpScene * AU;
    // 5.2 scene unit float32 ULP
    expect(ulpMeters).toBeGreaterThan(1e4); // 10 km 이상
  });

  it('FloatingOrigin 배선 후 — 목성 focus 시 body 의 scene 좌표 ULP 는 sub-km (DoD α 충족)', () => {
    const fo = new FloatingOrigin(AU);
    fo.setOriginToBody(jupiter);
    const origin = fo.originOffset;
    const scene = worldToSceneFloat32(jupiter, origin);
    // local ≈ 0 → float32 ULP 는 최소 subnormal 근방
    expect(Math.abs(scene.x)).toBeLessThan(1e-30);
    expect(Math.abs(scene.y)).toBeLessThan(1e-30);
    expect(Math.abs(scene.z)).toBeLessThan(1e-30);
  });

  it('FloatingOrigin 배선 후 — 해왕성 focus 시에도 scene 좌표 ≈ 0 (shift quantization 의 이점)', () => {
    const fo = new FloatingOrigin(AU);
    fo.setOriginToBody(neptune);
    const origin = fo.originOffset;
    const scene = worldToSceneFloat32(neptune, origin);
    expect(Math.abs(scene.x)).toBeLessThan(1e-30);
    expect(Math.abs(scene.y)).toBeLessThan(1e-30);
    expect(Math.abs(scene.z)).toBeLessThan(1e-30);
  });

  it('FloatingOrigin 배선 후 — focus 대비 인근 body 도 float32 정밀도 유지 (달: 지구 focus 시)', () => {
    // 지구 focus 상태에서 달 (지구로부터 ~3.84e8 m) 의 scene 좌표 정밀도 확인
    const earth: Vec3Double = [AU, 0, 0]; // 1 AU
    const moon: Vec3Double = [AU + 3.844e8, 0, 0]; // 지구 +384,400km
    const fo = new FloatingOrigin(AU);
    fo.setOriginToBody(earth);
    const origin = fo.originOffset;
    const moonScene = worldToSceneFloat32(moon, origin);
    // 달의 scene 좌표 = 3.844e8 / AU ≈ 2.57e-3 scene unit
    const expectedMoonX = 3.844e8 * SCENE_UNIT_PER_METER;
    // float32 fround 로도 정밀도 유지 (작은 값이므로 ULP 매우 작음)
    expect(Math.abs(moonScene.x - expectedMoonX)).toBeLessThan(expectedMoonX * 1e-6);
    // 달의 ULP 는 2.57e-3 근방이므로 10m 수준 — 프레임 간 변화로 pixel jitter 발생 안 함
    const ulpMoon = float32ULP(moonScene.x);
    const ulpMoonMeters = ulpMoon * AU;
    expect(ulpMoonMeters).toBeLessThan(100); // 100m 이하 (scientific 모드에서 sub-pixel)
  });

  it('shift 전후 비교 — 해왕성 focus 시 quantization 감소 배율', () => {
    // shift 없음
    const noShift = worldToSceneFloat32(neptune, [0, 0, 0]);
    const ulpNoShift = float32ULP(noShift.x);
    // FloatingOrigin 배선
    const fo = new FloatingOrigin(AU);
    fo.setOriginToBody(neptune);
    const shifted = worldToSceneFloat32(neptune, fo.originOffset);
    // shift 후에는 body 좌표가 0 → 인근 카메라 위치 (0.1 scene unit) 로 비교
    const nearCam = { x: Math.fround(0.1), y: 0, z: 0 };
    const ulpShiftedCam = float32ULP(nearCam.x);
    // shift 가 quantization 을 최소 200x 축소 (실측 기대값)
    expect(ulpNoShift / ulpShiftedCam).toBeGreaterThan(200);
    expect(Math.abs(shifted.x)).toBeLessThan(Math.abs(noShift.x));
  });
});
