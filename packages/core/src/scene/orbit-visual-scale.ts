/**
 * Parent-Satellite Orbit Visual Scale — SSoT.
 *
 * 실측 궤도 거리(`solar-system.json` 의 semi-major axis 등) 와 박제값 (BODY_SCALE) 만으로는
 * satellite mesh radius 가 parent-satellite 거리를 능가하여 시각적 fusion 이 발생한다.
 * 본 모듈은 **rendering 시점에만** parent 기준 satellite local orbit 좌표에 visual scale 을
 * 곱해 시각 분리를 보장한다 — 실측 데이터 SSoT (`solar-system.json`) / BODY_SCALE 박제값
 * (`apps/web/src/constants/body-scale.ts`) 은 변경 없음.
 *
 * ## 적용 위치
 *
 *   - `solar-system-scene.ts` 의 `resolveWorld` — parent + (local × visual_scale) 산출 (mesh 경로)
 *   - `solar-system-scene.ts` 의 `rebuildOrbitLines` — #627 부터 **모든 satellite orbit LineSystem**
 *     (parent 별 `Map<string, LineSystem>`) 의 `.scaling` 적용. R5 까지 moon LineSystem 만 적용되어
 *     phobos/deimos/galilean 궤도선이 visual scale 미적용 + parent 미추적으로 태양 원점에 잘못
 *     렌더됐던 결함을 옵션 A (moon 패턴 일반화) 로 해소 (ADR `20260606-627-satellite-orbit-structure-forensic.md`).
 *
 * ## 박제값 산출 근거 (R4 #539 Amendment 2 forensic, 2026-05-21)
 *
 * earth-moon:
 *   - earth-moon 실측 거리 = 3.847e8 m (NASA/JPL Fact Sheet)
 *   - earth mesh radius (earthScale=800) = 5.103e9 m
 *   - moon mesh radius (moonScale=800) = 1.390e9 m
 *   - sum mesh radius = 6.493e9 m → 실측 거리의 **16.9배** (mesh > distance → fusion)
 *   - visual_scale=30 적용 시 visual 거리 = 1.154e10 m → sum mesh / visual 거리 = **1.78배** 분리 마진
 *     (분리 임계 ≥ 1.5x 통과 +0.28)
 *
 * 후보 비교 (8개, ADR §결정 6 §Visual scale 후보 비교):
 *   ×10 (0.59x fail) / ×15 (0.89x fail) / ×20 (1.18x 통과 한계) / ×25 (1.48x 경계)
 *   / **×30 (1.78x 선택)** / ×40 (2.37x 보수) / ×50 (2.96x fallback 1) / ×75 (4.45x fallback 2)
 *
 * ## R5+ satellite SSoT 패턴
 *
 * R5 (mars/phobos/deimos) / R6 (jupiter/galilean) / R7 (saturn/titan) 진입 시 동일 패턴.
 * 각 parent-satellite 쌍별로 박제값 추가 (forensic 측정 후 확정).
 *
 * ## R5 박제 (#594, 2026-05-28) — satellite 2개 첫 본 사례
 *
 * mars-phobos (binding constraint):
 *   - mars-phobos 실측 거리 = 9.376e6 m (JPL SSD, semiMajorAxisAU 6.26752e-5)
 *   - mars mesh radius (marsScale=800) = 2.717e9 m
 *   - phobos mesh radius (phobosScale=5000) = 5.54e7 m
 *   - sum mesh radius = 2.772e9 m → 실측 거리의 **295.6배** (R4 moon 16.9배 의 17.5배 더 극단)
 *   - visual_scale=500 적용 시 visual 거리 = 4.688e9 m → sum mesh / visual 거리 = **1.69배** 분리 마진
 *     (분리 임계 ≥ 1.5x 통과 +0.19, R4 1.78배 와 거의 동등 안정)
 *   - ⚠️ **위 산식 A(설계 real-meter 비)와 런타임 산식 B(scene-unit `satellite.dist / parent.bsRadius`,
 *     실측 phobos≈0.99)의 ~1.7배 gap 은 측정-정의 차이이지 버그가 아니다** (#622 NO-OP ADR
 *     `docs/decisions/20260609-622-orbit-scale-gap-no-op.md`). boundingSphere 타이밍(#611 패턴) 아님이
 *     실측 확정 (stale/fresh=1.0) — scale(BODY/ORBIT_VISUAL/render) 합성 정의 차이. 재오인 분석 금지.
 *
 * mars-deimos (자동 안전):
 *   - mars-deimos 실측 거리 = 23.463e6 m (JPL SSD, semiMajorAxisAU 1.5684e-4)
 *   - sum mesh radius = 2.748e9 m (mars 2.717e9 + deimos 3.135e7) → 실측 거리의 117.1배
 *   - visual_scale=500 적용 시 visual 거리 = 1.173e10 m → sum mesh / visual 거리 = **4.27배** 분리 마진
 *     (phobos 가 binding constraint 이고 deimos 는 자동 안전 — 단일 룩업으로 둘 다 처리)
 *
 * 후보 비교 (8개, R5 ADR §결정 4 §축 4 후보 비교):
 *   ×100 (0.34x fail) / ×200 (0.68x fail) / ×300 (1.02x ε통과 — 마진 부족) / ×400 (1.35x 미통과)
 *   / **×500 (1.69x 선택)** / ×600 (2.03x 보수) / ×750 (2.54x fallback) / ×1000 (3.38x 과도)
 *
 * 명명 결정 (cross-validate 이견 수용 #1, 2026-05-28): `MARS_SATELLITES_ORBIT_VISUAL_SCALE`
 * — deimos 도 포함하므로 `MARS_PHOBOS_*` 보다 정확. R6+ 다중 satellite (galilean 4 / titan +
 * saturn moons 다수) 일관성 우선. R4 `EARTH_MOON_*` 답습 무시 (R4 가 단일 satellite 특수 사례).
 *
 * ## 참고 ADR
 *
 *   - `docs/decisions/20260520-r4-earth-moon-visualization.md` §Amendment 2 — forensic 박제 (earth-moon)
 *   - §결정 6 §Visual scale 후보 비교 — 8개 후보 분리 마진 비교
 *   - §Concrete Prediction §예측 1~4 — D2.1~D2.6 검증 의무
 *   - `docs/decisions/20260528-r5-mars-visualization.md` §결정 4 — mars-satellites 박제
 *   - §축 4 후보 비교 — 8개 후보 분리 마진 비교 (mars-phobos binding constraint)
 *   - §위험 #6 + §재검토 트리거 #4 — `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 신규 룩업 Amendment 가능성
 */

