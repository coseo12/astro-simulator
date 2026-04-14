# astro-simulator

웹 기반 천체물리 시뮬레이터 — Babylon.js WebGPU 기반 멀티스케일 우주 탐험.

태양계를 기점으로 근거리 항성, 은하, 관측가능우주까지 연속 스케일로 탐험 가능하며, 관측 데이터 기반의 정확성과 가상 실험의 자유도를 동시에 제공한다.

![Solar System](./docs/screenshots/01-solar-system.png)

---

## 현재 상태

**v0.1.0-p1** — P1 태양계 MVP 완료 (2026-04-14)

- 태양 + 행성 8개 + 달, J2000 기준 Kepler 해석해
- 시간 제어 (재생/역행/×1~×10y 프리셋)
- 카메라 포커스 전환 애니메이션
- 4모드 UI 프레임 (관찰/연구 활성, 교육/샌드박스 P2+)

## 스크린샷

| 전체 태양계                                 | 지구 포커스                                | 해왕성 30 AU                           | 모바일 480×900                        |
| ------------------------------------------- | ------------------------------------------ | -------------------------------------- | ------------------------------------- |
| ![](./docs/screenshots/01-solar-system.png) | ![](./docs/screenshots/02-earth-focus.png) | ![](./docs/screenshots/03-neptune.png) | ![](./docs/screenshots/04-mobile.png) |

---

## 지향점

- **교육 도구** — 정확한 시각화로 천체물리 개념 전달
- **연구 시각화** — 실제 카탈로그 기반 데이터 탐색
- **몰입형 탐험** — 스케일 연속성, 시각적 완성도
- **물리 샌드박스** — 사용자 실험, 가상 시나리오

---

## 기술 스택

| 영역          | 선택                                         |
| ------------- | -------------------------------------------- |
| 렌더 엔진     | Babylon.js (WebGPU-first, WebGL2 폴백)       |
| UI 프레임워크 | Next.js 16 (App Router)                      |
| 언어          | TypeScript (strict + exactOptional)          |
| 패키지 매니저 | pnpm 10 (workspace 모노레포)                 |
| 상태 관리     | Zustand + nuqs + mitt + TanStack Query + zod |
| 스타일        | Tailwind v4 + Radix Primitives + CVA         |
| 애니메이션    | Framer Motion (LazyMotion)                   |
| 테스트        | Vitest + Playwright + @axe-core/playwright   |

---

## 아키텍처 원칙

- **이중 레이어 분리** — 순수 TS 시뮬레이션 코어 + Next.js UI 레이어
- **좌표계** — CPU float64 월드 + GPU RTE(Relative-to-Eye) float32
- **물리 적분기** — Leapfrog/Verlet 심플렉틱 (P2+, P1은 Kepler 해석해)
- **GPU 전략** — GPU-resident state, readback 최소화
- **데이터 신뢰성 Tier** — 모든 수치에 T1(관측)~T4(예술) 배지

상세: [`docs/phases/architecture.md`](./docs/phases/architecture.md)

---

## 프로젝트 구조

```
/apps
  /web                  Next.js 애플리케이션 (UI 레이어)
/packages
  /core                 @astro-simulator/core — 순수 TS 시뮬레이션 코어
                        (engine/coords/physics/scene/ephemeris/time/gpu)
  /shared               공용 타입/상수/이벤트 정의
/docs
  /phases               기획/아키텍처/Phase 문서
  /retrospectives       Phase 회고 + 성능/접근성/호환성 보고서
  /screenshots          릴리스 스크린샷
/scripts                검증 스크립트 (browser-verify-*.mjs)
```

---

## 시작하기

### 요구사항

- Node.js 20 이상 (권장: 24)
- pnpm 10 이상

### 설치 및 실행

```bash
pnpm install
pnpm dev        # apps/web 개발 서버 → http://localhost:3000
```

### 스크립트

```bash
# 개발
pnpm dev                  # Next.js dev server
pnpm build                # 전체 빌드 (core, shared, web)
pnpm typecheck            # 타입 체크
pnpm lint                 # ESLint
pnpm test                 # Vitest 전체 (core + shared + web)
pnpm format               # Prettier 포맷

# 브라우저 검증 (CRITICAL #3 준수)
pnpm verify:browser       # 데스크톱 1280×800 — 3단계 검증
pnpm verify:mobile        # 모바일 480×900
pnpm verify:scale         # 스케일 전환 (태양~해왕성)
pnpm verify:perf          # FPS 측정 (5 시나리오)
pnpm verify:a11y          # axe-core + 키보드 + 색약
pnpm verify:all           # 위 5개 순차 실행
```

---

## 테스트 현황

- **단위 테스트**: 130개 통과
  - core: 89 (coords, physics, ephemeris, scene, time)
  - shared: 4 (astronomy 상수)
  - web: 37 (store, hooks, UI 컴포넌트)
- **E2E (Playwright)**:
  - verify:browser — 25 PASS
  - verify:mobile — 7 PASS
  - verify:scale — 9 PASS
  - verify:a11y — 8 PASS (axe 위반 0건)
- **성능 (headless)**:
  - 정지/재생 36~38 FPS
  - 포커스 상태 90+ FPS
  - 실제 브라우저 60 FPS 기대

---

## 로드맵

- **P1 — 태양계 MVP** ✅ (Kepler 해석해, 8행성 + 달)
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

### 기획

- [개발 기획서](./docs/phases/product-spec.md)
- [아키텍처 결정서](./docs/phases/architecture.md)
- [디자인 토큰](./docs/phases/design-tokens.md)
- [UI 아키텍처](./docs/phases/ui-architecture.md)
- [확장 로드맵](./docs/phases/roadmap.md)

### Phase별

- [P1 스프린트 계약](./docs/phases/P1-solar-system-mvp.md)

### 회고/보고서

- [P1 성능 측정](./docs/retrospectives/P1-perf.md)
- [P1 접근성](./docs/retrospectives/P1-a11y.md)
- [P1 브라우저 호환성](./docs/retrospectives/P1-browser-compat.md)
- [P1 회고](./docs/retrospectives/P1-retrospective.md)

---

## 데이터 출처

- **궤도 요소**: Standish 1992 mean elements (JPL)
- **천문학 상수**: CODATA 2018, IAU 2012
- **Tier 1 표기**: 모든 수치가 관측/표준 레퍼런스 기반

이후 단계에서 JPL Horizons API, NASA Exoplanet Archive, Gaia DR3 추가 예정.

---

## 라이선스

MIT
