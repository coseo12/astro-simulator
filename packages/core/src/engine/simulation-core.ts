import { Color4, Scene } from '@babylonjs/core';
import { createEngine, type CreatedEngine, type EngineKind } from './engine-factory.js';

/**
 * 시뮬레이션 코어 — Babylon 엔진/씬을 소유하고 렌더 루프를 관리한다.
 *
 * - UI 프레임워크 의존성 없음
 * - 캔버스 엘리먼트 하나만 받아 모든 동작을 담당
 * - dispose()로 완전한 정리 가능 (React StrictMode 이중 마운트 대응)
 *
 * B2 (#9)에서 mitt 이벤트 버스를 추가한다.
 */
export class SimulationCore {
  #canvas: HTMLCanvasElement;
  #created: CreatedEngine | null = null;
  #scene: Scene | null = null;
  #resizeObserver: ResizeObserver | null = null;
  #disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.#canvas = canvas;
  }

  get engine(): CreatedEngine['engine'] | null {
    return this.#created?.engine ?? null;
  }

  get scene(): Scene | null {
    return this.#scene;
  }

  get rendererKind(): EngineKind | null {
    return this.#created?.kind ?? null;
  }

  get disposed(): boolean {
    return this.#disposed;
  }

  /** 엔진 초기화 + 기본 씬 생성 + 렌더 루프 시작. */
  async start(): Promise<void> {
    if (this.#disposed) {
      throw new Error('SimulationCore가 이미 dispose되었습니다.');
    }
    if (this.#created) return;

    this.#created = await createEngine(this.#canvas);
    const { engine } = this.#created;

    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.031, 0.035, 0.051, 1); // bg-base
    this.#scene = scene;

    engine.runRenderLoop(() => {
      if (this.#disposed) return;
      scene.render();
    });

    this.#resizeObserver = new ResizeObserver(() => {
      if (this.#disposed) return;
      engine.resize();
    });
    this.#resizeObserver.observe(this.#canvas);
  }

  /** 완전 정리 — 캔버스 외부 자원 모두 해제. */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;

    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;

    this.#scene?.dispose();
    this.#scene = null;

    this.#created?.engine.dispose();
    this.#created = null;
  }
}
