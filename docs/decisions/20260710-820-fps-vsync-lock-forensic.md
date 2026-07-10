# ADR: fps-baseline-guard desktop 측정의 30Hz vsync 반속 락 이봉 분포 근본 해소 (forensic)

- **상태**: **Accepted** (cross-validate 통합 2026-07-10 — §7 + 사용자 옵션 확정 2026-07-10 — §5. CLAUDE.md `#### ADR Status 워크플로` 정합 — 측정 방법론 + ADR 신규 = cross-validate 발동 앵커)
- **날짜**: 2026-07-10
- **결정자**: architect (#820 forensic 단계 — fix 구현은 사용자 승인 후 별도 developer 단계)
- **관련**: [#820](https://github.com/coseo12/astro-simulator/issues/820), [#779](https://github.com/coseo12/astro-simulator/issues/779) (Builds on — alert fatigue / 2-job escalation 인프라), [#807](https://github.com/coseo12/astro-simulator/issues/807) / [#815](https://github.com/coseo12/astro-simulator/issues/815) (재현 관찰), [`20260701-779-ci-alert-fatigue-concurrency.md`](20260701-779-ci-alert-fatigue-concurrency.md) (§A1 재검토 6 이 본 이슈 발화점), [`fps-baseline-guard.yml`](../../.github/workflows/fps-baseline-guard.yml), [`verify-fps-baseline.mjs`](../../scripts/verify-fps-baseline.mjs)
- **교훈 적용**:
  - "가드 설계 원칙 §3 fail-fast — fallback/silent skip 금지" ([guard-design-principles.md](../lessons/guard-design-principles.md)) — 30Hz 락을 "측정 무효 skip" 처리하면 진짜 회귀 은폐. 본 ADR 의 **핵심 제약**
  - "측정 방법 검증 우선" (CLAUDE.md 스프린트 계약 §10) — 임계/margin 완화는 비대상. 측정 지표(rAF-count) 자체의 vsync 종속성이 근본 원인
  - "Forensic ADR 변형" (CLAUDE.md §Forensic ADR) — 가설 N≥2 + runtime 측정 필수 + 자동검증↔실제 mismatch + 5옵션 + Amendment 예상 = 5/5 충족

---

## §1 배경

### 이슈 핵심 — margin 조정으로 해결 불가능한 별개 클래스

`scripts/verify-fps-baseline.mjs` 의 `measureFps` (line 100) 는 rAF 콜백 카운트로 fps 를 측정한다. rAF 는 **compositor 의 vsync presentation rate 에 종속**된다. CI runner (Playwright chromium headless + swiftshader 소프트웨어 렌더 + CDP CPU 4x throttling) 에서 desktop viewport (1280×720) 측정값이 **~30 대역과 ~60 대역으로 갈리는 이봉(bimodal) 분포**를 보인다 — 중간값 없음. baseline desktop default 49.9 × (1−0.3) = **34.9 임계**(및 절대 하한 30)는 30Hz 락 상태에서 **구조적으로 항상 FAIL**한다.

- **왜 margin 조정으로 해결 불가**: margin 을 아무리 넓혀도 (예 50%) 30Hz(≈30) < 임계는 유지되거나, 임계를 30 밑으로 내리면 진짜 회귀(전 대역 저하)를 놓친다. 이봉 분포는 연속 저하가 아니라 **60→30 의 이산 양자화(quantization)**이므로 임계 이동으로는 분리 불가.
- **#779 escalation 으로 흡수 불가**: #779 의 2-job escalation(measure soft-fail → retry-fresh-runner)은 "새 머신이면 부하 spike 를 벗어난다"를 전제한다. 그러나 30Hz 락은 (아래 측정) **desktop swiftshader 의 구조적 boundary 현상**이라 상당 비율의 runner 에서 재발 → 새 머신도 락된다(#815 실측). #779 스코프를 넘는 별개 클래스.

### Forensic 측정 결과 (기존 실측 데이터 — 2건 재현 + 정상 분포 baseline)

> 본 이슈는 CI 환경(swiftshader + CPU 4x)에서만 확률적으로 재현되며 **로컬 macOS(120Hz)에서는 재현 불가**. 따라서 정적 debug 스크립트(`_debug-*-tmp.mjs`) 대신 **기존 CI run history 실측 + variance 진단 데이터**를 forensic 근거로 사용한다. 신규 측정(render-capacity 분포)은 §재검토 트리거 및 diagnostic dispatch 로 후속 확보한다(§6).

#### 측정 1 — 정상 분포 (variance 진단, 2026-06-19, `docs/benchmarks/fps-variance-diagnosis-20260619.json`)

| viewport/scenario      | samples 특징                                                   | mean  | cv     | p50  |
| ---------------------- | -------------------------------------------------------------- | ----- | ------ | ---- |
| desktop / default      | `[52.5, 56.2, 58.9, 60.2, 60.1, ...]` 첫 1~2 워밍업 후 60 밀집 | 59.03 | 3.8%   | 60.1 |
| desktop / earth-focus  | `[59.9~60.2]` 완전 밀집                                        | 60.08 | 0.1%   | 60.1 |
| desktop / moon-focus   | `[60.0~60.2]` 완전 밀집                                        | 60.12 | 0.1%   | 60.1 |
| mobile / (전 scenario) | 59.5~60.2 밀집                                                 | ~60.0 | 0~0.3% | 60.1 |

- **관찰 A**: 정상 상태에서 desktop swiftshader 는 **60Hz 를 깨끗이 달성**한다(p50 60.1). 즉 desktop 의 실제 렌더 capacity 는 정상 시 ≥ 60 프레임/초.
- **관찰 B**: desktop default 만 워밍업 outlier(첫 52.5/56.2)를 보이고 나머지는 60 완전 밀집. desktop default 가 **가장 무거운 boundary scenario**(baseline 49.9 자체가 다른 scenario 60대 대비 유일한 저값 — 아래 관찰 D).
- **관찰 C**: scenario-내 variance 는 극소(cv 0~3.8%). flake 는 "scenario 내 noise" 가 아니라 "전역 상태 전환(60↔30)".

#### 측정 2 — 30Hz 락 재현 (동일 시그니처 2건)

| 사례                                   | desktop 측정                                                                          | mobile 측정          | 대조군(동일 코드)                                                  | 런타임 diff                 |
| -------------------------------------- | ------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------ | --------------------------- |
| **#807** (2026-07-06)                  | 27.7~34.3 대역, 3 머신/7회 전부 30대 → 최종 failure, fail 메일 3통                    | (미기록)             | develop dispatch **same-machine step retry → 60.3/59.8/60.1 PASS** | **0줄** (CI 인프라/문서 PR) |
| **#815** (2026-07-08, run 28949230620) | `[20.3,30.9,32.7]/[31,31.9,32]/[32.6,33.7,33]` retry-fresh-runner 2 attempt 전부 30대 | **`60.1~60.2` 정상** | 동일 런타임 PR run + develop dispatch **success**                  | **0줄**                     |

- **관찰 D (viewport 비대칭 — 결정적)**: #815 에서 **desktop 30 락 + mobile 60 정상**이 같은 머신 같은 run 에서 공존. 만약 전역 CPU 부하나 진짜 회귀라면 mobile 도 동반 저하해야 한다. mobile(375×667 = 250K px)은 여유, desktop(1280×720 = 921K px ≈ 3.7배)은 boundary → **락 트리거는 per-viewport 렌더 비용이 프레임 데드라인을 넘는지**에 달림.
- **관찰 E (같은 머신 재측정의 모순)**: #807 develop 대조군은 **같은 머신 step retry 로 락이 풀렸다**(30→60). 반면 #815 retry-fresh-runner 는 **같은 머신 2 attempt 모두 락 유지**. 이것이 이슈가 지목한 "같은 머신 재측정 무효 vs 풀림" 의 모순이며, §가설에서 두 하위 변종으로 해소한다.
- **관찰 F (런타임 0줄 확정)**: 두 사례 모두 앱/코어 코드 0줄 PR → **성능 회귀가 아닌 측정 환경 아티팩트로 확정**.

#### 측정 3 — 데이터 품질 부수 관찰 (baseline 자체 의심)

- **관찰 D-계속**: `fps-lowend-baseline.json` 의 desktop default = **49.9** 는 variance 진단의 p50 **60.1** 과 크게 어긋난다. 49.9 는 60 과 30 의 중간값에 가까워 **baseline 캡처(2026-05-24) 자체가 부분 락/워밍업 윈도우를 포함했을 가능성**이 있다. → 후속 재-baseline 검토 대상(§8, 강제 아님).

### 가설 검증 (N≥2 — forensic 핵심)

| 가설                                       | 진술                                                                                                                                        | 결론                | 근거                                                                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H1 (변종 구분)**                         | 30Hz 락은 (1) **transient(워밍업 유발)** 과 (2) **persistent(머신 boundary/부하 유발)** 두 하위 변종을 가진다                               | **확정**            | 관찰 E — #807 develop(transient, 재측정으로 해소) vs #815(persistent, 재측정 무효). 같은 머신 재측정 실효성은 원인이 transient 인지에 종속                    |
| **H2 (양자화 기전 A — presentation-side)** | 렌더 자체는 데드라인 근처(≈16~18ms)지만 compositor 가 marginal 초과 시 **정확히 절반(30Hz)으로 snap**. 실제 렌더 capacity 는 여전히 60 근처 | **유력(미확정)**    | 관찰 A(정상 시 60 깨끗이 달성) + 이봉의 **이산 점프**(연속 spread 아님) = vsync 양자화 시그니처. 단 락 중 capacity 직접 측정 데이터 부재 → 미확정             |
| **H3 (deadline-miss 기전 B)**              | 락은 렌더가 데드라인을 **진짜로 초과**(capacity ≈ 30)해서 발생. 이 경우 capacity 도 30                                                      | **부분(배제 못함)** | swiftshader 소프트웨어 raster 는 O(pixels) → desktop 3.7배 부하가 4x throttle 하에서 진짜로 느릴 수 있음. H2 와 결합(트리거는 B, 관측은 A 양자화 증폭)일 개연 |

> **H2 vs H3 은 본 ADR 설계의 분기점이다.** H2(presentation-side)가 참이면 **vsync-decoupled render-capacity 측정으로 락과 진짜 회귀를 단일 머신에서 분리 가능**(옵션 b). H3(deadline-miss)가 지배적이면 capacity 도 낮아 단일 지표로 분리 불가 → 확률적 cross-machine escalation 만 남음(§6 contingency). **이 판별은 runtime 측정으로만 확정 가능**(measurement-first) — 아래 옵션 (b)는 이 판별을 내장한다.

---

## §2 영향 모듈/파일

### 측정/설계 근거 (본 ADR 동반)

- 본 ADR §1 Forensic 측정 결과 (기존 데이터 재구성)
- (후속) `docs/benchmarks/fps-vsync-capacity-diagnosis-<date>.json` — render-capacity 분포 diagnostic dispatch 산출 (H2/H3 판별 + 임계 calibration)

### Fix 후보별 영향 모듈 (옵션 선택 후)

- `scripts/verify-fps-baseline.mjs` — `measureFps`(100) 인접에 band 감지 + render-capacity 프로브 + 분류 로직 + script-level simulate env (옵션 a/b/d)
- `.github/workflows/fps-baseline-guard.yml` — `simulate` choice input 확장(`vsync-lock` 추가) + (선택) `--diagnose-variance` capacity 캡처 배선 (옵션 b/d)
- **무침범 예측 (§4)**: `apps/**`, `packages/**` **0줄** — render-capacity 프로브는 이미 노출된 `window.__simCore.scene`(sim-canvas.tsx:209, 프로덕션 무조건 노출) 를 재사용. 앱 소스 변경 불요 (실측 확인)

### Fix 가 깨는 박제값

- `fps-lowend-baseline.json` desktop default 49.9 — 재-baseline 시 갱신(옵션에 따라, §8 후속). **강제 아님**
- #779 A1 Concrete Prediction "`scripts/verify-fps-baseline.mjs` 0줄"(측정 로직 불변)은 **본 이슈에서 의도적으로 초과**됨 — 본 이슈의 목적이 측정 스크립트의 분류 로직 추가이므로 상충 아님(#779 는 워크플로 지휘부 변경, #820 은 측정 지표 강화로 직교)

---

## §3 옵션 비교 (measurement-first 대안, 5±2)

> **공통 fail-fast 불변식(전 옵션 준수 의무)**: 낮은 rAF 측정치는 **분류(classification)만으로 PASS 로 전환되지 않는다**. PASS 는 오직 (a) 어떤 재측정이 실제로 full-rate 를 관측하거나, (b) vsync-decoupled capacity 가 "앱이 빠르게 렌더 가능"을 **양성 측정**할 때만 부여된다. 결정적 진짜 회귀는 어느 머신에서도 full-rate/high-capacity 를 관측할 수 없으므로 **여전히 FAIL**한다. capacity 프로브가 **null/불가**면 "락 가정 후 pass" 가 아니라 **"미상 → escalation/fail"**(실패 방향 fail-safe)로 폴백한다.

### 옵션 (a) — viewport/scenario 비대칭만 (rAF-only)

- **변경**: 스크립트가 `desktop.fps ∈ [28,36]` **AND** `mobile 대응 scenario 가 자기 baseline 통과(≈full-rate)` 이면 vsync-lock 후보 판정 → same-page 재측정 + (#779) fresh-machine escalation. mobile 도 저하면 진짜 회귀(fail).
- **장점**: 앱/프로브 변경 0, 저비용, #815(desktop 30/mobile 60) 케이스 정확 처리.
- **단점 (치명)**: **desktop-only 진짜 회귀가 [28,36] 에 착지**하면(예 desktop 전용 코드 경로 회귀) mobile 정상 → 락으로 오분류 → 은폐 위험. viewport/scenario 비대칭은 진짜 회귀와 락을 **원리적으로 구분 못함**(둘 다 desktop 저하 + mobile 정상 가능). fail-fast 불변식을 **단독으로는 보장 못함**.
- **회귀 예측**: 단독 채택 시 condition 4(진짜 회귀 미은폐) 미충족. **보조 신호로만 유효**.

### 옵션 (b) — render-capacity 프로브를 분류자로 (권장)

- **변경**: page.evaluate 에서 `window.__simCore.scene` 로 **rAF 우회 강제 렌더 루프**(`for (t0=now; now−t0<Wms) { scene.render(); n++ }` → `renderCapacityFps = n×1000/경과`) 를 측정. compositor/vsync 를 거치지 않는 **순수 CPU raster 처리량** = "앱이 얼마나 빠르게 렌더 가능한가"의 vsync-decoupled 프록시. 분류식:
  - `rafFps ∈ [VSYNC_BAND_LO, VSYNC_BAND_HI]` **AND** `renderCapacityFps ≥ CAPACITY_FULL_MIN` → **vsync-lock 확정**: 낮은 rAF 는 presentation 아티팩트, capacity 가 "빠르게 렌더 가능"을 양성 입증 → 재측정(워밍업 폐기) 1회 시도 후, full-rate 미관측이어도 **capacity 근거로 회귀로 카운트하지 않음** + `$GITHUB_STEP_SUMMARY` 라우드 annotation(#779 흡수 기록 패턴)
  - `rafFps` 저 **AND** `renderCapacityFps < CAPACITY_FULL_MIN` → **진짜 회귀**: capacity 가 실제 렌더 느림을 입증 → FAIL
  - `renderCapacityFps` 측정 불가(null) → **미상 → 기존 escalation/fail**(실패 방향 폴백)
- **장점**: condition 3+4 를 **단일 머신에서** 강한 fail-fast 로 동시 충족. 앱 소스 0줄(`__simCore` 재사용). #779 fresh-machine escalation 을 궁극 폴백으로 유지 가능.
- **단점**: (1) **H2 가정 의존** — 락 중 capacity 가 rAF 보다 유의하게 높다(≥ CAPACITY_FULL_MIN)를 실측 확정해야 함(§6 핵심 위험). (2) `CAPACITY_FULL_MIN` 임계는 **CI 실측 calibration 필요**(measurement-first 게이트 — 하드코딩 금지). (3) 강제 `scene.render()` 루프가 활성 `runRenderLoop` 와 재진입 간섭 가능 → dev 검증 필요.
- **회귀 예측**: `scripts/verify-fps-baseline.mjs` +50~80줄. 앱/코어 0줄. `.yml` +~10줄(simulate `vsync-lock`).

### 옵션 (c) — band-triggered escalation + 비대칭 시 auto-pass (rAF-only) — 기각

- **변경**: [28,36] 감지 + 비대칭 → 무조건 pass(annotation).
- **기각 근거**: **fail-fast 정면 위반**. desktop-only 진짜 회귀를 mobile 정상만으로 auto-pass → 은폐. guard-design-principles.md §3 이 금지하는 "continue-on-error silent skip / margin 완화" 의 변형. **이슈가 명시적으로 경고한 함정.**

### 옵션 (d) — 워밍업 프레임 폐기 / 윈도우 확대 / same-page 재측정만 — 부분(불충분)

- **변경**: [28,36] 시 워밍업 N프레임 폐기 후 재측정 / 윈도우 5s→10s.
- **평가**: H1 변종 (1) transient(#807 develop)만 해소. 변종 (2) persistent(#815, #807-PR)는 same-machine 재측정 무효 → **단독 불충분**. 단 **옵션 (b)의 1차 저비용 레이어**로 유효(transient 를 fresh-machine escalation 전에 흡수). 윈도우 확대는 오히려 락/언락 혼재 시 애매값(~45) 생성 → **채택 안 함**.

### 옵션 (e) — GPU-timer instrumentation(`__gpuFrameTimeMs`)을 분류자로 — 기각(불가)

- **변경**: 기존 `readGpuFrameTimeMs()` 로 GPU 프레임 시간 측정 → capacity 대체.
- **기각 근거 (feasibility)**: `readGpuFrameTimeMs()` 는 **WebGPU + `timestamp-query` feature + `?gpuTimer=1`** 에서만 동작(engine-factory.ts:22, sim-canvas.tsx:230). headless Playwright 는 `isWebGpuUsable()` false → **WebGL2/swiftshader 경로 → GPU timer null**(락이 발생하는 바로 그 환경). 실측 확인. **dev 가 이 경로를 추격하지 않도록 명시 박제.**

### 축별 비교 매트릭스

| 축                             | (a) 비대칭 | (b) capacity 프로브          | (c) auto-pass | (d) 재측정만      | (e) GPU timer |
| ------------------------------ | ---------- | ---------------------------- | ------------- | ----------------- | ------------- |
| condition 3 (락 false-fail 0)  | 부분       | **충족(H2 조건)**            | 충족          | 부분(변종1만)     | —             |
| condition 4 (진짜 회귀 미은폐) | **미충족** | **충족**                     | **위반**      | 충족              | —             |
| fail-fast 정합                 | 부분       | **정합**                     | **위반**      | 정합              | —             |
| 앱 소스 침범                   | 0          | **0**                        | 0             | 0                 | 0             |
| 스크립트 비용                  | 저         | 중(+50~80)                   | 저            | 저                | —             |
| 핵심 위험                      | 오분류     | H2 미확정 + 임계 calibration | 은폐          | persistent 미해결 | **환경 불가** |
| calibration 실측 필요          | 임계       | 임계+H2                      | —             | —                 | —             |

### 권장 안 (사전 선호 — 사용자 결정 전 안내)

- **채택 권장: (b) render-capacity 프로브 분류자**, 구성:
  1. **1차 레이어 (d)**: [28,36] 감지 시 워밍업 폐기 same-page 재측정(transient 변종 저비용 흡수)
  2. **핵심 분류 (b)**: capacity 프로브로 락/회귀 판별 — condition 3+4 동시 충족 + fail-fast
  3. **보조 신호 (a)**: viewport/scenario 비대칭을 corroborating 로그로 병기(단독 판정 아님)
  4. **궁극 폴백 (#779)**: capacity null 또는 미상 시 기존 fresh-machine escalation → persist 시 FAIL
- **선결 조건 (measurement-first 게이트, 절대 — 사용자 확정 2026-07-10 으로 구현 전 선행 상향)**: `CAPACITY_FULL_MIN` 임계와 H2 가정은 **Phase 0 diagnostic 으로 render-capacity 분포를 실측한 뒤** 확정하며, 이는 **Phase 1 본구현 착수 전 게이트**다. 데이터 없이 임계 하드코딩 금지. 자연 락은 확률적이므로 **CPU throttle 강화(8~10x)로 데드라인 미스를 결정적 유발**해 H2/H3 를 판별한다(자연 락 대기 불필요). simulate 는 분류 **로직**의 결정적 검증(직교).
- **장기 방향(후속, §8)**: capacity 를 **분류자가 아닌 authoritative 지표**로 승격(rAF 는 advisory) — 가장 근본적이나 재-baseline 필요 → 별건 분리.

---

## §4 Concrete Prediction (무침범 예측 — `git diff --stat` 실측 재현 의무)

옵션 (b) 채택 가정:

### 예측 1 — 코드 변경 라인 수

- **경로 (b1) 무침범 (권장)**:
  - `scripts/verify-fps-baseline.mjs` — **+50~80줄** (band 상수, `measureRenderCapacity` 프로브, 분류 함수, script-level simulate env 분기, diagnostics 필드)
  - `.github/workflows/fps-baseline-guard.yml` — **+8~15줄** (`simulate` choice 에 `vsync-lock` 추가 + `--diagnose-variance` capacity 캡처 배선)
  - **무침범 (0줄 예측)**: `apps/**`, `packages/**`, `docs/benchmarks/fps-lowend-baseline.json`(재-baseline 미선택 시). 프로브는 기존 `window.__simCore.scene` 재사용 + 동기 루프(재진입 무해) → 앱 계약 신설 불요
- **경로 (b2) 코어 계약 API (dev D1 실측에서 재진입/hang 간섭 확인 시 승격 — §7 이견 수용)**:
  - `apps/web/src/components/sim-canvas.tsx` 또는 `packages/core` — **+~15~30줄** (`window.__simCore.runVsyncDecoupledBenchmark(durationMs)` 명시 계약 인터페이스 + pause/resume renderLoop). tight coupling 해소 + silent-break 방어(null 대신 명시 fail)
  - 이 경우 apps/packages 변경은 **예측 위반이 아니라 설계된 분기** (§4 위반 임계가 (b2) 트리거로 승화)
- **위반 임계**: (b1) 선택인데 `apps/**`/`packages/**` 변경 발생 = 재진입 간섭 실측 신호 → (b2) 로 전환(예측 위반 아님, 분기 전이). 스크립트 변경이 예측 ±50% 초과 시 설계 가정 재검토

### 예측 2 — 수치 DoD (calibration 후 확정)

- **D-1 (분리 실증)**: diagnostic dispatch 에서 정상 run 은 `renderCapacityFps ≥ CAPACITY_FULL_MIN`, 락 run 은 `rafFps ∈ [28,36] AND renderCapacityFps ≥ CAPACITY_FULL_MIN` (H2 확정) — 분리 마진 ≥ (calibration 으로 확정, 잠정 ≥ 15fps gap)
- **D-2 (진짜 회귀 미은폐)**: `simulate=regression`(rAF 저 + capacity 저) → 최종 FAIL, 메일 1통
- **D-3 (락 흡수)**: `simulate=vsync-lock`(rAF∈[28,36] + capacity full + mobile full) → 최종 PASS(annotation) , 메일 0
- **위반 임계**: D-1 에서 락 run 의 capacity 가 rAF 와 근접(H2 반증 = H3) → 옵션 (b) 무효, §6 contingency 발동

### 예측 3 — 인접 무영향 (보조)

- earth-focus / moon-focus / mobile 전 scenario 판정 로직 불변(desktop-band 감지가 이들을 건드리지 않음)
- 정상 run 의 최종 exit code / 판정 결과 불변(비-락 케이스 회귀 0)
- **위반 임계**: 정상 run 에서 새 false-positive 발생 → 감지식 boundary 재검토

---

## §5 결정 (Accepted — 사용자 확정 2026-07-10)

> **사용자 확정 (2026-07-10)**: 옵션 **(b1 무침범) + (d) 워밍업 재측정 1차 레이어 + (a) 비대칭 보조 로그 + (#779) fresh-machine escalation 폴백** 채택. Q2 — measurement-first **Phase 0 게이트를 구현 전 선행**으로 상향(architect 절충 "머지 후 자연 락 확정" → agy 원권고 "Accepted 전 measurement-first phase" 채택). Q4(baseline 49.9 재-baseline)는 **별건 분리**(§8).

### Phase 구조 (사용자 확정 — measurement-first 게이트 선행)

- **Phase 0 (게이트, 구현 전 선행)** — render-capacity **측정 전용** diagnostic 을 스크립트에 추가(판정 로직 없음). CI dispatch 로 (1) 정상 상태 + (2) **CPU throttle 강화(8~10x)로 데드라인 미스 결정적 유발** 상태의 `renderCapacityFps` vs `rafFps` 분포를 실측 → **H2(capacity 정상) vs H3(capacity 저) 판별** + `CAPACITY_FULL_MIN` calibration. 결과를 **§Amendment 로 박제**. **H2 지지 시에만 Phase 1 착수**; H3 지배 시 §6 contingency 로 방향 전환.
- **Phase 1 (본구현)** — Phase 0 이 H2 확정 시 아래 감지·분류·재측정 파이프라인 + simulate hook 구현.
- **Phase 2 (머지 후 실측)** — 자연 30Hz 락 1회 흡수(분류=락 + workflow success + 메일 0) 실측 박제 후 이슈 종결.

### 감지·분류·재측정 파이프라인 (권장안 기준)

```
measureScenario(desktop, sc):
  1. setup + (기존) best-of-N rAF 측정 → rafFps
  2. if rafFps ∈ [VSYNC_BAND_LO=28, VSYNC_BAND_HI=36]:            # 감지 (issue 명시)
       a. (d) 워밍업 폐기 same-page 재측정 → 다시 60이면 clear   # transient 변종
       b. 여전히 band → measureRenderCapacity(__simCore.scene)   # (b) margin-독립 재측정
          - capacityFps ≥ CAPACITY_FULL_MIN  → vsyncLock=true (annotation, 회귀 카운트 제외)
          - capacityFps <  CAPACITY_FULL_MIN → vsyncLock=false → 진짜 회귀(FAIL)
          - capacityFps == null              → 미상 → 기존 escalation 경로(FAIL 방향)
       c. (a) mobile 대응 scenario full-rate 여부를 corroborating 로그로 병기
  3. compareBaseline: vsyncLock 확정 scenario 는 회귀 실패에서 제외(단 capacity 양성 입증 하에서만)
```

- **판정식 명시 (condition 1/4)**: `vsyncLock(desktop, sc) := rafFps ∈ [28,36] ∧ renderCapacityFps ≥ CAPACITY_FULL_MIN`. `CAPACITY_FULL_MIN` = CI calibration 확정값. **Amendment 1 정정**: 초안의 잠정 "45~50"(capacity 가 fps 오더일 것으로 예상)은 실측에서 **수백~수천 fps 오더**(동기 render() 루프는 vsync 대기 없이 최대 반복)로 확인됨 → 잠정 **400** (Amendment 1 §calibration 참조, Phase 1 simulate + 자연 락 확정).
- **margin 독립 (condition 2)**: capacity 프로브는 baseline×(1−margin) 비교와 무관한 **별도 측정 경로**. margin 완화 0.

#### `measureRenderCapacity` 프로브 안전 규약 (cross-validate 반영 — §7)

```
measureRenderCapacity(scene, { windowMs=200, warmupMs=50, maxIterations=5000 }):
  // 1. 워밍업 (GC/JIT 안정화, 카운트 제외) — GC pause 오염 완화
  for (t0=now; now-t0 < warmupMs; ) scene.render();
  // 2. 측정 — 시간 AND 반복횟수 2중 종료조건 (hang/좀비 원천 봉쇄)
  n=0; s0=now;
  for (; (now-s0) < windowMs && n < maxIterations; n++) scene.render();
  return n * 1000 / (now - s0);
```

- **2중 종료조건 (agy 수용)**: `windowMs` 시간 상한 + `maxIterations` 반복 상한. CPU 4x throttle + 클럭 정밀도 이슈로 시간 루프가 hang 될 위험을 반복횟수 cap 으로 원천 봉쇄.
- **짧은 윈도우 + 워밍업 (agy 수용)**: `windowMs` 100~200ms (5s 아님) + `warmupMs` 워밍업으로 GC pause 오염 최소화. 짧은 윈도우의 noise 는 calibration diagnostic 에서 안정성 확인 후 확정.
- **재진입 (Claude 재분석 — §7 이견 부분 수용)**: 프로브는 `page.evaluate` 내 **동기 루프**라 JS 단일 스레드가 rAF `runRenderLoop` 를 프로브 동안 starve → **진짜 동시성 없음** → 별도 `pauseRenderLoop` API 불요(b1 무침범 유지). 단 swiftshader 에서 `scene.render()` 내부 비동기성/hang 여부는 **dev D1 실측 게이트**. 간섭 확인 시 b2(코어 pause/benchmark API)로 승격 = §4 무침범 예측 위반 임계의 **설계된 분기**.

### simulate hook 설계 (condition 검증 — #779 패턴 확장, script-level)

#779 의 simulate 는 **워크플로 레벨**(`SIMULATE_GUARD_FAIL` 이 shell 에서 `return 1`)이라 escalation **토폴로지**를 검증한다. 본 이슈는 **스크립트의 분류 로직**을 검증해야 하므로 **script-level 주입**이 필요(직교 신설):

- `SIMULATE_VSYNC_LOCK=1` — `measureFps`(desktop)가 band 값(예 31) 반환 + `measureRenderCapacity` 가 healthy 값(예 90) 반환 + mobile full → **분류=락, 최종 PASS, annotation 존재** 결정적 재현
- `SIMULATE_REGRESSION=1` — `measureFps` 저 + `measureRenderCapacity` 저(예 28) + mobile 동반 저 → **분류=회귀, 최종 FAIL** 결정적 재현
- `simulate=none` — 실측
- **워크플로 노출**: `fps-baseline-guard.yml` 의 `simulate` choice input 에 `vsync-lock` 추가(기본 none, 수동 dispatch 전용). dispatch `--ref feature/*` 가 ref 브랜치 스크립트/워크플로를 따르므로(#709/#779 실측) **PR 단계 결정적 3중 검증 가능**.

### DoD — Phase 0 게이트 / PR 단계 / 머지 후 실측 분리 (workflow_dispatch 2단계 함정 대응)

**Phase 0 (구현 전 게이트 — H2/임계 판별, 사용자 확정 최우선)**:

- [ ] render-capacity diagnostic(측정 전용)이 로컬 macOS 에서 재진입/hang 없이 신뢰 측정(dev D1 게이트 — macOS 는 락 미재현이나 프로브 자체 동작·재진입 무해성은 검증 가능)
- [ ] CI dispatch: 정상 상태 `renderCapacityFps` 분포 실측(`CAPACITY_FULL_MIN` 하한 근거)
- [ ] CI dispatch: CPU throttle 8~10x 강화로 `rafFps` 데드라인 미스 유발 → 그 상태 `renderCapacityFps` 실측 → **H2(capacity ≥ 정상) vs H3(capacity 저) 판별**
- [ ] 판별 결과 §Amendment 박제 + Phase 1 진행/§6 contingency 결정

**PR 단계 (Phase 1 — 머지 전 결정적 검증 가능)**:

- [ ] 로컬 `SIMULATE_VSYNC_LOCK=1 node scripts/verify-fps-baseline.mjs` → 분류=락 + exit 0 + annotation
- [ ] 로컬 `SIMULATE_REGRESSION=1 ...` → 분류=회귀 + exit 1 (진짜 회귀 미은폐 실증)
- [ ] 로컬 `simulate=none` 정상 → 비-락 경로 회귀 0
- [ ] `gh workflow run fps-baseline-guard.yml --ref feature/820-fps-vsync-lock -f simulate=vsync-lock` → conclusion=success, 메일 0, STEP_SUMMARY 흡수 기록
- [ ] `-f simulate=regression` → conclusion=failure, 메일 정확 1통
- [ ] 가드 도입 PR DoD 4축: 축1(격리 동적)=simulate 로컬 3종, 축2(3중 시뮬)=none/vsync-lock/regression, 축3(5페르소나 self-consistency)=N/A(판정이 수치 결정적, 텍스트 매칭 가드 아님) 사유 박제, 축4(메타 자기적용)=N/A 사유 박제
- [ ] Concrete Prediction §4 무침범 실측(`git diff --stat` — apps/packages 0줄)

**머지 후 실측 의무 (Phase 2 — 자연 관찰, 이슈 #820 박제 후 종결)**:

- [ ] 다음 자연 30Hz 락 발생 시: 분류=락 + workflow success + 메일 0 실측 박제 (현 빈도 릴리스당 1~2회 → 대기 짧음). Phase 0 게이트에서 확정한 `CAPACITY_FULL_MIN` 이 실제 자연 락에서도 유효한지 검증(불일치 시 §6 재검토 2)
- [ ] 릴리스 2회 창에서 30Hz 락 유발 수동 rerun 0 (baseline: #807/#815 = 2건 → 목표 0)

### Fix 후 박제 의무

- 본 ADR §5 결정 갱신(사용자 옵션 + Accepted 전이) + §7 cross-validate 결과 통합
- calibration 확정 후 §판정식 `CAPACITY_FULL_MIN` 실측값 박제 + H2 확정/반증 Amendment
- PR 본문에 §Concrete Prediction 위반 여부 명시

---

## §6 위험 / 재검토 트리거

| 위험                                                 | 회귀 시점                 | 임계/발동                                        | 완화                                                                                                                                                                                |
| ---------------------------------------------------- | ------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H2 반증(락 중 capacity 도 낮음 = H3 지배)**        | calibration diagnostic 시 | 락 run capacity < CAPACITY_FULL_MIN              | 옵션 (b) 무효화 → contingency(아래). 락과 회귀가 단일 지표로 분리 불가 확정                                                                                                         |
| 강제 `scene.render()` 루프가 활성 renderLoop 와 간섭 | dev 구현                  | 프로브 중 오류/이중렌더/hang                     | 동기 프로브 루프가 rAF 를 starve → 진짜 동시성 없음(Claude 재분석 §7). 2중 종료조건(`windowMs`+`maxIterations`) + 워밍업. dev D1 실측 간섭 확인 시 b2 코어 pause/benchmark API 승격 |
| 시간 루프 hang / 좀비 (CPU 4x + 클럭 정밀도)         | 프로브 실행               | 시간 종료조건 미도달                             | `maxIterations` 2중 종료조건 원천 봉쇄(agy 수용 §7)                                                                                                                                 |
| GC pause 벤치마크 오염                               | 프로브 실행               | 긴 윈도우 시 가비지 적체                         | `windowMs` 100~200ms 단축 + `warmupMs` 워밍업(agy 수용 §7)                                                                                                                          |
| `CAPACITY_FULL_MIN` 미calibration 하드코딩           | 임계 박제 시              | 데이터 없이 값 고정                              | measurement-first 게이트 — diagnostic 실측 전 Provisional 유지                                                                                                                      |
| desktop-only 진짜 회귀가 [28,36] 착지                | fix 후 임의 시점          | capacity 프로브가 정상 분류하면 무해; H3 시 위험 | 옵션 (b) 가 capacity 로 방어. 비대칭(a) 단독 채택 시 잔존                                                                                                                           |
| `__simCore`/scene API 변경                           | 후속 리팩토링             | 프로브 selector 깨짐                             | 프로브에 null 가드 → null 시 escalation/fail (실패 방향)                                                                                                                            |

### contingency — H2 반증 시 (capacity 도 락 중 낮음)

capacity 프로브가 락과 회귀를 분리 못하면(H3 지배), 단일 머신·단일 지표 해법은 원리적으로 불가. 남는 선택지(별건 재계약):

1. **cross-machine 확률성 이용** — 락은 확률적(일부 머신 60), 회귀는 결정적(전 머신 저). #779 escalation 을 N-머신으로 확장(단 #807 은 3머신 전부 락 → 상한 미보장, 비용↑)
2. **desktop-default 를 hard-fail 집합에서 제외** — desktop-default 만 advisory(soft) 로, 나머지 5 scenario(earth/moon-focus + mobile 전체)를 hard-fail 로 유지. desktop-default 회귀 검출력 손실을 명시 트레이드오프로 박제(guard-design-principles §2 silent 약화 의식적 트레이드오프 형식)
3. **재-baseline + swiftshader vsync 우회 렌더 설정 탐색** — Playwright chromium 플래그로 vsync 비활성/refresh override 가능한지 조사

### 재검토 트리거

1. calibration diagnostic 이 H2 반증 → §contingency 발동
2. simulate hook 이 실제 자연 락과 분류 결과 불일치(머지 후 실측) → 감지식/임계 재검토
3. fresh-machine escalation 도 반복 실패하는 지속 부하 재발(#779 §A1 재검토 6 연장) → cross-machine 확장 vs desktop-default soft-fail 재평가
4. baseline desktop default 49.9 재-baseline 필요 확정(관찰 D) → 별건(§8)

---

## §7 교차검증 반영 사항 (cross-validate 2026-07-10 — agy Antigravity, architecture 모드)

> cross-validate 발동 사유: 측정 방법론 결정 + ADR 신규 (앵커). outcome: **applied (exit 0)**, `plan_bypass: false`, 워킹트리 snapshot diff empty. 로그: `.claude/logs/cross-validate-architecture-20260710-192935.log`. agy 는 옵션 (b) render-capacity 프로브를 아키텍처 최우수로 수렴 + 3대 보완 제시. 맹목 수용 금지 — Claude 재분석으로 1건 부분 반박.

### Claude 편향 셀프 체크 (호출 전, 4종)

- **낙관 편향**: 옵션 (b) capacity 프로브가 "자명하게 옳다" 가정? → H2 미확정을 §6 최상위 위험 + §3 권장 안 선결 조건으로 명시, calibration 게이트로 자명 가정 제거. **통과(단 H2 축을 cross-validate 명시 질문에 삽입)**
- **결합 간과**: H2/H3 결합(트리거 B + 관측 A 양자화) 가능성을 §1 H3 결론에 박제. capacity 프로브가 결합 케이스에서 어떤 값을 낼지 미확정 — cross-validate 질문 삽입. **부분 통과 → 명시 질문**
- **폐기 프레이밍**: rAF-count 지표를 성급히 "틀렸다" 프레이밍? → rAF 는 사용자 체감 presentation rate 라 폐기 아닌 **advisory 유지**, capacity 는 보조 분류자로 추가(§3 장기 방향에서만 승격 후보). **통과**
- **순수주의**: 완벽한 단일 지표 고집으로 실용 escalation 폐기? → #779 escalation 을 궁극 폴백으로 유지 + contingency 3안 병기. **통과**

> cross-validate 호출 프롬프트 명시 질문(미통과/부분 축): (1) H2(presentation-side lock, capacity 정상) vs H3(deadline-miss, capacity 저) 중 swiftshader+CPU4x 에서 무엇이 지배적인가 — 강제 `scene.render()` 루프가 vsync 락 중 유의미하게 높은 throughput 을 낼 것으로 보는가? (2) capacity 프로브가 활성 runRenderLoop 와 재진입 간섭 없이 신뢰 측정 가능한가?

### 합의 (즉시 반영)

- **옵션 (b) render-capacity 프로브가 아키텍처 최우수** — margin 완화의 진짜 회귀 은폐 위험 반박 + vsync 이산 양자화 특성 근거 rAF-decoupled 설계 타당. agy 동의.
- **H2 대전제 = 최상위 위험, measurement-first phase 공식화** — agy: Accepted 전 "데이터 수집 전용 진단 스크립트"로 H2/H3 분포 baseline 선획득 마일스톤 명시 권고. §5 DoD "H2/임계 calibration" 을 **최우선 마일스톤**으로 승격 반영(§6 재검토 1).
- **`maxIterations` 2중 종료조건** (안전 루프 가드) — 시간 루프 hang/좀비 원천 봉쇄. §5 프로브 규약 + §6 위험 반영.
- **짧은 윈도우(100~200ms) + 워밍업** (GC 오염 완화) — §5 프로브 규약 반영.
- **fail-fast/margin-완화-금지 정합** — agy 가 은폐 위험 반박에 동의(guard-design-principles §3 위반 없음 확인).

### 이견 수용 (원안 수정)

- **agy: `__simCore.scene.render()` 직접 호출 = tight coupling → 명시적 계약 인터페이스 `runVsyncDecoupledBenchmark()` 신설 권고**. **원안**: b1 무침범(앱 0줄, `__simCore.scene` 직접 프로브). **수정**: §4 예측을 **(b1) 무침범 vs (b2) 코어 계약 API 2갈래**로 재구조화. b1 을 권장하되 재진입 간섭 실측 시 b2 승격 = §4 위반 임계의 설계된 분기. **수용 근거**: coupling 지적 타당(scene 구조 변경 시 프로브 취약) — 단 b1 은 null 가드 + 실패 시 escalation/fail(실패 방향)로 silent-break 아님. 무침범(#779 A1 패턴) 우선 유지하되 b2 를 정식 분기로 승화.
- **agy: 재진입 pause/resume 메커니즘 누락** — §5 프로브 규약 + §6 위험에 pause 필요성 반영.

### Claude 재분석으로 기각/부분 반려한 agy 제안 (맹목 수용 회피 — volt #51)

- **agy: 재진입 상태 오염 방지 위해 `pauseRenderLoop()` 필수(→ 사실상 코어 API 강제 = 무침범 붕괴)** → **부분 반려**. Claude 재분석: 프로브는 `page.evaluate` 내 **동기 루프**라 JS 단일 스레드가 프로브 동안 rAF `runRenderLoop` 를 starve → **진짜 동시 실행 없음**. 게다가 측정 전 `time-pause`(measureViewport line 211) 로 시뮬레이션 시간 정지 상태 → 프로브 후 dt 스파이크도 무해. 따라서 pause API 는 **필수 아님**(b1 무침범 유지). 단 swiftshader `scene.render()` 내부 비동기성은 미확정 → **dev D1 실측 게이트**로 검증, 간섭 확인 시에만 b2 승격. (agy 의 안전 우려는 `maxIterations` 가드로 별도 흡수 — 이건 수용)
- **agy: measurement-first phase 를 Accepted 전 필수 게이트로** → **부분 반려**. 자연 30Hz 락은 확률적 발생이라 "Accepted 전 자연 락 포착 필수"는 Accepted 무기한 지연 위험. **절충**: simulate hook 으로 **분류 로직**은 PR 단계 결정적 검증 → 머지 가능. `CAPACITY_FULL_MIN` **임계 calibration 은 Provisional 잔존** → 머지 후 자연 락 포착 시 Amendment 로 확정(§5 DoD 머지 후 실측 + §6 재검토 1). 진단을 최우선 마일스톤으로 명시(합의)하되 게이트 강제는 완화.
- **agy: 프레임워크 독립 래퍼(Puppeteer 이관 대비)** → **기각(조치 불요)**. Playwright 이관은 현재 비목표, YAGNI. 잡음.

### 고유 발견 (후속 분리 후보)

- **명시적 `runVsyncDecoupledBenchmark()` 계약 인터페이스의 장기 채택** (coupling 근본 해소) — b1(무침범) 선택 시 본 이슈 범위 밖 → §8 후속 후보. render-capacity authoritative 승격(§8)과 함께 검토.

### 결론: 조건부 통과 → (b) 채택 + b1/b2 분기 + `maxIterations` 가드. **사용자 확정 (2026-07-10)**: (b1)+(d)+(a)+(#779) + **Phase 0 게이트 구현 전 선행**(agy 원권고 "measurement-first phase" 채택 — architect 절충보다 상향). calibration Provisional 잔존 최소화(게이트에서 확정). → **Accepted 전이**

---

## §8 후속 / 분리 이슈

- (후보) render-capacity 를 **authoritative fps 지표로 승격**(rAF advisory 강등) — 재-baseline 필요, 본 이슈 비목표(측정 지표 교체는 별개 결정) → 채택 시 별건 분리. `Builds on: #820`
- (후보) **명시적 `runVsyncDecoupledBenchmark()` 코어 계약 인터페이스** (agy 고유 발견) — b1 무침범 선택 시 coupling 근본 해소용 후속. b2 선택 시 본 이슈에 포함. `Builds on: #820`
- (후보) `fps-lowend-baseline.json` desktop default 49.9 **재-baseline**(관찰 D, 부분 락 캡처 의심) → diagnostic 실측 후 값 확정되면 별건 또는 본 PR 부수

---

## Amendment 1 (2026-07-10) — Phase 0 게이트 실측: H2 확정 → Phase 1 착수

> Phase 0 measurement-first 게이트(사용자 확정 §5) 실행. `--diagnose-variance` 에 render-capacity 프로브를 병기(커밋 843503f)한 뒤, feature 브랜치에서 CLI dispatch 로 정상(4x)/강저하(10x) 분포를 실측했다. **결론: H2(presentation-side 락) 확정 → 옵션 (b) 유효 → Phase 1 착수. §6 contingency 미발동.**

### 측정 설정

- diagnostic dispatch(`gh workflow run --ref feature/820-fps-vsync-lock -f diagnose_variance=true -f cpu_throttle=<rate> -f variance_samples=8`), CI ubuntu-latest swiftshader.
- run 4x = [29088701248](https://github.com/coseo12/astro-simulator/actions/runs/29088701248), 10x = [29088104145](https://github.com/coseo12/astro-simulator/actions/runs/29088104145).
- **부수 관찰(운영 절차)**: 3 rate 동시 dispatch 는 concurrency group(`workflow-sha`)이 동일해 서로 취소됨(4x/8x cancelled) → **순차 실측 필요**. Phase 1 에서 diagnostic dispatch 의 group 에 `cpu_throttle` 포함(진단끼리 병렬 허용) 개선 후보(§8).

### 측정 결과 (rafFps p50 / renderCapacity p50, samples=8)

| throttle | viewport/scenario | rafFps p50    | capacity p50 | capacity 범위 | 비율 |
| -------- | ----------------- | ------------- | ------------ | ------------- | ---- |
| **4x**   | desktop/default   | **33.2** ⚠️락 | **1069**     | 557.8~1289    | 32×  |
| 4x       | desktop/earth     | **33.5** ⚠️락 | 1246         | 705.3~1316    | 37×  |
| 4x       | desktop/moon      | **34.0** ⚠️락 | 1307         | 1240~1450     | 38×  |
| 4x       | mobile/default    | 60.3 정상     | 1517         | 1189~1655     | 25×  |
| 4x       | mobile/earth      | 60.3 정상     | 1695         | 1426~1852     | 28×  |
| 4x       | mobile/moon       | 60.3 정상     | 1490         | 1362~1532     | 25×  |
| **10x**  | desktop/default   | 14.3          | 427          | 66.2~639      | 30×  |
| 10x      | desktop/earth     | 14.1          | 727          | 416~758       | 51×  |
| 10x      | desktop/moon      | 14.8          | 858          | 729~887       | 58×  |
| 10x      | mobile/default    | 18.7          | 719          | 129~844       | 38×  |
| 10x      | mobile/earth      | 18.3          | 772          | 459~881       | 42×  |
| 10x      | mobile/moon       | 18.4          | 736          | 554~815       | 40×  |

### 판별 (H2 확정)

1. **viewport 비대칭 자연 재현(운영 throttle 4x)**: desktop rafFps p50 33(대역 [28,36]) + mobile 60 정상 = #815 시그니처 정확 재현. 즉 **4x(운영 baseline) 에서도 desktop 이 30Hz 락 boundary** — 이번 runner 가 락 상태에 배정됨(락의 확률적 발생을 dispatch 에서 우연 포착).
2. **H2 확정 / H3 배제**: 30Hz 락 상태(desktop 4x, rafFps 33)에서 capacity 1069~1307 = rafFps 의 **32~38배**. 락 desktop capacity(1069~1307)가 **정상 mobile 60Hz capacity(1490~1695)와 같은 오더** → 락은 렌더 능력 저하(H3)가 아니라 **presentation rate 만 vsync 반속으로 snap**(H2). rAF-count 는 실제 렌더 능력을 심각히 과소평가.
3. **capacity 의 throttle 단조 반응**: 4x capacity ~1000~1700 → 10x ~430~860 (throttle 2.5배 강화 → capacity 대략 반감). 즉 capacity 는 실제 CPU raster 작업을 반영(정지 씬 no-op 아님) → **진짜 렌더 회귀 시 capacity 도 하락 → 옵션 (b) 가 진짜 회귀를 감지 가능**(condition 4 확증).
4. **관찰 D 강화(baseline 재-baseline 근거)**: 4x desktop 33 재현은 baseline desktop default **49.9**(30/60 중간값)가 캡처 시점 **부분 락**을 포함했음을 뒷받침 → §8 재-baseline 근거 강화(별건).

### `CAPACITY_FULL_MIN` calibration (잠정 400 — Phase 1 확정)

- **초안 오더 정정**: architect 초안이 예상한 잠정 "45~50"(capacity 가 fps=60 근처일 것)은 오류. 실측 capacity 는 **수백~수천 fps 오더**(동기 render() 루프는 vsync 대기 없이 최대 반복 → "1초당 render() 호출 가능 횟수").
- **판정식 게이트 구조**: `rafFps ∈ [28,36]` 이 선행 게이트 → `CAPACITY_FULL_MIN` 은 "대역 내 rafFps 가 **락이냐 회귀냐**"만 구분. rafFps 가 대역 밖(예 ≤ 20 심한 저하)이면 판정식 미적용 → 기존 회귀 경로가 처리.
- **실측 하한**: 4x 에서 락/정상 capacity 최저 개별 샘플 = 557.8(desktop default 첫 = 워밍업 outlier), 워밍업 제외 실질 ≥ 700.
- **잠정 CAPACITY_FULL_MIN = 400**: 락 실측 하한(~557)의 ~70%. 락은 통과(capacity 1000+ ≫ 400), 진짜 회귀(대역 내 rafFps 인데 capacity 가 락 상태의 절반 이하로 하락)만 배제. **운영 throttle 4x 고정 전제**(capacity 절대값은 throttle/머신 의존 → throttle 변경 시 재calibration).
- **잔여 해석 여지(정직)**: capacity 절대값이 "풀 raster 처리량"인지 "정지 씬 render() 오버헤드 상당분"인지는 추가 여지 있으나, (a) throttle 단조 반응 + (b) 락/정상 동일 오더 두 실측이 H2 를 지지하기에 판별에는 충분. Phase 1 `simulate=regression`(capacity 저 주입)으로 판정식의 회귀 배제를 결정적 검증 + 머지 후 자연 락에서 `CAPACITY_FULL_MIN` 최종 확정(§5 DoD Phase 2).

### DoD Phase 0 충족 확인

- [x] render-capacity diagnostic 로컬 macOS 재진입/hang 없이 신뢰 측정(dev D1, developer 보고 — capacity 캡처 + 완주 + rafFps 재진입 무해)
- [x] CI dispatch 정상 상태 capacity 분포 실측(4x — 위 표)
- [x] CI dispatch throttle 강화로 rafFps 저하 유발 + capacity 실측 → **H2 확정 / H3 배제**(위 판별)
- [x] 판별 결과 §Amendment 박제(본 섹션) + **Phase 1 진행 결정**(§6 contingency 미발동)

## 변경 이력

- 2026-07-10: 초안 작성 (architect, #820 forensic — Provisional)
- 2026-07-10: §7 cross-validate (agy) 통합 — (b) 채택 수렴 + b1/b2 분기 + `maxIterations` 가드 + 재진입 단일스레드 재분석(부분 반려) + calibration Provisional 잔존
- 2026-07-10: **사용자 옵션 확정** — (b1)+(d)+(a)+(#779) 채택 + Q2 measurement-first **Phase 0 게이트 구현 전 선행** 상향(agy 원권고 채택) + Q4 재-baseline 별건 분리. **Provisional → Accepted 전이**
- 2026-07-10: **Amendment 1** — Phase 0 게이트 실측(4x/10x diagnostic dispatch). **H2(presentation-side 락) 확정 / H3 배제** → 옵션 (b) 유효 → Phase 1 착수. `CAPACITY_FULL_MIN` 오더 정정(45~50 → 400 잠정). 4x 에서 30Hz 락 자연 재현(관찰 D 강화)
