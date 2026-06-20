/**
 * #713 — canvas 클릭/터치 body 선택 picking 헬퍼 단위 테스트.
 *
 * ADR `docs/decisions/20260620-713-click-body-select.md` §결정 6 회귀 가드 (단위 4종):
 *   (1) mesh.metadata.bodyId 박제 정확성 (high/mid/low 동일 id)  → solar-system-scene 측 +
 *       본 테스트의 readBodyId 경로 (predicate/fallback 둘 다 metadata.bodyId 만 신뢰)
 *   (2) pick predicate 가 비-allowlist / 숨은 variant 제외
 *   (3) 화면거리 fallback 이 임계 내 최근접 1개 선택 (임계 밖 no-op)
 *   (4) (web 측 드래그 임계는 sim-canvas 통합 — core 헬퍼는 좌표만 받음)
 *
 * Babylon 의존은 Vector3/Matrix 수학만 사용 (NullEngine 불필요). scene/camera/mesh 는 헬퍼가
 * 실제 호출하는 표면(`scene.pick` / `getTransformMatrix` / `getEngine` / `meshes`,
 * `camera.globalPosition`, `mesh.metadata/isVisible/isEnabled/getAbsolutePosition`)만 duck-mock.
 *
 * 좌표 결정성: `getTransformMatrix` 를 **항등 행렬** 로 두면 world (x,y,z) → NDC 가 항등이라
 * `Vector3.Project(world, I, I, viewport)` 는 (단, w=1) screen.x = (x+1)/2 × W, screen.y =
 * (1-y)/2 × H, screen.z = (z+1)/2 가 되어 마커 화면 좌표를 정확히 통제할 수 있다.
 */

import { describe, expect, it } from 'vitest';
import { Matrix, Vector3 } from '@babylonjs/core';
import {
  resolvePickedBodyId,
  resolvePickedBodyIds,
  PICK_SCREEN_THRESHOLD_PX,
  CLICK_DRAG_THRESHOLD_PX,
  CLICK_DRAG_THRESHOLD_PX_TOUCH,
  PICK_CYCLE_SAME_POS_PX,
} from './body-picking.js';

const W = 1000;
const H = 1000;

/** 항등 투영 기준 world → screen px 역산: 화면 (sx, sy) 에 투영될 world (x, y) 를 만든다. */
function worldForScreen(sx: number, sy: number, z = 0): Vector3 {
  // screen.x = (x+1)/2 × W  →  x = 2·sx/W − 1
  // screen.y = (1−y)/2 × H  →  y = 1 − 2·sy/H
  const x = (2 * sx) / W - 1;
  const y = 1 - (2 * sy) / H;
  return new Vector3(x, y, z);
}

interface MockMeshOpts {
  bodyId?: string | null;
  isVisible?: boolean;
  isEnabled?: boolean;
  /** fallback 투영용 world 위치 (마커 화면 좌표 통제). */
  world?: Vector3;
  /** metadata 자체를 없앰 (궤도선/배경 mesh 모사). */
  noMetadata?: boolean;
}

function mockMesh(o: MockMeshOpts) {
  const world = o.world ?? new Vector3(0, 0, 0);
  return {
    metadata: o.noMetadata ? null : { bodyId: o.bodyId ?? null },
    isVisible: o.isVisible ?? true,
    isEnabled: () => o.isEnabled ?? true,
    getAbsolutePosition: () => world,
  };
}

interface MockSceneOpts {
  /** scene.pick 결과 (1차) — { hit, pickedMesh } 또는 miss. */
  pickResult?: { hit: boolean; pickedMesh?: ReturnType<typeof mockMesh> };
  meshes?: ReturnType<typeof mockMesh>[];
  /**
   * #719 — scene.multiPick 결과 (복수형). { distance, pickedMesh }[] 의 PickingInfo 배열 모사.
   * **의도적으로 distance 비정렬 순서로 줄 수 있다** — resolvePickedBodyIds 가 명시 정렬하는지 검증.
   */
  multiPickResult?: { distance: number; pickedMesh: ReturnType<typeof mockMesh> }[];
}

