'use client';

import { useMemo } from 'react';
import { ephemeris as ephemerisApi } from '@astro-simulator/core';
import { findBodyAndParent, type BodyAndParent } from '@/lib/body-info';

/**
 * #1281 — 선택 천체 데이터 + 모체 조회 (연구 모드 우 패널 · 관찰 모드 카드 공용).
 * 데이터 SSoT 는 `ephemeris.getSolarSystem()` — id 가 바뀔 때만 재조회한다.
 */
export function useBodyInfo(id: string | null): BodyAndParent {
  return useMemo(() => findBodyAndParent(ephemerisApi.getSolarSystem().bodies, id), [id]);
}
