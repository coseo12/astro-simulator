import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  R_PHASE_BODY_ALLOWLIST,
  isRPhaseFocusable,
  CURRENT_R_PHASE,
  filterBodiesByPhase,
} from './r-phase-allowlist.js';
import { getSolarSystem } from '../ephemeris/solar-system-loader.js';

/**
 * #402 R-Phase Body Focus Allowlist SSoT 단위 테스트.
 *
 * ADR `20260504-r-phase-allowlist-guard.md` §결정 1 (SSoT 박제) + §결정 3 (focusOn 가드 helper) 검증.
 *
 * #598 — `apps/web/scripts/browser-verify-378-focus.mjs` FOCUS_BODIES 정적 매칭 가드 추가.
 * R-Phase 진입 시 동기화 누락 drift 차단 (R4 머지 시점 잔존 drift 재발 방지).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');

describe('R_PHASE_BODY_ALLOWLIST — SSoT 박제값', () => {
  it('현재 박제: R1 sun + R2 mercury + R3 venus + R4 earth + moon + R5 mars + phobos + deimos 순서로 정확히 8개', () => {
    expect(R_PHASE_BODY_ALLOWLIST).toEqual([
      'sun',
      'mercury',
      'venus',
      'earth',
      'moon',
      'mars',
      'phobos',
      'deimos',
    ]);
  });

  it('Object.freeze 로 런타임 변경 불가능', () => {
    expect(Object.isFrozen(R_PHASE_BODY_ALLOWLIST)).toBe(true);
  });

  it('자동 생성 결과 8개 (CURRENT_R_PHASE=5 필터)', () => {
    // #613 — 하드코딩 → introducedInRPhase 데이터 필터 자동 생성. 회귀 0 (위 toEqual 8개).
    expect(R_PHASE_BODY_ALLOWLIST.length).toBe(8);
  });
});

/**
 * #613 — `introducedInRPhase` 메타데이터 SSoT 자동 생성 검증.
 *
 * ADR `20260604-613-r-phase-metadata-ssot.md` §결정 C/E/F. `R_PHASE_BODY_ALLOWLIST` 는
 * `solar-system.json` body 의 `introducedInRPhase <= CURRENT_R_PHASE` 필터로 자동 생성.
 * `filterBodiesByPhase` 순수 함수로 R6+ 진입을 시뮬레이션해 마이그레이션 안전성을 박제한다.
 */
describe('#613 — introducedInRPhase 자동 생성 SSoT', () => {
  const bodies = getSolarSystem().bodies;

  it('CURRENT_R_PHASE 는 5 (R5 mars + phobos + deimos 까지)', () => {
    expect(CURRENT_R_PHASE).toBe(5);
  });

  it('filterBodiesByPhase(5) == 현재 자동 생성 allowlist (회귀 0)', () => {
    expect(filterBodiesByPhase(bodies, CURRENT_R_PHASE)).toEqual([...R_PHASE_BODY_ALLOWLIST]);
  });

  it('R1 시뮬레이션 — phase 1 은 sun 1개', () => {
    expect(filterBodiesByPhase(bodies, 1)).toEqual(['sun']);
  });

  it('R4 시뮬레이션 — phase 4 는 sun~moon 5개', () => {
    expect(filterBodiesByPhase(bodies, 4)).toEqual(['sun', 'mercury', 'venus', 'earth', 'moon']);
  });

  it('R6 시뮬레이션 — phase 6 진입 시 jupiter + galilean 4 자동 포함 (코드 변경 0)', () => {
    expect(filterBodiesByPhase(bodies, 6)).toEqual([
      'sun',
      'mercury',
      'venus',
      'earth',
      'moon',
      'mars',
      'phobos',
      'deimos',
      'jupiter',
      'io',
      'europa',
      'ganymede',
      'callisto',
    ]);
  });

  it('R10 시뮬레이션 — phase 10 은 전체 24 body (데이터 전부 부여 확인)', () => {
    expect(filterBodiesByPhase(bodies, 10).length).toBe(24);
  });

  it('모든 body 에 introducedInRPhase 부여 (1~10 범위)', () => {
    for (const b of bodies) {
      expect(b.introducedInRPhase, `${b.id} introducedInRPhase 누락`).toBeGreaterThanOrEqual(1);
      expect(b.introducedInRPhase, `${b.id} introducedInRPhase 범위 초과`).toBeLessThanOrEqual(10);
    }
  });
});

