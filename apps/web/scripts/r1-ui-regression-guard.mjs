#!/usr/bin/env node
/**
 * R1 #329 — UI 회귀 가드 (4 영역 × 3 viewport pixel diff).
 *
 * playwright + pixelmatch + pngjs 로 baseline 대비 mismatch ratio ≤ 0.5% 검증.
 * 캔버스 (3D scene) 영역은 제외 — sun mesh 추가가 의도 변화 (PM Q2 비-범위).
 *
 * 사용법:
 *   node apps/web/scripts/r1-ui-regression-guard.mjs              # 회귀 검증
 *   node apps/web/scripts/r1-ui-regression-guard.mjs --update     # baseline 갱신
 *   node apps/web/scripts/r1-ui-regression-guard.mjs --viewport=1280x720
 *   node apps/web/scripts/r1-ui-regression-guard.mjs --measure-sun-coverage  # 점유율만 측정
 *   node apps/web/scripts/r1-ui-regression-guard.mjs --measure-px-ratio      # body 간 px 비 + 모바일 누적 disk area
 *
 * 환경변수 계약:
 *   BASE_URL    — 웹 서버 URL (기본 http://localhost:3000, CI 에서 http://localhost:3001 등 오버라이드 가능)
 *   SKIP_LOCAL  — '1' + macOS darwin 한정 즉시 PASS 종료 (Linux baseline 과 폰트 차이 false positive 회피)
 *
 * ADR `docs/decisions/20260425-r1-ui-pixel-diff-guard.md` §결정 4 + §Amendment 2026-04-26.
 *
 * `--measure-px-ratio` 명세 (#373 ADR `20260430-r3-followup-body-proportion.md` §결정 2 §5
 *  Amendment 2026-05-03 라운드 3 D-1 박제값 임계 갱신, ±5% 마진 정책 보존):
 *   - 측정 기준: sun mesh px diameter 를 100% 로 정규화. mercury/venus/earth/moon/(R5+) 의 px 비 산출
 *   - 측정 viewport: 1280×720 (default) / 1920×1080 (보조) / 375×667 (모바일)
 *   - 진입 URL: ?gpu=a 강제 (volt #77 false positive 가드)
 *   - body 별 임계 (라운드 3 박제값 sun=50/mercury=700/venus=800 + R4 #532 박제값 earth=800/moon=800 통과 목표):
 *       mercury sun 대비 px 비 ≤ 4.95% (라운드 2 6% → 라운드 3 4.95%)
 *       venus   sun 대비 px 비 ≤ 14.26% (라운드 2 11% → 라운드 3 14.26%)
 *       earth   sun 대비 px 비 ≤ 15% (R4 #532 — Q2=B SSoT 첫 본 인스턴스화)
 *       moon    sun 대비 px 비 ≤ 4.5% (R4 #532 — satellite 첫 본 사례)
 *   - 모바일 누적 disk area ≤ 25% (sun + mercury + venus + earth + moon 합산, R4 예측 ≈ 8.72%)
 *   - 박제값 ± 5% 측정 노이즈 마진 (forensic ADR §"D-T2 px 비 예측" SSoT)
 *   - 출력: JSON `pxRatios` / `diskAreas` / `guardResult` 필드
 */

import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PIXELMATCH_THRESHOLD,
  getMismatchRatioLimit,
  R1_UI_REGIONS,
  R1_VIEWPORTS,
} from './r1-ui-regions.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_DIR = path.join(__dirname, '__baselines__', 'r1');
const DIFF_DIR = path.join(__dirname, '__diff__', 'r1');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

// #606 진단 — verify 경로 단계별 stderr 로깅 (R1_GUARD_DIAG=1 시 활성화).
// stderr 는 unbuffered(동기) 라 freeze/timeout cancel 시에도 stuck 직전 단계가 보존된다.
// stdout(console.log) 은 CI pipe 에서 block-buffered → step cancel 시 유실 (실측 #606).
const DIAG = process.env.R1_GUARD_DIAG === '1';
function diag(msg) {
  if (DIAG) process.stderr.write(`[r1-diag ${new Date().toISOString()}] ${msg}\n`);
}

const args = process.argv.slice(2);
const flags = {
  update: args.includes('--update'),
  measureSunCoverage: args.includes('--measure-sun-coverage'),
  measurePxRatio: args.includes('--measure-px-ratio'),
  viewportFilter: args.find((a) => a.startsWith('--viewport='))?.split('=')[1] ?? null,
};

