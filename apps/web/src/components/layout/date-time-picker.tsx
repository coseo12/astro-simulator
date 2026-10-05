'use client';

import { useState } from 'react';
import { useSimCommand } from '@/core/sim-context';
import { datetimeLocalToIsoUtc } from '@/lib/sim-time-format';

/**
 * DateTimePicker — 특정 UTC 시점으로 점프.
 * 입력 형식: YYYY-MM-DDTHH:mm (datetime-local)
 *
 * #1288 D5 — 입력값은 **UTC** 로 해석한다 (라벨과 일치). 종전 `new Date(value)` 는 로컬 시간대 해석이었다.
 */
export function DateTimePicker() {
  const [value, setValue] = useState('');
  const sendCommand = useSimCommand();
  const [error, setError] = useState<string | null>(null);

  const handleJump = () => {
    if (!value) return;
    const iso = datetimeLocalToIsoUtc(value);
    if (iso === null) {
      setError('잘못된 날짜');
      return;
    }
    sendCommand({ type: 'jumpToDate', isoUtc: iso });
    setError(null);
  };

  return (
    <div className="flex shrink-0 items-center gap-1" data-testid="datetime-picker">
      <label className="sr-only" htmlFor="datetime-input">
        특정 UTC 시점 입력
      </label>
      <input
        id="datetime-input"
        type="datetime-local"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="특정 UTC 시점으로 점프할 날짜/시간"
        className="num text-caption bg-bg-surface/80 backdrop-blur border border-border-subtle rounded-sm px-2 py-1 text-fg-primary focus:outline-none focus:border-primary/50"
        data-testid="datetime-input"
      />
      <button
        type="button"
        onClick={handleJump}
        disabled={!value}
        className="num text-caption whitespace-nowrap px-2 py-1 rounded-sm border bg-bg-surface/80 text-fg-secondary border-border-subtle hover:bg-bg-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        style={{ transitionDuration: 'var(--duration-fast)' }}
        data-testid="datetime-jump"
      >
        점프
      </button>
      {error && <span className="text-caption text-danger whitespace-nowrap">{error}</span>}
    </div>
  );
}
