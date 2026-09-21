#!/usr/bin/env node
/**
 * #846 — browser-verify-utils.mjs 공용 헬퍼 회귀 가드.
 *
 * stand-alone node 테스트 (`bench-aggregate-median.test.mjs` / `check-duplicate-functions.test.mjs`
 * 선례 계승 — 루트 `scripts/` 는 vitest workspace 에 포함되지 않으므로 워크플로가 직접 실행한다).
 *
 * 브라우저를 띄우지 않는다: `launchBrowser` 는 `playwright` 를 동적 import 하고, 옵션 조립은
 * 순수 함수 `buildLaunchOptions` 로 분리돼 있어 인자 계약을 바이너리 없이 검증할 수 있다.
 * `collectConsoleErrors` / `bootstrapScene` 은 Playwright Page 의 최소 계약만 흉내내는
 * 스텁으로 검증한다 (SUT 미import 원칙 — #849 `babylon-mocks` 선례).
 *
 * 실행: node scripts/browser-verify-utils.test.mjs
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DEFAULT_BASE_URL,
  DEFAULT_BOOTSTRAP_QUERY,
  DOM_OVERLAY_HIDE_CSS,
  DOM_OVERLAY_POST_HIDE_WAIT_MS,
  GPU_LAUNCH_ARGS,
  TIME_PLAYBACK_MODES,
  bootstrapScene,
  clickTestId,
  hideDomOverlays,
  buildLaunchOptions,
  collectConsoleErrors,
  pressTimePlay,
  resolveBaseUrl,
  saveCapture,
  setTimePlayback,
  waitForLodSettle,
  withBrowser,
} from './browser-verify-utils.mjs';

let passed = 0;
const run = async (name, fn) => {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed += 1;
  } catch (e) {
    console.error(`  ✗ ${name}\n    ${e.message}`);
    process.exitCode = 1;
  }
};

/**
 * Playwright Page 의 이벤트 계약만 흉내내는 스텁.
 *
 * @param options.bootPhases `window.__bootPhases` 로 보일 값 (#1234 C2-H3). 미지정 시 전역 부재
 *   = prod 번들 / 계측 이전 페이지와 같은 상황.
 * @param options.evaluateError 지정 시 `page.evaluate` 가 항상 이 에러로 실패 — 진단 probe 가
 *   깨져도 **판정이 불변**임을 재기 위한 축 (#1234 계약 C5).
 */
function stubPage({ bootPhases, evaluateError } = {}) {
  const handlers = new Map();
  return {
    gotoCalls: [],
    waitForFunctionCalls: [],
    waitForTimeoutCalls: [],
    on(event, handler) {
      handlers.set(event, handler);
    },
    emit(event, payload) {
      const handler = handlers.get(event);
      if (!handler) throw new Error(`핸들러 미등록: ${event}`);
      handler(payload);
    },
    hasHandler: (event) => handlers.has(event),
    async goto(url, opts) {
      this.gotoCalls.push({ url, opts });
    },
    async waitForFunction(fn, arg, opts) {
      this.waitForFunctionCalls.push({ fn, arg, opts });
    },
    async waitForTimeout(ms) {
      this.waitForTimeoutCalls.push(ms);
    },
    /**
     * 콜백을 **브라우저 전역 스텁 위에서** 실행한다 (#1234 C2-H3).
     *
     * 진단 probe 가 실제로 읽는 것 (`document.readyState` / `location.href` /
     * `window.__bootPhases` / `performance.now`) 만 세운다. 이 스텁이 없으면 probe 가 전부
     * `…Error` 로 떨어져 **「진단이 동작한 것」과 「진단이 비어 있는 것」이 구분되지 않는다.**
     */
    async evaluate(fn) {
      if (evaluateError) throw evaluateError;
      const keys = ['window', 'document', 'location'];
      const had = Object.fromEntries(
        keys.map((k) => [k, Object.prototype.hasOwnProperty.call(globalThis, k)]),
      );
      const prev = Object.fromEntries(keys.map((k) => [k, globalThis[k]]));
      globalThis.window = bootPhases === undefined ? {} : { __bootPhases: bootPhases };
      globalThis.document = { readyState: 'complete' };
      globalThis.location = { href: 'http://x/' };
      try {
        return await fn();
      } finally {
        for (const k of keys) {
          if (had[k]) globalThis[k] = prev[k];
          else delete globalThis[k];
        }
      }
    },
  };
}

const consoleMsg = (type, text) => ({ type: () => type, text: () => text });

/** Playwright Browser 의 `close` 계약만 흉내내는 스텁 (#927). */
function stubBrowser({ closeError } = {}) {
  return {
    closeCount: 0,
    async close() {
      this.closeCount += 1;
      if (closeError) throw closeError;
    },
  };
}

