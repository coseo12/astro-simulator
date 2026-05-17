/**
 * R-Phase Body Focus Allowlist — SSoT.
 *
 * R-Phase 진행에 따라 focus 가능한 body id 의 단일 진실원.
 *
 * 본 SSoT 외 body 는 simulation-core focusOn handler 가 emit 차단 (defense-in-depth scene 측면).
 * UI (focus-quick-buttons.tsx) 도 본 SSoT 참조 후 disabled 처리 (defense-in-depth UI 측면).
 *
 * R-Phase 진입 시 5곳 동시 박제 의무 (ADR `20260504-r-phase-allowlist-guard.md` §결정 4 + §Amendment 결정 D2):
 *   1. 본 파일에 body id 추가
 *   2. 해당 R-Phase ADR §결정 N 에 본 ADR cross-link
 *   3. apps/web/scripts/browser-verify-r-phase-allowlist.mjs expected list 갱신
 *   4. CHANGELOG `### Behavior Changes` 박제
 *   5. WASM 의존 도메인 (scene / physics / render / gpu) 한정 sub-path 추가 금지 검증
 *      — `scripts/verify-core-exports-immutable.sh` 자동 차단 (라운드 1 turbopack `__dirname` SSR 500 회귀 가드)
 *
 * 현재 박제: R1 sun (#329) + R2 mercury (#361) + R3 venus (#369)
 *
 * ⚠️ wasm-safe 패턴: 본 모듈은 `packages/core/src/scene/index.ts` 의 `export *` re-export 만 통해 노출된다.
 *    `packages/core/package.json` exports field 에 sub-path entry (`./scene/r-phase-allowlist`) 를 추가하면
 *    turbopack module dep graph 변경으로 wasm-pack `--target nodejs` 의 `__dirname` resolve 가
 *    `/ROOT/...` 가상 path 로 ENOENT 발생 → SSR 500. ADR §Amendment §결정 D1 참조.
 */
export const R_PHASE_BODY_ALLOWLIST = Object.freeze(['sun', 'mercury', 'venus'] as const);

export type RPhaseBodyId = (typeof R_PHASE_BODY_ALLOWLIST)[number];

/**
 * R-Phase allowlist 검증 helper.
 *
 * @param bodyId 검사 대상 body id. `null` / `undefined` 는 `resetCamera` / free-fly 경로 (`bodySelected: { id: null }`)
 *               를 차단하지 않기 위해 `true` 반환. 본 ADR §결정 3 참조.
 * @returns allowlist 에 포함되면 `true`, 아니면 `false`.
 */
export function isRPhaseFocusable(bodyId: string | null | undefined): boolean {
  if (bodyId === null || bodyId === undefined) return true;
  return (R_PHASE_BODY_ALLOWLIST as readonly string[]).includes(bodyId);
}
