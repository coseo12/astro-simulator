<!-- HARNESS-DRIFT: Z-PATTERN [TODO] -->

# 용어사전 (Glossary)

> astro-simulator 의 ADR / lessons / phases / retrospectives 문서가 공유하는 프로젝트 고유 용어를 정의한다. 신규 참여자/에이전트의 onboarding 비용 절감 목적. 각 항목은 5줄 이내 정의 + 첫 도입 ADR 또는 PR 링크.

---

## D-T2 (D Trigger 2 — 사용자 D-Trigger 2 검증)

사용자가 실 브라우저에서 시나리오를 손수 실행해 보고하는 검증 라운드. 자동 CI (`bench`, `r1-guard`, `verify:378-focus` 등) 가 통과해도 D-T2 에서 회귀가 발견되는 경우가 많음 — "DoD PASS ≠ 제품 동작" (volt #74) 원칙의 실측 게이트. 라운드 N=2가 기본 (라운드 1은 architect/dev 의 자체 검증, 라운드 2부터 사용자).

- 발화: [`docs/decisions/20260425-r1-sun-visualization.md`](decisions/20260425-r1-sun-visualization.md) 이후 매 R-Phase ADR 의 §결과·재검토 조건 표준 박제

## R-Phase (Roadmap v3 phase)

Roadmap v3 의 incremental body-by-body build 단계. **R1**=태양 가시성 / **R2**=수성 / **R3**=금성 / **R4**=지구 (예정) / **R5+**=화성·목성·외행성. 각 phase 진입 시 `R_PHASE_BODY_ALLOWLIST` (focus 활성) + `BODY_SCALE` (시각 활성) 5곳 동시 박제 의무 (`20260506-body-scale-r-phase-policy.md` §체크리스트).

- 발화: [`docs/phases/roadmap-v3-incremental.md`](phases/roadmap-v3-incremental.md), [`docs/decisions/20260425-r1-sun-visualization.md`](decisions/20260425-r1-sun-visualization.md)

## Tier (T1 / T2 / T3)

씬 단위 renderScale 차등 단계. **T1 solar** (renderScale ≈ 8.4e-11, 전체 태양계 뷰) / **T2 inner** (≈ 1.5e-9, 내행성권) / **T3 body** (≈ 5e-5, 표면 근접). `tier-transition.ts:runTierTransition` 이 ExponentialEase 300ms 로 camera dolly + apparent size 보존 수식 (`radius_new = radius_old × newScale / oldScale`) 으로 전환.

- 발화: [`docs/deprecated/decisions/20260423-display-relative-scale-unification.md`](deprecated/decisions/20260423-display-relative-scale-unification.md) §3 후보 D (Q8=8D 배선 원리 — ADR 자체는 P12 폐기, tier 개념은 현행 유지)
- 정밀: [`docs/decisions/20260509-380-zoom-camera-freeze-forensic.md`](decisions/20260509-380-zoom-camera-freeze-forensic.md) (가드 A G1 fix)

## Floating Origin (primary follow / safety net)

큰 좌표 (Heliocentric 절대 m) 가 float32 precision 한계를 초과하지 않도록, 카메라 근처를 origin 으로 이동하는 시스템. **primary** = focus body 추적 (`activeTier === 'body' && focusBodyId` 시), **safety net** = free-fly 시 카메라가 1 AU 이상 이동 시 강제 shift. 변화 없으면 listener no-op.

- 발화: [`docs/decisions/20260422-floating-origin.md`](decisions/20260422-floating-origin.md) (#288 P11-A primary), `solar-system-scene.ts:873-933`

## scene unit

Babylon 의 internal 좌표 단위. 현재 tier 의 `renderScale = 1 / metersPerSceneUnit` 으로 결정. T1 에서 1 unit ≈ 8.4e10 m (≈ 0.56 AU), T3 에서 1 unit ≈ 2e4 m (≈ 20 km). `camera.radius`, `mesh.position` 등 모든 Babylon 객체의 좌표가 scene unit.

## focus / focusOn / detachFocus / clearFocus

카메라 target 을 특정 body 로 잠그는 모드. **focusOn(body)** = mesh.absolutePosition 추적 + tier 사전 결정 (`applyFocusTier`). **detachFocus** = focus 만 해제 + tier/origin 보존 (#509 free-fly). **clearFocus** = focus + tier 완전 default 복원 (#510 reset). `controller.#followObserver` (#507) 가 `onBeforeRenderObservable` 으로 매 프레임 추적.

- 발화: `camera-controller.ts:focusOn`, [`20260425-r1-store-scene-sync-unification.md`](decisions/20260425-r1-store-scene-sync-unification.md)

## dolly

카메라 radius (피사체와의 거리) 를 부드럽게 변경하는 ExponentialEase Animation. tier 전환의 핵심 — `runTierTransition` 의 `tier-transition-radius` Animation 이 300ms dolly 로 apparent size 보존.

## detachControl / attachControl (G8a 가드)

`Scene.detachControl()` 은 ArcRotateCamera 의 모든 입력 (wheel/pinch/drag) 을 일시 차단. tier 전환 직후 race window 0 ms 보장 목적 (#380 G8a). `attachControl()` 은 idempotent — 정상 종료 / fallback timer / visibilitychange 어느 경로로도 1회만 발동 (released 플래그).

- 발화: [`docs/decisions/20260509-380-zoom-camera-freeze-forensic.md`](decisions/20260509-380-zoom-camera-freeze-forensic.md) §결정 §G8a SSoT

## ArcRotateCamera (Babylon)

target 주위를 alpha (수평) / beta (수직) / radius (거리) 구좌표로 회전하는 카메라. 본 프로젝트는 `setupArcRotateCamera` 가 default `alpha=-π/2`, `beta=π/2.5`, `radius=30`, `lowerRadiusLimit=0.5`, `upperRadiusLimit=1e14`, `wheelPrecision=3`, `pinchPrecision=50`, `panningSensibility=0` 으로 설정.

- 발화: `camera.ts:setupArcRotateCamera`

## runTierTransition

tier 전환 시 입력 잠금 + camera dolly + onComplete 콜백 lifecycle 을 관리하는 함수. 300ms Animation + 500ms fallback timer + visibilitychange listener 3중 방어로 영구 잠금 방지. F2/F7/G8a 가드 통합.

- 발화: `tier-transition.ts:runTierTransition`, [`20260509-380-zoom-camera-freeze-forensic.md`](decisions/20260509-380-zoom-camera-freeze-forensic.md)

## EIH (Einstein-Infeld-Hoffmann 1PN)

일반상대성 1차 후 뉴턴 보정 (1 Post-Newtonian) 식. 수성 근일점 세차 (43''/century) 등 GR 효과를 Newton 적분에 추가. `grMode === 'eih'` 활성 시 적용. `single-1pn` 은 sun-only 단순 항.

- 발화: [`docs/decisions/20260417-general-relativity-1pn.md`](decisions/20260417-general-relativity-1pn.md) (#178/#191 — 파일명 정정 #842)
- 적분기 선택 아키텍처 (API/URL 파라미터): [`docs/architecture/integrator-selection.md`](architecture/integrator-selection.md) (#905 링크 복구)

## Yoshida (4th-order symplectic integrator)

해밀턴 시스템 적분기 — velocity-verlet (2차) 대비 에너지 보존성 우수. 모바일에서 perf 비용 ~30% 추가. `integrator: 'yoshida4'` 옵션. 장기 적분 정확성 우선 시.

- 발화: [`docs/decisions/20260418-p7-integrator-upgrade.md`](decisions/20260418-p7-integrator-upgrade.md) (#207 — 파일명 정정 #842)
- 적분기 선택 아키텍처 (VV ↔ Yoshida4 선택 API): [`docs/architecture/integrator-selection.md`](architecture/integrator-selection.md) (#905 링크 복구)

## Barnes-Hut (octree-based N-body)

O(N²) → O(N log N) 가속 알고리즘. 소행성대 N=5000+ 같은 큰 N 에서 활성. `physicsEngine: 'barnes-hut'`. θ=0.5 가 정확도/성능 균형 기본값.

- 발화: [`docs/benchmarks/p3a-barnes-hut-accuracy.md`](benchmarks/p3a-barnes-hut-accuracy.md) (#124/#138 — 전용 ADR 부재, 정확도 벤치마크 문서로 정정 #842)

## NO-OP ADR

인계 항목 (이전 마일스톤 회고에서 인계된 작업) 이 착수 시점에 이미 해소되어 있을 때 작성하는 ADR. `docs/decisions/<YYYYMMDD>-<topic>-no-op.md`. 회귀 가드 (verify 스크립트 또는 테스트) 동반 박제 의무 — 미래 재발굴 시 빠르게 기각 근거.

- 발화: CLAUDE.md §"인계 항목 실측 재검증 — NO-OP ADR 패턴"

## Forensic ADR

복잡 회귀 (가설 N≥2 + runtime 측정 + 사용자 인지 단위 mismatch 등) 전용 8섹션 ADR 변형. 일반 ADR 4섹션이 부족할 때 사용. 5조건 중 3개 이상 충족 시 발동.

- 템플릿: [`docs/templates/forensic-adr-template.md`](templates/forensic-adr-template.md) (#381)
- 모범: [`20260430-r3-followup-body-proportion.md`](decisions/20260430-r3-followup-body-proportion.md), [`20260509-380-zoom-camera-freeze-forensic.md`](decisions/20260509-380-zoom-camera-freeze-forensic.md), [`20260504-411-r1-guard-shortcut-bar-forensic.md`](decisions/20260504-411-r1-guard-shortcut-bar-forensic.md)

## ADR Status (Provisional / Accepted / Superseded)

ADR 라이프사이클 상태. **Provisional** = cross-validate 또는 사용자 결정 미완료 (잠정). **Accepted** = cross-validate 통과 + 사용자 승인 (최종). **Superseded** = 후속 ADR 이 본 결정을 대체 (`Superseded by: <new ADR>` 박제). cross-validate 발동 ADR 만 Provisional 사용 (#370 옵션 C — 부분 도입).

- 발화: [`docs/decisions/20260429-r3-venus-visualization.md`](decisions/20260429-r3-venus-visualization.md) §교차검증 §고유 발견 §발견 1 → #370

## cross-validate (Gemini 1회 교차검증)

ADR / 정책 / CRITICAL DIRECTIVE 박제 직후 Gemini 2.5 Pro 로 1회 교차검증하는 루틴. 결과는 **합의 / 이견 / 고유 발견** 3축 분류 후 ADR §교차검증 반영 사항에 박제. 고유 발견은 (a) 현재 PR 반영 / (b) 후속 이슈 분리 둘 중 결정.

- 발화: CLAUDE.md §"교차검증 (cross-validate)", [`docs/guides/cross-validate-protocol.md`](guides/cross-validate-protocol.md) (파일명 정정 #842)

## R-Phase Allowlist 가드 (defense-in-depth)

R-Phase 미진입 body 의 focus / mass mutation 진입을 차단하는 4중 방어선. **#402 UI 1차** (focus-quick-buttons disabled), **#414 scene 2차** (simulation-core handler 가드), **#415 url-sync 3차** (`?focus=`), **#403 #404 UI 4차** (CelestialTree / InfoPanel / ScenarioPresets).

- 발화: [`docs/decisions/20260504-r-phase-allowlist-guard.md`](decisions/20260504-r-phase-allowlist-guard.md)

## BODY_SCALE / R-Phase 정책 매트릭스

body 의 시각 활성 (BODY_SCALE 박제) vs focus 활성 (R-Phase allowlist) 2축 직교 정책. R-Phase 진입 의무 5곳 동시 박제: (1) `BODY_SCALE` (2) `R_PHASE_BODY_ALLOWLIST` (3) `FOCUS_BODIES` (verify 매트릭스) (4) R-Phase ADR (5) CHANGELOG. 누락 시 시각/focus 불일치 발생.

- 발화: [`docs/decisions/20260506-body-scale-r-phase-policy.md`](decisions/20260506-body-scale-r-phase-policy.md) (#412)

## viewport / 모바일 (375×667)

R1/R2/R3 가드의 시각 회귀 검증 viewport 매트릭스. **1280×720** (desktop 기본), **1920×1080** (FHD), **375×667** (iPhone SE 기준 모바일). R1 가드 mismatch 임계 — desktop 0.5%, mobile 1.5% (ADR Amendment 2 #508).

- 발화: [`docs/decisions/20260425-r1-ui-pixel-diff-guard.md`](decisions/20260425-r1-ui-pixel-diff-guard.md), [`apps/web/scripts/r1-ui-regression-guard.mjs`](../apps/web/scripts/r1-ui-regression-guard.mjs)

## focus tracking observer (#507)

`CameraController.#followObserver` — `focusOn` Animation `onAnimationEnd` 후 attach, `reset` / 새 `focusOn` / `dispose` 시 detach. 매 프레임 `camera.target.copyFrom(mesh.absolutePosition)` 으로 venus 등 큰 mesh (tier 'inner' 진입) 의 공전 추적. tier-conditional primary follow (T1/T2 skip) 과 직교한 카메라 측 책임.

- 발화: [`#507`](https://github.com/coseo12/astro-simulator/issues/507) / PR [#512](https://github.com/coseo12/astro-simulator/pull/512)

## free-fly mode (#509)

focus 해제 시 camera 시점 (alpha/beta/radius/target/tier) 을 그대로 유지하면서 focus tracking 만 해제하는 UX 모드. `solar.detachFocus()` + `controller.clearFollow()`. shortcut bar "탐색" 버튼 + Esc 단축키. clearFocus (sun 중심 reset, #510) 와 구분.

- 발화: [`#509`](https://github.com/coseo12/astro-simulator/issues/509) / PR [#513](https://github.com/coseo12/astro-simulator/pull/513)

## tier transition input drops (#444)

tier 전환 윈도우 (`detachControl ~ cleanup`) 에서 도달한 사용자 wheel/touchstart 카운트. G8a (input lock) 의 UX 비용 정량화 — 일정 운영 후 분포 관찰 → G8b (큐잉) 격상 결정 데이터. DevTools: `window.__simCore.metrics.tierTransitionInputDrops`.

- 발화: [`#444`](https://github.com/coseo12/astro-simulator/issues/444) / PR [#516](https://github.com/coseo12/astro-simulator/pull/516)

## dead-wait (세션 중단 무인지 침묵)

background 대기 (sub-agent / CI watch) 중 세션 재시작으로 waiter 프로세스가 SIGKILL 소멸했는데 메인 컨텍스트에는 "대기 중" 만 남아 아무것도 모델을 재호출하지 않는 무기한 침묵 상태. fallback ScheduleWakeup (1200~1800s) + SessionStart 복구 훅 + `.context/pending-waits.json` 3계층 직교 방어.

- 발화: [`docs/decisions/20260710-817-dead-wait-guard.md`](decisions/20260710-817-dead-wait-guard.md) (#817), [`docs/lessons/dead-wait-guard.md`](lessons/dead-wait-guard.md)

## focus-entry (focus 진입 궤도 맥락 프레이밍)

`focusOn` 진입 시 대상 body 를 궤도 맥락과 함께 프레이밍하는 계약 — inner tier 정착 (earth 기준 화면 점유 ~21%). body-tier 줌인 도달 계약 (V5 40%, `runTierTransition` ×5.9) 과는 **별개 계약**. #834 실측 재검증에서 "버그 아님 — 의도된 프레이밍" NO-OP 확정.

- 발화: [`docs/decisions/20260718-834-focus-entry-tier-no-op.md`](decisions/20260718-834-focus-entry-tier-no-op.md) (#834)

## tier 히스테리시스 (zoom crossing 진동 방지)

0.1 AU tier 경계 crossing 시 focus-entry framing 재적용 → catapult → 역판정이 반복되는 무한 진동 (runaway) 을 차단하는 가드. 줌 crossing 시 apparent-size 보존 (preserveFocusDistance) + 경계 히스테리시스로 대형 body 줌인 stall 해소.

- 발화: [`docs/decisions/20260717-818-focus-zoom-tier-oscillation-forensic.md`](decisions/20260717-818-focus-zoom-tier-oscillation-forensic.md) (#818)

## render-capacity (rAF 우회 렌더 용량 프로브)

`__simCore.scene` 동기 렌더 루프로 rAF vsync 종속을 우회해 실제 렌더 용량을 측정하는 프로브. `rafFps∈[28,36] ∧ capacity≥400` 이면 30Hz vsync 락으로 분류해 fps 가드 false-positive 를 흡수. 저 rafFps 분류만으로는 흡수 금지 — capacity 양성 입증 시에만 (fail-fast 불변식).

- 발화: [`docs/decisions/20260710-820-fps-vsync-lock-forensic.md`](decisions/20260710-820-fps-vsync-lock-forensic.md) (#820)

## Z 패턴 (harness-managed divergent workflow)

harness-managed 파일 (`.harness/manifest.json` 등록) 에 프로젝트 고유 변경이 필요할 때의 3단계 워크플로 — Phase 1 본 프로젝트 선반영 (`HARNESS-DRIFT: Z-PATTERN [TODO]` 데코레이터 박제) → Phase 2 upstream 기여 (cross-link) → Phase 3 `harness update` 자동 동기화로 drift 해소. 데코레이터 누락 시 CI fail-fast (Amendment 8).

- 발화: [`docs/decisions/20260515-harness-managed-divergent-pattern.md`](decisions/20260515-harness-managed-divergent-pattern.md) (#556), CLAUDE.md §"Z 패턴 TL;DR"
