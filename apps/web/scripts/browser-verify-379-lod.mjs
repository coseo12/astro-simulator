#!/usr/bin/env node
/**
 * #379 fix 회귀 가드 — LOD billboard fallback 비율 + screenCoverage 식 정확성 검증.
 *
 * ADR `docs/decisions/20260502-379-fix-decision.md` §"Phase 1 구현 PR" §"회귀 가드"
 * cross-validate 이견 수용 #3 — 3종 LOD 시나리오 매트릭스 검증.
 *
 * 사용법:
 *   node apps/web/scripts/browser-verify-379-lod.mjs                 # 3종 시나리오 검증
 *   node apps/web/scripts/browser-verify-379-lod.mjs --json           # JSON 결과만 (CI artifact)
 *   node apps/web/scripts/browser-verify-379-lod.mjs --update          # baseline 업데이트
 *
 * 검증 매트릭스 (viewport 정본은 아래 `SCENARIO_A_VIEWPORTS` 배열 — 주석에 계수를 두지 않는다):
 *  - 시나리오 A: T1 default 모바일/데스크톱 viewport × DPR 1/2 매트릭스
 *      → DoD: sun=high 100%, billboard fallback 비율 ≤ `SCENARIO_A_DOD.maxLowRatio`
 *  - 시나리오 B: T3 body focus (지구 / 화성 focus 진입) → focus body=high 보장
 *  - 시나리오 C: asteroid belt sub-pixel scenario (T1 solar 뷰에서 asteroid low billboard 유지)
 *
 * dev 빌드 의존: `window.__solarScene.getLodInfo()` (#388 dev overlay API).
 * production 빌드에서는 `__solarScene` 미노출 → 측정 자체 불가 (호출자에게 dev 서버 사용 안내).
 *
 * 환경변수:
 *   BASE_URL  — 웹 서버 URL (기본 http://localhost:3000)
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * ## CI 배선 ([#1207](https://github.com/coseo12/astro-simulator/issues/1207))
 *
 * `ci.yml` `detect-and-test` 의 브라우저 회귀 가드 구간에 상시 배선돼 있다 (`verify:379-lod`).
 * 도입(#379 / PR #390) 이래 **CI 호출 0 건**이었고, 도입 PR 본문의 *"CI 통합은 별도 follow-up"*
 * 이 집행되지 않은 채 남아 있었다. 어느 워크플로에 거는가의 판단 기준은
 * [`docs/ops/browser-verify-helpers.md`](../../../docs/ops/browser-verify-helpers.md) §CI 배선 이
 * 정본이다 — 본 가드의 판정량은 픽셀이 아니라 **LOD 레벨 분포 + 화면 반지름(px)** 이다.
 *
 * ## 판별력 실측 (#1207, 2026-09-22~23 · rev `1c1254e` · 로컬 dev 서버 headless)
 *
 * 「가드가 있다 ≠ 그 가드가 작동한다」([#1123](https://github.com/coseo12/astro-simulator/issues/1123))
 * 차단을 위해 **앱(`packages/core`)에 변이를 주입**해 시나리오별로 독립 FAIL 을 실증했다.
 * 무주입 대조군은 주입 전·후 모두 `exit 0` (3중 시뮬: positive → negative → recovery).
 *
 * | 변이 (주입 대상 = 앱) | 발화 지점 | 결과 |
 * | --- | --- | --- |
 * | `screenCoverageRadius` edge offset 축을 #379 fix 이전(cameraRight)으로 되돌림 | A `sunHighRatio` 7/8 | `exit 1` |
 * | `lodFromScreenCoverage` 의 focus 강제 high 를 `'low'` 로 반전 | B 2/2 FAIL | `exit 1` |
 * | 픽셀 경계 최하단 반환을 `'high'` 로 | C `high=28 > 5` | `exit 1` |
 * | 픽셀 에스컬레이션 제거 (전부 `'low'`) | A `sunHighRatio 0/8` **+** `maxLowRatio 100%` — **두 다리 동시** | `exit 1` |
 * | **sun 외 전부 `'low'`** (「sun 만 high」 재현 — 2026-09-23 · rev `8b5f2c3` 추가 주입) | A `maxLowRatio 96.9%` **단독** (`sunHighRatio 8/8` 은 PASS) | `exit 1` |
 * | **focus 강제 high 분기를 *삭제*** | — | **`exit 0` — 미검출** |
 *
 * ⚠️ 위 4·5 행은 **서로 다른 것을 실증한다** — 4 행(픽셀 에스컬레이션 제거)은 두 다리가 함께
 * 넘어가므로 어느 한 다리의 단독 발화력도 보이지 못하고, `maxLowRatio` 다리가 혼자 FAIL 을
 * 내는 것은 5 행뿐이다. 임계 각주(`SCENARIO_A_DOD.maxLowRatio`)가 이 구분에 의존한다.
 *
 * ### #1250 추가 주입 (2026-09-23 · rev `23239d5` · 로컬 dev 서버 headless)
 *
 * 아래는 **앱이 아니라 계측 채널**을 무너뜨려 「가드 자신의 공허 통과」를 재현한 것이다. 주입 대상
 * 은 dev API 접근자(`getLodInfo` / `getLodStats`) 와 `lodFromScreenCoverage` 이고, 같은 변이에
 * 대해 개정 **전** 판본과 **후** 판본을 **같은 서버에 연속으로** 돌려 대조했다.
 *
 * | 변이 | 개정 전 | 개정 후 |
 * | --- | --- | --- |
 * | `width < 800` 에서만 `getLodInfo()` → `[]` (A 4/8 cell 측정 실패) | **`exit 0`** — 실패 cell 이 분자·분모에서 동시에 빠져 `sun=high 4/4 (100%)` | `exit 2` (측정 불가 cell = 4) |
 * | `getLodInfo()` → `[]` (A **전건** 실패) | `exit 1` — `totalCells > 0 ? … : 0` 폴백이 `0 >= 1.0` 을 깨 FAIL. ⚠️ **전건 실패는 뚫리지 않았다** | `exit 2` (전제 붕괴를 제품 FAIL 로 보고하지 않는다) |
 * | `width !== 1280` 에서 `getLodStats().low` → `NaN` (A 7/8 cell) | **`exit 0`** — `NaN > maxLowRatio` 가 거짓이라 초기값 `0` 이 그대로 통과 | `exit 2` (측정 불가 cell = 7) |
 * | `width === 1280` **이고 `focus=` 없을 때만** `getLodInfo()` → `[]` (C 의 씬이 빔) | **`exit 0`** — C 는 `lodInfo` 를 받고도 읽지 않고 `lodStats.high` 만 쟀다 (**C = PASS**) | `exit 2` (**C = 측정 불가**) |
 * | `lodFromScreenCoverage` 가 focus 분기 뒤 전부 `'mid'` (C 의 `low` 가 `0`) | C = **PASS** (`high=0/mid=32/low=0` → `0 <= 5`) | C = **FAIL** (`exit 1` — 단언의 주어 부재) |
 * | `getLodInfo()` 에서 `mercury` · `venus` 제거 | **`exit 0`** | **`exit 0` — 미검출 (의도적. 아래 §알려진 사각)** |
 * | `__baselines__/lod-379.json` 을 감춤 | **`exit 0`** — 로그에 `baseline` 토큰 **0 회** | `exit 2` (baseline 부재를 한 줄로 박제) |
 * | baseline 의 `scenarios.A.sunHighRatio` 만 삭제 | **`exit 0`** — 역시 `baseline` 토큰 **0 회** | `exit 2` (비교 입력 결손) |
 *
 * ⚠️ **시나리오 C 는 종료 코드로 단독 대조할 수 없다** — C 의 요청(`/?gpu=a&lod=auto`, 1280×720)은
 * A 의 `1280x720_dpr1` cell 과 **바이트 동일**이라 채널을 C 에만 끊을 수 없다. 그래서 위 3·4 행의
 * 대조는 종료 코드가 아니라 **C 자신의 판정**(PASS → 측정 불가 / PASS → FAIL)으로 읽는다.
 *
 * ⚠️ **시나리오 B 의 재분류가 값을 하는 곳은 위 2 행(전건 실패)이다.** 전건 실패에서 개정 전은 `focus body earth
 * not found` 를 **제품 FAIL** 로 보고했지만, 실제 원인은 `lodInfo` 가 비었다는 **채널 붕괴**였다.
 * B 에 빈 배열 검사를 넣지 않으면 focus body 부재 판정이 그 상태를 그대로 삼킨다.
 *
 * ## 종료 코드 계약 ([#1250](https://github.com/coseo12/astro-simulator/issues/1250))
 *
 * `0` = PASS / `1` = **제품 FAIL** (측정은 됐고 단언이 거짓) / `2` = **측정 불가** (계측 채널이
 * 없거나 값이 판정에 쓸 수 없는 상태 — PASS 도 FAIL 도 아니다). `ci.yml` `detect-and-test` 의
 * 호출부에 `|| true` 가 없으므로 `2` 도 빨강이다.
 *
 * **합성은 확정 FAIL 우선** — 어느 시나리오든 확정 FAIL 이 있으면 `1`, FAIL 이 없고 측정 불가만
 * 있으면 `2`. `browser-verify-391-billboard.mjs` / `browser-verify-818-focus-zoom.mjs` §종료 코드
 * 합성 과 같은 규칙이다. 반대로 두면 제품 결함이 「측정 불가」 뒤로 숨는다 (#1215 MC-9 가 치른 대가).
 *
 * 무엇이 어느 쪽인가의 기준은 **하네스가 통제하는가**다 (#1215 — 전제 ↔ 게이트를 섞지 않는다).
 * ⚠️ 391 의 판정이 그대로 오지 않는다 — 391 은 `error` 가 전부 하네스 전제라 한 줄로 `2` 였지만,
 * 여기서는 **같은 시나리오 안에서도** 갈린다.
 *
 *  - **`__solarScene.getLodInfo()` 미노출 / `lodInfo` 빈 배열** ⇒ `2`. dev 빌드 private API 라는
 *    하네스 전제의 붕괴다. 이 상태에서는 제품이 건강한지 아픈지 **한 비트도 말할 수 없다**.
 *  - **`getLodStats()` 부재 · 계수가 비유한수 · 합계 `0`** ⇒ `2`. 판정량이 **비율**이라 분모가
 *    없으면 다리가 성립하지 않는다. 그냥 두면 `NaN` 비교가 조용히 거짓이 되어 초기값이 통과한다.
 *  - **`sun` / focus body 가 `lodInfo` 에 없음** ⇒ `1`. `lodInfo` 항목은 제품(`runLodPass`)이
 *    만드는 것이고 그 body 는 단언의 **주어 자신**이다. 계측 채널은 멀쩡히 작동해 「그 body 가
 *    없다」고 **답을 준 것**이다. 전제에 넣으면 이 결함이 전제 위반 뒤로 숨는다.
 *  - **시나리오 C 의 `low === 0`** ⇒ `1`. 같은 이유 — 「sub-pixel body 가 low 를 유지한다」의
 *    주어가 `0` 개인 상태이고, 그것을 만드는 것은 제품이다.
 *  - **baseline 파일 부재 / JSON 파손 / `scenarios.A.sunHighRatio` 부재** ⇒ `2`. baseline 은
 *    하네스가 공급하는 산출물이고 `__baselines__/lod-379.json` 은 저장소에 **tracked** 돼 있어
 *    체크아웃이면 항상 존재한다 ⇒ 부재는 정상 상태가 아니다. 반대로 비교가 **발화**하면
 *    (sun=high 가 baseline 대비 5%p 하락) 그것은 제품 회귀 ⇒ `1`.
 *
 * ## 알려진 사각
 *
 * ⚠️ 표제에 계수를 박지 않는다. 「N 종」은 목록이 닫혔다는 인상을 주는데, 그 인상이 상위 집합을
 * 이미 덮은 것처럼 보이게 한 전례가 있다 (#1207 reviewer R8).
 *
 * ### 열려 있는 것
 *
 * ⚠️ **focus 강제 high 분기의 *제거*는 못 잡는다** (위 첫 표 마지막 행). focus 진입 거리에서
 * 지구/화성의 coverage 는 이미 `LOD_PIXEL_THRESHOLDS.high` 를 넘으므로(실측 `74.7px` / `73.9px`)
 * 픽셀 경로가 같은 답을 낸다 — 시나리오 B 는 focus 강제 분기의 *반전*은 잡고 *제거*는 못 잡는다.
 * 그 대역은 `lod.test.ts` 의 단위 테스트가 순수 함수 수준에서 담당한다.
 *
 * ⚠️ **`mercury` · `venus` 는 어느 술어의 주어도 아니다 — 데이터 박제이고, 의도적이다.**
 * `measureLodMatrix` 가 둘의 `level` / `screenCoverage` / `pxDiameter` 를 받아 `cellResults` 에
 * 적고 baseline JSON 으로 흘려보내지만 **읽어서 단언하는 곳이 없다**. 도입 시점의 근거가 저장소에
 * 그대로 남아 있다 —
 *   · 도입 PR [#390](https://github.com/coseo12/astro-simulator/pull/390) 본문 §비-범위:
 *     *"mercury/venus 박제값 (900/650) 환경에서 mid 임계 8 미달 — 식 자체는 정확하나 박제값
 *     영역"* (#385 라운드 3 / Phase 2 로 분리).
 *   · ADR `20260502-379-fix-decision.md` §결과·재검토 조건 4 가 같은 것을 재검토 조건으로 박제.
 *   · 그리고 **반례가 baseline 안에 있다** — `__baselines__/lod-379.json` (2026-05-02, 도입 run)
 *     에서 `mercury` 는 8 cell 중 **6 cell 이 `low`**, `venus` 는 **3 cell 이 `low`** 다. 그때
 *     「mid 이상」 술어를 넣었다면 **도입 PR 자신이 FAIL** 했다.
 *   · 그 상태는 **지금도 그대로**다 (2026-09-23 무주입 실측 — `mercury` `low 6` / `mid 2`,
 *     `venus` `low 4` / `mid 4`). 즉 술어를 지금 추가해도 곧장 FAIL 이고, 그것은 가드 교정이
 *     아니라 박제값 결정(#385 계열)을 여는 일이다.
 * ⇒ [#1250](https://github.com/coseo12/astro-simulator/issues/1250) G4 판정: **술어를 추가하지
 *   않는다.** 추가는 술어 교정이 아니라 DoD 변경이고, 그 결정은 #385 계열(박제값)에 묶여 있다.
 *   대신 이 대역이 비어 있다는 사실을 여기 박제한다.
 * ⚠️ 반면 **`sun` 의 부재는 이미 fail-closed** 다 — `bodyResults.sun?.level ?? 'unknown'` 이
 *   `'high'` 가 아니게 되어 `sunHighRatio` 가 떨어진다(⇒ `1`). 「단언 0 개」는 이 두 body 에만
 *   해당하지 시나리오 A 전체의 성질이 아니다.
 *
 * ⚠️ **`--update` 는 이번 run 의 판정과 무관하게 baseline 을 덮어쓴다.** FAIL·측정 불가 상태에서
 * 불러도 기록되므로 「깨진 상태를 baseline 으로 얼리는」 경로가 열려 있다. `--update` 는 사람이
 * 명시적으로 부르는 갱신 경로라 지금은 막지 않고 여기 적어 둔다 (#1250 비-범위).
 *
 * ### 닫은 것 ([#1250](https://github.com/coseo12/astro-simulator/issues/1250))
 *
 * 전부 [#1201](https://github.com/coseo12/astro-simulator/issues/1201) 클래스(「없음/부재/불변」을
 * 통과로 읽는 술어)다.
 *
 * ✅ **시나리오 A 의 분모 소거.** 종전에는 `measurement.error` 분기가 `totalCells += 1` **앞에서**
 * `continue` 해서 실패 cell 이 분자·분모에서 **동시에** 빠졌다. ⚠️ 다만 **발현 모양이 391 R8 과
 * 같지 않다** (실측 — 위 표 1·2 행). 391 은 `pass = cellsPass === cellsTotal` 이라 전건 실패가
 * `0 === 0` 으로 통과했지만, 여기서는 `totalCells > 0 ? … : 0` 폴백이 전건 실패를
 * `sunHighRatio = 0` 으로 떨어뜨려 `exit 1` 을 냈다. 실제로 뚫린 것은 **부분 실패**다
 * (4 cell 실패 → 남은 `4/4 = 100%` → `exit 0`). ⇒ `cellsAttempted` 를 **측정 시도 직후** 올려
 * 분모를 고정하고, 실패 cell 은 `cellsUnmeasured` 로 따로 세어 측정 불가(`2`)로 보낸다.
 * 전건 실패도 「FAIL」이 아니라 「측정 불가」로 재분류된다 — 값은 같은 빨강이지만 원인이 다르다.
 *
 * ✅ **`maxLowRatio` 다리의 `NaN` 무음 통과.** `lowRatio` 가 `NaN` 이면 `NaN > maxLowRatio` 가
 * 거짓이라 초기값 `0` 이 그대로 남아 `0 <= 0.96` 으로 통과했다. 그 다리는 「sun 만 high」의
 * **유일 방어**(아래 `SCENARIO_A_DOD.maxLowRatio` 각주)이므로 조용한 무력화가 특히 위험하다.
 * ⇒ `lodStatsDefect()` 로 분모의 존재를 **판정 전에** 확인하고, 없으면 그 cell 은 측정 불가다.
 *
 * ✅ **시나리오 C 의 기저 신호 부재.** `lodInfo` 를 받아 놓고 읽지 않은 채 `lodStats.high <= 5`
 * 상한 하나만 쟀다 — 빈 씬(`lodInfo = []`, `lodStats` 전부 `0`)도 `0 <= 5` 로 통과한다.
 * ⇒ (a) `lodInfo` 비어 있음 ⇒ `2`, (b) `lodStats` 분모 결손 ⇒ `2`, (c) `low === 0` ⇒ `1`
 * (단언의 주어 부재 — 제품 속성). 상한 술어 자체와 `HIGH_REGRESSION_LIMIT` 는 그대로다.
 *
 * ✅ **baseline 비교의 3중 무음 단락.** `existsSync` → `null` / `?? null` / `!== null` 게이트가
 * 셋 다 **조용히** 비교를 건너뛰어, 회귀 감지가 통째로 사라져도 로그 한 줄 안 남았다.
 * ⇒ 세 경로 모두 **측정 불가로 승격**하고(위 §종료 코드 계약), 비교를 수행한 경우와 `--update`
 * 로 건너뛴 경우도 **각각 한 줄씩 찍는다**. 「비교했는데 통과」와 「비교 자체가 없었다」가 로그에서
 * 구분되지 않는 것이 이 클래스의 본체였다.
 * ⚠️ 여기에 **분모 고정이 만든 결합**이 하나 딸려 온다 (구현 중 실측으로 드러났다). `sunHighRatio`
 * 의 분모가 측정 시도로 고정되면서, 측정 불가 cell 이 있으면 그 비율은 제품이 아니라 **계측 상태**를
 * 반영한다 — 그대로 비교하면 하락이 「제품 회귀(`1`)」로 보고돼 전제 붕괴가 게이트로 위장한다
 * (실측: 4 cell 채널 차단 → `100% → 50%` → `exit 1`). ⇒ 비교는 **A 가 전 cell 측정에 성공했을
 * 때만** 수행하고, 아니면 입력 결손으로 `2` 다.
 *
 * 남는 축 — **`cellsUnmeasured` 는 `0` 일 때도 출력한다.** 비정상일 때만 보이는 계수는 그 자체가
 * 「재고 있는지 알 수 없는」 상태라, 닫으려던 것과 같은 모양이다 (#1207 E7 과 같은 이유).
 */

