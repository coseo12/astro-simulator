#!/usr/bin/env node
/**
 * #675 — glow pixel marker 회귀 가드.
 *
 * ADR `docs/decisions/20260613-675-glow-pixel-marker.md` §축 6 (헤드리스/CI 가드).
 *
 * 검증 매트릭스:
 *   1. 식별 천체 카운트 (40 AU / 100 AU): default (glow ON) − `?marker=off` 의 luminance
 *      cluster 증가분 ≥ 프리뷰 실측 기준 (40 AU +10 / 100 AU +11). 궤도선은 luminance 오염원이라
 *      측정 전 OFF (R10a qa 선례 — 궤도선 lum 오염 분리 샘플링).
 *   2. `?marker=off` 격리: low variant (`<id>-lod-low`) 전수 scaling=1 (glow 역보정 무적용 —
 *      기존 동작 100% 보존. scene 통합 검증을 본 스크립트가 담당 — 기존 NullEngine 회피 컨벤션).
 *   3. off-frustum 가드: glow ON 에서 lodInfo.pxDiameter ≤ 0 (화면 밖) body 의 low variant
 *      scaling=1 유지 (marker 부재 — ADR §축 4 fail-safe).
 *   4. 전수 발동: 100 AU 에서 lodInfo.pxDiameter > 0 + level='low' body 전수 scaling > 1.
 *   5. 하위 호환: `?marker=glow` 명시 = default (미지정) 와 식별 천체 카운트 동일.
 *   6. #677 — tier-c LOD override race 가드: GPU capability 감지 (requestAdapter) 를 의도 지연해
 *      race-lost 방향 (scene 초기화가 감지보다 먼저 완료) 을 결정론 재현해도 tier-c 강제 LOD 'low'
 *      가 정착하는지 검증. 회귀 시 override 'auto' 영구 잔존 → sun high + mid sphere 렌더 →
 *      CI fps-baseline-guard flaky FAIL (develop push 27412497611 desktop 28.1 FPS 선행 사례).
 *
 * 사용법:
 *   node apps/web/scripts/browser-verify-glow-marker.mjs
 *   BASE_URL=http://localhost:3000 node apps/web/scripts/browser-verify-glow-marker.mjs
 *   CAPTURE_DIR=docs/reports node ...  # 캡처 PNG 저장 (PR 박제용 — 미지정 시 저장 생략)
 *
 * dev 빌드 의존: `window.__solarScene` / `window.__simStore` / `window.__simCore` (sim-canvas.tsx).
 * `?gpu=a` 고정 — headless GPU adapter 부재 시 tier-c LOD low 아티팩트 함정 회피 (R7 선례).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * #1219 — 항목 1·5 의 **측정 경로** 결정화 (임계 `EXPECTED_DELTA` 는 무변경).
 *
 * 2026-08-23 (PR #1145) 과 2026-09-12 (PR #1218) 에 같은 커밋이 40 AU 증가분 경계에서 갈렸다
 * (`+9` < `+10` → rerun 통과). 앱 diff `0` 행이라 회귀가 아니라 **판정량의 산포**였다.
 *
 * [실측] 착수 시점 판본 (`cb96191`) 을 로컬에서 N=10 반복해 축을 단독 개입으로 갈랐다
 * (macOS 26.6.2 · Apple M1 Pro · Playwright headless chromium · `next dev` · 1280×720).
 * 원인은 **둘**이고, `#1146` 이 `verify:756-surface` 에서 확정한 자전 위상 축은 **여기서는 아니다**:
 *
 *   (a) **DOM HUD 오버레이가 판정량에 섞여 있었다** — `canvas.screenshot()` 은 element **영역**을
 *       캡처하므로 캔버스 위에 겹친 DOM (TimeBar 배속 버튼 · TopBar · HUD 코너) 의 **글자 글리프가
 *       luminance cluster 로 세어진다**. 단독 개입 실측: `?marker=off` 40 AU 카운트가 착수 전 판본
 *       `131~134` → **DOM 숨김만 추가하면 `2` 고정**. 즉 세던 것의 거의 전부가 UI 텍스트였다.
 *       글리프가 page load 마다 갈려 (`1M` 이 1 cluster 이기도 2 cluster 이기도) ±2 이봉을 만든다 —
 *       같은 페이지 안에서 3회 재캡처하면 항상 동일하므로 프레임 축이 아니라 **page load 축**이다.
 *
 *       ⚠️ **그런데 글리프는 증가분에서 상쇄된다** — 임계를 건드리지 않은 근거다. [실측 reviewer]
 *       HUD 만 따로 캡처하면 두 모드가 **완전히 동일**하다 (`default` = `off` = `136` cluster ·
 *       `5971` px). 같은 표본에서 구프레임 증가분 `149 − 138 = 11` 과 신프레임 `14 − 3 = 11` 이
 *       일치한다. 즉 DOM 오염은 증가분의 **기댓값을 옮기지 않았고 산포만 실었다**. 임계
 *       `+10`/`+11` 의 출처 실측이 오염 프레임에서 나왔더라도 그 값은 그대로 유효하다.
 *   (b) **sim 시각이 계속 흐른다** — 기본 배율 `86_400` (초당 1일) + pause 부재라 로드·대기 편차가
 *       궤도 위상 편차로 번역된다. 항목 5 주석이 2026-06-13 에 이미 관측해 둔 축이다.
 *
 * 대응: (a) 캡처 직전 캔버스 외 DOM 숨김 (`hideDomOverlays`) / (b) `T_JD` 고정 + `pause` +
 * `waitForLodSettle` (상수 대기가 아니라 정착 확인). `?rotate=off` · `?orbits=off` 는 **넣지 않았다**
 * — 단독 개입 N=10 에서 `rotate=off` 는 산포를 못 줄였고 (base 와 동일), JD 고정 뒤에는 자전각도
 * jd 순수 함수라 이미 고정된다. 실측상 `rotate/orbits` 추가판과 본 판의 6 계열이 **바이트 동일**이다.
 *
 * [실측] N=10 × 6 계열 (`default`·`glow`·`off` × 40/100 AU) 전부 `distinct == 1`:
 *   40 AU `default 14` / `glow 14` / `off 3` → 증가분 `+11` (기준 `+10`)
 *   100 AU `default 15` / `glow 15` / `off 1` → 증가분 `+14` (기준 `+11`)
 * 착수 전 판본의 같은 표본은 `off` 40 AU `131~134` (distinct 4) · 증가분 `+12~+15` 였다.
 * 수치 정본은 이슈 [#1219](https://github.com/coseo12/astro-simulator/issues/1219) 코멘트
 * (CI Actions 로그는 만료된다 — ADR `20260814-1040`).
 *
 * ⚠️ **항목 6 (#677 race 가드) 에는 이 결정적 조건을 걸지 않는다** — 그 블록은 `?gpu=a`·`?lod`
 * 미부여와 `requestAdapter` 폴링 게이트로 **비결정 구간을 의도적으로 재현**한다 (아래 항목 6 주석).
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { withBrowser, waitForLodSettle } from '../../../scripts/browser-verify-utils.mjs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const CAPTURE_DIR = process.env.CAPTURE_DIR ?? '';

const VIEWPORT = { width: 1280, height: 720 };
const POST_INIT_WAIT_MS = 1500;
const POST_CAMERA_WAIT_MS = 1000;
/** #1219 — JD 고정 + pause command 반영 대기 (`1202` setupPage 와 같은 값). */
const POST_JD_WAIT_MS = 1000;
/** #1219 — DOM 숨김 스타일 적용 후 다음 페인트 여유. */
const POST_HIDE_WAIT_MS = 200;
const AU_METERS = 1.495978707e11;

