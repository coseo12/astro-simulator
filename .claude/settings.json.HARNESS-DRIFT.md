<!-- HARNESS-DRIFT: Z-PATTERN [TODO] -->

# `.claude/settings.json` 프로젝트 divergent 변경 (sidecar)

`.claude/settings.json` 은 harness-managed atomic 파일이라 JSON 인라인 주석이 불가하므로,
Z-패턴 데코레이터를 본 sidecar 로 대신 박제한다 (ADR 20260515 §Amendment 8/11).

## 변경 요지

- **SessionStart hooks 배열에 3번째 command hook 추가**:
  `bash .claude/hooks/session-start-dead-wait-check.sh`
  - 기존: (1) critical_rules printf, (2) session-start-zombie-check.sh (가드 C)
  - 추가: (3) session-start-dead-wait-check.sh (가드 D — dead-wait 검출)
- 세션 재시작 시 `.context/pending-waits.json` 의 미해소 대기(grace 60s 초과)를 stdout 경고로 노출 (exit 0, 블록 안 함).

## 근거

- 본 프로젝트 이슈: [#817](https://github.com/coseo12/astro-simulator/issues/817)
- 설계 SSoT: `docs/decisions/20260710-817-dead-wait-guard.md` §결정 A (A1 별도 훅 + settings.json 등록)
- 선례: 가드 C (`session-start-zombie-check.sh`) — 동형 SessionStart hook

## Z-패턴 Phase

- **Phase 1 (본 프로젝트 선반영)**: 완료 — 본 sidecar + settings.json 등록 1줄.
- **Phase 2 (upstream 기여)**: coseo12/harness-setting 에 "SessionStart dead-wait check 훅 + 규약" clean 추가 PR 제출 (cross-link 예정).
- **Phase 3 (동기화)**: upstream 머지 후 `harness update --apply-all-safe` 로 자동 동기화 시 `[TODO]` → upstream PR URL 자동 교체, 필요 시 sidecar 정리.
