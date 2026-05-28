# 매니페스트 최신 ≠ 파일 적용 완료 — 부분 실패 교착 복구

> **근거**: harness #256 가지치기 PR 에서 CLAUDE.md `## 실전 교훈` 의 "매니페스트 최신 ≠ 파일 적용 완료" 블록을 추출. 원천: volt [#27](https://github.com/coseo12/volt/issues/27) — `harness update` 부분 실패로 매니페스트와 디스크가 어긋난 교착 상태. 파생: volt [#13](https://github.com/coseo12/volt/issues/13) (lint-staged silent partial commit) / [#35](https://github.com/coseo12/volt/issues/35) (formatter 재포맷 drift).

## 패턴

매니페스트 기반 패키지 관리자(`harness update`, Nix, brew, dpkg/apt, npm package-lock 등)는 파일 적용과 매니페스트 해시 기록이 **원자적 트랜잭션이 아닌** 경우가 많다. 파일 적용 중 일부가 롤백되어도 매니페스트는 최신 해시로 기록되어, 다음 재-apply 가 "동일 상태" 로 오판하고 스킵하면 **복구 불가능한 교착 상태** 에 빠진다.

## 증상

- `harness update --apply-all-safe` 재실행이 롤백된 파일을 "사용자 임의 수정" 으로 간주해 건너뜀
- `--check` 재실행 시 "안전 업데이트 N개" 노이즈가 반복돼 실질 upstream 변경을 놓칠 위험

## 즉시 복구

이전 머지 커밋에서 `.harness/manifest.json` 을 복구 후 재-apply:

```bash
# 이전 머지 커밋 찾기
git log --oneline --merges -n 5

git checkout <이전-머지-커밋-해시> -- .harness/manifest.json
npx github:coseo12/harness-setting update --apply-all-safe
# 롤백된 파일이 다시 pristine 으로 감지되어 재적용됨
```

## 예방 루틴

- 패키지 업데이트 커밋 시 매니페스트와 파일을 **동일 커밋** 에 묶기
- 부분 실패 감지 시 전체 revert + 재시도를 부분 보수보다 우선
- 선행 원인 lint-staged silent partial commit (volt [#13](https://github.com/coseo12/volt/issues/13)) 과 연쇄될 때 가장 자주 관찰됨

## 다운스트림 formatter 재포맷 경계 drift (volt [#35](https://github.com/coseo12/volt/issues/35))

lint-staged / pre-commit 의 `prettier --write` 류가 파일 적용 **직후** 실행되면 upstream 파일 스타일(따옴표·빈 줄·공백 정렬 등) 을 로컬 컨벤션으로 되돌려, 매니페스트엔 upstream 해시가 기록됐어도 디스크 파일은 재포맷 상태로 drift.

**예방**: 다운스트림 `.prettierignore` 에 harness-managed 경로 (`.claude/`, `.github/ISSUE_TEMPLATE/`, 관리 `docs/*.md` 등) 추가.

**탐지**: 커밋 직후 `git show --stat HEAD` 로 실제 반영된 파일 수가 의도와 일치하는지 확인.

근거: astro-simulator 에서 v2.7.0 → v2.11.0 적용 시 35 파일이 prettier 재포맷으로 drift. volt [#13](https://github.com/coseo12/volt/issues/13) (staging 성공 ≠ 커밋 내용) 의 formatter 파이프라인 버전.

## harness 코드 레벨 원자성 개선 이력

- **v2.8.0** (harness [#89](https://github.com/coseo12/harness-setting/issues/89)) — **post-apply 검증 게이트** 도입: 파일 적용 직후 upstream 패키지 해시와 디스크 실측 해시를 비교하여 불일치 파일의 매니페스트 해시는 이전 값으로 유지(재-apply 시 pristine 재감지). 부분 실패 시 exit code 1 + stderr 경고. `harness doctor` 는 "매니페스트 해시 정합성" 항목으로 해시 위조를 감지
- **v2.9.0** (harness [#92](https://github.com/coseo12/harness-setting/issues/92) Phase 1) — 매니페스트에 **`previousSha256`** 필드 자동 기록: `userSha === previousSha256` 인 파일은 `modified-pristine` 으로 재분류되어 `--apply-all-safe` 가 자가 복구. v2.8.0 이 못 잡던 타이밍(커밋 시점 lint-staged 롤백) 도 코드 레벨에서 해소

## 근거

- volt [#27](https://github.com/coseo12/volt/issues/27) — `harness update` 부분 실패 교착 복구
- volt [#13](https://github.com/coseo12/volt/issues/13) — lint-staged silent partial commit (선행 원인)
- volt [#35](https://github.com/coseo12/volt/issues/35) — 다운스트림 formatter 재포맷 drift
- harness [#89](https://github.com/coseo12/harness-setting/issues/89) (v2.8.0) / [#92](https://github.com/coseo12/harness-setting/issues/92) (v2.9.0~) — 코드 레벨 원자성 개선
- 일반화된 설계 지식: [docs/architecture/state-atomicity-3-layer-defense.md](../architecture/state-atomicity-3-layer-defense.md) — 도중/사후/안내 3계층 직교 방어 패턴 (harness 외 파일 시스템 / DB 마이그레이션 / 빌드 캐시 / git 서브모듈에 재사용)
