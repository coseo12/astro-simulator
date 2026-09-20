/**
 * #1234 C3 — **어댑터 미결 주입** 회귀 가드.
 *
 * ## 왜 이 가드가 있는가
 *
 * 본 이슈의 결함은 `navigator.gpu.requestAdapter()` 가 settle 하지 않는 것이고, 자연 발생
 * 빈도가 **약 40 %** 였다 (C1 CI 수집 5회 중 2회 FAIL). 그 확률에 기대는 검증은 「통과」가
 * 증거가 되지 못한다 — 60 % 는 결함이 있어도 통과하기 때문이다. 그래서 여기서는 결함
 * 시나리오를 **결정적으로 만든다**: 페이지 로드 전에 `requestAdapter` 를 영영 미결인 함수로
 * 바꿔치기하고, 그 상태에서 장면이 뜨는지를 묻는다.
 *
 * - **처방 전** — `__solarScene` 이 영영 노출되지 않아 `bootstrapScene` 의 핸들 대기 20 s 에서
 *   FAIL 한다. 즉 이 가드는 **결함 판본에서 실제로 실패한다** (판별력이 곧 존재 이유다).
 * - **처방 후** — 상한(`GPU_ADAPTER_TIMEOUT_MS`)에서 WebGPU 미지원으로 폴백해 WebGL2 로 장면이
 *   뜬다. 그때 `window.__bootPhases` 에 **타임아웃 마크**가 남아 있어야 한다 — 마크 없이 통과
 *   하면 주입이 안 먹은 것이므로 **그것도 FAIL 이다** (양성 대조군).
 *
 * ## 판정 (전건 AND)
 *
 *  S1  주입이 실제로 먹었다 — 이름이 `-timeout` 으로 끝나는 마크가 스냅샷에 **하나 이상** 있다
 *      (주입 경로에서는 `gpu:adapter-timeout` · `engine:probe-adapter-timeout` 둘 다 나온다).
 *      없으면 결함 시나리오를 재현하지 못한 것이므로 통과가 무의미하다 → FAIL.
 *  S2  그 상태에서 `__solarScene` 이 노출된다 (= 장면이 뜬다).
 *  S3  엔진이 WebGL2 로 폴백했다 (`__simCore.rendererKind`).
 *  S4  콘솔 **에러** 0 (폴백은 경고이지 오류가 아니다).
 *  S5  주입 없이도 같은 페이지가 뜬다 — 대조군. 가드가 「주입했을 때만」이 아니라
 *      「평소에도」 통과함을 같은 실행에서 확인한다.
 *
 * ## 환경
 *
 *   SWIFTSHADER=1 HEADFUL=0 BASE_URL=http://localhost:3001 \
 *     pnpm --filter @astro-simulator/web run verify:1234-adapter-stall
 *
 * `window.__bootPhases` 는 dev 빌드 전용 전역이라 (apps/web `boot-phases.ts` §계약) 이 가드는
 * `next dev` 서버를 전제한다 — `shader-pixel-guard` 의 다른 가드와 같은 전제다.
 */

import {
  bootstrapScene,
  collectConsoleErrors,
  hasSimErrors,
  launchBrowser,
  resolveBaseUrl,
  withBrowser,
} from '../../../scripts/browser-verify-utils.mjs';

const BASE_URL = resolveBaseUrl();
const SWIFTSHADER = process.env.SWIFTSHADER === '1';

/** 장면 부팅 대기 한계 — `shader-pixel-guard` 가 실제로 쓰는 값과 같아야 의미가 있다. */
const HANDLE_TIMEOUT_MS = 20_000;

/** 주입 페이지 쿼리. 1215/1226 과 같은 결정적 파라미터 (`speed=0` 은 쓰지 않는다 — 부팅만 본다). */
const QUERY = '/?gpu=a&lod=auto&rotate=off&orbits=off';

/**
 * `requestAdapter` 를 영영 미결로 만든다 (페이지 스크립트 실행 **전**에 주입).
 *
 * 실패 표본에서 미결이었던 호출 지점은 `gpu/capability.ts` 와 `engine/engine-factory.ts`
 * **둘 다**였다. 둘은 같은 `navigator.gpu.requestAdapter` 를 부르므로 이 한 줄의 바꿔치기가
 * 두 지점을 동시에 재현한다 — 실제 표본의 형태와 같다.
 */
