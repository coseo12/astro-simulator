/**
 * #998 축 C — 소행성대 **초기 배치 스케일 주입 계약** 회귀 가드.
 *
 * ## 배경
 *
 * `asteroid-belt.ts` 는 P12-A #298 B1 에서 *"호출자가 `sceneUnitPerMeter` 를 주입한다"* 를 모듈
 * 계약으로 선언했으나, **자기 init 의 `updateAt(epoch, 1 / AU)` 에서 자기 계약을 위반**하고 있었다.
 * `1 / AU` 는 `renderScaleForTier('solar')` 의 근사값이 아니라 **12.566배** 작은 값이라
 * (`8.4e-11 ÷ 6.6846e-12`), 프레임 `updateAt` 덮어쓰기 경로가 끊기면 벨트 반경이 그대로 1/12.566 로
 * 뭉친 채 화면에 나가고 자가 교정 경로가 없어 증상이 **영구**였다.
 *
 * #998 축 C 는 `AsteroidBeltOptions.sceneUnitPerMeter` **필수 필드**를 신설해 생성 시점 주입을
 * 컴파일 시점에 강제한다. 본 테스트는 그 계약을 **런타임 실측**으로 고정한다.
 *
 * ## 왜 정적 grep 가드가 아니라 런타임 가드인가
 *
 * `1 / AU` 재도입을 소스 텍스트 grep 으로 막으면 주석 경계 판정이 필요해지고 (`.claude/agents/reviewer.md`
 * §절차 4 (Comment-Only) — `grep -vE` 단독 판정 금지), 본 파일 자신의 설명 산문도 걸린다. 대신
 * **초기 배치 좌표를 실제로 읽어** 주입값과 대조하면 재도입이 **행동으로** 드러난다 (텍스트 우회 불가).
 * 유일한 정적 가드는 "tier 를 import 하지 않는다"(모듈 경계) 하나로 좁힌다.
 *
 * ## `1 / AU` 리터럴 사용에 대하여
 *
 * 본 파일 아래쪽의 `LEGACY_HARDCODED_SCENE_UNIT_PER_METER = 1 / AU` 는 **역참조 회귀 가드**다
 * (§절차 4 4항 3계급 — `verify-claudemd-size.mjs` 가 구 임계 35,000 을 의도적으로 보유하는 것과 동형).
 * 정정 대상이 아니며, 제거하면 12.566배 회귀를 감지할 기준선이 사라진다.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NullEngine, Scene } from '@babylonjs/core';
import { AU, GRAVITATIONAL_CONSTANT, SOLAR_MASS } from '@astro-simulator/shared';
import {
  createAsteroidBelt,
  type AsteroidBeltHandles,
  type AsteroidBeltOptions,
} from './asteroid-belt.js';
import { positionAt } from '../physics/kepler.js';
import { initialTier, renderScaleForTier } from './tier.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BELT_SOURCE = readFileSync(join(__dirname, 'asteroid-belt.ts'), 'utf8');

/** #998 축 C 이전 하드코딩값. **역참조 회귀 가드 전용** — 재도입 감지 기준선 (위 머리말 참조). */
const LEGACY_HARDCODED_SCENE_UNIT_PER_METER = 1 / AU;

/** 실측 박제 — `renderScaleForTier('solar') ÷ (1/AU)`. #997 리뷰 BLOCK-C 가 "12.57배" 로 보고한 값. */
const LEGACY_UNDERSCALE_FACTOR = 12.566;

/** 소행성대 분포 상한/하한 (`asteroid-belt.ts` 의 `MAIN_BELT_*_AU` / `MAX_ECCENTRICITY` SSoT). */
const BELT_INNER_AU = 2.2;
const BELT_OUTER_AU = 3.2;
const BELT_MAX_ECCENTRICITY = 0.2;

const EPOCH_J2000 = 2_451_545.0;
const SEED = 42;
const N = 200;

/**
 * ⚠️ Babylon 9.19.0 실측 함정 — `Mesh.thinInstanceGetWorldMatrices()` 는 `_thinInstanceDataStorage.worldMatrices`
 * 를 **캐시**하고 `thinInstanceBufferUpdated('matrix')` 로는 무효화되지 않는다 (`thinInstanceMesh.pure.js`
 * L362-373 / L242 — 무효화는 `thinInstanceSetBuffer` 재호출 경로에만 있다). 즉 **한 mesh 에서 두 번
 * 읽으면 두 번째가 첫 스냅샷**이다. 그래서 본 파일의 모든 헬퍼는 **mesh 당 정확히 1회만** 읽는다
 * — 프레임 경로 검증도 belt 를 새로 만들어 비교한다. `getVerticesData('world0')` 는 thin instance
 * matrix 가 geometry vertex data 가 아니라 `null` 을 돌려줘 대체 경로가 되지 못한다 (실측).
 */
