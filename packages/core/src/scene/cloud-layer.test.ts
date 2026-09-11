/**
 * #1215 — `cloud-layer.ts` 단위 테스트 (ADR `20260628-756` Amendment 10).
 *
 * 계약:
 *  (A) 상대 자전각 = jd 순수 함수 (`computeSpinAngle`) — 결정성 · mod wrap · 누적 없음 (§A10.8).
 *  (B) `CLOUD_DRIFT_OMEGA > 0` — `0` 이면 「다른 속도」 계약이 공허하게 참이 된다 (§A10.8).
 *  (C) 투명 정렬 키 치환 (§A10.6 결정 4):
 *      (1) 계열 밖 쌍은 Babylon `defaultTransparentSortCompare` 와 부호가 같다
 *      (2) 구름은 거리 잡음을 넣어도 같은 계열의 host · mid · low 보다 항상 뒤
 *      (3) 무작위 스텁 3-조합 전수로 반사성 · 반대칭 · 추이성 (엄격 약순서)
 *  (D) 머티리얼 · 메쉬 계약 (§A10.3 · §A10.4 · §A10.5) — NullEngine.
 *
 * ⚠️ 정렬 함수의 존재 이유는 alpha 기반 LOD fade 기전이다 (§A10.14-7). 여기서는 비교 함수의 형태만
 * 묶고, fade 창에서 구름이 **실제로 복원되는지**는 브라우저 가드 C5 가 잰다.
 */
import { describe, expect, it } from 'vitest';
import {
  MeshBuilder,
  NullEngine,
  Quaternion,
  RenderingGroup,
  Scene,
  Vector3,
  type AbstractMesh,
  type Mesh,
  type SubMesh,
} from '@babylonjs/core';
import { getSolarSystem } from '../ephemeris/solar-system-loader.js';
import { computeSpinAngle } from './self-rotation.js';
import {
  applyCloudDrift,
  CLOUD_SHELL_RADIUS_RATIO,
  CLOUD_SORT_RANK,
  CLOUD_ZONAL_WIND_MS,
  compareTransparentSortKeys,
  computeCloudDriftOmega,
  createCloudLayer,
  createHostFamilyTransparentSortCompare,
  HOST_FAMILY_RANK,
  HostFamilyRegistry,
} from './cloud-layer.js';
import type { SurfaceLightingArgs } from './body-mesh-factory.js';

const TWO_PI = 2 * Math.PI;

/** 결정적 의사난수 (LCG) — 테스트 재현성. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('#1215 (A) computeSpinAngle — 구름 상대 자전각 jd 순수 함수', () => {
  const epoch = 2451545.0;
  const omega = computeCloudDriftOmega({ radius: 6378137 });

  it('같은 (jd, epoch, ω) → 항상 같은 값 (결정성)', () => {
    const jd = 2451626.0;
    expect(computeSpinAngle(jd, epoch, omega)).toBe(computeSpinAngle(jd, epoch, omega));
  });

  it('mod 2π wrap — 큰 (jd − epoch) 에서도 |각| < 2π', () => {
    for (const jd of [epoch + 1e4, epoch + 3.7e5, epoch - 2.2e5]) {
      const a = computeSpinAngle(jd, epoch, omega);
      expect(Math.abs(a)).toBeLessThan(TWO_PI);
    }
  });

  it('식 = ((jd − epoch) × ω) % 2π (float64 뺄셈 먼저)', () => {
    const jd = 2451626.25;
    expect(computeSpinAngle(jd, epoch, omega)).toBe(((jd - epoch) * omega) % TWO_PI);
  });

  it('누적 없음 — 임의 순서 호출 이력과 무관하게 같은 jd 는 같은 값', () => {
    const jds = [2451626.0, 2451700.5, 2451500.25, 2451626.0, 2451999.75];
    const fresh = jds.map((jd) => computeSpinAngle(jd, epoch, omega));
    // 역순 · 반복 호출 후에도 동일.
    for (let k = 0; k < 3; k++) {
      for (const jd of [...jds].reverse()) computeSpinAngle(jd, epoch, omega);
    }
    expect(jds.map((jd) => computeSpinAngle(jd, epoch, omega))).toEqual(fresh);
  });
});

describe('#1215 (B) CLOUD_DRIFT_OMEGA — 상대 각속도', () => {
  const earth = getSolarSystem().bodies.find((b) => b.id === 'earth')!;

  it('풍속 상수가 양수 (출처 인용 값 — 순행)', () => {
    expect(CLOUD_ZONAL_WIND_MS).toBeGreaterThan(0);
  });

  it('earth 데이터로 계산한 CLOUD_DRIFT_OMEGA > 0 (0 이면 차등 계약이 공허)', () => {
    expect(computeCloudDriftOmega(earth)).toBeGreaterThan(0);
  });

  it('= CLOUD_ZONAL_WIND_MS × 86400 / radius[m] (차원 rad/day)', () => {
    expect(computeCloudDriftOmega(earth)).toBe((CLOUD_ZONAL_WIND_MS * 86_400) / earth.radius);
  });
});

// ─── (C) 정렬 스텁 ───────────────────────────────────────────────────────────

interface StubMesh {
  alphaIndex: number;
  getBoundingInfo: () => { boundingSphere: { centerWorld: Vector3 } };
}
interface StubSubMesh {
  getMesh: () => StubMesh;
  _alphaIndex: number;
  _distanceToCamera: number;
}

function stubMesh(center: Vector3, alphaIndex = Number.MAX_VALUE): StubMesh {
  return { alphaIndex, getBoundingInfo: () => ({ boundingSphere: { centerWorld: center } }) };
}

/** Babylon `_RenderSorted` 와 같은 방식으로 submesh 필드를 채운 스텁. */
function stubSub(mesh: StubMesh, camera: Vector3, distanceNoise = 0): StubSubMesh {
  return {
    getMesh: () => mesh,
    _alphaIndex: mesh.alphaIndex,
    _distanceToCamera:
      Vector3.Distance(mesh.getBoundingInfo().boundingSphere.centerWorld, camera) + distanceNoise,
  };
}

