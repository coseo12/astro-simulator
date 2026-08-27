/**
 * #756 — 절차적 행성 표면 셰이더 (1차: 인프라 + 대표 4개, 라이브러리/에셋 0).
 *
 * **목적**: 단색 `StandardMaterial.diffuseColor` 로 렌더되는 행성에 절차적 표면 디테일을
 * 부여해 몰입을 강화한다 (방향성 기획 트랙 A — `principles.md §1 Visual Fidelity`). 외부
 * 텍스처 에셋 / 신규 라이브러리 0. `ring-shader.ts` / `starfield.ts` 의 절차적 ShaderMaterial
 * 구조를 답습한다.
 *
 * **설계 근거**: ADR `docs/decisions/20260628-756-procedural-planet-surface.md`
 *   - §결정 1 — 신규 모듈 (ring/starfield 답습). high/mid 공유 ShaderMaterial (segments 만 다름),
 *     low (billboard) 미적용.
 *   - §결정 2 — 표면 타입 소스 = 코드 상수 테이블 `SURFACE_TYPE_BY_BODY` (데이터 SSoT 불변).
 *     셰이더 내부 = 단일 셰이더 + `uniform int surfaceType` + **if-else 분기** (switch 금지 —
 *     Babylon GLSL→WGSL 변환 깨짐, cross-validate 이견 수용 1).
 *   - §결정 3 — high/mid 적용, low + tier-c (`forceOverride:'low'`) 자동 단색 (별도 코드 0).
 *   - §결정 4 — `?surface=off` = StandardMaterial 현행 복귀 (생성 시점 분기, scene 옵션).
 *   - §결정 5 — `colorHint.hex` → `uniform vec3 baseColor`, 절차 변조는 그 위에 합성.
 *
 * **Amendment 1 (#773/#775) — 광원 일관성 회귀 + 지구 대륙 mix** (ADR §Amendment 1):
 *   - §A1.3 결정 1 — 고정 방향 명암 (`shade = 0.85 + 0.15 * dot(N, fixed)`) 을 **실제 태양 방향**
 *     기반 명암으로 교체. `uniform vec3 uSunDirection` 을 `createProceduralPlanetMaterial` 의
 *     `onBindObservable` 클로저에서 각 draw 직전 `normalize(sunPos − meshPos)` 로 갱신.
 *
 * **Amendment 2 (#782) — 옵션 e (world normal) 전환 + self-rotation** (ADR §Amendment 2):
 *   - §A2.3 결정 2 — self-rotation 도입으로 body mesh 가 자전축 주위로 회전한다. `vNormal`(local) ≠
 *     world normal 이 되어 광원 dot 이 표면과 함께 회전해 명암이 자전을 따라 돌아버린다 (밤면이 태양을
 *     안 따름). **옵션 e 활성화**: VERTEX 가 `uniform mat4 world` 로 `vNormal = normalize((world *
 *     vec4(normal,0)).xyz)` 계산 → 명암이 태양 방향에 고정 (자전 무관). **uniform scale + 순수 회전
 *     전제** 에서 `world` matrix 로 충분 (normalMatrix inverse-transpose 불요 — 등방 scale 은 자기
 *     자신의 상수배, cross-validate Q2 합의). `world` 는 Babylon ShaderMaterial 표준 auto-bind uniform.
 *   - **vLocalPos 는 local 유지** — 절차 노이즈(대륙/밴드/크레이터)는 표면에 그려진(painted-on) 패턴이라
 *     mesh 와 함께 회전해야 한다. world 로 바꾸면 패턴이 공간 고정되어 mesh 가 미끄러진다. vNormal 만
 *     world, vLocalPos 는 local — 이 분리가 핵심 (ADR §A2.3 결정 2).
 *   - **jd 미전달 계약** — 자전각은 CPU(float64) 에서 계산해 `mesh.rotationQuaternion` 으로 적용,
 *     `world` matrix 로 반영된다. 셰이더는 jd 를 받지 않는다. 미래에 시간 기반 셰이더 효과 추가 시
 *     jd(~2.4e6)를 float32 uniform 으로 넘기면 하위 비트 손실로 jitter 발생 → 금지 (cross-validate Q3).
 *   - §A1.3 결정 2 — **HemisphericLight 식 완전 재현** (`mix(ground, sky, dot(N,up)*0.5+0.5)`) +
 *     PointLight diffuse (`sunIntensity * sunDiffuse * smoothstep(0, W, dot(N, sunDir))`). 단색 행성
 *     (StandardMaterial + PointLight 2.5 + HemisphericLight ambient) 과 시각 일치 (밤면/terminator/극).
 *   - §A1.3 결정 4 (#775) — rocky 분기를 `mix(oceanColor, landColor, landMask)` 로 교체 (대륙 색 구분).
 *
 * **Amendment 3 (#783) — 지구 극관 + biome 위도 색 변화** (ADR §Amendment 3):
 *   - §A3.3 결정 3 — rocky 분기에 biome 3밴드 (적도 녹 → 중위도 황토 → 고위도 툰드라, 2 smoothstep
 *     연쇄 mix) + 극관 (continents 무관 최종 mix — 결정 4 B). 위도 임계는 전부 **sin-space**
 *     (`p.y = sin(위도)`, §A3.2-1). 경계 자연화 = 기존 `continents` fbm 재사용 (**추가 noise 샘플 0**
 *     — 결정 3-c, fill-rate 보호). `landColor` 는 temperate 밴드 색으로 의미 재문서화 (Q3 합의).
 *   - 극관도 albedo 단계에서만 — `col *= shade` 최종 곱 불변 (#773 규약, 밤면 극관은 어둡다).
 *   - 자전 불변 (§A3.2-2): spin 은 local Y 축 회전이라 `abs(p.y)` 위도 밴드/극관은 자전해도 불변
 *     (painted-on 정합 — 극관이 흔들릴 구조 자체가 없음).
 *
 * **Amendment 4 (#1119) — 지구 대륙 윤곽 실제화 (저해상도 육지 마스크)** (ADR §Amendment 4):
 *   - §A4.3 결정 2·3 — Natural Earth 50m 파생 `1024×512` GRAYSCALE equirectangular 마스크 1장을
 *     `uniform sampler2D uSurfaceMask` 로 샘플한다. UV 는 기존 `p = normalize(vLocalPos)` 에서
 *     파생 (`u = atan(p.z,p.x)/2π + 0.5`, `v = acos(p.y)/π`) — **`attributes` 배열 무변경**
 *     (mesh UV attribute 미바인딩 유지). 자전(#782)·`axialTiltDeg` 는 `vNormal`/world matrix 축이라
 *     마스크가 **추가 배선 0 으로 자동 상속**한다 (painted-on 계약).
 *   - §A4.3 결정 5 — `continents` fbm 은 **폐기하지 않고 역할 전환**: 마스크 = 저주파 **형상**,
 *     fbm = 고주파 **디테일**(도메인 워프) + biome 경계 jitter. **fbm 호출 수 불변** (신규 noise 0).
 *   - §A4.3 결정 6 — 대상 body 는 코드 상수 `SURFACE_MASK_BY_BODY` (데이터 SSoT 불변 — 마스크는
 *     물리 관측값이 아니라 rendering 에셋 참조다). 미등록 body 는 `uMaskEnabled = 0` 으로 현행
 *     절차 경로 **픽셀 동일**.
 *   - §A4.3 결정 7 — graceful degradation: `uniform float uMaskEnabled` (0/1) 로 절차 경로와
 *     마스크 경로를 `mix`. **`uMaskEnabled` 로 분기하지 않는다** — 텍스처는 분기 밖에서 **무조건
 *     1회** 샘플하고 결과만 섞는다 (`gravitational-lensing.ts` 의 "textureSample 은 분기 밖 1회"
 *     규약 정합 + Phase 0 게이트가 실측한 구성 그대로).
 *   - §A4.3 결정 4 — 원거리 축소 LOD: 투영 disk 반경 < `SURFACE_MASK_MIN_DISK_PX` 면 `uMaskEnabled`
 *     를 `0` 으로 되돌린다 (over-resolution × noMipmap = shimmer). **결정 7 의 분기를 재사용**하므로
 *     신규 코드 표면 0.
 *
 * ⚠️ **옵션 e 배선 계약 (drift 가드, Amendment 2)**: 본 광원 모델은 "vNormal = world normal (world
 *   matrix 변환) + uniform scaling" 에 의존한다. `world` uniform 이 uniforms 배열에서 빠지거나 VERTEX
 *   가 vNormal 을 local 로 되돌리면, 자전 시 명암이 표면과 함께 돌아버린다. onBind 의 dev-only 어서션이
 *   `world` 배선 누락 / vNormal 오용을 조기 감지 (once-guard — reviewer #776, 프레임당 spam 차단).
 *   **비균일 scale 도입 시** (미래 tier 가 비등방) 옵션 (B) normalMatrix 로 승격 (ADR §A2.7 재검토 2).
 *
 * **광원 물리 상수 SSoT 주입**: sun intensity/diffuse + ambient intensity/ground/sky/up 은
 *   `solar-system-scene.ts` 가 SSoT 로 소유한다 (PointLight/HemisphericLight 와 동일 값 — 마법 숫자
 *   중복 금지, volt #69). 셰이더는 scene 를 import 하지 않고 (순환 회피) `createProceduralPlanetMaterial`
 *   인자로 주입받아 uniform 으로 설정한다 (단방향 의존). soft terminator / 육지색 등 rendering-only
 *   미학 상수는 본 셰이더 모듈이 SSoT.
 *
 * **표면 타입 4종 (§결정 5)**:
 *   - rocky (지구) — base 위 대륙/해양 대비 (저주파 noise) + 미세 명암.
 *   - desert (화성) — base 위 dust/협곡 결 (fbm) + 산화철 톤 변조.
 *   - gas-bands (목성) — base 위 위도 밴드 (latitude 변조) + 난류 결.
 *   - cratered (달) — base 위 크레이터 (cell noise 점 분포) + 명암.
 *
 * **WebGPU↔WebGL parity**: ShaderMaterial GLSL 은 양 백엔드 동작 (ring/starfield 선례 — Babylon
 *   GLSL→WGSL 변환). WGSL 별도 작성 불필요. WebGL1 미지원 (tier 시스템 전제, ring/starfield 정합).
 *
 * **log-depth 정합 (§핵심 위험 1, ring-shader #641 D-T2 선례)**: scene 이 `enableLogarithmicDepth`
 *   로 본체 StandardMaterial 을 로그 depth 공간에 기록한다. 커스텀 ShaderMaterial 이 표준 z 를
 *   쓰면 depth 비교 공간이 불일치 → 표면이 항상 다른 body 위로 그려지는 가림 버그. fragment 에서
 *   `gl_FragDepth` 를 Babylon logDepth 공식으로 기록해 정합.
 */

