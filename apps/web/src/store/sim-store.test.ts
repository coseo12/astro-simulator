import { beforeEach, describe, expect, it } from 'vitest';
import { useSimStore } from './sim-store';

// 각 테스트 간 상태 격리
beforeEach(() => {
  useSimStore.setState({
    rendererKind: null,
    engineError: null,
    engineNotice: null,
    dismissedNoticeKeys: new Set<string>(),
    mode: 'observe',
    julianDate: null,
    selectedBodyId: null,
    timeScale: 86_400,
    fps: null,
    unitSystem: 'astro',
    physicsEngine: 'kepler',
    massMultipliers: {},
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

  it('setMassMultiplier — 설정·삭제·리셋', () => {
    const { setMassMultiplier, resetMassMultipliers } = useSimStore.getState();
    setMassMultiplier('jupiter', 5);
    expect(useSimStore.getState().massMultipliers).toEqual({ jupiter: 5 });
    setMassMultiplier('earth', 2);
    expect(useSimStore.getState().massMultipliers).toEqual({ jupiter: 5, earth: 2 });
    setMassMultiplier('jupiter', 1); // 1.0은 삭제
    expect(useSimStore.getState().massMultipliers).toEqual({ earth: 2 });
    resetMassMultipliers();
    expect(useSimStore.getState().massMultipliers).toEqual({});
  });

  it('engineError — 에러 문자열 설정/클리어', () => {
    useSimStore.getState().setEngineError('WebGPU 실패');
    expect(useSimStore.getState().engineError).toBe('WebGPU 실패');
    useSimStore.getState().setEngineError(null);
    expect(useSimStore.getState().engineError).toBeNull();
  });

  // P7-D #209 — engineNotice key 분리 dismiss 동작
  describe('engineNotice (P7-D #209 key-scoped dismiss)', () => {
    it('setEngineNotice — 객체 구조로 설정/클리어', () => {
      useSimStore.getState().setEngineNotice({ key: 'webgpu-fallback', message: 'WebGPU 미지원' });
      const notice = useSimStore.getState().engineNotice;
      expect(notice).toEqual({ key: 'webgpu-fallback', message: 'WebGPU 미지원' });
      useSimStore.getState().setEngineNotice(null);
      expect(useSimStore.getState().engineNotice).toBeNull();
    });

    it('dismissEngineNotice — 현재 알림 해제 + dismiss key 기억', () => {
      useSimStore.getState().setEngineNotice({ key: 'webgpu-fallback', message: 'A' });
      useSimStore.getState().dismissEngineNotice();
      expect(useSimStore.getState().engineNotice).toBeNull();
      expect(useSimStore.getState().dismissedNoticeKeys.has('webgpu-fallback')).toBe(true);
    });

    it('이미 dismiss한 key의 재표시 요청은 무시 (세션 한정)', () => {
      useSimStore.getState().setEngineNotice({ key: 'webgpu-fallback', message: 'A' });
      useSimStore.getState().dismissEngineNotice();
      // 같은 key로 재요청 → no-op
      useSimStore.getState().setEngineNotice({ key: 'webgpu-fallback', message: 'A2' });
      expect(useSimStore.getState().engineNotice).toBeNull();
    });

    it('서로 다른 key는 독립 관리 — 하나 dismiss 후 다른 key는 정상 표시', () => {
      useSimStore.getState().setEngineNotice({ key: 'webgpu-fallback', message: 'A' });
      useSimStore.getState().dismissEngineNotice();
      // 모바일 경고는 별도 key → 정상 표시 가능해야 한다.
      useSimStore.getState().setEngineNotice({ key: 'mobile-webgpu-best-effort', message: 'B' });
      expect(useSimStore.getState().engineNotice).toEqual({
        key: 'mobile-webgpu-best-effort',
        message: 'B',
      });
    });
  });
});
