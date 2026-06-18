import type { SimulationCore } from '@astro-simulator/core';
import { useSimStore } from '@/store/sim-store';

/**
 * Core 이벤트를 Zustand store에 연결하는 어댑터.
 * Core는 store를 직접 알지 못한다 — 이 모듈이 유일한 다리.
 *
 * 반환값은 cleanup 함수. 컴포넌트 언마운트 시 호출.
 */
export function attachCoreToStore(core: SimulationCore): () => void {
  const store = useSimStore.getState();

  const onEngineReady = ({ renderer }: { renderer: 'webgpu' | 'webgl2' }) => {
    store.setRenderer(renderer);
    store.setEngineError(null);
  };

  const onError = ({ message }: { message: string }) => {
    store.setEngineError(message);
  };

  const onTimeChanged = ({ julianDate }: { julianDate: number }) => {
    store.setTime(julianDate);
  };

  const onBodySelected = ({ id }: { id: string | null }) => {
    store.setSelectedBody(id);
  };

  // #509 / #699 — 자유시점 진입. simulation-core enterFreeFly case 는 'freeFlyEntered' 만 emit
  // (후행 'bodySelected:null' 은 #699 D-T2 회귀 fix 로 제거 — 그것이 freeFlyMode 를 false 로
  // 덮어써 탐색 버튼 command 경로에서 free-fly 가 reset 으로 되돌아갔다).
  // store.enterFreeFly() 가 {selectedBodyId:null, freeFlyMode:true} 를 단일 set 으로 commit.
  const onFreeFlyEntered = () => {
    store.enterFreeFly();
  };

  const onTimeScaleChanged = ({ scale }: { scale: number }) => {
    store.setTimeScale(scale);
  };

  const onFps = ({ fps }: { fps: number }) => {
    store.setFps(fps);
  };

  core.on('engineReady', onEngineReady);
  core.on('error', onError);
  core.on('timeChanged', onTimeChanged);
  core.on('bodySelected', onBodySelected);
  core.on('freeFlyEntered', onFreeFlyEntered);
  core.on('timeScaleChanged', onTimeScaleChanged);
  core.on('performance', onFps);

  return () => {
    core.off('engineReady', onEngineReady);
    core.off('error', onError);
    core.off('timeChanged', onTimeChanged);
    core.off('bodySelected', onBodySelected);
    core.off('freeFlyEntered', onFreeFlyEntered);
    core.off('timeScaleChanged', onTimeScaleChanged);
    core.off('performance', onFps);
  };
}
