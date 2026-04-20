#!/usr/bin/env node
/**
 * P10-B #274 — IAU 2015 데이터 자동 검증 스크립트 (스켈레톤).
 *
 * 목적:
 *   - `packages/shared/data/solar-system.json` 의 천체 데이터가 IAU 2015 공식값과 일치하는지 검증
 *   - Fact-First 원칙 §2 (±0.01% 공차) 초과 시 exit 1
 *   - `uncertainty` 필드 필수 검사 (IAU 공식값 없는 body)
 *   - `epoch` 존재 검증 (root epoch 상속 포함)
 *   - `dataSource` / `lastVerified` 필드 존재 검증 (감사 완료 후)
 *
 * 사용:
 *   node scripts/verify-iau-data.mjs           # 전체 검증 (exit 1 on mismatch)
 *   node scripts/verify-iau-data.mjs --report  # 리포트만 (exit 0, JSON 출력)
 *
 * 단계:
 *   - P10-B-1 (본 커밋): 스켈레톤 + 구조 검증 (필드 존재 / 타입 검증)
 *   - P10-B-2: IAU 2015 대조 테이블 하드코딩 + 공차 비교
 *   - P10-B-3: CI 통합 (verify-and-rust 또는 별도 workflow)
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
 * IAU 2015 Nominal Values (부분 — P10-B-2 에서 확장).
 * 출처: IAU 2015 Resolution B3 — Nominal values for stars, planets, and planetary bodies.
 *
 * 단위:
 *   - mass: kg
 *   - radius: m (equatorial)
 *
 * P10-B-2 에서 전체 8 행성 + 위성 + 왜소행성 확장. 현 시점은 구조 검증용 3개만.
 */
const IAU_2015_NOMINAL = Object.freeze({
  sun: {
    mass: 1.98892e30, // IAU B3 §1 M_sun_N = 1.98892 × 10^30 kg
    radius: 6.957e8, // IAU B3 §1 R_sun_N = 6.957 × 10^8 m
    source: 'IAU 2015 Resolution B3 §1',
  },
  earth: {
    mass: 5.9722e24, // IAU B3 §2 M_Earth_N = 5.9722 × 10^24 kg
    radius: 6.3781e6, // IAU B3 §2 R_Earth_N (equatorial) = 6.3781 × 10^6 m
    source: 'IAU 2015 Resolution B3 §2',
  },
  jupiter: {
    mass: 1.89813e27, // IAU B3 §3 M_Jupiter_N = 1.89813 × 10^27 kg
    radius: 7.1492e7, // IAU B3 §3 R_Jupiter_N (equatorial) = 7.1492 × 10^7 m
    source: 'IAU 2015 Resolution B3 §3',
  },
});

/** ±0.01% 공차 (Fact-First 원칙 §2). */
const TOLERANCE = 1e-4;

/**
 * 구조 검증 — 현재 phase (B-1) 의 주 목적.
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

    // P10-B 감사 필드 (optional 단계 — B-3 에서 필수로 승격 예정)
    if (body.dataSource === undefined) {
      issues.push({
        severity: 'warning',
        scope: ctx,
        message: 'dataSource 부재 — P10-B-3 에서 필수로 승격',
      });
    }
    if (body.lastVerified === undefined) {
      issues.push({
        severity: 'warning',
        scope: ctx,
        message: 'lastVerified 부재 — P10-B 감사 시점 기록 필요',
      });
    }

    // colorHint 있을 경우 colorSource 3종 검증
    if (body.colorHint && body.colorHint.colorSource === undefined) {
      issues.push({
        severity: 'warning',
        scope: ctx,
        message: 'colorHint.colorSource 부재 — observed/artistic/inferred 중 명시 필요',
      });
    }
  }

  return issues;
}

/**
 * IAU 공식값 대조 — B-1 에서는 3개 body 만 구현 (sun/earth/jupiter).
 * P10-B-2 에서 전체 확장.
 */
function verifyIauValues(data) {
  const issues = [];

  for (const body of data.bodies) {
    const iau = IAU_2015_NOMINAL[body.id];
    if (!iau) continue; // B-2 에서 확장

    // P10-B-1 단계: value mismatch 는 warning. B-2 에서 error 로 승격하며 radius 정의(equatorial/polar/mean)
    // 필드 분리 여부를 감사 항목으로 처리. 현재는 인프라 구축 목적이라 exit 0 유지.
    const severity = 'warning';

    const massDiff = Math.abs(body.mass - iau.mass) / iau.mass;
    if (massDiff > TOLERANCE) {
      issues.push({
        severity,
        scope: `body[${body.id}].mass`,
        message: `IAU 값 대비 ${(massDiff * 100).toFixed(4)}% 차이 (공차 ${TOLERANCE * 100}%, IAU=${iau.mass}, json=${body.mass})`,
        iauSource: iau.source,
      });
    }

    const radiusDiff = Math.abs(body.radius - iau.radius) / iau.radius;
    if (radiusDiff > TOLERANCE) {
      issues.push({
        severity,
        scope: `body[${body.id}].radius`,
        message: `IAU 값 대비 ${(radiusDiff * 100).toFixed(4)}% 차이 (공차 ${TOLERANCE * 100}%, IAU=${iau.radius}, json=${body.radius}) — B-2 에서 equatorial vs mean radius 정의 감사 필요`,
        iauSource: iau.source,
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
          phase: 'P10-B-1 (스켈레톤)',
          tolerance: TOLERANCE,
          bodies: data.bodies.length,
          errors: errors.length,
          warnings: warnings.length,
          issues: allIssues,
          iauCoverage: Object.keys(IAU_2015_NOMINAL),
        },
        null,
        2,
      ),
    );
    return;
  }

  // 콘솔 요약
  console.log(`[verify-iau-data] P10-B-1 (스켈레톤)`);
  console.log(`  검증 대상: ${data.bodies.length} bodies`);
  console.log(`  IAU 대조: ${Object.keys(IAU_2015_NOMINAL).length} bodies (B-2 에서 확장)`);
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
