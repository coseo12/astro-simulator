'use client';

import { useState } from 'react';
import { useSimStore } from '@/store/sim-store';
import { motion, AnimatePresence } from 'framer-motion';
import { CelestialTree } from '../panels/celestial-tree';
import { CelestialInfoPanel } from '../panels/celestial-info-panel';
import { ScenarioPresets } from '../panels/scenario-presets';
import { SatelliteInfoPanel } from '../panels/satellite-info-panel';
import { GALILEAN_IDS, useOsculatingSync } from '@/hooks/use-osculating-sync';

/** #1281 — 모바일(`max-sm`) 패널 탭. `none` = 둘 다 닫고 캔버스를 돌려준다. */
export type MobilePanel = 'tree' | 'info' | 'none';

const MOBILE_PANEL_TABS: { id: MobilePanel; label: string }[] = [
  { id: 'tree', label: '트리' },
  { id: 'info', label: '정보' },
  { id: 'none', label: '닫기' },
];

/**
 * 연구 · 샌드박스 모드 좌(트리) · 우(정보) 패널.
 *
 * #1281 — 모바일(640px 미만)에서는 두 패널이 동시에 `absolute` 라 우 패널(340px)이 좌 트리(280px)를 245px 덮었다
 * (375 실측 — 트리 첫 버튼 중심이 `info-panel-empty` 에 걸림, 계약 D9(b)). 상단에 탭 바 [트리][정보][닫기] 를 두고
 * 비활성 패널에 `max-sm:hidden` 만 붙인다 — 마운트 · 언마운트가 불변이라 framer-motion 진입/퇴장 애니메이션
 * (`AnimatePresence` 키)에 영향이 없다. 데스크톱은 탭 바가 `sm:hidden` 이고 패널 클래스도 `max-sm:` 뿐이라 불변.
 * 트리에서 천체를 골라도 정보 탭으로 자동 전환하지 않는다 (범위 최소 — architect K10).
 */
export function SidePanels() {
  const mode = useSimStore((s) => s.mode);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('tree');
  const expanded = mode === 'research' || mode === 'sandbox';
  // P9 #254 D7/D8 — Galilean Osculating 1Hz polling. 패널이 표시될 때만 enabled.
  // #246 경계: 본 훅은 데이터만 제공, 선택 상태는 미반영.
  const osc = useOsculatingSync({ enabled: expanded });

  return (
    <>
      {expanded && (
        <div
          role="group"
          aria-label="패널 선택"
          data-testid="panel-tabs"
          className="sm:hidden absolute top-12 inset-x-0 h-9 flex items-center gap-1 px-2 bg-bg-surface/90 backdrop-blur border-b border-border-subtle z-[var(--z-panel)]"
        >
          {MOBILE_PANEL_TABS.map((t) => {
            const active = mobilePanel === t.id;
            return (
              <button
                key={t.id}
                type="button"
                data-testid={`panel-tab-${t.id}`}
                aria-pressed={active}
                onClick={() => setMobilePanel(t.id)}
                className={`num text-caption whitespace-nowrap px-3 py-1 rounded-sm border transition-colors ${
                  active
                    ? 'bg-primary/20 text-fg-primary border-primary/40'
                    : 'bg-bg-surface/80 text-fg-secondary border-border-subtle hover:bg-bg-elevated'
                }`}
                style={{ transitionDuration: 'var(--duration-fast)' }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      )}
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
              className={`absolute top-12 max-sm:top-[84px] bottom-16 left-0 w-[280px] bg-bg-surface/90 backdrop-blur border-r border-border-subtle z-[var(--z-panel)] p-3 overflow-y-auto${
                mobilePanel === 'tree' ? '' : ' max-sm:hidden'
              }`}
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
              className={`absolute top-12 max-sm:top-[84px] bottom-16 right-0 w-[340px] bg-bg-surface/90 backdrop-blur border-l border-border-subtle z-[var(--z-panel)] p-3 overflow-y-auto${
                mobilePanel === 'info' ? '' : ' max-sm:hidden'
              }`}
            >
              <CelestialInfoPanel />
              <div className="mt-4 pt-3 border-t border-border-subtle">
                <ScenarioPresets />
              </div>
              <div className="mt-4 pt-3 border-t border-border-subtle">
                <SatelliteInfoPanel satellites={GALILEAN_IDS} oscElements={osc.elements} />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
