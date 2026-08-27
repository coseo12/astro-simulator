#!/usr/bin/env node
/**
 * #1119 — 지구 대륙 마스크 동적 검증 (ADR `20260628-756` Amendment 4 §A4.5 DoD 1·2·14).
 *
 * **무엇을 재는가**: 화면에 그려진 지구 disk 의 각 픽셀을 **구면 역투영**해 위경도를 복원하고,
 * 그 지점의 커밋된 마스크 값과 **화면 픽셀의 육지/바다 분류**를 비교해 **IoU** 를 낸다.
 * 즉 "대륙이 실제와 같은 자리에 있는가" 를 사람 눈이 아니라 **픽셀 집합 연산**으로 판정한다.
 *
 * ⚠️ **이 스크립트가 유일하게 잡는 결함이 있다** — Phase 0 이 실측한 `invertY` 함정이다.
 * `new Texture(url, scene)` 로 인자를 생략하면 v 축이 뒤집히는데, **뒤집힌 채로 WebGPU/WebGL2 두
 * 백엔드가 사이좋게 일치한다.** cross-backend 일치만 보는 판정도, §결정 3-a 의 14점 단위 테스트
 * (위도 반전 잔존율 42.9%) 도 이를 통과시킨다. **DoD 1 임계 `0.80` 을 낮추지 말 것** — 낮추는
 * 순간 이 축의 유일한 방어가 사라진다.
 *
 * 결정적 프레임 레시피는 `browser-verify-783-earth-detail.mjs` 를 그대로 재사용한다:
 *   1. `?focus=earth&rotate=off&orbits=off` — identity rotation → local 축 = world 축 = 화면 축
 *      (tilt 오염 제거). `rotate=off` 면 `axialTilt` 도 적용되지 않는다 (#782 계약).
 *   2. 정착 후 `jumpToJulianDate(T_JD)` + `pause` 동기 연속 호출.
 *   3. `beta = π/2` 적도면 시점 — 화면 세로축이 극축과 정렬.
 *
 * 모드:
 *   node browser-verify-1119-earth-mask.mjs            # DoD 1 (IoU) + DoD 2 (negative)
 *   MODE=lod node browser-verify-1119-earth-mask.mjs   # DoD 14 (원거리 축소 uMaskEnabled 0 전환)
 *   MODE=seam node browser-verify-1119-earth-mask.mjs  # 자오선 u=0/1 경계 (Phase 0 잔여 미측정 2)
 *
 * 환경:
 *   HEADFUL=0     headless chromium (CI). 기본은 실 Chrome GUI.
 *   SWIFTSHADER=1 headless + --use-angle=swiftshader (CI WebGL2 재현)
 *   BASE_URL      기본 http://localhost:3000
 *   CAPTURE_DIR   지정 시 판정 프레임 PNG 저장
 */

import { chromium } from 'playwright';
import { withBrowser } from '../../../scripts/browser-verify-utils.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const CAPTURE_DIR = process.env.CAPTURE_DIR ?? null;
const HEADFUL = process.env.HEADFUL !== '0';
const SWIFTSHADER = process.env.SWIFTSHADER === '1';
const MODE = process.env.MODE ?? 'dod';

/** 결정적 프레임 고정 JD — 783 과 동일 (춘분 근방, 태양 ⊥ 극축이라 남북 양쪽에 낮면). */
const T_JD = 2451626.0;

/** §A4.5 DoD 1 — 화면 ↔ 마스크 IoU 하한. **낮추지 말 것** (모듈 헤더 참조). */
const IOU_THRESHOLD = 0.8;