/**
 * Earth-Moon 궤도 visual scale 배수.
 *
 * `moon world position = earth world position + (moon local orbit × 30)` 로 산출.
 * 실측 거리 3.847e8 m 는 보존되며 rendering 단계에서만 ×30 적용.
 *
 * D-T2 미통과 시 fallback: 30 → 50 (1단계) → 75 (2단계). 75 미통과 시 Amendment 3 발동.
 */
export const EARTH_MOON_ORBIT_VISUAL_SCALE = 30;

/**
 * Mars-Satellites 궤도 visual scale 배수 (phobos + deimos 둘 다 적용).
 *
 * `phobos world position = mars world position + (phobos local orbit × 500)` 로 산출.
 * `deimos world position = mars world position + (deimos local orbit × 500)` 동일.
 * 실측 거리 (phobos 9.376e6 m / deimos 23.463e6 m) 는 보존되며 rendering 단계에서만 ×500 적용.
 *
 * 분리 마진: phobos 1.69x (binding constraint) / deimos 4.27x (자동 안전).
 *
 * D-T2 미통과 시 fallback: 500 → 600 → 750. 750 미통과 시 Amendment 1 (deimos 별도 룩업 도입).
 * `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 신규 룩업 가능성 (R5 ADR §위험 #6).
 *
 * R6+ SSoT: galilean (io/europa/ganymede/callisto) / titan 등 satellite 진입 시
 * 동일 단일 룩업 (`ORBIT_VISUAL_SCALE_BY_PARENT.jupiter` 등) 우선. 사실 비율 편차 큰 satellite
 * (예: io vs callisto) 는 Amendment 1 가능.
 */