function mockScene(o: MockSceneOpts) {
  const meshes = o.meshes ?? [];
  return {
    // predicate 를 받지만 1차 테스트는 미리 정한 pickResult 반환 (Babylon ray 모킹 회피).
    pick: (_x: number, _y: number, _pred: (m: unknown) => boolean) =>
      o.pickResult ?? { hit: false },
    // #719 — multiPick 은 predicate 통과 mesh 만 (있으면). multiPickResult 의 mesh 에 predicate 적용.
    multiPick: (_x: number, _y: number, pred?: (m: unknown) => boolean) => {
      const all = o.multiPickResult ?? [];
      return pred ? all.filter((pk) => pred(pk.pickedMesh)) : all;
    },
    getTransformMatrix: () => Matrix.Identity(),
    getEngine: () => ({ getRenderWidth: () => W, getRenderHeight: () => H }),
    meshes,
  };
}

/** #719 — PickingInfo 모사 헬퍼 ({ distance, pickedMesh }). */
function pickInfo(distance: number, mesh: ReturnType<typeof mockMesh>) {
  return { distance, pickedMesh: mesh };
}

const camera = { globalPosition: new Vector3(0, 0, -10) };
const allowAll = () => true;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asScene = (s: unknown) => s as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asCamera = (c: unknown) => c as any;

describe('#713 resolvePickedBodyId — 1차 scene.pick (occlusion 최전면)', () => {
  it('predicate 통과 mesh 직격 시 metadata.bodyId 반환', () => {
    const earth = mockMesh({ bodyId: 'earth' });
    const scene = mockScene({ pickResult: { hit: true, pickedMesh: earth } });
    const id = resolvePickedBodyId(asScene(scene), asCamera(camera), 500, 500, {
      isFocusable: allowAll,
    });
    expect(id).toBe('earth');
  });

  it('pick hit 이지만 pickedMesh 에 metadata.bodyId 없으면 1차 무효 → fallback (없으면 null)', () => {
    const bg = mockMesh({ noMetadata: true });
    const scene = mockScene({ pickResult: { hit: true, pickedMesh: bg } });
    const id = resolvePickedBodyId(asScene(scene), asCamera(camera), 500, 500, {
      isFocusable: allowAll,
    });
    expect(id).toBeNull();
  });
});

describe('#713 predicate — 비-allowlist / 숨은 variant 제외', () => {
  // predicate 동작 자체를 검증하기 위해 scene.pick 이 predicate 를 실제 적용하도록 구성.
  function sceneWithPredicatePick(candidates: ReturnType<typeof mockMesh>[]) {
    return {
      pick: (_x: number, _y: number, pred: (m: unknown) => boolean) => {
        // candidates 중 predicate 통과 첫 mesh 를 "ray 최근접 hit" 으로 모사.
        const hitMesh = candidates.find((m) => pred(m));
        return hitMesh ? { hit: true, pickedMesh: hitMesh } : { hit: false };
      },
      getTransformMatrix: () => Matrix.Identity(),
      getEngine: () => ({ getRenderWidth: () => W, getRenderHeight: () => H }),
      meshes: [],
    };
  }

  it('isFocusable=false (비-allowlist) body 는 predicate 에서 탈락 → no-op', () => {
    const fake = mockMesh({ bodyId: 'nonexistent-body' });
    const scene = sceneWithPredicatePick([fake]);
    const id = resolvePickedBodyId(asScene(scene), asCamera(camera), 500, 500, {
      isFocusable: (bid) => bid !== 'nonexistent-body',
    });
    expect(id).toBeNull();
  });

  it('숨은 variant (isVisible=false) 는 predicate 에서 탈락', () => {
    const hidden = mockMesh({ bodyId: 'mars', isVisible: false });
    const scene = sceneWithPredicatePick([hidden]);
    const id = resolvePickedBodyId(asScene(scene), asCamera(camera), 500, 500, {
      isFocusable: allowAll,
    });
    expect(id).toBeNull();
  });

  it('비활성 variant (isEnabled=false) 는 predicate 에서 탈락', () => {
    const disabled = mockMesh({ bodyId: 'mars', isEnabled: false });
    const scene = sceneWithPredicatePick([disabled]);
    const id = resolvePickedBodyId(asScene(scene), asCamera(camera), 500, 500, {
      isFocusable: allowAll,
    });
    expect(id).toBeNull();
  });

  it('metadata.bodyId 없는 배경 mesh 는 predicate 에서 탈락', () => {
    const bg = mockMesh({ noMetadata: true });
    const scene = sceneWithPredicatePick([bg]);
    const id = resolvePickedBodyId(asScene(scene), asCamera(camera), 500, 500, {
      isFocusable: allowAll,
    });
    expect(id).toBeNull();
  });
});

