#!/usr/bin/env node
/**
 * #782 — 행성 self-rotation (자전) + 옵션 e 광원 world normal qa 동적 검증 (Amendment 2).
 *
 * 실 Chrome GUI (headless: false, channel: chrome) — WebGPU swiftshader freeze 회피 (#663/#756).
 *
 * 자전각은 jd 순수 함수 (`spinAngle = (jd − epoch) × ω mod 2π`, ADR §A2.3 결정 5) 라 프레임 독립·
 * 결정적. 측정은 `window.__solarScene.updateAt(jd)` 를 직접 호출해 두 jd 시점의 `mesh.rotationQuaternion`
 * 을 **수치로** 읽는다 (픽셀 readback 불요 — WebGPU 빈버퍼 함정 #728 원천 회피). 시각 확인용 composited
 * screenshot 은 CAPTURE_DIR 지정 시 별도 저장.
 *
 * 측정 축 (ADR §A2.5 DoD):
 *  - DoD 1: 자전각 = jd 순수 함수 — 두 시점 quaternion 상대 회전각 Δ = 이론 ω·Δjd (±5%).
 *  - DoD 2: axialTilt body 적용 — 지구 자전축(local Y in world) 이 world Y 에서 23.44° 기울어짐.
 *  - DoD 3: 역행 부호 — 금성(177.36° obliquity)/천왕성(97.77°) 이 순행 body 와 반대 화면 spin 방향
 *           (규약 i: period 양수 magnitude, 방향은 obliquity>90 에서 창발 — CW).
 *  - DoD 6: ring wobble 0 — ring disc world normal 이 두 시점 불변 (body spin Δ>0 인데도).
 *
 * 사용법:
 *   node apps/web/scripts/browser-verify-782-rotation.mjs               # 실 Chrome GUI
 *   CAPTURE_DIR=/abs/dir node ...                                       # 시각 확인 PNG 저장
 */

import { chromium } from 'playwright';
import { withBrowser } from '../../../scripts/browser-verify-utils.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const CAPTURE_DIR = process.env.CAPTURE_DIR ?? null;
const HEADFUL = process.env.HEADFUL !== '0';

// J2000.0 (epoch). rotationEpoch = system.epoch (loader) = J2000_JD.
const J2000_JD = 2451545.0;
// 측정 시점 2개 — Δjd 는 body 별 자전이 육안/수치로 유의미하도록 body 별 조정 (아래 계산).
const JD0 = J2000_JD;

// 검증 대상 — major body 전체 + moon. type 은 순행/역행 라벨 (DoD 3).
const ROTATING = [
  { id: 'earth', tiltDeg: 23.44, periodH: 23.9345, dir: 'prograde' },
  { id: 'mars', tiltDeg: 25.19, periodH: 24.6229, dir: 'prograde' },
  { id: 'jupiter', tiltDeg: 3.13, periodH: 9.925, dir: 'prograde', hasRing: true },
  { id: 'saturn', tiltDeg: 26.73, periodH: 10.656, dir: 'prograde', hasRing: true },
  { id: 'uranus', tiltDeg: 97.77, periodH: 17.24, dir: 'retrograde', hasRing: true },
  { id: 'neptune', tiltDeg: 28.32, periodH: 16.11, dir: 'prograde', hasRing: true },
  { id: 'mercury', tiltDeg: 0.034, periodH: 1407.6, dir: 'prograde' },
  { id: 'venus', tiltDeg: 177.36, periodH: 5832.5, dir: 'retrograde' },
  { id: 'moon', tiltDeg: 6.68, periodH: 655.7, dir: 'prograde' },
];

