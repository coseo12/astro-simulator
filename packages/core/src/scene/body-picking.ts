/**
 * #713 — canvas 클릭/터치 → body 선택 (raycast picking) 순수 헬퍼.
 *
 * ADR `docs/decisions/20260620-713-click-body-select.md` §3 핵심 데이터 흐름 / 결정 1~5.
 *
 * web 레이어(sim-canvas)는 `scene.onPointerObservable(POINTERUP)` 등록 + 드래그/멀티터치/
 * click-through 가드만 담당하고, "engine px 좌표 → bodyId 역변환" 은 본 순수 함수에 위임한다
 * (glow-marker.ts 순수 함수 선례). 단위 테스트 가능 + SSoT 화 목적.
 *
 * 2단계 picking (ADR §결정 2/3):
 *  1차 `scene.pick(x, y, predicate)` — 활성 LOD variant + allowlist + `metadata.bodyId` 존재
 *      mesh 만 대상. ray 상 최근접 mesh 반환 → jupiter 앞 galilean 겹침 시 최전면 자동 (occlusion).
 *  2차 화면거리 fallback — 1차 miss 시 (마커 body 는 실 px < 4 라 직격 확률 낮음), 클릭 좌표에서
 *      `PICK_SCREEN_THRESHOLD_PX` 이내인 allowlist body 중 카메라 최근접 1개 선택.
 *
 * 좌표계 (ADR §결정 4 cross-validate 보강 (4)): x/y 는 **engine 내부 px**
 * (`scene.pointerX/pointerY`). #623(`adaptToDeviceRatio:true`) 정합 — CSS px 직접 전달 금지.
 */

import {
  Matrix,
  Vector3,
  Viewport,
  type Camera,
  type Scene,
  type AbstractMesh,
} from '@babylonjs/core';

/**
 * `Vector3.Project` 의 world 인자 — body absolutePosition 은 이미 world 좌표라 항등 행렬 사용.
 * (`Matrix.Identity()` 1회 생성 후 재사용 — 매 클릭 행렬 할당 회피.)
 */
const identityWorld = Matrix.Identity();

/**
 * 화면거리 fallback 임계 (engine px). 클릭 좌표에서 이 반경 이내인 allowlist body 를 후보로 둔다.
 *
 * **measurement-first 확정값 (#713 DoD-3, 2026-06-20 실측)**:
 * `scripts/_debug-713-marker-px-tmp.mjs` (사용 후 rm) 로 줌아웃 개요에서 glow marker 발동
 * body 의 low(billboard) quad 실 화면 boundingBox 대각 px 측정 — 1280×800 viewport:
 *   - parent (mars/jupiter/ceres/pluto/neptune): **quad 대각 6.36px → 반경 3.18px**
 *   - satellite (io/titan):                       **quad 대각 3.18px → 반경 1.59px**
 *   (quad 는 정사각형이라 대각 = 변 × √2. glow-marker.ts 설계 직경 parent 4.5px ×√2 ≈ 6.36,
 *    satellite 2.25px ×√2 ≈ 3.18 과 정확히 일치 — 마커 visual px 가 설계 SSoT 와 drift 0 확인.)
 * 즉 marker 화면 **반경** 은 최대 3.18px (parent). 임계 12px 는 marker 반경(3.18px) + 모바일
 * 손가락 터치 조준 오차(~8–10px, 결정 4 터치 jitter 임계와 동급) 여유를 포함해 4.5px-급 marker 가
 * 확실히 임계 내에 들어오도록 박제 (marker 반경 3.18px ≪ 12px). 추가로 실측상 marker 화면
 * 중심에서 `scene.pick` 이 직격(1차 hit)되므로 fallback 은 marker 가장자리/조준 오차 흡수용 안전망.
 *
 * 이 값을 변경하면 ADR Amendment + `body-picking.test.ts` 경계 테스트 갱신 의무.
 */
export const PICK_SCREEN_THRESHOLD_PX = 12;