export const MARS_SATELLITES_ORBIT_VISUAL_SCALE = 500;

/**
 * Jupiter-Galilean 궤도 visual scale 배수 (io/europa/ganymede/callisto 4개 적용).
 *
 * `io world position = jupiter world position + (io local orbit × 16)` (나머지 3개 동일).
 * 실측 거리 (io 4.2023e8 m ~ callisto 1.8826e9 m) 는 보존되며 rendering 단계에서만 ×16 적용.
 *
 * 분리 마진 (산식 A, 설계 임계): io 1.69x (binding constraint) / callisto 7.25x (자동 안전).
 * jupiterScale=48 (mesh 4.8배 확대) 의 결합 효과로 R5 ×6 → ×16 동반 상향 (기존 ×6 은 io 0.63x
 * 묻힘). io 마진 1.69x 는 R5 phobos 1.69x 와 정확 정합 (검증된 binding 마진 답습).
 *
 * D-T2 미통과 시 fallback: callisto 분리 과도 (4.29배 편차) → `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY`
 * 신규 룩업 (R6 ADR §위험 #3 + §재검토 트리거 #3).
 *
 * R6 ADR `20260605-r6-jupiter-galilean-visualization.md` §결정 4 — 산식 A(설계 임계) / B(검증 metric)
 * 정의 분리 박제 (R5 §결정 4 Amendment 1 정정 적용).
 */
export const JUPITER_SATELLITES_ORBIT_VISUAL_SCALE = 16;

/**
 * Saturn-Satellites 궤도 visual scale 배수 (R7 titan 단일 — R8+ enceladus 등 확장 전제 복수형).
 *
 * `titan world position = saturn world position + (titan local orbit × 10)` 로 산출.
 * 실측 거리 (titan 1.22187e9 m = 8.1677e-3 AU) 는 보존되며 rendering 단계에서만 ×10 적용.
 *
 * **binding constraint = ring outer mesh (R4/R5/R6 과 다른 신규 유형)** — R7 ring × bodyScale
 * 결합 (ADR §축 2a) 으로 F ring outer mesh (1.4018e8 × 48 = 6.7286e9 m) 가 saturn mesh
 * (2.8929e9 m) 의 2.326배까지 확장되므로 parent mesh 가 아닌 **ring outer 가 분모**.
 * ring 미고려 시 ×4 가 1.55x 로 통과하는 것처럼 보이는 함정값 (실제 0.70x fail — 고리 안에 묻힘).
 *
 * 산식 A (설계 임계, real-meter — #622 NO-OP SSoT: 산식 B 와 직접 비교 금지):
 *   titan 분리 마진 = (1.22187e9 × 10) / (6.7286e9 + 2.575e8) = 1.75x (≥ 1.5 통과 +0.25,
 *   R4 moon 1.78x 근접 정합). 후보: ×4 0.70x fail / ×9 1.57x 박빙 / **×10 1.75x 선택** / ×12 2.10x 과분리.
 *
 * D-T2 미통과 시 fallback: 궤도선-고리 시각 간섭 보고 시 ×10 → ×12 (R7 ADR §위험 #3).
 * R8+ uranus (ring 보유) 진입 시 본 "binding = ring outer" 유형 답습 (R7 ADR §R8 인계 #2).
 *
 * R7 ADR `20260610-r7-saturn-titan-rings-visualization.md` §축 4.
 */
export const SATURN_SATELLITES_ORBIT_VISUAL_SCALE = 10;

