'use client';

import { useEffect } from 'react';
import { useSimStore, type ViewMode } from '@/store/sim-store';

interface ViewModeDef {
  id: ViewMode;
  label: string;
  tooltip: string;
}

const VIEW_MODES: ViewModeDef[] = [
  {
    id: 'educational',
    label: '교육',
    tooltip: '시각 이해를 위한 크기/거리 과장 (디폴트)',
  },
  {
    id: 'scientific',
    label: '사실',
    tooltip: 'IAU 2015 실측 비율 1.0 — sub-pixel 이탈 주의',
  },
];

/**
 * P10-C #278 — 뷰 모드 토글 (Fact-First 원칙 §"모드 토글").
 *
 * 기존 `ModeSwitcher` (관찰/연구) 와 직교. 두 축이 독립적으로 동작한다.
 *
 * - 2-버튼 토글: educational ↔ scientific
 * - 키보드 단축키 `m` — input/textarea 포커스 중에는 무시 (e.target.tagName 체크)
 * - `data-view-mode` DOM 어트리뷰트 동기화 (E2E 셀렉터)
 */
export function ViewModeSwitcher() {
  const viewMode = useSimStore((s) => s.viewMode);
  const setViewMode = useSimStore((s) => s.setViewMode);

  // viewMode → html[data-view-mode] 동기화
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-view-mode', viewMode);
    }
  }, [viewMode]);

  // 키보드 단축키 `m` — educational ↔ scientific 토글
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'm' && e.key !== 'M') return;
      // 입력 요소 포커스 중에는 무시 (사용자 타이핑 방해 방지)
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      setViewMode(viewMode === 'educational' ? 'scientific' : 'educational');
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [viewMode, setViewMode]);

  return (
    <div
      className="flex items-center gap-0.5 bg-bg-surface/80 backdrop-blur border border-border-subtle rounded-sm p-0.5"
      data-testid="view-mode-switcher"
      role="radiogroup"
      aria-label="뷰 모드"
    >
      {VIEW_MODES.map((m) => {
        const active = viewMode === m.id;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={active}
            data-testid={`view-mode-${m.id}`}
            data-active={active}
            title={m.tooltip}
            onClick={() => setViewMode(m.id)}
            className={`num text-caption px-2 py-1 rounded-xs transition-colors ${
              active ? 'bg-primary/25 text-fg-primary' : 'text-fg-secondary hover:bg-bg-elevated'
            }`}
            style={{ transitionDuration: 'var(--duration-fast)' }}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
