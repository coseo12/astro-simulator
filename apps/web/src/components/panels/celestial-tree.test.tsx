import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoreCommand } from '@astro-simulator/shared';
import type * as AstroCore from '@astro-simulator/core';
import { useSimStore } from '@/store/sim-store';
import { CelestialTree } from './celestial-tree';

let sentCommands: CoreCommand[] = [];
vi.mock('@/core/sim-context', () => ({
  useSimCommand: () => (cmd: CoreCommand) => {
    sentCommands.push(cmd);
  },
}));

// R10b #664 — tree disabled negative 를 vi.mock 부분 mock 으로 승계 (ADR 20260612-r10b §축 5 ②).
// phase 11 진입으로 미진입 실데이터 body 0 → tree 는 getSolarSystem() 실데이터를 렌더하므로
// 가상 ID 노드 자체가 부재 (가상 ID 전환 불가). isRPhaseFocusable 만 지정 body 에 false 반환
// (importOriginal partial mock) 으로 "isRPhaseFocusable=false 일 때 disabled 렌더" UI 계약을
// phase 진행과 영구 비종속으로 검증. mock drift 위험은 membership 가드 가상 ID 실모듈 테스트가
// 직교 커버 (ADR §위험 #5).
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

beforeEach(() => {
  sentCommands = [];
  rPhaseMock.disabledIds = []; // 기본 passthrough (실모듈) — disabled 계약 테스트만 개별 지정
  useSimStore.setState({
    rendererKind: null,
    engineError: null,
    mode: 'observe',
    julianDate: null,
    selectedBodyId: null,
    timeScale: 86_400,
    fps: null,
    unitSystem: 'astro',
    pingCount: 0,
    lastPingAt: null,
  });
});

/**
 * #403 — CelestialTree R-Phase Allowlist 가드 단위 테스트 (defense-in-depth UI 측면 2번째 축).
 *
 * ADR `docs/decisions/20260506-403-r-phase-ui-guard.md` §결정 §CelestialTree UI 가드 박제 패턴.
 * R4 #532 — earth + moon 진입 (Allowlist 5개 활성: sun/mercury/venus/earth/moon).
 *
 * 검증:
 *  - allowlist 박제 body (sun / mercury / venus / earth / moon) 항목은 활성 (focusOn 정상 발행)
 *  - disabled UI 계약 (R10b #664 — vi.mock 부분 mock 승계, ADR 20260612-r10b §축 5 ②):
 *    isRPhaseFocusable=false 인 body 항목은 disabled + aria-disabled + data-r-phase-disabled
 *  - disabled 항목 강제 click 시 focusOn 명령 발행 0 (HTML disabled 자체 차단)
 *  - tooltip (title 속성) 박제 — 사용자 안내
 *  - 시각 차별화 (opacity-50 / cursor-not-allowed) 박제
 */
