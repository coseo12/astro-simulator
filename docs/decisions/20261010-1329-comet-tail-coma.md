# ADR 20261010-1329 — 혜성 꼬리 · 코마: 축 빌보드 리본 셰이더 · draw 직전 body mesh 기준계 · 로그 활동도 법칙

- **상태**: Provisional — cross-validate 결과 통합 전 (CLAUDE.md §ADR Status 워크플로). 사용자 결정 Q1~Q7 대기
- **날짜**: 2026-10-10
- **결정자**: architect (이슈 [#1329](https://github.com/coseo12/astro-simulator/issues/1329) · 사용자 선택 2026-10-10 「v0.96.0 다음 작업」)
- **관련**:
  - [ADR 20260612-r10b](20260612-r10b-comets-visualization.md) §비-범위 (꼬리·코마 ❌ — 본 ADR 이 그 이월분을 소화) · comet scale 그룹 5000
  - [ADR 20261008-1319](20261008-1319-asteroid-belt-gpu.md) 결정 2 (기준계 계약 — `recordBodyFrame` · `onBeforeRenderObservable`) · 결정 3 (소프트웨어 렌더 게이트) · 결정 6 (토글 2행 방식)
  - [ADR 20260907-1205](20260907-1205-frame-phase-vs-time-phase.md) (시간 위상 / 프레임 위상 분리)
  - [ADR 20260927-1265](20260927-1265-runtime-display-toggles.md) 결정 5 (URL ON=키 삭제 / OFF=`off`) · 결정 7 (토글 표 SSoT)
  - [ADR 20260613-675](20260613-675-glow-pixel-marker.md) (glow marker 4.5 px — 코마 화면 하한과의 계층)
  - [`principles.md`](../architecture/principles.md) §1 Visual Fidelity (§의무 체크리스트 4항목 — 아래 §Visual Fidelity)
- **용어**: [Tier](../glossary.md#tier-t1--t2--t3), Floating Origin, renderScale

> **forensic 변형 판정 — 일반 ADR.** 신규 기능 설계다. 5조건 중 (2) runtime 측정 필수만 해당.

---

## 배경

혜성 3개(`halley` · `encke` · `swift-tuttle`)는 점광원(glow marker 4.5 px) + 궤도선으로만 그려진다. R10b 가 꼬리·코마를 비-범위로 미뤘고, 사용자가 v0.96.0 다음 작업으로 골랐다. 설계 전에 화면 px · 기준계 · 렌더 비용을 실측했다.

### 실측 (2026-10-10, architect)

환경: 로컬 macOS · `next start` prod 빌드 (develop `8090f1eb`) · Playwright headless · 1280×800 DPR 1. 렌더러 축 3개 — `metal` (WebGPU) / `metal` + `navigator.gpu` 은닉 init script (**하드웨어 WebGL2** — `rendererKind='webgl2'`, `__isSoftwareRenderer=false` 확인) / `swiftshader` (WebGL2, 소프트웨어). 측정 스크립트는 일회성 (커밋 안 함, volt #67 패턴). 궤도는 장면과 같은 2체 Kepler (`positionAt` · `orbitMu`) 로 Node 에서 계산했다.

**1-A. 장면의 근일점 시각은 역사 시각과 다르다.** 2체 Kepler (J2000 요소, 섭동 없음) 라 어긋난다. 데모 시각은 **장면 근일점**을 써야 한다.

| 혜성 | q / Q (AU) | 장면 근일점 (1900~2100) | 실제 근일점 | 근일점 r |
| --- | --- | --- | --- | --- |
| halley | 0.586 / 35.08 | 1910-10-30 · **1986-02-18 (JD 2446479.5)** · 2061-06-09 | 1910-04-20 · 1986-02-09 · 2061-07-28 | 0.5860 |
| encke | 0.339 / 4.10 | 61회 (예: 2027-02-09 JD 2461445.5) | — | 0.3393 |
| swift-tuttle | 0.970 / 51.7 | 1992-12-13 (JD 2448969.5) | 1992-12-12 | 0.9704 |

**1-B. 꼬리 길이는 물리 크기 그대로도 solar 화면에서 보인다. 코마는 안 보인다.** 기본 카메라 (radius `35`, fov `0.8`, beta `1.257`) 에서 반태양 방향 길이 L 의 화면 길이:

| 시각 · 혜성 | 머리 화면 위치 | 0.01 AU | 0.1 AU | 0.3 AU | 1 AU |
| --- | --- | ---: | ---: | ---: | ---: |
| 1986-02-18 halley | (741, 517) 화면 안 | 2.4 px | 23.5 | 68.2 | 204.6 |
| 2061-06-09 halley | (743, 515) 화면 안 | 2.4 | 23.5 | 68.3 | 205.0 |
| 2027-02-09 encke | (528, 369) 화면 안 | 3.5 | 34.9 | 105.5 | 362.9 |
| 1992-12-13 swift-tuttle | (862, 484) 화면 안 | 2.1 | 20.3 | 59.1 | 178.0 |

관측 꼬리는 0.1 AU 차수 이상이다 (핼리 1910: 지구가 꼬리를 통과할 때 혜성–지구 ≈ 0.15 AU / 햐쿠타케 이온 꼬리 ≥ 3.8 AU — Ulysses 검출). 반면 가시 코마 반지름 10⁴~10⁵ km (≈ 7×10⁻⁴ AU) 는 같은 화면에서 **0.16 px** — 화면 고정 px 하한이 필요하다.

포커스 (`?focus=halley`, body tier, 카메라 radius `5977.7` scene unit ≈ 2.4×10⁵ km) 에서 핵 메시 (×5000 과장) 는 지름 ≈ 220 px (스크린샷). 같은 화면에서 0.001 AU 가 387 px 이고 꼬리는 소실점 (머리에서 ≈ 1593 px) 으로 수렴해 화면 끝까지 띠로 지난다.

**1-C. 기본 진입 화면 (J2000, `?speed=0`) 에 혜성은 없다 — 단 기본 재생 중 엥케가 들어온다.** J2000 에서 halley · swift-tuttle 는 카메라 뒤 (clip w < 0), encke 는 화면 오른쪽 밖 (x = 1600). encke r 은 `3.102` AU 이고 **안쪽으로 이동 중**이다 — +16 일에 3.0 AU 통과, +130 일 무렵 (r ≈ 2.0 AU) 화면에 들어와 +330 일 무렵 나간다 (+160 일 (1161, 171) · +240 일 (624, 241) · +260 일 (522, 467), 근일점 2000-09 중순).

**1-D. 태양 → 혜성 방향은 두 body mesh 의 `position` 차로 얻으며, draw 직전 값이 그 프레임에 그려진 위치와 일치한다.** POC 머티리얼의 `onBeforeRenderObservable` 에서 `halley.position − sun.position` 을 읽고, 같은 프레임 `onAfterRenderObservable` 에서 두 mesh 의 world 행렬 이동 성분과 대조했다 (metal):

| 단계 | 프레임 | 머리 오차 / 태양 거리 (최대) | 축 각도 오차 (최대) |
| --- | ---: | ---: | ---: |
| solar · 일시정지 | 179 | 1.2e-8 | 0° |
| 일시정지 중 halley 포커스 (tween + solar→body tier) | 492 | 1.2e-8 | 1.5e-6° |
| body tier 재생 (origin 매 프레임 이동) | 363 | 1.9e-11 | 2.3e-6° |
| 재생 중 earth 포커스 (body→inner) | 484 | 5.6e-8 | 1.7e-6° |
| 일시정지 | 183 | 2.5e-8 | 1.2e-6° |

오차는 float32 반올림 차수다. 두 mesh 의 `position` 은 같은 루프 두 곳 (`updateAt` mesh 루프 · `setTier` 즉시 재계산) 에서만 쓰이고 그 직후 `recordBodyFrame` 이 같은 `(origin, scale)` 을 기록한다 (`solar-system-scene.ts` — ADR 1319 결정 2). 물리 좌표 ↔ 장면 좌표는 축 교환이 없다 (halley 1986-02-18 물리 `(0.3300, −0.4549, 0.1661)` AU = 장면 위치 ÷ 12.566 와 4자리 일치).

**1-E. 렌더 비용 — 하드웨어 0, 소프트웨어는 화면을 덮을 때만.** POC = 혜성 1개당 메시 1 (코마 쿼드 1 + 이온 리본 32 분절 + 먼지 리본 32 분절 = 정점 136 · 삼각형 130) · GLSL `ShaderMaterial` · ALPHA_ADD · depth write off · 로그 depth. 같은 페이지에서 `setEnabled` on/off 3회 교차, 3 s rAF 계수 중앙값:

| 렌더러 | 기본 (J2000, 혜성 화면 밖) | 1986 근일점 solar (꼬리 ≈ 120 px) | 1986 근일점 포커스 (띠가 화면 절반) | 포커스 + 코마 화면 전체 |
| --- | --- | --- | --- | --- |
| metal WebGPU | 120.2 → 120.1 (0.999) | 120.0 → 120.1 (1.000) | 120.2 → 120.2 (1.000) | 120.1 → 120.2 (1.000) |
| metal WebGL2 (하드웨어) | — | 120.1 → 120.1 (1.000) | 120.2 → 120.2 (1.000) | — |
| swiftshader | 47.4 → 47.3 (0.997) | 47.3 → 46.5 (0.985) | 44.7 → **36.8 (0.823)** | 44.6 → **35.4 (0.793)** |

metal 은 120 Hz vsync 상한 안의 동률까지만 말한다. 소프트웨어 래스터의 하락은 정점이 아니라 **반투명 화면 면적 (fill-rate)** 에서 온다 — #745 별 배경과 같은 원인. 전 렌더러 셰이더 `isReady=true` · 콘솔 에러 0.

## 후보 비교

### 축 1 — 렌더 경로

| 후보 | 장면 기준계 정합 (1-D) | 시간 위상 의존 | 모든 시선 방향 | 화면 px 하한 | 비용 (1-E) | 비고 |
| --- | --- | --- | --- | --- | --- | --- |
| **(A) 축 빌보드 리본 + 코마 쿼드, GLSL `ShaderMaterial` — 꼭짓점을 world(view) 공간에서 펼침** | ✓ draw 직전 uniform | 없음 | 축 정면 시선에서 리본이 선으로 퇴화 → 코마가 덮음 + `sinθ` 페이드 | ✓ 깊이 × px 크기로 폭 하한 | 정점 136/혜성 · 하드웨어 0 | 카메라 뒤로 지나는 꼬리도 GPU 클리핑이 처리 (clip 공간 펼침은 w ≤ 0 에서 뒤집힘) |
| (A′) 같은 리본을 clip 공간에서 px 로 펼침 (belt 쿼드 방식) | ✓ | 없음 | 동일 | ✓ | 동일 | 포커스에서 꼬리가 카메라 뒤로 지나면 (1-B 원일점 포커스 tip w < 0 실측) 펼침이 뒤집힌다 — 기각 |
| (B) 원뿔/원통 메시 + 회전 | mesh 회전을 CPU 가 매 프레임 써야 함 (world 행렬은 draw 전 확정 → 1 프레임 지연 경로) | 없음 | ✓ | ✗ 세계 크기만 | 정점 수백 | 단면 경계가 딱딱해 체적 셰이딩 별도 필요 |
| (C) `ParticleSystem` / `GPUParticleSystem` | ✗ 입자가 world 에 방출돼 origin shift · tier 스케일 변경 시 남겨짐 (ADR 1319 1-C 결함과 같은 형태) | ✗ 프레임 시간 구동 — 일시정지에서도 흐름 (ADR 1205 위반) | ✓ | 엔진 의존 | 입자 수 × 반투명 면적 — 소프트웨어 최악 | 기각 |

### 축 2 — 꼬리 물리 근사

| 후보 | 이온 꼬리 | 먼지 꼬리 | 추가 입력 |
| --- | --- | --- | --- |
| (i) 이온만 | 반태양 직선 | — | 없음 |
| **(ii) 이온 + 먼지** | 반태양 직선 (태양풍 수차 수 도 무시) | 궤도면 안에서 운동 반대쪽으로 휜 곡선 (synchrone/syndyne 근사의 형태만) | 궤도면 법선 ĥ (혜성별 상수) |
| (iii) Finson-Probstein 입자 궤적 | — | 입자 크기별 β 궤적 적분 | 방출 이력 — 시간 위상 의존 · 과잉 |

### 축 3 — 소프트웨어 렌더

| 후보 | CI 픽셀 가드 영향 | 소프트웨어 사용자 비용 |
| --- | --- | --- |
| (i) 게이트 없음 | 기본 재생 중 엥케가 화면에 들어오는 가드가 있으면 변화 [추정 — 가드별 미전수] | 포커스 −18 ~ −21 % (1-E) |
| **(ii) 소프트웨어 렌더면 미생성** | 0 (ADR 1319 결정 3 · #745 와 같은 구조) | 0 |

## 결정

**결정 1 — 렌더 경로 (A).** 혜성 1개당 메시 1개 · `ShaderMaterial` 1개 (draw call +3). 정점 속성은 `(t 또는 u, side 또는 v, kind)` 하나 — kind 0 = 코마 쿼드, 1 = 이온 리본, 2 = 먼지 리본. 정점 셰이더가 중심선 `c(t) = head + axis·(t·L) + lag·(k·t²·L)` 과 접선을 해석적으로 계산하고, 폭 방향 `normalize(cross(tangent, c − cameraPosition))` 으로 **view 공간에서** 펼친다. 폭 = `max(세계 폭(t), MIN_WIDTH_PX × 깊이 × (2·tan(fov/2) / renderHeight))`. 코마는 같은 방식으로 카메라를 향한 쿼드, 반지름 = `max(세계 반지름, 화면 하한 px × 깊이 × 픽셀 크기)`. 블렌딩 ALPHA_ADD · `disableDepthWrite = true` · depth test on · 로그 depth 는 `LOG_DEPTH_FRAGMENT_WRITE_GLSL` SSoT · `backFaceCulling = false` · `alwaysSelectAsActiveMesh = true` · **`isPickable = false`** (클릭 선택 `body-picking` 에 끼지 않는다). 축 정면 시선의 퇴화 (`|cross| → 0`) 는 셰이더에서 NaN 없이 리본 알파를 `sinθ` 로 줄여 0 으로 보낸다 — 그 시선에서는 코마가 머리를 표현한다.

**결정 2 — 기준계 · 시간 위상 계약: 꼬리는 「그 혜성과 태양 mesh 가 이 draw 에 쓴 위치」 만 읽는다.** `mesh.onBeforeRenderObservable` (ADR 1319 머리말 — Babylon 9.19 `ShaderMaterial.bind` 가 `onBindObservable` 을 마지막에 알려 거기서의 `setX` 는 다음 draw 반영) 에서:

- `head = 혜성 host mesh.position` · `axis = normalize(head − 태양 mesh.position)`
- `scale = bodyFrame.scale` (ADR 1319 결정 2 의 `recordBodyFrame` 기록값 재사용 — 신규 기록 지점 0)
- `r [m] = |head − 태양 mesh.position| / scale` → 활동도 (결정 3) 입력
- `lag = −normalize(cross(ĥ, axis))` — ĥ 는 혜성 궤도면 단위 법선, 로드 시 1회 `orbitalStateAt` (`physics/state-vector.ts` — 기존 해석해) 의 `normalize(position × velocity)` 로 구한 **상수**. 역행 혜성 (halley i = 162.26°) 은 ĥ 의 z 가 음수 (실측 `(0.2596, −0.1596, −0.9524)`) 라 부호가 자동으로 맞다.

꼬리 상태는 위 두 위치 · 한 스케일 · 한 상수의 순수 함수다 — **시간 위상(`updateAt`) 에 아무것도 걸지 않는다.** 일시정지 · tier 전환 · 포커스 이동 · Floating Origin 이동이 모두 다음 draw 에 반영된다 (1-D 실측). `floatingOrigin.originOffset` 은 읽지 않는다 (가드 C 순서상 다음 프레임 값 — ADR 1319 결정 2 와 같은 함정). N-body 엔진 경로도 mesh 위치를 읽으므로 그대로 따른다 (ĥ 는 Kepler 상수 — 섭동에 의한 궤도면 변화는 무시).

**결정 3 — 활동도 법칙 (로그 정규화).** 혜성 광도 법칙 `m = M1 + 5 log Δ + 2.5 n log r` (JPL 총광도 형식, `K1 = 2.5 n`) 에서 태양 거리 r 에 따른 밝아짐 (등급) 은 `2.5 n log(r_on / r)` 이다. 이것을 **r = 1 AU 에서의 값으로 나눈** 활동도

```text
a(r) = max(0, ln(r_on / r) / ln(r_on / 1 AU))     r_on = COMET_ACTIVITY_ONSET_AU = 3
```

를 쓴다. `n` 이 약분되어 **혜성별 광도 파라미터가 필요 없다** (데이터 추가 0). `r_on = 3 AU` 는 물 얼음 승화가 활동을 지배하기 시작하는 거리의 통상값 (출처 1개를 구현 PR 주석에 박제), `1 AU` 는 광도 법칙 자체의 정규화 거리 (`M1` 이 r = 1 AU 기준) 라 새 기준이 아니다. 실측 근일점 활동도: encke `1.985` · halley `1.486` · swift-tuttle `1.028` · r = 2 AU `0.369` · r ≥ 3 AU `0`.

- 이온 꼬리 길이 `L_ion = COMET_ION_TAIL_LENGTH_1AU × a` (AU — 세계 길이, 줌에 따라 화면 길이가 변한다)
- 먼지 꼬리 길이 `L_dust = L_ion × COMET_DUST_TAIL_LENGTH_RATIO` · 휨 `k = COMET_DUST_TAIL_CURVE` · 폭은 이온의 2배
- 코마 세계 반지름 `COMET_COMA_RADIUS_1AU_KM × a` · 화면 하한 지름 `COMET_COMA_MIN_PX_1AU × min(a, 1)`
- 밝기 (알파 배율) `min(a, 1)` — 1 AU 안쪽은 밝기 포화, 길이만 자란다
- `a = 0` 이면 메시를 그리지 않는다 (`isVisible = false` — 셰이더 비용 0)

상수 값은 사용자 결정 Q2 · Q4 · Q5 와 D-T2 육안으로 확정한다 (§사용자 결정). 모두 rendering-only 상수 — `solar-system.json` 무변경.

**결정 4 — 소프트웨어 렌더 게이트 (ii).** web 이 `detectSoftwareRenderer` 결과로 core 옵션 `cometTails: boolean` 을 넘긴다 (core 는 렌더러를 모른다 — ADR 1265 결정 1 · ADR 1319 이견 수용 5). 강제 생성 파라미터는 두지 않는다 — WebGL2 셰이더 경로 검증은 하드웨어 Chrome 에서 `navigator.gpu` 를 은닉하는 init script 로 가능함을 실측했다 (1-E 의 「metal WebGL2」 행).

**결정 5 — 토글 · URL.** 토글 표(`display-toggles.ts`) 에 1행 — `cometTails` (라벨 「혜성 꼬리」, URL `?comettails=off`, ON = 키 삭제 — ADR 1265 결정 5). 꼬리 · 코마를 함께 끈다 (핵 · glow marker · 궤도선은 그대로). 파서는 순수 함수 `parseCometTailsVisible` 하나 (`apps/web/src/core/parse-comet-tails-mode.ts` — #850 계약). 가용성 = `!isSoftwareRenderer`, 비활성 사유는 별 배경 · 띠와 같은 표현. 처음 켤 때 지연 생성, 이후 `setEnabled` (ADR 1319 결정 6 과 같은 수명주기). 장면 dispose 시 메시 · 머티리얼 해제.

**결정 6 — 기본 진입 화면은 불변, 기본 재생 화면은 바뀐다.** J2000 첫 프레임에는 혜성이 화면에 없고 encke 활동도도 0 (r 3.102 > 3) 이라 꼬리가 없다 — 단 이 단정은 **on/off 같은 프레임 대조**로만 확정한다 (#1319 B1 교훈). 기본 재생에서는 +130 일 무렵부터 encke 꼬리가 화면에 들어온다 (1-C). 이것을 기능 노출로 받아들일지는 사용자 결정 Q6.

## 결과·재검토 조건

- **기대 효과** — 근일점 접근 시 코마가 밝아지고 꼬리가 반태양 방향으로 자란다. 하드웨어 프레임 비용 0 (1-E). 기준계 · 시간 위상 결함 클래스 (ADR 1319 1-C (가)(나) · ADR 1205) 를 구조로 피한다 (결정 2).
- **받아들인 비용** — GLSL 셰이더 1종 추가 (WebGPU 는 Babylon GLSL→WGSL 변환 의존). 소프트웨어 렌더 사용자에게는 꼬리가 없다. 이온 꼬리 수차 · 먼지 입자 크기 분포 · 핵 크기별 밝기 차는 표현하지 않는다 (Visual Fidelity — rendering 근사). 투명 정렬: 메시가 원점 근처 bounding 이라 반투명 정렬 거리가 실제와 다르다 — ALPHA_ADD 끼리는 순서 무관이고 ALPHA_COMBINE (구름 · 고리) 과 화면에서 겹칠 때만 순서 차가 생긴다 [추정 — 미실측].
- **재검토 트리거**
  1. 하드웨어 A/B (`bench:scene` · 기본 vs `?comettails=off`) 에서 어느 셀이든 −10 % 초과 하락 → 결정 1 재검토 (ADR 1319 결정 8 과 같은 문턱).
  2. 사용자 육안에서 축 정면 시선 퇴화 · 카메라 근접 시 화면 전체 덮임이 거슬린다는 보고 → 깊이 페이드 · 리본 개수 (교차 리본 2장) 재검토.
  3. 소프트웨어 렌더가 CI 외 사용자 환경에서 유의미하게 관측되면 → 결정 4 재검토 (ADR 1319 재검토 트리거 4 와 같은 축).
  4. 혜성이 추가되어 q < 0.1 AU (sungrazer) 가 생기면 → `a(r)` 의 상한 클램프 도입 (현 데이터 최대 1.985).
  5. 사용자가 혜성 간 밝기 차 (핵 크기 · 고갈) 를 요구 → `M1` 을 데이터 SSoT 로 들이는 별도 결정.

## 사용자 결정 (대기)

이슈 [#1329](https://github.com/coseo12/astro-simulator/issues/1329) 설계안 코멘트의 Q1~Q7. 결정 후 본 절을 확정 표로 바꾼다.

## Visual Fidelity — §의무 체크리스트 (principles.md §1)

- [x] **데이터 SSoT 보존** — 꼬리 · 코마 상수는 전부 `packages/core/src/scene/` 의 rendering-only 상수. `solar-system.json` 변경 0 (결정 3 이 혜성별 광도 파라미터를 요구하지 않도록 고른 이유).
- [x] **rendering 시점 분리** — 물리 엔진은 꼬리 상수를 모른다. 꼬리는 렌더 직전에 mesh 위치에서 파생한다 (결정 2).
- [x] **사용자 D-T2 가이드** — 정보 카드의 태양 거리 (#1281) 는 실측값 그대로다. 꼬리 길이는 「표시 근사」 이며 길이 배율이 과장일 경우 (Q2) 그 사실을 PR · CHANGELOG 에 적는다. 정보 카드 문구 추가는 범위 밖.
- [x] **점유율 baseline** — §1-B 표 (기본 카메라 · 근일점 3종의 화면 px/AU) 가 baseline 이다.

## 교차검증 반영 사항

메인 오케스트레이터가 cross-validate 를 수행한 뒤 4축 (합의 / 이견 수용 / 기각 / 고유 발견) 으로 통합한다. 그 전까지 본 ADR 은 Provisional 이다.

### 호출 전 Claude 편향 셀프 체크 (architect)

- **낙관적 일정** — PR 2개 (렌더 · 토글). 셰이더는 POC 가 양 백엔드에서 돌았으나 퇴화 시선 · 카메라 근접 처리는 POC 에 없다 → 질문 대상.
- **결합 간과** — 결합 3개를 명시했다: (a) 기본 재생 ↔ encke 진입 (결정 6), (b) 반투명 정렬 ↔ 구름 계열 정렬 함수 (받아들인 비용), (c) 소프트웨어 게이트 ↔ CI 미검증 (결정 4).
- **폐기 프레이밍** — 기존 경로를 폐기하지 않는다 (신규 추가).
- **순수주의** — 먼지 꼬리를 입자 궤적 (축 2 (iii)) 대신 형태 근사로 둔 것, `n` 약분으로 혜성별 광도 차를 버린 것이 단순화다 → 질문 대상.

## 참고

- `packages/core/src/scene/belt-particles.ts` (ShaderMaterial · `onBeforeRenderObservable` · 로그 depth 선례)
- `packages/core/src/scene/solar-system-scene.ts` (`recordBodyFrame` · `updateAt` mesh 루프 · `setTier` 즉시 재계산 · 구름 계열 투명 정렬 `setRenderingOrder`)
- `packages/core/src/physics/state-vector.ts` (`orbitalStateAt` — ĥ 산출)
- `packages/core/src/scene/glow-marker.ts` (`GLOW_MARKER_TARGET_PX_PARENT = 4.5`)
- `apps/web/src/core/display-toggles.ts` (토글 표 SSoT)
