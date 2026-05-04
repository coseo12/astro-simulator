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
    const core = new SimulationCore(makeCanvas());
    const onBodySelected = vi.fn();
    core.on('bodySelected', onBodySelected);

    // #402 라운드 2 — 'earth' 는 R-Phase allowlist 외 (ADR `20260504-r-phase-allowlist-guard.md`)
    // 이므로 focusOn 시 emit 차단. 본 테스트는 store-sync 경로 검증이 목적이므로
    // allowlist 박제 body ('mercury') 로 교체. allowlist 가드 자체는
    // simulation-core-r-phase-allowlist-guard.test.ts 가 별도 검증.
    core.command({ type: 'focusOn', bodyId: 'mercury' });
    core.command({ type: 'resetCamera' });

    expect(onBodySelected).toHaveBeenCalledTimes(2);
    expect(onBodySelected).toHaveBeenNthCalledWith(1, { id: 'mercury' });
    expect(onBodySelected).toHaveBeenNthCalledWith(2, { id: null });

    core.dispose();
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