describe('CelestialTree — R-Phase Allowlist 가드 UI (#403 + R4 #532)', () => {
  it('R-Phase 박제 body (sun) 항목은 활성', () => {
    render(<CelestialTree />);
    expect(screen.getByTestId('tree-sun')).not.toBeDisabled();
  });

  it('R-Phase 박제 body (mercury / venus / earth / moon) 항목은 활성', () => {
    render(<CelestialTree />);
    expect(screen.getByTestId('tree-mercury')).not.toBeDisabled();
    expect(screen.getByTestId('tree-venus')).not.toBeDisabled();
    expect(screen.getByTestId('tree-earth')).not.toBeDisabled();
    expect(screen.getByTestId('tree-moon')).not.toBeDisabled();
  });

  it('neptune (R9 #653 진입) 은 활성 — zero-touch 자동 enabled', () => {
    render(<CelestialTree />);
    expect(screen.getByTestId('tree-neptune')).not.toBeDisabled();
  });

  it('왜소행성 5 (R10a #659 진입) 은 활성 — zero-touch 자동 enabled (pluto negative → positive 전환)', () => {
    render(<CelestialTree />);
    expect(screen.getByTestId('tree-ceres')).not.toBeDisabled();
    expect(screen.getByTestId('tree-pluto')).not.toBeDisabled();
    expect(screen.getByTestId('tree-haumea')).not.toBeDisabled();
    expect(screen.getByTestId('tree-makemake')).not.toBeDisabled();
    expect(screen.getByTestId('tree-eris')).not.toBeDisabled();
  });

  it('혜성 3 (R10b #664 진입) 은 활성 — zero-touch 자동 enabled (halley negative → positive 전환, 전 데이터 소진)', () => {
    render(<CelestialTree />);
    expect(screen.getByTestId('tree-halley')).not.toBeDisabled();
    expect(screen.getByTestId('tree-encke')).not.toBeDisabled();
    expect(screen.getByTestId('tree-swift-tuttle')).not.toBeDisabled();
  });

  it('disabled UI 계약 — isRPhaseFocusable=false 인 body 는 disabled (vi.mock 부분 mock 승계, ADR §축 5 ②)', () => {
    rPhaseMock.disabledIds = ['halley'];
    render(<CelestialTree />);
    expect(screen.getByTestId('tree-halley')).toBeDisabled();
  });

  it('disabled 항목은 aria-disabled="true" 설정 (스크린 리더 인지)', () => {
    rPhaseMock.disabledIds = ['halley'];
    render(<CelestialTree />);
    expect(screen.getByTestId('tree-halley')).toHaveAttribute('aria-disabled', 'true');
  });

  it('활성 항목은 aria-disabled="false" (R4 earth / moon + R6 jupiter 포함)', () => {
    render(<CelestialTree />);
    expect(screen.getByTestId('tree-sun')).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getByTestId('tree-mercury')).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getByTestId('tree-venus')).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getByTestId('tree-earth')).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getByTestId('tree-moon')).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getByTestId('tree-jupiter')).toHaveAttribute('aria-disabled', 'false'); // R6 #621
  });

  it('disabled 항목은 data-r-phase-disabled="true" 회귀 가드 selector 박제', () => {
    rPhaseMock.disabledIds = ['halley'];
    render(<CelestialTree />);
    expect(screen.getByTestId('tree-halley')).toHaveAttribute('data-r-phase-disabled', 'true');
    expect(screen.getByTestId('tree-pluto')).toHaveAttribute('data-r-phase-disabled', 'false'); // R10a #659 진입
    expect(screen.getByTestId('tree-neptune')).toHaveAttribute('data-r-phase-disabled', 'false'); // R9 #653 진입
    expect(screen.getByTestId('tree-sun')).toHaveAttribute('data-r-phase-disabled', 'false');
    expect(screen.getByTestId('tree-earth')).toHaveAttribute('data-r-phase-disabled', 'false');
    expect(screen.getByTestId('tree-moon')).toHaveAttribute('data-r-phase-disabled', 'false');
    expect(screen.getByTestId('tree-jupiter')).toHaveAttribute('data-r-phase-disabled', 'false'); // R6 #621
  });

  it('disabled 항목은 tooltip (title 속성) 박제 — 사용자 안내 + body 이름 포함', () => {
    rPhaseMock.disabledIds = ['halley'];
    render(<CelestialTree />);
    const halleyBtn = screen.getByTestId('tree-halley');
    expect(halleyBtn).toHaveAttribute('title');
    const title = halleyBtn.getAttribute('title') ?? '';
    expect(title).toMatch(/핼리 혜성/);
    expect(title).toMatch(/R-Phase/);
  });

  it('활성 항목은 title 속성 없음 (불필요 노이즈 차단)', () => {
    render(<CelestialTree />);
    expect(screen.getByTestId('tree-sun')).not.toHaveAttribute('title');
    expect(screen.getByTestId('tree-mercury')).not.toHaveAttribute('title');
    expect(screen.getByTestId('tree-earth')).not.toHaveAttribute('title');
    expect(screen.getByTestId('tree-moon')).not.toHaveAttribute('title');
    expect(screen.getByTestId('tree-jupiter')).not.toHaveAttribute('title'); // R6 #621
  });

  it('disabled 항목 강제 click → focusOn 명령 발행 0 (HTML disabled 자체 차단)', () => {
    rPhaseMock.disabledIds = ['halley'];
    render(<CelestialTree />);
    fireEvent.click(screen.getByTestId('tree-halley'));
    // HTML button[disabled] 는 click 이벤트 자체를 dispatch 하지 않음.
    expect(sentCommands.filter((c) => c.type === 'focusOn')).toEqual([]);
  });

  it('활성 항목 click 시 focusOn 명령 발행 (정상 동작 회귀 가드, R4 earth/moon 포함)', () => {
    render(<CelestialTree />);
    fireEvent.click(screen.getByTestId('tree-sun'));
    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'sun' });
    fireEvent.click(screen.getByTestId('tree-mercury'));
    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'mercury' });
    fireEvent.click(screen.getByTestId('tree-venus'));
    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'venus' });
    fireEvent.click(screen.getByTestId('tree-earth'));
    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'earth' });
    fireEvent.click(screen.getByTestId('tree-moon'));
    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'moon' });
  });

  it('disabled 항목 시각 차별화 — opacity-50 cursor-not-allowed 클래스 박제', () => {
    rPhaseMock.disabledIds = ['halley'];
    render(<CelestialTree />);
    const halleyBtn = screen.getByTestId('tree-halley');
    expect(halleyBtn.className).toContain('opacity-50');
    expect(halleyBtn.className).toContain('cursor-not-allowed');
  });

  it('selected body active 스타일 — 활성 + selected 일 때 bg-primary/20', () => {
    useSimStore.setState({ selectedBodyId: 'mercury' });
    render(<CelestialTree />);
    const btn = screen.getByTestId('tree-mercury');
    expect(btn.className).toContain('bg-primary/20');
  });
});
