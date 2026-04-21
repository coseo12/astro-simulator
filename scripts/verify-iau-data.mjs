#!/usr/bin/env node
/**
 * P10-B #274 — IAU 2015 데이터 자동 검증 스크립트 (B-2 전수 대조).
 *
 * 목적:
 *   - `packages/shared/data/solar-system.json` 의 천체 데이터가 IAU 2015 + NASA/JPL 공식값과 일치하는지 검증
 *   - Fact-First 원칙 §2 (±0.01% 공차) 초과 시 exit 1
 *   - `uncertainty` 필드 필수 검사 (IAU 공식값 없는 body — 소행성/혜성/irregular body)
 *   - `epoch` 존재 검증 (root epoch 상속 포함)
 *   - `dataSource` / `lastVerified` 필드 존재 검증 (B-2 감사 완료 후 error 로 승격)
 *
 * 사용:
 *   node scripts/verify-iau-data.mjs           # 전체 검증 (exit 1 on error)
 *   node scripts/verify-iau-data.mjs --report  # 리포트만 (exit 0, JSON 출력)
 *
 * 단계:
 *   - P10-B-1: 스켈레톤 + 구조 검증 (필드 존재 / 타입 검증) ✓
 *   - P10-B-2 (현재): IAU 2015 대조 테이블 전수 확장 + severity 승격 + radius 규약 (equatorial for near-spherical)
 *   - P10-B-3: CI 통합 (verify-and-rust 또는 별도 workflow)
 *
 * radius 규약 (B-2 결정, A안):
 *   - near-spherical body: IAU 2015 equatorial nominal (Jupiter/Saturn/Uranus/Neptune/Earth/Mars)
 *   - small-oblate (편평도 ≈ 0): mean radius 로 통일 (Mercury/Venus/Moon/Io/Europa/Ganymede/Callisto/Ceres/Pluto/Makemake/Eris — eq ≈ mean)
 *   - irregular body: volumetric mean radius + `uncertainty.radius` 필수 (Phobos/Deimos/Haumea/comets)
 *
 * 근거:
 *   - Gemini 2차 교차검증 High 발견 (volt #29 / PR #273 수용)
 *   - CLAUDE.md `### 스프린트 계약` §10 "수치 DoD 미달 시 측정 방법 검증 우선"
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const JSON_PATH = resolve(__dirname, '../packages/shared/data/solar-system.json');

/**
 * IAU 2015 + NASA/JPL Reference Values (P10-B-2 전수 확장).
 *
 * 출처 우선순위 (Fact-First 원칙 §2):
 *   1차: IAU 2015 Resolution B3 — Nominal values (Sun/Earth/Jupiter 만 공식 명시)
 *   2차: NASA Planetary Fact Sheet (https://nssdc.gsfc.nasa.gov/planetary/factsheet/)
 *   3차: JPL Horizons / JPL SSD (위성 + 소행성 + 혜성)
 *
 * 단위:
 *   - mass: kg
 *   - radius: m
 *   - radiusKind: 'equatorial' | 'mean' (irregular body 는 'mean')
 *
 * irregular body (uncertainty 필수):
 *   - Phobos / Deimos / Haumea / 모든 혜성
 *   이 body 들은 비구형이라 IAU equatorial 정의 없음 → mean + uncertainty.radius 로 표현
 */
