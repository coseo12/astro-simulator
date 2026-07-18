<!-- HARNESS-DRIFT: Z-PATTERN [https://github.com/coseo12/harness-setting/issues/319] -->

# `.claude/settings.json` 프로젝트 divergent 변경 (sidecar)

`.claude/settings.json` 은 harness-managed atomic 파일이라 JSON 인라인 주석이 불가하므로,
Z-패턴 데코레이터를 본 sidecar 로 대신 박제한다 (ADR 20260515 §Amendment 8/11).

## 변경 요지 (v4.4.0 기준 잔존 delta)

- **SessionStart hooks 배열에 zombie-check hook 등록** (2번째):
  `bash .claude/hooks/session-start-zombie-check.sh`
  - zombie-check 는 **hook 파일 + settings.json 등록 양쪽 모두 다운스트림 전용** —
    upstream 은 어느 버전에서도 이 파일을 배포한 적 없음 (v4.4.0 `.claude/hooks/` 는
    dead-wait-check 단독, PR #859 리뷰 실측). 가드 C (#440) 다운스트림 고유 가드
  - upstream 등록 순서: (1) critical_rules printf, (2) dead-wait-check
  - 다운스트림 등록 순서: (1) critical_rules printf, (2) **zombie-check (본 delta)**, (3) dead-wait-check
  - 부수: `.harness/manifest.json` 이 이 다운스트림 전용 파일을 atomic 등재 중 (carry-over) —
    manifest 위생 관점의 비정상이며 upstream 보고 대상

## 이력

- **#817 dead-wait hook 등록** (구 sidecar 의 원 주제): upstream [#315](https://github.com/coseo12/harness-setting/pull/315) 로 흡수 완료 (v4.4.0, 2026-07-18 #853 에서 Phase 3 동기화) — 더 이상 delta 아님
- **잔존 delta**: zombie-check 등록 1건만 남음 (본 문서)

## 근거

- 본 프로젝트: 가드 C — [#440](https://github.com/coseo12/astro-simulator/issues/440) incident (이전 세션 dev 서버 좀비 ETIME 3h17m → EADDRINUSE 오인 시퀀스)
- upstream 보고: [harness-setting#319 코멘트](https://github.com/coseo12/harness-setting/issues/319) — zombie-check 훅 (파일+등록) upstream 채택 제안 + 다운스트림 전용 파일의 manifest atomic 등재 (carry-over) 위생 보고 (PR #859 리뷰 후속, 2026-07-18)

## Z-패턴 Phase

- **Phase 1 (본 프로젝트 선반영)**: 완료 — zombie hook 파일 + 등록 유지 + 본 sidecar
- **Phase 2 (upstream 기여)**: harness-setting#319 코멘트로 채택 제안 박제 (2026-07-18). upstream 이 파일 + registration 을 채택하면 흡수
- **Phase 3 (동기화)**: upstream 이 zombie-check 를 배포+등록한 릴리스 적용 시 본 sidecar orphan 전환 → `verify-harness-drift-decorator.mjs --mode=sidecar-cleanup --apply` 로 정리