const asSub = (s: StubSubMesh): SubMesh => s as unknown as SubMesh;
const asMesh = (m: StubMesh): AbstractMesh => m as unknown as AbstractMesh;

describe('#1215 (C) 투명 정렬 키 치환 — compareTransparentSortKeys', () => {
  it('alphaIndex 오름 → distance 내림 → rank 오름 → 0', () => {
    expect(
      compareTransparentSortKeys(
        { alphaIndex: 1, distance: 5, rank: 0 },
        { alphaIndex: 2, distance: 1, rank: 0 },
      ),
    ).toBe(-1);
    expect(
      compareTransparentSortKeys(
        { alphaIndex: 1, distance: 5, rank: 0 },
        { alphaIndex: 1, distance: 9, rank: 0 },
      ),
    ).toBe(1);
    expect(
      compareTransparentSortKeys(
        { alphaIndex: 1, distance: 5, rank: 1 },
        { alphaIndex: 1, distance: 5, rank: 0 },
      ),
    ).toBe(1);
    expect(
      compareTransparentSortKeys(
        { alphaIndex: 1, distance: 5, rank: 0 },
        { alphaIndex: 1, distance: 5, rank: 0 },
      ),
    ).toBe(0);
  });
});

describe('#1215 (C1) 계열 밖 쌍 = Babylon defaultTransparentSortCompare 와 부호 동일', () => {
  it('무작위 400 쌍 (alphaIndex · 거리 동률 포함)', () => {
    const rng = makeRng(1215);
    const camera = new Vector3(0, 0, 0);
    const compare = createHostFamilyTransparentSortCompare(new HostFamilyRegistry(), () => camera);
    const alphaPool = [0, 3, Number.MAX_VALUE];
    for (let i = 0; i < 400; i++) {
      // 거리 동률을 만들려고 좌표를 작은 격자에서 뽑는다.
      const mk = () =>
        stubSub(
          stubMesh(
            new Vector3(Math.floor(rng() * 4), Math.floor(rng() * 4), 1),
            alphaPool[Math.floor(rng() * alphaPool.length)],
          ),
          camera,
        );
      const a = mk();
      const b = mk();
      const ours = Math.sign(compare(asSub(a), asSub(b)));
      const babylon = Math.sign(RenderingGroup.defaultTransparentSortCompare(asSub(a), asSub(b)));
      expect(ours).toBe(babylon);
    }
  });
});