const IAU_2015_NOMINAL = Object.freeze({
  // 항성
  sun: {
    mass: 1.98892e30,
    radius: 6.957e8,
    radiusKind: 'equatorial',
    source: 'IAU 2015 Resolution B3 §1',
  },
  // 행성 (IAU 2015 B3 = Sun/Earth/Jupiter 만, 나머지는 NASA Fact Sheet)
  mercury: {
    mass: 3.3011e23,
    radius: 2.4397e6, // NASA: 편평도 ≈ 0, mean ≈ equatorial
    radiusKind: 'mean',
    source: 'NASA Planetary Fact Sheet (2024)',
  },
  venus: {
    mass: 4.8675e24,
    radius: 6.0518e6, // NASA: 편평도 = 0
    radiusKind: 'mean',
    source: 'NASA Planetary Fact Sheet (2024)',
  },
  earth: {
    mass: 5.9722e24,
    radius: 6.3781e6, // IAU B3 equatorial (WGS84 6.378137e6 는 공차 내)
    radiusKind: 'equatorial',
    source: 'IAU 2015 Resolution B3 §2',
  },
  mars: {
    mass: 6.4171e23,
    radius: 3.3962e6, // NASA equatorial (mean 3389.5 km 와 구분)
    radiusKind: 'equatorial',
    source: 'NASA Planetary Fact Sheet (2024)',
  },
  jupiter: {
    mass: 1.89813e27,
    radius: 7.1492e7, // IAU B3 equatorial
    radiusKind: 'equatorial',
    source: 'IAU 2015 Resolution B3 §3',
  },
  saturn: {
    mass: 5.6834e26,
    radius: 6.0268e7, // NASA equatorial
    radiusKind: 'equatorial',
    source: 'NASA Planetary Fact Sheet (2024)',
  },
  uranus: {
    mass: 8.681e25,
    radius: 2.5559e7, // NASA equatorial
    radiusKind: 'equatorial',
    source: 'NASA Planetary Fact Sheet (2024)',
  },
  neptune: {
    mass: 1.02413e26, // NASA 최신 (JSON 1.0243e26 대비 -0.017%)
    radius: 2.4764e7, // NASA equatorial
    radiusKind: 'equatorial',
    source: 'NASA Planetary Fact Sheet (2024)',
  },
  // 위성 (JPL SSD / NASA)
  moon: {
    mass: 7.342e22,
    radius: 1.7374e6,
    radiusKind: 'mean',
    source: 'NASA/JPL Moon Fact Sheet',
  },
  phobos: {
    mass: 1.0659e16,
    radius: 1.108e4, // JPL SSD mean (irregular — uncertainty 필수)
    radiusKind: 'mean',
    irregular: true,
    source: 'JPL SSD Mars Satellites (2026-01-01 ephemeris)',
  },
  deimos: {
    mass: 1.4762e15,
    radius: 6.27e3, // JPL SSD mean (irregular — uncertainty 필수)
    radiusKind: 'mean',
    irregular: true,
    source: 'JPL SSD Mars Satellites (2026-01-01 ephemeris)',
  },
  io: {
    mass: 8.9319e22,
    radius: 1.8216e6,
    radiusKind: 'mean',
    source: 'JPL Horizons / NASA Galilean Satellites',
  },
  europa: {
    mass: 4.7998e22,
    radius: 1.5608e6,
    radiusKind: 'mean',
    source: 'JPL Horizons / NASA Galilean Satellites',
  },
  ganymede: {
    mass: 1.4819e23,
    radius: 2.6341e6,
    radiusKind: 'mean',
    source: 'JPL Horizons / NASA Galilean Satellites',
  },
  callisto: {
    mass: 1.0759e23,
    radius: 2.4103e6,
    radiusKind: 'mean',
    source: 'JPL Horizons / NASA Galilean Satellites',
  },
  // 왜소행성 (NASA / JPL SBDB)
  ceres: {
    mass: 9.3835e20,
    radius: 4.696e5,
    radiusKind: 'mean',
    source: 'NASA Dawn mission / JPL SBDB',
  },
  pluto: {
    mass: 1.303e22,
    radius: 1.1883e6, // New Horizons 2015
    radiusKind: 'mean',
    source: 'NASA New Horizons (2015) / JPL SBDB',
  },
  haumea: {
    mass: 4.006e21,
    radius: 7.8e5, // highly irregular — volumetric mean
    radiusKind: 'mean',
    irregular: true,
    source: 'Ragozzine & Brown (2009) / Ortiz et al. (2017)',
  },
  makemake: {
    mass: 3.1e21,
    radius: 7.15e5,
    radiusKind: 'mean',
    irregular: true, // 관측 부정확 — uncertainty 필수
    source: 'Ortiz et al. (2012) stellar occultation',
  },
  eris: {
    mass: 1.66e22,
    radius: 1.163e6,
    radiusKind: 'mean',
    source: 'Sicardy et al. (2011) stellar occultation',
  },
  // 혜성 (irregular — uncertainty 필수)
  halley: {
    mass: 2.2e14,
    radius: 5.5e3, // Keller et al. 1987, 15×8×8 km — highly irregular
    radiusKind: 'mean',
    irregular: true,
    source: 'Keller et al. (1987) / JPL SBDB',
  },
  encke: {
    mass: 1.0e13,
    radius: 2.4e3,
    radiusKind: 'mean',
    irregular: true,
    source: 'JPL SBDB (2P/Encke)',
  },
  'swift-tuttle': {
    mass: 2.5e16,
    radius: 1.3e4,
    radiusKind: 'mean',
    irregular: true,
    source: 'Jorda & Licandro (2003) / JPL SBDB',
  },
});

/** ±0.01% 공차 (Fact-First 원칙 §2). */
const TOLERANCE = 1e-4;

/**
 * B-2: 구조 검증 — 감사 필드 필수화.
 *
 * B-1: severity='warning' / B-2 이후: severity='error' 승격.
 */