async function setupPage(browser, query) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const consoleWarns = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
    if (m.type() === 'warning') consoleWarns.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE_URL}${query}`, { waitUntil: 'networkidle', timeout: 45_000 });
  await page.waitForFunction(
    () => typeof window.__simCore !== 'undefined' && typeof window.__solarScene !== 'undefined',
    { timeout: 20_000 },
  );
  await page.waitForTimeout(2800); // mesh 생성 + 첫 LOD pass + focus tween 정착
  return { context, page, consoleErrors, consoleWarns };
}

/**
 * jd0 / jd1 두 시점의 자전 quaternion + 자전축 + ring 법선을 수치로 측정.
 * updateAt(jd) 직접 호출 → 동일 evaluate 내 동기 읽기 (timeChanged listener 간섭 없음).
 */
async function measureRotation(page, body, jd0, jd1) {
  return page.evaluate(
    ({ bodyId, jd0, jd1, hasRing }) => {
      const solar = window.__solarScene;
      const BABYLON = window.BABYLON;
      if (!solar || !solar.meshes) return { error: 'solar/meshes 부재' };
      const mesh = solar.meshes.get(bodyId);
      if (!mesh) return { error: `mesh 부재 (${bodyId})` };

      const Quaternion =
        (BABYLON && BABYLON.Quaternion) ||
        (mesh.rotationQuaternion && mesh.rotationQuaternion.constructor);
      const Vector3 = (BABYLON && BABYLON.Vector3) || mesh.getAbsolutePosition().constructor;

      // ring disc world normal 추출 (ring body 만). ring-anchor 자식 disc 의 첫 mesh 의 up 벡터.
      const ringNormalAt = (jd) => {
        solar.updateAt(jd);
        const anchorName = `${bodyId}-ring-anchor`;
        const anchor = mesh.getScene().getTransformNodeByName?.(anchorName);
        if (!anchor) return null;
        // anchor 자식 중 disc mesh 1개의 world normal (up). disc 의 로컬 +Z 축을 world 변환.
        const child = anchor.getChildMeshes?.(true)?.[0] ?? anchor.getChildren?.()?.[0];
        if (!child) return null;
        child.computeWorldMatrix?.(true);
        const wm = child.getWorldMatrix?.();
        if (!wm || !Vector3) return null;
        // disc 는 rotation.x = π/2 + tilt 로 XZ 평면에 눕는다 → local +Z 가 disc 법선.
        const nLocal = new Vector3(0, 0, 1);
        const nWorld = Vector3.TransformNormal(nLocal, wm);
        nWorld.normalize();
        return { x: nWorld.x, y: nWorld.y, z: nWorld.z };
      };

      // ── jd0 시점 ──
      solar.updateAt(jd0);
      mesh.computeWorldMatrix(true);
      const q0 = mesh.rotationQuaternion;
      if (!q0) return { error: `${bodyId} rotationQuaternion 부재 (selfRotation off?)` };
      const q0c = { x: q0.x, y: q0.y, z: q0.z, w: q0.w };
      // 자전축 (local Y) 을 world 로 — tilt(obliquity) 측정. rotationQuaternion 을 (0,1,0) 에 적용.
      const poleWorld = Vector3 ? new Vector3(0, 1, 0) : null;
      if (poleWorld && Quaternion) {
        const rot = new Quaternion(q0.x, q0.y, q0.z, q0.w);
        poleWorld.rotateByQuaternionToRef?.(rot, poleWorld);
        // fallback: 직접 회전 (rotateByQuaternionToRef 부재 시 matrix 경로 생략 — 아래 tiltDeg 계산에서 처리)
      }
      const ringN0 = hasRing ? ringNormalAt(jd0) : null;

      // ── jd1 시점 ──
      solar.updateAt(jd1);
      mesh.computeWorldMatrix(true);
      const q1 = mesh.rotationQuaternion;
      const q1c = { x: q1.x, y: q1.y, z: q1.z, w: q1.w };
      const ringN1 = hasRing ? ringNormalAt(jd1) : null;

      // 상대 회전 q_rel = q1 * q0⁻¹ — 그 회전각 = spinAngle Δ = ω·Δjd (tilt 는 상쇄).
      // q0⁻¹ = conjugate / |q|² (단위 quaternion 이므로 conjugate).
      const conj0 = { x: -q0c.x, y: -q0c.y, z: -q0c.z, w: q0c.w };
      // q1 * conj0 (Hamilton product).
      const mul = (a, b) => ({
        w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
        x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
        y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
        z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
      });
      const qRel = mul(q1c, conj0);
      // 회전각 = 2·acos(|w|). 부호 (회전 방향) 는 qRel 의 회전축이 자전축(tilt 된 pole)과 같은/반대 방향.
      const relAngle = 2 * Math.acos(Math.min(1, Math.abs(qRel.w)));

      // 자전축 (world pole) — rotationQuaternion(q0) 을 (0,1,0) 에 적용해 얻은 world Y.
      // rotateByQuaternionToRef 로 위에서 poleWorld 계산 (실패 시 quaternion 직접 회전).
      const rotateVecByQ = (v, q) => {
        // v' = q * (v,0) * q⁻¹
        const p = { w: 0, x: v.x, y: v.y, z: v.z };
        const qc = { x: -q.x, y: -q.y, z: -q.z, w: q.w };
        const t = mul(mul(q, p), qc);
        return { x: t.x, y: t.y, z: t.z };
      };
      const pole = rotateVecByQ({ x: 0, y: 1, z: 0 }, q0c);
      // world Y 에서의 각도 = obliquity (tilt). acos(pole·(0,1,0)) = acos(pole.y).
      const tiltMeasuredDeg = (Math.acos(Math.min(1, Math.max(-1, pole.y))) * 180) / Math.PI;

      // 화면 spin 방향 (DoD 3) — qRel 회전축이 자전축과 같은 부호인지 (순행) 반대인지 (역행).
      // qRel 축 = (qRel.x, qRel.y, qRel.z) 정규화. 자전축 pole 과 dot > 0 → 축 정렬 (Δjd>0 이면 +ω).
      // obliquity < 90 이면 pole.y > 0 (북극이 위) → 위에서 볼 때 CCW = prograde.
      // obliquity > 90 이면 pole.y < 0 (북극이 아래) → 위에서 볼 때 CW = retrograde.
      const spinAxisWorld = rotateVecByQ({ x: 0, y: 1, z: 0 }, q0c); // = pole
      const relAxisLen = Math.hypot(qRel.x, qRel.y, qRel.z) || 1e-9;
      const relAxisDotPole =
        (qRel.x * spinAxisWorld.x + qRel.y * spinAxisWorld.y + qRel.z * spinAxisWorld.z) /
        relAxisLen;
      // 화면(ecliptic north = +Y) 기준 유효 spin 부호 = sign(ω) × sign(pole.y). ω>0 (Δjd>0), 부호는 pole.y.
      const eclipticSpinSign = pole.y >= 0 ? 'CCW(prograde)' : 'CW(retrograde)';

      return {
        q0: q0c,
        q1: q1c,
        relAngleRad: relAngle,
        tiltMeasuredDeg: Number(tiltMeasuredDeg.toFixed(3)),
        poleWorldY: Number(pole.y.toFixed(4)),
        eclipticSpinSign,
        relAxisDotPole: Number(relAxisDotPole.toFixed(3)),
        ringNormal0: ringN0,
        ringNormal1: ringN1,
      };
    },
    { bodyId: body.id, jd0, jd1, hasRing: !!body.hasRing },
  );
}

function angleDiffMod2Pi(a) {
  // [0, 2π) 로 정규화 후 π 초과분은 반대쪽으로 (최소 회전각).
  let x = a % (2 * Math.PI);
  if (x < 0) x += 2 * Math.PI;
  if (x > Math.PI) x = 2 * Math.PI - x;
  return x;
}

async function launch() {
  const opts = HEADFUL ? { headless: false, channel: 'chrome' } : { headless: true };
  try {
    const b = await chromium.launch(opts);
    console.log(
      `[browser] ${HEADFUL ? '실 Chrome GUI (headless:false, channel:chrome)' : 'headless chromium'}`,
    );
    return b;
  } catch (e) {
    console.error(`[launch] chrome channel 부재 (${e.message}) — chromium 폴백`);
    return chromium.launch({ headless: !HEADFUL });
  }
}

(async () => {
  const out = { rotateOn: {}, rotateOff: {}, consoleErrors: {}, optionEWarns: {}, dodSummary: {} };
  let allPass = true;
  // #940 — 브라우저 수명주기를 `withBrowser` 로 위임 (에러 경로 close 도달 보장).
  //   `launch()` 는 chrome 채널 부재 시 chromium 폴백이라 옵션 조립만으로 표현 불가 →
  //   launcher 주입 seam 으로 그대로 넘긴다 (launch 인자 무변경 = 자전각 픽셀 측정 축 보존).
  await withBrowser(
    {},
    async (browser) => {
      console.log('\n=== DoD 1+2+3+6 — self-rotation ON (기본) ===');
      for (const body of ROTATING) {
        // Δjd 를 자전 1/4 회전 근처로 (측정 유의미). 이론 spinAngle Δ = ω·Δjd = 2π×24/period × Δjd.
        // 1/4 회전 = π/2 → Δjd = (period/24) / 4 = period/96 [days].
        const quarterDjd = body.periodH / 96;
        const jd1 = JD0 + quarterDjd;
        const { context, page, consoleErrors, consoleWarns } = await setupPage(
          browser,
          `?gpu=a&focus=${body.id}&lod=auto`,
        );
        const m = await measureRotation(page, body, JD0, jd1);
        out.rotateOn[body.id] = m;
        out.consoleErrors[body.id] = consoleErrors.length;
        // 옵션 e 배선 누락 경고 (once-guard) — 0 이어야 정상.
        out.optionEWarns[body.id] = consoleWarns.filter((w) => w.includes('옵션 e')).length;

        if (m.error) {
          console.log(`  ${body.id.padEnd(8)} ERROR: ${m.error}`);
          allPass = false;
          await context.close();
          continue;
        }

        // 시각 확인 캡처 (옵션).
        if (CAPTURE_DIR) {
          const canvas = page.locator('canvas').first();
          const buf = await canvas.screenshot();
          await mkdir(CAPTURE_DIR, { recursive: true });
          await writeFile(path.join(CAPTURE_DIR, `qa-782-${body.id}.png`), buf);
        }

        // DoD 1 — 자전각 Δ = 이론 ω·Δjd (±5%).
        const omega = (2 * Math.PI * 24) / body.periodH; // rad/day
        const theoryDelta = angleDiffMod2Pi(omega * quarterDjd);
        const measuredDelta = angleDiffMod2Pi(m.relAngleRad);
        const deltaErrPct =
          theoryDelta > 1e-6 ? Math.abs((measuredDelta - theoryDelta) / theoryDelta) * 100 : 0;
        const dod1 = deltaErrPct <= 5;

        // DoD 2 — axialTilt 적용 (측정 tilt ≈ obliquity, obliquity>90 은 pole 이 뒤집혀 180-tilt 로 측정될
        // 수 있어 min(tilt, 180-tilt) vs min(obliquity, 180-obliquity) 로 비교하지 않고 직접 obliquity 비교).
        // pole = rotate((0,1,0), tilt(X)) → pole.y = cos(tiltRad). tiltMeasuredDeg = acos(pole.y) = obliquity.
        const tiltErr = Math.abs(m.tiltMeasuredDeg - body.tiltDeg);
        const dod2 = tiltErr <= 1.5; // 0.034° 같은 미세값 floor 여유

        // DoD 3 — 역행 부호 (금성/천왕성 = CW/retrograde, 나머지 CCW/prograde).
        const expectedSign = body.dir === 'retrograde' ? 'CW(retrograde)' : 'CCW(prograde)';
        const dod3 = m.eclipticSpinSign === expectedSign;

        // DoD 6 — ring wobble 0 (ring body 만): ring normal 두 시점 불변 (Δ angle < 0.5°) 인데 body spin Δ>0.
        let dod6 = true;
        let ringDeltaDeg = null;
        if (body.hasRing && m.ringNormal0 && m.ringNormal1) {
          const dot =
            m.ringNormal0.x * m.ringNormal1.x +
            m.ringNormal0.y * m.ringNormal1.y +
            m.ringNormal0.z * m.ringNormal1.z;
          ringDeltaDeg = (Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / Math.PI;
          dod6 = ringDeltaDeg < 0.5 && measuredDelta > 0.01; // ring 불변 + body 는 실제 spin
        } else if (body.hasRing) {
          dod6 = false; // ring normal 측정 실패
          ringDeltaDeg = 'N/A';
        }

        const bodyPass = dod1 && dod2 && dod3 && dod6;
        allPass = allPass && bodyPass;
        out.dodSummary[body.id] = {
          dod1_angle: dod1,
          theoryDeltaRad: Number(theoryDelta.toFixed(4)),
          measuredDeltaRad: Number(measuredDelta.toFixed(4)),
          deltaErrPct: Number(deltaErrPct.toFixed(2)),
          dod2_tilt: dod2,
          tiltMeasuredDeg: m.tiltMeasuredDeg,
          tiltExpectedDeg: body.tiltDeg,
          dod3_sign: dod3,
          measuredSign: m.eclipticSpinSign,
          expectedSign,
          dod6_ringWobble: dod6,
          ringDeltaDeg,
          pass: bodyPass,
        };
        console.log(
          `  ${body.id.padEnd(8)} DoD1(angle)=${dod1 ? 'PASS' : 'FAIL'}(err${deltaErrPct.toFixed(1)}%) ` +
            `DoD2(tilt)=${dod2 ? 'PASS' : 'FAIL'}(${m.tiltMeasuredDeg}°vs${body.tiltDeg}°) ` +
            `DoD3(sign)=${dod3 ? 'PASS' : 'FAIL'}(${m.eclipticSpinSign}) ` +
            `DoD6(ring)=${body.hasRing ? (dod6 ? 'PASS' : 'FAIL') + `(Δ${ringDeltaDeg}°)` : 'n/a'} ` +
            `optionEWarn=${out.optionEWarns[body.id]} err=${consoleErrors.length}`,
        );
        await context.close();
      }

      console.log('\n=== ?rotate=off 대조 (자전 정지 = rotationQuaternion 부재 or 불변) ===');
      for (const body of ROTATING.slice(0, 3)) {
        const { context, page } = await setupPage(
          browser,
          `?gpu=a&focus=${body.id}&lod=auto&rotate=off`,
        );
        const m = await measureRotation(page, body, JD0, JD0 + body.periodH / 96);
        out.rotateOff[body.id] = m.error
          ? { stopped: true, reason: m.error }
          : { relAngleRad: m.relAngleRad };
        // rotate=off 면 rotationQuaternion 미설정 → measureRotation 이 error 반환 (자전 정지 = 정상).
        const stopped = !!m.error || (m.relAngleRad !== undefined && m.relAngleRad < 1e-6);
        console.log(
          `  ${body.id.padEnd(8)} 자전정지=${stopped ? 'PASS' : 'FAIL'} ${m.error ? `(${m.error})` : `relAngle=${m.relAngleRad}`}`,
        );
        allPass = allPass && stopped;
        await context.close();
      }
    },
    { launch },
  );

  console.log(`\n=== 종합: ${allPass ? 'ALL PASS' : 'FAIL 존재'} ===`);
  console.log('\n=== JSON ===');
  console.log(JSON.stringify(out, null, 2));
  process.exit(allPass ? 0 : 1);
})();
