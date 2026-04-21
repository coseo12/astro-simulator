'use client';

import { useEffect, useState } from 'react';
import { useSimStore } from '@/store/sim-store';

const STORAGE_KEY = 'astro:onboarding-dismissed';

/**
 * P10-C-2 #278 — 첫 진입 온보딩 툴팁 (Fact-First 원칙 §"첫 진입 온보딩").
 *
 * - 첫 방문 시 표시: "시각적 이해를 위해 크기가 과장되어 있습니다. [실제 비율로 보기]"
 * - localStorage `astro:onboarding-dismissed` 로 영속 dismiss
 * - "실제 비율로 보기" 버튼 클릭 → viewMode='scientific' 으로 전환 + dismiss
 * - 이미 scientific 모드면 노출하지 않음 (URL ?view=scientific 로 진입한 경우)
 */
export function OnboardingTooltip() {
  const viewMode = useSimStore((s) => s.viewMode);
  const setViewMode = useSimStore((s) => s.setViewMode);
  // SSR/CSR mismatch 방지 — 마운트 후에만 localStorage 확인
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const dismissed = window.localStorage.getItem(STORAGE_KEY) === '1';
    // 이미 scientific 모드로 진입했으면 온보딩 필요 없음
    if (!dismissed && viewMode === 'educational') {
      setVisible(true);
    }
    // viewMode 는 최초 1회만 체크 — 이후 토글로 scientific 이 되어도 툴팁 유지
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, '1');
    }
    setVisible(false);
  };

  const viewScientific = () => {
    setViewMode('scientific');
    dismiss();
  };

  if (!visible) return null;

  return (
    <div
      className="fixed top-20 left-1/2 -translate-x-1/2 z-30 max-w-md bg-bg-surface/95 backdrop-blur border border-border-subtle rounded-sm p-4 shadow-lg"
      role="dialog"
      aria-label="온보딩 안내"
      data-testid="onboarding-tooltip"
    >
      <p className="text-body text-fg-primary mb-3">
        현재 시각적 이해를 위해 천체 크기가 과장되어 있습니다.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={viewScientific}
          data-testid="onboarding-view-scientific"
          className="num text-caption bg-primary/25 hover:bg-primary/40 text-fg-primary px-3 py-1.5 rounded-xs transition-colors"
          style={{ transitionDuration: 'var(--duration-fast)' }}
        >
          실제 비율로 보기
        </button>
        <button
          type="button"
          onClick={dismiss}
          data-testid="onboarding-dismiss"
          className="num text-caption text-fg-secondary hover:text-fg-primary px-3 py-1.5 rounded-xs transition-colors"
          style={{ transitionDuration: 'var(--duration-fast)' }}
        >
          닫기
        </button>
      </div>
    </div>
  );
}
