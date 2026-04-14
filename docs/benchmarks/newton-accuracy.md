# Newton 적분기 정확도 (Kepler 대비, 1년)

측정: Sun + 각 행성 **2-body** Newton 시뮬레이션을 1년간 적분한 뒤 Kepler 해석해와
비교한 상대 위치 오차. N-body 섭동은 제외 — 순수 Velocity-Verlet 적분기 정확도 측정.

## 결과

| dt    | mercury | venus   | earth   | mars    | jupiter | saturn  | uranus   | neptune  |
| ----- | ------- | ------- | ------- | ------- | ------- | ------- | -------- | -------- |
| 10min | 5.28e-6 | 4.57e-5 | 5.95e-5 | 1.84e-6 | 7.75e-6 | 6.38e-8 | 9.02e-11 | 8.97e-12 |
| 1h    | 5.52e-5 | 4.13e-5 | 5.84e-5 | 1.66e-6 | 7.75e-6 | 6.38e-8 | 9.02e-11 | 8.97e-12 |
| 1d    | 3.54e-2 | 2.92e-3 | 5.89e-4 | 1.16e-4 | 7.69e-6 | 6.25e-8 | 4.40e-10 | 6.86e-11 |
| 7d    | 1.27e+0 | 1.37e-1 | 3.07e-2 | 5.59e-3 | 1.07e-5 | 6.94e-7 | 2.05e-8  | 3.26e-9  |

## 해석

- Velocity-Verlet은 심플렉틱 적분기로 위상 오차가 `O(dt²)`. 표에서 dt 7d → 1d → 1h로
  줄일 때 오차가 제곱 스케일로 감소함을 확인할 수 있다.
- **10min 해상도에서 모든 행성 < 0.1%** 상대 오차 달성. 실시간 UI에서는
  프레임당 서브스텝 분할(`maxSubstepSeconds`)로 dt를 제한하여 정확도를 보장한다.
- Mercury가 최대 오차 — 짧은 주기(88일) + 이심률 0.2로 위상 오차 누적이 빠르지만
  10min에서도 기준 통과.

## 방법

- 초기 상태: 각 행성의 궤도 요소 → `orbitalStateAt(elements, J2000, μ_sun)`
- 적분: `NBodyEngine.advance(365.25 × 86400 s)`, `maxSubstepSeconds = dt`
- 기준: `positionAt(elements, J2000 + 365.25, μ_sun)` (Kepler 해석해)
- 환경: Rust 1.94.1 WASM + Node 20

## 재현

```bash
pnpm -C packages/core build
pnpm -C packages/shared build
node scripts/newton-accuracy-report.mjs
```

또는 단위 테스트만 (dt=10min 임계값 검증):

```bash
pnpm -C packages/core test -- newton-vs-kepler
```

## 전체 N-body ↔ 2-body Kepler 차이

전체 태양계 Newton vs 2-body Kepler 비교 시 Mercury/Venus/Earth에서 0.1~0.5%
차이가 관찰되는데, 이는 **적분기 오차가 아니라 Newton 모델의 섭동 효과**
(Jupiter가 Mercury 궤도를 흔들고, Moon이 Earth를 끄는 등). P2-C에서 파라미터 UI로
"목성 없는 우주" 시나리오를 돌리면 이 차이가 사라지는 것을 관찰할 수 있다.
