# ADR: 중력렌즈 시각화 — PostProcess fragment shader 접근

- 일자: 2026-04-17
- 상태: Superseded by [`20260417-accretion-disk-shadow-pipeline.md`](./20260417-accretion-disk-shadow-pipeline.md) (P6-B #190)
- 관련: P5-D #180

> **Superseded 메모 (2026-04-17, P6-B 설계)**: 본 ADR의 화면공간 thin-lens 근사는 P6-A
> (`20260417-geodesic-solver.md`)에서 도입한 정확한 광선 geodesic 솔버 + P6-B의
> LUT-기반 파이프라인으로 대체된다. P5-D 코드(`createGravitationalLensing`,
> `?bh=1`)는 회귀 가드용으로 보존되며, 신규 정확 파이프라인은 `?bh=2` 옵트인으로
> 제공된다. Draft 상태로 남았던 shader 패스스루 이슈는 sim-canvas 통합(`?bh=1`)
> 검증 + P5 회고에서 사실상 해소되었다.

## 배경

블랙홀 근처에서 빛의 휘어짐(gravitational lensing)을 시각화한다.
P4 WebGPU compute 인프라 재활용 가능성 검토 후, **PostProcess fragment shader**가
이 케이스에 더 적합하다고 판단.

## 후보

| 항목         | A: PostProcess fragment | B: Compute shader → 렌더 텍스처 | C: 3D ray marching |
| ------------ | ----------------------- | ------------------------------- | ------------------ |
| 구현 복잡도  | 낮음                    | 중간 (텍스처 복사 필요)         | 높음               |
| 픽셀별 처리  | 자연스러움              | 간접 (storage buffer → 복사)    | 자연스러움         |
| Babylon 통합 | PostProcess API 표준    | Compute API 비표준 용법         | 커스텀             |
| 물리 정확도  | 화면 공간 근사          | 화면 공간                       | 3D geodesic        |

## 결정

**A (PostProcess fragment shader) 채택.**

이유:

1. Babylon PostProcess API가 카메라에 자동 바인딩 — 라이프사이클 관리 단순
2. 픽셀별 UV 왜곡은 fragment shader의 자연스러운 용법
3. Compute shader → 렌더 텍스처 복사는 불필요한 오버헤드

## 구현 (MVP)

- `packages/core/src/scene/gravitational-lensing.ts` — PostProcess + 블랙홀 메쉬
- GLSL fragment shader: `Effect.ShadersStore`에 인라인 등록
- Schwarzschild weak-field deflection: `α = 2Rs/b`
- Einstein ring 하이라이트 (smoothstep)
- URL `?bh=1&bhx=N&bhy=N&bhz=N` 옵트인

## 미해결

**shader 패스스루 이슈**: Babylon WebGPU 엔진에서 GLSL PostProcess의 `textureSampler`
바인딩이 올바르게 동작하지 않아 원래 씬이 렌더되지 않음. 원인 후보:

1. GLSL → WGSL 자동 변환 시 `texture2D` → `textureSample` 매핑 실패
2. WebGPU에서 PostProcess 입력 텍스처 바인딩 경로 차이
3. `vUV` varying이 WebGPU PostProcess에서 자동 제공되지 않을 가능성

**후속 작업**:

- [ ] WebGL2 경로(`engine=kepler`, WebGPU 미사용)에서 동일 shader 테스트
- [ ] Babylon WebGPU PostProcess 예제 코드 참조 (WGSL 직접 작성 가능성)
- [ ] `textureSampler` 대신 Babylon의 `textureSampler` auto-binding 규약 확인

## 재검토 조건

- shader 디버깅 완료 후 본 ADR을 **Accepted**로 전환
- WebGPU 전용 WGSL shader가 필요하다면 dual shader path 추가
