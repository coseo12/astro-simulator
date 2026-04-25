# 신규 데이터 ≠ 신규 코드 — ADR 예측 재현

> **요지**: CLAUDE.md 실전 교훈의 ADR Concrete Prediction 박제 블록 상세. 본문 요약은 CLAUDE.md `## 실전 교훈` 의 포인터 참조.
>
> **근거**: harness [#199](https://github.com/coseo12/harness-setting/issues/199) Phase 3-A 에서 추출.

---

## 개요

레이어/플러그인/스키마 구조 하에서 기능 확장이 "데이터만 추가, 코드 변경 0" 으로 가능한지 ADR 에 **Concrete Prediction** 으로 박제하면, 구현 시 추상화 건강성을 실증할 수 있다. "신규 함수 ≠ 신규 구현" 의 데이터 버전.

## 박제 형식

ADR 작성 시 예측 박제 형식:

```
{신규 엔티티/라우트/핸들러} 추가로 {핵심 모듈 경로} 의 코드 라인 변화 **0**
```

## 실측 재현 절차

- 실구현 PR 에서 `git diff --stat <추상화 계층 경로>` 로 재현 확인 — 예측 성공 시 기존 추상화가 올바르게 설계됐다는 **구체 증거**
- 예측 실패(= 계층 수정 필요) 시 두 갈래:
  1. 추상화가 부족하다는 신호 → 먼저 리팩토링 후 ADR 구현 재개
  2. 예외 케이스 인정 → ADR Amendment 박제

## 적용 시나리오

parentId 체인 / 플러그인 레지스트리 / 라우팅 테이블 / 스키마-주도 UI (form builder, dashboard) / i18n 번역 테이블 — **데이터로 확장하는 계층적 구조** 전반. 새 모듈/레이어를 만드는 결정에는 적용 불가 (확장이 이미 데이터로 흡수 가능한 상태가 전제).

## 근거

- volt [#47](https://github.com/coseo12/volt/issues/47) — astro-simulator P8 ADR `20260419-satellite-orbit-hybrid.md` 에 "포보스/데이모스 JSON 추가 → sim-canvas 코드 변경 0 줄" 예측 박제. PR-3 (#252) 에서 실측 재현 성공 — parentId 3계층 (scene graph / sidebar / camera) 이 모두 데이터로만 참조됨을 실증

## 관련

- 스킬 절차: [.claude/skills/record-adr/SKILL.md](../../.claude/skills/record-adr/SKILL.md) "Concrete Prediction" 섹션 — ADR `## 결과·재검토 조건` 에 박제하는 포맷 템플릿
