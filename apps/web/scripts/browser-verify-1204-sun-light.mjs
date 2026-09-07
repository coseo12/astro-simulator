#!/usr/bin/env node
/**
 * #1204 회귀 가드 — tier 전환 시 `sun-light` PointLight 가 floating origin 재앵커를 따라오는지.
 *
 * ## 무엇이 깨졌었나
 *
 * `setTier` 는 origin/scale 을 바꾼 뒤 **mesh.position 을 즉시 재계산**한다 (`solar-system-scene.ts`
 * 의 tier-transition 즉시 재계산 블록). 그런데 그 블록은 mesh 와 ring-anchor 만 다시 썼고
 * **`sunLight.position` 은 건드리지 않았다**. `updateAt` 은 세 대상을 모두 같은 origin 으로 쓰지만
 * `timeChanged` 이벤트 바인딩이라 (`sim-canvas.tsx` 의 `instance.on('timeChanged', …)`) tier 전환
 * 프레임에는 이미 지나간 뒤다. 결과적으로 전환 직후의 draw 는 **구 origin 기준 광원 좌표**를 본다.
 *
 * T2 inner 에서 origin 은 `[0,0,0]` 이고 태양은 Heliocentric 원점 근처라 `sunLight.position ≈ 0`
 * 이 **정상**이다. T3 body 진입은 origin 을 focus body 로 옮기므로 광원은 `(sunWorld − focusWorld)
 * × renderScale` 로 재계산되어야 하는데, 재계산이 없으면 `≈ 0` 이 그대로 남는다. 같은 프레임에
 * focus body mesh 는 원점으로 이동하므로 셰이더가 받는
 * `uSunDirection = normalize(sunPos − meshAbsPos)` 의 피연산자 둘이 **동시에 원점**이 되어
 * 방향이 **영벡터**가 된다. 셰이더가 이 값을 받으면 `ndl = dot(N, 0) ≡ 0` 이다.
 *
 * ⚠️ **본 가드는 「화면이 어둡다」를 재지 않는다.** 여기서 지키는 불변식은 **광원이 mesh 와 같은
 * 기준계에 있다**까지다.
 *
 * ⚠️ **draw 도달 여부는 아래 두 시나리오에서 반대다** (PR #1206 리뷰 B1 정정 — 초판 헤더는
 * `pause` 관측을 재현 경로 전체의 사실로 적었다). 절차 머티리얼 `onBindObservable` 에 셰이더와
 * 같은 두 입력을 걸어 계측한 독립 두 세션(reviewer / dev)이 일치했다:
 *  - `play`  : `earth` 가 관측 전 프레임 `isVisible=true`, 매 프레임 bind. 결함 주입판에서
 *              **영벡터가 bind 시점에 도달**했다 (두 세션 각각 1 회, `tier="body"`/`mesh="earth"`).
 *  - `pause` : [#1205 이전] `earth` 가 전 프레임 `isVisible=false`, `earth-lod-low` 만 그려져
 *              bind **0 회**였다. 영벡터가 draw 에 도달하지 않았고, 캔버스 중앙 휘도도
 *              결함판·수정판이 같았다.
 * 갈렸던 이유는 구조다 — LOD 가시성 선택도 `updateAt` 안(P11-B #289 hook)이라 `speed=0` 이면
 * 광원뿐 아니라 **LOD 도 함께 동결**됐다. `pause` 에서 절차 표면이 안 그려지던 것은 **#1205 에서
 * 닫혔고**, 본 가드는 그것을 판정하지 않는다 (판정 술어는 좌표 축 그대로).
 *
 * ## 무엇을 재는가 (술어)
 *
 * 매 프레임 `sunLight.position` 과 focus body 의 `getAbsolutePosition()` 을 기록하고, 그 차의
 * **길이**(정규화 전)를 본다. 이 두 값은 `procedural-planet-shader.ts` 의 `onBindObservable` 이
 * `uSunDirection` 을 만들 때 쓰는 것과 **같은 두 입력**이다 (`sunPositionProvider` 가
 * `sunLight.position` 을 그대로 반환). 관측 시점은 앱의 `onBeforeRender` 핸들러(그 안에서
 * `updateTierByCamera` → `setTier` 가 발동한다)보다 **뒤에** 등록한 observer 이고, 그 시점부터
 * 실제 draw 까지 `sunLight.position` 을 바꾸는 경로는 없다 (`updateAt` 은 `scene.render()` 밖).
 * 따라서 여기 기록된 값은 그 프레임의 셰이더가 받은 값이다.
 *
 * ⚠️ **`uSunDirection` 유니폼을 GPU 에서 읽어오지는 않는다** — 위 등가성으로 대신한다. 등가성이
 * 깨지는 경우(예: 광원 위치 산출 경로가 추가로 갈라짐)는 본 가드의 사각이다.
 *
 * 판정 축 2개 (둘 다 만족해야 exit 0):
 *  1. 관측된 모든 프레임에서 `|sunPos − meshAbsPos| > 0`. 한 프레임이라도 0 이면 exit 1.
 *  2. 두 시나리오 통틀어 **콘솔 에러 0 건** (`hasSimErrors` 1차 엄격 정책 — #848 선례와 동일
 *     SSoT 헬퍼). 초판은 에러를 모으기만 하고 출력만 했다(PR #1206 리뷰 R4). tier 전환은 카메라·
 *     LOD·origin 이 한 프레임에 동시에 움직이는 지점이라 「영벡터는 아니지만 던지고 있다」가
 *     통과하면 안 된다. 판별력은 앱에 `console.error` 를 1 건 주입해 `exit 1` 로 실증했다.
 *
 * ⚠️ **「고리가 사라졌다」/「지구가 밝다」는 판정 축이 아니다** — 그것은 셰이더 분기로도 만들 수
 * 있고 (#1204 본문이 금지한 처방) 원인을 남긴 채 증상만 지운다.
 *
 * 재현 경로는 **실제 휠 입력** 이어야 한다. `camera.radius` 직접 대입은 `updateTierByCamera` 의
 * 히스테리시스/lock 경로를 건너뛰어 전환이 일어나지 않을 수 있다.
 *
 * 사용법:
 *   node apps/web/scripts/browser-verify-1204-sun-light.mjs
 *   HEADFUL=1 node ...                 # 실 Chrome GUI
 *   BASE_URL=http://localhost:3001 ... # 포트 변경
 */

