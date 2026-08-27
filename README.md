# astro-simulator

웹 기반 천체물리 시뮬레이터 — Babylon.js WebGPU 기반 멀티스케일 우주 탐험.

태양계를 기점으로 근거리 항성, 은하, 관측가능우주까지 연속 스케일로 탐험 가능하며, 관측 데이터 기반의 정확성과 가상 실험의 자유도를 동시에 제공한다.

**🌐 라이브 데모: <https://astro-simulator-web.vercel.app>**

![Solar System](./docs/screenshots/01-solar-system.png)

---

## 현재 상태

**v0.80.0** — 로드맵 v3 (Incremental Body-by-Body Build) 완주 + 트랙 A/B (몰입·온보딩). v0.79.1 이 **가드가 실제로 무엇을 재고 있었나**였다면 v0.80.0 은 **고치려는 쪽이 원인일 때**다. 두 건이 같은 형태다 — 카메라가 고정인데 자전만으로 표면 마스크가 켜졌다 꺼진 것은 판정 반경이 회전하는 mesh 의 외접 상자에서 나와 **자전 위상의 함수**였기 때문이고, Amendment 4 가 없애려던 shimmer 를 그 판정 입력이 스스로 만들고 있었다(#1157). `clean && build` 가 exit `0` 인 채 빈 `dist` 를 남긴 것은 `clean` 이 `composite` 프로젝트의 실제 빌드 정보 파일이 아니라 **존재하지 않는 경로**를 지웠기 때문이고, dist stale 을 치료하려고 밟는 절차가 정확히 그 stale 을 만들었다(#1166). (2026-08-27)

> **고치려고 밟은 절차라서 더 안심하게 된다** — 빈 `dist` 는 exit `0` 이었고, 서버를 재기동하지 않으면 드러나지 않는다. 실제로 발견된 자리도 **다른 이슈를 정식 qa 하던 도중**이었다. `#1157` 도 같은 형태다 — shimmer 를 없애려던 판정이 그 입력으로 shimmer 를 만들고 있었다.

- **태양계 32 body** — 태양 + 행성 8 + 위성 15 + 왜소행성 5 + 혜성 3, 실시간 적분 + 관측 데이터 기반 궤도/크기 시각화
  - 위성 15: 달 / 포보스·데이모스 / 갈릴레이 4 (이오·유로파·가니메데·칼리스토) / 타이탄·레아·이아페투스·엔셀라두스 / 티타니아·오베론 / 트리톤·프로테우스
  - 토성·천왕성·해왕성 고리 + 위성 궤도 per-body 시각 스케일 (작은 위성 가독성 보존)
- **body 탐색 인터랙션** — canvas 클릭/터치로 body·위성 직접 선택, 겹친 body 반복 클릭 순환(cycle), free-fly 카메라(WASD·패닝·줌 감도 조정), 작은 body glow pixel marker, 궤도선 toggle
  - focus 줌 안정화 (v0.48~0.50): 최대 줌인 mesh 내부 진입 암전 차단 (#790) + 대형 body 줌인 tier 진동 stall 해소 — apparent-size 보존 + 히스테리시스 (#818)
- **5-mode 물리 엔진** 토글: `kepler` / `newton` / `barnes-hut` / `webgpu` / `auto`
  - Kepler 2-body 해석해 / Newton N-body Velocity-Verlet WASM / Barnes-Hut O(N log N) octree (theta=0.5 max err 4.99e-9) / WebGPU compute shader (미지원 시 자동 폴백) / Auto 최적 엔진 선택
- 소행성대 ThinInstances `?belt=N` 1~10000 (Kepler 해석해)
- 시간 제어 (재생/역행, ×1d/×1y 프리셋, julian date 정밀 jump) + 질량 슬라이더 + "만약에" 시나리오 + URL 북마크
- **우주 환경 + 온보딩** — 절차적 별 배경 + 은하수 (`infiniteDistance` 천구 + 단일 draw call shader, 신규 에셋 0, `?stars=off` 토글) / 첫 진입 온보딩 + 조작 가이드 모달 (소프트웨어 렌더 환경은 별 배경 자동 비활성 — fill-rate graceful degradation)
- **절차적 표면 & 광원 (지구 대륙 마스크 1장 외 에셋 0)** — 행성 표면 4종 (지구 **실제 대륙 윤곽**·극관·biome 위도색 / 화성 dust / 목성 밴드 / 달 크레이터) + 태양 emissive granulation·limb darkening·색온도 + 행성 자전 (NASA sidereal period + IAU 자전축, 금성·천왕성 역행) + 실제 태양 광원 밤면/terminator 명암 + 천체 표시 크기 비율 단조 보존 (sqrt 압축, `?surface=off`/`?rotate=off` 토글)
  - 지구 대륙은 Natural Earth 50m 파생 `1024×512` 육지 마스크 (`27,295` B, public domain — [출처·라이선스](apps/web/public/textures/README.md)) 가 **저주파 형상**을, 기존 fbm 이 **고주파 디테일**을 담당한다. 저장소의 **유일한 런타임 텍스처 에셋**이며 **마스크 바이트의 JS 번들 유입은 `0` B** — `.png` 를 `import` 하는 소스가 저장소 전체에 없고 파일명 문자열로만 참조되므로 번들러가 인라인할 경로 자체가 없다 (셰이더 코드 자체의 JS 증가는 별개다)

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
/scripts                검증 스크립트 (legacy — 신규 verify 는 apps/web/scripts, #793 규약)
```

---

## 시작하기

### 요구사항

- Node.js **22.16.0** (`.node-version` 고정 — Playwright extract deadlock 회피, [#606](https://github.com/coseo12/astro-simulator/issues/606))
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
pnpm test:unit            # Vitest 전체 (core + shared + web + physics-wasm)
pnpm format               # Prettier 포맷

# 브라우저 검증 (CRITICAL #3 준수)
pnpm verify:browser       # 데스크톱 1280×800 — 3단계 검증
pnpm verify:mobile        # 모바일 480×900
pnpm verify:scale         # 스케일 전환 (태양~해왕성)
pnpm verify:perf          # FPS 측정 (5 시나리오)
pnpm verify:a11y          # axe-core + 키보드 + 색약
pnpm verify:smoke         # 스모크 체인 순차 실행 (전수 아님 — 아래 계약)
```

#### `verify:smoke` 계약

**스모크 집합이지 전수가 아니다.** 체인의 정본은 루트 `package.json` 의 `verify:smoke` 값 **하나뿐**이며,
개수·목록을 이 문서로 복제하지 않는다 — 사본을 두면 드리프트한다 (종전 이 줄의 `# 위 5개 순차 실행` 이
실제 체인 9개와 어긋나 있었다).

- **포함 (성격)** — 이슈 비종속 상시 검증. **예:** 뷰포트/플랫폼 매트릭스 · 스케일 전환 · FPS · a11y ·
  WebGPU · N-body · 워크스페이스 테스트 설정. ⚠️ **이 열거는 전수가 아니다** — 위 원칙대로 목록의
  정본은 `package.json` 이고, 여기 적힌 것은 성격을 보이는 예시다.
- **제외 (성격)** — `verify:<이슈번호>-*` 꼴의 이슈별 회귀 가드. 필요하면 개별 실행한다.
  ⚠️ _"CI 가 자체 배선한 정적 가드"_ 를 제외 기준으로 쓰지 않는다 — 체인 원소 `verify:test-coverage`
  자신이 CI 배선분이라 그 술어는 절 안에서 자기모순이 된다 (PR [#1111](https://github.com/coseo12/astro-simulator/pull/1111) reviewer).
  등록된 `verify:*` 전건의 정본은 루트와 `apps/web` 의 `package.json` 이다.
- ⚠️ **CI 초록 ≠ `verify:smoke` 실행됨.** 체인 원소 중 어느 워크플로든 실제로 부르는 것은
  `verify:test-coverage` **뿐이다** (측정 트리 rev `01401dd` — 본 PR base. 초판 `780cb92` 는 그 부모라 라벨 오기였고, 두 rev 각각 측정해 수치 영향 `0` 을 실증했다). 나머지는 로컬에서만 돈다.
- ⚠️ **역도 성립하지 않는다** — `verify:smoke` 를 돌렸다고 회귀 가드 전수가 돈 것이 아니다.

> 종전 이름은 `verify:all` 이었고 [#884](https://github.com/coseo12/astro-simulator/issues/884) 에서 개명했다.
> `all` 은 전수 커버를 뜻하지 않았는데도 그렇게 읽혀 «잘못된 안심» 을 만들었다 — 이름 자체가 계약을 어기는 상태였다.

---

## 테스트 현황

- **단위 테스트** (Vitest): core 710+ / web 390+ / shared / physics-wasm — scene·physics·coords·ephemeris·gpu·time + store·panels·picking + 셰이더 GLSL↔JS 미러 parity
- **Rust** (cargo): nbody + barnes_hut + capability (unit + integration theta sweep / 1-year)
- **브라우저 검증** (Playwright + agent-browser): `browser-verify-*.mjs` — body 선택/궤도/focus 정합/fps/a11y 3단계 검증
- **CI 가드**: r1-ui-regression / fps-baseline (fresh-runner escalation) / a11y-baseline / shader-pixel (표면·광원·자전 verify 6종) / R-Phase allowlist 정합 / per-body orbit scale
- **성능** (실 GPU, M1 Pro Metal): N=1000/10000 vsync cap 120 fps (헤드리스 software renderer 는 N 비례 감소)

---

## 로드맵

### 기반 — 물리 엔진 (P1~P3) ✅

- **P1 — 태양계 MVP** (Kepler 해석해, 8행성 + 달)
- **P2 — N-body 전환** (Velocity-Verlet WASM, 소행성대)
- **P3 — Barnes-Hut + WebGPU** (octree O(N log N), WGSL compute, 5-mode 토글)

### 로드맵 v3: Incremental Body-by-Body Build ✅ 완주

태양부터 하나씩 사용자가 실제로 보이는 body 를 점진 추가하는 재구성. (v2 Fact-First 기반 P10~P17 은 기본 진입 화면 UX 회귀로 전면 폐기 — [volt #74](https://github.com/coseo12/volt/issues/74))

- **R1~R10** — 태양 → 행성 8 + 고리 → 위성 → 왜소행성 5 → 혜성 3 (27 body)
- **R11~R12** — 토성 위성 3 (Rhea/Iapetus/Enceladus) + 거성 위성 2 (Oberon/Proteus) → 32 body
- **인터랙션** — 클릭/터치 선택, 겹침 cycle, free-fly 카메라, glow pixel marker, 궤도선 toggle

상세: [`docs/phases/roadmap-v3-incremental.md`](./docs/phases/roadmap-v3-incremental.md). 폐기된 v1/v2 구상은 [`docs/deprecated/`](./docs/deprecated/) 참조.

### 현행 — 트랙 A/B (v3 완주 이후 작업 축)

- **트랙 A 몰입** — 별 배경·은하수 → 표면 셰이더 4종 → 광원 일관성·대륙 → 자전 → 태양 셰이더 → 지구 극관·biome (완료 9건). 후보 백로그: 바다 깊이색 / 대기 fresnel / 구름 / 야간 불빛 / 코로나 / sunspot / 사운드
- **트랙 B 온보딩** — 첫 진입 온보딩 + 조작 가이드, a11y AA 대비 전수 (1라운드 완료)

상세: [`docs/phases/roadmap-track-ab.md`](./docs/phases/roadmap-track-ab.md)

---

## 문서

### 기획

- [개발 기획서](./docs/phases/product-spec.md)
- [아키텍처 결정서](./docs/phases/architecture.md)
- [디자인 토큰](./docs/phases/design-tokens.md)
- [UI 아키텍처](./docs/phases/ui-architecture.md)
- [로드맵 v3 — Incremental Body-by-Body Build (완주)](./docs/phases/roadmap-v3-incremental.md)
- [로드맵 트랙 A/B — v3 완주 이후 작업 축 (현행)](./docs/phases/roadmap-track-ab.md)
- [아키텍처 원칙](./docs/architecture/principles.md) — §1 Visual Fidelity (데이터 SSoT 보존 + 렌더링 왜곡 허용)
- [용어집](./docs/glossary.md) — R-Phase / Tier / Floating Origin / focus 등
- 폐기된 v1/v2 구상 + Fact-First 원칙: [`docs/deprecated/`](./docs/deprecated/)

### Phase별

- [P1 스프린트 계약](./docs/phases/P1-solar-system-mvp.md)

### 회고/보고서

- [P1 성능 측정](./docs/retrospectives/P1-perf.md)
- [P1 접근성](./docs/retrospectives/P1-a11y.md)
- [P1 브라우저 호환성](./docs/retrospectives/P1-browser-compat.md)
- [P1 회고](./docs/retrospectives/P1-retrospective.md)
- [P3 회고](./docs/retrospectives/p3-retrospective.md) — Barnes-Hut + WebGPU
- [harness v2.2.0 업데이트 회고](./docs/retrospectives/harness-update-2.2.0-retrospective.md)

### 벤치마크/측정

- [P2-D 실 GPU 성능](./docs/benchmarks/p2d-perf.md)
- [P3-A Barnes-Hut 정확도](./docs/benchmarks/p3a-barnes-hut-accuracy.md)
- [P3-A 성능 비교](./docs/benchmarks/p3a-perf.md)
- [P3-B WebGPU 측정](./docs/benchmarks/p3b-perf.md)
- [P3-D 종합 회귀](./docs/benchmarks/p3d-comprehensive-verify.md)

### ADR (아키텍처 결정)

- [WebGPU N-body 적분 스킴 (GPU-resident)](./docs/decisions/20260415-webgpu-integration-scheme.md)
- [decisions/](./docs/decisions/)

---

## 데이터 출처

- **행성 궤도 요소**: Standish 1992 mean elements (JPL)
- **위성 궤도 요소**: JPL Horizons API (parent-centric J2000 Ecliptic osculating, 2026-01-01 TDB epoch) + NASA Planetary Fact Sheet (반장축·이심률)
- **천문학 상수**: CODATA 2018, IAU 2012
- **데이터 신뢰성 Tier**: 모든 수치에 T1(관측)~T4(예술) 배지

이후 단계에서 NASA Exoplanet Archive, Gaia DR3 추가 예정.

---

## 라이선스

MIT
