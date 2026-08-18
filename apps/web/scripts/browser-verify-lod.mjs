#!/usr/bin/env node
/**
 * P11-B.2 #289 D3b — LOD Screenshot diff E2E.
 *
 * 목적: 3 tier × 3 LOD = 9 조합의 baseline 스크린샷을 캡처하고, 이후 변경 PR 이
 * baseline 대비 max pixel diff < 15% 를 유지하는지 회귀 가드한다.
 *
 * 사용:
 *   node apps/web/scripts/browser-verify-lod.mjs [baseUrl] [--update-baseline]
 *   기본 URL: http://localhost:3001
 *
 *   --update-baseline  : baseline 재생성 (최초 1회 또는 의도적 시각 변경 시 PR 본문에 근거 박제)
 *
 * ## 구조
 *
 *  - 3 tier: solar / inner / body
 *      - solar: 태양 focus (__solarScene.getTier() === 'solar' 보장)
 *      - inner: 화성 focus (inner 또는 body 경로 허용 — planet focus 거리 임계)
 *      - body:  지구 focus + 추가 zoom-in (body tier 강제)
 *  - 3 LOD: high / mid / low (__solarScene.setLodOverride(level))
 *  - 9 조합 = 3 tier × 3 LOD
 *
 * ## state.transitioning 대안 (R4 — flag 부재)
 *
 * B.1 머지 결과에서 scene 전역에 `state.transitioning` flag 는 **노출되지 않았다**.
 * `tier-transition.ts` 의 `runTierTransition` 은 camera.radius 300ms dolly + 500ms 입력 잠금 +
 * 200ms 마진 으로 총 800~1000ms 안정화. LOD 분기는 mesh.scaling / mesh.position 이 **즉시**
 * 반영되므로 camera.radius interp 만 LOD 결과에 영향 (screenCoverage ∝ 1/radius). 따라서
 * tier 변경 명령 후 **1200ms 대기** (300+500+400 margin) 로 transitioning 경과. LOD override
 * 변경 후에도 400ms 안정화 대기.
 *
 * 이 대안은 R4 "부재 시 architect 경량 자문" 을 대체 — `runTierTransition` 내부 타이밍 상수
 * (300/500) 는 tier-transition.ts 수식 주석 박제. 향후 scene 에 `state.transitioning` 을 정식
 * export 하면 polling 기반 대기로 개선 가능 (후속 이슈 후보).
 *
 * ## ⚠️ 본 가드의 실효 범위 (#1122) — **현재 임계로는 아무것도 검출하지 못한다**
 *
 * 아래 셋은 전부 커밋된 산출물로 재현 가능한 사실이다. 「무엇을 지키는가」보다 **무엇을 지키지
 * 못하는가**를 먼저 적는다 — 그것을 모르면 이 가드의 초록을 근거로 쓰게 된다.
 *
 * ### (1) 표면 회귀 — 구조적으로 도달 불가
 *
 * focus body 의 disk 가 프레임에서 차지하는 면적이 작아 **disk 픽셀이 100% 바뀌어도** 프레임
 * 대비 diff 는 그 면적 비율(`diskFrameShare`)을 넘지 못한다. 실측에서 **9/9 전 조합**의 상한이
 * `1.5%~3.7%` 로 임계 `15%` 에 못 미쳤다 — 사각은 body tier 에 국한되지 않고 **매트릭스 전체**다.
 *
 * ### (2) LOD 회귀 — **이것도 도달 불가** (초판이 반대로 적었다)
 *
 * ⚠️ 초판은 *"LOD 가 깨지면 mesh 크기가 프레임 규모로 달라지므로 15% 임계가 그 용도에는
 * 유효하다"* 고 적었다. **측정 없이 쓴 주장이었고 커밋된 baseline 자신이 반증한다** — 서로 다른
 * LOD 레벨의 baseline 끼리 같은 파라미터로 재면:
 *
 *   solar high↔mid `3.54%` / body high↔mid `2.04%` / inner high↔mid `1.41%`
 *   **mid↔low 는 3 tier 전부 `0.01%`**  ← 9장 중 3장은 독립 정보가 없다
 *
 * 즉 **LOD 가 통째로 다른 레벨이어도 최대 `3.54%`** 이고 임계에 닿지 않는다. 이 가드는 자기
 * 선언 목적(LOD 회귀)조차 현재 임계로는 검출하지 못한다.
 *
 * ### (3) 자동 발화 `0` — CI 에 배선된 적이 없다
 *
 * `.github/**` 안의 `verify:lod` hit 은 **주석 1건**(`shader-pixel-guard.yml` 이 *"보완 가드로
 * 기대되던 이 스크립트가 눈이 멀어 있다"* 고 적은 것) 뿐이고, `git log -S 'verify:lod' -- .github`
 * 는 **0 커밋**이며 `verify:smoke` 같은 aggregator 에도 없다. **수동 실행 전용**이다.
 *
 * ⚠️ 따라서 *"이 가드가 4개월치 시각 변경을 전건 PASS 로 통과시켰다"* 는 **성립하지 않는다** —
 * 통과시킨 게 아니라 **실행되지 않았다.** (baseline 9장이 `ff4e88d`(2026-04-24, #289) 이후 갱신
 * 되지 않은 것은 사실이고, 그 사이 #756 · #773 · #782 · #783 · #738 · #1119 가 들어간 것도
 * 사실이다. 틀린 것은 인과다.) 재캡처·CI 배선은 #1122 비목표라 여기서 다루지 않는다.
 *
 * ⇒ **표면 회귀는 지대별 verify 가 담당한다** (`browser-verify-1119-earth-mask.mjs` /
 * `browser-verify-783-earth-detail.mjs`) — 그쪽은 CI 에 배선돼 있다. 본 가드는 그것을 지키는
 * 척하지 않는다.
 *
 * ## pixel diff 방식
 *
 * pixelmatch + pngjs 로 baseline PNG 와 현재 screenshot PNG 의 pixel-level diff 를 계산.
 *  - threshold 0.1 (매칭 민감도) — 미세 anti-alias 변동 흡수
 *  - max diff pct = (diffPixels / totalPixels) × 100
 *  - DoD: 각 조합 max diff < 15% (계약 Q2-A)
 *
 * ### `diskDiffPct` — 보조 지표 (판정에 쓰지 않는다)
 *
 * focus body 의 화면 disk bbox **안에서만** 다시 잰 diff 비율. 위 사각을 **관측 가능하게**
 * 만들기 위한 것이고 **PASS/FAIL 을 바꾸지 않는다.**
 *
 * 판정 축으로 승격하지 않은 이유 (#1122 §대안 B 와 같은 논거):
 *  - body 마다 disk 면적이 달라 **단일 임계가 잡히지 않는다** (solar tier 의 태양 vs body tier
 *    의 지구는 화면 점유가 수십 배 차이).
 *  - `low` variant 는 billboard 라 disk 개념 자체가 mesh 와 다르다.
 *  - 축을 바꾸면 커밋된 baseline 9장의 **의미가 바뀐다** — 재캡처 없이는 해석이 성립하지 않는다.
 *
 * disk bbox 산식은 `browser-verify-1119-earth-mask.mjs` / `browser-verify-783-earth-detail.mjs`
 * 와 **같다** (`boundingSphere.radiusWorld / √3` 의 카메라 right 방향 edge 투영).
 * ⚠️ 초판은 여기에 *"셰이더 LOD 판정과도 같은 산식"* 이라고 덧붙였는데 **근거가 없다** — scene 의
 * LOD 는 `screenCoverageRadius`(`body.radius × bodyScale`) 로 판정하며 `boundingSphere` 를 거치지
 * 않는다 (PR #1126 reviewer S9). 두 verify 스크립트와 동형이라는 앞 문장만 유효하다.
 *
 * ⚠️ **`diskR` 은 결정적이지 않다.** 같은 머신 반복 실행에서 `inner`/`body` 는 최대 `±25%` 흔들린다
 * (`solar` 만 floating origin 앵커라 안정). 따라서 이 지표는 **한 실행 안의 상대 비교**로만 읽고,
 * 절대값을 문서에 박제할 때는 rev·환경·실행 횟수를 함께 적는다 (ADR `20260808-983` §4항).
 *
 * ⚠️ **bbox 는 정사각인데 disk 는 원이다.** 모서리 배경이 분모·분자에 섞여 `diskDiffPct` 는 원반
 * 대비를 **`×1.19~1.29` 과소평가**한다 (모서리 = bbox 의 `21.5~22.7%`, 해석값 `1 − π/4` 와 정합).
 * 편차 방향이 **과소**라 「사각이 있다」는 결론을 약화시키는 쪽이므로 그대로 둔다.
 *
 * ⚠️ `diskFrameShare` 는 `π r²` 를 **clamp 없이** 쓰는 반면 `computeDiskDiffPct` 의 bbox 는 프레임
 * 경계로 clamp 한다. disk 가 화면 밖으로 잘리면 상한이 실제보다 커지는데, 방향이 **보수적**
 * (상한 과대 → 「도달 불가」 주장이 약해짐)이라 유지한다.
 *
 * ## headless swiftshader freeze 완화 (volt #33)
 *
 * 3D/shader 경로 + headless 환경에서 partial freeze 가능성. 본 스크립트는 수치 검증
 * (diff pct) 만 수행하며, 시각 실 Chrome 검증은 `README` 수동 체크리스트로 보완.
 */
