# 가드 도입 PR DoD — 회귀 시뮬레이션 + self-consistency + 메타 위험 우회

> **요지**: `verify-*.sh` / outcome 스키마 / SSoT 박제 등 **negative-test 성격의 가드를 도입하는 PR** 은 positive PASS 만으로 가드 작동을 보장하지 못한다. 4축 검증 (3중 시뮬레이션 + 5 페르소나 self-consistency + 메타 측정 안정성 + 메타 위험 우회) 을 DoD 에 명시.
>
> **근거**: volt [#96](https://github.com/coseo12/volt/issues/96) / [#100](https://github.com/coseo12/volt/issues/100) / [#109](https://github.com/coseo12/volt/issues/109) / [#112](https://github.com/coseo12/volt/issues/112). harness `verify-agent-ssot.sh` ([#145](https://github.com/coseo12/harness-setting/issues/145)) 도입 시 본 3중 시뮬레이션 누락 — 회귀 가드로 박제.

---

## 1. 회귀 가드 3중 시뮬레이션 — positive → negative → recovery (#96)

### 배경

SSoT drift 자동 가드 (`verify-*.sh` + CI step) 같은 negative-test 성격의 가드는 **positive PASS 만으로 가드 작동을 보장하지 못한다**. 격리된 단위 테스트로 가드 로직 자체는 검증되더라도, "실제 CI 파이프라인이 drift 를 차단하는가" 는 **별개 검증 단위**.

### 3중 검증 매트릭스 — 한 PR 내에서 가드 작동을 3 상태로 입증

| 단계 | 행위 | 기대 CI 결과 | 입증 |
|------|------|--------------|------|
| 1. **positive** | 정상 코드 push | gate step **SUCCESS** | 가드가 정상을 정상으로 분류 |
| 2. **negative** | 의도적 drift commit push (예: SSoT 박제 1 글자 변경) | gate step **FAILURE** | 가드가 drift 를 실제 차단 |
| 3. **recovery** | drift commit revert push | gate step **SUCCESS** 회복 | 가드가 false-positive 가 아니며 정상 회복 가능 |

### 격리 동적 테스트와의 직교성

- **격리 동적 테스트** (`mktemp` + env override 4~5 케이스) — **스크립트 로직** 검증 ([verify-script-authoring.md](verify-script-authoring.md) §2)
- **3중 시뮬레이션** — **CI 통합 + hashFiles 조건 + 실제 차단** 검증
- 둘 다 통과해야 가드 작동이 완전 입증됨 (둘 중 하나만 통과 시 어딘가에 함정 잔존)

### 비용

- CI run 2회 추가 (drift push + revert push) — 약 5~15분
- PR 머지 전 임시 commit/revert 노이즈 → squash 머지로 자연 흡수

### PR 커밋 컨벤션

- drift commit: `test(infra): [#N] 의도적 drift commit — CI 차단 발화 실측용 (revert 예정)`
- revert commit: `git revert --no-edit` (자동 메시지)
- **타이밍**: positive CI PASS 확인 후 drift push (negative 만 단독 push 면 PR 머지 차단 상태로 오인 위험)

### 적용 조건

- negative-test 성격의 신규 가드 (verify-*.sh + CI step)
- DoD 에 "회귀 가드 시뮬레이션" / "drift 차단 실측" 명시된 PR
- 도메인 위험 큰 가드 (SSoT drift, 보안, ADR 호환성 등)

---

## 2. 5 페르소나 self-consistency — 9~11중 결정적 일치 (#100 / #112)

### 배경

가드 도입 PR 의 self-consistency 입증은 **가드가 자기 자신을 검증** 하는 메타 구조로 가능. 5 페르소나 sub-agent (architect → developer → reviewer → qa → 메인) 가 각자 독립으로 동일 outcome 을 산출 → 9~11중 결정적 일치 입증.

### 패턴 — 5 페르소나 × N 필드 = N×5 셀 결정적 일치

| 단계 | 검증 |
|------|------|
| 1. architect (Gemini cross-validate 결과) | 가드 outcome 정상 |
| 2. developer D4 자기 검증 | 회귀 가드 outcome 정상 |
| 3. reviewer 정적 분석 | 스크립트 보안 검증 |
| 4. qa 동적 매트릭스 (4~5 케이스) | 격리 분기 검증 |
| 5. 메인 (outcome.json parse) | 외부 가시성 검증 |

5 단계 × N 필드 = **N×5 셀 모두 동일** → 가드 작동 + self-consistency 입증.

### 메타 위험 우회 — 가드가 자기 PR 에 적용될 때 (#112)

가드 도입 PR 에서 가드 = `scripts/verify-X.sh` (자기 자신). architect cross-validate 호출 + developer D4 회귀 가드 자기 검증 **2 단계 모두 같은 가드가 자기 자신을 검증**. 메타 위험 (사고 재발) 이 2회 연속 발화 0 → 가드 작동 + 메타 안정성 입증.

직교성:

- self-consistency = **가로축** (5 페르소나, 동일 시점 outcome 결정적 일치)
- 메타 위험 우회 = **세로축** (2 단계 같은 가드 호출, 가드가 자기 PR 의 변경 자체를 검증)

### 한계

- 모든 5 페르소나가 같은 LLM (Claude) 컨텍스트 공유 → "독립 검증" 의 실질 수준은 모델 단일성에 제약
- Gemini cross-validate 호출이 보강 (다른 모델 시각) 하나 의무 아님
- 메타 측정 도구 (`verify-*.sh`) 자체가 일관성 부재 시 5 단계 결과가 동일하지 않음 → 메타 측정 도구 자기 적용 안정성 우선 검증 (§3)

### 적용 조건

- 가드 도입 PR (verify-*.sh / outcome 스키마 / SSoT 박제 등)
- DoD 에 "회귀 가드 시뮬레이션" + "self-consistency 5 페르소나 결정적 일치" 명시
- 5 페르소나 sub-agent 워크플로 운영 시

---

## 3. 메타 측정 도구 자기 적용 안정성 (#109)

### 배경

`verify-*.sh` 류 가드를 도입하는 PR 자체가 본 가드의 검증 대상에 해당될 때, 가드는 자기 자신을 측정 → 결정적 일치 필요. 측정 일관성 부재 시 PR 검증이 비결정적 → 가드 무력화. **메타 측정 도구의 자기 적용 안정성 = 결정적 일치** 가 첫 번째 SSoT.

### 측정 일관성 부재 시 발생

- 5 페르소나가 같은 가드를 다르게 해석 (예: 같은 SSoT 키를 architect 가 `grep -F`, developer 가 `awk`, reviewer 가 정규식으로 해석 → 결과 셀 비결정)
- 가드 결과가 비결정적 → CI 가 우연 PASS / FAIL 반복 → 가드 자체 신뢰도 폐기

### 메타 SSoT 의무화 — 5 페르소나가 동일 명령 호출 의무

1. 가드 도입 PR 의 5 페르소나가 **동일 명령** 호출 의무 (예: `bash scripts/verify-X.sh` 만 사용, 변형 금지)
2. outcome.json 스키마 SSoT 의 5 페르소나 `.md` 동일성 (CLAUDE.md `### sub-agent 검증 완료 ≠ GitHub 박제 완료` 의 공통 JSON 스키마 적용)
3. 메타 측정 결과를 PR 본문에 표 형태 박제 → "N중 메타 결정적 일치" 가시화

### 자기 박제 가드의 의의

- 가드가 자기 자신 검증 → "가드 = SSoT" 의 메타 일관성
- 6+ 회차 누적 시 패턴화 — Rule of Three 보다 메타 안정성 의무 5+ 회 누적이 더 강한 증거

---

## 4. 가드 도입 PR DoD 체크리스트 (4축 통합)

신규 `verify-*.sh` + CI step 도입 PR 의 DoD 에 다음 4축을 모두 명시:

- [ ] **격리 동적 테스트** — `mktemp` + env override + 4~5 케이스 매트릭스 PASS ([verify-script-authoring.md](verify-script-authoring.md) §2)
- [ ] **3중 시뮬레이션** — positive → negative → recovery 본 PR 내 박제 (§1)
- [ ] **5 페르소나 self-consistency** — N×5 셀 결정적 일치 표 PR 본문 박제 (§2)
- [ ] **메타 측정 도구 안정성** — 5 페르소나 동일 명령 호출 + outcome 스키마 SSoT 박제 (§3)

### 자명 함정 회피

- "positive PASS 만으로 충분하다" 의 self-attestation 함정 차단 — §1 negative-test 의무
- "5 페르소나가 같으니 self-consistency" 의 우연 일치 함정 차단 — §3 메타 측정 안정성 우선 검증
- "단위 테스트 PASS = CI 통합 PASS" 의 단계 혼동 함정 차단 — §1 격리 vs 시뮬레이션 직교성

---

## 근거

- volt [#96](https://github.com/coseo12/volt/issues/96) — astro-simulator PR #496 5 페르소나 SSoT drift 가드 도입 시 positive `74ff457` → drift `cc0405c` (reviewer.md `#471` → `#999`) → revert `24188bf` 3중 PASS/FAIL/PASS 실측
- volt [#100](https://github.com/coseo12/volt/issues/100) — PR #482 (#479 cross-validate plan-mode 우회 가드) 에서 5 페르소나 × 3 필드 = 15 셀 결정적 일치 + 누적 메타 (PR #472/#475/#478/#481/#482 = 28+ 셀)
- volt [#109](https://github.com/coseo12/volt/issues/109) — 동일 누적 PR 군에서 메타 측정 도구 (verify-*.sh) 자기 적용 안정성 5+ 회 누적 입증
- volt [#112](https://github.com/coseo12/volt/issues/112) — PR #482 에서 가드가 자기 PR 에 적용될 때 architect + developer D4 2 단계 메타 위험 발화 0
- harness 회귀 가드 — `scripts/verify-agent-ssot.sh` (#145) 도입 시 본 3중 시뮬레이션 누락. 본 lesson 박제로 회귀 방지

## 관련 lessons

- [verify-script-authoring.md](verify-script-authoring.md) — bash 호환 + 격리 동적 테스트 패턴 (가드 스크립트 측 SSoT)
- [guard-design-principles.md](guard-design-principles.md) — 가드 임계값 설계 / fallback 금지 / measurement-first