/** `withBrowser` 의 launcher 주입 인자 — 호출 옵션을 기록한다. */
function launchStub(browser) {
  const calls = [];
  return {
    calls,
    launch: async (launchOptions) => {
      calls.push(launchOptions);
      return browser;
    },
  };
}

/**
 * `console.log` 을 가로채 배열로 수집 (#1234 — `bootstrapScene` 이 `[boot]` 계측 2줄을 찍는다).
 *
 * `captureWarnings` 와 같은 이유: 테스트 러너 출력 오염 방지 + 찍힌 내용 자체를 단언 대상으로 삼기.
 */
async function captureLogs(fn) {
  const original = console.log;
  const lines = [];
  console.log = (msg) => lines.push(String(msg));
  try {
    await fn();
  } finally {
    console.log = original;
  }
  return lines;
}

/** `console.warn` 을 가로채 배열로 수집 (테스트 출력 오염 방지). */
async function captureWarnings(fn) {
  const original = console.warn;
  const warnings = [];
  console.warn = (msg) => warnings.push(String(msg));
  try {
    await fn();
  } finally {
    console.warn = original;
  }
  return warnings;
}

console.log('\n=== #846 browser-verify-utils 공용 헬퍼 ===\n');

// --- resolveBaseUrl -------------------------------------------------------
await run('resolveBaseUrl — BASE_URL 미설정 시 기본값', () => {
  assert.equal(resolveBaseUrl(undefined, {}), DEFAULT_BASE_URL);
});

await run('resolveBaseUrl — BASE_URL 우선', () => {
  assert.equal(
    resolveBaseUrl(undefined, { BASE_URL: 'http://localhost:3002' }),
    'http://localhost:3002',
  );
});

await run('resolveBaseUrl — 빈 문자열은 미설정 취급', () => {
  assert.equal(resolveBaseUrl('http://fallback:1', { BASE_URL: '' }), 'http://fallback:1');
});

await run('resolveBaseUrl — 후행 슬래시 제거 (`//?gpu=a` 이중 슬래시 차단)', () => {
  assert.equal(
    resolveBaseUrl(undefined, { BASE_URL: 'http://localhost:3002/' }),
    'http://localhost:3002',
  );
  assert.equal(
    resolveBaseUrl(undefined, { BASE_URL: 'http://localhost:3002///' }),
    'http://localhost:3002',
  );
  // 경로 세그먼트는 보존 — BASE_URL 에 경로가 포함될 수 있는 일반 계약.
  // (#908 이전에는 ci.yml #402 가드가 `BASE_URL=.../ko` 를 썼던 이력)
  assert.equal(
    resolveBaseUrl(undefined, { BASE_URL: 'http://localhost:3002/base' }),
    'http://localhost:3002/base',
  );
});

// --- buildLaunchOptions ---------------------------------------------------
await run('buildLaunchOptions — 기본은 headless + 인자 없음', () => {
  assert.deepEqual(buildLaunchOptions({ env: {} }), { headless: true });
});

await run('buildLaunchOptions — gpu 축이 GPU_LAUNCH_ARGS SSoT 와 일치', () => {
  assert.deepEqual(buildLaunchOptions({ env: {}, gpu: 'swiftshader' }), {
    headless: true,
    args: ['--use-angle=swiftshader'],
  });
  assert.deepEqual(buildLaunchOptions({ env: {}, gpu: 'metal' }), {
    headless: true,
    args: ['--use-angle=metal'],
  });
  assert.deepEqual(GPU_LAUNCH_ARGS.default, []);
});

await run('buildLaunchOptions — 미지의 gpu 축은 fail-fast (조용한 default 흡수 차단)', () => {
  assert.throws(() => buildLaunchOptions({ env: {}, gpu: 'vulkan' }), /알 수 없는 gpu 축/);
  // 오타가 default 로 흡수되면 픽셀 가드가 다른 백엔드로 측정하고도 PASS 한다.
  assert.throws(() => buildLaunchOptions({ env: {}, gpu: 'swiftshadre' }), /알 수 없는 gpu 축/);
});

await run('buildLaunchOptions — BROWSER_VERIFY_GPU 환경변수 반영', () => {
  assert.deepEqual(buildLaunchOptions({ env: { BROWSER_VERIFY_GPU: 'swiftshader' } }), {
    headless: true,
    args: ['--use-angle=swiftshader'],
  });
});

await run('buildLaunchOptions — HEADFUL/HEADED 는 실 Chrome 채널로', () => {
  assert.deepEqual(buildLaunchOptions({ env: { HEADFUL: '1' } }), {
    headless: false,
    channel: 'chrome',
  });
  assert.deepEqual(buildLaunchOptions({ env: { HEADED: 'true' } }), {
    headless: false,
    channel: 'chrome',
  });
});