import {
  Color3,
  Effect,
  Matrix,
  ShaderMaterial,
  Vector3,
  Viewport,
  type Mesh,
  type Scene,
} from '@babylonjs/core';
import type { LoadedCelestialBody } from '../ephemeris/solar-system-loader.js';
// #1157 — 회전 불변 시각 반경 SSoT (#790). `camera-controller.ts` 는 `@babylonjs/core` 외의
// 모듈을 import 하지 않으므로 순환 없음 (`tier-transition.ts` 가 같은 방향으로 이미 의존한다).
import { resolveMeshVisualRadius } from './camera-controller.js';
import { hexToColor3 } from './color-utils.js';
import { LOG_DEPTH_FRAGMENT_WRITE_GLSL } from './log-depth.js';
import {
  getOrCreateSurfaceMaskPlaceholder,
  getOrCreateSurfaceMaskTexture,
} from './surface-mask-texture.js';

// ─────────────────────────────────────────────────────────────────────────────
// 표면 타입 enum ↔ uniform int 매핑 SSoT (#756 §결정 2).
//
// JS enum 값이 곧 GLSL `uniform int surfaceType` 정수다. drift 가 발생하면 셰이더 분기가
// 엉뚱한 표면을 그린다 (조용한 회귀). procedural-planet-shader.test.ts 가 enum↔int 매핑 SSoT
// 를 가드한다 (ring-shader MAX_ARCS parity #728 패턴).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 표면 타입 — `uniform int surfaceType` 의 정수 값과 1:1 대응 (SSoT).
 *
 * ⚠️ 이 정수 값은 FRAGMENT_SHADER 의 `if (uSurfaceType == N)` 분기와 동일해야 한다
 * (한쪽 수정 시 양쪽 동기화 의무 — 테스트 가드 대상).
 */
export enum SurfaceType {
  /** 암석형 — 대륙/해양 대비 (지구). */
  Rocky = 0,
  /** 사막형 — dust/협곡 결 + 산화철 톤 (화성). */
  Desert = 1,
  /** 가스 밴드형 — 위도 밴드 + 난류 (목성). */
  GasBands = 2,
  /** 크레이터형 — 점 분포 크레이터 + 명암 (달). */
  Cratered = 3,
}

/**
 * #756 §결정 2 — body id → 표면 타입 코드 상수 테이블 (데이터 SSoT 불변).
 *
 * "표면 타입" 은 물리 데이터가 아니라 **rendering 분류** 다 (principles.md §적용 위치).
 * `solar-system.json` 은 NASA/JPL 실측 (반경/색상/궤도) 의 SSoT 이므로 rendering 관심사를
 * 누수시키지 않는다. 테이블 미등록 body 는 자동으로 단색 (StandardMaterial) — 23개 비-범위
 * body 무회귀가 **테이블 부재로 자동 보장** (명시적 opt-in).
 *
 * 1차는 대표 4개. 이후 확장 = 데이터 추가가 아닌 **상수 1줄 추가** (R-Phase).
 */
export const SURFACE_TYPE_BY_BODY: Readonly<Record<string, SurfaceType>> = {
  earth: SurfaceType.Rocky,
  mars: SurfaceType.Desert,
  jupiter: SurfaceType.GasBands,
  moon: SurfaceType.Cratered,
};

// ─────────────────────────────────────────────────────────────────────────────
// 변조 강도 미학 상수 SSoT (#69 숨은 상수 drift 차단 — 테스트 가드 대상).
// 데이터 SSoT 아님 (rendering-only 미학 상수 — Visual Fidelity §의무 체크리스트 정합).
// 박제값 근거는 measurement-first (변조 강도는 시각 품질 실측으로 박제). baseColor (실측 색)
// 위에 합성되는 변조 진폭 — 과도하면 base 색이 묻히고, 0 이면 단색과 동일.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * rocky 대륙/해양 대비 진폭 (base color 대비 명암 변조 ±). 저주파 noise 로 대륙 패턴 형성.
 * 너무 크면 base 색 (지구 청록) 이 묻힘 — 0.35 로 디테일 ↔ base 보존 균형.
 */
export const ROCKY_CONTRAST = 0.35;

/** desert dust/협곡 결 진폭 (fbm 변조). 화성 표면의 거친 결. */
export const DESERT_DETAIL = 0.3;

/** desert 산화철 톤 변조 — R 채널 boost / B 채널 감쇠 (붉은 화성). 보라/마젠타 회피 위해 G 보존. */
export const DESERT_RUST_TINT = 0.18;

/** gas-bands 위도 밴드 명암 진폭 (sin(latitude) 변조). 목성 줄무늬 대비. */
export const GAS_BAND_AMPLITUDE = 0.28;

/** gas-bands 밴드 개수 (위도 방향 줄무늬 빈도). 목성 ~ 10여 개 밴드. */
export const GAS_BAND_COUNT = 9;

/** gas-bands 난류 결 진폭 (밴드 위 fbm 흐트러짐). 0 이면 직선 밴드. */
export const GAS_TURBULENCE = 0.12;

/** cratered 크레이터 명암 깊이 (cell noise 점 분포). 달 표면 어두운 크레이터. */
export const CRATER_DEPTH = 0.4;

/** cratered 크레이터 격자 밀도 (셀/방향). 클수록 크레이터가 촘촘. */
export const CRATER_DENSITY = 14;

// ─────────────────────────────────────────────────────────────────────────────
// Amendment 1 (#773/#775) — 광원 모델 + 대륙 mix rendering-only 미학 상수 SSoT.
// (광원 물리 상수 sun/ambient 는 scene 가 SSoT — 주입받음. 아래는 셰이더 고유 미학 상수.)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * soft terminator 폭 (낮/밤 경계 부드러움) — `smoothstep(0.0, W, dot(N, sunDir))` (ADR §A1.3 이견 수용 1).
 *
 * 단색 행성의 `max(dot(N,L), 0)` 를 soft 근사 — ndl ≤ 0 (밤면/terminator) 은 0 (밤면 어두움 유지),
 * 0 ~ W 구간만 부드럽게 전이. segments 12 (mid) / 32 (high) 의 곡면 법선 변화가 조밀하지 못해
 * `clamp(dot,0,1)` 단순 적용 시 경계가 톱니처럼 각진다 → smoothstep 으로 완화 (cross-validate agy
 * 이견 수용). 너무 크면 낮/밤 대비가 흐려지고, 0 이면 톱니 — 0.12 로 부드러움 ↔ 대비 균형 (measurement-first).
 */
export const SOFT_TERMINATOR_WIDTH = 0.12;

/**
 * #775 — rocky 육지색 RGB (rendering-only 미학 상수, 데이터 SSoT 무관 — ADR §A1.3 결정 4 A).
 *
 * ocean 색 = base color (colorHint.hex, 데이터 SSoT read-only). land 색 = 본 상수. 황토-브라운
 * 자연 톤 (R/G 우세, B 결핍 — 보라/마젠타 anti-pattern 구조적 회피, #756 가드 정합). landMask 로
 * ocean↔land 색조(hue) mix → "바다만" 회귀 (밝기 변조만) 해소.
 *
 * ⚠️ **Amendment 3 (#783) 의미 재문서화 — temperate(중위도 황토·갈색) 밴드 색으로 사용됨**
 * (cross-validate Q3 합의 — 신규 상수 대신 기존 landColor uniform 배선 재사용, drift 0). biome
 * 3밴드 (BIOME_TROPICAL → 본 상수 → BIOME_TUNDRA) 의 중간 밴드다. 값도 #775 올리브
 * (0.34, 0.40, 0.24) 에서 황토 방향으로 튜닝 (§A3.3 결정 3-b measurement-first — DoD 2 의
 * 적도>중위도 G-share 분리 마진 확보). 제약: G-share 가 BIOME_TROPICAL_RGB 보다 작아야 한다
 * (테스트 가드).
 */
export const LAND_COLOR_RGB = { r: 0.44, g: 0.38, b: 0.23 } as const;

/** #775 — 대륙 mask smoothstep 하한 (continents fbm < LO → 100% ocean). */
export const LAND_THRESHOLD_LO = 0.48;

/** #775 — 대륙 mask smoothstep 상한 (continents fbm > HI → 100% land). LO~HI 사이 해안선 전이. */
export const LAND_THRESHOLD_HI = 0.62;

// ─────────────────────────────────────────────────────────────────────────────
// Amendment 3 (#783) — 지구 극관 + biome 위도 색 rendering-only 미학 상수 SSoT (§A3.3 결정 3).
//
// 위도 임계는 전부 **sin-space** (fragment 의 p.y = sin(위도) — §A3.2-1, 정규화 위도 아님.
// CreateSphere pole = local ±Y, 선형 위도가 아니라 60° 에서 0.866). 각 상수 주석에 대응 각도 병기.
// 전 색상 G ≥ min(R,B) (보라/마젠타 anti-pattern 구조 회피 — 테스트 가드). 데이터 SSoT 무관
// (solar-system.json 0 — rendering-only). 출발값은 ADR §A3.3 결정 3-b, 최종값 measurement-first.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * #783 — 적도 열대 밴드 색 (녹 우세 — 열대 숲).
 * 제약: G-share (G/(R+G+B)) 가 temperate(LAND_COLOR_RGB) 보다 커야 한다 (§A3.5 DoD 2
 * 밴드 구분 측정 가능성 — 테스트 가드).
 */
export const BIOME_TROPICAL_RGB = { r: 0.2, g: 0.38, b: 0.16 } as const;

/**
 * #783 — 고위도 툰드라 밴드 색 (회백). 극관과의 연속 전이를 위해 BIOME_TUNDRA_HI 가
 * ICE_LAT_LO 와 맞닿는다 (이슈 "툰드라→극관 연결" — cross-validate Q2 합의 순차 임계).
 */
export const BIOME_TUNDRA_RGB = { r: 0.55, g: 0.56, b: 0.52 } as const;

/** #783 — 극관 색 (근중성 백 — G ≥ min(R,B) 유지, B 단독 우세 아님). */
export const ICE_COLOR_RGB = { r: 0.93, g: 0.95, b: 0.96 } as const;

/** #783 — 열대→온대 전이 시작 (sin-space 0.30 ≈ 위도 17°). */
export const BIOME_TEMPERATE_LO = 0.3;

/** #783 — 열대→온대 전이 완료 (sin-space 0.55 ≈ 위도 33°). */
export const BIOME_TEMPERATE_HI = 0.55;

/** #783 — 온대→툰드라 전이 시작 (sin-space 0.72 ≈ 위도 46°). */
export const BIOME_TUNDRA_LO = 0.72;

/**
 * #783 — 온대→툰드라 전이 완료 (sin-space 0.84 ≈ 위도 57° — ICE_LAT_LO 와 맞닿음).
 * 출발값 0.88 → 0.84 하향 (measurement-first — 아래 ICE_LAT_LO 튜닝과 동조).
 */
export const BIOME_TUNDRA_HI = 0.84;

