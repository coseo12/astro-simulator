#!/usr/bin/env node
/**
 * verify-harness-upstream-baseline.mjs
 *
 * ADR 20260515 Amendment 17 (#894) — baseline SSoT 를 `.harness/manifest.json` 에서
 * **upstream 원본 (태그된 릴리스)** 으로 전환하는 가드 + manifest 위생 복원 도구.
 *
 * ## 왜 필요한가 (#894 §0-2 실측)
 *
 * upstream `lib/update.js` 의 apply() 4단계는 `buildManifest(cwd, PKG_VERSION)` 로
 * 매니페스트를 **프로젝트 디스크 전체 재해싱**으로 재구성한다 (`lib/manifest.js`
 * `walkTracked()`). 이 때 **적용되지 않은 divergent 파일까지 포함**되므로, divergent 로
 * 살아남은 파일의 로컬 해시가 다음 회차의 baseline(`sha256`) 으로 **세탁**된다.
 *
 * 다음 회차 `diffAgainstPackage()` 는 이렇게 판정한다:
 *
 *   else if (userSha === pkgSha)              action = 'identical';
 *   else if (userSha === baseSha)             action = 'modified-pristine';  // ← 경로 1 (세탁)
 *   else if (prevSha && userSha === prevSha)  action = 'modified-pristine';  // ← 경로 2 (롤백 오탐)
 *
 * `modified-pristine` 은 "안전 업데이트 (사용자 미수정)" 로 표시되고
 * `--apply-all-safe` 가 **자동으로 덮어쓴다**. 즉 divergent 파일은 update 를 한 번
 * 통과할 때마다 pristine 으로 세탁되며, 다운스트림 고유 가드 조항이 소실된다.
 *
 * `.harness/manifest.json` 은 CLI 가 쓰는 **작업 상태**이지 Z 패턴의 진실 원천이 아니다.
 * 본 가드는 baseline 을 upstream 태그 tarball 원본으로 두고 4 불변식을 검증한다.
 *
 * ## 불변식 (fail-fast — CLAUDE.md §가드 설계 원칙, fallback 분기 금지)
 *
 *   (A) upstream 에 존재하며 로컬과 다른 managed 파일 → HARNESS-DRIFT 데코레이터 필수.
 *       Amendment 8 의 정본화 — 판정 baseline 을 manifest 가 아니라 upstream 원본으로.
 *   (B) 데코레이터 보유 파일 → upstream 과 **실제로 달라야** 함. 동일하면 Phase 3
 *       미정리 stale 데코레이터 → FAIL (#894 §0-4 역방향 사각 해소).
 *   (C) 로컬 ≠ upstream 이면서 CLI 가 `modified-pristine` 으로 판정할 상태 → FAIL.
 *       - (C1) `manifest.sha256 === 로컬 해시`      — baseline 세탁 (경로 1)
 *       - (C2) `previousSha256 === 로컬 해시`       — 롤백 자가복구 오탐 (경로 2)
 *       이번 P0 의 정확한 시그니처.
 *   (D) `manifest.sha256 === categoricalSha256(upstream 원본)` — manifest↔upstream 이격 차단.
 *       Amendment 20 (#900). 성립하면 자매 가드의 drift 와 본 가드의 divergent 가
 *       **항등식**이 된다 (공통 모수 = upstream·로컬 양쪽 존재 entry). 상세는 `inspectEntry()`.
 *
 * (A)(B) 와 (C)(D) 는 **서로 다른 divergence 개념**을 쓴다 — 각자 강제하는 계약이 다르다.
 * (A)(B) 는 Amendment 8 데코레이터 계약이므로 plain sha256 (파일 전체), (C)(D) 는 CLI
 * 분류 동형성이 목적이므로 `categoricalSha256` 을 쓴다. 자세한 근거는 `inspectEntry()` 주석.
 *
 * ## exit 코드
 *
 *   0 — 정상 (불변식 위반 0)
 *   1 — 불변식 위반 (fail-fast)
 *   2 — **실행 오류** (네트워크 실패 / 태그 부재 / manifest 부재).
 *       fallback 이 아니라 "판정 불가" 의 명시적 구분 — verify-z-pattern-health.mjs 선례 정합.
 *       판정 불가를 PASS 로 흡수하지 않는다 (silent 약화 차단).
 *
 * ## 호출
 *
 *   node scripts/verify-harness-upstream-baseline.mjs [옵션]
 *
 *   --mode=verify (기본)  — 불변식 (A)(B)(C)(D) 검증. 위반 시 exit 1.
 *   --mode=repair         — (C)/(D) 위반 entry 의 manifest 위생 복원.
 *                           **dry-run 이 기본** — `--apply` 명시 시에만 write.
 *                             sha256        → upstream 원본 해시
 *                             previousSha256 → 삭제 ((C) 위반 entry 한정 — §computeRepairPlan)
 *                           복원 후 CLI 는 해당 파일을 `divergent` /
 *                           `user-modified-stable` 로 **올바르게** 분류한다.
 *   --apply               — repair 모드에서 실제 파일 write (안전 기본값 해제)
 *   --baseline-dir=<path> — tarball 다운로드 대신 로컬 디렉토리를 baseline 으로 사용.
 *                           테스트 픽스처 주입 + 오프라인 실행 경로.
 *   --version=<x.y.z>     — baseline 태그 강제 (기본: manifest.harnessVersion)
 *   --self-test           — 네트워크 미의존 인라인 검증
 *                           (불변식 A/B/C positive/negative + 3중 시뮬레이션 + exit 2 경로)
 *
 * ## 캐시
 *
 * tarball 은 버전 키로 1회만 내려받는다.
 *   $HARNESS_UPSTREAM_CACHE_DIR > $RUNNER_TEMP/harness-upstream-baseline > <tmpdir>/...
 * 캐시 hit 시 네트워크 요청 0.
 *
 * ## 관련
 *   - ADR docs/decisions/20260515-harness-managed-divergent-pattern.md §Amendment 17
 *   - 절차 SSoT: .claude/commands/harness-update.md §7
 *   - 자매 가드: scripts/verify-harness-drift-decorator.mjs (Amendment 8/9/11/12/13)
 *   - 이슈: coseo12/astro-simulator#894
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  DECORATOR_REGEX,
  decoratorFormatFor,
  categorize,
  managedSha256,
  categoricalSha256,
  snapshotMeta,
  printJson,
  // Amendment 20 (#900) — self-test 의 항등식 실증 전용.
  // 본검사 경로는 자매 가드를 호출하지 않는다 (두 가드의 독립성 유지). self-test 에서만
  // **자매 가드의 실제 판정 함수**를 불러 `drift ⟺ divergent` 를 두 실구현으로 대조한다.
  detectDriftFiles,
} from './verify-harness-drift-decorator.mjs';

const MANIFEST_PATH = '.harness/manifest.json';

// upstream 원본 SSoT — 태그된 릴리스 tarball.
const UPSTREAM_REPO = 'coseo12/harness-setting';
const TARBALL_URL = (version) =>
  `https://codeload.github.com/${UPSTREAM_REPO}/tar.gz/refs/tags/v${version}`;

// reviewer R5 (#894) — harnessVersion 형식 검증 (URL·캐시 경로 주입 차단).
// semver.org 공식 regex 의 축약형 — prerelease/build 메타데이터까지 허용하되
// 경로 구분자(`/`)·상위 참조(`..`)·공백은 구조적으로 배제된다.
const SEMVER_REGEX =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

// stdout 마커 — CI / 사용자 grep 식별용 (자매 가드 Amendment 9/11 컨벤션 답습).
const REPAIR_DRY_RUN_MARKER = '[Baseline Repair — Dry Run]';
const REPAIR_APPLY_MARKER = '[Baseline Repair — Apply]';
const INVARIANT_VIOLATION_MARKER = '[Upstream Baseline Violation]';

/**
 * 판정 불가 (exit 2) 전용 에러.
 * 불변식 위반(exit 1)과 **반드시 구분**한다 — 네트워크 실패를 PASS 로도 FAIL 로도
 * 흡수하지 않는 것이 fail-fast 정합.
 */
class BaselineUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BaselineUnavailableError';
  }
}

// =============================================================================
// upstream 해시 규약 (SSoT 는 자매 가드)
// =============================================================================
//
// Amendment 19 (#897) — `categorize` / `managedSha256` / `categoricalSha256` 의 정본은
// `verify-harness-drift-decorator.mjs` 로 이관됐다. 자매 가드가 drift 판정에 같은 3함수를
// 쓰게 되면서 규약 사본이 2개가 되는 것을 막기 위함이다 (사본 = drift 생성원).
//
// import 방향은 **baseline → drift-decorator 고정**이다 (본 파일은 이미 line 95 에서
// `DECORATOR_REGEX` / `decoratorFormatFor` 를 같은 방향으로 import 한다). 역방향을
// 추가하면 ESM 순환 + TDZ 위험이 생긴다.
//
// 외부 계약 보존: 본 파일은 3함수를 **re-export 유지**한다 (하단 export 목록).
//
// 매니페스트의 sha256 은 plain sha256 이 아니라 `categoricalSha256()` 이다.
// managed-block (CLAUDE.md) 은 **센티널 내부만** 해시하므로, plain sha256 으로 비교하면
// CLAUDE.md 를 영구 오탐한다. upstream 로직을 그대로 재현해야 판정이 CLI 와 일치한다.

// =============================================================================
// 데코레이터 존재 판정
// =============================================================================

/**
 * HARNESS-DRIFT 데코레이터가 **실제로 박제되어 있는지** 판정.
 *
 * `verifyDecorator()` (자매 가드) 는 unknown 확장자를 `ok: true` 로 면제 처리하므로
 * 불변식 (B) 의 "데코레이터 보유" 판정에는 쓸 수 없다 (바이너리 자산이 전부 stale
 * 데코레이터로 오탐된다). 여기서는 **존재 여부만** 본다.
 *
 * @param {string} absPath
 * @returns {{present: boolean, expressible: boolean, format: string}}
 *   expressible=false — 해당 확장자는 데코레이터 표현 자체가 불가 (png 등).
 *   자매 가드의 unknown 면제와 동일 의미론.
 */