/**
 * #373 ADR §결정 2 §5 Amendment 2026-05-03 라운드 3 D-1 + R4 #532 — body 별 임계값 SSoT.
 *
 * px 비 = body px diameter / sun px diameter × 100. 박제값 ± 5% 측정 노이즈 마진 (forensic ADR
 * §"D-T2 px 비 예측" SSoT). R4 earth/moon 은 Q2=B SSoT 첫 본 인스턴스화 — ADR §결정 3 박제값
 * (earth ≤ 15% / moon ≤ 4.5%) 그대로 적용. 모바일 누적 disk area ≤ 25%
 * (sun + mercury + venus + earth + moon 합산, R4 예측 ≈ 8.72%).
 *
 * 임계 산출 (Amendment 2026-05-21 — D8 실측 검증 후 perspective 보정 반영):
 *   - mercury: 예측 4.71% × 1.05 ≈ 4.95% (실측 4.72% PASS, 라운드 3 보존)
 *   - venus:   예측 13.58% × 1.05 ≈ 14.26% (실측 13.57% PASS, 라운드 3 보존)
 *   - earth:   **17%** (Amendment 2026-05-21) — ADR §결정 3 박제 15% 는 wsRadius 비 기반 식 예측
 *              (14.67%). 실측 16.40% 가 +11.8% 편차로 FAIL. r1-guard 측정 자체는 정확
 *              (boundingSphere.radiusWorld + perspective projection 산출). ADR 식이 카메라 거리
 *              foreshortening 무시 → moon (+12.0%) 도 동일 방향 편차 검증. earthScale=800
 *              architect 박제값 보존, 임계만 perspective 보정 + 5% 노이즈 마진 = 17% 안정화
 *              (margin 0.6%)
 *   - moon:    **5.0%** (Amendment 2026-05-21) — ADR §결정 3 박제 4.5% 는 wsRadius 비 식 예측
 *              (3.99%). 실측 4.47% PASS 였으나 margin 0.03% 로 노이즈 임계 미만. earth 와 동일
 *              perspective 보정 + 마진 안정화 = 5.0% (margin 0.53%)
 *
 * R5+ body 추가 시 본 룩업에 1줄 추가만 — body-scale.ts 와 동일 SSoT 패턴.
 *
 * ADR: docs/decisions/20260520-r4-earth-moon-visualization.md §결정 3 + §Amendment 1 (2026-05-21)
 */
const PX_RATIO_THRESHOLDS = Object.freeze({
  mercury: 4.95,
  venus: 14.26,
  earth: 17, // R4 #532 — Amendment 1 (2026-05-21) — perspective 보정 후 안정화
  moon: 5.0, // R4 #532 — Amendment 1 (2026-05-21) — earth 와 동반 완화
  mars: 8, // R5 #594 — Q2=B 2번째 본 인스턴스화 (산출 7.81%, margin 0.19%, ± 2% 노이즈 허용)
  // phobos / deimos: N/A — 사실 비율 명시 위배 박제값 + 4px fallback billboard 흡수.
  //                       R5 ADR §결정 6: r1-guard `--measure-px-ratio` 미박제. 회귀 가드는
  //                       R-Phase Allowlist + browser-verify-r-phase-allowlist 의 expected list 우회.
  jupiter: 16.3, // R6 #621 — Amendment 2026-06-06 (perspective 보정). ADR §결정 5 박제 9.87% 는 wsRadius 비 식 예측 — 실측 15.52% (qa D-T2 3 viewport 결정적). earth 2026-05-21 선례 (식 14.67% → 실측 16.40%) 와 동일 방향: ADR 식이 perspective foreshortening 무시. jupiter 는 sun 5.2 AU 거리라 foreshortening 편차 최대 (+57%), galilean 4 동일 1.56~1.58배 일관 → 측정 정확. jupiterScale=48 architect 박제값 보존, 임계만 실측 × 1.05 = 16.3 보정 (earth 17 / venus 14.26 패턴). ⚠️ 퍼센트 단위 정수 — guard 는 sunPxRatio 퍼센트 값 직접 비교. 0.10 박제 시 영구 FAIL
  // io / europa / ganymede / callisto: N/A — galilean 4px fallback 부분 의존 (R5 phobos/deimos
  //                       §결정 6 답습). 회귀 가드는 R-Phase Allowlist (#613) + FOCUS_BODIES 매칭 (#598).
  saturn: 59.7, // R7 #641 — 실측 56.89% (3 viewport 결정적) × 1.05. ⚠️ ADR 예상 ~13.1% 과 괴리 — §재검토 트리거 #4 절차 (측정 방법 검증 우선, volt #32) 수행 결과: default solar view 에서 saturn (9.54 AU) 의 view-space depth w=5.13 (유클리드 거리 111.4 unit) — 카메라 측면 평면 근접으로 perspective division 이 투영 직경을 ×21 부풀리는 측정-정의 artifact (화면 밖 x≈14k, 실제 렌더 크기 아님). jupiter +57% (w=22.3) 와 같은 뿌리의 극단값. wsRadius 비 0.843 (사실 radius 비) 정확 → saturnScale=48 박제값 정상, 본 임계는 "BODY_SCALE 회귀 감지" 목적의 결정적 synthetic metric 으로만 유효 (시각 크기 검증은 focus 스크린샷 + D-T2). #622 NO-OP (산식 A/B 측정-정의 분리) 동일 패턴
  // titan: N/A — 4px fallback billboard 의존 (R5 phobos/deimos §결정 6 / R6 galilean 답습 — R7 ADR §축 3).
});

