import { describe, expect, it } from 'vitest';
import { manyToRelativeToEye, toRelativeToEye } from './rte.js';
import { vec3 } from './vec3.js';

describe('toRelativeToEye', () => {
  it('원점에서 단순 변환', () => {
    const out = toRelativeToEye(vec3(10, 20, 30), vec3(0, 0, 0));
    expect(Array.from(out)).toEqual([10, 20, 30]);
  });

  it('큰 월드 좌표에서도 카메라 근처는 소수점 정밀도 유지 (RTE 핵심)', () => {
    // 월드 좌표: 1 AU(~1.496e11m) 근처의 인접 두 점
    const cameraWorld = vec3(149_597_870_700, 0, 0); // 1 AU
    const bodyWorld = vec3(149_597_870_700 + 6_378_137, 0, 0); // 1 AU + 지구 반경
    const out = toRelativeToEye(bodyWorld, cameraWorld);

    // float32로 캐스팅되었지만 ~6.3e6m 범위라 수 m 단위 정밀도 유지
    expect(out[0]).toBeCloseTo(6_378_137, -1); // 10m 이내
    expect(out[1]).toBe(0);
    expect(out[2]).toBe(0);
  });

  it('10^13m 스케일에서 직접 float32 대입 대비 우위', () => {
    // Anti-pattern 검증: 월드 좌표를 float32로 바로 넘기면 정밀도 대량 손실
    const naive = new Float32Array([4_500_000_000_001]);
    expect(naive[0]).not.toBe(4_500_000_000_001); // float32는 표현 불가 — 가까운 값으로 반올림

    // RTE는 뺄셈을 double로 수행 → 결과만 float32화
    const cameraWorld = vec3(4_500_000_000_000, 0, 0);
    const bodyWorld = vec3(4_500_000_000_001, 0, 0);
    const out = toRelativeToEye(bodyWorld, cameraWorld);
    expect(out[0]).toBe(1); // 정확히 1m 재현
  });

  it('out 버퍼 재사용', () => {
    const buf = new Float32Array(3);
    const result = toRelativeToEye(vec3(1, 2, 3), vec3(0, 0, 0), buf);
    expect(result).toBe(buf);
    expect(Array.from(buf)).toEqual([1, 2, 3]);
  });

  it('manyToRelativeToEye — 복수 천체 일괄 변환', () => {
    const positions = [vec3(10, 0, 0), vec3(0, 20, 0), vec3(0, 0, 30)];
    const out = manyToRelativeToEye(positions, vec3(5, 5, 5));
    expect(Array.from(out)).toEqual([5, -5, -5, -5, 15, -5, -5, -5, 25]);
  });
});
