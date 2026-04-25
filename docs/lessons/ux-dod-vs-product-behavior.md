# DoD PASS ≠ 제품 동작 — UX 회귀 감지 공백

> **요지**: 성능·정합성 수치 DoD 전부 PASS 여도 사용자가 인지하는 제품은 회귀할 수 있다. 원칙 폐기 ADR 은 downstream UX 계약 전체 재검증을 동반해야 하며, UX DoD 는 성능 DoD 와 별도로 박제되어야 한다. CLAUDE.md 실전 교훈 "빌드 성공 ≠ 동작하는 앱" 의 **UX 회귀 버전**.
>
> **근거**: volt [#72](https://github.com/coseo12/volt/issues/72) / [#74](https://github.com/coseo12/volt/issues/74) — astro-simulator P12 Display-Relative Scale Unification (2026-04-23). 모든 Phase DoD PASS 머지 후 기본 진입 화면이 "궤도 라인 + 해왕성 1개 + sub-pixel 태양" 으로 관찰된 실측.

---

## 핵심 명제

> **완료된 DoD 와 사용자가 인지하는 제품은 분리 가능하다.** `screenshot diff < 15%` / `bench 회귀 < 5%` / `idle fps ≥ 30` 같은 수치는 전부 **성능·정합성 지표**이며 UX 회귀 (기본 진입 화면이 빈 화면) 는 감지 범위 밖이다.

브라우저 3단계 검증도 **focus 상태 위주**로 수행되면 **초기 진입 상태 (URL 파라미터 없음)** 는 검증 공백이 된다. "첫 1초에 사용자가 무엇을 보는가" 를 자동 캡처·수치화하지 않으면 전역 UX 회귀가 모든 DoD 를 통과한다.

## 관찰 맥락 (astro-simulator P12, 2026-04-23)

### 현상

- P12 ADR (`20260423-display-relative-scale-unification.md`) 이 `educational` / `scientific` 모드 토글을 폐기하고 단일 사실 모드로 전환
- Phase A/B/C 모든 DoD PASS 로 머지 (Scale Tier 엔진 / 8D 카메라 dolly / educational UI 폐기)
- browser-verify 정적/인터랙션/흐름 3단계 자동 검증 전부 통과
- P11-B (LOD) + P11-C (GPU tier) 누적 머지
- **사용자 수동 브라우저 확인**: 기본 진입 화면 = 궤도 라인 + 해왕성 1개 (우측 35 AU) + 중앙 흰 점 (태양 sub-pixel). 수성/금성/지구/화성/목성/토성/천왕성 전부 invisible

### 근본 원인 4중 gap

| # | gap | 설명 |
|---|---|---|
| 1 | Store `focusBodyId` 필드 부재 | `sim-store.ts` 에 `selectedBodyId` 만, `focusBodyId` 없음. scene tier 는 `focusBodyId` 를 인자로 받음 → store↔scene 미통합, URL `?focus=X` 반영 불가 |
| 2 | Solar tier 기본 화면 = 빈 궤도 | 실측 스케일에서 태양·모든 행성 sub-pixel. Fact-First 1조 "디폴트 UX 는 교육용 관례 유지" 가 P12 에서 폐기됐으나 **대체 UX 계약 부재** |
| 3 | Shortcut 4개만 | 태양/지구/목성/해왕성 버튼만. 수성/금성/화성/토성/천왕성 직접 접근 수단 부재 |
| 4 | "ongoing 후속" 라벨의 blocker 부재 | "billboard marker 통합 (P11-B) 후속 ongoing" 이 로드맵 메모로만 남고 다음 Phase 진행 차단 못함 |

### 왜 모든 DoD PASS 였음에도 회귀였는가 (메타 분석)

- **DoD 수치화가 전부 성능·정합성 지표** — UX 회귀 감지 축 자체가 부재
- **브라우저 3단계 검증이 focus 상태 위주** — QA 가 `?focus=earth` 스크린샷은 찍었지만 default URL (파라미터 없음) 스크린샷은 찍지 않음
- **ADR `## 결과·재검토 조건` 에 UX 계약 부재** — Concrete Prediction 3건 모두 "코드 변경 0 줄" 같은 구조 예측. "사용자가 기본 화면에서 태양계를 탐색 가능" 같은 UX 예측 없음
- **원칙 폐기 ADR 의 downstream 재검증 공백** — Fact-First 1조 "디폴트 UX 는 교육용 관례 유지" 폐기가 대체 계약 없이 진행

## 일반화된 교훈

1. **원칙 폐기는 원칙 폐기다** — ADR 에서 상위 UX 원칙 (educational/scientific 토글 등) 폐기는 **downstream UX 계약 전체 재검증 동반 필수**. 원칙 폐기 ADR 은 자동으로 `## 영향받는 원칙` + `## UX 회귀 체크리스트` 섹션을 편입해야
2. **UX DoD 를 성능 DoD 와 별도로 박제** — 성능 DoD 만으론 UX 회귀 감지 불가. 예: `DoD-UX-1: 기본 진입 후 3초 이내 화면에서 ≥5개 body 가 클릭 가능한 크기(≥4px)로 렌더된다`
3. **사용자 1차 수동 검증을 Phase 종료 DoD 에 포함** — browser-verify 자동화만으론 UX 회귀 감지 불가. 특히 scale / mode / default state 같은 **전역 UX 변경** 시 실 사용자 수동 검증 의무
4. **초기 진입 상태 스크린샷을 QA 게이트에** — focus/interaction 상태뿐 아니라 **URL 파라미터 없는 default 진입 상태** 가 주요 평가 대상. "첫 1초에 사용자가 뭘 보는가" 자동 캡처
5. **"ongoing 후속" 라벨의 자동 blocker 승격 룰** — 상위 원칙 영향 받는 ongoing 항목은 같은 원칙 수정 ADR 의 자동 blocker 로 간주. 라벨 `blocker-candidate:next-phase` + 다음 Phase PM 계약 시 필수 리뷰 트리거

## 사전 감지 체크리스트 (원칙 폐기 ADR)

상위 UX 원칙 (mode 토글 / 기본 스케일 / 기본 진입 상태 등) 을 폐기하는 ADR 착수 시:

- [ ] 폐기 대상 원칙이 **디폴트 UX 계약** 이었는가? (그렇다면 대체 계약 필수)
- [ ] 새 디폴트 진입 상태에서 사용자가 **수행 가능한 최초 3개 액션**이 DoD 에 명시됐는가?
- [ ] DoD 에 **"화면에 의미 있는 무언가가 보인다"** 가 수치 기준으로 포함됐는가? (예: ≥N 개 body 가 ≥4px 로 렌더)
- [ ] QA 게이트가 **default URL** (파라미터 없음) 스크린샷을 포함하는가?
- [ ] 로드맵 "후속 ongoing" 라벨 중 본 원칙 폐기로 영향받는 항목이 **blocker 로 승격**됐는가?
- [ ] Phase 종료 DoD 에 **사용자 1차 수동 검증** 단계가 명시됐는가?

## 일반화된 두 명제

1. **수치 DoD PASS 는 UX 회귀를 증명하지 않는다.** 사용자 관찰 가능한 최초 상태가 별도 DoD 축으로 박제되지 않으면, 성능·정합성 통과가 제품 동작을 증명하지 못한다. CRITICAL #3 의 **defaults 확장** 버전
2. **원칙 폐기는 대체 계약의 선언이다.** "A 원칙을 폐기한다" 는 "A 원칙이 보장하던 UX 계약을 B 대체 계약으로 이전한다" 와 동치. 대체 계약 없는 폐기는 조용한 계약 파기

## 관련 계보

- CLAUDE.md 실전 교훈 "빌드 성공 ≠ 동작하는 앱" — 본 교훈의 **빌드 통과 시점 버전**
- CLAUDE.md 실전 교훈 "HTTP 200 ≠ 올바른 리소스" — 본 교훈의 **네트워크 시점 버전**
- [docs/lessons/strict-principle-dynamic-context.md](strict-principle-dynamic-context.md) — volt #68. 원칙 선언 직후 동적 문맥 시뮬레이션 의무. 본 교훈은 그 **원칙 폐기 버전**
- volt [#13](https://github.com/coseo12/volt/issues/13) — staging 성공 ≠ 커밋 내용. 부분 실패의 조용한 흡수 패턴 계보
- volt [#72](https://github.com/coseo12/volt/issues/72) / [#74](https://github.com/coseo12/volt/issues/74) — 원본 캡처 이슈 (중복, 동일 사례)