import { withBrowser } from '../../../scripts/browser-verify-utils.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const BASELINE_PATH = path.join(__dirname, '__baselines__', 'lod-379.json');
// baseline 대비 sun=high 하락 허용폭. 도입 때부터 쓰던 값을 상수로 꺼낸 것이고 값은 그대로다
// (#1250 G6 — 새 임계 0 개).
const BASELINE_SUN_HIGH_DROP = 0.05;

const args = process.argv.slice(2);
const flags = {
  json: args.includes('--json'),
  update: args.includes('--update'),
};

/**
 * 시나리오 A — T1 default 매트릭스 viewport 정의.
 * forensic 매트릭스 SSoT (`docs/reports/379-forensic/output.json`) 와 동일 viewport 풀에서
 * spot-check 추출 (전체 매트릭스 재측정 비용 절감 — cell 정본은 아래 배열이다).
 * ⚠️ 종전 주석은 "10 cell" 이었으나 배열 원소는 8 개다 (#1207 정정). 계수를 다시 박지 않는다.
 */
const SCENARIO_A_VIEWPORTS = [
  { id: '320x568_dpr1', width: 320, height: 568, dpr: 1, kind: 'mobile-narrow' },
  { id: '375x667_dpr1', width: 375, height: 667, dpr: 1, kind: 'mobile' },
  { id: '375x667_dpr2', width: 375, height: 667, dpr: 2, kind: 'mobile' },
  { id: '414x896_dpr2', width: 414, height: 896, dpr: 2, kind: 'mobile-large' },
  { id: '1280x720_dpr1', width: 1280, height: 720, dpr: 1, kind: 'desktop' },
  { id: '1440x900_dpr1', width: 1440, height: 900, dpr: 1, kind: 'desktop' },
  { id: '1440x900_dpr2', width: 1440, height: 900, dpr: 2, kind: 'desktop' },
  { id: '1920x1080_dpr1', width: 1920, height: 1080, dpr: 1, kind: 'desktop-wide' },
];