import { withBrowser } from '../../../scripts/browser-verify-utils.mjs';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const baseUrl = process.argv[2]?.startsWith('--')
  ? 'http://localhost:3001'
  : (process.argv[2] ?? 'http://localhost:3001');
const updateBaseline = process.argv.includes('--update-baseline');

const __dirname = dirname(fileURLToPath(import.meta.url));
const baselineDir = join(__dirname, '__baselines__');
const diffDir = join(__dirname, '..', '..', '..', '.verify-screenshots', 'lod-diff');
mkdirSync(baselineDir, { recursive: true });
mkdirSync(diffDir, { recursive: true });

const VIEWPORT = { width: 1280, height: 800 };

// DoD 임계값 (계약 Q2-A).
const MAX_DIFF_PCT_THRESHOLD = 15.0;

// 9 조합 매트릭스.
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
 * tier 별 focus body id. FocusQuickButtons 는 sun/earth/jupiter/neptune 4개만 노출하므로
 * mars (inner tier 대표) 는 __simCore.command 로 직접 호출.
 *  - solar: 태양 focus → tier='solar'
 *  - inner: 화성 focus → tier='inner' (planet focus 거리 임계)
 *  - body:  지구 focus + setTier('body') 강제
 */
const TIER_FOCUS_BODY = {
  solar: 'sun',
  inner: 'mars',
  body: 'earth',
};

