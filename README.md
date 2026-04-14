# astro-simulator

웹 기반 천체물리 시뮬레이터 — Babylon.js WebGPU 기반 멀티스케일 우주 탐험.

태양계를 기점으로 근거리 항성, 은하, 관측가능우주까지 연속 스케일로 탐험 가능하며, 관측 데이터 기반의 정확성과 가상 실험의 자유도를 동시에 제공한다.

---

## 지향점

- **교육 도구** — 정확한 시각화로 천체물리 개념 전달
- **연구 시각화** — 실제 카탈로그 기반 데이터 탐색
- **몰입형 탐험** — 스케일 연속성, 시각적 완성도
- **물리 샌드박스** — 사용자 실험, 가상 시나리오

---

## 기술 스택

| 영역 | 선택 |
|---|---|
| 렌더 엔진 | Babylon.js (WebGPU-first, WebGL2 폴백) |
| UI 프레임워크 | Next.js (App Router) |
| 언어 | TypeScript |
| 패키지 매니저 | pnpm (workspace 모노레포) |
| 상태 관리 | Zustand + nuqs + mitt + TanStack Query + zod |
| 스타일 | Tailwind + Radix Primitives + CVA |
| 애니메이션 | Framer Motion (LazyMotion) |
| 테스트 | Vitest + Playwright |

---

## 아키텍처 원칙

- **이중 레이어 분리** — 순수 TS 시뮬레이션 코어 + Next.js UI 레이어
- **좌표계** — CPU float64 월드 + GPU RTE(Relative-to-Eye) float32
- **물리 적분기** — Leapfrog/Verlet 심플렉틱 (에너지 보존)
- **GPU 전략** — GPU-resident state, readback 최소화

상세: [`docs/phases/architecture.md`](./docs/phases/architecture.md)

---

## 프로젝트 구조

```
/apps
  /web                  Next.js 애플리케이션 (UI 레이어)
/packages
  /core                 @astro-simulator/core — 순수 TS 시뮬레이션 코어
  /shared               공용 타입/상수/이벤트 정의
/docs
  /phases               기획/아키텍처/Phase 문서
```

---

## 시작하기

### 요구사항

- Node.js 20 이상 (권장: 24.14)
- pnpm 9 이상 (권장: 10.32)

### 설치

```bash
pnpm install
```

### 개발

```bash
pnpm dev          # /apps/web 개발 서버
pnpm build        # 전체 빌드
pnpm typecheck    # 타입 체크
pnpm test         # 테스트
pnpm lint         # 린트
```

---

## 로드맵

- **P1 — 태양계 MVP** (Kepler 해석해, 8행성 + 달)
- **P2 — N-body 전환** (심플렉틱 적분기, 소행성/혜성)
- **P3 — WebGPU Compute** (카이퍼대/오르트 구름)
- **P4 — 근거리 항성 + 상대론** (Gaia DR3, 블랙홀 렌징)
- **P5 — 항성 진화 + 외계행성**
- **P6 — 은하·은하단**
- **P7 — 관측가능우주**
- **P8 — 물리 샌드박스 확장**

상세: [`docs/phases/roadmap.md`](./docs/phases/roadmap.md)

---

## 문서

- [개발 기획서](./docs/phases/product-spec.md)
- [아키텍처](./docs/phases/architecture.md)
- [디자인 토큰](./docs/phases/design-tokens.md)
- [UI 아키텍처](./docs/phases/ui-architecture.md)
- [확장 로드맵](./docs/phases/roadmap.md)
- [P1 스프린트 계약](./docs/phases/P1-solar-system-mvp.md)

---

## 라이선스

MIT
