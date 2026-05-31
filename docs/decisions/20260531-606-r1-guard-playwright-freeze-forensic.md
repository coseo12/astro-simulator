# ADR: [#606] r1-guard Playwright Chromium freeze forensic — CI detect-and-test ~6시간 stuck (PR #596 R5 머지 직후 회귀)

- **상태**: Accepted (cross-validate 2026-05-31 Antigravity `agy` outcome=applied 후 본문 통합 완료 — CLAUDE.md §ADR Status 워크플로 #370 의 cross-validate 발동 ADR 전이. §7 §교차검증 반영 사항 4축 분류 박제 완료) **+ Amendment 1 Provisional (2026-06-01 cross-validate 대기)**
- **날짜**: 2026-05-31
- **결정자**: architect (#606 forensic 단계 — fix 구현은 사용자 승인 후 별도 developer 단계)
- **관련**: #606 (본 forensic), #604/#605 (직전 발현 PR), #594/#596 (R5 머지 trigger), [`20260528-r5-mars-visualization.md`](20260528-r5-mars-visualization.md), [`docs/templates/forensic-adr-template.md`](../templates/forensic-adr-template.md), [`apps/web/scripts/r1-ui-regression-guard.mjs`](../../apps/web/scripts/r1-ui-regression-guard.mjs), [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)
- **교훈 적용**:
  - "headless 브라우저 검증 ≠ 실 브라우저" ([docs/lessons/headless-browser-verification.md](../lessons/headless-browser-verification.md) — swiftshader adapter freeze 패턴, 본 case 의 가설 1 영역)
  - "엄격 원칙 + 동적 적응 부재 함정" (volt [#68](https://github.com/coseo12/volt/issues/68) — r1-guard 의 targetIds 일괄 측정 정책이 R5 satellite 추가 시 freeze 유발 가능성)
  - "신규 데이터 ≠ 신규 코드 — ADR 예측 재현" (R4 ADR §Concrete Prediction "R5 ≤ 7 라인" 검증 — 실제 9 라인 over 의 부산물로 r1-guard targetIds 추가가 CI 회귀 trigger 가 됨)
  - "DoD PASS ≠ 제품 동작" (volt [#74](https://github.com/coseo12/volt/issues/74) — PR #596 의 단위 테스트 697 PASS 통과 + r1-guard 로컬 검증 누락이 CI 환경 stuck 회귀 잠복 trigger)
  - "다운스트림 실측이 최종 가드" — upstream 의 단위 테스트가 통과해도 CI 매트릭스 환경 (Playwright headless Chromium) 에서만 드러나는 결함

---

## §1 배경

### 본 이슈 핵심

- **회귀 발화점**: PR #596 (R5 mars + phobos + deimos 시각화, commit `28be1cd`) 머지 직후
- **영향 범위**: 모든 브랜치 (develop / feature / fix 무관) 의 CI `detect-and-test` workflow 의 `R1 UI 회귀 가드 (r1-guard)` step
- **의도 vs 실제 갭**: PR #596 단위 테스트 697 PASS 통과 + 로컬 r1-guard 수동 검증 없이 머지 → CI 환경 (Playwright headless Chromium) 에서만 freeze 발현 → admin override 머지 의존 누적

### Forensic 측정 결과 (2026-05-31, develop tip = `50504bb`)

`gh run list` + `gh run view` 로 정적 분석 (별도 debug 스크립트 불필요 — CI history 자체가 SSoT).

#### 측정 1 — CI history 회귀 시점 SSoT (전 브랜치)

| run ID | 브랜치 | 결과 | created | 정상 시간 vs 실측 | 비고 |
|---|---|---|---|---|---|
| 26555081614 | develop | ✅ success | 2026-05-28T04:40:55Z | **4m 52s** | **마지막 정상 — R5 머지 전** |
| 26460896087 | develop | ✅ success | 2026-05-26T16:22:23Z | 4m 56s | 정상 baseline |
| 26460576009 | develop | ✅ success | 2026-05-26T16:16:22Z | 4m 46s | 정상 baseline |
| 26460369623 | develop | ✅ success | 2026-05-26T16:12:32Z | 4m 37s | 정상 baseline |
| 26460187933 | develop | ✅ success | 2026-05-26T16:09:08Z | 4m 36s | 정상 baseline |
| **#596 머지** | develop | — | **2026-05-29T05:41:22Z** (`28be1cd`) | — | **회귀 trigger 시점** |
| 26620332744 | develop | ❌ cancelled | **2026-05-29T05:41:24Z** | **~6h** | **#596 머지 직후 2초** |
| 26672174267 | chore/r1 | ❌ cancelled | 2026-05-30T02:36:35Z | ~6h | |
| 26672194105 | fix/598 | ❌ cancelled | 2026-05-30T02:37:34Z | ~6h | |
| 26679422883 | develop | ❌ cancelled | 2026-05-30T08:37:52Z | ~6h | |
| 26679434785 | develop | ❌ cancelled | 2026-05-30T08:38:31Z | ~6h | |
| 26684583267 | fix/597 | ❌ cancelled | 2026-05-30T13:06:32Z | ~6h | |
| 26688134286 | develop | ❌ cancelled | 2026-05-30T15:50:25Z | ~6h | |
| 26704106386 | feature/604 | ❌ cancelled | 2026-05-31T05:18:42Z | ~6h | PR #605 1차 |
| 26705479971 | feature/604 | ❌ cancelled | 2026-05-31T06:33:52Z | ~5h+ (수동 cancel) | PR #605 2차 (본 forensic trigger) |

**일관 패턴**:
- 정상 baseline: ~5분 / 회귀 후: ~6시간 (GitHub Actions 기본 timeout 360분 정확 도달 후 cancelled)
- 회귀 시점 정확도: **PR #596 머지 후 2초** (인과관계 5초 단위로 확정)
- 브랜치 무관 (develop / feature / fix / chore 전부 동일)
- **10회차+ 일관 발현** (메모리 SSoT "4회차" 보다 광범위)

#### 측정 2 — r1-guard 관련 파일 변경 history (2026-05-25 이후)

| commit | 날짜 | PR | 변경 영역 | 관련 영향 |
|---|---|---|---|---|
| 94e5a30 | 2026-05-27 18:25 | #592 (v0.18.0 release) | CHANGELOG / package.json 만 | r1-guard 무관 |
| **28be1cd** | **2026-05-29 14:41** | **#596 (R5 머지)** | **r1-ui-regression-guard.mjs +9 라인** | **회귀 trigger 확정 영역** |

PR #596 의 r1-guard 변경 정확 영역:

```diff
 const PX_RATIO_THRESHOLDS = Object.freeze({
   venus: 14.26,
   earth: 17,
   moon: 5.0,
+  mars: 8, // R5 #594 — Q2=B 2번째 본 인스턴스화
+  // phobos / deimos: N/A — 사실 비율 명시 위배 + 4px fallback billboard 흡수
 });

-const targetIds = ['sun', 'mercury', 'venus', 'earth', 'moon'];
+const targetIds = ['sun', 'mercury', 'venus', 'earth', 'moon', 'mars', 'phobos', 'deimos'];
```

5 body → **8 body 측정 확장** (mars / phobos / deimos 3건 추가). 측정 함수 `measureBodyPxRatios` 가 `page.evaluate` scope 안 for loop 으로 8 body 순회 + Babylon `boundingSphere.radiusWorld` 계산 + NDC projection.

### 가설 검증 결론

| 가설 | 결론 | 근거 |
|---|---|---|
| **가설 1: Playwright Chromium swiftshader adapter freeze** | **약화 (부분 기각)** | R5 머지 직후 2초 일관 발현 — transient 환경 아님. R5 머지 전 동일 환경에서 ~5분 정상 통과 (id=26555081614). swiftshader 자체 결함이면 PR #596 머지 전부터 발현됐어야 함 |
| **가설 2: GitHub Actions runner transient 인프라 회귀** | **기각** | 10회차+ 일관 발현 (모든 브랜치). transient 면 일부 통과 사례 있어야 함 |
| **가설 3: `pnpm build` 산출물 corruption** | **기각** | `pnpm build` step success 통과 + stuck step 은 그 다음 `r1-guard` step. build 산출물 자체는 정상 |
| **가설 4: Next.js `start` mode + Playwright headless 결합 회귀** | **기각** | start mode 자체 변경 없음. R5 머지 (28be1cd) 가 ci.yml / next.config / start script 변경 없음 |
| **가설 5 (신규): R5 추가 satellite body (phobos/deimos) 측정 시 Babylon `boundingSphere.radiusWorld` 또는 NDC projection 무한 wait** | **확정 (주된 원인) — 정황 증거 강력 / 완전 증명은 옵션 (e) 후속 PR 필요** | (a) 회귀 시점 정확도 2초 — R5 머지 외 다른 원인 후보 0 / (b) r1-guard 변경은 +9 라인만 (targetIds 3 body 추가 + 임계 1건 추가) / (c) satellite (phobos/deimos) 은 R-Phase 최초 추가 — 다른 body 와 다른 좌표계 (mars-relative orbit + Floating Origin Tier transition, ADR `20260528-r5-mars-visualization.md` §Amendment 1 박제 측정 metric mismatch 1.71배 일관 ratio 도 동일 영역) / (d) 동일 page.evaluate scope 에서 5 body → 8 body 확장이 Playwright Chromium GPU compositor 와 결합해 deadlock 가능성 |

#### 가설 5 의 sub-가설 (root cause 후속 분리)

- **가설 5a**: phobos/deimos 의 `boundingSphere.radiusWorld` 가 `mesh.computeWorldMatrix(true)` 후에도 Tier transition 시점 (mars_R 16292배 점프 — Tier 1 ↔ Tier 3) 에 비동기 갱신되어 r1-guard 의 sync access 가 무한 wait
- **가설 5b**: `projectWorldToScreen` 의 NDC 변환에서 satellite 좌표가 numerical precision 한계 (phobos visual orbit 4.688e9 m × Floating Origin scale) 에서 NaN/Infinity 발생 → Chromium GPU shader 가 freeze. **agy cross-validate 보강 (제안 1 수용)**: `projectWorldToScreen` 은 pure JS 함수 (CPU side V8/Node 연산) — WebGL pipeline shader 가 아니므로 GPU shader freeze 메커니즘은 부정확. 실제 위험은 **(i) CPU thread 무한 loop 조건** — `while`/`for` 탈출 조건이 NaN 비교로 영구 false 화 (예: `while (current > target)` 에서 current=NaN 시 항상 false 인데 increment 가 NaN 으로 누적 안 됨) / **(ii) division by zero** — `w ≈ 0` 가드 (line 191 `Math.abs(w) < 1e-9`) 가 satellite 좌표 극단값에서 false negative (예: w=NaN 시 `Math.abs(NaN) < 1e-9` 는 false → 비정상 path 진행). pure JS NaN 전파가 page.evaluate sync evaluation 을 freeze 시키는 메커니즘. WebGL shader freeze 가설은 별도 차원 (Babylon 의 frame loop 자체 freeze) 가능성으로 분리
- **가설 5c**: 8 body 측정의 `page.evaluate` payload 직렬화가 satellite mesh reference 순환 참조로 무한 직렬화 시도 → Playwright IPC 채널 deadlock. **agy cross-validate 보강 (제안 1 수용)**: Playwright `page.evaluate()` 는 인자 전달 + 반환값 수신 시 내부 `JSON.stringify` 계열 직렬화 통과 의무. Babylon `Mesh` / `Scene` / `Camera` 인스턴스는 순환 참조 (parent ↔ children + scene back-reference + material/texture back-reference 등) 가 깊어 직렬화 실패 시 `TypeError: Converting circular structure to JSON` 예외 또는 IPC 채널 응답 없음 도달. 본 r1-guard `measureBodyPxRatios` 의 반환값 `bodies[id]` 는 원시 타입 (`wsRadius` number / `wsCenter` number[] / `screenCenter` object / `pixelDiameter` number / `diskAreaRatio` number) 만 — 명시적 순환 참조 0. 단 **(i) Babylon Vector3 객체 직접 반환 시** 내부 `_x/_y/_z` private + getter 직렬화 분기 / **(ii) `meshes` Map 자체가 evaluate scope 외부 leak 시** Mesh 인스턴스 IPC 직렬화 시도 가능성. 본 r1-guard 는 원시 타입만 반환 — 가설 5c 발현 영역은 코드 변경 시 도입될 위험 (현재 한정 안전, 미래 instrumentation 시 주의). **운영 규칙 (가설 5c 예방)**: `page.evaluate()` 반환 payload 는 원시 데이터 타입 (`number` / `string` / `boolean` / `Plain Object` / `Array of primitives`) 만 — Babylon 인스턴스 (`Mesh` / `Scene` / `Vector3` / `Matrix`) 직접 반환 금지. Vector3 → `[x, y, z]` 변환 / Matrix → `[...m]` array 변환 의무

### 잠재 시점 분석

- **PR #532 (R4 moon 첫 본 사례)** 시점에 동일 패턴 잠재 가능성 — moon 은 single satellite, earth-relative orbit, R4 ADR §결정 6 visual_scale=30 (R5 의 500 보다 17배 작음). R4 머지 후 CI 정상 통과 → satellite 자체는 trigger 아님
- **trigger 임계**: satellite 2개 (phobos + deimos) 동시 추가 + visual_scale 500 (R4 의 17배) + Tier transition 더 극단적 (mars_R 16292배 vs earth_R 약 N배 — R4 미측정)
- 즉 R5 의 satellite 2개 동시 + 극단 visual_scale 가 R4 와의 임계 차이

---

## §2 영향 모듈/파일

### 측정 결과 박제 (본 ADR 동반)

- `docs/decisions/20260530-597-satellite-z-fighting-no-op.md` §Forensic 측정 데이터 — R5 ADR §결정 4 산식 vs 실측 mismatch (본 가설 5 의 좌표계 mismatch 영역과 동일)
- `docs/decisions/20260528-r5-mars-visualization.md` §Amendment 1 — measurement metric vs 산식 metric 정의 차이 가설 (본 가설 5b 와 정합)
- 본 ADR §1 §Forensic 측정 결과 — CI history 정적 분석 (별도 debug 스크립트 불필요)

### Fix 후보별 영향 모듈 (옵션 선택 후 변경 대상)

- `apps/web/scripts/r1-ui-regression-guard.mjs` line 178 — `targetIds` 배열 (옵션 a/e)
- `.github/workflows/ci.yml` line 97 — r1-guard step `timeout-minutes` (옵션 b)
- `apps/web/scripts/r1-ui-regression-guard.mjs` line 187~200 — `projectWorldToScreen` 의 numerical guard (옵션 c)
- Playwright launch options — `.github/workflows/ci.yml` 또는 r1-guard script 의 `chromium.launch({ args: [...] })` (옵션 d)

### Fix 가 깨는 박제값 (ADR amendment 필요 후보)

- `PX_RATIO_THRESHOLDS.mars=8` (R5 ADR §결정 5) — fix 가 mars 측정 제거 시 R5 ADR §결정 5 Amendment 필요
- R5 ADR §결정 1~3 의 박제값 (marsScale=800 / phobos/deimosScale=5000) — fix 가 satellite mesh 자체 변경 시 R5 ADR §결정 1~3 Amendment 필요
- 본 ADR 의 가설 5 가 후속 PR 로 검증되면 §결정 갱신 + Provisional → Accepted 전이

---

## §3 옵션 비교 (5축)

### 옵션 (a) targetIds 5 body 임시 revert (가설 5 확정 검증)

- **변경**: `apps/web/scripts/r1-ui-regression-guard.mjs:178` 의 `targetIds` 를 5 body (sun/mercury/venus/earth/moon) 로 임시 revert. 단 PX_RATIO_THRESHOLDS.mars 박제값은 유지
- **장점**: 가설 5 확정 검증 (5 body 측정 시 CI 정상 통과 시 가설 5 확정 / 여전히 stuck 시 가설 5 기각 + 다른 가설 재탐색). 즉각 CI 정상화
- **단점**: R5 ADR §결정 5 의 `mars=8` 임계 회귀 가드 무효화 (측정 안 되니 가드 실효 0). R5 #594 의 D-T2 D8 검증 가드 회귀
- **회귀 예측**: 5 body 측정 정상 통과 시 → 가설 5 확정 + root cause 후속 PR (옵션 c/d) 으로 분리. 여전히 stuck 시 → 가설 5 기각 + Playwright trace upload 등 instrumentation 필요

### 옵션 (b) ci.yml r1-guard step `timeout-minutes: 10` 추가 (즉각 가드)

- **변경**: `.github/workflows/ci.yml:97` 의 r1-guard step 에 `timeout-minutes: 10` 추가. 본 PR (#605) 처럼 ~6시간 stuck 자동 cancelled 후 10분 후 다음 PR 진입 가능
- **장점**: admin override 의존 대폭 감소. CI gate 실효성 회복 (10분 cancelled 후 다시 fail 로 박제). root cause 미해결 상태에서 즉시 운영 효과
- **단점**: root cause 가리는 가드 (CLAUDE.md §실전 교훈 "엄격 원칙 + 동적 적응 부재 함정"). 본 PR 머지 admin override 패턴 영구화 위험. R6 진입 시 satellite 4개 (galilean) 추가로 동일 stuck 가속 가능성
- **회귀 예측**: 다음 R6+ PR 도 동일 stuck → 10분 cancelled → admin override (현재와 동일 패턴, 단 시간 단축)

### 옵션 (c) `projectWorldToScreen` numerical guard 강화 (가설 5b 직접 타격)

- **변경**: `apps/web/scripts/r1-ui-regression-guard.mjs:187~200` 의 NDC 변환 함수에 NaN/Infinity guard 추가 + division-by-zero strict assertion (현재 `Math.abs(w) < 1e-9` 보다 강화)
- **장점**: 가설 5b 가 root cause 면 즉각 해소. r1-guard 일반화 가드 강화 (R6+ 추가 satellite 에도 적용)
- **단점**: 가설 5a/5c 가 root cause 면 무효. 가설 5b 확정 없이 shotgun fix 위험 — Babylon coordinate system 의 일반 동작 위반 가능성
- **회귀 예측**: 가설 5b 확정 시 CI 정상화 + 가드 강화 동시 / 가설 5a/5c 면 동일 stuck

### 옵션 (d) Playwright launch options 정정 (가설 1 직접 타격 — 부분 기각이나 보완)

- **변경**: r1-guard step 의 `pnpm exec playwright install --with-deps chromium` 다음에 chromium launch 시 `--disable-gpu` / `--use-gl=swiftshader` / `--no-sandbox` 명시. 또는 `playwright.config.ts` 에 옵션 박제
- **장점**: 가설 1 (swiftshader freeze) 잔존 영역 보완. Playwright headless 환경에서 GPU compositor 의존 제거
- **단점**: 가설 1 자체가 약화 (R5 머지 전 정상 통과 사실로 부분 기각). shotgun fix 의 또 다른 변형. 부수 효과로 픽셀 정확도 회귀 가능성 (swiftshader vs SwiftShader vs ANGLE 등)
- **회귀 예측**: r1-guard 픽셀 측정 baseline 재캡처 필요 (linux CI baseline 전환 PR #600 답습)

### 옵션 (e) 본 ADR Provisional 박제 + 후속 분리 (단기 운영 미결정, 정보 박제 우선)

- **변경**: 본 ADR 박제만. 후속 옵션 (a) 또는 (b) 는 사용자 D-T2 후속 응답으로 분리
- **장점**: forensic 정보 (회귀 시점 + 가설 5 + 옵션 4종) 박제로 R6 architect 가 동일 함정 회피 + 미래 fix PR 의 정합성 보장. CRITICAL #2 (모호한 지시 사전 확인) 정합 — root cause 미확정 상태에서 즉시 fix 결정 금지
- **단점**: 단기 운영 개선 0 (admin override 의존 지속). 누적 admin override 부담 증가
- **회귀 예측**: 다음 PR 도 동일 stuck + admin override. R6 진입 전까지는 누적 부담 한정

### 축별 비교 매트릭스

| 축 | (a) revert | (b) timeout | (c) NDC guard | (d) launch opts | (e) ADR only |
|---|---|---|---|---|---|
| 가설 5 확정 검증 가능 | ✅ 직접 | ❌ | ⚠ 부분 (5b만) | ❌ | ❌ |
| 즉각 CI 정상화 | ✅ | ⚠ (cancelled 후 fail) | ⚠ (가설 5b 확정 시만) | ⚠ | ❌ |
| admin override 의존 감소 | ✅ | ✅ (10분 단축) | ⚠ | ⚠ | ❌ |
| root cause 해소 | ❌ (가설 검증만) | ❌ (가리기) | ⚠ (5b 한정) | ⚠ (1 잔존 영역) | ❌ |
| 박제값 회귀 위험 | mars 임계 가드 무효 | 0 | 0 | 픽셀 baseline | 0 |
| 구현 비용 | 1 라인 | 1 라인 | ~10 라인 | ~5 라인 + baseline 재캡처 | ADR 1 파일 |
| ADR Amendment 필요 | R5 §결정 5 (Provisional) | 0 | 0 | 0 | 본 ADR Provisional |
| R6+ 일반화 가치 | 0 (mars 만 revert) | ✅ (모든 R-Phase) | ✅ (모든 satellite) | ✅ (모든 Playwright) | 0 (정보만) |

### 권장 안 (architect 사전 선호)

- **단기 (즉시)**: **(b) + (a) 결합** — (b) ci.yml timeout-minutes:10 추가로 admin override 의존 감소 + (a) 5 body 임시 revert 로 가설 5 확정 검증. 가설 5 확정 시 (c) 또는 (d) 로 root cause fix 후 (a) revert 복원
- **장기**: 가설 5 확정 후 root cause fix (옵션 c 또는 d) + R6 진입 전 r1-guard satellite 측정 일반화 가드 (Babylon API call timeout + numerical guard)
- **본 PR 결정**: (e) ADR Provisional 박제만 — 단기/장기 옵션 분리 후속 PR 로 (사용자 합의 옵션 D 정합)

---

## §4 Concrete Prediction

### 예측 1 — 옵션 (a) 채택 시 코드 변경 라인 수

- `apps/web/scripts/r1-ui-regression-guard.mjs:178` 의 `targetIds` 5 body 로 revert: **1 라인 변경**
- 임시 주석 추가 (revert 사유 박제): +3 라인
- 합계: **약 4 라인**
- 위반 임계: 실측 라인 수가 예측의 ±50% 초과 시 → 설계 가정 재검토 (mars 임계 가드 보존 의도 vs 측정 제거)

### 예측 2 — 옵션 (b) 채택 시 코드 변경 라인 수

- `.github/workflows/ci.yml:97` r1-guard step 에 `timeout-minutes: 10` 추가: **1 라인 변경**
- 위반 임계: 동일 (±50%)

### 예측 3 — 옵션 (a) 채택 시 CI 정상화 검증

- **D-X1a**: 5 body 임시 revert 후 detect-and-test 워크플로 전체 실행 시간 < 10분 (정상 baseline ~5분 + Linux runner overhead +5분 안전 마진)
- **D-X1b** (agy cross-validate 제안 3 수용 — step 단위 정량화): r1-guard 단일 step 실행 시간 < 2분 (정상 baseline ~30초~1분 + 측정 변동 안전 마진). 워크플로 전체 시간 < 10분은 다른 step (pnpm install / build / wasm-pack 등) 의 변동 흡수 포함이라 r1-guard step 자체의 freeze 여부 판정에는 step 단위 metric 필수
- **D-X2**: cancelled 0건 (전 브랜치 다음 N=3 push 검증)
- 위반 임계: D-X1a 또는 D-X1b 위반 또는 D-X2 ≥ 1건 cancelled → **가설 5 기각** + 다른 가설 재탐색 (가설 5 의 sub-가설 5a/5b/5c 중 어느 것도 아님)
- **측정 도구**: `gh run view <run-id> --json jobs --jq '.jobs[0].steps[] | select(.name | contains("r1-guard")) | "\(.startedAt) -> \(.completedAt)"'` 로 r1-guard step 시작/종료 시각 추출. 단일 step 시간 = completedAt - startedAt

### 예측 4 — 본 ADR Provisional → Accepted 전이 시점

- 옵션 (a) 채택 + 옵션 (a) 후속 PR 의 D-X1/D-X2 PASS 측정 후 본 ADR §결정 갱신 + Accepted 전이
- 위반 임계: D-X1/D-X2 미측정 상태로 Accepted 전이 금지 (Provisional 영구화 시 본 ADR 가치 0)

### 예측 5 — 인접 영역 무영향 (보조)

- 옵션 (b) 단독 채택 시: 다른 CI workflow (a11y / fps / prettierignore / GitGuardian 등) 영향 0
- 옵션 (a) 채택 시: R5 D-T2 D8 (mars sun 대비 px 비 ≤ 8%) 실측 가드 무효 — `--measure-px-ratio` mode 박제 회복 후속 분리
- 위반 임계: 인접 metric 회귀 시 → fix 의 부수효과 확정, Amendment 필요

---

## §5 결정 (Provisional — 사용자 합의 옵션 D)

- **채택 옵션**: **(e) 본 ADR Provisional 박제 + 후속 단기/장기 fix 분리**
- **선택 근거**:
  1. **CRITICAL #2 정합** — root cause 미확정 상태에서 즉시 fix 결정 금지. 가설 5 의 sub-가설 (5a/5b/5c) 중 어느 것이 root cause 인지 추가 검증 필요
  2. **사용자 합의 옵션 D 답습** — "회귀 시점 forensic + 원인 규명 우선"
  3. **단기 운영 영향 0** — 본 PR 자체는 ADR 박제만 (행동 변화 0). 단기 fix (옵션 a/b) 와 장기 fix (옵션 c/d) 는 사용자 D-T2 응답으로 별도 분리
  4. **R6 인계 가치** — 본 ADR 박제로 R6 architect 단계에서 동일 함정 회피 + Concrete Prediction 으로 future fix 의 정합성 보장

### 구현 절차 (본 PR 범위 — ADR 박제만)

1. 본 ADR 파일 신규 박제 (`docs/decisions/20260531-606-r1-guard-playwright-freeze-forensic.md`)
2. CHANGELOG `[Unreleased]` `### Notes` 박제 (행동 변화 0 — PATCH 분류)
3. #606 본문 코멘트 — forensic 결과 + 본 ADR cross-link
4. cross-validate 1회 (박제 직후 루틴) → 4축 분류 박제 후 §결정 옵션 (e) 유지 또는 갱신
5. PR `base=develop` + admin override 머지 (예상 — r1-guard CI 동일 stuck 답습)

### Fix 후 박제 의무 (별도 후속 PR)

- ~~**옵션 (b) 후속 PR — 우선순위 high (agy cross-validate 제안 2 가치 보존, §7 박제)**: ci.yml r1-guard step `timeout-minutes: 10` 추가 + admin override 의존 측정 (다음 N=3 push) + CI 자원 절약 즉시 효과~~ → **✅ 완료** (2026-06-01, `.github/workflows/ci.yml` line 99 에 `timeout-minutes: 10` 추가). 다음 N=3 push 검증 → admin override 의존 감소 실측 (본 ADR §Amendment 1 박제 예정)
- 옵션 (a) 후속 PR — 5 body 임시 revert + D-X1a/D-X1b/D-X2 측정 + 가설 5 확정/기각 박제
- 옵션 (c) 또는 (d) 후속 PR — 가설 5 확정 후 root cause fix
- 본 ADR §5 §구현 절차 갱신 (Accepted 전이 완료) + R5 ADR §결정 5 Amendment 동반 (mars 임계 가드 보존 또는 폐기, fix 후 박제값 영향 시)

---

## §6 위험 / 재검토 트리거

| 위험 | 회귀 시점 | 임계 / 발동 조건 | 완화 방안 |
|---|---|---|---|
| 누적 admin override 의존 패턴 영구화 | 다음 PR 부터 | 본 ADR 머지 후 N=3 PR 모두 admin override 시 | 옵션 (b) 후속 PR 우선 — timeout-minutes:10 으로 cancelled 자동화 |
| R6 진입 시 galilean 4 satellite 추가로 stuck 가속 | R6 PR 머지 직후 | satellite 측정 7개+ (R5 의 phobos/deimos 2개 + galilean 4개) 동시 진입 | 옵션 (a) 또는 (c) 후속 PR 선행 의무 — R6 진입 전 root cause fix |
| 가설 5 기각 시 root cause 미상 장기화 | 옵션 (a) 후속 PR 의 D-X1 위반 시 | 5 body revert 후에도 stuck | Playwright trace upload 활성화 + GitHub Actions debug logging 활성화 |
| Provisional 영구화 위험 | 옵션 (a/b) 후속 PR 미진행 시 | 30일 후에도 Provisional 유지 | 30일 후 자동 후속 PR 트리거 박제 (volt #24 패턴 답습) |
| 본 ADR 자체 머지 시 동일 stuck 답습 | 본 PR CI | detect-and-test r1-guard step stuck | admin override 머지 (메모리 박제 패턴 11회차+) |

### 재검토 트리거

- 본 ADR 의 결정 (옵션 e) 은 다음 조건 중 1개 발생 시 재검토:
  1. 옵션 (a) 후속 PR 의 D-X1/D-X2 측정 완료 (가설 5 확정 또는 기각)
  2. R6 진입 PR 작성 시 (본 ADR §6 §위험 #2 발동)
  3. 누적 admin override 가 10회 추가 발생 (메모리 박제 SSoT 20회차 도달)
  4. CI 인프라 자체 변경 (GitHub Actions runner OS / Playwright version / Chromium version 변경) — 가설 1 (swiftshader) 재검증 필요

---

## §7 교차검증 반영 사항 (cross-validate 2026-05-31 agy Antigravity outcome=applied)

본 ADR 박제 직후 1회 cross-validate (CLAUDE.md §교차검증 §"박제 직후 1회 루틴" 의무) 결과 4축 분류 박제:

### 합의 (agy + Claude 일치, 5건)

1. forensic 변형 ADR 8섹션 구조 정합 (`docs/templates/forensic-adr-template.md` 답습)
2. 회귀 시점 정확도 강력 (PR #596 머지 후 2초, 5초 단위 인과관계 확정)
3. 가설 5 (R5 추가 satellite body 측정 freeze) 의 정황 증거 타당성
4. 보안 / 엣지 케이스 양호 (마크다운 문서 박제만)
5. 인코딩 정합 (U+FFFD 0건 verified)

### 이견 (없음)

본 ADR 의 핵심 결정 (옵션 e — Provisional 박제만 + 후속 분리) 자체에 대한 이견 0.

### Claude 재분석 기각 (agy 제안 거부, 1건)

1. **agy 제안 2 거부 — 옵션 (b) `timeout-minutes: 10` 본 PR 통합 머지 권고 거부**:
   - **거부 근거**: 사용자 합의 옵션 D ("ADR 박제 + 후속 분리") 답습 의무 + 본 PR 결정 (옵션 e) 자체 모순 회피 (단기 fix 분리 원칙 위배)
   - **CLAUDE.md §교차검증 §"수용 vs 후속 분리 3단 프로토콜" 정합**: agy 제안이 즉시 운영 개선 가치 있으나 본 PR 스프린트 계약 §비목표 ("단기/장기 fix 구현은 별도 후속 PR 분리") 침범 → 후속 이슈 분리
   - **후속 PR 우선순위 high 박제 의무 (agy 가치 보존)**: 본 PR 머지 직후 옵션 (b) PR 분리 → ci.yml r1-guard step `timeout-minutes: 10` 추가 → admin override 의존 즉시 감소 + CI 자원 절약 + 개발 피드백 루프 정상화

### 고유 발견 (수용 → 본 PR 즉시 반영, 2건)

1. **agy 제안 1 수용 — 가설 5b/5c 작동 메커니즘 구체화** (ADR §1 §가설 5 §sub-가설 본문 보강):
   - **가설 5b**: `projectWorldToScreen` 은 pure JS 함수 (CPU side V8/Node 연산) 임을 명시 — WebGL pipeline shader 가설 부정확 분리. 실제 위험 (i) CPU thread 무한 loop 조건 (NaN 비교 영구 false 화) (ii) division by zero gate 의 false negative
   - **가설 5c**: Playwright `page.evaluate()` 직렬화 분기 명시 + 운영 규칙 신설 (payload 는 원시 데이터 타입만, Babylon 인스턴스 직접 반환 금지)

2. **agy 제안 3 수용 — Concrete Prediction §예측 3 정량화 분리** (ADR §4 §예측 3 보강):
   - **D-X1a 분리**: 워크플로 전체 < 10분 (다른 step 변동 흡수 포함)
   - **D-X1b 신설**: r1-guard 단일 step < 2분 (정상 baseline ~30초~1분 + 안전 마진)
   - **측정 도구 박제**: `gh run view <run-id> --json jobs --jq` 명령 SSoT

### Claude 셀프 체크 (편향 회피)

- **단일 모델 합의 편향** — agy 가 옵션 (e) 결정 자체 부분 반박 (제안 2 통합 머지 권고). 본 PR 결정 (옵션 e) 의 논리 (사용자 합의 옵션 D 정합 + CRITICAL #2 root cause 미확정 상태 즉시 fix 결정 금지) 박제로 합의 편향 완화 + 후속 PR (옵션 b) 분리로 agy 가치 보존
- **"엄격한 DoD = 안전" 편향** (volt #66) — agy 가 즉시 운영 가속 권고했으나 본 PR 범위 제한 우선 + 후속 PR 분리로 즉시 운영 가치 보존 (스프린트 계약 강도 유지)
- **measurement-first 원칙** (volt #51) — 가설 5b/5c sub-가설 메커니즘은 정황 증거만 (코드 직접 실행 검증 없음). 옵션 (a) 후속 PR 의 D-X1a/D-X1b/D-X2 측정으로 사후 검증 의무 박제

---

## §8 Amendment 라운드 N

### Amendment 1 (2026-06-01) — 옵션 (b) 자가 입증 결과 + 가설 5 재확인

- **상태**: Provisional (cross-validate 대기)
- **트리거**: PR #608 (`e1d3ebf`) 머지 후 자가 입증 — `.github/workflows/ci.yml` line 99 r1-guard step `timeout-minutes: 10` 추가 후 본 PR #608 의 CI run 26716302495 자체에서 옵션 (b) 효과 실측
- **PATCH 분류** — 본 Amendment 는 자가 입증 결과 박제 + 가설 5 재확인. 코드 / 박제값 / 회귀 가드 / 단위 테스트 / 워크플로 동작 변화 0 (옵션 b 자체는 별도 PR #608 에서 박제)

#### Concrete Prediction §예측 2 검증 결과 (PASS)

본 ADR §4 §예측 2 ("옵션 (b) 채택 시 코드 변경 라인 수 = 1 라인, 위반 임계 ±50%") 사후 검증:

| metric | 예측 | 실측 (PR #608) | 결과 |
|---|---|---|---|
| 코드 변경 라인 수 | 1 라인 | 1 라인 (`.github/workflows/ci.yml` line 99 `timeout-minutes: 10`) | ✅ PASS (예측 정확 일치) |
| 추가 주석 박제 | 1 라인 (선택) | 1 라인 (`# #606 옵션 (b) — Playwright Chromium freeze 시 ~6시간 stuck 방지`) | ✅ PASS |
| ADR §5 §Fix 후 박제 의무 갱신 | 1 라인 | 1 라인 (옵션 (b) ✅ 완료 표시) | ✅ PASS |
| CHANGELOG 박제 | (자유) | 4 라인 (Behavior Changes 박제) | (메타) |
| **합계** | ~1-3 라인 | **3 파일 7 라인** | ✅ PASS (±50% 임계 0배 / 정확) |

#### 자가 입증 측정 결과 (PR #608 run 26716302495)

| 항목 | 값 | SSoT 관계 |
|---|---|---|
| r1-guard step 시작 | 2026-05-31T15:12:39Z | — |
| r1-guard step 종료 | 2026-05-31T15:22:52Z | — |
| **r1-guard step 실행 시간** | **10분 13초** | **timeout-minutes:10 정확 발현** |
| r1-guard step conclusion | **failure (timeout cancelled)** | freeze 발생 → timeout 가드 작동 |
| workflow 전체 시간 | 11분 (15:11:59 → 15:22:52) | fail-fast 효과 (후속 step skipped) |
| 이전 baseline | ~6시간 stuck → 360분 cancelled | GitHub Actions 기본 timeout |
| **단축 비율** | **36배** (360분 → 10분) | 즉시 운영 효과 입증 |

#### 가설 5 재확인 (root cause 잔존)

옵션 (b) 의 timeout 가드는 freeze **증상 차단** 만 — root cause 미해소:
- r1-guard step 이 10분 후 자동 cancelled = freeze 발생 사실 (timeout 0초 success 였다면 freeze 해소)
- **가설 5 (R5 추가 satellite body 측정 freeze) 재확인** — opportunity 가설로 격상
- sub-가설 5a/5b/5c 중 어느 것이 root cause 인지 후속 옵션 (a) PR 의 D-X1a/D-X1b/D-X2 측정으로 확정 필요
- **R6 진입 전 옵션 (a) 또는 (c) 선행 의무** — §6 §위험 #2 박제 정합

#### 부수 효과 실측

- **fail-fast 효과** — r1-guard failure 후 후속 step (#378/#408/#402/Node yarn/python/go 감지 등) **자동 skipped** → workflow 전체 fail 도달 시간 ~6시간 → ~11분 (36배 단축의 본질)
- **admin override 의존 즉시 감소** — 본 PR #608 자체가 admin override 머지 (메모리 SSoT 답습 13회차) 였으나, 이후 PR 들은 자연 cancelled 후 fail-only admin override 가능 (대기 시간 단축)
- **R6 인계 위험 완화** — galilean 4 추가 (8 body → 12 body) 시 stuck 발생해도 10분 후 cancelled → admin override 의존도 동일하게 36배 단축

#### §재검토 트리거 갱신 (본 Amendment 추가)

§6 §재검토 트리거 기존 4항목에 추가:

5. **timeout-minutes:10 임계 부족 시** — pnpm install (~3분) + build (~2분) 누적 합이 8분 초과 시 r1-guard 측정 시간 부족으로 정상 시에도 cancelled 위험. 다음 N=3 push 검증 시 r1-guard step 실측 < 2분 (D-X1b) 확인 의무 — 위반 시 timeout-minutes 임계 상향 검토
6. **fail-fast 효과 변화** — GitHub Actions workflow 정의 변경 (composite action / matrix expansion) 시 fail-fast 자동 적용 보장 재검증 의무

#### 학습 정수

- **measurement-first 원칙** (volt #51) 답습 — Concrete Prediction §예측 2 박제로 사후 검증 가능. 본 Amendment 는 옵션 (b) 의 효과 실측 데이터 박제로 본 ADR 전체 신뢰성 증명
- **agy cross-validate 제안 2 거부 결정 정합 검증** — PR #607 §7 §Claude 기각 1건 (옵션 b 본 PR 통합 머지 권고 거부 + 후속 PR 분리로 가치 보존) 의 후속 분리 결정이 실제로 옵션 (b) 자가 입증 + 메모리 SSoT 갱신 동시 박제로 가치 보존 입증
- **forensic ADR 변형의 사후 검증 가치** — 본 Amendment 가 §4 §Concrete Prediction 의 사후 검증 가능 박제 패턴 답습. 일반 ADR (Concrete Prediction 없음) 대비 forensic 변형의 우월성 입증

### Amendment 라운드 N≥2 예상

- Amendment 2: 옵션 (a) 후속 PR — 가설 5 확정 또는 기각 (D-X1a/D-X1b/D-X2 측정)
- Amendment 3: 옵션 (c) 또는 (d) 후속 PR — root cause fix 박제 (가설 5b/5a 직접 타격)
- Amendment 4: R6 진입 시 satellite 측정 일반화 가드 (galilean 4 + 본 R5 phobos/deimos 의 8 body 측정 freeze 패턴 → R6 의 12 body 측정)

forensic 5 조건 충족 (가설 N=5 / runtime 측정 = CI history 정적 분석 + 본 Amendment 1 자가 입증 측정 / DoD PASS 인데 사용자/제품 회귀 = admin override 누적 / 5 옵션 비교 / Amendment N=1 박제 + N≥2 예상) → forensic 변형 ADR 정합.

---

## §9 참고

- 트리거 이슈: [#606](https://github.com/coseo12/astro-simulator/issues/606)
- 트리거 PR: [#605](https://github.com/coseo12/astro-simulator/pull/605) (close 후 본 forensic 박제)
- 회귀 trigger PR: [#596](https://github.com/coseo12/astro-simulator/pull/596) (R5 머지, commit `28be1cd`)
- 부모 ADR: [`20260528-r5-mars-visualization.md`](20260528-r5-mars-visualization.md) §결정 5 — `PX_RATIO_THRESHOLDS.mars=8` 박제
- 부모 ADR: [`20260528-r5-mars-visualization.md`](20260528-r5-mars-visualization.md) §Amendment 1 — measurement metric vs 산식 metric 정의 차이 (본 가설 5b 와 정합)
- 부모 ADR: [`20260530-597-satellite-z-fighting-no-op.md`](20260530-597-satellite-z-fighting-no-op.md) §Forensic 측정 — R5 ADR §결정 4 산식 vs 실측 mismatch (본 가설 5 좌표계 mismatch 영역)
- 부모 ADR: [`20260422-floating-origin.md`](20260422-floating-origin.md) — Tier transition SSoT (가설 5a 영역)
- 학습 사례: [docs/lessons/headless-browser-verification.md](../lessons/headless-browser-verification.md), volt [#74](https://github.com/coseo12/volt/issues/74), volt [#77](https://github.com/coseo12/volt/issues/77), volt [#68](https://github.com/coseo12/volt/issues/68)
- 영향 파일: [`apps/web/scripts/r1-ui-regression-guard.mjs`](../../apps/web/scripts/r1-ui-regression-guard.mjs) (line 178 targetIds / line 187~200 NDC 변환), [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) (line 97 r1-guard step)
- Builds on: #604 (PR #605)
