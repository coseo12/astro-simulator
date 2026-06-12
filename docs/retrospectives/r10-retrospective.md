# R10 통합 회고 — 왜소행성 + 혜성 8 body (로드맵 v3 완주)

> **기간**: 2026-06-11 ~ 2026-06-12 (2 세션) / **이슈**: R10a [#659](https://github.com/coseo12/astro-simulator/issues/659) + R10b [#664](https://github.com/coseo12/astro-simulator/issues/664) / **릴리스**: v0.24.0 (R10a) + v0.25.0 (R10b — 예정)
>
> 로드맵 v3 (Incremental Body-by-Body Build) 의 **최종 라운드**. R1 태양 → R10b 혜성까지 **27 body 전수 시각화 완료** (phase 11 = 전 데이터 소진). 본 회고는 R10a/R10b 분할 라운드의 통합 회고이며, 로드맵 v3 전체의 종결 기록을 겸한다.

---

## 1. 달성도 (완료 기준 표)

### R10a — 왜소행성 5 (ceres/pluto/haumea/makemake/eris), PR #660 설계 + #661 구현 + #662 baseline

| DoD                                             | 결과 | 증거                                                                        |
| ----------------------------------------------- | ---- | --------------------------------------------------------------------------- |
| 5 body 가시성 + focus + 궤도선 + info           | ✅   | verify:378-focus 48/48 (24 body × 2 modes, targetΔ=0.000)                   |
| dwarf=800 4번째 scale 그룹 + 서열 정량 가드     | ✅   | strict 부등호 4 + cross-group 비 0.557±0.01 + 그룹 동일값 — 단위 가드 green |
| R10a/R10b allowlist 분리 (혜성 phase 11 재박제) | ✅   | 데이터 3값 + $comment, 코드 0 — 매핑 3곳 동시 박제                          |
| pluto shortcut 승격 + negative 2 직교 축 재배치 | ✅   | allowlist 축 halley / #617 bar 축 ceres                                     |
| eris 67.86 AU 궤도선                            | ✅   | 줌아웃 최소 도달 radius 2,353 unit 실측 (ADR 예측 ≈2,900 보다 양호)         |
| 모바일 cumulative ≤ 25%                         | ✅   | **16.818%** (R9 baseline 16.82% 유지 — 5 body off-screen 분류)              |
| 단위 테스트 + D-T2                              | ✅   | 801 green + 실 Chrome 사용자 승인 (2026-06-11)                              |

### R10b — 혜성 3 (halley/encke/swift-tuttle), PR #669 설계 + #670 구현 + #671 baseline

| DoD                                   | 결과 | 증거                                                                                                                                                                       |
| ------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3 body focus + info + 궤도선          | ✅   | verify:378-focus 54/54 (27 body × 2 modes)                                                                                                                                 |
| comet=5000 5번째 scale 그룹           | ✅   | 그룹 내 서열 (swift-tuttle > halley > encke) + cross-group < dwarf min — 단위 가드                                                                                         |
| halley 고이심률 (e=0.967) 궤도선 품질 | ✅   | **조건부 축 발동**: chord 사전 산출 13.97px (eris 기준선 ×12.7) → 64 seg 실측 꺾임 확인 → `segments = e≥0.6 ? 256 : 64` (1줄) → 재실측 sagitta 5.06px ≤ 기준선 6.26px 해소 |
| 기존 24 body vertex 불변              | ✅   | orbit-lines vertex 1616 = 845(불변) + 3×257 — 신규 가드 2축                                                                                                                |
| negative 가상 ID 3분류 전환           | ✅   | ① nonexistent-body membership ② vi.mock 4파일 ③ E2E 축 종료 (조건 박제)                                                                                                    |
| 역행 혜성 정량 측정                   | ✅   | 3축 각운동량: halley 162.26° / swift-tuttle 113.45° 역행 — 데이터 SSoT 와 **0.01° 일치**                                                                                   |
| 모바일 + 단위 + D-T2                  | ✅   | 16.818% 동일 + 822 green + 실 Chrome 사용자 승인 (2026-06-12)                                                                                                              |

### Baseline 대비 수치 (R9 종료 시점 → R10b 종료 시점)

| 지표                 | R9 (v0.23.0)              | R10b 후                                                    | 증분                                 |
| -------------------- | ------------------------- | ---------------------------------------------------------- | ------------------------------------ |
| 시각화 body          | 19                        | **27**                                                     | +8 (로드맵 v3 전수)                  |
| 단위 테스트          | core 466 / web 313 (≈783) | core 475+ / web 342+ (**822**)                             | +39                                  |
| 코어 코드 (라운드당) | R9 5라인                  | R10a **7 정확 적중** / R10b **6 ≤ 7 적중** (조건부 1 포함) | Concrete Prediction 2연속 적중       |
| scale 그룹           | 3 (inner/gas/ice)         | **5** (+dwarf 800, +comet 5000)                            | 체계 완성                            |
| 모바일 diskArea      | 16.82%                    | **16.818%**                                                | 유지 (8 body 전부 off-screen/sub-px) |
| shortcut bar         | 11 focus                  | 12 focus (+pluto, +halley) — bar 전체 14버튼               | off-by-one 표기 drift 정정 포함      |

---

## 2. 잘 된 것

1. **분할 (R10a/R10b) 의 리스크 격리 적중** — PM Q1 의도대로 R10a 는 순수 데이터 라운드 (코드 7라인, 조건부 축 0), R10b 만 조건부 축 발동. 8 body 동시 진입이었다면 D-T2 2-pass (chord fix) 가 왜소행성 검증과 결합해 라운드가 비대해졌을 것.
2. **measurement-first 조건부 축의 교과서 사례** — architect 가 chord 오차를 **사전 산출** (halley 13.97px = eris 실측 기준선 ×12.7) 하고 fix 1순위 (`e≥0.6 ? 256 : 64`) 까지 사전 설계 → dev 가 1-pass 실측으로 발동 확정 → fix → 2-pass 해소. 선제 구현 (측정 없는 코드) 도, 무대책 실측도 아닌 중간 경로. agy 가 "아키텍처적으로 매우 우수한 사례" 로 독립 평가.
3. **negative 가상 ID 3분류 전환** — phase 소진으로 인한 negative 커버리지 구조 소멸 (R10a cross-validate agy 고유 발견) 을 R10b 에서 uniform 전환이 아닌 분기 semantics 실측 기반 3분류 (membership/vi.mock/축 종료) 로 정밀 해소. 테스트 슈트가 실데이터 phase 진행에 더 이상 종속되지 않음.
4. **부수 성과 — a11y/fps 가드 복구** ([#663](https://github.com/coseo12/astro-simulator/issues/663)): R10a CI 에서 cancelled 관찰 → **브랜치 이력 조회로 상시성 확정** (R9 부터 silent 무력화) → PR 회귀 오인 차단 + 동일 세션 fix (Node 22 핀, fix PR 자가 입증 green). #606 ADR Amendment 3 정책 (playwright workflow 전수 명시 핀) 제도화.
5. **baseline bootstrap feature-ref dispatch 패턴 정착** — `gh workflow run --ref <feature> -f target_branch=<feature>` 로 신규 UI 포함 캡처 + 구현 브랜치 대상 PR (R10a #662 / R10b #671) — qa 차단 라운드 0.
6. **Concrete Prediction 2연속 정확 적중** — R10a 7/≤7, R10b 6/≤7. P11-B 선행 인프라 (tier dwarf-planet/comet 분기, LOD 임계) 의 첫 실전 발동이 "데이터만 추가" 예측을 입증.

## 3. 어려웠던 것

1. **silent 가드 무력화의 발견 경로 부재** — a11y/fps 가 R9 부터 모든 브랜치 cancelled 이었으나 required check 가 아니라 어떤 게이트도 발화하지 않음. R10a 라운드의 우연한 관찰 + 이력 조회가 아니었다면 지속 누적. 교훈: **fail-fast 가드의 "실행됨" 자체를 검증하는 메타 가드 부재** — 후속 검토 항목 (#663 close 코멘트 참조).
2. **qa 측정 방법 정정 2건 (volt #32 패턴 누적)** — R10a solar view 가시성 측정에서 궤도선 lum 오염 (궤도선 OFF 분리 샘플링으로 정정), R10b 이전 R9 의 화면투영 false-negative (3축 각운동량 정정) 선례 답습. "billboard 4px fallback" 용어가 최소 marker 크기로 오독되는 문제 — R10b 부터 "sub-pixel 대체" 로 용어 정정.
3. **pr-template-checklist 가드 반복 발화** — architect 설계 PR (R10a) 와 release PR (v0.24.0) 에서 "Test plan" phrase 누락 발화 (누적 8회차+). release PR 도 7 체크박스 의무라는 신규 관찰 박제. sub-agent 프롬프트에 사전 명시로 R10b 부터 미발화.
4. **카운트성 표기의 누적 drift** — "15버튼" off-by-one (R9 부터 +1 누적, qa 실측 14 로 정정). 주석 속 절대 카운트는 자동 검증이 없어 drift 가 조용히 누적 — 가능하면 카운트 대신 구성 (focus 12 + reset + free-fly) 으로 표기.

## 4. 다음 인수인계

1. **후속 라운드 후보 (로드맵 v4 또는 단발 이슈)** — R10b ADR §축 9: 위성 데이터 확장 (charon/nereid 등 — satellite N≥5 단일 룩업 한계 동반 해소), neptune ring arcs 각도 비균질, 클릭 raycast 선택 (#624), 패닝 F3 (#629 §8), 궤도선 toggle UI. **v4 진입 시 shortcut bar 드롭다운/탭 그룹화** (agy 고유 발견 — 15버튼 한계).
2. **OPEN 이슈**: [#666](https://github.com/coseo12/astro-simulator/issues/666) Node 버전 중앙 관리 (low — 6 workflow 하드코딩 핀 일원화).
3. **후속 이슈 분리 후보 (qa 비차단 관찰)**: lowerRadiusLimit = 0.059×meshR 플랫폼 공통 — focus 극대 줌인 시 카메라 mesh 내부 진입 (전 body 동일, R10b 회귀 아님 — floor ≥ meshR×1.2 등 검토).
4. **메타 가드 검토**: "가드가 실행됨" 자체의 검증 (위 §3-1) — a11y/fps 류 비-required workflow 의 연속 cancelled N회 감지.
5. **R-Phase 사이클 재사용 패턴 (v4 표준 후보)**: PM 권장안 일괄 → 이슈 → architect ADR (Provisional→agy→Accepted) → developer (Concrete Prediction 실측) → reviewer → baseline 선제 dispatch → qa (정량 측정) → D-T2 → 머지+수동 close (auto-close 미발동 16회차+) → 독립 릴리스.
