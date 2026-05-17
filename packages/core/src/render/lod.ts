/**
 * P11-B #289 — LOD 3단 분기 + 화면 점유 계산 (순수 함수)
 *
 * ADR: `docs/decisions/20260424-p11-b-lod-design.md` §축 1, §결정 §2
 *
 * LOD 3단 분기 계약 (ADR 20260424-p11-b-lod-design §결정):
 *   1. LOD 는 Scale Tier 와 직교 — tier.ts / tier-transition.ts 수정 금지
 *   2. body kind 강제 규칙 (star/planet-giant/planet-terrestrial/moon/dwarf-planet/comet/
 *      asteroid/spacecraft/black-hole/nebula/galaxy/star-cluster) 12 카테고리 완비.
 *      신규 kind 추가 시 LOD_BODY_THRESHOLDS 에 항목 누락하면 default fallback 발생 → 주석-구현 drift
 *   3. high/mid/low 이외의 값 도입 금지 — 추가 단계 필요 시 ADR Amendment 선박제
 *   4. body-kind 분류는 kind 자체 + mass 보조 (planet → giant/terrestrial 2분기)
 *   5. 픽셀 경계: high≥50, 50>mid≥8, low<8 — 변경은 bench tier-a 회귀 < 5% 유지 범위 내
 *   6. URL `?lod=auto` 는 distance/coverage 자동 판정, `?lod=high|mid|low` 는 전 body 강제
 * 위 계약 위배 변경은 즉시 버그로 간주 (CLAUDE.md "주석 계약 vs 구현 drift" 교훈).
 */

import type { Vec3Double } from '../coords/vec3.js';
import {
  LOD_BODY_THRESHOLDS,
  classifyBodyLodKind,
  type BodyLodKind,
  type BodyLodThreshold,
} from './lod-body-thresholds.js';

/** LOD 3단 레벨. 추가 시 ADR Amendment 선박제 (주석 계약 §3). */
export type LodLevel = 'high' | 'mid' | 'low';

/** URL `?lod=` 파라미터 값 — auto (거리 자동 판정) + 3단 강제. */
export type LodOverride = LodLevel | 'auto';

/**
 * LOD 픽셀 경계 (주석 계약 §5).
 *
 *  - high: ≥ 50px 또는 body-kind 강제 조건 충족
 *  - mid: 8 ≤ px < 50
 *  - low: < 8px
 */
export const LOD_PIXEL_THRESHOLDS = {
  high: 50,
  mid: 8,
} as const;

/**
 * LOD 분기 입력 — focus / override / pixelThresholds 는 optional.
 */
export interface LodDecisionInput {
  /** body 분류에 필요한 필드 (kind + mass + radius). */
  body: { kind: string; mass: number; radius: number };
  /** 카메라 → body 중심 실세계 거리 (m). */
  cameraDistanceMeters: number;
  /** `screenCoverageRadius()` 결과 — 화면 점유 반지름 (pixel). */
  screenCoverage: number;
  /**
   * focus body 여부. true 면 kind/coverage 무관 `high` 강제 (주석 계약 §미해결 3).
   * ADR `docs/decisions/20260424-p11-b-lod-design.md` §미해결 3 완화 결정 반영.
   */
  isFocused?: boolean;
  /**
   * URL `?lod=` override. `'auto'` 또는 undefined 면 자동 판정, 그 외는 해당 LOD 강제.
   */
  override?: LodOverride;
  /**
   * GPU tier 프로파일 주입 (P11-C #290 Amendment 2026-04-24).
   *
   * 부재 시 `LOD_PIXEL_THRESHOLDS` 상수 default (high=50, mid=8) 사용 — tier-a/b 경로.
   * tier-c 프로파일 주입 시 (high=100, mid=20) sub-pixel body 를 low billboard 로 강제.
   *
   * `@lod-threshold-tier-drift` — 하드코딩 상수 직접 참조 금지.
   * ADR `docs/decisions/20260424-p11-b-lod-design.md` §Amendments (2026-04-24).
   */
  pixelThresholds?: { high: number; mid: number };
}

