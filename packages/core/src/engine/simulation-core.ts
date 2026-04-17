import { Color4, Scene } from '@babylonjs/core';
import { EngineInstrumentation } from '@babylonjs/core/Instrumentation/engineInstrumentation.js';
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
  // P5-B #177 — fps emit 주기 제어. 매 프레임 emit하면 store 갱신 과다 → 0.5초 간격.
  #lastFpsEmitTime = 0;
  // P4-D #166 — GPU frame time (ms 단위) 직접 측정. 미지원 환경에서는 null.
  #instrumentation: EngineInstrumentation | null = null;

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

  /**
   * P4-D #166 — GPU frame time 측정 활성화.
   *
   * WebGPU: `timestamp-query` feature 지원 필요. 미지원 어댑터는 Babylon이 조용히 비활성화하므로
   *         `readGpuFrameTimeMs()`가 계속 null을 반환한다.
   * WebGL2: `EXT_disjoint_timer_query_webgl2` 캡 필요. Babylon이 자동 감지.
   *
   * 오버헤드: 드라이버에 따라 1~3% — 프로덕션 기본 off, bench/개발 모드에서만 enable.
   */
  enableGpuTimer(): boolean {
    if (this.#disposed) return false;
    if (this.#instrumentation) return true;
    if (!this.#created) return false;
    const hasTimerCap = (this.#created.engine.getCaps() as { timerQuery?: unknown }).timerQuery;
    if (!hasTimerCap) return false;
    const instrumentation = new EngineInstrumentation(this.#created.engine);
    instrumentation.captureGPUFrameTime = true;
    // P5-C #179 — ComputeShader별 gpuTimeInFrame 활성화. 이 플래그가 없으면
    // ComputeShader 인스턴스에 WebGPUPerfCounter가 생성되지 않는다.
    const eng = this.#created.engine as { enableGPUTimingMeasurements?: boolean };
    if ('enableGPUTimingMeasurements' in eng) {
      eng.enableGPUTimingMeasurements = true;
    }
    this.#instrumentation = instrumentation;
    return true;
  }

  /**
   * P4-D #166 — 디버그용 원시 카운터 상태. 테스트/bench에서 측정 실패 원인 진단.
   */
  debugGpuTimer(): {
    instrumentation: boolean;
    timerQueryCap: unknown;
    captureGPU: boolean;
    current: number | null;
    average: number | null;
    lastSecAverage: number | null;
    count: number | null;
  } {
    const inst = this.#instrumentation;
    const caps = (this.#created?.engine.getCaps() ?? {}) as { timerQuery?: unknown };
    if (!inst) {
      return {
        instrumentation: false,
        timerQueryCap: caps.timerQuery ?? null,
        captureGPU: false,
        current: null,
        average: null,
        lastSecAverage: null,
        count: null,
      };
    }
    const c = inst.gpuFrameTimeCounter;
    return {
      instrumentation: true,
      timerQueryCap: caps.timerQuery ?? null,
      captureGPU: inst.captureGPUFrameTime,
      current: c.current,
      average: c.average,
      lastSecAverage: c.lastSecAverage,
      count: c.count,
    };
  }

  /**
   * 최근 GPU frame time (ms). enableGpuTimer 미호출 또는 미지원 시 null.
   * Babylon은 ns 단위로 반환 — ms 변환 후 노출.
   *
   * lastSecAverage는 1초 평균이라 초기 진입 직후(<1s)에는 0일 수 있어 `average` 또는
   * `current`로 폴백한다. 이들 중 첫 번째 양수 값을 사용.
   */
  readGpuFrameTimeMs(): number | null {
    if (!this.#instrumentation) return null;
    const counter = this.#instrumentation.gpuFrameTimeCounter;
    const candidates = [counter.lastSecAverage, counter.average, counter.current];
    for (const ns of candidates) {
      if (Number.isFinite(ns) && ns > 0) return ns / 1_000_000;
    }
    return null;
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

      // P5-B #177 — 0.5초마다 fps emit (Babylon engine.getFps() 사용).
      if (now - this.#lastFpsEmitTime > 500) {
        this.#lastFpsEmitTime = now;
        this.#emitter.emit('performance', { fps: engine.getFps() });
      }
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

    this.#instrumentation?.dispose();
    this.#instrumentation = null;

    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;

    this.#scene?.dispose();
    this.#scene = null;

    this.#created?.engine.dispose();
    this.#created = null;

    this.#emitter.all.clear();
  }
}
