#!/usr/bin/env node
/**
 * 가장 최근 bench:scene 리포트를 baseline.json으로 복사.
 * 의미 있는 기준점(예: P1 종료, P2-0 완료) 갱신 시 호출.
 */
import { copyFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = join('docs', 'benchmarks');
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.json') && f !== 'baseline.json')
  .sort();

if (!files.length) {
  console.error('리포트 없음. 먼저 `pnpm bench:scene`을 실행하세요.');
  process.exit(1);
}

const latest = files.at(-1);
copyFileSync(join(dir, latest), join(dir, 'baseline.json'));
console.log(`baseline ← ${latest}`);
