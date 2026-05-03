/**
 * R1 #334+#335 — store-scene 동기화 단일 경로 통합 회귀 가드.
 *
 * ADR `docs/decisions/20260425-r1-store-scene-sync-unification.md` §결정 6.
 *
 * 본 테스트는 `SimulationCore.command` 가 'focusOn' / 'resetCamera' 호출 시
 * **scene-side 핸들러를 호출하지 않고 event 만 emit** 하는지 검증한다.
 *
 * 회귀 시나리오 (방어 대상):
 *  - `setCameraHandlers(focus, reset, ...)` 같은 시그니처가 부활해 콜백이 등록되면
 *    sim-canvas subscribe 와 함께 이중 경로가 재생성된다.
 *  - 본 테스트는 `setCameraRadiusHandler` 만 노출되고, command 처리 시 핸들러 호출 없이
 *    event 만 발생하는 단일 진실원 계약을 박제.
 *
 * 단위 테스트 범위 (Babylon mock 비용 회피):
 *  - SimulationCore 의 command 처리 + event emission 만 검증.
 *  - scene / camera 실제 동작은 통합 또는 E2E (`p329-qa-focus-lod-guard.mjs`) 가 별도 가드.
 */
import { describe, expect, it, vi } from 'vitest';
import { SimulationCore } from './simulation-core.js';

// SimulationCore 생성자는 canvas 참조만 저장 — start() 호출 안 하면 Babylon 초기화 X.
const makeCanvas = () => ({}) as unknown as HTMLCanvasElement;

