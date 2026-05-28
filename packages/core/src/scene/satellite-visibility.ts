/**
 * Satellite Visibility Guard — SSoT (#546 R4 Amendment 4 후속).
 *
 * `parent body 가 focus` 상태일 때 `child satellite` 의 LOD level 을 **사용자 시각 인지 가능 대역**
 * 으로 floor 강제하는 외부 가드. LOD 엔진 본체 (`lod.ts`) 는 무수정 — 본 모듈은 LOD decision
 * **출력 후처리** 만 담당 (Split-brain SRP 회피).
 *
 * ## 배경 — R4 Amendment 4 후속 회귀 (#546)
 *
 * R4 본 (`docs/decisions/20260520-r4-earth-moon-visualization.md`) Amendment 4 (moonScale 800 → 200)
 * 머지 후 사용자 D-T2 회귀:
 *
 *   > 줌인 상황에 따라 달이 안 보이는건 정상?
 *
 * forensic 측정 (`docs/reports/546-forensic/`):
 *
 *   | viewport | 시나리오 | moon level | pxDiameter | isVisible |
 *   |---|---|---|---|---|
 *   | 1280×720 | earth-focus-initial | **low** | 12.17 | **false** |
 *   | 1920×1080 | earth-focus-initial | mid | 18.25 | false |
 *   | 375×667 | earth-focus-initial | mid | 22.55 | false |
 *
 * **본질**: parent (`earth`) focus 시 child (`moon`) 의 LOD 가 default 식 (kind / pxDiameter) 으로만
 * 결정되어 자연 거리에서 low/mid 잔존 + high variant `isVisible=false` → 사용자 시각 인지 부족.
 *
 * ## 결정 — 옵션 5 hybrid (forensic ADR §5 §결정)
 *
 * 옵션 5 = 옵션 4 (focus-aware LOD override) + 옵션 1 (4 px guard). 두 가드 직교:
 *
 *   1. **parent-focus aware LOD floor** — earth focus + moon (parentId='earth') 시 LOD `low → mid`
 *      승격 (Q3=(c) parent-child 결합 정책)
 *   2. **4 px guard** — pxDiameter < 4 px 면 billboard low 유지 (Amendment 1 SSoT 정합 + agy
 *      cross-validate 이견 수용 #1 — 극소 픽셀에 3D mid mesh 강제 시 aliasing 심화)
 *
 * ## 호출 시퀀스 (SRP 가드 — agy cross-validate 이견 수용 #2)
 *
 *   1. `lod.ts:lodFromScreenCoverage` 가 **baseline LOD level** 반환 (LOD 엔진 단일 책임 유지)
 *   2. `solar-system-scene.ts:runLodPass` 가 매 frame body 별 LOD decision 직후
 *      `applySatelliteVisibilityGuard(...)` 호출 (가드 레이어 — LOD 엔진 외부)
 *   3. 결과 `effective LOD level` 로 mesh.isVisible 토글 — LOD 엔진은 가드 적용 후 결과 미인지
 *      (**단방향 데이터 흐름**)
 *
 * **Split-brain 회피 근거**: 가드는 lod.ts 입력에 영향 안 줌 + lod.ts 결정값을 출력 후 1회 후처리.
 * LOD 엔진 SSoT 유지, 가드는 명시적 별도 레이어.
 *
 * ## Q2~Q5 정합 (PM 5문 결정)
 *
 *   - **Q2 (a) earth focus 상태만** — focus 가 parent body 인 경우에만 활성 (default sun 시점 무영향)
 *   - **Q3 (c) parent-child 결합** — body.parentId === focusedBodyId + parentId !== 'sun' 일 때만
 *   - **Q4 (c) 4 px 임계** — Amendment 1 SSoT (`LOD_BILLBOARD_ALPHA_MASK_MIN_PX_DIAMETER=4`) 재사용
 *
 * ## R5+ 일반화 자동 수용
 *
 *   - R5 (mars focus + phobos/deimos) — phobos.parentId='mars' → 자동 발동
 *   - R6 (jupiter focus + io/europa/ganymede/callisto) — 자동 발동
 *   - R7 (saturn focus + titan) — 자동 발동
 *
 * `parentId` 기반 일반화 → R-Phase Allowlist 갱신 1곳만으로 R5+ 자동 수용 (본 가드 무수정).
 *
 * ## 참고 ADR
 *
 *   - `docs/decisions/20260524-546-satellite-billboard-visibility-forensic.md` §5 결정 + §7 cross-validate
 *   - `docs/decisions/20260520-r4-earth-moon-visualization.md` §Amendment 3 (satellite 정책 SSoT)
 *   - `docs/decisions/20260424-p11-b-lod-design.md` §결정 3 (LOD 본체 무수정 — 가드만 허용)
 *   - `docs/decisions/20260502-391-phase2-billboard.md` §결정 (Amendment 1 4 px SSoT)
 */

