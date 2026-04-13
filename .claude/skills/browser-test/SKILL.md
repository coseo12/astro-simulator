---
name: browser-test
description: |
  agent-browser 기반 브라우저 테스트 및 시각적 검증 스킬.
  TRIGGER when: E2E 테스트, UI 시각적 검증, 브라우저 테스트, 스크린샷 캡처,
  "브라우저 테스트", "E2E", "화면 확인", "스크린샷", 반응형 검증, 접근성 검사,
  브라우저 기반 테스트, 구현 결과 확인.
  DO NOT TRIGGER when: 단위 테스트, API 테스트, 정적 분석, 코드 리뷰(코드만 볼 때),
  브라우저가 필요 없는 백엔드 작업일 때.
---

# 브라우저 테스트

[agent-browser](https://github.com/vercel-labs/agent-browser)를 사용하여 웹 브라우저를 제어하고 UI를 테스트/검증한다.

## 사전 조건

```bash
# agent-browser 설치 확인
command -v agent-browser || echo "agent-browser 미설치"

# 설치 (npm)
npm install -g agent-browser
agent-browser install  # Chrome for Testing 다운로드

# 또는 npx로 즉시 실행
npx agent-browser open https://example.com
```

설치 확인 스크립트:
```bash
.claude/skills/browser-test/scripts/check-browser.sh
```

## 핵심 명령어

### 페이지 열기 및 탐색
```bash
agent-browser open <url>          # URL 열기
agent-browser back                # 뒤로 가기
agent-browser reload              # 새로고침
agent-browser get url             # 현재 URL
agent-browser get title           # 페이지 제목
```

### 접근성 트리 스냅샷 (AI 최적화)
```bash
agent-browser snapshot            # 전체 접근성 트리 (ref 포함)
agent-browser snapshot -i         # 상호작용 가능한 요소만
agent-browser snapshot -c         # 빈 요소 제거
agent-browser snapshot --json     # JSON 형식
```

스냅샷 출력 예시:
```
- button "Submit" [ref=e2]
- textbox "Email" [ref=e3]
- link "Home" [ref=e5]
```

### ref 기반 인터랙션
```bash
agent-browser click @e2           # ref로 클릭
agent-browser fill @e3 "text"     # ref로 입력
agent-browser hover @e5           # ref로 호버
```

### CSS 선택자 기반 인터랙션
```bash
agent-browser click "#submit-btn"
agent-browser fill "input[name=email]" "test@test.com"
agent-browser select "#country" "KR"
agent-browser check "#agree"
```

### 의미론적 선택자
```bash
agent-browser find role button click --name "Submit"
agent-browser find text "로그인" click
agent-browser find label "이메일" fill "test@test.com"
```

### 스크린샷
```bash
agent-browser screenshot result.png           # 현재 화면
agent-browser screenshot --full page.png      # 전체 페이지
agent-browser screenshot --annotate anno.png  # 요소 번호 표시
```

### 대기
```bash
agent-browser wait "#loading"                 # 요소 표시 대기
agent-browser wait --text "완료"              # 텍스트 출현 대기
agent-browser wait --load networkidle         # 네트워크 유휴 대기
agent-browser wait 2000                       # 2초 대기
```

### 정보 조회
```bash
agent-browser get text "#message"             # 텍스트 내용
agent-browser get value "#input-field"        # 입력값
agent-browser is visible "#modal"             # 가시성 확인
agent-browser console                         # 콘솔 메시지
agent-browser errors                          # 페이지 에러
```

## 테스트 워크플로우

### 1. E2E 시나리오 테스트

```bash
# 1. 페이지 열기
agent-browser --session qa-test open http://localhost:3000

# 2. 접근성 트리로 현재 상태 파악
agent-browser --session qa-test snapshot -i

# 3. 인터랙션 수행 (ref 기반)
agent-browser --session qa-test fill @e3 "user@example.com"
agent-browser --session qa-test fill @e4 "password123"
agent-browser --session qa-test click @e5

# 4. 결과 대기 및 확인
agent-browser --session qa-test wait --text "대시보드"
agent-browser --session qa-test screenshot test-result.png

# 5. 검증
agent-browser --session qa-test get text "#welcome-message"
```

### 2. 구현 결과 시각적 확인

```bash
# 개발 서버에서 구현 결과 확인
agent-browser open http://localhost:3000/new-page
agent-browser snapshot -i
agent-browser screenshot implementation.png

# 반응형 검증
agent-browser --viewport 375 812 open http://localhost:3000/new-page
agent-browser screenshot mobile.png

agent-browser --viewport 768 1024 open http://localhost:3000/new-page
agent-browser screenshot tablet.png

agent-browser --viewport 1920 1080 open http://localhost:3000/new-page
agent-browser screenshot desktop.png
```

### 3. UI 변경 검증

```bash
# PR의 프리뷰 환경 확인
agent-browser open https://preview-pr-123.app.com
agent-browser snapshot -i
agent-browser screenshot pr-review.png
```

### 4. 접근성 감사

```bash
# 접근성 트리 전체 분석
agent-browser open http://localhost:3000
agent-browser snapshot --json > accessibility-tree.json

# 상호작용 요소의 접근성 확인
agent-browser snapshot -i --json

# 검증 포인트:
# - 모든 이미지에 alt 텍스트가 있는가
# - 폼 요소에 label이 연결되어 있는가
# - 버튼/링크에 의미 있는 텍스트가 있는가
# - 키보드 내비게이션이 가능한가
```

### 5. React SSR Hydration 검증

SSR 앱에서 서버/클라이언트 렌더링 불일치(hydration mismatch)를 감지한다.

```bash
# 1. 페이지 열기 — hydration이 완료될 때까지 대기
agent-browser open http://localhost:3000
agent-browser wait --load networkidle

# 2. 콘솔에서 hydration 에러 패턴 감지
agent-browser console
# 확인할 패턴:
#   - "Hydration failed"
#   - "Text content does not match"
#   - "Did not expect server HTML to contain"
#   - "There was an error while hydrating"
#   - "An error occurred during hydration"

# 3. 에러 확인
agent-browser errors
```

**hydration mismatch 발생 원인 (주의 패턴)**:
- `new Date()`, `Date.now()` — 렌더 함수에서 직접 호출 금지, `useEffect` 내에서만 사용
- `Math.random()` — 서버/클라이언트 결과가 다름
- `window`, `document`, `localStorage` — 서버에 존재하지 않는 API
- 브라우저 확장 프로그램이 주입하는 DOM 요소

### 6. XSS 동적 테스트

```bash
# 입력 필드에 XSS 페이로드 주입
agent-browser open http://localhost:3000/form
agent-browser fill "#search" "<script>alert('xss')</script>"
agent-browser click "#submit"
agent-browser wait --load networkidle

# 콘솔/에러 확인
agent-browser console
agent-browser errors
agent-browser get html "#result"
```

## 세션 관리

```bash
# 에이전트별 격리된 세션 사용
agent-browser --session qa-agent open https://app.com
agent-browser --session fe-dev open http://localhost:3000

# 세션 목록
agent-browser session list
```

## 보안 규칙 (필수)

### 도메인 제한
에이전트가 접속할 수 있는 도메인을 반드시 제한한다:
```bash
# 허용 도메인만 접근 (프로젝트별 설정)
agent-browser --allowed-domains "localhost,*.preview.app.com" open <url>
```

### 금지 사항
- **프로덕션 URL 직접 접근 금지** — 반드시 프리뷰/스테이징 환경만 사용
- **인증 정보 하드코딩 금지** — `agent-browser auth vault` 사용
- **결제/삭제 등 파괴적 액션 금지** — `--confirm-actions "submit,delete"` 사용
- **호스트 네트워크의 내부 서비스 접근 금지** — SSRF 방지

### 에이전트별 세션 격리
```bash
# 각 에이전트는 독립 세션을 사용한다
agent-browser --session ${AGENT_NAME}-${TASK_NUMBER} open <url>
```

### 인증 관리
```bash
# 인증 정보는 암호화 저장
agent-browser auth save staging --url https://staging.app.com/login

# 사용 시
agent-browser auth login staging
```

## 알려진 제한 및 Playwright 폴백

아래 상황에서는 Playwright로 전환한다:

| 상황 | agent-browser 증상 | Playwright 해결 |
|------|-------------------|----------------|
| 동적 마운트 컴포넌트 | `click` 후 상태 변화 없음 | auto-waiting으로 마운트 대기 후 클릭 |
| React controlled input | `fill` 후 state 미갱신 | input/change 이벤트 순차 발생 |
| form submit | `click` 후 서버에 요청 미도달 | 정상적 form submission 이벤트 체인 |

**폴백 판단 기준**: agent-browser로 액션 수행 후 `snapshot`으로 결과를 확인했을 때 상태 변화가 없으면 Playwright로 재시도한다.

## 규칙

- `agent-browser`가 설치되어 있지 않으면 스킬 사용 전 설치를 안내한다
- 브라우저 액션 전 반드시 `snapshot`으로 현재 상태를 파악한다
- 클릭/입력 후 `wait`로 결과를 대기한 뒤 검증한다
- 스크린샷은 의미 있는 파일명을 사용한다 (예: `login-success.png`)
- SSR 앱(Next.js, Nuxt 등)은 반드시 hydration 검증을 수행한다
- 보안 규칙을 반드시 준수한다
- 테스트 결과는 PR 코멘트 또는 이슈에 보고한다