/**
 * 프리뷰 실측 기준 (2026-06-12) — 식별 천체 증가분 하한. ADR §축 6 박제값.
 *
 * #1219 — 재는 프레임이 바뀌어 **카운트 절대값은 더 이상 프리뷰 수치를 재현하지 않는다**
 * (`145~148` → `14`). 재현되는 것은 **증가분**뿐이고 본 값은 그 기준이라 무변경이다.
 * 근거: DOM 오염은 두 모드에 같은 항으로 실려 증가분에서 상쇄된다 (아래 헤더 §(a) 실측).
 */
const EXPECTED_DELTA = [
  { au: 40, minDelta: 10 },
  { au: 100, minDelta: 11 },
];

/** luminance cluster 식별 임계 (0~255). glow marker 피크 휘도 173~252 (프리뷰 실측) ≫ 40. */
const LUMINANCE_THRESHOLD = 40;

/**
 * #1219 — 결정성 앵커 JD. 저장소 공용 상수 (`783` / `1119` / `1202` / `1215` 와 동일 값).
 * 통과하는 값으로 고른 것이 아니라 **이미 쓰이던 앵커를 그대로 채택**했다 (C1 클래스 회피).
 */
const T_JD = 2451626.0;

function buildUrl(query) {
  const sep = BASE_URL.includes('?') ? '&' : '?';
  return query ? `${BASE_URL}${sep}${query}` : BASE_URL;
}

