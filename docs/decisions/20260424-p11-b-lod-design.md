# ADR: P11-B LOD 3단 + 거리 하이브리드 임계 설계

- **상태**: Accepted
- **날짜**: 2026-04-24
- **결정자**: architect (P11-B #289 재계약)
- **관련**: #289 (본 Phase), #288 (P11-A Floating Origin 선행), #298 (P12 Scale Tier 완결), #310 (네이밍 정책 선행), #247 (Osculating 관찰 대상), #290 (P11-C Tier Preset 후행), ADR `20260424-tier-naming-policy.md` (심볼 SSoT), ADR `20260423-display-relative-scale-unification.md` (Scale Tier Concrete Prediction 1 대응), ADR `20260422-floating-origin.md` (T3 focus body 정합), ADR `20260419-satellite-orbit-hybrid.md` (Concrete Prediction 패턴 원형), 원칙 `docs/principles/fact-first.md`
- **교훈 적용**: "신규 함수 ≠ 신규 구현" (기존 자산 재사용 조사), "신규 데이터 ≠ 신규 코드 — ADR 예측 재현" (body-kind 보정 상수 데이터화), "주석 계약 vs 구현 drift" (LOD 분기 카테고리 drift 방어), "headless 브라우저 검증 ≠ 실 브라우저" (screenshot diff 3단계 검증), "sub-agent 검증 완료 ≠ GitHub 박제 완료" (draw call 수 dev overlay 박제)

---

## 배경

v0.12.0 (P12-A/B/C 완결) 머지 후 Scale Tier 는 **카메라 거리 기반 3단 scene scale** 을 담당한다. 그러나 Scale Tier 만으로는 같은 tier 내부에서 **body 별 apparent size 편차** 를 흡수하지 못한다:

- T1 solar 뷰: 지구·화성·소행성 등 모든 행성이 sub-pixel ~ 2px 수준으로 모인다. 렌더는 `mesh.scaling=1` 실측 유지이므로 GPU 가 full sphere (32 segments) 를 sub-pixel 로 그리는 낭비 발생 → idle bench 에서 불필요한 draw call 폭주
- T3 body 뷰: focus body 는 화면 40% 차지, 배경 body (태양·다른 행성) 는 수 AU ~ 수십 AU 떨어져 sub-pixel. 배경 body 를 full mesh 로 유지하면 focus body 의 fine mesh 와 draw call 경쟁
- 소행성벨트 (약 100+ body): 어느 tier 에서도 sub-pixel 이어서 full sphere 는 항상 낭비

**LOD (Level Of Detail) 3단 분기 목적**: body 당 화면 점유 픽셀과 body 타입을 기준으로 **렌더 비용 다운그레이드 결정** 을 `mesh.scaling=1` 실측 계약을 깨지 않고 분리된 레이어에서 처리한다. Scale Tier 와 직교 — Scale Tier 는 "scene 에 얼마나 크게 박을까", LOD 는 "이 mesh 를 얼마나 섬세하게 렌더할까".

### 재계약 배경 (v0.12.0 이후)

이슈 #289 초안에는 원래 **Distance Scale 3 모드 (`log`/`linear`/`uniform`)** 가 포함됐으나, P12 단일 모드 전환 (ADR `20260423-display-relative-scale-unification.md`) 직후 재계약에서 **전면 폐기**되었다 (2026-04-24). `uniform-distance` 는 P12 ADR §5원칙 §1 (상대 비율 = 실측 고정) 위배, `log-distance` 는 Scale Tier 동적 scaling 과 책임 중복이 명확.

본 ADR 은 **LOD 3단 + 거리 하이브리드 임계** 에만 집중. Distance Scale 모드는 ADR 상 **폐기 결정으로 박제** 하여 재발굴 차단.

### 기존 자산 재사용 조사 (CLAUDE.md "신규 함수 ≠ 신규 구현")

| 자산                                                                                                    | 위치                                                                                                  | 본 설계 처리                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Tier` / `renderScaleForTier` / `resolveCurrentTier`                                                    | `packages/core/src/scene/tier.ts`                                                                     | **읽기 전용 의존** — LOD 는 `activeTier` 를 참조하되 `setTier`/`Tier` 확장 금지 (Scale Tier ADR Prediction 1 계약)                                                         |
| `FloatingOrigin`                                                                                        | `packages/core/src/coords/floating-origin.ts`                                                         | **읽기 전용 의존** — LOD 계산 이전에 이미 `fo.toLocal` 이 적용된 mesh.position 기반으로 동작, 투명                                                                         |
| `CelestialBody.kind` (`'star' \| 'planet' \| 'dwarf-planet' \| 'moon' \| 'asteroid' \| 'comet' \| ...`) | `packages/core/src/ephemeris/solar-system-loader.ts:50`                                               | **읽기 전용 의존** — body 타입별 최소 거리 보정의 입력. zod enum 재활용                                                                                                    |
| `createBodyMesh`                                                                                        | `packages/core/src/scene/solar-system-scene.ts`                                                       | **확장** — mesh 생성 시 high/mid/low 3가지 geometry variant 동시 prep 또는 mid/low 를 lazy create. §§§결정 축 4 참조                                                       |
| `parseIntegratorKind` (URL parser 패턴)                                                                 | `apps/web/src/core/parse-integrator.ts`                                                               | **패턴 재사용** — `parseLodLevel` 을 동일 구조로 신설 (공식값/fallback/console.warn)                                                                                       |
| `UrlSync` 컴포넌트                                                                                      | `apps/web/src/core/url-sync.tsx`                                                                      | **확장** — `?lod=` 초기 1회 → sendCommand (Zustand 쓰기 없음, LOD 는 scene 내부 상태 — §§§결정 축 5 참조)                                                                  |
| `updateAt` 의 mesh.position 할당 루프 (`mesh.position.set`)                                             | `packages/core/src/scene/solar-system-scene.ts` (`updateAt` 내부, 현재 `mesh.position.set` 호출 지점) | **확장** — `renderScaleForTier` 곱하기 **직전** 에 LOD 분기 결과로 mesh visibility/variant 스왑 (라인 번호는 구현 시점 기준으로 이동 가능하므로 함수명/loop 설명으로 참조) |
| `hud-corners.tsx` 우하단                                                                                | `apps/web/src/components/layout/hud-corners.tsx`                                                      | **참고** — draw call 수 dev overlay 추가 위치 (기존 "정확도 · T1 관측" 영역 아래 또는 좌하단 신설)                                                                         |

**신규 구현**: `packages/core/src/render/lod.ts` (순수 계산 함수 + 타입) — ADR `20260424-tier-naming-policy.md` §1 SSoT 규약으로 이미 경로 박제됨.

### 네이밍 정책 ADR Prediction 1 의 대응 계약

선행 ADR `20260424-tier-naming-policy.md` §"Concrete Prediction" **Prediction 1** (line 207~211) 에 이미 박제된 예측:

> **Prediction 1**: #289 P11-B 에서 `packages/core/src/render/lod.ts` (신규) + `sim-canvas.tsx` LOD 통합만으로 Distance-based mesh swap 이 동작해야 한다. `packages/core/src/scene/tier.ts` / `solar-system-scene.ts` / `tier-transition.ts` 의 **코드 라인 변화 0**.

본 ADR 설계 단계에서 `solar-system-scene.ts` 0 라인 예측이 구조적으로 재현 불가능함이 확인됐다 — `createBodyMesh` 가 mesh 객체의 유일한 owner 이고 LOD 는 geometry variant 스왑이 필요하므로 scene API 확장 없이 외부 주입이 불가능하다. 이에 선행 ADR 에 **Amendment (2026-04-24)** 박제로 예외 허용을 정식화했다:

선행 ADR `20260424-tier-naming-policy.md` §Prediction 1 Amendment (2026-04-24) 참조.

**상대편 계약 (본 ADR)**:

- `solar-system-scene.ts` **확장은 허용** — LOD 분기 hook 추가 용도에 한함 (선행 ADR Amendment 계약 준수)
- **금지 조건** (변경 금지 유지):
  - `mesh.position` 좌표 수식 / `renderScaleForTier` 적용 지점
  - `Tier` 상수 / `activeTier` 의미 변경
  - `FloatingOrigin` 상호작용 (`fo.toLocal` / `fo.update` / `fo.reset`)
  - `setTier` 의 origin 갱신 로직
- `tier.ts` / `tier-transition.ts` 는 **계속 0 라인** 유지 — 자동 수치 재현 검증 (§결과·재검토 조건 참조)
- Scale Tier 관점에서는 "Prediction 1 부분 성공" = `tier.ts` + `tier-transition.ts` diff = 0 재현 + `solar-system-scene.ts` 수기 리뷰로 금지 조건 위배 0 확인

**선례**: P12 ADR `20260423-display-relative-scale-unification.md` §Amendments (2026-04-23 Q10 재평가 + QA 회귀 수정, line 379) 에서도 동일 파일에 `activeTier === 'body'` 분기 3지점을 추가하며 "코드 변경 0" 을 부분 수정한 전례가 있다.

---

## 후보 비교 — 5축

### 축 1. 픽셀 점유 계산 방식

DoD #2 "거리 하이브리드 임계 — 픽셀 점유 ≥ 8px" 의 구체 계산법.

| 후보                                                                   | 정확도                                                                     | 성능 (매 프레임 per-body)       | 구현 복잡도                                                                                   | 비고                                                            |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **A. Projected screen bounding sphere radius (MVP 기반)**              | ⭐ body 중심 + radius 를 model-view-projection 으로 투영, NDC → pixel 환산 | ⭐ 행렬 곱 1회 + divide-by-w    | ⭐ Babylon camera API (`getViewMatrix` / `getProjectionMatrix`) 활용, N=태양계 ~100 기준 O(N) | **선택**                                                        |
| B. Projected mesh AABB (축 정렬 바운딩 박스 8 corner projection)       | ⭐ 비구형 body (고리·혜성) 포함                                            | ✗ 8 corner projection 매 프레임 | △ Babylon `mesh.getBoundingInfo()`                                                            | 현재 body 는 대부분 구형 — 과도한 정확도, 고리/혜성은 별도 처리 |
| C. Distance-only heuristic (`pixel ≈ radius × focalLength / distance`) | △ orthographic 카메라 가정 — perspective 시 viewport edge 에서 오차        | ⭐ subtract + divide            | ⭐ 행렬 접근 불필요                                                                           | 해왕성 원일점처럼 viewport edge 에 걸리면 편차 큼               |

**선택: 후보 A (Projected screen bounding sphere radius)**.

**구현 공식** (순수 함수, `packages/core/src/render/lod.ts` 에 박제):

```ts
/** 화면 공간 bounding sphere 반지름 (pixel). */
export function screenCoverageRadius(
  bodyLocalPos: Vec3Double, // fo.toLocal 된 scene 좌표 (scene unit)
  bodyRadiusMeters: number, // 실측 반경
  renderScale: number, // renderScaleForTier(activeTier)
  viewProjMatrix: Float32Array, // camera.getTransformationMatrix()
  viewportWidth: number,
  viewportHeight: number,
): number {
  // 1. body 중심을 clip-space 로 투영
  const clipCenter = mulMat4Vec3(viewProjMatrix, bodyLocalPos);
  // 2. clip-space 에서 body 반지름만큼 떨어진 surface point 도 투영 — perspective 발산 흡수
  //    (edge 점은 카메라 up vector 방향으로 offset — 정확하지 않지만 충분히 근사)
  const offsetPos = addVec3(
    bodyLocalPos,
    scaleVec3(CAMERA_UP_APPROX, bodyRadiusMeters * renderScale),
  );
  const clipEdge = mulMat4Vec3(viewProjMatrix, offsetPos);
  // 3. clip → NDC → pixel. w 로 나누기 (perspective divide)
  const ndcCenterY = clipCenter.y / clipCenter.w;
  const ndcEdgeY = clipEdge.y / clipEdge.w;
  // 4. NDC (-1~1) → viewport pixel
  return Math.abs((ndcEdgeY - ndcCenterY) * viewportHeight * 0.5);
}
```

**암묵 전제**:

- CAMERA_UP_APPROX 는 현 프레임 카메라 up vector — 매 프레임 갱신 (`scene.activeCamera.upVector` 복제). 엄밀히는 camera-facing vector 가 필요하나, edge point 는 radius 길이만 벗어나면 되므로 up 이나 right 둘 중 하나로 충분 (body 가 구형이라 방향 대칭)
- body 가 카메라 뒤 (clip w < 0) 이면 culling — `lodLevel='low'` 로 강제 fallback (billboard 도 뒤면 invisible 처리)
- sub-pixel body (< 1px) 는 `low` 강제 — 초기 floor 로 billboard 렌더 건너뜀 여부까지 `lodFromScreenCoverage` 함수가 분기

근거:

- A 는 Babylon 내부에서도 `BoundingInfo.frustumCullingStrategy` 에서 동일 접근 — Three.js `Frustum.intersectsSphere` 와 같은 계열로 검증된 안정적 공식
- B 는 고리/혜성 tail 처리 시 재검토. 단, 고리는 parent mesh (행성) 의 LOD 에 따라갈 수 있어 본 Phase 에서는 parent LOD `high` 면 rings 도 shader, `low` 면 rings 비표시 (P11-B 범위 내 간단 규칙)
- C 는 구현 간단하나 해왕성 focus 모드에서 viewport edge 에 다른 body 가 걸릴 경우 2배 이상 오차 발생 가능 — 5축 테스트 matrix 에서 fail 예상

### 축 2. Body 타입별 최소 거리 보정 상수

DoD #2 "body 타입별 최소 거리 보정" 의 구체 값. 재계약 DoD 초안값 + 실측 근거.

| Kind                                                | 보정 규칙 (high 강제 조건)           | 초안값 (재계약)      | 조정 여부 | 근거                                                                                                                                |
| --------------------------------------------------- | ------------------------------------ | -------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `star` (태양)                                       | 카메라가 태양으로부터 `< 1 AU`       | 1 AU                 | **유지**  | 태양 광원 디테일 (corona/flare 후속) 는 1 AU 내에서만 인식 가능. 더 멀면 low billboard 로 충분 (교환 가능한 광원 점)                |
| `planet` (가스 거인: jupiter/saturn/uranus/neptune) | `< 10 × body.radius`                 | 10 R_body            | **유지**  | 고리/대적점/벨트 패턴은 body 반경 10배 내에서 시각 감지. 예: 목성 R=7.15e7 m → 10 R ≈ 7.15e8 m ≈ 0.0048 AU                          |
| `planet` (지구형: mercury/venus/earth/mars)         | `< 5 × body.radius`                  | 5 R_body             | **유지**  | 대륙/극관 디테일은 반경 5배 내 인식. 예: 지구 R=6.37e6 m → 5 R ≈ 3.19e7 m ≈ 2e-4 AU                                                 |
| `moon`                                              | `< 5 × body.radius`                  | **초안 누락 → 신설** | **신설**  | 갈릴레이 위성 / 달 표면 관찰 의도. 지구형과 동일 규칙                                                                               |
| `dwarf-planet`                                      | `< 5 × body.radius`                  | **초안 누락 → 신설** | **신설**  | 명왕성/세레스 focus 시 지구형과 동일                                                                                                |
| `comet`                                             | `< 3 × body.radius`                  | **초안 누락 → 신설** | **신설**  | 혜성 mesh 는 대부분 dust tail 과 coma 가 별도 파티클. body 자체는 작음                                                              |
| `asteroid`                                          | `< 0.01 AU` (거리 기반, radius 무관) | 0.01 AU              | **유지**  | 소행성은 `body.radius` 가 너무 작아 `5 R_body` 로는 수 m 내로 제한됨 → 사용자 focus 가 어려움. 0.01 AU (150만 km) 는 실측 접근 한계 |
| `spacecraft`                                        | `< 0.01 AU`                          | **초안 누락 → 신설** | **신설**  | 우주선 (파이오니어/보이저 등) 은 asteroid 와 유사 취급                                                                              |
| `black-hole` / `nebula` / `galaxy` / `star-cluster` | 카메라 거리 무관 — 항상 `high`       | **초안 누락 → 신설** | **신설**  | P5 블랙홀 shader + 후속 은하 렌더는 전용 shader 경로를 가짐. LOD 분기로 mid/low 강등 시 물리 시뮬 효과 (렌즈 왜곡) 누락 발생        |

**최종 보정 상수 형식** (JSON 데이터 또는 TS const 선택, §§§결정에서 확정):

```ts
// packages/core/src/render/lod-body-thresholds.ts
export const LOD_BODY_THRESHOLDS: Record<BodyKind, BodyLodThreshold> = {
  star: { mode: 'absolute-distance', highMaxDistanceMeters: AU },
  'planet-giant': { mode: 'radius-multiple', highMaxRadiusFactor: 10 },
  'planet-terrestrial': { mode: 'radius-multiple', highMaxRadiusFactor: 5 },
  moon: { mode: 'radius-multiple', highMaxRadiusFactor: 5 },
  'dwarf-planet': { mode: 'radius-multiple', highMaxRadiusFactor: 5 },
  comet: { mode: 'radius-multiple', highMaxRadiusFactor: 3 },
  asteroid: { mode: 'absolute-distance', highMaxDistanceMeters: 0.01 * AU },
  spacecraft: { mode: 'absolute-distance', highMaxDistanceMeters: 0.01 * AU },
  'black-hole': { mode: 'always-high' },
  nebula: { mode: 'always-high' },
  galaxy: { mode: 'always-high' },
  'star-cluster': { mode: 'always-high' },
};
```

**주의**: `planet-giant` vs `planet-terrestrial` 구분은 **`CelestialBody.kind` 에는 없음** (kind 는 `'planet'` 단일). 구현 시 별도 헬퍼:

```ts
function classifyPlanet(body: CelestialBody): 'planet-giant' | 'planet-terrestrial' {
  // 가스 거인은 질량 10^26 kg 이상 (천왕성 8.68e25 ~ 목성 1.90e27). 경계 5e25 kg 여유.
  return body.mass > 5e25 ? 'planet-giant' : 'planet-terrestrial';
}
```

근거:

- `body.kind` 의 zod enum 을 바꾸면 solar-system.json 전체 재작성 + P2 이후 회귀 — 범위 밖. 대신 `body.mass` 기반 **파생 분류** 만 LOD 레이어에서 수행
- 태양은 `kind: 'star'` 라 분기 무관

### 축 3. alpha blend 전략 (pop-in 최소화)

DoD #3 "LOD alpha blend pop-in 최소화 — high↔mid 전환 시 단일 프레임 픽셀 diff < 15%".

| 후보                                                                   | 복잡도                                                        | 프레임 diff       | 카메라 입력 간섭                                                              | 비고                                                                   |
| ---------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| A. 즉시 swap (0ms 전환)                                                | ⭐                                                            | ✗ ~30-50% 예상    | 없음                                                                          | DoD 15% 미달 예상                                                      |
| B. Single-frame cross-fade (다음 프레임에 old+new 동시 렌더 alpha=0.5) | △ Babylon material alpha 순간 조작                            | △ ~20%            | 없음                                                                          | 개념은 단순하나 두 mesh 동시 존재 상태를 1 프레임 안에 cleanup 해야 함 |
| **C. Short duration cross-fade (200ms)**                               | △ Babylon `Animation` API 또는 프레임 tick 기반 linear interp | ⭐ <15% 보장 가능 | 없음 (scene 레벨 입력 잠금 불필요, mesh 수준 alpha 만)                        | **선택**                                                               |
| D. 긴 cross-fade (500ms+)                                              | △                                                             | ⭐                | △ Scale Tier transition (#298 Phase B 300ms + 100ms tail) 과 겹칠 때 FPS 영향 | 과도 — 200ms 로 충분 예상                                              |

**선택: 후보 C (200ms cross-fade)**.

**구현 원리**:

- mesh 마다 **2개 variant** (high + mid 또는 mid + low 2개만 동시 로드 — low 는 billboard sprite) 를 lazy-create
- 전환 시작 프레임: `oldVariant.material.alpha = 1.0 → 0.0` animation, `newVariant.material.alpha = 0.0 → 1.0` animation, both 200ms linear
- 종료 프레임: `oldVariant.setEnabled(false)` 로 GPU submission 제거 (draw call 수 복원)
- **Scale Tier transition 과의 겹침 방지**: Scale Tier transition 이 진행 중 (`tier-transition.ts` 내부 상태 `inTransition=true`) 이면 LOD 전환을 tier transition 종료 후로 defer. mesh.scaling 이 interp 중인 동안 alpha blend 를 추가하면 pop-in 측정이 불가능해진다 (혼입 효과)

근거:

- A 는 가장 단순하지만 DoD 15% 미달 예상 — 실측으로만 확인 가능. 200ms 는 Scale Tier Phase B 300ms 와 유사 리듬으로 UX 일관성
- D 는 과도 — LOD 는 body 수준 이벤트라 일반 사용자가 "LOD 전환이 일어났다" 는 인지조차 필요 없음. 200ms 로 '부드럽다' 는 암묵적 정도가 충분
- B (single-frame) 는 headless 검증에서 pop-in 측정 어려움 (1 프레임 = 16ms, screenshot 타이밍 불안정). 200ms 면 중간 프레임 캡처 가능해 회귀 가드 검증 용이 (volt #33 headless false positive 방어)

### 축 4. LOD mesh 자산 전략

> **성격**: 축 1 (픽셀 점유 분기) + 축 3 (alpha blend pop-in) 의 **지지 축**. DoD #1 (draw call ≥ 20% 차이) 와 #3 (pop-in diff < 15%) 의 실현 수단. 재계약 DoD 와 직접 1:1 매핑되지는 않으나, 축 1·3 의 수치 목표를 달성하려면 구체 geometry/material 전략이 고정되어야 하므로 별도 축으로 분리.

3 단계 mesh/billboard 구성.

| 단계       | geometry                                                                                     | material                                                       | 근거                                                                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`high`** | 기존 `createBodyMesh` 의 full sphere (Babylon `MeshBuilder.CreateSphere` segments=32) 재사용 | 기존 PBR/standard material                                     | 재사용 우선 — P12 회귀 0                                                                                                                                |
| **`mid`**  | **낮은 폴리곤 sphere (segments=12)** — lazy-create                                           | 기존 material 공유 (color/diffuse 만)                          | impostor (billboard+normal map) 는 P12 후속 PBR 과 복잡도 겹침 → 본 Phase 비-범위. low-poly sphere 가 확실한 draw call 절감 제공 (32² → 12² ≈ 85% 감소) |
| **`low`**  | **Babylon `PlaneBuilder` billboard** (`billboardMode = BILLBOARDMODE_ALL`)                   | `StandardMaterial` + body color hint (albedo 단색, alpha test) | mesh 1 quad = 2 triangle. 최대 절감. 태양계 100+ body 가 sub-pixel 로 모이는 T1 solar 뷰에서 draw call 절감 주효                                        |

**선택: 위 표 그대로**.

**구현 가이드**:

- `createBodyMesh` 를 `createBodyMeshHigh` 로 rename 없이 유지 (호출자 무변경) + 신규 `createBodyMeshMid(body, scene)` + `createBodyBillboard(body, scene)` 2개 helper 추가
- 3 variant 모두 동일 parent (`meshes.get(bodyId)` 는 high variant 로 유지 — tier-transition / Floating Origin 의 position 할당은 high variant 만 받음). mid / low variant 는 high 의 **자식 mesh (`parent = highMesh`)** 로 부착 → position 자동 따라감, LOD 레이어는 `setEnabled(true/false)` + alpha 만 조작
- **rings 처리**: high variant 가 `high` LOD 일 때만 rings 렌더, mid/low 로 내려가면 `ringHandles.visible=false`. P11-B 간단 규칙 (복잡한 ring LOD 는 후속)
- **billboard albedo**: body 의 `colorHint.hex` 또는 `colorHint.temperatureK` 기반 albedo 색상. 없으면 `kind` 별 기본색 (`planet` → 회색, `moon` → 밝은 회색 등)

근거:

- impostor (billboard + normal map projection) 는 NASA visualization 에서 효과적이나 normal map 자산이 P12 후속 (PBR) 과 겹침. 본 Phase 에서는 복잡도 대비 ROI 낮음
- low-poly sphere segments=12 는 실측 경계 — 8 미만은 육각기둥/팔각기둥 느낌이 육안 감지, 16 이상은 절감 미미 (8.4% 차이, P12-A 내부 bench 데이터 재이용)
- Babylon 의 `AbstractMesh.addLODLevel(distance, lowerDetailMesh)` API 는 동작 경험상 Scale Tier renderScale 변환과 상호작용 시 distance 계산이 scene unit 기준이라 tier 전환 시 오작동 가능성. 본 설계는 Babylon LOD API 를 사용하지 않고 **자체 분기** — Scale Tier 와 결합 비의존

### 축 5. URL parser 위치 + 값 검증 실패 경로

DoD #6 "URL 파라미터 값 검증" — `?lod=` 허용값 외 입력 시 무시 + dev 경고.

| 후보                                               | 위치                                                             | 기존 패턴 일치                                                                          | 비고     |
| -------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------- |
| **A. `apps/web/src/core/parse-lod-level.ts` 신설** | 기존 `parse-integrator.ts` / `parse-gr-mode.ts` 와 같은 디렉토리 | ⭐ 동일 구조 재사용                                                                     | **선택** |
| B. `packages/core/src/render/lod.ts` 내부 함수     | 구현과 같은 파일                                                 | △ URL 파싱은 web 레이어 책임 (Next.js 종속) — core 패키지가 URL API 를 알면 SSR 시 문제 | 기각     |
| C. `url-sync.tsx` 내 익명 IIFE                     | 기존 `?view=` 처리와 유사                                        | ✗ 테스트 분리 어려움, 재사용성 낮음                                                     | 기각     |

**선택: 후보 A**.

**parser 구조** (기존 `parseIntegratorKind` 패턴 그대로):

```ts
// apps/web/src/core/parse-lod-level.ts
import type { render } from '@astro-simulator/core';

type LodLevel = render.LodLevel;

const VALID_LOD_LEVELS: LodLevel[] = ['high', 'mid', 'low'];

export function parseLodLevel(urlParam: string | null | undefined): LodLevel | 'auto' {
  // 미지정 → 'auto' (거리 자동 판정)
  if (urlParam === null || urlParam === undefined || urlParam === '') {
    return 'auto';
  }
  const normalized = urlParam.toLowerCase();
  if (normalized === 'auto') {
    return 'auto';
  }
  if ((VALID_LOD_LEVELS as string[]).includes(normalized)) {
    return normalized as LodLevel;
  }
  // eslint-disable-next-line no-console
  console.warn(`[parse-lod-level] 알 수 없는 ?lod=${urlParam} — 'auto' 로 폴백`);
  return 'auto';
}
```

**차이점 (integrator 패턴 대비)**: LOD 는 body 별로 동적 전환되므로 URL 파라미터는 **per-scene override 모드** 성격 — `?lod=high` 는 "모든 body 를 high 강제" 개발/디버그 용도. `auto` 가 디폴트 실사용 경로.

**URL ↔ scene 연결**: `UrlSync` 컴포넌트에서 `?lod=` 를 읽어 `sendCommand({ type: 'setLodOverride', level: parsedLevel })` 로 전달. Zustand store 는 LOD 상태를 모름 (scene 내부) — `sim-context.tsx` 의 command stream 이 scene 에 전달. Scale Tier 와 유사.

**검증 테스트** (`lod-url-parser.test.ts`):

- `parseLodLevel(null)` → `'auto'`
- `parseLodLevel('high')` → `'high'`
- `parseLodLevel('HIGH')` → `'high'` (대소문자 무시)
- `parseLodLevel('xyz')` → `'auto'` + console.warn
- `parseLodLevel('super-high')` → `'auto'` + console.warn

근거:

- 기존 `parse-integrator.ts` 패턴 완전 재사용 — 새 디자인 오버엔지니어링 회피
- web 레이어 분리는 `@astro-simulator/core` 가 Node.js / Rust / Worker 에서도 사용 가능해야 한다는 monorepo 원칙 보호

---

## 결정

### 1. 신규 모듈 구조

**신규 파일**:

- `packages/core/src/render/index.ts` (namespace export — ADR §1 SSoT 일치)
- `packages/core/src/render/lod.ts` — 핵심 LOD 분기 함수 (`lodFromScreenCoverage`, `screenCoverageRadius`, `LodLevel` type, `LOD_BODY_THRESHOLDS`)
- `packages/core/src/render/lod.test.ts` — 5 body × 3 거리 = 9개 조합 matrix + 보정 상수 엣지
- `packages/core/src/render/lod-body-thresholds.ts` — body kind → 임계 룩업 데이터 (§축 2)
- `apps/web/src/core/parse-lod-level.ts` + `parse-lod-level.test.ts` — URL parser
- `apps/web/scripts/browser-verify-lod.mjs` — headless screenshot diff 검증

**확장 파일** (Scale Tier Prediction 1 계약 준수):

- `packages/core/src/scene/solar-system-scene.ts` — `updateAt` 루프 내부에 LOD 분기 hook 추가. **mesh.position 계산식 / tier 상수 / FloatingOrigin 상호작용 수정 금지**
- `apps/web/src/core/url-sync.tsx` — `?lod=` 파싱 + sendCommand
- `apps/web/src/core/sim-context.tsx` — `setLodOverride` command 타입 추가
- `apps/web/src/components/layout/hud-corners.tsx` — dev overlay (draw call 수) 추가 위치 (prod 에선 DCE 제거 또는 별도 컴포넌트)
- `packages/core/src/index.ts` — `render` namespace re-export

### 2. 핵심 공식 고정

**LOD 분기 순수 함수** (검증 가능한 결정론):

```ts
export function lodFromScreenCoverage(
  body: CelestialBody,
  cameraDistanceMeters: number, // 카메라 → body 중심 실세계 거리 (m)
  screenCoverage: number, // screenCoverageRadius() 결과 (pixel)
): LodLevel {
  // 1. body-kind 강제 규칙 (축 2)
  const threshold = LOD_BODY_THRESHOLDS[classifyBodyLodKind(body)];
  if (threshold.mode === 'always-high') return 'high';
  if (
    threshold.mode === 'absolute-distance' &&
    cameraDistanceMeters < threshold.highMaxDistanceMeters
  ) {
    return 'high';
  }
  if (
    threshold.mode === 'radius-multiple' &&
    cameraDistanceMeters < threshold.highMaxRadiusFactor * body.radius
  ) {
    return 'high';
  }
  // 2. 픽셀 점유 (축 1)
  if (screenCoverage >= 50) return 'high';
  if (screenCoverage >= 8) return 'mid';
  return 'low';
}
```

**pixel 경계**:

- `high`: ≥ 50px **또는** body-kind 강제 조건 충족
- `mid`: 8 ≤ px < 50
- `low`: < 8px

**재계약 DoD #2 "픽셀 점유 ≥ 8px" 해석**: 8px 는 `mid` 진입 하한. 그 미만은 `low` billboard. 50px 는 P11-B 초안 ADR (네이밍 정책 §축 4) 에는 없으나, Scale Tier ADR `20260423` §결정 §4 Float32 분석에서 "sub-pixel 위성 floor 3px" 와 연동해 고안정 high 경계를 50px 로 설정. 실측 bench 로 조정 가능 (재검토 조건 §3).

### 3. 주석 계약 박제 (drift 방어)

`packages/core/src/render/lod.ts` 상단에 박제:

```ts
// LOD 3단 분기 계약 (ADR 20260424-p11-b-lod-design §결정):
//   1. LOD 는 Scale Tier 와 직교 — tier.ts / tier-transition.ts 수정 금지
//   2. body kind 강제 규칙 (star/planet-giant/planet-terrestrial/moon/dwarf-planet/comet/
//      asteroid/spacecraft/black-hole/nebula/galaxy/star-cluster) 12 카테고리 완비.
//      신규 kind 추가 시 LOD_BODY_THRESHOLDS 에 항목 누락하면 default fallback 발생 → 주석-구현 drift
//   3. high/mid/low 이외의 값 도입 금지 — 추가 단계 필요 시 ADR Amendment 선박제
//   4. body-kind 분류는 kind 자체 + mass 보조 (planet → giant/terrestrial 2분기)
//   5. 픽셀 경계: high≥50, 50>mid≥8, low<8 — 변경은 bench tier-a 회귀 < 5% 유지 범위 내
//   6. URL `?lod=auto` 는 distance/coverage 자동 판정, `?lod=high|mid|low` 는 전 body 강제
// 위 계약 위배 변경은 즉시 버그로 간주 (CLAUDE.md "주석 계약 vs 구현 drift" 교훈).
```

### 4. 테스트 전략

| 레이어               | 위치                                                     | 검증 대상                                                                                                                                              |
| -------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 단위 (순수 함수)     | `packages/core/src/render/lod.test.ts`                   | `lodFromScreenCoverage` 의 9개 matrix (태양/지구/달/이오/소행성 × 근/중/원) + 12 카테고리 카테고리 enum 완비 assert ("주석 계약 vs 구현 drift" 방어)   |
| 단위 (URL parser)    | `apps/web/src/core/parse-lod-level.test.ts`              | valid / case-insensitive / invalid fallback + console.warn                                                                                             |
| 통합 (scene)         | 기존 `solar-system-scene.test.ts` 에 하나 추가           | LOD 전환 시 Scale Tier 코드 변경 0 assert — `git diff` 대체할 **함수 호출 카운트 assert**                                                              |
| E2E / browser-verify | `apps/web/scripts/browser-verify-lod.mjs` (신규)         | 3 tier × 3 LOD 조합 draw call 수 ≥ 20% 차이, screenshot diff < 15%                                                                                     |
| bench                | 기존 `pnpm bench` scenario 5종에 `baselineTier='a'` 지정 | idle / play-1d / play-1y / focus-earth / focus-neptune — baseline = #313 M3 (PR #316 머지 커밋 `aa2ceb0`, tag `v0.12.0` = `61cbfa7d`) 대비 회귀율 < 5% |

**카테고리 enum 완비 assert** 예시:

```ts
test('LOD_BODY_THRESHOLDS 는 모든 body kind + 파생 kind 를 커버한다', () => {
  const required: BodyLodKind[] = [
    'star',
    'planet-giant',
    'planet-terrestrial',
    'moon',
    'dwarf-planet',
    'comet',
    'asteroid',
    'spacecraft',
    'black-hole',
    'nebula',
    'galaxy',
    'star-cluster',
  ];
  for (const kind of required) {
    expect(LOD_BODY_THRESHOLDS[kind]).toBeDefined();
  }
});
```

### 5. #247 Osculating 관찰 프로토콜

DoD #5 의 실측 절차.

1. dev 빌드 실행. `?focus=io&lod=auto` 로 이오 focus
2. zoom out 하여 LOD high → mid 전환이 발생하는 거리까지 이동 (dev overlay 의 draw call 수로 확인)
3. 전환 시점 ±10 프레임 screenshot 캡처 — 이오의 궤도선이 끊기는지 육안 + pixel diff
4. 같은 시나리오를 갈릴레이 4위성 (io/europa/ganymede/callisto) 전부 반복
5. 결과 → `docs/benchmarks/p11-b-osculating-observation-<YYYYMMDD>.md` 로 박제
6. 끊김 관찰 시 #247 에 재증명 코멘트 + 후속 이슈 우선순위 상향 제안 (Osculating 동기화 구현, P13 후보)

본 ADR 범위에서는 **관찰만** — 구현 안 함.

### 6. dev overlay — draw call 수 표시

DoD #1 "각 단계 draw call 수 차이 ≥ 20%" 의 수단.

**위치**: `apps/web/src/components/layout/hud-corners.tsx` 좌하단 신설 영역 (우하단 Data Tier 와 충돌 없도록)

**구현**:

- Babylon `scene.getActiveMeshes().length` 또는 `engine.drawCallsSingleFrame` 카운터 (Babylon 8.x 제공 — 버전 확인 필요)
- 매 프레임 업데이트는 성능 부담이므로 **1초 throttle** — `requestAnimationFrame` 내부 accumulator
- **prod 빌드에서 DCE**: `process.env.NODE_ENV !== 'production'` 가드 또는 `?debug=draw-calls` 쿼리 opt-in
- 표시 형식: `draw: 142 (H:12 M:8 L:72)` — 총합 + LOD 별 분포

근거:

- sub-agent "검증 완료 ≠ 박제 완료" 교훈 — draw call 차이는 코드로 assert 가능하지만, **런타임 관찰 가능한 가시 증거** 가 있어야 QA 가 "실제로 그렇게 동작" 검증 용이
- `hud-corners.tsx` 재사용 — 별도 컴포넌트 신설 비용 절약

---

## 영향 범위

### 본 ADR 박제 PR (ADR 파일만, 구현 없음)

- 신규: `docs/decisions/20260424-p11-b-lod-design.md` (본 파일)

### 구현 PR — 본 ADR 기반

| 대상                  | 파일                                                                                  | 변경 규모    | DoD 대응                    |
| --------------------- | ------------------------------------------------------------------------------------- | ------------ | --------------------------- |
| 신규 render namespace | `packages/core/src/render/index.ts` + `lod.ts` + `lod-body-thresholds.ts`             | ~200 라인    | #1 #2                       |
| 단위 테스트           | `packages/core/src/render/lod.test.ts`                                                | ~150 라인    | #2 카테고리 enum drift 방어 |
| URL parser            | `apps/web/src/core/parse-lod-level.ts` + `parse-lod-level.test.ts`                    | ~80 라인     | #6                          |
| scene 통합            | `solar-system-scene.ts` `updateAt` 확장 + `createBodyMeshMid` + `createBodyBillboard` | ~150 라인    | #1 #3                       |
| URL sync              | `url-sync.tsx` + `sim-context.tsx`                                                    | ~40 라인     | #6                          |
| HUD overlay           | `hud-corners.tsx` 또는 신규 `lod-dev-overlay.tsx`                                     | ~60 라인     | #1 관찰                     |
| browser-verify        | `apps/web/scripts/browser-verify-lod.mjs`                                             | ~200 라인    | #3 screenshot diff          |
| bench 회귀            | 기존 `pnpm bench` scenarios 재측정                                                    | 0 (스크립트) | #4                          |
| Osculating 리포트     | `docs/benchmarks/p11-b-osculating-observation-*.md`                                   | ~100 라인    | #5                          |

### Scale Tier 관련 파일 (변경 0, Prediction 1 재현)

`packages/core/src/scene/tier.ts` / `tier-transition.ts` — 변경 0 라인. 선행 ADR `20260424-tier-naming-policy.md` §Prediction 1 Amendment (2026-04-24) 재현 검증 명령 준수:

```bash
git diff <base>..<head> -- \
  packages/core/src/scene/tier.ts \
  packages/core/src/scene/tier-transition.ts \
  --numstat | awk '{s+=$1+$2} END {print s+0}'
# 기대값: 0 (양쪽 파일 총 추가/삭제 라인 수)
```

`packages/core/src/scene/solar-system-scene.ts` 는 LOD hook 추가 용도로 예외 허용 (선행 ADR Amendment). 수기 리뷰로 "금지 조건 위배 0" 확인 — `mesh.position` 수식 / `renderScaleForTier` / `Tier` 상수 / `FloatingOrigin` 상호작용 / `setTier` origin 로직 변경 금지.

---

## Concrete Prediction (CLAUDE.md "신규 데이터 ≠ 신규 코드")

### Prediction 1: 신규 body 추가 시 LOD 코드 변화 0

**예측**: P13 토성계 위성 (티탄/엔셀라두스/미마스 등) 을 `packages/core/src/ephemeris/solar-system.json` 에 JSON 엔티티로 추가할 때, `packages/core/src/render/lod.ts` / `lod-body-thresholds.ts` / `solar-system-scene.ts` LOD hook 의 **코드 라인 변화 0**.

**근거 메커니즘**: LOD 분기는 body.kind + body.mass + body.radius 만 참조. 신규 body 가 기존 12 카테고리 (star / planet-giant / ... / star-cluster) 중 하나에 속하면 데이터 추가만으로 기존 LOD 분기가 동작.

**재현 검증**:

```bash
git diff <P13 PR base>..<P13 PR head> -- \
  packages/core/src/render/ \
  --numstat | awk '{s+=$1+$2} END {print s+0}'
# 기대값: 0
```

**예측 실패 시**: 신규 body 가 기존 12 카테고리를 벗어난다는 신호. 예: 외계행성 `exoplanet`, 인공위성 `satellite` 세분화. ADR Amendment 박제 + `LOD_BODY_THRESHOLDS` 항목 추가. 카테고리 enum 완비 테스트가 fail 로 drift 즉시 감지 (주석 계약).

### Prediction 2: Scale Tier 변경 시 LOD 코드 변화 0

**예측**: Scale Tier 경계 (`BOUNDARY.innerUpper` / `solarUpper`) 조정 또는 renderScale 값 튜닝 시 LOD 코드 변경 **0 라인**.

**근거**: LOD 는 `activeTier` 를 **읽기만** — `screenCoverageRadius` 는 `renderScale` 인자로 받지만 Scale Tier 내부 상수를 직접 참조 안 함.

**재현 검증**:

```bash
git diff <PR base>..<PR head> -- \
  packages/core/src/render/ \
  --numstat | awk '{s+=$1+$2} END {print s+0}'
# 기대값: 0
```

**예측 실패 시**: LOD 가 Scale Tier 내부 상수를 몰래 의존했다는 신호. LOD hook 리팩토링 필요.

### Prediction 3: PBR 도입 시 LOD 코드 변화 0

**예측**: P12 후속 PBR/Cloud/Normal 맵 도입 시 LOD 코드 **0 라인**.

**근거**: LOD 는 geometry/mesh visibility/alpha 만 조작. material 종류 (Standard → PBR) 는 투명.

**재현 검증**:

```bash
git diff <PBR PR base>..<PBR PR head> -- \
  packages/core/src/render/ \
  --numstat | awk '{s+=$1+$2} END {print s+0}'
# 기대값: 0
```

**예측 실패 시**: LOD 가 특정 material property 를 가정했다는 신호 → ADR Amendment.

---

## 위험 / 미해결

### 위험 1: Babylon 내장 LOD API 와의 경쟁

Babylon 의 `AbstractMesh.addLODLevel(distance, mesh)` 는 `scene.activeCamera.position.subtract(mesh.position).length()` 로 거리 계산. Scale Tier 변환 시 mesh.position 이 scene unit 이라 실세계 거리와 어긋남.

**완화**: 본 설계는 Babylon 내장 LOD API 를 사용하지 않고 **자체 분기**. 그러나 개발자가 실수로 `mesh.addLODLevel()` 호출 시 충돌 가능. 방어: `lod.ts` 주석 계약 + `solar-system-scene.test.ts` 에 "mesh 에 Babylon LOD level 이 등록되지 않았다" assert 추가.

### 위험 2: cross-fade 200ms 타이밍 겹침

Scale Tier transition 300ms + LOD cross-fade 200ms 가 동시 발생하면 screenshot diff 측정이 불안정. 현재 설계는 Scale Tier transition 중에 LOD 전환을 defer 하지만, 구현 구체안에서 타이밍 경쟁 가능.

**완화**: `tier-transition.ts` 가 이미 `inTransition` boolean 을 export 하거나, subscribe 가능한 이벤트 제공. 필요 시 구현 PR 에서 API 확장 (Scale Tier ADR Prediction 1 위배 가능 → 확장 전 cross-check).

### 위험 3: 12 카테고리 enum 완비 유지 비용

신규 body kind 추가 시 `LOD_BODY_THRESHOLDS` 누락하면 주석 계약 드리프트. 카테고리 enum 완비 테스트로 방어하지만, **신규 kind zod enum 에 추가한 PR 이 LOD thresholds 갱신을 놓치면** CI fail 로만 감지 가능.

**완화**: PR 템플릿에 "새 body kind 추가 시 `LOD_BODY_THRESHOLDS` 갱신 확인" 체크박스. 또는 `solar-system-loader.ts` 에 빌드 타임 assert (`Object.keys(LOD_BODY_THRESHOLDS).length === VALID_BODY_KINDS.length + 1` — +1 은 planet → giant/terrestrial 파생).

### 미해결 1: billboard 의 alpha test pixel edge

low billboard 는 body 색상만 albedo 단색 평면 — sphere 느낌이 아닌 disk 느낌. body 수가 많은 T1 solar 뷰에서 시각적 자연스러움이 중요. 초기 구현은 단순 quad, 후속에서 "circular alpha mask" (`alpha = 1 - smoothstep(0.4, 0.5, length(uv - 0.5))`) 적용 검토.

**후속 이슈 후보**: "LOD low billboard 시각 디테일 향상" — 본 Phase 비-범위, 시각 QA 결과 따라 분리.

### 미해결 2: 혜성/spacecraft 의 tail / trail

혜성은 `comet` kind 지만 dust tail / ion tail / coma 가 별도 파티클 시스템 (현재 미구현). LOD high/mid/low 전환 시 tail 가시성을 어떻게 처리할지 본 ADR 은 결정 미수. 현재 태양계 JSON 에 comet kind 가 1개도 없어 실 영향 0 — 후속 이슈로 deferred (P14+ 혜성 추가 시).

### 미해결 3: focus body 관성적 "always high"

focus body 는 사용자가 주목 중 — screenCoverage 가 작아도 mid/low 로 낮추면 사용자 체감 퇴행. 본 ADR 구현 가이드에는 **focus body 는 `high` 강제** 추가 고려 필요. §축 2 "star" 처럼 mode='always-high' 형식이 아닌 **런타임 동적 조건** — lodFromScreenCoverage 에 `isFocused` boolean 추가.

**완화** (결정 보강): `lodFromScreenCoverage` 에 `isFocused: boolean` 인자 추가. `isFocused=true` 면 coverage / kind 무관 `high`. 구현 시 `solar-system-scene.ts` LOD hook 에서 `bodyId === focusBodyIdForAssert` 로 체크.

---

## 재검토 조건

1. **DoD #1 draw call 20% 미달** — mid 의 segments=12 가 절감 부족. segments=8 로 낮추거나 low billboard 비중 상향 (50px 미만 모두 low) 검토
2. **DoD #3 pop-in < 15% 미달** — 200ms cross-fade 부족. 300ms 또는 ease function 도입
3. **DoD #4 bench 회귀율 ≥ 5%** — LOD 분기 함수 O(N) 이 병목. 프레임당 1회 집계 대신 10 프레임 throttle 또는 `screenCoverageRadius` batch API 전환
4. **Prediction 3개 중 하나 실패** — ADR Amendment 박제 후 추상화 재조정
5. **#247 Osculating 관찰에서 이오 궤도 끊김 확인** — #247 구현을 P13 → P12 후속으로 우선순위 상향 재건의 제안 (본 ADR 범위 밖)
6. **focus body `always-high` 강제 후 focus 가 매우 먼 body 일 때 draw call 역증가** — 예: 해왕성 focus 에서 해왕성은 far 인데 high 강제. 추가 조건 (`isFocused && screenCoverage >= 3`) 도입 재검토
7. **장기 세션 메모리 누적** (교차검증 반영) — mid/low variant lazy-create + `setEnabled(false)` 만으로 GPU 버퍼 누적. 30분 / 1시간 / 3시간 연속 사용 시 Chrome `performance.memory` 관찰. 누적 시 3분 LRU 타이머 dispose 정책 도입

---

## 암묵 전제 박제

- Babylon `scene.getTransformationMatrix()` 는 `viewMatrix × projectionMatrix` 의 **combined transposed** 형식 — `BABYLON.Matrix` API 를 재사용해 직접 `multiplyToRef` 연산. Float32Array 직접 조작 금지
- body.mass 분류 (`giant` vs `terrestrial`) 는 5e25 kg 경계. P13 이후 외행성 외계 추가 시 이 경계 재검토
- Scale Tier T1 solar 뷰에서 해왕성 coverage 는 sub-pixel 이지만 body-kind 강제 규칙 (`planet-terrestrial: 5R`) 때문에 해왕성은 **coverage-only 경로** 로 `low` 판정됨. 가스거인 규칙 (10R) 으로 분류되려면 body.mass 가 5e25 kg 이상 (해왕성 1.02e26 kg → giant) → 판정 테스트 matrix 에 해왕성 시나리오 포함 필수
- `process.env.NODE_ENV !== 'production'` 가드로 draw call overlay 를 prod 에서 제거. dev/CI browser-verify 에서만 가시

---

## 교차검증 반영 사항

2026-04-24 Gemini cross-validate 1회 실행 — outcome: applied (exit 0). 로그: `.claude/logs/cross-validate-architecture-20260424-143150.log`.

**Claude 편향 셀프 체크 통과 여부** (4종 체크리스트, 호출 전 기록):

- 낙관적 일정 OK / 결합 간과 △ (tier-transition `inTransition` export 미실측 — Gemini 에 명시 질문) / 폐기 프레이밍 OK / 순수주의 △ (mid=low-poly sphere 선택의 실측 근거 부족 — Gemini 에 명시 질문)

### 합의

Gemini 가 Claude 설계와 일치한 지적 (현재 ADR 에 즉시 반영):

1. **LOD 경계 수치 (50/8 px)** — "성능과 정확도 균형 합리적" 평가. 이견 없음 — §결정 §2 유지
2. **자체 LOD 분기 (Babylon 내장 API 미사용)** — "합리적 결정" — §위험 1 완화 타당성 확인
3. **데이터 주도 설계 (`LOD_BODY_THRESHOLDS`)** — "현명한 접근" — §결정 §1 + Prediction 1 정당성 재확인
4. **직교성 (Scale Tier 읽기 전용 의존)** — "뛰어난 설계 관행" — Prediction 1 검증 경로 유지
5. **Body-kind 파생 분류 (planet → giant/terrestrial by mass)** — "데이터 구조 변경 없이 요구사항 충족하는 현명한 접근" — §축 2 유지. Claude 가 의심한 "주석 계약 drift 위험" 우려는 Gemini 가 실질 문제로 보지 않음. 단, 카테고리 enum 완비 테스트 (§테스트 전략) 로 drift 방어 이미 박제됨

### 이견 수용

Gemini 지적을 수용하여 ADR 원안 수정한 항목:

1. **자원 해제 정책 (mid/low variant dispose)** — Gemini 고유 발견. `lazy-create` 후 `setEnabled(false)` 만으로는 GPU 버퍼 메모리가 누적되어 장기 세션 리크 발생 가능. **신규 §7 "자원 해제 정책" 추가**:
   - **정책**: mid/low variant 는 첫 전환 시 lazy-create, 이후 `setEnabled(false)` 로 draw call 제거 + `dispose` 는 **body 가 3분 이상 해당 variant 를 쓰지 않을 때** 실행 (타이머 기반 LRU)
   - **구현 간략화**: 초기 구현은 타이머 없이 lazy-create + setEnabled 만. 메모리 실측 후 필요 시 LRU 박제 (재검토 조건 §7 신설)
   - **근거 반영**: `createBodyMeshMid` / `createBodyBillboard` 호출 시점을 "최초 해당 LOD 전환 요청 프레임" 으로 제한 (lazy), 초기 로딩 비용 분산

2. **초기 로딩 LOD 계산 타이밍** — Gemini 고유 발견. 첫 프레임 이전에 LOD 계산 완료 안 되면 모든 body 가 `high` 로 시작 → 다음 프레임에 대량 전환 플리커. **§암묵 전제에 추가**:
   - Scene 초기화 직후 `updateAt(initialJd)` 1회 호출에서 LOD 분기 동기 완료 (카메라/뷰포트 준비된 상태에서만). 이 전제가 성립하지 않으면 첫 프레임 pop-in 이 DoD #3 15% 경계를 넘을 수 있음
   - 구현 가이드: `sim-canvas.tsx` 의 `useEffect` 내 첫 렌더 전 LOD 계산 가드 추가

3. **`screenCoverageRadius` 의 CAMERA_UP_APPROX 근사 근거 주석 강화** — Gemini 지적. ADR 내 "up 이나 right 둘 중 하나로 충분" 문장을 **구현 코드 주석** 으로 명시 박제 요구 — 재구현자가 대칭성 가정을 놓치지 않도록. §축 1 공식 주석에 "body 가 구형이라 방향 대칭 — 카메라 표면 거리 basis 가 radius 길이만 벗어나면 정확도 충분" 한 줄 추가 의무

### Claude 재분석으로 기각한 Gemini 제안

Gemini 가 제안했지만 Claude 가 범위/필요성 근거로 반려한 항목:

1. **Draw call overlay 이동평균 (moving average)** — Gemini 고유 발견. "매 프레임 또는 1초마다 급격 변동이 QA 혼란" 우려. **반려 근거**:
   - 본 ADR DoD #1 "각 단계 draw call 수 차이 ≥ 20%" 는 **정적 측정** — 카메라 정지 상태에서 LOD 변경 전/후 수치 비교. 이동평균은 변동을 부드럽게 보여주나 정지 상태에선 이동평균이 즉시값과 일치 → 검증 가치 중립
   - 이동평균을 적용하면 급격한 LOD 전환 순간을 **오히려 감지 어려워짐** — draw call 스파이크가 smooth 되어 "20% 차이" 분기 타이밍 추적 곤란
   - 본 PR 비-범위 — **후속 분리** 판정. 운영 경험 쌓인 후 UX 개선 이슈로 검토 (CRITICAL #6 스프린트 비목표 존중)

2. **`LOD_BODY_THRESHOLDS` 의 `__default` 런타임 폴백** — Gemini 고유 발견. "테스트 실패 외 런타임 안전장치". **부분 반려**:
   - 취지는 동의하나 "default fallback 이 조용한 누락을 흡수한다" 는 CLAUDE.md "주석 계약 vs 구현 drift" 교훈 (volt #49) 과 정면 충돌. `atomic` default fallback 이 338개 세션 로그 누락을 조용히 흡수해 75% flaky 를 만든 사례
   - 대안: `classifyBodyLodKind` 가 unknown kind 만나면 **`console.warn` + `low` fallback** (prod 에서도 warn — 조용하지 않음). 테스트 + 런타임 경고 이중 방어. 이건 Gemini 의 원 제안 (`__default` 로 흡수) 과 다른 접근
   - **반영 방식**: ADR §4 테스트 전략 아래 한 줄 추가 — "unknown kind 런타임 감지 시 `console.warn` + `low` fallback, default enum 항목 도입 금지"

### 고유 발견 — 후속 분리

현재 PR 범위 밖으로 판정되어 후속 이슈로 분리할 항목:

- **Draw call overlay 이동평균 UX 개선** — 우선순위 low. 운영 경험 쌓인 후 별도 이슈로 검토
- **mid/low variant LRU dispose (3분 타이머)** — 우선순위 medium. 본 Phase 초기 구현 후 장기 세션 메모리 프로파일 실측, 누적 확인되면 별도 이슈로 박제

(본 ADR 박제 시점에는 후속 이슈 생성 보류 — 구현 PR 머지 후 실측 근거와 함께 PM 에게 제안)

---

## 참고

- 이슈 #289 (본 ADR 대상), #289 재계약 코멘트 (2026-04-24)
- ADR `20260424-tier-naming-policy.md` §1 SSoT — LOD 모듈 경로 선박제
- ADR `20260423-display-relative-scale-unification.md` §Concrete Prediction 1 — Scale Tier 직교 계약
- ADR `20260422-floating-origin.md` §Concrete Prediction 2 — LOD 도입 시 Floating Origin 변화 0 예측 (본 ADR 이 그 예측의 수행자)
- ADR `20260419-satellite-orbit-hybrid.md` — Concrete Prediction 패턴 원형 + #247 Osculating 맥락
- `docs/principles/fact-first.md` §2 "절대 스케일 = 디스플레이 함수" — LOD 는 시각 피로 감소 수단, 사실 왜곡 없음
- CLAUDE.md 교훈: "신규 함수 ≠ 신규 구현" / "신규 데이터 ≠ 신규 코드" / "주석 계약 vs 구현 drift" / "headless 브라우저 검증 ≠ 실 브라우저"
- volt #33 (headless false positive 방어), volt #47 (Concrete Prediction)
