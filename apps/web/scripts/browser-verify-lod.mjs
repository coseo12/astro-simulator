#!/usr/bin/env node
/**
 * LOD 9조합 **렌더 스모크 테스트** — 3 tier × 3 LOD 가 전부 실제로 서는지 확인한다.
 *
 * 사용:
 *   BASE_URL=http://localhost:3002 node apps/web/scripts/browser-verify-lod.mjs
 *   pnpm verify:lod            # BASE_URL 미지정 시 http://localhost:3000
 *
 * ## 이 가드가 지키는 것 — 구조적 FAIL 경로 5개 (#1127)
 *
 * | # | 경로            | FAIL 조건                                                |
 * |---|-----------------|----------------------------------------------------------|
 * | 1 | 씬 미노출       | `__solarScene` / `__simCore` / `__simStore` 전역 부재      |
 * | 2 | focus 실패      | `focusOn` 후 `selectedBodyId` 가 요청 body 와 불일치        |
 * | 3 | tier 실패       | `getTier()` 가 조합이 요구하는 tier 와 불일치              |
 * | 4 | LOD 미적용      | `setLodOverride` 후 `getLodStats().override` 가 요청과 불일치 |
 * | 5 | viewport 불일치 | 스크린샷 픽셀 크기 ≠ 선언된 `VIEWPORT`                      |
 *
 * 5개 전부 **주입 시 exit 1 / 정상 시 exit 0** 을 실증한 뒤 CI 에 배선했다 (#1127 PR 본문 §판별력
 * 실증). 「테스트가 있다 ≠ 그 테스트가 작동한다」(#1123) 를 배선 조건으로 삼는다.
 *
 * ⚠️ **DoD 재조정 박제 (CLAUDE.md §스프린트 계약 7)** — #1127 계약의 완료 기준 2 는 원래
 * **「구조 FAIL 경로 4개만 assert」** 였고 경로 4(LOD)가 없었다. PR #1143 reviewer 가 *"가드가 자기
 * 이름으로 내건 축(LOD)에 판정이 없다 — 9 조합이 내는 서로 다른 판정은 `3`개"* 로 적발했고,
 * **사용자 재합의로 5경로로 확장**했다. 되돌림이 가상이 아니라는 근거: 부트스트랩 기본 쿼리가
 * `/?gpu=a&lod=auto` 라 늦게 도착한 `setLodOverride('auto')` 가 앞선 강제값을 덮은 실측이
 * `sim-canvas.tsx` §#680 에 박제돼 있다 (`low@1059ms → auto@1272ms`). 지금은
 * `BOOTSTRAP_SETTLE_MS` 가 그 창을 덮지만 **못 덮는 날 조용히 PASS** 한다.
 *
 * ⚠️ **2번은 `command()` 가 throw 하지 않아도 FAIL 한다.** `SimulationCore` 의 `focusOn` 은
 * R-Phase allowlist 밖 body 를 `console.warn` + `break` 로 **조용히 기각**하므로 (`simulation-core.ts`
 * §focusOn), try/catch 만으로는 눈이 먼다. 그래서 store 왕복(`selectedBodyId`)을 판정에 쓴다.
 *
 * ⚠️ **4번도 같은 이유로 「호출했다」가 아니라 「반영됐다」를 읽는다.** `simulation-core.ts` 의
 * `case 'setLodOverride'` 는 핸들러를 `?.` 로 부르므로 **미등록이면 조용히 no-op** 이다.
 *
 * ### 축 일관성 — 2·4번 모두 **앱 경로**(`__simCore.command`)로 명령한다 (PR #1143 권고 1 판정)
 *
 * 초판은 focus 만 앱 경로였고 LOD 는 `__solarScene.setLodOverride` 를 **직접** 불러
 * `sim-canvas.tsx` 의 `resolveLodWithTierForce` 배선을 통째로 우회했다. 즉 command 라우팅 /
 * 핸들러 등록 회귀를 못 봤다. 앱 경로로 통일해 그 대역을 회수한다.
 *
 * 앱 경로를 거쳐도 **판정은 결정론적**이다 — `resolveLodWithTierForce` 의 치환 조건은
 * `level === 'auto'` 이고 본 매트릭스는 `high|mid|low` 만 쓰므로 치환이 발동하지 않는다
 * (`?lod=` 미지정 + tier-c 강제 여부와 무관하게 요청 레벨이 그대로 통과).
 *
 * ## 이 가드가 지키지 **않는** 것 — 픽셀 회귀 전부 (#1122 → #1127)
 *
 * 구판은 baseline PNG 9장 대비 `max pixel diff < 15%` 를 판정에 썼다. 그 임계는 **측정으로
 * 반증됐다** — 아래는 전부 커밋된 산출물로 재현 가능한 사실이다 (#1122, PR #1126).
 *
 *   | 회귀 클래스                         | 실측 frame 대비 diff | 임계 `15%` |
 *   | 표면(텍스처·셰이더) 전면 교체       | disk 면적 지분이 상한 | 미달       |
 *   | LOD 레벨 전면 교체                  | 최대 `3.54%`          | 미달       |
 *   | 카메라/tier 가 통째로 엉뚱한 곳     | `0.48~4.44%`          | 미달       |
 *   | **화면 전체 검정 (파국적 렌더 실패)** | `0.52~4.25%`          | **미달**   |
 *
 * 마지막 줄이 성격을 가장 잘 보여준다 — 우주 배경이 대부분 검정이라 **렌더가 통째로 죽어도 프레임
 * 대비 diff 는 임계에 닿지 않는다.** 임계를 낮추는 것으로는 닫히지 않는다: `diskR` 이 비결정적이라
 * 관측 스프레드만 `1.4~5.4%` 이고 (로컬 GPU, 메인 2회 + reviewer 4회) 그 대역이 위 표와 겹친다.
 * **프레임 대비 diff 라는 지표 자체**가 구조적으로 둔감한 것이지 상수 하나가 틀린 게 아니다.
 * 지표 교체(disk 기준 / SSIM 등)는 baseline 재캡처 + 설계가 선행이라 비용 계급이 다르고, 본
 * 스크립트의 범위 밖이다.
 *
 * ⇒ **픽셀 회귀는 다른 가드가 담당한다.** 표면은 지대별 verify
 * (`browser-verify-1119-earth-mask.mjs` / `browser-verify-783-earth-detail.mjs`), 셰이더 산출은
 * `shader-pixel-guard.yml`, 상단 UI 는 `r1-ui-regression-guard.mjs`. 본 가드는 그것을 지키는
 * 척하지 않는다.
 *
 * ⚠️ **위 표의 4행이 축소 후에도 그대로 사각이라는 뜻은 아니다** — 「카메라/tier 오위치」는 경로
 * 3 이, 「LOD 레벨 전면 교체」는 경로 4 가, 「씬이 아예 안 선다」는 경로 1 이 잡는다.
 *
 * **남는 사각 (전건 열거)**:
 *
 *  1. **구조는 전부 정상인데 픽셀만 틀린 경우** — 전역도 focus 도 tier 도 override 도 viewport 도
 *     맞는데 화면이 검거나 표면이 뒤바뀐 상태. 스크린샷을 캡처하지만 **내용을 판정하지 않는다.**
 *  2. **콘솔 에러** — 수집해서 개수와 내용을 찍지만 **판정하지 않는다.** `hasSimErrors(…, {
 *     allowExternal: true })` 로 승격하면 위 1번의 상당 부분을 비-픽셀 축으로 덮을 수 있다
 *     (PR #1143 권고 3). 실측상 채택해도 안전하다 — 로컬·CI(run `32582032287`) 양쪽에서 수집된
 *     콘솔 에러가 `0` 이다. **그럼에도 채택하지 않은 이유는 계약이다**: 사용자 재합의는 경로 4
 *     (LOD) 에 한정됐고, 판정 축을 하나 더 늘리는 것은 또 한 번의 계약 확장이다. 후속 분리.
 *  3. **body 별 LOD 레벨** — 경로 4 는 `getLodStats().override` (씬 전역 요청값) 를 읽는다.
 *     `getLodInfo()` 의 per-body `level` 까지 보면 더 강하지만 `#546` 위성 가드 후처리 예외가
 *     있어 술어가 예외를 안고 간다. 예외 없는 술어를 택했다.
 *
 * ## baseline PNG 9장 처분 — **전량 삭제** (#1127 §쟁점)
 *
 * 임계 판정을 없애면 `apps/web/scripts/__baselines__/lod-*.png` 를 **소비하는 판정자가 없다.**
 * 「보조 지표로 출력」 안을 택하지 않은 근거 셋:
 *
 *  1. **판정 무관 숫자를 출력에 남기면 근거로 오독된다** — 구판 `diskDiffPct` 가 "판정에 쓰지
 *     않는다" 를 주석에 적고도 그 선례를 만들었다.
 *  2. **baseline 자신이 매트릭스를 담고 있지 않다** — mid↔low 는 3 tier 전부 `0.01%` 로, 9장 중
 *     3장은 독립 정보가 없다 (#1122 실측).
 *  3. **`ff4e88d` (2026-04-24) 이후 4개월 stale** 이라 그 사이 들어간 시각 변경(#756 · #773 ·
 *     #782 · #783 · #738 · #1119) 이 전부 "차이" 로 계상된다.
 *
 * 시각 기록이 사라지지는 않는다 — (a) 삭제본은 `ff4e88d` 에서 그대로 복원 가능하고, (b) 본
 * 스크립트가 매 실행 9장을 `.verify-screenshots/lod-smoke/` 에 남긴다 (gitignored 산출물).
 * 없어지는 것은 **커밋된 2026-04-24 스냅샷** 뿐이고 그것이 정확히 stale 한 대상이다.
 * (#909 가 이 9장을 "스크립트가 소비하므로 유지" 로 판정했던 근거는 본 PR 로 소멸한다.)
 *
 * ## 안정화 대기 — `state.transitioning` flag 부재 대안
 *
 * scene 전역에 `state.transitioning` 은 노출돼 있지 않다. `tier-transition.ts` 의
 * `runTierTransition` 이 camera.radius 300ms dolly + 500ms 입력 잠금이므로 tier 변경 후
 * **1200ms** (300 + 500 + 400 margin) 대기한다. LOD override 는 mesh 교체가 즉시 반영되나 200ms
 * cross-fade 가 있어 **400ms** 대기. 향후 `state.transitioning` 을 정식 export 하면 polling 대기로
 * 개선 가능하다.
 *
 * ## headless 한계
 *
 * headless swiftshader 는 3D/shader 경로에서 partial freeze 가능성이 있다 (volt #33). 본
 * 스크립트는 **구조 판정만** 하므로 렌더 품질은 보증 대상이 아니며, 시각 검증은 실 Chrome 수동
 * 체크리스트가 담당한다.
 */
