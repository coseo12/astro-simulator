#!/usr/bin/env node
/**
 * #756 — 절차적 행성 표면 셰이더 qa 동적 검증.
 *
 * 실 Chrome GUI (headless: false, channel: chrome) — WebGPU swiftshader freeze 회피 (#663).
 * 픽셀 측정 = composited canvas.screenshot() (PNG) → 페이지 내 Image 디코드 → 2D getImageData.
 *   ⚠️ WebGPU drawImage readback 빈버퍼 함정 회피 (#728 SSoT) — page.evaluate 내 2D canvas 경로만.
 *
 * disk 영역만 샘플: __simCore.scene.activeCamera 로 mesh 의 **투영 disk** 를 산출 →
 *   그 원 안 픽셀만 분석 (UI / 궤도선 / 배경 / glow 오염 제외).
 *   ⚠️ bbox 8 corner 투영이 아니다 — #1146 에서 그 창이 비결정적임이 확정됐다 (§측정 방법 참조).
 *
 * ── 측정 방법 (#1146 — CRITICAL #6.10 「수치 DoD 미달 시 (0) 측정 방법 검증 우선」) ──────────
 * 초판(#756~#803)은 **회전하는 mesh 의 world AABB** 8 코너를 투영해 창을 잡고, 창 안에서
 * `lum < 8` 로 배경을 **거르려 했다**. 두 축 모두 결함이었고 2026-08-22 개입 실험으로 확정됐다
 * (D2 의 성격은 PR #1156 리뷰에서 한 번 더 정정됐다 — 아래).
 *
 *  D1 — 창이 자전 위상의 함수였다. local AABB 는 정육면체라 mesh 가 돌면 축정렬 외접 박스가
 *       커졌다 작아진다. 가드가 `?rotate=off` 를 주지 않아 매 page load 가 임의 위상을 캡처했다.
 *       실측(로컬 swiftshader, earth, 같은 대기 2600ms): 창 `177~227` 로 갈리는데 `camRadius` 는
 *       12 표본 전부 `48.4371` 로 동일 → 카메라가 아니라 mesh world AABB 자체가 변한다.
 *  D2 — `lum < 8` 배경 마스크가 **배경 대신 천체를** 걸렀다. 배경은 임계 위로 렌더된다
 *       (earth 단독 표본 `below8 = 0 / 58,000`, 그 창 모서리 4점 전부 `9.2`) — 이 분기가
 *       배경을 거른 적은 없다. ⚠️ **초판(#1146)은 여기서 「죽은 분기」로 결론냈고 PR #1156
 *       리뷰가 반증했다.** 어두운 body 에서는 발화했고, 발화한 대상이 **천체 픽셀**이다 —
 *       mars/neptune 밤면 disk 휘도가 `6.7~6.9` 로 임계 `8` **아래**다 (2026-08-24 방사 프로파일).
 *       재현 술어: 구 코드 `measureDisk` 가 `screenBox` 를 반환값에 담아 `=== JSON ===`
 *       덤프로 찍으므로 (콘솔 요약 라인에는 없다) **제외 픽셀 = `w × h − area`** 를 표본마다
 *       직접 계산한다. 모집단 = 구 코드 CI run 3건 (`32705066150` / `32557761937` /
 *       `32570050718`) 의 `verify:756-surface` JSON 에서 `area` 와 `screenBox` 를 둘 다 가진
 *       노드 전건 = **45** (surfaceOn 4 + surfaceOff 4 + plain 3 + lodMid 3 + tierC 1, × 3 run).
 *       술어 `w × h − area > 0` → **45 중 9 건** (mars 6 / neptune 3). 나머지 36 은 제외 0 이
 *       계산으로 확정된다 (전제: viewport 1280x720 + deviceScaleFactor 1 이고 45 표본의
 *       imgSize 가 전건 1280x720 이라 렌더 px == 이미지 px).
 *       ⚠️ 재현되는 것은 **부호**다 — 3 run 전건에서 mars/neptune 은 항상 > 0, 나머지는 항상 0.
 *       **양은 아니다** (mars/surfaceOn 75/74/29 로 2.6x 갈림; neptune 223/224/223 과
 *       mars/surfaceOff 85/85/86 은 안정하나 n=3).
 *       ⚠️ 초판(`e38b6fa`)은 `screenBox` 를 직접 인용했다 (그 entry 내 인수분해 표현 0 건).
 *       인수분해 우회 술어는 리뷰 라운드 1 [C1] 에서 들어와 라운드 2 커밋본에 실렸다. 그 술어는
 *       (a) 뷰포트 상한이 빠지면 4 가 아니라 2 를 내고 (b) 한 방향 검사라 9 중 5 를 놓친다
 *       (검출 4 = mars 2 + neptune 2 / 미검출 5 = mars 4 + neptune 1).
 *       `screenBox` 가 있으므로 우회는 불필요했다.
 *       ⇒ 「죽은 분기」가 아니라 **「반대로 동작하는 분기」**다. earth/jupiter/moon 은 밝아서
 *       우연히 무해했고, 어두운 두 body 는 **측정 대상 자체가 달랐다**
 *       (구: 밤면 일부 제외 / 신: 기하 원 안 전부 포함).
 *  D2 가 D1 을 엔트로피로 번역한다: 창 안 배경은 라플라시안 ≈ 0 이라 히스토그램 bin 0 을 채워
 *  **창이 커질수록 엔트로피가 내려간다**. OFF 는 표면 변조가 없어 엔트로피가 전적으로 창 구성에서
 *  오므로 D1 에 최대로 노출됐다 → ON−OFF 갭이 `-0.016 ~ +0.611` 로 진동, 한 번은 **음수**였다.
 *
 * 처방 2개 (자매 가드 선례 재사용 — 신규 구현 금지, CLAUDE.md §신규 함수 ≠ 신규 구현):
 *  P1 — 전 시나리오에 `?rotate=off` (`#782` 가 *"자전 정지 = 자전 도입 전 픽셀 100% 복귀
 *       (snapshot 가드 격리)"* 목적으로 만든 플래그. `#782`/`#783`/`#1119` 가 이미 사용).
 *  P2 — 창을 AABB 코너 대신 **투영 disk** 로 잡고 배경을 휘도가 아니라 **기하** 로 배제
 *       (`#1119`/`#783` 선례). 임계 `8` 상향은 배경색이 바뀌면 재발할 뿐 아니라 위 D2 의
 *       어두운 body 왜곡을 **키우므로** 채택하지 않는다.
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
 *
 *  ⚠️ **위 D1 근거값은 이력이다 — 현행 창으로는 재현되지 않는다** (#1146, 2026-08-22).
 *    술어가 「구 창」이었기 때문이다: 회전하는 mesh 의 world AABB 투영 + 배경 대신 어두운
 *    천체를 걸러내던 `lum < 8` 마스크 (상단 §측정 방법 D1/D2 — 「미발화」가 아니다).
 *    그 술어 하에서 갭은 표본마다 다른 창 구성의 함수라
 *    `0.768` 도 `0.051` 도 **같은 코드가** 낸다 — 값이 틀렸던 게 아니라 **재현 가능한 양이
 *    아니었다**. 값을 지우지 않고 남기는 것은 마진 `0.15` 가 어떤 근거로 정해졌는지의 기록이기
 *    때문이다 (값 교체는 기록 위조 — reviewer.md §4 계급 2 「이력 기록」).
 *  - 재측정 (2026-08-24, #1146 — 투영 disk 창 + 기하 마스크, 로컬 swiftshader `10`회 반복):
 *    집계값은 본 이슈 PR 본문의 「완료 기준 실측 표」가 정본이다. 마진 `0.15` 는 **무변경**이며
 *    (#1146 비목표), 새 창의 갭은 구 창보다 **커졌다** — 창에서 배경이 빠져 OFF 쪽 히스토그램
 *    bin 0 팽창이 사라졌기 때문이다.
 */
