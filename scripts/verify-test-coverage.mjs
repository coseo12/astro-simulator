#!/usr/bin/env node
/**
 * verify:test-coverage
 *
 * P1 회고에서 apps/web Vitest 설정 누락으로 D그룹 9개 PR이 단위 테스트 없이
 * 머지된 사고가 발생. 모든 워크스페이스에 vitest.config 존재를 CI에서 강제한다.
 *
 * #1082 확장 — typecheck 배선 존재 검사.
 * CI 의 typecheck 배선은 패키지 열거형이라 (ADR 20260814-1060 결정 3 — 다중 --filter
 * 단일 호출은 silent no-op) 신규 워크스페이스가 열거에 안 들어가면 그 패키지의 테스트는
 * 조용히 타입 검사 사각이 되고 가드는 초록이다 (PR #1090 reviewer 실측 축). 열거가
 * ci.yml (web·physics-wasm) 과 ci-physics-wasm.yml (shared·core) 두 파일에 흩어져
 * 사람 눈 감시가 어려우므로, 여기서 워크스페이스 전수 × 2축을 기계 강제한다:
 *   (1) scripts.typecheck 가 실제 tsc 호출일 것 — echo no-op 이면 CI 배선이 있어도
 *       아무것도 검사하지 않은 채 exit 0 이다 (#1082 이전 physics-wasm 의 세 번째 결손).
 *   (2) .github/workflows/*.yml 어딘가에 규약 형태
 *       `pnpm --fail-if-no-match --filter <이름> typecheck` 호출이 존재할 것.
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

// #1082 — 워크플로 원문을 한 번만 읽어 typecheck 배선 존재를 검사한다.
// 매칭은 규약 형태의 리터럴 부분 문자열 — 후행 ` typecheck` 가 앵커라서
// 이름 접두 충돌 (예: web ⊂ web-foo) 이 없다 (npm ⊂ pnpm 부분 문자열 함정 회피).
const WORKFLOW_DIR = join(ROOT, '.github', 'workflows');
const workflowText = readdirSync(WORKFLOW_DIR)
  .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
  .map((f) => readFileSync(join(WORKFLOW_DIR, f), 'utf8'))
  .join('\n');

function readPkgJson(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel, 'package.json'), 'utf8'));
}

function isConfigOnlyPackage(pkg) {
  return pkg.private === true && pkg.name?.endsWith('-config'); // 설정 전용 패키지 면제
}

// (1) 실제 tsc 호출인가 — echo no-op(구 physics-wasm)·빈 문자열 차단.
function hasRealTypecheckScript(pkg) {
  const s = pkg.scripts?.typecheck;
  return typeof s === 'string' && /\btsc\b/.test(s);
}

// (2) CI 열거에 존재하는가 — 규약 형태 (분리 호출 + --fail-if-no-match) 그대로 탐색.
//     형태가 규약에서 벗어나면 (예: 다중 --filter 통합) 여기서 FAIL 하는 것이 의도다
//     — silent no-op 형태로의 회귀 자체가 차단 대상이다 (fail-fast, fallback 분기 금지).
function hasCiTypecheckWiring(pkg) {
  return workflowText.includes(`pnpm --fail-if-no-match --filter ${pkg.name} typecheck`);
}

const missing = [];
for (const ws of WORKSPACES) {
  for (const pkg of listPackages(ws)) {
    const cfg = hasVitestConfig(pkg);
    const script = hasTestScript(pkg);
    const pkgJson = readPkgJson(pkg);
    const configOnly = isConfigOnlyPackage(pkgJson);
    const typecheckScript = configOnly || hasRealTypecheckScript(pkgJson);
    const typecheckWiring = configOnly || hasCiTypecheckWiring(pkgJson);
    if (!cfg || !script || !typecheckScript || !typecheckWiring) {
      missing.push({ pkg, cfg, script, typecheckScript, typecheckWiring });
    }
  }
}

if (missing.length > 0) {
  console.error('❌ verify:test-coverage — 다음 워크스페이스에 테스트 설정이 누락되었습니다:');
  for (const m of missing) {
    const reasons = [];
    if (!m.cfg) reasons.push('vitest.config 없음');
    if (!m.script) reasons.push('package.json scripts.test 없음');
    if (!m.typecheckScript) reasons.push('scripts.typecheck 가 실제 tsc 호출이 아님 (#1082)');
    if (!m.typecheckWiring)
      reasons.push(
        '.github/workflows/*.yml 에 규약 형태 typecheck 배선 없음 (#1082 — pnpm --fail-if-no-match --filter <이름> typecheck)',
      );
    console.error(`  - ${m.pkg}: ${reasons.join(', ')}`);
  }
  console.error(
    '\nP1 회고 교훈: 신규 패키지 추가 시 Vitest 설정 누락은 후속 PR에서 검증 공백을 만듭니다.',
  );
  process.exit(1);
}

console.log(
  '✅ verify:test-coverage — 모든 워크스페이스에 Vitest 설정·test 스크립트·typecheck 배선이 존재합니다.',
);