/**
 * #783 — 극관 전이 시작 (sin-space 0.84 ≈ 위도 57°).
 * 출발값 0.88 → 0.84 하향 튜닝 (measurement-first, §A3.3 결정 3-b 재량): 출발값에서는 ice ramp
 * (0.88→0.96) 가 DoD 1 측정 밴드 (|sin lat| ≥ 0.88) 전체와 겹쳐 밴드 대부분이 iceMask < 0.6
 * (ocean cyan 혼합, near-white 스펙트럼 밖) — 실측 near-white 비율 10.2% 로 미달. 하향으로
 * 밴드 안에서 ice 가 완성돼 흰 극관 시인 + DoD 1 충족. 실제 지구 빙설선 (~55–60°) 근사 유지.
 */
export const ICE_LAT_LO = 0.84;

/** #783 — 극관 전이 완료 (sin-space 0.92 ≈ 위도 67°). 출발값 0.96 → 0.92 (동조 튜닝 — 위 참조). */
export const ICE_LAT_HI = 0.92;

/**
 * #783 — biome 경계 요동 진폭. 기존 `continents` fbm 재사용 (§A3.3 결정 3-c — 추가 noise 샘플 0,
 * fill-rate 보호). (fbm − 0.5) × 0.12 = 위도 ±0.06 요동. 상관 아티팩트 발현 시 좌표 스위즐링
 * fbm(p.zyx) 승격 (§A3.7 재검토 조건 4 — 단 fbm 신규 호출 = hash 24회 추가 비용).
 */
export const BIOME_LAT_JITTER = 0.12;

// ─────────────────────────────────────────────────────────────────────────────
// Amendment 4 (#1119) — 지구 대륙 마스크 상수 SSoT (§A4.3 결정 2·4·5·6).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * #1119 §A4.3 결정 6 — body id → 마스크 **파일명** 코드 상수 테이블 (데이터 SSoT 불변).
 *
 * `solar-system.json` 에 `surfaceMask` 필드를 추가하는 안은 **기각**됐다 — 마스크는 IAU/NASA
 * 물리 관측값이 아니라 **rendering 에셋 참조**이므로 데이터 SSoT 에 누수시키지 않는다
 * (`SURFACE_TYPE_BY_BODY` 동형). base URL 은 `createSolarSystemScene` 옵션으로 주입받는다 —
 * core 가 web 라우팅을 알면 단방향 의존이 깨진다.
 *
 * 확장(화성 등) = **본 테이블 1줄 + 에셋 1장, 데이터 0** (§A4.7 재검토 조건 4). 단 화성 마스크는
 * "육지/바다" 가 아니라 albedo 지형이라 의미가 달라 별건 설계 대상이다.
 */
export const SURFACE_MASK_BY_BODY: Readonly<Record<string, string>> = {
  earth: 'earth-land-mask.png',
};

/**
 * #1119 §A4.3 결정 5 — 마스크 샘플 좌표의 fbm 도메인 워프 진폭 (UV 단위, rendering-only 미학 상수).
 *
 * 기존 `continents` fbm 을 **재사용**해 마스크 UV 를 밀어 해안선의 텍셀 직선성을 깬다 (신규 noise
 * 샘플 0 — §A3.3 결정 3-c 의 "noise 샘플 +0" 불변식 보존). `0.006` 은 `v` 축 기준 `0.006 × 512 ≈ 3`
 * 텍셀 폭(진폭 ±1.5 텍셀) 로, 기본 focus(R≈98px) 에서는 sub-pixel 이고 최대 줌인(R≈811px, texel
 * ≈14.9px)에서 해안선 요동으로 드러난다.
 *
 * ⚠️ **한정** — `continents = fbm(p * 2.4)` 의 최고 옥타브는 입력이 `p × 11.28` 이고 `valueNoise`
 * 격자 셀이 `1` 이므로, **`p` 가 단위벡터**라 셀 하나가 호 길이 `1/11.28 rad = 5.079°` 에 대응한다.
 * 마스크 텍셀은 `360/1024 = 0.352°` → **특징 크기 ≈ 14.4 텍셀**. 즉 본 워프는 **텍셀 십수 개
 * 범위에서 서서히 변하는 변위**이지 텍셀 이하 고주파가 **아니다**.
 *
 * ⚠️⚠️ **초판 주석은 `31.9°` (≈ 91 텍셀) 이라 적었고 이는 `2π` 배 틀렸다** — 단위구의 대원 둘레는
 * `360` 이 아니라 `2π` **격자 단위**인데 `360 / 11.28` 로 계산했다 (reviewer 지적 수용, 2026-08-17).
 * 결론(워프가 텍셀 이하가 아님)은 유지되지만 **마진이 `91×` → `14.4×` 로 좁아졌다** — 해상도를
 * 올리거나 워프 진폭을 키우면 두 스케일이 겹치는 대역에 훨씬 빨리 닿는다는 뜻이므로,
 * §A4.7 재검토 조건 2·3 (`textureGrad` 승격 / 해상도 승격) 판단에서 이 값을 다시 봐야 한다.
 * 어느 경우든 **여기서 fbm 을 새로 호출하지 않는다** (결정 5 위반).
 */
export const MASK_WARP_AMP = 0.006;

/**
 * #1119 §A4.3 결정 4 (cross-validate 권고 2) — 마스크 적용 하한 disk 반경 (화면 픽셀).
 *
 * `noMipmap` 전제에서 disk 가 아주 작아지면 (전체 태양계 조감) 1024 마스크가 과도하게 축소돼
 * shimmer 가 난다. 이 대역에서는 `uMaskEnabled = 0` 으로 되돌려 **결정 7 의 절차 경로를 재사용**
 * 한다 (신규 분기 0).
 *
 * **결정 2 논거의 반대편 끝이다** — 정합 폭 `2πR` 구간 `[618, 1854]` 의 상한(R 이 크면 마스크가
 * 모자람)으로 1024 를 정당화했으면, 하한은 R 이 작으면 마스크가 **과함**을 뜻한다
 * (`R = 16 px` → 정합 폭 ≈ 100 → 1024 는 `10.2×` over-resolution).
 *
 * 1차 출발값이며 measurement-first 조정 대상 (#774 결정 8 동형). low variant(billboard) 는 애초에
 * 셰이더 미진입이라 실제로 걸리는 구간은 **mid variant 의 원거리 끝**이다.
 */
export const SURFACE_MASK_MIN_DISK_PX = 16;

/** shader 이름 prefix — ShadersStore key 충돌 방지 (ring/starfield 패턴 답습). */
const SHADER_NAME = 'proceduralPlanet';

/**
 * GLSL vertex shader — local position (절차 생성 기준) + world normal (광원 기준) 을 fragment 로 전달.
 *
 * **vLocalPos = local 구면 좌표** — 절차 패턴(대륙/밴드/크레이터)의 기준. tier scale / floating-origin
 * shift / self-rotation 에 표면 패턴이 mesh 와 함께 움직여 "표면에 그려진(painted-on)" 것으로 보인다.
 *
 * **vNormal = world normal (Amendment 2 옵션 e)** — `normalize((world * vec4(normal,0)).xyz)`. self-
 * rotation 으로 mesh 가 회전하면 local normal ≠ world normal 이 되어 광원 dot 이 표면과 함께 돌아버린다.
 * world matrix 로 변환해 명암이 태양 방향에 고정된다 (자전 무관). uniform scale + 순수 회전 전제에서
 * `world` matrix 로 충분 (normalMatrix inverse-transpose 불요 — cross-validate Q2 합의). log-depth 를
 * 위해 clip-space w 도 전달 (ring-shader #641 선례).
 */
const VERTEX_SHADER = /* glsl */ `
precision highp float;

attribute vec3 position;
attribute vec3 normal;

uniform mat4 worldViewProjection;
// Amendment 2 (#782) 옵션 e — world matrix (Babylon auto-bind). vNormal 을 world 공간으로 변환해
// self-rotation 후에도 광원 dot 이 태양 방향에 고정. uniform scale + 순수 회전이라 world 곱 후
// normalize 로 충분 (normalMatrix 불요). ⚠️ jd/큰 수 uniform 은 넘기지 않는다 (float32 jitter 차단).
uniform mat4 world;

varying vec3 vLocalPos;
varying vec3 vNormal;
// #756 §핵심 위험 1 — 로그 depth: scene 이 enableLogarithmicDepth 로 StandardMaterial(본체)을
// 로그 depth 공간에 기록하는데, 커스텀 ShaderMaterial 이 표준 z 를 쓰면 depth 비교 공간이
// 불일치 → 본체 표면이 항상 다른 body 위로 그려진다. ring-shader 와 동일하게 fragment 에서
// gl_FragDepth 를 로그 공간으로 기록한다 (#641 D-T2 fix 선례).
varying float vFragmentDepth;

void main(void) {
  // local 구면 좌표 — 절차 패턴의 기준 (tier scale / floating-origin / self-rotation 시 mesh 추종).
  vLocalPos = normalize(position);
  // Amendment 2 옵션 e — world normal (self-rotation 후에도 광원 dot 이 태양 방향 고정). w=0 으로
  // 변환해 translation 무시 (방향 벡터), uniform scale 이므로 normalize 로 스케일 정규화.
  vNormal = normalize((world * vec4(normal, 0.0)).xyz);
  vec4 clip = worldViewProjection * vec4(position, 1.0);
  gl_Position = clip;
  vFragmentDepth = 1.0 + clip.w;
}
`;

/**
 * GLSL fragment shader — base color 위 표면 타입별 절차 변조 (단일 셰이더 + if-else 분기).
 *
 * uniforms:
 *   - baseColor: 실측 색 (colorHint.hex) — 변조의 기준 (데이터 SSoT, read-only).
 *   - uSurfaceType: 표면 타입 정수 (SurfaceType enum 값 — JS↔GLSL SSoT).
 *   - 변조 강도 상수 (rockyContrast / desertDetail / ... ) — rendering-only 미학 상수 SSoT.
 *   - logDepthConstant: Babylon logDepth 정합 상수.
 *
 * varying:
 *   - vLocalPos: 정규화 구면 좌표 (절차 생성 기준 — local, self-rotation 시 mesh 추종).
 *   - vNormal: 표면 법선 (Amendment 2 옵션 e — world normal, 광원 dot 이 태양 방향 고정).
 *
 * **GPU warp divergence 0**: body 1개 = draw 1개 = 동일 uSurfaceType → 같은 draw 안 모든
 * fragment 가 같은 분기 (ADR §결정 2 A). **switch-case 금지** (WGSL 변환 깨짐) — if-else 만 사용.
 */
const FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec3 vLocalPos;
varying vec3 vNormal;
varying float vFragmentDepth;

uniform vec3 baseColor;
uniform int uSurfaceType;
uniform float rockyContrast;
uniform float desertDetail;
uniform float desertRustTint;
uniform float gasBandAmplitude;
uniform float gasBandCount;
uniform float gasTurbulence;
uniform float craterDepth;
uniform float craterDensity;
uniform float logDepthConstant;