const SCENARIO_A_DOD = Object.freeze({
  // sun=high 비율 (모든 cell 에서 sun 이 high LOD 인지)
  sunHighRatio: 1.0, // = 100% (변경 시 ADR §재검토 트리거)
  // billboard fallback 비율 천장. 본 가드는 "sun 만 high 였던 fix 전" 회귀를 막는 것이 1차 목적.
  // mercury/venus mid 진입은 #385 라운드 3 영역 (architect ADR §재검토 #4).
  //
  // ── 여유 실측 (#1207, 2026-09-22~23 · rev `1c1254e` · 로컬 dev 서버 headless · N = 6) ──
  // 무주입 `maxLowRatio` = **`0.875` 6/6 회 동일** (8 cell 전건도 run 간 바이트 동일 — 분산 0).
  //   여유 `0.96 − 0.875 = 0.085` (32 body 기준 `2.7` body 분).
  // ⚠️ 착수 시 인계된 *"여유가 `0.002` 뿐"* 은 **`__baselines__/lod-379.json` (2026-05-02, 24 body)
  //   의 기록값 `0.9583`** 이지 현행 측정치가 아니었다. 그 사이 R-Phase 누적으로 body 가
  //   `24 → 32` 로 늘고 고DPR cell 의 mid 진입이 늘어 분모·분자가 함께 이동했다.
  //   ⇒ #1209 규약의 **재도출 조건 미발동**이라 임계를 **바꾸지 않는다** (새 임계 `0`).
  //
  // ── 임계 배치 (관측 3 점) — 여유는 **양방향**으로 적는다 ──
  //   건강 `0.875`  <  **임계 `0.96`**  <  픽셀 에스컬레이션 제거 변이 `1.000`
  //   건강 쪽 여유 `0.085` / 결함 쪽 여유 `0.00875`. 가장 가까운 결함은 「sun 만 high」
  //   (`high=1 / mid=0 / low=31` → `31/32 = 0.96875`) 이고, 이는 #379 회귀 그 자체의 모양이다.
  //   ✔ 위 여유는 **CI 에서도 같다** — 배선 첫 run (ubuntu · swiftshader, run 35747391865) 의
  //   8 cell 판정값이 로컬 macOS 와 **전건 일치**했다 (`87.5 / 81.3 / 71.9 / 65.6 / 81.3 / 81.3 /
  //   65.6 / 75.0 %`). 즉 이 축은 렌더러 백엔드에 비의존이고, 로컬에서 잰 마진을 CI 가 승계한다.
  //
  // ⚠️ **그 대역을 잡는 것은 본 다리 하나뿐이다 (이중 방어 아님).** 형제 다리 `sunHighRatio` 는
  //   「sun 이 high 인 **cell 의 비율**」이라 (`runScenarioA` 가 `sunLevel === 'high'` 일 때만
  //   `sunHighCount` 를 올린다) sun 자신이 high 인 한 「sun 만 high」에서도 `8/8` PASS 한다.
  //   확인 방법 3 가지 (2026-09-23 · rev `8b5f2c3`) —
  //     (a) **변이 주입 실측**: `lodFromScreenCoverage` 에서 sun 외 전부 `'low'` 로 반환 →
  //         8 cell 전건 `high=1/mid=0/low=31`, `sunHighRatio 8/8 PASS` · `maxLowRatio 96.9% FAIL`
  //         · `exit 1`. 시나리오 B·C 는 PASS 라 **본 다리 단독 발화**다.
  //     (b) **저장소 안 반례 조회**: `__baselines__/lod-379.json` (2026-05-02) 은 8 cell 전건
  //         `high=1` (그중 3 cell 은 `mid=0`) 인데 `"sunHighRatio": 1` · `"pass": true` 로
  //         기록돼 있다 — 그때 통과한 이유는 형제 다리가 아니라 body 가 24 라 `23/24 = 0.9583`
  //         이 임계 아래였기 때문이다. 즉 형제 다리는 그 상태를 **한 번도 막은 적이 없다**.
  //     (c) 판정 결합 확인: `runScenarioA` 의 반환은 `sunHighPass && lowRatioPass` 다.
  // ⚠️ 반대로 **픽셀 에스컬레이션 제거 변이는 단독 발화의 증거가 아니다** — 같은 날 재현에서
  //   `sunHighRatio 0/8 FAIL` **+** `maxLowRatio 100% FAIL` 로 두 다리가 동시에 넘어간다
  //   (전부 `'low'` 면 sun 도 low 다). 그 변이가 보이는 것은 천장 다리가 살아 있다는 사실뿐이다.
  //   ⇒ 본 임계를 완화·삭제하면 「sun 만 high」를 잡는 것이 **아무것도 남지 않는다**.
  //
  // ── 재검토 트리거 (접촉 기준 — CLAUDE.md §`deferred:no-incident` 수명주기 와 같은 관례) ──
  //   판정량이 **비율**이라 body 총수에 종속된다. `high+mid` 가 고정이라면 `low / total` 은 `1` 로
  //   단조 수렴하므로, `high+mid = 4` 고정 가정에서 `96/100 = 0.96` 은 경계 통과이고
  //   `97/101 = 0.9604` 부터 건강 상태가 천장을 넘어 **거짓 발화**한다 (지금 `32`).
  //   ⚠️ **다만 그 「고정」은 예측이고, 저장소의 관측 2 점은 반대 방향이다** (worst cell 기준) —
  //     · 2026-05-02 `__baselines__/lod-379.json`: body `24` · `high+mid = 1` · `maxLowRatio 0.9583`
  //     · 2026-09-23 무주입 실측 (rev `8b5f2c3`): body `32` · `high+mid = 4` · `maxLowRatio 0.875`
  //   body 가 늘 때 `high+mid` 도 **함께** 늘었고 비율은 천장에서 오히려 **멀어졌다**. 2 점이
  //   추세를 보장하지도 않으므로 예측을 사실로 읽지 말고 트리거만 유지한다.
  //   ⚠️ **같은 트리거의 대상이 하나 더 있다 — `HIGH_REGRESSION_LIMIT`** (시나리오 C). 그쪽도
  //   body 총수 결합이고 여유는 더 얇다 (무주입 `high=2` → 여유 `3`). 이미 한 칸 움직였다
  //   (baseline 24 body 의 시나리오 C 는 `high=1`).
  //   ⇒ **body 를 추가하는 R-Phase 에서 본 가드를 건드릴 때** 무주입 분포를 재측정하고 이
  //   각주와 `HIGH_REGRESSION_LIMIT` 주석을 **함께** 갱신한다. 완화는 silent 금지
  //   ([guard-design-principles](../../../docs/lessons/guard-design-principles.md) §2).
  maxLowRatio: 0.96,
});

