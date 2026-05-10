import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SimulationCore } from '@astro-simulator/core';
import { SimCommandProvider, useSimCommand } from './sim-context';

/**
 * #419 — SimCommandProvider mount 순서 정합화 단위 테스트 (DoD-3).
 *
 * ADR: docs/decisions/20260510-419-sim-canvas-mount-race.md §결정 1 (A1-E early return)
 *      + §결정 3-1 (sim-context.test.tsx 신규).
 *
 * 검증 매트릭스:
 *   1. core={null} → children 미렌더 (race condition 구조적 차단)
 *   2. core={mockCore} → children 등장 + useSimCommand 가 mock.command 호출 (정상 동작 회귀 보호)
 *
 * 부모 ADR `20260504-415-url-sync-guard.md` §재검토 조건 1 충족 검증.
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SimCommandProvider — core null 시 children 미렌더 (#419 §결정 1)', () => {
  it('core={null} → children 미렌더 (race condition 구조적 차단)', () => {
    render(
      <SimCommandProvider core={null}>
        <div data-testid="child">child</div>
      </SimCommandProvider>,
    );
    expect(screen.queryByTestId('child')).toBeNull();
  });

  it('core={mockCore} → children 등장 + useSimCommand 가 mock.command 호출', () => {
    const mockCommand = vi.fn();
    const mockCore = { command: mockCommand } as unknown as SimulationCore;

    function Child() {
      const send = useSimCommand();
      send({ type: 'setMode', mode: 'observe' });
      return <div data-testid="child">child</div>;
    }

    render(
      <SimCommandProvider core={mockCore}>
        <Child />
      </SimCommandProvider>,
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(mockCommand).toHaveBeenCalledWith({ type: 'setMode', mode: 'observe' });
  });
});