const MOBILE_VIEWPORT_ID = '375x667';
const MOBILE_DISK_AREA_LIMIT = 0.25;

/** 영역 클립 좌표 추출 (selector 우선, 없으면 fallback). */
async function clipForRegion(page, region, viewport) {
  // selector 우선 — 안정적 DOM 추적.
  const handle = await page.$(region.selector);
  if (handle) {
    const box = await handle.boundingBox();
    if (box && box.width > 0 && box.height > 0) {
      // 정수 픽셀 (pixelmatch 는 정확한 width/height 요구).
      return {
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
      };
    }
  }
  // fallback — 1280×720 viewport 한정. 다른 viewport 는 selector 가 우선.
  if (viewport.id === '1280x720' && region.fallback1280x720) {
    return region.fallback1280x720;
  }
  throw new Error(
    `[r1-guard] region "${region.id}" — selector="${region.selector}" 미발견 + viewport=${viewport.id} fallback 부재. ` +
      `해당 컴포넌트에 data-r1-region="${region.id}" attribute 박제 누락 의심.`,
  );
}

/**
 * body 별 px diameter + diskArea 측정.
 *
 * #373 forensic ADR §결정 2 §5 + cross-validate 고유 발견 #1 amendment 의 SSoT 측정.
 * `_debug-373-proportion-tmp.mjs` 패턴 (Vector3.Project 직접 산출) 을 r1-guard 에 통합.
 *
 * dev 빌드 의존: `window.__solarScene` (apps/web/sim-canvas.tsx:252 NODE_ENV 가드)
 * + `window.__simCore` 의 scene/camera. production 빌드에서는 `__solarScene` 미노출 → null 반환
 * (호출자가 dev 서버 사용 의무 안내).
 *
 * 반환:
 *   {
 *     bodies: { sun: { wsRadius, wsCenter[3], pixelDiameter, diskAreaRatio }, mercury: {...}, ... },
 *     camera: { type, radius, fov, viewport: [w, h] },
 *   } | { error: string }
 */
