'use client';

import { useSimStore, type PhysicsEngineKind } from '@/store/sim-store';

interface EngineDef {
  id: PhysicsEngineKind;
  label: string;
  tooltip: string;
}

const ENGINES: EngineDef[] = [
  {
    id: 'kepler',
    label: 'Kepler',
    tooltip: '2-body 해석해 — 행성 간 섭동 없음. 기본값.',
  },
  {
    id: 'newton',
    label: 'Newton',
    tooltip: 'N-body 수치적분(Velocity-Verlet, WASM) — 섭동 포함, 시간 역행 가능.',
  },
];

/**
 * 물리 엔진 토글 (P2-A #89).
 *  - Kepler 2-body ↔ Newton N-body
 *  - 전환 시 씬이 현재 jd에서 Newton 초기 상태를 빌드해 심리스 전환.
 *  - URL `?engine=newton`으로 초기 상태 공유 가능.
 */
export function PhysicsEngineToggle() {
  const engine = useSimStore((s) => s.physicsEngine);
  const setPhysicsEngine = useSimStore((s) => s.setPhysicsEngine);

  return (
    <div
      className="flex items-center gap-0.5 bg-bg-surface/80 backdrop-blur border border-border-subtle rounded-sm p-0.5"
      data-testid="physics-engine-toggle"
      aria-label="물리 엔진"
    >
      {ENGINES.map((e) => {
        const active = engine === e.id;
        return (
          <button
            key={e.id}
            type="button"
            data-testid={`engine-${e.id}`}
            data-active={active}
            title={e.tooltip}
            onClick={() => setPhysicsEngine(e.id)}
            className={`num text-caption px-2 py-1 rounded-xs transition-colors ${
              active ? 'bg-primary/25 text-fg-primary' : 'text-fg-secondary hover:bg-bg-elevated'
            }`}
            style={{ transitionDuration: 'var(--duration-fast)' }}
          >
            {e.label}
          </button>
        );
      })}
    </div>
  );
}
