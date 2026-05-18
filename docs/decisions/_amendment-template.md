# ADR Amendment 템플릿 (B 형식)

> **사용법**: 본 파일은 ADR Amendment 박제 표준 템플릿. ADR 수정 시 아래 §Amendment N 블록을 복사하여 대상 ADR 파일 끝에 추가한다. `_` prefix 로 인덱스 자동 제외 (`docs/decisions/README.md` 인덱스 표 비대상).
>
> 컨벤션 전문: [`docs/decisions/README.md` `## ADR 수정 컨벤션`](README.md#adr-수정-컨벤션--amendment-b-형식-immutable--별도-amendment-n-섹션) 참조.

---

## Amendment N — YYYY-MM-DD — <한 줄 요약>

- **발의**: [#이슈번호](URL) (트리거 발화 일자, deadline 등)
- **트리거**: <측정 임계값 / cross-validate 합의 / 사용자 의사 결정 / 실측 발견 중 분류>
- **변경 분류**: <결정 폐기 / 재검토 조건 강화 / 측정 지표 갱신 / 트리거 발화 박제 중 1개 이상>
- **변경 내용**:
  - <폐기되는 가정 / 식 / 옵션>
  - <정정안 / 신규 옵션 / 갱신 임계값>
  - <측정 지표 / 산식 인용>
- **결정 (YYYY-MM-DD)**: <사용자 / Gemini cross-validate / architect 의 명시 결정 + 근거>
- **영향**: <코드 수정 필요 여부 / 다른 §섹션 강화 여부 / 후속 이슈 분리 여부>
- **<ADR 본문 §섹션 강화 — Amendment 적용 후 실효 SSoT>** (해당 시):
  > <강화된 §재검토 조건 / 정정된 §결정 expected behavior / 신규 §측정 지표 의 inline 박제>
- **cross-link**: 본 Amendment, [#발의 이슈](URL), 선행 Amendment ([#PR](URL)), 관련 코드 SSoT (`path/to/file.ts:LINE`)

---

## 박제 위치 규약

- ADR 파일의 **마지막 §섹션 뒤** (`## R4 와의 관계` / `## 교차검증 반영 사항` / `## 후속 작업 인계` 등의 뒤)
- 누적 박제 — 최신 Amendment 가 파일 끝에 위치 (시간 역순 아닌 시간순 추가)
- N 은 1부터 시작, 누적 1씩 증가 (`Amendment 1` → `Amendment 2` → ...)

## 박제 트리거

1. **§재검토 조건 임계값 충족** — 자동 탐지 workflow (`.github/workflows/adr-z-pattern-health-v2.yml` 등) 발화 → `[ADR Trigger]` 이슈 → 3 영업일 내 결정 분기 → Amendment N 박제
2. **cross-validate 합의** — Gemini 권고 수용 또는 단일 모델 편향 노출 결과로 §결정 가정 수정 필요 시
3. **사용자 의사 결정** — 사용자가 명시적으로 ADR 결정 일부 변경 요구
4. **실측 발견** — PR reviewer / qa 가 §결정 expected behavior 와 실 동작의 drift 발견 (예: ADR 20260512 Amendment 1 — sun focus 28% drift)
