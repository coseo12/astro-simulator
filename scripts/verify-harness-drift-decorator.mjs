#!/usr/bin/env node
// HARNESS-DRIFT: Z-PATTERN [TODO]
/**
 * verify-harness-drift-decorator.mjs
 *
 * ADR 20260515 Amendment 8 (#556) Phase 1 드리프트 가시화 가드.
 * ADR 20260515 Amendment 9 (#557) 경고 피로감 가드 (활성 drift ≥ N=10 soft-warn).
 * ADR 20260515 Amendment 11 (#572) Phase 3 sidecar 라이프사이클 자동화 (opt-in).
 *
 * `.harness/manifest.json` 의 sha256 와 실제 파일 sha256 를 비교해 drift 감지.
 * drift 파일에 HARNESS-DRIFT 데코레이터 (Z-PATTERN [upstream-link-or-TODO]) 박제
 * 검증. 누락 시 exit 1 (fail-fast — Amendment 8 §결정점 4 silent 가드 강화 방향).
 *
 * Amendment 9 (#557) / Amendment 11 (#572) — 세 모드 분기:
 *   --mode=verify (기본)         — Amendment 8 데코레이터 가드 (fail-fast)
 *   --mode=count-warn            — Amendment 9 경고 피로감 가드 (soft-warn, exit 0 + stdout 마커)
 *   --mode=sidecar-cleanup       — Amendment 11 orphan sidecar 정리 자동화 (opt-in)
 *
 * 비대칭 의도적 (ADR §Amendment 11 §결정점 4 SSoT — Amendment 8/9/10/11 통합):
 *   - 데코레이터 누락 = fail-fast (예방 비용 < 1줄, 컨벤션 강제)
 *   - drift 카운트 초과 = soft-warn (사용자 결정 분기 의무 — Phase 2 가속 / 일부 revert / N 재조정)
 *   - sidecar 라이프사이클 = fail-fast (verify 모드 silent leak 차단) + opt-in 자동화 (sidecar-cleanup 모드 사용자 시점 정리)
 *
 * 본문 형식 SSoT (ADR §Amendment 8):
 *   HARNESS-DRIFT: Z-PATTERN [<upstream-link-or-TODO>]
 *
 * 파일 형식별 분기 (결정점 1):
 *   - .md            : <!-- HARNESS-DRIFT: Z-PATTERN [...] -->  (HTML 주석)
 *   - .ts/tsx/js/mjs/cjs : // HARNESS-DRIFT: Z-PATTERN [...]
 *   - .yml/yaml/sh   : # HARNESS-DRIFT: Z-PATTERN [...]
 *   - .json          : sidecar 파일 <filename>.HARNESS-DRIFT.md (JSON 주석 미지원)
 *
 * 위치 SSoT (결정점 2):
 *   파일 첫 줄 의무 + shebang (#!) / DOCTYPE (<!DOCTYPE) 직후 1줄 허용.
 *
 * 정합 regex (Amendment 8 SSoT):
 *   ^(?:#![^\n]*\n|<!DOCTYPE[^>]*>\n)?(?:<!--|//|#) HARNESS-DRIFT: Z-PATTERN \[(?:https?://[^\]]+|TODO)\](?: -->)?
 *
 * sidecar 라이프사이클 계약 (cross-validate agy 이견 수용):
 *   - <filename>.HARNESS-DRIFT.md 존재 시 동일 디렉토리에 <filename> 반드시 존재
 *   - <filename> 은 manifest drift 상태여야 함 (Phase 1 의도된 drift)
 *   - orphan sidecar (본 파일 없음 OR drift 해소된 상태) 발견 시 exit 1
 *
 * 호출:
 *   node scripts/verify-harness-drift-decorator.mjs [--mode=verify|count-warn|sidecar-cleanup] [--apply]
 *
 *   --mode=verify (기본, Amendment 8):
 *     → drift 0 또는 모든 drift 파일에 데코레이터 정합 박제 → exit 0
 *     → drift N + 데코레이터 누락 K (K > 0) → exit 1 (CI hard-fail)
 *     → manifest 파일 부재 / 실행 에러 → exit 2
 *
 *   --mode=count-warn (Amendment 9):
 *     → 활성 drift 파일 수 산출 + N=10 임계 비교 (orphan 제외)
 *     → drift < N → exit 0 (정상, stdout: "alert fatigue: OK")
 *     → drift ≥ N → exit 0 + stdout 에 "[Alert Fatigue Trigger]" 마커 + drift 파일 목록 박제
 *       (soft-warn — CI workflow 가 stdout 파싱하여 자동 이슈 생성)
 *
 *   --mode=sidecar-cleanup (Amendment 11, opt-in):
 *     → detectOrphanSidecars() 재사용 — orphan 목록 stdout 출력
 *     → orphan 0 → "no orphan sidecars" + exit 0
 *     → orphan N (--apply 미명시, dry-run 기본) → "[Sidecar Cleanup — Dry Run]" 마커 + 목록 + exit 0
 *     → orphan N (--apply 명시) → file unlink + "[Sidecar Cleanup — Apply]" 마커 + exit 0
 *     → manifest 부재 / 실행 에러 → exit 2
 *
 *     안전 장치: --apply 는 detectOrphanSidecars() 가 식별한 orphan 만 삭제 (정상 sidecar 보존).
 *     orphan 휴리스틱 (검사 1: base file missing / 검사 2: drift 해소된 상태) 이 SSoT.
 *
 * Self-test:
 *   node scripts/verify-harness-drift-decorator.mjs --self-test
 *     → 인라인 positive/negative/recovery 3중 시뮬레이션 + sidecar/regex 단위 검증
 *     → Amendment 9 boundary 시뮬레이션 (N-1 / N / N+1) 3 cases
 *     → Amendment 11 boundary 시뮬레이션 (orphan 0 / dry-run / apply / drift 안전 거부) 4 cases
 *
 * 관련:
 *   - ADR docs/decisions/20260515-harness-managed-divergent-pattern.md §Amendment 8 / §Amendment 9 / §Amendment 11
 */
import { createHash } from 'node:crypto';
import {
  readFileSync,
  existsSync,
  readdirSync,
  writeFileSync,
  rmSync,
  mkdtempSync,
  mkdirSync,
  unlinkSync,
} from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const MANIFEST_PATH = '.harness/manifest.json';

// Amendment 9 (#557) — 경고 피로감 가드 임계값 SSoT.
// baseline 6 (2026-05-26 develop tip) + buffer 4 = N=10.
// Amendment 2 N=10 (Phase 1 회차) 와 동일 N — 차원만 다름 (drift 파일 수 ↔ Phase 1 회차).
// 변경 금지 (ADR §Amendment 9 §결정점 1 박제값).
const ALERT_FATIGUE_THRESHOLD_N = 10;

// stdout 마커 — CI workflow 가 grep 으로 파싱하여 자동 이슈 생성 트리거.
const ALERT_FATIGUE_MARKER = '[Alert Fatigue Trigger]';

// Amendment 11 (#572) — sidecar-cleanup 모드 stdout 마커 SSoT.
// dry-run 기본 (--apply 미명시) / --apply 명시 시 실제 삭제. 마커는 CI / 사용자 grep 식별용.
const SIDECAR_CLEANUP_DRY_RUN_MARKER = '[Sidecar Cleanup — Dry Run]';
const SIDECAR_CLEANUP_APPLY_MARKER = '[Sidecar Cleanup — Apply]';

// Amendment 12 (#577) — TODO Aging Guard 임계값 SSoT.
// baseline (2026-05-26 develop tip ff24995) 위반 0 + buffer 21일 (verify-z-pattern-health.mjs 9일 경과 → 30일까지 21일 여유).
// Amendment 2 ~1 sprint (3 PR / 30일) 정합. 30일 ≪ 90일 (Amendment 2 SSoT) — 시간 차원 우선순위 명확화.
// 변경 금지 (ADR §Amendment 12 §결정점 2 박제값, measurement-first 정합).
const TODO_AGING_THRESHOLD_DAYS = 30;

// Amendment 12 stdout 마커 — CI workflow 가 grep 으로 파싱하여 자동 이슈 생성 트리거.
const TODO_AGING_MARKER = '[TODO Aging Trigger]';

// Amendment 12 §결정점 3 — harness-managed 카테고리 식별 휴리스틱 SSoT.
// TODO 박제 commit message prefix 가 `chore(harness):` 매칭 → upstream 영역 (다운스트림 해소 불가).
// 예: "chore(harness): v2.29.1 → v3.6.0 업데이트 (#338)" — harness update 자동화 commit.
// architect 원안 `.harness/manifest.json` `apply.*` 키 매트릭스 매칭 가정 오류 정정 (#577 developer 단계 실측).
const HARNESS_MANAGED_COMMIT_PREFIX = 'chore(harness):';

// =============================================================================
// Amendment 13 (#766) — 영구 divergent allowlist (alert fatigue 카운트 모수 정제)
// =============================================================================
//
// ADR 20260515 §Amendment 13 §변경 사항 2 SSoT.
// N=10 임계는 불변 (변경 금지) — 변경되는 것은 "무엇을 활성 Z 패턴 적용 drift 로 셀 것인가"
// 카운트 모수. 구조적으로 upstream 기여 불가능한 자산 (천체 시뮬 README 스크린샷 / 도메인 전용
// 로드맵) 은 §Amendment 9 §결정점 5 가 정의한 측정 본질 (Z 패턴 활성 적용 누적) 의 모수가
// 아니다. orphan sidecar 제외 (§결정점 5) 와 동일 계열 — 측정 정밀화 (silent 약화 아님).

