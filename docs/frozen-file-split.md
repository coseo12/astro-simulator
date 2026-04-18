# frozen 파일 업데이트 충돌 회피 — 파일 분리 패턴

`.github/workflows/ci.yml` 같은 **frozen 파일**에 프로젝트 고유 로직(Rust 툴체인, wasm-pack, 커스텀 verify 등)을 얹어야 할 때 사용하는 패턴. 업스트림 `harness update` 시 구조적으로 덮어쓰기를 방지한다.

근거: volt [#12](https://github.com/coseo12/volt/issues/12).

## 문제

- `.github/workflows/ci.yml` 은 `lib/categorize.js` 에서 **frozen** 분류
- frozen = `--apply-all-safe` / `--apply-frozen` 로 **전체 덮어쓰기 안전**이라 가정
- 그러나 프로젝트 고유 스텝을 같은 파일에 섞으면 업데이트 시 소실 위험
- 매니페스트 해시가 이전 템플릿 기준이라 "modified-pristine"으로 오분류되기도 함

## 해결 — 파일 분리

```
.github/workflows/
├── ci.yml                   # harness frozen 유지 (업스트림 관리)
└── ci-<project-slug>.yml    # 프로젝트 고유 로직 (harness 추적 제외)
```

### 절차

1. **업스트림 최신으로 되돌림**: `ci.yml` 을 `harness update --apply-frozen` 으로 복원
2. **프로젝트 고유 워크플로 신설**: `ci-<slug>.yml` 에 로컬 스텝만
   ```yaml
   # .github/workflows/ci-physics-wasm.yml
   name: CI (physics-wasm)
   on:
     pull_request:
       branches: [develop, main]
   jobs:
     rust-wasm-tests:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: dtolnay/rust-toolchain@stable
           with:
             toolchain: 1.94.1
             targets: wasm32-unknown-unknown
         # ... 프로젝트 고유 스텝
   ```
3. **manifest에서 추적 제외**: `.harness/manifest.json` 의 `files` 객체에서 로컬 파일 엔트리를 **직접 삭제**. `harness update --bootstrap` 실행 시에도 제외 유지.
4. **브랜치 보호 룰**: required check 2개 (ci.yml + ci-<slug>.yml) 모두 등록.

## 트레이드오프

| ✅ 장점 | ⚠️ 비용 |
|---|---|
| 업스트림 업데이트 시 로컬 로직 구조적 차단 | PR 체크 개수 증가 |
| harness 관리 vs 프로젝트 고유 책임 경계가 파일로 명확 | manifest 수동 편집 필요 |
| GitHub Actions 병렬 실행으로 시간 손실 없음 | `.harnessignore` 같은 선언적 메커니즘 부재 |

## 언제 쓰면 좋은가

- frozen 파일에 프로젝트 고유 로직을 얹어야 한다
- 업스트림 업데이트 주기가 있고, 로컬 변경이 누적된다
- managed-block 센티널로 감싸기에는 파일 형식이 적합하지 않다 (YAML 등)

## 대안 검토

| 대안 | 상태 |
|---|---|
| **파일 분리 + `.harnessignore`** (권장) | ✅ v2.5.0부터 지원. 선언적 제외 |
| **파일 분리 + manifest 수동 편집** | ✅ 이전 방식, 여전히 유효하나 번거로움 |
| managed-block 센티널 YAML 지원 | ❌ 현재 CLAUDE.md만 지원 — 후속 개선 후보 |

## `.harnessignore` 사용법 (v2.5.0+)

프로젝트 루트에 `.harnessignore` 파일을 두면 매칭 패턴이 **manifest 추적에서 제외**된다. gitignore 스타일(glob + `#` 주석).

```
# .harnessignore
# 프로젝트 고유 워크플로는 harness 업데이트 대상 아님
.github/workflows/ci-physics-wasm.yml
.github/workflows/ci-*.yml

# 프로젝트별 스크립트 디렉토리
scripts/project-*/
```

- `harness update --check` 출력에서 노이즈(added/removed)로 잡히지 않음
- 기존 manifest에 포함된 파일이 새로 ignore 되면 `harness update --bootstrap` 으로 manifest 재생성하면 자동 제거됨
- 지원 문법: `*`, `**`, `?`, 디렉토리 접미사 `/`, `#` 주석. 미지원: `!` 네거티브(필요 시 후속)

후속 harness 개선 제안은 별도 이슈로 논의.

## 참고

- volt [#12](https://github.com/coseo12/volt/issues/12) — 본 패턴 원 사례
- `docs/knowledge-compilation.md` — 지식 위치 결정 규약
- `lib/categorize.js` — 카테고리 판정 기준