describe('#713 화면거리 fallback — 임계 내 최근접 1개', () => {
  it('1차 miss → 클릭 좌표 임계 내 body 선택', () => {
    // 마커 io 를 화면 (500, 500) 에 투영. 클릭도 (500, 500) → 거리 0.
    const io = mockMesh({ bodyId: 'io', world: worldForScreen(500, 500) });
    const scene = mockScene({ pickResult: { hit: false }, meshes: [io] });
    const id = resolvePickedBodyId(asScene(scene), asCamera(camera), 500, 500, {
      isFocusable: allowAll,
    });
    expect(id).toBe('io');
  });

  it('임계 px 경계 안쪽 (반경 < 12px) 은 선택', () => {
    // 마커는 (500,500), 클릭은 (500 + 10, 500) → 거리 10px < 12px.
    const io = mockMesh({ bodyId: 'io', world: worldForScreen(500, 500) });
    const scene = mockScene({ pickResult: { hit: false }, meshes: [io] });
    const id = resolvePickedBodyId(asScene(scene), asCamera(camera), 510, 500, {
      isFocusable: allowAll,
    });
    expect(id).toBe('io');
  });

  it('임계 px 정확 경계 (반경 = 12px) 는 inclusive — 선택 (strict > 비교)', () => {
    // 비교가 distSq > thresholdSq (strict) 라 정확히 12px(distSq=144)는 포함(선택).
    const io = mockMesh({ bodyId: 'io', world: worldForScreen(500, 500) });
    const scene = mockScene({ pickResult: { hit: false }, meshes: [io] });
    const id = resolvePickedBodyId(asScene(scene), asCamera(camera), 512, 500, {
      isFocusable: allowAll,
    });
    expect(id).toBe('io');
  });

  it('임계 px 경계 바깥 (반경 > 12px) 은 no-op (빈 우주)', () => {
    const io = mockMesh({ bodyId: 'io', world: worldForScreen(500, 500) });
    const scene = mockScene({ pickResult: { hit: false }, meshes: [io] });
    // 클릭 (520, 500) → 거리 20px > 12px.
    const id = resolvePickedBodyId(asScene(scene), asCamera(camera), 520, 500, {
      isFocusable: allowAll,
    });
    expect(id).toBeNull();
  });

  it('임계 내 복수 body → 화면거리 더 가까운 1개 선택', () => {
    const near = mockMesh({ bodyId: 'io', world: worldForScreen(502, 500) }); // 2px
    const far = mockMesh({ bodyId: 'europa', world: worldForScreen(508, 500) }); // 8px
    const scene = mockScene({ pickResult: { hit: false }, meshes: [near, far] });
    const id = resolvePickedBodyId(asScene(scene), asCamera(camera), 500, 500, {
      isFocusable: allowAll,
    });
    expect(id).toBe('io');
  });

  it('fallback 후보도 isFocusable (allowlist) 통과 body 만 — 비-allowlist 제외', () => {
    const fake = mockMesh({ bodyId: 'nonexistent-body', world: worldForScreen(500, 500) });
    const scene = mockScene({ pickResult: { hit: false }, meshes: [fake] });
    const id = resolvePickedBodyId(asScene(scene), asCamera(camera), 500, 500, {
      isFocusable: (bid) => bid !== 'nonexistent-body',
    });
    expect(id).toBeNull();
  });

  it('fallback 후보도 숨은 variant (isVisible=false) 제외', () => {
    const hidden = mockMesh({ bodyId: 'io', world: worldForScreen(500, 500), isVisible: false });
    const scene = mockScene({ pickResult: { hit: false }, meshes: [hidden] });
    const id = resolvePickedBodyId(asScene(scene), asCamera(camera), 500, 500, {
      isFocusable: allowAll,
    });
    expect(id).toBeNull();
  });

  it('빈 우주 (후보 0) → null (setSelectedBody(null) 호출 안 함 — 호출자 no-op)', () => {
    const scene = mockScene({ pickResult: { hit: false }, meshes: [] });
    const id = resolvePickedBodyId(asScene(scene), asCamera(camera), 500, 500, {
      isFocusable: allowAll,
    });
    expect(id).toBeNull();
  });

  it('behind-camera (projected.z 범위 밖) body 제외', () => {
    // z=2 → projected.z = (2+1)/2 = 1.5 > 1 → 제외.
    const behind = mockMesh({ bodyId: 'io', world: worldForScreen(500, 500, 2) });
    const scene = mockScene({ pickResult: { hit: false }, meshes: [behind] });
    const id = resolvePickedBodyId(asScene(scene), asCamera(camera), 500, 500, {
      isFocusable: allowAll,
    });
    expect(id).toBeNull();
  });

  it('커스텀 screenThresholdPx 적용 — 임계 4px 면 10px 클릭은 no-op', () => {
    const io = mockMesh({ bodyId: 'io', world: worldForScreen(500, 500) });
    const scene = mockScene({ pickResult: { hit: false }, meshes: [io] });
    const id = resolvePickedBodyId(asScene(scene), asCamera(camera), 510, 500, {
      isFocusable: allowAll,
      screenThresholdPx: 4,
    });
    expect(id).toBeNull();
  });
});