// Amendment 13 §변경 사항 2 (d) — allowlist 진입 조건 식별자 Enum SSoT.
// structuralProof 원소는 반드시 이 Enum 에 정확 매칭 (includes() 부분 문자열 아님 —
// cross-validate 2026-06-30 agy 고유 발견 2 수용, 매칭 인터페이스 규격 명시).
//   - content-asset      : harness 데모/플레이스홀더 자산을 도메인 콘텐츠로 영구 교체
//   - domain-doc         : 프로젝트 도메인 전용 문서 (로드맵/기획/회고), 범용성 0
//   - perpetual-rewrite  : 정기 운영으로 sha 영구 재변경 (upstream 1회 기여로 해소 불가능)
const STRUCTURAL_PROOF_ENUM = Object.freeze(['content-asset', 'domain-doc', 'perpetual-rewrite']);

// Amendment 13 §변경 사항 2 (b) 4번 — Forbidden Path deny-list 패턴 SSoT (cross-validate 보강).
// allowlist 에 범용 harness 가드/페르소나가 위장 등록되는 우회로 차단 (hard-fail).
// 이들은 옵션 1 (Phase 2 upstream 기여) 의 정당한 대상이지 구조적 divergent 아님.
// positive 진입 조건을 통과해도 deny-list 매칭 시 self-test 무조건 FAIL.
const FORBIDDEN_ALLOWLIST_PATH_PATTERNS = Object.freeze([
  /^scripts\/verify-.*\.mjs$/, // 범용 harness 가드 (본 파일 자신 포함 — Z-패턴 재귀 안전성)
  /^CLAUDE\.md$/, // 범용 워크플로 SSoT
  /^\.claude\/agents\/.*\.md$/, // 범용 페르소나
  /^\.claude\/skills\/.*$/, // 범용 스킬
  /^\.github\/workflows\/.*\.ya?ml$/, // 범용 CI 가드
]);

// Amendment 13 §변경 사항 2 — 영구 divergent allowlist SSoT (인라인, 별도 JSON 분리 거부).
// 측정 SSoT 와 모수 정의가 같은 파일에 있어야 추적성 보장 (§결정점 5 단일 스크립트 통합 패턴).
// 각 항목: { path, reason (1줄 한국어 사유), structuralProof (STRUCTURAL_PROOF_ENUM 배열) }.
// 진입 전 판정 질문 (의무): "카운트에서 빼는 이유가 (A) 구조적으로 upstream 기여 불가능 입증
// 가능해서인가, (B) 단지 발화가 잦아 부담스러워서인가?" → A 만 정당 (B 는 옵션 3 silent 약화).
// 무한 팽창 차단: 진입 조건 (구조적 입증) + Forbidden Path deny-list + stale WARN.
// 재귀 안전성 (§변경 사항 4): verify-harness-drift-decorator.mjs 자신을 넣지 않는다
// (Forbidden Path 가 scripts/verify-*.mjs 로 자동 차단 — 이중 안전, 자기참조 결함 방지).
const PERMANENT_DIVERGENT_ALLOWLIST = Object.freeze([
  {
    path: 'docs/screenshots/01-solar-system.png',
    reason:
      '천체 시뮬 데모 스크린샷 — harness 데모 자산을 도메인 콘텐츠로 영구 교체, README 직접 참조 + 릴리스마다 갱신',
    structuralProof: ['content-asset', 'perpetual-rewrite'],
  },
  {
    path: 'docs/screenshots/02-earth-focus.png',
    reason:
      '천체 시뮬 데모 스크린샷 — harness 데모 자산을 도메인 콘텐츠로 영구 교체, README 직접 참조 + 릴리스마다 갱신',
    structuralProof: ['content-asset', 'perpetual-rewrite'],
  },
  {
    path: 'docs/screenshots/03-neptune.png',
    reason:
      '천체 시뮬 데모 스크린샷 — harness 데모 자산을 도메인 콘텐츠로 영구 교체, README 직접 참조 + 릴리스마다 갱신',
    structuralProof: ['content-asset', 'perpetual-rewrite'],
  },
  {
    path: 'docs/screenshots/04-mobile.png',
    reason:
      '천체 시뮬 데모 스크린샷 — harness 데모 자산을 도메인 콘텐츠로 영구 교체, README 직접 참조 + 릴리스마다 갱신',
    structuralProof: ['content-asset', 'perpetual-rewrite'],
  },
  {
    path: 'docs/phases/roadmap-v3-incremental.md',
    reason:
      '천체 시뮬 전용 로드맵 — harness 빈 템플릿을 프로젝트 고유 기획으로 영구 교체, 범용성 0',
    structuralProof: ['domain-doc'],
  },
]);

// Amendment 8 SSoT regex — 위치 A (파일 첫 줄 + shebang/DOCTYPE/YAML frontmatter 1블록 허용).
// 형식별 분기: `<!--` (md) / `//` (ts/js/mjs) / `#` (yml/sh)
//
// developer 단계 보완 (#556): architect SSoT regex 는 shebang/DOCTYPE 만 허용했으나
// Amendment 8 적용 대상 `.claude/agents/*.md` 의 컨벤션 (YAML frontmatter 시작) 을 미커버.
// 다중-prefix 허용 케이스: shebang | DOCTYPE | YAML frontmatter (--- ... ---) 1블록.
// 결과: regex 적용 범위 확장만 (의도 동일 — 파일 메타 헤더 직후 첫 컨텐츠 라인).
const DECORATOR_REGEX =
  /^(?:#![^\n]*\n|<!DOCTYPE[^>]*>\n|---\n(?:[\s\S]*?\n)?---\n)?(?:<!--|\/\/|#) HARNESS-DRIFT: Z-PATTERN \[(?:https?:\/\/[^\]]+|TODO)\](?: -->)?/;

/**
 * 파일 확장자별 데코레이터 형식 분기.
 * @returns {'md' | 'line-slash' | 'line-hash' | 'json-sidecar' | 'unknown'}
 */
function decoratorFormatFor(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.md') return 'md';
  if (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.mjs' || ext === '.cjs') {
    return 'line-slash';
  }
  if (ext === '.yml' || ext === '.yaml' || ext === '.sh') return 'line-hash';
  if (ext === '.json') return 'json-sidecar';
  return 'unknown';
}

/**
 * sha256 비교로 manifest drift 파일 목록 산출.
 * @param {string} rootDir
 * @returns {Array<{file: string, reason: string}>}
 */
function detectDriftFiles(rootDir = '.') {
  const manifestAbs = join(rootDir, MANIFEST_PATH);
  if (!existsSync(manifestAbs)) {
    throw new Error(`manifest not found: ${MANIFEST_PATH}`);
  }
  const manifest = JSON.parse(readFileSync(manifestAbs, 'utf-8'));
  const files = manifest.files || {};
  const drifts = [];
  for (const [rel, entry] of Object.entries(files)) {
    const abs = join(rootDir, rel);
    if (!existsSync(abs)) {
      // 매니페스트 등록되어 있으나 파일 부재 — drift 의 한 형태이나 데코레이터 대상 아님
      continue;
    }
    const content = readFileSync(abs);
    const sha = createHash('sha256').update(content).digest('hex');
    const expected = entry.sha256 || entry;
    if (typeof expected === 'string' && sha !== expected) {
      drifts.push({ file: rel, reason: 'sha-mismatch' });
    }
  }
  return drifts;
}

/**
 * 단일 파일에 데코레이터가 정합 박제되어 있는지 검증.
 * @returns {{ok: boolean, reason?: string, format: string}}
 */
function verifyDecorator(absPath) {
  const format = decoratorFormatFor(absPath);

  if (format === 'json-sidecar') {
    // sidecar 파일 경로: <filename>.HARNESS-DRIFT.md
    const sidecar = absPath + '.HARNESS-DRIFT.md';
    if (!existsSync(sidecar)) {
      return { ok: false, reason: `sidecar missing: ${basename(sidecar)}`, format };
    }
    const body = readFileSync(sidecar, 'utf-8');
    if (!DECORATOR_REGEX.test(body)) {
      return { ok: false, reason: `sidecar body decorator missing/invalid`, format };
    }
    return { ok: true, format };
  }

  if (format === 'unknown') {
    // 알 수 없는 확장자는 검증 대상 아님 (drift 가도 데코레이터 의무 아님)
    return { ok: true, format };
  }

  // .md / line-slash / line-hash — 파일 첫 줄 (shebang/DOCTYPE 1줄 허용)
  const content = readFileSync(absPath, 'utf-8');
  if (!DECORATOR_REGEX.test(content)) {
    return { ok: false, reason: 'decorator missing or invalid position', format };
  }
  return { ok: true, format };
}

/**
 * orphan sidecar 탐지 (cross-validate agy 이견 수용).
 * <filename>.HARNESS-DRIFT.md 가 있으나 본 파일 부재 OR drift 해소된 경우 orphan.
 * @param {string} rootDir
 * @param {Set<string>} driftSet — manifest drift 파일 절대경로 Set
 * @returns {Array<{sidecar: string, reason: string}>}
 */
function detectOrphanSidecars(rootDir, driftSet) {
  const orphans = [];
  // 매니페스트 등록된 모든 파일들의 디렉토리 집합 + rootDir + .claude/ 하위 (광범위 fs 스캔 회피)
  const manifest = JSON.parse(readFileSync(join(rootDir, MANIFEST_PATH), 'utf-8'));
  const dirsToScan = new Set();
  dirsToScan.add(rootDir);
  for (const rel of Object.keys(manifest.files || {})) {
    dirsToScan.add(dirname(join(rootDir, rel)));
  }
  // 추가: .claude/ 하위 sidecar 도 스캔 (.json 매니페스트 등록 없이도 사용자가 박제 가능)
  const claudeDir = join(rootDir, '.claude');
  if (existsSync(claudeDir)) dirsToScan.add(claudeDir);

  for (const dir of dirsToScan) {
    if (!existsSync(dir)) continue;
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith('.HARNESS-DRIFT.md')) continue;
      const sidecar = join(dir, name);
      // 본 파일 추정: 접미사 제거
      const baseName = name.replace(/\.HARNESS-DRIFT\.md$/, '');
      const baseAbs = join(dir, baseName);
      if (!existsSync(baseAbs)) {
        orphans.push({ sidecar, reason: 'base file missing' });
        continue;
      }
      if (!driftSet.has(baseAbs)) {
        orphans.push({ sidecar, reason: 'base file not in drift state (Phase 3 cleanup needed)' });
      }
    }
  }
  return orphans;
}

