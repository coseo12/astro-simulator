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
  GPU_LAUNCH_ARGS,
  bootstrapScene,
  buildLaunchOptions,
  collectConsoleErrors,
  resolveBaseUrl,
  saveCapture,
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

/** Playwright Page 의 이벤트 계약만 흉내내는 스텁. */
function stubPage() {
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
  const opts = { headless: true, args: ['--use-angle=metal'] };
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
  const url = await bootstrapScene(page, { baseUrl: 'http://localhost:3002' });
  assert.equal(url, `http://localhost:3002${DEFAULT_BOOTSTRAP_QUERY}`);
  assert.equal(page.gotoCalls[0].url, url);
  assert.equal(page.gotoCalls[0].opts.waitUntil, 'networkidle');
});

await run('bootstrapScene — handles 전부 노출돼야 통과하는 술어', async () => {
  const page = stubPage();
  await bootstrapScene(page, {
    baseUrl: 'http://x',
    handles: ['__solarScene', '__simStore'],
  });
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
  await bootstrapScene(page, { baseUrl: 'http://x' });
  assert.deepEqual(page.waitForTimeoutCalls, []);
});

await run('bootstrapScene — settleMs 지정 시 안정화 대기', async () => {
  const page = stubPage();
  await bootstrapScene(page, { baseUrl: 'http://x', settleMs: 2500 });
  assert.deepEqual(page.waitForTimeoutCalls, [2500]);
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

console.log(`\n  ${passed} passed${process.exitCode ? ' — FAIL 있음' : ''}\n`);
