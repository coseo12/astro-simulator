/**
 * #627 — satellite 궤도선 구조 결함 fix 단위 테스트 (옵션 A — moon 패턴 일반화).
 *
 * ADR `docs/decisions/20260606-627-satellite-orbit-structure-forensic.md` §5 §결정.
 *
 * **회귀 배경**: R5 까지 moon 만 별도 LineSystem (parent 추적 + visual scale) 이었고 phobos/deimos/
 * galilean 은 sun 중심 `orbit-lines` batch 로 처리 → parent 미추적 (position 0,0,0) + visual scale
 * 미적용 → 궤도선이 태양 원점에 잘못 렌더 (forensic 실측 vertex 54% 원점 밀집).
 *
 * **fix**: moon 패턴을 parent 별 `Map<string, LineSystem>` 으로 일반화. 본 테스트는:
 *   1. `isSatelliteOrbit` 분류 정책 SSoT — satellite ↔ planet 분기 (drift 방어)
 *   2. `getOrbitVisualScale` fallback 계약 (agy 보강 ② — 미매핑 parentId 1.0)
 *   3. R-Phase 진입 body (R6=mars/jupiter satellites) 가 satellite 로 정확 분류
 *
 * **테스트 전략**: 실 `createSolarSystemScene` 은 Babylon Engine + physics_wasm `__dirname` 평가라
 * NullEngine 셋업이 무겁고 SSR 회귀 위험 (#613 wasm-safe 패턴). `body-scale-variants.test.ts` 의
 * "diameter 식 helper 재현" + `apply-focus-tier.test.ts` 의 "순수 책임 모방" 패턴 답습 —
 * 분류 정책 (`isSatelliteOrbit`) + visual scale 계약을 순수 함수로 직접 검증한다.
 * 실 LineSystem 위치/scaling 통합 검증은 회귀 가드 `apps/web/scripts/browser-verify-627-satellite-orbit.mjs`
 * 가 담당 (실 Babylon scene 위 worldCenter ±0.2 + 원점 밀집 통계).
 */

import { describe, expect, it } from 'vitest';
import { getSolarSystem } from '../ephemeris/solar-system-loader.js';
import { R_PHASE_BODY_ALLOWLIST } from './r-phase-allowlist.js';
import { isSatelliteOrbit } from './solar-system-scene.js';
import {
  getOrbitVisualScale,
  EARTH_MOON_ORBIT_VISUAL_SCALE,
  MARS_SATELLITES_ORBIT_VISUAL_SCALE,
  JUPITER_SATELLITES_ORBIT_VISUAL_SCALE,
  DEFAULT_ORBIT_VISUAL_SCALE,
} from './orbit-visual-scale.js';

describe('#627 — isSatelliteOrbit 분류 정책 SSoT', () => {
  it('sun (parentId null) → planet batch (false)', () => {
    expect(isSatelliteOrbit(null)).toBe(false);
  });

  it('행성 (parentId "sun") → planet batch (false)', () => {
    expect(isSatelliteOrbit('sun')).toBe(false);
  });

  it('undefined parentId → planet batch (false, 안전 측)', () => {
    expect(isSatelliteOrbit(undefined)).toBe(false);
  });

  it('satellite (parentId earth/mars/jupiter) → satellite 분리 (true)', () => {
    expect(isSatelliteOrbit('earth')).toBe(true);
    expect(isSatelliteOrbit('mars')).toBe(true);
    expect(isSatelliteOrbit('jupiter')).toBe(true);
  });
});

describe('#627 — 실 body 데이터 분류 (R6 시점)', () => {
  const system = getSolarSystem();
  const byId = new Map(system.bodies.map((b) => [b.id, b]));

  it('planet (earth/mars/jupiter) 은 satellite 아님 (sun batch)', () => {
    for (const id of ['earth', 'mars', 'jupiter']) {
      expect(isSatelliteOrbit(byId.get(id)?.parentId)).toBe(false);
    }
  });

  it('moon/phobos/deimos/galilean/titan 은 satellite (parent 별 분리)', () => {
    const satellites: Record<string, string> = {
      moon: 'earth',
      phobos: 'mars',
      deimos: 'mars',
      io: 'jupiter',
      europa: 'jupiter',
      ganymede: 'jupiter',
      callisto: 'jupiter',
      titan: 'saturn', // R7 #641
      titania: 'uranus', // R8 #647
    };
    for (const [satId, expectedParent] of Object.entries(satellites)) {
      const body = byId.get(satId);
      expect(body, `${satId} 미존재`).toBeDefined();
      expect(isSatelliteOrbit(body!.parentId)).toBe(true);
      expect(body!.parentId).toBe(expectedParent);
    }
  });

  it('R-Phase allowlist 의 satellite 들은 정확히 earth/mars/jupiter/saturn/uranus 5 parent 로 그룹화', () => {
    // 본 fix 의 핵심 불변식 — satellite 궤도선이 parent 수만큼의 LineSystem 으로 생성됨.
    const parents = new Set<string>();
    for (const id of R_PHASE_BODY_ALLOWLIST) {
      const body = byId.get(id);
      if (!body || !body.orbit) continue;
      if (isSatelliteOrbit(body.parentId)) parents.add(body.parentId);
    }
    // R8 시점: earth (moon) / mars (phobos, deimos) / jupiter (galilean 4) / saturn (titan #641)
    // / uranus (titania #647).
    expect([...parents].sort()).toEqual(['earth', 'jupiter', 'mars', 'saturn', 'uranus']);
  });
});

describe('#627 — getOrbitVisualScale 계약 (agy 보강 ② fallback)', () => {
  it('매핑된 parent 는 박제값 반환', () => {
    expect(getOrbitVisualScale('earth')).toBe(EARTH_MOON_ORBIT_VISUAL_SCALE);
    expect(getOrbitVisualScale('mars')).toBe(MARS_SATELLITES_ORBIT_VISUAL_SCALE);
    expect(getOrbitVisualScale('jupiter')).toBe(JUPITER_SATELLITES_ORBIT_VISUAL_SCALE);
  });

  it('미매핑 parentId → 1.0 fallback (visual scale 미적용, 실측 그대로)', () => {
    expect(getOrbitVisualScale('neptune')).toBe(DEFAULT_ORBIT_VISUAL_SCALE); // R9 진입 전
    expect(getOrbitVisualScale('unknown-parent')).toBe(DEFAULT_ORBIT_VISUAL_SCALE);
  });

  it('null / undefined parentId → 1.0 fallback (예외 안정성)', () => {
    expect(getOrbitVisualScale(null)).toBe(DEFAULT_ORBIT_VISUAL_SCALE);
    expect(getOrbitVisualScale(undefined)).toBe(DEFAULT_ORBIT_VISUAL_SCALE);
  });

  it('fallback 기본값은 1.0 (실측 좌표 무변형)', () => {
    expect(DEFAULT_ORBIT_VISUAL_SCALE).toBe(1.0);
  });
});
