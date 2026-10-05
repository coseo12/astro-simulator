'use client';

import { useEffect, useMemo, useState } from 'react';
import { ephemeris as ephemerisApi } from '@astro-simulator/core';
import { useSimStore } from '@/store/sim-store';
import { computeBodyDistances, indexBodies, type BodyDistances } from '@/lib/body-distance';

/**
 * 카드 거리 갱신 주기 (ms) — 4Hz.
 *
 * 매 프레임 구독(`julianDate` selector)을 쓰지 않는 이유는 렌더 비용이 아니라 **판독성**이다 —
 * 60Hz 로 숫자가 바뀌면 사람이 읽을 수 없다. 값이 같으면 React 가 setState 를 bail-out 하므로
 * 시간이 멈춘 동안에는 재렌더가 0 이다. tick 당 Kepler 해 ≤ 3회 (위성 = 자기 + 모체).
 */
export const DISTANCE_REFRESH_MS = 250;

/**
 * #1281 — 선택 천체의 현재 시뮬레이션 시각 기준 태양·모체 거리.
 *
 * @param bodyId `null` 이면 폴링하지 않는다 (카드가 안 보이거나 접힌 동안).
 * @returns 시각(`julianDate`)이 아직 없거나 `bodyId` 가 `null` 이면 `null`.
 */
export function useBodyDistances(bodyId: string | null): BodyDistances | null {
  const [jd, setJd] = useState<number | null>(() => useSimStore.getState().julianDate);
  // 대상이 바뀌거나 재활성되면 첫 tick 을 기다리지 않고 현재 시각으로 맞춘다 — 그러지 않으면 최대
  // DISTANCE_REFRESH_MS 동안 직전 대상의 시각으로 새 대상을 계산한다. 「이전 렌더 값 비교」 패턴
  // (effect 안 setState 는 cascading render 라 쓰지 않는다).
  const [prevBodyId, setPrevBodyId] = useState(bodyId);
  if (bodyId !== prevBodyId) {
    setPrevBodyId(bodyId);
    setJd(useSimStore.getState().julianDate);
  }

  useEffect(() => {
    if (bodyId === null) return;
    const timer = window.setInterval(() => {
      setJd(useSimStore.getState().julianDate);
    }, DISTANCE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [bodyId]);

  const bodiesById = useMemo(() => indexBodies(ephemerisApi.getSolarSystem().bodies), []);

  return useMemo(() => {
    if (bodyId === null || jd === null) return null;
    return computeBodyDistances(bodiesById, bodyId, jd);
  }, [bodiesById, bodyId, jd]);
}
