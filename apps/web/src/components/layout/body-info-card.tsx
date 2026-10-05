'use client';

import { useEffect, useRef, useState } from 'react';
// #402 / #1281 — named import 만 (namespace `scene`/`physics` 경유 금지 — SSR 500, core/src/index.ts 주석).
import { ephemeris as ephemerisApi, isRPhaseFocusable } from '@astro-simulator/core';
import { useSimStore } from '@/store/sim-store';
import { useSwitchMode } from '@/core/use-switch-mode';
import { useBodyInfo } from '@/hooks/use-body-info';
import { useBodyDistances } from '@/hooks/use-body-distances';
import {
  PERIOD_UNAVAILABLE_TEXT,
  formatDays,
  formatKmKo,
  formatRadiusKm,
  formatSunDistance,
  kindLabel,
  orbitalPeriodSeconds,
  parentDistanceLabel,
  rPhaseBlockedMessage,
} from '@/lib/body-info';
import { TIER_META, isDataTier } from '../ui/tier-badge';

/** 태양 카드의 태양 거리 자리 문구. */
const SUN_CENTER_TEXT = '태양계 중심';
/** 시각(`julianDate`)이 아직 없어 거리를 낼 수 없을 때. */
const DISTANCE_PENDING_TEXT = '—';
/** 모체 체인이 끊겨 거리 계산이 불가할 때 (fail-visible). */
const DISTANCE_UNAVAILABLE_TEXT = '계산 불가';
/** 카드 · 칩 공통 위치 — 타임바(h-16) 위, 좌하. 종전 `focus · <id>` 칩 자리. */
const CARD_POSITION = 'absolute bottom-20 left-2 z-[var(--z-hud)]';

/**
 * #1281 — 관찰 모드 선택 천체 정보 카드 (좌하 고정).
 *
 * - 관찰 모드에서 선택 천체가 있을 때만 렌더. 연구 모드는 우 패널이 같은 역할을 한다.
 * - × 는 **카드만 접는다** — `selectedBodyId` 를 건드리지 않으므로 카메라 포커스가 유지된다
 *   (접기가 선택 해제로 이어지면 카메라가 이동한다 — 이슈 #1281 §위험).
 * - 접힘 상태는 컴포넌트 로컬. 선택이 바뀌면 다시 펼친다 — 「이전 렌더 값 비교」로 리셋하므로
 *   A 접기 → B → A 도 열리고, Esc(자유시점) → `null` → 같은 천체 재선택도 열린다.
 *   (✗ `collapsedFor: id` 방식은 A→B→A 에서 A 가 접힌 채 남아 계약과 어긋난다.)
 * - Esc 는 기존 의미(자유시점 진입, `focus-quick-buttons.tsx`)를 유지한다 — 선택이 `null` 이 되어
 *   카드도 사라진다. 카드는 Esc 를 따로 잡지 않는다.
 */