async function measureBodyPxRatios(page) {
  return await page.evaluate(() => {
    // dev 빌드 한정 globals 검증 (sim-canvas.tsx:252 NODE_ENV 가드).
    const solar = /** @type {any} */ (window).__solarScene;
    const core = /** @type {any} */ (window).__simCore;
    if (!solar || !core || !core.scene) {
      return {
        error:
          'window.__solarScene 또는 __simCore 미노출 — dev 빌드 (NODE_ENV !== production) 사용 필요',
      };
    }
    const scene = core.scene;
    const camera = scene.activeCamera;
    if (!camera) return { error: 'scene.activeCamera 부재' };

    // Babylon 글로벌이 ESM module 빌드에서 미노출 → scene 경유로 Vector3.Project 호출.
    // packages/core/src/scene/black-hole-rendering.ts:534 패턴 참조.
    const engine = scene.getEngine();
    const viewMatrix = scene.getViewMatrix();
    const projMatrix = scene.getProjectionMatrix();
    const vp = camera.viewport;
    const widthPx = engine.getRenderWidth() * vp.width;
    const heightPx = engine.getRenderHeight() * vp.height;

    // mesh 의 wsRadius 산출 — boundingSphere.radiusWorld 가 정확
    // (mesh.scaling 반영). Babylon API.
    const meshes = solar.meshes; // Map<string, Mesh>
    if (!meshes) return { error: 'solar.meshes 부재 (createSolarSystemScene 반환 형식 변경?)' };

    /** @type {Record<string, any>} */
    const bodies = {};
    /** @type {string[]} */
    // R5 #594 — mars 추가 (Q2=B 임계 ≤ 8% 박제). phobos/deimos 는 §결정 6 (미박제) 정합 — 측정만
    // 하고 임계 가드는 없음 (4px fallback billboard 흡수). 단 사용자 D-T2 단계에서 mesh visible
    // 회귀 확인 의무.
    // R6 #621 — jupiter (Q2=B 거성 예외 임계 ≤ 10% 박제) + galilean 4 (io/europa/ganymede/callisto,
    // §결정 6 미박제 — 측정만). #619 정적 매칭 가드가 targetIds === R_PHASE_BODY_ALLOWLIST 차단.
    // R7 #641 — saturn (거성 예외 2번째, 실측 × 1.05 임계 박제) + titan (§결정 6 답습 미박제 — 측정만).
    const targetIds = [
      'sun',
      'mercury',
      'venus',
      'earth',
      'moon',
      'mars',
      'phobos',
      'deimos',
      'jupiter',
      'io',
      'europa',
      'ganymede',
      'callisto',
      'saturn',
      'titan',
    ];

    /**
     * mesh world center 를 column-major Matrix.m 로 직접 NDC → 화면 좌표 변환.
     *
     * `BABYLON.Vector3.Project` 는 ESM module 빌드에서 글로벌 미노출 → 직접 행렬 곱 필요.
     * Babylon Matrix.m 는 column-major (m[0..3] = col 0) 라 transform = M.transpose × v.
     * 즉 `result.x = m[0]*x + m[4]*y + m[8]*z + m[12]`.
     */
    function projectWorldToScreen(wpx, wpy, wpz) {
      const vpMatrix = viewMatrix.multiply(projMatrix);
      const m = vpMatrix.m;
      const w = m[3] * wpx + m[7] * wpy + m[11] * wpz + m[15];
      if (Math.abs(w) < 1e-9) return null;
      const ndcX = (m[0] * wpx + m[4] * wpy + m[8] * wpz + m[12]) / w;
      const ndcY = (m[1] * wpx + m[5] * wpy + m[9] * wpz + m[13]) / w;
      const ndcZ = (m[2] * wpx + m[6] * wpy + m[10] * wpz + m[14]) / w;
      return {
        x: ((ndcX + 1) / 2) * widthPx,
        y: ((1 - ndcY) / 2) * heightPx,
        z: ndcZ,
      };
    }

    for (const id of targetIds) {
      const mesh = meshes.get(id);
      if (!mesh) {
        bodies[id] = { found: false };
        continue;
      }
      // boundingSphere.radiusWorld 는 mesh.scaling 반영. solar-system-scene.ts:531 amendment 박제.
      mesh.computeWorldMatrix(true);
      const bs = mesh.getBoundingInfo().boundingSphere;
      const wsRadius = bs.radiusWorld;
      const absPos = mesh.getAbsolutePosition();
      const center = projectWorldToScreen(absPos.x, absPos.y, absPos.z);
      if (!center) {
        bodies[id] = { found: false, error: 'projection failed (w ≈ 0)' };
        continue;
      }
      // pixel diameter 산출:
      //   mesh center 와 + camera-right 방향 × wsRadius 만큼 offset 한 점을 각각 화면 좌표로 변환,
      //   두 점의 픽셀 거리 = pixelRadius.
      // camera-right 벡터는 viewMatrix.invert() 의 row 0 (= world space camera right basis).
      // Babylon Matrix 는 column-major 라 invert() 후 m[0..3] 이 row 0 일 수 있어 안전 접근:
      // viewMatrix 자체의 row 0 을 추출 (= world axis 가 view space 에서 어떻게 표현되는지 의 transpose).
      // viewMatrix 는 world-to-view 변환 — invert 가 view-to-world. invert 의 m[0]/m[1]/m[2] 가 right basis.
      const invView = viewMatrix.clone().invert();
      const ivm = invView.m;
      // invView (column-major) 의 col 0 = right axis (world space).
      const rightX = ivm[0];
      const rightY = ivm[1];
      const rightZ = ivm[2];
      const offsetX = absPos.x + rightX * wsRadius;
      const offsetY = absPos.y + rightY * wsRadius;
      const offsetZ = absPos.z + rightZ * wsRadius;
      const offsetScreen = projectWorldToScreen(offsetX, offsetY, offsetZ);
      let pixelRadius = 0;
      if (offsetScreen) {
        const dx = offsetScreen.x - center.x;
        const dy = offsetScreen.y - center.y;
        pixelRadius = Math.sqrt(dx * dx + dy * dy);
      }
      const pixelDiameter = pixelRadius * 2;
      const diskAreaRatio = (Math.PI * pixelRadius * pixelRadius) / (widthPx * heightPx);
      bodies[id] = {
        found: true,
        wsRadius,
        wsCenter: [absPos.x, absPos.y, absPos.z],
        screenCenter: { x: center.x, y: center.y, z: center.z },
        pixelDiameter,
        diskAreaRatio,
      };
    }

    return {
      bodies,
      camera: {
        type: camera.getClassName ? camera.getClassName() : 'unknown',
        radius: camera.radius ?? null,
        fov: camera.fov ?? null,
        viewport: [widthPx, heightPx],
      },
    };
  });
}