// Amendment 1 (#773) — 광원 모델 uniform (HemisphericLight + PointLight 재현, scene SSoT 주입).
//   uSunDirection: 실제 태양 방향 (normalize(sunPos − meshPos), world) — onBind 에서 매 draw 갱신.
//                  Amendment 2 옵션 e: vNormal 도 world normal 이라 동일 좌표계 dot 정합 (자전 무관).
//   sunIntensity / sunDiffuse: PointLight (intensity 2.5 / diffuse (1,0.95,0.8)) 재현.
//   ambientIntensity / ambientGround / ambientSky / ambientUp: HemisphericLight 재현
//                  (mix(ground, sky, dot(N,up)*0.5+0.5) — terminator/극 그라데이션 일치).
//   softTerminatorWidth: 낮/밤 경계 smoothstep 폭 (각짐 완화, cross-validate 이견 1).
uniform vec3 uSunDirection;
uniform float sunIntensity;
uniform vec3 sunDiffuse;
uniform float ambientIntensity;
uniform vec3 ambientGround;
uniform vec3 ambientSky;
uniform vec3 ambientUp;
uniform float softTerminatorWidth;

// Amendment 1 (#775) — 지구 대륙 mix uniform (rendering-only 미학 상수, scene 무관).
//   landColor: 육지색 (황토-브라운, R/G 우세 — 보라/마젠타 회피). ⚠️ Amendment 3 (#783):
//              temperate(중위도) 밴드 색으로 사용됨 (의미 재문서화 — cross-validate Q3 합의).
//   landThresholdLo/Hi: continents fbm → landMask smoothstep 임계 (해안선 전이).
uniform vec3 landColor;
uniform float landThresholdLo;
uniform float landThresholdHi;

// Amendment 3 (#783) — 지구 biome/극관 uniform 블록 (rocky 전용, rendering-only 미학 상수 —
// biome 상수 블록 그룹화, cross-validate 부분 수용 6). 위도 임계는 전부 sin-space (§A3.2-1
// — p.y = sin(위도), 주석 각도는 상수 선언부 참조).
//   biomeTropicalColor: 적도 열대 녹. biomeTundraColor: 고위도 툰드라 회백. iceColor: 극관 백.
//   biomeTemperateLo/Hi · biomeTundraLo/Hi · iceLatLo/Hi: 위도 밴드 smoothstep 임계.
//   biomeLatJitter: 경계 요동 진폭 (기존 continents fbm 재사용 — 추가 noise 0, §A3.3 결정 3-c).
uniform vec3 biomeTropicalColor;
uniform vec3 biomeTundraColor;
uniform vec3 iceColor;
uniform float biomeTemperateLo;
uniform float biomeTemperateHi;
uniform float biomeTundraLo;
uniform float biomeTundraHi;
uniform float iceLatLo;
uniform float iceLatHi;
uniform float biomeLatJitter;

// Amendment 4 (#1119) — 지구 대륙 마스크 uniform (§A4.3 결정 2·4·6·7).
//   uSurfaceMask: 1024×512 GRAYSCALE equirectangular 육지 마스크 (.r = 육지 계조 0~1).
//                 ⚠️ 미도착/미등록 구간에도 1×1 placeholder 가 바인드돼 있다 — 샘플러가 비면
//                 WebGPU 에서 파이프라인이 깨지므로 "항상 바인드" 가 계약이다.
//   uMaskEnabled: 0 = 현행 절차 경로 (Amendment 3 픽셀 동일) / 1 = 마스크 경로. 로드 미도착·실패
//                 (결정 7) 와 원거리 축소 LOD (결정 4) 가 같은 uniform 을 공유한다 (분기 재사용).
//   maskWarpAmp:  마스크 UV 의 fbm 도메인 워프 진폭 (기존 continents 재사용 — 신규 noise 0).
uniform sampler2D uSurfaceMask;
uniform float uMaskEnabled;
uniform float maskWarpAmp;

// equirectangular UV 역수 상수 (매직 넘버 분리 — 1/(2π), 1/π).
const float INV_TWO_PI = 0.1591549430918953;
const float INV_PI = 0.3183098861837907;

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

// 3-옥타브 fbm — 자연스러운 표면 결 (starfield 2-옥타브 + 1 추가, 행성 표면 디테일 강화).
float fbm(vec3 p) {
  return 0.55 * valueNoise(p) + 0.30 * valueNoise(p * 2.3) + 0.15 * valueNoise(p * 4.7);
}

