'use client';

import { useSimStore } from '@/store/sim-store';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 좌/우 도킹 패널 플레이스홀더.
 * D7 CelestialTree (#26) + D8 CelestialInfoPanel (#27)에서 실제 콘텐츠 교체.
 * 현재는 연구 모드에서만 펼침 — 레이아웃 전환 검증용.
 */
export function SidePanels() {
  const mode = useSimStore((s) => s.mode);
  const expanded = mode === 'research' || mode === 'sandbox';

  return (
    <AnimatePresence>
      {expanded && (
        <>
          <motion.aside
            key="left"
            data-testid="panel-left"
            initial={{ x: -280, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -280, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="absolute top-12 bottom-16 left-0 w-[280px] bg-bg-surface/90 backdrop-blur border-r border-border-subtle z-[var(--z-panel)] p-3 overflow-y-auto"
          >
            <h3 className="text-body-sm text-fg-secondary mb-2">천체 계층</h3>
            <p className="text-caption text-fg-tertiary">
              D7 (#26) CelestialTree에서 계층 트리로 교체 예정.
            </p>
          </motion.aside>
          <motion.aside
            key="right"
            data-testid="panel-right"
            initial={{ x: 340, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 340, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="absolute top-12 bottom-16 right-0 w-[340px] bg-bg-surface/90 backdrop-blur border-l border-border-subtle z-[var(--z-panel)] p-3 overflow-y-auto"
          >
            <h3 className="text-body-sm text-fg-secondary mb-2">천체 정보</h3>
            <p className="text-caption text-fg-tertiary">
              D8 (#27) CelestialInfoPanel에서 속성/수치/Tier 배지로 교체 예정.
            </p>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