describe('#1215 (C2) 구름은 거리 잡음을 넣어도 계열 host · mid · low 보다 항상 뒤', () => {
  it('무작위 삽입 순서 × 거리 잡음 × 구름 자체 alphaIndex 무시', () => {
    const rng = makeRng(42);
    const camera = new Vector3(0, 0, -36.8);
    const center = new Vector3(0, 0, 0);
    for (let trial = 0; trial < 200; trial++) {
      const registry = new HostFamilyRegistry();
      const host = stubMesh(center);
      const mid = stubMesh(center);
      const low = stubMesh(center);
      // 구름 자신의 alphaIndex 는 순서에 쓰이지 않아야 한다 (§A10.6 (a)) — 일부러 가장 작게.
      const cloud = stubMesh(center, trial % 2 === 0 ? 0 : Number.MAX_VALUE);
      registry.registerHost(asMesh(host));
      registry.registerMember(asMesh(mid), asMesh(host), HOST_FAMILY_RANK);
      registry.registerMember(asMesh(low), asMesh(host), HOST_FAMILY_RANK);
      registry.registerMember(asMesh(cloud), asMesh(host), CLOUD_SORT_RANK);
      const compare = createHostFamilyTransparentSortCompare(registry, () => camera);

      // 계열 각자의 _distanceToCamera 에 잡음 (구름이 더 가깝게 · 더 멀게 양쪽).
      const noise = () => (rng() - 0.5) * 1e-3;
      const family = [
        stubSub(host, camera, noise()),
        stubSub(mid, camera, noise()),
        stubSub(low, camera, noise()),
      ];
      const cloudSub = stubSub(cloud, camera, noise());
      // 계열 밖 mesh — 지구 앞 / 뒤.
      const others = [
        stubSub(stubMesh(new Vector3(0, 0, -20)), camera),
        stubSub(stubMesh(new Vector3(0, 0, 30)), camera),
      ];
      const list = [...family, cloudSub, ...others];
      // 무작위 셔플 (삽입 순서 의존 제거 확인).
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [list[i], list[j]] = [list[j]!, list[i]!];
      }
      const sorted = list.map(asSub).sort(compare);
      const cloudIdx = sorted.indexOf(asSub(cloudSub));
      for (const f of family) {
        expect(sorted.indexOf(asSub(f))).toBeLessThan(cloudIdx);
      }
      // 계열 블록은 연속이고 구름이 블록 끝 (계열 밖 mesh 가 끼어들지 않는다).
      const blockIdx = [...family, cloudSub].map((s) => sorted.indexOf(asSub(s))).sort();
      expect(blockIdx[blockIdx.length - 1]! - blockIdx[0]!).toBe(3);
    }
  });
});

describe('#1215 (C3) 엄격 약순서 — 무작위 스텁 3-조합 전수', () => {
  it('반사성 · 반대칭 · < 추이성 · 동치 추이성', () => {
    const rng = makeRng(7);
    const camera = new Vector3(0, 0, 0);
    for (let trial = 0; trial < 20; trial++) {
      const registry = new HostFamilyRegistry();
      const center = new Vector3(Math.floor(rng() * 3), 0, 2);
      const host = stubMesh(center, [0, Number.MAX_VALUE][Math.floor(rng() * 2)]);
      registry.registerHost(asMesh(host));
      const mid = stubMesh(center);
      const cloud = stubMesh(center);
      registry.registerMember(asMesh(mid), asMesh(host), HOST_FAMILY_RANK);
      registry.registerMember(asMesh(cloud), asMesh(host), CLOUD_SORT_RANK);
      const compare = createHostFamilyTransparentSortCompare(registry, () => camera);
      const subs: StubSubMesh[] = [
        stubSub(host, camera, (rng() - 0.5) * 1e-6),
        stubSub(mid, camera, (rng() - 0.5) * 1e-6),
        stubSub(cloud, camera, (rng() - 0.5) * 1e-6),
      ];
      // 계열 밖 — 거리를 host 와 동률 · 사이 · 앞뒤로 섞는다 (d_A < d_C < d_B 순환 후보 포함).
      for (let k = 0; k < 6; k++) {
        const c = new Vector3(Math.floor(rng() * 3), 0, 2 + Math.floor(rng() * 2));
        subs.push(stubSub(stubMesh(c, [0, Number.MAX_VALUE][Math.floor(rng() * 2)]), camera));
      }
      const sign = (a: StubSubMesh, b: StubSubMesh) => Math.sign(compare(asSub(a), asSub(b)));
      for (const a of subs) {
        expect(sign(a, a)).toBe(0);
        for (const b of subs) {
          expect(sign(a, b)).toBe(-sign(b, a) || 0);
          for (const c of subs) {
            if (sign(a, b) < 0 && sign(b, c) < 0) expect(sign(a, c)).toBe(-1);
            if (sign(a, b) === 0 && sign(b, c) === 0) expect(sign(a, c)).toBe(0);
          }
        }
      }
    }
  });
});

describe('#1215 (C) HostFamilyRegistry — 식별자 집합', () => {
  it('host 미등록이면 member 등록 무시 (다른 body 의 lazy variant 는 계열 밖)', () => {
    const registry = new HostFamilyRegistry();
    const other = stubMesh(new Vector3());
    const variant = stubMesh(new Vector3());
    expect(registry.registerMember(asMesh(variant), asMesh(other), HOST_FAMILY_RANK)).toBe(false);
    expect(registry.resolve(asMesh(variant))).toBeUndefined();
  });

  it('이름이 같아도 다른 객체면 계열 밖 (이름 문자열 비교 금지)', () => {
    const registry = new HostFamilyRegistry();
    const host = stubMesh(new Vector3());
    registry.registerHost(asMesh(host));
    const lookalike = { ...host };
    expect(registry.resolve(asMesh(lookalike as StubMesh))).toBeUndefined();
    expect(registry.resolve(asMesh(host))?.rank).toBe(HOST_FAMILY_RANK);
  });
});

