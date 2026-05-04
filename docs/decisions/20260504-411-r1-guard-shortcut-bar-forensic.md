# [#411] r1-guard shortcut-bar 영역 회귀 — forensic + baseline 갱신 결정

- **상태**: Accepted
- **날짜**: 2026-05-04
- **결정자**: architect (#411 forensic 단계)
- **부모 ADR**: [`20260425-r1-ui-pixel-diff-guard.md`](20260425-r1-ui-pixel-diff-guard.md) — r1-guard 정책 / Amendment v4 §결정 2 baseline 갱신 절차 SSoT
- **자매 ADR**: [`20260504-r-phase-allowlist-guard.md`](20260504-r-phase-allowlist-guard.md) — #402 라운드 2 (PR #414) UI 변경 박제 (회귀 원천)
- **형제 forensic 패턴**: [`20260502-379-fix-decision.md`](20260502-379-fix-decision.md), [`20260430-r3-followup-body-proportion.md`](20260430-r3-followup-body-proportion.md)
- **트리거**: PR #410 qa 단계 발견 → develop tip 동일 재현 → CI Linux 실측으로 SSoT 매트릭스 확정

---

## 배경

PR [#410](https://github.com/coseo12/astro-simulator/pull/410) (#408 focus oscillate fix) qa 단계에서 `verify:r1-guard` FAIL 발견. PR #410 diff 영역 (focus tier 전환) 과 직교하나 develop tip 동일 재현. PR #410 무관 별도 잠복.

이슈 [#411](https://github.com/coseo12/astro-simulator/issues/411) 본문은 mismatch 영역을 **"top-nav 6.012% / 4.000% / 10.906%"** 로 박제. 본 forensic 의 첫 결과는 이 라벨이 **SSoT (CI Linux) 측정값이 아니라는 사실**의 식별이다.

### 측정 환경 SSoT 정합성

부모 ADR `20260425-r1-ui-pixel-diff-guard.md` Amendment 1 §결정 1 — baseline 은 **Linux CI 캡처본**. macOS 로컬은 `SKIP_LOCAL=1 + darwin` 시 즉시 PASS 반환 (폰트 차이 false positive 회피, ADR 본문 line 17 + script line 554~556 박제). 따라서 r1-guard 의 **회귀 판정 SSoT 는 CI Linux 환경**.

이슈 본문 6.012% / 4.000% / 10.906% 는 PR #410 qa 단계의 macOS qa worktree 측정값. SKIP_LOCAL 가드가 우회된 경로로 측정된 것으로 추정 (qa 가 의도적으로 강제한 것이거나 worktree 환경변수 미설정). 폰트 렌더링 차이 (San Francisco vs DejaVu/Noto) 가 텍스트 비중이 큰 top-nav 영역에 ≥ 4% 누적 mismatch 를 만든 false positive 로 추정.

---

## forensic 결과 — CI Linux SSoT 매트릭스

CI Linux ci.yml r1-guard step (run `25315774640`, `d2f6adf` PR #414 머지 직후) 실측:

| viewport    | top-nav             | shortcut-bar           | hud-top-right     | hud-bottom-right  |
| ----------- | ------------------- | ---------------------- | ----------------- | ----------------- |
| 1280x720    | ✓ 0.132% (81/61440) | **✗ 1.974% (81/4104)** | ✓ 0.000% (0/2299) | ✓ 0.000% (0/2185) |
| 1920x1080   | ✓ 0.088% (81/92160) | **✗ 1.974% (81/4104)** | ✓ 0.000% (0/2299) | ✓ 0.000% (0/2185) |
| 375x667     | ✓ 0.433% (78/18000) | **✗ 1.122% (78/6950)** | ✓ 0.000% (0/2299) | ✓ 0.000% (0/2185) |
| **overall** |                     |                        |                   | **FAIL**          |

핵심:

- 실제 회귀 영역은 **shortcut-bar (3 viewport 전부 FAIL)**, top-nav 가 아님
- mismatch 절대 픽셀 수가 1280x720 / 1920x1080 동일 (81 픽셀) — selector 기반 crop 이 동일 콘텐츠 영역을 잡고 있음을 시사. 비율 차이는 viewport 별 영역 면적 차이에서만 기인
- 다른 3 sentinel 영역 (`top-nav` / `hud-top-right` / `hud-bottom-right`) 모두 PASS, 회귀 0
- forensic 산출물 SSoT: [`docs/reports/411-forensic/output.json`](../reports/411-forensic/output.json)

### bisect — 회귀 시점 확정

| commit        | PR                                                         | CI ci.yml   | 비고            |
| ------------- | ---------------------------------------------------------- | ----------- | --------------- |
| `658d9d7`     | #410 (#408 focus oscillate fix)                            | **success** | 마지막 PASS     |
| `4975846`     | #413 (#402 ADR Amendment)                                  | **success** | 문서만          |
| **`d2f6adf`** | **#414 (#402 라운드 2 — focus-quick-buttons disabled UI)** | **FAILURE** | **회귀 진입점** |
| `2519f0e`     | #417 (favicon)                                             | failure     | 잠복 유지       |
| `e70c98e`     | #421 (#415 url-sync 가드)                                  | failure     | 잠복 유지       |

**`d2f6adf` (PR #414) 가 단일 회귀 진입점**.

### diff 분석 — `apps/web/src/components/layout/focus-quick-buttons.tsx` (PR #414)

| 변경                                                                                                                         | 시각 영향                                     |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `FOCUS_BUTTONS` 배열에 `venus` 추가 (5 → 6 buttons + reset)                                                                  | shortcut-bar 가로폭 확장 (selector 자동 추적) |
| earth/jupiter/neptune 에 `opacity-50` + `bg-bg-surface/40` + `text-fg-muted` + `border-border-subtle` + `cursor-not-allowed` | 3 buttons 배경/텍스트 색상 직접 변경          |
| `title` (tooltip) / `aria-disabled` / `data-r-phase-disabled` 속성 추가                                                      | 시각 무관 (DOM 속성)                          |

이 컴포넌트는 `data-r1-region="shortcut-bar"` 로 sentinel 박제 (line 40, top-bar.tsx 의 `<header data-r1-region="top-nav">` 자식 slot 으로 렌더). top-bar 가 selector crop 의 부모이지만, shortcut-bar selector 가 자식이므로 r1-guard 는 **두 영역 모두 독립 측정**. shortcut-bar 텍스트/배경/투명도 변경이 직접 1.974% 누적 (selector crop 영역 내). top-nav 는 자식 nesting 부수효과를 포함하나 본 PR 의 영향이 0.5% 임계 이하로 흡수되어 PASS.

R3 venus 진입 시점 (PR #369 / #390 — `d50848f` / `1f0c369`) 의 CI 결과는 **모두 SUCCESS**. 즉 R3 시점에는 baseline 갱신이 정상 진행됐거나 mismatch 가 임계 이하였음 (실측 미확인 — 본 forensic 범위 외, 후속 호기심 검토 가능). PR #414 가 처음으로 baseline 갱신 절차를 누락한 시점.

---

## 원인 분류

부모 ADR `20260425-r1-ui-pixel-diff-guard.md` Amendment v4 §결정 2 가 박제한 baseline 갱신 절차 (5단계) 재현:

1. R-Phase 코드 변경 commit
2. `pnpm verify:r1-guard` 실측 → 의도된 mismatch 확인
3. 별도 commit 으로 `--update` baseline 갱신
4. baseline commit 메시지에 사유 박제
5. PR 본문 + CHANGELOG `### Behavior Changes` 동시 박제

PR #414 는 5단계 모두 미수행. **분류 (1) baseline 갱신 누락**이 단일 원인.

분류 후보 (이슈 본문 가설 4종) 의 본 forensic 판정:

| 분류                                    | 본 forensic 판정                                                                                                                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(1) baseline 갱신 누락**              | ✓ **단일 정답** — PR #414 의 의도된 UI 변경 (venus 신규 + R-Phase disabled 시각화) 이 부모 ADR Amendment v4 §결정 2 절차를 미준수하고 머지됨                                        |
| (2) top-nav 컴포넌트 잠복 변경          | 기각 — `top-bar.tsx` 변경 0, top-nav sentinel CI Linux 측정 PASS                                                                                                                    |
| (3) headless playwright dpr / 환경 차이 | 부분 별건 — macOS qa 측정값 6%/4%/10% 가 false positive 인 점은 환경 차이로 설명되나, **CI Linux 회귀 자체** 와는 무관. SKIP_LOCAL 가드 동작 점검은 별도 이슈 후보 (본 ADR 비-범위) |
| (4) i18n / CHANGELOG 라벨 변경          | 기각 — `apps/web/src/locales/` / locale 파일 변경 0, 라벨 변경 0 (단순 신규 venus button 추가)                                                                                      |

### 프로세스 실패 근본 원인

PR #414 의 architect 단계 (`docs/decisions/20260504-r-phase-allowlist-guard.md` Amendment 라운드 2) 의 핵심 의제는 turbopack `__dirname` SSR 500 회귀 / wasm-safe named export 였다. focus-quick-buttons 의 disabled 시각화는 **R-Phase allowlist UI 측면** 으로 ADR §결정 2 의 부속 결정이었고, **r1-guard sentinel 영향성 검토가 인계되지 않음**.

이는 부모 ADR §재검토 트리거 §2 ("R-Phase 진행에서 의도된 layout shift 가 잦아 baseline 갱신 부담 > PR 당 1회 — selector 안정성 강화 또는 영역 정의 재구조화") 에 직접 매핑되는 운영 신호. 단 본 #411 발생 1회로 즉시 §재검토 트리거 #2 발동은 과대 대응 — 운영 데이터 누적 후 검토 대상 (재검토 조건 §재발 신호 박제).

---

## 결정

### 결정 1 — fix 방향: baseline 재캡처 (ADR Amendment v4 §결정 2 절차 재현)

**채택**: 부모 ADR Amendment v4 §결정 2 의 5단계 절차를 develop tip 에서 재현.

후보 비교:

| 후보                                                               | 의도 매칭 | 실행 비용 | 평가                                                                                                          |
| ------------------------------------------------------------------ | --------- | --------- | ------------------------------------------------------------------------------------------------------------- |
| (a) 코드 fix (focus-quick-buttons disabled UI revert)              | ✗         | 중간      | **탈락** — 의도된 UI 변경 (#402 ADR §결정 2 박제) 을 revert 하면 #402 회귀. ADR 정합성 파괴                   |
| (b) 임계값 강화 (0.5% → 더 작게)                                   | ✗         | 낮음      | **탈락** — 본 회귀와 직교. 부모 ADR §재검토 트리거 #4 별도 영역                                               |
| (c) shortcut-bar selector 영역 재정의 (`fallback1280x720` 추가 등) | ✗         | 높음      | **탈락** — 부모 ADR §결정 2 보존. selector 기반 자동 추적이 정상 동작 (mismatch 가 selector crop 안에서 발생) |
| **(d) baseline 재캡처 (Amendment v4 §결정 2 절차)**                | ✓         | 낮음      | **채택** — 의도된 UI 변경에 정확히 매핑. ADR 박제 절차 그대로 재현 가능                                       |

### 결정 2 — 갱신 범위 (Concrete Prediction)

> **2026-05-04 cross-validate Gemini critical flaw 정정** — 원안은 "shortcut-bar 3장만 변경" 이었으나 부모 ADR Amendment v4 §결과·재검토 조건 의 **6장 갱신 패턴 SSoT (R3~R10 재사용)** 와 충돌. 정정 후: **6장 동시 갱신 (shortcut-bar 3 + top-nav 3)**. PR [#361](https://github.com/coseo12/astro-simulator/pull/361) `bebd741` 패턴 일관. 본 forensic 매트릭스 §forensic 결과 자체에서 top-nav 81 픽셀 mismatch 가 모든 viewport 에서 관찰됨 (비율 0.132% / 0.088% / 0.433% — 0.5% 임계 이하라 r1-guard 테스트는 PASS, 그러나 `--update` 는 임계 무관 절대 스냅샷 → top-nav PNG 도 필연적으로 modified). "테스트 PASS (임계 흡수)" 와 "파일 변경 없음 (binary diff 0)" 는 직교 — 원안은 두 개념 혼동.

baseline 재캡처는 **6장 동시 갱신** (shortcut-bar 3 + top-nav 3):

- `apps/web/scripts/__baselines__/r1/1280x720/shortcut-bar.png` (의도된 변경 — venus 신규 + R-Phase disabled 시각화)
- `apps/web/scripts/__baselines__/r1/1280x720/top-nav.png` (DOM nesting 부수효과 — `<header data-r1-region="top-nav">` 의 child `<div data-r1-region="shortcut-bar">`)
- `apps/web/scripts/__baselines__/r1/1920x1080/shortcut-bar.png`
- `apps/web/scripts/__baselines__/r1/1920x1080/top-nav.png`
- `apps/web/scripts/__baselines__/r1/375x667/shortcut-bar.png`
- `apps/web/scripts/__baselines__/r1/375x667/top-nav.png`

다른 6장 (hud-top-right / hud-bottom-right × 3 viewport) **변경 0** 의무 — top-bar 와 별도 영역이라 nesting 부수효과 없음, R-Phase 회귀 0 검증 가드. reviewer 는 `git show <baseline-commit> --stat` 로 6장 변경 + hud × 6 변경 0 동시 검증 (부모 ADR Amendment v4 §결정 3 reviewer 의무 1 일관).

### 결정 3 — 실행 경로

**옵션 A (권고)** — developer 가 CI Linux 환경에서 r1-baseline-bootstrap workflow_dispatch 트리거:

```bash
gh workflow run r1-baseline-bootstrap.yml --ref develop
# workflow 내부에서 --update + peter-evans/create-pull-request 자동 PR 생성
# developer 는 자동 생성 PR 검토 후 본 #411 의 sprint 와 통합
```

**옵션 B (대안)** — developer 가 Linux 환경 (또는 act 등 동등 환경) 로컬에서:

```bash
pnpm build && pnpm --filter @astro-simulator/web start -p 3001 &
BASE_URL=http://localhost:3001 node apps/web/scripts/r1-ui-regression-guard.mjs --update
git status # shortcut-bar 3 PNG 만 modified 확인
git add apps/web/scripts/__baselines__/r1/{1280x720,1920x1080,375x667}/shortcut-bar.png
git commit -m "..."  # 부모 ADR Amendment v4 §결정 2 §4 의 commit 메시지 템플릿 적용
```

**옵션 C (탈락)** — macOS 로컬에서 `SKIP_LOCAL=` 환경변수 비활성 후 `--update` 실행. **금지** — Linux baseline 정책 (Amendment 1 §결정 1) 위반. macOS 폰트로 캡처하면 다음 CI Linux PR check 에서 **즉시 회귀 재발생**.

본 architect 결정은 **옵션 A 권고** (workflow_dispatch 인프라가 이미 박제됐고 PR #361 패턴 재사용 가능). developer 가 옵션 A 가용성 확인 후 옵션 B 폴백 가능.

### 결정 4 — auto-close 박제

baseline 갱신 PR 본문에:

- `Closes #411` (auto-close 키워드 — 콜론 / 다중 키워드 함정 차단)
- `### Behavior Changes`: shortcut-bar baseline 갱신 (R3 venus + #402 라운드 2 disabled 시각화 흡수) bullet
- ADR cross-link: 본 forensic ADR + 부모 ADR Amendment v4

CHANGELOG `### Behavior Changes` 동일 bullet (CLAUDE.md 스프린트 §7 3 위치 박제).

---

## 결과·재검토 조건

### Concrete Prediction (developer 검증 가능)

baseline 갱신 후:

1. `pnpm verify:r1-guard` (CI Linux 또는 동등 환경) **PASS** — 4 영역 × 3 viewport 12 cell 모두 mismatch ≤ 0.5%
2. `git diff <baseline-commit>~ <baseline-commit> --stat` 결과 **6장** (shortcut-bar 3 + top-nav 3) 변경, 다른 6장 (hud-top-right / hud-bottom-right × 3) 변경 0
3. develop tip 의 다음 CI run **success** 회복

DoD 통합:

- DoD-411-1: forensic SSoT 매트릭스 박제 ✓ (본 ADR §forensic 결과)
- DoD-411-2: 회귀 시점 bisect 확정 ✓ (본 ADR §bisect)
- DoD-411-3: 원인 분류 ✓ (본 ADR §원인 분류)
- DoD-411-4: fix 결정 ✓ (본 ADR §결정 1)
- DoD-411-5: developer 인계 (PR 생성 + 사용자 D-T2 의무) — **architect 단계 종료**, developer 단계 인계
- DoD-411-6: baseline 갱신 후 CI Linux PASS — developer/qa 단계 검증

### 재검토 트리거

본 ADR 자체 재검토:

1. baseline 갱신 후 hud-top-right / hud-bottom-right × 3 viewport (= 6장) 이 함께 변경되는 경우 — **shortcut-bar/top-nav selector crop 누수 또는 layout shift hud 영향** 가능성. 부모 ADR §결정 2 selector 정합성 재검토. 또는 6장 (shortcut-bar 3 + top-nav 3) 외 추가 변경이 발생하면 부모 ADR Amendment v4 §재검토 트리거 #5 (DOM nesting 가정 무효화) 발동 검토
2. 본 회귀 후 R-Phase 진입마다 동일 baseline 갱신 누락 발생 (R5 / R6 ...) — 부모 ADR §재검토 트리거 #2 (selector 재구조화) 또는 §재검토 트리거 새 항목 (architect 인계 체크리스트) 박제 검토
3. macOS qa 측정값 false positive 가 본 forensic 처럼 SSoT 혼란을 반복 유발 — SKIP_LOCAL 가드 강화 (qa 워크플로 환경변수 의무화) 별도 이슈

부모 ADR 재검토 트리거 영향 0:

- §재검토 트리거 #2 (selector 안정성) — 본 1회로는 발동 X. 운영 데이터 누적 후
- §재검토 트리거 #4 (임계값 강화) — 본 회귀는 1.974% / 1.974% / 1.122% 모두 0.5% 임계 충분 초과. 임계 변경으로 회피되지 않음

### 위험 / 미해결

1. **R3 venus 진입 시점 (PR #369 / `d50848f`) 의 baseline 갱신 여부 미확인** — bisect 에서 r1-guard 가 SUCCESS 였음만 확인. 정상 갱신됐는지 / 또는 임계 이하 흡수됐는지 (즉 R-Phase 진입마다 일부 잔여 mismatch 누적 가능성) 별도 검증 필요. 우선순위 low — 본 #411 baseline 갱신으로 누적 잔여까지 한번에 흡수
2. **focus-quick-buttons 가 i18n 텍스트 (한국어 라벨 — `'태양' / '수성' / '금성' ...`) 사용** — selector 기반 측정이라 영향 없으나, 미래 i18n 변경 시점에 또 baseline 갱신 누락 위험. 부모 ADR Amendment v4 §결정 2 의무 강화로 흡수 가능
3. **macOS qa SKIP_LOCAL 가드 동작 미확인** — qa worktree 가 어떻게 SKIP_LOCAL 우회로 측정했는지 미조사. 후속 별건 — 본 ADR 비-범위. qa.md 프롬프트에 SKIP_LOCAL 환경변수 명시 박제 검토 가능
4. **architect 인계 체크리스트 부재** — PR #414 의 architect 단계가 r1-guard sentinel 영향성 검토를 누락한 프로세스 실패가 본 회귀의 근본. 단발성으로는 ADR Amendment v4 §결정 2 SSoT 강화로 충분. 누적 시 architect.md 프롬프트에 "UI/HUD 영역 변경 PR 의 r1-guard sentinel 영향성 사전 점검" 체크 항목 박제 검토

### 교차검증 반영 사항

본 forensic 박제 직후 cross-validate 1회 수행 (CLAUDE.md `## 교차검증` 정책 — 정책·설계·ADR 박제 직후 1회 루틴).

#### Claude 자체 편향 4종 셀프 체크 (cross-validate 호출 전)

- 낙관적 일정: ✓ 통과 — 본 ADR 은 결정만 박제, 실행 일정 추정 0
- 결합 간과: ✓ 통과 — 부모 ADR 정책 (Amendment v4) 과 자매 ADR (#402 라운드 2 / R-Phase allowlist) 결합 명시. R3 #369 / R-Phase #402 와 baseline 갱신 절차의 결합도 §원인 분류 §프로세스 실패 근본 원인 에 박제
- 폐기 프레이밍: ✓ 통과 — 본 forensic 은 부모 ADR §축 6 / Amendment v4 절차의 **재현** 이며 폐기/대체 0
- 순수주의: ✓ 통과 — 옵션 (a) 코드 revert 가 ADR 정합성 측면에서 "더 깔끔" 해 보이나 #402 의도 파괴이므로 기각. 실용주의 (baseline 재캡처) 채택

#### Gemini cross-validate 결과 (2026-05-04, outcome=applied)

- **호출 로그**: `.claude/logs/cross-validate-411-20260504-*.log`
- **모델**: `gemini-3.1-pro-preview`
- **종합 판정**: 조건부 통과 (수정 필수)

**합의 항목 (4축 양호)**:

- 축 1 forensic 매트릭스 정확성 — macOS 폰트 false positive (San Francisco vs DejaVu/Noto) 진단 타당
- 축 2 bisect 정확성 — `d2f6adf` (PR #414) 단일 진입점 결론 정합
- 축 3 원인 분류 단일 결론 — 분류 (1) baseline 갱신 누락 단일 정답, 분류 (3) macOS 측정 노이즈를 근본 원인 아닌 노이즈로 깔끔히 분리
- 축 5 부모 ADR Amendment v4 §결정 2 절차 재현 정확성 (단 reviewer 의무 항목은 축 4 정정에 동반 갱신 필수 — 본 ADR 정정으로 흡수)
- 추가 점검 부모/자매 ADR 일관성 양호, execution path A/B/C 옵션 양호

**Gemini 고유 발견 — 축 4 critical flaw (즉시 본 ADR 반영, volt #29 후속 분리 불필요)**:

- **혼동**: 원안 §결정 2 / §Concrete Prediction 의 "shortcut-bar 3장만 변경, 다른 9장 변경 0" 이 **부모 ADR Amendment v4 §결과·재검토 조건 의 "6장 갱신 패턴 SSoT (R3~R10 재사용)"** 와 정면 충돌. PR [#361](https://github.com/coseo12/astro-simulator/pull/361) `bebd741` 패턴 일관성 파괴 위험
- **메커니즘**: 본 forensic 매트릭스 §forensic 결과 자체에서 top-nav 81 픽셀 mismatch 가 모든 viewport 에서 관찰됨 (비율 0.132% / 0.088% / 0.433% — 0.5% 임계 이하라 r1-guard 테스트 PASS, 그러나 `--update` 는 임계 무관 절대 스냅샷 → top-nav PNG 도 필연적으로 modified). "테스트 PASS (임계 흡수)" 와 "파일 변경 없음 (binary diff 0)" 직교 — 원안은 두 개념 혼동
- **블로킹 위험**: 옵션 A (`workflow_dispatch r1-baseline-bootstrap`) 실행 시 CI 가 12장 모두 재캡처하여 6장 변경 PR 자동 생성 → ADR 본문이 "3장만" 이라 reviewer 가 자동 PR 반려할 운영 병목 발생 가능
- **반영 박제 위치**: §결정 2 / §결과·재검토 조건 §Concrete Prediction / §재검토 트리거 §1 / §Developer 인계 §시작 지점 3 / §변경 요약 — 5곳 동시 정정 (CLAUDE.md 스프린트 §7 박제 + 본 ADR 의 부모 ADR Amendment v4 6장 패턴 일관)

**오탐 / 이견 0**: Gemini 5축 + 추가 점검 모두 정확. 본 ADR 정정 후 사실 정합 회복

**Claude 자체 편향 4종 셀프 체크 재평가** (cross-validate 후):

- 결합 간과: ✗ **부분 실패** → 정정 박제 — 부모 ADR Amendment v4 §결과·재검토 조건 의 "6장 갱신 패턴 SSoT" 를 §원인 분류 §프로세스 실패 근본 원인 에서만 인용하고 §결정 2 / §Concrete Prediction 에 적용 안 했음. 부모 ADR §결정 2 절차 (5단계) 만 재현하고 §결과·재검토 조건 의 Concrete Prediction 정정 (R2 PR 자동 재현 — 2026-04-28) 박제는 누락. 본 정정으로 회복
- 다른 3축 (낙관적 일정 / 폐기 프레이밍 / 순수주의) 통과 유지

---

## Developer 인계

### 시작 지점

1. **execution path 결정** — 옵션 A (workflow_dispatch r1-baseline-bootstrap) 가용성 확인:

   ```bash
   gh workflow list | grep r1-baseline-bootstrap
   gh workflow view r1-baseline-bootstrap.yml
   ```

   가용하면 옵션 A. 불가능하면 옵션 B (Linux 로컬 또는 CI Linux 환경 빌림).

2. **baseline 캡처 실행** — 결정 3 의 옵션 A 또는 B 명령 실행. 실행 환경은 **Linux 가 의무** (macOS 캡처 결과는 즉시 회귀 재발).

3. **검증 의무**:
   - `git status` — 변경 PNG 가 정확히 6장 (shortcut-bar 3 + top-nav 3) 인지
   - `git diff --stat` — hud-top-right / hud-bottom-right × 3 viewport (= 6장) 변경 0인지
   - `pnpm verify:r1-guard` 또는 CI Linux PR check — overall PASS 인지

4. **commit + PR 생성** — 결정 4 의 commit 메시지 템플릿 + auto-close + Behavior Changes + CHANGELOG 박제.

### 참조 문서

- 부모 ADR: [`20260425-r1-ui-pixel-diff-guard.md`](20260425-r1-ui-pixel-diff-guard.md) — 특히 Amendment v4 §결정 2 (baseline 갱신 5단계 절차) 와 §결정 3 (reviewer 의무)
- 자매 PR baseline 갱신 패턴: PR #361 (`bebd741` "R2 후속 baseline 갱신 — shortcut-bar 5→6 버튼 + top-nav nesting 부수효과 6장 동시"), PR #351 (`d9ae9c0` Linux CI 캡처본 전환)
- forensic SSoT JSON: [`docs/reports/411-forensic/output.json`](../reports/411-forensic/output.json)
- volt 교훈: [#74](https://github.com/coseo12/volt/issues/74) (DoD PASS ≠ 제품 동작 — 본 case 는 역방향, "측정 PASS 하지만 baseline 갱신 안 됨" 운영 누락)

### 명시적 비-범위 (이번에 절대 손대지 말 것)

- focus oscillate (#408) / 머지 완료 / `tier-transition.ts` / `applyFocusTier`
- R-Phase allowlist 코드 (#402) / `isRPhaseFocusable` / `focus-quick-buttons.tsx` 의 disabled UI 자체 (의도된 변경 보존)
- BODY_SCALE 미박제 (#412) — 별도 이슈
- r1-guard 정책 자체 (`r1-ui-regions.mjs` / `R1_UI_REGIONS` 영역 정의 / 임계값 0.5%) — 부모 ADR 권한 영역
- macOS SKIP_LOCAL 가드 (qa 워크플로 측정 일관성) — 별도 이슈 후보, 본 PR 무관
- architect.md 프롬프트의 r1-guard sentinel 사전 점검 체크리스트 추가 — 본 회귀 1회만으로는 운영 데이터 부족, 누적 후 별도 PR

---

## 변경 요약

본 ADR 자체:

- 신규 ADR 박제 (forensic + baseline 갱신 결정)
- 부모 ADR `20260425-r1-ui-pixel-diff-guard.md` 변경 0 (Amendment v4 절차 재현, 정책 변경 없음)

후속 PR (developer 단계 인계):

- `apps/web/scripts/__baselines__/r1/{1280x720,1920x1080,375x667}/shortcut-bar.png` 갱신 (3 PNG)
- CHANGELOG `### Behavior Changes` 1 entry
- top-nav PNG (`apps/web/scripts/__baselines__/r1/{1280x720,1920x1080,375x667}/top-nav.png`) 갱신 (3 PNG, DOM nesting 부수효과 — Amendment v4 §결정 2 SSoT 일관)
- hud-top-right / hud-bottom-right × 3 viewport (= 6 PNG) / 코드 / 정책 변경 0
