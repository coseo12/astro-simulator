/**
 * #693 — free-fly 패닝 감도 산출식 + zero-division 가드 + 토글 회귀 가드.
 *
 * ADR `docs/decisions/20260616-693-freefly-panning.md` §결정 1~2 + 무회귀 실측.
 *
 * 검증 대상 (camera.ts 순수 로직 — Babylon 엔진/WebGL 불필요, radius/lowerRadiusLimit 읽기 +
 * panningSensibility 쓰기만 하는 duck-typed 카메라 모킹):
 *  - PANNING_DELTA_PERCENTAGE 박제값 (D-T2 튜닝 SSoT)
 *  - computePanningSensibility radius 비례 (radius 2배 → sensibility 1/2 = 화면 px↔world 일정)
 *  - zero-division 가드 (radius 0 / NaN / -∞ → 유한 양수, Infinity/NaN 발산 차단)
 *  - setPanningEnabled 토글 (free-fly 활성 = 산출값 / focus 비활성 = 0)
 */
import { describe, it, expect } from 'vitest';
import type { ArcRotateCamera } from '@babylonjs/core';
import {
  PANNING_DELTA_PERCENTAGE,
  computePanningSensibility,
  setPanningEnabled,
} from './camera.js';

/** radius/lowerRadiusLimit/panningSensibility 3 속성만 갖는 최소 카메라 모킹. */
function mockCamera(radius: number, lowerRadiusLimit = 0.5): ArcRotateCamera {
  return {
    radius,
    lowerRadiusLimit,
    panningSensibility: 0,
  } as unknown as ArcRotateCamera;
}

describe('#693 free-fly 패닝 감도 산출식', () => {
  it('PANNING_DELTA_PERCENTAGE 박제값 = 0.01 (D-T2 튜닝 SSoT)', () => {
    expect(PANNING_DELTA_PERCENTAGE).toBe(0.01);
  });

  it('computePanningSensibility — 유한 양수 반환 (정상 radius)', () => {
    const s = computePanningSensibility(mockCamera(35));
    expect(Number.isFinite(s)).toBe(true);
    expect(s).toBeGreaterThan(0);
  });

  it('radius 비례 — radius 2배 → sensibility 절반 (화면 px↔world 일정 비율)', () => {
    // sensibility = REFERENCE / (radius × pct) 이므로 radius↑ → sensibility↓ (반비례).
    // Babylon panningSensibility 는 divisor(값↓ = 둔감 반대로 빠름)라 radius 가 커질수록
    // sensibility 가 작아져 1px drag world 이동량이 radius 비례로 커진다.
    const sLow = computePanningSensibility(mockCamera(35));
    const sHigh = computePanningSensibility(mockCamera(70));
    expect(sHigh).toBeCloseTo(sLow / 2, 6);
  });

  it('tier 무관 일정 비율 — solar(r≈35) vs deep(r≈158386) 의 sensibility×radius 곱 일정', () => {
    // sensibility × radius = REFERENCE / pct (radius 소거) → tier 무관 상수.
    const solar = mockCamera(35);
    const deep = mockCamera(158386);
    const productSolar = computePanningSensibility(solar) * solar.radius;
    const productDeep = computePanningSensibility(deep) * deep.radius;
    expect(productDeep).toBeCloseTo(productSolar, 3);
  });
});

describe('#693 zero-division 가드 (agy 고유 발견 ①)', () => {
  it('radius=0 → Infinity/NaN 발산 아닌 유한 양수 (lowerRadiusLimit 하한)', () => {
    const s = computePanningSensibility(mockCamera(0, 0.5));
    expect(Number.isFinite(s)).toBe(true);
    expect(s).toBeGreaterThan(0);
  });

  it('radius=NaN → 유한 양수 (NaN 발산 차단)', () => {
    const s = computePanningSensibility(mockCamera(Number.NaN, 0.5));
    expect(Number.isFinite(s)).toBe(true);
    expect(s).toBeGreaterThan(0);
  });

  it('radius=-Infinity → 유한 양수 (음/무한 방어)', () => {
    const s = computePanningSensibility(mockCamera(Number.NEGATIVE_INFINITY, 0.5));
    expect(Number.isFinite(s)).toBe(true);
    expect(s).toBeGreaterThan(0);
  });

  it('lowerRadiusLimit=0 + radius=0 → EPSILON 하한으로 발산 차단 (이중 가드)', () => {
    const s = computePanningSensibility(mockCamera(0, 0));
    expect(Number.isFinite(s)).toBe(true);
    expect(s).toBeGreaterThan(0);
  });
});

describe('#693 setPanningEnabled 토글 (ADR §결정 3 옵션 A)', () => {
  it('enabled=true → panningSensibility = 산출값(>0) (free-fly 활성)', () => {
    const cam = mockCamera(35);
    setPanningEnabled(cam, true);
    expect(cam.panningSensibility).toBeGreaterThan(0);
    expect(cam.panningSensibility).toBe(computePanningSensibility(cam));
  });

  it('enabled=false → panningSensibility = 0 (focus 비활성, followObserver 충돌 회피)', () => {
    const cam = mockCamera(35);
    setPanningEnabled(cam, true);
    setPanningEnabled(cam, false);
    expect(cam.panningSensibility).toBe(0);
  });

  it('줌 일관성 — radius 변동 후 재호출 시 sensibility 재산출 (진입 시점 잔존 방지)', () => {
    const cam = mockCamera(35);
    setPanningEnabled(cam, true);
    const before = cam.panningSensibility;
    cam.radius = 350; // 줌아웃 시뮬
    setPanningEnabled(cam, true); // onBeforeRender 매 프레임 재호출 모사
    expect(cam.panningSensibility).not.toBe(before);
    expect(cam.panningSensibility).toBeCloseTo(before / 10, 6);
  });
});
