/**
 * #402 + R4 #532 R-Phase Allowlist 가드 — simulation-core focusOn 단위 테스트.
 *
 * ADR `docs/decisions/20260504-r-phase-allowlist-guard.md` §결정 3 (defense-in-depth scene 측면).
 * R4 #532 — earth + moon 진입 (Allowlist 5개: sun/mercury/venus/earth/moon).
 *
 * 검증 대상:
 *  - focusOn 명령 + allowlist 외 가상 ID (nonexistent-body — R10b #664 전환) → bodySelected event emit 차단 + console.warn
 *    (phase 11 진입으로 미진입 실데이터 0 → 가상 ID 가 membership 가드 negative 를 영구 승계.
 *     simulation-core.ts 의 allowlist 검사가 body 데이터 조회보다 선행하므로 가상 ID 작동 — ADR 20260612-r10b §축 5 ①.
 *     ⚠️ 'nonexistent-body' 류 가상 ID 는 미래 phase 12+ 에서 실데이터 등록 금지 — ADR §재검토 #7)
 *  - focusOn + allowlist 박제 body (sun / mercury / venus / earth / moon) → bodySelected event 정상 emit
 *  - resetCamera → null id 정상 emit (가드 영향 없음 — null 은 isRPhaseFocusable true)
 *  - URL `?focus=nonexistent-body` 직접 진입 시뮬레이션 — focusOn 가상 ID 호출도 차단
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
    // R10a #659 — pluto 가 R10a 진입으로 allowlist 포함 (R9 까지의 차단 예시 → 허용 전환).
    const core = new SimulationCore(makeCanvas());
    const onBodySelected = vi.fn();
    core.on('bodySelected', onBodySelected);

    core.command({ type: 'focusOn', bodyId: 'pluto' });

    expect(onBodySelected).toHaveBeenCalledTimes(1);
    expect(onBodySelected).toHaveBeenCalledWith({ id: 'pluto' });
    expect(warnSpy).not.toHaveBeenCalled();

    core.dispose();
  });

  it('allowlist 진입 body (halley) focusOn → bodySelected emit 정상 (R10b #664 허용 전환 — 역행 혜성 첫 사례)', () => {
    // R10b #664 — halley 가 R10b 진입으로 allowlist 포함 (R10a 까지의 차단 예시 → 허용 전환.
    // 전 데이터 소진 — 차단 예시는 가상 ID nonexistent-body 로 영구 전환, ADR §축 5 ①).
    const core = new SimulationCore(makeCanvas());
    const onBodySelected = vi.fn();
    core.on('bodySelected', onBodySelected);

    core.command({ type: 'focusOn', bodyId: 'halley' });

    expect(onBodySelected).toHaveBeenCalledTimes(1);
    expect(onBodySelected).toHaveBeenCalledWith({ id: 'halley' });
    expect(warnSpy).not.toHaveBeenCalled();

    core.dispose();
  });

  it('allowlist 외 가상 ID (nonexistent-body) focusOn → bodySelected emit 0 + console.warn', () => {
    // R10b #664 — 차단 예시를 가상 ID 로 전환 (phase 11 진입으로 미진입 실데이터 0 — ADR §축 5 ①).
    // simulation-core 의 allowlist 검사 (isRPhaseFocusable) 가 body 데이터 조회보다 선행하므로
    // 가상 ID 로도 membership 가드 분기를 정확히 검증 (phase 진행 영구 비종속).
    const core = new SimulationCore(makeCanvas());
    const onBodySelected = vi.fn();
    core.on('bodySelected', onBodySelected);

    core.command({ type: 'focusOn', bodyId: 'nonexistent-body' });

    expect(onBodySelected).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('R_PHASE_BODY_ALLOWLIST');
    expect(warnSpy.mock.calls[0]?.[0]).toContain('nonexistent-body');

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

  it('연쇄 호출 — sun(허용) → nonexistent-body(차단) → venus(허용) 시 emit 2회만', () => {
    // R10b #664 — 차단 예시를 가상 ID 로 전환 (halley R10b 진입으로 허용 전환 — ADR §축 5 ①).
    const core = new SimulationCore(makeCanvas());
    const onBodySelected = vi.fn();
    core.on('bodySelected', onBodySelected);

    core.command({ type: 'focusOn', bodyId: 'sun' });
    core.command({ type: 'focusOn', bodyId: 'nonexistent-body' });
    core.command({ type: 'focusOn', bodyId: 'venus' });

    expect(onBodySelected).toHaveBeenCalledTimes(2);
    expect(onBodySelected).toHaveBeenNthCalledWith(1, { id: 'sun' });
    expect(onBodySelected).toHaveBeenNthCalledWith(2, { id: 'venus' });
    // nonexistent-body 차단 시 1회 warn
    expect(warnSpy).toHaveBeenCalledTimes(1);

    core.dispose();
  });

  it('URL ?focus=nonexistent-body 직접 진입 시나리오 — focusOn 가상 ID 도 차단', () => {
    // URL 진입은 url-sync.tsx 가 sendCommand({type:'focusOn', bodyId}) 발행 →
    // SimulationCore.command 가 본 가드로 차단. UI 우회 진입 회귀 가드.
    // R10b #664 — halley 가 R10b 진입으로 허용 전환 → 차단 예시를 가상 ID 로 영구 전환 (ADR §축 5 ①).
    // (url-sync 자체는 데이터 존재 검사가 선행이라 가상 ID 는 "알 수 없는 body id" 분기로 빠지나,
    //  본 테스트는 simulation-core 단독 가드 — sendCommand 직접 호출 시나리오라 가상 ID 도달 가능.)
    const core = new SimulationCore(makeCanvas());
    const onBodySelected = vi.fn();
    core.on('bodySelected', onBodySelected);

    core.command({ type: 'focusOn', bodyId: 'nonexistent-body' });

    expect(onBodySelected).not.toHaveBeenCalled();

    core.dispose();
  });
});
