/**
 * #728 — Adams ring azimuthal arc 변조 단위 테스트.
 *
 * GLSL `azimuthalArcFactor` 는 셰이더 소스라 직접 테스트 불가 → 순수 JS 미러 `computeArcFactor`
 * 로 azimuth 기준축 계약 / wrap-around / smoothstep 경계 / 다중 arc max / 빈 배열 무회귀 검증.
 * + `packArcUniforms` 고정 배열 패킹 (MAX_ARCS 상한 / fallback warn) 검증.
 *
 * ADR `docs/decisions/20260621-728-adams-ring-arcs.md` §결정 2/4 + §교차검증 (이견 수용 1·2·4).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ARC_EDGE_FADE_RAD, MAX_ARCS, computeArcFactor, packArcUniforms } from './ring-shader.js';
import { MAX_ARCS as LOADER_MAX_ARCS } from '../ephemeris/solar-system-loader.js';

const DEG = Math.PI / 180;

// volt #69 은닉 상수 drift 가드 (reviewer 권고) — ring-shader 의 GLSL uniform 배열 상한과
// loader 의 zod `.max(MAX_ARCS)` 파싱 상한은 독립 선언이라 정합이 깨지면 데이터 silent drop.
// 순환 import 회피 위해 모듈 간 import 대신 test 에서 양쪽 import 후 동치 단언 (단일 SSoT 강제).
describe('#728 MAX_ARCS 정합 — ring-shader ↔ loader drift 가드', () => {
  it('두 독립 선언이 동일 값 (uniform 배열 상한 = zod 파싱 상한)', () => {
    expect(LOADER_MAX_ARCS).toBe(MAX_ARCS);
  });
});

describe('#728 azimuthal arc 변조 — computeArcFactor (GLSL 미러)', () => {
  it('arc 미지정/빈 배열 → 1.0 (균질 환형 무회귀 — 모든 방위각에서)', () => {
    for (const az of [-Math.PI, -1, 0, 1, Math.PI]) {
      expect(computeArcFactor(az, undefined)).toBe(1.0);
      expect(computeArcFactor(az, [])).toBe(1.0);
    }
  });

  it('arc 중심 방위각 = centerDeg (UV X축 기준 CCW degree) — 기준축 계약', () => {
    // centerDeg 90° → azimuth π/2 에서 arc 정점 (brightness 그대로).
    const arcs = [{ centerDeg: 90, widthDeg: 20, brightness: 1.5 }];
    expect(computeArcFactor(90 * DEG, arcs, 0.35)).toBeCloseTo(1.5, 5);
    // centerDeg 0° → azimuth 0 에서 정점.
    const arcs0 = [{ centerDeg: 0, widthDeg: 20, brightness: 1.5 }];
    expect(computeArcFactor(0, arcs0, 0.35)).toBeCloseTo(1.5, 5);
  });

  it('arc 밖 (멀리 떨어진 방위각) → darkFactor (어두운 나머지)', () => {
    const arcs = [{ centerDeg: 90, widthDeg: 20, brightness: 1.5 }];
    // 90° arc 에서 180° 떨어진 270° 는 완전히 arc 밖 → darkFactor.
    expect(computeArcFactor(270 * DEG, arcs, 0.35)).toBeCloseTo(0.35, 5);
    expect(computeArcFactor(-90 * DEG, arcs, 0.35)).toBeCloseTo(0.35, 5);
  });

  it('wrap-around — 0°/360° 경계를 넘는 arc 도 연속 (atan2 정규화)', () => {
    // centerDeg 0° (= 360°), halfWidth 10° → +5° 와 -5° (=355°) 둘 다 arc 안.
    const arcs = [{ centerDeg: 0, widthDeg: 20, brightness: 1.5 }];
    expect(computeArcFactor(5 * DEG, arcs, 0.35)).toBeGreaterThan(1.0);
    expect(computeArcFactor(355 * DEG, arcs, 0.35)).toBeGreaterThan(1.0);
    // 정확히 대칭 — +5° 와 355°(=-5°) 동일 값
    expect(computeArcFactor(5 * DEG, arcs, 0.35)).toBeCloseTo(
      computeArcFactor(355 * DEG, arcs, 0.35),
      5,
    );
  });

  it('smoothstep 경계 — half-width 안=brightness, 밖=darkFactor, 경계는 중간값 (hard cutoff 아님)', () => {
    const arcs = [{ centerDeg: 0, widthDeg: 20, brightness: 1.5 }]; // halfWidth = 10° = 0.1745 rad
    const halfWidth = 10 * DEG;
    // 경계 충분히 안쪽 (halfWidth - fade 미만) → brightness.
    expect(computeArcFactor(halfWidth - ARC_EDGE_FADE_RAD - 0.01, arcs, 0.35)).toBeCloseTo(1.5, 3);
    // 경계 충분히 바깥 (halfWidth + fade 초과) → darkFactor.
    expect(computeArcFactor(halfWidth + ARC_EDGE_FADE_RAD + 0.01, arcs, 0.35)).toBeCloseTo(0.35, 3);
    // 경계 정중앙 (delta = halfWidth) → smoothstep 0.5 → 중간값 (1.5+0.35)/2 = 0.925.
    const mid = computeArcFactor(halfWidth, arcs, 0.35);
    expect(mid).toBeGreaterThan(0.35);
    expect(mid).toBeLessThan(1.5);
    expect(mid).toBeCloseTo((1.5 + 0.35) / 2, 2);
  });

  it('다중 arc — 겹치는 영역은 가장 밝은 값 채택 (max 누적)', () => {
    // 두 arc 가 인접 — 사이 영역에서 더 밝은 arc 값이 이긴다.
    const arcs = [
      { centerDeg: 0, widthDeg: 20, brightness: 1.6 },
      { centerDeg: 15, widthDeg: 20, brightness: 1.1 },
    ];
    // 0° 정점 → 1.6 (첫 arc 우세).
    expect(computeArcFactor(0, arcs, 0.35)).toBeCloseTo(1.6, 3);
    // 15° 정점 → 두 arc 모두 영향, max → 첫 arc(1.6) 가 여전히 우세 가능성 — 최소 1.1 이상.
    expect(computeArcFactor(15 * DEG, arcs, 0.35)).toBeGreaterThanOrEqual(1.1);
  });

  it('DoD 1 — neptune Adams arc 데이터로 bright/dark 대조비 ≥ 2:1', () => {
    const arcs = [
      { centerDeg: 252, widthDeg: 24, brightness: 1.6 },
      { centerDeg: 274, widthDeg: 14, brightness: 1.15 },
    ];
    const darkFactor = 0.35;
    const arcCenter = computeArcFactor(252 * DEG, arcs, darkFactor); // 주 bump 정점
    const darkRegion = computeArcFactor(72 * DEG, arcs, darkFactor); // arc 반대편
    expect(arcCenter).toBeCloseTo(1.6, 3);
    expect(darkRegion).toBeCloseTo(0.35, 3);
    expect(arcCenter / darkRegion).toBeGreaterThanOrEqual(2);
  });
});

describe('#728 azimuthal arc — packArcUniforms (uniform 고정 배열 패킹)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('arc 미지정 → count 0 (azFactor 1.0 무회귀), 고정 길이 MAX_ARCS 배열', () => {
    const u = packArcUniforms(undefined);
    expect(u.count).toBe(0);
    expect(u.centers).toHaveLength(MAX_ARCS);
    expect(u.halfWidths).toHaveLength(MAX_ARCS);
    expect(u.brightness).toHaveLength(MAX_ARCS);
  });

  it('arc degree → radian 변환 + half-width 환산 (widthDeg/2)', () => {
    const u = packArcUniforms([{ centerDeg: 180, widthDeg: 40, brightness: 1.5 }]);
    expect(u.count).toBe(1);
    expect(u.centers[0]).toBeCloseTo(Math.PI, 5); // 180° → π
    expect(u.halfWidths[0]).toBeCloseTo(20 * DEG, 5); // widthDeg 40 → halfWidth 20°
    expect(u.brightness[0]).toBe(1.5);
  });

  it('MAX_ARCS 초과 입력은 상한에서 절단 (GLSL uniform overflow 차단)', () => {
    const many = Array.from({ length: MAX_ARCS + 3 }, (_, i) => ({
      centerDeg: i * 10,
      widthDeg: 5,
      brightness: 1.2,
    }));
    const u = packArcUniforms(many);
    expect(u.count).toBe(MAX_ARCS);
  });

  it('fallback warn — 형식 오류 arc (NaN/음수 폭) 는 건너뛰고 console.warn (full ring 유지 가드)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const u = packArcUniforms([
      { centerDeg: 90, widthDeg: 20, brightness: 1.5 }, // valid
      { centerDeg: NaN, widthDeg: 20, brightness: 1.5 }, // invalid centerDeg
      { centerDeg: 90, widthDeg: -5, brightness: 1.5 }, // invalid width
      { centerDeg: 90, widthDeg: 20, brightness: -1 }, // invalid brightness
    ]);
    expect(u.count).toBe(1); // valid 1개만 패킹
    expect(warnSpy).toHaveBeenCalled();
  });
});
