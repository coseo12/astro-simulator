# P10 회고 — Fact-First 원칙 + 데이터 감사 + 사실 모드 UI

> **Phase**: P10 (Fact Audit + 시각 원칙 정비)
> **기간**: 2026-04-20 ~ 2026-04-21 (1.5일, 원 계약 9~13d 대비 압축 진행)
> **총 PR**: 9건 (#269 / #273 / #275 / #276 / #277 / #279 / #280 / #281 / #283 / #284)

## 달성도 (완료 기준 표)

| Sub-phase              | 원 DoD 개수 | 달성    | 이관/미달     | PR                 |
| ---------------------- | ----------- | ------- | ------------- | ------------------ |
| **P10-A** 원칙 박제    | 8           | ✅ 8/8  | —             | #269 + #273        |
| **P10-B** 데이터 감사  | 8           | ✅ 8/8  | —             | #275 / #276 / #277 |
| **P10-C** 사실 모드 UI | 8           | ✅ 8/8  | —             | #279 / #280 / #281 |
| **P10-D** 정확도 이슈  | 3           | ✅ 2/3  | #255 → P13    | #283 / #284        |
| **P10-D.5** 벤치 회귀  | 3           | ⚠️ 부분 | 환경 mismatch | (본 회고)          |

**총 30 DoD 중 28 달성 (93%)**, 2건 P13 이관.

### 이관·재조정 3건

1. **#255** J2/J4 편평도 세차 → P13. 이슈 본문 "priority:medium — P13 과 묶어 처리 후보" + #282 tidal force 와 통합 구현 목적
2. **#282** tidal force Laplace libration — P10-D #261 에서 scope 재조정하여 신규 생성 (P11+)
3. **P10-D.5 J2/J4 벤치** — #255 이관에 따라 해당 측정 항목 제거

## 잘 된 것

### Fact-First 원칙의 전주기 관통

- P10-A 에서 선언한 원칙 (`docs/deprecated/principles/fact-first.md`) 이 B (감사) → C (UI) → D (정확도) 전체를 일관되게 관통
- `dataSource` / `lastVerified` / `colorSource` / `uncertainty` 스키마가 코드·CI·UI 3계층에 모두 반영
- About 모달에서 사용자가 각 값의 출처까지 추적 가능 (transparency 극대화)

### 교차검증 + 스프린트 계약 준수

- Gemini 2차 교차검증 6건 즉시 반영 + 4건 이견 수용 + 1건 후속 분리 (#271)
- 재조정 3위치 박제 (코드·PR·ADR) 가 실제 3회 활용됨: P10-C-1 `?mode=?view=`, P10-D #261 scope 재조정, #255 P13 이관
- CRITICAL #6 §7 "재조정 박제" 가 실 drift 감지 기제로 기능

### 실증 가능한 핵심 Behavior Change

- **P10-B JSON**: 9건 수정 (jupiter radius 2.26%, saturn 3.5%) + 24 bodies 감사 필드 채움 — `verify-iau-data.mjs` 0 errors
- **P10-C scientific 모드**: browser-verify 에서 `jupiter scaling.x === 1` (educational 500 → scientific 1) 실측 박제
- **P10-D #261 φ₀**: JPL Horizons API 재쿼리 → 초기 φ₀ = 179.6929° (평형점 180° ± 0.31°) 실증
- **P10-D #263 Newton state vector**: timeScale=86400 에서 sat-dynamic 배지 4/4 렌더 실증 (forward-diff 폐기)

### 박제 계약의 자동 가드 증명

- P10-B-3 CI 통합으로 `verify-and-rust` 에 `verify:iau-data` step 추가 → PR 머지 게이트 작동
- Rust long-integration 테스트가 `#[ignore]` / scope-deferred 로 명시적 분리 → CI noise 없이 후속 이슈 추적 가능

## 어려웠던 것

### 1. 계약 레벨에서 드러난 URL key 충돌 (P10-C-1)

- 원 계약 `?mode=scientific` 이 기존 `?mode=observe|research` 와 충돌 — **Gemini 2차 교차검증도 놓친 건**
- 구현 직전 발견 → `?view=` 로 재조정 + 문서 3위치 박제 (CRITICAL #6 §7)
- **교훈**: URL key 는 기존 store/sync 와 정합 점검을 플랜 단계에 의무화. Gemini cross-validate 에도 "URL key 중복" 항목 추가 가치

### 2. Laplace libration 역학 모델 한계 (P10-D #261)

- JPL 정확 값 (φ₀ = 179.69°, 평형점 ±0.31°) 박제했지만 100 Io 주기 적분 후 amp = 767° (circulation)
- **원인**: 순수 Newton 다체는 tidal force 미모델링 — 실 천체는 조석 에너지 소산 + 공명 barrier 로 libration 강제 (amp 0.064°)
- **대응**: #282 tidal force 이슈 분리 (P11+) + 본 PR 에선 데이터 정합성만 실증 (`test_laplace_initial_phase_equilibrium`)
- **교훈**: "식·데이터 정확" ≠ "관측 재현". 구현 한계를 스프린트 계약 레벨에서 사전 선언 필요 — CLAUDE.md §스프린트 계약 §10 "수치 DoD 미달 시 측정 방법 검증 우선" 의 확장: **식·데이터·측정법 모두 정확해도 역학 모델 누락이 있으면 재현 불가**

### 3. SSR prerender ↔ physics-wasm 의존 충돌 (P10-C-2)

- `scale-badge.tsx` 에서 `@astro-simulator/core` scene import 가 Next.js SSR prerender 단계에서 `ENOENT: physics_wasm_bg.wasm` 유발
- **대응**: MAX_SCALE_BY_KIND 상수를 인라인 미러링 + 주석에 SSoT drift 방지 계약
- **교훈**: core 의 **모듈 분리 경계** 가 SSR-safety 축까지 고려되어야 함. 후속 이슈 ssr-safe 경로 분리 (shared/visual-constants) 고려

### 4. Rust 하드코딩 vs JSON SSoT 동기화 (P10-D #261)

- `laplace.rs` 의 `JPL_GALILEAN_ELEMENTS` 상수가 JSON 과 별도로 하드코딩 → JSON 만 수정하면 Rust 는 stale
- **대응**: 두 위치 동시 수정 + 주석에 SSoT 동기 규약
- **교훈**: 테스트에서 **JSON 값 읽기 경로** 추가하면 drift 자동 감지 가능. 후속 이슈 검토

### 5. 벤치 baseline 환경 mismatch (P10-D.5)

- baseline 은 gh-actions-ubuntu-chromium, 로컬 실측은 macOS headless — **단순 diff 불가**
- **실측 결과** (참조용):
  - idle 30 → 23 fps (−23%, 환경 mismatch 추정)
  - play-1d 22 → 22 (+2.5%)
  - play-1y 24 → 22 (−8.7%)
  - focus 60 → 86 (+43%, 환경 차이 개선)
- **판단**: 환경 mismatch 로 단순 회귀율 비교 신뢰도 낮음. CI `bench-baseline-remeasure` workflow 를 v0.10.0 release branch 에서 dispatch 실행하여 ubuntu baseline 재측정 필요 (후속)
- **교훈**: 로컬 bench 는 "상대 변화" 관찰용 한정. 공식 회귀 판단은 CI 환경에서만

## 다음 인수인계

### v0.10.0 릴리스 준비

- develop 에서 대기. release PR (develop → main, merge commit 방식) 준비
- CHANGELOG `### Behavior Changes` 대량: P10-B-2 JSON 9건 / P10-C scientific 실제 과장 해제 / P10-D-1 Galilean JPL 재쿼리 / P10-D-2 Newton state vector
- `bench-baseline-remeasure` workflow dispatch 로 ubuntu baseline 재측정 후 P10-D.5 확정

### P11 예정 (로드맵 v2)

- Floating Origin (float32 jitter 해소, #271)
- LOD 3단계
- Tier-based quality preset
- tidal force Laplace libration (#282)

### P13 이관 (궤도 정밀 보정)

- #255 목성 J2/J4 편평도 세차 (#282 tidal force 와 통합 구현)

### 알려진 제한 (v0.10.0 릴리스 노트 후보)

- Laplace 공명 libration 은 tidal force 미모델링으로 시뮬레이션 재현 불가 — 데이터 정확성은 확보 (#282 후속)
- scale-badge MAX_SCALE_BY_KIND SSoT 는 인라인 미러링 (SSR-safe 분리 후속 이슈)
- 로컬 bench 와 CI bench 는 환경 차이로 단순 비교 불가 — CI remeasure 경로 필수

## 참조

- 원칙: [docs/deprecated/principles/fact-first.md](../deprecated/principles/fact-first.md)
- 플랜: [docs/deprecated/phases/p10-plan.md](../deprecated/phases/p10-plan.md)
- P10-B 감사 보고: [docs/reports/p10b-data-audit-2026-04-21.md](../reports/p10b-data-audit-2026-04-21.md)
- 이슈: #268 (P10-A) / #274 (P10-B) / #278 (P10-C) / #261 / #263 / #255 / #282