const HF_ENTROPY_MARGIN = 0.15;

/**
 * #1146 P1 — 전 시나리오 공통 쿼리 접미 (자전 정지).
 *
 * **모든** 쿼리 site 에 일관 적용한다 (ON/OFF 대조 경로만이 아니라 `plain` / `lodMid` / `tierC` 까지).
 * 근거 3:
 *  1. 판정량은 ON−OFF **차** 라, 두 경로가 같은 기하를 보지 않으면 차 자체가 정의되지 않는다.
 *     비판정 경로(`plain`/`lodMid`/`tierC`)의 로그도 회귀 조사 때 판정 경로와 대조되므로 같은
 *     조건이어야 읽을 수 있다.
 *  2. 자전은 표면 셰이더 유무와 **직교** 하다 (셰이더는 high/mid variant 부착 여부의 함수 —
 *     #756 §결정 3). 정지시켜도 측정 대상이 줄지 않는다. 실증은 아래 기준 5 판별력 표.
 *  3. `rotate=off` 는 `axialTilt` 도 적용하지 않는다 (#782 계약) → world matrix 회전이 identity.
 *     `tierC` 는 `?lod=` 를 붙이면 forceOverride 가 무효화되는 기존 결함이 있으나(아래 DoD 4 주석)
 *     `rotate` 는 그와 독립 파라미터라 lodStats 배선에 개입하지 않는다 (실측 확인).
 */