function decoratorPresence(absPath) {
  const format = decoratorFormatFor(absPath);
  if (format === 'unknown') return { present: false, expressible: false, format };
  if (format === 'json-sidecar') {
    return { present: existsSync(`${absPath}.HARNESS-DRIFT.md`), expressible: true, format };
  }
  let content;
  try {
    content = readFileSync(absPath, 'utf-8');
  } catch {
    return { present: false, expressible: true, format };
  }
  return { present: DECORATOR_REGEX.test(content), expressible: true, format };
}

// =============================================================================
// baseline 확보 (tarball 다운로드 + 캐시)
// =============================================================================

/**
 * 캐시 루트 결정. CI 는 RUNNER_TEMP (job 내 재사용), 로컬은 tmpdir.
 * 저장소 워킹트리를 오염시키지 않는다 (.gitignore 추가 불필요).
 * @returns {string}
 */
function cacheRoot() {
  if (process.env.HARNESS_UPSTREAM_CACHE_DIR) return process.env.HARNESS_UPSTREAM_CACHE_DIR;
  if (process.env.RUNNER_TEMP) return join(process.env.RUNNER_TEMP, 'harness-upstream-baseline');
  return join(tmpdir(), 'harness-upstream-baseline');
}

/**
 * upstream 태그 tarball 을 내려받아 전개하고 baseline 디렉토리 경로를 반환.
 * 동일 버전이 캐시에 있으면 네트워크 요청 0.
 *
 * @param {string} version — harnessVersion (예: '4.5.0')
 * @param {{fetchImpl?: Function}} [opts] — 테스트 주입용
 * @returns {Promise<{dir: string, cacheHit: boolean}>}
 * @throws {BaselineUnavailableError} 네트워크 실패 / 태그 부재 / 전개 실패 → exit 2
 */
