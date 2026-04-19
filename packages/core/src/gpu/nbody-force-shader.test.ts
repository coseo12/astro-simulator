import { describe, expect, it } from 'vitest';
import { NBODY_FORCE_TILE, NBODY_FORCE_WGSL } from './nbody-force-shader';
import { computeForcesF32 } from './nbody-force-cpu';

describe('NBODY_FORCE_WGSL', () => {
  it('TILE 크기 64로 컴파일 시 workgroup_size 일치', () => {
    expect(NBODY_FORCE_TILE).toBe(64);
    expect(NBODY_FORCE_WGSL).toContain('@workgroup_size(64)');
  });

  it('필수 binding 4개 모두 선언', () => {
    expect(NBODY_FORCE_WGSL).toContain('@group(0) @binding(0) var<uniform> params');
    expect(NBODY_FORCE_WGSL).toContain('@group(0) @binding(1) var<storage, read> positions');
    expect(NBODY_FORCE_WGSL).toContain('@group(0) @binding(2) var<storage, read> masses');
    expect(NBODY_FORCE_WGSL).toContain(
      '@group(0) @binding(3) var<storage, read_write> accelerations',
    );
  });

  it('헬퍼 함수 _bh_pair_acc 인라인 포함', () => {
    expect(NBODY_FORCE_WGSL).toContain('fn _bh_pair_acc');
  });
});

describe('computeForcesF32 (CPU 참조)', () => {
  const G = 6.6743e-11;

  it('단일 입자 → 가속도 0', () => {
    const acc = computeForcesF32(new Float32Array([0, 0, 0]), new Float32Array([1e10]), 1e-6, G);
    expect(acc[0]).toBe(0);
    expect(acc[1]).toBe(0);
    expect(acc[2]).toBe(0);
  });

  it('대칭 2-body — 동일 질량은 중심 향해 같은 크기/반대 방향', () => {
    const positions = new Float32Array([-1, 0, 0, 1, 0, 0]);
    const masses = new Float32Array([1e10, 1e10]);
    const acc = computeForcesF32(positions, masses, 0, G);
    // Float32Array 길이 6 보장 (N=2 × 3 컴포넌트). noUncheckedIndexedAccess 가드 해소.
    expect(acc[0]!).toBeCloseTo(-acc[3]!, 5);
    expect(Math.sign(acc[0]!)).toBe(1); // -1에 있는 입자는 +x 방향으로 끌림
    expect(Math.sign(acc[3]!)).toBe(-1);
  });

  it('softening_sq가 close-encounter 발산 방지', () => {
    const positions = new Float32Array([0, 0, 0, 0, 0, 0]); // 동일 위치
    const masses = new Float32Array([1e10, 1e10]);
    const acc = computeForcesF32(positions, masses, 1e10, G);
    // softening 덕분에 NaN/Inf 없이 finite 값
    for (const v of acc) expect(Number.isFinite(v)).toBe(true);
  });

  it('N=8 직접합 결과가 GPU 셰이더와 동일 알고리즘 (검증 #147에서 GPU 비교)', () => {
    // 무작위 N=8 — 자체 정합성만 검증
    const n = 8;
    const pos = new Float32Array(3 * n);
    const m = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[3 * i] = i;
      pos[3 * i + 1] = i * 2;
      pos[3 * i + 2] = -i;
      m[i] = 1e22;
    }
    const a = computeForcesF32(pos, m, 1, G);
    expect(a.length).toBe(3 * n);
    // 입자별 가속도 magnitude는 0 이상
    for (let i = 0; i < n; i++) {
      const mag = Math.hypot(a[3 * i] ?? 0, a[3 * i + 1] ?? 0, a[3 * i + 2] ?? 0);
      expect(mag).toBeGreaterThan(0);
    }
  });
});
