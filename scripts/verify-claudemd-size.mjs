#!/usr/bin/env node
/**
 * verify-claudemd-size.mjs
 *
 * #905 — CLAUDE.md 각인 예산 가드 (fail-fast 복구).
 *
 * 배경: 기존 scripts/verify-claudemd-size.sh 는 upstream lib/verify-claudemd-size.js 를
 * exec 했으나 lib 배포 누락 (upstream v3.6.0) 으로 로컬 MODULE_NOT_FOUND + CI hashFiles
 * 조건 silent skip (#338 임시 패치) 상태가 지속 — CLAUDE.md 가 35k warn 을 초과한
 * (실측 36,817 chars) 상태에서도 경보가 0회 발화했다. #842 가 verify-docs-links 에
 * 적용한 것과 동형으로 다운스트림 자체 가드로 신설. 기존 .sh wrapper 는 manifest
 * 등재 (harness-managed) 라 유지하고 CI 만 본 파일을 무조건 실행하도록 교체.
 *
 * 임계 계약 SSoT: docs/guides/claudemd-governance.md §3 (정량 게이트)
 *   - 측정 단위: Unicode code point (`[...str].length`) — locale 독립 (#203 근거:
 *     `wc -m` 은 locale 미설치 runner 에서 바이트 폴백 → 한글 62% 부풀림 오탐)
 *   - x < 35k          : pass (조용)
 *   - 35k <= x < 40k   : 경계 경보 (stdout, exit 0)
 *   - 40k <= x < 45k   : PR warn (stdout, exit 0 — 신규 인라인 블록 금지 안내)
 *   - x >= 45k         : fail (stderr, exit 1 — 감축 PR 강제)
 *
 * 환경변수 override (기존 .sh 헤더가 문서화한 인터페이스 유지):
 *   CLAUDEMD_FILE                     : 검사 대상 파일 (기본 <repo>/CLAUDE.md)
 *   CLAUDEMD_SIZE_LIMIT_WARN_BOUNDARY : 경계 경보 임계 (기본 35000)
 *   CLAUDEMD_SIZE_LIMIT_WARN_PR       : PR warn 임계 (기본 40000)
 *   CLAUDEMD_SIZE_LIMIT_FAIL          : fail 임계 (기본 45000)
 *
 * 종료 코드:
 *   0 — pass 또는 warn (35k/40k 구간)
 *   1 — fail (45k 이상)
 *   2 — 실행 에러 (대상 파일 부재 / 임계값 비정상 / 임계 역전)
 *
 * fail-fast 계약 (CLAUDE.md §가드 설계 원칙): 대상 파일 부재·임계 역전 시 exit 2 —
 * silent pass fallback 분기 금지.
 *
 * 호출:
 *   node scripts/verify-claudemd-size.mjs               # 검사 (CI 기본)
 *   node scripts/verify-claudemd-size.mjs --self-test   # fixture 주입 3중 시뮬 + 경계 전수
 *
 * 관련: 이슈 #905 / #842 (동형 선례) / docs/lessons/guard-pr-dod.md (4축 검증)
 */
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SCRIPT_PATH), '..');

// 임계 기본값 — governance §3 표와 동일 (재조정 시 가이드 표와 동일 PR 로 갱신)
const DEFAULT_WARN_BOUNDARY = 35_000;
const DEFAULT_WARN_PR = 40_000;
const DEFAULT_FAIL = 45_000;

// 출력 마커 — self-test 가 stdout/stderr 대조에 사용하는 계약 문자열
const MARK_PASS = '[PASS]';
const MARK_WARN_BOUNDARY = '[WARN-BOUNDARY]';
const MARK_WARN_PR = '[WARN-PR]';
const MARK_FAIL = '[FAIL]';

function fmt(n) {
  return n.toLocaleString('en-US');
}

function readThreshold(envName, fallback) {
  const raw = process.env[envName];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    console.error(`실행 에러: ${envName} 가 유효한 양의 정수가 아님: "${raw}"`);
    process.exit(2);
  }
  return n;
}

/** Unicode code point 단위 측정 — governance §3.2 계약. 바이트(Buffer.length) 금지. */
function countCodePoints(filePath) {
  const text = readFileSync(filePath, 'utf8');
  return [...text].length;
}

