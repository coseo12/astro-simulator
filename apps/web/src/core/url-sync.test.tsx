import { act, render, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoreCommand } from '@astro-simulator/shared';
import type * as AstroCore from '@astro-simulator/core';
import { useSimStore } from '@/store/sim-store';
import { useTourStore } from '@/store/tour-store';

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
//   1. mode  2. t  3. focus  4. speed  5. engine  6. lod  7. ruler (#1341 PR2)
// 본 테스트는 focus · ruler 가 가변 (ruler 는 setter 도 추적), 나머지는 null 고정. mock 은 호출 순서가 아니라 키로 분기한다.
let mockUrlFocus: string | null = null;
let mockUrlRuler: string | null = null;
const setUrlRulerMock = vi.fn();
// #1381 — `t` 는 값 · setter 둘 다 추적한다 (일시정지 중 store → URL).
let mockUrlT: number | null = null;
const setUrlTMock = vi.fn();
// #1390 — 투어 · 단계 (원문 문자열). 나머지 키 (mode · speed) 는 값을 바꿔 가며 「건너뛰기」 를 본다.
let mockUrlTour: string | null = null;
let mockUrlStep: string | null = null;
let mockUrlMode: string | null = null;
let mockUrlSpeed: number | null = null;
const setUrlTourMock = vi.fn();
const setUrlStepMock = vi.fn();