void main(void) {
  vec3 p = normalize(vLocalPos);
  // Amendment 2 (#782) 옵션 e: vNormal 은 VERTEX 에서 world matrix 변환된 world normal 이다
  //    (self-rotation 후에도 광원 dot 이 태양 방향 고정). vLocalPos(local) 는 절차 패턴 기준으로
  //    분리 — 표면 패턴은 mesh 와 함께 회전, 명암은 태양 고정. onBind dev 어서션이 world 배선 감지.
  vec3 N = normalize(vNormal);

  // Amendment 1 (#773) — 실제 태양 방향 기반 명암 (단색 행성 StandardMaterial 과 시각 일치).
  //   Amendment 2 옵션 e: vNormal = world normal 이라 sunDirection(world) 과 동일 좌표계 dot 정합.
  // ① HemisphericLight 재현 — mix(ground, sky, dot(N,up)*0.5+0.5). 밤면 floor + 극 그라데이션.
  float hemiFactor = dot(N, ambientUp) * 0.5 + 0.5;
  vec3 ambientShade = ambientIntensity * mix(ambientGround, ambientSky, hemiFactor);
  // ② PointLight diffuse 재현 — sunIntensity * sunDiffuse * smoothstep(0, W, dot(N, sunDir)).
  //    단색 행성의 max(dot,0) 를 soft 근사 — ndl ≤ 0 (밤면/terminator) 은 0 (밤면 어두움 유지),
  //    0 ~ W 구간만 부드럽게 전이해 segments 12/32 의 경계 톱니(aliasing) 완화 (cross-validate 이견 1).
  float ndl = dot(N, uSunDirection);
  float sunFactor = smoothstep(0.0, softTerminatorWidth, ndl);
  vec3 sunShade = sunIntensity * sunDiffuse * sunFactor;
  // 합성 명암 (StandardMaterial PointLight+HemisphericLight diffuse 항 재현 — diffuseColor 곱 전).
  vec3 shade = ambientShade + sunShade;
  vec3 col = baseColor;

  // ── Amendment 4 (#1119) — 지구 대륙 마스크 샘플 (§A4.3 결정 3·5·7) ───────────────
  // continents fbm 은 rocky 전용이라 분기 안에서만 계산한다 (desert/gas/cratered 의 fragment
  // 비용 불변 — 하나라도 새는 순간 mars/jupiter/moon 이 fbm 1회를 더 낸다). 신규 fbm 호출
  // **없음**: Amendment 3 까지 rocky 분기에 있던 그 호출을 위로 끌어올렸을 뿐이다 (§결정 5).
  float continents = 0.0;
  if (uSurfaceType == 0) {
    continents = fbm(p * 2.4);
  }
  // fbm 도메인 워프 — u/v 를 반대 부호로 밀어 해안선의 텍셀 직선성을 깬다. 변위 방향은 고정이나
  // 진폭이 continents 로 공간 변조돼 경계가 불규칙해진다 (신규 noise 샘플 0 — §결정 5).
  float maskWarp = (continents - 0.5) * maskWarpAmp;
  // equirectangular — local +X = 경도 0°(본초자오선) / local +Y = 북극(위도 +90°) → v = 0.
  // u 는 WRAP_ADDRESSMODE 라 ±180° 를 넘어가도 정상 순환하므로 clamp 하지 않는다. v 는 acos 라
  // 0.0/1.0 이 정확히 극점이고, 워프가 그 값을 넘기면 역투영 특이점이 생긴다 — CLAMP_ADDRESSMODE
  // 는 좌표를 자를 뿐 **극에서 경도가 정의되지 않는 문제**를 막지 못한다. 두 축의 처리가 다르다.
  //
  // ⚠️ **극점에서 atan(0, 0) 은 GLSL 명세상 undefined 다** (reviewer 지적 수용, 2026-08-17).
  // Phase 0 과 §결정 5 는 v 축(acos pinch) 만 다뤘고 u 축의 이 빈틈은 커버리지 밖이었다.
  // **실해는 없다** — (i) 정확히 p.x == p.z == 0 인 fragment 는 measure-zero 이고 (ii) 그 위도는
  // iceMask 가 포화해 landMask 기여가 0 이며 (iii) 비-rocky 타입은 maskLand 를 소비하지 않는다.
  // 4 타입 전부 실측 통과했으므로 방어 코드를 넣지 않는다 — 넣으면 분기 밖 1회 샘플 계약과
  // fragment 비용 불변 계약을 동시에 건드린다. **사실만 남기고 조치하지 않는 것이 결정이다.**
  float maskU = atan(p.z, p.x) * INV_TWO_PI + 0.5 + maskWarp * 0.5;
  float maskV = clamp(acos(clamp(p.y, -1.0, 1.0)) * INV_PI - maskWarp, 0.001, 0.999);
  // ⚠️ **분기 밖 무조건 1회 샘플** (§결정 7). uMaskEnabled 로 감싸지 말 것 — WGSL 은 textureSample
  // 을 비균일 제어 흐름에서 금지하며, Phase 0 게이트가 PASS 한 구성이 바로 이 배치다.
  float maskLand = texture2D(uSurfaceMask, vec2(maskU, maskV)).r;

  // #756 §결정 2 — 표면 타입별 절차 변조 (if-else 분기만). 같은 draw = 같은 타입 (divergence 0).
  if (uSurfaceType == 0) {
    // ── rocky (지구) — 대륙 마스크 (#1119) + biome 위도 색 + 극관 (Amendment 3 #783) ──
    // Amendment 4: landMask 소스가 fbm smoothstep → **실제 대륙 마스크** 로 전환된다. ocean =
    // baseColor (실측 청록, read-only 규약) 와 해안선 전이 구조는 그대로 (#775 계약 보존).
    // uMaskEnabled = 0 이면 Amendment 3 시점 식으로 **정확히** 복귀한다 (회귀 격리 기계 판정점).
    float proceduralMask = smoothstep(landThresholdLo, landThresholdHi, continents);
    float landMask = mix(proceduralMask, maskLand, uMaskEnabled);
    // Amendment 3 (#783) §A3.3 결정 3 — 위도 파라미터 (sin-space: p.y = sin(위도), §A3.2-1).
    float latRaw = abs(p.y);                                        // |sin(위도)| — 남북 대칭
    float latJ = latRaw + (continents - 0.5) * biomeLatJitter;      // 경계 자연화 — 기존 fbm 재사용 (추가 noise 0)
    // 대륙색: 적도 녹색 → 중위도 황토·갈색 (landColor=temperate) → 고위도 툰드라 회백 (2 smoothstep 연쇄 mix)
    vec3 landCol = mix(biomeTropicalColor, landColor, smoothstep(biomeTemperateLo, biomeTemperateHi, latJ));
    landCol = mix(landCol, biomeTundraColor, smoothstep(biomeTundraLo, biomeTundraHi, latJ));
    col = mix(baseColor, landCol, landMask);                        // #775 해안선 전이 유지 (ocean = baseColor 불변)
    // 극관 — continents 무관 (§A3.3 결정 4 B: 북극 해빙 + 남극 빙상 둘 다 흰색), ocean/land 공통
    // 최종 mix. albedo 단계에서만 결정 — 아래 col *= shade 최종 곱 불변 (#773 규약, 밤면 극관은 어둡다).
    float iceMask = smoothstep(iceLatLo, iceLatHi, latJ);
    col = mix(col, iceColor, iceMask);
  } else if (uSurfaceType == 1) {
    // ── desert (화성) — dust/협곡 결 (fbm) + 산화철 톤 ─────────────────────
    float detail = fbm(p * 3.6);
    float mod_ = (detail - 0.5) * 2.0 * desertDetail;
    col = baseColor * (1.0 + mod_);
    // 산화철 톤 — R boost / B 감쇠 (붉은 화성). G 는 보존 (보라/마젠타 회피).
    col.r = clamp(col.r + desertRustTint, 0.0, 1.0);
    col.b = clamp(col.b - desertRustTint * 0.5, 0.0, 1.0);
  } else if (uSurfaceType == 2) {
    // ── gas-bands (목성) — 위도 밴드 + 난류 결 ────────────────────────────
    // local Y 가 위도 축. Amendment 2 (#782): axialTilt 를 mesh rotationQuaternion 으로 적용하므로
    // local Y 가 실제 자전축(pole)과 정렬 → 밴드가 자전축에 직교 (오히려 정확, ADR §재검토 2 해소).
    float latitude = p.y;
    // 난류 — 밴드 경계를 흐트러뜨려 자연스러운 줄무늬 (직선 밴드 회피).
    float turb = (fbm(p * 4.0) - 0.5) * 2.0 * gasTurbulence;
    float bands = sin((latitude + turb) * gasBandCount * 3.14159265);
    float mod_ = bands * gasBandAmplitude;
    col = baseColor * (1.0 + mod_);
  } else if (uSurfaceType == 3) {
    // ── cratered (달) — 크레이터 점 분포 (cell noise) + 명암 ───────────────
    vec3 scaled = p * craterDensity;
    vec3 cell = floor(scaled);
    vec3 frac = fract(scaled);
    vec3 rnd = hash33(cell);
    // 셀 내 크레이터 중심 무작위화 (격자 패턴 차단).
    vec3 craterPos = rnd;
    float dist = length(frac - craterPos);
    // 크레이터 = 가까운 셀에서 어둡게 (smoothstep falloff). rnd.x 로 크레이터 유무/크기 변조.
    float craterSize = 0.18 + rnd.x * 0.22;
    float crater = (1.0 - smoothstep(0.0, craterSize, dist)) * step(0.35, rnd.x);
    // 저주파 결 (mare/highland 명암) + 크레이터 음영.
    float terrain = (fbm(p * 5.0) - 0.5) * 2.0 * 0.15;
    col = baseColor * (1.0 + terrain) * (1.0 - crater * craterDepth);
  }
  // 미등록 타입 (테이블 미적용) 은 여기 도달하지 않음 (호출부에서 셰이더 자체 미생성).

  // Amendment 1 (#773) §결정 3 — 합성 순서 유지: 절차 변조(대륙/밴드/크레이터) 위에 광원 명암 곱.
  //   밤면에서도 절차 디테일(대륙/밴드 패턴)은 존재하되 어둡다 (#756 고주파 엔트로피는 낮면 기준 유지).
  col *= shade;
  // 안전 clamp — 광원(낮면 휘도 > 1) + 절차 변조 후 색역 이탈 방지 (디자인 루브릭 — 보라/마젠타 등
  // 기괴 색역 차단은 baseColor/landColor 가 실측 자연색이라 R/G/B 단조 합성으로 구조적 보장. clamp 는
  // [0,1] 범위만 보정 — 낮면이 sunIntensity 2.5 로 1.0 초과해도 흰색으로 saturate, 단색 행성과 동일).
  col = clamp(col, 0.0, 1.0);

  gl_FragColor = vec4(col, 1.0);

  // #756 §핵심 위험 1 — 본체(StandardMaterial useLogarithmicDepth)와 동일한 로그 depth 공간 기록.
  ${LOG_DEPTH_FRAGMENT_WRITE_GLSL}
}
`;

let shaderRegistered = false;

/**
 * GLSL shader 를 Babylon `Effect.ShadersStore` 에 1회 등록 (ring/starfield 패턴 답습).
 * 같은 씬에서 모든 표면 body 가 단일 셰이더 공유 (ShadersStore 1회, 컴파일 1회).
 */
function registerProceduralPlanetShader(): void {
  if (shaderRegistered) return;
  Effect.ShadersStore[`${SHADER_NAME}VertexShader`] = VERTEX_SHADER;
  Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = FRAGMENT_SHADER;
  shaderRegistered = true;
}

/**
 * Amendment 1 (#773) — 광원 물리 상수 (PointLight + HemisphericLight 재현용).
 *
 * scene (`solar-system-scene.ts`) 가 이 값들의 SSoT 다 (PointLight/HemisphericLight 와 동일 값).
 * 셰이더는 scene 를 import 하지 않고 (순환 회피) 이 묶음을 주입받아 uniform 으로 설정한다
 * (단방향 의존 — volt #69 마법 숫자 중복 금지). 모든 값은 rendering-only (데이터 SSoT 무관).
 */
export interface PlanetLightingConstants {
  /** PointLight intensity (= sunLight.intensity, 2.5). */
  sunIntensity: number;
  /** PointLight diffuse RGB (= sunLight.diffuse, (1, 0.95, 0.8)). */
  sunDiffuse: readonly [number, number, number];
  /** HemisphericLight intensity (= AMBIENT_INTENSITY, 0.3). */
  ambientIntensity: number;
  /** HemisphericLight groundColor RGB (= AMBIENT_GROUND_COLOR_RGB). */
  ambientGround: readonly [number, number, number];
  /** HemisphericLight diffuse(sky) RGB (Babylon 기본 (1,1,1) 흰색). */
  ambientSky: readonly [number, number, number];
  /** HemisphericLight direction(up) (= (0,1,0)). */
  ambientUp: readonly [number, number, number];
}

export interface CreateProceduralPlanetMaterialOptions {
  /**
   * ADR §결정 3 — detailLevel uniform 차등 훅 (예약). high/mid 모두 full (1.0) 고정.
   * 후속 fps 측정에서 tier-b 약화가 필요하면 그때 호출부 배선 (1차 YAGNI — starfield gridDensity
   * override 패턴 정합). 현재 셰이더 내부 미사용 — 인터페이스 예약만.
   */
  detailLevel?: number;

  /**
   * Amendment 1 (#773) §A1.3 결정 1 — 태양 월드 위치 provider (scene-unit world).
   *
   * `createSolarSystemScene` 가 매 프레임 `sunLight.position` (Floating Origin shift + tier scale 반영된
   * scene-unit world) 을 갱신하므로, 그 값을 그대로 반환하는 콜백을 넘긴다. onBindObservable 클로저가
   * 각 draw 직전 `normalize(sunPos − meshAbsPos)` 로 `uSunDirection` 을 갱신한다 (scene→core 단방향).
   * 미전달 시 (테스트 등) onBind 미등록 — uSunDirection 은 기본 +X (호출부 setVector3 fallback).
   */
  sunPositionProvider?: () => Vector3;

  /**
   * Amendment 1 (#773) §A1.3 결정 2 — 광원 물리 상수 (scene SSoT 주입). 미전달 시 단색 행성과
   * 불일치하므로 호출부 (scene) 가 반드시 전달. 테스트 등 미전달 시 안전 기본값 (단색 행성 값) 적용.
   */
  lighting?: PlanetLightingConstants;

  /**
   * Amendment 4 (#1119) §A4.3 결정 6 — 마스크 에셋 base URL (예: `'/textures/'`).
   *
   * **미전달(`undefined`) = 마스크 경로 완전 비활성** — `uMaskEnabled` 가 `0` 으로 고정돼 Amendment 3
   * 시점 절차 경로와 픽셀 동일하고, 텍스처 fetch 자체가 발생하지 않는다 (NullEngine 단위 테스트
   * 무회귀). core 라이브러리 보수 기본값이며 **기본 ON 은 web 레이어 결정**이다 (`surfaceDetail` /
   * `starfield` 와 동형 레이어 분리) — core 가 web 라우팅(`/textures/`)을 알면 단방향 의존이 깨진다.
   */
  surfaceMaskBaseUrl?: string | undefined;
}

/** Amendment 1 — lighting 미전달 시 기본값 (단색 행성 PointLight/HemisphericLight 값과 동일 — 일관). */
const DEFAULT_PLANET_LIGHTING: PlanetLightingConstants = {
  sunIntensity: 2.5,
  sunDiffuse: [1, 0.95, 0.8],
  ambientIntensity: 0.3,
  ambientGround: [0.15, 0.15, 0.18],
  ambientSky: [1, 1, 1],
  ambientUp: [0, 1, 0],
};

// ─────────────────────────────────────────────────────────────────────────────
// Amendment 4 (#1119) — 투영 disk 반경 산출 (원거리 LOD 판정, §A4.3 결정 4).
//
// 매 draw 호출되므로 alloc 0 — 아래 버퍼를 모듈 스코프에서 재사용한다 (Amendment 2 의
// tmpSpinQuat 계약 동형, cross-validate 고유 발견 1).
// ─────────────────────────────────────────────────────────────────────────────

/** 카메라 local right (= `Axis.X`). `Axis` 를 import 하지 않는 것은 번들 그래프 최소화 목적. */
const CAMERA_LOCAL_RIGHT = new Vector3(1, 0, 0);
const tmpEdgeWorld = new Vector3();
const tmpProjectedCenter = new Vector3();
const tmpProjectedEdge = new Vector3();
const tmpGlobalViewport = new Viewport(0, 0, 0, 0);
const IDENTITY_MATRIX = Matrix.Identity();

/**
 * mesh 의 화면 투영 disk 반경 (픽셀).
 *
 * **투영 방식**은 `browser-verify-783-earth-detail.mjs` 의 것을 재사용한다 (§A4.4 예측표):
 * world 반경만큼 떨어진 **카메라 right 방향 edge 점**을 화면 투영해 중심과의 거리를 잰다.
 * (bbox 코너 투영은 cube 모서리라 ~1.2× 과대, 픽셀 카운트 기반은 밤면 limb 탈락으로 ~7% 과소 —
 * 둘 다 실측으로 기각된 이력이 있다.)
 *
 * ⚠️ **world 반경 산출은 #1157 에서 교체됐다 — 이력을 남긴다.** 초판은 투영 방식과 함께 `#783` 의
 * `boundingSphere.radiusWorld / √3` 도 베끼고 *"같은 보정 상수"* 라고 적었는데, **그 등가는
 * `#783`·`#1119` 가 전 쿼리 site 에 `rotate=off` 를 강제한다는 전제 위에서만 성립한다.** Babylon 의
 * `radiusWorld` 는 world matrix 로 변환한 bounding box 기준이라 **자전 위상의 함수**이고, 런타임에는
 * 그 전제가 없다 — 그것이 이 결함의 출발점이다.
 *
 * 결함 실측 (#1157 Phase 0 — **수정 전** 트리, 로컬 SWIFTSHADER 1280×720, `?focus=earth`,
 * 카메라 고정 `radius = 329`, 자전 ON, `jumpToJulianDate` 로 1.0 day 를 16 스텝 순회한 **1 run**):
 * 종전 산식의 투영 반경이 `12.886 ~ 18.651 px` 로 진동해 아래 임계 `16` 을 넘나들고 `uMaskEnabled`
 * 가 그 16 스텝에서 **4회** 전이했다. 같은 16 스텝에서 회전 불변 산식은 `11.006 px` 로 전건
 * 불변이었다. ⇒ Amendment 4 가 없애려던 shimmer 를 그 판정 입력이 스스로 만들고 있었다.
 *
 * 그래서 반경은 `resolveMeshVisualRadius` (#790, 회전 불변) 를 쓴다 — 그 함수 주석이 이미 이 함정을
 * *"√3 과대 + #782 자전 위상 진동"* 으로 경고하고 있었고, `#1146` 이 가드 쪽에서 같은 판단으로
 * 채택한 선례가 있다 (`browser-verify-756-surface.mjs:208-209` 주석 실측 — earth 에서
 * `rotate=off` 면 두 산식 비 `1.0000`, 자전 ON 이면 `1.3936`).
 *
 * ⚠️ **부수 결과: 마스크가 켜지는 거리 경계가 이동한다.** 종전에는 부풀려진 값이 `16` 과 비교됐으므로
 * 마스크가 켜지는 **참** 반경 하한이 `16 / ratio` 였다. `ratio` 는 구조적으로 `[1, √3]` 이고
 * (world AABB 가 최대로 부풀어도 그 이상 갈 수 없다) 자전 위상의 함수라, 하한이 `9.24 px` 까지
 * 내려갈 수 있었다. 이후에는 참 반경 `16 px` 이 하한이며 위상과 무관하다. 임계
 * `SURFACE_MASK_MIN_DISK_PX` 자체는 무변경이고 (#1157 계약 명시 비목표), ADR §A4.3 결정 4 의
 * over-resolution 논거가 애초에 **참 disk 반경 R** 기준이라 (`R = 16 px` → 정합 폭 ≈ 100) 이
 * 교체는 그 문면 쪽으로 붙는다.
 *
 * 카메라 부재 (NullEngine 단위 테스트 등) 면 `Infinity` — LOD 규칙이 마스크를 **끄지 않는다**
 * (판정 불가를 "작다" 로 오해하면 마스크가 조용히 사라진다).
 */
export function projectedDiskRadiusPx(scene: Scene, mesh: Mesh): number {
  const camera = scene.activeCamera;
  if (!camera) return Number.POSITIVE_INFINITY;
  const engine = scene.getEngine();
  camera.viewport.toGlobalToRef(
    engine.getRenderWidth(),
    engine.getRenderHeight(),
    tmpGlobalViewport,
  );
  const transform = scene.getTransformMatrix();
  const center = mesh.getAbsolutePosition();
  const visualRadius = resolveMeshVisualRadius(mesh);
  camera.getDirectionToRef(CAMERA_LOCAL_RIGHT, tmpEdgeWorld);
  tmpEdgeWorld.scaleInPlace(visualRadius);
  tmpEdgeWorld.addInPlace(center);
  Vector3.ProjectToRef(center, IDENTITY_MATRIX, transform, tmpGlobalViewport, tmpProjectedCenter);
  Vector3.ProjectToRef(
    tmpEdgeWorld,
    IDENTITY_MATRIX,
    transform,
    tmpGlobalViewport,
    tmpProjectedEdge,
  );
  return Math.hypot(
    tmpProjectedEdge.x - tmpProjectedCenter.x,
    tmpProjectedEdge.y - tmpProjectedCenter.y,
  );
}

/**
 * #756 — body 의 절차적 표면 ShaderMaterial 생성 (high/mid 공유).
 *
 * `SURFACE_TYPE_BY_BODY` 테이블에 등록된 body 만 셰이더 머티리얼을 반환한다. 미등록 body 는
 * `null` 반환 → 호출부가 기존 StandardMaterial 경로 유지 (단색, 무회귀).
 *
 * base color 는 `body.colorHint.hex` (실측 색) 를 read-only 로 uniform 전달 (데이터 SSoT 불변,
 * §결정 5). 절차 변조는 그 위에 합성된다.
 *
 * @param scene Babylon 씬
 * @param body 대상 body (colorHint.hex 사용)
 * @param name 머티리얼 이름 (high/mid 구분용)
 * @param options detailLevel 예약 (1차 미사용)
 * @returns ShaderMaterial 또는 null (테이블 미등록 body)
 */
export function createProceduralPlanetMaterial(
  scene: Scene,
  body: LoadedCelestialBody,
  name: string,
  options: CreateProceduralPlanetMaterialOptions = {},
): ShaderMaterial | null {
  const surfaceType = SURFACE_TYPE_BY_BODY[body.id];
  if (surfaceType === undefined) return null;

  registerProceduralPlanetShader();

  const material = new ShaderMaterial(
    name,
    scene,
    { vertex: SHADER_NAME, fragment: SHADER_NAME },
    {
      attributes: ['position', 'normal'],
      uniforms: [
        'worldViewProjection',
        // Amendment 2 (#782) 옵션 e — world matrix auto-bind (vNormal world 변환용, self-rotation 정합).
        'world',
        'baseColor',
        'uSurfaceType',
        'rockyContrast',
        'desertDetail',
        'desertRustTint',
        'gasBandAmplitude',
        'gasBandCount',
        'gasTurbulence',
        'craterDepth',
        'craterDensity',
        'logDepthConstant',
        // Amendment 1 (#773) — 광원 모델 uniform.
        'uSunDirection',
        'sunIntensity',
        'sunDiffuse',
        'ambientIntensity',
        'ambientGround',
        'ambientSky',
        'ambientUp',
        'softTerminatorWidth',
        // Amendment 1 (#775) — 대륙 mix uniform.
        'landColor',
        'landThresholdLo',
        'landThresholdHi',
        // Amendment 3 (#783) — 지구 biome/극관 uniform 블록 (rocky 전용, +10 — vec3 3 + float 7).
        'biomeTropicalColor',
        'biomeTundraColor',
        'iceColor',
        'biomeTemperateLo',
        'biomeTemperateHi',
        'biomeTundraLo',
        'biomeTundraHi',
        'iceLatLo',
        'iceLatHi',
        'biomeLatJitter',
        // Amendment 4 (#1119) — 대륙 마스크 uniform (sampler 는 아래 samplers 배열).
        'uMaskEnabled',
        'maskWarpAmp',
      ],
      // Amendment 4 (#1119) — sampler 명시. Phase 0 게이트는 **명시한 상태에서만** 측정됐고
      // 생략 시 거동은 미측정이다 (이슈 #1119 게이트 코멘트 §잔여 미측정 1) — 추측하지 말고 명시한다.
      samplers: ['uSurfaceMask'],
    },
  );

  // base color (실측 colorHint.hex) — 변조의 기준 (데이터 SSoT, read-only).
  const hex = body.colorHint?.hex ?? '#888888';
  const c = hexToColor3(hex);
  material.setColor3('baseColor', c);
  material.setInt('uSurfaceType', surfaceType);

  // 변조 강도 미학 상수 SSoT 전달.
  material.setFloat('rockyContrast', ROCKY_CONTRAST);
  material.setFloat('desertDetail', DESERT_DETAIL);
  material.setFloat('desertRustTint', DESERT_RUST_TINT);
  material.setFloat('gasBandAmplitude', GAS_BAND_AMPLITUDE);
  material.setFloat('gasBandCount', GAS_BAND_COUNT);
  material.setFloat('gasTurbulence', GAS_TURBULENCE);
  material.setFloat('craterDepth', CRATER_DEPTH);
  material.setFloat('craterDensity', CRATER_DENSITY);

  // ADR §결정 3 — detailLevel 예약 (1차 미사용, 셰이더 uniform 미선언이라 setFloat 생략).
  // options.detailLevel 은 인터페이스 예약 — 후속 활성화 시 uniform 추가 + 셰이더 배선.
  void options.detailLevel;

  // Amendment 1 (#773) — 광원 물리 상수 uniform (scene SSoT 주입, 단색 행성 PointLight/Hemispheric 일치).
  const lighting = options.lighting ?? DEFAULT_PLANET_LIGHTING;
  material.setFloat('sunIntensity', lighting.sunIntensity);
  material.setColor3('sunDiffuse', new Color3(...lighting.sunDiffuse));
  material.setFloat('ambientIntensity', lighting.ambientIntensity);
  material.setColor3('ambientGround', new Color3(...lighting.ambientGround));
  material.setColor3('ambientSky', new Color3(...lighting.ambientSky));
  material.setVector3('ambientUp', new Vector3(...lighting.ambientUp));
  material.setFloat('softTerminatorWidth', SOFT_TERMINATOR_WIDTH);

  // Amendment 1 (#775) — 대륙 mix 미학 상수 uniform (rendering-only).
  // ⚠️ Amendment 3 (#783): landColor 는 temperate(중위도 황토·갈색) 밴드 색으로 사용된다
  // (의미 재문서화 — 상수 선언부와 본 바인딩 계층 양쪽 주석 가드, cross-validate Q3 합의).
  material.setColor3('landColor', new Color3(LAND_COLOR_RGB.r, LAND_COLOR_RGB.g, LAND_COLOR_RGB.b));
  material.setFloat('landThresholdLo', LAND_THRESHOLD_LO);
  material.setFloat('landThresholdHi', LAND_THRESHOLD_HI);

  // Amendment 3 (#783) — 지구 biome/극관 미학 상수 uniform 블록 (rocky 전용, rendering-only —
  // biome 상수 블록 그룹화, cross-validate 부분 수용 6). 4중 SSoT: 상수 → uniforms 배열 →
  // 본 바인딩 → GLSL 선언 (+ JS 미러 동기 — 한쪽 수정 시 전부 동기화 의무, 테스트 가드).
  material.setColor3(
    'biomeTropicalColor',
    new Color3(BIOME_TROPICAL_RGB.r, BIOME_TROPICAL_RGB.g, BIOME_TROPICAL_RGB.b),
  );
  material.setColor3(
    'biomeTundraColor',
    new Color3(BIOME_TUNDRA_RGB.r, BIOME_TUNDRA_RGB.g, BIOME_TUNDRA_RGB.b),
  );
  material.setColor3('iceColor', new Color3(ICE_COLOR_RGB.r, ICE_COLOR_RGB.g, ICE_COLOR_RGB.b));
  material.setFloat('biomeTemperateLo', BIOME_TEMPERATE_LO);
  material.setFloat('biomeTemperateHi', BIOME_TEMPERATE_HI);
  material.setFloat('biomeTundraLo', BIOME_TUNDRA_LO);
  material.setFloat('biomeTundraHi', BIOME_TUNDRA_HI);
  material.setFloat('iceLatLo', ICE_LAT_LO);
  material.setFloat('iceLatHi', ICE_LAT_HI);
  material.setFloat('biomeLatJitter', BIOME_LAT_JITTER);

  // Amendment 1 (#773) §A1.3 결정 1 — 태양 방향 uniform.
  //   기본 +X (provider 미전달 시 테스트 fallback). provider 가 있으면 onBind 에서 매 draw 갱신.
  material.setVector3('uSunDirection', new Vector3(1, 0, 0));

  // Amendment 4 (#1119) §A4.3 결정 6·7 — 대륙 마스크 배선.
  //   ① placeholder 를 **먼저** 바인드한다 — 셰이더가 분기 밖에서 무조건 1회 샘플하므로 미도착·
  //      미등록 구간에도 바인딩이 존재해야 한다 (샘플러 공백 = WebGPU 파이프라인 붕괴).
  //   ② uMaskEnabled 는 `0` 에서 출발 → onLoad 성공 + 원거리 LOD 통과 시에만 `1`.
  //      즉 "조용히 예전 지구" 상태는 uniform 값으로 관측 가능하고, verify 스크립트가 FAIL 한다.
  material.setTexture('uSurfaceMask', getOrCreateSurfaceMaskPlaceholder(scene));
  material.setFloat('uMaskEnabled', 0);
  material.setFloat('maskWarpAmp', MASK_WARP_AMP);

  const maskFileName = SURFACE_MASK_BY_BODY[body.id];
  const maskBaseUrl = options.surfaceMaskBaseUrl;
  // 마스크 로드 성공 여부 — onBind 의 LOD 판정이 이 플래그 아래에서만 uMaskEnabled 를 올린다.
  let maskReady = false;
  let materialDisposed = false;
  if (maskFileName !== undefined && maskBaseUrl !== undefined) {
    material.onDisposeObservable.add(() => {
      materialDisposed = true;
    });
    const handle = getOrCreateSurfaceMaskTexture(scene, `${maskBaseUrl}${maskFileName}`);
    handle.onReady((texture) => {
      // 로드가 머티리얼 dispose 이후에 완료될 수 있다 (씬 재생성 레이스) — 그때 setTexture 하면
      // 죽은 effect 에 쓰게 되므로 무시한다.
      if (materialDisposed) return;
      material.setTexture('uSurfaceMask', texture);
      maskReady = true;
    });
  }

  const sunPositionProvider = options.sunPositionProvider;
  if (sunPositionProvider || maskFileName !== undefined) {
    // onBindObservable — 각 draw 직전 mesh 핸들과 함께 호출 (scene 이 material 핸들 별도 추적 불요,
    // 옵션 d Map 대비 우월 — ADR §A1.3 결정 1 c). tmpVector 재사용으로 alloc 0 (cross-validate 이견 2).
    const tmpSunDir = new Vector3();
    // Amendment 2 (#782) reviewer #776 — once-guard: dev 어서션은 최초 1회만 warn (프레임당 mesh당
    // 누적 spam 차단). production 무영향 (NODE_ENV DCE — 아래 분기 전체 tree-shake).
    let warned = false;
    material.onBindObservable.add((mesh) => {
      if (sunPositionProvider) {
        const sunPos = sunPositionProvider();
        // sunDir = normalize(sunPos − meshAbsPos) (world). Amendment 2 옵션 e: vNormal 도 world normal.
        // satellite (달) 도 parent 상속 위치를 getAbsolutePosition 이 정확히 반영 (ADR §A1.3 결정 1).
        const meshPos = (mesh as Mesh).getAbsolutePosition();
        sunPos.subtractToRef(meshPos, tmpSunDir);
        tmpSunDir.normalize();
        material.setVector3('uSunDirection', tmpSunDir);
      }

      // Amendment 4 (#1119) §A4.3 결정 4 — 원거리 축소 LOD. 마스크가 도착한 뒤에만 켜지고,
      // 투영 disk 반경이 임계 미만이면 다시 절차 경로로 되돌린다 (over-resolution shimmer 차단).
      // 결정 7 의 미도착 분기와 **같은 uniform** 을 공유하므로 신규 분기 0.
      if (maskReady) {
        const diskPx = projectedDiskRadiusPx(scene, mesh as Mesh);
        material.setFloat('uMaskEnabled', diskPx >= SURFACE_MASK_MIN_DISK_PX ? 1 : 0);
      }

      // Amendment 2 (#782) §A2.3 결정 6 — dev-only 옵션 e 배선 어서션 (의미 전환: "회전 감지" →
      // "world 배선 누락 / vNormal 오용 감지"). 옵션 e 는 vNormal 을 world matrix 로 변환하는 데
      // 의존하므로, uniforms 배열에 'world' 가 빠지거나 VERTEX 가 vNormal 을 local 로 되돌리면 자전
      // 시 명암이 표면과 함께 돌아버리는 회귀가 생긴다. dev 빌드에서 조기 감지. once-guard (#776) 로
      // 최초 1회만 warn. production 무영향 (NODE_ENV DCE).
      if (process.env.NODE_ENV !== 'production' && !warned) {
        // 배선 검증: (1) 셰이더 소스가 world normal 변환식을 포함 (2) uniforms 에 'world' 존재.
        // Effect uniform 목록은 런타임 조회가 불안정하므로 셰이더 소스 정적 계약으로 확인 (테스트
        // 가드와 동일 계약). 소스에서 옵션 e 배선이 누락되면 즉시 경고.
        const worldNormalWired =
          VERTEX_SHADER.includes('uniform mat4 world') &&
          VERTEX_SHADER.includes('world * vec4(normal');
        if (!worldNormalWired) {
          warned = true;
          console.warn(
            `[procedural-planet-shader] mesh "${(mesh as Mesh).name}" — 옵션 e (world normal) 배선 누락 감지. self-rotation 시 명암이 표면과 함께 회전한다. VERTEX 에 'uniform mat4 world' + 'vNormal = normalize((world * vec4(normal,0)).xyz)' 필요 (ADR §A2.3 결정 2).`,
          );
        }
      }
    });
  }

  // #756 §핵심 위험 1 — 로그 depth 상수 (Babylon logDepth 공식: 2 / log2(maxZ + 1)).
  // maxZ 는 setupArcRotateCamera 가 1e14 로 고정 (ring-shader 와 동일 선례). 카메라 부재
  // (테스트 등) 시 1e14 fallback.
  const maxZ = scene.activeCamera?.maxZ ?? 1e14;
  material.setFloat('logDepthConstant', 2.0 / (Math.log(maxZ + 1.0) / Math.LN2));

  return material;
}

// ─────────────────────────────────────────────────────────────────────────────
// GLSL 절차 변조의 순수 JS 미러 (단위 테스트 SSoT 가드 — #719 교훈 + ADR §교차검증 수용).
//
// GLSL 은 직접 단위 테스트 불가하므로, 변조 식을 JS 로 미러해 결정성 / 보라-마젠타 부재 /
// 변조 강도 상수 SSoT drift 를 가드한다 (starfield starColorMirror 패턴).
// ⚠️ 이 미러 함수들과 FRAGMENT_SHADER 의 GLSL 은 동일 식이어야 한다 (한쪽 수정 시 양쪽 동기화).
// ─────────────────────────────────────────────────────────────────────────────

/** GLSL hash33 의 JS 미러 (sin-free fract-mix). */
function hash33Mirror(px: number, py: number, pz: number): [number, number, number] {
  const fract = (n: number): number => n - Math.floor(n);
  let x = fract(px * 0.1031);
  let y = fract(py * 0.103);
  let z = fract(pz * 0.0973);
  const d = x * (y + 33.33) + y * (x + 33.33) + z * (z + 33.33);
  x += d;
  y += d;
  z += d;
  // GLSL: fract((p.xxy + p.yxx) * p.zyx)
  return [fract((x + y) * z), fract((x + x) * y), fract((y + x) * x)];
}

function hash13Mirror(px: number, py: number, pz: number): number {
  return hash33Mirror(px, py, pz)[0];
}

function valueNoiseMirror(px: number, py: number, pz: number): number {
  const fl = Math.floor;
  const ix = fl(px),
    iy = fl(py),
    iz = fl(pz);
  const fx = px - ix,
    fy = py - iy,
    fz = pz - iz;
  const sm = (f: number): number => f * f * (3 - 2 * f);
  const ux = sm(fx),
    uy = sm(fy),
    uz = sm(fz);
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number): number => hash13Mirror(ix + dx, iy + dy, iz + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), ux), lerp(c(0, 1, 0), c(1, 1, 0), ux), uy),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), ux), lerp(c(0, 1, 1), c(1, 1, 1), ux), uy),
    uz,
  );
}

