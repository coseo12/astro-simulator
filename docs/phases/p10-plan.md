# P10 Plan — Fact Audit + 시각 원칙 정비

> **Status**: 플래닝 (이슈 미생성 — 사용자 승인 후 생성)
> **Contract date**: 2026-04-20
> **Size**: 9~13 영업일 (sub-phase 5개)
> **Precedes**: P11 Visual Foundation / P12 Texture Pipeline
> **Supersedes**: 기존 로드맵 v2 의 "P10 토성계" → P13 로 밀림

---

## 목적

기존 구현 영역(P1~P9)에 대한 **사실 기반 감사**와 **시각 원칙 정비**. 신규 기능 확장 이전에 프로젝트 정체성을 박제하고, 디폴트 UX 와 데이터 무결성을 재설정한다.

## 상위 원칙 (이 Phase 에서 최초 박제)

> **Fact-First, Visual-Second**
> — 사실(fact) 기반이 1차, 시각적 표현(visual)은 2차 overlay.
> — 디폴트 UX 는 교육용 관례(`educational` 모드, 과장 + 명시 배지)를 유지하되,
> 사용자는 **항상 1-클릭/1-URL 로 사실 모드 접근 가능**해야 한다.
> — 모든 과장은 **명시적으로 표시**되어야 하고, 사용자가 인지할 수 있어야 한다.

상세 박제: `docs/principles/fact-first.md` (P10-A)

## 데이터 정밀도 기준

- **1차 기준**: IAU 2015 (±0.01%)
- **보조 기준**: NASA JPL Horizons / Planetary Fact Sheet
- **불확실성 명시**: IAU 공식값이 없는 소행성/혜성/외곽 위성은 `uncertainty` 필드로 오차 범위 기록 ("우리가 얼마나 모르는가"도 과학적 사실)
- **시간 기준**: J2000.0 Epoch 명시 (공간 데이터만큼 시간 기준도 사실)
- **출처 추적**: 각 body JSON 에 `dataSource` + `lastVerified` (날짜) 필드

## Sub-phase 구조