/**
 * Uranus-Satellites 궤도 visual scale 배수 (R8 titania 단일 — R9+ oberon/miranda 등 확장 전제 복수형).
 *
 * `titania world position = uranus world position + (titania local orbit × 50)` 로 산출.
 * 실측 거리 (titania 4.3591e8 m = 2.91388e-3 AU) 는 보존되며 rendering 단계에서만 ×50 적용.
 *
 * **binding constraint = ring outer mesh (R7 신규 유형의 2번째 인스턴스)** — ring × bodyScale
 * 결합으로 ε ring outer mesh (5.1149e7 × 250 = 1.2787e10 m) 가 uranus mesh (6.3898e9 m) 의
 * 2.001배까지 확장되므로 parent mesh 가 아닌 **ring outer 가 분모**.
 * ⚠️ ring 미고려 시 ×30 이 2.05x 로 통과처럼 보이는 함정값 (실제 0.99x fail — 고리 안에 묻힘).
 *
 * 산식 A (설계 임계, real-meter — #622 NO-OP SSoT: 산식 B 와 직접 비교 금지):
 *   titania 분리 마진 = (4.3591e8 × 50) / (1.2787e10 + 3.942e8) = 1.65x (≥ 1.5 통과 +0.15,
 *   R5 phobos / R6 io 1.69x 근접 정합). 후보: ×30 0.99x fail (함정값) / ×45 1.49x 경계 미달
 *   / **×50 1.65x 선택 (정수 단순)** / ×55 1.82x / ×60 1.98x 과분리.
 *
 * D-T2 미통과 시 fallback: 궤도선-고리 시각 간섭 보고 시 ×50 → ×55 (마진 1.82x —
 * R8 ADR §재검토 트리거 #4). titania 궤도는 ecliptic inclination ~98° 세로 궤도로 렌더 —
 * 사실 정합 (uranus 계 전체 누움), 버그 오인 금지 (ADR §축 3 사전 등록).
 *
 * R8 ADR `20260610-r8-uranus-titania-rings-visualization.md` §축 4.
 */
export const URANUS_SATELLITES_ORBIT_VISUAL_SCALE = 50;

/**
 * Neptune-Satellites 궤도 visual scale 배수 (R9 triton 단일 — R10+ nereid/proteus 등 확장 전제 복수형).
 *
 * `triton world position = neptune world position + (triton local orbit × 75)` 로 산출.
 * 실측 거리 (triton 3.54759e8 m = 2.37142e-3 AU) 는 보존되며 rendering 단계에서만 ×75 적용.
 *
 * **binding constraint = ring outer mesh (R7 신규 유형의 3번째 인스턴스)** — ring × bodyScale
 * 결합으로 Adams ring outer mesh (6.293e7 × 250 = 1.57325e10 m) 가 neptune mesh (6.191e9 m) 의
 * 2.541배까지 확장되므로 parent mesh 가 아닌 **ring outer 가 분모**.
 * ⚠️ ring 미고려 시 ×50 (uranus 답습) 이 2.69x 로 통과처럼 보이는 함정값 (실제 1.10x fail —
 * 고리 안에 묻힘). Adams ring 의 상대 확장 (2.541) 이 uranus ε (2.001) 보다 커서 ice giant
 * 동일 scale 답습이 미달 — visual scale 동반 상향 필요.
 *
 * 산식 A (설계 임계, real-meter — #622 NO-OP SSoT: 산식 B 와 직접 비교 금지):
 *   triton 분리 마진 = (3.54759e8 × 75) / (1.57325e10 + 4.0602e8) = 1.65x (≥ 1.5 통과 +0.15,
 *   R8 titania 1.65x 정확 동률 + R5 phobos/R6 io 1.69x 근접 정합). 후보: ×50 1.10x fail (함정값)
 *   / ×70 1.54x 경계 +0.04 / **×75 1.65x 선택** / ×80 1.76x / ×100 2.20x 과분리.
 *
 * D-T2 미통과 시 fallback: 궤도선-고리 시각 간섭 보고 시 ×75 → ×80 (마진 1.76x —
 * R9 ADR §재검토 트리거 #4). triton 궤도는 ecliptic inclination 129.14° **역행** (태양계 유일
 * 대형 역행 위성) — 공전 애니메이션 방향이 다른 모든 body 와 반대인 것이 사실 정합,
 * 버그 오인 금지 (ADR §축 3 사전 등록, PM Q1).
 *
 * R9 ADR `20260610-r9-neptune-triton-rings-visualization.md` §축 4.
 */