// ─── (D) NullEngine ─────────────────────────────────────────────────────────

describe('#1215 (D) createCloudLayer — 메쉬 · 머티리얼 계약 (NullEngine)', () => {
  const earth = getSolarSystem().bodies.find((b) => b.id === 'earth')!;

  function setup(sunPos: Vector3) {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const host = MeshBuilder.CreateSphere('earth', { diameter: 2 }, scene);
    const args: SurfaceLightingArgs = {
      lighting: {
        sunIntensity: 2.5,
        sunDiffuse: [1, 0.95, 0.8],
        ambientIntensity: 0.3,
        ambientGround: [0.1, 0.1, 0.1],
        ambientSky: [1, 1, 1],
        ambientUp: [0, 1, 0],
      },
      sunPositionProvider: () => sunPos,
    };
    const layer = createCloudLayer(scene, earth, host, 'body', () => 1, args);
    return { engine, scene, host, layer };
  }

  it('host 자식 · local 원점 · 반경비 scaling · identity 회전 · pick 비간섭', () => {
    const { engine, host, layer } = setup(new Vector3(100, 0, 0));
    expect(layer.mesh.name).toBe('earth-cloud');
    expect(layer.mesh.parent).toBe(host);
    expect(layer.mesh.position.equals(Vector3.Zero())).toBe(true);
    expect(layer.mesh.scaling.x).toBe(CLOUD_SHELL_RADIUS_RATIO);
    expect(layer.mesh.scaling.y).toBe(CLOUD_SHELL_RADIUS_RATIO);
    expect(layer.mesh.scaling.z).toBe(CLOUD_SHELL_RADIUS_RATIO);
    expect(layer.mesh.rotationQuaternion?.equals(Quaternion.Identity())).toBe(true);
    expect(layer.mesh.isPickable).toBe(false);
    engine.dispose();
  });

  it('구름에 alphaIndex 를 부여하지 않는다 (Babylon 기본값 유지 — §A10.6 (a))', () => {
    const { engine, layer } = setup(new Vector3(100, 0, 0));
    expect(layer.mesh.alphaIndex).toBe(Number.MAX_VALUE);
    engine.dispose();
  });

  it('ALPHABLEND · backFaceCulling true · disableDepthWrite true · forceDepthWrite false', () => {
    const { engine, layer } = setup(new Vector3(100, 0, 0));
    expect(layer.material.needAlphaBlending()).toBe(true);
    expect(layer.material.alphaMode).toBe(2);
    expect(layer.material.backFaceCulling).toBe(true);
    expect(layer.material.disableDepthWrite).toBe(true);
    expect(layer.material.forceDepthWrite).toBe(false);
    engine.dispose();
  });

  it('onBind 가 태양 위치를 매번 읽는다 (캐시 금지 — #1204 영벡터 클래스)', () => {
    const sun = new Vector3(100, 0, 0);
    const { engine, layer } = setup(sun);
    const read = () =>
      (
        layer.material as unknown as { _vectors3: Record<string, Vector3> }
      )._vectors3.uSunDirection!.clone();
    layer.material.onBindObservable.notifyObservers(layer.mesh as Mesh);
    const first = read();
    expect(first.x).toBeCloseTo(1, 6);
    sun.set(0, 0, 100);
    layer.material.onBindObservable.notifyObservers(layer.mesh as Mesh);
    const second = read();
    expect(second.z).toBeCloseTo(1, 6);
    expect(second.x).toBeCloseTo(0, 6);
    engine.dispose();
  });

  it('applyCloudDrift — local Y 주위 computeSpinAngle(jd) 회전, jd 순수 함수 (누적 없음)', () => {
    const { engine, layer } = setup(new Vector3(100, 0, 0));
    const epoch = 2451545.0;
    const expected = (jd: number) =>
      Quaternion.RotationAxis(new Vector3(0, 1, 0), computeSpinAngle(jd, epoch, layer.driftOmega));
    applyCloudDrift(layer, 2451626.0, epoch);
    const q1 = layer.mesh.rotationQuaternion!.clone();
    expect(q1.equalsWithEpsilon(expected(2451626.0), 1e-12)).toBe(true);
    applyCloudDrift(layer, 2451630.5, epoch);
    expect(layer.mesh.rotationQuaternion!.equalsWithEpsilon(expected(2451630.5), 1e-12)).toBe(true);
    applyCloudDrift(layer, 2451626.0, epoch);
    expect(layer.mesh.rotationQuaternion!.equals(q1)).toBe(true);
    engine.dispose();
  });
});
