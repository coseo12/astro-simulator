---
name: run-tests
description: |
  프로젝트의 테스트를 자동 감지하고 실행하는 스킬. 범용 — 특정 언어/프레임워크에 비종속.
  TRIGGER when: 테스트를 실행해야 할 때, "테스트 돌려", "테스트 실행", "test 해줘",
  PR 생성 전 검증, QA 에이전트 작업, CI 실패 디버깅.
  DO NOT TRIGGER when: 테스트를 작성만 하고 실행하지 않을 때.
---

# 테스트 실행

프로젝트의 테스트 도구를 자동 감지하고 테스트를 실행한다.
범용 프레임워크이므로 특정 기술 스택에 의존하지 않는다.

## 감지 순서

아래 순서로 프로젝트의 테스트 환경을 감지한다. 첫 번째로 매칭되는 것을 사용한다.

| 감지 파일 | 실행 명령 |
|-----------|-----------|
| `package.json` (scripts.test 존재) | `npm test` 또는 `yarn test` |
| `Makefile` (test 타겟 존재) | `make test` |
| `pyproject.toml` 또는 `setup.py` | `pytest` 또는 `python -m pytest` |
| `go.mod` | `go test ./...` |
| `Cargo.toml` | `cargo test` |
| `build.gradle` 또는 `build.gradle.kts` | `./gradlew test` |
| `pom.xml` | `mvn test` |

감지되지 않으면 사용자에게 테스트 실행 방법을 질문한다.

## 실행 절차

1. 프로젝트 루트에서 위 테이블 순서로 파일을 확인한다.
2. 감지된 도구로 전체 테스트를 실행한다.
3. 실패가 있으면 원인을 분석한다.
4. 결과를 아래 형식으로 보고한다.

## 결과 보고 형식

```markdown
## 테스트 결과

- **도구**: [감지된 테스트 도구]
- **통과**: N개
- **실패**: N개
- **건너뜀**: N개

### 실패 상세 (있는 경우)
| 테스트 | 에러 메시지 | 원인 분석 |
|--------|-------------|-----------|
| test_name | error message | 분석 내용 |

### 결론
[통과/실패 — 실패 시 조치 방안 제시]
```

## 부분 실행

특정 범위만 테스트할 때:

```bash
# 변경된 파일 관련 테스트만 실행 (git diff 기반)
git diff --name-only develop | grep -E '\.(test|spec)\.'

# 특정 파일/디렉토리만 실행 (도구별)
# Node: npx jest path/to/test
# Python: pytest path/to/test
# Go: go test ./path/to/...
```

## 모노레포 가드 (pnpm/npm/yarn workspaces)

루트에 `pnpm-workspace.yaml`, `package.json`의 `workspaces` 필드, 또는 `nx.json`/`turbo.json`이 있으면 모노레포로 판정한다.

### 누락 검사 (필수)

`pnpm -r test` / `npm -ws test` 는 `scripts.test` 가 없는 워크스페이스를 **조용히 스킵**한다. 사고 방지:

```bash
# 각 워크스페이스에 테스트 설정이 존재하는지 검사
for ws in apps/* packages/*; do
  [ -d "$ws" ] || continue
  has_test=$(node -e "try{const p=require('./$ws/package.json');console.log(p.scripts?.test?'1':'0')}catch{console.log('0')}")
  if [ "$has_test" != "1" ]; then
    echo "❌ $ws: scripts.test 누락"
    exit 1
  fi
done
```

루트에 `verify:test-coverage` 스크립트로 박제해 CI 파이프라인 + `verify:all` 체인에 연결할 것을 권장.

### 워크스페이스 필터 적용
- 변경된 파일이 특정 워크스페이스에 한정되면 `pnpm --filter <ws> test` / `npm -w <ws> test` 로 범위를 좁힌다.
- 전체 회귀가 필요한 경우(코어 패키지 변경 등)에만 `-r` / `-ws` 로 전체 실행.

## 마일스톤 검증 모드 (Playwright verify 스크립트)

UI/마일스톤 종료 시 단순 단위 테스트로는 부족하다. CRITICAL #3 (브라우저 3단계 검증) 을 자동화하는 verify 스크립트 패턴:

