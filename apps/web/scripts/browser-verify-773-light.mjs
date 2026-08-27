#!/usr/bin/env node
/**
 * #773/#775 — 표면 셰이더 광원 일관성 + 지구 대륙 mix qa 동적 검증 (Amendment 1).
 *
 * 실 Chrome GUI (headless: false, channel: chrome) — WebGPU swiftshader freeze 회피 (#663/#756).
 * 픽셀 측정 = composited canvas.screenshot() (PNG) → 페이지 내 Image 디코드 → 2D getImageData.
 *   ⚠️ WebGPU drawImage readback 빈버퍼 함정 회피 (#728 SSoT) — page.evaluate 내 2D canvas 경로만.
 *
 * 측정 축 (ADR §A1.5 DoD):
 *  - DoD 1: 밤면/낮면 휘도 대비비 (day/night contrast ratio) ≥ 5x — 표면 셰이더 행성 vs 단색 행성 대조.
 *  - DoD 2: 태양 추종 — disk 안 밝은 절반이 sunDir(태양 방향) 쪽인지 검증 (lit-side 정합).
 *  - DoD 4: 지구 대륙 — disk 픽셀의 색조(hue) 분포에서 land(올리브-브라운) vs ocean(청록) 2-모드 분리.
 *  - DoD 5: 절차 무회귀 — 낮면 기준 고주파 엔트로피 ON > OFF.
 *  - DoD 6: 보라/마젠타 0 — disk 픽셀 중 (R>G && B>G) 기괴 색역 비율.
 *
 * disk 영역만 샘플: scene.activeCamera 로 mesh 의 **투영 disk** 를 산출 → 그 원 안 픽셀만 분석.
 * 낮/밤 분할: sunDir(scene-unit) 을 화면 평면에 투영 → disk 중심 기준 sun 쪽 절반 = 낮면, 반대 = 밤면.
 *
 * ── 측정 방법 (#1155 — CRITICAL #6.10 「수치 DoD 미달 시 (0) 측정 방법 검증 우선」) ──────────
 * 초판(#773~#1154)은 **회전하는 mesh 의 world AABB** 8 코너를 투영해 창을 잡고 `lum < 8` 로
 * 배경을 걸러「려」 했다. `#1146` 이 `browser-verify-756-surface.mjs` 에서 확정한 것과 같은 두
 * 결함이 본 가드에도 있었다. 다만 **판정은 흔들리지 않았다** — 아래 실측이 그 점도 함께 박제한다.
 *
 *  D1 — 창이 매 실행 달라진다. local AABB 는 정육면체라 mesh 가 돌면 축정렬 외접 박스가
 *       커졌다 작아진다. 구 코드 10회 반복 실측(2026-08-25, 로컬 swiftshader, 같은 커밋):
 *       `screenBox` `w×h` distinct 가 `earth` OFF·`jupiter` OFF 에서 **`10/10`** (매 실행 다른
 *       창), `w` 진폭이 `jupiter` OFF `216~296` = **`37.0%`**. 같은 조건에서 투영 disk 반경은
 *       body 마다 단일값으로 고정된다.
 *  D2 — `lum < 8` 이 배경을 거르지 않는다. 배경이 임계 위로 렌더되기 때문이다. 위 10회에서
 *       그 마스크가 실제로 제외한 픽셀은 8 config 중 **6개가 정확히 `0`**, 나머지 둘도
 *       `mars` ON `5~76px` / `mars` OFF `85~89px` (창 `166×170` 대비) 다. 그 결과 창의 상당
 *       부분을 차지하는 배경이 낮면/밤면 평균에 함께 들어가 **판정량을 왜곡**했다 — 기하 원
 *       마스크로 바꾸면 `contrastMean` 이 mars `+53%` / jupiter `+40%` / moon `+42%` 갈린다
 *       (같은 실행 내 대조, 2026-08-25 Phase 0).
 *       ⚠️ `#1146` 이 756 에서 관측한 「어두운 밤면을 깎아낸다」 축은 **본 가드의 4 body 에서는
 *       재현되지 않는다** — 기하 원 안에서 `lum < 8` 로 제외되는 픽셀이 `0.00~0.03%` 다
 *       (Phase 0). 위 「6개가 `0`」 과 같은 방향의 두 표본이다: 그 분기는 여기서 **거의 아무것도
 *       거르지 않았다**. (`#1155` 본문 초안이 756 의 카빙 서술을 이식했고 실측이 정정했다.)
 *  D3 — **위 왜곡이 PASS/FAIL 을 뒤집은 적은 없다.** 모집단·술어를 함께 적는다 (reviewer
 *       라운드 2 [N2]). 모집단 = PR `#1158` 본문 표 C 의 **구 코드 10회 반복 × 4 body × ON/OFF
 *       (8 config 전건)**. 술어 = body 별 최악 여유 `min(ON 10회) − max(OFF 10회)` 가 양수인가.
 *       결과: `earth 1.12` / `mars 0.63` / `jupiter 0.55` / `moon 1.16` 으로 **4 body 전건 양수**
 *       이고, 그 여유는 같은 body 의 `max(sd_ON, sd_OFF)` 의 `2.4×`(mars — 최소) ~ `290×`
 *       (moon — sd 가 `0.0040` 이라 축퇴한 값) 다.
 *       ⚠️ 착수 시 적었던 *"여유가 반복 sd 의 6~20배"* 는 Phase 0 의 **4 config 표본**에서 나온
 *       값이고 **그 분모·여유 정의를 기록해 두지 않았다**. 값을 갈아치우지 않고 모집단을 명시한
 *       위 재도출을 병기한다 (`reviewer.md` §4 계급 2).
 *       그래서 마스크 교체의 동기는 flake 예방이 아니라 **재는 양의 정확성**이다
 *       (측정량 ≠ 판정 안정성).
 *
 * 처방 P1 — 창을 AABB 코너 대신 **투영 disk** 로 잡고 배경을 휘도가 아니라 **기하** 로 배제
 * (`#1146`/`#1119`/`#783` 선례 재사용, 신규 구현 금지 — CLAUDE.md §신규 함수 ≠ 신규 구현).
 *
 * 처방 P2 — 전 시나리오에 `?rotate=off` (`#1146` P1 과 같은 플래그).
 * ⚠️ **착수 시 판단은 「불필요」였고 실측이 뒤집었다 — 값을 갈아치우지 않고 이력으로 남긴다**
 * (`reviewer.md` §4 계급 2). 착수 시 논거는 *"신 창의 반경 산식이 회전 불변이라 D1 이 창에서
 * 소멸하고, 판정 3축은 낮/밤 반구 평균이라 표면 패턴 위상에 둔감하다"* 였고, **앞 절반은 맞고
 * 뒷 절반이 틀렸다**. 로컬 swiftshader 각 10회 반복 (2026-08-25, 같은 커밋):
 *   신 창 + `rotate=on`  → 창 distinct **`1`** (전 8 config) 인데 `contrastMean` sd 가
 *                          `mars` ON **`0.1489`** (`7.44~7.83`) / `jupiter` ON `0.0200`
 *   신 창 + `rotate=off` → sd 전 8 config **`≤ 0.0050`**, 판정 10/10 PASS
 * 착수 시 인용했던 「기하 마스크 반복 sd ≤ 0.004」 는 Phase 0 의 4 config 표본(`jupiter` OFF /
 * `mars` OFF / `earth` ON / `moon` ON)에서 나온 값이고 **`mars` ON 이 그 표본에 없었다** —
 * 모집단이 좁았던 것이다.
 * ⚠️ **진폭을 만든 축이 「자전」이라고는 주장하지 않는다** — 본 PR 은 그것을 분리하지 않았다.
 * `rotate=off` 는 자전과 `axialTilt` 를 동시에 끄고, **부수적으로 focus framing 도 바꾼다**:
 * focus 거리 산출이 `boundingSphere.radiusWorld` 를 쓰는데 그 값이 *"box 외접구 √3 과대 +
 * #782 자전 위상 진동"* 이라고 `camera-controller.ts:88`(`resolveMeshVisualRadius`)·`:197`
 * 주석이 이미 명시한다. ⚠️ **operative 경로는 `apps/web/src/components/sim-canvas.tsx:868`** 이다:
 * `mesh.getBoundingInfo().boundingSphere.radiusWorld` → `desiredRadius` → `focusOn({ mesh, radius })`
 * 이고, 같은 파일 `:876` 이 명시 전달로 내부 식을 우회한다. 초판은 `camera-controller.ts` 의
 * `focusOn` 을 인용했는데 그 파일 `:203` NOTE 가 스스로 그것을 fallback 이라고 못박으므로, 인용을
 * 따라간 독자가 논거를 기각할 수 있다 (reviewer 라운드 2 [N1] — 기전 결론 유지, 인용처 병기).
 * 실제로 `diskRpx` 가 `earth 74.75 / mars 73.90 / jupiter 93.36 / moon 22.15`(on) →
 * `98.32 / 98.32 / 98.32 / 24.58`(off) 로 바뀐다 — off 쪽에서 planet 3종이 **같은 화각**으로
 * 정렬되므로 body 간 대조도 그쪽이 읽기 쉽다. 주장은 「`rotate=off` 가 진폭을 없앤다」까지다.
 * 회전 불변 반경 산식은 `rotate=off` 를 준 뒤에도 **유지**한다 (그 플래그가 미래에 빠져도 창이
 * 조용히 틀어지지 않게 하는 방어의 깊이 — `#1146` 과 같은 논거).
 * ⚠️ 부수 손실: `rotate=off` 는 `#782` 계약상 `axialTilt` 도 끄므로, 종전 이 가드가 `rotate=on`
 * 이라 **우연히** 밟던 「기울기 × 광원」 조합이 본 변경 이후 노출 `0` 이 된다. 그 조합을 assert
 * 하던 가드는 애초에 없어 손실된 assert 는 `0` 이나, 노출이 사라진 것은 사실이라 적어 둔다
 * (`#1146` 이 756 에서 같은 손실을 기록한 것과 동형).
 *
 * 판정 (#759 — shader-pixel-guard CI 상시 가드, ADR 20260705-759 결정 3 + **Amendment 2**):
 *   4 body 각각 (1) dayMean > nightMean × 2 (2) contrastMean 상대 낙차
 *   `1 − OFF/ON ≥ CONTRAST_ON_OFF_MARGIN` (#1159 Amendment 2 — 그 전에는 결정 3 원문이 선언한
 *   마진 없는 `ON > OFF`. 원문 라인은 기록 보존을 위해 소급 편집하지 않았으므로 **판정 SSoT 는
 *   Amendment 2** 다)
 *   (3) purplePct == 0. 미충족 시 exit 1 (fail-fast).
 *   ⚠️ hfEntropy ON>OFF 는 판정 축에서 제외 — moon day-side 실측 역전 (ON 1.402 < OFF 1.989,
 *   disk 소면적 framing + land/ocean 소표본 artifact — ADR §실측 3). 측정·로그는 유지하되
 *   moon 커버는 대비(contrastMean)/보라(purplePct) 축이 담당 (의식적 축소 — 가드 약화 아님).
 *
 * 사용법:
 *   node apps/web/scripts/browser-verify-773-light.mjs               # 실 Chrome GUI
 *   HEADFUL=0 node ...                                               # CI 폴백 (headless)
 *   SWIFTSHADER=1 node ...                                           # CI(ubuntu 소프트웨어 렌더) 로컬 재현
 *   CAPTURE_DIR=/abs/dir node ...                                    # 캡처 PNG 저장
 */

