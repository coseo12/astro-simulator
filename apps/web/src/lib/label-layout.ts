/**
 * #1293 — 3D 이름 라벨 배치 · 디클러터 (순수 함수).
 *
 * 입력은 body 별 화면 투영 (core `getBodyScreenInfo` — CSS px) 과 DOM 에서 잰 라벨 박스 크기이고, 출력은
 * **보일 라벨의 박스 목록**이다. 오버레이 컴포넌트 (`body-labels.tsx`) 는 이 결과대로 DOM 을 옮기기만 한다.
 *
 * ## 규칙 (이슈 #1293 범위 · DoD D4 · D5)
 *  1. 후보 = 카메라 앞 ∧ 중심이 화면 안 (`onScreen`). 카메라 뒤 · 화면 밖 body 는 라벨 0 (D4).
 *  1b. 더 가까운 다른 body 의 화면 원반 안에 중심이 들어간 (= 그 뒤에 가려진) body 는 라벨 0. 예: 목성 뒤로 돈
 *     이오. 원반 = 화면 반지름 (bodyScale 과장 포함 — 화면에 그려진 크기) 이라 실제로 가려진 경우와 일치한다.
 *  1c. 렌더된 모체 구 안에 완전히 묻힌 body (core `embeddedInParent`) 는 라벨 0 — bodyScale 로 과장된 목성이 이오
 *     궤도를 삼키면 이오는 궤도 **앞쪽** 절반에서도 그려지지 않는데 1b (깊이 비교) 는 뒤쪽 절반만 잡는다 (#1293 qa B1).
 *     화면 원반 기준으로 넓히지 않은 이유: 모체 원반 앞을 실제로 지나는 통과 (transit) 위성의 라벨까지 지운다.
 *  2. 위성은 **모체가 선택 (포커스) 됐을 때만** 후보다. 위성 자신이 선택된 경우도 후보로 둔다 — 선택한 천체의
 *     이름이 화면에서 사라지지 않게 (모체 조건의 확장이지 우선순위 변경이 아니다).
 *  3. 우선순위 태양 > 행성 > 왜소행성 > 소행성 > 위성 > 혜성, 같은 등급은 화면 반지름이 큰 쪽 → id 사전순 (결정적).
 *  4. 높은 순위부터 놓고, 이미 놓인 박스와 겹치면 (간격 `LABEL_GAP_PX` 포함) 그 라벨을 숨긴다 → 겹침 쌍 0 (D5).
 *
 * ## 배치
 * 라벨 박스 왼쪽 변을 body 중심에서 `min(반지름, LABEL_RADIUS_CAP_PX) + LABEL_OFFSET_PX` 만큼 오른쪽에 두고
 * 세로 중앙을 맞춘다. 오른쪽으로 화면을 넘으면 같은 거리만큼 왼쪽에 붙인다. 따라서 박스의 가까운 변은 항상
 * 중심에서 `반지름 + 오프셋` 이내다 (D4 「투영 위치 ±(화면 반지름 + 라벨 오프셋)」).
 * 반지름 상한은 화면을 덮을 만큼 가까이 다가간 body 의 라벨이 화면 밖으로 밀려나지 않게 한다.
 */

/** body 중심(또는 원반 가장자리) 과 라벨 사이 간격 (CSS px). */
export const LABEL_OFFSET_PX = 6;
/** 라벨 오프셋 계산에 쓰는 화면 반지름 상한 (CSS px) — 근접 시 라벨이 화면 밖으로 밀려나지 않게. */
export const LABEL_RADIUS_CAP_PX = 48;
/** 라벨 박스끼리 최소 간격 (CSS px). 이보다 가까우면 겹친 것으로 본다. */
export const LABEL_GAP_PX = 2;

/** 종류별 우선순위 (작을수록 먼저). 미등록 kind 는 `UNKNOWN_KIND_PRIORITY` (혜성 뒤). */
export const LABEL_KIND_PRIORITY: Readonly<Record<string, number>> = {
  star: 0,
  planet: 1,
  'dwarf-planet': 2,
  // #1318 — 소행성은 왜소행성 다음 · 위성 앞. 위성 라벨은 모체 포커스 때만 후보라 (규칙 2) 기본 화면에서
  // 소행성과 경쟁하는 것은 행성 · 왜소행성 · 혜성이다. 태양 직속 소천체로서 왜소행성과 같은 축에 둔다.
  asteroid: 3,
  moon: 4,
  comet: 5,
};
const UNKNOWN_KIND_PRIORITY = 6;

