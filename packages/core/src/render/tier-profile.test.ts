import { describe, expect, it } from 'vitest';
import { TIER_PROFILES, type GpuTier } from './tier-profile.js';

/**
 * P11-C #290 DoD #4 — GPU tier 프로파일 스펙 snapshot 테스트 (3 tier × 6 속성)
 *
 * ADR: `docs/decisions/20260424-tier-preset-design.md` §축 4
 *
 * 카테고리 enum 완비 — 항목 누락 시 본 테스트가 즉시 fail (CLAUDE.md "주석 계약 vs
 * 구현 drift" 교훈 — volt #49).
 */

describe('TIER_PROFILES — 3 tier × 6축 완비 assert (카테고리 enum drift 방어)', () => {
  const required: GpuTier[] = ['a', 'b', 'c'];
  const requiredAxes = ['lod', 'particles', 'shadow', 'aa', 'postProc'] as const;

  it('3 tier 전부 존재', () => {
    for (const tier of required) {
      expect(TIER_PROFILES[tier]).toBeDefined();
      expect(TIER_PROFILES[tier].tier).toBe(tier);
    }
  });

  it('6축 (lod/particles/shadow/aa/postProc/bloom) 전부 존재 (각 tier)', () => {
    for (const tier of required) {
      const profile = TIER_PROFILES[tier];
      for (const axis of requiredAxes) {
        expect(profile[axis]).toBeDefined();
      }
      // bloom 은 postProc 내부 boolean 축 — enabled/bloom/grain 3 서브축 필수
      expect(typeof profile.postProc.bloom).toBe('boolean');
      expect(typeof profile.postProc.enabled).toBe('boolean');
      expect(typeof profile.postProc.grain).toBe('boolean');
    }
  });
});

describe('TIER_PROFILES — tier-a 고성능 스냅샷 (ADR §축 4 표)', () => {
  const p = TIER_PROFILES.a;
  it('LOD: high=50 / mid=8 (기본값)', () => {
    expect(p.lod.high).toBe(50);
    expect(p.lod.mid).toBe(8);
    expect(p.lod.forceOverride).toBeUndefined();
  });
  it('파티클 상한 50000', () => {
    expect(p.particles.maxCount).toBe(50_000);
  });
  it('Shadow 2048² × DPR clamp 2', () => {
    expect(p.shadow.resolution).toBe(2048);
    expect(p.shadow.dprClampMax).toBe(2);
  });
  it('AA = msaa8 / postProc 전체 활성', () => {
    expect(p.aa).toBe('msaa8');
    expect(p.postProc.enabled).toBe(true);
    expect(p.postProc.bloom).toBe(true);
    expect(p.postProc.grain).toBe(true);
  });
});

describe('TIER_PROFILES — tier-b 중립 스냅샷', () => {
  const p = TIER_PROFILES.b;
  it('LOD: high=50 / mid=8 (tier-a 와 동일 경계)', () => {
    expect(p.lod.high).toBe(50);
    expect(p.lod.mid).toBe(8);
    expect(p.lod.forceOverride).toBeUndefined();
  });
  it('파티클 상한 20000 (tier-a/4)', () => {
    expect(p.particles.maxCount).toBe(20_000);
  });
  it('Shadow 1024² × DPR clamp 2', () => {
    expect(p.shadow.resolution).toBe(1024);
    expect(p.shadow.dprClampMax).toBe(2);
  });
  it('AA = msaa4 / postProc bloom 유지 grain 제외', () => {
    expect(p.aa).toBe('msaa4');
    expect(p.postProc.enabled).toBe(true);
    expect(p.postProc.bloom).toBe(true);
    expect(p.postProc.grain).toBe(false);
  });
});

describe('TIER_PROFILES — tier-c 자동 최대 억제 스냅샷 (DoD #5)', () => {
  const p = TIER_PROFILES.c;
  it('LOD: high=100 / mid=20 + forceOverride=low (ADR §축 5 후보 A)', () => {
    expect(p.lod.high).toBe(100);
    expect(p.lod.mid).toBe(20);
    expect(p.lod.forceOverride).toBe('low');
  });
  it('파티클 0 (비활성)', () => {
    expect(p.particles.maxCount).toBe(0);
  });
  it('Shadow OFF / DPR clamp 1', () => {
    expect(p.shadow.resolution).toBe('off');
    expect(p.shadow.dprClampMax).toBe(1);
  });
  it('AA = fxaa / postProc 전체 OFF / bloom OFF', () => {
    expect(p.aa).toBe('fxaa');
    expect(p.postProc.enabled).toBe(false);
    expect(p.postProc.bloom).toBe(false);
    expect(p.postProc.grain).toBe(false);
  });
});
