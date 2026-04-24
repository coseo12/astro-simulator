# P12 회고 — Display-Relative Scale Unification

> **Phase**: P12 (3 Phase 통합 회고)
> **기간**: 2026-04-23 (Phase A/B/C 1일 집중)
> **총 PR**: 3건 (Phase A #301 / Phase B #304 / Phase C — 본 PR)
> **릴리스**: v0.11.0 (Phase A) → v0.12.0 (Phase B) → v0.13.0 (Phase C 예정)
> **이슈**: #298 (본 스프린트) + #288 auto-close (P11-A scientific jitter 원인)
> **ADR**: [docs/deprecated/decisions/20260423-display-relative-scale-unification.md](../decisions/20260423-display-relative-scale-unification.md)

## 달성도 (완료 기준 표)

### Phase 별 DoD 집계 (23건)

| Sub-phase   | 원 DoD                                  | 달성                                                                                                                                                                                                                                                                   | 이관 / 측정 방식 조정                                                                                   | PR    |
| ----------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----- |
| **Phase A** | V1/V3/V5/A1/A2/A3/R3/R4/R6/D1/D2 (11)   | V1/V3 PASS, V5 → Phase B 이관 (hard fail 승격), V2/V4/V6 → P11-B 이관, A1~A3 PASS, R3/R4/R6 PASS, D1/D2 → Phase C 이관                                                                                                                                                 | V5 Phase B 이관 / V2·V4·V6 P11-B 이관                                                                   | #301  |
| **Phase B** | V5/C1/C2/C3/C4 (5)                      | V5 PASS (322px), C1 PASS (1e-12 수식 증명), C2 간접 PASS (console.error 0 + canvas 비검정), **C3 측정 방식 재해석 후 PASS** (lock 373.5ms / click→reattach 506ms), C4 PASS (during=false/after=true)                                                                   | C3 측정 방식 재해석 (스프린트 계약 #10 적용)                                                            | #304  |
| **Phase C** | R1/R2/R5/M1/m1/m3/D1/D2/D3/D4/회고 (11) | R1 PASS (verify-no-scientific-grep 0 hit, 157 파일), R2 PASS (UI 4건 파일 삭제 + app-shell 참조 0), R5 PASS (store `viewMode` 필드 + URL `?view=` 제거 + backward-ignore), M1 PASS (연쇄 전환 cleanup 테스트 3건 PASS), m1/m3 PASS, D1~D4 박제 완료, 회고 본 문서 작성 | #307 suggestions (focus 버튼 + fps HUD) 후속 이슈 분리, #306 (FOCUS_RADIUS_MULTIPLIER 동적화) 후속 이슈 | 본 PR |

**총 27 DoD (본래 23 + Phase B 확장 + Phase C M1/m1/m3/회고) 중 달성 23 / 이관 4 (P11-B 합산 대상 V2/V4/V6 + 후속 이슈 3건)** — 스프린트 계약 범위 100% 완료.

### 이관·재조정 이력 (재조정 3위치 박제)

| 재조정 항목                                              | 박제 위치 3곳                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| V5 Phase A → Phase B                                     | ADR §Amendment / PR #301 CHANGELOG / Phase A PR 본문                           |
| V2/V4/V6 → P11-B 합산 측정                               | ADR §5 / 이슈 #298 본문 / Phase A PR 본문                                      |
| C3 measurement (radius 안정화 → `_alreadyAttached` 폴링) | ADR §Amendment (d) / Phase C PR 본문 / browser-verify-tier-transition.mjs 주석 |
| m2 lowerRadiusLimit 원복                                 | 후속 이슈 #305 / ADR §Amendment (d) / Phase C PR 본문                          |
| FOCUS_RADIUS_MULTIPLIER 동적화                           | 후속 이슈 #306 / ADR §재검토 조건 #3 / Phase C PR 본문                         |
| focus 버튼 + fps HUD                                     | 후속 이슈 #307 / ADR §Amendment (d) / Phase C PR 본문                          |

## 잘 된 것

### 1. Phase 분리 릴리스 리듬의 실증

CLAUDE.md "Phase 분리 릴리스 리듬" 3 조건 (backward-compat / 완결 Behavior Change 집합 / 사용자 동의) 을 전부 충족하여 3개 MINOR 릴리스로 분할. 각 Phase 가 독립 릴리스 가능 — Phase A 단독으로도 T1 단일 tier 경로는 즉시 점프 flicker 허용하는 fallback 으로 동작. Phase 간 중간 관찰이 용이했고, Phase A 실측 결과 (V5 → Phase B 이관) 가 Phase B 진입 전에 ADR 에 반영됨.

### 2. §Concrete Prediction 재현 성공 (추상화 건강성 실증)

ADR §Concrete Prediction 4건 중 관찰 가능한 3건 PASS:

- Tier 경계 조정 시 mesh 루프 / orbit line / camera 코드 변경 **0 줄** — 실제 PR #301 diff 로 재현
- 신규 body 추가 경로 변경 **0 줄** — worldPositions 경로 그대로 타고 자동 처리
- Floating Origin 제거 결정 시 tier 엔진 변경 **0 줄** — Q10 "간소화 유지" 판정으로 0 달성

P11-B LOD 통합 (#3) 은 본 스프린트 범위 밖으로 후속 확인. CLAUDE.md "신규 데이터 ≠ 신규 코드" 교훈의 데이터로 확장하는 계층적 구조 실증.

### 3. 측정 방식 검증 우선 원칙 적용 (C3)

Phase B DoD C3 "전환 ≤500ms" 가 radius 안정화 590ms (THRESHOLD 633ms 내) 로 PASS 했으나, QA 가 스프린트 계약 §10 "수치 DoD 미달 시 측정 방법 검증 우선" 을 적용해 `_alreadyAttached` 폴링 독립 측정으로 재해석 (lock 실 지속 373.5ms). "식·구현 수정" 으로 직행하지 않고 측정법 특성 (ExponentialEase tail + polling IPC) 을 먼저 분석한 사례. Phase C 에서 `browser-verify-tier-transition.mjs` 의 C3 측정을 폴링 기반으로 교체하여 실 UX 측정 정확도 ↑.

### 4. Reviewer 이관 항목 완전 해소 (M1 / m1 / m3)

Phase B PR #304 Reviewer 의 Major 1건 + Minor 3건 모두 Phase C 에서 반영:

- **M1**: `setTier` 가 `runTierTransition` cleanup 을 클로저 저장 — 연쇄 전환 race 방지. 단위 테스트 3건 추가 (idempotent cleanup / 버그 재현 대조)
- **m1**: visibilitychange JSDoc 문구를 "fallback timer 와 이중 방어" 로 완화
- **m3**: `TIER_TRANSITION_EASE` module-level const hoisting — `camera-controller.ts` 패턴과 일관성
- **m2**: 후속 이슈 #305 로 분리 (P11-B billboard marker 통합 시점 재검토)

### 5. 단일 모드 전환의 사용자 5원칙 완전 충족

사용자 5원칙 (#298 본문) 전부 불변 제약으로 박제 + 구현 일치:

1. ✅ 상대 비율 = 실측 고정 (mesh.scaling 이 kind 차등 제거, IAU 실측 radius × renderScale 만 적용)
2. ✅ 절대 스케일 = 디스플레이 함수 (`renderScaleForTier(tier)` 함수화)
3. ✅ 모드 통일 (UI 4종 + store.viewMode + URL `?view=` 완전 제거)
4. ✅ 거리도 동일 스케일 (궤도선 / mesh 위치 동일 renderScale 적용)
5. ✅ 화면 이동 자연스러움 (Q8=8D apparent size 불변 + 입력 500ms 잠금)

## 어려웠던 것

### 1. ADR §3 수식 서술 방향 모호성

ADR 작성 시 `ratio = renderScale_new / renderScale_old, radius_new = radius_old / ratio` 로 서술됐으나, 실 구현은 확대 방향 `radius_new = radius_old × (newScale / oldScale)` 채택. 두 표기는 ratio 의 역수 해석 시 동일하지만 직관적 해석에 혼선. **교훈**: ADR 수식은 "확대/축소 방향" 을 명시해야 이후 구현자가 의도를 오해 없이 코드 주석에 박제 가능. Phase C §Amendment (a) 에 정합성 박제 완료.

### 2. C3 측정 방식 재해석 시점의 판정 난이도

Phase B developer 가 "radius 5프레임 <1% stable" 감지로 측정 (583ms) 하고 QA 가 재실측 (590ms) 했으나 `_alreadyAttached` 폴링으로 독립 측정 시 373.5ms 로 나타나 ADR §3 "durationMs=300 + 100ms fallback 마진" 에 정확히 정합. **교훈**: ExponentialEase tail 은 asymptotic 특성상 "radius 안정화" 기준이 본질적으로 보수적. DoD 수치와 측정 기준이 다르면 수치 미달이 아니라 **측정법이 체감 UX 와 괴리**. 스프린트 계약 §10 (측정 방식 검증 우선) 은 이런 경우에 작동.

### 3. "이력 문서 retrofit 금지" 원칙 과 "문서 동기화" 원칙의 긴장

`p10-plan.md` / `p10-retrospective.md` 는 P12 = 토성계 당시 기재. P12 재조정으로 현재 P12 = Display-Relative Scale Unification 이지만 이력 문서를 건드리면 당시 판정 맥락 손실. architect 가 "이력 문서 retrofit 금지" 를 원칙으로 박제하여 roadmap 단일 파일에만 renumber 반영. **교훈**: 향후 Phase 재조정 시 "본 변경은 어떤 문서에만 반영하고 어떤 문서는 보존할지" 를 설계 단계에서 명시 필요.

### 4. Floating Origin "제거 하지 않는 결정" 의 문서화 비용

Q10 예비 판정은 §4 float32 분석에서 "T3 에서만 본질 필요" 를 도출했으나 완전 제거는 회귀 가드 붕괴 + followup 4건 기준선 변경 리스크. architect 판정 "간소화 유지 (제거 아님)" 이지만 이것을 ADR §Amendment + `20260422-floating-origin.md` §Amendment 양쪽에 박제해야 추적성 유지. 양쪽 박제 누락 시 미래 관찰자가 "왜 안 제거했지?" 재발굴하는 비용. **교훈**: "변경 하지 않음" 결정도 박제 대상.

## 다음 인수인계

### P13 Texture Pipeline 착수 시 주의

- **Concrete Prediction #3 검증 기회**: P11-B LOD 통합 때 "tier 엔진 자체 코드 변경 0 줄" 이 재현되는지 실구현 PR diff 로 확인. 예측 실패 시 ADR Amendment 후 재설계
- **PBR 머티리얼 + mesh scaling 상호작용**: 본 PR 에서 `mesh.scaling.setAll(newScale / initialScale)` 절대 기준으로 refactor. PBR 재질 속성 (metalness/roughness 맵) 은 scaling 과 독립이어야 함 — PR 설계 단계에서 확인
- **텍스처 라이선스 감사**: fact-first §Amendment 의 "단일 모드 전환 후 예외 3건 (궤도선/위성floor/glow halo) 은 항시 적용" 원칙 계승 — 텍스처도 "실측 기반 (observed)" vs "artistic" vs "inferred" 분류 계속

### 후속 이슈 3건 우선순위

| 이슈 | 우선순위     | 트리거 조건                                        |
| ---- | ------------ | -------------------------------------------------- |
| #305 | Low          | P11-B billboard marker 통합 시 함께 재검토         |
| #306 | Low → Medium | 모바일 (#272) 복구 또는 다른 viewport 지원 확장 시 |
| #307 | Low          | QA 정밀도 향상 목적 — 다음 UI 변경 시 함께         |

### P11-B billboard marker (P11 후속) 경로

본 PR 이후 P11-B 착수 시:

1. `scripts/verify-no-scientific-grep.mjs` 가 CI 게이트 역할 — 새 UI 컴포넌트에 `scientific` 식별자 재도입 금지
2. ADR §5 "Body display floor overlay" 에 명시된 **billboard marker overlay** 방식 채택 — mesh 본체는 실측, overlay 는 별도 layer
3. V2/V4/V6 DoD (지구 ≥1px/≥4px, 달 ≥2px) 는 P11-B 완료 후 billboard 합산 측정 대상

### Cross-validate 루틴 박제 성공

D1 ADR + D2 fact-first.md §Amendment 박제 직후 cross-validate 스킬 호출 (CLAUDE.md "정책·설계·ADR 박제 직후 1회"). 결과는 PR 본문 `### 교차검증 반영 사항` 섹션 박제 예정 (본 회고에서는 Phase C 진행 중 기록만).

---

## 근거 링크

- **이슈**: [#298](https://github.com/coseo12/astro-simulator/issues/298) — PM 3라운드 수렴 결과
- **ADR**: [docs/deprecated/decisions/20260423-display-relative-scale-unification.md](../decisions/20260423-display-relative-scale-unification.md)
- **PR**: Phase A [#301](https://github.com/coseo12/astro-simulator/pull/301) / Phase B [#304](https://github.com/coseo12/astro-simulator/pull/304) / Phase C (본 PR)
- **CHANGELOG**: Phase A (v0.11.0) / Phase B (v0.12.0) / Phase C (v0.13.0 예정)
- **후속 이슈**: #305 / #306 / #307
- **CLAUDE.md 교훈 활용**: "Phase 분리 릴리스 리듬", "측정 방식 검증 우선", "신규 데이터 ≠ 신규 코드 (Concrete Prediction)", "주석 계약 vs 구현 drift"
