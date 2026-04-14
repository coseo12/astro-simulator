'use client';

import { useSimStore, type UnitSystem } from '@/store/sim-store';

const UNITS: { id: UnitSystem; label: string; desc: string }[] = [
  { id: 'si', label: 'SI', desc: '미터/킬로그램/초' },
  { id: 'astro', label: 'AU', desc: '천문 단위 (AU/ly/pc)' },
  { id: 'natural', label: 'Nat', desc: '자연 단위 (c=1, ℏ=1)' },
];

/**
 * 단위계 토글. 표시 단위 전역 선택 (실제 포매팅은 P2에서 확장).
 */
export function UnitToggle() {
  const unit = useSimStore((s) => s.unitSystem);
  const setUnit = useSimStore((s) => s.setUnitSystem);

  return (
    <div
      className="flex items-center gap-0.5 bg-bg-surface/80 backdrop-blur border border-border-subtle rounded-sm p-0.5"
      data-testid="unit-toggle"
    >
      {UNITS.map((u) => {
        const active = unit === u.id;
        return (
          <button
            key={u.id}
            type="button"
            onClick={() => setUnit(u.id)}
            title={u.desc}
            data-testid={`unit-${u.id}`}
            className={`num text-caption px-2 py-0.5 rounded-xs transition-colors ${
              active ? 'bg-primary/25 text-fg-primary' : 'text-fg-secondary hover:bg-bg-elevated'
            }`}
            style={{ transitionDuration: 'var(--duration-fast)' }}
          >
            {u.label}
          </button>
        );
      })}
    </div>
  );
}
