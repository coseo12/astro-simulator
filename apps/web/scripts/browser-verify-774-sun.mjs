#!/usr/bin/env node
/**
 * #774 — 태양 emissive 절차 표면 셰이더 dev 동적 검증.
 *
 * 실 Chrome GUI (headless: false, channel: chrome) — WebGPU swiftshader freeze 회피 (#663).
 * 픽셀 측정 = composited canvas.screenshot() (PNG) → 페이지 내 Image 디코드 → 2D getImageData.
 *   ⚠️ WebGPU drawImage readback 빈버퍼 함정 회피 (#728 SSoT) — page.evaluate 내 2D canvas 경로만.
 *
 * 측정 (ADR 20260703-774 §DoD):
 *   DoD 1 — granulation: 태양 disk 라플라시안 고주파 에너지/엔트로피 ON > OFF.
 *   DoD 2 — limb darkening: radial Rec.709 휘도 프로파일 단조 감소 + edge(r≈0.9R)/center < 0.85.
 *   DoD 3 — 색온도: 가장자리 B/R 채널비 < 중심 B/R × (1 − `COLOR_TEMP_MARGIN`) (#1159 — 마진 도입
 *           전에는 마진 없는 순수 부등식이었다).
 *   DoD 4 — ?surface=off 단색 복귀 (hf ≈ 0) + planet 4종 ON 무회귀.
 *
 * ── 측정 방법 (#1155 — CRITICAL #6.10 「수치 DoD 미달 시 (0) 측정 방법 검증 우선」) ──────────
 * 초판(#774~#1154)은 **world AABB 8 코너 투영** 창을 잡고 `R = min(bw, bh) / 2` 를 disk 반경으로
 * 썼다. 그 `R` 은 disk 반경이 아니라 **cube 외접 박스** 반경이라 과대하고, DoD 2 가 이름으로 내건
 * `r = 0.9R` 링이 **실제 disk 밖**에 떨어졌다. 2026-08-25 로컬 실측 (headless chromium,
 * `?gpu=a&focus=sun&lod=auto`, 같은 대기 2600ms):
 *   `bboxR = 116.00` / 투영 disk 반경 `diskRpx = 98.32` ⇒ 팽창 `1.1798`
 *   ⇒ `0.9 × bboxR = 104.4px` 는 disk(98.32px) **밖** — 재는 것이 GlowLayer halo 다.
 * 그 링의 이웃 `r = 0.95` (`110.2px`) 는 휘도 `9.08` · `B/R 1.625` 로 명백한 **우주 배경**인데
 * `lum ≥ 8` 마스크를 통과해 48 표본 전건 유효 취급됐다.
 *
 *  D1 — **판별력 0** (`#1123`/`#1127` 클래스). 셰이더의 `mu` 를 재형해 disk 내부 주연감광을
 *       소멸시킨 변이(M-B: `mu ← 1 − (1−mu)^8`, 잔존 감광은 **rim 에만** — disk 가장자리 안쪽
 *       `t → 1`) 를 심으면 disk 내부 방사 프로파일이 `240.64 → 230.32`(r 0~0.7) 로 **평탄**해지는데,
 *       구 창의 `edgeCenterRatio` 는 halo 를 재서 `0.2762`(임계 `0.85`) → **PASS 로 통과**했다
 *       (구 창 실측, 같은 날). 즉 DoD 2 가 이름으로 내건 성질이 사라져도 가드가 침묵한다.
 *       신 창에서는 같은 변이가 `exit 1` 이다 (PR 본문 표).
 *       ⚠️ **M-B 가 DoD 2 를 「격리」하지는 않는다** — 초판 서술을 정정한다 (reviewer 라운드 2
 *       [C1], 값 교체 아님). 색온도는 채널별 `u` 가 `(1 − mu)` 에 곱해질 때만 발현하는데 M-B 는
 *       그 곱을 `t = 0.9` 에서 `(1−mu)^8 = 0.010254` 로 줄이므로 **DoD 3 축도 함께 죽는다**
 *       (신 가드 실측 `1 − (B/R edge)/(B/R center)` 가 무주입 `31.30%` → M-B `0.38%`, 파괴
 *       `98.8%`). 구 가드가 M-B 에서 `exit 0` 인 것은 DoD 3 이 살아서가 아니라 그 판정
 *       (`bOverREdge < bOverRCenter`) 에 **마진 상수가 없어 부호만 비교**하기 때문이다.
 *       한편 M-A(`limb ← vec3(1.0)`) 의 신 DoD 3 `FAIL` 은 **기전이 또 다르다** — 마진이
 *       `0.15%` 인데 이는 **granulation clamp 잔차**(`base` 비 `0.6588` 대비 center `+0.59%` /
 *       edge `+0.74%`) 의 차이지 색온도 검출이 아니다. ⇒ **본 가드의 판별력 근거는 DoD 2 축에
 *       있다** (DoD 3 은 두 변이 어느 쪽에서도 축이 살아 있음을 보이지 못한다).
 *       ⚠️ **위 두 문장은 `#1155` 시점(마진 도입 전)의 술어다 — `#1159` 가 그 시점을 지났다.**
 *       값을 갈아치우지 않고 시점을 명시한다 (`reviewer.md` §4 계급 2). `COLOR_TEMP_MARGIN`
 *       (아래 상수) 도입 후 실측: M-B 는 신호 `0.38% < 10%` 로 **DoD 3 축 자체가 `FAIL`** 이고
 *       (`#1155` 에서는 그 축이 통과했다), M-A 의 `FAIL` 은 잔차 부호가 아니라 **`|0.15%| < 10%`**
 *       에서 나온다 — 즉 잔차 부호가 반대로 뒤집혀도 그대로 `FAIL` 이라 위 「부호를 보장하는
 *       장치가 없다」는 지적이 해소된다. DoD 2 축의 판별력 근거는 그대로 유효하다 (무변경).
 *  D2 — `lum < 8` 휘도 마스크는 **배경을 거르지 않는다**. 배경이 임계 위(`9.08`)로 렌더되기
 *       때문이다 (`#1146` 이 756 에서 먼저 확정한 것과 같은 축). 태양은 밝아서 「천체를 깎는」
 *       반대 방향 피해는 없었으나, 배경을 통과시킨 결과가 곧 위 D1 의 halo 오염이다.
 *  D3 — `edge = valid.find(r === 0.9) ?? valid[valid.length - 1]` 는 링이 탈락하면 **조용히 다른
 *       반경으로 대체**한다. 위 실측에서는 발화하지 않았으나(전 링 48 표본) §가드 설계 원칙
 *       *"drift 가드는 fail-fast 만 — fallback 분기 절대 금지"* 위반이다.
 *
 * 처방 (자매 가드 선례 재사용 — 신규 구현 금지, CLAUDE.md §신규 함수 ≠ 신규 구현):
 *  P1 — 창을 AABB 코너 대신 **투영 disk** 로 잡고 배경을 휘도가 아니라 **기하** 로 배제
 *       (`#1146` 이 `browser-verify-756-surface.mjs` 에 박제한 산식 + `#1119`/`#783` 선례).
 *       radial 프로파일의 `R` 도 그 `diskRpx` 로 바꾼다 — 이것이 DoD 2 를 disk 안으로 되돌린다.
 *  P2 — `judgeRadial` 을 fail-fast 로 (링 결손 / `r = 0.9` 부재 시 대체 없이 판정 실패).
 *
 * ⚠️ `?rotate=off`(`#1146` P1) 는 **도입하지 않는다**. 756 의 D1 은 창이 자전 위상의 함수였다는
 * 것인데, 본 가드의 신 창은 회전 불변 산식이라 그 축이 구조적으로 소멸했고, 판정 대상인 태양은
 * `rotationPeriodHours` 데이터 부재로 self-rotation 비대상이다 (ADR §결정 3). 즉 판정 경로에
 * 자전 축이 존재하지 않는다. planet 4종 무회귀 구간은 자전하지만 **판정 입력이 아니다** (로그 전용).
 *
 * 사용법:
 *   node apps/web/scripts/browser-verify-774-sun.mjs
 *   HEADFUL=0 node apps/web/scripts/browser-verify-774-sun.mjs     # headless 폴백
 *   CAPTURE_DIR=/abs/dir node ...                                  # 캡처 PNG 저장
 */