/**
 * 드래그/클릭 구분 임계 (engine px) — **마우스**. down→up 이동이 이 값 이하면 클릭, 초과면
 * 카메라 회전으로 간주 no-op (ADR §결정 4). 마우스는 jitter 가 거의 없어 작게 둔다.
 */
export const CLICK_DRAG_THRESHOLD_PX = 5;

/**
 * 드래그/클릭 구분 임계 (engine px) — **터치**. 터치는 탭에도 미세 좌표 이동이 있어
 * 마우스보다 크게 둔다 (ADR §결정 4 cross-validate 보강 (3) — 단순 탭의 드래그 오판정 방지).
 */
export const CLICK_DRAG_THRESHOLD_PX_TOUCH = 10;

/**
 * #719 — cycle "같은 위치" 판정 임계 (engine px). 직전 클릭과 이 반경 이내면 같은 위치로 보고
 * ray 상 다음(뒤) body 로 cycle 진행, 초과면 cycle 리셋(새 위치 최전면 선택).
 *
 * 드래그/클릭 구분 임계(`CLICK_DRAG_THRESHOLD_PX`, **한 클릭 안**의 down→up 이동)와 의미가
 * 다르므로 별도 상수다 — 본 상수는 **별개 클릭 down 좌표 간 거리**(연타 사이). 두 임계를 한
 * 상수로 묶으면 한쪽 변경이 다른 동작을 조용히 변형(주석-구현 drift). ADR §결정 3.
 *
 * **measurement-first 확정값 (#719 DoD-1, 2026-06-20 실측 `_debug-719-*-tmp.mjs` 사용 후 rm)**:
 *  - 측정 1 (동일 화면 좌표 연타 → engine px 흔들림): DPR=1 환경 `page.mouse.click` 동일 CSS
 *    좌표 8회 연타 시 `scene.pointerX/Y` 흔들림 = **0.00px** (최대 쌍거리 0.00). 자동화 클릭은
 *    흔들림이 없으므로 임계 하한은 **사람 손/터치 흔들림 추정치**가 결정한다:
 *      · 마우스 연타: sub-px ~ 수 px (라운딩 + 미세 손떨림)
 *      · 터치 연타: ~8–10px (#713 `CLICK_DRAG_THRESHOLD_PX_TOUCH` 와 동급 jitter)
 *  - 임계 = 터치 jitter(10px) + 손떨림 여유(4px) = **14px**. 단일 임계로 마우스(≈0px)·터치(≈10px)
 *    흔들림을 모두 안전 흡수 → `_TOUCH` 분리 불요(측정상 14px 가 양쪽 포섭).
 *  - 상한 안전성: galilean(io/europa/ganymede/callisto)의 화면상 최소 상호거리는 focus 줌에서
 *    **113px**(측정 2: io↔jupiter)로 14px ≪ 113px → 의도적 다른 body 클릭을 cycle 로 오인할
 *    여지 없음.
 *
 * 너무 작으면 손 흔들림에 cycle 끊김(reset 오발), 너무 크면 의도적 다른 body 클릭이 cycle 로
 * 오인. 이 값 변경 시 ADR Amendment + `body-picking.test.ts` 경계 테스트 갱신 의무.
 */
export const PICK_CYCLE_SAME_POS_PX = 14;

/** `resolvePickedBodyId` 옵션. */
export interface ResolvePickOptions {
  /**
   * allowlist 가드 — bodyId 가 클릭 선택 대상인지 (`isRPhaseFocusable`). predicate 조기 필터 +
   * fallback 후보 필터에 모두 적용 (ADR §결정 5 이중 방어의 클릭 단계 조기 필터).
   */
  isFocusable: (bodyId: string) => boolean;
  /** 화면거리 fallback 임계 (engine px). 기본 `PICK_SCREEN_THRESHOLD_PX`. */
  screenThresholdPx?: number;
}

