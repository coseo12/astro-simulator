# ADR (NO-OP): satellite orbit visual scale 잔여 1.7배 gap — 측정-정의 artifact, runtime 버그 아님 (#622)

- **상태**: **Accepted** (NO-OP — 실측으로 두 가설 모두 기각, 측정-정의 차이로 확정. 단순 결정 ADR 직접 Accepted)
- **날짜**: 2026-06-09
- **결정자**: developer (#622 R6 후속 forensic)
- **관련**:
  - [#622](https://github.com/coseo12/astro-simulator/issues/622) (본 이슈 — R6 ADR §축 4 Amendment 인계)
  - [`20260605-r6-jupiter-galilean-visualization.md`](20260605-r6-jupiter-galilean-visualization.md) §축 4 (산식 A/B 정의 분리)
  - [`20260528-r5-mars-visualization.md`](20260528-r5-mars-visualization.md) §결정 4 + #604 Amendment 1 (산식 1.69 vs 실측 0.99 분리 박제)
  - [#611](https://github.com/coseo12/astro-simulator/issues/611) (`computeWorldMatrix(true)` 전례 — 본 가설 2 출발점, 기각됨)
  - `packages/core/src/scene/orbit-visual-scale.ts`
- **교훈 적용**: "인계 항목 실측 재검증 — NO-OP ADR 패턴" (volt #14/#67) + "measurement-first" (volt #32) — #611 전례를 강한 가설로 출발했으나 실측이 기각. 정적 추정으로 fix 했으면 오진.

---

## §1 배경

R5 §결정 4 / R6 §축 4: satellite orbit "분리 마진" 산식 A(설계 1.691x)와 runtime 측정 산식 B(#604 실측 phobos 0.99)의 ~1.7배 gap 의 **runtime 구조 원인 미확정**. #604 Amendment 1 이 "산식 A(설계 real-meter) vs 산식 B(검증 scene-unit metric) 정의 분리" 로 1차 정정했으나(분모 sum vs parent_only 는 1.02배만 설명), 잔여 1.7배는 가설 박제만 하고 #622 로 인계.

- 산식 A (설계, real-meter): `visual_orbit / (parent_mesh + satellite_mesh)` = phobos 4.688e9 / 2.772e9 = **1.691x**
- 산식 B (런타임, scene-unit): `satellite.dist_to_parent / parent.boundingSphere.radiusWorld` = phobos **0.99**

가설 (agy 2026-06-05): 1. Floating Origin Tier scale 적용 순서 / 2. **boundingSphere worldMatrix 갱신 타이밍 (#611 패턴 — 강한 출발점)**.

## §2 Forensic 측정 (2026-06-09, headless 1280×720, develop)

`_debug-622-gap-tmp.mjs`(volt #67, 실행 후 rm). 데이터: [`docs/reports/622-orbit-scale-gap-debug-output.json`](../reports/622-orbit-scale-gap-debug-output.json).

각 satellite 의 `parent.boundingSphere.radiusWorld` 를 **현재 상태(stale) vs `computeWorldMatrix(true)+refreshBoundingInfo`(fresh)** 로 측정:

| sat→parent  | bsStale | bsFresh | stale/fresh | dist   | ratio (산식 B)         | parScaling |
| ----------- | ------- | ------- | ----------- | ------ | ---------------------- | ---------- |
| phobos→mars | 0.3953  | 0.3953  | **1.000**   | 0.3935 | **0.995** (=#604 0.99) | 1          |
| deimos→mars | 0.3953  | 0.3953  | **1.000**   | 0.9851 | 2.492                  | 1          |
| io→jupiter  | 0.4993  | 0.4993  | **1.000**   | 0.567  | 1.136                  | 1          |
| moon→earth  | 0.7424  | 0.7424  | **1.000**   | 1.022  | 1.377                  | 1          |

## §3 가설 검증 결론

| 가설                                                      | 결론     | 근거                                                                                                                                                                                                                                                  |
| --------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **가설 2: boundingSphere worldMatrix 타이밍 (#611 패턴)** | **기각** | `stale/fresh = 1.000` (모든 satellite) — `computeWorldMatrix(true)` 가 radiusWorld 를 바꾸지 않음. #611 의 stale read 현상 부재                                                                                                                       |
| **가설 1: Floating Origin Tier scale 적용 순서**          | **기각** | `parScaling = 1` (mesh.scaling 미사용, scale 은 geometry 에 baked) + `ratio_stale == ratio_fresh` → 타이밍/순서 효과 0                                                                                                                                |
| **결론: 1.7배 gap = 측정-정의 artifact**                  | **확정** | 산식 A(real-meter 설계비)와 산식 B(scene-unit 런타임 metric)가 BODY_SCALE / ORBIT_VISUAL_SCALE / renderScale 을 **다르게 합성** — 같은 양이 아님. phobos 0.995 는 실제 렌더 geometry(scene)의 정확한 비율이고, 1.691 은 설계 단계 real-meter 휴리스틱 |

## §4 결론 — NO-OP

- **runtime 버그 없음**: 두 가설(#611 타이밍 / tier 순서) 모두 실측 기각. 잔여 1.7배 gap 은 산식 A↔B 의 **scale 합성 정의 차이**(real-meter 설계 vs scene-unit 런타임)로, 동일 물리량을 측정하지 않는다. #604 Amendment 1 의 "metric 정의 미명시" 진단을 runtime 으로 확정.
- **시각 회귀 0**: satellite 는 #627 moon 패턴(parent 추적 + visual scale)으로 정상 렌더. phobos ratio 0.995(mars mesh edge 근접)도 alpha mask billboard 가 자연 흡수 — D-T2 정상 통과 (이슈 명시).
- **조치**: 코드 동작 변경 불필요. 본 NO-OP ADR + 측정 report 로 "잔여 gap = 정의 차이, 버그 아님" 종결 박제. R5/R6 ADR 의 "runtime 원인 미확정" 인계 항목 해소.

## §5 회귀 가드 — 테스트 ROI 판정

- **dedicated 가드 미작성** (테스트 ROI): 버그 없는 측정-정의 차이라 보호할 동작이 없음. satellite 궤도선 위치 정합은 이미 `verify:627-satellite-orbit`(worldCenter ↔ parent ±0.2)가 커버. 산식 A/B 정의 차이는 ADR/주석 계약으로 박제 (volt #31/#32 ROI 패턴).

## §6 재검토 트리거

- satellite 궤도선이 parent 에서 분리/이탈하는 시각 회귀 보고 시 → `verify:627-satellite-orbit` + 본 측정 재현.
- ORBIT_VISUAL_SCALE / BODY_SCALE 산식 자체를 재설계할 때 산식 A↔B 정의 재정렬.
- **phobos ratio 0.995 (mars mesh edge 근접) z-fighting/파묻힘 (cross-validate agy)**: 현재 D-T2 시각 회귀 0 (alpha mask billboard 흡수) 이나, 특정 zoom/depth precision 에서 z-fighting 보고 시 → 최소 분리 마진(예: 1.02x) safety buffer 검토 (현재 불필요, 관찰 트리거만).
- **재측정 방법**: `__solarScene.meshes.get(satId/parId)` 로 `getBoundingInfo().boundingSphere.radiusWorld`(stale) vs `computeWorldMatrix(true)+refreshBoundingInfo()`(fresh) 비교 + `absolutePosition` 거리 (본 ADR §2 스크립트 패턴, [report](../reports/622-orbit-scale-gap-debug-output.json)).

## §교차검증 반영 사항 (cross-validate 2026-06-09 agy outcome=applied)

agy 가 본 NO-OP 결론(측정-정의 차이)을 지지. 4축 분류:

- **합의 (1)**: 두 가설 실측 기각 + 측정-정의 차이 확정의 논리 타당.
- **고유 발견 수용 (2, 본 PR 반영)**: ① **orbit-visual-scale.ts WARNING 주석** — 미래 개발자가 "1.69배 분리 마진" 을 보고 runtime 0.99 를 버그로 재오인하지 않도록 본 NO-OP ADR 참조 주석 박제 (comment-implementation drift 교훈). ② **재측정 방법 박제** — debug 스크립트 rm 후 재현 절차를 §6 에 명시.
- **반려/후속 (2)**: ① phobos 0.995 z-fighting safety margin(1.02x 강제) — 현재 D-T2 시각 회귀 0 이라 불필요, §6 관찰 트리거로 박제 (보고 시 검토). ② 신규 천체 overlap 정적 체크 — 이미 `verify:627-satellite-orbit`(worldCenter ±0.2)가 커버.
- **Claude 편향 셀프 체크**: NO-OP 가 "조사 회피" 아닌지 — boundingSphere stale/fresh=1.0 능동 측정으로 #611 강한 가설을 직접 기각(정적 추정 아님). 측정-정의 차이는 #604 Amendment 1 의 1차 진단과 정합.

## 변경 이력

- 2026-06-09: NO-OP ADR (developer, #622). boundingSphere stale/fresh=1.0 실측으로 가설 2(#611 타이밍) + 가설 1(tier 순서) 기각 → 1.7배 gap = 측정-정의 artifact 확정. 시각 회귀 0.