import { chromium } from 'playwright';
import { withBrowser } from '../../../scripts/browser-verify-utils.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const CAPTURE_DIR = process.env.CAPTURE_DIR ?? null;
const HEADFUL = process.env.HEADFUL !== '0';
/**
 * #1155 P1 — 분석 창의 disk 반경 대비 샘플 비율. `browser-verify-756-surface.mjs` 의 동명 상수와
 * 같은 값·같은 역할이다 (limb antialiasing 링을 마진째 배제). 본 가드에서는 granulation 지표
 * (`hfEnergy`/`hfEntropy`/`area`) 의 기하 마스크로만 쓰인다 — radial 프로파일은 아래 `RADII` 가
 * 자체 반경을 갖고, 그 최대값이 본 상수와 같아 프로파일 전 링이 마스크 반경 이내다.
 */
const DISK_SAMPLE_RADIUS = 0.95;

/** radial 프로파일 링 (투영 disk 반경 `diskRpx` 대비 비율). 최대값 = `DISK_SAMPLE_RADIUS`. */
const RADII = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95];
/** 링당 방위 표본 수. */
const RADIAL_ANGLES = 48;
/** DoD 2 가 이름으로 내건 edge 링 (`edge/center < 0.85`). 대체 금지 — 부재 시 판정 실패 (D3). */
const EDGE_RADIUS = 0.9;
if (!RADII.includes(EDGE_RADIUS)) {
  throw new Error(`RADII 에 EDGE_RADIUS(${EDGE_RADIUS}) 부재 — DoD 2 측정 불가`);
}
if (Math.max(...RADII) > DISK_SAMPLE_RADIUS) {
  throw new Error(`RADII 최대값이 DISK_SAMPLE_RADIUS(${DISK_SAMPLE_RADIUS}) 초과 — 링이 창 밖`);
}

