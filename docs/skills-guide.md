# 스킬 사용 가이드

## 스킬 목록

| 스킬 | 용도 |
|------|------|
| `create-issue` | GitHub 이슈 생성 + 라벨 할당 |
| `create-pr` | PR 생성 + 리뷰 요청 |
| `run-tests` | 테스트 자동 감지 + 실행 |
| `cross-validate` | Gemini CLI 교차검증 (설계/코드/스킬/구조) |
| `browser-test` | agent-browser 기반 E2E/시각적 검증 |

## 자주 묻는 질문

### 이슈 생성 시 라벨을 빠뜨렸어요
```bash
gh issue edit <번호> --add-label "status:todo,priority:medium"
```

### PR 제목에 이슈 번호를 빠뜨렸어요
```bash
gh pr edit <번호> --title "[#이슈번호] 변경 설명"
```

### 새 스킬을 추가하고 싶어요
```
1. mkdir -p .claude/skills/<스킬명>
2. SKILL.md 작성 (frontmatter: name, description)
3. description에 TRIGGER when / DO NOT TRIGGER when 패턴 포함
```

## 일반적 함정

- **PR 범위 초과**: PR당 변경 파일 10개 이하 유지. 넘으면 분할.
- **교차검증 남용**: Gemini API 429 제한이 있으므로 핵심 의사결정에만 사용.
