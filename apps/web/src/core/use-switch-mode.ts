'use client';

import { useCallback } from 'react';
import type { SimMode } from '@astro-simulator/shared';
import { useSimStore } from '@/store/sim-store';
import { useSimCommand } from '@/core/sim-context';

/**
 * #1281 — 모드 전환 (store + core 명령 동시 발행). ModeSwitcher 와 관찰 모드 카드의
 * 「자세히 → 연구 모드」가 같은 경로를 쓴다 — 한쪽만 store 를 바꾸면 core 와 어긋난다.
 */
export function useSwitchMode(): (next: SimMode) => void {
  const setMode = useSimStore((s) => s.setMode);
  const sendCommand = useSimCommand();
  return useCallback(
    (next: SimMode) => {
      setMode(next);
      sendCommand({ type: 'setMode', mode: next });
    },
    [setMode, sendCommand],
  );
}
