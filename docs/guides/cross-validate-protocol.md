# 교차검증 (cross-validate) 프로토콜

> **요지**: CLAUDE.md `## 교차검증 (cross-validate)` 섹션의 상세 프로토콜 + 편향 체크리스트 + 검증 필수도 매트릭스. CLAUDE.md 본문은 요약 포인터만 유지.
>
> **근거**: harness [#199](https://github.com/coseo12/harness-setting/issues/199) Phase 3-A 에서 추출 + [#194](https://github.com/coseo12/harness-setting/issues/194) flag 가드 검증 명령 템플릿 흡수.

---

## 1. 개요

정답이 없는 의사결정에서 Gemini 의 두 번째 시각을 활용한다.

- Gemini 실패 시 스킵하고 "Claude 단독 분석" 을 명시한다
- 경량 모델 폴백은 하지 않는다 — 교차검증의 가치는 깊은 분석에 있다

## 2. API capacity 소진 (429) 폴백 프로토콜

첫 429 응답 시 즉시 Claude 단독으로 내려가지 말고 단계적으로 처리:

### 2.1 단계별 처리

1. `gemini -p "hello"` 로 capacity 체크 후 본 검증 1회 **지연 재시도** (연속 429 는 대개 수초~수분 단위로 해소됨)
2. 2차 시도도 429/timeout 이면 Claude 단독 분석으로 전환. 단, **"claude-only analysis completed — 단일 모델 편향 노출 미확보"** 를 결과 박제에 명시 기록. 박제 위치는 컨텍스트별 1:1:
   - **PR 리뷰 맥락** → 원 PR 에 코멘트 한 줄 추가
   - **ADR 생성 맥락** → 해당 ADR 의 `## 결과·재검토 조건` 섹션에 각주
   - **릴리스 박제 맥락** (MINOR 이상 `Behavior Changes` 직후) → CHANGELOG `### Notes` 에 한 줄
   - **CRITICAL DIRECTIVE 개정** → CLAUDE.md 개정 커밋 메시지에 각주

   **여러 컨텍스트가 겹치면** (예: CRITICAL 개정 + PR 리뷰 + MINOR 릴리스) 영구성 우선순위로 1개소에만 기록: **CHANGELOG Notes > ADR 각주 > 커밋 메시지 > PR 코멘트**. 중복 기록은 하지 않는다. 누락 시 "cross-validate 루틴 불이행" 으로 오인
3. **노출 효율 최대 타이밍** 이었다면 **reminder 이슈로 박제**. 최대 타이밍은 다음 4개 앵커 중 하나에 해당할 때:
   - **CRITICAL DIRECTIVE 개정** — 세션 초기 각인 규칙이 추가·변경됨
   - **ADR 신규 생성 및 중대한 개정/폐기** — 코어 기술/아키텍처 결정이 박제되거나 기존 합의가 역전됨 (신규 못지않게 개정/폐기도 노출 효율 최대)
   - **MINOR 이상 릴리스의 `### Behavior Changes`** — 에이전트 행동 규칙이 추가·변경됨 (PATCH 는 제외)
   - **프로젝트 원칙·철학 선언** — ADR 보다 추상도 높은 상위 원칙 (예: "Fact-First / Visual-Second", "Correctness-First / Performance-Second") 을 박제할 때. 단일 모델 편향이 원칙 수준에서 특히 강하게 작용 (볼트 [#55](https://github.com/coseo12/volt/issues/55) 에서 Gemini 고유 발견 6종을 원칙 선언 직후 교차검증으로 끌어낸 실증). **식별 질문 3개** (모두 yes 여야 본 앵커 해당 — 일반 ADR·릴리스 Notes 와 구분):
     1. "**프로젝트 전반 의사결정의 tie-breaker** 역할을 하는가?" — 여러 ADR·기능 결정이 상충할 때 이 원칙이 판정 기준이 되는가 (특정 모듈에만 적용되면 ADR 수준, 전반 tie-breaker 여야 원칙 수준)
     2. "**'~First / ~Second' / '~First / ~Preferred'** 같은 우선순위 선언 형태 또는 유사한 **명제형 슬로건** 인가?" — 구현 방법이 아니라 가치 판단의 우선순위
     3. "이 선언 때문에 **기존 ADR 일부를 재평가/소급 적용** 해야 하는가?" — 신규 ADR 과 달리 원칙은 과거 결정에도 소급적 영향

   reminder 이슈 제목 예시 `[#<원 PR 번호>] cross-validate 재시도 — Gemini capacity 복구 후`. 본문에 원 PR/ADR 링크 + 재시도 시 확인할 범주(범주 오류 / 암묵 전제 / 비목표 대조) 명시. API 복구 후 close 또는 재검증 결과 반영

### 2.2 스크립트 레벨 강제 (v2.18.0~)

[.claude/skills/cross-validate/scripts/cross_validate.sh](../../.claude/skills/cross-validate/scripts/cross_validate.sh) 는 폴백 프로토콜을 하드코딩한다. 429 수신 시 `check_gemini_capacity()` (`gemini -p "hello"`) + 지연 후 재시도 → 최종 실패 시 **stderr 에 `claude-only analysis completed — 단일 모델 편향 노출 미확보` 프리픽스 출력 + stdout 에 `[claude-only-fallback]` 헤더 + exit code 77** 반환 (v2.20.0~ stdout 헤더 대칭).

호출 측이 `CROSS_VALIDATE_ANCHOR` 환경변수 (`MINOR-behavior-change` / `ADR-new-or-amendment` / `CRITICAL-directive-revision`) 를 설정하면 **reminder 이슈 생성** (기본 dry-run, `REMINDER_ISSUE_DRYRUN=0` 으로 실제 생성). **재시도 sleep 은 지수 증가 (2^attempt × BASE)** 로 v2.20.0 부터 변경 (이전: linear attempt × BASE). `check_gemini_capacity()` 는 v2.20.0 부터 **capacity 부족 2 / 비-capacity probe 실패 1 / 정상 0** 으로 exit code 분리 (호출 측 로그 차별화). 스모크 테스트는 `test/cross-validate-fallback.test.js` 가 mock gemini 바이너리로 각 분기 + **stateful 복구 분기(1차 429 → 2차 정상, v2.20.0~)** 를 검증.

### 2.3 outcome JSON 자동 매핑 (v2.19.0~, Phase 3)

스크립트는 종료 시 `${LOG_DIR}/cross-validate-<type>-<timestamp>-outcome.json` 파일을 생성한다. 필드: `outcome` (`"applied"` / `"429-fallback-claude-only"` / `"fatal-error"`) / `exit_code` / `anchor` / `pr_ref` / `context` / `log_file` / `reminder_issue` (`"none"` / `"dryrun"` / `"created"`) / `timestamp`. architect 에이전트는 step 8 에서 이 파일을 bash 스니펫으로 파싱해 `extends.cross_validate_outcome` 에 **자동 매핑** — 선언/프롬프트/스크립트 3층 방어의 수동 연결점 제거.

### 2.4 공통 파싱 헬퍼 (v2.21.0~, Phase B)

`scripts/parse-cross-validate-outcome.sh` 가 outcome JSON 파싱을 SSoT 로 제공. 에이전트는 `eval "$(... | parse-cross-validate-outcome.sh --from-stdout)"` 한 줄로 `CROSS_VALIDATE_OUTCOME` / `CROSS_VALIDATE_EXIT_CODE` / `CROSS_VALIDATE_REMINDER` / `CROSS_VALIDATE_LOG_FILE` / `CROSS_VALIDATE_ANCHOR` 변수 획득. 파일 없음/파싱 실패 시 `"missing"` / `"parse-error"` 로 안전 기본값 출력. architect 외 qa/reviewer 등 확장 수요 대비 공통화.

### 2.5 parse 헬퍼 jq 전환 NO-OP 결정 (#141)

grep/sed 파이프라인의 `\"` escape 처리 한계는 **실측 확인됨** 이나, 실 사용 필드 값이 enum/경로/번호 범위라 raw `"` 가 구조적으로 제외되어 파싱 실패 0건. jq 도입은 테스트 매트릭스 2배 + 의존성 부담을 정당화할 실측 근거 없어 기각. 경계 가드 테스트 (`test/parse-cross-validate-outcome-boundary.test.js`) 로 `\` / tab / newline / CR round-trip 지속 관측. 재검토 트리거 (필드 값 범위에 raw `"` 도입 등) 는 [ADR 20260420-jq-based-parsing-no-op](../decisions/20260420-jq-based-parsing-no-op.md) 참조.

### 2.6 probe 옵트아웃 + sleep cap (v2.21.0~, Phase B)

`SKIP_CAPACITY_PROBE=1` 로 capacity probe 생략 (probe 자체 quota 소모 회피). `GEMINI_RETRY_SLEEP_CAP` (기본 300s) 으로 지수 backoff 상한 보장 (`MIN(cap, 2^attempt × BASE)`). `MAX_GEMINI_RETRIES` 증설 시 sleep 폭증 방지.

### 2.7 fatal 경로 stdout 헤더 공유 주의

`[claude-only-fallback]` stdout 헤더는 **fatal (exit 1) 경로에서도 동일하게 출력**된다. fatal vs 429 정확 구분은 반드시 **outcome JSON 의 `outcome` 필드** (또는 `parse-cross-validate-outcome.sh` 헬퍼) 참조. stdout 헤더 단독으로 분기하는 호출 측 코드는 두 오류를 구분 못한다.

### 2.8 폴백 프로토콜 근거

- volt [#40](https://github.com/coseo12/volt/issues/40) — v2.13.0 / v2.15.0 박제 직후 Gemini 429 2회 관찰
- harness [#107](https://github.com/coseo12/harness-setting/issues/107) 선례 (복구 후 재시도 이슈 박제 → 2차 성공 후 close)

## 3. 정책·설계·ADR 박제 직후 1회 루틴

정책 문서, ADR, CRITICAL DIRECTIVE 등을 박제한 직후 cross-validate 스킬을 1회 호출한다. 단일 모델 편향(범주 오류/암묵 전제 누락)은 박제 직후가 노출 효율이 가장 높다. v2.6.2→v2.6.3(SemVer 세분화) 사례 참조.

## 4. 교차검증 결과 재분석

**교차검증 결과는 Claude가 재분석**: Gemini 산출물을 합의/이견/고유발견으로 분류하고, 과대 대응은 근거와 함께 반려. 맹목 수용 금지.

## 5. Claude 자체 편향 4종 셀프 체크리스트

cross-validate 호출 **전** 에 Claude 자신의 산출물을 아래 4가지 편향에 대조. Gemini 이견이 수용된 실측 사례에서 반복 관찰된 패턴 (volt [#55](https://github.com/coseo12/volt/issues/55)). 셀프 감지 못하면 cross-validate 가 발견하므로 안전망이나, 편향 목록을 미리 알고 있으면 설계 단계에서 1차 필터링 가능.

| # | 편향 | 징후 | 사전 감지 질문 | 보정 방향 |
|---|---|---|---|---|
| 1 | **낙관적 일정 산정** | "3일이면 충분", "간단해" 류 표현 + 전수 대조·외부 검증 단계 과소 평가 | "리서치 / 외부 데이터 대조 / 엣지 케이스 테스트 시간까지 포함했는가?" | 낙관 추정 × 1.5~2 + 명시적 리서치 phase 분리 |
| 2 | **결합 관계 간과** | "A 와 B 는 병렬 가능" + 실제로는 동일 코드 경로를 건드리는 변경 | "A 의 회귀와 B 의 회귀를 원인 추적 가능한가?" "두 변경이 동일 계층·동일 파일·동일 상태를 만지는가?" | 결합 감지 시 **직렬 배치** (회귀 원인 추적성 > 병렬 효율) |
| 3 | **폐기 프레이밍 선호** | "영구 폐기", "지원 안 함", "무기한 중단" + 재검토 조건 부재 | "이 결정이 **시간 함수** (기술 성숙도 / 사용자 전환 / 외부 표준) 의 영향을 받는가?" | 폐기 → **"보류 + 재도입 트리거 명시"** 로 프레이밍 전환. ADR 에 재도입 섹션 필수 (record-adr 스킬 참조) |
| 4 | **순수주의 원칙 적용** | 원칙 (예: "Fact-First") 을 디폴트 동작으로 문구 그대로 구현 + 기존 UX 관습·접근성 고려 미흡 | "원칙 문구 그대로 적용하면 첫 사용자 인상/학습 곡선이 깨지는가?" "원칙 경로가 '언제든 1-클릭 거리' 인가?" | 디폴트는 **관습·교육적 기본값** 유지 + 원칙 경로를 **접근성 보장** 형태로 제공 (문구 변경 금지, 운영 해석으로 흡수) |

체크리스트 통과 못 한 항목이 있으면 해당 부분을 cross-validate 호출 프롬프트에 **명시적 질문으로 삽입** ("B2 결합 감지 요청" 등) — Gemini 가 그 축에 집중하도록 유도.

## 6. 외부 툴 동작 주장은 실측 필수 (Claude 도입 / Gemini 제안 공통)

Gemini 의 개선 제안뿐 아니라 **Claude 자신이 새 도구 flag 를 도입** 할 때도 동일 가드 적용. "툴이 알아서 처리한다" 류 추측성 서술은 특히 위험.

### 6.1 그룹 A — 사전 실측 (4단계)

1. **공식 문서 확인** — 주장이 공식 문서 / CLI `--help` 출력 / 공식 README 에 명시되어 있는가? **LLM training data cache 의존 금지** — 버전 업데이트로 flag 동작이 바뀌었을 수 있음
2. **CI / 샌드박스 실측** — 반영 전 별도 커밋 / draft PR 로 동작 확인
3. **revert 가능한 단위 커밋** — 실측 반증 시 롤백이 용이하도록 작은 단위 커밋
4. **오탐 근거 박제** — revert 시 커밋 메시지 + 파일 주석 + CHANGELOG Notes 3곳에 이유 명시

### 6.2 그룹 B — 호출 시점 가드 (2단계)

5. **같은 생태계 내 도구 간 flag 호환 가정 금지** (volt [#59](https://github.com/coseo12/volt/issues/59) 가드 셀프 위반 근거) — npm / pnpm / yarn / bun 는 모두 Node.js 생태계여도 CLI 는 **독립 설계**. 한 도구에서 동작하는 flag 가 다른 도구에서 같게 작동한다고 **복사 금지**
6. **cross-validate 호출 프롬프트에 명시 질문 삽입** — 본 PR 이 새로 도입한 외부 도구가 있으면 프롬프트에 "**도입한 `<도구>` 의 flag / 각 flag 의 공식 문서 명시 여부 / 같은 생태계 내 다른 도구의 flag 복사 여부**" 질문을 명시적으로 삽입. Gemini 의 "침묵" 이 곧 "안전" 이 아니다 — 주장하지 않으면 가드 미발동 (volt #59)

### 6.3 검증 명령 템플릿 (#194)

flag 호환성 검증의 실행 비용을 **한 줄 명령** 으로 축소. 개발자가 "어떻게 검증해야 하는가?" 를 매번 재발견하지 않도록.

```
<tool> --help | grep -A 2 <flag>
<tool> <subcommand> --help | grep -A 2 <flag>
```

**실측 예시**:

```bash
# pnpm — 같은 생태계(Node.js) 도구라도 flag 가 npm 과 다르다는 반증
pnpm --help | grep -A 2 '\-\-if-present'
# → 결과 없음 → pnpm 공식 미지원 → `pnpm run --if-present` 서브커맨드 형태로 사용 (pnpm 8+)

npm --help | grep -A 2 '\-\-if-present'
# → 결과 존재 → npm 공식 지원 → `npm test --if-present` 직접 동작
```

**판정 기준**:
- `grep` 결과 **존재** → 공식 지원, 사용 가능
- `grep` 결과 **없음** → 공식 미지원, 다른 도구의 동작을 복사하지 말 것 (위 pnpm 사례)
- 결과 애매 (별칭/서브커맨드 형태) → 해당 도구의 공식 문서 재확인

근거: volt [#59](https://github.com/coseo12/volt/issues/59) — harness v2.28.2 가 npm 의 `--if-present` 를 pnpm 에도 복사해 셀프 위반. 본 템플릿은 해당 재발 방지 도구.

## 7. 검증 필수도 매트릭스

| 주장 카테고리 | 검증 필수도 | 검증 방법 |
|---|---|---|
| 문법 / 논리 오류 | 중 | 로컬 run / unit test |
| 가독성 / 리팩토링 | 저 | 선택적 수용 |
| **외부 툴 동작 / CI / 프레임워크 기본값** | **최고** | **실측 (CI run, 샌드박스)** 필수 |
| 프로젝트 내부 구조 참조 | 중-고 | base 파일 전체 확인 (diff 만 보지 말고) |
| 보안 / 성능 | 고 | 테스트 + 프로덕션 유사 환경 |

## 8. diff-only 리뷰의 한계

LLM 코드 리뷰가 diff context 만 받으면 **base 파일의 기존 guard/유틸** 을 보지 못해 "이미 있는 것을 추가하라" 오탐이 발생한다. 프로젝트 내부 구조 참조 제안(존재 여부/위치 주장)은 base 파일 전체를 열어서 확인.

근거 (외부 툴 실측): volt [#51](https://github.com/coseo12/volt/issues/51) — (A) Gemini 의 `setup-node@v4 cache:'npm'` + lockfile 부재 자동 skip 주장이 실측에서 `##[error]Dependencies lock file is not found` 로 반증 (PR [#158](https://github.com/coseo12/harness-setting/pull/158)). (B) `body || ''` guard 가 이미 존재하는 pr-review.yml 에 "추가하라" 오탐 — diff 만 읽고 base 파일 미확인 (PR [#147](https://github.com/coseo12/harness-setting/pull/147)).

## 9. 고유 발견의 수용 vs 후속 분리 3단 프로토콜

#23 의 반려 기준을 보완하는 수용/분리 기준. architect 에이전트 step 7 의 **결과 편입 4분류** (합의 / 이견 수용 / 기각 / 고유 발견 후속 분리) 는 아래 3단 프로토콜을 실행 단계로 펼친 운영 형태 — `.claude/agents/architect.md` step 7 참조.

1. **합의 선별** — Claude 설계와 일치하는 Gemini 지적은 현재 PR 에 즉시 반영. 이견은 근거 비교 후 취사
2. **고유 발견의 범위 체크** — Gemini 만의 제안이면 현재 스프린트 계약(특히 **비목표**)과 대조. 범위 내면 반영, 범위 밖(비목표와 상충)이면 **후속 이슈로 분리**. 판단 질문: "이 변경이 현재 PR 의 `Behavior Changes` 에 원 완료 기준과 직교하는 항목을 추가하는가?"
3. **분리 시 박제 규칙** — 후속 이슈를 **즉시 생성**해 맥락 유실 방지. 본문에 Gemini 설계 스케치 인용 + `Builds on: #원PR` 링크 + 우선순위 초안(high / medium / low) 명시

**금지**: 스프린트 비목표를 "Gemini 제안이 타당하다"는 이유만으로 무시 (CRITICAL #6 침범). 근본 해결책이라도 현재 스프린트 범위 밖이면 분리.

**근거**: volt [#23](https://github.com/coseo12/volt/issues/23), volt [#29](https://github.com/coseo12/volt/issues/29) — harness #89 (post-apply 게이트) 교차검증에서 Gemini 가 `previousSha256` 스키마 확장을 제안했고, 비목표 "매니페스트 스키마 변경 없음"과 상충하여 후속 이슈 #92 로 분리. 결과적으로 3 PR / 3 릴리스로 자연 분할되어 각 단계 위험 독립.