function runCheck() {
  const target = process.env.CLAUDEMD_FILE ?? join(ROOT, 'CLAUDE.md');
  const warnBoundary = readThreshold('CLAUDEMD_SIZE_LIMIT_WARN_BOUNDARY', DEFAULT_WARN_BOUNDARY);
  const warnPr = readThreshold('CLAUDEMD_SIZE_LIMIT_WARN_PR', DEFAULT_WARN_PR);
  const failLimit = readThreshold('CLAUDEMD_SIZE_LIMIT_FAIL', DEFAULT_FAIL);

  // 임계 역전 방어 — 역전 상태로 판정하면 가드 자체가 무의미 (fail-fast)
  if (!(warnBoundary < warnPr && warnPr < failLimit)) {
    console.error(
      `실행 에러: 임계 역전 — warnBoundary(${fmt(warnBoundary)}) < warnPr(${fmt(warnPr)}) < fail(${fmt(failLimit)}) 이어야 함`,
    );
    process.exit(2);
  }

  // fail-fast: 대상 부재 시 silent pass 금지
  if (!existsSync(target)) {
    console.error(`실행 에러: 검사 대상 파일 부재 — ${target}`);
    process.exit(2);
  }

  const count = countCodePoints(target);
  const pctOfFail = ((count / failLimit) * 100).toFixed(1);

  if (count >= failLimit) {
    console.error(
      `${MARK_FAIL} CLAUDE.md ${fmt(count)} chars — fail 임계 ${fmt(failLimit)} 초과. ` +
        `감축 PR 필수 (docs/guides/claudemd-governance.md §1 각인층/참조층 분리).`,
    );
    process.exit(1);
  }
  if (count >= warnPr) {
    console.log(
      `${MARK_WARN_PR} CLAUDE.md ${fmt(count)} chars — PR warn 임계 ${fmt(warnPr)} 초과 ` +
        `(fail ${fmt(failLimit)} 의 ${pctOfFail}%). 신규 인라인 블록 추가 금지 — ` +
        `docs/ 참조층으로 추출할 것 (governance §2 추출 기준).`,
    );
    process.exit(0);
  }
  if (count >= warnBoundary) {
    console.log(
      `${MARK_WARN_BOUNDARY} CLAUDE.md ${fmt(count)} chars — 경계 경보 임계 ${fmt(warnBoundary)} 초과 ` +
        `(fail ${fmt(failLimit)} 의 ${pctOfFail}%). 신규 블록 추가 시 governance §1.3 판정 질문 적용 권장.`,
    );
    process.exit(0);
  }
  console.log(`${MARK_PASS} CLAUDE.md ${fmt(count)} chars — 예산 ${fmt(warnBoundary)} 이내.`);
  process.exit(0);
}

// =============================================================================
// --self-test — fixture 주입 3중 시뮬 (positive → negative → recovery) + 경계 전수
// =============================================================================

