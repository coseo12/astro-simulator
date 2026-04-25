# CLAUDE.md 비대화 방지 상세 프로토콜

> **요지**: CLAUDE.md 는 매 세션·매 턴 전량 어텐션 대상이다. 크기가 커질수록 각 규칙의 상대적 비중이 희석되어 "많이 적어도 지켜지지 않는" 역설이 발생한다. 본 가이드는 CLAUDE.md 의 **각인층** 기능을 보호하는 운영 프로토콜이다.
>
> 본문 1줄 요약은 CLAUDE.md `## 원칙 > ### CLAUDE.md 비대화 방지` 참조. 본 문서는 상세 실행 절차.

---

## 1. 용도 구분 (각인층 / 참조층)

### 1.1 각인층 (CLAUDE.md 본문)
세션 시작 즉시 상기돼야 **행동이 바뀌는** 규칙만 본문에 남긴다.

- CRITICAL DIRECTIVE (절대 규칙)
- 원칙 한 줄 요약 — "무엇을 우선할지" 판정
- 금지/강제 규칙 — "하지 마라 / 반드시 해라"
- 트리거 조건 — "이 상황이면 이렇게"

### 1.2 참조층 (`docs/` 포인터)
필요 시 탐색 가능한 상세는 참조층으로 분리한다.

- 프로토콜 스텝 / 플로우차트
- 매트릭스, 표, 체크리스트
- JSON 스키마, 코드 블록
- 근거 (볼트 이슈 체인, 과거 사례 상세)
- 예시 시나리오, 사례 비교

### 1.3 판정 질문
블록을 본문에 인라인할지 `docs/` 로 옮길지 애매할 때:

> "이 블록을 읽지 않으면 다음 응답에서 즉시 잘못된 행동을 할 것인가?"

- **예** → 각인층. 한 줄로 압축 가능한지 먼저 확인
- **아니오** → 참조층. 본문에는 "무엇을 하라" 1~3 줄 + `docs/` 링크

---

## 2. 추출 기준 (블록 추가/수정 시 체크)

다음 중 **하나라도** 해당하면 `docs/` 로 추출한다:

| 기준 | 임계 |
|---|---|
| 표/매트릭스 행 수 | 3 행 이상 |
| JSON/코드 블록 라인 수 | 5 라인 이상 |
| 프로토콜 스텝 수 | 3 단계 이상 + 각 단계 보조 설명 포함 |
| 근거 이슈 링크 수 | 2 개 이상 연결 |

### 2.1 남기는 본문 포맷
추출 후 CLAUDE.md 본문에는 다음 포맷으로만 남긴다:

```markdown
### <주제>
- <원칙 1~3 줄>
- 상세: [docs/<path>.md](docs/<path>.md)
```

### 2.2 동적 운영 권고 (Gemini 제안 3)
정적 임계 외에, 다음 동적 지표도 참조한다 — 필수 아닌 **권고**:

- 각인층에 있는 규칙이 **6개월 이상 수정/논의되지 않았다면** 참조층 전환 적극 검토
- 이유: 안정화된 규칙은 재각인 필요성이 낮아지고, 새로 각인해야 할 규칙을 위한 공간이 필요해진다

---

## 3. 정량 게이트 (char 단위, Unicode code point)

| 임계 | 동작 | 도구 |
|---|---|---|
| **35k chars** | 경계 경보 | `harness doctor` warn |
| **40k chars** | PR 체크 warn | `verify-claudemd-size.sh` (신규 인라인 블록 금지 안내) |
| **45k chars** | CI fail | `verify-claudemd-size.sh` in `harness-guards` |

