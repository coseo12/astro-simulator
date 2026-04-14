'use client';

import { useState } from 'react';
import { useSimCommand } from '@/core/sim-context';

/**
 * DateTimePicker — 특정 UTC 시점으로 점프.
 * 입력 형식: YYYY-MM-DDTHH:mm (datetime-local)
 */
export function DateTimePicker() {
  const [value, setValue] = useState('');
  const sendCommand = useSimCommand();
  const [error, setError] = useState<string | null>(null);

  const handleJump = () => {
    if (!value) return;
    try {
      const iso = new Date(value).toISOString();
      sendCommand({ type: 'jumpToDate', isoUtc: iso });
      setError(null);
    } catch {
      setError('잘못된 날짜');
    }
  };

  return (
    <div className="flex items-center gap-1" data-testid="datetime-picker">
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="num text-caption bg-bg-surface/80 backdrop-blur border border-border-subtle rounded-sm px-2 py-1 text-fg-primary focus:outline-none focus:border-primary/50"
        data-testid="datetime-input"
      />
      <button
        type="button"
        onClick={handleJump}
        disabled={!value}
        className="num text-caption px-2 py-1 rounded-sm border bg-bg-surface/80 text-fg-secondary border-border-subtle hover:bg-bg-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        style={{ transitionDuration: 'var(--duration-fast)' }}
        data-testid="datetime-jump"
      >
        점프
      </button>
      {error && <span className="text-caption text-danger">{error}</span>}
    </div>
  );
}
