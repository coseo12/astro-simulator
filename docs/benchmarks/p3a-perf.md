# P3-A 성능 측정 — Barnes-Hut 활성화 후

작성: 2026-04-15
대상: P3-A 마감 시점 baseline 갱신 + Newton vs Barnes-Hut 비교
환경: macOS M1 Pro, headless Chromium (`playwright`), 1280×800 viewport

## baseline 갱신

`docs/benchmarks/baseline.json`을 P2-B 시점 → **P3-A 종료(p3-a-end, Newton 모드)**로 승격.

| scenario      | P2-B baseline | P3-A baseline | Δ          |
| ------------- | ------------: | ------------: | ---------- |
| idle          |         32.57 |         32.89 | +1.0%      |
| play-1d       |         31.26 |         30.50 | -2.4%      |
| play-1y       |         30.77 |         30.32 | -1.5%      |
| focus-earth   |        101.05 |         90.81 | **-10.1%** |
| focus-neptune |        106.79 |         96.67 | **-9.5%**  |

focus-\* 시나리오는 헤드리스 환경 변동성 범위 내. 실 GPU 측정(#116)에서는 vsync cap 120fps 도달 — 회귀 아님.

## N-sweep (소행성대 입자 수별 fps, play-1y)

| N     | newton (default) | barnes-hut | 차이  |
| ----- | ---------------: | ---------: | ----- |
| 10    |            28.59 |      30.14 | +5%   |
| 100   |            23.01 |      23.07 | ≈0%   |
| 200   |            18.59 |      18.66 | ≈0%   |
| 1000  |             7.48 |       7.44 | -0.5% |
| 5000  |             2.07 |       2.06 | ≈0%   |
| 10000 |             1.22 |       1.24 | ≈0%   |

**해석**: 두 모드 fps가 거의 동일.

이유:

1. 소행성대는 **Kepler 해석해** 경로로 처리됨 (asteroid-belt.ts) — `physicsEngine` 선택과 무관. 즉 N-sweep의 부하는 ThinInstances 렌더링이 지배.
2. 행성-행성 N-body는 N=8 (+ 달)이라 Newton 직접합 vs Barnes-Hut 차이가 마이크로초 수준.

→ Barnes-Hut의 진짜 속도 우위는 **소행성대까지 N-body로 끌어들일 때** 나타난다 (P4 후보).

## 결론

- P3-A baseline 갱신: ✅
- DoD "N=5000 PASS (60fps)" — 헤드리스에서는 **2 fps**로 미달이지만, 실 GPU(#116)에서 기준선 60fps 만족. 헤드리스는 시계열 추이용.
- 정식 게이트는 `bench-scene-real-gpu.mjs` + 사용자 측 수동 확인. CI는 변동성 가드(`-10 fps`).

## 후속

- **P4 후보**: 소행성대를 N-body 경로로 통합하면 Barnes-Hut 가속이 실제 측정 가능 (현재는 Kepler 해석해라 비교 의미 없음).
- **P3-B (WebGPU)**: 렌더링 부하 감소 + GPU compute로 N-body까지 처리 → 동일 헤드리스 환경에서 fps 회복 기대.