/**
 * §A4.5 DoD 1 — `?surface=off` 경로 대비 **IoU 낙차 하한** (절대 마진, #1163).
 *
 * ⚠️ **이 이슈는 처분이 한 번 뒤집혔다.** 초판(#1163 이슈 본문 + 커밋 `aed9ded`·`8e52388` 의
 * 주석)은 *"여기서는 마진이 불필요하다"* 로 결론냈고 **그 결론이 반증됐다**. 초판 주석을
 * 근거로 이 상수를 되돌리지 말 것 — 반증 이력은 PR #1164 라운드 2 [B4] 와 #1163 재조정
 * 코멘트에 있다.
 *
 * **왜 필요한가.** 초판 전제는 *"`on.iou > surfaceOff.iou` 가 잡는 것은 동률(차이 0)뿐"* 이었다.
 * 전제는 참이나 결론이 거꾸로다 — **동률에서만 발화한다는 것이 곧 결함**이다. 마진은 발화
 * 조건을 `갭 ≤ 0` 에서 `갭 ≤ M` 으로 **확장**한다. 유출 주입 실측에서 `uMaskEnabled` blend
 * `0.6` 이 `surfaceOff.iou = 0.9347` 을 냈고 (갭 `0.0013` = **`99.86%` 소멸**) **마진 없는 부호
 * 비교는 그것을 통과시켰다** (`0.9360 > 0.9347`). `#1159` 가 773·774 에서 잡아낸 blindness 가
 * 이 축에서도 재현된다.
 *
 * **왜 절대(차) 마진인가.** ⚠️ **초판 근거는 `#1159` 를 거꾸로 인용했다 — 철회한다.** 초판은
 * `#1159` 의 곱셈 근거를 *"판정량이 스케일 종속 비율량이라 정규화가 필요하다"* 로 적고
 * *"`iou` 는 무차원이니 해당 없다"* 로 반박했으나, 원문은 정반대다:
 * `browser-verify-773-light.mjs:122-124` 는 *"`contrastMean` 자체가 `day.mean / night.mean` 인
 * **무차원 비율**이라 가산 마진은 body 마다 (`earth 4.25` ~ `mars 7.61`) 뜻이 달라진다"* 라고
 * 적는다 (축자 인용 — `**` 강조는 이 주석이 붙인 것이고 원문에는 없다. 리뷰 [N18]). **무차원이라는 것이 곱셈을 택한 이유**이지 배제 사유가 아니다.
 *
 * `#1159` 에서 정규화가 교정한 것은 **기준 크기의 변동**이다 — `773` 은 판정 모집단이
 * `SURFACE_BODIES` **4 body**(`:200`)인데 기준 크기가 body 마다 `4.25`~`7.61` 로 갈리고,
 * `774` 는 기준 `B/R` 이 base 발광색(`#FFE9A8`)·노출이라는 **자유 파라미터**의 함수다
 * (`browser-verify-774-sun.mjs:107-109`). 여기엔 그 변동이 **둘 다 없다** — 모집단이
 * `?focus=earth` **단일 body** 이고 `T_JD`·화면 기하까지 고정이며(`FOCUS_QUERY`), 기준 크기
 * `on.iou` 는 자유 파라미터가 아니라 **측정된 상수**다 (무주입 `4`회 sd `0` = `0.9360`, CI 교차
 * `0.936`). 더해 상한이 `IOU_THRESHOLD` 와 `maskLandPct` 라는 **같은 `[0,1]` 척도 위 두 절대
 * 수준의 차**로 직접 나온다 (아래).
 *
 * ⚠️ **「변동이 없다」는 두 축(모집단·자유 파라미터)에 대한 진술이지 무변동 선언이 아니다**
 * (리뷰 라운드 4 [N16]). 아래 상한 도출은 기준을 **최악 `on.iou = 0.8`** 으로 잡으므로, 기준은
 * 실제로 `[0.8, 0.9360]` 유계 변동을 갖는다 — 상수라면 상한이 `0.9360 − 0.5062 = 0.4298` 이어야
 * 한다. **기준값 비**로 재면 `0.9360 / 0.8 = 1.170×` 이고, `773` 의 body 간 기준 spread
 * `7.61 / 4.25 = 1.791×` 와 **같은 종류의 양**이다 — 즉 **범주 차가 아니라 정도 차**다
 * (⚠️ 상대 마진으로 환산하면 `78.63% → 75.00%`, `3.63pp` 다. 이 두 수의 비 `1.048×` 는
 *  기준값 비 `1.170×` 와 **다른 양**이니 섞어 읽지 말 것). 채택 근거는 「무변동」이 아니라 **정규화가 교정하는 두 축의
 * 부재**이고, 잔여 유계 변동은 상한 도출이 최악 대입으로 이미 흡수한다.
 * ⚠️ 이것을 **곱셈 우위 근거로 읽지 말 것** — 곱셈 상한도 같은 지점에서 최악을 잡는다
 * (`1 − 0.5062 / 0.8 = 36.73%`).
 *
 * ⚠️ 곱셈이 **산술적으로 불가능한 것은 아니다** — 아래 두 경계를 상대 형태로 옮기면
 * `M > 13.28%` / `M < 36.73%` 로 해가 존재한다. 채택 근거는 「곱셈이 불가」가 아니라
 * **정규화가 교정할 변동이 없다**는 것이다.
 *
 * ⚠️ **`HF_ENTROPY_MARGIN` 을 형태 선례로 인용하지 말 것** (초판이 그렇게 썼고 철회한다).
 * `774:111` 이 그 선례에 **자기 적격 조건**을 이미 달아 뒀다 — *"그쪽 판정량 엔트로피는
 * 비율량이 아니다"*. `iou = inter / union` 은 비율량이므로 **그 조건이 이 케이스를 배제한다.**
 *
 * ⚠️ **`IOU_THRESHOLD` 의 존재도 `#1159` 와의 대비점이 아니다** — `773` 역시 형제 축
 * `DAY_NIGHT_RATIO_MIN` 이 `on.day.mean > on.night.mean × 2`(`:584`)로 **같은 판정량에 절대
 * 하한 `2`** 를 걸고 있으면서 곱셈을 썼다. 여기서 `IOU_THRESHOLD` 가 하는 일은 대비가 아니라
 * **상한 산출의 입력**이다.
 *
 * **산출 (measurement-first — 임계부터 정하고 맞춘 값이 아니다).** 무주입 baseline
 * (2026-08-26, 로컬 `SWIFTSHADER=1` headless + `next dev :3001`, `4`회 전건 sd `0`):
 * `on.iou 0.9360` / `forcedOff.iou 0.3122` / `surfaceOff.iou 0.0000` / `maskLandPct 50.62`.
 * CI (ubuntu swiftshader, `shader-pixel-guard` run `32960373263`) 교차 확인 — `on 0.936` /
 * `surfaceOff 0` / **`maskLandPct 50.62` 일치** / `forcedOff 0.3123` (`1e-4` 차). 아래 상한의
 * 입력인 `maskLandPct` 는 마스크 PNG + 고정 기하의 함수라 **GPU 비의존**이다.
 *
 *  - **하한 (판별력) `> 0.1243`** — 잡아야 할 부분 유출의 **잔존 갭**. 유출 주입 실측에서
 *    `uMaskEnabled` 를 `0.5` 로 blend 한 유출 프레임이 `surfaceOff.iou = 0.8117` 을 냈다
 *    (갭 `0.1243`). 마진이 이보다 커야 그 유출이 발화한다. 술어: blend `0.5` 프레임을 낸 실행
 *    **전수 `5`회** (스윕 `3`회 + base·head 유출 프로브 각 `1`회) 에서 `0.8117` 전건 동일.
 *  - **상한 (무오발) `< 0.2938`** — **구조 상한**이다. ⚠️ **「무주입 정상 동작 시」 한정이다.**
 *    주입 하에서는 성립하지 않으며 (바로 위 하한 축의 `0.8117`, 서두의 `0.9347` 이 그 반례다)
 *    **정상 동작을 벗어나게 만드는 것이 곧 이 마진이 잡는 회귀**다. 정상 경로에서
 *    `?surface=off` 는 단색 disk 라 화면 분류(`b < g`)가 **단일 색의 함수**여서 균일하고,
 *    따라서 `surfaceOff.iou ≤ maskLandPct` 다. `≤` 로 적는 이유는 균일성이 **구조 추론**이기
 *    때문이다 — 양자화가 균일성을 부분적으로 깨도 그 편차는 마스크와 무상관한 잡음이라
 *    두 극단(`0` / `maskLandPct`) 근방을 벗어나지 않으므로, 최악을 큰 쪽으로 잡으면 안전하다.
 *    현행 earth `colorHint #3B7AB5` (B `181` > G `122`) 는 `b < g` 가 거짓이라 실측이 `0.0000`
 *    이지만, `colorHint` 는 **데이터**라 반대 분기(`0.5062`)로 바뀔 수 있어 **그쪽을 최악으로
 *    쓴다**. 그리고 이 마진이 게이트를 가르는 것은 `on.iou >= IOU_THRESHOLD` 가 참일 때뿐이라
 *    최악은 `on.iou = 0.8` ⇒ `M < 0.8 − 0.5062 = 0.2938`.
 *  - `#1159` 관례의 「무주입 최소 신호 ÷ 2」 축은 `0.9360 / 2 = 0.4680` 으로 **비구속**이다
 *    (구조 상한이 더 좁다). 두 상한 중 좁은 쪽을 쓴다.
 *  - 겹친 구간 `[0.1243, 0.2938]` 의 **유효숫자 1자리 최대값 `0.2` 가 유일 해**다 (`0.3` 은 상한
 *    초과). 실현 여유는 **사후 확인이지 선택 근거가 아니다** — 구조 상한 대비 `1.47×` /
 *    무주입 갭 대비 `4.68×` / 판별력 하한 대비 `1.61×`.
 *
 * **검출 하한 (blind band) — 「`20%` 열화를 잡는다」가 아니다.** 발화에는 무주입 갭의
 * `0.2 / 0.9360 = 21.37%` **이하만 남는** 소멸, 즉 소멸률 `> 78.63%` 가 필요하다. 실측 유출 두
 * 점이 이 선을 위아래로 bracket 한다 — blend `0.5` (`0.8117`) ⇒ 소멸률 `86.72%` **발화** /
 * blend `0.45` (`0.5035`) ⇒ `53.79%` **미발화**. 그 아래 대역은 이 축이 보지 못한다.
 *
 * **재도출 트리거 (시간이 아니라 접촉).** `IOU_THRESHOLD` / `MASK_LAND_LEVEL` /
 * `DISK_SAMPLE_RADIUS` / 화면 분류 술어(`b < g`) / earth `colorHint` 중 하나를 다음에 건드릴 때
 * 무주입 baseline 과 위 두 경계를 재측정할 것 — 상한은 `colorHint` 와 `IOU_THRESHOLD` 의
 * 함수이지 상수가 아니다.
 */
