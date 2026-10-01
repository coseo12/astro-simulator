#!/usr/bin/env node
/**
 * #1265 — 런타임 표시 토글 동적 검증 (ADR `docs/decisions/20260927-1265-runtime-display-toggles.md`).
 *
 * **무엇을 재는가 (PR1 — core)**: `window.__solarScene` 의 신규 setter 3종 (`setCloudsVisible` ·
 * `setNightLightsVisible` · `setStarfieldVisible`) 을 **직접 호출**해 끈/켠 화면이 해당 `?x=off` **로드
 * 화면**과 같은지를 같은 결정적 프레임 쌍으로 비교한다 — core 기전만 격리해 잰다 (ADR §결정 8).
 *
 * **무엇을 재는가 (PR2 — web)**: 같은 비교를 **표시 패널 클릭**으로 다시 한다 (D5~D8 UI 재판정 — 같은 로드 기준
 * 캡처를 재사용). 캡처는 **패널을 닫고 · 패널 요소 0 개를 센 뒤** DOM 을 숨기고 찍는다 (#1219). 여기에 패널
 * 자체의 계약 (D1~D4 · D9~D11 · D14 · D15 UI) 을 더한다. UI 경로 페이지는 `setupPage(…, { hideOverlays: false })`
 * 로 띄워 조작 뒤 `uiCapture` 가 숨긴다.
 *
 * ## 판정식은 기존 가드의 것을 그대로 쓴다 (새 임계 0)
 *   - 프레임 · 쿼리: 구름 = `verify:1215` (`QUERY_ON` · JD `2451626.0` · pause · `beta = π/2` · LOD 정착),
 *     불빛 = `verify:1226` (`FOCUS` · JD `2451808.0` · 구름 OFF 쌍 P1 ↔ P2).
 *   - 픽셀 술어: 지구 disk (ray-sphere 역투영) 안 변화 px `== 0`. disk 밖은 같은 조건 독립 로드에서도
 *     비결정이 관측돼 (`verify:1215` §`== 0` 술어는 지구 disk 내부로 한정) 쓰지 않는다 — 별 배경 (D8) 만
 *     full frame 이고, 그래서 D8 은 독립 2 로드 결정성을 전제로 건다.
 *   - 역투영 식은 `verify:1226` `measurePair` 의 **사본**이다 (필요한 대역만 남김). 저장소에 같은 식의 사본이
 *     이미 있고 (783/1119/1202/1215/1226), D12 가 기존 가드 무수정을 요구해 공용 모듈 추출은 범위 밖이다
 *     (ADR §받아들인 비용).
 *   - 캡처 전 `hideDomOverlays` (#1219 — canvas element 캡처가 겹친 DOM 을 찍는다).
 *
 * ## 판정 (계약 재조정 코멘트 `issuecomment-5852573137` 의 PR1 배정분)
 *   D5   구름 OFF: 로드 ON 페이지에서 `setCloudsVisible(false)` ↔ `&clouds=off` 로드 — disk 변화 0
 *        ∧ **구조**: `earth-cloud` 0 개 ∧ 그룹 0 투명 정렬 = `defaultTransparentSortCompare` · 불투명 정렬 =
 *        `PainterSortCompare` (로드 OFF 페이지와 같은 값). 구조 술어를 두는 이유: 비활성 mesh 는 그려지지 않아
 *        `setEnabled(false)` 만 한 변이가 픽셀로는 통과할 수 있다 (ADR 축 2 · 변이 MV-1).
 *   D6   구름 ON: `&clouds=off` 로드 (**자전 ON** — 일시정지 중 켤 때의 드리프트 동기를 판별하려면 자전이
 *        돌아야 한다) 에서 `setCloudsVisible(true)` ↔ 기본 로드 — disk 변화 0 ∧ on/off 3 왕복 동안 구름 ≤ 1
 *        ∧ 같은 상태로 돌아왔을 때 `scene.meshes` · `scene.materials` 개수가 왕복 전과 같다 ∧ 왕복 후 화면도 disk 변화 0.
 *   D6f  구름 ON 이전에 lazy 생성된 mid 가 있는 상태 — mid 선생성 → auto → ON → fade 정지 재현
 *        (`verify:1215` `installFadeFreeze` 동형) ↔ 로드 ON 페이지의 같은 절차 — disk 변화 0.
 *        ⚠️ 켤 때의 mid·low **계열 등록** (`setCloudsVisible` (a)) 은 이 판정이 못 잡는다 — 현 기하에서는 등록
 *        유무가 정렬 키를 바꾸지 않아 픽셀 무영향이다 (PR #1267 변이 MV-4 exit 0). 그 등록은 단위 테스트
 *        (`solar-system-scene-display-toggles.test.ts`) 가 전담한다.
 *   D7   불빛 OFF: P1 에서 `setNightLightsVisible(false)` ↔ P2 로드 — disk 변화 0 ∧ `nightLightStrength` 를
 *        가진 머티리얼 **전부** 0. D7m: 이어서 두 페이지 mid 정착 쌍 disk 변화 0.
 *   D7e  개요 (focus 없음 — 지구 mid 미생성) 에서 끈 뒤 지구 focus + mid 정착 → 지구 high·mid 머티리얼 전부 0.
 *   D8   별: `&stars=off` 로드 → ON 후 starfield 정확히 1 · 10 왕복 뒤에도 1 · 같은 인스턴스 (전 환경 — 구조).
 *        픽셀 (하드웨어 전용, `__isSoftwareRenderer === false`): 로드 ON 에서 OFF ↔ `&stars=off` 로드 full frame 0.
 *   D8p  렌더링 그룹 0 의 불투명 mesh (블렌드·알파 테스트 아님) 중 starfield 외는 전부 depth write 를 한다
 *        (ADR R1 논증의 두 번째 전제 — 전 환경). 활성 큐가 아니라 `scene.meshes` 를 **구조로 열거**한다 —
 *        큐는 화면 안·활성 mesh 만 담아 뷰에 따라 표본이 달라진다. 표본 페이지: A (로드) · S (별 런타임 생성) ·
 *        T (궤도선 켜진 기본 로드 + 4 토글 스트레스 뒤). 열거 시점에 존재하는 mesh 만 대상이다 (lazy 미생성
 *        variant 는 밖).
 *   ON 직후 존재  `setCloudsVisible(true)` · `setStarfieldVisible(true)` 는 동기로 mesh 를 만든다 — 호출 직후
 *        mesh 가 없으면 **게이트 FAIL** (제품 결함). 머티리얼 준비 대기는 존재를 확인한 뒤에만 한다.
 *   D15  4 토글 (궤도선 포함) × 10 왕복 × (재생 / 일시정지) — `!hasSimErrors` ∧ 전 페이지 콘솔 에러 0.
 *
 * ## 판정 — UI 경로 (PR2 배정분)
 *   장면 준비  UI 페이지마다 부팅 직후 `displayCapabilities !== null` (sim-canvas 가 여는 제품 가용성 게이트 — 게이트다).
 *   D1   모드 4종 (`?mode=` 진입) × 1280×720 — 트리거 1 개 · 클릭 시 `aria-expanded="true"` · `aria-pressed` 토글 4 개 가시.
 *   D2   같은 페이지 — 우측 그룹 버튼 전부 `x + width ≤ 1280` · 좌측 단축 바 버튼 전부 스크롤로 도달 + 그 지점 hit.
 *   D3   패널 궤도선 ↔ 단축 바 `toggle-orbits` ↔ `store.orbitLinesVisible` — 어느 쪽을 눌러도 세 값 일치.
 *   D4   관찰 모드 · 패널 열림 · 4 초 무입력 → 상단 바 computed `opacity === "1"`.
 *   D5~D8 UI  위 core 판정과 같은 쌍 · 같은 술어 (D5 구조 포함). D8 픽셀 · D8 ON 구조는 하드웨어 전용.
 *   D9   소프트웨어 렌더 전용 — 별 토글 `aria-disabled="true"` + 소프트웨어 사유 `title` · 누른 뒤에도 별 0 · `__starfieldVisible`
 *        false · URL `stars` 부재. ⚠️ 이 차단은 `useDisplayToggle` 의 가용성 검사 한 곳뿐이다 (core 는 렌더러를 모른다).
 *   D10  `?surface=off` — 구름·불빛 `aria-disabled` + 표면 off 사유 · 누른 뒤 mesh · 머티리얼 개수 · URL 무변화 · 구름 0.
 *        (`nightLightStrength` 보유 머티리얼이 0 개라 uniform 술어는 공허 참 — 판정 근거는 개수 술어다.)
 *   D11  토글별 OFF → `key=off` · ON → 키 부재 · `history.length` 불변 · 북마크 복사 URL 반영 · 전부 OFF 새로고침 뒤
 *        패널 `aria-pressed` · scene 4축 동일 · 4 키를 전부 끈 로드 직후 (조작 전) URL 불변 · `?orbits=off` → ON →
 *        북마크에 `orbits` 부재. 소프트웨어 렌더의 별은 D9 가 막으므로 별 URL 은 하드웨어 전용.
 *   D14  캔버스에서 Tab 으로 트리거 도달 → Enter → 토글 4 개 선형 순회 (trap 없음) → Space 반전 → Esc 닫힘 + 포커스
 *        트리거. 엣지: `focus=earth` 에서 Esc → `freeFlyMode === false`. D14b: 패널 연 채 `focusOn mars` 로 선택을
 *        바꿔 (자유시점 리스너가 패널 리스너 **뒤로** 재등록) Esc → 패널 닫힘 ∧ 자유시점 미진입.
 *        포커스 순서: 마지막 토글 Tab → 패널 닫힘 + 트리거의 **기본 Tab 목적지** (패널 닫힌 상태에서 관측한 값) ·
 *        첫 토글 Shift+Tab → 트리거 (패널 유지) · 열린 트리거 Tab → 첫 토글.
 *        양성 대조: 패널이 닫힌 상태의 같은 Esc 는 자유시점으로 **간다** (그래야 위 `false` 술어가 판별력을 가진다 —
 *        리스너가 죽은 회귀는 게이트 FAIL).
 *   D15 UI  패널 토글 4 개 × 10 왕복 × (재생 / 일시정지) — `!hasSimErrors`.
 *   스크롤  트리거 위치가 바뀐 스크롤에서만 닫는다 — 좌측 단축 바 스크롤 (무관) 뒤 패널 유지 · 좁은 폭 우측 그룹 스크롤
 *        (트리거 이동) 뒤 패널 닫힘. 레이스: 키 간 지연 0 으로 캔버스 → 트리거 Tab → Enter 를 `RACE_TRIALS` 회 반복해
 *        방금 연 패널이 늦게 도착한 좌측 스크롤로 닫히지 않는가 (PR #1268 qa 가 실측한 결함).
 *
 * ## SKIP 은 PASS 로 세지 않는다
 *   환경상 판정되지 않는 게이트 (하드웨어 전용 · 소프트웨어 전용) 는 `SKIP` 으로 찍고 요약에서 따로 센다 —
 *   `[PASS] 판정 N (PASS · FAIL) · SKIP M / 게이트 K`. CI 는 항상 소프트웨어 렌더라 하드웨어 전용 게이트는 CI 에서
 *   한 번도 판정되지 않는다 (PR #1267 qa 비차단 1). 그 게이트들은 로컬 `BROWSER_VERIFY_GPU=metal` 또는 실 Chrome 수동
 *   확인 (D8b) 이 판정한다.
 *
 * ## 「측정 불가」 — 게이트별 전제 (exit 2 는 FAIL 이 하나도 없을 때만. fallback 분기 금지)
 *   전제가 무너지면 **그 전제에 기대는 게이트만** 평가하지 않는다 (`UNMEASURED`). 종료 코드 우선순위는
 *   FAIL (1) > 측정 불가 (2) > PASS (0). 라운드 1·2 에서 「전제를 모든 게이트보다 먼저」 본 구조가 제품 결함을 두 번
 *   흡수했다 (reviewer B1 · B2) — 전제를 참으로 만드는 원인에 제품 결함이 섞이면 결함을 잡는 게이트가 통째로 가려졌다.
 *   전제 (id) — 남긴 것은 하네스 · 환경 · 다른 가드 소관 원인뿐이다 (PR 코멘트의 전제 판정표):
 *   1 `settle:<page>` 토글 **전** LOD 정착 초과   2 `err:<key>` 측정 오류 · 비유한/퇴화 기하 · 캔버스 ≠ 1 · 쌍 기하 불일치
 *   3 `pos:*` 양성 대조 — 로드 ON ↔ 로드 OFF 변화 0   4 `ready:P2` 토글 없는 페이지의 하네스 mid 부재 · 준비 초과
 *   5 `fade:E|F` fade 재현 큐에 mid 부재   6 `edge:D7e` 토글 시점에 mid 가 이미 있음
 *   9 `det:D8` · `pos:D8` (하드웨어) 독립 2 로드 비결정 · 로드 ON ↔ OFF 동일   15 `renderer` 렌더러 판독 불일치
 *   16 `ctl` 자유시점 양성 대조의 선택 재설정 실패   17 `scroll` 스크롤을 일으키지 못함
 *   20 `scroll:trigger` 좁은 폭 우측 그룹 스크롤이 트리거를 움직이지 못함
 *   21 `race:scroll` 레이스 반복 중 단축 바 **조상 체인** (단축 바 자신 포함) 의 스크롤 0. 레이스 게이트는 실패 관측
 *      (`bad > 0`) 이 없을 때만 이 전제에 기댄다 — 「패널이 사라졌다」 는 스크롤 유무와 무관하게 관측된 결함이라 전제가
 *      지울 수 없다 (#1271 R12). 계수는 캔버스 포커스 · 트리거 클릭 같은 다른 요소 스크롤을 세지 않는다
 *   `scroll:unrelated` 좌측 단축 바 스크롤이 트리거를 움직임 (그러면 「무관 스크롤」 이 아니다)
 *   18 `d4:timing` 닫힌 채 4 초 안에 숨지 않았지만 더 기다리니 숨음 (타이머 지연)   19 `reload:boot` 새로고침 뒤 핸들 미노출
 *   22 부팅 실패 (#1271) — 섹션 안 페이지 부팅 (`bootstrapScene` — goto · 핸들 노출 대기) 이 예외로 끝나 섹션을 중단했다.
 *      경계 (블록 · 마커) 를 두지 않고 **게이트가 읽는 데이터**로 판정한다: 게이트마다 읽는 결과 키를 `reads` 로 선언하고,
 *      선언한 키가 전부 있으면 평가한다. 측정 불가는 「부팅 실패가 있었고 ∧ 읽는 키 중 하나 이상이 없다」 일 때뿐이다 —
 *      부팅 실패 전에 쓰인 데이터만 읽는 게이트는 같은 섹션이어도 판정되고, 그 FAIL 은 그대로 남는다. 부팅 실패가 없는데
 *      키가 없으면 하네스 결함이라 던진다 (exit 1). 전제 (3) · (5) · (6) · (9) 의 원천 키도 그 전제에 기대는 게이트의
 *      `reads` 에 넣는다. 선언 밖 읽기는 `judge` 가 막는다 — 평가 함수를 결과의 Proxy 위에서 돌려 실제로 읽은 키가
 *      선언 밖이면 던진다 (exit 1). 선언했지만 읽지 않는 키 (전제의 원천 키 등) 는 이 검사가 잡지 않는다.
 *      중단 직후 열린 페이지를 전부 닫고 **같은 쿼리를 단독으로** 다시 부팅한다: 재부팅 성공 → 데이터가 빠진 게이트만 측정
 *      불가 / 재부팅도 실패 → 게이트 「부팅 — 단독 핸들 노출」 이 FAIL. 재부팅 성공은 원인을 가르지 않는다 — 판정
 *      메시지는 첫 시도의 열린 컨텍스트 수만 적고, 1 이면 첫 시도도 단독이었으므로 재부팅은 재시도다.
 *      재부팅 페이지는 측정 게이트에 쓰지 않고 판별 직후 닫는다 — 콘솔 에러만 `<라벨>-reboot` 로 콘솔 에러 게이트에 넣는다.
 *      부팅 **뒤** 단계 (DOM 숨김의 캔버스 개수 fail-fast · JD 점프 등) 예외는 이 분류 밖이다 — 그대로 전파해 exit 1.
 *      ⚠️ 받아들인 비용: 첫 시도 부팅이 실패하고 단독 재부팅이 성공하는 회귀는 원인과 무관하게 측정 불가로 분류된다
 *      (FAIL 이 아니다) — 그 범위는 실패 지점에서 데이터가 미완결인 게이트다.
 *   여러 페이지의 표본을 모으는 게이트는 부팅 실패가 있어도 **있는 표본 위에서** 판정한다.
 *      기대 표본이 정해진 게이트 (로드 경로 구조 — 쌍 기준 페이지 · D1 · D2 — 모드 4종 · D8p — A · S · T) 는 빠진 표본이
 *      있으면 FAIL 만 남기고 그 밖의 결과는 측정 불가로 바꾼다 (빠진 표본이 결과를 뒤집을 수 있으므로).
 *      기대 목록이 없는 누적 표본 (토글 전후 기하 · 런타임 ON 직후 mesh 존재 · 머티리얼 준비 · 장면 준비 · 캡처 직전 패널)
 *      은 표본이 0 일 때만 측정 불가다 (`표본 ≥ 1` 술어가 공허 FAIL 을 내지 않게).
 *   「D15 전 페이지 콘솔 에러」 는 전제가 없다 — 결과로 옮겨진 모든 페이지 (부팅 실패 · 재부팅 페이지 포함) 의 에러를 판정한다.
 *   타임아웃성 게이트 (토글 뒤 정착 · ON 뒤 머티리얼 준비) 는 **같은 페이지의 토글 전 정착** (`settle:<page>`) 에 기댄다 —
 *   토글 뒤만 초과하면 FAIL, 둘 다 초과하면 측정 불가. mesh **부재**는 타이밍이 아니라 항상 FAIL 이다.
 *   어떤 게이트도 기대지 않는 전제는 `[정보]` 로만 출력한다.
 *   제품 결함이 원인이 될 수 있는 옛 전제는 게이트로 옮겼다 — 로드 경로 구조 (옛 3·7 의 로드 쪽 원인) · 토글 전후
 *   페이지 기하 불변 (옛 2 의 토글 쪽 원인) · 토글 뒤 정착 · mid (옛 1·4·5·6 의 토글 뒤 원인) · 런타임 ON 준비 (옛 4) ·
 *   D8p 표본 비어있음 (옛 8) · `?mode=` 진입 (옛 10) · D4 양성 대조 (옛 11) · D14b 선택·패널 (옛 12) · D14 시작 선택
 *   (옛 13) · 새로고침 뒤 준비 (옛 14). 번호 7·8·10~14 는 비워 둔다.
 *
 * ## 모드 / 변이
 *   node browser-verify-1265-display-panel.mjs      # 게이트 (CI)
 *   INJECT=console ...   # D15 페이지에 콘솔 에러 1건 — D15 FAIL 기대 (하네스 negative)
 *   INJECT=geom ...      # D5 쌍 캡처 뒤 카메라 이동 — 쌍 기하 불일치로 exit 2 기대 (측정 불가 negative)
 *   INJECT=boot ...      # 한 페이지 (`INJECT_BOOT_LABEL`, 기본 `F-cloudOn-mid` — #1271 CI 실패 페이지) 의 **첫** 부팅에만
 *                        # 핸들 대기 상한을 극소값으로 준다 — 단독 재부팅은 기본 상한이라 성공하므로 그 페이지 이후의
 *                        # 데이터를 읽는 게이트만 측정 불가 · 나머지는 판정 · exit 2 기대 (전제 22 negative). 라벨이 끝내 부팅되지 않으면
 *                        # (오타 · 하드웨어 전용 라벨을 소프트웨어 렌더에서 지정) 주입 미발화로 exit 1 (공허 통과 차단).
 *   소스 변이 `__solarScene` 노출 제거 (`sim-canvas.tsx`) — 단독 재부팅도 실패 → 「부팅 — 단독 핸들 노출」 FAIL · exit 1
 *   (전제 22 가 제품 결함을 흡수하지 않는다는 실증, #1271 B4).
 *   소스 변이 (MV-1 ~ MV-6 · clear 누락) 는 소스를 바꾸고 core dist 를 재빌드해 기본 모드로 돌린다 (PR 기록).
 *   변이 주입은 CI 에 배선하지 않는다 — 판별력 실증은 PR 시점 1회 의무 (1215 · 1226 선례).
 *   web 소스 변이 (PR2 — 가용성 검사 제거 · URL push · Esc `defaultPrevented` 검사 제거 · 자동 숨김 억제 제거 ·
 *   URL 쓰기를 UrlSync effect 로 · `setDisplayCapabilities` 호출 제거 · 패널 Esc 의 닫기 제거) 는 `next dev` 가 다시 컴파일하므로 재빌드
 *   없이 기본 모드로 돌린다 (PR 기록).
 *
 * 환경: SWIFTSHADER=1 (headless + --use-angle=swiftshader) · BROWSER_VERIFY_GPU=metal (D8 픽셀 — 하드웨어 경로) ·
 *       HEADFUL · BASE_URL · CAPTURE_DIR
 */

