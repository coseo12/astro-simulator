/**
 * P11-B #289 — LOD body-kind 임계 상수
 *
 * ADR: `docs/decisions/20260424-p11-b-lod-design.md` §축 2
 *
 * body kind → "high LOD 강제 조건" 룩업. 카메라 거리 / body 반경 기준으로 세부 관찰 의도를 판정한다.
 * 12 카테고리 완비 (주석 계약 vs 구현 drift 방어 — CLAUDE.md 교훈).
 *
 * 신규 kind 추가 시 본 상수에 항목 누락하면 `classifyBodyLodKind` 가 unknown kind 를 리턴하고
 * `LOD_BODY_THRESHOLDS[kind]` 가 undefined → `lod.test.ts` 의 enum 완비 assert 에서 즉시 fail.
 */

import { AU } from '@astro-simulator/shared';

/**
 * LOD 레이어에서 사용하는 body 분류 (12 카테고리).
 *
 * `LoadedCelestialBody.kind` 의 zod enum 11종 + `planet` 의 질량 파생 분류 (giant / terrestrial) 로
 * 구성. zod enum 을 직접 바꾸면 solar-system.json 전체 재작성 + P2 이후 회귀가 발생하므로,
 * LOD 레이어에서만 파생 분류를 수행한다.
 */
export type BodyLodKind =
  | 'star'
  | 'planet-giant'
  | 'planet-terrestrial'
  | 'moon'
  | 'dwarf-planet'
  | 'comet'
  | 'asteroid'
  | 'spacecraft'
  | 'black-hole'
  | 'nebula'
  | 'galaxy'
  | 'star-cluster';

/**
 * LOD 임계 분기 모드 3종.
 *
 *  - `absolute-distance`: 카메라-body 실세계 거리 (m) 가 `highMaxDistanceMeters` 미만이면 high 강제
 *  - `radius-multiple`: 카메라-body 거리가 `highMaxRadiusFactor × body.radius` 미만이면 high 강제
 *  - `always-high`: 거리 무관 항상 high (전용 shader 경로 — 블랙홀/은하/성운 등)
 */
export type BodyLodThresholdMode = 'absolute-distance' | 'radius-multiple' | 'always-high';

export type BodyLodThreshold =
  | { mode: 'absolute-distance'; highMaxDistanceMeters: number }
  | { mode: 'radius-multiple'; highMaxRadiusFactor: number }
  | { mode: 'always-high' };

/**
 * body kind 별 high LOD 강제 규칙.
 *
 * ADR `docs/decisions/20260424-p11-b-lod-design.md` §축 2 표의 근거와 수치 일치.
 *
 *  - star (태양): < 1 AU — corona/flare 세부 표현은 1 AU 내에서만 인식 가능
 *  - planet-giant: < 10 × R_body — 고리/대적점/벨트 패턴은 반경 10배 내 시각 감지
 *  - planet-terrestrial: < 5 × R_body — 대륙/극관 디테일은 반경 5배 내
 *  - moon / dwarf-planet: < 5 × R_body — 갈릴레이 위성 / 명왕성 focus 의도
 *  - comet: < 3 × R_body — 혜성 본체는 작음 (dust tail 은 별도 파티클)
 *  - asteroid / spacecraft: < 0.01 AU (150만 km) — radius 가 너무 작아 radius 배수는 수 m 이하로 제한됨
 *  - black-hole / nebula / galaxy / star-cluster: 전용 shader 경로 유지 (always-high)
 */
export const LOD_BODY_THRESHOLDS: Record<BodyLodKind, BodyLodThreshold> = {
  star: { mode: 'absolute-distance', highMaxDistanceMeters: AU },
  'planet-giant': { mode: 'radius-multiple', highMaxRadiusFactor: 10 },
  'planet-terrestrial': { mode: 'radius-multiple', highMaxRadiusFactor: 5 },
  moon: { mode: 'radius-multiple', highMaxRadiusFactor: 5 },
  'dwarf-planet': { mode: 'radius-multiple', highMaxRadiusFactor: 5 },
  comet: { mode: 'radius-multiple', highMaxRadiusFactor: 3 },
  asteroid: { mode: 'absolute-distance', highMaxDistanceMeters: 0.01 * AU },
  spacecraft: { mode: 'absolute-distance', highMaxDistanceMeters: 0.01 * AU },
  'black-hole': { mode: 'always-high' },
  nebula: { mode: 'always-high' },
  galaxy: { mode: 'always-high' },
  'star-cluster': { mode: 'always-high' },
};

/**
 * planet-giant 파생 분류 경계 (kg).
 *
 * 가스 거인 최소 질량 기준 — 천왕성 8.68e25 kg, 해왕성 1.02e26 kg, 토성 5.68e26 kg, 목성 1.90e27 kg.
 * 지구형 최대 질량 — 지구 5.97e24 kg. 경계 5e25 kg 은 천왕성 이하의 지구형 외행성 전체를 giant 에서 분리.
 */
const PLANET_GIANT_MASS_THRESHOLD_KG = 5e25;

/**
 * LoadedCelestialBody → BodyLodKind 분류기.
 *
 * `planet` kind 만 질량 기반 파생 분류 (giant / terrestrial). 나머지는 kind 그대로 매핑.
 * 미지 kind 는 `null` 반환 — 호출자 (`lod.ts`) 가 `console.warn` + low fallback 처리.
 *
 * ADR §축 2 주석: "body.kind 의 zod enum 을 바꾸면 solar-system.json 전체 재작성 + P2 이후 회귀 —
 * 범위 밖. 대신 body.mass 기반 파생 분류 만 LOD 레이어에서 수행".
 */
export function classifyBodyLodKind(body: { kind: string; mass: number }): BodyLodKind | null {
  switch (body.kind) {
    case 'star':
      return 'star';
    case 'planet':
      return body.mass >= PLANET_GIANT_MASS_THRESHOLD_KG ? 'planet-giant' : 'planet-terrestrial';
    case 'moon':
      return 'moon';
    case 'dwarf-planet':
      return 'dwarf-planet';
    case 'comet':
      return 'comet';
    case 'asteroid':
      return 'asteroid';
    case 'spacecraft':
      return 'spacecraft';
    case 'black-hole':
      return 'black-hole';
    case 'nebula':
      return 'nebula';
    case 'galaxy':
      return 'galaxy';
    case 'star-cluster':
      return 'star-cluster';
    default:
      return null;
  }
}
