#!/usr/bin/env node
/**
 * #448 — Option D + G8a 가드 부수 비용 측정 (저사양 기기 프로파일링).
 *
 * 배경: ADR `docs/decisions/20260509-380-zoom-camera-freeze-forensic.md` Amendment 2026-05-11
 * cross-validate 고유 발견 F5. Gemini 권고:
 *
 *   > 제안된 수정(in-flight 플래그 체크, onAfterRender 콜백 등)이 저사양 기기에서 눈에 띄는
 *   > 성능 저하를 일으키지 않는지 간단한 프로파일링을 통해 확인하는 단계를 구현 계획에 포함.
 *
 * 측정 시나리오 — 4개 가드 발화:
 *   1. focus 진입 (Option D in-flight 플래그 + onAfterRender 콜백 + lowerRadiusLimit 양방향)
 *   2. wheel zoom 5회 (tier transition 트리거 → G8a detachControl)
 *   3. tier 전환 도중 wheel/touchstart 시도 (가드 4개 모두 발화 윈도우)
 *
 * 저사양 시뮬레이션: CDP `Emulation.setCPUThrottlingRate` 4x slowdown (Gemini 권고).
 *
 * 임계값 (절대 PASS):
 *   - 평균 fps ≥ 24 (24fps 영화 수준 — 모바일 저사양 허용선)
 *   - p95 frame time ≤ 60ms (1/16.6fps — 부드러움 하한)
 *
 * 사용:
 *   node scripts/bench-tier-guard-cost.mjs [baseUrl]
 *   BENCH_SAMPLE_MS=10000 node scripts/bench-tier-guard-cost.mjs
 *   BENCH_CPU_SLOWDOWN=6 node scripts/bench-tier-guard-cost.mjs  # 6x 더 엄격
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pressTimePlay, withBrowser } from './browser-verify-utils.mjs';

const baseUrl = process.argv[2] ?? 'http://localhost:3001';
const SAMPLE_MS = Number(process.env.BENCH_SAMPLE_MS ?? 5_000);
const CPU_SLOWDOWN = Number(process.env.BENCH_CPU_SLOWDOWN ?? 4);
const FPS_THRESHOLD = Number(process.env.BENCH_FPS_THRESHOLD ?? 24);
const P95_FRAME_MS_THRESHOLD = Number(process.env.BENCH_P95_FRAME_MS ?? 60);

const __dirname = dirname(fileURLToPath(import.meta.url));
// #905 — 타임스탬프 리포트는 gitignored `.bench-out/` 에 기록 (커밋 경로 오염 방지)
const benchDir = join(__dirname, '..', '.bench-out');
mkdirSync(benchDir, { recursive: true });

// #933 — 에러 경로(goto 실패 / CDP throw)에서도 close 도달 보장 (#927 헬퍼 재사용).
//   launch 인자는 원본 그대로 전달 (vsync 해제 플래그가 측정값을 좌우 — 무변경 보존).
//   임계값 검증·리포트 write 는 브라우저 종료 뒤 수행하므로 콜백은 측정 결과만 반환한다.
const scenarios = await withBrowser(
  {
    args: ['--disable-frame-rate-limit', '--disable-gpu-vsync'],
  },
  async (browser) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    // #448 — CDP CPU throttling (Gemini 권고 F5). headless Chromium 기본 호스트 CPU full 사용
    // → 저사양 시뮬레이션 안 됨. setCPUThrottlingRate 로 명시 slowdown.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });

    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    /**
     * fps + frame time 분포 측정.
     * @param {number} durationMs
     * @returns {Promise<{ fps: number, frames: number, p50FrameMs: number, p95FrameMs: number, maxFrameMs: number }>}
     */
    const measureFrameStats = (durationMs) =>
      page.evaluate(
        (d) =>
          new Promise((resolve) => {
            const frameTimes = [];
            let last = performance.now();
            const start = last;
            const loop = () => {
              const now = performance.now();
              frameTimes.push(now - last);
              last = now;
              if (now - start < d) requestAnimationFrame(loop);
              else {
                const sorted = [...frameTimes].sort((a, b) => a - b);
                const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
                const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
                const maxF = sorted[sorted.length - 1] ?? 0;
                resolve({
                  fps: (frameTimes.length * 1000) / (performance.now() - start),
                  frames: frameTimes.length,
                  p50FrameMs: p50,
                  p95FrameMs: p95,
                  maxFrameMs: maxF,
                });
              }
            };
            requestAnimationFrame(loop);
          }),
        durationMs,
      );

    const collected = [];

    // === Scenario 1 — idle baseline (가드 미발화, throttling 영향만) ===
    await page.click('[data-testid="time-pause"]').catch(() => {});
    await page.waitForTimeout(500);
    {
      const stat = await measureFrameStats(SAMPLE_MS);
      collected.push({ name: 'idle-throttled', ...roundStat(stat) });
    }

    // === Scenario 2 — focus mercury (Option D in-flight 플래그 + onAfterRender 발화) ===
    await pressTimePlay(page, { skipIfAbsent: true });
    await page.click('[data-testid="focus-mercury"]').catch(() => {});
    await page.waitForTimeout(800);
    {
      const stat = await measureFrameStats(SAMPLE_MS);
      collected.push({ name: 'focus-mercury-throttled', ...roundStat(stat) });
    }

    // === Scenario 3 — wheel zoom 반복 (G8a detachControl/attachControl 반복 발화) ===
    // 5초 동안 800ms 마다 wheel zoom (총 6회) — tier transition 가드 4개 반복 발화.
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, i % 2 === 0 ? -400 : 400);
      await page.waitForTimeout(800);
    }
    await page.waitForTimeout(300);
    {
      // 별도 측정 5초 (zoom 반복 이후 즉시) — 가드 발화 직후 안정 fps 측정
      const stat = await measureFrameStats(SAMPLE_MS);
      collected.push({ name: 'post-zoom-cycles-throttled', ...roundStat(stat) });
    }

    // === Scenario 4 — focus 해제 (Option D 가드 cleanup + clearFocus) ===
    await page.click('[data-testid="focus-reset"]').catch(() => {});
    await page.waitForTimeout(800);
    {
      const stat = await measureFrameStats(SAMPLE_MS);
      collected.push({ name: 'post-reset-throttled', ...roundStat(stat) });
    }

    return collected;
  },
);