import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  bootstrapScene,
  collectConsoleErrors,
  hasSimErrors,
  hideDomOverlays,
  launchBrowser,
  resolveBaseUrl,
  waitForLodSettle,
  withBrowser,
} from '../../../scripts/browser-verify-utils.mjs';

const BASE_URL = resolveBaseUrl();
const CAPTURE_DIR = process.env.CAPTURE_DIR ?? null;
const SWIFTSHADER = process.env.SWIFTSHADER === '1';
const INJECT = process.env.INJECT ?? 'none';

const EXIT_UNMEASURABLE = 2;

/** `INJECT=boot` 대상 페이지 라벨 — 기본은 #1271 CI 실패 페이지 (run `36651753956` attempt 1 · contexts 8 의 F). */
const INJECT_BOOT_LABEL = process.env.INJECT_BOOT_LABEL ?? 'F-cloudOn-mid';
/**
 * `INJECT=boot` 의 핸들 대기 상한 — 판정 임계가 아니라 **주입값**이다 (첫 polling 전에 끝나게 하는 극소값).
 * 단독 재부팅은 이 값을 쓰지 않고 `bootstrapScene` 기본 상한으로 돈다 (새 임계 0).
 */
const INJECT_BOOT_HANDLE_TIMEOUT_MS = 1;

/** 구름 결정적 프레임 JD — `verify:1215` `T_JD` 와 동일. */
const T_JD_CLOUD = 2451626.0;
/** 불빛 결정적 프레임 JD — `verify:1226` `T_JD` 와 동일 (U1). */
const T_JD_NIGHT = 2451808.0;

/** `verify:1215` `QUERY_ON` · `verify:1226` `FOCUS` 와 동일 (둘은 같은 문자열이다). */
const FOCUS = '?gpu=a&focus=earth&lod=auto&rotate=off&orbits=off';
/** `verify:1215` `QUERY_ROTATE` 와 동일 — 자전 ON. */
const FOCUS_ROTATE = '?gpu=a&focus=earth&lod=auto&orbits=off';
/** D7e — 태양계 개요 (focus 없음). 나머지 축은 `FOCUS` 와 같게 둔다. */
const OVERVIEW = '?gpu=a&lod=auto&rotate=off&orbits=off';
/** D15 — 기본 로드 (4 효과 전부 켜진 상태에서 시작). */
const STRESS = '?gpu=a&focus=earth&lod=auto';

const Q = {
  cloudOn: FOCUS,
  cloudOff: `${FOCUS}&clouds=off`,
  cloudRotOn: FOCUS_ROTATE,
  cloudRotOff: `${FOCUS_ROTATE}&clouds=off`,
  // verify:1226 P1 · P2
  nightP1: `${FOCUS}&clouds=off`,
  nightP2: `${FOCUS}&clouds=off&nightlights=off`,
  nightOverview: `${OVERVIEW}&clouds=off`,
  starsOn: FOCUS,
  starsOff: `${FOCUS}&stars=off`,
  stress: STRESS,
};

const CLOUD_MESH = 'earth-cloud';
const STARFIELD_MESH = 'starfield';
const EARTH_MID = 'earth-lod-mid';

/** 계약 D6 「on/off 3회 왕복」. */
const CLOUD_ROUND_TRIPS = 3;
/** 계약 D15 「각 10회 왕복」 — D8 구조 왕복도 같은 값을 쓴다 (새 상수 0). */
const STRESS_ROUND_TRIPS = 10;
/** 부트스트랩 안정화 대기 — `verify:1215` · `verify:1226` 과 같은 값. */
const BOOT_SETTLE_MS = 2800;
/** 런타임 생성 머티리얼 준비 대기 상한 — `bootstrapScene` `handleTimeout` 기본값과 같은 값 (새 임계 0). */
const READY_TIMEOUT_MS = 20_000;

/** UI 판정 기본 로드 — D15 스트레스와 같은 쿼리 (4 효과 전부 켜진 상태 · focus=earth · 관찰 모드). */
const UI_BASE = STRESS;
/** D11 — 4 키를 전부 끈 로드 (로드 직후 URL 불변 · `?orbits=off` 북마크 불일치 해소). */
const UI_ALL_OFF = `${UI_BASE}&stars=off&clouds=off&nightlights=off&orbits=off`;
/** 계약 D1 — 모드 4종. */
const UI_MODES = ['observe', 'research', 'education', 'sandbox'];
/** 계약 D1 · D2 — 1280×720 (`setupPage` · `setupUiPage` 뷰포트와 같은 값). */
const UI_VIEWPORT_WIDTH = 1280;
/** 계약 D4 「4초간 입력이 없어도」 — 계약 문구의 값 (자동 숨김 3초 + 전환 여유). */
const D4_IDLE_MS = 4000;
/** D9 · D10 — 비활성 토글을 누르는 횟수. 첫 클릭은 OFF 명령이라 생성 경로 (ON) 를 열려면 2회가 필요하다. */
const DISABLED_CLICKS = 2;
/**
 * D9 · D10 사유 판별 표지 — 비활성 사유가 「비어 있지 않음」이 아니라 **그 이유**인지 본다 (reviewer B1 두 번째 면:
 * 장면 미준비 사유도 비어 있지 않은 `aria-disabled` 라 엉뚱한 이유로 PASS 했다). 가드는 앱 모듈을 import 하지
 * 않으므로 `display-toggles.ts` `DISPLAY_DISABLED_REASONS` 의 부분 문자열을 쓴다 — 미준비 사유에는 둘 다 없다.
 */
const REASON_MARK = { software: '소프트웨어', surfaceOff: 'surface=off' };
/** 트리거 이동 스크롤 — 우측 그룹이 `overflow-x-auto` 가 되는 좁은 폭 (`max-sm`, 640px 미만). r1-guard 모바일 폭과 같다. */
const NARROW_VIEWPORT = { width: 375, height: 667 };
/**
 * 레이스 반복 수. qa 재현율 SwiftShader `2/19` 를 기준으로 결함 판본을 한 번도 못 잡을 확률이 `(17/19)^40 ≈ 1.2%`
 * 가 되는 값이다 (새 판정 임계가 아니라 표본 크기 — 판정은 「실패 0 회」).
 */
const RACE_TRIALS = 40;
/** D10 대상 — 표면 종속 토글. */
const SURFACE_TOGGLES = ['clouds', 'nightLights'];

/** 결정적 프레임 페이지 · UI 경량 페이지 공통 뷰포트 (계약 D1 · D2 의 1280×720). */
const DEFAULT_VIEWPORT = { width: UI_VIEWPORT_WIDTH, height: 720 };

/**
 * 페이지 부팅 (`bootstrapScene`) 실패 — 섹션을 중단시키고 `run` 이 단독 재부팅으로 원인을 가른다 (전제 22).
 * 부팅 **뒤** 단계의 예외는 이 클래스가 아니다 (그대로 전파 → exit 1).
 */
class BootFailure extends Error {
  constructor({ label, query, viewport, errors, injected, contexts, cause }) {
    super(
      `${label} 부팅 실패 — ${cause?.name ?? 'Error'}: ${String(cause?.message ?? cause).split('\n')[0]}`,
    );
    this.name = 'BootFailure';
    Object.assign(this, { label, query, viewport, errors, injected, contexts });
  }
}

/** `INJECT=boot` 이 실제로 한 번 발화했는가 — 끝내 발화하지 않으면 `run` 이 공허 주입으로 끝낸다. */
let bootInjected = false;

/**
 * 새 컨텍스트에 페이지 1 개를 열고 부팅한다. `bootstrapScene` 예외는 컨텍스트를 닫고 `BootFailure` 로 던진다 —
 * 실패 페이지의 콘솔 에러는 실패에 실어 `run` 이 결과로 옮긴다 (콘솔 에러 게이트가 그 페이지도 본다).
 */
async function bootPage(browser, query, label, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = collectConsoleErrors(page);
  const injected = INJECT === 'boot' && label === INJECT_BOOT_LABEL && !bootInjected;
  if (injected) bootInjected = true;
  // 첫 시도의 열린 컨텍스트 수 (이 페이지 포함) — 부트 레코드 `contexts` 와 같은 값. 재부팅 성공의 서술을 가른다:
  // 1 이면 첫 시도도 단독이었으므로 재부팅은 판별이 아니라 재시도다 (reviewer B2).
  const contexts = browser.contexts().length;
  try {
    await bootstrapScene(page, {
      baseUrl: BASE_URL,
      query,
      handles: ['__simCore', '__solarScene'],
      settleMs: BOOT_SETTLE_MS,
      label,
      ...(injected ? { handleTimeout: INJECT_BOOT_HANDLE_TIMEOUT_MS } : {}),
    });
  } catch (cause) {
    await context.close().catch(() => {});
    throw new BootFailure({
      label,
      query,
      viewport,
      errors: [...errors],
      injected,
      contexts,
      cause,
    });
  }
  return { context, page, errors };
}

/**
 * 결정적 프레임 페이지. `hideOverlays: false` 는 UI 경로 페이지 전용 — 패널을 조작한 **뒤** `uiCapture` 가
 * 숨긴다 (숨긴 채로는 패널을 누를 수 없다). 숨김은 DOM `visibility` 만 바꿔 캔버스 기하·렌더와 무관하다.
 */
async function setupPage(browser, pages, query, label, jd, { hideOverlays = true } = {}) {
  const { context, page, errors } = await bootPage(browser, query, label, DEFAULT_VIEWPORT);
  // 부팅 직후 열린 페이지 목록에 등록한다 — 같은 블록의 **다음** 페이지가 부팅에 실패해도 이 페이지가 해제 ·
  // 데이터 이동 대상에 들어 있어야 단독 재부팅이 정말 단독이 된다 (#1271 — 블록 끝에서 몰아 등록하던 판본은 F 실패 시
  // E 가 목록 밖에 남아 재부팅이 ctx 2 로 돌았다).
  const ctx = { context, page, errors, settles: [], label };
  pages.push(ctx);
  // #1219 — 캔버스 위 DOM 이 캡처에 섞이지 않게 숨긴다 (캔버스 개수 fail-fast 포함).
  if (hideOverlays) await hideDomOverlays(page);
  await page.evaluate((j) => {
    window.__simCore.command({ type: 'jumpToJulianDate', julianDate: j });
    window.__simCore.command({ type: 'pause' });
  }, jd);
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    window.__simCore.scene.activeCamera.beta = Math.PI / 2;
  });
  const settle = await waitForLodSettle(page);
  ctx.settles.push({ step: 'boot', ...settle });
  // 조작 전 로드 상태 — 「로드 경로 구조」 게이트가 쌍의 기준 페이지가 제 로드 상태인지 본다 (양성 대조 (3) 이
  // 「효과가 쌍에 없다」로 끝나기 전에, 그 원인이 로드 경로 결함인지를 게이트로 먼저 가른다).
  ctx.loadDisplay = await readSceneDisplay(ctx);
  return ctx;
}

const frames = (page, n = 4) =>
  page.evaluate(
    (k) =>
      new Promise((res) => {
        let i = 0;
        const f = () => (++i >= k ? res() : requestAnimationFrame(f));
        requestAnimationFrame(f);
      }),
    n,
  );

async function capture(ctx, name) {
  await frames(ctx.page, 4);
  const buf = await ctx.page.locator('canvas').first().screenshot();
  if (CAPTURE_DIR) {
    await mkdir(CAPTURE_DIR, { recursive: true });
    await writeFile(path.join(CAPTURE_DIR, `1265-${name}.png`), buf);
  }
  return buf.toString('base64');
}

/**
 * `postToggle` — 이 페이지에서 런타임 토글을 **한 뒤**의 정착이다. 그 정착이 끝나지 않는 원인에는 #1265 결함
 * (예: 토글 뒤 lazy mid 생성 실패) 이 들어가므로 측정 불가가 아니라 게이트로 판정한다 (라운드 3 전제 감사).
 */
async function settleLod(ctx, step, override, { postToggle = false } = {}) {
  await ctx.page.evaluate((o) => window.__solarScene.setLodOverride(o), override);
  await frames(ctx.page, 2);
  const s = await waitForLodSettle(ctx.page);
  ctx.settles.push({ step, postToggle, ...s });
}

/** scene setter 직접 호출 (PR1 — UI 경로 없음). */
const callSetter = (ctx, setter, visible) =>
  ctx.page.evaluate(({ s, v }) => window.__solarScene[s](v), { s: setter, v: visible });

/**
 * 런타임에 새로 만든 mesh 의 머티리얼이 컴파일될 때까지 대기 — 준비 전 프레임에서는 mesh 가 그려지지 않아
 * 「런타임 ON = 로드 ON」 비교가 결함 없이도 FAIL 한다.
 *
 * mesh **부재** (`{ absent }`) 와 **준비 초과** (`{ error }`) 를 가른다. 성격은 호출부가 정한다 — 런타임 ON 직후 ·
 * 토글 뒤 lazy mid 는 게이트 (`onChecks` · `postToggleReady`), 토글 없는 페이지의 하네스 mid 만 전제 (`harnessReady`).
 */
async function waitMaterialReady(ctx, meshName) {
  if (!(await hasMesh(ctx, meshName)))
    return { absent: true, page: ctx.label, label: `${ctx.label}: ${meshName}` };
  try {
    await ctx.page.waitForFunction(
      (n) => {
        const m = window.__simCore.scene.getMeshByName(n);
        return !!m && !!m.material && m.material.isReady(m);
      },
      meshName,
      { timeout: READY_TIMEOUT_MS },
    );
    return { ok: true, page: ctx.label };
  } catch {
    return {
      error: `${ctx.label}: ${meshName} 머티리얼 준비 대기 ${READY_TIMEOUT_MS}ms 초과`,
      page: ctx.label,
    };
  }
}

const readCounts = (ctx) =>
  ctx.page.evaluate(
    ({ cloud, star }) => {
      const s = window.__simCore.scene;
      return {
        meshes: s.meshes.length,
        materials: s.materials.length,
        clouds: s.meshes.filter((m) => m.name === cloud).length,
        stars: s.meshes.filter((m) => m.name === star).length,
      };
    },
    { cloud: CLOUD_MESH, star: STARFIELD_MESH },
  );

/** 그룹 0 정렬 함수가 생성자 기본값인가 (Babylon internal — 구조 술어). */
const readSortState = (ctx) =>
  ctx.page.evaluate(() => {
    const g = window.__simCore.scene._renderingManager?._renderingGroups?.[0];
    if (!g) return { error: '렌더링 그룹 0 조회 실패' };
    const C = g.constructor;
    return {
      transparentDefault: g._transparentSortCompareFn === C.defaultTransparentSortCompare,
      opaqueDefault: g._opaqueSortCompareFn === C.PainterSortCompare,
    };
  });

/**
 * D8p — 렌더링 그룹 0 의 불투명 mesh 를 구조로 열거한다 (Babylon `RenderingGroup.dispatch` 의 분류와 같은 술어:
 * 블렌드도 알파 테스트도 아니면 불투명 큐). 뷰·프레임과 무관하다.
 * ⚠️ 분기식만 같다 — Babylon 은 `subMesh.getMaterial()` (render-pass 머티리얼 · null 이면 defaultMaterial ·
 * MultiMaterial 이면 sub-material) 로 머티리얼을 풀지만 여기서는 `mesh.material` 만 본다. 현재 저장소에
 * MultiMaterial · render-pass 머티리얼이 없고 null-material mesh 는 default(depth write on) 라 양성을 놓치지
 * 않는다. 둘 중 하나가 도입되면 이 술어를 다시 맞출 것.
 */
const readOpaqueGroup0 = (ctx) =>
  ctx.page.evaluate(() => {
    const entries = [];
    for (const m of window.__simCore.scene.meshes) {
      const mat = m.material;
      if (m.renderingGroupId !== 0 || !mat) continue;
      if (mat.needAlphaBlendingForMesh(m) || mat.needAlphaTestingForMesh(m)) continue;
      entries.push({ name: m.name, noDepthWrite: mat.disableDepthWrite === true });
    }
    return { entries };
  });

const readQueue = async (ctx, field) => {
  await frames(ctx.page, 2);
  return ctx.page.evaluate((f) => {
    const q = window.__simCore.scene._renderingManager?._renderingGroups?.[0]?.[f];
    if (!q) return { error: `렌더링 그룹 0 ${f} 조회 실패` };
    return {
      entries: q.data.slice(0, q.length).map((s) => {
        const m = s.getMesh();
        return { name: m.name, noDepthWrite: m.material?.disableDepthWrite === true };
      }),
    };
  }, field);
};

/** `nightLightStrength` uniform 을 가진 머티리얼 전부의 값 (절차 행성 머티리얼만 가진다). */
const readAllLightStrengths = (ctx) =>
  ctx.page.evaluate(() =>
    window.__simCore.scene.materials
      .filter((m) => m._floats && m._floats.nightLightStrength !== undefined)
      .map((m) => ({ name: m.name, v: m._floats.nightLightStrength })),
  );

const hasMesh = (ctx, name) =>
  ctx.page.evaluate((n) => window.__simCore.scene.getMeshByName(n) !== null, name);

/** fade 창 정지 재현 — `verify:1215` `installFadeFreeze` 와 같은 본문 (host · mid 매 프레임 가시 + alpha 0.999). */
const installFadeFreeze = (ctx) =>
  ctx.page.evaluate(() => {
    const scene = window.__simCore.scene;
    const host = window.__solarScene.meshes.get('earth');
    const mid = scene.getMeshByName('earth-lod-mid');
    if (!host || !mid) return { error: 'earth / earth-lod-mid 부재' };
    window.__fadeFreeze = scene.onBeforeRenderObservable.add(() => {
      host.isVisible = true;
      mid.isVisible = true;
      host.material.alpha = 0.999;
      mid.material.alpha = 0.999;
    });
    return { ok: true };
  });

/**
 * 프레임 쌍의 지구 disk 측정 — `verify:1226` `measurePair` 의 역투영 식 사본 (disk · 낮면/밤면 내부 대역 +
 * full frame). 기하는 이 페이지 (ctx) 의 카메라로 계산하고 쌍 기하 일치는 호출부 (`measureCheckedPair`) 가 본다.
 */