await run('buildLaunchOptions — 0/false/빈값은 headful 아님', () => {
  for (const value of ['0', 'false', 'FALSE', '']) {
    assert.equal(
      buildLaunchOptions({ env: { HEADFUL: value } }).headless,
      true,
      `HEADFUL=${value}`,
    );
  }
});

await run('buildLaunchOptions — channel:null 이면 번들 chromium 유지', () => {
  assert.deepEqual(buildLaunchOptions({ env: { HEADFUL: '1' }, channel: null }), {
    headless: false,
  });
});

await run('buildLaunchOptions — 추가 args 는 gpu 인자 뒤에 이어붙임', () => {
  assert.deepEqual(buildLaunchOptions({ env: {}, gpu: 'metal', args: ['--mute-audio'] }).args, [
    '--use-angle=metal',
    '--mute-audio',
  ]);
});

// --- withBrowser ----------------------------------------------------------
// #927 — 에러 경로 close 도달 보장. 실 브라우저 없이 `launch` 주입으로 계약만 검증한다.
await run('withBrowser — 정상 경로: fn 반환값 그대로 + close 1회', async () => {
  const browser = stubBrowser();
  const captured = [];
  const value = await withBrowser(
    { headless: true },
    async (b) => {
      captured.push(b);
      return 'ok';
    },
    launchStub(browser),
  );
  assert.equal(value, 'ok');
  assert.equal(captured[0], browser, 'fn 은 launch 된 browser 를 받아야 한다');
  assert.equal(browser.closeCount, 1);
});

await run('withBrowser — fn throw 여도 close 도달 (본 헬퍼의 존재 이유)', async () => {
  const browser = stubBrowser();
  await assert.rejects(
    withBrowser(
      {},
      async () => {
        throw new Error('page.goto 실패');
      },
      launchStub(browser),
    ),
    /page\.goto 실패/,
  );
  // try/finally 없던 구세대 스크립트는 여기서 close 에 도달하지 못했다.
  assert.equal(browser.closeCount, 1, '에러 경로에서 close 미도달');
});

await run('withBrowser — launch 옵션을 가공 없이 그대로 전달', async () => {
  const browser = stubBrowser();
  const stub = launchStub(browser);
  // ⚠️ 픽스처 선정 계약 (PR #931 리뷰 뮤테이션 M3): `{ headless, args }` 만 쓰면
  // 기본 env 하에서 buildLaunchOptions 의 **고정점**이라 경유 여부를 판별하지 못한다
  // (구현을 buildLaunchOptions 경유로 바꿔도 초록 = assertion 진공).
  // `gpu` 키는 buildLaunchOptions 가 소비·변환하므로 경유 시 deepEqual 이 깨진다 — 판별 가능.
  const opts = { headless: true, args: ['--use-angle=metal'], gpu: 'swiftshader' };
  await withBrowser(opts, async () => {}, stub);
  // buildLaunchOptions 를 경유하지 않는다 — 기존 스크립트 launch 인자 보존이 전환의 전제.
  assert.deepEqual(stub.calls[0], opts);
});

await run('withBrowser — close 실패 시 원 에러 보존 (close 에러가 덮지 않음)', async () => {
  const browser = stubBrowser({ closeError: new Error('close 실패') });
  const warnings = await captureWarnings(async () => {
    await assert.rejects(
      withBrowser(
        {},
        async () => {
          throw new Error('진짜 원인');
        },
        launchStub(browser),
      ),
      /진짜 원인/,
    );
  });
  assert.equal(warnings.length, 1, 'close 실패는 경고로 노출돼야 한다 (조용한 삼킴 금지)');
  assert.match(warnings[0], /close\(\) 실패/);
});

await run('withBrowser — fn 성공 + close 실패면 close 에러를 노출', async () => {
  const browser = stubBrowser({ closeError: new Error('close 실패') });
  await assert.rejects(
    withBrowser({}, async () => 'ok', launchStub(browser)),
    /close 실패/,
  );
});

// --- collectConsoleErrors -------------------------------------------------
await run('collectConsoleErrors — console.error + pageerror 두 채널 모두 등록', () => {
  const page = stubPage();
  collectConsoleErrors(page);
  assert.ok(page.hasHandler('console'), 'console 리스너 미등록');
  // 인라인 복붙본 상당수가 빠뜨렸던 채널 — 미포착 예외 유실 회귀 차단.
  assert.ok(page.hasHandler('pageerror'), 'pageerror 리스너 미등록');
});

await run('collectConsoleErrors — error 만 담고 log/warning 은 무시', () => {
  const page = stubPage();
  const errors = collectConsoleErrors(page);
  page.emit('console', consoleMsg('log', '무시'));
  page.emit('console', consoleMsg('warning', '무시'));
  page.emit('console', consoleMsg('error', 'boom'));
  page.emit('pageerror', new Error('uncaught'));
  assert.deepEqual(errors, ['boom', 'pageerror: uncaught']);
});