/**
 * body 의 LOD 레벨을 결정한다.
 *
 * 결정 순서 (주석 계약 §2 §5):
 *  1. URL override (high/mid/low) 가 있으면 최우선 — 디버그/개발 용도
 *  2. focus body 면 `high` 강제 — 사용자 주목 대상 퇴행 방지
 *  3. body-kind 강제 규칙 (LOD_BODY_THRESHOLDS) — kind 별 근거 박제
 *  4. 픽셀 경계 (50 / 8) — 일반 경로
 *
 * 미지 kind 는 `console.warn` + `low` fallback. default 항목 도입 금지 (volt #49 교훈).
 */
export function lodFromScreenCoverage(input: LodDecisionInput): LodLevel {
  const { body, cameraDistanceMeters, screenCoverage, isFocused, override, pixelThresholds } =
    input;

  // 1. URL override 최우선 (auto 는 자동 판정으로 내려감).
  if (override && override !== 'auto') {
    return override;
  }

  // 2. focus body 는 항상 high — ADR §미해결 3 완화 결정.
  if (isFocused) {
    return 'high';
  }

  // 3. body-kind 강제 규칙.
  const lodKind = classifyBodyLodKind(body);
  if (lodKind === null) {
    // 미지 kind — default 항목 도입 금지 (volt #49 교훈). console.warn + low fallback.
    // eslint-disable-next-line no-console
    console.warn(`[lod] 미지 body.kind='${body.kind}' — 'low' 폴백`);
    return 'low';
  }
  const threshold = LOD_BODY_THRESHOLDS[lodKind];
  if (isHighByKindRule(threshold, cameraDistanceMeters, body.radius)) {
    return 'high';
  }

  // 4. 픽셀 경계 — tier 프로파일 주입 가능 (ADR Amendment 2026-04-24).
  //    인자 부재 시 LOD_PIXEL_THRESHOLDS 상수 default fallback.
  const thresholds = pixelThresholds ?? LOD_PIXEL_THRESHOLDS;
  if (screenCoverage >= thresholds.high) return 'high';
  if (screenCoverage >= thresholds.mid) return 'mid';
  return 'low';
}

/**
 * body-kind 규칙으로 high 강제인지 판정.
 *
 * `always-high` → 항상 true
 * `absolute-distance` → 카메라 거리 < threshold
 * `radius-multiple` → 카메라 거리 < factor × radius
 */
function isHighByKindRule(
  threshold: BodyLodThreshold,
  cameraDistanceMeters: number,
  bodyRadius: number,
): boolean {
  if (threshold.mode === 'always-high') return true;
  if (threshold.mode === 'absolute-distance') {
    return cameraDistanceMeters < threshold.highMaxDistanceMeters;
  }
  // radius-multiple
  return cameraDistanceMeters < threshold.highMaxRadiusFactor * bodyRadius;
}

