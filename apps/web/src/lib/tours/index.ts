import { CONSTELLATION_TOUR } from './constellation-tour';
import { ECLIPSE_TOUR } from './eclipse-tour';
import { SOLAR_SYSTEM_TOUR } from './solar-system-tour';
import type { TourDef } from './types';

/**
 * #1390 — 투어 목록 (교육 모드 카드의 목록 보기 순서). 투어를 더할 때는 투어 파일 + 이 배열 1줄 (ADR `20261021-1390`
 * §Concrete Prediction PR2). 번들: T2 문안 · 단계 ≈ 2 KB 라 dynamic import 없이 정적으로 둔다 (결정 E1 — 20 KB 미만 정적).
 */
export const TOURS: readonly TourDef[] = [SOLAR_SYSTEM_TOUR, ECLIPSE_TOUR, CONSTELLATION_TOUR];

export function getTour(id: string): TourDef | null {
  return TOURS.find((t) => t.id === id) ?? null;
}

export type { TourCamera, TourDef, TourStep, TourTime } from './types';
export { TOUR_OVERVIEW, TOUR_BODY_MAX_CHARS } from './types';
