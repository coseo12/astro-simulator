#!/usr/bin/env node
/**
 * #738 — 절차적 별 배경 + 은하수 브라우저 검증 (S1~S6).
 *
 * ADR `docs/decisions/20260624-738-procedural-starfield.md` §4 검증 계획 + §Amendment 2 (#745).
 *
 * S1 별 가시       — 별 ON 화면이 clearColor 단색 (별 OFF) 보다 밝은 픽셀(별/은하수) 보유.
 * S2 floating-origin 불변 (★ 핵심 회귀 가드) — 줌(radius 변동) + earth focus(tier 전환) 전후
 *                     고정 별 방향의 화면 투영 좌표 불변 (infiniteDistance 엔진 레벨 추종, D1 실측 정합).
 * S3 회전 반영     — 카메라 회전(alpha 변경) 시 별 화면 위치 이동 (sky dome 거동).
 * S4 `?stars=off`  — starfield mesh 미생성 (별 비가시).
 * S5 picking 비간섭 — starfield mesh 가 `isPickable=false` (scene.pick 별 hit 0, #713 raycast 무간섭).
 * S6 소프트웨어 렌더 게이트 (#745, ★ fps 무회귀 핵심) — `__isSoftwareRenderer` / `__starfieldVisible`
 *                     전역으로 software/하드웨어 양쪽 assertion. **software (CI swiftshader)** 면
 *                     별 비활성 + mesh 미생성 (fps-baseline-guard 무회귀), **하드웨어** 면 별 활성.
 *
 * **환경 자동 분기** (#745): headless `chromium.launch()` (플래그 0) = swiftshader = software 환경 →
 *   별 비활성이 정상. mesh 가 없으므로 S1~S5 (mesh 의존) 는 software 환경에선 자동 SKIP 하고, S6 가
 *   software 게이트 (비활성 + mesh 미생성) 를 검증한다. 하드웨어 GPU (로컬 dev / `--enable-unsafe-webgpu`
 *   등) 환경이면 S1~S5 + S6(하드웨어 활성) 전수 실행. CI 핵심 제약 = software 에서 별 비활성.
 *
 * **가드 PR DoD 4축** (guard-pr-dod): S2 불변 가드 + S6 software 게이트는 negative-test 성격.
 *   - 격리 동적 테스트: 본 스크립트 (별도 verify, 기존 verify 로 대체 불가).
 *   - 3중 시뮬: S2 (별 정상 불변) + S6 (software 비활성 → 하드웨어 활성 → `?stars=off` 비활성).
 *
 * **WebGPU readback 함정** (volt #32): WebGPU canvas 는 `drawImage` readback 이 빈 버퍼 →
 *   별 가시(S1)는 `page.screenshot()` composited 버퍼 + pngjs 로만 정확. drawImage 미사용.
 *
 * 실 Chrome GUI 시각 품질 (은하수 미학 / 색온도) 은 qa + 사용자 D-T2 (headless 미재현).
 */
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const baseUrl = process.argv[2] ?? 'http://localhost:3000';
const __dirname = dirname(fileURLToPath(import.meta.url));
const shotDir = join(__dirname, '..', '.verify-screenshots', 'starfield');
mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

const errs = [];
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));

const out = [];
const check = (n, p, d = '') => {
  out.push({ n, p });
  console.log(`  ${p ? '✓' : '✗'} ${n}${d ? ' — ' + d : ''}`);
};
const skip = (n, d = '') => {
  console.log(`  ⊘ ${n} (SKIP)${d ? ' — ' + d : ''}`);
};

/** #745 — app 전역에서 software 감지 + 별 가시성 결과 읽기 (sim-canvas 노출). */
const probeStarfieldGlobals = () =>
  page.evaluate(() => ({
    isSoftwareRenderer: window.__isSoftwareRenderer ?? null,
    starfieldVisible: window.__starfieldVisible ?? null,
  }));