/**
 * `lodStats` 가 **비율의 분모로 쓸 수 있는 상태인가** 판정 (#1250).
 *
 * `lowRatio = low / (high + mid + low)` 는 계수 하나만 결손돼도 `NaN` 이 되고, `NaN` 비교는
 * 조용히 거짓이라 `maxLowRatio` 가 초기값 `0` 에 머문 채 통과한다 — 판정이 사라진 것이 통과로
 * 보인다. 그래서 **판정 전에** 분모의 존재를 확인하고, 없으면 그 cell 은 PASS 도 FAIL 도 아닌
 * 측정 불가다 (헤더 §종료 코드 계약 — `getLodStats()` 는 dev overlay API = 하네스 전제).
 *
 * @returns {string | null} `null` = 분모 성립 / 문자열 = 측정 불가 사유
 */
function lodStatsDefect(lodStats) {
  if (!lodStats || typeof lodStats !== 'object') {
    return 'lodStats 미노출 (getLodStats 부재 또는 null)';
  }
  for (const key of ['high', 'mid', 'low']) {
    if (!Number.isFinite(lodStats[key])) {
      return `lodStats.${key} 가 유한수가 아님 (${String(lodStats[key])})`;
    }
  }
  const total = lodStats.high + lodStats.mid + lodStats.low;
  if (total <= 0) {
    return `lodStats 합계가 ${total} — 비율의 분모가 없음 (high=${lodStats.high}/mid=${lodStats.mid}/low=${lodStats.low})`;
  }
  return null;
}

