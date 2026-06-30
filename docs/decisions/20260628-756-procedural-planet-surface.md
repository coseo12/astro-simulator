# ADR 20260628-756 — 절차적 행성 표면 셰이더 (1차: 인프라 + 대표 4개)

- **상태**: Accepted (cross-validate 2026-06-28) — **Amendment 1 (#773/#775): Accepted (cross-validate 2026-06-30)**
- **날짜**: 2026-06-28 (Amendment 1: 2026-06-30)
- **이슈**: [#756](https://github.com/coseo12/astro-simulator/issues/756) / Amendment 1: [#773](https://github.com/coseo12/astro-simulator/issues/773) (광원 일관성 회귀, high) + [#775](https://github.com/coseo12/astro-simulator/issues/775) (지구 대륙 mix, low)
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
