#!/usr/bin/env node
/**
 * #1202 — 지구 대기 산란 rim 동적 검증 (ADR `20260628-756` Amendment 8 §A8.8).
 *
 * **무엇을 재는가**: 지구 disk 의 림 밴드를 **기하로만** (구면 역투영한 법선 `N` 으로) 낮면/밤면
 * 으로 나눈 뒤, 각 대역의 **rim 기여 휘도** = `lum709(rim ON) − lum709(rim OFF)` 를 낸다.
 * ON/OFF 는 URL 플래그가 아니라 **런타임 uniform 주입**으로 얻는다 (`rimStrength = 0` = 정확한
 * no-op — `verify:1119` `injectMaskDisabled` / `verify:783` `injectDeepOceanFactor` 선례).
 *
 * ⚠️ **색으로 픽셀을 분류하지 않는다.** `verify:1119` 의 `b < g` land 필터는 재사용 금지다 —
 * 그 술어가 #1197 변이 M-i 의 사각 출처였다 (뒤집힌 픽셀이 판정에 도달하기 전에 배제됐다).
 * 본 가드의 표본 정의는 **전적으로 기하**(`dot(N, viewDir)` · `dot(N, sunDir)`)다.
 *
 * ## 게이트 6종 (G5 결번)
 *   G1  낮면 림 rim 기여 − 밤면 림 rim 기여 ≥ M    — D1 핵심 (변이 M-1: 광원각 항 삭제)
 *   G2  낮면 림 rim 기여 ≥ τ                        — 변이 M-2 / M-3 / M-4
 *   G3  낮면 림 기여 − 낮면 **내부** 기여 ≥ M2      — 실패 모드 ③ (밝기는 맞고 위치가 틀림)
 *   G4  낮면 림 채도 감소량 ≤ 상한                  — 실패 모드 ⑤ washout (변이 M-6)
 *   G5  **결번** — 낮면 호 3분할 `> 0`. 단독 발화 구간이 없어 삭제 (M-8 실측, 상수 블록 참조)
 *   G6  박명 호 (`-0.15 < ndl < 0`) rim 기여 ≥ τ2  — `RIM_NDL_LO` 부호 (변이 M-7). **G1~G4 는
 *       이 상수에 전부 눈이 멀다** — 낮면 림 기여가 `LO` 전 구간에서 불변이다
 *   G7  런타임 콘솔 에러 수 == 0                    — 측정이 성립한 런타임인가 (변이 M-9)
 *
 * ## 「측정 불가」 ≠ FAIL (§A8.8)
 * 아래 넷 중 하나라도 걸리면 PASS/FAIL 이 아니라 **「측정 불가」로 즉시 종료**한다. 조용한 PASS 도,
 * 억울한 FAIL 도 막는다. ⚠️ **exit code 는 `2` 이며 `0` 이 아니다** (CLAUDE.md §가드 설계 원칙 —
 * fallback 분기 절대 금지. 「측정 불가라서 통과」는 이 저장소가 반복해 온 silent no-op 의 형태다):
 *   (1) 대역별 표본 수 `N` 하한 미달
 *   (2) 낮면 림 밴드 평균 잔여 휘도 헤드룸 하한 미달 (§A8.6 — 극관·포화 지배 구간)
 *   (3) 측정 프레임 위상각 `alpha` 하한 미달 (§A8.13 — 낮면 림에 조명된 호가 없는 구간)
 *   (4) 낮면 내부 평균 휘도(OFF) 하한 미달 — **측정 대상(절차 표면)이 화면에 없는 상태.**
 *       설계가 열거한 (1)~(3) 이 **전부 통과하는데** 아무것도 재고 있지 않은 구간이 실측됐다
 *       (tier-c 폴백 — `FOCUS_QUERY` 주석). dev 가 실행으로 발견해 추가한 네 번째 전제다.
 *
 * ## 모드
 *   node browser-verify-1202-atmosphere-rim.mjs               # 게이트 6종
 *   INJECT=m1 node browser-verify-1202-atmosphere-rim.mjs     # 변이 M-1 (광원각 항 런타임 등가 삭제)
 *   INJECT=m4 node browser-verify-1202-atmosphere-rim.mjs     # 변이 M-4 (세기 0 고착)
 *   INJECT=m6 node browser-verify-1202-atmosphere-rim.mjs     # 변이 M-6 (세기 x5 — washout)
 *   INJECT=m7 node browser-verify-1202-atmosphere-rim.mjs     # 변이 M-7 (rimNdlLo 부호 뒤집기)
 *   INJECT=m9 node browser-verify-1202-atmosphere-rim.mjs     # 변이 M-9 (콘솔 에러 1건 주입)
 *   INJECT=lo LO=-0.05 ...                                    # rimNdlLo 스윕 (G6 임계 확정용)
 *   INJECT=m8 M8_LO=0.85 M8_HI=0.90 ...                       # 방위 편중 (G5 판별력 실측용)
 *   MODE=profile ...                                          # 게이트 없이 진단만 (임계 확정용)
 *
 * 환경:
 *   HEADFUL=0     headless chromium (CI). 기본은 실 Chrome GUI.
 *   SWIFTSHADER=1 headless + --use-angle=swiftshader (CI WebGL2 재현)
 *   BASE_URL      기본 http://localhost:3000
 *   CAPTURE_DIR   지정 시 판정 프레임 PNG 저장
 */

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { waitForLodSettle } from '../../../scripts/browser-verify-utils.mjs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const CAPTURE_DIR = process.env.CAPTURE_DIR ?? null;
const HEADFUL = process.env.HEADFUL !== '0';
const SWIFTSHADER = process.env.SWIFTSHADER === '1';
const MODE = process.env.MODE ?? 'dod';
const INJECT = process.env.INJECT ?? 'none';

/** 결정적 프레임 고정 JD — `verify:783` / `verify:1119` 와 동일 (춘분 근방). */
const T_JD = 2451626.0;

/**
 * 결정적 프레임 쿼리 — `verify:1119:525` 와 동일.
 *
 * ⚠️ **`gpu=a` 를 빼지 말 것.** 빼면 런타임 자동 tier 판정에 노출되고, 저성능으로 판정되면
 * tier-c 로 떨어져 **절차 표면 자체가 사라진다** (billboard 단색 — `solar-system-scene.ts:467`).
 * 이 판정은 실행 시점 성능 측정에 의존해 **결정적이지 않다** — 같은 머신에서 `gpu=a` 없이 돌린
 * 두 실행 중 한 번은 tier-c 로 떨어졌고 한 번은 떨어지지 않았다 [실측]. `gpu=a` 는 그 축을 고정한다.
 *
 * 떨어진 실행의 관측: 역투영 기하는 정상이라 대역별 표본이 `N = 867` 로 정상 범위인데 **모든
 * 대역 rim 이 `0`** 이었다. 표본 하한은 이 상태를 못 잡고, 헤드룸 하한도 방향이 반대라 못 잡는다
 * (그 상태의 헤드룸은 `0.964` 로 **하한보다 크다**).
 * ⇒ 유효성 전제 **(4) 낮면 내부 평균 휘도 하한**이 이 축의 방어다 (아래 `MIN_DAY_LIT_LUM`).
 */
