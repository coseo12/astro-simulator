/**
 * body mesh LOD variant 3종 팩토리 (high sphere / mid low-poly / low billboard quad).
 *
 * #850 Phase 1 — `solar-system-scene.ts` 테일에서 **순수 이동** (동작·값 변경 0).
 * 이동 전 위치: `solar-system-scene.ts` 2114-2121 (`SurfaceLightingArgs`) / 2123-2228
 * (`createBodyMesh` / `createBodyMeshMid`) / 2359-2440 (`createBodyBillboard`).
 * 클로저 참조 0 — 전부 인자 (`body` / `scene` / `tier` / `parent` / `bodyScale`) 만 사용한다.
 *
 * ADR: `20260424-p11-b-lod-design.md` (LOD 3단) / `20260425-r1-sun-visualization.md` (bodyScale)
 * / `20260502-391-phase2-billboard.md` (alpha mask) / `20260628-756-procedural-planet-surface.md`.
 */
import {
  Color3,
  MeshBuilder,
  StandardMaterial,
  type Mesh,
  type Scene,
  type Vector3,
} from '@babylonjs/core';
import type { LoadedCelestialBody } from '../ephemeris/solar-system-loader.js';
import { renderScaleForTier, type Tier } from './tier.js';
import { hexToColor3 } from './color-utils.js';
import {
  createProceduralPlanetMaterial,
  type PlanetLightingConstants,
} from './procedural-planet-shader.js';
// #774 — 태양 emissive 절차 표면 셰이더 (granulation + limb darkening + 색온도).
// ADR `docs/decisions/20260703-774-sun-emissive-shader.md` §결정 1 — SURFACE_TYPE_BY_BODY 미등록
// 유지 (테이블은 "외부광 반사 표면" 전용), star 분기가 직접 본 팩토리 호출.
import { createSunSurfaceMaterial } from './sun-shader.js';
import { GLOW_MARKER_RESTORE_EMISSIVE_SCALE_NON_STAR } from './glow-marker.js';
import { getOrCreateBillboardAlphaMask } from './billboard-alpha-mask.js';

/**
 * #773 Amendment 1 — 절차 표면 셰이더 광원 배선 인자 (createBodyMesh/createBodyMeshMid 공유).
 * scene 가 소유한 광원 상수 + sun position provider 를 셰이더 팩토리로 단방향 전달.
 */
export interface SurfaceLightingArgs {
  lighting: PlanetLightingConstants;
  sunPositionProvider: () => Vector3;
}

export function createBodyMesh(
  body: LoadedCelestialBody,
  scene: Scene,
  tier: Tier,
  bodyScale: (bodyId: string) => number,
  surfaceDetail = false,
  surfaceLighting?: SurfaceLightingArgs,
): Mesh {
  // P12-A #298 — 실측 직경 × 현재 tier 의 renderScale 로 메쉬 생성.
  // R1 #329 — × bodyScale (시각 과장 배수, ADR `20260425-r1-sun-visualization.md` §결정 3).
  // `mesh.scaling` 은 1 유지 (tier 전환 시 scaling.scaleInPlace 로 비율 적용, ADR §주석 §2).
  const diameter = body.radius * 2 * renderScaleForTier(tier) * bodyScale(body.id);
  const mesh = MeshBuilder.CreateSphere(body.id, { diameter, segments: 32 }, scene);

  // #756 — 절차적 표면 셰이더 (surfaceDetail=true + 테이블 등록 body 만). 미등록/OFF 면 null →
  // 기존 StandardMaterial 경로 (단색, 무회귀).
  // ADR `docs/decisions/20260628-756-procedural-planet-surface.md` §결정 1·4 + Amendment 1 (#773).
  // #774 — 항성(star)은 emissive 전용 sun 셰이더 (광원 인자 불요 — ADR 20260703-774 §결정 1·4).
  // `?surface=off` (surfaceDetail=false) 면 기존 star 단색 emissive 100% 복귀 (§결정 8).
  const surfaceMat = surfaceDetail
    ? body.kind === 'star'
      ? createSunSurfaceMaterial(scene, body, `${body.id}-surface-mat`)
      : createProceduralPlanetMaterial(scene, body, `${body.id}-surface-mat`, surfaceLighting ?? {})
    : null;
  if (surfaceMat) {
    mesh.material = surfaceMat;
  } else {
    const mat = new StandardMaterial(`${body.id}-mat`, scene);
    const hex = body.colorHint?.hex ?? '#888888';
    const c = hexToColor3(hex);
    if (body.kind === 'star') {
      mat.emissiveColor = c;
      mat.disableLighting = true;
    } else {
      mat.diffuseColor = c;
      mat.specularColor = new Color3(0.05, 0.05, 0.05);
    }
    mesh.material = mat;
  }
  // #713 — mesh → bodyId 역매핑 (high variant). ADR `20260620-713-click-body-select.md` §결정 1.
  // pick 결과(pickedMesh)에서 O(1) 역변환. high/mid/low 전 variant 동일 id 박제 (단위 테스트 가드).
  mesh.metadata = { ...(mesh.metadata as object | null), bodyId: body.id };
  return mesh;
}

