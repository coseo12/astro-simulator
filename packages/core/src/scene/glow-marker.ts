/**
 * #675 — glow pixel marker 발동 판정 + 크기/emissive 산정 순수 모듈.
 *
 * ADR `docs/decisions/20260613-675-glow-pixel-marker.md` §축 6/§축 7 — 줌아웃 시 sub-pixel
 * (시각 비식별) body 를 화면 고정 크기의 둥근 글로우 픽셀로 표기하는 기능의 판정 로직.
 * `solar-system-scene.ts` (runLodPass) 가 본 모듈을 호출해 mesh/material 적용만 담당한다 —
 * Babylon 미의존 순수 함수라 NullEngine 없이 고속 단위 테스트 가능 (`glow-marker.test.ts`).
 *
 * PM 확정값 (2026-06-13, 프리뷰 3-iteration 실 Chrome D-T2 승인 — ADR 박제, 변경 시 Amendment 의무):
 *  - 발동 기준: **실 billboard 렌더 px** (측정 pxDiameter ÷ bodyScale) **< 4** — iteration 2 fix.
 *    iteration 1 의 effective px 임계는 [4, 16) 데드존 (행성 비식별인데 미발동, 5 AU 실측 8 행성
 *    전부) 을 만들었고, 실 billboard px 환산으로 측정 기준 교체가 해소 (volt #32 measurement-first)
 *  - 크기 계층 2:1: parent (parentId === 'sun') 4.5px / satellite 4.5 ÷ ratio (기본 2 → 2.25px)
 *  - sun(star) 포함: parent 동급 4.5px (iteration 3 — 100 AU 에서 sun billboard ≈ 0.09px 비식별)
 *  - emissive boost: parent 1.6 / satellite 2.0 (1.5~2.25px gradient falloff 휘도 보상 실측값)
 */

import type { LodLevel } from '../render/lod.js';

/**
 * glow 발동 임계 (실 billboard 렌더 px 기준).
 *
 * 값 4 는 `LOD_BILLBOARD_ALPHA_MASK_MIN_PX_DIAMETER` (solar-system-scene.ts) 와 동일값 SSoT —
 * 직접 import 시 scene ↔ glow-marker 순환 의존 (scene 이 본 모듈을 import) 으로 TDZ 위험이 있어
 * 값 박제 + 단위 테스트 (`glow-marker.test.ts`) 가 양쪽 동일성을 drift 가드한다.
 * 비교 대상이 effective px 가 아닌 **실 billboard px** 인 점이 alpha mask 임계와 다르다 (ADR §축 6).
 */
export const GLOW_MARKER_ACTIVATION_PX_DIAMETER = 4;

/**
 * parent (parentId === 'sun' — 행성/왜소행성/혜성) 및 star (sun) 의 marker 목표 직경 (physical px).
 * #623 NO-OP ADR — px = physical px 확정 기저 (모바일 별도 분기 없음, 비-범위).
 */
export const GLOW_MARKER_TARGET_PX_PARENT = 4.5;

/** 모행성:위성 marker 크기 비율 기본값 (PM 확정 2:1 — satellite = 4.5 ÷ 2 = 2.25px). */
export const GLOW_MARKER_DEFAULT_SATELLITE_RATIO = 2;

/**
 * scaling 역보정 상한 클램프 — 극단 줌아웃 (pxDiameter → 0) 에서 quad 월드 크기 폭주 방지.
 * halley (bodyScale 5000, 측정 0.004px 급 @100 AU) 도 ≈ 4.5e6 으로 상한 내.
 */
export const GLOW_MARKER_MAX_SCALE = 1e8;

/** 역보정 분모 하한 (0 나눗셈 방어). */
export const GLOW_MARKER_MIN_MEASURED_PX = 1e-6;

/** glow 중 emissive 배율 — parent/star (기본 0.3 대비 boost — "빛나는" 인상). */
export const GLOW_MARKER_EMISSIVE_SCALE = 1.6;

/**
 * satellite 전용 emissive 상향 — 2.25px marker 의 gradient falloff 휘도 보상.
 * 10 AU 실측: 위성 피크 휘도 173~214 vs parent 199~252 → 2.0 으로 격차 보상 (PM 확정값).
 */
export const GLOW_MARKER_EMISSIVE_SCALE_SATELLITE = 2.0;

/**
 * glow 해제 시 non-star emissive 원복 배율.
 *
 * SSoT: `createBodyBillboard` (solar-system-scene.ts) 의 non-star 기본값 `c.scale(0.3)` 과 동일 —
 * star 는 full emissive (배율 1). 원복 값이 생성 기본값과 drift 하면 glow 1회 발동 후
 * 영구 휘도 변화가 남는다 (단위 테스트 대조 박제).
 */
export const GLOW_MARKER_RESTORE_EMISSIVE_SCALE_NON_STAR = 0.3;

