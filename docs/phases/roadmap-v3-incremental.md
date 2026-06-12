<!-- HARNESS-DRIFT: Z-PATTERN [TODO] -->

# 로드맵 v3 — Incremental Body-by-Body Build

> **Status**: **완주 (2026-06, R10b [#664](https://github.com/coseo12/astro-simulator/issues/664))** — R1 태양 → R10b 혜성 3 까지 전 27 body 시각화 완료 (phase 11 = 전 데이터 소진). 후속 라운드 후보 (위성 데이터 확장 / ring arcs / 클릭 raycast / 궤도선 toggle / 패닝 F3) 는 [ADR 20260612-r10b](../decisions/20260612-r10b-comets-visualization.md) §축 9 인계 참조.
> **박제일**: 2026-04-25 (재구성) / 2026-06-12 (완주)
> **Supersedes**: `docs/deprecated/phases/roadmap-v2-solar-precision.md` (전면 폐기)
> **Supersedes**: `docs/deprecated/principles/fact-first.md` (원칙 폐기)
> **근거**: volt [#74](https://github.com/coseo12/volt/issues/74) — "사실 모드 단일화 부작용 — UX 가시성 회귀"

---

## 재구성 배경

v2 (P10~P17, Fact-First 기반) 는 P10~P12 단계까지 완료되었으나, 사용자 브라우저 실측 결과 **기본 진입 화면이 궤도 라인 + 해왕성 1개만 보이는 빈 상태** 로 UX 회귀 확인. DoD 수치 (screenshot diff / bench / fps) 는 전부 PASS 였으나 사용자가 인지하는 제품이 "초기 기획 상태보다 못한 상태". 상세 원인은 volt [#74](https://github.com/coseo12/volt/issues/74) 참조.

사용자 결정 (2026-04-25): **기획 의도 전면 폐기 + 현재 UI 기준 재구성 + 태양부터 하나씩 incremental build**.

---

## 핵심 원칙

1. **현재 UI baseline 기준 유지** — 상단 네비 (관찰/연구 + 4개 shortcut) / HUD / 시간 바 등 구조 보존. `docs/baselines/2026-04-25-current-ui-*.png` 참조
2. **"사용자가 실제로 보이는 body"** 를 매 R-Phase DoD 에 포함 — 추상적 DoD (screenshot diff, bench 등) 는 2차, 시각 가시성이 1차
3. **추가만, 제거 없이** — UI 레이아웃 / shortcut / HUD 요소는 필요 시 추가, 기존 제거 최소화
4. **수동 브라우저 검증 필수** — 각 R-Phase 마다 실 Chrome GUI 에서 사용자 수동 확인. browser-verify 자동화는 보조
5. **R-Phase 단위로 커밋 + 릴리스 independent** — 앞 R 만 배포돼도 시스템 정상 동작 (backward-compat)
6. **측정 가능한 UX DoD** — 예: "body X 가 화면에서 ≥20px 크기로 visible", "body X focus 시 화면 중앙 위치". 상세 템플릿 + Q2=B 비례 결정 정책은 [§6 측정 가능 UX DoD (Amendment 2026-04-30)](#6-측정-가능-ux-dod-amendment-2026-04-30--q2b-비례-결정-전환) 참조

---

## Phase 개요 (skeleton — 각 R 은 별도 이슈 생성 시점에 상세화)

| R-Phase | 테마                               | 규모 (추정) | 상태                                                                                                                                                                                                          |
| ------- | ---------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R1**  | 태양 하나만                        | 1~2d        | 계획 중 (이슈 예정)                                                                                                                                                                                           |
| **R2**  | R1 + 수성                          | 1~2d        | 계획 중                                                                                                                                                                                                       |
| **R3**  | R2 + 금성                          | 1~2d        | 계획 중                                                                                                                                                                                                       |
| **R4**  | R3 + 지구 + 달                     | 1~2d        | 계획 중                                                                                                                                                                                                       |
| **R5**  | R4 + 화성 + (포보스/데이모스 선택) | 1~2d        | 계획 중                                                                                                                                                                                                       |
| **R6**  | R5 + 목성 + 갈릴레이 4             | 2~3d        | 계획 중                                                                                                                                                                                                       |
| **R7**  | R6 + 토성 + 고리                   | 2~3d        | 계획 중                                                                                                                                                                                                       |
| **R8**  | R7 + 천왕성                        | 1~2d        | 계획 중                                                                                                                                                                                                       |
| **R9**  | R8 + 해왕성                        | 1~2d        | 계획 중                                                                                                                                                                                                       |
| **R10** | 왜소행성 (명왕성 외) + 혜성        | 2~3d        | **완료** — R10a [#659](https://github.com/coseo12/astro-simulator/issues/659) (왜소행성 5, v0.24.0) + R10b [#664](https://github.com/coseo12/astro-simulator/issues/664) (혜성 3 — **로드맵 v3 최종 라운드**) |

> **R10 분할 매핑 (PM 2026-06-11, [#659](https://github.com/coseo12/astro-simulator/issues/659))**: 로드맵 라벨 ↔ `introducedInRPhase` 정수 매핑 — **R10a = phase 10 (왜소행성 5: ceres/pluto/haumea/makemake/eris) / R10b = phase 11 (혜성 3: halley/encke/swift-tuttle)**. 각각 독립 릴리스 (v0.24.0 / v0.25.0 리듬). 분리 메커니즘 (혜성 phase 11 재박제 — 데이터만, 코드 0) 은 [ADR 20260611-r10a](../decisions/20260611-r10a-dwarf-planets-visualization.md) §축 2. R10b 진입 (CURRENT_R_PHASE=11, [#664](https://github.com/coseo12/astro-simulator/issues/664)) 으로 **전 데이터 소진 — 진입 완료** ([ADR 20260612-r10b](../decisions/20260612-r10b-comets-visualization.md) §축 2/§축 9). 동일 매핑 박제 3곳: 본 행 / `solar-system.json` 혜성 `$introducedInRPhaseComment` / `r-phase-allowlist.ts` CURRENT_R_PHASE 주석.

**총 예상: 14~22 영업일** (R10 선택 포함)

---

## 각 R-Phase 공통 DoD 템플릿

매 R-Phase 이슈 생성 시 아래 공통 DoD 포함 (구체 수치는 body 크기에 따라 조정):

- [ ] **가시성** — 기본 진입 (`/`) 상태에서 body X 가 화면에서 **≥ 4px** 크기로 명시적 visible (billboard marker 또는 과장 적용)
- [ ] **Focus 동작** — body X 클릭 / `?focus=X` URL 으로 focus 진입 가능. focus 시 화면 중앙 위치 + 적절한 크기 (≥ 100px 또는 화면의 10% 이상)
- [ ] **Shortcut** — 상단 shortcut 버튼에 body X 추가 (현재 태양/지구/목성/해왕성 4개에서 순차 확장)
- [ ] **궤도** — body X 궤도 라인이 기본 진입 상태에서 visible
- [ ] **Info 패널** — body X focus 시 실측 정보 (mass / radius / semi-major axis / eccentricity 등) 표시
- [ ] **회귀 가드** — 이전 R-Phase baseline 대비 기존 body 가시성 변화 없음 (육안 확인 + 스크린샷 diff)
- [ ] **수동 브라우저 검증** — 실 Chrome GUI 에서 사용자 1차 확인 및 승인 (CRITICAL #3)

> **R4+ 진입 시점부터 추가 적용** (Amendment 2026-04-30, [§R-Phase 공통 DoD 템플릿 갱신](#r-phase-공통-dod-템플릿-amendment-2026-04-30--q2b-비례-결정-가드-추가) 참조). R2/R3 박제값은 별도 ADR amendment 로 소급 갱신:
>
> - [ ] **sun 대비 px diameter 비 가드** — body X (non-sun) 가 sun 대비 px 비 ≤ N% (architect ADR 박제값. 초안: mercury 25% / venus 30% / R4+ 는 R-Phase 진입 시 박제)
> - [ ] **모바일 누적 차단율 가드** — default 진입 모바일 viewport (375×667) 에서 누적 disk area ≤ 25% (UX 침습성 가드)
> - [ ] **회귀 가드 강화** — 이전 R-Phase 박제 px 비 도 회귀 0 (기존 가시성 + 박제 px 비 둘 다 보존)

---

## R1 상세 (첫 스프린트)

### 목적

기본 진입 화면에서 **태양이 명시적으로 보인다**. 현재 화면 (궤도 라인 + 해왕성 1개 + 중앙 흰 점) 에서 **중앙 흰 점을 명확한 태양 mesh / billboard 로 승격**.

### 예상 DoD (이슈 생성 시 PM 라운드에서 확정)

- [ ] 기본 진입 상태에서 태양이 화면 중앙에 **≥ 30px** 크기로 visible (현재는 sub-pixel ~1px)
- [ ] 과장 배수 `sunScale` 파라미터 단일 상수 박제 + tooltip 에 배율 명시 (투명성)
- [ ] 태양 shortcut 버튼 클릭 시 focus → 화면 중앙 정렬 + 크기 확대 (Body tier 유지)
- [ ] `?focus=sun` URL override 동작 (focusBodyId store 필드 추가 전제)
- [ ] 태양 info 패널: mass / radius / luminosity / spectral class / dataSource (IAU 2015)
- [ ] 현재 baseline 대비 궤도 라인 / HUD / 상단 네비 시각 변화 없음
- [ ] 사용자 수동 브라우저 확인 + 승인

### 선결 과제 (R1 내 해결)

- **Store `focusBodyId` 필드 추가** — 현재 부재 상태, URL parser 와 함께 통합
- **Solar tier 기본 상태에서 태양 visibility** — Fact-First 맥락 없는 새 해석으로 과장 배수 적용 (P12 ADR §5원칙 §1 "상대 비율 = 실측 고정" 은 폐기됨)

### R1 비-범위

- 다른 행성 가시성 (R2+ 에서 순차)
- 태양 PBR / corona shader / 광도 효과 (R1 은 mesh + billboard 로 충분, 시각 효과는 후속)
- `educational` / `scientific` 모드 토글 재도입 (P12 폐기 결정 유지)

---

## 기존 코드 / ADR 유지 (Q3=B)

다음은 기술 가치가 있어 유지 (로드맵 reset 와 무관):

- **Floating Origin** (`docs/decisions/20260422-floating-origin.md`) — float32 jitter 해소 기술
- **LOD 3단** (`docs/decisions/20260424-p11-b-lod-design.md`) — high/mid/low billboard 전환
- **Tier 네이밍 정책** (`docs/decisions/20260424-tier-naming-policy.md`) — Scale/Data/GPU/LOD 4 네임스페이스 분리
- **Tier Preset** (`docs/decisions/20260424-tier-preset-design.md`) — GPU tier 감지 + 자동 억제
- **모바일 보류 ADR** (`docs/decisions/20260420-mobile-support-suspension.md`) — 모바일 지원 정책

단 **동작 계층 일부 재조정** 가능:

- Solar/Inner/Body tier 전환 임계값 — R-Phase 마다 재확인
- 기본 진입 tier — Solar 디폴트가 UX 빈 화면 원인이었음, R1 에서 재검토

---

## 폐기된 문서 (역사 참조)

- `docs/deprecated/principles/fact-first.md` — Fact-First 원칙
- `docs/deprecated/phases/roadmap-v2-solar-precision.md` — 로드맵 v2
- `docs/deprecated/phases/p10-plan.md` — P10 plan
- `docs/deprecated/decisions/20260423-display-relative-scale-unification.md` — P12 ADR

---

## 재평가 조건

로드맵 v3 의 "매 R-Phase 가시성 1차 DoD" 접근도 미래에 회귀할 수 있음. 다음 조건 중 하나 충족 시 재평가:

1. R1~R5 까지 진행 후에도 사용자가 "기본 화면이 빈 것 같다" 피드백
2. R-Phase 단위가 너무 느리다고 느껴 병행 (예: R2+R3 묶음) 요청
3. 각 R-Phase 의 과장 배수가 사용자 간 선호 차이로 논쟁이 될 경우 — 그 시점에 mode 토글 재도입 재검토 가능 (P12 폐기 결정 재번복)

---

## §6 측정 가능 UX DoD (Amendment 2026-04-30 — Q2=B 비례 결정 전환)

> **Status**: Active (2026-04-30 박제)
> **근거 ADR**: [docs/decisions/20260430-r3-followup-body-proportion.md](../decisions/20260430-r3-followup-body-proportion.md)
> **근거 이슈**: [#373](https://github.com/coseo12/astro-simulator/issues/373) — body 간 시각 비율 회귀 forensic
> **Cross-validate**: Gemini 2.5 Pro outcome=applied (결정 이견 0)
> **사용자 결정**: 옵션 (c) 채택 (2026-04-30)

### 변경 배경

#373 forensic 결과 + 사용자 옵션 (c) 채택 + Gemini cross-validate 결과 (outcome=applied):

- **Q2=A 독립 결정 정책의 부작용** — 각 body 가 viewport 점유율 ≥ N% 만 충족하도록 독립 결정한 결과, body 간 px diameter 비가 자연 비율에서 이탈 (sun 25% / mercury,venus 가 sun 대비 40~46% 과장 관찰)
- **사용자 인지 단위 = px diameter 비** — 현재 면적 단위 가드 (M1 brightRatio / M2 disk area) 와 직교. body 간 비례를 직접 측정하는 가드 부재

### 갱신된 DoD 예시

- (보존) "body X 가 화면에서 ≥ 4px 크기로 visible" — 절대 가시성 (M1 brightRatio 가드, R1 SSoT 유지)
- (보존) "body X focus 시 화면 중앙 위치"
- **(신규)** "body X (non-sun) 가 sun 대비 px diameter 비 ≤ N% 로 자연 비율 유지" — N 은 architect ADR 박제 (mercury 25% / venus 30% / R4+ 는 R-Phase 진입 시점에 박제)
- **(신규)** "default 진입 모바일 (375×667) 에서 누적 disk area ≤ 25%" — UX 침습성 가드

### 측정 단위

- M1 brightRatio (sun ≥ 3% 가드, R1 SSoT — 보존)
- **(신규) M3 px diameter 비** (body 간 비율 가드. `r1-guard --measure-px-ratio` 신설로 자동 측정)
- **(신규) M2 disk area** (모바일 누적 가드)

### Q2 정책 전환

- 폐기: Q2=A "각 body 가 독립 결정 (각자 viewport 점유율 ≥ N% 만 충족)"
- 신규: **Q2=B "각 body 가 sun 대비 px diameter 비 ≤ N% 로 비례 결정"**
- 적용 범위:
  - **R4 (지구 + 달) 진입 시점부터 본 정책 SSoT** — R-Phase 진입 PM 라운드에서 Q2=B 정책 명시 의무
  - **R2 (#361, mercuryScale=2500) / R3 (#369, venusScale=4000)** — ADR amendment 로 소급 갱신 (architect 단계 수행. R2 ADR `20260428-r2-mercury-visualization.md` §결정 1 + R3 ADR `20260429-r3-venus-visualization.md` §결정 1 amendment 의무)

---

## §R-Phase 공통 DoD 템플릿 (Amendment 2026-04-30 — Q2=B 비례 결정 가드 추가)

> **Status**: Active (2026-04-30 박제)
> **적용 시점**: R4 (지구 + 달) 진입 PM 라운드부터 본 amendment 의 3개 가드를 공통 템플릿에 포함 의무
> **R2/R3 소급 적용**: ADR amendment 로 박제 (architect 단계)

### 추가되는 공통 DoD 가드

기존 7개 가드 (가시성 / Focus / Shortcut / 궤도 / Info 패널 / 회귀 / 수동 브라우저) 에 **3개 추가**:

8. **sun 대비 px diameter 비 가드** — body X (non-sun) 가 sun 대비 px 비 ≤ N% (architect ADR 박제값)
   - 측정: `r1-guard --measure-px-ratio` (신설)
   - 초안 임계: mercury 25% / venus 30% / earth TBD (R4 진입 시 박제) / mars TBD (R5) / R6+ TBD
9. **모바일 누적 차단율 가드** — default 진입 모바일 viewport (375×667) 에서 누적 disk area ≤ 25%
   - 측정: M2 disk area (기존 가드 도구 재사용)
   - 근거: 모바일에서 큰 body 다수 누적 시 viewport 차단율 급증 → UX 침습성 → 25% 임계 (M2 단일 body 가드와 별도)
10. **회귀 가드 강화** — 이전 R-Phase 박제 px 비 도 회귀 0
    - 기존 가시성 회귀 가드와 직교 (절대 크기 + 상대 비 둘 다 보존)
    - R-Phase 진입 시 직전 R-Phase 의 모든 body px 비를 baseline 으로 박제 + 새 R-Phase 종료 시 회귀 측정

### 적용 의무

- 새 R-Phase 이슈 생성 시 PM 라운드에서 위 3개 가드를 architect ADR 박제값으로 인스턴스화 + 이슈 DoD 에 포함
- R2 (#361) / R3 (#369) 는 ADR amendment 로 소급 박제. 코드 변경 여부는 D-T2 사용자 검증 결과에 따라 결정 (initial 초안: mercuryScale 2500 → 2000~3000, venusScale 4000 → 1500~2200)
- **Visual Fidelity 원칙 참조 의무** (#541 박제, 2026-05-24) — R5+ R-Phase ADR 박제 시 [`docs/architecture/principles.md`](../architecture/principles.md) §1 §의무 체크리스트 4항목 (데이터 SSoT 보존 / rendering 시점 분리 / 사용자 D-T2 가이드 / 점유율 baseline 박제) 을 ADR §결정 N 또는 §점유율 산출 섹션에 명시. satellite 가 있는 R-Phase (R5 phobos/deimos, R6 galilean, R7 titan 등) 는 R4 §결정 6 Amendment 2 의 orbit visual scale 평가 절차도 의무 적용

---

## §6 + §R-Phase 공통 DoD 템플릿 (Amendment 2026-05-01 — 적극값 채택 + sunScale 인하 동반 + 회귀 분리)

> **Status**: Active (2026-05-01 박제, architect 단계)
> **근거 ADR**: [docs/decisions/20260430-r3-followup-body-proportion.md](../decisions/20260430-r3-followup-body-proportion.md) Amendment 2026-05-01
> **사용자 결정**: 옵션 c 적극값 + 옵션 a (sunScale 75→50) 동반 채택 (2026-05-01)
> **적용 PR**: feature/373-body-proportion-aggressive

### 변경 배경 (Amendment 2026-04-30 의 후속)

PR #377 (mercuryScale=2500 / venusScale=1850 보수값) 의 D-T2 사용자 검증 미통과. forensic ADR §재검토 트리거 #1 발동 → 옵션 c 적극값 (mercury=2000 / venus=1500) + 옵션 a (sunScale=50) 동반 채택. 사용자 자연 비율 인지 단위로 강화.

### 갱신된 박제값

| body    | Amendment 2026-04-30 (의도)   | Amendment 2026-05-01 (확정)           |
| ------- | ----------------------------- | ------------------------------------- |
| sun     | sunScale = 75 (보존)          | **sunScale = 50** (R1 동반 amendment) |
| mercury | mercuryScale = 2000~3000 범위 | **mercuryScale = 2000 적극값**        |
| venus   | venusScale = 1500~2200 범위   | **venusScale = 1500 적극값**          |

### Q2=B 임계 강화

- mercury sun 대비 px 비: ≤ 25% → **≤ 6%**
- venus sun 대비 px 비: ≤ 30% → **≤ 11%**
- R4+ body 임계: R-Phase 진입 PM 라운드에서 architect ADR 박제값 인스턴스화 (Q2=B 비례 결정 SSoT, 본 amendment 적용)

### R1 baseline 가드 갱신 (sunScale 50 도입 동반)

본 amendment 의 sunScale 인하로 R1 baseline 가드 임계 갱신 (R1 ADR Amendment 2026-05-01 박제):

- (폐기) brightRatio ≥ 3% 데스크톱 가드
- (신규) brightRatio ≥ 0.5% (R2/R3 와 일관, 절대 가시성 최소 임계)
- (신규) pxDiameter ≥ 100px (1280×720, 사용자 인지 가능성 보장)
- (신규) diskAreaRatio ≥ 4% (1280×720, 화면 점유 시각적 인지)
- (보존) 모바일 (375×667) brightRatio ≥ 3% (sunScale 50 시 5.88% 통과)

### r1-guard `--measure-px-ratio` 명세 강화

Amendment 2026-04-30 의 명세 초안 → Amendment 2026-05-01 의 적극값 강화 (forensic ADR §결정 2 §5 Amendment 2026-05-01 박제):

- 측정 viewport: 1280×720 (default SSoT) + 1920×1080 (보조) + 375×667 (모바일)
- GPU tier 강제: `?gpu=a` URL 파라미터 (T1 solar tier 강제 진입)
- 허용 오차: ± 2% (Amendment 2026-04-30 ± 5% → 강화)
- 출력 형식: JSON `{ viewport, camera, bodies: [{ id, wsR, pxDiameter, sunPxRatio, brightRatio, diskAreaRatio }] }`
- body 별 임계: sun ≤ 25% (모바일 침습성) / mercury sun 의 ≤ 6% / venus sun 의 ≤ 11%
- 임계 미달 시: r1-guard exit 1 + stderr 박제. CI / pre-commit / PR 검증 게이트 차단

### 회귀 분리 박제 (D-T2 가드 발견 #2~#4)

본 amendment 는 **#1 비율 미해소만 해결**. 동시 발견된 #2~#4 는 별도 이슈로 분리 박제 (한 PR 이 한 가지 회귀만 책임지는 SRP):

- **#378 [bug] focus 시 허공 표시** — body 가 카메라 frustum 밖. focus 알고리즘 / 카메라 reset 이슈
- **#379 [bug] 모바일 그래픽 사각형** — body 가 사각형으로 렌더링. 모바일 LOD billboard 이슈
- **#380 [bug] 줌인 후 카메라 고정** — 줌 컨트롤 미반응. 카메라 컨트롤러 이슈

본 amendment 의 적극값 채택은 #378/#379/#380 의 사전 조건이 아님 (직교).

---

## §6 + §R-Phase 공통 DoD 템플릿 (Amendment 2026-05-01 라운드 2 — 박제값 적극 재조정)

> **Status**: Active (2026-05-01 박제, architect 라운드 2)
> **근거 ADR**: [docs/decisions/20260430-r3-followup-body-proportion.md](../decisions/20260430-r3-followup-body-proportion.md) Amendment 2026-05-01 (라운드 2)
> **사용자 결정**: (A) 임계 비례 역산 적극 재조정 채택 (2026-05-01)
> **적용 PR**: feature/373-body-proportion-aggressive (라운드 1 박제 보존 + 라운드 2 추가)

### 변경 배경 (라운드 1 의 후속)

라운드 1 박제값 (mercury 2000 / venus 1500) 의 forensic px 비 예측이 DoD 임계를 2.25~2.32배 초과 → 임계 비례 역산 적극 재조정 (mercury 900 / venus 650). sunScale 50 그대로 유지.

### 갱신된 박제값 (라운드 2)

| body    | Amendment 2026-05-01 (라운드 1) | Amendment 2026-05-01 (라운드 2)      |
| ------- | ------------------------------- | ------------------------------------ |
| sun     | sunScale = 50                   | **sunScale = 50** (그대로 유지)      |
| mercury | mercuryScale = 2000 (적극값)    | **mercuryScale = 900 (적극 재조정)** |
| venus   | venusScale = 1500 (적극값)      | **venusScale = 650 (적극 재조정)**   |

### 임계 비례 역산 근거 (forensic 측정 식 선형성 활용)

`pxDiameter ∝ scale` 1차 비례 → 임계 정렬값 산출:

- mercury: `2000 × (6 / 13.5) ≈ 889` → **900** (보수 라운딩)
- venus: `1500 × (11 / 25.5) ≈ 647` → **650** (보수 라운딩)

### Q2=B 임계 — 라운드 1 그대로 유지

- mercury sun 대비 px 비: **≤ 6%** (라운드 2 박제값 900 의 통과 목표)
- venus sun 대비 px 비: **≤ 11%** (라운드 2 박제값 650 의 통과 목표)
- 라운드 2 박제값은 임계 한계 정렬 (목표 = 임계). 측정 노이즈 ± 5% 마진 안에 통과 필요

### R1 baseline 가드 — 라운드 1 그대로 유지

sunScale 50 박제값 변동 없음 → R1 baseline 가드 임계 모두 라운드 1 amendment 그대로 유지.

### r1-guard `--measure-px-ratio` — 라운드 1 명세 그대로 유지

라운드 2 는 박제값만 재조정, 명세 변경 없음. 라운드 1 amendment 의 명세 (mercury ≤ 6% / venus ≤ 11% / 박제값 ± 2% 마진) 그대로 사용.

### 회귀 분리 — 라운드 1 그대로 유지

- #378 / #379 / #380 분리 박제 보존
- 라운드 2 박제값 (mercury 900 / venus 650) 은 모바일 누적 disk area 를 라운드 1 의 ~20% 수준으로 더욱 축소 → #380 (모바일 회귀) 우려 추가 완화

---

## 참조

- `docs/baselines/README.md` — 2026-04-25 재구성 시점 UI baseline 스크린샷
- volt [#74](https://github.com/coseo12/volt/issues/74) — 재구성 근거 교훈
- volt [#75](https://github.com/coseo12/volt/issues/75) — SSoT JSON 부호 규약 메타 교훈
- volt [#76](https://github.com/coseo12/volt/issues/76) — PM multi-turn drift 재현 교훈
- CLAUDE.md 프로젝트 고유 섹션 — "Incremental Body-by-Body Build (v3)"
- [docs/decisions/20260430-r3-followup-body-proportion.md](../decisions/20260430-r3-followup-body-proportion.md) — Q2=B 전환 ADR (2026-04-30 박제) + Amendment 2026-05-01 (적극값 채택 + 옵션 a 동반) + Amendment 2026-05-01 라운드 2 (박제값 적극 재조정 mercury 900 / venus 650)
- [#373](https://github.com/coseo12/astro-simulator/issues/373) — body 간 시각 비율 회귀 forensic 이슈
- [#378](https://github.com/coseo12/astro-simulator/issues/378) — focus 시 허공 표시 (R3 D-T2 가드 발견 #2, 본 amendment 와 분리 박제)
- [#379](https://github.com/coseo12/astro-simulator/issues/379) — 모바일 그래픽 사각형 (R3 D-T2 가드 발견 #3, 본 amendment 와 분리 박제)
- [#380](https://github.com/coseo12/astro-simulator/issues/380) — 줌인 후 카메라 고정 (R3 D-T2 가드 발견 #4, 본 amendment 와 분리 박제)
