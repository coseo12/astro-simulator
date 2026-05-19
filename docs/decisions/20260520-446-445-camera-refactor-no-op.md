# ADR: [#446][#445] Camera 리팩토링 2건 — NO-OP 결정 (확장 시점까지 보류)

- **상태**: Accepted
- **날짜**: 2026-05-20
- **결정자**: architect (#446/#445 인계 항목 실측 재검증 — NO-OP ADR 패턴, volt #14)
- **관련**: #446 (updateTierByCamera 순수 함수 분리), #445 (CameraLockManager 추상화), #380 (Option D + G8a fix), [`20260509-380-zoom-camera-freeze-forensic.md`](20260509-380-zoom-camera-freeze-forensic.md) Amendment 2026-05-11 F2/F3
- **교훈 적용**:
  - "인계 항목 실측 재검증 — NO-OP ADR 패턴" (CLAUDE.md / volt #14) — 본 케이스 정확 적용
  - "Don't add features ... beyond what the task requires" (CLAUDE.md / Doing tasks) — 현재 작동 안정 + 확장 요구 0 시점에 리팩토링은 과도

---

## §1 배경

R1 ADR `20260509-380-zoom-camera-freeze-forensic.md` Amendment 2026-05-11 cross-validate 단계에서 Gemini 가 고유 발견으로 분리한 리팩토링 항목 2건:

- **#446** — `updateTierByCamera` 부수 효과 / 순수 계산 혼재. 순수 함수 분리로 단위 테스트 용이화 (F3)
- **#445** — 카메라 제어권 요청/해제 일관 인터페이스 (`CameraLockManager`) 추상화. cutscene / 특정 UI 상호작용 / focus 전환 통합 (F2)

### 인계 항목 실측 재검증 (2026-05-20)

| 이슈 | 트리거 조건 | 충족 여부 | 근거 |
|---|---|---|---|
| **#446 updateTierByCamera 분리** | 현 단위 테스트 커버리지 부족 + 회귀 빈도 ≥ 1회/PR | ❌ 미충족 | 현재 #380 Option D + G8a 4 가드 단위 테스트 16 case PASS + browser-verify-380-zoom.mjs 4 시나리오 PASS. 회귀 0건 (R3 까지) |
| **#445 CameraLockManager** | cutscene / 새 UI 상호작용 / 다중 lock 시나리오 추가 | ❌ 미충족 | 현재 사용처는 `tier-transition.ts:detachControl` 단독. R3 까지 다른 lock 요구자 0건. cutscene 기능 미계획 (Roadmap v3 비-목표) |

---

## §2 NO-OP 결정 근거

### #446 (updateTierByCamera 순수 함수 분리) — NO-OP

- 현재 단위 테스트 (`tier-transition.test.ts` 16 case PASS) 가 `runTierTransition` 의 cleanup lifecycle / detachControl 호출 횟수 / lowerRadiusLimit 양방향 동기화 / primary follow 가드 등 핵심 분기 모두 커버
- `updateTierByCamera` 본체는 부수 효과 (setTier 호출) 가 통합되어야 정합 — 분리 시 호출자 책임 증가 + 호출 누락 위험
- 리팩토링 비용: 함수 시그니처 변경 + 호출자 수정 + 단위 테스트 추가 (~80~120 라인). 사용자 가시 변화 0
- ROI: 회귀 빈도 0 시점에 단위 테스트 추가 가치 < 리팩토링 부담

### #445 (CameraLockManager 추상화) — NO-OP

- 현재 lock 요구자 1건 (`tier-transition.ts:detachControl`). 다중 lock 시나리오 0건
- 추상화 비용: `CameraLockManager` 클래스 + lifecycle + 충돌 감지 + 단위 테스트 + 마이그레이션 (~150~300 라인)
- YAGNI 원칙 — cutscene / 새 UI 상호작용 구체 계획 부재 시 추상화는 추정 (CLAUDE.md `Don't add features ... beyond what the task requires`)
- 미래 cutscene 도입 시 본 ADR §3 재검토 트리거 발동 — 그 시점 설계 정합 가능

---

## §3 재검토 트리거 (보류 해제 조건)

### #446 재검토 트리거

1. `updateTierByCamera` 관련 회귀 PR 당 ≥ 1회 발생 (단위 테스트 커버리지 부족 증거)
2. tier 판정 로직 자체 변경 요구 (예: hysteresis 임계 조정 / 새 tier 도입) — 순수 함수 단위 테스트 진입 ROI 발생
3. `runTierTransition` 의 in-flight 잠금 분기 추가 (Gemini F3 의 부가 조건)

### #445 재검토 트리거

1. cutscene / onboarding 시퀀스 / 특정 UI 상호작용에서 카메라 제어권 추가 요구자 1건 이상
2. 다중 lock 충돌 시나리오 (focus 전환 중 user wheel + tier transition) 사용자 보고
3. 카메라 제어 관련 회귀 다중 분기 (예: focus + tier + cutscene 충돌)

---

## §4 회귀 가드

본 NO-OP 결정의 회귀 (즉 트리거 충족 후 작업 누락) 방어:

- 본 ADR §3 재검토 트리거 명시 박제 — 미래 트리거 발생 PR 에서 본 ADR 자동 인용
- `20260509-380-zoom-camera-freeze-forensic.md` Amendment 2026-05-11 F2/F3 와 cross-link

---

## §5 결과

- `computeTierFromCameraPosition` / `applyTierDecision` 분리 **하지 않음** (#446)
- `CameraLockManager` 추상화 **신설 안 함** (#445)

코드 변경 0 — 본 ADR 박제만으로 인계 항목 실측 재검증 정합.

## 변경 이력

- 2026-05-20: NO-OP 결정 박제 (인계 항목 실측 재검증 — R3 시점 단위 테스트 PASS + 다중 lock 요구자 0건)
