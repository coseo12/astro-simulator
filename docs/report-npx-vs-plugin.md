# 교차검증 보고서: npx 템플릿 vs 플러그인 형태 전환

> 검증 일시: 2026-03-27
> 검증 유형: architecture (아키텍처 설계 검증)
> 검증 모델: Claude Opus 4.6 + Gemini 2.5 Flash/Pro
> 상태: **기술 검증 완료 → 최종 권장안 확정**

---

## 1. 검증 대상

`@seo/harness-setting` 패키지의 배포/사용 방식 전환 검토:
- **현재**: `npx @seo/harness-setting init` → 파일 복사 (템플릿 방식)
- **검토**: 플러그인 형태로 전환 (파일 복사 없이 참조)

---

## 2. 현재 npx 방식의 장단점

### 장점

| 항목 | 설명 |
|------|------|
| **완전한 자율성** | 복사된 파일을 자유롭게 수정 가능 |
| **투명성** | 모든 로직이 프로젝트 내 파일로 존재 |
| **독립성** | init 이후 원본 패키지에 대한 런타임 의존성 없음 |
| **간단한 시작** | 단일 명령으로 모든 설정 완료 |

### 단점

| 항목 | 설명 | 심각도 |
|------|------|--------|
| **업데이트 지옥** | 원본 템플릿 개선 시 기존 프로젝트에 자동 반영 불가 | 높음 |
| **버전 추적 불가** | 복사된 파일이 어떤 버전의 스냅샷인지 알 수 없음 | 중간 |
| **프로젝트 비대화** | 수십 개의 인프라 파일이 비즈니스 코드와 혼재 | 중간 |
| **생태계 파편화** | 사용자별 수정이 중앙으로 환류되기 어려움 | 낮음 |

> **Claude & Gemini 합의**: "업데이트 지옥"이 가장 치명적인 문제.

---

## 3. 실제 테스트 결과 (Phase 1 완료)

### 방식별 테스트 매트릭스

| # | 방식 | 결과 | 비고 |
|---|------|------|------|
| 1 | `--plugin-dir`로 플러그인만 사용 (빈 프로젝트) | ✅ 성공 | 15에이전트 + 15스킬 로드. 네임스페이스: `harness-setting:xxx` |
| 2 | `settings.json` `plugins` 필드 | ❌ 실패 | 필드 미지원 |
| 3 | `settings.json` `pluginDirs` 필드 | ❌ 실패 | 필드 미지원 |
| 4 | 로컬 에이전트 + 플러그인 에이전트 공존 | ✅ 성공 | 로컬 `pm` + `harness-setting:pm` 동시 존재 |
| 5 | symlink (node_modules → .claude/) | ✅ 성공 | 네임스페이스 없이 15개 에이전트 로드 |
| 6 | `plugin install` (로컬 경로 직접) | ❌ 실패 | 마켓플레이스 등록 필수 |
| 7 | `enabledPlugins` settings.json 수동 편집 | ❌ 실패 | `plugin install` 명령으로만 동작 |
| 8 | 로컬 마켓플레이스 등록 → `plugin install` | ✅ 성공 | `marketplace.json` 작성 후 등록, 설치 정상 |
| 9 | `plugin install` 후 자동 로드 (--plugin-dir 불필요) | ✅ 성공 | `enabledPlugins`가 settings.json에 자동 추가 |
| 10 | `plugin install` + 로컬 `.claude/agents/` 공존 | ✅ 성공 | 로컬 15 + 플러그인 15 = 30개 동시 공존 |

### 핵심 발견

#### 1. 네임스페이스 자동 분리
```
로컬:     orchestrator, create-pr, pm
플러그인:  harness-setting:orchestrator, harness-setting:create-pr, harness-setting:pm
```
- 같은 이름이라도 네임스페이스가 달라 **충돌 없이 공존**

#### 2. 플러그인 설치 메커니즘
```bash
# 1단계: 마켓플레이스 등록
claude plugin marketplace add <경로 또는 GitHub URL>

# 2단계: 플러그인 설치
claude plugin install harness-setting --scope project

# 결과: settings.json에 자동 추가
# { "enabledPlugins": { "harness-setting@marketplace-name": true } }
```

#### 3. 플러그인 유효성 검증 도구
```bash
claude plugin validate <플러그인 경로>
```
- `.claude-plugin/plugin.json` 스키마 검증
- 에이전트/스킬 frontmatter 검증
- 경고/에러 레벨 구분

#### 4. 플러그인 구조 (검증 완료)
```
harness-setting/
├── .claude-plugin/
│   └── plugin.json          # 필수: name, version, description, author(객체)
├── agents/                  # 에이전트 (frontmatter 필수: name, description)
│   ├── orchestrator.md
│   ├── planner.md
│   └── ... (15개)
├── skills/                  # 스킬
│   ├── create-pr/SKILL.md
│   ├── review-pr/SKILL.md
│   └── ... (15개)
├── commands/                # 슬래시 커맨드 (선택)
└── .mcp.json               # MCP 서버 (선택)
```

