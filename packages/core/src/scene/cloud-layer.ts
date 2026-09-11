/**
 * #1215 — 지구 구름 레이어 (host 자식 shell · ALPHABLEND · 차등 자전 · 투명 정렬 키 치환).
 *
 * 설계 정본: ADR `docs/decisions/20260628-756-procedural-planet-surface.md` **Amendment 10**
 * (§A10.3 결정 1 구조 · §A10.4 결정 2 재질 · §A10.5 결정 3 depth · §A10.6 결정 4 정렬 ·
 * §A10.7 결정 5 LOD · §A10.8 결정 6·7 자전).
 *
 * 이 모듈은 **순수 부품**만 가진다 — 셰이더 텍스트 · 머티리얼/메쉬 팩토리 · 상대 자전 적용 ·
 * 정렬 비교 함수 · 상수. 씬 배선 (생성 조건 · 회전 루프 · LOD 가시성 파생 · 정렬 함수 설치) 은
 * `solar-system-scene.ts` 가 소유한다.
 *
 * ⚠️ **Visual Fidelity** ([principles.md §1](../../../../docs/architecture/principles.md)) — shell 반경비와
 * (필요 시) 차등 속도 배수는 rendering-only 왜곡이다. 데이터 SSoT (`solar-system.json`) 는 건드리지
 * 않고, physics 엔진은 이 모듈을 참조하지 않는다 (§A10.3 §의무 체크리스트).
 */
import {
  Color3,
  Effect,
  MeshBuilder,
  Quaternion,
  ShaderMaterial,
  Vector3,
  type AbstractMesh,
  type Mesh,
  type Scene,
  type SubMesh,
} from '@babylonjs/core';
import type { LoadedCelestialBody } from '../ephemeris/solar-system-loader.js';
import type { SurfaceLightingArgs } from './body-mesh-factory.js';
import { LOG_DEPTH_FRAGMENT_WRITE_GLSL } from './log-depth.js';
import { SOFT_TERMINATOR_WIDTH } from './procedural-planet-shader.js';
import { computeSpinAngle } from './self-rotation.js';
import { renderScaleForTier, type Tier } from './tier.js';

// ─────────────────────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────────────────────

/** 구름 레이어를 갖는 body — 지구 전용 (#1215 비-범위: 다른 body 구름). */
export const CLOUD_LAYER_BODY_ID = 'earth';

/**
 * 구름이 표면에 대해 움직이는 대표 동서(zonal) 풍속 [m/s]. **출처 인용 값** (§A10.8 — 가드 통과를
 * 위해 고르지 않는다).
 *
 * 출처: J. M. Wallace, _UW ATM S 545 강의 노트 Ch. 2 (Angular momentum)_,
 * <https://a.atmos.uw.edu/academics/classes/2010Q2/545/545_Ch_2_notes.pdf> — 중위도 경압파
 * (구름·기상계를 싣고 가는 요란) 의 위상속도를 _"10-15 m s⁻¹, which is comparable to the wind
 * speed at the 700 hPa level (Wallace et al., 1988)"_ 로 적는다. 본 상수는 그 범위의 **하한**이다
 * (범위 안 임의 내삽값을 만들지 않으려고 인용된 경계값을 골랐다). **D1 사용자 승인 2026-09-11** —
 * `10 m/s` 유지, Visual Fidelity 배수 없음 (#1215 코멘트 5632521560).
 *
 * ⚠️ 이것은 **중위도** 대표값이다. 실제 지구 대기는 열대 편동풍 · 중위도 편서풍으로 위도마다 부호가
 * 갈리지만, 본 구현은 shell 전체를 하나의 강체 차등 회전으로 근사한다 (위도별 차등 비-범위).
 */
export const CLOUD_ZONAL_WIND_MS = 10;

/** [s/day] — `CLOUD_DRIFT_OMEGA` 단위 환산 (rad/s → rad/day). */
const SECONDS_PER_DAY = 86_400;