async function ensureBaseline(version, opts = {}) {
  // reviewer R5 (#894) — 버전 문자열 검증.
  // version 은 URL 과 캐시 **경로**에 그대로 들어간다. 검증 없이 `../` 나 셸 메타문자가
  // 섞이면 캐시 루트 밖을 가리키거나(경로 탈출) 엉뚱한 태그를 받는다. manifest 가 신뢰
  // 경계 밖(머지 커밋/외부 도구가 쓰는 파일)이므로 입력으로 취급해 fail-fast 한다.
  if (!SEMVER_REGEX.test(String(version))) {
    throw new BaselineUnavailableError(
      `harnessVersion 이 semver 형식이 아님: ${JSON.stringify(version)} — ` +
        'manifest.harnessVersion 확인 또는 --version=<x.y.z> 명시',
    );
  }

  const root = cacheRoot();
  const dir = join(root, `v${version}`);
  const marker = join(dir, '.harness-baseline-ok');
  // reviewer R5 (#894) — 캐시 신뢰 경계.
  // 캐시는 프로세스 외부(공유 tmpdir / RUNNER_TEMP)에 있어 다른 프로세스·과거 실행이
  // 남긴 내용일 수 있다. marker 존재만으로 신뢰하면 **잘못된 baseline 으로 PASS** 하는
  // 조용한 약화가 된다. marker 안에 버전을 적어두고 일치 + 무결성 파일 존재까지 확인한다.
  // 불일치 시 캐시를 버리고 재다운로드 (fallback 이 아니라 신뢰 경계 재확립).
  if (existsSync(marker)) {
    const stamped = readFileSync(marker, 'utf-8').trim();
    if (stamped === version && existsSync(join(dir, 'package.json'))) {
      return { dir, cacheHit: true };
    }
    console.error(`WARN: baseline 캐시 무효 (marker="${stamped}" 기대="${version}") — 재다운로드`);
    rmSync(dir, { recursive: true, force: true });
  }

  const url = TARBALL_URL(version);
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  let buf;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} — 태그 v${version} 부재 또는 접근 불가 (${url})`);
    }
    buf = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    throw new BaselineUnavailableError(
      `upstream tarball 다운로드 실패: ${err.message}\n` +
        `  오프라인 실행: --baseline-dir=<upstream 체크아웃 경로>`,
    );
  }

  const staging = mkdtempSync(join(tmpdir(), 'harness-baseline-'));
  try {
    const tgz = join(staging, 'src.tar.gz');
    writeFileSync(tgz, buf);
    const extractTo = join(staging, 'x');
    mkdirSync(extractTo, { recursive: true });
    // --strip-components=1 — tarball 최상위 `harness-setting-<ver>/` 제거
    execFileSync('tar', ['-xzf', tgz, '-C', extractTo, '--strip-components=1'], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    // 무결성 최소 확인 — upstream 패키지라면 반드시 있는 파일
    if (!existsSync(join(extractTo, 'package.json'))) {
      throw new Error('전개 결과에 package.json 없음 — tarball 손상 의심');
    }
    mkdirSync(dirname(dir), { recursive: true });
    rmSync(dir, { recursive: true, force: true });
    // rename 은 tmpfs ↔ 캐시 파티션이 다르면 EXDEV — cp -R 로 통일
    mkdirSync(dir, { recursive: true });
    execFileSync('cp', ['-R', `${extractTo}/.`, dir], { stdio: ['ignore', 'ignore', 'pipe'] });
    writeFileSync(marker, `${version}\n`);
  } catch (err) {
    rmSync(dir, { recursive: true, force: true });
    throw new BaselineUnavailableError(`upstream tarball 전개 실패: ${err.message}`);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  return { dir, cacheHit: false };
}

// =============================================================================
// 불변식 검증
// =============================================================================

/**
 * manifest entry 에서 baseline sha 를 읽는다.
 *
 * Amendment 20 (#900) — **자매 가드와 동일한 읽기 규약**이어야 한다.
 * `detectDriftFiles()` 는 `typeof entry === 'string' ? entry : entry?.sha256` 로 읽으므로,
 * 본 가드가 legacy 문자열 스키마를 못 읽으면 같은 manifest 를 놓고 두 가드가 **다른 값을
 * 비교**하게 되어 (D) 가 보장하려는 항등식이 읽기 계층에서 먼저 깨진다. 값의 이격만큼이나
 * 읽기의 이격도 항등식을 파괴하므로, 규약을 자매 가드에 맞춘다.
 *
 * @param {object|string} entry
 * @returns {string|null} 문자열 sha 가 없으면 null (malformed — (D) 가 fail-fast 로 발화)
 */
function manifestSha(entry) {
  if (typeof entry === 'string') return entry;
  return typeof entry?.sha256 === 'string' ? entry.sha256 : null;
}

/**
 * 매니페스트 1 entry 를 4 불변식으로 판정.
 *
 * @param {object} args
 * @param {string} args.rel
 * @param {object} args.entry — manifest.files[rel]
 * @param {string} args.rootDir
 * @param {string} args.baselineDir
 * @returns {{rel: string, status: string, violations: Array<{code: string, message: string}>,
 *            upSha?: string, locSha?: string}}
 */
function inspectEntry({ rel, entry, rootDir, baselineDir }) {
  const upAbs = join(baselineDir, rel);
  const locAbs = join(rootDir, rel);
  const violations = [];

  // upstream 미존재 = 다운스트림 고유 파일 (carry-over). 본 가드 범위 밖 (#894 PR-B).
  if (!existsSync(upAbs)) return { rel, status: 'downstream-only', violations };
  // 로컬 부재 = CLI 의 `missing-locally`. baseline 위생 문제가 아니므로 정보성 분류.
  if (!existsSync(locAbs)) return { rel, status: 'missing-locally', violations };

  // 불변식별로 **다른 divergence 개념**을 쓴다 (각 불변식이 강제하는 계약이 다르므로).
  //
  //   (A)(B) — Amendment 8 데코레이터 계약. 데코레이터는 "이 harness-managed 파일에
  //            다운스트림 Phase 1 수정이 있다" 는 표식이며, 그 지시 대상은 **파일 전체**다.
  //            → plain sha256 사용.
  //   (C)    — CLI 의 `diffAgainstPackage()` 오분류 시그니처. CLI 는 `categoricalSha256()`
  //            로 비교하므로 판정을 CLI 와 **정확히 동형**으로 맞춰야 한다.
  //            → categoricalSha256 사용.
  //
  // 두 개념이 갈라지는 유일한 카테고리는 managed-block (CLAUDE.md) 이다: 센티널 내부가
  // upstream 과 같아도 센티널 외부에 프로젝트 고유 섹션이 있다. 이 때
  //   - 덮어쓰기 위험 0 (apply 는 센티널 내부만 교체) → (C) 미발화가 정답
  //   - 데코레이터는 유효 (파일 전체는 실제로 divergent) → (B) 미발화가 정답
  // 한 개념으로 통일하면 두 가드가 서로 모순된 요구를 하게 된다 (#894 dev 단계 실측).
  //
  // Amendment 19 (#897) — 자매 가드와의 관계 정정. 자매 가드는 이제 drift 판정에
  // `categoricalSha256()` 를 쓴다 (종전 plain sha256 은 managed-block 에서 정보량 0 의
  // 상수였다). 그럼에도 **본 가드의 (A)(B) 는 plain sha256 을 계속 쓴다** — 두 가드는
  // 비교 대상이 다르기 때문이다:
  //   - 자매 가드: 로컬 ↔ **manifest** (CLI 동형 축 — 무엇이 CLI 관점 수정 상태인가)
  //   - 본 가드 (A)(B): 로컬 ↔ **upstream 원본** (데코레이터 계약 축 — 파일 전체 divergence)
  // 그래서 CLAUDE.md 는 자매 가드 drift 목록에서 빠지면서도 (A) 가 데코레이터를 계속
  // 요구한다. 모순이 아니라 축이 다른 것이며, 양쪽 self-test 가 이 분리를 고정한다.
  const upShaCat = categoricalSha256(rel, upAbs);
  const locShaCat = categoricalSha256(rel, locAbs);
  const upShaFile = createHash('sha256').update(readFileSync(upAbs)).digest('hex');
  const locShaFile = createHash('sha256').update(readFileSync(locAbs)).digest('hex');
  const baseSha = manifestSha(entry);
  const prevSha = typeof entry?.previousSha256 === 'string' ? entry.previousSha256 : null;
  const differs = locShaCat !== upShaCat; // CLI 관점 divergence — (C) 기준
  const differsFile = locShaFile !== upShaFile; // 데코레이터 계약 divergence — (A)(B) 기준
  const { present: hasDecorator, expressible } = decoratorPresence(locAbs);

  // (A) upstream 과 다른데 데코레이터 없음 → Phase 1 미박제
  if (differsFile && expressible && !hasDecorator) {
    violations.push({
      code: 'A',
      message:
        'upstream 원본과 다르나 HARNESS-DRIFT 데코레이터 없음 ' +
        '(Amendment 8 Phase 1 박제 의무 — baseline=upstream 정본화)',
    });
  }

  // (B) 데코레이터가 있는데 upstream 과 동일 → Phase 3 미정리 stale 데코레이터
  if (!differsFile && hasDecorator) {
    violations.push({
      code: 'B',
      message:
        'upstream 원본과 동일한데 데코레이터 잔존 (Phase 3 정리 누락 — stale 데코레이터). ' +
        '데코레이터 제거 또는 sidecar cleanup 필요',
    });
  }

  // (C) CLI 가 modified-pristine 으로 오분류할 상태 → --apply-all-safe 자동 덮어쓰기 대상
  if (differs && baseSha && baseSha === locShaCat) {
    violations.push({
      code: 'C1',
      message:
        'manifest.sha256 == 로컬 해시 != upstream — baseline 세탁 (apply() buildManifest 재해싱). ' +
        `다음 --apply-all-safe 가 덮어씀. 기대 baseline=${upShaCat.slice(0, 8)}, 현재=${baseSha.slice(0, 8)}`,
    });
  }
  if (differs && prevSha && prevSha === locShaCat) {
    violations.push({
      code: 'C2',
      message:
        'previousSha256 == 로컬 해시 != upstream — 롤백 자가복구 오탐 (lib/update.js L72). ' +
        '다음 --apply-all-safe 가 덮어씀. previousSha256 제거 필요',
    });
  }

  // (D) manifest.sha256 이 upstream 원본과 이격 → 두 가드 결과의 조용한 분기 (Amendment 20, #900)
  //
  //   자매 가드 drift  ⟺ categoricalSha256(로컬) !== manifest.sha256
  //   본 가드 divergent ⟺ categoricalSha256(로컬) !== categoricalSha256(upstream)
  //
  // (D) 는 두 우변을 같은 값으로 못박는다. 성립하면 좌변 두 술어가 **동치**가 되어
  // `drift ⟺ divergent` 가 항등식이 된다. 종전의 `drift 8 == divergent 8` 은 항등식이 아니라
  // (C) 성립의 우연한 결과였다 (ADR §Amendment 19 §실측 스냅샷 C 경고 박스).
  //
  // **(C1) 은 (D) 의 진부분집합이다.** C1 = `differs ∧ baseSha === locShaCat` 이므로
  // baseSha === locShaCat ≠ upShaCat ⟹ baseSha ≠ upShaCat ⟹ (D) 위반. 역은 성립하지 않는다:
  // 로컬 == upstream 인데 manifest 만 낡은 경우 `differs=false` 라 C1 은 **구조적으로 발화 불가**
  // 하고 오직 (D) 만 잡는다. 이 케이스가 정확히 `drift ⊋ divergent` 이격 시나리오이며
  // (D) 의 존재 이유다 (self-test §이격 실증이 두 가드 실함수로 고정).
  //
  // **reviewer 대안 (b) 와의 차이** (#899 §교차검증 — (b) 는 false-fire 로 기각됨):
  // (b) 는 `categoricalSha256(로컬) === manifest.sha256` 을 요구해 정당한 Phase-1 편집마다
  // FAIL 했다 (= drift 자체를 금지하는 자기모순). (D) 는 좌변이 로컬이 아니라 **upstream** 이라
  // Phase-1 편집(로컬만 변경)에 **불변**이다. (b) 가 겨냥한 진짜 축("manifest 기록이 upstream
  // 실제 값에서 이탈")을 false-fire 없이 닫는, 더 강한 형태의 승계다.
  //
  // **적용 범위** — 본 함수의 checked 스코프 (upstream ∧ 로컬 양쪽 존재) 한정. (A)(B)(C) 와
  // 동일한 early-return 을 공유한다.
  //   - `downstream-only`  — upstream 원본이 없어 (D) 우변이 **정의되지 않는다** (범위 밖).
  //   - `missing-locally`  — 자매 가드도 로컬 부재 entry 를 drift 판정에서 제외하므로
  //                          항등식 모수 밖. 덮어쓰기 위험도 없다 (CLI 는 `added` 로 분류).
  // 따라서 (D) 가 보장하는 항등식의 모수는 **공통 스코프**다. downstream-only entry 가
  // 존재하면 그쪽은 drift 로만 잡히므로 `drift ⊇ divergent` 가 된다 — 현재 저장소는
  // `.harnessignore` (#894 PR-B) 로 downstreamOnly=0 이라 원시 카운트까지 일치한다.
  // self-test 가 이 경계를 **과장 없이** 고정한다 (downstream-only drift 주입 시 drift=divergent+1).
  //
  // fail-fast: baseSha 가 null (malformed entry) 이면 등식은 **거짓으로 확정**이므로 위반이다.
  // 자매 가드는 같은 상황에서 throw 하지만 (판정 불가 → exit 2), 본 가드는 upstream 원본이라는
  // 정답을 알고 있어 판정이 가능하다 — "판정 불가(exit 2)" 가 아니라 "불변식 위반(exit 1)" 이
  // 맞고, `--mode=repair` 로 교정까지 된다. 조용한 검사 제외(silent skip)만은 하지 않는다
  // (Amendment 19 §결정 3 정합).
  if (baseSha !== upShaCat) {
    violations.push({
      code: 'D',
      message:
        baseSha === null
          ? 'manifest entry 에 문자열 sha256 부재 — upstream 원본과 대조 불가 (malformed). ' +
            `기대 baseline=${upShaCat.slice(0, 8)}. silent skip 금지 (Amendment 19 §결정 3)`
          : 'manifest.sha256 != upstream 원본 해시 — manifest↔upstream 이격. ' +
            '자매 가드(로컬↔manifest)와 본 가드(로컬↔upstream)의 판정 기준이 갈라져 ' +
            `drift != divergent 가 될 수 있다. 기대=${upShaCat.slice(0, 8)}, 현재=${baseSha.slice(0, 8)}`,
    });
  }

  return {
    rel,
    status: differs ? 'divergent' : 'identical',
    violations,
    upSha: upShaCat,
    locSha: locShaCat,
    upShaFile,
    locShaFile,
    baseSha,
    prevSha,
    hasDecorator,
  };
}

/**
 * 전체 매니페스트 검증.
 * @param {{rootDir: string, baselineDir: string}} args
 * @returns {{results: Array, violations: Array, counts: object}}
 */
function runVerify({ rootDir, baselineDir }) {
  const manifestAbs = join(rootDir, MANIFEST_PATH);
  if (!existsSync(manifestAbs)) {
    throw new BaselineUnavailableError(`manifest 부재: ${MANIFEST_PATH}`);
  }
  const manifest = JSON.parse(readFileSync(manifestAbs, 'utf-8'));
  const files = manifest.files || {};

  const results = [];
  const counts = {
    total: Object.keys(files).length,
    checked: 0,
    downstreamOnly: 0,
    missingLocally: 0,
    divergent: 0,
    identical: 0,
  };

  for (const [rel, entry] of Object.entries(files)) {
    const r = inspectEntry({ rel, entry, rootDir, baselineDir });
    results.push(r);
    if (r.status === 'downstream-only') counts.downstreamOnly++;
    else if (r.status === 'missing-locally') counts.missingLocally++;
    else {
      counts.checked++;
      if (r.status === 'divergent') counts.divergent++;
      else counts.identical++;
    }
  }

  const violations = results.filter((r) => r.violations.length > 0);
  return { results, violations, counts, manifest };
}

// =============================================================================
// repair (manifest 위생 복원)
// =============================================================================

/**
 * (C)/(D) 위반 entry 의 복원 계획 산출.
 * sha256 → upstream 원본 해시 / previousSha256 → 삭제 ((C) 위반 한정).
 *
 * (A)/(B) 는 **복원 대상이 아니다** — 사람이 데코레이터를 박제/제거해야 하는 판단이며
 * 자동 write 는 Phase 1/3 의사결정을 우회한다.
 *
 * ## (D) 를 복원 대상에 포함하는 판단 근거 (Amendment 20, #900)
 *
 * 1. **교정 대상이 정확히 일치한다.** (C1) 복원 동작이 이미 `sha256 → upstream 원본 해시`
 *    이고, 이는 (D) 를 성립시키는 유일한 write 다. (C1) ⊊ (D) 이므로 (D) 를 포함시키는 것은
 *    기존 복원의 **자연스러운 정의역 확장**이지 새 동작 추가가 아니다.
 * 2. **사용자 수정 손실 위험 0.** repair 는 `.harness/manifest.json` 만 write 한다 — divergent
 *    파일의 본문은 읽기만 하고 절대 건드리지 않는다. 로컬 Phase-1 편집은 구조적으로 보존된다.
 * 3. **덮어쓰기 위험을 오히려 낮춘다.** upstream `diffAgainstPackage()` 는
 *    `userSha === pkgSha → identical` 판정을 **먼저** 하므로, `baseSha = pkgSha` 로 복원하면
 *    그 다음 분기 `userSha === baseSha → modified-pristine` (= `--apply-all-safe` 자동 덮어쓰기)
 *    이 **도달 불가**가 된다. 즉 수정된 파일은 `divergent` 로 올바르게 분류된다.
 * 4. **차기 버전 업데이트 의미론도 정확해진다.** 4.5.0 → 4.6.0 업데이트 시 `baseSha` 는
 *    "우리가 직전에 준 원본" 을 뜻해야 한다. upstream 4.5.0 해시가 바로 그 값이므로,
 *    복원 후 진짜 미수정 파일만 `modified-pristine` → 자동 갱신되고 수정 파일은 보호된다.
 *    (세탁된 로컬 해시가 baseline 이면 이 판정이 통째로 무너진다 — 그게 #894 P0 였다.)
 *
 * **previousSha256 은 (C) 위반 entry 에서만 제거한다.** `previousSha256 === 로컬 해시` 는
 * (C2) 롤백 오탐 시그니처이므로 봉인이 필요하지만, (D) 단독 위반 entry 의 previousSha256 은
 * 오탐 시그니처가 아니다. 필요 없는 필드까지 지우는 것은 자가복구 정보의 과잉 파괴이며
 * 종전 동작과도 달라진다 (기존 (C) 경로의 동작은 그대로 보존된다).
 *
 * @param {{rootDir: string, baselineDir: string}} args
 * @returns {{plan: Array, manifest: object, counts: object}}
 */
function computeRepairPlan({ rootDir, baselineDir }) {
  const { results, counts, manifest } = runVerify({ rootDir, baselineDir });
  const plan = [];
  for (const r of results) {
    const codes = r.violations.map((v) => v.code);
    const hasC = codes.includes('C1') || codes.includes('C2');
    const hasD = codes.includes('D');
    if (!hasC && !hasD) continue;
    const entry = manifest.files[r.rel];
    plan.push({
      rel: r.rel,
      codes,
      fromSha: manifestSha(entry),
      toSha: r.upSha,
      dropPrevious: hasC && typeof entry?.previousSha256 === 'string' ? entry.previousSha256 : null,
    });
  }
  return { plan, manifest, counts };
}

/**
 * 복원 계획을 manifest 에 write.
 * upstream `writeManifest()` 와 동일 포맷 (2-space indent + trailing newline) 유지 —
 * 포맷 차이로 인한 무의미한 diff 방지.
 *
 * @param {{rootDir: string, manifest: object, plan: Array}} args
 * @returns {number} 갱신된 entry 수
 */
function applyRepairPlan({ rootDir, manifest, plan }) {
  for (const item of plan) {
    const entry = manifest.files[item.rel];
    // Amendment 20 (#900) — legacy 문자열 스키마는 write 불가 (strict mode 에서 TypeError).
    // 조용히 건너뛰면 repair 가 "복원했다" 고 보고하면서 실제로는 아무것도 안 고친 상태가 된다
    // (CLAUDE.md §커밋 성공 ≠ 의도한 변경 커밋됨 의 매니페스트 판). 명시적으로 멈춘다.
    if (entry === null || typeof entry !== 'object') {
      throw new Error(
        `repair 불가 — 객체 스키마가 아닌 entry: ${item.rel} (got ${entry === null ? 'null' : typeof entry}). ` +
          '`harness update --check` 로 manifest 를 객체 스키마로 재생성한 뒤 재시도',
      );
    }
    entry.sha256 = item.toSha;
    // (C) 위반 entry 한정 — 근거는 computeRepairPlan() 주석 참조.
    if (item.dropPrevious) delete entry.previousSha256;
  }
  // reviewer R4 (#894) — 원자적 write (temp + rename).
  // 직렬화 중 예외 / 디스크 full / SIGINT 로 manifest 가 truncate 되면 CLI 가 전 파일을
  // `added` 로 오판해 복구 불가능한 교착이 된다 (CLAUDE.md §매니페스트 최신 ≠ 파일 적용 완료).
  // 같은 디렉토리에 temp 를 두어 rename 이 동일 파티션 원자 연산이 되게 한다 (EXDEV 회피).
  const abs = join(rootDir, MANIFEST_PATH);
  const tmp = `${abs}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(manifest, null, 2)}\n`);
  renameSync(tmp, abs);
  return plan.length;
}

// =============================================================================
// CLI
// =============================================================================

function parseArgs(argv) {
  const opts = {
    mode: 'verify',
    apply: false, // 안전 기본값 — repair 는 dry-run
    baselineDir: null,
    version: null,
    selfTest: false,
    // Amendment 19 (#897) — 기계 판독 출력 (ADR/CHANGELOG 스냅샷 원천).
    json: false,
  };
  for (const a of argv.slice(2)) {
    if (a === '--self-test') opts.selfTest = true;
    else if (a === '--apply') opts.apply = true;
    else if (a === '--dry-run') opts.apply = false;
    else if (a === '--format=json') opts.json = true;
    else if (a.startsWith('--mode=')) opts.mode = a.slice('--mode='.length);
    else if (a.startsWith('--baseline-dir=')) opts.baselineDir = a.slice('--baseline-dir='.length);
    else if (a.startsWith('--version=')) opts.version = a.slice('--version='.length);
    else {
      console.error(`ERROR: 알 수 없는 인자: ${a}`);
      process.exit(2);
    }
  }
  if (!['verify', 'repair'].includes(opts.mode)) {
    console.error(`ERROR: 알 수 없는 모드: ${opts.mode} (verify | repair)`);
    process.exit(2);
  }
  return opts;
}

/**
 * baseline 디렉토리 결정 — 명시 경로 우선, 없으면 tarball.
 * @returns {Promise<{dir: string, source: string, version: string|null}>}
 */
async function resolveBaseline(opts, rootDir) {
  if (opts.baselineDir) {
    if (!existsSync(opts.baselineDir)) {
      throw new BaselineUnavailableError(`--baseline-dir 경로 부재: ${opts.baselineDir}`);
    }
    return { dir: opts.baselineDir, source: 'local-dir', version: opts.version };
  }
  const manifestAbs = join(rootDir, MANIFEST_PATH);
  if (!existsSync(manifestAbs)) {
    throw new BaselineUnavailableError(`manifest 부재: ${MANIFEST_PATH}`);
  }
  const manifest = JSON.parse(readFileSync(manifestAbs, 'utf-8'));
  const version = opts.version || manifest.harnessVersion;
  if (!version) {
    throw new BaselineUnavailableError('manifest.harnessVersion 부재 — baseline 태그 결정 불가');
  }
  const { dir, cacheHit } = await ensureBaseline(version);
  return { dir, source: cacheHit ? 'cache' : 'download', version };
}

function printCounts(counts, baseline) {
  console.log(`baseline: v${baseline.version ?? '(local-dir)'} (${baseline.source})`);
  console.log(`manifest entries: ${counts.total}`);
  console.log(`  upstream 대조 대상: ${counts.checked}`);
  console.log(`    identical: ${counts.identical} / divergent: ${counts.divergent}`);
  console.log(`  downstream-only (본 가드 범위 밖): ${counts.downstreamOnly}`);
  console.log(`  missing-locally: ${counts.missingLocally}`);
}

async function mainVerify(opts) {
  const rootDir = '.';
  const baseline = await resolveBaseline(opts, rootDir);
  const { results, violations, counts } = runVerify({ rootDir, baselineDir: baseline.dir });

  // Amendment 19 (#897) — 기계 판독 경로. exit code 는 텍스트 경로와 **동일** 유지.
  if (opts.json) {
    const flatJson = violations.flatMap((r) =>
      r.violations.map((v) => ({ rel: r.rel, code: v.code })),
    );
    printJson({
      mode: 'verify',
      baselineVersion: baseline.version ?? null,
      baselineSource: baseline.source,
      manifestEntries: counts.total,
      checked: counts.checked,
      identical: counts.identical,
      divergent: counts.divergent,
      divergentFiles: results.filter((r) => r.status === 'divergent').map((r) => r.rel),
      downstreamOnly: counts.downstreamOnly,
      missingLocally: counts.missingLocally,
      invariantViolations: flatJson.length,
      invariantViolationsByCode: flatJson.reduce(
        (acc, v) => ({ ...acc, [v.code]: (acc[v.code] || 0) + 1 }),
        {},
      ),
      invariantViolationDetail: flatJson,
      ...snapshotMeta(),
    });
    return flatJson.length === 0 ? 0 : 1;
  }

  printCounts(counts, baseline);
  const flat = violations.flatMap((r) => r.violations.map((v) => ({ rel: r.rel, ...v })));
  const byCode = flat.reduce((acc, v) => ({ ...acc, [v.code]: (acc[v.code] || 0) + 1 }), {});
  console.log(
    `\n불변식 위반: ${flat.length} (A:${byCode.A || 0} B:${byCode.B || 0} ` +
      `C1:${byCode.C1 || 0} C2:${byCode.C2 || 0} D:${byCode.D || 0})`,
  );

  if (flat.length === 0) {
    console.log('\n[OK] upstream baseline 불변식 (A)(B)(C)(D) 정합');
    console.log('     (D) 성립 → drift == divergent 항등식 (공통 스코프, Amendment 20 #900)');
    return 0;
  }

  console.error(`\n${INVARIANT_VIOLATION_MARKER}`);
  for (const v of flat) {
    console.error(`  [${v.code}] ${v.rel}\n        ${v.message}`);
  }
  console.error('\n조치:');
  console.error('  (A) 데코레이터 박제 — ADR 20260515 §Amendment 8 Phase 1 절차');
  console.error('  (B) stale 데코레이터 제거 — Phase 3 정리');
  console.error(
    '  (C)(D) node scripts/verify-harness-upstream-baseline.mjs --mode=repair (확인) → --apply',
  );
  console.error('  절차 SSoT: .claude/commands/harness-update.md §7');
  return 1;
}

async function mainRepair(opts) {
  const rootDir = '.';
  const baseline = await resolveBaseline(opts, rootDir);
  const { plan, manifest, counts } = computeRepairPlan({ rootDir, baselineDir: baseline.dir });

  printCounts(counts, baseline);
  console.log(`\n복원 대상 (C1/C2/D 위반): ${plan.length}`);

  if (plan.length === 0) {
    console.log('\n[OK] manifest baseline 위생 정합 — 복원 대상 없음');
    return 0;
  }

  console.log(opts.apply ? `\n${REPAIR_APPLY_MARKER}` : `\n${REPAIR_DRY_RUN_MARKER}`);
  for (const item of plan) {
    console.log(`  ${item.rel} [${item.codes.join(',')}]`);
    // fromSha 는 malformed entry (문자열 sha256 부재) 에서 null 일 수 있다 — (D) fail-fast 경로.
    const from = item.fromSha ? item.fromSha.slice(0, 8) : '(부재)';
    console.log(`      sha256: ${from} → ${item.toSha.slice(0, 8)} (upstream)`);
    if (item.dropPrevious) {
      console.log(`      previousSha256: ${item.dropPrevious.slice(0, 8)} → (제거)`);
    }
  }

  if (!opts.apply) {
    console.log(
      '\n실제 적용: node scripts/verify-harness-upstream-baseline.mjs --mode=repair --apply',
    );
    return 0;
  }

  const n = applyRepairPlan({ rootDir, manifest, plan });
  console.log(`\n[OK] manifest ${n} entry 복원 — CLI 재분류 확인: harness update --check`);
  return 0;
}

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.selfTest) {
    process.exit(await runSelfTest());
  }
  try {
    const code = opts.mode === 'repair' ? await mainRepair(opts) : await mainVerify(opts);
    process.exit(code);
  } catch (err) {
    if (err instanceof BaselineUnavailableError) {
      // 판정 불가 — PASS 로도 FAIL 로도 흡수하지 않는다 (fail-fast 정합)
      console.error(`ERROR (판정 불가): ${err.message}`);
      process.exit(2);
    }
    console.error(`ERROR: ${err.stack || err.message}`);
    process.exit(2);
  }
}

// =============================================================================
// Self-test — 네트워크 미의존 (CLAUDE.md §가드 도입 PR DoD 4축 §(2) 3중 시뮬레이션)
// =============================================================================

async function runSelfTest() {
  let pass = 0;
  let fail = 0;
  const log = [];

  function expect(name, cond, detail = '') {
    if (cond) {
      pass++;
      log.push(`  PASS  ${name}`);
    } else {
      fail++;
      log.push(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
    }
  }

  const sha = (s) => createHash('sha256').update(s).digest('hex');

  // --- upstream 해시 규약 재현 검증 ---
  expect('categorize CLAUDE.md → managed-block', categorize('CLAUDE.md') === 'managed-block');
  expect('categorize scripts/ → frozen', categorize('scripts/x.mjs') === 'frozen');
  expect(
    'categorize .github/workflows/harness-*.yml → frozen',
    categorize('.github/workflows/harness-guards.yml') === 'frozen',
  );
  expect(
    'categorize .github/workflows/ci.yml → user-only',
    categorize('.github/workflows/ci.yml') === 'user-only',
  );
  expect(
    'categorize .claude/agents/*.md → atomic',
    categorize('.claude/agents/qa.md') === 'atomic',
  );
  expect(
    'categorize docs/decisions/ → user-only',
    categorize('docs/decisions/x.md') === 'user-only',
  );

  // managed-block 은 센티널 내부만 해시 — 외부 편집은 해시 불변
  const blockA = '<!-- harness:managed:x:start -->\ncore\n<!-- harness:managed:x:end -->';
  expect(
    'managedSha256: 센티널 외부 편집은 해시 불변',
    managedSha256(`before\n${blockA}\nafter`) === managedSha256(`CHANGED\n${blockA}\nOTHER`),
  );
  expect(
    'managedSha256: 센티널 내부 편집은 해시 변화',
    managedSha256(blockA) !==
      managedSha256('<!-- harness:managed:x:start -->\nCORE2\n<!-- harness:managed:x:end -->'),
  );
  expect('managedSha256: 센티널 없으면 전문 해시', managedSha256('plain') === sha('plain'));

  // --- 픽스처 기반 불변식 시뮬레이션 ---
  const tmp = mkdtempSync(join(tmpdir(), 'harness-upstream-baseline-'));
  try {
    const up = join(tmp, 'upstream');
    const root = join(tmp, 'project');
    mkdirSync(join(up, '.claude/agents'), { recursive: true });
    mkdirSync(join(root, '.claude/agents'), { recursive: true });
    mkdirSync(join(root, '.harness'), { recursive: true });

    const UP_BODY = '---\nname: qa\n---\nupstream body\n';
    const LOC_BODY = '---\nname: qa\n---\n<!-- HARNESS-DRIFT: Z-PATTERN [TODO] -->\nlocal body\n';
    const REL = '.claude/agents/qa.md';
    const CLEAN_REL = '.claude/agents/pm.md';

    writeFileSync(join(up, REL), UP_BODY);
    writeFileSync(join(up, CLEAN_REL), UP_BODY);
    writeFileSync(join(root, CLEAN_REL), UP_BODY); // 항상 identical (대조군)

    const upSha = sha(UP_BODY);
    const locSha = sha(LOC_BODY);

    function writeManifest(entry, extra = {}) {
      writeFileSync(
        join(root, MANIFEST_PATH),
        `${JSON.stringify(
          {
            harnessVersion: '0.0.0',
            files: { [REL]: entry, [CLEAN_REL]: { sha256: upSha, category: 'atomic' }, ...extra },
          },
          null,
          2,
        )}\n`,
      );
    }

    const verify = () => runVerify({ rootDir: root, baselineDir: up });
    const codesOf = (rel, res) =>
      (res.results.find((r) => r.rel === rel)?.violations || []).map((v) => v.code);

    // === 불변식 (A) 3중 시뮬레이션 ===
    // positive: 로컬 ≠ upstream + 데코레이터 있음 + baseline=upstream → 위반 0
    writeFileSync(join(root, REL), LOC_BODY);
    writeManifest({ sha256: upSha, category: 'atomic' });
    let res = verify();
    expect(
      'A positive: divergent + 데코레이터 → 위반 0',
      res.violations.length === 0,
      JSON.stringify(codesOf(REL, res)),
    );
    expect('A positive: 대조군 identical 도 위반 0', codesOf(CLEAN_REL, res).length === 0);

    // negative: 데코레이터 제거 → (A) 발화
    const NO_DEC = '---\nname: qa\n---\nlocal body without decorator\n';
    writeFileSync(join(root, REL), NO_DEC);
    writeManifest({ sha256: upSha, category: 'atomic' });
    res = verify();
    expect(
      'A negative: 데코레이터 누락 → A 발화',
      codesOf(REL, res).includes('A'),
      JSON.stringify(codesOf(REL, res)),
    );

    // recovery: 데코레이터 복원 → 위반 0
    writeFileSync(join(root, REL), LOC_BODY);
    res = verify();
    expect('A recovery: 데코레이터 복원 → 위반 0', res.violations.length === 0);

    // === 불변식 (B) 3중 시뮬레이션 (stale 데코레이터 — §0-4 역방향 사각) ===
    // negative: upstream 이 다운스트림 변경을 흡수 (로컬 == upstream) 했는데 데코레이터 잔존
    const UP_ABSORBED = LOC_BODY; // upstream 이 데코레이터 포함 본을 그대로 흡수했다고 가정
    writeFileSync(join(up, REL), UP_ABSORBED);
    writeFileSync(join(root, REL), LOC_BODY);
    writeManifest({ sha256: sha(UP_ABSORBED), category: 'atomic' });
    res = verify();
    expect(
      'B negative: upstream 동일 + 데코레이터 잔존 → B 발화',
      codesOf(REL, res).includes('B'),
      JSON.stringify(codesOf(REL, res)),
    );

    // recovery: 데코레이터 제거 (Phase 3 완료) → 위반 0
    const ABSORBED_NO_DEC = '---\nname: qa\n---\nlocal body\n';
    writeFileSync(join(up, REL), ABSORBED_NO_DEC);
    writeFileSync(join(root, REL), ABSORBED_NO_DEC);
    writeManifest({ sha256: sha(ABSORBED_NO_DEC), category: 'atomic' });
    res = verify();
    expect(
      'B recovery: 데코레이터 제거 → 위반 0',
      res.violations.length === 0,
      JSON.stringify(res.violations),
    );

    // positive 대조: 데코레이터 없고 upstream 과 동일 → 위반 0 (위에서 확인됨)
    expect('B positive: 데코레이터 없음 + identical → 위반 0', codesOf(REL, res).length === 0);

    // === 불변식 (C1) 3중 시뮬레이션 — baseline 세탁 (이번 P0 시그니처) ===
    writeFileSync(join(up, REL), UP_BODY);
    writeFileSync(join(root, REL), LOC_BODY);
    // positive: baseline = upstream → 위반 0
    writeManifest({ sha256: upSha, category: 'atomic' });
    res = verify();
    expect('C1 positive: baseline=upstream → 위반 0', res.violations.length === 0);

    // negative: baseline 을 로컬 해시로 세탁 (apply() buildManifest 재현) → C1 발화
    writeManifest({ sha256: locSha, category: 'atomic' });
    res = verify();
    expect(
      'C1 negative: baseline=로컬 → C1 발화',
      codesOf(REL, res).includes('C1'),
      JSON.stringify(codesOf(REL, res)),
    );

    // repair dry-run — 계획만 산출, 파일 불변
    const beforeRaw = readFileSync(join(root, MANIFEST_PATH), 'utf-8');
    const { plan: dryPlan } = computeRepairPlan({ rootDir: root, baselineDir: up });
    expect('C1 repair dry-run: 계획 1건', dryPlan.length === 1 && dryPlan[0].toSha === upSha);
    expect(
      'C1 repair dry-run: manifest 파일 불변 (비파괴)',
      readFileSync(join(root, MANIFEST_PATH), 'utf-8') === beforeRaw,
    );

    // recovery: repair --apply → 위반 0
    const { plan, manifest } = computeRepairPlan({ rootDir: root, baselineDir: up });
    applyRepairPlan({ rootDir: root, manifest, plan });
    res = verify();
    expect(
      'C1 recovery: repair --apply → 위반 0',
      res.violations.length === 0,
      JSON.stringify(res.violations),
    );
    expect(
      'C1 recovery: manifest.sha256 == upstream 해시',
      JSON.parse(readFileSync(join(root, MANIFEST_PATH), 'utf-8')).files[REL].sha256 === upSha,
    );

    // === 불변식 (C2) — previousSha256 롤백 오탐 ===
    writeManifest({ sha256: upSha, category: 'atomic', previousSha256: locSha });
    res = verify();
    expect(
      'C2 negative: previousSha256=로컬 → C2 발화',
      codesOf(REL, res).includes('C2'),
      JSON.stringify(codesOf(REL, res)),
    );

    const { plan: p2, manifest: m2 } = computeRepairPlan({ rootDir: root, baselineDir: up });
    expect('C2 repair: dropPrevious 계획', p2.length === 1 && p2[0].dropPrevious === locSha);
    applyRepairPlan({ rootDir: root, manifest: m2, plan: p2 });
    res = verify();
    expect('C2 recovery: repair --apply → 위반 0', res.violations.length === 0);
    expect(
      'C2 recovery: previousSha256 제거됨',
      JSON.parse(readFileSync(join(root, MANIFEST_PATH), 'utf-8')).files[REL].previousSha256 ===
        undefined,
    );

    // === 경계: previousSha256 이 로컬과 다르면 위반 아님 (과잉 발화 차단) ===
    writeManifest({ sha256: upSha, category: 'atomic', previousSha256: sha('unrelated') });
    res = verify();
    expect('C2 boundary: prev != 로컬 → 위반 0 (과잉 발화 없음)', res.violations.length === 0);

    // === 경계: downstream-only entry 는 범위 밖 ===
    writeFileSync(join(root, 'downstream-only.md'), 'x\n');
    writeManifest(
      { sha256: upSha, category: 'atomic' },
      { 'downstream-only.md': { sha256: sha('WASHED'), category: 'atomic' } },
    );
    res = verify();
    expect(
      'scope: downstream-only 는 대조 제외',
      res.counts.downstreamOnly === 1,
      JSON.stringify(res.counts),
    );
    expect('scope: downstream-only 위반 미발화', res.violations.length === 0);

    // === 경계: upstream 에는 있고 로컬에 없는 entry (missing-locally) ===
    writeFileSync(join(up, 'ghost.md'), 'ghost\n');
    writeManifest(
      { sha256: upSha, category: 'atomic' },
      { 'ghost.md': { sha256: sha('ghost\n'), category: 'atomic' } },
    );
    res = verify();
    expect(
      'scope: missing-locally 분류 (위반 아님)',
      res.counts.missingLocally === 1 && res.violations.length === 0,
      JSON.stringify(res.counts),
    );

    // === 경계: 데코레이터 표현 불가 확장자 (png 등) 는 (A)/(B) 면제 ===
    writeFileSync(join(up, 'asset.bin'), 'UP');
    writeFileSync(join(root, 'asset.bin'), 'LOCAL');
    writeManifest({ sha256: upSha, category: 'atomic' }, { 'asset.bin': { sha256: sha('UP') } });
    res = verify();
    expect(
      'scope: unknown 확장자는 A/B 면제 (자매 가드 의미론 정합)',
      codesOf('asset.bin', res).length === 0,
      JSON.stringify(codesOf('asset.bin', res)),
    );
    // 단 C 는 확장자와 무관하게 적용 — 바이너리도 덮어쓰기 위험은 동일
    writeManifest({ sha256: upSha, category: 'atomic' }, { 'asset.bin': { sha256: sha('LOCAL') } });
    res = verify();
    expect(
      'scope: unknown 확장자도 C1 은 발화 (덮어쓰기 위험 동일)',
      codesOf('asset.bin', res).includes('C1'),
      JSON.stringify(codesOf('asset.bin', res)),
    );

    // === managed-block 충실성 — (C) 는 센티널 내부만, (A)(B) 는 파일 전체 ===
    // 두 가드 모순 회귀 차단 (#894 dev 실측): 하나의 개념으로 통일하면
    // 본 가드 (B) 가 "CLAUDE.md 데코레이터 제거" 를, 자매 가드가 "데코레이터 박제" 를
    // 동시에 요구하는 교착이 발생한다.
    const CB = (core, outside) =>
      `${outside}\n<!-- harness:managed:real-lessons:start -->\n${core}\n<!-- harness:managed:real-lessons:end -->\n`;
    const CB_DEC = (core, outside) =>
      `<!-- HARNESS-DRIFT: Z-PATTERN [TODO] -->\n${CB(core, outside)}`;
    writeFileSync(join(up, 'CLAUDE.md'), CB('shared', 'upstream-outside'));
    writeFileSync(join(root, 'CLAUDE.md'), CB_DEC('shared', 'DOWNSTREAM-OUTSIDE'));
    writeManifest(
      { sha256: upSha, category: 'atomic' },
      { 'CLAUDE.md': { sha256: managedSha256(CB('shared', 'x')), category: 'managed-block' } },
    );
    res = verify();
    const cmd = res.results.find((r) => r.rel === 'CLAUDE.md');
    expect(
      'managed-block: 센티널 내부 동일 → (C) 미발화 + status=identical (CLI 동형)',
      cmd.status === 'identical' && !codesOf('CLAUDE.md', res).some((c) => c.startsWith('C')),
      JSON.stringify(cmd),
    );
    expect(
      'managed-block: 파일 전체는 divergent → 데코레이터 유효, (B) 미발화 (자매 가드 무모순)',
      !codesOf('CLAUDE.md', res).includes('B'),
      JSON.stringify(codesOf('CLAUDE.md', res)),
    );

    // managed-block 에서 데코레이터를 빼면 (A) 발화 (자매 가드와 동일 요구)
    writeFileSync(join(root, 'CLAUDE.md'), CB('shared', 'DOWNSTREAM-OUTSIDE'));
    res = verify();
    expect(
      'managed-block: 데코레이터 누락 → (A) 발화 (자매 가드와 동일 요구)',
      codesOf('CLAUDE.md', res).includes('A'),
      JSON.stringify(codesOf('CLAUDE.md', res)),
    );

    // 센티널 내부가 갈라지면 (C1) 도 정상 발화 (managed-block 이라고 면제되지 않음)
    writeFileSync(join(root, 'CLAUDE.md'), CB_DEC('DOWNSTREAM-CORE', 'DOWNSTREAM-OUTSIDE'));
    writeManifest(
      { sha256: upSha, category: 'atomic' },
      {
        'CLAUDE.md': {
          sha256: managedSha256(CB_DEC('DOWNSTREAM-CORE', 'x')),
          category: 'managed-block',
        },
      },
    );
    res = verify();
    expect(
      'managed-block: 센티널 내부 세탁 → (C1) 발화 (면제 없음)',
      codesOf('CLAUDE.md', res).includes('C1'),
      JSON.stringify(codesOf('CLAUDE.md', res)),
    );

    // === exit 2 경로 — baseline 부재 (오프라인 / 태그 부재) ===
    let threw = null;
    try {
      runVerify({ rootDir: join(tmp, 'nonexistent'), baselineDir: up });
    } catch (err) {
      threw = err;
    }
    expect(
      'exit2: manifest 부재 → BaselineUnavailableError',
      threw instanceof BaselineUnavailableError,
      String(threw),
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  // ===========================================================================
  // Amendment 20 (#900) — 불변식 (D) + `drift ⟺ divergent` 항등식
  // ===========================================================================
  //
  // ## 골든 벡터가 필요한 이유 (#899 reviewer 차단의 (D) 판)
  //
  // (D) 는 `manifest.sha256 === categoricalSha256(upstream)` 이다. 픽스처의 manifest 값을
  // `categoricalSha256()` 를 **호출해서** 만들면, 그 함수가 upstream 규약에서 이탈해도 좌·우변이
  // 함께 움직여 **영원히 PASS** 한다 — #899 가 적발한 자기참조 사각과 정확히 같은 시그니처다.
  // 그래서 아래 positive 픽스처의 manifest 값은 upstream 직렬화 규약을 **손으로 전개한 바이트열의
  // 해시 상수**로 고정한다. 기대값이 구현 호출 결과가 아니므로, 포팅이 이탈하면 우변만 변해 FAIL 한다.
  //
  //   atomic 카테고리 — categoricalSha256 = 파일 전체 plain sha256
  //     D_ATOMIC_BYTES = '---\nname: pm\n---\nupstream-d-anchor\n'   (35 bytes)
  //     D_ATOMIC_SHA   = sha256(D_ATOMIC_BYTES)
  //
  //   managed-block 카테고리 — categoricalSha256 = managedSha256 = 블록 직렬화 해시
  //     블록 1개 { id: 'd-blk', content: 'DCORE' }
  //     → 직렬화 = `${id}\n${content}` 를 '\n---\n' 로 join = 'd-blk\nDCORE'   (11 bytes)
  //     D_MB_SHA = sha256('d-blk\nDCORE')
  //
  // 상수 갱신은 **upstream 규약 자체가 바뀔 때만** 정당하며, 그때도 유도를 다시 전개해 재계산한다
  // (ADR §Amendment 19 §수치 박제 규약 (i)).
  {
    const D_ATOMIC_BYTES = '---\nname: pm\n---\nupstream-d-anchor\n';
    const D_ATOMIC_SHA = '37c75c66660b9b7e9dd25f43fe3dd0057bb9494a075e1cd7b2a6fa39b1d734ef';
    const D_MB_CONCAT = 'd-blk\nDCORE';
    const D_MB_SHA = '4f7540a6f73d9189dad0583084d1b8f4c2c3cd2c8c598cd4743b3dc4a1b18138';

    expect(
      'D 골든 provenance: D_ATOMIC_SHA === sha256(35 bytes 리터럴)',
      sha(D_ATOMIC_BYTES) === D_ATOMIC_SHA && Buffer.byteLength(D_ATOMIC_BYTES) === 35,
    );
    expect(
      'D 골든 provenance: D_MB_SHA === sha256("d-blk\\nDCORE") (11 bytes)',
      sha(D_MB_CONCAT) === D_MB_SHA && Buffer.byteLength(D_MB_CONCAT) === 11,
    );

    const tmpD = mkdtempSync(join(tmpdir(), 'harness-invariant-d-'));
    try {
      const up = join(tmpD, 'upstream');
      const root = join(tmpD, 'project');
      mkdirSync(join(up, '.claude/agents'), { recursive: true });
      mkdirSync(join(root, '.claude/agents'), { recursive: true });
      mkdirSync(join(root, '.harness'), { recursive: true });

      const A = '.claude/agents/pm.md'; // atomic — 로컬 == upstream (identical)
      const B = '.claude/agents/qa.md'; // atomic — 로컬 != upstream (divergent + 데코레이터)
      const MB = 'CLAUDE.md'; // managed-block

      const UP_B = '---\nname: qa\n---\nupstream qa body\n';
      const LOC_B = '---\nname: qa\n---\n<!-- HARNESS-DRIFT: Z-PATTERN [TODO] -->\nlocal qa body\n';
      const MB_UP = `outside-upstream\n<!-- harness:managed:d-blk:start -->\nDCORE\n<!-- harness:managed:d-blk:end -->\n`;
      const MB_LOC = `<!-- HARNESS-DRIFT: Z-PATTERN [TODO] -->\nDOWNSTREAM-OUTSIDE\n<!-- harness:managed:d-blk:start -->\nDCORE\n<!-- harness:managed:d-blk:end -->\n`;

      writeFileSync(join(up, A), D_ATOMIC_BYTES);
      writeFileSync(join(root, A), D_ATOMIC_BYTES); // identical
      writeFileSync(join(up, B), UP_B);
      writeFileSync(join(root, B), LOC_B); // divergent
      writeFileSync(join(up, MB), MB_UP);
      writeFileSync(join(root, MB), MB_LOC); // 블록 내부 동일 / 블록 밖 divergent

      // 픽스처 manifest — A/MB 는 골든 상수, B 는 규약을 독립 전개한 값 (atomic = 파일 전체 해시)
      const healthy = () => ({
        [A]: { sha256: D_ATOMIC_SHA, category: 'atomic' },
        [B]: { sha256: sha(UP_B), category: 'atomic' },
        [MB]: { sha256: D_MB_SHA, category: 'managed-block' },
      });
      const writeD = (files) => {
        writeFileSync(
          join(root, MANIFEST_PATH),
          `${JSON.stringify({ harnessVersion: '0.0.0', files }, null, 2)}\n`,
        );
      };
      const verifyD = () => runVerify({ rootDir: root, baselineDir: up });
      const codesD = (rel, res) =>
        (res.results.find((r) => r.rel === rel)?.violations || []).map((v) => v.code);
      // 항등식 대조 — 좌변은 **자매 가드 실함수**, 우변은 본 가드 실함수 (독립 두 구현)
      const driftSet = () =>
        detectDriftFiles(root)
          .map((d) => d.file)
          .sort();
      const divergentSet = (res) =>
        res.results
          .filter((r) => r.status === 'divergent')
          .map((r) => r.rel)
          .sort();
      const setEq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

      // --- positive: 골든 상수 manifest → (D) 위반 0 ---
      writeD(healthy());
      let res = verifyD();
      expect(
        'D positive: manifest=골든 상수(upstream 규약 전개) → 위반 0',
        res.violations.length === 0,
        JSON.stringify(
          res.violations.map((r) => ({ rel: r.rel, c: r.violations.map((v) => v.code) })),
        ),
      );

      // --- managed-block 적용 범위 (완료 조건 6항) ---
      // (D) 는 categorical 도메인 위의 등식이므로 managed-block 에서 **센티널 내부만** 요구한다.
      // 블록 밖 다운스트림 섹션이 아무리 커도 (D) 는 영향받지 않는다 — 그래서 성립한다.
      const mbRes = res.results.find((r) => r.rel === MB);
      expect(
        'D managed-block: 블록 밖 divergent 여도 (D) 미발화 (categorical 도메인)',
        !codesD(MB, res).includes('D') &&
          mbRes.status === 'identical' &&
          mbRes.hasDecorator === true,
        JSON.stringify({ codes: codesD(MB, res), status: mbRes.status }),
      );
      expect(
        'D managed-block: 블록 밖 편집은 (D) 판정에 불변 (plain 해시였다면 영구 위반)',
        mbRes.upShaFile !== mbRes.locShaFile && mbRes.upSha === mbRes.locSha,
        JSON.stringify({ upSha: mbRes.upSha?.slice(0, 8), locSha: mbRes.locSha?.slice(0, 8) }),
      );

      // --- 항등식 positive: 두 집합이 원소까지 일치 (비어있지 않음 — assertion 에 이빨) ---
      let dv = divergentSet(res);
      expect(
        'D 항등식 positive: driftSet == divergentSet (비공집합)',
        setEq(driftSet(), dv) && dv.length === 1 && dv[0] === B,
        `drift=${JSON.stringify(driftSet())} divergent=${JSON.stringify(dv)}`,
      );

      // --- negative (이격 실증): 로컬 == upstream 인데 manifest 만 낡음 ---
      // ADR §Amendment 19 §실측 스냅샷 C 경고 박스가 예고한 바로 그 시나리오.
      // (C1) 은 differs=false 라 **구조적으로 발화 불가** → (D) 만이 잡는다.
      const stale = healthy();
      stale[A] = { sha256: sha('STALE-MANIFEST-VALUE'), category: 'atomic' };
      writeD(stale);
      res = verifyD();
      expect(
        'D negative: 로컬==upstream + manifest 낡음 → D 발화',
        codesD(A, res).includes('D'),
        JSON.stringify(codesD(A, res)),
      );
      expect(
        'D negative: 같은 상태에서 C1 은 미발화 (differs=false — C1 의 구조적 사각)',
        !codesD(A, res).includes('C1'),
        JSON.stringify(codesD(A, res)),
      );
      const staleDrift = driftSet();
      const staleDiv = divergentSet(res);
      expect(
        'D negative: 이격 실증 — driftSet != divergentSet (drift ⊋ divergent)',
        !setEq(staleDrift, staleDiv) && staleDrift.includes(A) && !staleDiv.includes(A),
        `drift=${JSON.stringify(staleDrift)} divergent=${JSON.stringify(staleDiv)}`,
      );

      // --- recovery: repair --apply → (D) 복구 + 항등식 재성립 ---
      // 안전성 실증: repair 전후 **로컬 파일 본문 해시 불변** (사용자 수정 손실 0)
      const locBefore = [A, B, MB].map((rel) => sha(readFileSync(join(root, rel), 'utf-8')));
      let { plan: pD, manifest: mD } = computeRepairPlan({ rootDir: root, baselineDir: up });
      expect(
        'D repair: 계획 1건 (A) — toSha=upstream 골든 상수',
        pD.length === 1 && pD[0].rel === A && pD[0].toSha === D_ATOMIC_SHA,
        JSON.stringify(pD),
      );
      applyRepairPlan({ rootDir: root, manifest: mD, plan: pD });
      res = verifyD();
      expect('D recovery: repair --apply → 위반 0', res.violations.length === 0);
      expect(
        'D recovery: 항등식 재성립 (driftSet == divergentSet)',
        setEq(driftSet(), divergentSet(res)),
        `drift=${JSON.stringify(driftSet())} divergent=${JSON.stringify(divergentSet(res))}`,
      );
      expect(
        'D repair 안전성: 로컬 파일 본문 불변 (manifest 만 write — 사용자 수정 손실 0)',
        [A, B, MB].every((rel, i) => sha(readFileSync(join(root, rel), 'utf-8')) === locBefore[i]),
      );

      // --- 구조 봉인: C1 ⊊ D (C1 발화 시 D 도 반드시 발화) ---
      const washed = healthy();
      washed[B] = { sha256: sha(LOC_B), category: 'atomic' }; // baseline 세탁
      writeD(washed);
      res = verifyD();
      expect(
        'D 봉인: C1 발화 시 D 도 발화 (C1 ⊊ D 진부분집합 관계)',
        codesD(B, res).includes('C1') && codesD(B, res).includes('D'),
        JSON.stringify(codesD(B, res)),
      );

      // --- malformed entry: silent skip 금지 (fail-fast) ---
      const malformed = healthy();
      malformed[A] = { category: 'atomic' }; // sha256 부재
      writeD(malformed);
      res = verifyD();
      expect(
        'D fail-fast: sha256 부재 entry → D 발화 (조용한 검사 제외 금지)',
        codesD(A, res).includes('D'),
        JSON.stringify(codesD(A, res)),
      );

      // --- legacy 문자열 스키마: 자매 가드와 동일 읽기 → false-fire 없음 ---
      const legacy = healthy();
      legacy[A] = D_ATOMIC_SHA; // entry 자체가 sha 문자열 (자매 가드가 지원하는 스키마)
      writeD(legacy);
      res = verifyD();
      expect(
        'D 읽기 규약: legacy 문자열 entry → 위반 0 (자매 가드와 동일 해석)',
        codesD(A, res).length === 0,
        JSON.stringify(codesD(A, res)),
      );
      // legacy 스키마 + 위반 → repair 는 조용한 no-op 대신 throw
      const legacyBad = healthy();
      legacyBad[A] = sha('WRONG');
      writeD(legacyBad);
      let repairThrew = null;
      try {
        const { plan: pL, manifest: mL } = computeRepairPlan({ rootDir: root, baselineDir: up });
        applyRepairPlan({ rootDir: root, manifest: mL, plan: pL });
      } catch (err) {
        repairThrew = err;
      }
      expect(
        'D repair: 비-객체 entry (legacy 문자열 등) 는 조용한 no-op 대신 throw',
        repairThrew instanceof Error && /객체 스키마가 아닌 entry/.test(repairThrew.message),
        String(repairThrew),
      );

      // --- previousSha256 처분 분기: (C) 위반은 제거 / (D) 단독은 보존 ---
      const dOnlyPrev = healthy();
      dOnlyPrev[A] = {
        sha256: sha('STALE'),
        category: 'atomic',
        previousSha256: sha('UNRELATED-HISTORY'),
      };
      writeD(dOnlyPrev);
      const { plan: pP, manifest: mP } = computeRepairPlan({ rootDir: root, baselineDir: up });
      expect(
        'D repair: (D) 단독 위반은 previousSha256 보존 (오탐 시그니처 아님 — 과잉 파괴 금지)',
        pP.length === 1 && pP[0].dropPrevious === null,
        JSON.stringify(pP),
      );
      applyRepairPlan({ rootDir: root, manifest: mP, plan: pP });
      expect(
        'D repair: 보존 실증 — write 후에도 previousSha256 잔존',
        JSON.parse(readFileSync(join(root, MANIFEST_PATH), 'utf-8')).files[A].previousSha256 ===
          sha('UNRELATED-HISTORY'),
      );
      // 대조군 — (C2) 위반은 종전대로 제거 (기존 동작 보존 회귀 가드)
      const c2Prev = healthy();
      c2Prev[B] = { sha256: sha(UP_B), category: 'atomic', previousSha256: sha(LOC_B) };
      writeD(c2Prev);
      const { plan: pC2, manifest: mC2 } = computeRepairPlan({ rootDir: root, baselineDir: up });
      expect(
        'D repair 대조군: (C2) 위반은 종전대로 previousSha256 제거',
        pC2.length === 1 && pC2[0].dropPrevious === sha(LOC_B),
        JSON.stringify(pC2),
      );
      applyRepairPlan({ rootDir: root, manifest: mC2, plan: pC2 });
      expect(
        'D repair 대조군: write 후 previousSha256 제거됨',
        JSON.parse(readFileSync(join(root, MANIFEST_PATH), 'utf-8')).files[B].previousSha256 ===
          undefined,
      );

      // --- 적용 범위 경계 (과장 없는 고정) ---
      // downstream-only: upstream 원본이 없어 (D) 우변 미정의 → 미발화.
      // 그리고 그 entry 가 drift 하면 **항등식은 공통 스코프에서만** 성립한다는 사실이 드러난다.
      // 현재 저장소는 .harnessignore (#894 PR-B) 로 downstreamOnly=0 이라 원시 카운트까지 일치.
      writeFileSync(join(root, 'downstream-only.md'), 'local content\n');
      const withDownstream = healthy();
      withDownstream['downstream-only.md'] = { sha256: sha('DIFFERENT'), category: 'atomic' };
      writeD(withDownstream);
      res = verifyD();
      expect(
        'D scope: downstream-only 는 (D) 미발화 (upstream 원본 부재 — 우변 미정의)',
        codesD('downstream-only.md', res).length === 0 && res.counts.downstreamOnly === 1,
        JSON.stringify(codesD('downstream-only.md', res)),
      );
      expect(
        'D scope: 항등식은 공통 스코프 한정 — downstream-only drift 는 drift 에만 계상',
        driftSet().length === divergentSet(res).length + 1 &&
          driftSet().includes('downstream-only.md'),
        `drift=${JSON.stringify(driftSet())} divergent=${JSON.stringify(divergentSet(res))}`,
      );
      rmSync(join(root, 'downstream-only.md'));

      // missing-locally: 자매 가드도 drift 판정에서 제외 → 항등식 모수 밖 → (D) 미발화
      writeFileSync(join(up, 'ghost.md'), 'ghost\n');
      const withGhost = healthy();
      withGhost['ghost.md'] = { sha256: sha('WRONG-BASELINE'), category: 'atomic' };
      writeD(withGhost);
      res = verifyD();
      expect(
        'D scope: missing-locally 는 (D) 미발화 (양 가드 모두 모수 밖 + 덮어쓰기 위험 0)',
        codesD('ghost.md', res).length === 0 && res.counts.missingLocally === 1,
        JSON.stringify(codesD('ghost.md', res)),
      );
    } finally {
      rmSync(tmpD, { recursive: true, force: true });
    }
  }

  // --- exit 2 경로: --baseline-dir 부재 (오프라인 실행 인자 오타 등) ---
  {
    let threw = null;
    try {
      await resolveBaseline({ baselineDir: '/definitely/not/here' }, '.');
    } catch (err) {
      threw = err;
    }
    expect(
      'exit2: --baseline-dir 부재 → BaselineUnavailableError',
      threw instanceof BaselineUnavailableError,
      String(threw),
    );
  }

  // --- exit 2 경로: 네트워크 실패 (fetch 주입) ---
  {
    let threw = null;
    try {
      await ensureBaseline('0.0.0-nonexistent', {
        fetchImpl: async () => {
          throw new Error('getaddrinfo ENOTFOUND codeload.github.com');
        },
      });
    } catch (err) {
      threw = err;
    }
    expect(
      'exit2: 네트워크 실패 → BaselineUnavailableError (PASS 흡수 금지)',
      threw instanceof BaselineUnavailableError && /ENOTFOUND/.test(threw.message),
      String(threw),
    );
  }

  // --- reviewer R5 (#894): 버전 문자열 검증 (URL·캐시 경로 주입 차단) ---
  {
    for (const bad of ['../../etc', '4.5.0/../x', 'latest', '', '4.5', 'v4.5.0', '4.5.0 ']) {
      let threw = null;
      try {
        await ensureBaseline(bad, {
          fetchImpl: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }),
        });
      } catch (err) {
        threw = err;
      }
      expect(
        `R5: 비-semver 버전 거부 (${JSON.stringify(bad)}) — 네트워크 도달 전 fail-fast`,
        threw instanceof BaselineUnavailableError && /semver/.test(threw.message),
        String(threw),
      );
    }
    // 정상 semver (prerelease 포함) 는 통과해 fetch 단계로 진입 → 404 로 실패해야 함
    let threw = null;
    try {
      await ensureBaseline('0.0.0-selftest', {
        fetchImpl: async () => ({ ok: false, status: 404 }),
      });
    } catch (err) {
      threw = err;
    }
    expect(
      'R5: 정상 semver(prerelease) 는 통과 — 실패 사유가 semver 아닌 404',
      threw instanceof BaselineUnavailableError && /404/.test(threw.message),
      String(threw),
    );
  }

  // --- reviewer R5 (#894): 캐시 신뢰 경계 — marker 버전 불일치 시 캐시 무효화 ---
  {
    const cacheTmp = mkdtempSync(join(tmpdir(), 'harness-baseline-cache-'));
    const prevEnv = process.env.HARNESS_UPSTREAM_CACHE_DIR;
    process.env.HARNESS_UPSTREAM_CACHE_DIR = cacheTmp;
    try {
      // 오염된 캐시 조작: 디렉토리와 marker 는 있으나 marker 내용이 다른 버전
      const poisoned = join(cacheTmp, 'v1.2.3');
      mkdirSync(poisoned, { recursive: true });
      writeFileSync(join(poisoned, '.harness-baseline-ok'), '9.9.9\n');
      writeFileSync(join(poisoned, 'package.json'), '{}');
      let fetched = false;
      let threw = null;
      try {
        await ensureBaseline('1.2.3', {
          fetchImpl: async () => {
            fetched = true;
            return { ok: false, status: 404 };
          },
        });
      } catch (err) {
        threw = err;
      }
      expect(
        'R5: marker 버전 불일치 → 캐시 미신뢰 + 재다운로드 시도 (조용한 PASS 차단)',
        fetched === true && threw instanceof BaselineUnavailableError,
        `fetched=${fetched} threw=${threw}`,
      );

      // 정합 캐시는 네트워크 0 으로 hit
      const good = join(cacheTmp, 'v1.2.4');
      mkdirSync(good, { recursive: true });
      writeFileSync(join(good, '.harness-baseline-ok'), '1.2.4\n');
      writeFileSync(join(good, 'package.json'), '{}');
      let fetched2 = false;
      const r = await ensureBaseline('1.2.4', {
        fetchImpl: async () => {
          fetched2 = true;
          return { ok: false, status: 404 };
        },
      });
      expect(
        'R5: 정합 캐시는 hit (네트워크 요청 0)',
        r.cacheHit === true && fetched2 === false,
        JSON.stringify(r),
      );

      // package.json 누락 (전개 중단 잔해) → 캐시 미신뢰
      const partial = join(cacheTmp, 'v1.2.5');
      mkdirSync(partial, { recursive: true });
      writeFileSync(join(partial, '.harness-baseline-ok'), '1.2.5\n');
      let fetched3 = false;
      try {
        await ensureBaseline('1.2.5', {
          fetchImpl: async () => {
            fetched3 = true;
            return { ok: false, status: 404 };
          },
        });
      } catch {
        /* 404 기대 */
      }
      expect('R5: 무결성 파일 누락 캐시 → 재다운로드 시도', fetched3 === true);
    } finally {
      if (prevEnv === undefined) delete process.env.HARNESS_UPSTREAM_CACHE_DIR;
      else process.env.HARNESS_UPSTREAM_CACHE_DIR = prevEnv;
      rmSync(cacheTmp, { recursive: true, force: true });
    }
  }

  // --- exit 2 경로: 태그 부재 (HTTP 404) ---
  {
    let threw = null;
    try {
      await ensureBaseline('0.0.0-notag', {
        fetchImpl: async () => ({ ok: false, status: 404 }),
      });
    } catch (err) {
      threw = err;
    }
    expect(
      'exit2: 태그 부재 (404) → BaselineUnavailableError',
      threw instanceof BaselineUnavailableError && /404/.test(threw.message),
      String(threw),
    );
  }

  console.log('=== verify-harness-upstream-baseline self-test ===');
  console.log(log.join('\n'));
  console.log(`\n총 ${pass + fail} — PASS ${pass} / FAIL ${fail}`);
  return fail === 0 ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export {
  BaselineUnavailableError,
  categorize,
  categoricalSha256,
  managedSha256,
  decoratorPresence,
  inspectEntry,
  runVerify,
  computeRepairPlan,
  applyRepairPlan,
  ensureBaseline,
  resolveBaseline,
  REPAIR_DRY_RUN_MARKER,
  REPAIR_APPLY_MARKER,
  INVARIANT_VIOLATION_MARKER,
  MANIFEST_PATH,
};
