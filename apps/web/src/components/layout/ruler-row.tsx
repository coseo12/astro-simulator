'use client';

import { useMemo } from 'react';
import { ephemeris as ephemerisApi } from '@astro-simulator/core';
import { useSimStore } from '@/store/sim-store';
import { useRulerDistance } from '@/hooks/use-ruler-distance';
import { indexBodies } from '@/lib/body-distance';
import { formatLightTime, formatRulerDistance, rulerVisualScaleNotices } from '@/lib/ruler';

/** 거리 자리 — 시각이 아직 없거나 체인 미해석. */
const DISTANCE_PENDING_TEXT = '—';

const VARIANT_CLASS = {
  card: { root: 'text-caption', label: 'text-fg-secondary', note: 'text-mini' },
  panel: { root: 'text-body-sm', label: 'text-caption text-fg-secondary', note: 'text-caption' },
} as const;

/**
 * #1341 PR2 — 두 천체 거리 자 행 (ADR `docs/decisions/20261015-1341-trail-ruler.md` 결정 R1 · R3 ~ R6).
 *
 * 관찰 모드 정보 카드 (`variant="card"`) 와 연구 모드 우 패널 (`variant="panel"`) 이 같은 행을 쓴다 — 새 떠 있는 요소 0
 * (결정 R4). 기준점 A = store `rulerAnchorId`, B = 현재 선택 (`selectedId`). 선택 경로는 가로채지 않는다 (결정 R1).
 *
 * - 기준점 없음: 「기준점으로」 버튼만.
 * - 기준점 있음 · B 가 없거나 A 와 같음: 기준점 이름 + 안내 문구 (화면 선은 sim-canvas → scene 이 끈다).
 * - 기준점 있음 · B 다름: 「{A}까지 거리」 (물리 거리, 원값 `data-distance-m`) + 위성 배율 고지 + (연구 모드) 광시간.
 *
 * 이 컴포넌트는 장면에 명령을 보내지 않는다 — 화면 선은 store (기준점 · 선택) 를 구독하는 sim-canvas 가 보낸다.
 * 그래서 카드를 접어 이 행이 사라져도 선은 유지된다 (결정 R4).
 */
export function RulerRow({
  selectedId,
  variant,
}: {
  selectedId: string | null;
  variant: 'card' | 'panel';
}) {
  const anchorId = useSimStore((s) => s.rulerAnchorId);
  const setRulerAnchor = useSimStore((s) => s.setRulerAnchor);
  const bodiesById = useMemo(() => indexBodies(ephemerisApi.getSolarSystem().bodies), []);
  const distanceM = useRulerDistance(anchorId, selectedId);
  const cls = VARIANT_CLASS[variant];

  const setAnchorButton =
    selectedId !== null && selectedId !== anchorId ? (
      <button
        type="button"
        data-testid="ruler-set-anchor"
        onClick={() => setRulerAnchor(selectedId)}
        className="text-caption text-primary hover:underline"
      >
        기준점으로
      </button>
    ) : null;

  const anchor = anchorId !== null ? bodiesById.get(anchorId) : undefined;
  if (anchorId === null || anchor === undefined) {
    return setAnchorButton ? (
      <div data-testid="ruler" className="flex justify-end">
        {setAnchorButton}
      </div>
    ) : null;
  }

  const paired = selectedId !== null && selectedId !== anchorId;
  const notices = paired ? rulerVisualScaleNotices(bodiesById, [anchorId, selectedId]) : [];

  return (
    <section
      data-testid="ruler"
      data-ruler-anchor={anchorId}
      aria-label="거리 자"
      className={`flex flex-col gap-1 ${cls.root}`}
    >
      <dl className="flex flex-col gap-1">
        {paired ? (
          <div className="flex items-baseline justify-between gap-2">
            <dt className={`${cls.label} shrink-0`}>{anchor.nameKo}까지 거리</dt>
            <dd
              data-testid="ruler-distance"
              data-distance-m={distanceM ?? undefined}
              className="num text-fg-primary text-right"
            >
              {distanceM === null ? DISTANCE_PENDING_TEXT : formatRulerDistance(distanceM)}
            </dd>
          </div>
        ) : (
          <div className="flex items-baseline justify-between gap-2">
            <dt className={`${cls.label} shrink-0`}>기준점</dt>
            <dd data-testid="ruler-anchor-name" className="text-fg-primary text-right">
              {anchor.nameKo}
            </dd>
          </div>
        )}
        {paired && variant === 'panel' && distanceM !== null && (
          <div className="flex items-baseline justify-between gap-2">
            <dt className={`${cls.label} shrink-0`}>광시간</dt>
            <dd data-testid="ruler-light-time" className="num text-fg-primary text-right">
              {formatLightTime(distanceM)}
            </dd>
          </div>
        )}
      </dl>
      {!paired && (
        <p data-testid="ruler-hint" className={`${cls.note} text-fg-secondary`}>
          다른 천체를 선택하면 {anchor.nameKo}까지 거리를 표시합니다
        </p>
      )}
      {notices.map((text) => (
        <p
          key={text}
          data-testid="ruler-visual-scale-notice"
          className={`${cls.note} text-fg-secondary`}
        >
          {text}
        </p>
      ))}
      <div className="flex items-center justify-end gap-3">
        {setAnchorButton}
        <button
          type="button"
          data-testid="ruler-clear"
          aria-label={`기준점 ${anchor.nameKo} 해제`}
          onClick={() => setRulerAnchor(null)}
          className="text-caption text-fg-secondary hover:text-fg-primary"
        >
          기준점 해제 <span aria-hidden="true">×</span>
        </button>
      </div>
    </section>
  );
}
