# 인계 항목 실측 재검증 — NO-OP ADR 패턴

> CLAUDE.md `### 인계 항목 실측 재검증 — NO-OP ADR 패턴` 가지치기 위임 (이슈 #266 / PR #290). **근거**: volt [#14](https://github.com/coseo12/volt/issues/14) / [#67](https://github.com/coseo12/volt/issues/67).

이전 마일스톤 회고가 인계한 "수정 필요 항목" 이 환경/코드 변화로 **착수 시점엔 이미 해소** 되어 있는 경우가 있다. AI는 인계 항목을 "해야 할 일" 로 과신하는 편향이 있으므로 구현 직전 실측으로 전제를 재검증한다.

## 절차

- 작업 착수 전 현재 동작을 실측 (브라우저/bench/테스트)
- 이미 만족하면 구현 대신 **NO-OP ADR** 작성: `docs/decisions/<YYYYMMDD>-<topic>-no-op.md`
- NO-OP 결정도 후보 비교 / 실측 결과 / 재검토 조건을 남긴다 — 다음에 재발굴 시 빠르게 기각 근거
- 대신 **회귀 가드** 를 박제: 현재 동작이 퇴행하지 않도록 verify 스크립트 또는 테스트 추가

## 조사 국면 확장 — Explore 미결정 시 debug 스크립트 실측 선행 (volt [#67](https://github.com/coseo12/volt/issues/67))

아키텍처 근간 drift 조사에서 정적 분석 (Explore 에이전트, 코드 리뷰) 이 `(C) 미결정` 을 반환하면, 20~30줄 일회성 debug 스크립트 (`scripts/_debug-<topic>-tmp.mjs` — 실행 직후 `rm`) 로 runtime 실측 선행. 정적 분석은 주석·타입 시그니처·표현 일관성까지만 본다 — runtime 조건 분기 omission 버그는 grep 으로 잡히지 않으며 실측이 유일한 확정 경로. "정적 분석 확신 없음 → 수 시간 추가 정적 조사" 대신 "30초 실측" 이 평균 비용 최소. volt #49 (주석 계약 vs 구현 drift) / #60 (다운스트림 실측) 계보의 조사 국면 버전.

## 관련

- CRITICAL #2 "모호한 지시 사전 확인" 과 상호보완 (명확한 지시를 받았어도 실측으로 범위 축소)
- volt [#14](https://github.com/coseo12/volt/issues/14) (원안 — NO-OP ADR 패턴)
- volt [#67](https://github.com/coseo12/volt/issues/67) (조사 국면 확장)
- volt [#49](https://github.com/coseo12/volt/issues/49) (주석 계약 drift — 정적 분석 한계)
- volt [#60](https://github.com/coseo12/volt/issues/60) (다운스트림 실측)
