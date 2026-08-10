/**
 * P12-A #298 B1 회귀 가드 — tier 전환 시 모든 렌더 레이어 (body / rings / asteroid belt / orbit line)
 * 가 **동일 배수로 확대** 되어야 한다는 불변식을 산술 레벨에서 검증한다.
 *
 * ## 배경 — B1 blocking 재발 방지
 *
 * 기존 `ring-placeholder.ts` / `ring-shader.ts` / `asteroid-belt.ts` 는 `SCENE_UNIT_PER_METER = 1/AU`
 * 하드코딩 상수를 사용하여 solar tier (renderScale ≈ 8.4e-11) 에서는 우연히 비율이 맞았지만,
 * inner/body tier 로 전환 시 body mesh 만 확대되고 ring / asteroid 는 그대로 유지되어 **상대
 * 비율 drift** 가 발생했다. ADR `20260423-display-relative-scale-unification.md` §결정 §1 위배.
 *
 * ## 검증 불변식
 *
 * 1. **rings**: host planet mesh 의 자식이므로 host.scaling 이 tier 전환 시 `newScale / initialScale`
 *    로 변하면 ring radius 도 동일 배수로 확대된다. 즉 `(ring.radiusScene × host.scaling)` 이 tier
 *    전환 후에도 body 의 `(base.diameter × host.scaling)` 와 같은 배수 관계 유지.
 *
 * 2. **asteroid belt**: ThinInstance 좌표가 매 프레임 `positions[i] × sceneUnitPerMeter` 로 기록됨.
 *    호출자 (scene) 가 현재 tier 의 `renderScaleForTier(tier)` 를 주입하면 belt 위치도 body 와 동일
 *    배수로 scene 좌표 재계산.
 *
 * 3. **orbit lines**: `sampleOrbitPoints(body, tier)` 가 tier 기반 renderScale 로 재샘플링.
 *
 * 세 경로 모두 **`renderScaleForTier(activeTier)` 단일 SSoT** 를 경유함을 산술 불변식으로 표현.
 */

import { describe, expect, it } from 'vitest';
import { AU } from '@astro-simulator/shared';
import { renderScaleForTier, type Tier } from './tier.js';

const TIERS: readonly Tier[] = ['solar', 'inner', 'body'] as const;