async function measurePair(ctx, aB64, bB64) {
  return ctx.page.evaluate(
    async ({ a, b, P }) => {
      const scene = window.__simCore?.scene;
      const mesh = window.__solarScene?.meshes?.get('earth');
      if (!scene || !mesh) return { error: 'earth mesh/scene 부재' };
      const canvasCount = document.querySelectorAll('canvas').length;
      if (canvasCount !== 1) return { error: `캔버스 개수 ${canvasCount} ≠ 1 (#1219)` };
      const engine = scene.getEngine();
      const rw = engine.getRenderWidth();
      const rh = engine.getRenderHeight();
      const camera = scene.activeCamera;
      const V = mesh.getAbsolutePosition().constructor;
      const fw = camera.getDirection(new V(0, 0, 1));
      const rt = camera.getDirection(new V(1, 0, 0));
      const up = camera.getDirection(new V(0, 1, 0));
      const cp = camera.globalPosition ?? camera.position;
      const ct = mesh.getAbsolutePosition();
      // Babylon 구의 boundingSphere 는 AABB 반대각선 (r√3) — 1202 · 1215 · 1226 과 같은 보정.
      const R = mesh.getBoundingInfo().boundingSphere.radiusWorld / Math.sqrt(3);
      let sunPos = null;
      for (const l of scene.lights) {
        if (l.position && (l.name === 'sun-light' || l.getClassName?.() === 'PointLight')) {
          sunPos = l.position;
          break;
        }
      }
      if (!sunPos) return { error: 'sunLight 부재' };
      const nums = [fw.x, fw.y, fw.z, rt.x, rt.y, rt.z, up.x, up.y, up.z];
      nums.push(cp.x, cp.y, cp.z, ct.x, ct.y, ct.z, R, camera.fov, sunPos.x, sunPos.y, sunPos.z);
      // 비유한 값이면 `disc < 0` 이 거짓이라 프레임 전체가 disk 로 잡히고, 반경 0 이면 disk 가 비어 `== 0`
      // 술어가 공허 참이 된다 — 둘 다 판정 전에 측정 오류로 끝낸다 (1215 reviewer R1 · R2).
      if (!nums.every(Number.isFinite) || !(R > 0))
        return { error: `기하 무효 — 비유한 값 또는 반경 ≤ 0 (radius ${R})` };
      const sd = sunPos.subtract(ct).normalize();

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
          d: c.getContext('2d').getImageData(0, 0, img.width, img.height).data,
          w: img.width,
          h: img.height,
        };
      };
      const A = await load(a);
      const B = await load(b);
      if (A.d.length !== B.d.length) return { error: '캔버스 크기 불일치' };
      const sx = A.w / rw;
      const sy = A.h / rh;
      const same = (p, q, i) => p[i] === q[i] && p[i + 1] === q[i + 1] && p[i + 2] === q[i + 2];
      const th = Math.tan(camera.fov / 2);
      const asp = rw / rh;

      const mk = () => ({ n: 0, changed: 0 });
      const disk = mk();
      const DI = mk();
      const NI = mk();
      const push = (acc, i) => {
        acc.n += 1;
        if (!same(A.d, B.d, i)) acc.changed += 1;
      };
      const inDisk = new Uint8Array(A.w * A.h);
      for (let y = 0; y < rh; y += 1) {
        for (let x = 0; x < rw; x += 1) {
          const nx0 = ((x + 0.5) / rw) * 2 - 1;
          const ny0 = 1 - ((y + 0.5) / rh) * 2;
          const rx = fw.x + rt.x * nx0 * th * asp + up.x * ny0 * th;
          const ry = fw.y + rt.y * nx0 * th * asp + up.y * ny0 * th;
          const rz = fw.z + rt.z * nx0 * th * asp + up.z * ny0 * th;
          const rl = Math.hypot(rx, ry, rz);
          const dx = rx / rl;
          const dy = ry / rl;
          const dz = rz / rl;
          const ox = cp.x - ct.x;
          const oy = cp.y - ct.y;
          const oz = cp.z - ct.z;
          const bq = ox * dx + oy * dy + oz * dz;
          const disc = bq * bq - (ox * ox + oy * oy + oz * oz - R * R);
          if (disc < 0) continue;
          const t = -bq - Math.sqrt(disc);
          if (t < 0) continue;
          const nx = (ox + t * dx) / R;
          const ny = (oy + t * dy) / R;
          const nz = (oz + t * dz) / R;
          const vx = cp.x - (ct.x + nx * R);
          const vy = cp.y - (ct.y + ny * R);
          const vz = cp.z - (ct.z + nz * R);
          const ndv = (nx * vx + ny * vy + nz * vz) / Math.hypot(vx, vy, vz);
          const ndl = nx * sd.x + ny * sd.y + nz * sd.z;
          const px = Math.round(x * sx);
          const py = Math.round(y * sy);
          if (px < 0 || py < 0 || px >= A.w || py >= A.h) continue;
          const i = (py * A.w + px) * 4;
          inDisk[py * A.w + px] = 1;
          push(disk, i);
          if (ndv < P.INNER_NDV_MIN) continue;
          if (ndl >= P.DAY_NDL_MIN) push(DI, i);
          if (ndl <= P.NIGHT_NDL_MAX) push(NI, i);
        }
      }
      let fullChanged = 0;
      let outsideChanged = 0;
      for (let p = 0; p < A.w * A.h; p += 1) {
        if (!same(A.d, B.d, p * 4)) {
          fullChanged += 1;
          if (!inDisk[p]) outsideChanged += 1;
        }
      }
      return { disk, DI, NI, fullChanged, outsideChanged };
    },
    // 대역 정의 — `verify:1202` SSoT 값 (1215 · 1226 과 동일, 새 상수 0).
    { a: aB64, b: bB64, P: { INNER_NDV_MIN: 0.6, DAY_NDL_MIN: 0.15, NIGHT_NDL_MAX: -0.15 } },
  );
}

/** 페이지 기하 키 — `verify:1226` `readGeomKey` 와 같은 항목 (카메라 위치 · 지구 중심 · fov). */
const readGeomKey = (ctx) =>
  ctx.page.evaluate(() => {
    const cam = window.__simCore.scene.activeCamera;
    const c = window.__solarScene.meshes.get('earth').getAbsolutePosition();
    const p = cam.globalPosition;
    return [p.x, p.y, p.z, c.x, c.y, c.z, cam.fov].join(',');
  });

/** 두 페이지 기하가 정확히 같을 때만 쌍을 잰다 (#1215 cross-validate X3). 판정 기하는 `ctxA`. */
async function measureCheckedPair(ctxA, aB64, ctxB, bB64, label) {
  const gA = await readGeomKey(ctxA);
  const gB = await readGeomKey(ctxB);
  if (gA !== gB) return { error: `${label} 페이지 기하 불일치 (${gA} vs ${gB})` };
  return measurePair(ctxA, aB64, bB64);
}

/** 기하 키 — 읽기 실패 (지구 mesh 부재 등) 는 문자열로 남긴다. */
async function safeGeomKey(ctx) {
  try {
    return await readGeomKey(ctx);
  } catch (e) {
    return `error: ${e.message}`;
  }
}

/**
 * 토글 한 번의 앞뒤로 이 페이지 자신의 기하 (카메라 · 지구 중심 · fov) 를 기록한다. 쌍 기하 불일치는 측정 불가 (2)
 * 인데, 그 불일치를 **토글이 만들었다면** 제품 결함이다 (예: 패널 클릭이 캔버스로 새어 천체가 선택됨) — 게이트
 * 「토글 전후 페이지 기하 불변」 이 따로 잡는다 (라운드 3 전제 감사).
 */
async function withGeomCheck(ctx, out, action) {
  const before = await safeGeomKey(ctx);
  await action();
  out.toggleGeom.push({ label: ctx.label, before, after: await safeGeomKey(ctx) });
}

// ── UI 경로 (PR2 — 표시 패널) ─────────────────────────────────────────────────

const PANEL_TRIGGER = '[data-testid="display-panel-toggle"]';
const PANEL = '[data-testid="display-panel"]';
const toggleSel = (id) => `[data-testid="display-toggle-${id}"]`;
/** 패널 토글 id → URL 키 (`display-toggles.ts` 표와 같은 값 — 가드는 앱 모듈을 import 하지 않는다). */
const UI_URL_KEY = {
  orbits: 'orbits',
  stars: 'stars',
  clouds: 'clouds',
  nightLights: 'nightlights',
};
const UI_IDS = Object.keys(UI_URL_KEY);

/** 패널 열림/닫힘을 트리거 클릭으로 맞춘다. 결과(패널 개수)는 호출부가 판정한다. */
async function setPanelOpen(page, open) {
  const trigger = page.locator(PANEL_TRIGGER);
  const expanded = (await trigger.getAttribute('aria-expanded')) === 'true';
  if (expanded !== open) await trigger.click({ timeout: READY_TIMEOUT_MS });
}

const panelCount = (page) => page.locator(PANEL).count();

/** 트리거 화면 위치 (패널 배치 입력값 — `right` · `bottom`) 문자열. 스크롤 닫기 판정의 전제 (트리거가 움직였는가). */
const readTriggerRect = (page) =>
  page.evaluate(() => {
    const r = document
      .querySelector('[data-testid="display-panel-toggle"]')
      .getBoundingClientRect();
    return `${r.right},${r.bottom}`;
  });

/**
 * 토글 클릭. `aria-disabled` 토글은 Playwright 가 「비활성」으로 보고 actionability 대기에서 멈추므로
 * `force` 로 누른다 — 실제 마우스 클릭은 그대로 일어나고, 차단은 제품(`toggle()` 가용성 검사) 이 해야 한다.
 */
async function clickToggle(page, id) {
  const el = page.locator(toggleSel(id));
  const disabled = (await el.getAttribute('aria-disabled')) === 'true';
  await el.click({ timeout: READY_TIMEOUT_MS, force: disabled });
}

/** 패널 열기 → 토글 1회 → 패널 닫기. */
async function uiToggle(ctx, id) {
  await setPanelOpen(ctx.page, true);
  await clickToggle(ctx.page, id);
  await setPanelOpen(ctx.page, false);
}

/**
 * UI 경로 캡처 — **패널이 닫혀 있는지 센 뒤** DOM 을 숨기고 찍는다 (계약 「캡처는 패널을 닫은 뒤」 · #1219).
 * 남은 패널 개수는 게이트가 본다 (닫히지 않는 패널은 제품 결함 — 측정 불가가 아니다).
 */
async function uiCapture(ctx, name, out) {
  out.uiPanelsAtCapture.push({ label: `${ctx.label}/${name}`, panels: await panelCount(ctx.page) });
  await hideDomOverlays(ctx.page);
  return capture(ctx, name);
}

const readPanelPressed = (page) =>
  page.evaluate(
    (ids) =>
      Object.fromEntries(
        ids.map((id) => [
          id,
          document
            .querySelector(`[data-testid="display-toggle-${id}"]`)
            ?.getAttribute('aria-pressed') ?? null,
        ]),
      ),
    UI_IDS,
  );

/** scene 의 표시 상태 4축 — D11 새로고침 비교용. */
const readSceneDisplay = (ctx) =>
  ctx.page.evaluate(
    ({ star, cloud }) => {
      const s = window.__simCore.scene;
      const earth = window.__solarScene.meshes.get('earth');
      return {
        orbits: s.getMeshByName('orbit-lines')?.isVisible ?? null,
        stars: s.meshes.filter((m) => m.name === star && m.isEnabled()).length,
        clouds: s.meshes.filter((m) => m.name === cloud).length,
        nightLight: earth?.material?._floats?.nightLightStrength ?? null,
      };
    },
    { star: STARFIELD_MESH, cloud: CLOUD_MESH },
  );

const readUrlKeys = (page) =>
  page.evaluate((keys) => {
    const sp = new URLSearchParams(window.location.search);
    return Object.fromEntries(keys.map((k) => [k, sp.get(k)]));
  }, Object.values(UI_URL_KEY));

/**
 * URL 키가 기대값이 될 때까지 대기 (`null` = 키 부재). 타임아웃은 `bootstrapScene` `handleTimeout` 기본값과
 * 같은 값 (새 임계 0). 도달하지 못하면 `false` — URL 을 쓰지 않는 것은 제품 결함이라 게이트가 FAIL 로 낸다.
 */
async function waitUrlKey(page, key, expected) {
  try {
    await page.waitForFunction(
      ({ k, v }) => new URLSearchParams(window.location.search).get(k) === v,
      { k: key, v: expected },
      { timeout: READY_TIMEOUT_MS },
    );
    return true;
  } catch {
    return false;
  }
}

/** 북마크 버튼이 복사한 URL — `navigator.clipboard.writeText` 스텁으로 가로챈다 (실 클립보드 무접촉). */
async function readBookmarkUrl(page) {
  await page.evaluate(() => {
    window.__bookmarkCopies = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (t) => {
          window.__bookmarkCopies.push(t);
        },
      },
    });
  });
  await page.locator('[data-testid="bookmark-button"]').click({ timeout: READY_TIMEOUT_MS });
  try {
    await page.waitForFunction(() => window.__bookmarkCopies.length > 0, undefined, {
      timeout: READY_TIMEOUT_MS,
    });
  } catch {
    return null;
  }
  return page.evaluate(() => window.__bookmarkCopies.at(-1));
}

const activeTestId = (page) =>
  page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null);

const readStoreSel = (page) =>
  page.evaluate(() => {
    const st = window.__simStore.getState();
    return {
      mode: st.mode,
      selectedBodyId: st.selectedBodyId,
      freeFlyMode: st.freeFlyMode,
      orbitLinesVisible: st.orbitLinesVisible,
      caps: st.displayCapabilities,
    };
  });

/** 장면 준비 (신규 3 토글 가용성 확정) 대기 — sim-canvas 가 핸들러 등록 뒤 `displayCapabilities` 를 연다. */
const waitCapsReady = (page) =>
  page.waitForFunction(
    () =>
      !!window.__simCore &&
      !!window.__solarScene &&
      window.__simStore?.getState().displayCapabilities !== null,
    undefined,
    { timeout: READY_TIMEOUT_MS },
  );

/**
 * UI 페이지 부팅 직후 장면 준비 (`displayCapabilities`) 를 기록한다. 이 값은 sim-canvas 가 여는 **제품** 가용성
 * 게이트라 전제가 아니라 게이트로 판정한다 (reviewer B1 — 측정 불가로 흡수하면 결함을 잡는 게이트 6개가 가려진다).
 * 대기 상한은 `READY_TIMEOUT_MS` (새 임계 0). 끝내 `null` 이면 `null` 로 남긴다.
 */
async function recordBootCaps(ctx, out) {
  let caps = null;
  try {
    await waitCapsReady(ctx.page);
    caps = (await readStoreSel(ctx.page)).caps;
  } catch {
    caps = null;
  }
  out.uiCapsAtBoot.push({ label: ctx.label, caps });
  return caps;
}

/** 경량 페이지 — 결정적 프레임이 필요 없는 UI 판정 (D1 · D2 · D10 · D11). */
async function setupUiPage(browser, pages, query, label, viewport = DEFAULT_VIEWPORT) {
  const { context, page, errors } = await bootPage(browser, query, label, viewport);
  const ctx = { context, page, errors, settles: [], label };
  pages.push(ctx); // 부팅 직후 등록 — `setupPage` 와 같은 이유
  return ctx;
}

// ── 섹션 ───────────────────────────────────────────────────────────────────

/** D5 · D6 · D6f — 구름. */
async function runClouds(browser, out, pages) {
  // ── D5 — 로드 ON 에서 런타임 OFF ↔ 로드 OFF (자전 OFF 프레임 — verify:1215 주 쌍) ──
  const A = await setupPage(browser, pages, Q.cloudOn, 'A-cloudOn', T_JD_CLOUD);
  const B = await setupPage(browser, pages, Q.cloudOff, 'B-cloudOff', T_JD_CLOUD);
  out.d8pA = await readOpaqueGroup0(A);
  const aPre = await capture(A, 'A-pre');
  const bImg = await capture(B, 'B');
  out.d5Positive = await measureCheckedPair(A, aPre, B, bImg, 'd5Positive');
  await withGeomCheck(A, out, () => callSetter(A, 'setCloudsVisible', false));
  const aOff = await capture(A, 'A-runtime-off');
  if (INJECT === 'geom') {
    await A.page.evaluate(() => {
      window.__simCore.scene.activeCamera.alpha += 0.5;
    });
    await frames(A.page, 4);
    out.injectNote = 'geom — D5 캡처 뒤 A 카메라 alpha +0.5 rad (쌍 기하 이탈)';
  }
  out.d5 = await measureCheckedPair(A, aOff, B, bImg, 'd5');
  out.d5CountsA = await readCounts(A);
  out.d5SortA = await readSortState(A);
  out.d5SortB = await readSortState(B);
  // D5 (UI) — 같은 로드 ON 쿼리를 **패널**로 끈다 ↔ 같은 로드 OFF 캡처 (B). 구조 술어도 같이 본다.
  const Au = await setupPage(browser, pages, Q.cloudOn, 'Au-cloudOn-ui', T_JD_CLOUD, {
    hideOverlays: false,
  });
  await recordBootCaps(Au, out);
  await withGeomCheck(Au, out, () => uiToggle(Au, 'clouds'));
  out.d5ui = await measureCheckedPair(Au, await uiCapture(Au, 'Au-ui-off', out), B, bImg, 'd5ui');
  out.d5uiCounts = await readCounts(Au);
  out.d5uiSort = await readSortState(Au);
  // 블록 경계 해제 (#1271 A1) — 뒤 블록은 A · B · Au 를 다시 쓰지 않는다 (B 캡처 `bImg` 도 여기서 끝).
  await retirePages(out, pages);

  // ── D6 — 로드 OFF (자전 ON) 에서 런타임 ON ↔ 로드 ON + 왕복 누수 ──
  const C = await setupPage(browser, pages, Q.cloudRotOff, 'C-cloudRotOff', T_JD_CLOUD);
  const D = await setupPage(browser, pages, Q.cloudRotOn, 'D-cloudRotOn', T_JD_CLOUD);
  const cPre = await capture(C, 'C-pre');
  const dImg = await capture(D, 'D');
  out.d6Positive = await measureCheckedPair(C, cPre, D, dImg, 'd6Positive');
  const countsOffLoad = await readCounts(C);
  await withGeomCheck(C, out, () => callSetter(C, 'setCloudsVisible', true));
  out.onChecks.push(await waitMaterialReady(C, CLOUD_MESH));
  out.d6 = await measureCheckedPair(C, await capture(C, 'C-runtime-on'), D, dImg, 'd6');
  const countsOn = await readCounts(C);
  const trips = [];
  for (let i = 0; i < CLOUD_ROUND_TRIPS; i += 1) {
    await callSetter(C, 'setCloudsVisible', false);
    await frames(C.page, 2);
    const off = await readCounts(C);
    await callSetter(C, 'setCloudsVisible', true);
    out.onChecks.push(await waitMaterialReady(C, CLOUD_MESH));
    const on = await readCounts(C);
    trips.push({ off, on });
  }
  out.d6Leak = { countsOffLoad, countsOn, trips };
  out.d6AfterTrips = await measureCheckedPair(
    C,
    await capture(C, 'C-after-trips'),
    D,
    dImg,
    'd6AfterTrips',
  );
  // D6 (UI) — `&clouds=off` (자전 ON) 로드를 **패널**로 켠다 ↔ 로드 ON 캡처 (D).
  const Cu = await setupPage(browser, pages, Q.cloudRotOff, 'Cu-cloudRotOff-ui', T_JD_CLOUD, {
    hideOverlays: false,
  });
  await recordBootCaps(Cu, out);
  await withGeomCheck(Cu, out, () => uiToggle(Cu, 'clouds'));
  out.onChecks.push(await waitMaterialReady(Cu, CLOUD_MESH));
  out.d6ui = await measureCheckedPair(Cu, await uiCapture(Cu, 'Cu-ui-on', out), D, dImg, 'd6ui');
  // 블록 경계 해제 (#1271 A1) — D6f 는 새 쿼리 쌍 E · F 만 쓴다.
  await retirePages(out, pages);

  // ── D6f — mid 선생성 뒤 ON (자전 OFF 프레임). 계열 등록 누락은 여기서 픽셀로 드러나지 않는다 (헤더 D6f ⚠️) ──
  const E = await setupPage(browser, pages, Q.cloudOff, 'E-cloudOff-mid', T_JD_CLOUD);
  const F = await setupPage(browser, pages, Q.cloudOn, 'F-cloudOn-mid', T_JD_CLOUD);
  for (const ctx of [E, F]) {
    await settleLod(ctx, 'mid', 'mid');
    await settleLod(ctx, 'auto', 'auto');
  }
  out.d6fMidBeforeOn = await hasMesh(E, EARTH_MID);
  await withGeomCheck(E, out, () => callSetter(E, 'setCloudsVisible', true));
  // 토글 뒤 mid 유지 — ON 이 기존 mid 를 치우면 제품 결함 (fade 재현 설치 실패로 측정 불가에 묻히지 않게 게이트로).
  out.d6fMidAfterOn = await hasMesh(E, EARTH_MID);
  out.onChecks.push(await waitMaterialReady(E, CLOUD_MESH));
  const fzE = await installFadeFreeze(E);
  const fzF = await installFadeFreeze(F);
  if (fzE.error || fzF.error)
    out.d6f = { error: `fade 정지 설치 실패 (${fzE.error ?? fzF.error})` };
  else
    out.d6f = await measureCheckedPair(
      E,
      await capture(E, 'E-fade'),
      F,
      await capture(F, 'F-fade'),
      'd6f',
    );
  out.d6fQueueE = await readQueue(E, '_transparentSubMeshes');
  out.d6fQueueF = await readQueue(F, '_transparentSubMeshes');
}

