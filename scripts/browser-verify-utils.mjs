/**
 * P7-E #210 — browser-verify / bench 스크립트 공통 유틸.
 *
 * 목적 (QA 이관 3건 중 2건):
 *   1. `time-play` silent-fail 방지 — `.catch(() => {})` 로 셀렉터 부재 삼키지 말고
 *      pause/play 토글 감지 또는 HUD 진행 확인.
 *   2. NaN 검출 regex 정책 전환 — `consoleErrors.length === 0` 1차 기준 +
 *      상세 regex 보조 (root cause 식별 유지).
 *
 * 선례:
 *   - `scripts/browser-verify.mjs:131` — time-play 성공 assert 패턴
 *
 * 사용:
 *   import { pressTimePlay, hasSimErrors } from './browser-verify-utils.mjs';
 *   await pressTimePlay(page); // 내부 pre-assert + click
 *   if (hasSimErrors(consoleErrors)) { ... }
 *
 * ---------------------------------------------------------------------------
 * #846 — verify 부트스트랩 보일러플레이트 공용 헬퍼 (전수 감사 2026-07-18)
 * ---------------------------------------------------------------------------
 *
 * `launchBrowser` / `bootstrapScene` / `collectConsoleErrors` / `saveCapture` /
 * `resolveBaseUrl` 5종은 verify 스크립트 35개에 복붙되던 구간을 추출한 것이다.
 * 특히 launch 인자가 파일별로 제각각이라 (`--use-angle=metal` / swiftshader / 무인자)
 * **같은 가드를 로컬과 CI 에서 돌렸을 때 렌더러가 달라지는 재현 조건 drift** 가 있었다.
 * `GPU_LAUNCH_ARGS` 가 그 축을 단일 선언으로 흡수한다.
 *
 * ## 신규 verify 스크립트 리뷰 체크리스트 (SSoT: docs/ops/browser-verify-helpers.md)
 *
 *   1. `chromium.launch(...)` 직접 호출 대신 `launchBrowser()` — 렌더러 축은 `gpu` 옵션으로
 *   2. `page.goto` + `waitForFunction(window.__solarScene …)` 대신 `bootstrapScene()`
 *   3. `page.on('console' …)` 인라인 대신 `collectConsoleErrors()` — `pageerror` 누락 방지
 *   4. `mkdir` + `writeFile` 수기 조합 대신 `saveCapture()`
 *   5. `process.env.BASE_URL ?? 'http://localhost:3000'` 대신 `resolveBaseUrl()`
 *   6. `launch → … → close` 일직선 나열 대신 `withBrowser()` — 에러 경로 브라우저 잔존 차단 (#927)
 *
 * **기존 스크립트 전면 전환은 비목표** (#846 스프린트 계약) — 신규 유입 차단이 목표다.
 * 기존 파일은 손대는 김에 점진 전환하되, 동작 불변이 확인된 범위에서만 바꾼다.
 *
 * 회귀 가드: `scripts/browser-verify-utils.test.mjs` (ci.yml 에 배선, 브라우저 불요).
 */

/**
 * `[data-testid="time-play"]` 버튼을 pre-assert 후 클릭.
 *
 * 셀렉터 부재 시 `Error` throw — 기존 `.catch(() => {})` 로 silent 삼키던 패턴을
 * 대체. `skipIfAbsent: true` 옵션을 주면 부재 시 false 반환 (재생 불필요 케이스).
 *
 * @param page Playwright Page
 * @param options.timeout click 타임아웃 (기본 2000ms)
 * @param options.skipIfAbsent 버튼 부재 시 throw 대신 false 반환
 * @returns click 성공 여부
 */
export async function pressTimePlay(page, options = {}) {
  const timeout = options.timeout ?? 2000;
  const skipIfAbsent = options.skipIfAbsent ?? false;
  const locator = page.locator('[data-testid="time-play"]');
  const count = await locator.count();
  if (count === 0) {
    if (skipIfAbsent) return false;
    throw new Error(
      '[browser-verify-utils] data-testid="time-play" 부재 — 재생 버튼 셀렉터 회귀 가능성',
    );
  }
  await locator.click({ timeout });
  return true;
}

