# 에이전트 팀 가이드

`harness-setting`는 1 사용자 + AI팀 모델로 동작한다. 여러 페르소나(에이전트)가 GitHub 이슈/PR을 핸드오프 매체로 협업하고, 사용자는 의뢰주이자 최종 검토자다.

## 설계 원칙

1. **이슈가 SSoT** — 작업 상태는 GitHub 이슈/PR 라벨로 관리. 별도 `.harness/state.json` 같은 무거운 상태는 두지 않는다.
2. **sub-agent 격리** — 페르소나마다 독립 컨텍스트로 호출. 같은 Claude가 모자만 바꾸는 게 아니라, 진짜 별개 컨텍스트로 분리해 편향을 줄인다.
3. **머지는 항상 사용자** — 어떤 페르소나도 머지 권한을 갖지 않는다 (CRITICAL #1).
4. **검토 병목 = 사용자 대역폭** — 정책으로 자동/수동을 토글하되, 위험 작업은 강제 사용자 확인.

## 페르소나 5종 + thin orchestrator

| 명령 | 페르소나 | 입력 | 출력 |
|---|---|---|---|
| `/pm` | 적응적 질답 → 스프린트 계약 | 사용자 요구 (모호 가능) | 이슈 본문 = 완료 기준 목록 |
| `/architect` | 설계 결정 + ADR | 이슈 + 코드베이스 | 이슈 코멘트 + `docs/decisions/*.md` |
| `/dev` *(developer.md 기존)* | 구현 | 이슈 + architect 산출 | feature 브랜치 + PR |
| `/review` | 정적 리뷰 (5축) | PR diff + 이슈 | PR 코멘트 + 라벨 전이 |
| `/qa` | 동적 검증 (3단계) | PR + 이슈 | PR 코멘트(증거 포함) + 라벨 전이 |
| `/next` | thin orchestrator | 이슈 라벨 | 정책에 따라 다음 페르소나 추천/호출 |
| `/team-status` | 대시보드 | 저장소 이슈/PR | 페르소나별 작업 큐 + 이상 상태 + 권장 액션 |
| `/capture-merge` | 자동 캡처 초안 | 머지된 PR | volt 이슈 초안 (사용자 검토 후 승인) |

## 라벨 전이 모델

```
[issue 생성]
   ↓ /pm
stage:planning
   ↓ pm 산출 후
stage:design
   ↓ /architect
stage:dev
   ↓ /dev (PR 생성 시 PR로 라벨 이동)
stage:review
   ↓ /review (5축 통과)
stage:qa
   ↓ /qa (3단계 통과)
stage:done
   ↓ 사용자 머지
[done]
```

되돌림: 어느 단계에서든 차단 시 → `stage:dev` 로 되돌리고 사유 코멘트.

## 라벨 생성

```bash
bash scripts/setup-stage-labels.sh           # 현재 저장소
bash scripts/setup-stage-labels.sh owner/repo  # 명시 저장소
```

## 정책 (`.harness/policy.json`)

```json
{
  "default": "manual",
  "personas": {
    "pm": "manual",
    "architect": "manual",
    "developer": "manual",
    "reviewer": "auto",
    "qa": "manual"
  },
  "force_review_on": ["architect-decision", "qa-fail", "security-flag"]
}
```

- `auto` — 사용자 확인 없이 sub-agent 자동 실행
- `manual` — 호출 전 사용자 확인 (기본)
- `force_review_on` — 정책 무관 강제 사용자 확인 트리거 (예: ADR 변경 포함 PR, qa 실패 직후)

`init` 시 기본값 자동 생성. 사용자가 자유롭게 토글 가능.

## sub-agent 격리의 실무 함의

- `Agent` tool로 페르소나별 sub-agent 호출 (예: `subagent_type: reviewer`).
- 페르소나 간 정보 전달은 **이슈 본문/코멘트 + git 산출물**로만. 컨텍스트 직접 공유 금지.
- 메인 컨텍스트(현재 사용자 대화)에서 페르소나 역할을 *흉내*내지 않는다 — 격리의 가치가 사라짐.

## 단계적 도입 (Phase)

- **Phase 1** — `/review`, `/qa` + 라벨 + 정책 인프라 ✓
- **Phase 2** — `/architect` + ADR 통합 ✓
- **Phase 3 (현재)** — `/pm` (적응적 질답, 명확도 점수) + `/next` (thin orchestrator, 라벨→다음 페르소나)
- **후속** — doctor 라벨 무결성 점검 강화, 페르소나별 산출물 대시보드

## 한계 / 알려진 위험

- **검토 병목**: 사용자가 페르소나 산출을 못 따라가면 누적. 정책으로 자동화하되 위험 작업은 강제 검토.
- **환각된 협업**: A 페르소나가 B의 산출을 가짜로 참조할 위험. 핸드오프는 **항상 git 산출물(이슈/PR/파일)** 로 — 메모리 인용 금지.
- **상태 표류**: 라벨 누락/잘못된 전이 → `/next` 가 막힘. 라벨 무결성을 doctor가 점검 (Phase 3 추가 예정).