await run('collectConsoleErrors — warnings 배열 주입 시 warning 도 수집', () => {
  const page = stubPage();
  const warnings = [];
  const errors = collectConsoleErrors(page, { warnings });
  page.emit('console', consoleMsg('warning', 'deprecated'));
  page.emit('console', consoleMsg('error', 'boom'));
  assert.deepEqual(warnings, ['deprecated']);
  assert.deepEqual(errors, ['boom']);
});

await run('collectConsoleErrors — errors 배열 주입 시 이어담기', () => {
  const page = stubPage();
  const seed = ['기존'];
  const errors = collectConsoleErrors(page, { errors: seed });
  page.emit('console', consoleMsg('error', 'boom'));
  assert.equal(errors, seed, '동일 배열 참조여야 라이브 수집이 성립');
  assert.deepEqual(seed, ['기존', 'boom']);
});

// --- bootstrapScene -------------------------------------------------------
await run('bootstrapScene — baseUrl + 기본 쿼리로 이동', async () => {
  const page = stubPage();
  let url;
  await captureLogs(async () => {
    url = await bootstrapScene(page, { baseUrl: 'http://localhost:3002' });
  });
  assert.equal(url, `http://localhost:3002${DEFAULT_BOOTSTRAP_QUERY}`);
  assert.equal(page.gotoCalls[0].url, url);
  assert.equal(page.gotoCalls[0].opts.waitUntil, 'networkidle');
});

await run('bootstrapScene — handles 전부 노출돼야 통과하는 술어', async () => {
  const page = stubPage();
  await captureLogs(() =>
    bootstrapScene(page, {
      baseUrl: 'http://x',
      handles: ['__solarScene', '__simStore'],
    }),
  );
  const { fn, arg } = page.waitForFunctionCalls[0];
  assert.deepEqual(arg, ['__solarScene', '__simStore']);
  // 술어를 브라우저 대신 여기서 실제로 실행 — "하나라도 빠지면 false" 계약 검증.
  // 술어는 `window[name]` 을 읽으므로 최소 window 스텁을 세운다 (jsdom 불요).
  const hadWindow = 'window' in globalThis;
  globalThis.window = {};
  try {
    assert.equal(fn(arg), false, '전역 0개인데 통과');
    globalThis.window.__solarScene = {};
    assert.equal(fn(arg), false, '__simStore 미노출인데 통과');
    globalThis.window.__simStore = {};
    assert.equal(fn(arg), true, '둘 다 노출인데 미통과');
  } finally {
    if (!hadWindow) delete globalThis.window;
  }
});

await run('bootstrapScene — settleMs 0 이면 waitForTimeout 미호출', async () => {
  const page = stubPage();
  await captureLogs(() => bootstrapScene(page, { baseUrl: 'http://x' }));
  assert.deepEqual(page.waitForTimeoutCalls, []);
});

await run('bootstrapScene — settleMs 지정 시 안정화 대기', async () => {
  const page = stubPage();
  await captureLogs(() => bootstrapScene(page, { baseUrl: 'http://x', settleMs: 2500 }));
  assert.deepEqual(page.waitForTimeoutCalls, [2500]);
});

// --- bootstrapScene 계측 (#1234 C1) ---------------------------------------
// 계측은 **진단 전용**이다. 아래 3 케이스가 닫는 것: (1) 두 줄 규약과 JSON 파싱 가능성,
// (2) 예외 경로에서 원 에러가 그대로 전파되는가 (판정 무변경), (3) 셀 수 없는 축을 `0` 으로
// 지어내지 않는가. (3) 을 빼면 「ctx 0 / page 0」 이 관측값처럼 보여 다음 단계가 거짓 분포를 읽는다.

/** `[boot] {…}` JSON 줄만 골라 파싱. */
const bootJsonLines = (lines) =>
  lines.filter((l) => l.startsWith('[boot] {')).map((l) => JSON.parse(l.slice('[boot] '.length)));