import { chromium } from 'playwright';
import { withBrowser } from '../../../scripts/browser-verify-utils.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const CAPTURE_DIR = process.env.CAPTURE_DIR ?? null;
const HEADFUL = process.env.HEADFUL !== '0';
// #759 — CI 실패 로컬 재현 (--use-angle=swiftshader). browser-verify-756-surface.mjs 주석 참조.
const SWIFTSHADER = process.env.SWIFTSHADER === '1';

// #759 판정 상수 — 낮/밤 대비 하한 배수. 실측 최소 (swiftshader 포함 전 라운드) saturn 2.14×,
// 표면 4 body 하드웨어 실측 3.07~5.37× (docs/reports/773-light/qa-773-comment.md) → 2× 하한 안전.
const DAY_NIGHT_RATIO_MIN = 2;

/**
 * #1159 — `contrastMean` ON/OFF 판정의 **상대 낙차 하한**. 구판 판정은 `on.contrastMean >
 * off.contrastMean` 이라는 순수 부등식이라 **부호만** 비교했다. 밤면이 *부분* 회귀해 낙차가
 * 몇 `%` 만 남아도 부호는 옳으므로 통과한다 — 실측(아래 M-C)에서 mars 낙차 `36.8% → 5.00%`
 * 인 셰이더를 구판이 `exit 0` 으로 통과시켰다 (「테스트가 있다 ≠ 그 테스트가 작동한다」 #1123).
 *
 * **형태 — 상대(곱셈) 마진** (`off.contrastMean ≤ on.contrastMean × (1 − MARGIN)`). 판정량
 * `contrastMean` 자체가 `day.mean / night.mean` 인 무차원 비율이라 가산 마진은 body 마다
 * (`earth 4.25` ~ `mars 7.61`) 뜻이 달라진다. 바로 위 형제 축 `DAY_NIGHT_RATIO_MIN` 도 곱셈이다.
 * 정규화 분모는 **ON** 을 쓴다 — 낙차를 「셰이더가 만든 대비 중 몇 %가 사라졌는가」로 읽는
 * 것이 회귀 서술과 일치하고, 스프린트 계약이 인용한 baseline(`(ON−OFF)/ON`)과도 같은 축이다.
 *
 * **산출 근거 (measurement-first — 임계부터 정하고 맞춘 값이 아니다).**
 * 신호 = `1 − off.contrastMean / on.contrastMean`.
 *  - **하한 (판별력)** — 아래 M-C(0.045) 의 mars 잔존 낙차보다 커야 한다 (별개 실행 2 표본:
 *    구 가드 실행 `5.00%` / 신 가드 실행 `4.62%`).
 *  - **상한 (무회귀)** — 무주입 관측 최소 신호의 `1/2` = `18.32%` (스프린트 계약 기준 2).
 *    무주입 관측 — body 별 낙차, 최소는 **세 모집단 전부에서 jupiter** 다:
 *      · 로컬 swiftshader headless (#1159 n=5 = 마진 도입 전 3 + 도입 후 2 · #1155 Phase 0 n=6)
 *        `earth 47.76%` / `moon 41.67~41.79%` / `mars 37.50~37.58%` / **`jupiter 36.77%`**
 *      · **실 Chrome 하드웨어 GPU** (HEADFUL 기본, #1159 n=1)
 *        `earth 47.78%` / `moon 41.67%` / `mars 37.68%` / **`jupiter 36.77%`**
 *      · **CI** (`shader-pixel-guard` — 본 마진 도입 PR #1162 의 run `32928986266`, n=1)
 *        `earth 47.78%` / `moon 41.79%` / `mars 37.55%` / **`jupiter 36.64%` — 3 모집단 최소**
 *        ⚠️ 마진 상수를 정할 때 손에 있던 CI 표본은 #1155 Phase 0 의 `ON−OFF` **절대값** 5건
 *        뿐이라(그 표에 body 별 `ON` 이 없어 낙차 %로 재도출 불가) 상한을 로컬 최소
 *        `36.77%` 기준 `18.38%` 로 잡았다. 본 PR 의 CI run 이 그 값을 `36.64%` 로 **`0.13%p`
 *        낮췄고** 상한은 `18.32%` 다. 채택값 `0.10` 은 그 변동에 걸리지 않는다 (아래 「선택」).
 *        값을 갈아치우지 않고 시점을 병기한다 (`reviewer.md` §4 계급 2).
 *  - **선택** — `browser-verify-774-sun.mjs` 의 `COLOR_TEMP_MARGIN` 과 **같은 값**을 쓴다.
 *    같은 형태(비율 축 상대 낙차)의 두 판정이 저장소 안에서 갈리지 않게 하려는 것이고
 *    (#1155 를 만든 상태가 그것이다), 그 상수 주석에 두 축 공통 산출식이 있다.
 *    **채택값은 스프린트 계약의 `2×` 규칙만으로 유일하게 결정된다** — 두 축 구간을 겹치면
 *    상한 `min(15.65%, 18.32%) = 15.65%`(774 구속) · 하한 `4.62%`(본 축 M-C 잔존) 이고, 그
 *    구간의 유효숫자 1자리 최대값이 `0.1` 이다. 본 축의 실현 여유 `36.64 / 10 = 3.66×`
 *    (3 모집단 최소 기준) 는 **사후 확인이지 선택 근거가 아니다** (reviewer 라운드 2 [N2] —
 *    초판이 결정 규칙으로 적었던 「여유 `≥ 3×`」로 풀어도 답이 `0.1` 로 같다).
 *
 * **검출 하한 (blind band) — 이 마진이 무엇부터 잡는가.** 판정량이 **잔존** 신호이므로
 * 「`10%` 이상의 열화를 잡는다」가 아니다. 발화 조건 `잔존 < 10%` 를 body 별 무주입 baseline
 * 으로 환산한 것이 아래 대역이고, **body 마다 다르다** (baseline 이 다르므로 — 술어:
 * `1 − 10 / baseline%`, 모집단은 위 3 환경의 body 별 최소~최대):
 *   · jupiter(구속) `36.64~36.77%` ⇒ **`72.71~72.80%`** 이상 소멸해야 발화
 *   · mars `37.50~37.68%` ⇒ **`73.33~73.46%`**  · moon `41.67~41.79%` ⇒ `76.00~76.07%`
 *   · earth `47.76~47.78%` ⇒ `79.06~79.07%`
 * 그 아래 대역은 본 축이 보지 못한다 (형제 축 `DAY_NIGHT_RATIO_MIN` · `purplePct` 의 커버는
 * 별개). 아래 M-C 두 계수가 **mars 대역을 위아래로 bracket 한다** — 잔존은 둘 다 mars 값이라
 * 소멸률도 mars baseline 으로 환산한다:
 *   · `K = 0.035` 잔존 `11.87%` ⇒ 소멸률 `68.35~68.50%` < mars 대역 ⇒ **미발화** (실측 일치)
 *   · `K = 0.045` 잔존 `4.62~5.00%` ⇒ 소멸률 `86.67~87.74%` > mars 대역 ⇒ **발화** (실측 일치)
 *
 * **재도출 트리거 — 접촉 기준** (CLAUDE.md §`deferred:no-incident` 수명주기 와 같은 관례.
 * 시간 기준을 쓰지 않는 것은 그것이 또 하나의 추정 임계가 되기 때문이다 — ADR 20260816-850
 * 결정 1 이 *"임계 자체가 추정 오차의 산물이라 고수할 실체가 없다"* 로 든 논거). 위 baseline 은
 * **측정 방법**에 종속되고, 그 종속의 크기는 이 파일 헤더 §측정 방법 D2 가 이미 실측으로
 * 박제한다 — 기하 원 마스크 교체가 `contrastMean` 을 `mars +53%` / `jupiter +40%` /
 * `moon +42%` 움직였다. ⇒ `DISK_SAMPLE_RADIUS` / 기하 마스크 / 낮밤 분할 기준을 **다음에
 * 건드릴 때** 무주입 baseline 을 재측정하고 본 상수의 상한·여유·위 blind band 를 재확인한다.
 *
 * **M-C 변이 (판별력 실증, #1159)** — `procedural-planet-shader.ts` 의
 * `sunFactor ← mix(smoothstep(0, W, ndl), 1.0, 0.045)`. 밤면에 태양 diffuse 의 `4.5%` 를 새게
 * 해 #773 원 증상(밤면이 밝아짐)을 **부분** 재현한다. 구 가드 실행에서 4 body 전건
 * `dayMean > nightMean × 2` 와 `purplePct == 0` 이 그대로 통과했고(그래서 `exit 0`), 신 가드
 * 실행의 실패 목록에도 그 두 축은 없다 — 즉 형제 축이 받쳐준 것이 아니라 **본 축이 눈먼** 것이다.
 * ⚠️ 계수 `0.045` 는 「구 가드 통과 ∧ 신 가드 차단」 창을 맞춘 값이다 (`0.035` 는 최소 낙차가
 * mars `11.87%` 로 **양쪽 다 통과**). 그 창의 존재 자체가 본 마진이 잡는 회귀 대역이다.
 */