import {
  bootstrapScene,
  collectConsoleErrors,
  hasSimErrors,
  resolveBaseUrl,
  withBrowser,
  buildLaunchOptions,
} from '../../../scripts/browser-verify-utils.mjs';

const FOCUS_BODY = 'earth';
/**
 * qa 실측 재현 경로 — 휠 -100 (#1204 본문). 본문은 8틱이라고 적었으나 진입 틱 수는 초기
 * 카메라 radius 와 focus 정착 상태에 따라 달라진다 (로컬 실측 19틱). 틱 수를 고정하지 않고
 * **body tier 진입까지** 휠을 계속 보내고, 진입하지 못하면 판별력 0 으로 FAIL 한다.
 */
const WHEEL_DELTA = -100;
const WHEEL_TICKS_MAX = 40;
/** 각 틱 후 프레임이 흐르도록 대기 (ms). 전환 tween 300ms + lock 500ms 를 덮는다. */
const TICK_SETTLE_MS = 220;
/** 마지막 틱 이후 정착 관측 (ms) — 전환이 자기치유하는지/영구인지 둘 다 본다. */
const FINAL_SETTLE_MS = 1500;

/**
 * 두 시나리오를 모두 돈다. 지속 시간이 **시간 재생 여부에 종속**되기 때문이다.
 *  - `play`  : 기본 (`timeScale` 86400). `updateAt` 이 `timeChanged` 로 매 프레임 발동하므로
 *              전환 다음 프레임에 광원이 정정된다 → 영벡터는 **1 프레임**(암전 플래시).
 *  - `pause` : `?speed=0`. `TimeController.tick` 이 `scale === 0` 에서 false 를 반환해
 *              `timeChanged` 가 발동하지 않는다 → `updateAt` 이 영영 안 돌고 영벡터가 **지속**된다.
 * 두 시나리오의 프레임 수 차이가 곧 그 종속성의 증거다.
 *
 * ⚠️ **#1205 이후 `pause` 시나리오의 성격이 바뀌었다 (판정 술어는 불변).** 위 서술 중
 * *"`updateAt` 이 영영 안 돈다"* 는 **여전히 참**이고 광원 즉시-동기의 필요성도 그대로다 —
 * `syncSunLightPosition` 은 시간 위상에 남아 있다. 바뀐 것은 **LOD** 다: #1205 가 LOD 판정을
 * 프레임 위상으로 분리해 `pause` 에서도 focus body 가 high LOD 로 착지한다. 즉 아래 §무엇을
 * 재는가 의 `pause` 관측(*"`earth` 가 전 프레임 `isVisible=false`, bind 0 회"*)은 **#1205
 * 이전에만 참**이며, 이제는 영벡터가 실제로 draw 에 닿을 수 있으므로 본 가드가 지키는 대역이
 * 넓어졌다. [실측] #1205 수정판에서 두 시나리오 모두 영벡터 프레임 `0`, exit 0.
 * ADR `docs/decisions/20260907-1205-frame-phase-vs-time-phase.md` §결정 5.
 */
const SCENARIOS = [
  { name: 'play', query: `/?gpu=a&focus=${FOCUS_BODY}` },
  { name: 'pause', query: `/?gpu=a&focus=${FOCUS_BODY}&speed=0` },
];