async function setupPage(browser, viewport, queryString = '') {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.dpr ?? 1,
  });
  const page = await context.newPage();
  const url = `${BASE_URL}${queryString}`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForFunction(
    () => typeof window.__simCore !== 'undefined' && typeof window.__solarScene !== 'undefined',
    { timeout: 15_000 },
  );
  // 추가 안정 대기 — sun mesh 생성 + 첫 LOD pass 완료.
  await page.waitForTimeout(2200);
  return { context, page };
}

/** 한 viewport 에서 LOD info + lodStats 측정. */
async function measureLodMatrix(page) {
  return await page.evaluate(() => {
    const solar = /** @type {any} */ (window).__solarScene;
    if (!solar || !solar.getLodInfo) return { error: '__solarScene.getLodInfo() 미노출' };
    const lodInfo = solar.getLodInfo();
    if (!lodInfo || lodInfo.length === 0) return { error: 'lodInfo empty (runLodPass 미실행)' };

    const lodStats = solar.getLodStats ? solar.getLodStats() : null;

    // body 별 raw 데이터 박제 (sun/mercury/venus 만 SSoT — forensic 매트릭스 SSoT)
    const targets = ['sun', 'mercury', 'venus'];
    const bodyResults = {};
    for (const id of targets) {
      const entry = lodInfo.find((e) => e.id === id);
      if (entry) {
        bodyResults[id] = {
          level: entry.level,
          screenCoverage: entry.screenCoverage,
          pxDiameter: entry.pxDiameter,
          cameraDistanceMeters: entry.cameraDistanceMeters,
        };
      } else {
        bodyResults[id] = { error: 'body not found in lodInfo' };
      }
    }

    return {
      lodInfoCount: lodInfo.length,
      lodStats,
      bodyResults,
    };
  });
}

