# AI 에이전트와 TDD: 토론 리포트

> **작성일**: 2026-03-26
> **참여**: Claude (Opus 4.6) + Gemini (2.5 Pro)
> **주제**: AI 에이전트가 코드를 생성할 때 TDD가 필요한가?

---

## 1. 토론 배경

### 현재 방식: Implementation-First
```
Developer: 코드 구현 → 테스트 작성 → 테스트 실행 확인
```

### TDD 방식
```
Developer: 테스트 작성 (Red) → 최소 구현 (Green) → 리팩토링 (Refactor)
```

### 실제 경험에서 발견된 문제
- 채팅 앱: 구현 후 33개 테스트 통과 → **E2E에서 모바일 사이드바 버그 발견**
- ChatHeader에 `useRouter` 추가 → **기존 테스트 깨짐** (mock 미업데이트)
- 두 문제 모두 "테스트가 먼저 있었다면" 예방 가능했음

---

## 2. Gemini 핵심 주장

### AI에서 TDD의 Red 단계는 무의미하지 않다
> "TDD의 Red 단계는 실패를 '경험'하는 것이 목적이 아니라, **달성해야 할 목표를 명확히 정의하는 행위**다. AI에게 이는 '네가 해야 할 일은 바로 이 테스트를 통과시키는 것이다'라는 명확한 작업 지시서다."

### Contract-First Testing 강력 추천
> "Architect가 코드 스켈레톤과 함께 **빈 테스트 케이스(테스트 명세)를 생성** → Developer가 이를 통과시키는 코드를 작성. 이는 프롬프트 엔지니어링의 가장 정교한 형태다."

### QA Shift-Left
> "QA 에이전트가 개발 초기에 인수 조건 기반 E2E 시나리오 초안을 작성하면, Developer에게 또 하나의 명세서가 된다."

---

## 3. Claude 분석: 동의와 이견

### 동의하는 부분

**1. AI에게 테스트는 "가장 정확한 프롬프트"다.**

사람 개발자에게 TDD의 Red 단계는 설계 사고를 강제하는 훈련이다. AI에게는 그런 훈련이 필요 없지만, **테스트 코드 자체가 자연어 요구사항보다 정밀한 명세서** 역할을 한다. "채팅 헤더를 만들어줘"보다 아래가 더 정확하다:

```typescript
it('뒤로가기 클릭 시 /chat으로 이동한다', () => {
  const push = vi.fn();
  vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
  render(<ChatHeader roomName="방" onlineCount={3} />);
  fireEvent.click(screen.getByLabelText('뒤로가기'));
  expect(push).toHaveBeenCalledWith('/chat');
});
```

이 테스트가 있었다면 `useRouter` mock 누락 문제는 애초에 발생하지 않았다.

**2. 하이브리드가 현실적이다.**

모든 코드에 TDD를 강제하면 토큰 낭비. API/비즈니스 로직은 TDD, 탐색적 UI는 Implementation-First가 맞다.

### 이견이 있는 부분

**1. AI의 TDD는 "과적합(Overfitting)" 위험이 크다.**

Gemini도 인정했지만, 이 위험은 사람보다 AI에서 훨씬 심각하다. AI는 테스트를 통과시키는 **최소한의 코드**를 찾는 데 최적화되어 있어, 하드코딩이나 편법적 구현을 할 수 있다:

```typescript
// 테스트: expect(add(2, 3)).toBe(5)
// AI가 생성할 수 있는 과적합 코드:
function add(a: number, b: number) { return 5; }
```

**해결책**: Reviewer/Auditor가 "테스트 통과 여부"가 아닌 **"구현의 일반성"**을 검증해야 한다.

**2. Architect가 테스트 명세까지 작성하면 병목이 된다.**

Contract-First Testing은 이상적이지만, Architect 에이전트의 부담이 과도해진다. 현재도 구조 설계 + API 명세 + 디자인 시스템을 담당하는데, 테스트 명세까지 추가하면 Architect가 병목이 된다.

**현실적 대안**: Architect는 **인터페이스(타입)만 정의** → Developer가 타입 기반으로 테스트+구현을 함께 작성.

---

## 4. 합의: AI 에이전트 팀을 위한 테스트 전략

### 4-1. Specification-Driven Testing (명세 기반 테스트)

TDD도 아니고 Implementation-First도 아닌, **AI에 최적화된 제3의 방식**:

```
Architect: 타입 + API 계약 + 테스트 시나리오 목록 (코드 아님)
    ↓
Developer: 테스트 시나리오를 코드로 변환 → 구현 → 전부 통과
    ↓
QA: E2E 시나리오 실행 (듀얼 뷰포트)
```