describe('SimulationCore store-scene sync (R1 #334+#335)', () => {
  it('focusOn 명령은 bodySelected event 1회만 emit (scene 콜백 호출 없음)', () => {
    const core = new SimulationCore(makeCanvas());
    const onBodySelected = vi.fn();
    core.on('bodySelected', onBodySelected);

    core.command({ type: 'focusOn', bodyId: 'sun' });

    // event 1회 — store sync 단일 경로 보장
    expect(onBodySelected).toHaveBeenCalledTimes(1);
    expect(onBodySelected).toHaveBeenCalledWith({ id: 'sun' });

    core.dispose();
  });

  it('resetCamera 명령은 bodySelected({ id: null }) event 1회만 emit', () => {
    const core = new SimulationCore(makeCanvas());
    const onBodySelected = vi.fn();
    core.on('bodySelected', onBodySelected);

    core.command({ type: 'resetCamera' });

    expect(onBodySelected).toHaveBeenCalledTimes(1);
    expect(onBodySelected).toHaveBeenCalledWith({ id: null });

    core.dispose();
  });

  it('setCameraRadius 명령은 등록된 핸들러를 1회만 호출 (focus 핸들러 부재 — 폐기됨)', () => {
    const core = new SimulationCore(makeCanvas());
    const setRadius = vi.fn();
    core.setCameraRadiusHandler(setRadius);

    core.command({ type: 'setCameraRadius', radius: 42 });

    expect(setRadius).toHaveBeenCalledTimes(1);
    expect(setRadius).toHaveBeenCalledWith(42);

    core.dispose();
  });

  it('setCameraRadiusHandler 미등록 시 setCameraRadius 명령은 no-op (핸들러 호출 없음)', () => {
    const core = new SimulationCore(makeCanvas());

    expect(() => core.command({ type: 'setCameraRadius', radius: 100 })).not.toThrow();

    core.dispose();
  });

  it('focusOn → resetCamera 연쇄 호출 시 event 2회 (각 1회씩)', () => {
    // #402 — R-Phase allowlist 가드 도입 후 R-Phase 활성 body (mercury) 사용.
    // (이전 R1 회귀 테스트는 'earth' 였으나 R-Phase allowlist 외이므로 emit 차단됨)
    const core = new SimulationCore(makeCanvas());
    const onBodySelected = vi.fn();
    core.on('bodySelected', onBodySelected);

    core.command({ type: 'focusOn', bodyId: 'mercury' });
    core.command({ type: 'resetCamera' });

    expect(onBodySelected).toHaveBeenCalledTimes(2);
    expect(onBodySelected).toHaveBeenNthCalledWith(1, { id: 'mercury' });
    expect(onBodySelected).toHaveBeenNthCalledWith(2, { id: null });

    core.dispose();
  });

  /**
   * #402 — R-Phase allowlist 가드 (defense-in-depth scene 측면).
   *
   * ADR `docs/decisions/20260504-r-phase-allowlist-guard.md` §결정 3.
   *
   * UI 가드 (focus-quick-buttons.tsx disabled) 우회 강제 호출 (URL `?focus=earth` 등) 시
   * scene 가드가 마지막 방어선. emit 차단 → store/scene 자동 0 변화.
   */
  describe('R-Phase allowlist 가드 (#402)', () => {
    it('R-Phase 활성 body (sun/mercury/venus) focusOn 은 emit 통과', () => {
      const core = new SimulationCore(makeCanvas());
      const onBodySelected = vi.fn();
      core.on('bodySelected', onBodySelected);

      core.command({ type: 'focusOn', bodyId: 'sun' });
      core.command({ type: 'focusOn', bodyId: 'mercury' });
      core.command({ type: 'focusOn', bodyId: 'venus' });

      expect(onBodySelected).toHaveBeenCalledTimes(3);
      expect(onBodySelected).toHaveBeenNthCalledWith(1, { id: 'sun' });
      expect(onBodySelected).toHaveBeenNthCalledWith(2, { id: 'mercury' });
      expect(onBodySelected).toHaveBeenNthCalledWith(3, { id: 'venus' });

      core.dispose();
    });

    it('R-Phase 미활성 body (earth/jupiter/neptune) focusOn 은 emit 차단 (selectedBodyId 변화 0)', () => {
      const core = new SimulationCore(makeCanvas());
      const onBodySelected = vi.fn();
      core.on('bodySelected', onBodySelected);

      // console.warn 호출 검증을 위해 spy 등록.
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      core.command({ type: 'focusOn', bodyId: 'earth' });
      core.command({ type: 'focusOn', bodyId: 'jupiter' });
      core.command({ type: 'focusOn', bodyId: 'neptune' });

      // emit 0회 — store/scene 자동 0 변화 (DoD-3).
      expect(onBodySelected).toHaveBeenCalledTimes(0);
      // 각 차단 시 console.warn 1회 — 개발자 진단 가능 (silent 이지만 dev-time 가시성).
      expect(warnSpy).toHaveBeenCalledTimes(3);
      expect(warnSpy.mock.calls[0]?.[0]).toContain('earth');

      warnSpy.mockRestore();
      core.dispose();
    });

    it('focusOn { bodyId: null } 방어 안전망 — isRPhaseFocusable null 처리 통과 (타입 시스템상 unreachable, 강제 캐스트로 검증)', () => {
      // ADR §초기 박제값 주석: isRPhaseFocusable 의 null 입력 허용은 방어 안전망.
      // CoreCommand.focusOn 타입은 `bodyId: string` 이라 null/undefined 가 못 들어오지만,
      // ts-ignore 우회나 외부 명령 직렬화 등에서 안전성 보장 목적.
      const core = new SimulationCore(makeCanvas());
      const onBodySelected = vi.fn();
      core.on('bodySelected', onBodySelected);

      // 강제 캐스트로 가드 통과 검증 — null 은 isRPhaseFocusable 에서 true 반환.
      core.command({ type: 'focusOn', bodyId: null as unknown as string });

      expect(onBodySelected).toHaveBeenCalledTimes(1);
      expect(onBodySelected).toHaveBeenCalledWith({ id: null });

      core.dispose();
    });
  });

  it('public API 회귀 가드 — setCameraHandlers 가 부활하지 않는다 (focus/reset 콜백 폐기)', () => {
    const core = new SimulationCore(makeCanvas());
    // setCameraHandlers 는 ADR §결정 2 에 의해 setCameraRadiusHandler 로 리네이밍됨.
    // 본 assert 는 회귀 시 (예: 향후 작업자가 `setCameraHandlers` 를 다시 추가) 즉시 실패.
    expect((core as unknown as Record<string, unknown>).setCameraHandlers).toBeUndefined();
    // 신규 API 는 존재해야 함.
    expect(typeof core.setCameraRadiusHandler).toBe('function');

    core.dispose();
  });
});
