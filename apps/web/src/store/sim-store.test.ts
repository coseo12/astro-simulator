import { beforeEach, describe, expect, it } from 'vitest';
import { useSimStore } from './sim-store';

// 각 테스트 간 상태 격리
beforeEach(() => {
  useSimStore.setState({
    rendererKind: null,
    engineError: null,
    mode: 'observe',
    julianDate: null,
    selectedBodyId: null,
    timeScale: 86_400,
    fps: null,
    unitSystem: 'astro',
    physicsEngine: 'kepler',
    pingCount: 0,
    lastPingAt: null,
  });
});

describe('useSimStore', () => {
  it('초기 상태 — observe 모드, 1일/초 스케일', () => {
    const s = useSimStore.getState();
    expect(s.mode).toBe('observe');
    expect(s.timeScale).toBe(86_400);
    expect(s.rendererKind).toBeNull();
    expect(s.unitSystem).toBe('astro');
  });

  it('setRenderer', () => {
    useSimStore.getState().setRenderer('webgpu');
    expect(useSimStore.getState().rendererKind).toBe('webgpu');
  });

  it('setMode', () => {
    useSimStore.getState().setMode('research');
    expect(useSimStore.getState().mode).toBe('research');
  });

  it('setTime', () => {
    useSimStore.getState().setTime(2_460_000);
    expect(useSimStore.getState().julianDate).toBe(2_460_000);
  });

  it('setSelectedBody — null 허용', () => {
    useSimStore.getState().setSelectedBody('jupiter');
    expect(useSimStore.getState().selectedBodyId).toBe('jupiter');
    useSimStore.getState().setSelectedBody(null);
    expect(useSimStore.getState().selectedBodyId).toBeNull();
  });

  it('setTimeScale — 음수 허용 (역행)', () => {
    useSimStore.getState().setTimeScale(-86_400);
    expect(useSimStore.getState().timeScale).toBe(-86_400);
  });

  it('setUnitSystem — 3가지 단위계', () => {
    const { setUnitSystem } = useSimStore.getState();
    setUnitSystem('si');
    expect(useSimStore.getState().unitSystem).toBe('si');
    setUnitSystem('natural');
    expect(useSimStore.getState().unitSystem).toBe('natural');
  });

  it('incrementPing — 카운터 증가 + 타임스탬프 기록', () => {
    const before = Date.now();
    useSimStore.getState().incrementPing();
    const s = useSimStore.getState();
    expect(s.pingCount).toBe(1);
    expect(s.lastPingAt).toBeGreaterThanOrEqual(before);
  });

  it('setPhysicsEngine — Kepler ↔ Newton 토글', () => {
    expect(useSimStore.getState().physicsEngine).toBe('kepler');
    useSimStore.getState().setPhysicsEngine('newton');
    expect(useSimStore.getState().physicsEngine).toBe('newton');
    useSimStore.getState().setPhysicsEngine('kepler');
    expect(useSimStore.getState().physicsEngine).toBe('kepler');
  });

  it('engineError — 에러 문자열 설정/클리어', () => {
    useSimStore.getState().setEngineError('WebGPU 실패');
    expect(useSimStore.getState().engineError).toBe('WebGPU 실패');
    useSimStore.getState().setEngineError(null);
    expect(useSimStore.getState().engineError).toBeNull();
  });
});
