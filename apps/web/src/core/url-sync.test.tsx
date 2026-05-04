import { render, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoreCommand } from '@astro-simulator/shared';
import { useSimStore } from '@/store/sim-store';

/**
 * #415 — url-sync R-Phase Allowlist 가드 단위 테스트 (DoD-3).
 *
 * ADR: docs/decisions/20260504-415-url-sync-guard.md §결정 1 (옵션 B) + §결정 4 (단위 테스트 매트릭스).
 *
 * 검증 매트릭스:
 *   1. ?focus=sun       → setSelectedBody('sun') 1회 + sendCommand({type:'focusOn',bodyId:'sun'}) 1회
 *   2. ?focus=earth     → setSelectedBody 0회 + sendCommand(focusOn) 0회 + console.warn 1회 (R-Phase 미진입)
 *   3. ?focus=invalid   → setSelectedBody 0회 + sendCommand(focusOn) 0회 + console.warn 1회 (알 수 없는 body id) — 기존 가드 회귀 보호
 *   4. ?focus=null      → 둘 다 0회 + console.warn 0회
 *
 * cross-validate 보강 (§결정 4 보강):
 *   - vi.spyOn(console, 'warn') 단언 의무 — 진단 기능 dev 환경 작동 보장
 *   - 메시지 매칭: /R-Phase 미진입/ (earth) / /알 수 없는 body id/ (invalid)
 *
 * mock 전략:
 *   - nuqs `useQueryState` 를 vi.mock 으로 가로채 [urlFocus, setter] 반환
 *   - sim-context `useSimCommand` 를 vi.mock 으로 가로채 sentCommands 누적
 *   - useSimStore 는 실제 store 사용 (setSelectedBody 호출 추적)
 */

// nuqs mock — useQueryState 호출 순서:
//   1. mode  2. t  3. focus  4. speed  5. engine  6. lod
// 본 테스트는 focus 만 가변, 나머지는 null 고정.
let mockUrlFocus: string | null = null;

vi.mock('nuqs', () => ({
  useQueryState: vi.fn((key: string) => {
    if (key === 'focus') {
      return [mockUrlFocus, vi.fn()];
    }
    return [null, vi.fn()];
  }),
  // parser 들은 .withOptions() 체이닝만 흉내내고 실 사용 0 (mock 이 무시).
  parseAsString: { withOptions: () => ({}) },
  parseAsFloat: { withOptions: () => ({}) },
  parseAsStringEnum: () => ({ withOptions: () => ({}) }),
}));

// sim-context mock — sendCommand 호출 추적.
let sentCommands: CoreCommand[] = [];
vi.mock('@/core/sim-context', () => ({
  useSimCommand: () => (cmd: CoreCommand) => {
    sentCommands.push(cmd);
  },
}));

// 동적 import — vi.mock 등록 후 평가되도록.
const { UrlSync } = await import('./url-sync');

beforeEach(() => {
  sentCommands = [];
  mockUrlFocus = null;
  useSimStore.setState({
    rendererKind: null,
    engineError: null,
    mode: 'observe',
    julianDate: null,
    selectedBodyId: null,
    timeScale: 86_400,
    physicsEngine: 'kepler',
    fps: null,
    unitSystem: 'astro',
    pingCount: 0,
    lastPingAt: null,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('UrlSync — ?focus= R-Phase Allowlist 가드 (#415)', () => {
  it('?focus=sun → setSelectedBody("sun") + sendCommand(focusOn, sun) (R1 정상 동작 회귀 보호)', () => {
    mockUrlFocus = 'sun';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<UrlSync />);

    expect(useSimStore.getState().selectedBodyId).toBe('sun');
    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'sun' });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('?focus=mercury → setSelectedBody("mercury") + sendCommand(focusOn, mercury) (R2 회귀 보호)', () => {
    mockUrlFocus = 'mercury';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<UrlSync />);

    expect(useSimStore.getState().selectedBodyId).toBe('mercury');
    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'mercury' });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('?focus=venus → setSelectedBody("venus") + sendCommand(focusOn, venus) (R3 회귀 보호)', () => {
    mockUrlFocus = 'venus';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<UrlSync />);

    expect(useSimStore.getState().selectedBodyId).toBe('venus');
    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'venus' });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('?focus=earth → setSelectedBody 0회 + sendCommand(focusOn) 0회 + console.warn(R-Phase 미진입) (가드 핵심)', () => {
    mockUrlFocus = 'earth';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<UrlSync />);

    expect(useSimStore.getState().selectedBodyId).toBeNull();
    expect(sentCommands.filter((c) => c.type === 'focusOn')).toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/R-Phase 미진입/);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/sun, mercury, venus/);
  });

  it('?focus=jupiter → setSelectedBody 0회 + sendCommand(focusOn) 0회 + console.warn(R-Phase 미진입)', () => {
    mockUrlFocus = 'jupiter';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<UrlSync />);

    expect(useSimStore.getState().selectedBodyId).toBeNull();
    expect(sentCommands.filter((c) => c.type === 'focusOn')).toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/R-Phase 미진입/);
  });

  it('?focus=neptune → setSelectedBody 0회 + sendCommand(focusOn) 0회 + console.warn(R-Phase 미진입)', () => {
    mockUrlFocus = 'neptune';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<UrlSync />);

    expect(useSimStore.getState().selectedBodyId).toBeNull();
    expect(sentCommands.filter((c) => c.type === 'focusOn')).toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/R-Phase 미진입/);
  });

  it('?focus=invalid → setSelectedBody 0회 + sendCommand(focusOn) 0회 + console.warn(알 수 없는 body id) — 기존 R1 가드 회귀 보호', () => {
    mockUrlFocus = 'invalid-body-id';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<UrlSync />);

    expect(useSimStore.getState().selectedBodyId).toBeNull();
    expect(sentCommands.filter((c) => c.type === 'focusOn')).toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/알 수 없는 body id/);
  });

  it('?focus=null → setSelectedBody 0회 + sendCommand(focusOn) 0회 + console.warn 0회 (URL 미지정)', () => {
    mockUrlFocus = null;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<UrlSync />);

    expect(useSimStore.getState().selectedBodyId).toBeNull();
    expect(sentCommands.filter((c) => c.type === 'focusOn')).toEqual([]);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