const STALL_INIT_SCRIPT = () => {
  const gpu = navigator.gpu;
  if (!gpu) {
    // 이 환경엔 WebGPU 자체가 없다. 주입할 대상이 없으므로 아래 S1 이 실패하고, 그 실패가
    // 「가드가 무의미했다」를 드러낸다 — 조용히 통과시키지 않는다.
    return;
  }
  Object.defineProperty(gpu, 'requestAdapter', {
    configurable: true,
    writable: true,
    value: () => new Promise(() => {}),
  });
};

/** 스냅샷에서 마크 이름만 뽑는다. */
async function readPhaseNames(page) {
  return page.evaluate(() => {
    const snapshot = window.__bootPhases;
    if (!snapshot) return null;
    return snapshot.phases.map((p) => p.name);
  });
}

async function readRendererKind(page) {
  return page.evaluate(() => {
    const core = window.__simCore;
    return core && typeof core.rendererKind === 'string' ? core.rendererKind : null;
  });
}

const results = [];
const record = (id, ok, detail) => {
  results.push({ id, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`);
};

const run = async (browser) => {
  // ── 주입 페이지 ───────────────────────────────────────────────────────────
  console.log('[1234] 주입 페이지 — requestAdapter 를 영영 미결로 바꾼다');
  const stallCtx = await browser.newContext();
  const stallPage = await stallCtx.newPage();
  const stallErrors = collectConsoleErrors(stallPage);
  await stallPage.addInitScript(STALL_INIT_SCRIPT);

  let booted = true;
  let bootError = null;
  try {
    await bootstrapScene(stallPage, {
      baseUrl: BASE_URL,
      query: QUERY,
      label: 'STALL',
      handleTimeout: HANDLE_TIMEOUT_MS,
    });
  } catch (error) {
    booted = false;
    bootError = String(error?.message ?? error);
  }

  // S1 먼저 본다 — 주입이 안 먹었다면 S2 의 성공은 아무것도 증명하지 않는다.
  const stallPhases = (await readPhaseNames(stallPage)) ?? [];
  const timeoutMarks = stallPhases.filter((n) => n.endsWith('-timeout'));
  record(
    'S1 주입 성립 (타임아웃 마크 존재)',
    timeoutMarks.length > 0,
    timeoutMarks.length > 0
      ? `marks=[${[...new Set(timeoutMarks)].join(', ')}]`
      : `타임아웃 마크 0 — 마지막 마크=${stallPhases.at(-1) ?? '(없음)'} · 총 ${stallPhases.length}개`,
  );

  record(
    'S2 미결 주입에도 장면이 뜬다',
    booted,
    booted ? `__solarScene 노출 (한계 ${HANDLE_TIMEOUT_MS}ms)` : `부팅 실패 — ${bootError}`,
  );

  const rendererKind = booted ? await readRendererKind(stallPage) : null;
  record(
    'S3 WebGL2 폴백',
    rendererKind === 'webgl2',
    `rendererKind=${rendererKind ?? '(읽기 실패)'}`,
  );

  record(
    'S4 콘솔 에러 0',
    !hasSimErrors(stallErrors),
    `errors=${stallErrors.length}${stallErrors.length ? ` · 예: ${stallErrors[0]}` : ''}`,
  );

  await stallCtx.close();

  // ── 대조군 (주입 없음) ────────────────────────────────────────────────────
  console.log('[1234] 대조군 — 주입 없이 같은 페이지');
  const plainCtx = await browser.newContext();
  const plainPage = await plainCtx.newPage();
  let plainBooted = true;
  let plainError = null;
  try {
    await bootstrapScene(plainPage, {
      baseUrl: BASE_URL,
      query: QUERY,
      label: 'PLAIN',
      handleTimeout: HANDLE_TIMEOUT_MS,
    });
  } catch (error) {
    plainBooted = false;
    plainError = String(error?.message ?? error);
  }
  const plainPhases = (await readPhaseNames(plainPage)) ?? [];
  const plainTimeouts = plainPhases.filter((n) => n.endsWith('-timeout'));
  record(
    'S5 대조군도 뜨고, 상한은 발화하지 않는다',
    plainBooted && plainTimeouts.length === 0,
    plainBooted ? `타임아웃 마크 ${plainTimeouts.length}개` : `부팅 실패 — ${plainError}`,
  );
  await plainCtx.close();
};

await withBrowser({ gpu: SWIFTSHADER ? 'swiftshader' : 'default' }, run, {
  launch: launchBrowser,
});

const failed = results.filter((r) => !r.ok);
console.log(
  `\n[1234] ${results.length - failed.length}/${results.length} PASS` +
    (failed.length ? ` — 실패: ${failed.map((r) => r.id).join(', ')}` : ''),
);
process.exit(failed.length === 0 ? 0 : 1);
