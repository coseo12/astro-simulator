'use client';

import { useEffect, useMemo, useState } from 'react';
import { ephemeris as ephemerisApi } from '@astro-simulator/core';
import { useSimStore } from '@/store/sim-store';
import { useSimBodyState, type BodyStateFn } from '@/core/sim-context';
import { computeBodyDistances, indexBodies, type BodyDistances } from '@/lib/body-distance';
import type { LoadedCelestialBody } from '@/lib/body-info';

/**
 * 카드 거리 갱신 주기 (ms) — 4Hz.
 *
 * 매 프레임 구독(`julianDate` selector)을 쓰지 않는 이유는 렌더 비용이 아니라 **판독성**이다 —
 * 60Hz 로 숫자가 바뀌면 사람이 읽을 수 없다. 결과가 같으면 이전 객체를 그대로 돌려 setState 를
 * bail-out 하므로 시간이 멈춘 동안에는 재렌더가 0 이다. tick 당 위치 계산 ≤ 2고리 (위성 = 자기 + 모체).
 */
export const DISTANCE_REFRESH_MS = 250;

function sample(
  bodiesById: ReadonlyMap<string, LoadedCelestialBody>,
  bodyId: string | null,
  getBodyState: BodyStateFn | null,
): BodyDistances | null {
  const jd = useSimStore.getState().julianDate;
  if (bodyId === null || jd === null) return null;
  return computeBodyDistances(bodiesById, bodyId, jd, getBodyState);
}

function sameDistances(a: BodyDistances | null, b: BodyDistances | null): boolean {
  if (a === null || b === null) return a === b;
  return a.fromSunM === b.fromSunM && a.fromParentM === b.fromParentM;
}

/**
 * #1281 — 선택 천체의 현재 시뮬레이션 시각 기준 태양·모체 거리.
 *
 * 거리 출처는 엔진이 주는 상태값(`useSimBodyState`)이 우선이고, 없으면 Kepler 식이다
 * (`computeBodyDistances`). 시각이 멈춰 있어도 tick 마다 다시 표본을 뜨므로 **엔진 전환**
 * (Kepler ↔ Newton, 엔진 준비 완료)도 다음 tick 에 반영된다 — `julianDate` 변화만 따라가면
 * 일시정지 중 엔진을 바꿨을 때 이전 엔진 기준 값이 남는다.
 *
 * @param bodyId `null` 이면 폴링하지 않는다 (카드가 안 보이거나 접힌 동안).
 * @returns 시각(`julianDate`)이 아직 없거나 `bodyId` 가 `null` 이면 `null`.
 */
export function useBodyDistances(bodyId: string | null): BodyDistances | null {
  const getBodyState = useSimBodyState();
  const bodiesById = useMemo(() => indexBodies(ephemerisApi.getSolarSystem().bodies), []);

  const [distances, setDistances] = useState<BodyDistances | null>(() =>
    sample(bodiesById, bodyId, getBodyState),
  );
  // 대상이 바뀌거나 재활성되면 첫 tick 을 기다리지 않고 지금 값으로 맞춘다 — 그러지 않으면 최대
  // DISTANCE_REFRESH_MS 동안 직전 대상의 값이 남는다. 「이전 렌더 값 비교」 패턴
  // (effect 안 setState 는 cascading render 라 쓰지 않는다).
  const [prevBodyId, setPrevBodyId] = useState(bodyId);
  if (bodyId !== prevBodyId) {
    setPrevBodyId(bodyId);
    setDistances(sample(bodiesById, bodyId, getBodyState));
  }

  useEffect(() => {
    if (bodyId === null) return;
    const timer = window.setInterval(() => {
      const next = sample(bodiesById, bodyId, getBodyState);
      setDistances((prev) => (sameDistances(prev, next) ? prev : next));
    }, DISTANCE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [bodiesById, bodyId, getBodyState]);

  return bodyId === null ? null : distances;
}