/**
 * 메인 검증 — drift 파일 + 데코레이터 + orphan sidecar.
 * @param {string} rootDir
 * @returns {{drifts: number, passed: number, failed: Array, orphans: Array}}
 */
function runVerify(rootDir = '.') {
  const drifts = detectDriftFiles(rootDir);
  const driftSet = new Set(drifts.map((d) => join(rootDir, d.file)));
  const failed = [];
  let passed = 0;

  for (const { file } of drifts) {
    const abs = join(rootDir, file);
    const result = verifyDecorator(abs);
    if (result.ok) {
      passed++;
    } else {
      failed.push({ file, ...result });
    }
  }

  const orphans = detectOrphanSidecars(rootDir, driftSet);

  return { drifts: drifts.length, passed, failed, orphans };
}

/**
 * Amendment 13 (#766) — 경로가 Forbidden Path deny-list 에 매칭되는지 검사.
 * 범용 harness 가드/페르소나는 allowlist 진입 불가 (옵션 1 Phase 2 대상).
 *
 * @param {string} relPath — repo-relative path (POSIX 구분자)
 * @returns {boolean}
 */
function isForbiddenAllowlistPath(relPath) {
  return FORBIDDEN_ALLOWLIST_PATH_PATTERNS.some((re) => re.test(relPath));
}

/**
 * Amendment 13 (#766) — allowlist self-test 회귀 가드 4중 검증.
 *
 * ADR §변경 사항 2 (b) SSoT:
 *   (1) schema     — path / reason / structuralProof non-empty (structuralProof 비어있지 않은 배열)
 *   (2) positive   — structuralProof 각 원소가 STRUCTURAL_PROOF_ENUM 정확 매칭 (1건 이상)
 *   (3) stale      — path 가 manifest 등록 + 현재 drift 상태 (미충족 시 WARN, FAIL 아님)
 *   (4) Forbidden  — path 가 deny-list 매칭 시 무조건 FAIL (positive 통과해도)
 *
 * @param {Array<{path: string, reason: string, structuralProof: string[]}>} allowlist
 * @param {Set<string>} driftRelSet — 현재 drift 상태 파일의 repo-relative path Set (stale 검증용)
 * @param {Set<string>} manifestRelSet — manifest 등록 파일 repo-relative path Set (stale 검증용)
 * @returns {{errors: string[], warnings: string[]}}
 */
function validateAllowlist(allowlist, driftRelSet, manifestRelSet) {
  const errors = [];
  const warnings = [];

  for (const item of allowlist) {
    const label = item && item.path ? item.path : JSON.stringify(item);

    // (1) schema 검증 — path / reason non-empty string, structuralProof 비어있지 않은 배열
    if (!item || typeof item.path !== 'string' || item.path.length === 0) {
      errors.push(`schema: path 누락/빈값 — ${label}`);
      continue;
    }
    if (typeof item.reason !== 'string' || item.reason.trim().length === 0) {
      errors.push(`schema: reason 누락/빈값 — ${item.path}`);
    }
    if (!Array.isArray(item.structuralProof) || item.structuralProof.length === 0) {
      errors.push(`schema: structuralProof 누락/빈 배열 — ${item.path}`);
      // structuralProof 없으면 positive 검증 불가 → 다음 항목
      continue;
    }

    // (2) 진입 조건 positive — 각 원소 Enum 정확 매칭 (includes() 부분 문자열 아님)
    const matched = item.structuralProof.filter((p) => STRUCTURAL_PROOF_ENUM.includes(p));
    if (matched.length === 0) {
      errors.push(
        `positive: structuralProof Enum 미매칭 — ${item.path} (got ${JSON.stringify(
          item.structuralProof,
        )}, expected ⊆ ${JSON.stringify(STRUCTURAL_PROOF_ENUM)})`,
      );
    }
    // 임의 사유 박제 차단 — Enum 외 원소가 섞이면 FAIL (정확 매칭 강제)
    const invalid = item.structuralProof.filter((p) => !STRUCTURAL_PROOF_ENUM.includes(p));
    if (invalid.length > 0) {
      errors.push(
        `positive: structuralProof Enum 외 원소 — ${item.path} (invalid ${JSON.stringify(invalid)})`,
      );
    }

    // (4) Forbidden Path negative deny-list (hard-FAIL — positive 통과해도 무조건)
    if (isForbiddenAllowlistPath(item.path)) {
      errors.push(
        `forbidden: 범용 harness 가드/페르소나 위장 등록 차단 — ${item.path} (옵션 1 Phase 2 대상, allowlist 진입 불가)`,
      );
    }

    // (3) stale 검증 — manifest 등록 + 현재 drift 상태 (미충족 시 WARN)
    if (driftRelSet && manifestRelSet) {
      if (!manifestRelSet.has(item.path)) {
        warnings.push(`stale: manifest 미등록 — ${item.path} (정리 후보, 후속 #768 에이징)`);
      } else if (!driftRelSet.has(item.path)) {
        warnings.push(`stale: drift 해소됨 — ${item.path} (정리 후보, 후속 #768 에이징)`);
      }
    }
  }

  return { errors, warnings };
}

/**
 * Amendment 9 (#557) — 활성 drift 파일 수 카운트 + N=10 임계 비교 (soft-warn).
 *
 * ADR §Amendment 9 §결정점 5: orphan sidecar 제외, 활성 drift 파일 수만 카운트.
 * 근거: orphan 은 Amendment 8 fail-fast 가드가 이미 처리. 본 가드는 "Z 패턴 활성 적용 누적"
 * 측정이 본질 — drift 파일 수가 정합.
 *
 * Amendment 13 (#766) — PERMANENT_DIVERGENT_ALLOWLIST 제외 추가.
 * 구조적으로 upstream 기여 불가능한 자산 (스크린샷 / 도메인 로드맵) 을 카운트 모수에서 제외.
 * N 임계 불변, 모수 정제 (측정 정밀화). orphan 제외 (§결정점 5) 와 동일 지점.
 *
 * @param {string} rootDir
 * @returns {{count: number, threshold: number, exceeded: boolean, files: string[],
 *            excluded: string[], rawCount: number}}
 */
function runCountWarn(rootDir = '.') {
  const drifts = detectDriftFiles(rootDir);
  const allowSet = new Set(PERMANENT_DIVERGENT_ALLOWLIST.map((a) => a.path));
  const kept = drifts.filter((d) => !allowSet.has(d.file));
  const excluded = drifts.filter((d) => allowSet.has(d.file)).map((d) => d.file);
  const count = kept.length;
  const exceeded = count >= ALERT_FATIGUE_THRESHOLD_N;
  return {
    count,
    threshold: ALERT_FATIGUE_THRESHOLD_N,
    exceeded,
    files: kept.map((d) => d.file),
    excluded,
    rawCount: drifts.length,
  };
}

// =============================================================================
// Amendment 12 (#577) — TODO Aging Guard (시간 누적 차원, Phase 1 다운스트림 분기 한정)
// =============================================================================

/**
 * 파일 안에서 `[TODO]` 박제 라인의 line 번호 목록 추출.
 * `verifyDecorator()` 가 통과한 (= 데코레이터 박제된) 파일만 대상으로 호출.
 *
 * @param {string} absPath — 검사 대상 파일 절대경로 또는 sidecar 경로
 * @returns {number[]} — 1-based line 번호 (없으면 [])
 */
function findTodoLines(absPath) {
  if (!existsSync(absPath)) return [];
  const content = readFileSync(absPath, 'utf-8');
  const lines = content.split('\n');
  const todoLines = [];
  // SSoT regex 의 [TODO] 변형만 매칭 (URL 박제는 Phase 2 진행 중이므로 본 가드 대상 아님)
  const todoPattern = /HARNESS-DRIFT: Z-PATTERN \[TODO\]/;
  for (let i = 0; i < lines.length; i++) {
    if (todoPattern.test(lines[i])) {
      todoLines.push(i + 1);
    }
  }
  return todoLines;
}

