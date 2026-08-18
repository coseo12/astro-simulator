/**
 * P9 #254 PR-1 — 행성 고리 플레이스홀더 렌더러.
 *
 * **목적**: PR-1 (인프라) 단계에서 rings 데이터가 씬에 연결되는 골격을 박제한다.
 * 본 shader (방사 밀도 fragment 렌더) 는 PR-2.5 에서 `ring-shader.ts` 로 교체 예정.
 *
 * **구현**: Babylon `MeshBuilder.CreateDisc` 기반의 단색 반투명 disk 를 층마다 1개씩 생성.
 *   - 층 개수 = `rings.length` (목성은 3층: Halo/Main/Gossamer)
 *   - 반경: innerRadius 는 무시하고 outerRadius 만 사용 (플레이스홀더 특성 — 원판만)
 *   - 기본 색: 목성 dust `#887766`, alpha=0.2 (반투명 겹침)
 *
 * **씬 단위**: `renderScaleForTier(tier)` 경유 (P12-A #298). solar tier 기준 1 scene unit ≈ 1 AU.
 *   생성 시점 tier 기반으로 반경을 계산하고, 이후 tier 전환은 host.scaling 으로 흡수된다.
 *
 * ADR `docs/decisions/20260420-p9-galilean-laplace-rings.md`:
 *   - §경로 정정 — Three.js 가정 → Babylon.js 실제 스택
 *   - §결정 #2 — densityProfile 배열은 PR-2.5 shader 에서 본격 사용
 *   - §R1 M1 백업 — 본 플레이스홀더가 자연스러운 백업 경로 (shader 실패 시에도 disk 는 유지)
 *
 * @see LoadedRingLayer
 */

import { Color3, MeshBuilder, StandardMaterial, type Mesh, type Scene } from '@babylonjs/core';
import type { LoadedRingLayer } from '../ephemeris/solar-system-loader.js';
import { RING_DISC_BASE_TILT_X } from './ring-shader.js';
import { renderScaleForTier, type Tier } from './tier.js';

// P12-A #298 B1 — `SCENE_UNIT_PER_METER = 1/AU` 하드코딩 제거. 생성 시점의 tier 로 반경을 계산한다.
// rings 는 host planet mesh 의 자식이므로 host.scaling 이 tier 전환 시 `newScale/prevScale` 로
// 변화하면 ring 도 같은 배수로 확대되어 body 와 상대 비율 보존 (원칙 #1·#4).

/** 기본 색 — 목성 dust 톤. 행성별 조정은 PR-2.5 shader 의 `color` 파라미터에서 수행. */
const DEFAULT_RING_COLOR: readonly [number, number, number] = [0x88 / 255, 0x77 / 255, 0x66 / 255];

/** 기본 alpha — 3층 겹쳐도 과포화되지 않는 수준. */
const DEFAULT_RING_ALPHA = 0.2;

/** Disc tessellation (원 둘레 분할 수). 관측 품질 vs draw cost 균형. */
const DISC_TESSELLATION = 96;

export interface RingPlaceholderHandles {
  /** 층별 메쉬 배열 (순서는 입력 rings 와 동일). */
  meshes: Mesh[];
  /** 호스트 행성 메쉬 위치·회전에 맞춰 고리 위치·회전을 동기화. */
  syncToHost: (host: Mesh) => void;
  dispose: () => void;
}

export interface RingPlaceholderOptions {
  /** 단색 색 override. 기본 목성 dust. */
  color?: readonly [number, number, number];
  /** alpha override. 기본 0.2. */
  alpha?: number;
  /**
   * P12-A #298 B1 — 생성 시점의 tier. 디스크 반경 계산에 사용된다.
   * 이후 tier 전환은 host.scaling 으로 흡수되므로 초기 tier 만 정확하면 된다.
   * 기본값 `'solar'` — 초기 tier 가 solar 로 시작하는 현 디폴트에 맞춤.
   */
  tier?: Tier;
  /**
   * R8 #647 §축 2a — ring 자전축 기울기 (rad). `rotation.x = RING_DISC_BASE_TILT_X + axialTiltRad`
   * (shader/fallback 경로 동일 — 3경로 일관, 회귀 검증 모드 정합). 기본 0 (하위 호환).
   * ⚠️ base 는 #1130 에서 `π/2` → `π` 로 이동했다 (body 의 `ORBITAL_NORMAL_OFFSET` 과 **짝**).
   */
  axialTiltRad?: number;
}