/**
 * P11-B #289 — mid LOD variant: 저폴리 sphere (segments=12).
 *
 * ADR `docs/decisions/20260424-p11-b-lod-design.md` §축 4.
 * high (segments=32) 대비 약 85% 버텍스 감소 — draw call 비용 동일하나 GPU fill-rate / transform 절감.
 *
 * parent 를 high variant 로 지정 — position / scale 은 high 에서 자동 상속.
 * `scaling = 1` 유지 → tier 전환 시 high 와 동일 배수로 확대 (parent 상속).
 */
export function createBodyMeshMid(
  body: LoadedCelestialBody,
  scene: Scene,
  tier: Tier,
  parent: Mesh,
  bodyScale: (bodyId: string) => number,
  surfaceDetail = false,
  surfaceLighting?: SurfaceLightingArgs,
): Mesh {
  // R1 #329 — high variant 와 동일 식 (× bodyScale) 로 비율 보존. LOD 전환 시 사용자가 크기 변화 인지 못함.
  const diameter = body.radius * 2 * renderScaleForTier(tier) * bodyScale(body.id);
  const mesh = MeshBuilder.CreateSphere(`${body.id}-lod-mid`, { diameter, segments: 12 }, scene);
  mesh.parent = parent;
  // parent local 기준 원점 (high mesh 와 동일 위치).
  mesh.position.set(0, 0, 0);

  // #756 — mid variant 도 high 와 동일 절차 셰이더 공유 (segments 만 다름 — ADR §결정 1).
  // LOD 전환 시 표면 연속성 (사용자 인지 불변). 미등록/OFF 면 null → StandardMaterial 무회귀.
  // #773 Amendment 1 — 동일 광원 인자 (high/mid 명암 일관 — 각 variant 의 onBind 가 자기 sunDir 갱신).
  // #774 — 항성(star)은 high 와 동일 sun 셰이더 공유 (팝핑 0 — ADR 20260703-774 §결정 6).
  const surfaceMat = surfaceDetail
    ? body.kind === 'star'
      ? createSunSurfaceMaterial(scene, body, `${body.id}-lod-mid-surface-mat`)
      : createProceduralPlanetMaterial(
          scene,
          body,
          `${body.id}-lod-mid-surface-mat`,
          surfaceLighting ?? {},
        )
    : null;
  if (surfaceMat) {
    mesh.material = surfaceMat;
  } else {
    const mat = new StandardMaterial(`${body.id}-lod-mid-mat`, scene);
    const hex = body.colorHint?.hex ?? '#888888';
    const c = hexToColor3(hex);
    if (body.kind === 'star') {
      mat.emissiveColor = c;
      mat.disableLighting = true;
    } else {
      mat.diffuseColor = c;
      mat.specularColor = new Color3(0.05, 0.05, 0.05);
    }
    // alpha blend 허용 — 200ms cross-fade 에서 material.alpha 조작.
    mat.useAlphaFromDiffuseTexture = false;
    mesh.material = mat;
  }
  // #713 — mesh → bodyId 역매핑 (mid variant). high/low 와 동일 id (ADR §결정 1).
  mesh.metadata = { ...(mesh.metadata as object | null), bodyId: body.id };
  mesh.setEnabled(false); // 기본 숨김 — 첫 전환 시 enable.
  return mesh;
}

/**
 * P11-B #289 — low LOD variant: billboard quad (BILLBOARDMODE_ALL).
 *
 * ADR `docs/decisions/20260424-p11-b-lod-design.md` §축 4.
 * 2 triangle. T1 solar 뷰에서 sub-pixel 로 모이는 100+ body 에 대해 draw call 최소화.
 *
 * billboard 는 카메라를 항상 바라보므로 albedo 단색 quad 가 sphere 느낌을 대체.
 *
 * Phase 2 #333 — billboard 는 sphere/mid variant 와 달리 `bodyScale` 미적용.
 * 책임 분리: sphere/mid 가 시각 과장 (sun ×75) 을 전담, billboard 는 sub-pixel draw call 절감만.
 * focus 강제 해제 + 1 AU+ 카메라 거리 + 픽셀 경계 부족 케이스에서 거대 quad 회귀 차단.
 * ADR `docs/decisions/20260425-r1-sun-visualization.md` §"Phase 2 결정 (#333)" amendment 참조.
 *
 * #391 Phase 2 — alpha mask 적용 의무 (drift 방어).
 *  - quad 의 정사각형 윤곽이 픽셀 그리드에 그대로 노출 → 사용자 D-T2 회귀 (mercury/venus 사각형)
 *  - 본 함수는 항상 alpha mask 적용된 material 로 생성 (기본 상태). LOD pass 가 매 프레임 측정한
 *    pxDiameter < 4px 진입 시 runLodPass 가 opacityTexture = null + transparencyMode = 0 (OPAQUE)
 *    로 fallback 토글. ADR `docs/decisions/20260502-391-phase2-billboard.md` §결정 §"4px fallback".
 *  - 공유 텍스처는 `getOrCreateBillboardAlphaMask(scene)` 가 scene 단위 1회 생성, 24 body 가 동일
 *    인스턴스를 `opacityTexture` 로 참조 → 메모리 ≈ 16KB VRAM (per-body 생성 금지).
 *  - alpha mask threshold (smoothstep 0.4/0.5) 변경 시 ADR Amendment 의무.
 *  - transparencyMode = 1 (ALPHATEST) — ALPHABLEND (2) 는 24 body back-to-front CPU 정렬 부하.
 */