describe('#713 임계 상수 SSoT (매직넘버 금지 가드)', () => {
  it('PICK_SCREEN_THRESHOLD_PX = 12 (measurement-first: marker 반경 3.18px ≪ 12px)', () => {
    expect(PICK_SCREEN_THRESHOLD_PX).toBe(12);
  });

  it('드래그 임계 — 터치(10) > 마우스(5) (터치 jitter 분리, cross-validate 보강 3)', () => {
    expect(CLICK_DRAG_THRESHOLD_PX).toBe(5);
    expect(CLICK_DRAG_THRESHOLD_PX_TOUCH).toBe(10);
    expect(CLICK_DRAG_THRESHOLD_PX_TOUCH).toBeGreaterThan(CLICK_DRAG_THRESHOLD_PX);
  });

  it('#719 PICK_CYCLE_SAME_POS_PX = 14 (measurement-first: 터치 jitter 10px + 여유 4px)', () => {
    expect(PICK_CYCLE_SAME_POS_PX).toBe(14);
    // 터치 드래그 임계(10px)보다 커야 함 — 별개 클릭 흔들림이 드래그 임계보다 좁으면 cycle 끊김.
    expect(PICK_CYCLE_SAME_POS_PX).toBeGreaterThan(CLICK_DRAG_THRESHOLD_PX_TOUCH);
  });
});