#### 5. 마켓플레이스 배포 구조 (검증 완료)
```json
// marketplace.json
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "harness-marketplace",
  "description": "...",
  "owner": { "name": "seo", "email": "..." },
  "plugins": [
    {
      "name": "harness-setting",
      "description": "...",
      "source": "./plugins/harness-setting",  // 또는 git URL
      "category": "development"
    }
  ]
}
```

---

## 4. 3가지 유효한 배포 방식 비교

### A. 플러그인 전용 (마켓플레이스 배포)

```bash
# 사용자 설치
claude plugin marketplace add <GitHub URL>
claude plugin install harness-setting --scope project

# 에이전트 호출
subagent_type: "harness-setting:orchestrator"
```

| 장점 | 단점 |
|------|------|
| 공식 메커니즘. 생태계 표준 준수 | 네임스페이스 접두사 필요 (`harness-setting:xxx`) |
| `plugin update`로 원클릭 업데이트 | 기존 CLAUDE.md/스킬의 에이전트 참조 변경 필요 |
| 프로젝트에 파일 복사 없음 | 마켓플레이스 등록/관리 필요 |
| `enabledPlugins`로 자동 로드 | 오프라인 환경에서 초기 설치 제약 |

### B. Symlink 하이브리드 (npm + symlink)

```bash
# 사용자 설치
npm install --save-dev @seo/harness-setting
npx harness init  # symlink 생성

# 에이전트 호출 (기존과 동일)
subagent_type: "orchestrator"  # 네임스페이스 불필요
```

| 장점 | 단점 |
|------|------|
| 네임스페이스 없이 기존 호출 방식 유지 | 비공식적 방법 (로컬 디렉토리 활용) |
| `npm update`로 업데이트 | 향후 Claude Code 업데이트 시 호환성 위험 |
| 마이그레이션 비용 최소 | Windows symlink 이슈 가능 |

### C. 현재 방식 유지 + 플러그인 보조

```bash
# 설치 (기존과 동일)
npx @seo/harness-setting init  # 파일 복사

# 추가로 플러그인도 설치 가능
claude plugin install harness-setting --scope project
```

| 장점 | 단점 |
|------|------|
| 기존 사용자 영향 없음 | 두 배포 방식 동시 유지보수 |
| 점진적 전환 가능 | 같은 에이전트가 로컬+플러그인에 중복 존재 가능 |

---

## 5. Gemini 토론 결과

### 합의 사항

| 항목 | Claude 의견 | Gemini 의견 | 합의 |
|------|------------|------------|------|
| 장기 전략 | 플러그인 전용 (A) | 플러그인 전용 (A) 주력 | **A를 장기 목표로** |
| 단기 전략 | 검증 결과 기반 결정 | symlink(B)를 전환기 보조 | **B를 마이그레이션 경로로** |
| 마켓플레이스 | 자체 GitHub 먼저 | 자체 먼저 → 공식 나중 | **2단계 접근** |
| 네임스페이스 | 피할 수 없는 트레이드오프 | 명확한 문서화로 해결 | **문서화 + 마이그레이션 가이드** |

### 이견 및 해소

| 항목 | Gemini | Claude | 해소 |
|------|--------|--------|------|
| settings.json 경로 참조 | 가능하다 가정 (1차) | 불가능 (테스트 확인) | **실제 테스트로 해소** — 미지원 |
| MCP로 에이전트 제공 | 가능하다 암시 (1차) | 불가능 (테스트 확인) | **실제 테스트로 해소** — tools만 가능 |
| Eject 필요성 | 필수 | 필수 (단, 플러그인 방식에서는 로컬 복사로 대체 가능) | **플러그인 + 로컬 오버라이드로 eject 대체 가능** |

### Gemini 고유 기여

1. **마켓플레이스 2단계 전략**: 자체 GitHub 마켓플레이스로 빠른 반복 → 안정화 후 공식 등록
2. **혼용 시 경고 메시지 제안**: 설치 시 이름 충돌 에이전트 감지 후 안내
3. **에이전트 이름 설계 고려**: 보편적 이름(`pm`, `developer`) 대신 구체적 이름 검토 제안

---

## 6. 최종 권장안

### 전략: 플러그인 전용 + 자체 마켓플레이스 (단기) → 공식 마켓플레이스 (장기)

