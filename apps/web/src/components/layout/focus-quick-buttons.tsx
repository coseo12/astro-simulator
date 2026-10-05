'use client';

import { useEffect } from 'react';
import { useSimStore } from '@/store/sim-store';
import { useSimCommand } from '@/core/sim-context';
import { useDisplayToggle } from '@/core/use-display-toggle';
import { BodyMenu } from './body-menu';

/**
 * TopBar 좌측 단축 바 — 「천체 ▾」 메뉴 + reset · 탐색 · 궤도선.
 *
 * #1281 — 천체 12개 버튼을 메뉴 하나로 합쳤다 (이슈 Q3 = A). 1280 폭에서 12개 중 11개가 우측 그룹에 가려져 클릭할 수
 * 없었다 (`top-bar.tsx`). 항목 · R-Phase 가드 (#402) 는 `body-menu.tsx` 로 이전했다. 「D7 이후 제거」 로 시작한 임시
 * 영역이었으나 캔버스 클릭 (#713) · 트리 (연구 모드) 와 함께 상시 진입 경로로 남는다.
 *
 * 영역 속성 `data-r1-region="shortcut-bar"` 는 유지한다 (R1 픽셀 가드 · `verify-a11y-baseline` 폰트 측정 대상).
 */
export function FocusQuickButtons() {
  const selected = useSimStore((s) => s.selectedBodyId);
  // #688 — 궤도선 토글 버튼 상태 SSoT. URL `?orbits=` 초기값을 sim-canvas 가 store 에 반영.
  const orbitLinesVisible = useSimStore((s) => s.orbitLinesVisible);
  const sendCommand = useSimCommand();
  // #1265 — 궤도선 토글은 표시 패널과 같은 훅을 쓴다 (Q4 — 같은 store · 같은 URL 쓰기 지점, 계약 D3 · D11).
  const toggleDisplay = useDisplayToggle();

  // #509 — focus 중 Esc 키로 자유시점 진입. focus 없을 때는 no-op (reset 과 구분).
  // input/textarea/contenteditable 포커스 중에는 발화 차단 (사용자 입력 보호).
  useEffect(() => {
    if (selected === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // #1265 — 표시 패널은 capture 단계에서 Esc 를 받아 preventDefault 하고 닫힌다. 이 리스너(bubble)가 돌 때 패널은
      // 선택 변경 여부와 무관하게 **이미 없으므로** DOM 속성으로는 막을 수 없다 (PR #1268 변이 c 실측) — 이 한 줄이
      // 패널 Esc 의 유일한 차단이다 (ADR `20260927-1265` Amendment 1). #1281 천체 메뉴도 같은 방식으로 닫히므로 같은 한 줄이
      // 메뉴 Esc 의 자유시점 오발화를 막는다 (계약 D6).
      if (e.defaultPrevented) return;
      // #737 — 모달 open 중 Esc 는 모달 닫기 전용. native window listener 라 React
      // stopPropagation 으로 차단 불가 → DOM 속성 가드로 free-fly 오발화 차단
      // (about/sensitivity/onboarding 3 모달 일괄 정합).
      if (document.querySelector('[data-modal-open="true"]')) return;
      const el = document.activeElement;
      const isEditable =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable);
      if (isEditable) return;
      sendCommand({ type: 'enterFreeFly' });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected, sendCommand]);

  return (
    <div className="flex items-center gap-1 whitespace-nowrap" data-r1-region="shortcut-bar">
      <BodyMenu />
      <button
        type="button"
        data-testid="focus-reset"
        onClick={() => sendCommand({ type: 'resetCamera' })}
        className="num text-mini min-w-6 min-h-6 shrink-0 px-1 py-0.5 rounded-sm border bg-bg-surface/80 text-fg-secondary border-border-subtle hover:bg-bg-elevated transition-colors"
        style={{ transitionDuration: 'var(--duration-fast)' }}
      >
        reset
      </button>
      {/* #699 — 자유시점 진입 (default 진입 허용 — ADR §5-5 / 축 4). focus 전제 폐기: focus 없이도
          (default 태양계 개요 화면에서도) 진입 가능. default 진입 = 현 카메라 뷰포트/target 계승
          (재배치 없음 — subscribe 의 freeFlyMode false→true 전이 경로가 detachToFreeFly 로 라우팅).
          이전 #509 의 disabled={selected===null} + opacity 50% + cursor-not-allowed 제거 → 항상 활성. */}
      <button
        type="button"
        data-testid="focus-free-fly"
        title="자유시점 (Esc)"
        onClick={() => sendCommand({ type: 'enterFreeFly' })}
        className="num text-mini min-w-6 min-h-6 shrink-0 px-1 py-0.5 rounded-sm border bg-bg-surface/80 text-fg-secondary border-border-subtle hover:bg-bg-elevated transition-colors"
        style={{ transitionDuration: 'var(--duration-fast)' }}
      >
        탐색
      </button>
      {/* #688 — 궤도선 on/off 토글. 27 body (행성+위성 일괄, scene API satellite 일반화 #627).
          aria-pressed 로 켜짐/꺼짐 a11y 상태 노출. #1265 — 클릭은 공용 훅 → store + command + URL(replace). */}
      <button
        type="button"
        data-testid="toggle-orbits"
        aria-pressed={orbitLinesVisible}
        title={orbitLinesVisible ? '궤도선 끄기' : '궤도선 켜기'}
        onClick={() => toggleDisplay('orbits')}
        className={`num text-mini min-w-6 min-h-6 shrink-0 px-1 py-0.5 rounded-sm border transition-colors ${
          orbitLinesVisible
            ? 'bg-primary/20 text-fg-primary border-primary/40'
            : 'bg-bg-surface/80 text-fg-secondary border-border-subtle hover:bg-bg-elevated'
        }`}
        style={{ transitionDuration: 'var(--duration-fast)' }}
      >
        궤도선
      </button>
    </div>
  );
}
