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
 *      재현 여부는 가정하지 않고 **전제로 검사**한다 (§#1239 — 미재현은 `exit 2`).
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
 * #1239 — 항목 6 의 **게이트 대상** 교체 (임계·단언은 무변경).
 *
 * 종전 게이트는 「`requestAdapter` **첫 호출**만 붙든다」였고, 주석은 그 첫 호출이 sim-canvas 의
 * `detectGpuCapability` 이고 「2번째+ 는 Babylon 엔진 init」이라고 선언했다. **둘 다 틀렸다.**
 *
 * [실측 2026-09-23 · macOS 26.6.2 · Apple M1 Pro · playwright headless chromium · `next dev` ·
 * 1280×720 · 게이트 3 run · 무게이트 대조 1 run] 한 페이지의 `requestAdapter` 호출은 **4 회**다 —
 * dev StrictMode 가 초기화 effect 를 두 번 돌리기 때문이다 (`window.__bootPhases` 의 체인 `m1`·`m2`):
 *
 *   #1 `m1` detectGpuCapability  #2 `m1` isWebGpuUsable
 *   #3 `m2` detectGpuCapability  #4 `m2` isWebGpuUsable
 *
 * (A) 게이트가 붙든 #1 은 **버려지는 첫 체인** `m1` 의 것이다 (React 가 즉시 cleanup → sim-canvas
 *     의 `if (cancelled) return`). 살아남아 `__gpuTier` 를 박고 `__solarScene` 을 노출하는 `m2` 는
 *     **게이트 밖의 #3** 을 받아 즉시 settle 한다.
 * (B) 그래서 살아남은 체인에서는 재현하려던 순서가 **반대**로 성립했다 —
 *     `m2 web:gpu-capability @345.3 / 353.0 / 352.3 ms` 가 `m2 web:solar-scene-exposed
 *     @405.1 / 414.2 / 411.8 ms` 보다 **먼저**다. 무게이트 대조군의 같은 마크는 `@344.6 ms` 로
 *     게이트판과 구분되지 않는다 ⇒ **게이트는 판정량에 아무 영향이 없었다.**
 * (C) 판별력도 0 이었다. 변이 주입 3 종 (모두 `sim-canvas.tsx` 의 tier-c 분기, 게이트/무게이트 대조):
 *       M1 양성 대조 — `__gpuTierForceLod` 플래그 + `command` 직접 발행 **둘 다** 제거 → 양쪽 FAIL
 *       M2 **#677 회귀 재현** — `command` 직접 발행만 제거 (Amendment 2 이전 상태) → **양쪽 PASS**
 *       M3 플래그만 제거 → 양쪽 FAIL
 *     즉 이 축이 이름으로 걸고 있던 바로 그 회귀(M2)를 **못 잡았고**, 잡은 둘은 게이트 없이도
 *     잡히는 것들이었다.
 * (D) 「게이트 걸면 순환 대기 deadlock」(2026-06-13) — **그때는 참이었다.** #1234 직전 트리
 *     (`71d30eb`) 를 빌드해 같은 축을 돌린 결과: `detectGpuCapability` 전부를 게이트하면
 *     `__solarScene` 이 **영영 안 나온다** (`tier=null` · 2/2 run). 같은 트리에서 종전 게이트
 *     (첫 호출만) 는 지금과 똑같이 PASS 한다 — 즉 **순환 대기는 한 번도 성립한 적이 없고**,
 *     성립하지 않은 이유는 위 (A) 다 (이슈 #1239 본문의 두 가설 중 「다른 경로로 먼저 성립」이
 *     참이고, 그 「다른 경로」의 정체가 StrictMode 둘째 체인이다).
 *     현행 트리에서는 엔진 probe 를 게이트해도 deadlock 이 아니라 **#1234 상한이 발화**해 (1 run)
 *     `engine:probe-adapter-timeout @12300.3 ms` 뒤 `web:solar-scene-exposed @12418.6 ms` 로
 *     부팅이 끝난다 (12 s 지연). 그래도 엔진 probe 는 게이트하지 않는다 — 상한 발화에 의존하는
 *     재현은 가드 핸들 대기와 경쟁한다.
 *
 * ⚠️ **ADR 의 당시 기록과 어긋나 보인다 — 지우지 않고 포인터로 잇는다.**
 * `docs/decisions/20260613-675-glow-pixel-marker.md` §Amendment 2 (fix 항목) 는 이 축의 신설을
 * 「pre-fix FAIL / post-fix PASS 3중 시뮬레이션 실측」으로 박제하고 있고, 거기서의 pre-fix 가
 * 정확히 위 (C) 의 M2 다. 그 기록은 **이력이라 수정하지 않았다.** 여기서 반증한 범위는 **현행
 * 트리와 #1234 직전 트리(`71d30eb`)** 뿐이고, 2026-06-13 당시 트리는 재현 대상이 아니었다 —
 * 그러므로 **「그때는 왜 잡혔는가」는 단정하지 않는다.** (두 트리가 최소한 어떻게 다른지는
 * 확인됐다: `Promise.all([instance.start(), gpuCapPromise])` 가 #738 로 2026-06-25 에 도입돼
 * #1234 C3-B 에서 분리됐으므로, 2026-06-13 트리에는 그 대기가 **없었다.**) ADR 쪽에도 이 절을
 * 가리키는 후속 실측 포인터를 달아 두 기록이 포인터 없이 만나지 않게 했다.
 *
 * 처치: 게이트 대상을 **호출 순번 → 호출자**로 바꾼다. `detectGpuCapability` 계열 호출은 체인과
 * 무관하게 전부 붙들고, 엔진 probe 는 종전대로 즉시 null. 이것이 **지금** 가능한 이유는 #1234
 * C3-B 가 장면 체인의 `gpuCapPromise` **대기**를 끊었기 때문이다 (위 (D) 의 전/후 대조가 그
 * 직접 증거다). 교체 후 실측:
 *   - 건강 판본 2/2 PASS — `m2 solar-scene-exposed @405.1 / 487.6` → `m2 gpu-capability
 *     @1182.3 / 1258.2` 로 capability 가 **777 / 771 ms 늦게** 도착 (= race-lost 방향 재현).
 *   - M2 변이 3/3 **FAIL** (`override='auto'`). 종전 게이트는 같은 변이에서 PASS ⇒ 판별력 복원.
 * 새 임계 0 개 (폴 100ms · 여유 300ms 무변경).
 *
 * 재현 여부를 가정하지 않는다: 게이트 발화 횟수와 「capability 가 scene 노출보다 늦게 왔는가」를
 * **전제로 검사**하고, 미성립이면 통과가 아니라 `exit 2` 다 (#1250 이 379-lod 에서 세운 종료 코드
 * 계약과 같은 합성 — 확정 FAIL 우선). 전제 계측은 앱이 이미 남기는 `window.__bootPhases`
 * (#1234 C2) 를 읽을 뿐이고 가드가 새 계측을 만들지 않는다.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  hideDomOverlays,
  withBrowser,
  waitForLodSettle,
} from '../../../scripts/browser-verify-utils.mjs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const CAPTURE_DIR = process.env.CAPTURE_DIR ?? '';

const VIEWPORT = { width: 1280, height: 720 };
const POST_INIT_WAIT_MS = 1500;
const POST_CAMERA_WAIT_MS = 1000;
/** #1219 — JD 고정 + pause command 반영 대기 (`1202` setupPage 와 같은 값). */
const POST_JD_WAIT_MS = 1000;
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
    undefined,
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
  // UI 글리프다 (헤더 §(a)). 헬퍼 본체 (`visibility` 선택 근거 · 캔버스 개수 fail-fast 단언) 는
  // #1228 에서 `verify:1119` 와 공유하려고 `scripts/browser-verify-utils.mjs` 로 옮겼다 — 동작 불변.
  await hideDomOverlays(page);
  return { context, page };
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
  /** 판정의 **전제**가 무너졌다 (측정 불가) — 단언 거짓(`allPass=false`) 과 다른 축이다. */
  let blocked = false;
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
    //
    // #1239 — 게이트 대상이 **호출 순번**에서 **호출자**로 바뀌었다. 근거는 헤더 §#1239.
    console.log("\n6) #677 tier-c LOD override race — 지연 감지에서도 override='low' 정착\n");
    {
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
      await context.addInitScript(() => {
        // 게이트 대상 = `detectGpuCapability()` 의 어댑터 조회 **전부** (마운트 체인마다 1회).
        // 엔진 probe (`isWebGpuUsable`) 는 즉시 null — 그쪽을 붙들면 `createEngine` 이 결과를
        // 기다려 scene 자체가 안 서고, 게이트가 기다리는 `__solarScene` 도 안 나온다
        // (2026-06-13 의 순환 대기). ⚠️ **현행 트리에서는 그 대기가 deadlock 이 아니다** —
        // #1234 상한이 12 s 에 발화해 부팅이 끝난다. 그래도 붙들지 않는 이유는 그 재현이
        // 상한 발화에 업혀 가드 핸들 대기와 경쟁하기 때문이다 (헤더 §#1239 (D)).
        //
        // 호출자 판별은 스택의 함수명이다. dev 번들은 이름을 보존한다 [실측 2026-09-23 —
        // `at Module.detectGpuCapability (…/_next/static/chunks/…)`]. 이 판별이 깨지면 게이트가
        // 한 번도 안 걸리는데, 그건 **조용히 통과**가 아니라 아래 전제 검사가 `exit 2` 로 잡는다.
        // 카운터는 두 축뿐이다 — **호출자 판별**(`detect`/`probe`) 과 **게이트 해소**(`resolved`).
        // `detect` 가 곧 게이트 발화 횟수다: 이 분기에 들어온 호출은 예외 없이 아래 폴링 게이트로
        // 들어가므로 「detect 는 됐는데 게이트는 안 걸렸다」로 **갈릴 경로가 없다** (초판의 별도
        // `gated` 카운터는 `detect` 와 항상 같은 값이었다 — PR #1255 reviewer 권고 3 으로 병합).
        // 반면 `resolved` 는 갈린다 — 게이트가 `__solarScene` 을 기다리다 영영 안 풀리면
        // `detect > resolved` 로 남고, 그게 아래 오귀인 힌트의 근거다.
        window.__axis6 = { detect: 0, probe: 0, resolved: 0 };
        Object.defineProperty(navigator, 'gpu', {
          configurable: true,
          value: {
            requestAdapter: () => {
              const fromDetect = (new Error().stack ?? '').includes('detectGpuCapability');
              if (!fromDetect) {
                window.__axis6.probe += 1;
                return Promise.resolve(null);
              }
              window.__axis6.detect += 1;
              return new Promise((resolve) => {
                const poll = () => {
                  // +300ms 는 task 경계 여유.
                  if (window.__solarScene)
                    setTimeout(() => {
                      window.__axis6.resolved += 1;
                      resolve(null);
                    }, 300);
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
          // ⚠️ 두 번째 인자는 **`arg`** 이고 옵션은 세 번째다 — 종전 판본은 `{ timeout: 15_000 }`
          // 을 `arg` 자리에 넘겨 선언값이 한 번도 적용되지 않았고 실제 상한은 playwright 기본
          // 30 s 였다 [실측 2026-09-23 — FAIL 변이의 대기가 30004 ms]. 값을 `30_000` 으로 적어
          // **선언 = 실제**로 맞춘다 (동작 무변경. 같은 파일 `openSim` 의 핸들 대기와 같은 값이고,
          // 그쪽은 선언값이 기본값과 우연히 같아 드리프트가 드러나지 않았다).
          undefined,
          { timeout: 30_000 },
        );
        settled = true;
      } catch {
        // timeout → settled=false 로 FAIL 처리 (아래 check)
      }
      const state = await page.evaluate(() => {
        // 전제 계측은 앱이 이미 남기는 부트 마크를 읽는다 (#1234 C2) — 가드가 새로 재지 않는다.
        const phases = window.__bootPhases?.phases ?? null;
        // 살아남은 마운트 체인 = `__solarScene` 을 노출한 체인. dev StrictMode 는 체인을 둘
        // 발급하고 첫 체인은 cleanup 으로 버려지므로, 체인을 고르지 않으면 버려진 쪽의 마크를
        // 읽고 「지연됐다」고 오판한다 (그게 종전 축 6 이 순번으로 걸려 있던 자리다).
        const exposed = phases?.find((p) => p.name === 'web:solar-scene-exposed') ?? null;
        const capability = exposed
          ? (phases.find((p) => p.chain === exposed.chain && p.name === 'web:gpu-capability') ??
            null)
          : null;
        return {
          tier: window.__gpuTier ?? null,
          override: window.__solarScene?.getLodStats?.().override ?? null,
          counters: window.__axis6 ?? null,
          chain: exposed?.chain ?? null,
          sceneAtMs: exposed?.atMs ?? null,
          capabilityAtMs: capability?.atMs ?? null,
        };
      });

      // 전제 1 — 게이트가 실제로 걸렸는가 (호출자 판별 붕괴 감지). `detect` 가 곧 게이트 발화
      // 횟수다 (위 init script 주석 — 둘로 갈릴 경로가 없어 카운터 하나로 합쳤다).
      const gated = state.counters?.detect ?? 0;
      // 갈리는 쪽. `detect > resolved` = 게이트가 아직 `__solarScene` 을 기다리는 중이다.
      const gatesPending = gated - (state.counters?.resolved ?? 0);
      if (gated < 1) {
        blocked = true;
        console.log(
          `  ? 전제 붕괴 — 게이트가 한 번도 안 걸렸다 (detect=${state.counters?.detect ?? 'n/a'} ` +
            `probe=${state.counters?.probe ?? 'n/a'}). 호출자 판별(스택 함수명)이 깨졌을 수 있다.`,
        );
      }
      // 전제 2 — race-lost 방향이 실제로 재현됐는가. 「capability 가 scene 노출보다 늦게 왔다」가
      // 이 축이 재려는 상황 그 자체이고, 순서가 뒤집혀 있으면 아래 단언은 **쉬운 방향**을 잰 것이라
      // PASS 가 무의미하다 (#1201 클래스 — 전제 미성립을 통과로 읽지 않는다).
      const reproduced =
        state.sceneAtMs !== null &&
        state.capabilityAtMs !== null &&
        state.capabilityAtMs > state.sceneAtMs;
      if (!reproduced) {
        blocked = true;
        console.log(
          `  ? 전제 붕괴 — race-lost 방향 미재현 (chain=${state.chain} ` +
            `scene@${state.sceneAtMs} capability@${state.capabilityAtMs}). ` +
            '부트 마크 부재이거나 capability 가 scene 보다 먼저 도착했다.',
        );
      } else {
        console.log(
          `  · 전제 성립 — chain=${state.chain} scene@${state.sceneAtMs}ms → ` +
            `capability@${state.capabilityAtMs}ms (지연 ${Math.round(state.capabilityAtMs - state.sceneAtMs)}ms) · ` +
            `게이트 ${gated}회`,
        );
      }

      // 오귀인 차단 (PR #1255 reviewer 권고 2). 이 게이트는 **자기 자신이 순환을 만들 수 있다** —
      // #1234 C3-B (장면 체인이 `gpuCapPromise` 의 settle 을 기다리지 않는다) 가 되돌려지면
      // scene 이 capability 를, 게이트가 scene 을 서로 기다려 `__solarScene` 이 영영 안 나온다.
      // 그때 나오는 결과는 #677 회귀와 **같은 모양의 FAIL** 이라, 힌트가 없으면 제품 회귀로 읽힌다.
      // ⚠️ 판정은 바꾸지 않는다 (확정 FAIL 우선 — 여전히 `exit 1`). 동반 출력만 붙인다.
      const misattributionHint =
        gated < 1 || !reproduced
          ? ` ⚠️ 단 이 FAIL 은 전제가 무너진 채 나왔다 (게이트 발화 ${gated}회 · 미해소 ` +
            `${gatesPending}회 · chain=${state.chain} scene@${state.sceneAtMs} ` +
            `capability@${state.capabilityAtMs}) — #677 회귀가 아니라 **게이트 자신이 만든 순환**일 ` +
            '수 있다. #1234 C3-B (장면 체인의 gpuCapPromise 대기 분리) 가 살아 있는지 먼저 확인하라.'
          : '';

      check(
        `지연 tier-c 감지 후 override='${state.override}' (tier='${state.tier}')`,
        settled,
        settled
          ? undefined
          : "override 가 'low' 로 정착하지 않음 — tier-c 강제 LOD race 회귀 (#677)" +
              misattributionHint,
      );
      await context.close();
    }
  });

  // 확정 FAIL 우선 — 제품 결함이 「측정 불가」 뒤로 숨지 않게 한다 (#1250 이 379-lod 에서 세운
  // 종료 코드 계약과 같은 합성). 마지막 `0` 은 전제도 서고 단언도 전부 참인 경우뿐이다.
  const exitCode = !allPass ? 1 : blocked ? 2 : 0;
  console.log('\n=== 최종 요약 ===');
  console.log(
    `  overall: ${allPass ? (blocked ? '측정 불가' : 'PASS') : 'FAIL'} (exit ${exitCode})`,
  );
  process.exit(exitCode);
}

main().catch((err) => {
  console.error('\n  FATAL:', err);
  process.exit(2);
});
