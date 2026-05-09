'use client';

import type { SimulationCore } from '@astro-simulator/core';
import type { CoreCommand } from '@astro-simulator/shared';
import { createContext, useContext, type ReactNode } from 'react';

/**
 * SimulationCore에 대한 명령 전송 인터페이스.
 * 컴포넌트는 이 context를 통해서만 core에 접근 — core 인스턴스 직접 노출은 피한다.
 */
interface SimCommandApi {
  command: (cmd: CoreCommand) => void;
}

const SimCommandContext = createContext<SimCommandApi | null>(null);

export function SimCommandProvider({
  core,
  children,
}: {
  core: SimulationCore | null;
  children: ReactNode;
}) {
  // #419 — core null 시 children 렌더 보류 (mount 순서 정합화).
  // ADR: docs/decisions/20260510-419-sim-canvas-mount-race.md §결정 1 (A1-E early return).
  // sim-canvas.tsx 의 비동기 core 생성 (useEffect → setCore) 이 완료된 후에만 children 의 useEffect 가
  // 발화 → sendCommand 가 항상 non-null core 호출 보장 → useSimCommand race condition 구조적 차단.
  // 부모 ADR 20260504-415-url-sync-guard.md §재검토 조건 1 충족 (line 104 race fallback 의 존재 이유 소멸).
  if (core === null) return null;

  const api: SimCommandApi = {
    command: (cmd) => core.command(cmd),
  };
  return <SimCommandContext.Provider value={api}>{children}</SimCommandContext.Provider>;
}

/** core에 명령을 보내는 훅. core가 아직 초기화되지 않았으면 no-op. */
export function useSimCommand(): (cmd: CoreCommand) => void {
  const ctx = useContext(SimCommandContext);
  return ctx?.command ?? (() => undefined);
}