export const NEPTUNE_SATELLITES_ORBIT_VISUAL_SCALE = 75;

/**
 * parent body id 별 satellite orbit visual scale 룩업.
 *
 * R5+ 진입 시 parent-satellite 쌍별로 박제값 추가. 미정의 parent 는 1.0 (실측 그대로).
 */
export const ORBIT_VISUAL_SCALE_BY_PARENT: Readonly<Record<string, number>> = Object.freeze({
  earth: EARTH_MOON_ORBIT_VISUAL_SCALE, // R4 #539 Amendment 2 — moon visual fusion 해결
  mars: MARS_SATELLITES_ORBIT_VISUAL_SCALE, // R5 #594 — phobos + deimos 단일 룩업 (binding constraint=phobos)
  jupiter: JUPITER_SATELLITES_ORBIT_VISUAL_SCALE, // R6 #621 — galilean 4 단일 룩업 (binding constraint=io, 마진 1.69x)
  saturn: SATURN_SATELLITES_ORBIT_VISUAL_SCALE, // R7 #641 — titan 단일 룩업 (binding constraint=ring outer 신규 유형, 마진 1.75x). R11 #721 — saturn 위성은 per-body 룩업 우선 (아래 ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY). 본 parent 룩업은 fallback 안전망 (per-body 미정의 위성 보호)
  uranus: URANUS_SATELLITES_ORBIT_VISUAL_SCALE, // R8 #647 — titania 단일 룩업 (binding constraint=ring outer 2번째 인스턴스, 마진 1.65x — ×30 은 ring 미고려 함정값)
  neptune: NEPTUNE_SATELLITES_ORBIT_VISUAL_SCALE, // R9 #653 — triton 단일 룩업 (binding constraint=ring outer 3번째 인스턴스, 마진 1.65x — ×50 uranus 답습은 1.10x 함정값)
});