/** 스크린샷 버퍼 → 밝은 픽셀(별/은하수) 비율. WebGPU 안전 (composited 버퍼). */
async function brightPixelStats(label) {
  const buf = await page.screenshot({ path: join(shotDir, `${label}.png`) });
  const png = PNG.sync.read(buf);
  const { width, height, data } = png;
  // clearColor = (0.031,0.035,0.051) ≈ sRGB (8,9,13). 별/은하수는 그보다 밝다.
  // 배경 단색 대비 임계 — sum > 60 (clearColor sum ≈ 30) 면 별/은하수 후보.
  const BRIGHT_SUM = 60;
  let bright = 0;
  let total = 0;
  // UI 패널(좌상단/하단) 회피 — 중앙 영역만 샘플 (canvas 우주 영역).
  for (let y = Math.floor(height * 0.2); y < height * 0.8; y += 3) {
    for (let x = Math.floor(width * 0.25); x < width * 0.75; x += 3) {
      const idx = (y * width + x) * 4;
      const sum = data[idx] + data[idx + 1] + data[idx + 2];
      total++;
      if (sum > BRIGHT_SUM) bright++;
    }
  }
  return { ratio: bright / total, bright, total };
}

/**
 * 고정 별 방향(starfield 로컬 정점 1개)의 화면 투영 좌표 + 카메라 상태. infiniteDistance 불변 측정.
 * (D1 실측 기법 — `Vector3.Project` + starfield.getWorldMatrix.)
 */
const probeStar = () =>
  page.evaluate(() => {
    const solar = window.__solarScene;
    let scene = solar?.scene;
    if (!scene) {
      const anyMesh = solar?.meshes?.values?.().next?.().value;
      scene = anyMesh?.getScene?.();
    }
    const starfield = scene?.meshes?.find?.((m) => m.name === 'starfield');
    if (!scene || !starfield) return { error: 'no scene/starfield' };
    const cam = scene.activeCamera;
    const Vector3 = cam.position.constructor;
    starfield.computeWorldMatrix(true);
    const localPt = new Vector3(0, 0, 250);
    const world = Vector3.TransformCoordinates(localPt, starfield.getWorldMatrix());
    const w = scene.getEngine().getRenderWidth();
    const h = scene.getEngine().getRenderHeight();
    const vp = scene.getTransformMatrix();
    const identity = vp.constructor.Identity();
    const sp = Vector3.Project(world, identity, vp, { x: 0, y: 0, width: w, height: h });
    return {
      screen: [sp.x, sp.y],
      camRadius: cam.radius ?? null,
      camAlpha: cam.alpha ?? null,
      infiniteDistance: starfield.infiniteDistance,
      isPickable: starfield.isPickable,
      renderingGroupId: starfield.renderingGroupId,
    };
  });

const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);