/**
 * consoleErrors 배열을 "시뮬레이션 핵심 에러" 기준으로 판정.
 *
 * 정책 (QA 이관 #2 — 1차/2차 계층화):
 *   1차 (엄격): 콘솔 에러가 1건이라도 있으면 실패.
 *   2차 (관대): architect §결정 5 — 외부 리소스 / 개발 도구 에러를 허용하려면
 *               `allowExternal: true` 로 `NaN/wasm/NBodyEngine/integrator/shader/WebGL/WebGPU`
 *               패턴만 정확 매칭.
 *
 * @param consoleErrors 수집된 에러 메시지 배열
 * @param options.allowExternal true 시 시뮬레이션 핵심 패턴만 검사 (기본 false)
 * @returns true = 에러 있음 (실패), false = 청결
 */
export function hasSimErrors(consoleErrors, options = {}) {
  const allowExternal = options.allowExternal ?? false;
  if (!allowExternal) {
    return consoleErrors.length > 0;
  }
  // architect §결정 5 — 상세 regex 보조.
  const pattern = /NaN|nbody|wasm|NBodyEngine|integrator|shader|compil|wgsl|glsl|WebGL|WebGPU/i;
  return consoleErrors.some((e) => pattern.test(e));
}

// ===========================================================================
// #846 — verify 부트스트랩 공용 헬퍼
// ===========================================================================

/** verify 스크립트 기본 타깃. ci.yml 은 `BASE_URL` 로 실제 포트를 주입한다. */
export const DEFAULT_BASE_URL = 'http://localhost:3000';

/** 씬 부트스트랩 기본 쿼리 — `gpu=a` (ANGLE 강제) + `lod=auto` 는 CI 가드 공통 관행. */
export const DEFAULT_BOOTSTRAP_QUERY = '/?gpu=a&lod=auto';

/**
 * 렌더러 선택 축 SSoT.
 *
 * 기존에는 파일별로 `--use-angle=metal` (macOS 로컬 6곳) / `--use-angle=swiftshader`
 * (CI 결정성 10곳) / 무인자가 뒤섞여, 동일 가드가 어느 렌더러로 측정됐는지 호출부를
 * 읽어야만 알 수 있었다. 픽셀 측정 가드에서 이 축은 결과를 바꾸므로 단일 선언으로 고정한다.
 */
export const GPU_LAUNCH_ARGS = Object.freeze({
  /** 플랫폼 기본 — Playwright 번들 chromium 의 기본 백엔드. */
  default: [],
  /** 소프트웨어 래스터라이저 — CI 결정성 우선 (GPU 편차 제거). */
  swiftshader: ['--use-angle=swiftshader'],
  /** macOS Metal 백엔드 — 로컬 실 GPU 재현용. */
  metal: ['--use-angle=metal'],
});

/**
 * `BASE_URL` 환경변수를 정규화해 반환.
 *
 * 후행 슬래시를 제거한다 — `BASE_URL=http://host:3002/` + 쿼리 `/?gpu=a` 조합이
 * `//?gpu=a` 로 합쳐지는 사고를 차단 (Next.js i18n 리다이렉트가 경로를 바꿔버린다).
 *
 * @param {string} [fallback] 미설정 시 사용할 기본값
 * @param {Record<string, string | undefined>} [env] 주입용 (테스트에서 process.env 대체)
 * @returns {string} 후행 슬래시가 제거된 base URL
 */
export function resolveBaseUrl(fallback = DEFAULT_BASE_URL, env = process.env) {
  const raw = env.BASE_URL;
  const value = raw === undefined || raw === '' ? fallback : raw;
  return value.replace(/\/+$/, '');
}

/**
 * `chromium.launch` 옵션을 조립 (순수 함수 — 브라우저 기동 없이 단위 테스트 가능).
 *
 * @param {object} [options]
 * @param {boolean} [options.headful] true 면 headless:false. 미지정 시 `HEADFUL`/`HEADED` 환경변수
 * @param {'default'|'swiftshader'|'metal'} [options.gpu] 렌더러 축. 미지정 시 `BROWSER_VERIFY_GPU`
 * @param {string[]} [options.args] 추가 chromium 인자 (GPU 인자 뒤에 이어붙임)
 * @param {string|null} [options.channel] headful 시 채널. `null` 이면 번들 chromium 유지
 * @param {Record<string, string | undefined>} [options.env] 주입용
 * @returns {{ headless: boolean, args?: string[], channel?: string }}
 */
