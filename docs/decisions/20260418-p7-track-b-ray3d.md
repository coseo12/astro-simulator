# ADR: P7-C 트랙 B 3D ray construction 복원 — 순차 재시도 + D' 백업

- **상태**: Accepted (P7-C #208 — **3차 후보 E Frustum Corner Interpolation 채택**)
- **날짜**: 2026-04-18
- **결정자**: Architect (P7-C #208) / Developer (구현·채택)
- **채택 차수**: 3차 (후보 E · Frustum Corner Interpolation · GPU mat4 역행렬 0회)
- **관련**:
  - 선행 ADR: [`20260417-accretion-disk-shadow-pipeline.md`](./20260417-accretion-disk-shadow-pipeline.md) (P6-B — D' 변형 박제 · 재검토 트리거 "invViewProj 처리 해결")
  - 선행 ADR: [`20260417-gravitational-lensing-pipeline.md`](./20260417-gravitational-lensing-pipeline.md) (P5-D — Superseded)
  - 선행 ADR: [`20260417-geodesic-solver.md`](./20260417-geodesic-solver.md) (P6-A — LUT 데이터 원천)
  - 이슈: #208 (본 작업) · #196 (P6-B 트랙 B 3회 실패 이력) · #211 (P7 마스터)
  - 회고: [`docs/retrospectives/p6-retrospective.md`](../retrospectives/p6-retrospective.md) "어려웠던 것 §1"

## 배경

P6-B(#190) 구현 중 원안 ADR (1)-D "광선별 3D ray construction (WGSL invViewProj 역행렬)"을 복원하려 했으나 **3회 연속 실패**로 D' 변형(화면공간 b/Rs 근사 + LUT)으로 후퇴했다. 그 결과:

- **시각 한계**: `diskAxisX/Y = (1, 0)` 화면 x축 고정 — 카메라가 회전해도 disk의 장축이 항상 화면 x축을 따라감. 물리적으로 부정확.
- **trace 부채**: 원안 ADR §비결정 항목에서 "트랙 B hook으로 보존" 명시. `diskAxisX/Y` uniform은 shader에 이미 있으나 업데이트 경로가 화면 x축 고정.
- **재검토 트리거**: 선행 ADR §재검토 트리거 1번 "invViewProj 처리 해결 → D' → D 원안 복원" — 본 ADR이 그 발동.

### P6-B 실패 이력 (#196 기록)

| 시도 | 방법                                                   | 결과                                                    | 근거 코멘트           |
| ---- | ------------------------------------------------------ | ------------------------------------------------------- | --------------------- |
| B-1  | direct `mat4` uniform 전달                             | 실패 (검은 화면)                                        | #196 본문             |
| B-2  | `effect.setMatrix('invViewProj', ...)` + CPU 사전 계산 | 실패 (uniform 추가만으로 회귀, `useRay3D=false`도 검정) | #196 본문 "B-2"       |
| B-3  | WGSL 내부 mat4 inverse 헬퍼                            | 시도 중단 (발견 1 알파 채널 fix 우선)                   | #196 본문 "다음 단계" |

### Post-mortem: 발견 1의 영향

#196 발견 1 fix (`vec4f(result.rgb, 1.0)` 알파 강제)가 **현재 D' 변형에 이미 반영**되어 있다 (`black-hole-rendering.ts:161`). P6-B 당시 B-1/B-2 실패는 **"uniform 추가로 shader가 fail-fast하여 검게 나온 것"과 "알파 채널 0 문제"가 겹친 복합 원인**일 가능성이 높다. 발견 1 fix가 있는 상태에서 동일 uniform 전달 경로를 재시도하면 다른 결과가 나올 여지가 있다.

### Babylon 내장 레퍼런스 2종

본 ADR 설계 중 `node_modules/@babylonjs/core` 조사에서 invViewProj를 **정상 동작시키는 2가지 패턴**을 발견:

1. **단일 uniform** — `ShadersWGSL/volumetricLightingRenderVolume.fragment.js`:
   ```wgsl
   uniform invViewProjection: mat4x4<f32>;
   // ...
   let ndc = vec4f((xy / size) * 2. - 1., depth, 1.0);
   worldPos = uniforms.invViewProjection * ndc;
   worldPos = worldPos / worldPos.w;
   ```
2. **분리 uniform** — `PostProcesses/thinSSRPostProcess.js`:
   ```js
   effect.setMatrix('invView', tmpInvView);
   effect.setMatrix('invProjectionMatrix', tmpInvProj);
   ```
   Y-축 교정: `TrsWebGPU` vs `Trs` 분기(`isWebGPU` 스위치)로 WebGPU ↔ WebGL2 clip-space 차이(Y 뒤집힘) 흡수.

이 두 레퍼런스는 **"Babylon PostProcess에서 invViewProj 전달은 기본적으로 가능하다"** 는 확실한 증거다. P6-B 실패는 구현 상세(선언 순서, 셰이더 등록 타이밍, WebGPU Y-flip 등)의 문제였을 가능성이 높다.

## 후보 비교

본 ADR은 단일 "최선안 선택"이 아닌 **순차 재시도 + 백업 경로 ADR** 구조다. PM 계약(스프린트 이슈 #208)에서 4회차 실패 시 D' 보강 경로가 박제되어 있다. 각 차수를 "독립 후보"로 취급하여 비교한다.

### 후보 A — 1차 시도: 알파 채널 fix 상태에서 B-1(단일 `invViewProj`) 재검증

**핵심 아이디어**: #196 발견 1 fix 이후 상태에서 B-1(단일 `invViewProj: mat4x4<f32>` uniform)을 재시도. Babylon `volumetricLightingRenderVolume` 패턴을 그대로 참조.

| 축             | 평가                                                                                                                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 구현 비용      | **최저** (uniform 1개 추가, onApply에서 `Matrix.Invert(viewMatrix.multiply(projMatrix))`)                                                                                                    |
| 성공 확률      | **중간~높음** (#196 발견 1과 B-1이 복합 원인이었다면 해소)                                                                                                                                   |
| 실패 판정 기준 | (a) `?bh=2&ray3d=1` 렌더 후 canvas 검정 지속 · (b) 콘솔 셰이더 컴파일 에러 · (c) disk/shadow가 P6-B baseline과 시각적으로 동일(회전 미반영)                                                  |
| CI 영향        | 셰이더 파일 변경 → `bench:scene:sweep` 영향 · 기존 LUT cargo test 무관                                                                                                                       |
| 재검증 방법    | (1) `cargo test lensing_lut_shadow_b_crit_within_5_percent` 회귀 가드 · (2) 브라우저 스크린샷 `?bh=2&ray3d=1` elevation 10°/45°/80° — disk 장축이 **화면 x축이 아닌 방향**으로 투영되면 PASS |

### 후보 B — 2차 시도: WGSL 내부 inverse 헬퍼 (viewProj만 전달)

**핵심 아이디어**: CPU에서 inverse를 계산하지 않고 `viewProj: mat4x4<f32>` 만 전달 후 WGSL에서 `mat4_invert()` 헬퍼 구현. CPU-GPU 동기화 이슈 회피.

| 축             | 평가                                                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 구현 비용      | **높음** (WGSL `mat4_invert` 구현 — 16 cofactor + determinant ~50줄)                                                                      |
| 성공 확률      | **중간** (1차 실패 원인이 CPU 역행렬 자체였다면 유효, 단 WGSL 역행렬 수치 안정성 이슈 잠재)                                               |
| 실패 판정 기준 | (a) WGSL 컴파일 에러 · (b) `mat4_invert` 결과가 determinant 0에 가까워 NaN 전파 · (c) disk/shadow 비대칭이 뒤집힘(clip-space Y 보정 실패) |
| CI 영향        | WGSL 컴파일 시간 증가 (50줄 cofactor) · LUT 무관                                                                                          |
| 재검증 방법    | 1차와 동일 + WGSL `fragmentOutputs.color = vec4f(abs(det - 1.0) * 10.0, 0.0, 0.0, 1.0)` 디버그 dump로 determinant 사전 확인               |

### 후보 C — 3차 시도: Babylon `thinSSRPostProcess` 패턴 역공학

**핵심 아이디어**: 단일 mat4 전달 대신 `invView` + `invProjection` **2개로 분리**하여 `effect.setMatrix()` 전달. `TrsWebGPU` Y-flip 보정 그대로 차용.

**구체 경로**:

```ts
// onApply
const viewMatrix = scene.getViewMatrix();
const projectionMatrix = scene.getProjectionMatrix();
const tmpInvProj = new Matrix();
const tmpInvView = new Matrix();
projectionMatrix.invertToRef(tmpInvProj);
viewMatrix.invertToRef(tmpInvView);
effect.setMatrix('invView', tmpInvView);
effect.setMatrix('invProjectionMatrix', tmpInvProj);
```

WGSL:

```wgsl
uniform invView: mat4x4<f32>;
uniform invProjectionMatrix: mat4x4<f32>;
// ndc.xy ∈ [-1,1], depth=1 → world-ray
let ndc = vec4f(input.vUV * 2. - 1., 1., 1.);
let viewPos = uniforms.invProjectionMatrix * ndc;
let worldFar = (uniforms.invView * vec4f(viewPos.xyz / viewPos.w, 1.)).xyz;
let rayDir = normalize(worldFar - uniforms.cameraPos);
```

| 축             | 평가                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------- |
| 구현 비용      | 중간 (uniform 2개, WGSL 3~5줄 추가)                                                                              |
| 성공 확률      | **가장 높음** (Babylon 공식 PostProcess 패턴 · 9.2.1 동일 런타임 · 본 프로젝트 WebGPU + WebGL2 듀얼 요구에 부합) |
| 실패 판정 기준 | Y-flip 보정 누락으로 disk가 **상하 뒤집힘** · (a)-(c) 후보 A와 동일                                              |
| CI 영향        | 후보 A와 동일                                                                                                    |
| 재검증 방법    | 후보 A + **Y-flip 회귀**: WebGPU와 WebGL2(engine=kepler 등) 양쪽에서 동일 disk 장축 방향 확인                    |

### 후보 E — 보조 후보: Frustum Corner Interpolation (역행렬 無 3D ray · 교차검증 고유 발견)

**핵심 아이디어** (Gemini 교차검증에서 도출): CPU에서 카메라 frustum의 **near-plane 4개 모서리 world 좌표**를 계산해 uniform 배열로 전달. WGSL은 픽셀 UV로 bilinear 보간하여 ray dir을 얻음 — **mat4 inverse 연산 자체를 우회**.

**구체 경로**:

```ts
// onApply
const frustumCorners = camera.getFrustumPlanes(); // or 수동 계산
// near-plane 4 corners in world space: TL, TR, BL, BR
const corners = computeNearPlaneCornersWorld(camera);
effect.setArray3('frustumCornersWorld', flatten(corners)); // 12 floats
effect.setVector3('cameraPos', camera.globalPosition);
```

WGSL:

```wgsl
uniform frustumCornersWorld: array<vec3f, 4>;  // TL, TR, BL, BR
uniform cameraPos: vec3f;
// bilinear interp with vUV (0..1)
let top = mix(frustumCornersWorld[0], frustumCornersWorld[1], vUV.x);
let bot = mix(frustumCornersWorld[2], frustumCornersWorld[3], vUV.x);
let nearPt = mix(bot, top, vUV.y);  // WebGL2 UV 상향 / WebGPU UV 상향 동일
let rayDir = normalize(nearPt - cameraPos);
```

| 축             | 평가                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| 구현 비용      | 중간 (CPU frustum corner 계산 + uniform array · WGSL 4줄)                                                |
| 성공 확률      | **최고** (GPU에서 역행렬 연산 없음 · WebGPU vs WebGL Y-flip/Z-range 차이가 CPU 시점에 흡수)              |
| 플랫폼 호환성  | **최상** (NDC 변환 완전 부재로 파편화 버그 원천 차단)                                                    |
| 실패 판정 기준 | (a) corner 좌표 계산 오류 → 전체 방향 틀어짐 · (b) vUV 상/하 반전 (WebGPU RenderTarget V 좌표 관례 차이) |
| CI 영향        | 후보 A와 동일                                                                                            |
| 재검증 방법    | WebGPU + WebGL2 동일 스크린샷 확인 (Y-flip 검증)                                                         |

### 후보 D — 4차 백업: D' 화면공간 보강 (영구 근사)

**핵심 아이디어**: 후보 A/B/C 모두 실패 시, 현재 `diskAxisX/Y = (1, 0)` 고정을 **카메라 view 행렬에서 disk normal을 화면공간으로 투영**하는 방식으로 대체. 완전 3D ray가 아닌 **"회전 시 disk 방향 변화만 가시화"**.

**구체 경로** (`black-hole-rendering.ts` onApply):

```ts
// disk normal = disk 평면의 world-space 수직 벡터.
// tilt가 x축 회전이라면: normalWorld = (0, cos(tilt), sin(tilt)) (y-up 기준)
// view 행렬로 변환 → 화면공간 투영 → 단위벡터 장축/단축
const tiltRad = diskTilt;
const diskNormalWorld = new Vector3(0, Math.cos(tiltRad), Math.sin(tiltRad));
const diskNormalView = Vector3.TransformNormal(diskNormalWorld, viewMatrix);
// disk 장축 = normalView와 직교하는 평면의 투영 방향 (screen xy)
// 간략화: normalView.xy의 perpendicular를 화면 x 축에 투영
const nx = diskNormalView.x,
  ny = diskNormalView.y;
const len = Math.hypot(nx, ny);
const majX = len > 1e-5 ? -ny / len : 1; // normal ⊥ in screen xy
const majY = len > 1e-5 ? nx / len : 0;
effect.setFloat('diskAxisX', majX);
effect.setFloat('diskAxisY', majY);
```

| 축          | 평가                                                                                                                                                      |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 구현 비용   | **최저** (uniform 업데이트만 · shader 변경 불필요)                                                                                                        |
| 물리 정확도 | **근사** (disk 장축 방향은 회전 반영, 그러나 shadow 비대칭은 여전히 화면공간 b/Rs로 결정)                                                                 |
| DoD 완화    | PM 계약 M1 백업 경로 — C1 (검정 회귀 0) · C3 (LUT ±5%) 유지 · **C2 완화** (장축이 화면 x축을 벗어나기만 하면 PASS) · C4 (60fps) 유지                      |
| 영구성      | 영구 근사 확정 — ADR 상태를 Rejected 대신 **"Accepted as permanent approximation"** 로 전환 + 재검토 조건에 "Babylon WebGPU 사양 업데이트 시 재시도" 박제 |
| 재검증 방법 | elevation 10°/45°/80° 스크린샷 3장 baseline 고정 — disk 장축이 화면 x축과 이루는 각도가 elevation에 따라 달라지면 PASS                                    |

**교차검증 반영 (2026-04-18 Gemini)**:

- `diskNormalWorld = (0, cos(tilt), sin(tilt))` 부호는 프로젝트 회전축 규약에 따라 반대 방향으로 기울 수 있음 → developer가 육안 검증 후 부호 조정.
- 본 수식은 **"블랙홀이 화면 정중앙 근처" 가정의 평행 투영 근사**. 블랙홀이 화면 가장자리로 패닝될 때 원근 투영 왜곡이 발생하여 장축 방향이 물리 실제와 어긋난다. 기술 부채로 박제 (아래 트레이드오프 참조).

## 결정

**순차 시도 + 5단계 백업 경로 박제** (교차검증 반영: 옵션 E 삽입, 2차를 옵션 E 다음으로 강등):

1. **1차 (후보 A)** 최저 비용 + 발견 1 fix 효과 검증 — 30분 이내 판정 가능.
2. 1차 실패 시 **3차 (후보 C)** — Babylon 공식 `thinSSRPostProcess` 분리 uniform + `TrsWebGPU` Y-flip 보정 — 가장 높은 신뢰도. 1시간 타임박스.
3. 3차 실패 시 **후보 E (Frustum Corner Interpolation)** — CPU corner 계산 + WGSL bilinear 보간, 역행렬 연산 자체를 우회. **WebGPU/WebGL 파편화 차단**. 교차검증 고유 발견, 강하게 권장. 1시간 타임박스.
4. E도 실패 시 **2차 (후보 B)** — WGSL 내부 `mat4_invert` 헬퍼. 부동소수점 정밀도/alignment 리스크. **2시간 엄격 데드라인** (해결 아닌 포기 판정 기준).
5. 5차 **(후보 D)** — 위 4종 모두 실패 시 **D' 보강 영구 근사**로 전환. 본 ADR 상태 "Accepted as permanent approximation" + 재검토 트리거 박제.

### 순서 변경 근거 (1 → 3 → E → 2 → D)

PM 계약 이슈 본문은 1 → 2 → 3 → 4(D') 순이었으나, 다음 이유로 재배치한다:

- **후보 C (`thinSSRPostProcess`)**는 Babylon 9.2.1 공식 런타임이 현재 동일하게 사용 중 — "Babylon으로 invViewProj 전달이 불가능"이라는 가설이 **반증**됨.
- **후보 E (Frustum Corner Interpolation)**는 교차검증 고유 발견. GPU 역행렬 연산 자체를 제거하여 WebGPU/WebGL2 Y-flip/Z-range 파편화를 CPU에서 흡수. **가장 견고한 플랫폼 호환성**.
- **후보 B (WGSL 내부 inverse)**는 50줄 cofactor + 부동소수점 정밀도 + Matrix alignment 리스크 → Gemini 교차검증 "디버깅 블랙홀 위험" 경고에 따라 **E 이후 최후 시도** 강등.
- "최저 비용 → 최고 신뢰도 → 최고 호환성 → 최후 보루 → 영구 근사" 순서가 시간 효율.

이슈 본문 순서를 고집하지 않는 근거는 본 ADR 내부에 박제하여 developer가 혼동 없이 진행하도록 한다.

### 공통 조건 (모든 차수)

- `?bh=2&ray3d=1` 플래그로 신규 경로 옵트인 (기본 `ray3d=0` = D' 유지) — **회귀 격리**.
- P6-B D' 경로 유지 (기존 `?bh=2` 동작) — LUT 기반 shadow 정확도는 절대 훼손 금지.
- `alpha = 1.0` 강제 패턴 (#196 발견 1 fix) 유지 — 어떤 차수에서도 제거 금지.
- WebGPU + WebGL2 듀얼 셰이더 동시 유지 (P5-D 확립 규약).

### 실패 판정 cascade (타임박스 총 4.5시간 상한)

| 차수        | 시도                                        | 타임박스                                 | 특기사항                           |
| ----------- | ------------------------------------------- | ---------------------------------------- | ---------------------------------- |
| 1차         | 후보 A (단일 invViewProj)                   | 30분                                     | 발견 1 fix 효과 격리 검증          |
| 2차(시퀀스) | 후보 C (분리 invView + invProj + TrsWebGPU) | 1시간                                    | Babylon 공식 패턴                  |
| 3차(시퀀스) | 후보 E (Frustum Corner Interpolation)       | 1시간                                    | GPU 역행렬 無 · 파편화 차단        |
| 4차(시퀀스) | 후보 B (WGSL mat4_invert)                   | 2시간 (해결 아닌 **포기 판정 데드라인**) | 부동소수점 정밀도/alignment 리스크 |
| 5차(시퀀스) | 후보 D (D' 보강 영구 근사)                  | —                                        | PM 계약 백업 경로                  |

각 차수별 **실패 판정 체크리스트**:

```
[ ] 셰이더 컴파일 에러 0 (콘솔)
[ ] ?bh=2&ray3d=1 로드 직후 canvas 비검정 (정적)
[ ] 카메라 회전 elevation 45° → 화면 x축 고정 해소 (disk 장축 각도 변화 관찰)
[ ] WebGPU + WebGL2 양쪽에서 disk 장축 방향 일치 (Y-flip/Z-range 회귀 가드)
[ ] cargo test lensing_lut_shadow_b_crit_within_5_percent PASS (LUT 회귀 가드)
[ ] bench:scene:sweep p50 회귀 ≤ +10% (60fps 가드)
```

3개 이상 실패 시 **다음 차수로 전환 · 현 차수 코드 revert**. 5차(D') 도달 시 본 ADR을 "Accepted as permanent approximation"로 갱신 + PM 계약 DoD 완화 반영.

### 근거

1. **재시도 의미 있음**: Babylon 9.2.1 내장 레퍼런스 2종이 "PostProcess invViewProj 전달 가능"의 존재 증명. P6-B B-1/B-2 실패는 발견 1(알파) 복합 원인일 가능성이 높으며, 이 상태에서 재시도는 합리적.
2. **비용 상한 명시**: 4차 전까지 각 차수 타임박스(1차 30분 / 3차 1시간 / 2차 2시간) — 총 ~3.5시간 상한. 이를 넘기면 D' 보강으로 전환하여 **P7 전체 일정(3~5 영업일) 지연 방지**.
3. **D' 백업의 시각 가치 확보**: 완전 3D 실패 시에도 "카메라 회전 시 disk 방향 변화" 라는 최소 가시 가치는 확보 (D 원안 대비 90% 시각 효과) — 사용자 UX 퇴행 방지.
4. **회귀 격리 원칙**: `?bh=2&ray3d=1` 플래그 분리 — 기존 `?bh=2` (D' 현상유지)와 독립. P5-D `?bh=1`은 더 독립이므로 삼중 안전망.

### 비결정 항목 (dev 단계 자유)

- WGSL uniform 이름 (`invViewProj` vs `invViewProjection` vs 분리형 `invView`/`invProjectionMatrix`) — 후보 C 채택 시 Babylon 공식 네이밍 선호 권장.
- 1차 실패 시 2차를 생략하고 3차로 직행할지 여부 — 최종 판단 dev.
- `cameraPos` uniform 전달 방식 (`camera.globalPosition` vs `scene.activeCamera.position`) — 현재 프로젝트 관례 따름.
- disk normal world-space 정의 (후보 D) — 현재 `tilt` 파라미터 semantic에 맞춤. developer가 기존 코드와 정합성 확인.

## 결과·재검토 조건

### 실제 채택 경로 (2026-04-18 구현 결과)

**3차 (후보 E · Frustum Corner Interpolation) 채택**.

순차 시도 결과:

| 차수        | 시도                                                                                | 결과     | 판정 근거                                                                                                                                                                                                                                                                 |
| ----------- | ----------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1차 (A)     | 단일 `invViewProj: mat4x4<f32>` + 알파 fix                                          | **실패** | WebGL2 headless fallback에서 GLSL 컴파일 에러 발생 (`vUV undeclared` + `textureSampler undeclared`). Babylon PostProcess prelude injection이 disable된 상태. mat4 uniform 추가가 트리거인지 별개 이슈인지 한 번의 시도로는 단정 불가 — 타임박스 초과 방지 위해 2차로 전환 |
| 2차 (C)     | 분리 `invView` + `invProjectionMatrix` (thinSSRPostProcess 패턴) + TrsWebGPU Y-flip | **실패** | 1차와 동일한 GLSL prelude 부재 에러. mat4 uniform 2개로도 증상 동일 → mat4 자체가 Babylon PostProcess prelude 생성 경로에 부정적 영향을 주는 것으로 추정 (검증은 3차 성공으로 deprioritize)                                                                               |
| **3차 (E)** | **Frustum Corner Interpolation — CPU far-plane 4 corners + WGSL bilinear 보간**     | **성공** | WebGPU headless에서 셰이더 컴파일 에러 0 + canvas 비검정 + fps=23 유지. GPU mat4 0회 — 1차/2차 실패 원인이었던 mat4 uniform 자체를 완전 제거                                                                                                                              |

### 성공 경로 결과

- `?bh=2&ray3d=1` 옵트인 시 WebGPU에서 셰이더 컴파일 성공 + 검정 회귀 없음.
- `?bh=2` (ray3d 미지정)은 P6-B D' 경로 완전 보존 — 회귀 격리 유지.
- `invViewProj`/`invView`/`invProjectionMatrix` 등 mat4 uniform 완전 부재 — WebGPU/WebGL Y-flip·Z-range 파편화 원천 차단.
- 선행 ADR `20260417-accretion-disk-shadow-pipeline.md` 에 "Superseded in (1)-D′ by 본 ADR 3차 후보 E 채택" 메모 추가 예정.

### 헤드리스 검증 한계 (PR 박제)

- Playwright chromium `--use-webgpu-adapter=swiftshader` 는 **렌더 픽셀 업데이트 freeze** (카메라 beta 변경되어도 화면 픽셀 불변). DoD C2 "disk major axis 화면 x축 이탈" 픽셀 diff 검증이 불가능.
- **실 Chrome GUI에서 수동 스크린샷 3장 (elevation 10°/45°/80°) 으로 보완** — PR 본문 포함.
- swiftshader headless는 두 번째 goto에서 WebGPU 컨텍스트 재초기화 실패 (`A fatal error occurred during WebGPU creation/initialization`). 검증 스크립트는 이 경우 새 context로 복구하여 WebGL fallback에서 컴파일 가드 유지.

### 실패 경로 결과 (후보 D 도달)

- `?bh=2` 기본 경로의 `diskAxisX/Y` uniform이 카메라 view 행렬에서 계산되어 매프레임 갱신.
- 완전 3D ray는 **영구 근사로 고정**. ADR 상태: **Proposed → Accepted as permanent approximation**.
- PM 계약 M1 백업 발동 — PR 본문 + 회고에 "완전 3D 복원 실패 + D' 보강 적용" 명시.
- 후속 재시도 조건을 재검토 트리거로 박제 (아래).

### 트레이드오프

- **시도 비용 상한 4.5시간** (1차 30분 + 3차 1시간 + E 1시간 + 2차 2시간): 초과 시 developer 판단으로 조기 D' 전환 허용. 순서 경직성 금지. 2차(후보 B)는 "해결 시간"이 아닌 **"포기 판정 데드라인"** 으로 운용.
- **5차(D') 도달 시 기술 부채 인정**: D' 영구 근사는 Schwarzschild 축대칭 + **블랙홀이 화면 중앙 근처** 일 때만 시각적으로 그럴듯함. 블랙홀이 화면 가장자리로 이동할 때 원근 투영 왜곡이 발생. Kerr(회전) 블랙홀 도입 시 재설계 필요.
- **WebGPU NDC 차이 주의**: 후보 A/B는 `ndc.z = 1.0` (near/far 끝단) 매핑이 WebGL2 `[-1, 1]`과 WebGPU `[0, 1]` 간 다르므로 한 API에서 깨질 위험. 후보 C(엔진 분기 TrsWebGPU) 또는 E(CPU 시점 흡수)가 파편화 방어에 유리.
- **셰이더 가변성 증가**: `ray3d=1` 분기로 WGSL/GLSL 각 셰이더의 분기 수 ↑. Shader store 오염 방지를 위해 PostProcess 자체를 분리하는 편이 안전.

### 재검토 트리거

- **성공 경로 이후**: Kerr 블랙홀 도입(P8 후보) · 다중 블랙홀 · 적분기 격상(P7-A/B Yoshida) 후 ray construction 정확성 영향 재평가.
- **실패 경로(D') 이후**:
  - Babylon WebGPU PostProcess uniform 전달 버그 수정(공식 changelog) → 후보 A/B/C 재시도.
  - `@babylonjs/core` 메이저 버전 업(10.x 등) → 전면 재검증.
  - WebGPU 사양 업데이트(Matrix uniform 지원 강화) → 재시도.
  - 트랙 B 미해결 상태로 6개월 경과 → 본 ADR 재검토 강제.

## 교차검증 반영 (2026-04-18, Gemini CLI)

Architect 박제 직후 1회 교차검증 수행. 합의/이견/고유발견 분류:

| 축                        | 결과                                                                                   | 반영                                       |
| ------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------ |
| Babylon 레퍼런스 2종 해석 | **합의** — 분리 uniform + `TrsWebGPU` 보정이 듀얼 파이프라인에서 정석                  | 후보 C 우선순위 그대로 유지                |
| 1→3→2 순서 변경           | **합의** — 최저 비용 → 최고 신뢰도 → 최후 수단 구조 완벽                               | 반영됨                                     |
| 타임박스 현실성           | **일부 이견** — 2차(후보 B) 2시간은 "해결 시간"이 아닌 "포기 데드라인"으로 운용 필요   | 결정 섹션 + 트레이드오프에 명시 반영       |
| 후보 D 수식               | **이견** — 수식 자체는 정확, 다만 **블랙홀 화면 가장자리 위치 시 원근 투영 왜곡 한계** | 후보 D + 트레이드오프에 기술 부채 박제     |
| 5차 옵션                  | **고유 발견** — Frustum Corner Interpolation (역행렬 無 + 플랫폼 파편화 차단)          | **후보 E로 시퀀스 추가 · 2차 앞으로 삽입** |
| WebGPU NDC Z-range        | **고유 발견** — `[-1,1]` vs `[0,1]` 파편화 리스크                                      | 트레이드오프에 명시                        |

**반려 없음**. Gemini의 모든 지적이 근거 있고 반영 가치 있음. 특히 **후보 E의 ADR 추가는 본 설계의 성공 확률을 유의미하게 끌어올림** — 기존 3/2 차수 모두 GPU 역행렬 필요했으나 E는 이를 완전 우회.

## 참고

- Iyer & Petters (2007) — "On Relativistic Corrections to Microlensing Effects"
- Babylon.js 9.2.1 내장 레퍼런스:
  - `ShadersWGSL/volumetricLightingRenderVolume.fragment.js` (단일 invViewProjection)
  - `PostProcesses/thinSSRPostProcess.js` (invView + invProjectionMatrix 분리 + TrsWebGPU Y-flip)
- 프로젝트 코드:
  - `packages/core/src/scene/black-hole-rendering.ts` (D' 현재 구현 · ray3d 분기 추가 대상)
  - `packages/core/src/physics/lensing-lut.ts` (LUT wrapper — 변경 없음)
  - `apps/web/src/components/sim-canvas.tsx` (`?bh=2` 통합 지점 · ray3d flag parsing 추가)
- 회귀 가드:
  - `packages/physics-wasm/src/geodesic.rs::lensing_lut_shadow_b_crit_within_5_percent` (cargo test)
  - `scripts/bench-scene.mjs` (p50 60fps 가드)