const FOCUS_QUERY = '?gpu=a&focus=earth&lod=auto&rotate=off&orbits=off';

/**
 * #1215 — G6 를 재는 **두 번째 페이지** (구름 OFF). `?clouds=off` 는 구름 mesh 미생성 + 정렬 함수
 * 미설치로 구름 도입 전과 같은 코드 경로다 (ADR `20260628-756` §A10.9 · §A10.10).
 */
const FOCUS_QUERY_CLOUDS_OFF = `${FOCUS_QUERY}&clouds=off`;
/** #1215 — 구름 shell mesh 이름 (`cloud-layer.ts` `createCloudLayer` — `${body.id}-cloud`). */
const CLOUD_MESH_NAME = 'earth-cloud';

/** 「측정 불가」 종료 코드 — PASS(0) 도 FAIL(1) 도 아니다 (§A8.8). */
const EXIT_UNMEASURABLE = 2;

// ── 대역 정의 (전부 기하) ───────────────────────────────────────────────────
/** 림 밴드 = `dot(N, viewDir) <= RIM_BAND_NDV`. 실루엣에서 0 이므로 이 값이 곧 밴드 폭이다. */
const RIM_BAND_NDV = 0.25;
/** 낮면 판정 하한 (`ndl`). `SOFT_TERMINATOR_WIDTH = 0.12` 위 — 완전 주광 구간만 본다. */
const DAY_NDL_MIN = 0.15;
/** 밤면 판정 상한 (`ndl`). terminator 를 양쪽에서 비워 대역이 섞이지 않게 한다. */
const NIGHT_NDL_MAX = -0.15;
/**
 * terminator 정의값 — `ndl == 0` 이 낮/밤 경계다. **새 임계가 아니라 정의**다 (튜닝 대상 아님).
 * G6 박명 호 대역의 상단 경계이며, 하단은 기존 `NIGHT_NDL_MAX` 를 그대로 쓴다.
 */
const TERMINATOR_NDL = 0;
/** G3 의 「내부」 = `dot(N, viewDir) >= INNER_NDV_MIN` 인 낮면 픽셀 (disk 중앙부). */
const INNER_NDV_MIN = 0.6;
/** 낮면 호 분할 수 (진단 전용 — G5 결번). */
const ARC_BINS = 3;

// ── 「측정 불가」 하한 ───────────────────────────────────────────────────────
/** 대역별 표본 수 하한. 실측 최소 대역(낮면 림·밤면 림)이 각 `867` 이라 그 약 1/6 에 둔다. */
const MIN_SAMPLES = 150;
/** 낮면 림 평균 잔여 휘도 헤드룸 하한 (`lum709(1 - OFF)`). 실측 `0.28218` (5회 산포 0). */
const MIN_DAY_HEADROOM = 0.05;
/** 측정 프레임 위상각 하한 (deg). 실측 `90.0000°` (3회 동일). */
const MIN_PHASE_ALPHA_DEG = 10;
/**
 * 낮면 내부 평균 휘도(OFF 프레임) 하한 — 「측정 대상이 화면에 있는가」.
 *
 * 설계 3항(표본 수 · 헤드룸 · 위상각)이 **전부 통과하는데 측정 대상이 없는** 상태가 실재한다
 * (위 `FOCUS_QUERY` 주석 — tier-c 로 절차 표면이 사라져도 역투영 기하는 정상이다). 본 항목은
 * 그 축을 닫는 네 번째 유효성 전제이며, 게이트가 아니라 **전제**다 (rim 의 유무를 묻지 않는다).
 */
const MIN_DAY_LIT_LUM = 0.15;
/**
 * 박명 대역 표본 수 하한 (G6 전용). 이 대역은 `ndl` 폭이 `0.15` 로 좁아 구조적으로 표본이 적다
 * — 실측 `97` 로 낮/밤 대역 `867` 의 1/9 다. 낮/밤 대역이 쓴 여유율(실측의 약 1/6)을 그대로
 * 적용하면 `16` 이지만, 좁은 대역일수록 표본 붕괴가 빨리 오므로 더 보수적인 `30` (실측의 약 1/3)
 * 을 쓴다. **엄격한 쪽이 안전한 방향**이다 — 미달은 「측정 불가」(exit 2) 이지 조용한 PASS 가 아니다.
 */
const MIN_TWILIGHT_SAMPLES = 30;

// ── 게이트 임계 (GPU 실측 확정 — 측정 조건·산포는 PR 본문 · ADR §A8.8) ──────
/**
 * G1·G2·G3 공통 임계 (headless chromium `?gpu=a` · 1280×720 · JD 2451626.0 · 5회 반복,
 * 다섯 실행이 소수 5자리까지 동일 — 산포 `0`).
 *
 * 실측 baseline: G1 `0.07438` / G2 `0.07499` / G3 `0.07141`. 셋에 같은 값을 쓰는 것은
 * 세 양이 모두 **낮면 림 rim 기여**에 지배되기 때문이다 (밤면 `0.00061` · 낮면 내부 `0.00358`).
 * `0.025` 는 그 baseline 의 약 1/3 이고, 겨냥 변이의 실측값 — M-1 의 G1 `-0.07396` · M-4 의
 * 세 게이트 전건 `0.00000` — 과 baseline 사이 어디에 두어도 판별력은 같다. 1/3 지점은 표면
 * 조성 변화(림 밴드에 드는 극관·포화 픽셀 비율)에 대한 여유다.
 *
 * ⚠️ **설계 스케치의 예측값을 옮겨 적지 않았다.** 위 숫자는 전부 이 스크립트의 GPU 실행 출력이다.
 */
