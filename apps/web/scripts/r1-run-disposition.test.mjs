#!/usr/bin/env node
/**
 * #1258 — r1-guard 비-SSoT 환경 처분 판정(`resolveRunDisposition`) 회귀 가드.
 *
 * stand-alone node 테스트 (`apps/web/vitest.config.ts` 의 include 는 `src/**` 라 이 파일은
 * vitest 글롭 밖이다). CI `ci.yml` 에 배선한다 — **테스트가 있다 ≠ 그 테스트가 돈다** (#1103).
 * 저장소의 다른 stand-alone `.test.mjs` 와 같은 관행이다 — `git ls-files '*.test.mjs'` 의
 * 본 파일 제외 **6/6 이 전부 `package.json` 미배선**(CI 전용)이다.
 *
 * 이 파일이 지키는 것 넷:
 *   1. **전수 고정** — `platform 2 × skipLocal 2 × forceLocal 2 × mode 4 = 32` 셀을 전부 명시한다.
 *      판정이 4축이라 한 축만 보면 조용히 drift 한다 (#1258 자체가 「회피 경로가 있는데 안 보인다」였다).
 *   2. **CI 불변** — `linux` 16 셀이 전부 `run` 이다. 판정 SSoT 경로는 본 변경의 비-범위다.
 *   3. **종전 동작 보존** — `forceLocal=false` 16 셀을 #1258 이전 판정식과 대조해 **바뀐 셀이
 *      정확히 1 개** 임을 단언한다. 기대값을 상수로만 적으면 그 상수가 또 하나의 drift 원이 된다.
 *   4. **판별력** — 완화 변이를 **표 전체에 돌려** 깨지는 셀 집합을 단언한다. 「변이 결과가
 *      프로덕션과 다르다」만 보면 한 셀을 재확인할 뿐이라 이름이 주장하는 바에 못 미친다
 *      (PR #1261 cross-validate + reviewer 공통 지적).
 */
import assert from 'node:assert/strict';
import { R1_RUN_MODES, allowsBaselineWrite, resolveRunDisposition } from './r1-ui-regions.mjs';

let passed = 0;
const run = (name, fn) => {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed += 1;
  } catch (e) {
    console.error(`  ✗ ${name}\n    ${e.message}`);
    process.exitCode = 1;
  }
};

const key = ({ platform, skipLocal, forceLocal, mode }) =>
  `${platform}|skip=${skipLocal}|force=${forceLocal}|${mode}`;

/** 32 셀 전수표. `expected` 는 손으로 적은 기대값이고, 프로덕션 함수를 재구현하지 않는다. */
const TABLE = [
  // --- linux 16: 판정 SSoT. 어떤 조합에서도 run. ---
  ...['verify', 'update', 'measure-sun', 'measure-px-ratio'].flatMap((mode) =>
    [false, true].flatMap((skipLocal) =>
      [false, true].map((forceLocal) => ({
        platform: 'linux',
        skipLocal,
        forceLocal,
        mode,
        expected: 'run',
      })),
    ),
  ),
  // --- darwin 16 ---
  // measure-px-ratio: baseline PNG 를 안 쓴다 → 폰트 축 무관, 항상 run.
  {
    platform: 'darwin',
    skipLocal: false,
    forceLocal: false,
    mode: 'measure-px-ratio',
    expected: 'run',
  },
  {
    platform: 'darwin',
    skipLocal: false,
    forceLocal: true,
    mode: 'measure-px-ratio',
    expected: 'run',
  },
  {
    platform: 'darwin',
    skipLocal: true,
    forceLocal: false,
    mode: 'measure-px-ratio',
    expected: 'run',
  },
  {
    platform: 'darwin',
    skipLocal: true,
    forceLocal: true,
    mode: 'measure-px-ratio',
    expected: 'run',
  },
  // update / measure-sun: baseline 대비 판정을 하지 않는다 → force 는 정의상 no-op.
  { platform: 'darwin', skipLocal: false, forceLocal: false, mode: 'update', expected: 'run' },
  { platform: 'darwin', skipLocal: false, forceLocal: true, mode: 'update', expected: 'run' },
  { platform: 'darwin', skipLocal: true, forceLocal: false, mode: 'update', expected: 'skip' },
  { platform: 'darwin', skipLocal: true, forceLocal: true, mode: 'update', expected: 'skip' },
  { platform: 'darwin', skipLocal: false, forceLocal: false, mode: 'measure-sun', expected: 'run' },
  { platform: 'darwin', skipLocal: false, forceLocal: true, mode: 'measure-sun', expected: 'run' },
  { platform: 'darwin', skipLocal: true, forceLocal: false, mode: 'measure-sun', expected: 'skip' },
  { platform: 'darwin', skipLocal: true, forceLocal: true, mode: 'measure-sun', expected: 'skip' },
  // verify: 본 이슈가 다루는 유일한 모드. force 가 ambient skip 을 이긴다.
  { platform: 'darwin', skipLocal: false, forceLocal: false, mode: 'verify', expected: 'not-ssot' },
  {
    platform: 'darwin',
    skipLocal: false,
    forceLocal: true,
    mode: 'verify',
    expected: 'run-not-ssot',
  },
  { platform: 'darwin', skipLocal: true, forceLocal: false, mode: 'verify', expected: 'skip' },
  {
    platform: 'darwin',
    skipLocal: true,
    forceLocal: true,
    mode: 'verify',
    expected: 'run-not-ssot',
  },
];

