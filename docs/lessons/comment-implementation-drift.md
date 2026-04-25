# 주석 계약 vs 구현 drift — 버그 생성원

> **요지**: CLAUDE.md 실전 교훈의 주석-구현 drift 블록 상세. 본문 요약은 CLAUDE.md `## 실전 교훈` 의 포인터 참조.
>
> **근거**: harness [#199](https://github.com/coseo12/harness-setting/issues/199) Phase 3-A 에서 추출.

---

## 개요

파일 상단 주석 / JSDoc / 문서 블록이 선언한 **계약** (예: "X 카테고리는 Y 규칙 포함") 이 구현에 반영되지 않은 상태 — 주석-구현 drift — 는 **버그 생성원**. 주석만 있고 구현이 누락되면 드리프트 시 조용히 bug 가 생성되며, default fallback 이 존재하는 분기 함수에서 특히 위험 (누락을 fallback 이 흡수해서 테스트조차 fail 하지 않음).

## 예방 규약

- **주석에 선언된 규칙 / 계약 / 불변식은 테스트 커버리지 대상** — 주석으로 명시한 동작은 자동 검증되어야 한다. 주석에 나열된 항목을 함수 시그니처/분기와 대조 (누락 발견 시 "주석이 틀렸는가, 구현이 틀렸는가" 판정 후 일치)
- **카테고리 / enum 류 분기 함수 특히 주의** — `return 'atomic'` 같은 default fallback 은 누락을 조용히 흡수. fallback 에 `console.warn` 또는 테스트에서 **예상 카테고리 assert** 로 드리프트 감지
- **리팩토링 vs 버그 수정의 경계** — 주석 계약에 구현을 맞추는 것은 엄밀히는 **버그 수정** (주석이 이미 계약). 그러나 downstream 영향(tracked 파일 세트 변화 등)이 있으면 릴리스 분류는 **MINOR** (행동 변화). CLAUDE.md 릴리스 규약의 "행동 변화 vs 문서 변경 판정 질문" 대조

## 발견 진단 루트

테스트 실패 stderr / 영향받은 객체 특정 → 분기 결과 확인 (`console.log(categorize(...))`) → 주석 계약 대조 → 누락 규칙 1 라인 추가 (run-tests 스킬 "Flaky 진단 루트" 6단계 참조).

## 근거

- volt [#49](https://github.com/coseo12/volt/issues/49) — harness v2.25.0 [#157](https://github.com/coseo12/harness-setting/issues/157). `lib/categorize.js` 상단 주석이 "user-only: state, **logs**, 사용자 추가 파일" 을 선언했지만 `.claude/logs/` 규칙이 구현에서 누락되어 `atomic` 으로 fallback. 338개 세션 로그가 copy 대상이 되어 post-apply 검증 해시 race 로 병렬 테스트 75% flaky. 1 라인 추가 (`if (p.startsWith('.claude/logs/')) return 'user-only';`) 로 근본 해소 + 병렬 8회 연속 통과 실측
