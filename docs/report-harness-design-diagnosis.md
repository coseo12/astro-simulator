# Harness Framework 진단 레포트

> **기준 문서**: [Anthropic Engineering - Harness Design for Long-Running Apps](https://www.anthropic.com/engineering/harness-design-long-running-apps)
> **진단 대상**: Harness Engineering Framework (harness_setting)
> **작성일**: 2026-03-27

---

## 1. 진단 요약

Anthropic 블로그에서 제시한 핵심 원칙 7가지를 기준으로 현재 프레임워크를 진단한다.

| # | 원칙 | 현재 상태 | 등급 |
|---|------|----------|------|
| 1 | 컨텍스트 관리 (Reset vs Compaction) | 부분 구현 | B |
| 2 | Generator-Evaluator 분리 | 구조적으로 도입됨 | A |
| 3 | 하네스 복잡도 최소화 | 과도한 복잡도 | D |
| 4 | 모델 진화에 따른 하네스 간소화 | 미적용 | D |
| 5 | Sprint Contract 체계 | 미도입 | C |
| 6 | 주관적 평가의 측정 가능한 기준 | 부분 도입 | B |
| 7 | 파일 기반 구조화된 핸드오프 | 도입됨 | A |

**종합 등급: C+** — 구조적 설계는 우수하나, Anthropic이 강조하는 "최소 복잡도" 원칙에 역행하는 과설계 경향이 두드러진다.

---

## 2. 원칙별 상세 진단

### 2.1 컨텍스트 관리: Reset vs Compaction

**Anthropic의 원칙:**
> "A reset provides a clean slate, at the cost of the handoff artifact having enough state for the next agent to pick up the work cleanly."

컨텍스트가 소진되면 두 가지 전략이 있다:
- **Compaction**: 대화를 요약하여 동일 에이전트가 계속 진행 (Context anxiety 잔존)
- **Context Reset**: 컨텍스트를 완전 초기화하고 구조화된 핸드오프 수행 (깨끗하지만 상태 전달 비용)

**현재 프레임워크 상태:**

현재 프레임워크는 에이전트 간 핸드오프를 GitHub Issues/PR 코멘트와 `.harness/state.json`으로 수행한다. 이는 **Context Reset 모델**에 해당하며, 원칙에 부합한다.

**문제점:**
- `state.json`의 구조가 에이전트 전환 시 충분한 컨텍스트를 전달하는지 불명확
- Orchestrator가 에이전트를 dispatch할 때 전달하는 컨텍스트의 양과 형식이 표준화되어 있지 않음
- **핸드오프 artifact의 품질 기준**이 없음 — 다음 에이전트가 이전 작업을 완전히 이해하기에 충분한가?

**권장사항:**
1. 에이전트 전환 시 **핸드오프 문서 템플릿** 도입 (완료 상태, 미완료 항목, 주의사항, 다음 단계)
2. 단일 에이전트의 장시간 작업 시 Compaction 전략 명시 (현재 전혀 언급 없음)
3. Context anxiety 대응 전략 추가 (특히 Developer 에이전트)

---

### 2.2 Generator-Evaluator 분리

**Anthropic의 원칙:**
> "Separating the agent doing the work from the agent judging it proves to be a strong lever to address this issue."
> "Out of the box, Claude is a poor QA agent."

자신의 작업을 평가하는 에이전트는 객관성을 잃는다. Generator와 Evaluator를 분리해야 한다.

**현재 프레임워크 상태:**

이 원칙은 **구조적으로 잘 구현**되어 있다:

| Generator | Evaluator | 관계 |
|-----------|-----------|------|
| Developer | Auditor | 정적 분석으로 테스트 과적합/보안 검증 |
| Developer | Reviewer | 설계 준수, 코드 품질 판단 |
| Developer | QA | E2E 테스트, 기능 검증 |
| Planner | PM | 기획서를 실행 가능한 이슈로 검증/분해 |

**강점:**
- 3단계 평가 (Auditor → Reviewer → QA)는 Anthropic이 권장하는 패턴을 넘어서는 심층 검증
- Auditor의 "테스트 과적합 검증"은 블로그에서 언급한 Evaluator 튜닝의 좋은 예시

**문제점:**
- Anthropic은 Evaluator가 "부정적으로 기울어야(negatively biased)" 더 효과적이라고 강조했는데, 현재 Reviewer/QA 에이전트 프롬프트에 이런 편향 지시가 없음
- QA 에이전트가 "out-of-the-box Claude는 poor QA agent"라는 Anthropic의 경고에도 불구하고, QA 프롬프트에 **구체적인 실패 시나리오 패턴**이 부족
- Evaluator 간 역할 중복 (Auditor와 Reviewer 모두 보안, 테스트 품질 검증)

**권장사항:**
1. QA/Reviewer 프롬프트에 **부정 편향 지시** 추가: "문제를 발견하면 중요하지 않다고 자기설득하지 말고 반드시 보고하라"
2. 평가자 에이전트 프롬프트에 Anthropic이 발견한 구체적 실패 패턴 추가
3. Auditor와 Reviewer의 검증 범위 중복 정리

---

### 2.3 하네스 복잡도 최소화 — 가장 심각한 문제

**Anthropic의 원칙:**
> "Find the simplest solution possible, and only increase complexity when needed."
> "Every component in a harness encodes an assumption about what the model can't do on its own, and those assumptions are worth stress testing."

**현재 프레임워크의 복잡도:**

| 구성요소 | 수량 |
|---------|------|
| 에이전트 | 15개 |
| 스킬 | 15개 |
| 셸 스크립트 | 9개 |
| 상태 라벨 | 14개 |
| 에이전트 라벨 | 15개 |
| 파이프라인 단계 | 10단계 |

**Anthropic 사례와 비교:**

Anthropic이 실제 운영한 하네스:
- **초기**: Planner + Generator + Evaluator (3개 에이전트) + Sprint Contract
- **Opus 4.6 이후**: Planner + Generator + Evaluator(단일 종료 패스) (3개, 더 단순화)
- Sprint 구조 **완전 제거**, Evaluator를 스프린트별 → 최종 1회로 축소

현재 프레임워크는 **15개 에이전트 + 10단계 파이프라인**으로, Anthropic이 경고하는 과설계의 전형이다.

**구체적 과설계 지점:**

1. **Integrator 에이전트**: 문서/설정 정합성 검증은 CI 스크립트(`validate-integrity.sh`)로 충분. 별도 에이전트가 필요한 이유 불명확.

2. **DevOps 에이전트**: "24시간 이상 정체 감지, 에이전트 교착 복구" 등은 Orchestrator의 책임에 이미 포함. 역할 분리의 이점이 비용을 정당화하지 못함.

3. **Releaser 에이전트**: CHANGELOG 생성과 태그 작성은 스킬(`create-release`)로 이미 존재. 에이전트와 스킬이 중복.

4. **Cross Validator 에이전트**: Gemini CLI 교차검증은 실험적 가치가 있으나, 핵심 파이프라인에 포함될 필요 없음. 선택적 도구로 격하 가능.

5. **Planner → PM → Architect 3단계**: Anthropic은 Planner 1개로 스펙 확장을 처리. PM의 "이슈 분해"와 Architect의 "설계"를 2개 에이전트로 압축 가능.

6. **Auditor → Reviewer → QA 3단계 검증**: Anthropic은 Evaluator 1개. 3단계는 각 에이전트가 독립적 가치를 제공하는지 스트레스 테스트 필요.

**권장사항:**
1. 각 에이전트를 **제거했을 때 품질이 떨어지는지** 실험 (점진적 제거)
2. Integrator, DevOps, Releaser를 스킬/스크립트로 격하
3. PM과 Architect를 하나로 통합 가능성 검토
4. 파이프라인을 **Planner → Developer → Evaluator → Merge** 4단계로 단순화하는 실험

---

### 2.4 모델 진화에 따른 하네스 간소화

**Anthropic의 원칙:**
> "Every component in a harness encodes an assumption about what the model can't do on its own."
> Opus 4.6으로 업그레이드 후 Sprint 구조를 완전히 제거했다.

**현재 프레임워크 상태:**

프레임워크가 **어떤 모델을 가정하고 설계**되었는지 명시되어 있지 않다. 모델 업그레이드 시 재검토 프로세스도 없다.

Opus 4.6 기준으로 불필요할 수 있는 구조:
- **Sprint 단위 작업 분할**: Anthropic은 Opus 4.6에서 제거. Developer 에이전트가 이미 충분히 긴 작업을 처리할 수 있음.
- **상세한 API 계약 명세**: 모델이 더 나은 코드 생성 능력을 갖추면서 인터페이스 수준 명세만으로 충분할 수 있음.
- **Mock 기반 FE/BE 분리 개발**: 모델의 코드 이해력 향상으로, 통합 개발이 더 효율적일 수 있음.

**권장사항:**
1. 프레임워크에 **"모델 가정 문서"** 추가 — 각 구성요소가 모델의 어떤 한계를 보완하는지 명시
2. 새 모델 출시 시 **하네스 스트레스 테스트 프로토콜** 수립
3. 현재 Opus 4.6 기준으로 각 에이전트의 필요성 재평가

---

### 2.5 Sprint Contract 체계

**Anthropic의 원칙:**

Generator와 Evaluator가 코드 작성 **전에** "완료"의 정의를 협상한다:
1. Generator가 무엇을 빌드할지, 성공을 어떻게 검증할지 제안
2. Evaluator가 올바른 것을 빌드하는지 검토
3. 합의할 때까지 반복
4. 파일을 통한 통신

**현재 프레임워크 상태:**

프레임워크에는 **Specification-Driven Testing**이 있어 Architect가 테스트 시나리오를 정의하고 Developer가 이를 코드로 변환한다. 이는 Sprint Contract의 "사전 합의" 개념과 유사하나, 핵심 차이가 있다:

| 측면 | Sprint Contract (Anthropic) | Spec-Driven Testing (현재) |
|------|---------------------------|--------------------------|
| 협상 주체 | Generator ↔ Evaluator | Architect → Developer (단방향) |
| 합의 과정 | 양방향 반복 | 일방적 전달 |
| 시점 | 각 스프린트 시작 전 | 설계 단계 1회 |
| 유연성 | 구현 중 발견에 따라 조정 | 고정 |

**문제점:**
- Developer가 구현 중 시나리오의 비현실성을 발견해도 피드백 루프가 없음
- Evaluator(Reviewer/QA)가 사전에 "완료 기준"을 합의하지 않아, 리뷰 시 기대 불일치 발생 가능

**권장사항:**
1. Developer가 구현 착수 전 Architect 시나리오에 **역제안**할 수 있는 메커니즘 도입
2. Reviewer/QA가 PR 리뷰 전에 "이 PR에서 확인할 항목"을 먼저 코멘트하는 **사전 합의 단계** 추가
3. 단, Opus 4.6에서는 Sprint Contract 자체가 제거되었으므로, 과도하게 형식화하지 않을 것

---

### 2.6 주관적 평가의 측정 가능한 기준

**Anthropic의 원칙:**

프론트엔드 설계 평가를 위해 4가지 측정 기준을 개발:
1. **Design Quality** — 전체적 조화와 일관성
2. **Originality** — 템플릿/기본값 탈피
3. **Craft** — 타이포그래피, 간격, 색상 조화의 기술적 실행
4. **Functionality** — 미학과 무관한 사용성

가중치: Design Quality와 Originality에 더 높은 가중치 (모델이 기능은 이미 잘함)

**현재 프레임워크 상태:**

`frontend-design` 스킬이 존재하며, 미학적 방향 설정을 포함한다:
- 11가지 미학 스타일 (미니멀리즘, 브루탈리즘, 아르데코 등)
- "피해야 할 것" 목록 (Inter 폰트, 뻔한 색상 등)

**강점:**
- Anthropic이 지적한 "AI 특유의 보라색 그라데이션" 같은 패턴을 명시적으로 금지
- 다양한 미학 스타일 제시로 Originality 유도

**문제점:**
- **정량적 평가 기준이 없음** — Reviewer/QA가 디자인을 판단할 기준표 부재
- "독창적"의 정의가 Evaluator에게 전달되지 않음
- Anthropic의 4가지 기준(Design Quality, Originality, Craft, Functionality) 같은 명시적 루브릭 없음

**권장사항:**
1. Reviewer 프롬프트에 **디자인 평가 루브릭** 추가 (Anthropic의 4가지 기준 차용)
2. 각 기준별 1-5점 스케일과 가중치 정의
3. "통과/실패" 임계값 설정

---

### 2.7 파일 기반 구조화된 핸드오프

**Anthropic의 원칙:**

에이전트 간 통신은 파일을 통해 구조화:
- 한 에이전트가 파일 작성
- 다음 에이전트가 읽고 응답

**현재 프레임워크 상태:**

잘 구현되어 있다:
- `docs/plans/*.md` — Planner → PM 핸드오프
- `docs/architecture/*.md` — Architect → Developer 핸드오프
- `.harness/state.json` — 전체 상태 공유
- GitHub Issues/PR — 에이전트 간 비동기 통신

**강점:**
- 다중 채널 (파일 + GitHub + state.json)로 신뢰성 확보
- 기획서와 설계 문서의 **표준화된 템플릿** 존재

---

## 3. Anthropic 사례와의 비용-효과 비교

### Anthropic의 실측 데이터

| 구성 | 시간 | 비용 | 품질 |
|------|------|------|------|
| Solo Agent | 20분 | $9 | 기능 불완전 |
| Full Harness (3 에이전트) | 6시간 | $200 | 완전한 기능 |
| 간소화된 Harness (Opus 4.6) | 3시간 50분 | $125 | 완전한 기능 |

### 현재 프레임워크의 예상 비용 구조

15개 에이전트, 10단계 파이프라인은 Anthropic의 3-에이전트 하네스 대비:
- **토큰 소비**: 에이전트 전환마다 컨텍스트 재구성 필요 → 약 3-5배 오버헤드
- **지연 시간**: 직렬 파이프라인 10단계 → Anthropic 대비 약 2-3배 지연
- **실패 비용**: 단계가 많을수록 중간 실패 확률 증가 → 재시도 비용 누적

**핵심 질문**: 15개 에이전트가 3개 에이전트 대비 제공하는 **한계 품질 개선**이 추가 비용을 정당화하는가?

---

## 4. 종합 권장사항

### 즉시 실행 (Quick Wins)

| # | 항목 | 효과 |
|---|------|------|
| 1 | QA/Reviewer 프롬프트에 부정 편향 지시 추가 | 평가 품질 향상 |
| 2 | 모델 가정 문서 작성 | 향후 간소화 기준 확보 |
| 3 | 핸드오프 문서 템플릿 표준화 | 에이전트 전환 시 컨텍스트 손실 방지 |

### 단기 실험 (1-2주)

| # | 항목 | 방법 |
|---|------|------|
| 4 | 에이전트 점진적 제거 실험 | Integrator, DevOps, Releaser 제거 후 품질 비교 |
| 5 | 파이프라인 단순화 실험 | 10단계 → 5단계로 축소하여 동일 태스크 실행 |
| 6 | 디자인 평가 루브릭 도입 | Anthropic의 4가지 기준 적용 후 Reviewer 판단 품질 측정 |

### 중기 구조 개선

| # | 항목 | 방향 |
|---|------|------|
| 7 | 에이전트 통합 | PM+Architect → Designer, Auditor+Reviewer → Evaluator |
| 8 | 파이프라인 재설계 | Planner → Developer → Evaluator → Merge (4단계) |
| 9 | 적응형 복잡도 | 이슈 크기(size:s~xl)에 따라 파이프라인 단계 자동 조절 |

---

## 5. 결론

Anthropic 블로그의 핵심 메시지는 명확하다:

> **"The space of interesting harness combinations doesn't shrink as models improve. Instead, it moves."**

현재 프레임워크는 **구조적 설계의 완성도**에서 우수하다. 역할 분리, Specification-Driven Testing, Generator-Evaluator 패턴 등 핵심 원칙이 잘 반영되어 있다.

그러나 Anthropic이 가장 강조하는 원칙 — **"최소 복잡도에서 시작하여 필요할 때만 복잡도를 추가하라"** — 에 역행한다. 15개 에이전트와 10단계 파이프라인은 Anthropic이 3개 에이전트로 "완전한 기능의 애플리케이션"을 만든 사례와 대비된다.

**프레임워크의 다음 단계는 "추가"가 아니라 "제거"다.** 각 구성요소를 제거했을 때 품질이 실제로 떨어지는지 실험하고, 모델의 발전에 맞춰 보조 구조를 점진적으로 줄여나가는 것이 Anthropic이 제시하는 방향이다.
