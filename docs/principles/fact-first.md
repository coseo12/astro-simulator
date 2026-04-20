# Fact-First, Visual-Second — 프로젝트 원칙

> **Status**: Active
> **박제일**: 2026-04-20 (P10-A #268)
> **적용 범위**: 모든 Phase 의 데이터/시각/UI 설계 결정

---

## 선언

> **사실(fact) 기반이 1차, 시각적 표현(visual)은 2차 overlay.**
> 디폴트 UX 는 교육용 관례(`educational` 모드, 과장 + 명시 배지)를 유지하되,
> 사용자는 **항상 1-클릭/1-URL 로 사실 모드(`scientific`)에 접근 가능**해야 한다.
> 모든 과장은 **명시적으로 표시**되어야 하고, 사용자가 인지할 수 있어야 한다.

본 프로젝트(astro-simulator)는 "**교육 + 연구 시각화 + 몰입 탐험 + 물리 샌드박스**"를 동시에 지향한다([docs/phases/roadmap-v1-cosmic-scale.md](../phases/roadmap-v1-cosmic-scale.md) 참조). 서로 다른 청중을 한 시스템이 수용하려면 **사실 데이터는 단일 진실 원천(SSoT)** 으로 유지하고, **시각적 과장은 인지 가능한 overlay** 로 한정해야 한다.

---

## 원칙 상세

### 1. 데이터 무결성 — 사실은 수정 가능한 overlay 의 아래에 박제

- 모든 천체(행성·위성·왜소행성·소행성 등)는 `packages/shared/src/constants/solar-system.ts` 에 **실측값** 으로 기록한다.
- 과장(크기 ×N, 거리 ×M)은 **렌더 타임** 에 적용하며, **데이터 파일을 수정하지 않는다**.
- 시각 효과(고리 두께, glow halo, ring shader tint 등) 는 `educational` 모드에서 과장되어도 **원본 치수는 JSON 에 보존**.

### 2. 정밀도 기준 — IAU 2015 ±0.01%

| 기준     | 내용                                                             |
| -------- | ---------------------------------------------------------------- |
| **1차**  | IAU 2015 Nominal Values for Stars, Planets, and Planetary Bodies |
| **2차**  | NASA JPL Horizons / Planetary Fact Sheet                         |
| **3차**  | Peer-reviewed 최신 관측 논문 (IAU 공식값 없는 body 한정)         |
| **공차** | ±0.01% (IAU 공식값 대비)                                         |

**±0.01% 초과 발견 시 즉시 JSON 수정** (P10-B DoD). 과거 값은 git history 에 보존된다.

### 3. 불확실성 명시 — "우리가 얼마나 모르는가" 도 과학적 사실

- IAU 공식값이 없는 body (소행성·혜성·외곽 위성 등) 는 `uncertainty` 필드로 오차 범위를 기록한다.
- 예: `{ mass: 1.25e20, uncertainty: { mass: 0.15 } }` — 질량 15% 오차 표시.
- UI 에서 `scientific` 모드일 때 오차 막대(error bar)로 시각화할 수 있도록 데이터 단계에서 구조화한다.

### 4. 시간 기준 — J2000.0 Epoch 명시

- **공간 좌표만큼 시간 기준도 사실이다**. 궤도 요소·위상각·각속도는 모두 J2000.0 (TDB = 2000-01-01 12:00:00) 을 epoch 으로 기록한다.
- 각 body 에 `epoch: "J2000.0"` 필드(또는 `epoch: "2451545.0 TDB"`)를 박제.
- 비-J2000.0 데이터(최신 관측 등) 는 변환 후 기록하거나, 원본 epoch 을 명시 + 계산 엔진에서 변환.

#### 저장 epoch vs 시뮬레이션 시작 epoch (이중 개념 분리)

- **저장 epoch**: body JSON 의 `epoch` 필드. 궤도 요소 측정 기준 시점 (J2000.0 고정).
- **시뮬레이션 시작 epoch**: 앱 로드 시 시뮬레이터가 시작하는 시각. **디폴트는 시스템 현재 시각 (UTC)** 을 J2000.0 기준 경과일로 변환하여 적용. 사용자는 URL 파라미터 (`?t=<ISO-8601>` 또는 `?t=J2000.0`) 또는 설정 패널로 임의 epoch 선택 가능.
- 두 개념은 혼동되어서는 안 된다. 저장 epoch 은 **사실 데이터의 기준**, 시뮬레이션 시작 epoch 은 **사용자 경험의 출발점** 이다.

### 5. 출처 추적 — `dataSource` / `lastVerified`

- 각 body JSON 에 아래 2개 필드 필수:
  - `dataSource`: 문자열 또는 배열 (예: `"IAU 2015"` / `["IAU 2015", "JPL Horizons (2024-06)"]`)
  - `lastVerified`: ISO 날짜 (예: `"2026-04-22"`) — P10-B 감사일 이후 업데이트
- `uncertainty` 필드 사용 시 `dataSource` 에 "IAU 공식값 부재 — NASA JPL 2024 관측" 등 대안 출처 명시.

### 6. 색상 감사 — 관측 기반 vs 아티스트 vs 추론

- `colorHint.hex` 필드는 **렌더링 편의** 용. 다음 **3가지 카테고리**를 구분한다 (Gemini 교차검증 2차 수용, 2026-04-20):
  - `colorSource: "observed"` — Cassini/Voyager/지상 망원경 등 실제 관측 기반
  - `colorSource: "artistic"` — 시각적 구분을 위한 **의도적 아티스트 선택** (예: 같은 밝기의 위성 2개를 구분하기 위한 색조 차이)
  - `colorSource: "inferred"` — **관측 데이터 부재에 따른 기본 추론값** (외곽 소행성 / 혜성 핵 / 탐사 미착지 body). 스펙트럼 등급·알베도·모천체 유사성에서 추론. 데이터 업데이트 시 `observed` 로 승격 대상
- `scientific` 모드에서는 `observed` 만 기본, `artistic` / `inferred` 는 **배지로 명시** ("추론값" / "아티스트 선택"). `inferred` 는 배지와 함께 "언제 재측정될지" 참조 (가능하면 미래 미션 이름).

---

## 과장 표시 규약 (Explicit Exaggeration)

모든 과장은 **사용자가 인지할 수 있어야** 한다. `educational` 디폴트 모드에서도 다음을 만족한다:

1. **상수 박제**: 과장 배수(`sunScale × 20`, `planetScale × 200` 등)는 **단일 파일**에 상수로 박제하고, 렌더 타임 시 JSON 실측값과 곱한다.
2. **Hover/Focus 배지**: 각 body 에 마우스/포커스 시 "태양 ×20 과장 중" 등 **현재 스케일 표시**.
3. **첫 진입 온보딩**: 첫 방문 시 툴팁 — "시각적 이해를 위해 크기가 과장되어 있습니다. [실제 비율로 보기]"
4. **크레딧 뷰**: About 모달 또는 설정 패널에 IAU / NASA JPL / Gaia DR3 등 데이터 출처 attribution + 현재 적용된 과장 요약 ("크기 ×20 / 거리 ×1.0").
5. **모드 토글**: 헤더 또는 설정 패널에서 `educational` ↔ `scientific` 1-클릭 전환. 키보드 단축키 `m` 권고.
6. **URL 동기화**: `?mode=scientific` 로 북마크/공유 가능. 링크로 방문 시 해당 모드로 진입.

구현 상세 DoD: [docs/phases/p10-plan.md](../phases/p10-plan.md) P10-C.

---

## `scientific` 모드 UX 보호

`scientific` 모드에서는 대부분의 body 가 sub-pixel 로 표시되어 **빈 화면 이탈 리스크**가 있다 (Gemini 교차검증 지적, 2026-04-20). 이를 방어하기 위해:

- 최초 `?mode=scientific` 진입 시 **안내 배너** 자동 표시 — "실제 비율에서는 대부분 천체가 매우 작게 보입니다. 줌 인/검색으로 특정 천체에 초점 맞추세요."
- 사용자 dismiss 가능 (`localStorage.astro:scientific-notice-dismissed`).
- 뷰포트에 `data-testid="scientific-mode-notice"` 노드 존재 (E2E 검증).

---

## 예외 — 시각 원칙이 사실을 이기는 경우

다음 3가지는 **시각적 가독성** 이 우선한다. 단, 원본 사실은 JSON 에 보존한다:

1. **궤도선 두께** — 실제 두께 0. 렌더는 1~2px 고정.
2. **위성 점 표시 (줌 아웃 시)** — sub-pixel 위성에 최소 가시 크기(~3px) 적용. `?satellites=zoomed` 옵트인으로 실측 모드 접근 가능 (#245).
3. **glow halo / corona** — 항성·태양 표면의 시각 효과. 광도 측정 데이터는 별도 필드.

각 예외는 `scientific` 모드에서 해제되거나 명시 배지가 붙는다.

---

## 참조

- 상위 계약: [docs/phases/p10-plan.md](../phases/p10-plan.md)
- 로드맵 v2: [docs/phases/roadmap-v2-solar-precision.md](../phases/roadmap-v2-solar-precision.md)
- 모바일 보류 ADR: [docs/decisions/20260420-mobile-support-suspension.md](../decisions/20260420-mobile-support-suspension.md)
- CLAUDE.md: 프로젝트 루트 `CLAUDE.md` 프로젝트 고유 섹션에서 본 문서 참조
- 교차검증 근거: Gemini 2026-04-20 — 합의 4건 / 이견 수용 4건 / 고유 발견 6건

## §Amendments

| 날짜       | 변경 요약                                                                                                     | 근거 PR/이슈                  |
| ---------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| 2026-04-20 | §4 에 "저장 epoch vs 시뮬레이션 시작 epoch" 이중 개념 분리 추가 — Gemini 2차 교차검증 Low 발견                | 본 PR (P10-A 보강) / volt #29 |
| 2026-04-20 | §6 `colorSource: "inferred"` 3번째 카테고리 추가 — Gemini 2차 교차검증 이견 수용 (데이터 부재 body 의 기본값) | 본 PR (P10-A 보강) / volt #29 |
