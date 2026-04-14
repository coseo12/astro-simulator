# P2-D 실 브라우저 성능 (#116)

## 요약

**실 GPU 환경에서 N=1000 소행성대 포함 시나리오가 display refresh rate 한계(120 Hz)에 도달.**
헤드리스 swiftshader(소프트웨어 렌더) 대비 극적인 차이.

## 측정

환경: macOS, Apple M1 Pro (ANGLE Metal Renderer), Chromium headless + GPU flags

| 시나리오      | FPS        |
| ------------- | ---------- |
| /ko (기본)    | **120.05** |
| /ko?belt=200  | **120.08** |
| /ko?belt=1000 | **120.07** |

> 120 fps는 디스플레이 vsync 상한 — 실제 여유 성능은 훨씬 더 있음. vsync 미적용 기준 측정은 환경 제어 한계로 생략.

## 헤드리스(기본) vs 실 GPU 비교

| 시나리오      | 헤드리스 (baseline.json) | 실 GPU  | 배수  |
| ------------- | ------------------------ | ------- | ----- |
| /ko idle      | 32.43 fps                | 120 fps | ×3.7  |
| /ko?belt=200  | 19.71 fps                | 120 fps | ×6.1  |
| /ko?belt=1000 | 7.70 fps                 | 120 fps | ×15.6 |

belt=1000에서 16배 차이 — ThinInstances의 GPU 병렬 처리 효과가 결정적.

## P2-D 성능 목표 평가

**스프린트 계약 (P2-D): N=200 60fps 보장, N=1000 best-effort**

- ✅ **N=200**: 실 GPU 120fps (목표 60fps의 2배)
- ✅ **N=1000**: 실 GPU 120fps (목표 best-effort 상회)

JS Kepler `positionAt` × N 프레임 비용은 모바일 저사양 기기에서 여전히 병목 가능성 — P3 WASM Kepler batch 또는 GPU compute로 재검토.

## 재현

```bash
# 앱 서버 기동
pnpm -C apps/web build
PORT=3001 pnpm -C apps/web start

# 실 GPU 벤치
node scripts/bench-scene-real-gpu.mjs
```

리포트: `docs/benchmarks/p2d-real-gpu.json` (JSON) + `docs/benchmarks/p2d-perf.md` (본 문서)

## 한계 및 후속

- macOS + Chromium 조합에서만 측정 — Linux/Windows + NVIDIA·AMD 조합은 별도 필요.
- 120 Hz vsync cap 탓에 실제 여유 성능 미측정.
  `page.evaluate` 내에서 vsync 우회(setInterval off-frame)로 RMS step time 측정하는 방식으로 확장 가능.
- 모바일(iOS Safari, Android Chrome) 측정은 P3 이후 별도 스프린트로 분리.
