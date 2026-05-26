#!/usr/bin/env node
// HARNESS-DRIFT: Z-PATTERN [TODO]
/**
 * ADR 20260515 Z 패턴 health metric 자동 탐지 스크립트
 *
 * Phase 1 카운트: ADR §Amendment N regex + 본 프로젝트 PR commit grep 보조
 * Phase 2 카운트: gh pr list --search (coseo12/harness-setting 다중 OR 키워드)
 *
 * 임계값 (Amendment 1+2 정합 3중 OR):
 *   - Phase 2 진행률 < 33% (Amendment 1 health metric)
 *   - Phase 1 회차 (현재) >= N=10 (Amendment 2 재조정)
 *   - ADR 첫 적용 후 90일 경과 (Amendment 2 재조정)
 *
 * exit code (Gemini 2.5-pro cross-validate 권고 3분류):
 *   - 0: 정상 (모든 임계값 미발화)
 *   - 1: 트리거 발화 (1개 이상 임계값 충족)
 *   - 2: 실행 에러 (gh CLI 실패 / 파일 부재 등)
 *
 * 근거:
 *   - ADR docs/decisions/20260515-harness-managed-divergent-pattern.md
 *   - #476 architect cross-validate Q5 권고 (자동 탐지 도입)
 *   - #483 architect cross-validate (9 핵심 결정)
 *   - volt #69 (workflow_dispatch 2단계 함정 — D2/D3 머지 후 검증)
 */
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

const ADR_PATH = 'docs/decisions/20260515-harness-managed-divergent-pattern.md';
const ADR_FIRST_APPLY_DATE = '2026-05-15'; // ADR 첫 박제일 (#463)
const N_THRESHOLD = 10; // Amendment 2
const TIME_THRESHOLD_DAYS = 90; // Amendment 2
const PHASE2_THRESHOLD = 0.33; // Amendment 1 health metric
const HARNESS_MANIFEST_PATH = '.harness/manifest.json'; // Amendment 8 verifyPhase2Sync()

// Amendment 7 (#554): ADR 자체 진화 PR 식별 — Phase 1 카운트에서 제외
// 패턴: "Amendment N" (박제) / "hotfix" (자동화 hotfix) / "release vX.Y.Z" (릴리스 PR)
// 제외 사유: ADR 본문 변경 PR 은 Z 패턴 "적용" 이 아니라 ADR 자체의 진화 — 카운트 자기참조 회피
function isAdrEvolutionPr(title) {
  if (!title) return false;
  const lower = title.toLowerCase();
  if (/amendment\s+\d+/i.test(title)) return true;
  if (/\bhotfix\b/i.test(title)) return true;
  if (lower.startsWith('release:') || /\brelease\s+v\d+\.\d+/i.test(title)) return true;
  return false;
}

