import { Color4, Scene } from '@babylonjs/core';
import type { CoreCommand, CoreEvents } from '@astro-simulator/shared';
import mitt, { type Emitter, type Handler } from 'mitt';
import { createEngine, type CreatedEngine, type EngineKind } from './engine-factory.js';

/**
 * 시뮬레이션 코어 — Babylon 엔진/씬 소유 + 이벤트 버스.
 *
 * - UI 프레임워크 의존성 없음
 * - 캔버스 엘리먼트 하나만 받아 모든 동작을 담당
 * - dispose()로 완전한 정리 가능 (React StrictMode 이중 마운트 대응)
 * - 외부와의 통신은 이벤트(emit) + 명령(command) 2축으로만 노출
 */
export class SimulationCore {
  #canvas: HTMLCanvasElement;
  #created: CreatedEngine | null = null;
  #scene: Scene | null = null;
  #resizeObserver: ResizeObserver | null = null;
  #disposed = false;
  #emitter: Emitter<CoreEvents> = mitt<CoreEvents>();

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

  /** 이벤트 구독. */
  on<K extends keyof CoreEvents>(type: K, handler: Handler<CoreEvents[K]>): void {
    this.#emitter.on(type, handler);
  }

  /** 이벤트 구독 해제. */
  off<K extends keyof CoreEvents>(type: K, handler: Handler<CoreEvents[K]>): void {
    this.#emitter.off(type, handler);
  }

  /** UI → Core 명령 발행. 미지원 명령은 무시된다 (향후 확장 대비). */
  command(cmd: CoreCommand): void {
    if (this.#disposed) return;
    switch (cmd.type) {
      // P1에서는 아직 실제 명령 처리가 없다 — B2에서는 라운드트립만 검증.
      // C5 (#17)에서 시간 명령, C6 (#18)에서 카메라 명령이 추가된다.
      default:
        console.warn('[SimulationCore] 미지원 명령:', cmd);
    }
  }

  /** 엔진 초기화 + 기본 씬 생성 + 렌더 루프 시작. */
  async start(): Promise<void> {
    if (this.#disposed) {
      throw new Error('SimulationCore가 이미 dispose되었습니다.');
    }
    if (this.#created) return;

    try {
      this.#created = await createEngine(this.#canvas);
    } catch (error) {
      this.#emitter.emit('error', {
        message: '엔진 초기화에 실패했습니다.',
        cause: error,
      });
      throw error;
    }

    const { engine, kind } = this.#created;
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.031, 0.035, 0.051, 1);
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

    this.#emitter.emit('engineReady', { renderer: kind });
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

    this.#emitter.all.clear();
  }
}
