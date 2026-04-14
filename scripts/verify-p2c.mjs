#!/usr/bin/env node
/**
 * #110 P2-C 종합 검증 — 질량 슬라이더·북마크·프리셋 3 브라우저 스크립트 + bench 회귀.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const baseUrl = process.argv[2] ?? 'http://localhost:3001';
const ROOT = process.cwd();

const steps = [
  ['질량 슬라이더', 'scripts/browser-verify-mass-slider.mjs'],
  ['URL 북마크', 'scripts/browser-verify-bookmark.mjs'],
  ['프리셋 시나리오', 'scripts/browser-verify-presets.mjs'],
];

let anyFail = false;
for (const [name, script] of steps) {
  console.log(`\n================ ${name} (${script}) ================`);
  try {
    execSync(`node ${script} ${baseUrl}`, { stdio: 'inherit' });
  } catch {
    console.log(`✗ ${name} FAIL`);
    anyFail = true;
  }
}

console.log('\n================ bench:scene (baseline 회귀) ================');
execSync('BENCH_PHASE=p2-c-regression pnpm bench:scene', { stdio: 'inherit' });

const benchDir = join(ROOT, 'docs', 'benchmarks');
const baseline = existsSync(join(benchDir, 'baseline.json'))
  ? JSON.parse(readFileSync(join(benchDir, 'baseline.json'), 'utf8'))
  : null;
const files = execSync(`ls ${benchDir}/*.json | grep -v baseline | sort`)
  .toString()
  .trim()
  .split('\n');
const latest = JSON.parse(readFileSync(files.at(-1), 'utf8'));

console.log('\n[회귀 체크 — baseline 대비 10% 이하 감소]');
let regression = false;
if (baseline) {
  for (const s of latest.scenarios) {
    const bs = baseline.scenarios.find((b) => b.name === s.name);
    if (!bs || !['idle', 'play-1d', 'play-1y'].includes(s.name)) continue;
    const pct = ((s.fps - bs.fps) / bs.fps) * 100;
    const mark = pct >= -10 ? '✓' : '⚠';
    console.log(`  ${mark} ${s.name}: ${s.fps} (baseline ${bs.fps}, ${pct.toFixed(1)}%)`);
    if (pct < -10) regression = true;
  }
}

if (anyFail || regression) {
  console.log('\n❌ P2-C 종합 검증 실패');
  process.exit(1);
}
console.log('\n✅ P2-C 종합 검증 통과');
