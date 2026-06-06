# ADR: satellite 궤도 라인 구조 결함 — phobos/deimos/galilean 궤도선이 parent 미추적 + visual scale 미적용으로 태양 원점에 잘못 렌더 (R6 D-T2 표면화)

- **상태**: **Accepted** (사용자 옵션 선택 2026-06-06 옵션 A+D + cross-validate 2026-06-06 agy outcome=applied 통합 — §교차검증 반영 사항 본문 통합 완료. fix 구현은 developer 단계)
- **날짜**: 2026-06-06
- **결정자**: architect (#627 R6 PR D-T2 forensic 단계)
- **관련**: [#627](https://github.com/coseo12/astro-simulator/pull/627) (R6 PR — galilean 4개로 표면화), [`20260605-r6-jupiter-galilean-visualization.md`](20260605-r6-jupiter-galilean-visualization.md) (R6 SSoT — JUPITER_SATELLITES_ORBIT_VISUAL_SCALE=16), [`20260528-r5-mars-visualization.md`](20260528-r5-mars-visualization.md) (**R5 SSoT — MARS_SATELLITES_ORBIT_VISUAL_SCALE=500 박제했으나 구현은 moon 만 → 본 결함 최초 도입 시점**), [`20260520-r4-earth-moon-visualization.md`](20260520-r4-earth-moon-visualization.md) (R4 SSoT — §결정 4 moon orbit 별도 LineSystem + position 동기화 + scaling 패턴, **본 fix 의 일반화 출발점**), [`20260509-380-zoom-camera-freeze-forensic.md`](20260509-380-zoom-camera-freeze-forensic.md) (camera-controller lowerRadiusLimit 동적 완화 SSoT — §1 camera R6 무관 분석 참조), [`docs/architecture/principles.md`](../architecture/principles.md) §1 Visual Fidelity
- **교훈 적용**:
  - "DoD PASS ≠ 제품 동작" (volt [#74](https://github.com/coseo12/volt/issues/74) — R5 satellite 궤도선 미검증으로 자동 DoD 통과한 채 잠복. R6 galilean 4개로 표면화)
  - "headless 브라우저 검증 ≠ 실 브라우저" (volt [#77](https://github.com/coseo12/volt/issues/77) — headless D-T2 가 궤도선 위치 오류 미포착. 실 Chrome 에서만 "불필요한 궤도라인 / 잔상" 인지)
  - "인계 항목 실측 재검증" (volt [#14](https://github.com/coseo12/volt/issues/14) — R5 ADR 의 MARS_SATELLITES_ORBIT_VISUAL_SCALE 박제 vs 실제 구현 갭을 runtime 실측으로 확정)
  - "주석 계약 vs 구현 drift — 버그 생성원" (orbit-visual-scale.ts §적용 위치 주석은 "rebuildOrbitLines — moon orbit LineSystem.scaling 적용" 만 명시 → satellite 일반 batch 누락이 주석에 박제된 채 drift)
  - "결합 간과 — Claude 4종 편향" (volt [#29](https://github.com/coseo12/volt/issues/29) — mesh 경로 (resolveWorld) 와 orbit-line 경로 (rebuildOrbitLines) 의 비대칭을 R4/R5 에서 결합 검증 안 함)

---

## §1 배경

### 본 이슈 핵심

R6 PR #627 의 실 Chrome D-T2 검증에서 사용자가 두 회귀를 보고 (headless 8/8 PASS 가 놓침 — volt #77):

1. **galilean (io/europa/ganymede/callisto) 이 목성 대비 비율 과대** — zoom-in focus 시 너무 큼
2. **focus 시 불필요한 궤도라인 + 탐색 모드에서 궤도라인 잔상** — 하위 노드 위성 전부 (moon/phobos/deimos/galilean) 의 궤도선이 엉뚱한 위치에 그려짐

- **회귀 발화점**: R6 PR #627 D-T2 (실 Chrome). 단, **근본 결함은 R5 (#594) 부터 도입** — phobos/deimos 궤도선이 R5 D-T2 에서 미검증되어 잠복. galilean 4개로 표면화.
- **영향 범위**: 모든 viewport / 모든 tier. 하위 노드 satellite (moon 제외 phobos/deimos/io/europa/ganymede/callisto) 의 궤도선 전부.
- **의도 vs 실제 갭**: R5 ADR §결정 4 가 `MARS_SATELLITES_ORBIT_VISUAL_SCALE=500` 을 박제하고 "satellite orbit visual scale 적용" 을 명시했으나, **실제 구현은 moon 만** 별도 LineSystem (`moon-orbit-line`) 으로 parent 추적 + scaling 적용. phobos/deimos/galilean 은 일반 `batches` 로 처리 → position (0,0,0) 태양 원점 고정 + scaling 1 (visual scale 미적용). 자동 DoD (mesh px 비율 / a11y / fps) 는 궤도선 **위치** 를 검증하지 않아 통과.

### Forensic 측정 결과 (2026-06-06, develop tip = `d243ec3`)

`scripts/_debug-satellite-orbit-tmp.mjs` (volt #67 패턴 일회성 debug) 로 실측 후 즉시 `rm`.
데이터: [`docs/reports/627-satellite-orbit-structure-debug-output.json`](../reports/627-satellite-orbit-structure-debug-output.json).

> ⚠️ `_debug-*-tmp.mjs` 는 실측 직후 `rm` (영구 박제 금지). 결과 JSON 만 박제. 영속화 가치가 있는 측정은 fix 단계에서 `apps/web/scripts/browser-verify-627-satellite-orbit.mjs` 회귀 가드로 승격 권고 (§5).

> 측정 시각 자료 (PNG embed — #382): 본 forensic 은 **scene-graph 좌표 실측** 이 핵심 증거 (스크린샷은 작은 궤도선이 sun bloom 에 묻혀 시각 변별 낮음) 이므로 PNG embed 대신 좌표 표/히스토그램으로 박제. fix 단계 before/after 스크린샷은 `docs/reports/627-fix-*.png` 로 추가 권고.

#### 측정 1 — LineSystem position/scaling (탐색 시점, tier=solar, 1280×720)

| LineSystem | position | scaling | worldCenter | 비고 |
|---|---|---|---|---|
| `orbit-lines` (batch) | **(0, 0, 0)** | **(1, 1, 1)** | (-3.03, -0.81, 0.07) | **position 고정 + scale 1 — parent 미추적 + visual scale 미적용** |
| `moon-orbit-line` (별도) | (-3.01, **11.98**, ~0) | **(30, 30, 30)** | (-3.02, 11.93, ~0) | position = earth scene 좌표 (parent 추적) + scaling 30 = `getOrbitVisualScale('earth')` |

- **관찰 1**: `moon-orbit-line` 은 position 이 earth scene 좌표 (11.98) 로 매 프레임 동기화 + scaling 30 적용 → moon mesh (distToOrigin 11.39) 와 정합.
- **관찰 2**: `orbit-lines` 는 모든 비-moon 궤도를 하나의 LineSystem 에 담아 position (0,0,0) 고정. planet 궤도는 sun 중심이라 정상이지만, **satellite 궤도 점은 parent-relative ellipse (parent 0 원점 기준)** 라 parent offset 없이 sun 근처에 잘못 렌더.

#### 측정 1b — `orbit-lines` vertex 원점 거리 분포 (715 점)

| 거리 bucket (scene unit) | 점 개수 | 해석 |
|---|---|---|
| < 1 | **390 (54%)** | satellite 궤도 (phobos/deimos/galilean) — parent-relative 작은 ellipse 가 **태양 원점에 밀집** |
| 1–5 | 40 | 내행성 궤도 일부 |
| 5–20 | 199 | 내행성 ~ 중간 궤도 (정상) |
| 20–40 | 21 | 외행성 궤도 |
| 40–70 | 65 | jupiter 궤도 (~52 AU scene unit, 정상) |

- min 거리 = **7.76e-4** (io 가장 안쪽 궤도점), median = 0.158.
- **결론**: 715 점 중 390 점 (54%) 이 원점 1 unit 이내에 satellite 궤도 ellipse 로 밀집 — 이것이 사용자가 본 "탐색 모드 궤도라인 잔상" (태양 주변 작은 링 다발) + "focus 시 불필요한 궤도라인" (jupiter focus 시 galilean 궤도가 jupiter 가 아닌 sun 에 있음).

#### 측정 1c — satellite mesh vs parent 거리 (mesh 경로는 정상)

| satellite | parent | distToParent | distToOrigin | mesh가 parent추적 |
|---|---|---|---|---|
| moon | earth | 1.023 | 11.39 | ✅ |
| phobos | mars | 0.396 | 17.35 | ✅ |
| deimos | mars | 0.986 | 16.52 | ✅ |
| io | jupiter | 0.566 | 62.87 | ✅ |
| europa | jupiter | 0.906 | 62.12 | ✅ |
| ganymede | jupiter | 1.442 | 61.56 | ✅ |
| callisto | jupiter | 2.547 | 60.79 | ✅ |

- **모든 satellite mesh 는 parent 를 정상 추적** (distToParent ≪ distToOrigin). `resolveWorld` (solar-system-scene.ts:1481-1485) 가 `parentWorld + local × getOrbitVisualScale(parentId)` 적용.
- **핵심 비대칭**: mesh 경로 (✅ 정상) vs orbit-line 경로 (❌ 결함). 사용자 인지: galilean mesh 는 jupiter 옆에 있는데 galilean 궤도선은 sun 옆에 있어 **mesh ↔ 궤도선 분리** = "불필요한 궤도라인".

#### 측정 2 — galilean world radius / jupiter 비율 (사용자 보고 1 분석)

| body | worldRadius | ratioToJupiter | 비고 |
|---|---|---|---|
| jupiter | 0.4993 | 1.000 | BODY_SCALE 48 (R6 PM Q2=B 거성 예외) |
| io | 0.0795 | **0.159** | BODY_SCALE 300 |
| europa | 0.0681 | **0.136** | BODY_SCALE 300 |
| ganymede | 0.1150 | **0.230** | BODY_SCALE 300, 태양계 최대 위성 |
| callisto | 0.1052 | **0.211** | BODY_SCALE 300 |
| (baseline) moon | 0.0506 | **0.068** (vs earth) | BODY_SCALE 200 |

- **사용자 인지 단위** = jupiter focus zoom-in 시 galilean 의 시각적 크기 (jupiter 대비).
- **ADR 박제 단위** = `BODY_SCALE.{io,europa,ganymede,callisto} = 300`.
- **mismatch 지점**: galilean/jupiter 비율 (0.136~0.230) 이 moon/earth (0.068) 의 **2.0~3.4배**. mesh 크기 순서 (ganymede > callisto > io > europa) 는 사실 순서 정합이나, **절대 비율** 이 moon 학습 (Amendment 4 에서 사실 비율 ×800 → ×200 으로 "비정상적으로 큼" 해소) 대비 과대. galilean BODY_SCALE 300 이 moon 200 의 1.5배인데, jupiter BODY_SCALE 48 이 earth 800 의 6% 라 **상대 비율이 추가로 증폭**. 사용자 "목성 대비 과대" 보고와 정합.

> ⚠️ **사용자 보고 1 (비율 과대) 과 보고 2 (궤도선 위치) 는 별개 결함**. 보고 1 은 BODY_SCALE 재산출 (scale 자체), 보고 2 는 orbit-line 구조 (parent 추적). 본 ADR §결정 은 둘 다 다루되 옵션을 분리.

### 가설 검증 결론

| 가설 | 결론 | 근거 |
|---|---|---|
| **가설 1: satellite 궤도선이 parent 를 안 따라가 태양 원점에 렌더** | **확정 (보고 2 주된 원인)** | 측정 1 (`orbit-lines` position (0,0,0)) + 측정 1b (390/715 점 원점 밀집) + 측정 1c (mesh 는 정상 추적 — orbit-line 만 결함) |
| **가설 2: satellite 궤도선에 visual scale 미적용으로 mesh 와 궤도선 mismatch** | **확정 (보고 2 부수 원인)** | 측정 1 (`orbit-lines` scaling (1,1,1) vs `moon-orbit-line` scaling 30). visual scale 적용해도 parent offset 없으면 여전히 sun 에 있음 → 가설 1 이 1차, 가설 2 가 2차 |
| **가설 3: galilean BODY_SCALE 300 자체가 jupiter 대비 과대** | **확정 (보고 1 주된 원인)** | 측정 2 (galilean/jupiter 0.136~0.230 vs moon/earth 0.068). perspective 아닌 scale 자체 — focus zoom 무관하게 비율 일정 |
| **가설 4: galilean 과대는 perspective (focus zoom 거리) 효과** | **기각** | world radius 비율은 카메라 거리 불변. 측정 2 의 ratioToJupiter 는 zoom 과 무관한 mesh 절대 비율 |

> 가설 1+2 가 보고 2 (궤도선) 의 결합 원인 — parent offset 누락 (1차) + visual scale 누락 (2차). 둘 다 해소해야 moon 패턴과 정합. 가설 3 이 보고 1 (비율) 의 독립 원인.

### 카메라 free-fly 고정 — R6 무관 확정 (별도 이슈 권고)

사용자 별도 보고 "탐색 버튼 사용 시 자유 시점 이동 안 되고 고정" 검증:

- `git diff origin/develop HEAD -- packages/core/src/scene/camera-controller.ts apps/web/src/components/sim-canvas.tsx` → **diff 0 라인** (R6 가 camera 경로 미변경).
- 즉 develop (R5) 에서도 동일 코드 → **R6 무관, 선행 잠복 결함**.
- 정적 분석 (구현은 본 ADR 범위 밖, 권고만): `focusOn` (camera-controller.ts:150-152) 이 satellite focus 시 `lowerRadiusLimit` 을 `desiredRadius × 0.5` 로 동적 완화하나, free-fly 진입 (`detachToFreeFly` → `clearFollow` only, sim-canvas.tsx:408-411) 시 **원복하지 않음**. follow 만 해제하고 camera radius/limit/origin 은 보존하는 설계 (#509) 라, 직전 satellite focus 의 좁은 lowerRadiusLimit + tier/origin lock 이 잔존해 "자유 이동 제약" 으로 인지될 수 있음.
- **권고**: 본 forensic 범위 밖 → **별도 이슈 분리** (§8). develop 재현 확인됨 = R6 차단 사유 아님.

---

## §2 영향 모듈/파일

### 측정 결과 박제 (본 ADR 동반)

- `docs/reports/627-satellite-orbit-structure-debug-output.json` — LineSystem 좌표 + vertex 분포 + mesh/parent 거리 + galilean 비율
- 본 ADR §1 Forensic 측정 결과

### Fix 후보별 영향 모듈 (옵션 선택 후 변경 대상)

- `packages/core/src/scene/solar-system-scene.ts:485-540` (`rebuildOrbitLines`) — satellite 궤도선 분리 처리 (옵션 A/C)
- `packages/core/src/scene/solar-system-scene.ts:994-1007` (updateAt — moon orbit position 동기화 루프) — satellite 궤도선 position 동기화 확장 (옵션 A)
- `packages/core/src/scene/solar-system-scene.ts:548-559, 1494-1499` (`setMoonOrbitHighlight` / `setOrbitLinesVisible`) — satellite 궤도선 가시성/색상 토글 확장 (옵션 A)
- `packages/core/src/scene/orbit-visual-scale.ts` — `getOrbitVisualScale` 재사용 (신규 추가 없음, 옵션 A)
- (옵션 B) Babylon parenting API — `lineSystem.parent = parentMesh` 설정 + local 좌표계 변환

### Fix 가 깨는 박제값 (ADR amendment 필요 후보)

- **R5 ADR §결정 4** (`MARS_SATELLITES_ORBIT_VISUAL_SCALE` "구현됨" 전제) → **Amendment 의무**: "박제했으나 moon 만 구현, satellite orbit-line 은 #627 fix 에서 일반화" 정정 박제.
- **R6 ADR §축 2** (galilean BODY_SCALE 300) → 보고 1 채택 시 재산출 Amendment (galilean scale 하향).
- `orbit-visual-scale.ts` §적용 위치 주석 ("rebuildOrbitLines — moon orbit LineSystem.scaling 적용") → "모든 satellite orbit LineSystem" 으로 갱신.

---

## §3 옵션 비교

### 보고 2 (궤도선 구조) — 옵션 A/B/C

#### 옵션 (A) satellite 궤도를 moon 패턴 일반화 (parent별 position 동기화 + visual scale)

- **변경**: `rebuildOrbitLines` 에서 satellite (parentId ≠ null) 를 parent 별 별도 LineSystem 으로 분리 생성. `getOrbitVisualScale(parentId)` 로 scaling 적용. updateAt 루프에서 parent scene 좌표로 position 동기화 (현 moon 전용 루프를 satellite Map 으로 일반화).
- **장점**: moon 패턴 (R4 #532 검증됨) 의 정확한 일반화. mesh 경로 (`resolveWorld` visual scale) 와 완전 정합. R7+ (titan/saturn moons) 자동 확장 — 데이터만 추가.
- **단점**: LineSystem 개수 증가 (현 2개 → parent 수만큼). draw call 증가 (단, satellite parent 는 earth/mars/jupiter 3개 → +3 수준, #77 draw call 최적화 목적 대비 미미). updateAt 루프에 satellite 별 position 동기화 추가.
- **회귀 예측**: planet 궤도 (sun 중심 batch) 는 무변경. satellite 궤도선이 parent 옆 + visual scale 적용으로 mesh 와 정합. DoD: satellite 궤도선 worldCenter ≈ parent scene 좌표 (±0.1 unit).

#### 옵션 (B) satellite 궤도선을 parent mesh 의 child 로 parenting

- **변경**: satellite LineSystem 생성 후 `ls.parent = meshes.get(parentId)`. local 좌표계 자동 변환 — updateAt position 동기화 루프 불필요. visual scale 은 `ls.scaling` 으로 적용하되 parent mesh 의 scaling (BODY_SCALE) 과 합성됨 → **scaling 분리 주의** (parent mesh scaling 이 궤도선에 전파되면 왜곡).
- **장점**: position 동기화 코드 제거 (Babylon scene graph 가 자동 처리). 선언적.
- **단점**: parent mesh 의 scaling (BODY_SCALE 48 등) 이 child LineSystem 에 전파 → 궤도 ellipse 가 parent mesh 크기로 왜곡. 회피하려면 `ls.parent` 를 scaling=1 중간 노드로 두거나 inverse scaling 보정 필요 → 복잡도 역전. floating origin (매 프레임 origin shift) 과 parent mesh world matrix 의 상호작용 검증 부담. **moon 패턴과 다른 메커니즘** 도입 → 일관성 손실.
- **회귀 예측**: scaling 전파 미처리 시 궤도선 크기 왜곡 회귀 가능성 high.

#### 옵션 (C) focus 시 또는 항상 satellite 궤도 비표시

- **변경**: `rebuildOrbitLines` 에서 satellite (parentId ≠ null, moon 포함 또는 제외) 궤도선 생성 skip. 또는 focus 시 satellite 궤도선 isVisible=false.
- **장점**: 최소 변경 (생성 skip 1 조건). "불필요한 궤도라인" 즉시 제거.
- **단점**: satellite 궤도 정보 자체 손실 (moon 궤도는 R4 에서 의도적 표시 — earth focus 강조까지 박제). galilean 궤도 가시화는 R6 의 교육적 가치 (4개 궤도 동심원). UX 후퇴 — 사용자가 본 문제는 "위치가 틀림" 이지 "궤도선 자체 불필요" 가 아님.
- **회귀 예측**: 궤도선 제거로 문제는 사라지나 R4 moon 궤도 강조 (결정 4) 와 충돌 → moon 제외 시 비대칭 잔존.

#### 축별 비교 매트릭스 (보고 2)

| 축 | (A) parent별 일반화 | (B) parenting | (C) 비표시 |
|---|---|---|---|
| 사용자 인지 회귀 해소 | ✅ 완전 (mesh 정합) | ✅ (scaling 처리 시) | △ (정보 손실로 회피) |
| moon 패턴 일관성 | ✅ 동일 메커니즘 | ❌ 다른 메커니즘 | ❌ moon 만 잔존 |
| R7+ 확장성 | ✅ 데이터만 추가 | △ (parent scaling 보정 매번) | ❌ 위성 궤도 영구 손실 |
| 부수 회귀 위험 | low (moon 검증됨) | **high** (scaling 전파/floating origin) | low |
| 구현 비용 | 중 (moon 루프 일반화) | 중~고 (scaling 보정) | 1줄 (skip) |
| ADR Amendment 필요 | R5 §결정 4 정정 1건 | R5 §결정 4 정정 1건 | R5/R6 satellite 가시화 결정 폐기 |

### 보고 1 (galilean 비율 과대) — 옵션 D/E

#### 옵션 (D) galilean BODY_SCALE 하향 (300 → 200, moon 정합)

- **변경**: `BODY_SCALE.{io,europa,ganymede,callisto}` 300 → 200 (moon 동일값). galilean/jupiter 비율 ~2/3 로 감소 (io 0.159 → 0.106 등).
- **장점**: moon Amendment 4 학습 (사실 비율 깨도 천문 직관 우선) 답습. 단일값 mental model (moon=galilean=200).
- **단점**: mesh px 하향 (io 3.87px → ~2.6px) → 4px fallback billboard 의존 심화. R6 ADR §축 2 (mesh visible ganymede 5.60px) 재산출 Amendment.
- **회귀 예측**: galilean mesh 더 작아져 fallback 의존. jupiter 대비 비율 0.09~0.15 (moon/earth 0.068 의 1.3~2.2배).

#### 옵션 (E) galilean scale 유지 + jupiter scale 추가 상향 (상대 비율만 조정)

- **변경**: jupiter BODY_SCALE 48 → 상향 (예: 60). galilean/jupiter 비율 감소시키되 galilean mesh px 유지.
- **장점**: galilean mesh 가시성 유지 (fallback 의존 안 늘림).
- **단점**: R6 PM Q2=B 임계 (jupiter sun 대비 ~10%) 위반. jupiter px 비 9.87% → 상향 시 임계 초과 → PM 재합의 필요. ORBIT_VISUAL_SCALE jupiter=16 재산출 (jupiter mesh 확대 → io binding 재계산).
- **회귀 예측**: PM Q2=B 천장 재협상. 결합 영향 (jupiter scale ↑ → orbit visual scale ↑) 큼.

#### 축별 비교 매트릭스 (보고 1)

| 축 | (D) galilean 하향 | (E) jupiter 상향 |
|---|---|---|
| 사용자 "과대" 해소 | ✅ 직접 | ✅ 상대 |
| galilean mesh 가시성 | △ fallback 의존 심화 | ✅ 유지 |
| PM Q2=B 임계 충돌 | ❌ 없음 | ⚠️ 위반 (재합의) |
| 결합 영향 | 낮음 (galilean 독립) | **높음** (orbit scale 동반) |
| ADR Amendment | R6 §축 2 | R6 §축 1+2+4 + PM 재합의 |

### 권장 안 (사전 선호 — 사용자/cross-validate 결정 전 안내)

- **보고 2 (궤도선)**: **옵션 (A) 강력 권장**. moon 패턴 (R4 검증됨) 의 정확한 일반화 — 일관성/확장성/저위험 모두 우위. (B) 는 scaling 전파/floating origin 결합 위험, (C) 는 R6 교육 가치 후퇴. **본 결함의 근본 fix 는 R5 에서 "박제만 하고 구현 누락" 한 satellite orbit visual scale 일반화** 이므로 (A) 가 ADR 의도 복원.
- **보고 1 (비율)**: **옵션 (D) 약권장** (galilean 300 → 200). moon Amendment 4 정책 답습 + 결합 영향 최소 + Q2=B 임계 불변. fallback 의존은 LOD Phase 2 (#391) 가 별도 처리. (E) 는 PM 재합의 + 결합 위험으로 비권장.
- **결합 주의**: (A) 적용 시 satellite 궤도선이 parent 옆 + visual scale 16/500/30 적용으로 mesh 와 정합 — 이 상태에서 galilean 이 여전히 과대하면 (D) 추가. 즉 **(A) 먼저 → 재측정 → (D) 판단** 순서 권장 (보고 1 일부가 보고 2 의 "잘못된 위치로 인한 착시" 일 가능성 배제).

---

## §4 Concrete Prediction (사전 박제)

### 예측 1 — 코드 변경 라인 수

- 옵션 (A) 채택 시: **~40~60 라인** (`rebuildOrbitLines` satellite Map 분리 + updateAt position 동기화 루프 일반화 + setOrbitLinesVisible 확장). moon 전용 코드를 satellite Map 으로 일반화하므로 순증 < 신규 작성.
- 옵션 (D) 채택 시: **4 라인** (`BODY_SCALE` 4개 값 300 → 200).
- 위반 임계: 옵션 A 실측 라인 수가 100 초과 시 → moon 패턴 일반화 가정 재검토 (B 재고).

### 예측 2 — 수치 DoD (fix 후 실측)

- **D-627-1** (보고 2): satellite 궤도선 LineSystem worldCenter 가 parent mesh scene 좌표의 ±0.2 unit 이내 (모든 satellite). 현 측정 io 궤도 worldCenter ≈ 원점 → fix 후 ≈ jupiter scene 좌표 (~62 unit).
- **D-627-2** (보고 2): satellite 궤도선 visual scale 적용 — io 궤도 반경 (visual) 이 io distToParent (0.566 unit) 와 동일 order. 즉 궤도선과 mesh 가 같은 ellipse 위.
- **D-627-3** (보고 1, D 채택 시): galilean/jupiter world radius 비율 ≤ 0.16 (현 ganymede 0.230 → ~0.153).
- 위반 임계: D-627-1 fail (궤도선 여전히 원점) → 옵션 재선택.

### 예측 3 — 인접 영역 무영향 (보조)

- planet 궤도선 (sun 중심 batch) worldExtendSize 변화 없음 (±5%).
- moon 궤도선 (기존 동작) 무변경 — earth focus 강조 (R4 결정 4) 보존.
- mesh px 비율 (R6 §축 2) — 옵션 A 단독 적용 시 무변경 (mesh 경로 미수정).

---

## §5 결정 (사용자/cross-validate 선택 후 박제)

> **Accepted** (사용자 옵션 선택 2026-06-06 + cross-validate 2026-06-06 agy outcome=applied 통합).

- **채택 옵션**: (보고 2 satellite 궤도) = **(A) parent별 moon 패턴 일반화** / (보고 1 galilean 비율) = **(A) 궤도 fix 적용 후 재측정 → 필요 시 (D) BODY_SCALE 300→200**. 사용자 합의 2026-06-06 + cross-validate agy 지지.
- **근거**: 옵션 A 는 R4 검증된 moon 패턴 정확 일반화 (저위험 + R7+ titan/saturn moons 자동 확장). 옵션 B(parenting) 는 parent BODY_SCALE scaling 누적 전파 + Floating Origin 결합 위험으로 기각. 옵션 C(비표시) 는 R6 교육 가치 후퇴 + R4 moon 강조 충돌로 기각.

### 구현 절차 (옵션 A 채택 가정 — 사용자 확정 후 developer 단계)

1. `rebuildOrbitLines`: satellite (parentId ≠ null) 를 parent 별 `Map<string, LineSystem>` 으로 분리. moon 도 이 Map 으로 통합 (특수 케이스 제거) — 단 moon 색상 강조 (결정 4) 는 별도 색상 룩업 유지.
2. 각 satellite 궤도 LineSystem 에 `getOrbitVisualScale(parentId)` scaling 적용.
3. updateAt 루프의 moon 전용 position 동기화를 satellite Map 순회로 일반화 (parent scene 좌표).
4. `setOrbitLinesVisible` / `setMoonOrbitHighlight` 를 satellite Map 대응 확장.
5. (보고 1) 재측정 후 galilean BODY_SCALE 하향 (D) 판단.

### Fix 후 박제 의무

- 본 ADR §결정 갱신 (Accepted 전이 완료) + §교차검증 반영 사항 (아래).
- **R5 ADR §결정 4 Amendment** — "MARS_SATELLITES_ORBIT_VISUAL_SCALE 박제했으나 satellite orbit-line 구현은 moon 만 → #627 fix 에서 일반화" 정정.
- **R6 ADR §축 2 Amendment** (보고 1 D 채택 시) — galilean BODY_SCALE 재산출.
- `orbit-visual-scale.ts` §적용 위치 주석 갱신 ("모든 satellite orbit LineSystem").
- **회귀 가드 승격** — `apps/web/scripts/browser-verify-627-satellite-orbit.mjs`: 각 satellite 궤도선 worldCenter 가 parent scene 좌표의 ±0.2 unit 이내 정적 가드 + **원점(0,0,0) 1 unit 이내 비정상 밀집 통계 테스트** (cross-validate agy 고유 발견 #3 — 실측 vertex 54% 원점 밀집 현상 직접 감지). (DoD PASS ≠ 제품 동작 재발 차단, volt #74).
- `docs/reports/627-fix-output.json` + before/after 스크린샷.

---

## §교차검증 반영 사항 (cross-validate 2026-06-06 agy outcome=applied)

agy 가 옵션 A+D 조합을 지지 (구조적 완성도 / 기술 타당성 / 확장성 우수 평가). 4축 분류:

- **합의 (3)**: ① 옵션 A(moon 패턴 일반화) — B(parenting) 의 scaling 누적 전파 + Floating Origin 결합 위험 회피, R4 검증 패턴 안전 ② 옵션 D(BODY_SCALE 하향) — E(jupiter 상향) 의 시스템 연쇄 + PM 임계 위반 위험 회피, 영향 국소 ③ 결합 해결 순서 (A 적용 → 재측정 → 필요시 D) 의 visual 착시 제거 선행이 우수.
- **고유 발견 수용 (3, 구현 단계 반영 의무)**: ① **다중 LineSystem dispose 라이프사이클** — 기존 `moonOrbitLine` 단일 dispose 를 `Map<string, LineSystem>` 전체 순회 안전 dispose 로 확장 (메모리 누수 차단). §구현 절차 1단계 + disposables 에 명시. ② **`getOrbitVisualScale(parentId)` fallback 계약** — parentId null / 미매핑 시 기본 1.0 fallback (예외 안정성). ③ **회귀 가드 원점 밀집 통계 테스트** — worldCenter ±0.2 외에 "원점 1 unit 이내 비정상 밀집" 감지 (위 회귀 가드 승격에 반영).
- **이견 (0)**: 없음 (구조 결정 합의).
- **고유 발견 후속 분리 (1)**: 수십 위성 시나리오 시 `updateAt` 프레임별 순회 / draw call 임계 가이드라인 — R7+ titan/saturn moons 다수 진입 시 성능 검토 (현재 13 body 무관, 별도 검토). Claude 편향 셀프 체크: 옵션 A 의 updateAt 순회 비용은 현재 satellite 6개(moon/phobos/deimos/galilean 4 — 잠깐, galilean 4 + phobos/deimos + moon = 7) 수준이라 무시 가능, R7+ 에서 재평가.

---

## §6 위험 / 재검토 트리거

| 위험 | 회귀 시점 | 임계 / 발동 조건 | 완화 방안 |
|---|---|---|---|
| satellite 궤도선 회귀 재잠복 (다음 R-Phase) | R7 (titan/saturn) 진입 | 신규 satellite 궤도선 worldCenter ≠ parent | `browser-verify-627-satellite-orbit.mjs` 회귀 가드 (모든 satellite 자동 검사) |
| 옵션 A draw call 증가 | fix 머지 직후 | LineSystem 개수 × satellite parent 수 | parent 3개 (earth/mars/jupiter) 수준 — #77 최적화 대비 미미. fps DoD 재측정 |
| galilean fallback 의존 심화 (옵션 D) | D 채택 시 | io mesh px < 4 | LOD Phase 2 (#391) billboard fallback 가 흡수 |
| 궤도선 visual scale ↔ mesh visual scale drift | Amendment 시 | 두 경로 scale 불일치 | 단일 SSoT `getOrbitVisualScale` 양쪽 호출 (mesh: resolveWorld / line: rebuildOrbitLines) |

### 재검토 트리거

1. fix 후 D-627-1 / D-627-2 위반 (궤도선 여전히 원점 또는 scale 불일치).
2. 옵션 A 라인 수 예측 (§4 예측 1) ±50% 초과 → moon 패턴 일반화 가정 재검토.
3. 사용자 D-T2 에서 (A) 적용 후 galilean 여전히 과대 → (D) 발동.
4. R7+ 진입 시 satellite 궤도선 자동 확장 실패 → 일반화 미흡 재검토.

---

## §7 Amendment 라운드 N (라운드별 추가)

### Amendment 1 (2026-06-06) — 옵션 A+D fix 구현 완료 + 재측정 실측 박제

- **상태**: Accepted (developer fix 구현 + dev 재측정 + 회귀 가드 신설 완료)
- **구현 (옵션 A — moon 패턴 일반화)**:
  - `rebuildOrbitLines` (`solar-system-scene.ts`): satellite (parentId !== 'sun') 를 parent 별 `Map<string, LineSystem>` (`satelliteOrbitLines`) 로 분리. `isSatelliteOrbit(parentId)` 분류 SSoT (단위 테스트 가드). 분류 정책 = parentId 가 null/'sun' 이 아니면 satellite.
  - `getOrbitVisualScale(parentId)` scaling 적용 (earth=30 / mars=500 / jupiter=16). `updateAt` 루프가 각 LineSystem position 을 parent scene 좌표로 매 프레임 동기화 (moon 전용 → satellite Map 순회 일반화).
  - moon 특수 케이스 제거 — moon 은 `satelliteOrbitLines.get('earth')`. 색상 강조 (#552 `setMoonOrbitHighlight`) 만 earth 별도 룩업 유지.
  - **agy 보강 ① (dispose 라이프사이클)**: `disposeSatelliteOrbitLines` (Map 전체 순회 안전 dispose) 를 rebuildOrbitLines 재호출 + scene dispose 둘 다에서 호출 (LineSystem 누수 차단).
  - **agy 보강 ② (fallback 계약)**: `DEFAULT_ORBIT_VISUAL_SCALE=1.0` export + `getOrbitVisualScale` null/undefined/미매핑 시 1.0 보장 (단위 테스트 가드).
- **재측정 실측 (2026-06-06, 1280×720, dev — D-627 검증)**:

| satellite parent | scaling | worldCenter ↔ parent (D-627-1) | distToOrigin |
|---|---|---|---|
| earth (moon) | 30 | **0.053 unit** ✅ ≤ 0.2 | 12.31 |
| mars (phobos/deimos) | 500 | **0.0003 unit** ✅ ≤ 0.2 | 17.50 |
| jupiter (galilean 4) | 16 | **0.019 unit** ✅ ≤ 0.2 | 62.41 |

  - planet `orbit-lines` 원점 1 unit 이내 vertex: **0.0% (0/325)** ← 결함기 54% (390/715). agy 보강 ③ 통계 테스트 PASS.
- **옵션 D 발동 (보고 1)**: 옵션 A 적용 후 galilean 재측정 — ganymede/jupiter **0.230** (여전히 moon/earth 0.068 의 3.4배 과대) → galilean `BODY_SCALE` 300 → 200 적용. 재측정: ganymede 0.230 → **0.1535** (D-627-3 ≤ 0.16 충족, binding constraint). io 0.106 / europa 0.091 / callisto 0.140. R6 ADR §Amendment 2 박제.
- **회귀 가드**: `apps/web/scripts/browser-verify-627-satellite-orbit.mjs` (verify:627-satellite-orbit) — 2축 (A worldCenter ±0.2 / B 원점 밀집 0) + CI `detect-and-test` 통합 (port 3005). 단위 테스트 `packages/core/src/scene/satellite-orbit-structure.test.ts` (isSatelliteOrbit 분류 11 케이스 + getOrbitVisualScale fallback).
- **D-T2 실 Chrome 육안**: 사용자 위임 (headless ≠ 실 브라우저, volt #77). PR #627 본문 명시.
- **코드 변경 라인 수 (§4 예측 1 대조)**: 예측 ~40~60 라인 (옵션 A) + 4 라인 (옵션 D). 실측 옵션 A 핵심 변경 ~70 라인 (분류 helper + dispose helper + Map 일반화 — 예측 상한 근방, 100 미만 임계 통과) + 옵션 D 4 라인. 예측 정합.

---

## §8 후속 / 분리 이슈

- **카메라 free-fly 고정 (R6 무관)** — `focusOn` 의 `lowerRadiusLimit` 동적 완화 (camera-controller.ts:150-152) 가 free-fly 진입 (`detachToFreeFly` clearFollow only, sim-canvas.tsx:408-411) 시 원복 안 되어 satellite focus 후 자유 이동 제약 인지. **develop (R5) 재현 확정** (git diff 0) → R6 차단 사유 아님. **별도 이슈 분리 완료** ([#629](https://github.com/coseo12/astro-simulator/issues/629), priority:medium, 2026-06-06). 출발점: `clearFollow` 에 lowerRadiusLimit 원복 또는 free-fly 진입 시 tier-transition 의 `computeLowerRadiusLimit` 재적용.
- **satellite orbit visual scale 잔여 gap** — 기존 [#622](https://github.com/coseo12/astro-simulator/issues/622) (satellite orbit visual scale 잔여 1.74배 gap forensic) 와 본 결함 연관. #622 는 visual scale **값** gap, 본 ADR 은 visual scale **적용 자체 누락** — 본 fix (옵션 A) 가 #622 의 전제 (satellite 궤도선이 실제로 visual scale 적용됨) 를 충족시킨 후 #622 재측정 권고. Builds on: #627.

---

## 변경 이력

- 2026-06-06: 초안 작성 (architect, #627 R6 D-T2 forensic). Provisional — satellite 궤도선 parent 미추적 + visual scale 미적용 (R5 도입 잠복, R6 galilean 표면화) 실측 확정 + 옵션 A/B/C (궤도선) + D/E (비율) 비교. 카메라 R6 무관 별도 이슈 권고.
