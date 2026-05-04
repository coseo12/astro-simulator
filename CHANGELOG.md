# 변경 이력

모든 중요한 변경사항은 이 파일에 기록된다.
Semantic Versioning을 따른다.

## [Unreleased]

### Behavior Changes

- **R-Phase Body Focus Allowlist 가드 도입 — defense-in-depth (UI + scene 양 측면) (#402)** ([#402](https://github.com/coseo12/astro-simulator/issues/402)) — `packages/core/src/scene/r-phase-allowlist.ts` 신규 SSoT 박제 (`R_PHASE_BODY_ALLOWLIST = ['sun', 'mercury', 'venus']` + `isRPhaseFocusable(bodyId)` helper). UI 측면 (`apps/web/src/components/layout/focus-quick-buttons.tsx`): R-Phase 미박제 body (earth / jupiter / neptune) 버튼이 `disabled` + `aria-disabled="true"` + `data-r-phase-disabled="true"` + tooltip + opacity 50% + cursor-not-allowed 으로 시각/접근성 동시 차별화. scene 측면 (`packages/core/src/engine/simulation-core.ts` `case 'focusOn'`): UI 우회 (URL `?focus=earth` 직접 진입 / 외부 commander) 도 `isRPhaseFocusable` 검사 후 `bodySelected` event emit 차단 + console.warn (URL `?focus=earth` 직접 진입 시 R-Phase 미박제 body 잔재 0 보장). 사용자 D-T2 (#402 발화점, 2026-05-03) "earth/jupiter/neptune 클릭 시 잔재 보임" 회귀 직접 가드. ADR [`docs/decisions/20260504-r-phase-allowlist-guard.md`](docs/decisions/20260504-r-phase-allowlist-guard.md) §결정 1 (SSoT) + §결정 2 (UI 가드) + §결정 3 (scene emit 차단) + §결정 4 (5곳 동시 박제 절차 — R4 진입 시) + §Amendment 결정 D1 (sub-path export 폐기 + namespace re-export 강제, 라운드 2 turbopack `__dirname` SSR 회귀 fix)
- **R-Phase 진입 시 5곳 동시 박제 의무 박제 (#402 라운드 2)** ([#402](https://github.com/coseo12/astro-simulator/issues/402)) — R4/R6/R10 진입 시 5곳 동시 갱신 의무 박제 (라운드 1 의 4곳에서 5번째 wasm-safe 검증 추가): (1) `r-phase-allowlist.ts` body id 추가, (2) 해당 R-Phase ADR §결정 N 에 본 ADR cross-link, (3) `apps/web/scripts/browser-verify-r-phase-allowlist.mjs` expected list 갱신, (4) `CHANGELOG.md` `### Behavior Changes` 박제, (5) WASM 의존 도메인 (scene / physics / render / gpu) 한정 sub-path 추가 금지 검증 — `scripts/verify-core-exports-immutable.sh` 자동 차단. ADR §Amendment 결정 D2
- **`apps/web/scripts/browser-verify-r-phase-allowlist.mjs` 신설 — R-Phase Allowlist 회귀 가드 (#402)** ([#402](https://github.com/coseo12/astro-simulator/issues/402)) — 3종 매트릭스: (1) 박제 body (sun/mercury/venus) 활성 + 미박제 body (earth/jupiter/neptune) `disabled` + `aria-disabled="true"` + `data-r-phase-disabled="true"` 단언, (2) 활성 버튼 click 시 `selectedBodyId === body` smoke, (3) 강제 click (Playwright `force: true` HTML disabled 우회) 시 store/camera 변화 0 (defense-in-depth scene 측면 검증). CLI: `pnpm --filter @astro-simulator/web verify:r-phase-allowlist`. **CI `detect-and-test` job 통합** — `.github/workflows/ci.yml` 에 `next dev -p 3004` 기동 후 검증 step 추가 (verify:378-focus / verify:focus-transition 패턴 일관)
- **`scripts/verify-core-exports-immutable.sh` 신설 — turbopack `__dirname` SSR 회귀 자동 가드 (#402 라운드 2)** ([#402](https://github.com/coseo12/astro-simulator/issues/402)) — `packages/core/package.json` exports field 에 WASM 의존 도메인 (scene / physics / render / gpu) sub-path 추가 시 exit 1. 라운드 1 (PR #407 closed `3eed4e0`) 회귀 메커니즘: wasm-pack `--target nodejs` 출력의 `${__dirname}/physics_wasm_bg.wasm` 가 turbopack module dep graph 변경 시 `/ROOT/...` 가상 path 로 ENOENT → SSR 500. 화이트리스트 (`. / ./coords / ./physics / ./scene / ./gpu / ./ephemeris`) 외 WASM 도메인 sub-path 추가 시 자동 차단. coords / ephemeris / time 등 순수 데이터 도메인은 자유 (Gemini cross-validate Q3 권고 — 스코프 좁힘). **CI `detect-and-test` job 통합** — `.github/workflows/ci.yml` 에 `bash scripts/verify-core-exports-immutable.sh` step 추가
- **focus 전환 시 tier oscillate 회귀 fix — F1+F2 defense-in-depth 적용 (#408)** ([#408](https://github.com/coseo12/astro-simulator/issues/408)) — `packages/core/src/scene/solar-system-scene.ts` 에 (F1) `applyFocusTier(bodyId, cameraDistMeters): Tier` 신규 scene API 박제. `sim-canvas.tsx syncFocusToScene` 헬퍼가 `setFocusOrigin` 직후 + `controller.focusOn` 직전에 호출 → focusOn 의 cam-target tween (300ms) 보간 시작 **전에** final tier 정착 → 보간 중 `updateTierByCamera` 가 동일 tier 반환으로 no-op (race 차단). (F2) `tierTransitionInProgress` closure 변수 + `runTierTransition` 의 `onComplete?: () => void` 콜백 박제 — `setTier` 진입 시 lock=true, cleanup 정상 종료 / fallback timer / visibilitychange 어느 경로로 발동해도 onComplete 가 1회만 호출되어 lock=false (idempotent, `released` 플래그 패턴). lock 활성 시 `updateTierByCamera` 가 no-op 으로 transition 진행 중 재판정 race 차단. 사용자 D-T2 (2026-05-04) frame-by-frame 측정 회귀 (venus → mercury 전환 시 inner→body→inner oscillate 2회, camR 38만 unit jump, target origin reset) 해소. ADR [`docs/decisions/20260504-focus-tier-oscillate-fix.md`](docs/decisions/20260504-focus-tier-oscillate-fix.md) §결정 1 (F1, 의존 역전 (c)) + §결정 2 (F2, lock + onComplete idempotent)
- **`FOCUS_USER_RADIUS_MULTIPLIER` / `FOCUS_USER_RADIUS_MIN_PADDING` 명명 상수 박제 (#408)** ([#408](https://github.com/coseo12/astro-simulator/issues/408)) — `packages/core/src/scene/camera-controller.ts` 의 `desiredRadius = max(meshRadius × 5, meshRadius + 0.01)` 식의 매직 넘버를 명명 상수로 추출 + scene namespace export. `sim-canvas.tsx` 의 `applyFocusTier` cameraDistMeters 산식이 동일 SSoT 1곳 import → camera-controller / sim-canvas 식 drift 차단. tier-transition.ts 의 `FOCUS_RADIUS_MULTIPLIER = 5.9` (V5 달성 정밀값) 와 분리 의도 박제 (user-trigger 경로 한정 ×5 vs tier 전환 경로 ×5.9). Gemini cross-validate 부분 수용 (ADR §결정 1 §매직 넘버 상수화 권고)
- **`apps/web/scripts/browser-verify-focus-transition.mjs` 신설 — focus 전환 회귀 가드 9 cells 매트릭스 (#408)** ([#408](https://github.com/coseo12/astro-simulator/issues/408)) — 3 from × 3 to (sun/mercury/venus, R-Phase v3 활성 body) = 9 cells. 각 cell 마다 from body 안정화 후 to body 클릭 simulation (`simCore.sendCommand({type:'focusOn', bodyId})`) → 1.5초 동안 16ms 간격 frame snapshot (tier / camera.target / camera.radius) 캡처. DoD 3종 단언: (1) tier 전환 횟수 ≤ 1 (oscillate 차단), (2) target origin reset (camTarget < 0.5 unit) 0 회 (sun 케이스 제외), (3) camR jump > 1000 unit 0 회. CLI: `pnpm --filter @astro-simulator/web verify:focus-transition`. **CI `detect-and-test` job 통합** — `.github/workflows/ci.yml` 에 `next dev -p 3003` 기동 후 검증 step 추가 (verify:378-focus 패턴 일관)
- **focus 시 허공 표시 회귀 fix — 옵션 D (A+B defense-in-depth) 적용 (#378)** ([#378](https://github.com/coseo12/astro-simulator/issues/378)) — `packages/core/src/scene/camera-controller.ts` `focusOn()` 에 (A) `desiredRadius < camera.lowerRadiusLimit` 일 때 `lowerRadiusLimit = max(camera.minZ, desiredRadius * 0.5)` 동적 완화 + `mesh.computeWorldMatrix(true)` 명시 호출. `packages/core/src/scene/tier-transition.ts:174` 직전에 (B) `focusMesh.computeWorldMatrix(true) + focusMesh.refreshBoundingInfo()` 추가. 두 옵션 모두 focus 트리거 한정 / 기존 동작 비-침습 (manual zoom 영향 0). venus 관찰 모드 D-T2 라운드 3 (2026-05-03) 보고 회귀 (T1 시점 desiredRadius=0.0104 < lowerRadiusLimit=0.5 clamp → tier 전환 후 mesh 외각 frustum 밖) 해소. 12 cells 매트릭스 (6 body × 2 모드) 실측 12/12 PASS — venus 관찰 / 연구 모두 `camera.isInFrustum(venusMesh) === true` + `camera.radius / meshRadiusWorld = 5.90` (mesh 내부 박힘 차단 비 ≥ 1.5 충족). ADR [`docs/decisions/20260503-378-focus-frustum-fix.md`](docs/decisions/20260503-378-focus-frustum-fix.md) §결정 (옵션 D, defense-in-depth). 실측 박제: [`docs/reports/378-forensic/output-developer.json`](docs/reports/378-forensic/output-developer.json)
- **`apps/web/scripts/browser-verify-378-focus.mjs` 신설 — focus 회귀 가드 12 cells 매트릭스** ([#378](https://github.com/coseo12/astro-simulator/issues/378)) — 6 body (sun/mercury/venus/earth/jupiter/neptune) × 2 모드 (observe/research) = 12 cells 매트릭스. 각 cell 별 DoD 3종 단언: (1) `camera.isInFrustum(focusMesh) === true`, (2) `camera.radius > meshRadiusWorld * 1.5` (mesh 내부 박힘 차단), (3) `camera.target` 이 `focusMesh.absolutePosition` 근방 (오차 ≤ meshRadiusWorld × 5). CLI: `pnpm --filter @astro-simulator/web verify:378-focus` 또는 `node apps/web/scripts/browser-verify-378-focus.mjs`. dev 빌드 의존 (`window.__solarScene.meshes` Map + `mesh.getScene().activeCamera`). **CI `detect-and-test` job 통합** — `.github/workflows/ci.yml` 에 `next dev -p 3002` 기동 후 검증 step 추가 (cross-validate G3 수용 — 사용자 D-T2 재발견 비용 > CI 시간 비용 ROI 명백)
- **R3 라운드 3 D-1 채택 — venus > mercury 사실 비율 강화 (#385, #373 라운드 3 후속)** ([#385](https://github.com/coseo12/astro-simulator/issues/385)) — `BODY_SCALE.mercury` 900 → **700** / `BODY_SCALE.venus` 650 → **800** (D-1 채택, architect 4축 평가 — 사실 비율 도달률 / 4px fallback 안전 마진 / LOD 일관성 / 모바일 누적 disk area). venus/mercury 시각비 1.79배 → **2.83배** (사실 비율 6052/2440 = 2.48배 도달률 72% → **114%**). 사용자 D-T2 (PR #384, 2026-05-01) "전체적인 비율은 개선됨 / 실제 비율적으론 아직 맞지 않는 듯" 부분 통과 → 라운드 3 적극 재조정. mercury 저점 pxDiameter 5.29 px (4px fallback 마진 +1.29 px, D-2 의 2.43배 안전), venus 고점 48.4 px (mid 임계 50 미만 → mid 일관 유지, high 미진입). 모바일 누적 disk area 16.75% (가드 25% 마진 8.25%p). r1-guard `--measure-px-ratio` 임계 갱신 — mercury 6% → **4.95%** / venus 11% → **14.26%** (±5% 마진 정책 보존). forensic ADR [`docs/decisions/20260430-r3-followup-body-proportion.md`](docs/decisions/20260430-r3-followup-body-proportion.md) Amendment 2026-05-03 (라운드 3) SSoT
- **`PX_RATIO_THRESHOLDS` 임계 갱신 (#385 라운드 3 D-1)** ([#385](https://github.com/coseo12/astro-simulator/issues/385)) — `apps/web/scripts/r1-ui-regression-guard.mjs` 의 `PX_RATIO_THRESHOLDS` 박제값 갱신 (mercury 6 → 4.95 / venus 11 → 14.26). 산출 식: `예측값 × 1.05 (±5% 마진 정책)` — mercury 4.71% × 1.05 ≈ 4.95%, venus 13.58% × 1.05 ≈ 14.26%. 라운드 2 SSoT 의 ±5% 마진 정책 보존 (architect ADR Amendment 2026-05-03 라운드 3 §결정 2). R4+ body 추가 시 본 룩업에 1줄 추가만 — body-scale.ts 와 동일 SSoT 패턴
- **billboard alpha mask 적용 — 모바일/데스크톱 사각형 회귀 fix (#391 Phase 2, #379 후속)** ([#391](https://github.com/coseo12/astro-simulator/issues/391)) — `createBodyBillboard` material 에 procedural 원형 alpha mask 적용 (`StandardMaterial.opacityTexture` + `transparencyMode = 1` ALPHATEST + `alphaCutOff = 0.5`). `MeshBuilder.CreatePlane` quad 자체는 유지 (low LOD 정책 변경 없음). #379 Phase 1 (PR #390, screenCoverage 식 정정) 머지 후에도 작은 viewport / 낮은 DPR 환경 (모바일 320×568 ~ 데스크톱 1920×1080 dpr1) 6 cell 에서 mercury (pxDiameter 6.80~12.94) / venus (12.39~15.71) 가 low billboard 잔존하여 정사각형 quad 의 픽셀 그리드 노출이 사용자 D-T2 사각형 회귀 trigger — alpha mask 가 quad 윤곽 → 원형 disc 변환으로 회귀 차단. 8 cell 매트릭스 검증 8/8 PASS (`pnpm verify:391-billboard` 시나리오 D), Phase 1 baseline `verify:379-lod` sun=high 100% / 최대 low ratio 95.8% 보존. r1-guard `--measure-px-ratio` 영향 0 (mercury 6.07% / venus 11.03% 동일). bench:scene 회귀 0 (idle/play/focus 5종 모두 develop tip 대비 +9~+11% 향상, 측정 변동성 안). ADR [`docs/decisions/20260502-391-phase2-billboard.md`](docs/decisions/20260502-391-phase2-billboard.md) §결정
- **billboard alpha mask 4px fallback 임계 박제** ([#391](https://github.com/coseo12/astro-simulator/issues/391)) — `LOD_BILLBOARD_ALPHA_MASK_MIN_PX_DIAMETER = 4` 상수 + `shouldApplyBillboardAlphaMask(pxDiameter)` 헬퍼 export. `runLodPass` 가 매 프레임 측정 + low variant material 의 `opacityTexture` 토글 (≥ 4px → mask 적용 / < 4px → null + `transparencyMode = 0` OPAQUE 사각형 quad 유지). 근거: smoothstep(0.4, 0.5) 의 0.53px 전이 구간이 hardware pixel 1개 미만 → GPU sampler aliasing + sub-pixel flickering 회피 (사용자가 3px 이하에서 원/사각형 구분 불가, 사각형 quad 가 시각 안정성 우위). cross-validate (Gemini) 이견 수용 #1. #385 라운드 3 (mercury/venus 박제값 인하) 진입 시 안전 마진 제공. 단위 테스트 6 case 신설 (`packages/core/src/scene/lod-billboard-alpha-mask.test.ts`)
- **DynamicTexture 64×64 scene 단위 공유 + dispose 책임 박제** ([#391](https://github.com/coseo12/astro-simulator/issues/391)) — `getOrCreateBillboardAlphaMask(scene)` 가 `scene.metadata.__lodBillboardAlphaMask` 캐시로 1회 생성. 24 body 의 low variant material 모두 동일 인스턴스를 `opacityTexture` 로 공유 참조 (≈ 16KB VRAM 단일 박제, per-body 생성 시 24×). scene dispose 시 `disposeBillboardAlphaMask(scene)` 명시 정리 — HMR / navigation 시 텍스처 누수 방지. cross-validate 이견 수용 #2. browser-verify 시나리오 E 검증 (opacityTexture 고유 인스턴스 = 1)
- **`apps/web/scripts/browser-verify-391-billboard.mjs` 신설 — alpha mask 회귀 가드 2종 시나리오** ([#391](https://github.com/coseo12/astro-simulator/issues/391)) — 시나리오 D: 8 cell 매트릭스 (Phase 1 baseline 동일) 에서 mercury/venus 의 pxDiameter ≥ 4px 와 lowVariant.material.opacityTexture/transparencyMode 정합성 검증 / 시나리오 E: scene.metadata 캐시 박제 + opacityTexture 고유 인스턴스 1 (per-body 생성 회귀 가드). CLI: `pnpm verify:391-billboard`. dev 빌드 (`window.__simCore.scene` + `__solarScene.getLodInfo()` 의존)
- **`screenCoverageRadius` 식 정정 — sun=high 100% 회복 (#379 Phase 1)** ([#379](https://github.com/coseo12/astro-simulator/issues/379)) — `packages/core/src/render/lod.ts` 의 edge offset axis 를 world-up (+y) 고정에서 **camera-up basis (invView col 1)** 로 변경. 카메라가 비스듬한 자세 (T1 default 의 ArcRotateCamera 가 ~15° tilt) 에서 world-up 의 view-forward 성분이 NDC y 변화를 흡수해 pixel offset 이 ~50% 작게 측정되던 결함 해소. forensic 매트릭스 (`docs/reports/379-forensic/output.json`, 40 cell) 에서 sun=low 100% / mercury=low 100% / venus=low 100% 였던 회귀가 sun=high 100% (8/8 spot-check, `apps/web/scripts/browser-verify-379-lod.mjs` 시나리오 A) 로 정정. 사용자 D-T2 (#379 모바일 사각형) 의 1차 원인 (sun 이 LOD billboard plane 으로 fallback) 해소. 식 정정 효과 측정 (1280×720 dpr1, T1 default): sun coverage 39.99→**71.08 px** (이론 ≈ 71 일치), mercury 2.43→**4.31 px**, venus 4.41→**7.85 px**. mercury/venus 는 박제값 (mercury=900 / venus=650, 라운드 2) 환경에서 여전히 mid 임계 (8) 미달 → 후속 #385 라운드 3 영역 (architect ADR §재검토 #4 박제). r1-guard `--measure-px-ratio` 결과는 BBOX-based `boundingSphere.radiusWorld` 사용으로 식 fix 영향 0 (mercury 6.07% / venus 11.03% 측정값 동일, 라운드 2 baseline 유지)
- **`SolarSystemSceneHandles.runLodPass` cameraUpWorld 박제** ([#379](https://github.com/coseo12/astro-simulator/issues/379)) — `scene.getViewMatrix().clone().invert().m[4..6]` 을 매 프레임 1회 추출해 `screenCoverageRadius` 에 전달. 첫 frame 에 `_viewMatrix` lazy 미초기화 시 `[0, 1, 0]` fallback (ArcRotateCamera default 자세에서 ±10% 이내). 성능 영향 0 (matrix invert 1회/frame, 모든 body 에 재사용)
- **`apps/web/scripts/browser-verify-379-lod.mjs` 신설 — LOD 회귀 가드 3종 시나리오 매트릭스** ([#379](https://github.com/coseo12/astro-simulator/issues/379)) — DoD-Guard-1 (architect ADR `20260502-379-fix-decision.md` §"Phase 1 구현 PR" §"회귀 가드"). 시나리오 A: T1 default 8 viewport (모바일 4 + 데스크톱 4) sun=high 비율 + 최대 low ratio 검증 / 시나리오 B: T3 body focus (지구/화성) → focus body=high 보장 / 시나리오 C: asteroid sub-pixel low billboard 유지 (high 회귀 임계 ≤ 5). CLI: `pnpm verify:379-lod` (또는 `pnpm --filter @astro-simulator/web verify:379-lod`). baseline `apps/web/scripts/__baselines__/lod-379.json` 박제 + sun=high 비율 5%p 하락 시 회귀 검출. dev 빌드 (`__solarScene.getLodInfo()` 의존, #388 API)
- **`screenCoverageRadius` 시그니처 확장 — `cameraUpWorld?: Vec3Double` 추가 (선택)** ([#379](https://github.com/coseo12/astro-simulator/issues/379)) — backward compat (부재 시 `[0, 1, 0]` fallback). 단위 테스트 `packages/core/src/render/lod.test.ts` 의 5종 신규 케이스 + #379 forensic SSoT 5종 케이스 추가 (총 lod 테스트 38 → 46). cross-validate 이견 수용 #1 (엣지 케이스: frustum 경계 / sub-pixel asteroid / 카메라 내부) 박제

- **LOD dev overlay 상세 모드 (`?lodOverlay=1`)** ([#388](https://github.com/coseo12/astro-simulator/issues/388)) — body 별 LOD level + screenCoverage(px) + pxDiameter(px) + cameraDistance(km) 4 column 표 박제. 색상 코딩 (high=emerald / mid=amber / low=rose) + `data-lod-level` 속성. 기존 `?debug=draw-calls` 집계 모드는 backwards-compat 으로 유지 (단일 행 H/M/L 분포 박제). **prod bundle DCE 검증**: `LodDevOverlay` 함수 진입 즉시 `if (production) return null` 으로 본체 (`useState`/`useEffect`/JSX) 전체 제거 — `LodDevOverlayImpl` 분리로 hooks 의존 그래프와 prod 분기 격리. `grep -rln "lod-row-\|waiting for first frame" .next/static/` 0 매치 실측. 발화점: PR [#387](https://github.com/coseo12/astro-simulator/pull/387) ([#379] architect 단계) Gemini cross-validate 고유 발견 분리 — `docs/decisions/20260502-379-fix-decision.md` Phase 1 (screenCoverage 식 정정) 디버깅 도구
- **`SolarSystemSceneHandles.getLodInfo()` API 추가** ([#388](https://github.com/coseo12/astro-simulator/issues/388)) — `runLodPass` 매 프레임 갱신. 반환 시그니처 `readonly LodBodyInfo[]` (`id` / `level` / `screenCoverage` / `pxDiameter` / `cameraDistanceMeters`). 내부 버퍼 in-place mutate (재할당 회피, 매 프레임 24+ body × 5 필드 = 120+ assignment). 호출자는 read-only 계약 — mutate 금지. PR #387 reviewer non-blocking #1 (forensic `actualCameraRadius` 일률 35 cell 별 변별) + #2 (`bodyInfo.pixelDiameter` null) 직접 해소 가능 — overlay 가 raw 박제하면 forensic 측정 시 cell 별 차이가 드러남

### Notes

- **LOD overlay tree-shaking 검증 절차** — prod build 후 `grep -rln "lod-row-\|waiting for first frame\|isDetailedOverlayEnabled" apps/web/.next/static/chunks/` 가 0 매치여야 한다. `LodDevOverlay` 의 prod early-return 패턴은 컴포넌트 본체 분리 (`LodDevOverlayImpl`) 가 필수 — 단일 함수 내 hooks 와 prod 분기 공존 시 minifier 가 보수적 회피하여 hooks 의존 그래프 보존, dead branch JSX 가 잔존 (실측 1차 시도에서 발견)
- **`getLodInfo` core API 는 prod bundle 에 포함됨** — `LodBodyInfo` 인터페이스 + `runLodPass` 의 buffer in-place mutation (~30 라인) 은 packages/core scene 정상 API 의 일부로 prod 에서도 호출 가능. dev overlay 만 prod 에서 호출하지 않을 뿐. bundle size 영향 약 +1KB minified (버퍼 mutation 코드만, JSX 0)
- **`__solarScene.getLodInfo` 후방 호환** — 구버전 scene (P11-B v0.13.0~v0.15.0) 에는 `getLodInfo` 부재. dev overlay 가 optional chaining 으로 가드 — `getLodInfo` 미존재 시 `waiting for first frame` 메시지 유지 (#388 vitest 회귀 가드)

> **R3 D-T2 후속 — body 비율 자연화 (2026-05-01, #373 라운드 2 적극 재조정)** — 어제 (2026-04-30) D-T2 사용자 검증 5건 회귀 발견 중 **#1 (sun ↔ mercury / venus 비율 미해소)** 만 본 PR 범위. #378/#379/#380 (회귀 #2~#4) 은 별도 이슈 분리. 선행 PR [#377](https://github.com/coseo12/astro-simulator/pull/377) (옵션 c 보수값 mercury=2000 / venus=1500) D-T2 미통과 → CLOSED → 라운드 2 적극값 (임계 비례 역산 mercury=900 / venus=650) 채택. forensic ADR [`docs/decisions/20260430-r3-followup-body-proportion.md`](docs/decisions/20260430-r3-followup-body-proportion.md) Amendment 2026-05-01 (라운드 2) SSoT.

### Behavior Changes

- **수성/금성/태양 시각 비율 자연화 — 라운드 2 적극 재조정** ([#373](https://github.com/coseo12/astro-simulator/issues/373)) — 박제값 갱신 3건:
  - `BODY_SCALE.sun` 75 → **50** (R1 amendment, 옵션 a) — sun 자체 자연 크기화. 1280×720 brightRatio 4.19% → ~1.86% (R1 ADR Amendment 2026-05-01 §"sunScale 50 점유율 산출")
  - `BODY_SCALE.mercury` 8500 → **900** (R2 amendment 라운드 2, 옵션 c 적극 재조정) — sun 대비 px 비 38% → ~6%. 임계 비례 역산 `2000 × 6/13.5 ≈ 889`
  - `BODY_SCALE.venus` 4000 → **650** (R3 amendment 라운드 2, 옵션 c 적극 재조정) — sun 대비 px 비 45% → ~11%. 임계 비례 역산 `1500 × 11/25.5 ≈ 647`
- **r1-guard `--measure-px-ratio` flag 신설** — body 별 px diameter + sun 대비 px 비 + diskAreaRatio 자동 측정 + 임계 가드. CLI: `pnpm --filter @astro-simulator/web r1:guard:px-ratio` (또는 `node scripts/r1-ui-regression-guard.mjs --measure-px-ratio`). 임계: mercury sun 대비 ≤ 6% / venus sun 대비 ≤ 11% / 모바일 누적 disk area ≤ 25% (sun + mercury + venus). dev 빌드 (`window.__solarScene` 노출) 의존 + `?gpu=a` 강제 진입 (volt #77 false positive 가드). ADR [`20260430-r3-followup-body-proportion.md`](docs/decisions/20260430-r3-followup-body-proportion.md) §결정 2 §5 + [`20260425-r1-ui-pixel-diff-guard.md`](docs/decisions/20260425-r1-ui-pixel-diff-guard.md) Amendment 2026-05-01 §결정 2

### Notes

- **D-T2 사용자 검증 단계 분리** — 본 PR 은 박제값 갱신 + r1-guard `--measure-px-ratio` 신설 + 단위 테스트/빌드/lint PASS 까지. **실 Chrome GUI 수동 검증** 은 qa 단계 또는 사용자 D-T2 직접 (volt #77 — headless 검증만으로 종결 금지)
- **R3 baseline 갱신 별도 후속 PR** — sunScale 50 변경은 캔버스 외 4 영역 (top-nav / shortcut-bar / hud-top-right / hud-bottom-right) 에 직접 영향 0 (canvas 영역 비교 제외 박제, R1 UI pixel-diff guard ADR §결정 4) 이지만 sun mesh 가 shortcut-bar 의 하이라이트 색상에 indirect 영향 가능성 있음. PR CI r1-guard step 미스매치 발견 시 `r1:baseline-bootstrap` workflow_dispatch 1회 실행 → auto PR 생성 별도 머지 (R2 #365 / R3 패턴)
- **회귀 분리 박제 (#378/#379/#380)** — D-T2 5건 회귀 중 비율 미해소 #1 만 본 PR 범위. #2~#4 (Roadmap v3 amendment §"회귀 분리" 박제) 는 별도 이슈로 직교 추적. PR 한 건당 회귀 한 가지만 책임지는 SRP 원칙 (volt #30 Phase 분리 릴리스 리듬 적용)
- **사후 재조정 경로 박제** — 라운드 2 박제값 (sun 50 / mercury 900 / venus 650) 은 임계 한계 정렬 적극값. forensic ADR §재검토 트리거 #1 라운드 2 보강에 후속 적극값 (mercury 700 / venus 500 — sun 대비 ~5% / ~9% 보수 여유) + 옵션 (e) log scaling 우선순위 high 승격 경로 박제. 측정 노이즈 ± 5% 마진 안에 가까스로 통과 시 사용자 평가 정성 (#1 비율 미해소만 해결, #2~#4 별도) 우선

### Docs

- **forensic ADR `20260430-r3-followup-body-proportion.md` Amendment 2026-05-01 (라운드 2)** ([#373](https://github.com/coseo12/astro-simulator/issues/373)) — §재검토 트리거 #1 라운드 2 발동 (선행 PR #377 옵션 c 보수값 D-T2 미통과 → 라운드 2 적극값 채택). 박제값 적극 재조정 + r1-guard 임계 보존 + Cross-validate 결과 (Gemini 2.5 Pro outcome=applied). architect 라운드 2 자체-검증 + 사용자 결정 박제
- **R1/R2/R3 ADR Amendment 2026-05-01 (라운드 2 동반 박제)** — sunScale 50 baseline 갱신 (R1) + mercuryScale 900 (R2 라운드 2) + venusScale 650 (R3 라운드 2). 라운드 1 amendment 본문 보존 (trace = "왜 라운드 1 에서 라운드 2 로 재조정했는가" forensic ADR §"임계 비례 역산" SSoT)
- **r1-ui-pixel-diff-guard ADR Amendment 2026-05-01 (라운드 2)** — sunScale 50 baseline 동반 갱신 (`--measure-sun-coverage` brightRatio 가드 1280×720 ≥ 3% → ≥ 0.5%, sunScale 50 통과 여유 마진) + `--measure-px-ratio` flag 신설 박제

> **R3 사이클 진입 (2026-04-29)** — Roadmap v3 "Incremental Body-by-Body Build" 세 번째 스프린트. 태양 + 수성 (R2) 위에 **금성** 점진 추가. R1+R2 박제 인프라 (BODY_SCALE 룩업 / FOCUS_BUTTONS / focus sync / rebuildOrbitLines / r2-focus-race-guard) 100% 재사용. `venus: 4000` BODY_SCALE 1줄 + `FOCUS_BUTTONS` 1줄 = R2 ADR `20260428-r2-mercury-visualization.md` §결과 Concrete Prediction "R3 추가 시 코드 변경 ≤ 2 라인" **첫 외부 검증 — PASS**. 핵심 6 파일 변경 0 (solar-system-scene.ts / tier.ts / lod.ts / sim-canvas.tsx / celestial-info-panel.tsx / camera-controller.ts). 추가로 R2 머지 시점부터 잠재한 **ambient 라이팅 약점 (#372)** 회귀 fix 동봉 — default 진입 시 행성 그림자측 인지 가능 임계 회복 (옵션 A 정책). PR [#369](https://github.com/coseo12/astro-simulator/pull/369) (R3 anchor + ADR + 시각화 통합 + #372 fix).

### Behavior Changes

- **금성 가시성 진입 — `BODY_SCALE.venus = 4000` 추가** ([#369](https://github.com/coseo12/astro-simulator/issues/369)) — viewport 점유율 1280×720 / 1920×1080 0.692% (DoD 0.5% + 마진 38%), 모바일 (375×667) 2.19%. mercury 시각비 117% (venus 가 mercury 보다 17% 큼 — 과학적 사실 정합), sun 시각비 46% (sun 의 약 1/2). 픽셀 직경 98.91px @ 1280×720. 모바일 누적 차단율 sun + mercury + venus = 16.39% (한계 25% 까지 8.6%p margin). ADR `20260429-r3-venus-visualization.md` §결정 1
- **shortcut bar 6→7 항목 (태양 / 수성 / 금성 / 지구 / 목성 / 해왕성 + reset)** — `FOCUS_BUTTONS` 배열에 mercury 다음 위치 (천체 거리 순) 에 `{ id: 'venus', label: '금성' }` 1줄 추가. R1+R2 패턴 100% 정합 — 키바인딩 무박제, aria 자연 라벨. shortcut-bar dimension 1280: 170→195 (+25px), 모바일 113→128 (+15px). axe 0 위반 (R1+R2 회귀 0)
- **금성 focus / info 패널 / 궤도 라인 자동 일반화** — `solar-system.json` venus 데이터 (이미 박제) + R1 syncFocusToScene helper / CelestialInfoPanel / rebuildOrbitLines 자동 일반화. **핵심 6 파일 변경 0** — R2 ADR Concrete Prediction "R3 추가 시 ≤ 2 라인" 첫 외부 검증 성공. body mesh 머티리얼 default StandardMaterial (단색 — Q2=A 박제). 궤도 라인 색상 `Color3(0.25, 0.28, 0.4)` 일관 (R1+R2 박제값 보존)
- **r2-focus-race-guard body-agnostic 3-body 첫 검증** — 시나리오 1 (sun → mercury) / 2 (mercury → reset) PASS. 3-body 환경 (sun + mercury + venus) 에서 Babylon `Animation.CreateAndStartAnimation` 자동 폐기 동작 유효성 확증 (Q4=A — body id 무관 동일 property name 호출). 시나리오 3 (Animation tween spy) 환경 의존 skip (R2 일관)
- **회귀 #372 ambient 라이팅 강화 — default 진입 행성 그림자측 가시성 floor 회복** ([#372](https://github.com/coseo12/astro-simulator/issues/372)) — `solar-system-scene.ts` ambient.intensity 0.08 → 0.3 (3.75×) + groundColor (0.01, 0.01, 0.02) → (0.15, 0.15, 0.18) 중립 회색톤. R2 (#363, mercury 추가, v0.15.0) 머지 시점부터 잠재한 라이팅 약점이 R3 venus 추가로 가시화. sun.disableLighting=true 환경이라 sun 자체 영향 무 (1280×720 ?gpu=a 점유율 4.12% → 4.19%, +0.07%p — R1 박제 3.87% ± 0.5% 가드 안전). 행성 mesh sun-반대측 평균 luminance 인지 가능 임계 회복. **volt #77 직접 입증** — headless 는 GPU adapter 부재로 tier-c 자동 진입 → sun 1px 점 → 자동화 가드 8/8 PASS 였던 false positive 사례. AMBIENT_INTENSITY / AMBIENT_GROUND_COLOR_RGB 상수 export + `solar-system-scene.test.ts` 회귀 가드 4건 (intensity ≥ 0.25 floor / groundColor 평균 ≥ 0.05 floor / 박제값 정확 일치 2건) 박제 — 임의 하향 조정 시 단위 테스트 차단

### Notes

- **R3 baseline 갱신은 별도 후속 PR 분리 (R2 #365 패턴)** — 본 PR 머지 후 r1-guard step 5 가 의도된 FAIL (shortcut-bar 6→7 dimension 변동 + top-nav DOM nesting 부수효과). Linux CI `r1:baseline-bootstrap` workflow_dispatch 1회 실행 → auto PR 생성 → 갱신 PR 별도 머지. macOS local `--update` 는 폰트 false positive 박제 위험으로 차단 (Amendment v3 §결정 1)
- **D-T2 실 Chrome GUI 수동 검증 사용자 단계 분리** — headless 검증만으로 종결 금지 (volt #77 false positive). 본 PR 은 reviewer/qa 통과 후 사용자가 sun ↔ mercury ↔ venus focus 빠른 전환 + 모바일 (375×667) 인지 가능성 + venus info 패널 ("× 4000 과장 중" + 자전 주기 retrograde 표기) 수동 검증
- **R3 ADR Gemini cross-validate 합의 — viewport-aware scaling 도입 결정 시점 R4 로 박제** — Gemini 권고 1 수용 ("R5 진입 전 검토" → "R4 ADR 박제 시점에 명시적 결정 박제 의무"). 능동적 기술 부채 관리 — 모바일 누적 차단율 한계 25% 가 R5 (mars) 진입 시 도달 위험 → R4 architect 가 도입 / 미도입 / 부분 도입 (모바일 only) 3 후보 비교 의무. R3 ADR §위험·미해결 + §재검토 트리거 #3 박제
- **#372 후속 — planet 가시성 headless 가드 (`?gpu=a` 매트릭스) 후속 이슈 분리 후보** — 본 PR 은 ambient 상수 SSoT 단위 테스트만 박제 (architect 권고 1 수용). headless 환경에서 `?gpu=a` 강제 + mercury / venus mesh 영역 sun-반대측 평균 luminance 임계 측정 자동화는 별도 이슈 (#373 후보 — 메인 사용자 의사 확인 후 분리). volt #77 매트릭스 자동화 후속 이슈도 동일 분리 후보 (R3 ADR §재검토 트리거 #3 후속)

### Docs

- **ADR `20260429-r3-venus-visualization.md` 신규** ([#369](https://github.com/coseo12/astro-simulator/issues/369)) — 610 라인. R3 시각화 결정 6건 통합 (venusScale=4000 / shortcut-bar venus 항목 / orbit 라인 무수정 / focus race body-agnostic / info 패널 자동 일반화 / 비-범위 보호 가드). 11 후보 × 3 viewport venusScale 산출표. R4 Concrete Prediction (earth 단독 = 1 라인 / earth + moon = 0~2 라인). Gemini cross-validate 합의 (6 영역 우수 + S급 ADR + viewport-aware scaling R4 결정 시점 구체화 권고 수용). 후속 발견 분리 (ADR Status workflow Provisional → Accepted 표준화 — priority:medium-low)

## [0.15.0] — 2026-04-28

> **R2 사이클 (2026-04-28)** — Roadmap v3 "Incremental Body-by-Body Build" 두 번째 스프린트. 태양 단독 visible (R1, v0.14.0) 위에 **수성** 점진 추가. R1 박제 인프라 (BODY_SCALE 룩업 / FOCUS_BUTTONS / focus sync / rebuildOrbitLines / r1-guard 매트릭스) 100% 재사용. `mercury: 8500` BODY_SCALE 1줄 + `FOCUS_BUTTONS` 1줄 = R1 §결과 Concrete Prediction "R2 코드 변경 ≤ 3 라인" 자연 검증. PR [#363](https://github.com/coseo12/astro-simulator/pull/363) (R2 anchor) + [#365](https://github.com/coseo12/astro-simulator/pull/365) (baseline 갱신 + Amendment v4 정정) + [#366](https://github.com/coseo12/astro-simulator/pull/366) (agent-browser 가드 — volt #79). 누락된 release entry 박제는 [#373](https://github.com/coseo12/astro-simulator/issues/373) PR 흐름에서 회수 (release version bump 가드 통과 의무).

### Behavior Changes

- **수성 가시성 진입 — `BODY_SCALE.mercury = 8500` 추가** ([#361](https://github.com/coseo12/astro-simulator/issues/361)) — viewport 점유율 1280×720 / 1920×1080 0.612% (DoD 0.5% + 마진 22%), 모바일 (375×667) 1.94%. sun 시각비 약 40% (sun 의 1/2.5 — "수성 < 태양" 자연스러움). 픽셀 직경 84.76px @ 1280×720. ADR `20260428-r2-mercury-visualization.md` §결정 1
- **shortcut bar 5 항목 (태양 / 수성 / 지구 / 목성 / 해왕성)** — `FOCUS_BUTTONS` 배열에 sun 다음 위치 (천체 거리 순) 에 `{ id: 'mercury', label: '수성' }` 1줄 추가. R1 패턴 100% 정합 — 키바인딩 무박제, aria 자연 라벨. axe 0 위반 (R1 회귀 0)
- **수성 focus / info 패널 자동 일반화** — `solar-system.json` mercury 데이터 (이미 박제) + R1 syncFocusToScene helper / CelestialInfoPanel 자동 일반화. 코드 변경 0
- **R2 focus race condition 회귀 가드 신설** — `apps/web/scripts/r2-focus-race-guard.mjs` 3 시나리오 (sun→mercury / mercury→reset / Animation tween 카운트). 단일 body (sun) 환경이라 R1 단독에서 검증 불가했던 다중 body race scenario 처음 도입. ADR §결정 4 의 "Babylon 자동 폐기 신뢰" 회귀 가드. 실측 보정: focusOn 의 property name 은 `cam-target` / `cam-radius`, reset 의 property name 은 `cam-reset-target` / `cam-reset-radius` (camera-controller.ts:91) — 자동 폐기는 focusOn → focusOn 케이스에 한정. focusOn → reset 은 다른 property라 lerp 병행이지만 시작점이 현재 카메라 위치라 자연스러운 보간
- **agent-browser Chrome cleanup 가드 도입** (volt [#79](https://github.com/coseo12/volt/issues/79)) — `.claude/agents/qa.md` 마무리 절차 + CLAUDE.md "프로젝트 고유 보강 교훈" §"sub-agent 이탈의 프로세스 레벨 확장" 블록에 agent-browser 좀비 정리 의무 박제. **sub-agent 루틴**: `browser-test` 스킬로 agent-browser 사용 후 반환 직전 `pgrep -f "agent-browser-chrome-" >/dev/null && pkill -TERM/KILL -f "agent-browser-chrome-"` 실행. **메인 루틴**: sub-agent 복귀 직후 `pgrep -af "agent-browser-chrome-"` 검사 + 발견 시 정리. 사용자 본 Chrome 영향 0 (식별자 `agent-browser-chrome-<UUID>` user-data-dir). **본 세션 (2026-04-28) 실측**: 6 세션 / 52 좀비 / 3일치 누적 → 800%+ CPU. agent-browser 도구 자체 cleanup 이 정상 case 작동하나 sub-agent 비정상 종료 시 lineage 끊긴 좀비 잔존 — `spawned_bg_pids` SSoT 가 직접 spawn PID 만 커버하므로 도구 wrapper child process 별도 가드 (volt #46/#52 의 agent-browser 변형)

### Notes

- **R2 baseline 갱신 + Amendment v4 Concrete Prediction 정정 (R2 후속 사이클, 2026-04-28)** — PR [#363](https://github.com/coseo12/astro-simulator/pull/363) 머지 후 발견된 r1-guard step 5 의도된 FAIL 해소. shortcut-bar 3 viewport (의도 변경 = mercury 5번째 버튼) **+** top-nav 3 viewport (DOM nesting 부수효과 = `<header data-r1-region="top-nav">` 내부에 shortcut-bar 가 child) = **6 PNG 동시 갱신**. hud-top-right / hud-bottom-right 6장은 변경 0 (D-R2 R1 회귀 0 검증). Linux CI `r1:baseline-bootstrap` workflow_dispatch 산출본 사용 (macOS local `--update` 는 폰트 false positive 박제 위험으로 차단)
- **Amendment v4 Concrete Prediction 정정** — 원안 "shortcut-bar 3장만 변경, 다른 9장 변경 0" 이 DOM nesting 가정 누락. 정정: "shortcut-bar 3장 + top-nav 3장 = 6장 동시 갱신 (R3~R10 SSoT)". §위험·미해결 에 nesting 부수효과 박제 + §재검토 트리거 #5 (DOM nesting 가정 무효화) 추가
- **shortcut-bar baseline 갱신은 별도 commit 또는 후속 PR 분리** — Amendment v4 §결정 2 5단계 적용. macOS local 환경에서 `r1-ui-regression-guard.mjs --update` 실행 시 의도 외 영역 (top-nav / hud-top-right / hud-bottom-right) 도 폰트 차이로 갱신 → Linux CI 환경에서만 정합. 본 PR 의 머지 전 reviewer 단계에서 CI green 확인 후 baseline 갱신 절차 별도 진행
- **BODY_SCALE.mercury default 1.0 fallback 테스트 제거** — `body-scale.test.ts` 의 "미정의 body default 1.0" 테스트에서 mercury 사례 삭제 + 다른 body (earth / jupiter / unknown) 로 일반화. R3+ 추가 시 동일 패턴 갱신 의무
- **r2-focus-race-guard.mjs 의 시나리오 3 (Animation tween spy) 환경 의존 skip** — Babylon 글로벌 (`window.BABYLON`) 미노출 환경 (현재 ESM module 빌드) 에서는 spy 설치 불가, soft skip 처리. 시나리오 1, 2 가 race 회귀 가드 본질 (store sync + camera 변화) 보장
- **dev 서버 사용 의무** — r2-focus-race-guard 는 `__simCore` / `__solarScene` 글로벌 (sim-canvas.tsx:252 NODE_ENV 가드) 의존 → `pnpm dev` 환경 필요. p329-qa-focus-lod-guard 와 동일 정책

### Docs

- **ADR `20260428-r2-mercury-visualization.md` 신규** ([#361](https://github.com/coseo12/astro-simulator/issues/361)) — 632 라인. R2 시각화 결정 5건 통합 (mercuryScale=8500 / shortcut-bar / orbit 라인 / focus race / info 패널). 11 후보 × 3 viewport mercuryScale 산출표. R3 Concrete Prediction (코드 변경 ≤ 2 라인 + 단서 조항: venus 머티리얼 분기 예외). Gemini cross-validate 합의 (Q1/Q4 산출 정합 / Q3 R3 단서 조항 추가) + 후속 이슈 #362 (R1 sun 1920×1080 점유율 정정)
- **ADR `20260425-r1-ui-pixel-diff-guard.md` Amendment v4** ([#357](https://github.com/coseo12/astro-simulator/issues/357), [#361](https://github.com/coseo12/astro-simulator/issues/361)) — 192 라인. sentinel 정책 amendment + shortcut-bar baseline 갱신 절차 (Q3=B 통합). 후보 (d) 수동 검토 분리 채택 + R2 직접 적용 5단계 + R3~R10 패턴 SSoT
- **ADR `20260425-r1-ui-pixel-diff-guard.md` Amendment v4 Concrete Prediction 정정** (R2 후속 #361, 2026-04-28) — §결과·재검토 조건 §"Concrete Prediction (R2 PR 자동 재현) — 2026-04-28 정정" + §위험·미해결 nesting 부수효과 bullet + §재검토 트리거 #5 추가. 원안 "shortcut-bar 3장만 변경" → 정정 "shortcut-bar 3장 + top-nav 3장 = 6장 동시 갱신". DOM nesting (top-bar 가 shortcut-bar 의 부모) 자연 부수효과 박제. R3~R10 SSoT

## [0.14.0] — 2026-04-26

> **R1 후속 F-2 (#348) — ci.yml r1-guard step 통합 + Linux baseline 정합 + ADR Amendment v3** — v0.13.1 부트스트래핑 인프라 위에 chicken-and-egg 해소. 모든 PR check 의 `detect-and-test` job 이 R1 UI 회귀 가드를 자동 trigger. PR [#347](https://github.com/coseo12/astro-simulator/pull/347)/[#349](https://github.com/coseo12/astro-simulator/pull/349)/[#350](https://github.com/coseo12/astro-simulator/pull/350)/[#351](https://github.com/coseo12/astro-simulator/pull/351)/[#354](https://github.com/coseo12/astro-simulator/pull/354)/[#355](https://github.com/coseo12/astro-simulator/pull/355) 6 PR 머지 + workflow_dispatch 1회 실증 + 메타 가드 실증 1차 (#356 close, #357 분리).

### Behavior Changes

- **ci.yml `detect-and-test` job 에 R1 UI 회귀 가드 step 5개 통합** ([#348](https://github.com/coseo12/astro-simulator/issues/348), PR [#355](https://github.com/coseo12/astro-simulator/pull/355) `39c896f`) — `verify:no-scientific-grep` 직후에 (1) Rust 툴체인 (`dtolnay/rust-toolchain@stable`, 1.94.1, wasm32-unknown-unknown) (2) Rust 빌드 캐시 (`Swatinem/rust-cache@v2`, packages/physics-wasm) (3) wasm-pack 설치 (`taiki-e/install-action@v2 wasm-pack@0.14.0`) (4) R1 UI 회귀 가드 (Playwright Chromium + `pnpm build` + next start -p 3001 + `r1-ui-regression-guard.mjs`) (5) diff 이미지 업로드 (`actions/upload-artifact@v4`, retention 7 days) — 5개 step 추가. 모든 PR 의 detect-and-test 시간이 약 +100s 증가 (실측 2m10s, ADR §위험 #1 임계 8분의 27%). `if:` 가드: `pnpm-lock.yaml` + `apps/web/scripts/r1-ui-regression-guard.mjs` + `rust-toolchain.toml` + `Cargo.toml` 존재 시에만 trigger. 4 영역 (top-nav / shortcut-bar / hud-top-right / hud-bottom-right) × 3 viewport (1280×720 / 1920×1080 / 375×667) = 12 영역 mismatch ≤ 0.5% 검증. 실패 시 diff PNG artifact 자동 업로드. ADR `20260425-r1-ui-pixel-diff-guard.md` §Amendment v3 (PR [#354](https://github.com/coseo12/astro-simulator/pull/354), commit `9481c9d`)
- **R1 baseline 12 PNG: macOS → Linux CI 캡처본 전환** ([#337](https://github.com/coseo12/astro-simulator/issues/337), PR [#351](https://github.com/coseo12/astro-simulator/pull/351) `d9ae9c0`) — `r1:baseline-bootstrap` workflow_dispatch run 24956759573 (2m1s 완주, ubuntu-latest 환경) 으로 자동 갱신. 로컬 macOS 검증 시 폰트 차이로 false positive 가능 — `SKIP_LOCAL=1` 또는 CI 결과 신뢰
- **메타 가드 실증 1차 — positive control 미확보 사실 박제** (PR [#356](https://github.com/coseo12/astro-simulator/pull/356) close, run 24957820142) — 1글자 텍스트 변경 ('태양' → '태앙') 의 shortcut-bar mismatch 가 0.114~0.197% 로 임계 0.5% 미만 → r1-guard PASS. r1-guard step 자체 작동은 logs (12 영역 × 3 viewport mismatch 측정 출력) 로 확인. sentinel 정책 + 임계값 재검토는 후속 [#357](https://github.com/coseo12/astro-simulator/issues/357) 로 분리. ADR §결과·재검토 조건 §메타 가드 실증 절차 박제

### Docs

- **ADR `20260425-r1-ui-pixel-diff-guard.md` Amendment v3** (PR [#354](https://github.com/coseo12/astro-simulator/pull/354) `9481c9d`) — 247 라인 신규. 핵심 결정 4건 박제: (1) wasm-pack 후보 A (단일 job 통합) (2) ci.yml r1-guard step 5개 형태 (`if:` 가드 + `pnpm build` 보존 + `exit $GUARD_EXIT`) (3) step 위치 `verify:no-scientific-grep` 직후 (4) 메타 가드 실증 절차 (1글자 변경 → fail → PR close — 본 사이클은 미확보, 분리). Concrete Prediction (ci.yml +35~40 / 다른 파일 0 / detect-and-test ≤ 8분) 박제. Gemini cross-validate "S급 ADR" 평가, BLOCK 0건. 후속 이슈 [#352](https://github.com/coseo12/astro-simulator/issues/352) (메타 가드 자동화 = 카나리아) / [#353](https://github.com/coseo12/astro-simulator/issues/353) (diff 이미지 inline 첨부) — 모두 priority:low 보류

### Notes

- **release PR `--merge` 방식** (gitflow 정책, ADR `20260419-release-merge-strategy.md`) — squash 시 develop 과 diverge 발생 + merge-back 강제. merge commit 으로 main tip 이 develop tip 을 직계 조상으로 포함하므로 fast-forward `git push origin main:develop` 만으로 동기화 완료
- **closed 이슈**: [#337](https://github.com/coseo12/astro-simulator/issues/337) (R1 후속 F-1 부트스트래핑) / [#348](https://github.com/coseo12/astro-simulator/issues/348) (R1 후속 F-2 통합)
- **잔여 phase:R1 OPEN 이슈**: #352 / #353 / #357 — 모두 후속 보류, 다음 R-Phase (R2 수성) 진입 가능 시점

## [0.13.1] — 2026-04-26

> **R1 후속 F-1 (#337) 부트스트래핑 인프라 단독 릴리스** — `r1:baseline-bootstrap` workflow 를 default branch (`main`) 에 도달시켜 `workflow_dispatch` 트리거 가능 상태로 진입 (volt #45 함정 회피). 행동 변화는 `SKIP_LOCAL=1` 1건 + 워크플로 신규. R1 후속 F-2 (#348) 는 본 릴리스 머지 + dispatch + baseline 갱신 PR 머지 후 별도 진입 (chicken-and-egg).

### Behavior Changes

- **R1 UI 회귀 가드 baseline CI Linux 전환 인프라 — 부트스트래핑 단계** ([#337](https://github.com/coseo12/astro-simulator/issues/337), PR [#347](https://github.com/coseo12/astro-simulator/pull/347)) — `.github/workflows/r1-baseline-bootstrap.yml` (`workflow_dispatch`, ubuntu-latest 캡처 + `peter-evans/create-pull-request`) 신규. `apps/web/scripts/r1-ui-regression-guard.mjs` 매개변수화: `BASE_URL` 환경변수 계약 헤더 주석 박제 + `SKIP_LOCAL=1 + macOS darwin` 즉시 PASS 종료 (6 라인 변경). `r1-ui-regions.mjs` 0 라인 변경. baseline 12 PNG 는 본 릴리스 머지 후 `r1:baseline-bootstrap` workflow_dispatch 1회 실행으로 자동 갱신 PR 생성 (Linux 캡처본 교체). 로컬 macOS 검증 시 폰트 차이 false positive 가능 — `SKIP_LOCAL=1` env var 또는 CI 결과 신뢰. **`ci.yml` 의 r1-guard step 통합은 본 PR 비-범위** — chicken-and-egg 회피 (Linux baseline 갱신 PR 머지 후 별도 후속 PR 에서 통합. `pnpm build` 가 detect-and-test job 에 없는 wasm-pack 의존을 끌어오는 추가 위험도 후속 PR 에서 wasm-pack 설치 step 분리로 해소). ADR `20260425-r1-ui-pixel-diff-guard.md` §Amendment 2026-04-26

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