**핵심 차이점**:
- 순수 TDD: Architect가 실행 가능한 테스트 코드를 작성
- 우리 방식: Architect가 **시나리오 목록(자연어)**을 작성 → Developer가 테스트 코드화

이렇게 하면:
- Architect 병목 방지 (코드 작성 불필요)
- Developer가 테스트를 "먼저 코드화"하므로 TDD의 이점 확보
- 시나리오 목록이 Reviewer/QA의 체크리스트 역할

### 4-2. 상황별 전략 매트릭스

| 상황 | 전략 | 이유 |
|------|------|------|
| API/백엔드 로직 | **테스트 우선** | 입출력이 명확, 테스트가 곧 명세 |
| 버그 수정 | **테스트 우선** | 재현 테스트 → 수정 → 통과 확인 |
| 복잡한 비즈니스 룰 | **테스트 우선** | 엣지 케이스 누락 방지 |
| UI 컴포넌트 (설계 확정) | **테스트 우선** | 인터랙션/상태 전이 명세화 |
| 탐색적 UI 프로토타입 | **구현 우선** | 디자인 확정 전 빠른 반복 |
| 초기 아키텍처 Spike | **구현 우선** | 기술 검증 단계 |

### 4-3. 파이프라인 변경안

#### 현재
```
Architect(설계) → Developer(구현→테스트) → Auditor → Reviewer → QA(E2E)
```

#### 제안
```
Architect(설계 + 테스트 시나리오 목록)
    → Developer(시나리오→테스트 코드→구현→통과)
        → Auditor(정적분석 + 과적합 검증)
            → Reviewer(코드리뷰 + 테스트 충분성)
                → QA(E2E 듀얼 뷰포트 + 회귀)
```

**변경 포인트**:
1. Architect 산출물에 "테스트 시나리오 목록" 섹션 추가
2. Developer가 시나리오를 테스트 코드로 변환 후 구현 (Specification-Driven)
3. Auditor에 "과적합 검증" 역할 추가
4. Reviewer가 "테스트 충분성" 확인

---

## 5. 구체적 도입 방법

### Architect 설계 문서에 추가할 섹션

```markdown
## 테스트 시나리오

### API: POST /api/auth/register
- 정상 회원가입 → 201 + user + token
- 이메일 중복 → 409
- 이메일 형식 오류 → 400
- 비밀번호 6자 미만 → 400
- 닉네임 2자 미만 → 400

### 컴포넌트: ChatHeader
- 방 이름을 표시한다
- 접속자 수를 표시한다
- 모바일에서 뒤로가기 버튼이 보인다
- 뒤로가기 클릭 시 /chat으로 이동한다
- 데스크톱에서 뒤로가기 버튼이 숨겨진다

### E2E: 채팅 흐름
- 회원가입 → 채팅 페이지 리다이렉트
- 채팅방 생성 → 방 입장
- 메시지 전송 → 버블 표시
- 모바일: 방 입장 시 사이드바 숨김
- 모바일: 뒤로가기 시 사이드바 복원
```

### Developer 작업 순서

```
1. Architect의 시나리오 목록을 읽는다
2. 시나리오를 테스트 코드로 변환한다 (이때 mock/fixture 설정)
3. 테스트 실행 → 전부 실패 확인 (Red 검증, 선택적)
4. 구현 코드 작성
5. 테스트 실행 → 전부 통과 확인
6. 리팩토링 (필요 시)
```

---

## 6. 결론

| 항목 | 결론 |
|------|------|
| **순수 TDD 필요 여부** | 불필요 (AI에게 Red 체험 가치 없음) |
| **테스트 먼저 작성 가치** | **매우 높음** (가장 정확한 프롬프트) |
| **최적 전략** | Specification-Driven Testing (명세 기반) |
| **Architect 역할 확장** | 테스트 시나리오 목록 (코드 아닌 자연어) |
| **Developer 방식 변경** | 시나리오 → 테스트 코드 → 구현 순서 |
| **과적합 방지** | Auditor/Reviewer가 "구현의 일반성" 검증 |
| **E2E 시나리오** | QA가 아닌 **Architect 단계에서 정의** |

> **핵심 메시지**: AI 에이전트에게 TDD의 가치는 "Red-Green-Refactor 사이클"이 아니라 **"테스트가 가장 정밀한 명세서"**라는 점에 있다. Architect가 테스트 시나리오를 설계하고, Developer가 이를 코드화하여 구현하는 **Specification-Driven Testing**이 AI 팀에 최적이다.
