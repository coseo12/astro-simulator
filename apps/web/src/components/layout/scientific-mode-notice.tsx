'use client';

import { useEffect, useState } from 'react';
import { useSimStore } from '@/store/sim-store';

const STORAGE_KEY = 'astro:scientific-notice-dismissed';

/**
 * P10-C-2 #278 — scientific 모드 빈 화면 이탈 방지 안내 (Fact-First 원칙 §"scientific 모드 UX 보호").
 *
 * - viewMode='scientific' 일 때만 표시
 * - 최초 ?view=scientific 진입 시 자동 노출 (dismiss 안 했으면)
 * - localStorage `astro:scientific-notice-dismissed` 로 영속 dismiss
 * - educational 로 돌아가도 dismiss 상태 유지 (다음 scientific 진입 시 재노출 안 함)
 */
export function ScientificModeNotice() {
  const viewMode = useSimStore((s) => s.viewMode);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (viewMode !== 'scientific') {
      setVisible(false);
      return;
    }
    const dismissed = window.localStorage.getItem(STORAGE_KEY) === '1';
    if (!dismissed) {
      setVisible(true);
    }
  }, [viewMode]);

  const dismiss = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, '1');
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed top-20 left-1/2 -translate-x-1/2 z-30 max-w-md bg-bg-surface/95 backdrop-blur border border-accent-warning/60 rounded-sm p-4 shadow-lg"
      role="status"
      aria-live="polite"
      data-testid="scientific-mode-notice"
    >
      <p className="text-body text-fg-primary mb-3">
        실제 비율에서는 대부분 천체가 매우 작게 보입니다. 줌 인이나 검색으로 특정 천체에 초점을
        맞추세요.
      </p>
      <button
        type="button"
        onClick={dismiss}
        data-testid="scientific-mode-notice-dismiss"
        className="num text-caption text-fg-secondary hover:text-fg-primary px-3 py-1.5 rounded-xs transition-colors"
        style={{ transitionDuration: 'var(--duration-fast)' }}
      >
        알겠습니다
      </button>
    </div>
  );
}
