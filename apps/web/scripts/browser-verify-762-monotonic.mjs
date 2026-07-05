#!/usr/bin/env node
/**
 * #762 — 천체 표시 크기 비율 단조성 회복 qa 검증 (실 Chrome GUI, NDC px diameter 측정).
 *
 * 사용자 보고 시나리오: 카메라를 광역(줌아웃)으로 빼거나 거성 focus 후 안쪽으로 회전해
 * 거성 + 안쪽 행성이 co-visible 일 때 earth/mars 가 jupiter 보다 크게 보이던 역전.
 * 새 정책(sqrt 압축 곡선)으로 단조성(목성 > 지구·화성) 회복을 runtime px 로 확증.
 *
 * 측정 방법 (#728 SSoT — WebGPU readback 금지, NDC projection 기반 px diameter):
 *  - mesh.getBoundingInfo().boundingSphere.radiusWorld → NDC 투영으로 화면 px diameter 환산
 *  - billboard variant (bodyScale 미적용) 가 아닌 high/sphere variant 측정 (focus 거리에서 sphere 활성)
 *
 * 시나리오:
 *  S1. default-solar    (radius 35)        — 기본 진입 시점 co-visible 천체 px
 *  S2. wide-solar       (radius 동적 줌아웃) — 거성까지 co-visible 광역 시점 (역전 해소 핵심)
 *  S3. focus-jupiter-zoomout — jupiter focus 후 줌아웃해 안쪽 행성 co-visible
 *
 * 각 시나리오에서 onScreen=true 인 행성만 추려 px diameter 단조성(목성 ≥ 지구·화성) 검증.
 *
 * 실 GUI: headless=false (swiftshader freeze / WebGPU readback false-positive 회피 — #663/#728).
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT_DIR = path.join(__dirname, '..', '..', '..', 'docs', 'reports', '762-monotonic');
const args = process.argv.slice(2);
const HEADED = !args.includes('--headless');

const VIEWPORT = { width: 1280, height: 720 };
const PLANETS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
const POST_WAIT_MS = 2600;

/** scene 내 모든 행성의 NDC px diameter 측정 + 카메라 radius 동적 조작. */
async function measureBodies(page, { camRadius } = {}) {
  return await page.evaluate(
    ({ ids, camRadius, vw, vh }) => {
      const solar = window.__solarScene;
      if (!solar) return { error: '__solarScene 미노출 (dev 빌드 필요)' };
      const meshes = solar.meshes;
      const anyMesh = meshes.values().next().value;
      if (!anyMesh) return { error: 'mesh 없음' };
      const scene = anyMesh.getScene();
      const camera = scene.activeCamera;
      if (!camera) return { error: 'activeCamera null' };

      // 줌아웃: camera.radius 직접 조작 (사용자 휠 줌아웃 재현). null 이면 현 상태.
      if (typeof camRadius === 'number') {
        camera.radius = camRadius;
      }
      scene.render(); // 카메라 변경 즉시 반영
      camera.getViewMatrix(true);
      const transform = camera.getTransformationMatrix();
      const BABYLON = window.BABYLON || (anyMesh.constructor && anyMesh.getScene().constructor);

      const out = {};
      for (const id of ids) {
        const mesh = meshes.get(id);
        if (!mesh) {
          out[id] = { present: false };
          continue;
        }
        mesh.computeWorldMatrix(true);
        const bi = mesh.getBoundingInfo();
        const rWorld = bi.boundingSphere.radiusWorld;
        const center = mesh.absolutePosition;

        // NDC 투영 — Vector3.Project 동등 수동 계산.
        const Vector3 = anyMesh.position.constructor;
        const ndc = Vector3.Project
          ? Vector3.Project(
              center,
              window.BABYLON
                ? window.BABYLON.Matrix.Identity()
                : (mesh.getWorldMatrix().clone().reset?.() ?? mesh.getWorldMatrix()),
              transform,
              { x: 0, y: 0, width: vw, height: vh },
            )
          : null;

        // Project 가 world transform 을 기대하므로 identity 로 center 가 이미 world 좌표.
        // 안전 경로: 직접 행렬 변환.
        let pxDiameter = null;
        let onScreen = false;
        let behindCamera = false;
        // 두 화면점(center ± radius·camRight) 투영 차이로 px diameter 산출 (회전 무관).
        const camRight = camera.getDirection
          ? camera.getDirection(new Vector3(1, 0, 0))
          : new Vector3(1, 0, 0);
        const pA = center.add(camRight.scale(rWorld));
        const pB = center.subtract(camRight.scale(rWorld));
        const Matrix = transform.constructor;
        const identity = Matrix.Identity();
        const projA = Vector3.Project(pA, identity, transform, {
          x: 0,
          y: 0,
          width: vw,
          height: vh,
        });
        const projB = Vector3.Project(pB, identity, transform, {
          x: 0,
          y: 0,
          width: vw,
          height: vh,
        });
        const projC = Vector3.Project(center, identity, transform, {
          x: 0,
          y: 0,
          width: vw,
          height: vh,
        });
        // behind camera 판정: view space z
        const viewPos = Vector3.TransformCoordinates(center, camera.getViewMatrix());
        behindCamera = viewPos.z < 0; // RH/LH 차이 가능 — onScreen 으로 보강
        const dx = projA.x - projB.x;
        const dy = projA.y - projB.y;
        pxDiameter = Math.sqrt(dx * dx + dy * dy);
        onScreen =
          projC.x >= 0 &&
          projC.x <= vw &&
          projC.y >= 0 &&
          projC.y <= vh &&
          projC.z >= 0 &&
          projC.z <= 1;

        out[id] = {
          present: true,
          radiusWorld: rWorld,
          pxDiameter: Math.round(pxDiameter * 1000) / 1000,
          centerPx: { x: Math.round(projC.x), y: Math.round(projC.y) },
          ndcZ: Math.round(projC.z * 10000) / 10000,
          onScreen,
        };
      }
      return {
        tier: solar.getTier ? solar.getTier() : 'unknown',
        camRadius: camera.radius,
        bodies: out,
      };
    },
    { ids: PLANETS, camRadius, vw: VIEWPORT.width, vh: VIEWPORT.height },
  );
}