| Sub         | 테마                                                            | 규모 | 의존                   |
| ----------- | --------------------------------------------------------------- | ---- | ---------------------- |
| **P10-A**   | 원칙 박제 + 로드맵 v2 재작성 + 모바일 보류 ADR + CLAUDE.md 참조 | 1d   | 없음                   |
| **P10-B**   | 데이터 감사 — IAU 2015 전수 대조 + 필드 확장                    | 3~5d | A 선행                 |
| **P10-C**   | 디폴트 `educational` 모드 + 토글 + 배지 + 온보딩 + 크레딧 뷰    | 2~3d | B 선행                 |
| **P10-D**   | 정확도 이슈 소화 (#261 / #263 / #255)                           | 2~3d | **C 직렬 (병렬 금지)** |
| **P10-D.5** | 물리 수정 후 벤치마크 회귀 측정                                 | 1d   | D 선행                 |

**총: 9~13d**

> **C → D 직렬화 근거**: 과장 모드 변경과 물리 수정이 동시 들어가면 회귀 원인 추적 불가.
> 교차검증(Gemini, 2026-04-20) 에서 병렬화 리스크 지적됨.

## 완료 기준 (DoD)

### P10-A — 원칙 박제

- [ ] `docs/principles/fact-first.md` 생성 — Fact-First/Visual-Second 원칙, 정밀도 기준, epoch 규칙, 과장 표시 규약
- [ ] `docs/phases/roadmap-v2-solar-precision.md` 재작성 — P10~P16 번호 재조정 + P11 Visual Foundation 에 tier preset 스케치 한 단락 박제
- [ ] `docs/decisions/YYYYMMDD-mobile-support-suspension.md` — 보류 결정 + **재도전 조건** + **Graceful Degradation UX** + **tier preset 전략 초안**
- [ ] `CLAUDE.md` 프로젝트 섹션 (managed-block 외부) 에 `docs/principles/fact-first.md` 참조 링크 한 줄 추가 (하네스 업스트림 충돌 방지)
- [ ] ADR 작성 규약 준수 — 배경 / 후보 비교 / 결정 / 결과·재검토 조건 / **재도입 트리거** / **Graceful Degradation UX** 섹션

### P10-B — 데이터 감사

- [ ] `packages/shared/src/types/celestial.ts` — `dataSource` / `lastVerified` / `uncertainty` / `epoch` 필드 추가 (타입 확장)
- [ ] `packages/shared/src/constants/solar-system.ts` 전수 IAU 2015 대조 — 태양 + 8 행성 + 주요 위성 + 왜소행성
- [ ] `packages/shared/src/constants/astronomy.ts` 대조 — AU/중력상수/solar mass 등
- [ ] ±0.01% 초과 발견 시 즉시 JSON 수정 (Q11 결정)
- [ ] IAU 공식값 없는 body 는 `uncertainty` 필드로 오차 범위 기록 + 대안 출처 (NASA JPL 등) 명시
- [ ] 색상(`colorHint.hex`) 감사 — 관측 기반 / 아티스트 선택 구분 필드 (`colorSource`)
- [ ] 데이터 감사 보고서 — 수정 항목 수 / 추가 필드 수 / IAU 공식값 부재 body 수

### P10-C — 사실 모드 + UI 정비

- [ ] 뷰 모드 스토어 — `educational` (디폴트) / `scientific` 2종
- [ ] URL sync — `?mode=educational` / `?mode=scientific`
- [ ] 과장 배지 UI — 각 body hover/focus 시 "태양 ×20 과장 중" 등 현재 스케일 표시
- [ ] 모드 토글 UI — 헤더 또는 설정 패널, 키보드 단축키 (권고: `m`)
- [ ] 첫 진입 온보딩 툴팁 — "현재 시각적 이해를 위해 천체 크기가 N배 과장되어 있습니다. [실제 비율로 보기]"
- [ ] 데이터 출처/라이선스 크레딧 뷰 — IAU/NASA attribution 고지 (`About` 모달 또는 설정 패널)
- [ ] `scientific` 모드 작동 검증 — 시각 스케일 1.0 에서 행성이 sub-pixel 이 되어도 "깨진 것 아님" 안내 (빈 화면 이탈 방지)
- [ ] 3단계 브라우저 검증 (CRITICAL #3) — 정적 / 인터랙션 / 흐름

### P10-D — 정확도 이슈 소화

- [ ] [#261](https://github.com/coseo12/astro-simulator/issues/261) Galilean φ₀ = 218° → 180° (Laplace 평형점 교정 D5-b 재개)
- [ ] [#263](https://github.com/coseo12/astro-simulator/issues/263) Osculating 속도 추정 `timeScale` 내성화 — forward-diff → 씬 state vector 직접 추출
- [ ] [#255](https://github.com/coseo12/astro-simulator/issues/255) 목성 J2/J4 편평도 세차 반영 (Galilean ±0.1% 영향)
- [ ] 각 이슈별 단위 테스트 + 기존 P9 DoD 유지 확인

### P10-D.5 — 벤치마크 회귀 측정

- [ ] `bench-scene-*.mjs` 재측정 — P9 baseline 대비 회귀율 < 5%
- [ ] J2/J4 추가로 인한 per-frame 연산 증가 측정 + JSON 보고
- [ ] 회귀율 ≥ 5% 시 원인 프로파일링 + 완화 (필요 시 별도 이슈 분리)

## 비목표 (명시 박제)

> 이 목록은 스프린트 범위 **외부**. Gemini 고유 발견이라도 아래 항목은 **후속 이슈로 분리**한다 (CRITICAL #6).

- ❌ Floating Origin → P11
- ❌ LOD 3단계 → P11
- ❌ distance scale 모드 → P11
- ❌ Texture / normalMap / PBR → P12
- ❌ tier 기반 quality preset **구현** (설계 스케치는 P10-A 로드맵에 포함, 구현은 P11)
- ❌ 모바일 경로 제거 (**보류** — 재도전 조건 ADR 에 박제)
- ❌ 신규 위성/행성/왜소행성 추가 → P13~
- ❌ 토성계·천왕성계·해왕성계 신규 → P13~

## 교차검증 반영 사항 (2026-04-20)

Gemini 교차검증 결과 6건 즉시 반영:

1. `uncertainty` 필드 (IAU 공식값 없는 body)
2. Epoch (J2000.0) 상위 원칙 명시
3. 라이선스/크레딧 UI (IAU/NASA attribution)
4. P10-D 후 벤치마크 회귀 측정 (P10-D.5 신규)
5. 디폴트 UX 는 `educational` 유지 (sub-pixel 이탈 방지) — 원칙 문구 조정으로 흡수
6. ADR 재도입 트리거 섹션 + Graceful Degradation UX

후속 이슈 분리 1건:

- Low-End GPU Profile → P11 tier preset 설계에 흡수 (모바일 분기 승격)

## 의존 관계

```
P10-A (원칙 박제)
   ↓
P10-B (데이터 감사)
   ↓
P10-C (UI 정비)
   ↓
P10-D (정확도 이슈)  ← 병렬 금지
   ↓
P10-D.5 (벤치 회귀)
```

## 후속 Phase 전망

| Phase | 테마                       | 주요 범위                                                                                                                                                                                     |
| ----- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P11   | Visual Foundation          | Floating Origin + LOD 3단계 + distance scale 모드 + **tier preset 1급 설계** (`tier-a`/`tier-b`/`tier-c`) + `is-mobile.ts` → `detect-gpu-tier.ts` 리팩토링 + 모바일 Graceful Degradation 모달 |
| P12   | Texture Pipeline           | 30+ body PBR + normalMap + cloud layer + ring detail (Cassini 간극 등)                                                                                                                        |
| P13~  | 기존 로드맵 v2 의 P10 이후 | 토성계 / 천왕성계 / 해왕성계 / 궤도 정밀 / 배포 / 소행성대 / 기술부채                                                                                                                         |

## 박제 위치 요약

| 산출물              | 위치                                                           |
| ------------------- | -------------------------------------------------------------- |
| 플랜 (본 문서)      | `docs/phases/p10-plan.md`                                      |
| 원칙                | `docs/principles/fact-first.md` (P10-A)                        |
| 모바일 ADR          | `docs/decisions/YYYYMMDD-mobile-support-suspension.md` (P10-A) |
| 로드맵 v2 갱신      | `docs/phases/roadmap-v2-solar-precision.md` (P10-A, 신규)      |
| CLAUDE.md 참조 링크 | 프로젝트 섹션 (managed-block 외부, P10-A)                      |

## 참고

- PM 설계 세션: 2026-04-20 (현 세션)
- 교차검증: Gemini 2026-04-20 — 합의 4건 / 이견 수용 4건 / 고유 발견 6건 반영 + 1건 후속 이슈 분리
- 스프린트 계약 합의 원칙: CLAUDE.md `## 스프린트 계약`
- 관련 P9 follow-up 이슈: #261 / #263 / #255 (P10-D 에서 일괄 소화)
- 모바일 보류 관련 이슈: #219 (P10 에서 close 하지 않음 — 보류)
