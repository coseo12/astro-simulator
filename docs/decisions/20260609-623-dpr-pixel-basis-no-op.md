# ADR (NO-OP): body 가시성 px 산출식의 DPR 기준 — physical pixel 일관, 버그 없음 (#623)

- **상태**: **Accepted** (NO-OP — 실측으로 기존 동작이 이미 정합 확인. 단순 결정 ADR 직접 Accepted)
- **날짜**: 2026-06-09
- **결정자**: developer (#623 R6 후속 forensic)
- **관련**:
  - [#623](https://github.com/coseo12/astro-simulator/issues/623) (본 이슈 — R6 ADR cross-validate agy 고유 발견)
  - [`20260605-r6-jupiter-galilean-visualization.md`](20260605-r6-jupiter-galilean-visualization.md) (R6 ADR — galilean 4px fallback 언급의 DPR 기준 질의 출발점)
  - `packages/core/src/render/lod.ts` (`LOD_PIXEL_THRESHOLDS` / `screenCoverageRadius` — DPR 주석 박제처)
  - `packages/core/src/engine/engine-factory.ts:46` (`adaptToDeviceRatio: true`)
- **교훈 적용**: "인계 항목 실측 재검증 — NO-OP ADR 패턴" ([docs/lessons/no-op-adr-pattern.md](../lessons/no-op-adr-pattern.md), volt #14/#67) — "DPR 미명시" 우려를 실측해보니 이미 physical px 로 정합. 정적 추정 대신 runtime 측정으로 확정.

---

## §1 배경 / 질의

R6 ADR cross-validate(agy 2026-06-05) 고유 발견: body 가시성 산출식(`pxDiameter`, 4px fallback billboard 임계)이 DPR 1.0 전제로 작성된 듯하나 **physical pixel 인지 logical(CSS) pixel 인지 명시 안 됨**. Retina(DPR 2/3)에서 4px fallback 임계가 디바이스별로 달라질 위험 제기.

## §2 Forensic 측정 (2026-06-09, headless, CSS 1280×720)

`_debug-623-dpr-tmp.mjs`(volt #67, 실행 후 rm)로 DPR 1 vs 2 측정. 데이터: [`docs/reports/623-dpr-pixel-basis-debug-output.json`](../reports/623-dpr-pixel-basis-debug-output.json).

|                        | DPR 1 | DPR 2 | 비율      |
| ---------------------- | ----- | ----- | --------- |
| `getRenderHeight()`    | 720   | 1440  | **×2.00** |
| `hardwareScalingLevel` | 1     | 0.5   | —         |
| jupiter `pxDiameter`   | 22.06 | 44.12 | **×2.00** |
| earth `pxDiameter`     | 23.32 | 46.64 | **×2.00** |
| io `pxDiameter`        | 1.18  | 2.36  | **×2.00** |
| moon `pxDiameter`      | 1.57  | 3.14  | **×2.00** |

## §3 결론 — physical pixel 일관, NO-OP

- **px 산출은 physical pixel 기준**: 엔진이 `adaptToDeviceRatio: true`(engine-factory.ts:46)로 생성되어 `getRenderHeight()` 가 DPR 곱해진 drawing buffer(물리 px)를 반환. `screenCoverageRadius` 가 이 값을 쓰므로 `screenCoverage`/`pxDiameter` 도 물리 px.
- **임계도 같은 공간**: `LOD_PIXEL_THRESHOLDS`(high=50/mid=8) + 4px fallback 임계(`pxDiameter ≥ 4`)가 모두 물리 px 와 비교 → **coverage 와 threshold 가 동일 공간**이라 DPR 변동에 정합. logical/physical 혼선 없음.
- **Retina 동작은 의도된 것**: DPR 2 에서 모든 body pxDiameter 가 ×2 → logical 로 더 작은 body 도 mask/high 에 먼저 진입. "물리 픽셀이 많을수록 정밀 렌더 가치" 로 **올바른 동작** (버그 아님). 빌보드 render 크기는 world 투영 기준이라 DPR 무관하게 동일 시각 크기.
- **결론**: 우려한 "DPR 미명시 → 디바이스별 가시성 임계 달라짐" 은 **실제로는 physical px 로 일관**. 코드 동작 변경 불필요(NO-OP). 명세 미박제만 해소.

## §4 조치 (문서/명세만, 동작 변경 0)

- `lod.ts` `LOD_PIXEL_THRESHOLDS` JSDoc 에 **단위: physical pixel + adaptToDeviceRatio + DPR ×2 실측** 박제.
- 본 NO-OP ADR + 측정 report 박제.

## §5 회귀 가드 — 테스트 ROI 판정

- **dedicated browser DPR 가드 생략** (테스트 ROI 5문): 보호 대상은 "px 산출이 physical px 로 DPR 정합" 인데 (1) 동작 버그가 없어 회귀 시 조용한 퇴행보다 코드 가시성 높고 (2) DPR browser 가드 구축 비용(playwright deviceScaleFactor 매트릭스)이 검증 대상(주석 계약 + adaptToDeviceRatio 1줄) 대비 과대 (3) `adaptToDeviceRatio: true` 가 제거되면 lod 단위 테스트/시각 회귀(r1-guard)가 간접 포착. → **주석 계약(lod.ts physical px 명시) + 본 ADR 실측 박제로 대체** (volt #31/#32 테스트 ROI 패턴).

## §6 재검토 트리거

- `engine-factory.ts` 의 `adaptToDeviceRatio` 가 false 로 바뀌면 본 ADR 전제 붕괴 → px 산출 logical 화 → 재측정 필요.
- DPR 3.0+ 또는 실 Retina Mac 에서 시각 이상 보고 시 재측정.
- **동적 DPR 변경 (cross-validate agy 고유 발견)**: 본 측정은 **load-time 정적 DPR** 한정(이슈 명시 범위 "DPR 2.0 환경 실측"). 런타임 중 다른 DPR 모니터로 창 이동 / 브라우저 줌(Ctrl±)으로 `devicePixelRatio` 가 동적 변하는 경우, Babylon `adaptToDeviceRatio` 는 **생성 시점 hardwareScalingLevel 을 고정**하므로 자동 재동기화되지 않을 수 있다 (LOD 는 매 프레임 `getRenderHeight` 재계산이라 buffer 만 갱신되면 따라감). 현재 시각 회귀 0 + low priority 라 본 ADR 범위 밖 — 수요 발생 시 별도 이슈(런타임 DPR 변화 시 `engine.resize()` + hardwareScalingLevel 재설정 hook)로 분리.

## §교차검증 반영 사항 (cross-validate 2026-06-09 agy outcome=applied)

agy 가 본 NO-OP ADR 을 "정량적 실측 기반, Accepted 충분" 으로 지지. 4축 분류:

- **합의 (2)**: ① 실측 기반(headless DPR 1/2 ×2.00 직접 측정) 의사결정 ② 테스트 ROI 분석으로 dedicated DPR 가드 미작성 합리화.
- **고유 발견 후속 분리 (1)**: **동적 DPR 변경(multi-monitor / window zoom 런타임)** — 본 측정이 load-time 정적 DPR 한정인 점 정확 지적. §6 재검토 트리거에 경계 박제(수요 시 별도 이슈). 현재 시각 회귀 0 + low priority 라 본 NO-OP 범위 밖.
- **반려/과대 대응 필터 (4, NO-OP 범위)**: ① Branded Type(PhysicalPixel/LogicalPixel) — 코드베이스 전역 refactor, NO-OP 대비 과대 ② `adaptToDeviceRatio` assert/lint 코드화 — §6 트리거 + 주석 계약으로 충분(Babylon 내부 설정 silent flip 가능성 낮음) ③ DPR 3.0+ 성능 캡/throttling — perf 별도 영역 ④ DPR clamp(0/음수/극단값) — Babylon 내부 처리, 본 산출식 무관. 모두 low-priority NO-OP 범위 밖.
- **Claude 편향 셀프 체크**: NO-OP 결론이 "조사 회피" 가 아닌지 — DPR 1/2 ×2.00 실측 + coverage·threshold 동일 공간 논증으로 physical px 정합을 능동 입증(정적 추정 아님). 단 동적 DPR 은 측정 안 함(범위 명시).

## 변경 이력

- 2026-06-09: NO-OP ADR (developer, #623). DPR 1 vs 2 실측으로 physical px 일관 확정 + lod.ts 주석 박제.