import {
  bootstrapScene,
  buildLaunchOptions,
  collectConsoleErrors,
  resolveBaseUrl,
  saveCapture,
  withBrowser,
} from '../../../scripts/browser-verify-utils.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE_URL = resolveBaseUrl();

const __dirname = dirname(fileURLToPath(import.meta.url));
const captureDir = join(__dirname, '..', '..', '..', '.verify-screenshots', 'lod-smoke');

/** 캡처 해상도 계약. 스크린샷 픽셀 크기가 이 값과 다르면 FAIL 한다 (경로 5). */
const VIEWPORT = { width: 1280, height: 800 };

/** tier 전환 안정화 (300ms dolly + 500ms lock + 400ms margin). */
const TIER_SETTLE_MS = 1200;
/** LOD override 안정화 (200ms cross-fade + margin). */
const LOD_SETTLE_MS = 400;
/** 씬 부트스트랩 후 추가 안정화. */
const BOOTSTRAP_SETTLE_MS = 2000;

/** 9 조합 매트릭스. */
const COMBOS = [
  { tier: 'solar', lod: 'high' },
  { tier: 'solar', lod: 'mid' },
  { tier: 'solar', lod: 'low' },
  { tier: 'inner', lod: 'high' },
  { tier: 'inner', lod: 'mid' },
  { tier: 'inner', lod: 'low' },
  { tier: 'body', lod: 'high' },
  { tier: 'body', lod: 'mid' },
  { tier: 'body', lod: 'low' },
];