> **SSoT (#203)**: 위 임계값은 [`lib/claudemd-size-constants.js`](../../lib/claudemd-size-constants.js) 에서 단일 선언되며 `lib/verify-claudemd-size.js` / `lib/doctor.js` 가 이를 import 한다. 변경 시 SSoT 1곳만 수정하면 모든 가드가 자동 동기화.

### 3.1 절대불변 아님 (Gemini 제안 4)
위 수치는 **현재 Claude Code 내부 경고(40k)와 본 저장소의 실측 기반(42.6k)** 을 근거로 설정한 실용적 경계이다.

- 향후 에이전트 컨텍스트 크기 / 어텐션 특성 데이터가 축적되면 **재조정 가능**
- 중요한 것은 임계값이 아니라 **임계를 통한 검토·제어 시스템** 그 자체
- 재조정 시 `lib/claudemd-size-constants.js` 한 곳만 수정 + 본 가이드 표 갱신 (동일 PR)

### 3.2 char 카운트 방법

Node 기반 구현 (`lib/verify-claudemd-size.js`) 이 `[...str].length` 로 **Unicode code point 단위** 측정. locale 독립 (#203).

```bash
# 공식 게이트 실행 — locale 영향 없음
bash scripts/verify-claudemd-size.sh
# 또는 직접 Node 호출
node lib/verify-claudemd-size.js
```

> **이전 shell 구현의 한계 (#203 해소)**: `LC_ALL=en_US.UTF-8 wc -m` 은 self-hosted runner 에서 해당 locale 미설치 시 POSIX 로 폴백 → 바이트 수 (한글 62% 부풀림, 실측: 70,500 vs 실제 43,305) 오탐 유발. Node 포트로 완전 해소.

---

## 4. 강제 메커니즘

### 4.1 `scripts/verify-claudemd-size.sh`
- CI `detect-and-test` 잡에서 실행
- 35k 초과: stdout 경보만 (exit 0)
- 40k 초과: stdout warn + PR 체크 코멘트 (exit 0)
- 45k 초과: stderr fail + exit 1

### 4.2 `harness doctor` 에 "각인 예산" 항목 추가
- 현재 CLAUDE.md char 수 보고
- 35k/40k/45k 게이트 위치 표시
- 예: `🟢 CLAUDE.md: 28,432 chars (예산 35k 이내)`

### 4.3 `scripts/verify-docs-links.sh` (Gemini 제안 2 — 링크 무결성)
- CLAUDE.md → `docs/` 링크 전수 추출 후 `test -f` 로 파일 존재 확인
- 깨진 링크 발견 시 exit 1 + 누락 경로 stderr 보고
- 추출이 늘어날수록 link rot 위험 증가 — 본 스크립트로 구조적 방어

### 4.4 PR 템플릿 체크박스
CLAUDE.md 또는 `docs/` 를 수정하는 PR 에서:

```markdown
- [ ] CLAUDE.md 신규 블록 추가 시: 이 블록은 세션 시작 즉시 상기돼야 행동이 바뀌는가? (No 면 `docs/` 로 이동)
- [ ] 현재 CLAUDE.md size 가 40k 초과 시 이 PR 이 감축 PR 인가, 신규 추가 PR 인가?
- [ ] `bash scripts/verify-claudemd-size.sh` 통과
- [ ] `bash scripts/verify-docs-links.sh` 통과
```

---

## 5. 기존 블록 가지치기 프로토콜 (Gemini 제안 1 + 7)

신규 추가 기준만 있으면 시스템 불완전. **기존 규칙 재평가**가 대칭적으로 필요.

### 5.1 40k 진입 시 (PR warn 단계)
- `awk` 로 섹션별 bytes 재측정:

```bash
awk '/^## /{if(name)print chars"\t"lines"\t"name; name=$0; chars=0; lines=0; next} {chars+=length($0)+1; lines++} END{if(name)print chars"\t"lines"\t"name}' CLAUDE.md | sort -rn | head
```

- 상위 섹션 중 **6개월 미수정 + 참조 빈도 낮은 블록** 우선 추출 후보
- 다음 신규 블록 추가 전에 1건 이상 추출 목표

### 5.2 45k 접근 시 (CI fail 직전)
**새 규칙 추가 전 "무엇을 옮길지" 먼저 논의**한다. 대응은 "규칙을 어기는 것"이 아니라 **"새 규칙을 위한 공간 확보"**.

### 5.3 45k 초과 시 (CI fail)
- 감축 PR 을 먼저 머지 후 새 규칙 PR 재개
- 감축 PR 은 **PATCH** 릴리스 (행동 변화 없는 문서 리팩토링 — 본문은 포인터 1줄로, 상세는 `docs/lessons/*` 등으로 이동)

### 5.4 가지치기 대상 선정 질문
1. 이 블록을 읽지 않아도 현재 에이전트 행동이 올바른가? (→ 참조층으로)
2. 이 블록의 근거 이슈가 마지막 참조된 지 6개월 이상인가? (→ 추출 후보)
3. 이 블록의 매트릭스/JSON 이 5줄 이상인가? (→ 추출 기준 2.1 재적용)

---

## 6. 예외 ADR 박제 (CODEOWNERS 대체안, Gemini 제안 6)

1인 개발자 환경에서 CODEOWNERS 승인 장치는 비현실. 대신 **ADR 박제** 로 프로세스 비용 + 영구성을 확보한다.

### 6.1 언제 예외 ADR 을 쓰는가
- 신규 블록이 추출 기준 중 하나 이상을 초과하나, 세션 각인 없이는 **즉각적인 잘못된 행동**을 유발
- 예: "체크리스트 5행" 이라 추출 대상이나, 체크리스트 자체가 CRITICAL 판정에 쓰여 docs/ 로 가면 어텐션 미도달

### 6.2 ADR 템플릿
파일명: `docs/decisions/<YYYYMMDD>-claudemd-exception-<topic>.md`

```markdown
---
title: CLAUDE.md 각인 예외 박제 — <topic>
date: <YYYY-MM-DD>
status: accepted
---

## 배경
- 대상 블록: CLAUDE.md `### <섹션>`
- 추출 기준 위반: 매트릭스 N 행 / 코드 N 라인 / 프로토콜 N 스텝 중 <해당>
- 현재 CLAUDE.md size: <X>k chars

## 대체 불가 근거
- 각인 없이는 어떤 잘못된 행동이 발생하는가 (구체 시나리오)
- `docs/` 포인터 1줄로 대체했을 때 실패한 실측 또는 예상 경로

## 결정
- 본 블록을 CLAUDE.md 에 인라인 유지
- 대신 <어떤 대체 조치> 로 비대화 영향을 상쇄 (예: 다른 블록 1개 추출)

## 재검토 조건
- <YYYY-MM-DD> 시점 재평가 (최대 6개월)
- 또는 CLAUDE.md size 가 <X>k chars 초과 시 즉시 재평가
- 재평가 트리거: <조건>
```

### 6.3 금지
- 예외 ADR 없이 "사유 주석만 달고 넘어가기" 금지
- 재검토 조건 없는 ADR 금지 (`status: accepted` 는 반드시 재검토 일자 동반)

---

## 7. SSoT 결합 박제 (Gemini 제안 5 격상)

CLAUDE.md 본문 감축 시 **에이전트/스크립트 참조 결합**이 깨질 수 있다. 감축 PR 체크리스트로 구조화.

### 7.1 현재 확인된 결합
- `.claude/agents/*.md` (5개 파일) — 공통 JSON 스키마 SSoT 9개 필드 포함
- `scripts/verify-agent-ssot.sh` 주석 — "SSoT 선언 위치: CLAUDE.md `### sub-agent 검증 완료...`" 참조
- 일부 에이전트 파일이 CLAUDE.md 특정 섹션 앵커를 링크로 참조할 가능성

### 7.2 감축 PR 사전 조사 (리서치 phase)
감축 대상 블록을 선정하기 **전에** 참조 depth 전수 조사:

```bash
# CLAUDE.md 섹션 앵커를 참조하는 파일 전수 검색
# 예: "### sub-agent 검증 완료" 를 추출 대상으로 삼을 때
grep -rn "sub-agent 검증 완료" .claude/ scripts/ docs/
```

### 7.3 감축 PR 체크리스트
감축 실행 PR (Phase 3 예정) 에 포함:

- [ ] `.claude/agents/*.md` 의 CLAUDE.md 섹션 앵커 링크 업데이트 (추출 후 `docs/` 경로로)
- [ ] `scripts/verify-agent-ssot.sh` 주석의 "SSoT 선언 위치" 업데이트
- [ ] `scripts/verify-docs-links.sh` 통과 (신규 링크 유효성)
- [ ] `bash scripts/verify-agent-ssot.sh` 통과 (JSON 필드 SSoT drift 없음)
- [ ] 영향받는 에이전트 sub-agent 호출 스모크 테스트 (최소 1회)

### 7.4 리서치 phase 분리
감축 PR 은 **"조사 → 설계 → 이동 → 참조 업데이트"** 순으로 직렬 처리. 병렬 금지 (Gemini 검증 결과 "결합 관계 간과" 편향 방어).

---

## 8. 릴리스 분류

| PR 유형 | 릴리스 | 근거 |
|---|---|---|
| 지침 신설 (본 PR) | **MINOR** | 새 블록 추가 시 `docs/` 로 기본 이동 + 예외 ADR 절차 — 에이전트 행동 변화 |
| 강제 메커니즘 (verify 스크립트, doctor 항목) | **MINOR** | 신규 CI 단계 — 에이전트 행동 변화 |
| 감축 실행 (기존 블록 추출) | **PATCH** | 본문 → docs/ 이동은 문서 리팩토링. 행동 변화 없음 |

### 8.1 판정 질문 (Gemini 의 "행동 변화 vs 문서 변경" 재적용)
이 변경으로 에이전트가 같은 입력에 다르게 동작하는가?
- 예 (예: "새 블록 추가 시 docs/ 로") → MINOR
- 아니오 (예: 기존 블록 위치 이동) → PATCH

---

## 9. 재검토 조건

- CLAUDE.md size 가 재축적되어 45k 재접근 시: 본 가이드 + 정량 게이트 재평가
- Claude Code 내부 CLAUDE.md 경고 임계가 바뀌면 정량 게이트 동기화
- 본 가이드 자체가 500 lines 초과 시: 섹션 분할 검토 (`claudemd-governance-<sub>.md`)

---

## 관련 문서·이슈

- 본 가이드 근거: harness [#197](https://github.com/coseo12/harness-setting/issues/197)
- 교차검증 outcome: `.claude/logs/cross-validate-architecture-20260421-152941-outcome.json`
- 연관 SSoT 검증: `scripts/verify-agent-ssot.sh`
- 모노레포 가드 / 문서 동기화: `CLAUDE.md` `## 원칙 > ### 문서 동기화`
