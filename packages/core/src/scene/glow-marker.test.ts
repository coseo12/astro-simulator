/**
 * #675 — glow pixel marker 판정 순수 함수 단위 테스트.
 *
 * ADR `docs/decisions/20260613-675-glow-pixel-marker.md` §축 6 매트릭스 박제.
 * Babylon 미의존 (NullEngine 불필요) — 발동 경계 / 2:1 비율 / sun=parent 동급 /
 * star emissive 원복 분기 / off-frustum px=0 / clamp 전수.
 *
 * PM 확정값 (2026-06-13 프리뷰 D-T2 승인) assert 가 fail 하면 ADR 박제값과 drift —
 * 값 변경은 Amendment 의무.
 */

import { describe, expect, it } from 'vitest';
import {
  GLOW_MARKER_ACTIVATION_PX_DIAMETER,
  GLOW_MARKER_DEFAULT_SATELLITE_RATIO,
  GLOW_MARKER_EMISSIVE_SCALE,
  GLOW_MARKER_EMISSIVE_SCALE_SATELLITE,
  GLOW_MARKER_MAX_SCALE,
  GLOW_MARKER_MIN_MEASURED_PX,
  GLOW_MARKER_RESTORE_EMISSIVE_SCALE_NON_STAR,
  GLOW_MARKER_TARGET_PX_PARENT,
  resolveGlowMarker,
  resolveGlowMarkerRestoreEmissiveScale,
  type GlowMarkerInput,
} from './glow-marker.js';
import { LOD_BILLBOARD_ALPHA_MASK_MIN_PX_DIAMETER } from './billboard-alpha-mask.js';

/** 기본 입력 — 발동 케이스 (low + 실 billboard px ≪ 4). 개별 케이스는 필요한 필드만 override. */
function input(overrides: Partial<GlowMarkerInput> = {}): GlowMarkerInput {
  return {
    glowMarker: true,
    nextLevel: 'low',
    // earth bodyScale=800 / 측정 pxDiameter=8 → 실 billboard px = 0.01 ≪ 4 (발동 대표값).
    pxDiameter: 8,
    bodyScaleVal: 800,
    parentId: 'sun',
    kind: 'planet',
    satelliteRatio: GLOW_MARKER_DEFAULT_SATELLITE_RATIO,
    ...overrides,
  };
}

describe('#675 — PM 확정 상수 박제 (변경 시 ADR Amendment 의무)', () => {
  it('발동 임계 4px — LOD_BILLBOARD_ALPHA_MASK_MIN_PX_DIAMETER 와 동일값 SSoT drift 가드', () => {
    // glow-marker.ts 는 scene ↔ glow-marker 순환 의존 (TDZ) 회피를 위해 값 박제 —
    // 본 assert 가 양쪽 동일성을 가드한다 (한쪽만 변경 시 즉시 fail).
    expect(GLOW_MARKER_ACTIVATION_PX_DIAMETER).toBe(4);
    expect(GLOW_MARKER_ACTIVATION_PX_DIAMETER).toBe(LOD_BILLBOARD_ALPHA_MASK_MIN_PX_DIAMETER);
  });

  it('크기 계층 — parent 4.5px / 기본 비율 2 (satellite 2.25px)', () => {
    expect(GLOW_MARKER_TARGET_PX_PARENT).toBe(4.5);
    expect(GLOW_MARKER_DEFAULT_SATELLITE_RATIO).toBe(2);
  });

  it('emissive boost — parent 1.6 / satellite 2.0 / 원복 non-star 0.3', () => {
    expect(GLOW_MARKER_EMISSIVE_SCALE).toBe(1.6);
    expect(GLOW_MARKER_EMISSIVE_SCALE_SATELLITE).toBe(2.0);
    // createBodyBillboard 생성 기본값 (c.scale(0.3)) SSoT 대조 — drift 시 glow 1회 발동 후
    // 영구 휘도 변화가 남는다.
    expect(GLOW_MARKER_RESTORE_EMISSIVE_SCALE_NON_STAR).toBe(0.3);
  });
});