/**
 * `git blame` 으로 특정 파일의 특정 라인이 처음 박제된 commit 의 author 시점과 message 추출.
 *
 * porcelain 출력 형식 사용 — author-time + summary 2 줄 파싱.
 *
 * @param {string} filePath — repo-relative path
 * @param {number} lineNum — 1-based line number
 * @param {string} rootDir — repo root (`git -C <rootDir> blame ...` 호출용)
 * @returns {{authorTimeMs: number, summary: string} | null} — 실패 시 null
 */
function getBlameForLine(filePath, lineNum, rootDir = '.') {
  try {
    const out = execFileSync(
      'git',
      ['-C', rootDir, 'blame', '--porcelain', `-L${lineNum},${lineNum}`, '--', filePath],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    let authorTimeSec = null;
    let summary = '';
    for (const line of out.split('\n')) {
      if (line.startsWith('author-time ')) {
        authorTimeSec = parseInt(line.slice('author-time '.length), 10);
      } else if (line.startsWith('summary ')) {
        summary = line.slice('summary '.length);
      }
    }
    if (authorTimeSec === null) return null;
    return { authorTimeMs: authorTimeSec * 1000, summary };
  } catch {
    return null; // git blame 실패 (untracked 파일 등) → 본 가드 대상 외
  }
}

/**
 * Amendment 12 §결정점 3 — harness-managed 카테고리 식별.
 *
 * commit summary 가 `chore(harness):` 로 시작하면 harness update 자동화 commit → upstream 영역.
 * 그 외 prefix (feat / fix / docs / refactor / 그 외 chore) → Phase 1 다운스트림 분기 (본 가드 대상).
 *
 * @param {string} commitSummary
 * @returns {boolean}
 */
function isHarnessManagedCommit(commitSummary) {
  return (
    typeof commitSummary === 'string' && commitSummary.startsWith(HARNESS_MANAGED_COMMIT_PREFIX)
  );
}

/**
 * Amendment 12 메인 검증 로직.
 *
 * 흐름:
 *   1. detectDriftFiles() 로 drift 파일 목록 추출
 *   2. 각 파일의 [TODO] 박제 라인 발견 (sidecar 형식 = json 은 sidecar 파일 검사)
 *   3. git blame 으로 박제 시점 + commit summary 추출
 *   4. harness-managed 카테고리 (commit prefix `chore(harness):`) 제외
 *   5. 시점 - 현재 시간 ≥ 30일 → violations 누적
 *
 * @param {string} rootDir
 * @param {number} [nowMs] — 테스트 주입용 (default: Date.now())
 * @param {(filePath: string, lineNum: number, rootDir: string) => {authorTimeMs: number, summary: string} | null} [blameFn]
 *   — 테스트 주입용 (default: getBlameForLine). 외부 의존성 (git) 격리 차원.
 * @returns {{
 *   threshold: number,
 *   nowMs: number,
 *   violations: Array<{file: string, line: number, agingDays: number, summary: string}>,
 *   skippedHarnessManaged: Array<{file: string, line: number, agingDays: number, summary: string}>,
 *   skippedNonTodo: Array<{file: string, reason: string}>,
 * }}
 */
function runTodoAging(rootDir = '.', nowMs = Date.now(), blameFn = getBlameForLine) {
  const drifts = detectDriftFiles(rootDir);
  const violations = [];
  const skippedHarnessManaged = [];
  const skippedNonTodo = [];

  for (const { file } of drifts) {
    const abs = join(rootDir, file);
    const format = decoratorFormatFor(abs);
    // [TODO] 라인 추출 대상: 본 파일 (md/line-slash/line-hash) 또는 sidecar (json-sidecar)
    const targetPath = format === 'json-sidecar' ? abs + '.HARNESS-DRIFT.md' : abs;
    const targetRel = format === 'json-sidecar' ? file + '.HARNESS-DRIFT.md' : file;
    const todoLines = findTodoLines(targetPath);
    if (todoLines.length === 0) {
      // [TODO] 박제 없음 → upstream PR URL 박제 상태 (Phase 2 진행 중) → 본 가드 대상 외
      skippedNonTodo.push({ file, reason: 'no [TODO] line (URL 박제 = Phase 2 진행 중)' });
      continue;
    }
    // 동일 파일에 여러 [TODO] 라인 있을 수 있으나, 첫 라인 박제 시점만 검사 (가장 오래된 박제)
    const firstTodoLine = todoLines[0];
    const blame = blameFn(targetRel, firstTodoLine, rootDir);
    if (!blame) {
      skippedNonTodo.push({ file, reason: 'git blame 실패 (untracked / 새 파일)' });
      continue;
    }
    const agingMs = nowMs - blame.authorTimeMs;
    const agingDays = Math.floor(agingMs / (1000 * 60 * 60 * 24));

    if (isHarnessManagedCommit(blame.summary)) {
      // harness-managed 영역 — 본 가드 검사 대상 외, 단 가시화 차원에서 별도 분류 추적
      skippedHarnessManaged.push({
        file: targetRel,
        line: firstTodoLine,
        agingDays,
        summary: blame.summary,
      });
      continue;
    }
    if (agingDays >= TODO_AGING_THRESHOLD_DAYS) {
      violations.push({ file: targetRel, line: firstTodoLine, agingDays, summary: blame.summary });
    }
  }

  return {
    threshold: TODO_AGING_THRESHOLD_DAYS,
    nowMs,
    violations,
    skippedHarnessManaged,
    skippedNonTodo,
  };
}

// =============================================================================
// Self-test (인라인 단위 검증 — D1 3중 시뮬레이션)
// =============================================================================

function runSelfTest() {
  let pass = 0;
  let fail = 0;
  const results = [];

  function expect(name, cond, detail = '') {
    if (cond) {
      pass++;
      results.push(`  PASS  ${name}`);
    } else {
      fail++;
      results.push(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
    }
  }

  // --- regex 단위 검증 (positive) ---
  const positives = [
    '<!-- HARNESS-DRIFT: Z-PATTERN [https://github.com/coseo12/harness-setting/pull/248] -->',
    '<!-- HARNESS-DRIFT: Z-PATTERN [TODO] -->',
    '// HARNESS-DRIFT: Z-PATTERN [TODO]',
    '// HARNESS-DRIFT: Z-PATTERN [https://github.com/coseo12/harness-setting/issues/249]',
    '# HARNESS-DRIFT: Z-PATTERN [TODO]',
    '#!/usr/bin/env node\n// HARNESS-DRIFT: Z-PATTERN [TODO]',
    '<!DOCTYPE html>\n<!-- HARNESS-DRIFT: Z-PATTERN [TODO] -->',
    // developer 단계 보완 — YAML frontmatter 1블록 허용 (#556)
    '---\nname: architect\ndescription: "..."\n---\n<!-- HARNESS-DRIFT: Z-PATTERN [TODO] -->',
  ];
  positives.forEach((s, i) => {
    expect(`regex positive #${i + 1}`, DECORATOR_REGEX.test(s), JSON.stringify(s.slice(0, 60)));
  });

  // --- regex 단위 검증 (negative) ---
  const negatives = [
    '<!-- HARNESS-DRIFT: WRONG-KEY [TODO] -->', // 키워드 불일치
    '// HARNESS-DRIFT: Z-PATTERN []', // 빈 링크
    '\n<!-- HARNESS-DRIFT: Z-PATTERN [TODO] -->', // 첫 줄 빈 줄 (위치 위반)
    '/* HARNESS-DRIFT: Z-PATTERN [TODO] */', // 블록 주석 (미지원 형식)
    'HARNESS-DRIFT: Z-PATTERN [TODO]', // 주석 prefix 누락
  ];
  negatives.forEach((s, i) => {
    expect(`regex negative #${i + 1}`, !DECORATOR_REGEX.test(s), JSON.stringify(s.slice(0, 60)));
  });

  // --- decoratorFormatFor 분기 ---
  expect('format .md', decoratorFormatFor('foo.md') === 'md');
  expect('format .ts', decoratorFormatFor('foo.ts') === 'line-slash');
  expect('format .mjs', decoratorFormatFor('foo.mjs') === 'line-slash');
  expect('format .yml', decoratorFormatFor('foo.yml') === 'line-hash');
  expect('format .sh', decoratorFormatFor('foo.sh') === 'line-hash');
  expect('format .json', decoratorFormatFor('foo.json') === 'json-sidecar');
  expect('format unknown', decoratorFormatFor('foo.bin') === 'unknown');

  // --- 3중 시뮬레이션 (positive → negative → recovery) ---
  const tmp = mkdtempSync(join(tmpdir(), 'harness-drift-test-'));
  try {
    // 가상 manifest 환경 구성
    const harnessDir = join(tmp, '.harness');
    const claudeDir = join(tmp, '.claude');
    writeFileSync(join(tmp, 'mock.md'), '<!-- HARNESS-DRIFT: Z-PATTERN [TODO] -->\nhello\n');
    writeFileSync(join(tmp, 'mock.json'), '{"k":1}\n');
    writeFileSync(
      join(tmp, 'mock.json.HARNESS-DRIFT.md'),
      '# HARNESS-DRIFT: Z-PATTERN [TODO]\n원 파일: mock.json\n변경 사유: self-test\n',
    );
    // claude dir 도 만들어 orphan 스캔 정상 동작 검증
    mkdirSync(claudeDir, { recursive: true });
    mkdirSync(harnessDir, { recursive: true });

    // 가상 manifest: 둘 다 drift 상태 (expected sha 와 실제 sha 다르게 박제)
    const fakeManifest = {
      files: {
        'mock.md': { sha256: 'a'.repeat(64) }, // 실제 sha 와 불일치 → drift
        'mock.json': { sha256: 'b'.repeat(64) }, // drift
      },
    };
    writeFileSync(join(harnessDir, 'manifest.json'), JSON.stringify(fakeManifest));

    // positive — 데코레이터 박제 정합
    const positive = runVerify(tmp);
    expect(
      'sim positive: drifts=2 passed=2',
      positive.drifts === 2 && positive.passed === 2 && positive.failed.length === 0,
      JSON.stringify(positive),
    );
    expect('sim positive: orphans=0', positive.orphans.length === 0);

    // negative — md 파일 데코레이터 제거
    writeFileSync(join(tmp, 'mock.md'), 'hello\n');
    const negative = runVerify(tmp);
    expect(
      'sim negative: drifts=2 failed>=1',
      negative.drifts === 2 && negative.failed.length === 1,
      JSON.stringify(negative),
    );

    // recovery — 데코레이터 복원
    writeFileSync(join(tmp, 'mock.md'), '<!-- HARNESS-DRIFT: Z-PATTERN [TODO] -->\nhello\n');
    const recovery = runVerify(tmp);
    expect(
      'sim recovery: passed=2 failed=0',
      recovery.drifts === 2 && recovery.passed === 2 && recovery.failed.length === 0,
      JSON.stringify(recovery),
    );

    // orphan sidecar — mock.json 삭제 후 sidecar 잔존
    rmSync(join(tmp, 'mock.json'));
    delete fakeManifest.files['mock.json'];
    writeFileSync(join(harnessDir, 'manifest.json'), JSON.stringify(fakeManifest));
    const orphanScan = runVerify(tmp);
    expect(
      'sim orphan: orphans>=1',
      orphanScan.orphans.length >= 1,
      JSON.stringify(orphanScan.orphans),
    );

    // --- Amendment 9 (#557) boundary 시뮬레이션 (N-1 / N / N+1) ---
    // ADR §Amendment 9 §회귀 가드 (2) 3중 시뮬레이션 (positive → negative → recovery)
    //
    // 임계 ALERT_FATIGUE_THRESHOLD_N=10 기준 boundary cases:
    //   - N-1 (drift=9) → exceeded=false (정상)
    //   - N   (drift=10) → exceeded=true (경계 발화)
    //   - N+1 (drift=11) → exceeded=true (초과 발화)
    // 가상 manifest 에 K 개 파일 등록 + sha 불일치로 K drift 인위 발생.
    const cwTmp = mkdtempSync(join(tmpdir(), 'harness-drift-cw-'));
    try {
      const cwHarnessDir = join(cwTmp, '.harness');
      mkdirSync(cwHarnessDir, { recursive: true });

      function setupDriftFiles(k) {
        const files = {};
        for (let i = 0; i < k; i++) {
          const name = `cw-mock-${i}.md`;
          writeFileSync(join(cwTmp, name), `content ${i}\n`);
          // 의도적으로 sha 불일치 (실제 sha 와 다른 값 박제) → drift 발생
          files[name] = { sha256: String(i).padStart(64, '0') };
        }
        writeFileSync(join(cwHarnessDir, 'manifest.json'), JSON.stringify({ files }));
      }

      // case 1: N-1 (drift=9, threshold=10) → exceeded=false
      setupDriftFiles(9);
      const cwBelow = runCountWarn(cwTmp);
      expect(
        'count-warn N-1 (drift=9): exceeded=false',
        cwBelow.count === 9 && cwBelow.threshold === 10 && cwBelow.exceeded === false,
        JSON.stringify(cwBelow),
      );

      // case 2: N (drift=10, threshold=10) → exceeded=true (경계 발화)
      // 정리 후 다시 set up
      for (let i = 0; i < 9; i++) rmSync(join(cwTmp, `cw-mock-${i}.md`));
      setupDriftFiles(10);
      const cwBoundary = runCountWarn(cwTmp);
      expect(
        'count-warn N (drift=10): exceeded=true',
        cwBoundary.count === 10 && cwBoundary.threshold === 10 && cwBoundary.exceeded === true,
        JSON.stringify(cwBoundary),
      );

      // case 3: N+1 (drift=11, threshold=10) → exceeded=true (초과 발화)
      for (let i = 0; i < 10; i++) rmSync(join(cwTmp, `cw-mock-${i}.md`));
      setupDriftFiles(11);
      const cwAbove = runCountWarn(cwTmp);
      expect(
        'count-warn N+1 (drift=11): exceeded=true',
        cwAbove.count === 11 && cwAbove.threshold === 10 && cwAbove.exceeded === true,
        JSON.stringify(cwAbove),
      );

      // files 목록이 박제되는지 검증 (CI workflow 가 stdout 파싱하여 자동 이슈 본문 박제)
      expect(
        'count-warn files list: 11 entries',
        Array.isArray(cwAbove.files) && cwAbove.files.length === 11,
        `files.length=${cwAbove.files?.length}`,
      );
    } finally {
      rmSync(cwTmp, { recursive: true, force: true });
    }

    // --- Amendment 11 (#572) sidecar-cleanup boundary 시뮬레이션 (4 cases) ---
    // ADR §Amendment 11 §회귀 가드 4축 §(2) 3중 시뮬레이션 (positive → negative → recovery)
    // + 추가 boundary (drift 상태 sidecar 는 cleanup 대상 아님 — 안전 거부)
    //
    // Cases:
    //   case 1: orphan 0 (정상) → orphans.length === 0
    //   case 2: orphan 2 (base missing + drift 해소) — dry-run (apply=false) → 파일 잔존
    //   case 3: 동일 baseline — apply 실행 → 파일 삭제 + 후속 orphan 0 (recovery)
    //   case 4: drift 상태 sidecar (정상 sidecar) — orphans 에 미포함 (안전 거부)
    const scTmp = mkdtempSync(join(tmpdir(), 'harness-drift-sc-'));
    try {
      const scHarnessDir = join(scTmp, '.harness');
      mkdirSync(scHarnessDir, { recursive: true });

      // baseline 환경: alive.json 은 drift 상태 (정상 sidecar 있음) + 2 orphan sidecar 인공 생성
      writeFileSync(join(scTmp, 'alive.json'), '{"k":1}\n');
      writeFileSync(
        join(scTmp, 'alive.json.HARNESS-DRIFT.md'),
        '# HARNESS-DRIFT: Z-PATTERN [TODO]\n원 파일: alive.json\n사유: self-test\n',
      );
      // orphan 1: base 파일 부재 (base file missing)
      writeFileSync(
        join(scTmp, 'ghost.json.HARNESS-DRIFT.md'),
        '# HARNESS-DRIFT: Z-PATTERN [TODO]\n원 파일: ghost.json (부재)\n',
      );
      // orphan 2: base 파일 존재하나 drift 해소 (manifest sha 일치)
      writeFileSync(join(scTmp, 'resolved.json'), '{"r":1}\n');
      const resolvedSha = createHash('sha256')
        .update(readFileSync(join(scTmp, 'resolved.json')))
        .digest('hex');
      writeFileSync(
        join(scTmp, 'resolved.json.HARNESS-DRIFT.md'),
        '# HARNESS-DRIFT: Z-PATTERN [TODO]\n원 파일: resolved.json (drift 해소됨)\n',
      );

      // alive.json 만 drift, resolved.json 은 sha 일치 (drift 해소)
      const scManifest = {
        files: {
          'alive.json': { sha256: 'c'.repeat(64) }, // drift
          'resolved.json': { sha256: resolvedSha }, // drift 해소
        },
      };
      writeFileSync(join(scHarnessDir, 'manifest.json'), JSON.stringify(scManifest));

      // case 4 (먼저 검증): drift 상태 sidecar 안전 거부 — alive.json.HARNESS-DRIFT.md 는 orphan 아님
      const scDrifts = detectDriftFiles(scTmp);
      const scDriftSet = new Set(scDrifts.map((d) => join(scTmp, d.file)));
      const scOrphans = detectOrphanSidecars(scTmp, scDriftSet);
      const orphanPaths = scOrphans.map((o) => o.sidecar);
      expect(
        'sidecar-cleanup case 4: drift 상태 sidecar 안전 거부 (alive.json.HARNESS-DRIFT.md 제외)',
        !orphanPaths.some((p) => p.endsWith('alive.json.HARNESS-DRIFT.md')),
        JSON.stringify(orphanPaths),
      );

      // case 2 (dry-run): orphan 2 검출 + 파일 잔존 검증
      expect(
        'sidecar-cleanup case 2 (dry-run): orphans=2 (base missing + drift 해소)',
        scOrphans.length === 2,
        JSON.stringify(scOrphans),
      );
      expect(
        'sidecar-cleanup case 2: ghost.json.HARNESS-DRIFT.md 파일 잔존 (dry-run 비파괴)',
        existsSync(join(scTmp, 'ghost.json.HARNESS-DRIFT.md')),
      );
      expect(
        'sidecar-cleanup case 2: resolved.json.HARNESS-DRIFT.md 파일 잔존 (dry-run 비파괴)',
        existsSync(join(scTmp, 'resolved.json.HARNESS-DRIFT.md')),
      );

      // case 3 (apply): orphan 직접 unlink + 후속 orphan 0 검증 (recovery)
      for (const o of scOrphans) {
        unlinkSync(o.sidecar);
      }
      // 후속 verify — orphan 0 + alive.json.HARNESS-DRIFT.md 보존
      const scPostDrifts = detectDriftFiles(scTmp);
      const scPostDriftSet = new Set(scPostDrifts.map((d) => join(scTmp, d.file)));
      const scPostOrphans = detectOrphanSidecars(scTmp, scPostDriftSet);
      expect(
        'sidecar-cleanup case 3 (apply→recovery): orphans=0 후속 확인',
        scPostOrphans.length === 0,
        JSON.stringify(scPostOrphans),
      );
      expect(
        'sidecar-cleanup case 3: alive.json.HARNESS-DRIFT.md 보존 (정상 sidecar 안전)',
        existsSync(join(scTmp, 'alive.json.HARNESS-DRIFT.md')),
      );

      // case 1 (positive baseline): orphan 0 — 정상 sidecar 만 잔존
      // recovery 단계 후 동일 환경 → 이미 orphan 0 검증 완료. 추가로 alive.json 만 sidecar 가짐.
      expect(
        'sidecar-cleanup case 1 (positive baseline): orphan 0 (정상 sidecar 만 잔존)',
        scPostOrphans.length === 0,
      );
    } finally {
      rmSync(scTmp, { recursive: true, force: true });
    }

    // --- Amendment 12 (#577) todo-aging boundary 시뮬레이션 (4 cases) ---
    // ADR §Amendment 12 §회귀 가드 (2) 3중 시뮬레이션 (positive → negative → recovery)
    // + 추가 boundary (harness-managed 제외 휴리스틱)
    //
    // Cases:
    //   case 1: positive  — TODO 박제 29일 경과, prefix `feat:` → violations=0
    //   case 2: negative  — TODO 박제 31일 경과, prefix `feat:` → violations=1
    //   case 3: boundary  — TODO 박제 30일 정확, prefix `feat:` → violations=1 (≥ 30 정합)
    //   case 4: harness-managed 제외 — TODO 박제 90일 경과, prefix `chore(harness):` → skippedHarnessManaged=1, violations=0
    //
    // mock blameFn 으로 git 의존성 격리 (CLAUDE.md §가드 도입 PR DoD §(2) 3중 시뮬레이션).
    const taTmp = mkdtempSync(join(tmpdir(), 'harness-drift-ta-'));
    try {
      const taHarnessDir = join(taTmp, '.harness');
      mkdirSync(taHarnessDir, { recursive: true });

      // mock drift 파일 1개 — [TODO] 데코레이터 박제 + manifest sha 불일치 (drift 진입)
      writeFileSync(join(taTmp, 'aging.md'), '<!-- HARNESS-DRIFT: Z-PATTERN [TODO] -->\nbody\n');
      const taManifest = {
        files: { 'aging.md': { sha256: 'a'.repeat(64) } },
      };
      writeFileSync(join(taHarnessDir, 'manifest.json'), JSON.stringify(taManifest));

      const NOW = 1_800_000_000_000; // 고정 mock 현재 시간 (2027년 정도, 임의)
      const DAY_MS = 24 * 60 * 60 * 1000;

      // case 1: 29일 경과, prefix `feat:` → violations=0
      const mock29 = (path, line, root) => ({
        authorTimeMs: NOW - 29 * DAY_MS,
        summary: 'feat(z-pattern): test commit',
      });
      const r29 = runTodoAging(taTmp, NOW, mock29);
      expect(
        'todo-aging case 1 (positive, 29일): violations=0',
        r29.violations.length === 0 &&
          r29.skippedHarnessManaged.length === 0 &&
          r29.skippedNonTodo.length === 0,
        JSON.stringify({
          violations: r29.violations.length,
          skipped: r29.skippedHarnessManaged.length,
          non: r29.skippedNonTodo.length,
        }),
      );

      // case 2: 31일 경과, prefix `feat:` → violations=1
      const mock31 = (path, line, root) => ({
        authorTimeMs: NOW - 31 * DAY_MS,
        summary: 'feat(z-pattern): test commit',
      });
      const r31 = runTodoAging(taTmp, NOW, mock31);
      expect(
        'todo-aging case 2 (negative, 31일): violations=1 + agingDays=31',
        r31.violations.length === 1 && r31.violations[0].agingDays === 31,
        JSON.stringify(r31.violations),
      );

      // case 3: 30일 정확 → violations=1 (≥ 30 정합)
      const mock30 = (path, line, root) => ({
        authorTimeMs: NOW - 30 * DAY_MS,
        summary: 'feat(z-pattern): test commit',
      });
      const r30 = runTodoAging(taTmp, NOW, mock30);
      expect(
        'todo-aging case 3 (boundary, 30일 정확): violations=1 (≥ 30 정합)',
        r30.violations.length === 1 && r30.violations[0].agingDays === 30,
        JSON.stringify(r30.violations),
      );

      // case 4: 90일 경과 + harness-managed → skippedHarnessManaged=1, violations=0
      const mockHarness = (path, line, root) => ({
        authorTimeMs: NOW - 90 * DAY_MS,
        summary: 'chore(harness): v3.6.0 → v3.7.0 업데이트',
      });
      const rHarness = runTodoAging(taTmp, NOW, mockHarness);
      expect(
        'todo-aging case 4 (harness-managed 제외, 90일): violations=0 + skippedHarnessManaged=1',
        rHarness.violations.length === 0 &&
          rHarness.skippedHarnessManaged.length === 1 &&
          rHarness.skippedHarnessManaged[0].agingDays === 90,
        JSON.stringify({
          violations: rHarness.violations.length,
          skipped: rHarness.skippedHarnessManaged,
        }),
      );

      // case 5 (추가 boundary): isHarnessManagedCommit 단위 검증
      expect(
        'todo-aging case 5: isHarnessManagedCommit positive',
        isHarnessManagedCommit('chore(harness): v3.6.0 업데이트') === true,
      );
      expect(
        'todo-aging case 5: isHarnessManagedCommit negative (feat)',
        isHarnessManagedCommit('feat(z-pattern): TODO 박제') === false,
      );
      expect(
        'todo-aging case 5: isHarnessManagedCommit negative (chore non-harness)',
        isHarnessManagedCommit('chore(docs): typo') === false,
      );
      expect(
        'todo-aging case 5: isHarnessManagedCommit null guard',
        isHarnessManagedCommit(null) === false,
      );
    } finally {
      rmSync(taTmp, { recursive: true, force: true });
    }

    // --- Amendment 13 (#766) — allowlist 회귀 가드 4중 + 3중 시뮬레이션 ---
    // ADR §변경 사항 2 (b) 회귀 가드 4중 + §회귀 가드 (2) 3중 시뮬레이션.
    //
    // 검증 축:
    //   (1) schema      — path/reason/structuralProof non-empty (structuralProof 비어있지 않은 배열)
    //   (2) positive    — structuralProof 각 원소 Enum 정확 매칭 (includes() 부분 문자열 아님)
    //   (3) stale       — manifest 미등록 OR drift 해소 → WARN (FAIL 아님)
    //   (4) Forbidden   — 범용 가드/페르소나 deny-list 매칭 → hard-FAIL (positive 통과해도)
    //
    // 3중 시뮬레이션: positive → negative-1 (Enum 미매칭) → negative-2 (Forbidden Path) → recovery.

    // --- (A) 프로덕션 allowlist 자체 정합 (DoD 6) ---
    // 실 manifest/drift 상태로 stale 검증 (rootDir='.').
    {
      const realDrifts = detectDriftFiles('.');
      const realDriftSet = new Set(realDrifts.map((d) => d.file));
      const realManifest = JSON.parse(readFileSync(join('.', MANIFEST_PATH), 'utf-8'));
      const realManifestSet = new Set(Object.keys(realManifest.files || {}));
      const prod = validateAllowlist(PERMANENT_DIVERGENT_ALLOWLIST, realDriftSet, realManifestSet);
      expect(
        'allowlist production: errors=0 (schema + positive + Forbidden 정합)',
        prod.errors.length === 0,
        JSON.stringify(prod.errors),
      );
      // 프로덕션 5항목은 현재 모두 manifest 등록 + drift 상태여야 함 (stale WARN 0 기대,
      // 단 WARN 은 FAIL 아니므로 pass/fail 영향 없음 — 가시성 로그만).
      if (prod.warnings.length > 0) {
        results.push(`  WARN  allowlist production stale: ${JSON.stringify(prod.warnings)}`);
      }
    }

    // --- (B) self-reference 차단 (DoD 5) — 자기 자신 미포함 + Forbidden 자동 차단 ---
    expect(
      'allowlist self-reference: verify-harness-drift-decorator.mjs 미포함',
      !PERMANENT_DIVERGENT_ALLOWLIST.some((a) =>
        a.path.endsWith('verify-harness-drift-decorator.mjs'),
      ),
    );
    expect(
      'allowlist self-reference: scripts/verify-*.mjs 패턴이 자기 파일 자동 차단',
      isForbiddenAllowlistPath('scripts/verify-harness-drift-decorator.mjs') === true,
    );

    // --- (C) Enum SSoT 단위 검증 ---
    expect(
      'STRUCTURAL_PROOF_ENUM: 3 식별자 (content-asset/domain-doc/perpetual-rewrite)',
      STRUCTURAL_PROOF_ENUM.length === 3 &&
        STRUCTURAL_PROOF_ENUM.includes('content-asset') &&
        STRUCTURAL_PROOF_ENUM.includes('domain-doc') &&
        STRUCTURAL_PROOF_ENUM.includes('perpetual-rewrite'),
      JSON.stringify(STRUCTURAL_PROOF_ENUM),
    );

    // --- (D) 3중 시뮬레이션 (positive → negative-1 → negative-2 → recovery) ---
    // 격리 mock manifest 환경 — 실 manifest 비의존 (stale 검증은 mock drift/manifest Set 주입).
    const alTmp = mkdtempSync(join(tmpdir(), 'harness-drift-al-'));
    try {
      const alHarnessDir = join(alTmp, '.harness');
      mkdirSync(alHarnessDir, { recursive: true });

      // mock manifest + drift 상태 파일 (allowlist stale 검증용)
      writeFileSync(join(alTmp, 'docs-asset.png'), 'binary\n');
      writeFileSync(join(alTmp, 'roadmap.md'), 'content\n');
      const alManifest = {
        files: {
          'docs-asset.png': { sha256: 'a'.repeat(64) }, // drift
          'roadmap.md': { sha256: 'b'.repeat(64) }, // drift
        },
      };
      writeFileSync(join(alHarnessDir, 'manifest.json'), JSON.stringify(alManifest));
      const alDrifts = detectDriftFiles(alTmp);
      const alDriftSet = new Set(alDrifts.map((d) => d.file));
      const alManifestSet = new Set(Object.keys(alManifest.files));

      // positive — 진입 조건 Enum 매칭 + manifest/drift 상태 → errors=0, warnings=0
      const positiveAllow = [
        {
          path: 'docs-asset.png',
          reason: '도메인 콘텐츠 자산',
          structuralProof: ['content-asset', 'perpetual-rewrite'],
        },
        { path: 'roadmap.md', reason: '도메인 전용 로드맵', structuralProof: ['domain-doc'] },
      ];
      const simPositive = validateAllowlist(positiveAllow, alDriftSet, alManifestSet);
      expect(
        'allowlist sim positive: errors=0 warnings=0',
        simPositive.errors.length === 0 && simPositive.warnings.length === 0,
        JSON.stringify(simPositive),
      );

      // negative-1 — 임의 사유 (Enum 미매칭) → schema 통과해도 positive FAIL
      const negEnum = [
        { path: 'docs-asset.png', reason: '발화 잦아 부담', structuralProof: ['too-noisy'] },
      ];
      const simNegEnum = validateAllowlist(negEnum, alDriftSet, alManifestSet);
      expect(
        'allowlist sim negative-1 (Enum 미매칭): errors>=1',
        simNegEnum.errors.length >= 1 && simNegEnum.errors.some((e) => e.startsWith('positive')),
        JSON.stringify(simNegEnum.errors),
      );

      // negative-2 (Forbidden Path) — 범용 가드 위장 등록 → positive 통과해도 hard-FAIL
      const negForbidden = [
        {
          path: 'scripts/verify-z-pattern-health.mjs',
          reason: '위장 등록 (CI 우회 시도)',
          structuralProof: ['content-asset'], // positive 는 통과하나 deny-list 매칭
        },
      ];
      const simNegForbidden = validateAllowlist(negForbidden, alDriftSet, alManifestSet);
      expect(
        'allowlist sim negative-2 (Forbidden Path): errors>=1 (hard-FAIL)',
        simNegForbidden.errors.length >= 1 &&
          simNegForbidden.errors.some((e) => e.startsWith('forbidden')),
        JSON.stringify(simNegForbidden.errors),
      );
      // Forbidden 추가 단위 — CLAUDE.md / agents / skills / workflows 패턴
      expect('Forbidden Path: CLAUDE.md', isForbiddenAllowlistPath('CLAUDE.md') === true);
      expect(
        'Forbidden Path: .claude/agents/architect.md',
        isForbiddenAllowlistPath('.claude/agents/architect.md') === true,
      );
      expect(
        'Forbidden Path: .claude/skills/create-pr/SKILL.md',
        isForbiddenAllowlistPath('.claude/skills/create-pr/SKILL.md') === true,
      );
      expect(
        'Forbidden Path: .github/workflows/harness-guards.yml',
        isForbiddenAllowlistPath('.github/workflows/harness-guards.yml') === true,
      );
      expect(
        'Forbidden Path negative: docs/screenshots/01-solar-system.png 비매칭',
        isForbiddenAllowlistPath('docs/screenshots/01-solar-system.png') === false,
      );

      // negative-3 (schema) — reason 빈값 → schema FAIL
      const negSchema = [
        { path: 'docs-asset.png', reason: '', structuralProof: ['content-asset'] },
      ];
      const simNegSchema = validateAllowlist(negSchema, alDriftSet, alManifestSet);
      expect(
        'allowlist sim negative-3 (빈 reason): schema errors>=1',
        simNegSchema.errors.some((e) => e.startsWith('schema')),
        JSON.stringify(simNegSchema.errors),
      );

      // stale — manifest 미등록 → WARN (FAIL 아님, errors=0)
      const staleAllow = [
        { path: 'ghost.png', reason: '해소된 자산', structuralProof: ['content-asset'] },
      ];
      const simStale = validateAllowlist(staleAllow, alDriftSet, alManifestSet);
      expect(
        'allowlist sim stale: warnings>=1 errors=0 (WARN not FAIL)',
        simStale.warnings.length >= 1 && simStale.errors.length === 0,
        JSON.stringify(simStale),
      );

      // recovery — Enum 매칭 + deny-list 비매칭 + manifest/drift 정합 사유로 정정 → errors=0
      const recovered = validateAllowlist(positiveAllow, alDriftSet, alManifestSet);
      expect(
        'allowlist sim recovery: errors=0 (정정 후 PASS)',
        recovered.errors.length === 0,
        JSON.stringify(recovered.errors),
      );

      // --- (E) count-warn allowlist 제외 시뮬레이션 (positive: 제외 후 < N) ---
      // mock 으로 drift=12 (allowlist 2개 포함) → 제외 후 10 (= N) vs 제외 안 하면 12.
      // ADR §회귀 가드 (4) 메타 측정 자기 적용 안정성: 모수 정제로 카운트 변화 검증.
      const cwAlTmp = mkdtempSync(join(tmpdir(), 'harness-drift-cw-al-'));
      try {
        const cwAlHarnessDir = join(cwAlTmp, '.harness');
        mkdirSync(cwAlHarnessDir, { recursive: true });
        // 실 allowlist 의 첫 2개 path 를 mock drift 로 등록 + 일반 drift 8개 → raw 10, 제외 후 8.
        const allowPaths = PERMANENT_DIVERGENT_ALLOWLIST.slice(0, 2).map((a) => a.path);
        const cwAlFiles = {};
        for (const p of allowPaths) {
          mkdirSync(join(cwAlTmp, dirname(p)), { recursive: true });
          writeFileSync(join(cwAlTmp, p), 'x\n');
          cwAlFiles[p] = { sha256: 'f'.repeat(64) };
        }
        for (let i = 0; i < 8; i++) {
          const name = `plain-${i}.md`;
          writeFileSync(join(cwAlTmp, name), `c ${i}\n`);
          cwAlFiles[name] = { sha256: String(i).padStart(64, '0') };
        }
        writeFileSync(join(cwAlHarnessDir, 'manifest.json'), JSON.stringify({ files: cwAlFiles }));
        const cwAl = runCountWarn(cwAlTmp);
        expect(
          'count-warn allowlist 제외: rawCount=10 → count=8 (allowlist 2 제외)',
          cwAl.rawCount === 10 && cwAl.count === 8 && cwAl.excluded.length === 2,
          JSON.stringify({ raw: cwAl.rawCount, count: cwAl.count, excluded: cwAl.excluded }),
        );
        expect(
          'count-warn allowlist 제외: exceeded=false (8 < N=10)',
          cwAl.exceeded === false,
          JSON.stringify(cwAl),
        );
      } finally {
        rmSync(cwAlTmp, { recursive: true, force: true });
      }
    } finally {
      rmSync(alTmp, { recursive: true, force: true });
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  console.log(results.join('\n'));
  console.log(`\nself-test: ${pass} passed, ${fail} failed`);
  return fail === 0 ? 0 : 1;
}

// =============================================================================
// CLI entrypoint
// =============================================================================

/**
 * Amendment 9 (#557) / Amendment 11 (#572) — CLI 인자 파싱 헬퍼.
 * 지원: `--mode=verify|count-warn|sidecar-cleanup` (기본 'verify' — Amendment 8 회귀 0 보장).
 */
function parseMode(args) {
  const flag = args.find((a) => a.startsWith('--mode='));
  if (!flag) return 'verify';
  const value = flag.slice('--mode='.length);
  if (
    value !== 'verify' &&
    value !== 'count-warn' &&
    value !== 'sidecar-cleanup' &&
    value !== 'todo-aging'
  ) {
    console.error(
      `ERROR: invalid --mode value: ${value} (expected: verify | count-warn | sidecar-cleanup | todo-aging)`,
    );
    process.exit(2);
  }
  return value;
}

/**
 * Amendment 9 (#557) — count-warn 모드 실행.
 * soft-warn 동작: exit 0 + stdout 마커 박제 (CI workflow grep 파싱용).
 */
function mainCountWarn() {
  try {
    const { count, threshold, exceeded, files, excluded, rawCount } = runCountWarn('.');

    // Amendment 13 (#766) — allowlist 제외 내역 투명성 박제 (모수 정제 가시화).
    if (excluded.length > 0) {
      console.log(`raw drift files: ${rawCount}`);
      console.log(
        `allowlist 제외 ${excluded.length}건 (영구 divergent — 구조적 기여 불가능): ${excluded.join(', ')}`,
      );
    }
    console.log(`harness drift files: ${count}`);
    console.log(`alert fatigue threshold (N): ${threshold}`);

    if (!exceeded) {
      console.log(`alert fatigue: OK (drift ${count} < N=${threshold})`);
      process.exit(0);
    }

    // soft-warn 발화 — CI workflow 가 grep "[Alert Fatigue Trigger]" 로 감지
    console.log('');
    console.log(`${ALERT_FATIGUE_MARKER} drift ${count} >= N=${threshold}`);
    console.log('drift files:');
    for (const f of files) {
      console.log(`  - ${f}`);
    }
    console.log('');
    // Amendment 13 (#766) — 모수 정제 후에도 잔여 ≥ N 이면 옵션 1 (Phase 2) 이 카운트 해소 주 경로.
    console.log(
      'allowlist 제외 후에도 잔여 카운트 ≥ N — 옵션 1 (Phase 2 upstream 기여) 이 카운트 해소 주 경로.',
    );
    console.log('조치 (ADR 20260515 §Amendment 9 §결정점 2 옵션 A):');
    console.log('  3 영업일 내 [Alert Fatigue Trigger] discussion 이슈 결정 분기 의무.');
    console.log('  옵션: (1) Phase 2 가속 — 점진 drift 해소');
    console.log('       (2) 일부 Phase 1 revert — 긴급 정리');
    console.log('       (3) N 임계값 재조정 — Amendment 2/7 silent 약화 사이클 답습 (신중)');
    // soft-warn — exit 0 유지 (CI hard-block 아님, Amendment 8 §결정점 3b 옵션 A 정합)
    process.exit(0);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(2);
  }
}

/**
 * Amendment 11 (#572) — sidecar-cleanup 모드 실행.
 *
 * orphan sidecar 자동 정리 (opt-in). 기본은 dry-run (목록 출력만), `--apply` 명시 시 실제 삭제.
 *
 * 안전 장치:
 *   - detectOrphanSidecars() 가 식별한 orphan 만 삭제 (정상 sidecar 는 대상 아님)
 *   - 휴리스틱 SSoT 단일화 — verify 모드와 동일 헬퍼 호출 (코드 중복 0)
 *   - manifest 부재 / 실행 에러 시 exit 2 (자동 삭제 차단)
 *
 * @param {boolean} apply — true 면 실제 file unlink, false 면 dry-run (목록만)
 */
function mainSidecarCleanup({ apply }) {
  try {
    // detectOrphanSidecars() 가 manifest 의 driftSet 을 인자로 받으므로 runVerify 와 동일 패턴 답습.
    const drifts = detectDriftFiles('.');
    const driftSet = new Set(drifts.map((d) => join('.', d.file)));
    const orphans = detectOrphanSidecars('.', driftSet);

    if (orphans.length === 0) {
      console.log('no orphan sidecars (sidecar lifecycle 정합)');
      process.exit(0);
    }

    if (!apply) {
      // dry-run 기본 — ADR §Amendment 11 §결정점 3 출력 형식 SSoT
      console.log(`${SIDECAR_CLEANUP_DRY_RUN_MARKER} orphan sidecars detected: ${orphans.length}`);
      for (const o of orphans) {
        console.log(`  - ${o.sidecar} — ${o.reason}`);
      }
      console.log('');
      console.log('조치 (ADR 20260515 §Amendment 11 §결정점 3):');
      console.log('  --apply 명시 시 실제 삭제. 미명시 시 본 출력만 (exit 0).');
      console.log('  수동 정리: rm <sidecar path>');
      process.exit(0);
    }

    // --apply 명시 — 실제 삭제 (orphan 만, 안전 장치 보호)
    console.log(`${SIDECAR_CLEANUP_APPLY_MARKER} orphan sidecars deleted: ${orphans.length}`);
    for (const o of orphans) {
      unlinkSync(o.sidecar);
      console.log(`  - ${o.sidecar} (${o.reason})`);
    }
    process.exit(0);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(2);
  }
}

/**
 * Amendment 12 (#577) — todo-aging 모드 실행.
 * soft-warn 동작 (Amendment 9/10 답습): exit 0 + stdout 마커 박제.
 */
function mainTodoAging() {
  try {
    const { threshold, violations, skippedHarnessManaged, skippedNonTodo } = runTodoAging('.');
    console.log(`TODO aging threshold (days): ${threshold}`);
    console.log(
      `violations (Phase 1 다운스트림 분기, ≥ ${threshold}일 경과): ${violations.length}`,
    );
    console.log(`harness-managed 제외 (upstream 영역): ${skippedHarnessManaged.length}`);
    console.log(`skipped (no [TODO] / git blame 실패): ${skippedNonTodo.length}`);

    if (skippedHarnessManaged.length > 0) {
      console.log('\nharness-managed [TODO] (참고 — upstream 영역, 본 가드 대상 외):');
      for (const s of skippedHarnessManaged) {
        console.log(`  - ${s.file}:${s.line} (${s.agingDays}일 경과, "${s.summary}")`);
      }
    }

    if (violations.length === 0) {
      console.log('\n[OK] TODO aging 정합 — Phase 1 다운스트림 분기 영역 위반 0');
      process.exit(0);
    }

    // soft-warn 발화 — CI workflow 가 grep "[TODO Aging Trigger]" 로 감지
    console.log('');
    console.log(`${TODO_AGING_MARKER} violations: ${violations.length}`);
    console.log('violation files:');
    for (const v of violations) {
      console.log(`  - ${v.file}:${v.line} (${v.agingDays}일 경과, "${v.summary}")`);
    }
    console.log('');
    console.log('조치 (ADR 20260515 §Amendment 12 §결정점 4 옵션 B):');
    console.log('  3 영업일 내 [TODO Aging Trigger] discussion 이슈 결정 분기 의무.');
    console.log('  옵션: (1) Phase 2 가속 — upstream PR 제출');
    console.log('       (2) Phase 1 revert — 임시 변경 폐기');
    console.log('       (3) 임계값 재조정 — Amendment 2/7 silent 약화 사이클 답습 (신중)');
    console.log('');
    console.log('우선순위 (§재검토 조건 #5 > #6 > #7): Phase 2 진행률 > drift 카운트 > TODO Aging');
    // soft-warn — exit 0 유지 (CI hard-block 아님, Amendment 8 §결정점 3b 옵션 A 정합)
    process.exit(0);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(2);
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    process.exit(runSelfTest());
  }

  const mode = parseMode(args);
  if (mode === 'count-warn') {
    mainCountWarn();
    return;
  }
  if (mode === 'sidecar-cleanup') {
    const apply = args.includes('--apply');
    mainSidecarCleanup({ apply });
    return;
  }
  if (mode === 'todo-aging') {
    mainTodoAging();
    return;
  }

  // mode === 'verify' (기본) — Amendment 8 데코레이터 가드 (fail-fast)
  try {
    const { drifts, passed, failed, orphans } = runVerify('.');
    console.log(`harness drift files: ${drifts}`);
    console.log(`decorator PASS: ${passed}`);
    console.log(`decorator FAIL: ${failed.length}`);
    console.log(`orphan sidecars: ${orphans.length}`);

    if (failed.length > 0) {
      console.error('\n[FAIL] 데코레이터 누락/오류:');
      for (const f of failed) {
        console.error(`  - ${f.file} (${f.format}) — ${f.reason}`);
      }
    }
    if (orphans.length > 0) {
      console.error('\n[FAIL] orphan sidecar:');
      for (const o of orphans) {
        console.error(`  - ${o.sidecar} — ${o.reason}`);
      }
    }

    if (failed.length > 0 || orphans.length > 0) {
      console.error(
        '\n조치: ADR 20260515 §Amendment 8 의 데코레이터 박제 의무 (Phase 1 운영 절차 단계 2) 적용.',
      );
      process.exit(1);
    }
    console.log('\n[OK] 모든 drift 파일에 데코레이터 정합 박제');
    process.exit(0);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(2);
  }
}

// import 시 자기 실행 회피
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export {
  DECORATOR_REGEX,
  decoratorFormatFor,
  detectDriftFiles,
  verifyDecorator,
  detectOrphanSidecars,
  runVerify,
  runCountWarn,
  runTodoAging,
  findTodoLines,
  getBlameForLine,
  isHarnessManagedCommit,
  isForbiddenAllowlistPath,
  validateAllowlist,
  ALERT_FATIGUE_THRESHOLD_N,
  ALERT_FATIGUE_MARKER,
  SIDECAR_CLEANUP_DRY_RUN_MARKER,
  SIDECAR_CLEANUP_APPLY_MARKER,
  TODO_AGING_THRESHOLD_DAYS,
  TODO_AGING_MARKER,
  HARNESS_MANAGED_COMMIT_PREFIX,
  PERMANENT_DIVERGENT_ALLOWLIST,
  STRUCTURAL_PROOF_ENUM,
  FORBIDDEN_ALLOWLIST_PATH_PATTERNS,
};