function roundStat(s) {
  return {
    fps: Number(s.fps.toFixed(2)),
    frames: s.frames,
    p50FrameMs: Number(s.p50FrameMs.toFixed(2)),
    p95FrameMs: Number(s.p95FrameMs.toFixed(2)),
    maxFrameMs: Number(s.maxFrameMs.toFixed(2)),
  };
}

// === 결과 분석 + 임계값 검증 ===
const fail = [];
for (const s of scenarios) {
  if (s.fps < FPS_THRESHOLD) {
    fail.push(`✗ ${s.name}: fps ${s.fps} < ${FPS_THRESHOLD}`);
  }
  if (s.p95FrameMs > P95_FRAME_MS_THRESHOLD) {
    fail.push(`✗ ${s.name}: p95 ${s.p95FrameMs}ms > ${P95_FRAME_MS_THRESHOLD}ms`);
  }
}

const timestamp = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
const reportPath = join(benchDir, `${timestamp}-tier-guard-cost.json`);
const report = {
  timestamp: new Date().toISOString(),
  environment: 'playwright-chromium-headless',
  cpuSlowdown: CPU_SLOWDOWN,
  sampleMs: SAMPLE_MS,
  thresholds: { fpsMin: FPS_THRESHOLD, p95FrameMsMax: P95_FRAME_MS_THRESHOLD },
  scenarios,
  passed: fail.length === 0,
  failures: fail,
};
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(`\n=== #448 Option D + G8a 가드 부수 비용 (CPU ${CPU_SLOWDOWN}x slowdown) ===`);
for (const s of scenarios) {
  console.log(
    `  ${s.name}: fps=${s.fps} (frames=${s.frames}, p50=${s.p50FrameMs}ms, p95=${s.p95FrameMs}ms, max=${s.maxFrameMs}ms)`,
  );
}
console.log(`\n임계값: fps ≥ ${FPS_THRESHOLD} / p95 ≤ ${P95_FRAME_MS_THRESHOLD}ms`);
console.log(`리포트: ${reportPath}`);

if (fail.length > 0) {
  console.error(`\n✗ FAIL (${fail.length}):`);
  for (const f of fail) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`\n✓ PASS — Option D + G8a 가드 부수 비용 임계값 이내`);