/**
 * 구름 shell 반경 / host 반경 (rendering-only 상수).
 *
 * **D1 사용자 승인 2026-09-11** (후보 B — #1215 코멘트
 * <https://github.com/coseo12/astro-simulator/issues/1215#issuecomment-5632521560>). 가드가 정한 값이
 * 아니다 (§A10.3 — _"반경비는 제품 상수다 … D1 사용자 육안이 정하고, 가드가 정하지 않는다"_).
 * 물리 비율 (구름 상층 `~10 km` / `6378 km` ≈ `1.0016`) 이면 결정적 프레임에서 림 돌출이 서브픽셀이라
 * 보이지 않는다 (§A10.3 [도출] `≈ 0.16 px`) — 이 값 자체가 Visual Fidelity 왜곡이며 §의무 체크리스트
 * 4항목이 ADR 에 박제돼 있다 (결정적 프레임 림 돌출 `98.32 px × 0.01 ≈ 0.98 px`).
 */
export const CLOUD_SHELL_RADIUS_RATIO = 1.01;

/** mid variant 와 같은 규칙이 아니라 **high variant 와 같은** segments (§A10.3 geometry). */
const CLOUD_SHELL_SEGMENTS = 32;

/**
 * 외형 상수 (rendering-only 미학 상수). **D1 사용자 승인 2026-09-11** — 후보 B (`cover 0.5` ·
 * `opacity 0.9`) 와 밤면 구름 밝기 유지 (새 상수 `0`) 가 결정됐다 (#1215 코멘트
 * <https://github.com/coseo12/astro-simulator/issues/1215#issuecomment-5632521560>). 나머지 네 값
 * (sharpness · frequency · detail 2종) 은 승인 캡처가 쓴 값 그대로다.
 *
 *  - `CLOUD_COVER` — fbm 밀도 임계 (smoothstep 하단). 높을수록 구름이 적다.
 *    ⚠️ 가드 (`verify:1202` G6 등) 를 통과시키려고 고르지 않는다 (계약 재조정 2 — C1 클래스 금지).
 *  - `CLOUD_SHARPNESS` — 임계 전이 폭 (smoothstep 폭). 작을수록 가장자리가 딱딱하다.
 *  - `CLOUD_OPACITY` — 최대 불투명도 (밀도 1 에서의 alpha).
 *  - `CLOUD_FREQUENCY` — 기본 fbm 공간 주파수 (단위 구 좌표 배수).
 *  - `CLOUD_DETAIL_FREQ_RATIO` / `CLOUD_DETAIL_WEIGHT` — 디테일 fbm 의 주파수 배율 / 혼합 비중.
 */
export const CLOUD_COVER = 0.5;
export const CLOUD_SHARPNESS = 0.12;
export const CLOUD_OPACITY = 0.9;
export const CLOUD_FREQUENCY = 3.0;
export const CLOUD_DETAIL_FREQ_RATIO = 2.9;
export const CLOUD_DETAIL_WEIGHT = 0.35;
/** 구름 albedo (흰색). 명암은 표면과 같은 광원식이 곱한다. */
export const CLOUD_COLOR_RGB = { r: 1.0, g: 1.0, b: 1.0 } as const;

/**
 * §A10.6 결정 4 — 정렬 키의 `rank`. 계열 (host · mid · low) 은 `0`, 구름은 `1` (동률 차순위).
 * 이 값이 판별력의 실제 담지자다 (변이 MC-12 — 구름도 `0` 이면 동률이 삽입 순서로 돌아간다).
 */
export const HOST_FAMILY_RANK = 0;
export const CLOUD_SORT_RANK = 1;

/**
 * §A10.8 — 구름의 **상대** 각속도 [rad/day] = `CLOUD_ZONAL_WIND_MS × 86400 / body.radius`.
 *
 * `body.radius` 는 데이터 SSoT (m — earth `6378137.0`) 라 차원이 rad/day 로 맞다 (§A10.16 C3).
 * 부호는 **양 (순행)** — 구름의 유효 각속도는 `ω_earth + CLOUD_DRIFT_OMEGA` 다.
 */
export function computeCloudDriftOmega(body: Pick<LoadedCelestialBody, 'radius'>): number {
  return (CLOUD_ZONAL_WIND_MS * SECONDS_PER_DAY) / body.radius;
}

// ─────────────────────────────────────────────────────────────────────────────
// 셰이더
// ─────────────────────────────────────────────────────────────────────────────

