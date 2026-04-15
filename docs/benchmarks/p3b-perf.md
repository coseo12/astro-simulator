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

### 해석

1. **세 엔진 모두 vsync cap (120fps) 도달** — N=10000까지 GPU 한계 미달. 직접합 N=10000에서도 절대 여유 있음을 시사.
2. **WebGPU vs Barnes-Hut 가속비 측정 불가** — Babylon이 본 환경에서 WebGL2 fallback 사용 (`Babylon engine kind: webgl2`). `webgpu` URL 진입 시 sim-canvas의 capability 폴백 정책에 의해 barnes-hut로 분기 (P3-B #146). 따라서 'webgpu' 행도 사실상 barnes-hut.
3. **소행성대가 부하 지배** — N-sweep fps가 엔진 무관한 것은 P3-A에서 확인된 바와 동일 (asteroid belt가 Kepler 해석해 + ThinInstances 렌더링).

### 실 WebGPU 측정 조건

본 환경에서 진짜 WebGPU compute 경로를 측정하려면:

- 데스크톱 **Chrome Canary**에서 직접 진입 (`chrome://flags/#enable-unsafe-webgpu` ON)
- 또는 Babylon \`Engine\` 생성 시 \`{useWebGPU: true}\` 명시 — `apps/web/.../sim-canvas` 코드 변경 필요 (#146 후속)
- vsync cap 우회: Chrome `--disable-frame-rate-limit` 또는 GPU 시간 직접 측정 (`@babylonjs/core/Misc/timingTools`)

**현 상태**에서 P3 계약 "N=10000 best-effort"는 vsync cap 120fps로 충족됨 (CPU/GPU 어느 경로든). "CPU 대비 webgpu ≥2× 가속"은 vsync 미해제 환경에서 측정 불가 — 절대 throughput으로 평가해야 의미 있음.

## 정확도 가드 (CPU mirror 기준)

GPU 셰이더와 동일 알고리즘을 f32 CPU에서 검증 (`packages/core/src/gpu/nbody-vv-cpu.test.ts`):

- N=128 30-step 시뮬 — 모든 위치 finite, 100 AU 이내 (발산 없음)
- N=10 100-step 시뮬 — 모멘텀 보존 1% 이내 (f32 한계)

GPU 실측 정확도(CPU 직접합 RMS<1e-4)는 사용자 측 실 GPU 환경에서 `bench:webgpu` 결과 비교로 확인 권장. 본 PR 시점에는 구조적 검증만 자동화.

## DoD 충족

- [x] `bench:webgpu` 스크립트 — Chromium WebGPU flag + 시나리오 매트릭스
- [x] CPU mirror 정확도 가드 (vitest)
- [x] `docs/benchmarks/p3b-perf.md` 측정 절차 + 결과 + 해석
- [~] **N=10000 webgpu ≥ barnes-hut ×2 가속** — vsync cap(120fps) 도달로 측정 환경에서는 구분 불가. N=10000 best-effort 자체는 충족.
- [~] baseline.json P3-B 갱신 — vsync cap fps는 의미 적어 이연. P3-D에서 throughput 측정 도구 마련 후 결정.

## 인계 (P3-C / P3-D)

- **P3-D 검증·마감**: vsync 미해제 헤드리스 측정의 한계 명시. 실 throughput은 사용자 측 데스크톱 Chrome (`--disable-frame-rate-limit`) 또는 GPU timer query로 측정.
- **P3-C 모바일**: iPhone vsync cap 60fps에서는 N=10000 PASS 보장 측정 가능. iOS Safari WebGPU(2025+) 가용 시 동일 절차.
- **#145 ADR 재검토 트리거**: vsync 해제 측정에서 webgpu가 barnes-hut 대비 ≥2× 미달 시.
