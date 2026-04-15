/**
 * 재사용 가능한 WGSL 헬퍼 코드 스니펫 (P3-B #143).
 *
 * 컴파일된 WGSL 소스를 그대로 prepend해서 사용. 헬퍼는 namespace 충돌을 피하기 위해
 * `_bh_` 접두사 (Barnes-Hut/Babylon 약자) 사용.
 */

/** softening 적용 거리 제곱 + G/r³ 가중치 계산 헬퍼. */
export const WGSL_GRAVITY_PAIR = /* wgsl */ `
fn _bh_pair_acc(target_pos: vec3<f32>, src_pos: vec3<f32>, src_mass: f32, softening_sq: f32, g: f32) -> vec3<f32> {
  let d = src_pos - target_pos;
  let r2 = dot(d, d) + softening_sq;
  // r2.powf(-1.5) — WGSL은 pow(f, f) 사용
  let inv_r3 = pow(r2, -1.5);
  return d * (g * src_mass * inv_r3);
}
`;
