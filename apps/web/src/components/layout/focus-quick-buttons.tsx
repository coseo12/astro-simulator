'use client';

import { useSimStore } from '@/store/sim-store';
import { useSimCommand } from '@/core/sim-context';

const FOCUS_BUTTONS = [
  { id: 'sun', label: '태양' },
  { id: 'earth', label: '지구' },
  { id: 'jupiter', label: '목성' },
  { id: 'neptune', label: '해왕성' },
];

/**
 * TopBar 중앙 영역 — 임시 포커스 단축 버튼.
 * D7 CelestialTree (#26) 완성 후 제거 또는 핵심 4개만 유지.
 */
export function FocusQuickButtons() {
  const selected = useSimStore((s) => s.selectedBodyId);
  const sendCommand = useSimCommand();

  return (
    <div className="flex items-center gap-1">
      {FOCUS_BUTTONS.map((b) => (
        <button
          key={b.id}
          type="button"
          data-testid={`focus-${b.id}`}
          onClick={() => sendCommand({ type: 'focusOn', bodyId: b.id })}
          className={`num text-caption px-2 py-1 rounded-sm border transition-colors ${
            selected === b.id
              ? 'bg-primary/20 text-fg-primary border-primary/40'
              : 'bg-bg-surface/80 text-fg-secondary border-border-subtle hover:bg-bg-elevated'
          }`}
          style={{ transitionDuration: 'var(--duration-fast)' }}
        >
          {b.label}
        </button>
      ))}
      <button
        type="button"
        data-testid="focus-reset"
        onClick={() => sendCommand({ type: 'resetCamera' })}
        className="num text-caption px-2 py-1 rounded-sm border bg-bg-surface/80 text-fg-secondary border-border-subtle hover:bg-bg-elevated transition-colors"
        style={{ transitionDuration: 'var(--duration-fast)' }}
      >
        reset
      </button>
    </div>
  );
}