const SURFACE_OFF_IOU_MARGIN = 0.2;

/** 마스크 육지 판정 임계 (0~1 정규화 — 계조 128 과 동일). */
const MASK_LAND_LEVEL = 0.5;

/**
 * IoU 측정 대상 disk 반경 비율 상한. limb (r → 1) 은 원근 왜곡 + 접선 방향 texel 압축으로
 * 역투영 오차가 급증하므로 제외한다 (§A4.5 DoD 1 임계 근거 (iii)).
 */
const DISK_SAMPLE_RADIUS = 0.85;

/**
 * 극관 제외 위도 (|sin lat|). `ICE_LAT_LO = 0.84` 아래로 여유를 둔 값 — 극관은 육지/바다를
 * 가리지 않고 흰색으로 덮으므로 **양쪽 집합에서 동시에** 빼야 IoU 가 정의된다.
 *
 * ⚠️ **`DISK_SAMPLE_RADIUS = 0.85` 에서는 실제로 한 픽셀도 걸리지 않는다** (실측 `excludedPolar: 0`).
 * 원근 투영이 disk 가장자리를 바깥으로 확대하기 때문이다 — 1280×720 · focus=earth 실측에서 disk
 * 비율 `0.85` 는 `|sin lat| = 0.7898` 에 대응한다 (직교 근사라면 `0.85`). 즉 극관 밴드는 이미
 * 표본 밖이며, 본 상수는 `DISK_SAMPLE_RADIUS` 를 올릴 때를 위한 **보험**이다. 출력의
 * `excludedPolar` 를 그대로 노출해 이 사실이 숨지 않게 한다 (0 이 정상이라는 것도 측정 결과다).
 */
const POLAR_EXCLUDE_SIN_LAT = 0.8;

/** 낮면 판정 하한 (`dot(n, sunDir)`) — terminator 부근은 색이 눌려 분류가 흔들린다. */
const DAY_SIDE_MIN_NDL = 0.15;

/** §A4.5 DoD 14 — 원거리 축소 판정 임계 (셰이더 `SURFACE_MASK_MIN_DISK_PX` 와 동일 값). */
const MASK_MIN_DISK_PX = 16;

async function launch() {
  if (SWIFTSHADER) {
    console.log('[browser] headless chromium + --use-angle=swiftshader (CI 재현 — #759)');
    return chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });
  }
  const opts = HEADFUL ? { headless: false, channel: 'chrome' } : { headless: true };
  try {
    const browser = await chromium.launch(opts);
    console.log(`[browser] ${HEADFUL ? '실 Chrome GUI' : 'headless chromium'}`);
    return browser;
  } catch (e) {
    console.error(`[launch] chrome channel 부재 (${e.message}) — chromium 폴백`);
    return chromium.launch({ headless: !HEADFUL });
  }
}

