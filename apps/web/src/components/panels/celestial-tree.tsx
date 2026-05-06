'use client';

import { ephemeris as ephemerisApi } from '@astro-simulator/core';
import { useSimStore } from '@/store/sim-store';
import { useSimCommand } from '@/core/sim-context';
import { useMemo } from 'react';
// #403 — R-Phase allowlist SSoT (named import — scene namespace 경유 금지).
// ADR `20260506-403-r-phase-ui-guard.md` §결정 §CelestialTree UI 가드 박제 패턴.
//
// ⚠️ #402 §Amendment 결정 D1 — `scene as sceneApi` namespace 경유 시 turbopack module dep graph 가
//    solar-system-scene → nbody-engine → physics_wasm `__dirname` 평가를 trigger 하여 SSR 500.
//    본 컴포넌트는 app-shell.tsx 직접 import → SSR 평가 대상이므로 named import 로 모듈 그래프 영향 0 보장.
import { isRPhaseFocusable } from '@astro-simulator/core';

// #403 — R-Phase 미진입 body 호버 / focus 시 사용자 안내 문구.
// ADR `20260506-403-r-phase-ui-guard.md` §결정 §CelestialTree UI 가드 박제 패턴.
// i18n 키 분기 신설 금지 (ADR §명시적 비-범위 line 356) — 한국어 하드코딩, `/en` 라우팅 미지원.
const DISABLED_TOOLTIP_SUFFIX = '은(는) R-Phase 미진입 — 후속 R-Phase 에서 활성화 예정입니다.';

/**
 * 좌 패널 — 태양계 계층 트리.
 * 태양 → 행성(부모=sun) → 위성(부모=해당 행성)
 *
 * #403 R-Phase Allowlist 가드 (defense-in-depth UI 측면 2번째 축, #402 와 직교) —
 * ADR `20260506-403-r-phase-ui-guard.md` §결정 2.
 * R-Phase 미진입 body 항목은 disabled + tooltip + opacity 50% + cursor-not-allowed.
 * R_PHASE_BODY_ALLOWLIST 1줄 추가만으로 자동 활성 (Concrete Prediction §zero-touch).
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
    const focusable = isRPhaseFocusable(id);
    return (
      <li key={id}>
        <button
          type="button"
          data-testid={`tree-${id}`}
          // data-r-phase-disabled — E2E (browser-verify) 회귀 가드 + 선택자 노출용
          // (cross-validate Gemini 개선 제안 2 반영). disabled / aria-disabled 와
          // 의미 중복이지만 selector 일관성 위해 #402 박제 패턴 그대로 재사용.
          data-r-phase-disabled={!focusable}
          disabled={!focusable}
          aria-disabled={!focusable}
          title={focusable ? undefined : `${body.nameKo} ${DISABLED_TOOLTIP_SUFFIX}`}
          onClick={() => handleFocus(id)}
          className={`w-full text-left num text-body-sm px-2 py-1 rounded-xs flex items-center gap-2 transition-colors ${
            !focusable
              ? 'text-fg-muted opacity-50 cursor-not-allowed'
              : active
                ? 'bg-primary/20 text-fg-primary'
                : 'text-fg-secondary hover:bg-bg-elevated'
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