/**
 * 화면 공간 bounding sphere 반지름 계산 (pixel).
 *
 * ADR §축 1 공식:
 *  1. body 중심을 clip-space 로 투영
 *  2. clip-space 에서 body 반지름만큼 떨어진 surface point 도 투영 (perspective 발산 흡수)
 *  3. clip → NDC → pixel (w 로 나누기 — perspective divide)
 *
 * #379 fix (2026-05-02) — edge offset axis + NDC→pixel 환산 정정:
 *   기존 구현은 edge point 를 world-up (+y) 으로 고정했고 "구형 대칭으로 어느 방향이든 정확도
 *   충분" 이라는 암묵 전제가 있었다. 그러나 카메라가 비스듬히 (target up vector 와 view forward 가
 *   non-orthogonal) 자세를 잡으면 world-up 의 view-forward 성분이 NDC y 변화를 흡수해 pixel
 *   offset 이 작아진다. 추가로 NDC x 와 y 는 perspective projection 의 anisotropy 로 인해
 *   서로 다른 단위 (m[0] = 1/(aspect·tan(fov/2)), m[5] = 1/tan(fov/2)) 를 가지며, NDC x 변화를
 *   `× viewportHeight` 로 환산하면 aspect 만큼 작게 측정된다.
 *
 *   forensic 매트릭스 (#379, `docs/reports/379-forensic/`) 에서 sun=low 100% / mercury=low 100% /
 *   venus=low 100% 의 단일 원인. 실측 (debug-379-tmp 박제) 은 sun pxDiameter 가 식 결과의
 *   √3 배 (≈173%) 로 나타나는데, 이는 r1-guard `radiusWorld` (BBOX 대각선/2 = √3 × 실 반지름)
 *   의 산출 한계와 결합된 결과 — 본 식은 sphere 의 실제 화면 반지름을 정확히 반환한다.
 *
 *   #379 fix 는 두 가지를 동시 정정:
 *   1. edge offset axis 를 cameraUp (world space) 로 변경 — invView col 1. NDC 변화가 y 축
 *      주성분이 되도록 강제 (cameraRight 면 NDC x 가 주성분이 되어 anisotropic 환산 필요)
 *   2. NDC y 를 viewportHeight 로 환산 (이 부분은 기존 동작 유지 — y 축 환산은 정확)
 *
 *   호출자는 매 frame `cameraUpWorld` (= invView col 1, world space camera-up basis) 를 전달.
 *   부재 시 fallback 은 world-up [0, 1, 0] — ArcRotateCamera default 자세에서 cameraUp 이
 *   world-up 의 view-forward 성분 제거 후 정규화된 형태이므로 ±10% 이내. 견고성을 위해 호출자가
 *   매 프레임 invView 로부터 추출 권장.
 *
 * 암묵 전제:
 *  - body 는 구형 — cameraUp 방향으로 offset 한 edge 는 view 의 vertical axis 평행 →
 *    NDC y 변화 = 정확한 sphere 반지름의 화면 투영 (radius)
 *  - body 가 카메라 뒤 (clip w ≤ 0) 면 0 반환 — 호출자가 culling 처리
 *
 * @param bodyLocalPos body 중심 scene 좌표 (fo.toLocal 적용된 m 단위 — scene unit 기준이 아님)
 * @param bodyRadiusMeters 실측 반경 (m). 호출자가 `body.radius × bodyScale(id)` 로 효과 반경
 *   적용한 값을 전달 (#379 호출 사이트 SSoT, runLodPass 의 effectiveRadius)
 * @param renderScale `renderScaleForTier(activeTier)` — scene unit per m
 * @param viewProjMatrix view × projection 결합 4×4 행렬. Babylon `scene.getTransformMatrix().m`.
 *   메모리 레이아웃은 column-major 16 원소 — TransformCoordinatesFromFloatsToRef 가 사용하는
 *   `m[0], m[4], m[8], m[12]` 인덱싱 (`mulMat4Point` 와 동일) 이 표준
 * @param viewportHeight 뷰포트 높이 (pixel)
 * @param cameraUpWorld world space camera-up basis (= invView col 1). 부재 시 world-up
 *   `[0, 1, 0]` fallback (ArcRotateCamera default 자세에서 ±10% 이내, 비스듬 카메라에서 부정확)
 * @returns 화면 공간 반지름 (pixel). 카메라 뒤 body 는 0.
 */
