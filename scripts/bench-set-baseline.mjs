#!/usr/bin/env node
/**
 * bench 리포트를 baseline으로 복사 + 릴리스 태그별 비교.
 *
 * 사용:
 *   pnpm bench:scene:set-baseline           # 최신 bench:scene → baseline.json
 *   pnpm bench:scene:set-baseline -- --tag v0.4.0  # 최신 bench:webgpu → baseline-v0.4.0.json
 *   pnpm bench:scene:set-baseline -- --compare v0.4.0  # 현재 baseline vs v0.4.0 비교 출력
 *
 * P5-E #176 — 릴리스별 bench 스냅샷 관리.
 */
import { copyFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = join('docs', 'benchmarks');
const args = process.argv.slice(2);

const tagIdx = args.indexOf('--tag');
const tag = tagIdx >= 0 ? args[tagIdx + 1] : null;

const compareIdx = args.indexOf('--compare');
const compareTag = compareIdx >= 0 ? args[compareIdx + 1] : null;

if (compareTag) {
  const currentPath = join(dir, 'baseline.json');
  const taggedPath = join(dir, `baseline-${compareTag}.json`);
  if (!existsSync(currentPath)) {
    console.error('baseline.json 없음. 먼저 `pnpm bench:scene:set-baseline`을 실행하세요.');
    process.exit(1);
  }
  if (!existsSync(taggedPath)) {
    console.error(`baseline-${compareTag}.json 없음.`);
    process.exit(1);
  }
  const current = JSON.parse(readFileSync(currentPath, 'utf-8'));
  const tagged = JSON.parse(readFileSync(taggedPath, 'utf-8'));

  console.log(`\n=== baseline 비교: current vs ${compareTag} ===\n`);
  console.log(`current: ${current.timestamp ?? 'unknown'}`);
  console.log(`${compareTag}: ${tagged.timestamp ?? 'unknown'}\n`);

  const currentRows = current.rows ?? [];
  const taggedRows = tagged.rows ?? [];

  if (currentRows.length && taggedRows.length) {
    console.log('engine      belt   current_fps  tagged_fps   delta');
    for (const cr of currentRows) {
      const tr = taggedRows.find((r) => r.engine === cr.engine && r.belt === cr.belt);
      if (!tr || cr.fps == null || tr.fps == null) continue;
      const delta = (((cr.fps - tr.fps) / tr.fps) * 100).toFixed(1);
      const sign = cr.fps >= tr.fps ? '+' : '';
      console.log(
        `${cr.engine.padEnd(11)} ${String(cr.belt).padEnd(6)} ${String(cr.fps).padEnd(12)} ${String(tr.fps).padEnd(12)} ${sign}${delta}%`,
      );
    }
  } else {
    console.log('rows 데이터 없음 — 수동 비교 필요.');
  }
  process.exit(0);
}

// baseline 저장
const prefix = tag ? `p3b-` : '';
const exclude = tag ? [] : ['baseline.json'];
const files = readdirSync(dir)
  .filter(
    (f) =>
      f.endsWith('.json') && !f.startsWith('baseline') && (!prefix || f.startsWith(prefix) || !tag),
  )
  .sort();

const candidates = tag
  ? readdirSync(dir)
      .filter((f) => f.endsWith('.json') && f.startsWith('p3b-'))
      .sort()
  : readdirSync(dir)
      .filter(
        (f) =>
          f.endsWith('.json') &&
          !f.startsWith('baseline') &&
          !f.startsWith('p3b-') &&
          !f.startsWith('p2d'),
      )
      .sort();

if (!candidates.length) {
  console.error('리포트 없음. 먼저 bench를 실행하세요.');
  process.exit(1);
}

const latest = candidates.at(-1);
const dest = tag ? `baseline-${tag}.json` : 'baseline.json';
copyFileSync(join(dir, latest), join(dir, dest));
console.log(`${dest} ← ${latest}`);