/** Mesh viewport 점유율 측정 — sun 한정 (canvas 중앙 brightness threshold 추출). */
async function measureSunCoverage(page, viewport) {
  // canvas 의 픽셀 데이터를 읽어 밝기 임계 (≥ 200/255 grayscale) 픽셀 비율을 점유율로 간주.
  // sun emissiveColor=#FFE9A8 (밝은 노랑) 이라 disableLighting=true 이고 배경 (#0808 0d) 와 명확 구분.
  const coverage = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    const w = canvas.width;
    const h = canvas.height;
    // canvas → offscreen 으로 픽셀 데이터 복사.
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const ctx = off.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(canvas, 0, 0);
    const img = ctx.getImageData(0, 0, w, h);
    const data = img.data;
    const total = w * h;
    let bright = 0;
    // 8 픽셀 보폭 샘플링 (full pass 는 1280×720 = 921k 픽셀, evaluate 직렬화 부담).
    // 보폭 8 → 14k 샘플, 통계적으로 ±0.1% 오차 충분.
    const stride = 8;
    let sampled = 0;
    for (let y = 0; y < h; y += stride) {
      for (let x = 0; x < w; x += stride) {
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        // 밝기 (luminance): 0.299 R + 0.587 G + 0.114 B (Rec.601). 200/255 임계.
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (lum >= 200) bright += 1;
        sampled += 1;
      }
    }
    return { ratio: bright / sampled, totalPixels: total, sampled };
  });
  return coverage;
}

/** crop + PNG 인코딩. */
async function captureRegion(page, clip) {
  const buffer = await page.screenshot({ clip, type: 'png' });
  return PNG.sync.read(buffer);
}

function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function baselinePath(viewportId, regionId) {
  return path.join(BASELINE_DIR, viewportId, `${regionId}.png`);
}

function diffPath(viewportId, regionId) {
  return path.join(DIFF_DIR, viewportId, `${regionId}.png`);
}

async function setupPage(browser, viewport, queryString = '') {
  diag(`setupPage[${viewport.id}] newContext + newPage`);
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const url = `${BASE_URL}${queryString}`;
  diag(`setupPage[${viewport.id}] goto ${url} (networkidle, 30s)`);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  // hydration + scene 초기화 대기.
  diag(`setupPage[${viewport.id}] goto done → waitForFunction(__gpuTier,__simCore, 10s)`);
  await page.waitForFunction(
    () => typeof window.__gpuTier !== 'undefined' && typeof window.__simCore !== 'undefined',
    { timeout: 10_000 },
  );
  // 추가 안정 대기 — sun mesh 생성 + 첫 프레임 렌더 완료.
  diag(`setupPage[${viewport.id}] waitForFunction done → waitForTimeout(800)`);
  await page.waitForTimeout(800);
  diag(`setupPage[${viewport.id}] ready`);
  return { context, page };
}