/**
 * Amendment 4 (#1119) — `surfaceColorMirror` 의 마스크 경로 입력.
 *
 * GLSL 은 텍스처 샘플을 미러할 수 없으므로 **샘플 결과를 값으로 주입**한다 (단위 테스트가
 * `uMaskEnabled` 0/1 두 경로의 색 합성을 결정적으로 검증한다). 미전달 = `uMaskEnabled` 0.
 */
export interface SurfaceMaskMirrorInput {
  /** `uMaskEnabled` — 0 = 절차 경로 (Amendment 3 동일) / 1 = 마스크 경로. */
  enabled: number;
  /** 마스크 texel `.r` ∈ [0,1] (BILINEAR 샘플 결과 — §A4.3 결정 4 채택 샘플링). */
  sample: number;
}

/** GLSL fbm 의 JS 미러 (3-옥타브). */
export function fbmMirror(px: number, py: number, pz: number): number {
  return (
    0.55 * valueNoiseMirror(px, py, pz) +
    0.3 * valueNoiseMirror(px * 2.3, py * 2.3, pz * 2.3) +
    0.15 * valueNoiseMirror(px * 4.7, py * 4.7, pz * 4.7)
  );
}

/**
 * #756 — FRAGMENT_SHADER 의 표면 변조 GLSL 의 **순수 JS 미러** (anti-pattern 계약 검증용).
 *
 * 주어진 구면 좌표 + 표면 타입에 대해 변조된 출력 RGB 를 반환한다 (광원 명암 shade 제외 —
 * 색역 검증은 변조 식만으로 충분, 광원 단조성은 `lightingShadeMirror` 가 별도 검증). GLSL 과
 * 동일 식 — 보라/마젠타 부재 (R+B 동시 우세 & G 결핍 금지) / 출력 [0,1] 범위 / 변조 강도 상수
 * SSoT 를 결정적으로 검증한다. rocky 는 Amendment 1 (#775) 대륙 mix (ocean=base ↔ land=landColor).
 *
 * ⚠️ FRAGMENT_SHADER 의 GLSL 분기와 동일 식이어야 한다 (SSoT — 한쪽 수정 시 양쪽 동기화).
 *
 * @param baseColor 실측 base 색 RGB ∈ [0,1]³
 * @param surfaceType 표면 타입
 * @param p 정규화 구면 좌표 [x,y,z] (단위 벡터 가정)
 * @param mask Amendment 4 (#1119) 마스크 경로 미러 (미전달 = `uMaskEnabled` 0 = Amendment 3 식 그대로)
 * @returns 변조 후 RGB ∈ [0,1]³ (clamp 적용)
 */
