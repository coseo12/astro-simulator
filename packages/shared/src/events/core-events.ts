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

  /**
   * #509 — 자유시점 (free-fly) 진입.
   *
   * `bodySelected: null` (resetCamera 경로) 과 구분된 별도 event.
   * focus tracking 만 해제 + 카메라 alpha/beta/radius/target/tier 모두 보존 의도.
   *
   * UI 진입: shortcut bar "탐색" 버튼 or Esc 단축키 → sendCommand({type:'enterFreeFly'}).
   * 어댑터 측에서 store.setFreeFlyMode(true) + selectedBodyId=null 동반 처리.
   */
  freeFlyEntered: Record<string, never>;

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
 *
 * P11-B #289 — `setLodOverride` 추가. URL `?lod=` 초기 1회 전달 용도.
 * `level` 은 `'high' | 'mid' | 'low' | 'auto'`. scene 내부에서 override 로 저장되어
 * 다음 `updateAt` 호출부터 LOD 분기에 적용된다.
 *
 * #688 — `setOrbitLinesVisible` 추가. 궤도선 런타임 토글 (UI 버튼 + URL `?orbits=off` 초기값).
 * `visible` true/false. scene `setOrbitLinesVisible` (satellite 일반화 #627) 로 위임.
 */
export type CoreCommand =
  | { type: 'setTimeScale'; scale: number }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'jumpToDate'; isoUtc: string }
  | { type: 'jumpToJulianDate'; julianDate: number }
  | { type: 'focusOn'; bodyId: string }
  | { type: 'resetCamera' }
  | { type: 'enterFreeFly' }
  | { type: 'setCameraRadius'; radius: number }
  | { type: 'setMode'; mode: SimMode }
  | { type: 'setLodOverride'; level: 'high' | 'mid' | 'low' | 'auto' }
  | { type: 'setOrbitLinesVisible'; visible: boolean };
