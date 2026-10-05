'use client';

import { useEffect, useState } from 'react';

/**
 * 마우스 비활성 감지.
 * 마지막 마우스 이동 · 키 · 휠 · 포인터 누름 이후 `timeoutMs` 경과 시 `true` 반환.
 *
 * #1281 — `pointerdown` 을 활동으로 센다 (계약 D7). 터치 기기는 `mousemove` 를 내지 않아, 숨은 상단 바를 터치로
 * 다시 불러낼 방법이 없었다. 이름(`Mouse`)은 호출부 범위를 줄이려 유지한다.
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
    window.addEventListener('pointerdown', schedule);

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener('mousemove', schedule);
      window.removeEventListener('keydown', schedule);
      window.removeEventListener('wheel', schedule);
      window.removeEventListener('pointerdown', schedule);
    };
  }, [timeoutMs]);

  return inactive;
}