async function openSim(browser, query) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(buildUrl(query), { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForFunction(
    () =>
      typeof window.__simStore !== 'undefined' &&
      typeof window.__solarScene !== 'undefined' &&
      typeof window.__simCore !== 'undefined',
    { timeout: 30_000 },
  );
  await page.waitForTimeout(POST_INIT_WAIT_MS);
  // #1219 (b) — sim 시각 고정. 기본 배율 86_400 + pause 부재면 로드·대기 편차가 그대로 궤도 위상
  // 편차가 된다. `1202` / `1215` 의 결정적 부트스트랩 레시피와 같은 2 command.
  await page.evaluate((jd) => {
    window.__simCore.command({ type: 'jumpToJulianDate', julianDate: jd });
    window.__simCore.command({ type: 'pause' });
  }, T_JD);
  await page.waitForTimeout(POST_JD_WAIT_MS);
  // #1219 (a) — 캔버스 위 DOM 오버레이 숨김. 이걸 안 하면 `?marker=off` 카운트의 거의 전부가
  // UI 글리프다 (헤더 §(a)).
  await hideDomOverlays(page);
  return { context, page };
}

/**
 * #1219 (a) — 캔버스 외 DOM 을 `visibility: hidden` 으로 숨긴다.
 *
 * `canvas.screenshot()` (Playwright element 캡처) 는 **element 의 화면 영역**을 찍으므로 그 위에
 * 겹친 DOM (TopBar · TimeBar · HUD 코너) 이 함께 찍힌다. 즉 luminance cluster 계수가 천체가 아니라
 * UI 텍스트를 세고 있었다.
 *
 * `visibility: hidden` 을 쓴다 — **레이아웃 박스를 보존**하므로 캔버스 기하가 그대로다
 * ([실측 reviewer] 숨김 전/후 `canvas.width×height` · `getBoundingClientRect` 둘 다 `1280×720`
 * 불변, `getLodStats` `0/0/32 fading=0` 불변).
 */
async function hideDomOverlays(page) {
  await page.addStyleTag({
    content: 'body * { visibility: hidden !important; } canvas { visibility: visible !important; }',
  });
  await page.waitForTimeout(POST_HIDE_WAIT_MS);
  // #1219 권고 1 — 위 셀렉터는 스코프가 없어 페이지의 **모든** 캔버스를 되살린다. 지금은 캔버스가
  // 하나뿐이라 무해하지만 [실측 reviewer: `querySelectorAll('canvas').length === 1`], HUD 에 캔버스
  // (미니맵·성능 그래프 등) 가 하나 생기면 이번에 닫은 오염 축이 **조용히** 재개통된다 — 값만
  // 커지고 FAIL 이 아니다.
  //
  // 셀렉터를 특정 id 로 좁히는 대신 **개수 단언**을 둔다: id 는 바뀌어도 스크립트가 조용히 다른
  // 것을 재기 시작하지만, 개수 단언은 전제가 깨지는 순간 시끄럽게 깨진다 (fail-fast).
  const canvasCount = await page.evaluate(() => document.querySelectorAll('canvas').length);
  if (canvasCount !== 1) {
    throw new Error(
      `[#1219] 캔버스가 ${canvasCount}개다 (기대 1). hideDomOverlays 의 'canvas { visibility: visible }' 가 ` +
        '캡처 대상 밖 캔버스까지 되살려 판정량을 오염시킨다 — 셀렉터를 캡처 대상으로 좁히고 본 단언을 갱신하라.',
    );
  }
}

/**
 * 카메라를 태양으로부터 au (AU) 거리로 이동.
 *
 * scene unit ↔ meter 환산은 lodInfo(sun).cameraDistanceMeters / camera.radius 실측비 사용 —
 * tier renderScale 하드코딩 회피. tier 전환 (radius 점프로 renderScale 변경 가능) 수렴을 위해
 * 2-pass 적용.
 */
async function setCameraAu(page, au) {
  for (let pass = 0; pass < 2; pass++) {
    await page.evaluate(
      ({ au, AU_METERS }) => {
        const scene = window.__solarScene.meshes.get('sun').getScene();
        const cam = scene.activeCamera;
        const sunInfo = window.__solarScene.getLodInfo().find((i) => i.id === 'sun');
        if (!sunInfo || !(sunInfo.cameraDistanceMeters > 0) || !(cam.radius > 0)) return;
        const metersPerUnit = sunInfo.cameraDistanceMeters / cam.radius;
        const target = (au * AU_METERS) / metersPerUnit;
        if (cam.upperRadiusLimit !== null && cam.upperRadiusLimit < target * 1.5) {
          cam.upperRadiusLimit = target * 1.5;
        }
        cam.radius = target;
      },
      { au, AU_METERS },
    );
    await page.waitForTimeout(POST_CAMERA_WAIT_MS);
  }
  // 실측 거리 확인용 반환 (AU).
  return page.evaluate(() => {
    const sunInfo = window.__solarScene.getLodInfo().find((i) => i.id === 'sun');
    return sunInfo ? sunInfo.cameraDistanceMeters / 1.495978707e11 : NaN;
  });
}

/** 궤도선 OFF — luminance cluster 측정 오염 분리 (R10a qa 선례). */
async function disableOrbitLines(page) {
  await page.evaluate(() => window.__solarScene.setOrbitLinesVisible(false));
  await page.waitForTimeout(400);
}

/**
 * 식별 천체 카운트 — canvas 캡처의 luminance ≥ 40 픽셀 8-이웃 연결 성분 수.
 *
 * WebGL drawing buffer 미보존 함정 회피: playwright element screenshot (PNG) → 페이지 내
 * Image 디코드 → 2D canvas getImageData 로 분석 (프리뷰 측정과 동일 경로).
 */
async function countIdentifiableBodies(page, captureName) {
  const canvas = page.locator('canvas').first();
  const buf = await canvas.screenshot();
  if (CAPTURE_DIR && captureName) {
    await mkdir(CAPTURE_DIR, { recursive: true });
    await writeFile(path.join(CAPTURE_DIR, `${captureName}.png`), buf);
  }
  const b64 = buf.toString('base64');
  return page.evaluate(
    async ({ b64, threshold }) => {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = `data:image/png;base64,${b64}`;
      });
      const w = img.width;
      const h = img.height;
      const off = document.createElement('canvas');
      off.width = w;
      off.height = h;
      const ctx = off.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, w, h).data;
      const bright = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        // Rec.601 luminance — r1-guard sun 점유율 측정과 동일 식.
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (lum >= threshold) bright[i] = 1;
      }
      // 8-이웃 BFS 연결 성분 카운트.
      const visited = new Uint8Array(w * h);
      const stack = [];
      let clusters = 0;
      for (let start = 0; start < w * h; start++) {
        if (!bright[start] || visited[start]) continue;
        clusters++;
        visited[start] = 1;
        stack.push(start);
        while (stack.length > 0) {
          const cur = stack.pop();
          const cx = cur % w;
          const cy = (cur - cx) / w;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = cx + dx;
              const ny = cy + dy;
              if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
              const ni = ny * w + nx;
              if (bright[ni] && !visited[ni]) {
                visited[ni] = 1;
                stack.push(ni);
              }
            }
          }
        }
      }
      return clusters;
    },
    { b64, threshold: LUMINANCE_THRESHOLD },
  );
}

