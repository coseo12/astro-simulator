#!/usr/bin/env node
/**
 * #1205 회귀 가드 — 일시정지(`speed=0`) 중에도 LOD 가 카메라에 반응하는가.
 *
 * ## 무엇이 깨졌었나
 *
 * `runLodPass` 의 유일 호출부가 `solar-system-scene.ts` 의 `updateAt` 안이었고, `updateAt` 은
 * `sim-canvas.tsx` 의 `instance.on('timeChanged', …)` 바인딩이다. `TimeController.tick` 은
 * `!running || scale === 0` 에서 `false` 를 반환하므로 **일시정지에서는 `timeChanged` 가 아예
 * 발화하지 않고 `updateAt` 이 한 번도 돌지 않는다.** LOD 는 카메라 종속인데 시간 위상에 얹혀
 * 있었던 것이다.
 *
 * 결과: `?speed=0` 에서 focus 를 바꾸거나 줌을 해도 LOD 결정이 **부팅 직후 1 회 값에 얼어붙는다.**
 * 사용자에게는 「지구에 들어갔는데 절차 표면 없는 단색 빌보드로 남는다」로 보인다 — #756 이래
 * 누적된 시각 자산(대륙 마스크·biome·극관·바다 깊이색·대기 rim)이 전부 high/mid variant 전용이라
 * 그 누적분을 통째로 못 본다.
 *
 * 수정은 `runLodPass` 를 **프레임 위상**(`runFramePass`)으로 분리해 렌더 루프가 매 프레임 1회
 * 구동하게 한 것이다. ADR `docs/decisions/20260907-1205-frame-phase-vs-time-phase.md`.
 *
 * ## 무엇을 재는가 (술어 P-R = (가) ∧ (나) — 두 다리 모두 필요조건)
 *
 * ```
 * (가) 비퇴화   : 일시정지 중 카메라를 A→B 로 옮기면 getLodStats() 분포가 변한다 (변화량 ≥ 1 body)
 * (나) 경로무관 : D_pause(A→B) === D_init(B)      # D_init = B 에서 직접 부팅 후 정착한 분포
 * ```
 *
 * **왜 둘 다인가.**
 *
 * - **(가) 가 판별력을 전담한다.** 결함 문장(*"일시정지 중 LOD 갱신이 멈춘다"*)의 **문자 그대로의
 *   부정**이라 결함 보유판에서 반드시 FAIL 한다. [실측] 결함 보유 rev(`1a21d85`)에서
 *   `D_A = D_pause(B) = {high:0, mid:0, low:32}` — 변화량 `0` 으로 FAIL.
 * - **(나) 단독은 결함 보유판에서 통과한다.** 두 조건이 **둘 다 일시정지**라 결함판에서는 양쪽이
 *   같은 퇴화 상수로 수렴하기 때문이다: 부팅 시 `timeChanged` 가 1 회 emit 되고 (`simulation-core.ts`
 *   의 `engineReady` 직후) 결함판의 LOD 는 그 1 회 값에 고정되는데, focus tween 은 Babylon
 *   `Animation` = `scene.animate()` 구동이라 **sim time 과 무관하게 완주한다**. 즉 카메라는 B 에
 *   도달하고 LOD 만 안 따라온다 → `D_pause(B) === D_init(B)` 가 성립한다.
 *   [실측] 결함 보유 rev 에서 (나) 는 `PASS` 였다 (`0/0/32 === 0/0/32`). 이 저장소가 반복해 밟은
 *   **#1123 「신설 e2e 가 결함 보유판에서도 전건 통과」**의 재생산이므로 (나) 를 정본으로 쓰면 안 된다.
 * - **(나) 는 계약 폭을 담당한다.** 계약 문면은 *"일시정지가 LOD 결정에 영향을 주지 않는다"* 이고,
 *   (가) 만으로는 「아무 값으로나 변해도 통과」라 폭이 모자란다.
 *
 * ⚠️ **P-R 의 잔여 사각**: 두 다리 모두 「일시정지 대 일시정지」다. 일시정지 LOD 가 자기들끼리는
 * 일관되면서 **재생 LOD 와 계통 편차**를 갖는 결함은 P-R 을 통과한다. 그 사각은 tier 전환 프레임의
 * 1 프레임 위상차이며, ADR §재검토 조건 6 에 escalation 경로와 함께 유예로 박제돼 있다.
 *
 * ⚠️ **B 는 이산 focus 대상으로만 구성 가능하다.** 카메라 위치/`radius` 를 지정하는 URL 파라미터가
 * 없고 (`apps/web/src` 전수: `gpu` `lod` `belt` `focus` `speed` `rotate` `orbits` … 카메라 좌표 없음),
 * `camera.radius` 직접 대입은 `browser-verify-1204-sun-light.mjs` 가 *"재현 경로는 실제 휠 입력이어야
 * 한다"* 로 이미 금지 사유를 박제했다 (`updateTierByCamera` 히스테리시스/lock 우회).
 *
 * ⚠️ **`rotate=off` 는 무해한 디테일이 아니다.** `focusOn` 의 착지 `radius` 는
 * `boundingSphere.radiusWorld` 에서 나오는데 이 값이 자전에 따라 변한다 ([실측] earth `rotate=on`
 * 에서 `8.8978~12.3299`, max/min `1.3857` / `rotate=off` 에서 `7.3654` 고정 — 회전한 AABB 대각
 * 오염). 자전을 켜 두면 (나) 의 두 세션이 **서로 다른 거리**에서 비교돼 술어가 무의미해진다.
 * 그래서 아래 §전제 검사가 두 세션의 `radius` 일치를 **판정 전에** 확인하고, 어긋나면 판별력 `0`
 * 으로 FAIL 시킨다 (초록 위장 차단).
 *
 * ## 판정 축 (전건 만족해야 exit 0)
 *
 *  1. **전제** — 두 세션의 `tier` 일치 + `radius` 상대차 < 1e-6 + `getLodStats().fading === 0`.
 *     하나라도 어긋나면 비교 자체가 성립하지 않으므로 **판별력 0 으로 FAIL**.
 *  2. **(가)** 비퇴화 — `D_A !== D_pause(B)`
 *  3. **(나)** 경로무관 — `D_pause(B) === D_init(B)`
 *  4. **콘솔 에러 0 건** (`hasSimErrors` 1차 엄격 정책 — #848/#1204 선례와 동일 SSoT 헬퍼).
 *
 * ⚠️ **「focus body 가 high 다」 단독은 기각된 술어다.** 부팅 시퀀스가 정지 전에 정착해 버리면
 * 결함판에서도 통과한다 (#1123 판별력 0 재생산).
 *
 * ⚠️ **판정 불가량**: 절차 머티리얼 `onBindObservable` 호출 횟수 (세션마다 `447`/`435` 로 흔들린다)
 * / 프레임 수 / 절대 fps.
 *
 * 사용법:
 *   node apps/web/scripts/browser-verify-1205-pause-lod.mjs
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

/** A = 출발 focus (개요에 가까운 넓은 시야), B = 도착 focus. 둘 다 이산 focus 대상. */
const FOCUS_A = 'sun';
const FOCUS_B = 'earth';
/**
 * 공통 쿼리 꼬리. `speed=0` 이 결함 조건이고, `rotate=off` 는 위 헤더의 자전 위상 오염 차단,
 * `gpu=a` 는 형제 가드(`browser-verify-1204-sun-light.mjs`)와 동일한 렌더러 선택이다.
 */
