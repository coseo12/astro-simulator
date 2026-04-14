# 소행성대 N 스윕 (#99)

`bench:scene`을 `BENCH_PATH=/ko?belt=N` 로 실행한 결과. baseline은 belt 없는 P2-0 캡처(`baseline.json`).

## 환경

- Playwright Chromium **headless** (GPU 가속 없음 — JS/CPU 한계)
- 1280×800
- 측정 윈도우 3000ms × 5 시나리오

## 결과

| 시나리오      | baseline | N=100        | N=200        | N=1000          |
| ------------- | -------- | ------------ | ------------ | --------------- |
| idle          | 38.96    | 24.50 (-37%) | 19.71 (-49%) | **7.70 (-80%)** |
| play-1d       | 38.53    | 23.00 (-40%) | 19.12 (-50%) | 7.53 (-81%)     |
| play-1y       | 38.75    | 23.51 (-39%) | 19.70 (-49%) | 7.54 (-81%)     |
| focus-earth   | 100.53   | 99.41        | 90.57        | 97.52           |
| focus-neptune | 108.28   | 104.88       | 104.89       | 103.57          |

> Focus 시나리오에서 fps가 크게 떨어지지 않는 이유: 카메라가 한 천체에 매우 가까워 view frustum 밖 인스턴스가 컬링됨. 렌더링 비용이 아니라 **per-frame Kepler 계산 + matrix buffer write** 가 병목임을 시사.

## 해석

- 헤드리스 환경 한계가 큼. **실 브라우저에서는 GPU instancing** 으로 훨씬 나음 — P2-D에서 실 브라우저 측정 별도.
- 병목은 1) JS Kepler `positionAt` × N, 2) `thinInstanceBufferUpdated` 매 프레임 GPU 업로드.
- 후속 최적화 후보 (P2-D 또는 P3):
  - WASM Kepler batch (`packages/physics-wasm` 확장)
  - 매 프레임이 아닌 매 N프레임 업데이트 (소행성 위치는 분 단위로 거의 변하지 않음)
  - GPU compute shader로 위치 계산

## 권장 N (P2-B 단계)

- 기본값 0 (생성 안 함) — UX 영향 없음
- 시각 데모: ?belt=200 권장 (실 브라우저에서 60fps 기대)
- 부하 테스트: ?belt=1000 (현재는 헤드리스 8fps)
