# Phase 3 실행 계획 — CLAUDE.md 실전 교훈 + 교차검증 섹션 추출

> **메타**: 본 문서는 [harness#199](https://github.com/coseo12/harness-setting/issues/199) Phase 3 의 **리서치/설계 산출물**이다. 실제 추출 실행은 별도 세션에서 본 계획을 근거로 수행한다. 본 PR 은 설계만 박제 (PATCH — 행동 변화 없음).
>
> **리서치 phase 분리 원칙**: Phase 1 지침 (`docs/guides/claudemd-governance.md` §7.4) 에 따라 "조사 → 설계 → 이동 → 참조 업데이트" 직렬 배치. 본 문서는 전 2단계 결과.

---

## 1. 현 상태 (2026-04-21 기준)

- `CLAUDE.md`: **43,305 chars** / 531 lines — 40k PR warn 구간
- 목표: **35,000 chars 이하** 복귀 (여유 확보, 경계 경보 해소)
- 필요 감축: 약 **8,305 chars** (19%)

### 섹션별 bytes (상위)
| 섹션 | bytes | 비중 |
|---|---|---|
| 실전 교훈 (164~359) | 29,105 | 42% |
| 교차검증 (360~435) | 14,939 | 21% |
| 원칙 (436~531) | 10,321 | 15% |

### 실전 교훈 블록 목록 (17개 — CLAUDE.md 실측)
| 블록 | bytes | 외부 참조 (파일 수) | 추출 티어 |
|---|---:|---:|---|
| sub-agent 검증 완료 ≠ GitHub 박제 완료 | 5,642 | **10** | Tier 1 |
| 매니페스트 최신 ≠ 파일 적용 완료 | 3,711 | 5 | Tier 1 |
| 다운스트림 실측이 최종 가드 | 2,553 | 1 | **Tier 2 (#195 흡수)** |
| workflow_dispatch 2단계 함정 | 2,296 | 0 | Tier 2 |
| 주석 계약 vs 구현 drift | 2,175 | 1 | Tier 2 |
| CI 통과 ≠ 테스트 실행 | 1,748 | 0 | **Tier 2** |
| 신규 데이터 ≠ 신규 코드 — ADR 예측 재현 | 1,710 | 0 | Tier 2 |
| headless 브라우저 검증 ≠ 실 브라우저 동작 | 1,704 | 0 | Tier 2 |
| sub-agent multi-turn 라운드 이탈 | 1,533 | 0 | Tier 2 |
| 인계 항목 실측 재검증 — NO-OP ADR | 914 | 2 | Tier 3 (유지) |
| 신규 함수 ≠ 신규 구현 | 885 | 0 | Tier 3 (유지) |
| 다운스트림 harness update 부합성 | 753 | 0 | **Tier 2 (기존 docs/harness-update-compat-checklist.md 링크 통합)** |
| 커밋 성공 ≠ 의도한 변경 커밋됨 | 723 | 0 | Tier 3 (유지) |
| 빌드 성공 ≠ 동작하는 앱 | 563 | 0 | Tier 3 (유지) |
| display-only 버그 패턴 | 287 | 0 | Tier 3 (유지) |
| HTTP 200 ≠ 올바른 리소스 | 249 | 0 | Tier 3 (유지) |
| 프로젝트 재구축 시 주의 | 136 | 0 | Tier 3 (유지) |

**참조 조사 근거** (2026-04-21 실측):
- `sub-agent 검증 완료` — `.claude/agents/{architect,developer,pm,qa,reviewer}.md` / `scripts/verify-agent-ssot.sh` / `.github/workflows/ci.yml` / `.github/PULL_REQUEST_TEMPLATE.md` / `docs/guides/claudemd-governance.md` / `CHANGELOG.md` = **10 파일**
- `drift 감지` (브랜치 전략 하위) — 8 파일 참조 (본 Phase 3 범위 외)
- `cross-validate / 교차검증` 키워드 — 26 파일 / 178 occurrences (대부분 일반 키워드 사용, 섹션 앵커 참조는 일부)

---

## 2. 티어 분류 원리

### Tier 1 — SSoT 결합 복잡, 단독 PR 권고
- **외부 참조 3+ 파일** 또는 **CLAUDE.md 공통 SSoT (JSON 스키마 등) 포함**
- 추출 시 다수 파일 참조 링크 / 스크립트 주석 / 문서 앵커 동시 업데이트 필요
- 리스크: 에이전트 동작 회귀 가능성 → 스모크 테스트 필수

### Tier 2 — 결합 낮음, 번들 추출 가능
- **외부 참조 0~2 파일**
- 독립 추출 가능. 단일 PR 에 2~5 블록 번들
- Phase 3-A 대상

### Tier 3 — 소규모 또는 본문 유지
- **< 1,000 bytes** + 각인 가치 있음 (짧은 원칙/경고)
- 추출 비용 > 감축 이득. 본문 유지
- 일부는 티어 2 블록과 논리적 결합 시 함께 이동 검토

---

## 3. Phase 3 분할 계획

### Phase 3-A — Tier 2 번들 추출 + #195/#194 흡수 (우선)

**추출 대상**:
| 소스 블록 (CLAUDE.md) | bytes | 이동 대상 파일 |
|---|---:|---|
| CI 통과 ≠ 테스트 실행 + 다운스트림 실측이 최종 가드 | 4,301 | `docs/lessons/ci-and-downstream-verification.md` (+ #195 라벨 규약 반영) |
| workflow_dispatch 2단계 함정 | 2,296 | `docs/lessons/workflow-dispatch-pitfalls.md` |
| 주석 계약 vs 구현 drift | 2,175 | `docs/lessons/comment-implementation-drift.md` |
| 신규 데이터 ≠ 신규 코드 | 1,710 | `docs/lessons/data-not-code-extension.md` |
| headless 브라우저 검증 | 1,704 | `docs/lessons/headless-browser-verification.md` |
| sub-agent multi-turn 라운드 이탈 | 1,533 | `docs/lessons/sub-agent-multiturn-drift.md` |
| 다운스트림 harness update 부합성 | 753 | **기존 `docs/harness-update-compat-checklist.md` 로 링크 통합** (신규 파일 생성 금지, CLAUDE.md 는 기존 파일 포인터 1줄로 축약) |
| **교차검증 섹션 전체** | 14,939 | `docs/guides/cross-validate-protocol.md` (+ #194 flag 가드 템플릿 반영) |

**CLAUDE.md 본문 치환 포맷** (각 블록):
```markdown
### <원래 제목>
- <원칙 1~3 줄>
- 상세: [docs/lessons/<kebab>.md](docs/lessons/<kebab>.md)
```

**예상 감축**: 약 **27,700 chars** 추출 → 본문 포인터 800 chars 복귀 → 순감 **26,900 chars**
**Phase 3-A 후 예상 size**: 43,305 − 26,900 = **약 16,400 chars** (목표 35k 훨씬 이하)

**완료 기준**:
- [ ] `docs/lessons/` 디렉토리 신설 + 6 파일 (`harness update 부합성` 은 신규 파일 생성 없이 기존 `docs/harness-update-compat-checklist.md` 로 링크 통합)
- [ ] `docs/guides/cross-validate-protocol.md` 생성 + #194 템플릿 반영
- [ ] `docs/lessons/ci-and-downstream-verification.md` 에 #195 실측/가정 라벨 규약 반영
- [ ] CLAUDE.md 본문 Tier 2 블록 8 개 → 포인터 치환 (7 블록 → `docs/lessons/` + 1 블록 → 기존 `docs/harness-update-compat-checklist.md`) + 교차검증 섹션 → `docs/guides/cross-validate-protocol.md`
- [ ] `bash scripts/verify-docs-links.sh` 통과 (Phase 2 신규 가드)
- [ ] `bash scripts/verify-claudemd-size.sh` 통과 (예산 여유 확인)
- [ ] `bash scripts/verify-agent-ssot.sh` 통과
- [ ] 한글 U+FFFD 검증
- [ ] step 0 사전 조사 결과 PR 본문 상단 박제

**릴리스 분류**: **MINOR** (#195 라벨 규약 추가 = 행동 변화, #194 는 PATCH 이나 결합 시 MINOR 따라감)

**auto-close**:
- `Closes #195` — #195 라벨 규약이 실제 파일에 반영됨
- `Closes #194` — #194 flag 가드 템플릿이 실제 파일에 반영됨
- `Closes #199` — Phase 3 완결 (Phase 3-B 가 필요하지 않을 수 있음, 아래 참조)

### Phase 3-B — Tier 1 블록 추출 (선택)

Phase 3-A 만으로 목표 (35k 이하) 달성 가능 → **Phase 3-B 는 선택 사항**.

**대상** (필요 시):
- `sub-agent 검증 완료` (5,642 bytes, 10 파일 참조) → `docs/lessons/sub-agent-github-docket.md`
- `매니페스트 최신 ≠ 파일 적용` (3,711 bytes, 5 파일 참조) → `docs/lessons/manifest-apply-atomicity.md`

**판단 기준**:
- Phase 3-A 완료 후 CLAUDE.md 재측정
- 16k chars 수준이면 Phase 3-B 는 불필요 (각인층 유지가 오히려 가치)
- 만약 `sub-agent 검증 완료` 의 공통 JSON 스키마 SSoT 가 각인층 아닌 참조층 으로 이동해도 안전한지 **별도 cross-validate architecture** 선행 — 단일 판단 금지

---

## 4. 파일명 규칙

- **위치**: `docs/lessons/<kebab>.md` (신설 디렉토리)
- **파일명 규칙**: kebab-case, CLAUDE.md 원칙의 파일명 규칙 준수
- **관련 기존 디렉토리**: `docs/architecture/` (설계 지식), `docs/decisions/` (ADR), `docs/plans/` (계획). `docs/lessons/` 는 실전 교훈 전용
- **가이드**: `docs/guides/cross-validate-protocol.md` — 프로토콜/매트릭스 상세 문서 (기존 `docs/guides/claudemd-governance.md` 와 동일 계층)

---

## 5. 블록 포맷 템플릿

각 `docs/lessons/*.md` 파일은 아래 구조를 따른다:

```markdown
# <원래 블록 제목 전체>

> **요지**: CLAUDE.md `### <제목>` 블록의 상세 전문. 본문 요약은 CLAUDE.md 참조.
>
> **근거**: harness #<PR 번호> Phase 3-A 에서 추출.

## <원래 하위 불릿을 섹션으로 재구성>

- <기존 CLAUDE.md 블록의 내용 그대로>
- (대규모 재작성 금지 — 추출은 리팩토링이 아님)

## 근거
- volt [#N](링크) — ...
- harness [#M](링크) — ...

## 재검토 조건
- (가능한 경우) 트리거 조건 / 기간 / 임계 명시
```

---

## 6. 참조 업데이트 체크리스트 (Phase 3-A 실행 시)

### 6.1 사전 확인 (Phase 3-A step 0 — 실행 직전 필수)

Phase 1 지침 §7.3 "SSoT 결합 체크리스트" 는 "감축 대상 블록을 선정하기 **전에** 참조 depth 전수 조사" 를 요구. 본 설계 PR 은 Tier 2 블록의 **키워드 참조** 조사만 수행했고, **정확한 섹션 앵커 참조는 실행 PR 직전 재확인** 단계로 지연.

Phase 3-A 실행 시 step 0 으로 다음 명령 전수 실행 + 결과를 실행 PR 본문에 박제:

```bash
# 각 Tier 2 블록 제목을 인수로 순회
for block in "CI 통과" "다운스트림 실측" "workflow_dispatch" "주석 계약" "신규 데이터" "headless 브라우저 검증" "sub-agent multi-turn" "다운스트림 harness update 부합성"; do
  echo "=== ${block} ==="
  rg -n "${block}" .claude/ scripts/ docs/ test/ .github/ --iglob '!CLAUDE.md'
done
```

- **키워드 매치 0건** → 해당 블록은 본문 포인터만 치환, 외부 참조 업데이트 불필요
- **키워드 매치 1+ 건** → 파일별 실제 사용 맥락 확인 (단순 이름 사용 vs 섹션 링크). 섹션 링크면 `docs/lessons/*.md` 경로로 치환

### 6.2 Phase 3-A 에서 참조 업데이트 확정 대상 (현재까지 확인됨)
- `scripts/verify-*.sh` 주석 — 본 리서치 기준 sub-agent 검증 = Tier 1 만 해당. Tier 2 에는 영향 없음
- `docs/guides/claudemd-governance.md` §7.1 — 현재 확인된 결합 중 `sub-agent 검증 완료` 만 명시. Phase 3-A 는 이 블록 유지 → 문서 수정 불필요
- `CHANGELOG.md` — Phase 3-A release 시 Behavior Changes 섹션에 #195 라벨 규약 + Tier 2 블록 이동 기록

### 6.3 교차검증 섹션 추출 특이사항
- **`### 교차검증` 섹션은 `## 교차검증` 의 상위 레벨** — 실제 섹션은 `## 교차검증 (cross-validate)` 하나뿐, `### ` 서브헤더 없음
- 추출 시 CLAUDE.md 는 `## 교차검증` 을 다음 포맷으로 치환:

```markdown
## 교차검증 (cross-validate)
정답이 없는 의사결정에서 Gemini의 두 번째 시각을 활용한다.
- Gemini 실패 시 Claude 단독 분석 전환 (API 429 fallback 프로토콜)
- 박제 후 Claude 가 재분석 (맹목 수용 금지)
- 상세: [docs/guides/cross-validate-protocol.md](docs/guides/cross-validate-protocol.md)
```

- 26 파일에서 `cross-validate` 키워드가 등장하나 대부분 **일반 키워드** (스킬명/파일명 등). CLAUDE.md 섹션 링크는 거의 없음 — Phase 3-A 실행 시 `grep -rn "CLAUDE.md.*교차검증"` 으로 정확 참조만 추출

---

## 7. 실행 순서 (Phase 3-A PR)

0. **사전 조사 (필수, §6.1)** — Tier 2 블록 제목별 `rg` 전수 조사 + 결과를 PR 본문 상단에 박제. 키워드 매치 0건 확인 후 단순 치환, 1+ 건은 파일별 맥락 분석
1. **리서치 재확인** — 본 계획 기준으로 추출 대상 재측정 (bytes drift 가능성, 중간에 CLAUDE.md 수정됐을 수 있음)
2. **`docs/lessons/` 디렉토리 신설**
3. **블록 단위 커밋** — 각 블록을 1 커밋으로 분리 (회귀 원인 추적 용이):
   - Tier 2 블록 7개 → 7 커밋
   - 교차검증 섹션 → 1 커밋
   - CLAUDE.md 본문 포인터 치환 → 1 커밋 (또는 블록별 동반 커밋)
4. **참조 업데이트 커밋** — 체크리스트 §6 대상 파일 일괄 갱신
5. **검증 커밋**:
   - `bash scripts/verify-docs-links.sh`
   - `bash scripts/verify-claudemd-size.sh`
   - `bash scripts/verify-agent-ssot.sh`
   - `npm test`
6. **PR 생성** — `Closes #195`, `Closes #194`, `Closes #199`
7. **reviewer / qa / 머지 승인**
8. **cross-validate code** — 감축 PR 특성상 diff 가 크므로 Gemini 검증 필수 (capacity 부족 시 reminder 이슈 박제)

---

## 8. 리스크 + 완화

| 리스크 | 완화 |
|---|---|
| 교차검증 섹션 추출 시 볼트/harness 이슈 링크 대량 재작성 필요 | 원본 링크 그대로 docs/guides/ 로 이동, CLAUDE.md 는 최소 요약만 |
| #195 라벨 규약을 docs/lessons/ci-and-downstream-verification.md 에 반영할 때 원 이슈 제안 문법 drift | 이슈 본문 그대로 인용 (제안된 블록 형식 + 박제 문턱 공식) |
| Phase 3-A PR diff 크기 (27k+ 추출 + 본문 치환) → 리뷰 난이도 | 블록 단위 커밋 → reviewer 가 커밋별 review 가능 |
| 추출 후 CLAUDE.md 가이드 링크 (Phase 1 §7.1) 의 "sub-agent 검증 완료" 명시가 Tier 1 미추출 시 여전히 유효 | Phase 3-A 에서 가이드 §7.1 수정 불필요 (sub-agent 블록 유지 전제) |
| `docs/harness-update-compat-checklist.md` 기존 파일과 이동 대상 충돌 | 기존 파일은 이동이 아닌 **링크 통합** — CLAUDE.md 블록이 해당 파일을 포인터로 참조 (추출 단계 자체는 불필요, 본문 1줄 축약만) |

---

## 9. 다음 세션 진입 프롬프트 (템플릿)

다음 세션 시작 시 아래 프롬프트로 Phase 3-A 착수:

```
harness #199 Phase 3-A — 실전 교훈 Tier 2 블록 + 교차검증 섹션 추출.

선독 필수:
- docs/plans/phase3-extraction-plan.md — 설계 계획 (전체 선독)
- docs/guides/claudemd-governance.md §5 (가지치기) + §7.3 (SSoT 결합 체크리스트)
- Phase 2 강제 도구: scripts/verify-claudemd-size.sh / verify-docs-links.sh

작업:
1. feature/199-phase3-extraction-a 브랜치를 develop 에서 분기
2. **step 0 (설계 §7 step 0)** — Tier 2 블록 제목별 rg 전수 조사 + 결과 PR 본문 상단 박제
3. 설계 계획 §3 Phase 3-A 완료 기준을 순서대로 구현
4. 블록 단위 커밋 + 참조 업데이트 커밋 분리
5. 커밋 메시지/PR 본문에 `Closes #195`, `Closes #194`, `Closes #199` **각 keyword 반복 문법** 준수
6. cross-validate code 실행 (Gemini capacity 부족 시 reminder 이슈 박제)
7. reviewer/qa → 머지 승인 요청

목표: CLAUDE.md 35,000 chars 이하로 복귀.
```

---

## 10. 스프린트 계약 재조정 조건

- 실행 중 추출 대상 블록이 각인 가치로 판명되면 해당 블록을 Tier 2 → Tier 3 (유지) 로 재분류 + ADR 박제 (가이드 §6.2 예외 ADR 템플릿)
- Phase 3-A PR 크기가 감당 불가하면 Tier 2 를 "Tier 2a (독립 블록 6개)" + "Tier 2b (교차검증 섹션 단독)" 로 재분할
- 추출 후 에이전트 sub-agent 호출 스모크에서 회귀 감지 시 즉시 롤백 + 별도 이슈 분리

---

## 부록 A — 실전 교훈 섹션 line 매핑 (2026-04-21 기준)

| line | 블록 제목 |
|---:|---|
| 164 | `## 실전 교훈` (섹션 시작) |
| 168 | `### 빌드 성공 ≠ 동작하는 앱` |
| 178 | `### CI 통과 ≠ 테스트 실행` |
| 190 | `### 다운스트림 harness update 부합성 사전 체크리스트` |
| 197 | `### 다운스트림 실측이 최종 가드 — upstream 3중 방어 blindspot` |
| 209 | `### workflow_dispatch 2단계 함정 (GitHub Actions)` |
| 228 | `### 주석 계약 vs 구현 drift — 버그 생성원` |
| 237 | `### HTTP 200 ≠ 올바른 리소스` |
| 242 | `### display-only 버그 패턴` |
| 248 | `### 프로젝트 재구축 시 주의` |
| 252 | `### 인계 항목 실측 재검증 — NO-OP ADR 패턴` |
| 261 | `### 신규 함수 ≠ 신규 구현` |
| 269 | `### 신규 데이터 ≠ 신규 코드 — ADR 예측 재현` |
| 279 | `### 커밋 성공 ≠ 의도한 변경 커밋됨` |
| 287 | `### 매니페스트 최신 ≠ 파일 적용 완료 — 부분 실패 교착 복구` |
| 306 | `### sub-agent 검증 완료 ≠ GitHub 박제 완료` |
| 340 | `### sub-agent multi-turn 라운드 이탈 — 매트릭스 일관성 검증` |
| 348 | `### headless 브라우저 검증 ≠ 실 브라우저 동작` |
| 360 | `## 교차검증 (cross-validate)` (다음 섹션 시작) |

> 실행 시 line 번호는 변경될 수 있음. 블록 제목 기반 `Grep` 으로 재확인.
