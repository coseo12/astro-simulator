# ADR 20260628-756 — 절차적 행성 표면 셰이더 (1차: 인프라 + 대표 4개)

- **상태**: Accepted (cross-validate 2026-06-28) — **Amendment 1 (#773/#775): Accepted (cross-validate 2026-06-30)** — **Amendment 2 (#782): Accepted (cross-validate 2026-07-01)** — **Amendment 3 (#783): Accepted (cross-validate 2026-07-04)** — **Amendment 4 (#1119): Provisional (cross-validate 대기)**
- **날짜**: 2026-06-28 (Amendment 1: 2026-06-30, Amendment 2: 2026-07-01, Amendment 3: 2026-07-04, Amendment 4: 2026-08-17)
- **이슈**: [#756](https://github.com/coseo12/astro-simulator/issues/756) / Amendment 1: [#773](https://github.com/coseo12/astro-simulator/issues/773) (광원 일관성 회귀, high) + [#775](https://github.com/coseo12/astro-simulator/issues/775) (지구 대륙 mix, low) / Amendment 2: [#782](https://github.com/coseo12/astro-simulator/issues/782) (self-rotation 자전 + 광원 world normal 옵션 e 전환, medium) / Amendment 3: [#783](https://github.com/coseo12/astro-simulator/issues/783) (지구 디테일 — 극관 + biome 위도 색 변화, medium) / Amendment 4: [#1119](https://github.com/coseo12/astro-simulator/issues/1119) (지구 대륙 윤곽 실제화 — 「에셋 0」 조건부 예외, high)
- **관련**: [#738 절차적 별 배경](20260624-738-procedural-starfield.md) (트랙 A 선행), [`docs/architecture/principles.md` §1 Visual Fidelity](../architecture/principles.md)
- **용어**: [Tier](../glossary.md#tier-t1--t2--t3), [R-Phase](../glossary.md#r-phase-roadmap-v3-phase), [LOD](../glossary.md) (high/mid/low variant)

---

## 배경

현재 모든 천체는 단색 `StandardMaterial.diffuseColor` (`solar-system-scene.ts` `createBodyMesh`/`createBodyMeshMid`/`createBodyBillboard`) 로 렌더된다. 표면 디테일이 0이라 행성이 "공" 처럼 밋밋하다. 방향성 기획 트랙 A (몰입 강화) 의 잔여 항목으로, 별 배경 (#738) 에 이어 행성 표면에 절차적 디테일을 부여해 몰입을 강화한다.

핵심 제약 (이슈 계약):

- **에셋 0** — 외부 텍스처 이미지 도입은 에셋 파이프라인 신설 + 번들 증가 + WebGPU 호환 리스크를 동반한다. 이 코드베이스는 `ring-shader.ts` / `starfield.ts` 모두 절차적 `ShaderMaterial` 로 확립돼 있어, 절차적 셰이더가 구조 정합 + 에셋 0.
- **데이터 SSoT 보존** — 물리 반경/색상 (`solar-system.json`) 불변. 표면 디테일은 rendering 시점 변조만 (Visual Fidelity 원칙).
- **Incremental Body-by-Body / R-Phase 철학** — 1차는 인프라 + 대표 4개 (rocky=지구 / desert=화성 / gas-bands=목성 / cratered=달) 로 좁힌다. 나머지 23개는 단색 유지, 이후 점진 확장.

기존 셰이더 인프라가 본 결정의 직접 선례를 제공한다:

- `ring-shader.ts` — `ShaderMaterial` + GLSL + `Effect.ShadersStore` 1회 등록 + log-depth `gl_FragDepth` 정합 + GLSL↔JS 미러 함수로 단위 테스트 (`computeArcFactor`) + uniform 패킹 헬퍼 + fallback 경로.
- `starfield.ts` — sin-free hash / value noise / fbm 절차 생성 + 미학 상수 SSoT (re-export) + GLSL 미러 (`starColorMirror`) + 디자인 루브릭 anti-pattern (보라/마젠타 금지) 가드.

---

## 후보 비교

### 결정 1 — 셰이더 모듈 구조

| 축            | A. 신규 `procedural-planet-shader.ts` (ring/starfield 답습) | B. `ring-shader.ts` 에 표면 셰이더 합류        | C. body 별 인라인 GLSL (`solar-system-scene.ts` 내) |
| ------------- | ----------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------- |
| 구조 정합     | ✓ ring/starfield 와 동형 (1 모듈 = 1 셰이더군)              | ✗ ring 과 표면은 책임 다름 (annulus vs sphere) | ✗ scene 파일 비대 (이미 2100+ 줄)                   |
| 단위 테스트   | ✓ GLSL 미러 함수 export 가능                                | △ ring 테스트와 혼재                           | ✗ scene 통합 테스트만                               |
| WebGPU parity | ✓ GLSL→WGSL 자동 변환 (ring/starfield 실증)                 | ✓ 동일                                         | ✓ 동일                                              |
| 격리성        | ✓ `?surface=off` 시 모듈 통째 미사용                        | ✗ ring 과 결합                                 | ✗                                                   |

→ **A 채택**. 신규 `packages/core/src/scene/procedural-planet-shader.ts`. ring-shader 의 모듈 구조 (ShaderMaterial 팩토리 + GLSL 미러 + 상수 SSoT re-export) 를 답습.

**high/mid LOD 공유 머티리얼**: high (segments=32) / mid (segments=12) 는 **동일 ShaderMaterial 팩토리** 를 쓴다 (segments 만 다름). 절차 디테일은 fragment 단계라 vertex 밀도와 무관하므로, mid 에서도 동일 표면이 보인다 (LOD 전환 시 사용자가 표면 변화를 인지하지 않음 — `createBodyMeshMid` 의 "동일 식 비율 보존" 계약 정합). low (billboard) 는 적용 제외 (결정 3).

### 결정 2 — 표면 타입 4종 분기의 데이터 소스

| 축                      | A. `colorHint` 확장 (`colorHint.surfaceType`)    | B. 신규 데이터 필드 (`CelestialBody.surfaceType`)                                  | C. 코드 상수 테이블 (`body.id → surfaceType`)                              |
| ----------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 데이터 SSoT 정합        | △ colorHint 는 색상 힌트 — 표면 타입은 의미 다름 | ✗ "표면 타입" 은 물리 데이터 아님 (rendering 분류) — SSoT 에 rendering 관심사 누수 | ✓ rendering-only 관심사를 scene 레이어에 격리 (Visual Fidelity §적용 위치) |
| 신규 데이터 ≠ 신규 코드 | △ 데이터 42 레코드 중 4개 수정                   | △ 데이터 스키마 + 42 레코드                                                        | ✓ 4-entry 상수 테이블 1곳 (이후 확장 = 데이터 추가 아닌 상수 추가)         |
| 미지정 fallback         | colorHint 옵셔널 → undefined 처리                | 옵셔널 필드 → undefined                                                            | 테이블 미등록 → 단색 (명시적)                                              |
| 확장 비용 (R-Phase)     | 데이터 파일 수정                                 | 데이터 파일 수정                                                                   | 상수 테이블 1줄 추가                                                       |

→ **C 채택**. `procedural-planet-shader.ts` 내 `SURFACE_TYPE_BY_BODY: Record<string, SurfaceType>` 상수 테이블. 근거:

- **데이터 SSoT 원칙** (principles.md §적용 위치): "표면 타입" 은 물리 데이터가 아니라 **rendering 분류** 다. `solar-system.json` 은 NASA/JPL 실측 (반경/색상/궤도) 의 SSoT 이므로 rendering 관심사를 누수시키지 않는다. ring-shader 의 `arcs` 데이터도 loader 레벨이지만, 표면 타입은 더 순수한 "시각 표현 선택" 이라 scene 레이어 상수가 정합.
- **"신규 데이터 ≠ 신규 코드"** 의 변형 적용 — 여기선 반대로 "신규 rendering 분류 = 신규 코드 (상수)" 가 올바르다. 데이터 파일을 건드리지 않으므로 physics 적분 / Info 패널 표기 / cross-link 무영향.
- 미등록 body 는 자동으로 단색 (StandardMaterial) — 23개 비-범위 body 무회귀가 **테이블 부재로 자동 보장** (명시적 opt-in).

**셰이더 내부 분기**: `uniform int surfaceType` + fragment switch (A) vs 타입별 셰이더 인스턴스 (B).

| 축                  | A. 단일 셰이더 + `uniform int surfaceType`                                      | B. 타입별 4 셰이더 |
| ------------------- | ------------------------------------------------------------------------------- | ------------------ |
| ShadersStore 등록   | 1회 (충돌 0)                                                                    | 4회 (key 관리)     |
| 컴파일 비용         | 1 컴파일 (브랜치 포함)                                                          | 4 컴파일           |
| 단위 테스트 미러    | 1 함수 (surfaceType 인자)                                                       | 4 함수             |
| GPU warp divergence | △ 같은 draw 안에서 같은 body = 같은 surfaceType → divergence 0 (body 단위 draw) | ✓ 없음             |

→ **A 채택**. 단일 셰이더 + `uniform int surfaceType`. body 1개 = draw 1개 = 동일 surfaceType 이므로 warp divergence 0 (starfield 의 `if (bandFactor>0)` 분기 선례 — fragment 분기 자체는 수용 가능). ShadersStore 1회 등록 (ring/starfield 패턴).

### 결정 3 — tier / LOD 차등

| variant                         | 적용                               | 근거                                                                                                                                         |
| ------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| high (sphere seg=32)            | ✓ 절차 셰이더                      | 표면 디테일 가시 (가까이서 관찰)                                                                                                             |
| mid (sphere seg=12)             | ✓ 동일 셰이더 (결정 1)             | LOD 전환 시 표면 연속성 (사용자 인지 불변)                                                                                                   |
| low (billboard quad)            | ✗ 단색 유지 (현행 alpha-mask quad) | sub-pixel draw call 절감이 책임 (`createBodyBillboard` 의 bodyScale 미적용 책임 분리 정합) — 표면 셰이더는 px<4 에서 무의미 + fill-rate 부담 |
| tier-c (`forceOverride: 'low'`) | ✗ 자동 단색                        | tier-c 는 `TIER_PROFILES.c.lod.forceOverride='low'` 로 전 body low variant 강제 → 표면 셰이더 자동 미진입 (fps 보호 자동 달성)               |

→ **high/mid 적용, low 미적용**. tier-c 는 **별도 코드 없이** `forceOverride:'low'` 가 자동으로 표면 셰이더를 우회 (low variant = 단색). 이는 별 배경 #738 에서 tier-c fill-rate 회귀를 "소프트웨어 렌더 직접 감지" 로 비활성한 교훈 (메모리 2026-06-24) 의 **구조적 사전 회피** — 표면 셰이더는 그보다 부담이 작지만 (전체화면 fill 아님, body 표면만), 동일 원리로 tier-c 진입 자체가 차단된다.

**detailLevel uniform 차등 훅 (선택, YAGNI 경계)**: high/mid 모두 full detail. starfield `gridDensity` override 처럼 tier 별 detail 약화 훅은 **fps 실측이 필요를 증명한 만큼만** 도입 (starfield ADR §교차검증 기각 2 YAGNI 정합). 1차는 detailLevel uniform 을 셰이더 인터페이스에 **예약** (옵션 인자) 하되 호출부는 full 고정 — 후속 fps 측정에서 tier-b 약화가 필요하면 그때 배선.

### 결정 4 — `?surface=off` URL 플래그

| 축             | A. `?marker` 패턴 (scene 생성 옵션, URL-only, UI 토글 없음) | B. `?orbits` 패턴 (command/handler + store + 런타임 토글) |
| -------------- | ----------------------------------------------------------- | --------------------------------------------------------- |
| 이슈 범위 정합 | ✓ 계약은 URL 플래그만 요구 (UI 토글 비목표)                 | ✗ 런타임 토글 버튼은 비목표 (scope creep)                 |
| 코드 표면      | ✓ parse 함수 + scene 옵션 1개 + sim-canvas 1곳              | ✗ + command 타입 + handler + store action + 토글 버튼     |
| OFF 메커니즘   | ✓ 생성 시점 단색 StandardMaterial 선택                      | △ 런타임 머티리얼 교체 (복잡)                             |

→ **A 채택** (`?marker` 패턴). 이슈 계약은 `?surface=off` URL 플래그만 요구하고 런타임 UI 토글은 비목표다. `?marker=off` (glowMarker 비활성) 와 동형:

- 신규 `apps/web/src/core/parse-surface-mode.ts` — `parseSurfaceVisible(urlParam): boolean` (parse-orbits-mode 동형, 기본 true).
- `createSolarSystemScene` 옵션에 `surfaceDetail?: boolean` 추가 (`glowMarker?: boolean` 동형, 기본 true).
- sim-canvas 가 `parseSurfaceVisible(...)` → 옵션 전달.
- **OFF 메커니즘**: `surfaceDetail=false` 면 `createBodyMesh`/`createBodyMeshMid` 가 **기존 StandardMaterial 경로** 를 그대로 탄다 (절차 셰이더 미적용). 즉 OFF = 현행 동작 100% 복귀 (회귀 가드 baseline). 생성 시점 분기라 런타임 머티리얼 교체 불필요.

> **`?orbits` 가 command/handler 인 이유**: orbits 는 런타임 토글 버튼 (focus-quick-buttons) 이 있어 command 경유가 필수다. surface 는 토글 버튼이 비목표이므로 `?marker` 의 생성 옵션 패턴이 최소 정합 표면이다.

### 결정 5 — 데이터 SSoT: base color uniform 전달

`colorHint.hex` (base 색상) 를 셰이더 `uniform vec3 baseColor` 로 전달하고, 절차적 변조 (명암 / 밴드 / 크레이터 / dust) 는 그 위에 합성한다. 물리 반경/색상 데이터는 불변. 변조 강도 상수는 `procedural-planet-shader.ts` 의 rendering-only 미학 상수 SSoT (starfield 패턴 — re-export + 단위 테스트 가드).

- rocky (지구) — base color 위 대륙/해양 대비 (저주파 noise) + 미세 명암.
- desert (화성) — base 위 dust/협곡 결 (fbm) + 산화철 톤 변조.
- gas-bands (목성) — base 위 위도 밴드 (sin(latitude) 변조) + 난류 결.
- cratered (달) — base 위 크레이터 (cell noise 점 분포 — starfield 별 셀 패턴 재사용) + 명암.

---

## 결정 (요약)

1. **모듈** — 신규 `packages/core/src/scene/procedural-planet-shader.ts` (ring/starfield 답습). high/mid 공유 ShaderMaterial, low 미적용.
2. **표면 타입 소스** — 코드 상수 테이블 `SURFACE_TYPE_BY_BODY` (데이터 SSoT 불변). 셰이더 내부는 단일 셰이더 + `uniform int surfaceType` 분기.
3. **tier/LOD** — high/mid 적용. low + tier-c 는 `forceOverride:'low'` 로 자동 단색 (fps 보호, 별도 코드 0). detailLevel 약화 훅은 예약만 (YAGNI).
4. **`?surface=off`** — `?marker` 패턴 (parse-surface-mode + scene 생성 옵션 `surfaceDetail`, URL-only). OFF = StandardMaterial 현행 복귀.
5. **데이터 SSoT** — `colorHint.hex` → `uniform baseColor`, 절차 변조는 그 위. `solar-system.json` 불변.

---

## Visual Fidelity §의무 체크리스트 4항목 (principles.md §1)

- [x] **데이터 SSoT 보존 확인** — 표면 타입 매핑 (`SURFACE_TYPE_BY_BODY`) + 변조 강도 상수는 `procedural-planet-shader.ts` 의 **rendering-only 상수** 다. `solar-system.json` 의 `radius`/`colorHint.hex`/궤도 요소 **직접 수정 0**. base color 는 기존 `colorHint.hex` 를 read-only 로 uniform 전달.
- [x] **rendering 시점 분리** — physics 엔진 (`packages/core/physics-engine`, Rust+wasm) 은 표면 셰이더에 의존하지 않는다. 적분기는 heliocentric 절대 m 좌표만 사용 — 표면 디테일은 `packages/core/src/scene` 레이어 단독. P11-A 좌표 계약 위반 0.
- [x] **사용자 D-T2 가이드** — 표면 디테일은 순수 시각 표현 (왜곡) 이며, focus 패널 / Info 패널은 여전히 실측값 (반경 km / 색상 출처) 을 표기한다. 절차 변조는 표기 대상 아님 (별 배경 #738 동일 — 미학 표현).
- [x] **점유율 / 사실 비율 baseline 박제** — 표면 셰이더는 mesh 크기/위치를 변경하지 않으므로 (diameter 식 불변) px diameter / 점유율 / mesh-orbit 분리 마진에 **영향 0**. r1-guard baseline 은 표면 픽셀 변경 (색/명암) 으로 재생성되며, 4 target body 의 화면 표면 픽셀 분산 (단색 대비 디테일 존재) 을 qa 가 실 Chrome GUI 로 박제 (DoD).

---

## Concrete Prediction

"신규 데이터 ≠ 신규 코드" + ring/starfield 선례 기반 라인 수 예측 (구현 후 `git diff --stat` 실측 재현):

| 영역                 | 파일                                              | 예측 라인 (신규/변경) | 근거                                                                                                                                                                                     |
| -------------------- | ------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **core 셰이더 신설** | `procedural-planet-shader.ts` (신규)              | ~280–360 신규         | starfield.ts (403줄) 보다 적음 — 은하수 fbm 미포함. GLSL (vertex+fragment 4타입 분기) + 팩토리 + 상수 SSoT + GLSL 미러 (단위 테스트용)                                                   |
| **core 배선**        | `solar-system-scene.ts`                           | ~25–45 변경           | `createBodyMesh`/`createBodyMeshMid` 에 surfaceDetail 분기 (셰이더 vs StandardMaterial) + 옵션 `surfaceDetail` 수신. ring-shader 배선 (#641) 선례 대비 작음 (mesh 생성 함수 내부 분기만) |
| **core 타입**        | `solar-system-scene.ts` `SolarSystemSceneOptions` | ~3 변경               | `surfaceDetail?: boolean` 옵션 1개 (glowMarker 동형)                                                                                                                                     |
| **web URL 플래그**   | `parse-surface-mode.ts` (신규)                    | ~30 신규              | parse-orbits-mode.ts (33줄) 동형 복제                                                                                                                                                    |
| **web 배선**         | `sim-canvas.tsx`                                  | ~5–8 변경             | `parseSurfaceVisible` → 옵션 전달 (marker 패턴)                                                                                                                                          |
| **데이터**           | `solar-system.json`                               | **0**                 | 표면 타입 = 코드 상수 (결정 2). 데이터 불변                                                                                                                                              |
| **단위 테스트**      | `procedural-planet-shader.test.ts` (신규)         | ~80–140 신규          | GLSL 미러 결정성 / surfaceType enum 완비 / 보라-마젠타 부재 (디자인 루브릭) / 상수 SSoT drift 가드                                                                                       |

**핵심 예측**:

- **데이터 파일 변경 0** — 표면 타입이 코드 상수로 수렴 (결정 2 C). 예측 실패 (데이터 수정 발생) 시 = SSoT 누수 신호.
- **core 배선 ≤ 45 줄** — mesh 생성 함수 내부 분기만 (tier-c 자동 우회로 LOD pass / camera / picking 무변경). 예측 초과 시 = 표면 셰이더가 LOD/tier 레이어를 침범 (재검토).
- **picking / camera / orbit / tier-transition 변경 0** — 표면은 머티리얼만 바꾸고 mesh 기하/메타데이터 불변 (#713 bodyId 역매핑 무영향).

---

## 결과 · 재검토 조건

**기대 결과**:

- 지구/화성/목성/달 4개에 절차 표면 디테일 (실 Chrome GUI 확인).
- 나머지 23 + 태양 + 고리 + 별 배경 무회귀 (단색/기존 유지 — 테이블 미등록 자동 단색).
- high/mid 적용, low/tier-c 자동 단색 (fps 보호).
- `?surface=off` 전체 단색 복귀, 기본 ON.
- fps 회귀 0 (tier-a/b/c fps-baseline-guard PASS, CI swiftshader 포함).

**재검토 조건**:

1. **fps 회귀 발생** (tier-b 에서 표면 셰이더 fragment 비용 초과) — detailLevel uniform 약화 훅을 측정 기반 도입 (Amendment). 1차 예약만 한 인터페이스 활성화.
2. **gas-bands 위도 밴드 부정확** — 자전축 기울기 (axialTiltDeg, ring-shader #647 인프라) 미반영으로 목성 밴드가 공전면 기준일 수 있음. 1차는 mesh local Y 기준 근사 (Visual Fidelity rendering-only) — 사실성 요구 시 후속.
3. **표면 타입 확장 요구** (ice giant / 위성 추가) — `SURFACE_TYPE_BY_BODY` 테이블 + surfaceType enum 추가 (R-Phase). 데이터 변경 0 예측 재현.
4. **WebGPU↔WebGL parity 결함** — ring/starfield 가 실증했으나, 표면 셰이더 특정 함수 (cell noise / fbm) 의 백엔드 차이 발견 시 qa 실 Chrome (WebGPU) + CI swiftshader (WebGL) 양 경로 박제.

---

## 교차검증 반영 사항

cross-validate (Antigravity `agy`) 1회 수행 (2026-06-28, outcome=applied, exit 0, plan_bypass=false). 로그: `.claude/logs/cross-validate-architecture-20260628-193425.log`. **호출 전 Claude 편향 셀프 체크**: 4종 (낙관적 일정 / 결합 간과 / 폐기 프레이밍 / 순수주의) 중 결합 간과 (tier-c 우회 단정) + 폐기 프레이밍 (외부 텍스처 폐기) 2축 미통과 의심 → cross-validate 프롬프트에 명시 질문 삽입 (이하 합의 1·2 에서 통과 확인).

### 합의 (현재 PR 즉시 반영 / 통과 확인)

1. **tier-c 우회 + `?surface=off` 100% 회귀 = 엔지니어링 절제** [결합 간과 축 검증 통과] — agy 가 "`forceOverride:'low'` 구조로 별도 코드 없이 tier-c 우회 + `?surface=off` 100% 회귀 baseline 확보 = 오버헤드/리스크 최소화 절제력" 으로 결정 3·4 를 명시 호평. Claude 의 "별도 코드 0 자동 우회" 단정이 외부 모델로 교차 확인됨 (셀프 체크 결합 간과 축 통과). 단 구현 시 developer 가 **실측 의무** (결정 3 의 tier-c low variant = StandardMaterial 경로를 실 진입 확인).
2. **표면 타입 코드 상수 = 데이터 SSoT 부합** — 결정 2 (C) 를 "물리 데이터에 rendering 관심사 미누수, SSoT 원칙 완벽 부합" 으로 합의.
3. **high/mid 공유 머티리얼 = popping 방지** — 결정 1 의 LOD 전환 시 표면 연속성을 호평.
4. **절차 셰이더 = 구조 정합** [폐기 프레이밍 축 검증 통과] — agy 가 절차 셰이더 채택을 "관심사 분리 + 단위 테스트 용이 + 인젝션/누수 리스크 0" 으로 타당 확인. 외부 텍스처 폐기가 패턴 답습 편향이 아니라 구조 정합임이 교차 확인됨 (셀프 체크 폐기 프레이밍 축 통과).

### 이견 수용 (원안 수정)

1. **GLSL 분기 `switch-case` → `if-else`** — 원안은 셰이더 내부 분기 방식을 미명시 (uniform int surfaceType 분기만 언급). agy 가 "Babylon GLSL→WGSL 변환기가 `switch-case` 에서 컴파일 에러/최적화 깨짐 보고 사례" 를 지적. **수용** — 구현은 `if (uSurfaceType==0) ... else if ...` 형태로 보수적 분기 (ring-shader/starfield 모두 `if` 만 사용, `switch` 미사용 — 기존 선례 정합). developer 인수인계에 명시.
2. **surfaceType enum JS↔GLSL int 동기화 가드** — 원안은 GLSL 미러 함수만 언급, surfaceType 정수 매핑의 JS↔GLSL drift 가드를 명시 누락. agy 가 "셰이더 내부 enum 정수 ↔ JS 코드 정수 비동기 정합성 오류" 리스크 지적. **수용** — `procedural-planet-shader.test.ts` 에 surfaceType enum ↔ uniform int 매핑 SSoT 가드 (ring-shader `MAX_ARCS` parity 가드 #728 패턴) 추가. Concrete Prediction 단위 테스트 항목에 흡수.

### Claude 재분석으로 기각한 외부 모델 제안

1. **자전축 기울기 (`axialTiltDeg`) uniform 1차 반영** (agy 누락요소 ①) — **기각 (후속 유지)**. 이미 §재검토 조건 2 에 명시한 후속 항목이다. 1차 비목표 (목성 위도 밴드 사실성 정밀) 와 상충 (CRITICAL #6 비목표 우선). 1차는 mesh local Y 근사 (Visual Fidelity rendering-only — 감상용 밴드면 충분, 사실 자전축 정렬은 후속). agy 도 "향후 확장 대상 (천왕성 등)" 으로 미래 시제로 제안 — 1차 범위 밖 확인. ring-shader 의 `axialTiltRad` 인프라 (#647) 가 이미 존재하므로 후속 배선 비용도 낮음.

### 고유 발견 (범위 판정)

1. **WebGL1 `highp float` 미지원 precision fallback** (agy 보안 ⑤) — **비대상** (후속 분리 불요). 이 프로젝트는 Babylon v9 + WebGPU/WebGL2 + tier 시스템 기반으로 WebGL1 을 지원 대상에서 제외한다 (starfield/ring-shader 도 `precision highp float;` 고정, WebGL1 fallback 없음 — 동일 선례). WebGL1 미지원 기기는 tier 감지 자체가 별도 경로. 범위 밖이며 기존 셰이더 정책과 정합하므로 후속 이슈 불요 (비대상 명시로 맥락 박제).
2. **표면 타입 8종+ 초과 시 타입별 셰이더 인스턴스 전환** (agy 확장성) — **비대상** (1차 4종, 재검토 조건 3 에 흡수). agy 도 "임계치 (8종 이상) 초과 시" 미래 조건부 제안. 1차 단일 셰이더 + if-else 분기는 4종에서 divergence 0. 8종+ 도달 시 팩토리 전환은 재검토 조건 3 (표면 타입 확장) 의 자연 연장.
3. **anti-pattern (보라/마젠타) 출력 색역 어서션** (agy 누락요소 ③) — **수용 (단위 테스트 흡수)**. starfield `starColorMirror` 의 보라/마젠타 부재 가드 패턴을 표면 셰이더 미러에도 적용 (baseColor 위 변조 후 출력 RGB 가 기괴 색역 미진입 어서션). Concrete Prediction 단위 테스트 항목에 이미 "보라-마젠타 부재" 명시 — 강화 확정.

---

## Amendment 1 (2026-06-30) — 광원 일관성 회귀 (#773) + 지구 대륙 mix (#775)

- **상태**: Accepted (cross-validate 2026-06-30 — §A1.7 4축 박제 완료)
- **이슈**: [#773](https://github.com/coseo12/astro-simulator/issues/773) (bug/회귀, high), [#775](https://github.com/coseo12/astro-simulator/issues/775) (type:feat, low)
- **형식**: 본 Amendment 는 #756 셰이더의 **직접 보강 + 회귀 수정** 이라 신규 ADR 이 아닌 Amendment 로 박제 (광원 모델이 §결정 5 의 "간이 명암 shade" 를 대체하는 본문 결정의 갱신). **forensic 변형 채택** — 회귀 사실 확인 + runtime 측정 + DoD PASS 인데 사용자 회귀 + N≥2 옵션 비교 + cross-validate Amendment 라운드 예상 → [Forensic ADR 5조건](../../CLAUDE.md) 5/5 충족 (§Forensic 측정 결과 박제).

### A1.1 배경 — #756 부작용 (광원 회귀)

#756 §결정 5 가 도입한 fragment "간이 명암" 식이 회귀의 근원이다:

```glsl
// procedural-planet-shader.ts:223 (현행)
float shade = 0.85 + 0.15 * clamp(dot(vNormal, normalize(vec3(0.5, 0.7, 0.5))), 0.0, 1.0);
```

- **고정 방향 벡터** `(0.5,0.7,0.5)` — 태양 실제 위치 무관 (공전/회전해도 명암 불변).
- **범위 [0.85, 1.0]** — 밤면조차 0.85 이상 → **밤면 없음 / terminator 없음**.
- 반면 단색 행성 (StandardMaterial + `disableLighting=false`) 은 태양 `PointLight` (원점, intensity 2.5) + `HemisphericLight` (ambient floor) 의 실제 명암을 받는다.

→ 지구/화성/목성/달 (표면 셰이더) 은 균일하게 밝고, 금성/토성/천왕성/해왕성/수성 (단색) 은 낮/밤 terminator 가 뚜렷 → **시각적 이원화 회귀**.

### A1.2 Forensic 측정 결과 (단색 행성 명암 모델 실측)

`scripts/_debug-773-tmp.mjs` (volt #67 패턴, 측정 후 즉시 rm) 로 단색 행성의 Babylon StandardMaterial 라이팅 식을 재현 측정. 태양 방향 = +X 가정, 라이팅 계수 = `PointLight diffuseTerm + HemisphericLight diffuseTerm` (diffuseColor 곱 전).

| 표면점 (world normal) | 단색행성 라이팅계수 (R,G,B) | 휘도 (Rec.709) | 현행 셰이더 shade |
| --------------------- | --------------------------- | -------------- | ----------------- |
| 낮면 중심 (N=+X)      | (2.67, 2.55, 2.18)          | **2.547**      | 0.925             |
| terminator (N=+Z)     | (0.17, 0.17, 0.18)          | 0.173          | 0.925             |
| 극/측면 (N=+Y)        | (0.30, 0.30, 0.30)          | 0.300          | 0.956             |
| 밤면 중심 (N=−X)      | (0.17, 0.17, 0.18)          | **0.173**      | 0.850             |
| 밤면 하단 (N=−Y)      | (0.04, 0.04, 0.05)          | 0.046          | 0.850             |

**핵심 측정**:

1. **단색 행성 낮/밤 대비비 = 14.74x** (낮면 휘도 2.547 / 밤면 휘도 0.173). 현행 셰이더 대비비 ≈ 1.12x ([0.85, 0.956]) → 거의 균일 = "밤면 없음" 정량 확정.
2. **밤면 floor = HemisphericLight ground 단독** — `AMBIENT_INTENSITY(0.3) × groundColor(0.15,0.15,0.18) ≈ (0.045, 0.045, 0.054)` 이 **순수 ground 기여**. 단, HemisphericLight 은 `mix(ground, sky, dot(N,up)*0.5+0.5)` 라 **밤면이 균일하지 않다** — 위쪽 향한 밤면 (+Y, 0.30) vs 아래쪽 밤면 (−Y, 0.046) 이 다르다 (hemispheric 그라데이션).
3. **미묘함 (설계 분기점)** — 단순 스칼라 ambient floor 로는 terminator (N=+Z, 단색 0.173 vs 스칼라 제안 0.046) 와 극지점 (N=+Y, 단색 0.300) 의 hemispheric 그라데이션을 재현 못 함. **단색 행성과 "완전 일치" 하려면 HemisphericLight 식 (`mix(ground, sky, ndl_up)`) 까지 재현해야 한다** → 결정 A1.3-결정 2 에서 비교.

### A1.3 결정

#### 결정 1 — sun direction 갱신 경로 (5 옵션 비교)

표면 셰이더에 **실제 태양 방향**을 전달하는 메커니즘. scene 의 모든 mesh 와 `sunLight` 은 매 프레임 **동일 좌표계** (floating-origin shift + tier scale 적용된 scene-unit world) 로 갱신됨 (`solar-system-scene.ts:1159–1163` mesh, `:1208–1212` sunLight). body mesh 는 **회전 0 (self-rotation 미구현) + uniform scaling** → **world normal == local normal** (정규화 후) — 이 단순화가 설계 핵심.

| 축                 | (a) world position uniform + fragment에서 `sunPos - fragWorldPos` | (b) CPU에서 sunDir(local) 계산 → uniform | (c) `material.onBindObservable` 에서 mesh별 sunDir uniform | (d) scene render loop 에서 material 추적 + uniform | (e) `world` matrix uniform + fragment world normal |
| ------------------ | ----------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| world normal 처리  | fragment world position 필요 (vertex 추가 전달)                   | **불필요** (local==world, 회전 0)        | **불필요** (local==world)                                  | **불필요**                                         | normalMatrix 필요 (회전 0 이라 과잉)               |
| sunDir 전달        | uniform vec3 (scene-unit)                                         | uniform vec3 (local)                     | uniform vec3 (mesh별)                                      | uniform vec3 (mesh별)                              | —                                                  |
| material 핸들 추적 | scene가 추적 필요                                                 | scene가 추적 필요                        | **불요** (onBind 자체 콜백)                                | **필요** (Map 보관)                                | scene가 추적 필요                                  |
| sun position 주입  | scene→material provider                                           | scene→material provider                  | scene→material provider                                    | scene loop 직접                                    | scene→material provider                            |
| 코드 표면          | 중 (vertex+fragment)                                              | 소                                       | **소 (onBind 1 클로저)**                                   | 중 (Map + loop)                                    | 중                                                 |
| 정합성             | floating-origin 좌표 직접                                         | local 변환 1회                           | local 변환 1회                                             | local 변환 1회                                     | 과잉                                               |

→ **(c) `onBindObservable` 채택 (보조: provider 콜백)**. 근거:

- ShaderMaterial 의 `onBindObservable.add((mesh) => {...})` 는 **각 draw 직전** mesh 핸들과 함께 호출됨 → scene 이 material 핸들을 별도 Map 으로 추적할 필요 없음 (옵션 d 대비 우월). high/mid 각 variant 의 material 이 자기 onBind 에서 자기 sunDir 을 설정.
- body mesh 회전 0 + uniform scaling → `world normal == local normal` → **normalMatrix / world matrix uniform 불필요** (옵션 e 과잉 회피). `vNormal` (local) 을 그대로 dot 에 사용 가능.
- sunDir = `normalize(sunPos_sceneUnit − meshPos_sceneUnit)` 을 CPU(JS)에서 계산 → `uniform vec3 uSunDirection` (mesh local 기준이지만 회전 0 이라 world 와 동일). 부동소수점/픽셀 비용 0 (per-mesh 벡터 1개).
- **sun position 주입**: `createProceduralPlanetMaterial` 이 sun position provider 콜백 `() => Vector3` 을 인자로 받아 onBind 에서 호출 (scene 이 `sunLight.position` 또는 worldPositions 변환값을 넘김). scene→core 단방향 의존 유지 (core 가 web 미참조).
- **satellite (달) 정합**: 달 mesh 는 parent(지구) 에 붙어 transform 상속하나 parent 도 회전 0 → `달 absolutePosition` 기준으로 sunDir 계산하면 동일. onBind 의 mesh 는 실제 그려지는 mesh 라 `mesh.getAbsolutePosition()` 이 정확.

> **회전 미구현 전제의 명시적 박제 (drift 가드)**: 본 결정은 "body mesh 회전 0" 에 의존한다. 후속에 self-rotation / axialTilt 가 도입되면 `vNormal` 을 world matrix 로 변환해야 한다 (옵션 e 로 전환). 셰이더 주석 + 단위 테스트에 "회전 도입 시 normalMatrix 필요" 계약 박제 의무 (§A1.5 DoD).

#### 결정 2 — ambient(밤면) 모델: 스칼라 floor vs HemisphericLight 재현 (3 옵션)

| 축                 | (A) 스칼라 ambient floor (`shade = floor + sun·ndl`)        | (B) HemisphericLight 식 완전 재현 (`mix(ground,sky,ndl_up)`) | (C) 단색 행성도 셰이더로 전환 (통합) |
| ------------------ | ----------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------ |
| 단색 행성과 일치도 | △ 밤면 균일 (terminator/극 그라데이션 미재현, 측정 §A1.2-3) | ✓ **완전 일치** (ground/sky/up uniform 재현)                 | ✓ (정의상 동일)                      |
| 셰이더 복잡도      | 소 (스칼라 1개)                                             | 중 (mix + up dir + ground/sky uniform 3개)                   | 대 (범위 폭증)                       |
| 상수 SSoT          | `AMBIENT_INTENSITY`/`SUN_INTENSITY` 재사용                  | + `AMBIENT_GROUND_COLOR_RGB`/sky/up 재사용                   | 전체 재구조화                        |
| 회귀 위험          | 밤면 톤 미세 차이 (사용자 인지 가능?)                       | 0 (식 동일)                                                  | 23개 단색 body 회귀 위험 (비범위)    |
| 범위 정합          | ✓                                                           | ✓                                                            | ✗ (#773 비목표 — 단색 유지)          |

→ **(B) HemisphericLight 식 재현 채택**. 근거:

- #773 의 본질은 "단색 행성과 **일관**" 이다. 측정 §A1.2-3 이 보인 hemispheric 그라데이션 (terminator 0.173, 극 0.300, 밤면하단 0.046) 차이는 스칼라 floor (A) 로는 재현 불가 → terminator 부근에서 단색 행성과 톤이 어긋나 **부분적 회귀 잔존** 위험. (B) 는 `mix(ground, sky, dot(N,up)*0.5+0.5)` 를 그대로 재현해 완전 일치.
- 상수 SSoT 재사용: `SUN_INTENSITY(2.5)`, `SUN_DIFFUSE(1,0.95,0.8)`, `AMBIENT_INTENSITY(0.3)`, `AMBIENT_GROUND_COLOR_RGB(0.15,0.15,0.18)`, sky(흰색), up `(0,1,0)` 을 scene 상수에서 uniform 으로 전달 (rendering-only, 데이터 SSoT 무관). **셰이더가 독립 상수를 재선언하면 drift** (volt #69) → scene 상수 SSoT 를 uniform 으로만 주입. **단, sunLight intensity 등 일부는 현재 scene 내 로컬 상수 (`sunLight.intensity = 2.5`) 라, 셰이더 일관성을 위해 이들을 export 상수로 승격 후 SSoT 재사용** (developer 인수인계 — 마법 숫자 중복 금지).
- (C) 는 #773 비목표 (단색 행성 23개는 현행 StandardMaterial 유지). 통합은 scope creep — 기각.

> **단순화 여지 (developer 실측 판단 위임)**: (B) 가 이론적 완전 일치이나, 실 Chrome GUI 에서 (A) 스칼라 floor 로도 사용자가 "일치" 로 인지하면 (B)의 up/sky uniform 2개는 과잉일 수 있다. **developer 는 (B) 를 1차 구현하되, qa 실 GUI 비교에서 (A) 대비 (B) 의 시각 이득이 인지 불가하면 (A) 로 단순화 가능** (measurement-first — ADR Amendment 박제). 단 §A1.2-3 측정상 terminator 차이 (0.173 vs 0.046, 3.7배) 는 인지 가능 영역이라 (B) 우선.

#### 결정 3 — 절차 변조 합성 순서 (회귀 0)

현행 fragment 는 `col = baseColor 변조` → `col *= shade` (line 268). 광원 모델 교체 후에도 **합성 순서 유지**:

1. baseColor 위 절차 변조 (대륙/밴드/크레이터/대륙mix) → `col`
2. `col *= shade_new(N, uSunDirection)` — 광원 명암을 변조 결과 위에 곱셈

→ 절차 디테일 (#756 고주파 엔트로피) 은 변조 단계에서 생성되고, 광원은 그 위에 곱해지므로 **디테일 무회귀** (밤면에서도 대륙/밴드 패턴은 존재하되 어두움). #756 DoD 고주파 엔트로피 가드 유지 (단, ON/OFF 측정 시 밤면이 어두워져 절대 엔트로피가 낮아질 수 있음 — qa 는 **낮면(태양 정면) 기준 측정** 으로 #756 가드 재현).

#### 결정 4 — #775 지구 대륙 색 mix + 육지색 SSoT

rocky 셰이더 (uSurfaceType==0) 의 현행 `col = baseColor * (1.0 + mod_)` (밝기 변조만) 를 **ocean ↔ land 색 mix** 로 교체:

```glsl
float continents = fbm(p * 2.4);
float landMask = smoothstep(LAND_THRESHOLD_LO, LAND_THRESHOLD_HI, continents);
col = mix(oceanColor, landColor, landMask);
// (선택, 후속 가능) 해안선 대비 / 극관 — 1차 비목표
```

**육지색 SSoT 결정 — 코드 상수 채택** (`colorHint` 데이터 확장 기각):

| 축               | (A) 코드 상수 (`procedural-planet-shader.ts` 미학 상수)         | (B) 데이터 `colorHint` 확장 (2색)                          |
| ---------------- | --------------------------------------------------------------- | ---------------------------------------------------------- |
| 데이터 SSoT 정합 | ✓ rocky 변조용 land 색 = rendering-only 미학 (§Visual Fidelity) | ✗ colorHint 는 단색 1개 SSoT — 2색은 rendering 관심사 누수 |
| #756 패턴 정합   | ✓ `ROCKY_CONTRAST` 등 변조 상수와 동일 레이어                   | △ 데이터 스키마 변경 (#756 §결정 2 C 와 상충)              |
| 확장 비용        | 상수 1줄                                                        | 데이터 파일 + 스키마                                       |

→ **(A) 코드 상수**. `LAND_COLOR_RGB` (갈색/녹색 — 예: 자연색 `(0.40, 0.45, 0.28)` 류 올리브-브라운, 실측 자연색 R/G 우세) + `LAND_THRESHOLD_LO/HI` 를 `procedural-planet-shader.ts` 미학 상수 SSoT 에 추가. ocean 색 = 기존 `baseColor` (colorHint.hex, 데이터 SSoT read-only) 유지. #756 §결정 2 (C) "표면 분류 = 코드 상수" 의 자연 연장 — 데이터 변경 0.

- **보라/마젠타 anti-pattern 가드 유지**: land 색은 R/G 우세 자연 톤 (B 결핍) → `surfaceColorMirror` 의 보라/마젠타 부재 어서션 자동 충족. 단위 테스트가 mix 출력 색역도 검증 (landMask 0/0.5/1 샘플).
- mix 는 색조(hue) 분리이므로 land/ocean 휘도 차이 + 색조 차이 둘 다 발생 → "바다만" 회귀 해소.

### A1.4 Concrete Prediction (구현 후 `git diff --stat` 실측 재현)

| 영역                      | 파일                                                           | 예측 라인        | 근거                                                                                                                                                                                                                                                             |
| ------------------------- | -------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **셰이더 광원식**         | `procedural-planet-shader.ts` (FRAGMENT_SHADER)                | ~15–30 변경      | `shade` 식 교체 (uSunDirection + ambient hemi mix + smoothstep soft terminator) + uniform 선언 (uSunDirection, ambientGround, ambientSky, ambientUp, sunIntensity, sunDiffuse) + `SOFT_TERMINATOR_WIDTH` 미학 상수                                               |
| **셰이더 대륙 mix**       | `procedural-planet-shader.ts` (rocky 분기 + 상수)              | ~10–18 변경/신규 | rocky 분기 mix 교체 + `LAND_COLOR_RGB`/`LAND_THRESHOLD_*` 상수 + uniform                                                                                                                                                                                         |
| **onBind sunDir 배선**    | `procedural-planet-shader.ts` (createProceduralPlanetMaterial) | ~18–30 변경      | sun position provider 인자 + onBindObservable 클로저 (sunDir 계산 + setVector3, **tmpVector 재사용 = alloc 0** cross-validate 이견 2) + ambient/sun 상수 uniform 전달 + **dev-only 회전 어서션** (mesh rotation non-zero 시 console.warn, cross-validate 이견 3) |
| **JS 미러 갱신**          | `procedural-planet-shader.ts` (surfaceColorMirror)             | ~15–25 변경      | rocky mix 미러 + 광원식 미러 (shade_new) — 단위 테스트 SSoT                                                                                                                                                                                                      |
| **scene sun 상수 export** | `solar-system-scene.ts`                                        | ~5–12 변경       | `sunLight.intensity/diffuse` 를 export 상수 승격 + provider 콜백 전달 (createProceduralPlanetMaterial 호출 2곳: createBodyMesh/createBodyMeshMid)                                                                                                                |
| **단위 테스트**           | `procedural-planet-shader.test.ts`                             | ~40–80 신규      | 광원식 미러 (밤면<낮면 단조) / 대륙 mix (landMask 0/1 색 분리) / 보라-마젠타 부재 / 상수 SSoT drift / 회전 도입 시 normalMatrix 계약                                                                                                                             |
| **데이터**                | `solar-system.json`                                            | **0**            | 육지색 = 코드 상수 (결정 4 A). 데이터 불변                                                                                                                                                                                                                       |

**핵심 예측**:

- **데이터 파일 변경 0** — 육지색 코드 상수 수렴. 실패 (데이터 수정) 시 = SSoT 누수 신호.
- **picking / camera / orbit / tier / LOD 변경 0** — 광원/색은 fragment uniform 만, mesh 기하/metadata/위치 불변. `mesh.position` 루프 (line 1159) / sunLight 갱신 (line 1208) 은 **기존 코드 그대로 재사용** (sunDir provider 가 그 값을 읽기만).
- **scene 배선 ≤ 12줄** — sun 상수 export + provider 콜백 2곳 전달. 초과 시 = 광원 모델이 scene 레이어를 침범 (재검토).

### A1.5 DoD (측정 가능 — 실 Chrome GUI 필수, CRITICAL #3 + #756 헤드리스 false positive 교훈)

1. **밤면/terminator 일관성** — 지구/화성/목성/달이 단색 행성 (금성/토성 등) 과 **동일하게 밤면 어두움 + terminator** 표시 (실 Chrome GUI 스크린샷). 낮/밤 휘도 대비비 ≥ 5x (단색 행성 14.74x 의 보수적 하한 — 변조 디테일이 밤면 휘도를 살짝 올릴 수 있어 완화).
2. **태양 추종 명암 + soft terminator** — 시간 진행 (공전) 또는 카메라 회전 시 명암 경계 (terminator) 가 **태양 위치를 따라 이동** (고정 방향 아님). focus=earth 에서 시간 가속 후 terminator 이동 관찰. 광원식은 `shade = ambient_hemi(N) + sun * smoothstep(0.0, SOFT_TERMINATOR_WIDTH, dot(N, uSunDirection))` (cross-validate 이견 수용 1 — segments 12/32 의 terminator 톱니 aliasing 완화). terminator 경계가 각지지 않고 부드럽게 전이.
3. **단색 행성 톤 일치** — terminator 부근에서 표면 셰이더 행성과 인접 단색 행성의 밤면/낮면 톤이 시각적으로 이질감 없음 (결정 2 B 검증 — qa 가 (A) 스칼라 대비 (B) 이득 인지 여부 측정 후 단순화 가능 판정).
4. **지구 대륙 시각 구분** — 지구에 갈색/녹색 대륙 + 파란 바다 명확 구분 (실 Chrome GUI). land/ocean 색조(hue) 차이 측정 가능.
5. **절차 표면 무회귀** — #756 고주파 엔트로피 가드 PASS (**낮면 기준 측정** — 밤면은 광원으로 어두워져 절대 엔트로피 하락 정상). 지구/화성/목성/달 ON > OFF 유지.
6. **보라/마젠타 0** — 출력 색역 anti-pattern 0 (단위 테스트 + 실 GUI). land 색 R/G 우세.
7. **fps 회귀 0** — tier-a/b/c (CI swiftshader 포함) fps-baseline-guard PASS. 광원식은 fragment 추가 dot/mix 수 개 (per-pixel 경량) — tier-c 는 #756 §결정 3 대로 `forceOverride:'low'` 자동 단색 우회 (표면 셰이더 미진입).
8. **회전 계약 박제** — 셰이더 주석 + 단위 테스트에 "world normal == local normal 은 회전 0 전제, self-rotation 도입 시 normalMatrix 필요" 계약 명시 (drift 가드).

### A1.6 §Visual Fidelity 의무 체크리스트 (회귀 수정이라 왜곡 도입 아님 — 일치 확인)

- [x] **데이터 SSoT 보존** — 광원 상수 (sun intensity/diffuse, ambient ground/sky/up) + 육지색 (`LAND_COLOR_RGB`) 은 **rendering-only 상수** (scene/셰이더 레이어). `solar-system.json` 의 radius/colorHint.hex/궤도 직접 수정 0. ocean 색 = colorHint.hex read-only.
- [x] **rendering 시점 분리** — 광원/색은 fragment 단계, physics 엔진 (Rust+wasm) 무의존. P11-A 좌표 계약 위반 0.
- [x] **사용자 D-T2 가이드** — 광원 명암/대륙 색은 순수 시각 표현. focus/Info 패널은 실측값 (반경 km / 색상 출처) 유지. 절차 변조/명암은 표기 대상 아님 (#756 동일).
- [x] **점유율 / 사실 비율 baseline** — 광원/색은 mesh 크기/위치 불변 (diameter 식 무변경) → px diameter / 점유율 / 분리 마진 영향 0. r1-guard baseline 은 표면 픽셀 명암 변경 (밤면 추가) 으로 재생성 — qa 가 실 Chrome GUI 로 박제.

### A1.7 교차검증 반영 사항

cross-validate (Antigravity `agy`) 1회 수행 (2026-06-30, outcome=applied, exit 0, plan_bypass=false, rollback_failed=false). 로그: `.claude/logs/cross-validate-architecture-20260630-233707.log`.

**호출 전 Claude 편향 셀프 체크** (4종): 낙관적 일정 (onBind 배선 ~12줄 과소평가 의심) / 결합 간과 ("회전 0 → world==local normal" 단정 + satellite/uniform scaling 의존) / 폐기 프레이밍 (기존 간이 shade 를 "회귀" 로 폐기 — 사용자 실측 회귀라 통과) / 순수주의 (결정 2 B HemisphericLight 완전 재현 선호가 과잉설계인가). **미통과 의심 3축 (결합 간과 / 순수주의 / 낙관적 일정) 을 cross-validate 프롬프트에 명시 질문으로 삽입** → 이하 합의/이견에서 검증.

#### 합의 (현재 PR 즉시 반영 / 셀프 체크 통과 확인)

1. **onBindObservable + provider 콜백 = 결합도 낮춤** [결정 1] — agy 가 "Scene 레이어가 셰이더 내부 uniform 을 직접 추적하지 않으면서 렌더 직전 데이터 주입 = 결합도 낮추는 훌륭한 패턴" 으로 호평. 옵션 (d) Map 추적 대비 우월성 교차 확인.
2. **HemisphericLight 완전 재현 = 시각 이질감 차단** [결정 2 B, 순수주의 축 통과] — agy 가 "단순 스칼라 floor 대신 hemispheric 공식 재현 = 낮/밤 경계 및 극지점 점진 톤 그라데이션 차이로 발생할 이질감을 완벽 차단하는 타당한 결정" 으로 (B) 를 명시 지지. **순수주의 의심 해소** — terminator/극 톤 차이 (측정 §A1.2-3, 0.173 vs 0.046) 가 인지 가능 영역이라 (B) 가 과잉설계 아님이 외부 모델로 교차 확인됨. 단 §A1.8 재검토 조건 1 (qa 실 GUI 단순화 판정) 은 유지.
3. **데이터 SSoT 코드 상수 격리** [결정 4] — 표면/육지색 코드 상수 격리를 "물리 시뮬레이션 순수성 보존" 으로 합의.
4. **tier-c forceOverride 자동 우회 + `?surface=off` 회귀 baseline** — fps 보호 + 복구 baseline 인터페이스 호평.
5. **회전 0 전제 + normalMatrix 후속 계약** [결합 간과 축 부분 통과] — agy 가 "world normal == local normal 은 회전 0 절대 의존, 자전/axialTilt 도입 시 normalMatrix 필수" 를 Claude 와 동일 인지. 단 **방어적 어서션 추가 권고** (이견 3 으로 격상).

#### 이견 수용 (원안 수정)

1. **Soft Terminator (smoothstep 경계 완화) 1차 선반영** — Claude 원안은 terminator aliasing 을 §재검토 조건 3 (후속) 으로 분류. agy 가 "segments mid(12)/high(32) 의 곡면 법선 변화가 조밀하지 못해 `clamp(dot(N,L),0,1)` 단순 적용 시 경계가 톱니처럼 각짐 → `smoothstep(0.0, 0.1, dot(N,L))` Soft Terminator 를 설계에 포함" 권고. **수용 (격상)** — 추가 비용이 `clamp → smoothstep` 1줄이라 후속 분리보다 선반영이 효율적. **결정 2 의 광원식을 `shade = ambient_hemi + sun * smoothstep(0.0, SOFT_TERMINATOR_WIDTH, dot(N,L))` 로 확정** (DoD 2 에 흡수). `SOFT_TERMINATOR_WIDTH` 미학 상수 SSoT 추가.
2. **onBind Vector3 GC 회피 (tmpVector 재사용)** — Claude 원안 미명시. agy 가 "onBind 가 매 프레임×mesh 호출이라 sunDir 계산에서 매번 `new Vector3` alloc 시 GC 병목 → 팩토리 스코프 사전 할당 tmpVector 갱신·정규화 전달" 권고. **수용** — developer 인수인계 + Concrete Prediction (onBind 배선) 에 "tmpVector 재사용 (alloc 0)" 계약 명시.
3. **방어적 회전 어서션 (dev only)** — Claude 원안은 회전 0 전제를 주석 + 단위 테스트 계약으로만 박제. agy 가 "런타임에 mesh rotation/quaternion 적용 여부 체크 후 경고 throw 하는 방어적 어서션 추가" 권고. **수용 (dev-only)** — onBind 에서 `mesh.rotationQuaternion` 또는 `rotation` non-zero 감지 시 dev 빌드 `console.warn` (floating-origin assert 패턴 — `process.env.NODE_ENV` DCE). 단위 테스트 계약과 직교하는 런타임 가드.

#### Claude 재분석으로 기각한 외부 모델 제안

1. **noise 입력 좌표 modulo 클램핑 (정밀도 손실 방지)** (agy 보안 ⑤) — **기각**. 본 셰이더의 noise 입력은 `p = normalize(vLocalPos)` 단위 벡터 (|p| ≤ 1) 기반이다 (FRAGMENT_SHADER line 221). fbm/cell noise 입력 최대 스케일은 `p * craterDensity(14)` = 최대 |14| 로 부동소수점 정밀도 손실 영역 (≥ 1e5 류) 과 무관. starfield/ring-shader 도 동일 단위 벡터 패턴으로 무문제 실증. 좌표 bounding 은 이미 normalize 로 구조 보장 — 추가 modulo 불요. (agy 가 "입력 좌표가 커질수록" 조건부 제안 — 본 셰이더는 그 조건 미해당.)
2. **씬 dispose/재생성 (URL 플래그 런타임 변경 정합성)** (agy 구조 ①) — **비대상**. `?surface=off` 는 #756 §결정 4 (A) 대로 **생성 시점 분기 (URL-only, 런타임 토글 비목표)**. URL 변경 → 런타임 머티리얼 교체 시나리오 자체가 존재하지 않으므로 dispose/재생성 정합성 검토 불요. 광원 모델은 surface ON 경로에만 적용 — 무관.
3. **specular(0.05) 재현** (추가 검토 질문) — **기각 (무시)**. 단색 행성 specular (0.05,0.05,0.05) 는 미미한 하이라이트로 시각 인지 거의 0. #773 핵심은 diffuse 명암 (낮/밤/terminator) 일치이며, specular 재현은 과잉 (셰이더 복잡도 ↑, 시각 이득 ≈ 0). DoD 는 "diffuse 명암 일치" 로 충분.

#### 고유 발견 (범위 판정 — 후속 분리 후보)

1. **대기/구름 레이어 블렌딩 순서 + depth 우선순위** (agy 누락 ⑥-2) — **후속 분리 후보 (현재 비대상)**. agy 가 "지구 표면 위 투명 대기/구름 셰이더 mesh 겹침 시 알파 블렌딩/depth 우선순위 미정리하면 렌더 순서 오류" 지적. **현재 프로젝트에 대기/구름 mesh 가 미구현** 이므로 본 Amendment 범위 밖 (비목표와 직교 — #775 본문도 "구름 레이어 = 선택/후속"). 대기/구름 도입 시점에 별도 이슈로 분리 (그때 표면 셰이더의 log-depth 기록 § 핵심 위험 1 과의 정합 검토). 현재는 ADR §재검토 조건 5 로 맥락 박제 (즉시 이슈 생성은 mesh 부재로 맥락 빈약 → 도입 시 분리). 메인이 즉시 분리 vs 기록 최종 판단.

### A1.8 결과 · 재검토 조건

**기대 결과**:

- 지구/화성/목성/달 밤면 + terminator (단색 행성 일관), 태양 추종 명암.
- 지구 갈색/녹색 대륙 + 파란 바다 구분.
- 단색 23 body + 절차 디테일 무회귀, fps 회귀 0.

**재검토 조건**:

1. **(A) 스칼라 floor 로 충분** (qa 실 GUI 에서 (B) hemispheric 재현 이득 인지 불가) — (A) 로 단순화 (Amendment 2, up/sky uniform 제거).
2. **self-rotation / axialTilt 도입** — `vNormal` world matrix 변환 (normalMatrix uniform) 필요 → 옵션 (e) 전환 (셰이더 주석 계약 발동).
3. **terminator aliasing 잔존** — soft terminator (smoothstep, cross-validate 이견 1) 로 1차 완화했으나 segments=12 (mid) 에서 여전히 각지면 `SOFT_TERMINATOR_WIDTH` 확대 또는 per-pixel normal 보간 검토 (Amendment 2).
4. **다른 rocky body 추가** — 화성도 미래에 land mix 요구 시 rocky 분기 land 색을 body별 상수로 확장 (현재 earth 만 Rocky).
5. **대기/구름 레이어 도입** (cross-validate 고유 발견 1) — 지구 표면 위 투명 대기/구름 셰이더 mesh 도입 시 알파 블렌딩 + depth 우선순위 (표면 셰이더 log-depth § 핵심 위험 1 과의 정합) 검토 필요. **현재 대기/구름 mesh 미구현이라 본 Amendment 범위 밖** — 도입 시점에 별도 이슈로 분리 (맥락 박제용 기록).

---

## Amendment 2 (2026-07-01) — 행성 self-rotation (자전) + 광원 world normal 옵션 e 전환 (#782)

- **상태**: Accepted (cross-validate 2026-07-01 — §A2.8 4축 박제 완료). 광원 모델 변경 + 프로젝트 시각 원칙 확장이라 §교차검증 박제 직후 1회 루틴 대상이었으며, cross-validate §A2.8 통합 후 Accepted 전이.
- **이슈**: [#782](https://github.com/coseo12/astro-simulator/issues/782) (type:feat, medium, group:B-render, 트랙 A 몰입)
- **형식**: Amendment 1 이 §A1.3 결정 1 에서 **"회전 0 전제 → self-rotation 도입 시 옵션 e 전환"** 을 명시 예비했다 (§A1.5 DoD 8 회전 계약, §A1.8 재검토 조건 2). 본 Amendment 2 는 그 예비된 전환의 실현이다. **일반 ADR Amendment** 로 시작하되, 광원 모델 (world normal) 변경 + snapshot 가드 대응이 다중 옵션 비교를 요구하므로 축별 비교 구조를 채택한다. (Forensic 5조건 중 runtime 측정 필수/DoD PASS 인데 회귀 2조건 미해당 — 회귀 수정이 아닌 신규 기능이라 일반 Amendment.)

### A2.1 배경 — Amendment 1 이 남긴 예비 전환점

Amendment 1 §A1.3 결정 1 은 광원 모델을 **"body mesh 회전 0 + uniform scaling → world normal == local normal"** 단순화 위에 세웠다. `vNormal`(local) 을 `normalMatrix` 변환 없이 광원 dot 에 직접 사용 (옵션 e 회피). 이 단순화는 3중 가드로 박제됐다:

1. 셰이더 주석 (`procedural-planet-shader.ts:30-32, 296-298`) — "회전 0 전제, 도입 시 옵션 e".
2. onBind dev-only 회전 어서션 (`:559-578`) — mesh rotation non-zero 시 `console.warn` (cross-validate 이견 3 수용).
3. 단위 테스트 계약 (`procedural-planet-shader.test.ts:426-443`) — `normalMatrix` 부재 + `vNormal` 직접 사용 + 주석 계약 존재 검증.

self-rotation 도입은 이 3중 가드를 **의도적으로 발동**시킨다 — 즉 본 Amendment 는 가드가 "감지하려고 설계된 바로 그 변경"이다. 광원 모델을 옵션 e (world normal) 로 전환해야 어서션이 해소되고 명암이 자전과 무관하게 태양을 정확히 추종한다.

**self-rotation 미구현의 현 상태** (이슈 실측 확인):

| 요소                     | 현재                                                                                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rotationPeriod` 데이터  | **없음** (`solar-system.json` 에 orbit 공전 요소만)                                                                                                                                       |
| 자전 애니메이션 코드     | **없음** (`updateAt` mesh 루프는 `mesh.position` 만 갱신, `:1213`)                                                                                                                        |
| `axialTiltDeg` body 적용 | **없음** — ring tilt 전용 (`disc.rotation.x = π/2 + tiltRad`, uranus/saturn/neptune 3개만). 데이터 코멘트가 "본체 자전/텍스처 미구현이라 host 통합 불필요" 명시 (`solar-system.json:357`) |

### A2.2 코드베이스 실측 (설계 결정의 근거)

Grep/Read 로 확인한 구조적 사실 (재조사 불필요, 검증 완료):

1. **mesh 추적**: `meshes: Map<string, Mesh>` 가 high variant 의 유일 owner (`:561`). mid variant = `parent = highMesh` + `position.set(0,0,0)` (`:1986-1988`). low variant = `parent = highMesh` + `billboardMode = 7` (`:2194-2196`). **→ high mesh 에 rotation 적용 시 mid 는 parent transform 상속으로 자동 동기 회전** (LOD 동기 문제 자동 해소). low(billboard) 는 BILLBOARDMODE_ALL 이 orientation 을 카메라로 override 하므로 자전이 시각 무효 (표면 없는 quad — 회전 무의미, 무회귀).
2. **position vs rotation 독립성**: `updateAt` mesh 루프 (`:1208-1218`) 는 `mesh.position` 만 매 프레임 재기록 (floating-origin `toLocal` + tier scale). **rotation 은 이 루프가 절대 건드리지 않는다** → 자전 회전을 별도로 설정해도 position 갱신과 충돌 0. `mesh.scaling` 도 tier 전환에서만 조작 (`:930`), rotation 과 직교.
3. **satellite (달)**: worldPositions 가 sun-중심 절대 좌표라 달 mesh 는 **parent 상속이 아닌 독립 position** (`meshes.get('moon')` 도 worldPositions 루프에서 직접 갱신). 자전은 각 body 독립 — 달도 자기 mesh 에 독립 회전.
4. **time SSoT**: scene 은 `updateAt(jd)` 로 구동 (`instance.on('timeChanged', ({julianDate}) => solar.updateAt(julianDate))`, sim-canvas). `jd` (julianDate) 가 유일 시간 진실원 — `currentJd = jd` (`:1148`). timeScale 은 core `TimeController.tick(dt)` 이 흡수해 jd 증분에 반영됨 (`simulation-core.ts:315`). **→ 자전각을 `jd` 의 순수 함수로 계산하면 timeScale 자동 연동 + frame-rate 독립 + 결정적** (accumulate 불필요).
5. **⚠️ ring 자식 결합 (핵심 위험)**: ring disc 는 `disc.parent = host` (`ring-placeholder.ts:112`, `ring-shader.ts:658/702`). tier scale 전파 목적의 의도된 결합. **body mesh 에 직접 self-rotation 을 걸면 ring disc 가 body 자전과 함께 스핀** → ring axialTilt 가 매 프레임 회전축 주위로 wobble (R8 세로 고리 showcase 붕괴). jupiter (GasBands 표면 + rings) / saturn·uranus·neptune (단색 + rings) 전부 해당.

### A2.3 결정

#### 결정 1 — 회전 적용 구조 (mesh.rotation 직접 vs pivot node vs quaternion 합성, ring 결합 대응 포함)

axialTilt 로 기운 축 주위로 spin 해야 한다 (tilt ∘ spin 합성). 그리고 §A2.2-5 의 ring wobble 을 차단해야 한다.

| 축                | (a) host mesh 에 `rotation.y += ω·Δ` 직접 | (b) host mesh `rotationQuaternion = tilt ∘ spin` 직접 | (c) **spin 전용 자식 pivot node** (surface mesh 를 pivot 자식으로, ring 은 host 직속 유지) | (d) 부모 tilt pivot + 자식 spin                           |
| ----------------- | ----------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| axialTilt 합성    | ✗ y축만 (tilt 무시)                       | ✓ quaternion 합성                                     | ✓ pivot 이 tilt·spin quaternion 보유                                                       | ✓ 계층 분리                                               |
| ring wobble 차단  | ✗ ring 이 host 자식이라 함께 스핀         | ✗ 동일 문제                                           | ✓ **ring 은 host 직속 (spin pivot 밖) → tilt 유지·spin 미전파**                            | ✓ ring 을 tilt pivot 밑에 두면 tilt 추종 spin 회피 (복잡) |
| tier scale 독립   | ✓ (scaling 별개)                          | ✓                                                     | ✓ (pivot scaling=1, host.scaling 이 tier)                                                  | △ 2단                                                     |
| origin shift 독립 | ✓ (position 별개)                         | ✓                                                     | ✓ (pivot position=0, host.position 이 origin)                                              | ✓                                                         |
| mid variant 동기  | ✓ parent 상속                             | ✓                                                     | △ **mid 도 pivot 자식이어야 동기** (parent 재배선)                                         | △                                                         |
| 코드 표면         | 소                                        | 소                                                    | 중 (pivot node 신설 + surface/mid 재parent)                                                | 대                                                        |
| picking 무영향    | ✓                                         | ✓                                                     | △ pivot 이 picking 계층에 추가 (metadata bodyId 재확인)                                    | ✗                                                         |

→ **(b) `rotationQuaternion = tilt ∘ spin` 직접 채택 + ring 결합은 (c)-부분 (ring 을 spin 에서 격리) 로 대응**. 근거:

- **회전 합성은 (b) quaternion 이 최소**. `q = Quaternion.RotationAxis(tiltAxis, tiltRad) × Quaternion.RotationAxis(localSpinAxis, spinAngle(jd))` — axialTilt 로 pole 을 기울인 뒤 그 (기운) 축 주위로 spin. mesh.rotation.y 직접 (a) 는 tilt 를 표현 못 하고, pivot node (c/d) 는 picking 계층·mid 재parent 비용이 크다.
- **ring wobble 차단 = ring disc 를 spin 에서 격리**. 두 하위 옵션 비교 (§A2.3 결정 1-b 로 분리):

  | 하위 축        | (b-i) ring 을 host **비회전 wrapper** 밑으로 (host 는 spin 안 함, surface mesh 만 spin) | (b-ii) ring disc 에 **역회전 보정** (host spin 의 inverse 를 ring 에 매 프레임) | (b-iii) ring disc 를 host 자식에서 **분리** (독립 position 동기, satellite orbit line 패턴)    |
  | -------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
  | 구현           | host=위치+tilt wrapper, 표면 sphere=spin 자식 (구조 재편)                               | ring 매 프레임 `-spinAngle` (연산·drift 위험)                                   | ring 을 `updateAt` 에서 host scene 좌표로 position 동기 (기존 satelliteOrbitLines 패턴 재사용) |
  | ring tilt 보존 | ✓ (spin 밖)                                                                             | △ (역회전 float drift 잔존)                                                     | ✓ (host tilt 를 ring 생성 시 1회 반영)                                                         |
  | tier scale     | host.scaling 전파 유지                                                                  | 유지                                                                            | ✗ **ring 이 host.scaling 밖 → tier 전파 끊김** (재배선 필요)                                   |
  | 코드 표면      | 중 (surface mesh 를 host 자식 sphere 로 분리 = 대공사)                                  | 소 (but drift 위험)                                                             | 대 (ring tier scale 재설계)                                                                    |

  → **cross-validate 확정 (§A2.8 이견 수용 1)**: **(b-i) 계층 재편은 과설계, (b-ii) 역회전은 매 프레임 inverse 곱 + wobble 잔존 위험, (b-iii) 는 tier scale 끊김**. agy 권고 수용 — **scene graph 계층 노드 분리** 로 wobble 을 **구조적으로 0** (역회전 계산 자체 불필요). **최종 확정 구조**:
  - **ring 없는 body (대다수)**: `host` mesh 자체에 `rotationQuaternion = tilt ∘ spin` 직접 적용 (저비용, mid variant parent 상속 자동 동기).
  - **ring 있는 body (jupiter/saturn/uranus/neptune)**: `host` mesh (position/scale/origin owner) 아래에 2개 자식 노드 명시 분리:
    - **spin pivot** (`${id}-spin-pivot`) — 표면 sphere(high) + mid variant 를 자식으로 두고 `rotationQuaternion = tilt ∘ spin` 보유. body 자전.
    - **ring anchor** (`${id}-ring-anchor`, 비회전 TransformNode) — ring disc 를 자식으로 두어 tilt 만 반영 (`disc.rotation.x = π/2 + tiltRad` 기존 유지), spin 미상속 → **wobble 0**.

  Babylon TRS 상속이 spin 을 spin-pivot 자식(표면)에만 전파하고 ring-anchor(비회전)에는 전파하지 않아, 역회전 보정 없이 ring tilt 가 구조적으로 고정된다. **비용**: ring host 4개 한정 mid variant 재parent (spin pivot 자식) + picking metadata bodyId 재확인 (Concrete Prediction §A2.4 scene 배선 ~35–55 로 상향, ring host 만). §A2.7 재검토 조건 1 은 이 계층 비용이 실측 초과할 경우로 축소.

  > **구현 정정 (Amendment 2-i, #782 PR — 계층 위상 조정, 동일 보장 유지)**: 위 확정 구조는 host 를 **비회전 owner** 로 두고 표면(high)을 spin-pivot 자식으로 **재parent** 하는 위상을 명세했다. 그러나 실측 결과 high mesh 는 `meshes` Map 의 유일 owner 이자 position/scale/surface/picking/LOD-parent 역할을 동시에 지므로, 표면을 spin-pivot 자식으로 내리면 **tier scaling (`:930` `mesh.scaling.setAll`) / LOD parent (`:1425`) / picking metadata / position 루프 (`:1213`) 전반에 재배선 파급** → Concrete Prediction "picking/camera/orbit/tier/LOD 변경 0" 위배. **채택 위상 (동일 보장, 최소 파급)**: high mesh = position/scale/surface/**spin** owner 유지 (ring 없는 body 와 동일 경로 — host 직접 spin). ring disc 는 host 자식이 아닌 **ring-anchor (비회전 top-level TransformNode) 자식**으로 재parent 하고, updateAt 이 anchor 의 `position`/`scaling` 을 host 값으로 매 프레임 동기 (rotation 제외). ring 은 host 자전을 **애초에 상속하지 않으므로** (자식이 아님) wobble 이 구조적으로 0 — cross-validate 이 기각한 b-ii (역회전 매 프레임 곱) 는 사용 안 함, agy 가 우려한 b-iii "tier scale 끊김" 은 updateAt 2줄 (`anchor.scaling.copyFrom(host.scaling)` + position) 로 해소 (재설계 아님). **결과**: 확정 구조의 핵심 보장 (구조적 wobble 0 + 역회전 없음) 을 그대로 달성하면서 tier/LOD/picking 파급 0 (Concrete Prediction 정합). verify 실측 ring normal Δ: jupiter 1.2e-6°, saturn/uranus/neptune 정확히 0° (body spin π/2 진행 중). 재검토 조건 1 은 이 anchor 동기 2줄 비용이 실측 문제될 경우로 재정의.

- **tier scale / origin shift 독립성**: rotationQuaternion 은 `mesh.scaling` (tier), `mesh.position` (origin shift) 과 Babylon 변환 행렬에서 독립 성분 (TRS 분해). §A2.2-2 실측대로 position 루프가 rotation 을 건드리지 않으므로 충돌 0.

#### 결정 2 — 광원 옵션 e (world normal) 전환

Amendment 1 옵션 e (§A1.3 결정 1 표) 를 활성화. 회전이 생기면 `vNormal`(local) ≠ world normal 이므로 광원 dot 이 표면과 함께 회전해 명암이 자전을 따라 돌아버린다 (밤면이 태양을 안 따름). world normal 로 변환해야 명암이 태양 방향에 고정된다.

| 축                | (A) `uniform mat4 world` → `vNormal = (world × vec4(normal,0)).xyz`                                                              | (B) `uniform mat3 normalMatrix` (inverse-transpose) → `vNormal = normalMatrix × normal` |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 정확성            | ✓ **uniform scaling + rotation (shear 없음)** 이면 world×normal 정규화로 충분 (§A2.2-2 tier scaling 은 uniform `scaling.setAll`) | ✓ 일반 (비균일 scale 포함) 정확 — 과잉                                                  |
| Babylon auto-bind | ✓ `world` 는 Babylon ShaderMaterial 표준 auto-bind uniform (worldViewProjection 과 동형)                                         | △ `world` 로부터 CPU 계산 or auto-bind 확인 필요                                        |
| 코드 표면         | 소 (uniform 1개 + vertex 1줄 + fragment normalize)                                                                               | 중 (normalMatrix 계산·전달)                                                             |
| vLocalPos 처리    | **local 유지** (절차 패턴이 mesh 와 함께 회전 = painted-on 표면)                                                                 | 동일                                                                                    |

→ **(A) `uniform mat4 world` 채택**. 근거:

- **uniform scaling 실측**: tier scale 은 `mesh.scaling.setAll(absoluteScaling)` (`:930`) 로 **등방(uniform)** — shear 없음. self-rotation 은 순수 회전 (scale 무관). uniform scale + rotation 조합에서 `normalize((world × vec4(normal,0)).xyz)` 는 normalMatrix (inverse-transpose) 와 동일 결과 (등방 scale 은 inverse-transpose 가 자기 자신의 상수배). **normalMatrix (B) 는 비균일 scale 대비용이라 과잉** — Amendment 1 표에서 옵션 e 를 "normalMatrix 필요 (회전 0 이라 과잉)" 로 기술했으나, 회전 도입 후에도 **uniform scale 이면 world matrix 로 충분** (normalMatrix 불요) — 이 정정을 Amendment 2 가 박제.
- `world` 는 Babylon `ShaderMaterial` 이 `worldViewProjection` 과 함께 표준 제공하는 auto-bind uniform (uniforms 배열에 `'world'` 추가 시 자동 주입).
- **vLocalPos 는 local 유지**: 절차 노이즈 (대륙/밴드/크레이터) 입력은 `normalize(vLocalPos)` (local) — 표면 패턴이 mesh 와 함께 회전해야 "표면에 그려진(painted-on)" 것으로 보인다. world 로 바꾸면 패턴이 공간 고정되어 mesh 가 패턴 속을 미끄러지는 오류. **vNormal 만 world 로, vLocalPos 는 local** — 이 분리가 핵심.
- **onBind sunDir 정합**: sunDir 은 이미 `normalize(sunPos_world − meshPos_world)` (world, §A1.3 결정 1 c). world normal 과 동일 좌표계라 dot 정합 — onBind 로직 무변경 (sunDir 계산부 그대로).

#### 결정 3 — `axialTiltDeg` body 자전축 적용 + 데이터 SSoT 재사용

기존 `axialTiltDeg` (ring 전용, 3개 body) 를 **body 자전축에도 적용**. ring host 와 body 가 **동일 값** 사용 (정합 — obliquity 는 물리적으로 하나).

- ring 은 `disc.rotation.x = π/2 + tiltRad` 로 이미 사용 → body spin 축도 동일 `axialTiltDeg` 로 tilt. **데이터 SSoT 1값이 ring + body 양쪽 구동** (drift 0).
- 신규 body 값 추가 필요 (자전하는 모든 표면/단색 body): earth 23.44°, mars 25.19°, jupiter 3.13°, moon 6.68° (궤도면 기준) 등. **축 방위각 (azimuth)** 은 uranus 코멘트 (`:527`) 대로 **world X 고정 근사** (pole RA/Dec 미사용) — ring 이 이미 쓰는 근사 답습 (Visual Fidelity rendering-only, 사실 pole 정렬은 후속).

#### 결정 4 — `rotationPeriod` 데이터 (단위·부호·범위)

| 축              | (A) 시간 단위 (hours)                               | (B) 일 단위 (days)         | (C) 초 단위 (seconds) |
| --------------- | --------------------------------------------------- | -------------------------- | --------------------- |
| NASA/JPL 직접성 | ✓ sidereal rotation period 흔히 hours (지구 23.93h) | △ 금성 243일 등은 day 자연 | ✗ 큰 수               |
| 역행 부호       | 음수 (금성 −5832.5h, 천왕성 −17.24h)                | 음수 (금성 −243d)          | 음수                  |
| jd 연동         | `ω = 2π / (period_h / 24) [rad/day]`                | `ω = 2π / period_d`        | 변환                  |

→ **(A) 시간(hours) 단위 채택** — `rotationPeriodHours`. NASA sidereal rotation period 직접 표기 (지구 23.9345h). `ω[rad/day] = 2π × 24 / rotationPeriodHours`. 스키마: `rotationPeriodHours: z.number().refine(v => v !== 0).optional()` (0 금지 — division-by-zero 차단. 미지정 body 는 자전 없음 = 현행 정지 유지, 하위 호환).

> **각주 (구현 시 정정, #782 PR — 규약 i 채택)**: 본 초안은 "역행 자전 = 음수 period" 를 명시했으나, **기존 데이터와 충돌**한다. `axialTiltDeg` 는 이미 **IAU obliquity 규약 (0~180)** 을 쓴다 (uranus 97.77° = 90° 초과 = 역행이 tilt 에 내재, venus 177.36°, saturn 26.73° — R8 ring tilt 데이터). 여기에 period 부호까지 음수로 주면 **방향 이중 적용** (uranus 가 오히려 prograde 로 뒤집힘). 따라서 **규약 (i) 채택**: `axialTiltDeg` = 물리 obliquity (0~180, 기존 데이터 일관), `rotationPeriodHours` = **양수 magnitude** (부호 없음). 자전 방향(역행)은 tilt (obliquity>90) 에서 창발한다 — pole 이 뒤집혀 양수 spin 이 역행으로 보인다. 이중 계산 없음 + 기존 uranus/venus/saturn/neptune obliquity·ring tilt 데이터 무수정. loader 스키마는 `.positive()`/`.nonnegative()` 대신 `.refine(v => v !== 0)` 만 (음수 허용 — 미래 규약 (ii) 전환 여지, cross-validate 고유 발견 3). **DoD #3 (금성/천왕성 CW) 을 verify 로 실증** (browser-verify-782-rotation.mjs — 전 9 body PASS: venus/uranus CW, 나머지 CCW, measured tilt = obliquity 정확 일치, deltaErrPct 0%). 초안의 음수 period 표기는 폐기.

- **데이터 대상**: 표면 4개 (earth/mars/jupiter/moon) + major body 전체 (mercury/venus/saturn/uranus/neptune) + moon = 9개. 위성·왜소행성·혜성은 부재 시 자전 안 함 (점진 확장, R-Phase).

#### 결정 5 — 자전각 = jd 순수 함수 (accumulate 금지)

`spinAngle(jd) = ((jd − epoch) × ω) mod 2π` (§A2.2-4). **매 프레임 누적(`angle += ω·Δ`) 금지** — 누적은 (1) frame-rate 의존 (2) float drift 누적 (3) timeScale 변경 시 불연속. jd 순수 함수는 결정적 + timeScale 자동 연동 + `?t=<jd>&speed=0` 로 **완전 재현 가능** (snapshot 가드 대응 결정 7 의 기반).

#### 결정 6 — onBind 회전 어서션 처리 + reviewer once-guard (#776)

self-rotation 도입 후 회전 non-zero 가 **정상**이 되므로 Amendment 1 의 "회전 감지 → warn" 어서션은 목적이 뒤집힌다.

| 축                | (A) 어서션 제거 | (B) **의미 전환**: "world uniform 배선 누락 감지" | (C) 유지 (회전 정상이므로 매 프레임 발화 — 금지) |
| ----------------- | --------------- | ------------------------------------------------- | ------------------------------------------------ |
| 목적              | 가드 소멸       | 새 회귀 (world normal 미배선) 감지                | 잘못 (spam)                                      |
| once-guard (#776) | N/A             | ✓ 프레임당 누적 방지 (once)                       | ✗                                                |

→ **(B) 의미 전환 + reviewer once-guard 채택**. 어서션을 "**world uniform 미배선 or vLocalPos==vNormal 오용 감지**" 로 전환 — 옵션 e 배선이 빠지면 (셰이더가 여전히 local normal 사용) 회전 시 명암이 돌아버리는 회귀를 dev 빌드에서 조기 감지. **reviewer #776 once-guard**: `let warned = false` 플래그로 최초 1회만 `console.warn` (프레임당 mesh당 누적 spam 차단). dev-only (`NODE_ENV !== 'production'` DCE).

#### 결정 7 — snapshot 가드 (r1-guard / verify:\*) 대응

자전은 매 프레임 canvas 픽셀을 바꾼다 → 픽셀 baseline flaky 위험. **실측 결과 위험 낮음**:

- **r1-guard 는 canvas 미측정**: `r1-ui-regions.mjs` 는 `[data-r1-region]` UI 영역 (top-nav/shortcut-bar/hud-\*) 만 clip 캡처 (`r1-ui-regression-guard.mjs:375`). 천체 canvas 픽셀은 baseline 대상 아님 → 자전 직접 영향 0. (반투명 HUD 가 canvas 위 합성되나 hud chip 은 `bg-void@α0.85` backing 으로 canvas 휘도 무관 — #749 fix.)
- **결정적 재현 수단 존재**: `?t=<jd>&speed=0` 로 julianDate 고정 (결정 5 순수 함수) → 자전각 결정적. 임의 snapshot 을 프레임 독립으로 캡처 가능.

| 축               | (A) `?rotate=off` URL flag (surface=off 패턴)          | (B) `?t=<jd>&speed=0` 로 프레임 고정 (기존 param) | (C) 자전 결정적 시드 (jd 순수 함수 — 이미 결정 5) |
| ---------------- | ------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------- |
| 신규 코드        | parse-rotate-mode.ts + scene 옵션 (surface 동형 ~35줄) | 0 (기존 t/speed param)                            | 0 (결정 5 내재)                                   |
| verify 무회귀    | 자전 완전 정지 (기존 정지 baseline 재사용)             | jd 고정 → 자전각 고정 (정지 아님, 특정 각)        | 동일                                              |
| 표면/광원 verify | 무영향 (surface 별개)                                  | 무영향                                            | 무영향                                            |

→ **(A) `?rotate=off` + (C) 결정적 시드 병행 채택**. 근거:

- **(C) 는 자동 (결정 5 순수 함수)** — 추가 비용 0. jd 고정 시 자전각 결정적.
- **(A) `?rotate=off`** 는 저비용 (surface=off 패턴 복제 ~35줄) 로 **완전 정지 baseline** 제공 — 자전 도입 전 픽셀과 동일 (회귀 격리). 신규 verify (browser-verify-782-rotation) 는 rotate ON 에서 자전각 이동을 측정하고, 기존 픽셀 민감 가드는 `?rotate=off` 로 자전 격리 가능. **`?rotate=off` = 자전 도입 전 100% 복귀** (Amendment 1 `?surface=off` 철학 답습).
- **r1-guard baseline 재생성 불요** (canvas 미측정) — 단 자전으로 반투명 HUD 뒤 canvas 휘도가 미세 변동할 수 있어 qa 가 r1-guard PASS 실측 확인 (backing α0.85 로 무영향 예상, #749 정합).

### A2.4 Concrete Prediction (구현 후 `git diff --stat` 실측 재현)

| 영역                    | 파일                                                               | 예측 라인          | 근거                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **데이터**              | `packages/shared/data/solar-system.json`                           | ~8–20 신규 값      | `rotationPeriodHours` 최소 4 (earth/mars/jupiter/moon) ~ 권장 major 전체 (+mercury/venus/saturn/uranus/neptune ≈ 9). `axialTiltDeg` 신규 값 (earth 23.44/mars 25.19/jupiter 3.13/moon 6.68 등 — 기존 3개 재사용)                                                                                                                                                          |
| **loader 스키마·타입**  | `solar-system-loader.ts`                                           | ~8–14 변경         | `rotationPeriodHours: z.number().refine(≠0).optional()` + `LoadedCelestialBody.rotationPeriodHours?` + map 전달 (axialTiltDeg 동형 3줄 패턴)                                                                                                                                                                                                                              |
| **scene 자전 배선**     | `solar-system-scene.ts` (`updateAt`)                               | ~35–55 변경        | mesh 루프 (`:1213`) 인접에 spinAngle(jd) → `rotationQuaternion = tilt ∘ spin` 설정 (표면 body + 자전값 있는 body). **ring host 4개는 spin pivot + ring anchor 계층 노드 분리** (cross-validate 이견 수용 1 — inverse 보정 아님). `tmpSpinQuat`/`tmpTiltQuat` 팩토리 스코프 재사용 (alloc 0, cross-validate 고유 발견 1). epoch 기준 각 (CPU float64 — 셰이더에 jd 미전달) |
| **셰이더 옵션 e**       | `procedural-planet-shader.ts` (VERTEX + uniforms)                  | ~6–12 변경         | `uniform mat4 world` + `vNormal = normalize((world × vec4(normal,0)).xyz)` (VERTEX). uniforms 배열 `'world'` 추가. vLocalPos 는 local 유지. **jd/큰 수 uniform 미전달 계약 주석** (cross-validate Q3 회귀 가드 — 미래 시간 기반 셰이더 효과 추가 시 float32 정밀도 손실 차단)                                                                                             |
| **onBind 어서션 전환**  | `procedural-planet-shader.ts` (createProceduralPlanetMaterial)     | ~10–20 변경        | 회전 감지 → world 배선 감지 의미 전환 + once-guard (reviewer #776)                                                                                                                                                                                                                                                                                                        |
| **JS 미러 계약 갱신**   | `procedural-planet-shader.ts` (lightingShadeMirror 주석)           | ~4–8 변경          | 미러 식 자체 불변 (N 을 인자로 받음) — "N 이 world normal" 계약 주석 갱신. Rocky/desert 미러 무변경                                                                                                                                                                                                                                                                       |
| **`?rotate=off` flag**  | `apps/web/src/core/parse-rotate-mode.ts` (신규) + `sim-canvas.tsx` | ~35 신규 + ~5 변경 | parse-surface-mode.ts 동형 복제 + scene 옵션 `selfRotation?: boolean`                                                                                                                                                                                                                                                                                                     |
| **scene 옵션 타입**     | `solar-system-scene.ts` (`SolarSystemSceneOptions`)                | ~2 변경            | `selfRotation?: boolean` (surfaceDetail 동형)                                                                                                                                                                                                                                                                                                                             |
| **단위 테스트**         | `procedural-planet-shader.test.ts`                                 | ~30–60 변경        | 회전 0 계약 테스트 (`:426-443`) → **옵션 e 계약으로 반전** (`world` uniform 존재 + `vNormal` world 변환). 광원 미러 world normal 계약 주석                                                                                                                                                                                                                                |
| **신규 browser verify** | `apps/web/scripts/browser-verify-782-rotation.mjs` (신규)          | ~120–180 신규      | 자전각 측정 (t 두 시점 mesh.rotationQuaternion Δ) + axialTilt 확인 + 역행 부호 + ring wobble 0                                                                                                                                                                                                                                                                            |

**핵심 예측**:

- **`updateAt` mesh position 루프 (`:1213`) 무변경** — 자전은 인접에 rotation 설정 추가, position 식 자체 불변 (floating-origin 계약 §3 위반 0). 초과 시 = 자전이 position 좌표 파이프 침범 (재검토).
- **picking / camera / orbit / tier / LOD 변경 0** — 자전은 rotation 성분만, mesh 기하/metadata/position/scaling 불변 (#713 bodyId 역매핑 무영향). mid variant 는 parent 상속으로 자동 동기 (재parent 0).
- **광원 uniform +1 (`world`)** — normalMatrix 불요 (uniform scale 실측, 결정 2). uniform 2개+ 추가 시 = 과설계 신호.

### A2.5 DoD (측정 가능 — 실 Chrome GUI 필수, CRITICAL #3 + 헤드리스 false positive 교훈) — §최종 메시지 표 참조

측정 가능 DoD 는 스프린트 계약용으로 별도 표 (developer 인수인계 + 최종 메시지) 에 박제. 각 기준에 측정 방법 부착. 요지:

1. 자전각 = jd 순수 함수 (실측 ω ±5%) 2. axialTilt body 적용 (23.4° 등) 3. 역행 부호 (금성/천왕성) 4. #773 무회귀 (world normal 후 밤면<낮면 단조, terminator 태양 추종) 5. onBind 어서션 해소 (warn 0) 6. ring wobble 0 7. fps 회귀 0 (tier-c) 8. #756 표면 무회귀 9. snapshot 가드 대응 (`?rotate=off` + r1-guard PASS).

### A2.6 §Visual Fidelity 의무 체크리스트 4항목 (principles.md §1)

- [x] **데이터 SSoT 보존** — `rotationPeriodHours`/`axialTiltDeg` 는 **물리 실측 데이터** (NASA/JPL sidereal period + obliquity) 라 `solar-system.json` 데이터 SSoT 에 정당 추가 (rendering-only 아님 — 표면 타입/육지색과 달리 실측 물리량). 자전각 계산은 rendering-only (mesh rotation). 축 방위각은 world X 근사 (ring 답습, rendering 왜곡 허용).
- [x] **rendering 시점 분리** — 자전은 `mesh.rotationQuaternion` (scene 레이어) 단독. physics 엔진 (Rust+wasm) 은 heliocentric 절대 position 만 산출 — body 자전은 적분 무관 (자전은 공전 궤도에 영향 0, Newtonian point-mass). P11-A 좌표 계약 위반 0.
- [x] **사용자 D-T2 가이드** — 자전 주기/축은 실측값 (Info 패널 표기 가능 대상). 자전 애니메이션은 시각 표현 — focus/Info 패널은 실측 rotationPeriod/obliquity 표기 (표면 디테일과 달리 실측이라 표기 정당, 후속 UI 여지).
- [x] **점유율 / 사실 비율 baseline** — 자전은 rotation 성분만 → mesh 크기/위치/scaling 불변 (diameter 식 무변경). px diameter / 점유율 / 분리 마진 영향 0. r1-guard baseline 은 canvas 미측정이라 재생성 불요 (결정 7).

### A2.7 결과 · 재검토 조건

**기대 결과**: 지구 등 표면 4개 + major body 가 자전축 기울어진 채 자전 (실 Chrome GUI). 금성/천왕성 역행. #773 광원 밤면/terminator 가 자전 중에도 태양 정확 추종 (옵션 e). ring wobble 0. fps 회귀 0. #756 표면 무회귀.

**재검토 조건**:

1. **ring wobble 잔존** (결정 1 ring 격리 방식이 불충분) — cross-validate 질문 결과 + qa 실측으로 격리 구조 재선택 (Amendment 3).
2. **비균일 scale 도입** (미래 tier 가 비등방 scale) — 옵션 e 를 normalMatrix (B) 로 승격 (결정 2 uniform 전제 발동).
3. **축 방위각 사실성 요구** — 현재 world X 근사 (ring 답습). pole RA/Dec 정렬 요구 시 후속 (uranus §위험 #6 주석 계약 연장).
4. **자전 속도 체감 부적절** — 실제 자전 주기는 timeScale 기본(86400=1일/초) 에서 지구 1회전/23.9초 = 빠름. 시각 체감 조정 (rendering-only spin scale) 요구 시 Amendment (데이터 SSoT 불변, rendering 배수만).

### A2.8 교차검증 반영 사항 (cross-validate 대기 — Provisional)

**호출 전 Claude 편향 셀프 체크** (4종):

- **낙관적 일정** (ring wobble 차단 구조를 "저비용 inverse 보정" 으로 과소평가 의심 — 결정 1 이 미결정 개방 상태) — **미통과 의심** → cross-validate 명시 질문 삽입.
- **결합 간과** (self-rotation ↔ ring 자식 결합 ↔ 광원 world normal ↔ tier uniform scale 4중 결합. §A2.2 에서 실측했으나 ring 격리는 미결정) — **미통과 의심** → 명시 질문.
- **폐기 프레이밍** (Amendment 1 "회전 0 전제" 를 폐기 — 예비된 전환이라 정당, 통과 예상).
- **순수주의** (jd 순수 함수 자전각 = frame-rate 독립 결정성 선호가 과잉인가 — accumulate 대비 명백 우월, 통과 예상).

**cross-validate 명시 질문** (미통과 의심 2축):

1. (결합 간과) self-rotation body 의 ring disc wobble 을 **최소 비용/최소 위험**으로 차단하는 구조는? (b-i 계층재편 / b-ii ring inverse spin / b-iii ring 분리 / anchor TransformNode 중)
2. (낙관적 일정) 옵션 e 에서 `uniform mat4 world` 로 충분한가, 아니면 uniform scale 임에도 `normalMatrix` 가 안전한가? (등방 scale + 순수 회전 전제 검증)
3. jd 순수 함수 자전각 (`spinAngle = (jd−epoch)×ω mod 2π`) 의 float 정밀도 — jd 가 큰 수 (2.4e6+) 라 `(jd−epoch)` 뺄셈 후 mod 가 정밀도 손실 없는지?

#### 교차검증 수행 결과 (Antigravity `agy`, 2026-07-01, outcome=applied, exit 0, plan_bypass=false, rollback_failed=false)

로그: `.claude/logs/cross-validate-architecture-20260701-173125.log`.

##### 합의 (셀프 체크 통과 확인 / 현재 설계 유지)

1. **Q2 — `uniform mat4 world` 로 충분 (normalMatrix 불요)** [결정 2, 낙관적 일정 축 통과] — agy: "자전/궤도 변환에 비등방 변형(shear/non-uniform scale)이 없고 구형 대칭만 유지되므로, 고비용 `inverse-transpose(normalMatrix)` 대신 가벼운 `world` 행렬 곱 후 `normalize` 채택은 최적화". Claude 의 "등방 scale + 순수 회전 → world matrix 로 충분" 판단이 외부 모델로 교차 확인됨.
2. **jd 순수 함수 자전각 = 결정성** [결정 5, 순수주의 축 통과] — agy: "매 프레임 `angle += ω·dt` 누적은 frame drop / float drift / timeScale 변경 시 렌더 깨짐 발생. jd 순수 함수 채택은 훌륭한 시간 결정성(deterministic replay)". accumulate 금지 결정 지지.
3. **데이터 SSoT 격리** — 물리 실측(rotationPeriod/obliquity)과 rendering-only(surfaceType/land color) 분리를 "물리·그래픽 엔진 완전 디커플링" 으로 합의.

##### 이견 수용 (원안 수정)

1. **Q1 — ring wobble 차단: b-ii(ring inverse spin) 지양 → `Spin Pivot Node + Ring Anchor Node` 명시 계층 분리 채택** [결합 간과 축] — Claude 원안은 "1차 최저 위험 = b-ii (ring disc 에 host spin inverse quaternion 매 프레임 곱)" 로 기울었다. agy 는 "b-ii 역회전 보정 / anchor 분리는 시각적 정상 작동 가능하나 **scene 그래프 상 명확한 anchor 계층 정의가 누락**. `Host Node(translation/scale/tilt)` 하위에 `Spin Pivot Node(자전용)` + `Ring Anchor Node(비자전용)` 명시 분리가 **장기 유지보수 + scene graph 순수성** 관점에서 훨씬 안전 — 셰이더 단 복잡한 역회전 행렬 연산 배제" 로 권고. **수용 (결정 1 확정)** — b-ii 역회전은 "셰이더/CPU 매 프레임 inverse 곱 + wobble 잔존 위험" 이 있고, 계층 노드 분리는 Babylon scene graph 의 자연스러운 TRS 상속으로 wobble 을 **구조적으로 0** 으로 만든다 (역회전 계산 자체가 불필요). **결정 1 을 다음으로 확정**: ring 을 가진 body (jupiter/saturn/uranus/neptune) 는 `host` mesh (position/scale owner) 아래에 (a) **spin pivot** — 표면 sphere(high) + mid variant 를 자식으로 두고 tilt∘spin quaternion 보유, (b) **ring anchor** — 비회전 TransformNode, ring disc 를 자식으로 두어 tilt 만 반영·spin 미상속. ring 없는 body 는 host mesh 직접 spin (pivot 불요 — 저비용 유지). **개방 결정 → 확정 결정으로 전이** (Amendment 2 §A2.7 재검토 조건 1 은 이 계층 구조가 mid variant 재parent / picking metadata 재확인 비용을 실측 초과할 경우로 축소).
   - **비용 재평가 (낙관적 일정 축 정정)**: 계층 노드 분리는 mid variant 를 spin pivot 자식으로 재parent + picking metadata bodyId 재확인이 필요 (Concrete Prediction §A2.4 scene 배선 예측을 ~20–40 → **~35–55 로 상향**, ring host 4개 한정). developer 는 ring 없는 body (대다수) 는 host 직접 spin (저비용), ring host 만 pivot 계층 (구조 격리) 의 **2-경로** 구현.

##### Claude 재분석으로 정정한 외부 모델 제안

1. **Q3 — "절대 jd 를 셰이더 내부로 전달 말라" (🔴 중요 위험 지적)** — **부분 기각 (전제 정정) + 가드 수용**. agy: "jd ~2.4e6 를 GLSL 단정밀도(float32, 유효 7자리)로 넘겨 `jd-epoch` 연산 시 하위 비트 손실 → jittering 100% 발생. CPU(float64)에서 `spinAngle mod 2π` 완료 후 `uSpinAngle` 스칼라/quaternion 만 uniform 전달". **정정**: 본 설계(§A2.2-4, 결정 5)는 **이미 자전각을 JS(CPU float64)에서 계산해 `mesh.rotationQuaternion`(CPU) 으로 적용** — 셰이더는 jd 를 애초에 받지 않는다 (옵션 e 는 mesh rotation 을 `world` matrix 로 반영, jd 무관). agy 의 경고는 "셰이더에서 jd 연산" 이라는 **미해당 전제(strawman)** 에 대한 것. **실측 검증** (`_debug-782-jd-precision-tmp.mjs`, volt #66 sanity check, 측정 후 rm): JS float64 에서 jd=2.46e6(2026년)~3.0e6(먼 미래) 전 구간 프레임당 Δ각도 오차 **≤ 3.1e-8°**, jd float64 ULP→자전각 **≈1.7e-7°** (육안 임계 ~0.1° 대비 **6자릿수 여유**). jitter 없음 확정. **단 가드는 수용** — agy 지적의 정당한 핵심("jd 를 float32 로 넘기면 위험")을 **회귀 방어로 박제**: 셰이더에 jd/큰 수 uniform 을 넘기지 않는다는 계약을 셰이더 주석 + 단위 테스트에 명시 (미래 개발자가 시간 기반 셰이더 효과 추가 시 jd 직접 전달 회귀 차단). Concrete Prediction 셰이더 옵션 e 항목에 흡수.

##### 고유 발견 (범위 판정)

1. **onBind GC 회피 — `tmpQuaternion` 도 팩토리 스코프 정적 바인딩** — **수용 (계약 강화)**. agy: "onBind 는 매 프레임×mesh 실행이라 내부 `Vector3`/`Matrix`/`Quaternion` 동적 alloc 시 GC 병목. `tmpVector` 재사용 언급됐으나 **인터페이스 계약 수준에서 정적/렉시컬 스코프 격리 명시** 필요". Amendment 1 이 `tmpSunDir` 재사용(alloc 0)을 이미 박제했고, Amendment 2 의 spin quaternion 계산도 동일하게 팩토리 스코프 `tmpSpinQuat`/`tmpTiltQuat` 재사용 (매 프레임 alloc 0). developer 인수인계 + Concrete Prediction scene 배선 항목에 명시.
2. **대기/구름 레이어 renderingGroupId/alphaMode 주입 훅** — **비대상 (기존 §A1.8 재검토 조건 5 재확인)**. agy: "후속 반투명 대기/구름 mesh 중첩 시 표면 셰이더 log-depth + 알파 블렌딩 렌더 큐 우선순위 충돌 가능 — 머티리얼 팩토리에 `renderingGroupId`/`alphaMode` 주입 여지 확보". **Amendment 1 §A1.8 재검토 조건 5 + §고유 발견 1 에서 이미 "대기/구름 mesh 미구현이라 범위 밖, 도입 시 분리" 로 박제** — Amendment 2 도 동일 (self-rotation 은 대기 레이어 무관). 현재 mesh 부재라 즉시 이슈 생성은 맥락 빈약 → §A2.7 재검토 조건에 유지. 자전 자체는 renderingGroupId 무관 (rotation 성분만).
3. **역행 자전 스키마 음수 명문화** — **수용 (결정 4 명시 강화)**. agy: "`rotationPeriodHours` 음수(금성 -5832.5h) 표기 시 zod 에 `.positive()` 같은 제약이 남아 오류 안 나도록 사전 체크". 결정 4 는 이미 `.refine(v => v !== 0)` (0 만 금지, 음수 허용) 명시 — agy 지적은 "`.positive()` 실수 방지" 로, developer 인수인계에 "**음수 허용 (역행), 0 만 금지** — `.positive()`/`.nonnegative()` 사용 금지" 명문화.

**호출 전 Claude 편향 셀프 체크 통과 여부** (1줄): 낙관적 일정 축은 **미통과** (Q1 ring 계층 비용을 b-ii 저비용으로 과소평가 → agy 이견 수용으로 pivot 계층 + 비용 상향 정정). 결합 간과 축은 **부분 통과** (ring 결합 실측했으나 격리 구조는 agy 권고로 확정). 순수주의/폐기 프레이밍 축 통과.

**→ 상태 전이: Provisional → Accepted (cross-validate 2026-07-01)**. §A2.3 결정 1 을 pivot 계층 확정으로 갱신 (위 이견 수용 1).

---

## Amendment 3 (2026-07-04) — 지구 디테일: 극관 + biome 위도 색 변화 (#783)

- **상태**: Accepted (cross-validate 2026-07-04 — §A3.8 통합 완료)
- **이슈**: [#783](https://github.com/coseo12/astro-simulator/issues/783) (type:feat, medium, group:B-render, #775 후속 — 사용자 관찰 2026-07-01 "지구가 지구 같지 않음")
- **형식**: **Amendment** (신규 ADR 기각) — 판단 근거는 §A3.3 결정 1. 일반 Amendment (forensic 비대상 — 회귀가 아닌 신규 시각 기능, runtime 측정으로 결정이 갈리는 가설 경합 없음).

### A3.1 배경 — #775 가 남긴 "1차 비목표" 의 실현

Amendment 1 §A1.3 결정 4 의 rocky 분기 (`col = mix(baseColor, landColor, landMask)`) 는 ocean↔land **2색뿐** 이며, 결정 4 GLSL 스케치에 `// (선택, 후속 가능) 해안선 대비 / 극관 — 1차 비목표` 로 극관을 명시 예비했다. 본 Amendment 3 은 그 예비된 후속의 실현이다 (Amendment 2 가 A1 의 "옵션 e 전환" 예비를 실현한 것과 동형 관계).

사용자 관찰 (#783): 실제 지구의 시각 상징 (흰 극관 / 다양한 대륙색) 부재로 사실감 부족. 제약 (이슈 계약): 단일 ShaderMaterial high/mid 공유 / 에셋 0 절차적 / if-else / 데이터 SSoT 보존 (rendering-only 코드 상수) / 보라·마젠타 anti-pattern 회피 / #773 광원 shade 최종 곱 유지.

### A3.2 코드베이스 실측 (설계 결정의 근거 — 재조사 불필요)

1. **`p.y` = sin(위도) — "정규화된 위도" 가 아니다 (이슈 판단 요청 4-c 실측)**. body sphere 는 `MeshBuilder.CreateSphere` (`solar-system-scene.ts:2116/:2169`) — Babylon 구는 pole 이 **local ±Y**. fragment 의 `p = normalize(vLocalPos)` 는 단위 구면 좌표이므로 `p.y ∈ [−1,1] = sin(latitude)` (선형 위도 아님 — 60° 에서 0.866, 75° 에서 0.966). **위도 임계 상수는 전부 sin-space 로 박제** 하며 상수 주석에 대응 각도를 병기한다. gas-bands 분기가 이미 `float latitude = p.y` 로 동일 좌표를 사용 (#782 Amendment 2 에서 "local Y = 실제 자전축(pole) 정렬" 확정 — 선례).
2. **자전 불변 (#782 정합)**: spin quaternion 은 local Y 축 회전 → local 정점 좌표 `vLocalPos` 는 불변이고 패턴이 mesh 와 함께 돈다 (painted-on). `abs(p.y)` 위도 밴드/극관은 **자전축 대칭이라 자전해도 위도가 변하지 않는다** — 극관이 흔들리거나 미끄러질 구조 자체가 없음. tilt 도 mesh rotation 이라 local 불변.
3. **rocky 분기는 earth 전용** (현재 `SURFACE_TYPE_BY_BODY` 에서 Rocky = earth 1개) — rocky 분기 수정은 mars(desert)/jupiter(gas-bands)/moon(cratered) 분기 식에 영향 0 (같은 fragment 소스가 재컴파일되지만 타 분기 식 불변 → 픽셀 불변).
4. **`continents = fbm(p * 2.4)` 가 rocky 분기에서 이미 계산됨** — biome 경계 jitter 소스로 재사용 가능 (추가 noise 샘플 0, §A3.3 결정 3).
5. **결정적 측정 수단 존재**: `?rotate=off` (parse-rotate-mode.ts, #782) 로 selfRotation=false → rotationStates 빈 Map → mesh rotation identity → **local Y = world Y = 화면 세로축** (tilt 23.44° 오염 제거) + `&speed=0&t=<jd>` 프레임 고정. 극관/biome 밴드가 disk 세로축을 따라 결정적으로 샘플링 가능.

### A3.3 결정

#### 결정 1 — 형식: #756 Amendment 3 (신규 ADR 기각)

| 축               | (A) 본 ADR Amendment 3                                                                                                    | (B) 신규 ADR (`20260704-783-earth-detail.md`)                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 선례 정합        | ✓ #775 (rocky 분기 확장) 가 Amendment 1 로 처리된 직접 선례. A1 결정 4 가 "극관 — 1차 비목표" 로 본 건을 예비             | ✗ #774 가 신규 ADR 인 이유 (신규 모듈 `sun-shader.ts` + 광원 모델 정반대) 가 본 건에 부재 |
| 모듈/아키텍처    | ✓ 신규 모듈 0 — 기존 rocky 분기 내부 식 + rendering-only 미학 상수 확장 (아키텍처 결정 없음)                              | △ 결정 대상이 색 체계 상수 설계라 ADR 4섹션 (배경/후보/결정/재검토) 독립 파일 밀도 미달   |
| 결정 이력 연속성 | ✓ rocky 분기의 전 결정 이력 (§결정 5 → A1 결정 4 → A3) 이 한 파일에 수렴 — 미래 rocky 수정자가 단일 문서로 전체 맥락 회수 | ✗ rocky 분기 이력이 2 파일로 분산                                                         |
| 파일 비대        | △ 632 → ~800 줄 (수용 가능 — 셰이더 .ts 자체가 824줄)                                                                     | ✓ 분리                                                                                    |

→ **(A) Amendment 3 채택**. "범위/색 체계 결정이 크다" (이슈 판단 요청 1) 는 신규 ADR 근거로 불충분 — 크기가 아니라 **결정의 종류** (신규 모듈/광원 모델 = 신규 ADR, 기존 분기 확장 = Amendment) 가 분기 기준이다 (#774 vs #775 선례 대조).

#### 결정 2 — 범위: Tier 1 한정 (극관 + biome), Tier 2 후속

| 항목                                 | 포함        | 근거                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tier 1-1 극관 (polar ice caps)       | ✓           | 이슈 핵심. `smoothstep` mask 1개 + 색 상수 1개 — 저비용                                                                                                                                                                                                                                                                                                                                    |
| Tier 1-2 biome 위도 색 (3밴드)       | ✓           | 이슈 핵심. 기존 continents fbm 재사용으로 noise 샘플 +0 (결정 3)                                                                                                                                                                                                                                                                                                                           |
| Tier 2-3 바다 깊이 색 (deep/shallow) | ✗ 후속      | 저비용임은 인정 (§A3.7 재검토 조건 1 에 설계 스케치 박제 — continents 값 재활용). 단 (i) DoD 측정 축 +1 (deep/shallow 픽셀 판별 방법 별도 설계 필요), (ii) ocean = baseColor (데이터 SSoT read-only) 규약에 shallow 신규 상수가 얹히는 색 체계 논의 확장, (iii) Tier 1 만으로 "지구가 지구처럼 보인다" 완결 Behavior Change 집합 성립. scope 절제 우선 (CRITICAL #6)                       |
| Tier 2-4 대기 fresnel rim            | ✗ 후속      | #774 가 `cameraPosition` auto-bind 를 실증해 viewDir 비용은 하락 (이슈 판단 요청 2 의 재평가 반영). 그러나 (i) 4 타입 공유 셰이더에 rocky 전용 varying (vWorldPos) 혼입 — #774 결정 1 이 "무의미한 uniform 동거" 를 분리 근거로 쓴 논리의 역방향 침범, (ii) 대기 표현은 구름 (Tier 3) 과 묶어 별도 레이어로 설계하는 것이 자연 (§A1.8 재검토 조건 5 대기/구름 mesh 박제와 합류). 후속 유지 |
| Tier 3 구름 / 야간 불빛              | ✗ 별도 트랙 | 별도 mesh/레이어 — §A1.8 재검토 조건 5 그대로                                                                                                                                                                                                                                                                                                                                              |

#### 결정 3 — biome 색 구조: 3밴드 연쇄 mix + continents 재사용 jitter

**위도 파라미터** (sin-space, §A3.2-1):

```glsl
// rocky 분기 (uSurfaceType == 0) — 기존 continents/landMask 계산 직후
float latRaw = abs(p.y);                                        // |sin(위도)| — 남북 대칭
float latJ = latRaw + (continents - 0.5) * biomeLatJitter;      // 경계 자연화 — 기존 fbm 재사용 (추가 noise 0)
// 대륙색: 적도 녹색 → 중위도 황토·갈색 → 고위도 툰드라 회백 (2 smoothstep 연쇄 mix)
vec3 landCol = mix(biomeTropicalColor, landColor, smoothstep(biomeTemperateLo, biomeTemperateHi, latJ));
landCol = mix(landCol, biomeTundraColor, smoothstep(biomeTundraLo, biomeTundraHi, latJ));
col = mix(baseColor, landCol, landMask);                        // #775 해안선 전이 유지 (ocean = baseColor 불변)
// 극관 — continents 무관 (결정 4), ocean/land 공통 최종 mix
float iceMask = smoothstep(iceLatLo, iceLatHi, latJ);
col = mix(col, iceColor, iceMask);
```

**하위 결정 3-a — 밴드 수 = 3 (+ 극관)**: 이슈 명세 그대로 (적도 열대 / 중위도 사막·평원 / 고위도 툰드라). 밴드 4+ (예: 아열대 분리) 는 smoothstep/상수 표면만 늘리고 px 단위 시각 구분 불가 (earth disk 는 focus 시에도 수백 px — 밴드당 수십 px). 밴드 2 는 "다양한 대륙색" 요구 미달.

**하위 결정 3-b — 색 상수 (신규 3 + 기존 1 재사용)**: 전부 `procedural-planet-shader.ts` rendering-only 미학 상수 SSoT (starfield/#775 패턴 — export + 단위 테스트 가드). 출발값은 물리/자연색 근사, **최종값은 developer measurement-first 시각 튜닝 재량** (#774 결정 8 동형):

| 상수                           | 출발값                                                                     | 근거·제약                                                                                                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BIOME_TROPICAL_RGB` (신규)    | `(0.20, 0.38, 0.16)`                                                       | 열대 녹 — G 우세. **제약: G-share (G/(R+G+B)) 가 temperate 보다 커야 함** (DoD 2 밴드 구분 측정 가능성)                                                                      |
| `LAND_COLOR_RGB` (기존 재사용) | 현행 `(0.34, 0.40, 0.24)` → 황토 방향 튜닝 재량 (예: `(0.44, 0.38, 0.23)`) | **중위도 temperate 밴드 색으로 의미 재문서화** — #775 상수/uniform (`landColor`) 배선 그대로 유지 (drift 0). 값 갱신 시 기존 박제값 테스트 동반 갱신 (SSoT 갱신 — 정상 경로) |
| `BIOME_TUNDRA_RGB` (신규)      | `(0.55, 0.56, 0.52)`                                                       | 고위도 툰드라 회백 — 극관과의 연속 전이 (이슈 "툰드라→극관 연결")                                                                                                            |
| `ICE_COLOR_RGB` (신규)         | `(0.93, 0.95, 0.96)`                                                       | 근중성 백 — G ≥ min(R,B) 유지 (anti-pattern 가드 자동 충족, B 단독 우세 아님)                                                                                                |

| 위도 임계 (신규, sin-space) | 출발값      | 대응 위도                                                     |
| --------------------------- | ----------- | ------------------------------------------------------------- |
| `BIOME_TEMPERATE_LO/HI`     | 0.30 / 0.55 | ~17°–33° (열대→온대 전이)                                     |
| `BIOME_TUNDRA_LO/HI`        | 0.72 / 0.88 | ~46°–62° (온대→툰드라 전이)                                   |
| `ICE_LAT_LO/HI`             | 0.88 / 0.96 | ~62°–74° (극관 전이 — 실제 빙권 위도대 근사)                  |
| `BIOME_LAT_JITTER`          | 0.12        | 경계 요동 진폭 (continents fbm ±0.5 × 0.12 = 위도 ±0.06 요동) |

**하위 결정 3-c — 경계 자연화 = 기존 `continents` fbm 재사용 (독립 noise 샘플 기각)**:

| 축            | (A) `continents` 값 재사용 jitter                                                                | (B) 독립 `fbm(p * K)` 신규 샘플                       |
| ------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| fragment 비용 | ✓ **noise +0** (smoothstep 3 + mix 4 만 추가 — value noise 8 hash × 3 옥타브 회피)               | ✗ fbm 1회 = hash 24회 추가 (fill-rate, tier-b 실 GPU) |
| 시각 유기성   | ✓ biome 경계가 대륙 패턴과 동일 저주파 장(場)을 따라 요동 — 지형 연동처럼 보임                   | △ 독립 요동 (지형 무관)                               |
| 결합 리스크   | △ landMask 임계 (0.48–0.62) 와 jitter 소스가 동일 값 — 상관 자체는 의도, 아티팩트 여부는 qa 실측 | ✓ 독립                                                |

→ **(A) 채택**. 비용 우위 (표면 셰이더는 earth focus 대면적 fill — #756 결정 6 fill-rate 철학) + 유기성. 상관 아티팩트 (예: 해안선 부근 biome 경계 쏠림) 가 qa 실측에서 부자연하면 (B) 승격 (§A3.7 재검토 조건 4) — cross-validate 명시 질문 1 대상.

**uniform 배선**: 신규 색 3 (vec3) + 위도 임계 6 + jitter 1 = **uniform +10 (전부 rocky 전용)** — 기존 landColor/landThreshold 패턴 그대로 (uniforms 배열 + setColor3/setFloat + GLSL 선언 + JS 미러 동기 4중 SSoT).

#### 결정 4 — 극관 mask: continents 무관 + ocean/land 공통 최종 mix

| 축        | (A) 극관 = land 위에만 (`landMask` 곱)                                | (B) **continents 무관 — ocean/land 공통 최종 mix**                                 |
| --------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 물리 정합 | ✗ 북극은 해빙 (ocean 위 얼음) — land 한정이면 북극이 파란 바다로 남음 | ✓ 북극 해빙 + 남극 대륙 빙상 — 둘 다 흰색 (이슈 판단 요청 4-b 의 물리 근거 그대로) |
| 시각 상징 | ✗ 극이 얼룩덜룩 (대륙 패턴 노출)                                      | ✓ 흰 극관 — 지구 시각 상징                                                         |
| 식 비용   | 동일                                                                  | 동일 (mix 1)                                                                       |

→ **(B) 채택**. `iceMask` 는 ocean↔land mix **이후 최종 mix** 로 적용 — 극관이 해안선 전이 위를 덮는 것은 고위도 (sin-lat ≥ 0.88) 한정이라 #775 의 중·저위도 해안선 전이는 불변 (규약 (b) 정합). 극관도 albedo 단계 (`col`) 에서 결정되고 `col *= shade` 최종 곱은 무변경 — 밤면 극관은 어둡다 (#773 규약 (a) 정합, 낮/밤 대비 유지).

### A3.4 Concrete Prediction (구현 후 `git diff --stat` 실측 재현)

| 영역                     | 파일                                                                         | 예측 라인         | 근거                                                                                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **셰이더 rocky 확장**    | `procedural-planet-shader.ts`                                                | ~90–150 변경/신규 | GLSL rocky 분기 +8–14 줄 + 상수 4 색 + 7 float (주석 포함) + uniforms 배열 +10 + setColor3/setFloat +10 + JS 미러 rocky +20–35 + 헤더 주석 갱신                        |
| **단위 테스트**          | `procedural-planet-shader.test.ts`                                           | ~70–130 신규/변경 | 극 위도 → ice 수렴 (landMask 양극단 모두) / 적도 vs 중위도 G-share 순서 / 신규 색 anti-pattern / 상수 SSoT drift (uniform 선언 + 배선) / 기존 rocky 박제값 테스트 갱신 |
| **browser verify**       | `apps/web/scripts/browser-verify-783-earth-detail.mjs` (신규)                | ~130–190 신규     | `?focus=earth&rotate=off&speed=0` 결정적 프레임 — 극관 whiteness / 밴드 G-share / 마젠타 0 픽셀 측정                                                                   |
| **scene / web / 데이터** | `solar-system-scene.ts` / `sim-canvas.tsx` / `parse-*` / `solar-system.json` | **0**             | 미학 상수는 셰이더 모듈 내부 SSoT (scene 주입 불필요 — #775 landColor 동형). 데이터 0 (rendering-only)                                                                 |
| **타 셰이더**            | `sun-shader.ts` / `ring-shader.ts` / `starfield.ts`                          | **0**             | 무관 모듈                                                                                                                                                              |

**핵심 예측** (reviewer/qa 실측 대상):

- **rocky 외 3종 (mars/jupiter/moon) 픽셀 불변** — rocky 분기 식만 수정, desert/gas-bands/cratered 분기 무변경 (공유 소스 재컴파일되나 식 불변). 스크린샷 diff ≈ 0 예측. 실패 시 = 분기 격리 위반 신호.
- **noise 샘플 +0** — fbm 호출 수 불변 (continents 재사용). fbm 신규 호출 발견 시 = 결정 3-c 위반.
- **picking / camera / orbit / tier / LOD / r1-guard 변경 0** — fragment albedo 식 + uniform 만. mesh 기하/metadata/rotation 불변. r1-guard 는 canvas 미측정 (A2 결정 7) 이라 baseline 재생성 불요 예상 (qa 실측 확인).

### A3.5 DoD (측정 가능 — 실 Chrome GUI 필수, CRITICAL #3 + WebGPU readback 금지 #756/#728)

| #   | 기준                                                                                                                                                                                   | 측정 방법                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **극관 실재**: earth disk 세로 양극단 12% 영역 (낮면 측, 남북 모두) 의 near-white 픽셀 (min(R,G,B) ≥ 140/255 && max−min 채널 ≤ 40/255) 비율 ≥ 50%, OFF (`&surface=off`) 대비 유의 증가 | `?focus=earth&rotate=off&speed=0` (identity rotation → local Y = 화면 세로, §A3.2-5) — Playwright composited screenshot + pngjs (#756 qa 방법론) |
| 2   | **biome 위도 색 변화**: 적도 밴드 (disk 중심 ±0.15R) land 픽셀 평균 G-share > 중위도 밴드 (0.4–0.65R) land 픽셀 평균 G-share (낮면 측 통계)                                            | 동일 스크린샷 위도 밴드별 샘플링 (browser-verify-783)                                                                                            |
| 3   | **보라/마젠타 0**: 미러 전 샘플 G ≥ min(R,B) 위배 0 (단위 테스트) + GUI earth disk 에 R>G+τ && B>G+τ 픽셀 0 (τ=15/255)                                                                 | `procedural-planet-shader.test.ts` + verify 스크립트                                                                                             |
| 4   | **#773 광원 무회귀**: 낮/밤 휘도 대비비 ≥ 5x 유지 (A1.5 DoD 1 재현) + terminator 태양 추종 + 밤면 극관도 어두움 (밤면 극 휘도 < 낮면 극 휘도 × 1/3)                                    | 기존 browser-verify-773 + 신규 극 휘도 비교                                                                                                      |
| 5   | **#775 무회귀**: 중·저위도 land/ocean 색조 구분 유지 (해안선 전이 불변)                                                                                                                | 기존 #775 검증 축 재현                                                                                                                           |
| 6   | **#756 무회귀**: earth 라플라시안 고주파 엔트로피 ON > OFF 유지 + **mars/jupiter/moon 스크린샷 diff ≈ 0** (분기 격리)                                                                  | browser-verify-756 + 3종 diff                                                                                                                    |
| 7   | **fps 회귀 0**: fps-baseline-guard PASS (CI swiftshader tier-c 포함 — tier-c 는 forceOverride 자동 우회, noise +0 이라 tier-a/b 예산 내)                                               | CI workflow                                                                                                                                      |
| 8   | **데이터 0**: `git diff --stat` 에 `solar-system.json` 부재                                                                                                                            | reviewer 실측                                                                                                                                    |
| 9   | **core typecheck 0** (#719 — dev/메인/reviewer 3중) + 기존 procedural-planet 테스트 전체 PASS                                                                                          | `pnpm --filter core typecheck` + vitest                                                                                                          |

### A3.6 §Visual Fidelity 의무 체크리스트 4항목 (principles.md §1)

- [x] **데이터 SSoT 보존** — biome/극관 색·위도 임계는 전부 `procedural-planet-shader.ts` rendering-only 미학 상수. `solar-system.json` 직접 수정 0 (DoD 8). ocean = `colorHint.hex` read-only 유지.
- [x] **rendering 시점 분리** — fragment albedo 식 단독. physics 엔진 (Rust+wasm) 무의존, P11-A 좌표 계약 위반 0.
- [x] **사용자 D-T2 가이드** — 극관/biome 은 순수 시각 표현 (위도 밴드는 실제 기후대의 근사 왜곡). Info/focus 패널 실측값 표기 불변.
- [x] **점유율 / 사실 비율 baseline** — mesh 크기/위치/rotation 불변 (albedo 만) → px diameter / 점유율 / 분리 마진 / #762 단조성 영향 0. r1-guard canvas 미측정 (재생성 불요 예상 — qa 실측 판정).

### A3.7 결과 · 재검토 조건

**기대 결과**: `?focus=earth` 에서 흰 극관 (남북) + 적도 녹 → 중위도 황토 → 고위도 회백 대륙색 + 파란 바다 (실 Chrome GUI). 자전 시 극관/밴드가 표면과 함께 회전 (painted-on, 위도 불변). mars/jupiter/moon + 단색 22 + sun 무회귀. `?surface=off` 100% 복귀.

**재검토 조건**:

1. **바다 깊이 색 (Tier 2-3) 요구** — 설계 스케치: `float depth = smoothstep(landThresholdLo, 0.0, continents)` (continents 재활용 — landMask 하위 구간을 깊이로 역해석, noise +0) + `DEEP_OCEAN_RGB` 상수 1개, `oceanCol = mix(baseColor, deepOcean, depth)` 를 첫 mix 의 baseColor 자리에 대입. ocean = colorHint read-only 규약과의 관계 (deep 색이 baseColor 변조인지 독립 상수인지) 재론 필요.
2. **대기 fresnel rim (Tier 2-4) 요구** — #774 cameraPosition auto-bind 실증으로 uniform 비용 하락. 단 공유 셰이더 varying 혼입 vs 별도 대기 레이어 (§A1.8 재검토 조건 5) 비교 선행 — 구름 도입 시점과 합류 권장.
3. **구름 / 야간 도시 불빛 (Tier 3)** — 별도 mesh/레이어 트랙 (§A1.8 재검토 조건 5 그대로). 구름은 #782 자전과 차등 offset 필요.
4. **biome 경계 상관 아티팩트** — continents 재사용 jitter (결정 3-c) 가 해안선-biome 경계 쏠림 (contour-following) 등 부자연 발견 시 **좌표 스위즐링 fbm (`fbm(p.zyx * 2.4)`)** 으로 승격 (cross-validate 고유 발견 — landMask 와의 상관을 완전 해제하면서 신규 noise 함수 불요. 단 agy 의 "비용 0" 주장은 오류 — 이미 계산된 값 재사용이 아니라 fbm 신규 호출 = hash 24회 추가로 독립 샘플 (B) 와 동일 비용. 가치는 탈상관이지 무비용이 아님).
5. **다른 rocky body 확장** — mars 등 을 Rocky 로 재분류하거나 위성 rocky 추가 시 biome 파라미터가 earth 전용 상수라 body 별 파라미터화 필요 (§A1.8 재검토 조건 4 연장).
6. **극관 land/ocean 차등 디테일** (cross-validate 고유 발견) — 현재 iceMask 는 latJ (continents jitter 포함) 기반이라 경계가 지형 장을 따라 요동하지만, land 빙상 vs ocean 해빙의 분포 차이 (열용량) 는 미표현. qa 실측에서 "위도로만 잘린 흰 모자" 로 부자연하면 iceMask 에 landMask 미세 가중 검토.

### A3.8 교차검증 반영 사항 (agy 2026-07-04 — 통합 완료)

**호출 전 Claude 편향 셀프 체크** (4종):

- **낙관적 일정** (셰이더 +10 uniform 4중 SSoT 배선 비용 — Concrete Prediction 을 미러/테스트 포함 폭넓게 잡아 통과 예상).
- **결합 간과** (continents fbm 을 landMask 임계와 biome jitter 양쪽에 재사용 — 동일 noise 장 상관이 의도된 유기성인지 아티팩트원인지 단정 못 함) — **미통과 의심** → 명시 질문 1.
- **폐기 프레이밍** (단일 land 색을 "단조" 로 폐기 — 사용자 관찰 #783 실측 근거라 통과).
- **순수주의** (sin-space 임계 직접 박제가 도 단위 대비 가독성 손해 — 상수 주석에 대응 각도 병기로 완화, fragment 비용 0 이 우선. 통과 예상).

**cross-validate 명시 질문** (메인 수행 시 프롬프트 삽입):

1. (결합 간과) biome 경계 jitter 소스로 기존 `continents` fbm 을 재사용 (noise +0) 하는 것 vs 독립 fbm 샘플 — 동일 noise 장 상관의 시각 아티팩트 리스크 평가.
2. 극관을 ocean/land mix **이후 최종 mix** 로 얹는 순서 (결정 4 B) 가 툰드라→극관 연속성 / #775 해안선 전이와 충돌하지 않는가.
3. `LAND_COLOR_RGB` 재사용 (temperate 의미 재문서화 + 값 튜닝) vs biome 3색 전부 신규 상수 — 기존 #775 상수/uniform/테스트 계약과의 drift 리스크 비교.

**수행 결과 (agy, 2026-07-04 — 로그 `.claude/logs/cross-validate-architecture-783.log`, 최종 판정 "Accepted 권장")**:

**합의 (설계 유지)**:

1. **Q2 극관 최종 mix 순서** — 충돌 없음 확인. 툰드라 (0.72–0.88) → 극관 (0.88–0.96) 순차 임계로 연속 전이, 중·저위도 iceMask=0 이라 #775 해안선 전이 100% 보존, 고위도에서 빙권이 해안선을 덮는 것은 실제 물리 정합 ("의도적이고 올바른 시각적 수렴"). 결정 4 유지.
2. **Q3 `LAND_COLOR_RGB` 재사용 (A)** — 신규 3색 전면 교체 (B) 는 #775 uniform 배선/테스트 계약 파괴로 drift 리스크 큼. (A) 채택 유지 + **의미 재문서화 주석 가드 상세화** (temperate 밴드 색으로 동적 사용됨을 상수 선언부와 바인딩 계층 양쪽에 명시) 를 developer 지시에 반영.
3. **Q1 continents 재사용 우선 채택 타당** — 성능 우위 압도적. 단 상관 아티팩트 리스크 High 평가 (해안선 굴곡과 biome 경계 평행 동조 가능) → qa DoD 실측 관찰 항목 유지.

**고유 발견 (수용 — 사실 정정 포함)**:

4. **스위즐링 백업 플랜** — 아티팩트 발현 시 독립 fbm 대신 `fbm(p.zyx * 2.4)` 좌표 스위즐링으로 탈상관 → §A3.7 재검토 조건 4 에 구체화 박제. **단 "추가 연산 비용 0" 주장은 사실 오류로 정정** — 스위즐링도 fbm 신규 호출 (hash 24회) 로 독립 샘플과 동일 비용. 채택 근거는 탈상관 + 신규 noise 함수 불요.
5. **극관 land/ocean 차등 부재** — 실제 극빙은 지형별 분포가 다름 ("위도로만 잘린 흰 원형 모자" 우려). iceMask 가 latJ (jitter 포함) 기반이라 경계 요동은 이미 있음 — 1차 수용 범위 밖, qa 실측 관찰 + §A3.7 재검토 조건 6 신설.

**부분 수용**:

6. **uniform +10 인터페이스 복잡도** — struct 바인딩은 Babylon ShaderMaterial 개별 uniform 패턴 (기존 4중 SSoT) 과 이질적이라 기각, **바인딩 계층 그룹화 주석** (biome 상수 블록 명시) 으로 절충 — developer 지시 반영.
7. **body 별 파라미터화 탈출구** — §A3.7 재검토 조건 5 에 이미 박제됨 (합의 재확인).

**Claude 편향 셀프 체크 결과**: 결합 간과 (미통과 의심 축이었던 continents 이중 재사용) — agy 도 리스크 High 로 동의하나 채택 자체는 타당 판정. jitter 진폭이 작고 (위도 ±0.06) 백업 플랜이 구체화되어 실측 판정 (DoD) 으로 이관. 나머지 3종 통과 유지.

---

## Amendment 4 (2026-08-17) — 지구 대륙 윤곽 실제화: 「에셋 0」의 조건부 예외 (#1119)

- **상태**: **Provisional** (cross-validate 대기 — §A4.8 통합 후 Accepted 전이)
- **이슈**: [#1119](https://github.com/coseo12/astro-simulator/issues/1119) (type:feat, priority:high, group:C-solar-system)
- **형식**: **Amendment** (신규 ADR 기각). §A3.3 결정 1 과 **동일 기준** — 신규 모듈 0, 기존 rocky 분기 확장이면 Amendment. 다만 본 건은 §배경 의 **핵심 제약 「에셋 0」 자체를 조건부로 개정**하므로 본문 결정의 갱신이고, 그래서 더욱 별도 파일이 아니라 같은 문서에 부기해야 한다 (rocky 분기 이력 §결정 5 → A1 결정 4 → A3 → A4 가 한 파일에 수렴). **원문 소급 치환 0 — 부기만.**
- **범위**: 본 PR 은 **설계·ADR 만**. 구현·에셋 취득은 후속 dev.

### A4.1 배경 — #783 이 닫지 못한 축

#775 (ocean↔land 2색) → #783 (극관 + biome 3밴드) 는 **모두 색·밴드 축**이었고, 대륙 **모양**은 여전히 `fbm(p * 2.4)` 다. #783 이 이미 "지구가 지구 같지 않다" 는 같은 사용자 관찰에서 나왔으므로 (§A3.1), **같은 축의 3회차 정밀화는 해답이 아니다** — 아프리카도 아메리카도 없는 한 색을 아무리 맞춰도 실제 지구가 되지 않는다.

「에셋 0」 (§배경) 의 실질 근거는 세 개다: **(i) 에셋 파이프라인 신설 (ii) 번들 증가 (iii) WebGPU 호환 리스크**. 본 Amendment 는 그 셋을 각각 **실측·판정**하고, 셋을 최소화하는 **저해상도 육지 마스크 1장** 에 한해 예외를 연다. 「에셋 0」 원칙 자체는 폐기되지 않는다 — 색/고도/구름/야간불빛 텍스처는 여전히 비목표다 (§A4.7).

### A4.2 코드베이스 실측 (설계 결정의 근거 — 재조사 불필요)

1. **에셋 파이프라인 부재 실측** — `public/` 디렉토리 **0개** (저장소 전체), 커밋된 텍스처 바이너리 **0건** (`git ls-files '*.png' '*.jpg' '*.webp' '*.ktx2' '*.basis' '*.dds'` 결과 91 PNG 는 **전부** `__baselines__` / `docs/screenshots` / `docs/reports` 이고 런타임 미참조), `new Texture(url)` / `SceneLoader` / `AssetsManager` / `assetsInlineLimit` **각 0건**. 유일한 런타임 이미지는 `apps/web/app/icon.svg` (335 B, favicon). → **"파이프라인 신설" 은 과장이 아니라 사실이다.** 다만 신설 실체는 `apps/web/public/` 디렉토리 1개 + URL 문자열이다 (Next.js 정적 서빙).
2. **유일한 텍스처 선례** = `packages/core/src/scene/billboard-alpha-mask.ts` 의 `getOrCreateBillboardAlphaMask(scene)` — 64×64 `DynamicTexture` 를 **per-scene 캐시**로 1회 생성. URL 로드가 아니라 절차 생성이지만, **텍스처 수명·공유 패턴의 선례**는 존재한다 (§A4.3 결정 6 이 답습).
3. **셰이더 sampler uniform 0개** — `attributes: ['position', 'normal']`, `samplers` 옵션 **미지정**, `shaderLanguage` **미지정**(GLSL 기본) → WebGPU 는 Babylon 의 GLSL→WGSL 자동 변환에 전적으로 의존한다. GLSL 소스에 `sampler2D` / `texture2D` **0건**.
4. ⚠️ **저장소에서 sampler 를 쓰는 유일 셰이더가 WGSL 을 손으로 따로 쓴다** — `gravitational-lensing.ts` 는 `ShaderStore.ShadersStoreWGSL` ↔ `Effect.ShadersStore` 를 `isWebGPU` 로 **런타임 분기**한다 (`:165-178`). 단 이는 **PostProcess** 경로이고, 그 이유는 Babylon 이 자동 제공하는 샘플러 이름이 백엔드마다 다르기 때문 (`textureSampler` / `textureSamplerSampler`) 이다. **`ShaderMaterial` + 개발자가 명시 선언한 `sampler2D` 경로와 동일 클래스라고 단정할 수 없다.** → 단정 대신 §A4.3 **결정 0 게이트**.
5. **UV attribute 미바인딩** — fragment 가 `vec3 p = normalize(vLocalPos)` 로 구면좌표를 직접 만든다 (`:415`). 위도는 `p.y` (sin-space), 경도는 **아예 계산하지 않는다**. → 마스크 UV 도 `p` 에서 파생하면 `attributes` 배열 무변경.
6. **자전·tilt 는 `mesh.rotationQuaternion` → `world` matrix → `vNormal` 만** 영향한다 (§A2.3 결정 2). `vLocalPos` 는 local 유지 (painted-on 계약). → **마스크는 추가 배선 0 으로 자전(#782)·`axialTiltDeg` 23.44° 를 자동 상속**한다. 이것이 판정 3 (좌표계 정합) 의 구조적 답이다.
7. **회귀 가드 지형** — 지구 canvas 픽셀을 담는 **PNG baseline 은 `apps/web/scripts/__baselines__/lod-body-{high,mid,low}.png` 3장뿐** (`browser-verify-lod.mjs` 의 `TIER_FOCUS_BODY.body = 'earth'`, 판정 max pixel diff < 15%). `lod-inner-*` 는 화성 / `lod-solar-*` 는 태양 focus. r1-guard 12장은 UI 영역만 clip 하므로 canvas 미포함. 셰이더 회귀는 baseline 이 아니라 `verify:783-earth-detail` 의 ON/OFF **상대 성질** 판정이 담당한다 (절대 임계 금지 — `shader-pixel-guard.yml`).

### A4.3 결정

#### 결정 0 — Phase 0 측정 게이트 (다른 모든 구현 이전, 차단 조건)

**`sampler2D` 가 이 공유 GLSL `ShaderMaterial` 에서 WebGPU / WebGL2 양쪽에 동작하는가**를 최우선 실측한다. 최소 스파이크: rocky 분기에 1×1 흰색 `RawTexture` 를 바인딩하고 `texture2D(uSurfaceMask, vec2(0.5)).r` 을 곱한 뒤,

- (a) **실 Chrome (WebGPU)** — earth disk 렌더 + console error 0
- (b) **headless chromium `--use-angle=swiftshader` (WebGL2, CI 재현)** — 동일

두 셀 모두 PASS → 나머지 결정대로 진행. **어느 하나라도 FAIL → 구현 중단 + architect 재개봉** (§A4.7 재검토 조건 1). 4타입 공유 셰이더를 WGSL 이중 소스화하는 것은 비용 계급이 달라 C안의 채택 근거 자체가 무너진다.

> 근거: #820 의 **measurement-first Phase 0 게이트** 선례 (로컬 무재현 전제를 구현 전에 판별). §A4.2-4 는 리스크의 **존재**를 보이지만 **동일 클래스임을 증명하지 않는다** — 그래서 "위험하다" 도 "안전하다" 도 선언하지 않고 게이트로 넘긴다.

#### 결정 1 — 출처·라이선스 (실측 박제, 취득은 dev)

| 항목            | 값                                                                              |
| --------------- | ------------------------------------------------------------------------------- |
| 데이터셋        | **Natural Earth 1:50m Physical Vectors — Land** (`ne_50m_land`), VERSION `4.1.0` |
| 공식 취득 URL   | `https://naciscdn.org/naturalearth/50m/physical/ne_50m_land.zip`                |
| 취득일          | **2026-08-17**                                                                  |
| zip SHA256      | `0b8e670cf80dce9cbebe2a193bc44ba5602758c22e1fa603980553646d7ff162`              |
| 좌표계 (`.prj`) | `GEOGCS["GCS_WGS_1984"] … PRIMEM["Greenwich", 0]` — WGS84 경위도, 본초자오선 Greenwich |

**미러 동일성 실측**: `https://naturalearth.s3.amazonaws.com/50m_physical/ne_50m_land.zip` 이 위 공식 CDN 파일과 **SHA256 동일** (2026-08-17 양쪽 다운로드 후 대조). 미러를 써도 출처가 흐려지지 않는다.

**라이선스** — `https://www.naturalearthdata.com/about/terms-of-use/` (2026-08-17 취득. 직접 GET 은 mod_security `406` 이라 `web.archive.org` 미러로 원문 확인):

> "All versions of Natural Earth raster + vector map data found on this website are in the public domain."
> "No permission is needed to use Natural Earth."
> "Crediting the authors is unnecessary."

권장 인용문 (의무 아님): `Made with Natural Earth.`

⚠️ **모순 표기를 알고도 채택했음을 박제한다** — 다운로드 페이지 푸터는 `© 2009 - 2026. Natural Earth. All rights reserved.` 다. 이는 **사이트 전반 boilerplate** 이고 terms-of-use 는 범위를 **"map data"** 로 명시해 public domain 을 선언한다. 본 결정은 후자를 근거로 한다. 미래 관찰자가 "확인하지 않았다" 로 오인하지 않도록 불일치를 남긴다.

**NASA Blue Marble watermask 는 후보에서 탈락** — 2026-08-17 시점 시도한 `eoimages.gsfc.nasa.gov/images/imagerecords/76000/76487/world.watermask.21600x10800.png` 이 `404` 였고 대체 URL 을 확정하지 못했다. Natural Earth 는 (i) 라이선스 문구가 public domain 을 **명시**하고 (ii) **벡터**라 임의 해상도 재래스터화가 가능해 재현성이 높다 (§A4.3 결정 8).

#### 결정 2 — 마스크 해상도·형식 (번들 실측 근거)

**(2-a) 먼저 화면 각도해상도를 실측한다** — 해상도 요구는 "크면 좋다" 가 아니라 화면 픽셀 밀도가 정한다. dev server + Playwright, `?gpu=a&focus=earth&lod=auto&rotate=off&orbits=off` + jd 고정, disk 반경은 기존 `browser-verify-783` 과 **동일 산식** (`boundingSphere.radiusWorld / √3` 의 카메라 right 방향 edge 투영):

| 조건                    | 기본 focus R (px) | 정합 마스크 폭 `2πR` | 최대 줌인 R (px) | 최대 줌 각도해상도 |
| ----------------------- | ----------------: | -------------------: | ---------------: | -----------------: |
| 1280×720 dsf1           |          **98.3** |                  618 |            810.9 |       0.0707 °/px |
| 1920×1080 dsf1          |         **147.5** |                  927 |           1216.4 |       0.0471 °/px |
| 1920×1080 dsf2 (retina) |         **295.0** |                 1854 |           2432.8 |       0.0236 °/px |

→ **기본 focus 정합 폭 구간 = [618, 1854].**

**(2-b) 인코딩 바이트 실측** — Natural Earth 50m → 8192×4096 이진 래스터 1회 → 각 후보로 면적평균 다운샘플. `aa` = 면적 사전필터(8bit 계조), `binary` = 임계 128 이진화:

| 해상도    | variant | PNG gray8  | PNG palette | WebP lossless |
| --------- | ------- | ---------: | ----------: | ------------: |
| 512×256   | aa      |     15,848 |      15,848 |        13,774 |
| 512×256   | binary  |      3,404 |       2,984 |         2,428 |
| 1024×512  | aa      | **30,135** |      30,135 |        26,112 |
| 1024×512  | binary  |      8,034 |       7,431 |         6,046 |
| 2048×1024 | aa      |     54,071 |      54,071 |        44,532 |
| 2048×1024 | binary  |     21,589 |      18,738 |        15,344 |

**(2-c) 형상 충실도 IoU** — 기준 = 50m 8192 래스터를 4096×2048 로 면적평균 후 0.5 임계. 후보는 기준 격자에서 **bilinear 재구성 후 0.5 임계** (GPU 샘플링 규약과 동일):

| 해상도    | variant | IoU%      |
| --------- | ------- | --------: |
| 256×128   | aa      |     95.45 |
| 512×256   | aa      |     97.31 |
| 1024×512  | binary  |     97.70 |
| 1024×512  | aa      | **98.48** |
| 2048×1024 | binary  |     98.66 |
| 2048×1024 | aa      |     99.14 |

판별력 대조군: 위도 부호를 반전시킨 **오규약**으로 같은 측정을 돌리면 IoU **11.82%** — 이 지표가 실제로 형상을 재고 있음을 같은 실행에서 확인.

→ **채택: 1024×512 · 8-bit grayscale PNG · 면적 사전필터(AA) = 30,135 B.**

근거:

- **해상도** — 1024 는 정합 폭 구간 [618, 1854] 를 **[0.55×, 1.66×]** 로 덮는다. 2048 은 전 구간 **[1.10×, 3.32×] over-resolution** 이라 결정 4 의 `noMipmap` 전제에서 축소 shimmer 를 **상시** 유발한다. 512 는 retina 기본 focus 에서 3.6× under (뭉개짐).
- **AA 채택 근거는 IoU 가 아니라 사전필터다** — `noMipmap` 하에서 mip 을 대신한다 (결정 4). 다만 1024 에서는 IoU 도 AA 우세 (98.48 vs 97.70) 라 두 축이 충돌하지 않는다.
- ⚠️ **지표 한계 명시** — **해상도를 가로지르는** 비교에서는 binary 가 bytes/IoU 로 우월하다 (2048 binary 98.66% @ 15,344 B 가 1024 aa 98.48% @ 26,112 B 를 이긴다). 그러나 **IoU 는 정의상 sub-texel 가장자리 정보를 임계로 버리므로 AA 의 가치(사전필터)를 측정하지 못한다.** 해상도가 결정 4 의 제약으로 먼저 고정되므로 이 우월은 본 결정의 반례가 아니다. (이 문단은 "AA 가 언제나 낫다" 는 **전칭 단정을 스스로 반증**해 두는 것이다.)
- **PNG 채택** (WebP 26,112 B 대비 **+4,023 B**) — (i) `pngjs` 가 **이미 루트 devDependency** 라 생성 스크립트를 **신규 의존 0** 으로 커밋할 수 있다 (`sharp` 는 직접 의존이 아니라 `next` 경유 전이 의존이므로 근거로 쓸 수 없다). (ii) 커밋 바이너리는 PNG 91장 / WebP 0장 — 신규 포맷 클래스를 만들지 않는다. (iii) 델타는 static 산출물의 **0.037%**.
- **데이터셋 50m 채택** (110m 대비 +7,292 B) — 110m 은 1024 로 해상도를 올려도 IoU 가 **96.95% 에서 포화**해 **50m@512 의 97.45% 보다 낮다.** 래스터 해상도로 원천 일반화를 복구할 수 없다. ⚠️ 자기참조 주의: 기준 격자가 50m 유래이므로 이 수치는 **"110m 이 50m 대비 얼마나 일반화됐는가"** 를 재는 것이고 절대 정확도가 아니다.

**(2-d) 번들 증가 실측** (`pnpm install --frozen-lockfile` + `pnpm build`, develop tip `37c0a49`):

| 축                                                      |         값 |
| ------------------------------------------------------- | ---------: |
| `apps/web/.next/static` 총 바이트 (95 파일)             | 10,933,577 |
| 그중 JS (82 파일)                                       |  8,652,828 |
| 그중 단일 폰트 `PretendardVariable….woff2`              |  2,057,688 |
| **마스크 1장**                                          | **30,135** |
| static 산출물 증가율                                    | **+0.276%** |
| **JS 번들 증가**                                        |  **0 B** — `import` 가 아니라 URL 문자열 |
| 초기 페이지 전송 증가                                   |  **0 B** — 씬 생성 시점 fetch, `?surface=off` 면 fetch 자체 없음 |

즉 마스크는 **이미 커밋된 폰트 파일 하나의 1.46%** 다. 「번들 증가」 라는 「에셋 0」 의 근거 (ii) 는 이 규모에서 성립하지 않는다.

#### 결정 3 — 좌표계 정합 (실측 확정, 추측 0)

셰이더는 mesh UV attribute 를 바인딩하지 않는다 (§A4.2-5). 마스크 UV 도 **동일한 `p = normalize(vLocalPos)`** 에서 파생한다 — `attributes` 배열 무변경.

```glsl
// equirectangular UV — p 는 이미 rocky 분기 진입부에 존재 (추가 varying 0)
float u = atan(p.z, p.x) * INV_TWO_PI + 0.5;      // local +X = 경도 0° (본초자오선)
float v = acos(clamp(p.y, -1.0, 1.0)) * INV_PI;   // local +Y = 북극(위도 +90°) → v = 0
```

마스크 파일 규약: `x=0 ↔ 경도 −180°`, `x=W/2 ↔ 경도 0°`, `y=0 ↔ 위도 +90°`, 픽셀 중심 샘플링.

**실측 근거** (전부 같은 실행 안에 양성·음성 대조군 포함):

- **(a) 마스크 규약 검증** — known-point 14개 (**양성 8** 육지 / **음성 6** 바다) 중 **13 PASS**. 유일 FAIL 은 Sydney (값 `60/255`) 로 **해안 도시의 sub-texel 혼합**이며 규약 오류가 아니다 — 2048×1024 에서 PASS 로 전환됨을 같은 실행에서 확인 (해안 8도시 판별: 1024 aa `6/8` → 2048 aa `7/8`, 내륙 `4/4` · 대양 `4/4` 는 전 해상도 불변). 판별력 대조군: **경도 180° 시프트** 오규약 → `9/14`, **위도 부호 반전** 오규약 → IoU `11.82%` (정상 `98.48%`).
- **(b) 지리 sanity** — 면적(`cos φ`) 가중 육지 비율 **28.75%** (실제 지구 29.2%, 남극 포함). equirect 단순 픽셀 비율은 33.05% 로 고위도 과대표현 때문에 다르다. 판별력 대조군: **동일 픽셀 비율(33.2%) 의 무작위 마스크**는 면적가중 **33.82%** → 이 지표가 실제로 지리를 담고 있음이 확인된다 (마스크가 뒤집히거나 손상되면 값이 무너진다 → 결정 8 회귀 가드의 근거).
- **(c) local frame ↔ 화면 실측** (`rotate=off`, `beta=π/2`, 1280×720, identity rotation): local **+X → 화면 오른쪽** (`Δx = +98.3`), local **+Y → 화면 위** (`Δy = −98.3`, canvas y 하향), local **+Z → 카메라 반대쪽**. 즉 근측 중심 = **−Z**.
- **(d) 자전 방향 실측** (rotate ON, 1/8 항성일 간격 4표본): local +X 지점의 화면 x 가 `−100.7 → −73.8 → −5.6 → +75.7`, 즉 **좌 → 우**. 북극이 위인 실제 지구 관측 (근측 표면이 동쪽 = 오른쪽으로 이동) 과 일치 — #782 의 자전 방향 결정과 정합한다.

(c)(d) 로부터 근측 중심(`−Z`) 에서 동쪽은 `+X` 방향이므로, 적도 `p(φ) = (sin φ, 0, −cos φ)` 에서 `u` 가 `φ` 와 함께 증가한다 (`φ=0 → u=0.25 → 경도 −90°`, `φ=90° → u=0.5 → 경도 0°`). → **거울상 아님** 이 계산이 아니라 실측 프레임으로 확정된다.

⚠️ **명시 한계 — 새 불일치를 도입하지 않는다**: 위 규약은 본초자오선을 local `+X` 에 놓는데, `ROT_TILT_AXIS` 도 world `X` 다 (`self-rotation.ts:82`). 따라서 `jd = epoch` 에서 본초자오선이 obliquity 절선과 겹친다. 이는 **Amendment 2 §결정 3 이 이미 채택한 "축 방위각 world X 고정 근사 (pole RA/Dec 미사용)" 의 직접 귀결**이며 본 Amendment 가 새로 만드는 오차가 아니다. **특정 jd 의 sub-solar 경도는 천문 정확하지 않다** — Info/focus 패널은 그것을 주장하지 않으므로 D-T2 표기 불변 (§A4.6).

#### 결정 4 — mip / seam 처리

`noMipmap: true` + U `WRAP_ADDRESSMODE` / V `CLAMP_ADDRESSMODE` + `BILINEAR_SAMPLINGMODE`.

| 축                | (A) mipmap ON                                                                                   | (B) `noMipmap` (채택)                                          |
| ----------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| ±180° 자오선 seam | ✗ `atan` 불연속 → 인접 fragment `du/dx` 폭증 → mip level 폭주 → **seam 선**                     | ✓ wrap 주소 모드가 경계를 정상 보간 — **구조적으로 seam 없음** |
| 축소 앨리어싱     | ✓ mip 이 흡수                                                                                   | △ 사전필터(AA, 결정 2) + 해상도 정합으로 흡수                  |
| 신규 GLSL 기능    | `textureGrad` / `dFdx` 필요 (Babylon GLSL→WGSL 변환 가능 여부 **미실측**)                        | 불요                                                            |

→ **(B)**. 결정 2 의 "최대가 아니라 정합 해상도" 선택이 여기서 나온다 — 두 결정은 **커플링돼 있다** (over-resolution × noMipmap = shimmer).

- **극 특이점** (`acos` pinch): `|sin φ| ≥ 0.84` 는 `iceMask` 가 덮으므로 (§A3.3 결정 4) 마스크 pinch 가 시각 노출되지 않는다.
- **재검토**: qa 가 기본 focus 회전 중 해안선 shimmer 를 **인지**하면 `textureGrad` + seam 미분 wrap 보정으로 승격 (§A4.7 재검토 조건 2). 단 `textureGrad`/`dFdx` 의 WGSL 변환 가능 여부를 **먼저 실측** — 결정 0 스파이크에 합류 가능.

#### 결정 5 — `continents` fbm 의 처분: **유지 + 역할 전환** (폐기 기각)

| 축                             | (A) fbm 폐기 (마스크 단독)                                                | (B) 유지 + 역할 전환 (채택)                     |
| ------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------- |
| landMask 소스                  | 마스크                                                                    | 마스크 (동일)                                   |
| 해안선 고주파                  | ✗ 텍셀 계단 노출 — 최대 줌 0.0236 °/px 에서 texel 당 **14.9 px** (1024)   | ✓ fbm 도메인 워프로 텍셀 이하 불규칙            |
| biome 경계 jitter (A3 결정3-c) | ✗ **소실** → 위도 밴드가 딱딱한 가로선으로 회귀                           | ✓ `latJ` 그대로 유지                            |
| noise 샘플 수                  | −1                                                                        | **±0** (기존 1회 재사용)                        |
| 회귀 표면                      | biome·극관 식 재설계                                                      | rocky 분기 `landMask` 줄만                      |

→ **(B) 채택**. `continents` 를 (i) **마스크 샘플 좌표의 도메인 워프**, (ii) **`latJ` biome jitter** 두 곳에 재사용. **fbm 호출 수 불변** — §A3.3 결정 3-c 의 "noise 샘플 +0" 불변식이 보존된다. 워프 진폭 상수 `MASK_WARP_AMP` 만 신규 (rendering-only 미학 상수 SSoT).

> **(B) 는 성능 절약이 아니라 품질 요건이다.** 최대 줌인 각도해상도 0.0236 °/px 는 **어떤 실용 마스크 해상도로도 못 덮는다** (2048 에서도 texel 당 7.5 px). 고주파는 마스크가 아니라 fbm 이 담당해야 한다. 마스크는 **저주파 형상**, fbm 은 **고주파 디테일** — 역할 분리가 본 설계의 핵심이다.

#### 결정 6 — 다른 body 무영향 + 확장 경로

`solar-system.json` 에 `surfaceMask` 필드 추가 **기각**. §결정 2 (C) 의 직접 연장 — 마스크는 물리 데이터가 아니라 **rendering 에셋 참조**다 (IAU/NASA 관측값 SSoT 에 누수 금지).

→ **코드 상수 테이블** `SURFACE_MASK_BY_BODY: Readonly<Record<string, string>> = { earth: 'earth-land-mask.png' }` — `SURFACE_TYPE_BY_BODY` 동형. **파일명만** 보유하고 base URL 은 `createSolarSystemScene` 옵션으로 주입 (core 가 web 라우팅을 몰라야 함 — 기존 단방향 의존 유지).

- 미등록 body → `uMaskEnabled = 0` → 현행 절차 경로 **바이트 동일**. 23개 단색 body 는 애초에 셰이더 미진입 (테이블 부재 = 명시적 opt-in, §결정 2 C).
- **마스크 소비는 rocky 분기 내부에서만.** desert / gas-bands / cratered 식 무변경 → mars·jupiter·moon 픽셀 불변 (§A3.4 핵심 예측 재현 대상).
- 확장(화성 등) = **테이블 1줄 + 에셋 1장, 데이터 0**.
- **텍스처 인스턴스는 per-scene 캐시** — `getOrCreateBillboardAlphaMask(scene)` 패턴 답습 (§A4.2-2). high/mid 두 머티리얼이 같은 `Texture` 를 공유해 VRAM 2배를 막는다. **신규 함수 ≠ 신규 구현** (CLAUDE.md).

#### 결정 7 — 로드 실패·미도착 처리: graceful degradation **채택** (「fallback 분기 금지」 비적용 판정)

`uniform float uMaskEnabled` (0/1) 로 현행 절차 경로와 마스크 경로를 `mix`. 텍스처 미도착·실패 시 `0` → **`?surface=off` 가 아니라 「오늘의 지구」** 로 렌더 (Amendment 3 시점 동작 100%).

- **왜 §가드 설계 원칙 「drift 가드는 fail-fast 만 — fallback 분기 절대 금지」 에 저촉되지 않는가**: 그 규약의 대상은 **가드** — 불변식을 *주장하는* 검증 코드다. 가드가 fallback 을 가지면 "PASS" 가 "검사됨" 을 뜻하지 않게 되어 **자기모순**이 된다. 본 분기는 가드가 아니라 **렌더 경로의 점진적 향상**이며 **아무것도 주장하지 않는다** — 실패해도 거짓 PASS 가 생기지 않는다. 두 축은 직교하므로 규약을 기계적으로 확대 적용하지 않는다.
- **단, 침묵은 금지한다** — 제품은 degrade 하되 **검증은 fail-fast**:
  - 로드 실패 시 dev 빌드에서 **once-guard `console.warn`** (reviewer #776 패턴, 프레임당 spam 차단, `NODE_ENV !== 'production'` DCE).
  - `?surface=on` (기본) 상태에서 마스크가 적용되지 않으면 신규 verify 스크립트가 **FAIL** (§A4.5 DoD 1). 즉 "조용히 예전 지구로 돌아가 있는" 상태가 CI 를 통과할 수 없다.
- **WGSL 제약 대응**: `uMaskEnabled` 로 **분기하지 않는다.** 텍스처는 항상 **무조건 1회** 샘플하고 결과를 `mix` 로 섞는다 (`gravitational-lensing.ts` 의 "textureSample 은 분기 밖에서 1회만" 주석과 정합). 미도착 구간에도 바인딩이 존재하도록 **1×1 placeholder `RawTexture` 를 먼저 바인드**하고 `onLoad` 에서 교체한다.

#### 결정 8 — 생성 재현성 + 회귀 가드

- 커밋 대상: 에셋 1장 (`apps/web/public/textures/earth-land-mask.png`) + **생성 스크립트** `scripts/generate-earth-land-mask.mjs` (`pngjs` + `node:zlib` 만 — **신규 의존 0**). 네트워크 접근은 **개발자 실행 시점만** 이고 빌드·CI 경로가 아니다.
- 스크립트 헤더에 결정 1 의 URL · VERSION · SHA256 · 취득일을 박제. `apps/web/public/textures/README.md` 에 출처·라이선스 **원문 인용** + 모순 표기 각주.
- **단위 테스트 (네트워크 무관 — 커밋된 PNG 만 대상)**:
  1. known-point 육지/바다 판별 — **양성 8 / 음성 6** (결정 3-a 목록), 해안 도시는 제외 (sub-texel 이라 판별력 없음)
  2. 면적가중 육지 비율 `28.75% ± 0.5pp`
  3. 크기 `1024×512`, 채널 grayscale

  → 마스크의 **상하·좌우 반전 / 손상 / 오교체**를 잡는다. (1) 은 규약 오류를, (2) 는 내용 손상을 잡아 축이 직교한다.

### A4.4 Concrete Prediction (구현 후 `git diff --stat` 실측 재현)

| 영역               | 파일                                                             | 예측 라인          | 근거                                                                                               |
| ------------------ | ---------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------- |
| 셰이더 rocky 확장  | `procedural-planet-shader.ts`                                    | ~70–120 변경/신규 | GLSL rocky 분기 +6–10 / sampler 선언 +1 / uniform +2 (`uMaskEnabled`, `maskWarpAmp`) / 상수 +2 / 팩토리 텍스처 배선 +25–40 / JS 미러 +15–25 / 헤더 주석 |
| 텍스처 헬퍼        | `earth-land-mask-texture.ts` (신규) 또는 셰이더 모듈 내          | ~40–70 신규       | `billboard-alpha-mask.ts` (per-scene 캐시 + placeholder + onLoad/onError) 동형                     |
| scene 배선         | `solar-system-scene.ts` / `body-mesh-factory.ts`                 | ~8–20 변경        | `surfaceMaskBaseUrl` 옵션 수신 → 팩토리 전달만                                                     |
| web 배선           | `sim-canvas.tsx`                                                 | **0–3**           | 기본값이 `/textures/` 면 0. 옵션 명시 전달 시 3                                                    |
| 에셋               | `apps/web/public/textures/earth-land-mask.png` (신규)            | 30,135 B          | 결정 2                                                                                             |
| 생성 스크립트      | `scripts/generate-earth-land-mask.mjs` (신규)                    | ~150–220 신규     | SHP 파서 + 스캔라인 래스터화 + 면적 다운샘플 + pngjs write                                          |
| 단위 테스트        | `procedural-planet-shader.test.ts` / `earth-land-mask.test.ts`   | ~90–150 신규/변경 | 결정 8 3축 + `uMaskEnabled=0` 시 기존 미러 결과 **불변** 어서션                                     |
| browser verify     | `apps/web/scripts/browser-verify-1119-earth-mask.mjs` (신규)     | ~130–200 신규     | 대륙 형상 상관 측정 (§A4.5 DoD 1)                                                                  |
| **데이터**         | `packages/shared/data/solar-system.json`                         | **0**             | 결정 6 — rendering 에셋 참조는 코드 상수                                                           |
| **타 셰이더**      | `sun-shader.ts` / `ring-shader.ts` / `starfield.ts`              | **0**             | 무관 모듈                                                                                          |

**핵심 예측** (reviewer/qa 실측 대상):

- **JS 번들 증가 0 B** — 마스크가 청크에 들어가면 `import` 로 잘못 배선한 것 (결정 2-d 위반 신호).
- **`uMaskEnabled = 0` 경로가 Amendment 3 과 픽셀 동일** — 회귀 격리의 기계 판정 지점.
- **mars / jupiter / moon 픽셀 불변** — `browser-verify-783 MODE=others` + `MODE=diff` 재사용으로 그대로 측정 가능 (신규 측정 축 0).
- **fbm 호출 수 불변** — 신규 `fbm(` 호출이 생기면 결정 5 위반.
- **picking / camera / orbit / tier / LOD 변경 0** — fragment albedo + 텍스처 1장뿐.

### A4.5 DoD (측정 가능 — 실 Chrome GUI 필수, CRITICAL #3)

| #   | 기준                                                                                                                                                                                       | 측정 방법                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| 0   | **Phase 0 게이트 PASS** — WebGPU(실 Chrome) + WebGL2(swiftshader) 양쪽에서 `sampler2D` 렌더 + console error 0                                                                              | 결정 0 스파이크. **FAIL 이면 이하 전부 중단**                                                                       |
| 1   | **대륙 형상이 실제와 일치** — 화면 disk 를 위경도로 역투영해 육지/바다 분류한 결과가 **커밋된 마스크와 IoU ≥ 0.80**. OFF (`&surface=off`) 및 마스크 미적용 경로 대비 **유의 증가**           | 신규 `browser-verify-1119-earth-mask.mjs`, `?focus=earth&rotate=off&speed=0&beta=π/2` 결정적 프레임 + pngjs        |
| 2   | **마스크 미적용이 CI 를 통과하지 못함** — `uMaskEnabled` 가 0 으로 고착된 상태를 고의 주입하면 DoD 1 이 **FAIL** (negative test)                                                            | 동일 스크립트 negative 실행 (가드 도입 4축 §2 3중 시뮬레이션)                                                       |
| 3   | **자전·tilt 정합** — `rotate=on` 에서 대륙이 표면과 함께 좌→우 이동, 극관·biome 위도 불변. `axialTiltDeg` 23.44° 로 극축 기울기 유지                                                        | 기존 `verify:782-rotation` PASS + 신규 스크립트의 2프레임 상관                                                      |
| 4   | **#783 무회귀** — 극관 남북 whiteDayPct ≥ 50, 적도 G-share > 중위도 G-share, 마젠타 0                                                                                                       | 기존 `verify:783-earth-detail` (현행 실측 baseline: N 72% / S 61.5%, eq 0.5057 > mid 0.4045, magenta 0)             |
| 5   | **#773 광원 무회귀** — 낮/밤 대비비 유지, 밤면 대륙도 어두움                                                                                                                                | 기존 `verify:773-light` + `verify:783` DoD 4 (현행 baseline: dayPolar 220.2 / nightPolar 52.4)                      |
| 6   | **분기 격리** — mars / jupiter / moon 스크린샷 diff ≈ 0 (diffPx 비율 < 0.001)                                                                                                               | 기존 `browser-verify-783 MODE=others` → `MODE=diff`                                                                |
| 7   | **LOD baseline** — `lod-body-{high,mid,low}.png` **재캡처는 의도된 변경으로 허용**. `lod-inner-*`(화성) / `lod-solar-*`(태양) 은 재캡처 전 diff 를 먼저 측정하고, **변화 픽셀이 지구 화면 bbox 밖이면 즉시 중단** | `browser-verify-lod.mjs` 판정(max pixel diff < 15%) + 변화 픽셀 bbox 대조. ⚠️ "지구 외 baseline 이 전혀 안 바뀐다" 는 전칭 단정 금지 — 광각 뷰에 지구가 들어오면 그 픽셀은 정당하게 바뀐다 |
| 8   | **fps 회귀 0** — tier-a/b/c `fps-baseline-guard` PASS (texture fetch 1회 + sample 1회 추가)                                                                                                 | CI workflow                                                                                                        |
| 9   | **번들** — `apps/web/.next/static` 증가가 **마스크 파일 크기와 일치** (JS 증가 0)                                                                                                            | build 전후 `find … -exec stat` 합계 대조 (baseline 10,933,577 B @ `37c0a49`)                                        |
| 10  | **에셋 무결성 단위 테스트** — 결정 8 의 3축 PASS                                                                                                                                            | vitest                                                                                                             |
| 11  | **데이터 0** — `git diff --stat` 에 `solar-system.json` 부재                                                                                                                                | reviewer 실측                                                                                                      |
| 12  | **core typecheck 0** + 기존 procedural-planet 테스트 전체 PASS                                                                                                                              | `pnpm --filter core typecheck` + vitest                                                                            |
| 13  | **실 Chrome GUI 수동 검증 1회** — headless false positive 차단 (CLAUDE.md §headless ≠ 실 브라우저)                                                                                          | qa                                                                                                                 |

### A4.6 §Visual Fidelity 의무 체크리스트 4항목 (principles.md §1)

- [x] **데이터 SSoT 보존** — 마스크 파일명 매핑 · 워프 진폭은 전부 rendering-only 코드 상수. `solar-system.json` 직접 수정 **0** (DoD 11). ocean = `colorHint.hex` read-only 유지. 마스크는 **지리 형상**이지 IAU/NASA 물리 관측값이 아니므로 데이터 SSoT 와 경쟁하지 않는다.
- [x] **rendering 시점 분리** — fragment albedo 식 + 텍스처 1장. physics 엔진 (Rust+wasm) 무의존, P11-A 좌표 계약 위반 0.
- [x] **사용자 D-T2 가이드** — 대륙 윤곽은 **실제 지리의 저해상도 근사**이고, 특정 jd 의 sub-solar 경도는 **천문 정확하지 않다** (결정 3 한계). Info/focus 패널은 그것을 주장하지 않으므로 표기 불변.
- [x] **점유율 / 사실 비율 baseline** — mesh 기하·위치·rotation 불변 (albedo 만) → px diameter / 점유율 / 분리 마진 / #762 단조성 영향 **0**. LOD baseline 은 DoD 7 이 관할.

### A4.7 결과 · 재검토 조건

**기대 결과**: `?focus=earth` 에서 아프리카·아메리카·유라시아가 **알아볼 수 있는 형상**으로 보이고, 그 위에 Amendment 3 의 biome 3밴드 + 극관이 그대로 얹힌다. 해안선은 fbm 워프로 텍셀 계단 없이 자연스럽다. 자전 시 대륙이 표면과 함께 돈다. mars/jupiter/moon + 단색 22 + sun 무회귀. `?surface=off` 100% 복귀.

**재검토 조건**:

1. **Phase 0 게이트 FAIL** (결정 0) — `sampler2D` 가 WebGPU 또는 WebGL2 에서 동작하지 않으면 **본 Amendment 는 미실행 상태로 되돌리고 architect 재개봉**. 대안 축: (a) 4타입 공유 셰이더의 WGSL 이중 소스화 (비용 계급 상승 — C안 근거 붕괴) (b) `DynamicTexture` 로 CPU 에서 마스크를 그려 넣는 우회 (에셋은 여전히 필요) (c) C안 자체 철회 후 사용자 재협의.
2. **해안선 shimmer 인지** (결정 4) — `textureGrad` + seam 미분 wrap 보정으로 승격. 선행 조건: `textureGrad`/`dFdx` 의 Babylon GLSL→WGSL 변환 가능 여부 실측.
3. **해상도 부족 인지** — 사용자가 기본 focus 에서 형상을 "뭉개졌다" 로 인지하면 2048×1024 승격을 검토하되, **결정 4 의 noMipmap 과 커플링돼 있으므로 mip/seam 결정을 먼저 갱신해야 한다** (해상도만 올리면 shimmer 로 교환될 뿐).
4. **다른 body 마스크 요구** — 결정 6 의 테이블 1줄 + 에셋 1장. 단 화성 마스크는 "육지/바다" 가 아니라 albedo 지형이라 **의미가 달라** 별도 uniform 해석이 필요하다 (본 Amendment 의 자연 연장이 아님 — 별건 설계).
5. **바다 깊이색 / 대기 rim / 구름** — §A3.7 재검토 조건 1·2·3 그대로. 본 Amendment 는 **편승하지 않는다** (#1119 비목표).
6. **Natural Earth 버전 갱신** — `4.1.0` 고정. 상위 버전 도입 시 결정 8 의 단위 테스트 (면적가중 28.75% ± 0.5pp) 가 먼저 반응하므로, 값 갱신을 **의식적 SSoT 갱신**으로 처리한다 (조용한 임계 완화 금지).

### A4.8 교차검증 반영 사항 (cross-validate 대기 — Provisional)

**호출 전 Claude 편향 셀프 체크** (4종, [cross-validate-protocol.md](../guides/cross-validate-protocol.md) §5):

- **낙관적 일정** — **미통과 의심.** 결정 0 게이트가 PASS 라고 암묵 가정한 채 A4.4 Concrete Prediction 을 작성했다. WGSL 변환이 부분 성공(컴파일은 되나 샘플 결과가 다름)하는 회색지대를 게이트 판정식이 덮지 못할 수 있다 → **명시 질문 1**.
- **결합 간과** — **미통과 의심.** 결정 2(해상도) ↔ 결정 4(noMipmap) ↔ 결정 5(fbm 워프) 3자가 서로를 근거로 삼는다 (해상도는 noMipmap 때문에 낮추고, 낮춘 해상도는 fbm 워프로 보완). 순환 정당화일 위험 → **명시 질문 2**.
- **폐기 프레이밍** — 통과 판단. 「에셋 0」 을 폐기가 아니라 **조건부 예외**로 좁혔고 색/고도/구름 텍스처는 명시 비목표로 유지 (§A4.7-5).
- **순수주의** — 통과 판단. 결정 7 에서 「fallback 금지」 규약을 기계적으로 확대 적용하지 않고 가드/렌더 경로를 분리 판정했다.

**cross-validate 명시 질문** (메인 수행 시 프롬프트 삽입):

1. (낙관적 일정) 결정 0 게이트의 판정식 — "렌더 + console error 0" 이 Babylon GLSL→WGSL 의 `sampler2D` 변환 **부분 실패**(컴파일 성공 · 샘플 좌표/필터링 상이)를 놓치지 않는가. 놓친다면 어떤 추가 술어가 필요한가.
2. (결합 간과) 결정 2·4·5 의 상호 정당화가 순환인가 — "2048 + mipmap + seam 보정" 조합을 1차에 채택하지 않은 판단이 타당한가, 아니면 `noMipmap` 전제 자체가 회피 가능한 제약인가.
3. equirectangular 마스크에서 **극 pinch** 를 `iceMask` 가 가린다는 결정 4 의 논거가 `|sin φ| ≥ 0.84` 임계에서 실제로 성립하는가 (극관 전이 하단 0.84 와 마스크 왜곡 가시 시작 위도의 관계).
4. 결정 7 의 "가드 ↔ 렌더 경로" 분리 판정이 §가드 설계 원칙의 의도와 정합하는가 — degrade 를 허용하되 검증을 fail-fast 로 두는 이중 구조에 사각이 있는가.