/**
 * R11 #721 — body id 별 satellite orbit visual scale 룩업 (**per-body 첫 발동**).
 *
 * R5 §위험 #6 (2026-05-28) 에서 인터페이스 설계 인계 → R6 §재검토 트리거 #3 (2026-06-05) 발동 조건
 * 정밀화 → **본 ADR (2026-06-20) 첫 실전 도입**. 1.5개월 인계 후 첫 발동.
 *
 * ## 발동 근본 원인 — a 편차 14.96배 (단일 룩업 한계)
 *
 * 토성계 4 위성 (titan 포함) 의 a 편차가 enceladus (최내곽 0.00159 AU) ↔ iapetus (최외곽 0.0238 AU)
 * 로 14.96배 (R6 galilean 4.5배 / R5 phobos-deimos 2.5배 대비 3.5배 큼). 단일 saturn visual scale
 * ×10 (titan 기준) 은 enceladus 를 ring 에 묻고 (마진 0.35x), enceladus binding 충족 위해 ×47 로
 * 상향하면 iapetus 가 saturn mesh 의 55배로 과분리 (visual orbit 1.119 AU > 지구-태양 거리).
 * **양극단이 단일 visual scale 로 양립 불가** → per-body 룩업으로 각 위성 binding 독립 충족.
 *
 * ## 박제값 (developer measurement-first 실측 2026-06-20, 산식 A margin ≥ 1.5 — 전부 PASS)
 *
 * binding = F ring outer mesh (140680 km × 48 = 6.7526e9 m, saturn mesh 2.8929e9 의 2.334배 — R7 유형):
 *   - enceladus a=2.380e8 m, visual ×47 → margin 1.64x (binding, 최내곽. titania/triton 1.65x 정합)
 *   - rhea      a=5.271e8 m, visual ×20 → margin 1.52x (×10 시 0.76x 묻힘 → ×20 분리)
 *   - titan     a=1.222e9 m, visual ×10 → margin 1.74x (**R7 박제 보존 — 회귀 0**. 기존 사용자 인지 유지)
 *   - iapetus   a=3.561e9 m, visual ×10 → margin 5.13x (최외곽. a 가 이미 커 ×10 으로 자동 안전, 과분리 회피)
 *
 * #622 NO-OP SSoT: 위 산식 A (설계 real-meter) 와 산식 B (runtime scene-unit) 직접 비교 금지.
 *
 * D-T2 미통과 시 fallback: enceladus ×47 → ×50 (마진 1.75x, ring 에서 더 분리, ADR §재검토 트리거 #2) /
 *   rhea ×20 → ×22. iapetus 과분리 보고 시 ×10 → ×8 (단 binding 미달 위험, ADR §재검토 트리거 #3).
 *
 * ## R12 박제 (#725, 2026-06-21) — 거성 위성 확장 2개 (oberon/proteus), 비대칭 판정 SSoT
 *
 * 천왕성·해왕성 두 계가 **비대칭** (a 위치로 per-body vs parent 단일 판정):
 *   - oberon (uranus): titania 바깥 (a 0.00390 AU = titania 0.00291 의 1.34배) → uranus parent ×50 으로 자동 양립
 *     (마진 2.22x). **per-body entry 추가 안 함** — 시각 이득 0 (YAGNI). 천왕성 계는 진짜 데이터만 (orbit 상수 변경 0).
 *   - proteus (neptune): triton 안쪽 (a 0.000786 AU = triton 0.00237 의 0.33배 = 3.0배 안쪽) → neptune parent ×75 에
 *     묻힘 (마진 0.56x) → **per-body ×220 추가** (마진 1.64x, 위 entry). triton 은 per-body 미정의 → parent ×75
 *     fallback 유지 (R9 박제 회귀 0). enceladus (R11) binding shift 와 정확히 동형.
 *
 * binding = Adams ring outer mesh (62930 km × 250 = 1.57325e10 m, neptune mesh 6.191e9 의 2.541배 — R9 유형):
 *   proteus a=1.176e8 m, visual ×220 → margin = (1.176e8 × 220) / (1.57325e10 + 6.30e7) = 1.64x (산식 A, ≥ 1.5 통과).
 *   후보: ×75 (parent) 0.56x fail / ×201 1.50x 경계 / **×220 1.64x 선택** / ×235 1.75x (D-T2 ring 침범 시 fallback).
 *
 * ## 후속 라운드 인계
 *
 * saturn 추가 위성 (Dione/Tethys 등) / 천왕성·해왕성 다중 위성 진입 시 동일 per-body 룩업 답습.
 * **거성 위성 a 비대칭 판정 SSoT (R12 #725)**: 신규 위성 a 가 기존 binding 위성보다 **안쪽이면 per-body 필요**
 * (proteus/enceladus), **바깥이면 parent 단일 룩업 양립 검토** (oberon — 마진 ≥ 1.5 산식 A 로 실측 확정).
 * parent 단일 룩업 (`ORBIT_VISUAL_SCALE_BY_PARENT`) 은 **단일 위성 또는 추가 위성이 binding 위성보다 바깥일 때만** 유지
 * (titan 단독 R7 / galilean 4 편차 4.5배 R6 / oberon R12). Miranda (a 0.00087 AU = titania 안쪽) 진입 시 per-body 예상.
 *
 * R11 ADR `20260620-721-saturn-moons-rhea-iapetus-enceladus.md` §축 2.
 * R12 ADR `20260621-725-giant-moons-oberon-proteus.md` §축 2.
 */
