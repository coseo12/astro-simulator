'use client';

import { isRPhaseFocusable } from '@astro-simulator/core/scene';
import { useSimStore } from '@/store/sim-store';
import { useSimCommand } from '@/core/sim-context';

const FOCUS_BUTTONS = [
  { id: 'sun', label: '태양' },
  { id: 'mercury', label: '수성' }, // R2 #361 — sun 다음 천체 거리 순
  { id: 'venus', label: '금성' }, // R3 #369 — mercury 다음 천체 거리 순
  { id: 'earth', label: '지구' },
  { id: 'jupiter', label: '목성' },
  { id: 'neptune', label: '해왕성' },
];

const DISABLED_TITLE = '아직 구현되지 않은 천체입니다 (R-Phase 진행 시 활성화).';

/**
 * TopBar 중앙 영역 — 임시 포커스 단축 버튼.
 * D7 CelestialTree (#26) 완성 후 제거 또는 핵심 4개만 유지.
 *
 * #402 — R-Phase Body Allowlist 가드 (defense-in-depth UI 측면).
 * `R_PHASE_BODY_ALLOWLIST` 외 body 버튼은 HTML `disabled` + opacity 0.5 + cursor:not-allowed
 * + tooltip (title 속성). scene 측 가드는 simulation-core focusOn handler 가 담당.
 * ADR: docs/decisions/20260504-r-phase-allowlist-guard.md §결정 2.
 */
export function FocusQuickButtons() {
  const selected = useSimStore((s) => s.selectedBodyId);
  const sendCommand = useSimCommand();

  return (
    <div className="flex items-center gap-1" data-r1-region="shortcut-bar">
      {FOCUS_BUTTONS.map((b) => {
        const disabled = !isRPhaseFocusable(b.id);
        // disabled 버튼은 hover/click 둘 다 브라우저가 차단 → tooltip 호환 위해 wrapper span 박제.
        // wrapper 의 title 속성이 cursor:not-allowed 영역 위에서 hover 시 표시됨.
        const button = (
          <button
            key={b.id}
            type="button"
            data-testid={`focus-${b.id}`}
            data-r-phase-disabled={disabled ? 'true' : undefined}
            disabled={disabled}
            aria-disabled={disabled || undefined}
            onClick={disabled ? undefined : () => sendCommand({ type: 'focusOn', bodyId: b.id })}
            className={`num text-caption px-2 py-1 rounded-sm border transition-colors ${
              disabled
                ? 'bg-bg-surface/80 text-fg-secondary border-border-subtle opacity-50 cursor-not-allowed'
                : selected === b.id
                  ? 'bg-primary/20 text-fg-primary border-primary/40'
                  : 'bg-bg-surface/80 text-fg-secondary border-border-subtle hover:bg-bg-elevated'
            }`}
            style={{ transitionDuration: 'var(--duration-fast)' }}
          >
            {b.label}
          </button>
        );
        if (disabled) {
          return (
            <span key={b.id} title={DISABLED_TITLE} className="inline-flex">
              {button}
            </span>
          );
        }
        return button;
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