describe('#719 resolvePickedBodyIds — multiPick 깊이순 dedup', () => {
  const A = mockMesh({ bodyId: 'io', isVisible: true });
  const B = mockMesh({ bodyId: 'jupiter', isVisible: true });
  const C = mockMesh({ bodyId: 'europa', isVisible: true });

  it('ray hit 0 → 빈 배열 (호출자가 단일 fallback 위임)', () => {
    const scene = mockScene({ multiPickResult: [] });
    const ids = resolvePickedBodyIds(asScene(scene), asCamera(camera), 500, 500, {
      isFocusable: allowAll,
    });
    expect(ids).toEqual([]);
  });

  it('ray hit 1 → 단일 [id] (#713 단일 클릭 동작 불변)', () => {
    const scene = mockScene({ multiPickResult: [pickInfo(10, B)] });
    const ids = resolvePickedBodyIds(asScene(scene), asCamera(camera), 500, 500, {
      isFocusable: allowAll,
    });
    expect(ids).toEqual(['jupiter']);
  });

  it('비정렬 multiPick 입력 → distance 오름차순 정렬 (Babylon 미보장 보정)', () => {
    // 의도적 비정렬: jupiter(45) → io(41) → europa(60) 순서로 줌.
    const scene = mockScene({
      multiPickResult: [pickInfo(45, B), pickInfo(41, A), pickInfo(60, C)],
    });
    const ids = resolvePickedBodyIds(asScene(scene), asCamera(camera), 500, 500, {
      isFocusable: allowAll,
    });
    // 깊이순: io(41) < jupiter(45) < europa(60).
    expect(ids).toEqual(['io', 'jupiter', 'europa']);
  });

  it('같은 bodyId 의 LOD variant 동시 hit → dedup 후 1개 (첫 등장=최근접 유지)', () => {
    // io-lod-mid(41) + io-lod-low(43) 둘 다 활성(fade 구간) → io 1개로 dedup.
    const ioMid = mockMesh({ bodyId: 'io', isVisible: true });
    const ioLow = mockMesh({ bodyId: 'io', isVisible: true });
    const scene = mockScene({
      multiPickResult: [pickInfo(43, ioLow), pickInfo(41, ioMid), pickInfo(45, B)],
    });
    const ids = resolvePickedBodyIds(asScene(scene), asCamera(camera), 500, 500, {
      isFocusable: allowAll,
    });
    // io 두 variant → 1개 (최근접 41 first), jupiter 뒤. 총 2개.
    expect(ids).toEqual(['io', 'jupiter']);
  });

  it('agy ④ — LOD fade 구간 distance 흔들림에도 dedup 후 개수·순서 안정', () => {
    // 동일 bodyId 두 variant 의 distance 가 1~2px 흔들려도(41↔42 뒤바뀜) dedup 결과는 동일.
    const ioV1 = mockMesh({ bodyId: 'io', isVisible: true });
    const ioV2 = mockMesh({ bodyId: 'io', isVisible: true });
    const frame1 = mockScene({
      multiPickResult: [pickInfo(41, ioV1), pickInfo(42, ioV2), pickInfo(50, B)],
    });
    const frame2 = mockScene({
      // fade 흔들림으로 두 io variant 의 distance 역전 (42 ↔ 41).
      multiPickResult: [pickInfo(42, ioV1), pickInfo(41, ioV2), pickInfo(50, B)],
    });
    const opts = { isFocusable: allowAll };
    const ids1 = resolvePickedBodyIds(asScene(frame1), asCamera(camera), 500, 500, opts);
    const ids2 = resolvePickedBodyIds(asScene(frame2), asCamera(camera), 500, 500, opts);
    // 두 프레임 모두 [io, jupiter] — variant 순서 흔들림이 bodyId 리스트에 누설되지 않음.
    expect(ids1).toEqual(['io', 'jupiter']);
    expect(ids2).toEqual(['io', 'jupiter']);
  });

  it('predicate — 비-allowlist body 제외 (isFocusable=false)', () => {
    const fake = mockMesh({ bodyId: 'nonexistent-body', isVisible: true });
    const scene = mockScene({ multiPickResult: [pickInfo(40, fake), pickInfo(45, B)] });
    const ids = resolvePickedBodyIds(asScene(scene), asCamera(camera), 500, 500, {
      isFocusable: (bid) => bid !== 'nonexistent-body',
    });
    expect(ids).toEqual(['jupiter']);
  });

  it('predicate — 숨은 variant (isVisible=false) 제외', () => {
    const hidden = mockMesh({ bodyId: 'io', isVisible: false });
    const scene = mockScene({ multiPickResult: [pickInfo(40, hidden), pickInfo(45, B)] });
    const ids = resolvePickedBodyIds(asScene(scene), asCamera(camera), 500, 500, {
      isFocusable: allowAll,
    });
    expect(ids).toEqual(['jupiter']);
  });

  it('predicate — metadata.bodyId 없는 mesh 제외', () => {
    const bg = mockMesh({ noMetadata: true });
    const scene = mockScene({ multiPickResult: [pickInfo(30, bg), pickInfo(45, B)] });
    const ids = resolvePickedBodyIds(asScene(scene), asCamera(camera), 500, 500, {
      isFocusable: allowAll,
    });
    expect(ids).toEqual(['jupiter']);
  });
});