/**
 * tier 별 focus body id — **전부 `tierFromFocus` 가 그 tier 를 반환하는 kind** 로 고른다.
 * FocusQuickButtons 는 sun/earth/jupiter/neptune 4개만 노출하므로 `__simCore.command` 로 직접
 * 호출한다.
 *
 *  - solar ← `sun` (kind=star → 무조건 `solar`)
 *  - inner ← `mars` (kind=planet, focus-entry 정착 거리 `0.16 AU` > 경계 `0.1 AU` → `inner`)
 *  - body  ← `moon` (kind=moon → 무조건 `body`)
 *
 * ⚠️ **구판은 `earth` focus + `setTier('body')` 강제였고, 그것은 성립하지 않았다.** planet
 * focus-entry 는 `× 5` 프레이밍으로 `0.21 AU` 에 정착해 **inner 가 의도된 계약**이고 (#834 /
 * `tier.ts` §PLANET_FOCUS_BODY_BOUNDARY), 매 프레임 `updateTierByCamera` 가 강제 tier 를 즉시
 * `inner` 로 되돌린다. 구판은 `solar` 행만 tier 를 assert 했으므로 이 되돌림을 **한 번도 보지
 * 못했다** — 즉 커밋돼 있던 `lod-body-*.png` 3장은 실제로는 `inner` tier 캡처다 (본 PR 실측:
 * `getTier()=inner, 요구=body` 3/3). kind 로 tier 를 얻으면 강제도 되돌림도 없다.
 */
