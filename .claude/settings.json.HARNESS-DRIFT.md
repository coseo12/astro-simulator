<!-- HARNESS-DRIFT: Z-PATTERN [https://github.com/coseo12/harness-setting/issues/319] -->

# `.claude/settings.json` 프로젝트 divergent 변경 (sidecar)

`.claude/settings.json` 은 harness-managed atomic 파일이라 JSON 인라인 주석이 불가하므로,
Z-패턴 데코레이터를 본 sidecar 로 대신 박제한다 (ADR 20260515 §Amendment 8/11).

## 변경 요지 (v4.4.0 기준 잔존 delta)

- **SessionStart hooks 배열에 zombie-check hook 등록** (2번째):
  `bash .claude/hooks/session-start-zombie-check.sh`
  - upstream v4.4.0 은 hook 파일 (`session-start-zombie-check.sh`) 은 배포하면서
    settings.json 에는 **등록하지 않는다** — 다운스트림은 가드 C (#440) 로 등록 유지
  - upstream 등록 순서: (1) critical_rules printf, (2) dead-wait-check
  - 다운스트림 등록 순서: (1) critical_rules printf, (2) **zombie-check (본 delta)**, (3) dead-wait-check

## 이력

- **#817 dead-wait hook 등록** (구 sidecar 의 원 주제): upstream [#315](https://github.com/coseo12/harness-setting/pull/315) 로 흡수 완료 (v4.4.0, 2026-07-18 #853 에서 Phase 3 동기화) — 더 이상 delta 아님
- **잔존 delta**: zombie-check 등록 1건만 남음 (본 문서)

## 근거

- 본 프로젝트: 가드 C — [#440](https://github.com/coseo12/astro-simulator/issues/440) incident (이전 세션 dev 서버 좀비 ETIME 3h17m → EADDRINUSE 오인 시퀀스)
- upstream 보고: [harness-setting#319](https://github.com/coseo12/harness-setting/issues/319) — "hook 파일 배포 + settings.json 미등록" 비대칭을 §5 manifest 위생과 함께 보고됨

## Z-패턴 Phase

- **Phase 1 (본 프로젝트 선반영)**: 완료 — zombie hook 등록 유지 + 본 sidecar
- **Phase 2 (upstream 기여)**: harness-setting#319 에 등록 비대칭 보고 완료. upstream 이 registration 을 채택하면 자동 흡수
- **Phase 3 (동기화)**: upstream settings.json 에 zombie-check 등록이 포함된 릴리스 적용 시 본 sidecar orphan 전환 → `verify-harness-drift-decorator.mjs --mode=sidecar-cleanup --apply` 로 정리
