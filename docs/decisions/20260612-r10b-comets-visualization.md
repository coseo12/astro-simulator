# ADR: R10b 혜성 3 body 시각화 — 고이심률 궤도선 첫 사례 (e=0.967) + comet scale 5번째 그룹 (comet=5000) + negative 가상 ID 3분류 전환 + 로드맵 v3 최종 라운드

- **상태**: **Provisional** — cross-validate (agy) 결과 본문 통합 후 Accepted 전이 (#370 옵션 C 워크플로)
- **날짜**: 2026-06-12
- **결정자**: architect (R10b PM 합의 라운드 완료 2026-06-12 — Q1=A: **comet = 5000** (phobos/deimos 극소형 계보 — 5번째 scale 그룹, solar view sub-pixel billboard 의존 명시) / Q2=A: **halley 만 showInShortcutBar true 승격** (pluto 선례 동형 — encke/swift-tuttle 은 URL 진입) / Q3=A: **궤도선 64 seg 유지 + measurement-first** — chord 오차 사전 산출 박제 → 실측 → 꺾임 식별 시에만 동적 segments 구현 (코드 변경 가능성 사전 수용 — 조건부 축) / Q4: negative **가상 ID 전환 수용** (agy 1순위) + 비목표 꼬리·코마 ❌ / 비중력 효과 ❌ / 세차 ❌ + **v0.25.0 독립 릴리스**. **PM 합의 그대로 박제 — 재구조화 금지**)
- **관련**: [#664](https://github.com/coseo12/astro-simulator/issues/664) (R10b 본 스프린트), [`20260611-r10a-dwarf-planets-visualization.md`](20260611-r10a-dwarf-planets-visualization.md) (직전 라운드 SSoT — **§R10b 인계 7항목을 본 ADR 이 전부 소화**, §소화 매핑 참조), [`20260604-613-r-phase-metadata-ssot.md`](20260604-613-r-phase-metadata-ssot.md) (introducedInRPhase 데이터 SSoT), [`20260610-r9-neptune-triton-rings-visualization.md`](20260610-r9-neptune-triton-rings-visualization.md) (triton 역행 선례 — 본 라운드 역행 혜성 2 body 답습), [`20260528-r5-mars-visualization.md`](20260528-r5-mars-visualization.md) (phobos/deimos=5000 — comet scale 계보 원본 + §결정 6 px-ratio N/A 선례), [`docs/architecture/principles.md`](../architecture/principles.md) §1 Visual Fidelity (#541 의무 체크리스트 4항목), [`docs/phases/roadmap-v3-incremental.md`](../phases/roadmap-v3-incremental.md) (R10b = 로드맵 v3 최종 라운드 — §축 9)
- **교훈 적용**:
  - "수치 DoD 미달 시 측정 방법 검증 우선 / measurement-first" (volt [#32](https://github.com/coseo12/volt/issues/32)) — Q3 의 핵심 절차. chord 오차를 **D-T2 실측 전에 정량 사전 산출** (`scripts/_debug-664-chord-tmp.mjs`, 즉시 rm — volt #67 패턴): halley 원일점측 sagitta 가 eris 식별-불가 기준선의 **12.7배** (§축 3)
  - "이슈 전제 코드 전수 확인" (#624 NO-OP 교훈) — agy 1순위 권고 "가상 ID 전환" 을 분기 semantics 실측으로 정밀화: url-sync 는 **데이터 존재 검사가 allowlist 검사보다 선행** (url-sync.tsx:80~89) + info-panel 차단 분기는 `data.nameKo` 요구 (celestial-info-panel.tsx:75) — **가상 ID 단일 uniform 전환 불가**, 3분류 전환 설계 (§축 5)
  - "신규 데이터 ≠ 신규 코드" — R10a §Concrete Prediction 의 R10b 예측 ("CURRENT_R_PHASE=11 1줄 + BODY_SCALE 혜성 그룹 N줄 — 단 궤도선 코드 0 보장 불가") 재현 검증이 본 ADR 산출물. 궤도선 조건부 축은 사전 산출로 발동 확률 높음 판정 (§축 3)
  - "DoD PASS ≠ 제품 동작" (volt [#74](https://github.com/coseo12/volt/issues/74)) — R10a 와 달리 **pixel-diff baseline 변화 예상** (혜성 3 궤도선 근일점측이 default 진입 프레임 내 진입 — q 4.23~12.13 unit < radius 35, §축 8) 사전 등록

---

## 현재 유효 결정 요약 (Living ADR Executive Summary)

> **PM 정책 결정 확정 (2026-06-12, 권장안 일괄 승인 — 그대로 박제)**: Q1=A (comet=5000, 5번째 scale 그룹) / Q2=A (halley 만 bar 승격) / Q3=A (64 seg 유지 + measurement-first, 코드 변경 가능성 사전 수용) / Q4 (negative 가상 ID 전환 + 비목표 3종 + v0.25.0 독립 릴리스).

### 핵심 박제값 표

| 항목                                     | 박제값                                                                                                                                                       | 위치                                                          | 비고                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BODY_SCALE.{halley,encke,swift-tuttle}` | **전부 5000** (comet 그룹 — 5번째 scale 그룹, phobos/deimos 극소형 계보 답습)                                                                                | `apps/web/src/constants/body-scale.ts`                        | §축 1 — 그룹 내 사실 서열 (swift-tuttle 1.3e4 > halley 5.5e3 > encke 2.4e3) 자동 보존. 식 px: swift-tuttle 0.46 / halley 0.19 / encke 0.08 — **3 body 전부 sub-px, solar view billboard 4px fallback 전면 의존 (PM 명시)**. cross-group: max comet (swift-tuttle×5000=6.5e7) < min dwarf (ceres×800=3.7568e8, 비 0.173) |
| `CURRENT_R_PHASE`                        | **10 → 11** (1줄)                                                                                                                                            | `packages/core/src/scene/r-phase-allowlist.ts`                | §축 2 — #613 자동 생성 7번째 실전. allowlist 24 → **27 body** (전 데이터 소진 — 로드맵 v3 최종). 주석 "현재 박제" 24→27 갱신 + 로드맵 R10 행 완료 갱신 동반                                                                                                                                                             |
| halley `showInShortcutBar`               | **false → true** (데이터 1값) + `FOCUS_BUTTONS` `{ id: 'halley', label: '핼리 혜성' }` 1줄                                                                   | `solar-system.json` / `focus-quick-buttons.tsx`               | §축 6 — PM Q2. **후미 배치 (pluto 다음 15번째)** — "행성 거리순 블록 + 비-행성 카테고리 후미" 컨벤션 신규 박제 (halley a 17.8 AU 를 saturn/uranus 사이 삽입 기각). 15버튼 — 모바일 overflow-x-auto 흡수 (R8 12 / R9 13 / R10a 14 선례). encke/swift-tuttle false 유지                                                   |
| **궤도선 64 seg chord 오차 사전 산출**   | halley 원일점측 sagitta **0.692 AU = 프레임핏 13.97px** (eris 기준선 1.10px 의 **12.7배**) / swift-tuttle 13.45px / encke 4.99px                             | §축 3 표                                                      | **본 ADR 핵심 신규 축**. eris (e 0.436) 는 R10a D-T2 실측 꺾임 식별 불가 — 1.10px = 식별-불가 기준선. **조건부 축 발동 확률 높음 사전 판정** — 발동 시 fix 1순위: per-body 동적 segments (`e ≥ 0.6 → 256`, true-anomaly 유지 — 기존 24 body 영향 0)                                                                     |
| negative 케이스 전환                     | **3분류**: ① 순수 가드 → 가상 ID `nonexistent-body` / ② UI disabled·blocked 경로 → vi.mock 부분 mock / ③ E2E disabled 경로 → positive 전환 + 축 종료         | 단위 테스트 5+ 파일 / browser-verify                          | §축 5 — agy 1순위 권고의 분기-semantics 정밀화. 가상 ID 는 membership 가드 축만 승계 가능 (실측: url-sync 데이터 존재 검사 선행 / info-panel `data.nameKo` 요구 / tree 는 실데이터 렌더)                                                                                                                                |
| `PX_RATIO_THRESHOLDS.{3 body}`           | **전부 N/A (미박제)**                                                                                                                                        | r1-guard 미박제                                               | §축 7 — 식 px 0.08~0.46 sub-px, billboard 전면 의존 (phobos/deimos §결정 6 답습 8번째 그룹)                                                                                                                                                                                                                             |
| `FOCUS_BODIES` + r1-guard `targetIds`    | 24 → **27 body** (+halley, +encke, +swift-tuttle)                                                                                                            | `browser-verify-378-focus.mjs` / `r1-ui-regression-guard.mjs` | §축 8 — #598/#619 정적 매칭 가드. CURRENT_R_PHASE=11 동시 갱신 의무. 데이터 등장 순                                                                                                                                                                                                                                     |
| scenario preset                          | **halley-x10 zero-touch enabled 재현 (6번째)** — preset 코드/데이터 변경 0. **negative preset 후계 신설 기각** (가상 preset 의 production UI 노출 = UX 오염) | `scenario-presets.tsx`                                        | §축 5 ③ / §축 8 — disabled-path 는 단위 mock 이 승계                                                                                                                                                                                                                                                                    |
| pixel-diff baseline                      | **변화 예상 — `--update` + PR 스크린샷 박제 의무** (R10a "변화 0" 와 다름)                                                                                   | r1-guard                                                      | §축 8 — 혜성 궤도선 근일점측 q 7.36 (halley) / 4.23 (encke) / 12.13 (swift-tuttle) unit 이 default 프레임 (radius 35) 내 진입                                                                                                                                                                                           |
| 모바일 diskArea baseline                 | **R10a 재실측 16.818% 기준** (구버전 16.82% 표기 아닌 PR #661 실측값) ≤ 25%                                                                                  | r1-guard                                                      | §점유율 — 혜성 3 billboard 보수 상한 +0.02%p                                                                                                                                                                                                                                                                            |
| 역행 혜성 2 body                         | halley i=162.26° / swift-tuttle 113.45° (ecliptic > 90°) — **코드 0, D-T2 사전 등록**                                                                        | —                                                             | §축 4 — R9 triton (129.14°) 선례 답습. "공전 방향 반대 = 사실 정합". 데이터 기박제 (epoch/frame 검증 완료 — 변경 0)                                                                                                                                                                                                     |
| time-reversal 테스트                     | **변경 0 (제외 불필요 — 재확인만)**                                                                                                                          | `time-reversal.test.ts`                                       | §축 8 — 혜성 3 은 2026-04-21 데이터 박제 이후 이미 적분 + suite green (R10a 실측). halley e=0.967 고이심률 적분 신규 위험 낮음 — dev `--include-ignored` 전체 green 재확인                                                                                                                                              |
| R-Phase 라운드 종료                      | **R10b = 로드맵 v3 최종 라운드 (전 데이터 소진)** — 로드맵 문서 상태 갱신 + **R10 통합 회고 의무** (R10b 구현 머지 후 별도 docs PR)                          | `roadmap-v3-incremental.md` / `docs/retrospectives/`          | §축 9                                                                                                                                                                                                                                                                                                                   |

### 핵심 결정 요약

1. **comet=5000 — 5번째 scale 그룹, phobos/deimos 극소형 계보 답습 (PM Q1=A)** (§축 1): 그룹 단일값 5000 으로 그룹 내 사실 서열 자동 보존. mesh 는 focus 시 의미 (R5 위성 선례 검증 경로), solar view 는 billboard 의존 명시. **5000 그룹 통합 서열 가드** (comet + phobos/deimos — 동일 scale 이므로 visual 서열 = 사실 radius 서열): swift-tuttle > phobos > deimos > halley > encke
2. **halley 64-seg chord 오차 사전 산출 = 조건부 축 발동 확률 높음** (§축 3): 원일점측 sagitta 프레임핏 13.97px — eris 식별-불가 실측 기준선 (1.10px) 의 12.7배. D-T2 실측에서 꺾임 식별 시 **per-body 동적 segments (`e ≥ 0.6 → 256`, true-anomaly 등간격 유지)** 가 1순위 fix — 기존 24 body vertex 불변 (pixel-diff 기존 body 무영향) + 근일점 자동 밀집 보존. equal-E 재매개변수화 (전 body 0.43px) 는 근일점측 희소화 + 전 27 body vertex 이동 비용으로 2순위
3. **negative 가상 ID 3분류 전환** (§축 5): agy 1순위 권고를 분기 semantics 실측으로 정밀화 — ① 순수 membership 가드 (isRPhaseFocusable / simulation-core focusOn / getBodyScale default) 는 `nonexistent-body` 가상 ID ② UI disabled/blocked 경로 (tree / info-panel / preset / url-sync R-Phase 분기) 는 실데이터 body + vi.mock 부분 mock ③ E2E disabled 경로는 positive 전환 + 축 종료 (production 도달 불가 경로 — 단위 mock 승계)
4. **shortcut bar halley 승격 + 비-행성 후미 배치 컨벤션** (§축 6): 거리순 엄격 삽입 (saturn/uranus 사이) 기각 — 행성 8 거리순 블록 보존 + 비-행성 (pluto → halley) 카테고리 후미. 15버튼
5. **px-ratio 전부 N/A + pixel-diff baseline 변화 예상** (§축 7/§축 8): 3 body sub-px billboard 전면 의존 (8번째 그룹). 단 R10a 와 달리 궤도선이 default 프레임 관통 — baseline `--update` 의무 사전 등록
6. **로드맵 v3 최종 라운드 종결 절차** (§축 9): allowlist 27 = 전 데이터 소진. 로드맵 상태 갱신 + R10 통합 회고 (R10a+R10b) 의무 — R10b 구현 머지 후 v0.25.0 release prep 전 별도 docs PR

### 비-범위 (R10b — PM Q4)

- 혜성 꼬리 / 코마 렌더링 ❌ (R10 PM Q4 합의 답습 — 점광원 + 궤도선만)
- 비중력 효과 (non-gravitational forces — outgassing 추력) ❌ — osculating elements Kepler 전파 유지
- 궤도 세차 ❌ — 전 body 동일 정책
- 기존 24 body 실측 데이터 변경 ❌ — halley `showInShortcutBar` 는 프로젝트 메타데이터 (실측 천문값 아님 — R10a §축 2 논리 동형)
- 본체 mesh 자전/텍스처 ❌ / halley 비구형 (15×8×8 km) 표현 ❌ — volumetric mean 구체 근사 (`$radiusComment` 기존재)
- LOD 시스템 변경 ❌ (R4 Amendment 3 보존) / 클릭 raycast 선택 ❌ (#624)
- 위성 데이터 확장 ❌ — satellite N≥5 단일 룩업 한계는 위성 확장 라운드로 재이월 (R10a 인계 #4 → 후속, §축 9)
- 신규 negative preset ❌ (§축 5 ③ — 가상 preset production UI 노출 기각)

---

## 배경

### R10a ADR §R10b 인계 7항목 — 본 ADR 소화 매핑

1. **고이심률 궤도선 실측 검증 의무 (코드 0 보장 불가 축)** → §축 3 (chord 오차 사전 산출 + 조건부 fix 사전 설계). Kepler 전파 수치 안정성은 기적분 green (jpl-validation.test.ts:157 halley 주기 75.32yr 검증 기존재) — §축 8 재확인만
2. **혜성 scale 5번째 그룹 필요** → §축 1 (comet=5000, PM Q1=A)
3. **allowlist negative 구조 소멸 — 가상 ID 1순위 (agy)** → §축 5 (3분류 전환 — 가상 ID 의 적용 한계 실측 정밀화)
4. **위성 0 — satellite 단일 룩업 한계 재이월** → 비-범위 + §축 9 (로드맵 v3 종료 후 후속 라운드로)
5. **모바일 diskArea baseline = R10a 재실측값** → **16.818%** (PR [#661](https://github.com/coseo12/astro-simulator/pull/661) 실측 — 구버전 16.82% 금지) — §점유율
6. **scenario preset negative — halley-x10 zero-touch enabled 재현** → §축 8 (6번째 재현 + negative preset 후계는 §축 5 ③ 에서 축 종료 결정)
7. **eris 줌아웃 도달 radius 실측값 재사용** → **2,353 unit** (R10a PR #661 — orbit-lines bounding box 8 corner NDC all-in 이분 탐색, 보수 상한) — §축 3 비례 환산: 혜성 3 전부 eris 실측 도달치 미만 (구조 보장)

### 현재 baseline 실측 (2026-06-12 develop tip = `a625066`)

- `BODY_SCALE`: 24 body 박제 (4그룹 체계: inner 700~800 / gas giant 48 / ice giant 250 / dwarf 800 + 위성 개별) — **혜성 3 미정의 (default 1.0)**
- `CURRENT_R_PHASE = 10` / allowlist 24 body. `filterBodiesByPhase(bodies, 11)` 시뮬레이션 테스트 (27 body) 기존재 — r-phase-allowlist.test.ts:149
- `solar-system.json`: 혜성 3 전부 기박제 (2026-04-21 lastVerified) — introducedInRPhase=11 (R10a 재박제 완료) / showInShortcutBar=false / orbit 6 요소 완비 (halley: Keller et al. 1987 + JPL SBDB / encke: JPL SBDB / swift-tuttle: Jorda & Licandro 2003 + JPL SBDB). **R10b 신규 body 데이터 0 — 메타 1값 (halley bar) 만**
- **선행 인프라 실측**: `tierFromFocus` `'comet'` 분기 → T3 body (tier.ts) / `LOD_BODY_THRESHOLDS` `'comet'` 항목 (radius-multiple ×3, lod-body-thresholds.ts) — **focus/LOD 코드 0**. `sampleOrbitPoints` 진근점각 등간격 64 seg (solar-system-scene.ts:1974~2006) — 3 body parentId=sun → planet batch. 물리: N-body 엔진 전 27 body 적분 중 (allowlist 는 focus/궤도선 게이트만)
- **simulation-core focusOn**: allowlist 검사가 body 데이터 조회보다 선행 (simulation-core.ts:225 — `isRPhaseFocusable` 즉시 차단) → 가상 ID negative 전환 가능 (§축 5 ①)
- **url-sync 분기 순서**: ① `validIds` (데이터 존재) → "알 수 없는 body id" warn / ② `isRPhaseFocusable` → "R-Phase 미진입" warn (url-sync.tsx:80~99) — **가상 ID 는 ① 분기로 빠짐** (§축 5 ② 의 실측 근거)
- negative 케이스 현재 배치 (R10a 에서 pluto → halley 교체): URL 4-A `?focus=halley` / tree-halley disabled (5-B·5-C) / preset 6-H halley-x10 disabled / `RPHASE_TREE_EXPECTED_DISABLED=['halley']` / url-sync·celestial-tree·celestial-info-panel·body-scale·scenario-presets 단위 테스트 / simulation-core-r-phase-allowlist-guard.test (focusOn halley 차단 3건) / r-phase-allowlist.test (`isRPhaseFocusable('halley')===false`)
- legacy `scripts/browser-verify-comets.mjs` (#98, R-Phase 도입 전): `?focus=` 3 body 진입 검증 — R10b positive 와 정합하나 baseUrl 3001 구식. dev 재량 갱신/제거 (비차단 — #598 가드 무관, FOCUS_BODIES 자동 확장이 본선 커버)
- `FOCUS_BUTTONS`: 14 id (sun~pluto) — halley 부재. #617 가드 3종이 showInShortcutBar 파생 정합 차단 중

### 데이터 사실 비율 (기박제 데이터 — 변경 없음)

| body         | radius (m) | a (AU) | e           | i (deg)           | q (AU / unit)    | Q (AU / unit) | 비고                                                                                         |
| ------------ | ---------- | ------ | ----------- | ----------------- | ---------------- | ------------- | -------------------------------------------------------------------------------------------- |
| halley       | 5.5e3      | 17.834 | **0.96714** | **162.26 (역행)** | 0.586 / 7.36     | 35.08 / 440.9 | 그룹 최대 e — 궤도선 조건부 축 (§축 3). volumetric mean (15×8×8 km, `$radiusComment` 기존재) |
| encke        | 2.4e3      | 2.2152 | 0.848       | 11.78             | **0.337 / 4.23** | 4.09 / 51.4   | 그룹 최소 — 근일점 sun mesh 간섭 실측 확인 항목 (§축 3)                                      |
| swift-tuttle | 1.3e4      | 26.09  | 0.963       | **113.45 (역행)** | 0.965 / 12.13    | 51.21 / 643.6 | 그룹 최대 radius/Q                                                                           |

- 사실 radius 서열: **swift-tuttle (1.3e4) > halley (5.5e3) > encke (2.4e3)** — 그룹 단일 scale 로 자동 보존
- 역행 2 body: halley 162.26° / swift-tuttle 113.45° (ecliptic 기준 i > 90° = 역행). R9 triton (129.14°) 선례 — 기존 회전 변환 동일 경로, 코드 0
- 5000 scale 그룹 통합 (comet + phobos 1.108e4 + deimos 6.27e3): 사실 radius 서열 swift-tuttle > phobos > deimos > halley > encke — 동일 scale 이므로 visual 서열도 동일 (사실 정합)

### 산출식 (R1~R10a 동일)

```
px_diameter (1280×720) = body.radius × scale × k,  k = 7.0806e-9
sunPxRatio(body) = (body.radius × scale) / 3.4785e10
scene_unit (T1 solar) = 거리_m × 8.4e-11  (1 AU = 12.566 unit)

swift-tuttle: 1.3e4 × 5000 = 6.50e7 → px 0.460 / sunPxRatio 0.187%
halley:       5.5e3 × 5000 = 2.75e7 → px 0.195 / sunPxRatio 0.079%
encke:        2.4e3 × 5000 = 1.20e7 → px 0.085 / sunPxRatio 0.034%

cross-group: swift-tuttle×5000 (6.50e7) < ceres×800 (3.7568e8, min dwarf) — 비 0.173
PM 사전 산출 재현: swift-tuttle visual / pluto visual = 6.50e7 / 9.5064e8 = 6.8% ✓
5000 그룹 내: phobos×5000 (5.54e7) < swift-tuttle×5000 (6.50e7) — 사실 radius 서열 (1.3e4 > 1.108e4) 그대로
```

---

## 축별 설계

### 축 1 — `BODY_SCALE` comet 그룹 = 5000 (5번째 scale 그룹 — PM Q1=A, 합의 근거 확인 수준)

PM 라운드가 Q1=A 로 확정 — 본 절은 합의의 수치 근거 박제 + 단위 테스트 가드 설계.

| 후보                                     | scale    | swift-tuttle px | encke px  | cross-group                                                   | 평가                                                                                                                                                                                              |
| ---------------------------------------- | -------- | --------------- | --------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. phobos/deimos 계보 (선택 — PM Q1)** | **5000** | **0.460**       | **0.085** | **max comet 6.5e7 < min dwarf 3.76e8 (비 0.173) — 서열 보존** | **선택 — 극소형 (km 급) 천체 = 5000 단일 mental model. 그룹 내 + 5000 통합 그룹 사실 서열 자동 보존. solar view sub-px billboard 의존 명시 (PM), mesh 는 focus 시 의미 (R5 위성 선례 검증 경로)** |
| B. dwarf 답습 (800)                      | 800      | 0.074           | 0.014     | 보존                                                          | focus view 에서도 mesh 사실상 비가시 (desiredRadius 산정이 boundingSphere 기준이라 focus 자체는 동작하나 LOD high mesh 의미 소실). 기각                                                           |
| C. 별도 상향 (예: 50000)                 | 50000    | 4.60            | 0.85      | swift-tuttle 6.5e8 > ceres 3.76e8 — **dwarf 와 역전**         | comet visual > ceres visual — cross-group 사실 서열 파괴 (R10a 후보 C 기각 논리 동형). 기각                                                                                                       |

#### 서열 정량 가드 (단위 테스트 — body-scale.test.ts 확장)

```
radius × scale 곱 (결정적 — runtime 측정 불요) 기준:
  그룹 내 strict:   swift-tuttle > halley > encke               (부등호 2개)
  그룹 동일값:      BODY_SCALE 3 body 전부 === 5000              (단일값 구조 가드)
  cross-group:     swift-tuttle×5000 < ceres×800                (max comet < min dwarf)
  5000 통합 그룹:   swift-tuttle > phobos > deimos > halley > encke  (사실 radius 서열 — scale drift 감지)
```

> **D-T2 사전 등록 (cross-group 정밀)**: swift-tuttle visual (6.5e7) > phobos visual (5.54e7) 은 **사실 radius 서열 그대로** (1.3e4 > 1.108e4, 동일 scale 그룹) — "혜성이 위성보다 큼 = 버그?" 오인 선제 차단. 과제 정의의 "comet visual 은 모든 dwarf/위성보다 작음" 은 실측 정정: **dwarf 전부보다 작음 ✓ / 위성 중 phobos·deimos (동일 5000 그룹) 와는 사실 서열 비교** — measurement-first 정정 박제 ([guard-design-principles](../lessons/guard-design-principles.md) §1).

기존 `getBodyScale('halley') === 1.0` negative (body-scale.test.ts:195) 는 **`getBodyScale('nonexistent-body') === 1.0`** (default fallback 가드 — §축 5 ①) 로 전환 후 halley positive (`=== 5000`) 추가.

---

### 축 2 — `CURRENT_R_PHASE = 11` + phase 11 매핑 3곳 갱신 (allowlist 24 → 27)

- `CURRENT_R_PHASE` 10 → 11 (1줄) — #613 자동 생성 7번째 실전. `R_PHASE_BODY_ALLOWLIST` 27 body 자동 확장 (`filterBodiesByPhase(bodies, 11)` 시뮬레이션 테스트가 이미 27 박제 — positive 전환 정합 기존재)
- **매핑 3곳 갱신 의무 확인** (R10a §축 2 근거 4 박제분):
  1. `solar-system.json` 혜성 `$introducedInRPhaseComment` — **변경 0** (역사 기록으로 정합 유지: "R10b — phase 11" 은 진입 후에도 참)
  2. `r-phase-allowlist.ts` 주석 — **갱신**: "현재 박제: CURRENT_R_PHASE=10 → … 24 body" → "=11 → … + halley·encke·swift-tuttle(R10b — 혜성 3, #664) = 27 body". 매핑 경고 블록 (⚠️) 은 유지 (분리 메커니즘 역사 기록)
  3. `roadmap-v3-incremental.md` R10 행 — **갱신**: R10b 완료 표기 + 로드맵 v3 최종 라운드 종결 (§축 9)
- r-phase-allowlist.test: "R10b 시뮬레이션 phase 11 = 27" 테스트는 `R_PHASE_BODY_ALLOWLIST` 와의 동치 단언으로 승격 (`filterBodiesByPhase(bodies, 11) === [...R_PHASE_BODY_ALLOWLIST]`), R10a 24-body 테스트는 phase 10 고정 시뮬레이션으로 유지 (경계 가드)

---

### 축 3 — halley 고이심률 궤도선 chord 오차 사전 산출 (PM Q3 — 본 ADR 핵심 신규 축)

#### 사전 산출 (사출 스크립트: `scripts/_debug-664-chord-tmp.mjs`, 산식 = `sampleOrbitPoints` 동일 — 진근점각 등간격 64 seg, 세그먼트 내 200 샘플 sagitta)

| body                   | a (AU) / e       | max sagitta (AU) | 장축 대비 | **프레임핏 px** (궤도 폐곡선 전체 720px 프레임) | 발생 위치                |
| ---------------------- | ---------------- | ---------------- | --------- | ----------------------------------------------- | ------------------------ |
| **eris (R10a 기준선)** | 67.864 / 0.436   | 0.2074           | 0.153%    | **1.10**                                        | seg 31 (원일점측 ν≈177°) |
| **halley**             | 17.834 / 0.96714 | 0.6921           | 1.940%    | **13.97**                                       | seg 31 (원일점측)        |
| swift-tuttle           | 26.09 / 0.963    | 0.9746           | 1.868%    | **13.45**                                       | seg 31 (원일점측)        |
| encke                  | 2.2152 / 0.848   | 0.0307           | 0.693%    | **4.99**                                        | seg 31 (원일점측)        |

- **기준선 의미**: eris 1.10px 는 R10a D-T2 실 Chrome 실측에서 **꺾임 식별 불가** 판정 (R10a DoD 4 + §위험 #3 캡처 박제). halley 는 그 **12.7배** / swift-tuttle 12.2배 / encke 4.5배
- **근일점측은 전 body 무위험**: true-anomaly 등간격이 근일점 부근을 자동 밀집 — 근일점측 sagitta 는 근일점 r 대비 0.06~0.08% (halley 0.00036 AU). encke 근일점 (4.23 unit) 의 sun mesh (반경 1.46 unit) 간섭은 **×2.9 여유 — 기우 가능성 높음** (PM 사전 보정 그대로, D-T2 캡처로 실측 확인만)
- **D-T2 판정 기준 사전 박제**: 줌아웃 궤도 폐곡선 프레임에서 원일점측 꺾임 육안 식별 여부. 사전 산출상 halley/swift-tuttle 은 **식별 가능성 높음** (식별-불가 기준선의 12배+ — 13.97px 는 명백한 다각형 꺾임 대역), encke 는 경계 (4.99px). **예측: 조건부 축 발동**

#### 조건부 fix 사전 설계 (꺾임 식별 시에만 구현 — PM Q3 measurement-first)

| 후보                                         | 메커니즘                                                                            | halley 프레임핏 px                         | 기존 24 body 영향                                                                    | 평가                                                                                                                                                                         |
| -------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(C) per-body 동적 segments (1순위)**       | `const segments = orbit.eccentricity >= 0.6 ? 256 : 64;` (true-anomaly 등간격 유지) | 256 seg → **1.52** (eris 기준선 1.10 근접) | **0** (e<0.6 인 24 body 는 seg 64 불변 — vertex 동일, pixel-diff 기존 궤도선 무영향) | **1순위** — PM Q3 문구 "segments 동적 산정" 정확 일치 + 근일점 자동 밀집 보존 + 코드 1~2줄. vertex 비용 +576 (3 body × 192) 무시 가능. LineSystem 은 line 별 점 수 상이 허용 |
| (B) equal-E (이심근점각) 재매개변수화 64 seg | 샘플링 파라미터 ν → E 전환 (`x = a·cosE − c, y = b·sinE` 후 동일 회전)              | **0.43** (e-invariant — 전 body 균일)      | 전 27 body vertex 이동 — pixel-diff baseline 전면 churn                              | 2순위 — 원일점 품질은 최상이나 **근일점측 희소화** (halley E 1-step = ν 0→41.6° sweep — focus 근일점 뷰 품질 저하) + 기존 baseline 전면 갱신 비용. 기각 (조건부 1순위 아님)  |
| (D) seg 일괄 증가 (전 body 256)              | `segments = 256`                                                                    | 1.52                                       | 전 27 body vertex 4배 (+27×192) + baseline churn                                     | 비용 대비 (C) 와 동일 효과 — 기각                                                                                                                                            |

- **임계 e ≥ 0.6 근거**: 실측 검증된 최대 OK (eris 0.436 — 1.10px 식별 불가) 와 최소 혜성 (encke 0.848) 사이. 64-seg 유지 대역 (e<0.6) 의 최악값이 eris 로 실측 anchor 됨
- **발동 시 Concrete Prediction 조건부 라인**: sampleOrbitPoints 1~2줄 (+주석) — §Concrete Prediction 에 분리 표기
- **encke 경계 처리**: e 0.848 ≥ 0.6 → 256 seg 일괄 적용 (4.99px → ≈0.31px). per-body 차등 임계 (halley 만 256) 같은 미세 분기는 기각 — 단일 임계 1줄 구조 유지

#### 줌아웃 도달 구조 보장 (eris 기준선 재사용 — 인계 #7)

- eris 실측 도달 radius **2,353 unit** (Q 1224.7 unit, R10a PR #661 이분 탐색 보수 상한) → 비례 환산 예측: swift-tuttle (Q 643.6 unit) ≈ **1,236 unit** / halley (440.9) ≈ **847** / encke (51.4) ≈ **99** — 전부 eris 실측 도달치 미만 + `upperRadiusLimit`/`maxZ` 1e14 구조 보장. dev 실측 박제 의무 (swift-tuttle 1개만 — 최대 Q 대표)
- DoD 해석 기준은 R10a §축 3 그대로 답습: default 진입 직후 프레임 내 가시 비요구 (기존 제품 동작) / PASS = 휠 줌아웃 단일 입력 도달

---

### 축 4 — 역행 혜성 2 body (halley 162.26° / swift-tuttle 113.45°) — 코드 0 + D-T2 사전 등록

- ecliptic inclination > 90° = 역행. `sampleOrbitPoints` / Kepler 전파의 기존 회전 변환이 i 무관 동작 (R9 triton 129.14° 실측 선례 — 코드 0 적중). 데이터 기박제 (Ecliptic+TDB epoch — R9 검증 frame 동일) 라 epoch/frame 변경 0
- **D-T2 사전 등록**: "halley/swift-tuttle 공전 방향이 행성들과 반대 = 사실 정합 (버그 아님)" — R9 triton 선례 동형. 추가로 **두 역행 + 한 순행 (encke 11.78°) 혼재** 가 한 프레임에 보이는 첫 라운드 — 방향 혼재 자체도 사실 정합
- qa 검증 방법 사전 박제: 화면 투영 기반 방향 판정은 false-negative 위험 (R9 triton 1차 오진 — 3축 정정, volt #32 사례) — **각운동량 부호 정량 측정** (state vector 외적) 으로 판정

---

### 축 5 — negative 케이스 가상 ID 3분류 전환 (PM Q4 — agy 1순위 권고의 분기-semantics 정밀화)

**충돌 실측**: phase 11 진입 시 미진입 실데이터 body = 0 — halley 기반 negative 전체가 positive 전환되고 후계 실데이터가 없다. agy 권고 "가상 ID (`nonexistent-body`) 전환" 을 코드 전수 확인 (#624 교훈) 으로 검증한 결과, **negative 의 두 sub-semantics 가 상이**:

- **(i) membership 가드** — allowlist 포함 여부만 검사 (데이터 존재 무관): 가상 ID 작동 ✓
- **(ii) "데이터 존재 + allowlist 외" UI 경로** — 실데이터 body 필수: url-sync 는 데이터 존재 검사 **선행** (가상 ID 는 "알 수 없는 body id" 분기로 빠짐 — 기존 invalid 테스트와 중복) / info-panel 차단 분기는 `data.nameKo` 렌더 / tree 는 `getSolarSystem()` 실데이터 렌더 (가상 ID 노드 자체 부재): 가상 ID 불가 ✗

#### 전환 매트릭스 (3분류 — 전수)

| 분류                                                                      | 대상 (파일:현행 negative)                                                                                                                                                                                                                                                                                                                                                                                                                                          | 전환                                                                                                                                                          | 근거                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **① 순수 가드 → 가상 ID `nonexistent-body`**                              | `r-phase-allowlist.test.ts:202` (`isRPhaseFocusable('halley')===false`) / `simulation-core-r-phase-allowlist-guard.test.ts` focusOn 차단 3건 (allowlist 검사가 데이터 조회 선행 — simulation-core.ts:225 실측) / `body-scale.test.ts:195` (`getBodyScale === 1.0` — semantics 가 "미진입" → "미정의 default fallback" 으로 전환, drift 가드 가치 유지)                                                                                                             | **uniform 가상 ID**                                                                                                                                           | membership/default 검사만 — 실데이터 phase 진행에 영구 비종속 (구조적 해소 — agy 권고 본질)                                                                                                                                                                                                                  |
| **② UI disabled/blocked 경로 → vi.mock 부분 mock**                        | `celestial-tree.test.tsx` (tree-halley disabled 5건) / `celestial-info-panel.test.tsx` (차단 분기 4건) / `scenario-presets.test.tsx` (halley-x10 disabled 5건) / `url-sync.test.tsx:197` (R-Phase 미진입 분기)                                                                                                                                                                                                                                                     | `vi.mock('@astro-simulator/core')` **부분 mock** — `isRPhaseFocusable` 만 지정 body (halley 유지) 에 false 반환, 나머지 실모듈 passthrough (`importOriginal`) | 실데이터 body + allowlist 외 동시 요구 — 가상 ID 도달 불가 분기. mock 으로 "isRPhaseFocusable=false 일 때 UI 가 disabled/차단 렌더" 라는 **UI 계약 자체** 를 검증 (phase 진행 영구 비종속). mock drift 위험은 ① 의 가상 ID 실모듈 테스트 + `filterBodiesByPhase` 순수 함수 경계 테스트 (기존재) 가 직교 커버 |
| **③ E2E (browser-verify — mock 불가) → positive 전환 + disabled 축 종료** | `browser-verify-r-phase-allowlist.mjs`: 4-A `?focus=halley` → **`?focus=nonexistent-body`** (차단 결과 단언 `selectedBodyId===null` 동일 — 도달 분기만 "알 수 없는 body id" 가드로 변경, 주석 명시) / 5-B·5-C tree-halley disabled → **tree-halley enabled positive 전환** + `RPHASE_TREE_EXPECTED_DISABLED = []` (빈 배열 + 주석 박제 — shortcut bar negative 빈 배열 선례 동형) / 6-H preset-halley-x10 disabled → **enabled zero-touch 전환 검증** (6번째 재현) | E2E disabled 경로 축 종료                                                                                                                                     | phase 11 후 disabled 경로는 **production 도달 불가** (트리거 가능 실데이터 0) — E2E 로 검증할 production 시나리오 자체가 소멸. 코드 (disabled 분기) 는 미래 phase 12+ 데이터 대비 잔존하며 단위 mock (②) 이 계약 검증 승계. 가상 preset 신설 기각 (production UI 에 가짜 entry 노출 = UX 오염)               |
| (변경 0 — 주석만)                                                         | `orbit-visual-scale.test.ts:40~44` / `satellite-orbit-structure.test.ts:116` (`getOrbitVisualScale('halley')===1.0`)                                                                                                                                                                                                                                                                                                                                               | 단언 불변 — halley 는 R10b 진입 후에도 위성 0 (parent 미매핑) 이라 1.0 유지. 주석 semantics "미진입" → "미매핑 (위성 0)" 갱신                                 | —                                                                                                                                                                                                                                                                                                            |

> **가드 커버리지 보존 증명**: 전환 후에도 (a) allowlist 차단 로직 — ① 가상 ID E2E (4-A) + 단위 (b) UI disabled 계약 — ② mock 단위 (c) phase 경계 — `filterBodiesByPhase` 순수 함수 시뮬레이션 (phase 10 = 24 / 11 = 27) 의 3축이 전부 잔존. 소멸하는 것은 "실데이터 body 의 E2E disabled 렌더" 단 1축 — production 도달 불가 경로이므로 fail-fast 원칙과 모순 없음 (검증 대상 시나리오 자체가 0).

---

### 축 6 — shortcut bar halley 승격 (PM Q2=A) + 비-행성 후미 배치 컨벤션

- `solar-system.json` halley `showInShortcutBar: false → true` (데이터 1값) — #617 가드 3종 동시 갱신 의무: ① 데이터 ② `FOCUS_BUTTONS` `{ id: 'halley', label: '핼리 혜성' }` ③ browser-verify `RPHASE_EXPECTED_ENABLED` +halley. `RPHASE_SHORTCUT_EXPECTED_DISABLED` 는 `[]` 유지 (encke/swift-tuttle 은 false → bar 미등록 — #617 직교 축의 "focus 가능 + bar 미등록" 분류에 ceres 등과 함께 합류)
- **배치 결정 — 후미 (pluto 다음 15번째)**: FOCUS_BUTTONS 기존 컨벤션은 "천체 거리순" 이나 halley a=17.834 AU 를 엄격 적용하면 saturn (9.58)/uranus (19.19) **사이 삽입** — 행성 8 거리순 블록이 깨지고 사용자 mental model (행성 나열) 훼손. **"행성 거리순 블록 + 비-행성 카테고리 후미 (왜소행성 pluto → 혜성 halley)" 컨벤션 신규 박제** (배치 주석에 명시 — 후속 비-행성 추가 시 답습 기준)
- 15버튼 — R8 12 / R9 13 / R10a 14 선례의 overflow-x-auto 흡수. 모바일 (375px) D-T2 스크롤 확인 답습
- encke/swift-tuttle 은 URL `?focus=` / CelestialTree 진입 (discoverability gap — #624 사용자 accepted tradeoff 답습)

---

### 축 7 — px-ratio / `PX_RATIO_THRESHOLDS` (3 body 전부 N/A — 8번째 그룹)

| body         | 식 sunPxRatio | 식 px | 판정    | 근거                                                                               |
| ------------ | ------------- | ----- | ------- | ---------------------------------------------------------------------------------- |
| swift-tuttle | 0.187%        | 0.460 | **N/A** | sub-px — billboard 4px fallback 전면 의존 (PM Q1 명시). phobos/deimos §결정 6 답습 |
| halley       | 0.079%        | 0.195 | **N/A** | 동일                                                                               |
| encke        | 0.034%        | 0.085 | **N/A** | 동일 — 그룹 최소                                                                   |

- 선례 정합: 4px fallback 의존 body 미박제 — phobos/deimos → galilean → titan → titania → triton → dwarf 5 에 이어 **8번째 그룹**. 회귀 가드 우회 경로 (R10a §축 5 동일): Allowlist (#613) + FOCUS_BODIES (#598) + targetIds (#619) + pixel-diff 전화면
- dev 단계 의무: `--measure-px-ratio` 3 viewport 실측 수치 PR 본문 기록 (N/A 실측 근거 박제)

---

### 축 8 — 가드 동기화 + preset + time-reversal + pixel-diff (목록 동기화 + baseline 갱신)

| 가드                                       | 변경                                                                                                                 | 비고                                                                                                                                                                                                                            |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| r1-guard `targetIds`                       | 24 → **27 body** (+halley, +encke, +swift-tuttle — 데이터 등장 순)                                                   | #619 정적 매칭 — CURRENT_R_PHASE=11 동시 갱신 의무                                                                                                                                                                              |
| `FOCUS_BODIES` (#598)                      | 24 → 27 body                                                                                                         | browser-verify-378-focus — 3 body focus 진입 검증 자동 확장 (27 body × modes 매트릭스)                                                                                                                                          |
| `RPHASE_EXPECTED_ENABLED` (#617)           | +halley (15)                                                                                                         | §축 6. `RPHASE_SHORTCUT_EXPECTED_DISABLED` `[]` 유지                                                                                                                                                                            |
| `RPHASE_TREE_EXPECTED_DISABLED`            | `['halley']` → **`[]`**                                                                                              | §축 5 ③ — disabled E2E 축 종료 (빈 배열 + 주석 박제)                                                                                                                                                                            |
| r-phase-allowlist.test                     | allowlist 27 동치 단언 + phase 10/11 경계 시뮬레이션 유지 + negative 가상 ID 전환 (§축 5 ①)                          | —                                                                                                                                                                                                                               |
| body-scale.test                            | comet 서열 가드 신규 (§축 1 — 4축) + negative 가상 ID 전환 + halley positive 5000                                    | —                                                                                                                                                                                                                               |
| **pixel-diff baseline**                    | **변화 예상 — `--update` + PR 스크린샷 박제 의무**                                                                   | R10a "변화 0" 와 상이: 혜성 3 궤도선 근일점측 (q 4.23~12.13 unit) 이 default 진입 프레임 (radius 35) 관통 + encke 궤도 (a 27.8 unit) 는 상당 부분 프레임 내. **신규 1px 라인 3개 등장은 의도 변화** — 캡처 비교로 의도분만 확인 |
| scenario preset                            | **halley-x10 enabled zero-touch 재현 (6번째 — preset 코드/데이터 변경 0)**. negative preset 후계 신설 기각 (§축 5 ③) | browser-verify 6-H 를 positive 전환 검증으로 재작성                                                                                                                                                                             |
| time-reversal.test                         | **변경 0 (재확인만)**                                                                                                | 혜성 3 은 기적분 + green (R10a 실측 박제 — 2026-04-21 데이터 박제 이후). halley e=0.967 도 동일 suite 기통과 — dev `--include-ignored` 전체 green 재확인 (어긋나면 §재검토 트리거 #6)                                           |
| jpl-validation.test                        | **변경 0** — halley 주기 75.32yr 검증 기존재 (line 157)                                                              | 고이심률 Kepler 전파 정합 기검증                                                                                                                                                                                                |
| legacy `scripts/browser-verify-comets.mjs` | dev 재량 갱신/제거 (비차단)                                                                                          | #98 유물 — baseUrl 3001 구식. FOCUS_BODIES 자동 확장이 본선 커버                                                                                                                                                                |
| 모바일 cumulative                          | baseline **16.818%** (R10a PR #661 재실측 — 구버전 16.82% 금지) 기준 ≤ 25%                                           | §점유율                                                                                                                                                                                                                         |

---

## 점유율 산출 + Visual Fidelity §의무 체크리스트 4항목 (#541)

### 모바일 누적 차단율 (375×667 — off-screen 제외 metric, baseline 16.818%)

| 항목                              | 산출                                                             | 기여                                                                                                                                                                  |
| --------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R10a 재실측 baseline              | off-screen 제외 후 (PR #661)                                     | **16.818%**                                                                                                                                                           |
| 혜성 3 (on-screen 가정 보수 상한) | 각 billboard 4px quad → π×2² ≈ 12.6 px² × 3 ≈ 38 px² / (375×667) | **+0.02%p 상한** — 궤도 위치상 encke (a 2.21 AU) 는 on-screen 가능, halley/swift-tuttle 은 현 epoch 위치 따라 가변. 궤도선 (1px LineSystem) 은 diskArea metric 비대상 |
| **누적 (보수 상한)**              | 16.818 + 0.02                                                    | **≈ 16.84% (DoD 임계 25% margin 8.2%p)**                                                                                                                              |

- 재실측 괴리 ±3%p 초과 시 측정 방법 검증 우선 (volt #32 — R8 §재검토 트리거 #8 절차 답습)

### Visual Fidelity §의무 체크리스트 (4항목)

- [x] **데이터 SSoT 보존** — 3 body radius/mass/orbit 전부 기박제 실측값 무수정. 변경은 프로젝트 메타데이터 1값 (halley showInShortcutBar true) — 실측 천문값 비저촉. mesh 과장 (×5000) 은 rendering-only
- [x] **rendering 시점 분리** — physics (Rust+wasm) 는 BODY_SCALE / allowlist / segments 무의존 (이미 27 body 적분 중 — 본 라운드 물리 변경 0). 조건부 segments 도 궤도선 시각화 전용 (`sampleOrbitPoints`) — 적분 경로 비접촉. developer 검증 의무
- [x] **UI overlay 실측값 표기** — CelestialInfoPanel 3 body 실측 radius (halley 5.5 km 등) + "× 5000 과장 중" tooltip 자동 (getBodyScale 기존 경로). halley 비구형은 `$radiusComment` 기존재
- [x] **baseline 박제** — 핵심 박제값 표 + 산출식 + chord 사전 산출 표 (§축 3) + 모바일 16.84% 상한

---

## Concrete Prediction (R10a "R10b = CURRENT_R_PHASE=11 1줄 + BODY_SCALE N줄, 궤도선 코드 0 보장 불가" 예측 재현 검증 + R10b 자체 예측)

### 확정 축 (코어)

| 항목                               | R10a 예측     | R10b 본 ADR 예측 | 사유                                     |
| ---------------------------------- | ------------- | ---------------- | ---------------------------------------- |
| BODY_SCALE                         | 혜성 그룹 N줄 | **3**            | comet 그룹 3 body (§축 1)                |
| CURRENT_R_PHASE 10→11              | 1             | **1**            | #613 자동 생성 7번째 실전                |
| FOCUS_BUTTONS                      | (미예측)      | **1**            | halley 1줄 (§축 6)                       |
| ring / tilt / satellite orbit 룩업 | 0             | **0**            | 전 body parent=sun + rings 없음          |
| tierFromFocus / LOD / 물리         | 0             | **0**            | `comet` 분기·임계 기존재 + N-body 기적분 |
| **확정 코어 합계**                 | —             | **5 라인**       | —                                        |

### 조건부 축 (Q3 — D-T2 실측 후 발동, 사전 산출상 발동 확률 높음)

| 항목                                                      | 예측          | 발동 조건                                                                                                                              |
| --------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `sampleOrbitPoints` segments 동적 (`e >= 0.6 ? 256 : 64`) | **+1~2 라인** | D-T2 줌아웃 프레임에서 원일점측 꺾임 육안 식별 시 (§축 3 — halley 13.97px = 기준선 12.7배라 발동 예측). 발동 시 코어 합계 **≤ 7 라인** |

별도 카운트 (데이터/가드/테스트): solar-system.json 메타 1값 (halley bar true) / 가드 동기화 (targetIds +3 / FOCUS_BODIES +3 / RPHASE_EXPECTED_ENABLED +1 / TREE_DISABLED [] 전환) / negative 3분류 전환 (① 가상 ID 3 파일 / ② mock 4 파일 / ③ E2E 3 시나리오 재작성) / body-scale.test 서열 가드 / allowlist 주석 27 갱신 / roadmap R10 행 / pixel-diff baseline `--update` / CHANGELOG.

**예측 검증 의무 (dev 단계)**: `git diff --stat` 으로 ① ring/tilt/satellite 룩업 + tier.ts + lod-body-thresholds.ts 변경 0 ② 확정 코어 5 라인 (조건부 발동 시 ≤ 7) 실측 재현 ③ 조건부 축 발동/비발동 사실을 PR 본문에 명시 (사전 산출 예측 대조 — 비발동이면 "13.97px 인데 식별 불가" 의 시각 인지 기준 재조정 데이터로 회고 박제).

---

## DoD (수치 — 검증 가능 완료 기준, 이슈 #664 7항목과 정합)

1. **3 body `?focus=` 진입 + info 패널 + 궤도선 visible** — focus 시 화면 중앙 + mesh 직접 관찰 (tierFromFocus `comet` → T3 body). info 패널 실측 radius + "× 5000 과장 중" tooltip
2. **halley 고이심률 궤도선 렌더 품질** — 근일점/원일점 양측 D-T2 판정: §축 3 사전 산출 (13.97px) → 실측 → 꺾임 식별 시 조건부 fix (256 seg → 1.52px) 적용 후 재실측. eris 캡처 (R10a) = 기준선. **줌아웃 캡처 PR 박제 의무** (조건부 발동/비발동 무관 — 비발동도 증거 박제)
3. **CURRENT_R_PHASE=11 + 가드 동기화 24→27** — FOCUS_BODIES (#598) / targetIds (#619) / RPHASE_EXPECTED_ENABLED (#617) 정합 — CI `detect-and-test` green
4. **negative 3분류 전환 완료** — ① 가상 ID `nonexistent-body` (단위 + E2E 4-A) ② vi.mock UI 계약 4 파일 ③ E2E disabled 축 종료 (`RPHASE_TREE_EXPECTED_DISABLED=[]` + 주석). 가드 커버리지 보존 3축 (§축 5 증명) 전부 green
5. **scenario preset halley-x10 zero-touch enabled 재현** (6번째 — preset 코드/데이터 변경 0) — browser-verify 6-H positive 전환
6. **단위 테스트 전체 green + 모바일 cumulative ≤ 25%** (baseline 16.818%) — time-reversal 변경 0 재확인 + Concrete Prediction `git diff --stat` 재현
7. **D-T2 실 Chrome GUI 수동 검증 ≥ 1회** (headless 단독 종결 금지 — volt #77. headless URL 은 `?gpu=a&lod=auto` 필수): halley shortcut 버튼 (15버튼째) / 역행 공전 방향 (사실 정합 — 각운동량 정량 측정, §축 4) / halley 원일점 꺾임 판정 / encke 근일점-sun mesh 간섭 확인 / swift-tuttle 줌아웃 도달 radius 실측 박제 / 기존 24 body 무회귀

---

## 위험 / 미해결

### 위험 #1 — halley/swift-tuttle 원일점 꺾임 (조건부 축 발동 예측) — 사전 산출 13.97px

- §축 3 — 발동 시 fix 1순위 (per-body 동적 segments) 사전 설계 완료. **2-pass D-T2 비용** (실측 → fix → 재실측) 은 PM Q3 measurement-first 합의에 사전 수용됨
- 잔여 위험: 256 seg 로도 식별되면 (1.52px — eris 1.10px 근접이라 가능성 낮음) seg 512 상향 1줄 — 동일 구조 내 해소

### 위험 #2 — 혜성 궤도선의 default 프레임 신규 등장 — "화면이 복잡해졌다" D-T2 오인

- encke 궤도 (a 27.8 unit) 가 default 프레임 (radius 35) 내 거의 전체 + halley/swift-tuttle 근일점측 라인 관통 — **R10a 까지 없던 inner 권역 시각 변화** (사실 정합 — 단주기 혜성의 실제 궤도). pixel-diff baseline 변화의 본질이 이것 (§축 8)
- 완화: 사전 등록 인용 + baseline `--update` 시 의도 변화분 캡처 대조. 궤도선 표시 toggle 등 UI 는 비-범위 (후속 분리 후보)

### 위험 #3 — 3 body 전부 sub-px billboard — solar view 식별 UX

- 식 px 0.08~0.46 — dwarf (2.66~6.73) 보다 한 단계 더 작음. colorHint (한색 계열 3종) + 궤도선 + tree 가 식별 경로 (R10a §위험 #2 동형, #624 tradeoff 답습)
- billboard 진입 거리 검증: LOD `comet` 임계 (radius-multiple ×3) 기존재 — focus 접근 시 billboard → mesh 전환 실측 (qa 줌 조작 popping 항목 — R10a §위험 #5 답습)

### 위험 #4 — 역행 + 고이심률 결합의 시각 오인 — "궤도가 잘못 그려졌다"

- halley 는 역행 (162.26°) + e 0.967 — 궤도선이 ecliptic 평면에서 크게 기울고 (i 162° = 평면 근접 역방향) 길게 찌그러진 타원. 기존 어떤 body 와도 다른 형상 — D-T2 "이상해 보임" 보고 가능성. 사전 등록: JPL SBDB 기박제 osculating elements 그대로 (사실 정합)
- 완화: qa 각운동량 정량 측정 (§축 4) + info 패널 e/i 실측값 표기 확인

### 위험 #5 — mock 기반 negative (분류 ②) 의 가드 가치 희석 — "mock 이 항상 PASS"

- vi.mock 으로 isRPhaseFocusable 을 위장하면 실데이터-실가드 통합 검증이 아니게 됨 — mock 과 실모듈 시그니처 drift 시 silent
- 완화: ① 분류 ① 의 가상 ID 테스트는 **실모듈** 로 membership 가드 직접 검증 (직교 커버) ② `importOriginal` partial mock 패턴 강제 (시그니처 drift 시 타입 에러 fail-fast) ③ `filterBodiesByPhase` 순수 함수 경계 테스트가 데이터-가드 정합 커버

---

## 결과 / 재검토 조건 (Amendment 발동 트리거)

1. **#1 (꺾임 식별 — 조건부 축 발동)** — §축 3 fix 1순위 적용 (사전 설계 완료 — Amendment 불요, 본 ADR 범위 내). 256 seg 로도 식별 시 512 상향 후 Amendment 박제
2. **#2 (꺾임 비식별 — 조건부 축 비발동)** — 사전 산출 13.97px 대비 시각 인지 기준 괴리 — 비발동 사실 + 캡처를 회고 박제 (후속 라운드 사전 산출 보정 데이터)
3. **#3 (encke 근일점 sun mesh 간섭 실측 확인)** — ×2.9 여유 예측 어긋나면 (시각 간섭 식별) 궤도선 z-order/클리핑 forensic 전환
4. **#4 (체감 크기 "안 보임" 보고)** — comet 5000 → 상향은 cross-group 상한 내에서만: ceres×800 (3.7568e8) ÷ swift-tuttle radius (1.3e4) = **scale < 28,898** 수학 상한. 초과 요구는 PM 재합의
5. **#5 (모바일 cumulative 괴리 ±3%p 초과)** — 측정 방법 검증 우선 (volt #32)
6. **#6 (time-reversal 예측 어긋남 — suite red)** — 원인 실측 후 Amendment (혜성 고이심률 기여라면 forensic)
7. **#7 (가상 ID 가 미래 실데이터와 충돌)** — phase 12+ 라운드에서 `nonexistent-body` 류 id 의 실데이터 등록 금지 (가드 주석 박제) — 위반 시 즉시 교체
8. **#8 (#617/#619/#598 drift)** — 정적 매칭 가드 fail → 즉시 동기화

### Concrete Prediction (§Concrete Prediction 참조)

- 확정 코어 5 라인 / 조건부 +1~2 라인 (발동 시 ≤ 7) — `git diff --stat` 실측 재현 의무

---

## 축 9 — R-Phase 라운드 종료 절차 (R10b = 로드맵 v3 최종 라운드)

- **전 데이터 소진**: phase 11 진입으로 `solar-system.json` 27 body 전부 allowlist 포함 — `introducedInRPhase > 11` body 0. 로드맵 v3 (R1 태양 → R10b 혜성) 의 시각화 라운드 완주
- **로드맵 문서 갱신** (R10b 구현 PR 에 포함): `roadmap-v3-incremental.md` R10 행 완료 표기 + 문서 상단에 "로드맵 v3 완주 (2026-06, R10b #664)" 상태 박제
- **R10 통합 회고 의무** (CLAUDE.md 마일스톤 회고 루틴): `docs/retrospectives/r10-retrospective.md` — R10a (#659) + R10b (#664) 통합, 고정 4섹션 (달성도/잘 된 것/어려웠던 것/다음 인수인계). **R10b 구현 머지 후 v0.25.0 release prep 전 별도 docs PR** (구현 PR 비대화 방지). 로드맵 v3 전체 (R1~R10b) 종합 회고 여부는 회고 PR 에서 사용자 합의 (선택 — R-Phase 별 회고가 ADR 들에 분산 박제돼 있어 중복 위험)
- **후속 라운드 인계 (phase 12+ 후보 — 본 ADR 비결정, 목록만)**: 위성 데이터 확장 (charon/nereid 등 — satellite N≥5 단일 룩업 한계 동반 해소), ring arcs, 클릭 raycast 선택 (#624), 궤도선 표시 toggle (§위험 #2), 패닝 F3 (#629 §8). negative 구조는 가상 ID 로 영구 해소 (§축 5) — phase 12+ 진입 시 실데이터 negative 재구성 불요

---

## Claude 편향 셀프 체크 (architect 사전 기록 — cross-validate 호출 전)

- **낙관적 일정** — "코드 0 근접" 프레이밍 회피: 조건부 축을 **발동 확률 높음** 으로 사전 판정 (사전 산출 13.97px = 기준선 12.7배 — 정량 근거) + 2-pass D-T2 비용 명시 (§위험 #1). 확정 5 라인 예측의 근거 전부 코드 실측 (tier.ts comet 분기 / lod-body-thresholds / simulation-core:225 / url-sync:80~99). 통과
- **결합 간과** — 본 라운드 핵심 결합 명시: (a) phase 11 진입 → halley negative 전체 연쇄 소멸 + 후계 실데이터 0 (§축 5 — 3분류 전환의 존재 이유), (b) 혜성 궤도선 근일점 ↔ default 프레임 관통 → pixel-diff baseline 변화 (R10a 와 반대 예측 — §축 8), (c) 조건부 segments fix ↔ 기존 24 body vertex 불변 제약 (후보 B 기각 사유), (d) bar 승격 ↔ #617 3종 동시 갱신. 통과
- **폐기 프레이밍** — E2E disabled 축 종료 (§축 5 ③) 는 "영구 폐기" 아님: production 도달 불가의 **조건** (미진입 실데이터 0) 명시 + phase 12+ 데이터 재등장 시 실데이터 negative 재구성 가능성을 §축 9 에 박제. agy 권고 (가상 ID) 도 맹목 수용 아닌 분기 semantics 실측으로 적용 한계 정밀화. 통과
- **순수주의** — halley 비구형 (15×8×8 km) / 꼬리·코마 / 비중력 효과의 사실 정밀성 대신 PM Q4 근사 수용 (Visual Fidelity §1 정합). 데이터 실측값 무수정. equal-E 의 수학적 우아함 (0.43px e-invariant) 보다 기존 baseline 보존 + 근일점 품질의 실용 우선 (후보 C 선택). 통과

## 교차검증 반영 사항

> (Provisional — cross-validate 1회 호출 후 본 섹션에 4축 분류 통합 + Accepted 전이 예정. #370 옵션 C 워크플로)

## 참고

- 이슈: [#664](https://github.com/coseo12/astro-simulator/issues/664) / PM 합의 코멘트 (2026-06-12)
- 직전 라운드: [`20260611-r10a-dwarf-planets-visualization.md`](20260611-r10a-dwarf-planets-visualization.md) — §R10b 인계 7항목
- chord 사전 산출 스크립트: `scripts/_debug-664-chord-tmp.mjs` (volt #67 패턴 — 산출값 본문 박제 후 삭제, 산식은 §축 3 표 재현 가능)
- eris 기준선 실측: PR [#661](https://github.com/coseo12/astro-simulator/pull/661) (도달 radius 2,353 unit / 모바일 16.818% / 원일점 꺾임 식별 불가 캡처)