async function setup(browser, url) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(`    [console.error] ${m.text()}`);
  });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForFunction(
    () => typeof window.__solarScene !== 'undefined' && typeof window.__simCore !== 'undefined',
    { timeout: 20_000 },
  );
  await page.waitForTimeout(POST_WAIT_MS);
  return { context, page };
}

/** onScreen 행성들의 px diameter 단조성 평가 (jupiter ≥ earth, jupiter ≥ mars 핵심). */
function evalMonotonic(measurement, label) {
  const b = measurement.bodies;
  const visible = PLANETS.filter((id) => b[id]?.present && b[id]?.onScreen);
  const px = (id) => b[id]?.pxDiameter ?? null;
  const checks = [];

  // 핵심: jupiter 가 화면에 있고 earth/mars 도 있을 때 jupiter > earth, jupiter > mars
  const jup = px('jupiter');
  for (const small of ['earth', 'mars', 'venus', 'mercury']) {
    if (b.jupiter?.onScreen && b[small]?.onScreen) {
      const s = px(small);
      const pass = jup > s;
      checks.push({
        rule: `jupiter > ${small}`,
        jupiter: jup,
        [small]: s,
        pass,
      });
    }
  }
  // saturn > earth/mars 도 (co-visible 시)
  const sat = px('saturn');
  for (const small of ['earth', 'mars']) {
    if (b.saturn?.onScreen && b[small]?.onScreen) {
      const s = px(small);
      checks.push({ rule: `saturn > ${small}`, saturn: sat, [small]: s, pass: sat > s });
    }
  }

  return { label, visible, checks, allPass: checks.every((c) => c.pass) };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: !HEADED });
  const results = [];
  try {
    // S1 default solar (radius 35)
    {
      const { context, page } = await setup(browser, `${BASE_URL}/?gpu=a&lod=auto`);
      const m = await measureBodies(page);
      await page.screenshot({ path: path.join(OUT_DIR, 'qa-762-S1-default-solar.png') });
      const ev = evalMonotonic(m, 'S1-default-solar');
      results.push({ scenario: 'S1-default-solar', measurement: m, eval: ev });
      console.log(`\n[S1 default-solar] tier=${m.tier} camR=${m.camRadius?.toFixed(1)}`);
      console.log('  visible planets:', ev.visible.join(', '));
      for (const id of PLANETS) {
        const x = m.bodies[id];
        if (x?.present)
          console.log(
            `    ${id.padEnd(8)} px=${String(x.pxDiameter).padStart(8)} onScreen=${x.onScreen} center=(${x.centerPx.x},${x.centerPx.y})`,
          );
      }
      await context.close();
    }

    // S2 wide solar — 줌아웃해 거성 co-visible (radius 450 으로 광역)
    for (const camRadius of [120, 450]) {
      const { context, page } = await setup(browser, `${BASE_URL}/?gpu=a&lod=auto`);
      const m = await measureBodies(page, { camRadius });
      await page.waitForTimeout(600);
      const m2 = await measureBodies(page, { camRadius }); // 재측정 안정화
      await page.screenshot({ path: path.join(OUT_DIR, `qa-762-S2-wide-r${camRadius}.png`) });
      const ev = evalMonotonic(m2, `S2-wide-r${camRadius}`);
      results.push({ scenario: `S2-wide-r${camRadius}`, measurement: m2, eval: ev });
      console.log(
        `\n[S2 wide-solar r=${camRadius}] tier=${m2.tier} camR=${m2.camRadius?.toFixed(1)}`,
      );
      console.log('  visible planets:', ev.visible.join(', '));
      for (const id of PLANETS) {
        const x = m2.bodies[id];
        if (x?.present)
          console.log(
            `    ${id.padEnd(8)} px=${String(x.pxDiameter).padStart(8)} onScreen=${x.onScreen} center=(${x.centerPx.x},${x.centerPx.y})`,
          );
      }
      console.log('  monotonic checks:');
      for (const c of ev.checks)
        console.log(`    ${c.rule}: ${c.pass ? 'PASS' : 'FAIL'}  (${JSON.stringify(c)})`);
      await context.close();
    }

    // S3 focus jupiter 후 줌아웃해 안쪽 행성 co-visible
    {
      const { context, page } = await setup(browser, `${BASE_URL}/?gpu=a&focus=jupiter&lod=auto`);
      // jupiter focus 상태에서 줌아웃 (radius 크게)
      const m = await measureBodies(page, { camRadius: 400 });
      await page.waitForTimeout(600);
      const m2 = await measureBodies(page, { camRadius: 400 });
      await page.screenshot({ path: path.join(OUT_DIR, 'qa-762-S3-focus-jupiter-zoomout.png') });
      const ev = evalMonotonic(m2, 'S3-focus-jupiter-zoomout');
      results.push({ scenario: 'S3-focus-jupiter-zoomout', measurement: m2, eval: ev });
      console.log(`\n[S3 focus-jupiter-zoomout] tier=${m2.tier} camR=${m2.camRadius?.toFixed(1)}`);
      console.log('  visible planets:', ev.visible.join(', '));
      for (const id of PLANETS) {
        const x = m2.bodies[id];
        if (x?.present)
          console.log(
            `    ${id.padEnd(8)} px=${String(x.pxDiameter).padStart(8)} onScreen=${x.onScreen} center=(${x.centerPx.x},${x.centerPx.y})`,
          );
      }
      console.log('  monotonic checks:');
      for (const c of ev.checks)
        console.log(`    ${c.rule}: ${c.pass ? 'PASS' : 'FAIL'}  (${JSON.stringify(c)})`);
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const outPath = path.join(OUT_DIR, 'qa-762-monotonic-result.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\n결과 JSON: ${outPath}`);

  // 종합 판정: co-visible 시점(jupiter+earth/mars 동시 onScreen)이 1개 이상 + 그 시점 단조성 PASS
  const covisScenarios = results.filter((r) => r.eval.checks.length > 0);
  const anyCovis = covisScenarios.length > 0;
  const allCovisPass = covisScenarios.every((r) => r.eval.allPass);
  console.log('\n=== 종합 ===');
  console.log(`  co-visible 시나리오 수: ${covisScenarios.length}`);
  console.log(`  단조성 PASS: ${allCovisPass}`);
  process.exit(anyCovis && allCovisPass ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(2);
});
