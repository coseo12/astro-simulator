# 로드맵 트랙 A/B — v3 완주 이후 작업 축

> **Status**: Active — 트랙 B 1라운드 완료 / 트랙 A 진행 중 (후보 백로그 잔여)
> **박제일**: 2026-07-06 ([#794](https://github.com/coseo12/astro-simulator/issues/794) — 2026-07-04 프로젝트 회고 후속)
> **선행 로드맵**: [`roadmap-v3-incremental.md`](roadmap-v3-incremental.md) — **완주** (2026-06-12, R10b [#664](https://github.com/coseo12/astro-simulator/issues/664) / PR [#670](https://github.com/coseo12/astro-simulator/pull/670), 전 27 body 시각화)
> **출처**: 방향성 기획 (2026-06-22, 세션 단위 — 저장소 문서 부재). 본 문서가 그 기획의 **저장소 SSoT 승격본**이다.

---

## 배경

v3 완주 직후 진단 (2026-06-22 방향성 기획): **"엔진·콘텐츠는 완성, 경험 레이어 미착수"** — 배경 단색 / 표면 텍스처 0 / 오디오 0 (grep 실측). "감상/탐험형" 정체성인데 도표형에 머묾. 이에 5 트랙을 도출했다:

| 트랙  | 테마                                  | 상태                               |
| ----- | ------------------------------------- | ---------------------------------- |
| **A** | 몰입 (별 배경 / 표면 디테일 / 사운드) | **진행 중** (본 문서 §완료/§후보)  |
| **B** | 온보딩 (discoverability, no-regret)   | **1라운드 완료** (#737, #740+#749) |
| C     | 교육 깊이                             | 미착수 (착수 결정 시 본 문서 확장) |
| D     | 관측 실용                             | 미착수 (착수 결정 시 본 문서 확장) |
| E     | 폴리시                                | 미착수                             |

추천 시퀀스 = **B (no-regret) → A → 방향 결정 후 C/D**. 실제 진행도 이 순서를 따랐다 (#737 온보딩 → 트랙 A 연속 라운드).

이 기획이 이슈·세션 메모리에만 존재해 **신규 세션이 "지금 어디쯤"을 문서로 회수 불가**하던 공백 (2026-07-04 회고 실측 — `roadmap-v3-incremental.md` 마지막 갱신이 v3 완주 선언, 이후 8+ feature 문서 공백) 을 본 문서가 해소한다.

---

## 완료 (2026-06-24 ~ 2026-07-04)

| 이슈                                                                                                                        | 트랙   | 1줄 요약                                                                                                                                                        | 릴리스            |
| --------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| [#737](https://github.com/coseo12/astro-simulator/issues/737)                                                               | B      | 첫 진입 온보딩 모달 + 조작 가이드 재호출 + free-fly 키 힌트 (discoverability)                                                                                   | v0.35.0           |
| [#738](https://github.com/coseo12/astro-simulator/issues/738)                                                               | A1     | 별 배경 + 은하수 — 절차적 starfield (에셋 0, infiniteDistance). tier-c 과잉 비활성 회귀는 [#745](https://github.com/coseo12/astro-simulator/issues/745) 로 정정 | v0.35.0 / v0.35.1 |
| [#740](https://github.com/coseo12/astro-simulator/issues/740)+[#749](https://github.com/coseo12/astro-simulator/issues/749) | B 연계 | a11y 대비 AA — fg-tertiary 전수 교체 + 동적 canvas 위 hud-chip backing (#737 qa 발견 후속)                                                                      | v0.36.0           |
| [#756](https://github.com/coseo12/astro-simulator/issues/756)                                                               | A      | 절차적 행성 표면 셰이더 1차 — rocky/desert/gas-bands/cratered 4종 (지구·화성·목성·달, 에셋 0)                                                                   | v0.37.0           |
| [#762](https://github.com/coseo12/astro-simulator/issues/762)                                                               | A 연계 | 천체 표시 크기 비율 단조성 회복 — sqrt 압축 곡선 (co-visible 역전 해소)                                                                                         | v0.38.0           |
| [#773](https://github.com/coseo12/astro-simulator/issues/773)+[#775](https://github.com/coseo12/astro-simulator/issues/775) | A      | 표면 셰이더 광원 일관성 회복 (사용자 발견 회귀) + 지구 대륙 육지색 mix                                                                                          | v0.40.0           |
| [#782](https://github.com/coseo12/astro-simulator/issues/782)                                                               | A      | 행성 self-rotation (자전) — 9 body + 달, 광원 world normal 옵션 e 전환                                                                                          | v0.42.0           |
| [#774](https://github.com/coseo12/astro-simulator/issues/774)                                                               | A      | 태양 emissive 절차 셰이더 — granulation + limb darkening + 색온도                                                                                               | v0.43.0           |
| [#783](https://github.com/coseo12/astro-simulator/issues/783)                                                               | A      | 지구 극관 + biome 위도 색 변화 (#775 후속 Tier 1)                                                                                                               | v0.44.0           |

> 사이 릴리스 v0.39.0 (#766) / v0.41.0·v0.45.0 (#779) / v0.46.0 (#759) 은 infra (Z-패턴 allowlist / CI alert fatigue / shader-pixel-guard) — 트랙 밖.

---

## 진행 중

- **없음** (2026-07-06 기준). 관찰 잔여 [#759](https://github.com/coseo12/astro-simulator/issues/759)/[#779](https://github.com/coseo12/astro-simulator/issues/779) 는 infra 가드 (트랙 밖).

---

## 후보 (백로그 — 착수 시 이슈 생성 + 해당 ADR 재검토 조건 발동)

전부 트랙 A. 우선순위 미확정 — 착수 시 사용자와 합의 후 이슈 박제.

| 후보                       | ADR 앵커 (재검토 조건)                                                                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 바다 깊이색 (deep/shallow) | [ADR 20260628-756](../decisions/20260628-756-procedural-planet-surface.md) §A3.7 재검토 조건 1 — continents 값 재활용 설계 스케치 박제됨                          |
| 대기 fresnel rim           | [ADR 20260628-756](../decisions/20260628-756-procedural-planet-surface.md) §A3.7 (Tier 2-4) — #774 cameraPosition auto-bind 로 비용 하락, 구름 레이어와 합류 권장 |
| 구름 레이어                | [ADR 20260628-756](../decisions/20260628-756-procedural-planet-surface.md) §A1.8 재검토 조건 5 — 별도 mesh/레이어 트랙, #782 자전과 차등 offset 필요              |
| 야간 도시 불빛             | [ADR 20260628-756](../decisions/20260628-756-procedural-planet-surface.md) §A3.7 (Tier 3) — 구름과 동일 별도 레이어 트랙                                          |
| 코로나 / 플레어            | [ADR 20260703-774](../decisions/20260703-774-sun-emissive-shader.md) §결과·재검토 조건 5 — disk 밖 효과, 별도 빌보드/glow 레이어 후속 이슈 분리 대상              |
| sunspot (흑점)             | [ADR 20260703-774](../decisions/20260703-774-sun-emissive-shader.md) §결과·재검토 조건 2 — granulation 과 시각 혼동 → DoD 측정 기준 오염 리스크 선해소 필요       |
| 사운드 (ambient)           | **ADR 없음** — 방향성 기획 (2026-06-22) 트랙 A 원 항목 (별배경/표면/사운드 중 유일 미착수). 착수 시 신규 ADR 의무                                                 |

트랙 B 후속 후보는 현재 백로그 0 — 사용자 피드백 발생 시 본 표에 추가.

> **착수 시 횡단 검토 (cross-validate agy 고유 발견, 2026-07-06)**: 현행 셰이더 효과는 전부 정적 (painted-on, 시간 변동 0) 이나, **시간 변동 emissive 효과** (코로나/플레어 등) 도입 시 광과민성 감쇠 옵션 (`prefers-reduced-motion` 연동 또는 효과 토글) 을 해당 이슈 DoD 에 동반 검토한다.

---

## R11/R12 회고 갈음 (판단 박제)

**판단: 단독 회고 소급 작성은 생략하고 본 섹션 1줄 요약으로 갈음한다.** 근거: (i) 두 라운드 모두 위성 데이터 확장 소규모 (코어 .ts 0~19줄), (ii) 프로세스 교훈은 각 ADR + CHANGELOG + r10 통합 회고 ([`r10-retrospective.md`](../retrospectives/r10-retrospective.md)) 에 이미 박제, (iii) 소급 회고가 더할 신규 정보 0. CLAUDE.md 마일스톤 회고 의무 관점에서 **본 섹션이 공식 갈음**이다.

- **R11** ([#721](https://github.com/coseo12/astro-simulator/issues/721), v0.33.0, 2026-06-20) — 토성 위성 3 (Rhea/Iapetus/Enceladus). `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` per-body orbit 룩업 첫 발동 (a 편차 15배 양립) + JPL Horizons `REF_PLANE=ECLIPTIC` 명시 의무 교훈. [ADR 20260620-721](../decisions/20260620-721-saturn-moons-rhea-iapetus-enceladus.md)
- **R12** ([#725](https://github.com/coseo12/astro-simulator/issues/725), v0.34.0, 2026-06-21) — 거성 위성 2 (천왕성 Oberon + 해왕성 Proteus). Concrete Prediction "코어 .ts 0줄" 적중 — #721 인프라 재사용 수렴 입증. [ADR 20260621-725](../decisions/20260621-725-giant-moons-oberon-proteus.md)

> 같은 v0.34.0 의 [#728](https://github.com/coseo12/astro-simulator/issues/728) (해왕성 Adams ring arcs) 는 R9 §재검토 후속이며 R-Phase 라운드가 아님 (참고 병기).

---

## 회고 의무 (박제)

- **트랙 A 마무리 시점 회고 1회 의무** — 트랙 A 를 마무리하는 시점 (후보 백로그 소진 또는 사용자와 명시적 종료 합의) 에 `docs/retrospectives/track-a-retrospective.md` 를 작성한다. CLAUDE.md 마일스톤 회고 루틴의 고정 4섹션 (달성도 / 잘 된 것 / 어려웠던 것 / 다음 인수인계) 적용, 범위는 #738 부터 트랙 A 마지막 feature 까지 전체.
- R11/R12 소급 회고는 위 §R11/R12 회고 갈음으로 종결 (재논의 불요).

---

## 참조

- [`roadmap-v3-incremental.md`](roadmap-v3-incremental.md) — 선행 로드맵 (완주)
- [ADR 20260624-738](../decisions/20260624-738-procedural-starfield.md) — 트랙 A 첫 라운드 (별 배경)
- [ADR 20260628-756](../decisions/20260628-756-procedural-planet-surface.md) — 표면 셰이더 본체 + Amendment 1 (#773/#775) / 2 (#782) / 3 (#783), §A1.8·§A3.7 재검토 조건 (후보 백로그 앵커)
- [ADR 20260703-774](../decisions/20260703-774-sun-emissive-shader.md) — 태양 셰이더, §결과·재검토 조건 (코로나/sunspot 앵커)
- [#794](https://github.com/coseo12/astro-simulator/issues/794) — 본 문서 신설 이슈 (2026-07-04 회고 발원, 형제 이슈 #793 산출물 수명주기 / #795 운영 마찰 박제)
- CLAUDE.md 프로젝트 고유 섹션 — "프로젝트 접근" 현행 로드맵 포인터