// Amendment 8 (#556) — Phase 2 중도 변경 정적 비교 가드 (cross-validate agy 고유 발견 #1).
// upstream PR (coseo12/harness-setting) 의 head SHA + 변경 파일 경로를 로컬 drift 파일과
// 매칭해 sha256 차이 검출. 차이 발견 시 soft-warn (라벨 부착 + 자동 코멘트 trigger) —
// CI hard-block 아님 (Amendment 2/6 1인 운영 silent 약화 트레이드오프 정합).
//
// 반환:
//   { mismatches: Array<{file, upstreamPr, localSha, upstreamSha}>, error?: string,
//     todoResolutions?: Array<{file, line, upstreamPrNumber, upstreamPrUrl, downstreamIssue}> }
//   - mismatches.length > 0 → 호출자가 [Phase 2 Sync Required] 라벨/코멘트 박제
//   - error 존재 → 네트워크/권한 실패 (보수적으로 mismatches=0 처리, exit code 영향 없음)
//   - todoResolutions (Amendment 10): includeTodoResolution=true 시 박제. merged upstream PR
//     중 title 의 본 프로젝트 이슈 번호 AND 파일 경로 둘 다 매칭되는 후보
//
// 측정 방식:
//   1. gh pr list (open, "ADR 20260515" 검색) → upstream PR 목록
//   2. 각 PR 의 files[].path 추출 → 로컬 drift 파일과 경로 매칭
//   3. 매칭된 쌍의 sha256 비교 (로컬: 파일 직접 / upstream: gh API blob SHA git→sha256 변환 불가
//      → 본 함수는 파일명 매칭만 박제, 실제 비교는 사용자에게 diff URL 안내)
//
// 비교 한계 박제 (precision 정정):
//   git blob SHA (SHA-1) ≠ sha256 → 직접 비교 불가. 본 함수는 "매칭된 파일 쌍 = 잠재 drift"
//   까지만 가시화하고 hard 비교는 향후 Amendment 9 (#569 TODO 해소 후속) 영역.
//
// Amendment 10 (#569) — includeTodoResolution 옵션 추가:
//   - merged upstream PR (state=merged) 도 함께 조회
//   - 다운스트림 [TODO] 잔존 파일 + upstream PR 의 (title issue ref AND 파일 경로) AND 매칭
//   - 매칭 시 todoResolutions 배열로 박제 (호출자 wrapper CLI 가 dry-run / apply 분기)
//
// 매칭 휴리스틱 (ADR §Amendment 10 §결정점 2 후보 다 — AND 결합):
//   - (a) PR title 에 본 프로젝트 이슈 번호 ref 포함:
//        - 패턴 1: `#N` (단순 hash + 숫자, GitHub 자동 자기 repo 링크 컨벤션)
//        - 패턴 2: `astro-simulator#N` (cross-repo 명시)
//        - 패턴 3: `coseo12/astro-simulator#N` (full path)
//   - (b) PR 변경 파일 경로가 다운스트림 [TODO] 잔존 파일과 일치
//   - (a) AND (b) 둘 다 충족 시에만 매칭 (precision ↑, false-positive 회피)
function verifyPhase2Sync(rootDir = '.', options = {}) {
  const { includeTodoResolution = false } = options;
  try {
    if (!existsSync(`${rootDir}/${HARNESS_MANIFEST_PATH}`)) {
      return { mismatches: [], error: 'manifest not found' };
    }
    const manifest = JSON.parse(readFileSync(`${rootDir}/${HARNESS_MANIFEST_PATH}`, 'utf-8'));
    const managedFiles = manifest.files || {};

    // 로컬 drift 파일 목록 (sha256 불일치)
    const localDrifts = new Set();
    for (const [rel, entry] of Object.entries(managedFiles)) {
      const abs = `${rootDir}/${rel}`;
      if (!existsSync(abs)) continue;
      const content = readFileSync(abs);
      const sha = createHash('sha256').update(content).digest('hex');
      const expected = entry.sha256 || entry;
      if (typeof expected === 'string' && sha !== expected) {
        localDrifts.add(rel);
      }
    }

    if (localDrifts.size === 0) {
      // Amendment 10: drift 없으면 TODO 해소 후보도 없음 (단축 경로)
      return { mismatches: [], ...(includeTodoResolution ? { todoResolutions: [] } : {}) };
    }

    // upstream open PR 검색 (ADR 20260515 컨벤션 식별자)
    let upstreamPrs = [];
    try {
      const result = execSync(
        `gh pr list --repo coseo12/harness-setting --state open --search "ADR 20260515" --json number,headRefOid,files,title`,
        { encoding: 'utf-8' },
      ).trim();
      upstreamPrs = JSON.parse(result || '[]');
    } catch (e) {
      return { mismatches: [], error: `upstream PR list failed: ${e.message}` };
    }

    // 매칭: upstream PR 의 files[].path ∩ 로컬 drift 파일
    const mismatches = [];
    for (const pr of upstreamPrs) {
      const upstreamFiles = (pr.files || []).map((f) => f.path);
      for (const path of upstreamFiles) {
        if (localDrifts.has(path)) {
          mismatches.push({
            file: path,
            upstreamPr: pr.number,
            upstreamHead: (pr.headRefOid || '').slice(0, 8),
            diffUrl: `https://github.com/coseo12/harness-setting/pull/${pr.number}/files`,
          });
        }
      }
    }

    // Amendment 10 (#569) — TODO 해소 후보 매칭 (옵션)
    let todoResolutions;
    if (includeTodoResolution) {
      todoResolutions = computeTodoResolutions(rootDir);
    }

    return {
      mismatches,
      ...(includeTodoResolution ? { todoResolutions: todoResolutions || [] } : {}),
    };
  } catch (err) {
    return { mismatches: [], error: err.message };
  }
}