const results = [];

const consoleErrors = [];

// #940 — 본 스크립트는 top-level await 로 `launch → … → close` 를 일직선 나열해, `page.goto`
//   실패나 `evaluate` throw 가 나면 마지막 `browser.close()` 에 도달하지 못했다 (#927 이 정리한
//   클래스와 동일. 본 파일은 `finally` 자체가 없던 세대다). 수명주기를 `withBrowser` 로 위임한다.
//   launch 인자는 원본 그대로 **무인자** — 렌더러 축 무변경 (본 가드는 픽셀 diff 판정이다).
//   조기 종료는 콜백 안에서 `process.exit` 하면 안 된다 (Node 즉시 종료 → close 미도달).
//   sentinel 을 반환하고 실제 종료는 호출부에서 한다 (#939 `verify-fps-baseline` 전례).
const outcome = await withBrowser({}, async (browser) => {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  console.log('\n[P11-B.2 D3b] LOD Screenshot diff E2E — 9 조합');
  console.log(`baseUrl: ${baseUrl}`);
  console.log(`updateBaseline: ${updateBaseline}`);
  console.log(`threshold: max diff < ${MAX_DIFF_PCT_THRESHOLD}%\n`);

  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // __solarScene 노출 확인
  const sceneReady = await page.evaluate(
    () => typeof window.__solarScene === 'object' && window.__solarScene !== null,
  );
  if (!sceneReady) {
    console.error('[FAIL] __solarScene 전역 미노출 — dev 빌드 아님 또는 초기화 실패');
    return 'scene-not-ready';
  }

  // `runCombo` 는 아래에 선언돼 있으나 함수 선언 호이스팅으로 여기서 호출 가능 —
  // 본문 위치를 옮기지 않아 diff 를 수명주기 변경분으로 한정한다.
  for (const combo of COMBOS) {
    const result = await runCombo(page, combo);
    results.push(result);
    const mark = result.pass ? 'PASS' : 'FAIL';
    console.log(`  [${mark}] ${result.combo}: ${result.reason}`);
  }
  return 'ran';
});