async function runScenarioA(browser) {
  console.log('\n=== 시나리오 A — T1 default 매트릭스 검증 ===');
  const cellResults = [];
  let sunHighCount = 0;
  // #1250 — 분모는 **측정 시도**로 고정한다 (종전 `totalCells` 는 측정 성공 cell 만 셌다).
  let cellsAttempted = 0;
  let cellsMeasured = 0;
  let cellsUnmeasured = 0;
  let maxLowRatio = 0;

  for (const viewport of SCENARIO_A_VIEWPORTS) {
    const { context, page } = await setupPage(browser, viewport, '/?gpu=a&lod=auto');
    const measurement = await measureLodMatrix(page);
    // #1250 — 이 줄이 아래 `continue` 보다 **앞**이어야 한다. 종전에는 실패 cell 이 분자와
    // 분모에서 동시에 빠져, 절반이 실패해도 남은 cell 만으로 `100%` 가 나왔다.
    cellsAttempted += 1;
    // 계측 채널 붕괴(`getLodInfo` 미노출 / `lodInfo` 빈 배열) — 제품 건강을 한 비트도 말할 수
    // 없다 ⇒ 측정 불가 (헤더 §종료 코드 계약).
    const defect = measurement.error ?? lodStatsDefect(measurement.lodStats);
    if (defect) {
      cellsUnmeasured += 1;
      console.log(`  ! ${viewport.id}: 측정 불가 — ${defect}`);
      cellResults.push({ viewport: viewport.id, measured: false, error: defect });
      await context.close();
      continue;
    }
    cellsMeasured += 1;
    const { lodStats, bodyResults } = measurement;
    const sunLevel = bodyResults.sun?.level ?? 'unknown';
    if (sunLevel === 'high') sunHighCount += 1;

    const total = lodStats.high + lodStats.mid + lodStats.low;
    const lowRatio = lodStats.low / total;
    if (lowRatio > maxLowRatio) maxLowRatio = lowRatio;

    console.log(
      `  ${viewport.id}: sun=${sunLevel} ` +
        `(coverage=${bodyResults.sun?.screenCoverage?.toFixed(1) ?? 'n/a'}px) | ` +
        `lodStats high=${lodStats.high}/mid=${lodStats.mid}/low=${lodStats.low} ` +
        `(low ratio=${(lowRatio * 100).toFixed(1)}%)`,
    );
    cellResults.push({
      viewport: viewport.id,
      kind: viewport.kind,
      measured: true,
      // ⚠️ mercury / venus 는 **어느 술어의 주어도 아니다** — 데이터 박제다 (헤더 §알려진 사각
      //    §열려 있는 것). 여기 적힌 값은 baseline JSON 으로만 흐른다.
      sun: bodyResults.sun,
      mercury: bodyResults.mercury,
      venus: bodyResults.venus,
      lodStats,
    });
    await context.close();
  }

  // 술어는 그대로다 (#1250 G6 — 새 임계 0 개). 바뀐 것은 분모가 **측정 시도** 계수라는 점과,
  // 측정 실패가 PASS 쪽 잔여로 남지 않는다는 점이다.
  const sunHighRatio = cellsAttempted > 0 ? sunHighCount / cellsAttempted : 0;
  const sunHighPass = sunHighRatio >= SCENARIO_A_DOD.sunHighRatio;
  const lowRatioPass = cellsMeasured > 0 && maxLowRatio <= SCENARIO_A_DOD.maxLowRatio;
  // 「측정된 cell 중 단언이 거짓인 것」만 제품 FAIL 로 센다. 측정 불가분이 두 다리를 끌어내려도
  // 그것은 `1` 이 아니라 `2` 다 (헤더 §종료 코드 계약 — 확정 FAIL 우선의 전제).
  const sunHighFailed = cellsMeasured > 0 && sunHighCount < cellsMeasured;
  const lowRatioFailed = cellsMeasured > 0 && maxLowRatio > SCENARIO_A_DOD.maxLowRatio;

  console.log('\n  --- 시나리오 A 요약 ---');
  console.log(
    `  sun=high 비율: ${sunHighCount}/${cellsAttempted} (${(sunHighRatio * 100).toFixed(1)}%) — ` +
      // 측정 불가 cell 때문에 비율이 내려간 것을 「FAIL」로 적지 않는다 — 측정된 cell 이 전부
      // high 면 이 다리가 본 것은 제품 결함이 아니다 (헤더 §종료 코드 계약).
      `${sunHighPass ? 'PASS' : sunHighFailed ? 'FAIL' : '측정 불가'} ` +
      `(DoD ≥ ${SCENARIO_A_DOD.sunHighRatio * 100}%)`,
  );
  console.log(
    `  최대 low ratio: ${(maxLowRatio * 100).toFixed(1)}% — ` +
      `${lowRatioPass ? 'PASS' : cellsMeasured > 0 ? 'FAIL' : '측정 불가'} ` +
      `(DoD ≤ ${SCENARIO_A_DOD.maxLowRatio * 100}%)`,
  );
  // 0 일 때도 찍는다 — 비정상일 때만 보이는 계수는 「재고 있는지 알 수 없는」 상태와 같다.
  console.log(
    `  측정: ${cellsMeasured}/${cellsAttempted} cell (측정 불가 cell=${cellsUnmeasured})`,
  );

  return {
    pass: cellsUnmeasured === 0 && sunHighPass && lowRatioPass,
    failed: sunHighFailed || lowRatioFailed,
    blocked: cellsUnmeasured > 0 || cellsMeasured === 0,
    sunHighRatio,
    maxLowRatio,
    cellsAttempted,
    cellsMeasured,
    cellsUnmeasured,
    cellResults,
  };
}

/** 시나리오 B — T3 body focus 진입 시 focus body 가 high LOD 인지 검증. */
async function runScenarioB(browser) {
  console.log('\n=== 시나리오 B — T3 body focus high 보장 ===');
  const focusTargets = ['earth', 'mars'];
  const cellResults = [];
  let allPass = true;
  // #1250 — 같은 파일 안에서 종료 코드 계약을 통일한다. B 의 `error` 는 **두 종류**이고 그
  // 둘은 같은 코드로 보낼 것이 아니다 (헤더 §종료 코드 계약).
  let anyFail = false;
  let anyBlocked = false;

  for (const focusId of focusTargets) {
    // ?focus=<id> 로 진입 + ?gpu=a 로 tier-a 강제 (volt #77).
    const { context, page } = await setupPage(
      browser,
      { id: '1280x720_dpr1', width: 1280, height: 720, dpr: 1 },
      `/?gpu=a&focus=${focusId}&lod=auto`,
    );
    // T3 진입 + dolly 안정화 (focus 진입은 추가 transition 시간 필요).
    await page.waitForTimeout(2000);
    const measurement = await page.evaluate((focusId) => {
      const solar = /** @type {any} */ (window).__solarScene;
      // 하네스 전제(dev 빌드 private API) 붕괴 ⇒ 측정 불가.
      if (!solar || !solar.getLodInfo) return { error: 'getLodInfo 미노출', blocked: true };
      const lodInfo = solar.getLodInfo();
      if (!lodInfo?.length) return { error: 'lodInfo empty (runLodPass 미실행)', blocked: true };
      const focusEntry = lodInfo.find((e) => e.id === focusId);
      // focus body 의 부재는 다르다 — `lodInfo` 항목은 제품이 만드는 것이고 그 body 는 본
      // 시나리오 단언의 **주어 자신**이다. 채널은 멀쩡히 「없다」고 답을 준 것이다 ⇒ 제품 FAIL.
      return focusEntry
        ? { focus: focusEntry }
        : { error: `focus body ${focusId} not found in lodInfo`, blocked: false };
    }, focusId);

    if (measurement.error) {
      const label = measurement.blocked ? '측정 불가' : 'FAIL';
      console.log(`  ! focus=${focusId}: ${label} — ${measurement.error}`);
      allPass = false;
      if (measurement.blocked) anyBlocked = true;
      else anyFail = true;
      cellResults.push({
        focus: focusId,
        measured: false,
        blocked: measurement.blocked === true,
        error: measurement.error,
      });
      await context.close();
      continue;
    }
    const focusLevel = measurement.focus.level;
    const pass = focusLevel === 'high';
    if (!pass) {
      allPass = false;
      anyFail = true;
    }
    console.log(
      `  focus=${focusId}: level=${focusLevel} ` +
        `(coverage=${measurement.focus.screenCoverage?.toFixed(1) ?? 'n/a'}px) — ` +
        `${pass ? 'PASS' : 'FAIL'} (focus body 는 항상 high)`,
    );
    cellResults.push({ focus: focusId, measured: true, ...measurement.focus, pass });
    await context.close();
  }

  return { pass: allPass, failed: anyFail, blocked: anyBlocked, cellResults };
}

