#!/usr/bin/env node
/**
 * #225 — bench:scene:sweep 여러 회차 실측 JSON 을 받아 scenario/nBody 별 중앙값을
 * 계산하고 `docs/benchmarks/baseline.json` 포맷으로 출력.
 *
 * 목적: GH Actions ubuntu headless 환경의 회차별 fps 변동을 10회 median 으로
 *       흡수해 `bench:scene:sweep` 회귀 경고를 0 건에 수렴시킨다 (volt #25 참고).
 *
 * 사용:
 *   node scripts/bench-aggregate-median.mjs \
 *     --input-dir /tmp/bench-runs \
 *     --phase "pr-225-median-10" \
 *     --environment "gh-actions-ubuntu-chromium-headless" \
 *     --output docs/benchmarks/baseline-candidate.json
 *
 * 규약:
 *   - 입력 JSON 은 `scripts/bench-scene.mjs` 출력 스키마와 일치 (scenarios[]·nBody[])
 *   - 최소 3 샘플 필요 (중앙값 신뢰성). 미달 시 exit 1
 *   - 결측 시나리오(일부 회차에서 누락) 는 존재하는 회차만으로 median — 회차 수 필드 `samples` 에 명시
 *   - 출력은 기존 baseline.json 과 동일 필드 + `samples` / `source_count` 메타 추가
 *   - #1209 — 출력에 `commit` (측정 대상 빌드 sha) 포함. 회차 리포트의 `commit` 에서
 *     파생하며, `--commit` 이 주어지면 **교차 검증**한다 (불일치 = exit 1). 서로 다른
 *     커밋의 회차가 한 baseline 으로 섞이면 출처 필드 자체가 거짓이 되기 때문이다.
 *
 * 의존성 없음. stand-alone Node 실행.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function parseArgs(argv) {
  const args = {
    inputDir: null,
    phase: 'remeasure',
    environment: null,
    output: null,
    commit: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--input-dir') args.inputDir = next;
    else if (arg === '--phase') args.phase = next;
    else if (arg === '--environment') args.environment = next;
    else if (arg === '--output') args.output = next;
    else if (arg === '--commit') args.commit = next;
  }
  return args;
}

/**
 * 회차 리포트들에서 측정 대상 커밋 sha 를 파생한다 (#1209).
 *
 * @returns 유일한 sha, 또는 어느 회차에도 기록이 없으면 `null`
 * @throws 회차별 sha 가 갈리면 throw — median 은 **같은 빌드의 회차 반복**이라는 전제
 *         위에서만 의미가 있고, 그 전제가 깨진 것을 출처 필드가 숨기면 안 된다.
 */
export function deriveCommit(reports) {
  const seen = new Set();
  for (const { data } of reports) {
    if (typeof data.commit === 'string' && data.commit.length > 0) seen.add(data.commit);
  }
  if (seen.size === 0) return null;
  if (seen.size > 1) {
    throw new Error(
      `[bench-aggregate-median] 회차별 commit 불일치 — ${[...seen].join(', ')}. ` +
        '서로 다른 빌드의 회차가 섞였다 (median 전제 위반).',
    );
  }
  return [...seen][0];
}

export function readJsonFiles(dir) {
  const entries = readdirSync(dir);
  const jsons = [];
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    const full = join(dir, name);
    if (!statSync(full).isFile()) continue;
    const text = readFileSync(full, 'utf8');
    try {
      jsons.push({ path: full, data: JSON.parse(text) });
    } catch (e) {
      throw new Error(`[bench-aggregate-median] ${full} JSON 파싱 실패: ${e.message}`);
    }
  }
  return jsons;
}

