# 지식 컴파일 규약 — volt ↔ harness

Gemini의 회고에서 도출한 양방향 컴파일 모델. **무엇을 어디에 두는지**의 단일 기준선.

## 핵심 원리

```
[사용 경험·결정·트러블슈팅·맥락]
        ↓ /capture-merge, /capture-volt
   ┌──────────────────────────┐
   │  coseo12/volt 이슈        │  ← 맥락(Why)·히스토리·재사용 가능 지식
   └──────────────────────────┘
        ↓ /volt-review (정제·승격)
   ┌──────────────────────────┐
   │  harness CLAUDE.md/스킬   │  ← 행위 제약(런타임 규칙)·반복 적용
   └──────────────────────────┘
        ↓ npx update
   [사용자 프로젝트에 배포]
```

**volt = 맥락 저장소**: 왜 이런 결정을 했는지, 어떤 트러블이 있었는지, 어떤 패턴이 반복되는지.
**CLAUDE.md/스킬 = 행위 제약**: AI/사용자가 다음 작업에서 *즉시 따라야 할* 규칙.

AI는 매 순간 외부 지식을 조회하지 않는다. 따라서 행위 제약은 **로컬에 압축 박제**되어야 한다.

## 어디에 두는가 — 결정 표

| 내용 유형 | 위치 | 근거 |
|---|---|---|
| 이번 작업의 트러블슈팅 기록 | volt `[report] troubleshooting` | 일회성 컨텍스트, 미래 검색용 |
| 도구/라이브러리 선택 결정 + 후보 비교 | volt `[report] decision` + `docs/decisions/<날짜>-<주제>.md` (ADR) | 결정의 *근거*는 volt, *결정 자체*는 ADR |
| 이번 마일스톤 회고 | volt `[report] retrospective` + `docs/retrospectives/<phase>.md` | 양쪽: volt는 검색용, retrospectives는 인수인계 |
| 반복 관찰된 워크플로 패턴 | volt `[report] pattern` → 임계 도달 시 `CLAUDE.md` 또는 스킬로 승격 | 1회는 패턴 아님, N회 관찰 후 규칙화 |
| 재사용 가능 개념·도구 사용법 | volt `[knowledge]` | 시간·맥락 독립 |
| **즉시 따라야 할 행위 규칙** | `CLAUDE.md` (CRITICAL DIRECTIVES 또는 일반 규칙) | 매 세션 자동 주입, AI가 즉시 적용 |
| 특정 작업 유형의 절차 | `.claude/skills/<스킬>/SKILL.md` | 트리거 시 자동 로드 |
| 페르소나 동작 정의 | `.claude/agents/<페르소나>.md` | sub-agent 호출 시 로드 |
| 전 프로젝트 공통 사용자 취향 | `~/.claude/CLAUDE.md` (글로벌) | 도구 자체 진화와 분리 |

## 승격 기준 — volt → CLAUDE.md/스킬

volt 이슈가 다음 중 하나면 **반복 적용 가능한 규칙**으로 승격 검토:

1. **3회 이상 관찰**: 같은 패턴/실수가 여러 작업에서 반복됨
2. **재발 위험이 큼**: 1회만 일어나도 손실이 큰 종류 (예: 데이터 손실, 보안 사고)
3. **다음 사용자/세션이 즉시 따라야 함**: 외부 조회 여유가 없는 종류

승격 절차는 `/volt-review` 스킬이 담당. 승격 후 원본 volt 이슈는 **삭제하지 않는다** — 맥락(Why)은 volt에 그대로 남고, 추출된 규칙만 CLAUDE.md/스킬에 박제.

## 강등 — CLAUDE.md → volt만 보존

CLAUDE.md/스킬의 규칙이 다음 중 하나면 **volt로만 보존하고 행위 제약에서 제거**:

1. **더 이상 위반 사례 없음**: 6개월 이상 트리거되지 않으면 박제 비용만 발생
2. **상위 규칙으로 흡수됨**: 더 일반적인 규칙이 같은 효과를 냄
3. **상황 의존성이 큼**: "항상 따르라"가 거짓이 됨

## 위치 결정 트리

```
새 지식이 생겼다.
│
├─ 시간/맥락 독립적이고 미래에 검색해서 쓸 것 같다
│   → volt knowledge
│
├─ 특정 작업의 결과/결정/회고/트러블슈팅이다
│   → volt report (유형 선택)
│
└─ 다음 작업/세션이 즉시 따라야 할 행위 규칙이다
    │
    ├─ 모든 프로젝트에 적용된다
    │   → ~/.claude/CLAUDE.md (글로벌)
    │
    ├─ harness 사용자 모두에게 적용된다
    │   → CLAUDE.md (프로젝트), CRITICAL이면 CRITICAL DIRECTIVES 블록
    │
    ├─ 특정 작업 유형에서만 트리거된다
    │   → .claude/skills/<스킬>/SKILL.md
    │
    └─ 페르소나 동작이다
        → .claude/agents/<페르소나>.md
```

## 안티 패턴

- ❌ "혹시 모르니 양쪽에 다 두자" — 갱신 비용 2배, 표류 위험. 한 곳을 SSoT로.
- ❌ volt 이슈를 CLAUDE.md에 그대로 복사 — volt는 맥락(긴 본문), CLAUDE.md는 압축 규칙
- ❌ 1회 관찰을 즉시 CLAUDE.md 규칙으로 박제 — 사례 부족, 일반화 위험
- ❌ "왜 이 규칙이 있는가"를 CLAUDE.md에 길게 씀 — Why는 volt 이슈 링크로

## 실무 파생 패턴

- **frozen 파일 분리** — frozen 카테고리 파일에 프로젝트 고유 로직을 얹어야 할 때 `ci-<slug>.yml` 형태로 분리하고 manifest에서 추적 제외. 상세: [docs/frozen-file-split.md](frozen-file-split.md)

## 참고

- `/volt-review` 스킬: 승격 절차
- `/capture-merge` `/capture-volt`: 캡처 진입점
- `record-adr` 스킬: 결정 박제
- harness CLAUDE.md "마일스톤 회고 루틴" 절