### 파일명 규약
- 개별 기능: `scripts/browser-verify-<feature>.mjs`
- 마일스톤 종합: `scripts/verify-<phase>.mjs` (예: `verify-p2b.mjs`) — 개별 스크립트를 `execSync` 순차 실행 + 성능 회귀 체크

### 각 스크립트 구조 (3단계 + 종료 코드)
1. `[1/3] 정적` — 렌더 + 콘솔 에러 0
2. `[2/3] 인터랙션` — 클릭/폼/토글 실제 동작
3. `[3/3] 흐름` — URL ↔ 상태 동기화, 네비게이션, 데이터 연동
4. 스크린샷 출력: `.verify-screenshots/<feature>/{1-static,2-interaction,3-flow}.png`
5. 실패 시 `process.exit(1)`

### 마일스톤 종합
- 개별 verify 스크립트 실패 = 종합 실패 (게이팅)
- `bench:scene` 등 성능 측정 → baseline 대비 회귀율 비교 (허용 기준은 마일스톤 성격에 따라 동적, 스프린트 계약에 명시)

### fps 벤치마크 — vsync cap 해제 필수 (volt #11)

Playwright/Chromium 헤드리스에서 fps를 측정할 때 vsync cap(60/120Hz)에 걸리면 **모든 시나리오가 동률이 되어 baseline 비교가 무력화**된다. 절대 throughput 가시화를 위해 반드시 launch args에 해제 flag:

```js
// Chromium launch args
[
  '--disable-gpu-vsync',
  '--disable-frame-rate-limit',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
]
```

증상: 여러 엔진/시나리오가 정확히 120fps(또는 60fps)로 동률 → vsync cap 도달. 의심 즉시 위 flag 추가 재측정.
근거: https://github.com/coseo12/volt/issues/11

### GPU ms 해석 주의 — fps가 정직한 기준 (volt #15)

Babylon `EngineInstrumentation.gpuFrameTimeCounter` 같은 GPU 시간 계측은 **"GPU가 바쁜 시간"만** 집계한다. CPU(wasm/JS)에서 돌아간 시뮬 로직은 GPU ms에 안 잡히므로, CPU 시뮬 엔진과 GPU compute 엔진을 GPU ms로 1:1 비교하면 오독.

- 예: Barnes-Hut(CPU wasm) GPU ms 0.07 vs WebGPU compute GPU ms 2.18 → 순진 비교 "31× 느림"은 **오독** (fps는 226× WebGPU 우위)
- 주 비교 기준은 **fps** 또는 `performance.now` 기반 전체 frame time
- GPU compute 순수 비용은 `ComputeShader.gpuTimeInFrame` (Babylon v9) 으로 분리 측정

근거: https://github.com/coseo12/volt/issues/15

## E2E 테스트 (UI 프로젝트)

UI가 포함된 프로젝트에서는 단위/통합 테스트 후 **반드시 E2E 테스트를 실행**한다.

### E2E 감지 조건
아래 중 하나라도 해당하면 E2E를 실행한다:
- `components/`, `app/`, `pages/`, `src/` 디렉토리에 `.tsx`, `.jsx`, `.vue` 파일 존재
- `package.json`에 `next`, `react`, `vue`, `svelte` 등 UI 프레임워크 의존성 존재
- PR 변경 파일에 UI 관련 파일이 포함됨

### E2E 실행 절차

```bash
# 1. 개발 서버 기동 (백그라운드)
npm run dev &
DEV_PID=$!
sleep 10  # 서버 준비 대기

# 2. 헬스체크
curl -s http://localhost:3000/api/health || curl -s http://localhost:3000

# 3. Playwright E2E 실행 (듀얼 뷰포트)
# 프로젝트에 playwright 테스트가 있으면:
npx playwright test

# 없으면 핵심 흐름을 수동 검증:
# - 메인 페이지 접근
# - 핵심 사용자 시나리오 (CRUD, 인증 등)
# - 콘솔 에러 수집
# - 모바일(480px) + 데스크톱(1200px) 스크린샷

# 4. 서버 종료
kill $DEV_PID
```

### E2E 뷰포트 규칙
| 뷰포트 | 해상도 | 검증 포인트 |
|--------|--------|------------|
| 모바일 | 480×900 | 반응형 레이아웃, 사이드바 토글, 터치 영역 |
| 데스크톱 | 1200×800 | 병렬 레이아웃, 호버, 전체 UI |