export const ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY: Readonly<Record<string, number>> =
  Object.freeze({
    titan: 10, // R11 #721 — R7 박제 보존 (회귀 0, 마진 1.74x). per-body 명시로 saturn parent 룩업과 동시 존재 시 per-body 우선
    enceladus: 47, // R11 #721 — binding (최내곽 a 0.00159 AU). ×10 시 0.35x 묻힘 → ×47 분리 (마진 1.64x, titania/triton 1.65x 정합)
    rhea: 20, // R11 #721 — a 0.00352 AU (titan 의 0.43배). ×10 시 0.76x 묻힘 → ×20 분리 (마진 1.52x)
    iapetus: 10, // R11 #721 — 최외곽 a 0.0238 AU (titan 의 2.9배). ×10 으로 자동 안전 (마진 5.13x). 단일 ×47 의 55배 과분리 회피 위해 최소값
    // R12 #725 — proteus (neptune 최내곽 위성, triton 안쪽 a 0.33배 = 3.0배 안쪽). neptune parent ×75 에 묻힘 (마진 0.56x)
    // → per-body 분리. triton 은 per-body 미정의 → parent ×75 fallback 유지 (R9 박제 회귀 0). enceladus binding shift 동형.
    // oberon 은 per-body 미추가 — titania 바깥 (a 1.34배) 이라 uranus parent ×50 으로 자동 양립 (마진 2.22x, ADR §축 2).
    proteus: 220, // R12 #725 — binding (neptune 최내곽 a 0.000786 AU). 마진 1.64x (titania/triton/enceladus 1.65x 정합). developer 실측 2026-06-21 (산식 A). Adams ring 가독성 (agy ②): proteus visual orbit ×220 = 2.588e10 m 가 Adams ring outer mesh (1.573e10 m) 밖 간극 1.015e10 m (ring outer 반경의 64.5% — ring 인접 아닌 충분한 분리, 물리 거리 침범 0). D-T2 실 GUI 가독성 침범 시 ×235 (마진 1.75x, 간극 75.7%, ADR §재검토 트리거 #2). ADR 20260621-725 §축 2
  });

/**
 * 기본값 (parent 가 룩업에 없거나 visual scale 미적용 — 실측 그대로).
 *
 * #627 (agy 보강 ②) — `getOrbitVisualScale` 의 fallback 계약. parentId null / undefined /
 * 미매핑 시 1.0 반환 보장으로 satellite 궤도 LineSystem.scaling 이 항상 안전한 값을 받는다
 * (rebuildOrbitLines 의 미매핑 parent 예외 안정성). 단위 테스트 `satellite-orbit-structure.test.ts`
 * 가 본 계약을 가드.
 */
export const DEFAULT_ORBIT_VISUAL_SCALE = 1.0;

/**
 * satellite orbit visual scale 조회 — 3계층 Graceful Degradation.
 *
 * R11 #721 (ADR §축 2, cross-validate agy 합의) — per-body 룩업을 optional 2번째 인자로 확장해
 * 호출처 호환 유지. 우선순위:
 *   1) per-body 룩업 (`ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY[bodyId]`) — saturn 위성 enceladus/rhea/titan/iapetus
 *   2) parent 룩업 (`ORBIT_VISUAL_SCALE_BY_PARENT[parentId]`) — earth/mars/jupiter/uranus/neptune 위성 (기존 동작 보존)
 *   3) `DEFAULT_ORBIT_VISUAL_SCALE` (1.0, 실측 그대로) — 미정의 parent
 *
 * `bodyId` 미전달 (또는 per-body 미정의) 호출처는 기존 parent fallback 으로 회귀 0.
 *
 * @param parentId satellite 의 parent body id (예: 'earth' → moon 의 parent)
 * @param bodyId   satellite 자신의 body id (예: 'enceladus'). per-body 룩업 우선 적용. 미전달 시 parent 룩업
 * @returns visual scale 배수. 미정의 시 1.0 (실측 그대로).
 */
export function getOrbitVisualScale(
  parentId: string | null | undefined,
  bodyId?: string | null | undefined,
): number {
  // 1) per-body 룩업 우선 (saturn 위성 — enceladus 47 / rhea 20 / titan 10 / iapetus 10)
  if (bodyId !== null && bodyId !== undefined) {
    const perBody = ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY[bodyId];
    if (perBody !== undefined) return perBody;
  }
  // 2) parent 룩업 fallback (earth/mars/jupiter/uranus/neptune 위성 — 기존 동작 보존)
  if (parentId === null || parentId === undefined) return DEFAULT_ORBIT_VISUAL_SCALE;
  return ORBIT_VISUAL_SCALE_BY_PARENT[parentId] ?? DEFAULT_ORBIT_VISUAL_SCALE;
}
