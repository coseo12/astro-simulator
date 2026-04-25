# docs/lessons/ — 실전 교훈 모음

CLAUDE.md `## 실전 교훈` 섹션에서 추출된 상세 문서 디렉토리. CLAUDE.md 본문은 1~3 줄 포인터만 유지하고, 전문은 이 디렉토리의 개별 파일에 박제한다.

## 디렉토리 원칙

- **1 블록 = 1 파일** (kebab-case) — CLAUDE.md `### <제목>` 블록 당 `docs/lessons/<kebab>.md` 한 파일
- **원본 출처 명시** — 각 파일 상단에 `> **근거**: harness #<PR 번호> Phase 3-X 에서 추출` 라인 필수
- **볼트 이슈 ↔ 레슨 매핑** — 볼트 knowledge 이슈 (coseo12/volt) 가 본 파일의 근거 체인
- **신규 파일 추가 시 본 README 동기화 필수** — `scripts/verify-lessons-readme.sh` 가 CI 에서 drift 차단

## 파일 목록

| 파일 | 요지 | 관련 볼트 이슈 |
|---|---|---|
| [ci-and-downstream-verification.md](ci-and-downstream-verification.md) | CI 초록 체크 ≠ 테스트 실행 + upstream 3중 방어의 다운스트림 blindspot. `[실측]` / `[가정]` 라벨 규약 + 박제 문턱 공식 | [#48](https://github.com/coseo12/volt/issues/48) / [#60](https://github.com/coseo12/volt/issues/60) |
| [comment-implementation-drift.md](comment-implementation-drift.md) | 파일 상단 주석이 선언한 계약이 구현에 반영되지 않는 drift 는 default fallback 이 조용히 흡수하는 버그 생성원 | [#49](https://github.com/coseo12/volt/issues/49) |
| [data-not-code-extension.md](data-not-code-extension.md) | 레이어/플러그인/스키마 구조에서 "데이터만 추가, 코드 변경 0" 을 ADR Concrete Prediction 으로 박제하여 추상화 건강성 실증 | [#47](https://github.com/coseo12/volt/issues/47) |
| [headless-browser-verification.md](headless-browser-verification.md) | Playwright headless + swiftshader 는 3D/WebGPU 경로에서 부분 freeze false positive. 실 Chrome GUI 수동 검증 필수 | [#33](https://github.com/coseo12/volt/issues/33) |
| [strict-principle-dynamic-context.md](strict-principle-dynamic-context.md) | 단일 축 엄격 원칙 + 동적 적응 부재는 자동 검증 PASS / 실사용 실패를 생성 (뷰포트·해상도 등 동적 문맥 시뮬레이션 필수) | [#68](https://github.com/coseo12/volt/issues/68) |
| [sub-agent-multiturn-drift.md](sub-agent-multiturn-drift.md) | sub-agent multi-turn 세션에서 세부 매트릭스가 라운드 간 이탈. SendMessage 로 이전 라운드 매트릭스 재첨부 필수 | [#34](https://github.com/coseo12/volt/issues/34) / [#76](https://github.com/coseo12/volt/issues/76) |
| [ux-dod-vs-product-behavior.md](ux-dod-vs-product-behavior.md) | 수치 DoD 전부 PASS 여도 사용자가 인지하는 제품은 회귀 가능. 원칙 폐기 ADR 은 downstream UX 계약 재검증 동반 + UX DoD 별도 박제 필수 | [#72](https://github.com/coseo12/volt/issues/72) / [#74](https://github.com/coseo12/volt/issues/74) |
| [workflow-dispatch-pitfalls.md](workflow-dispatch-pitfalls.md) | `workflow_dispatch` 는 default branch 반영 후에만 discover + PR 자동 생성 권한 기본 OFF 2단계 함정 | [#45](https://github.com/coseo12/volt/issues/45) |

## 신규 파일 추가 루틴

1. 새 블록이 CLAUDE.md 에서 추출 대상이 되면 `docs/guides/claudemd-governance.md` §5 가지치기 프로토콜 확인
2. 파일명은 kebab-case (`<topic>.md`), `## <제목>` / `> **근거**: ...` / `## 근거` 섹션 포함
3. **본 README 의 "파일 목록" 표에 한 줄 추가** — 파일 / 요지 / 관련 볼트 이슈
4. `bash scripts/verify-lessons-readme.sh` 로 동기화 확인 후 커밋

## 관련 가이드

- [docs/guides/claudemd-governance.md](../guides/claudemd-governance.md) — CLAUDE.md 비대화 방지 9 섹션 지침 (임계 / 가지치기 / 예외 ADR 등)
- [docs/plans/phase3-extraction-plan.md](../plans/phase3-extraction-plan.md) — 본 디렉토리를 도입한 Phase 3-A 설계 계획
