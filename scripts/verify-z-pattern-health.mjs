#!/usr/bin/env node
// HARNESS-DRIFT: Z-PATTERN [TODO]
/**
 * ADR 20260515 Z 패턴 health metric 자동 탐지 스크립트
 *
 * Phase 1 카운트: ADR §Amendment N regex + 본 프로젝트 PR commit grep 보조
 *   (Amendment 16 c-2: release scope / Z 패턴 가드 구현 PR 을 진화로 분류 — 분모 오계상 차단)
 * Phase 2 분자 카운트: gh pr list --search "ADR 20260515" (리터럴 = 의도 시그널, 유지)
 * Phase 2 sync check: 파일 경로 교집합 기반 (Amendment 16 c-1: --search 협소화 제거)
 *
 * 임계값 (Amendment 1+2 정합 3중 OR, Amendment 15 substantiality 정밀화):
 *   - Phase 2 진행률 < 33% — 분자 = substantive 머지 Phase-2 (Amendment 15: 경로 denylist)
 *   - 직전 substantive 머지 Phase-2 이후 연속 Phase-1 회차 >= N=10 (Amendment 14 연속 + Amendment 15 substantive 앵커)
 *   - 직전 substantive 머지 Phase-2 이후 90일 경과 (없으면 ADR 첫 적용 fallback — Amendment 15: 고정 절대 앵커 잠복 버그 해소)
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
//
// Amendment 16 (#868, c-2) regex 보강 — 실측 누수 4건 (Phase-1 분모 오계상) 차단:
//   - `chore(release): v0.48.0` 형 conventional-commit release scope (#829/#838 실측)
//   - `[#822] Z 패턴 조건 2 측정식 정정` 형 Amendment 구현 PR (#824/#825 실측) — 제목에
//     "Amendment N" 리터럴 없이 Z 패턴 가드/측정 자체를 다루는 PR. "Z 패턴"/"z-pattern"
//     제목 키워드 = 가드 인프라 진화 시그널 (Phase-1 적용 PR 은 대상 기능명으로 제목을
//     작성 — 2026-07-22 merged 전수 실측에서 genuine Phase-1 과 충돌 0건)
function isAdrEvolutionPr(title) {
  if (!title) return false;
  const lower = title.toLowerCase();
  if (/amendment\s+\d+/i.test(title)) return true;
  if (/\bhotfix\b/i.test(title)) return true;
  if (lower.startsWith('release:') || /\brelease\s+v\d+\.\d+/i.test(title)) return true;
  // Amendment 16 (c-2): conventional-commit release scope (`chore(release):` 등)
  if (/^\w+\(release\)!?:/i.test(title)) return true;
  // Amendment 16 (c-2): Z 패턴 가드/측정 자체 구현 PR (ADR 진화 — Phase-1 적용 아님)
  if (/z[\s-]*패턴|z-pattern/i.test(title)) return true;
  return false;
}

// Amendment 16 (#868, c-3) — workflow 이슈 템플릿 stale 파일명 가드 (순수 함수).
// v1 파일명 `adr-z-pattern-health.yml` 은 실재하지 않음 (실재 = `adr-z-pattern-health-v2.yml`).
// 정규식은 `-v2.yml` 을 매칭하지 않음 (`health` 직후 `.yml` 만 stale) — self-test (l) 에서
// 실제 workflow 파일 대상 0건 회귀 가드.
export function findStaleWorkflowRefs(content) {
  return (content || '').match(/adr-z-pattern-health\.yml/g) || [];
}

// Amendment 14 (#822) — 조건 2 측정식 정정: 직전 (머지된) Phase-2 기여 이후 연속 Phase-1 회차 산출.
//
// 계약 원문 (§재검토 조건 #5 "Phase 2 N=10 회 연속 미진행") 충실 구현. 기존 절대 누적
// (phase1Count) 은 단조 증가하여 Phase-2 진행 여부와 무관하게 영구 false-fire → 리셋 의미
// 부여 (직전 Phase-2 머지일 이후로만 카운트).
//
// 인자:
//   phase1Prs: isAdrEvolutionPr 필터 후 Phase-1 PR 배열 [{ mergedAt }]
//   phase2Prs: upstream Phase-2 PR 배열 [{ state, mergedAt }] (state 는 gh 표기 'MERGED' 등)
//
// 로직 (cross-validate 정정 반영 — merged-only, #822 Q3-1/Q3-2):
//   1. merged-only 필터: state === 'MERGED' && mergedAt != null 인 것만.
//      미머지/반려 PR 이 카운터를 잘못 리셋하는 사각 차단 — createdAt fallback 절대 금지 (Q3-1).
//   2. lastPhase2Date = merged Phase-2 의 mergedAt ms epoch (getTime()) 중 max.
//      - merged Phase-2 가 0 건이면 phase1Prs.length 반환 (backward-compat — 과거 Phase-2=0 레짐).
//   3. phase1Prs 중 mergedAt ms epoch > lastPhase2Date 인 것의 개수 반환.
//      - 반드시 ms epoch 비교 (동일 타임스탬프 경계 결정성 — Q3-2). createdAt fallback 금지.
export function computeConsecutiveSinceLastPhase2(phase1Prs, phase2Prs) {
  const mergedPhase2 = (phase2Prs || []).filter((p) => p.state === 'MERGED' && p.mergedAt != null);
  if (mergedPhase2.length === 0) {
    // backward-compat: 머지된 Phase-2 0 건 → 직전 Phase-2 부재 = 전체 Phase-1 이 연속
    return (phase1Prs || []).length;
  }
  const lastPhase2Date = Math.max(...mergedPhase2.map((p) => new Date(p.mergedAt).getTime()));
  return (phase1Prs || []).filter(
    (p) => p.mergedAt != null && new Date(p.mergedAt).getTime() > lastPhase2Date,
  ).length;
}

// Amendment 15 (#823): trivial denylist — PR의 모든 변경 파일이 매칭이면 non-substantive.
// ⚠ markdown(.md)/docs/**/.github/workflows 는 denylist 금지 — 본 하네스는 markdown 이 substantive 자산
// (실측 Phase-2 4건 전부 .md). cross-validate agy 의 *.md denylist 권고는 기각(ADR §Amendment 15 §trivial denylist ⚠).
const TRIVIAL_DENYLIST = [
  /(^|\/)README[^/]*$/i,
  /(^|\/)LICENSE[^/]*$/i,
  /(^|\/)\.gitignore$/,
  /(^|\/)\.prettierignore$/,
  /(^|\/)\.editorconfig$/,
  /\.(png|jpe?g|svg|gif)$/i,
  /\.txt$/i,
  /(^|\/)package-lock\.json$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)bun\.lockb$/,
  /\.lock$/,
];