function runSelfTest() {
  const dir = mkdtempSync(join(tmpdir(), 'claudemd-size-selftest-'));
  let pass = 0;
  let fail = 0;

  /** 자식 프로세스로 본 스크립트를 재실행 — 실제 CLI 경로 그대로 검증 */
  const invoke = (fixturePath, extraEnv = {}) =>
    spawnSync(process.execPath, [SCRIPT_PATH], {
      encoding: 'utf8',
      env: { ...process.env, CLAUDEMD_FILE: fixturePath, ...extraEnv },
    });

  const assert = (name, cond, detail = '') => {
    if (cond) {
      pass += 1;
      console.log(`  ok   ${name}`);
    } else {
      fail += 1;
      console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    }
  };

  /** ASCII n chars fixture (code point == byte 로 단순) */
  const asciiFixture = (name, n) => {
    const p = join(dir, name);
    writeFileSync(p, 'a'.repeat(n));
    return p;
  };

  try {
    console.log('self-test: verify-claudemd-size.mjs (fixture 주입)');

    // --- 3중 시뮬 (guard-pr-dod 4축 중 축 2) ---
    // positive: 예산 이내 → exit 0, 조용 (warn 마커 없음)
    const posPath = asciiFixture('positive.md', 10_000);
    const pos = invoke(posPath);
    assert('positive: 10k → exit 0', pos.status === 0, `status=${pos.status}`);
    assert('positive: PASS 마커 출력', pos.stdout.includes(MARK_PASS), pos.stdout.trim());
    assert(
      'positive: warn/fail 마커 없음',
      !pos.stdout.includes('WARN') && !pos.stderr.includes(MARK_FAIL),
    );

    // negative: 45k 초과 → exit 1 + stderr fail 마커
    const negPath = asciiFixture('negative.md', 46_000);
    const neg = invoke(negPath);
    assert('negative: 46k → exit 1', neg.status === 1, `status=${neg.status}`);
    assert('negative: FAIL 마커 stderr 출력', neg.stderr.includes(MARK_FAIL), neg.stderr.trim());

    // recovery: 동일 파일을 감축 후 재검사 → exit 0
    writeFileSync(negPath, 'a'.repeat(20_000));
    const rec = invoke(negPath);
    assert('recovery: 감축 후 exit 0', rec.status === 0, `status=${rec.status}`);
    assert('recovery: PASS 마커 출력', rec.stdout.includes(MARK_PASS));

    // --- 경계 전수 (off-by-one — governance §3 표의 "이상/미만" 계약) ---
    const b1 = invoke(asciiFixture('b34999.md', 34_999));
    assert('경계: 34,999 → 조용한 pass', b1.status === 0 && b1.stdout.includes(MARK_PASS));
    const b2 = invoke(asciiFixture('b35000.md', 35_000));
    assert(
      '경계: 35,000 → 경계 경보 (exit 0)',
      b2.status === 0 && b2.stdout.includes(MARK_WARN_BOUNDARY),
      `status=${b2.status} stdout=${b2.stdout.trim()}`,
    );
    const b3 = invoke(asciiFixture('b39999.md', 39_999));
    assert(
      '경계: 39,999 → 경계 경보 유지',
      b3.status === 0 && b3.stdout.includes(MARK_WARN_BOUNDARY),
    );
    const b4 = invoke(asciiFixture('b40000.md', 40_000));
    assert(
      '경계: 40,000 → PR warn (exit 0)',
      b4.status === 0 && b4.stdout.includes(MARK_WARN_PR),
      `status=${b4.status} stdout=${b4.stdout.trim()}`,
    );
    const b5 = invoke(asciiFixture('b44999.md', 44_999));
    assert(
      '경계: 44,999 → PR warn 유지 (exit 0)',
      b5.status === 0 && b5.stdout.includes(MARK_WARN_PR),
    );
    const b6 = invoke(asciiFixture('b45000.md', 45_000));
    assert('경계: 45,000 → fail (exit 1)', b6.status === 1 && b6.stderr.includes(MARK_FAIL));

    // --- 멀티바이트 회귀 (#203 원 버그 클래스: 바이트 카운트 시 한글 3배 부풀림) ---
    // 한글 36k code points = UTF-8 108KB. 바이트 측정 버그면 fail(45k) 오탐,
    // code point 측정이면 경계 경보 구간이 정답.
    const krPath = join(dir, 'korean.md');
    writeFileSync(krPath, '가'.repeat(36_000));
    const kr = invoke(krPath);
    assert(
      '멀티바이트: 한글 36k code points → 경계 경보 (바이트 오탐 없음)',
      kr.status === 0 && kr.stdout.includes(MARK_WARN_BOUNDARY),
      `status=${kr.status} stdout=${kr.stdout.trim()} stderr=${kr.stderr.trim()}`,
    );

    // --- fail-fast 계약 (실행 에러 exit 2) ---
    const missing = invoke(join(dir, 'does-not-exist.md'));
    assert('fail-fast: 대상 부재 → exit 2', missing.status === 2, `status=${missing.status}`);
    const inverted = invoke(posPath, {
      CLAUDEMD_SIZE_LIMIT_WARN_BOUNDARY: '45000',
      CLAUDEMD_SIZE_LIMIT_FAIL: '35000',
    });
    assert('fail-fast: 임계 역전 → exit 2', inverted.status === 2, `status=${inverted.status}`);
    const badEnv = invoke(posPath, { CLAUDEMD_SIZE_LIMIT_FAIL: 'abc' });
    assert('fail-fast: 임계 비정수 → exit 2', badEnv.status === 2, `status=${badEnv.status}`);

    // --- 환경변수 override 인터페이스 (기존 .sh 계약 유지) ---
    const ov = invoke(asciiFixture('override.md', 150), {
      CLAUDEMD_SIZE_LIMIT_WARN_BOUNDARY: '100',
      CLAUDEMD_SIZE_LIMIT_WARN_PR: '200',
      CLAUDEMD_SIZE_LIMIT_FAIL: '300',
    });
    assert(
      'override: 축소 임계로 경계 경보 재현',
      ov.status === 0 && ov.stdout.includes(MARK_WARN_BOUNDARY),
      `status=${ov.status}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  console.log(`\nself-test: ${pass} passed, ${fail} failed`);
  return fail === 0 ? 0 : 1;
}

if (process.argv.includes('--self-test')) {
  process.exit(runSelfTest());
}
runCheck();