function readTranslationsOnce(mesh: AsteroidBeltHandles['mesh']): [number, number, number][] {
  return mesh
    .thinInstanceGetWorldMatrices()
    .map((m): [number, number, number] => [m.m[12] ?? NaN, m.m[13] ?? NaN, m.m[14] ?? NaN]);
}

interface Probe {
  radii: number[];
  translations: [number, number, number][];
  dispose: () => void;
}

/**
 * NullEngine 위에 벨트를 생성하고 ThinInstance translation 을 **1회** 읽어온다.
 * `mutate` 가 주어지면 읽기 **전에** 프레임 경로를 1회 태운다 (updateAt / writeWorldPositions).
 */
function probeBelt(
  sceneUnitPerMeter: number,
  n = N,
  mutate?: (belt: AsteroidBeltHandles) => void,
): Probe {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const belt = createAsteroidBelt(scene, {
    n,
    seed: SEED,
    epoch: EPOCH_J2000,
    sceneUnitPerMeter,
  });
  mutate?.(belt);
  const translations = readTranslationsOnce(belt.mesh);
  const radii = translations.map(([x, y, z]) => Math.hypot(x, y, z));
  return {
    radii,
    translations,
    dispose: () => {
      belt.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}

describe('#998 축 C — 생성 시점 sceneUnitPerMeter 주입 계약', () => {
  it('무효 스케일(0 / NaN / 음수) 주입은 fail-fast — 무음 통과 금지', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    // 본 이슈의 결함 양태가 "잘못된 값의 무음 통과" 였으므로 값 검증도 계약이다.
    for (const bad of [0, Number.NaN, -1e-11, Number.POSITIVE_INFINITY]) {
      expect(() => createAsteroidBelt(scene, { n: 1, sceneUnitPerMeter: bad })).toThrow(
        /sceneUnitPerMeter must be a positive finite number/,
      );
    }
    scene.dispose();
    engine.dispose();
  });

  it('초기 ThinInstance 좌표 = Kepler 위치(m) × 주입 스케일 (per-instance 실측)', () => {
    const scale = renderScaleForTier('solar');
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const belt = createAsteroidBelt(scene, {
      n: 32,
      seed: SEED,
      epoch: EPOCH_J2000,
      sceneUnitPerMeter: scale,
    });

    const mu = GRAVITATIONAL_CONSTANT * SOLAR_MASS;
    const matrices = belt.mesh.thinInstanceGetWorldMatrices();
    expect(matrices).toHaveLength(32);

    for (let i = 0; i < 32; i += 1) {
      const expected = positionAt(belt.elements[i]!, EPOCH_J2000, mu);
      const m = matrices[i]!.m;
      // Float32 버퍼라 상대오차 ~1.2e-7. scene 값이 ~30 이므로 절대 tolerance 1e-3 이면 충분히 tight
      // (12.566배 회귀는 물론, 1% drift 도 잡는다).
      expect(m[12]).toBeCloseTo(expected[0] * scale, 3);
      expect(m[13]).toBeCloseTo(expected[1] * scale, 3);
      expect(m[14]).toBeCloseTo(expected[2] * scale, 3);
    }

    belt.dispose();
    scene.dispose();
    engine.dispose();
  });

  it('초기 프레임 스케일이 renderScaleForTier(initialTier()) 와 일치 — 정답 대역 실측', () => {
    // 씬 배선 재현: `solar-system-scene.ts` 는 `renderScaleForTier(activeTier)` 를 주입하고
    // `activeTier` 초기값은 `initialTier()` (= 'solar') 다.
    const scale = renderScaleForTier(initialTier());
    expect(scale).toBe(renderScaleForTier('solar'));

    const probe = probeBelt(scale);
    const min = Math.min(...probe.radii);
    const max = Math.max(...probe.radii);

    // 궤도 반경 대역 (a ∈ [2.2, 3.2] AU, e < 0.2 → r ∈ [a(1−e), a(1+e)]).
    const lower = BELT_INNER_AU * (1 - BELT_MAX_ECCENTRICITY) * AU * scale;
    const upper = BELT_OUTER_AU * (1 + BELT_MAX_ECCENTRICITY) * AU * scale;
    expect(min).toBeGreaterThanOrEqual(lower);
    expect(max).toBeLessThanOrEqual(upper);

    // 실측 박제 (2026-08-10, n=200 seed=42): minR ≈ 27.65 / maxR ≈ 40.21 scene unit.
    // 회귀 시 아래가 1.90 / 3.59 로 떨어진다 (= 12.566배 축소).
    expect(min).toBeGreaterThan(20);
    expect(max).toBeGreaterThan(30);

    probe.dispose();
  });

  it('역참조 회귀 가드 — 구 하드코딩 1/AU 로 되돌리면 12.566배 축소가 재현된다', () => {
    const solar = probeBelt(renderScaleForTier('solar'));
    const legacy = probeBelt(LEGACY_HARDCODED_SCENE_UNIT_PER_METER);

    expect(renderScaleForTier('solar') / LEGACY_HARDCODED_SCENE_UNIT_PER_METER).toBeCloseTo(
      LEGACY_UNDERSCALE_FACTOR,
      2,
    );

    // 동일 seed → 동일 궤도 → 반경 비가 스케일 비와 일치해야 한다 (per-instance).
    for (let i = 0; i < N; i += 1) {
      expect(solar.radii[i]! / legacy.radii[i]!).toBeCloseTo(LEGACY_UNDERSCALE_FACTOR, 2);
    }

    // 구 값의 결과 대역이 수성 궤도(0.39 AU × solar ≈ 4.9 unit) **안쪽**으로 뭉친다는 실측.
    // "1/AU 는 solar 의 근사값" 이라는 오해가 성립할 수 없음을 값으로 고정한다.
    expect(Math.max(...legacy.radii)).toBeLessThan(0.39 * AU * renderScaleForTier('solar'));

    solar.dispose();
    legacy.dispose();
  });

  it('프레임 덮어쓰기 경로 무회귀 — updateAt 이 주입 스케일로 초기 배치를 덮어쓴다', () => {
    const initial = renderScaleForTier('solar');
    const next = renderScaleForTier('inner');

    // 생성만 (initial) vs 생성 후 tier 전환 재주입 (initial → updateAt(next)).
    const atCreate = probeBelt(initial, 8);
    const afterUpdate = probeBelt(initial, 8, (b) => b.updateAt(EPOCH_J2000, next));

    for (let i = 0; i < 8; i += 1) {
      expect(afterUpdate.radii[i]! / atCreate.radii[i]!).toBeCloseTo(next / initial, 4);
    }

    atCreate.dispose();
    afterUpdate.dispose();
  });

  it('프레임 덮어쓰기 경로 무회귀 — writeWorldPositions (N-body 분기) 가 주입 스케일을 적용', () => {
    const next = renderScaleForTier('inner');
    // flat positions(m, heliocentric) × 주입 스케일. offset=0, count=2.
    const positions = new Float64Array([1 * AU, 0, 0, 0, 2 * AU, 0]);
    const probe = probeBelt(renderScaleForTier('solar'), 4, (b) =>
      b.writeWorldPositions(positions, 0, 2, next),
    );

    expect(probe.translations[0]![0]).toBeCloseTo(1 * AU * next, 3);
    expect(probe.translations[1]![1]).toBeCloseTo(2 * AU * next, 3);

    probe.dispose();
  });

  it('타입 계약 — sceneUnitPerMeter 누락은 컴파일 실패 (구조적 강제)', () => {
    // `@ts-expect-error` 가 **불필요해지면** (= 필드가 다시 optional 이 되면) `tsc --noEmit` 이 실패한다.
    // 즉 본 단언은 런타임이 아니라 typecheck 단계에서 계약을 지킨다.
    // @ts-expect-error — sceneUnitPerMeter 는 필수 필드다.
    const missing: AsteroidBeltOptions = { n: 1, seed: SEED };
    expect(missing.n).toBe(1);

    const complete: AsteroidBeltOptions = { n: 1, sceneUnitPerMeter: renderScaleForTier('solar') };
    expect(complete.sceneUnitPerMeter).toBeGreaterThan(0);
  });

  it('모듈 경계 — asteroid-belt.ts 는 tier 를 import 하지 않는다 (tier-agnostic 계약)', () => {
    // #998 5항 원안 (`renderScaleForTier('solar')` 직접 호출) 기각의 회귀 가드.
    // 채택 시 하드코딩 대상이 `1 / AU` → tier 리터럴 `'solar'` 로 옮겨갈 뿐 계약이 되돌아간다.
    const importLines = BELT_SOURCE.split('\n').filter((l) => /^\s*import\s/.test(l));
    expect(importLines.some((l) => l.includes('tier'))).toBe(false);
    // from '...' 절이 여러 줄로 갈리는 경우까지 커버 (`} from './tier.js'`).
    expect(/from\s+'\.\/tier\.js'/.test(BELT_SOURCE)).toBe(false);
  });
});