// 원 동작 보존 — 씬 미노출은 리포트 없이 exit 1 (브라우저는 위에서 이미 닫힘).
if (outcome === 'scene-not-ready') process.exit(1);

/**
 * focus body 의 화면 disk bbox (px) 를 잰다 — **보조 지표 전용** (§diskDiffPct).
 *
 * 산식은 `browser-verify-1119-earth-mask.mjs` / `browser-verify-783-earth-detail.mjs` 와 같다:
 * `boundingSphere.radiusWorld / √3` 를 카메라 **right** 방향으로 밀어 투영한 뒤 중심과의 거리.
 * (`/ √3` 는 Babylon 의 boundingSphere 가 AABB 외접구라 구체 mesh 의 실반경보다 √3 배 크기
 * 때문이다.)
 *
 * @returns {Promise<{ cx: number, cy: number, r: number } | null>} 실패 시 null (보조 지표라
 *   판정에 영향을 주지 않으므로 조용히 생략한다)
 */
async function measureDiskBBox(page, bodyId) {
  // ⚠️ `meshes.get(id)` 는 **sphere variant** 다. `low` LOD 의 billboard 는 별도 Map 에 있어
  //    `low` 3행의 `diskR` 은 「화면에 실제로 그려진 것」이 아니라 sphere 기준값이다
  //    (PR #1126 reviewer S6). 이 지표는 **6/9 측정 + 3/9 개념 불일치**로 읽어야 한다.
  return page.evaluate((id) => {
    const scene = window.__simCore?.scene;
    const mesh = window.__solarScene?.meshes?.get(id);
    if (!scene || !mesh) return null;
    const camera = scene.activeCamera;
    if (!camera) return null;
    const engine = scene.getEngine();
    const rw = engine.getRenderWidth();
    const rh = engine.getRenderHeight();

    const Vector3 = mesh.getAbsolutePosition().constructor;
    const right = camera.getDirection(new Vector3(1, 0, 0));
    const center = mesh.getAbsolutePosition();
    const radiusWorld = mesh.getBoundingInfo().boundingSphere.radiusWorld / Math.sqrt(3);

    const idMat = mesh.getWorldMatrix().constructor.Identity();
    const transform = scene.getTransformMatrix();
    const vp = camera.viewport.toGlobal(rw, rh);
    const c = Vector3.Project(center, idMat, transform, vp);
    const e = Vector3.Project(center.add(right.scale(radiusWorld)), idMat, transform, vp);
    const r = Math.hypot(e.x - c.x, e.y - c.y);
    if (!Number.isFinite(r) || r <= 0) return null;
    // ⚠️ 렌더 해상도(rw/rh)를 함께 돌려준다 — 호출부가 `diskFrameShare` 를 스크린샷 픽셀 수로
    //    나누므로, devicePixelRatio ≠ 1 이면 두 좌표계가 어긋나 **조용히 틀린 비율**이 나온다
    //    (PR #1126 reviewer S7). 호출부에서 대조한다.
    return { cx: c.x, cy: c.y, r, rw, rh };
  }, bodyId);
}

