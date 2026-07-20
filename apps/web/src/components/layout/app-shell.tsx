'use client';

import { TopBar } from './top-bar';
import { TimeBar } from './time-bar';
import { HudCorners } from './hud-corners';
import { LodDevOverlay } from './lod-dev-overlay';
import { FocusQuickButtons } from './focus-quick-buttons';
import { ModeSwitcher } from './mode-switcher';
import { AboutModal } from './about-modal';
import { SidePanels } from './side-panels';
import { ScaleControl } from './scale-control';
import { TimeControls } from './time-controls';
import { DateTimePicker } from './date-time-picker';
import { PhysicsEngineToggle } from './physics-engine-toggle';
import { SensitivitySettingsModal } from './sensitivity-settings-modal';
import { OnboardingModal } from './onboarding-modal';
import { BookmarkButton } from './bookmark-button';
import { UrlSync } from '../../core/url-sync';
import { SimCanvasDynamic } from '../sim-canvas.dynamic';
import { SatelliteZoomTooltip } from '../ui/satellite-zoom-tooltip';
import { FreeFlyKeyHint } from '../ui/free-fly-key-hint';

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
          right={
            <div className="flex items-center gap-2">
              <DateTimePicker />
              {/* #841 — UnitToggle 제거. unitSystem 소비자 0 (display-only 버그 패턴) +
                  "P2 확장" 은 폐기된 v2 로드맵 잔재. 재도입 시 실 포매터와 함께 신규 이슈로. */}
              <PhysicsEngineToggle />
              <SensitivitySettingsModal />
              <BookmarkButton />
              {/* #737 — "조작 가이드"(조작법) 와 "?"(데이터 출처) 는 의미 직교 → 버튼 분리 공존. */}
              <OnboardingModal />
              <AboutModal />
            </div>
          }
        />
        <UrlSync />
        <HudCorners />
        <LodDevOverlay />
        <SidePanels />
        <ScaleControl />
        <TimeBar>
          <TimeControls />
        </TimeBar>
        <SatelliteZoomTooltip />
        <FreeFlyKeyHint />
      </SimCanvasDynamic>
    </div>
  );
}