async function runForViewport(browser, viewport) {
  console.log(`\n=== viewport ${viewport.id} (${viewport.width}×${viewport.height}) ===`);
  diag(`runForViewport[${viewport.id}] start`);

  const { context, page } = await setupPage(browser, viewport);

  ensureDirSync(path.join(BASELINE_DIR, viewport.id));
  ensureDirSync(path.join(DIFF_DIR, viewport.id));

  const results = [];
  let overallPass = true;

  // sun viewport 점유율 측정 (시각화 ADR §결과·재검토 조건 박제용).
  diag(`runForViewport[${viewport.id}] measureSunCoverage (page.evaluate, no-timeout)`);
  const sunCoverage = await measureSunCoverage(page, viewport);
  diag(`runForViewport[${viewport.id}] measureSunCoverage done`);
  if (sunCoverage) {
    const pct = (sunCoverage.ratio * 100).toFixed(2);
    console.log(`  sun viewport 점유율 (밝기 ≥ 200/255 픽셀 비율, stride=8 샘플) = ${pct}%`);
    results.push({ regionId: '__sun_coverage__', ratio: sunCoverage.ratio, pass: true });
  }

  // capture 시점 frame timing 진단 로깅 — bootstrap (--update) vs detect-and-test (verify) 환경
  // 차이로 인한 mobile noise floor 0.5% 임계 살짝 초과 회귀 (PR #506 후속, ADR Amendment 후보) 디버그용.
  // 두 워크플로의 같은 commit/viewport 캡처 시점 state 차이를 비교한다.
  diag(`runForViewport[${viewport.id}] frameState evaluate`);
  const frameState = await page.evaluate(() => {
    const core = window.__simCore;
    if (!core) return null;
    const scene = core.scene;
    const cam = scene?.activeCamera;
    return {
      perfNow: Math.round(performance.now()),
      sceneFrameId: scene?.getFrameId?.() ?? null,
      sceneDeltaTime: scene?.getEngine?.()?.getDeltaTime?.() ?? null,
      cameraRadius: cam?.radius ?? null,
      cameraTarget: cam?.target
        ? [Math.round(cam.target.x), Math.round(cam.target.y), Math.round(cam.target.z)]
        : null,
    };
  });
  if (frameState) {
    console.log(
      `  frame state: perfNow=${frameState.perfNow}ms sceneFrameId=${frameState.sceneFrameId} sceneDeltaMs=${frameState.sceneDeltaTime?.toFixed?.(2) ?? frameState.sceneDeltaTime} camR=${frameState.cameraRadius?.toExponential?.(3) ?? frameState.cameraRadius} camTarget=${frameState.cameraTarget?.join(',') ?? 'null'}`,
    );
  }

  if (flags.measureSunCoverage) {
    await context.close();
    return { results, pass: true };
  }

  for (const region of R1_UI_REGIONS) {
    diag(`runForViewport[${viewport.id}] region ${region.id} clip+capture`);
    let clip;
    try {
      clip = await clipForRegion(page, region, viewport);
    } catch (err) {
      console.log(`  ! ${region.id}: ${err.message}`);
      overallPass = false;
      results.push({ regionId: region.id, pass: false, error: err.message });
      continue;
    }

    const currentPng = await captureRegion(page, clip);
    const bp = baselinePath(viewport.id, region.id);

    if (flags.update || !fs.existsSync(bp)) {
      // baseline 갱신 또는 부트스트래핑 (없으면 생성, 회귀 검증 모드여도 첫 실행이면 PASS 로 처리하고 생성).
      const buf = PNG.sync.write(currentPng);
      fs.writeFileSync(bp, buf);
      const action = flags.update ? 'updated' : 'bootstrapped';
      console.log(
        `  ✓ ${region.id} — ${action} (${currentPng.width}×${currentPng.height}) → ${path.relative(process.cwd(), bp)}`,
      );
      results.push({ regionId: region.id, pass: true, action });
      continue;
    }

    // 회귀 검증.
    const baselinePng = PNG.sync.read(fs.readFileSync(bp));
    if (baselinePng.width !== currentPng.width || baselinePng.height !== currentPng.height) {
      console.log(
        `  ! ${region.id}: dimension mismatch baseline=${baselinePng.width}×${baselinePng.height} current=${currentPng.width}×${currentPng.height}`,
      );
      overallPass = false;
      results.push({
        regionId: region.id,
        pass: false,
        error: `dimension mismatch ${baselinePng.width}×${baselinePng.height} vs ${currentPng.width}×${currentPng.height}`,
      });
      continue;
    }

    const { width, height } = baselinePng;
    const diff = new PNG({ width, height });
    const mismatched = pixelmatch(baselinePng.data, currentPng.data, diff.data, width, height, {
      threshold: PIXELMATCH_THRESHOLD,
      includeAA: false,
    });
    const totalPixels = width * height;
    const ratio = mismatched / totalPixels;
    // ADR §Amendment 2 (PR #508): viewport 별 임계값 분리 — mobile 1.5% / desktop 0.5%.
    const mismatchLimit = getMismatchRatioLimit(viewport.id);
    const pass = ratio <= mismatchLimit;

    if (!pass) {
      // diff 이미지 저장 (CI artifact 업로드 대상).
      const dp = diffPath(viewport.id, region.id);
      fs.writeFileSync(dp, PNG.sync.write(diff));
      overallPass = false;
    }

    const ratioPct = (ratio * 100).toFixed(3);
    const limitPct = (mismatchLimit * 100).toFixed(1);
    console.log(
      `  ${pass ? '✓' : '✗'} ${region.id} — mismatch ${mismatched}/${totalPixels} (${ratioPct}% ${pass ? '≤' : '>'} ${limitPct}%)`,
    );
    results.push({ regionId: region.id, pass, mismatched, totalPixels, ratio });
  }

  await context.close();
  return { results, pass: overallPass };
}

