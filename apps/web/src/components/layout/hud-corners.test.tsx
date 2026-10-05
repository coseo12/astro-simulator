import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSimStore } from '@/store/sim-store';
import { HudCorners } from './hud-corners';

beforeEach(() => {
  useSimStore.setState({
    rendererKind: 'webgl2',
    engineError: null,
    mode: 'observe',
    julianDate: 2_451_545,
    selectedBodyId: null,
  });
});

describe('#1281 HudCorners — 좌하 raw id 칩 · 우하 고정 Tier 범례 제거 (D4 · D8)', () => {
  it.each(['observe', 'research'] as const)(
    '%s 모드 + 선택 상태에서 `focus · <id>` 와 `정확도 · T1 관측` 노출 0',
    (mode) => {
      useSimStore.setState({ mode, selectedBodyId: 'earth' });
      const { container } = render(<HudCorners />);
      expect(screen.queryByTestId('hud-bottom-left')).not.toBeInTheDocument();
      expect(screen.queryByTestId('hud-bottom-right')).not.toBeInTheDocument();
      expect(container.textContent).not.toContain('focus ·');
      expect(container.textContent).not.toContain('earth');
      expect(container.textContent).not.toContain('정확도 · T1 관측');
    },
  );

  it('좌상 JD · 우상 renderer 는 유지', () => {
    render(<HudCorners />);
    expect(screen.getByTestId('hud-top-left')).toHaveTextContent('JD 2451545.000');
    expect(screen.getByTestId('hud-top-right')).toHaveTextContent('renderer · webgl2');
  });
});
