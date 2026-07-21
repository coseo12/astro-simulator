# P8 마일스톤 회고 — 내행성계 위성 정밀화 (포보스·데이모스·달 교점역행)

작성: 2026-04-19
대상 마일스톤: P8 (3 PR 분할, v0.8.0 릴리스 후보)
관련 PR: #248 (PR-1 인프라) · #250 (PR-2 Rust) · (본 PR-3 TS + 회고)
메인 이슈: #244

## 달성도 (스프린트 계약 대비)

| DoD                  | 계약 기준                                 | 달성 | 실측                                                                                                                                                                              |
| -------------------- | ----------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1 포보스 공전주기   | 0.31891 day (27540.00s) ±1%               | ✅   | **27564.00 s / rel_err 0.087%** · `test_phobos_period_1pct` (Yoshida4, simplified Keplerian 초기조건, e=0.0151 → 근점 통과 2회 간격)                                              |
| D2 데이모스 공전주기 | 1.26244 day (109080.00s) ±1%              | ✅   | **109115.00 s / rel_err 0.032%** · `test_deimos_period_1pct` (e=0.00033 → vernal node crossing fallback 경로, ADR §측정법 A+B 하이브리드 채택)                                    |
| D3 달 교점역행 주기  | -18.613 yr ±5% (퇴행, retrograde 음수)    | ✅   | **-19.442 yr / rel_err 4.45%** · `test_lunar_node_regression_5pct` (Newton 3체 — 태양+지구+달, 5년 적분, `sample_interval_days=1.0` Nyquist + `smoothing_window_days=180.0` 평활) |
| TS 렌더 통합         | 화성 주위 포보스/데이모스 scene graph     | ✅   | **코드 변경 라인 0** — solar-system.json `parentId=mars` 추가만으로 `updateAtKepler` 자동 처리 (ADR L163-164 예측 정확). CelestialTree 사이드패널 자동 노출 실측                  |
| 회고 + CHANGELOG     | 4섹션 고정 회고 + v0.8.0 Behavior Changes | ✅   | 본 문서 + `CHANGELOG.md` v0.8.0 섹션                                                                                                                                              |

## bench 실측 (P8 증분)

| 컬럼                     | 값                                    | 출처                                                           | 비고                                                                      |
| ------------------------ | ------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `phobos_period_rel_err`  | **0.087%**                            | `packages/physics-wasm/src/nbody.rs` `test_phobos_period_1pct` | DoD 1% 대비 11.5× 여유. Yoshida4, dt=1s, ~27540 step                      |
| `deimos_period_rel_err`  | **0.032%**                            | 동 파일 `test_deimos_period_1pct`                              | DoD 1% 대비 31× 여유. Yoshida4, dt=5s, ~21816 step (vernal node fallback) |
| `lunar_node_rel_err`     | **4.45%** (퇴행)                      | 동 파일 `test_lunar_node_regression_5pct`                      | DoD 5% 대비 1.12× 여유. 3체 Newton, dt=3600s, 5yr × 43824 step            |
| `integrator_yoshida4_ms` | 0.0002 ms/step (P7 유지, ratio 1.59×) | `docs/benchmarks/p7-2026-04-18T12-53-40-617Z.json`             | P8 회귀 baseline (회귀 0)                                                 |
| `eih_1pn_ms` (P6-E 유지) | N=9: 0.0047 ms/step                   | 동일                                                           | P8 은 EIH 미개입 — 유지                                                   |

**WASM 번들 delta = 0 bytes** (ADR 예상 +0.8KB 대비 초과 달성). 헬퍼·테스트 모두 `#[cfg(test)]` 격리로 wasm32 release 제외.

**cargo test 시간 delta = +18s** (226s → 244s). 3 신규 테스트 합계 0.01s, 나머지는 pre-existing re-build 편차.

## ADR 인벤토리 (P8)

- `docs/decisions/20260419-satellite-orbit-hybrid.md` (Accepted 2026-04-19) — 하이브리드 채택 (N-body DoD / Kepler 렌더). §Amendments 3건 (Gemini 교차검증 수용 박제):
  - D3 `sample_interval_days` 30.0 → 1.0 (Nyquist 에일리어싱 회피)
  - D2·D3 상대 좌표계 (`r_rel = r_sat - r_parent`) 명시
  - 후속 이슈 #247 분리 (Osculating elements 동기화, P9/P13 후보)

## 잘 된 것