vi.mock('nuqs', () => ({
  useQueryState: vi.fn((key: string) => {
    if (key === 'focus') {
      return [mockUrlFocus, vi.fn()];
    }
    if (key === 'ruler') {
      return [mockUrlRuler, setUrlRulerMock];
    }
    if (key === 't') {
      return [mockUrlT, setUrlTMock];
    }
    if (key === 'tour') return [mockUrlTour, setUrlTourMock];
    if (key === 'step') return [mockUrlStep, setUrlStepMock];
    if (key === 'mode') return [mockUrlMode, vi.fn()];
    if (key === 'speed') return [mockUrlSpeed, vi.fn()];
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
const { UrlSync, pausedUrlTime } = await import('./url-sync');
const { useQueryState } = await import('nuqs');

beforeEach(() => {
  sentCommands = [];
  mockUrlFocus = null;
  mockUrlRuler = null;
  setUrlRulerMock.mockReset();
  mockUrlT = null;
  setUrlTMock.mockReset();
  mockUrlTour = null;
  mockUrlStep = null;
  mockUrlMode = null;
  mockUrlSpeed = null;
  setUrlTourMock.mockReset();
  setUrlStepMock.mockReset();
  useTourStore.getState().reset();
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
    rulerAnchorId: null,
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

describe('UrlSync — ?ruler= 거리 자 기준점 (#1341 PR2 결정 R7)', () => {
  it('?ruler=earth → store rulerAnchorId = earth · 명령 직접 발행 0 (선은 sim-canvas 구독이 보낸다)', () => {
    mockUrlRuler = 'earth';
    render(<UrlSync />);
    expect(useSimStore.getState().rulerAnchorId).toBe('earth');
    expect(sentCommands.filter((c) => c.type === 'setRuler')).toEqual([]);
  });

  it('?ruler=nope → 무시 + console.warn + URL 키 제거', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockUrlRuler = 'nope';
    render(<UrlSync />);
    expect(useSimStore.getState().rulerAnchorId).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/\?ruler=nope/));
    expect(setUrlRulerMock).toHaveBeenCalledWith(null);
  });

  it('store → URL — 기준점 설정 · 해제가 URL 키에 반영된다', () => {
    render(<UrlSync />);
    setUrlRulerMock.mockClear();
    act(() => {
      useSimStore.getState().setRulerAnchor('mars');
    });
    expect(setUrlRulerMock).toHaveBeenLastCalledWith('mars');
    act(() => {
      useSimStore.getState().setRulerAnchor(null);
    });
    expect(setUrlRulerMock).toHaveBeenLastCalledWith(null);
  });
});

/** #1381 — 사건 시각 (1902-05-07 일식 근방). 값 자체는 임의 — J2000 이 아니면 된다. */
const EVENT_JD = 2_415_876.5432109876;
const J2000 = 2_451_545.0;

describe('UrlSync — ?t= 일시정지 중 store → URL (#1381)', () => {
  it('pausedUrlTime — 재생 중 (정 · 역행 · 전 배속) · 시각 미정은 쓰지 않는다, 정지 중 J2000 은 키 삭제', () => {
    for (const scale of [1, 3_600, 86_400, 3_155_760_000, -1, -86_400]) {
      expect(pausedUrlTime(EVENT_JD, scale)).toBeUndefined();
    }
    expect(pausedUrlTime(null, 0)).toBeUndefined();
    expect(pausedUrlTime(Number.NaN, 0)).toBeUndefined();
    expect(pausedUrlTime(EVENT_JD, 0)).toBe(EVENT_JD);
    expect(pausedUrlTime(J2000, 0)).toBeNull();
  });

  it('사건 선택 순서 (시각 점프 → 일시정지) — 정지된 뒤 `t` 를 사건 시각 그대로 (반올림 없이) 1회 쓴다', () => {
    useSimStore.setState({ julianDate: J2000, timeScale: 86_400 });
    render(<UrlSync />);
    setUrlTMock.mockClear();
    act(() => {
      useSimStore.getState().setTime(EVENT_JD);
    });
    expect(setUrlTMock).not.toHaveBeenCalled();
    act(() => {
      useSimStore.getState().setTimeScale(0);
    });
    expect(setUrlTMock).toHaveBeenCalledTimes(1);
    expect(setUrlTMock).toHaveBeenLastCalledWith(EVENT_JD);
  });

  it('재생 중 시각 변화 (프레임마다) — `t` 쓰기 0회 · 리렌더 0회 (리렌더 폭주 방지 규약 유지)', () => {
    useSimStore.setState({ julianDate: J2000, timeScale: 86_400 });
    render(<UrlSync />);
    setUrlTMock.mockClear();
    // 렌더 횟수 대리 지표 — `UrlSync` 는 렌더마다 `useQueryState` 를 키 수만큼 부른다 (PR #1384 리뷰 권고 2).
    const callsBefore = vi.mocked(useQueryState).mock.calls.length;
    for (let i = 1; i <= 120; i += 1) {
      act(() => {
        useSimStore.getState().setTime(J2000 + i / 60);
      });
    }
    expect(setUrlTMock).not.toHaveBeenCalled();
    expect(vi.mocked(useQueryState).mock.calls.length).toBe(callsBefore);
  });

  it('정지 중 이산 조작 (「지금」 · 스크러버) — 바뀐 시각마다 쓴다, 재생으로 돌아가도 지우지 않는다', () => {
    useSimStore.setState({ julianDate: EVENT_JD, timeScale: 0 });
    mockUrlT = EVENT_JD;
    render(<UrlSync />);
    setUrlTMock.mockClear();
    const now = 2_461_000.25;
    act(() => {
      useSimStore.getState().setTime(now);
    });
    expect(setUrlTMock).toHaveBeenLastCalledWith(now);
    setUrlTMock.mockClear();
    act(() => {
      useSimStore.getState().setTimeScale(86_400);
    });
    expect(setUrlTMock).not.toHaveBeenCalled();
  });

  it('`?t=` 직접 입력 + 정지 부팅 — URL 값과 같은 시각이면 다시 쓰지 않는다 (URL 원문 보존)', () => {
    mockUrlT = EVENT_JD;
    useSimStore.setState({ julianDate: EVENT_JD, timeScale: 0 });
    render(<UrlSync />);
    expect(sentCommands).toContainEqual({ type: 'jumpToJulianDate', julianDate: EVENT_JD });
    expect(setUrlTMock).not.toHaveBeenCalled();
  });

  it('정지 중 J2000 — URL 의 `t` 키를 지운다 (부재 = J2000 기본값), URL 에 없으면 쓰지 않는다', () => {
    mockUrlT = EVENT_JD;
    useSimStore.setState({ julianDate: J2000, timeScale: 0 });
    render(<UrlSync />);
    expect(setUrlTMock).toHaveBeenLastCalledWith(null);
    cleanup();
    setUrlTMock.mockClear();
    mockUrlT = null;
    render(<UrlSync />);
    expect(setUrlTMock).not.toHaveBeenCalled();
  });
});

describe('UrlSync — ?tour=&step= 투어 진입 (#1390 결정 · URL / DoD E6)', () => {
  it('유효 → 교육 모드 + 시작 요청 (1-based → 0-based), t · focus · speed · ruler 적용을 건너뛴다 (단계가 정본)', () => {
    mockUrlTour = 'eclipse';
    mockUrlStep = '3';
    mockUrlMode = 'research';
    mockUrlT = 2451545;
    mockUrlFocus = 'mars';
    mockUrlSpeed = 3600;
    mockUrlRuler = 'sun';
    render(<UrlSync />);
    expect(useSimStore.getState().mode).toBe('education');
    expect(sentCommands).toContainEqual({ type: 'setMode', mode: 'education' });
    expect(useTourStore.getState().pendingStart).toEqual({
      tourId: 'eclipse',
      stepIndex: 2,
      focusCard: true,
    });
    const types = sentCommands.map((c) => c.type);
    expect(types).not.toContain('jumpToJulianDate');
    expect(types).not.toContain('focusOn');
    expect(types).not.toContain('setTimeScale');
    expect(useSimStore.getState().rulerAnchorId).toBeNull();
    // 시작 대기 중에는 투어 키를 지우지 않는다.
    expect(setUrlTourMock).not.toHaveBeenCalledWith(null);
  });

  it.each([
    ['모르는 투어', 'nope', '1'],
    ['step=0', 'eclipse', '0'],
    ['step=N+1', 'eclipse', '6'],
  ])(
    '무효 (%s) → 키 제거 + 경고 + 교육 모드 (목록) · 다른 키는 평소대로 적용',
    (_n, tour, step) => {
      mockUrlTour = tour;
      mockUrlStep = step;
      mockUrlFocus = 'earth';
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      render(<UrlSync />);
      expect(setUrlTourMock).toHaveBeenCalledWith(null);
      expect(setUrlStepMock).toHaveBeenCalledWith(null);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('투어 목록 표시'));
      expect(useSimStore.getState().mode).toBe('education');
      expect(useTourStore.getState().pendingStart).toBeNull();
      expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'earth' });
    },
  );

  it('투어 없는 ?step= 은 지운다 · 모드는 URL 대로', () => {
    mockUrlStep = '2';
    render(<UrlSync />);
    expect(setUrlStepMock).toHaveBeenCalledWith(null);
    expect(useSimStore.getState().mode).toBe('observe');
  });

  it('store → URL — 진행 중 투어 · 단계 (1-based), 종료 시 둘 다 지운다', () => {
    render(<UrlSync />);
    act(() => useTourStore.getState().patch({ activeTourId: 'eclipse', stepIndex: 1 }));
    expect(setUrlTourMock).toHaveBeenLastCalledWith('eclipse');
    expect(setUrlStepMock).toHaveBeenLastCalledWith('2');
    act(() => useTourStore.getState().reset());
    expect(setUrlTourMock).toHaveBeenLastCalledWith(null);
    expect(setUrlStepMock).toHaveBeenLastCalledWith(null);
  });
});