const QUERY_TAIL = 'speed=0&rotate=off';
/** 부팅 후 초기 정착 (LOD variant lazy-create + 셰이더 컴파일 포함). */
const BOOT_SETTLE_MS = 4000;
/** focus 전환 후 정착 상한. tween(수백 ms) + variant lazy-create 컴파일 stall([실측] ~0.4s) 을 덮는다. */
const FOCUS_SETTLE_MAX_MS = 12_000;
/** 정착 판정 — 이 간격으로 표본을 떠서 연속 3회 동일하면 정착. */
const SETTLE_POLL_MS = 200;
const SETTLE_STABLE_SAMPLES = 3;
/** 두 세션 radius 동일 판정 임계 (상대차). 소수 넷째 자리까지 같으면 통과. */
const RADIUS_REL_EPS = 1e-6;

const readState = (page) =>
  page.evaluate(() => {
    const solar = window.__solarScene;
    const scene = solar.meshes.get('earth').getScene();
    const stats = solar.getLodStats();
    return {
      dist: `${stats.high}/${stats.mid}/${stats.low}`,
      fading: stats.fading,
      override: stats.override,
      tier: solar.getTier(),
      radius: scene.activeCamera.radius,
    };
  });

/** 카메라 radius + LOD 분포가 연속 N 회 동일해질 때까지 대기. 상한 초과 시 마지막 상태 반환. */
async function settle(page, label) {
  const start = Date.now();
  let last = null;
  let stable = 0;
  while (Date.now() - start < FOCUS_SETTLE_MAX_MS) {
    await page.waitForTimeout(SETTLE_POLL_MS);
    const cur = await readState(page);
    const same =
      last !== null &&
      last.dist === cur.dist &&
      last.tier === cur.tier &&
      Math.abs(last.radius - cur.radius) < 1e-9 &&
      cur.fading === 0;
    stable = same ? stable + 1 : 0;
    last = cur;
    if (stable >= SETTLE_STABLE_SAMPLES) return { ...cur, settledMs: Date.now() - start };
  }
  console.warn(`[1205] ${label}: 정착 상한 ${FOCUS_SETTLE_MAX_MS}ms 초과 — 마지막 표본으로 진행`);
  return { ...last, settledMs: Date.now() - start, settleTimedOut: true };
}

const errors = [];
const failures = [];
const notes = [];

