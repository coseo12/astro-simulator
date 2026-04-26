---
name: "v3.0.0 6c 경로 마이그레이션 리포트"
about: "harness update 가 6c 경로로 스킵된 상황을 자동화된 메타와 함께 리포트합니다. 본 템플릿은 마이그레이션 스크립트가 stderr 로 출력한 pre-filled URL 을 통해 열리는 것이 일반적이며, 수동으로도 사용 가능합니다."
title: "[6c] ci.yml 가드 블록 수동 수정 감지"
labels: ["enhancement", "scope:framework"]
assignees: []
---

> 본 이슈는 `harness update` 의 `.github/workflows/` 책임 분리 마이그레이션 (v3.0.0, #196) 에서
> 6c 경로 (가드 블록 사용자 수정 감지 → 자동 분리 스킵) 가 발동된 다운스트림의 관찰을 수집합니다.
> stderr 에서 출력된 pre-filled URL 로 이 템플릿을 열었다면, **환경 메타 섹션은 자동 채워져 있습니다**.
> 관찰 / 수정 동기 / 재현 정보 섹션만 보완해 주세요.

## 환경 메타 (자동 수집)

<!-- pre-filled URL 로 열면 아래 값이 자동 채워집니다. 수동 작성 시 직접 기입. -->

- harness version: <!-- e.g., 3.3.0 -->
- Node version: <!-- e.g., v20.11.1 -->
- OS: <!-- e.g., darwin-arm64 / linux-x64 -->
- ci.yml sha256 (앞 12자리): <!-- e.g., a1b2c3d4e5f6 -->

## 관찰 내용

### 가드 블록을 어떻게 수정했습니까?

<!-- 예: verify-agent-ssot 호출 앞에 if 조건 추가, 특정 가드 step 삭제, 다른 step 추가 등 -->

### 수정 동기

<!-- 예: 다운스트림 고유 정책, 외부 CI 제약, 실험적 옵션 등 -->

### 제안되는 upstream 확장이 있습니까?

<!-- 예: `--verbose` 플래그 공식 지원, 선택적 가드 skip 환경변수, 추가 가드 훅 포인트 등. 없어도 OK. -->

## 재현 정보

### ci.yml 가드 블록 (관련 부분만 첨부)

```yaml
# harness 저장소 전용 가드 섹션의 현재 상태
# (민감 정보가 있으면 삭제 후 첨부)
```

### 수동 마이그레이션 수행 여부

- [ ] `docs/harness-ci-migration.md` 의 수동 절차를 수행했다
- [ ] 수동 절차 중 문제가 있었다 (아래 상세)
- [ ] 아직 수동 절차를 수행하지 않았다 (이유: )

## 체크리스트

- [ ] 환경 메타가 정확히 수집되었다
- [ ] 가드 블록 수정 동기를 공유했다
- [ ] 가능하면 upstream 확장 제안을 덧붙였다

## 관련

- 원 이슈: [#208](https://github.com/coseo12/harness-setting/issues/208)
- 마이그레이션 로직: `lib/migrations/2.31.0-to-3.0.0.js` (6c 경로)
- 수동 가이드: [`docs/harness-ci-migration.md`](../../docs/harness-ci-migration.md)
- ADR: [`docs/decisions/20260421-workflows-responsibility-split.md`](../../docs/decisions/20260421-workflows-responsibility-split.md)