export interface LabelCandidate {
  id: string;
  kind: string;
  parentId: string | null;
  /** 화면 중심 (CSS px). */
  x: number;
  y: number;
  /** 화면 반지름 (CSS px). */
  radius: number;
  onScreen: boolean;
  /** 카메라까지 거리 (단위 무관 — 후보끼리 대소 비교만 한다). 가림 판정 (규칙 1b) 용. */
  distance: number;
  /** 렌더된 모체 구 안에 완전히 묻혀 보이지 않음 (규칙 1c — core `embeddedInParent`). */
  embedded: boolean;
  /** 라벨 DOM 박스 크기 (CSS px). 0 이면 아직 못 잼 → 후보 제외. */
  width: number;
  height: number;
}

export interface LabelBox {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface LabelLayoutContext {
  /** 현재 선택 (포커스) 된 body id. 없으면 null. */
  focusedId: string | null;
  /** 오버레이 (= 캔버스) CSS 폭 — 오른쪽 넘침 시 왼쪽 배치 판정. */
  viewportWidth: number;
}

export function labelKindPriority(kind: string): number {
  return LABEL_KIND_PRIORITY[kind] ?? UNKNOWN_KIND_PRIORITY;
}

/** 규칙 1 · 1c · 2 — 이 후보가 라벨을 가질 자격이 있는가. */
export function isLabelEligible(c: LabelCandidate, focusedId: string | null): boolean {
  if (!c.onScreen || c.embedded || c.width <= 0 || c.height <= 0) return false;
  if (c.kind === 'moon')
    return focusedId !== null && (focusedId === c.parentId || focusedId === c.id);
  return true;
}

/** 규칙 1b — `c` 의 중심이 더 가까운 다른 후보의 화면 원반 안에 있는가. */
export function isOccluded(c: LabelCandidate, all: readonly LabelCandidate[]): boolean {
  return all.some(
    (o) =>
      o !== c &&
      o.onScreen &&
      o.distance < c.distance &&
      Math.hypot(o.x - c.x, o.y - c.y) < o.radius,
  );
}

/** 배치 — 중심 오른쪽, 화면 오른쪽을 넘으면 왼쪽. */
export function placeLabel(c: LabelCandidate, viewportWidth: number): LabelBox {
  const reach = Math.min(Math.max(c.radius, 0), LABEL_RADIUS_CAP_PX) + LABEL_OFFSET_PX;
  const rightLeft = c.x + reach;
  const left = rightLeft + c.width > viewportWidth ? c.x - reach - c.width : rightLeft;
  return {
    id: c.id,
    left: Math.round(left),
    top: Math.round(c.y - c.height / 2),
    width: c.width,
    height: c.height,
  };
}

/** 두 박스가 `gap` 간격 안으로 들어오는가 (변이 정확히 `gap` 떨어지면 겹치지 않음). */
export function boxesOverlap(a: LabelBox, b: LabelBox, gap: number = LABEL_GAP_PX): boolean {
  return (
    a.left < b.left + b.width + gap &&
    b.left < a.left + a.width + gap &&
    a.top < b.top + b.height + gap &&
    b.top < a.top + a.height + gap
  );
}

/** 규칙 3 — 우선순위 비교 (정렬용). */
function compareCandidates(a: LabelCandidate, b: LabelCandidate): number {
  const pa = labelKindPriority(a.kind);
  const pb = labelKindPriority(b.kind);
  if (pa !== pb) return pa - pb;
  if (a.radius !== b.radius) return b.radius - a.radius;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** 규칙 1~4 — 보일 라벨 박스 목록 (우선순위 순). */
export function layoutLabels(
  candidates: readonly LabelCandidate[],
  ctx: LabelLayoutContext,
): LabelBox[] {
  const eligible = candidates
    .filter((c) => isLabelEligible(c, ctx.focusedId) && !isOccluded(c, candidates))
    .sort(compareCandidates);
  const placed: LabelBox[] = [];
  for (const c of eligible) {
    const box = placeLabel(c, ctx.viewportWidth);
    if (placed.some((p) => boxesOverlap(p, box))) continue;
    placed.push(box);
  }
  return placed;
}
