/**
 * R-Phase Body Focus Allowlist — SSoT.
 *
 * R-Phase 진행에 따라 focus 가능한 body id 의 단일 진실원.
 *
 * 본 SSoT 외 body 는 simulation-core focusOn handler 가 emit 차단 (defense-in-depth scene 측면).
 * UI (focus-quick-buttons.tsx) 도 본 SSoT 참조 후 disabled 처리 (defense-in-depth UI 측면).
 *
 * #613 — allowlist 자동 생성 (ADR `20260604-613-r-phase-metadata-ssot.md`):
 *   `R_PHASE_BODY_ALLOWLIST` 는 더 이상 하드코딩하지 않는다. `solar-system.json` 의 body
 *   메타데이터 `introducedInRPhase` 를 `CURRENT_R_PHASE` 로 필터해 자동 생성한다 (데이터 SSoT).
 *   기존 5곳 동시 박제 의무 → **3곳으로 감소**:
 *     1. (소멸) ~~본 파일 body id 추가~~ → `CURRENT_R_PHASE` 1줄 증가 (R6+ body 는 데이터에 사전 부여됨)
 *     2. 해당 R-Phase ADR §결정 N 에 본 ADR cross-link
 *     3. apps/web/scripts/browser-verify-r-phase-allowlist.mjs + browser-verify-378-focus.mjs 의
 *        `FOCUS_BODIES` 하드코딩 갱신 (정적 매칭 가드 #598 가 자동 생성값 ↔ FOCUS_BODIES 정합 차단)
 *     4. CHANGELOG `### Behavior Changes` 박제
 *     5. WASM 의존 도메인 sub-path 추가 금지 검증 (`scripts/verify-core-exports-immutable.sh`)
 *
 * 현재 박제: CURRENT_R_PHASE=11 → sun(R1) / mercury(R2) / venus(R3) / earth·moon(R4)
 *           / mars·phobos·deimos(R5) / jupiter·galilean 4(R6) / saturn·titan(R7)
 *           / uranus·titania(R8) / neptune·triton(R9)
 *           / ceres·pluto·haumea·makemake·eris(R10a — 왜소행성 5, #659)
 *           / halley·encke·swift-tuttle(R10b — 혜성 3, #664) = 27 body (전 데이터 소진 —
 *           로드맵 v3 최종 라운드).
 *
 * ⚠️ 로드맵 라벨 ↔ phase 정수 매핑 (R10 분할 — PM 2026-06-11, #659):
 *           **phase 10 = R10a 왜소행성 5 / phase 11 = R10b 혜성 3 (halley/encke/swift-tuttle)**.
 *           혜성 3 body 는 introducedInRPhase=11 재박제로 R10a 에서 자동 제외 (옵션 a —
 *           데이터만 변경, 코드 0. ADR 20260611-r10a §축 2). R10b (#664) 에서 CURRENT_R_PHASE=11
 *           1줄로 자동 포함 — **진입 완료** (ADR 20260612-r10b §축 2). 매핑 3곳 동시 박제:
 *           solar-system.json `$comment` / 본 주석 / docs/phases/roadmap-v3-incremental.md R10 행.
 *
 * ⚠️ wasm-safe 패턴: 본 모듈은 `solar-system-loader.ts` 를 import 한다 (자동 생성 소스). loader 는
 *    이미 scene 모듈들이 의존하는 core 내부 모듈이라 신규 외부 sub-path 노출은 없다. 단
 *    `packages/core/package.json` exports field 에 sub-path entry (`./scene/r-phase-allowlist`) 를
 *    추가하면 turbopack `__dirname` SSR 500 회귀 (ADR §Amendment §결정 D1) — sub-path 추가 금지 유지.
 */
import { getSolarSystem, type LoadedCelestialBody } from '../ephemeris/solar-system-loader.js';

/** 현재 도달한 R-Phase. R-Phase 진입 시 이 상수 1줄만 증가하면 allowlist 가 자동 확장된다. */
export const CURRENT_R_PHASE = 11; // R10b #664 — 혜성 3 자동 포함 (#613 자동 생성 7번째 실전. 전 데이터 소진 — 로드맵 v3 최종 라운드. 위 매핑 주석 참조)

/**
 * 주어진 phase 까지 등장한 body id 목록을 데이터 순서대로 반환하는 순수 함수.
 *
 * `R_PHASE_BODY_ALLOWLIST` 자동 생성 + R6 시뮬레이션 단위 테스트가 동일 함수를 재사용한다
 * (ADR §결정 F #3 — 필터 로직 인라인 금지).
 */
export function filterBodiesByPhase(
  bodies: readonly LoadedCelestialBody[],
  phase: number,
): string[] {
  return bodies.filter((b) => b.introducedInRPhase <= phase).map((b) => b.id);
}

export const R_PHASE_BODY_ALLOWLIST: readonly string[] = Object.freeze(
  filterBodiesByPhase(getSolarSystem().bodies, CURRENT_R_PHASE),
);

/**
 * #613 — body id 타입. 자동 생성으로 JSON import 가 wide `string` 추론이라 8개 union literal 은
 * 소실된다. 실측상 소비처 13곳 중 `RPhaseBodyId` 를 타입 파라미터로 쓰는 곳이 없어 (전부
 * `R_PHASE_BODY_ALLOWLIST` 값 + `isRPhaseFocusable` 런타임 helper 사용) 약화 비용이 낮다.
 * 별도 24-body union 추출은 데이터와 중복 하드코딩을 만들어 #613 취지(drift 제거)에 역행하므로
 * `string` 후퇴 + 런타임 가드(`isRPhaseFocusable`)로 방어한다. ADR §결정 B 재량 (b).
 */
export type RPhaseBodyId = string;

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