const CONTRAST_ON_OFF_MARGIN = 0.1;

/**
 * #1155 — 분석 창의 disk 반경 대비 샘플 비율. `browser-verify-756-surface.mjs` 의 동명 상수와
 * 같은 값·같은 역할이다 (limb antialiasing 링을 마진째 배제). `#1119` 의 `0.85` 보다 덜 깎는
 * 이유도 동일 — 본 가드는 terminator 를 낀 disk 전면을 재야 한다.
 */
const DISK_SAMPLE_RADIUS = 0.95;

/**
 * #1155 — 전 시나리오 공통 쿼리 접미 (자전 정지). `#1146` P1 과 같은 플래그·같은 이유이나,
 * **본 가드에서는 창이 아니라 픽셀 내용 때문에 필요하다** — 근거는 헤더 §측정 방법 말미.
 * 판정 경로(ON/OFF)만이 아니라 `plain` 경로에도 일관 적용한다 (회귀 조사 때 판정 경로와
 * 대조해 읽어야 하므로 같은 조건이어야 한다 — #1146 근거 1 동형).
 */
const ROTATE_OFF_QUERY = '&rotate=off';

const SURFACE_BODIES = [
  { id: 'earth', type: 'rocky' },
  { id: 'mars', type: 'desert' },
  { id: 'jupiter', type: 'gas-bands' },
  { id: 'moon', type: 'cratered' },
];
// 단색 행성 (회귀만 확인 — terminator/밤면 대조 baseline).
const PLAIN_BODIES = [{ id: 'venus' }, { id: 'mercury' }, { id: 'saturn' }, { id: 'neptune' }];

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
 * disk 영역 픽셀 통계 — 낮/밤 분할 + 색조 분포.
 * sunDir 을 화면 평면에 투영해 disk 중심 기준 낮면(태양 쪽) / 밤면(반대) 분할.
 */
