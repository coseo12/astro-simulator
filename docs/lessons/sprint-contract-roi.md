# 스프린트 계약 — 테스트 ROI / 수치 DoD / SSoT JSON 부호 규약

> CLAUDE.md `## 스프린트 계약 (Sprint Contract)` 의 6항~10항-a 가지치기 위임 (이슈 #266 / PR #284). 1~5항 + 7항 + 8항 + 9항 (재조정 박제 / 함정 / 근거 인용) 은 CLAUDE.md 본문 유지 (각인층).

## 6항 — 재조정 시 테스트 ROI 5문 체크

재조정 시 **테스트 ROI 5문 체크** 후 대체재를 우선 검토한다:

- 테스트 환경 구축 비용이 검증 대상 코드 라인 수의 5배 이상인가? (git fixture / DB seed / 네트워크 mock 등)
- 몇 줄을 보호하는가? 1~2줄짜리 스킵 조건은 **주석 계약 + 인접 속성 테스트**가 충분할 수 있다
- 회귀 시 조용히 퇴행 vs 빌드 실패? 조용히 퇴행 → 테스트 필수, 빌드 실패 → 주석 계약으로 충분 가능
- 인접 유닛 테스트 / 타입 가드 / 문서로 간접 보증 가능한가?
- 미래 fixture 인프라 구축 후 저렴해질 수 있는가? → **별도 인프라 이슈로 분리**

### 보강 3문 (volt [#71](https://github.com/coseo12/volt/issues/71))

위 5문이 "yes 편향" 으로 수렴할 때 교차점검:

- **회귀 종류를 구분하는가?** (성능 / 시각 / 논리 / 상태 일관성) — bench 게이트가 "조용히 퇴행" 을 감지한다고 낙관했다가 시각 회귀를 놓친 사례가 있음. bench 는 시각 정확성 측정 대상 아님
- **인접 테스트가 *같은 호출부* 를 덮는가?** — 클래스 계약 테스트는 인접으로 보이지만 tier 전환 같은 분기 로직은 별도 호출부라 간접 보증 범위 착각 가능
- **현 구조에 묶인 판정인가, 리팩터 후 판정인가?** — "Scene 클로저 mock 비용 과다" 로 판정한 로직이 사실 순수 함수로 추출 가능했던 사례. 구조 의존 비용 과대계상 방어

## 6-a 항 — 순수 함수 추출 우선 원칙 (volt [#71](https://github.com/coseo12/volt/issues/71))

다음 중 **하나**라도 해당하면 6항 ROI 체크 결과와 무관하게 **추출 + 단위 테스트 우선**:

- 분기 조건이 **입력 타입** (enum / discriminated union) 만으로 결정
- 사이드 이펙트가 **반환값 소비** 로 분리 가능 (`compute*(…) → result` 패턴)
- 같은 로직을 **다른 컨텍스트에서 재사용** 할 여지 (동일 함수가 여러 호출부에서 필요)
- 근거: astro-simulator #313 M2 에서 ROI 5문 전체 pass 판정 후 시각 회귀 (V5 322→296px, A1 0→119.9px) 실측. `computeFloatingOriginForTier(tier, focusId, lookup)` 로 추출 시 Scene 없이 8건 단위 테스트 가능했음. volt #49 (주석 계약 drift) 의 역방향 — **테스트 생략 판정의 drift** 도 동등하게 회귀 생성원

## 10항 — 수치 DoD 미달 시 측정 방법 검증 우선

DoD 수치가 미달이면 **(0) 측정 방법 검증 → (1) 식/구현 수정 → (2) 알고리즘 교체 → (3) 데이터 신뢰성 재확인** 4단계로 접근한다. 샘플링/윈도우/노이즈 특성이 미달의 진짜 원인인 경우가 잦다. 특히 신호가 약할 때(측정 대상 ≪ baseline) noise 가 이론값 방향으로 우연히 pull 되어 선행 Phase 의 "우연 성공" 기록으로 남아 있을 수 있다. 측정법 전환 전 식부터 수정하면 이미 올바른 식을 "틀렸다" 고 오진하는 역방향 손실이 발생한다.

- **(0)~(2) 는 "도구 측" (식·샘플링·적분기·알고리즘) 검증** — 측정 도구 자체의 결함을 배제
- **(3) 데이터 신뢰성 재확인은 "입력 측" 검증** — fixture / 상수 / 외부 참조 데이터의 epoch·좌표계·단위·발행 주체를 원본 대조. (0)~(2) 전수 수행 + 측정 도구가 synthetic/이상 fixture 에서 예상 동작 확인된 후에만 발동 (조기 실행 금지 — 도구 결함을 데이터 탓으로 돌리는 역방향 오진)
- **(3) 절차**: ① fixture 출처 재확인 (발행 주체·epoch·좌표계·단위) → ② 이론 평형/경계값 독립 계산으로 fixture 값이 정상 영역 내에 있는지 검증 → ③ 데이터 이슈로 판정 시 현 스프린트 범위 밖 후속 이슈로 분리 + 코드 assertion 제거 + `#[ignore]` 유지 + **세 위치 박제** (코드 주석 / PR 본문 / CHANGELOG — CLAUDE.md 본문 7항 참조)
- **의사결정 질문 2개**: "측정 도구가 synthetic/이상 fixture 에서 예상 동작하는가?" (도구 정상 확인) + "fixture 값이 측정 대상의 이론 평형/경계 내에 있는가?" (데이터 신뢰성 확인)
- **범용 적용**: 물리 시뮬레이터 (fixture epoch / 좌표계) / ML 모델 평가 (데이터셋 label noise, sampling bias) / 성능 벤치마크 (benchmark fixture vs 실제 production) / API 계약 테스트 (mock/stub vs 실제 endpoint 응답)
- 근거:
  - volt [#32](https://github.com/coseo12/volt/issues/32) — 지구 GR 세차 측정에서 EIH 식 structural bias 로 오진한 현상이 실제로는 `min_r` 샘플링 노이즈. LRL 벡터 + Newton baseline subtraction 측정법 전환으로 드러남 (**3단계 원칙 도출**)
  - volt [#53](https://github.com/coseo12/volt/issues/53) — astro-simulator P9 D5-b Laplace resonance 측정에서 (0)~(2) 전수 후에도 미달. 원인이 `solar-system.json` Galilean 4체 `meanLongitudeDeg` JPL 원본의 epoch 불일치로 **초기 Laplace 인자 φ₀=218° (이론 평형 180° 대비 38° 벗어남 → circulation 영역)** 임이 드러남. 도구·적분기·식 모두 정상 + 입력 데이터 측 결함으로 **4단계 확장 도출**

## 10-a 항 — 메인 오케스트레이터 SSoT JSON 부호 규약 자기 점검 (volt [#73](https://github.com/coseo12/volt/issues/73) / [#75](https://github.com/coseo12/volt/issues/75))

sub-agent 반환 SSoT JSON 필드명이 의미 단어 (`regression` / `error` / `loss` / `diff` 등) 를 포함할 때 필드값의 **부호 규약은 필드명만으론 판정 불가**. 메인 오케스트레이터가 수치 DoD 판정 전 **리포트 본문 (linked path) 을 먼저 읽고 부호 규약 확인** 필수. 특히 극단값 (±100% 이상, ±50% 이상 등) 은 부호 규약 재확인의 **자동 트리거**. sub-agent 텍스트 요약 ("5/5 PASS") 과 JSON 수치가 모순처럼 보이면 **해석이 틀렸을 가능성 먼저 의심** — DoD 위반 확정 전 본문 인용 필수. 10항 "측정 방법 검증 우선" 의 **메인 오케스트레이터 버전** — AI 자기 과대/과소 평가는 sub-agent 뿐 아니라 메인에도 적용. 근거: astro-simulator P11-B.2 PR #322 에서 `D4_regression_pct: {"idle": 366.2}` 를 메인이 "+366% 회귀" 로 역해석. 실제는 "+366% 개선" (fps 21.23→98.97). 리포트 본문은 `+366.2% 개선` 으로 명확 표기.