/** 발동 판정 입력 — runLodPass 의 per-body 프레임 데이터. */
export interface GlowMarkerInput {
  /** scene 옵션 `glowMarker` — false 면 무조건 비발동 (`?marker=off` 경로, 연산 0 보장). */
  glowMarker: boolean;
  /** 해당 프레임의 LOD 결정 레벨 — 'low' (billboard) 에서만 발동. */
  nextLevel: LodLevel;
  /** 측정 pxDiameter (effective — body.radius × bodyScale 기준 화면 직경, px). */
  pxDiameter: number;
  /** bodyScale(body.id) 결과 — 실 billboard px 환산 분모. */
  bodyScaleVal: number;
  /** body.parentId — 'sun' 이면 parent 그룹 (행성/왜소행성/혜성), 그 외 satellite. */
  parentId: string | null;
  /** body.kind — 'star' (sun) 는 parent 동급 (위성 축소 비대상). */
  kind: string;
  /** 모행성:위성 비율 (`?ratio=` — 기본 GLOW_MARKER_DEFAULT_SATELLITE_RATIO). */
  satelliteRatio: number;
}

/** 발동 판정 결과 — active=false 면 scale/emissiveScale 은 중립값 (1). */
export interface GlowMarkerResult {
  /** glow 발동 여부. */
  active: boolean;
  /** marker 목표 직경 (px) — 비발동 시 0. */
  targetPx: number;
  /** low variant quad 에 적용할 scaling (역보정, [1, MAX_SCALE] 클램프) — 비발동 시 1. */
  scale: number;
  /** emissive 배율 — 비발동 시 1 (원복은 resolveGlowMarkerRestoreEmissiveScale 사용). */
  emissiveScale: number;
}

const INACTIVE: GlowMarkerResult = Object.freeze({
  active: false,
  targetPx: 0,
  scale: 1,
  emissiveScale: 1,
});

/** parent 그룹 (행성/왜소행성/혜성 — parentId='sun') 또는 star (sun 자신) 여부. */
function isParentTier(parentId: string | null, kind: string): boolean {
  return parentId === 'sun' || kind === 'star';
}

/**
 * glow pixel marker 발동 판정 + 적용값 산정 (순수 함수 — Babylon 미의존).
 *
 * 판정 (ADR §축 4/§축 6):
 *  - `glowMarker=false` → 무조건 비발동 (`?marker=off` 기존 동작 100% 보존)
 *  - `nextLevel !== 'low'` → 비발동 (billboard 상태에서만 의미)
 *  - `pxDiameter` 비유한/0 이하 (off-frustum / behind-camera projection 특이점) → 비발동 —
 *    fail-safe 방향: 발생해도 marker 1프레임 누락에 그치며, 가드 제거 시 targetPx/0 scaling
 *    폭주 (치명). 별도 frustum 판정 분리는 비용 추가 + 동일 결론으로 기각 (ADR §축 4)
 *  - 실 billboard px (pxDiameter ÷ bodyScale) ≥ 4 → 비발동. low 대역 (effective < 16px) 에서
 *    27 body 전수 bodyScale ≥ 48 → 실 billboard px ≤ 0.33px ≪ 4 이므로 사실상 low 진입 = 발동
 *    (popping 이 LOD cross-fade 에 마스킹되는 근거 — ADR §축 3). 임계 비교는 bodyScale
 *    미정의 (=1.0) body 방어용으로 잔존
 *
 * 적용값:
 *  - `scale = targetPx × bodyScale ÷ pxDiameter` — 측정 pxDiameter 는 effective 기준이지만
 *    billboard quad 는 bodyScale 미적용 실반경 렌더 (#333) 라 실제 화면 px ≈ pxDiameter ÷ bodyScale.
 *    [1, MAX_SCALE] 클램프
 *  - targetPx: parent/star 4.5px, satellite 4.5 ÷ satelliteRatio (기본 2.25px)
 *  - emissiveScale: parent/star 1.6, satellite 2.0
 */
export function resolveGlowMarker(input: GlowMarkerInput): GlowMarkerResult {
  const { glowMarker, nextLevel, pxDiameter, bodyScaleVal, parentId, kind, satelliteRatio } = input;
  if (!glowMarker || nextLevel !== 'low') {
    return INACTIVE;
  }
  if (!Number.isFinite(pxDiameter) || pxDiameter <= 0) {
    return INACTIVE;
  }
  const billboardPx = pxDiameter / Math.max(bodyScaleVal, GLOW_MARKER_MIN_MEASURED_PX);
  if (billboardPx >= GLOW_MARKER_ACTIVATION_PX_DIAMETER) {
    return INACTIVE;
  }
  const parentTier = isParentTier(parentId, kind);
  const targetPx = parentTier
    ? GLOW_MARKER_TARGET_PX_PARENT
    : GLOW_MARKER_TARGET_PX_PARENT / satelliteRatio;
  const rawScale = targetPx / Math.max(billboardPx, GLOW_MARKER_MIN_MEASURED_PX);
  const scale = Math.min(Math.max(rawScale, 1), GLOW_MARKER_MAX_SCALE);
  const emissiveScale = parentTier
    ? GLOW_MARKER_EMISSIVE_SCALE
    : GLOW_MARKER_EMISSIVE_SCALE_SATELLITE;
  return { active: true, targetPx, scale, emissiveScale };
}

/**
 * glow 해제 시 emissive 원복 배율 — `createBodyBillboard` 생성 기본값과 동일 (SSoT 대조).
 * star (sun) 는 full emissive (1), 그 외 0.3.
 */
export function resolveGlowMarkerRestoreEmissiveScale(kind: string): number {
  return kind === 'star' ? 1 : GLOW_MARKER_RESTORE_EMISSIVE_SCALE_NON_STAR;
}