async function measureLight(page, bodyId, captureName) {
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

      const Vector3 = (BABYLON && BABYLON.Vector3) || mesh.getAbsolutePosition().constructor;
      const Matrix = (BABYLON && BABYLON.Matrix) || mesh.getWorldMatrix().constructor;
      const idMat = Matrix.Identity();

      // ── 회전 불변 시각 반경 (#1155) ─────────────────────────────────────────────────
      // 산식 SSoT = `packages/core/src/scene/camera-controller.ts` 의 `resolveMeshVisualRadius`
      // (#790): `max(boundingBox.extendSize(local) 각 축 × |scaling| 각 축)`.
      // 본 블록은 `browser-verify-756-surface.mjs` / `browser-verify-774-sun.mjs` 의 같은 블록과
      // **의도적 복제**다 — 이 코드는 `page.evaluate` 안(브라우저 컨텍스트)에서 실행되므로
      // Node 모듈로 뽑으면 소스 문자열 주입이라는 **새 기전**이 생긴다. 형제 verify 가드
      // (`#783`/`#1119`/`#756`)가 각자 사본을 갖는 것이 이 저장소의 확립된 패턴이다.
      // ⚠️ `boundingSphere.radiusWorld / √3` (#783 / #1119 선례) 를 쓰지 않는 이유 — 그 보정은
      // **회전이 identity 일 때만** 맞다 (#1146 실측: 자전 ON 시 1.3936배 과대). 본 가드는
      // `?rotate=off` 를 주므로 두 산식이 같은 값이 되지만, 회전 불변 쪽을 채택해 그 플래그가
      // 미래에 빠져도 창이 조용히 틀어지지 않게 한다 (#1146 과 같은 방어의 깊이 논거).
      const meshPos = mesh.getAbsolutePosition();
      const boundingInfo = mesh.getBoundingInfo();
      const bb = boundingInfo.boundingBox;
      const extendSize = bb.extendSize;
      const scaling = mesh.scaling;
      const radiusWorld = Math.max(
        extendSize.x * Math.abs(scaling.x),
        extendSize.y * Math.abs(scaling.y),
        extendSize.z * Math.abs(scaling.z),
      );
      const camRight = cam.getDirection(new Vector3(1, 0, 0));
      const centerScreen = Vector3.Project(meshPos, idMat, transform, vp);
      const edgeScreen = Vector3.Project(
        meshPos.add(camRight.scale(radiusWorld)),
        idMat,
        transform,
        vp,
      );
      const diskRpx = Math.hypot(edgeScreen.x - centerScreen.x, edgeScreen.y - centerScreen.y);
      if (!(diskRpx > 0) || !Number.isFinite(diskRpx)) {
        return { error: `disk 투영 반경 산출 실패 (${diskRpx})` };
      }

      // sunDir (scene-unit world) — sunLight.position − meshPos. PointLight 검색.
      let sunPos = null;
      for (const l of scene.lights) {
        if (l.position && (l.name === 'sun-light' || l.getClassName?.() === 'PointLight')) {
          sunPos = l.position;
          break;
        }
      }
      if (!sunPos) return { error: 'sunLight 부재' };
      const sunWorldDir = sunPos.subtract(meshPos); // 태양 방향 (월드).
      // 태양 방향 끝점을 화면 투영해 화면 평면 sunDir 추출 (정규화 후 mesh 반경 비례 길이).
      const sunDirN = sunWorldDir.normalize();
      // ⚠️ 이 `meshRadius` 는 위 창 산출의 회전 불변 반경과 **무관한 별개 용도**다 (reviewer
      // 라운드 2 [N3]). 형태상 local AABB 대각선 반길이(정육면체면 `√3 × r`) 이고 `mesh.scaling`
      // 도 반영하지 않는다. ⚠️ 위 헤더가 폐기 선언한 `radiusWorld / √3` 과 **같은 결함은 아니다**
      // (라운드 2 [R2-c]) — 그쪽 폐기 사유는 **회전 의존**인데 이것은 local AABB 라 회전 불변이고,
      // 남는 것은 상수 `√3` 편향 + scaling 무시다.
      // 그럼에도 **무해**하다 — 쓰임이 `tip` 을 disk 중심에서 충분히 떨어뜨려 화면 sunDir 을 얻는
      // 것뿐이고 (⚠️ scaling 미반영이라 `tip` 이 disk 안에 들어올 수도 있으나 무관하다),
      // 결과 `sdx/sdy` 는 `sdLen` 으로 정규화된다. 3D 직선은 화면에 직선으로 투영되므로
      // `centerScreen → tipScreen` **방향은 크기 불변**이다. 즉 여기서는 반경의 정확도가
      // 판정에 들어가지 않는다 (§주석 계약 vs 구현 drift 예방 — 형태만 보고 고치지 말 것).
      const meshRadius = bb.maximum.subtract(bb.minimum).length() * 0.5 || 1;
      const tip = meshPos.add(sunDirN.scale(meshRadius * 4));
      const tipScreen = Vector3.Project(tip, idMat, transform, vp);
      // 화면 sunDir (정규화). y 는 화면 좌표 (아래로 +).
      let sdx = tipScreen.x - centerScreen.x;
      let sdy = tipScreen.y - centerScreen.y;
      const sdLen = Math.hypot(sdx, sdy) || 1;
      sdx /= sdLen;
      sdy /= sdLen;

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

      // disk 중심 (img 좌표) = centerScreen 를 img 스케일 변환 후 창-상대.
      const cxImg = centerScreen.x * sx - bx;
      const cyImg = centerScreen.y * sy - by;
      // 기하 disk 마스크 반경 (#1155) — 배경 배제를 휘도가 아니라 기하로 한다.
      const maskRx = diskRpx * sx * DISK_SAMPLE_RADIUS;
      const maskRy = diskRpx * sy * DISK_SAMPLE_RADIUS;

      const lumGrid = new Float32Array(bw * bh);
      const mask = new Uint8Array(bw * bh);
      // 낮/밤 픽셀 분할: (px - cx, py - cy) · sunDir > 0 → 낮면.
      const dayLums = [];
      const nightLums = [];
      let purpleCount = 0;
      let diskCount = 0;
      // 색조 분류 (지구 대륙) — land(올리브브라운 R≳G>B) vs ocean(청록 G≳B>R).
      let landCount = 0;
      let oceanCount = 0;

      for (let y = 0; y < bh; y++) {
        for (let x = 0; x < bw; x++) {
          const i = y * bw + x;
          const r = data[i * 4];
          const g = data[i * 4 + 1];
          const b = data[i * 4 + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          lumGrid[i] = lum;
          // 배경 배제 = **기하** (#1155). 초판의 `lum < 8` 휘도 임계는 제거했다 — 배경이 임계
          // 위로 렌더돼 **배경을 거른 적이 없고**, 창의 상당 부분을 차지하던 그 배경이 낮면/밤면
          // 평균을 함께 끌어내려 판정량을 왜곡했다 (헤더 §측정 방법 D2). 임계 상향은 배경색이
          // 바뀌면 재발하고 어두운 body 의 밤면을 깎으므로 채택하지 않는다.
          const ddx = (x + 0.5 - cxImg) / maskRx;
          const ddy = (y + 0.5 - cyImg) / maskRy;
          if (ddx * ddx + ddy * ddy > 1) continue; // disk 밖 (우주 배경 / 궤도선 / UI) 배제
          mask[i] = 1;
          diskCount++;
          // 낮/밤 분할.
          const dotSun = (x - cxImg) * sdx + (y - cyImg) * sdy;
          if (dotSun > 0) dayLums.push(lum);
          else nightLums.push(lum);
          // 보라/마젠타 (R>G && B>G — 자홍/보라 색역).
          if (r > g + 12 && b > g + 12) purpleCount++;
          // 색조 분류 (지구) — 충분히 밝은 픽셀만 (밤면 어두운 픽셀 제외, lum>40).
          if (lum > 40) {
            if (r >= g - 4 && g > b + 6)
              landCount++; // R≳G, G>B → 갈색/올리브 (land)
            else if (g >= r + 6 && b >= r - 4) oceanCount++; // G,B > R → 청록 (ocean)
          }
        }
      }

      const stat = (arr) => {
        if (arr.length === 0) return { n: 0, mean: 0, p90: 0, p10: 0 };
        const s = [...arr].sort((a, b) => a - b);
        const mean = s.reduce((a, b) => a + b, 0) / s.length;
        return {
          n: s.length,
          mean: Number(mean.toFixed(1)),
          p90: Number(s[Math.floor(s.length * 0.9)].toFixed(1)),
          p10: Number(s[Math.floor(s.length * 0.1)].toFixed(1)),
        };
      };
      const day = stat(dayLums);
      const night = stat(nightLums);
      // 대비비 = 낮면 mean / 밤면 mean. 0 나눗셈은 바깥 삼항이 이미 막는다.
      // #1155 기준 8 — 구판의 `Math.max(night.mean, 0.5)` 하한 제거. 구 마스크(`lum ≥ 8`) 하에서는
      // `night.mean ≥ 8` 이 구조적으로 보장돼 **도달 불가능한 죽은 코드**였다. 신 마스크에서는
      // 밤면 최암부가 표본에 들어와 도달 가능해지지만, 그때 하는 일이 「진짜 어두운 밤면의 대비를
      // 조용히 낮춰서 보고」하는 것이라 **판정을 무디게 만드는 방향**이다 → 되살리지 않고 제거한다.
      const contrastMean = night.mean > 0 ? Number((day.mean / night.mean).toFixed(2)) : Infinity;
      // p90(낮면 밝은 부분) / p10(밤면 어두운 부분) — terminator 양극 대비.
      // ⚠️ 이쪽 `Math.max(…, 0.5)` 하한은 **유지**한다. `contrastExtreme` 은 판정 입력이 아니라
      // 로그 전용이고 (판정 3축은 dayMean/contrastMean/purplePct), 신 마스크에서 `night.p10` 은
      // 실제로 `0` 에 닿을 수 있어 (밤면 최암부가 표본에 포함) 하한이 `Infinity` 오염을 막는
      // **도달 가능한 방어**가 된다. 즉 위와 달리 죽은 코드가 아니다.
      const contrastExtreme = Number((day.p90 / Math.max(night.p10, 0.5)).toFixed(2));

      // 고주파 엔트로피 (낮면 기준 — 절차 무회귀, #756 패턴).
      let hfSum = 0;
      let hfCount = 0;
      const hfHist = new Array(32).fill(0);
      let hfHistN = 0;
      for (let y = 1; y < bh - 1; y++) {
        for (let x = 1; x < bw - 1; x++) {
          const i = y * bw + x;
          if (!mask[i] || !mask[i - 1] || !mask[i + 1] || !mask[i - bw] || !mask[i + bw]) continue;
          // 낮면만 (절차 디테일은 낮면에서 측정).
          const dotSun = (x - cxImg) * sdx + (y - cyImg) * sdy;
          if (dotSun <= 0) continue;
          const lap =
            4 * lumGrid[i] - lumGrid[i - 1] - lumGrid[i + 1] - lumGrid[i - bw] - lumGrid[i + bw];
          hfSum += lap * lap;
          hfCount++;
          hfHist[Math.min(31, Math.floor(Math.abs(lap)))]++;
          hfHistN++;
        }
      }
      const hfEnergy = hfCount > 0 ? Number(Math.sqrt(hfSum / hfCount).toFixed(4)) : 0;
      let hfEntropy = 0;
      for (const c of hfHist) {
        if (c === 0) continue;
        const p = c / hfHistN;
        hfEntropy -= p * Math.log2(p);
      }

      return {
        diskArea: diskCount,
        // #1155 기준 6 — 배경이 실제로 제외됐다는 관측 가능한 증거 (기하 마스크 생존 신호).
        windowPx: bw * bh,
        excludedPx: bw * bh - diskCount,
        diskRpx: Number(diskRpx.toFixed(2)),
        day,
        night,
        contrastMean, // ★ DoD 1 — 낮면/밤면 mean 대비비
        contrastExtreme, // 낮면 p90 / 밤면 p10
        hfEnergy: Number(hfEnergy.toFixed(4)),
        hfEntropy: Number(hfEntropy.toFixed(3)),
        purplePct: diskCount > 0 ? Number(((purpleCount / diskCount) * 100).toFixed(2)) : 0, // DoD 6
        landCount, // DoD 4 (지구만 유의미)
        oceanCount,
        screenSunDir: { x: Number(sdx.toFixed(3)), y: Number(sdy.toFixed(3)) },
        screenBox,
        imgSize: { w: img.width, h: img.height },
      };
    },
    { b64, bodyId, DISK_SAMPLE_RADIUS },
  );
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
    console.error(`[launch] chrome channel 부재 (${e.message}) — chromium 폴백`);
    return chromium.launch({ headless: !HEADFUL });
  }
}