/** D7 · D7m · D7e — 야간 불빛. */
async function runNightLights(browser, out, pages) {
  const P1 = await setupPage(browser, pages, Q.nightP1, 'P1-night', T_JD_NIGHT);
  const P2 = await setupPage(browser, pages, Q.nightP2, 'P2-nightOff', T_JD_NIGHT);
  const p1Pre = await capture(P1, 'P1-pre');
  const p2Img = await capture(P2, 'P2');
  out.d7Positive = await measureCheckedPair(P1, p1Pre, P2, p2Img, 'd7Positive');
  out.d7MidBeforeOff = await hasMesh(P1, EARTH_MID);
  await withGeomCheck(P1, out, () => callSetter(P1, 'setNightLightsVisible', false));
  out.d7 = await measureCheckedPair(P1, await capture(P1, 'P1-runtime-off'), P2, p2Img, 'd7');
  out.d7Strengths = await readAllLightStrengths(P1);
  // D7 (UI) — P1 쿼리를 **패널**로 끈다 ↔ P2 로드 캡처. (D7m 이 P2 의 LOD 를 바꾸기 전에 잰다.)
  const P1u = await setupPage(browser, pages, Q.nightP1, 'P1u-night-ui', T_JD_NIGHT, {
    hideOverlays: false,
  });
  await recordBootCaps(P1u, out);
  await withGeomCheck(P1u, out, () => uiToggle(P1u, 'nightLights'));
  out.d7ui = await measureCheckedPair(
    P1u,
    await uiCapture(P1u, 'P1u-ui-off', out),
    P2,
    p2Img,
    'd7ui',
  );
  out.d7uiStrengths = await readAllLightStrengths(P1u);
  // P1u 는 D7 UI 에서 끝난다 — D7m 은 P1 · P2 만 쓴다 (#1271 A1).
  await retirePages(out, pages, [P1u]);
  // D7m — 끈 뒤 두 페이지 모두 mid 정착 (P1 의 mid 가 OFF 이후 생성이면 lazy 상태 경로를 탄다).
  await settleLod(P1, 'mid', 'mid', { postToggle: true });
  await settleLod(P2, 'mid', 'mid');
  // P1 은 불빛을 끈 **뒤** 의 lazy mid — 부재 · 준비 초과가 #1265 결함일 수 있어 게이트 쪽으로 (P2 는 하네스).
  out.postToggleReady.push(await waitMaterialReady(P1, EARTH_MID));
  out.harnessReady.push(await waitMaterialReady(P2, EARTH_MID));
  out.d7m = await measureCheckedPair(
    P1,
    await capture(P1, 'P1-mid'),
    P2,
    await capture(P2, 'P2-mid'),
    'd7m',
  );
  // 블록 경계 해제 (#1271 A1) — D7e 는 개요 페이지 O 만 쓴다.
  await retirePages(out, pages);

  // ── D7e — 개요에서 끈 뒤 지구 focus → mid 정착 ──
  const O = await setupPage(browser, pages, Q.nightOverview, 'O-overview', T_JD_NIGHT);
  out.d7eMidAtToggle = await hasMesh(O, EARTH_MID);
  await callSetter(O, 'setNightLightsVisible', false);
  await O.page.evaluate(() => window.__simCore.command({ type: 'focusOn', bodyId: 'earth' }));
  const focusSettle = await waitForLodSettle(O.page);
  O.settles.push({ step: 'focus', postToggle: true, ...focusSettle });
  await settleLod(O, 'mid', 'mid', { postToggle: true });
  out.d7eMidAfter = await hasMesh(O, EARTH_MID);
  out.d7eEarth = await O.page.evaluate(() => {
    const earth = window.__solarScene.meshes.get('earth');
    return [earth, ...earth.getChildMeshes()]
      .filter((m) => m === earth || m.name.startsWith('earth-lod-'))
      .map((m) => ({ name: m.name, v: m.material?._floats?.nightLightStrength ?? null }))
      .filter((e) => e.v !== null);
  });
  out.d7eAll = await readAllLightStrengths(O);
}

/** D8 · D8p — 별 배경. */
async function runStars(browser, out, pages) {
  const S = await setupPage(browser, pages, Q.starsOff, 'S-starsOff', T_JD_CLOUD);
  out.software = await S.page.evaluate(() => window.__isSoftwareRenderer === true);
  out.d8LoadCounts = await readCounts(S);
  await callSetter(S, 'setStarfieldVisible', true);
  out.onChecks.push(await waitMaterialReady(S, STARFIELD_MESH));
  const firstId = await S.page.evaluate(
    (n) => window.__simCore.scene.getMeshByName(n)?.uniqueId ?? null,
    STARFIELD_MESH,
  );
  out.d8AfterOn = await readCounts(S);
  out.d8pS = await readOpaqueGroup0(S);
  for (let i = 0; i < STRESS_ROUND_TRIPS; i += 1) {
    await callSetter(S, 'setStarfieldVisible', false);
    await callSetter(S, 'setStarfieldVisible', true);
  }
  await frames(S.page, 2);
  out.d8AfterTrips = await readCounts(S);
  out.d8SameInstance =
    firstId !== null &&
    (await S.page.evaluate(
      ({ n, id }) => window.__simCore.scene.getMeshByName(n)?.uniqueId === id,
      { n: STARFIELD_MESH, id: firstId },
    ));
  await callSetter(S, 'setStarfieldVisible', false);
  out.d8OffEnabled = await S.page.evaluate(
    (n) => window.__simCore.scene.getMeshByName(n)?.isEnabled() ?? null,
    STARFIELD_MESH,
  );
  // 블록 경계 해제 (#1271 A1) — 픽셀 블록은 S 를 쓰지 않는다.
  await retirePages(out, pages);

  // ── D8 픽셀 — 하드웨어 전용 (소프트웨어 렌더는 로드 ON 에서도 별을 만들지 않는다 — #745) ──
  if (out.software) {
    out.d8Pixel = {
      skipped:
        '소프트웨어 렌더 — 로드 ON 에 별이 없어 쌍이 성립하지 않는다 (D8b 와 함께 실 Chrome 수동)',
    };
    return;
  }
  const H1 = await setupPage(browser, pages, Q.starsOn, 'H1-starsOn', T_JD_CLOUD);
  const H2 = await setupPage(browser, pages, Q.starsOff, 'H2-starsOff', T_JD_CLOUD);
  const H3 = await setupPage(browser, pages, Q.starsOn, 'H3-starsOn', T_JD_CLOUD);
  const h1Pre = await capture(H1, 'H1-pre');
  const h2Img = await capture(H2, 'H2');
  const h3Img = await capture(H3, 'H3');
  out.d8Determinism = await measureCheckedPair(H1, h1Pre, H3, h3Img, 'd8Determinism');
  // H3 은 결정성 쌍에서 끝난다 — H1u 를 열기 전에 닫아 열린 컨텍스트를 3 이하로 둔다 (#1271 A1).
  await retirePages(out, pages, [H3]);
  out.d8Positive = await measureCheckedPair(H1, h1Pre, H2, h2Img, 'd8Positive');
  await withGeomCheck(H1, out, () => callSetter(H1, 'setStarfieldVisible', false));
  out.d8Pixel = await measureCheckedPair(H1, await capture(H1, 'H1-runtime-off'), H2, h2Img, 'd8');
  // D8 (UI) — 로드 ON 을 **패널**로 끈다 ↔ `&stars=off` 로드 full frame (하드웨어 전용).
  const H1u = await setupPage(browser, pages, Q.starsOn, 'H1u-starsOn-ui', T_JD_CLOUD, {
    hideOverlays: false,
  });
  await recordBootCaps(H1u, out);
  await withGeomCheck(H1u, out, () => uiToggle(H1u, 'stars'));
  out.d8ui = await measureCheckedPair(
    H1u,
    await uiCapture(H1u, 'H1u-ui-off', out),
    H2,
    h2Img,
    'd8ui',
  );
  // D8b (진단 전용 — 판정은 PR2 실 Chrome 수동): `?stars=off` 로드 후 켠 화면 ↔ 로드 ON.
  await callSetter(H2, 'setStarfieldVisible', true);
  const ready = await waitMaterialReady(H2, STARFIELD_MESH);
  out.d8bDiag =
    ready.error || ready.absent
      ? ready
      : await measureCheckedPair(H2, await capture(H2, 'H2-runtime-on'), H1, h1Pre, 'd8b');
}

/** D15 — 4 토글 × 10 왕복 × (재생 / 일시정지). */
async function runStress(browser, out, pages) {
  const T = await setupPage(browser, pages, Q.stress, 'T-stress', T_JD_CLOUD);
  const setters = [
    'setOrbitLinesVisible',
    'setStarfieldVisible',
    'setCloudsVisible',
    'setNightLightsVisible',
  ];
  for (const playback of ['play', 'pause']) {
    await T.page.evaluate((p) => window.__simCore.command({ type: p }), playback);
    for (const s of setters) {
      for (let i = 0; i < STRESS_ROUND_TRIPS; i += 1) {
        await callSetter(T, s, false);
        await frames(T.page, 1);
        await callSetter(T, s, true);
        await frames(T.page, 1);
      }
    }
  }
  await T.page.evaluate(() => window.__simCore.command({ type: 'pause' }));
  if (INJECT === 'console') {
    await T.page.evaluate(() => console.error('[1265 inject] runtime error canary'));
    out.injectNote = 'console — D15 페이지 콘솔 에러 1건';
  }
  await frames(T.page, 4);
  out.d15Counts = await readCounts(T);
  out.d8pT = await readOpaqueGroup0(T);
  out.d15Errors = [...T.errors];
}

/** D1 · D2 — 4 모드 × 1280×720. `education`·`sandbox` 는 모드 버튼이 비활성이라 `?mode=` 로 진입한다. */
async function runUiModes(browser, out, pages) {
  for (const mode of UI_MODES) {
    const M = await setupUiPage(browser, pages, `${UI_BASE}&mode=${mode}`, `M-${mode}`);
    await recordBootCaps(M, out);
    const store = await readStoreSel(M.page);
    const triggers = await M.page.locator(PANEL_TRIGGER).count();
    let expanded = null;
    let toggles = null;
    if (triggers === 1) {
      await setPanelOpen(M.page, true);
      expanded = await M.page.locator(PANEL_TRIGGER).getAttribute('aria-expanded');
      toggles = await M.page.evaluate(() =>
        [...document.querySelectorAll('[data-testid="display-panel"] [aria-pressed]')].map((el) => {
          const r = el.getBoundingClientRect();
          return {
            id: el.getAttribute('data-testid'),
            visible: r.width > 0 && r.height > 0 && getComputedStyle(el).visibility === 'visible',
          };
        }),
      );
      await setPanelOpen(M.page, false);
    }
    // D2 — 우측 그룹 버튼 전부 뷰포트 안 (#887) · 좌측 단축 바 버튼 전부 스크롤로 도달 + 그 지점에서 클릭 가능.
    const layout = await M.page.evaluate((vw) => {
      const right = [...document.querySelectorAll('[data-testid="topbar-right"] button')].map(
        (el) => {
          const r = el.getBoundingClientRect();
          return {
            id: el.getAttribute('data-testid'),
            right: r.x + r.width,
            ok: r.x + r.width <= vw,
          };
        },
      );
      const unreachable = [];
      const bar = [...document.querySelectorAll('[data-r1-region="shortcut-bar"] button')];
      for (const el of bar) {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        if (!(r.x >= 0 && r.x + r.width <= vw && hit && el.contains(hit)))
          unreachable.push(el.getAttribute('data-testid'));
      }
      return { right, bar: bar.length, unreachable };
    }, UI_VIEWPORT_WIDTH);
    out.uiModes.push({ mode, store: store.mode, triggers, expanded, toggles, layout });
    // 모드 페이지는 서로 독립 — 반복마다 닫는다 (#1271 A1 — 섹션 끝까지 두면 4 컨텍스트).
    await retirePages(out, pages);
  }
}

/** D4 · D3 · D14 · D14b · D9 · D15 (UI) — 기본 로드 (focus=earth, 관찰 모드). */
async function runUiInteraction(browser, out, pages) {
  const U = await setupUiPage(browser, pages, UI_BASE, 'U-interaction');
  await recordBootCaps(U, out);
  const { page } = U;
  out.uiSoftware = await page.evaluate(() => window.__isSoftwareRenderer === true);

  // ── D4 — 양성 대조 (패널 닫힘 · 무입력 → 숨김) 뒤 패널 연 채 같은 시간 무입력 ──
  const topbarOpacity = () =>
    page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="topbar"]')).opacity);
  await page.waitForTimeout(D4_IDLE_MS);
  const closedOpacity = await topbarOpacity();
  // 계약 시간 안에 숨지 않았으면 더 기다려 본다 (`READY_TIMEOUT_MS`, 새 임계 0) — 늦게라도 숨으면 환경 저속
  // (타이머 지연) 이라 D4 의 4 초 전제가 이 페이지에서 성립하지 않은 것이고 (측정 불가), 끝내 안 숨으면 제품 결함
  // (자동 숨김 영구 억제) 이다 (reviewer R8).
  let closedLate = null;
  if (closedOpacity !== '0') {
    try {
      await page.waitForFunction(
        () => getComputedStyle(document.querySelector('[data-testid="topbar"]')).opacity === '0',
        undefined,
        { timeout: READY_TIMEOUT_MS },
      );
      closedLate = true;
    } catch {
      closedLate = false;
    }
  }
  await setPanelOpen(page, true);
  await page.waitForTimeout(D4_IDLE_MS);
  out.uiD4 = {
    closedOpacity,
    closedLate,
    openOpacity: await topbarOpacity(),
    panels: await panelCount(page),
  };
  await setPanelOpen(page, false);

  // ── D3 — 패널 궤도선 ↔ 단축 바 궤도선 ↔ store ──
  const readOrbitSync = async () => {
    await setPanelOpen(page, true);
    const r = {
      panel: await page.locator(toggleSel('orbits')).getAttribute('aria-pressed'),
      bar: await page.locator('[data-testid="toggle-orbits"]').getAttribute('aria-pressed'),
      store: (await readStoreSel(page)).orbitLinesVisible,
    };
    await setPanelOpen(page, false);
    return r;
  };
  const d3Initial = await readOrbitSync();
  await setPanelOpen(page, true);
  await clickToggle(page, 'orbits');
  await setPanelOpen(page, false);
  const d3AfterPanel = await readOrbitSync();
  await page.locator('[data-testid="toggle-orbits"]').click({ timeout: READY_TIMEOUT_MS });
  const d3AfterBar = await readOrbitSync();
  out.uiD3 = { initial: d3Initial, afterPanel: d3AfterPanel, afterBar: d3AfterBar };

  // ── 무관 스크롤 유지 — 패널을 연 채 좌측 단축 바를 실제로 스크롤한다. 트리거가 움직이지 않는 스크롤이라 패널은
  // 남아야 한다 (라운드 5 — 스크롤 닫기는 트리거 위치가 바뀐 스크롤에서만. qa 가 「모든 스크롤 닫기」 의 레이스를 실측).
  await setPanelOpen(page, true);
  // 기저 신호 — 스크롤 직전 패널이 실제로 열려 있었는가 (열리자마자 닫히는 회귀에서 결과가 공허해지지 않게).
  const panelsBeforeScroll = await panelCount(page);
  const triggerBefore = await readTriggerRect(page);
  const scrolled = await page.evaluate(() => {
    // 단축 바 또는 그 조상 중 실제로 가로 스크롤되는 첫 요소 (상단 바 좌측 그룹도 overflow-x-auto 다).
    let bar = document.querySelector('[data-r1-region="shortcut-bar"]');
    while (bar && bar.scrollWidth <= bar.clientWidth) bar = bar.parentElement;
    if (!bar) return null;
    const before = bar.scrollLeft;
    bar.scrollLeft = before === 0 ? bar.scrollWidth : 0;
    return { before, after: bar.scrollLeft };
  });
  await frames(page, 2);
  out.uiScroll = {
    scrolled,
    triggerMoved: triggerBefore !== (await readTriggerRect(page)),
    panelsBefore: panelsBeforeScroll,
    panels: await panelCount(page),
  };
  await setPanelOpen(page, false);

  // ── D14 — 키보드만: Tab 도달 → Enter → 토글 4개 순회 (Space 반전) → Esc ──
  // 순회 시작점을 문서 첫 포커스 요소(캔버스)로 고정한다. `blur()` 만으로는 부족하다 — Chrome 은 마지막으로
  // 클릭한 요소를 순차 탐색 시작점으로 기억해 (위 D3 의 클릭) Tab 이 문서 중간에서 출발한다 (1차 실행 실측).
  await page.locator('[data-testid="sim-canvas"]').focus();
  // 종료는 한 바퀴 — 캔버스로 돌아오거나 문서 밖(body)으로 나가면 끝이다. `tabBound` 는 판정 임계가 아니라
  // 포커스 트랩 같은 결함에서 루프가 멈추지 않는 것을 막는 런어웨이 가드다: `datetime-local` 이 분절마다 Tab 을
  // 먹어 정지점이 요소 수보다 많으므로 후보 수의 2배로 둔다 (1차 실측: 후보 42 · 트리거까지 Tab 31).
  const tabBound =
    2 *
    (await page.evaluate(
      () =>
        document.querySelectorAll('button, a[href], input, select, textarea, [tabindex]').length,
    ));
  let tabs = 0;
  let reached = false;
  while (tabs < tabBound) {
    await page.keyboard.press('Tab');
    tabs += 1;
    const cur = await activeTestId(page);
    if (cur === 'display-panel-toggle') {
      reached = true;
      break;
    }
    if (
      cur === 'sim-canvas' ||
      (await page.evaluate(() => document.activeElement === document.body))
    )
      break;
  }
  const d14 = {
    tabBound,
    tabs,
    reached,
    selectedBefore: (await readStoreSel(page)).selectedBodyId,
  };
  if (reached) {
    // 5-A 기준값 — 패널이 닫힌 상태에서 트리거의 Tab 이 브라우저 기본 순서로 닿는 요소. 패널 마지막 토글의 Tab 이
    // 가야 할 곳이다 (가드가 제품과 같은 계산을 반복하지 않도록 기본 동작을 관측해 기준으로 쓴다).
    await page.keyboard.press('Tab');
    d14.nativeNext = await activeTestId(page);
    await page.keyboard.press('Shift+Tab');
    d14.backToTrigger = await activeTestId(page);
    // 반대 방향 기준값 — 트리거의 기본 Shift+Tab 목적지 (포커스가 트리거 앞으로 나가면 패널이 닫혀야 하는 곳).
    await page.keyboard.press('Shift+Tab');
    d14.nativePrev = await activeTestId(page);
    await page.keyboard.press('Tab');
    d14.backToTrigger2 = await activeTestId(page);
    await page.keyboard.press('Enter');
    await frames(page, 2);
    d14.expanded = await page.locator(PANEL_TRIGGER).getAttribute('aria-expanded');
    d14.visited = [await activeTestId(page)];
    const pressedBefore = await page.locator(toggleSel('orbits')).getAttribute('aria-pressed');
    await page.keyboard.press('Space');
    d14.spaceFlipped =
      (await page.locator(toggleSel('orbits')).getAttribute('aria-pressed')) !== pressedBefore;
    for (let i = 1; i < UI_IDS.length; i += 1) {
      await page.keyboard.press('Tab');
      d14.visited.push(await activeTestId(page));
    }
    // 5-A — 마지막 토글 Tab → 패널 닫힘 + 트리거 다음 요소 (portal 이라도 문서 끝으로 빠지지 않는다).
    await page.keyboard.press('Tab');
    await frames(page, 2);
    d14.lastTab = { panels: await panelCount(page), focus: await activeTestId(page) };
    // 5-A — 다시 열고 첫 토글 Shift+Tab → 트리거 (패널 유지) → Tab → 첫 토글.
    await page.locator(PANEL_TRIGGER).focus();
    await page.keyboard.press('Enter');
    await frames(page, 2);
    await page.keyboard.press('Shift+Tab');
    d14.firstShiftTab = { panels: await panelCount(page), focus: await activeTestId(page) };
    await page.keyboard.press('Tab');
    d14.triggerTab = await activeTestId(page);
    // Q3-1 — 첫 토글 Shift+Tab → 트리거 (패널 유지) → 다시 Shift+Tab 으로 둘 다 벗어나면 패널이 닫힌다.
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await frames(page, 2);
    d14.leaveBackward = { panels: await panelCount(page), focus: await activeTestId(page) };
    // Esc 판정을 위해 다시 연다 (트리거에서 Enter → 첫 토글).
    await page.locator(PANEL_TRIGGER).focus();
    await page.keyboard.press('Enter');
    await frames(page, 2);
    await page.keyboard.press('Escape');
    await frames(page, 2);
    d14.panelsAfterEsc = await panelCount(page);
    d14.focusAfterEsc = await activeTestId(page);
    const st = await readStoreSel(page);
    d14.freeFlyAfterEsc = st.freeFlyMode;
    d14.selectedAfterEsc = st.selectedBodyId;
    // 궤도선을 원래대로 (D15 스트레스가 같은 상태에서 시작하게).
    await uiToggle(U, 'orbits');
  }
  out.uiD14 = d14;

  // ── D14b — 패널 연 채 선택 변경 (자유시점 리스너 재등록 → 패널 리스너보다 뒤) → Esc ──
  await setPanelOpen(page, true);
  await page.evaluate(() => window.__simCore.command({ type: 'focusOn', bodyId: 'mars' }));
  let selectedMars = true;
  try {
    await page.waitForFunction(
      () => window.__simStore.getState().selectedBodyId === 'mars',
      undefined,
      { timeout: READY_TIMEOUT_MS },
    );
  } catch {
    selectedMars = false;
  }
  const panelsBeforeEsc = await panelCount(page);
  await page.keyboard.press('Escape');
  await frames(page, 2);
  const st14b = await readStoreSel(page);
  out.uiD14b = {
    selectedMars,
    panelsBeforeEsc,
    panelsAfterEsc: await panelCount(page),
    freeFly: st14b.freeFlyMode,
    selected: st14b.selectedBodyId,
  };

  // ── 자유시점 Esc 양성 대조 (R2) — 패널이 닫힌 상태에서 같은 Esc 가 자유시점으로 **가야** D14 엣지 · D14b 의
  // `freeFly === false` 가 판별력을 가진다. 리스너가 죽은 회귀는 제품 결함이라 게이트 FAIL 이다. 선택을 맞추는
  // 것은 하네스 설정이다 — D14b 가 선택을 지웠을 수 있으므로 다시 고르고, 패널도 트리거로 닫는다 (D14b 의 Esc 가
  // 패널을 못 닫았다면 그 결함은 D14b 게이트가 FAIL 로 낸다 — 여기서 측정 불가로 흡수하지 않는다, reviewer B2).
  await setPanelOpen(page, false);
  await page.evaluate(() => window.__simCore.command({ type: 'focusOn', bodyId: 'mars' }));
  let controlSelected = true;
  try {
    await page.waitForFunction(
      () => window.__simStore.getState().selectedBodyId === 'mars',
      undefined,
      { timeout: READY_TIMEOUT_MS },
    );
  } catch {
    controlSelected = false;
  }
  const controlPanels = await panelCount(page);
  await page.keyboard.press('Escape');
  await frames(page, 2);
  out.uiFreeFlyControl = {
    selected: controlSelected,
    panels: controlPanels,
    freeFly: (await readStoreSel(page)).freeFlyMode,
  };

  // ── D9 — 소프트웨어 렌더: 별 토글 aria-disabled + 사유, 눌러도 별 0 ──
  if (out.uiSoftware) {
    await setPanelOpen(page, true);
    const star = page.locator(toggleSel('stars'));
    const d9 = {
      ariaDisabled: await star.getAttribute('aria-disabled'),
      title: await star.getAttribute('title'),
      pressedBefore: await star.getAttribute('aria-pressed'),
    };
    // **두 번** 누른다 — 의도 기본값이 true 라 첫 클릭은 차단이 빠져도 OFF 명령(별이 없으니 no-op)만 보낸다.
    // 생성 경로 (ON 명령) 는 두 번째 클릭에서야 열린다 (PR2 변이 a 1차 실측: 1회 클릭으로는 별 0 · URL 만 어긋남).
    // 매 클릭 뒤 store 의도도 읽는다 — store 는 클릭 핸들러 안에서 동기로 바뀌어 URL (비동기 쓰기) 보다 확실하다.
    d9.clicks = [];
    for (let i = 0; i < DISABLED_CLICKS; i += 1) {
      await clickToggle(page, 'stars');
      await frames(page, 2);
      d9.clicks.push({
        pressed: await star.getAttribute('aria-pressed'),
        stars: (await readCounts(U)).stars,
        intent: await page.evaluate(() => window.__simStore.getState().starsVisible),
        url: (await readUrlKeys(page)).stars,
      });
    }
    await setPanelOpen(page, false);
    await frames(page, 2);
    d9.starMeshes = (await readCounts(U)).stars;
    d9.starfieldVisibleGlobal = await page.evaluate(() => window.__starfieldVisible);
    d9.urlStars = (await readUrlKeys(page)).stars;
    out.uiD9 = d9;
  }

  // ── D15 (UI) — 패널 토글 4개 × 10 왕복 × (재생 / 일시정지) ──
  await setPanelOpen(page, true);
  for (const playback of ['play', 'pause']) {
    await page.evaluate((p) => window.__simCore.command({ type: p }), playback);
    for (const id of UI_IDS) {
      for (let i = 0; i < STRESS_ROUND_TRIPS; i += 1) {
        await clickToggle(page, id);
        await frames(page, 1);
        await clickToggle(page, id);
        await frames(page, 1);
      }
    }
  }
  await setPanelOpen(page, false);
  await frames(page, 4);
  out.uiD15Errors = [...U.errors];
}

