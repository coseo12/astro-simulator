/**
 * 거리-의존 per-body 시각 스케일 (#100).
 *
 * 문제: 모든 바디에 고정 ×500 배율을 적용하면 Earth 메쉬 반경이 지구-달 거리보다
 * 커져서 달이 지구 내부에 묻힘. 반대로 실제 크기(×1)로 두면 태양계 전체 뷰에서
 * 행성이 점으로 사라진다.
 *
 * 해법: 각 바디의 시각 반경이 카메라 거리에 비례하도록 동적 스케일.
 *   visualRadius ≈ cameraDist × angularK
 *   scale = visualRadius / realRadius
 *          = cameraDist × angularK / realRadius
 *
 * `angularK`(라디안)는 모든 바디에 공통. maxScale로 현재 디자인 톤을 유지하고,
 * minScale=1(실제 크기 이하로는 줄이지 않음)로 근접 뷰에서 실물 비율을 보존.
 *
 * 결과:
 *  - 태양계 전체 뷰(30 AU): scale ≈ maxScale → 현재와 유사한 가시성
 *  - 지구 근접 뷰(0.003 AU): scale ≈ 1 → 지구·달이 실제 비율로 분리
 */

/** 시각 반경이 카메라 거리의 angularK배가 되도록 한다(라디안 근사). */
export const ANGULAR_K = 0.008;
export const MIN_VISUAL_SCALE = 1;
export const MAX_VISUAL_SCALE_PLANET = 500;
export const MAX_VISUAL_SCALE_MOON = 500;
export const MAX_VISUAL_SCALE_STAR = 20;
export const MAX_VISUAL_SCALE_DWARF = 2_000; // 왜소행성·혜성은 작아서 가시성 위해 더 크게
export const MAX_VISUAL_SCALE_COMET = 20_000;

/**
 * 거리 기반 시각 스케일 계산. 모든 인자는 SI 또는 scene units — 같은 단위이기만 하면 된다.
 *
 * @param cameraDistanceMeters 카메라–바디 거리 (m)
 * @param bodyRealRadiusMeters 바디 실제 반경 (m)
 * @param maxScale 해당 kind별 상한
 */
export function computeVisualScale(
  cameraDistanceMeters: number,
  bodyRealRadiusMeters: number,
  maxScale: number,
): number {
  if (bodyRealRadiusMeters <= 0) return MIN_VISUAL_SCALE;
  const raw = (cameraDistanceMeters * ANGULAR_K) / bodyRealRadiusMeters;
  if (raw <= MIN_VISUAL_SCALE) return MIN_VISUAL_SCALE;
  if (raw >= maxScale) return maxScale;
  return raw;
}

export function maxScaleForKind(kind: string): number {
  switch (kind) {
    case 'star':
      return MAX_VISUAL_SCALE_STAR;
    case 'moon':
      return MAX_VISUAL_SCALE_MOON;
    case 'dwarf-planet':
      return MAX_VISUAL_SCALE_DWARF;
    case 'comet':
      return MAX_VISUAL_SCALE_COMET;
    default:
      return MAX_VISUAL_SCALE_PLANET;
  }
}