const G1_MIN_DAY_NIGHT_GAP = 0.025;
/** G2 — 낮면 림 rim 기여 하한. 위 공통 임계 참조 (실측 baseline `0.07499`). */
const G2_MIN_DAY_RIM = 0.025;
/** G3 — 낮면 림 − 낮면 내부 rim 기여 하한. 위 공통 임계 참조 (실측 baseline `0.07141`). */
const G3_MIN_LIMB_INNER_GAP = 0.025;
/**
 * G4 — 낮면 림 채도(채널 `max−min`) 감소량 상한 = `satOff − satOn`.
 *
 * **앵커**: 낮면 림 OFF 채도 실측 `0.47536` 의 절반 `0.23768` 을 올림한 값 — rim 을 얹은 뒤에도
 * 낮면 림이 OFF 채도의 절반은 유지해야 「대기」로 읽히고 그 아래는 플라스틱 하이라이트다.
 *
 * 세기 스윕 실측 (`rimStrength` = `RIM_STRENGTH` 배수, 감소량):
 *   ×1 `0.07479` / ×2 `0.15274` / ×3 `0.22854` / ×4 `0.29996` / ×5 `0.35939`
 * ⇒ **×4 부터 발화**한다. baseline 대비 3.2배 여유, 변이 M-6(×5)을 1.50배 초과로 차단.
 *
 * ⚠️ 같은 스윕이 §A8.6 「낮면 상한」을 GPU 로 재확인한다 — 세기를 5배 올려도 낮면 림 **휘도**
 * 기여는 `0.07499 → 0.20751` (2.77배) 에서 멎는데 **채도 감소량은 `0.07479 → 0.35939` (4.80배)**
 * 로 커진다. 즉 세기 상향은 얻는 것보다 잃는 것이 빨리 커진다.
 */
const G4_MAX_SATURATION_DROP = 0.24;
// G5 (낮면 하위 호별 rim `> 0`) — **결번**. 초판의 게이트였고 리뷰 라운드에서 **삭제**했다.
// 근거 [실측, 변이 M-8 = `ndl` 창을 위로 밀어 방위 편중을 만드는 런타임 등가]:
//   창 하단 0.30 / 0.50 / 0.70 / 0.85 에서 호 기여
//     `0.07635·0.05360·0.09388` / `0.06006·0.05360·0.07230` / `0.02505·0.05360·0.03499` /
//     `0.00017·0.04576·0.00052`  ⇒ **네 경우 모두 G5 PASS** (`> 0` 은 근사-0 을 걸러내지 못한다)
//   같은 실행의 낮면 림 기여 `0.07466` / `0.06201` / `0.03786` / **`0.01543`**
//     ⇒ 편중이 극단(호 하나에 몰림)에 이르는 0.85 에서 **G2 가 먼저 FAIL** 한다.
//   호가 정확히 `0` 이 되는 0.90 (`0`·`0.02512`·`0`) 에서는 낮면 림이 `0.00835` 라 G2 도 FAIL.
// ⇒ **G5 가 단독으로 발화하는 구간이 없다.** 겨냥한 것(방위 편중)은 못 잡고 잡는 것은 G2 중복이다
//   (#1197 D5-b 동형 — 「내가 만든 게이트」는 보존 근거가 아니다). 호 분할은 **진단 인쇄로 남긴다**
//   (§A8.7 ⑥ 밴드 두께와 같은 처분 — 게이트 불가 축은 진단 + GUI 육안이 짝이다).
/**
 * G6 — **박명 호** (terminator 를 넘어간 림, `NIGHT_NDL_MAX < ndl < 0`) rim 기여 하한.
 *
 * 이 게이트만이 `RIM_NDL_LO` 의 **부호**를 잡는다. 기존 G1~G4 는 그 상수에 전부 눈이 멀다
 * [실측, `rimNdlLo` 런타임 스윕] — 낮면 림 기여가 `LO ∈ {-0.25, -0.20, -0.15, -0.10, -0.05,
 * 0.00, +0.05}` 전 구간에서 `0.07499` 로 **완전 불변**이다 (G1 은 밤면이 `0` 이 되어 오히려 좋아진다).
 * 구조적 원인: 낮면 대역 하한 `DAY_NDL_MIN = 0.15` 가 셰이더 `RIM_NDL_HI` 와 **같아** smoothstep
 * 전이 구간 전체가 낮/밤 두 대역 **사이에** 빈다.
 *
 * 같은 스윕의 박명 대역 실측 (`N = 97`, 단조):
 *   `-0.25` **`0.06086`** / `-0.20` `0.04490` / `-0.15` `0.02754` / `-0.10` `0.01241` /
 *   `-0.05` `0.00254` / `0.00` `0` / `+0.05` `0`
 *
 * 임계 `0.02` 는 baseline `0.06086` 의 약 1/3 — G1~G3 과 **같은 관례**다. 판정 결과:
 *  - `+0.05` (변이 M-7) `0` ⇒ FAIL. `0.00` 도 `0` ⇒ FAIL.
 *  - **`-0.05` `0.00254` ⇒ FAIL 이고, 그것이 옳다.** 「음수면 통과」는 U18 단위 테스트가 이미 가진
 *    구멍이다 — `-0.05` 는 박명 호의 **4.2%** 만 남긴다 (24배 감소). §A8.13 이 이 상수의 근거로
 *    든 것은 「음수」가 아니라 「terminator 박명 호」이고, `-0.05` 는 그 근거를 비운다.
 *  - `-0.15` `0.02754` (1.38배) PASS / `-0.10` `0.01241` FAIL. 즉 본 게이트가 실제로 고정하는
 *    계약은 「`LO` 가 `NIGHT_NDL_MAX` 근방 이하로 충분히 음수」다.
 *
 * **#1215 재정의 (계약 재조정 2)** — G6 는 구름 OFF 프레임(?clouds=off 페이지)에서 잰다. 구름 ON 에서는
 * 구름이 박명 호를 물리적으로 가려 0.06086 -> 0.00382 (cover 0.52, ALPHATEST 도 0.00341) 로 떨어진다 —
 * 알파 축이 아니라 커버리지 축이고, 가드가 낡은 것이지 구현 결함이 아니다. 임계 0.02 · 대역 · 표본
 * 하한은 무변경이며 재는 프레임만 바꿨다. cover 를 가드가 통과하는 값으로 고르는 것은 금지 (C1 클래스 —
 * 가드 발화는 시각 회귀의 증거다). 사용자 합의: #1215 계약 재조정 2 (코멘트 5615851703).
 *   - ⚠️ D1 승인 파라미터 (`cover 0.5`) 의 구름 ON 박명 값은 이 게이트를 **통과한다** — 그래도 재정의는
 *     설계대로 한다. 통과 여부로 재는 프레임을 고르면 그것이 곧 C1 클래스다 (구름 ON 값은 진단 인쇄).
 */
const G6_MIN_TWILIGHT_RIM = 0.02;

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

/**
 * 결정적 프레임 부트스트랩 — `verify:783` / `verify:1119` 레시피 그대로.
 *   `?focus=earth&rotate=off&orbits=off` → JD 고정 + pause → `beta = π/2` 적도면 시점.
 */