/** D11 — URL 쓰기 · history · 새로고침 복원 · 북마크 · 로드 직후 URL 불변. */
async function runUiUrl(browser, out, pages) {
  const R = await setupUiPage(browser, pages, UI_BASE, 'R-url');
  const rBootCaps = await recordBootCaps(R, out);
  const { page } = R;
  const software = await page.evaluate(() => window.__isSoftwareRenderer === true);
  // 소프트웨어 렌더의 별은 가용성이 막아 URL 을 쓰지 않는다 (D9) — URL 계약은 하드웨어에서만 잰다.
  const ids = software ? UI_IDS.filter((id) => id !== 'stars') : UI_IDS;
  const h0 = await page.evaluate(() => history.length);
  const trips = [];
  for (const id of ids) {
    const key = UI_URL_KEY[id];
    await uiToggle(R, id);
    const offOk = await waitUrlKey(page, key, 'off');
    const bookmarkOff = await readBookmarkUrl(page);
    await uiToggle(R, id);
    const onOk = await waitUrlKey(page, key, null);
    const bookmarkOn = await readBookmarkUrl(page);
    trips.push({
      id,
      offOk,
      onOk,
      bookmarkOff: bookmarkOff === null ? null : new URL(bookmarkOff).searchParams.get(key),
      bookmarkOnHas: bookmarkOn === null ? null : new URL(bookmarkOn).searchParams.has(key),
    });
  }
  const hAfterTrips = await page.evaluate(() => history.length);
  // 전부 끈 상태로 새로고침 → 패널 aria-pressed · scene 상태가 같아야 한다.
  for (const id of ids) {
    await uiToggle(R, id);
    await waitUrlKey(page, UI_URL_KEY[id], 'off');
  }
  const snap = async () => {
    await setPanelOpen(page, true);
    const pressed = await readPanelPressed(page);
    await setPanelOpen(page, false);
    return { pressed, scene: await readSceneDisplay(R) };
  };
  const before = await snap();
  const urlBeforeReload = await readUrlKeys(page);
  await page.reload();
  let reloadReady = true;
  let reloadHandles = true;
  try {
    await waitCapsReady(page);
  } catch {
    reloadReady = false;
    // 대기 초과의 성격 — 핸들조차 없으면 부팅이 안 끝난 것 (환경 저속 → 측정 불가), 핸들은 있는데 준비만 없으면
    // 제품 결함이다 (sim-canvas 는 핸들러 등록과 같은 동기 블록에서 준비를 연다 — reviewer R8).
    reloadHandles = await page.evaluate(() => !!window.__simCore && !!window.__solarScene);
  }
  const after = reloadReady ? await snap() : null;
  out.uiD11 = {
    software,
    bootCaps: rBootCaps,
    reloadHandles,
    ids,
    h0,
    hAfterTrips,
    trips,
    urlBeforeReload,
    before,
    after,
    reloadReady,
  };

  // 로드 직후 (조작 전) 4 키 불변 + `?orbits=off` 로드 → 켜고 북마크 → `orbits` 부재 (기존 불일치 해소).
  const L = await setupUiPage(browser, pages, UI_ALL_OFF, 'L-all-off');
  await recordBootCaps(L, out);
  const urlAtLoad = await readUrlKeys(L.page);
  await uiToggle(L, 'orbits');
  const orbitsOnOk = await waitUrlKey(L.page, 'orbits', null);
  const bookmark = await readBookmarkUrl(L.page);
  const bm = bookmark === null ? null : new URL(bookmark).searchParams;
  const d11Load = {
    urlAtLoad,
    orbitsOnOk,
    bookmarkOrbitsHas: bm ? bm.has('orbits') : null,
    bookmarkOthers: bm
      ? { stars: bm.get('stars'), clouds: bm.get('clouds'), nightlights: bm.get('nightlights') }
      : null,
  };
  // D8 (UI, 하드웨어) — `?stars=off` 로드에서 패널로 켜면 starfield 정확히 1.
  if (!software) {
    await uiToggle(L, 'stars');
    out.onChecks.push(await waitMaterialReady(L, STARFIELD_MESH));
    d11Load.starsAfterUiOn = (await readCounts(L)).stars;
  }
  out.uiD11Load = d11Load;
}

/**
 * 트리거 이동 스크롤 닫힘 — 우측 그룹이 넘치는 좁은 폭 (`max-sm:overflow-x-auto`) 에서 그 컨테이너를 스크롤해
 * 트리거를 실제로 움직인다. 트리거가 움직이지 않았으면 (스크롤 불가 · 위치 불변) 측정 불가 전제 (20) 이다 —
 * 「트리거가 움직였는가」 는 하네스 조건, 「닫혔는가」 는 제품 속성 (게이트).
 */
async function runUiTriggerScroll(browser, out, pages) {
  const W = await setupUiPage(browser, pages, UI_BASE, 'W-narrow', NARROW_VIEWPORT);
  await recordBootCaps(W, out);
  const { page } = W;
  await setPanelOpen(page, true);
  const panelsBefore = await panelCount(page);
  const before = await readTriggerRect(page);
  const scrolled = await page.evaluate(() => {
    const group = document.querySelector('[data-testid="topbar-right"]');
    if (!group || group.scrollWidth <= group.clientWidth) return null;
    const from = group.scrollLeft;
    group.scrollLeft = from === 0 ? group.scrollWidth : 0;
    return { from, to: group.scrollLeft };
  });
  await frames(page, 2);
  out.uiTriggerScroll = {
    scrolled,
    triggerMoved: before !== (await readTriggerRect(page)),
    panelsBefore,
    panels: await panelCount(page),
  };
}

/**
 * 레이스 회귀 — 키 간 지연 0 으로 캔버스 → 트리거까지 Tab → Enter 를 반복해 방금 연 패널이 남는지 본다.
 * Tab 이 좌측 단축 바를 스크롤시키고 그 scroll 이 한 프레임 늦게 도착해, 「모든 스크롤 닫기」 판본은 막 연 패널을
 * 닫았다 (PR #1268 qa — SwiftShader 2/19). 반복 수 `RACE_TRIALS` 근거는 상수 주석.
 */
async function runUiRace(browser, out, pages) {
  const Q = await setupUiPage(browser, pages, UI_BASE, 'Q-race');
  await recordBootCaps(Q, out);
  const { page } = Q;
  // 레이스의 재료가 실제로 생겼는지 센다 — 0 이면 이 환경에서 레이스를 재현할 수 없다 (전제 21). 재료는 「Tab 이
  // 단축 바를 스크롤시켰다」 이므로 단축 바 **조상 체인** (단축 바 자신 포함 — 실제로 넘치는 것은 상단 바 좌측 그룹일
  // 수 있다) 의 스크롤만 센다. 캔버스 포커스 · 트리거 클릭 같은 다른 요소 스크롤은 진단용 `scrollsAll` 에만 (#1271 R12).
  await page.evaluate(() => {
    window.__raceScrolls = 0;
    window.__raceScrollsAll = 0;
    window.addEventListener(
      'scroll',
      (e) => {
        if (e.target === document) return;
        window.__raceScrollsAll += 1;
        const bar = document.querySelector('[data-r1-region="shortcut-bar"]');
        if (bar && e.target instanceof Element && e.target.contains(bar)) window.__raceScrolls += 1;
      },
      { capture: true, passive: true },
    );
  });
  // 캔버스 → 트리거 Tab 수를 한 번 관측한다 (D14 와 같은 런어웨이 상한).
  await page.locator('[data-testid="sim-canvas"]').focus();
  const tabBound =
    2 *
    (await page.evaluate(
      () =>
        document.querySelectorAll('button, a[href], input, select, textarea, [tabindex]').length,
    ));
  let tabsToTrigger = 0;
  while (tabsToTrigger < tabBound) {
    await page.keyboard.press('Tab');
    tabsToTrigger += 1;
    if ((await activeTestId(page)) === 'display-panel-toggle') break;
  }
  const trials = [];
  for (let i = 0; i < RACE_TRIALS; i += 1) {
    await page.locator('[data-testid="sim-canvas"]').focus();
    for (let t = 0; t < tabsToTrigger; t += 1) await page.keyboard.press('Tab');
    const atTrigger = (await activeTestId(page)) === 'display-panel-toggle';
    await page.keyboard.press('Enter');
    await frames(page);
    trials.push({ atTrigger, panels: await panelCount(page), focus: await activeTestId(page) });
    await setPanelOpen(page, false);
  }
  out.uiRace = {
    tabsToTrigger,
    scrolls: await page.evaluate(() => window.__raceScrolls),
    scrollsAll: await page.evaluate(() => window.__raceScrollsAll),
    bad: trials.filter(
      (t) => !t.atTrigger || t.panels !== 1 || t.focus !== 'display-toggle-orbits',
    ),
    trials: trials.length,
  };
}

/** D10 — `?surface=off`: 구름·불빛 토글 aria-disabled + 사유, 눌러도 mesh · 머티리얼 · URL 무변화. */
async function runUiSurfaceOff(browser, out, pages) {
  const SF = await setupUiPage(browser, pages, `${UI_BASE}&surface=off`, 'SF-surfaceOff');
  await recordBootCaps(SF, out);
  const { page } = SF;
  await setPanelOpen(page, true);
  const attrs = {};
  for (const id of SURFACE_TOGGLES) {
    const el = page.locator(toggleSel(id));
    attrs[id] = {
      ariaDisabled: await el.getAttribute('aria-disabled'),
      title: await el.getAttribute('title'),
    };
  }
  const readIntents = () =>
    page.evaluate(() => {
      const st = window.__simStore.getState();
      return { clouds: st.cloudsVisible, nightLights: st.nightLightsVisible };
    });
  const before = await readCounts(SF);
  const urlBefore = await readUrlKeys(page);
  const intentsBefore = await readIntents();
  // 토글마다 두 번 (D9 와 같은 이유 — 첫 클릭은 OFF, 두 번째가 ON 명령). 매 클릭 뒤 개수 · URL · store 의도.
  const clicks = [];
  for (const id of SURFACE_TOGGLES) {
    for (let i = 0; i < DISABLED_CLICKS; i += 1) {
      await clickToggle(page, id);
      await frames(page, 2);
      clicks.push({
        id,
        counts: await readCounts(SF),
        url: await readUrlKeys(page),
        intents: await readIntents(),
      });
    }
  }
  await setPanelOpen(page, false);
  await frames(page, 2);
  out.uiD10 = {
    attrs,
    before,
    after: await readCounts(SF),
    urlBefore,
    urlAfter: await readUrlKeys(page),
    intentsBefore,
    clicks,
    lightMaterials: (await readAllLightStrengths(SF)).length,
  };
}

/**
 * 페이지를 닫는다 (`which` 미지정 = 열린 페이지 전부). 열린 컨텍스트가 쌓이면 뒤 페이지의 부팅 (핸들 노출) 이
 * 누적으로 느려져 `bootstrapScene` 핸들 대기 20 s 에 접근한다 — 섹션 경계만으로는 부족했다: 첫 섹션 `runClouds`
 * 가 혼자 8 페이지를 열어 CI 핸들 대기가 contexts 1 → 8 에서 `206ms → 13.7s` (run `36548030595`), 실패 run
 * `36651753956` attempt 1 에서는 8 번째 F 가 `23.6s` 로 상한을 넘었다 (#1271). 그래서 3 페이지 이상 여는 섹션은 하위 블록
 * 경계에서도 닫는다 (열린 컨텍스트 ≤ 3).
 *
 * 닫기 전에 정착 기록 · 콘솔 에러 · 로드 상태를 결과로 옮긴다 — 이동을 빠뜨리면 콘솔 에러 게이트 · 정착 전제가
 * 그 페이지를 못 보고 공허 통과한다. 열려 있지 않은 페이지를 지정하면 하네스 결함이라 즉시 던진다 (fail-fast).
 */
async function retirePages(out, pages, which = [...pages]) {
  for (const p of which) {
    const i = pages.indexOf(p);
    if (i === -1)
      throw new Error(`retirePages: ${p.label} 은 열린 페이지 목록에 없다 (하네스 결함)`);
    pages.splice(i, 1);
    out.settles.push(...p.settles.map((s) => ({ page: p.label, ...s })));
    out.consoleErrors[p.label] = [...p.errors];
    if (p.loadDisplay) out.loadDisplay[p.label] = p.loadDisplay;
    await p.context.close();
  }
}

/**
 * 부팅 실패의 원인 판별 — 열린 페이지가 하나도 없는 상태에서 같은 쿼리 · 같은 뷰포트로 **단독** 부팅한다 (전제 22).
 * 대기 상한은 `bootstrapScene` 기본값 (주입 없음). 이 페이지는 측정 게이트에 쓰지 않고 판별 직후 닫는다 — 콘솔
 * 에러만 콘솔 에러 게이트로 옮긴다 (`<라벨>-reboot`).
 */
async function rebootAlone(browser, failure) {
  let ctx = null;
  try {
    ctx = await bootPage(browser, failure.query, `${failure.label}-reboot`, failure.viewport);
    await ctx.context.close().catch(() => {});
    // 콘솔 에러는 판정으로 옮긴다 (reviewer R1) — 첫 시도는 핸들 대기에서 끊겨 그 뒤 (settle) 의 에러는 여기서만 보인다.
    return { ok: true, errors: [...ctx.errors] };
  } catch (e) {
    if (ctx) await ctx.context.close().catch(() => {});
    return { ok: false, error: e.message, errors: e instanceof BootFailure ? e.errors : [] };
  }
}

/** 섹션 — 부팅 실패 진단 (`bootFailures[].section`) 에 실리는 이름. */
const SECTIONS = [
  ['clouds', runClouds],
  ['night', runNightLights],
  ['stars', runStars],
  ['stress', runStress],
  ['uiModes', runUiModes],
  ['uiInteraction', runUiInteraction],
  ['uiUrl', runUiUrl],
  ['uiSurfaceOff', runUiSurfaceOff],
  ['uiTriggerScroll', runUiTriggerScroll],
  ['uiRace', runUiRace],
];

async function run(browser) {
  // onChecks = 런타임 ON 직후 (부재 → 게이트) · harnessReady = 하네스가 만든 mesh (부재 → 측정 불가)
  const out = {
    inject: INJECT,
    onChecks: [],
    harnessReady: [],
    settles: [],
    consoleErrors: {},
    uiPanelsAtCapture: [],
    uiModes: [],
    uiCapsAtBoot: [],
    toggleGeom: [],
    postToggleReady: [],
    loadDisplay: {},
    // 전제 22 — 부팅 실패로 중단된 섹션 (섹션 · 라벨 · 첫 시도 컨텍스트 수 · 에러 · 단독 재부팅 결과).
    bootFailures: [],
  };
  const pages = [];
  try {
    for (const [name, section] of SECTIONS) {
      try {
        await section(browser, out, pages);
      } catch (e) {
        // 부팅 예외만 섹션 중단으로 분류한다 — 그 밖의 예외는 그대로 exit 1 (분류 범위 밖).
        if (!(e instanceof BootFailure)) throw e;
        // 열린 페이지를 전부 닫아 (데이터 이동 포함) 재부팅을 단독으로 만든다.
        await retirePages(out, pages);
        // 「단독」 이 성립하지 않으면 판별 자체가 무효다 — 목록 밖에 남은 컨텍스트는 하네스 결함이라 즉시 던진다.
        const leftover = browser.contexts().length;
        if (leftover !== 0)
          throw new Error(`단독 재부팅 전 열린 컨텍스트 ${leftover} ≠ 0 (하네스 결함 — 등록 누락)`);
        out.consoleErrors[e.label] = e.errors;
        const { errors: rebootErrors, ...reboot } = await rebootAlone(browser, e);
        // 재부팅 페이지 라벨은 `-reboot` 접미사 — 어떤 측정 페이지 라벨과도 겹치지 않는다.
        out.consoleErrors[`${e.label}-reboot`] = rebootErrors;
        out.bootFailures.push({
          section: name,
          label: e.label,
          injected: e.injected,
          contexts: e.contexts,
          error: e.message,
          reboot,
        });
      }
      await retirePages(out, pages);
    }
  } finally {
    await retirePages(out, pages);
  }
  if (INJECT === 'boot' && !bootInjected)
    throw new Error(
      `INJECT=boot 미발화 — 라벨 ${INJECT_BOOT_LABEL} 이 부팅되지 않았다 (오타 · 환경상 열리지 않는 페이지)`,
    );
  return out;
}

