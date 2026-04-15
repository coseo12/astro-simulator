'use client';

import { useSimStore, type PhysicsEngineKind, RUNNABLE_ENGINES } from '@/store/sim-store';

interface EngineDef {
  id: PhysicsEngineKind;
  label: string;
  tooltip: string;
}

// P3-0 #126 — 4-mode + auto. 미구현(barnes-hut, webgpu)은 disabled로 노출해 로드맵 가시화.
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
  {
    id: 'barnes-hut',
    label: 'Barnes-Hut',
    tooltip: 'O(N log N) octree — N=5000+ 가속 (P3-A에서 활성화).',
  },
  {
    id: 'webgpu',
    label: 'WebGPU',
    tooltip: 'GPU compute shader — N=10000+ 최대 성능 (P3-B에서 활성화).',
  },
  {
    id: 'auto',
    label: 'Auto',
    tooltip: '환경 감지 후 최적 엔진 자동 선택 (P3-A부터 활성화).',
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
        const runnable = RUNNABLE_ENGINES.has(e.id);
        return (
          <button
            key={e.id}
            type="button"
            data-testid={`engine-${e.id}`}
            data-active={active}
            data-runnable={runnable}
            disabled={!runnable}
            aria-disabled={!runnable}
            title={e.tooltip}
            onClick={() => runnable && setPhysicsEngine(e.id)}
            className={`num text-caption px-2 py-1 rounded-xs transition-colors ${
              active
                ? 'bg-primary/25 text-fg-primary'
                : runnable
                  ? 'text-fg-secondary hover:bg-bg-elevated'
                  : 'text-fg-tertiary opacity-50 cursor-not-allowed'
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
