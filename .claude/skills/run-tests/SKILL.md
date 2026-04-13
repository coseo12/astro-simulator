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
