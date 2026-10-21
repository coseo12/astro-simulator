/**
 * #1390 — `?tour=<id>&step=<n>` 파서 (ADR `docs/decisions/20261021-1390-education-tour.md` 결정 · URL, Q6 (b)).
 *
 * 순수 함수 — 경고 · 키 제거는 호출측 (`url-sync.tsx`) 이 한다 (`?focus=` #418 처분과 같음). 온보딩 모달도 같은 함수로 「유효한
 * 투어 진입인가」 를 판정한다 (자동 표시 생략 — §교차검증 합의 7).
 *
 * - `tour` 없음 · 빈 문자열 → `none`.
 * - `step` 생략 → 1단계. `step` 은 1-based 정수 문자열만 (`0` · `N+1` · `1.5` · `abc` · `01` 거부).
 * - 모르는 투어 · 범위 밖 단계 → `invalid` (키 제거 + 목록 표시).
 */

import { TOURS } from './index';
import type { TourDef } from './types';

export type TourParamResult =
  | { kind: 'none' }
  | { kind: 'valid'; tourId: string; stepIndex: number }
  | { kind: 'invalid'; reason: string };

/** 1-based 단계 번호 — 선행 0 없는 양의 정수만. */
const STEP_PATTERN = /^[1-9]\d*$/;

export function parseTourParam(
  tour: string | null | undefined,
  step: string | null | undefined,
  tours: readonly TourDef[] = TOURS,
): TourParamResult {
  if (tour === null || tour === undefined || tour.trim() === '') return { kind: 'none' };
  const def = tours.find((t) => t.id === tour.trim());
  if (!def) return { kind: 'invalid', reason: `알 수 없는 투어 ?tour=${tour}` };
  if (step === null || step === undefined) return { kind: 'valid', tourId: def.id, stepIndex: 0 };
  const raw = step.trim();
  if (!STEP_PATTERN.test(raw)) {
    return { kind: 'invalid', reason: `단계 번호가 아니다 ?step=${step}` };
  }
  const n = Number(raw);
  if (n > def.steps.length) {
    return {
      kind: 'invalid',
      reason: `범위 밖 단계 ?step=${step} (투어 ${def.id} 는 1~${def.steps.length})`,
    };
  }
  return { kind: 'valid', tourId: def.id, stepIndex: n - 1 };
}