/** 게이트 상태 — `true` PASS · `false` FAIL · `SKIP` (환경상 판정 불가 — PASS 계수에 넣지 않는다). */
const SKIP = 'SKIP';
/** 게이트가 기대는 전제가 무너져 평가하지 않았다 — PASS 도 FAIL 도 아니다. */
const UNMEASURED = 'UNMEASURED';

/**
 * 게이트 1개.
 *   - `reads` — 평가 함수가 읽는 결과 (`r`) 의 최상위 키 **전부** (선언). 평가 함수는 인자로 받은 `r` 만 읽는다 —
 *     `judge` 가 그 `r` 을 Proxy 로 감싸 실제 접근 키를 기록하고, 「접근 ⊆ 선언」 이 아니면 하네스 결함으로 던진다.
 *   - `needs` — 기대는 측정 불가 전제 id. 하나라도 무너졌으면 평가 함수를 **부르지 않는다** (#1214 시그니처 5).
 *   - `opts.optional` — `reads` 중 부팅 실패 시 없어도 되는 표본 키 (있는 표본 위에서 판정한다).
 *   - `opts.partial(r)` — 기대 표본 중 빠진 것 (부팅 실패 시에만 허용된다). 빠진 표본이 있으면 있는 표본 위에서
 *     평가해 FAIL 은 그대로 두고, 그 밖의 결과는 측정 불가로 바꾼다 (빠진 표본이 결과를 뒤집을 수 있으므로).
 *   - `opts.samples(r)` — 기대 목록이 없는 누적 표본의 수. 부팅 실패가 있고 0 이면 측정 불가 (`표본 ≥ 1` 술어의 공허
 *     FAIL 방지). 부팅 실패가 없으면 그대로 평가한다.
 * 평가 함수는 `[값, 조건, ok]` 를 돌려준다.
 */
const gate = (name, reads, needs, evaluate, opts = {}) => ({
  name,
  reads,
  needs,
  evaluate,
  optional: opts.optional ?? [],
  partial: opts.partial ?? null,
  samples: opts.samples ?? null,
});

/** 결과 `r` 의 최상위 키 접근을 기록하는 Proxy — 게이트 선언 (`reads`) 검사용. */
function recordReads(r) {
  const seen = new Set();
  const proxy = new Proxy(r, {
    get(target, key, receiver) {
      if (typeof key === 'string') seen.add(key);
      return Reflect.get(target, key, receiver);
    },
  });
  return { proxy, seen };
}

/**
 * 판정 (라운드 3 구조 + #1271 데이터 의존).
 *
 * 종전에는 측정 불가 전제를 **모든 게이트보다 먼저** 보고 하나라도 무너지면 exit 2 로 끝냈다. 그러면 전제를 참으로
 * 만드는 원인에 제품 결함이 섞이는 순간 (reviewer B1 · B2 — 두 라운드 연속) 결함을 잡는 게이트가 통째로 가려진다.
 * 이제는 전제를 **게이트별 의존**으로 묶는다: 무너진 전제에 기대는 게이트만 `UNMEASURED`, 나머지는 평가한다.
 * 종료 코드 우선순위는 FAIL (1) > 측정 불가 (2) > PASS (0) — 평가된 게이트가 하나라도 FAIL 이면 판정이 있다.
 * 제품 결함이 **전제만** 무너뜨리는 경로는 별도 게이트 (로드 경로 구조 · 토글 전후 기하 · 토글 뒤 정착 · D4 양성
 * 대조 등) 로 판정해, 전제에는 하네스 · 환경 · 다른 가드 소관 원인만 남긴다 (PR 코멘트 전제 판정표).
 *
 * 부팅 실패 (전제 22) 는 경계를 두지 않는다 — 게이트는 자기가 읽는 데이터 (`reads`) 가 전부 있으면 평가하고, 측정
 * 불가는 「부팅 실패가 있었고 ∧ 읽는 데이터 중 하나 이상이 없다」 일 때뿐이다. 부팅 실패가 없는데 데이터가 없으면
 * 하네스 결함이라 던진다.
 */
function judge(r) {
  /** 무너진 전제 id → 사유 목록. */
  const unmet = {};
  const fail = (id, msg) => (unmet[id] ??= []).push(msg);
  const bootFailed = r.bootFailures.length > 0;
  /** 결과 키가 쓰였는가 — 키는 측정이 끝난 뒤 한 번에 대입되므로 존재 = 완결이다 (누적 컨테이너는 따로 본다). */
  const has = (k) => r[k] !== undefined;

  // (22) 부팅 실패 — 진단 전용 서술. 재부팅 성공의 서술은 관측만 쓴다 (첫 시도 열린 컨텍스트 수 · 재부팅 결과).
  const bootNotes = r.bootFailures.map((f) => {
    const first = `첫 시도 열린 컨텍스트 ${f.contexts}`;
    const outcome = f.reboot.ok
      ? f.contexts > 1
        ? `${first} · 단독 재부팅 성공`
        : `${first} · 단독 재부팅 성공 (재시도 성공 — 첫 시도도 단독이었다)`
      : `${first} · 단독 재부팅 실패 (${f.reboot.error}) — 게이트 「부팅 — 단독 핸들 노출」 이 판정`;
    return `(22) ${f.section}/${f.label} 부팅 실패${f.injected ? ' (INJECT=boot)' : ''} — ${outcome} · ${f.error}`;
  });

  // (2) 측정 오류 — 쌍 측정 · 정렬 · 큐 판독의 error.
  const pairKeys = [
    'd5Positive',
    'd5',
    'd6Positive',
    'd6',
    'd6AfterTrips',
    'd6f',
    'd7Positive',
    'd7',
    'd7m',
    'd5ui',
    'd6ui',
    'd7ui',
  ];
  const renderer = readRenderer(r);
  const hw = renderer.hw;
  if (hw) pairKeys.push('d8Determinism', 'd8Positive', 'd8Pixel', 'd8ui');
  for (const k of [...pairKeys, 'd5SortA', 'd5SortB', 'd5uiSort', 'd6fQueueE', 'd6fQueueF'])
    if (r[k]?.error) fail(`err:${k}`, `(2) ${k}: ${r[k].error}`);
  // (1) 하네스 정착 (부팅 · 토글 전 override) 상한 초과. 토글 **뒤** 정착은 게이트 쪽이다.
  for (const s of r.settles)
    if (s.timedOut && !s.postToggle)
      fail(`settle:${s.page}`, `(1) LOD 정착 상한 초과 — ${s.page}/${s.step} (${s.waitedMs}ms)`);
  // 아래 전제들은 원천 키가 있을 때만 계산한다 — 없으면 (부팅 실패) 그 키를 읽는 게이트가 전부 데이터 부재로 측정
  // 불가라 전제가 판정에 닿지 않는다. 게이트는 전제의 원천 키도 `reads` 에 선언한다.
  // (3) 양성 대조 — 로드 ON ↔ 로드 OFF. 로드 상태 자체는 「로드 경로 구조」 게이트가 따로 본다.
  const positives = {
    d5Positive: 'pos:clouds',
    d6Positive: 'pos:cloudsRot',
    d7Positive: 'pos:night',
  };
  // 양성 대조 쌍 자체가 측정 오류여도 이 전제는 무너진 것이다 — 그렇지 않으면 `pos:*` 에만 기대는 게이트가 양성
  // 대조 없이 `== 0` 을 PASS 로 낸다 (reviewer R7).
  for (const [k, id] of Object.entries(positives))
    if (!has(k)) continue;
    else if (r[k].error) fail(id, `(3) ${k} — 양성 대조 쌍 측정 오류`);
    else if (!(r[k].disk.changed > 0))
      fail(id, `(3) ${k} — 로드 ON ↔ 로드 OFF disk 변화 ${r[k].disk.changed}`);
  // (4) 하네스가 만든 mid (토글 없는 페이지) 의 부재 · 준비 초과.
  for (const x of r.harnessReady)
    if (x.absent || x.error)
      fail('ready:P2', `(4) ${x.label ?? x.error} — 하네스 mid 부재 또는 준비 초과`);
  // (5) fade 재현 큐 — 하네스 설정 (E 의 mid 존재 자체는 「토글 뒤 mid」 게이트가 본다).
  for (const [k, id] of [
    ['d6fQueueE', 'fade:E'],
    ['d6fQueueF', 'fade:F'],
  ])
    if (has(k) && !r[k].error && !r[k].entries.some((e) => e.name === EARTH_MID))
      fail(id, `(5) ${k} — fade 재현 투명 큐에 ${EARTH_MID} 부재`);
  // (6) D7e 엣지 — 토글 시점에 mid 가 이미 있으면 엣지가 아니다 (뷰 · 하네스). 정착 뒤 mid 부재는 D7e 게이트가 FAIL.
  if (has('d7eMidAtToggle') && r.d7eMidAtToggle !== false)
    fail('edge:D7e', `(6) D7e 토글 시점 mid ${r.d7eMidAtToggle}`);
  // (9) D8 (하드웨어) — 같은 URL 독립 2 로드 비결정 · 로드 ON ↔ OFF 동일.
  if (hw && has('d8Determinism') && (r.d8Determinism.error || r.d8Determinism.fullChanged !== 0))
    fail(
      'det:D8',
      `(9) D8 독립 2 로드 결정성 — ${r.d8Determinism.error ?? r.d8Determinism.fullChanged}`,
    );
  if (hw && has('d8Positive') && (r.d8Positive.error || !(r.d8Positive.fullChanged > 0)))
    fail('pos:D8', `(9) D8 로드 ON ↔ OFF — ${r.d8Positive.error ?? r.d8Positive.fullChanged}`);
  // (15) 렌더러 판독 불일치 — SKIP 결정의 전제 (#1234 감지 영역 · 환경 사실). 없는 판독은 빠지고, 판독이 하나도
  // 없으면 렌더러를 모르는 것이라 역시 무너진다.
  if (renderer.distinct !== 1)
    fail(
      'renderer',
      `(15) __isSoftwareRenderer 판독 불일치 · 부재 ${JSON.stringify(renderer.reads)}`,
    );
  // (16) 자유시점 양성 대조 — 선택 재설정 (하네스). 패널은 하네스가 트리거로 닫은 뒤다.
  if (has('uiFreeFlyControl') && !r.uiFreeFlyControl.selected)
    fail('ctl', '(16) 자유시점 양성 대조 — 선택 재설정 실패');
  // (18) D4 타이밍 — 패널이 닫힌 채 계약 시간 (4 초) 안에 숨지 않았지만 더 기다리니 숨었다 → 이 페이지의 타이머가
  // 계약 시간을 지키지 못했다 (환경 저속). D4 의 두 게이트가 이 시간 전제에 기댄다 (reviewer R8).
  if (has('uiD4') && r.uiD4.closedOpacity !== '0' && r.uiD4.closedLate === true)
    fail('d4:timing', `(18) D4 — ${D4_IDLE_MS}ms 뒤 opacity ${r.uiD4.closedOpacity}, 이후에 숨음`);
  if (has('uiScroll')) {
    // 무관 스크롤 판정의 전제 — 좌측 단축 바 스크롤이 트리거를 움직이지 않았어야 「무관」 이다.
    if (r.uiScroll.triggerMoved)
      fail('scroll:unrelated', '좌측 단축 바 스크롤이 트리거를 움직였다 (무관 스크롤 아님)');
    // (17) 스크롤 닫힘 — 스크롤을 실제로 일으켰는가 (레이아웃상 스크롤할 요소가 없으면 측정 불가).
    if (!r.uiScroll.scrolled || r.uiScroll.scrolled.before === r.uiScroll.scrolled.after)
      fail('scroll', `(17) 스크롤 미발생 ${JSON.stringify(r.uiScroll.scrolled)}`);
  }
  // (19) 새로고침 뒤 부팅 미완 — 핸들조차 노출되지 않았다 (환경 저속). 핸들이 있는데 준비만 없으면 게이트 FAIL.
  if (has('uiD11') && !r.uiD11.reloadReady && r.uiD11.reloadHandles === false)
    fail('reload:boot', '(19) D11 새로고침 뒤 핸들 노출 대기 초과');
  // (20) 트리거 이동 스크롤 — 좁은 폭에서 우측 그룹 스크롤이 트리거를 실제로 움직였는가 (하네스 조건).
  if (has('uiTriggerScroll') && (!r.uiTriggerScroll.scrolled || !r.uiTriggerScroll.triggerMoved))
    fail(
      'scroll:trigger',
      `(20) 트리거를 움직이는 스크롤 미발생 ${JSON.stringify(r.uiTriggerScroll)}`,
    );
  // (21) 레이스 재료 — 반복 동안 단축 바 조상 체인 스크롤이 실제로 있었는가. 레이스 게이트는 실패 관측이 없을 때만
  // 이 전제에 기댄다 (judgeUi — R12).
  if (has('uiRace') && !(r.uiRace.scrolls > 0))
    fail(
      'race:scroll',
      `(21) 레이스 반복 중 단축 바 조상 체인 스크롤 0 (전체 요소 ${r.uiRace.scrollsAll})`,
    );

  const h = { settleIds: (...pages) => pages.map((p) => `settle:${p}`), hw };
  const specs = [...judgeCore(r, h), ...judgeUi(r, h)];
  /** 게이트별 실제 접근 키 (평가한 게이트만) — 합성 검증이 「읽기 집합 완결」 을 이 값으로 정의한다. */
  const access = {};
  const evaluateChecked = (g) => {
    const { proxy, seen } = recordReads(r);
    const result = g.evaluate(proxy);
    const undeclared = [...seen].filter((k) => !g.reads.includes(k));
    if (undeclared.length)
      throw new Error(
        `게이트 「${g.name}」 가 선언하지 않은 키를 읽었다 ${JSON.stringify(undeclared)} (하네스 결함 — reads 갱신)`,
      );
    access[g.name] = [...seen];
    return result;
  };
  const dataMissing = [];
  const gates = specs.map((g) => {
    const absent = g.reads.filter((k) => !g.optional.includes(k) && !has(k));
    if (absent.length) {
      if (!bootFailed)
        throw new Error(
          `게이트 「${g.name}」 의 데이터 ${JSON.stringify(absent)} 가 부팅 실패 없이 없다 (하네스 결함)`,
        );
      dataMissing.push(g.name);
      return [g.name, `부팅 실패 — 데이터 부재 ${absent.join(', ')}`, '—', UNMEASURED];
    }
    const missing = g.needs.filter((id) => unmet[id]);
    if (missing.length) return [g.name, `전제 ${missing.join(', ')}`, '—', UNMEASURED];
    const lacking = g.partial ? g.partial(r) : [];
    if (lacking.length && !bootFailed)
      throw new Error(
        `게이트 「${g.name}」 의 표본 ${JSON.stringify(lacking)} 이 부팅 실패 없이 없다 (하네스 결함)`,
      );
    if (bootFailed && g.samples && g.samples(r) === 0) {
      dataMissing.push(g.name);
      return [g.name, '부팅 실패 — 표본 0', '—', UNMEASURED];
    }
    const [value, cond, ok] = evaluateChecked(g);
    // 빠진 표본이 있으면 FAIL 만 남긴다 — 있는 표본의 PASS 는 빠진 표본이 뒤집을 수 있다.
    if (lacking.length && ok !== false) {
      dataMissing.push(g.name);
      return [
        g.name,
        `부팅 실패 — 표본 부재 ${lacking.join(', ')} (있는 표본 ${value})`,
        cond,
        UNMEASURED,
      ];
    }
    return [g.name, value, cond, ok];
  });
  // 어떤 게이트도 기대지 않는 전제는 판정에 영향이 없다 — 「측정 불가」 와 섞어 출력하지 않고 정보로 분리한다 (N2).
  const used = new Set(specs.flatMap((g) => g.needs));
  const info = Object.fromEntries(Object.entries(unmet).filter(([id]) => !used.has(id)));
  const blocking = Object.fromEntries(Object.entries(unmet).filter(([id]) => used.has(id)));
  if (bootNotes.length) blocking.boot = bootNotes;
  return { gates, unmet: blocking, info, access, dataMissing };
}

/**
 * 렌더러 판독 — core 섹션 (S) · UI 상호작용 (U) · URL (R) 세 페이지의 `__isSoftwareRenderer`. 없는 판독은 빠진다.
 * `hw` 는 core 판독을 우선한다 (하드웨어 전용 섹션 D8 픽셀 쌍이 core 섹션에서 돈다) — 없으면 남은 판독.
 */
function readRenderer(r) {
  const reads = Object.fromEntries(
    Object.entries({ core: r.software, ui: r.uiSoftware, url: r.uiD11?.software }).filter(
      ([, v]) => v !== undefined,
    ),
  );
  const values = Object.values(reads);
  return { reads, distinct: new Set(values).size, hw: values.length > 0 && values[0] === false };
}

/** 로드 경로 기대 — 쌍의 기준 페이지가 쿼리대로 로드됐는가 (조작 전 판독). */
const LOAD_EXPECT = [
  ['A-cloudOn', (d) => d.clouds === 1],
  ['Au-cloudOn-ui', (d) => d.clouds === 1],
  ['B-cloudOff', (d) => d.clouds === 0],
  ['C-cloudRotOff', (d) => d.clouds === 0],
  ['Cu-cloudRotOff-ui', (d) => d.clouds === 0],
  ['D-cloudRotOn', (d) => d.clouds === 1],
  ['P1-night', (d) => d.nightLight > 0],
  ['P1u-night-ui', (d) => d.nightLight > 0],
  ['P2-nightOff', (d) => d.nightLight === 0],
  ['S-starsOff', (d) => d.stars === 0],
];
/** 하드웨어 전용 로드 기대 — 별 ON 로드 1 · OFF 로드 0. */
const LOAD_EXPECT_HW = [
  ['H1-starsOn', (d) => d.stars === 1],
  ['H1u-starsOn-ui', (d) => d.stars === 1],
  ['H2-starsOff', (d) => d.stars === 0],
  ['H3-starsOn', (d) => d.stars === 1],
];
/** D8p 표본 키 — A (로드) · S (별 런타임 생성) · T (스트레스 뒤). */
const D8P_KEYS = { A: 'd8pA', S: 'd8pS', T: 'd8pT' };