await withBrowser(buildLaunchOptions(), async (browser) => {
  const baseUrl = resolveBaseUrl();

  // ── 세션 1: A 에서 일시정지로 부팅 → B 로 focus 이동 ───────────────────────────
  const pageAB = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  collectConsoleErrors(pageAB, { errors });
  await bootstrapScene(pageAB, {
    baseUrl,
    query: `/?gpu=a&focus=${FOCUS_A}&${QUERY_TAIL}`,
    settleMs: BOOT_SETTLE_MS,
  });
  const stateA = await settle(pageAB, `A(${FOCUS_A})`);
  await pageAB.evaluate(
    (body) => window.__simCore.command({ type: 'focusOn', bodyId: body }),
    FOCUS_B,
  );
  const statePauseB = await settle(pageAB, `pause A→B(${FOCUS_B})`);
  await pageAB.close();

  // ── 세션 2: B 에서 일시정지로 직접 부팅 ────────────────────────────────────────
  const pageB = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  collectConsoleErrors(pageB, { errors });
  await bootstrapScene(pageB, {
    baseUrl,
    query: `/?gpu=a&focus=${FOCUS_B}&${QUERY_TAIL}`,
    settleMs: BOOT_SETTLE_MS,
  });
  const stateInitB = await settle(pageB, `init B(${FOCUS_B})`);
  await pageB.close();

  notes.push(
    `A(${FOCUS_A})      dist=${stateA.dist} tier=${stateA.tier} r=${stateA.radius.toFixed(4)} fading=${stateA.fading}`,
    `pause A→B          dist=${statePauseB.dist} tier=${statePauseB.tier} r=${statePauseB.radius.toFixed(4)} fading=${statePauseB.fading}`,
    `init  B            dist=${stateInitB.dist} tier=${stateInitB.tier} r=${stateInitB.radius.toFixed(4)} fading=${stateInitB.fading}`,
  );

  // ── 판정 1: 전제 (비교 성립 조건). 어긋나면 판별력 0 → FAIL ────────────────────
  for (const [label, s] of [
    ['A', stateA],
    ['pause A→B', statePauseB],
    ['init B', stateInitB],
  ]) {
    if (s.fading !== 0) {
      failures.push(`전제 위배 — ${label} 이 fade 미정착 (fading=${s.fading}). 판별력 0.`);
    }
    if (s.settleTimedOut) {
      failures.push(`전제 위배 — ${label} 정착 상한 초과 (${s.settledMs}ms). 판별력 0.`);
    }
  }
  if (statePauseB.tier !== stateInitB.tier) {
    failures.push(
      `전제 위배 — 두 세션 tier 불일치 (pause A→B=${statePauseB.tier}, init B=${stateInitB.tier}). ` +
        `다른 거리에서 비교하면 (나) 는 무의미하다. 판별력 0.`,
    );
  }
  const relDiff =
    Math.abs(statePauseB.radius - stateInitB.radius) / Math.max(Math.abs(stateInitB.radius), 1e-12);
  if (!(relDiff < RADIUS_REL_EPS)) {
    failures.push(
      `전제 위배 — 두 세션 radius 불일치 (pause A→B=${statePauseB.radius}, init B=${stateInitB.radius}, ` +
        `상대차 ${relDiff.toExponential(3)} ≥ ${RADIUS_REL_EPS}). 판별력 0.`,
    );
  }

  // ── 판정 2: (가) 비퇴화 — 판별력 전담 다리 ────────────────────────────────────
  if (stateA.dist === statePauseB.dist) {
    failures.push(
      `(가) 비퇴화 FAIL — 일시정지 중 A→B 이동에도 LOD 분포가 불변 (${stateA.dist}). ` +
        `프레임 위상이 돌지 않아 결정이 얼어붙었다 (#1205 원 결함).`,
    );
  }

  // ── 판정 3: (나) 경로무관 — 계약 폭 담당 다리 ─────────────────────────────────
  if (statePauseB.dist !== stateInitB.dist) {
    failures.push(
      `(나) 경로무관 FAIL — D_pause(A→B)=${statePauseB.dist} !== D_init(B)=${stateInitB.dist}. ` +
        `일시정지가 LOD 결정에 영향을 주고 있다.`,
    );
  }
});

// ── 판정 4: 콘솔 에러 ───────────────────────────────────────────────────────────
const simErrors = hasSimErrors(errors) ? errors : [];
if (simErrors.length > 0) {
  failures.push(`콘솔 에러 ${simErrors.length} 건`);
}

console.log('\n=== #1205 pause LOD 가드 ===');
for (const n of notes) console.log(`  ${n}`);
if (errors.length > 0) {
  console.log(`  콘솔 에러 ${errors.length} 건:`);
  for (const e of errors.slice(0, 5)) console.log(`    - ${e}`);
}

if (failures.length > 0) {
  console.error('\n❌ FAIL');
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = 1;
} else {
  console.log('\n✅ PASS — (가) 비퇴화 ∧ (나) 경로무관 ∧ 콘솔 에러 0');
}
