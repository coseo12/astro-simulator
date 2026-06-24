'use client';

import { useEffect } from 'react';
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
  { id: 'earth', label: '지구' }, // R4 #532 — venus 다음 천체 거리 순
  { id: 'moon', label: '달' }, // R4 #532 — earth 인접 (parent-satellite 자연 그룹)
  { id: 'mars', label: '화성' }, // R5 #594 — Q4a=A (mars 만 추가, phobos/deimos 미등록 — 모바일 너비 안전 356 px < 375 px)
  { id: 'jupiter', label: '목성' }, // R6 #621 — CURRENT_R_PHASE=6 진입으로 isRPhaseFocusable 자동 enabled (배열 변경 0). galilean 4 는 showInShortcutBar=false 라 bar 미등록
  { id: 'saturn', label: '토성' }, // R7 #641 — jupiter 다음 천체 거리순 (showInShortcutBar true 전환 동반, #617 가드 정합). titan 은 showInShortcutBar=false (galilean 패턴 — URL ?focus=titan 진입)
  { id: 'uranus', label: '천왕성' }, // R8 #647 — saturn 다음 천체 거리순 (showInShortcutBar true 전환 동반, #617 가드 정합). titania 는 showInShortcutBar=false (galilean/titan 패턴 — URL ?focus=titania 진입). 12버튼 — 모바일은 overflow-x-auto 흡수 (R7 11버튼 선례)
  { id: 'neptune', label: '해왕성' }, // R9 #653 enabled — CURRENT_R_PHASE=9 1줄 자동 enabled (#613 Concrete Prediction negative→positive 전환 5번째, 배열 변경 0). triton 은 showInShortcutBar=false (galilean/titan/titania 패턴 — URL ?focus=triton 진입). ADR 20260610-r9 §축 5
  { id: 'pluto', label: '명왕성' }, // R10a #659 — PM Q3=A pluto 만 승격 (showInShortcutBar true 전환 동반, #617 가드 정합). 거리순 마지막 (39.48 AU). bar 전체 13버튼 (focus 11 + reset + free-fly — 2026-06-12 qa 실측 기준 역산) — 모바일 overflow-x-auto 흡수. ceres/haumea/makemake/eris 는 showInShortcutBar=false (URL ?focus= 진입 — #624 tradeoff). ADR 20260611-r10a §축 4
  { id: 'halley', label: '핼리 혜성' }, // R10b #664 — PM Q2=A halley 만 승격 (showInShortcutBar true 전환 동반, #617 가드 정합). ⚠️ 배치 컨벤션: "행성 8 거리순 블록 + 비-행성 카테고리 후미 (pluto → halley)" — halley a=17.834 AU 를 saturn/uranus 사이 엄격 삽입하면 행성 거리순 블록이 깨져 기각 (ADR 20260612-r10b §축 6 — 후속 비-행성 추가 시 본 컨벤션 답습). bar 전체 14버튼 = focus 12 (halley 12번째) + reset + free-fly (2026-06-12 qa 실측 — 종전 "15버튼" 표기는 +1 drift 정정) — 모바일 overflow-x-auto 흡수. encke/swift-tuttle 은 showInShortcutBar=false (URL ?focus= 진입 — #624 tradeoff)
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
  // #688 — 궤도선 토글 버튼 상태 SSoT. URL `?orbits=` 초기값을 sim-canvas 가 store 에 반영.
  const orbitLinesVisible = useSimStore((s) => s.orbitLinesVisible);
  const setOrbitLinesVisible = useSimStore((s) => s.setOrbitLinesVisible);
  const sendCommand = useSimCommand();

  // #509 — focus 중 Esc 키로 자유시점 진입. focus 없을 때는 no-op (reset 과 구분).
  // input/textarea/contenteditable 포커스 중에는 발화 차단 (사용자 입력 보호).
  useEffect(() => {
    if (selected === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
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
    <div
      className="flex items-center gap-1 overflow-x-auto whitespace-nowrap max-w-full"
      data-r1-region="shortcut-bar"
    >
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
            className={`num text-mini min-w-6 min-h-6 shrink-0 px-1 py-0.5 rounded-sm border transition-colors ${
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
          aria-pressed 로 켜짐/꺼짐 a11y 상태 노출. 클릭 → store + command 동시 (UI-owned state). */}
      <button
        type="button"
        data-testid="toggle-orbits"
        aria-pressed={orbitLinesVisible}
        title={orbitLinesVisible ? '궤도선 끄기' : '궤도선 켜기'}
        onClick={() => {
          const next = !orbitLinesVisible;
          setOrbitLinesVisible(next);
          sendCommand({ type: 'setOrbitLinesVisible', visible: next });
        }}
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
