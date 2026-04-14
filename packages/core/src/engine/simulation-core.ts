import { Color4, Scene } from '@babylonjs/core';
import { J2000_JD } from '@astro-simulator/shared';
import type { CoreCommand, CoreEvents } from '@astro-simulator/shared';
import mitt, { type Emitter, type Handler } from 'mitt';
import { TimeController } from '../time/time-controller.js';
import { isoToJulianDate } from '../time/julian-date.js';
import { createEngine, type CreatedEngine, type EngineKind } from './engine-factory.js';

/**
 * 시뮬레이션 코어 — Babylon 엔진/씬 + 시간 컨트롤러 + 이벤트 버스.
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
  #time: TimeController;
  #lastFrameTime: number | null = null;
  #focusOnHandler: ((bodyId: string) => void) | null = null;
  #resetCameraHandler: (() => void) | null = null;
  #setRadiusHandler: ((radius: number) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.#canvas = canvas;
    this.#time = new TimeController(J2000_JD, 86_400);
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

  get time(): TimeController {
    return this.#time;
  }

  /** 카메라 명령 핸들러 연결 — C6 CameraController와 연결 */
  setCameraHandlers(
    focusOn: (bodyId: string) => void,
    resetCamera: () => void,
    setRadius?: (radius: number) => void,
  ): void {
    this.#focusOnHandler = focusOn;
    this.#resetCameraHandler = resetCamera;
    this.#setRadiusHandler = setRadius ?? null;
  }

  /** 이벤트 구독. */
  on<K extends keyof CoreEvents>(type: K, handler: Handler<CoreEvents[K]>): void {
    this.#emitter.on(type, handler);
  }

  /** 이벤트 구독 해제. */
  off<K extends keyof CoreEvents>(type: K, handler: Handler<CoreEvents[K]>): void {
    this.#emitter.off(type, handler);
  }

  /** UI → Core 명령 발행. */
  command(cmd: CoreCommand): void {
    if (this.#disposed) return;
    switch (cmd.type) {
      case 'play':
        this.#time.play();
        break;
      case 'pause':
        this.#time.pause();
        break;
      case 'setTimeScale':
        this.#time.setScale(cmd.scale);
        this.#emitter.emit('timeScaleChanged', { scale: cmd.scale });
        break;
      case 'jumpToDate': {
        const jd = isoToJulianDate(cmd.isoUtc);
        this.#time.setJulianDate(jd);
        this.#emitter.emit('timeChanged', { julianDate: jd });
        break;
      }
      case 'jumpToJulianDate':
        this.#time.setJulianDate(cmd.julianDate);
        this.#emitter.emit('timeChanged', { julianDate: cmd.julianDate });
        break;
      case 'focusOn':
        this.#focusOnHandler?.(cmd.bodyId);
        this.#emitter.emit('bodySelected', { id: cmd.bodyId });
        break;
      case 'resetCamera':
        this.#resetCameraHandler?.();
        this.#emitter.emit('bodySelected', { id: null });
        break;
      case 'setCameraRadius':
        this.#setRadiusHandler?.(cmd.radius);
        break;
      case 'setMode':
        this.#emitter.emit('modeChanged', { mode: cmd.mode });
        break;
      default: {
        const _exhaustive: never = cmd;
        console.warn('[SimulationCore] 미지원 명령:', _exhaustive);
      }
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
      // 프레임 델타 계산 (초)
      const now = performance.now();
      const dt = this.#lastFrameTime === null ? 0 : (now - this.#lastFrameTime) / 1000;
      this.#lastFrameTime = now;

      // 시간 진행 + 변경 시 이벤트
      if (this.#time.tick(dt)) {
        this.#emitter.emit('timeChanged', { julianDate: this.#time.julianDate });
      }

      scene.render();
    });

    this.#resizeObserver = new ResizeObserver(() => {
      if (this.#disposed) return;
      engine.resize();
    });
    this.#resizeObserver.observe(this.#canvas);

    this.#emitter.emit('engineReady', { renderer: kind });
    // 초기 시각도 알림
    this.#emitter.emit('timeChanged', { julianDate: this.#time.julianDate });
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