export function buildLaunchOptions(options = {}) {
  const env = options.env ?? process.env;
  const headful = options.headful ?? (isTruthyEnv(env.HEADFUL) || isTruthyEnv(env.HEADED));
  const gpu = options.gpu ?? env.BROWSER_VERIFY_GPU ?? 'default';

  if (!Object.prototype.hasOwnProperty.call(GPU_LAUNCH_ARGS, gpu)) {
    // fail-fast — 오타난 렌더러 축이 조용히 default 로 흡수되면 픽셀 가드가 다른 백엔드로
    // 측정하고도 PASS 한다 (CLAUDE.md §가드 설계 원칙 — fallback 분기 금지).
    throw new Error(
      `[browser-verify-utils] 알 수 없는 gpu 축 '${gpu}' — 허용: ${Object.keys(GPU_LAUNCH_ARGS).join(', ')}`,
    );
  }

  const args = [...GPU_LAUNCH_ARGS[gpu], ...(options.args ?? [])];
  /** @type {{ headless: boolean, args?: string[], channel?: string }} */
  const launchOptions = { headless: !headful };
  if (args.length > 0) launchOptions.args = args;

  // headful 은 "실 브라우저로 눈으로 본다" 가 목적이므로 기본 채널을 실 Chrome 으로.
  // 명시적으로 `channel: null` 을 주면 번들 chromium 을 유지한다.
  const channel = options.channel === undefined ? (headful ? 'chrome' : null) : options.channel;
  if (channel !== null) launchOptions.channel = channel;

  return launchOptions;
}

/**
 * 공용 launch 옵션으로 chromium 기동.
 *
 * `playwright` 는 **동적 import** 한다 — 본 모듈의 순수 함수 (`resolveBaseUrl` /
 * `buildLaunchOptions`) 만 쓰는 소비자와 단위 테스트가 브라우저 바이너리 설치 없이
 * 동작하도록 유지하기 위함.
 *
 * @param {Parameters<typeof buildLaunchOptions>[0]} [options]
 * @returns {Promise<import('playwright').Browser>}
 */
export async function launchBrowser(options = {}) {
  const { chromium } = await import('playwright');
  return chromium.launch(buildLaunchOptions(options));
}

/**
 * 브라우저 수명주기를 `try/finally` 로 감싸 **에러 경로에서도 `close()` 도달을 보장**.
 *
 * 구세대 verify 스크립트 (#927 대상 10종) 는 top-level await 로 `launch → … → close` 를
 * 일직선으로 나열해, `page.goto` 실패 / 셀렉터 부재 throw 가 나면 마지막 `close()` 에
 * 도달하지 못했다. 정상 종료 시엔 Playwright 가 브라우저를 회수하지만
 * hang → SIGKILL 경로에서는 잔존 프로세스가 남는다 (agent-browser 좀비와 동일 클래스).
 *
 * `launchOptions` 는 `chromium.launch` 로 **그대로 전달**한다 — 기존 스크립트의 launch 인자를
 * 한 글자도 바꾸지 않고 수명주기만 위임하기 위함 (#846 §기존 스크립트 전환 정책 "동작 불변").
 * 옵션 조립까지 위임하려면 `withBrowser(buildLaunchOptions({ gpu: 'swiftshader' }), fn)` 처럼
 * 순수 함수를 통과시킨다.
 *
 * `process.exit()` 를 콜백 **안에서** 호출하면 finally 가 실행되지 않는다 (Node 즉시 종료).
 * 조기 종료가 필요하면 콜백은 값을 반환하고 종료는 호출부에서 한다.
 *
 * @param {object} [launchOptions] `chromium.launch` 원본 옵션 (그대로 전달)
 * @param {(browser: import('playwright').Browser) => Promise<T> | T} fn 브라우저 사용 본문
 * @param {object} [options]
 * @param {(launchOptions: object) => Promise<import('playwright').Browser>} [options.launch]
 *   주입용 (테스트에서 chromium 대체) — 미지정 시 `playwright` 동적 import
 * @returns {Promise<T>} `fn` 의 반환값
 * @template T
 */
