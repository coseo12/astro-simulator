import type { SimMode } from '../types/mode.js';

/**
 * Core → UI 이벤트 타입 맵.
 * SimulationCore가 mitt emitter로 방출하며, UI 어댑터가 구독하여
 * Zustand store에 전달한다.
 */
export type CoreEvents = {
  /** 현재 시각이 변경됨 (Julian Date 기준) */
  timeChanged: { julianDate: number };

  /** 천체가 선택됨 */
  bodySelected: { id: string | null };

  /** 시뮬레이터 모드가 변경됨 */
  modeChanged: { mode: SimMode };

  /** 시간 속도 배율이 변경됨 (초당 시뮬 시간[s]) */
  timeScaleChanged: { scale: number };

  /** 카메라 위치 변경 (월드 좌표 [m]) */
  cameraMoved: { position: [number, number, number]; target: [number, number, number] };

  /** 프레임 성능 메트릭 (1초 단위 등) */
  performance: { fps: number };

  /** 엔진 초기화 상태 */
  engineReady: { renderer: 'webgpu' | 'webgl2' };

  /** 에러 발생 */
  error: { message: string; cause?: unknown };
};

/**
 * UI → Core 명령 판별식 유니온.
 */
export type CoreCommand =
  | { type: 'setTimeScale'; scale: number }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'jumpToDate'; isoUtc: string }
  | { type: 'jumpToJulianDate'; julianDate: number }
  | { type: 'focusOn'; bodyId: string }
  | { type: 'resetCamera' }
  | { type: 'setMode'; mode: SimMode };