const TIER_FOCUS_BODY = {
  solar: 'sun',
  inner: 'mars',
  body: 'moon',
};

/** 조합이 요구하는 tier (경로 3 판정) — 위 focus kind 로 결정론적이라 전부 단일 값이다. */
const TIER_EXPECT = {
  solar: 'solar',
  inner: 'inner',
  body: 'body',
};

/** PNG IHDR 에서 폭/높이를 읽는다 (시그니처 8B + 길이 4B + 타입 4B → width@16, height@20). */
function readPngSize(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) {
    throw new Error('[verify:lod] 스크린샷이 PNG 가 아니다 — 캡처 경로 회귀');
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const results = [];
const consoleErrors = [];

// #940 — 브라우저 수명주기는 `withBrowser` 에 위임한다 (에러 경로 close 보장). 콜백 안에서
//   `process.exit` 하면 finally 가 실행되지 않으므로, 조기 종료는 sentinel 반환 + 호출부 종료다.
const outcome = await withBrowser(buildLaunchOptions(), async (browser) => {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  collectConsoleErrors(page, { errors: consoleErrors });

  console.log('\n[verify:lod] LOD 9조합 렌더 스모크 테스트');
  console.log(`baseUrl: ${BASE_URL}`);
  console.log(`viewport: ${VIEWPORT.width}x${VIEWPORT.height}\n`);

  // 경로 1 — 씬 미노출. `bootstrapScene` 의 전역 대기가 타임아웃하면 그것이 곧 이 경로다.
  //   throw 를 그대로 올리지 않고 명시 FAIL 로 바꾸는 이유는 진단 문구를 남기기 위함이며,
  //   판정은 바뀌지 않는다 (양쪽 다 exit 1).
  try {
    await bootstrapScene(page, {
      baseUrl: BASE_URL,
      handles: ['__solarScene', '__simCore', '__simStore'],
      settleMs: BOOTSTRAP_SETTLE_MS,
    });
  } catch (error) {
    console.error(
      '[FAIL] 씬 전역 미노출 (__solarScene / __simCore / __simStore) — ' +
        `dev 빌드 아님 또는 초기화 실패: ${error?.message ?? error}`,
    );
    return 'scene-not-ready';
  }

  for (const combo of COMBOS) {
    const result = await runCombo(page, combo);
    results.push(result);
    console.log(`  [${result.pass ? 'PASS' : 'FAIL'}] ${result.combo}: ${result.reason}`);
  }
  return 'ran';
});

if (outcome === 'scene-not-ready') process.exit(1);

/**
 * 한 조합을 세운 뒤 5개 구조 경로를 판정한다 (경로 1 은 부트스트랩에서 이미 통과).
 *
 * @param {import('playwright').Page} page
 * @param {{ tier: string, lod: string }} combo
 * @returns {Promise<{ combo: string, pass: boolean, reason: string }>}
 */
async function runCombo(page, combo) {
  const key = `${combo.tier}-${combo.lod}`;
  const focusBodyId = TIER_FOCUS_BODY[combo.tier];

  // 경로 2 — focus. `command` 는 allowlist 기각 시에도 throw 하지 않으므로 store 왕복으로 판정한다.
  await page.evaluate((bodyId) => {
    window.__simCore.command({ type: 'focusOn', bodyId });
  }, focusBodyId);
  await page.waitForTimeout(TIER_SETTLE_MS);

  const selectedBodyId = await page.evaluate(
    () => window.__simStore?.getState?.().selectedBodyId ?? null,
  );
  if (selectedBodyId !== focusBodyId) {
    return {
      combo: key,
      pass: false,
      reason: `focus 실패 — selectedBodyId=${String(selectedBodyId)} ≠ ${focusBodyId}`,
    };
  }

  // 경로 3 — tier. focus kind 가 tier 를 결정하므로 강제 전환 없이 결과만 확인한다.
  const actualTier = await page.evaluate(() => window.__solarScene?.getTier?.() ?? null);
  const expected = TIER_EXPECT[combo.tier];
  if (actualTier !== expected) {
    return {
      combo: key,
      pass: false,
      reason: `tier 실패 — getTier()=${String(actualTier)}, 요구=${expected}`,
    };
  }

  // 경로 4 — LOD. 명령은 **앱 경로**(`__simCore.command`)로 보낸다 — scene 직접 호출은
  //   `sim-canvas.tsx` 의 `setLodOverrideHandler` 배선을 우회해 command 라우팅 회귀를 못 본다.
  //   핸들러 미등록이면 `simulation-core.ts` 가 `?.` 로 조용히 no-op 하므로, 「호출했다」가 아니라
  //   `getLodStats().override` 로 **반영됐다**를 읽어야 판별력이 생긴다 (PR #1143 🔴).
  await page.evaluate((level) => {
    window.__simCore.command({ type: 'setLodOverride', level });
  }, combo.lod);
  await page.waitForTimeout(LOD_SETTLE_MS);

  const actualOverride = await page.evaluate(
    () => window.__solarScene?.getLodStats?.().override ?? null,
  );
  if (actualOverride !== combo.lod) {
    return {
      combo: key,
      pass: false,
      reason: `LOD 미적용 — getLodStats().override=${String(actualOverride)}, 요구=${combo.lod}`,
    };
  }

  // 경로 5 — viewport. 캡처 해상도 계약이 깨지면 (DPR / hardware scaling / context 옵션 회귀)
  //   이후 어떤 픽셀 측정도 좌표계가 어긋나므로 여기서 끊는다.
  const screenshot = await page.screenshot({ type: 'png', fullPage: false });
  await saveCapture(screenshot, join(captureDir, `lod-${key}.png`));
  const size = readPngSize(screenshot);
  if (size.width !== VIEWPORT.width || size.height !== VIEWPORT.height) {
    return {
      combo: key,
      pass: false,
      reason: `viewport 불일치 — 스크린샷 ${size.width}x${size.height} ≠ 선언 ${VIEWPORT.width}x${VIEWPORT.height}`,
    };
  }

  return {
    combo: key,
    pass: true,
    reason: `tier=${actualTier} override=${actualOverride} 렌더 성립`,
  };
}

// 최종 리포트.
console.log('\n========================================');
console.log('[verify:lod] LOD 9조합 렌더 스모크 결과');
console.log('----------------------------------------');
const passCount = results.filter((r) => r.pass).length;
const failCount = results.length - passCount;
console.log(`  pass: ${passCount}/${results.length}`);
console.log(`  fail: ${failCount}`);
console.log(`  스크린샷: ${captureDir} (gitignored — 판정에 쓰지 않는 진단 산출물)`);
console.log(`  콘솔 에러: ${consoleErrors.length}건 (비판정 — §지키지 않는 것 2번)`);

// 콘솔 에러는 **판정하지 않는다** — 판정 축은 위 5개뿐이다. 실패 진단용으로만 찍는다.
if (consoleErrors.length > 0) {
  console.log('\n[console errors — 비판정 진단]');
  for (const err of consoleErrors) console.log(`  - ${err}`);
}

// 공허 통과 차단 (PR #1143 권고 2) — 루프가 조기 이탈하거나 매트릭스가 비면 `failCount` 가 `0` 이
//   되어 **아무것도 검사하지 않고 PASS** 한다. 출력의 조합 수와 실제 결과 수가 서로를 검증하도록
//   개수를 대조한다 (#1123 / #1134 와 같은 계급 — 「전건 통과」가 공허 참이던 사례).
if (results.length !== COMBOS.length) {
  console.error(
    `\n[FAIL] 결과 수 불일치 — results ${results.length} ≠ COMBOS ${COMBOS.length}` +
      ' (루프 조기 이탈 또는 매트릭스 소실)',
  );
  process.exit(1);
}

if (failCount > 0) {
  console.error('\n[FAIL] 1개 이상 조합이 구조 경로에서 실패');
  process.exit(1);
}
console.log(`\n[PASS] ${COMBOS.length} 조합 전체 렌더 성립\n`);
