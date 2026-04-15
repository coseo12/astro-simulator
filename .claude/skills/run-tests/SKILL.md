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

## 규칙

- 테스트 실행 전 의존성이 설치되어 있는지 확인한다.
- 전체 테스트 실행이 너무 오래 걸리면 변경 관련 테스트만 먼저 실행한다.
- 환경 변수가 필요한 테스트는 `.env.example` 등을 참고하여 설정한다.
- flaky 테스트는 3회 재시도 후에도 실패하면 보고한다.
- **UI 프로젝트는 E2E 테스트를 생략하지 않는다.**