export function BodyInfoCard() {
  const mode = useSimStore((s) => s.mode);
  const selected = useSimStore((s) => s.selectedBodyId);
  const { data, parent } = useBodyInfo(selected);
  const switchMode = useSwitchMode();

  const [collapsed, setCollapsed] = useState(false);
  const [prevSelected, setPrevSelected] = useState(selected);
  if (selected !== prevSelected) {
    setPrevSelected(selected);
    setCollapsed(false);
  }

  const visible = mode === 'observe' && selected !== null && data !== null;
  const blocked = visible && !isRPhaseFocusable(selected);
  // 접혔거나 안 보이거나 차단된 동안에는 거리를 폴링하지 않는다.
  const distances = useBodyDistances(visible && !collapsed && !blocked ? selected : null);

  // 사용자가 접기/펼치기를 누른 직후에만 반대쪽 버튼으로 포커스를 옮긴다 (누른 버튼이 언마운트되어
  // 포커스가 body 로 빠지는 것을 막는다). 선택 변경에 의한 리셋에서는 포커스를 건드리지 않는다.
  const focusAfterToggle = useRef(false);
  const collapseRef = useRef<HTMLButtonElement>(null);
  const expandRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!focusAfterToggle.current) return;
    focusAfterToggle.current = false;
    (collapsed ? expandRef : collapseRef).current?.focus();
  }, [collapsed]);

  if (!visible) return null;

  const toggle = (next: boolean) => {
    focusAfterToggle.current = true;
    setCollapsed(next);
  };

  if (collapsed) {
    return (
      <button
        ref={expandRef}
        type="button"
        data-testid="body-card-expand"
        data-hud-chip
        aria-label={`${data.nameKo} 정보 카드 펼치기`}
        onClick={() => toggle(false)}
        className={`${CARD_POSITION} hud-chip px-2 py-1 text-caption text-fg-primary hover:bg-bg-elevated`}
      >
        {data.nameKo} <span aria-hidden="true">▸</span>
      </button>
    );
  }

  const collapseButton = (
    <button
      ref={collapseRef}
      type="button"
      data-testid="body-card-collapse"
      aria-label="정보 카드 접기"
      onClick={() => toggle(true)}
      className="shrink-0 -mr-1 -mt-1 px-1.5 text-fg-secondary hover:text-fg-primary rounded-xs"
    >
      ×
    </button>
  );

  if (blocked) {
    // #403 R-Phase Allowlist 가드 — 연구 모드 우 패널과 같은 차단 문구.
    return (
      <section
        data-testid="body-card"
        data-hud-chip
        aria-label={`${data.nameKo} 정보`}
        className={`${CARD_POSITION} hud-chip w-[17.5rem] max-w-[calc(100vw-1rem)] p-3 flex items-start gap-2`}
      >
        <p
          data-testid="body-card-r-phase-blocked"
          className="text-caption text-fg-secondary flex-1"
        >
          {rPhaseBlockedMessage(data.nameKo)}
        </p>
        {collapseButton}
      </section>
    );
  }

  const isRoot = data.parentId == null;
  const sunDistanceText = isRoot
    ? SUN_CENTER_TEXT
    : distances === null
      ? DISTANCE_PENDING_TEXT
      : distances.fromSunM === null
        ? DISTANCE_UNAVAILABLE_TEXT
        : formatSunDistance(distances.fromSunM);
  // 위성(모체가 계 중심이 아닌 body)만 모체 거리 행을 둔다.
  const showParentRow = parent !== null && parent.parentId != null;
  const parentDistanceText =
    distances === null
      ? DISTANCE_PENDING_TEXT
      : distances.fromParentM === null
        ? DISTANCE_UNAVAILABLE_TEXT
        : formatKmKo(distances.fromParentM / 1000);
  const periodSeconds = data.orbit ? orbitalPeriodSeconds(data, parent) : null;

  // D8 — tier 는 데이터 파일 루트 `tier` 에서 읽는다 (하드코딩 0).
  const tier = ephemerisApi.getSolarSystem().tier;
  const tierMeta = isDataTier(tier) ? TIER_META[tier] : null;

  return (
    <section
      data-testid="body-card"
      data-hud-chip
      aria-label={`${data.nameKo} 정보`}
      className={`${CARD_POSITION} hud-chip w-[17.5rem] max-w-[calc(100vw-1rem)] p-3 flex flex-col gap-2`}
    >
      <header className="flex items-start gap-2">
        <span
          className="mt-1.5 inline-block w-2.5 h-2.5 rounded-full shrink-0"
          style={{ background: data.colorHint?.hex ?? '#888' }}
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h2 data-testid="body-card-name" className="font-display text-body text-fg-primary">
              {data.nameKo}
            </h2>
            <span data-testid="body-card-name-en" className="text-caption text-fg-secondary">
              {data.nameEn}
            </span>
          </div>
          <div data-testid="body-card-kind" className="text-caption text-fg-secondary">
            {kindLabel(data.kind)}
          </div>
        </div>
        {collapseButton}
      </header>

      <dl className="flex flex-col gap-1 text-caption">
        <CardRow label="태양 거리" value={sunDistanceText} testId="body-card-sun-distance" />
        {showParentRow && (
          <CardRow
            label={parentDistanceLabel(parent.nameKo)}
            value={parentDistanceText}
            testId="body-card-parent-distance"
          />
        )}
        <CardRow label="반지름" value={formatRadiusKm(data.radius)} testId="body-card-radius" />
        {data.orbit && (
          <CardRow
            label="공전주기"
            value={periodSeconds !== null ? formatDays(periodSeconds) : PERIOD_UNAVAILABLE_TEXT}
            testId="body-card-period"
          />
        )}
      </dl>

      <footer className="flex items-center justify-between gap-2 pt-1 border-t border-border-subtle">
        <span data-testid="body-card-tier" className="num text-mini text-fg-secondary">
          {tierMeta ? (
            <>
              <span
                aria-hidden="true"
                className="inline-block w-2 h-2 rounded-full mr-1 align-middle"
                style={{ background: tierMeta.color }}
              />
              {tierMeta.source} · T{tier}
            </>
          ) : (
            // 정의 밖 tier — 색 · 출처 없이 숫자만 (fail-visible, 조용히 T1 로 흡수하지 않는다).
            `T${tier}`
          )}
        </span>
        <button
          type="button"
          data-testid="body-card-research-link"
          onClick={() => switchMode('research')}
          className="text-caption text-primary hover:underline"
        >
          자세히 → 연구 모드
        </button>
      </footer>
    </section>
  );
}

function CardRow({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-fg-secondary shrink-0">{label}</dt>
      <dd data-testid={testId} className="num text-fg-primary text-right">
        {value}
      </dd>
    </div>
  );
}
