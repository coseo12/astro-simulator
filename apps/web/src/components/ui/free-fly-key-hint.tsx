'use client';

import { useEffect, useRef, useState } from 'react';
import { useSimStore } from '@/store/sim-store';
import { getFreeFlyHintShown, markFreeFlyHintShown } from '@/lib/onboarding-storage';

/**
 * #737 — free-fly(자유시점) 진입 키 안내 toast (글로벌 최초 1회).
 *
 * 사용자가 free-fly 모드에 처음 진입하면 WASD/QE 이동 + 우클릭 패닝 키 바인딩을 하단 toast 로
 * 1회 안내한다. free-fly 는 빈번히 진출입하는 모드라 진입마다 toast 는 피로 → 글로벌 1회만 표시 후
 * localStorage 박제, 재학습은 "조작 가이드" 도움말 버튼으로 이원화 (architect 핵심결정 6, agy 합의).
 *
 * ## 패턴 (satellite-zoom-tooltip 답습)
 *
 *   - 하단 중앙 fixed toast + auto fade-out + X 버튼 닫기. `role="status"` + `aria-live="polite"`.
 *   - `useSimStore.freeFlyMode` subscribe — false→true 전이 시점에 표시 (props 없음, 단일 책임).
 *
 * ## 터치 기기 렌더 차단 (architect 조작 안내 §모바일 분기)
 *
 *   WASD/우클릭은 터치 기기에서 무의미하므로 `pointer: coarse` 또는 `navigator.maxTouchPoints>0`
 *   감지 시 렌더하지 않는다 (마운트 후 1회 판정 — SSR/CSR mismatch 차단).
 *
 * ## 관련 이슈
 *
 *   - 이슈 #737 — architect 핵심결정 6 (글로벌 1회) + 조작 안내 §모바일 분기
 *   - `apps/web/src/components/ui/satellite-zoom-tooltip.tsx` — toast + fade 패턴 선례
 *   - `packages/core/src/scene/camera.ts:116` — WASD_KEYS 실측 SSoT (w/a/s/d/q/e)
 */

/** 자동 fade-out 까지 표시 시간 (satellite-tooltip 5초 정합). */
const AUTO_FADE_OUT_MS = 5000;

/** 페이드 애니메이션 duration (in/out). */
const FADE_DURATION_MS = 200;

/**
 * 터치 기기 판정 — `pointer: coarse` 미디어쿼리 + `navigator.maxTouchPoints`.
 *
 * 클라이언트 한정 (window/navigator 접근) — 마운트 후 useEffect 에서만 호출.
 */
function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const coarse =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const touchPoints = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  return coarse || touchPoints;
}

export function FreeFlyKeyHint() {
  const freeFlyMode = useSimStore((s) => s.freeFlyMode);
  const [visible, setVisible] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  // 터치 기기 판정 — 마운트 후 1회 (SSR 은 항상 false → Hydration 안전).
  const [touch, setTouch] = useState(false);
  // false→true 전이만 trigger (true 유지/재진입 중복 표시 방지).
  const prevFreeFlyRef = useRef(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTouch(isTouchDevice());
  }, []);

  useEffect(() => {
    const entered = freeFlyMode && !prevFreeFlyRef.current;
    prevFreeFlyRef.current = freeFlyMode;
    if (!entered) return;
    // 터치 기기 / 이미 표시한 경우 skip (글로벌 1회 박제).
    if (touch) return;
    if (getFreeFlyHintShown()) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(true);
    setFadingOut(false);
    markFreeFlyHintShown(); // 표시 시점에 글로벌 박제.
  }, [freeFlyMode, touch]);

  // 자동 fade-out — visible=true 시점부터 5초 후 fade 시작.
  useEffect(() => {
    if (!visible) return;
    const fadeStartTimer = window.setTimeout(() => setFadingOut(true), AUTO_FADE_OUT_MS);
    const hideTimer = window.setTimeout(() => {
      setVisible(false);
      setFadingOut(false);
    }, AUTO_FADE_OUT_MS + FADE_DURATION_MS);
    return () => {
      window.clearTimeout(fadeStartTimer);
      window.clearTimeout(hideTimer);
    };
  }, [visible]);

  const handleDismiss = () => {
    setFadingOut(true);
    window.setTimeout(() => {
      setVisible(false);
      setFadingOut(false);
    }, FADE_DURATION_MS);
  };

  if (touch || !visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="free-fly-key-hint"
      data-fading-out={fadingOut ? 'true' : 'false'}
      className="fixed left-1/2 z-30 flex items-center gap-3 rounded-sm border border-border-subtle bg-bg-surface/95 px-4 py-2 text-body-sm text-fg-primary shadow-lg backdrop-blur"
      style={{
        bottom: 'calc(96px + env(safe-area-inset-bottom, 0px))',
        transform: 'translateX(-50%)',
        opacity: fadingOut ? 0 : 1,
        transition: `opacity ${FADE_DURATION_MS}ms ease-out`,
        maxWidth: 'min(90vw, 520px)',
      }}
    >
      <span>
        자유시점 진입: <strong className="text-fg-primary">W/A/S/D</strong> 이동 ·{' '}
        <strong className="text-fg-primary">Q/E</strong> 상하 ·{' '}
        <strong className="text-fg-primary">우클릭 드래그</strong> 패닝
      </span>
      <button
        type="button"
        onClick={handleDismiss}
        data-testid="free-fly-key-hint-close"
        aria-label="안내 닫기"
        className="text-fg-secondary hover:text-fg-primary text-body transition-colors"
        style={{ transitionDuration: 'var(--duration-fast)' }}
      >
        ✕
      </button>
    </div>
  );
}
