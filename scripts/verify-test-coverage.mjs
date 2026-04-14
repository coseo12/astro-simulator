#!/usr/bin/env node
/**
 * verify:test-coverage
 *
 * P1 회고에서 apps/web Vitest 설정 누락으로 D그룹 9개 PR이 단위 테스트 없이
 * 머지된 사고가 발생. 모든 워크스페이스에 vitest.config 존재를 CI에서 강제한다.
 */
import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const WORKSPACES = ['apps', 'packages'];
const CONFIG_CANDIDATES = [
  'vitest.config.ts',
  'vitest.config.js',
  'vitest.config.mjs',
  'vite.config.ts',
];

function listPackages(dir) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs)
    .map((name) => join(dir, name))
    .filter((rel) => {
      const full = join(ROOT, rel);
      return statSync(full).isDirectory() && existsSync(join(full, 'package.json'));
    });
}

function hasVitestConfig(rel) {
  const full = join(ROOT, rel);
  if (CONFIG_CANDIDATES.some((c) => existsSync(join(full, c)))) return true;
  // vite.config.ts 에 test: {} 블록이 있는 경우도 허용
  const vite = join(full, 'vite.config.ts');
  if (existsSync(vite)) {
    const src = readFileSync(vite, 'utf8');
    if (/\btest\s*:\s*\{/.test(src)) return true;
  }
  return false;
}

function hasTestScript(rel) {
  const pkgPath = join(ROOT, rel, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (pkg.private === true && pkg.name?.endsWith('-config')) return true; // 설정 전용 패키지 면제
  return typeof pkg.scripts?.test === 'string' && pkg.scripts.test.length > 0;
}

const missing = [];
for (const ws of WORKSPACES) {
  for (const pkg of listPackages(ws)) {
    const cfg = hasVitestConfig(pkg);
    const script = hasTestScript(pkg);
    if (!cfg || !script) {
      missing.push({ pkg, cfg, script });
    }
  }
}

if (missing.length > 0) {
  console.error('❌ verify:test-coverage — 다음 워크스페이스에 테스트 설정이 누락되었습니다:');
  for (const m of missing) {
    const reasons = [];
    if (!m.cfg) reasons.push('vitest.config 없음');
    if (!m.script) reasons.push('package.json scripts.test 없음');
    console.error(`  - ${m.pkg}: ${reasons.join(', ')}`);
  }
  console.error(
    '\nP1 회고 교훈: 신규 패키지 추가 시 Vitest 설정 누락은 후속 PR에서 검증 공백을 만듭니다.',
  );
  process.exit(1);
}

console.log(
  '✅ verify:test-coverage — 모든 워크스페이스에 Vitest 설정과 test 스크립트가 존재합니다.',
);
