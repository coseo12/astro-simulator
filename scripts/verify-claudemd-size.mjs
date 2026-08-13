#!/usr/bin/env node
/**
 * verify-claudemd-size.mjs
 *
 * #905 — CLAUDE.md 각인 예산 가드 (fail-fast 복구).
 *
 * 배경: 기존 scripts/verify-claudemd-size.sh 는 upstream lib/verify-claudemd-size.js 를
 * exec 했으나 lib 배포 누락 (upstream v3.6.0) 으로 로컬 MODULE_NOT_FOUND + CI hashFiles
 * 조건 silent skip (#338 임시 패치) 상태가 지속 — CLAUDE.md 가 당시 경보 임계 35k 를
 * 초과한 (실측 36,817 chars) 상태에서도 경보가 0회 발화했다. #842 가 verify-docs-links
 * 에 적용한 것과 동형으로 다운스트림 자체 가드로 신설. 당시 .sh wrapper 는 manifest
 * 등재 (harness-managed) 라 유지했으나, #907 디커플로 manifest 체제가 소멸해 유지
 * 근거가 사라졌고 실행 시 MODULE_NOT_FOUND 만 내므로 #975 에서 삭제했다.
 *
 * SSoT 분담 (#975 — 순환 참조 아님):
 *   - 임계 **계약** (게이트 의미 / 재조정 절차) : docs/guides/claudemd-governance.md §3
 *   - 임계 **값** (실행 기준)                   : 본 파일 아래 DEFAULT_* 상수
 *     (가드가 이 파일 하나뿐이라 값 변경은 1곳. 재조정 시 양쪽을 동일 PR 에서 갱신)
 *
 * 임계 계약 상세 (SSoT 는 위 가이드 §3):
 *   - 측정 단위: Unicode code point (`[...str].length`) — locale 독립 (#203 근거:
 *     `wc -m` 은 locale 미설치 runner 에서 바이트 폴백 → 한글 62% 부풀림 오탐)
 *   - x < 33k          : pass (조용)
 *   - 33k <= x < 40k   : 경계 경보 (stdout, exit 0)
 *   - 40k <= x < 45k   : PR warn (stdout, exit 0 — 신규 인라인 블록 금지 안내)
 *   - x >= 45k         : fail (stderr, exit 1 — 감축 PR 강제)
 *
 * 환경변수 override (기존 .sh 헤더가 문서화한 인터페이스 유지):
 *   CLAUDEMD_FILE                     : 검사 대상 파일 (기본 <repo>/CLAUDE.md)
 *   CLAUDEMD_SIZE_LIMIT_WARN_BOUNDARY : 경계 경보 임계 (기본 33000)
 *   CLAUDEMD_SIZE_LIMIT_WARN_PR       : PR warn 임계 (기본 40000)
 *   CLAUDEMD_SIZE_LIMIT_FAIL          : fail 임계 (기본 45000)
 *
 * 종료 코드:
 *   0 — pass 또는 warn (33k/40k 구간)
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
// 35,000 → 33,000 하향 (#980 축 B). 근거·재조정 이력은 governance §3.1.1
const DEFAULT_WARN_BOUNDARY = 33_000;
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

  // 문구 계약 (#988): 아래 3개 판정이 모두 `>=` 이므로 stdout 은 "이상" 이다. 구 문구 "초과" 는
  // 33,000 정각에서 `33,000 chars — 경계 경보 임계 33,000 초과` 라는 자기모순을 냈다 (#980 축 B 가
  // governance §4.1 산문 3줄만 "이상" 으로 고치고 stdout 은 부채로 남긴 것).
  //
  // 당시 미수정 사유였던 "외부 grep 계약 우려" 는 실측으로 반박됐다 — 술어는
  //   git grep -nF -e 'WARN-BOUNDARY' -e 'WARN-PR' -e '경계 경보 임계' -e 'PR warn 임계' -e 'fail 임계' -- .
  // 를 리포 루트에서 **경로 무제한**으로 실행한 것이다 (경로 인자로 자르지 않는 것이 요점 — #980
  // 축 B 자신이 경로 제한 grep 으로 .github/ 를 놓친 전례가 있다). 본 파일 외 hit 은 전부
  // CHANGELOG 안의 **과거 출력 인용**이고 파서가 아니다 — 즉 stdout 을 파싱하는 소비처는 **0**
  // (인용문은 시점 기록이라 보존이 옳다. hit 수는 CHANGELOG 가 자라며 늘어나므로 고정 수치를
  // 적지 않는다). 유일 호출처 `.github/workflows/project-guards.yml` 도 exit code 만 쓴다
  // (stdout 을 파이프·grep 하지 않음). 다음 라운드에서 같은 가설을 다시 세우지 않도록
  // 술어째로 박제한다.
  //
  // 회귀 방지: 아래 self-test 의 경계 3케이스(33,000 / 40,000 / 45,000 정각)가 "이상" 을 단언하고
  // "초과" 잔존을 금지한다. 본 파일에 남은 "초과" 는 헤더 :10 (과거 실측 36,817 > 35,000 서술) 과
  // negative 픽스처 주석 (46,000 > 45,000) 뿐이며 둘 다 진짜 강부등호라 의도적 존치다.
  if (count >= failLimit) {
    console.error(
      `${MARK_FAIL} CLAUDE.md ${fmt(count)} chars — fail 임계 ${fmt(failLimit)} 이상. ` +
        `감축 PR 필수 (docs/guides/claudemd-governance.md §1 각인층/참조층 분리).`,
    );
    process.exit(1);
  }
  if (count >= warnPr) {
    console.log(
      `${MARK_WARN_PR} CLAUDE.md ${fmt(count)} chars — PR warn 임계 ${fmt(warnPr)} 이상 ` +
        `(fail ${fmt(failLimit)} 의 ${pctOfFail}%). 신규 인라인 블록 추가 금지 — ` +
        `docs/ 참조층으로 추출할 것 (governance §2 추출 기준).`,
    );
    process.exit(0);
  }
  if (count >= warnBoundary) {
    console.log(
      `${MARK_WARN_BOUNDARY} CLAUDE.md ${fmt(count)} chars — 경계 경보 임계 ${fmt(warnBoundary)} 이상 ` +
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

  /**
   * 문구 계약 (#988) — 세 판정이 모두 `>=` 이므로 대역 메시지는 "이상" 이어야 하고 "초과" 는 금지.
   * 아래 경계 3케이스(정각 픽스처)에 합쳐 단언한다 — 정각이야말로 두 낱말의 진리값이 갈리는
   * 유일한 지점이라 별도 케이스보다 여기 붙는 게 옳고, 단언 수가 안 변해 케이스 수를 인용한
   * 기존 기록(CHANGELOG 등)과의 drift 도 생기지 않는다.
   */
  const wordingOk = (out) => out.includes('이상') && !out.includes('초과');

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
    const b1 = invoke(asciiFixture('b32999.md', 32_999));
    assert('경계: 32,999 → 조용한 pass', b1.status === 0 && b1.stdout.includes(MARK_PASS));
    // 33,000 하향(#980 축 B) 회귀 가드 — 상수가 35,000 으로 되돌아가면 이 케이스가 PASS 마커를
    // 내며 FAIL 한다 (구 임계에서는 33,000 이 조용한 pass 구간이었다).
    const b2 = invoke(asciiFixture('b33000.md', 33_000));
    assert(
      '경계: 33,000 정각 → 경계 경보 + "이상" 문구 (exit 0)',
      b2.status === 0 && b2.stdout.includes(MARK_WARN_BOUNDARY) && wordingOk(b2.stdout),
      `status=${b2.status} stdout=${b2.stdout.trim()}`,
    );
    const b3 = invoke(asciiFixture('b39999.md', 39_999));
    assert(
      '경계: 39,999 → 경계 경보 유지',
      b3.status === 0 && b3.stdout.includes(MARK_WARN_BOUNDARY),
    );
    const b4 = invoke(asciiFixture('b40000.md', 40_000));
    assert(
      '경계: 40,000 정각 → PR warn + "이상" 문구 (exit 0)',
      b4.status === 0 && b4.stdout.includes(MARK_WARN_PR) && wordingOk(b4.stdout),
      `status=${b4.status} stdout=${b4.stdout.trim()}`,
    );
    const b5 = invoke(asciiFixture('b44999.md', 44_999));
    assert(
      '경계: 44,999 → PR warn 유지 (exit 0)',
      b5.status === 0 && b5.stdout.includes(MARK_WARN_PR),
    );
    const b6 = invoke(asciiFixture('b45000.md', 45_000));
    assert(
      '경계: 45,000 정각 → fail + "이상" 문구 (exit 1)',
      b6.status === 1 && b6.stderr.includes(MARK_FAIL) && wordingOk(b6.stderr),
      `status=${b6.status} stderr=${b6.stderr.trim()}`,
    );

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
    // 값은 "역전" 만 만들면 되므로 실제 임계와 무관한 숫자를 쓴다 (기본 임계 grep 감사 오탐 방지)
    const inverted = invoke(posPath, {
      CLAUDEMD_SIZE_LIMIT_WARN_BOUNDARY: '45000',
      CLAUDEMD_SIZE_LIMIT_FAIL: '30000',
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