const SHADER_NAME = 'cloudLayer';

/**
 * vertex — `procedural-planet-shader.ts` 와 같은 배선 (local pos = 패턴 기준 / world normal = 광원 기준 /
 * clip.w = log-depth). vLocalPos 가 **구름 mesh 의 local** 이므로 상대 자전을 받으면 패턴이 표면에 대해
 * 흐른다 — 그것이 차등의 시각 기전이다.
 */
const CLOUD_VERTEX_SHADER = /* glsl */ `
precision highp float;

attribute vec3 position;
attribute vec3 normal;

uniform mat4 worldViewProjection;
uniform mat4 world;

varying vec3 vLocalPos;
varying vec3 vNormal;
varying float vFragmentDepth;

void main(void) {
  vLocalPos = normalize(position);
  vNormal = normalize((world * vec4(normal, 0.0)).xyz);
  vec4 clip = worldViewProjection * vec4(position, 1.0);
  gl_Position = clip;
  vFragmentDepth = 1.0 + clip.w;
}
`;

/**
 * fragment — 밀도 = fbm 임계, 명암 = 표면과 같은 광원식 (HemisphericLight + PointLight 재현).
 *
 * ⚠️ `hash33` / `hash13` / `valueNoise` / `fbm` 본문은 planet · sun · starfield 셰이더와 **텍스트 동일**한
 * 4번째 사본이다 (§A10.4 — 공용 상수 추출은 3 셰이더 최종 GLSL 을 건드려 픽셀 재실측을 부르므로
 * 비-범위). 동일성은 `sun-shader.test.ts` 의 `NOISE_CONTRACT_LINES` 가 묶는다. 5벌째가 되면
 * §A10.14-6 재검토.
 */
export const CLOUD_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec3 vLocalPos;
varying vec3 vNormal;
varying float vFragmentDepth;

uniform float logDepthConstant;

// 광원 — procedural-planet-shader.ts 와 같은 이름·같은 식 (PlanetLightingConstants 재사용, §A10.4).
uniform vec3 uSunDirection;
uniform float sunIntensity;
uniform vec3 sunDiffuse;
uniform float ambientIntensity;
uniform vec3 ambientGround;
uniform vec3 ambientSky;
uniform vec3 ambientUp;
uniform float softTerminatorWidth;

// 구름 외형 (rendering-only 미학 상수 — cloud-layer.ts 상수 SSoT).
uniform vec3 cloudColor;
uniform float cloudCover;
uniform float cloudSharpness;
uniform float cloudOpacity;
uniform float cloudFrequency;
uniform float cloudDetailFreqRatio;
uniform float cloudDetailWeight;

// 3D hash — sin-free fract-mix (starfield.ts hash33 답습 — swiftshader/tier-c fps 보호).
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

float hash13(vec3 p) {
  return hash33(p).x;
}

// 3D value noise — trilinear smoothstep 보간 (starfield.ts valueNoise 답습).
float valueNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(
      mix(hash13(i + vec3(0.0, 0.0, 0.0)), hash13(i + vec3(1.0, 0.0, 0.0)), u.x),
      mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), u.x),
      u.y
    ),
    mix(
      mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), u.x),
      mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), u.x),
      u.y
    ),
    u.z
  );
}

// 3-옥타브 fbm — procedural-planet-shader.ts 와 텍스트 동일.
float fbm(vec3 p) {
  return 0.55 * valueNoise(p) + 0.30 * valueNoise(p * 2.3) + 0.15 * valueNoise(p * 4.7);
}

