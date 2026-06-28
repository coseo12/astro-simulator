# ADR 20260628-756 — 절차적 행성 표면 셰이더 (1차: 인프라 + 대표 4개)

- **상태**: Accepted (cross-validate 2026-06-28)
- **날짜**: 2026-06-28
- **이슈**: [#756](https://github.com/coseo12/astro-simulator/issues/756)
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