await run('bootstrapScene 계측 — 요약 1줄 + 파싱 가능한 JSON 1줄', async () => {
  const page = stubPage();
  const lines = await captureLogs(() =>
    bootstrapScene(page, { baseUrl: 'http://x', label: 'P1b', handles: ['__solarScene'] }),
  );
  const bootLines = lines.filter((l) => l.startsWith('[boot] '));
  assert.equal(bootLines.length, 2, `[boot] 줄이 2개여야 한다 (실제 ${bootLines.length})`);
  const [summary] = bootLines;
  assert.ok(!summary.startsWith('[boot] {'), '첫 줄은 사람이 읽는 요약이어야 한다');
  assert.match(summary, /P1b/, '요약에 라벨이 없다');

  const [rec] = bootJsonLines(lines);
  assert.equal(rec.label, 'P1b');
  assert.equal(rec.ok, true);
  assert.equal(rec.failedPhase, null);
  assert.equal(rec.url, `http://x${DEFAULT_BOOTSTRAP_QUERY}`);
  assert.ok(typeof rec.seq === 'number' && rec.seq > 0, 'seq 미기록');
  assert.ok(typeof rec.gotoMs === 'number', 'gotoMs 미기록');
  assert.ok(typeof rec.handlesMs === 'number', 'handlesMs 미기록');
  assert.ok(typeof rec.totalMs === 'number', 'totalMs 미기록');
  assert.ok(typeof rec.processUptimeS === 'number', 'processUptimeS 미기록');
});

await run('bootstrapScene 계측 — 핸들 대기 실패 시 원 에러 전파 + 실패 단계 기록', async () => {
  const page = stubPage();
  const boom = new Error('Timeout 20000ms exceeded.');
  boom.name = 'TimeoutError';
  page.waitForFunction = async () => {
    throw boom;
  };
  let caught = null;
  const lines = await captureLogs(async () => {
    try {
      // 실패 경로는 dev server probe 를 돈다 — 즉시 connection refused 가 나는 주소를 쓴다
      // (DNS 조회가 걸리는 호스트를 쓰면 테스트가 네트워크 상태에 종속된다).
      await bootstrapScene(page, { baseUrl: 'http://127.0.0.1:1', label: 'P1' });
    } catch (e) {
      caught = e;
    }
  });
  // 계측이 예외를 삼키거나 감싸면 호출부의 실패 경로가 바뀐다 — 동일 객체여야 한다.
  assert.equal(caught, boom, '원 에러가 그대로 전파되지 않았다');

  const [rec] = bootJsonLines(lines);
  assert.equal(rec.ok, false);
  assert.equal(rec.failedPhase, 'handles');
  assert.match(rec.error, /TimeoutError/);
  // 완주 소요 필드는 완주한 구간만 채운다 — 실패 구간에 타임아웃 상수가 섞이면 분포가 오염된다.
  assert.equal(rec.handlesMs, null, '완주하지 못한 구간이 완주 소요로 기록됐다');
  assert.ok(typeof rec.failedPhaseMs === 'number', '실패 구간 소비 시간이 유실됐다');
  assert.ok(typeof rec.gotoMs === 'number', '앞 구간(goto) 소요는 남아야 한다');
  assert.deepEqual(
    rec.consoleErrors,
    [],
    '실패 시 콘솔 에러 수집본이 있어야 한다 (0건이면 빈 배열)',
  );
  assert.ok(rec.state !== null, '실패 시 페이지 상태 probe 결과가 있어야 한다');
  // 「서버가 느린가 / 페이지가 멈췄나」를 가르는 축 — 실패 경로에서 비어 있으면 안 된다.
  assert.ok(typeof rec.server?.ms === 'number', '실패 시 dev server probe 결과가 없다');
});

await run('bootstrapScene 계측 — page 계수 불가 시 0 이 아니라 null', async () => {
  // 스텁에는 `context()` 가 없다 = 「셀 수 없음」. 이 케이스가 `0` 으로 기록되면
  // 「열린 페이지 0개」 라는 관측값과 구분되지 않는다.
  const page = stubPage();
  const lines = await captureLogs(() => bootstrapScene(page, { baseUrl: 'http://x' }));
  const [rec] = bootJsonLines(lines);
  assert.equal(rec.pages, null);
  assert.equal(rec.contexts, null);
  assert.ok(
    typeof rec.countError === 'string' && rec.countError.length > 0,
    '계수 실패 사유 미기록',
  );
});

// --- bootstrapScene 단계 계측 (#1234 C2-H3) --------------------------------
// C1 이 좁힌 곳은 「`__simCore` 는 있고 `__solarScene` 만 없다」 까지였다. 그 안쪽을 가르는 것이
// `window.__bootPhases` 이고, 아래 3 케이스가 닫는 것: (1) 성공 표본에도 실린다 (실패만 있으면
// 기준선이 없다), (2) 실패 표본에서 **멈춘 지점**이 남는다, (3) probe 가 깨져도 **판정은 불변**.

/** 계측 전역 스냅샷 모양 (apps/web `boot-phases.ts` readBootPhases 반환과 동형). */
const stubBootPhases = {
  phases: [
    { name: 'web:effect-start', chain: 'm1', atMs: 400, deltaMs: 400 },
    { name: 'engine:webgl2-ctor', chain: 'm1', atMs: 1900, deltaMs: 1500 },
    { name: 'scene:body-meshes', chain: 'm1', atMs: 2100, deltaMs: 200 },
  ],
  dropped: 0,
  nowMs: 2200,
};