describe('isRPhaseFocusable — focusOn 가드 helper', () => {
  it('allowlist 박제 body 는 true (sun / mercury / venus / earth / moon / mars / phobos / deimos)', () => {
    expect(isRPhaseFocusable('sun')).toBe(true);
    expect(isRPhaseFocusable('mercury')).toBe(true);
    expect(isRPhaseFocusable('venus')).toBe(true);
    expect(isRPhaseFocusable('earth')).toBe(true);
    expect(isRPhaseFocusable('moon')).toBe(true);
    expect(isRPhaseFocusable('mars')).toBe(true); // R5 #594
    expect(isRPhaseFocusable('phobos')).toBe(true); // R5 #594
    expect(isRPhaseFocusable('deimos')).toBe(true); // R5 #594
  });

  it('allowlist 외 body 는 false (jupiter / neptune / saturn / io)', () => {
    expect(isRPhaseFocusable('jupiter')).toBe(false);
    expect(isRPhaseFocusable('neptune')).toBe(false);
    expect(isRPhaseFocusable('saturn')).toBe(false);
    expect(isRPhaseFocusable('io')).toBe(false); // R6 galilean 진입 전
  });

  it('null 은 true — resetCamera / free-fly 경로 차단 금지 (ADR §결정 3)', () => {
    expect(isRPhaseFocusable(null)).toBe(true);
  });

  it('undefined 도 true — resetCamera 동등 처리 (defensive)', () => {
    expect(isRPhaseFocusable(undefined)).toBe(true);
  });

  it('빈 문자열 / 알 수 없는 body 는 false', () => {
    expect(isRPhaseFocusable('')).toBe(false);
    expect(isRPhaseFocusable('unknown-body')).toBe(false);
  });
});

/**
 * #598 — browser-verify-378-focus.mjs `FOCUS_BODIES` 정적 매칭 가드.
 *
 * R-Phase 진입 시 R_PHASE_BODY_ALLOWLIST 갱신만 하고 browser-verify 스크립트의
 * 하드코딩 list 갱신을 누락하면 verify 매트릭스가 stale 상태로 잠복.
 * 실제 R4 (#532) 머지 시점에 R3 baseline 잔존 (3 body) 드리프트 발생 — R5 (#594) PR 에서
 * 누적 동시 처리 (8 body) 로 해소했으나, 본 가드는 재발 방지 (정적 매칭, CI fail-fast).
 */
describe('#598 — browser-verify-378-focus.mjs FOCUS_BODIES SSoT 정합', () => {
  const verifyScriptPath = path.join(REPO_ROOT, 'apps/web/scripts/browser-verify-378-focus.mjs');

  it('verify 스크립트 파일이 존재한다', () => {
    expect(fs.existsSync(verifyScriptPath)).toBe(true);
  });

  it('FOCUS_BODIES 가 R_PHASE_BODY_ALLOWLIST 와 정확히 일치한다 (drift 0)', () => {
    const source = fs.readFileSync(verifyScriptPath, 'utf-8');
    const match = source.match(/const\s+FOCUS_BODIES\s*=\s*\[([^\]]+)\]/);
    expect(match, 'FOCUS_BODIES 선언 패턴을 찾지 못함').toBeTruthy();
    const focusBodies = match![1]
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter((s) => s.length > 0);
    expect(focusBodies).toEqual([...R_PHASE_BODY_ALLOWLIST]);
  });
});
