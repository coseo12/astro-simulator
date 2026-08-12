/**
 * upstream-only-allowlist.mjs
 *
 * upstream `harness-setting` 유래 문서가 **이 저장소에 미배포된 upstream 전용 파일** 을
 * 참조하는 건의 allowlist. 부작용 없는 순수 데이터 모듈이다 (import 시 아무것도 실행하지 않음).
 *
 * **왜 별도 모듈인가 (#1005).** 종전에는 `scripts/verify-docs-links.mjs` 안의 const 였는데,
 * `scripts/verify-adr-index.mjs` 가 같은 목록을 **제외 판정의 교차 근거**로 써야 한다
 * (인덱스 표의 upstream-only 행 제외 판정 = 로컬 파일 부재 ⟺ `(upstream-only)` 표기 ⟺
 * 본 allowlist 등록, 3원 일치). 두 가드가 각자 목록을 들면 그 자체가 새 drift 원이므로
 * 목록을 1곳으로 끌어내고 양쪽이 import 한다 — 사본을 만들지 않는 것이 "drift 감지" 보다
 * 근본이다 (volt [#120](https://github.com/coseo12/volt/issues/120) / CLAUDE.md §drift 근본 제거).
 *
 * 조용한 skip 이 아님: `verify-docs-links.mjs` 는 등록 건수 + 발동 건수를 매 실행 stdout 에
 * 보고하고, 발동 0건 항목을 stale 제거 후보로 warn 한다.
 *
 * source: 참조가 위치한 문서 (repo-relative) / target: 링크 원문 (참조 표기 그대로)
 *
 * 검증 완결성 계약: (source, target) 쌍이 실제로 발동하지 않으면 (참조가 사라지면)
 * stale 항목이므로 주기 점검 대상 — 발동 0건 항목은 제거 후보로 보고된다.
 *
 * 관련: #842 (원 도입) / #907 (디커플 — 신규 등록 원칙적 없음) / #1005 (모듈 분리)
 */

export const UPSTREAM_ONLY_ALLOWLIST = [
  // upstream ADR: gitflow 브랜치 전략 (harness-setting docs/decisions/)
  { source: 'docs/decisions/README.md', target: '20260419-gitflow-main-develop.md' },
  { source: 'docs/decisions/README.md', target: '20260419-release-merge-strategy.md' },
  { source: 'docs/decisions/README.md', target: '20260420-jq-based-parsing-no-op.md' },
  { source: 'docs/deployment-patterns.md', target: 'decisions/20260419-gitflow-main-develop.md' },
  { source: 'docs/deployment-patterns.md', target: 'decisions/20260419-release-merge-strategy.md' },
  {
    source: 'docs/guides/branch-strategy-workflow.md',
    target: '../decisions/20260419-gitflow-main-develop.md',
  },
  {
    source: 'docs/guides/branch-strategy-workflow.md',
    target: '../decisions/20260419-release-merge-strategy.md',
  },
  {
    source: 'docs/guides/release-process.md',
    target: '../decisions/20260419-release-merge-strategy.md',
  },
  // (#962: CLAUDE.md 의 두 gitflow ADR 링크는 A1/A2 가지치기로 제거됨 → 발동 0건 stale 방지를 위해
  //  source: 'CLAUDE.md' entry 2건 삭제. 다른 source 의 동일 target entry 4건은 계속 발동하므로 유지)
  // upstream ADR: jq 파싱 / antigravity 마이그레이션
  // (#907: 삭제된 문서를 source 로 갖던 dead entry 는 제거 — "발동 0건 항목은 제거 후보" 계약)
  {
    source: 'docs/guides/cross-validate-protocol.md',
    target: '../decisions/20260420-jq-based-parsing-no-op.md',
  },
  {
    source: 'docs/guides/cross-validate-protocol.md',
    target: '../decisions/20260521-gemini-to-antigravity.md',
  },
  // (#975: `lib/claudemd-size-constants.js` entry 1건 삭제. `lib/` 는 upstream-only 가 아니라
  //  #907 디커플 이후 **어디에도 없는** 경로였다 — allowlist 가 upstream-only 예외가 아니라
  //  진짜 dead link 를 억제하고 있었다. 임계값 SSoT 를 실재하는 scripts/verify-claudemd-size.mjs
  //  로 repoint 한 뒤 entry 제거 → 동일 링크 재유입 시 이제 FAIL 로 차단된다)
];

/** 인덱스 표 upstream-only 행의 제외 근거 대조용 — source 가 ADR 인덱스 README 인 항목만 */
export const ADR_INDEX_UPSTREAM_ONLY_TARGETS = UPSTREAM_ONLY_ALLOWLIST.filter(
  (e) => e.source === 'docs/decisions/README.md',
).map((e) => e.target);
