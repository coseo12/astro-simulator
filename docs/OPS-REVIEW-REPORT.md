# Harness Engineering Framework 운영 검토 레포트

> **작성일**: 2026-03-26
> **검증 방법**: 코드 전수 분석 + Gemini 교차검증 + 예제 앱(To-Do) 실전 파이프라인 경험
> **범위**: 에이전트 14개, 스킬 15개, 스크립트 9개, CI/CD 2개, 문서 전체

---

## 1. 운영 성숙도 평가

**현재 수준: 2단계 (Managed) / 5단계 중**

| 단계 | 설명 | 달성 여부 |
|------|------|----------|
| 1. Initial (PoC) | 기본 개념 구현 | 달성 |
| **2. Managed** | **특정 프로젝트로 검증, 사후 개선** | **현재** |
| 3. Defined | 프로세스 표준화, 문서 완비 | 미달 |
| 4. Quantitative | 정량적 측정, 예측 가능 | 미달 |
| 5. Optimizing | 자동 최적화, 자가 치유 | 미달 |

**근거**: To-Do 앱으로 전체 파이프라인을 완주했고, 10건의 구조적 문제를 발견/수정했다. 하지만 에러 복구가 반응적(reactive)이고, 정량적 측정이 없으며, 셸 스크립트 오케스트레이터가 확장성 병목.

---

## 2. 즉시 수정 사항 (P1) — 파이프라인 동작에 영향

### 2-1. orchestrator.sh: 라벨 선제 전이 → 에이전트 성공 후 전이로 변경

**문제**: `auto_dispatch()`가 에이전트 실행 **전에** 라벨을 전이함. Integrator 디스패치 전에 `status:done`으로 변경되어, Integrator 실패 시 복구 불가.

```bash
# 현재 (잘못됨)
gh pr edit "${pr_num}" --remove-label "status:qa-passed" --add-label "status:done"
dispatch-agent.sh integrator "${pr_num}" &  # 실패해도 done 상태

# 수정 방향: 에이전트 완료 후 라벨 전이
```

**영향 범위**: `status:review→reviewing`, `status:qa→testing`, `status:qa-passed→done` 3곳

### 2-2. run_pipeline()에 Integrator 단계 누락

**문제**: `orchestrator.sh pipeline <이슈>` 수동 실행 시 Integrator가 포함되지 않음. CLAUDE.md 정의(`QA → Integrator → Merge`)와 불일치.

### 2-3. run_full_pipeline()에 Planner 단계 누락

**문제**: CLAUDE.md는 `Planner → PM → ...`이나, `full` 명령은 PM부터 시작.

### 2-4. run_full_pipeline()의 하위 이슈 범위 과다

**문제**: `gh issue list --label "status:todo"`로 **모든** todo 이슈를 수집. PM이 생성한 이슈만이 아니라 기존 이슈까지 파이프라인에 투입됨.

### 2-5. reviewer.md 트리거 라벨 불일치

**문제**: Reviewer 에이전트 문서가 `status:review`를 트리거로 명시하나, 실제로는 `status:audit-passed` 후에 디스패치됨.

### 2-6. validate-setup.sh 에이전트 4개 누락

**문제**: `planner`, `frontend-developer`, `backend-developer`, `integrator`가 온보딩 체크에 빠져있음.

---

## 3. 단기 수정 사항 (P2) — 정합성/문서

### 3-1. CLAUDE.md 라벨 목록 불완전

**누락**: `status:qa-passed`, `status:blocked`, `status:reviewing`, `status:testing`, `needs:re-review`, `size:s/m/l/xl`

### 3-2. docs/skills-guide.md 스킬 4개 누락

**누락**: `browser-test`, `playwright-test`, `frontend-design`, `resolve-conflict`

### 3-3. README.md 스킬 수 오기재

14개 → 실제 15개

### 3-4. Developer 에이전트에 fix-error, resolve-conflict 스킬 미참조

`developer.md`, `frontend-developer.md`, `backend-developer.md` 모두 이 두 스킬을 "사용 스킬"에 포함하지 않음. 스킬이 orphan 상태.

### 3-5. dispatch-agent.sh의 PR 에이전트 컨텍스트 조회 오류

Auditor/Reviewer/QA는 PR 번호를 받지만 `gh issue view`로 조회. `gh pr view`로 분기 필요.

### 3-6. pr-review.yml의 이슈 연결 키워드 불완전

`Closes #N`만 인식. `Fixes #N`, `Resolves #N` 미인식.

### 3-7. ci.yml이 실제 테스트를 실행하지 않음

모든 언어 감지 단계가 `echo "감지됨"`으로만 구성. 실질적 품질 게이트 없음.

### 3-8. 15개 스킬 중 evals 폴더가 0개

`create-skill` 스킬이 "평가 셋 없이 스킬을 완성하지 않는다"를 원칙으로 명시하나, 프레임워크 자체 스킬에는 미적용.

---

## 4. 중장기 개선 사항 (P3) — 아키텍처

### 4-1. 폴링 → 웹훅 기반 이벤트 드리븐 아키텍처 전환 (가장 중요)

**현재**: 60초 폴링으로 GitHub API 반복 호출
**문제**: 확장성 한계, API Rate Limiting, 지연(최대 60초), 단일 장애점
**방향**: GitHub Actions의 `issues.labeled`, `pull_request.labeled` 이벤트를 트리거로 활용. 라벨 변경 시 즉시 다음 에이전트를 실행.

```yaml
# 예시: .github/workflows/agent-dispatch.yml
on:
  issues:
    types: [labeled]
jobs:
  dispatch:
    if: startsWith(github.event.label.name, 'status:')
    # 라벨에 따라 적절한 에이전트 디스패치
```

