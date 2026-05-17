# ADR: BODY_SCALE R-Phase 정책 — 시각 활성 vs focus 활성 2축 분리 + R-Phase 진입 의무 체크리스트

- **상태**: Accepted
- **날짜**: 2026-05-06
- **결정자**: architect (#412 PM 합의 one-way 모드 5/5, 2026-05-06)
- **관련**:
  - #412 (본 이슈 — BODY_SCALE 미박제 5+ body)
  - #410 / #408 (focus tier oscillate fix, 사용자 D-T2 발견 원천)
  - #397 (NO-OP 재평가 mismatch — 진짜 원인 확정)
  - #402 / `20260504-r-phase-allowlist-guard.md` (R-Phase allowlist — focus 활성 정책 SSoT)
  - `20260425-r1-sun-visualization.md` (R1 sunScale 50 ADR + Amendment 흐름)
  - `20260428-r2-mercury-visualization.md` (R2 mercuryScale 700 ADR)
  - `20260429-r3-venus-visualization.md` (R3 venusScale 800 ADR)
  - `20260430-r3-followup-body-proportion.md` (라운드 2/3 사실 비율 강화 Amendment)
  - 코드 SSoT (정책 적용 대상): `apps/web/src/constants/body-scale.ts`
- **교훈 적용**:
  - "주석 계약 vs 구현 drift" (volt [#49](https://github.com/coseo12/volt/issues/49) — 코드 주석 단독 SSoT 위험. ADR 본문 SSoT + 코드 주석 양방향 참조 채택)
  - "숨은 상수 변형" (volt [#69](https://github.com/coseo12/volt/issues/69) — R-Phase 진입 시 4곳 박제 의무로 drift 차단)
  - "DoD PASS ≠ 제품 동작" (volt [#74](https://github.com/coseo12/volt/issues/74) — qa 헤드리스 0.1982% PASS 와 사용자 인지 불일치의 진짜 원인이 본 이슈)
  - "신규 데이터 ≠ 신규 코드 — ADR 예측 재현" (volt [데이터-not-code-extension] — 본 ADR Concrete Prediction 으로 R4 ≤ 5 라인 검증)
  - "단계 게이트" (volt [#77](https://github.com/coseo12/volt/issues/77) — ADR-only docs PR 패턴, qa 단계 docs only 예외)
  - "sub-agent 멈춤 + worktree base drift" (volt #82 — architect Step 0 worktree 검증 + cross-validate 응답 박제까지 sub-agent 책임 가드)

---

## 배경

### 발견 경위 — 사용자 D-T2 인사이트

PR [#410](https://github.com/coseo12/astro-simulator/pull/410) (#408 focus oscillate fix) 사용자 D-T2 (2026-05-04) 후 사용자 질문:

> "행성 표기 비율은 실제와 현재의 차이는?"

분석 결과 **mercury / venus 외 5+ body (earth / jupiter / neptune / mars / saturn / uranus) 가 BODY_SCALE 미박제** → `DEFAULT_BODY_SCALE = 1.0` 적용 → 사실 도달률 0.14% 점 수준 표시.

이는 두 가지를 동시에 해명한다:
1. 사용자 D-T2 라운드 1 보고 "earth/jupiter/neptune focus 시 잔재" 의 **진짜 원인** (점 수준 표시의 자연 결과, focus 동작은 정상)
2. #397 NO-OP 재평가의 **mismatch 진짜 원인** — qa 헤드리스 측정 (sun-observe 0.1982%) 과 사용자 인지의 불일치 (qa 는 잔존도를 측정했고 사용자는 시각 비율을 봤다)

### 행성 표기 비율 분석 (이슈 본문 인용)

| 행성     | radius (km) | 사실 비율 | BODY_SCALE       | 시각 비율 | 사실 도달률    |
| -------- | ----------- | --------- | ---------------- | --------- | -------------- |
| sun      | 695,700     | 285.1     | **50** (R1 #329) | 20.4      | 7.1% (의도 압축) |
| mercury  | 2,440       | 1.0       | **700** (R3 #385) | 1.00      | 100% (기준)    |
| venus    | 6,052       | 2.48      | **800** (R3 #385) | 2.83      | 114.3% ✅      |
| earth    | 6,371       | 2.61      | **1.0 (미박제)** | 0.0037    | **0.14%** ⚠️ 점 수준 |
| jupiter  | 69,911      | 28.65     | **1.0 (미박제)** | 0.041     | 0.14% ⚠️       |
| neptune  | 24,622      | 10.09     | **1.0 (미박제)** | 0.014     | 0.14% ⚠️       |
| mars / saturn / uranus | — | — | **1.0 (미박제)** | — | —          |

`DEFAULT_BODY_SCALE = 1.0` 의 의미가 R-Phase 시점에 따라 **이중적**이다:
- **의도된 시각화** — sun 압축 (실측 285.1 → 20.4) 은 의도. 압축 비율 7.1% 는 R1 ADR §결정 으로 박제됨
- **의도되지 않은 회귀** — earth/jupiter/neptune/mars/saturn/uranus 의 0.14% 는 **R-Phase 미진입 + BODY_SCALE 미박제** 의 부작용. 정책 박제 SSoT 부재 → 다음 R-Phase 진입 시 drift 가능

### v3 reset 후 정책 SSoT 누락

v3 reset (2026-04-25) 후 R-Phase incremental build 정책은:
- **focus 활성 SSoT**: `R_PHASE_BODY_ALLOWLIST` (#402 ADR `20260504-r-phase-allowlist-guard.md`) — 박제 완료
- **시각 활성 SSoT**: ❌ **부재** — 코드 주석 (`apps/web/src/constants/body-scale.ts`) 만 박제, ADR 본문 SSoT 없음

본 ADR 은 시각 활성 (BODY_SCALE) 측면의 정책 SSoT 를 박제하여 #402 ADR 과 **2축 직교 정책 매트릭스**를 완성한다.

### 통합 vs 분리 결정

본 ADR 은 **정책 박제만** 수행한다 (실제 박제값은 각 R-Phase ADR 의무, 별도 ADR 분리):
- 본 ADR 범위: 정책 (R-Phase 진입 시 BODY_SCALE 박제 의무, 2축 직교성, 진입 의무 체크리스트, mars/saturn/uranus 처리)
- 비-범위 (각 R-Phase ADR 의무): earth/jupiter/neptune 의 실제 BODY_SCALE 값, mars/saturn/uranus 의 R-Phase 정의

이 분리는 v3 reset 메모리 박제 ("R-Phase 진입 시 별도 ADR") 와 정합한다.

---

## 후보 비교

### 축 1 — ADR §정책 SSoT 위치

| 후보 | 장점 | 단점 | 비고 |
| --- | --- | --- | --- |
| A. 코드 주석 단독 (`apps/web/src/constants/body-scale.ts`) | 박제 비용 0 (현재 상태 답습). R-Phase 진입 시 1줄 추가 | **주석 계약 vs 구현 drift 위험** (volt #49). R-Phase 누적 (R4~R10) 시 주석이 길어져 SSoT 신뢰 저하. 외부 (PR/이슈/회고) 에서 인용 어려움 (코드 주석은 인용 안정성 약함) | 즉시 기각 |
| B. ADR 본문 SSoT + 코드 주석에 ADR 링크 (단방향) | ADR SSoT 안정성. 코드 주석 길이 ↓ | ADR 변경 시 코드 주석 갱신 누락 가능 (단방향 참조의 약점) | 차선 |
| **C. ADR 본문 SSoT + 코드 주석 양방향 참조 (ADR ↔ 주석)** | ADR SSoT 안정성 + 코드 주석 drift 감지 (reviewer 가 양쪽 비교 가능). #402 ADR `20260504-r-phase-allowlist-guard.md` 의 패턴 일관 (allowlist SSoT + 주석에 ADR cross-link) | 양쪽 갱신 비용 — but R4/R6/R10 3회뿐이라 ROI 양호 | **채택** |

근거: #388 forensic blind spot 학습 (volt #49) — 코드 주석 단독은 R-Phase 누적 drift 의 양분. ADR 본문 SSoT 가 외부 인용 안정성 (PR/이슈/회고) 보장.

### 축 2 — 2축 분리 정책 매트릭스 박제 형식

| 후보 | 장점 | 단점 | 비고 |
| --- | --- | --- | --- |
| A. 텍스트 서술 ("body 시각 활성과 focus 활성은 직교") | 박제 비용 최소 | 직교성이 추상적 — 구체 사례 (어떤 body 가 어느 분면?) 인용 어려움 | 즉시 기각 |
| B. 4분면 표 (BODY_SCALE 박제 × R-Phase allowlist) | 직교성 즉시 시각화. 각 셀의 현재 body 매핑이 정책 신뢰도 검증 (cell 4 비어있는지 확인) | 표 1개로 끝 — 표현력 부족 가능 | 차선 |
| **C. 4분면 표 + 각 분면 의미 설명 + 현재 body 매핑** | B 의 장점 + 각 분면이 발생할 수 있는 시나리오 (의도된 / 의도되지 않은) 명시. 미래 R-Phase 진입 시 의사결정 가이드 | 박제 비용 ↑ — but 1회 박제 후 R4/R6/R10 3회 인용 → ROI 양호 | **채택** |

### 축 3 — R-Phase 진입 의무 체크리스트 박제 위치

| 후보 | 장점 | 단점 | 비고 |
| --- | --- | --- | --- |
| A. 각 R-Phase ADR 진입 시 갱신 (R4 ADR / R6 ADR / R10 ADR 에 직접 박제) | 진입 PR 의 reviewer 가 ADR 안에서 즉시 검증 | R-Phase 마다 동일 체크리스트 반복 박제 — drift 가능 (#388 forensic 패턴) | 단일 박제 부족 |
| **B. 본 ADR §"R-Phase 진입 의무 체크리스트" 신설 (재사용 SSoT) + 각 R-Phase ADR 박제 시 본 ADR 인용** | drift 방지 (단일 SSoT). 진입 PR reviewer 는 본 ADR 인용 1회로 체크리스트 검증. R4/R6/R10 3회 인용 비용 0 | 본 ADR 본문 길이 ↑ — but 정책 SSoT 의 본질 | **채택** |
| C. 자동화 (ADR hook 으로 BODY_SCALE 자동 검증) | drift 0 | 본 sprint scope 밖 — 자동화 인프라 비용 > drift 방지 ROI (3회 진입) | 후속 인프라 이슈로 분리 (재검토 트리거) |

#402 ADR 의 §결정 4 (4곳 박제 의무) 패턴 일관 — 본 ADR 의 5곳 박제 의무로 확장.

### 축 4 — NO-OP 분기 평가 (Amendment 비용 vs 가치)

| 후보 | 장점 | 단점 | 비고 |
| --- | --- | --- | --- |
| A. NO-OP — 코드 주석 (현재 상태) 유지, 본 ADR 박제 안 함 | 박제 비용 0 | R-Phase 누적 (R4~R10) 시 주석 SSoT 신뢰 저하. 사용자 D-T2 mismatch 진짜 원인 박제 누락 → 다음에 재발견 비용 ↑ (회고 fork 가능). #397 mismatch 가 박제 누락의 직접 결과 (재발 위험) | 즉시 기각 |
| **B. 정책 ADR 박제 (본 안)** | (1) ADR 본문 SSoT 외부 인용 안정성 (2) 2축 직교성 사용자 D-T2 mismatch 진짜 원인 박제 (3) R-Phase 진입 의무 체크리스트 재사용 (4) cross-validate 1회로 단일 모델 편향 노출 | 박제 비용 1 ADR 파일 (~300 라인 추정) + cross-validate 1회 — but 가치 > 비용 | **채택** |

NO-OP 거부 근거: #397 NO-OP 재평가 패턴 (volt [#14](https://github.com/coseo12/volt/issues/14)) 의 적용 범위는 "현재 동작이 이미 만족" 인 경우다. 본 이슈는 **현재 동작이 미박제 (점 수준 회귀) + 정책 SSoT 부재** 라 NO-OP 패턴이 적용 안 됨. 본 ADR 박제 후 회귀 가드 (`R_PHASE_BODY_ALLOWLIST` 의 `R_PHASE_BODY_VISUAL_SCALE` 분리 SSoT) 는 R4 진입 시 검증.

---

## 결정

4축 통합 결정:

### 결정 1 — ADR §정책 SSoT 위치: ADR 본문 + 코드 주석 양방향 참조 (축 1 후보 C)

본 ADR 본문이 BODY_SCALE 정책의 **단일 진실원**.
- 코드 (`apps/web/src/constants/body-scale.ts`) 의 주석은 본 ADR 의 §정책 매트릭스 / §R-Phase 진입 의무 체크리스트 를 인용 (코드 주석 → ADR 단방향 참조 + 본 ADR §참조 → 코드 SSoT 단방향 참조 = 양방향 cross-link)
- R-Phase 진입 PR 에서 reviewer 는 ADR 본문 정책 매트릭스 + 코드 주석 양쪽 갱신 일관성 검증

### 결정 2 — 2축 분리 정책 매트릭스 (축 2 후보 C)

**시각 활성 (BODY_SCALE 박제) × focus 활성 (R-Phase allowlist) 4분면 직교 매트릭스**:

|                          | **R-Phase allowlist 박제** (focus 활성) | **R-Phase 미정의** (focus 차단) |
| ------------------------ | --------------------------------------- | ------------------------------- |
| **BODY_SCALE 박제** (시각 활성) | **분면 I**: 사용자가 보이고 focus 가능 — sun (R1) / mercury (R2) / venus (R3) | **분면 II**: 시각 활성이지만 focus 차단 (이론상 가능, 현재 0 body) |
| **BODY_SCALE 미박제** (점 수준) | **분면 III**: focus 가능하지만 점 수준 (이론상 가능, 현재 0 body) | **분면 IV**: 시각 비활성 + focus 차단 — earth / jupiter / neptune / mars / saturn / uranus (현재) |

각 분면 의미:
- **분면 I (시각 ∧ focus)** — 정상 R-Phase 활성 body. 사용자 D-T2 검증 대상. 현재: sun/mercury/venus
- **분면 II (시각 ∧ ¬focus)** — body 가 시각 활성이지만 focus 는 차단된 상태. 발생 시나리오: BODY_SCALE 박제 후 R-Phase allowlist 갱신 누락 (drift). 현재 0 body — drift 발생 시 본 ADR §재검토 조건 트리거
- **분면 III (¬시각 ∧ focus)** — focus 는 가능하지만 점 수준 표시. 발생 시나리오: R-Phase allowlist 갱신 + BODY_SCALE 박제 누락 (drift). 현재 0 body — 분면 II 와 대칭 drift 신호
- **분면 IV (¬시각 ∧ ¬focus)** — R-Phase 미진입 body. 정상 default 상태. 현재: earth/jupiter/neptune/mars/saturn/uranus

### 결정 3 — R-Phase 진입 의무 체크리스트 (축 3 후보 B)

본 ADR 에 **§"R-Phase 진입 의무 체크리스트"** 신설 (재사용 가능 SSoT). 각 R-Phase ADR (R4 / R6 / R10) 진입 시 본 ADR §체크리스트 인용 1줄로 검증.

체크리스트 (5곳 동시 박제 의무):

1. **BODY_SCALE 박제값 결정** — 해당 R-Phase ADR §결정 N 에 박제값 + 사실 비율 단조성 검증 (이전 R-Phase 박제값과 비교). 예: R4 earth scale 박제 시 R3 venus 시각 비율 (2.83) 와 사실 비율 (2.48 → 2.61) 단조성 검증
2. **`apps/web/src/constants/body-scale.ts` `BODY_SCALE` 룩업에 1줄 추가** — Concrete Prediction (코드 변경 ≤ 5 라인 검증 대상)
3. **`packages/core/src/scene/r-phase-allowlist.ts` `R_PHASE_BODY_ALLOWLIST` 1줄 추가** — focus 활성 동시 박제 (분면 II/III drift 차단). 본 SSoT 는 #402 ADR 의 5곳 동시 박제 의무 1번 항목과 정합
4. **`apps/web/scripts/browser-verify-378-focus.mjs` `FOCUS_BODIES` 갱신** — qa 검증 매트릭스 동시 박제 (메모리 line 67 #424 학습)
5. **CHANGELOG `### Behavior Changes`** — 사용자 관찰 가능 변화 (예: "R4: earth body 가 점 수준 → 시각 활성") 박제

본 5곳 박제는 #402 ADR `20260504-r-phase-allowlist-guard.md` §결정 4 + §Amendment D2 (라운드 2 wasm-safe, **5곳 박제 의무**) 와 합집합 관계. R-Phase 진입 시 본 ADR 5곳 (R-Phase ADR / BODY_SCALE / allowlist / FOCUS_BODIES / CHANGELOG) + #402 D2 5곳 (allowlist / R-Phase ADR / browser-verify-r-phase-allowlist.mjs RPHASE_EXPECTED_ENABLED / scripts/verify-core-exports-immutable.sh / CHANGELOG) **합집합 (중복 제거 후 7곳) 동시 박제 의무**. 본 ADR 은 #402 D2 대비 BODY_SCALE 측면 (체크리스트 #2) + FOCUS_BODIES 측면 (#4) 추가, #402 D2 는 본 ADR 대비 verify-r-phase-allowlist.mjs + verify-core-exports-immutable.sh 추가.

**reviewer 체크 패턴**: 진입 PR 의 git diff 가 본 5곳을 모두 포함하는지 확인. 누락 발견 시 `Changes requested` (CRITICAL #1 박제 의무 위반).

### 결정 4 — NO-OP 거부, 정책 ADR 채택 (축 4 후보 B)

본 ADR 박제로 행동 변화 0 (코드 / 박제값 / 동작 모두 변경 없음). CHANGELOG `### Behavior Changes: None — 정책 박제만, 코드/박제값 변경 0` 명시 (CLAUDE.md PATCH 분류 규칙).

본 ADR 의 가치는 **다음 R-Phase 진입 시점**에 발생:
- R4 (earth) 진입 시 본 ADR §결정 3 체크리스트 인용 → 5곳 동시 박제 → drift 0
- 사용자 D-T2 mismatch 재발 차단 (현재 인지적 부채 박제됨)
- 재사용 SSoT 로 R6 (jupiter) / R10 (neptune) 진입 시점에도 동일 체크리스트 적용

---

## R-Phase 진입 의무 체크리스트 (재사용 SSoT)

R4 (earth) / R6 (jupiter) / R10 (neptune) — 또는 mars/saturn/uranus 신규 R-Phase 정의 시 — 진입 PR 의 architect 단계에서 다음 5곳을 **동시 박제** 한다.

### 1. R-Phase 별 ADR 박제값 결정

- 위치: `docs/decisions/<YYYYMMDD>-r<N>-<body>-visualization.md` (예: `20260601-r4-earth-visualization.md`)
- 내용: BODY_SCALE 박제값 + 사실 비율 단조성 검증 (이전 R-Phase 박제값 대비)
- cross-link: 본 ADR §결정 3 인용 + R1/R2/R3 ADR 인용

### 2. `apps/web/src/constants/body-scale.ts` `BODY_SCALE` 룩업 갱신

- 작업: `BODY_SCALE` `Object.freeze({ ... })` 안에 1줄 추가
- 형식: `<bodyId>: <scale>, // R<N> Amendment <date> — <근거> (sun 대비 px 비 ~<X>%, ADR <link>)`
- 동반: 파일 상단 주석에 R<N> baseline 추가 (R1~R3 baseline 패턴 일관)

### 3. `packages/core/src/scene/r-phase-allowlist.ts` `R_PHASE_BODY_ALLOWLIST` 갱신

- 작업: `R_PHASE_BODY_ALLOWLIST` 배열에 body id 추가
- 형식: `['sun', 'mercury', 'venus', '<newBody>'] as const`
- 동반: 파일 상단 주석 `현재 박제:` 라인에 `R<N> <body> (#<이슈>)` 추가
- 가드: 본 변경은 #402 ADR §결정 4 의 5곳 박제 의무도 동시 충족 (allowlist 측 4곳 + 본 BODY_SCALE 측 1곳)

### 4. `apps/web/scripts/browser-verify-378-focus.mjs` `FOCUS_BODIES` 갱신

- 작업: `FOCUS_BODIES = ['sun', 'mercury', 'venus']` 에 body id 추가
- 의의: qa 검증 매트릭스 (focus tier oscillate 회귀 가드, #408 학습) 동시 박제 — 메모리 line 67 #424 학습 (verify:378-focus FOCUS_BODIES 동시 갱신 누락 회귀 차단)

### 5. CHANGELOG `### Behavior Changes` 박제

- 형식: `### Behavior Changes\n- R<N>: <body> body 가 점 수준 → 시각 활성 (BODY_SCALE = <X>, 사실 비율 도달률 <Y>%)`
- 의의: 다운스트림 사용자가 `harness update` 후 관찰할 행동 변화 박제

### 검증 — git diff stat 매트릭스

진입 PR 의 `git diff develop --stat` 출력에 다음 5개 파일이 모두 포함되어야 한다:

```
docs/decisions/<YYYYMMDD>-r<N>-<body>-visualization.md  | + (신규)
apps/web/src/constants/body-scale.ts                      | +1~2 (1줄 추가 + 주석 1줄)
packages/core/src/scene/r-phase-allowlist.ts              | +1 (배열 1줄 추가)
apps/web/scripts/browser-verify-378-focus.mjs             | +1 (FOCUS_BODIES 1줄 추가)
CHANGELOG.md                                              | + (Behavior Changes 1 bullet)
```

**reviewer 체크 패턴**: 5개 누락 시 `Changes requested`. 4개 이하만 변경되면 drift (분면 II/III 발생 위험).

---

## mars / saturn / uranus 후속 결정

현재 상태 (2026-05-06):
- BODY_SCALE 미박제 (`DEFAULT_BODY_SCALE = 1.0` 적용)
- R-Phase 미정의 (`R_PHASE_BODY_ALLOWLIST` 부재)
- 분면 IV (시각 비활성 ∧ focus 차단)
- **점 수준 유지** — 본 ADR 박제 후에도 동작 변화 0

후속 결정 가이드 (별도 이슈 분리):
- mars / saturn / uranus 의 R-Phase 정의는 **로드맵 v3 incremental** (`docs/phases/roadmap-v3-incremental.md`) 의 R5 / R7 / R8 (또는 별도 R-Phase) 진입 시점에 결정
- 진입 결정 시 본 ADR §"R-Phase 진입 의무 체크리스트" 5곳 동시 박제 의무 적용
- 현재는 분면 IV 유지가 v3 reset 정책 ("태양부터 하나씩 사용자가 명시적으로 visible 하게 incremental build") 와 정합

---

## Concrete Prediction

본 ADR §결정 3 체크리스트가 정책 SSoT 로 작동한다면:

**R4 (earth) 진입 PR 의 코드 변경 (ADR 신규 박제 제외)** 은:
- `apps/web/src/constants/body-scale.ts`: +1~2 라인 (BODY_SCALE 1줄 + 주석 R4 baseline 추가)
- `packages/core/src/scene/r-phase-allowlist.ts`: +1 라인 (배열 1줄 추가)
- `apps/web/scripts/browser-verify-378-focus.mjs`: +1 라인 (FOCUS_BODIES 1줄 추가)
- `CHANGELOG.md`: +2 라인 (Behavior Changes bullet)

**합계: 코드 변경 ≤ 5~6 라인**

검증 시점: R4 진입 PR 머지 직후 `git diff develop -- 'apps/web/src/' 'packages/core/src/' 'scripts/'` `--shortstat` 출력으로 실측. 5~6 라인 초과 시 본 ADR 정책 효과 부족 → 재검토 (자동화 / abstraction 강화 등).

본 Concrete Prediction 은 R1 ADR `20260425-r1-sun-visualization.md` §결과·재검토 조건 의 "R2~R10 추가 시 1줄 추가만으로 처리" 패턴과 정합 — 본 ADR 은 그 패턴의 R-Phase 정책 측 확장.

---

## 결과·재검토 조건

### 정책 효과 검증 (R4 진입 시)

- **검증 1 (체크리스트 작동)**: R4 진입 PR 의 git diff 가 본 ADR §체크리스트 5곳 + #402 ADR `20260504-r-phase-allowlist-guard.md` §Amendment D2 5곳 (`browser-verify-r-phase-allowlist.mjs RPHASE_EXPECTED_ENABLED` + `scripts/verify-core-exports-immutable.sh` 포함) **합집합 (중복 제거 후 7곳) 모두 포함**하는지 확인. 누락 발견 시 본 ADR §결정 3 + #402 ADR §Amendment D2 인용 + Changes requested
- **검증 2 (Concrete Prediction)**: R4 진입 PR 의 코드 변경 ≤ 5~6 라인. 초과 시 본 ADR §재검토 조건 트리거
- **검증 3 (drift 0)**: R4 진입 후 분면 II/III (시각 ∧ ¬focus, ¬시각 ∧ focus) 0 body 유지. 1 body 라도 발생 시 drift 알림 → 본 ADR §재검토

### 재검토 트리거

다음 중 하나 발생 시 본 ADR Amendment 또는 후속 ADR 박제:

1. **R-Phase 진입 PR 의 5곳 박제 누락 1회 이상 발생** — 정책 SSoT 효과 부족 → 자동화 인프라 (체크리스트 검증 스크립트) 후속 이슈 분리 (축 3 후보 C)
2. **분면 II 또는 분면 III 발생 (drift)** — 매트릭스 직교성 위반. 발견 즉시 ADR §결정 2 매트릭스 재검증
3. **R5 (또는 후속) 진입 시 모바일 누적 차단율 검증 실패** — BODY_SCALE 누적 disk area 가 모바일 viewport (375×667) 의 일정 임계 (예: 30%) 초과 시 R3 followup ADR `20260430-r3-followup-body-proportion.md` 패턴으로 라운드 N 재조정 ADR 박제
4. **사용자 D-T2 mismatch 재발** — 사용자가 "BODY_SCALE 박제 후에도 시각 비율 mismatch" 를 보고 시 본 ADR §결정 2 매트릭스 + qa 측정 방법론 재검증

### 회귀 가드 (본 PR 박제 동시 검증)

본 PR 머지 시점에 다음 2개 동작 검증:

- **회귀 가드 1 (코드 영향 0)**: `git diff develop -- 'apps/' 'packages/' '.github/' '*.json' '*.ts' '*.tsx' '*.mjs' 'scripts/'` 출력 0 — DoD-9 검증 항목
- **회귀 가드 2 (CHANGELOG Behavior Changes None)**: 본 PR 의 `### Behavior Changes` 섹션이 `None — 정책 박제만, 코드/박제값 변경 0` 명시 — DoD-5 검증 항목

회귀 가드 통과 = 본 ADR 박제가 실제로 행동 변화 0 + 정책 SSoT 박제만 수행했음을 검증.

### 후속 인프라 분리 (선택)

축 3 후보 C (자동화) 는 본 ADR scope 밖. 다음 조건 중 하나 만족 시 후속 이슈 분리:

- R4 진입 PR 의 5곳 박제 검증 시 reviewer 부담 ↑ (검증 시간 > 5분)
- R6 / R10 누적 시 매트릭스 인코딩 복잡도 ↑ (분면 동적 계산 필요)
- 본 ADR §재검토 트리거 1번 발생

자동화 분리 시 인프라 비용 vs ROI 평가 (R-Phase 진입 3회 × 5곳 박제 = 15회 박제 vs 자동화 스크립트 박제 + 유지 비용) 새 ADR 박제.

---

## Cross-validate

호출 시점: ADR 박제 직후 (CLAUDE.md `## 교차검증` §"정책·설계·ADR 박제 직후 1회 루틴" 적용).
호출 outcome: **applied** (exit 0)
로그: `.claude/logs/cross-validate-architecture-20260506-171018.log`
Outcome JSON: `.claude/logs/cross-validate-architecture-20260506-171018-outcome.json`

### 4축 검증 질문 (Gemini 입력)

1. **정책 SSoT 위치 (결정 1)** — ADR 본문 SSoT + 코드 주석 양방향 참조 채택의 적절성. 단방향 (코드 주석 → ADR) 으로 충분한가? volt #49 학습 적용 적절성
2. **2축 분리 정책 매트릭스 (결정 2)** — 4분면 직교 매트릭스의 표현력. 분면 II / III (drift 분면) 의 정의가 미래 R-Phase 진입 시 의사결정 가이드로 작동하는가?
3. **R-Phase 진입 의무 체크리스트 (결정 3)** — 5곳 박제 의무가 누락 패턴 (volt #69) 차단에 충분한가? 추가 누락 위치가 있는가?
4. **NO-OP 분기 평가 (결정 4)** — NO-OP 거부 근거의 타당성. 정책 박제 비용 대비 가치가 정당한가?

### 교차검증 반영 사항

#### 합의 (Claude 설계와 일치 — 현재 PR 즉시 반영 0건, 4축 모두 원안 보존)

Gemini 총평: "매우 높은 수준의 완성도를 갖춘 뛰어난 설계 문서. 문제의 근본 원인을 정확히 진단하고, 과거 프로젝트에서 얻은 교훈(volt 이슈)을 체계적으로 적용하여 재발을 방지하는 성숙한 프로세스."

- **결정 1 (양방향 참조)** — Gemini 합의: "정책의 SSoT를 코드 주석이 아닌 ADR 본문으로 격상하고, 코드와 상호 참조하는 구조는 매우 바람직. 이는 '주석과 구현의 불일치' 문제를 해결하는 검증된 패턴." 6 검증 기준 중 §1 구조적 완성도 / §2 기술 결정 타당성 (우수) 평가
- **결정 2 (4분면 매트릭스)** — Gemini 합의: "'시각 활성'과 'focus 활성'이라는 두 가지 독립적인 관심사를 분리한 것은 명료하고 확장 가능한 설계. 4분면 표를 통해 각 천체의 현재 상태를 한눈에 파악할 수 있어 복잡성을 효과적으로 관리." §2 기술 결정 타당성 / §3 인터페이스 명확성 (우수) 평가. 분면 II/III drift 신호 정의가 reviewer 가이드로 작동 인정
- **결정 3 (5곳 박제 의무)** — Gemini 합의: "5곳의 코드를 동시에 수정하도록 강제하는 체크리스트는 '숨겨진 상수 변경'으로 인한 버그를 막는 강력한 수단. 프로세스를 통한 품질 보증의 좋은 예시." §3 인터페이스 명확성 / §4 확장성 (우수) 평가. 추가 누락 위치 발견 없음 (현재 5곳이 완전)
- **결정 4 (NO-OP 거부)** — Gemini 합의: "현재 상태가 '의도치 않은 회귀(점 수준 표시)'이므로, 아무것도 하지 않는(NO-OP) 대안을 기각한 것은 타당. 문제를 명확히 인지하고 해결하려는 결정이 돋보임." 정책 박제 비용 대비 가치 정당성 인정
- **§4 확장성 추가 평가**: "Concrete Prediction 섹션에서 다음 R-Phase 추가 시 코드 변경이 5~6라인에 불과할 것이라고 예측한 점은 이 설계가 얼마나 확장에 용이한지를 증명." (검증 기대치 박제됨)

#### 이견 수용 (Gemini 근거 합리적, 수정 반영)

(없음 — 4축 모두 원안 합의, 수정 0건)

#### Claude 재분석으로 기각한 Gemini 제안

(Gemini 응답에 ADR 본문 수정을 요구하는 명시적 제안 0건. 사소한 개선 제안은 §고유 발견 (후속 분리) 로 분류)

#### 고유 발견 (후속 분리)

**Gemini 발견 (개선 제안)**: 'R-Phase 진입 의무 체크리스트' 자동화 — `pnpm run r-phase:add` CLI 스크립트로 5곳 자동 수정.

> Gemini 인용: "스크립트 실행 시, 개발자에게 천체 ID, 새로운 BODY_SCALE 값 등 필요한 정보를 입력받습니다. 입력받은 정보로 체크리스트에 명시된 5개 파일을 자동으로 수정. 기대 효과: 실수 방지 / 생산성 향상 / 정책 강화."

- **Claude 재분석**: 본 ADR §후보 비교 §축 3 후보 C (자동화) 와 정확히 일치하는 제안. 본 ADR 은 이미 §결과·재검토 조건 §"후속 인프라 분리 (선택)" 로 분리 가이드 박제 — 재검토 트리거 (R4 진입 PR 의 5곳 박제 검증 시 reviewer 부담 ↑ / R6/R10 누적 시 매트릭스 인코딩 복잡도 ↑ / 재검토 트리거 1번 발생) 만족 시 자동화 ADR 별도 박제
- **현재 PR 반영 안 함 근거**: (1) 본 sprint scope 외 (PM 박제 비-범위 + Concrete Prediction 검증 전 자동화는 ROI 평가 불가) (2) 자동화는 5곳 수동 박제 누적 데이터 (R4/R6/R10) 가 있어야 ROI 정량 평가 가능 — 현재는 0회 진입 (3) CLAUDE.md `## 교차검증` §"고유 발견의 수용 vs 후속 분리 3단 프로토콜" (2) 범위 체크 — Behavior Changes 에 원 완료 기준과 직교 항목 추가 (자동화 인프라 신규)
- **후속 분리 가이드**: 본 ADR §재검토 트리거 1번 발생 시 (또는 R6 진입 후 누적 데이터 충분 시) 별도 인프라 이슈 박제. Gemini 설계 스케치 (`pnpm run r-phase:add` CLI) 인용 + `Builds on: #412` 링크 + 우선순위 medium

#### 호출 전 Claude 편향 셀프 체크

- **낙관적 일정**: ✅ 통과 — 본 ADR 박제 비용 (1 ADR 파일 + cross-validate 1회) 만 평가, R4 진입 시점 일정 영향 없음
- **결합 간과**: ⚠️ 부분 — 본 ADR §결정 3 의 5곳 박제 의무는 #402 ADR 의 4곳 박제와 일부 결합. 결합 정합성을 cross-validate 결정 3 검증 질문에 명시 (Gemini 합의 결과 — "5곳이 완전")
- **폐기 프레이밍**: ✅ 통과 — 기존 코드 주석 SSoT 를 폐기 안 함 (양방향 참조로 격상). v3 reset 시 폐기한 P12 scale unification 와 별개
- **순수주의**: ✅ 통과 — 자동화 (축 3 후보 C) 를 즉시 도입하지 않고 ROI 양호 시점 후속 분리. Gemini 도 동일 자동화 제안을 했으나 본 ADR 의 후속 분리 가이드가 이미 동등 박제됨 → 현재 PR 반영 안 함이 정합

### Gemini 6 검증 기준 평가 매트릭스

| 검증 기준 | Gemini 평가 | 비고 |
| --- | --- | --- |
| §1 구조적 완성도 | 우수 | ADR 모든 요소 충실, SSoT 격상 + cross-validation 프로세스 |
| §2 기술 결정 타당성 | 우수 | 2축 분리 매트릭스 명료, 5곳 체크리스트 강력, NO-OP 기각 타당 |
| §3 인터페이스 명확성 | 우수 | 본 ADR 자체가 향후 개발자 계약, 4분면이 인터페이스 명료화 |
| §4 확장성 | 우수 | 재사용 프레임워크, 5~6라인 예측이 확장성 증명, 자동화 가능성 열어둠 |
| §5 보안 | 문제 없음 | 개발 프로세스 안전장치, 시스템 안정성 향상 기여 |
| §6 누락 요소 | 사소한 개선 제안 | 자동화 스크립트 (후속 분리 가이드와 일치) |

---

## 참조

- 이슈: [#412 BODY_SCALE 미박제 5+ body — DEFAULT_BODY_SCALE=1.0 점 수준](https://github.com/coseo12/astro-simulator/issues/412)
- PM 코멘트 (스프린트 계약): https://github.com/coseo12/astro-simulator/issues/412#issuecomment-4386085761
- 발견 원천: PR [#410](https://github.com/coseo12/astro-simulator/pull/410) (#408 focus oscillate fix, 사용자 D-T2 2026-05-04)
- 코드 SSoT (정책 적용 대상): [`apps/web/src/constants/body-scale.ts`](../../apps/web/src/constants/body-scale.ts)
- 관련 ADR (R-Phase 박제 흐름):
  - [`20260425-r1-sun-visualization.md`](20260425-r1-sun-visualization.md) — R1 sunScale 50 + Amendment 2026-05-01 (75 → 50)
  - [`20260428-r2-mercury-visualization.md`](20260428-r2-mercury-visualization.md) — R2 mercuryScale 700 (라운드 3)
  - [`20260429-r3-venus-visualization.md`](20260429-r3-venus-visualization.md) — R3 venusScale 800 (라운드 3)
  - [`20260430-r3-followup-body-proportion.md`](20260430-r3-followup-body-proportion.md) — 라운드 2/3 사실 비율 강화 Amendment
- 관련 ADR (focus 활성 정책 — 2축 분리 대응):
  - [`20260504-r-phase-allowlist-guard.md`](20260504-r-phase-allowlist-guard.md) — `R_PHASE_BODY_ALLOWLIST` SSoT + 4곳 박제 의무 (본 ADR 5곳 박제 의무의 4곳 사촌)
  - [`20260504-415-url-sync-guard.md`](20260504-415-url-sync-guard.md) — store mutation 측면 3번째 방어선
- 관련 NO-OP / 회귀 ADR:
  - [`20260503-397-residual-no-op.md`](20260503-397-residual-no-op.md) — NO-OP 재평가 mismatch (본 ADR 이 진짜 원인 박제)
  - [`20260503-378-focus-frustum-fix.md`](20260503-378-focus-frustum-fix.md) — focus 회귀 fix (defense-in-depth 옵션 D 패턴)
  - [`20260504-focus-tier-oscillate-fix.md`](20260504-focus-tier-oscillate-fix.md) — focus tier oscillate fix (#408 → 본 이슈 발견 직접 원천)
- 로드맵: [`docs/phases/roadmap-v3-incremental.md`](../phases/roadmap-v3-incremental.md) — v3 incremental build SSoT
- volt 캡처:
  - volt [#49](https://github.com/coseo12/volt/issues/49) (주석 계약 vs 구현 drift)
  - volt [#69](https://github.com/coseo12/volt/issues/69) (숨은 상수 변형)
  - volt [#74](https://github.com/coseo12/volt/issues/74) (DoD PASS ≠ 제품 동작 — 본 이슈 mismatch 의 일반 패턴)
  - volt [#82](https://github.com/coseo12/volt/issues/82) (sub-agent 멈춤 + worktree drift — 본 architect 단계 적용 가드)
