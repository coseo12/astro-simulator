/**
 * #850 Phase 1 — `orbit-sampling.ts` 순수 함수 단위 테스트.
 *
 * `sampleOrbitPoints` 는 이동 전 `solar-system-scene.ts` module-private 라 **거동 테스트가 0** 이었다
 * (`orbit-line-segments.test.ts` 는 소스 정규식 매칭 + 데이터 경계만 검증 — 함수를 호출하지 않는다).
 * 이동으로 확보된 표면에 다음 계약을 고정한다:
 *
 *   (i)   R10b #664 동적 segments — e ≥ 0.6 → 256 seg / e < 0.6 → 64 seg (vertex = seg + 1)
 *   (ii)  P12-A #298 — 궤도선 점도 tier renderScale 로 환산 (원칙 #4 거리 동일 스케일)
 *   (iii) orbit / parentId 부재 시 null (궤도선 미생성)
 *
 * `isSatelliteOrbit` 의 분류 정책 SSoT 는 `satellite-orbit-structure.test.ts` 가 이미 커버하므로
 * 본 파일은 중복 작성하지 않는다 (CLAUDE.md "신규 함수 ≠ 신규 구현" 의 테스트판).
 */
import { describe, expect, it } from 'vitest';
import { AU } from '@astro-simulator/shared';
import { sampleOrbitPoints } from './orbit-sampling.js';
import { renderScaleForTier } from './tier.js';
import type { LoadedCelestialBody } from '../ephemeris/solar-system-loader.js';

/** 궤도 요소만 의미 있는 최소 body stub (본 함수는 orbit / parentId 만 읽는다). */
function orbitBody(
  eccentricity: number,
  overrides: Partial<LoadedCelestialBody['orbit']> = {},
): LoadedCelestialBody {
  return {
    id: 'stub',
    parentId: 'sun',
    orbit: {
      semiMajorAxis: AU,
      eccentricity,
      inclination: 0,
      longitudeOfAscendingNode: 0,
      argumentOfPeriapsis: 0,
      meanAnomalyAtEpoch: 0,
      ...overrides,
    },
  } as LoadedCelestialBody;
}

describe('#627 — sampleOrbitPoints null 조건 (궤도선 미생성)', () => {
  it('orbit 부재 → null (sun 등 궤도 없는 body)', () => {
    expect(
      sampleOrbitPoints({ id: 'sun', parentId: null } as LoadedCelestialBody, 'solar'),
    ).toBeNull();
  });

  it('parentId 부재 → null (중심 천체는 자기 궤도선을 갖지 않음)', () => {
    const body = orbitBody(0.0167);
    expect(
      sampleOrbitPoints({ ...body, parentId: null } as LoadedCelestialBody, 'solar'),
    ).toBeNull();
  });
});

describe('R10b #664 — 동적 segments 분기 (e ≥ 0.6 ? 256 : 64) 거동 검증', () => {
  it('e < 0.6 (지구 0.0167) → 64 seg = 65 vertex (기존 24 body 불변 보장)', () => {
    expect(sampleOrbitPoints(orbitBody(0.0167), 'solar')!).toHaveLength(65);
  });

  it('임계 직전 e = 0.5999 → 64 seg (경계 하단)', () => {
    expect(sampleOrbitPoints(orbitBody(0.5999), 'solar')!).toHaveLength(65);
  });

  it('임계 정확값 e = 0.6 → 256 seg = 257 vertex (>= 비교 SSoT)', () => {
    expect(sampleOrbitPoints(orbitBody(0.6), 'solar')!).toHaveLength(257);
  });

  it('halley e = 0.967 → 256 seg (원일점 chord 꺾임 해소 대상)', () => {
    expect(sampleOrbitPoints(orbitBody(0.967), 'solar')!).toHaveLength(257);
  });

  it('eris e = 0.436 → 64 seg (실측 anchor — 꺾임 식별 불가 상한)', () => {
    expect(sampleOrbitPoints(orbitBody(0.436), 'solar')!).toHaveLength(65);
  });
});

describe('P12-A #298 — tier renderScale 환산 + 궤도 기하', () => {
  it('원궤도 (e=0, i=0) 전 점의 반경이 a × renderScale 로 균일', () => {
    const scale = renderScaleForTier('solar');
    const pts = sampleOrbitPoints(orbitBody(0), 'solar')!;
    for (const p of pts) {
      expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(AU * scale, 6);
    }
  });

  it('tier 변경 시 좌표가 renderScale 비율만큼 선형 스케일 (형상 불변)', () => {
    const solar = sampleOrbitPoints(orbitBody(0.2), 'solar')!;
    const body = sampleOrbitPoints(orbitBody(0.2), 'body')!;
    const ratio = renderScaleForTier('body') / renderScaleForTier('solar');
    expect(solar).toHaveLength(body.length);
    for (let i = 0; i < solar.length; i += 1) {
      expect(body[i]!.x).toBeCloseTo(solar[i]!.x * ratio, 6);
      expect(body[i]!.y).toBeCloseTo(solar[i]!.y * ratio, 6);
      expect(body[i]!.z).toBeCloseTo(solar[i]!.z * ratio, 6);
    }
  });

  it('타원 궤도 — ν=0 은 근점거리 a(1−e), ν=π 는 원점거리 a(1+e)', () => {
    const e = 0.5;
    const scale = renderScaleForTier('solar');
    const pts = sampleOrbitPoints(orbitBody(e), 'solar')!;
    // 진근점각 등간격 샘플링 — index 0 = ν 0 (근점), index 128 = ν π (원점, 256 seg 기준 아님에
    // 유의: e=0.5 는 64 seg 이므로 중앙 index 32).
    expect(Math.hypot(pts[0]!.x, pts[0]!.y, pts[0]!.z)).toBeCloseTo(AU * (1 - e) * scale, 6);
    expect(Math.hypot(pts[32]!.x, pts[32]!.y, pts[32]!.z)).toBeCloseTo(AU * (1 + e) * scale, 6);
  });

  it('i = 0 이면 z 성분 전부 0 (황도면 내 궤도)', () => {
    const pts = sampleOrbitPoints(orbitBody(0.3), 'solar')!;
    // sinI × y1 이 −0 을 낳을 수 있어 부호 없는 크기로 판정 (Object.is 는 −0 ≠ +0).
    for (const p of pts) expect(Math.abs(p.z)).toBe(0);
  });

  it('i = 90° 이면 y 성분이 0 으로 붕괴 (극궤도 — cosI = 0)', () => {
    const pts = sampleOrbitPoints(orbitBody(0.1, { inclination: Math.PI / 2 }), 'solar')!;
    for (const p of pts) expect(Math.abs(p.y)).toBeLessThan(1e-6);
    // z 는 살아있어야 함 (평면 회전이지 축 붕괴가 아님).
    expect(Math.max(...pts.map((p) => Math.abs(p.z)))).toBeGreaterThan(0);
  });

  it('궤도 폐곡선 — 첫 점과 마지막 점이 일치 (ν 0 과 2π)', () => {
    const pts = sampleOrbitPoints(orbitBody(0.4), 'solar')!;
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    expect(last.x).toBeCloseTo(first.x, 6);
    expect(last.y).toBeCloseTo(first.y, 6);
    expect(last.z).toBeCloseTo(first.z, 6);
  });
});