export function surfaceColorMirror(
  baseColor: readonly [number, number, number],
  surfaceType: SurfaceType,
  p: readonly [number, number, number],
  mask?: SurfaceMaskMirrorInput,
): readonly [number, number, number] {
  const [bx, by, bz] = baseColor;
  let r = bx,
    g = by,
    b = bz;
  const [px, py, pz] = p;

  if (surfaceType === SurfaceType.Rocky) {
    // Amendment 1 (#775) 대륙↔해양 mix + Amendment 3 (#783) biome 위도 색·극관.
    // GLSL rocky 분기와 동일 식 (§A3.3 결정 3 — 한쪽 수정 시 양쪽 동기화 의무).
    const sm = (e0: number, e1: number, x: number): number => {
      const t = Math.min(Math.max((x - e0) / Math.max(e1 - e0, 1e-6), 0), 1);
      return t * t * (3 - 2 * t);
    };
    const mix = (a: number, b2: number, t: number): number => a + (b2 - a) * t;
    const continents = fbmMirror(px * 2.4, py * 2.4, pz * 2.4);
    // Amendment 4 (#1119) — landMask = mix(절차 mask, 마스크 texel, uMaskEnabled). mask 미전달 시
    // uMaskEnabled = 0 이라 Amendment 3 식과 **부동소수 수준으로 동일**하다 (mix(a,b,0) === a).
    const proceduralMask = sm(LAND_THRESHOLD_LO, LAND_THRESHOLD_HI, continents);
    const maskEnabled = mask?.enabled ?? 0;
    const landMask = mix(proceduralMask, mask?.sample ?? 0, maskEnabled);
    // 위도 파라미터 (sin-space) — 경계 자연화는 기존 continents fbm 재사용 (추가 noise 0).
    const latRaw = Math.abs(py);
    const latJ = latRaw + (continents - 0.5) * BIOME_LAT_JITTER;
    // 대륙색: 적도 녹 → 중위도 황토 (LAND_COLOR_RGB=temperate) → 고위도 툰드라 (2 smoothstep 연쇄).
    const temperateMix = sm(BIOME_TEMPERATE_LO, BIOME_TEMPERATE_HI, latJ);
    const tundraMix = sm(BIOME_TUNDRA_LO, BIOME_TUNDRA_HI, latJ);
    let lr = mix(BIOME_TROPICAL_RGB.r, LAND_COLOR_RGB.r, temperateMix);
    let lg = mix(BIOME_TROPICAL_RGB.g, LAND_COLOR_RGB.g, temperateMix);
    let lb = mix(BIOME_TROPICAL_RGB.b, LAND_COLOR_RGB.b, temperateMix);
    lr = mix(lr, BIOME_TUNDRA_RGB.r, tundraMix);
    lg = mix(lg, BIOME_TUNDRA_RGB.g, tundraMix);
    lb = mix(lb, BIOME_TUNDRA_RGB.b, tundraMix);
    r = mix(bx, lr, landMask);
    g = mix(by, lg, landMask);
    b = mix(bz, lb, landMask);
    // 극관 — continents 무관, ocean/land 공통 최종 mix (§A3.3 결정 4 B).
    const iceMask = sm(ICE_LAT_LO, ICE_LAT_HI, latJ);
    r = mix(r, ICE_COLOR_RGB.r, iceMask);
    g = mix(g, ICE_COLOR_RGB.g, iceMask);
    b = mix(b, ICE_COLOR_RGB.b, iceMask);
  } else if (surfaceType === SurfaceType.Desert) {
    const detail = fbmMirror(px * 3.6, py * 3.6, pz * 3.6);
    const mod = (detail - 0.5) * 2 * DESERT_DETAIL;
    r = bx * (1 + mod);
    g = by * (1 + mod);
    b = bz * (1 + mod);
    r = Math.min(Math.max(r + DESERT_RUST_TINT, 0), 1);
    b = Math.min(Math.max(b - DESERT_RUST_TINT * 0.5, 0), 1);
  } else if (surfaceType === SurfaceType.GasBands) {
    const latitude = py;
    const turb = (fbmMirror(px * 4, py * 4, pz * 4) - 0.5) * 2 * GAS_TURBULENCE;
    const bands = Math.sin((latitude + turb) * GAS_BAND_COUNT * Math.PI);
    const mod = bands * GAS_BAND_AMPLITUDE;
    r = bx * (1 + mod);
    g = by * (1 + mod);
    b = bz * (1 + mod);
  } else if (surfaceType === SurfaceType.Cratered) {
    const fract = (n: number): number => n - Math.floor(n);
    const cellX = Math.floor(px * CRATER_DENSITY),
      cellY = Math.floor(py * CRATER_DENSITY),
      cellZ = Math.floor(pz * CRATER_DENSITY);
    const fracX = fract(px * CRATER_DENSITY),
      fracY = fract(py * CRATER_DENSITY),
      fracZ = fract(pz * CRATER_DENSITY);
    const rnd = hash33Mirror(cellX, cellY, cellZ);
    const dist = Math.hypot(fracX - rnd[0], fracY - rnd[1], fracZ - rnd[2]);
    const craterSize = 0.18 + rnd[0] * 0.22;
    const sm = (e0: number, e1: number, x: number): number => {
      const t = Math.min(Math.max((x - e0) / Math.max(e1 - e0, 1e-6), 0), 1);
      return t * t * (3 - 2 * t);
    };
    const crater = (1 - sm(0, craterSize, dist)) * (rnd[0] >= 0.35 ? 1 : 0);
    const terrain = (fbmMirror(px * 5, py * 5, pz * 5) - 0.5) * 2 * 0.15;
    r = bx * (1 + terrain) * (1 - crater * CRATER_DEPTH);
    g = by * (1 + terrain) * (1 - crater * CRATER_DEPTH);
    b = bz * (1 + terrain) * (1 - crater * CRATER_DEPTH);
  }

  const clamp01 = (n: number): number => Math.min(Math.max(n, 0), 1);
  return [clamp01(r), clamp01(g), clamp01(b)];
}