/** mesh.metadata 에서 bodyId 추출 (#713 결정 1 — high/mid/low 전 variant 박제). */
function readBodyId(mesh: AbstractMesh | null | undefined): string | null {
  if (!mesh) return null;
  const meta = mesh.metadata as { bodyId?: unknown } | null | undefined;
  const id = meta?.bodyId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * 클릭 좌표(engine px)에서 선택할 bodyId 를 해석한다 (순수 함수 — Babylon scene/camera 만 의존).
 *
 * @param scene   Babylon Scene
 * @param camera  활성 카메라 (fallback 의 카메라 최근접 비교용)
 * @param x       클릭 x (engine px — `scene.pointerX`)
 * @param y       클릭 y (engine px — `scene.pointerY`)
 * @param opts    allowlist 가드 + 임계
 * @returns 선택할 bodyId 또는 null (빈 우주 / 비-allowlist — 호출자는 no-op)
 */
export function resolvePickedBodyId(
  scene: Scene,
  camera: Camera,
  x: number,
  y: number,
  opts: ResolvePickOptions,
): string | null {
  const { isFocusable } = opts;
  const thresholdPx = opts.screenThresholdPx ?? PICK_SCREEN_THRESHOLD_PX;

  // 1차 — scene.pick (predicate 로 활성 variant + allowlist + metadata.bodyId 존재만 대상).
  // predicate 통과 mesh 중 ray 최근접을 Babylon 이 반환 → occlusion 최전면 (ADR §결정 3).
  const pick = scene.pick(x, y, (mesh) => {
    // 활성 LOD variant 만 — 숨은 high/mid/low variant (isVisible=false) 픽킹 방지.
    if (!mesh.isVisible || !mesh.isEnabled()) return false;
    const id = readBodyId(mesh);
    if (!id) return false;
    // 비-allowlist (궤도선/ring/배경 mesh 는 애초에 metadata.bodyId 없음) 조기 필터 — warn 0.
    return isFocusable(id);
  });
  if (pick?.hit) {
    const id = readBodyId(pick.pickedMesh);
    if (id) return id;
  }

  // 2차 — 화면거리 fallback (marker body 직격 miss 흡수). ADR §결정 2 + cross-validate 보강 (6):
  // isFocusable 통과 body 먼저 추린 뒤 Vector3.Project (불필요 행렬 연산 절감).
  const vp = scene.getTransformMatrix();
  const engine = scene.getEngine();
  const width = engine.getRenderWidth();
  const height = engine.getRenderHeight();
  if (width <= 0 || height <= 0) return null;

  const viewport = new Viewport(0, 0, width, height);
  const thresholdSq = thresholdPx * thresholdPx;
  let bestId: string | null = null;
  let bestDistSq = thresholdSq;
  // 동률(임계 내 복수 body)일 때 카메라 최근접 선택 — MVP 최전면 정책 일관 (ADR §결정 2).
  let bestCamDist = Number.POSITIVE_INFINITY;
  const camPos = camera.globalPosition;

  // scene.meshes 전체를 (isVisible && isEnabled) 활성 필터로 순회 — 정착 상태에서 body 당 활성
  // variant 1개(high 또는 전환된 mid/low)만 isVisible=true 라 정확히 1회 후보. LOD fade 전환 중
  // (~200ms, from/to 둘 다 isVisible) 동일 body 의 두 variant 가 잡힐 수 있으나 같은 bodyId·동일
  // world 위치라 선택 결과 동일(무해, 잉여 Project 1회). metadata.bodyId 존재 + allowlist 통과
  // mesh 만 후보 — isFocusable 조기 필터를 Project 이전 적용해 행렬 연산 절감 (cross-validate 보강 6).
  for (const mesh of scene.meshes) {
    if (!mesh.isVisible || !mesh.isEnabled()) continue;
    const id = readBodyId(mesh);
    if (!id || !isFocusable(id)) continue;

    const world = mesh.getAbsolutePosition();
    const projected = Vector3.Project(world, identityWorld, vp, viewport);
    // behind-camera (z < 0 또는 > 1) projection 특이점 제외 — glow-marker 의 off-frustum 가드 정합.
    if (projected.z < 0 || projected.z > 1) continue;

    const dxp = projected.x - x;
    const dyp = projected.y - y;
    const distSq = dxp * dxp + dyp * dyp;
    if (distSq > thresholdSq) continue;

    const cdx = world.x - camPos.x;
    const cdy = world.y - camPos.y;
    const cdz = world.z - camPos.z;
    const camDist = cdx * cdx + cdy * cdy + cdz * cdz;
    // 임계 내 후보 중 (1) 화면거리 더 가까운 우선, (2) 동률이면 카메라 최근접.
    if (distSq < bestDistSq || (distSq === bestDistSq && camDist < bestCamDist)) {
      bestDistSq = distSq;
      bestCamDist = camDist;
      bestId = id;
    }
  }

  return bestId;
}

/**
 * #719 — 클릭 좌표(engine px)의 ray 상에 겹친 body 들을 **카메라 최근접→최원거리 깊이순**으로
 * dedup 한 bodyId 리스트로 반환한다 (순수 함수 — Babylon scene 만 의존, stateless).
 *
 * `resolvePickedBodyId`(단수, 최전면 1개)의 N-depth 확장. web 레이어가 "같은 위치 재클릭 →
 * ray 상 다음(뒤) body" cycle 을 구현할 수 있도록 깊이순 후보 리스트를 제공한다. 본 함수는
 * **상태를 갖지 않으며**(같은 위치 판정·인덱스 추적·wrap 은 web 클로저 책임, ADR §결정 2),
 * **화면거리 fallback 을 포함하지 않는다**(ray hit 만 — fallback marker 의 cycle 은 비-범위,
 * ADR §결정 5). ray hit 이 없으면 빈 배열을 반환하고, 호출자가 `resolvePickedBodyId` 단일
 * fallback 으로 위임한다.
 *
 * 알고리즘 (ADR §결정 1):
 *  1. `scene.multiPick(x, y, predicate)` — predicate 는 `resolvePickedBodyId` 1차와 **동일**
 *     (활성 LOD variant `isVisible && isEnabled` + `metadata.bodyId` 존재 + allowlist).
 *  2. **distance 오름차순 정렬** — Babylon `InternalMultiPick` 은 `scene.meshes` 순회 순서대로
 *     push 할 뿐 distance 정렬을 보장하지 않으므로(실측: ray.core.js InternalMultiPick), 여기서
 *     명시적으로 정렬한다. ADR §결정 1 의 "distance 오름차순 내장" 전제 보정.
 *  3. **bodyId dedup (첫 등장 = ray 최근접 variant 유지)** — 같은 bodyId 의 high/mid/low LOD
 *     variant 가 LOD fade 전환 중(~200ms) 동시 `isVisible` 일 수 있어 둘 다 hit 될 수 있다.
 *     `Set` seen 가드로 정렬된 순서상 첫 등장만 push → 최근접 variant 1개만 남는다.
 *
 * @returns 깊이순 distinct bodyId 배열 (ray hit 0 면 `[]`). 호출자는 `[0]` = 최전면.
 */
export function resolvePickedBodyIds(
  scene: Scene,
  _camera: Camera,
  x: number,
  y: number,
  opts: Pick<ResolvePickOptions, 'isFocusable'>,
): string[] {
  const { isFocusable } = opts;

  // multiPick — predicate 통과 mesh 의 ray hit 전체. predicate 는 단수형 1차와 동일 SSoT.
  const picks = scene.multiPick(x, y, (mesh) => {
    if (!mesh.isVisible || !mesh.isEnabled()) return false;
    const id = readBodyId(mesh);
    if (!id) return false;
    return isFocusable(id);
  });
  if (!picks || picks.length === 0) return [];

  // distance 오름차순 정렬 (Babylon 미보장 — 명시 정렬). 원본 배열 비파괴 위해 복사.
  const sorted = [...picks].sort((a, b) => a.distance - b.distance);

  // bodyId dedup — 정렬 순서상 첫 등장(최근접 variant)만 유지. LOD fade 동시 hit 흡수.
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const pick of sorted) {
    const id = readBodyId(pick.pickedMesh);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}