function verifyStructure(data) {
  const issues = [];

  if (typeof data.epoch !== 'number') {
    issues.push({ severity: 'error', scope: 'root', message: 'root.epoch 누락 또는 숫자 아님' });
  }
  if (!data.source) {
    issues.push({ severity: 'error', scope: 'root', message: 'root.source 누락' });
  }
  if (!Array.isArray(data.bodies) || data.bodies.length === 0) {
    issues.push({ severity: 'error', scope: 'root', message: 'bodies 배열 누락 또는 빈 배열' });
    return issues;
  }

  for (const body of data.bodies) {
    const ctx = `body[${body.id ?? '<unknown>'}]`;

    // B-2: 감사 완료 후 필수 필드
    if (body.dataSource === undefined) {
      issues.push({ severity: 'error', scope: ctx, message: 'dataSource 필수 (P10-B-2 감사 후)' });
    }
    if (body.lastVerified === undefined) {
      issues.push({ severity: 'error', scope: ctx, message: 'lastVerified 필수 (감사 일자 기록)' });
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(body.lastVerified)) {
      issues.push({
        severity: 'error',
        scope: ctx,
        message: `lastVerified 형식 오류 (ISO YYYY-MM-DD 기대): ${body.lastVerified}`,
      });
    }

    // colorSource 필수
    if (body.colorHint && body.colorHint.colorSource === undefined) {
      issues.push({
        severity: 'error',
        scope: ctx,
        message: 'colorHint.colorSource 필수 (observed/artistic/inferred)',
      });
    } else if (
      body.colorHint?.colorSource &&
      !['observed', 'artistic', 'inferred'].includes(body.colorHint.colorSource)
    ) {
      issues.push({
        severity: 'error',
        scope: ctx,
        message: `colorSource 값 오류: ${body.colorHint.colorSource} (observed/artistic/inferred 중 하나)`,
      });
    }

    // irregular body 는 uncertainty 필수
    const iau = IAU_2015_NOMINAL[body.id];
    if (iau?.irregular && !body.uncertainty) {
      issues.push({
        severity: 'error',
        scope: ctx,
        message: `irregular body (${iau.source}) — uncertainty 필드 필수`,
      });
    }
  }

  return issues;
}

/**
 * B-2: IAU 2015 + NASA/JPL 값 대조 — 전수 검증.
 *
 * severity='error' (B-2 승격). 공차 초과 시 exit 1.
 */
function verifyIauValues(data) {
  const issues = [];

  for (const body of data.bodies) {
    const iau = IAU_2015_NOMINAL[body.id];
    if (!iau) {
      // 대조 테이블에 없는 body (확장 예정)
      issues.push({
        severity: 'warning',
        scope: `body[${body.id}]`,
        message: '대조 테이블에 없음 — IAU_2015_NOMINAL 에 추가 필요',
      });
      continue;
    }

    const massDiff = Math.abs(body.mass - iau.mass) / iau.mass;
    if (massDiff > TOLERANCE) {
      issues.push({
        severity: 'error',
        scope: `body[${body.id}].mass`,
        message: `공식값 대비 ${(massDiff * 100).toFixed(4)}% 차이 (공차 ${TOLERANCE * 100}%, 공식=${iau.mass}, json=${body.mass})`,
        source: iau.source,
      });
    }

    const radiusDiff = Math.abs(body.radius - iau.radius) / iau.radius;
    if (radiusDiff > TOLERANCE) {
      issues.push({
        severity: 'error',
        scope: `body[${body.id}].radius`,
        message: `공식값 대비 ${(radiusDiff * 100).toFixed(4)}% 차이 (공차 ${TOLERANCE * 100}%, 공식=${iau.radius} [${iau.radiusKind}], json=${body.radius})`,
        source: iau.source,
      });
    }
  }

  return issues;
}

function main() {
  const args = process.argv.slice(2);
  const reportOnly = args.includes('--report');

  let raw;
  try {
    raw = readFileSync(JSON_PATH, 'utf-8');
  } catch (err) {
    console.error(`[verify-iau-data] JSON 읽기 실패: ${JSON_PATH}`);
    console.error(err.message);
    process.exit(2);
  }

  const data = JSON.parse(raw);

  const structureIssues = verifyStructure(data);
  const valueIssues = verifyIauValues(data);
  const allIssues = [...structureIssues, ...valueIssues];

  const errors = allIssues.filter((i) => i.severity === 'error');
  const warnings = allIssues.filter((i) => i.severity === 'warning');

  if (reportOnly) {
    console.log(
      JSON.stringify(
        {
          phase: 'P10-B-2 (전수 대조 + severity 승격)',
          tolerance: TOLERANCE,
          bodies: data.bodies.length,
          iauCoverage: Object.keys(IAU_2015_NOMINAL).length,
          errors: errors.length,
          warnings: warnings.length,
          issues: allIssues,
        },
        null,
        2,
      ),
    );
    if (errors.length > 0) process.exit(1);
    return;
  }

  // 콘솔 요약
  console.log(`[verify-iau-data] P10-B-2 전수 대조`);
  console.log(`  검증 대상: ${data.bodies.length} bodies`);
  console.log(`  공식값 대조: ${Object.keys(IAU_2015_NOMINAL).length} bodies`);
  console.log(`  공차: ±${TOLERANCE * 100}%`);
  console.log(`  에러: ${errors.length} / 경고: ${warnings.length}`);

  for (const issue of errors) {
    console.error(`  ❌ [${issue.scope}] ${issue.message}`);
  }
  for (const issue of warnings.slice(0, 10)) {
    console.warn(`  ⚠️  [${issue.scope}] ${issue.message}`);
  }
  if (warnings.length > 10) {
    console.warn(`  ⚠️  ... 및 ${warnings.length - 10}건 더 (--report 로 전체 확인)`);
  }

  if (errors.length > 0) {
    process.exit(1);
  }
}

main();
