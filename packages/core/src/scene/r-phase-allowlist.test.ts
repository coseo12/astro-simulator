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
  it('현재 박제: R1~R8 (sun~titania) + R9 neptune + triton 순서로 정확히 19개', () => {
    expect(R_PHASE_BODY_ALLOWLIST).toEqual([
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
      'saturn',
      'titan',
      'uranus',
      'titania',
      'neptune',
      'triton',
    ]);
  });

  it('Object.freeze 로 런타임 변경 불가능', () => {
    expect(Object.isFrozen(R_PHASE_BODY_ALLOWLIST)).toBe(true);
  });

  it('자동 생성 결과 19개 (CURRENT_R_PHASE=9 필터)', () => {
    // #613 — 하드코딩 → introducedInRPhase 데이터 필터 자동 생성. R9 #653 진입 19개 (위 toEqual).
    expect(R_PHASE_BODY_ALLOWLIST.length).toBe(19);
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

  it('CURRENT_R_PHASE 는 9 (R9 neptune + triton 까지 — 로드맵 마지막 행성)', () => {
    expect(CURRENT_R_PHASE).toBe(9);
  });

  it('filterBodiesByPhase(CURRENT_R_PHASE) == 현재 자동 생성 allowlist (회귀 0)', () => {
    expect(filterBodiesByPhase(bodies, CURRENT_R_PHASE)).toEqual([...R_PHASE_BODY_ALLOWLIST]);
  });

  it('R1 시뮬레이션 — phase 1 은 sun 1개', () => {
    expect(filterBodiesByPhase(bodies, 1)).toEqual(['sun']);
  });

  it('R4 시뮬레이션 — phase 4 는 sun~moon 5개', () => {
    expect(filterBodiesByPhase(bodies, 4)).toEqual(['sun', 'mercury', 'venus', 'earth', 'moon']);
  });

  it('R6 시뮬레이션 — phase 6 은 jupiter + galilean 4 까지 13개 (saturn/titan 제외)', () => {
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

  it('R7 시뮬레이션 — phase 7 은 saturn + titan 까지 15개 (uranus/titania 제외)', () => {
    const r7 = filterBodiesByPhase(bodies, 7);
    expect(r7.length).toBe(15);
    expect(r7).toContain('saturn');
    expect(r7).toContain('titan');
    expect(r7).not.toContain('uranus');
    expect(r7).not.toContain('titania');
  });

  it('R8 시뮬레이션 — phase 8 은 uranus + titania 까지 17개 (neptune/triton 제외)', () => {
    const r8 = filterBodiesByPhase(bodies, 8);
    expect(r8.length).toBe(17);
    expect(r8).toContain('uranus');
    expect(r8).toContain('titania');
    expect(r8).not.toContain('neptune');
    expect(r8).not.toContain('triton');
  });

  it('R9 시뮬레이션 — phase 9 진입 시 neptune + triton 자동 포함 (CURRENT_R_PHASE 1줄, 코드 변경 0)', () => {
    expect(filterBodiesByPhase(bodies, 9)).toEqual([...R_PHASE_BODY_ALLOWLIST]);
    expect(filterBodiesByPhase(bodies, 9)).toContain('neptune');
    expect(filterBodiesByPhase(bodies, 9)).toContain('triton');
  });

  it('R10 시뮬레이션 — phase 10 은 전체 27 body (R9 triton 추가 후 데이터 전부 부여 확인)', () => {
    expect(filterBodiesByPhase(bodies, 10).length).toBe(27);
  });

  it('모든 body 에 introducedInRPhase 부여 (1~10 범위)', () => {
    for (const b of bodies) {
      expect(b.introducedInRPhase, `${b.id} introducedInRPhase 누락`).toBeGreaterThanOrEqual(1);
      expect(b.introducedInRPhase, `${b.id} introducedInRPhase 범위 초과`).toBeLessThanOrEqual(10);
    }
  });
});

describe('isRPhaseFocusable — focusOn 가드 helper', () => {
  it('allowlist 박제 body 는 true (sun~deimos + R6 jupiter + galilean 4)', () => {
    expect(isRPhaseFocusable('sun')).toBe(true);
    expect(isRPhaseFocusable('mercury')).toBe(true);
    expect(isRPhaseFocusable('venus')).toBe(true);
    expect(isRPhaseFocusable('earth')).toBe(true);
    expect(isRPhaseFocusable('moon')).toBe(true);
    expect(isRPhaseFocusable('mars')).toBe(true); // R5 #594
    expect(isRPhaseFocusable('phobos')).toBe(true); // R5 #594
    expect(isRPhaseFocusable('deimos')).toBe(true); // R5 #594
    expect(isRPhaseFocusable('jupiter')).toBe(true); // R6 #621
    expect(isRPhaseFocusable('io')).toBe(true); // R6 #621
    expect(isRPhaseFocusable('europa')).toBe(true); // R6 #621
    expect(isRPhaseFocusable('ganymede')).toBe(true); // R6 #621
    expect(isRPhaseFocusable('callisto')).toBe(true); // R6 #621
    expect(isRPhaseFocusable('saturn')).toBe(true); // R7 #641
    expect(isRPhaseFocusable('titan')).toBe(true); // R7 #641
    expect(isRPhaseFocusable('uranus')).toBe(true); // R8 #647
    expect(isRPhaseFocusable('titania')).toBe(true); // R8 #647
    expect(isRPhaseFocusable('neptune')).toBe(true); // R9 #653
    expect(isRPhaseFocusable('triton')).toBe(true); // R9 #653 — 역행 위성 첫 사례 (focus 가능 여부는 궤도 방향 무관)
  });

  it('allowlist 외 body 는 false (pluto / ceres — R10 진입 전)', () => {
    expect(isRPhaseFocusable('pluto')).toBe(false); // R10 진입 전
    expect(isRPhaseFocusable('ceres')).toBe(false); // R10 진입 전
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

/**
 * #619 — `r1-ui-regression-guard.mjs` `targetIds` 정적 매칭 가드.
 *
 * px-ratio 측정 대상 `targetIds` 는 R-Phase 진입 body 집합(= R_PHASE_BODY_ALLOWLIST)과 정합해야
 * 하나 #598 가드 비대상이라 R6 진입 시 조용히 정체할 수 있다 (volt #69 은닉 상수 4번째 사본).
 * 본 정적 가드로 자동 생성 allowlist ↔ targetIds 하드코딩 정합을 CI fail-fast 차단.
 */
describe('#619 — r1-ui-regression-guard.mjs targetIds SSoT 정합', () => {
  const guardPath = path.join(REPO_ROOT, 'apps/web/scripts/r1-ui-regression-guard.mjs');

  function extractArray(source: string, name: string): string[] {
    const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*\\[([^\\]]+)\\]`));
    expect(match, `${name} 선언 패턴을 찾지 못함`).toBeTruthy();
    return match![1]
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter((s) => s.length > 0);
  }

  it('targetIds 가 R_PHASE_BODY_ALLOWLIST 와 정확히 일치한다 (drift 0)', () => {
    const source = fs.readFileSync(guardPath, 'utf-8');
    expect(extractArray(source, 'targetIds')).toEqual([...R_PHASE_BODY_ALLOWLIST]);
  });
});

/**
 * #617 — shortcut bar 노출 목록 (`showInShortcutBar` 메타) 정적 매칭 가드.
 *
 * "focus 가능"(introducedInRPhase)과 직교 축 — satellite(phobos/deimos)는 focus 가능하나
 * shortcut bar 미등록 (R5 Q4a=A). `showInShortcutBar` 데이터 메타를 SSoT 로,
 * `FOCUS_BUTTONS`(렌더) / `RPHASE_EXPECTED_ENABLED|DISABLED`(verify) 하드코딩과 정합 차단.
 * (렌더 자동 생성은 비목표 — UI 무변경 + verify 격리성 유지, ADR #613 §결정 D 패턴 정합.)
 */
describe('#617 — showInShortcutBar 메타 SSoT 정합', () => {
  const bodies = getSolarSystem().bodies;
  const shortcutBodies = bodies.filter((b) => b.showInShortcutBar).map((b) => b.id);
  const shortcutEnabled = bodies
    .filter((b) => b.showInShortcutBar && b.introducedInRPhase <= CURRENT_R_PHASE)
    .map((b) => b.id);
  const shortcutDisabled = bodies
    .filter((b) => b.showInShortcutBar && b.introducedInRPhase > CURRENT_R_PHASE)
    .map((b) => b.id);

  it('현재 shortcut 노출 = sun~neptune 전부 활성 (R9 — 로드맵 마지막 행성 진입, 비활성 0)', () => {
    expect(shortcutBodies).toEqual([
      'sun',
      'mercury',
      'venus',
      'earth',
      'moon',
      'mars',
      'jupiter',
      'saturn', // R7 #641 — showInShortcutBar false → true 전환 (§축 5)
      'uranus', // R8 #647 — showInShortcutBar false → true 전환 (§축 5)
      'neptune', // R9 #653 — 이미 true (배열 변경 0, #613 Concrete Prediction — CURRENT_R_PHASE=9 1줄 자동 enabled)
    ]);
    expect(shortcutEnabled).toEqual([
      'sun',
      'mercury',
      'venus',
      'earth',
      'moon',
      'mars',
      'jupiter',
      'saturn',
      'uranus',
      'neptune',
    ]);
    // R9 — R10 8 body (왜소행성·혜성) 전부 showInShortcutBar=false → bar 비활성 대표 구조 소멸.
    // negative 케이스는 browser-verify CelestialTree 5-B/5-C (pluto) + preset 6-G (pluto-x10) 보존.
    expect(shortcutDisabled).toEqual([]);
  });

  it('FOCUS_BUTTONS(focus-quick-buttons.tsx) 의 id 가 showInShortcutBar 파생과 일치', () => {
    const source = fs.readFileSync(
      path.join(REPO_ROOT, 'apps/web/src/components/layout/focus-quick-buttons.tsx'),
      'utf-8',
    );
    const block = source.match(/const\s+FOCUS_BUTTONS\s*=\s*\[([\s\S]+?)\];/);
    expect(block, 'FOCUS_BUTTONS 선언을 찾지 못함').toBeTruthy();
    const ids = [...block![1].matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(ids).toEqual(shortcutBodies);
  });

  it('RPHASE_EXPECTED_ENABLED / SHORTCUT_DISABLED(browser-verify) 가 showInShortcutBar 파생과 일치', () => {
    const source = fs.readFileSync(
      path.join(REPO_ROOT, 'apps/web/scripts/browser-verify-r-phase-allowlist.mjs'),
      'utf-8',
    );
    // R9 #653 — 빈 배열 (`[]`) 허용 위해 quantifier `[^\]]*` 사용 (R10 body 전부 bar 미등록이라
    // shortcut disabled 가 구조 소멸 — tree/preset negative 는 별도 보존).
    const extract = (name: string) => {
      const m = source.match(new RegExp(`const\\s+${name}\\s*=\\s*\\[([^\\]]*)\\]`));
      expect(m, `${name} 선언을 찾지 못함`).toBeTruthy();
      return m![1]
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter((s) => s.length > 0);
    };
    expect(extract('RPHASE_EXPECTED_ENABLED')).toEqual(shortcutEnabled);
    expect(extract('RPHASE_SHORTCUT_EXPECTED_DISABLED')).toEqual(shortcutDisabled);
  });
});
