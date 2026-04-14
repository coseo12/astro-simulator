# @astro-simulator/core

순수 TypeScript 시뮬레이션 코어.

## 설계 원칙

- **UI 프레임워크 의존성 제로** — React, Next.js, Vue 등 어떤 UI 계층과도 무관
- **Babylon.js만 peer dependency** — 렌더링 엔진 외 외부 의존성 최소화
- **Framework-agnostic** — 순수 캔버스 요소만 받아 동작. 어떤 UI 스택에서도 사용 가능
- **GPU-resident state** — 고빈도 업데이트는 GPU 버퍼에 상주, CPU readback 최소화

## 모듈 구성

| 모듈 | 역할 | 구현 Phase |
|---|---|---|
| `coords` | Floating Origin, RTE 좌표 변환 (CPU float64 ↔ GPU float32) | B4 |
| `physics` | Kepler 해석해, 심플렉틱 적분기, 상대론 효과 | C2, P2, P4 |
| `scene` | Babylon 씬/카메라/천체 메쉬 | B1, B3, C3, C6 |
| `gpu` | WebGPU Compute 래퍼 | P3 |
| `ephemeris` | JPL Horizons 데이터, 시간 시스템 | C1, C5 |

## 원칙

이 패키지 내에서는 다음을 **금지**한다 (ESLint로 강제 — A6):

- `react`, `react-dom`, `next/*` import
- DOM 전역 객체 직접 접근 (canvas 주입만 받음)
- 동기적 무한 루프 (requestAnimationFrame 경유)

## 빌드

```bash
pnpm --filter @astro-simulator/core build
```