/**
 * disk bbox **안에서만** diff 를 다시 잰다 (보조 지표).
 *
 * bbox 를 프레임 경계로 clamp 한 뒤 그 영역만 잘라 `pixelmatch` 를 재실행한다. 전체 diff 를
 * 재사용하지 않는 이유는 pixelmatch 가 반환하는 것이 **총계뿐**이라 영역별 분해가 안 되기
 * 때문이다.
 *
 * ⚠️ **잘라서 다시 재면 경계 픽셀의 anti-alias 판정이 달라진다** — crop 경계에서는 이웃 픽셀이
 * 없어 `pixelmatch` 의 AA 휴리스틱이 다르게 동작한다. 실측 편차는 최대 `119`px (상대 `0.49%`)로
 * 보조 지표의 해석을 바꾸지 않는 규모다 (PR #1126 reviewer S4).
 */
function computeDiskDiffPct(baselinePng, currentPng, disk) {
  const { width, height } = currentPng;
  const x0 = Math.max(0, Math.floor(disk.cx - disk.r));
  const y0 = Math.max(0, Math.floor(disk.cy - disk.r));
  const x1 = Math.min(width, Math.ceil(disk.cx + disk.r));
  const y1 = Math.min(height, Math.ceil(disk.cy + disk.r));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return null;

  const crop = (src) => {
    const out = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y += 1) {
      const srcStart = ((y0 + y) * width + x0) * 4;
      src.copy(out, y * w * 4, srcStart, srcStart + w * 4);
    }
    return out;
  };

  const diffPixels = pixelmatch(crop(baselinePng.data), crop(currentPng.data), null, w, h, {
    threshold: 0.1,
    includeAA: false,
  });
  return { pct: (diffPixels / (w * h)) * 100, w, h, diffPixels };
}

/**
 * tier + LOD 조합 적용 후 안정화 대기 → screenshot 캡처 → baseline diff.
 *
 * @param {import('playwright').Page} page `withBrowser` 콜백이 생성한 페이지 (#940 — 모듈 스코프
 *   `page` 클로저를 인자로 승격. 브라우저 수명주기가 콜백 안으로 들어가면서 필요해졌다)
 * @param {{ tier: string, lod: string }} combo
 * @returns {Promise<{ combo: string, diffPct: number, diskDiffPct: number | null,
 *   diskR: number | null, diskFrameShare: number | null, pass: boolean, reason: string }>}
 */