async function runScenario(browser, baseUrl, scenario, errors) {
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    collectConsoleErrors(page, { errors });

    await bootstrapScene(page, {
      baseUrl,
      query: scenario.query,
      settleMs: 2500,
    });

    // 프레임별 기록기 설치. 앱의 onBeforeRender 핸들러보다 뒤에 등록되므로 같은 프레임의
    // setTier 결과가 반영된 상태를 본다.
    await page.evaluate((focusBody) => {
      const solar = window.__solarScene;
      const mesh = solar.meshes.get(focusBody);
      const scene = mesh.getScene();
      const light = scene.getLightByName('sun-light');
      const samples = [];
      window.__1204 = samples;
      scene.onBeforeRenderObservable.add(() => {
        const m = mesh.getAbsolutePosition();
        const p = light.position;
        const dx = p.x - m.x;
        const dy = p.y - m.y;
        const dz = p.z - m.z;
        samples.push({
          tier: solar.getTier(),
          len: Math.hypot(dx, dy, dz),
          light: [p.x, p.y, p.z],
          mesh: [m.x, m.y, m.z],
        });
      });
    }, FOCUS_BODY);

    // 캔버스 위로 마우스를 옮긴 뒤 실제 휠 입력.
    const box = await page.locator('canvas').first().boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

    let enteredAtTick = null;
    for (let i = 0; i < WHEEL_TICKS_MAX; i += 1) {
      await page.mouse.wheel(0, WHEEL_DELTA);
      await page.waitForTimeout(TICK_SETTLE_MS);
      const tier = await page.evaluate(() => window.__solarScene.getTier());
      if (tier === 'body') {
        enteredAtTick = i + 1;
        break;
      }
    }
    await page.waitForTimeout(FINAL_SETTLE_MS);

    const out = await page.evaluate(() => {
      const s = window.__1204;
      const zero = [];
      for (let i = 0; i < s.length; i += 1) {
        if (!(s[i].len > 0)) zero.push({ frame: i, ...s[i] });
      }
      const tiers = [...new Set(s.map((x) => x.tier))];
      return {
        frames: s.length,
        tiers,
        zeroFrames: zero.slice(0, 10),
        zeroCount: zero.length,
        minLen: s.reduce((a, x) => Math.min(a, x.len), Infinity),
        last: s[s.length - 1],
      };
    });
    await page.close();
    return { ...out, enteredAtTick };
  }
}

async function main() {
  const baseUrl = resolveBaseUrl();
  const errors = [];
  let failed = false;

  await withBrowser(buildLaunchOptions(), async (browser) => {
    for (const scenario of SCENARIOS) {
      const r = await runScenario(browser, baseUrl, scenario, errors);
      console.log(`\n── 시나리오 ${scenario.name} (${scenario.query}) ──`);
      console.log('  body tier 진입 틱:', r.enteredAtTick ?? '(미진입)');
      console.log('  tiers 관측:', r.tiers.join(' → '));
      console.log('  프레임 수:', r.frames);
      console.log('  |sunPos − meshAbsPos| 최소:', r.minLen);
      console.log('  영벡터 프레임 수:', r.zeroCount);
      if (r.zeroCount > 0) {
        console.log('  첫 영벡터:', JSON.stringify(r.zeroFrames[0]));
      }
      console.log('  마지막 프레임:', JSON.stringify(r.last));

      // tier 전환이 실제로 일어나지 않았으면 가드가 아무것도 재지 못한 것 — 통과로 위장 금지.
      if (!r.tiers.includes('body')) {
        console.error(`  [FAIL] ${scenario.name}: body tier 진입 미관측 — 판별력 0.`);
        failed = true;
      } else if (r.zeroCount > 0) {
        console.error(
          `  [FAIL] ${scenario.name}: #1204 재현 — 광원 방향이 ${r.zeroCount} 프레임에서 영벡터.`,
        );
        failed = true;
      } else {
        console.log(`  [PASS] ${scenario.name}: 전 프레임에서 광원 방향이 영벡터가 아니다.`);
      }
    }
  });

  // 판정 축 2 — 콘솔 에러. `hasSimErrors` 기본(1차 엄격)은 「1건이라도 있으면 실패」다.
  if (errors.length > 0) {
    console.log(`\n콘솔 에러 ${errors.length}건:`);
    for (const e of errors.slice(0, 10)) console.log(`  ${e}`);
  }
  if (hasSimErrors(errors)) {
    console.error(`\n  [FAIL] 콘솔 에러 ${errors.length}건 — 판정 축 2 위반.`);
    failed = true;
  }

  if (failed) {
    process.exitCode = 1;
    return;
  }
  console.log('\n[PASS] 전 시나리오 통과.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