/**
 * #1159 — DoD 3(색온도) 판정의 **상대 낙차 하한**. 구판 판정은 `bOverREdge < bOverRCenter` 라는
 * 순수 부등식이라 **부호만** 비교했고, 색온도를 `98.8%` 소멸시킨 변이(M-B: `mu ← 1 − (1−mu)^8`)의
 * 잔존 `0.38%` 도 부호가 옳아 통과했다 (#1155 / PR #1158 본문 「색온도 신호」 표 — 「테스트가
 * 있다 ≠ 그 테스트가 작동한다」 #1123 클래스. 그 표에서 `exit 1` 을 낸 것은 DoD 2 였다).
 *
 * **형태 — 상대(곱셈) 마진** (`bOverREdge < bOverRCenter × (1 − MARGIN)`). 판정량 `B/R` 이
 * 무차원 채널비라 가산 마진은 base 발광색(`#FFE9A8`)·노출이 바뀌면 뜻이 달라진다. 같은
 * `judgeRadial` 안의 형제 축 DoD 2 가 이미 `edge/center < 0.85` 라는 같은 형태이고,
 * `browser-verify-773-light.mjs` 의 `DAY_NIGHT_RATIO_MIN` 도 곱셈이다 (756 의
 * `HF_ENTROPY_MARGIN` 만 가산인데 그쪽 판정량 엔트로피는 비율량이 아니다).
 *
 * **산출 근거 (measurement-first — 임계부터 정하고 맞춘 값이 아니다).**
 * 신호 = `1 − bOverREdge / bOverRCenter` (DoD 3 이 비교하는 바로 그 두 값의 상대 낙차).
 *  - **하한 (판별력)** — M-B 잔존 `0.38%` 보다 커야 한다.
 *  - **상한 (무회귀)** — 무주입 관측 최소 신호의 `1/2` = `15.65%` (스프린트 계약 기준 2).
 *    무주입 관측 모집단 (전건 `31.30%` 또는 `31.31%`, 환경 간 진폭 `0.01%p`):
 *      · 로컬 swiftshader headless `31.30%` — #1159 n=5 (마진 도입 전 3 + 도입 후 2) · #1155
 *        Phase 0 n=6 ⇒ 11회 전건 동일 (sd `0`)
 *      · CI `31.31%` — #1155 Phase 0 `shader-pixel-guard` run 5건 전건 동일 + 본 마진 도입
 *        PR #1162 의 run `32928986266` 1건 (`0.4552 / 0.6627`) ⇒ 6건 전건 동일
 *      · **실 Chrome 하드웨어 GPU** (HEADFUL 기본) `31.30%` — #1159 n=1 (B/R `0.4553`/`0.6627`
 *        가 swiftshader 와 자릿수까지 같다. `edge/center` 만 `0.6609` vs `0.6612` 로 갈린다)
 *  - **선택 — 채택값은 스프린트 계약의 `2×` 규칙만으로 유일하게 결정된다.** 본 상수와 773
 *    `CONTRAST_ON_OFF_MARGIN` 에 **같은 값**을 쓰므로(형태가 같은 두 비율 축이 저장소 안에서
 *    갈리지 않게 — #1155 를 만든 상태가 그것이다) 두 축의 구간을 겹친다. 상한은
 *    `min(15.65%, 18.32%) = 15.65%`(774 구속), 하한은 두 축 잔존 중 큰 쪽 `4.62%`(773 M-C).
 *    그 구간에서 **유효숫자 1자리 최대값**은 `0.1` 이다 (`0.2` = `20%` 는 상한 초과).
 *    ⚠️ 실현 여유 774 `3.13×` / 773 `3.66×` 는 **사후 확인이지 선택 근거가 아니다.** 초판
 *    주석은 이를 「양쪽 여유 `≥ 3×`」라는 결정 규칙으로 적었으나 그 규칙은 **채택값을 구속하지
 *    않는다** — `3×` 로 풀면 상한이 `min(10.43, 12.21) = 10.43%` 로 좁아질 뿐 유효숫자 1자리
 *    최대값은 그대로 `0.1` 이다. 즉 「임계부터 정하고 맞췄나」에 대한 반증은 `3×` 가 아니라
 *    **계약 자신의 `2×` 규칙에 대한 답의 불변성**이다 (reviewer 라운드 2 [N2]).
 *    (773 의 `36.64%` 는 본 PR CI run 이 준 3 모집단 최소다 — 마진 확정 시점에는 로컬 최소
 *    `36.77%` 였고 그 상한 `18.38%` 도 774 의 `15.65%` 보다 느슨해 구속이 바뀌지 않는다.)
 *
 * **검출 하한 (blind band) — 이 마진이 무엇부터 잡는가.** 판정량이 **잔존** 신호이므로
 * 「`10%` 이상의 열화를 잡는다」가 아니다. 술어 `1 − 10 / baseline%` 로 무주입 baseline
 * (로컬·실 GPU `31.30%` / CI `31.31%`) 을 환산하면 **신호의 `68.05~68.06%` 이상이 소멸해야**
 * 발화한다. 그 아래 대역은
 * 본 축이 보지 못한다 (형제 축 DoD 1·2 의 커버는 별개). 실측 대조점: M-B 잔존 `0.38%`
 * = 소멸률 `98.79%` → **발화**. 미발화 쪽 대조점은 774 에 없다 — 하한을 아래에서 bracket 한
 * 실측은 773 쪽 M-C(`K=0.035`) 이고 그 근거는 `browser-verify-773-light.mjs` 에 있다.
 *
 * **재도출 트리거 — 접촉 기준** (CLAUDE.md §`deferred:no-incident` 수명주기 와 같은 관례.
 * 시간 기준을 쓰지 않는 것은 그것이 또 하나의 추정 임계가 되기 때문이다 — ADR 20260816-850
 * 결정 1 이 *"임계 자체가 추정 오차의 산물이라 고수할 실체가 없다"* 로 든 논거). 위 baseline 은
 * **측정 방법**에 종속된다. 실제 위험은 셰이더가 아니라 창·마스크 변경이다 — `#1155` 의
 * 기하 마스크 교체가 773 의 `contrastMean` 을 body 별 `+40~53%` 움직인 실측이 그 크기를
 * 박제한다(`browser-verify-773-light.mjs` 헤더 §측정 방법 D2). ⇒ `DISK_SAMPLE_RADIUS` /
 * `EDGE_RADIUS` / 기하 마스크 / `RADII` 를 **다음에 건드릴 때** 무주입 baseline 을 재측정하고
 * 본 상수의 상한·여유를 재확인한다.
 */