const ROTATE_OFF_QUERY = '&rotate=off';

/**
 * #1146 P2 — 분석 창의 disk 반경 대비 샘플 비율.
 *
 * 투영 disk 반경 `R` 의 `0.95R` 안쪽만 표본에 넣는다. 실측 방사 휘도 프로파일(6 body,
 * swiftshader, 정규화 반경 0.04 간격 **링 평균**) 에서 disk 경계는 `t = 0.98` 까지 천체 휘도를
 * 유지하고 `t = 1.02` 에서 급락, `t = 1.06` 이 `9.4` / `t ≥ 1.10` 이 `9.3` 으로 배경에 수렴했다
 * (earth) — 즉 산출 반경이 실제 픽셀 경계와 일치한다.
 * ⚠️ 이 `9.4`/`9.3` 은 헤더 D2 의 `9.2` 와 **같은 양의 두 표본이 아니다** — 전자는 링 평균,
 * 후자는 구 창 모서리 4점 값이다. 두 서술이 함께 쓰는 것은 「셋 다 임계 `8` 위」라는 부등식뿐이다.
 * `0.95` 는 그 limb antialiasing 링을 마진째 배제하는 값이다 (`#1119` 의 `DISK_SAMPLE_RADIUS
 * = 0.85` 와 같은 역할이나, 본 가드는 표면 변조 전면을 재야 하므로 덜 깎는다).
 */
