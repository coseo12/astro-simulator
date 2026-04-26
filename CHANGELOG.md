# 변경 이력

모든 중요한 변경사항은 이 파일에 기록된다.
Semantic Versioning을 따른다.

## [Unreleased]

### Behavior Changes

- **R1 UI 회귀 가드 baseline CI Linux 전환 인프라** ([#337](https://github.com/coseo12/astro-simulator/issues/337)) — `.github/workflows/r1-baseline-bootstrap.yml` (`workflow_dispatch`, ubuntu-latest 캡처 + `peter-evans/create-pull-request`) 신규 + `.github/workflows/ci.yml` `detect-and-test` job 에 r1-guard step 2개 추가 (실행 + 실패 시 diff 이미지 `actions/upload-artifact` 업로드). `apps/web/scripts/r1-ui-regression-guard.mjs` 매개변수화: `BASE_URL` 환경변수 계약 헤더 주석 박제 + `SKIP_LOCAL=1 + macOS darwin` 즉시 PASS 종료 (5 라인 변경). `r1-ui-regions.mjs` 0 라인 변경. baseline 12 PNG 는 본 PR 머지 후 `r1:baseline-bootstrap` workflow_dispatch 1회 실행으로 자동 갱신 PR 생성 (Linux 캡처본 교체). 로컬 macOS 검증 시 폰트 차이 false positive 가능 — `SKIP_LOCAL=1` env var 또는 CI 결과 신뢰. ADR `20260425-r1-ui-pixel-diff-guard.md` §Amendment 2026-04-26

## [0.13.0] — 2026-04-26

> **R1 사이클 (2026-04-25 ~ 2026-04-26)** — Roadmap v3 "Incremental Body-by-Body Build" 첫 스프린트. 태양 가시성 복구 + 회귀 가드 인프라. 8 PR 머지 (#330, #331, #332, #338, #339, #340, #342, #344).

### Fix

- **billboard variant `bodyScale` 분리** ([#333](https://github.com/coseo12/astro-simulator/issues/333), Phase 2) — `createBodyBillboard` 의 `diameter` 식에서 `bodyScale` 곱셈 제거. sphere/mid variant 는 그대로 유지 (시각 과장 책임 단독). billboard 는 sub-pixel draw call 절감 책임 단독 — 책임 직교화. focus 강제 해제 + 1 AU+ 카메라 거리 + 픽셀 경계 부족 edge case 에서 거대 quad 회귀 차단 (PR [#332](https://github.com/coseo12/astro-simulator/pull/332) 검증 중 발견된 시각 회귀의 근본 해결). ADR `20260425-r1-sun-visualization.md` §"Phase 2 결정 (#333)" amendment 참조. 신규 단위 테스트 (`packages/core/src/scene/body-scale-variants.test.ts`, 9 케이스) drift 방어
- **store-scene 동기화 단일 경로 통합** ([#334](https://github.com/coseo12/astro-simulator/issues/334) + [#335](https://github.com/coseo12/astro-simulator/issues/335)) — `SimulationCore.setCameraHandlers(focus, reset, setRadius)` → `setCameraRadiusHandler(setRadius)` 단일 인자로 단순화 + 리네이밍. focus / resetCamera 콜백 폐기 → `useSimStore.subscribe(selectedBodyId)` 분기가 scene focus / 카메라 reset 단일 책임. `syncFocusToScene(bodyId)` helper 추출 (마운트 직후 1회 sync 와 subscribe 분기 식 공유, DRY). `case 'focusOn'` / `case 'resetCamera'` 의 `bodySelected` event emit 은 보존 — store sync 경로 (core-adapter → setSelectedBody) 의존. **이중 호출 해소**: 클릭 시 `controller.focusOn` 1회만 호출 (이전 2회). `setSelectedBody(null)` 시 `controller.reset` 1회 (이전 2회 또는 미래 info-panel close 누락 가능성). PR #332 Phase 1 fix `acfcb74` 의 임시 해결책 (subscribe + setCameraHandlers 이중 경로) 을 정식 통합으로 대체. ADR `20260425-r1-store-scene-sync-unification.md` §결정 1~6. 회귀 가드: `simulation-core-camera-sync.test.ts` 6 케이스 (이벤트 emit / 핸들러 호출 횟수 / `setCameraHandlers` 부활 방지)

### Chore

- **P11-C QA 진단 스크립트 박제 + 임시 벤치 폐기** ([#290](https://github.com/coseo12/astro-simulator/issues/290), PR [#330](https://github.com/coseo12/astro-simulator/pull/330) `1b4f6d6`) — `apps/web/scripts/p290-{diag-visibility, qa-console-errs, qa-idle-fps, qa-real-chrome}.mjs` 4건 회귀 가드용 정식 추적. phase 라벨 없는 임시 벤치 산출물 (`docs/benchmarks/2026-04-24T08-*.json`) 3건 폐기
- **Harness v2.29.1 → v3.6.0 업데이트** ([volt #77](https://github.com/coseo12/volt/issues/77), PR [#338](https://github.com/coseo12/astro-simulator/pull/338) `9d818e9`) — v3.0.0 책임 분리 6c 수동 마이그레이션 완료. lessons 9개 / 가이드 2개 / frozen verify 4개 신규. ci.yml user-only 격리 (`docs/harness-ci-migration.md`). harness-guards.yml lib 부재 시 skip 임시 패치 (commit `a8f75d4`)

### Docs

- **R1 태양 가시성 ADR 2편 박제** ([#329](https://github.com/coseo12/astro-simulator/issues/329), PR [#331](https://github.com/coseo12/astro-simulator/pull/331) `c001ac1`) — 시각화 ADR (`docs/decisions/20260425-r1-sun-visualization.md`) + 회귀 가드 ADR (`docs/decisions/20260425-r1-ui-pixel-diff-guard.md`). 4 결정 (sunScale 75 / 상수 위치 / 곱셈 순서 / pixel diff 임계값) 박제. Concrete Prediction (R2 추가 시 4 파일 0 라인) 박제
- **ADR `20260425-r1-sun-visualization.md` Amendment** ([#336](https://github.com/coseo12/astro-simulator/issues/336), PR [#339](https://github.com/coseo12/astro-simulator/pull/339) `f427f88`) — §결과·재검토 조건 보강: 재검토 트리거 #6 ("[#333](https://github.com/coseo12/astro-simulator/issues/333) Phase 2 처리 시점 도래") + §위험·미해결 sub-섹션 신규 ("Phase 2 미해결 사항 (#333)")

### R1 태양 가시성 복구 (Roadmap v3 — 사용자가 명시적으로 visible)

메인 이슈: [#329](https://github.com/coseo12/astro-simulator/issues/329) · ADR: [`20260425-r1-sun-visualization.md`](docs/decisions/20260425-r1-sun-visualization.md) (시각화) + [`20260425-r1-ui-pixel-diff-guard.md`](docs/decisions/20260425-r1-ui-pixel-diff-guard.md) (회귀 가드)

PR [#332](https://github.com/coseo12/astro-simulator/pull/332) (`6e7382e`) — 기본 진입 화면 태양 가시성 복구 + UI 회귀 가드 인프라. P12 폐기 후 incremental body-by-body build 의 첫 body.

#### Behavior Changes

- **`BODY_SCALE.sun = 75` 시각 과장 박제** (`apps/web/src/constants/body-scale.ts`) — 1 AU 거리 카메라 시점에 viewport 점유율 ≥ 3% (1280×720 / 1920×1080 / 375×667 3 viewport 검증). 이전 sub-pixel ~1px → 가시 sphere
- **`packages/core` ↔ `apps/web` 의존성 역전 방지** — `bodyScale: (id) => number` callback DI 주입. `packages/core` 는 시각 과장 데이터를 모름 (시각/물리 계층 분리)
- **`sim-canvas.tsx` `selectedBodyId` ↔ scene focus 동기화** (commit `acfcb74` Phase 1 fix) — `useSimStore.subscribe` + 마운트 직후 1회 sync. URL `?focus=` 진입 시 LOD 분기 정상 high 적용. 이전 동기화 누락으로 거대 quad 회귀
- **R1 회귀 가드 인프라** (`apps/web/scripts/r1-{ui-regression-guard, ui-regions}.mjs` + `__baselines__/r1/` 12 PNG) — pixelmatch threshold=0.1 / mismatch ≤ 0.5% / 4 영역 × 3 viewport
- **focus LOD 회귀 자동 가드** (`apps/web/scripts/p329-qa-focus-lod-guard.mjs`, commit `9516b68`) — `channel: 'chrome'` 강제 + sphere/billboard 자동 판별. volt #33 (headless swiftshader 함정) 변형 false positive 차단
- **info-panel sun 5 항목 표시** — mass / radius / luminosity / spectral class / dataSource (IAU 2015). `?mode=research` 모드 한정 (observe 모드 SidePanels 숨김 — R1 비-범위)
- **`focus=sun` URL override + dev 경고** — 허용 body id 외 무시 + 콘솔 경고
- **HUD `× 75 과장 중` 명시 표시** — 사용자 친화 표현 (Gemini 교차검증 개선 제안 2 반영)
- **Q3=C 비-범위 자동 가드** (`apps/web/scripts/verify-r1-tier-untouched.sh`) — `tier.ts` / `tier-transition.ts` / `lod-body-thresholds.ts` 0 라인 변경 검증. PR 머지 전 강제

### Harness 워크플로 (volt #77 반영, v3.6.0)

- **메인 오케스트레이터 단계 게이트 신규** (PR [#338](https://github.com/coseo12/astro-simulator/pull/338)) — `developer → reviewer → qa → 사용자/머지` 순서 강제. developer self-compare 자명 PASS 함정 차단. 예외: docs only / chore. CLAUDE.md `### sub-agent 검증 완료 ≠ GitHub 박제 완료` line 287 박제
- **에이전트 3개 갱신** — `.claude/agents/{pm, qa, reviewer}.md` 행동 정의 v3.6.0 정합
- **스킬 2개 갱신** — `.claude/skills/{cross-validate, run-tests}/...` 절차 정합

### 분류

- PR [#330](https://github.com/coseo12/astro-simulator/pull/330): PATCH (회귀 가드 스크립트 박제, 행동 변화 없음)
- PR [#331](https://github.com/coseo12/astro-simulator/pull/331): PATCH (ADR docs only)
- PR [#332](https://github.com/coseo12/astro-simulator/pull/332): **MINOR** (UI 행동 변화 + 회귀 가드 인프라 신규)
- PR [#338](https://github.com/coseo12/astro-simulator/pull/338): **MINOR** (메인 오케스트레이터 게이트 룰 + 에이전트/스킬 갱신)
- PR [#339](https://github.com/coseo12/astro-simulator/pull/339): PATCH (ADR amendment, 문서 보강만)
- PR [#340](https://github.com/coseo12/astro-simulator/pull/340): PATCH (CHANGELOG 소급 박제, 문서 보강만)
- PR [#342](https://github.com/coseo12/astro-simulator/pull/342) (#333 Phase 2): **MINOR** (billboard `bodyScale` 분리 — 시각 행동 변화 + drift 방어 단위 테스트 9 케이스)
- PR [#344](https://github.com/coseo12/astro-simulator/pull/344) (#334 + #335): **MINOR** (`setCameraHandlers` → `setCameraRadiusHandler` 내부 API 리네이밍 + 시그니처 단순화 + 행동 변화 — 이중 호출 1회로 단일화)

### Notes

- R1 후속 5건 ([#333](https://github.com/coseo12/astro-simulator/issues/333), [#334](https://github.com/coseo12/astro-simulator/issues/334), [#335](https://github.com/coseo12/astro-simulator/issues/335), [#336](https://github.com/coseo12/astro-simulator/issues/336), [#337](https://github.com/coseo12/astro-simulator/issues/337)) — R2 (수성) 진입 전 처리 권고. #333 / #334 / #335 / #336 완료, **#337 (CI Linux baseline 부트스트래핑) 만 잔존**
- 109건 `상위에서 삭제됨` 분류 (harness v3.6.0 자가 점검 결과) — 별도 라운드 처리 권고. `.claude/skills/capture-volt/SKILL.md` / `.claude/commands/volt.md` 보존 우선

#### Behavior Changes (CHANGELOG 소급 박제 자체)

None — 문서 보강만 (PATCH). 본 박제 자체는 코드/에이전트 행동 변화 없음. 미래 release 시점 박제 누락 방지.

## [0.12.0] — 2026-04-23

### P12-B 8D 카메라 dolly 애니메이션 (Display-Relative Scale Unification Phase B)

메인 이슈: #298 · ADR: [`docs/decisions/20260423-display-relative-scale-unification.md`](docs/decisions/20260423-display-relative-scale-unification.md) §3 (배선 원리) / §Phase 분리 / §Concrete Prediction

PR #304 (`208f5cb`) — Q8=8D 카메라 dolly 병행 interp + 입력 잠금. Phase A 의 Tier 엔진 기반 (v0.11.0) 위에 integration.

#### Behavior Changes

- **`runTierTransition` 신규 — scene scale 즉시 setAll + `camera.radius` 300ms ExponentialEase interp 병행** (`packages/core/src/scene/tier-transition.ts`) — apparent size 불변 수식 `radius_new = radius_old / ratio` (`ratio = renderScale_new / renderScale_old`) 로 focus body 화면 크기 유지. tier 전환 시 `scene.detachControl()` + `onAnimationEnd` / `setTimeout(lockMs=500)` 이중 해제. Pending tween 취소 (`scene.getAnimatableByTarget(camera).stop()`) + `document.visibilitychange` 핸들러 (idempotent attachControl)
- **`setTier` 가 `runTierTransition` 호출로 전환** (`packages/core/src/scene/solar-system-scene.ts:436`) — 기존 `scaling.setAll` 즉시 반영은 유지하되 camera dolly 병행 추가. `isArcRotateCamera` 런타임 타입 가드
- **`focusOn` JSDoc 에 Phase B tier 연계 맥락 박제** (`packages/core/src/scene/camera-controller.ts:44`) — user-trigger focus 경로 (`desiredRadius = meshRadius*5`) 는 유지. tier 전환 시 radius 재계산 경로는 `runTierTransition` 위임
- **카메라 `minZ` 재조정** — tier 전환 전 `cam.minZ = radius_new * 0.01` 적용. `radius_new < minZ` clamp 충돌 방어 (V5 달성 센서)

#### DoD 실측 (P12-B Phase B)

| DoD                                      | 실측                                                                | 상태 |
| ---------------------------------------- | ------------------------------------------------------------------- | ---- |
| V5 T3 Body 지구 세로 40% ±5% (304~336px) | **322px**                                                           | PASS |
| A1 focus 중심 편차 ≤10px                 | **0.0px**                                                           | PASS |
| C1 apparent size 변동 ≤5%                | 수식 단위 테스트 (`tier-transition.test.ts` 11건, `1e-12` 상대오차) | PASS |
| C2 fps<30 프레임 ≤2                      | canvas 비검정 + console.error 0 (Level 1)                           | PASS |
| C3 전환 ≤500ms                           | QA 독립 재측정 lock 373.5ms / click→reattach 506ms                  | PASS |
| C4 입력 잠금 + 100ms 내 재활성           | detachControl during=false / attachControl after=true (Level 2)     | PASS |

위험 3건 해소: pending tween 연쇄 (getAnimatableByTarget.stop 구현) / 탭 비활성 영구 잠금 (visibilitychange + fallback timer 이중 방어) / minZ clamp (`radius_new * 0.01` 재조정).

### P12-C Display-Relative Scale Unification 완결 (Phase C)

메인 이슈: #298 (auto-close) / #288 (auto-close) · ADR Amendment: [`docs/decisions/20260423-display-relative-scale-unification.md`](docs/decisions/20260423-display-relative-scale-unification.md) §Amendment / [`docs/decisions/20260422-floating-origin.md`](docs/decisions/20260422-floating-origin.md) §Amendment · 회고: [`docs/retrospectives/p12-retrospective.md`](docs/retrospectives/p12-retrospective.md)

### Behavior Changes

#### UI 제거 — 단일 모드 전환 완결 (R1/R2/R5)

- **`ViewModeSwitcher` / `ScaleBadge` / `OnboardingTooltip` / `ScientificModeNotice` 4종 UI 컴포넌트 제거** — `apps/web/src/components/layout/` 에서 파일 + 테스트 총 8건 삭제. `app-shell.tsx` 의 import / render 참조 제거. 단일 모드 채택으로 "과장 모드 토글" UX 폐기
- **`sim-store.viewMode` 필드 + `setViewMode` action + `ViewMode` 타입 제거** — Zustand store 의 뷰 모드 축 완전 소멸. `useSimStore` 소비자 코드 (`sim-canvas.tsx` / `about-modal.tsx` 등) 에서 viewMode 구독 제거
- **URL `?view=scientific|educational` 파라미터 폐기 (backward-ignore)** — `url-sync.tsx` 에서 `?view=` 경로 제거. 기존 북마크는 파라미터를 조용히 무시하고 단일 모드로 자연 진입 (에러 없음, CRITICAL UX 방어)
- **`html[data-view-mode]` 어트리뷰트 제거** — `apps/web/app/[locale]/layout.tsx` 에서 `data-view-mode="educational"` 제거. CSS / E2E selector 에서 `data-view-mode` 참조 없음 확인
- **`SolarSystemSceneHandles.setViewMode` API 제거** — `packages/core/src/scene/solar-system-scene.ts` 에서 backward-compat 유지하던 deprecated API 완전 소멸. 호출 경로 (`sim-canvas.tsx`) 동반 제거
- **`AboutModal` 단일 모드 컨텍스트 재작성** — 과장 배수 요약 테이블 섹션 제거, "스케일 정책" 섹션 (IAU 실측 고정 + 3단 tier 자동 전환) 추가
- **R1 회귀 가드 CI 통합** — `scripts/verify-no-scientific-grep.mjs` 신규. `packages/` + `apps/` 범위 활성 코드 라인에서 `scientific` 식별자 / 리터럴 재도입 시 exit 1. 주석(역사 맥락) 은 허용. CI `detect-and-test` 에 `R1 회귀 가드` step 추가

#### Reviewer 이관 하드닝 (M1 / m1 / m3)

- **M1 — `setTier` 가 `runTierTransition` cleanup 클로저 저장** (`solar-system-scene.ts`) — 연쇄 전환 race 방지. `pendingTierCleanup` 변수에 이전 cleanup 보관, 다음 전환 진입 시 `pendingTierCleanup?.()` 선행 호출. `tier-transition.test.ts` 에 "연쇄 전환 cleanup 호출" 단위 테스트 3건 추가 (정상 / idempotent / 버그 재현 대조)
- **m1 — visibilitychange JSDoc 문구 완화** (`tier-transition.ts:230-240`) — "fallback timer 와 이중 방어 (defense-in-depth). 둘 중 먼저 도달한 쪽이 release" 로 재작성. 구현-주석 drift 지표로서 정확도 ↑
- **m3 — `TIER_TRANSITION_EASE` module-level const hoisting** (`tier-transition.ts`) — `camera-controller.ts:#easing` 생성자 1회 생성 패턴과 일관성. `ExponentialEase` 는 stateless 하여 공유 안전

#### QA suggestion #1 — C3 측정 방식 교체

- **`scripts/browser-verify-tier-transition.mjs` C3 측정 교체** — 기존 "radius 5프레임 <1% stable" 감지 (ExponentialEase tail + polling IPC 오버헤드 포함) 를 `_alreadyAttached` 폴링 기반 click→reattach 직접 측정 (10ms 폴링, 1500ms 예산) 으로 교체. THRESHOLD 600ms (durationMs=300 + lockMs=500 마진 + 100ms 측정 오차 버퍼). 기존 radius 안정화 기준은 WARN 레벨 부수 지표로 병기

#### 문서 Amendment (D1 / D2 / D3 / D4)

- **D1** — ADR `20260423-display-relative-scale-unification.md` §Amendment 2026-04-23 박제 — Phase A/B/C 실측 결과 + §Concrete Prediction 재현 결과 (3/4 PASS, #3 은 P11-B 시점으로 이월) + Q10 Floating Origin 확정 (간소화 유지, 제거 아님) + QA/Reviewer/developer 이관 항목 처리 결과
- **D1-b** — ADR `20260422-floating-origin.md` §Amendments 1줄 추가 — "P12 에서 역할 축소. T3 body tier primary, T1/T2 no-op"
- **D2** — `docs/principles/fact-first.md` §Amendments 2026-04-23 박제 — 단일 모드 전환으로 `educational`/`scientific` 이중 모드 폐기, §예외 3건은 모든 tier 에 항시 적용, 과장 해제는 billboard marker overlay (P11-B) 로 이관. §"`scientific` 모드 UX 보호" 섹션은 역사 맥락 보존 용으로 유지
- **D3** — `docs/phases/roadmap-v2-solar-precision.md` renumber — P12 Display-Relative Scale Unification (완료) / P13 Texture Pipeline (원 P12) / P14 토성계 (원 P13) / P15 천왕성·해왕성계 (원 P14) / P16 소행성대+카이퍼대 (원 P15) / P17 배포+기술부채 청산 (원 P16). 이력 문서 (`p10-plan.md` / `p10-retrospective.md` / 과거 commit message) 는 retrofit 금지 (당시 판정 맥락 보존)
- **D4** — ADR §Concrete Prediction 재현 결과 표 박제 (ADR §Amendment (b) 에 포함)

#### 회고 문서

- **`docs/retrospectives/p12-retrospective.md`** 신규 — CLAUDE.md 마일스톤 회고 루틴 4섹션 (달성도 / 잘된 것 / 어려웠던 것 / 다음 인수인계). Phase A/B/C 통합 회고 + 후속 이슈 3건 (#305/#306/#307) 경로 박제

### 후속 이슈 (Phase C 에서 분리)

- **#305** — P11-B followup `lowerRadiusLimit` 원복 누락 재검토 (Reviewer m2)
- **#306** — P12 followup `FOCUS_RADIUS_MULTIPLIER` viewport/fov 동적화 (developer suggestion #1)
- **#307** — P12 followup browser-verify focus 버튼 확장 + minZ clamp 작은 body 재검증 + fps HUD 직접 측정 (QA suggestion #2/#3)

### DoD 실측 (P12-C Phase C)

| DoD                             | 상태  | 증거                                                                              |
| ------------------------------- | ----- | --------------------------------------------------------------------------------- |
| R1 `scientific` 활성 코드 hit 0 | PASS  | `node scripts/verify-no-scientific-grep.mjs` — 157 파일 스캔 0 건                 |
| R2 UI 4종 제거                  | PASS  | `rg 'ViewModeSwitcher\|ScaleBadge\|OnboardingTooltip\|ScientificModeNotice'` 0 건 |
| R5 fact-first §Amendment        | PASS  | `docs/principles/fact-first.md` §Amendments 2026-04-23 entry                      |
| M1 연쇄 전환 cleanup            | PASS  | `tier-transition.test.ts` 신규 describe 3건 PASS                                  |
| D1/D2/D3/D4 박제                | PASS  | 각 문서 §Amendment 섹션 박제                                                      |
| 회고                            | PASS  | `docs/retrospectives/p12-retrospective.md` 4섹션                                  |
| typecheck                       | PASS  | `pnpm -r typecheck` 0 errors                                                      |
| 테스트                          | PASS  | `pnpm -r test` 328 tests (core 226 + web 97 + shared 4 + physics 1)               |
| 빌드                            | PASS  | `pnpm build` Next.js 16.2.3 성공                                                  |
| 한글 U+FFFD                     | CLEAN | `pnpm check-encoding` 0 건                                                        |

### auto-close 대상

- **#298** P12 Display-Relative Scale Unification (Phase A/B/C 통합 완결)
- **#288** P11-A Floating Origin (scientific 모드 jitter 해소 목표가 단일 모드 전환으로 근본 원인 소멸)

## [0.11.0] — 2026-04-23

### P11-A Floating Origin + P12-A Tier 엔진 기반 (Display-Relative Scale Unification Phase A)

메인 이슈: #288 (P11-A Floating Origin) / #298 (P12 Scale Unification 계약) · ADR: [`docs/decisions/20260422-floating-origin.md`](docs/decisions/20260422-floating-origin.md) / [`docs/decisions/20260423-display-relative-scale-unification.md`](docs/decisions/20260423-display-relative-scale-unification.md) · 원칙: [`docs/principles/fact-first.md`](docs/principles/fact-first.md)

4 PR 누적 (P11-A + bench remeasure + P12 ADR + P12-A Phase A):

- **PR #291 (P11-A Floating Origin)** — scientific 모드 float32 jitter 해소. camera origin 동적 shift (focus body primary + free-fly 1 AU threshold safety net). Zustand / Rust engine / worldPositions 는 heliocentric 절대 m 유지 (ADR §3 주석 계약). `__floatingOrigin` / `__solarScene.floatingOrigin` 전역 dev 노출. 관련 이슈 #271 closed. 후속 #294 (non-focus fps 30~40% 회귀) / #295 / #296 / #297 분리
- **PR #293 (bench baseline 재측정)** — GH Actions ubuntu × 10 회 median 으로 `docs/benchmarks/baseline.json` 갱신. `bench-baseline-remeasure` workflow dispatch 구조. #225 closed
- **PR #300 (P12 ADR 박제)** — Display-Relative Scale Unification 결정 매트릭스 + 5축 후보 비교 + Concrete Prediction 4건 + Q10 float32 정밀도 수식 + Phase 분리 판정 + 재검토 조건 10건. PM 3 라운드 Q&A 수렴 (명확도 52 → 5/5) + Gemini 교차검증 적용
- **PR #301 (P12-A Tier 엔진)** — `tier.ts` 신규 (182 LoC, Solar/Inner/Body 3단) + `SCENE_UNIT_PER_METER` 동적화 + kind 차등 (`visual-scale.ts`) 폐기. rings/asteroid-belt tier 비율 전파 (host.scaling + per-call 주입). ScaleBadge 거짓 UI 제거 (문구 "실측 비율 1.0" 재정의)

### Behavior Changes

#### P11-A Floating Origin (#291)

- **scientific 모드 jitter 해소** — 목성/해왕성 focus 상태 카메라 pan 시 픽셀 양자화 제거. body 중심이 scene 원점 근처에서 렌더되어 float32 유효숫자 손실 없음
- **Floating Origin primary follow** — focus body 는 매 프레임 scene 원점 근처 (local 좌표 ≤ 1e5 m) 유지. 단, Zustand / Rust engine state 는 Heliocentric 절대값 유지 (정보 패널 거리 표시 변함 없음)
- **safety net 1 AU threshold** — free-fly 탐색 중 카메라 1 AU 이상 이동 시 origin shift. focus 상태에서는 primary 가 우선
- **`SolarSystemSceneHandles` API 확장** — `floatingOrigin` + `setFocusOrigin(bodyId)` 2 field 추가
- **`FloatingOrigin` API 확장** — `setOriginToBody(world)` + `onOriginShift(listener)` 2 메서드 추가 (기존 `update` / `toLocal` / `toWorld` 변경 없음)

#### P12-A Display-Relative Scale Unification 기반 (#301)

- **body 시각 과장 완전 제거** — `educational` 모드의 per-body scale 팽창 (planet ×500, moon ×500, dwarf-planet ×2000, comet ×20000) 폐기. tier 별 실측 `renderScale` 만 적용 — 멀리서 보면 body 가 작아 보일 수 있다 (P11-B billboard marker 도입 전까지 sub-pixel 가능)
- **3단 tier 도입** — `solar` (해왕성 궤도 수용) / `inner` (화성 궤도 수용) / `body` (focus body 중심). 각 tier 별 `renderScaleForTier(tier)` 로 mesh.position / orbit line / sun light 에 동일 배수 적용. kind 별 차등 없음
- **하이브리드 tier 트리거** — focus 있으면 focus body kind 기반 자동 tier, free-fly 시 카메라-원점 거리 stateless 재계산. 히스테리시스 ±15% 로 경계 왕복 방지
- **교차 tier 전환 시 즉시 점프 flicker** — Phase A 는 애니메이션 없음. Phase B (Q8=8D scale + camera.radius 병행 300ms interp) 에서 해소 예정
- **`scene.solar.clearFocus()` / `setTier` / `updateTierByCamera` / `getTier` 공개 API 신설**
- **`setViewMode('scientific'|'educational')` backward-compat 유지** — 렌더 결과에 영향 없음. Phase C 에서 API 제거 예정
- **`ScaleBadge` 문구 재정의** — 기존 "×N 과장 중" → "실측 비율 1.0". Phase A 에서 과장 실제 제거됐으므로 거짓 UI 차단 (dead reference 정리)
- **`SCENE_UNIT_PER_METER = 1/AU` 하드코딩 제거** — 3파일 (`asteroid-belt.ts` / `ring-placeholder.ts` / `ring-shader.ts`) 의 상수 선언 제거, tier 함수 경유로 전환
- **회귀 가드 신규** — `tier-proportion.test.ts` (5건, 비율 불변식) + `scale-badge.test.tsx` (과장/× 재등장 차단 다층)

#### 벤치 baseline 재측정 (#293)

- `docs/benchmarks/baseline.json` 환경 `gh-actions-ubuntu-chromium-headless` 기준 N=10 median 으로 갱신. 이후 CI bench 게이트의 회귀 기준점

### DoD 실측 (P12-A Phase A)

| DoD      | 상태                                       | 증거                                                                 |
| -------- | ------------------------------------------ | -------------------------------------------------------------------- |
| V1/V3    | PASS                                       | browser-verify 해왕성 189/380px, 화성 9/384px                        |
| V5       | WARN → Phase B 이관 (사용자 승인 재조정)   | 지구 2198px / 목표 320±5% — Phase B dolly 에서 해소                  |
| V2/V4/V6 | DEFERRED → P11-B billboard marker (Q-C=C3) | —                                                                    |
| A2/A3    | PASS                                       | tier.test.ts 6건 + tier-lookat.test.ts 4건                           |
| R3/R4/R6 | PASS                                       | visual-scale.ts 폐기 + SCENE_UNIT_PER_METER 0 + engine boundary test |
| 테스트   | 343 PASS / 0 FAIL                          | `pnpm -r test`                                                       |

### 알려진 제한

- **교차 tier 전환 flicker** — Phase A 는 즉시 점프 (ADR 에 사전 합의된 degrade). Phase B (v0.12 예정) 에서 scale+radius 병행 interp 로 해소
- **V5 지구 세로 40% DoD 미충족** — Phase A 는 scale 만 교체 + 카메라 radius 불변 → focus body 과도 확대 (2198px). Phase B 에서 hard fail 승격 예정
- **V2/V4/V6 최소 pixel floor 미구현** — P11-B billboard marker 합산 측정 이관 (Q-C=C3)
- **P11-A non-focus fps 30~40% 회귀** (#294) — Floating Origin 배선 overhead 조사 중
- **scale-badge 존재 유지** — Phase C 에서 완전 제거 예정 (view-mode-switcher / onboarding-tooltip / scientific-mode-notice 포함)
- **Floating Origin 존속 여부 재검토 필요** — Q10. T1/T2 tier 는 float32 정밀도 충분 예측 (ADR §4 수식) → 재설계 완료 시 T1/T2 simplify 후보. T3 primary 는 유지

### 신규 이슈 (v0.11.0 중 분리 / 후속)

- **#288** P11-A Floating Origin (open, Phase C 완료 후 재검토)
- **#294** P11-A non-focus fps 30~40% 회귀 — 배선 overhead 조사
- **#295** browser-verify originOffset assert 범위 완화
- **#296** #271 canvas readback 대체 지표 — headless swiftshader false negative 방어
- **#297** `bench:baseline-remeasure` 로컬 smoke 스크립트
- **#298** P12 Display-Relative Scale Unification (open, Phase B/C 진행 예정)
- **#299** Tier 전환 시 ARIA Live Region 알림 (P12 후속, priority:low)

### 하네스 업데이트

v2.28.1 유지. v0.11.0 범위에서 하네스 수정 없음.

### 다음 마일스톤 (로드맵 v2)

- **v0.12.0 예정 (P12-B)** — Q8=8D scale + camera.radius 병행 300ms interp + 카메라 입력 500ms 잠금. C1/C2/C3/C4 연속성 DoD + V5 hard fail 승격
- **v0.13.0 예정 (P12-C)** — UI 컴포넌트 완전 제거 (ViewModeSwitcher / ScaleBadge / OnboardingTooltip / ScientificModeNotice) + `sim-store.viewMode` 필드 제거 + `fact-first.md` §예외 Amendment + `roadmap-v2-solar-precision.md` renumber (P12~P17 +1) + P11-A Floating Origin T1/T2 simplify (Q10 실측 확정 후)

## [0.10.0] — 2026-04-21

### P10 — Fact-First 원칙 + 데이터 감사 + 사실 모드 UI

메인 이슈: #266 (계약) / #268 (P10-A) / #274 (P10-B) / #278 (P10-C) · 회고: [`docs/retrospectives/p10-retrospective.md`](docs/retrospectives/p10-retrospective.md) · 원칙: [`docs/principles/fact-first.md`](docs/principles/fact-first.md) · 플랜: [`docs/phases/p10-plan.md`](docs/phases/p10-plan.md)

10 PR 분할 릴리스 (CLAUDE.md §Phase 분리 릴리스 리듬):

- **PR #269 + #273 (P10-A 원칙 박제 + Gemini 교차검증)** — `docs/principles/fact-first.md` 박제 + 로드맵 v2 (`roadmap-v2-solar-precision.md`) 재작성 + 모바일 보류 ADR + CLAUDE.md 참조. 2차 Gemini 교차검증 6건 즉시 반영 + 4건 이견 수용 + 1건 분리 (#271)
- **PR #275 + #276 + #277 (P10-B 데이터 감사)** — 타입 확장 (dataSource/lastVerified/colorSource/uncertainty) + IAU 2015 전수 대조 테이블 + 감사 방법론 박제 + `solar-system.json` 9건 수정 + 24 bodies 감사 필드 채움 + CI `verify-and-rust` 에 `verify:iau-data` 회귀 게이트 통합 (0 errors 필수). #274 closed
- **PR #279 + #280 + #281 (P10-C 사실 모드 UI)** — viewMode store (educational/scientific) + URL `?view=` sync + 키보드 `m` + ViewModeSwitcher + scientific 모드 실제 과장 해제 (scaling 500→1) + ScaleBadge + OnboardingTooltip + ScientificModeNotice + AboutModal (IAU/NASA/JPL 크레딧) + info panel 감사 필드 노출. #278 closed
- **PR #283 + #284 (P10-D 정확도 이슈)** — Galilean 4체 JPL Horizons API 재쿼리 (J2000 ecliptic, φ₀=179.69°) + Newton state vector 직접 추출 (forward-diff 폐기, timeScale 내성) + observedFps ref 수정. #261·#263 closed. D5-b amp≤2° 는 tidal force 미모델링으로 #282 scope 재조정 (P11+)
- **PR #285 (P10 회고)** — docs/retrospectives/p10-retrospective.md + 플랜 업데이트 + 벤치 실측 보고

### Behavior Changes

#### 데이터 — IAU 2015 ±0.01% 공차 준수 (P10-B)

- **`packages/shared/data/solar-system.json` 9건 수정** — radius 규약을 IAU equatorial nominal 로 통일 (near-spherical body). jupiter 6.9911e7 → 7.1492e7 (+2.26%), saturn 5.8232e7 → 6.0268e7 (+3.50%), uranus 2.5362e7 → 2.5559e7, neptune 2.4622e7 → 2.4764e7, mars 3.3895e6 → 3.3962e6, phobos 1.1267e4 → 1.108e4, deimos 6.2e3 → 6.27e3, neptune mass 1.0243e26 → 1.02413e26, jupiter mass 1.8982e27 → 1.89813e27. irregular body (Phobos/Deimos/Haumea/3 혜성) 에 `uncertainty` 필수
- **`packages/shared/data/solar-system.json` 24 bodies 감사 필드 자동 추가** — `dataSource` / `lastVerified: "2026-04-21"` / `colorSource` (observed 17 / artistic 4 / inferred 2) + 8 irregular body 에 `uncertainty.{mass, radius}` 상대 오차 박제
- **Galilean 4체 궤도 요소 JPL Horizons API 재쿼리** — frame 을 Laplace plane → J2000 ecliptic 으로 통일. Io/Europa/Ganymede/Callisto 의 λ/ϖ/Ω/e/i/a 전체 2026-01-01 00:00 TDB 값으로 교체. Laplace 공명 인자 φ₀ = 179.6929° (평형점 180° ± 0.31°) 달성
- **`packages/shared/src/constants/solar-system.ts` legacy 상수 2건 IAU 정합화** — SOLAR_MASS 1.98847e30 → 1.98892e30 (IAU B3 §1), JUPITER_RADIUS 6.9911e7 → 7.1492e7 (equatorial)

#### 렌더링 — scientific 모드 실제 과장 해제 (P10-C)

- **scientific 모드에서 `solar-system-scene` per-body scaling 1.0 강제** — IAU 실측 비율 렌더. 기본 educational 모드는 기존 거리-의존 과장 (MAX*VISUAL_SCALE*\*) 유지
- **헤더 우측 `ViewModeSwitcher` 2-버튼 토글** — `data-testid="view-mode-switcher"`, data-mode + `data-view-mode` DOM 어트리뷰트 동기화, 키보드 `m` 단축키 (input/modifier 가드)
- **URL `?view=scientific|educational` 양방향 sync** — nuqs parseAsStringEnum, 디폴트 educational 은 URL 생략. 기존 `?mode=observe|research` 와 key 분리 (계약 재조정, CRITICAL #6 §7)
- **ScaleBadge** 헤더 표시 — focused body kind 별 상한 (`태양 — 시각 크기 최대 ×20 과장 중`) / scientific 모드 (`지구 — 실제 비율 1.0`) / focus 없음 (`시각 과장 모드` / `사실 비율 모드`)
- **OnboardingTooltip** 첫 진입 CTA — "시각 크기 과장 중. [실제 비율로 보기]". localStorage `astro:onboarding-dismissed` 영속 dismiss. scientific 진입 시 자동 skip
- **ScientificModeNotice** `?view=scientific` 최초 진입 시 빈 화면 이탈 방지 배너 — localStorage `astro:scientific-notice-dismissed` 영속
- **AboutModal** 헤더 `?` 버튼 — IAU 2015 / NASA Fact Sheet / NASA JPL / Standish-Williams (1992) 4개 출처 attribution 링크 + 라이선스 + 현재 viewMode 별 정책 안내 + 공차 ±0.01% 명시. Esc / 닫기 / 외부 클릭 닫기
- **CelestialInfoPanel 감사 필드 섹션** — `dataSource` / `lastVerified` / `colorSource` (관측/아티스트/추론) 표시. mass/radius 옆 `uncertainty` ±% 컬럼 (irregular body 한정)

#### 역학 정확도 (P10-D)

- **Galilean 초기 Laplace 인자 φ₀ 평형점 실증** — `test_laplace_initial_phase_equilibrium` (빠른 경로, Rust) 로 179.69° 검증. 기존 218° circulation 상태 해소. 단, 100 Io 주기 적분 후 libration 은 tidal force 미모델링으로 재현 불가 → #282 로 이관
- **Osculating 1Hz polling timeScale 내성화** — `SolarSystemSceneHandles.getBodyState(id, parentId)` 신규 API 로 Newton 엔진 state vector 직접 추출. forward-diff 폐기 → timeScale=86400 기본값에서도 `sat-dynamic-{io/europa/ganymede/callisto}` 배지 4/4 렌더 (browser-verify 16/16 실증)
- **observedFps 의존성 배열 버그 수정** — ADR §Amendments 2026-04-20 박제 버그 완결. `useEffect([..., observedFps])` 가 fps raf 매 frame setState 로 재실행 유발하던 것을 `observedFpsRef` 로 해소

#### CI 회귀 가드 신설

- **`verify:iau-data` CI step** (`ci-physics-wasm.yml::verify-and-rust`) — IAU 2015 ±0.01% 공차 초과 / 감사 필드 (dataSource/lastVerified/colorSource) 부재 시 exit 1 로 PR 머지 차단. 의도적 실패 주입 실증 완료

### DoD 실측

| Sub                | 원 DoD | 달성 | 이관/미달                         |
| ------------------ | ------ | ---- | --------------------------------- |
| P10-A 원칙 박제    | 8      | 8/8  | —                                 |
| P10-B 데이터 감사  | 8      | 8/8  | —                                 |
| P10-C 사실 모드 UI | 8      | 8/8  | —                                 |
| P10-D 정확도 이슈  | 3      | 2/3  | #255 → P13 (J2/J4)                |
| P10-D.5 벤치 회귀  | 3      | 부분 | 환경 mismatch (CI remeasure 필요) |

**30 DoD 중 28 달성 (93%)**.

### 알려진 제한

- **Laplace 공명 libration 재현 불가** — 순수 Newton 다체는 tidal force 미모델링. 실 천체의 조석 에너지 소산 + 공명 barrier 부재로 시뮬은 circulation 으로 발산. 데이터 정확성은 확보 (φ₀ = 179.69° 박제). 후속 #282 (P11+)
- **목성 J2/J4 편평도 세차 미반영** — 현 공차 ±1% 에서는 오차 미검출. #255 P13 (궤도 정밀 보정) 이관
- **scale-badge MAX_SCALE_BY_KIND 인라인 미러링** — core scene import 가 SSR prerender 에서 wasm 로드 시도로 실패. ssr-safe 경로 분리는 후속 이슈
- **로컬 vs CI 벤치 환경 mismatch** — 로컬 macOS headless 측정은 "상대 변화" 관찰용 한정. 공식 회귀 판단은 CI `bench-baseline-remeasure` dispatch 로 ubuntu 재측정 후 확정

### 신규 이슈 (P11+ 후속)

- **#282** tidal force Laplace libration — D5-b amp ≤ 2° 달성 경로
- **#271** float32 jitter (P11 Floating Origin 블로커)
- **#272** iOS 플래그십 모바일 재도전 트리거

### 하네스 업데이트

v2.28.1 (현재) 유지. P10 범위에서 하네스 수정 없음.

## [0.9.0] — 2026-04-20

### P9 — 목성계 (Galilean + Laplace 공명 + 고리 3층 + Osculating 동기화)

메인 이슈: #254 · ADR: [`docs/decisions/20260420-p9-galilean-laplace-rings.md`](docs/decisions/20260420-p9-galilean-laplace-rings.md) · 회고: [`docs/retrospectives/p9-retrospective.md`](docs/retrospectives/p9-retrospective.md)

4 PR 분할 릴리스 (CLAUDE.md §Phase 분리 릴리스 리듬 적용):

- **PR #258 (PR-1 인프라 + Galilean JSON + 고리 placeholder)** — `solar-system.json` 에 Galilean 4체(Io/Europa/Ganymede/Callisto) + Jupiter.rings 3층(Halo/Main/Gossamer) JSON 신설 + zod 스키마 `RingLayerRawSchema` 확장 + `ring-placeholder.ts` 단색 3층 disk
- **PR #260 (PR-2 Rust satellites + M4 장기 테스트 분리)** — `packages/physics-wasm/src/satellites/{laplace,osculating}.rs` 신규 모듈 + 단위테스트 5건 (D1~D4 주기 + D5-a 잔차 + Osculating 왕복) + `extract_osculating_elements` WASM bindgen export + **M4**: 장기 적분 테스트 6건 `#[ignore]` 분리 + CI workflow 빠른/장기 경로 독립 job
- **PR #262 (PR-2.5 고리 shader 3층 + M1 백업)** — `ring-shader.ts` fragment shader 방사밀도 3구간 + `createRingShaderMaterial`/`createRingShaderMesh` 신규 + 수동 플래그 `?ring=fallback`/`?ring=placeholder` + 실 Chrome 3 시나리오 수동 검증 통과 + M1 백업 (SPS 자동 전환)
- **PR-3 (본 PR) TS 통합 + UI + 회고 + v0.9.0** — `use-osculating-sync.ts` 훅 + `satellite-info-panel.tsx` (D8) + `?mass=jupiter×N` URL 핸들러 + ADR §Amendments 3건 + 회고 + 버전 bump

### Behavior Changes

- **sim-canvas 에 목성계 위성 4체 (Io/Europa/Ganymede/Callisto) 자동 렌더** — `?mode=research&focus=jupiter` 에서 목성 주위 Galilean 위성이 JSON 기반 Kepler 해석 요소로 표시. CelestialTree 사이드패널에 `tree-io` / `tree-europa` / `tree-ganymede` / `tree-callisto` 버튼 자동 노출
- **목성 고리 3층 shader 렌더** — Halo (92k~122.5k km) / Main (122.5k~129k km) / Gossamer (129k~226k km) 각 반경별 fragment shader 방사밀도 표현. `?ring=fallback` 으로 InstancedMesh/SPS 전환, `?ring=placeholder` 로 PR-1 단색 disk 복귀 가능
- **Galilean 이심률·경사 UI 패널 (D8)** — `SatelliteInfoPanel` 에 4체 `e` / `i` 값 표시 (`solar-system.json` 바인딩, 하드코딩 금지). `singularity===1` 시 "원순환 근사" 배지
- **Osculating 1Hz polling 훅 인프라** — `use-osculating-sync.ts` 훅 + fps 자동 폴백 (1Hz → 2Hz → 5Hz → 10Hz, 히스테리시스 +5fps). WASM `extract_osculating_elements` wiring 완결. 단 기본 `timeScale=86400` 조건에서 forward-diff velocity noise 로 UI 배지 미렌더 — [#263](https://github.com/coseo12/astro-simulator/issues/263) 이관
- **`?mass=jupiter×N` URL 파라미터 동적 질량** — Newton 엔진 경로에서 씬 물리에 반영 (Io-Jupiter 거리 감소 실측 확인). Osculating UI 반영은 #263 완료 시점까지 정적 JSON 값 표시
- **DoD 물리 검증 CI 가드 6건 추가** — `cargo test` 에 `test_io_period_1pct` / `test_europa_period_1pct` / `test_ganymede_period_1pct` / `test_callisto_period_1pct` / `test_laplace_resonance_residual_1pct` / `test_osculating_roundtrip` 상시 게이트. D5-b (위상 진폭 ±2°) 는 `#[ignore]` + follow-up [#261](https://github.com/coseo12/astro-simulator/issues/261) 이관
- **M4 장기 테스트 분리** — `mercury/yoshida_*_perihelion_*`, `earth/venus_perihelion_eih_*` 6건에 `#[ignore = "long-integration; run with --include-ignored in CI"]` 어트리뷰트. 일상 `cargo test --lib` 경로 완주 시간 **30분+ → 9.27s (≈ 200× 단축)**. CI 장기 경로는 `cargo test --release --lib -- --include-ignored` 독립 job (`continue-on-error: true`)
- **sub-agent 이탈의 프로세스 레벨 확장 교훈** (CLAUDE.md §프로젝트 고유 보강 교훈 추가, [#259](https://github.com/coseo12/astro-simulator/pull/259)) — sub-agent 가 `run_in_background` 로 띄운 프로세스 정리 누락 시 cargo target 디렉토리 경쟁으로 교착 발생. 메인 오케스트레이터 루틴 (`pgrep -f "cargo|next dev|physics_wasm-"` 독립 확인) + sub-agent 마무리 체크리스트 `spawned_bg_pids` 필드 규범화. [volt #52](https://github.com/coseo12/volt/issues/52) 박제

### DoD 실측 (ADR 대비 여유율)

| DoD                        | 계약          | 실측                             | 여유율     |
| -------------------------- | ------------- | -------------------------------- | ---------- |
| D1 Io 공전주기             | ±1%           | PASS                             | —          |
| D2 Europa 공전주기         | ±1%           | PASS                             | —          |
| D3 Ganymede 공전주기       | ±1%           | PASS                             | —          |
| D4 Callisto 공전주기       | ±1%           | PASS                             | —          |
| D5-a Laplace 잔차          | ±1%           | **0.00024**                      | 41×        |
| D5-b 위상 진폭             | ±2°           | **이관 (#261 데이터 교정)**      | —          |
| D6 고리 3층 shader         | 가시          | PASS (실 Chrome 6 스크린샷)      | —          |
| D7 Osculating 동기화       | 1Hz polling   | **인프라 완결 / UI 이관 (#263)** | —          |
| D8 이심률·경사 UI          | JSON 바인딩   | PASS                             | —          |
| M4 cargo fast path         | ≤5분          | **9.27s**                        | **32×**    |
| cargo include-ignored path | 독립 job 분리 | **216.9s**                       | CI 병렬 OK |
| fps baseline (실 Chrome)   | ≥55fps        | **평균 59.98 / 최소 59.75**      | 60fps 유지 |

### 알려진 제한 (스프린트 계약 재조정 박제, CLAUDE.md §7 세 위치 완결)

- **D5-b 위상 진폭 ±2°** — `measure_laplace_resonance()` 측정 도구 정상이나 PR-1 에서 박제한 JPL Galilean 초기 조건의 Laplace 인자 φ₀ = 218° (이론 평형점 180° 대비 38° 벗어남) → circulation 상태로 libration 재현 불가. 측정법 검증 우선 원칙 (CLAUDE.md §스프린트 계약 10) 충실 수행 후 데이터 교정 분리. 해결은 `solar-system.json` Galilean 4체 `meanLongitudeDeg` JPL Horizons 재쿼리 → [#261](https://github.com/coseo12/astro-simulator/issues/261) 이관
- **D7 Osculating UI 동적 표시** — 훅 인프라 완결 / `?mass=jupiter×N` 씬 물리 반영 정상이나 `timeScale=86400` 기본값에서 forward-diff velocity noise 과다로 UI 배지 미렌더. 해결은 Babylon 씬 저장 velocity state vector 직접 추출 (forward-diff 폐기) → [#263](https://github.com/coseo12/astro-simulator/issues/263) 이관. v0.9.0 은 정적 JSON 값 표시
- **Osculating shader `onError` 비동기 폴백 미구현** — `ring-shader.ts` 는 동기 exception 경로만 M1 자동 전환. 비동기 `onError` 는 기록만 수행. 수동 `?ring=fallback` 은 정상. ADR §재검토 조건 #5 에 위임

### 후속 OPEN

- [#261](https://github.com/coseo12/astro-simulator/issues/261) (P9-followup, priority:medium) — Galilean 초기 조건 φ₀ = 218° → 180° 데이터 교정 + D5-b 재개
- [#263](https://github.com/coseo12/astro-simulator/issues/263) (P9-followup, priority:medium) — Osculating 속도 추정 timeScale 내성화 (forward-diff → 씬 state vector 직접 추출)
- [#245](https://github.com/coseo12/astro-simulator/issues/245) / [#246](https://github.com/coseo12/astro-simulator/issues/246) (P8-followup, priority:low) — 위성 줌 토글 / 클릭 정보 패널 인터랙션
- [#255](https://github.com/coseo12/astro-simulator/issues/255) (P9-followup, priority:medium) — 목성 J2/J4 편평도 세차
- [#256](https://github.com/coseo12/astro-simulator/issues/256) / [#257](https://github.com/coseo12/astro-simulator/issues/257) (P9-followup, priority:low) — 장기 적분 에너지 보존 DoD / 고리 shader 섀도우 매핑

## [0.8.0] — 2026-04-19

### P8 — 내행성계 위성 정밀화 (포보스·데이모스·달 교점역행)

메인 이슈: #244 · ADR: [`docs/decisions/20260419-satellite-orbit-hybrid.md`](docs/decisions/20260419-satellite-orbit-hybrid.md) · 회고: [`docs/retrospectives/p8-retrospective.md`](docs/retrospectives/p8-retrospective.md)

3 PR 분할 릴리스 (CLAUDE.md §Phase 분리 릴리스 리듬 적용):

- **PR #248 (PR-1 인프라 + #242 선행)** — `scripts/bench-scene.mjs` vsync 페그 해소 + `solar-system.json` 포보스/데이모스 2종 엔티티 추가 + `solar-system-loader.test.ts` 가드 + `time-reversal.test.ts` 9체 의도 보존 필터
- **PR #250 (PR-2 Rust 측정 헬퍼)** — `packages/physics-wasm/src/nbody.rs` `measure_moon_orbital_period` / `measure_node_regression_period` 헬퍼 2종 + 단위테스트 3건 (phobos/deimos/lunar_node). Gemini 교차검증 수용 (상대 좌표계 + Nyquist smoothing)
- **PR-3 (본 PR) TS 통합 + 회고 + v0.8.0 릴리스 준비** — ADR 예측대로 sim-canvas 코드 변경 0 라인 (기존 `parentId` + `updateAtKepler` 재사용). 회고 + CHANGELOG + 버전 bump.

### Behavior Changes

- **sim-canvas 에 화성 위성 2종 (포보스/데이모스) 자동 렌더** — `?mode=research` 에서 화성 주위 위성이 JSON 기반 Kepler 해석 요소로 표시. 렌더 코드 라인 추가 0 (기존 `parentId=mars` 체인 재사용). CelestialTree 사이드패널에 `tree-phobos` / `tree-deimos` 버튼 자동 노출, 클릭 시 focus 카메라 전환 동작 (실측 L2 PASS)
- **DoD 물리 검증 CI 가드 3건 추가** — `cargo test` 에 `test_phobos_period_1pct` / `test_deimos_period_1pct` / `test_lunar_node_regression_5pct` 상시 게이트. 측정 실패 시 릴리스 차단. WASM 런타임 번들 delta 0 bytes (`#[cfg(test)]` 격리)
- **9체 `time-reversal.test.ts` 명시 필터** — 포보스 주기 7.65h × dt=10min 의 per-step 1/45 period 누적 오차가 기존 1e-9 임계를 초과하여 화성 위성 명시 필터. 원 9체 대칭성 의도 보존. 위성 자체의 시간 역행 검증은 PR-2 `measure_moon_orbital_period` 로 대체
- **bench-scene vsync 페그 해소 (PR-1)** — `--disable-frame-rate-limit` + `--disable-gpu-vsync` 플래그. 머지 직후 baseline 재측정 자동 PR 생성. 기존 baseline 대비 양의 Δ 관찰 예상 (uncapped FPS)

### DoD 실측 (ADR 대비 여유율)

| DoD                   | 계약 | 실측        | 여유율 |
| --------------------- | ---- | ----------- | ------ |
| 포보스 공전주기       | ±1%  | **0.087%**  | 11.5×  |
| 데이모스 공전주기     | ±1%  | **0.032%**  | 31×    |
| 달 교점역행 주기      | ±5%  | **4.45%**   | 1.12×  |
| WASM 번들 delta       | +2KB | **0 bytes** | —      |
| cargo test 시간 delta | +45s | **+18s**    | 2.5×   |

### 후속 OPEN (priority:medium)

- #245 위성 줌 토글 (`?satellites=zoomed` 옵트인) — 위성이 실 스케일에서 서브픽셀, 탐색 UX 보강
- #246 위성 클릭 정보 패널 — celestial-info-panel 에 궤도 요소 표시
- #247 Osculating elements 동적 동기화 파이프라인 — 질량 변경 시 위성 무반응 (Gemini 교차검증 고유 발견, 정적 Kepler 한계). P9/P13 후보
- #251 bench-scene 다회 샘플링 + `stdev_ratio` 필드 (#242 DoD 일부 open 유지)

### 알려진 제한

- `?focus=<moon|phobos|deimos>` URL 직접 진입 시 카메라 focus 는 동작하나 CelestialTree 사이드패널 active 토글은 미연동. 기존 동작과 동일 (#246 클릭 정보 패널 범위). **PR-3 퇴행이 아님**.

## [0.7.1] — 2026-04-19

### Behavior Changes: None — 문서/인프라/정적 에러 해소만

P7-E 후속 follow-up 5건 중 4건 완결 + pre-existing 정적 에러 2건 해소.
앱 런타임 / 물리 식 / 기본 bench 동작 모두 불변.

**#224 #226 P7-E follow-up 문서·주석·회귀 가드** (PR #233)

- `docs/retrospectives/p7-retrospective.md`: `22개`/`21개` → 실측 15개 (편집 14 + utils 1) 정정
- `§어려웠던 것 #6 numeric accuracy` 신설 — "회고·PR 에 개수/비율 기재 시 실측 후 기재" 원칙 박제
- `apps/web/src/core/parse-gr-mode.test.ts` 사용자 실수 케이스 (on/true/gr/0/2/eih1pn/single1pn) 회귀 가드 +7 케이스
- `apps/web/src/store/sim-store.ts` `__simStore` `configurable:true` HMR 근거 + `defineProperty` 사용 이유 주석 박제
- `docs/decisions/README.md` §Amendments 표준 포맷 신설 (갱신 이력 테이블 컬럼 고정)
- `docs/decisions/20260418-p7-integrator-upgrade.md` Phase C 진단 + CI 임계 2건 §Amendments 소급 시범 적용

**#223 bench-p7-lens3d vsync 페그 해소 + DoD 재조정** (PR #234)

- 원인: headless chromium RAF 상한(120Hz vsync) 으로 측정값 stdev ≈ 0 (ray3d 연산 부하 미반영)
- `scripts/bench-p7-lens3d.mjs` launch args 에 `--disable-frame-rate-limit` + `--disable-gpu-vsync` 추가
- `pressTimePlay` import (`skipIfAbsent:true` — `?bh=2&ray3d=1` 기본 자동 재생 회귀 가드 목적)
- 리포트 JSON 에 `stdev_ratio = stdev/avg` 필드 신설 (GPU 속도 독립 지표)
- **DoD 재조정** (사용자 합의): `stdev_ms > 0.5ms` → `stdev_ratio > 1%` (M1 Pro Metal ~1200fps 에서 절대 stdev 원천 도달 불가)
- 3위치 박제: 이슈 #223 body / 스크립트 주석 / PR 본문
- 새 baseline: `docs/benchmarks/p7-lens3d-2026-04-19T04-03-10-225Z.json` (avg 0.920ms · stdev_ratio 2.61% · fps 1088)

**#225 baseline 재측정 workflow + median aggregator (설계 PR)** (PR #238)

- `.github/workflows/bench-baseline-remeasure.yml` 신설 — `workflow_dispatch` 수동 트리거, plan → bench (matrix N 병렬) → aggregate (median + PR 자동 생성) 3 job
- `scripts/bench-aggregate-median.mjs` (의존성 0, stand-alone) — 여러 회차 JSON 을 median 으로 집계
- `scripts/bench-aggregate-median.test.mjs` 회귀 가드 **8/8 PASS**
- `docs/benchmarks/README.md` 재측정 절차 문서화
- 도구 도입만 — 실제 baseline 갱신은 본 릴리스 후 사용자 수동 트리거 → 자동 PR

**#236 #237 pre-existing typecheck/lint 해소** (PR #239)

- `packages/core/src/gpu/nbody-force-shader.test.ts`: `noUncheckedIndexedAccess` TS2532/TS2345 해소 (non-null assertion, Float32Array 길이 6 정적 보장)
- `apps/web/src/components/panels/black-hole-disk-panel.tsx`: `useState + useEffect + window.location.search` → `nuqs useQueryState('bh')` (url-sync 패턴 일관, react-hooks/set-state-in-effect 해소)
- 브라우저 smoke: `?bh=2&mode=research` panel visible=true 회귀 없음 확인

### 후속 OPEN (priority:low)

- #219 iOS Safari 실기기 bench (P14 배포 이후)
- #235 vsync 우회 플래그 다른 bench 스크립트로 확산

## [0.7.0] — 2026-04-18

### P7 — 트랙 B 3D ray + 적분기 격상 (Yoshida 4차)

**P7-A Yoshida 4차 심플렉틱 적분기 + Phase C 측정법 개선** (#206, PR #212)

- `packages/physics-wasm/src/integrator.rs` 신규 — Yoshida 1990 4차 심플렉틱
- `IntegratorKind` enum (VelocityVerlet / Yoshida4) + `set_integrator(u8)` bindgen
- EIH 가속도 본체 **불변** — 적분기만 감쌈
- **Phase C 측정 방식 개선**: LRL 벡터 + Newton baseline subtraction 도입
  - P6-D `min_r` 샘플링 노이즈 제거 → 진짜 수렴값 확인
  - 수성 0.11% / 지구 1.19% (3c) / 금성 1.39% (10c) rel_err 확정
  - Kepler 2체 5000 orbit drift **1.87e-13** (DoD 1e-10 대비 3자리 여유)
- WASM gzipped 16.36 → 16.71 KB (+0.35KB, 상한 +2KB 대비 17% 소진)
- ADR: `docs/decisions/20260418-p7-integrator-upgrade.md`

**P7-B 적분기 선택 API + URL 옵트인** (#207, PR #216)

- `packages/core/src/physics/nbody-engine.ts` — `IntegratorKind` union literal (TS) + `INTEGRATOR_TO_U8` (Rust 1:1)
- `apps/web/src/core/parse-integrator.ts` — URL 파서 (`verlet`/`velocity-verlet`/`yoshida4`), invalid → VV 폴백
- 기본값: `velocity-verlet` (Yoshida 옵트인 `?integrator=yoshida4`)
- E2E: `scripts/browser-verify-integrator.mjs` (정적 / URL 전환 / `?gr=eih&integrator=yoshida4` 5초 재생)

**P7-C 트랙 B 3D ray construction — 5차 D' 보강 채택** (#208, PR #217, PM M1 백업 경로)

- P6-B 3회 실패 후 P7-C 에서 5단계 순차 재시도:
  - 1차(A) 단일 invViewProj + 알파 fix — WebGL2 GLSL prelude 에러로 실패
  - 2차(C) 분리 invView/invProj (thinSSRPostProcess 패턴) — 동일 증상
  - 3차(E) **Frustum Corner Interpolation (Gemini 교차검증 고유 발견)** — 셰이더 컴파일 성공 + lensing 왜곡 성공, 하지만 실 Chrome 검증에서 disk mask 실패 확인
  - 4차(B) WGSL mat4_invert — 미진입
  - **5차(D) D' 보강**: `diskAxisX/Y` 를 world disk major axis 의 화면 투영 방향으로 대체 — 카메라 회전 시 disk 타원 장축 화면 내 회전
- 3차(E) 코드는 `?ray3d=1` 실험적 경로로 보존 (lensing 효과 자산)
- ADR: `docs/decisions/20260418-p7-track-b-ray3d.md` (Accepted as permanent approximation, Path 5)
- 선행 ADR `20260417-accretion-disk-shadow-pipeline.md` §재검토 트리거 발동 기록

**P7-D 모바일 best-effort 실측** (#209, PR #218)

- Playwright Chromium iPhone 14 emulation
- `engineNotice` 구조 전환: `string | null` → `{ key: string; message: string } | null` + `dismissedNoticeKeys` (key-scoped dismiss)
- `isMobile && !navigator.gpu` 경고 노티 (best-effort 정책)
- **A/B 교차 bench**: VV 1352.86 fps / Yoshida4 1383.75 fps (**ratio 1.054**, 임계 ≥0.90)
- 신규: `scripts/browser-verify-mobile-p7d.mjs`, `scripts/bench-scene-mobile.mjs`

**P7-E bench 컬럼 + 회고 + P6 가드 + 후속 흡수** (#210, PR #222, closes #215/#220/#221)

- E1 bench: `integrator_yoshida4_ms` (0.0002 ms/step, 1.59× VV) + `track_b_ray3d_frame_ms` (8.331 ms, M1 Pro WebGPU)
- E3 회고: `docs/retrospectives/p7-retrospective.md` (4섹션 + v2 로드맵 참조)
- E4 P6 가드: `apps/web/next-env.d.ts` .gitignore + `git rm --cached`
- 흡수 #215: ADR §재검토 트리거 §4 갱신 (>7분 → >11분, 실측 기반)
- 흡수 #220: `apps/web/src/core/is-mobile.ts` (iPadOS 13+ desktop UA `Macintosh + maxTouchPoints > 1` 감지)
- 흡수 #221: `__simStore` dev-only 전역 노출 (prod 번들 DCE 검증) + 시나리오 4 재작성
- 흡수 QA 이관 3건:
  - `scripts/browser-verify-utils.mjs` 신규 공통 유틸 (`pressTimePlay`, `hasSimErrors`)
  - 22개 browser-verify-\*.mjs 의 `time-play` silent-fail 패턴 + NaN regex 일괄 정비
  - `apps/web/src/core/parse-gr-mode.ts` (`?gr` 대소문자 정규화)

### 검증

- pnpm test **252/252** PASS (shared 4 + physics-wasm 1 + core 163 + web 84)
- cargo test --release **37 passed** (lib) + 2 (barnes_hut)
- 브라우저 3단계 검증 전부 PASS (실 Chrome 수동 + 에뮬레이션)
- WASM gzipped 16.71 KB (P6 대비 +0.35KB)
- Rust 본체 P7-B/C/D/E 전부 무수정 — P7-A에서만 integrator 추가

### 후속 이슈 (모두 priority:low)

- #219 iOS Safari 17.4+ 실기기 bench 수동 측정 (P14 배포 후)
- #223 `bench-p7-lens3d.mjs` `pressTimePlay` 도입 (120Hz vsync 페그 해소)
- #224 PR #222 본문/회고 '22개/21개' 수치 정정
- #225 `bench:scene:sweep` focus-earth/neptune baseline 재설정
- #226 Reviewer 후속 3건 (parseGrMode regex / `__simStore` configurable / ADR §Amendments)

### 이전 릴리스

- v0.6.1 (2026-04-18) — long-term-drift 테스트 타임아웃 방어
- v0.6.0 (2026-04-17) — P6 물리 심화 (중력렌즈 3D + EIH 1PN 다체)

## [0.6.1] — 2026-04-18

### 테스트 안정화

**long-term-drift 타임아웃 방어** (#203, closes #199)

- `packages/core/src/physics/long-term-drift.test.ts` — 두 `it()`에 `testTimeout: 30_000ms` 명시
- 재현 조사: main 단일 실행 1.31s / core 전체 163/163 PASS — **선재 회귀 아님**
- 100년 9체 Newton 적분은 단독 ~1.3s이나 병렬/CI 부하 시 vitest 기본 5s 초과 가능 → 안정성 확보 목적의 방어 조치
- `LONG_INTEGRATION_TIMEOUT_MS` 상수 추출 + 이유 주석

## [0.6.0-p6] — 2026-04-17

### P6 물리 심화 — 중력렌즈 고도화 + EIH 1PN 다체

**P6-A Schwarzschild geodesic RK4 솔버** (#194)

- `packages/physics-wasm/src/geodesic.rs` 신규 — 광선 1차 ODE `d²u/dφ² + u = 3M·u²` + 단순 RK4 + r-기반 step
- `GeodesicOutcome::{Escaped, Captured}` 분류, invariant 보존 측정
- 단위 테스트: weak-field b=50 Rs deflection rel_err **3.52%**, strong-field b=3 Rs rel_err **0.05%** (Iyer-Petters 2007 기준)
- invariant drift **~1e-14** (한계 1e-4, 10¹⁰ 배 여유)
- ADR: `docs/decisions/20260417-geodesic-solver.md`

**P6-B accretion disk + LUT shadow (D' 변형)** (#195)

- WASM bindgen `build_lensing_lut(samples) -> Vec<f32>` 신규 (flat `[outcome, deflection] × samples`)
- 신규 PostProcess `packages/core/src/scene/black-hole-rendering.ts` (WGSL/GLSL 듀얼)
- URL `?bh=2` 옵트인 (P5-D `?bh=1` 보존)
- 5 UI 파라미터 슬라이더 (Inner/Outer/Eccentricity/Thickness/Tilt)
- ADR D' 변형 박제 — 원안 3D ray construction → 화면공간 b/Rs + LUT (Babylon invViewProj 이슈로 후퇴, 3D 복원은 #196 후속)
- 알파 채널 fix (신규 원인 #4 식별): `vec4f(result.rgb, 1.0)` WGSL/GLSL 일관 — P5-D는 우연히 회피했던 패턴
- ADR 2건: `20260417-accretion-disk-shadow-pipeline.md`, `20260417-gravitational-lensing-pipeline.md` (P5-D Superseded)

**P6-C EIH 1PN 다체** (#197)

- `GrMode` enum (Off / Single1PN / EIH1PN) — 동시 활성 모순 차단
- WASM `set_gr_mode(u8)` 신규 + `set_gr(bool)` 호환 wrapper 보존
- `nbody.rs` 인라인 EIH 가속도 (Will eq. 6.80, harmonic gauge)
- URL: `?gr=eih` 신규 + `?gr=1`/`?gr=1pn` 호환 + `?gr=invalid` → off + warn
- 단위 테스트: 2체 한계 동치, 9체 100년 drift < 1e-6/orbit
- ADR: `docs/decisions/20260417-eih-1pn-multibody.md`

**P6-D 행성 근일점 ±5% 검증** (#198)

- `measure_perihelion_precession_eih(name, mass, a, e, period, expected, tol_pct)` 헬퍼 추출 (수성 하드코딩 → 일반화)
- **수성 42.59″** (rel_err 0.90%), **금성 8.67″** (rel_err 0.63%), **지구 3.74″** (rel_err 2.48%) — 모두 ±5%
- dt=2.5s 5단계 폴백 (60s → 30s → 15s → 7.5s → 5s → 2.5s) 끝에 통과 — RK4 정밀도 한계
- 수성 41.46″/century Single 모드 회귀 가드 무수정 보존
- ADR: `docs/decisions/20260417-perihelion-verification.md` (Park 2017 인용)

**P6-E bench + ADR + 회고 + 중복 방지 가드** (#200)

- `scripts/bench-p6e.mjs` — geodesic_ms sweep {64/256/1024} + eih_1pn_ms (N=9, 1000 step 평균)
- 실측: geodesic 7.78/30.88/121.32 ms, eih_1pn 0.0042 ms/step
- `scripts/check-duplicate-functions.mjs` + pre-commit + CI warn-only — P5 회고 `stateVectorAt` 중복 교훈 도구화
- 정규화 토큰 교집합 ≥ 2 + 도메인 stop list + 회귀 픽스처 13/13
- ADR: `docs/decisions/20260417-duplicate-function-guard.md`
- 회고: `docs/retrospectives/p6-retrospective.md`

### 후속 추적

- **#196** — 트랙 B 3D ray construction (invViewProj) + `?bh=2` silent failure 디버깅
- **#199** — `long-term-drift.test.ts` 5s timeout 선재 (P6-E 회귀 아님, 타임아웃 완화 후보)

## [0.5.0-p5] — 2026-04-17

### P5 일반상대론 + 중력렌즈 + 실기기 + 측정 도구

**P5-E bench baseline** (#181)

- v0.4.0 bench 결과 스냅샷 (`baseline-v0.4.0.json`)
- `bench:scene:set-baseline --compare <tag>` 비교 기능

**P5-B 실기기 iPhone 측정** (#182)

- iPhone 12 mini (A14/iOS 26.3.1) 직접 측정: N=200 **60fps**, N=10000 **40~50fps** 크래시 없음
- fps HUD 카운터 (`?fps=1` URL 옵트인) — SimulationCore에서 `engine.getFps()` 0.5초 emit
- WebGPU 미지원 (A14) → WebGL2 폴백 정상
- `next.config.mjs` allowedDevOrigins 추가

**P5-A 일반상대론** (#183)

- Rust NBodySystem에 1PN Schwarzschild 세차 보정항: `a_GR = (GM/(c²r³))[(4GM/r - v²)r + 4(r·v)v]`
- 수성 근일점 세차 **41.46″/century** (이론 42.98″, 오차 3.5%, DoD ±5% 충족)
- WASM `set_gr()/gr_enabled()` + TS `NBodyEngineOptions.enableGR` + URL `?gr=1`
- ADR: `docs/decisions/20260417-general-relativity-1pn.md`

**P5-C GPU compute shader별 세분화** (#184)

- `ComputeShader.gpuTimeInFrame: WebGPUPerfCounter`로 force/integrator 분리 측정
- `WebGpuNBodyEngine.readShaderTimings()` → `{forceMs, integratorMs}`
- `engine.enableGPUTimingMeasurements = true` 활성
- bench에 force_ms/integrator_ms 컬럼 + `window.__gpuShaderTimings` 노출

**P5-D 중력렌즈 시각화** (#185)

- Schwarzschild 블랙홀 PostProcess WGSL fragment shader
- 궤도선 왜곡 + Einstein ring (파란 글로우) + event horizon 흑색
- dual shader path (WGSL for WebGPU, GLSL for WebGL2)
- URL `?bh=1&bhx=N&bhy=N&bhz=N` 옵트인
- WGSL `textureSample` uniform control flow 제약 → branchless `step()/mix()` 해결
- ADR: `docs/decisions/20260417-gravitational-lensing-pipeline.md`

## [0.4.0-p4] — 2026-04-16

### P4 WebGPU 실측 + 모바일 1차 게이트

**P4-B WebGPU 활성 회귀 가드** (#168)

- EngineFactory 전환 **NO-OP** 결정 — `docs/decisions/20260416-engine-factory-no-op.md`
- `scripts/browser-verify-webgpu.mjs` 신규 — HUD `renderer · webgpu` assert, capability notice 미표시, reload 후 경로 유지 (5/5 통과)
- `--enable-unsafe-webgpu` 외 flag 명시 — 헤드리스 기본값 의존 제거

**P4-D GPU frame time 직접 측정** (#169)

- `SimulationCore.enableGpuTimer()` / `readGpuFrameTimeMs()` / `debugGpuTimer()` 공개 API
- `EngineInstrumentation.gpuFrameTimeCounter` 기반 ms 단위 측정 (lastSecAverage → average → current 폴백)
- `?gpuTimer=1` URL 옵트인 시 `window.__gpuFrameTimeMs` getter 노출
- `engine-factory.ts` — WebGPUEngine 생성 시 `timestamp-query` feature optional 요청
- `scripts/bench-webgpu.mjs` — GPU ms 컬럼 + `--enable-webgpu-developer-features` flag 추가

**P4-A 소행성대 N-body 편입** (#170)

- `?beltNbody=1` URL 옵트인 — 소행성대를 N-body 엔진에 편입
- **실측 WebGPU 226× @ N=5000, 286× @ N=10000** (vs barnes-hut CPU)
- `AsteroidBeltHandles.getNbodyState()` / `writeWorldPositions()` 추가
- `scripts/browser-verify-belt-nbody.mjs` — 3단계 회귀 가드 (6/6 통과)
- bench throughput ≥ 2× assertion 추가 (exit 1 on fail)

**P4-C 모바일 1차 게이트** (#171)

- `scripts/browser-verify-mobile-p4c.mjs` — iPhone 14 emulation 3 시나리오 (5/5 통과)
- 결과 리포트 자동 생성 (`docs/reports/p4c-mobile-YYYYMMDD.md`)
- 실기기 iPhone Safari 측정은 인계 (iOS 17.4+ WebGPU)

**회고** (#172)

- `docs/retrospectives/p4-retrospective.md` — 고정 4섹션
- P4-E(일반상대론) P5로 분리

### 수치 변화

- bench: WebGPU/BH = **0.45×(P3) → 226×(P4)** (소행성대 N-body 편입으로 가속 실제 측정 가능)
- 테스트: 287 → 290+ (GPU timer + state vector 가드 추가)
- 회귀 스크립트: +3종 (`verify:webgpu`, `verify:belt-nbody`, `verify:mobile-p4c`)

## [0.3.0-p3] — 2026-04-15

### P3 Barnes-Hut + WebGPU compute

**P3-0 준비**

- WebGPU 감지 + 자동 폴백 (`detectGpuCapability`, HUD dismissible notice) (#124)
- `bench:scene:sweep` N=5000/10000 확장 + CI bench 워크플로 timeout 30분 (#125)
- Engine selector 4-mode 확장 (`kepler|newton|barnes-hut|webgpu|auto`) (#126)

**P3-A Barnes-Hut (Rust/CPU)**

- Octree 데이터 구조 — flat `Vec<Node>`, leaf cap=1, MAX_DEPTH=24 (#130)
- COM + Salmon-Warren MAC tree-walk force (theta=0.5 max err **4.99e-9**) (#131)
- WASM `BarnesHutEngine` 노출 + Velocity-Verlet 통합 (#132)
- 1년 시뮬 정확도 검증 — Newton 직접합 대비 P3 계약 1e-3의 6 자릿수 여유 (#133)
- UI 활성화 + auto 모드 라우팅 (belt N≥1000 → barnes-hut) (#134)

**P3-B WebGPU compute**

- WebGPU compute 인프라 — `GpuComputeContext`, `GpuFloat32Buffer`, WGSL helpers (#143)
- N-body force WGSL shader — `workgroup_size=64` tiled algorithm (#144)
- V-V 적분 ADR + WGSL shader (`docs/decisions/20260415-webgpu-integration-scheme.md`, B 스킴 GPU-resident) (#145)
- `WebGpuNBodyEngine` JS 어댑터 + scene 라우팅 + UI 활성화 (capability 자동 폴백) (#146)
- 정확도 가드 + `bench:webgpu` 측정 도구 + p3b-perf.md (#147)

**P3-D 검증·마감**

- vsync 해제 throughput 측정 (`--disable-gpu-vsync` flag) — 가속비 측정 한계 박제 (#154)
- 종합 회귀 검증 287/287 통과 (Rust 22 + vitest 211 + browser-verify 54) (#155)
- v0.3.0 릴리스 (#156)

**아키텍처/데이터:**

- 신규 패키지 모듈: `packages/core/src/gpu/` (compute-context / buffer / wgsl-helpers / nbody-force-shader / nbody-vv-shader / capability)
- 신규 엔진: `BarnesHutNBodyEngine` (CPU/wasm) + `WebGpuNBodyEngine` (GPU)
- `PhysicsEngineKind`: `kepler|newton|barnes-hut|webgpu|auto` 5-mode
- harness v2.2.0 → v2.3.0 적용 (신규 페르소나 커맨드 7종 + ADR/회고 디렉토리)

**Known Issues / 인계:**

- WebGPU 가속비 측정 환경 한계: 헤드리스 Chromium ANGLE Metal에서 Babylon이 WebGL2 fallback 사용. webgpu URL은 capability 폴백으로 barnes-hut 라우팅. 실 측정은 데스크톱 Chrome Canary 또는 Babylon `useWebGPU: true` 명시 필요.
- 소행성대가 Kepler 해석해 + ThinInstances 렌더로 처리됨 — N-body 엔진 입력은 ~10 bodies. 'CPU 대비 webgpu ≥2× 가속'은 소행성대 N-body 통합(P4 후보) 후 재측정.
- WGSL f32 한정 정밀도 — 행성 SI 좌표(~1e11 m)에서 ~10km 단위 손실. 정밀 시뮬은 CPU 경로(`NBodySystem` f64) 사용.

**문서:**

- `docs/decisions/20260415-webgpu-integration-scheme.md` (ADR)
- `docs/benchmarks/p3a-barnes-hut-accuracy.md`, `p3a-perf.md`, `p3b-perf.md`, `p3d-comprehensive-verify.md`
- `docs/retrospectives/harness-update-2.2.0-retrospective.md` (P3 진행 중 회고)

## [0.2.0-p2] — 2026-04-15

### P2 태양계 확장 + Newton N-body

**P2-0 준비**

- PR 템플릿 브라우저 3단계 검증 필수 섹션 (#74)
- `verify:test-coverage` 워크스페이스 Vitest 가드 (#75)
- `updateAt` 프레임당 Map 재할당 제거 (#76)
- orbit 라인 LineSystem 통합 — draw call 9→1 (#77)
- `bench:scene` 자동 벤치 + baseline diff (#78)

**P2-A Newton N-body**

- `@astro-simulator/physics-wasm` 신규 크레이트 — Rust 1.94.1 + wasm-pack 0.14 (#84)
- Velocity-Verlet(Leapfrog) 적분기 — 1000년 에너지 드리프트 2.4e-9 (#85)
- WASM ↔ TS 바인딩 `NBodyEngine` + 씬 통합 (#86)
- Kepler 대비 정확도 검증: dt=10min 모든 행성 < 0.1% 오차 (#87)
- 시간 역행 대칭성 < 1e-9 상대 오차 (#88)
- Kepler↔Newton UI 토글 + URL `?engine=newton` (#89)

**P2-B 소천체 + 시각 스케일**

- 왜소행성 5개 (Ceres/Pluto/Haumea/Makemake/Eris) (#97)
- 혜성 3개 (Halley/Encke/Swift-Tuttle) (#98)
- 소행성대 ThinInstances `?belt=N` N=100~1000 (#99)
- 거리-의존 per-body 시각 스케일 — P1 Moon 버그 해결 (#100)

**P2-C 파라미터 + 북마크**

- 선택 천체 질량 슬라이더 0.1~10× (Newton 런타임 반영) (#107)
- 시간 포함 URL 북마크 버튼 (#108)
- "만약에" 프리셋 3종: jupiter-x10 / no-jupiter / sun-half (#109)

**P2-D 검증·마감**

- 장기 안정성: 9체 100년 드리프트 1.5e-10 (#115)
- 실 GPU(Apple M1 Pro): N=1000 소행성대에서 120 fps 달성 (#116)
- a11y 재검증 + MassSlider aria-label / Canvas tabindex 수정 (#117)

**아키텍처/데이터:**

- 바디 10 → **18** (sun + 8행성 + moon + 왜소행성 5 + 혜성 3)
- `NBodyEngine` 래퍼: `buildInitialState` + `advance(dtSeconds)` + 역행
- scene 옵션: `physicsEngine`, `asteroidBeltN`, `setBodyMassMultiplier`

**테스트 증분:** P1 139 → **P2 187 PASS** (core 128 + apps/web 54 + shared 4 + physics-wasm 1)

**성능:**

- 헤드리스 fps 감소(콘텐츠 추가 반영분, -16~20%)
- 실 GPU에서 N=1000까지 120fps vsync cap 도달

**알려진 제약:**

- 소행성대는 Kepler 전용 — Newton 합류 시 O(N²) 폭발. P3 GPU compute에서 재검토
- macOS Chromium만 실 GPU 측정 — Linux/Windows/모바일은 P3 후속
- 혜성 비중력 효과(태양풍) 미반영 — ±2% 정확도 한계
- 질량 변경 후 시간 역행으로 원 상태 복원 불가 — 프리셋 원복으로 암묵 리셋

## [0.1.0-p1] — 2026-04-14

### P1 태양계 MVP

**신규 기능:**

- 태양 + 행성 8개 + 달, J2000.0 기준 Kepler 궤도 해석해
- 시간 컨트롤 (재생/일시정지/역행, 6 프리셋 1s~10y)
- 카메라 포커스 전환 애니메이션 (300ms ease-out)
- 4모드 UI 프레임 (관찰/연구 활성, 교육/샌드박스 예약)
- 모드별 사이드 패널 (CelestialTree + CelestialInfoPanel + TierBadge)
- 스케일 컨트롤 (로그 슬라이더 0.01~100 AU)
- DateTimePicker + UnitToggle + URL 상태 동기화
- 국제화 (ko/en)
- 흑체복사 기반 다크 디자인 토큰

**아키텍처:**

- 이중 레이어 — 순수 TS 코어 (`@astro-simulator/core`) + Next.js UI (`apps/web`)
- CPU float64 + GPU RTE float32 좌표계
- Floating Origin (B4) — 10^13m 거리 정밀도 검증
- Logarithmic depth buffer — 근/원 동시 렌더
- WebGPU-first + WebGL2 폴백 (adapter 사전 판별)

**데이터:**

- JPL/Standish 1992 기준 10개 천체 궤도 요소
- Zod 런타임 검증

**테스트:**

- 130개 단위 테스트 (core 89 + shared 4 + web 37)
- Playwright E2E: browser/mobile/scale/perf/a11y 5개 스위트
- JPL 공칭값 대비 궤도 요소/공전주기/거리 경계 ±1% 검증
- axe-core WCAG 2.1 AA 위반 0건
- 색약 시뮬 검증 (protanopia/deuteranopia/tritanopia)

**성능 (Playwright headless):**

- 정지/재생 36~38 FPS
- 포커스 상태 90+ FPS

**알려진 제약:**

- WebGPU 실환경 검증은 수동 (헤드리스 chromium 미지원)
- 행성 시각 크기 × 500 배율로 표시 (실제 크기는 점으로 보이는 문제 회피)
- Moon은 지구 시각 메쉬 내부에 위치 (per-body 스케일은 P2)
- 로그 시간 스크러버는 P2로 연기
- 시각 북마크(스냅샷 URL)는 P2로 연기

### 변경

- 해당 없음 (초기 릴리스)

### 수정

- Next 16 `middleware` → `proxy` 파일 컨벤션 대응 (PR #53)
- WebGPU 초기화 실패 시 Babylon 내부 console.error 오염 제거 (PR #54)
- URL 상태 동기화 무한 루프 방지 (PR #67)
