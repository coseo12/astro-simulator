# harness update 부합성 사전 체크리스트

> **본 체크리스트의 목표**: `harness update` 이후 발생할 수 있는 예상치 못한 CI 실패와 그로 인한 반복적인 push-fail-fix 디버깅 시간을 **사전 진단** 으로 방지한다.
>
> harness-setting 을 다운스트림 프로젝트에 `harness update --check` / `--apply-all-safe` 적용 **전** 에 수행하는 구조 부합성 점검. v2.15.0 에서 `detect-and-test` 가 "감지만" 에서 "실제 실행" 으로 확장된 이후 다운스트림 특수 구조 (pnpm 모노레포 / WASM / dist-based exports 등) 와 부합하지 않아 push-fail-fix 루프에 빠지는 패턴이 반복 관찰됨 (volt [#62](https://github.com/coseo12/volt/issues/62) / [#64](https://github.com/coseo12/volt/issues/64)). 본 체크리스트로 사전 이탈 감지.

## 적용 범위 (reviewer #191 권고 #4)

> **본 체크리스트는 v2.29.0 기준 Node.js 모노레포 중심**. v2.29.0 에서 Python / Go / Rust / yarn 경로가 확장됐으나 동일 구조 (editable install + build 산출물 exports) 는 Python (`pyproject.toml` extras / setuptools editable) / Rust (`cargo build --lib` 후 dist) 에도 존재 가능. 해당 생태계 다운스트림은 본 체크리스트를 **Node.js → Python/Rust 로 유추 적용** 하되, 별도 경로 체크리스트 확장은 후속 이슈로 추적.

> **v3.0.0 업데이트** — `.github/workflows/ci.yml` 이 **user-only** 로 재분류됐다 (이슈 [#196](https://github.com/coseo12/harness-setting/issues/196), [ADR 20260421-workflows-responsibility-split](decisions/20260421-workflows-responsibility-split.md)). 다운스트림이 ci.yml 을 자유롭게 수정해도 **이제 upstream 과 충돌하지 않는다**. 본 체크리스트 **4번 (기존 전용 테스트 워크플로)** 의 "옵션 C (divergent 수정)" 단점이 사라짐 — 원하는 방식대로 ci.yml 을 수정할 수 있다. upstream 가드 (SSoT drift 등) 는 `.github/workflows/harness-guards.yml` 로 분리돼 독립 동작한다.

## 언제 수행하는가

- **harness MAJOR / MINOR 업데이트 적용 전** 에 1회
- 다운스트림 프로젝트 구조가 **Node.js 단일 앱이 아닌 경우** (모노레포 / 특수 빌드 도구 / 바이너리 산출물) 에 반드시
- v2.29.0+ 에서 CI 가 다언어·다패키지 매니저 경로 실 실행하므로 본 점검 가치가 높다

## 4단계 체크리스트

### 1. 모노레포 전체 재귀 호출 감지

- [ ] 다운스트림 `package.json::scripts.test` 가 `pnpm -r test` / `npm -ws test` / `yarn workspaces foreach run test` / `nx run-many` / `turbo run test` 류 **전체 재귀 호출** 인가?

**Yes** 이면 CI 의 `npm test` / `pnpm test` 호출 시 **모든 workspace 가 빌드·테스트에 참여**. 각 workspace 가 CI 환경에서 정상 동작하는지 개별 확인 필요. 특히 빌드 산출물 의존이 있으면 다음 항목으로.

> **실측 fixture 쌍둥이** — 본 체크 항목은 [`test/fixtures/pnpm-monorepo/`](../test/fixtures/pnpm-monorepo/) 로 upstream CI 에서 실측 검증된다 (issue [#190](https://github.com/coseo12/harness-setting/issues/190), [ADR 20260423-ci-fixture-pnpm-workspace](decisions/20260423-ci-fixture-pnpm-workspace.md)). fixture root `scripts.test` 가 `pnpm -r --filter ./packages/lib run build && pnpm -r run test` 로 재귀 호출 + 빌드 선행을 재현. 다운스트림에서 동일 구조라면 upstream `fixture-smoke-test` job 초록 = 해당 경로가 CI 에서 동작함이 보증.

### 2. 빌드 산출물 기반 exports 의존

- [ ] 워크스페이스 중 `package.json::exports` / `main` / `module` 이 `dist/...` / `build/...` / `lib/...` 을 가리키는 항목이 있는가?

**Yes** 이면 `pnpm install` / `npm ci` 직후 **import 불가 상태**. 빌드 선행 필요 → harness 의 detect-and-test 단순 `install → test` 파이프라인 **부적합**. 선택:
- 사전 `build` step 추가 (`pnpm -r build && pnpm -r test`) — 다운스트림 전용 ci.yml 수정 필요
- 또는 `scripts.test` 를 빌드 포함 명령으로 (`pnpm -r build && pnpm -r --stream test`)

> **실측 fixture 쌍둥이** — [`test/fixtures/pnpm-monorepo/packages/lib/`](../test/fixtures/pnpm-monorepo/packages/lib/) 의 `package.json` 이 `main: ./dist/index.js` + `exports["."]` dist 경로를 유지하고, [`packages/app/`](../test/fixtures/pnpm-monorepo/packages/app/) 이 `workspace:*` 로 이를 소비한다. fixture root `scripts.test` 가 lib build 를 선행 실행하여 v2.28.2 / v2.29.1 부류 dist-based exports 의존 regression 을 upstream PR 단계에서 차단. 상세: [ADR 20260423](decisions/20260423-ci-fixture-pnpm-workspace.md).

### 3. 특수 빌드 도구 의존

- [ ] 워크스페이스 중 다음 도구 중 하나라도 의존하는가?
  - **wasm-pack** (Rust → WebAssembly)
  - **cargo** (순수 Rust 프로젝트)
  - **protoc** (Protocol Buffers)
  - **msbuild** (.NET)
  - **bindgen** (C FFI)
  - **docker build** (컨테이너 산출물 필수)
  - **swift-build** / **flutter build** / **gradle assembleRelease**

**Yes** 이면 harness 범용 Node CI 템플릿 **미지원**. 해당 workspace 를 CI 실행에서 **제외** 하거나 **사전 설치 step** 을 프로젝트 전용 워크플로로 분리. upstream harness 에 도구별 지원 추가를 요구하면 범용성 논쟁 발생 → 프로젝트 전용 경로 권고.

### 4. 기존 전용 테스트 워크플로 존재

- [ ] `.github/workflows/` 에 이미 프로젝트 전용 테스트 워크플로 (`verify-and-rust.yml` / `verify-wasm.yml` / `full-test.yml` 등) 가 전체 테스트를 수행하고 있는가?

**Yes** 이면 harness 의 `detect-and-test` 는 **중복**. `package.json` 에서 `scripts.test` 제거 → harness CI 가 `npm test --if-present` 로 조용히 skip → 기존 워크플로만 동작. **옵션 A** (아래 선택 옵션 참조) 로 귀결.

## 구조 불일치 시 선택 옵션

| 옵션 | 내용 | 장점 | 단점 |
|---|---|---|---|
| **A** | `package.json::scripts.test` 제거 + `test:unit` / `test:ci` 로 대체 | harness detect-and-test 자동 skip, 전용 워크플로 유지 | `pnpm test` 로컬 관습 변경 필요 |
| B | `scripts.test` 를 `echo "see test:ci"` no-op shim | 의도 명시 | "fake" 스크립트라 혼란 가능 |
| C | `.github/workflows/ci.yml` 을 upstream 에서 divergent 수정 | 완전 커스터마이징 | upstream 과 영구 충돌 — `harness update` 매번 충돌 |
| D | upstream harness 에 특수 경로 추가 요청 | 범용성 이득 | 왕복 비용 큼 + 다른 다운스트림이 원하지 않을 수 있음 |

**판정 애매 시 A 추천** — 다운스트림 특수성은 다운스트림에서 흡수하는 것이 upstream 범용성과 충돌 없음. `pnpm test` 대신 `pnpm test:unit` / `pnpm test:ci` 명시 호출로 로컬 관습을 유지하면서 CI 독립 분리.

## 실측 사례 — astro-simulator PR #270 (2026-04-20)

harness v2.15.0 → v2.29.1 적용 시 6회 연속 push-fail-fix 루프:

1. `npm test` → `sh: 1: pnpm: not found` (v2.28.2 로 해결)
2. `pnpm test --if-present` → vitest "Unknown option" (v2.29.1 로 해결)
3. `pnpm -r test` → `wasm-pack not found` (범용 CI 한계 — **옵션 A** 로 회피)
4. physics-wasm 제외 → shared dist 없음 → build 선행 필요
5. `pnpm -r build` 필터 → root.build 재귀로 physics-wasm 재포함
6. core build → `@astro-simulator/physics-wasm` 타입 의존 해결 불가

**6단계 후 scripts.test 제거 (옵션 A)** 로 최종 회피. 정정 (reviewer #191 권고 #5): 1~2단계는 upstream harness 버그 (v2.28.2 / v2.29.1 수정) 였으므로 본 체크리스트 **범위 밖**. 본 체크리스트를 사전 수행했어도 1~2단계는 피할 수 없었다. 다만 **3단계부터 (WASM / 타입 의존 / 재귀 빌드) 는 체크 3에서 즉시 옵션 A 도출 가능** — 약 3~4 실패 사이클 단축 효과.

## 관련

- [`test/fixtures/pnpm-monorepo/`](../test/fixtures/pnpm-monorepo/) — 본 체크리스트 1~2 항목의 **실측 쌍둥이 fixture** (issue [#190](https://github.com/coseo12/harness-setting/issues/190))
- [ADR 20260423-ci-fixture-pnpm-workspace](decisions/20260423-ci-fixture-pnpm-workspace.md) — fixture 설계 (축 3개 비교)
- volt [#62](https://github.com/coseo12/volt/issues/62) — 본 체크리스트 원안
- volt [#64](https://github.com/coseo12/volt/issues/64) — upstream CI 에 pnpm/WASM 스모크 fixture 추가 제안 (별도 실행 이슈)
- volt [#60](https://github.com/coseo12/volt/issues/60) — "다운스트림 실측이 최종 가드" (본 체크리스트의 상위 원칙)
- volt [#48](https://github.com/coseo12/volt/issues/48) — "CI 통과 ≠ 테스트 실행" (체크리스트 4번 항목의 역사적 근거)
- harness release [v2.28.2 ~ v2.29.1](https://github.com/coseo12/harness-setting/releases) — 본 체크리스트를 촉발한 연쇄 버그