/** 숫자 배열의 중앙값. 짝수 개면 두 중앙 평균, 홀수 개면 중앙값. */
export function median(values) {
  if (values.length === 0) throw new Error('median: 빈 배열');
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * 여러 bench 리포트를 받아 scenario/nBody 의 회차별 fps 배열로 재구성.
 * @returns {{ scenarios: Map<string, number[]>, nBody: Map<number, number[]>, sampleCount: number }}
 */
export function collectFps(reports) {
  const scenarios = new Map();
  const nBody = new Map();
  for (const { data } of reports) {
    if (Array.isArray(data.scenarios)) {
      for (const s of data.scenarios) {
        if (typeof s.fps !== 'number' || !Number.isFinite(s.fps)) continue;
        const list = scenarios.get(s.name) ?? [];
        list.push(s.fps);
        scenarios.set(s.name, list);
      }
    }
    if (Array.isArray(data.nBody)) {
      for (const n of data.nBody) {
        if (typeof n.fps !== 'number' || !Number.isFinite(n.fps)) continue;
        const list = nBody.get(n.n) ?? [];
        list.push(n.fps);
        nBody.set(n.n, list);
      }
    }
  }
  return { scenarios, nBody, sampleCount: reports.length };
}

/** 회차별 fps 배열을 median 으로 축약 → baseline.json 스키마 생성. */
export function buildBaseline({ scenarios, nBody, sampleCount }, meta) {
  const firstReport = meta.firstReport ?? {};
  return {
    timestamp: new Date().toISOString(),
    phase: meta.phase,
    // #1209 — 출처. 없으면 `null` 로 **명시**한다 (필드 자체를 빼면 「기록 안 함」과
    //   「기록할 수 없었음」이 구분되지 않는다).
    commit: meta.commit ?? null,
    durationMs: firstReport.durationMs ?? null,
    environment: meta.environment ?? firstReport.environment ?? 'unknown',
    viewport: firstReport.viewport ?? null,
    scenarios: Array.from(scenarios.entries()).map(([name, fpsList]) => ({
      name,
      fps: Number(median(fpsList).toFixed(2)),
      samples: fpsList.length,
    })),
    nBody: Array.from(nBody.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([n, fpsList]) => ({
        n,
        fps: Number(median(fpsList).toFixed(2)),
        samples: fpsList.length,
      })),
    source_count: sampleCount,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.inputDir) {
    console.error(
      'usage: bench-aggregate-median.mjs --input-dir <dir> [--phase <str>] [--environment <str>] [--output <path>] [--commit <sha>]',
    );
    process.exit(2);
  }
  const reports = readJsonFiles(args.inputDir);
  if (reports.length < 3) {
    console.error(`[bench-aggregate-median] 최소 3 샘플 필요 — 실제 ${reports.length}개`);
    process.exit(1);
  }
  const collected = collectFps(reports);
  // #1209 — 출처 커밋. `--commit` (워크플로가 `GITHUB_SHA` 로 채운다) 과 리포트 파생값이
  //   둘 다 있으면 일치해야 한다. 한쪽만 있으면 있는 쪽을 쓴다.
  const derivedCommit = deriveCommit(reports);
  if (args.commit && derivedCommit && args.commit !== derivedCommit) {
    console.error(
      `[bench-aggregate-median] commit 불일치 — --commit=${args.commit} vs 리포트 기록=${derivedCommit}`,
    );
    process.exit(1);
  }
  const commit = args.commit ?? derivedCommit;
  if (!commit) {
    console.warn(
      '[bench-aggregate-median] ⚠ commit 미기록 — baseline 출처를 추적할 수 없다 (구버전 리포트?)',
    );
  }
  const baseline = buildBaseline(collected, {
    phase: args.phase,
    environment: args.environment,
    commit,
    firstReport: reports[0].data,
  });
  const json = JSON.stringify(baseline, null, 2) + '\n';
  if (args.output) {
    writeFileSync(args.output, json);
    console.log(
      `[bench-aggregate-median] ${args.output} (source_count=${reports.length}, commit=${commit ?? '(미기록)'})`,
    );
  } else {
    process.stdout.write(json);
  }
}

// 직접 실행 시에만 main 실행 (테스트 import 시에는 부작용 없음).
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