export async function withBrowser(launchOptions = {}, fn, options = {}) {
  const launch = options.launch ?? defaultLaunch;
  const browser = await launch(launchOptions);
  let failed = false;
  try {
    return await fn(browser);
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    try {
      await browser.close();
    } catch (closeError) {
      // 원 에러 보존 — close 실패가 진짜 실패 원인을 덮으면 진단이 뒤집힌다.
      // 실패가 없던 경로에서만 close 에러를 그대로 노출한다 (조용한 삼킴 금지).
      if (!failed) throw closeError;
      console.warn(
        `[browser-verify-utils] browser.close() 실패 — 원 에러 유지: ${closeError?.message ?? closeError}`,
      );
    }
  }
}

/** `withBrowser` 기본 launcher — `launchBrowser` 와 동일하게 playwright 를 동적 import. */
async function defaultLaunch(launchOptions) {
  const { chromium } = await import('playwright');
  return chromium.launch(launchOptions);
}

/**
 * 콘솔 에러 + 페이지 예외를 라이브 수집 배열로 연결.
 *
 * 인라인 복붙 43곳 중 상당수가 `pageerror` 리스너를 빠뜨려 **미포착 예외를 놓쳤다**.
 * 본 헬퍼는 두 채널을 항상 함께 등록한다.
 *
 * @param {import('playwright').Page} page
 * @param {object} [options]
 * @param {string[]} [options.errors] 기존 배열에 이어 담고 싶을 때 주입
 * @param {string[]} [options.warnings] 배열을 주면 `warning` 레벨도 함께 수집
 * @returns {string[]} 라이브 갱신되는 에러 배열
 */
export function collectConsoleErrors(page, options = {}) {
  const errors = options.errors ?? [];
  const warnings = options.warnings;

  page.on('console', (msg) => {
    const type = msg.type();
    if (type === 'error') errors.push(msg.text());
    else if (warnings && type === 'warning') warnings.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

  return errors;
}

/**
 * 씬 페이지로 이동 후 dev 전용 전역 핸들이 노출될 때까지 대기.
 *
 * @param {import('playwright').Page} page
 * @param {object} [options]
 * @param {string} [options.baseUrl] 기본 `resolveBaseUrl()`
 * @param {string} [options.query] base 뒤에 붙일 경로+쿼리 (기본 `DEFAULT_BOOTSTRAP_QUERY`)
 * @param {string[]} [options.handles] 대기할 `window` 전역 이름 (기본 `['__solarScene']`)
 * @param {number} [options.gotoTimeout] goto 타임아웃 ms (기본 45_000)
 * @param {number} [options.handleTimeout] 전역 노출 대기 ms (기본 20_000)
 * @param {number} [options.settleMs] 대기 후 추가 안정화 ms (기본 0)
 * @param {'load'|'domcontentloaded'|'networkidle'|'commit'} [options.waitUntil] 기본 `networkidle`
 * @returns {Promise<string>} 실제 이동한 URL
 */
export async function bootstrapScene(page, options = {}) {
  const baseUrl = options.baseUrl ?? resolveBaseUrl();
  const query = options.query ?? DEFAULT_BOOTSTRAP_QUERY;
  const handles = options.handles ?? ['__solarScene'];
  const url = `${baseUrl}${query}`;

  await page.goto(url, {
    waitUntil: options.waitUntil ?? 'networkidle',
    timeout: options.gotoTimeout ?? 45_000,
  });
  await page.waitForFunction(
    (names) => names.every((name) => typeof window[name] !== 'undefined'),
    handles,
    { timeout: options.handleTimeout ?? 20_000 },
  );

  const settleMs = options.settleMs ?? 0;
  if (settleMs > 0) await page.waitForTimeout(settleMs);

  return url;
}

/**
 * 캡처 버퍼를 디렉토리 생성과 함께 저장.
 *
 * @param {Buffer | Uint8Array} buffer `page.screenshot()` / `canvas.screenshot()` 결과
 * @param {string} filePath 저장 경로 (상위 디렉토리는 자동 생성)
 * @returns {Promise<string>} 저장된 경로
 */
export async function saveCapture(buffer, filePath) {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, buffer);
  return filePath;
}

/** `'0'` / `'false'` / 빈 값을 거짓으로 해석하는 환경변수 플래그 판정. */
function isTruthyEnv(value) {
  if (value === undefined || value === '') return false;
  return value !== '0' && value.toLowerCase() !== 'false';
}