export function createBodyBillboard(
  body: LoadedCelestialBody,
  scene: Scene,
  tier: Tier,
  parent: Mesh,
  bodyScale: (bodyId: string) => number,
): Mesh {
  // Phase 2 #333 — billboard 는 sphere/mid variant 와 달리 bodyScale 미적용.
  // 책임 분리: sphere/mid = 가시 과장 책임 (sun ×75), billboard = sub-pixel draw call 절감 책임 단독.
  // ADR `docs/decisions/20260425-r1-sun-visualization.md` §"Phase 2 결정 (#333) — billboard 에서 bodyScale 제거 (후보 A 채택)" 참조.
  // bodyScale 인자 자체는 시그니처 호환성 유지 위해 보존 (호출부 통일 + 미래 변경 가능성).
  void bodyScale; // Phase 2 #333 — 시그니처 보존, 식에서 미사용 명시.
  const diameter = body.radius * 2 * renderScaleForTier(tier);
  const mesh = MeshBuilder.CreatePlane(
    `${body.id}-lod-low`,
    { size: diameter, sideOrientation: 2 /* DOUBLESIDE */ },
    scene,
  );
  mesh.parent = parent;
  mesh.position.set(0, 0, 0);
  mesh.billboardMode = 7; // BILLBOARDMODE_ALL

  const mat = new StandardMaterial(`${body.id}-lod-low-mat`, scene);
  const hex = body.colorHint?.hex ?? '#888888';
  const c = hexToColor3(hex);
  if (body.kind === 'star') {
    mat.emissiveColor = c;
    mat.disableLighting = true;
  } else {
    mat.diffuseColor = c;
    // billboard 는 구형 음영이 없으므로 약한 emissive 로 가시성 보장 — 값은 glow-marker.ts
    // RESTORE 상수와 양방향 SSoT (#675 reviewer 권고 2: 인라인 리터럴은 cross-assert 불가한 단방향 pin)
    mat.emissiveColor = c.scale(GLOW_MARKER_RESTORE_EMISSIVE_SCALE_NON_STAR);
    mat.specularColor = new Color3(0, 0, 0);
  }

  // #391 Phase 2 — alpha mask 적용 (기본 상태).
  // ADR `docs/decisions/20260502-391-phase2-billboard.md` §결정 §"developer 단계 작업 명세" §1.
  // - opacityTexture 로 procedural 원형 alpha mask 적용 (scene 공유 1회 생성)
  // - transparencyMode = ALPHATEST (1) — ALPHABLEND (2) 는 24 body back-to-front 정렬 매 프레임 부하
  //   ALPHATEST 는 fragment shader discard + Z-buffer write → CPU 정렬 비용 0 + 하드웨어 occlusion
  // - useAlphaFromDiffuseTexture = false — opacityTexture 채널 단독 사용 (diffuse 와 분리)
  // 4px fallback 진입 시 runLodPass 가 opacityTexture = null + transparencyMode = OPAQUE (0) 토글.
  mat.opacityTexture = getOrCreateBillboardAlphaMask(scene);
  // Babylon `Material.MATERIAL_ALPHATEST = 1`. 정적 상수 직접 import 시 일부 빌드 환경에서
  // tree-shake 충돌 가능 — 숫자 리터럴 + 주석 SSoT 로 박제 (ADR `20260502-391-phase2-billboard.md`).
  mat.transparencyMode = 1; // ALPHATEST
  mat.useAlphaFromDiffuseTexture = false;
  // ALPHATEST 의 cutoff. opacityTexture alpha < alphaCutOff 면 fragment discard.
  // smoothstep 0.4~0.5 전이 구간의 중간값 (alpha ≈ 0.5) 을 cutoff 로 두면 원형 외곽 ≈ 1px 안티앨리어싱.
  mat.alphaCutOff = 0.5;

  mesh.material = mat;
  // #713 — mesh → bodyId 역매핑 (low/billboard variant). high/mid 와 동일 id (ADR §결정 1).
  // glow marker body 클릭 시 picked mesh 가 low variant 이므로 본 박제가 marker 선택의 핵심.
  mesh.metadata = { ...(mesh.metadata as object | null), bodyId: body.id };
  mesh.setEnabled(false); // 기본 숨김.
  return mesh;
}
