# 로드맵 트랙 A/B — v3 완주 이후 작업 축

> **Status**: Active — 트랙 B 관찰 모드 정보 카드 · 천체 메뉴 완료 (v0.92.0) · 트랙 A 천왕성 · 해왕성 표면 완료 (v0.91.0) · 트랙 B 2라운드 완료 (v0.90.0) / 트랙 A 후보 백로그 잔여 / 트랙 C·D 방향 결정 대기
> **최종 갱신**: 2026-10-05 (v0.92.0 릴리스 준비 — [#1281](https://github.com/coseo12/astro-simulator/issues/1281) §완료 추가)
> **박제일**: 2026-07-06 ([#794](https://github.com/coseo12/astro-simulator/issues/794) — 2026-07-04 프로젝트 회고 후속)
> **선행 로드맵**: [`roadmap-v3-incremental.md`](roadmap-v3-incremental.md) — **완주** (2026-06-12, R10b [#664](https://github.com/coseo12/astro-simulator/issues/664) / PR [#670](https://github.com/coseo12/astro-simulator/pull/670), 전 27 body 시각화)
> **출처**: 방향성 기획 (2026-06-22, 세션 단위 — 저장소 문서 부재). 본 문서가 그 기획의 **저장소 SSoT 승격본**이다.

---

## 배경

v3 완주 직후 진단 (2026-06-22 방향성 기획): **"엔진·콘텐츠는 완성, 경험 레이어 미착수"** — 배경 단색 / 표면 텍스처 0 / 오디오 0 (grep 실측). "감상/탐험형" 정체성인데 도표형에 머묾. 이에 5 트랙을 도출했다:

| 트랙  | 테마                                  | 상태                                                          |
| ----- | ------------------------------------- | ------------------------------------------------------------- |
| **A** | 몰입 (별 배경 / 표면 디테일 / 사운드) | **진행 중** (본 문서 §완료/§후보)                             |
| **B** | 온보딩 (discoverability, no-regret)   | 1라운드 (#737, #740+#749) · **2라운드 (#1265, v0.90.0)** 완료 |
| C     | 교육 깊이                             | 미착수 — 후보만 박제 (§후보, 방향 결정 대기)                  |
| D     | 관측 실용                             | 미착수 — 후보만 박제 (§후보, 방향 결정 대기)                  |
| E     | 폴리시                                | 미착수                                                        |

추천 시퀀스 = **B (no-regret) → A → 방향 결정 후 C/D**. 실제 진행도 이 순서를 따랐다 (#737 온보딩 → 트랙 A 연속 라운드).

이 기획이 이슈·세션 메모리에만 존재해 **신규 세션이 "지금 어디쯤"을 문서로 회수 불가**하던 공백 (2026-07-04 회고 실측 — `roadmap-v3-incremental.md` 마지막 갱신이 v3 완주 선언, 이후 8+ feature 문서 공백) 을 본 문서가 해소한다.

---

## 완료 (2026-06-24 ~ 2026-10-05)

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
| [#1197](https://github.com/coseo12/astro-simulator/issues/1197)                                                             | A      | 지구 바다 깊이 색 — `baseColor` 파생 감쇠 (ADR `20260628-756` Amendment 7)                                                                                      | v0.86.0           |
| [#1202](https://github.com/coseo12/astro-simulator/issues/1202)                                                             | A      | 지구 대기 산란 rim — 공유 셰이더 혼입 (ADR `20260628-756` Amendment 8)                                                                                          | v0.87.0           |
| [#1215](https://github.com/coseo12/astro-simulator/issues/1215)                                                             | A      | 지구 구름 레이어 — host 자식 shell · ALPHABLEND · 정렬 키 치환 (ADR `20260628-756` Amendment 10)                                                                | v0.88.0           |
| [#1226](https://github.com/coseo12/astro-simulator/issues/1226)                                                             | A      | 지구 야간 도시 불빛 — 표면 셰이더 혼입, 대륙 노이즈 임계 재사용 (ADR `20260628-756` Amendment 11)                                                               | v0.89.0           |
| [#1265](https://github.com/coseo12/astro-simulator/issues/1265)                                                             | B      | 런타임 표시 토글 패널 — 상단 바 「표시」 에서 궤도선 · 별 배경 · 구름 · 야간 불빛 토글, URL 반영 (ADR `20260927-1265`, PR #1267 core + #1268 web)               | v0.90.0           |
| [#1274](https://github.com/coseo12/astro-simulator/issues/1274)                                                             | A      | 천왕성 · 해왕성 절차 표면 — `IceGiant` 저대비 위도 밴드 + uranus albedo 배율 (ADR `20260628-756` Amendment 12, PR #1276 테이블 이관 + #1278 표면)               | v0.91.0           |
| [#1281](https://github.com/coseo12/astro-simulator/issues/1281)                                                             | B      | 관찰 모드 천체 정보 카드 + 상단 바 「천체 ▾」 메뉴 + 모바일 레이아웃 결함 (`ui-architecture.md` §2.3 · §2.6 · §3.1, PR #1282 카드 + #1283 메뉴·모바일)          | v0.92.0           |

> 사이 릴리스 v0.39.0 (#766) / v0.41.0·v0.45.0 (#779) / v0.46.0 (#759) 은 infra (Z-패턴 allowlist / CI alert fatigue / shader-pixel-guard) — 트랙 밖.

> **§완료 행은 릴리스 확정 뒤에 추가한다 — 「미확정」 칸을 만들지 않는다.** 착수~머지 구간은 아래 §진행 중 에 둔다. 근거 ([#1224](https://github.com/coseo12/astro-simulator/issues/1224)): 이전 판은 `#1202` 칸을 「릴리스 확정 전」으로 두고 「릴리스 준비 PR 이 확정한다」고 규정했으나, v0.87.0 · v0.88.0 준비 PR 둘 다 확정하지 않았다 — 집행 주체가 없는 규정이었다.

> ⚠️ **이 규칙도 같은 결함을 재발시켰다** — #1226 은 v0.89.0 에 릴리스됐는데 v0.89.4 까지 §진행 중 에 남아 있었다 ([#1264](https://github.com/coseo12/astro-simulator/issues/1264) 에서 이동). 「릴리스 확정 뒤 옮긴다」에도 옮기는 주체가 지정돼 있지 않다.

---

## 진행 중

없음 — #1281 은 v0.92.0 으로 §완료 에 올렸다 (v0.92.0 릴리스 준비 PR 에서 버전 확정과 함께). #1281 은 착수~머지 구간에 §진행 중 을 거치지 않았다. 직전 #1274 는 v0.91.0 으로 §완료 이동했다.

---

## 후보 (백로그 — 착수 시 이슈 생성 + 해당 ADR 재검토 조건 발동)

우선순위 미확정 — 착수 시 사용자와 합의 후 이슈 박제. 2026-09-26 재구성 ([#1264](https://github.com/coseo12/astro-simulator/issues/1264)): ADR 의 재검토 조건·비-범위·후속 분리 절과 `docs/phases/` 원설계를 전수 조사해 **제품 표면**(가드·CI 제외) 후보만 올렸다. 앵커는 전부 원문 대조했다.

| 후보                                                                 | 트랙 | 앵커 (재검토 조건 / 후속 분리)                                                                                                                                      | 선행 조건·리스크                                                                                               |
| -------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 지구 밖 천체 표면 확장 — rocky 파라미터화 · ice giant/위성 표면 타입 | A    | [ADR 20260628-756](../decisions/20260628-756-procedural-planet-surface.md) §결과·재검토 조건 3 (표면 타입 확장) · §A1.8 재검토 조건 4 (다른 rocky body)             | earth 전용 상수 상속 — 대기 없는 body 가 rim·불빛을 상속한다 (같은 ADR §A8.9 결정 5). body 별 파라미터화 선행  |
| 천체 검색 + 3D 이름 라벨                                             | B    | [ADR 20260620-713](../decisions/20260620-713-click-body-select.md) §기각/후속 분리 (1) — 라벨 클릭 확장                                                             | 텍스트 라벨 인프라 `0` (Babylon GUI 미사용). 겹침·LOD·HUD 가드 영향                                            |
| 코로나 / 플레어                                                      | A    | [ADR 20260703-774](../decisions/20260703-774-sun-emissive-shader.md) §결과·재검토 조건 5 — disk 밖 효과, 별도 빌보드/glow 레이어                                    | glow/bloom 파이프라인 `0` — 혜성 꼬리와 레이어 공유 가능. 시간 변동 효과면 광과민성 옵션 동반 (아래 횡단 검토) |
| 혜성 꼬리 / 코마                                                     | A    | [ADR 20260612-r10b](../decisions/20260612-r10b-comets-visualization.md) §비-범위 (R10b — PM Q4)                                                                     | 현재 점광원 + 궤도선만. 코로나와 같은 glow 레이어 선행                                                         |
| sunspot (흑점)                                                       | A    | [ADR 20260703-774](../decisions/20260703-774-sun-emissive-shader.md) §결과·재검토 조건 2                                                                            | granulation 과 시각 혼동 → DoD 측정 기준 오염 리스크 선해소 필요                                               |
| 사운드 (ambient)                                                     | A    | **ADR 없음** — 방향성 기획 (2026-06-22) 트랙 A 원 항목 (별배경/표면/사운드 중 유일 미착수)                                                                          | 착수 시 신규 ADR 의무. 브라우저 자동재생 정책                                                                  |
| 달 위상 / 일식·월식 그림자                                           | A·C  | [ADR 20260520-r4](../decisions/20260520-r4-earth-moon-visualization.md) §비-범위 — 「후속 별도 이슈」                                                               | 그림자 처리 `0`. 셰이더·픽셀 가드 전반 영향                                                                    |
| 교육 모드 활성화 — 가이드 투어 · 설명 바                             | C    | [`ui-architecture.md`](ui-architecture.md) §3.3 교육 모드 · `apps/web/src/components/layout/mode-switcher.tsx` 의 `education` 모드 (`enabled: false`, 「P2+ 예정」) | 카메라 제어권 설계 선행 (free-fly 상태기계 — #1113 재평가와 연결)                                              |
| 별자리 선 / 이름 라벨                                                | C    | [ADR 20260624-738](../decisions/20260624-738-procedural-starfield.md) §후속 분리 후보 — 「교육 트랙」                                                               | 현재 별은 절차 배치라 실측 카탈로그(같은 절) 선행                                                              |
| 시간 스크러버 + 이벤트 마커 (근일점·합·식)                           | D    | [`ui-architecture.md`](ui-architecture.md) §3.2 연구 모드 TimeBar · `time-controls.tsx` 헤더 주석 「로그 스크러버는 추후 확장」                                     | 이벤트 계산(식·합) 은 신규 도메인 로직                                                                         |
| 측정 도구 (두 천체 거리 ruler) · 궤적 trail                          | D    | [`ui-architecture.md`](ui-architecture.md) §3.2 연구 모드 캔버스 오버레이 · [`product-spec.md`](product-spec.md) 연구 모드 「측정 도구」                            | —                                                                                                              |

> 제거된 행: **야간 도시 불빛** → [#1226](https://github.com/coseo12/astro-simulator/issues/1226) (v0.89.0) / **바다 깊이색** → [#1197](https://github.com/coseo12/astro-simulator/issues/1197) (v0.86.0) / **대기 fresnel rim** → [#1202](https://github.com/coseo12/astro-simulator/issues/1202) (v0.87.0) / **구름 레이어** → [#1215](https://github.com/coseo12/astro-simulator/issues/1215) (v0.88.0) — 전부 위 §완료 표로 이동했다. **런타임 표시 토글 패널** → [#1265](https://github.com/coseo12/astro-simulator/issues/1265) (v0.90.0) — 위 §완료. 같은 낱말이 §완료 에 남아 있는 것은 정상이다.

> ⚠️ **부기 (2026-10-02, [#1274](https://github.com/coseo12/astro-simulator/issues/1274))**: 첫 행 「지구 밖 천체 표면 확장」 의 리스크 칸 「대기 없는 body 가 rim·불빛을 상속한다」 는 상속 범위를 잘못 적었다. 어떤 body 를 `SurfaceType.Rocky` 로 재분류하면 **biome 육지색 · 극관 · 바다 깊이 감쇠 · fbm 대륙 · rim 은 무조건** 상속되고, **불빛은 조건부**다 — 게이트가 `uMaskEnabled` 를 곱하므로 `SURFACE_MASK_BY_BODY` 등록 + 마스크 로드 완료 + 투영 disk `≥ SURFACE_MASK_MIN_DISK_PX` (`16`) 일 때만 켜진다 (코드 경로 판독 — [ADR 20260628-756 §A12.3](../decisions/20260628-756-procedural-planet-surface.md)). 원문은 소급 수정하지 않는다. 착수 범위: #1274 는 ice giant (uranus · neptune) 만 — Rocky 재분류 · Cratered 확장은 이 행에 잔류한다.

> ⚠️ **부기 (2026-10-04, [#1274](https://github.com/coseo12/astro-simulator/issues/1274) PR2)**: 첫 행의 ice giant (uranus · neptune) 부분은 #1274 로 §진행 중 에 올렸다. 행은 지우지 않는다 — 잔여 (Rocky 재분류 · Cratered 확장 · 위성 표면 타입) 가 남아 있다.

> ⚠️ **부기 (2026-10-04, v0.91.0 릴리스 준비)**: 위 부기의 ice giant 부분은 #1274 가 v0.91.0 으로 §완료 이동했다. 첫 행은 잔여 (Rocky 재분류 · Cratered 확장 · 위성 표면 타입) 로 유지한다.

> **트랙 C·D 는 방향 결정 대기** — 위 표의 C·D 행은 후보 박제일 뿐 착수 합의가 아니다. 착수 시 트랙 표 상태와 본 문서 제목 범위(「트랙 A/B」)를 함께 재검토한다.

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
- [ADR 20260628-756](../decisions/20260628-756-procedural-planet-surface.md) — 표면 셰이더 본체 + Amendment 1~12 (#773/#775 · #782 · #783 · #1119 · #1130 · #1157 · #1197 · #1202 · #1205 · #1215 · #1226 · #1274), §A1.8·§A3.7·§A10.14 재검토 조건 (후보 백로그 앵커)
- [ADR 20260703-774](../decisions/20260703-774-sun-emissive-shader.md) — 태양 셰이더, §결과·재검토 조건 (코로나/sunspot 앵커)
- [#794](https://github.com/coseo12/astro-simulator/issues/794) — 본 문서 신설 이슈 (2026-07-04 회고 발원, 형제 이슈 #793 산출물 수명주기 / #795 운영 마찰 박제)
- CLAUDE.md 프로젝트 고유 섹션 — "프로젝트 접근" 현행 로드맵 포인터
