# harness v2.2.0 업데이트 회고

작성: 2026-04-15
관련 PR: #135
대상: `npx github:coseo12/harness-setting@2.2.0 update --apply-all-safe`

## 달성도

| 기준                                            | 결과 | 비고                                               |
| ----------------------------------------------- | ---- | -------------------------------------------------- |
| harness CLI로 update --check 실행               | ✅   | npm 미발행이라 `github:` 소스로 우회               |
| `.harness/manifest.json` 생성 (v2.2.0 baseline) | ✅   | bootstrap 단계 1회 필요                            |
| 안전 카테고리(frozen+pristine+added) 자동 적용  | ✅   | 29건 중 28건 적용, 1건(ci.yml) 수동 제외           |
| 회귀 없음 — 기존 빌드/테스트 그대로 통과        | ✅   | ci.yml 보존으로 Rust 테스트 단계 유지              |
| CLAUDE.md 중복 정리                             | ✅   | 상단 원본을 sentinel로 래핑, 하단 자동 추가본 제거 |

## 잘 된 것

1. **dry-run 우선 검토** — `--apply-all-safe --dry-run`으로 29건 변경 목록을 미리 확인 후 적용. 회귀 위험 있는 ci.yml을 사전에 식별.
2. **카테고리 분리(frozen/atomic/added/divergent)** — harness가 자동으로 안전/위험을 분류해줘서 사용자 결정 부담이 줄었다. removed-upstream 53건은 자동 제외됨.
3. **sentinel 기반 managed block** — `<!-- harness:managed:critical-directives:start -->` 식 마커가 상단·하단 블록 동기화 + 중복 방지의 단일 진실원천 역할. 향후 update에서 안전하게 갱신 가능.
4. **manifest.json baseline 박제** — bootstrap 후에는 update 추적이 자동화돼 매번 수동 비교가 불필요.

## 어려웠던 것

1. **npm 패키지 미발행** — `npx @seo/harness-setting@latest update --check`가 404. `github:coseo12/harness-setting`로 우회. 사용자는 명령어 그대로 복붙했지만 실패했고, scope/패키지명 검증을 했어야.
2. **ci.yml "frozen but project-extended" 패턴 부재** — harness 측에서 ci.yml을 frozen으로 분류하면서, 우리 프로젝트가 추가한 Rust+wasm-pack/verify:test-coverage 단계를 모두 덮어쓸 뻔했다. dry-run 없이 적용했다면 CI가 깨졌을 것. → harness측에 "프로젝트 확장 영역"을 보존하는 패턴(예: comment-marker 기반 append-only zone)이 필요.
3. **CLAUDE.md 중복 추가** — 우리 프로젝트의 CLAUDE.md는 상단에 CRITICAL DIRECTIVES를 이미 갖고 있었지만 sentinel이 없어서 harness가 "신규 추가"로 인식하여 하단에 한 번 더 append. 적용 후 수동으로 sentinel 래핑 + 하단 제거 필요.
4. **bootstrap의 의미 모호** — "현재 상태가 정상"임을 가정하고 baseline으로 박제하지만, 그 경고는 init 손상 케이스만 언급. "프로젝트가 이미 harness 기반인지 확인" 로직이 있으면 좋겠다.

## 다음 인수인계

### 즉시 가드로 제도화

- [ ] **harness update 표준 절차**를 docs에 박제:
  1. `--bootstrap` (manifest 없을 때 1회)
  2. `--check` 로 분류 확인
  3. `--apply-all-safe --dry-run`으로 변경 목록 검토
  4. 위험 항목(ci.yml, 프로젝트 확장 워크플로) 사전 백업/제외
  5. `--apply-all-safe` 적용 → 충돌 sentinel 정리 → PR
- [ ] **CLAUDE.md sentinel 래핑 사전 점검**: 새 프로젝트 init 시 CRITICAL DIRECTIVES와 실전 교훈 블록을 처음부터 sentinel로 감싸기.
- [ ] **harness측 피드백** — coseo12/volt에 다음 2개 캡처 예정:
  - "frozen + project-extended" 보존 패턴 제안
  - sentinel 미보유 managed block의 중복 추가 케이스

### P3-A로 인계되는 컨텍스트

- harness 업데이트로 추가된 \`docs/decisions/\`, \`docs/retrospectives/\`는 P3-A의 ADR(Barnes-Hut theta 선택, octree 메모리 레이아웃) 작성에 즉시 활용 가능.
- 신규 스킬 \`record-adr\`은 P3-A 결정 기록 시 사용.
- ci.yml 보존 결정 — Rust 테스트가 P3-A의 octree/Barnes-Hut 단위 테스트 회귀 게이트가 됨. 이 단계 절대 유지.
