'use client';

import { TopBar } from './top-bar';
import { TimeBar } from './time-bar';
import { HudCorners } from './hud-corners';
import { BodyInfoCard } from './body-info-card';
import { LodDevOverlay } from './lod-dev-overlay';
import { FocusQuickButtons } from './focus-quick-buttons';
import { BodySearch } from './body-search';
import { ModeSwitcher } from './mode-switcher';
import { AboutModal } from './about-modal';
import { SidePanels } from './side-panels';
import { ScaleControl } from './scale-control';
import { TimeControls } from './time-controls';
import { TimeScrubber } from './time-scrubber';
import { DateTimePicker } from './date-time-picker';
import { PhysicsEngineToggle } from './physics-engine-toggle';
import { SensitivitySettingsModal } from './sensitivity-settings-modal';
import { OnboardingModal } from './onboarding-modal';
import { BookmarkButton } from './bookmark-button';
import { DisplayPanel } from './display-panel';
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
              {/* #1293 — 천체 검색 버튼. 좌측 그룹(`shrink-0`, 모든 폭에서 보존)에 둬 375 에서도 스크롤 없이 닿는다.
                  단축 바(`shortcut-bar`) 밖에 두는 이유: 그 영역은 R1 가드 · a11y 폰트 측정 대상이라 범위를 넓히지 않는다. */}
              <BodySearch />
              <FocusQuickButtons />
            </div>
          }
          right={
            // #1281 — `w-max`: 우측 그룹 스크롤러(`top-bar.tsx`) 안에서 이 래퍼가 가용폭으로 줄어들면 flex 축소가
            // 버튼 글자를 세로로 눌렀다 (375 실측 카메라 28×76 · 조작 가이드 28×93). 내용 폭을 유지하고 넘침은 스크롤로.
            <div className="flex w-max items-center gap-2">
              <DateTimePicker />
              {/* #841 — UnitToggle 제거. unitSystem 소비자 0 (display-only 버그 패턴) +
                  "P2 확장" 은 폐기된 v2 로드맵 잔재. 재도입 시 실 포매터와 함께 신규 이슈로. */}
              <PhysicsEngineToggle />
              <SensitivitySettingsModal />
              {/* #1265 — 표시 효과 런타임 토글 (ADR 20260927-1265 결정 6 — 감도 설정과 북마크 사이). */}
              <DisplayPanel />
              <BookmarkButton />
              {/* #737 — "조작 가이드"(조작법) 와 "?"(데이터 출처) 는 의미 직교 → 버튼 분리 공존. */}
              <OnboardingModal />
              <AboutModal />
            </div>
          }
        />
        <UrlSync />
        <HudCorners />
        {/* #1281 — 관찰 모드 선택 천체 정보 카드 (좌하 고정, 종전 `focus · <id>` 칩 대체). */}
        <BodyInfoCard />
        <LodDevOverlay />
        <SidePanels />
        <ScaleControl />
        <TimeBar>
          <TimeControls />
          {/* #1288 D6~D8 — 2행 스크러버 (관찰·연구 모드 공통, 모바일 포함 상시 표시). */}
          <TimeScrubber />
        </TimeBar>
        <SatelliteZoomTooltip />
        <FreeFlyKeyHint />
      </SimCanvasDynamic>
    </div>
  );
}
