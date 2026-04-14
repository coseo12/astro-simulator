'use client';

import { useSimStore } from '@/store/sim-store';
import { motion, AnimatePresence } from 'framer-motion';
import { CelestialTree } from '../panels/celestial-tree';
import { CelestialInfoPanel } from '../panels/celestial-info-panel';
import { ScenarioPresets } from '../panels/scenario-presets';

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
            <CelestialTree />
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
            <CelestialInfoPanel />
            <div className="mt-4 pt-3 border-t border-border-subtle">
              <ScenarioPresets />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