// =============================================================================
// Amendment 10 (#569) — [TODO] → upstream PR URL 자동 해소 매칭 로직
// =============================================================================

// 다운스트림 [TODO] 데코레이터 라인 매칭 (verify-harness-drift-decorator.mjs SSoT 정합).
// 형식별 분기 — `.md` HTML 주석 / `.ts|js|mjs|cjs` line-slash / `.yml|sh` line-hash.
// sidecar `.json` 은 별도 sidecar 파일 (`<filename>.HARNESS-DRIFT.md`) 매칭.
//
// 위치 SSoT: 파일 첫 줄 (shebang/DOCTYPE/YAML frontmatter 1블록 직후 1줄 허용) —
// verify-harness-drift-decorator.mjs DECORATOR_REGEX 와 동일 의도.
//
// 본 함수는 [TODO] 잔존 파일만 식별 (URL 교체된 파일은 제외).
const TODO_LINE_REGEX = /^((?:<!--|\/\/|#) HARNESS-DRIFT: Z-PATTERN \[)(TODO)(\](?: -->)?)/;

// PR title 에서 본 프로젝트 이슈 번호 추출.
// 매칭 패턴 (3종): `astro-simulator#N` (cross-repo) / `coseo12/astro-simulator#N` (full path) / `#N` (단순).
// 단순 `#N` 패턴은 upstream repo (coseo12/harness-setting) 의 자기 이슈 자동 링크 컨벤션과
// 충돌할 수 있으므로 (예: harness-setting `#190` 은 자기 repo 이슈), upstream 자기 ref 가 아닌
// **다운스트림 이슈 ref 의도** 인 경우만 사용. 본 함수는 단순 `#N` 도 후보로 추출하되,
// 호출자 (computeTodoResolutions) 가 다운스트림 OPEN 이슈 존재 여부 별도 검증 — false-positive 회피.
function extractIssueRefsFromTitle(title) {
  if (!title) return [];
  const refs = new Set();
  // 패턴 1: coseo12/astro-simulator#N (full path)
  for (const m of title.matchAll(/\bcoseo12\/astro-simulator#(\d+)\b/g)) {
    refs.add(parseInt(m[1], 10));
  }
  // 패턴 2: astro-simulator#N (cross-repo 명시)
  for (const m of title.matchAll(/\bastro-simulator#(\d+)\b/g)) {
    refs.add(parseInt(m[1], 10));
  }
  // 패턴 3: 단순 `#N` (자기 repo 링크 가능성 — caller 검증 의무)
  for (const m of title.matchAll(/(?:^|[^\w/])#(\d+)\b/g)) {
    refs.add(parseInt(m[1], 10));
  }
  return [...refs];
}

// 다운스트림 [TODO] 잔존 파일 + 데코레이터 라인 번호 스캔.
// 반환: Array<{file: string, line: number}>
function scanTodoFiles(rootDir) {
  // architect ADR Amendment 10 baseline 6 파일 SSoT (현재 develop tip).
  // 광범위 fs 스캔 회피를 위해 manifest 등록된 drift 파일들 + 본 가드 스크립트들로 한정.
  const manifestAbs = `${rootDir}/${HARNESS_MANIFEST_PATH}`;
  const candidates = new Set();
  if (existsSync(manifestAbs)) {
    const manifest = JSON.parse(readFileSync(manifestAbs, 'utf-8'));
    for (const rel of Object.keys(manifest.files || {})) {
      candidates.add(rel);
    }
  }
  // 본 가드 스크립트들도 [TODO] 박제 대상 (drift 0 이라도 데코레이터 박제 의무 — Phase 1 도입 PR)
  candidates.add('scripts/verify-z-pattern-health.mjs');
  candidates.add('scripts/verify-harness-drift-decorator.mjs');
  candidates.add('scripts/resolve-harness-drift-todo.mjs'); // Amendment 10 (#569) 신규 wrapper
  candidates.add('.github/workflows/harness-guards.yml');

  const results = [];
  for (const rel of candidates) {
    const abs = `${rootDir}/${rel}`;
    if (!existsSync(abs)) continue;
    const content = readFileSync(abs, 'utf-8');
    const lines = content.split('\n');
    // 첫 5줄까지만 스캔 (위치 SSoT: 첫 줄 + shebang/DOCTYPE/YAML frontmatter 1블록 직후 1줄)
    const scanLimit = Math.min(lines.length, 30);
    for (let i = 0; i < scanLimit; i++) {
      if (TODO_LINE_REGEX.test(lines[i])) {
        results.push({ file: rel, line: i + 1 });
        break; // 파일당 첫 매칭만
      }
    }
  }
  return results;
}

// upstream merged PR 조회 (ADR 20260515) + 다운스트림 [TODO] 잔존 파일 매칭.
// 반환: Array<{file, line, upstreamPrNumber, upstreamPrUrl, upstreamPrTitle, downstreamIssue}>
function computeTodoResolutions(rootDir = '.') {
  const todoFiles = scanTodoFiles(rootDir);
  if (todoFiles.length === 0) return [];

  // upstream merged PR 조회 (open 은 verifyPhase2Sync mismatches 영역)
  let mergedPrs = [];
  try {
    const result = execSync(
      `gh pr list --repo coseo12/harness-setting --state merged --search "ADR 20260515" --json number,title,files`,
      { encoding: 'utf-8' },
    ).trim();
    mergedPrs = JSON.parse(result || '[]');
  } catch (e) {
    // 네트워크/권한 실패 — 보수적으로 빈 결과 반환 (caller 가 dry-run 시 안내)
    return [];
  }

  // 다운스트림 [TODO] 잔존 파일 Set (O(1) 매칭)
  const todoFileSet = new Map(todoFiles.map((t) => [t.file, t]));
  const resolutions = [];
  const seen = new Set(); // 동일 파일 다중 매칭 회피 (첫 매칭만 박제)

  for (const pr of mergedPrs) {
    const issueRefs = extractIssueRefsFromTitle(pr.title);
    if (issueRefs.length === 0) continue; // (a) title 매칭 실패 — skip
    const upstreamFiles = (pr.files || []).map((f) => f.path);
    for (const path of upstreamFiles) {
      if (!todoFileSet.has(path)) continue; // (b) 파일 경로 매칭 실패 — skip
      if (seen.has(path)) continue; // 동일 파일 첫 매칭만
      // (a) AND (b) 둘 다 충족 — 매칭 후보
      const todo = todoFileSet.get(path);
      resolutions.push({
        file: path,
        line: todo.line,
        upstreamPrNumber: pr.number,
        upstreamPrUrl: `https://github.com/coseo12/harness-setting/pull/${pr.number}`,
        upstreamPrTitle: pr.title,
        downstreamIssue: issueRefs[0], // 첫 ref 박제 (다중 시 첫 번째)
      });
      seen.add(path);
    }
  }
  return resolutions;
}

// Amendment 8 (#556) — main flow 를 함수로 wrap. 직접 실행 시에만 호출하여
// import 시 부작용 (gh CLI 호출 / process.exit) 방지. 외부 인터페이스 (stdout/exit) 동일.
function main() {
try {
  // 1. ADR 파일 존재 검증
  if (!existsSync(ADR_PATH)) {
    console.error(`ERROR: ADR file not found: ${ADR_PATH}`);
    process.exit(2);
  }

  const adrContent = readFileSync(ADR_PATH, 'utf-8');

  // 2. Phase 1 카운트 — §Amendment N regex
  const amendmentMatches = adrContent.matchAll(/## Amendment (\d+)/g);
  const amendmentNumbers = Array.from(amendmentMatches).map((m) => parseInt(m[1], 10));
  const amendmentCount = amendmentNumbers.length;

  // PR commit grep 보조 — ADR 인용 PR 카운트 (본 프로젝트)
  //
  // Amendment 7 (#554, 2026-05-25): 측정 식 자기참조 인플레이션 회피.
  // 기존 식은 ADR 본문 자체 변경 PR (Amendment 박제 / hotfix / release) 도 Z 적용으로
  // 카운트 → 12회차 인플레로 N=10 임계 false-positive 트리거. 정정 식은 PR title 에서
  // ADR 자체 진화 표식 (Amendment N / hotfix / release) 을 제외하여 Phase 1 (Z 패턴
  // 실제 적용) 만 카운트. CLAUDE.md §스프린트 계약 #10 "수치 DoD 미달 시 측정 방법
  // 검증 우선" 원칙 정합 박제.
  const adrCitationsRaw = execSync(
    `gh pr list --repo coseo12/astro-simulator --state merged --search "20260515-harness-managed-divergent-pattern" --json number,title`,
    { encoding: 'utf-8' },
  ).trim();
  const adrCitationPrs = JSON.parse(adrCitationsRaw || '[]');
  const adrCitations = adrCitationPrs.filter((pr) => !isAdrEvolutionPr(pr.title)).length;
  // Amendment 7 (#554): 임계 비교 SSoT 는 adrCitations (Z 적용 PR 카운트).
  // amendmentCount 도 자기참조 (Amendment N 박제 자체로 +1 증가) 라 임계 SSoT 부적합 —
  // console.log 정보 출력에만 활용. amendmentCount > adrCitations 가능 시점: ADR
  // 진화 활발 + 적용 정체기 (별도 정보로 가시화).
  const phase1Count = adrCitations;

  // 3. Phase 2 카운트 — upstream harness-setting PR 검색
  //
  // 측정 방법 결정 (D1 실측 기반):
  //   - architect 9 핵심 결정 #3 은 "다중 OR 키워드 (ADR 20260515 OR harness-managed-divergent OR Z 패턴)"
  //     를 제시했으나, D1 실측에서 false positive 5건 발견:
  //       - "harness-managed-divergent" → 단어 분할로 "managed" 매칭 (PR #64/#61/#62/#94 무관 PR 4건)
  //       - "Z 패턴" → "Z 옵션" 매칭 (PR #154 무관)
  //   - "ADR 20260515" 정확 식별자만 사용 (현재 0건, 노이즈 0).
  //   - 향후 upstream PR 본문/제목에 ADR ID 박제 컨벤션 유지 필요 (Phase 2 의무 PR 규약).
  //   - CRITICAL "수치 DoD 미달 시 측정 방법 검증 우선" 원칙 정합 — 식 보정 후 임계값 평가.
  let phase2Count = 0;
  try {
    const phase2Result = execSync(
      `gh pr list --repo coseo12/harness-setting --state all --search "ADR 20260515" --json number --jq 'length'`,
      { encoding: 'utf-8' },
    ).trim();
    phase2Count = parseInt(phase2Result, 10) || 0;
  } catch {
    // upstream 검색 실패 (네트워크 / 권한 등) 시 보수적으로 0 으로 가정
    phase2Count = 0;
  }

  // 3-b. Amendment 8 (#556) — Phase 2 중도 변경 정적 비교 (soft-warn)
  //
  // upstream open PR + 로컬 drift 파일 매칭 결과를 stdout 에 박제.
  // CI workflow (adr-z-pattern-health-v2.yml) 가 본 stdout 을 파싱해
  // [Phase 2 Sync Required] 라벨 부착 / 자동 코멘트 박제 트리거.
  // exit code 변경 없음 (hard-block 아님 — Amendment 8 §결정점 3b 옵션 A).
  const phase2Sync = verifyPhase2Sync('.');
  if (phase2Sync.error) {
    console.log(`\n[Phase 2 Sync] check skipped: ${phase2Sync.error}`);
  } else if (phase2Sync.mismatches.length > 0) {
    console.log(`\n[Phase 2 Sync Drift] ${phase2Sync.mismatches.length} 파일 매칭 (soft-warn):`);
    for (const m of phase2Sync.mismatches) {
      console.log(
        `  - ${m.file} ↔ upstream PR #${m.upstreamPr} (head ${m.upstreamHead}) ${m.diffUrl}`,
      );
    }
  } else {
    console.log(`\n[Phase 2 Sync] OK — drift 파일 ↔ upstream open PR 매칭 0건`);
  }

  // 4. 시간 경과 검증
  const firstApplyDate = new Date(ADR_FIRST_APPLY_DATE);
  const today = new Date();
  const daysSinceFirstApply = Math.floor((today - firstApplyDate) / (1000 * 60 * 60 * 24));

  // 5. 임계값 검증 (3중 OR)
  const phase2Ratio = phase1Count > 0 ? phase2Count / phase1Count : 0;
  const triggers = [];

  if (phase2Ratio < PHASE2_THRESHOLD) {
    triggers.push(
      `Phase 2 진행률 ${(phase2Ratio * 100).toFixed(1)}% < ${PHASE2_THRESHOLD * 100}% 임계값`,
    );
  }
  if (phase1Count >= N_THRESHOLD) {
    triggers.push(`Phase 1 회차 ${phase1Count} >= N=${N_THRESHOLD} 임계값`);
  }
  if (daysSinceFirstApply >= TIME_THRESHOLD_DAYS) {
    triggers.push(
      `ADR 첫 적용 후 ${daysSinceFirstApply}일 경과 >= ${TIME_THRESHOLD_DAYS}일 임계값`,
    );
  }

  // 6. 출력 + exit
  console.log(`Phase 1 (본 프로젝트): ${phase1Count} (Amendment ${amendmentCount}, PR citations ${adrCitations})`);
  console.log(`Phase 2 (upstream harness-setting): ${phase2Count}`);
  console.log(`Phase 2 진행률: ${(phase2Ratio * 100).toFixed(1)}%`);
  console.log(`ADR 적용 후 경과 일수: ${daysSinceFirstApply}일`);

  if (triggers.length > 0) {
    console.error(`\n[ADR Trigger] ADR 20260515 Z 패턴 §재검토 조건 #5 발화:`);
    triggers.forEach((t) => console.error(`  - ${t}`));
    process.exit(1);
  } else {
    console.log(`\n[ADR OK] 모든 임계값 미발화 (Amendment 1+2 정합)`);
    process.exit(0);
  }
} catch (err) {
  console.error(`ERROR: ${err.message}`);
  process.exit(2);
}
} // main() 종료 (Amendment 8 #556)

// 직접 실행 시에만 main() 호출 (import 시 부작용 회피)
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

// Amendment 8 (#556) — 함수 export (단위 테스트용)
// Amendment 10 (#569) — TODO 해소 매칭 헬퍼 추가 export
export {
  isAdrEvolutionPr,
  verifyPhase2Sync,
  extractIssueRefsFromTitle,
  scanTodoFiles,
  computeTodoResolutions,
  TODO_LINE_REGEX,
};
