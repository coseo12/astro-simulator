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

// ---------------------------------------------------------------------------
// #1234 C1 — 부팅 계측 (진단 전용 · 판정 무변경)
// ---------------------------------------------------------------------------
//
// `bootstrapScene` 의 핸들 대기 20 s 타임아웃이 2026-09-18 하루에 5회, 로컬 qa 에서도 1회
// 발화해 v0.89.0 릴리스 CI 를 두 번 막았다 (#1234). 그런데 **실패 시 남는 것이 Playwright
// TimeoutError 스택뿐**이라 원인 후보 (동시 열린 페이지 수 / job 내 실행 순서 / dev server 상태) 를
// 가를 수치가 하나도 없었다. 본 블록은 그 수치를 남기기만 한다 —
// **타임아웃 상수 · 대기 술어 · 예외 전파는 한 글자도 바뀌지 않는다** (#1234 계약 C5).
//
// 출력은 두 줄이다.
//   1. 사람이 읽는 한 줄 요약  `[boot] <guard> #<seq> <label> — ...`
//   2. 기계가 읽는 JSON 한 줄  `[boot] {"guard":...}`
// 둘 다 `[boot] ` 로 시작하므로 `grep '^\[boot\]'` 가 전건을, `grep '^\[boot\] {'` 가 JSON 만
// 모은다. CI 로그 수집 절차는 PR 본문 §C1 수집 방법.

/**
 * 프로세스 안에서 `bootstrapScene` 이 몇 번째로 불렸는지 (1부터).
 *
 * 가드 1개 = node 프로세스 1개이므로 이 순번이 곧 「그 가드의 N 번째 페이지」다. 호출부가
 * `label` 을 주지 않아도 P1 ↔ P1b 를 로그에서 가를 수 있게 하는 축 (#1234 — 실패 지점이
 * 첫 페이지였던 run 과 5번째 페이지였던 run 이 섞여 있었다).
 */
let bootCallSeq = 0;

/** 실패 진단 probe 상한 (ms). 멈춘 페이지에서 probe 자체가 매달리면 진단이 가드를 늘린다. */
const BOOT_PROBE_TIMEOUT_MS = 5_000;

/** 진단에 싣는 콘솔/페이지 에러 최대 건수 (로그 폭주 방지). */
const BOOT_ERROR_SAMPLE_MAX = 20;

/** 가드 이름 = 실행 엔트리 파일명. 호출부 수정 없이 「어느 가드인지」를 얻는 축. */
function bootGuardName() {
  const entry = process.argv[1];
  if (typeof entry !== 'string' || entry === '') return 'unknown';
  return entry.split(/[\\/]/).pop();
}

/**
 * 지금 열려 있는 context / page 수.
 *
 * 셀 수 없으면 `null` 을 넣는다 — **진단이 `0` 을 지어내면 안 된다**. `0` 과 「못 셌다」가
 * 같은 값으로 보이면 이 축으로 원인을 가르려는 다음 단계가 거짓 분포를 읽는다.
 */
function countOpenPages(page) {
  try {
    const browser = page.context?.()?.browser?.();
    if (!browser) return { contexts: null, pages: null, countError: 'browser 핸들 미노출' };
    const contexts = browser.contexts();
    return {
      contexts: contexts.length,
      pages: contexts.reduce((n, ctx) => n + ctx.pages().length, 0),
      countError: null,
    };
  } catch (error) {
    return { contexts: null, pages: null, countError: String(error?.message ?? error) };
  }
}

/**
 * 실패 시점의 페이지 상태를 읽는다 (`document.readyState` / dev 전역 / `performance.now()`).
 *
 * `page.evaluate` 는 타임아웃 옵션이 없어 멈춘 페이지에서 그대로 매달릴 수 있으므로
 * `BOOT_PROBE_TIMEOUT_MS` 로 경주시킨다. 진 쪽 promise 는 `catch` 를 달아 unhandled rejection 을
 * 만들지 않는다.
 */
