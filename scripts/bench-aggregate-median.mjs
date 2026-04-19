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
 *
 * 의존성 없음. stand-alone Node 실행.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function parseArgs(argv) {
  const args = { inputDir: null, phase: 'remeasure', environment: null, output: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--input-dir') args.inputDir = next;
    else if (arg === '--phase') args.phase = next;
    else if (arg === '--environment') args.environment = next;
    else if (arg === '--output') args.output = next;
  }
  return args;
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
      'usage: bench-aggregate-median.mjs --input-dir <dir> [--phase <str>] [--environment <str>] [--output <path>]',
    );
    process.exit(2);
  }
  const reports = readJsonFiles(args.inputDir);
  if (reports.length < 3) {
    console.error(`[bench-aggregate-median] 최소 3 샘플 필요 — 실제 ${reports.length}개`);
    process.exit(1);
  }
  const collected = collectFps(reports);
  const baseline = buildBaseline(collected, {
    phase: args.phase,
    environment: args.environment,
    firstReport: reports[0].data,
  });
  const json = JSON.stringify(baseline, null, 2) + '\n';
  if (args.output) {
    writeFileSync(args.output, json);
    console.log(`[bench-aggregate-median] ${args.output} (source_count=${reports.length})`);
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
