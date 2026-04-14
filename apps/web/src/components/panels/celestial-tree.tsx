'use client';

import { ephemeris as ephemerisApi } from '@astro-simulator/core';
import { useSimStore } from '@/store/sim-store';
import { useSimCommand } from '@/core/sim-context';
import { useMemo } from 'react';

/**
 * 좌 패널 — 태양계 계층 트리.
 * 태양 → 행성(부모=sun) → 위성(부모=해당 행성)
 */
export function CelestialTree() {
  const selected = useSimStore((s) => s.selectedBodyId);
  const sendCommand = useSimCommand();

  const { sun, childrenOf } = useMemo(() => {
    const system = ephemerisApi.getSolarSystem();
    const byParent = new Map<string | null, typeof system.bodies>();
    for (const b of system.bodies) {
      const k = b.parentId;
      const arr = byParent.get(k);
      if (arr) arr.push(b);
      else byParent.set(k, [b]);
    }
    return {
      sun: system.bodies.find((b) => b.parentId === null) ?? null,
      childrenOf: byParent,
    };
  }, []);

  const handleFocus = (id: string) => {
    sendCommand({ type: 'focusOn', bodyId: id });
  };

  const renderBody = (id: string, depth = 0) => {
    const body = ephemerisApi.getSolarSystem().bodies.find((b) => b.id === id);
    if (!body) return null;
    const children = childrenOf.get(id) ?? [];
    const active = selected === id;
    return (
      <li key={id}>
        <button
          type="button"
          data-testid={`tree-${id}`}
          onClick={() => handleFocus(id)}
          className={`w-full text-left num text-body-sm px-2 py-1 rounded-xs flex items-center gap-2 transition-colors ${
            active ? 'bg-primary/20 text-fg-primary' : 'text-fg-secondary hover:bg-bg-elevated'
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px`, transitionDuration: 'var(--duration-fast)' }}
        >
          <span
            className="inline-block w-2 h-2 rounded-full shrink-0"
            style={{ background: body.colorHint?.hex ?? '#888' }}
            aria-hidden
          />
          <span className="flex-1">
            {body.nameKo} <span className="text-fg-tertiary text-caption">{body.nameEn}</span>
          </span>
        </button>
        {children.length > 0 && (
          <ul className="mt-0.5">{children.map((c) => renderBody(c.id, depth + 1))}</ul>
        )}
      </li>
    );
  };

  if (!sun) return null;

  return (
    <div data-testid="celestial-tree">
      <h3 className="text-body-sm text-fg-secondary mb-2">천체 계층</h3>
      <ul>{renderBody(sun.id)}</ul>
    </div>
  );
}