async function probePageState(page) {
  let timer;
  try {
    const probe = Promise.resolve(
      page.evaluate(() => ({
        readyState: document.readyState,
        href: location.href,
        simCore: typeof window.__simCore,
        solarScene: typeof window.__solarScene,
        performanceNowMs: Math.round(performance.now()),
      })),
    ).catch((error) => ({ probeError: String(error?.message ?? error) }));
    const bounded = new Promise((resolve) => {
      timer = setTimeout(
        () => resolve({ probeError: `probe ${BOOT_PROBE_TIMEOUT_MS}ms 초과` }),
        BOOT_PROBE_TIMEOUT_MS,
      );
    });
    return await Promise.race([probe, bounded]);
  } catch (error) {
    return { probeError: String(error?.message ?? error) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 부팅 **단계 계측** (#1234 C2-H3) 스냅샷을 읽는다.
 *
 * `window.__bootPhases` 는 apps/web `boot-phases.ts` 가 dev 빌드에서만 노출하는 getter 이며,
 * 「구간 이름 + 네비게이션 기준 경과 + 직전 구간과의 차」를 누적한다. C1 이 남긴 실패 상태
 * (`__simCore` 는 있고 `__solarScene` 만 없음) 는 「장면 구축 어딘가」까지만 좁혔고, 이 스냅샷이
 * 그 안쪽을 가른다 — 엔진 생성 / 어댑터 / mesh 생성 / 궤도선 / 물리 엔진 중 어디서 멈췄는지.
 *
 * **prod 서버 (`next start`) 로 띄운 대조군에서는 전역 자체가 없다** → `null` 이 정상이다.
 * probe 자체가 멈춘 페이지에 매달리지 않도록 `probePageState` 와 같은 상한으로 경주시킨다.
 */
async function readBootPhases(page) {
  let timer;
  try {
    const probe = Promise.resolve(
      page.evaluate(() => {
        const snapshot = window.__bootPhases;
        return snapshot === undefined ? null : snapshot;
      }),
    ).catch((error) => ({ phasesError: String(error?.message ?? error) }));
    const bounded = new Promise((resolve) => {
      timer = setTimeout(
        () => resolve({ phasesError: `bootPhases probe ${BOOT_PROBE_TIMEOUT_MS}ms 초과` }),
        BOOT_PROBE_TIMEOUT_MS,
      );
    });
    return await Promise.race([probe, bounded]);
  } catch (error) {
    return { phasesError: String(error?.message ?? error) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 실패 시점의 **dev server** 응답성을 브라우저 밖에서 잰다.
 *
 * 이 축이 없으면 「서버가 느린 것」과 「브라우저·페이지가 멈춘 것」이 같은 증상 (핸들 미노출) 으로
 * 보인다 — #1234 의 원인 후보 중 두 개 (`next dev` 상태 ↔ 동시 열린 페이지 수) 가 구분되지 않는다.
 * Playwright 를 거치지 않는 node 측 `fetch` 라, 브라우저가 멈춰 있어도 서버는 따로 측정된다.
 */
async function probeServer(baseUrl) {
  const startedAt = Date.now();
  try {
    const res = await fetch(baseUrl, { signal: AbortSignal.timeout(BOOT_PROBE_TIMEOUT_MS) });
    // body 를 버리지 않으면 소켓이 남는다 (keep-alive).
    await res.arrayBuffer().catch(() => {});
    return { status: res.status, ms: Date.now() - startedAt };
  } catch (error) {
    return { status: null, ms: Date.now() - startedAt, error: String(error?.message ?? error) };
  }
}

/**
 * 부팅 구간 한정 콘솔/페이지 에러 수집기.
 *
 * 호출부의 `collectConsoleErrors` 배열에 기대지 않는다 — 그 배열을 넘겨받으려면 모든 호출부를
 * 고쳐야 하고, 넘겨주지 않는 가드는 조용히 진단이 비게 된다. 리스너는 `detach()` 로 떼므로
 * 부팅 이후 구간에는 남지 않는다.
 */
function attachBootErrorProbe(page) {
  const errors = [];
  const push = (text) => {
    if (errors.length < BOOT_ERROR_SAMPLE_MAX) errors.push(text);
  };
  const onConsole = (msg) => {
    try {
      if (msg.type() === 'error') push(msg.text());
    } catch {
      /* 진단 수집 실패가 가드를 죽이면 안 된다 */
    }
  };
  const onPageError = (err) => push(`pageerror: ${err?.message ?? err}`);
  try {
    page.on?.('console', onConsole);
    page.on?.('pageerror', onPageError);
  } catch {
    /* 이벤트 계약이 없는 page (테스트 스텁 등) 는 수집 없이 진행 */
  }
  return {
    errors,
    detach() {
      try {
        page.off?.('console', onConsole);
        page.off?.('pageerror', onPageError);
      } catch {
        /* 떼지 못해도 판정과 무관 */
      }
    },
  };
}

/**
 * 부팅 단계 (#1234 C2-H3) 를 사람이 읽는 한 조각으로 접는다.
 *
 * 전량은 JSON 줄에 있으므로 요약에는 **마지막 구간**(어디까지 갔나) 과 **가장 오래 걸린 3개**
 * (어디서 샜나) 만 싣는다. 두 물음이 실패 로그를 훑을 때 먼저 던지는 것이다.
 */
function formatBootPhases(snapshot) {
  if (snapshot === null || snapshot === undefined) return ' · phases -';
  if (snapshot.phasesError) return ` · phases ERR(${snapshot.phasesError})`;
  const phases = Array.isArray(snapshot.phases) ? snapshot.phases : [];
  if (phases.length === 0) return ' · phases 0';
  const last = phases[phases.length - 1];
  const top = [...phases]
    .sort((a, b) => b.deltaMs - a.deltaMs)
    .slice(0, 3)
    // dev StrictMode 는 초기화 체인을 두 개 돌린다 — 같은 이름이 두 번 나오므로 체인을 붙인다.
    .map((p) => `${p.name}${p.chain ? `(${p.chain})` : ''} ${p.deltaMs}ms`)
    .join(', ');
  const droppedNote = snapshot.dropped ? ` +${snapshot.dropped}건 잘림` : '';
  return ` · phases ${phases.length}${droppedNote} last ${last.name}@${last.atMs}ms · top ${top}`;
}

/** 계측 레코드를 요약 1줄 + JSON 1줄로 출력. */
function logBootRecord(rec) {
  const ms = (v) => (v === null ? '-' : `${v}ms`);
  const count = rec.countError === null ? `ctx ${rec.contexts}/page ${rec.pages}` : 'ctx ?/page ?';
  const verdict = rec.ok ? 'ok' : `FAIL(${rec.failedPhase} ${ms(rec.failedPhaseMs)})`;
  // 실패 줄에는 「서버가 느린가 / 페이지가 멈췄나」를 가르는 두 값을 요약에도 싣는다 —
  // JSON 을 파싱하지 않고 로그를 훑는 사람이 가장 먼저 봐야 하는 축이다.
  const diag = rec.ok
    ? ''
    : ` · server ${rec.server?.status ?? 'x'}/${ms(rec.server?.ms ?? null)}` +
      ` · readyState ${rec.state?.readyState ?? '?'}` +
      ` · __simCore ${rec.state?.simCore ?? '?'} · __solarScene ${rec.state?.solarScene ?? '?'}` +
      ` · consoleErrors ${rec.consoleErrors?.length ?? '?'}`;
  console.log(
    `[boot] ${rec.guard} #${rec.seq}${rec.label ? ` ${rec.label}` : ''} — ${verdict} ` +
      `goto ${ms(rec.gotoMs)} · handles ${ms(rec.handlesMs)} · settle ${ms(rec.settleMs)} · ` +
      `total ${ms(rec.totalMs)} · ${count} · t0 ${rec.processUptimeS}s${diag}` +
      formatBootPhases(rec.bootPhases),
  );
  console.log(`[boot] ${JSON.stringify(rec)}`);
}

/**
 * 씬 페이지로 이동 후 dev 전용 전역 핸들이 노출될 때까지 대기.
 *
 * 각 구간 소요 시간과 실패 직전 상태를 `[boot]` 두 줄로 남긴다 (#1234 C1) — 판정·타임아웃은
 * 불변이고 예외는 **원본 그대로** 다시 던진다.
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
 * @param {string} [options.label] 계측 로그에 실을 페이지 라벨 (예: `'P1'` / `'P1b'`). 미지정 시 순번만
 * @returns {Promise<string>} 실제 이동한 URL
 */
export async function bootstrapScene(page, options = {}) {
  const baseUrl = options.baseUrl ?? resolveBaseUrl();
  const query = options.query ?? DEFAULT_BOOTSTRAP_QUERY;
  const handles = options.handles ?? ['__solarScene'];
  const url = `${baseUrl}${query}`;
  const settleMs = options.settleMs ?? 0;

  const startedAt = Date.now();
  /** @type {Record<string, unknown>} */
  const rec = {
    guard: bootGuardName(),
    seq: ++bootCallSeq,
    label: options.label ?? null,
    url,
    handles,
    waitUntil: options.waitUntil ?? 'networkidle',
    settleRequestedMs: settleMs,
    // 가드 프로세스 기동 이후 경과 (s) — 「job 끝단일수록 느린가」 가설의 관측 축.
    processUptimeS: Number(process.uptime().toFixed(1)),
    ...countOpenPages(page),
    gotoMs: null,
    gotoStatus: null,
    handlesMs: null,
    settleMs: null,
    totalMs: null,
    ok: false,
    failedPhase: null,
    // 실패한 구간에서 소비한 시간. `gotoMs`/`handlesMs`/`settleMs` 는 **완주한 구간만** 채우므로
    // (실패 구간에 값을 넣으면 「완주 소요」 분포에 타임아웃 상수가 섞인다) 실패 쪽은 여기로 뺀다.
    failedPhaseMs: null,
    error: null,
    state: null,
    server: null,
    // #1234 C2-H3 — 부팅 단계 계측 스냅샷 (성공·실패 양쪽에서 채운다. prod 번들이면 null).
    bootPhases: null,
    /** 위 스냅샷을 읽는 데 든 시간 (성공 경로에서만. `totalMs` 에 포함된 몫). */
    phasesProbeMs: null,
    consoleErrors: null,
    pagesAtFail: null,
    contextsAtFail: null,
  };
  const errorProbe = attachBootErrorProbe(page);
  let phase = 'goto';
  let phaseStartedAt = startedAt;

  try {
    const response = await page.goto(url, {
      waitUntil: options.waitUntil ?? 'networkidle',
      timeout: options.gotoTimeout ?? 45_000,
    });
    rec.gotoMs = Date.now() - startedAt;
    try {
      rec.gotoStatus = response?.status?.() ?? null;
    } catch {
      rec.gotoStatus = null;
    }

    phase = 'handles';
    const handlesStartedAt = Date.now();
    phaseStartedAt = handlesStartedAt;
    await page.waitForFunction(
      (names) => names.every((name) => typeof window[name] !== 'undefined'),
      handles,
      { timeout: options.handleTimeout ?? 20_000 },
    );
    rec.handlesMs = Date.now() - handlesStartedAt;

    phase = 'settle';
    const settleStartedAt = Date.now();
    phaseStartedAt = settleStartedAt;
    if (settleMs > 0) await page.waitForTimeout(settleMs);
    rec.settleMs = Date.now() - settleStartedAt;

    // 성공 경로에서도 단계 분포를 남긴다 — **실패 표본만으로는 기준선이 없다** (C1 에서 goto 가
    // 평평하다는 사실도 성공 표본 36회가 있어서 알았다). `readBootPhases` 는 자체 try/catch 로
    // 절대 throw 하지 않으므로 아래 catch (= 판정) 에 닿지 않는다 (#1234 계약 C5).
    //
    // 이 evaluate 비용은 `totalMs` 에 들어간다 (finally 에서 재므로). 구간별 값
    // (`gotoMs`/`handlesMs`/`settleMs`) 은 오염되지 않으며, 비용 자체는 `phasesProbeMs` 로
    // 분리해 두어 C1 표본과의 `totalMs` 대조 시 빼고 볼 수 있게 한다.
    const phasesProbeStartedAt = Date.now();
    rec.bootPhases = await readBootPhases(page);
    rec.phasesProbeMs = Date.now() - phasesProbeStartedAt;

    rec.ok = true;
    return url;
  } catch (error) {
    rec.failedPhase = phase;
    rec.failedPhaseMs = Date.now() - phaseStartedAt;
    rec.error = `${error?.name ?? 'Error'}: ${String(error?.message ?? error).split('\n')[0]}`;
    rec.state = await probePageState(page);
    // #1234 C2-H3 — 「어디까지 갔나」. `state` 가 `__solarScene="undefined"` 로 잘라낸 구간의
    // **안쪽**을 이 스냅샷이 가른다 (state 바로 옆에 싣는 것이 계약 — 두 값은 같이 읽힌다).
    rec.bootPhases = await readBootPhases(page);
    rec.server = await probeServer(baseUrl);
    rec.consoleErrors = [...errorProbe.errors];
    const atFail = countOpenPages(page);
    rec.pagesAtFail = atFail.pages;
    rec.contextsAtFail = atFail.contexts;
    // 판정 무변경 — 원 에러를 그대로 다시 던진다 (#1234 C5).
    throw error;
  } finally {
    rec.totalMs = Date.now() - startedAt;
    errorProbe.detach();
    logBootRecord(rec);
  }
}

/**
 * #1205 — LOD cross-fade 정착 대기. **일시정지 중 카메라를 움직인 직후** 호출한다.
 *
 * ## 왜 필요한가
 *
 * #1205 이전에는 일시정지에서 `runLodPass` 가 아예 돌지 않아 LOD 가 얼어 있었다 — 정지 중
 * 카메라를 어떻게 흔들어도 레벨 전이도 cross-fade 도 발생하지 않았다. 프레임 위상 분리 이후
 * 정지에서도 LOD 가 갱신되고, 200ms cross-fade 가 **wall-clock 으로** 진행한다
 * (ADR `docs/decisions/20260628-756-procedural-planet-surface.md` Amendment 9).
 *
 * 그래서 정지 중 카메라 조작 뒤에 상수 `waitForTimeout(N)` 으로 캡처하면 알파가 캡처 시각에
 * 종속된다 — N 이 fade 창보다 크다는 것이 우연히 참인 동안만 안전하다.
 *
 * ## 정착 술어
 *
 * `getLodStats()` 의 **분포가 직전 표본과 동일**하고 **`fading === 0`** 인 표본이
 * `stableSamples` 회 **연속** 관측되면 정착
 * (`apps/web/scripts/browser-verify-1205-pause-lod.mjs` 의 `settle()` 과 같은 형태 — 그쪽은
 * `tier`/`radius` 축을 더 본다). 두 다리가 각각 닫는 것이 다르다.
 *
 *  - `fading === 0` — cross-fade **진행 중** 캡처를 막는다.
 *  - **분포 동일** — fade 를 남기지 않는 전이를 막는다. `runLodPass` 는 `prevLevel === undefined`
 *    일 때 (그 body 의 최초 레벨 결정) `lodFadeState` 에 등록하지 않으므로, **분포가 움직이는
 *    중인데 `fading` 이 계속 `0`** 인 구간이 실재한다. `fading` 만 보는 술어는 그 구간을 정착으로
 *    읽는다.
 *
 * ⚠️ **닫지 못하는 것 — 「전이가 아직 시작되지 않은」 구간.** 처음 `stableSamples + 1` 표본
 * (기본 `4 × 200ms = 800ms`) 안에 레벨 전이가 시작되지 않으면 **옛 분포가 정착으로 읽힌다.**
 * 이 다리는 술어가 아니라 **타이밍**이 지탱한다: `runFramePass` 가 매 프레임 돌므로 전이는
 * 카메라 조작 다음 프레임에 적용된다 — [실측] `beta = π/2` 대입 후 분포 변화 관측 `12ms`,
 * fade 종료 `211ms` (1280×720 headless, `?gpu=a&focus=earth&lod=auto&rotate=off&orbits=off`).
 * ⚠️ **이 여유를 배수로 박제하지 않는다.** 관측값이 런마다 움직인다 — 같은 조작을 독립 세션에서
 * 재면 `24.1ms` 가 나왔다 (dev `12ms` / qa `24.1ms`, PR #1208). 배수를 적으면 다음 실측이
 * 그 문장을 반증한다. 지탱하는 것은 **기전**이다: 전이는 조작 **다음 프레임**에 적용되고
 * `pollMs` 는 그보다 크다. 이 여유가 얇아지면 (예: 전이가 셰이더 컴파일 stall 뒤로 밀리면)
 * 호출부가 「전이 관측」을 별도 조건으로 걸어야 한다.
 *
 * @param {import('playwright').Page} page
 * @param {number} [options.pollMs] 표본 간격 (기본 200)
 * @param {number} [options.stableSamples] 연속 동일 표본 수 (기본 3 — 총 600ms > fade 200ms)
 * @param {number} [options.timeoutMs] 상한 (기본 8000). 초과 시 `timedOut: true` 로 반환하며
 *   throw 하지 않는다 — 호출부가 캡처를 진행할지 판단한다.
 * @returns {Promise<{dist: string, fading: number, waitedMs: number, timedOut: boolean}>}
 */
export async function waitForLodSettle(page, options = {}) {
  const pollMs = options.pollMs ?? 200;
  const stableSamples = options.stableSamples ?? 3;
  const timeoutMs = options.timeoutMs ?? 8000;
  const start = Date.now();
  let last = null;
  let stable = 0;

  while (Date.now() - start < timeoutMs) {
    await page.waitForTimeout(pollMs);
    const cur = await page.evaluate(() => {
      const s = window.__solarScene.getLodStats();
      return { dist: `${s.high}/${s.mid}/${s.low}`, fading: s.fading };
    });
    const same = last !== null && last.dist === cur.dist && cur.fading === 0;
    stable = same ? stable + 1 : 0;
    last = cur;
    if (stable >= stableSamples) {
      return { ...cur, waitedMs: Date.now() - start, timedOut: false };
    }
  }

  return {
    dist: last?.dist ?? 'unknown',
    fading: last?.fading ?? -1,
    waitedMs: Date.now() - start,
    timedOut: true,
  };
}

/** #1219 — DOM 숨김 스타일 적용 후 다음 페인트 여유 (ms). `verify:675-glow-marker` 가 쓰던 값. */
export const DOM_OVERLAY_POST_HIDE_WAIT_MS = 200;

/** #1219 — 캔버스만 남기고 DOM 을 숨기는 스타일. `visibility` 라 레이아웃 박스가 보존된다. */
export const DOM_OVERLAY_HIDE_CSS =
  'body * { visibility: hidden !important; } canvas { visibility: visible !important; }';

/**
 * #1219 (a) · #1228 B1 — 캔버스 외 DOM 을 `visibility: hidden` 으로 숨긴다.
 *
 * `canvas.screenshot()` (Playwright element 캡처) 는 **element 의 화면 영역**을 찍으므로 그 위에
 * 겹친 DOM (TopBar · TimeBar · HUD 코너 · 토스트) 이 함께 찍힌다.
 *  - #1219: luminance cluster 계수가 천체가 아니라 UI 텍스트를 세고 있었다 (`verify:675`).
 *  - #1228 B1: `verify:1119` `MODE=lod` 의 「주입 전후 diff」 에 `apps/web/src/components/ui/satellite-zoom-tooltip.tsx`
 *    토스트 (focus `1500ms` 뒤 등장 · `5000 + 200ms` 뒤 소멸) 가 섞여, 마스크가 꺼진 결함 판에서도
 *    diff 가 `> 0` 이 되는 fail-open 이 났다.
 *
 * `visibility: hidden` 을 쓴다 — **레이아웃 박스를 보존**하므로 캔버스 기하가 그대로다
 * ([실측 #1219 reviewer] 숨김 전/후 `canvas.width×height` · `getBoundingClientRect` 둘 다
 * `1280×720` 불변, `getLodStats` `0/0/32 fading=0` 불변). `display: none` 은 박스가 `0×0` 이 되어
 * element 캡처가 타임아웃한다 (#1219 실측).
 *
 * 위 셀렉터는 스코프가 없어 페이지의 **모든** 캔버스를 되살린다. HUD 에 캔버스 (미니맵·성능 그래프
 * 등) 가 하나 생기면 닫은 오염 축이 **조용히** 재개통된다 — 값만 커지고 FAIL 이 아니다. 셀렉터를
 * 특정 id 로 좁히는 대신 **개수 단언**을 둔다: 개수 단언은 전제가 깨지는 순간 시끄럽게 깨진다
 * (#1219 권고 1, fail-fast).
 *
 * @param {import('playwright').Page} page
 * @param {number} [options.postHideWaitMs] 스타일 적용 후 대기 (기본 `DOM_OVERLAY_POST_HIDE_WAIT_MS`)
 * @returns {Promise<{canvasCount: number}>}
 * @throws 캔버스가 정확히 1개가 아니면
 */
export async function hideDomOverlays(page, options = {}) {
  const postHideWaitMs = options.postHideWaitMs ?? DOM_OVERLAY_POST_HIDE_WAIT_MS;
  await page.addStyleTag({ content: DOM_OVERLAY_HIDE_CSS });
  await page.waitForTimeout(postHideWaitMs);
  const canvasCount = await page.evaluate(() => document.querySelectorAll('canvas').length);
  if (canvasCount !== 1) {
    throw new Error(
      `[hideDomOverlays] 캔버스가 ${canvasCount}개다 (기대 1). 'canvas { visibility: visible }' 가 ` +
        '캡처 대상 밖 캔버스까지 되살려 판정량을 오염시킨다 — 셀렉터를 캡처 대상으로 좁히고 본 단언을 갱신하라.',
    );
  }
  return { canvasCount };
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