import type { LodLevel } from '../render/lod.js';
import { LOD_BILLBOARD_ALPHA_MASK_MIN_PX_DIAMETER } from './solar-system-scene.js';

/**
 * Satellite visibility guard 입력.
 */
export interface SatelliteVisibilityGuardInput {
  /** body 의 parent id. null/undefined/'sun' 이면 비-satellite (가드 비활성). */
  parentId: string | null | undefined;
  /** 현재 focus 진입된 body id. null 이면 default 시점 (가드 비활성). */
  focusedBodyId: string | null;
  /** `lod.ts:lodFromScreenCoverage` 가 반환한 baseline LOD level (단방향 입력). */
  baselineLodLevel: LodLevel;
  /** 현재 frame 의 화면 점유 직경 (px). `coverage × 2`. */
  pxDiameter: number;
}

/**
 * parent-focus aware satellite LOD floor + 4 px guard 적용.
 *
 * 호출 시점: `solar-system-scene.ts:runLodPass` 의 매 frame body 별 LOD decision 직후.
 *
 * @returns effective LOD level — baseline 과 동일하거나 `low → mid` 승격된 값.
 */
export function applySatelliteVisibilityGuard(input: SatelliteVisibilityGuardInput): LodLevel {
  const { parentId, focusedBodyId, baselineLodLevel, pxDiameter } = input;

  // Q3=(c) parent-child 결합: focusedBodyId 가 parentId 일 때만 satellite 가드 발동.
  // - focusedBodyId === null → default 시점 (Q2=(a) 정합: 가드 비활성)
  // - parentId === null/undefined → root body (sun) → satellite 아님
  // - parentId === 'sun' → 행성 (earth/mercury/venus 등) → 본 가드 비활성 (parent focus 가드는
  //   satellite 한정. 행성 자신은 focus body 면 lod.ts isFocused 분기로 이미 high 강제)
  const isSatelliteOfFocusedBody =
    focusedBodyId !== null &&
    parentId !== null &&
    parentId !== undefined &&
    parentId !== 'sun' &&
    parentId === focusedBodyId;

  if (!isSatelliteOfFocusedBody) return baselineLodLevel;

  // (1) pxDiameter < 4 px: 극소 픽셀 → billboard low 유지 (그래픽스 상식 — 3D mid mesh 강제 시
  //     1~2 px sphere aliasing 심화 + 불필요 vertex 연산). Amendment 1 SSoT 정합.
  //     agy cross-validate 이견 수용 #1 박제 (forensic ADR §7).
  if (pxDiameter < LOD_BILLBOARD_ALPHA_MASK_MIN_PX_DIAMETER) {
    return 'low';
  }

  // (2) 4 px ≤ pxDiameter (사용자 형태 인지 가능 대역): low → mid floor 강제.
  //     자연 거리 실측 12~22 px 는 모두 이 분기 (forensic 측정 1).
  //     Q4=(c) 4 px 임계 SSoT 정합.
  if (baselineLodLevel === 'low') return 'mid';

  // (3) 그 외 (이미 mid 또는 high): LOD 시스템 결정 유지 (가드 비-침범).
  return baselineLodLevel;
}
