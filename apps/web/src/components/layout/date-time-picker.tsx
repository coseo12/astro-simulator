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
    // `py-2` — 아래 「UTC」 범례가 입력 위로 8px 걸친다. 상단 바 우측 그룹은 `overflow-x-auto` 스크롤러라 세로도
    // 잘린다(overflow-x ≠ visible 이면 overflow-y 도 auto) — 범례 높이를 이 상자 안에 담아 잘림을 막는다 (48px 바 안).
    <div className="flex shrink-0 items-center gap-1 py-2" data-testid="datetime-picker">
      <label className="sr-only" htmlFor="datetime-input">
        특정 UTC 시점 입력
      </label>
      {/* #1288 — 화면에 보이는 「UTC」 표기 (종전에는 sr-only 라벨에만 있었다 — qa 소견). 입력 테두리 위에 걸친
          범례(legend)로 둔다: 상단 바 우측 그룹은 1280 Linux 폰트에서 여유가 좁아(#1281 PR #1283 B1) 글자를 옆에 붙이면
          폭이 는다. 범례는 폭을 늘리지 않는다. 접근 이름은 기존 `aria-label` 이 이미 「UTC」를 담아 `aria-hidden` 이다. */}
      <span className="relative flex">
        <input
          id="datetime-input"
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="특정 UTC 시점으로 점프할 날짜/시간"
          className="num text-caption bg-bg-surface/80 backdrop-blur border border-border-subtle rounded-sm px-2 py-1 text-fg-primary focus:outline-none focus:border-primary/50"
          data-testid="datetime-input"
        />
        <span
          aria-hidden="true"
          data-testid="datetime-utc-legend"
          className="num pointer-events-none absolute -top-2 left-1.5 rounded-xs bg-bg-surface px-0.5 text-caption leading-none text-fg-secondary"
        >
          UTC
        </span>
      </span>
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