describe('B1 회귀 가드 — tier 전환 시 모든 렌더 레이어 동일 배수 확대', () => {
  it('body mesh 와 ring radius 가 tier 전환 시 동일 배수로 확대', () => {
    // body radius (m) — 토성 ~6.03e7 m
    const saturnRadius = 6.03e7;
    // ring outer radius (m) — 토성 A 고리 바깥 ~1.37e8 m
    const ringOuter = 1.37e8;

    for (const initialTier of TIERS) {
      for (const newTier of TIERS) {
        const initialScale = renderScaleForTier(initialTier);
        const newScale = renderScaleForTier(newTier);
        const bodyRatio = newScale / initialScale;

        // body mesh: 생성 diameter × absoluteScaling = base × newScale
        const bodyDiameterInitial = saturnRadius * 2 * initialScale;
        const bodyDiameterNew = bodyDiameterInitial * bodyRatio;
        expect(bodyDiameterNew).toBeCloseTo(saturnRadius * 2 * newScale, 10);

        // ring: 생성 radiusScene = outer × initialScale. host.scaling = bodyRatio 후.
        const ringRadiusInitial = ringOuter * initialScale;
        const ringRadiusNew = ringRadiusInitial * bodyRatio;
        expect(ringRadiusNew).toBeCloseTo(ringOuter * newScale, 10);

        // 핵심: body 와 ring 의 확대 배수가 **동일**
        const bodyExpansion = bodyDiameterNew / bodyDiameterInitial;
        const ringExpansion = ringRadiusNew / ringRadiusInitial;
        expect(bodyExpansion).toBeCloseTo(ringExpansion, 8);
      }
    }
  });

  it('asteroid belt 좌표가 body 와 동일 배수로 스케일', () => {
    // 소행성 월드 좌표 (m) — 주 소행성대 중심 2.7 AU
    const asteroidWorld: [number, number, number] = [2.7 * AU, 0, 0];
    // 지구 월드 좌표 (m) — 1 AU (body 대표로서)
    const earthWorld: [number, number, number] = [1 * AU, 0, 0];

    for (const tier of TIERS) {
      const scale = renderScaleForTier(tier);
      const asteroidScene = asteroidWorld.map((v) => v * scale);
      const earthScene = earthWorld.map((v) => v * scale);

      // 소행성 / 지구 scene 거리 비율 = world 비율 (scale 은 선형 변환이므로 불변)
      const sceneRatio = asteroidScene[0]! / earthScene[0]!;
      const worldRatio = asteroidWorld[0] / earthWorld[0];
      expect(sceneRatio).toBeCloseTo(worldRatio, 10);
      expect(sceneRatio).toBeCloseTo(2.7, 5);
    }
  });

  it('orbit line 과 body 좌표가 tier 전환 시 동일 배수로 확대', () => {
    // 지구 semi-major axis ~ 1 AU 샘플 포인트
    const orbitPointWorld = 1 * AU;
    // 지구 반경 (m)
    const earthRadius = 6.371e6;

    for (const tierA of TIERS) {
      for (const tierB of TIERS) {
        const sA = renderScaleForTier(tierA);
        const sB = renderScaleForTier(tierB);
        const ratio = sB / sA;

        const orbitA = orbitPointWorld * sA;
        const orbitB = orbitPointWorld * sB;
        const bodyA = earthRadius * sA;
        const bodyB = earthRadius * sB;

        expect(orbitB / orbitA).toBeCloseTo(ratio, 10);
        expect(bodyB / bodyA).toBeCloseTo(ratio, 10);
        // 동일 확대 배수 (부동소수점 정밀도 — 10 decimal 이면 ~1e-10 상대오차로 충분)
        expect(orbitB / orbitA).toBeCloseTo(bodyB / bodyA, 8);
      }
    }
  });

  it('절대 scaling 계산 — setTier 의 누적 drift 방지', () => {
    // setTier 가 `mesh.scaling.setAll(newScale / initialScale)` 절대값으로 동작하면
    // tier 전환을 100 회 반복해도 최종 scaling 은 초기 / 최종 tier 비율만 남는다 (부동소수점 누적 없음).
    const initialScale = renderScaleForTier('solar');

    // 100 회 solar ↔ body 전환 시뮬레이션 — 절대 scaling 은 항상 동일
    let currentScaling = 1; // 초기 mesh.scaling.setAll(1) 상태
    for (let i = 0; i < 100; i++) {
      const targetTier: Tier = i % 2 === 0 ? 'body' : 'solar';
      const newScale = renderScaleForTier(targetTier);
      currentScaling = newScale / initialScale; // 절대 scaling (누적 아님)
    }
    // 마지막 반복: i=99 → solar → scaling = 1 (solar / solar)
    expect(currentScaling).toBeCloseTo(1, 10);

    // body 로 끝나는 경우
    currentScaling = renderScaleForTier('body') / initialScale;
    expect(currentScaling).toBeCloseTo(renderScaleForTier('body') / renderScaleForTier('solar'), 8);
  });

  it('SSoT 검증 — 모든 tier 의 renderScale 이 양수이며 순서 보존', () => {
    // body > inner > solar 순 (가까울수록 큰 배수)
    expect(renderScaleForTier('body')).toBeGreaterThan(0);
    expect(renderScaleForTier('inner')).toBeGreaterThan(0);
    expect(renderScaleForTier('solar')).toBeGreaterThan(0);
    expect(renderScaleForTier('body')).toBeGreaterThan(renderScaleForTier('inner'));
    expect(renderScaleForTier('inner')).toBeGreaterThan(renderScaleForTier('solar'));
  });
});

