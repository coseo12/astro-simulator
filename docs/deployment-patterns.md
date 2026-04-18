# 배포 패턴 — gitflow 와 PaaS 통합 가이드

이 문서는 harness-setting 이 권장하는 gitflow 를 PaaS 자동 배포 도구와 매핑하는 방법을 설명한다.

## 원칙

`main = production / develop = staging / feature·fix/* = preview` 의 3단계 환경 매핑.

- **main**: production 배포 대상. 릴리스 태그가 이곳에만 존재. push 는 release PR (merge commit) 또는 hotfix PR 로만 발생
- **develop**: staging / integration environment. 여러 feature 가 상호작용하는 기능을 main 승격 전에 검증하는 공간. PaaS 의 staging environment 에 매핑 권장
- **feature/\*, fix/\***: 일시적 preview environment. PR 단위 독립 URL. 개별 feature 확인용

### develop 의 역할이 왜 중요한가

tag trigger 로는 대체 불가능한 수요가 있다:

1. **통합 스테이징** — feature A 와 feature B 가 상호작용할 때 각자 main 으로 머지하면 상호작용 버그가 프로덕션에 노출됨. develop 에서 함께 섞여 동작하는지 먼저 검증
2. **staging env 분리** — QA 나 stakeholder 가 프로덕션과 동일 환경에서 다가오는 릴리스를 미리 확인

이 두 수요는 배포 타이밍 제어 (tag trigger) 와 직교한다.

## Vercel 예시

최소 설정 (Vercel 프로젝트 대시보드):

1. **Production Branch**: `main` (기본값 유지)
2. **Preview Deployments**: 모든 PR 자동 활성화 (기본값 유지)
3. **별도 Staging Environment**:
   - Settings → Environments → Add Environment
   - Name: `Staging`, Git Branch: `develop` 매핑
   - 필요 시 staging 전용 환경 변수 지정 (예: `NEXT_PUBLIC_API_URL=https://staging-api.example.com`)
4. **GitHub Actions** 이나 배포 보호가 필요하면 Vercel 의 Deployment Protection 기능 활성

`vercel.json` 으로도 관리 가능하지만 대시보드 설정이 보편적.

## 다른 PaaS 도구

아래 도구들은 동일한 원칙을 적용한다. 각 도구의 **Production Branch 를 `main` 으로 지정하고 `develop` 브랜치에 별도 환경을 연결**하면 된다. 세부 설정은 해당 도구의 공식 문서를 참조한다.

| 도구 | Production Branch 설정 위치 | 비고 |
|---|---|---|
| **Netlify** | Site settings → Build & deploy → Production branch | Branch deploys 로 `develop` 을 staging 으로 운용 |
| **AWS Amplify** | App settings → Environment → Production branch | Backend environments 로 staging 분리 |
| **Cloudflare Pages** | Settings → Builds & deployments → Production branch | Preview 브랜치 목록에 `develop` 추가 |
| **Railway** | Service → Settings → Production branch | Multiple environments 로 staging 연결 |
| **Render** | Service → Settings → Auto-Deploy branch | Preview environments 별도 설정 |
| **Firebase Hosting** | `firebase.json` + channels | `firebase hosting:channel:deploy staging` 수동 트리거 |

> 이 목록은 완전하지 않다. 모든 도구를 개별 커버하지 않는 대신 원칙 (`main=production / develop=staging`) 을 일관되게 적용한다.

## 예외 — tag 기반 배포

Docker 이미지 / npm 패키지 / Kubernetes 매니페스트 등 **배포 단위가 artifact** 인 경우 tag trigger 가 자연스럽다:

- **npm publish**: GitHub Actions 에서 `on: push: tags: ['v*']` 로 trigger
- **Docker Hub / GHCR**: tag push 시 이미지 빌드 + push
- **Kubernetes**: Argo CD / Flux 로 tag-based image rollout

tag 기반 배포만 쓰는 프로젝트는 gitflow 의 배포 격리 이익은 줄어들지만, **통합 스테이징 이익은 여전히 유효**하다. develop 에서 통합 검증 후 release PR → main → tag 발행 순서를 권장.

## 하네스 자체 vs 하네스 사용 프로젝트

| 구분 | harness-setting 저장소 자체 | 하네스를 쓰는 프로젝트 (예: 웹 앱) |
|---|---|---|
| 배포 대상 | npm 패키지 + GitHub Release | 웹 앱 (Vercel/Netlify 등) |
| 배포 트리거 | **수동** `git tag + gh release create` | **자동** 브랜치 push (PaaS) |
| main push 의미 | 소스 업데이트만 (배포 트리거 아님) | production 즉시 배포 |
| develop 의 역할 | 통합 스테이징 + 릴리스 타이밍 제어 | 통합 스테이징 + staging env 매핑 |
| gitflow 필요성 | 통합 스테이징만 (배포 격리는 수동으로도 가능) | 통합 스테이징 + 배포 격리 둘 다 필수 |

**공통**: 양쪽 모두 gitflow 브랜치 전략 (`main` / `develop` / `feature/*` / `fix/*` / `hotfix/*`) 은 동일하게 적용. 배포 트리거만 다르다.

## 릴리스 워크플로 재인용 (CLAUDE.md 참조)

```
1. gh pr merge <release-PR> --merge     # release PR 을 merge commit 으로 머지
2. git push origin main:develop         # fast-forward (main → develop mirror)
3. git tag vX.Y.Z + git push origin vX.Y.Z
4. gh release create vX.Y.Z ...
```

PaaS 프로젝트의 경우 단계 1 직후 main push 가 production 배포를 트리거한다. 그 사이 develop 의 staging 환경은 이미 이전 릴리스 상태를 유지한다는 점이 gitflow 의 핵심 이점.

## 관련 문서

- [ADR 20260419-gitflow-main-develop](decisions/20260419-gitflow-main-develop.md) — gitflow 선택 결정 근거
- [ADR 20260419-release-merge-strategy](decisions/20260419-release-merge-strategy.md) — release PR merge commit 전략
- [CLAUDE.md `## 브랜치 전략`](../CLAUDE.md) — 운영 규칙 요약