async function setupPage(browser, query = FOCUS_QUERY) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE_URL}${query}`, {
    waitUntil: 'networkidle',
    timeout: 45_000,
  });
  await page.waitForFunction(
    () => typeof window.__simCore !== 'undefined' && typeof window.__solarScene !== 'undefined',
    { timeout: 20_000 },
  );
  await page.waitForTimeout(2800);
  await page.evaluate((jd) => {
    window.__simCore.command({ type: 'jumpToJulianDate', julianDate: jd });
    window.__simCore.command({ type: 'pause' });
  }, T_JD);
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    window.__simCore.scene.activeCamera.beta = Math.PI / 2;
  });
  // #1205 — 정지 중 카메라 조작이 이제 LOD 를 건드린다. [실측] 이 `beta` 대입 하나로 분포가
  // `3/2/27 → 9/6/17` (11 body 전이) 로 바뀌고 cross-fade 가 `12ms ~ 211ms` 동안 진행한다
  // (#1205 이전 같은 시퀀스: 분포 `3/3/26` 불변, 전이 0 건 — 양쪽 실측).
  // 상수 sleep 대신 `fading === 0` 정착을 확인한다 (ADR `20260628-756` Amendment 9).
  const lodSettle = await waitForLodSettle(page);
  if (lodSettle.timedOut) {
    console.warn(
      `[1202] LOD 정착 상한 초과 (${lodSettle.waitedMs}ms, dist=${lodSettle.dist} fading=${lodSettle.fading}) — 마지막 상태로 진행`,
    );
  }
  return { context, page, consoleErrors };
}

/**
 * 지구 머티리얼(high + LOD variant) 전부에 float uniform 을 **매 프레임 덮어쓰는** observer 추가.
 *
 * Babylon 은 `bind()` 에서 uniform 을 올린 뒤 `onBindObservable` 을 알리므로, 우리 observer 가
 * 머티리얼 자신의 observer **뒤에** 등록되면 다음 프레임 업로드 값이 항상 주입값이 된다 —
 * **프로덕션 코드 0 줄로** 특정 uniform 상태를 재현한다 (`verify:1119` `injectMaskDisabled` 선례).
 */
async function injectFloats(page, entries) {
  return page.evaluate((pairs) => {
    const earth = window.__solarScene?.meshes?.get('earth');
    if (!earth) return { patched: 0, error: 'earth mesh 부재' };
    // #1215 — 대상은 **표면 셰이더를 싣는 host 와 LOD variant** 로 명시 한정한다. `getChildMeshes()` 는
    // 구름 shell (`earth-cloud`) 도 돌려주는데, 이 함수는 rim uniform 을 매 프레임 덮어쓰는 용도라
    // 구름 머티리얼은 대상이 아니다 (구름 셰이더에 rim uniform 이 없어 무해하나 「패치 개수」가 구름
    // 유무로 달라져 진단이 섞인다 — Phase 1a 실측: 구름 ON 에서 `verify:783` / `verify:1119` 가
    // 「머티리얼 2개 패치」, OFF 에서 `1`).
    const meshes = [earth, ...earth.getChildMeshes()].filter(
      (m) => m === earth || m.name.startsWith('earth-lod-'),
    );
    let patched = 0;
    for (const mesh of meshes) {
      const mat = mesh.material;
      if (mat && typeof mat.setFloat === 'function' && mat.onBindObservable) {
        mat.onBindObservable.add(() => {
          for (const [name, value] of pairs) mat.setFloat(name, value);
        });
        patched += 1;
      }
    }
    return { patched };
  }, entries);
}

async function capture(page, name) {
  const buf = await page.locator('canvas').first().screenshot();
  if (CAPTURE_DIR) {
    await mkdir(CAPTURE_DIR, { recursive: true });
    await writeFile(path.join(CAPTURE_DIR, `${name}.png`), buf);
  }
  return buf.toString('base64');
}

/**
 * ON/OFF 두 프레임에서 기하 대역별 rim 기여를 낸다.
 *
 * 역투영은 `verify:1119` 술어를 그대로 재사용한다 — 카메라 basis + 수직 FOV 로 픽셀별 world ray 를
 * 만들고 구와 교차시켜 표면 법선을 얻는다 (직교 근사가 아니라 실제 원근 ray). `rotate=off` 이므로
 * 그 법선이 곧 셰이더의 `p` 이자 `N` 이다.
 */
async function measure(page, onB64, offB64, params) {
  return page.evaluate(
    async ({ on, off, P }) => {
      const scene = window.__simCore?.scene;
      const mesh = window.__solarScene?.meshes?.get('earth');
      if (!scene || !mesh) return { error: 'earth mesh/scene 부재' };
      const engine = scene.getEngine();
      const rw = engine.getRenderWidth();
      const rh = engine.getRenderHeight();
      const camera = scene.activeCamera;
      const Vector3 = mesh.getAbsolutePosition().constructor;

      const forward = camera.getDirection(new Vector3(0, 0, 1));
      const right = camera.getDirection(new Vector3(1, 0, 0));
      const up = camera.getDirection(new Vector3(0, 1, 0));
      const camPos = camera.globalPosition ?? camera.position;
      const center = mesh.getAbsolutePosition();
      const radiusWorld = mesh.getBoundingInfo().boundingSphere.radiusWorld / Math.sqrt(3);

      let sunPos = null;
      for (const l of scene.lights) {
        if (l.position && (l.name === 'sun-light' || l.getClassName?.() === 'PointLight')) {
          sunPos = l.position;
          break;
        }
      }
      if (!sunPos) return { error: 'sunLight 부재' };
      const sunDir = sunPos.subtract(center).normalize();
      const camUnit = camPos.subtract(center).normalize();
      const phaseAlphaDeg =
        (Math.acos(
          Math.max(
            -1,
            Math.min(1, camUnit.x * sunDir.x + camUnit.y * sunDir.y + camUnit.z * sunDir.z),
          ),
        ) *
          180) /
        Math.PI;

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
        return {
          data: c.getContext('2d').getImageData(0, 0, img.width, img.height).data,
          w: img.width,
          h: img.height,
        };
      };
      const A = await load(on);
      const B = await load(off);
      if (A.data.length !== B.data.length) return { error: 'ON/OFF 캔버스 크기 불일치' };

      // 스크린샷 해상도 ↔ 렌더 해상도 스케일 (deviceScaleFactor 1 이라 보통 1).
      const sx = A.w / rw;
      const sy = A.h / rh;

      const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const sat = (r, g, b) => (Math.max(r, g, b) - Math.min(r, g, b)) / 255;

      // disk 반경 (px) — 셰이더 LOD 판정과 동일 산식 (camera right edge 투영).
      const idMat = mesh.getWorldMatrix().constructor.Identity();
      const transform = scene.getTransformMatrix();
      const vp = camera.viewport.toGlobal(rw, rh);
      const cS = Vector3.Project(center, idMat, transform, vp);
      const eS = Vector3.Project(center.add(right.scale(radiusWorld)), idMat, transform, vp);
      const diskR = Math.hypot(eS.x - cS.x, eS.y - cS.y);

      const tanHalf = Math.tan(camera.fov / 2);
      const aspect = rw / rh;

      const mk = () => ({
        n: 0,
        sumP: 0,
        sumHead: 0,
        sumSatOn: 0,
        sumSatOff: 0,
        sumLumOff: 0,
        satPx: 0,
      });
      const dayLimb = mk();
      const nightLimb = mk();
      const dayInner = mk();
      // G6 — 박명 호: terminator 를 **넘어간** 림 픽셀 (`NIGHT_NDL_MAX < ndl < 0`). 기존 세 대역이
      // 구조적으로 비워 둔 구간이며 (`DAY_NDL_MIN` 이 셰이더 `RIM_NDL_HI` 와 같아 smoothstep 전이
      // 구간 전체가 낮/밤 대역 사이에 빈다), `RIM_NDL_LO` 의 부호가 유일하게 드러나는 곳이다.
      const twilightLimb = mk();
      const arcPx = []; // { theta, p } — G5 하위 호 분할용
      const radialProfile = new Map(); // 반경(px, 정수) → { n, sumP } (밴드 두께 진단)
      // 림 픽셀의 `ndl` 구간별 rim 기여 (폭 0.05) — 진단 전용. §A8.13 의 박명 호 실측을 가드 안에서
      // 재현 가능하게 만든다 (전용 스크래치 스크립트 없이 `MODE=profile` 로 재측정).
      const ndlProfile = new Map();

      for (let y = 0; y < rh; y += 1) {
        for (let x = 0; x < rw; x += 1) {
          const ndcX = ((x + 0.5) / rw) * 2 - 1;
          const ndcY = 1 - ((y + 0.5) / rh) * 2;
          const rxv = forward.x + right.x * ndcX * tanHalf * aspect + up.x * ndcY * tanHalf;
          const ryv = forward.y + right.y * ndcX * tanHalf * aspect + up.y * ndcY * tanHalf;
          const rzv = forward.z + right.z * ndcX * tanHalf * aspect + up.z * ndcY * tanHalf;
          const rl = Math.hypot(rxv, ryv, rzv);
          const dx = rxv / rl;
          const dy = ryv / rl;
          const dz = rzv / rl;
          const ocx = camPos.x - center.x;
          const ocy = camPos.y - center.y;
          const ocz = camPos.z - center.z;
          const bq = ocx * dx + ocy * dy + ocz * dz;
          const cq = ocx * ocx + ocy * ocy + ocz * ocz - radiusWorld * radiusWorld;
          const disc = bq * bq - cq;
          if (disc < 0) continue;
          const t = -bq - Math.sqrt(disc);
          if (t < 0) continue;
          const nx = (ocx + t * dx) / radiusWorld;
          const ny = (ocy + t * dy) / radiusWorld;
          const nz = (ocz + t * dz) / radiusWorld;

          // viewDir = normalize(camPos − 표면점) — 셰이더와 동일 (per-fragment).
          let vx = camPos.x - (center.x + nx * radiusWorld);
          let vy = camPos.y - (center.y + ny * radiusWorld);
          let vz = camPos.z - (center.z + nz * radiusWorld);
          const vl = Math.hypot(vx, vy, vz);
          vx /= vl;
          vy /= vl;
          vz /= vl;
          const ndv = nx * vx + ny * vy + nz * vz;
          const ndl = nx * sunDir.x + ny * sunDir.y + nz * sunDir.z;

          const px = Math.round(x * sx);
          const py = Math.round(y * sy);
          if (px < 0 || py < 0 || px >= A.w || py >= A.h) continue;
          const i = (py * A.w + px) * 4;
          const onR = A.data[i];
          const onG = A.data[i + 1];
          const onB = A.data[i + 2];
          const offR = B.data[i];
          const offG = B.data[i + 1];
          const offB = B.data[i + 2];
          const p = lum(onR, onG, onB) - lum(offR, offG, offB);
          const head = lum(255 - offR, 255 - offG, 255 - offB);
          const saturatedOff = offR >= 254 && offG >= 254 && offB >= 254;

          const isLimb = ndv <= P.RIM_BAND_NDV;
          const isInner = ndv >= P.INNER_NDV_MIN;
          const isDay = ndl >= P.DAY_NDL_MIN;
          const isNight = ndl <= P.NIGHT_NDL_MAX;
          const isTwilight = ndl > P.NIGHT_NDL_MAX && ndl < P.TERMINATOR_NDL;

          const push = (acc) => {
            acc.n += 1;
            acc.sumP += p;
            acc.sumHead += head;
            acc.sumSatOn += sat(onR, onG, onB);
            acc.sumSatOff += sat(offR, offG, offB);
            acc.sumLumOff += lum(offR, offG, offB);
            if (saturatedOff) acc.satPx += 1;
          };
          if (isLimb && isDay) {
            push(dayLimb);
            arcPx.push({
              theta: Math.atan2(y - (cS.y ?? 0), x - (cS.x ?? 0)),
              p,
            });
          }
          if (isLimb && isNight) push(nightLimb);
          if (isLimb && isTwilight) push(twilightLimb);
          if (isInner && isDay) push(dayInner);

          if (isLimb) {
            const bin = Math.floor(ndl / 0.05) * 0.05;
            const key = Number(bin.toFixed(2));
            const slot = ndlProfile.get(key) ?? { n: 0, sumP: 0 };
            slot.n += 1;
            slot.sumP += p;
            ndlProfile.set(key, slot);
          }

          if (isDay) {
            const rad = Math.round(Math.hypot(x - cS.x, y - cS.y));
            const slot = radialProfile.get(rad) ?? { n: 0, sumP: 0 };
            slot.n += 1;
            slot.sumP += p;
            radialProfile.set(rad, slot);
          }
        }
      }

      const mean = (acc, key) => (acc.n ? acc[key] / acc.n : null);
      const pack = (acc) => ({
        n: acc.n,
        rim: acc.n ? Number(mean(acc, 'sumP').toFixed(5)) : null,
        headroom: acc.n ? Number(mean(acc, 'sumHead').toFixed(5)) : null,
        satOn: acc.n ? Number(mean(acc, 'sumSatOn').toFixed(5)) : null,
        satOff: acc.n ? Number(mean(acc, 'sumSatOff').toFixed(5)) : null,
        lumOff: acc.n ? Number(mean(acc, 'sumLumOff').toFixed(5)) : null,
        saturatedPct: acc.n ? Number(((acc.satPx / acc.n) * 100).toFixed(2)) : null,
      });

      // ── G5 낮면 호 분할 — 원형 평균 기준 signed offset 으로 wrap 처리 ──
      let arcs = [];
      if (arcPx.length > 0) {
        let sc = 0;
        let ss = 0;
        for (const a of arcPx) {
          sc += Math.cos(a.theta);
          ss += Math.sin(a.theta);
        }
        const meanTheta = Math.atan2(ss, sc);
        const wrap = (v) => {
          let w = v;
          while (w > Math.PI) w -= 2 * Math.PI;
          while (w < -Math.PI) w += 2 * Math.PI;
          return w;
        };
        const offs = arcPx.map((a) => ({ o: wrap(a.theta - meanTheta), p: a.p }));
        let lo = Infinity;
        let hi = -Infinity;
        for (const o of offs) {
          if (o.o < lo) lo = o.o;
          if (o.o > hi) hi = o.o;
        }
        const span = hi - lo;
        const bins = Array.from({ length: P.ARC_BINS }, () => ({ n: 0, sumP: 0 }));
        for (const o of offs) {
          let k = Math.floor(((o.o - lo) / Math.max(span, 1e-9)) * P.ARC_BINS);
          if (k >= P.ARC_BINS) k = P.ARC_BINS - 1;
          if (k < 0) k = 0;
          bins[k].n += 1;
          bins[k].sumP += o.p;
        }
        arcs = bins.map((b, k) => ({
          bin: k,
          n: b.n,
          rim: b.n ? Number((b.sumP / b.n).toFixed(5)) : null,
        }));
      }

      // ── 밴드 두께 진단 — 낮면 rim 기여의 반경 프로파일에서 최대치의 50% 이상 폭(px) ──
      const prof = [...radialProfile.entries()]
        .map(([rad, s]) => ({ rad, n: s.n, rim: s.sumP / s.n }))
        .filter((e) => e.n >= 8)
        .sort((a, b) => a.rad - b.rad);
      let peak = 0;
      for (const e of prof) if (e.rim > peak) peak = e.rim;
      const half = prof.filter((e) => e.rim >= peak * 0.5);
      const bandHalfWidthPx = half.length ? half[half.length - 1].rad - half[0].rad + 1 : 0;

      return {
        phaseAlphaDeg: Number(phaseAlphaDeg.toFixed(4)),
        diskRadiusPx: Number(diskR.toFixed(2)),
        bandHalfWidthPx,
        peakRadialRim: Number(peak.toFixed(5)),
        dayLimb: pack(dayLimb),
        nightLimb: pack(nightLimb),
        twilightLimb: pack(twilightLimb),
        dayInner: pack(dayInner),
        arcs,
        ndlProfile: [...ndlProfile.entries()]
          .filter(([, s]) => s.n >= 8)
          .sort((a, b) => a[0] - b[0])
          .map(([k, s]) => [k, s.n, Number((s.sumP / s.n).toFixed(5))]),
        radialProfile: prof
          .filter((e) => e.rad % 4 === 0)
          .map((e) => [e.rad, Number(e.rim.toFixed(5))]),
      };
    },
    { on: onB64, off: offB64, P: params },
  );
}

/**
 * INJECT 변이를 **한 페이지**에 얹는다 (프로덕션 코드 0 줄).
 *
 * ⚠️ #1215 — G6 재정의 후에는 **두 페이지 모두**에 주입한다. 한쪽 (구름 ON) 에만 주입하면 M-7 이 G6
 * (구름 OFF 페이지에서 잰다) 에 도달하지 못해, 재정의가 판별력을 조용히 지우는 경로가 된다 (ADR
 * `20260628-756` §A10.10 구현 계약).
 *
 * @returns {Promise<string|null>} 오류 문구 (미지원 INJECT · LO 누락) 또는 null
 */
async function applyInject(page, label) {
  if (INJECT === 'm1') {
    // M-1 등가 에뮬레이션: 도달 가능한 모든 ndl ∈ [-1,1] 에서 smoothstep = 1 ⇒ rimLight ≡ 1.
    // 즉 광원각 항이 없는 순수 fresnel 과 **거동이 같다** (소스 삭제와 문자 동일하지는 않다).
    console.log(`[inject:${label}] M-1 — rimNdlLo=-2.0 / rimNdlHi=-1.9 (순수 fresnel 등가)`);
    await injectFloats(page, [
      ['rimNdlLo', -2.0],
      ['rimNdlHi', -1.9],
    ]);
  } else if (INJECT === 'm4') {
    console.log(`[inject:${label}] M-4 — rimStrength=0 (세기 0 고착)`);
    await injectFloats(page, [['rimStrength', 0]]);
  } else if (INJECT === 'm6') {
    console.log(`[inject:${label}] M-6 — rimStrength=2.5 (기본 0.5 x5 — washout 겨냥)`);
    await injectFloats(page, [['rimStrength', 2.5]]);
  } else if (INJECT === 'm7') {
    // M-7 — `RIM_NDL_LO` 부호 뒤집기. G6 가 겨냥하는 변이 (§A8.13 근거를 지키는 게이트).
    console.log(`[inject:${label}] M-7 — rimNdlLo=+0.05 (부호 뒤집기 — 박명 호 소멸 겨냥)`);
    await injectFloats(page, [['rimNdlLo', 0.05]]);
  } else if (INJECT === 'lo') {
    // `RIM_NDL_LO` 스윕 — 임계 확정·판별력 실측용 (MODE=profile 과 함께 쓴다).
    const lo = Number(process.env.LO);
    if (!Number.isFinite(lo)) return 'INJECT=lo 는 LO=<숫자> 환경변수가 필요하다';
    console.log(`[inject:${label}] LO 스윕 — rimNdlLo=${lo}`);
    await injectFloats(page, [['rimNdlLo', lo]]);
  } else if (INJECT === 'm8') {
    // M-8 — 방위 편중 (G5 겨냥). ndl 게이트 창을 낮면 림의 `ndl` 분포 **위쪽**으로 밀어
    // 태양에 가장 가까운 호에만 rim 이 남게 한다. 소스 변이가 아니라 런타임 등가다.
    const lo = Number(process.env.M8_LO ?? 0.5);
    const hi = Number(process.env.M8_HI ?? 0.55);
    console.log(`[inject:${label}] M-8 — rimNdlLo=${lo} / rimNdlHi=${hi} (방위 편중 — G5 겨냥)`);
    await injectFloats(page, [
      ['rimNdlLo', lo],
      ['rimNdlHi', hi],
    ]);
  } else if (INJECT === 'm9') {
    // M-9 — 콘솔 에러 게이트의 판별력 실증용 인위적 결함 주입. 셰이더와 무관하며, 재는 것은
    // 「런타임 에러가 하나라도 나면 가드가 FAIL 하는가」 하나다.
    console.log(`[inject:${label}] M-9 — 페이지 콘솔 에러 1건 주입 (콘솔 에러 게이트 판별력 실증)`);
    await page.evaluate(() => {
      console.error('[m9] injected runtime error canary');
    });
  } else if (INJECT !== 'none') {
    return `미지원 INJECT=${INJECT}`;
  }
  return null;
}

/** ON 프레임 (INJECT 적용 상태) → OFF 프레임 (`rimStrength = 0` 정확한 no-op) → 기하 대역 측정. */
async function capturePair(page, prefix) {
  await page.waitForTimeout(400);
  const onB64 = await capture(page, `1202-${prefix}on-${INJECT}`);
  // 나중에 등록된 observer 가 이긴다.
  await injectFloats(page, [['rimStrength', 0]]);
  await page.waitForTimeout(400);
  const offB64 = await capture(page, `1202-${prefix}off-${INJECT}`);
  return measure(page, onB64, offB64, {
    RIM_BAND_NDV,
    DAY_NDL_MIN,
    NIGHT_NDL_MAX,
    TERMINATOR_NDL,
    INNER_NDV_MIN,
    ARC_BINS,
  });
}

/**
 * 「측정 불가」 4 전제 — #1215 이후 **두 쌍 각각**에서 평가한다 (G6 의 유효성은 자기 프레임의
 * 표본 · 위상각 · 휘도에 달렸다 — §A10.10). 박명 표본 하한 (좁은 대역 전용) 은 G6 를 재는 쌍에만 건다 —
 * 구름 ON 쌍의 박명 값은 게이트가 아니라 진단이다.
 */
function premises(r, label, withTwilight) {
  const out = [];
  for (const [name, acc] of [
    ['낮면 림', r.dayLimb],
    ['밤면 림', r.nightLimb],
    ['낮면 내부', r.dayInner],
  ]) {
    if (acc.n < MIN_SAMPLES)
      out.push(`(1) [${label}] 표본 부족 — ${name} N=${acc.n} < ${MIN_SAMPLES}`);
  }
  if (withTwilight && r.twilightLimb.n < MIN_TWILIGHT_SAMPLES)
    out.push(
      `(1) [${label}] 표본 부족 — 박명 림 N=${r.twilightLimb.n} < ${MIN_TWILIGHT_SAMPLES} (좁은 대역 전용 하한)`,
    );
  if (r.dayLimb.headroom !== null && r.dayLimb.headroom < MIN_DAY_HEADROOM)
    out.push(
      `(2) [${label}] 낮면 림 평균 잔여 휘도 헤드룸 ${r.dayLimb.headroom} < ${MIN_DAY_HEADROOM}`,
    );
  if (r.phaseAlphaDeg < MIN_PHASE_ALPHA_DEG)
    out.push(`(3) [${label}] 위상각 ${r.phaseAlphaDeg}deg < ${MIN_PHASE_ALPHA_DEG}deg`);
  if (r.dayInner.lumOff !== null && r.dayInner.lumOff < MIN_DAY_LIT_LUM)
    out.push(
      `(4) [${label}] 낮면 내부 평균 휘도(OFF) ${r.dayInner.lumOff} < ${MIN_DAY_LIT_LUM} — 측정 대상(절차 표면)이 화면에 없다`,
    );
  return out;
}

function printDiagnostics(label, r) {
  console.log(`\n--- ${label} ---`);
  console.log(
    `위상각 alpha        : ${r.phaseAlphaDeg}deg   disk 반경: ${r.diskRadiusPx}px   rim 밴드 반치폭: ${r.bandHalfWidthPx}px (peak ${r.peakRadialRim})`,
  );
  console.table({
    '낮면 림': r.dayLimb,
    '밤면 림': r.nightLimb,
    '박명 림': r.twilightLimb,
    '낮면 내부': r.dayInner,
  });
  // 호 분할은 **진단 전용**이다 (G5 결번 — 위 상수 블록의 M-8 실측 참조). 방위 편중은 게이트로
  // 닫지 못하고 (`> 0` 은 근사-0 을 못 거르며, 극단 편중은 G2 가 먼저 잡는다) 이 인쇄와 실 Chrome
  // GUI 육안이 짝이다 — §A8.7 ⑥ 밴드 두께와 같은 처분.
  console.log('낮면 호 분할 (진단, 게이트 아님):', JSON.stringify(r.arcs));
  console.log('낮면 반경 프로파일 [px, rim]:', JSON.stringify(r.radialProfile));
  console.log('림 ndl 프로파일 [ndl_lo, n, rim]:', JSON.stringify(r.ndlProfile));
}

async function main() {
  const browser = await launch();
  let exitCode = 0;
  try {
    // 페이지 A — 구름 ON (web 기본값). G1~G4 는 여기서 잰다 — 사용자 합의 범위는 G6 하나다 (§A10.10).
    const pageOn = await setupPage(browser, FOCUS_QUERY);
    // 페이지 B — 구름 OFF (`?clouds=off`). **G6 만** 여기서 잰다.
    //   #1215 — G6 는 구름 OFF 프레임(?clouds=off 페이지)에서 잰다. 구름 ON 에서는 구름이 박명 호를
    //   물리적으로 가려 0.06086 -> 0.00382 (cover 0.52, ALPHATEST 도 0.00341) 로 떨어진다 — 알파 축이
    //   아니라 커버리지 축이고, 가드가 낡은 것이지 구현 결함이 아니다. 임계 0.02 · 대역 · 표본 하한은
    //   무변경이며 재는 프레임만 바꿨다. cover 를 가드가 통과하는 값으로 고르는 것은 금지 (C1 클래스 —
    //   가드 발화는 시각 회귀의 증거다). 사용자 합의: #1215 계약 재조정 2 (코멘트 5615851703).
    // 토글이 런타임 `setEnabled(false)` 가 아니라 URL flag 인 이유: `?clouds=off` 는 구름 mesh 미생성 +
    // 정렬 함수 미설치로 구름 도입 전과 **같은 코드 경로**라 G6 baseline `0.06086` · 임계 · M-7 이 그대로
    // 옮겨 온다 (§A10.9 · §A10.10). 런타임 비활성은 mesh 와 정렬 함수가 남아 동일성을 따로 증명해야 한다.
    const pageOff = await setupPage(browser, FOCUS_QUERY_CLOUDS_OFF);
    const pages = [
      [pageOn, '구름 ON'],
      [pageOff, '구름 OFF'],
    ];

    for (const [p, label] of pages) {
      const err = await applyInject(p.page, label);
      if (err) {
        console.error(`[inject] ${err}`);
        for (const [q] of pages) await q.context.close();
        return 1;
      }
    }
    // 「측정 불가」 추가 전제 — OFF 페이지에 구름 mesh 가 **없다** (있으면 G6 가 구름 OFF 프레임을 재지 않는다).
    const offPageHasCloud = await pageOff.page.evaluate(
      (n) => window.__simCore.scene.getMeshByName(n) !== null,
      CLOUD_MESH_NAME,
    );

    const r = await capturePair(pageOn.page, '');
    const rOff = await capturePair(pageOff.page, 'cloudsoff-');
    for (const [p] of pages) await p.context.close();

    if (r.error || rOff.error) {
      console.error(`[fail] 측정 실패 — ${r.error ?? rOff.error}`);
      return 1;
    }

    console.log('\n=== #1202 대기 산란 rim — 진단 ===');
    console.log(`INJECT=${INJECT}  MODE=${MODE}`);
    printDiagnostics('페이지 A — 구름 ON (G1~G4)', r);
    printDiagnostics('페이지 B — 구름 OFF ?clouds=off (G6)', rOff);
    // 구름 ON 박명 호는 **진단으로 인쇄**한다 — 커버리지 축 관측을 지우지 않는다 (§A10.10).
    console.log(
      `\nG6 진단 (게이트 아님) — 구름 ON 박명 호 rim 기여 ${r.twilightLimb.rim} (N=${r.twilightLimb.n}) · 구름 OFF ${rOff.twilightLimb.rim} (N=${rOff.twilightLimb.n})`,
    );
    const consoleErrors = [...pageOn.consoleErrors, ...pageOff.consoleErrors];
    console.log(
      `consoleErrors: ${consoleErrors.length} (구름 ON ${pageOn.consoleErrors.length} · 구름 OFF ${pageOff.consoleErrors.length})${consoleErrors.length ? ` — ${JSON.stringify(consoleErrors.slice(0, 5))}` : ''}`,
    );

    // ── 「측정 불가」 판정 (게이트보다 **먼저**) — 두 쌍 각각 + OFF 페이지 구름 부재 ──
    const unmeasurable = [...premises(r, '구름 ON', false), ...premises(rOff, '구름 OFF', true)];
    if (offPageHasCloud)
      unmeasurable.push(
        `(5) ?clouds=off 페이지에 ${CLOUD_MESH_NAME} mesh 가 있다 — G6 가 구름 OFF 프레임을 재지 않는다`,
      );

    if (unmeasurable.length) {
      console.error('\n[측정 불가] 유효성 전제 미충족 — PASS 도 FAIL 도 내지 않는다 (§A8.8):');
      for (const u of unmeasurable) console.error(`  - ${u}`);
      return EXIT_UNMEASURABLE;
    }
    console.log(
      '[측정 불가 판정] 발화 0 — 유효성 전제 전건 충족 (두 쌍 각 4항 + OFF 페이지 구름 부재)',
    );

    if (MODE === 'profile') {
      console.log('\n[profile] 진단 전용 모드 — 게이트 미판정.');
      return 0;
    }

    // ── 게이트 (G1~G4 = 구름 ON 쌍 · G6 = 구름 OFF 쌍 · G7 = 두 페이지 합 — G5 결번) ──
    const gaps = {
      g1: r.dayLimb.rim - r.nightLimb.rim,
      g2: r.dayLimb.rim,
      g3: r.dayLimb.rim - r.dayInner.rim,
      g4: r.dayLimb.satOff - r.dayLimb.satOn,
      g6: rOff.twilightLimb.rim,
    };
    const results = [
      [
        'G1 낮면 림 − 밤면 림',
        gaps.g1,
        `>= ${G1_MIN_DAY_NIGHT_GAP}`,
        gaps.g1 >= G1_MIN_DAY_NIGHT_GAP,
      ],
      ['G2 낮면 림 rim 기여', gaps.g2, `>= ${G2_MIN_DAY_RIM}`, gaps.g2 >= G2_MIN_DAY_RIM],
      [
        'G3 낮면 림 − 낮면 내부',
        gaps.g3,
        `>= ${G3_MIN_LIMB_INNER_GAP}`,
        gaps.g3 >= G3_MIN_LIMB_INNER_GAP,
      ],
      [
        'G4 낮면 림 채도 감소량',
        gaps.g4,
        `<= ${G4_MAX_SATURATION_DROP}`,
        gaps.g4 <= G4_MAX_SATURATION_DROP,
      ],
      // G5 는 결번이다 (위 상수 블록 참조). 번호를 당겨 쓰지 않는다 — M-5 결번과 같은 처분으로,
      // 리뷰 이력의 「G5」가 다른 술어를 가리키게 되는 혼선을 막는다.
      [
        'G6 박명 호 rim 기여 (구름 OFF 페이지)',
        gaps.g6,
        `>= ${G6_MIN_TWILIGHT_RIM}`,
        gaps.g6 >= G6_MIN_TWILIGHT_RIM,
      ],
    ];
    // G7 — 런타임 콘솔 에러 (**두 페이지 합** — #1215 §A10.10). 인쇄만 하고 판정하지 않으면 「측정은
    // 했는데 아무도 안 본다」가 된다. 재는 것은 rim 이 아니라 **측정이 성립한 런타임인가**이며, 픽셀
    // 게이트가 전건 초록인 채로 WebGL 셰이더 컴파일 경고·예외가 나는 상태를 통과시키지 않는다.
    results.push([
      'G7 런타임 콘솔 에러 수 (두 페이지 합)',
      String(consoleErrors.length),
      '== 0',
      consoleErrors.length === 0,
    ]);

    console.log('\n=== 게이트 ===');
    let anyFail = false;
    for (const [name, value, cond, ok] of results) {
      const v = typeof value === 'number' ? value.toFixed(5) : value;
      console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name} = ${v}  (${cond})`);
      if (!ok) anyFail = true;
    }
    exitCode = anyFail ? 1 : 0;
    console.log(
      anyFail ? '\n[FAIL] 게이트 미충족' : `\n[PASS] 게이트 ${results.length}종 전건 충족`,
    );
  } finally {
    await browser.close();
  }
  return exitCode;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