const COLOR_TEMP_MARGIN = 0.1;

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
 * disk 측정 — mesh 화면 bbox 안의 천체 픽셀 분석 (#756 measureDisk 답습) +
 * radial 휘도/채널비 프로파일 (#774 limb darkening / 색온도 전용 확장).
 */
async function measureSunDisk(page, bodyId, captureName) {
  const canvas = page.locator('canvas').first();
  const buf = await canvas.screenshot();
  if (CAPTURE_DIR && captureName) {
    await mkdir(CAPTURE_DIR, { recursive: true });
    await writeFile(path.join(CAPTURE_DIR, `${captureName}.png`), buf);
  }
  const b64 = buf.toString('base64');
  return page.evaluate(
    async ({ b64, bodyId, DISK_SAMPLE_RADIUS, RADII, RADIAL_ANGLES, EDGE_RADIUS }) => {
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
      const Matrix = (BABYLON && BABYLON.Matrix) || mesh.getWorldMatrix().constructor;
      const idMat = Matrix.Identity();

      // ── 회전 불변 시각 반경 (#1155 P1) ───────────────────────────────────────────────
      // 산식 SSoT = `packages/core/src/scene/camera-controller.ts` 의 `resolveMeshVisualRadius`
      // (#790): `max(boundingBox.extendSize(local) 각 축 × |scaling| 각 축)`.
      // 본 블록은 `browser-verify-756-surface.mjs` 의 같은 블록과 **의도적 복제**다 —
      // 이 코드는 `page.evaluate` 안(브라우저 컨텍스트)에서 실행되므로 Node 모듈로 뽑으면
      // 소스 문자열 주입이라는 **새 기전**이 생긴다. 형제 verify 가드(`#783`/`#1119`/`#756`)가
      // 각자 사본을 갖는 것이 이 저장소의 확립된 패턴이고, 그 SSoT 는 위 코어 함수다.
      // ⚠️ `boundingSphere.radiusWorld / √3` (#783 / #1119 선례) 를 쓰지 않는 이유 — 그 보정은
      // **회전이 identity 일 때만** 맞다 (#1146 실측: 자전 ON 시 1.3936배 과대).
      const extendSize = boundingInfo.boundingBox.extendSize;
      const scaling = mesh.scaling;
      const radiusWorld = Math.max(
        extendSize.x * Math.abs(scaling.x),
        extendSize.y * Math.abs(scaling.y),
        extendSize.z * Math.abs(scaling.z),
      );
      const center = mesh.getAbsolutePosition();
      // 카메라 right 방향 edge 점을 투영해 중심과의 거리를 잰다 — **투영 단계**는
      // procedural-planet-shader.ts `projectedDiskRadiusPx` 와 동일 (bbox 코너 투영은 cube
      // 모서리라 과대: 태양 실측 `116.00 / 98.32 = 1.1798`).
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

      // ── #756 답습: 라플라시안 고주파 (granulation 지표) ────────────────────
      // 배경 배제는 **기하** 로 한다 (#1155 P1): 투영 disk 중심에서 `DISK_SAMPLE_RADIUS × R`
      // 안쪽만 표본. 초판의 `lum < 8` 휘도 임계는 제거했다 — 배경이 임계 위(`9.08`)로 렌더돼
      // **배경을 거른 적이 없고**, 그 결과 halo 링이 유효 표본으로 들어와 DoD 2 를 눈멀게 했다
      // (헤더 §측정 방법 D1/D2). 임계 상향은 배경색이 바뀌면 재발하므로 채택하지 않는다.
      const maskRx = diskRpx * sx * DISK_SAMPLE_RADIUS;
      const maskRy = diskRpx * sy * DISK_SAMPLE_RADIUS;
      const maskCx = centerScreen.x * sx - bx; // 창 좌표계 기준 disk 중심
      const maskCy = centerScreen.y * sy - by;
      const lumGrid = new Float32Array(bw * bh);
      const mask = new Uint8Array(bw * bh);
      const lums = [];
      for (let py = 0; py < bh; py++) {
        for (let px = 0; px < bw; px++) {
          const i = py * bw + px;
          const r = data[i * 4];
          const g = data[i * 4 + 1];
          const b = data[i * 4 + 2];
          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b; // Rec.709 (DoD 2 명시)
          lumGrid[i] = lum;
          const dx = (px + 0.5 - maskCx) / maskRx;
          const dy = (py + 0.5 - maskCy) / maskRy;
          if (dx * dx + dy * dy > 1) continue; // disk 밖 (우주 배경 / glow halo / 궤도선 / UI) 배제
          mask[i] = 1;
          lums.push(lum);
        }
      }
      const n = lums.length;
      if (n === 0) return { error: 'disk 영역 천체 픽셀 0', screenBox };
      const mean = lums.reduce((a, b) => a + b, 0) / n;
      const variance = lums.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
      const stddev = Math.sqrt(variance);

      let hfSum = 0;
      let hfCount = 0;
      const hfHist = new Array(32).fill(0);
      for (let y = 1; y < bh - 1; y++) {
        for (let x = 1; x < bw - 1; x++) {
          const i = y * bw + x;
          if (!mask[i] || !mask[i - 1] || !mask[i + 1] || !mask[i - bw] || !mask[i + bw]) continue;
          const lap =
            4 * lumGrid[i] - lumGrid[i - 1] - lumGrid[i + 1] - lumGrid[i - bw] - lumGrid[i + bw];
          hfSum += lap * lap;
          hfCount++;
          hfHist[Math.min(31, Math.floor(Math.abs(lap)))]++;
        }
      }
      const hfEnergy = hfCount > 0 ? Math.sqrt(hfSum / hfCount) : 0;
      let hfEntropy = 0;
      for (const c of hfHist) {
        if (c === 0) continue;
        const p = c / hfCount;
        hfEntropy -= p * Math.log2(p);
      }

      // ── #774 radial 프로파일 (limb darkening + 색온도) ──────────────────────
      // disk 중심 = mesh 중심의 화면 투영, 반경 = 투영 disk 반경 `diskRpx` (#1155 P1).
      // 링 반경은 `RADII` 최대값이 `DISK_SAMPLE_RADIUS` 라 전 링이 마스크 안이다 →
      // 휘도 게이트 없이 **기하만으로** 표본이 disk 안임이 보장된다. 결손은 창 clamp 밖일
      // 때만 생기고 그 경우는 측정 전제 붕괴이므로 `judgeRadial` 이 fail-fast 한다 (D3).
      const cx = centerScreen.x * sx - bx;
      const cy = centerScreen.y * sy - by;
      const radial = [];
      for (const rr of RADII) {
        let sumLum = 0,
          sumR = 0,
          sumB = 0,
          cnt = 0;
        for (let a = 0; a < RADIAL_ANGLES; a++) {
          const theta = (a / RADIAL_ANGLES) * Math.PI * 2;
          const px = Math.round(cx + rr * diskRpx * sx * Math.cos(theta));
          const py = Math.round(cy + rr * diskRpx * sy * Math.sin(theta));
          if (px < 0 || py < 0 || px >= bw || py >= bh) continue;
          const i = py * bw + px;
          sumLum += lumGrid[i];
          sumR += data[i * 4];
          sumB += data[i * 4 + 2];
          cnt++;
        }
        radial.push({
          r: rr,
          lum: cnt ? Number((sumLum / cnt).toFixed(2)) : null,
          bOverR: cnt && sumR > 0 ? Number((sumB / sumR).toFixed(4)) : null,
          samples: cnt,
        });
      }

      return {
        area: n,
        // #1155 기준 6 — 배경이 실제로 제외됐다는 관측 가능한 증거 (기하 마스크 생존 신호).
        windowPx: bw * bh,
        excludedPx: bw * bh - n,
        diskRpx: Number(diskRpx.toFixed(2)),
        // #1155 기준 1 — DoD 2 의 edge 링이 실제 disk 안인지의 직접 증거.
        edgeSampleRpx: Number((EDGE_RADIUS * diskRpx).toFixed(2)),
        stddev: Number(stddev.toFixed(3)),
        hfEnergy: Number(hfEnergy.toFixed(4)),
        hfEntropy: Number(hfEntropy.toFixed(3)),
        meanLum: Number(mean.toFixed(1)),
        radial,
        screenBox,
        imgSize: { w: img.width, h: img.height },
      };
    },
    { b64, bodyId, DISK_SAMPLE_RADIUS, RADII, RADIAL_ANGLES, EDGE_RADIUS },
  );
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

/**
 * radial 프로파일 판정 — 단조 감소(허용 오차) + edge/center 비.
 *
 * #1155 P2 — **fail-fast** (§가드 설계 원칙 *"drift 가드는 fail-fast 만 — fallback 분기 절대
 * 금지"*). 구판은 `valid.find(r === 0.9) ?? valid[valid.length - 1]` 로 edge 링이 탈락하면
 * 조용히 다른 반경으로 대체했다 — 그러면 판정이 어느 반경에서 났는지가 로그에서 사라지고
 * DoD 2 의 `r ≈ 0.9R` 계약이 이름만 남는다. 이제 링 결손·edge 부재는 곧 판정 실패다.
 * 신 창에서 링 결손은 창 clamp 밖 (disk 가 뷰포트를 벗어남) 일 때만 생기며, 그것은 측정
 * 전제 자체의 붕괴라 "다른 반경으로 이어서 재기"가 정당화되지 않는다.
 */
function judgeRadial(radial) {
  const incomplete = radial.filter((s) => s.lum === null || s.samples !== RADIAL_ANGLES);
  if (incomplete.length > 0) {
    return {
      ok: false,
      reason: `링 표본 결손 (${incomplete.map((s) => `r=${s.r}:${s.samples}/${RADIAL_ANGLES}`).join(' ')}) — disk 가 뷰포트를 벗어났거나 창 산출 오류`,
    };
  }
  const edge = radial.find((s) => s.r === EDGE_RADIUS);
  if (!edge) return { ok: false, reason: `edge 링 r=${EDGE_RADIUS} 부재 (대체 금지)` };
  const center = radial[0].lum;
  // 단조 감소 (granulation 노이즈 허용 — 3 lum 이내 역전은 무시).
  let monotonicViolations = 0;
  for (let i = 1; i < radial.length; i++) {
    if (radial[i].lum > radial[i - 1].lum + 3) monotonicViolations++;
  }
  const edgeCenterRatio = edge.lum / center;
  const bOverRCenter = radial[0].bOverR;
  const bOverREdge = edge.bOverR;
  // #1159 — 채널비 결손은 fail-fast (§가드 설계 원칙 *"drift 가드는 fail-fast 만"*). 아래 상대
  // 낙차는 `bOverREdge` 가 null 이면 `1 − 0/x = 1` 로 **통과**해 버린다.
  // ⚠️ 이것은 **선재하던 구멍이지 새 식이 만든 것이 아니다** (초판 주석은 *"부호 비교 시절에는
  // 없던 구멍"* 이라 적었고 reviewer 라운드 2 [B2] 가 측정으로 반증했다). 구판 `bOverREdge <
  // bOverRCenter` 도 `null < 0.6627` 에서 `null → 0` 강제로 `true` 를 내 **똑같이 통과**시켰다.
  // 축퇴 6 케이스(edge=null/undefined/NaN, center=null/0, 양쪽 null) 전건에서 구판과 신판의
  // 판정이 일치한다 — 즉 `#774` 이래 있던 결손 구멍을 **곁들여 닫는** 것이다. (발생원: 위
  // `bOverR: cnt && sumR > 0 ? … : null` 이 `lum` 과 독립으로 null 을 낼 수 있는데, `incomplete`
  // 검사는 `lum === null || samples !== RADIAL_ANGLES` 만 봐 `sumR === 0` 경로를 덮지 않는다.)
  // 판정 축 신설이 아니라 위 `incomplete` 검사와 같은 계급의 측정 결손 처리다.
  if (typeof bOverRCenter !== 'number' || typeof bOverREdge !== 'number' || !(bOverRCenter > 0)) {
    return {
      ok: false,
      reason: `B/R 채널비 결손 (center=${bOverRCenter} edge=${bOverREdge}) — 색온도 측정 불가`,
    };
  }
  // DoD 3 신호 — 중심 대비 가장자리 B/R 의 상대 낙차. 부호가 아니라 크기를 본다 (#1159).
  const colorTempDrop = 1 - bOverREdge / bOverRCenter;
  return {
    ok: monotonicViolations === 0 && edgeCenterRatio < 0.85 && colorTempDrop >= COLOR_TEMP_MARGIN,
    monotonicViolations,
    edgeCenterRatio: Number(edgeCenterRatio.toFixed(4)),
    bOverRCenter,
    bOverREdge,
    colorTempDrop: Number((colorTempDrop * 100).toFixed(2)),
    center,
    edge: edge.lum,
  };
}

(async () => {
  const out = { sunOn: null, sunOff: null, planets: {}, consoleErrors: {} };
  // #940 — 브라우저 수명주기를 `withBrowser` 로 위임 (에러 경로 close 도달 보장).
  //   `launch()` 는 chrome 채널 부재 시 chromium 폴백이라 옵션 조립만으로 표현 불가 →
  //   launcher 주입 seam 으로 그대로 넘긴다 (launch 인자 무변경 = granulation 픽셀 측정 축 보존).
  await withBrowser(
    {},
    async (browser) => {
      console.log('\n=== DoD 1·2·3 — ?focus=sun (surface ON, 기본) ===');
      {
        const { context, page, consoleErrors } = await setupPage(
          browser,
          `?gpu=a&focus=sun&lod=auto`,
        );
        const m = await measureSunDisk(page, 'sun', 'sun-on');
        out.sunOn = m;
        out.consoleErrors['sun-on'] = consoleErrors;
        const judge = m.radial ? judgeRadial(m.radial) : { ok: false, reason: m.error };
        out.sunOn.judge = judge;
        console.log(
          `  granulation: hfEnergy=${m.hfEnergy} hfEntropy=${m.hfEntropy} area=${m.area}/${m.windowPx} (제외 ${m.excludedPx})`,
        );
        console.log(
          `  disk 기하  : diskRpx=${m.diskRpx} edge(r=${EDGE_RADIUS})=${m.edgeSampleRpx}px box=${m.screenBox?.w}x${m.screenBox?.h}@(${m.screenBox?.x},${m.screenBox?.y})`,
        );
        console.log(`  radial lum : ${m.radial?.map((s) => s.lum).join(' ')}`);
        console.log(`  radial B/R : ${m.radial?.map((s) => s.bOverR).join(' ')}`);
        console.log(
          `  limb judge : edge/center=${judge.edgeCenterRatio} (<0.85?) monoViol=${judge.monotonicViolations} B/R center=${judge.bOverRCenter} edge=${judge.bOverREdge} drop=${judge.colorTempDrop}% (≥${COLOR_TEMP_MARGIN * 100}%?) → ${judge.ok ? 'PASS' : 'FAIL'}${judge.reason ? ` (${judge.reason})` : ''}`,
        );
        if (consoleErrors.length)
          console.log(`  console errors: ${JSON.stringify(consoleErrors.slice(0, 3))}`);
        await context.close();
      }

      console.log('\n=== DoD 4 — ?focus=sun&surface=off 단색 복귀 ===');
      {
        const { context, page, consoleErrors } = await setupPage(
          browser,
          `?gpu=a&focus=sun&lod=auto&surface=off`,
        );
        const m = await measureSunDisk(page, 'sun', 'sun-off');
        out.sunOff = m;
        out.consoleErrors['sun-off'] = consoleErrors;
        console.log(
          `  hfEnergy=${m.hfEnergy} hfEntropy=${m.hfEntropy} stddev=${m.stddev} area=${m.area}/${m.windowPx} (제외 ${m.excludedPx}) diskRpx=${m.diskRpx}`,
        );
        console.log(`  radial lum : ${m.radial?.map((s) => s.lum).join(' ')}`);
        await context.close();
      }

      console.log('\n=== DoD 4 — planet 4종 무회귀 (surface ON) ===');
      for (const id of ['earth', 'mars', 'jupiter', 'moon']) {
        const { context, page, consoleErrors } = await setupPage(
          browser,
          `?gpu=a&focus=${id}&lod=auto`,
        );
        const m = await measureSunDisk(page, id, `planet-${id}`);
        out.planets[id] = {
          hfEnergy: m.hfEnergy,
          hfEntropy: m.hfEntropy,
          area: m.area,
          windowPx: m.windowPx,
          excludedPx: m.excludedPx,
          diskRpx: m.diskRpx,
          edgeSampleRpx: m.edgeSampleRpx,
          // #1155 기준 1 — 최외곽 링(`r = 0.95`) 휘도. 산출 반경이 실제 렌더된 disk 와 맞는지의
          // 관측 가능한 증거다: 이 값이 우주 배경 수준(태양 실측 `9.08`)으로 떨어져 있으면 창이
          // disk 밖으로 나갔다는 뜻이다. 판정 입력이 아니라 회귀 조사용 신호다.
          outerRingLum: m.radial?.[m.radial.length - 1]?.lum ?? null,
        };
        console.log(
          `  ${id.padEnd(8)} hfEnergy=${m.hfEnergy} hfEntropy=${m.hfEntropy} area=${m.area}/${m.windowPx} (제외 ${m.excludedPx}) diskRpx=${m.diskRpx} edge=${m.edgeSampleRpx}px outerLum=${m.radial?.[m.radial.length - 1]?.lum} err=${consoleErrors.length}`,
        );
        await context.close();
      }
    },
    { launch },
  );

  console.log('\n=== JSON ===');
  console.log(JSON.stringify(out, null, 2));

  // 종합 판정 — granulation 지표는 hf **엔트로피** (ADR §DoD 1 명시).
  // ⚠️ hfEnergy(RMS) 는 OFF 단색 disk 의 경계 antialiasing 급락 (232→0) 이 소수 픽셀에서
  // 큰 라플라시안을 만들어 오염된다 (측정 방법 검증 — CRITICAL #6.10). 엔트로피는 차분 분포의
  // 다양성이라 "대부분 0 + 경계 소수 대형" (OFF) 과 "전면 미세 변조" (ON) 를 정확히 구분.
  //
  // ⚠️ **위 오염 근거는 구 창(AABB + `lum < 8`)의 것이다** (#1155, 2026-08-25). 신 창은 기하
  // 마스크가 `0.95R` 밖을 잘라내 경계 antialiasing 링이 아예 표본에 없다 — 같은 날 로컬 실측
  // (headless chromium) 에서 OFF 는 `hfEnergy = 0` / `hfEntropy = 0` / `stddev = 0` 으로
  // 완전 평탄하다 (구 창 OFF 는 `hfEnergy 30.2694` / `hfEntropy 0.224`). 즉 **hfEnergy 축의
  // 역전 함정은 신 창에서 관측되지 않는다.** 그럼에도 판정축을 엔트로피로 **유지**하는 이유는
  // (a) 축 교체가 #1155 비목표(새 판정 축 신설·임계 변경 금지)이고 (b) ADR §DoD 1 이 명시한
  // 축이며 (c) 신 창에서도 엔트로피가 ON≫OFF 로 분리되기 때문이다 (`4.782` vs `0`).
  // 값을 지우지 않고 남기는 것은 축 선택이 어떤 근거로 정해졌는지의 기록이기 때문이다
  // (값 교체는 기록 위조 — reviewer.md §4 계급 2 「이력 기록」).
  const g1 = out.sunOn?.hfEntropy > (out.sunOff?.hfEntropy ?? 0); // granulation ON > OFF
  const g2 = out.sunOn?.judge?.ok === true;
  const pass = g1 && g2;
  console.log(
    `\n=== 판정: granulation 엔트로피 ON>OFF=${g1} / limb+색온도=${g2} → ${pass ? 'PASS' : 'FAIL'} ===`,
  );
  process.exit(pass ? 0 : 1);
})();