await run('bootstrapScene 계측 — 성공 표본에도 단계 분포가 실린다', async () => {
  const page = stubPage({ bootPhases: stubBootPhases });
  const lines = await captureLogs(() => bootstrapScene(page, { baseUrl: 'http://x' }));
  const [rec] = bootJsonLines(lines);
  assert.deepEqual(
    rec.bootPhases?.phases?.map((p) => p.name),
    ['web:effect-start', 'engine:webgl2-ctor', 'scene:body-meshes'],
  );
  // 이 비용은 totalMs 에 포함되므로 C1 표본과 대조하려면 뺄 수 있어야 한다.
  assert.ok(typeof rec.phasesProbeMs === 'number', 'phasesProbeMs 미기록');
  // 요약 줄은 「가장 오래 걸린 구간」을 먼저 보여야 한다 — 로그를 훑는 사람의 첫 물음이다.
  const [summary] = lines.filter((l) => l.startsWith('[boot] '));
  assert.match(summary, /engine:webgl2-ctor\(m1\) 1500ms/, '요약에 최장 구간이 없다');
});

await run('bootstrapScene 계측 — 실패 표본에 멈춘 지점이 남는다', async () => {
  const page = stubPage({ bootPhases: stubBootPhases });
  const boom = new Error('Timeout 20000ms exceeded.');
  boom.name = 'TimeoutError';
  page.waitForFunction = async () => {
    throw boom;
  };
  const lines = await captureLogs(async () => {
    await bootstrapScene(page, { baseUrl: 'http://127.0.0.1:1' }).catch(() => {});
  });
  const [rec] = bootJsonLines(lines);
  assert.equal(rec.ok, false);
  assert.equal(
    rec.bootPhases?.phases?.at(-1)?.name,
    'scene:body-meshes',
    '실패 시 마지막 구간이 없으면 「어디까지 갔나」를 못 읽는다',
  );
  // state 와 같이 읽히는 축 — 한쪽만 남으면 「구축 내부」까지만 좁히고 멈춘 C1 상태로 되돌아간다.
  assert.equal(rec.state?.solarScene, 'undefined');
});

await run('bootstrapScene 계측 — 단계 probe 가 깨져도 판정 불변', async () => {
  // 진단이 판정을 바꾸는 것이 최악이다 (계측 PR 이 가드를 흔들면 측정 자체가 무효).
  const page = stubPage({ evaluateError: new Error('Execution context was destroyed') });
  let url;
  const lines = await captureLogs(async () => {
    url = await bootstrapScene(page, { baseUrl: 'http://x' });
  });
  assert.equal(url, `http://x${DEFAULT_BOOTSTRAP_QUERY}`, 'probe 실패가 성공 경로를 바꿨다');
  const [rec] = bootJsonLines(lines);
  assert.equal(rec.ok, true);
  assert.ok(
    typeof rec.bootPhases?.phasesError === 'string',
    'probe 실패 사유가 조용히 사라졌다 (null 과 구분 불가)',
  );
});