(async () => {
  const out = { surfaceOn: {}, surfaceOff: {}, plain: {}, consoleErrors: {}, rotWarns: {} };
  // #940 — 브라우저 수명주기를 `withBrowser` 로 위임 (에러 경로 close 도달 보장).
  //   `launch()` 는 chrome 채널 부재 시 chromium 폴백이라 옵션 조립만으로 표현 불가 →
  //   launcher 주입 seam 으로 그대로 넘긴다 (launch 인자 무변경 = 광원 픽셀 측정 축 보존).
  await withBrowser(
    {},
    async (browser) => {
      console.log('\n=== DoD 1+2+4+6 — 표면 셰이더 행성 (surface ON, 기본) ===');
      for (const { id, type } of SURFACE_BODIES) {
        const { context, page, consoleErrors, consoleWarns } = await setupPage(
          browser,
          `?gpu=a&focus=${id}&lod=auto${ROTATE_OFF_QUERY}`,
        );
        const m = await measureLight(page, id, `qa-773-on-${id}`);
        out.surfaceOn[id] = { type, ...m };
        out.consoleErrors[`on-${id}`] = consoleErrors.length;
        out.rotWarns[`on-${id}`] = consoleWarns.filter((w) => w.includes('회전 non-zero')).length;
        console.log(
          `  ${id.padEnd(8)} [${type}] contrastMean=${m.contrastMean} contrastExtreme=${m.contrastExtreme} dayMean=${m.day?.mean} nightMean=${m.night?.mean} hfEnt(day)=${m.hfEntropy} purple%=${m.purplePct} land/ocean=${m.landCount}/${m.oceanCount} disk=${m.diskArea}/${m.windowPx} (제외 ${m.excludedPx}) diskRpx=${m.diskRpx} err=${consoleErrors.length}`,
        );
        if (consoleErrors.length)
          console.log(`     ↳ errors: ${JSON.stringify(consoleErrors.slice(0, 3))}`);
        await context.close();
      }

      console.log('\n=== 단색 행성 (baseline — terminator/대비비 기준) ===');
      for (const { id } of PLAIN_BODIES) {
        const { context, page, consoleErrors } = await setupPage(
          browser,
          `?gpu=a&focus=${id}&lod=auto${ROTATE_OFF_QUERY}`,
        );
        const m = await measureLight(page, id, `qa-773-plain-${id}`);
        out.plain[id] = m;
        console.log(
          `  ${id.padEnd(8)} contrastMean=${m.contrastMean} contrastExtreme=${m.contrastExtreme} dayMean=${m.day?.mean} nightMean=${m.night?.mean} purple%=${m.purplePct} disk=${m.diskArea}/${m.windowPx} (제외 ${m.excludedPx}) diskRpx=${m.diskRpx} err=${consoleErrors.length}`,
        );
        await context.close();
      }

      console.log('\n=== DoD 5 — ?surface=off 대조 (낮면 hfEntropy ON>OFF) ===');
      for (const { id, type } of SURFACE_BODIES) {
        const { context, page } = await setupPage(
          browser,
          `?gpu=a&focus=${id}&lod=auto&surface=off${ROTATE_OFF_QUERY}`,
        );
        const m = await measureLight(page, id, `qa-773-off-${id}`);
        out.surfaceOff[id] = { type, ...m };
        console.log(
          `  ${id.padEnd(8)} [${type}] contrastMean=${m.contrastMean} dayMean=${m.day?.mean} nightMean=${m.night?.mean} hfEnt(day)=${m.hfEntropy} purple%=${m.purplePct} disk=${m.diskArea}/${m.windowPx} (제외 ${m.excludedPx}) diskRpx=${m.diskRpx}`,
        );
        await context.close();
      }
    },
    { launch },
  );
  console.log('\n=== JSON ===');
  console.log(JSON.stringify(out, null, 2));

  // ── 판정 (#759 — ADR 20260705-759 결정 3: per-body 상대 성질, fail-fast) ──────
  // 축: (1) dayMean > nightMean×2 — 광원 붕괴 검출 (2) contrastMean ON/OFF 상대 낙차 ≥
  // CONTRAST_ON_OFF_MARGIN — 밤면 회귀 (#773 원 회귀) 검출 (#1159 — 마진 도입 전에는 마진 없는
  // `ON > OFF`) (3) purplePct == 0 — 기괴 색역 검출. hfEntropy 는 헤더 주석 사유로 제외.
  const failures = [];
  for (const { id } of SURFACE_BODIES) {
    const on = out.surfaceOn[id];
    const off = out.surfaceOff[id];
    if (!on || on.error) {
      failures.push(`${id}: surface ON 측정 실패 (${on?.error ?? 'no data'})`);
      continue;
    }
    if (!off || off.error) {
      failures.push(`${id}: surface OFF 측정 실패 (${off?.error ?? 'no data'})`);
      continue;
    }
    if (!(on.day.mean > on.night.mean * DAY_NIGHT_RATIO_MIN)) {
      failures.push(
        `${id}: dayMean(${on.day.mean}) ≤ nightMean(${on.night.mean}) × ${DAY_NIGHT_RATIO_MIN} (광원 대비 붕괴)`,
      );
    }
    // #1159 — 부호가 아니라 **낙차 크기**를 본다.
    // 축퇴 입력의 거동 (reviewer 라운드 2 [N3] 이 초판 서술을 반증했다 — 초판은 `Infinity` 도
    // fail-fast 라 적었으나 반대다). **전 케이스에서 구판 `ON > OFF` 와 판정이 같다**:
    //   · `on = 0`   → `-Infinity` → 차단   · `on = NaN` / `off = undefined` → `NaN` → 차단
    //   · `on = Infinity` (off 유한) → `1 − 0 = 1` → **통과** (fail-fast 아님)
    //   · `off = null` → `null → 0` 강제로 `1` → **통과**
    // ⚠️ 위 `Infinity` 는 열거 중 **유일하게 판정을 통과시키는** 축퇴값이다 (도달 가능한 축퇴값
    // 자체는 더 있다 — `stat([])` 이 `mean 0` 을 내므로 `dayLums` 가 비면 `contrastMean = 0` 도
    // 나온다. 그쪽은 통과하지 않는다. reviewer 라운드 2 [R2-N2]) — 위 `contrastMean =
    // night.mean > 0 ? … : Infinity` 가 (a) 밤면이 완전 흑색이거나 (b) 밤면 표본이 비어
    // `stat([])` 이 `mean 0` 을 낼 때 만든다. (a) 는 회귀가 아니라 이상적 상태라 통과가 옳고,
    // (b) 는 측정 결손이나 **구판도 똑같이 통과시켰다** (회귀 아님).
    // ⚠️ 비대칭 기록 — `off` 결손을 통과시키는 마지막 행은 774 가 `judgeRadial` 에 fail-fast 를
    // 넣어 닫은 것과 같은 계급인데 본 파일에는 없다. 다만 774 와 달리 **본 파일에서는 그 경로가
    // 구조적으로 도달 불가능하다**: `contrastMean` 은 위 삼항이 항상 수 또는 `Infinity` 를 내고
    // (`null` 을 낼 분기가 없다), 측정 실패는 위쪽 `!off || off.error` 가 이미 걸러낸다.
    // 774 의 `bOverR` 은 `cnt && sumR > 0 ? … : null` 로 `null` 을 낼 수 있어 사정이 다르다.
    // ⇒ 대칭 맞춤(773 에 fail-fast 신설)은 도달 불가능 경로에 대한 방어라 #1159 계약 범위 밖으로
    // 두고 판단만 남긴다 (§검증 강도 게이트 — 실피해 관측 시 이슈화).
    const contrastRelDrop = 1 - off.contrastMean / on.contrastMean;
    if (!(contrastRelDrop >= CONTRAST_ON_OFF_MARGIN)) {
      failures.push(
        `${id}: contrastMean 상대 낙차 ${(contrastRelDrop * 100).toFixed(2)}% < ${CONTRAST_ON_OFF_MARGIN * 100}% (ON ${on.contrastMean} / OFF ${off.contrastMean}) (밤면 회귀 — #773 원 증상)`,
      );
    }
    if (on.purplePct !== 0) {
      failures.push(`${id}: purplePct ${on.purplePct}% ≠ 0 (보라/마젠타 색역 오염)`);
    }
  }

  console.log(
    `\n=== 판정 (#759 — day>night×${DAY_NIGHT_RATIO_MIN} + contrastMean 낙차 ≥${CONTRAST_ON_OFF_MARGIN * 100}% + purple 0, hfEntropy 축 제외) ===`,
  );
  if (failures.length) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    console.log('=== FAIL ===');
    process.exitCode = 1;
  } else {
    for (const { id } of SURFACE_BODIES) {
      const on = out.surfaceOn[id];
      const off = out.surfaceOff[id];
      console.log(
        `  ✓ ${id}: day ${on.day.mean}/night ${on.night.mean} (×${DAY_NIGHT_RATIO_MIN} 초과), contrastMean ON ${on.contrastMean} / OFF ${off.contrastMean} (낙차 ${((1 - off.contrastMean / on.contrastMean) * 100).toFixed(2)}% ≥ ${CONTRAST_ON_OFF_MARGIN * 100}%), purple ${on.purplePct}%`,
      );
    }
    console.log('=== PASS ===');
  }
})();