```
┌─────────────────────────────────────────────────────┐
│ 현재 (v1.x)                                         │
│   npx @seo/harness-setting init → 파일 복사          │
├─────────────────────────────────────────────────────┤
│ 전환기 (v2.0)                                       │
│   npx @seo/harness-setting init                     │
│   → devDependency 설치                              │
│   → 최소 파일 생성 (CLAUDE.md, settings.json, etc.)  │
│   → 자체 마켓플레이스에서 plugin install 자동 실행     │
│   → 에이전트/스킬은 플러그인에서 로드                  │
│                                                     │
│   [선택] harness eject <agent|skill> → 로컬 복사     │
├─────────────────────────────────────────────────────┤
│ 안정기 (v3.0)                                       │
│   claude plugin install harness-setting              │
│   → 공식 마켓플레이스에서 원클릭 설치                  │
│   → npx init은 부가 설정(CLAUDE.md, .harness/) 전용  │
└─────────────────────────────────────────────────────┘
```

### 구체적 실행 계획

#### Phase 1: 플러그인 구조 전환 ✅ (기술 검증 완료)

- [x] `--plugin-dir` 동작 확인
- [x] `.claude-plugin/plugin.json` 스펙 확인
- [x] 에이전트 frontmatter 요구사항 확인
- [x] 네임스페이스 분리 동작 확인
- [x] 로컬 + 플러그인 공존 확인
- [x] symlink 방식 동작 확인
- [x] 마켓플레이스 등록/설치 흐름 확인
- [x] `plugin validate` 유효성 검증 확인

#### Phase 2: 패키지 구조 전환

- [ ] 패키지 루트에 `.claude-plugin/plugin.json` 추가
- [ ] `.claude/agents/` → `agents/` 로 플러그인 규격 재배치 (또는 심볼릭 연결)
- [ ] `.claude/skills/` → `skills/` 로 플러그인 규격 재배치
- [ ] 모든 에이전트에 YAML frontmatter 추가 (`name`, `description`)
- [ ] `claude plugin validate` 통과 확인

#### Phase 3: 마켓플레이스 구축

- [ ] GitHub 저장소에 `marketplace.json` 생성
- [ ] `claude plugin marketplace add` 테스트
- [ ] `claude plugin install harness-setting --scope project` 테스트
- [ ] 설치 후 에이전트/스킬 자동 로드 확인

#### Phase 4: init 커맨드 재설계

- [ ] `harness init` → 최소 스캐폴딩 + `plugin install` 자동화
- [ ] 복사 대상: `CLAUDE.md`, `settings.json`, `.github/`, `.harness/`만
- [ ] 에이전트/스킬은 플러그인에서 자동 로드
- [ ] `harness eject <이름>` 명령 구현 (선택적 로컬 복사)

#### Phase 5: 문서 & 마이그레이션

- [ ] 기존 사용자용 마이그레이션 가이드
- [ ] `harness migrate` 명령 (기존 복사 → 플러그인 자동 전환)
- [ ] 네임스페이스 사용법 문서화
- [ ] 공식 마켓플레이스 PR 제출 준비

---

## 7. 주의사항

### 네임스페이스 영향

플러그인 방식 전환 시 모든 에이전트/스킬 참조에 `harness-setting:` 접두사가 필요:

```markdown
# 변경 전 (현재)
subagent_type: "orchestrator"
/create-pr

# 변경 후 (플러그인)
subagent_type: "harness-setting:orchestrator"
/harness-setting:create-pr
```

**영향 범위**: CLAUDE.md, 에이전트 간 호출, 스킬 트리거 — 모두 업데이트 필요

### 오버라이드 메커니즘

로컬 `.claude/agents/pm.md`가 있으면 `pm`으로 호출 시 로컬 우선.
플러그인의 `pm`은 `harness-setting:pm`으로만 접근 가능.

→ 이를 활용하면 **eject 없이도 로컬 파일 생성만으로 오버라이드 가능**

### 마켓플레이스 배포 경로

```
로컬 테스트: claude --plugin-dir ./
자체 배포:   claude plugin marketplace add <GitHub repo URL>
공식 배포:   anthropics/claude-plugins-official에 PR
```

---

## 8. 결론

| 판정 | 근거 |
|------|------|
| **전환 권장: 통과** | 플러그인 시스템이 안정적으로 동작하며, 혼용도 가능함이 실증됨 |

**핵심 결론**: npx 파일 복사와 플러그인 방식은 **완전히 혼용 가능**하다.
플러그인(네임스페이스 `harness-setting:xxx`)과 로컬 에이전트/스킬(네임스페이스 없음)이 동시에 존재할 수 있으며,
사용자는 필요에 따라 로컬 오버라이드로 플러그인 에이전트를 커스터마이징할 수 있다.

**권장 전환 경로**: 자체 GitHub 마켓플레이스에서 플러그인 배포를 시작하고,
`harness init`은 최소 스캐폴딩 + `plugin install`로 재설계한다.

---

> 이 보고서는 Claude Opus 4.6과 Gemini 2.5 Flash의 교차검증 및 10건의 실제 테스트를 통해 작성되었습니다.
