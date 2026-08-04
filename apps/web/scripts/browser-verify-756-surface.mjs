#!/usr/bin/env node
/**
 * #756 — 절차적 행성 표면 셰이더 qa 동적 검증.
 *
 * 실 Chrome GUI (headless: false, channel: chrome) — WebGPU swiftshader freeze 회피 (#663).
 * 픽셀 측정 = composited canvas.screenshot() (PNG) → 페이지 내 Image 디코드 → 2D getImageData.
 *   ⚠️ WebGPU drawImage readback 빈버퍼 함정 회피 (#728 SSoT) — page.evaluate 내 2D canvas 경로만.
 *
 * disk 영역만 샘플: __simCore.scene.activeCamera 로 mesh bounding box 8 corner 화면 투영 →
 *   그 bbox 픽셀만 분석 (UI / 궤도선 / glow 오염 제외).
 *
 * 판정 (#759 — shader-pixel-guard CI 상시 가드, ADR 20260705-759 결정 3):
 *   per-body 상대 성질만 (절대 임계 금지 — swiftshader/하드웨어 값 편차).
 *   4 body 각각 hfEntropy(ON) − hfEntropy(OFF) ≥ HF_ENTROPY_MARGIN + tier-c 저디테일
 *   (lodStats 배선 검증 — override='low' && high/mid 0, 판정 블록 주석 참조).
 *   미충족 시 exit 1 (fail-fast).
 *
 * 사용법:
 *   node apps/web/scripts/browser-verify-756-surface.mjs               # 실 Chrome GUI
 *   HEADFUL=0 node apps/web/scripts/browser-verify-756-surface.mjs     # CI 폴백 (headless)
 *   SWIFTSHADER=1 node ...                                             # CI(ubuntu 소프트웨어 렌더) 로컬 재현
 *                                                                      #   (headless + --use-angle=swiftshader 강제)
 *   CAPTURE_DIR=/abs/dir node ...                                      # 캡처 PNG 저장
 */

import { chromium } from 'playwright';
import { withBrowser } from '../../../scripts/browser-verify-utils.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const CAPTURE_DIR = process.env.CAPTURE_DIR ?? null;
const HEADFUL = process.env.HEADFUL !== '0';
// #759 — CI 실패 로컬 재현 경로 (ADR 20260705-759 §교차검증 부분 수용 3).
// GitHub ubuntu runner 는 GPU 부재로 headless chromium 이 SwiftShader 로 렌더한다.
// SWIFTSHADER=1 은 그 환경을 로컬에서 명시 재현 (--use-angle=swiftshader).
const SWIFTSHADER = process.env.SWIFTSHADER === '1';

/**
 * #759 판정 마진 (가산, hfEntropy ON−OFF 갭 하한) — measurement-first 근거:
 *  - 하드웨어 headless 실측 최소 갭 moon 0.415 / CI 근사 swiftshader earth 0.469 (ADR §실측 3)
 *  - 고정 배수 임계 (×1.3 등) 는 moon(1.24×) 에서 즉시 false-fail → 가산 마진 방향 채택.
 *  - D1 확정 (2026-07-05, PR #803 run 28712529835 — CI ubuntu swiftshader 실측):
 *    earth 0.768 / mars 0.873 / jupiter 0.688 / moon 0.359 (최소) → 마진 0.15 의 2.4× 여유.
 *    로컬 하드웨어 재실행 분산 포함 전체 최소 관측 갭 0.295 (여유 1.97×) → 0.15 유지 확정.
 *    변경 시 silent 완화 금지, 3중 박제 의무 (본 주석 / PR #803 본문 / ADR Amendment 1).
 */
const HF_ENTROPY_MARGIN = 0.15;

const SURFACE_BODIES = [
  { id: 'earth', type: 'rocky' },
  { id: 'mars', type: 'desert' },
  { id: 'jupiter', type: 'gas-bands' },
  { id: 'moon', type: 'cratered' },
];
const PLAIN_BODIES = [{ id: 'venus' }, { id: 'saturn' }, { id: 'neptune' }];