/** core 경로 (PR1 setter 직접 호출) + 로드 경로 구조 · 토글 전후 기하 · 토글 뒤 정착 게이트. */
function judgeCore(meta, { settleIds, hw }) {
  const loadExpect = hw ? [...LOAD_EXPECT, ...LOAD_EXPECT_HW] : LOAD_EXPECT;
  const postBad = (r, page) => ({
    settles: r.settles.filter((s) => s.page === page && s.postToggle && s.timedOut),
    ready: r.postToggleReady.filter((x) => x.page === page && (x.absent || x.error)),
  });
  // 준비 초과 페이지 — 그 페이지의 토글 전 정착 전제에 기댄다 (needs 계산이라 평가 함수 밖에서 읽는다).
  const slowPages = [...new Set(meta.onChecks.filter((x) => x.error).map((x) => x.page))];

  return [
    // 전제 22 의 판별 게이트 — 단독 재부팅도 실패하면 단독으로도 핸들이 노출되지 않은 것이다.
    // 부팅 실패가 없으면 표본 0 이 정상이라 `≥ 1` 을 걸지 않는다 (판정 대상이 「실패한 부팅」 이다).
    gate(
      '부팅 — 단독 핸들 노출 (부팅 실패 섹션의 같은 쿼리 단독 재부팅)',
      ['bootFailures'],
      [],
      (r) => [
        r.bootFailures.length
          ? JSON.stringify(r.bootFailures.map((f) => [f.section, f.label, f.contexts, f.reboot]))
          : '부팅 실패 0',
        '단독 재부팅 실패 0',
        r.bootFailures.every((f) => f.reboot.ok),
      ],
    ),
    // 기대 표본 = 쌍 기준 페이지. 부팅 실패로 빠진 페이지는 표본 부재 (있는 페이지의 FAIL 은 남는다).
    gate(
      '로드 경로 구조 — 쌍 기준 페이지가 쿼리대로 로드됨 (조작 전)',
      ['loadDisplay'],
      [],
      (r) => {
        const bad = loadExpect
          .filter(([label]) => r.loadDisplay[label])
          .filter(([label, ok]) => !ok(r.loadDisplay[label]))
          .map(([label]) => [label, r.loadDisplay[label]]);
        return [JSON.stringify(bad), '어긋난 페이지 0', bad.length === 0];
      },
      { partial: (r) => loadExpect.map(([l]) => l).filter((l) => !r.loadDisplay[l]) },
    ),
    gate(
      '토글 전후 페이지 기하 불변 (setter · 패널)',
      ['toggleGeom'],
      [],
      (r) => {
        const bad = r.toggleGeom.filter(
          (g) => g.before !== g.after || g.before.startsWith('error'),
        );
        return [
          JSON.stringify(bad),
          `변화 0 / ${r.toggleGeom.length} ∧ 표본 ≥ 1`,
          r.toggleGeom.length > 0 && bad.length === 0,
        ];
      },
      { samples: (r) => r.toggleGeom.length },
    ),
    // 토글 뒤 정착 · 준비 — 같은 페이지의 토글 **전** 정착에 기댄다 (reviewer R8). 토글 전은 정착했는데 뒤만 초과하면
    // FAIL (토글이 만든 결함), 둘 다 초과하면 환경 저속이라 측정 불가다. `d7m` 은 P1 의 토글 뒤 단계가 끝났다는 표지다.
    gate(
      'P1 불빛 끈 뒤 mid 정착 · 생성 · 준비',
      ['d7m', 'settles', 'postToggleReady'],
      settleIds('P1-night'),
      (r) => {
        const p = postBad(r, 'P1-night');
        return [
          JSON.stringify(p),
          '정착 초과 0 ∧ mid 부재·준비 초과 0',
          !!r.d7m && p.settles.length === 0 && p.ready.length === 0,
        ];
      },
    ),
    gate(
      'O 개요에서 불빛 끈 뒤 focus · mid 정착',
      ['d7eAll', 'settles', 'postToggleReady'],
      settleIds('O-overview'),
      (r) => {
        const p = postBad(r, 'O-overview');
        return [JSON.stringify(p), '정착 초과 0', !!r.d7eAll && p.settles.length === 0];
      },
    ),
    // 부재는 타이밍이 아니다 — setter 는 동기로 동작하므로 환경과 무관하게 FAIL 이다.
    gate('E 구름 ON 뒤 기존 mid 유지', ['d6fMidBeforeOn', 'd6fMidAfterOn'], [], (r) => [
      `ON 전 ${r.d6fMidBeforeOn} · 후 ${r.d6fMidAfterOn}`,
      'true',
      r.d6fMidAfterOn === true,
    ]),
    gate(
      '런타임 ON 직후 mesh 존재 (setter · 패널 경로 전부)',
      ['onChecks'],
      [],
      (r) => {
        const absent = r.onChecks.filter((x) => x.absent).map((x) => x.label);
        return [
          absent.length ? `부재 ${JSON.stringify(absent)}` : `부재 0 / ${r.onChecks.length}`,
          '부재 0 ∧ 표본 ≥ 1',
          r.onChecks.length > 0 && absent.length === 0,
        ];
      },
      { samples: (r) => r.onChecks.length },
    ),
    // 준비 초과는 그 페이지의 토글 전 정착에 기댄다 (PR #1267 의 「부재 = FAIL · 준비 초과 = 측정 불가」 구분을 되살리되,
    // 토글 전은 정상인데 ON 뒤만 초과하면 FAIL). 정착 기록이 없는 페이지 (UI 경량 페이지) 는 환경 증거가 없어 FAIL 이다.
    gate(
      '런타임 ON 직후 머티리얼 준비',
      ['onChecks'],
      settleIds(...slowPages),
      (r) => {
        const slow = r.onChecks.filter((x) => x.error);
        return [
          slow.length ? `준비 초과 ${JSON.stringify(slow.map((x) => x.error))}` : '0',
          '준비 초과 0',
          slow.length === 0,
        ];
      },
      { samples: (r) => r.onChecks.length },
    ),
    gate(
      'D5 구름 런타임 OFF ↔ 로드 OFF disk 변화 px',
      ['d5', 'd5Positive'],
      ['err:d5', 'err:d5Positive', 'pos:clouds', ...settleIds('A-cloudOn', 'B-cloudOff')],
      (r) => [r.d5.disk.changed, '== 0', r.d5.disk.changed === 0],
    ),
    gate(
      'D5 구조 — earth-cloud 수 · 그룹 0 정렬 (A/B)',
      ['d5CountsA', 'd5SortA', 'd5SortB'],
      ['err:d5SortA', 'err:d5SortB'],
      (r) => [
        `${r.d5CountsA.clouds} · A ${JSON.stringify(r.d5SortA)} · B ${JSON.stringify(r.d5SortB)}`,
        '0 ∧ A·B 둘 다 투명/불투명 기본값',
        r.d5CountsA.clouds === 0 &&
          r.d5SortA.transparentDefault &&
          r.d5SortA.opaqueDefault &&
          r.d5SortB.transparentDefault &&
          r.d5SortB.opaqueDefault,
      ],
    ),
    gate(
      'D6 구름 런타임 ON (자전 ON) ↔ 로드 ON disk 변화 px',
      ['d6', 'd6Positive'],
      ['err:d6', 'err:d6Positive', 'pos:cloudsRot', ...settleIds('C-cloudRotOff', 'D-cloudRotOn')],
      (r) => [r.d6.disk.changed, '== 0', r.d6.disk.changed === 0],
    ),
    gate(
      `D6 ${CLOUD_ROUND_TRIPS}왕복 누수 — 최대 구름 수 · 상태별 meshes/materials`,
      ['d6Leak'],
      [],
      (r) => {
        const leak = r.d6Leak;
        const tripsOk = leak.trips.every(
          (t) =>
            t.off.clouds === 0 &&
            t.on.clouds === 1 &&
            t.off.meshes === leak.countsOffLoad.meshes &&
            t.off.materials === leak.countsOffLoad.materials &&
            t.on.meshes === leak.countsOn.meshes &&
            t.on.materials === leak.countsOn.materials,
        );
        const maxClouds = Math.max(leak.countsOn.clouds, ...leak.trips.map((t) => t.on.clouds));
        return [
          `${maxClouds} · ${JSON.stringify(leak)}`,
          '≤ 1 ∧ OFF = 로드 OFF 개수 ∧ ON = 첫 ON 개수',
          maxClouds <= 1 && tripsOk,
        ];
      },
    ),
    gate(
      'D6 왕복 후 ↔ 로드 ON disk 변화 px',
      ['d6AfterTrips', 'd6Positive'],
      ['err:d6AfterTrips', 'pos:cloudsRot', ...settleIds('C-cloudRotOff', 'D-cloudRotOn')],
      (r) => [r.d6AfterTrips.disk.changed, '== 0', r.d6AfterTrips.disk.changed === 0],
    ),
    gate(
      'D6f mid 선생성 뒤 ON · fade 정지 ↔ 로드 ON disk 변화 px',
      ['d6f', 'd5Positive', 'd6fQueueE', 'd6fQueueF'],
      [
        'err:d6f',
        'pos:clouds',
        'err:d6fQueueE',
        'err:d6fQueueF',
        'fade:E',
        'fade:F',
        ...settleIds('E-cloudOff-mid', 'F-cloudOn-mid'),
      ],
      (r) => [r.d6f.disk.changed, '== 0', r.d6f.disk.changed === 0],
    ),
    gate(
      'D7 불빛 런타임 OFF ↔ 로드 OFF disk 변화 px',
      ['d7', 'd7Positive'],
      ['err:d7', 'err:d7Positive', 'pos:night', ...settleIds('P1-night', 'P2-nightOff')],
      (r) => [r.d7.disk.changed, '== 0', r.d7.disk.changed === 0],
    ),
    gate('D7 uniform — nightLightStrength 보유 머티리얼 전부', ['d7Strengths'], [], (r) => [
      JSON.stringify(r.d7Strengths.map((e) => e.v)),
      '전부 0 ∧ 1개 이상',
      r.d7Strengths.length > 0 && r.d7Strengths.every((e) => e.v === 0),
    ]),
    gate(
      'D7m 끈 뒤 mid 정착 쌍 disk 변화 px',
      ['d7m', 'd7Positive', 'harnessReady'],
      ['err:d7m', 'pos:night', 'ready:P2', ...settleIds('P1-night', 'P2-nightOff')],
      (r) => [r.d7m.disk.changed, '== 0', r.d7m.disk.changed === 0],
    ),
    gate(
      'D7e 개요 OFF → focus → mid: 지구 high·mid · 전 머티리얼',
      ['d7eEarth', 'd7eAll', 'd7eMidAtToggle'],
      ['edge:D7e', ...settleIds('O-overview')],
      (r) => [
        `earth ${JSON.stringify(r.d7eEarth)} · all ${r.d7eAll.length}`,
        '지구 high·mid 둘 다 존재 ∧ 전부 0',
        r.d7eEarth.some((e) => e.name === 'earth') &&
          r.d7eEarth.some((e) => e.name === EARTH_MID) &&
          r.d7eEarth.every((e) => e.v === 0) &&
          r.d7eAll.every((e) => e.v === 0),
      ],
    ),
    gate(
      `D8 구조 — stars=off → ON 수 · ${STRESS_ROUND_TRIPS}왕복 후 수 · 같은 인스턴스 · OFF 후 enabled`,
      ['d8AfterOn', 'd8AfterTrips', 'd8SameInstance', 'd8OffEnabled'],
      [],
      (r) => [
        `${r.d8AfterOn.stars} · ${r.d8AfterTrips.stars} · ${r.d8SameInstance} · ${r.d8OffEnabled}`,
        '1 · 1 · true · false',
        r.d8AfterOn.stars === 1 &&
          r.d8AfterTrips.stars === 1 &&
          r.d8SameInstance === true &&
          r.d8OffEnabled === false,
      ],
    ),
    hw
      ? gate(
          'D8 별 런타임 OFF ↔ 로드 OFF full frame 변화 px',
          ['d8Pixel', 'd8Determinism', 'd8Positive'],
          [
            'renderer',
            'err:d8Determinism',
            'err:d8Positive',
            'err:d8Pixel',
            'det:D8',
            'pos:D8',
            ...settleIds('H1-starsOn', 'H2-starsOff', 'H3-starsOn'),
          ],
          (r) => [r.d8Pixel.fullChanged, '== 0', r.d8Pixel.fullChanged === 0],
        )
      : gate('D8 픽셀 (하드웨어 전용)', [], ['renderer'], () => ['소프트웨어 렌더', '—', SKIP]),
    // 표본 A · S · T 는 각자 다른 섹션에서 나온다 — 부팅 실패로 빠진 표본은 표본 부재 (있는 표본의 FAIL 은 남는다).
    gate(
      'D8p 그룹 0 불투명 mesh (A·S·T 구조 열거) — starfield 외 depth write off',
      Object.values(D8P_KEYS),
      [],
      (r) => {
        const samples = Object.fromEntries(
          Object.entries(D8P_KEYS)
            .filter(([, k]) => r[k] !== undefined)
            .map(([s, k]) => [s, r[k].entries]),
        );
        const bad = Object.values(samples)
          .flat()
          .filter((e) => e.name !== STARFIELD_MESH && e.noDepthWrite);
        return [
          `${JSON.stringify(bad.map((e) => e.name))} · 표본 ${JSON.stringify(Object.fromEntries(Object.entries(samples).map(([k, v]) => [k, v.length])))}`,
          '없음 ∧ 표본마다 ≥ 1',
          bad.length === 0 && Object.values(samples).every((v) => v.length > 0),
        ];
      },
      {
        optional: Object.values(D8P_KEYS),
        partial: (r) => Object.values(D8P_KEYS).filter((k) => r[k] === undefined),
      },
    ),
    gate(
      `D15 ${STRESS_ROUND_TRIPS}왕복 × 4 토글 × 재생/일시정지 — 콘솔 에러 (스트레스 페이지)`,
      ['d15Errors'],
      [],
      (r) => [String(r.d15Errors.length), '!hasSimErrors', !hasSimErrors(r.d15Errors)],
    ),
    gate('D15 전 페이지 콘솔 에러', ['consoleErrors'], [], (r) => {
      const all = Object.values(r.consoleErrors).flat();
      return [String(all.length), '!hasSimErrors', !hasSimErrors(all)];
    }),
  ];
}