describe('#675 — 발동 판정 (ADR §축 6 매트릭스 1행)', () => {
  it('low + 실 billboard px < 4 → active', () => {
    const r = resolveGlowMarker(input());
    expect(r.active).toBe(true);
  });

  it('mid / high → inactive (billboard 상태에서만 발동)', () => {
    expect(resolveGlowMarker(input({ nextLevel: 'mid' })).active).toBe(false);
    expect(resolveGlowMarker(input({ nextLevel: 'high' })).active).toBe(false);
  });

  it('glowMarker=false → 무조건 inactive (?marker=off 기존 동작 100% 보존)', () => {
    expect(resolveGlowMarker(input({ glowMarker: false })).active).toBe(false);
    // off 경로 결과는 중립값 (scale=1) — scene 이 적용해도 무변화.
    const r = resolveGlowMarker(input({ glowMarker: false }));
    expect(r.scale).toBe(1);
    expect(r.targetPx).toBe(0);
  });

  it('pxDiameter 0 / 음수 / NaN / Infinity → inactive (off-frustum 가드, ADR §축 4)', () => {
    // 실측 (프리뷰 iteration 2): 5 AU 에서 halley/swift-tuttle px=0 = 화면 밖 — 마커 불필요.
    // 가드 제거 시 targetPx/0 scaling 폭주 (치명) — fail-safe 방향 박제.
    expect(resolveGlowMarker(input({ pxDiameter: 0 })).active).toBe(false);
    expect(resolveGlowMarker(input({ pxDiameter: -1 })).active).toBe(false);
    expect(resolveGlowMarker(input({ pxDiameter: NaN })).active).toBe(false);
    expect(resolveGlowMarker(input({ pxDiameter: Infinity })).active).toBe(false);
    expect(resolveGlowMarker(input({ pxDiameter: -Infinity })).active).toBe(false);
  });

  it('실 billboard px ≥ 4 → inactive (bodyScale 미정의 =1.0 body 방어 경계)', () => {
    // bodyScale=1 + 측정 pxDiameter=4 → 실 billboard px=4 (경계 — 발동 안 함).
    expect(resolveGlowMarker(input({ pxDiameter: 4, bodyScaleVal: 1 })).active).toBe(false);
    expect(resolveGlowMarker(input({ pxDiameter: 16, bodyScaleVal: 1 })).active).toBe(false);
    // 경계 직전 → 발동.
    expect(resolveGlowMarker(input({ pxDiameter: 3.9, bodyScaleVal: 1 })).active).toBe(true);
  });

  it('low 대역 (effective < 16px) 에서 27 body 전수 발동 — 최소 bodyScale 48 경계', () => {
    // ADR §축 3 popping 명시 수용의 근거: low 대역 실 billboard px ≤ 16/48 ≈ 0.33 ≪ 4
    // → low 진입 = 발동 (glow on/off 전환점이 LOD low 경계와 일치 → 기존 cross-fade 마스킹).
    const r = resolveGlowMarker(input({ pxDiameter: 15.99, bodyScaleVal: 48 }));
    expect(r.active).toBe(true);
  });
});

describe('#675 — 크기 계층 2:1 (ADR §축 6 매트릭스 2행, PM 확정값)', () => {
  it("parent (parentId='sun') → targetPx 4.5", () => {
    const r = resolveGlowMarker(input({ parentId: 'sun', kind: 'planet' }));
    expect(r.targetPx).toBe(4.5);
    expect(r.emissiveScale).toBe(GLOW_MARKER_EMISSIVE_SCALE);
  });

  it('satellite (기본 ratio 2) → targetPx 2.25', () => {
    const r = resolveGlowMarker(input({ parentId: 'earth', kind: 'satellite' }));
    expect(r.targetPx).toBe(2.25);
    expect(r.emissiveScale).toBe(GLOW_MARKER_EMISSIVE_SCALE_SATELLITE);
  });

  it('satellite ratio=3 → targetPx 1.5 (?ratio=3 디버그 경로 — 프리뷰 비채택 비교값)', () => {
    const r = resolveGlowMarker(
      input({ parentId: 'jupiter', kind: 'satellite', satelliteRatio: 3 }),
    );
    expect(r.targetPx).toBe(1.5);
  });

  it('star (sun) → parent 동급 4.5 (iteration 3 — star 제외 설계 폐기, parentId 무관)', () => {
    // sun 은 parentId=null + kind='star' — 100 AU 에서 billboard ≈ 0.09px 비식별 (실측).
    const r = resolveGlowMarker(input({ parentId: null, kind: 'star' }));
    expect(r.active).toBe(true);
    expect(r.targetPx).toBe(4.5);
    expect(r.emissiveScale).toBe(GLOW_MARKER_EMISSIVE_SCALE);
  });
});