run('표가 전수다 — platform 2 × skipLocal 2 × forceLocal 2 × mode 4 = 32 셀, 중복 없음', () => {
  assert.equal(TABLE.length, 32, '행 수');
  const keys = new Set(TABLE.map(key));
  assert.equal(keys.size, 32, '중복 행');
  for (const platform of ['linux', 'darwin'])
    for (const skipLocal of [false, true])
      for (const forceLocal of [false, true])
        for (const mode of R1_RUN_MODES)
          assert.ok(
            keys.has(key({ platform, skipLocal, forceLocal, mode })),
            `누락: ${key({ platform, skipLocal, forceLocal, mode })}`,
          );
});

run('32 셀 전건 일치', () => {
  for (const cell of TABLE) assert.equal(resolveRunDisposition(cell), cell.expected, key(cell));
});

run('CI 불변 — linux 16 셀이 전부 run', () => {
  const linux = TABLE.filter((c) => c.platform === 'linux');
  assert.equal(linux.length, 16, 'linux 셀 수');
  for (const cell of linux) assert.equal(resolveRunDisposition(cell), 'run', key(cell));
});

run('종전 동작 보존 — force 축을 뺀 16 셀 중 바뀐 것은 정확히 1 개', () => {
  // #1258 이전 판정을 그 자리에서 재현한다 (기대값을 상수로만 적으면 그 상수가 drift 원이 된다).
  const legacy = ({ platform, skipLocal, mode }) =>
    skipLocal && platform === 'darwin' && mode !== 'measure-px-ratio' ? 'skip' : 'run';
  const scope = TABLE.filter((c) => c.forceLocal === false);
  assert.equal(scope.length, 16, '비교 대상 셀 수');
  const changed = scope.filter((c) => resolveRunDisposition(c) !== legacy(c));
  assert.deepEqual(changed.map(key), ['darwin|skip=false|force=false|verify']);
});

run('판별력 — verify 차단을 놓아주는 변이는 표에서 정확히 그 셀을 깨뜨린다', () => {
  // 「변이 결과 !== 프로덕션 결과」만 보면 한 셀을 재확인할 뿐이다. 실제로 물어야 하는 것은
  // 「이 변이를 넣으면 위 32 셀 단언이 어디서 FAIL 하는가」다.
  const mutated = ({ platform, skipLocal, forceLocal, mode }) => {
    if (platform !== 'darwin') return 'run';
    if (mode === 'measure-px-ratio') return 'run';
    if (forceLocal && mode === 'verify') return 'run-not-ssot';
    if (skipLocal) return 'skip';
    return 'run'; // ← not-ssot 분기 제거
  };
  const broken = TABLE.filter((c) => mutated(c) !== c.expected);
  assert.deepEqual(broken.map(key), ['darwin|skip=false|force=false|verify']);
});

run('판별력 — force 경로를 지우는 변이는 verify force 2 셀을 깨뜨린다', () => {
  const mutated = ({ platform, skipLocal, mode }) => {
    if (platform !== 'darwin') return 'run';
    if (mode === 'measure-px-ratio') return 'run';
    if (skipLocal) return 'skip';
    if (mode === 'verify') return 'not-ssot';
    return 'run'; // ← forceLocal 분기 제거
  };
  const broken = TABLE.filter((c) => mutated(c) !== c.expected);
  assert.deepEqual(broken.map(key), [
    'darwin|skip=false|force=true|verify',
    'darwin|skip=true|force=true|verify',
  ]);
});

run('baseline 쓰기 계약 — 강제 실행 2 셀에서만 금지된다', () => {
  // §결정 4 의 「측정만, 판정하지 않는다」에는 **쓰지도 않는다**가 포함된다. 부트스트랩 분기가
  // baseline 부재 시 현재 캡처를 그대로 기록하는데, darwin 에서 그것은 macOS 폰트다
  // (PR #1261 reviewer R2-B2 — 실측 재현됨). 조건식을 호출부에 인라인하면 이 표가 계약을
  // 덮지 못하므로 순수 함수로 뽑아 32 셀에 걸어 둔다.
  const denied = TABLE.filter((c) => !allowsBaselineWrite(resolveRunDisposition(c)));
  assert.deepEqual(denied.map(key), [
    'darwin|skip=false|force=true|verify',
    'darwin|skip=true|force=true|verify',
  ]);
  // 나머지 30 셀은 종전대로 쓸 수 있다 — `--update` 와 최초 부트스트랩 경로가 여기 있다.
  assert.equal(TABLE.length - denied.length, 30);
});

run('fail-closed — 미등록 mode 는 조용히 run 으로 빠지지 않는다', () => {
  // 오타가 도달하는 경로는 없다 (mode 는 guard 의 flags 파생). 막는 것은 모드 추가 drift 다 —
  // 새 모드를 guard 파생에만 더하면 위 전수 표는 그 셀을 아예 만들지 않는다.
  for (const platform of ['linux', 'darwin', 'win32'])
    assert.throws(
      () => resolveRunDisposition({ platform, skipLocal: false, forceLocal: false, mode: 'verfy' }),
      TypeError,
      platform,
    );
});

run('알 수 없는 platform 은 run — 판정 SSoT 후보를 막지 않는다', () => {
  for (const mode of R1_RUN_MODES)
    for (const skipLocal of [false, true])
      for (const forceLocal of [false, true])
        assert.equal(
          resolveRunDisposition({ platform: 'win32', skipLocal, forceLocal, mode }),
          'run',
          `${mode}|${skipLocal}|${forceLocal}`,
        );
});

console.log(`\n${passed} passed`);