async function setupPage(browser, query) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE_URL}${query}`, { waitUntil: 'networkidle', timeout: 45_000 });
  await page.waitForFunction(
    () => typeof window.__simCore !== 'undefined' && typeof window.__solarScene !== 'undefined',
    { timeout: 20_000 },
  );
  await page.waitForTimeout(2600); // mesh 생성 + 첫 LOD pass + focus tween 정착
  return { context, page, consoleErrors };
}

/**
 * disk 영역 픽셀 통계 — mesh 화면 bbox 안의 천체 픽셀만 분석.
 * stddev/entropy/uniqueColors 가 모두 ≈0 이면 단색, ↑ 이면 절차 디테일.
 */
async function measureDisk(page, bodyId, captureName) {
  const canvas = page.locator('canvas').first();
  const buf = await canvas.screenshot();
  if (CAPTURE_DIR && captureName) {
    await mkdir(CAPTURE_DIR, { recursive: true });
    await writeFile(path.join(CAPTURE_DIR, `${captureName}.png`), buf);
  }
  const b64 = buf.toString('base64');
  return page.evaluate(
    async ({ b64, bodyId }) => {
      const core = window.__simCore;
      const solar = window.__solarScene;
      const scene = core?.scene;
      const mesh = solar?.meshes?.get(bodyId);
      if (!scene || !mesh) return { error: `mesh/scene 부재 (${bodyId})` };

      const BABYLON = window.BABYLON;
      const engine = scene.getEngine();
      const rw = engine.getRenderWidth();
      const rh = engine.getRenderHeight();
      const cam = scene.activeCamera;
      const vp = cam.viewport.toGlobal(rw, rh);
      const transform = scene.getTransformMatrix();

      const bb = mesh.getBoundingInfo().boundingBox;
      const corners = bb.vectorsWorld;
      const Vector3 = (BABYLON && BABYLON.Vector3) || corners[0].constructor;
      // BABYLON 전역 미노출 — Matrix 클래스는 mesh.getWorldMatrix() 의 constructor 에서 획득.
      // vectorsWorld 는 이미 월드 좌표이므로 Project 의 world 인자는 Identity 사용.
      const Matrix = (BABYLON && BABYLON.Matrix) || mesh.getWorldMatrix().constructor;
      const idMat = Matrix.Identity();
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const c of corners) {
        const p = Vector3.Project(c, idMat, transform, vp);
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      const screenBox = {
        x: Math.max(0, Math.floor(minX)),
        y: Math.max(0, Math.floor(minY)),
        w: Math.min(rw, Math.ceil(maxX)) - Math.max(0, Math.floor(minX)),
        h: Math.min(rh, Math.ceil(maxY)) - Math.max(0, Math.floor(minY)),
      };

      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = `data:image/png;base64,${b64}`;
      });
      const off = document.createElement('canvas');
      off.width = img.width;
      off.height = img.height;
      const ctx = off.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const sx = img.width / rw;
      const sy = img.height / rh;
      const bx = Math.max(0, Math.round(screenBox.x * sx));
      const by = Math.max(0, Math.round(screenBox.y * sy));
      const bw = Math.min(img.width - bx, Math.max(1, Math.round(screenBox.w * sx)));
      const bh = Math.min(img.height - by, Math.max(1, Math.round(screenBox.h * sy)));
      if (bw < 2 || bh < 2) return { error: `disk bbox 너무 작음 ${bw}x${bh}`, screenBox };
      const data = ctx.getImageData(bx, by, bw, bh).data;

      // luminance 2D 그리드 — 천체 disk 픽셀만 (배경 검정 마스크).
      const lumGrid = new Float32Array(bw * bh);
      const mask = new Uint8Array(bw * bh);
      const lums = [];
      const colorSet = new Set();
      for (let i = 0; i < bw * bh; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        lumGrid[i] = lum;
        if (lum < 8) continue; // 우주 배경 배제
        mask[i] = 1;
        lums.push(lum);
        colorSet.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
      }
      const n = lums.length;
      if (n === 0) return { error: 'disk 영역 천체 픽셀 0', screenBox };
      const mean = lums.reduce((a, b) => a + b, 0) / n;
      const variance = lums.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
      const stddev = Math.sqrt(variance);

      // ⚠️ 측정 방법 검증 (CRITICAL #6.10): 전역 stddev 는 구체 라이팅 그라데이션(저주파)
      // 때문에 단색 disk 에서도 크게 나와 "디테일 유무" 를 구분 못 한다.
      // → 라플라시안 고주파 에너지(인접 4-이웃 차분) 로 저주파 라이팅을 제거하고
      //   절차 표면 변조(고주파)만 정량화한다. 단색 disk ≈ 0, 디테일 disk ↑.
      let hfSum = 0;
      let hfCount = 0;
      for (let y = 1; y < bh - 1; y++) {
        for (let x = 1; x < bw - 1; x++) {
          const i = y * bw + x;
          // disk 내부 픽셀만 (경계/배경 차분 제외 — disk edge 의 큰 차분이 신호 오염).
          if (!mask[i] || !mask[i - 1] || !mask[i + 1] || !mask[i - bw] || !mask[i + bw]) continue;
          const lap =
            4 * lumGrid[i] - lumGrid[i - 1] - lumGrid[i + 1] - lumGrid[i - bw] - lumGrid[i + bw];
          hfSum += lap * lap;
          hfCount++;
        }
      }
      const hfEnergy = hfCount > 0 ? Math.sqrt(hfSum / hfCount) : 0; // 고주파 RMS

      // 디테일 히스토그램 엔트로피도 고주파 차분 기준으로 (저주파 영향 제거).
      const hfHist = new Array(32).fill(0);
      let hfHistN = 0;
      for (let y = 1; y < bh - 1; y++) {
        for (let x = 1; x < bw - 1; x++) {
          const i = y * bw + x;
          if (!mask[i] || !mask[i - 1] || !mask[i + 1] || !mask[i - bw] || !mask[i + bw]) continue;
          const lap =
            4 * lumGrid[i] - lumGrid[i - 1] - lumGrid[i + 1] - lumGrid[i - bw] - lumGrid[i + bw];
          hfHist[Math.min(31, Math.floor(Math.abs(lap)))]++;
          hfHistN++;
        }
      }
      let hfEntropy = 0;
      for (const c of hfHist) {
        if (c === 0) continue;
        const p = c / hfHistN;
        hfEntropy -= p * Math.log2(p);
      }

      return {
        area: n,
        stddev: Number(stddev.toFixed(3)), // 전역 (라이팅 포함 — 참고용)
        hfEnergy: Number(hfEnergy.toFixed(4)), // ★ 고주파 RMS = 절차 디테일 지표
        hfEntropy: Number(hfEntropy.toFixed(3)),
        uniqueColors: colorSet.size,
        meanLum: Number(mean.toFixed(1)),
        screenBox,
        imgSize: { w: img.width, h: img.height },
      };
    },
    { b64, bodyId },
  );
}

async function getLodStats(page) {
  return page.evaluate(() => {
    const s = window.__solarScene;
    return { stats: s?.getLodStats?.() ?? null, infoCount: s?.getLodInfo?.()?.length ?? null };
  });
}

async function launch() {
  if (SWIFTSHADER) {
    console.log('[browser] headless chromium + --use-angle=swiftshader (CI 재현 — #759)');
    return chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });
  }
  const opts = HEADFUL ? { headless: false, channel: 'chrome' } : { headless: true };
  try {
    const b = await chromium.launch(opts);
    console.log(
      `[browser] ${HEADFUL ? '실 Chrome GUI (headless:false, channel:chrome)' : 'headless chromium'}`,
    );
    return b;
  } catch (e) {
    console.error(
      `[launch] chrome channel 부재 (${e.message}) — chromium 폴백 (headless:${!HEADFUL})`,
    );
    return chromium.launch({ headless: !HEADFUL });
  }
}

(async () => {
  const out = {
    surfaceOn: {},
    surfaceOff: {},
    plain: {},
    lodMid: {},
    tierC: {},
    consoleErrors: {},
  };
  // #940 — 브라우저 수명주기를 `withBrowser` 로 위임 (에러 경로 close 도달 보장).
  //   본 파일의 `launch()` 는 chrome 채널 부재 시 chromium 으로 **폴백** 하므로 옵션 조립만으로는
  //   표현 불가하다. 그래서 `launch` 를 헬퍼의 launcher 주입 seam 으로 그대로 넘긴다 —
  //   launch 인자가 한 글자도 바뀌지 않아 픽셀 측정(hfEntropy) 의 렌더러 축이 보존된다.
  //   (`buildLaunchOptions` 경유 금지 — env `BROWSER_VERIFY_GPU`/`HEADFUL` 이 암묵 개입한다.)
  await withBrowser(
    {},
    async (browser) => {
      console.log('\n=== DoD 1 — 4 body 표면 디테일 (surface ON, 기본) ===');
      for (const { id, type } of SURFACE_BODIES) {
        const { context, page, consoleErrors } = await setupPage(
          browser,
          `?gpu=a&focus=${id}&lod=auto`,
        );
        const m = await measureDisk(page, id, `surface-on-${id}`);
        out.surfaceOn[id] = { type, ...m };
        out.consoleErrors[`on-${id}`] = consoleErrors.length;
        console.log(
          `  ${id.padEnd(8)} [${type}] hfEnergy=${m.hfEnergy} hfEntropy=${m.hfEntropy} stddev=${m.stddev} uniqColors=${m.uniqueColors} area=${m.area} err=${consoleErrors.length}`,
        );
        if (consoleErrors.length)
          console.log(`     ↳ console errors: ${JSON.stringify(consoleErrors.slice(0, 3))}`);
        await context.close();
      }

      console.log('\n=== DoD 5 — ?surface=off 단색 복귀 대조 ===');
      for (const { id, type } of SURFACE_BODIES) {
        const { context, page, consoleErrors } = await setupPage(
          browser,
          `?gpu=a&focus=${id}&lod=auto&surface=off`,
        );
        const m = await measureDisk(page, id, `surface-off-${id}`);
        out.surfaceOff[id] = { type, ...m };
        out.consoleErrors[`off-${id}`] = consoleErrors.length;
        console.log(
          `  ${id.padEnd(8)} [${type}] hfEnergy=${m.hfEnergy} hfEntropy=${m.hfEntropy} stddev=${m.stddev} uniqColors=${m.uniqueColors} area=${m.area} err=${consoleErrors.length}`,
        );
        await context.close();
      }

      console.log('\n=== DoD 2 — 무회귀 (미등록 body 단색, surface ON) ===');
      for (const { id } of PLAIN_BODIES) {
        const { context, page, consoleErrors } = await setupPage(
          browser,
          `?gpu=a&focus=${id}&lod=auto`,
        );
        const m = await measureDisk(page, id, `plain-${id}`);
        out.plain[id] = m;
        console.log(
          `  ${id.padEnd(8)} hfEnergy=${m.hfEnergy} hfEntropy=${m.hfEntropy} stddev=${m.stddev} uniqColors=${m.uniqueColors} area=${m.area} err=${consoleErrors.length}`,
        );
        await context.close();
      }

      console.log('\n=== DoD 3 — LOD mid 전환 표면 연속성 (reviewer 권고 1: cross-fade 팝핑) ===');
      {
        const { context, page } = await setupPage(browser, `?gpu=a&focus=earth&lod=auto`);
        const high = await measureDisk(page, 'earth', 'lod-earth-high');
        await page.evaluate(() => window.__solarScene?.setLodOverride?.('mid'));
        await page.waitForTimeout(100); // fade 중간 프레임 (200ms 윈도우)
        const midFade = await measureDisk(page, 'earth', 'lod-earth-mid-fade100');
        await page.waitForTimeout(400); // fade 정착
        const midSettled = await measureDisk(page, 'earth', 'lod-earth-mid-settled');
        out.lodMid = { high, midFade, midSettled };
        console.log(
          `  earth high   : hfEnergy=${high.hfEnergy} hfEntropy=${high.hfEntropy} area=${high.area}`,
        );
        console.log(
          `  earth midFade: hfEnergy=${midFade.hfEnergy} hfEntropy=${midFade.hfEntropy} area=${midFade.area}`,
        );
        console.log(
          `  earth midSet : hfEnergy=${midSettled.hfEnergy} hfEntropy=${midSettled.hfEntropy} area=${midSettled.area}`,
        );
        await context.close();
      }

      console.log('\n=== DoD 4 — tier-c (?gpu=c) 단색 ===');
      {
        // #759 판정 신설 시 발견한 기존 시나리오 결함 정정 (2건, 실측):
        //  (1) `?lod=auto` 를 붙이면 URL `?lod=` 우선 정책 (sim-canvas.tsx #677) 이 tier-c
        //      `forceOverride:'low'` 를 건너뛰어 표면 셰이더가 그대로 진입 (lodStats high=2,
        //      hfEntropy 1.399 ≈ ON) → lod 파라미터 제거.
        //  (2) `focus=earth` 시 #546 satellite visibility guard 가 moon 을 low→mid 승격 (override
        //      이후 후처리 — 문서화된 설계) → mid=1 로 전수 low 판정 불가 → default view (no focus,
        //      가드 비활성 Q2=(a)) 에서 forceOverride 배선을 검증.
        const { context, page } = await setupPage(browser, `?gpu=c`);
        const lod = await getLodStats(page);
        const m = await measureDisk(page, 'earth', 'tierc-earth');
        out.tierC = { ...m, lod };
        console.log(
          `  earth tier-c : hfEnergy=${m.hfEnergy} hfEntropy=${m.hfEntropy} area=${m.area} lodStats=${JSON.stringify(lod.stats)}`,
        );
        await context.close();
      }
    },
    { launch },
  );
  console.log('\n=== JSON ===');
  console.log(JSON.stringify(out, null, 2));

  // ── 판정 (#759 — ADR 20260705-759 결정 3: per-body 상대 성질, fail-fast) ──────
  // hfEntropy 축 사용 (hfEnergy 아님): OFF 단색 disk 의 경계 antialiasing 이 hfEnergy(RMS) 를
  // 오염시키는 함정 (#774 실측 — sun OFF 30.2 > ON 18.1 역전). 엔트로피는 "대부분 0 + 경계
  // 소수 대형" (OFF) 과 "전면 미세 변조" (ON) 를 정확히 구분 (측정 방법 검증 — CRITICAL #6.10).
  const failures = [];
  for (const { id } of SURFACE_BODIES) {
    const on = out.surfaceOn[id];
    const off = out.surfaceOff[id];
    if (!on || on.error) {
      failures.push(`${id}: surface ON 측정 실패 (${on?.error ?? 'no data'})`);
    } else if (!off || off.error) {
      failures.push(`${id}: surface OFF 측정 실패 (${off?.error ?? 'no data'})`);
    } else if (!(on.hfEntropy - off.hfEntropy >= HF_ENTROPY_MARGIN)) {
      failures.push(
        `${id}: hfEntropy ON(${on.hfEntropy}) − OFF(${off.hfEntropy}) = ${(on.hfEntropy - off.hfEntropy).toFixed(3)} < 마진 ${HF_ENTROPY_MARGIN}`,
      );
    }
  }
  // DoD 4 — tier-c 저디테일: 픽셀 엔트로피가 아닌 **lodStats 배선 검증** (measurement-first 전환).
  // 픽셀 축은 (1) 기존 시나리오의 `lod=auto` 가 forceOverride 를 무효화한 결함 + (2) billboard
  // 축소 후 bbox 대부분이 배경 (로컬은 starfield 별 오염, CI 는 검정 — 환경 의존 비결정) 이라
  // false-fail 을 만든다. `override==='low' && high===0 && mid===0` 이면 표면 셰이더는
  // high/mid variant 에만 붙으므로 (#756 §결정 3) 구조적으로 미진입 — 결정적·백엔드 무관.
  const tcStats = out.tierC?.lod?.stats;
  if (!tcStats) {
    failures.push('tier-c: lodStats 미노출 (__solarScene.getLodStats 부재)');
  } else if (!(tcStats.override === 'low' && tcStats.high === 0 && tcStats.mid === 0)) {
    failures.push(
      `tier-c: forceOverride 미적용 (override=${tcStats.override}, high=${tcStats.high}, mid=${tcStats.mid}) — 표면 셰이더 진입 가능 상태`,
    );
  }

  console.log(
    '\n=== 판정 (#759 — hfEntropy ON−OFF ≥ ' +
      HF_ENTROPY_MARGIN +
      ' + tier-c forceOverride=low) ===',
  );
  if (failures.length) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    console.log('=== FAIL ===');
    process.exitCode = 1;
  } else {
    for (const { id } of SURFACE_BODIES) {
      const gap = (out.surfaceOn[id].hfEntropy - out.surfaceOff[id].hfEntropy).toFixed(3);
      console.log(`  ✓ ${id}: hfEntropy 갭 ${gap} ≥ ${HF_ENTROPY_MARGIN}`);
    }
    console.log(
      `  ✓ tier-c: override=${tcStats.override}, high=${tcStats.high}, mid=${tcStats.mid} (표면 셰이더 구조적 미진입)`,
    );
    console.log('=== PASS ===');
  }
})();
