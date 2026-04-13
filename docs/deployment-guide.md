# 배포 가이드

## 1. 설치

### 방법 A: npx (권장)
```bash
npx @seo/harness-setting init ./my-project
cd my-project
```

### 방법 B: git clone
```bash
git clone https://github.com/coseo12/harness-setting.git ./my-project
cd my-project
```

### 방법 C: 플러그인
```bash
git clone https://github.com/coseo12/harness-setting.git .harness-plugin
claude --plugin-dir ./.harness-plugin
```

## 2. 초기 설정

### 필수 의존성 확인
```bash
# Claude Code CLI
command -v claude || echo "설치 필요: https://docs.anthropic.com/en/docs/claude-code"

# GitHub CLI
command -v gh || echo "설치 필요: https://cli.github.com/"

# GitHub 인증
gh auth status
```

### 선택 의존성
```bash
# Gemini CLI (교차검증용)
command -v gemini || echo "설치 필요: https://github.com/google-gemini/gemini-cli"

# agent-browser (브라우저 테스트용)
command -v agent-browser || echo "설치 필요: npm install -g agent-browser"
```

## 3. 구조

| 파일 | 역할 |
|------|------|
| `CLAUDE.md` | 워크플로우 규칙 + 실전 교훈 |
| `.claude/agents/developer.md` | 풀스택 구현 에이전트 |
| `.claude/skills/cross-validate/` | Gemini 교차검증 |
| `.claude/skills/browser-test/` | 브라우저 E2E 검증 |
| `.claude/skills/create-issue/` | 이슈 생성 |
| `.claude/skills/create-pr/` | PR 생성 |
| `.claude/skills/run-tests/` | 테스트 실행 |

## 4. 워크플로우

```
사용자 → Developer → 검증(CI + browser-test) → PR → Merge
                       ↑
              cross-validate (선택, Gemini 교차검증)
```

## 5. 커스터마이징

- **규칙 수정**: `CLAUDE.md` 편집
- **에이전트 수정**: `.claude/agents/developer.md` 편집
- **스킬 추가**: `.claude/skills/<스킬명>/SKILL.md` 형식으로 추가
