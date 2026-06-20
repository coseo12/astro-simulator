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
  it('현재 박제: R1~R9 (sun~triton) + R10a 왜소행성 5 + R10b 혜성 3 + R11 토성 위성 3 순서로 정확히 30개', () => {
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
      'enceladus', // R11 #721 — 토성계 위성 3 (데이터 등장 순, titan 다음 uranus 전)
      'rhea',
      'iapetus',
      'uranus',
      'titania',
      'neptune',
      'triton',
      'ceres', // R10a #659 — 왜소행성 5 (데이터 등장 순)
      'pluto',
      'haumea',
      'makemake',
      'eris',
      'halley', // R10b #664 — 혜성 3 (데이터 등장 순)
      'encke',
      'swift-tuttle',
    ]);
  });

  it('Object.freeze 로 런타임 변경 불가능', () => {
    expect(Object.isFrozen(R_PHASE_BODY_ALLOWLIST)).toBe(true);
  });

  it('자동 생성 결과 30개 (CURRENT_R_PHASE=12 필터 — R11 토성 위성 3 자동 포함)', () => {
    // #613 — 하드코딩 → introducedInRPhase 데이터 필터 자동 생성. R11 #721 진입 30개 (위 toEqual).
    expect(R_PHASE_BODY_ALLOWLIST.length).toBe(30);
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

  it('CURRENT_R_PHASE 는 12 (R11 토성계 위성 3 까지 — 로드맵 v3 완주 후 신규 콘텐츠 라운드)', () => {
    expect(CURRENT_R_PHASE).toBe(12);
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

  it('R7 시뮬레이션 — phase 7 은 saturn + titan 까지 15개 (R11 위성 3 = phase 12 자동 제외)', () => {
    // R11 #721 — enceladus/rhea/iapetus 가 데이터상 titan 다음 위치하나 introducedInRPhase=12 > 7
    // 이라 phase 7 필터에서 자동 제외 → R7 시뮬 길이 15 불변 (회귀 0, 데이터 순서 비종속 입증).
    const r7 = filterBodiesByPhase(bodies, 7);
    expect(r7.length).toBe(15);
    expect(r7).toContain('saturn');
    expect(r7).toContain('titan');
    expect(r7).not.toContain('enceladus'); // R11 위성 — phase 12, phase 7 제외
    expect(r7).not.toContain('rhea');
    expect(r7).not.toContain('iapetus');
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

  it('R9 시뮬레이션 — phase 9 는 19개 (neptune + triton 까지, 왜소행성/혜성 제외)', () => {
    const r9 = filterBodiesByPhase(bodies, 9);
    expect(r9.length).toBe(19);
    expect(r9).toContain('neptune');
    expect(r9).toContain('triton');
    expect(r9).not.toContain('ceres');
    expect(r9).not.toContain('pluto');
  });

  it('R10a 시뮬레이션 — phase 10 고정은 24개 (혜성 3 제외 — R10a/R10b 경계 가드 유지)', () => {
    // R10b #664 진입 후에도 phase 10 고정 시뮬레이션은 24 body — 분리 메커니즘 경계 가드.
    const r10 = filterBodiesByPhase(bodies, 10);
    expect(r10.length).toBe(24);
    for (const id of ['ceres', 'pluto', 'haumea', 'makemake', 'eris']) {
      expect(r10).toContain(id);
    }
    for (const id of ['halley', 'encke', 'swift-tuttle']) {
      expect(r10, `${id} 는 phase 11 (R10b) — phase 10 제외`).not.toContain(id);
    }
  });

  it('R10b — phase 11 고정 시뮬은 27 body (R11 위성 3 = phase 12 제외 — R10b/R11 경계 가드)', () => {
    // R11 #721 진입 후에도 phase 11 고정 시뮬레이션은 27 body — 분리 메커니즘 경계 가드 (R10a phase 10 = 24 동형).
    const r11 = filterBodiesByPhase(bodies, 11);
    expect(r11.length).toBe(27);
    expect(r11).toContain('halley');
    expect(r11).toContain('swift-tuttle');
    for (const id of ['enceladus', 'rhea', 'iapetus']) {
      expect(r11, `${id} 는 phase 12 (R11) — phase 11 제외`).not.toContain(id);
    }
  });

  it('R11 — phase 12 = 현재 자동 생성 allowlist 와 동치 30 body (위성 3 자동 포함 — CURRENT_R_PHASE=12 1줄 적중)', () => {
    // R10b 의 "phase 11 동치" 테스트를 phase 12 동치로 승격 (ADR 20260620-721 §축 3 — #613 자동 생성 8번째 실전).
    const r12 = filterBodiesByPhase(bodies, 12);
    expect(r12).toEqual([...R_PHASE_BODY_ALLOWLIST]);
    expect(r12.length).toBe(30);
    expect(r12).toContain('enceladus');
    expect(r12).toContain('rhea');
    expect(r12).toContain('iapetus');
  });

  it('혜성 3 body 는 introducedInRPhase === 11 (R10a/R10b 분리 메커니즘 — ADR 20260611-r10a §축 2 재박제 회귀 가드)', () => {
    // 로드맵 라벨 ↔ phase 정수 매핑: phase 10 = R10a 왜소행성 / phase 11 = R10b 혜성 (PM 2026-06-11, #659).
    const comets = bodies.filter((b) => ['halley', 'encke', 'swift-tuttle'].includes(b.id));
    expect(comets.length).toBe(3);
    for (const c of comets) {
      expect(c.introducedInRPhase, `${c.id} 는 R10b (phase 11) 박제여야 함`).toBe(11);
    }
  });

  it('토성계 위성 3 body 는 introducedInRPhase === 12 (R11 #721 — 로드맵 v3 완주 후 신규 콘텐츠 라운드)', () => {
    const saturnMoons = bodies.filter((b) => ['enceladus', 'rhea', 'iapetus'].includes(b.id));
    expect(saturnMoons.length).toBe(3);
    for (const m of saturnMoons) {
      expect(m.introducedInRPhase, `${m.id} 는 R11 (phase 12) 박제여야 함`).toBe(12);
      expect(m.parentId, `${m.id} parent 는 saturn`).toBe('saturn');
    }
  });

  it('모든 body 에 introducedInRPhase 부여 (1~12 범위 — phase 12 = R11 토성 위성)', () => {
    for (const b of bodies) {
      expect(b.introducedInRPhase, `${b.id} introducedInRPhase 누락`).toBeGreaterThanOrEqual(1);
      expect(b.introducedInRPhase, `${b.id} introducedInRPhase 범위 초과`).toBeLessThanOrEqual(12);
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
    expect(isRPhaseFocusable('enceladus')).toBe(true); // R11 #721 — 토성계 위성 3 (URL/클릭 진입)
    expect(isRPhaseFocusable('rhea')).toBe(true); // R11 #721
    expect(isRPhaseFocusable('iapetus')).toBe(true); // R11 #721
    expect(isRPhaseFocusable('uranus')).toBe(true); // R8 #647
    expect(isRPhaseFocusable('titania')).toBe(true); // R8 #647
    expect(isRPhaseFocusable('neptune')).toBe(true); // R9 #653
    expect(isRPhaseFocusable('triton')).toBe(true); // R9 #653 — 역행 위성 첫 사례 (focus 가능 여부는 궤도 방향 무관)
    expect(isRPhaseFocusable('ceres')).toBe(true); // R10a #659 — 왜소행성 5 (negative → positive 전환)
    expect(isRPhaseFocusable('pluto')).toBe(true); // R10a #659
    expect(isRPhaseFocusable('haumea')).toBe(true); // R10a #659
    expect(isRPhaseFocusable('makemake')).toBe(true); // R10a #659
    expect(isRPhaseFocusable('eris')).toBe(true); // R10a #659
    expect(isRPhaseFocusable('halley')).toBe(true); // R10b #664 — 혜성 3 (negative → positive 전환, 역행 i 162.26°)
    expect(isRPhaseFocusable('encke')).toBe(true); // R10b #664
    expect(isRPhaseFocusable('swift-tuttle')).toBe(true); // R10b #664 — 전 데이터 소진 (미진입 body 0)
  });

  it('allowlist 외 가상 ID 는 false (R10b #664 — 미진입 실데이터 0, 가상 ID 로 membership 가드 영구 보존)', () => {
    // ADR 20260612-r10b §축 5 ① — phase 11 진입으로 미진입 실데이터 body 가 소멸 →
    // membership 가드 negative 를 가상 ID 로 전환 (phase 진행 영구 비종속, agy 1순위 권고).
    // ⚠️ 'nonexistent-body' 류 가상 ID 는 미래 phase 12+ 에서 실데이터 등록 금지 (ADR §재검토 #7).
    expect(isRPhaseFocusable('nonexistent-body')).toBe(false);
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
    // capture group [1] 은 위 toBeTruthy 로 match 존재 보장 + 정규식에 캡처 그룹이 있어 항상 존재
    // (noUncheckedIndexedAccess 로 string|undefined 추론되므로 non-null assertion).
    const focusBodies = match![1]!
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
    return match![1]!
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

  it('현재 shortcut 노출 = sun~pluto + halley 전부 활성 (R10b #664 — halley 승격 15버튼, 비활성 0)', () => {
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
      'pluto', // R10a #659 — showInShortcutBar false → true 승격 (PM Q3=A — pluto 만, §축 4)
      'halley', // R10b #664 — showInShortcutBar false → true 승격 (PM Q2=A — halley 만, 비-행성 후미 컨벤션 §축 6)
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
      'pluto', // R10a #659
      'halley', // R10b #664
    ]);
    // R10b — encke/swift-tuttle 는 "focus 가능 + bar 미등록" (#617 직교 축 — ceres 등 4 body 와
    // 동일 분류 합류). shortcutDisabled 는 여전히 빈 배열 — phase 11 진입으로 미진입 실데이터 0
    // (전 데이터 소진). negative 는 가상 ID (membership 가드) + vi.mock (UI 계약) 이 승계 — §축 5.
    expect(shortcutDisabled).toEqual([]);
  });

  it('R10a #659 — ceres/haumea/makemake/eris 는 focus 가능 + bar 미등록 (#617 직교 축 negative)', () => {
    for (const id of ['ceres', 'haumea', 'makemake', 'eris']) {
      const body = bodies.find((b) => b.id === id);
      expect(body?.introducedInRPhase, `${id} 는 R10a (phase 10) 진입`).toBe(10);
      expect(body?.showInShortcutBar, `${id} 는 bar 미등록 (URL ?focus= 진입만)`).toBe(false);
    }
  });

  it('R10b #664 — encke/swift-tuttle 는 focus 가능 + bar 미등록 (#617 직교 축 negative 합류)', () => {
    for (const id of ['encke', 'swift-tuttle']) {
      const body = bodies.find((b) => b.id === id);
      expect(body?.introducedInRPhase, `${id} 는 R10b (phase 11) 진입`).toBe(11);
      expect(body?.showInShortcutBar, `${id} 는 bar 미등록 (URL ?focus= 진입만 — PM Q2=A)`).toBe(
        false,
      );
    }
  });

  it('FOCUS_BUTTONS(focus-quick-buttons.tsx) 의 id 가 showInShortcutBar 파생과 일치', () => {
    const source = fs.readFileSync(
      path.join(REPO_ROOT, 'apps/web/src/components/layout/focus-quick-buttons.tsx'),
      'utf-8',
    );
    const block = source.match(/const\s+FOCUS_BUTTONS\s*=\s*\[([\s\S]+?)\];/);
    expect(block, 'FOCUS_BUTTONS 선언을 찾지 못함').toBeTruthy();
    const ids = [...block![1]!.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]);
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
      return m![1]!
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter((s) => s.length > 0);
    };
    expect(extract('RPHASE_EXPECTED_ENABLED')).toEqual(shortcutEnabled);
    expect(extract('RPHASE_SHORTCUT_EXPECTED_DISABLED')).toEqual(shortcutDisabled);
  });
});