describe('#719 cycle 다음 선택 로직 (web 클로저 시뮬 — 직전 id 앵커 wrap)', () => {
  // ADR §결정 4 의 web 핸들러 로직을 순수 함수로 추출해 검증 (sim-canvas 클로저와 동일 식).
  // cands: 깊이순 후보, lastId: 직전 선택. 같은 위치 재클릭 시 다음 선택을 산출.
  function nextInCycle(cands: string[], lastId: string | null, samePos: boolean): string | null {
    if (cands.length === 0) return null;
    if (samePos && lastId !== null) {
      const idx = cands.indexOf(lastId);
      // noUncheckedIndexedAccess — production sim-canvas 와 동일하게 ?? null 좁힘 (#715 typecheck clean 보존).
      if (idx !== -1) return cands[(idx + 1) % cands.length] ?? null;
    }
    return cands[0] ?? null; // reset / 첫 클릭 / 직전 id 부재 → 최전면
  }

  const cands = ['io', 'jupiter', 'europa']; // 깊이순 (앞→뒤)

  it('같은 위치 연속 클릭 → 다음(뒤) body 순환', () => {
    expect(nextInCycle(cands, null, true)).toBe('io'); // 첫 클릭 = 최전면
    expect(nextInCycle(cands, 'io', true)).toBe('jupiter'); // io → jupiter
    expect(nextInCycle(cands, 'jupiter', true)).toBe('europa'); // jupiter → europa
  });

  it('마지막 body 도달 후 재클릭 → 첫 body 로 wrap (DoD-2)', () => {
    expect(nextInCycle(cands, 'europa', true)).toBe('io'); // (2+1)%3 = 0 = io
  });

  it('다른 위치 클릭 → cycle 리셋, 최전면 선택 (DoD-3)', () => {
    expect(nextInCycle(cands, 'jupiter', false)).toBe('io'); // samePos=false → cands[0]
  });

  it('단일 body 반복 클릭 → 같은 body 유지 (DoD-4 no-op)', () => {
    const single = ['io'];
    expect(nextInCycle(single, 'io', true)).toBe('io'); // (0+1)%1 = 0 = io
    expect(nextInCycle(single, 'io', true)).toBe('io'); // 반복해도 io
  });

  it('직전 id 가 현재 리스트 부재 (공전 이탈/가려짐 해소) → 최전면 복귀 (ADR §결정 4)', () => {
    expect(nextInCycle(cands, 'callisto', true)).toBe('io'); // indexOf=-1 → cands[0]
  });

  it('빈 후보 → null (호출자 no-op)', () => {
    expect(nextInCycle([], 'io', true)).toBeNull();
  });
});