1. **ADR 예측 정확도 — "렌더 코드 라인 추가 0"** — ADR L163-164 에서 "기존 `parentId` 체인 재사용 → 구현 코드 라인 추가 0" 을 예상했고 PR-3 에서 **정확히 재현**. `solar-system.json` 에 포보스/데이모스 엔티티 2개 추가만으로 CelestialTree 사이드패널 / scene graph / focus 카메라 전환 3 경로가 자동 반영됨. volt [#21](https://github.com/coseo12/volt/issues/21) "신규 함수 ≠ 신규 구현" 교훈 실측 승계 — 기존 추상화 (`parentId` + `updateAtKepler`) 가 물리적으로 옳았기 때문에 P8 같은 확장이 무비용으로 수용됨.

2. **Gemini 교차검증 3건 전원 수용** — ADR 박제 직후 cross-validate 루틴 적용. Gemini 가 지적한 (1) D3 에일리어싱 (sample_interval 30d × 항성월 27.3d beat) (2) 상대 좌표계 누락 (태양 기준 L 에 지구 공전 잔차 주입) (3) 정적 Kepler 의 질량 변경 무반응 (UX 이질감) — 3건 모두 근거가 명확했고, (1)(2) 는 즉시 ADR 에 박제 후 PR-2 구현에 반영했으며 (3) 은 스프린트 비목표와 상충하여 후속 이슈 #247 로 분리 (volt [#29](https://github.com/coseo12/volt/issues/29) "고유 발견 수용 vs 후속 분리 3단 프로토콜" 정확 적용).

3. **DoD 3건 모두 첫 시도 PASS** — PR-2 구현 시 D1 0.087% / D2 0.032% / D3 4.45% 모두 허용 오차 내 1회 통과. 특히 D3 은 5년 적분이 18.6년 주기의 27% 샘플링이라 위험이었으나 Gemini 피드백으로 beat 회피 + smoothing 을 **구현 전**에 계약으로 고정한 것이 주효. CLAUDE.md §스프린트 계약 #10 "수치 DoD 미달 시 측정법 검증 우선" 이 "미달 후 대응" 이 아닌 "설계 단계 예방" 으로 확장되었다.

4. **Phase 분리 릴리스 리듬 성공** — PR-1 (인프라 + #242 선행) / PR-2 (Rust 물리) / PR-3 (TS 통합 + 릴리스) 의 3PR 분할. 각 PR 이 독립 관찰 가능 (#242 선행 머지 → baseline 재측정 → PR-2 → PR-3). CLAUDE.md §릴리스 "Phase 분리 릴리스 리듬" backward-compat 3 조건 충족. 리뷰 분산 + 중간 관찰 + 롤백 독립성 확보.

5. **테스트 증분** — Rust **37 → 40** (PR-2 신규 3) · 번들 delta 0 bytes. TS 는 `solar-system-loader.test.ts` (바디수 18→20 + 화성 자식 어서션) / `time-reversal.test.ts` (9체 의도 보존 명시 필터) 2건 PR-1 에서 보강. 전체 테스트 수 PR-1 기준 **254 PASS**.

## 어려웠던 것

1. **dev 서버 stale 워크트리 원인 tree-phobos 미노출 오진** — 실측 초기 스크린샷에서 CelestialTree 에 포보스/데이모스 누락 관찰. JSON/loader/CelestialTree 코드는 모두 정상이었으나 `/private/tmp/astro-simulator-qa-243/` 에서 기동된 **stale dev 서버** (QA 이전 세션 잔존) 가 3001 포트를 점유. `lsof -i :3001` 로 PID 식별 → 종료 → 현재 feature 브랜치에서 재기동으로 해소. volt [#13](https://github.com/coseo12/volt/issues/13) "빌드 성공 ≠ 의도한 변경" 의 dev 서버 버전 (머지된 JSON 이 실제 브라우저에 반영됐는지 확인 전 stale 캐시 의심). **후속 가드 후보**: dev 서버 기동 시 실행 디렉토리를 HTML 헤더나 HUD 에 표시하면 유사 오진 방지.

2. **URL `?focus=*` → 사이드패널 active 미연동 (기존 이슈, PR-3 범위 밖)** — L3 흐름 검증 중 `http://localhost:3001/ko?mode=research&focus=deimos` 로 URL 직접 진입 시 `tree-deimos` 버튼에 `bg-primary/20` active 클래스 **미적용**. 달 (`focus=moon`) 도 동일. 원인: `url-sync.tsx` 가 `focusOn` command 를 디스패치하지만 `selectedBodyId` store 상태는 클릭 경로에서만 세팅되는 기존 동작. **PR-3 퇴행이 아니며** 이슈 #246 (클릭 정보 패널) 또는 별도 후속 이슈 범위. 이번 스프린트 비목표이므로 박제만 남김.

3. **v0.7.1 PATCH 릴리스 직후 v0.8.0 MINOR 빠른 전환** — 2026-04-19 하루에 PATCH (v0.7.1) → MINOR (v0.8.0) 연속 릴리스. CHANGELOG 가 같은 날짜 두 섹션으로 부풀어짐. 릴리스 리듬 자체는 건강(행동 변화 있을 때만 MINOR) 하나, PATCH 릴리스 종료 직후 MINOR 기능 PR 에 착수하기보다 **하루 격리** 가 관찰 비용 관점에서 더 안전했을 가능성. 본 마일스톤은 타임박스 3~5d 내 완결 우선이어서 의도적 단축했으나 후속 P9 에서는 "이전 릴리스 후 최소 1영업일 관찰 버퍼" 를 기본 규칙화 후보.

4. **`time-reversal.test.ts` 9체 의도 보존 명시 필터 (PR-1)** — 포보스 주기 7.65h × dt=10min = per-step 1/45 period 누적 오차가 기존 1e-9 임계를 초과. 전체 바디를 포함하면 원 테스트의 "9체 대칭성" 의도가 **침식** 되므로 화성 위성을 명시 필터하여 의도 보존. PR-1 주석 + PR 본문 + 본 회고 3위치 박제 (volt [#31](https://github.com/coseo12/volt/issues/31) 재조정 박제 규칙 준수). 위성 역행 검증은 PR-2 `measure_moon_orbital_period` 로 대체.

5. **혜성 3종이 태양 자식으로 depth=1 로 렌더** — L1 실측 HTML 조사 중 `tree-halley` / `tree-encke` / `tree-swift-tuttle` 이 화성과 동일 depth (padding-left:20px) 로 렌더됨을 관찰. JSON 확인 결과 parentId=sun 이므로 **의도 동작**. 단 UX 관점에선 "혜성 카테고리" 그룹핑이 자연스러울 수 있음. 본 PR 범위 밖이나 P14 배포 전 UX 정비 후보로 기록.

## 다음 인계 (P9 후보 + 기술부채)

> **로드맵 v2 참조**: `project_p8_p16_roadmap.md` (개인 메모리 초안 — 정식 문서화본: [roadmap-v2-solar-precision.md](../deprecated/phases/roadmap-v2-solar-precision.md), 개인 절대 경로 링크 제거 #842)

### P8 → P9 구체적 이관

1. **[P9] 목성계 — Galilean 4위성 + 고리 3층** — 3~5d. DoD: Laplace 공명 1:2:4 (이오/유로파/가니메데) 주기 ±1% / Halo·Main·Gossamer 고리 시각. P8 에서 정립된 Rust `measure_moon_orbital_period` + Kepler 렌더 하이브리드 패턴 그대로 계승. 신규 위성 4종 + 고리 3층 JSON 추가만 예상.

2. **[후속 #247] Osculating elements 동기화 파이프라인 (P9/P13 후보)** — Gemini 교차검증 고유 발견 분리. 질량 배수 변경 시 위성 궤도 미반응 (정적 Kepler 한계). ADR §Amendments 에 박제. P9 목성계 (공명 3체 역학) 또는 P13 정밀 보정 Phase 에서 통합 검토.

3. **[후속 #245] 위성 줌 토글 (`?satellites=zoomed` 옵트인)** — 위성이 실 스케일에서 화면상 서브픽셀. 클릭·탐색 UX 개선 위해 확대 토글. priority:medium. P14 배포 전 UX 정비와 병합 가능성.

4. **[후속 #246] 위성 클릭 정보 패널** — 위성 mesh 클릭 시 celestial-info-panel 에 궤도 요소 표시. 본 회고 §어려웠던 것 #2 (URL focus active 연동) 와 동일 경로에서 해소 가능. priority:medium.

5. **[후속 #251] vsync 실효성 가드** — PR-1 에서 bench-scene vsync 페그 해소했으나 `stdev_ratio` 필드 신설은 구조 변경이라 분리. 다회 샘플링 + stdev_ratio 조합으로 측정 품질 지표 통합 권고. priority:medium.

### 회고 → 가드 제도화

- [x] **ADR Amendments 표준 포맷 계승** — P7-E #224 에서 도입된 `docs/decisions/README.md` §Amendments 표준을 P8 ADR (20260419-satellite-orbit-hybrid) 에서 실제 적용. Gemini 교차검증 3건을 Amendments 표로 박제하여 재발견 시 추적 가능.
- [x] **Phase 분리 릴리스 리듬 실증** — 3PR 분할 (인프라 / 물리 / 통합) 성공. P9 이후에도 위성 추가 시 동일 분할 권고 (JSON 선행 → Rust DoD → TS 통합).
- [x] **bench 컬럼 +1 이상 원칙 계승** — P8 은 `phobos_period_rel_err` / `deimos_period_rel_err` / `lunar_node_rel_err` 3건 신규. P9 이후 행성계 Phase 마감 시 유사하게 DoD rel_err 컬럼 +1 이상 원칙 유지.
- [ ] **dev 서버 버전 표시 가드** — 본 회고 §어려웠던 것 #1 stale 워크트리 오진 방지. HUD 또는 페이지 메타에 빌드 경로/git SHA 표시를 하네스 개선안 후보로 제안 (volt 캡처 검토).