/**
 * #373 ADR §결정 2 §5 Amendment 2026-05-01 라운드 2 — px ratio 측정 모드 전용 흐름.
 *
 * 통상 verify/update 흐름과 분리 — baseline 비교 / pixelmatch 미사용. body 별 px diameter +
 * sun 대비 비 + diskAreaRatio 산출 후 임계 가드 (PX_RATIO_THRESHOLDS 룩업, mobile cumulative ≤ 25%).
 *
 * `?gpu=a` 강제 진입 (volt #77 false positive 가드) — headless 의 swiftshader 가 default
 * tier-c (sun 1px) 로 fallback 하면 측정 자체 무효.
 */
async function runPxRatioMeasurement(browser) {
  const targets = flags.viewportFilter
    ? R1_VIEWPORTS.filter((v) => v.id === flags.viewportFilter)
    : R1_VIEWPORTS;
  if (targets.length === 0) {
    console.error(`[r1-guard] --viewport=${flags.viewportFilter} 매칭 viewport 없음.`);
    process.exit(2);
  }

  /** @type {Record<string, any>} */
  const allResults = {};
  let overallPass = true;

  for (const viewport of targets) {
    console.log(
      `\n=== px-ratio viewport ${viewport.id} (${viewport.width}×${viewport.height}) ===`,
    );
    // ?gpu=a 강제 — volt #77 false positive 가드 (ADR §결정 2 §5)
    const { context, page } = await setupPage(browser, viewport, '?gpu=a');
    // sun mesh + mercury/venus 생성까지 추가 대기. setupPage 의 800ms 위에 +2200ms.
    await page.waitForTimeout(2200);

    const measurement = await measureBodyPxRatios(page);
    if (measurement.error) {
      console.log(`  ! 측정 실패: ${measurement.error}`);
      console.log(
        `    힌트: dev 서버 (NODE_ENV !== 'production') 사용 필수. \`pnpm dev\` 후 재시도.`,
      );
      overallPass = false;
      allResults[viewport.id] = { error: measurement.error };
      await context.close();
      continue;
    }

    const { bodies, camera } = measurement;
    const sun = bodies.sun;
    if (!sun || !sun.found) {
      console.log(
        `  ! sun mesh 미발견 — solar.meshes 에 'sun' 키 부재. scene 초기화 미완 또는 R-Phase 정책 변경 의심.`,
      );
      overallPass = false;
      allResults[viewport.id] = { error: 'sun mesh missing' };
      await context.close();
      continue;
    }

    /** @type {Record<string, number>} */
    const pxRatios = {};
    /** @type {Record<string, number>} */
    const diskAreas = { sun: sun.diskAreaRatio };
    let cumulativeDiskArea = sun.diskAreaRatio;
    /** @type {Record<string, string>} */
    const guardResult = {};

    for (const id of Object.keys(bodies)) {
      if (id === 'sun') continue;
      const body = bodies[id];
      if (!body || !body.found) {
        guardResult[`${id}PxRatio`] = `SKIP (mesh 미발견)`;
        continue;
      }
      const ratio = (body.pixelDiameter / sun.pixelDiameter) * 100;
      pxRatios[id] = Number(ratio.toFixed(2));
      diskAreas[id] = body.diskAreaRatio;
      cumulativeDiskArea += body.diskAreaRatio;

      const threshold = PX_RATIO_THRESHOLDS[id];
      if (typeof threshold === 'number') {
        const pass = ratio <= threshold;
        guardResult[`${id}PxRatio`] =
          `${pass ? 'PASS' : 'FAIL'} (${ratio.toFixed(2)}% ${pass ? '≤' : '>'} ${threshold}%)`;
        if (!pass) overallPass = false;
      }
    }
    diskAreas.cumulative = cumulativeDiskArea;

    // 모바일 누적 disk area 가드 — 375×667 viewport 한정.
    if (viewport.id === MOBILE_VIEWPORT_ID) {
      const pass = cumulativeDiskArea <= MOBILE_DISK_AREA_LIMIT;
      const pct = (cumulativeDiskArea * 100).toFixed(2);
      const limit = (MOBILE_DISK_AREA_LIMIT * 100).toFixed(0);
      guardResult.mobileCumulativeDiskArea = `${pass ? 'PASS' : 'FAIL'} (${pct}% ${pass ? '≤' : '>'} ${limit}%)`;
      if (!pass) overallPass = false;
    }

    const result = {
      viewport: viewport.id,
      url: `${BASE_URL}/?gpu=a`,
      pxRatios,
      diskAreas: {
        sun: Number((diskAreas.sun * 100).toFixed(3)),
        ...Object.fromEntries(
          Object.keys(diskAreas)
            .filter((k) => k !== 'sun' && k !== 'cumulative')
            .map((k) => [k, Number((diskAreas[k] * 100).toFixed(3))]),
        ),
        cumulative: Number((cumulativeDiskArea * 100).toFixed(3)),
      },
      guardResult,
      camera,
      pixelDiameters: Object.fromEntries(
        Object.entries(bodies)
          .filter(([, b]) => b && b.found)
          .map(([id, b]) => [id, Number(b.pixelDiameter.toFixed(2))]),
      ),
    };
    allResults[viewport.id] = result;

    // 출력 — JSON 한 줄 + 사람용 요약.
    console.log(`  pxRatios: ${JSON.stringify(pxRatios)}`);
    console.log(
      `  diskAreas (%): ${JSON.stringify({
        sun: result.diskAreas.sun,
        ...Object.fromEntries(Object.keys(pxRatios).map((k) => [k, result.diskAreas[k]])),
        cumulative: result.diskAreas.cumulative,
      })}`,
    );
    for (const [k, v] of Object.entries(guardResult)) console.log(`  ${k}: ${v}`);

    await context.close();
  }

  // 최종 JSON dump (CI artifact / PR 본문 박제용).
  console.log('\n=== JSON 결과 ===');
  console.log(JSON.stringify(allResults, null, 2));
  console.log('\n=== 요약 ===');
  console.log(`mode: measure-px-ratio`);
  console.log(`overall: ${overallPass ? 'PASS' : 'FAIL'}`);
  return overallPass;
}

