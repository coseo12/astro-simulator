'use client';

import { useEffect, useState } from 'react';

/**
 * 마우스 비활성 감지.
 * 마지막 마우스 이동 이후 `timeoutMs` 경과 시 `true` 반환.
 */
export function useMouseInactivity(timeoutMs: number): boolean {
  const [inactive, setInactive] = useState(false);

  useEffect(() => {
    let timer: number | null = null;

    const schedule = () => {
      if (timer !== null) window.clearTimeout(timer);
      setInactive(false);
      timer = window.setTimeout(() => setInactive(true), timeoutMs);
    };

    schedule();
    window.addEventListener('mousemove', schedule);
    window.addEventListener('keydown', schedule);
    window.addEventListener('wheel', schedule);

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener('mousemove', schedule);
      window.removeEventListener('keydown', schedule);
      window.removeEventListener('wheel', schedule);
    };
  }, [timeoutMs]);

  return inactive;
}