async function setupPage(browser, query, { equatorialView = true, julianDate = T_JD } = {}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE_URL}${query}`, { waitUntil: 'networkidle', timeout: 45_000 });
  await page.waitForFunction(
    () => typeof window.__simCore !== 'undefined' && typeof window.__solarScene !== 'undefined',
    { timeout: 20_000 },
  );
  await page.waitForTimeout(2800); // mesh 생성 + focus tween + LOD 정착
  await page.evaluate((jd) => {
    window.__simCore.command({ type: 'jumpToJulianDate', julianDate: jd });
    window.__simCore.command({ type: 'pause' });
  }, julianDate);
  await page.waitForTimeout(1000);
  if (equatorialView) {
    await page.evaluate(() => {
      window.__simCore.scene.activeCamera.beta = Math.PI / 2;
    });
    await page.waitForTimeout(600);
  }
  return { context, page, consoleErrors };
}

/**
 * 지구 머티리얼(high + LOD variant) 전부에 `uMaskEnabled = 0` 을 **매 프레임 덮어쓰는** observer 를
 * 추가한다 (§A4.5 DoD 2 negative injection).
 *
 * Babylon 은 `bind()` 에서 uniform 을 먼저 올린 뒤 `onBindObservable` 을 알린다. 즉 우리 observer 가
 * 머티리얼 자신의 observer **뒤에** 등록되면 다음 프레임 업로드 값이 항상 `0` 이 된다 —
 * **프로덕션 코드 0 줄로** "마스크가 0 으로 고착된 상태" 를 재현한다.
 */
async function injectMaskDisabled(page) {
  return page.evaluate(() => {
    const earth = window.__solarScene?.meshes?.get('earth');
    if (!earth) return { patched: 0, error: 'earth mesh 부재' };
    const meshes = [earth, ...earth.getChildMeshes()];
    let patched = 0;
    for (const mesh of meshes) {
      const mat = mesh.material;
      if (mat && typeof mat.setFloat === 'function' && mat.onBindObservable) {
        mat.onBindObservable.add(() => mat.setFloat('uMaskEnabled', 0));
        patched += 1;
      }
    }
    return { patched };
  });
}

/**
 * 화면 disk 역투영 ↔ 마스크 IoU 측정.
 *
 * 역투영: 카메라 basis + 수직 FOV 로 픽셀별 world ray 를 만들고 구와 교차시켜 표면 법선을 얻는다
 * (직교 근사가 아니라 실제 원근 ray — limb 왜곡의 주 성분을 제거한다). `rotate=off` 이므로
 * local 축 = world 축이라 그 법선이 곧 셰이더의 `p` 다.
 */
async function measureIoU(page, screenshotB64) {
  return page.evaluate(
    async ({
      b64,
      MASK_LAND_LEVEL,
      DISK_SAMPLE_RADIUS,
      POLAR_EXCLUDE_SIN_LAT,
      DAY_SIDE_MIN_NDL,
    }) => {
      const scene = window.__simCore?.scene;
      const mesh = window.__solarScene?.meshes?.get('earth');
      if (!scene || !mesh) return { error: 'earth mesh/scene 부재' };
      const engine = scene.getEngine();
      const rw = engine.getRenderWidth();
      const rh = engine.getRenderHeight();
      const camera = scene.activeCamera;
      const Vector3 = mesh.getAbsolutePosition().constructor;

      // 카메라 basis (world). Babylon local Z = forward.
      const forward = camera.getDirection(new Vector3(0, 0, 1));
      const right = camera.getDirection(new Vector3(1, 0, 0));
      const up = camera.getDirection(new Vector3(0, 1, 0));
      const camPos = camera.globalPosition ?? camera.position;
      const center = mesh.getAbsolutePosition();
      const radiusWorld = mesh.getBoundingInfo().boundingSphere.radiusWorld / Math.sqrt(3);

      // 태양 방향 (낮면 판정).
      let sunPos = null;
      for (const l of scene.lights) {
        if (l.position && (l.name === 'sun-light' || l.getClassName?.() === 'PointLight')) {
          sunPos = l.position;
          break;
        }
      }
      if (!sunPos) return { error: 'sunLight 부재' };
      const sunDir = sunPos.subtract(center).normalize();

      // 화면 disk 반경 (px) — 셰이더 LOD 판정과 **같은 산식** (camera right edge 투영).
      const idMat = mesh.getWorldMatrix().constructor.Identity();
      const transform = scene.getTransformMatrix();
      const vp = camera.viewport.toGlobal(rw, rh);
      const centerScreen = Vector3.Project(center, idMat, transform, vp);
      const edgeScreen = Vector3.Project(
        center.add(right.scale(radiusWorld)),
        idMat,
        transform,
        vp,
      );
      const diskR = Math.hypot(edgeScreen.x - centerScreen.x, edgeScreen.y - centerScreen.y);

      // ── 마스크 원본 로드 (실제 서빙 경로 — 에셋이 배포되는지도 함께 검증된다) ──
      const maskRes = await fetch('/textures/earth-land-mask.png');
      if (!maskRes.ok) return { error: `마스크 fetch 실패 HTTP ${maskRes.status}` };
      const maskBitmap = await createImageBitmap(await maskRes.blob());
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = maskBitmap.width;
      maskCanvas.height = maskBitmap.height;
      const maskCtx = maskCanvas.getContext('2d');
      maskCtx.drawImage(maskBitmap, 0, 0);
      const maskData = maskCtx.getImageData(0, 0, maskBitmap.width, maskBitmap.height).data;
      const MW = maskBitmap.width;
      const MH = maskBitmap.height;
      const maskTexel = (x, y) => {
        const wx = ((x % MW) + MW) % MW;
        const wy = Math.min(MH - 1, Math.max(0, y));
        return maskData[(wy * MW + wx) * 4] / 255;
      };
      // GPU 와 동일한 BILINEAR (픽셀 중심 · u WRAP · v CLAMP).
      const maskSample = (u, v) => {
        const fx = u * MW - 0.5;
        const fy = v * MH - 0.5;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const tx = fx - x0;
        const ty = fy - y0;
        const top = maskTexel(x0, y0) * (1 - tx) + maskTexel(x0 + 1, y0) * tx;
        const bot = maskTexel(x0, y0 + 1) * (1 - tx) + maskTexel(x0 + 1, y0 + 1) * tx;
        return top * (1 - ty) + bot * ty;
      };

      // ── 화면 스크린샷 디코드 (WebGPU drawImage readback 함정 회피 — #728 SSoT) ──
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
      const shot = ctx.getImageData(0, 0, img.width, img.height).data;

      const tanHalfFov = Math.tan(camera.fov / 2);
      const aspect = rw / rh;

      let inter = 0;
      let union = 0;
      let screenLand = 0;
      let maskLand = 0;
      let domain = 0;
      let excludedPolar = 0;
      let excludedNight = 0;

      const cxShot = centerScreen.x * sx;
      const cyShot = centerScreen.y * sy;
      const rShot = diskR * Math.max(sx, sy);
      const span = Math.ceil(rShot) + 2;

      for (
        let y = Math.max(0, Math.floor(cyShot - span));
        y < Math.min(img.height, cyShot + span);
        y++
      ) {
        for (
          let x = Math.max(0, Math.floor(cxShot - span));
          x < Math.min(img.width, cxShot + span);
          x++
        ) {
          const dx = (x - cxShot) / rShot;
          const dy = (y - cyShot) / rShot;
          if (dx * dx + dy * dy > DISK_SAMPLE_RADIUS * DISK_SAMPLE_RADIUS) continue;

          // 픽셀 → world ray (원근). NDC 는 렌더 해상도 기준이라 shot 좌표를 되돌린다.
          const px = x / sx;
          const py = y / sy;
          const ndcX = ((2 * px) / rw - 1) * aspect * tanHalfFov;
          const ndcY = (1 - (2 * py) / rh) * tanHalfFov;
          const dirX = forward.x + right.x * ndcX + up.x * ndcY;
          const dirY = forward.y + right.y * ndcX + up.y * ndcY;
          const dirZ = forward.z + right.z * ndcX + up.z * ndcY;
          const dlen = Math.hypot(dirX, dirY, dirZ);
          const rx = dirX / dlen;
          const ry = dirY / dlen;
          const rz = dirZ / dlen;

          // ray-sphere 교차 (근측 해).
          const ocx = camPos.x - center.x;
          const ocy = camPos.y - center.y;
          const ocz = camPos.z - center.z;
          const bq = rx * ocx + ry * ocy + rz * ocz;
          const cq = ocx * ocx + ocy * ocy + ocz * ocz - radiusWorld * radiusWorld;
          const disc = bq * bq - cq;
          if (disc <= 0) continue;
          const t = -bq - Math.sqrt(disc);
          if (t <= 0) continue;
          const nx = (ocx + t * rx) / radiusWorld;
          const ny = (ocy + t * ry) / radiusWorld;
          const nz = (ocz + t * rz) / radiusWorld;

          // 극관 제외 — 흰색이 육지/바다를 동시에 덮으므로 양쪽 집합에서 함께 뺀다.
          if (Math.abs(ny) >= POLAR_EXCLUDE_SIN_LAT) {
            excludedPolar++;
            continue;
          }
          // 밤면·terminator 제외.
          const ndl = nx * sunDir.x + ny * sunDir.y + nz * sunDir.z;
          if (ndl < DAY_SIDE_MIN_NDL) {
            excludedNight++;
            continue;
          }

          // 셰이더와 동일한 equirectangular UV (§A4.3 결정 3).
          const u = Math.atan2(nz, nx) / (2 * Math.PI) + 0.5;
          const v = Math.acos(Math.min(1, Math.max(-1, ny))) / Math.PI;
          const isMaskLand = maskSample(u, v) >= MASK_LAND_LEVEL;

          const i = (y * img.width + x) * 4;
          const r = shot[i];
          const g = shot[i + 1];
          const b = shot[i + 2];
          // 화면 분류 — ocean(baseColor) 은 청록(B ≥ G), land(biome 3밴드) 는 B < G.
          const isScreenLand = b < g;

          domain++;
          if (isScreenLand) screenLand++;
          if (isMaskLand) maskLand++;
          if (isScreenLand && isMaskLand) inter++;
          if (isScreenLand || isMaskLand) union++;
        }
      }

      // sub-solar 경도 — 낮면(=측정 가능 영역)이 어느 경도대를 덮는지 드러낸다.
      // `rotate=off` 라 지구 local frame 이 고정이므로 이 값은 **카메라가 아니라 JD 가** 정한다.
      const subSolarLonDeg = (Math.atan2(sunDir.z, sunDir.x) * 180) / Math.PI;

      return {
        diskR: Number(diskR.toFixed(2)),
        subSolarLonDeg: Number(subSolarLonDeg.toFixed(1)),
        domain,
        screenLandPct: domain ? Number(((screenLand / domain) * 100).toFixed(2)) : null,
        maskLandPct: domain ? Number(((maskLand / domain) * 100).toFixed(2)) : null,
        excludedPolar,
        excludedNight,
        iou: union ? Number((inter / union).toFixed(4)) : 0,
      };
    },
    {
      b64: screenshotB64,
      MASK_LAND_LEVEL,
      DISK_SAMPLE_RADIUS,
      POLAR_EXCLUDE_SIN_LAT,
      DAY_SIDE_MIN_NDL,
    },
  );
}

async function capture(page, name) {
  const buf = await page.locator('canvas').first().screenshot();
  if (CAPTURE_DIR) {
    await mkdir(CAPTURE_DIR, { recursive: true });
    await writeFile(path.join(CAPTURE_DIR, `${name}.png`), buf);
  }
  return buf.toString('base64');
}

/** 현재 카메라에서의 지구 disk 투영 반경 (px) — 셰이더 LOD 판정과 동일 산식. */
async function readDiskRadiusPx(page) {
  return page.evaluate(() => {
    const scene = window.__simCore?.scene;
    const mesh = window.__solarScene?.meshes?.get('earth');
    if (!scene || !mesh) return null;
    const engine = scene.getEngine();
    const camera = scene.activeCamera;
    const Vector3 = mesh.getAbsolutePosition().constructor;
    const idMat = mesh.getWorldMatrix().constructor.Identity();
    const transform = scene.getTransformMatrix();
    const vp = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
    const center = mesh.getAbsolutePosition();
    const radiusWorld = mesh.getBoundingInfo().boundingSphere.radiusWorld / Math.sqrt(3);
    const right = camera.getDirection(new Vector3(1, 0, 0));
    const c = Vector3.Project(center, idMat, transform, vp);
    const e = Vector3.Project(center.add(right.scale(radiusWorld)), idMat, transform, vp);
    return Number(Math.hypot(e.x - c.x, e.y - c.y).toFixed(3));
  });
}

/** 두 base64 PNG 의 픽셀 diff 비율 (±2/255 노이즈 허용 — 783 diffDirs 규약 동일). */
async function diffRatio(page, b64A, b64B) {
  return page.evaluate(
    async ({ a, b }) => {
      const load = async (src) => {
        const img = new Image();
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = rej;
          img.src = `data:image/png;base64,${src}`;
        });
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        return c.getContext('2d').getImageData(0, 0, img.width, img.height).data;
      };
      const da = await load(a);
      const db = await load(b);
      if (da.length !== db.length) return { error: '크기 불일치' };
      let diff = 0;
      for (let i = 0; i < da.length; i += 4) {
        const d = Math.max(
          Math.abs(da[i] - db[i]),
          Math.abs(da[i + 1] - db[i + 1]),
          Math.abs(da[i + 2] - db[i + 2]),
        );
        if (d > 2) diff++;
      }
      const total = da.length / 4;
      return { diffPx: diff, total, pct: Number(((diff / total) * 100).toFixed(4)) };
    },
    { a: b64A, b: b64B },
  );
}

const FOCUS_QUERY = '?gpu=a&focus=earth&lod=auto&rotate=off&orbits=off';

/**
 * 자오선 seam 측정용 두 번째 JD — 춘분 반대편(추분 근방, 2000-09-22).
 *
 * ⚠️ **카메라를 돌려서는 `u = 0/1` 에 도달할 수 없다.** `rotate=off` 면 지구 local frame 이 world
 * 에 고정돼 **낮면 반구가 JD 로만 정해지고** 카메라는 그 반구의 어느 부분을 보는지만 바꾼다.
 * `T_JD` 에서 sub-solar 경도가 `≈ 0°` (본초자오선) 라 낮면은 `[−90°, +90°]` 이고 **±180° 자오선은
 * 구조적으로 밤면**이다 — 첫 구현이 카메라만 4방위 돌렸다가 `alpha+270°` 에서 낮면 픽셀 `0` 을
 * 얻고 IoU 를 `0` 으로 오판했다. 반년 뒤 JD 는 sub-solar 를 반대편으로 옮겨 **자오선을 낮면
 * 한가운데**에 놓는다.
 */
const T_JD_ANTIMERIDIAN = 2451809.5;

/** seam 판정에 필요한 최소 낮면 표본 (이보다 작으면 "측정 불가" — IoU 를 판정에 쓰지 않는다). */
const SEAM_MIN_DOMAIN = 2000;

/**
 * MODE=seam — **자오선(`u = 0/1`) 경계**를 낮면에 놓고 IoU 를 잰다.
 *
 * Phase 0 게이트는 기본 focus 가시 반구 9점만 덮어 `u = 0/1` 을 **미측정으로 남겼다**
 * (이슈 #1119 게이트 코멘트 §잔여 미측정 2). 두 JD × 카메라 4방위를 전수로 재고, **JD 마다 낮면
 * 표본이 가장 큰 방위**를 판정에 쓴다. `atan` 불연속에서 seam 이 생기면 자오선이 중앙에 오는
 * JD 의 IoU 만 무너지므로 **대조가 측정 자체에 내장**돼 있다.
 */
async function runSeam(browser) {
  const offsets = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
  const groups = [];
  for (const [label, julianDate] of [
    ['본초자오선 낮면 (JD 2451626.0)', T_JD],
    ['±180° 자오선 낮면 (JD 2451809.5)', T_JD_ANTIMERIDIAN],
  ]) {
    const rows = [];
    for (const offset of offsets) {
      const { context, page, consoleErrors } = await setupPage(browser, FOCUS_QUERY, {
        julianDate,
      });
      await page.evaluate((d) => {
        window.__simCore.scene.activeCamera.alpha += d;
      }, offset);
      await page.waitForTimeout(700);
      const deg = Math.round((offset * 180) / Math.PI);
      const shot = await capture(page, `qa-1119-seam-jd${Math.round(julianDate)}-alpha${deg}`);
      const m = await measureIoU(page, shot);
      rows.push({ alphaOffsetDeg: deg, ...m, consoleErrors: consoleErrors.length });
      await context.close();
    }
    const best = rows.reduce((a, b) => (a.domain >= b.domain ? a : b));
    groups.push({ label, julianDate, rows, best });
  }

  console.log('\n=== 측정 (자오선 u=0/1 경계 — JD 2종 × 카메라 4방위) ===');
  console.log(JSON.stringify(groups, null, 2));

  console.log('\n=== 판정 ===');
  let pass = true;
  for (const g of groups) {
    const ok =
      !g.best.error &&
      g.best.domain >= SEAM_MIN_DOMAIN &&
      g.best.iou >= IOU_THRESHOLD &&
      g.best.consoleErrors === 0;
    if (!ok) pass = false;
    console.log(
      `${g.label}: sub-solar 경도 ${g.best.subSolarLonDeg}° · 낮면 표본 ${g.best.domain} (≥ ${SEAM_MIN_DOMAIN}) · IoU ${g.best.iou} (≥ ${IOU_THRESHOLD}) · alpha+${g.best.alphaOffsetDeg}° → ${ok ? 'PASS' : 'FAIL'}`,
    );
  }
  if (!pass) process.exitCode = 1;
}

async function runDod(browser) {
  const results = {};

  // ── ① 마스크 ON (정상 경로) ──────────────────────────────────────────────
  {
    const { context, page, consoleErrors } = await setupPage(browser, FOCUS_QUERY);
    const shot = await capture(page, 'qa-1119-earth-mask-on');
    results.on = await measureIoU(page, shot);
    results.on.consoleErrors = consoleErrors.length;
    await context.close();
  }

  // ── ② uMaskEnabled 0 고착 주입 (negative — DoD 2) ────────────────────────
  {
    const { context, page, consoleErrors } = await setupPage(browser, FOCUS_QUERY);
    const injected = await injectMaskDisabled(page);
    await page.waitForTimeout(800); // observer 가 다음 bind 부터 유효 — 프레임 몇 개 대기
    const shot = await capture(page, 'qa-1119-earth-mask-forced-off');
    results.forcedOff = await measureIoU(page, shot);
    results.forcedOff.consoleErrors = consoleErrors.length;
    results.forcedOff.patchedMaterials = injected.patched;
    await context.close();
  }

  // ── ③ `?surface=off` (셰이더 자체 미생성 — 단색 StandardMaterial) ─────────
  {
    const { context, page, consoleErrors } = await setupPage(browser, `${FOCUS_QUERY}&surface=off`);
    const shot = await capture(page, 'qa-1119-earth-surface-off');
    results.surfaceOff = await measureIoU(page, shot);
    results.surfaceOff.consoleErrors = consoleErrors.length;
    await context.close();
  }

  console.log('\n=== 측정 ===');
  console.log(JSON.stringify(results, null, 2));

  const on = results.on;
  const forcedOff = results.forcedOff;
  const surfaceOff = results.surfaceOff;

  // DoD 1 — IoU 하한 + 마스크 미적용 두 경로 대비 낙차.
  //
  // ⚠️ 구 주석은 이것을 「유의 증가」라고 적었으나 그 성질을 집행하는 코드가 **없었다** (#1163).
  // 그 문구는 자작이 아니라 **ADR 계약 원문**이다 — `20260628-756` §A4.5 DoD 1 표 1행이
  // "커밋된 마스크와 IoU ≥ 0.80. OFF (`&surface=off`) 및 마스크 미적용 경로 대비 **유의 증가**"
  // (축자 인용 — `**` 강조 위치만 제외하면 원문
  // `20260628-756-procedural-planet-surface.md:1148` 의 부분 문자열이다. 원문은 `≥` 를 쓴다.)
  // 라고 요구한다. 즉 확정된 drift 는 자작 주석과의 drift 가 아니라 **ADR 과 구현의 drift** 였다.
  // 지금은 (2) 축에서 집행된다 — `SURFACE_OFF_IOU_MARGIN` (산출 근거는 그 선언부).
  //
  // ⚠️ **잔여 간극**: ADR 문면은 **두 경로 모두**에 「유의 증가」를 요구하나 (1) 축은 부호
  // 비교로 남는다 (#1163 계약 명시 비목표). `dod1 ∧ dod2` 가 `on.iou >= 0.8 > forcedOff.iou` 를
  // 보장하지만 **그 낙차의 하한은 `0` 에 임의로 가까울 수 있다** (`on 0.8000` / `forcedOff 0.7999`
  // 는 통과). 실측 낙차는 여유가 크다 — 로컬 `0.6238` / CI `0.6237`. 아래 (1) 의 근거는 그
  // 간극을 **없앤다는 주장이 아니라** 왜 지금 닫지 않는지의 기록이다.
  //
  // (1) `on.iou > forcedOff.iou` — **최종 게이트에 함의된다.** 이 블록이 `on.iou >= IOU_THRESHOLD`
  //     를 요구하고 DoD 2 가 `forcedOff.iou < IOU_THRESHOLD` 를 요구하며, 최종 게이트가
  //     `if (!(dod1 && dod2))` 다. 즉 exit code 를 바꾸지 않는다. **이 축에는 마진을 넣지 않는다**
  //     (#1163 명시 비목표) — `forcedOff` 쪽은 `dod2` 가 이미 절대 임계로 붙들고 있어, 낙차가
  //     좁아지려면 `forcedOff.iou` 가 `IOU_THRESHOLD` 를 향해 올라가야 하는데 그 순간 `dod2` 가
  //     먼저 깨진다. (2) 와 달리 임계 없는 자유 변수가 아니다.
  //     ⚠️ 다만 **인쇄되는 DoD 1 판정**은 바꿀 수 있다 (게이트는 두 DoD 의 곱이지만 로그는
  //     `dod1` 을 따로 찍는다 — reviewer 프로브 S2).
  // (2) `on.iou − surfaceOff.iou >= SURFACE_OFF_IOU_MARGIN` — **게이트를 바꾼다. 함의되지 않는다.**
  //     `surfaceOff.iou` 에는 어떤 임계도 걸려 있지 않다. 술어: **주석을 뺀 코드에서**
  //     `surfaceOff.iou` 리터럴은 **2곳** — 아래 `surfaceOffGap` 계산과 판정 로그뿐이고,
  //     그 밖에는 판정 직전 `JSON.stringify(results, null, 2)` 덤프가 값을 간접 출력한다.
  //     셋 중 어느 것도 임계가 아니다.
  //     그래서 이 축의 하중을 지는 것은 **낙차 자신**이며, 마진 없이는 동률에서만 발화했다.
  //     ⚠️ **#1163 초판은 이 비교를 「구조적으로 무해」로 판정했고 그것이 반증됐다** — 근거로
  //     든 「단색 구가 대륙 마스크와 0.94 IoU 를 낼 수 없다」가 **`?surface=off` 의 정상 동작을
  //     전제로 깔고 있었고, 그 전제가 깨지는 것이 바로 이 비교가 잡는 회귀**다 (순환 논증).
  // (3) 마스크 자체가 죽는 회귀는 임계가 먼저 잡는다 — `on.iou` 가 forcedOff 대역으로 떨어지고
  //     (실측 2026-08-26 로컬 SWIFTSHADER 4회 전건 sd 0: ON `0.9360` / forcedOff `0.3122` /
  //     surfaceOff `0.0000`), 부분 열화도 `0.8` 을 지나며 발화한다.
  //
  // ⚠️ **이 축이 `?surface=off` 의 유일한 커버는 아니다** (전칭 반증 — PR #1164 라운드 2 [B3]).
  //   같은 플래그·같은 body(earth)를 `browser-verify-756-surface.mjs` 가 **다른 지표**로 잰다
  //   (`on.hfEntropy − off.hfEntropy >= HF_ENTROPY_MARGIN`, `0.15` 하드 게이트 — 2026-08-26 기준
  //   `:521-532`). ⚠️ 그러나 지표가 다르므로 **커버 대역이 같다는 것은 증명되지 않았다** —
  //   「저쪽이 덮으니 여기는 불필요」의 근거로 쓰지 말 것. 맥락이지 근거가 아니다.
  //
  // dod1 conjunct 는 5개다: `!on.error` / `on.iou >= IOU_THRESHOLD` / 위 (1) / 위 (2) /
  // `on.consoleErrors === 0`.
  // 판정은 **raw 차** 로 한다 (인쇄만 반올림 — 756 `hfEntropy` 축과 동형). 반올림된 값을
  // 판정에 쓰면 `1e-4` 자리에서 판정과 인쇄가 갈리는 경계가 생긴다.
  const surfaceOffGap = on.iou - surfaceOff.iou;
  const dod1 =
    !on.error &&
    on.iou >= IOU_THRESHOLD &&
    on.iou > forcedOff.iou &&
    surfaceOffGap >= SURFACE_OFF_IOU_MARGIN &&
    on.consoleErrors === 0;
  // DoD 2 — 고착 주입 시 DoD 1 이 실제로 FAIL 해야 한다 (가드가 작동한다는 증거).
  const dod2 = !forcedOff.error && forcedOff.patchedMaterials > 0 && forcedOff.iou < IOU_THRESHOLD;

  console.log('\n=== 판정 (§A4.5) ===');
  console.log(
    `DoD 1 대륙 형상 IoU: ON ${on.iou} (≥ ${IOU_THRESHOLD}) / 마스크고착 ${forcedOff.iou} / surface=off ${surfaceOff.iou} · 낙차 ${surfaceOffGap.toFixed(4)} (요구 ≥ ${SURFACE_OFF_IOU_MARGIN}) · console err ${on.consoleErrors} → ${dod1 ? 'PASS' : 'FAIL'}`,
  );
  console.log(
    `DoD 2 negative (uMaskEnabled 0 고착 주입 → DoD 1 FAIL): 머티리얼 ${forcedOff.patchedMaterials}개 패치, IoU ${forcedOff.iou} < ${IOU_THRESHOLD} → ${dod2 ? 'PASS' : 'FAIL'}`,
  );
  if (!(dod1 && dod2)) process.exitCode = 1;
}

async function runLod(browser) {
  // focus 상태 (마스크 ON 대역) — 양성 대조군.
  const near = {};
  {
    const { context, page } = await setupPage(browser, FOCUS_QUERY);
    near.diskR = await readDiskRadiusPx(page);
    const before = await capture(page, 'qa-1119-lod-near-before');
    await injectMaskDisabled(page);
    await page.waitForTimeout(800);
    const after = await capture(page, 'qa-1119-lod-near-after');
    near.diff = await diffRatio(page, before, after);
    await context.close();
  }

  // 전체 태양계 조감 (disk R < 16 px 대역) — 마스크가 이미 꺼져 있어야 한다.
  const far = {};
  {
    const { context, page } = await setupPage(browser, '?gpu=a&lod=auto&rotate=off&orbits=off', {
      equatorialView: false,
    });
    far.diskR = await readDiskRadiusPx(page);
    const before = await capture(page, 'qa-1119-lod-far-before');
    await injectMaskDisabled(page);
    await page.waitForTimeout(800);
    const after = await capture(page, 'qa-1119-lod-far-after');
    far.diff = await diffRatio(page, before, after);
    await context.close();
  }

  console.log('\n=== 측정 (DoD 14 — 원거리 축소 LOD) ===');
  console.log(JSON.stringify({ near, far }, null, 2));

  // 양성 대조군 — focus 대역에서는 고착 주입이 픽셀을 **실제로 바꿔야** 한다.
  // (안 바뀌면 주입이 무효라는 뜻이고, 그러면 far 의 "안 바뀜" 은 아무것도 증명하지 못한다.)
  const positiveControl = near.diskR >= MASK_MIN_DISK_PX && near.diff.diffPx > 0;
  const farBelowThreshold = far.diskR !== null && far.diskR < MASK_MIN_DISK_PX;
  // 임계 아래 대역에서는 마스크가 이미 꺼져 있으므로 고착 주입이 픽셀을 바꾸지 못한다.
  const farUnchanged = far.diff.pct < 0.001;

  console.log('\n=== 판정 ===');
  console.log(
    `양성 대조군 (focus, R=${near.diskR}px ≥ ${MASK_MIN_DISK_PX}): 고착 주입 diff ${near.diff.diffPx}px (>0 필요) → ${positiveControl ? 'PASS' : 'FAIL'}`,
  );
  console.log(
    `원거리 대역 진입 (조감, R=${far.diskR}px < ${MASK_MIN_DISK_PX}) → ${farBelowThreshold ? 'PASS' : 'FAIL'}`,
  );
  console.log(
    `원거리에서 uMaskEnabled 이미 0 (고착 주입 diff ${far.diff.pct}% < 0.001%) → ${farUnchanged ? 'PASS' : 'FAIL'}`,
  );
  if (!(positiveControl && farBelowThreshold && farUnchanged)) process.exitCode = 1;
}

await withBrowser(
  {},
  async (browser) => {
    if (MODE === 'lod') {
      await runLod(browser);
      return;
    }
    if (MODE === 'seam') {
      await runSeam(browser);
      return;
    }
    await runDod(browser);
  },
  { launch },
);
