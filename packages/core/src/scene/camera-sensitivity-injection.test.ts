/**
 * #704 — free-fly 감도 계수 동적 주입 회귀 가드 (camera.ts 순수 로직).
 *
 * ADR `docs/decisions/20260618-704-freefly-sensitivity-settings-ui.md` §결정 1 (축 1-A 경로별 최소 침습).
 *
 * 검증 대상 (Babylon 엔진/WebGL 불필요 — 실 Observable/Vector3 + duck-typed 카메라·엔진 모킹):
 *  - attachWasdControl getCoefficients getter pull (매 프레임 최신값 반영 — 키 hold 중 변경 즉시 반영)
 *  - getter 미전달 시 const default (WASD_DELTA_PERCENTAGE / MAX_MOVE_STEP) — SSoT 보존, 기존 호환
 *  - getter NaN/0/음수 방어 → default 폴백 (silent 흡수 아님, 산식 분모 안전)
 *  - computePanningSensibility / setPanningEnabled pct 인자 (사용자 감도 주입 + zero-division 가드)
 */
import { describe, it, expect } from 'vitest';
import {
  WASD_DELTA_PERCENTAGE,
  MAX_MOVE_STEP,
  PANNING_DELTA_PERCENTAGE,
  attachWasdControl,
  computePanningSensibility,
  setPanningEnabled,
  type WasdCoefficients,
} from './camera.js';
// #849 — 키보드 씬 하니스/mockCamera 는 공용 헬퍼로 추출 (SUT 배선은 본 파일 책임 — volt #120).
import { makeKeyboardSceneHarness, mockArcRotateCamera } from './__test-utils__/babylon-mocks.js';

/** #704 — getCoefficients getter 를 주입할 수 있는 WASD 모킹 (mutable coeffs 로 매 프레임 변경 모사). */
function makeWasdHarness(opts: {
  radius?: number;
  deltaTimeMs?: number;
  getCoefficients?: () => WasdCoefficients;
}) {
  const h = makeKeyboardSceneHarness({
    radius: opts.radius,
    deltaTimeMs: opts.deltaTimeMs ?? 1000 / 60,
  });
  const handle = attachWasdControl(h.camera, h.scene, opts.getCoefficients);
  handle.setEnabled(true);
  return { camera: h.camera, press: h.press, frame: h.frame, handle };
}

describe('#704 WASD getCoefficients getter 주입 (축 1-A pull)', () => {
  it('getter 미전달 → const default (WASD_DELTA_PERCENTAGE) 적용 (기존 호환)', () => {
    // 60fps 정규화 계수 1 → step = radius × WASD_DELTA_PERCENTAGE = 200 × 0.015 = 3.0.
    const h = makeWasdHarness({ radius: 200 });
    h.press('w');
    h.frame();
    expect(h.camera.target.z).toBeCloseTo(200 * WASD_DELTA_PERCENTAGE, 5);
  });

  it('getter wasd 값 적용 → step = radius × wasd (default 와 다른 값 반영)', () => {
    const h = makeWasdHarness({
      radius: 200,
      getCoefficients: () => ({ wasd: 0.03, maxStep: MAX_MOVE_STEP }),
    });
    h.press('w');
    h.frame();
    // 200 × 0.03 = 6.0 (default 0.015 의 2배).
    expect(h.camera.target.z).toBeCloseTo(6.0, 5);
  });

  it('매 프레임 getter pull — 키 hold 중 wasd 변경 시 다음 프레임 즉시 반영 (스냅샷 아님)', () => {
    let wasd = 0.015;
    const h = makeWasdHarness({
      radius: 200,
      getCoefficients: () => ({ wasd, maxStep: MAX_MOVE_STEP }),
    });
    h.press('w');
    h.frame();
    const move1 = h.camera.target.z; // 200 × 0.015 = 3.0.
    // 키 hold 유지(release 안 함) + 계수만 변경 → 다음 프레임 새 값 반영.
    wasd = 0.045;
    h.frame();
    const move2 = h.camera.target.z - move1; // 200 × 0.045 = 9.0.
    expect(move1).toBeCloseTo(3.0, 5);
    expect(move2).toBeCloseTo(9.0, 5);
  });

  it('getter maxStep 적용 → 큰 radius 에서 사용자 maxStep 으로 clamp', () => {
    const h = makeWasdHarness({
      radius: 158386,
      getCoefficients: () => ({ wasd: 0.015, maxStep: 5 }),
    });
    h.press('w');
    h.frame();
    // 158386 × 0.015 = 2375.79 → maxStep 5 로 clamp (default 10 아님).
    expect(h.camera.target.z).toBeCloseTo(5, 4);
  });

  it('getter NaN/0/음수 wasd → default 폴백 (산식 분모 안전, silent 흡수 아님)', () => {
    for (const bad of [Number.NaN, 0, -0.01, Number.POSITIVE_INFINITY]) {
      const h = makeWasdHarness({
        radius: 200,
        getCoefficients: () => ({ wasd: bad, maxStep: MAX_MOVE_STEP }),
      });
      h.press('w');
      h.frame();
      // 손상값 → WASD_DELTA_PERCENTAGE 폴백 → 200 × 0.015 = 3.0.
      expect(h.camera.target.z).toBeCloseTo(200 * WASD_DELTA_PERCENTAGE, 5);
    }
  });
});

describe('#704 패닝 pct 인자 주입 (축 1-A)', () => {
  it('pct 미전달 → PANNING_DELTA_PERCENTAGE default (기존 호환)', () => {
    const sDefault = computePanningSensibility(mockArcRotateCamera({ radius: 35 }));
    const sExplicit = computePanningSensibility(
      mockArcRotateCamera({ radius: 35 }),
      PANNING_DELTA_PERCENTAGE,
    );
    expect(sDefault).toBeCloseTo(sExplicit, 9);
  });

  it('pct 2배 → sensibility 절반 (사용자 감도 ↑ = 화면 px↔world 이동량 ↑)', () => {
    // sensibility = REFERENCE / (radius × pct) → pct↑ → sensibility↓ → 1px drag world 이동량↑.
    const sLow = computePanningSensibility(mockArcRotateCamera({ radius: 35 }), 0.01);
    const sHigh = computePanningSensibility(mockArcRotateCamera({ radius: 35 }), 0.02);
    expect(sHigh).toBeCloseTo(sLow / 2, 6);
  });

  it('pct NaN/0/음수 → default 폴백 (zero-division 발산 차단)', () => {
    for (const bad of [Number.NaN, 0, -0.01]) {
      const s = computePanningSensibility(mockArcRotateCamera({ radius: 35 }), bad);
      const sDefault = computePanningSensibility(
        mockArcRotateCamera({ radius: 35 }),
        PANNING_DELTA_PERCENTAGE,
      );
      expect(Number.isFinite(s)).toBe(true);
      expect(s).toBeCloseTo(sDefault, 9);
    }
  });

  it('setPanningEnabled(true, pct) → 사용자 감도 반영 / false → 0 (focus 비활성)', () => {
    const cam = mockArcRotateCamera({ radius: 35 });
    setPanningEnabled(cam, true, 0.02);
    expect(cam.panningSensibility).toBeCloseTo(computePanningSensibility(cam, 0.02), 6);
    setPanningEnabled(cam, false, 0.02);
    expect(cam.panningSensibility).toBe(0);
  });
});