/**
 * 행성 고리 플레이스홀더 생성.
 *
 * @param scene Babylon 씬
 * @param host 호스트 행성 메쉬 (위치 동기화 기준)
 * @param rings 로드된 고리 층 배열 (1~N 층)
 * @param options 색·alpha override 및 초기 tier
 */
export function createRingPlaceholder(
  scene: Scene,
  host: Mesh,
  rings: ReadonlyArray<LoadedRingLayer>,
  options: RingPlaceholderOptions = {},
): RingPlaceholderHandles {
  const color = options.color ?? DEFAULT_RING_COLOR;
  const alpha = options.alpha ?? DEFAULT_RING_ALPHA;
  const sceneUnitPerMeter = renderScaleForTier(options.tier ?? 'solar');

  const meshes: Mesh[] = [];

  rings.forEach((ring, idx) => {
    // Babylon CreateDisc 는 단일 반경 원판 → 플레이스홀더는 outerRadius 만 반영.
    // PR-2.5 shader 에서는 innerRadius/outerRadius 범위에 따라 alpha 를 fragment 단위로 스컬프트.
    // 반경은 생성 시점의 tier 기준 — 이후 host.scaling 이 tier 비율을 자식에 전파한다.
    const radiusScene = ring.outerRadius * sceneUnitPerMeter;
    const disc = MeshBuilder.CreateDisc(
      `${host.name}-ring-${ring.id}`,
      { radius: radiusScene, tessellation: DISC_TESSELLATION },
      scene,
    );

    const mat = new StandardMaterial(`${host.name}-ring-${ring.id}-mat`, scene);
    mat.diffuseColor = new Color3(color[0], color[1], color[2]);
    mat.emissiveColor = new Color3(color[0] * 0.3, color[1] * 0.3, color[2] * 0.3);
    mat.specularColor = new Color3(0, 0, 0);
    mat.alpha = alpha;
    mat.backFaceCulling = false; // 위·아래 모두 보여야 함
    disc.material = mat;

    // Disc 는 기본적으로 XY 평면에 생성됨. 목성 공전면(황도면) 에 맞추려면
    // 적도면 경사가 있어야 하지만, 본 ADR §결정 #2 각주대로 Laplace plane 기준은
    // PR-2.5 본 shader 에서 처리. PR-1 은 평면 disk 로 족함.
    // R8 #647 §축 2a — 기준 궤도면(XY) 정렬 + 자전축 기울기 (미지정 0 — 기존 동작 하위 호환).
    // #1130 — base 는 `RING_DISC_BASE_TILT_X`(= π) SSoT. body 의 `ORBITAL_NORMAL_OFFSET` 과 짝.
    // #1130 — ORBITAL_NORMAL_OFFSET(π/2) 를 body 자전축과 **함께** 받는다. 한쪽만 옮기면
    //   보정 전에도 성립하던 `pole ↔ ring 법선 = 0°` 정합이 깨진다 (self-rotation.ts 참조).
    disc.rotation.x = RING_DISC_BASE_TILT_X + (options.axialTiltRad ?? 0);

    // 호스트 부모-자식 관계로 위치 자동 추종.
    disc.parent = host;

    // 여러 층을 약간씩 z-offset 해 z-fighting 방지 (idx 당 1e-4 AU ≈ 14960 km — 충분히 작음)
    disc.position.y = idx * 1e-4;

    meshes.push(disc);
  });

  const syncToHost = (hostMesh: Mesh) => {
    for (const m of meshes) {
      if (m.parent !== hostMesh) m.parent = hostMesh;
    }
  };

  const dispose = () => {
    for (const m of meshes) {
      m.material?.dispose();
      m.dispose();
    }
    meshes.length = 0;
  };

  return { meshes, syncToHost, dispose };
}
