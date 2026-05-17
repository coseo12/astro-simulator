'use client';

import { useSimStore } from '@/store/sim-store';
import { useSimCommand } from '@/core/sim-context';
// #402 — R-Phase allowlist SSoT (named import — scene namespace 경유 금지).
// ADR `20260504-r-phase-allowlist-guard.md` §Amendment 결정 D1.
//
// ⚠️ `scene as sceneApi` namespace 경유 시 turbopack module dep graph 가
//    solar-system-scene → nbody-engine → physics_wasm `__dirname` 평가를 trigger 하여 SSR 500
//    (라운드 2 실측 재현). 본 컴포넌트는 app-shell.tsx 직접 import → SSR 평가 대상이므로
//    named import 로 모듈 그래프 영향 0 보장. core/src/index.ts 가 별도 named export 박제.
import { isRPhaseFocusable } from '@astro-simulator/core';

const FOCUS_BUTTONS = [
  { id: 'sun', label: '태양' },
  { id: 'mercury', label: '수성' }, // R2 #361 — sun 다음 천체 거리 순
  { id: 'venus', label: '금성' }, // R3 #369 — mercury 다음 천체 거리 순
  { id: 'earth', label: '지구' },
  { id: 'jupiter', label: '목성' },
  { id: 'neptune', label: '해왕성' },
];

// R-Phase 미진입 body 호버 / focus 시 사용자 안내 문구.
// ADR `20260504-r-phase-allowlist-guard.md` §결정 2.
const DISABLED_TOOLTIP = '아직 구현되지 않은 천체입니다 (R-Phase 진입 후 활성화)';

/**
 * TopBar 중앙 영역 — 임시 포커스 단축 버튼.
 * D7 CelestialTree (#26) 완성 후 제거 또는 핵심 4개만 유지.
 *
 * #402 R-Phase Allowlist 가드 (defense-in-depth UI 측면) —
 * ADR `20260504-r-phase-allowlist-guard.md` §결정 2.
 * R-Phase 미진입 body 는 disabled + tooltip + opacity 50% + cursor-not-allowed.
 */
export function FocusQuickButtons() {
  const selected = useSimStore((s) => s.selectedBodyId);
  const sendCommand = useSimCommand();

  return (
    <div className="flex items-center gap-1" data-r1-region="shortcut-bar">
      {FOCUS_BUTTONS.map((b) => {
        const enabled = isRPhaseFocusable(b.id);
        return (
          <button
            key={b.id}
            type="button"
            data-testid={`focus-${b.id}`}
            data-r-phase-disabled={!enabled}
            disabled={!enabled}
            aria-disabled={!enabled}
            title={enabled ? undefined : DISABLED_TOOLTIP}
            onClick={() => sendCommand({ type: 'focusOn', bodyId: b.id })}
            className={`num text-caption px-2 py-1 rounded-sm border transition-colors ${
              !enabled
                ? 'bg-bg-surface/40 text-fg-muted border-border-subtle opacity-50 cursor-not-allowed'
                : selected === b.id
                  ? 'bg-primary/20 text-fg-primary border-primary/40'
                  : 'bg-bg-surface/80 text-fg-secondary border-border-subtle hover:bg-bg-elevated'
            }`}
            style={{ transitionDuration: 'var(--duration-fast)' }}
          >
            {b.label}
          </button>
        );
      })}
      <button
        type="button"
        data-testid="focus-reset"
        onClick={() => sendCommand({ type: 'resetCamera' })}
        className="num text-caption px-2 py-1 rounded-sm border bg-bg-surface/80 text-fg-secondary border-border-subtle hover:bg-bg-elevated transition-colors"
        style={{ transitionDuration: 'var(--duration-fast)' }}
      >
        reset
      </button>
    </div>
  );
}