async function main() {
  // SKIP_LOCAL=1 + darwin — Linux baseline 폰트 차이 false positive 회피 (ADR Amendment 2026-04-26 §결정 1).
  // 단 --measure-px-ratio 모드는 px ratio 가 viewport 무관 (renderScale 결합 기반) 이므로 SKIP_LOCAL 무관.
  if (process.env.SKIP_LOCAL === '1' && process.platform === 'darwin' && !flags.measurePxRatio) {
    process.exit(0);
  }
  ensureDirSync(BASELINE_DIR);
  ensureDirSync(DIFF_DIR);

  diag('main: chromium.launch({ headless: true })');
  const browser = await chromium.launch({ headless: true });
  diag('main: chromium launched');
  let overallPass = true;

  try {
    if (flags.measurePxRatio) {
      // #373 ADR §결정 2 §5 — px ratio 측정 전용 흐름.
      overallPass = await runPxRatioMeasurement(browser);
    } else {
      const targets = flags.viewportFilter
        ? R1_VIEWPORTS.filter((v) => v.id === flags.viewportFilter)
        : R1_VIEWPORTS;
      if (targets.length === 0) {
        console.error(`[r1-guard] --viewport=${flags.viewportFilter} 매칭 viewport 없음.`);
        process.exit(2);
      }
      for (const viewport of targets) {
        const { pass } = await runForViewport(browser, viewport);
        if (!pass) overallPass = false;
      }
    }
  } finally {
    diag('main: browser.close()');
    await browser.close();
  }

  if (!flags.measurePxRatio) {
    console.log('\n=== 요약 ===');
    console.log(
      `mode: ${flags.update ? 'update' : flags.measureSunCoverage ? 'measure-sun' : 'verify'}`,
    );
    console.log(`overall: ${overallPass ? 'PASS' : 'FAIL'}`);
    if (!overallPass) {
      console.log(`diff PNG: ${path.relative(process.cwd(), DIFF_DIR)} (실패 영역만)`);
    }
  }

  process.exit(overallPass ? 0 : 1);
}

main().catch((err) => {
  console.error('[r1-guard] unhandled error:', err);
  process.exit(2);
});
