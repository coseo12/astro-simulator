import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getSolarSystem } from '../ephemeris/solar-system-loader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * R10b #664 — 고이심률 궤도선 동적 segments 가드 (ADR 20260612-r10b §축 3 조건부 축 발동).
 *
 * `sampleOrbitPoints` (solar-system-scene.ts) 의 `segments = e >= 0.6 ? 256 : 64` 는
 * D-T2 실측에서 halley (e 0.967) 원일점측 chord 꺾임 식별로 발동된 fix (사전 산출 13.97px =
 * eris 식별-불가 기준선 1.10px 의 12.7배 — 예측 적중).
 *
 * 본 가드 2축:
 *   1. 소스 정적 매칭 — 임계식 자체가 소스에 존재 (silent 제거/완화 차단, #598/#619 패턴)
 *   2. 데이터 경계 — 기존 24 body (phase ≤ 10) 전부 e < 0.6 (seg 64 불변 = vertex 불변 →
 *      pixel-diff 기존 궤도선 무영향 보장) + 혜성 3 (phase 11) 전부 e ≥ 0.6 (256 seg 적용 보장).
 *      임계 0.6 은 실측 anchor: 최대 OK (eris 0.436 — 꺾임 식별 불가 실측) 와 최소 혜성
 *      (encke 0.848) 사이.
 */
describe('R10b #664 — sampleOrbitPoints 고이심률 동적 segments 가드 (ADR §축 3)', () => {
  const E_THRESHOLD = 0.6;
  const COMET_IDS = ['halley', 'encke', 'swift-tuttle'];
  const bodies = getSolarSystem().bodies;

  it('소스 정적 매칭 — segments 임계식 (e >= 0.6 ? 256 : 64) 이 sampleOrbitPoints 에 존재', () => {
    const source = fs.readFileSync(path.join(__dirname, 'solar-system-scene.ts'), 'utf-8');
    expect(source).toMatch(/orbit\.eccentricity\s*>=\s*0\.6\s*\?\s*256\s*:\s*64/);
  });

  it('기존 24 body (phase ≤ 10) 전부 e < 0.6 — seg 64 불변 (vertex 동일, pixel-diff 무영향)', () => {
    const legacy = bodies.filter((b) => b.introducedInRPhase <= 10 && b.orbit);
    expect(legacy.length).toBeGreaterThan(0);
    for (const b of legacy) {
      expect(
        b.orbit!.eccentricity,
        `${b.id} (e=${b.orbit!.eccentricity}) 는 임계 ${E_THRESHOLD} 미만이어야 seg 64 불변`,
      ).toBeLessThan(E_THRESHOLD);
    }
  });

  it('혜성 3 (phase 11) 전부 e ≥ 0.6 — 256 seg 적용 (원일점 chord 꺾임 해소 대상)', () => {
    for (const id of COMET_IDS) {
      const b = bodies.find((x) => x.id === id);
      expect(b?.orbit, `${id} orbit 데이터 존재`).toBeTruthy();
      expect(
        b!.orbit!.eccentricity,
        `${id} (e=${b!.orbit!.eccentricity}) 는 임계 ${E_THRESHOLD} 이상이어야 256 seg 적용`,
      ).toBeGreaterThanOrEqual(E_THRESHOLD);
    }
  });
});
