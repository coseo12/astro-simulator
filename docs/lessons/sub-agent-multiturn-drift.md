# sub-agent multi-turn 라운드 이탈 — 매트릭스 일관성 검증

> **요지**: CLAUDE.md 실전 교훈의 sub-agent multi-turn 매트릭스 이탈 블록 상세. 본문 요약은 CLAUDE.md `## 실전 교훈` 의 포인터 참조.
>
> **근거**: harness [#199](https://github.com/coseo12/harness-setting/issues/199) Phase 3-A 에서 추출.

---

## 개요

sub-agent 에 적응적 질답·설계 같은 multi-turn 세션을 위임할 때, SendMessage 로 라운드를 이어가도 전 라운드의 세부 매트릭스(Phase 제목 / DoD 수치 / 의존 관계)가 다음 라운드에서 **이탈**하는 사례가 관찰된다. "권고안 A" 같은 참조 레이블만으로는 세부 컨텍스트 복원이 보장되지 않는다 — sub-agent 는 세션 목적만 유지하고 매트릭스 세부는 잃을 수 있다.

## 예방 규약

- 메인 오케스트레이터는 라운드 N 출력에서 **핵심 키워드 목록**(매트릭스 행 제목, 수치 DoD, 사용자 답변 Q/A 쌍)을 추출하고, 라운드 N+1 출력과 대조해 이탈을 즉시 감지한다
- SendMessage 로 라운드를 이어갈 때 **이전 라운드 매트릭스를 본문에 인라인 재첨부**한다 — 참조 레이블("권고 A")만으론 부족. 요약 2~3줄로라도 원문 재첨부
- 이탈 발견 시 라운드 N+1 결과를 폐기하고 **사용자에게 불일치 보고 + 이전 라운드 재확인**. 이탈 산출물은 손실로 간주하지 말고 후속 확장(예: P17+ 후보) 로 별도 메모리에 박제해 보너스 자산화

## 근거

- volt [#34](https://github.com/coseo12/volt/issues/34) — astro-simulator P8~P16 로드맵 설계 3라운드 중 라운드 3 에서 권고 A(내행성계 위성 / 목성계 / 토성계) 매트릭스가 J2/Yarkovsky/중력파 등 전혀 다른 주제로 이탈. volt [#24](https://github.com/coseo12/volt/issues/24) 의 "sub-agent 신뢰 한계" 계열 확장