### E2E 결과 포함 항목
- 콘솔 에러 수 (0이어야 통과)
- 스크린샷 (모바일 + 데스크톱)
- 핵심 사용자 흐름 성공 여부

## 장기 테스트 이원화 (volt #54) — 일상 경로 5분 내 완주

장기 적분 / E2E / 외부 리소스 호출 / stress 테스트가 일상 테스트 경로에 혼재하면 TDD 루프가 교착된다. **장기 테스트는 `#[ignore]` 류 어트리뷰트로 분리 + CI 에 독립 job (`continue-on-error: true`) 구성**. 일상 경로 5분 내 완주를 보장하는 규범.

### 마킹 규약 (언어별)

| 언어/프레임워크 | 마킹 | CI 실행 |
|---|---|---|
| Rust | `#[ignore = "<사유>; run with --include-ignored in CI"]` | `cargo test --lib -- --include-ignored` |
| Jest/Vitest | 파일명 suffix `*.slow.test.ts` + config 프로젝트 분리 / 또는 `describe.skip`·`it.skip` + `RUN_SLOW` env 조건 분기 | `RUN_SLOW=1 vitest` / `vitest --project slow` (config 에 `testMatch` / `include` 분리) |
| pytest | `@pytest.mark.slow` (conftest 에서 `--run-slow` 훅) | `pytest --run-slow` |
| Go | `t.Skip(...)` + build tag `//go:build slow` | `go test -tags slow ./...` |
| JUnit (Java) | `@Tag("slow")` + Maven `-DexcludedGroups=slow` | Maven profile 전환 |

**공통 원칙**:
- 사유 문자열 필수 — 재현 조건 박제 (예: `"long-integration"` / `"e2e"` / `"requires-network"`)
- 규약 문구 통일 — `grep` 검색 용이. 프로젝트 상단 주석에 사용 태그 목록 명시

### CI 워크플로 이원화 패턴

```yaml
jobs:
  test-fast:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/cache@v4
        with:
          path: ~/.cargo
          key: cargo-fast-${{ hashFiles('Cargo.lock') }}   # 빠른 경로 전용 키
      - run: cargo test --release --lib
    # 실패 시 PR 차단

  test-long-integration:
    runs-on: ubuntu-latest
    continue-on-error: true    # 빠른 경로 실패 시만 머지 차단
    steps:
      - uses: actions/checkout@v4
      - uses: actions/cache@v4
        with:
          path: ~/.cargo
          key: cargo-long-${{ hashFiles('Cargo.lock') }}   # 장기 경로 전용 키 (접두사 다름)
      - run: cargo test --release --lib -- --include-ignored
    # 실패는 nightly 알림 / 대시보드만
```

**핵심 제약**: 두 job 의 `actions/cache` **`key` 접두사를 다르게** 명시적으로 설정 (예: `cargo-fast-*` / `cargo-long-*`). GitHub Actions `actions/cache` 는 동일 `key` 시 job 간 캐시 공유가 기본이므로, 별도 접두사로 **명시적 분리** 하지 않으면 빠른 경로 재실행이 장기 경로 cache 를 무효화한다. 기본 동작 아님 — 명시적 설정 필수.

### 재발 감지 신호 (정기 감사 항목)

