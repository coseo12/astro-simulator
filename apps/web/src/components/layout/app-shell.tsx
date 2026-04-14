'use client';

import { TopBar } from './top-bar';
import { TimeBar } from './time-bar';
import { HudCorners } from './hud-corners';
import { FocusQuickButtons } from './focus-quick-buttons';
import { ModeSwitcher } from './mode-switcher';
import { SimCanvasDynamic } from '../sim-canvas.dynamic';

/**
 * 전역 레이아웃 컨테이너.
 * 캔버스 배경 + TopBar(48) + TimeBar(64) + 4코너 HUD.
 * Persistent Layout — 라우트 전환 시에도 캔버스 유지(P1은 단일 라우트라 확장 여지만 남김).
 */
export function AppShell() {
  return (
    <div className="fixed inset-0 bg-bg-base text-fg-primary overflow-hidden">
      <SimCanvasDynamic>
        <TopBar
          left={
            <div className="flex items-center gap-2">
              <ModeSwitcher />
              <FocusQuickButtons />
            </div>
          }
        />
        <HudCorners />
        <TimeBar />
      </SimCanvasDynamic>
    </div>
  );
}
