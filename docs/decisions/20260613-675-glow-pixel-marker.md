# ADR: glow pixel marker 정식화 — 줌아웃 sub-pixel body 의 화면 고정 크기 글로우 표기 (기본 ON + `?marker=off` 옵트아웃)

- **상태**: **Accepted (cross-validate 2026-06-12)** — agy outcome=applied ("Accepted 전이 적극 권장", 명시 질문 2건 합의, 고유 발견 1 발화 조건부 박제). §교차검증 반영 사항 4축 통합 후 전이 (#370 옵션 C 워크플로)
- **날짜**: 2026-06-13
- **결정자**: architect (PM 합의 라운드 완료 2026-06-13 — 프리뷰 3-iteration 실 Chrome D-T2 사용자 만족 승인. **PM 확정값 그대로 박제 — 재구조화 금지**: 채택 / 모행성:위성 **2:1** (parent 4.5px / satellite 2.25px) / **sun 포함** (parent 동급 4.5px) / 발동 기준 **실 billboard 렌더 px < 4** / emissive boost **parent 1.6 / satellite 2.0**)
- **관련**: [#675](https://github.com/coseo12/astro-simulator/issues/675) (본 스프린트), `preview/glow-marker` 로컬 브랜치 (`83b8aae`/`a69a5a5`/`73225a1` — 설계의 실측 기반, dev 구현 시 참조), [`20260424-p11-b-lod-design.md`](20260424-p11-b-lod-design.md) (LOD 3단 — R4 Amendment 3 보존 대상, 본 ADR 은 LOD 결정 로직 무변경), [`20260425-r1-ui-pixel-diff-guard.md`](20260425-r1-ui-pixel-diff-guard.md) (r1-guard — §축 1 baseline 영향 평가), [`20260609-623-dpr-pixel-basis-no-op.md`](20260609-623-dpr-pixel-basis-no-op.md) (px = physical px 확정 — targetPx 4.5 의 픽셀 기저), [`20260612-r10b-comets-visualization.md`](20260612-r10b-comets-visualization.md) (직전 라운드 — comet sub-px billboard 전면 의존이 본 기능의 직접 동기), #333 (billboard 실반경 렌더 정책 — 발동 임계 환산식의 전제)
- **교훈 적용**:
  - "measurement-first / 수치 DoD 미달 시 측정 방법 검증 우선" (volt [#32](https://github.com/coseo12/volt/issues/32)) — 프리뷰 iteration 2 가 교과서 사례: iteration 1 의 effective px 임계가 [4, 16) 데드존 (행성 비식별인데 미발동, 5 AU 실측 8 행성 전부) 을 만들었고, **실 billboard px (÷bodyScale) 환산으로 측정 기준 교체** 가 fix. 본 ADR 의 발동 기준은 이 실측 확정값
  - "DoD PASS ≠ 제품 동작" (volt [#74](https://github.com/coseo12/volt/issues/74)) — 본 기능 자체가 "px-ratio/LOD DoD 전부 PASS 인데 default 진입 화면에서 대부분 body 비식별" 이라는 제품 gap 의 해소. 기본 ON 결정 (§축 1) 의 핵심 근거
  - "주석 계약 vs 구현 drift — 버그 생성원" — 프리뷰가 "mesh.scaling 은 high variant 만" 계약을 의도적 이탈 (코드 주석으로 사전 박제). 본 ADR §축 2 가 계약 개정의 SSoT — drift 방치가 아닌 정식 개정
  - "신규 함수 ≠ 신규 구현" (volt [#21](https://github.com/coseo12/volt/issues/21)) — 판정 로직 분리 시 기존 `shouldApplyBillboardAlphaMask` + `lod-billboard-alpha-mask.test.ts` 선례 답습 (§축 6). radial gradient 마스크는 기존 인프라 재사용 (신규 셰이더 0)
  - "이슈 전제 코드 전수 확인" (#624 NO-OP 교훈) — 이슈 DoD 초안 "sun 포함 28" 은 allowlist SSoT 실측 **27 body (sun 포함)** 와 불일치 — off-by-one 정정 박제 (§DoD. R10 회고 bar 버튼 off-by-one 정정 선례와 동형)

---

## 현재 유효 결정 요약 (Living ADR Executive Summary)

> **PM 확정값 (2026-06-13, 프리뷰 D-T2 승인 — 그대로 박제)**: glow marker 정식 채택 / 2:1 (parent 4.5px, satellite 2.25px) / sun 포함 (parent 동급) / 발동 = 실 billboard 렌더 px < 4 / emissive 1.6 (parent) · 2.0 (satellite).

### 핵심 박제값 표

| 항목                       | 박제값                                                                                                                                                                    | 위치                                                                    | 비고                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 기본 활성화                | **기본 ON** (`?marker=off` 옵트아웃) — web 레이어 결정. core `glowMarker` 옵션 기본값은 `false` 유지                                                                      | `parse-marker-mode.ts` 기본값 `'off'` → `'glow'` / core 시그니처 무변경 | §축 1 — core 보수 기본 유지로 기존 core 단위 테스트 무회귀. 알 수 없는 `?marker=` 값 → 기본값 `'glow'` 폴백 + warn                                         |
| 발동 기준                  | **실 billboard 렌더 px** (`pxDiameter ÷ bodyScale`) **< 4** + `nextLevel === 'low'` + `pxDiameter` 유한·양수                                                              | `glow-marker.ts` (신규 모듈)                                            | PM 확정 (iteration 2 fix). 임계값 4 는 `LOD_BILLBOARD_ALPHA_MASK_MIN_PX_DIAMETER` SSoT 참조 유지                                                           |
| 크기 계층                  | parent (`parentId === 'sun'`) **4.5px** / satellite **4.5 ÷ ratio (기본 2 → 2.25px)** / star (sun) **parent 동급 4.5px**                                                  | `glow-marker.ts` 상수                                                   | PM 확정 2:1. `?ratio=` 디버그 파라미터 유지 (기본 2, 1~10 유한 수)                                                                                         |
| emissive boost             | parent **1.6** / satellite **2.0** (해제 시 원복: star full `c` / non-star `c.scale(0.3)`)                                                                                | `glow-marker.ts` 상수                                                   | PM 확정 (1.5~2.25px gradient falloff 휘도 보상 실측값)                                                                                                     |
| 주석 계약 개정             | "`mesh.scaling` 은 high variant 만" → **low variant glow 역보정 예외 1건 추가** (mid 는 여전히 금지)                                                                      | `solar-system-scene.ts:458` 주석 + 본 ADR §축 2                         | §축 2 — 본 ADR 이 개정 SSoT. position owner 는 high 불변                                                                                                   |
| popping                    | **(c) 명시 수용** — 발동 경계가 LOD low 경계와 일치 (27 body 전수 bodyScale ≥ 48 → low 대역 실 billboard px ≤ 0.33px ≪ 4), 기존 200ms LOD cross-fade 가 마스킹            | 본 ADR §축 3 (코드 변경 0)                                              | 히스테리시스 (a) 는 dead-code 가드로 기각. 재검토 조건: D-T2 flicker 관찰 시 (a) 승격 (해제 임계 4×1.15=4.6 — tier ±15% 정합)                              |
| off-frustum 가드           | `Number.isFinite(pxDiameter) && pxDiameter > 0` **유지** — 별도 frustum 판정 기각                                                                                         | `glow-marker.ts`                                                        | §축 4 — fail-safe 방향 (scaling 폭주 방지 > 1프레임 marker 누락)                                                                                           |
| ring 동반 body             | **명시 수용** — glow dot + 잔존 ring 픽셀 공존 (ring 은 host child 로 LOD 무관 상시 렌더 = 기존 동작, 프리뷰 D-T2 승인 범위 내)                                           | 본 ADR §축 5 (코드 변경 0)                                              | low LOD ring 숨김은 기존 동작 변경 (R4 LOD 보존) — 기각                                                                                                    |
| 판정 로직 배치             | **신규 모듈 `packages/core/src/scene/glow-marker.ts`** — 상수 + 순수 판정 함수 `resolveGlowMarker()` export. scene 은 import (frame loop 구조 불변)                       | `glow-marker.ts` + `glow-marker.test.ts`                                | §축 6/7 — `lod-billboard-alpha-mask.test.ts` 선례. `package.json` exports sub-path 추가 금지 (verify-core-exports-immutable — 모듈 내부 파일이므로 비저촉) |
| pixel-diff baseline        | **전면 갱신 의무** — default 뷰에 glow 픽셀 등장 (sub-pixel body 전수). `r1-baseline-bootstrap.yml` feature ref dispatch (`--ref` + `-f target_branch`, R10a 선례)        | r1-guard `__baselines__/r1`                                             | §축 1 — PR 스크린샷 박제 의무 동반                                                                                                                         |
| px-ratio / 모바일 diskArea | **영향 0 (측정 정의 명시)** — `diskAreaRatio = π·pixelRadius²/(w·h)` 는 **wsRadius 기반 해석적 산출** (`r1-ui-regression-guard.mjs:299`), low variant quad scaling 미반영 | 본 ADR §축 1-2                                                          | sun viewport 밝기 점유율 (픽셀 readback) 만 glow 픽셀 포착 가능 — 보수 상한 무시 가능 수준, dev 실측 1회 확인                                              |
| fps / a11y baseline        | fps: **갱신 불필요 예측** (매 프레임 추가 = body 당 나눗셈 1 + 비교, material 쓰기는 전이 시 1회) / a11y: **영향 0** (DOM 변경 0)                                         | 본 ADR §축 1-3                                                          | fps 가드 fail 시 bench-baseline-remeasure 경로                                                                                                             |
| #617/#619 정적 가드        | **영향 0** — `showInShortcutBar` / `targetIds` / allowlist 무변경                                                                                                         | —                                                                       | §축 1-4                                                                                                                                                    |
| 헤드리스 정량 가드         | 신규 `browser-verify-glow-marker.mjs` — 40 AU **+10** / 100 AU **+11** 식별 천체 (프리뷰 실측 재현 기준) + `?marker=off` 격리 검증                                        | `apps/web/scripts/` + CI detect-and-test                                | §축 6                                                                                                                                                      |
| glow 대상                  | **27 body 전수 (sun 포함)** — 이슈 초안 "28" 은 off-by-one 정정                                                                                                           | —                                                                       | allowlist SSoT `r-phase-allowlist.ts` "= 27 body" 명시                                                                                                     |

### 핵심 결정 요약

1. **기본 ON + `?marker=off` 옵트아웃 — web 레이어 결정, core 기본값 `false` 유지** (§축 1): 기능 가치가 default 진입 화면의 핵심 UX gap (27 body 중 default 뷰 대부분 비식별) 해소이므로 옵트인은 가치 대부분을 사장. baseline 영향 5축 평가 결과 갱신 의무는 pixel-diff 1축뿐 (나머지 4축 영향 0 — 측정 정의로 입증)
2. **주석 계약 개정 SSoT** (§축 2): low variant quad 의 화면 고정 크기 역보정에 한해 `mesh.scaling` 사용 허용. position/transform owner 는 여전히 high variant 단독 — 계약의 본질 (좌표 추종 단일 소유권) 은 불변
3. **popping 명시 수용** (§축 3): 발동/해제 경계가 LOD low 진입/이탈 경계와 사실상 일치 (실측 — low 대역에서 4px 임계는 현 27 body 데이터로 도달 불가) → 기존 200ms cross-fade 가 이미 마스킹. 히스테리시스 추가는 발동 불가능한 경계에 대한 dead-code 가드
4. **판정 로직 순수 함수 분리** (§축 6): `resolveGlowMarker()` 를 신규 모듈로 추출해 단위 테스트 직접 커버 (프리뷰의 inline 분기 → 정식화 시 유일한 구조 재작업). frame loop 의 호출 구조·연산량은 프리뷰와 동일

### 비-범위

- 클릭 raycast 선택 (글로우 픽셀 클릭) ❌ — #624 후속 시너지 후보 (이슈 명시)
- ring 의 low LOD 숨김 ❌ — 기존 동작 변경 (R4 Amendment 3 LOD 보존)
- LOD 결정 로직 (16/64px 임계, cross-fade 200ms) 변경 ❌
- marker 설정 UI (토글 버튼 등) ❌ — URL 파라미터만 (`?marker=off` / `?ratio=`)
- 동적 DPR (런타임 모니터 이동) 대응 ❌ — #623 NO-OP 경계 답습
- 모바일 별도 targetPx ❌ — 4.5px physical px 단일값 (#623 px=physical px 확정 기저). D-T2 모바일 불만 시 후속
- emissive bloom/glow post-process ❌ — StandardMaterial emissive boost 만 (신규 셰이더/파이프라인 0)

---

## 배경

R10b 완주로 27 body 전수가 박제됐지만, default 진입 화면 (solar view) 에서 위성·왜소행성·혜성은 billboard 실반경 렌더 (#333) 로 sub-pixel — **DoD (px-ratio/LOD/diskArea) 전부 PASS 인데 사용자가 볼 수 없는** 제품 gap 이 잔존했다 (volt #74 패턴의 잔여 변형). 사용자 요청 (2026-06-12) → `preview/glow-marker` 3-iteration 프리뷰 → 실 Chrome D-T2 만족 승인 (2026-06-13) → PM 확정값 5종 합의. 본 ADR 은 프리뷰 코드 (+221/-10, 3 파일) 를 실측 기반으로 정식화 설계를 박제한다.

### 프리뷰 3-iteration 실측 요약 (설계 입력)

| iteration     | 변경                                                        | 실측                                                                                                                                                                               |
| ------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 (`83b8aae`) | `?marker=glow` 격리 + 역보정 scaling + radial gradient 강제 | effective px [4, 16) 데드존 발견 — 5 AU 에서 venus 12.06 / earth 13.71 / saturn 13.96px 등 8 행성 전부 비식별인데 미발동                                                           |
| 2 (`a69a5a5`) | 발동 임계 → **실 billboard px (÷bodyScale)** + `?ratio=`    | 데드존 해소, 행성 전수 발동. 위성 피크 휘도 173~214 vs parent 199~252 (10 AU) → satellite emissive 2.0 보상. halley/swift-tuttle px=0 @5 AU = 화면 밖 (off-frustum 가드 정답 확인) |
| 3 (`73225a1`) | sun(star) 포함                                              | 100 AU 에서 sun billboard ≈ 0.09px 비식별 → parent 동급 4.5px. star 제외 설계 폐기                                                                                                 |

헤드리스 정량: 40 AU **+10** / 100 AU **+11** 식별 천체. core/web 단위 무회귀 (817+207).

---

## §축 1 — 기본 활성화: 기본 ON + `?marker=off` 옵트아웃 (채택)

### 후보 비교

| 축            | (a) 기본 ON + `?marker=off` 옵트아웃 (PM 권장)              | (b) 옵트인 유지 (`?marker=glow`)                                                       |
| ------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 기능 가치     | default 진입 화면 gap 해소 — 본 기능의 존재 이유 충족       | URL 아는 사용자만 — 가치 대부분 사장 (galilean URL-only discoverability gap 의 재생산) |
| baseline 비용 | pixel-diff 전면 갱신 1회 (bootstrap dispatch — 절차 확립됨) | 0                                                                                      |
| 회귀 노출     | default 경로라 r1-guard 가 상시 감시 (가드 커버리지 ↑)      | 옵트인 경로는 가드 사각 — 조용한 회귀 위험                                             |
| D-T2 정합     | 사용자가 승인한 그 화면이 default                           | 사용자가 승인한 화면이 숨겨짐                                                          |

**결정: (a)**. 옵트인 기능은 #624 에서 박제한 "URL-only discoverability gap = 사용자 accepted tradeoff" 와 달리, 본 기능은 사용자가 명시 요청 + D-T2 승인한 default UX 개선이다. 가드 관점에서도 default 경로 편입이 r1-guard 상시 감시를 받아 장기 회귀 노출이 더 작다.

### 레이어 분리 — core 기본값 `false` 유지

- `createSolarSystemScene` 옵션 `glowMarker` 기본값 **`false` 유지** (core 라이브러리 보수 기본 — 기존 core 단위 테스트 817개 무회귀, NullEngine 테스트가 glow 경로를 옵트인으로만 진입)
- **기본 ON 은 web 레이어 결정**: `parseMarkerMode` 기본값 `'off'` → `'glow'` 1곳 변경. 알 수 없는 값 폴백도 `'off'` → 기본값 `'glow'` (parse-gpu-tier 등 "unknown → 기본 동작" 패턴 정합)
- `?marker=off` 경로 = `glowMarker: false` = 프리뷰의 미지정 경로와 바이트 동일 (glow 분기 연산 0 보장 — `glowActiveBodies` Set 영구 empty)

### 영향 평가 5축 (이슈 명시 의무)

| #   | 축                             | 평가                        | 근거                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ------------------------------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1-1 | **r1-guard pixel-diff**        | **전면 갱신 의무**          | default 뷰 sub-pixel body (위성·왜소행성·혜성 + 원거리 행성) 에 glow 픽셀 등장 — mismatch ratio ≤ 0.5% 초과 확실. `r1-baseline-bootstrap.yml` 을 **feature ref 로 dispatch** (`--ref <branch>` + `-f target_branch=<branch>`, R10a 선례) 해 신규 UI 포함 baseline 생성 + PR 스크린샷 박제. glow 픽셀은 카메라·sim 상태 결정적이므로 baseline 안정성은 기존 body 픽셀과 동급                                                                                                                                                                     |
| 1-2 | **px-ratio / 모바일 diskArea** | **영향 0 — 측정 정의 명시** | `diskAreaRatio = π·pixelRadius² / (width·height)` 는 `wsRadius` (high mesh world-space 반경) 기반 **해석적 산출** (`r1-ui-regression-guard.mjs:299`) — 렌더 픽셀 readback 이 아니므로 low variant quad 의 scaling 역보정이 **측정에 반영되지 않는다**. 모바일 cumulative ≤ 25% (R10a 재실측 16.818% 기준) 불변. ⚠️ 예외 1: **sun viewport 점유율** (밝기 ≥ 200/255 픽셀 readback, stride=8) 은 glow 픽셀 포착 가능 — marker 1개 ≈ π(2.25)² ≈ 16px² (1280×720 의 0.0017%), 발동 body ~20개 보수 상한 +0.035%p 수준. dev 가 실측 1회로 확인 (DoD) |
| 1-3 | **fps baseline**               | **갱신 불필요 예측**        | 매 프레임 추가 연산: body 당 나눗셈 1 + 비교 수 회 (27 body — runLodPass 가 이미 수행하는 coverage 산출 대비 무시 가능) + glow 중 body 의 `scaling.setAll` (Vector3 쓰기). material (emissive) 쓰기는 **상태 전이 시 1회만** (프리뷰의 `glowActiveBodies` Set 추적 유지 — Babylon shader cache 보존). fps-baseline-guard CI variance 이력 (7회차+) 감안, 가드 fail 시 본 변경 원인 단정 전 variance 우선 의심 + `bench-baseline-remeasure.yml` 경로                                                                                             |
| 1-4 | **a11y**                       | **영향 0**                  | DOM 변경 0 (canvas 내부 렌더만, URL 파라미터는 UI 비노출). axe 대상 아님                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 1-5 | **#617/#619 류 정적 가드**     | **영향 0**                  | `showInShortcutBar` / `FOCUS_BODIES` / `targetIds` / allowlist / preset 전부 무변경. solar-system.json 무변경 (데이터 SSoT 비저촉)                                                                                                                                                                                                                                                                                                                                                                                                              |

---

## §축 2 — "mesh.scaling 은 high variant 전용" 주석 계약 개정 (본 ADR 이 SSoT)

### 기존 계약 (solar-system-scene.ts:457~458)

```text
high variant (`meshes.get(id)`) 가 position/scale 의 유일한 owner — mid/low 는
`parent = highMesh` 로 붙어 좌표 추종. `mesh.scaling` 은 high variant 만 건드린다.
```

### 개정문 (정식)

```text
high variant 가 position/transform 의 유일한 owner — mid/low 는 parent = highMesh 로
좌표 추종. `mesh.scaling` 은 high variant 만 건드린다. **예외 1건 (ADR
20260613-675-glow-pixel-marker §축 2)**: low variant quad 는 glow marker 의 화면 고정
크기 역보정 (`scaling = targetPx × bodyScale / pxDiameter`) 에 한해 자체 scaling 을
사용한다. low quad 는 BILLBOARDMODE_ALL + parent 좌표 추종이므로 scaling 은 local
크기에만 작용 — position owner 단일성 (계약의 본질) 은 불변. mid variant 는 여전히 금지.
```

### 근거

- 계약의 원래 목적은 **transform 소유권 단일화** (mid/low 가 position/scale 을 자체 변경하면 LOD 전환 시 좌표 drift). glow 역보정은 low quad 의 **local 크기만** 변경 — parent (high) 의 position/scale 상속 체계는 그대로이므로 계약의 본질 비침해
- 해제 시 `scaling.setAll(1)` 원복이 상태 전이 분기에 박제 — low 이탈 시 잔존 scaling 없음
- 프리뷰 주석의 "프리뷰 한정, 정식 라운드 진입 시 ADR 로 계약 개정 의무" 문구를 본 ADR cross-link 로 교체 (dev 작업 항목)

---

## §축 3 — popping: (c) 명시 수용 (히스테리시스/cross-fade 기각)

### 실측 기반 경계 분석 (결정의 핵심)

발동 조건은 `nextLevel === 'low'` **AND** `실 billboard px < 4`. 그런데 27 body 전수가 bodyScale ≥ 48 (최소 행성 그룹) 이므로:

```text
low 대역 (effective px < 16) 에서 실 billboard px = effective px ÷ bodyScale < 16/48 ≈ 0.33px ≪ 4
```

즉 **low 진입 = 발동, low 이탈 = 해제** — 4px 임계는 현 데이터로 low 대역 내 도달 불가 (bodyScale 미정의 body 방어용으로만 잔존). 따라서 glow on/off 전환점은 **LOD low 경계 그 자체**이며, 그 경계는 이미 기존 인프라가 처리한다:

- **200ms LOD cross-fade** (`LOD_FADE_DURATION_MS`) — low variant 가 alpha 0→1 로 fade-in 하며 glow 상태로 등장 → emissive 점프 (0.3→1.6) 가 fade 에 마스킹
- **tier ±15% 히스테리시스** — tier 전환발 renderScale 점프는 기존 메커니즘이 흡수. glow scaling 은 매 프레임 `targetPx × bodyScale / pxDiameter` 재계산이라 줌·tier 변화에 **연속 추종** (low 대역 내부에서는 화면 크기 고정 = 불연속 없음)

### 옵션 비교

| 옵션                       | 내용                                          | 평가                                                                                                                                       |
| -------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| (a) 발동/해제 히스테리시스 | 발동 < 4px / 해제 ≥ 4.6px (tier ±15% 정합)    | **기각** — 4px 임계가 low 대역에서 도달 불가능하므로 발동 불가능한 경계에 대한 dead-code 가드. 가드 설계 원칙 (발화 빈도 0 가드 금지) 위배 |
| (b) emissive cross-fade    | LOD fade 와 별도로 emissive 를 200ms 보간     | **기각** — LOD cross-fade 가 이미 동일 구간을 마스킹 (이중 fade). 매 프레임 material 쓰기 추가 (Set 추적의 "전이 시 1회만" 설계 후퇴)      |
| (c) 명시 수용 + 분석 박제  | 코드 변경 0 — 본 §의 경계 분석을 SSoT 로 박제 | **채택** — 프리뷰 D-T2 3회가 이 동작 그대로 승인 (popping 불만 0). 전환점 = LOD 경계 = 기존 fade 마스킹                                    |

**재검토 조건**: D-T2 또는 후속 사용에서 LOD 경계 flicker (mid 16px ↔ glow 4.5px 크기 점프) 불만 관찰 시 (a) 를 LOD 경계 자체의 히스테리시스로 승격 (별도 이슈 — LOD 결정 로직 변경이므로 R4 Amendment 3 보존과 충돌 검토 필요).

---

## §축 4 — off-frustum px=0 가드: 현행 유지 (frustum 판정 분리 기각)

- 프리뷰 가드: `Number.isFinite(pxDiameter) && pxDiameter > 0` — 미충족 시 비발동
- 실측 (iteration 2): 5 AU 에서 halley/swift-tuttle px=0 = **화면 밖** — 마커 불필요가 정답. "화면 안인데 px=0" degenerate 는 projection 특이점 (behind-camera 등) 한정이며, 발생해도 결과는 **marker 1프레임 누락** (fail-safe) — 반대 방향 (가드 제거) 은 `targetPx/0` scaling 폭주 (치명)
- Babylon `isInFrustum` 매 프레임 27 body 호출 분리는 비용 추가 + 동일 결론 — **기각**. 가드 의미를 상수 옆 주석으로 박제 (dev 작업 항목)

## §축 5 — ring 동반 body: glow dot + 잔존 ring 픽셀 공존 명시 수용

- ring mesh 는 host (high mesh) 의 child 로 생성되며 LOD 전환은 `isVisible` 로 variant 만 토글 (`setEnabled` 전파 회피 설계) — **ring 은 low LOD 에서도 상시 렌더 = 기존 동작** (본 기능과 무관하게 R7 부터 그래왔음)
- 프리뷰 iteration 2 행성 전수 발동 실측에 saturn/uranus/neptune 포함 — 사용자 D-T2 승인 범위 내. glow dot 4.5px 옆 수 px ring 잔상은 오히려 "고리 행성" 식별 단서로 작용
- low LOD ring 숨김은 (1) 기존 동작 변경 (glow 와 직교한 별도 Behavior Change) (2) R4 LOD 보존 비-범위 저촉 — **기각**. 후속 불만 시 별도 이슈

## §축 6 — 단위 테스트 + 가드 설계

### 구조: 판정 로직 순수 함수 분리 (프리뷰 대비 유일한 구조 재작업)

신규 모듈 `packages/core/src/scene/glow-marker.ts`:

```text
- 상수: GLOW_MARKER_ACTIVATION_PX_DIAMETER (= LOD_BILLBOARD_ALPHA_MASK_MIN_PX_DIAMETER 참조)
        GLOW_MARKER_TARGET_PX_PARENT = 4.5 / GLOW_MARKER_DEFAULT_SATELLITE_RATIO = 2
        GLOW_MARKER_MAX_SCALE = 1e8 / GLOW_MARKER_MIN_MEASURED_PX = 1e-6
        GLOW_MARKER_EMISSIVE_SCALE = 1.6 / GLOW_MARKER_EMISSIVE_SCALE_SATELLITE = 2.0
        (전부 export — PM 확정값 테스트 박제 대상)
- resolveGlowMarker(input): { active: boolean, targetPx, scale, emissiveScale } 순수 함수
  (입력: glowMarker, nextLevel, pxDiameter, bodyScaleVal, parentId, kind, satelliteRatio)
```

scene (`runLodPass`) 은 본 함수 호출 + mesh/material 적용만 담당 — 호출 구조·연산량 프리뷰 동일. `solar-system-scene.ts` 내 inline export (선례 `shouldApplyBillboardAlphaMask`) 대신 분리 모듈을 택한 이유: scene 파일 2100+ 라인 성장 억제 + Babylon import 없는 순수 단위 테스트. `package.json` exports sub-path 는 **추가하지 않음** (verify-core-exports-immutable §결정 D2 — scene 내부 모듈 import 만)

### 단위 테스트 매트릭스 (`glow-marker.test.ts` + `parse-marker-mode.test.ts`)

| 축        | 케이스                                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 발동 판정 | low + billboardPx < 4 → active / mid·high → inactive / `pxDiameter` 0·음수·NaN·Infinity → inactive (off-frustum) / `glowMarker=false` → 무조건 inactive |
| 크기 계층 | parent (parentId='sun') 4.5 / satellite 2.25 (ratio 기본 2) / ratio=3 → 1.5 / star (sun) 4.5 (PM 확정값 박제)                                           |
| scaling   | `scale = targetPx × bodyScale / pxDiameter` 산식 / MAX_SCALE 1e8 클램프 / 하한 1 클램프                                                                 |
| emissive  | parent 1.6 / satellite 2.0 / 원복 값 star full vs non-star 0.3 (createBodyBillboard 기본값 SSoT 대조)                                                   |
| 파서      | 미지정 → `'glow'` (기본 ON) / `off` / `glow` / 대소문자 / unknown → `'glow'` + warn / ratio 미지정 2 / 범위 밖 폴백                                     |
| 무회귀    | `?marker=off` 경로에서 scene glow 분기 연산 0 (Set empty) — scene 통합 테스트 1건                                                                       |

### 헤드리스/CI 가드

- **신규 `browser-verify-glow-marker.mjs`** (browser-verify-comets 답습): ① 40 AU/100 AU 식별 천체 카운트 ≥ 프리뷰 기준 (+10/+11) ② `?marker=off` 가 기존 동작과 픽셀 동일 ③ off-frustum body marker 부재. CI detect-and-test 통합
- **r1-guard**: baseline 전면 갱신 (bootstrap feature-ref dispatch) — §축 1-1
- **기존 27 body 무회귀**: core 817 + web 207+ 단위 suite green + browser-verify-378-focus 16/16

## §축 7 — 상수·파서 정식 배치

- 상수: 프리뷰의 `solar-system-scene.ts` 하단 비-export 상수 → `glow-marker.ts` 로 이동 + export (§축 6)
- `parse-marker-mode.ts`: **현 위치 유지** (`apps/web/src/core/` — parse-gpu-tier/parse-lod-level 선례와 동일 디렉토리·구조). `[preview]` 주석 태그 제거 + 본 ADR cross-link
- `?ratio=` 파라미터: **유지** (디버그/후속 PM 튜닝용 — 기본 2 가 PM 확정값이므로 default 경로 무영향, 제거 시 후속 비교 프리뷰 비용만 증가)
- `?marker=glow` 명시 지정: 유지 (기본값과 동일 — 하위 호환, 프리뷰 공유 URL 보존)

---

## Concrete Prediction (구현 PR 검증 대상)

프리뷰 diff (+221/-10, 3 파일 — CHANGELOG/version 제외 시 +219) 기준 분리 예측:

1. **프리뷰 코드 채택율**: `solar-system-scene.ts` glow 분기 (+148 중 로직 ~110 라인) 는 **판정 식 추출 외 로직 재작업 0** — inline 판정 (~25 라인) 이 `glow-marker.ts` 호출로 치환되는 이동만. `parse-marker-mode.ts` 는 기본값/폴백 **2곳 5라인 이내** 수정 + 주석 갱신. `sim-canvas.tsx` 는 주석만
2. **정식화 신규 추가분**: `glow-marker.ts` ~80 라인 (상수+순수 함수+주석) / `glow-marker.test.ts` ~150 라인 / `parse-marker-mode.test.ts` ~80 라인 / `browser-verify-glow-marker.mjs` ~150 라인 / 주석 계약 개정 ~10 라인 — **코어 행동 변경 라인 (테스트·주석·스크립트 제외) ≤ 15** (기본값 flip + 함수 추출 경계)
3. **baseline**: pixel-diff 전면 갱신 (코드 0 — bootstrap dispatch) / fps·a11y·diskArea·정적 가드 **갱신 0**

예측 실패 시 (코어 행동 변경 > 15 라인 또는 fps baseline 갱신 필요) — 본 ADR Amendment 로 원인 박제.

## DoD 확정 (이슈 초안 → ADR 확정)

- [ ] 줌아웃 시 비-식별 body **전수 27 (sun 포함)** glow 표기 — 행성:위성 2:1 식별 (이슈 초안 "28" off-by-one 정정: allowlist SSoT = 27 body)
- [ ] **기본 ON** + `?marker=off` 옵트아웃 — `?marker=off` 가 기존 동작과 동일 (헤드리스 픽셀 대조)
- [ ] r1-guard pixel-diff baseline 전면 갱신 (bootstrap feature-ref dispatch) + PR 스크린샷 박제 / px-ratio·diskArea·fps·a11y **갱신 0 실측 확인** (sun viewport 밝기 점유율 영향 실측 1회 포함)
- [ ] popping 명시 수용 박제 (§축 3 — 코드 변경 0) — LOD 경계 cross-fade 마스킹 D-T2 확인
- [ ] 단위 테스트 green (glow-marker + parse-marker-mode 신규, §축 6 매트릭스) + 기존 27 body 무회귀 (core 817+ / web 207+ / browser-verify-378-focus)
- [ ] `browser-verify-glow-marker.mjs` 헤드리스 정량 (40 AU +10 / 100 AU +11) + CI 통합
- [ ] 주석 계약 개정 반영 (`solar-system-scene.ts:458` + `[preview]` 태그 전수 제거 + 본 ADR cross-link)
- [ ] D-T2 실 Chrome ≥ 1회 (headless ≠ 실 브라우저 — CRITICAL #3 확장)

## 위험 / 미해결

- **pixel-diff baseline 갱신 직후 무관 PR 의 flaky 가능성** — glow 픽셀은 결정적이나 1~2px gradient 가장자리의 GPU rasterization 차이 가능. mismatch ≤ 0.5% 마진 내 예상, 초과 시 baseline 재캡처 (기존 절차)
- **모바일 실기기 시인성** — 4.5px physical px 가 고밀도 소형 화면에서 충분한지 미실측 (#219 won't-do 로 자동화 불가). D-T2 데스크톱 승인 기준 출고, 모바일 불만 시 targetPx 모바일 분기 후속
- **LOD 경계 크기 점프 (mid 16px ↔ glow 4.5px)** — §축 3 재검토 조건으로 박제 (현 D-T2 승인 범위)

## Claude 편향 4종 셀프 체크 (cross-validate 호출 전 사전 기록)

| 축            | 점검 결과                                                                                                                                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 낙관적 일정   | 통과 — Concrete Prediction 에 재작업/신규 라인 분리 수치 + 실패 시 Amendment 조건 박제. baseline 갱신 라운드 (bootstrap dispatch) 비용 명시                                                                                                                                           |
| 결합 간과     | 통과 (본 ADR 핵심) — 기본 ON 의 5축 가드 결합 (pixel-diff/diskArea/fps/a11y/정적) 전수 평가 + 측정 정의 (해석적 vs readback) 로 영향 분리. 단, **sun viewport 밝기 점유율 readback 영향은 보수 상한 추정** — dev 실측 의무로 잔여 불확실성 이관 → cross-validate 프롬프트에 명시 질문 |
| 폐기 프레이밍 | 통과 — 주석 계약을 "폐기" 가 아닌 "예외 1건 개정" (본질 보존), star 제외 설계 폐기는 PM/D-T2 실측 근거                                                                                                                                                                                |
| 순수주의      | 주의 — `glow-marker.ts` 모듈 분리가 프리뷰 inline 대비 유일한 구조 재작업. 최소 범위 (판정 식만, frame loop 불변) 로 제한했으나 분리 자체의 적정성을 cross-validate 프롬프트에 명시 질문                                                                                              |

## 교차검증 반영 사항 (cross-validate 2026-06-12 agy outcome=applied — "Accepted 전이 적극 권장")

> 로그: `.claude/logs/cross-validate-architecture-20260612-232604.log`. 명시 질문 2건 전부 응답 확보.

### 합의 (명시 질문 2건 — 추가 조치 없음)

1. **① sun viewport readback 보수 상한 (+0.035%p)** — agy "타당함 (안전함)": 1280×720 에서 marker 1개 ≈ 16px² ≈ 0.0017%, 20여 개 전체 켜져도 +0.035%p — 25% 임계 대비 극미. dev 실측 1회 DoD 는 "훌륭한 안전장치" 평가 — §결정 1 유지
2. **② glow-marker.ts 순수 함수 분리** — agy "매우 적절함 (권장)": solar-system-scene.ts 2100+ 라인 비대 모듈에서 판정 수식 분리 = Babylon 로딩 없는 고속 단위 테스트 가능 — §결정 4 유지

### 이견 / 기각 (0건)

- 기본 ON (web 레이어 flip) / popping 명시 수용 (LOD 경계 일치 논거) / 주석 계약 개정 / off-frustum 가드 전부 agy 동의

### 고유 발견 (1건 — 발화 조건부 후속 박제)

1. **pixel-diff flaky 가능성** — gradient 경계부의 GPU 래스터화 디바이스/드라이버별 미세 차이로 baseline 경계 flaky 위험. agy 제안: 마진 여유 또는 marker 주변부 masking 옵션. **Claude 취사**: baseline 은 Linux CI 단일 환경 캡처 (r1-baseline-bootstrap — 환경 고정이라 디바이스 간 차이 비발화) 이므로 선제 masking 은 과잉 — **발화 조건부 후속**: 갱신 후 동일 환경 re-run 에서 mismatch > 0 관찰 시 (= 동일 GPU 내 비결정성 실증) masking 옵션 이슈 분리

### Claude 편향 셀프 체크 결과 대조

- 사전 기록 4항목 전부 agy 평가와 모순 없음 — popping 기각 논거 (도달 불가 경계 dead-code 가드) 를 agy 가 성능 제어 우수 사례로 독립 평가

---

## Amendment 1 (2026-06-13) — Concrete Prediction ② 메트릭 단위 정제 (구현 PR #677 실측)

- **실측 분기**: 행동 semantics 변경 = **4 statement ≤ 15 적중** / 라인-문자 해석 (prettier 멀티라인 + 함수 추출 경계 포함) = **23 > 15 실패** — 동일 diff 의 해석 차이 (PR #677 정직 박제 → reviewer 판정 "원인은 추상화 결함이 아닌 메트릭 단위 모호")
- **정제**: Concrete Prediction 의 코어 예산 메트릭은 이후 라운드부터 **"행동 semantics 변경 statement 수"** 기준 (prettier 줄바꿈/함수 추출 경계의 기계적 라인 증가는 제외 — 단 추출 자체가 신규 분기/조건을 추가하면 포함). 본 ADR ② 의 "(기본값 flip + 함수 추출 경계)" 괄호가 라인 해석을 유도한 모호 표기였음을 인정
- **동승 박제 (reviewer 권고 3)**: §축 6 "scene 통합 테스트 1건" 은 구현에서 **headless 5축 가드 (`browser-verify-glow-marker.mjs`) 의 축 ②** 로 대체 — Babylon scene 의존 단위 테스트 대신 실 렌더 경로 검증이 상위 보증 (동등 이상 대체, 결손 아님)

## Amendment 2 (2026-06-13) — CI fps-baseline-guard mobile FAIL 원귀인 정정: glow 무관 (tier-c LOD override race — #677 forensic)

구현 PR #677 의 CI fps-baseline-guard mobile 3 시나리오 FAIL (60.4→38.8 / 60.1→34.1 / 59.1→34.5, run 27425095939) 은 **glow marker 비용이 아님** — Concrete Prediction ③ "fps baseline 갱신 0" 은 **유지** (실측 입증).

- **forensic 핵심 증거 (3축)**:
  1. **order 통제 A/B**: mobile 375×667 / CPU 12x throttle 에서 OFF-1st 19.5 / ON-2nd 23.2 / OFF-3rd 21.0 / ON-4th 21.4 FPS — glow ON/OFF 차이 소멸, "첫 로드" 만 느림. `?lod=auto` 고정 (race-lost 상태 등가) A/B 에서도 ON 20.6 / OFF 20.5 / ON 20.5 — **glow per-frame 비용 ≈ 0** (swiftshader 강제 4x 에서도 ON 114.8 / OFF 114.5)
  2. **CI 이력 비상관**: glow 기본 ON 본체 커밋 0f297de 의 run 27424529423 은 **PASS**. FAIL 2건 (29fda0f r1-guard baseline / fc58d50 docs+pin) 은 fps 무관 diff. 결정적으로 **glow 부재 develop push run 27412497611 (2026-06-12 11:21) 이 동일 시그니처로 선행 FAIL** ([desktop/default] 28.1 FPS, −43.7%)
  3. **상태 재현**: race-lost 시 `lodStats.override='auto'` 잔존 → tier-c 강제 low 유실 → sun **high** (131.7px sphere) + mid 4 렌더 — swiftshader CI 에서 비용 증폭. 로컬 cold first-load 에서 재현 (override auto), warm load 는 low
- **근본 원인**: `sim-canvas.tsx` 의 tier-c 강제 LOD 적용이 (a) `detectGpuCapability().then` 의 `__gpuTierForceLod` 플래그 박제와 (b) `instance.start().then` 의 handler 등록 시점 1회 읽기로 분리된 **양방향 race** — (b) 가 먼저 끝나면 (headless/저속 환경에서 `requestAdapter` 지연) 강제 low **영구 유실**. 한 page load 의 race 결과가 해당 viewport 의 3 시나리오 측정 전체를 오염 (verify-fps-baseline 은 viewport 당 1회 navigation)
- **fix (glow 코드 0 변경 — PM 확정값 전부 보존)**: (a) 경로에서 `coreRef.current?.command({ type: 'setLodOverride', level })` 직접 발행 동승 — handler 미등록이면 no-op ((b) 가 처리), 양 경로 idempotent. **회귀 가드**: `browser-verify-glow-marker.mjs` **축 6 신설** — requestAdapter 를 scene 준비 완료까지 게이트해 race-lost 방향을 결정론 재현 (pre-fix FAIL / post-fix PASS 3중 시뮬레이션 실측)
- **popping (c) / §축 1~7 결정 전부 무영향** — 본 Amendment 는 원귀인 정정 + web 레이어 race fix 기록

### Amendment 2 교차검증 반영 (cross-validate 2026-06-13 agy outcome=applied — "전이 및 구현 강력 권장")

- **합의**: race 원귀인 분석 + 축 6 결정론 가드 "훌륭" / 증분 reviewer 도 증거 2축 (run 27412497611 선행 FAIL / 27424529423 PASS) gh 독립 재검증 일치
- **권고 기충족 (조치 0)**: `?ratio=` 범위 밖 클램핑 — `parseGlowMarkerRatio` 가 1~10 외/비수치 → 2 폴백 + warn 기구현
- **고유 발견 (2건 — 범위 밖 기록)**: ① 저전력 모바일 실기기 1회 프레임 프로파일링 (27 body 역보정 scaling — swiftshader 외 실기기 검증. #219 iOS won't-do 선례와 동일 제약, 발화 조건: 실기기 성능 보고 접수 시) ② glow 시인성의 배경 대비 최소 명도 보정 (colorHint 무관 contrast 하한 — 어두운 colorHint body 의 시인성. 발화 조건: D-T2 "특정 body 마커 안 보임" 보고 시 PM 라운드)

## Amendment 3 (2026-06-13) — tier-c LOD override race 제3 윈도우 확정 + 근본 fix (#680 forensic, CI 진단)

Amendment 2 의 fix (detectGpuCapability().then 의 command 직접 발행) 후에도 CI fps-baseline-guard **mobile 3 시나리오 잔존 FAIL** (run 27456421530 attempt 3). #683 가 도입한 `captureLodDiag` 가 측정 시점 LOD 상태를 박제해 **제3 윈도우를 확정** — Amendment 2 가 놓친 **세 번째 setLodOverride 출처 (UrlSync mount command)** 가 원인.

- **확정 진단 (CI run 27456421530 attempt 3)**: desktop 3 시나리오 `tier=c override=low lod=0/0/27` (정착, 전부 PASS) / mobile 3 시나리오 `tier=c override=auto lod=1/4/22 등` (race-lost, 전부 FAIL, FPS 33~36.8). desktop 은 정착, mobile 만 race-lost.
- **원귀인 (로컬 forensic trace 로 5초 단위 확정 — `_debug-680-trace-tmp.mjs`, 즉시 rm)**: race-lost 시 동일 scene 인스턴스에 `setLodOverride('low')`@1059ms → **`setLodOverride('auto')`@1272ms** 순서로 두 번 호출됨. 두 번째 'auto' 는 **`url-sync.tsx:120-122` 의 mount useEffect 가 `?lod=` 미지정 시 무조건 발행하는 `sendCommand({ type: 'setLodOverride', level: 'auto' })`**. 이 command 가 scene handler 등록 **후** 도착하면 tier-c 강제 'low' 를 'auto' 로 덮어쓴다 → sun **high** (sphere 1) + mid 3~4 렌더 → swiftshader 에서 FPS 끌어내림.
- **제3 윈도우 = 출처 3개의 비결정적 도착 순서**: (1) `detectGpuCapability().then` 의 command (Amendment 2 보강), (2) `instance.start().then` 의 handler 등록 + 초기 `tierForced` 읽기 (P11-B), (3) **UrlSync 의 mount `setLodOverride('auto')` command (Amendment 2 가 누락)**. (3) 이 (2) 이후 + (1) 의 'low' 적용 이후 도착하면 강제 low 영구 유실. 결정 변수는 UrlSync command 가 handler 등록 전(no-op → PASS)인지 후(덮어씀 → FAIL)인지.
- **고정 지연 스윕 재현 (`_debug-680-sweep-tmp.mjs`, 즉시 rm)**: requestAdapter(1번째=detectGpuCapability) 지연 sweep 에서 **delay=0 → override='auto' lod=1/4/22 (CI 시그니처 정확 일치)**, delay≥50ms → 'low'. delay=0 에서 scene init 이 빨라 handler 등록 후 UrlSync command 도착 → race-lost. 100% 결정론 재현.
- **근본 원인 = 앱 코드** (측정 하네스 아님): `verify-fps-baseline` 의 `waitForLodSettle` (#683) 은 정상 작동 (영구 race-lost 라 settle timeout 후 FAIL 표면화 — 은폐 아님). 실 사용자도 tier-c 기기에서 동일 race 를 겪으므로 측정만 고치면 제품 버그 잔존 — 앱 fix 우선이 정답.
- **fix (sim-canvas.tsx, glow 코드 0 변경 — PM 확정값 전부 보존)**: handler 가 매 진입마다 **현 URL `?lod=` + `__gpuTierForceLod` 강제 플래그를 재참조** (`resolveLodWithTierForce`) 해 미지정 기본 ('auto') 을 강제값으로 치환. 사용자 명시 `?lod=` (URL 우선 원칙) 는 그대로 통과. 강제 플래그가 늦게 박제돼도 후속 어떤 setLodOverride 진입에서든 강제값 복원 → **출처 도착 순서 무관 idempotent 정착**. 초기 적용 블록도 동일 헬퍼로 통일 (강제 보존 로직 SSoT 단일). #677 의 2중화를 **3중 (UrlSync 경로 커버) + 순서 보장 (재참조)** 으로 강화.
- **3중 시뮬레이션 (delay sweep 실측)**: negative (pre-fix delay=0 → 'auto' race-lost) → recovery (post-fix delay=0 → 'low' 5/5) → positive (delay≥50 → 'low'). trace 재확인: 1275ms 의 UrlSync command 가 이전 'auto' → 이제 'low' 로 치환됨.
- **회귀 가드**: 축 6 (`browser-verify-glow-marker.mjs`) 무회귀 PASS (지연 tier-c 감지 후 override='low' 정착). 단위 853 (web 357 + core 492 + shared 4) 무회귀. 축 6 가드는 (2)-(1) race 만 게이트하므로 (3) UrlSync race 는 직접 커버 안 하나, 본 fix 의 handler 재참조가 모든 출처를 idempotent 하게 흡수해 축 6 도 통과.
- **popping (c) / §축 1~7 결정 전부 무영향** — 본 Amendment 는 race 제3 윈도우 확정 + web 레이어 fix 기록. Concrete Prediction ③ "fps baseline 갱신 0" 유지 (glow 무관 재확정).

> cross-validate 통합 대기: 본 Amendment 는 reviewer/architect 의 후속 cross-validate 1회 루틴 대상 (#370 옵션 C — race fix 설계 결정). developer 는 cross-validate 직접 호출 범위 밖 (#479).