/**
 * Amendment 1 (#773) — FRAGMENT_SHADER 광원식 (`shade`) 의 순수 JS 미러 (단조성/일관성 검증용).
 *
 * `shade = ambientIntensity * mix(ground, sky, dot(N,up)*0.5+0.5) + sunIntensity * sunDiffuse *
 *  smoothstep(0.0, W, dot(N, sunDir))`. GLSL main() 의 광원 합성과 동일 식 — 밤면 < 낮면 단조,
 * terminator soft 전이, hemispheric 극 그라데이션을 결정적으로 검증한다 (단색 행성 일관성 SSoT).
 *
 * ⚠️ FRAGMENT_SHADER 의 GLSL 광원 합성과 동일 식이어야 한다 (한쪽 수정 시 양쪽 동기화).
 *
 * @param N 표면 법선 (단위 벡터 — Amendment 2 옵션 e 로 **world normal**. VERTEX 가 world matrix 로
 *   변환하므로 미러는 이미 world 좌표계 N 을 인자로 받는다. 미러 식 자체는 불변 — N 이 무슨 좌표계든
 *   dot 정합만 유지하면 되며, 옵션 e 는 N 과 sunDir 을 동일 world 좌표계로 맞춰 자전 무관 명암 보장).
 * @param sunDir 태양 방향 (단위 벡터, world)
 * @param lighting 광원 물리 상수 (scene SSoT — 미전달 시 DEFAULT_PLANET_LIGHTING)
 * @returns 광원 명암 RGB (diffuseColor 곱 전 — 낮면은 1.0 초과 가능, clamp 미적용)
 */
export function lightingShadeMirror(
  N: readonly [number, number, number],
  sunDir: readonly [number, number, number],
  lighting: PlanetLightingConstants = DEFAULT_PLANET_LIGHTING,
): readonly [number, number, number] {
  const dot = (
    a: readonly [number, number, number],
    b: readonly [number, number, number],
  ): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const smoothstep = (e0: number, e1: number, x: number): number => {
    const t = Math.min(Math.max((x - e0) / Math.max(e1 - e0, 1e-6), 0), 1);
    return t * t * (3 - 2 * t);
  };
  // ① HemisphericLight — mix(ground, sky, dot(N,up)*0.5+0.5).
  const hemiFactor = dot(N, lighting.ambientUp) * 0.5 + 0.5;
  const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
  const ambient: [number, number, number] = [
    lighting.ambientIntensity * mix(lighting.ambientGround[0], lighting.ambientSky[0], hemiFactor),
    lighting.ambientIntensity * mix(lighting.ambientGround[1], lighting.ambientSky[1], hemiFactor),
    lighting.ambientIntensity * mix(lighting.ambientGround[2], lighting.ambientSky[2], hemiFactor),
  ];
  // ② PointLight diffuse — sunIntensity * sunDiffuse * smoothstep(0, W, dot(N, sunDir)).
  const sunFactor = smoothstep(0, SOFT_TERMINATOR_WIDTH, dot(N, sunDir));
  return [
    ambient[0] + lighting.sunIntensity * lighting.sunDiffuse[0] * sunFactor,
    ambient[1] + lighting.sunIntensity * lighting.sunDiffuse[1] * sunFactor,
    ambient[2] + lighting.sunIntensity * lighting.sunDiffuse[2] * sunFactor,
  ];
}

/** Rec.709 휘도 (광원식 단조성 검증용 — 밤면 < 낮면 비교 스칼라화). */
export function luminance709(rgb: readonly [number, number, number]): number {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

// ─────────────────────────────────────────────────────────────────────────────
// 테스트/검증용 re-export (procedural-planet-shader.test.ts SSoT 가드 — #69 drift 차단).
// ─────────────────────────────────────────────────────────────────────────────
export {
  // GLSL 소스 (테스트가 switch 부재 / if-else 분기 / log-depth / 변조 식 정적 검증).
  VERTEX_SHADER as PLANET_VERTEX_SHADER,
  FRAGMENT_SHADER as PLANET_FRAGMENT_SHADER,
};
