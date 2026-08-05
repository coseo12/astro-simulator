# 슬래시 커맨드 인덱스

harness가 제공하는 8개 슬래시 커맨드 한눈에. Claude Code 세션에서 호출.

## 페르소나 (5종 + 디스패처)

작업 흐름: `/pm → /architect → /dev → /review → /qa → 사용자 머지`. 중간에 `/next`로 자동 추천.

| 명령 | 페르소나 | 입력 | 출력 |
|---|---|---|---|
| `/pm <요구>` | 적응적 질답 → 스프린트 계약 | 사용자 요구 (모호 가능) | 이슈 본문 = 완료 기준 목록 |
| `/architect <이슈>` | 설계 결정 + ADR | 이슈 + 코드베이스 | 이슈 코멘트 + `docs/decisions/*.md` |
| `/dev <이슈>` | 구현 (developer.md) | 이슈 + architect 산출 | 작업 브랜치 (`<type>/*`) + PR |
| `/review <PR>` | 정적 5축 리뷰 | PR diff + 이슈 | PR 코멘트 + 라벨 전이 |
| `/qa <PR>` | 동적 검증 (3단계) | PR + 이슈 | PR 코멘트(증거) + 라벨 전이 |
| `/next [번호]` | thin orchestrator | 이슈/PR 라벨 | 정책에 따라 다음 페르소나 추천/호출 |

## 운영/대시보드

| 명령 | 동작 |
|---|---|
| `/team-status` | 페르소나별 작업 큐 + 라벨 무결성 + 권장 액션 |

## 지식 루프 (volt)

| 명령 | 동작 |
|---|---|
| `/capture-merge [PR]` | PR 머지 → volt 캡처 자동 초안 (사용자 승인) |
| `/volt-review [#N|--label|--since]` | volt 이슈 → harness 반영 개선안 → PR |

## 자주 쓰는 흐름

### 1. 새 작업 시작 (모호한 요구)
```
/pm 사용자 프로필 페이지 개선해줘
  → 명확도 점수 보고 → 적응적 질답 → 이슈 생성 (stage:planning)

/next <이슈>
  → /architect 자동 추천 (또는 정책 따라 자동 호출)

/architect <이슈>
  → 이슈 코멘트(설계안) + ADR(필요 시) → 라벨 stage:dev

/dev <이슈>
  → 구현 + PR

/next <PR>
  → /review 자동 추천

/review <PR>
  → 통과 시 stage:qa, 차단 시 stage:dev 되돌림

/qa <PR>
  → 통과 시 stage:done → 사용자 머지
```

### 2. 마일스톤 종료 후 지식 캡처
```
/capture-merge <PR>
  → volt 이슈 초안 → 사용자 검토 → push

(다음 세션)
/volt-review
  → 누적된 volt 이슈 → harness 개선 PR
```

## 보조 — CLI 명령

세션 외부에서 실행:

```bash
bash scripts/setup-stage-labels.sh   # stage:* 6종 라벨 (페르소나 핸드오프용)
```

> 참고: 하네스 동기화 커맨드 (`/harness-update` 등) 는 #907 디커플 (ADR 20260731-907-harness-decouple) 로
> 제거됨 — upstream 은 읽기 전용 부트스트랩 템플릿으로 강등, 필요 시 수동 cherry-pick.

## 참고 문서

- `docs/agents-guide.md` — 페르소나 모델·라벨·정책 상세
- `docs/knowledge-compilation.md` — volt ↔ CLAUDE.md 컴파일 규약
- `CLAUDE.md` CRITICAL DIRECTIVES — 6개 핵심 규칙