// --- saveCapture ----------------------------------------------------------
await run('saveCapture — 상위 디렉토리 자동 생성 후 저장', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'browser-verify-utils-'));
  try {
    const target = join(dir, 'nested', 'deep', 'shot.png');
    const returned = await saveCapture(Buffer.from([1, 2, 3]), target);
    assert.equal(returned, target);
    assert.deepEqual([...(await readFile(target))], [1, 2, 3]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- waitForLodSettle (#1205) ---------------------------------------------
/**
 * `getLodStats()` 표본 시퀀스를 대본대로 돌려주는 Page 스텁.
 * 대본이 소진되면 마지막 표본을 계속 반환한다 (정착 상태 유지).
 */
function stubLodPage(script) {
  let i = 0;
  return {
    polls: [],
    async waitForTimeout(ms) {
      this.polls.push(ms);
      await new Promise((r) => setTimeout(r, ms));
    },
    async evaluate() {
      const cur = script[Math.min(i, script.length - 1)];
      i += 1;
      return cur;
    },
  };
}

await run('waitForLodSettle — 분포 동일 + fading 0 이 연속 N 회면 정착', async () => {
  const page = stubLodPage([
    { dist: '9/6/17', fading: 0 },
    { dist: '9/6/17', fading: 0 },
    { dist: '9/6/17', fading: 0 },
    { dist: '9/6/17', fading: 0 },
  ]);
  const r = await waitForLodSettle(page, { pollMs: 1, stableSamples: 3, timeoutMs: 5000 });
  assert.equal(r.timedOut, false);
  assert.equal(r.dist, '9/6/17');
  assert.equal(r.fading, 0);
});

await run(
  'waitForLodSettle — fading=0 인 채 분포만 움직이는 구간을 정착으로 읽지 않는다',
  async () => {
    // ⚠️ 이 다리가 이 헬퍼가 `waitForFunction(fading === 0)` 보다 나은 **유일한 술어상 이유**다.
    // `runLodPass` 는 `prevLevel === undefined` (그 body 최초 레벨 결정) 일 때 `lodFadeState` 에
    // 등록하지 않으므로, **분포는 바뀌는데 `fading` 은 계속 0** 인 구간이 실재한다.
    // `fading` 만 보는 술어는 아래 3번째 표본에서 이미 정착으로 판정한다 (polls = 3).
    const page = stubLodPage([
      { dist: '3/2/27', fading: 0 },
      { dist: '5/4/23', fading: 0 },
      { dist: '9/6/17', fading: 0 },
      { dist: '9/6/17', fading: 0 },
      { dist: '9/6/17', fading: 0 },
      { dist: '9/6/17', fading: 0 },
    ]);
    const r = await waitForLodSettle(page, { pollMs: 1, stableSamples: 3, timeoutMs: 5000 });
    assert.equal(r.timedOut, false);
    assert.equal(r.dist, '9/6/17');
    // 분포 축을 빼면 3 표본에서 반환한다 — 표본 수가 판별량이다 (반환 dist 는 양쪽 같다).
    assert.equal(page.polls.length, 6, `polls=${page.polls.length}`);
  },
);

await run('waitForLodSettle — fade 진행 표본이 끼면 연속 계수가 리셋된다', async () => {
  const page = stubLodPage([
    { dist: '9/6/17', fading: 11 },
    { dist: '9/6/17', fading: 4 },
    { dist: '9/6/17', fading: 0 },
    { dist: '9/6/17', fading: 0 },
    { dist: '9/6/17', fading: 0 },
    { dist: '9/6/17', fading: 0 },
  ]);
  const r = await waitForLodSettle(page, { pollMs: 1, stableSamples: 3, timeoutMs: 5000 });
  assert.equal(r.timedOut, false);
  assert.equal(r.fading, 0);
  // fade 중 표본(f=4)을 정착으로 세면 4 표본에서 반환한다 — 표본 수가 판별량이다.
  assert.equal(page.polls.length, 5, `polls=${page.polls.length}`);
});

await run('waitForLodSettle — fade 가 계속 진행 중이면 정착으로 판정하지 않는다', async () => {
  const page = stubLodPage([{ dist: '9/6/17', fading: 2 }]);
  const r = await waitForLodSettle(page, { pollMs: 2, stableSamples: 3, timeoutMs: 60 });
  assert.equal(r.timedOut, true);
  assert.equal(r.fading, 2);
});

await run('waitForLodSettle — 상한 초과 시 throw 하지 않고 timedOut 으로 반환', async () => {
  // 분포가 매 표본 바뀌는 病적 케이스 — 호출부가 캡처 진행 여부를 판단할 수 있어야 한다.
  let n = 0;
  const page = {
    async waitForTimeout(ms) {
      await new Promise((r) => setTimeout(r, ms));
    },
    async evaluate() {
      n += 1;
      return { dist: `${n}/0/0`, fading: 0 };
    },
  };
  const r = await waitForLodSettle(page, { pollMs: 2, stableSamples: 3, timeoutMs: 60 });
  assert.equal(r.timedOut, true);
  assert.ok(r.waitedMs >= 60, `waitedMs=${r.waitedMs}`);
});

// --- hideDomOverlays (#1219 / #1228) --------------------------------------

/** addStyleTag · waitForTimeout · evaluate(캔버스 개수) 만 흉내내는 스텁. */
function makeOverlayPage(canvasCount) {
  const calls = { styles: [], waits: [] };
  return {
    calls,
    async addStyleTag(opts) {
      calls.styles.push(opts.content);
    },
    async waitForTimeout(ms) {
      calls.waits.push(ms);
    },
    async evaluate() {
      return canvasCount;
    },
  };
}

await run('hideDomOverlays — 캔버스 1개면 숨김 스타일 1회 적용 + 기본 대기 후 통과', async () => {
  const page = makeOverlayPage(1);
  const r = await hideDomOverlays(page);
  assert.deepEqual(r, { canvasCount: 1 });
  assert.deepEqual(page.calls.styles, [DOM_OVERLAY_HIDE_CSS]);
  assert.deepEqual(page.calls.waits, [DOM_OVERLAY_POST_HIDE_WAIT_MS]);
  // display:none 이면 캡처 박스가 0×0 이 된다 (#1219) — visibility 여야 한다.
  assert.match(DOM_OVERLAY_HIDE_CSS, /visibility: hidden/);
  assert.doesNotMatch(DOM_OVERLAY_HIDE_CSS, /display/);
});

await run('hideDomOverlays — postHideWaitMs 지정 시 그 값으로 대기', async () => {
  const page = makeOverlayPage(1);
  await hideDomOverlays(page, { postHideWaitMs: 7 });
  assert.deepEqual(page.calls.waits, [7]);
});

await run('hideDomOverlays — 캔버스가 1개가 아니면 throw (0개 · 2개)', async () => {
  for (const n of [0, 2]) {
    await assert.rejects(() => hideDomOverlays(makeOverlayPage(n)), /캔버스가 \d+개다/);
  }
});

// ===========================================================================
// #1209 — 시나리오 prep 의 조용한 실패 제거 (clickTestId / setTimePlayback)
// ===========================================================================

/**
 * `page.locator(sel).count()/click()` 계약만 흉내내는 스텁.
 *
 * @param present 존재하는 것으로 볼 `data-testid` 값 집합
 */
function makeLocatorPage(present) {
  const set = new Set(present);
  return {
    clicks: [],
    locator(selector) {
      const m = /^\[data-testid="(.+)"\]$/.exec(selector);
      if (!m) throw new Error(`예상 밖 셀렉터 형태: ${selector}`);
      const id = m[1];
      const self = this;
      return {
        async count() {
          return set.has(id) ? 1 : 0;
        },
        async click(opts) {
          if (!set.has(id)) throw new Error(`부재 요소 클릭: ${id}`);
          self.clicks.push({ id, opts });
        },
      };
    },
  };
}

await run('clickTestId — 존재하면 클릭하고 true', async () => {
  const page = makeLocatorPage(['focus-neptune']);
  assert.equal(await clickTestId(page, 'focus-neptune'), true);
  assert.deepEqual(
    page.clicks.map((c) => c.id),
    ['focus-neptune'],
  );
  assert.equal(page.clicks[0].opts.timeout, 2000);
});

await run('clickTestId — 부재면 throw (조용한 통과 금지 — #1209 핵심)', async () => {
  const page = makeLocatorPage([]);
  await assert.rejects(
    () => clickTestId(page, 'focus-neptune'),
    /data-testid="focus-neptune" 부재/,
  );
  assert.deepEqual(page.clicks, []);
});

await run('clickTestId — skipIfAbsent 면 클릭 없이 false', async () => {
  const page = makeLocatorPage([]);
  assert.equal(await clickTestId(page, 'x', { skipIfAbsent: true }), false);
  assert.deepEqual(page.clicks, []);
});

await run('pressTimePlay — 기존 에러 문구 보존 (#210 계약 불변)', async () => {
  await assert.rejects(
    () => pressTimePlay(makeLocatorPage([])),
    /data-testid="time-play" 부재 — 재생 버튼 셀렉터 회귀 가능성/,
  );
  const page = makeLocatorPage(['time-play']);
  assert.equal(await pressTimePlay(page), true);
});

await run('setTimePlayback — 목표 상태 버튼이 있으면 클릭', async () => {
  // 재생 중 (time-pause 노출) → paused 로 전이
  const playing = makeLocatorPage(['time-pause']);
  assert.equal(await setTimePlayback(playing, 'paused'), 'clicked');
  assert.deepEqual(
    playing.clicks.map((c) => c.id),
    ['time-pause'],
  );
});

await run('setTimePlayback — 이미 그 상태면 형제 셀렉터로 확인하고 already', async () => {
  // 정지 중 (time-play 노출) → paused 요청은 이미 충족
  const paused = makeLocatorPage(['time-play']);
  assert.equal(await setTimePlayback(paused, 'paused'), 'already');
  assert.deepEqual(paused.clicks, []);
  // 반대 방향도 대칭
  const playing = makeLocatorPage(['time-pause']);
  assert.equal(await setTimePlayback(playing, 'playing'), 'already');
});

await run('setTimePlayback — 토글 쌍이 둘 다 부재면 throw (skip 과의 차이)', async () => {
  for (const mode of TIME_PLAYBACK_MODES) {
    await assert.rejects(
      () => setTimePlayback(makeLocatorPage([]), mode),
      /시간 토글 버튼 부재/,
      `mode=${mode}`,
    );
  }
});

await run('setTimePlayback — 알 수 없는 mode 는 throw (상속 키 포함)', async () => {
  // 'constructor' 등 Object.prototype 상속 키가 mode 검증을 통과하면 이후 쿼리가
  // `[data-testid="undefined"]` 가 되어 「토글 버튼 부재」라는 엉뚱한 진단으로 실패한다.
  for (const bad of ['stopped', 'constructor', 'toString', '__proto__']) {
    await assert.rejects(
      () => setTimePlayback(makeLocatorPage(['time-play']), bad),
      /알 수 없는 mode/,
      `mode=${bad}`,
    );
  }
});

console.log(`\n  ${passed} passed${process.exitCode ? ' — FAIL 있음' : ''}\n`);