/** PR2 — UI 경로 게이트 (D1~D4 · D5~D8 UI 재판정 · D9~D11 · D14 · D15 UI). */
function judgeUi(meta, { settleIds, hw }) {
  const syncOk = (x) => x.panel === String(x.store) && x.bar === String(x.store);
  const expectedVisited = UI_IDS.map((id) => `display-toggle-${id}`);
  const allOff = Object.fromEntries(Object.values(UI_URL_KEY).map((k) => [k, 'off']));
  // R12 — 레이스 실패가 관측됐으면 (`bad > 0`) 스크롤 재료 전제 (21) 와 무관하게 판정한다 (needs 계산).
  const raceObservedFail = (meta.uiRace?.bad.length ?? 0) > 0;
  /** D1 · D2 — 모드마다 1 표본. 부팅 실패로 빠진 모드는 표본 부재 (있는 모드의 FAIL 은 남는다). */
  const modeOpts = {
    partial: (r) => UI_MODES.filter((m) => !r.uiModes.some((x) => x.mode === m)),
    samples: (r) => r.uiModes.length,
  };
  // D9 · D11 별 URL 의 렌더러 분기 — 그 섹션 판독이 없으면 (부팅 실패) 남은 판독으로 정한다.
  const uiSoftware = meta.uiSoftware ?? !hw;
  const urlSoftware = meta.uiD11?.software ?? !hw;
  return [
    gate(
      'UI 장면 준비 — 부팅 후 displayCapabilities 설정 (UI 페이지 전부)',
      ['uiCapsAtBoot'],
      [],
      (r) => [
        JSON.stringify(r.uiCapsAtBoot.filter((c) => c.caps === null).map((c) => c.label)),
        '미설정 0 ∧ 페이지 ≥ 1',
        r.uiCapsAtBoot.length > 0 && r.uiCapsAtBoot.every((c) => c.caps !== null),
      ],
      { samples: (r) => r.uiCapsAtBoot.length },
    ),
    // `?mode=` 진입 자체도 조건이다 — 패널 렌더가 앱을 무너뜨리면 모드 반영도 실패하므로 전제로 두지 않는다.
    gate(
      'UI D1 모드 4종 — ?mode= 진입 · 트리거 1개 · 열림 aria-expanded · 토글 4개 aria-pressed 가시',
      ['uiModes'],
      [],
      (r) => [
        JSON.stringify(
          r.uiModes.map((m) => [m.mode, m.store, m.triggers, m.expanded, m.toggles?.length]),
        ),
        '모드마다 store = 모드 · 1 · "true" · 4 ∧ 전부 가시',
        r.uiModes.length > 0 &&
          r.uiModes.every(
            (m) =>
              m.store === m.mode &&
              m.triggers === 1 &&
              m.expanded === 'true' &&
              m.toggles.length === UI_IDS.length &&
              m.toggles.every((t) => t.visible),
          ),
      ],
      modeOpts,
    ),
    gate(
      `UI D2 우측 그룹 버튼 x+width ≤ ${UI_VIEWPORT_WIDTH} (모드 4종)`,
      ['uiModes'],
      [],
      (r) => [
        JSON.stringify(r.uiModes.map((m) => [m.mode, m.layout.right.filter((b) => !b.ok)])),
        '위반 0 ∧ 버튼 ≥ 1',
        r.uiModes.length > 0 &&
          r.uiModes.every((m) => m.layout.right.length > 0 && m.layout.right.every((b) => b.ok)),
      ],
      modeOpts,
    ),
    gate(
      'UI D2 좌측 단축 바 전 버튼 스크롤 도달 · 클릭 가능 (모드 4종)',
      ['uiModes'],
      [],
      (r) => [
        JSON.stringify(r.uiModes.map((m) => [m.mode, m.layout.bar, m.layout.unreachable])),
        '도달 불가 0 ∧ 버튼 ≥ 1',
        r.uiModes.length > 0 &&
          r.uiModes.every((m) => m.layout.bar > 0 && m.layout.unreachable.length === 0),
      ],
      modeOpts,
    ),
    gate('UI D3 궤도선 패널 ↔ 단축 바 ↔ store (패널 클릭 · 단축 바 클릭)', ['uiD3'], [], (r) => [
      JSON.stringify(r.uiD3),
      '세 값 일치 ∧ 패널 클릭 반전 ∧ 단축 바 클릭 복귀',
      syncOk(r.uiD3.initial) &&
        syncOk(r.uiD3.afterPanel) &&
        syncOk(r.uiD3.afterBar) &&
        r.uiD3.afterPanel.store !== r.uiD3.initial.store &&
        r.uiD3.afterBar.store === r.uiD3.initial.store,
    ]),
    // D4 양성 대조는 게이트다 — 닫힌 뒤에도 숨지 않는 원인에 #1265 결함 (패널 열림 상태가 store 에 남음) 이 있다.
    gate(
      `UI D4 양성 대조 — 패널 닫힘 · ${D4_IDLE_MS}ms 무입력 → 상단 바 숨김`,
      ['uiD4'],
      ['d4:timing'],
      (r) => [
        `${r.uiD4.closedOpacity} (늦게라도 숨음 ${r.uiD4.closedLate})`,
        '"0"',
        r.uiD4.closedOpacity === '0',
      ],
    ),
    gate(
      `UI D4 observe · 패널 열림 · ${D4_IDLE_MS}ms 무입력 — 상단 바 opacity`,
      ['uiD4'],
      ['d4:timing'],
      (r) => [
        `${r.uiD4.openOpacity} (패널 ${r.uiD4.panels})`,
        '"1" ∧ 패널 1',
        r.uiD4.openOpacity === '1' && r.uiD4.panels === 1,
      ],
    ),
    // 스크롤 닫기는 트리거 위치가 바뀐 스크롤에서만 (라운드 5 — (나) 「모든 스크롤」 → (가) 번복, qa 레이스 실측).
    gate(
      'UI 무관 스크롤 (좌측 단축 바) — 패널 유지',
      ['uiScroll'],
      ['scroll', 'scroll:unrelated'],
      (r) => [
        JSON.stringify(r.uiScroll),
        '스크롤 직전 패널 1 ∧ 뒤 1',
        r.uiScroll.panelsBefore === 1 && r.uiScroll.panels === 1,
      ],
    ),
    gate(
      'UI 트리거 이동 스크롤 (좁은 폭 우측 그룹) — 패널 닫힘',
      ['uiTriggerScroll'],
      ['scroll:trigger'],
      (r) => [
        JSON.stringify(r.uiTriggerScroll),
        '스크롤 직전 패널 1 ∧ 뒤 0',
        r.uiTriggerScroll.panelsBefore === 1 && r.uiTriggerScroll.panels === 0,
      ],
    ),
    gate(
      `UI 레이스 — 키 간 지연 0 Tab → Enter × ${RACE_TRIALS}: 방금 연 패널 유지 · 포커스 첫 토글`,
      ['uiRace'],
      // 전제 (21) 는 「실패 0」 이 공허할 때만 막는다 — 실패가 관측되면 스크롤 유무와 무관하게 결함이다 (R12).
      raceObservedFail ? [] : ['race:scroll'],
      (r) => [
        `실패 ${r.uiRace.bad.length} / ${r.uiRace.trials} · Tab ${r.uiRace.tabsToTrigger} · 단축 바 스크롤 ${r.uiRace.scrolls} (전체 요소 ${r.uiRace.scrollsAll}) ${JSON.stringify(r.uiRace.bad.slice(0, 3))}`,
        `실패 0 / ${RACE_TRIALS}`,
        r.uiRace.trials === RACE_TRIALS && r.uiRace.bad.length === 0,
      ],
    ),
    gate(
      'UI 캡처 직전 패널 요소 수 (D5~D8 UI)',
      ['uiPanelsAtCapture'],
      [],
      (r) => [
        JSON.stringify(r.uiPanelsAtCapture),
        '전부 0 ∧ 캡처 ≥ 1',
        r.uiPanelsAtCapture.length > 0 && r.uiPanelsAtCapture.every((c) => c.panels === 0),
      ],
      { samples: (r) => r.uiPanelsAtCapture.length },
    ),
    gate(
      'UI D5 패널 구름 OFF ↔ 로드 OFF disk 변화 px',
      ['d5ui', 'd5Positive'],
      ['err:d5ui', 'pos:clouds', ...settleIds('Au-cloudOn-ui', 'B-cloudOff')],
      (r) => [r.d5ui.disk.changed, '== 0', r.d5ui.disk.changed === 0],
    ),
    gate(
      'UI D5 구조 — earth-cloud 수 · 그룹 0 정렬',
      ['d5uiCounts', 'd5uiSort'],
      ['err:d5uiSort'],
      (r) => [
        `${r.d5uiCounts.clouds} · ${JSON.stringify(r.d5uiSort)}`,
        '0 ∧ 투명/불투명 기본값',
        r.d5uiCounts.clouds === 0 && r.d5uiSort.transparentDefault && r.d5uiSort.opaqueDefault,
      ],
    ),
    gate(
      'UI D6 패널 구름 ON (자전 ON) ↔ 로드 ON disk 변화 px',
      ['d6ui', 'd6Positive'],
      ['err:d6ui', 'pos:cloudsRot', ...settleIds('Cu-cloudRotOff-ui', 'D-cloudRotOn')],
      (r) => [r.d6ui.disk.changed, '== 0', r.d6ui.disk.changed === 0],
    ),
    gate(
      'UI D7 패널 불빛 OFF ↔ 로드 OFF disk 변화 px · uniform',
      ['d7ui', 'd7uiStrengths', 'd7Positive'],
      ['err:d7ui', 'pos:night', ...settleIds('P1u-night-ui', 'P2-nightOff')],
      (r) => [
        `${r.d7ui.disk.changed} · ${JSON.stringify(r.d7uiStrengths.map((e) => e.v))}`,
        '== 0 ∧ 전부 0 ∧ 1개 이상',
        r.d7ui.disk.changed === 0 &&
          r.d7uiStrengths.length > 0 &&
          r.d7uiStrengths.every((e) => e.v === 0),
      ],
    ),
    hw
      ? gate(
          'UI D8 패널 별 OFF ↔ 로드 OFF full frame 변화 px',
          ['d8ui', 'd8Determinism', 'd8Positive'],
          [
            'renderer',
            'err:d8ui',
            'det:D8',
            'pos:D8',
            ...settleIds('H1u-starsOn-ui', 'H2-starsOff'),
          ],
          (r) => [r.d8ui.fullChanged, '== 0', r.d8ui.fullChanged === 0],
        )
      : gate('UI D8 패널 별 OFF ↔ 로드 OFF full frame (하드웨어 전용)', [], ['renderer'], () => [
          '소프트웨어 렌더',
          '—',
          SKIP,
        ]),
    hw
      ? gate('UI D8 stars=off → 패널 ON starfield 수', ['uiD11Load'], ['renderer'], (r) => [
          r.uiD11Load.starsAfterUiOn,
          '1',
          r.uiD11Load.starsAfterUiOn === 1,
        ])
      : gate('UI D8 stars=off → 패널 ON starfield 수 (하드웨어 전용)', [], ['renderer'], () => [
          '소프트웨어 렌더',
          '—',
          SKIP,
        ]),
    uiSoftware
      ? gate(
          'UI D9 소프트웨어 렌더 — 별 토글 aria-disabled · 사유 · 클릭 후 별 0 · 전역 · URL',
          ['uiD9'],
          ['renderer'],
          (r) => [
            JSON.stringify(r.uiD9),
            `aria-disabled "true" ∧ title ⊃ "${REASON_MARK.software}" ∧ 2회 클릭 내내 pressed "false" · 별 0 · 의도 불변 · URL stars 부재 ∧ __starfieldVisible false`,
            r.uiD9.ariaDisabled === 'true' &&
              typeof r.uiD9.title === 'string' &&
              r.uiD9.title.includes(REASON_MARK.software) &&
              r.uiD9.pressedBefore === 'false' &&
              r.uiD9.clicks.length === DISABLED_CLICKS &&
              r.uiD9.clicks.every(
                (c) =>
                  c.pressed === 'false' && c.stars === 0 && c.intent === true && c.url === null,
              ) &&
              r.uiD9.starMeshes === 0 &&
              r.uiD9.starfieldVisibleGlobal === false &&
              r.uiD9.urlStars === null,
          ],
        )
      : gate('UI D9 소프트웨어 렌더 별 토글 (소프트웨어 전용)', [], ['renderer'], () => [
          '하드웨어 렌더',
          '—',
          SKIP,
        ]),
    gate(
      'UI D10 surface=off — 구름·불빛 aria-disabled · 사유 · 클릭 후 mesh/머티리얼/URL 무변화',
      ['uiD10'],
      [],
      (r) => {
        const d10 = r.uiD10;
        const attrs = Object.values(d10.attrs);
        return [
          JSON.stringify(d10),
          `aria-disabled "true" ∧ title ⊃ "${REASON_MARK.surfaceOff}" ∧ 개수 동일 ∧ 구름 0 ∧ URL 동일 ∧ 매 클릭 뒤 개수 · URL · 의도 불변`,
          attrs.length === SURFACE_TOGGLES.length &&
            attrs.every(
              (a) => a.ariaDisabled === 'true' && (a.title ?? '').includes(REASON_MARK.surfaceOff),
            ) &&
            d10.clicks.length === SURFACE_TOGGLES.length * DISABLED_CLICKS &&
            d10.clicks.every(
              (c) =>
                c.counts.meshes === d10.before.meshes &&
                c.counts.materials === d10.before.materials &&
                JSON.stringify(c.url) === JSON.stringify(d10.urlBefore) &&
                JSON.stringify(c.intents) === JSON.stringify(d10.intentsBefore),
            ) &&
            d10.before.meshes === d10.after.meshes &&
            d10.before.materials === d10.after.materials &&
            d10.after.clouds === 0 &&
            JSON.stringify(d10.urlBefore) === JSON.stringify(d10.urlAfter),
        ];
      },
    ),
    gate('UI D11 URL — OFF 키=off · ON 키 부재 · history.length 불변', ['uiD11'], [], (r) => [
      `${JSON.stringify(r.uiD11.trips.map((t) => [t.id, t.offOk, t.onOk]))} · history ${r.uiD11.h0}→${r.uiD11.hAfterTrips}`,
      '전부 true ∧ history 불변 ∧ 토글 수 = 대상 수',
      r.uiD11.trips.length === r.uiD11.ids.length &&
        r.uiD11.trips.every((t) => t.offOk && t.onOk) &&
        r.uiD11.hAfterTrips === r.uiD11.h0,
    ]),
    gate('UI D11 북마크 복사 URL — OFF 시 키=off · ON 시 키 부재', ['uiD11'], [], (r) => [
      JSON.stringify(r.uiD11.trips.map((t) => [t.id, t.bookmarkOff, t.bookmarkOnHas])),
      '"off" · false',
      r.uiD11.trips.every((t) => t.bookmarkOff === 'off' && t.bookmarkOnHas === false),
    ]),
    // 새로고침 뒤 장면 준비 대기 초과도 게이트다 — 원인에 URL 상태별 준비 결함이 들어간다 (라운드 3 전제 감사).
    gate(
      'UI D11 새로고침 — 장면 준비 · 패널 aria-pressed · scene 상태 동일',
      ['uiD11'],
      ['reload:boot'],
      (r) => {
        const d11 = r.uiD11;
        const offHeld = !!d11.before && d11.ids.every((id) => d11.before.pressed[id] === 'false');
        return [
          `ready ${d11.reloadReady} · ${JSON.stringify(d11.before)} → ${JSON.stringify(d11.after)}`,
          '준비 ∧ 새로고침 전 = 후 ∧ 전 상태가 실제로 전부 OFF',
          d11.reloadReady === true &&
            offHeld &&
            JSON.stringify(d11.before) === JSON.stringify(d11.after),
        ];
      },
    ),
    urlSoftware
      ? gate('UI D11 별 URL (하드웨어 전용)', [], ['renderer'], () => [
          '소프트웨어 렌더 — 가용성 차단 (D9)',
          '—',
          SKIP,
        ])
      : gate('UI D11 별 URL 포함 (하드웨어)', ['uiD11'], ['renderer'], (r) => [
          JSON.stringify(r.uiD11.ids),
          'stars 포함',
          r.uiD11.ids.includes('stars'),
        ]),
    gate('UI D11 로드 직후 (조작 전) 4 키 불변', ['uiD11Load'], [], (r) => [
      JSON.stringify(r.uiD11Load.urlAtLoad),
      JSON.stringify(allOff),
      JSON.stringify(r.uiD11Load.urlAtLoad) === JSON.stringify(allOff),
    ]),
    gate(
      'UI D11 ?orbits=off → ON → 북마크 orbits 부재 (나머지 off 유지)',
      ['uiD11Load'],
      [],
      (r) => [
        JSON.stringify(r.uiD11Load),
        'ON 반영 ∧ 북마크 orbits 부재 ∧ 나머지 off 유지',
        r.uiD11Load.orbitsOnOk &&
          r.uiD11Load.bookmarkOrbitsHas === false &&
          !!r.uiD11Load.bookmarkOthers &&
          Object.values(r.uiD11Load.bookmarkOthers).every((v) => v === 'off'),
      ],
    ),
    gate(
      'UI D14 키보드 — Tab 도달 · Enter 열림 · 토글 4개 순회 · Space 반전 · Esc 닫힘 + 포커스 복귀',
      ['uiD14'],
      [],
      (r) => [
        JSON.stringify(r.uiD14),
        `도달 ∧ "true" ∧ ${JSON.stringify(expectedVisited)} ∧ 반전 ∧ 패널 0 ∧ 포커스 트리거`,
        r.uiD14.reached &&
          r.uiD14.expanded === 'true' &&
          JSON.stringify(r.uiD14.visited) === JSON.stringify(expectedVisited) &&
          r.uiD14.spaceFlipped === true &&
          r.uiD14.panelsAfterEsc === 0 &&
          r.uiD14.focusAfterEsc === 'display-panel-toggle',
      ],
    ),
    gate(
      'UI D14 포커스 순서 — 마지막 토글 Tab → 닫힘 + 트리거 다음 요소 · 첫 토글 Shift+Tab → 트리거 (패널 유지) · 트리거 Tab → 첫 토글 · 트리거 Shift+Tab → 닫힘 + 트리거 이전 요소',
      ['uiD14'],
      [],
      (r) => {
        const d = r.uiD14;
        return [
          JSON.stringify({
            nativeNext: d.nativeNext,
            nativePrev: d.nativePrev,
            backToTrigger: d.backToTrigger,
            backToTrigger2: d.backToTrigger2,
            lastTab: d.lastTab,
            firstShiftTab: d.firstShiftTab,
            triggerTab: d.triggerTab,
            leaveBackward: d.leaveBackward,
          }),
          '마지막 Tab → 패널 0 · 트리거 기본 Tab 목적지 ∧ Shift+Tab → 패널 1 · 트리거 ∧ Tab → 첫 토글 ∧ 트리거 Shift+Tab → 패널 0 · 트리거 기본 Shift+Tab 목적지',
          !!d.nativeNext &&
            !!d.nativePrev &&
            d.nativeNext !== 'display-panel-toggle' &&
            d.nativePrev !== 'display-panel-toggle' &&
            d.backToTrigger === 'display-panel-toggle' &&
            d.backToTrigger2 === 'display-panel-toggle' &&
            d.lastTab?.panels === 0 &&
            d.lastTab?.focus === d.nativeNext &&
            d.firstShiftTab?.panels === 1 &&
            d.firstShiftTab?.focus === 'display-panel-toggle' &&
            d.triggerTab === expectedVisited[0] &&
            d.leaveBackward?.panels === 0 &&
            d.leaveBackward?.focus === d.nativePrev,
        ];
      },
    ),
    // 시작 선택이 earth 인지도 조건이다 — `?focus=earth` 반영 실패는 제품 결함일 수 있다.
    gate(
      'UI D14 엣지 — focus=earth 에서 패널 Esc → 자유시점 미진입 · 선택 유지',
      ['uiD14'],
      [],
      (r) => [
        `시작 ${r.uiD14.selectedBefore} · freeFly ${r.uiD14.freeFlyAfterEsc} · selected ${r.uiD14.selectedAfterEsc}`,
        '시작 earth · false · earth',
        r.uiD14.selectedBefore === 'earth' &&
          r.uiD14.freeFlyAfterEsc === false &&
          r.uiD14.selectedAfterEsc === 'earth',
      ],
    ),
    gate(
      '자유시점 Esc 양성 대조 — 패널 닫힘 · 선택 있음 · Esc → 자유시점 진입 (#509 — D14 엣지 · D14b 판별력의 전제)',
      ['uiFreeFlyControl'],
      ['ctl'],
      (r) => [
        JSON.stringify(r.uiFreeFlyControl),
        'freeFly true',
        r.uiFreeFlyControl.freeFly === true,
      ],
    ),
    // 선택 변경 반영 · Esc 직전 패널 열림도 조건이다 — 둘 다 #1265 결함 (패널이 선택 변경에 닫힘 등) 으로 깨질 수 있다.
    gate(
      'UI D14b — 패널 연 채 선택 변경 후 Esc → 패널 닫힘 · 자유시점 미진입',
      ['uiD14b'],
      [],
      (r) => [
        JSON.stringify(r.uiD14b),
        '선택 변경 ∧ Esc 직전 패널 1 ∧ 패널 0 ∧ freeFly false',
        r.uiD14b.selectedMars === true &&
          r.uiD14b.panelsBeforeEsc === 1 &&
          r.uiD14b.panelsAfterEsc === 0 &&
          r.uiD14b.freeFly === false,
      ],
    ),
    gate(
      `UI D15 패널 ${STRESS_ROUND_TRIPS}왕복 × 4 토글 × 재생/일시정지 — 콘솔 에러`,
      ['uiD15Errors'],
      [],
      (r) => [String(r.uiD15Errors.length), '!hasSimErrors', !hasSimErrors(r.uiD15Errors)],
    ),
  ];
}

async function main() {
  // SWIFTSHADER 미지정이면 렌더러 축을 `BROWSER_VERIFY_GPU` (기본 `default`) 에 맡긴다 — D8 픽셀은 하드웨어
  // 렌더에서만 성립하므로 로컬에서 `BROWSER_VERIFY_GPU=metal` 로 실 GPU 경로를 열 수 있어야 한다.
  const r = await withBrowser({ gpu: SWIFTSHADER ? 'swiftshader' : undefined }, run, {
    launch: launchBrowser,
  });
  console.log(
    `=== #1265 런타임 표시 토글 (core) — 진단 (INJECT=${INJECT}${r.injectNote ? ` — ${r.injectNote}` : ''}) ===`,
  );
  const show = (label, m) =>
    m?.error
      ? console.log(`${label}: error ${m.error}`)
      : console.log(
          `${label}: ${JSON.stringify({ disk: m?.disk, DI: m?.DI, NI: m?.NI, fullChanged: m?.fullChanged, outsideChanged: m?.outsideChanged })}`,
        );
  console.log(`renderer software=${r.software}`);
  for (const k of [
    'd5Positive',
    'd5',
    'd6Positive',
    'd6',
    'd6AfterTrips',
    'd6f',
    'd7Positive',
    'd7',
    'd7m',
  ])
    show(k, r[k]);
  if (!r.software)
    for (const k of ['d8Determinism', 'd8Positive', 'd8Pixel', 'd8bDiag']) show(k, r[k]);
  else console.log(`d8Pixel: ${JSON.stringify(r.d8Pixel)}`);
  console.log(
    `d5 sort A ${JSON.stringify(r.d5SortA)} · B ${JSON.stringify(r.d5SortB)} · counts A ${JSON.stringify(r.d5CountsA)}`,
  );
  console.log(`d6 leak ${JSON.stringify(r.d6Leak)}`);
  console.log(
    `d6f mid 존재(ON 직전) ${r.d6fMidBeforeOn} · queue E ${JSON.stringify(r.d6fQueueE)} · F ${JSON.stringify(r.d6fQueueF)}`,
  );
  console.log(
    `d7 mid 존재(OFF 직전) ${r.d7MidBeforeOff} · strengths ${JSON.stringify(r.d7Strengths)}`,
  );
  console.log(
    `d7e mid 토글 시점 ${r.d7eMidAtToggle} · 정착 후 ${r.d7eMidAfter} · earth ${JSON.stringify(r.d7eEarth)}`,
  );
  console.log(
    `d8 counts load ${JSON.stringify(r.d8LoadCounts)} · on ${JSON.stringify(r.d8AfterOn)} · trips ${JSON.stringify(r.d8AfterTrips)}`,
  );
  console.log(
    `d8p A ${JSON.stringify(r.d8pA)} · S ${JSON.stringify(r.d8pS)} · T ${JSON.stringify(r.d8pT)}`,
  );
  console.log(
    `onChecks ${JSON.stringify(r.onChecks)} · harnessReady ${JSON.stringify(r.harnessReady)}`,
  );
  console.log(`d15 counts ${JSON.stringify(r.d15Counts)}`);
  for (const k of ['d5ui', 'd6ui', 'd7ui']) show(k, r[k]);
  if (!r.software) show('d8ui', r.d8ui);
  console.log(`ui panelsAtCapture ${JSON.stringify(r.uiPanelsAtCapture)}`);
  console.log(`ui modes ${JSON.stringify(r.uiModes)}`);
  console.log(
    `ui software=${r.uiSoftware} · D4 ${JSON.stringify(r.uiD4)} · D3 ${JSON.stringify(r.uiD3)}`,
  );
  console.log(
    `ui D14 ${JSON.stringify(r.uiD14)} · D14b ${JSON.stringify(r.uiD14b)} · D9 ${JSON.stringify(r.uiD9)}`,
  );
  console.log(`ui D11 ${JSON.stringify(r.uiD11)}`);
  console.log(`ui D11 load ${JSON.stringify(r.uiD11Load)} · D10 ${JSON.stringify(r.uiD10)}`);
  console.log(
    `settles ${JSON.stringify(r.settles.map((s) => `${s.page}/${s.step}:${s.dist}/${s.fading}/${s.timedOut ? 'TIMEOUT' : 'ok'}`))}`,
  );
  console.log(`consoleErrors ${JSON.stringify(r.consoleErrors)}`);
  console.log(`bootFailures ${JSON.stringify(r.bootFailures)}`);

  const v = judge(r);
  for (const [id, msgs] of Object.entries(v.info))
    for (const m of msgs) console.log(`[정보] 기대는 게이트 없는 전제 [${id}] ${m}`);
  const unmetEntries = Object.entries(v.unmet);
  if (unmetEntries.length) {
    console.error(
      '\n[측정 불가 전제] 아래 전제에 기대는 게이트만 평가하지 않는다 (나머지는 평가):',
    );
    for (const [id, msgs] of unmetEntries) for (const m of msgs) console.error(`  - [${id}] ${m}`);
  }
  console.log('\n=== 게이트 ===');
  // SKIP 은 PASS 에 섞지 않는다 — 환경상 판정되지 않은 게이트를 「충족」으로 세면 요약이 공허 통과를 숨긴다
  // (PR #1267 qa 비차단 1: CI 는 항상 소프트웨어 렌더라 하드웨어 전용 게이트가 CI 에서 한 번도 판정되지 않는다).
  const tally = { PASS: 0, FAIL: 0, SKIP: 0, [UNMEASURED]: 0 };
  for (const [name, value, cond, ok] of v.gates) {
    const status = ok === SKIP ? 'SKIP' : ok === UNMEASURED ? UNMEASURED : ok ? 'PASS' : 'FAIL';
    tally[status] += 1;
    console.log(`  ${status}  ${name} = ${value}  (${cond})`);
  }
  const unmeasuredPart = tally[UNMEASURED] ? ` · 측정 불가 ${tally[UNMEASURED]}` : '';
  const summary = `판정 ${tally.PASS + tally.FAIL} (PASS ${tally.PASS} · FAIL ${tally.FAIL}) · SKIP ${tally.SKIP}${unmeasuredPart} / 게이트 ${v.gates.length}`;
  // 우선순위 FAIL > 측정 불가 > PASS — 평가된 게이트가 하나라도 FAIL 이면 판정이 있다 (judge 주석).
  if (tally.FAIL) {
    console.log(`\n[FAIL] 게이트 미충족 — ${summary}`);
    return 1;
  }
  if (tally[UNMEASURED]) {
    console.error(`\n[측정 불가] PASS 도 FAIL 도 내지 않는다 — ${summary}`);
    return EXIT_UNMEASURABLE;
  }
  console.log(`\n[PASS] ${summary}`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