export function screenCoverageRadius(
  bodyLocalPos: Vec3Double,
  bodyRadiusMeters: number,
  renderScale: number,
  viewProjMatrix: ArrayLike<number>,
  viewportHeight: number,
  cameraUpWorld?: Vec3Double,
): number {
  // scene 좌표 = 실세계 거리 m × renderScale.
  const sx = bodyLocalPos[0] * renderScale;
  const sy = bodyLocalPos[1] * renderScale;
  const sz = bodyLocalPos[2] * renderScale;

  // edge point 의 scene-unit 좌표 — body 반경을 sceneUnit 으로 환산 후 cameraUp 방향으로 offset.
  // cameraUpWorld 는 unit vector 가정 (invView col 1 은 정규직교 회전이라 자연스럽게 unit).
  // 부재 시 world-up [0, 1, 0] fallback — ArcRotateCamera default 자세에서 cameraUp 이
  // world-up 의 view-forward 성분 제거 후 정규화된 형태라 근사 가능.
  const edgeScale = bodyRadiusMeters * renderScale;
  const ux = cameraUpWorld?.[0] ?? 0;
  const uy = cameraUpWorld?.[1] ?? 1; // fallback: world-up
  const uz = cameraUpWorld?.[2] ?? 0;
  const ex = sx + ux * edgeScale;
  const ey = sy + uy * edgeScale;
  const ez = sz + uz * edgeScale;

  // clip-space 투영 (column-major 4×4 × column vector, w=1 가정).
  const clipCenter = mulMat4Point(viewProjMatrix, sx, sy, sz);
  const clipEdge = mulMat4Point(viewProjMatrix, ex, ey, ez);

  // 카메라 뒤 (w ≤ 0) — culling. 호출자가 LOD 'low' fallback 처리.
  if (clipCenter.w <= 0 || clipEdge.w <= 0) return 0;

  // NDC (-1 ~ 1) 환산. cameraUp basis 로 offset 했으므로 NDC y 변화가 주성분.
  // x 변화도 함께 측정해 거리 합산 (perspective tilt 시 약간의 x 성분 발생).
  const ndcCenterX = clipCenter.x / clipCenter.w;
  const ndcCenterY = clipCenter.y / clipCenter.w;
  const ndcEdgeX = clipEdge.x / clipEdge.w;
  const ndcEdgeY = clipEdge.y / clipEdge.w;

  // NDC → pixel. NDC y 는 viewportHeight 환산이 정확. x 는 viewportWidth 가 더 정확하나
  // cameraUp 방향 offset 이라 x 성분이 매우 작아 실용적 영향 미미 — viewportHeight 로 통일하면
  // 식이 단순. LOD 픽셀 임계 (50/8) 의 ±5% 오차 이내 (forensic 매트릭스 검증 + 단위 테스트
  // `screenCoverageRadius — identity 행렬` 케이스).
  const dx = (ndcEdgeX - ndcCenterX) * viewportHeight * 0.5;
  const dy = (ndcEdgeY - ndcCenterY) * viewportHeight * 0.5;
  return Math.sqrt(dx * dx + dy * dy);
}

interface Vec4 {
  x: number;
  y: number;
  z: number;
  w: number;
}

/**
 * 4×4 행렬 × 3D 점 (w=1). Babylon `Matrix.m` 16 원소 Float32Array 호환.
 *
 * 수식은 Babylon 공식 API `Vector3.TransformCoordinatesFromFloatsToRef` 구현과 동일 —
 * `rx = x*m[0] + y*m[4] + z*m[8] + m[12]` 식으로 m[col*4+row] 인덱싱. Babylon docs 는 `.m` 을
 * "row-major" 저장이라고 설명하지만, TransformCoordinates API 의 접근 패턴이 사실상 column-vector
 * 관례(M × v) 와 호환되므로 본 수식이 올바르다. 리뷰 #321 non-blocking 1 — 이전 주석이 row-major
 * 표기로 오해를 유발하여 바로잡음. 구현 동작 자체는 변경 없음.
 */
function mulMat4Point(m: ArrayLike<number>, x: number, y: number, z: number): Vec4 {
  // Babylon Vector3.TransformCoordinates 와 동일: m[0], m[4], m[8], m[12] 가 첫 번째 출력 성분에 기여.
  const m0 = m[0] ?? 0;
  const m1 = m[1] ?? 0;
  const m2 = m[2] ?? 0;
  const m3 = m[3] ?? 0;
  const m4 = m[4] ?? 0;
  const m5 = m[5] ?? 0;
  const m6 = m[6] ?? 0;
  const m7 = m[7] ?? 0;
  const m8 = m[8] ?? 0;
  const m9 = m[9] ?? 0;
  const m10 = m[10] ?? 0;
  const m11 = m[11] ?? 0;
  const m12 = m[12] ?? 0;
  const m13 = m[13] ?? 0;
  const m14 = m[14] ?? 0;
  const m15 = m[15] ?? 0;
  return {
    x: m0 * x + m4 * y + m8 * z + m12,
    y: m1 * x + m5 * y + m9 * z + m13,
    z: m2 * x + m6 * y + m10 * z + m14,
    w: m3 * x + m7 * y + m11 * z + m15,
  };
}

// Re-export body-kind 도구 (단일 진입점).
export { LOD_BODY_THRESHOLDS, classifyBodyLodKind };
export type { BodyLodKind, BodyLodThreshold };
