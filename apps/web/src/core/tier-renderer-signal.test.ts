/**
 * #1435 — tier 판정용 렌더러 신호 단위 테스트 (ADR 20261118-1435 §5 구현 DoD 5).
 *
 * 하드웨어 WebGL2 tier 판정의 함정 (판독 불가가 하드웨어로 접히는 것 — cross-validate 합의 1) 을
 * 여기서 잠근다. CI 브라우저 가드는 swiftshader 라 UNMASKED 가 항상 값을 주므로 폴백 · 판독 불가
 * 경로에 도달하지 않는다 — 이 파일이 그 경로의 유일한 증거다.
 *
 * 범위: 아래 DoD 5 describe 는 `sim-canvas.tsx` `resolveGpuTier` 가 부르는 합성 함수
 * `resolveTierRendererIsSoftware` 를 **그대로** 거친다 (PR #1440 리뷰 권고 1 — 종전에는 테스트 안에
 * 합성 사본을 두어 호출부 합성 변이를 못 잡았다). 호출부가 이 함수 대신 **다른 함수를 부르는** 변이
 * (예: `detectSoftwareRenderer`) 는 여전히 이 파일 밖이다 — 호출부를 1줄로 줄여 그 표면을 좁혔을 뿐이다.
 */
import { describe, expect, it, vi } from 'vitest';
import { detectGpuTier, type GpuDetectionInput } from './detect-gpu-tier';
import {
  classifyRendererSoftware,
  EMPTY_WEBGL_RENDERER_READOUT,
  readWebglRendererStrings,
  resolveTierRendererIsSoftware,
  selectTierRendererString,
  type WebglRendererSource,
} from './tier-renderer-signal';

const SWIFTSHADER =
  'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)';
const ANGLE_METAL = 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)';

const RENDERER = 0x1f01;
const UNMASKED_RENDERER_WEBGL = 0x9246;

/** gl 목 — `extension` 이 `null` 이면 확장 부재. 값은 pname 별로 주입한다. */
function mockGl(options: { extension: boolean; unmasked?: unknown; renderer?: unknown }): {
  gl: WebglRendererSource;
  getParameter: ReturnType<typeof vi.fn>;
} {
  const getParameter = vi.fn((pname: number) => {
    if (pname === UNMASKED_RENDERER_WEBGL) return options.unmasked;
    if (pname === RENDERER) return options.renderer;
    return null;
  });
  const gl: WebglRendererSource = {
    RENDERER,
    getExtension: () => (options.extension ? { UNMASKED_RENDERER_WEBGL } : null),
    getParameter,
  };
  return { gl, getParameter };
}

const DESKTOP_NAV = {
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36',
  maxTouchPoints: 0,
};

/** WebGPU 미지원 데스크톱 — 렌더러 신호만 바꿔 끼운다. */
function webgl2Desktop(rendererIsSoftware: boolean | null): GpuDetectionInput {
  return {
    webgpu: { supported: false, adapterInfo: null },
    rendererIsSoftware,
    hardwareConcurrency: 10,
    navigator: DESKTOP_NAV,
  };
}

describe('classifyRendererSoftware — 3상태 (판독 불가를 하드웨어로 접지 않는다)', () => {
  it('null → null (판독 불가)', () => {
    expect(classifyRendererSoftware(null)).toBeNull();
  });

  it('undefined → null (판독 불가)', () => {
    expect(classifyRendererSoftware(undefined)).toBeNull();
  });

  it("'' → null (판독 불가 — detectSoftwareRenderer('') 의 false 와 다르다)", () => {
    expect(classifyRendererSoftware('')).toBeNull();
  });

  it('SwiftShader 문자열 → true', () => {
    expect(classifyRendererSoftware(SWIFTSHADER)).toBe(true);
  });

  it('ANGLE Metal 문자열 → false', () => {
    expect(classifyRendererSoftware(ANGLE_METAL)).toBe(false);
  });
});

