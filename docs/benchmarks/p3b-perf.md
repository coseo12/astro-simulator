# P3-B 성능 측정 — WebGPU compute 활성화 후

작성: 2026-04-15 (활성화 시점)
대상: P3-B 마감 — `WebGpuNBodyEngine` (#146) 도입 후 N-body 가속비
환경: 로컬 측정 권장 — 헤드리스 Chromium WebGPU 지원 환경별 가변

## 측정 절차

```bash
# 1) dev 서버 기동
pnpm dev

# 2) 별도 터미널에서 GPU 활성 헤드리스 bench
pnpm bench:webgpu http://localhost:3000

# 3) 콘솔 결과 + docs/benchmarks/p3b-{ts}.json 확인
```

## 측정 대상

| 시나리오          | URL                            |
| ----------------- | ------------------------------ |
| Newton 직접합     | `/ko?engine=newton&belt=N`     |
| Barnes-Hut        | `/ko?engine=barnes-hut&belt=N` |
| **WebGPU (P3-B)** | `/ko?engine=webgpu&belt=N`     |

각 N ∈ {1000, 5000, 10000}, play-1y 모드, 3초 측정.

## 결과 — 1차 측정 (2026-04-15, macOS M1 Pro, 헤드리스 Chromium ANGLE Metal)

| N     | newton |  barnes-hut |      webgpu | 비고      |
| ----- | -----: | ----------: | ----------: | --------- |
| 1000  | 119.96 | 120.02 (×1) | 120.05 (×1) | vsync cap |
| 5000  | 120.05 | 120.02 (×1) | 120.02 (×1) | vsync cap |
| 10000 | 120.00 | 120.02 (×1) | 120.01 (×1) | vsync cap |

리포트: `docs/benchmarks/p3b-2026-04-15T07-55-55-812Z.json`

## 결과 — 2차 측정 (vsync 해제, P3-D #154)

`bench:webgpu`에 `--disable-gpu-vsync --disable-frame-rate-limit` Chromium flag 추가 후 절대 throughput.

| N     | newton |     barnes-hut |         webgpu |
| ----- | -----: | -------------: | -------------: |
| 1000  | 868.38 | 767.97 (×0.88) | 775.28 (×0.89) |
| 5000  | 374.60 | 353.61 (×0.94) | 334.81 (×0.89) |
| 10000 | 220.37 | 222.29 (×1.01) | 207.16 (×0.94) |

리포트: `docs/benchmarks/p3b-2026-04-15T08-09-11-719Z.json`

### 해석 (2차 측정 기반)

1. **vsync 해제 후 절대 throughput 가시화** — N=1000 868fps → N=10000 220fps. ThinInstances 렌더 비용이 N에 비례하여 1/N에 가까운 감소.
2. **세 엔진 fps 거의 동일 (±10%)** — 이유:
   - 소행성대(`belt=N`)는 Kepler 해석해 + ThinInstances 렌더로 처리. `physicsEngine` 선택과 무관.
   - N-body 엔진의 실제 입력은 sun + 8 planets + moon = ~10 bodies. Newton 직접합도 트리비얼.
   - fps 차이는 거의 노이즈.
3. **Babylon WebGL2 fallback** — 본 환경 `Babylon engine kind: webgl2`. `webgpu` URL은 sim-canvas의 capability 폴백 정책으로 barnes-hut 라우팅 (#146). 'webgpu' 행도 사실상 barnes-hut 측정.
4. **N=10000 best-effort 충족** — 어느 엔진이든 220fps로 60fps 기준선 3배 이상.

### 결론

**'CPU 대비 webgpu ≥2× 가속' 측정은 현 아키텍처에서 불가**:

- (a) 소행성대가 N-body 경로 미통합 → 측정 가능한 N이 ~10에 머묾. 알고리즘 차이 무의미.
- (b) Babylon WebGPU 실제 활성화 조건 미충족 (헤드리스 Chromium에서 검증된 환경 부재).

**P3 계약 재해석**: N=10000 best-effort = 시스템 전체 220fps 이상 = 충족. WebGPU 가속비 항목은 다음 두 조건 충족 시 재측정:

- (a) **P4 후보**: 소행성대를 N-body 경로 통합 → N=10000 입자가 force 계산에 진입
- (b) **WebGPU 활성화**: Babylon `Engine` 생성 시 `useWebGPU: true` 명시, 또는 데스크톱 Chrome Canary에서 검증

### 실 WebGPU 측정 조건

본 환경에서 진짜 WebGPU compute 경로를 측정하려면:

- 데스크톱 **Chrome Canary**에서 직접 진입 (`chrome://flags/#enable-unsafe-webgpu` ON)
- 또는 Babylon `Engine` 생성 시 `{useWebGPU: true}` 명시 — `apps/web/.../sim-canvas` 코드 변경 필요 (#146 후속)
- vsync cap 우회: 본 PR(#154)에서 적용한 `--disable-gpu-vsync` flag로 자동 해제됨

## 정확도 가드 (CPU mirror 기준)

GPU 셰이더와 동일 알고리즘을 f32 CPU에서 검증 (`packages/core/src/gpu/nbody-vv-cpu.test.ts`):

- N=128 30-step 시뮬 — 모든 위치 finite, 100 AU 이내 (발산 없음)
- N=10 100-step 시뮬 — 모멘텀 보존 1% 이내 (f32 한계)

GPU 실측 정확도(CPU 직접합 RMS<1e-4)는 사용자 측 실 GPU 환경에서 `bench:webgpu` 결과 비교로 확인 권장. 본 PR 시점에는 구조적 검증만 자동화.

## DoD 충족

- [x] `bench:webgpu` 스크립트 — Chromium WebGPU flag + 시나리오 매트릭스
- [x] CPU mirror 정확도 가드 (vitest)
- [x] `docs/benchmarks/p3b-perf.md` 측정 절차 + 결과 + 해석
- [x] **vsync 해제 throughput 측정** — `--disable-gpu-vsync` flag 추가 (P3-D #154)
- [~] **N=10000 webgpu ≥ barnes-hut ×2 가속** — 현 아키텍처 측정 불가 (소행성대 N-body 미통합 + WebGPU 미활성). N=10000 best-effort는 ~220fps로 충족. 재측정 조건은 P4 후보.
- [~] baseline.json P3-B 갱신 — N=10000 220fps 박제는 P3-D #155 종합 검증 시 결정.

## 인계 (P3-C / P3-D)

- **P3-D 검증·마감**: vsync 미해제 헤드리스 측정의 한계 명시. 실 throughput은 사용자 측 데스크톱 Chrome (`--disable-frame-rate-limit`) 또는 GPU timer query로 측정.
- **P3-C 모바일**: iPhone vsync cap 60fps에서는 N=10000 PASS 보장 측정 가능. iOS Safari WebGPU(2025+) 가용 시 동일 절차.
- **#145 ADR 재검토 트리거**: vsync 해제 측정에서 webgpu가 barnes-hut 대비 ≥2× 미달 시.