/** low variant (`<id>-lod-low`) 전수의 { id, scalingX, pxDiameter, level } 수집. */
async function collectLowVariantState(page) {
  return page.evaluate(() => {
    const scene = window.__solarScene.meshes.get('sun').getScene();
    const out = [];
    for (const info of window.__solarScene.getLodInfo()) {
      const low = scene.getMeshByName(`${info.id}-lod-low`);
      out.push({
        id: info.id,
        level: info.level,
        pxDiameter: info.pxDiameter,
        scalingX: low ? low.scaling.x : null, // null = low variant 아직 lazy-create 안 됨
      });
    }
    return out;
  });
}

async function main() {
  let allPass = true;
  const check = (label, pass, detail) => {
    console.log(`   ${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
    if (!pass) allPass = false;
  };

  // #940 — 브라우저 수명주기를 `withBrowser` 로 위임 (에러 경로 close 도달 보장).
  // launch 인자는 원본 그대로 전달한다 (렌더러 축 불변 — docs/ops/browser-verify-helpers.md).
  await withBrowser({ headless: true }, async (browser) => {
    console.log('\n=== #675 glow pixel marker 회귀 가드 ===');
    console.log(`BASE_URL=${BASE_URL}\n`);

    // 모드 3종 (default = glow ON / 명시 glow / off) 페이지 오픈. headless tier-c 함정 회피 ?gpu=a.
    const modes = {
      default: 'gpu=a&lod=auto',
      glow: 'gpu=a&lod=auto&marker=glow',
      off: 'gpu=a&lod=auto&marker=off',
    };
    const counts = {}; // counts[mode][au]
    const lowStates = {}; // lowStates[mode][au]
    const settleTimeouts = []; // #1219 — LOD 정착 결과. timedOut 표본이 있으면 아래 항목 0) 에서 FAIL

    for (const [mode, query] of Object.entries(modes)) {
      counts[mode] = {};
      lowStates[mode] = {};
      const { context, page } = await openSim(browser, query);
      await disableOrbitLines(page);
      for (const { au } of EXPECTED_DELTA) {
        const actualAu = await setCameraAu(page, au);
        // #1219 — 상수 대기 대신 LOD 정착 확인 (cross-fade 진행 중 캡처 차단).
        // timedOut 은 **PASS 로 흡수하지 않는다** — 정착 실패를 통과로 세면 fail-open 이다.
        const settle = await waitForLodSettle(page);
        settleTimeouts.push({ mode, au, settle });
        const captureName = `675-glow-${au}au-${mode}`;
        counts[mode][au] = await countIdentifiableBodies(page, captureName);
        lowStates[mode][au] = await collectLowVariantState(page);
        console.log(
          `   [측정] mode=${mode.padEnd(7)} ${au} AU (실측 ${actualAu.toFixed(1)} AU) → 식별 천체 ${counts[mode][au]} (LOD ${settle.dist}, ${settle.waitedMs}ms${settle.timedOut ? ' TIMEOUT' : ''})`,
        );
      }
      await context.close();
    }

    // 0) #1219 — 측정 전제. LOD 정착 실패 표본이 하나라도 있으면 아래 카운트 비교는 의미가 없다.
    //    측정 실패를 통과로 읽지 않기 위해 판정 앞에 세운다 (#1201 fail-open 시그니처 회피).
    console.log('\n0) 측정 전제 — 캡처 시점 LOD 정착 (cross-fade 종료 + 분포 안정)\n');
    {
      const timedOut = settleTimeouts.filter((s) => s.settle.timedOut);
      // #1219 권고 6 — `timedOut.length === 0` 만 보면 **표본이 비었을 때 공허 참으로 PASS** 한다
      // (#1201 / #1214 「측정 성공 ↔ 측정 부재」 시그니처). 표본 하한을 함께 건다. 기대 표본 수는
      // 새 상수를 만들지 않고 **측정 루프의 정의**(모드 수 × 거리 수) 에서 도출한다 — 루프가 바뀌면
      // 기대값도 같이 바뀌어야 하고, 별도 상수는 그 순간 drift 를 만든다.
      const expectedSamples = Object.keys(modes).length * EXPECTED_DELTA.length;
      check(
        `LOD 정착 표본 ${settleTimeouts.length - timedOut.length}/${settleTimeouts.length} (기대 ${expectedSamples})`,
        settleTimeouts.length === expectedSamples && timedOut.length === 0,
        timedOut.length > 0
          ? timedOut
              .map((t) => `${t.mode}@${t.au}AU dist=${t.settle.dist} fading=${t.settle.fading}`)
              .join(' / ')
          : settleTimeouts.length !== expectedSamples
            ? `표본 수 불일치 — 측정 루프가 ${expectedSamples} 회를 돌지 않았다 (측정 부재를 통과로 세지 않는다)`
            : undefined,
      );
    }

    // 1) 식별 천체 증가분 (default vs off) — 프리뷰 실측 기준 재현.
    console.log('\n1) 식별 천체 카운트 (default glow ON − ?marker=off) ≥ 프리뷰 기준\n');
    for (const { au, minDelta } of EXPECTED_DELTA) {
      const delta = counts.default[au] - counts.off[au];
      check(
        `${au} AU: +${delta} (glow ${counts.default[au]} / off ${counts.off[au]})`,
        delta >= minDelta,
        `기준 ≥ +${minDelta}`,
      );
    }

    // 2) ?marker=off 격리 — low variant 전수 scaling=1 (glow 역보정 무적용).
    console.log('\n2) ?marker=off 격리 — low variant 전수 scaling=1 (기존 동작 100%)\n');
    for (const { au } of EXPECTED_DELTA) {
      const scaled = lowStates.off[au].filter((s) => s.scalingX !== null && s.scalingX !== 1);
      check(
        `${au} AU: scaling≠1 low variant ${scaled.length}개`,
        scaled.length === 0,
        scaled.length > 0 ? JSON.stringify(scaled.slice(0, 3)) : undefined,
      );
    }

    // 3) off-frustum 가드 — glow ON 에서 pxDiameter ≤ 0 body 는 scaling=1 유지 (ADR §축 4).
    console.log('\n3) off-frustum 가드 — pxDiameter ≤ 0 body 의 marker 부재 (scaling=1)\n');
    for (const { au } of EXPECTED_DELTA) {
      const offFrustum = lowStates.default[au].filter(
        (s) => !(s.pxDiameter > 0) && s.scalingX !== null,
      );
      const violated = offFrustum.filter((s) => s.scalingX !== 1);
      check(
        `${au} AU: off-frustum ${offFrustum.length}개 중 scaling≠1 ${violated.length}개`,
        violated.length === 0,
        violated.length > 0 ? JSON.stringify(violated.slice(0, 3)) : undefined,
      );
    }

    // 4) 전수 발동 — 100 AU 에서 화면 안 (pxDiameter > 0) low body 전수 scaling > 1.
    console.log('\n4) 전수 발동 — 100 AU 화면 안 low body 전수 glow scaling > 1\n');
    {
      const inFrustumLow = lowStates.default[100].filter(
        (s) => s.pxDiameter > 0 && s.level === 'low' && s.scalingX !== null,
      );
      const notGlowing = inFrustumLow.filter((s) => s.scalingX <= 1);
      check(
        `100 AU: 화면 안 low body ${inFrustumLow.length}개 중 미발동 ${notGlowing.length}개`,
        inFrustumLow.length > 0 && notGlowing.length === 0,
        notGlowing.length > 0 ? JSON.stringify(notGlowing.slice(0, 5)) : undefined,
      );
    }

    // 5) 하위 호환 — ?marker=glow 명시도 off 대비 동일 기준의 증가분 충족 (wiring 검증).
    //
    // ⚠️ default 와의 정확 카운트 일치 단언은 금지 — 페이지 로드 간 sim 시각 차이로 body 위치가
    // 미세 이동 → 인접 marker cluster 병합/분리 ±1~2 변동 (2026-06-13 실측: 100 AU 124 vs 125).
    //
    // #1219 — 위 변동의 축 두 개 (sim 시각 진행 · DOM HUD 글리프) 는 측정 경로에서 닫혔고,
    // N=10 에서 `default` 와 `glow` 가 실제로 같은 값이었다 (40 AU `14`/`14`, 100 AU `15`/`15`).
    // 그래도 **일치 단언으로 바꾸지 않는다** — 본 PR 은 임계·술어 무변경이 계약이고 (#1219 D6),
    // 일치는 로컬 1 환경의 관측이지 CI 렌더러까지의 보증이 아니다.
    // 명시 glow 의 작동 자체는 off 대비 증가분 (≥ minDelta) 이 직접 검증한다 — wiring 회귀
    // (명시 glow 가 off 로 해석되는 류) 시 증가분이 0 으로 떨어져 즉시 FAIL.
    console.log('\n5) 하위 호환 — ?marker=glow 명시 = off 대비 증가분 동일 기준 충족\n');
    for (const { au, minDelta } of EXPECTED_DELTA) {
      const delta = counts.glow[au] - counts.off[au];
      check(
        `${au} AU: 명시 +${delta} (glow ${counts.glow[au]} / off ${counts.off[au]})`,
        delta >= minDelta,
        `기준 ≥ +${minDelta}`,
      );
    }

    // 6) #677 — tier-c LOD override race 가드 (worst-case 결정론 재현).
    //
    // sim-canvas 는 (a) detectGpuCapability().then(...) 에서 tier-c 판정 + 강제 low 예약과
    // (b) instance.start().then(...) 의 handler 등록 시점 플래그 읽기가 별개 async chain 이라,
    // (b) 가 (a) 보다 먼저 끝나면 (저속/headless 환경에서 requestAdapter 가 느린 경우) 강제 low 가
    // 영구 유실된다 (#677 forensic — fix 는 (a) 에서 command 직접 발행으로 양방향 커버).
    // 여기서는 requestAdapter 가 **scene 초기화 완료 (`__solarScene` 노출 = handler 등록 동일
    // sync 블록) 이후에만** adapter null (→ detectGpuTier 분기 2 = tier 'c') 을 반환하도록 폴링
    // 게이트를 걸어 race-lost 방향을 시간 무관하게 구조적으로 강제한다 (고정 지연은 cold context
    // 의 scene 초기화가 더 느리면 race 를 이겨버려 negative 재현 실패 — 2026-06-13 실측).
    // gpu/lod URL 파라미터 없이 자동 감지 경로 사용 (modes 의 ?gpu=a 함정 회피와 정반대 — 의도).
    console.log("\n6) #677 tier-c LOD override race — 지연 감지에서도 override='low' 정착\n");
    {
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
      await context.addInitScript(() => {
        // 호출 1번째 = sim-canvas useEffect 의 detectGpuCapability (동기적으로 가장 먼저 호출됨)
        // → __solarScene 노출 (= handler 등록 동일 sync 블록 완료) 까지 게이트.
        // 호출 2번째+ = Babylon 엔진 init 의 WebGPU 탐지 → 즉시 null (게이트 걸면 scene 초기화
        // 자체가 게이트를 기다리는 순환 대기 deadlock — 2026-06-13 실측).
        let adapterCalls = 0;
        Object.defineProperty(navigator, 'gpu', {
          configurable: true,
          value: {
            requestAdapter: () => {
              adapterCalls += 1;
              if (adapterCalls > 1) return Promise.resolve(null);
              return new Promise((resolve) => {
                const poll = () => {
                  // +300ms 는 task 경계 여유.
                  if (window.__solarScene) setTimeout(() => resolve(null), 300);
                  else setTimeout(poll, 100);
                };
                poll();
              });
            },
          },
        });
      });
      const page = await context.newPage();
      await page.goto(buildUrl(''), { waitUntil: 'networkidle', timeout: 60_000 });
      let settled = false;
      try {
        await page.waitForFunction(
          () => window.__gpuTier === 'c' && window.__solarScene?.getLodStats?.().override === 'low',
          { timeout: 15_000 },
        );
        settled = true;
      } catch {
        // timeout → settled=false 로 FAIL 처리 (아래 check)
      }
      const state = await page.evaluate(() => ({
        tier: window.__gpuTier ?? null,
        override: window.__solarScene?.getLodStats?.().override ?? null,
      }));
      check(
        `지연 tier-c 감지 후 override='${state.override}' (tier='${state.tier}')`,
        settled,
        settled
          ? undefined
          : "override 가 'low' 로 정착하지 않음 — tier-c 강제 LOD race 회귀 (#677)",
      );
      await context.close();
    }
  });

  console.log('\n=== 최종 요약 ===');
  console.log(`  overall: ${allPass ? 'PASS' : 'FAIL'}`);
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error('\n  FATAL:', err);
  process.exit(2);
});