describe('readWebglRendererStrings — Q2 (c) 폴백 문자열 선택', () => {
  it('확장 있음 → UNMASKED 값 · gl.RENDERER 는 읽지 않는다', () => {
    const { gl, getParameter } = mockGl({
      extension: true,
      unmasked: ANGLE_METAL,
      renderer: 'WebKit WebGL',
    });
    const readout = readWebglRendererStrings(gl);
    expect(readout).toEqual({ unmasked: ANGLE_METAL, basic: null });
    expect(selectTierRendererString(readout)).toBe(ANGLE_METAL);
    expect(getParameter).not.toHaveBeenCalledWith(RENDERER);
  });

  it('확장 없음 → gl.RENDERER 값', () => {
    const { gl } = mockGl({ extension: false, renderer: ANGLE_METAL });
    const readout = readWebglRendererStrings(gl);
    expect(readout).toEqual({ unmasked: null, basic: ANGLE_METAL });
    expect(selectTierRendererString(readout)).toBe(ANGLE_METAL);
  });

  it('확장은 있으나 값이 빈 문자열 → gl.RENDERER 로 다시 읽는다', () => {
    const { gl } = mockGl({ extension: true, unmasked: '', renderer: ANGLE_METAL });
    expect(selectTierRendererString(readWebglRendererStrings(gl))).toBe(ANGLE_METAL);
  });

  it('둘 다 없음 → null', () => {
    const { gl } = mockGl({ extension: false, renderer: null });
    expect(selectTierRendererString(readWebglRendererStrings(gl))).toBeNull();
  });

  it('둘 다 빈 문자열 → null', () => {
    const { gl } = mockGl({ extension: true, unmasked: '', renderer: '' });
    expect(selectTierRendererString(readWebglRendererStrings(gl))).toBeNull();
  });

  it('문자열이 아닌 값은 판독 불가로 본다', () => {
    const { gl } = mockGl({ extension: true, unmasked: 42, renderer: undefined });
    expect(selectTierRendererString(readWebglRendererStrings(gl))).toBeNull();
  });

  it('컨텍스트 생성 실패 (gl = null) → 양쪽 null', () => {
    expect(readWebglRendererStrings(null)).toEqual({ unmasked: null, basic: null });
    expect(selectTierRendererString(EMPTY_WEBGL_RENDERER_READOUT)).toBeNull();
  });
});

describe('#1435 구현 DoD 5 — 렌더러 판독 3상태 → WebGPU 미지원 데스크톱 tier', () => {
  /** sim-canvas `resolveGpuTier` 와 같은 합성 — gl → 문자열 → 3상태 → tier. */
  /** sim-canvas `resolveGpuTier` 와 **같은 함수** — gl → 판독 → `resolveTierRendererIsSoftware` → tier. */
  function tierFromGl(gl: WebglRendererSource | null) {
    return detectGpuTier(
      webgl2Desktop(resolveTierRendererIsSoftware(readWebglRendererStrings(gl))),
    );
  }

  it('resolveTierRendererIsSoftware — 3상태를 그대로 돌려준다 (판독 불가 → null)', () => {
    expect(resolveTierRendererIsSoftware(EMPTY_WEBGL_RENDERER_READOUT)).toBeNull();
    expect(resolveTierRendererIsSoftware({ unmasked: SWIFTSHADER, basic: null })).toBe(true);
    expect(resolveTierRendererIsSoftware({ unmasked: null, basic: ANGLE_METAL })).toBe(false);
    expect(resolveTierRendererIsSoftware({ unmasked: '', basic: '' })).toBeNull();
  });

  it('소프트웨어 문자열 → c', () => {
    expect(tierFromGl(mockGl({ extension: true, unmasked: SWIFTSHADER }).gl)).toBe('c');
  });

  it('하드웨어 문자열 → b', () => {
    expect(tierFromGl(mockGl({ extension: true, unmasked: ANGLE_METAL }).gl)).toBe('b');
  });

  it('확장 없음 + gl.RENDERER 하드웨어 문자열 → b', () => {
    expect(tierFromGl(mockGl({ extension: false, renderer: ANGLE_METAL }).gl)).toBe('b');
  });

  it('확장 없음 + gl.RENDERER 소프트웨어 문자열 → c', () => {
    expect(tierFromGl(mockGl({ extension: false, renderer: SWIFTSHADER }).gl)).toBe('c');
  });

  it('둘 다 판독 불가 (null) → c', () => {
    expect(tierFromGl(mockGl({ extension: false, renderer: null }).gl)).toBe('c');
  });

  it('둘 다 판독 불가 (빈 문자열) → c', () => {
    expect(tierFromGl(mockGl({ extension: true, unmasked: '', renderer: '' }).gl)).toBe('c');
  });

  it('컨텍스트 생성 실패 → c', () => {
    expect(tierFromGl(null)).toBe('c');
  });
});