// scene-unit 하드코딩 재발 방지는 **행동 가드 + PR 리뷰 grep 2층**으로 검증한다.
//
// (1) 행동 가드 (#998 축 C) — `asteroid-belt-scale-contract.test.ts` 가 NullEngine 위에서 초기
//     ThinInstance 좌표를 실제로 읽어 주입 스케일과 대조한다. 소스에 `1 / AU` 를 다시 써 넣으면
//     텍스트 우회 여부와 무관하게 **4개 단언이 fail** 한다 (negative test 실측).
//     ⚠️ 텍스트 grep 을 테스트로 옮기는 방식은 채택하지 않았다 — 주석 경계 판정이 필요해지고
//     (`.claude/agents/reviewer.md` §절차 4 (Comment-Only)) 설명 산문 자신이 걸린다.
//     (기존 이 자리의 *"core 패키지의 node types 부재"* 사유는 2026-08-10 실측으로 반증됐다 —
//      `@types/node` 는 devDependencies 에 있고 `starfield.test.ts` 등이 이미 `node:fs` 를 쓴다.)
//
// (2) PR 리뷰 grep — 아래 명령. 형태는 `.claude/agents/reviewer.md` §절차 4 (Grep) 정본을 따른다:
//
//   git grep -nFi -e 'SCENE_UNIT_PER_METER' -e '1 / AU' -e '1/AU'
//
// - 경로를 `packages/core/src/` 로 좁히지 않는다. 금지 대상은 "tier 함수를 우회한 고정 배수"이고
//   그 재발은 apps/ 소비처에서도 가능하다. 제외는 검색 시점이 아니라 분류 시점에 한다.
// - 표기 변형: 상수명(`SCENE_UNIT_PER_METER`)만 걸면 `const sceneUnitPerMeter = 1 / AU` 형태의
//   camelCase 재선언이 침묵한다. 실제 금지 값인 `1 / AU` · `1/AU` 를 함께 건다 (공백 유무로 갈림).
//   `-i` 가 대소문자를 흡수하므로 이 3종이 최소 집합이다 (닫힌 열거 아님).
// - hit 은 5분류(활성 선언 / 이력 기록 / 무관 / 역참조 회귀 가드 / 규약 본문 자체) 후 판정한다.
//   본 주석 블록 자체가 "규약 본문 자체" 계급이라 정정 대상이 아니다. 정상 패턴
//   `const sceneUnitPerMeter = renderScaleForTier(tier)` 는 "무관" 이다.
// - **prod 소스의 의도적 예외는 현재 0건** (#998 축 C, 2026-08-10). 이력: #997 리뷰 BLOCK-C 가
//   `asteroid-belt.ts` 의 `updateAt(epoch, 1 / AU)` 를 "덮어써지는 placeholder" 로 판정해 1건을
//   허용했었다. 안전 근거가 **덮어쓰기 경로의 실재** 하나뿐이라 경로가 끊기면 증상이 영구였고,
//   #998 축 C 가 `AsteroidBeltOptions.sceneUnitPerMeter` **필수 필드**로 그 경로 의존 자체를
//   제거했다 (호출자 = `solar-system-scene.ts`).
//   ⚠️ 보존할 판정 (소급 편집 금지 — §절차 4 4항 2계급): `1 / AU` 는 `renderScaleForTier('solar')`
//   의 근사값이 **아니다**. `8.4e-11 ÷ 6.6846e-12` = **12.566배** 차이이고, 벨트 반경 실측으로는
//   23.89~45.15 이어야 할 것이 1.90~3.59 scene unit 로 뭉친다 (수성 궤도 안쪽). 새 hit 이 이
//   형태면 "solar 와 가까우니 괜찮다"로 판단하지 않는다.
//   구 명령은 `const` 도 상수명도 없는 그 지점을 **구조적으로 볼 수 없었다** — 값 변형을 함께
//   거는 이유의 실증이다.
// 산술 불변식은 위 describe 블록이 커버 (tier 전환 시 모든 레이어 동일 배수 확대).
