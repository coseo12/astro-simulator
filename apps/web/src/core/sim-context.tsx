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
  const api: SimCommandApi = {
    command: (cmd) => core?.command(cmd),
  };
  return <SimCommandContext.Provider value={api}>{children}</SimCommandContext.Provider>;
}

/** core에 명령을 보내는 훅. core가 아직 초기화되지 않았으면 no-op. */
export function useSimCommand(): (cmd: CoreCommand) => void {
  const ctx = useContext(SimCommandContext);
  return ctx?.command ?? (() => undefined);
}
