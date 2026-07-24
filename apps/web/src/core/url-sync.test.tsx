import { render, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoreCommand } from '@astro-simulator/shared';
import type * as AstroCore from '@astro-simulator/core';
import { useSimStore } from '@/store/sim-store';

/**
 * #415 — url-sync R-Phase Allowlist 가드 단위 테스트 (DoD-3).
 * #419 — race fallback 제거 단위 테스트 갱신 (DoD-4).
 *
 * ADR: docs/decisions/20260504-415-url-sync-guard.md §결정 1 (옵션 B) + §결정 4 (단위 테스트 매트릭스).
 *      docs/decisions/20260510-419-sim-canvas-mount-race.md §결정 3-2 (라운드 2 합의 DoD-4 보강).
 *
 * 검증 매트릭스 (R4 #532 — earth + moon 진입 후):
 *   1. ?focus=sun       → sendCommand({type:'focusOn',bodyId:'sun'}) 1회 (R1 정상 회귀 보호)
 *   2. ?focus=jupiter   → sendCommand(focusOn) 0회 + console.warn 1회 (R-Phase 미진입)
 *   3. ?focus=invalid   → sendCommand(focusOn) 0회 + console.warn 1회 (알 수 없는 body id) — 기존 가드 회귀 보호
 *   4. ?focus=null      → sendCommand(focusOn) 0회 + console.warn 0회
 *   5. ?focus=sun → setSelectedBody 직접 호출 0회 (#419 race fallback 부재 검증)
 *   6. ?focus=earth     → sendCommand({type:'focusOn',bodyId:'earth'}) 1회 (R4 #532 정상 진입)
 *   7. ?focus=moon      → sendCommand({type:'focusOn',bodyId:'moon'}) 1회 (R4 #532 satellite 첫 본 사례)
 *
 * #419 §결정 3-2 변경점:
 *   - 케이스 1~3 (sun/mercury/venus) 의 selectedBodyId 단언 → sendCommand 호출 단언으로 격상
 *     (mock 환경에서는 setSelectedBody 직접 호출 경로가 부재하므로 selectedBodyId 단언 불가;
 *      e2e 검증은 browser-verify-r-phase-allowlist.mjs 시나리오 4-B 가 담당)
 *   - 신규 케이스 5: setSelectedBody spy 단언 (race fallback 부재 검증, event 단일 진실원)
 *
 * cross-validate 보강 (§결정 4 보강):
 *   - vi.spyOn(console, 'warn') 단언 의무 — 진단 기능 dev 환경 작동 보장
 *   - 메시지 매칭: /R-Phase 미진입/ (R10b #664 — halley positive 전환 후 vi.mock 부분 mock 승계,
 *     ADR 20260612-r10b §축 5 ②) / /알 수 없는 body id/ (invalid — 가상 ID 도 본 분기로 빠짐)
 *
 * mock 전략:
 *   - nuqs `useQueryState` 를 vi.mock 으로 가로채 [urlFocus, setter] 반환
 *   - sim-context `useSimCommand` 를 vi.mock 으로 가로채 sentCommands 누적 (mock 이 항상 non-null core 시뮬)
 *   - useSimStore 는 실제 store 사용 (setSelectedBody spy 호출 추적)
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

// R10b #664 — R-Phase 미진입 분기 negative 를 vi.mock 부분 mock 으로 승계 (ADR 20260612-r10b §축 5 ②).
// phase 11 진입으로 미진입 실데이터 body 0 → url-sync 의 "R-Phase 미진입" 분기는 실데이터 +
// allowlist 외 동시 요구 (데이터 존재 검사 선행 — url-sync.tsx, 가상 ID 는 "알 수 없는 body id"
// 분기로 빠져 도달 불가). isRPhaseFocusable 만 지정 body 에 false 반환 (importOriginal partial
// mock — 시그니처 drift 시 타입 에러 fail-fast), 나머지 실모듈 passthrough.
// mock drift 위험은 membership 가드 가상 ID 실모듈 테스트 (r-phase-allowlist.test.ts /
// simulation-core 가드) + filterBodiesByPhase 순수 함수 경계 테스트가 직교 커버 (ADR §위험 #5).
const rPhaseMock = vi.hoisted(() => ({ disabledIds: [] as string[] }));
vi.mock('@astro-simulator/core', async (importOriginal) => {
  const actual = await importOriginal<typeof AstroCore>();
  return {
    ...actual,
    isRPhaseFocusable: (bodyId: string | null | undefined) =>
      typeof bodyId === 'string' && rPhaseMock.disabledIds.includes(bodyId)
        ? false
        : actual.isRPhaseFocusable(bodyId),
  };
});

// 동적 import — vi.mock 등록 후 평가되도록.
const { UrlSync } = await import('./url-sync');

beforeEach(() => {
  sentCommands = [];
  mockUrlFocus = null;
  rPhaseMock.disabledIds = []; // 기본 passthrough (실모듈) — disabled 계약 테스트만 개별 지정
  useSimStore.setState({
    rendererKind: null,
    engineError: null,
    mode: 'observe',
    julianDate: null,
    selectedBodyId: null,
    timeScale: 86_400,
    physicsEngine: 'kepler',
    fps: null,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('UrlSync — ?focus= R-Phase Allowlist 가드 (#415)', () => {
  // #419 §결정 3-2 — selectedBodyId 단언 → sendCommand 단언으로 격상.
  // mock 환경에서는 setSelectedBody 직접 호출 경로 부재 (#419 §결정 2 race fallback 제거 후).
  // e2e 검증 (selectedBodyId 박힘) 은 browser-verify-r-phase-allowlist.mjs 시나리오 4-B 담당.
  it('?focus=sun → sendCommand(focusOn, sun) 1회 (R1 정상 동작 회귀 보호, #419 §결정 3-2)', () => {
    mockUrlFocus = 'sun';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<UrlSync />);

    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'sun' });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('?focus=mercury → sendCommand(focusOn, mercury) 1회 (R2 회귀 보호, #419 §결정 3-2)', () => {
    mockUrlFocus = 'mercury';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<UrlSync />);

    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'mercury' });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('?focus=venus → sendCommand(focusOn, venus) 1회 (R3 회귀 보호, #419 §결정 3-2)', () => {
    mockUrlFocus = 'venus';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<UrlSync />);

    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'venus' });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  // #419 §결정 3-2 — DoD-4 (race fallback 부재 검증) 신규 케이스.
  it('?focus=sun → sendCommand 1회 + setSelectedBody 직접 호출 0회 (race fallback 제거 검증, #419 §결정 2)', () => {
    mockUrlFocus = 'sun';
    const setSelectedBodySpy = vi.spyOn(useSimStore.getState(), 'setSelectedBody');

    render(<UrlSync />);

    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'sun' });
    // race fallback 제거 — url-sync 가 setSelectedBody 직접 호출 0회 (event 단일 진실원).
    expect(setSelectedBodySpy).not.toHaveBeenCalled();
  });

  it('?focus=earth → sendCommand({type:"focusOn",bodyId:"earth"}) 1회 (R4 #532 정상 진입)', () => {
    mockUrlFocus = 'earth';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<UrlSync />);

    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'earth' });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('?focus=moon → sendCommand({type:"focusOn",bodyId:"moon"}) 1회 (R4 #532 satellite 첫 본 사례)', () => {
    mockUrlFocus = 'moon';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<UrlSync />);

    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'moon' });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('?focus=jupiter → R6 #621 진입 body 정상 진입 — sendCommand(focusOn) 1회 + console.warn 0회 (회귀 보호)', () => {
    // R6 #621 — jupiter 가 allowlist 에 진입하여 URL 직접 진입이 정상 동작 (이전 R5 까지는 차단 negative 케이스).
    mockUrlFocus = 'jupiter';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<UrlSync />);

    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'jupiter' });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('?focus=neptune → focusOn 발행 (R9 #653 진입 — 차단 → 허용 전환)', () => {
    mockUrlFocus = 'neptune';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<UrlSync />);

    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'neptune' });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('?focus=triton → focusOn 발행 (R9 #653 — 역행 위성 첫 사례, URL-only 진입 경로)', () => {
    mockUrlFocus = 'triton';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<UrlSync />);

    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'triton' });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('?focus=pluto → focusOn 발행 (R10a #659 — 왜소행성 진입, negative → positive 전환)', () => {
    mockUrlFocus = 'pluto';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<UrlSync />);

    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'pluto' });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('?focus=halley → focusOn 발행 (R10b #664 진입 — 차단 → 허용 전환, 역행 혜성 첫 사례)', () => {
    mockUrlFocus = 'halley';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<UrlSync />);

    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'halley' });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('?focus=halley + isRPhaseFocusable mock false → sendCommand 0회 + console.warn(R-Phase 미진입) — UI 계약 mock 승계 (ADR §축 5 ②)', () => {
    // R10b #664 — phase 11 진입으로 미진입 실데이터 0. "R-Phase 미진입" 분기는 실데이터 +
    // allowlist 외 동시 요구 (가상 ID 는 데이터 존재 검사 선행으로 도달 불가) → vi.mock 부분
    // mock 으로 "isRPhaseFocusable=false 일 때 차단 + warn" 이라는 UI 계약 자체를 영구 검증.
    rPhaseMock.disabledIds = ['halley'];
    mockUrlFocus = 'halley';
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
