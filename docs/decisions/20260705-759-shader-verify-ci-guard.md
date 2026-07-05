# ADR 20260705-759 — 표면 셰이더 verify 6종 CI 상시 가드 (shader-pixel-guard workflow)

- 상태: **Accepted** (cross-validate agy 2026-07-05 — §교차검증 반영 사항 통합)
- 날짜: 2026-07-05
- 이슈: [#759](https://github.com/coseo12/astro-simulator/issues/759)
- 관련: #756 (표면 셰이더 — ADR [20260628-756](20260628-756-procedural-planet-surface.md) §결정 3 tier-c 자동 단색 / §A2 결정 7 r1-guard canvas 미측정), #762/#773/#774/#782/#783 (셰이더 feature 트랙), #779 (flake step-retry / fresh-runner escalation — ADR [20260701-779](20260701-779-ci-alert-fatigue-concurrency.md)), #728 (WebGPU readback 함정 SSoT), #626 (paths-ignore docs skip), #793 (산출물 수명주기 규약 — 합류 지점), PR #796 reviewer 권고 4 (783 diffDirs exitCode)
- 용어: [glossary.md](../glossary.md) — tier / LOD / swiftshader / flake

> **범위 주의**: 본 ADR 은 **설계 결정 박제** 다. 스크립트 정비/워크플로 `.yml` 작성은 developer 가 수행한다 (architect 는 설계 결정 + 실측 전제 검증만).

---

## 배경

카메라/LOD 시대(#378~#737)의 verify 12종은 전부 커밋 + `detect-and-test` CI 통합인 반면, **#756 이후 셰이더 feature 의 verify 6종은 전부 로컬 전용**이다 (4종 untracked / 782·783 은 커밋만 되고 CI 미등록). r1-guard 는 `[data-r1-region]` UI 영역만 clip 캡처하고 **canvas 픽셀은 baseline 대상이 아니므로** (#756 ADR §A2 결정 7), 표면 셰이더 지대는 단위 테스트(GLSL 미러) + fps 가드만 CI 를 지킨다 — **uniform 배선 절단·분기 오염 같은 픽셀 회귀는 단위 테스트가 전부 통과한 채 조용히 퇴행**한다 (#756 이슈 원문 "scene 배선 끊김 = 조용한 퇴행").

통합의 결정적 전제는 "CI swiftshader 환경에서 표면 셰이더가 렌더되는가"였다. CI 는 소프트웨어 렌더 → `detect-gpu-tier` tier-c → `forceOverride:'low'` → **표면 셰이더 자동 미진입** (#756 §결정 3) 이므로, `?gpu=a` tier 강제 플래그 (P11-C #290, `parse-gpu-tier.ts`) 없이는 CI 에서 측정 대상 자체가 렌더되지 않는다. 6종 스크립트는 이미 전부 `?gpu=a` 를 사용한다.

## 실측 근거 (measurement-first, 2026-07-05 architect)

### (1) swiftshader 강제 렌더 실측 — 전제 성립 확인

로컬 headless chromium + `--use-angle=swiftshader` (CI 근사, `_debug-759-swiftshader-tmp.mjs` — 측정 후 rm, volt #67 규약). renderer 문자열 `ANGLE (…SwiftShader Device (LLVM 10.0.0)…)`, `__isSoftwareRenderer=true`, WebGL2 경로 (isWebGPU=false) 확인.

| 케이스            | hfEnergy  | hfEntropy | 판정 호환성                                |
| ----------------- | --------- | --------- | ------------------------------------------ |
| earth surface ON  | 20.39     | **1.188** | ON > OFF 성질 유지 (양 지표)               |
| earth surface OFF | 14.77     | 0.719     |                                            |
| sun surface ON    | 18.13     | **3.501** | 엔트로피 압도적 (774 판정 = 엔트로피 기반) |
| sun surface OFF   | **30.17** | 0.222     | ⚠ hfEnergy 는 OFF 가 더 높음 (glow edge)   |

→ **swiftshader 에서 절차 셰이더 렌더 성립 + 상대 성질(ON>OFF) 판정 호환**. 단 sun 의 hfEnergy 역전이 보여주듯 **엔트로피 기반 상대 판정만 CI 안전** — hfEnergy 절대 임계는 금지.

### (2) 실행 시간 실측 — 시간 예산

로컬 headless (하드웨어 ANGLE Metal, dev server 기동 별도) 6종 전부 exit 0 PASS:

| 스크립트      | 로컬 실측 | 스크립트         | 로컬 실측 |
| ------------- | --------- | ---------------- | --------- |
| 756-surface   | 67s       | 774-sun          | 27s       |
| 762-monotonic | 20s       | 782-rotation     | 59s       |
| 773-light     | 59s       | 783-earth-detail | 14s       |

합계 **246s (4.1분)**. CI ubuntu runner (2-core, swiftshader) 보수 계수 2~3× → **8~13분** + setup (checkout/pnpm/wasm/playwright 캐시 히트 시 ~5-8분) + dev server 기동. `detect-and-test` (~18분) 에 직렬 추가하면 job 이 ~30분+ 로 늘어난다.

### (3) 판정 마진 실측 — 임계 설계 근거

756 하드웨어 headless 실측 hfEntropy (ON vs OFF): earth 1.329/0.914 (1.45×), mars 1.501/0.653 (2.30×), jupiter 1.799/1.184 (1.52×), **moon 2.109/1.694 (1.24× — 최소 마진)**. 773 에서 moon 의 day-side hfEntropy 는 **ON(1.402) < OFF(1.989) 역전** (moon disk 소면적 framing, land/ocean n=64/25 소표본). → 고정 배수 임계 (×1.3 등) 는 moon 에서 즉시 false-fail. **per-body 상대 성질 + dev D1 실측 확정** 이 유일하게 안전하다 ([guard-design-principles](../lessons/guard-design-principles.md) §1 measurement-first).

## 후보 비교

### 축 1 — CI 배치

| 후보                                                          | 장점                                                                                      | 단점                                                                         | 판정     |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------- |
| (a) detect-and-test 에 step 6개 직렬 추가 (기존 패턴)         | 기존 12 가드와 동일 패턴, setup 재사용                                                    | job 18분 → ~30분+. flake 시 전체 job rerun. dev server 6회 재기동 낭비       | 기각     |
| (b) detect-and-test 에 그룹 1 step (단일 서버)                | 서버 기동 1회                                                                             | job 길이 증가 동일. docs-only PR 에서도 실행 (#626 함정 재현)                | 기각     |
| (c) ci.yml 내 별도 job                                        | wall-clock 병렬                                                                           | ci.yml 은 paths filter 없음 → docs-only PR 에서도 8~13분 픽셀 측정           | 기각     |
| **(d) 별도 프로젝트-로컬 workflow (fps-baseline-guard 선례)** | **병렬 + paths-ignore (docs/md/.github 스킵) + 실패 격리 rerun + detect-and-test 무증가** | setup 구간 3번째 복제 (ci.yml r1-guard / fps-guard / 신규) — drift 관리 비용 | **채택** |

### 축 2 — 판정 방식

| 후보                                 | 장점                                                            | 단점                                                                              | 판정          |
| ------------------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------- |
| 절대 임계 (hfEntropy ≥ 1.0 등)       | 단순                                                            | swiftshader/하드웨어 값 상이 + moon 1.24× 마진 → false-fail/false-pass 양방향     | 기각          |
| 픽셀 baseline 스냅샷 (r1-guard 확장) | 회귀 감도 최대                                                  | swiftshader↔실 GPU 픽셀 불일치로 baseline 이원화, 유지비 급증. r1-guard 책임 침범 | 기각 (비목표) |
| **상대 성질 (per-body ON vs OFF)**   | **백엔드 값 편차에 강건 — swiftshader 실측으로 성질 보존 확인** | 감도는 baseline 대비 낮음 (성질 붕괴만 검출)                                      | **채택**      |

### 축 3 — flake retry 포함 여부 (#779 Phase 2 방금 도입)

| 후보                                                 | 판정     | 근거                                                                                                                                         |
| ---------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 처음부터 step-retry 포함                             | 기각     | 기존 9종 중 flake 는 verify:699 (deltaTime 타이밍 의존) 유일. 셰이더 판정은 시간 비의존 성질 검증 — 선제 retry 는 진짜 회귀 흡수 위험만 추가 |
| **fail-fast 시작, flake 실측 1회 시 #779 패턴 편입** | **채택** | measurement-first — flake 주장은 실측 후에만. 편입 절차가 #779 로 이미 표준화되어 비용 낮음                                                  |

## 결정

1. **신규 프로젝트-로컬 workflow `.github/workflows/shader-pixel-guard.yml`** (후보 d)
   - 트리거: `pull_request`/`push` (develop, main) + `paths-ignore: ['**/*.md', 'docs/**', '.github/**']` (fps-baseline-guard 동일 — 단 자기 자신 `.yml` 변경 시 실행되도록 `.github/**` 제외 여부는 dev 가 fps 선례 그대로 답습) + concurrency group (#779 sha 기준)
   - 단일 job: setup (fps-guard measure job 과 동일 구간 — checkout/pnpm/node `.node-version` 핀/rust/wasm-pack/playwright 캐시) → `pnpm build` → **dev server 1회 기동 (단일 포트)** → **6 스크립트 직렬 실행, 각각 exit code 전파 (fail-fast)** → 실패 시 캡처/JSON artifact 업로드 (`retention-days: 7` — cross-validate 수용). `timeout-minutes: 40` (cross-validate 부분 수용 — CI 계수가 2~3× 추정을 초과할 가능성 대비 완충. P1 예측 ≤25분은 유지, D1 실측이 확정하며 30분 초과 실측 시 재검토 트리거 2항 발동)
   - 호출 규약: `HEADFUL=0` (756/773/774/782/783) / `--headless` (762) + `BASE_URL` 주입. CI 에 chrome channel 없음 → headless chromium 폴백 경로가 아닌 **명시적 headless** 로 결정적 실행
2. **스크립트 정비 (최소 수정 원칙 + CI 적합화만)**
   - 4종 untracked 커밋 (756/762/773/774) + `apps/web/package.json` 에 `verify:756-surface / 762-monotonic / 773-light / 774-sun / 782-rotation / 783-earth-detail` 6종 등록 (위치 표준 `apps/web/scripts/` 이미 충족 — #793 잔여와 분리)
   - **756/773 은 판정·exit code 자체가 없음 (측정+JSON 만)** → fail-fast 판정 추가 필수. 762/774/782 는 판정 이미 존재 — 무수정
   - **783 diffDirs CHECK → `process.exitCode=1` fail-fast** (PR #796 reviewer 권고 4 이관 항목 해소)
3. **판정 규약 — per-body 상대 성질, 절대 임계 금지**
   - 756: 4 body 각각 `hfEntropy(ON) − hfEntropy(OFF) ≥ margin` (실측 최소 갭 moon 0.415 / swiftshader earth 0.469 → **가산 마진 방향, 초기 제안 0.15**) + tier-c(?gpu=c) 저디테일 확인. **최종 마진은 dev 가 D1 에서 CI swiftshader 실측 후 확정·정정 박제** (measurement-first 3중 박제 — 코드 주석/PR 본문/ADR Amendment)
   - 773: 4 body `dayMean > nightMean × 2` (실측 최소 saturn 2.14×) + `contrastMean(ON) > contrastMean(OFF)` (moon 포함 4/4 성립 실측) + `purplePct == 0`. **hfEntropy ON>OFF 는 moon 역전 실측으로 판정 축에서 제외** (실측 §3)
4. **비목표**
   - 픽셀 baseline 스냅샷 확장 (r1-guard 와 책임 분리 — r1 = UI 영역 diff, 본 가드 = canvas 성질)
   - 기존 detect-and-test 12 가드 재배치 / setup 구간 composite action 추출 — **후속 이슈 [#802](https://github.com/coseo12/astro-simulator/issues/802) 분리** (rule-of-three 도달 — cross-validate 재권고 2회차 수용하되 본 PR 검증 표면 최소화 원칙으로 분리, 선행 조건 = 본 건 머지)
   - `docs/reports/` 산출물 처분 규약 (#793 범위)

## 결과·재검토 조건

- 기대 효과: 셰이더 feature 5개 지대의 픽셀 회귀 (uniform 배선 절단/분기 오염/광원 붕괴/자전 정지/극관·biome 소실) 가 PR 단계에서 차단. 사용자 D-T2 재발견 비용 (#773 사용자 발견 회귀 선례) → CI 시간 비용으로 치환
- 수용 비용: CI runner 시간 +15~25분/run (병렬이므로 wall-clock 영향 ≈ 0~수분), setup 구간 3중 복제 유지비

### Concrete Prediction

- **P1 (시간 예산)**: 신규 job 총 소요 **≤ 25분** (timeout 40 여유 — cross-validate 완충 반영), `detect-and-test` 실행 시간 증가 **0** — 검증: 도입 PR 의 Actions run 시간 실측 (**실측 6m49s — 적중, CI 계수 1.15×**)
- **P2 (negative 검출력)**: 표면 배선 절단 시뮬레이션 (예: `surfaceDetail` 강제 false 커밋) 에서 **verify:756 + verify:773 최소 2종 FAIL** — 검증: 3중 시뮬레이션 (positive→negative→recovery) 로그
- **P3 (결정성)**: 동일 커밋 2연속 run 판정 동일 (flake 0) — 검증: 도입 PR 에서 rerun 1회
- **P4 (코어 무변경)**: `packages/core` + `apps/web/src` 코드 변경 **0 줄** (스크립트/workflow/package.json 만) — 검증: `git diff --stat` — 실패 시 = 가드가 앱 코드 침범 (재설계 신호)

### 재검토 트리거

- flake 발화 ≥ 1회/주 → #779 Phase 2 step-retry (또는 fresh-runner escalation) 편입. **silent 약화 (판정 완화) 금지** — 의식적 완화는 본 ADR Amendment 로만 ([guard-design-principles](../lessons/guard-design-principles.md) §2)
- job 소요 > 30분 (timeout 발화) → 스크립트 그룹 분할 (2 job 병렬) 재설계
- headless CI 에서 WebGPU 안정 가용 (chromium 플래그 없이) → WebGL2/WebGPU 양 백엔드 매트릭스 재검토 (#756 ADR §재검토 4 parity 항목과 합류)
- setup 구간 3중 복제에서 첫 drift 발견 → composite action 추출 착수 (ADR 20260701-779 §A1 재검토 7)
- 신규 셰이더 feature (R-Phase 확장) 추가 시 → 해당 verify 를 본 workflow 에 등록하는 것을 feature DoD 에 포함 (로컬 전용 verify 재누적 차단)

## 교차검증 반영 사항 (agy 2026-07-05 — 로그 `.claude/logs/cross-validate-architecture-759.log`)

**합의 (이미 반영 확인)**: Q1 moon 처리 — agy 권고 "엔트로피 축만 제외 + 대비/보라 축으로 대체 가드" 는 결정 3 의 773 판정 규약과 **동일** (역전 축 제외 = 명시 박제된 의식적 축소, 대비·purple 축이 moon 커버 유지 — 가드 약화 아님). 756 의 moon 얇은 마진 (1.24×, 갭 0.415) 은 가산 마진 0.15 대비 2.7× 여유 + D1 CI 실측 확정 규약으로 충분. 상대 성질 판정/paths-ignore/별도 workflow 채택 지지. WebGPU 경로 공백 지적은 재검토 트리거 3항에 기박제 (합의 재확인 — 로컬 qa 실 Chrome WebGPU 가 feature 단위 보완).

**부분 수용**: (1) **Q2 시간 예산** — CI 계수 5~8× 가능성 경고 수용: `timeout-minutes` 30→**40** 완충 (조기 timeout noise 방지). P1 ≤25분 예측은 유지 — D1 실측 확정, 30분 초과 시 재검토 2항 (2-job 분할) 발동. (2) **artifact `retention-days: 7`** — 스토리지 누적 방지 (결정 1 반영). (3) **로컬 swiftshader 재현 커맨드** — architect 실측 방식 (`--use-angle=swiftshader`) 을 developer 가 스크립트 env 또는 README 스니펫으로 문서화 (CI 실패 재현 경로). (4) **스크립트 간 실패 격리** — dev server 단일 기동 구조에서 개별 스크립트 비정상 종료 시 잔존 브라우저 정리 (trap) — developer 지시 반영.

**기각 (근거)**: (1) **retry `retries:1` 선주입** — agy 자신이 #779 A1 cross-validate 에서 "flake 미증명 가드에 선제 지연 주입 = 오진 확률 확대, 이력 기반 동적 옵트인이 원칙" 이라 판정한 것과 정면 모순. 축 3 결정 유지 (fail-fast 시작, flake 실측 1회 시 #779 편입). (2) **shadow phase (`continue-on-error` 3~5일)** — continue-on-error 금지 원칙 (silent 약화) + 본 workflow 는 `pull_request` 트리거라 **머지 전 PR 단계에서 실 CI 실측·rerun (P3)·마진 확정 (D1) 이 전부 가능** — 사후 shadow 가 불필요한 구조. (3) **`?gpu=a` dev-환경 게이팅** — 전제 부재: P11-C #290 부터 존재하는 사용자 노출 디버그 플래그의 재사용이며 본 ADR 이 신규 도입하는 것이 아님. 게이팅은 기존 디버그 도구 회귀 + scope 밖 (강제 시 저사양 기기 느려짐은 현재도 동일 — OOM 크래시 주장은 근거 미제시).

**고유 발견 (후속 분리)**: composite action 추출 (3번째 복제 = rule-of-three) → **이슈 #802 즉시 생성** (선행: 본 건 머지. agy 동일 권고 2회 누적으로 "첫 drift 대기" 에서 승격하되 본 PR 과는 분리 — 검증 표면 최소화).

**Claude 편향 셀프 체크 결과**: 낙관적 일정 (의심 축) — agy 가 5~8× 반례 제시 → timeout 완충 + D1 실측 규약으로 해소. 결합 간과 (의심 축) — swiftshader 로컬 근사 ≠ CI 실측 갭은 pull_request 트리거 구조상 머지 전 실측으로 닫힘 확인. 나머지 2종 통과.

## Amendment 1 — D1 마진 확정 + tier-c 판정 축 measurement-first 정정 (2026-07-05 dev, PR #803)

**1. 756 가산 마진 0.15 확정** (결정 3 의 D1 규약 이행 — 3중 박제: `browser-verify-756-surface.mjs` 상단 주석 / PR #803 본문 D1 표 / 본 각주):

| 환경                                    | earth         | mars          | jupiter       | moon              |
| --------------------------------------- | ------------- | ------------- | ------------- | ----------------- |
| CI ubuntu swiftshader (run 28712529835) | 0.768         | 0.873         | 0.688         | **0.359 (최소)**  |
| 로컬 headless 하드웨어 (2회)            | 0.451 / 0.360 | 0.757 / 0.839 | 0.716 / 0.909 | 0.651 / **0.295** |

CI 최소 갭 0.359 = 마진의 2.4×, 전체 관측 최소 (로컬 분산 포함) 0.295 = 1.97× → **0.15 유지**. 배선 절단 negative 실측 시 갭은 −0.13~0.09 로 붕괴 (마진 아래 명확 분리 — 검출력 여유 확인).

**2. tier-c 판정 축 정정 — 픽셀 hfEntropy → lodStats 배선 검증** (결정 3 "tier-c 저디테일 확인" 의 구현 방식 확정): dev 판정 신설 중 기존 756 스크립트 tier-c 시나리오의 **잠재 결함 2건**이 실측으로 드러남 — (a) `?lod=auto` 가 URL `?lod=` 우선 정책 (#677) 으로 tier-c `forceOverride:'low'` 를 무효화해 표면 셰이더가 진입한 채 측정되고 있었음 (실측 lodStats high=2, hfEntropy 1.399 ≈ ON — 판정 부재로 미발각) (b) `focus=earth` 시 #546 satellite guard 가 moon 을 low→mid 승격 (override 이후 후처리 — 문서화된 설계). 픽셀 축은 billboard 축소 후 bbox 대부분이 배경 (로컬 starfield 별 오염 vs CI 검정 — 환경 의존 비결정) 이라 false-fail 원천. → **default view (`?gpu=c`, no focus/lod) 에서 `override==='low' && high===0 && mid===0` 구조 검증**으로 확정 (표면 셰이더는 high/mid variant 에만 부착되므로 구조적 미진입 증명 — 결정적·백엔드 무관). guard-design-principles §1 (measurement-first: broad 설계 → dev 실측 false-positive → precision 정정 박제) 이행.

**3. P1 실측**: 신규 job 총 6m49s (setup ~2m + verify 6종 4m43s) — 예측 ≤25분 대비 27% 수준. CI 계수 실측 ≈ 1.15× (로컬 4.1분 → CI 4.7분. agy 의 5~8× 경고는 미발현 — timeout 40 완충은 유지).

## 참고

- 이슈: [#759](https://github.com/coseo12/astro-simulator/issues/759) (원 범위 + 2026-07-04 확장 코멘트), [#793](https://github.com/coseo12/astro-simulator/issues/793) (산출물 수명주기 — 합류/분리 명시)
- ADR: [20260628-756-procedural-planet-surface.md](20260628-756-procedural-planet-surface.md), [20260701-779-ci-alert-fatigue-concurrency.md](20260701-779-ci-alert-fatigue-concurrency.md)
- 교훈: [guard-pr-dod.md](../lessons/guard-pr-dod.md) (4축 검증), [guard-design-principles.md](../lessons/guard-design-principles.md), [headless-browser-verification.md](../lessons/headless-browser-verification.md)
- reviewer 이관: [PR #796 권고 4](https://github.com/coseo12/astro-simulator/pull/796#issuecomment-4878802356)
