# ADR 20261030-1419 — 지구 밖 천체 표면 확장: 위성 · 암석 행성 표면 타입과 body 별 파라미터 카탈로그

- **상태**: Provisional — 사용자 결정 Q1~Q6 대기 · cross-validate 대기 (메인 수행)
- **날짜**: 2026-10-30
- **결정자**: architect (이슈 [#1419](https://github.com/coseo12/astro-simulator/issues/1419) · 사용자 선택 2026-10-30)
- **관련**:
  - [ADR 20260628-756](20260628-756-procedural-planet-surface.md) §결정 2 (표면 타입 소스 = 코드 상수 테이블 · 단일 셰이더 if-else) · §결과·재검토 조건 3 (표면 타입 확장) · §교차검증 고유 발견 2 (8종 초과 시 타입별 셰이더 인스턴스 전환) · §A1.8 재검토 조건 4 (다른 rocky body) · §A8.9 결정 5 (소비자 없는 파라미터 금지) · Amendment 12 (#1274 — `IceGiant` · 밴드 테이블 · albedo 테이블 · §A12.16 조건 4 · 5)
  - [로드맵 `roadmap-track-ab.md`](../phases/roadmap-track-ab.md) §후보 첫 행 · 2026-10-02 부기 (Rocky 재분류 시 무조건 상속 효과)
  - [`principles.md`](../architecture/principles.md) §1 Visual Fidelity
  - 시안 · 수치: [`docs/reports/1419-body-surfaces/design-candidates/`](../reports/1419-body-surfaces/design-candidates/README.md)
- **용어**: [Tier](../glossary.md#tier-t1--t2--t3), LOD (high/mid/low variant)

> **forensic 변형 판정 — 일반 ADR.** 신규 기능 설계다. 5조건 중 (2) runtime 측정 필수 · (4) 옵션 비교만 해당.
>
> 라벨: 「실측」 = 실행 출력 · 「구조」 = 코드 경로 판독 · 「추론」 = 실행되지 않은 예측. 실행되지 않은 것은 §미확인 에 모았다. 줄 번호와 코드 상태는 develop `cf8b2316` 기준이다.

---

## 0. 형식 — 신규 ADR (ADR 756 Amendment 14 기각)

- **근거 1 — ADR 756 이 이 분리를 스스로 예고했다.** §A12.16 조건 5: 「본 ADR 에 Amendment 13 이 필요해짐 — 표면 타입 카탈로그 (타입 · body · 파라미터 테이블의 결정) 를 별도 ADR 로 분리할지 판정」. Amendment 13 (#1362) 은 지구 자전축 정정이라 카탈로그와 무관했고 이 판정을 하지 않았다 [구조 — §A13 본문에 조건 5 언급 0]. 이번이 카탈로그를 바꾸는 첫 변경이다.
- **근거 2 — 크기.** ADR 756 은 `3701` 행이다 [실측 — `wc -l`, `cf8b2316`]. Amendment 12 결정 0 이 이미 비용으로 기록한 축이다 (당시 `3112` 행).
- **근거 3 — 결정 단위.** 이번 결정은 「어느 body 가 어느 타입 · 어느 파라미터를 받는가」 의 카탈로그다. 셰이더 인프라 (모듈 · LOD · 광원 · log-depth) 결정은 ADR 756 에 남는다.
- **대가 (수용)**: ADR 756 의 SSoT (`SURFACE_TYPE_BY_BODY` · §결정 2) 를 이 문서가 인용한다. 문서 경계를 넘는 ⏩ 포인터를 ADR 756 의 해당 절에 dated 부기로만 더한다 (원문 소급 수정 `0`).

---

## 1. 배경 — 현행 표면 상태표 [실측]

`SURFACE_TYPE_BY_BODY` 등록 = 6 body (earth Rocky · mars Desert · jupiter GasBands · moon Cratered · uranus · neptune IceGiant). 나머지는 `body-mesh-factory.ts` 가 `StandardMaterial` 단색 (`colorHint.hex` → `diffuseColor`) 으로 그린다 [구조 — `createBodyMesh` · `createBodyMeshMid`].

| 구분 | body | 현행 | 노출 경로 | 포커스 1280 disk 반경 [실측] |
| --- | --- | --- | --- | ---: |
| 절차 표면 | earth · mars · jupiter · moon · uranus · neptune | `ShaderMaterial` | — | moon `22.2 px` |
| 상단 바 「천체 ▾」 메뉴 (단색) | mercury · venus · saturn · pluto | `StandardMaterial` | 메뉴 12개 중 4개 (`body-menu.tsx` `BODY_MENU_ITEMS`) | mercury `98.3` · venus `94.1` · saturn `73.2` · pluto `98.3` |
| 검색 · URL 전용 (단색) | io · europa · ganymede · callisto · titan · enceladus · charon · triton 외 | `StandardMaterial` | 검색 (`/`) · `?focus=` | 위성 전부 `24.6 px` (궤도 맥락 프레이밍) |

- 교육 투어 포커스 빈도 [실측 — `apps/web/src/lib/tours/*.ts` `focus:` 집계]: earth `14` · jupiter `1` · mars `1` · moon `1` · saturn `1` · sun `1`. 위성은 moon 뿐이다.
- 기본 화면 LOD [실측, swiftshader]: `/?gpu=a&lod=auto` 에서 saturn `mid` · jupiter `mid` · mercury · moon · 갈릴레이 4종 `low`. `focus=jupiter` 에서 갈릴레이 4종 전부 `mid` — **목성 포커스 화면에서 갈릴레이 위성이 표면 셰이더를 받는다.**
- **saturn 은 단색이다.** 메뉴 · 투어 · 기본 화면 (`mid`) 에 모두 나오는데 표면이 없다.

### 1-A. 현행 광원식이 만드는 포화 [실측]

절차 표면 광원은 `smoothstep(0, 0.12, ndl)` 이라 `ndl ≥ 0.12` 인 낮면 전체가 최대 세기를 받는다 (ADR 756 §A12.20.3). 단색 경로는 Lambert 그라데이션이다. 그래서 같은 `colorHint` 로 절차 표면에 등록하면 낮면이 평평하게 포화한다 — #1274 의 uranus R5 와 같은 기전.

태양측 근접 시점 · disk `0.95R` 표본 3채널 포화율 (실 Chrome · WebGPU):

| body | 단색 (현행) | 절차 표면 albedo `1` |
| --- | ---: | ---: |
| saturn | `16.49%` | `72.24%` |
| ganymede | `1.85%` | `40.73%` |
| moon (현행 Cratered) | `44.33%` | `95.01 ~ 95.03%` |

⇒ **albedo 축 없이 등록하면 패턴이 흰 원반에 묻힌다.** 그리고 **현행 달도 이미 그렇다** (§9 Q5).

### 1-B. 셰이더 상수의 전 body 바인딩 [구조]

`craterDepth` · `craterDensity` 는 body 분기 없이 **전 표면 body 에 달 상수로** 바인딩되고 (`procedural-planet-shader.ts:1578-1579`), 크레이터 결 진폭 `0.15` 는 GLSL 리터럴이다 (`:1233`). #1274 PR1 이전의 밴드 uniform 과 같은 구조다 (§A12.4 「jupiter 상수를 모든 body 가 상속하는 형태」).

---

## 2. 외관 근거 (1차 자료)

데이터 SSoT 는 `colorHint.hex` 그대로다. 아래는 패턴 · 보조색 · albedo 설계의 근거다.

| body | 기하 알베도 | 외관 (출처 요약) | 표현 |
| --- | ---: | --- | --- |
| io | `0.62` | 태양계에서 가장 화산 활동이 큰 천체, 수백 개 화산 · 용암 호수, 분출물이 충돌 크레이터보다 빨리 표면을 덮음. Juno 사진 설명: 녹슨 색 바탕 · 옅은 황갈 영역 · 짙은 주황 반점 · 회갈색 함몰 | 황 패치 + 칼데라 점 · 후광 (신규 Volcanic) |
| europa | `0.68` | 얼음 표면 · 적갈색 선과 반점 | 대원 계열 lineae + 얼룩 (신규 Icy) |
| ganymede | `0.44` | 오래되고 크레이터 많은 어두운 지역 + 젊고 지각 변형된 밝은 지역, 밝은 점은 최근 충돌 크레이터 | Cratered + 저주파 2톤 지역 + 밝은 크레이터 |
| callisto | `0.19` | 태양계에서 크레이터가 가장 많은 천체, 「어두운 표면 위 밝은 흉터」 | Cratered 고밀도 + 밝은 크레이터 (깊이 음수) |
| mercury | `0.142` | 달과 비슷한 회갈색, 크레이터 다수, 밝은 광조 (우주 풍화로 어두워짐) | Cratered (달 유사) |
| saturn | — | 저대비 위도 밴드 (목성보다 옅음) | IceGiant 분기 재사용 |
| venus | `0.689` | 가시광에서 구름층으로 무늬 없음 | **제외** — 패턴을 넣으면 사실 왜곡 |
| titan | `0.22` | 주황 연무, 가시광 무늬 없음 | **제외** — 같은 이유 |
| pluto | `0.52` | 붉은 색 · 밝은 하트 모양 영역 (New Horizons) · 적도의 짙은 적색 지대 (Cthulhu) | **제외** — 대표 특징이 고유 지형이라 절차 노이즈로 재현 불가 (지구 마스크 같은 에셋 예외가 선행) |
| charon | `0.42` | 대부분 회색, 북극에 붉은 영역 | **제외 (후속)** — 극관 색조 축이 별도로 필요, 노출 낮음 |
| enceladus | `1.0` | 백색 얼음 | **제외** — 반경 252 km · disk `24.6 px` |

출처:
- 기하 알베도 — NASA NSSDC Planetary Fact Sheets: [Jovian satellites](https://nssdc.gsfc.nasa.gov/planetary/factsheet/joviansatfact.html) (visual geometric albedo) · [Saturnian satellites](https://nssdc.gsfc.nasa.gov/planetary/factsheet/saturniansatfact.html) · [Pluto/Charon](https://nssdc.gsfc.nasa.gov/planetary/factsheet/plutofact.html) · [Mercury](https://nssdc.gsfc.nasa.gov/planetary/factsheet/mercuryfact.html) · [Venus](https://nssdc.gsfc.nasa.gov/planetary/factsheet/venusfact.html) · [Moon](https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html) (`0.12`)
- 외관 — NASA Science: [Io](https://science.nasa.gov/jupiter/jupiter-moons/io/) · [Europa](https://science.nasa.gov/jupiter/jupiter-moons/europa/) · [Ganymede](https://science.nasa.gov/jupiter/jupiter-moons/ganymede/) · [Callisto](https://science.nasa.gov/jupiter/jupiter-moons/callisto/) · [Mercury facts](https://science.nasa.gov/mercury/facts/) · [Pluto](https://science.nasa.gov/dwarf-planets/pluto/) · [Charon](https://science.nasa.gov/dwarf-planets/pluto/moons/charon/)
- Pluto 적도 적색 지대 (Cthulhu) 의 원인은 미확정이다 — 톨린 가설을 실험실 톨린이 재현하지 못했다는 보고가 있다 ([NASA NTRS 20250006648](https://ntrs.nasa.gov/citations/20250006648) · [Smithsonian](https://www.smithsonianmag.com/smart-news/plutos-red-patches-are-mystifying-scientists-180978057/)). 제외 판단에 영향은 없다.

⚠️ **렌더 albedo 배율은 물리 알베도가 아니다.** `colorHint` 가 이미 관측 색 (밝기 포함) 을 담고 있어서, 기하 알베도로 밝기를 다시 정하면 밝기 출처가 둘이 된다 (§4 Q4 기각 R3).

---

## 3. 실측 — POC (scratch worktree, 커밋 0)

환경: 로컬 macOS · scratch worktree (develop `cf8b2316`) · `next dev :3000` · `@astro-simulator/shared` · `core` dist 재빌드. POC 는 `procedural-planet-shader.ts` 에 `+102 / −6` (후보 표 · URL 플래그 포함) 과 `browser-verify-756-surface.mjs` 에 `+7 / −1` 이다. 커밋하지 않았다.

POC 내용: enum `Volcanic = 5` · `Icy = 6` 추가 · `SURFACE_TYPE_BY_BODY` 6행 추가 (saturn = IceGiant) · Cratered 분기를 `col = baseColor * surfAlbedo * (1 + terrain + region) * (1 − crater * craterDepth)` 로 파라미터화 (`terrain` 진폭 · `region` = `valueNoise` 저주파 2톤) · 분기 5 · 6 신설 · uniform 7개 추가 (`crTerrainAmp` · `crRegionAmp` · `crRegionFreq` · `surfAlbedo` · `accentA` · `accentB` · `patParams`).

| # | 측정 | 결과 |
| --- | --- | --- |
| M1 | `verify:1274-invariance` — base (develop) ↔ POC, 12 시나리오 (기존 6 body × on/off), swiftshader | **12 / 12 diff `0`**, exit `0`. 서빙 지문 base `061a3388…` ≠ POC `f13b5cbb…` (다른 빌드를 서빙했음) |
| M2 | `verify:756` 에 대상 6 body 추가 (POC 안 1 · 안 2 빌드), swiftshader | 전건 PASS. 신규 body 갭 최소 = saturn 안 1 `0.949` (임계 `0.15`). 기존 6 body 갭 무변화 범위 (§README) |
| M3 | 실 Chrome (`channel:chrome`, headed, WebGPU) 28 page load (4 열 × 7 body) | 콘솔 에러 **`0`** |
| M4 | GLSL 지역 변수명 `patch` | **컴파일 실패** (`GLSL compilation failed` 2건, WebGPU). `patch` 는 GLSL 예약어다. 이름 변경 후 `0` |
| M5 | Icy 분기의 `for` 12회 + uniform 비교 `break` | WebGPU (M3) · swiftshader WebGL2 (M2) 모두 컴파일 · 렌더 |
| M6 | 태양측 근접 수치 (3채널 포화 · 평균 휘도) | §README 「lit 수치」 표 |

- M1 의 의미 [구조 + 실측]: Cratered 분기에 `region` (`0` 바인딩) · `surfAlbedo` (`1` 바인딩) 를 넣고 달 행을 기존 상수로 두면 달 픽셀이 바뀌지 않는다. 신규 분기와 신규 uniform 이 다른 body 의 draw 에 새지 않는다.
- 하네스 무변경 [구조]: `verify:1274-invariance` 의 `BODIES` 는 기존 6 body 이고, 신규 body 는 그 집합 밖이라 base 쪽 「미등록 선언」 (`EXPECT_UNREGISTERED`) 이 필요 없다. M1 이 이 구성으로 실행됐다.

---

## 4. 후보 비교 · 권고

### Q1 — 1차 대상

| 안 | body | 근거 | 비고 |
| --- | --- | --- | --- |
| **A (권고)** | mercury · callisto · ganymede · io · europa · saturn (6) | 메뉴 노출 2 (mercury · saturn) + 목성 포커스에서 `mid` 로 함께 보이는 갈릴레이 4. 개선 폭: 단색 → 각자 다른 표면 (§README 시트) | 로드맵 Cratered 후보 (ADR 756 §A12.9: mercury · callisto · rhea · titania · oberon · ceres) 중 2 포함 |
| B | mercury · callisto · ganymede (3) | 신규 타입 `0` — Cratered 파라미터화만 | io · europa 는 크레이터로 표현 불가. saturn 미포함 |
| C | A + pluto · charon | 명왕성 메뉴 노출 | pluto 하트는 절차 재현 불가 → 저충실 표면이 사실 왜곡이 된다. 에셋 예외 (ADR 756 Amendment 4 동형) 를 별건 결정으로 선행 |

제외: venus · titan (가시광 무늬 없음 — 패턴이 왜곡), enceladus (disk `24.6 px`, 단색 백색이 이미 사실에 가깝다), triton (`verify:756` · `verify:773` 의 단색 대조군 — 유지해야 대조군이 남는다).

### Q2 — 방식 (셰이더 분기 비용 · 8종 임계)

⚠️ **인용 정정**: 「8종 초과 시 타입별 셰이더 인스턴스 전환」 은 ADR 756 **§재검토 조건 2 가 아니다** (조건 2 는 gas-bands 자전축 기울기다). 출처는 §교차검증 반영 사항 **고유 발견 2** (agy 제안, 조건 3 에 흡수) 이고, 측정 근거가 없는 미래 조건부 제안이다.

| 축 | (a) 기존 타입 파라미터화만 | (b) 대상마다 신규 타입 | **(c) 혼합 (권고)** |
| --- | --- | --- | --- |
| 타입 수 (현행 5) | 5 | 5 + 6 = 11 (임계 초과) | **7** (Volcanic · Icy) |
| io · europa 표현 | 불가 (크레이터뿐) | 가능 | 가능 |
| fragment 비용 [구조] | 대상 draw 만 분기 3 진입 | 대상 draw 만 자기 분기 | 대상 draw 만 자기 분기. 분기는 draw 단위 균일 (ADR 756 §결정 2) |
| 기존 body 픽셀 | M1 동형 | — | **M1 실측 diff `0`** |

- 구성: mercury · callisto · ganymede → **Cratered + body 별 크레이터 파라미터 테이블**. io → **Volcanic (5)**. europa → **Icy (6)**. saturn → Q3.
- 분기 비용의 상한은 「컴파일 1회 · draw 당 1분기」 그대로다 — 타입 수가 늘면 셰이더 문자열과 컴파일 시간이 는다. 8종 임계를 넘는 안 (b) 는 측정 근거 없이 그 경계를 넘으므로 기각한다.

### Q3 — saturn 경로

| 안 | 변경 | 비용 | 위험 |
| --- | --- | --- | --- |
| **(i) IceGiant 분기 재사용 (권고)** | 타입 1줄 + 밴드 행 + albedo 행 = 3행 | 셰이더 `0` 행. ADR 756 §A12.16 조건 4 가 예고한 「행 1개 + 타입 테이블 1줄」 형태와 같다 | 이름 불일치 (`IceGiant` 에 토성) → enum JSDoc 을 「저대비 위도 밴드 + albedo 배율 (천왕성 · 해왕성 · 토성)」 로 고친다 |
| (ii) GasBands + albedo 축 | 분기 2 에 albedo 곱 + 해석 함수 | jupiter 분기 접촉 (jupiter `1` 바인딩, M1 하네스로 diff `0` 실증 필요) | 목성 분기 격리 (§A12.5 결정 2 의 이유) 를 깬다 |
| (iii) 제외 | — | — | 노출이 가장 큰 단색 body 가 남는다 |

### Q4 — 시안 · albedo 규칙

- **안 1 (b) 권고 — 절제.** 안 2 (c) 는 패턴 진폭 · 밀도를 키운 열이다. body 마다 안 1 / 안 2 를 따로 골라도 된다.
- albedo 규칙 = `min(R1, R2)`:
  - **R1 낮면 비포화** — `DEFAULT_PLANET_LIGHTING` 낮면 계수 × `colorHint` 의 채널 최댓값 역수.
  - **R2 단색 평균 휘도 이하** — 태양측 근접 시점 평균 휘도가 단색 경로보다 밝지 않게.
  - 결과 [실측, 안 1]: 3채널 포화 전부 `≤ 0.01%` (단색 saturn `16.49%` → `0.00%`). callisto 평균 휘도 `160.9` (단색 `159.2`) — R1 만 쓰면 `206.4` (albedo `0.89`) 로 단색보다 밝아졌다. ⇒ R2 가 callisto 에서 결정적이다.
- 기각 **R3 (실제 기하 알베도 순서 보존)**: 안 1 의 렌더 평균 휘도 순서 (ganymede `207` > europa `189`) 는 실제 순서 (europa `0.68` > ganymede `0.44`) 와 다르다. 그러나 밝기의 데이터 출처는 `colorHint` 이고, 알베도로 다시 정하면 출처가 둘이 된다. 순서가 문제라면 `colorHint` (데이터) 를 고치는 별건이다.
- albedo `1` 열 (a) 은 채택 후보가 아니라 「albedo 축이 왜 필요한가」 를 보이는 참고다.

### Q5 — 달의 기존 포화 (범위 밖 발견)

현행 달 (Cratered) 은 태양측 근접에서 3채널 포화 `95%` — 크레이터가 낮면에서 보이지 않는다 [실측]. albedo 규칙을 달에 적용하면 해소되지만 달 픽셀이 바뀐다 (이슈 DoD 「기존 4종 픽셀 불변」 위반 · `verify:756` 달 갭 · #1360 식 그림자 가드 재측정 필요).

- **권고: 이번 범위 밖.** CLAUDE.md 「검증 강도 게이트」 의 기본 처분 (PR 코멘트 기록) 에 따라 이 ADR 과 PR 코멘트에 기록만 한다. 사용자가 원하면 별건 이슈로 연다.

### Q6 — PR 분할

| 안 | 구성 | 근거 |
| --- | --- | --- |
| **1 PR (권고)** | 테이블 이관 + body 등록 + 신규 분기 + 가드 목록 갱신 | M1 이 「신규 body 등록 + 기존 6 body diff `0`」 을 **한 번에** 실증했다. 수치는 이 설계의 시안 승인으로 확정되므로 #1274 의 「프리뷰 → 승인 → 확정」 2라운드가 필요 없다. 사용자 방침 (기능 우선 · 검증 경량) |
| 2 PR | PR1 크레이터 파라미터 테이블 이관 (시각 변화 `0`) → PR2 등록 · 신규 분기 | #1274 선례. 리뷰 단위가 작다. 대신 라운드가 하나 는다 |

---

## 5. 결정 (Provisional — Q1~Q6 권고안 기준)

1. **대상** — mercury · callisto · ganymede (Cratered) · io (Volcanic) · europa (Icy) · saturn (IceGiant 재사용).
2. **타입** — `SurfaceType.Volcanic = 5` · `SurfaceType.Icy = 6` 추가, if-else 분기 2개. 타입 수 `7`.
3. **파라미터 테이블** — 소비 타입 body 만 행을 가진다 (ADR 756 §A8.9 결정 5 · `SURFACE_MASK_BY_BODY` · `SURFACE_BAND_PARAMS_BY_BODY` 선례):
   - `SURFACE_CRATER_PARAMS_BY_BODY` — `{ density, depth, terrainAmp, regionAmp, regionFreq, albedo }`. 키 = `{ id | type == Cratered }` (moon · mercury · callisto · ganymede). **moon 행은 기존 상수를 참조** (`CRATER_DENSITY` · `CRATER_DEPTH` · 리터럴 `0.15` 를 상수로 추출 · `regionAmp 0` · `albedo 1`) — 값 사본 금지 (volt #69).
   - `SURFACE_PATTERN_PARAMS_BY_BODY` — `{ accentA, accentB, params: [4], albedo }`. 키 = `{ id | type ∈ { Volcanic, Icy } }`.
   - saturn — 기존 `SURFACE_BAND_PARAMS_BY_BODY` · `ICE_GIANT_ALBEDO_BY_BODY` 에 행 추가.
   - 해석 함수 — 행 누락 · 초과 시 **throw** (기본값 fallback 금지, §A12.4 계약 5 동형). 비소비 타입은 중립값을 바인딩 (크레이터 = 달 값, albedo = `1`, 패턴 = `0`).
4. **uniform** — `55 → 62` (+7, POC 실측 구성). 이름은 dev 가 정하되 4중 SSoT (상수 → uniforms 배열 → 바인딩 → GLSL 선언) 를 함께 맞춘다.
5. **albedo** — Q4 규칙 `min(R1, R2)` 의 값 (README 표). 광원식은 바꾸지 않는다.
6. **수치** — 사용자가 고른 열 (안 1 / 안 2, body 별) 의 README 값을 그대로 박는다. 단위 테스트가 박제값을 단언한다.
7. **데이터** — `solar-system.json` 변경 `0`.

---

## 6. 불변성 · 비용 · 가드 영향

| 축 | 수단 | 근거 |
| --- | --- | --- |
| 기존 6 body 픽셀 불변 | `verify:1274-invariance` base ↔ feature, 12 시나리오 `EXPECT_ZERO` 전건 | M1 — 하네스 무변경으로 실행됨 |
| 대상 밖 body 불변 | 테이블 opt-in (미등록 = `StandardMaterial`) + `solar-system-scene-display-toggles.test.ts` NullEngine fixture (등록 ⇔ 절차 머티리얼, 참 · 거짓 각 `≥ 1`) | 구조 — 기존 테스트가 테이블을 따라간다 |
| 신규 body 표면 존재 | `verify:756` `SURFACE_BODIES` +6, `HF_ENTROPY_MARGIN 0.15` 무변경 | M2 — 최소 갭 `0.949` |
| 단색 대조군 | `verify:756` `PLAIN_BODIES` 에서 saturn 제거 → `[venus, triton]` / `verify:773` 에서 mercury · saturn 제거 → `[venus, triton]`. 두 스크립트의 `length ≥ 1` fail-fast 유지 | 구조 — 둘 다 판정이 아니라 로그 |
| shader-pixel-guard baseline | 대상 body 를 재는 `verify:756` · `verify:773` 은 body 별 ON vs OFF 상대 성질로 판정한다 (워크플로 헤더 「판정 규약」 — 절대 임계 금지) | 구조 — 대상 목록 갱신 외에 바꿀 baseline 파일이 없다 |
| fps | 기존 `fps-baseline-guard` CI. `/?gpu=a&lod=auto` 화면에서 대상 중 `mid` 이상은 saturn 하나 (§1 LOD 실측) | 추론 — 머티리얼만 바뀌고 draw 수 · 기하 불변 |
| 달 fragment 비용 | Cratered 분기에 `valueNoise` 1회 추가 (지역 2톤, 달은 진폭 `0` 이라 픽셀 불변) | 구조 + M1 |

- **신규 가드 없음.** 기존 가드의 대상 목록 확장과 단위 테스트만 한다.
- 주석 영향 (넓은 grep — 「표면 타입 N종」 · 「4 body」 · 「23개」 · 「등록 집합」 · 「uranus · neptune」 등을 `packages` · `apps` · 스크립트 · 워크플로에서 찾고 표면과 무관한 행 (궤도 · billboard · allowlist 계수) 을 뺀 것) [실측]:
  - `procedural-planet-shader.ts:98` 「표면 타입 4종」 · `:171` 「23개 비-범위 body」 · `:174` 등록 집합 열거 · `:1576` 「4 body diff 0」 (PR #1278 기록 — 과거 사실이라 유지 가능)
  - `procedural-planet-shader.test.ts:7` 「대표 4개 등록」 · `:130-133` 등록 집합 정확 단언 (교체 대상) · `:152` 「venus/saturn/io 등 23개」
  - `SurfaceType.IceGiant` JSDoc (`:159-162`) — saturn 추가 시 의미 갱신
  - `browser-verify-1274-surface-invariance.mjs:102-104` — BODIES 설명 (무변경이면 유지)
  - `browser-verify-773-light.mjs` 의 「4 body」 서술은 그 가드의 `SURFACE_BODIES` (4개) 를 가리킨다 — 773 대상을 늘리지 않으면 유지

---

## 7. Concrete Prediction (구현 후 `git diff --numstat` 재현)

| 영역 | 예측 | 근거 |
| --- | --- | --- |
| `procedural-planet-shader.ts` | `+130 ~ +230` | 추론 — POC `+102 / −6` 에서 후보 표 · URL 플래그 (약 45행) 를 빼고, 테이블 2종 · 해석 함수 2종 · 주석을 더한다. #1274 PR2 실측 `+111 / −7` (테이블 1종 + 분기 1개) |
| 단위 테스트 | `+150 ~ +350` | 추론 — #1274 PR2 실측 `+343 / −29` (4 파일) |
| `browser-verify-756` · `-773` | `+8 ~ +30` | POC 실측 `+7 / −1` (756) + 773 PLAIN 1행 |
| `browser-verify-1274-surface-invariance.mjs` | **`0`** | M1 이 무변경으로 실행됨 |
| `solar-system.json` | **`0`** | 결정 7 |
| `float fbm(` 정의 사본 | **`4`** (무변경) | POC 는 기존 `fbm` · `valueNoise` · `hash33` 만 호출 |
| uniform 배열 항목 | `62` | POC 실측 +7 |
| 카메라 · picking · LOD · tier | `0` | 구조 — 머티리얼 선택만 바뀐다 |

**핵심 예측**: (1) 기존 6 body 12 시나리오 diff `0` — 반증되면 중립 바인딩이 틀렸다. (2) 하네스 diff `0` 줄. (3) 데이터 `0` 줄 — 깨지면 SSoT 누수.

---

## 8. Visual Fidelity §의무 체크리스트 4항목

- [x] **데이터 SSoT 보존** — `colorHint.hex` read-only `baseColor`. 패턴 · 보조색 · albedo 는 rendering-only 코드 상수. `solar-system.json` 변경 `0`.
- [x] **rendering 시점 분리** — 셰이더 레이어 단독. physics · 좌표 계약 무접촉.
- [x] **사용자 D-T2 가이드** — 표면은 시각 표현이며 Info 패널 표기 대상이 아니다 (ADR 756 §결정 5 동형).
- [ ] **점유율 · 사실 비율** — mesh 기하 무변경이라 점유율 영향 `0` [구조]. albedo 배율은 rendering 시점 왜곡이고 크기는 「단색 대비 평균 휘도 비」 로 기록한다 (안 1: io `0.86` · europa `0.86` · ganymede `1.01` · callisto `1.01` · mercury `1.01` · saturn `0.91` — README lit 수치의 평균 휘도 비, 태양측 근접 1 시점).

---

## 9. 사용자 결정 표 (Q)

| Q | 질문 | 권고 | 대안 |
| --- | --- | --- | --- |
| Q1 | 1차 대상 | **A** — mercury · callisto · ganymede · io · europa · saturn | B (크레이터 3만) · C (+ pluto · charon) |
| Q2 | 방식 | **(c) 혼합** — Cratered 파라미터화 + Volcanic · Icy 신규 (타입 7) | (a) 파라미터화만 · (b) body 별 신규 타입 |
| Q3 | saturn 경로 | **(i) IceGiant 재사용** (셰이더 0행) | (ii) GasBands + albedo · (iii) 제외 |
| Q4 | 시안 | **안 1 (b)** 전 body — body 별로 안 2 (c) 선택 가능 | 안 2 전 body · 파라미터 조정 요청 |
| Q5 | 달 기존 포화 `95%` | **범위 밖 — 기록만** | 별건 이슈 생성 · 이번 범위 편입 (기존 4종 불변 DoD 재조정) |
| Q6 | PR 분할 | **1 PR** | 2 PR (#1274 형) |

---

## 10. 위험

| # | 위험 | 처분 |
| --- | --- | --- |
| R1 | saturn albedo `0.43` 이 `verify:790-focus-zoom` S3 (saturn 최대 줌인 중앙 crop 평균 휘도 `> DARK_THRESHOLD 20`. 스크립트 주석의 2026-07-09 정상 상태 실측 `42.2`) 를 깎는다 | 미측정. 790 은 CI 밖 로컬 가드 — dev 가 1회 실행해 로그를 PR 에 박제. 미달이면 보고 → 재합의 (임계 완화 금지) |
| R2 | GLSL 예약어 (M4 `patch`) | dev 인계 — 지역 변수명은 GLSL 예약어 (`patch` · `sample` · `filter` · `input` · `output` 등) 를 피한다 |
| R3 | `IceGiant` 이름이 토성을 포함 | enum · 테이블 주석 갱신. 이름 변경은 비요청 리팩터라 비-범위 |
| R4 | 포커스 1280 의 위성 disk 반경 `24.6 px` 에서 패턴 판독 한계 | 시안 「포커스」 시트로 사용자에게 그대로 보인다. 근접 · 태양측 시트가 함께 있다 |
| R5 | 안 1 · 안 2 의 io 가 실제 (황색 위주) 보다 주황으로 보인다 | 시안에서 육안 결정. 보조색 · 패치 진폭은 조정 가능 |

---

## 11. 미확인 (실행되지 않은 것 — 근거로 인용 금지)

- fps 비용 (로컬 측정 없음 — CI `fps-baseline-guard` 가 판정)
- `verify:790` S3 saturn 휘도 (R1)
- `verify:773` 에 대상 6 body 를 넣었을 때의 낮면/밤면 비 (넣지 않는 것이 이번 권고)
- 교육 투어 「태양계」 의 토성 단계 (`ecliptic-oblique`) 프레임에서의 밴드 모양 — 시안의 토성 포커스는 극 방향이라 밴드가 동심원으로 보인다
- 2 PR 안의 PR1 단독 diff (M1 은 1 PR 구성만 실행)

---

## 12. 재검토 조건

1. **타입 수가 8 에 도달** — ADR 756 §교차검증 고유 발견 2 의 인스턴스 전환을 측정 기반으로 판정 (컴파일 시간 · 셰이더 길이).
2. **다른 body 가 Cratered · Volcanic · Icy 로 등록** — 행 추가가 불변식으로 강제된다. 코드 변경이 「타입 1줄 + 파라미터 행 1개」 를 넘으면 테이블 추상화를 재검토.
3. **pluto · charon 요구** — 고유 지형 표현은 에셋 예외 (ADR 756 Amendment 4) 의 확장 결정이 선행.
4. **달 포화 처분 요구 (Q5)** — 달 albedo 를 이 규칙으로 바꾸면 `verify:756` 달 갭 · #1360 식 그림자 가드를 재측정.
5. **R1 발현** — saturn albedo 와 790 임계의 재합의.

---

## 교차검증 반영 사항

**미수행 — 메인 오케스트레이터가 수행한다.** 결과는 4축 (합의 / 이견 수용 / 기각 / 고유 발견) 으로 이 절에 통합하고 상태를 Accepted 로 전이한다.

**호출 전 Claude 편향 셀프 체크** ([cross-validate-protocol.md](../guides/cross-validate-protocol.md) §5):

- 낙관적 일정 — 1 PR 권고가 리뷰 라운드를 과소평가하는가? → 질문으로 삽입 권장
- 결합 간과 — albedo 하강이 다른 가드 (790 휘도 · 1360 식 그림자 · 1274 하네스) 와 결합하는가? 790 만 식별 (R1). → 질문으로 삽입 권장
- 폐기 프레이밍 — pluto · venus · titan 제외가 「어려워서」 를 「사실성」 으로 포장하는가? → 질문으로 삽입 권장
- 순수주의 — saturn 의 `IceGiant` 재사용이 이름 순수주의로 기각돼야 하는가, 역으로 실용주의가 과한가? → 통과 (대안 (ii) 를 표로 제시)