// ─── S6: 소프트웨어 렌더 게이트 (#745, ★ 환경 분기 + fps 무회귀 핵심) ──────────────
// software/하드웨어 양쪽 assertion. 환경 판정 (isSoftwareEnv) 으로 이후 S1~S5 mesh 의존 검사를 gate.
console.log('\n[S6] 소프트웨어 렌더 게이트 (#745) — __isSoftwareRenderer / __starfieldVisible');
await page.goto(`${baseUrl}/ko?stars=on`, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
const g = await probeStarfieldGlobals();
check(
  'S6 전역 노출 — __isSoftwareRenderer / __starfieldVisible 정의됨',
  g.isSoftwareRenderer !== null && g.starfieldVisible !== null,
  `isSoftwareRenderer=${g.isSoftwareRenderer}, starfieldVisible=${g.starfieldVisible}`,
);
const isSoftwareEnv = g.isSoftwareRenderer === true;
if (isSoftwareEnv) {
  // CI swiftshader (headless 플래그 0) — 별 비활성 + mesh 미생성이 정상 (fps 무회귀 핵심 제약).
  check(
    'S6 software 환경 (CI swiftshader) — __starfieldVisible=false (별 비활성, fps 무회귀)',
    g.starfieldVisible === false,
    `starfieldVisible=${g.starfieldVisible}`,
  );
  const swMesh = await page.evaluate(() => {
    const solar = window.__solarScene;
    let scene = solar?.scene;
    if (!scene) scene = solar?.meshes?.values?.().next?.().value?.getScene?.();
    return { hasStarfield: !!scene?.meshes?.find?.((m) => m.name === 'starfield') };
  });
  check(
    'S6 software 환경 — starfield mesh 미생성 (별 fragment shader 부하 0)',
    swMesh.hasStarfield === false,
  );
} else {
  // 하드웨어 GPU — 별 활성 (회귀 해소: WebGPU 미지원 하드웨어 가속 PC 포함).
  check(
    'S6 하드웨어 환경 — __starfieldVisible=true (별 활성, 회귀 해소)',
    g.starfieldVisible === true,
    `starfieldVisible=${g.starfieldVisible}`,
  );
}

// ─── S1: 별 가시 (ON vs OFF 대비) ──────────────────────────────────────────────
// #745 — software 환경은 별 비활성이 정상이라 mesh 의존 S1~S5 는 SKIP (S6 가 software 게이트 검증).
console.log('\n[S1] 별 가시 — starfield ON 화면이 OFF (단색) 보다 밝은 픽셀 보유');
if (isSoftwareEnv) {
  skip('S1 별 가시', 'software 환경 (별 비활성 정상) — S6 software 게이트가 대체 검증');
} else {
  await page.goto(`${baseUrl}/ko?stars=off`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const offStats = await brightPixelStats('s1-stars-off');
  await page.goto(`${baseUrl}/ko?stars=on`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const onStats = await brightPixelStats('s1-stars-on');
  check(
    'S1 별 ON 이 OFF 보다 밝은 픽셀 비율 증가 (별/은하수 가시)',
    onStats.ratio > offStats.ratio,
    `ON=${(onStats.ratio * 100).toFixed(2)}% > OFF=${(offStats.ratio * 100).toFixed(2)}%`,
  );
}

// ─── S2~S5: mesh 의존 (하드웨어 환경 전용) ──────────────────────────────────────
if (isSoftwareEnv) {
  skip(
    'S2~S5 (floating-origin / 회전 / ?stars=off / picking)',
    'software 환경 — starfield mesh 미생성',
  );
} else {
  await runMeshDependentScenarios();
}

await finishAndReport();

/** S2~S5 — starfield mesh 존재 전제 (하드웨어 환경 전용). #745 software 환경에선 호출 안 함. */
async function runMeshDependentScenarios() {
  // ─── S2: floating-origin 불변 (★ 핵심) ────────────────────────────────────────
  console.log('\n[S2] floating-origin 불변 — 줌 + tier 전환 전후 별 화면 위치 불변');
  const A = await probeStar();
  check(
    'S2 starfield mesh 존재 + infiniteDistance=true',
    !A.error && A.infiniteDistance === true,
    A.error ?? '',
  );

  // 줌인 — wheel down (radius 감소).
  const canvas = page.locator('[data-testid="sim-canvas"]');
  const box = await canvas.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(800);
  const B = await probeStar();
  const zoomDelta = !A.error && !B.error ? dist(A.screen, B.screen) : Infinity;
  check(
    'S2 줌(radius 변동) 전후 별 화면 위치 불변 (Δ < 1px)',
    zoomDelta < 1.0,
    `camRadius ${A.camRadius?.toFixed?.(1)}→${B.camRadius?.toFixed?.(1)}, Δ=${zoomDelta.toFixed(3)}px`,
  );

  // earth focus — tier 전환 (floating-origin shift).
  await page.goto(`${baseUrl}/ko?focus=earth`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  const C = await probeStar();
  const tierDelta = !A.error && !C.error ? dist(A.screen, C.screen) : Infinity;
  check(
    'S2 tier 전환(earth focus, floating-origin shift) 전후 별 화면 위치 불변 (Δ < 1px)',
    tierDelta < 1.0,
    `Δ=${tierDelta.toFixed(3)}px`,
  );

  // ─── S3: 회전 반영 ────────────────────────────────────────────────────────────
  console.log('\n[S3] 회전 반영 — 카메라 회전 시 별 이동 (sky dome 거동)');
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 300, cy, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(800);
  const D = await probeStar();
  const rotDelta = !C.error && !D.error ? dist(C.screen, D.screen) : 0;
  check(
    'S3 회전(alpha 변경) 시 별 화면 위치 이동 (Δ > 10px)',
    rotDelta > 10,
    `alpha ${C.camAlpha?.toFixed?.(2)}→${D.camAlpha?.toFixed?.(2)}, Δ=${rotDelta.toFixed(1)}px`,
  );

  // ─── S4: ?stars=off 비가시 ────────────────────────────────────────────────────
  console.log('\n[S4] ?stars=off — starfield mesh 미생성');
  await page.goto(`${baseUrl}/ko?stars=off`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const offProbe = await page.evaluate(() => {
    const solar = window.__solarScene;
    let scene = solar?.scene;
    if (!scene) {
      const anyMesh = solar?.meshes?.values?.().next?.().value;
      scene = anyMesh?.getScene?.();
    }
    const sf = scene?.meshes?.find?.((m) => m.name === 'starfield');
    return { hasStarfield: !!sf };
  });
  check('S4 ?stars=off 시 starfield mesh 미생성', offProbe.hasStarfield === false);

  // ─── S5: picking 비간섭 ───────────────────────────────────────────────────────
  console.log('\n[S5] picking 비간섭 — starfield mesh isPickable=false (scene.pick 별 hit 0)');
  await page.goto(`${baseUrl}/ko?stars=on`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const pickProbe = await page.evaluate(() => {
    const solar = window.__solarScene;
    let scene = solar?.scene;
    if (!scene) {
      const anyMesh = solar?.meshes?.values?.().next?.().value;
      scene = anyMesh?.getScene?.();
    }
    const sf = scene?.meshes?.find?.((m) => m.name === 'starfield');
    if (!sf) return { error: 'no starfield' };
    // 화면 중앙 다수 지점 pick — starfield 가 hit 되면 안 됨 (isPickable=false).
    const w = scene.getEngine().getRenderWidth();
    const h = scene.getEngine().getRenderHeight();
    let starfieldHits = 0;
    for (const [px, py] of [
      [w * 0.5, h * 0.5],
      [w * 0.15, h * 0.15],
      [w * 0.85, h * 0.85],
      [w * 0.2, h * 0.8],
    ]) {
      const pick = scene.pick(px, py);
      if (pick?.pickedMesh?.name === 'starfield') starfieldHits++;
    }
    return { isPickable: sf.isPickable, starfieldHits };
  });
  check(
    'S5 starfield mesh isPickable=false',
    pickProbe.isPickable === false,
    pickProbe.error ?? '',
  );
  check(
    'S5 scene.pick 어느 지점도 starfield hit 0 (#713 raycast 무간섭)',
    pickProbe.starfieldHits === 0,
    `hits=${pickProbe.starfieldHits}`,
  );
}

/** 콘솔 에러 점검 + 브라우저 종료 + 결과 리포트 + exit code. */
async function finishAndReport() {
  // ─── 콘솔 에러 ──────────────────────────────────────────────────────────────
  check('콘솔 에러 없음', errs.length === 0, errs.slice(0, 3).join(' | '));

  await browser.close();

  const failed = out.filter((o) => !o.p);
  console.log(`\n결과: ${out.length - failed.length}/${out.length} PASS`);
  console.log(`스크린샷: ${shotDir}`);
  if (failed.length > 0) {
    console.log('FAILED:', failed.map((f) => f.n).join(', '));
    process.exit(1);
  }
}