async function runCombo(page, combo) {
  const key = `${combo.tier}-${combo.lod}`;
  const baselinePath = join(baselineDir, `lod-${key}.png`);

  // 1. focus 전환 → __simCore.command 로 직접 호출 (FocusQuickButtons 는 4개만 노출).
  //    tier-transition.ts 의 runTierTransition 은 300ms dolly + 500ms lock 보장.
  //    추가 400ms margin 으로 animating 상태 완전 경과 (state.transitioning flag 부재 대안 — 파일 상단 주석 참조).
  const focusBodyId = TIER_FOCUS_BODY[combo.tier];
  const focusResult = await page.evaluate((bodyId) => {
    if (!window.__simCore || typeof window.__simCore.command !== 'function') {
      return { ok: false, reason: '__simCore.command 미노출' };
    }
    try {
      window.__simCore.command({ type: 'focusOn', bodyId });
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: String(err) };
    }
  }, focusBodyId);
  if (!focusResult.ok) {
    return {
      combo: key,
      diffPct: 100,
      diskDiffPct: null,
      diskR: null,
      diskFrameShare: null,
      pass: false,
      reason: `focus 실패 (${focusBodyId}): ${focusResult.reason}`,
    };
  }
  await page.waitForTimeout(1200);

  // 2. body tier 는 추가 zoom-in 필요 — focus-earth 만으로는 inner 로 남을 수 있음.
  //    지구 반경 × 5 공식이 body tier 판정 거리 (0.1 AU 임계 이하로 진입).
  if (combo.tier === 'body') {
    // scene API 로 직접 tier 강제 (테스트 안정성 우선).
    await page.evaluate(() => {
      window.__solarScene?.setTier?.('body');
    });
    await page.waitForTimeout(1200);
  }

  // 실제 tier 확인 (solar 는 확정, inner/body 는 허용 범위 넓게)
  const actualTier = await page.evaluate(() => window.__solarScene?.getTier?.());
  if (combo.tier === 'solar' && actualTier !== 'solar') {
    return {
      combo: key,
      diffPct: 100,
      diskDiffPct: null,
      diskR: null,
      diskFrameShare: null,
      pass: false,
      reason: `tier solar 전환 실패 (실제: ${actualTier})`,
    };
  }

  // 3. LOD override 설정 + 안정화 대기.
  await page.evaluate((lod) => {
    window.__solarScene?.setLodOverride?.(lod);
  }, combo.lod);
  // LOD 는 매 프레임 즉시 반영되지만 200ms cross-fade 가 있으므로 400ms 대기.
  await page.waitForTimeout(400);

  // 4. screenshot 캡처 + focus body disk bbox 측정 (보조 지표 — 판정 불변).
  //    캡처 «직전» 에 재는 이유는 두 값이 같은 카메라 상태를 가리켜야 하기 때문이다.
  const disk = await measureDiskBBox(page, focusBodyId);
  const screenshotBuffer = await page.screenshot({ type: 'png', fullPage: false });

  // 5. baseline 처리: 없으면 생성, 있으면 diff.
  if (!existsSync(baselinePath) || updateBaseline) {
    writeFileSync(baselinePath, screenshotBuffer);
    return {
      combo: key,
      diffPct: 0,
      diskDiffPct: null,
      diskR: null,
      diskFrameShare: null,
      pass: true,
      reason: updateBaseline ? 'baseline 갱신' : 'baseline 신규 생성',
    };
  }

  // 6. pixelmatch diff.
  const currentPng = PNG.sync.read(screenshotBuffer);
  const baselinePng = PNG.sync.read(readFileSync(baselinePath));

  if (currentPng.width !== baselinePng.width || currentPng.height !== baselinePng.height) {
    return {
      combo: key,
      diffPct: 100,
      diskDiffPct: null,
      diskR: null,
      diskFrameShare: null,
      pass: false,
      reason: `viewport 크기 불일치: baseline ${baselinePng.width}x${baselinePng.height} vs current ${currentPng.width}x${currentPng.height}`,
    };
  }

  const { width, height } = currentPng;
  const diffPng = new PNG({ width, height });
  const diffPixels = pixelmatch(baselinePng.data, currentPng.data, diffPng.data, width, height, {
    threshold: 0.1,
    includeAA: false,
  });
  const totalPixels = width * height;
  const diffPct = (diffPixels / totalPixels) * 100;

  // diff 시각화 PNG 는 .verify-screenshots/lod-diff/ 에 저장 (커밋 대상 아님, 디버그 용도)
  const diffPath = join(diffDir, `lod-${key}-diff.png`);
  writeFileSync(diffPath, PNG.sync.write(diffPng));

  // 보조 지표 — disk 안에서만 다시 잰 diff. **판정에 쓰지 않는다** (§diskDiffPct).
  // ⚠️ 렌더 해상도 ↔ 스크린샷 해상도가 어긋나면 좌표계가 달라 지표가 조용히 틀린다 (S7).
  //    보조 지표라 차단하지 않고 **생략 + 경고**한다 — 판정에는 영향이 없다.
  if (disk && (disk.rw !== width || disk.rh !== height)) {
    console.warn(
      `  [보조지표 생략] ${key}: 렌더 ${disk.rw}x${disk.rh} ≠ 스크린샷 ${width}x${height}` +
        ' (devicePixelRatio ≠ 1 로 추정 — diskDiffPct 좌표계 불일치)',
    );
  }
  const coordOk = disk && disk.rw === width && disk.rh === height;
  const diskInfo = coordOk ? computeDiskDiffPct(baselinePng, currentPng, disk) : null;

  return {
    combo: key,
    diffPct,
    diskDiffPct: diskInfo?.pct ?? null,
    diskR: coordOk ? disk.r : null,
    // disk 가 프레임에서 차지하는 면적 비율 = **표면만 바뀌었을 때** 프레임 대비 diff 의 상한.
    diskFrameShare: coordOk ? ((Math.PI * disk.r * disk.r) / totalPixels) * 100 : null,
    pass: diffPct < MAX_DIFF_PCT_THRESHOLD,
    reason:
      diffPct < MAX_DIFF_PCT_THRESHOLD
        ? `diff ${diffPct.toFixed(2)}% < ${MAX_DIFF_PCT_THRESHOLD}%`
        : `diff ${diffPct.toFixed(2)}% ≥ ${MAX_DIFF_PCT_THRESHOLD}% (회귀)`,
  };
}

