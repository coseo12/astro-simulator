/**
 * #762 — `?bodyScaleP=` URL 파라미터 → 천체 압축 곡선 지수 p 파싱 순수 함수.
 *
 * 선례: `parse-marker-mode.ts` `parseGlowMarkerRatio` / `parse-gpu-tier.ts` 동일 구조.
 * ADR `docs/decisions/20260629-762-body-scale-monotonic-forensic.md` §5 결정 2.7 (cross-validate agy 6.3).
 *
 * 정책:
 *  - 미지정 / 빈 문자열 → `DEFAULT_BODY_SCALE_P` (0.5 sqrt — 코드 상수 SSoT)
 *  - `?bodyScaleP=0.55` → 0.55 (D-T2 사용자 실시간 튜닝 — 매 빌드 불요)
 *  - 허용 범위 [0.1, 1.0] 의 유한 수. 범위 밖 / 비수치 → default 폴백 + `console.warn`
 *    (p→0 은 모든 천체 동일 크기 = 무의미, p≥1 은 압축 무효 = 현 역전 재현 → 하한 0.1 / 상한 1.0)
 *  - 런타임 핫스왑 비지원 — 초기 hydration 시점 1회만 호출 (기존 URL flag 동형)
 */
import { DEFAULT_BODY_SCALE_P } from '@/constants/body-scale';

/** 압축 지수 허용 범위 — p→0 동일 크기 / p≥1 압축 무효 회피. */
export const BODY_SCALE_P_MIN = 0.1;
export const BODY_SCALE_P_MAX = 1.0;

export function parseBodyScaleP(urlParam: string | null | undefined): number {
  if (urlParam === null || urlParam === undefined || urlParam === '') {
    return DEFAULT_BODY_SCALE_P;
  }
  const parsed = Number(urlParam);
  if (Number.isFinite(parsed) && parsed >= BODY_SCALE_P_MIN && parsed <= BODY_SCALE_P_MAX) {
    return parsed;
  }

  console.warn(
    `[parse-body-scale-p] 유효하지 않은 ?bodyScaleP=${urlParam} — ${DEFAULT_BODY_SCALE_P} (기본) 로 폴백 (허용 [${BODY_SCALE_P_MIN}, ${BODY_SCALE_P_MAX}])`,
  );
  return DEFAULT_BODY_SCALE_P;
}
