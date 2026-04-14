'use client';

import { useSimStore } from '@/store/sim-store';
import { useCallback, useState } from 'react';

/**
 * 현재 시뮬 상태(t/focus/speed/engine/mode)를 담은 URL을 클립보드에 복사 (#108).
 *
 * URL sync는 기본 쓰기를 t에 대해 하지 않는다(매 프레임 쓰기 → 렌더 폭주).
 * 대신 이 버튼으로 "지금 이 순간"의 스냅샷을 URL로 고정해 공유/복원 가능.
 */
export function BookmarkButton() {
  const julianDate = useSimStore((s) => s.julianDate);
  const mode = useSimStore((s) => s.mode);
  const selectedBodyId = useSimStore((s) => s.selectedBodyId);
  const timeScale = useSimStore((s) => s.timeScale);
  const physicsEngine = useSimStore((s) => s.physicsEngine);
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    if (typeof window === 'undefined' || julianDate === null) return;
    const url = new URL(window.location.href);
    const sp = url.searchParams;
    sp.set('t', julianDate.toFixed(5));
    if (mode !== 'observe') sp.set('mode', mode);
    else sp.delete('mode');
    if (selectedBodyId) sp.set('focus', selectedBodyId);
    else sp.delete('focus');
    if (timeScale !== 86_400) sp.set('speed', String(timeScale));
    else sp.delete('speed');
    if (physicsEngine !== 'kepler') sp.set('engine', physicsEngine);
    else sp.delete('engine');
    const text = url.toString();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 폴백 — 클립보드 API 미지원 브라우저
      window.prompt('이 URL을 복사하세요', text);
    }
  }, [julianDate, mode, selectedBodyId, timeScale, physicsEngine]);

  return (
    <button
      type="button"
      data-testid="bookmark-button"
      onClick={copy}
      disabled={julianDate === null}
      title="현재 시각·포커스·엔진·속도를 URL에 담아 복사"
      className="num text-caption px-2 py-1 rounded-sm border border-border-subtle bg-bg-surface/80 backdrop-blur text-fg-secondary hover:bg-bg-elevated disabled:opacity-40"
    >
      {copied ? '✓ 복사됨' : '🔖 북마크'}
    </button>
  );
}