// 최종 리포트.
console.log('\n========================================');
console.log('[D3b] LOD Screenshot diff 결과');
console.log('----------------------------------------');
const passCount = results.filter((r) => r.pass).length;
const failCount = results.length - passCount;
const maxDiffPct = Math.max(...results.map((r) => r.diffPct));

console.log(`  pass: ${passCount}/${results.length}`);
console.log(`  fail: ${failCount}`);
console.log(`  max diff: ${maxDiffPct.toFixed(2)}%`);
console.log(`  threshold: ${MAX_DIFF_PCT_THRESHOLD}%`);

// ── 보조 지표 (#1122) — 판정에 쓰지 않는다. §diskDiffPct 참조.
//    `상한` 이 임계보다 작은 조합은 **표면이 100% 바뀌어도 이 가드로는 FAIL 할 수 없다**.
// ⚠️ `!== null` 로 거르면 **`undefined` 가 통과한다.** 조기 반환 경로(focus 실패 / tier 실패 /
//    viewport 불일치 / baseline 신규 생성)는 이 키 자체를 만들지 않으므로, 타입으로 판정해야
//    `r.diskR.toFixed()` 가 TypeError 로 죽지 않는다 (PR #1126 reviewer B1 — baseline 신규
//    생성이 9/9 성공인데 exit 1 이 되는 회귀를 실증했다).
const diskRows = results.filter(
  (r) => typeof r.diskDiffPct === 'number' && typeof r.diskR === 'number',
);
if (diskRows.length > 0) {
  console.log('\n[보조] focus body disk 기준 (판정 무관 — #1122)');
  // ⚠️ 마지막 칸은 «disk 가 프레임에서 차지하는 비율» 이다. 「프레임 대비 diff 의 상한」이라고
  //    읽으면 옆 칸에 바로 반증된다 — 프레임 diff 에는 배경·별·HUD 변화가 함께 들어오므로
  //    disk 지분보다 큰 값이 정상이다. 이 칸이 뜻하는 것은 **표면만 바뀌었을 때의 상한**이다.
  console.log('  combo         diskR    frame대비 diff   disk대비 diff   disk 지분(표면 상한)');
  for (const r of diskRows) {
    const blind = r.diskFrameShare < MAX_DIFF_PCT_THRESHOLD ? '  ← 임계 도달 불가' : '';
    console.log(
      `  ${r.combo.padEnd(12)}  ${r.diskR.toFixed(1).padStart(6)}px` +
        `  ${r.diffPct.toFixed(2).padStart(10)}%` +
        `  ${r.diskDiffPct.toFixed(2).padStart(11)}%` +
        `  ${r.diskFrameShare.toFixed(2).padStart(9)}%${blind}`,
    );
  }
  const blindCount = diskRows.filter((r) => r.diskFrameShare < MAX_DIFF_PCT_THRESHOLD).length;
  if (blindCount > 0) {
    console.log(
      `\n  ⚠️ ${blindCount}/${diskRows.length} 조합은 focus body 표면이 100% 바뀌어도` +
        ` 프레임 대비 임계 ${MAX_DIFF_PCT_THRESHOLD}% 에 도달할 수 없다.`,
    );
    console.log('     표면 회귀는 지대별 verify 담당 (1119-earth-mask / 783-earth-detail).');
  }
}

if (consoleErrors.length > 0) {
  console.log('\n[console errors]');
  for (const err of consoleErrors) console.log(`  - ${err}`);
}

if (failCount > 0) {
  console.error('\n[FAIL] 1개 이상 조합이 임계 초과 또는 오류');
  process.exit(1);
}
console.log('\n[PASS] 9 조합 전체 통과\n');
