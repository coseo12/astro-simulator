/**
 * #849 — engine-factory webgpu→webgl2 fallback 분기 테스트.
 *
 * createEngine 의 분기 (ADR docs/phases/architecture.md §6 "WebGPU-first + WebGL2 폴백"):
 *  (1) navigator/gpu 부재 → webgl2 (WebGPUEngine 생성 시도 자체가 없어야 함)
 *  (2) requestAdapter null/throw → webgl2 (헤드리스 브라우저 경로)
 *  (3) adapter 존재 → webgpu + timestamp-query feature 조건부 요청 (P4-D #166)
 *  (4) adapter 존재 but initAsync 실패 → console.warn + webgl2 폴백 (catch 분기)
 *
 * @babylonjs/core 는 vi.mock 으로 전면 대체 (SSR 격리 — Babylon import 그래프가 실 엔진/
 * WebGL 컨텍스트를 요구하므로 node 환경에서 생성자 관측용 스텁으로 치환).
 * navigator 모킹은 gpu/capability.test.ts 의 defineProperty 패턴 동형.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const { engineCtorSpy, webgpuCtorSpy, initAsyncMock } = vi.hoisted(() => ({
  engineCtorSpy: vi.fn(),
  webgpuCtorSpy: vi.fn(),
  initAsyncMock: vi.fn(),
}));

vi.mock('@babylonjs/core', () => {
  class Engine {
    constructor(...args: unknown[]) {
      engineCtorSpy(...args);
    }
  }
  class WebGPUEngine {
    initAsync = initAsyncMock;
    constructor(...args: unknown[]) {
      webgpuCtorSpy(...args);
    }
  }
  return { Engine, WebGPUEngine };
});

import { createEngine } from './engine-factory.js';

// gpu/capability.test.ts 동형 — Node 21+ 는 전역 navigator 가 실존하므로 defineProperty 로 교체.
const setNavigator = (value: unknown) => {
  Object.defineProperty(globalThis, 'navigator', {
    value,
    configurable: true,
    writable: true,
  });
};

const canvas = {} as HTMLCanvasElement;

afterEach(() => {
  setNavigator(undefined);
  vi.clearAllMocks();
});

describe('#849 createEngine — WebGL2 폴백 분기 (WebGPU 사전 판별 실패)', () => {
  it('navigator 부재 → webgl2 (WebGPUEngine 생성 시도 없음)', async () => {
    setNavigator(undefined);
    const created = await createEngine(canvas);
    expect(created.kind).toBe('webgl2');
    expect(webgpuCtorSpy).not.toHaveBeenCalled();
    // Engine(canvas, antialias=true, opts) 시그니처 + 옵션 계약 핀.
    expect(engineCtorSpy).toHaveBeenCalledTimes(1);
    expect(engineCtorSpy).toHaveBeenCalledWith(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      adaptToDeviceRatio: true,
    });
  });

  it('navigator.gpu 미노출 → webgl2', async () => {
    setNavigator({});
    const created = await createEngine(canvas);
    expect(created.kind).toBe('webgl2');
    expect(webgpuCtorSpy).not.toHaveBeenCalled();
  });

  it('requestAdapter null (헤드리스 브라우저) → webgl2', async () => {
    setNavigator({ gpu: { requestAdapter: vi.fn().mockResolvedValue(null) } });
    const created = await createEngine(canvas);
    expect(created.kind).toBe('webgl2');
    expect(webgpuCtorSpy).not.toHaveBeenCalled();
  });

  it('requestAdapter throw → webgl2 (사전 판별 catch)', async () => {
    setNavigator({ gpu: { requestAdapter: vi.fn().mockRejectedValue(new Error('boom')) } });
    const created = await createEngine(canvas);
    expect(created.kind).toBe('webgl2');
    expect(webgpuCtorSpy).not.toHaveBeenCalled();
  });
});

describe('#849 createEngine — WebGPU 경로 + timestamp-query 조건부 feature', () => {
  it('adapter 존재 (feature 없음) → webgpu + requiredFeatures 빈 배열', async () => {
    setNavigator({
      gpu: { requestAdapter: vi.fn().mockResolvedValue({ features: [] }) },
    });
    initAsyncMock.mockResolvedValue(undefined);
    const created = await createEngine(canvas);
    expect(created.kind).toBe('webgpu');
    expect(engineCtorSpy).not.toHaveBeenCalled();
    expect(webgpuCtorSpy).toHaveBeenCalledTimes(1);
    expect(webgpuCtorSpy).toHaveBeenCalledWith(canvas, {
      antialias: true,
      stencil: true,
      adaptToDeviceRatio: true,
      deviceDescriptor: { requiredFeatures: [] },
    });
    expect(initAsyncMock).toHaveBeenCalledTimes(1);
  });

  it('adapter 가 timestamp-query 지원 → requiredFeatures 에 포함 (P4-D #166)', async () => {
    setNavigator({
      gpu: {
        requestAdapter: vi.fn().mockResolvedValue({ features: ['timestamp-query'] }),
      },
    });
    initAsyncMock.mockResolvedValue(undefined);
    const created = await createEngine(canvas);
    expect(created.kind).toBe('webgpu');
    expect(webgpuCtorSpy).toHaveBeenCalledWith(
      canvas,
      expect.objectContaining({
        deviceDescriptor: { requiredFeatures: ['timestamp-query'] },
      }),
    );
  });

  it('adapter 존재 but initAsync 실패 → console.warn + webgl2 폴백 (catch 분기)', async () => {
    setNavigator({
      gpu: { requestAdapter: vi.fn().mockResolvedValue({ features: [] }) },
    });
    initAsyncMock.mockRejectedValue(new Error('device lost'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const created = await createEngine(canvas);
    expect(created.kind).toBe('webgl2');
    expect(webgpuCtorSpy).toHaveBeenCalledTimes(1); // 시도는 했고
    expect(engineCtorSpy).toHaveBeenCalledTimes(1); // 폴백으로 WebGL2 생성
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('WebGL2로 폴백'),
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });
});
