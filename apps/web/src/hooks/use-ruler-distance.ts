'use client';

import { useEffect, useMemo, useState } from 'react';
import { ephemeris as ephemerisApi } from '@astro-simulator/core';
import { useSimStore } from '@/store/sim-store';
import { useSimBodyState, type BodyStateFn } from '@/core/sim-context';
import { computeBodyPairDistance, indexBodies } from '@/lib/body-distance';
import type { LoadedCelestialBody } from '@/lib/body-info';
import { DISTANCE_REFRESH_MS } from './use-body-distances';

/** 대상 쌍 키 — 둘 다 있고 다를 때만 non-null. */
function pairKey(anchorId: string | null, targetId: string | null): string | null {
  return anchorId !== null && targetId !== null && anchorId !== targetId
    ? `${anchorId}\u0000${targetId}`
    : null;
}

function sample(
  bodiesById: ReadonlyMap<string, LoadedCelestialBody>,
  anchorId: string,
  targetId: string,
  getBodyState: BodyStateFn | null,
): number | null {
  const jd = useSimStore.getState().julianDate;
  if (jd === null) return null;
  return computeBodyPairDistance(bodiesById, anchorId, targetId, jd, getBodyState);
}

/**
 * #1341 PR2 — 기준점 A ↔ 현재 선택 B 의 물리 거리 [m] (ADR `20261015-1341` 결정 R3).
 *
 * 카드 거리 (`useBodyDistances`) 와 같은 출처 · 같은 주기다 — 엔진 상태값 우선 · Kepler 폴백, 4 Hz
 * (`DISTANCE_REFRESH_MS`). 값이 같으면 이전 값을 그대로 두므로 시간이 멈춘 동안 재렌더가 0 이다.
 *
 * @returns 쌍이 없거나 (A · B 중 하나가 null · 같은 천체) 시각이 아직 없거나 체인 미해석이면 `null`.
 */
export function useRulerDistance(anchorId: string | null, targetId: string | null): number | null {
  const getBodyState = useSimBodyState();
  const bodiesById = useMemo(() => indexBodies(ephemerisApi.getSolarSystem().bodies), []);
  const key = pairKey(anchorId, targetId);

  const [distance, setDistance] = useState<number | null>(() =>
    key === null ? null : sample(bodiesById, anchorId!, targetId!, getBodyState),
  );
  // 쌍이 바뀌면 첫 tick 을 기다리지 않고 지금 값으로 맞춘다 (`useBodyDistances` 와 같은 「이전 렌더 값 비교」 패턴).
  const [prevKey, setPrevKey] = useState(key);
  if (key !== prevKey) {
    setPrevKey(key);
    setDistance(key === null ? null : sample(bodiesById, anchorId!, targetId!, getBodyState));
  }

  useEffect(() => {
    if (anchorId === null || targetId === null || anchorId === targetId) return;
    const timer = window.setInterval(() => {
      const next = sample(bodiesById, anchorId, targetId, getBodyState);
      setDistance((prev) => (prev === next ? prev : next));
    }, DISTANCE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [bodiesById, anchorId, targetId, getBodyState]);

  return key === null ? null : distance;
}