- 로컬 일상 테스트 경로가 이전 대비 **5배+ 소요**
- CI 빠른 경로 캐시 무효화 빈도 증가
- 개발자가 전체 테스트 없이 **개별 테스트만 실행하는 습관** 형성 (빠른 경로 신뢰 저하 신호)
- Rust 의 경우 `target/debug/` 디렉토리 크기 폭증 (동시 test binary 누적 — volt #52 좀비 누적과 연쇄)

### 주의사항

- **`#[ignore]` 남용 경계** — "불편한 테스트" 를 숨기는 용도로 쓰면 장기 경로가 커버리지 블랙홀이 된다. 사유 문자열 + CI 실측 시간 기록 필수
- **CI 장기 경로 모니터링** — `continue-on-error: true` 는 빠른 경로 **보호** 일 뿐. 장기 실패를 오래 방치하지 않도록 dashboard / nightly 알림 필수
- **남용 방지 regression 가드**: 전체 테스트 개수 대비 ignore 비율이 일정 임계값 (예: 20%) 을 넘으면 재평가. ignore 목록을 주기적으로 훑어 "이제 빠른 경로로 돌려도 되는가" 재분류
- **cross-compile 경로**: `#[cfg(not(target_arch = "wasm32"))]` 등과 조합 시 CI matrix 확장 영향 확인

### 실측 사례

volt [#54](https://github.com/coseo12/volt/issues/54) — astro-simulator P9 M4: 6건 `#[ignore]` 적용으로 **30분+ 교착 → 9.27s (200× 단축, 5분 목표의 32× 여유)**. CI `--include-ignored` 경로는 216.9s (3분 36초) 로 독립 실행. 대상: `mercury_perihelion_precession_eih` / `yoshida_mercury_perihelion_regression` / `earth_perihelion_eih_within_5_percent` 등 100+ 년 적분 테스트.

## Flaky 진단 루트 (volt #50) — concurrency=1 누르기 금지

병렬 테스트 flaky 발견 시 `--test-concurrency=1` / `--jobs 1` / CI retry 플래그로 **누르는 것은 증상 마스킹**. 근본 원인은 보통 공유 리소스 / 카테고리 오분류 / I/O race 이고, 임시 조치는 (1) 실행 시간 수배 증가 (2) 근본 원인 은폐 (3) 다른 flaky 감지 능력 저하 세 단점. **실패 시 stderr 에서 영향받은 객체를 특정** 하여 원인 추적으로 바로 연결한다.

### 진단 6단계 (재사용 가능)

1. **병렬 반복 실행 + stderr 수집** — 10~20회 돌려 실패율 + 실패 시 출력 패턴 기록 (1~2회 통과는 증명 부족)
2. **실패 시 영향받은 객체 특정** — stderr / assert 메시지에서 파일명/키/리소스 이름 추출
3. **이름 패턴 분석** — 공통 접두사 / 디렉토리 / 카테고리 (예: "실패 파일이 전부 `.claude/logs/` 하위")
4. **해당 객체의 분기 결과 확인** — categorize 류 함수 / configuration lookup / dispatch table 에 직접 입력해 실제 반환값 확인
5. **주석 계약 / 문서 규칙 대조** — "주석이 선언한 동작 = 구현" 이 아니면 drift 발견 (관련 교훈: CLAUDE.md "주석 계약 vs 구현 drift")
6. **수정 + 회귀 가드** — **8회 이상 연속 병렬 통과** 실측 (timing 문제의 불확실성 고려 시 충분한 샘플). 임시 조치 제거한 상태에서 확인

### 수용 기준 (근본 해소 실증)

- **8회 이상 연속 병렬 실행 0 실패**
- **임시 조치 제거 상태에서 통과** — concurrency=1, retry, skip 등 완화 수단 없이
- **실행 시간 회복** — 누르기 전 수준 (또는 더 빠르게)

### 안티패턴 (모두 금지)

| 안티패턴 | 이유 |
|---|---|
| `--test-concurrency=1` 으로 직행 | 증상 마스킹 + 실행 시간 수배 증가 + 다른 flaky 은폐 |
| CI `retry` 플래그 추가 | CI 시간 증가 + 진짜 실패 탐지 지연 |
| `skip` / `xfail` 마킹 | 근본 원인을 영구 은폐 |
| "우선순위 low" 방치 | 1 라인 수정으로 60~80% 단축될 수 있는 이득 상실 |

### 근거

volt [#50](https://github.com/coseo12/volt/issues/50) — harness v2.24.0 (#153) → v2.25.0 (#157) 에서 병렬 flaky 75% 실패율을 `--test-concurrency=1` 로 눌러 6s → 18s 역행했다가, stderr 의 `.claude/logs/` 파일 경로 단서로 categorize 주석-구현 drift 식별 → 1 라인 수정으로 7.5s 로 회복 + 8회 연속 병렬 통과 확인.

## 규칙

- 테스트 실행 전 의존성이 설치되어 있는지 확인한다.
- 전체 테스트 실행이 너무 오래 걸리면 변경 관련 테스트만 먼저 실행한다.
- 환경 변수가 필요한 테스트는 `.env.example` 등을 참고하여 설정한다.
- flaky 테스트는 3회 재시도 후에도 실패하면 **위 Flaky 진단 루트로 근본 원인 추적** (concurrency=1 누르기 금지). 우선순위 low 방치도 금지.
- **UI 프로젝트는 E2E 테스트를 생략하지 않는다.**
