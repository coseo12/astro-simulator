'use client';

import type { SimMode } from '@astro-simulator/shared';
import { useSimStore } from '@/store/sim-store';
import { useSimCommand } from '@/core/sim-context';
import { useEffect } from 'react';

interface ModeDef {
  id: SimMode;
  label: string;
  enabled: boolean;
  tooltip?: string;
}

const MODES: ModeDef[] = [
  { id: 'observe', label: '관찰', enabled: true },
  { id: 'research', label: '연구', enabled: true },
  { id: 'education', label: '교육', enabled: false, tooltip: 'P2+ 예정' },
  { id: 'sandbox', label: '샌드박스', enabled: false, tooltip: 'P2+ 예정' },
];

/**
 * ModeSwitcher — 4모드 중 하나 선택.
 * P1 스코프: observe/research 활성화. education/sandbox는 비활성 (tooltip).
 * 선택 시 html[data-mode] 속성 갱신 → design-tokens CSS Variables 자동 전환.
 */
export function ModeSwitcher() {
  const mode = useSimStore((s) => s.mode);
  const setMode = useSimStore((s) => s.setMode);
  const sendCommand = useSimCommand();

  // mode → html data-mode 동기화 (layout에서 초기 observe 세팅하지만 변경 시 동기화 필요)
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-mode', mode);
    }
  }, [mode]);

  const handleClick = (next: SimMode, enabled: boolean) => {
    if (!enabled) return;
    setMode(next);
    sendCommand({ type: 'setMode', mode: next });
  };

  return (
    <div
      className="flex items-center gap-0.5 bg-bg-surface/80 backdrop-blur border border-border-subtle rounded-sm p-0.5"
      data-testid="mode-switcher"
    >
      {MODES.map((m) => {
        const active = mode === m.id;
        return (
          <button
            key={m.id}
            type="button"
            data-testid={`mode-${m.id}`}
            data-active={active}
            disabled={!m.enabled}
            title={m.tooltip}
            onClick={() => handleClick(m.id, m.enabled)}
            className={`num text-caption px-2 py-1 rounded-xs transition-colors ${
              active
                ? 'bg-primary/25 text-fg-primary'
                : m.enabled
                  ? 'text-fg-secondary hover:bg-bg-elevated'
                  : 'text-fg-disabled cursor-not-allowed'
            }`}
            style={{ transitionDuration: 'var(--duration-fast)' }}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
