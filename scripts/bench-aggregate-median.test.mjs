#!/usr/bin/env node
/**
 * #225 — bench-aggregate-median.mjs 회귀 가드.
 *
 * stand-alone node 테스트 (check-duplicate-functions.test.mjs 선례 계승).
 */
import assert from 'node:assert/strict';
import { median, collectFps, buildBaseline, parseArgs } from './bench-aggregate-median.mjs';

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

console.log('bench-aggregate-median');

run('median — 홀수 개 정렬 후 중앙', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([90.81, 85.2, 92.0, 88.5, 86.3]), 88.5);
});

run('median — 짝수 개 중앙 평균', () => {
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([90, 91, 94, 97]), 92.5);
});

run('median — 빈 배열은 throw', () => {
  assert.throws(() => median([]));
});

run('collectFps — scenarios / nBody 회차별 fps 누적', () => {
  const reports = [
    {
      data: {
        scenarios: [
          { name: 'focus-earth', fps: 90 },
          { name: 'focus-neptune', fps: 96 },
        ],
        nBody: [{ n: 100, fps: 23 }],
      },
    },
    {
      data: {
        scenarios: [
          { name: 'focus-earth', fps: 88 },
          { name: 'focus-neptune', fps: 92 },
        ],
        nBody: [{ n: 100, fps: 24 }],
      },
    },
    {
      data: {
        scenarios: [{ name: 'focus-earth', fps: 85 }],
        nBody: [{ n: 100, fps: 22 }],
      },
    },
  ];
  const { scenarios, nBody, sampleCount } = collectFps(reports);
  assert.equal(sampleCount, 3);
  assert.deepEqual(scenarios.get('focus-earth'), [90, 88, 85]);
  assert.deepEqual(scenarios.get('focus-neptune'), [96, 92]); // 3번째 회차 누락
  assert.deepEqual(nBody.get(100), [23, 24, 22]);
});

run('collectFps — NaN/Infinity 는 제외', () => {
  const { scenarios } = collectFps([
    { data: { scenarios: [{ name: 'x', fps: NaN }] } },
    { data: { scenarios: [{ name: 'x', fps: 10 }] } },
    { data: { scenarios: [{ name: 'x', fps: Infinity }] } },
  ]);
  assert.deepEqual(scenarios.get('x'), [10]);
});

run('buildBaseline — 기존 baseline.json 스키마 호환', () => {
  const collected = {
    scenarios: new Map([
      ['focus-earth', [90, 88, 85, 92, 87]],
      ['focus-neptune', [96, 92, 94, 98, 90]],
    ]),
    nBody: new Map([
      [100, [23, 24, 22, 25, 23]],
      [1000, [7, 8, 6, 7, 7]],
    ]),
    sampleCount: 5,
  };
  const out = buildBaseline(collected, {
    phase: 'pr-225',
    environment: 'gh-actions-ubuntu',
    firstReport: { durationMs: 3000, viewport: '1280x800' },
  });
  // 스키마 필드 존재
  assert.ok(typeof out.timestamp === 'string');
  assert.equal(out.phase, 'pr-225');
  assert.equal(out.durationMs, 3000);
  assert.equal(out.environment, 'gh-actions-ubuntu');
  assert.equal(out.viewport, '1280x800');
  assert.equal(out.source_count, 5);
  // median 정확성 + nBody 오름차순 정렬
  const earth = out.scenarios.find((s) => s.name === 'focus-earth');
  assert.equal(earth.fps, 88); // median([85,87,88,90,92]) = 88
  assert.equal(earth.samples, 5);
  assert.equal(out.nBody[0].n, 100);
  assert.equal(out.nBody[1].n, 1000);
});

run('parseArgs — 네 플래그 모두 파싱', () => {
  const a = parseArgs([
    '--input-dir',
    '/tmp/runs',
    '--phase',
    'pr-225',
    '--environment',
    'gh-ubuntu',
    '--output',
    'out.json',
  ]);
  assert.equal(a.inputDir, '/tmp/runs');
  assert.equal(a.phase, 'pr-225');
  assert.equal(a.environment, 'gh-ubuntu');
  assert.equal(a.output, 'out.json');
});

run('parseArgs — 기본 phase=remeasure', () => {
  const a = parseArgs(['--input-dir', '/tmp/x']);
  assert.equal(a.phase, 'remeasure');
});

console.log(`\n${passed} passed`);
