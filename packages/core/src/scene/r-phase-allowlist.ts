/**
 * R-Phase 진행에 따라 focus 가능한 body id 의 단일 진실원.
 *
 * 본 SSoT 외 body 는 simulation-core focusOn handler 가 emit 차단 (defense-in-depth scene 측면).
 * UI (focus-quick-buttons.tsx) 도 본 SSoT 참조 후 disabled 처리 (defense-in-depth UI 측면).
 *
 * R-Phase 진입 시 4곳 동시 박제 의무 (ADR `20260504-r-phase-allowlist-guard.md` §결정 4):
 *   1. 본 파일에 body id 추가
 *   2. 해당 R-Phase ADR §결정 N 에 본 ADR cross-link
 *   3. apps/web/scripts/browser-verify-r-phase-allowlist.mjs expected list 갱신
 *   4. CHANGELOG `### Behavior Changes` 박제
 *
 * 현재 박제: R1 sun (#329) + R2 mercury (#361) + R3 venus (#369)
 *
 * R4 진입 시: 'earth' 추가 (지구+달)
 * R6 진입 시: 'jupiter' 추가
 * R10 진입 시: 'neptune' 추가
 */
export const R_PHASE_BODY_ALLOWLIST = Object.freeze(['sun', 'mercury', 'venus'] as const);

export type RPhaseBodyId = (typeof R_PHASE_BODY_ALLOWLIST)[number];

/**
 * bodyId 가 현재 R-Phase 활성 allowlist 에 포함되는지 검증.
 *
 * @param bodyId 검증 대상 body id. `null` / `undefined` 는 `true` 반환 — `resetCamera` 시
 *               emit 되는 `bodySelected: { id: null }` 경로를 차단하지 않기 위함.
 *               ADR `20260504-r-phase-allowlist-guard.md` §초기 박제값 참조.
 * @returns allowlist 포함 시 true. 미포함 시 false.
 */
export function isRPhaseFocusable(bodyId: string | null | undefined): boolean {
  if (bodyId === null || bodyId === undefined) return true;
  return (R_PHASE_BODY_ALLOWLIST as readonly string[]).includes(bodyId);
}
