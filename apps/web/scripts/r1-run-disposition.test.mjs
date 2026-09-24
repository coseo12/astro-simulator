#!/usr/bin/env node
/**
 * #1258 — r1-guard 비-SSoT 환경 처분 판정(`resolveRunDisposition`) 회귀 가드.
 *
 * stand-alone node 테스트 (`apps/web/vitest.config.ts` 의 include 는 `src/**` 라 이 파일은
 * vitest 글롭 밖이다). CI `ci.yml` 에 배선한다 — **테스트가 있다 ≠ 그 테스트가 돈다** (#1103).
 *
 * 이 파일이 지키는 것 셋:
 *   1. **전수 고정** — `platform 2 × skipLocal 2 × mode 4 = 16` 셀을 전부 명시한다. 판정이
 *      3축이라 한 축만 보면 조용히 drift 한다 (#1258 자체가 「회피 경로가 있는데 안 보인다」였다).
 *   2. **CI 불변** — `linux` 8 셀이 전부 `run` 이다. 판정 SSoT 경로는 본 변경의 비-범위다.
 *   3. **종전 동작 보존** — darwin `update` · `measure-sun` · `measure-px-ratio` 는 #1258 이전과
 *      같은 처분이어야 한다. 새로 막는 것은 `verify` **하나뿐**이다.
 */
import assert from 'node:assert/strict';
import { R1_RUN_MODES, resolveRunDisposition } from './r1-ui-regions.mjs';

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

/**
 * 16 셀 전수표. `expected` 는 손으로 적은 기대값이고, 프로덕션 함수를 재구현하지 않는다.
 *
 * `note` 는 #1258 기준 «신규» 인지 «종전과 동일» 인지를 셀 단위로 박제한다 — 이 PR 이 바꾼
 * 셀이 정확히 1 개임을 표 자체가 증명하게 하려는 것이다.
 */
const TABLE = [
  // platform, skipLocal, mode, expected, note
  ['linux', false, 'verify', 'run', '종전 동일 — CI 판정 SSoT'],
  ['linux', false, 'update', 'run', '종전 동일'],
  ['linux', false, 'measure-sun', 'run', '종전 동일'],
  ['linux', false, 'measure-px-ratio', 'run', '종전 동일'],
  ['linux', true, 'verify', 'run', '종전 동일 — SKIP_LOCAL 은 darwin 한정'],
  ['linux', true, 'update', 'run', '종전 동일'],
  ['linux', true, 'measure-sun', 'run', '종전 동일'],
  ['linux', true, 'measure-px-ratio', 'run', '종전 동일'],
  ['darwin', false, 'verify', 'not-ssot', '★ 신규 — 종전에는 exit 1 (회귀 검출을 사칭)'],
  ['darwin', false, 'update', 'run', '종전 동일 — baseline 을 쓰는 게 아니라 만든다'],
  ['darwin', false, 'measure-sun', 'run', '종전 동일 — baseline 비교 전에 반환'],
  ['darwin', false, 'measure-px-ratio', 'run', '종전 동일 — 폰트 축 무관'],
  ['darwin', true, 'verify', 'skip', '종전 동일 (exit 0) — 출력만 추가'],
  ['darwin', true, 'update', 'skip', '종전 동일'],
  ['darwin', true, 'measure-sun', 'skip', '종전 동일'],
  ['darwin', true, 'measure-px-ratio', 'run', '종전 동일 — SKIP_LOCAL 무관'],
];

run('표가 전수다 — platform 2 × skipLocal 2 × mode 4 = 16 셀, 중복 없음', () => {
  assert.equal(TABLE.length, 16, '행 수');
  const keys = new Set(TABLE.map(([p, s, m]) => `${p}|${s}|${m}`));
  assert.equal(keys.size, 16, '중복 행');
  for (const platform of ['linux', 'darwin']) {
    for (const skipLocal of [false, true]) {
      for (const mode of R1_RUN_MODES) {
        assert.ok(
          keys.has(`${platform}|${skipLocal}|${mode}`),
          `누락: ${platform}|${skipLocal}|${mode}`,
        );
      }
    }
  }
});

run('16 셀 전건 일치', () => {
  for (const [platform, skipLocal, mode, expected, note] of TABLE) {
    const actual = resolveRunDisposition({ platform, skipLocal, mode });
    assert.equal(actual, expected, `${platform}|skipLocal=${skipLocal}|${mode} (${note})`);
  }
});

run('CI 불변 — linux 8 셀이 전부 run', () => {
  const linux = TABLE.filter(([p]) => p === 'linux');
  assert.equal(linux.length, 8, 'linux 셀 수');
  for (const [, skipLocal, mode] of linux) {
    assert.equal(resolveRunDisposition({ platform: 'linux', skipLocal, mode }), 'run', mode);
  }
});

run('본 변경이 바꾼 셀은 정확히 1 개 — darwin + verify + SKIP_LOCAL 미설정', () => {
  // 종전 판본의 판정을 그 자리에서 재현한다 (fail-open 회피: 기대값을 상수로 적지 않는다).
  const legacy = ({ platform, skipLocal, mode }) =>
    skipLocal && platform === 'darwin' && mode !== 'measure-px-ratio' ? 'skip' : 'run';
  const changed = TABLE.filter(
    ([platform, skipLocal, mode]) =>
      resolveRunDisposition({ platform, skipLocal, mode }) !==
      legacy({ platform, skipLocal, mode }),
  );
  assert.deepEqual(
    changed.map(([p, s, m]) => `${p}|${s}|${m}`),
    ['darwin|false|verify'],
  );
});

run('판별력 — verify 를 놓아주는 완화 변이는 이 테스트를 깨뜨린다', () => {
  // 「darwin verify 를 run 으로 되돌리는」 변이가 통과하면 #1258 이 그대로 재발한다.
  const mutated = ({ platform, skipLocal, mode }) =>
    platform === 'darwin' && skipLocal && mode !== 'measure-px-ratio' ? 'skip' : 'run';
  assert.notEqual(
    mutated({ platform: 'darwin', skipLocal: false, mode: 'verify' }),
    resolveRunDisposition({ platform: 'darwin', skipLocal: false, mode: 'verify' }),
  );
});

run('알 수 없는 platform 은 run — 판정 SSoT 후보를 막지 않는다', () => {
  for (const mode of R1_RUN_MODES) {
    assert.equal(resolveRunDisposition({ platform: 'win32', skipLocal: false, mode }), 'run', mode);
    assert.equal(resolveRunDisposition({ platform: 'win32', skipLocal: true, mode }), 'run', mode);
  }
});

console.log(`\n${passed} passed`);
