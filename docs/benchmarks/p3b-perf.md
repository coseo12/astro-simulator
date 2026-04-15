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

## 결과 (실 GPU 환경 측정 후 갱신)

| N     | newton | barnes-hut (×) | webgpu (×) |
| ----- | -----: | -------------: | ---------: |
| 1000  |    TBD |            TBD |        TBD |
| 5000  |    TBD |            TBD |        TBD |
| 10000 |    TBD |            TBD |        TBD |

> ⚠ 헤드리스 Chromium은 WebGPU가 환경별로 비활성. macOS Metal/Linux Vulkan/Windows DXC 별 가용성 다름. 실 측정은 데스크톱 Chrome(canary)에서 사용자 측 진행 권장.

## 정확도 가드 (CPU mirror 기준)

GPU 셰이더와 동일 알고리즘을 f32 CPU에서 검증 (`packages/core/src/gpu/nbody-vv-cpu.test.ts`):

- N=128 30-step 시뮬 — 모든 위치 finite, 100 AU 이내 (발산 없음)
- N=10 100-step 시뮬 — 모멘텀 보존 1% 이내 (f32 한계)

GPU 실측 정확도(CPU 직접합 RMS<1e-4)는 사용자 측 실 GPU 환경에서 `bench:webgpu` 결과 비교로 확인 권장. 본 PR 시점에는 구조적 검증만 자동화.

## DoD 충족

- [x] `bench:webgpu` 스크립트 — Chromium WebGPU flag + 시나리오 매트릭스
- [x] CPU mirror 정확도 가드 (vitest)
- [x] `docs/benchmarks/p3b-perf.md` 측정 절차 + 결과 템플릿
- [ ] **N=10000 webgpu ≥ barnes-hut ×2 가속** — 실 GPU 환경에서 측정 후 본 문서 갱신
- [ ] baseline.json P3-B 갱신 — 실 GPU 측정 후

## 인계 (P3-C / P3-D)

- 본 측정 후 baseline.json을 P3-B로 승격
- N=10000에서 webgpu가 barnes-hut 대비 ≥2× 미달 시 #145 ADR 재검토 (정밀도 보전 vs 가속비 trade-off)
- P3-C 모바일에서는 iOS Safari WebGPU(2025+ 지원) 별도 측정 필요