### 4-2. 에러 복구 체계 구축

| 시나리오 | 현재 | 개선 |
|---------|------|------|
| 에이전트 3회 실패 | `status:blocked` + 코멘트 | `status:agent-failed` + Slack 알림 + DLQ 격리 |
| 교착 상태 | 감지 불가 | 상태별 최대 체류 시간 → `status:stalled` 알림 |
| 데이터 손상 | 수동 발견 | JSON Schema 검증 + 자동 롤백 |

### 4-3. 관측 가능성 (Observability) 3요소

| 요소 | 현재 | 개선 |
|------|------|------|
| **로깅** | `.harness/logs/` 파일 | Correlation ID(이슈 번호) + 중앙 로깅 (Grafana Loki) |
| **메트릭** | 없음 | 에이전트별 실행시간, 성공률, API 토큰 사용량 |
| **추적** | 없음 | OpenTelemetry로 이슈→PR→머지 전체 흐름 시각화 |

### 4-4. 보안 강화

| 영역 | 현재 | 개선 |
|------|------|------|
| 에이전트 권한 | 단일 PAT 공유 추정 | GitHub App → 에이전트별 최소 권한 |
| 시크릿 관리 | 환경변수 | Vault / GitHub Actions Secrets |
| 공급망 보안 | gitleaks 포함 | SAST + 의존성 검사(npm audit) 의무화 |
| 실행 격리 | 없음 | 컨테이너 샌드박스 |

### 4-5. 비용 최적화

| 항목 | 현재 | 개선 |
|------|------|------|
| AI API | 모든 작업에 동일 모델 | 작업별 모델 분기 (복잡=Opus, 단순=Haiku) |
| GitHub API | 60초 폴링 | 웹훅 전환 시 호출 0건 |
| 캐싱 | 없음 | 동일 입력 LLM 응답 캐시 |

### 4-6. lock-file.sh 원자적 락 구현

현재 TOCTOU 경쟁 상태. `set -C`(noclobber) 패턴으로 원자적 쓰기 필요.

---

## 5. 업계 비교 분석 (Gemini 합의)

| 특성 | Harness Framework | GitHub Copilot Workspace | Devin/SWE-Agent |
|------|-------------------|------------------------|-----------------|
| 모델 | **가상 팀 시뮬레이션** | 인간 주도 협업 | 단일 목적 에이전트 |
| 강점 | 완전 커스텀 가능, 역할 분리 | IDE 통합, 안정성 | 단일 태스크 정밀도 |
| 약점 | 오케스트레이션 복잡성, 불안정 | 커스텀 어려움 | 복잡 워크플로우 미지원 |
| 차별점 | 14개 전문 에이전트 협업 | GitHub 생태계 활용 | 자율 코딩 |

**Harness의 고유 가치**: 단일 에이전트가 아닌 "팀 단위 자동화"를 구현한다는 점. PM이 이슈를 분해하고, Architect가 설계하고, Developer가 구현하는 **조직적 프로세스 자동화**는 현재 업계에서 희소한 접근.

---

## 6. 로드맵 제안

### 단기 (1-2주)

- [ ] P1 수정 6건 적용
- [ ] P2 정합성 수정 8건 적용
- [ ] `status:agent-failed`, `status:stalled` 라벨 + Slack 알림 워크플로우

### 중기 (1-2개월)

- [ ] 오케스트레이터 웹훅 기반 전환 (GitHub Actions `issues.labeled` 트리거)
- [ ] 핵심 스킬 3개(`sync-status`, `create-issue`, `review-pr`) evals 작성
- [ ] GitHub App으로 에이전트별 권한 분리
- [ ] 중앙 로깅 + Correlation ID 도입

### 장기 (6개월)

- [ ] 워크플로우 엔진 도입 (Temporal / Argo Workflows)
- [ ] OpenTelemetry 분산 추적
- [ ] 에이전트/스킬 SDK + 템플릿
- [ ] 컨테이너 샌드박스 실행 환경

---

## 7. 가장 위험한 미수정 문제 Top 3 (Claude + Gemini 합의)

| 순위 | 문제 | 위험도 | 이유 |
|------|------|--------|------|
| **1** | **폴링 기반 오케스트레이터** | 치명적 | 확장성·비용·안정성 전반의 병목. 단일 장애점 |
| **2** | **에러 복구/관측 불가** | 높음 | 에이전트 조용한 실패, 교착 상태 감지 불가. 운영 신뢰도 0 |
| **3** | **라벨 선제 전이** | 높음 | 에이전트 실패 시 상태가 이미 "완료"로 표시. 데이터 무결성 위반 |

---

## 8. 총평

이 프레임워크는 **"AI 에이전트 가상 팀"** 이라는 혁신적 개념을 구현한 의미 있는 결과물이다.
예제 앱 실행을 통해 10건의 구조적 문제를 발견·수정하고, SSR hydration 이슈까지 대응하며,
Playwright 폴백 전략으로 브라우저 테스트 한계를 보완한 것은 실전 검증의 가치가 높다.

**3단계(Defined)로 가기 위한 핵심 전환점**:
1. 폴링 → 웹훅 전환 (아키텍처)
2. 라벨 선제 전이 → 성공 후 전이 (데이터 무결성)
3. 에러 알림 + 관측 가능성 (운영 신뢰도)

이 세 가지를 해결하면 "잘 만든 프로토타입"에서 "팀이 신뢰하고 의존할 수 있는 플랫폼"으로 전환된다.
