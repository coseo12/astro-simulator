/**
 * #402 + R4 #532 R-Phase Allowlist 가드 — simulation-core focusOn 단위 테스트.
 *
 * ADR `docs/decisions/20260504-r-phase-allowlist-guard.md` §결정 3 (defense-in-depth scene 측면).
 * R4 #532 — earth + moon 진입 (Allowlist 5개: sun/mercury/venus/earth/moon).
 *
 * 검증 대상:
 *  - focusOn 명령 + allowlist 외 body (halley — R10b phase 11) → bodySelected event emit 차단 + console.warn
 *  - focusOn + allowlist 박제 body (sun / mercury / venus / earth / moon) → bodySelected event 정상 emit
 *  - resetCamera → null id 정상 emit (가드 영향 없음 — null 은 isRPhaseFocusable true)
 *  - URL `?focus=halley` 직접 진입 시뮬레이션 — focusOn halley 호출도 차단
 *
 * 본 테스트는 SimulationCore.command 분기만 다루므로 Babylon 초기화 불필요.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SimulationCore } from './simulation-core.js';

const makeCanvas = () => ({}) as unknown as HTMLCanvasElement;

describe('SimulationCore focusOn — R-Phase Allowlist 가드 (#402 + R4 #532)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('allowlist 박제 body (sun) 는 focusOn 시 bodySelected emit', () => {
    const core = new SimulationCore(makeCanvas());
    const onBodySelected = vi.fn();
    core.on('bodySelected', onBodySelected);

    core.command({ type: 'focusOn', bodyId: 'sun' });

    expect(onBodySelected).toHaveBeenCalledTimes(1);
    expect(onBodySelected).toHaveBeenCalledWith({ id: 'sun' });
    expect(warnSpy).not.toHaveBeenCalled();

    core.dispose();
  });

  it('allowlist 박제 body (mercury) 는 focusOn 시 bodySelected emit', () => {
    const core = new SimulationCore(makeCanvas());
    const onBodySelected = vi.fn();
    core.on('bodySelected', onBodySelected);

    core.command({ type: 'focusOn', bodyId: 'mercury' });

    expect(onBodySelected).toHaveBeenCalledTimes(1);
    expect(onBodySelected).toHaveBeenCalledWith({ id: 'mercury' });

    core.dispose();
  });

  it('allowlist 박제 body (venus) 는 focusOn 시 bodySelected emit', () => {
    const core = new SimulationCore(makeCanvas());
    const onBodySelected = vi.fn();
    core.on('bodySelected', onBodySelected);

    core.command({ type: 'focusOn', bodyId: 'venus' });

    expect(onBodySelected).toHaveBeenCalledTimes(1);
    expect(onBodySelected).toHaveBeenCalledWith({ id: 'venus' });

    core.dispose();
  });

  it('allowlist 박제 body (earth) 는 focusOn 시 bodySelected emit (R4 #532)', () => {
    const core = new SimulationCore(makeCanvas());
    const onBodySelected = vi.fn();
    core.on('bodySelected', onBodySelected);

    core.command({ type: 'focusOn', bodyId: 'earth' });

    expect(onBodySelected).toHaveBeenCalledTimes(1);
    expect(onBodySelected).toHaveBeenCalledWith({ id: 'earth' });
    expect(warnSpy).not.toHaveBeenCalled();

    core.dispose();
  });

  it('allowlist 박제 body (moon) 는 focusOn 시 bodySelected emit (R4 #532 satellite 첫 본 사례)', () => {
    const core = new SimulationCore(makeCanvas());
    const onBodySelected = vi.fn();
    core.on('bodySelected', onBodySelected);

    core.command({ type: 'focusOn', bodyId: 'moon' });

    expect(onBodySelected).toHaveBeenCalledTimes(1);
    expect(onBodySelected).toHaveBeenCalledWith({ id: 'moon' });
    expect(warnSpy).not.toHaveBeenCalled();

    core.dispose();
  });

  it('allowlist 박제 body (saturn) 는 focusOn 시 bodySelected emit (R7 #641 진입)', () => {
    const core = new SimulationCore(makeCanvas());
    const onBodySelected = vi.fn();
    core.on('bodySelected', onBodySelected);

    core.command({ type: 'focusOn', bodyId: 'saturn' });

    expect(onBodySelected).toHaveBeenCalledTimes(1);
    expect(onBodySelected).toHaveBeenCalledWith({ id: 'saturn' });
    expect(warnSpy).not.toHaveBeenCalled();

    core.dispose();
  });

  it('allowlist 진입 body (neptune) focusOn → bodySelected emit 정상 (R9 #653 허용 전환)', () => {
    // R9 #653 — neptune 이 R9 진입으로 allowlist 포함 (R8 까지의 차단 예시 → 허용 전환.
    // 차단 예시 body 는 pluto(R10) 로 교체 — R6 jupiter → R7 saturn → R8 uranus → R9 neptune 선례 답습).
    const core = new SimulationCore(makeCanvas());
    const onBodySelected = vi.fn();
    core.on('bodySelected', onBodySelected);

    core.command({ type: 'focusOn', bodyId: 'neptune' });

    expect(onBodySelected).toHaveBeenCalledTimes(1);
    expect(onBodySelected).toHaveBeenCalledWith({ id: 'neptune' });
    expect(warnSpy).not.toHaveBeenCalled();

    core.dispose();
  });

  it('allowlist 진입 body (pluto) focusOn → bodySelected emit 정상 (R10a #659 허용 전환)', () => {
    // R10a #659 — pluto 가 R10a 진입으로 allowlist 포함 (R9 까지의 차단 예시 → 허용 전환.
    // 차단 예시 body 는 halley(R10b phase 11) 로 교체 — R6 jupiter → ... → R9 pluto 선례 답습).
    const core = new SimulationCore(makeCanvas());
    const onBodySelected = vi.fn();
    core.on('bodySelected', onBodySelected);

    core.command({ type: 'focusOn', bodyId: 'pluto' });

    expect(onBodySelected).toHaveBeenCalledTimes(1);
    expect(onBodySelected).toHaveBeenCalledWith({ id: 'pluto' });
    expect(warnSpy).not.toHaveBeenCalled();

    core.dispose();
  });

  it('allowlist 외 body (halley) focusOn → bodySelected emit 0 + console.warn', () => {
    // R10a #659 — 차단 예시 body 를 halley(R10b phase 11) 로 교체 (pluto R10a 진입으로 허용 전환).
    const core = new SimulationCore(makeCanvas());
    const onBodySelected = vi.fn();
    core.on('bodySelected', onBodySelected);

    core.command({ type: 'focusOn', bodyId: 'halley' });

    expect(onBodySelected).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('R_PHASE_BODY_ALLOWLIST');
    expect(warnSpy.mock.calls[0]?.[0]).toContain('halley');

    core.dispose();
  });

  it('resetCamera 는 가드 영향 없음 — bodySelected({ id: null }) emit 정상', () => {
    const core = new SimulationCore(makeCanvas());
    const onBodySelected = vi.fn();
    core.on('bodySelected', onBodySelected);

    core.command({ type: 'resetCamera' });

    expect(onBodySelected).toHaveBeenCalledTimes(1);
    expect(onBodySelected).toHaveBeenCalledWith({ id: null });
    expect(warnSpy).not.toHaveBeenCalled();

    core.dispose();
  });

  it('연쇄 호출 — sun(허용) → halley(차단) → venus(허용) 시 emit 2회만', () => {
    // R10a #659 — 차단 예시 body 를 halley(R10b phase 11) 로 교체 (pluto R10a 진입으로 허용 전환).
    const core = new SimulationCore(makeCanvas());
    const onBodySelected = vi.fn();
    core.on('bodySelected', onBodySelected);

    core.command({ type: 'focusOn', bodyId: 'sun' });
    core.command({ type: 'focusOn', bodyId: 'halley' });
    core.command({ type: 'focusOn', bodyId: 'venus' });

    expect(onBodySelected).toHaveBeenCalledTimes(2);
    expect(onBodySelected).toHaveBeenNthCalledWith(1, { id: 'sun' });
    expect(onBodySelected).toHaveBeenNthCalledWith(2, { id: 'venus' });
    // halley 차단 시 1회 warn
    expect(warnSpy).toHaveBeenCalledTimes(1);

    core.dispose();
  });

  it('URL ?focus=halley 직접 진입 시나리오 — focusOn halley 도 차단', () => {
    // URL 진입은 url-sync.tsx 가 sendCommand({type:'focusOn', bodyId: 'halley'}) 발행 →
    // SimulationCore.command 가 본 가드로 차단. UI 우회 진입 회귀 가드.
    // R10a #659 — pluto 가 R10a 진입으로 허용 전환 → 차단 예시 body 를 halley(R10b phase 11) 로 교체.
    const core = new SimulationCore(makeCanvas());
    const onBodySelected = vi.fn();
    core.on('bodySelected', onBodySelected);

    core.command({ type: 'focusOn', bodyId: 'halley' });

    expect(onBodySelected).not.toHaveBeenCalled();

    core.dispose();
  });
});