const DISK_SAMPLE_RADIUS = 0.95;

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
 * disk 영역 픽셀 통계 — mesh 의 **투영 disk** 안 픽셀만 분석 (#1146 P2).
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
    async ({ b64, bodyId, DISK_SAMPLE_RADIUS }) => {
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

      const boundingInfo = mesh.getBoundingInfo();
      const Vector3 = (BABYLON && BABYLON.Vector3) || mesh.getAbsolutePosition().constructor;
      // BABYLON 전역 미노출 — Matrix 클래스는 mesh.getWorldMatrix() 의 constructor 에서 획득.
      // 투영 대상 좌표를 이미 월드로 만들어 넘기므로 Project 의 world 인자는 Identity 사용.
      const Matrix = (BABYLON && BABYLON.Matrix) || mesh.getWorldMatrix().constructor;
      const idMat = Matrix.Identity();

      // ── 회전 불변 시각 반경 (#1146 P2) ────────────────────────────────────────────────
      // 산식 SSoT = `packages/core/src/scene/camera-controller.ts` 의 `resolveMeshVisualRadius`
      // (#790): `max(boundingBox.extendSize(local) 각 축 × |scaling| 각 축)`. 코어 함수는 window
      // 에 노출돼 있지 않아 산식만 재현한다 — 값이 갈리면 가드와 런타임이 다른 반경을 본다.
      //
      // ⚠️ `boundingSphere.radiusWorld / √3` (#783 / #1119 선례) 를 쓰지 않는 이유 — 그 보정은
      // **회전이 identity 일 때만** 맞다. Babylon 의 `radiusWorld` 는 world matrix 로 변환한
      // (1,1,1) 의 최대 성분에 비례하므로 자전 위상의 함수다. earth 실측 (2026-08-24, 같은 커밋):
      //   `rotate=off` → radiusWorld/√3 = 4.25240, 본 산식 = 4.25240 (비 1.0000)
      //   자전 ON      → radiusWorld/√3 = 5.92617, 본 산식 = 4.25240 (비 **1.3936** — 39% 과대)
      // P1 로 `rotate=off` 를 주므로 두 산식은 같은 값이 되지만, 회전 불변 쪽을 채택해
      // `rotate=off` 가 미래에 빠져도 창이 조용히 틀어지지 않게 한다 (방어의 깊이).
      const extendSize = boundingInfo.boundingBox.extendSize;
      const scaling = mesh.scaling;
      const radiusWorld = Math.max(
        extendSize.x * Math.abs(scaling.x),
        extendSize.y * Math.abs(scaling.y),
        extendSize.z * Math.abs(scaling.z),
      );
      const center = mesh.getAbsolutePosition();
      // 카메라 right 방향 edge 점을 투영해 중심과의 거리를 잰다 — **투영 단계**는
      // procedural-planet-shader.ts `projectedDiskRadiusPx` 와 동일하다 (bbox 코너 투영은
      // cube 모서리라 ~1.2× 과대). ⚠️ **world 반경 산출은 의도적으로 다르다** — 런타임은
      // `radiusWorld / √3`, 본 가드는 위 ⚠️ 블록 근거로 `max(extendSize × |scaling|)` 을 쓴다.
      const camRight = cam.getDirection(new Vector3(1, 0, 0));
      const centerScreen = Vector3.Project(center, idMat, transform, vp);
      const edgeScreen = Vector3.Project(
        center.add(camRight.scale(radiusWorld)),
        idMat,
        transform,
        vp,
      );
      const diskRpx = Math.hypot(edgeScreen.x - centerScreen.x, edgeScreen.y - centerScreen.y);
      if (!(diskRpx > 0) || !Number.isFinite(diskRpx)) {
        return { error: `disk 투영 반경 산출 실패 (${diskRpx})` };
      }
      // 창 = disk 외접 정사각형 (viewport clamp). 배경 배제는 창이 아니라 아래 원 마스크가 한다.
      const boxMinX = Math.max(0, Math.floor(centerScreen.x - diskRpx));
      const boxMinY = Math.max(0, Math.floor(centerScreen.y - diskRpx));
      const screenBox = {
        x: boxMinX,
        y: boxMinY,
        w: Math.min(rw, Math.ceil(centerScreen.x + diskRpx)) - boxMinX,
        h: Math.min(rh, Math.ceil(centerScreen.y + diskRpx)) - boxMinY,
        cx: Number(centerScreen.x.toFixed(2)),
        cy: Number(centerScreen.y.toFixed(2)),
        r: Number(diskRpx.toFixed(2)),
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

      // ── luminance 2D 그리드 + disk 마스크 (#1146 P2) ──────────────────────────────────
      // 배경 배제는 **기하** 로 한다: 투영 disk 중심에서 `DISK_SAMPLE_RADIUS × R` 안쪽만 표본.
      // 초판의 `lum < 8` 휘도 임계는 제거했다 — 배경이 임계 위(`9.2`)라 **배경을 거른 적이 없고**,
      // mars/neptune 밤면 disk 픽셀이 `6.7~6.9` 라 어두운 body 에서는 **천체를** 깎았다
      // (헤더 D2 재현 술어 참조 — 「죽은 분기」가 아니라 「반대로 동작하는 분기」였다).
      // 임계 상향은 배경색이 바뀌면 재발하고 그 왜곡을 키우므로 채택하지 않는다.
      // 계약과 어긋나는 분기를 남기는 것도 금지 (CLAUDE.md §주석 계약 vs 구현 drift) —
      // 「배경 배제」 계약을 실제로 이행하는 기하 술어로 옮긴다.
      const maskRx = diskRpx * sx * DISK_SAMPLE_RADIUS;
      const maskRy = diskRpx * sy * DISK_SAMPLE_RADIUS;
      const maskCx = centerScreen.x * sx - bx; // 창 좌표계 기준 disk 중심
      const maskCy = centerScreen.y * sy - by;
      const lumGrid = new Float32Array(bw * bh);
      const mask = new Uint8Array(bw * bh);
      const lums = [];
      const colorSet = new Set();
      for (let py = 0; py < bh; py++) {
        for (let px = 0; px < bw; px++) {
          const i = py * bw + px;
          const r = data[i * 4];
          const g = data[i * 4 + 1];
          const b = data[i * 4 + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          lumGrid[i] = lum;
          const dx = (px + 0.5 - maskCx) / maskRx;
          const dy = (py + 0.5 - maskCy) / maskRy;
          if (dx * dx + dy * dy > 1) continue; // disk 밖 (우주 배경 / 궤도선 / UI) 배제
          mask[i] = 1;
          lums.push(lum);
          colorSet.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
        }
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
        // #1146 기준 4 — 배경이 실제로 제외됐다는 관측 가능한 증거. 기하 마스크가 살아 있으면
        // `excludedPx > 0` 이어야 한다. ⚠️ 구 코드의 `excluded` 는 body 에 따라 갈렸다 —
        // earth/jupiter/moon 표본은 `area === windowPx` 로 읽히나 mars/neptune 은 `> 0` 이
        // 확정된다 (헤더 D2). 신 코드는 배경을 기하로 배제하므로 전 body 에서 `> 0` 이다.
        windowPx: bw * bh,
        excludedPx: bw * bh - n,
        diskRpx: Number(diskRpx.toFixed(2)),
        stddev: Number(stddev.toFixed(3)), // 전역 (라이팅 포함 — 참고용)
        hfEnergy: Number(hfEnergy.toFixed(4)), // ★ 고주파 RMS = 절차 디테일 지표
        hfEntropy: Number(hfEntropy.toFixed(3)),
        uniqueColors: colorSet.size,
        meanLum: Number(mean.toFixed(1)),
        screenBox,
        imgSize: { w: img.width, h: img.height },
      };
    },
    { b64, bodyId, DISK_SAMPLE_RADIUS },
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
          `?gpu=a&focus=${id}&lod=auto${ROTATE_OFF_QUERY}`,
        );
        const m = await measureDisk(page, id, `surface-on-${id}`);
        out.surfaceOn[id] = { type, ...m };
        out.consoleErrors[`on-${id}`] = consoleErrors.length;
        console.log(
          `  ${id.padEnd(8)} [${type}] hfEnergy=${m.hfEnergy} hfEntropy=${m.hfEntropy} stddev=${m.stddev} uniqColors=${m.uniqueColors} area=${m.area}/${m.windowPx} (제외 ${m.excludedPx}) box=${m.screenBox?.w}x${m.screenBox?.h} err=${consoleErrors.length}`,
        );
        if (consoleErrors.length)
          console.log(`     ↳ console errors: ${JSON.stringify(consoleErrors.slice(0, 3))}`);
        await context.close();
      }

      console.log('\n=== DoD 5 — ?surface=off 단색 복귀 대조 ===');
      for (const { id, type } of SURFACE_BODIES) {
        const { context, page, consoleErrors } = await setupPage(
          browser,
          `?gpu=a&focus=${id}&lod=auto&surface=off${ROTATE_OFF_QUERY}`,
        );
        const m = await measureDisk(page, id, `surface-off-${id}`);
        out.surfaceOff[id] = { type, ...m };
        out.consoleErrors[`off-${id}`] = consoleErrors.length;
        console.log(
          `  ${id.padEnd(8)} [${type}] hfEnergy=${m.hfEnergy} hfEntropy=${m.hfEntropy} stddev=${m.stddev} uniqColors=${m.uniqueColors} area=${m.area}/${m.windowPx} (제외 ${m.excludedPx}) box=${m.screenBox?.w}x${m.screenBox?.h} err=${consoleErrors.length}`,
        );
        await context.close();
      }

      console.log('\n=== DoD 2 — 무회귀 (미등록 body 단색, surface ON) ===');
      for (const { id } of PLAIN_BODIES) {
        const { context, page, consoleErrors } = await setupPage(
          browser,
          `?gpu=a&focus=${id}&lod=auto${ROTATE_OFF_QUERY}`,
        );
        const m = await measureDisk(page, id, `plain-${id}`);
        out.plain[id] = m;
        console.log(
          `  ${id.padEnd(8)} hfEnergy=${m.hfEnergy} hfEntropy=${m.hfEntropy} stddev=${m.stddev} uniqColors=${m.uniqueColors} area=${m.area}/${m.windowPx} (제외 ${m.excludedPx}) box=${m.screenBox?.w}x${m.screenBox?.h} err=${consoleErrors.length}`,
        );
        await context.close();
      }

      console.log('\n=== DoD 3 — LOD mid 전환 표면 연속성 (reviewer 권고 1: cross-fade 팝핑) ===');
      {
        const { context, page } = await setupPage(
          browser,
          `?gpu=a&focus=earth&lod=auto${ROTATE_OFF_QUERY}`,
        );
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
        // ⚠️ 아래 `measureDisk` 픽셀 값은 **참고값**이다 (판정 입력 아님 — 판정축은 `lodStats`).
        // tier-c 에서 실제 렌더되는 것은 low billboard quad 이고 그 variant 는 #675 에서
        // 자체 scaling 을 쓰는데(`solar-system-scene.ts` low variant), 본 함수의 반경은
        // high mesh 의 `extendSize × scaling` 에서 나온다 — 즉 창이 렌더된 quad 와 대응하는지
        // 확인되지 않았다. 신 창 실측 `area≈111~112` (run `32731913488` `112` /
        // `32736347310` `111` — 투영 반경 말단 차로 1 갈린다), 구 창은 run
        // `32705066150` `378` / `32705331154` `437`. 어느 쪽이든 near-degenerate 하니
        // 회귀 조사에서 이 수를 신호로 읽지 말 것 (#1146 리뷰 R8/P5).
        const { context, page } = await setupPage(browser, `?gpu=c${ROTATE_OFF_QUERY}`);
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