// Amendment 15 (#823) — substantiality 퀄리파이어 (경로 denylist).
// PR 의 모든 변경 파일이 trivial denylist 매칭이면 non-substantive (false).
// 비-trivial 파일 ≥ 1 이면 substantive (true). 파일 0개면 보수적으로 false.
// LoC 하한 (agy 옵션 2) 은 #248 (+5줄 정당 기여) 실측 반증으로 기각 — 경로 기반만.
export function isSubstantivePhase2(pr, denylist = TRIVIAL_DENYLIST) {
  // pr.files: [{path}]. 파일 0개면 보수적으로 false(non-substantive).
  // 모든 파일이 denylist 매칭이면 false. 비-trivial 파일 ≥1 이면 true.
  const files = (pr.files || []).map((f) => f.path);
  if (files.length === 0) return false;
  return files.some((path) => !denylist.some((re) => re.test(path)));
}

// Amendment 15 (#823) — substantive merged Phase-2 필터 (3조건 공용 SSoT).
// state=MERGED && mergedAt!=null && isSubstantivePhase2 인 것만. 조건 1 (ratio 분자) /
// 조건 2 (연속 리셋 앵커) / 조건 3 (90일 클록 앵커) 모두 본 필터 결과를 사용 (통합 스코프 A).
export function filterSubstantiveMergedPhase2(phase2Prs, denylist = TRIVIAL_DENYLIST) {
  return (phase2Prs || []).filter(
    (p) => p.state === 'MERGED' && p.mergedAt != null && isSubstantivePhase2(p, denylist),
  );
}