describe('#675 — scaling 산식 + clamp (ADR §축 6 매트릭스 3행)', () => {
  it('scale = targetPx × bodyScale / pxDiameter (역보정 산식)', () => {
    // earth: pxDiameter=8, bodyScale=800 → billboardPx=0.01 → scale = 4.5/0.01 = 450.
    const r = resolveGlowMarker(input({ pxDiameter: 8, bodyScaleVal: 800 }));
    expect(r.scale).toBeCloseTo((4.5 * 800) / 8, 6);
  });

  it('MAX_SCALE 1e8 상한 클램프 — 극단 줌아웃 scaling 폭주 방지', () => {
    // billboardPx → MIN_MEASURED_PX (1e-6) 하한 → raw = 4.5e6 ≤ 1e8 (halley 급).
    // 더 극단: pxDiameter=1e-12, bodyScale=5000 → billboardPx=2e-16 → MIN 클램프 후 4.5e6.
    const halley = resolveGlowMarker(input({ pxDiameter: 1e-12, bodyScaleVal: 5000 }));
    expect(halley.scale).toBeLessThanOrEqual(GLOW_MARKER_MAX_SCALE);
    expect(halley.scale).toBe(GLOW_MARKER_TARGET_PX_PARENT / GLOW_MARKER_MIN_MEASURED_PX / 1);
    // 인위적 상한 초과 케이스: targetPx/billboardPx > 1e8 은 MIN_MEASURED_PX 하한 (4.5e6) 때문에
    // 현 상수 조합으로 도달 불가 — 상한식 자체는 Math.min 으로 박제됨을 별도 확인.
    expect(GLOW_MARKER_TARGET_PX_PARENT / GLOW_MARKER_MIN_MEASURED_PX).toBeLessThanOrEqual(
      GLOW_MARKER_MAX_SCALE,
    );
  });

  it('하한 1 클램프 — 발동 경계 직전 (billboardPx ≈ 4) 에서 scale < 1 방지', () => {
    // billboardPx=3.9 → raw = 4.5/3.9 ≈ 1.15 (>1). billboardPx 3.99 에 targetPx 2.25 (satellite)
    // → raw ≈ 0.56 → 하한 1 클램프 (marker 가 측정 px 보다 작아지는 역전 방지).
    const r = resolveGlowMarker(
      input({ pxDiameter: 3.99, bodyScaleVal: 1, parentId: 'earth', kind: 'satellite' }),
    );
    expect(r.active).toBe(true);
    expect(r.scale).toBe(1);
  });
});

describe('#675 — emissive 원복 분기 (ADR §축 6 매트릭스 4행)', () => {
  it('star → full emissive (1) / non-star → 0.3 (createBodyBillboard 기본값 SSoT)', () => {
    expect(resolveGlowMarkerRestoreEmissiveScale('star')).toBe(1);
    expect(resolveGlowMarkerRestoreEmissiveScale('planet')).toBe(
      GLOW_MARKER_RESTORE_EMISSIVE_SCALE_NON_STAR,
    );
    expect(resolveGlowMarkerRestoreEmissiveScale('satellite')).toBe(0.3);
    expect(resolveGlowMarkerRestoreEmissiveScale('dwarf')).toBe(0.3);
    expect(resolveGlowMarkerRestoreEmissiveScale('comet')).toBe(0.3);
  });
});
