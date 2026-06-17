import { Color4, Scene } from '@babylonjs/core';
import { EngineInstrumentation } from '@babylonjs/core/Instrumentation/engineInstrumentation.js';
import { J2000_JD } from '@astro-simulator/shared';
import type { CoreCommand, CoreEvents } from '@astro-simulator/shared';
import mitt, { type Emitter, type Handler } from 'mitt';
import { TimeController } from '../time/time-controller.js';
import { isoToJulianDate } from '../time/julian-date.js';
import { createEngine, type CreatedEngine, type EngineKind } from './engine-factory.js';
// #402 — R-Phase Body Allowlist 가드 (defense-in-depth scene 측면).
// ADR `20260504-r-phase-allowlist-guard.md` §결정 3.
import { isRPhaseFocusable } from '../scene/r-phase-allowlist.js';

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
  // R1 #334+#335 — store-scene 동기화 단일 경로 통합 (ADR `20260425-r1-store-scene-sync-unification.md`).
  // focus / resetCamera 콜백은 폐기 — UI 가 store `selectedBodyId` 변화를 subscribe 하여 단일 책임.
  // `setCameraRadius` 콜백만 유지 (programmatic 카메라 줌 — `setCameraRadius` command 경유).
  #setRadiusHandler: ((radius: number) => void) | null = null;
  // P11-B #289 — LOD override 핸들러. URL `?lod=` 초기 1회 sendCommand 에서 scene 에 전달.
  #setLodOverrideHandler: ((level: 'high' | 'mid' | 'low' | 'auto') => void) | null = null;
  // #688 — 궤도선 가시성 핸들러. UI 토글 버튼 + URL `?orbits=off` 초기값에서 scene 에 전달.
  #setOrbitLinesVisibleHandler: ((visible: boolean) => void) | null = null;
  // P5-B #177 — fps emit 주기 제어. 매 프레임 emit하면 store 갱신 과다 → 0.5초 간격.
  #lastFpsEmitTime = 0;
  // P4-D #166 — GPU frame time (ms 단위) 직접 측정. 미지원 환경에서는 null.
  #instrumentation: EngineInstrumentation | null = null;

  /**
   * #444 — 운영 계측 메트릭. tier transition 윈도우에서 사용자 입력 시도 카운트 등.
   *
   * G8b (input 큐잉) 격상 결정 데이터 — 일정 운영 후 분포 관찰 → 평균 drop/분/사용자가
   * 임계 이상이면 G8b 도입 정당화. 본 카운터는 누적 (페이지 reload 시 0 으로 리셋).
   *
   * 접근: `window.__simCore.metrics.tierTransitionInputDrops`.
   */
  readonly metrics = {
    tierTransitionInputDrops: 0,
  };

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

  /**
   * R1 #334+#335 — 카메라 반지름 핸들러 연결 (`setCameraRadius` command 경유).
   *
   * ADR `20260425-r1-store-scene-sync-unification.md` §결정 1~3 — focus/resetCamera 콜백은 폐기되고
   * UI 가 store `selectedBodyId` 변화를 subscribe 하여 scene focus / 카메라 reset 을 단일 책임으로 처리.
   * 본 핸들러는 `setCameraRadius` programmatic 줌 (예: 향후 줌 슬라이더) 경로 보존용.
   *
   * 이전 시그니처 `setCameraHandlers(focusOn, resetCamera, setRadius)` 는 본 PR (#344) 에서 제거.
   */
  setCameraRadiusHandler(setRadius: (radius: number) => void): void {
    this.#setRadiusHandler = setRadius;
  }

  /**
   * P11-B #289 — LOD override 핸들러 연결. sim-canvas 가 scene 생성 직후 1회 호출.
   *
   * 핸들러는 scene 의 `setLodOverride(level)` 를 호출해 override 를 반영한다. URL `?lod=high|mid|low`
   * 면 전 body 강제, `auto` (또는 미호출) 면 거리 자동 판정.
   */
  setLodOverrideHandler(handler: (level: 'high' | 'mid' | 'low' | 'auto') => void): void {
    this.#setLodOverrideHandler = handler;
  }

  /**
   * #688 — 궤도선 가시성 핸들러 연결. sim-canvas 가 scene 생성 직후 1회 호출.
   *
   * 핸들러는 scene 의 `setOrbitLinesVisible(visible)` 를 호출해 행성+위성 궤도선 (satellite
   * 일반화 #627) 을 일괄 토글한다. `setLodOverrideHandler` 패턴 답습 — UI 버튼 토글과
   * URL `?orbits=off` 초기값 모두 `setOrbitLinesVisible` command 를 경유해 여기로 라우팅된다.
   */
  setOrbitLinesVisibleHandler(handler: (visible: boolean) => void): void {
    this.#setOrbitLinesVisibleHandler = handler;
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
        // R1 #334+#335 — focusOn 콜백 폐기. event emit 만으로 store sync (core-adapter → setSelectedBody)
        // → sim-canvas subscribe 분기가 scene focus / camera 단일 책임으로 처리.
        // ADR `20260425-r1-store-scene-sync-unification.md` §결정 1.
        //
        // #402 R-Phase Allowlist 가드 (defense-in-depth scene 측면) —
        // ADR `20260504-r-phase-allowlist-guard.md` §결정 3.
        // UI 가드 우회 (URL `?focus=earth` 직접 진입 / 외부 commander 등) 차단.
        // bodyId === null 은 resetCamera 경로이므로 isRPhaseFocusable 이 true 반환.
        if (!isRPhaseFocusable(cmd.bodyId)) {
          console.warn(
            `[SimulationCore] focusOn rejected — body "${cmd.bodyId}" not in R_PHASE_BODY_ALLOWLIST. ` +
              `현재 활성 body 만 focus 가능 (ADR 20260504-r-phase-allowlist-guard.md).`,
          );
          break;
        }
        this.#emitter.emit('bodySelected', { id: cmd.bodyId });
        break;
      case 'resetCamera':
        // R1 #334+#335 — resetCamera 콜백 폐기. event emit 으로 selectedBodyId=null sync 트리거.
        this.#emitter.emit('bodySelected', { id: null });
        break;
      case 'enterFreeFly':
        // #509 — 자유시점 진입. bodySelected:null (resetCamera) 과 구분 — focus tracking 만
        // 해제 + 카메라 시점 (alpha/beta/radius/target/tier) 보존.
        //
        // #699 D-T2 회귀 fix — freeFlyEntered 만 emit. 후행 bodySelected:null 제거.
        // 근거: 어댑터의 store.enterFreeFly() action 이 {selectedBodyId:null, freeFlyMode:true}
        // 를 단일 set 으로 commit 하므로 selectedBodyId sync 는 bodySelected:null 없이 충족된다.
        // focus tracking 해제는 sim-canvas subscribe 의 detachToFreeFly(solar.detachFocus) 담당.
        // 후행 bodySelected:null 은 어댑터 setSelectedBody(null) 가 freeFlyMode 를 false 로 강제
        // (sim-store §509) → 방금 set 한 freeFlyMode:true 를 덮어쓰는 잉여이자 회귀원이었다
        // (탐색 버튼 command 경로에서 free-fly 가 reset 으로 되돌아감). 제거로 1-emit 단일화.
        this.#emitter.emit('freeFlyEntered', {});
        break;
      case 'setCameraRadius':
        this.#setRadiusHandler?.(cmd.radius);
        break;
      case 'setMode':
        this.#emitter.emit('modeChanged', { mode: cmd.mode });
        break;
      case 'setLodOverride':
        // P11-B #289 — scene 에 위임. 미등록 시 no-op (scene 초기화 전 순서 무관).
        this.#setLodOverrideHandler?.(cmd.level);
        break;
      case 'setOrbitLinesVisible':
        // #688 — scene 에 위임. 미등록 시 no-op (scene 초기화 전 순서 무관 — setLodOverride 동일).
        this.#setOrbitLinesVisibleHandler?.(cmd.visible);
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