void main(void) {
  vec3 p = normalize(vLocalPos);
  vec3 N = normalize(vNormal);

  // 광원 — procedural-planet-shader.ts 의 ①② 와 같은 식 (구름도 낮/밤이 갈린다).
  float hemiFactor = dot(N, ambientUp) * 0.5 + 0.5;
  vec3 ambientShade = ambientIntensity * mix(ambientGround, ambientSky, hemiFactor);
  float ndl = dot(N, uSunDirection);
  float sunFactor = smoothstep(0.0, softTerminatorWidth, ndl);
  vec3 shade = ambientShade + sunIntensity * sunDiffuse * sunFactor;

  // 밀도 — 저주파 덩어리 + 디테일 결. 디테일 fbm 은 다른 격자 위상을 쓰도록 좌표만 스케일한다.
  float coarse = fbm(p * cloudFrequency);
  float detail = fbm(p * (cloudFrequency * cloudDetailFreqRatio));
  float d = mix(coarse, detail, cloudDetailWeight);
  float density = smoothstep(cloudCover, cloudCover + cloudSharpness, d);

  vec3 col = clamp(cloudColor * shade, 0.0, 1.0);
  gl_FragColor = vec4(col, density * cloudOpacity);

  // log-depth — 없으면 shell 이 표면 바깥에 있어도 지구 표면에 depth 거부돼 사라진다 (§A10.4 실측).
  ${LOG_DEPTH_FRAGMENT_WRITE_GLSL}
}
`;

let cloudShaderRegistered = false;

function registerCloudShader(): void {
  if (cloudShaderRegistered) return;
  Effect.ShadersStore[`${SHADER_NAME}VertexShader`] = CLOUD_VERTEX_SHADER;
  Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = CLOUD_FRAGMENT_SHADER;
  cloudShaderRegistered = true;
}

/**
 * §A10.4 · §A10.5 — 구름 `ShaderMaterial`.
 *
 *  - ALPHABLEND: `needAlphaBlending: true` + `alphaMode = 2` (ring 레시피 — `createRingShaderMaterial`).
 *  - `backFaceCulling = true` — ring (`false`) 과 반대. 닫힌 구에서 `false` 면 반대편 구름이 비친다.
 *  - `disableDepthWrite = true` **명시** — Babylon 9.19.0 `setAlphaMode` 가 블렌드 draw 에서 플래그와
 *    무관하게 `depthMask = false` 로 두므로 거동은 같다 (§A10.5 실측·코드). 코드가 엔진의 실제 거동을
 *    말하게 하려는 명시다. ⚠️ **`forceDepthWrite` 금지** — 켜면 순서 문제가 depth 차폐로 바뀌어 지구가
 *    구름 아래에서 사라진다.
 *  - 광원: `SurfaceLightingArgs` 를 받아 **onBind 에서 매번** `sunPositionProvider()` 를 읽는다. 태양
 *    벡터를 캐시한 사본 금지 (#1204 영벡터 클래스).
 *  - ⚠️ `alphaIndex` 를 부여하지 않는다 — 정렬은 결정 4 의 키 치환이 host 값으로 대체하므로 효과가
 *    없고 오해만 만든다 (§A10.6 (a)).
 */
export function createCloudMaterial(
  scene: Scene,
  name: string,
  lightingArgs: SurfaceLightingArgs,
): ShaderMaterial {
  registerCloudShader();
  const material = new ShaderMaterial(
    name,
    scene,
    { vertex: SHADER_NAME, fragment: SHADER_NAME },
    {
      attributes: ['position', 'normal'],
      uniforms: [
        'worldViewProjection',
        'world',
        'logDepthConstant',
        'uSunDirection',
        'sunIntensity',
        'sunDiffuse',
        'ambientIntensity',
        'ambientGround',
        'ambientSky',
        'ambientUp',
        'softTerminatorWidth',
        'cloudColor',
        'cloudCover',
        'cloudSharpness',
        'cloudOpacity',
        'cloudFrequency',
        'cloudDetailFreqRatio',
        'cloudDetailWeight',
      ],
      needAlphaBlending: true,
    },
  );

  // 광원 상수 — 표면 셰이더와 같은 묶음 (PlanetLightingConstants, 신설 금지).
  const lighting = lightingArgs.lighting;
  material.setFloat('sunIntensity', lighting.sunIntensity);
  material.setColor3('sunDiffuse', new Color3(...lighting.sunDiffuse));
  material.setFloat('ambientIntensity', lighting.ambientIntensity);
  material.setColor3('ambientGround', new Color3(...lighting.ambientGround));
  material.setColor3('ambientSky', new Color3(...lighting.ambientSky));
  material.setVector3('ambientUp', new Vector3(...lighting.ambientUp));
  material.setFloat('softTerminatorWidth', SOFT_TERMINATOR_WIDTH);

  // 외형 상수. ⚠️ 이 블록이 통째로 사라져도 GLSL 정적 assert 는 전건 통과한다 (§A8.8 M-2 동형
  // 사각 — 변이 MC-1). 그 축은 픽셀 가드 (`verify:1215-cloud-layer` C1) 가 막는다.
  material.setColor3(
    'cloudColor',
    new Color3(CLOUD_COLOR_RGB.r, CLOUD_COLOR_RGB.g, CLOUD_COLOR_RGB.b),
  );
  material.setFloat('cloudCover', CLOUD_COVER);
  material.setFloat('cloudSharpness', CLOUD_SHARPNESS);
  material.setFloat('cloudOpacity', CLOUD_OPACITY);
  material.setFloat('cloudFrequency', CLOUD_FREQUENCY);
  material.setFloat('cloudDetailFreqRatio', CLOUD_DETAIL_FREQ_RATIO);
  material.setFloat('cloudDetailWeight', CLOUD_DETAIL_WEIGHT);

  // 태양 방향 — onBind 에서 매 draw 갱신 (캐시 금지). 초기값은 provider 가 없을 때의 fallback 이 아니라
  // 첫 bind 전 uniform 공백 방지용이다 (첫 bind 가 즉시 덮어쓴다).
  material.setVector3('uSunDirection', new Vector3(1, 0, 0));
  const tmpSunDir = new Vector3();
  material.onBindObservable.add((mesh) => {
    const sunPos = lightingArgs.sunPositionProvider();
    const meshPos = (mesh as Mesh).getAbsolutePosition();
    sunPos.subtractToRef(meshPos, tmpSunDir);
    tmpSunDir.normalize();
    material.setVector3('uSunDirection', tmpSunDir);
  });

  // log-depth 상수 — procedural-planet-shader.ts / ring-shader.ts 와 같은 식 (maxZ 1e14 fallback).
  const maxZ = scene.activeCamera?.maxZ ?? 1e14;
  material.setFloat('logDepthConstant', 2.0 / (Math.log(maxZ + 1.0) / Math.LN2));

  material.backFaceCulling = true;
  material.alphaMode = 2; // Engine.ALPHA_COMBINE (standard transparency)
  material.disableDepthWrite = true;
  return material;
}

// ─────────────────────────────────────────────────────────────────────────────
// 메쉬 팩토리 + 상대 자전
// ─────────────────────────────────────────────────────────────────────────────

export interface CloudLayerHandles {
  /** 구름 shell mesh (host 자식). 이름 `${body.id}-cloud`. */
  mesh: Mesh;
  material: ShaderMaterial;
  /** 구름을 싣고 있는 host (earth high mesh). */
  host: Mesh;
  /** 상대 각속도 [rad/day] — `computeCloudDriftOmega(body)`. */
  driftOmega: number;
  dispose: () => void;
}

/**
 * §A10.3 결정 1 — 구름 = host mesh 의 **자식** shell.
 *
 * position · scaling · host 자전을 **구조적으로 상속**하므로 동기 코드가 `0` 이다 (ring-anchor 의
 * `updateAt` / `setTier` 이중 동기 — #782/#785 실결함 — 를 피한 구조). local 위치 `0`, local scaling =
 * 반경비, local 회전 = 상대 자전 (`applyCloudDrift`) 만.
 *
 * geometry 는 host 와 **같은 diameter 산식** (`body-mesh-factory.ts` `createBodyMesh`) — `tier` 는 host
 * 생성 시점 tier 여야 한다 (host scaling 이 이후 tier 전환을 상속시킨다 — mid variant 와 같은 규약).
 */
export function createCloudLayer(
  scene: Scene,
  body: LoadedCelestialBody,
  host: Mesh,
  tier: Tier,
  bodyScale: (bodyId: string) => number,
  lightingArgs: SurfaceLightingArgs,
): CloudLayerHandles {
  const diameter = body.radius * 2 * renderScaleForTier(tier) * bodyScale(body.id);
  const mesh = MeshBuilder.CreateSphere(
    `${body.id}-cloud`,
    { diameter, segments: CLOUD_SHELL_SEGMENTS },
    scene,
  );
  mesh.parent = host;
  mesh.position.set(0, 0, 0);
  mesh.scaling.setAll(CLOUD_SHELL_RADIUS_RATIO);
  // 상대 자전은 quaternion 으로만 쓴다 (Euler ↔ quaternion 배타 — host 와 같은 규약).
  mesh.rotationQuaternion = Quaternion.Identity();
  // body 선택 raycast 비간섭 — shell 이 host 보다 커서 ray 를 먼저 맞는다 (#713 역매핑 metadata 없음).
  mesh.isPickable = false;

  const material = createCloudMaterial(scene, `${body.id}-cloud-mat`, lightingArgs);
  mesh.material = material;

  return {
    mesh,
    material,
    host,
    driftOmega: computeCloudDriftOmega(body),
    dispose: () => {
      material.dispose();
      mesh.dispose();
    },
  };
}

/** 구름 상대 자전 축 — host local Y (자전축). 모듈 상수 (alloc 0). */
const CLOUD_DRIFT_AXIS = new Vector3(0, 1, 0);

/**
 * §A10.8 결정 6 — 구름 local 회전 = local Y 주위 `Δθ(jd) = computeSpinAngle(jd, epoch, driftOmega)`.
 *
 * host 가 `tilt ∘ spin(θs)` 이므로 world 는 `tilt ∘ spin(θs + Δθ)` 가 된다. **jd 순수 함수** — 매 프레임
 * 누적 금지 (§A2.3 결정 5). 호출 위치·게이트는 scene 이 소유한다 (host 자전과 같은 루프 ·
 * `rotationStates.has(host.id)` 와 같은 조건 — 결정 7 `?rotate=off` 구조적 상속).
 */
export function applyCloudDrift(layer: CloudLayerHandles, jd: number, epoch: number): void {
  const q = layer.mesh.rotationQuaternion;
  if (!q) return;
  Quaternion.RotationAxisToRef(CLOUD_DRIFT_AXIS, computeSpinAngle(jd, epoch, layer.driftOmega), q);
}

// ─────────────────────────────────────────────────────────────────────────────
// §A10.6 결정 4 — 투명 정렬 키 치환
// ─────────────────────────────────────────────────────────────────────────────

/** 사전식 정렬 키 `(alphaIndex, distance, rank)`. */
export interface TransparentSortKey {
  alphaIndex: number;
  distance: number;
  rank: number;
}

/**
 * 사전식 비교 — `alphaIndex` 오름차순 → `distance` **내림차순** (back-to-front) → `rank` 오름차순 →
 * 끝까지 같으면 `0` (안정 정렬이 삽입 순서를 보존).
 *
 * `rank` 를 뺀 앞 두 키는 Babylon `RenderingGroup.defaultTransparentSortCompare` 와 같은 순서다
 * (9.19.0 `renderingGroup.js` — alphaIndex 먼저, 그다음 `backToFrontSortCompare`). 사전식 키라
 * 엄격 약순서가 **구조적으로** 성립한다 (초판의 「거리 무시 쌍 규칙」 은 비추이 가능 — §A10.6).
 */
export function compareTransparentSortKeys(a: TransparentSortKey, b: TransparentSortKey): number {
  if (a.alphaIndex > b.alphaIndex) return 1;
  if (a.alphaIndex < b.alphaIndex) return -1;
  if (a.distance < b.distance) return 1;
  if (a.distance > b.distance) return -1;
  if (a.rank > b.rank) return 1;
  if (a.rank < b.rank) return -1;
  return 0;
}

/** host 계열 등록 항목 — 이 mesh 의 정렬 키는 `host` 의 값으로 치환되고 `rank` 를 받는다. */
interface HostFamilyEntry {
  host: AbstractMesh;
  rank: number;
}

/**
 * host 계열 **식별자 집합** (이름 문자열 비교 금지 — §A10.6). 조회 `O(1)`.
 *
 * 계열 = host · mid variant · low billboard · 구름. 구름·host 는 생성 시, lazy 생성되는 mid·low 는
 * scene 의 `getVariantMesh` 생성 지점에서 등록한다.
 */
export class HostFamilyRegistry {
  private readonly entries = new Map<AbstractMesh, HostFamilyEntry>();
  private readonly hosts = new Set<AbstractMesh>();

  /** host 자신을 계열 원점으로 등록 (`rank 0`). */
  registerHost(host: AbstractMesh): void {
    this.hosts.add(host);
    this.entries.set(host, { host, rank: HOST_FAMILY_RANK });
  }

  /** 이미 등록된 host 의 계열에 mesh 를 편입. host 미등록이면 무시하고 `false`. */
  registerMember(mesh: AbstractMesh, host: AbstractMesh, rank: number): boolean {
    if (!this.hosts.has(host)) return false;
    this.entries.set(mesh, { host, rank });
    return true;
  }

  isHost(mesh: AbstractMesh): boolean {
    return this.hosts.has(mesh);
  }

  resolve(mesh: AbstractMesh): HostFamilyEntry | undefined {
    return this.entries.get(mesh);
  }
}

/**
 * Babylon `_RenderSorted` 가 투명 정렬 직전에 submesh 에 채우는 두 필드 (9.19.0 `renderingGroup.js`
 * — `_alphaIndex = getMesh().alphaIndex` / `_distanceToCamera = Vector3.Distance(centerWorld, cameraPosition)`).
 * d.ts 에서는 internal 이라 구조 타입으로 읽는다.
 */
interface SortedSubMeshFields {
  _alphaIndex: number;
  _distanceToCamera: number;
}

/**
 * 렌더링 그룹 0 의 투명 정렬 함수 — 계열은 host 값으로 치환, 계열 밖은 자기 값 + `rank 0`.
 *
 * host 의 `distance` 는 Babylon 과 **같은 식** — `Vector3.Distance(boundingSphere.centerWorld,
 * cameraPosition)`. host 가 숨겨져 큐에 없을 때도 host 의 bounding 정보에서 직접 계산한다 (host 는
 * 자식에게 transform 을 공급하려고 `setEnabled(true)` 를 유지한다 — `hideVariantEntirely`).
 *
 * ⚠️ **이 함수는 alpha 기반 LOD fade 기전에 결합돼 있다** (§A10.14-7). fade 중 절차 셰이더 variant 는
 * `material.alpha < 1` 로 투명 큐에 들어가 구름과 **거리 완전 동률**이 되고, 삽입 순서상 lazy 생성
 * mid 가 구름 뒤에 그려져 구름을 덮는다 (§A10.12 실측 `changed 0 / 29144`). 결정 4 는 그 기전
 * 때문에 존재한다 — fade 기전이 바뀌면 이 함수와 가드 C5 를 함께 재검토한다.
 *
 * @param getCameraPosition `_RenderSorted` 와 같은 카메라 (`scene.activeCamera.globalPosition`,
 *   카메라 부재 시 원점). 비교마다 읽는다 (캐시 금지 — 프레임 간 stale 방지).
 */
export function createHostFamilyTransparentSortCompare(
  registry: HostFamilyRegistry,
  getCameraPosition: () => Vector3,
): (a: SubMesh, b: SubMesh) => number {
  const keyA: TransparentSortKey = { alphaIndex: 0, distance: 0, rank: 0 };
  const keyB: TransparentSortKey = { alphaIndex: 0, distance: 0, rank: 0 };
  const fillKey = (subMesh: SubMesh, out: TransparentSortKey): void => {
    const entry = registry.resolve(subMesh.getMesh());
    if (entry) {
      out.alphaIndex = entry.host.alphaIndex;
      out.distance = Vector3.Distance(
        entry.host.getBoundingInfo().boundingSphere.centerWorld,
        getCameraPosition(),
      );
      out.rank = entry.rank;
      return;
    }
    const fields = subMesh as unknown as SortedSubMeshFields;
    out.alphaIndex = fields._alphaIndex;
    out.distance = fields._distanceToCamera;
    out.rank = HOST_FAMILY_RANK;
  };
  return (a: SubMesh, b: SubMesh): number => {
    fillKey(a, keyA);
    fillKey(b, keyB);
    return compareTransparentSortKeys(keyA, keyB);
  };
}