// Amendment 8 (#556) — Phase 2 중도 변경 정적 비교 가드 (cross-validate agy 고유 발견 #1).
// upstream PR (coseo12/harness-setting) 의 head SHA + 변경 파일 경로를 로컬 drift 파일과
// 매칭해 sha256 차이 검출. 차이 발견 시 soft-warn (라벨 부착 + 자동 코멘트 trigger) —
// CI hard-block 아님 (Amendment 2/6 1인 운영 silent 약화 트레이드오프 정합).
//
// 반환:
//   { mismatches: Array<{file, upstreamPr, localSha, upstreamSha}>,
//     unmarked: Array<{upstreamPr, matchedFileCount}>, error?: string,
//     todoResolutions?: Array<{file, line, upstreamPrNumber, upstreamPrUrl, downstreamIssue}> }
//   - mismatches.length > 0 → 호출자가 [Phase 2 Sync Required] 라벨/코멘트 박제
//   - unmarked (Amendment 16 c-1): 파일 교집합 있으나 "ADR 20260515" 리터럴 미박제 PR — WARN
//   - error 존재 → 네트워크/권한 실패 (보수적으로 mismatches=0 처리, exit code 영향 없음)
//   - todoResolutions (Amendment 10): includeTodoResolution=true 시 박제. merged upstream PR
//     중 title 의 본 프로젝트 이슈 번호 AND 파일 경로 둘 다 매칭되는 후보
//
// 측정 방식 (Amendment 16 #868 c-1 정정 — `--search` 협소화 제거):
//   1. gh pr list (open, 검색 필터 없음) → upstream PR 목록. 파일 경로 교집합 (2단계) 이
//      곧 필터이므로 `--search "ADR 20260515"` 는 불필요한 협소화 — 리터럴 미박제 PR 이
//      sync 대상에서 누락되는 "매칭 0건" 모순 (#868 forensic 측정 1) 을 해소.
//      분자 카운트 (main() Phase-2) 쪽 `--search` 는 유지 — 리터럴은 의도 시그널
//      (Amendment 15 게이밍 방어 + Amendment 16 §변경 3 식별 컨벤션 ADR 승격).
//   2. 각 PR 의 files[].path 추출 → 로컬 drift 파일과 경로 매칭 (matchPhase2SyncPrs)
//   3. 매칭된 쌍의 sha256 비교 (로컬: 파일 직접 / upstream: gh API blob SHA git→sha256 변환 불가
//      → 본 함수는 파일명 매칭만 박제, 실제 비교는 사용자에게 diff URL 안내)
//   4. unmarked WARN (Amendment 16 c-1): 파일 교집합은 있으나 제목/본문에 "ADR 20260515"
//      리터럴이 없는 PR — 식별 컨벤션 괴리 가시화 (soft-warn, exit code 영향 없음)
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
//        - 패턴 1: `coseo12/astro-simulator#N` (full path)
//        - 패턴 2: `astro-simulator#N` (cross-repo 명시)
//        - 패턴 3: `[#N]` — **brackets 필수** (#581 정정. 단순 `#N` 은 `volt #114` 같은
//          cross-repo 인용을 오탐해 제거됐다. 아래 extractIssueRefsFromTitle 주석 참조)
//   - (b) PR 변경 파일 경로가 다운스트림 [TODO] 잔존 파일과 일치
//   - (a) AND (b) 둘 다 충족 시에만 매칭 (precision ↑, false-positive 회피)
//   - Amendment 17 §(β) (#894): 한 파일에 후보 PR 이 2개 이상이면 **자동 적용 보류**
//     (`held: true`). 종전 `seen` first-wins 는 `gh pr list` 기본 정렬에 의존하는
//     비결정적 승자 선정이었다.
// Amendment 16 (#868, c-1) — sync check 매칭 순수 함수 (self-test fixture 주입용).
// localDrifts (Set<string>) ∩ upstream PR files 교집합으로 mismatches 를 산출하고,
// 교집합이 있는데 제목/본문에 "ADR 20260515" 리터럴이 없는 PR 을 unmarked 로 분리.
// 교집합 0건 PR 은 리터럴 유무와 무관하게 무시 (본 프로젝트와 무관한 upstream PR 노이즈 차단).
export function matchPhase2SyncPrs(localDrifts, upstreamPrs) {
  const MARKER = /ADR 20260515/;
  const mismatches = [];
  const unmarked = [];
  for (const pr of upstreamPrs || []) {
    const upstreamFiles = (pr.files || []).map((f) => f.path);
    const matched = upstreamFiles.filter((path) => localDrifts.has(path));
    if (matched.length === 0) continue;
    for (const path of matched) {
      mismatches.push({
        file: path,
        upstreamPr: pr.number,
        upstreamHead: (pr.headRefOid || '').slice(0, 8),
        diffUrl: `https://github.com/coseo12/harness-setting/pull/${pr.number}/files`,
      });
    }
    if (!MARKER.test(pr.title || '') && !MARKER.test(pr.body || '')) {
      unmarked.push({ upstreamPr: pr.number, matchedFileCount: matched.length });
    }
  }
  return { mismatches, unmarked };
}

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
      return {
        mismatches: [],
        unmarked: [],
        ...(includeTodoResolution ? { todoResolutions: [] } : {}),
      };
    }

    // upstream open PR 조회 — Amendment 16 (c-1): `--search "ADR 20260515"` 제거.
    // 파일 경로 교집합 (matchPhase2SyncPrs) 이 곧 필터. body 필드 추가 — unmarked WARN
    // (식별 컨벤션 리터럴 부재) 판정용.
    let upstreamPrs = [];
    try {
      const result = execSync(
        `gh pr list --repo coseo12/harness-setting --state open --json number,headRefOid,files,title,body`,
        { encoding: 'utf-8' },
      ).trim();
      upstreamPrs = JSON.parse(result || '[]');
    } catch (e) {
      return { mismatches: [], unmarked: [], error: `upstream PR list failed: ${e.message}` };
    }

    // 매칭: upstream PR 의 files[].path ∩ 로컬 drift 파일 + unmarked 괴리 분리 (Amendment 16)
    const { mismatches, unmarked } = matchPhase2SyncPrs(localDrifts, upstreamPrs);

    // Amendment 10 (#569) — TODO 해소 후보 매칭 (옵션)
    let todoResolutions;
    if (includeTodoResolution) {
      todoResolutions = computeTodoResolutions(rootDir);
    }

    return {
      mismatches,
      unmarked,
      ...(includeTodoResolution ? { todoResolutions: todoResolutions || [] } : {}),
    };
  } catch (err) {
    return { mismatches: [], unmarked: [], error: err.message };
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

// =============================================================================
// Amendment 17 §(α) (#894 PR-B) — 다중 URL 데코레이터 문법 정식화
// =============================================================================
//
// 데코레이터 문법 SSoT: `[<url>( + <url>)*|TODO]`
//
// **이미 실사용 중이던 문법을 정식화**한 것이다 — `.claude/agents/qa.md` 는
// `[.../pull/309 + .../pull/318 + .../pull/322]`, `.claude/skills/browser-test/SKILL.md` 는
// `[.../pull/320 + .../pull/322]` 형태로 다중 사유를 표현해 왔으나, Amendment 8 형식 SSoT 와
// `TODO_LINE_REGEX` 는 **단일 URL 만** 규정했다 (문서↔구현 drift — CLAUDE.md §주석 계약 vs
// 구현 drift 위반). 파일 하나가 여러 사유로 drift 하는 것은 정상 상태이므로 문법이 이를
// 표현할 수 있어야 한다.
//
// 정식화의 실질 효과는 **교체 → append 전환**이다. 종전 `applyTodoReplacement` 는 대괄호
// 안을 통째로 새 URL 로 교체했으므로, 이미 URL 이 박제된 파일에 다른 PR 이 매칭되면
// **기존 사유가 소실**됐다. `mergeDecoratorUrls()` 는 기존 집합에 append 하므로 그 사고
// 자체가 소멸한다.
const DECORATOR_CONTENT_REGEX =
  /^((?:<!--|\/\/|#) HARNESS-DRIFT: Z-PATTERN \[)([^\]]*)(\](?: -->)?)/;

const DECORATOR_URL_SEPARATOR = ' + ';

/**
 * 데코레이터 대괄호 내용을 URL 배열로 파싱.
 * `TODO` 플레이스홀더는 URL 이 아니므로 빈 배열을 돌려준다 (미해소 표식).
 * @param {string} content — 대괄호 내부 문자열
 * @returns {string[]}
 */
export function parseDecoratorUrls(content) {
  const raw = (content || '').trim();
  if (!raw || raw === 'TODO') return [];
  return raw
    .split('+')
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\/\S+$/.test(s));
}

/**
 * 기존 URL 집합에 신규 URL 을 **append** (교체 아님).
 * 순서는 기존 박제 순서를 보존하고 신규만 말미에 붙인다 — 시간순 추적이 가능하도록.
 * 중복 URL 은 무시한다 (멱등).
 *
 * @param {string} content — 대괄호 내부 문자열 (`TODO` 또는 URL 목록)
 * @param {string[]} newUrls
 * @returns {string} 갱신된 대괄호 내부 문자열 (변경 없으면 원본과 동일)
 */
export function mergeDecoratorUrls(content, newUrls) {
  const existing = parseDecoratorUrls(content);
  const merged = [...existing];
  for (const u of newUrls || []) {
    if (!merged.includes(u)) merged.push(u);
  }
  if (merged.length === 0) return 'TODO';
  return merged.join(DECORATOR_URL_SEPARATOR);
}

// PR title 에서 본 프로젝트 이슈 번호 추출.
// 매칭 패턴 (3종): `astro-simulator#N` (cross-repo) / `coseo12/astro-simulator#N` (full path) / `[#N]` (brackets 필수).
//
// **Amendment 10 §결정점 2 정정 (#581, 2026-05-27)**: 패턴 3 의 단순 `#N` 매칭을
// **`[#N]` brackets 필수** 로 정정. PR #580 reviewer 단계 실측 false-positive 발견:
//   - PR #254 (`volt #114` 인용) → astro-simulator #114 cross-repo 오탐 (단순 `#N` 패턴 매칭)
//   - 본 프로젝트 PR title 컨벤션 (`feat(scope): [#N] description`) 표준 `[#N]` 답습 시
//     brackets 강제로 cross-repo `volt #N` / 단순 `#N` 인용 회피 (false-positive 0)
// 본 함수는 다운스트림 이슈 ref **의도된 박제** (`[#N]` brackets) 만 후보로 추출.
//
// **주석 계약 정정 (#894 PR-B)**: 종전 주석은 "호출자 (computeTodoResolutions) 가 다운스트림
// OPEN 이슈 존재 여부 별도 검증 — 2중 안전" 이라고 선언했으나 **해당 코드가 존재하지 않는다**
// (CLAUDE.md §주석 계약 vs 구현 drift — default 없이 조용히 흡수된 허위 보증). 실제 2중
// 안전장치는 (a) title ref AND (b) 파일 경로 매칭의 AND 결합이며, Amendment 17 §(β) 의
// 다중 후보 보류가 3중째다. OPEN 이슈 존재 검증은 구현된 적이 없고, 도입하려면 `gh issue view`
// N회 호출이 추가되므로 현재는 **비목표**로 명시한다.
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
  // 패턴 3: [#N] brackets 필수 (Amendment 10 §결정점 2 정정, #581)
  //   본 프로젝트 PR title 컨벤션 표준 — brackets 가 의도된 박제 시그널.
  //   `volt #114` / 단순 `#114` 같은 cross-repo / 자기 ref 인용 회피.
  for (const m of title.matchAll(/\[#(\d+)\]/g)) {
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

  return matchTodoResolutions(todoFiles, mergedPrs);
}

/**
 * Amendment 17 §(β) (#894) — 결정적 후보 매칭 순수 함수 (fixture 주입 가능).
 *
 * 종전 구현은 `if (seen.has(path)) continue;` 로 **첫 매칭만** 채택했는데, 그 "첫" 은
 * `gh pr list` 기본 정렬(created desc)에 의존하는 **비결정적 승자 선정**이었다. 같은 파일을
 * 건드린 upstream merged PR 이 N개면 무관한 PR 이 URL 로 박제될 수 있다 —
 * `harness-guards.yml`(#779/#480/#338/#842 누적)이 무관한 #315 로 매칭된 정확한 지점.
 *
 * 정정:
 *   1. PR 번호 오름차순으로 **결정적 정렬** (조회 순서 비의존)
 *   2. 한 파일의 후보가 2개 이상이면 `held: true` — `--apply` 대상에서 제외하고
 *      soft-warn 목록에만 올린다 (사람 판정). PR #893 에서 `harness-guards.yml` 을
 *      **수동 보류**한 판단의 자동화다.
 *
 * @param {Array<{file: string, line: number}>} todoFiles
 * @param {Array<{number: number, title: string, files?: Array<{path: string}>}>} mergedPrs
 * @returns {Array<{file, line, upstreamPrNumber, upstreamPrUrl, upstreamPrTitle,
 *                  downstreamIssue, held, candidates}>}
 */
export function matchTodoResolutions(todoFiles, mergedPrs) {
  const todoFileSet = new Map((todoFiles || []).map((t) => [t.file, t]));
  /** @type {Map<string, Array<object>>} */
  const byFile = new Map();

  // PR 번호 오름차순 — 조회 순서에 의존하지 않는 결정적 기준
  const sorted = [...(mergedPrs || [])].sort((a, b) => (a.number || 0) - (b.number || 0));
  for (const pr of sorted) {
    const issueRefs = extractIssueRefsFromTitle(pr.title);
    if (issueRefs.length === 0) continue; // (a) title 매칭 실패 — skip
    for (const path of (pr.files || []).map((f) => f.path)) {
      if (!todoFileSet.has(path)) continue; // (b) 파일 경로 매칭 실패 — skip
      if (!byFile.has(path)) byFile.set(path, []);
      byFile.get(path).push({
        upstreamPrNumber: pr.number,
        upstreamPrUrl: `https://github.com/coseo12/harness-setting/pull/${pr.number}`,
        upstreamPrTitle: pr.title,
        downstreamIssue: issueRefs.sort((x, y) => x - y)[0],
      });
    }
  }

  const resolutions = [];
  for (const file of [...byFile.keys()].sort()) {
    const candidates = byFile.get(file);
    const todo = todoFileSet.get(file);
    // 후보 ≥2 → 자동 적용 보류. 첫 후보 정보는 안내용으로만 싣는다.
    resolutions.push({
      file,
      line: todo.line,
      ...candidates[0],
      held: candidates.length > 1,
      candidates,
    });
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
      `gh pr list --repo coseo12/astro-simulator --state merged --search "20260515-harness-managed-divergent-pattern" --json number,title,mergedAt`,
      { encoding: 'utf-8' },
    ).trim();
    const adrCitationPrs = JSON.parse(adrCitationsRaw || '[]');
    // Amendment 14 (#822): Phase-1 PR 배열 (isAdrEvolutionPr 필터 후) 을 consecutive 산출에 재사용.
    const phase1Prs = adrCitationPrs.filter((pr) => !isAdrEvolutionPr(pr.title));
    const adrCitations = phase1Prs.length;
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
    // Amendment 14 (#822): 조건 2 (연속 카운트) 산출에 state/mergedAt 이 필요하여 배열 조회로 확장.
    // phase2Count (전체 카운트) 는 stdout 정보 표시 + backward-compat 참조용 = state=all 배열 length.
    // Amendment 15 (#823): 조건 1 ratio 분자 / 조건 2 연속 앵커 / 조건 3 90일 앵커 는 전부
    // filterSubstantiveMergedPhase2(phase2Prs) 결과를 SSoT 로 사용 (substantiality 퀄리파이어).
    // files 필드 추가 — isSubstantivePhase2 경로 판별용 (gh pr list --json files 지원 실측 확인).
    let phase2Count = 0;
    let phase2Prs = [];
    try {
      const phase2Result = execSync(
        `gh pr list --repo coseo12/harness-setting --state all --search "ADR 20260515" --json number,state,mergedAt,files`,
        { encoding: 'utf-8' },
      ).trim();
      phase2Prs = JSON.parse(phase2Result || '[]');
      phase2Count = phase2Prs.length;
    } catch {
      // upstream 검색 실패 (네트워크 / 권한 등) 시 보수적으로 빈 배열 → count 0.
      // Phase-2 조회 실패 → merged 0 건 → consecutive = 전체 Phase-1 (기존 동작 fallback).
      phase2Prs = [];
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
    // Amendment 16 (#868, c-1) — unmarked PR 괴리 WARN (soft-warn, exit code 영향 없음).
    // 파일 교집합은 있는데 제목/본문에 "ADR 20260515" 리터럴이 없는 PR — Phase-2 분자
    // 카운트 (--search 기반) 에서 누락되므로 머지돼도 분자 불변. 식별 컨벤션 (Amendment 16
    // §변경 3) 위반을 가시화하여 소급 마킹을 유도한다.
    if (!phase2Sync.error && (phase2Sync.unmarked || []).length > 0) {
      console.log(
        `[Phase 2 Sync WARN] unmarked PR ${phase2Sync.unmarked.length}건 — 제목/본문에 "ADR 20260515" 리터럴 부재 (Amendment 16 식별 컨벤션):`,
      );
      for (const u of phase2Sync.unmarked) {
        console.log(
          `  - upstream PR #${u.upstreamPr} (drift 파일 매칭 ${u.matchedFileCount}건) — 리터럴 박제 필요`,
        );
      }
    }

    // 3-c. Amendment 15 (#823) — substantive merged Phase-2 SSoT (3조건 공용 모수/앵커).
    // 조건 1 ratio 분자 / 조건 2 연속 리셋 앵커 / 조건 3 90일 클록 앵커 전부 본 배열 기준.
    // 4건 실측 전부 substantive → 현재 값 불변 (backward-compat). 미래 사소 PR (README/오타) 배제.
    const substantiveMergedPhase2 = filterSubstantiveMergedPhase2(phase2Prs);
    const substantiveCount = substantiveMergedPhase2.length;
    // substantive merged Phase-2 의 max(mergedAt) — 조건 2/3 공용 리셋 앵커. 0 건이면 null.
    const lastSubstantiveMs =
      substantiveCount > 0
        ? Math.max(...substantiveMergedPhase2.map((p) => new Date(p.mergedAt).getTime()))
        : null;

    // 4. 시간 경과 검증 — Amendment 15: 고정 절대 앵커 (ADR_FIRST_APPLY_DATE) 잠복 버그 해소.
    // daysSinceLastSubstantive = today − max(substantive merged Phase-2 mergedAt).
    // substantive 0 건이면 ADR_FIRST_APPLY_DATE fallback (backward-compat — 과거 Phase-2=0 레짐).
    const firstApplyDate = new Date(ADR_FIRST_APPLY_DATE);
    const today = new Date();
    const clockAnchorMs = lastSubstantiveMs != null ? lastSubstantiveMs : firstApplyDate.getTime();
    const daysSinceLastSubstantive = Math.floor(
      (today.getTime() - clockAnchorMs) / (1000 * 60 * 60 * 24),
    );
    const clockAnchorLabel =
      lastSubstantiveMs != null
        ? `직전 substantive Phase-2 (${new Date(lastSubstantiveMs).toISOString().slice(0, 10)})`
        : `ADR 첫 적용 (${ADR_FIRST_APPLY_DATE}, substantive 0 건 fallback)`;

    // 5. 임계값 검증 (3중 OR) — Amendment 15: 3조건 전부 substantive 모수/앵커.
    // 조건 1 분자 = substantive merged Phase-2 카운트. div-by-zero 가드 보존 (phase1Count>0).
    const phase2Ratio = phase1Count > 0 ? substantiveCount / phase1Count : 0;
    // 조건 2: 연속 산출에 substantive merged 배열 주입 (사소 PR 은 리셋 앵커 불인정).
    const consecutiveSinceLastPhase2 = computeConsecutiveSinceLastPhase2(
      phase1Prs,
      substantiveMergedPhase2,
    );
    const triggers = [];

    if (phase2Ratio < PHASE2_THRESHOLD) {
      triggers.push(
        `Phase 2 진행률 ${(phase2Ratio * 100).toFixed(1)}% < ${PHASE2_THRESHOLD * 100}% 임계값 (분자 = substantive 머지 ${substantiveCount})`,
      );
    }
    if (consecutiveSinceLastPhase2 >= N_THRESHOLD) {
      triggers.push(
        `직전 substantive Phase-2 이후 연속 Phase-1 ${consecutiveSinceLastPhase2}회 >= N=${N_THRESHOLD} 임계값`,
      );
    }
    if (daysSinceLastSubstantive >= TIME_THRESHOLD_DAYS) {
      triggers.push(
        `${clockAnchorLabel} 이후 ${daysSinceLastSubstantive}일 경과 >= ${TIME_THRESHOLD_DAYS}일 임계값`,
      );
    }

    // 6. 출력 + exit
    console.log(
      `Phase 1 (본 프로젝트): ${phase1Count} (Amendment ${amendmentCount}, PR citations ${adrCitations})`,
    );
    // Amendment 14 (#822): 절대 누적 (생애) + 직전 Phase-2 이후 연속 두 차원 병기 (조건 2 SSoT = 연속).
    console.log(
      `  - 절대 누적 (생애): ${phase1Count} / 직전 Phase-2 이후 연속: ${consecutiveSinceLastPhase2} (조건 2 SSoT)`,
    );
    // Amendment 15 (#823): substantive 머지 / 전체 조회 병기 (조건 1/2/3 SSoT = substantive 머지).
    console.log(
      `Phase 2 (upstream harness-setting): ${phase2Count} (substantive 머지: ${substantiveCount})`,
    );
    console.log(
      `Phase 2 진행률: ${(phase2Ratio * 100).toFixed(1)}% (분자 = substantive 머지 ${substantiveCount})`,
    );
    console.log(`조건 3 클록 앵커: ${clockAnchorLabel} 이후 ${daysSinceLastSubstantive}일 경과`);

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

// =============================================================================
// Amendment 14 (#822) — --self-test 모드 (gh 미호출, 순수 함수 fixture 주입)
// =============================================================================
//
// CLAUDE.md §"가드 도입 PR DoD" 4축 (2) 3중 시뮬 (positive → negative → recovery)
// + backward-compat + merged-only 사각 방어. gh CLI 호출 없이
// computeConsecutiveSinceLastPhase2 순수 함수에 fixture 를 직접 주입하여 결정적 검증.
// 전 케이스 PASS 시 exit 0, 하나라도 실패 시 exit 1.
function runSelfTest() {
  let failed = 0;
  const assert = (cond, msg) => {
    if (cond) {
      console.log(`  PASS: ${msg}`);
    } else {
      console.error(`  FAIL: ${msg}`);
      failed++;
    }
  };
  const iso = (d) => `${d}T00:00:00Z`;

  console.log(
    '[self-test] computeConsecutiveSinceLastPhase2 — 3중 시뮬 + backward-compat + merged-only 사각 방어',
  );

  // (a) positive: 직전 머지 Phase-2 (2026-01-01) 이후 Phase-1 머지 12건 (>= 10) → 발화
  {
    const phase2 = [{ state: 'MERGED', mergedAt: iso('2026-01-01') }];
    const phase1 = Array.from({ length: 12 }, (_, i) => ({
      mergedAt: iso(`2026-02-${String(i + 1).padStart(2, '0')}`),
    }));
    const n = computeConsecutiveSinceLastPhase2(phase1, phase2);
    assert(
      n === 12 && n >= N_THRESHOLD,
      `(a) positive: 연속 ${n} (기대 12, >= N=${N_THRESHOLD} 발화)`,
    );
  }

  // (b) negative: 직전 머지 Phase-2 (2026-05-18) 이후 4건 (< 10) → 미발화 (현재 실측 재현)
  {
    const phase2 = [{ state: 'MERGED', mergedAt: iso('2026-05-18') }];
    const phase1 = ['2026-05-26', '2026-05-27', '2026-06-30', '2026-07-10'].map((d) => ({
      mergedAt: iso(d),
    }));
    const n = computeConsecutiveSinceLastPhase2(phase1, phase2);
    assert(
      n === 4 && n < N_THRESHOLD,
      `(b) negative: 연속 ${n} (기대 4, < N=${N_THRESHOLD} 미발화)`,
    );
  }

  // (c) recovery: 새 Phase-2 머지일 (2026-08-01) 이 모든 Phase-1 보다 이후 → 0 리셋
  {
    const phase2 = [
      { state: 'MERGED', mergedAt: iso('2026-05-18') },
      { state: 'MERGED', mergedAt: iso('2026-08-01') }, // 최신 Phase-2 (max) — 리셋 기준점
    ];
    const phase1 = ['2026-05-26', '2026-06-30', '2026-07-10'].map((d) => ({ mergedAt: iso(d) }));
    const n = computeConsecutiveSinceLastPhase2(phase1, phase2);
    assert(n === 0, `(c) recovery: 새 Phase-2 이후 연속 ${n} (기대 0 리셋)`);
  }

  // (d) backward-compat: 머지된 Phase-2 0 건 → phase1Prs.length (과거 Phase-2=0 레짐)
  {
    const phase2 = [];
    const phase1 = Array.from({ length: 7 }, (_, i) => ({ mergedAt: iso(`2026-05-${i + 10}`) }));
    const n = computeConsecutiveSinceLastPhase2(phase1, phase2);
    assert(n === 7, `(d) backward-compat: Phase-2=0 → 연속 ${n} (기대 7 = 전체 Phase-1)`);
  }

  // (e) merged-only 사각 방어 (Q3-1): 미머지/반려 PR 은 리셋 안 함 (createdAt fallback 부재 검증).
  // createdAt 을 모든 Phase-1 보다 이후(2026-07-01)로 주입 — 미래에 `?? createdAt` fallback 이
  // 재도입되면 lastPhase2Date 가 07-01 로 잡혀 연속이 0 으로 붕괴, assert(n===5) 가 실패한다.
  {
    const phase2 = [
      { state: 'CLOSED', mergedAt: null, createdAt: iso('2026-07-01') },
      { state: 'OPEN', mergedAt: null, createdAt: iso('2026-07-01') },
    ];
    const phase1 = Array.from({ length: 5 }, (_, i) => ({ mergedAt: iso(`2026-06-${i + 10}`) }));
    const n = computeConsecutiveSinceLastPhase2(phase1, phase2);
    assert(n === 5, `(e) merged-only: 전부 미머지 → 연속 ${n} (기대 5, 미머지 PR 리셋 차단)`);
  }

  console.log(
    '\n[self-test] Amendment 15 (#823) — substantiality 퀄리파이어 (경로 denylist) 3조건 방어',
  );

  // (f) 사소 PR 리셋 불인정: substantive(.claude/agents/x.md, 05-18) + README-only(08-01) 혼재.
  //     README-only 는 filterSubstantiveMergedPhase2 에서 배제 → 리셋 앵커는 05-18 유지 →
  //     08-01 README 트릭으로 consecutiveSinceLastPhase2 를 0 리셋 불가 (연속 유지).
  {
    const phase2 = [
      {
        state: 'MERGED',
        mergedAt: iso('2026-05-18'),
        files: [{ path: '.claude/agents/developer.md' }],
      },
      { state: 'MERGED', mergedAt: iso('2026-08-01'), files: [{ path: 'README.md' }] },
    ];
    const filtered = filterSubstantiveMergedPhase2(phase2);
    assert(
      filtered.length === 1 && filtered[0].mergedAt === iso('2026-05-18'),
      `(f) README-only 배제 → substantive ${filtered.length} (기대 1, 앵커 05-18 유지)`,
    );
    const phase1 = ['2026-06-10', '2026-06-20', '2026-06-30', '2026-07-10', '2026-07-20'].map(
      (d) => ({ mergedAt: iso(d) }),
    );
    const n = computeConsecutiveSinceLastPhase2(phase1, filtered);
    assert(n === 5, `(f) 사소 PR 리셋 불인정: 연속 ${n} (기대 5, README 08-01 앵커 미인정)`);
  }

  // (g) #248 형 substantive 인정: .claude/agents/*.md ×5 (+5줄) → LoC 무관, 경로 기반 substantive.
  //     리셋 앵커 인정 (substantive 08-01 이후 Phase-1 없으면 연속 0 리셋).
  {
    const pr = {
      state: 'MERGED',
      mergedAt: iso('2026-08-01'),
      files: [
        { path: '.claude/agents/architect.md' },
        { path: '.claude/agents/developer.md' },
        { path: '.claude/agents/reviewer.md' },
        { path: '.claude/agents/qa.md' },
        { path: '.claude/agents/pm.md' },
      ],
    };
    assert(
      isSubstantivePhase2(pr) === true,
      `(g) #248 형 .claude/agents/*.md ×5 → substantive=true (경로 기반, LoC 무관)`,
    );
    const filtered = filterSubstantiveMergedPhase2([pr]);
    assert(
      filtered.length === 1,
      `(g) filterSubstantiveMergedPhase2 인정 → ${filtered.length} (기대 1)`,
    );
    const phase1 = ['2026-06-10', '2026-07-10'].map((d) => ({ mergedAt: iso(d) }));
    const n = computeConsecutiveSinceLastPhase2(phase1, filtered);
    assert(n === 0, `(g) substantive 리셋 앵커 인정: 08-01 이후 연속 ${n} (기대 0 리셋)`);
  }

  // (h) 조건 3 클록 앵커 (main() 로직 재현): substantive 0 건 → firstApply fallback +
  //     사소 PR 로는 조건 3 클록 리셋 안 됨 (substantive max 유지).
  {
    const firstApplyMs = new Date(ADR_FIRST_APPLY_DATE).getTime();
    const clockAnchor = (phase2Prs) => {
      const sub = filterSubstantiveMergedPhase2(phase2Prs);
      return sub.length > 0
        ? Math.max(...sub.map((p) => new Date(p.mergedAt).getTime()))
        : firstApplyMs;
    };
    // (h-1) 전부 trivial (README/LICENSE) → substantive 0 → firstApply fallback
    const allTrivial = [
      { state: 'MERGED', mergedAt: iso('2026-08-01'), files: [{ path: 'README.md' }] },
      { state: 'MERGED', mergedAt: iso('2026-08-15'), files: [{ path: 'LICENSE' }] },
    ];
    assert(
      filterSubstantiveMergedPhase2(allTrivial).length === 0,
      `(h-1) 전부 trivial → substantive 0 건 (firstApply fallback 조건)`,
    );
    assert(
      clockAnchor(allTrivial) === firstApplyMs,
      `(h-1) 클록 앵커 = ADR 첫 적용 (substantive 0 fallback, backward-compat)`,
    );
    // (h-2) substantive(05-18) + trivial(08-01) → 클록 앵커 05-18 (사소 PR 08-01 리셋 불인정)
    const mixed = [
      { state: 'MERGED', mergedAt: iso('2026-05-18'), files: [{ path: 'CLAUDE.md' }] },
      { state: 'MERGED', mergedAt: iso('2026-08-01'), files: [{ path: 'README.md' }] },
    ];
    assert(
      clockAnchor(mixed) === new Date(iso('2026-05-18')).getTime(),
      `(h-2) 클록 앵커 = 05-18 substantive (사소 PR 08-01 리셋 불인정)`,
    );
  }

  // (markdown 방어) markdown 은 substantive 자산 — 미래에 *.md / docs/** denylist 추가 회귀 차단.
  {
    assert(
      isSubstantivePhase2({ files: [{ path: 'CLAUDE.md' }] }) === true,
      `(markdown 방어) CLAUDE.md → substantive=true (denylist 미매칭)`,
    );
    assert(
      isSubstantivePhase2({ files: [{ path: '.claude/agents/qa.md' }] }) === true,
      `(markdown 방어) .claude/agents/qa.md → substantive=true (denylist 미매칭)`,
    );
    assert(
      isSubstantivePhase2({ files: [{ path: 'docs/decisions/x.md' }] }) === true,
      `(markdown 방어) docs/decisions/x.md → substantive=true (denylist 미매칭)`,
    );
  }

  // (i) denylist 판별 정확성: trivial 조합 / lock 변종 / 파일 0개 / 비-trivial 혼재.
  {
    assert(
      isSubstantivePhase2({ files: [{ path: 'README.md' }, { path: 'LICENSE' }] }) === false,
      `(i) README+LICENSE 조합 → non-substantive (전부 trivial)`,
    );
    assert(
      isSubstantivePhase2({ files: [{ path: 'pnpm-lock.yaml' }] }) === false,
      `(i) pnpm-lock.yaml → non-substantive (lock 변종)`,
    );
    assert(
      isSubstantivePhase2({ files: [{ path: 'package-lock.json' }] }) === false,
      `(i) package-lock.json → non-substantive (lock 변종, *.lock 미매칭 커버)`,
    );
    assert(
      isSubstantivePhase2({ files: [{ path: 'assets/hero.png' }, { path: 'notes.txt' }] }) ===
        false,
      `(i) 이미지+txt 조합 → non-substantive`,
    );
    assert(isSubstantivePhase2({ files: [] }) === false, `(i) 파일 0개 → non-substantive (보수적)`);
    assert(
      isSubstantivePhase2({ files: [{ path: 'README.md' }, { path: 'src/index.ts' }] }) === true,
      `(i) README + src/index.ts (비-trivial ≥1) → substantive`,
    );
  }

  console.log(
    '\n[self-test] Amendment 16 (#868) — 측정 보강 3건 (c-1 sync 교집합+unmarked / c-2 evolution regex / c-3 stale 파일명)',
  );

  // (j) c-1 matchPhase2SyncPrs — 3중 시뮬 (positive → negative → recovery)
  {
    const drifts = new Set(['.claude/agents/qa.md', 'CLAUDE.md']);
    // (j-1) positive: 파일 교집합 있음 + 리터럴 부재 → mismatch 산출 + unmarked WARN
    {
      const prs = [
        {
          number: 320,
          headRefOid: 'abcdef1234567890',
          title: '[#854] label taxonomy 3계층 정리',
          body: '라벨 정리 상세',
          files: [{ path: '.claude/agents/qa.md' }],
        },
      ];
      const r = matchPhase2SyncPrs(drifts, prs);
      assert(
        r.mismatches.length === 1 && r.mismatches[0].file === '.claude/agents/qa.md',
        `(j-1) positive: 교집합 매칭 ${r.mismatches.length}건 (기대 1 — --search 없이 파일 경로가 필터)`,
      );
      assert(
        r.unmarked.length === 1 && r.unmarked[0].upstreamPr === 320,
        `(j-1) positive: 리터럴 부재 → unmarked ${r.unmarked.length}건 (기대 1, WARN 발화)`,
      );
    }
    // (j-2) negative: 본문에 리터럴 존재 → mismatch 는 유지, unmarked 아님
    {
      const prs = [
        {
          number: 321,
          headRefOid: 'abcdef1234567890',
          title: '[#855] Test plan drift 해소',
          body: 'ADR 20260515 Phase 2 — astro-simulator Z 패턴 upstream 기여',
          files: [{ path: 'CLAUDE.md' }],
        },
      ];
      const r = matchPhase2SyncPrs(drifts, prs);
      assert(
        r.mismatches.length === 1 && r.unmarked.length === 0,
        `(j-2) negative: 리터럴 존재 → mismatch ${r.mismatches.length} (기대 1) + unmarked ${r.unmarked.length} (기대 0)`,
      );
    }
    // (j-3) recovery: 교집합 0건 PR 은 리터럴 유무 무관 무시 (무관 upstream PR 노이즈 차단)
    {
      const prs = [
        {
          number: 999,
          title: '무관 PR (리터럴 없음)',
          body: '',
          files: [{ path: 'docs/unrelated.md' }],
        },
      ];
      const r = matchPhase2SyncPrs(drifts, prs);
      assert(
        r.mismatches.length === 0 && r.unmarked.length === 0,
        `(j-3) recovery: 교집합 0건 → mismatch/unmarked 전부 0 (노이즈 차단)`,
      );
    }
  }

  // (k) c-2 isAdrEvolutionPr — 실측 누수 4건 fixture + genuine Phase-1 보존 + 기존 패턴 회귀
  {
    // positive: 실측 누수 4건 (#829/#838/#824/#825) → evolution 분류 (분모 제외)
    const leaks = [
      'chore(release): v0.48.0',
      'chore(release): v0.49.0',
      '[#822] Z 패턴 조건 2 측정식 정정 — 절대 누적 → 연속(merged-only) + self-test',
      '[#823] Z 패턴 substantiality 퀄리파이어 — 리셋 게이밍 방어 + 조건3 앵커 정정',
    ];
    for (const t of leaks) {
      assert(isAdrEvolutionPr(t) === true, `(k) 누수 fixture evolution 분류: "${t.slice(0, 40)}…"`);
    }
    // negative: genuine Phase-1 (2026-07-22 merged 전수 실측 표본) → Phase-1 유지
    const genuine = [
      'feat(reviewer): [#463] reviewer.md §절차 5번 ADR 호환성 의미론적 검증 신설',
      '[#817] 세션 중단 dead-wait 가드 D — SessionStart 복구 훅 + pending-waits 라이프사이클',
      '[#853] chore(harness): v4.2.5→v4.4.0 동기화 — dead-wait #315 흡수 + sidecar 재정비',
      '[#841] fix(web): 사용자 노출 표시 계약 위반 3건 — 위성 공전주기 모체 μ / pause 배속 스냅샷',
    ];
    for (const t of genuine) {
      assert(isAdrEvolutionPr(t) === false, `(k) genuine Phase-1 보존: "${t.slice(0, 40)}…"`);
    }
    // recovery (기존 패턴 회귀 유지): Amendment N / hotfix / release: 접두
    assert(
      isAdrEvolutionPr('docs(adr): [#556] ADR 20260515 Amendment 8 — Phase 1 드리프트 가시화') ===
        true,
      `(k) 기존 Amendment N 패턴 유지`,
    );
    assert(
      isAdrEvolutionPr('release: v0.16.0 — R3 사이클 + 메타 인프라') === true,
      `(k) 기존 release: 접두 패턴 유지`,
    );
    assert(
      isAdrEvolutionPr('fix(workflow): [#483 hotfix] YAML on: quote') === true,
      `(k) 기존 hotfix 패턴 유지`,
    );
  }

  // (l) c-3 findStaleWorkflowRefs — fixture 3중 시뮬 + 실제 workflow 파일 recovery 확인
  {
    assert(
      findStaleWorkflowRefs('자동 탐지 workflow `.github/workflows/adr-z-pattern-health.yml` 발화')
        .length === 1,
      `(l) positive: v1 stale 파일명 검출`,
    );
    assert(
      findStaleWorkflowRefs('workflow: `.github/workflows/adr-z-pattern-health-v2.yml`').length ===
        0,
      `(l) negative: -v2 실재 파일명 미검출 (오탐 0)`,
    );
    const wfPath = '.github/workflows/adr-z-pattern-health-v2.yml';
    if (existsSync(wfPath)) {
      const stale = findStaleWorkflowRefs(readFileSync(wfPath, 'utf-8'));
      assert(
        stale.length === 0,
        `(l) recovery: 실제 workflow stale 참조 ${stale.length}건 (기대 0)`,
      );
    } else {
      assert(false, `(l) recovery: workflow 파일 부재 (${wfPath}) — 경로 확인 필요`);
    }
  }

  if (failed > 0) {
    console.error(`\n[self-test] FAIL — ${failed} 케이스 실패`);
    process.exit(1);
  }
  console.log('\n[self-test] PASS — 전 케이스 통과');
  process.exit(0);
}

// 직접 실행 시에만 main() / self-test 호출 (import 시 부작용 회피)
if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--self-test')) {
    runSelfTest();
  } else {
    main();
  }
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
  // Amendment 17 §(α) (#894) — 다중 URL 데코레이터 문법
  DECORATOR_CONTENT_REGEX,
  DECORATOR_URL_SEPARATOR,
};