/** 시나리오 C — asteroid belt sub-pixel body 가 low billboard 유지 (회귀 가드). */
async function runScenarioC(browser) {
  console.log('\n=== 시나리오 C — asteroid belt sub-pixel low 유지 ===');
  // T1 default + asteroid belt 활성화. 기본적으로 활성화돼 있어야 — 만일 다르면 별도 안내.
  const { context, page } = await setupPage(
    browser,
    { id: '1280x720_dpr1', width: 1280, height: 720, dpr: 1 },
    '/?gpu=a&lod=auto',
  );
  const measurement = await page.evaluate(() => {
    const solar = /** @type {any} */ (window).__solarScene;
    if (!solar || !solar.getLodInfo) return { error: 'getLodInfo 미노출' };
    const lodInfo = solar.getLodInfo();
    // #1250 — **기저 신호**. 종전에는 `lodInfo` 를 받아 놓고 읽지 않아, 빈 씬도 `lodStats.high`
    // 상한만으로 통과했다 (`0 <= 5`). 판정의 전제가 성립하는지 먼저 묻는다.
    if (!lodInfo?.length) return { error: 'lodInfo empty (runLodPass 미실행)' };
    // asteroid kind 또는 id prefix 'asteroid' / 'belt'로 식별. 시스템 정의에 따라 다양.
    // 본 검증은 lodInfo 전체에서 low 비율을 측정 (sub-pixel asteroid 가 low 유지하면 high 가
    // 폭증하지 않음). asteroid belt 가 ThinInstances 라 lodInfo 에 별도 항목 없을 수 있음 —
    // 본 시나리오는 "lodInfo 전체 low 가 일정 비율 유지" 로 회귀 가드 (한쪽으로 쏠리지 않음 검증).
    const lodStats = solar.getLodStats ? solar.getLodStats() : null;
    return { lodInfoCount: lodInfo.length, lodStats };
  });
  // 계측 채널 붕괴 ⇒ 측정 불가 (종전에는 `pass: false` 로만 돌려 제품 FAIL 과 섞였다).
  const channelDefect = measurement.error ?? lodStatsDefect(measurement.lodStats);
  if (channelDefect) {
    console.log(`  ! 측정 불가 — ${channelDefect}`);
    await context.close();
    return { pass: false, failed: false, blocked: true, error: channelDefect };
  }
  const { lodStats } = measurement;
  // sub-pixel body 가 low 유지 — 활성 body 전체 중 high 가 폭증하지 않음 (≤ 5).
  // (#1207 정정 — 종전 주석은 "24 body" 였으나 현행은 `32` 다. 계수를 다시 박지 않는다.)
  // fix 가 모든 body 를 high 로 강제하면 이 조건 fail (의도치 않은 회귀).
  // ⚠️ 이 상수도 `SCENARIO_A_DOD.maxLowRatio` 와 **같은 body 총수 결합**이고 여유는 더 얇다 —
  //    무주입 실측 `high=2` (2026-09-23 · rev `8b5f2c3`) 라 여유 `3`, baseline (2026-05-02,
  //    body 24) 의 시나리오 C 는 `high=1` 이었으니 이미 한 칸 움직였다. 재검토 트리거는
  //    `SCENARIO_A_DOD.maxLowRatio` 각주 §재검토 트리거 와 **공유**한다 (본 상수도 그 대상).
  const HIGH_REGRESSION_LIMIT = 5;
  const highPass = lodStats.high <= HIGH_REGRESSION_LIMIT;
  // #1250 — **단언의 주어가 존재하는가.** 「sub-pixel body 가 low 를 유지한다」인데 low 가 0 개면
  // 그 상한은 아무것도 재지 않는다. `> 0` 은 임계가 아니라 공허 검사다 (고를 값이 없다). 그리고
  // low 계수를 만드는 것은 제품(`runLodPass`)이므로 이 부재는 전제 위반이 아니라 제품 FAIL 이다.
  const lowPresent = lodStats.low > 0;
  const pass = highPass && lowPresent;
  console.log(
    `  lodStats: high=${lodStats.high}/mid=${lodStats.mid}/low=${lodStats.low} ` +
      `(lodInfo ${measurement.lodInfoCount} body) — ` +
      `${pass ? 'PASS' : 'FAIL'} (high ≤ ${HIGH_REGRESSION_LIMIT} 회귀 임계` +
      `${lowPresent ? '' : ' · low=0 — sub-pixel low 유지의 주어 부재'})`,
  );
  await context.close();
  return { pass, failed: !pass, blocked: false, lodStats, lodInfoCount: measurement.lodInfoCount };
}

/**
 * baseline 로드 (#1250).
 *
 * 부재·파손은 **하네스 전제의 붕괴**다 — `__baselines__/lod-379.json` 은 저장소에 tracked 돼
 * 있어 체크아웃이면 항상 존재한다. 종전에는 `null` 을 돌려 호출부가 비교를 **조용히** 건너뛰었고,
 * 그래서 회귀 감지가 통째로 사라져도 로그 한 줄 남지 않았다.
 *
 * @returns {{ baseline: object | null, error: string | null }}
 */
