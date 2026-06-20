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
  PICK_SCREEN_THRESHOLD_PX,
  CLICK_DRAG_THRESHOLD_PX,
  CLICK_DRAG_THRESHOLD_PX_TOUCH,
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
}

function mockScene(o: MockSceneOpts) {
  const meshes = o.meshes ?? [];
  return {
    // predicate 를 받지만 1차 테스트는 미리 정한 pickResult 반환 (Babylon ray 모킹 회피).
    pick: (_x: number, _y: number, _pred: (m: unknown) => boolean) =>
      o.pickResult ?? { hit: false },
    getTransformMatrix: () => Matrix.Identity(),
    getEngine: () => ({ getRenderWidth: () => W, getRenderHeight: () => H }),
    meshes,
  };
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
});
