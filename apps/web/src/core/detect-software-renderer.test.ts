/**
 * #745 — `detectSoftwareRenderer` 단위 테스트.
 *
 * 핵심 Behavior: CI swiftshader (정확한 실측 문자열) → true / 하드웨어 GPU (Apple/NVIDIA/Intel)
 * → false / 빈 문자열·null·undefined → false. 본 테스트가 fps-baseline-guard 무회귀의 1차
 * 가드 — CI software 미감지 시 별이 켜져 fps 회귀 재발 (가장 큰 위험).
 *
 * 가드 PR DoD 3중 시뮬: (1) CI 문자열 true (positive) → (2) 하드웨어 false (negative) →
 * (3) 빈 문자열/`"software"` 단독 false (recovery — false positive 차단).
 */

import { describe, expect, it } from 'vitest';
import { detectSoftwareRenderer } from './detect-software-renderer';

describe('detectSoftwareRenderer — 소프트웨어 렌더러 감지 (ADR §Amendment 2, #745)', () => {
  // ── (1) 소프트웨어 렌더러 → true (positive) ────────────────────────────────
  describe('소프트웨어 렌더러 → true', () => {
    // CI 핵심 제약: fps-baseline-guard / r1-guard 가 도는 정확한 swiftshader 실측 문자열.
    // 본 단언이 fail 시 CI 에서 별이 켜져 fps 회귀 재발 (가장 큰 위험).
    it('CI swiftshader 실측 문자열 → true (fps 무회귀 핵심 제약)', () => {
      expect(
        detectSoftwareRenderer(
          'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)',
        ),
      ).toBe(true);
    });
    it('llvmpipe (Mesa 소프트웨어 래스터라이저) → true', () => {
      expect(detectSoftwareRenderer('llvmpipe (LLVM 12.0.0, 256 bits)')).toBe(true);
    });
    it('swrast (Mesa/X11 소프트웨어) → true', () => {
      expect(detectSoftwareRenderer('Mesa OffScreen rendering (swrast)')).toBe(true);
    });
    it('Microsoft Basic Render Driver → true', () => {
      expect(
        detectSoftwareRenderer('ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11)'),
      ).toBe(true);
    });
    it('Apple Software Renderer → true', () => {
      expect(detectSoftwareRenderer('Apple Software Renderer')).toBe(true);
    });
    it('software rasterizer (명시 구절) → true', () => {
      expect(detectSoftwareRenderer('Generic Software Rasterizer')).toBe(true);
    });
    it('대소문자 무시 — "SWIFTSHADER" → true', () => {
      expect(detectSoftwareRenderer('SWIFTSHADER')).toBe(true);
    });
  });

  // ── (2) 하드웨어 GPU → false (negative) ────────────────────────────────────
  describe('하드웨어 GPU → false', () => {
    // WebGPU-enabled 실측 (Apple M1 Pro) — software 아님 → 별 표시 (회귀 해소).
    it('Apple M1 Pro (실측 WebGL UNMASKED) → false', () => {
      expect(
        detectSoftwareRenderer(
          'ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)',
        ),
      ).toBe(false);
    });
    it('NVIDIA RTX (discrete GPU) → false', () => {
      expect(
        detectSoftwareRenderer(
          'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)',
        ),
      ).toBe(false);
    });
    it('Intel Iris (integrated GPU) → false', () => {
      expect(
        detectSoftwareRenderer('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11, D3D11)'),
      ).toBe(false);
    });
    it('AMD Radeon → false', () => {
      expect(
        detectSoftwareRenderer(
          'ANGLE (AMD, AMD Radeon RX 6800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
        ),
      ).toBe(false);
    });
  });

  // ── (3) 불확실 / 빈 문자열 / false positive 차단 → false (recovery) ─────────
  describe('불확실 / 빈 문자열 → false (보수적 — 별 표시 유지)', () => {
    it('null → false', () => {
      expect(detectSoftwareRenderer(null)).toBe(false);
    });
    it('undefined → false', () => {
      expect(detectSoftwareRenderer(undefined)).toBe(false);
    });
    it('빈 문자열 → false', () => {
      expect(detectSoftwareRenderer('')).toBe(false);
    });
    // `"software"` 단독은 false positive 위험으로 의도적 제외 (가상화 게스트 드라이버 등).
    it('"software" 단독 단어 포함 → false (false positive 차단)', () => {
      expect(detectSoftwareRenderer('ACME Hardware GPU with software fallback queue')).toBe(false);
    });
  });
});