function loadBaseline() {
  const rel = path.relative(process.cwd(), BASELINE_PATH);
  if (!fs.existsSync(BASELINE_PATH)) {
    return { baseline: null, error: `baseline 파일 부재: ${rel} (저장소 tracked 파일이다)` };
  }
  try {
    return { baseline: JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')), error: null };
  } catch (err) {
    return { baseline: null, error: `baseline JSON 파손: ${rel} — ${err.message}` };
  }
}

/**
 * baseline 대비 sun=high 회귀 비교 (#1250).
 *
 * 술어와 임계(5%p)는 그대로다. 바뀐 것은 **비교를 못 한 경우가 침묵하지 않는다**는 점 —
 * 「비교했는데 통과」와 「비교 자체가 없었다」는 로그에서 구분돼야 한다.
 *
 * @returns {{ status: 'compared' | 'regressed' | 'skipped' | 'blocked', detail: string, … }}
 */
function compareBaseline(fullResult) {
  console.log('\n=== baseline 비교 ===');
  if (flags.update) {
    const detail = '스킵 — `--update` 모드 (현행 측정값으로 baseline 을 덮어쓴다)';
    console.log(`  ${detail}`);
    return { status: 'skipped', detail };
  }
  const { baseline, error } = loadBaseline();
  if (error) {
    console.log(`  ! 측정 불가 — ${error}`);
    return { status: 'blocked', detail: error };
  }
  const baseSunHigh = baseline?.scenarios?.A?.sunHighRatio;
  const currentSunHigh = fullResult.scenarios.A?.sunHighRatio;
  // ⚠️ 비교의 **입력이 성립하는지** 먼저 본다 (#1250 — 구현 중 실측으로 드러난 결합).
  // `sunHighRatio` 의 분모가 **측정 시도**로 고정되면서, 측정 불가 cell 이 있을 때 이 비율은
  // 제품이 아니라 계측 상태를 반영한다. 그대로 비교하면 하락이 「제품 회귀(`1`)」로 보고돼
  // 전제 붕괴가 게이트로 위장한다 (실측: 4 cell 채널 차단 → `50%` 하락 → `exit 1`).
  const unmeasured = fullResult.scenarios.A?.cellsUnmeasured ?? 0;
  if (unmeasured > 0) {
    const detail = `시나리오 A 측정 불가 cell=${unmeasured} — current 측 비율이 제품 상태가 아니다`;
    console.log(`  ! 측정 불가 — ${detail}`);
    return { status: 'blocked', detail, baseSunHigh, currentSunHigh };
  }
  // 어느 한쪽이라도 없으면 비교 자체가 성립하지 않는다 ⇒ 측정 불가 (종전 `!== null` 게이트는
  // 이 상태를 조용히 통과시켰다).
  if (!Number.isFinite(baseSunHigh) || !Number.isFinite(currentSunHigh)) {
    const detail =
      `비교 입력 결손 — baseline.scenarios.A.sunHighRatio=${String(baseSunHigh)} / ` +
      `current=${String(currentSunHigh)}`;
    console.log(`  ! 측정 불가 — ${detail}`);
    return { status: 'blocked', detail, baseSunHigh, currentSunHigh };
  }
  console.log(
    `  sun=high baseline=${(baseSunHigh * 100).toFixed(1)}% / current=${(currentSunHigh * 100).toFixed(1)}%`,
  );
  if (currentSunHigh < baseSunHigh - BASELINE_SUN_HIGH_DROP) {
    // 비교가 **발화**한 것은 제품 회귀다 ⇒ exit 1.
    const detail = `sun=high 비율이 baseline 대비 ${BASELINE_SUN_HIGH_DROP * 100}%p 이상 하락 — 회귀 의심`;
    console.log(`  ! ${detail}`);
    return { status: 'regressed', detail, baseSunHigh, currentSunHigh };
  }
  return { status: 'compared', detail: '하락 없음', baseSunHigh, currentSunHigh };
}

async function main() {
  let allPass = true;
  let anyFail = false; // 측정됐고 단언이 거짓 → exit 1
  let anyBlocked = false; // 계측 채널 붕괴 / 판정 전제 결손 → exit 2
  const fullResult = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    scenarios: {},
  };

  // #940 — 브라우저 수명주기를 `withBrowser` 로 위임 (에러 경로 close 도달 보장).
  // launch 인자는 원본 그대로 전달한다 (렌더러 축 불변 — docs/ops/browser-verify-helpers.md).
  await withBrowser({ headless: true }, async (browser) => {
    for (const [key, run] of [
      ['A', runScenarioA],
      ['B', runScenarioB],
      ['C', runScenarioC],
    ]) {
      const result = await run(browser);
      fullResult.scenarios[key] = result;
      if (!result.pass) allPass = false;
      if (result.failed) anyFail = true;
      if (result.blocked) anyBlocked = true;
    }
  });

  // baseline 비교 — 스킵·불가도 **반드시 한 줄 찍는다** (#1250).
  const baselineComparison = compareBaseline(fullResult);
  fullResult.baselineComparison = baselineComparison;
  if (baselineComparison.status === 'regressed') {
    allPass = false;
    anyFail = true;
  } else if (baselineComparison.status === 'blocked') {
    allPass = false;
    anyBlocked = true;
  }

  // 확정 FAIL 우선 (헤더 §종료 코드 계약) — 제품 결함이 「측정 불가」 뒤로 숨지 않게 한다.
  // 마지막 `1` 은 fail-closed 잔여다 (세 플래그가 모순되면 통과가 아니라 실패로 떨어진다).
  const exitCode = anyFail ? 1 : anyBlocked ? 2 : allPass ? 0 : 1;
  fullResult.exitCode = exitCode;

  // baseline 업데이트. ⚠️ 판정과 무관하게 기록한다 (헤더 §알려진 사각 §열려 있는 것) —
  // 적어도 **어떤 판정의 run 이었는지**는 파일에 함께 남도록 `exitCode` 산출 뒤로 옮겼다.
  if (flags.update) {
    fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(fullResult, null, 2));
    console.log(
      `\n  baseline 업데이트: ${path.relative(process.cwd(), BASELINE_PATH)} (이번 run exit ${exitCode})`,
    );
  }

  /** 시나리오 한 건의 3상 판정 표기. */
  const verdict = (s) => (s?.pass ? 'PASS' : s?.failed ? 'FAIL' : '측정 불가');

  console.log('\n=== 최종 요약 ===');
  console.log(`overall: ${allPass ? 'PASS' : anyFail ? 'FAIL' : '측정 불가'} (exit ${exitCode})`);
  console.log(`  시나리오 A (T1 default 매트릭스): ${verdict(fullResult.scenarios.A)}`);
  console.log(`  시나리오 B (T3 focus high): ${verdict(fullResult.scenarios.B)}`);
  console.log(`  시나리오 C (asteroid sub-pixel low): ${verdict(fullResult.scenarios.C)}`);
  console.log(`  baseline 비교: ${baselineComparison.status} — ${baselineComparison.detail}`);

  if (flags.json) {
    console.log('\n=== JSON 결과 ===');
    console.log(JSON.stringify(fullResult, null, 2));
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error('[browser-verify-379-lod] unhandled error:', err);
  process.exit(2);
});
