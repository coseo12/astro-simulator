# ADR 20261030-1419 — 지구 밖 천체 표면 확장: 위성 · 암석 행성 표면 타입과 body 별 파라미터 카탈로그

- **상태**: Accepted (Claude 단독 분석 2026-10-30 — cv 하드 타임아웃, 미채택 응답 참고) — §교차검증 반영 사항
- **사용자 결정 (2026-10-30)**: Q1~Q6 전부 권고안 — Q1 A (6 body) · Q2 (c) 혼합 · Q3 (i) IceGiant 재사용 · Q4 **안 1 (b) 전 body 일괄** · Q5 달 포화 기록만 · Q6 1 PR. 수치는 §5-A 에서 동결한다
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

| 구분                           | body                                                                       | 현행               | 노출 경로                                            |                                 포커스 1280 disk 반경 [실측] |
| ------------------------------ | -------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------- | -----------------------------------------------------------: |
| 절차 표면                      | earth · mars · jupiter · moon · uranus · neptune                           | `ShaderMaterial`   | —                                                    |                                               moon `22.2 px` |
| 상단 바 「천체 ▾」 메뉴 (단색) | mercury · venus · saturn · pluto                                           | `StandardMaterial` | 메뉴 12개 중 4개 (`body-menu.tsx` `BODY_MENU_ITEMS`) | mercury `98.3` · venus `94.1` · saturn `73.2` · pluto `98.3` |
| 검색 · URL 전용 (단색)         | io · europa · ganymede · callisto · titan · enceladus · charon · triton 외 | `StandardMaterial` | 검색 (`/`) · `?focus=`                               |                     위성 전부 `24.6 px` (궤도 맥락 프레이밍) |

- 교육 투어 포커스 빈도 [실측 — `apps/web/src/lib/tours/*.ts` `focus:` 집계]: earth `14` · jupiter `1` · mars `1` · moon `1` · saturn `1` · sun `1`. 위성은 moon 뿐이다.
- 기본 화면 LOD [실측, swiftshader]: `/?gpu=a&lod=auto` 에서 saturn `mid` · jupiter `mid` · mercury · moon · 갈릴레이 4종 `low`. `focus=jupiter` 에서 갈릴레이 4종 전부 `mid` — **목성 포커스 화면에서 갈릴레이 위성이 표면 셰이더를 받는다.**
- **saturn 은 단색이다.** 메뉴 · 투어 · 기본 화면 (`mid`) 에 모두 나오는데 표면이 없다.

### 1-A. 현행 광원식이 만드는 포화 [실측]

절차 표면 광원은 `smoothstep(0, 0.12, ndl)` 이라 `ndl ≥ 0.12` 인 낮면 전체가 최대 세기를 받는다 (ADR 756 §A12.20.3). 단색 경로는 Lambert 그라데이션이다. 그래서 같은 `colorHint` 로 절차 표면에 등록하면 낮면이 평평하게 포화한다 — #1274 의 uranus R5 와 같은 기전.

태양측 근접 시점 · disk `0.95R` 표본 3채널 포화율 (실 Chrome · WebGPU):

| body                 | 단색 (현행) | 절차 표면 albedo `1` |
| -------------------- | ----------: | -------------------: |
| saturn               |    `16.49%` |             `72.24%` |
| ganymede             |     `1.85%` |             `40.73%` |
| moon (현행 Cratered) |    `44.33%` |     `95.01 ~ 95.03%` |

⇒ **albedo 축 없이 등록하면 패턴이 흰 원반에 묻힌다.** 그리고 **현행 달도 이미 그렇다** (§9 Q5).

### 1-B. 셰이더 상수의 전 body 바인딩 [구조]

`craterDepth` · `craterDensity` 는 body 분기 없이 **전 표면 body 에 달 상수로** 바인딩되고 (`procedural-planet-shader.ts:1578-1579`), 크레이터 결 진폭 `0.15` 는 GLSL 리터럴이다 (`:1233`). #1274 PR1 이전의 밴드 uniform 과 같은 구조다 (§A12.4 「jupiter 상수를 모든 body 가 상속하는 형태」).

---

## 2. 외관 근거 (1차 자료)

데이터 SSoT 는 `colorHint.hex` 그대로다. 아래는 패턴 · 보조색 · albedo 설계의 근거다.

| body      | 기하 알베도 | 외관 (출처 요약)                                                                                                                                                                         | 표현                                                                                             |
| --------- | ----------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| io        |      `0.62` | 태양계에서 가장 화산 활동이 큰 천체, 수백 개 화산 · 용암 호수, 분출물이 충돌 크레이터보다 빨리 표면을 덮음. Juno 사진 설명: 녹슨 색 바탕 · 옅은 황갈 영역 · 짙은 주황 반점 · 회갈색 함몰 | 황 패치 + 칼데라 점 · 후광 (신규 Volcanic)                                                       |
| europa    |      `0.68` | 얼음 표면 · 적갈색 선과 반점                                                                                                                                                             | 대원 계열 lineae + 얼룩 (신규 Icy)                                                               |
| ganymede  |      `0.44` | 오래되고 크레이터 많은 어두운 지역 + 젊고 지각 변형된 밝은 지역, 밝은 점은 최근 충돌 크레이터                                                                                            | Cratered + 저주파 2톤 지역 + 밝은 크레이터                                                       |
| callisto  |      `0.19` | 태양계에서 크레이터가 가장 많은 천체, 「어두운 표면 위 밝은 흉터」                                                                                                                       | Cratered 고밀도 + 밝은 크레이터 (깊이 음수)                                                      |
| mercury   |     `0.142` | 달과 비슷한 회갈색, 크레이터 다수, 밝은 광조 (우주 풍화로 어두워짐)                                                                                                                      | Cratered (달 유사)                                                                               |
| saturn    |           — | 저대비 위도 밴드 (목성보다 옅음)                                                                                                                                                         | IceGiant 분기 재사용                                                                             |
| venus     |     `0.689` | 가시광에서 구름층으로 무늬 없음                                                                                                                                                          | **제외** — 패턴을 넣으면 사실 왜곡                                                               |
| titan     |      `0.22` | 주황 연무, 가시광 무늬 없음                                                                                                                                                              | **제외** — 같은 이유                                                                             |
| pluto     |      `0.52` | 붉은 색 · 밝은 하트 모양 영역 (New Horizons) · 적도의 짙은 적색 지대 (Cthulhu)                                                                                                           | **제외** — 대표 특징이 고유 지형이라 절차 노이즈로 재현 불가 (지구 마스크 같은 에셋 예외가 선행) |
| charon    |      `0.42` | 대부분 회색, 북극에 붉은 영역                                                                                                                                                            | **제외 (후속)** — 극관 색조 축이 별도로 필요, 노출 낮음                                          |
| enceladus |       `1.0` | 백색 얼음                                                                                                                                                                                | **제외** — 반경 252 km · disk `24.6 px`                                                          |

출처:

- 기하 알베도 — NASA NSSDC Planetary Fact Sheets: [Jovian satellites](https://nssdc.gsfc.nasa.gov/planetary/factsheet/joviansatfact.html) (visual geometric albedo) · [Saturnian satellites](https://nssdc.gsfc.nasa.gov/planetary/factsheet/saturniansatfact.html) · [Pluto/Charon](https://nssdc.gsfc.nasa.gov/planetary/factsheet/plutofact.html) · [Mercury](https://nssdc.gsfc.nasa.gov/planetary/factsheet/mercuryfact.html) · [Venus](https://nssdc.gsfc.nasa.gov/planetary/factsheet/venusfact.html) · [Moon](https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html) (`0.12`)
- 외관 — NASA Science: [Io](https://science.nasa.gov/jupiter/jupiter-moons/io/) · [Europa](https://science.nasa.gov/jupiter/jupiter-moons/europa/) · [Ganymede](https://science.nasa.gov/jupiter/jupiter-moons/ganymede/) · [Callisto](https://science.nasa.gov/jupiter/jupiter-moons/callisto/) · [Mercury facts](https://science.nasa.gov/mercury/facts/) · [Pluto](https://science.nasa.gov/dwarf-planets/pluto/) · [Charon](https://science.nasa.gov/dwarf-planets/pluto/moons/charon/)
- Pluto 적도 적색 지대 (Cthulhu) 의 원인은 미확정이다 — 톨린 가설을 실험실 톨린이 재현하지 못했다는 보고가 있다 ([NASA NTRS 20250006648](https://ntrs.nasa.gov/citations/20250006648) · [Smithsonian](https://www.smithsonianmag.com/smart-news/plutos-red-patches-are-mystifying-scientists-180978057/)). 제외 판단에 영향은 없다.

⚠️ **렌더 albedo 배율은 물리 알베도가 아니다.** `colorHint` 가 이미 관측 색 (밝기 포함) 을 담고 있어서, 기하 알베도로 밝기를 다시 정하면 밝기 출처가 둘이 된다 (§4 Q4 기각 R3).

---

## 3. 실측 — POC (scratch worktree, 커밋 0)

환경: 로컬 macOS · scratch worktree (develop `cf8b2316`) · `next dev :3000` · `@astro-simulator/shared` · `core` dist 재빌드. POC 는 `procedural-planet-shader.ts` 에 `+102 / −6` (후보 표 · URL 플래그 포함) 과 `browser-verify-756-surface.mjs` 에 `+7 / −1` 이다. 커밋하지 않았다.

POC 내용: enum `Volcanic = 5` · `Icy = 6` 추가 · `SURFACE_TYPE_BY_BODY` 6행 추가 (saturn = IceGiant) · Cratered 분기를 `col = baseColor * surfAlbedo * (1 + terrain + region) * (1 − crater * craterDepth)` 로 파라미터화 (`terrain` 진폭 · `region` = `valueNoise` 저주파 2톤) · 분기 5 · 6 신설 · uniform 7개 추가 (`crTerrainAmp` · `crRegionAmp` · `crRegionFreq` · `surfAlbedo` · `accentA` · `accentB` · `patParams`).

| #   | 측정                                                                                                    | 결과                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | `verify:1274-invariance` — base (develop) ↔ POC, 12 시나리오 (기존 6 body × on/off), swiftshader        | **12 / 12 diff `0`**, exit `0`. 서빙 지문 base `061a3388…` ≠ POC `f13b5cbb…` (다른 빌드를 서빙했음)                                                                                                                                     |
| M2  | `verify:756` 에 대상 6 body 추가 (POC 안 1 · 안 2 빌드), swiftshader                                    | 전건 PASS. 신규 body 갭 최소 = saturn 안 1 `0.949` (임계 `0.15`). 기존 6 body 갭 무변화 범위 (§README)                                                                                                                                  |
| M3  | 실 Chrome (`channel:chrome`, headed, WebGPU) 28 page load (4 열 × 7 body)                               | 콘솔 에러 **`0`**                                                                                                                                                                                                                       |
| M4  | GLSL 지역 변수명 `patch`                                                                                | **컴파일 실패** (`GLSL compilation failed` 2건, WebGPU). `patch` 는 GLSL 예약어다. 이름 변경 후 `0`                                                                                                                                     |
| M5  | Icy 분기의 `for` 12회 + uniform 비교 `break`                                                            | WebGPU (M3) · swiftshader WebGL2 (M2) 모두 컴파일 · 렌더                                                                                                                                                                                |
| M6  | 태양측 근접 수치 (3채널 포화 · 평균 휘도)                                                               | §README 「lit 수치」 표                                                                                                                                                                                                                 |
| M7  | `verify:790-focus-zoom` S3 (saturn 최대 줌인 중앙 crop 평균 휘도, 임계 `20`), bundled chromium headless | develop 단색 `42.4` · `42.4` / POC saturn albedo `0.43` **`19.6` · `19.4` · `18.6` — FAIL** / albedo `0.50` `22.5` · `21.5` — PASS / albedo `0.55` `24.3` — PASS. 같은 실행의 S2 (jupiter, 변경 없는 body) 는 `27.1 ~ 40.4` 로 흔들렸다 |
| M8  | `verify:773-light` 에 io · europa 추가 (POC 안 1), swiftshader                                          | 전건 PASS. io 낮면 `149.6` / 밤면 `18.3` · 대비 낙차 `62.18%` · 보라 `0%` / europa `147.6` / `28.7` · `40.66%` · `0%`. 기존 4 body 판정 무변화                                                                                          |
| M9  | saturn mesh local `+Y` ↔ 고리 disc 법선 (local `+Z`) 각도, swiftshader                                  | 제품 프레임 (자전 ON) JD `2451545.0` · `2460000.5` 모두 고리 5개 전부 **`0.000°`** / `rotate=off` 프레임 `26.730°` (ADR 756 §A12.1 #6 의 기지 차이)                                                                                     |
| M10 | saturn 태양측 근접 (albedo 별)                                                                          | 단색 평균 휘도 `224.3` (3회 동일) / albedo `0.43` `204.5` / `0.50` `224.8` (2회 동일) · 3채널 포화 `0.00%` / `0.55` `231.4` · `0.00%`                                                                                                   |

- M1 의 의미 [구조 + 실측]: Cratered 분기에 `region` (`0` 바인딩) · `surfAlbedo` (`1` 바인딩) 를 넣고 달 행을 기존 상수로 두면 달 픽셀이 바뀌지 않는다. 신규 분기와 신규 uniform 이 다른 body 의 draw 에 새지 않는다.
- 하네스 무변경 [구조]: `verify:1274-invariance` 의 `BODIES` 는 기존 6 body 이고, 신규 body 는 그 집합 밖이라 base 쪽 「미등록 선언」 (`EXPECT_UNREGISTERED`) 이 필요 없다. M1 이 이 구성으로 실행됐다.
- M7 의 기전 [구조 + 실측]: 790 S3 의 최대 줌인 화면은 토성 **밤면**이 화면을 채운다 (캡처 확인). 밤면 휘도 = `col × ambientShade` 이고 albedo 는 `col` 에 곱해지므로 밤면 휘도가 albedo 에 비례한다 — `19.5 / 42.4 ≈ 0.46` 이 albedo `0.43` 과 맞는다. 낮면 비포화 (R1) 를 위해 낮춘 albedo 가 밤면을 같은 비율로 어둡게 한다.

---

## 4. 후보 비교 · 권고

### Q1 — 1차 대상

| 안           | body                                                     | 근거                                                                                                                            | 비고                                                                                                                     |
| ------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **A (권고)** | mercury · callisto · ganymede · io · europa · saturn (6) | 메뉴 노출 2 (mercury · saturn) + 목성 포커스에서 `mid` 로 함께 보이는 갈릴레이 4. 개선 폭: 단색 → 각자 다른 표면 (§README 시트) | 로드맵 Cratered 후보 (ADR 756 §A12.9: mercury · callisto · rhea · titania · oberon · ceres) 중 2 포함                    |
| B            | mercury · callisto · ganymede (3)                        | 신규 타입 `0` — Cratered 파라미터화만                                                                                           | io · europa 는 크레이터로 표현 불가. saturn 미포함                                                                       |
| C            | A + pluto · charon                                       | 명왕성 메뉴 노출                                                                                                                | pluto 하트는 절차 재현 불가 → 저충실 표면이 사실 왜곡이 된다. 에셋 예외 (ADR 756 Amendment 4 동형) 를 별건 결정으로 선행 |

제외: venus · titan (가시광 무늬 없음 — 패턴이 왜곡), enceladus (disk `24.6 px`, 단색 백색이 이미 사실에 가깝다), triton (`verify:756` · `verify:773` 의 단색 대조군 — 유지해야 대조군이 남는다).

### Q2 — 방식 (셰이더 분기 비용 · 8종 임계)

⚠️ **인용 정정**: 「8종 초과 시 타입별 셰이더 인스턴스 전환」 은 ADR 756 **§재검토 조건 2 가 아니다** (조건 2 는 gas-bands 자전축 기울기다). 출처는 §교차검증 반영 사항 **고유 발견 2** (agy 제안, 조건 3 에 흡수) 이고, 측정 근거가 없는 미래 조건부 제안이다.

| 축                   | (a) 기존 타입 파라미터화만 | (b) 대상마다 신규 타입 | **(c) 혼합 (권고)**                                             |
| -------------------- | -------------------------- | ---------------------- | --------------------------------------------------------------- |
| 타입 수 (현행 5)     | 5                          | 5 + 6 = 11 (임계 초과) | **7** (Volcanic · Icy)                                          |
| io · europa 표현     | 불가 (크레이터뿐)          | 가능                   | 가능                                                            |
| fragment 비용 [구조] | 대상 draw 만 분기 3 진입   | 대상 draw 만 자기 분기 | 대상 draw 만 자기 분기. 분기는 draw 단위 균일 (ADR 756 §결정 2) |
| 기존 body 픽셀       | M1 동형                    | —                      | **M1 실측 diff `0`**                                            |

- 구성: mercury · callisto · ganymede → **Cratered + body 별 크레이터 파라미터 테이블**. io → **Volcanic (5)**. europa → **Icy (6)**. saturn → Q3.
- 분기 비용의 상한은 「컴파일 1회 · draw 당 1분기」 그대로다 — 타입 수가 늘면 셰이더 문자열과 컴파일 시간이 는다. 8종 임계를 넘는 안 (b) 는 측정 근거 없이 그 경계를 넘으므로 기각한다.

### Q3 — saturn 경로

| 안                                  | 변경                                 | 비용                                                                                     | 위험                                                                                                                   |
| ----------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **(i) IceGiant 분기 재사용 (권고)** | 타입 1줄 + 밴드 행 + albedo 행 = 3행 | 셰이더 `0` 행. ADR 756 §A12.16 조건 4 가 예고한 「행 1개 + 타입 테이블 1줄」 형태와 같다 | 이름 불일치 (`IceGiant` 에 토성) → enum JSDoc 을 「저대비 위도 밴드 + albedo 배율 (천왕성 · 해왕성 · 토성)」 로 고친다 |
| (ii) GasBands + albedo 축           | 분기 2 에 albedo 곱 + 해석 함수      | jupiter 분기 접촉 (jupiter `1` 바인딩, M1 하네스로 diff `0` 실증 필요)                   | 목성 분기 격리 (§A12.5 결정 2 의 이유) 를 깬다                                                                         |
| (iii) 제외                          | —                                    | —                                                                                        | 노출이 가장 큰 단색 body 가 남는다                                                                                     |

### Q4 — 시안 · albedo 규칙

- **안 1 (b) 권고 — 절제.** 안 2 (c) 는 패턴 진폭 · 밀도를 키운 열이다. body 마다 안 1 / 안 2 를 따로 골라도 된다.
- albedo 규칙 = `min(R1, R2)`:
  - **R1 낮면 비포화** — `DEFAULT_PLANET_LIGHTING` 낮면 계수 × `colorHint` 의 채널 최댓값 역수.
  - **R2 단색 평균 휘도 이하** — 태양측 근접 시점 평균 휘도가 단색 경로보다 밝지 않게.
  - 결과 [실측, 안 1]: 3채널 포화 전부 `≤ 0.01%` (단색 saturn `16.49%` → `0.00%`). callisto 평균 휘도 `160.9` (단색 `159.2`) — R1 만 쓰면 `206.4` (albedo `0.89`) 로 단색보다 밝아졌다. ⇒ R2 가 callisto 에서 결정적이다.
- 기각 **R3 (실제 기하 알베도 순서 보존)**: 안 1 의 렌더 평균 휘도 순서 (ganymede `207` > europa `189`) 는 실제 순서 (europa `0.68` > ganymede `0.44`) 와 다르다. 그러나 밝기의 데이터 출처는 `colorHint` 이고, 알베도로 다시 정하면 출처가 둘이 된다. 순서가 문제라면 `colorHint` (데이터) 를 고치는 별건이다.
- albedo `1` 열 (a) 은 채택 후보가 아니라 「albedo 축이 왜 필요한가」 를 보이는 참고다.
- ⚠️ **saturn 예외 (M7 · M10, 결정 후 실측)**: 안 1 의 saturn albedo `0.43` 은 기존 계약 `verify:790` S3 (임계 `20`) 를 FAIL 한다 (`18.6 ~ 19.6`). 기존 가드 계약이 이 ADR 의 albedo 규칙보다 앞선다 → saturn 만 **`0.50`** 으로 동결한다. 대가: R2 를 `+0.5` (`224.8` vs 단색 `224.3`, `+0.2%`) 넘는다 — R2 의 유일한 예외로 기록한다. R1 은 실측으로 유지된다 (3채널 포화 `0.00%`). `0.55` 는 790 여유가 크지만 R2 를 `+3.2%` 넘어 기각했다. 육안 비교: README `sheet-saturn-albedo.png`.

### Q5 — 달의 기존 포화 (범위 밖 발견)

현행 달 (Cratered) 은 태양측 근접에서 3채널 포화 `95%` — 크레이터가 낮면에서 보이지 않는다 [실측]. albedo 규칙을 달에 적용하면 해소되지만 달 픽셀이 바뀐다 (이슈 DoD 「기존 4종 픽셀 불변」 위반 · `verify:756` 달 갭 · #1360 식 그림자 가드 재측정 필요).

- **권고: 이번 범위 밖.** CLAUDE.md 「검증 강도 게이트」 의 기본 처분 (PR 코멘트 기록) 에 따라 이 ADR 과 PR 코멘트에 기록만 한다. 사용자가 원하면 별건 이슈로 연다.

### Q6 — PR 분할

| 안              | 구성                                                                     | 근거                                                                                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 PR (권고)** | 테이블 이관 + body 등록 + 신규 분기 + 가드 목록 갱신                     | M1 이 「신규 body 등록 + 기존 6 body diff `0`」 을 **한 번에** 실증했다. 수치는 이 설계의 시안 승인으로 확정되므로 #1274 의 「프리뷰 → 승인 → 확정」 2라운드가 필요 없다. 사용자 방침 (기능 우선 · 검증 경량) |
| 2 PR            | PR1 크레이터 파라미터 테이블 이관 (시각 변화 `0`) → PR2 등록 · 신규 분기 | #1274 선례. 리뷰 단위가 작다. 대신 라운드가 하나 는다                                                                                                                                                         |

---

## 5. 결정 (Accepted — 사용자 결정 2026-10-30)

1. **대상** — mercury · callisto · ganymede (Cratered) · io (Volcanic) · europa (Icy) · saturn (IceGiant 재사용).
2. **타입** — `SurfaceType.Volcanic = 5` · `SurfaceType.Icy = 6` 추가, if-else 분기 2개. 타입 수 `7`.
3. **파라미터 테이블** — 소비 타입 body 만 행을 가진다 (ADR 756 §A8.9 결정 5 · `SURFACE_MASK_BY_BODY` · `SURFACE_BAND_PARAMS_BY_BODY` 선례):
   - `SURFACE_CRATER_PARAMS_BY_BODY` — `{ density, depth, terrainAmp, regionAmp, regionFreq, albedo }`. 키 = `{ id | type == Cratered }` (moon · mercury · callisto · ganymede). **moon 행은 기존 상수를 참조** (`CRATER_DENSITY` · `CRATER_DEPTH` · 리터럴 `0.15` 를 상수로 추출 · `regionAmp 0` · `albedo 1`) — 값 사본 금지 (volt #69).
   - `SURFACE_PATTERN_PARAMS_BY_BODY` — 타입별 **명명 필드**로 선언하고, 바인딩 직전 변환기 (예: `packPatternParams(type, params) → Vector4`) 가 `vec4` 로 패킹한다. 키 = `{ id | type ∈ { Volcanic, Icy } }`.

     | 타입     | `.x`                                  | `.y`                                     | `.z`                                  | `.w`                                                      |
     | -------- | ------------------------------------- | ---------------------------------------- | ------------------------------------- | --------------------------------------------------------- |
     | Volcanic | `sulfurFreq` — 황 패치 fbm 주파수     | `sulfurAmp` — 패치 → `accentA` 혼합 강도 | `calderaFreq` — 칼데라 셀 격자 주파수 | `calderaAmp` — 칼데라 (`accentB`) · 후광 (`accentA`) 강도 |
     | Icy      | `mottleFreq` — 얼룩 · 워프 fbm 주파수 | `mottleAmp` — 얼룩 → `accentA` 혼합 강도 | `lineWidth` — lineae smoothstep 폭    | `lineCount` — lineae 개수 (정수, `0 ≤ n ≤ 12`)            |

   - **보조색 `accentA` · `accentB` 계약**: `{ r, g, b }` 객체, 각 성분 `[0, 1]` 실수 (선례 `LAND_COLOR_RGB`). 색공간은 `baseColor` 와 **같은 공간** — `hexToColor3` 이 8비트 값을 `/255` 할 뿐 감마 변환을 하지 않으며 (`color-utils.ts:14-20`), 셰이더는 그 값 그대로 `mix` 한다. 선형화 · sRGB 변환을 어느 한쪽에만 넣지 않는다.
   - **`depth` 허용 범위**: `−1 ≤ depth < 1`. 음수는 크레이터를 밝힌다 — GLSL 의 `(1 − crater × depth)` 가 `(1 + |depth| × crater)` 가 된다. 상한은 `1 − crater × depth ≥ 0` (색 반전 방지), 하한은 밝기 배율 상한 `2` 다. 단위 테스트로 단언한다.
   - **음수 depth 와 R1** [실측 + 도출]: callisto 동결값의 최대 배율은 `(1 + 0.12 + 0) × (1 + 0.7) = 1.904`, × albedo `0.69` × `colorHint` R `0.4196` × 낮면 계수 R `2.6725` = `1.47` → 밝은 크레이터 중심에서 R 채널이 clamp 된다 [도출]. 태양측 근접 실측은 3채널 포화 `0.00%` · 1채널 이상 `1.31%` 다 (M6). ⇒ R1 은 **패턴 중립 색 기준**이고, 패턴 정점의 1채널 clip 은 허용한다 (3채널 포화는 `0` 유지).
   - saturn — 기존 `SURFACE_BAND_PARAMS_BY_BODY` · `ICE_GIANT_ALBEDO_BY_BODY` 에 행 추가.
   - 해석 함수 — 행 누락 · 초과 시 **throw** (기본값 fallback 금지, §A12.4 계약 5 동형). 비소비 타입은 중립값을 바인딩 (크레이터 = 달 값, albedo = `1`, 패턴 = `0` · 보조색 = `(0,0,0)`).
4. **분기 수식 (POC 실측판 요약)** — `P = patternParams`, `A`/`B` = 보조색, 노이즈는 기존 `fbm` · `valueNoise` · `hash33` 만 쓴다:
   - **Volcanic** — `c = mix(base, A, smoothstep(0.45, 0.72, fbm(p·P.x)) · P.y)` → 칼데라 셀 (`hash33(floor(p·P.z))`, 셀의 45% 에만) 의 점 `spot` 과 고리 `halo` 로 `c = mix(c, A, halo · 0.6 · P.w)` · `c = mix(c, B, spot · P.w)` → `col = c · albedo`.
   - **Icy** — `c = mix(base, A, smoothstep(0.42, 0.72, fbm(p·P.x·1.7 + 7)) · P.y)` → `for (int i = 0; i < 12; i++) { if (float(i) >= P.w) break; … }` 안에서 hash 로 정한 방향 `d_i` · 오프셋 `o_i` 의 소원 거리 `|p·d_i − o_i + (fbm(p·P.x) − 0.5)·0.25|` 로 `line = max(line, 1 − smoothstep(0, P.z, ·))` → `c = mix(c, B, line · 0.85)` → `col = c · albedo`.
   - **루프 상한은 GLSL 상수 `12` 로 고정**하고 uniform 은 `break` 조건에만 쓴다 (무한 루프 · TDR 경로 없음). 단위 테스트가 `lineCount` 를 `0 ≤ n ≤ 12` 정수로 단언한다.
   - **밤면 자체 발광 없음 [구조 + M8]**: 두 분기는 `col` (반사율) 만 정한다. 분기 뒤 공통 합성이 `col *= shade` (`shade = ambientShade + sunShade`, 식 그림자 포함) 이고, 그 뒤 가산 항 `rimColor · rim` · `nightLightColor · lights` 는 `rim` · `lights` 가 `0.0` 으로 초기화돼 Rocky 분기 (`uSurfaceType == 0`) 에서만 대입된다 — 비-Rocky 는 정확한 no-op. 보조색은 `shade` 곱 **앞**에만 들어간다. M8 이 밤면/낮면 비로 확인했다.
5. **high · mid 동일 바인딩 [구조]** — high (`body-mesh-factory.ts:83`) 와 mid (`:138`) 가 같은 `createProceduralPlanetMaterial(scene, body, …)` 를 부르고, 테이블 해석은 그 함수 안에서 `body.id` 로 한다 → 두 variant 의 uniform 값은 같다. mid 전용 감축 (루프 · 옥타브) 은 두지 않는다 (ADR 756 §결정 1 「high/mid 공유 머티리얼」). low (billboard) 는 단색 그대로다.
6. **uniform** — `55 → 62` (+7, POC 실측 구성). 이름은 dev 가 정하되 4중 SSoT (상수 → uniforms 배열 → 바인딩 → GLSL 선언) 를 함께 맞춘다.
7. **데이터** — `solar-system.json` 변경 `0`.

### 5-A. 동결 수치 (안 1 — 사용자 결정 2026-10-30)

**이 표가 1 PR 진행의 전제조건이다.** 구현 PR 에서 수치를 다시 조정하지 않는다 — 인프라 코드와 시각 튜닝이 한 PR 에 섞여 리뷰가 늘어지는 경로를 막는다 (cross-validate 참고 의견 수용). 조정이 필요해지면 구현 PR 을 멈추고 이 ADR 에 dated 부기로 먼저 바꾼다.

| body     | 타입            | 파라미터                                                                                                                                 |                                                    albedo |
| -------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------: |
| mercury  | Cratered        | `density 14` · `depth 0.4` · `terrainAmp 0.15` · `regionAmp 0.12` · `regionFreq 2.0`                                                     |                                                    `0.68` |
| callisto | Cratered        | `density 22` · `depth −0.7` · `terrainAmp 0.12` · `regionAmp 0` · `regionFreq 2.0`                                                       |                                                    `0.69` |
| ganymede | Cratered        | `density 12` · `depth −0.4` · `terrainAmp 0.12` · `regionAmp 0.3` · `regionFreq 2.0`                                                     |                                                    `0.61` |
| io       | Volcanic        | `sulfurFreq 3.0` · `sulfurAmp 0.45` · `calderaFreq 9.0` · `calderaAmp 0.9` · `accentA (0.85, 0.45, 0.15)` · `accentB (0.12, 0.08, 0.05)` |                                                    `0.40` |
| europa   | Icy             | `mottleFreq 2.5` · `mottleAmp 0.35` · `lineWidth 0.010` · `lineCount 10` · `accentA (0.62, 0.42, 0.30)` · `accentB (0.55, 0.32, 0.22)`   |                                                    `0.45` |
| saturn   | IceGiant        | 밴드 `amplitude 0.08` · `count 10` · `turbulence 0.05`                                                                                   | **`0.50`** (안 1 의 `0.43` 에서 변경 — §4 Q4 saturn 예외) |
| moon     | Cratered (기존) | 기존 상수 참조 · `regionAmp 0`                                                                                                           |                                                       `1` |

- 근거 수치: README 「후보 파라미터」 · 「lit 수치」 · M7 · M10. saturn `0.50` 을 뺀 값은 사용자가 육안으로 고른 안 1 그대로다.

## 6. 불변성 · 비용 · 가드 영향

| 축                          | 수단                                                                                                                                                                                                                                                                                                                                                                                                               | 근거                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| 기존 6 body 픽셀 불변       | `verify:1274-invariance` base ↔ feature, 12 시나리오 `EXPECT_ZERO` 전건                                                                                                                                                                                                                                                                                                                                            | M1 — 하네스 무변경으로 실행됨                                                         |
| 대상 밖 body 불변           | 테이블 opt-in (미등록 = `StandardMaterial`) + `solar-system-scene-display-toggles.test.ts` NullEngine fixture (등록 ⇔ 절차 머티리얼, 참 · 거짓 각 `≥ 1`)                                                                                                                                                                                                                                                           | 구조 — 기존 테스트가 테이블을 따라간다                                                |
| 신규 body 표면 존재         | `verify:756` `SURFACE_BODIES` +6, `HF_ENTROPY_MARGIN 0.15` 무변경                                                                                                                                                                                                                                                                                                                                                  | M2 — 최소 갭 `0.949`                                                                  |
| 단색 대조군                 | `verify:756` `PLAIN_BODIES` 에서 saturn 제거 → `[venus, triton]` / `verify:773` 에서 mercury · saturn 제거 → `[venus, triton]`. 두 스크립트의 `length ≥ 1` fail-fast 유지                                                                                                                                                                                                                                          | 구조 — 둘 다 판정이 아니라 로그                                                       |
| shader-pixel-guard baseline | 대상 body 를 재는 `verify:756` · `verify:773` 은 body 별 ON vs OFF 상대 성질로 판정한다 (워크플로 헤더 「판정 규약」 — 절대 임계 금지)                                                                                                                                                                                                                                                                             | 구조 — 대상 목록 갱신 외에 바꿀 baseline 파일이 없다                                  |
| fps                         | 기존 `fps-baseline-guard` CI. `/?gpu=a&lod=auto` 화면에서 대상 중 `mid` 이상은 saturn 하나 (§1 LOD 실측)                                                                                                                                                                                                                                                                                                           | 추론 — 머티리얼만 바뀌고 draw 수 · 기하 불변                                          |
| 달 fragment 비용            | Cratered 분기에 `valueNoise` 1회 추가 (지역 2톤, 달은 진폭 `0` 이라 픽셀 불변)                                                                                                                                                                                                                                                                                                                                     | 구조 + M1                                                                             |
| 밤면 누설                   | `verify:773` `SURFACE_BODIES` 에 io · europa 추가 (Volcanic · Icy 대표). 판정식 · 임계 무변경                                                                                                                                                                                                                                                                                                                      | M8 — 전건 PASS                                                                        |
| 암전 가드                   | `verify:790` S3 (saturn) — 로컬 가드 (CI 밖). 구현 PR 에서 1회 실행 로그 박제                                                                                                                                                                                                                                                                                                                                      | M7 — albedo `0.50` 에서 `21.5 ~ 22.5` (여유 `1.5 ~ 2.5`)                              |
| 식 그림자 (#1360)           | **결합 없음.** 신규 body 머티리얼도 `initEclipseShadowUniforms` (`procedural-planet-shader.ts:1663`) 로 `uEclMode 0` 을 받고 `eclipseShadow()` 가 `vec2(0)` 을 낸다. 값을 쓰는 곳은 월식 수신 (`LUNAR_ECLIPSE_SHADOW_BODY_ID` = moon) 과 일식 수신 (그 모체 = earth) 의 high · mid 뿐이다 (`solar-system-scene.ts:1834-1858`). 현행 단색 경로에도 그림자가 없다 (core 에 `ShadowGenerator` · `receiveShadows` `0`) | 구조                                                                                  |
| 토성 밴드 축                | 밴드 위도 = `normalize(vLocalPos).y` (mesh local `+Y`) — 자전 쿼터니언 `tilt ∘ spin` 을 따른다. 고리 disc 는 별도 회전 (`ring-placeholder.ts:114`)                                                                                                                                                                                                                                                                 | M9 — 제품 프레임 `0.000°` 일치. `rotate=off` 가드 프레임에서만 `26.73°` 어긋남 (기지) |

- **신규 가드 없음.** 기존 가드의 대상 목록 확장과 단위 테스트만 한다.
- 주석 영향 (넓은 grep — 「표면 타입 N종」 · 「4 body」 · 「23개」 · 「등록 집합」 · 「uranus · neptune」 등을 `packages` · `apps` · 스크립트 · 워크플로에서 찾고 표면과 무관한 행 (궤도 · billboard · allowlist 계수) 을 뺀 것) [실측]:
  - `procedural-planet-shader.ts:98` 「표면 타입 4종」 · `:171` 「23개 비-범위 body」 · `:174` 등록 집합 열거 · `:1576` 「4 body diff 0」 (PR #1278 기록 — 과거 사실이라 유지 가능)
  - `procedural-planet-shader.test.ts:7` 「대표 4개 등록」 · `:130-133` 등록 집합 정확 단언 (교체 대상) · `:152` 「venus/saturn/io 등 23개」
  - `SurfaceType.IceGiant` JSDoc (`:159-162`) — saturn 추가 시 의미 갱신
  - `browser-verify-1274-surface-invariance.mjs:102-104` — BODIES 설명 (무변경이면 유지)
  - `browser-verify-773-light.mjs` 의 「4 body」 서술 (`:35` · `:42` · `:85` · `:113` · `:177`) 은 그 가드의 `SURFACE_BODIES` 를 가리킨다 — io · europa 를 넣으면 판정 서술 (`:85` 「4 body 각각」) 을 갱신한다. `:42` · `:113` · `:177` 은 과거 실측 기록이라 유지한다

---

## 7. Concrete Prediction (구현 후 `git diff --numstat` 재현)

| 영역                                         | 예측             | 근거                                                                                                                                                               |
| -------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `procedural-planet-shader.ts`                | `+130 ~ +230`    | 추론 — POC `+102 / −6` 에서 후보 표 · URL 플래그 (약 45행) 를 빼고, 테이블 2종 · 해석 함수 2종 · 주석을 더한다. #1274 PR2 실측 `+111 / −7` (테이블 1종 + 분기 1개) |
| 단위 테스트                                  | `+150 ~ +350`    | 추론 — #1274 PR2 실측 `+343 / −29` (4 파일)                                                                                                                        |
| `browser-verify-756` · `-773`                | `+10 ~ +35`      | POC 실측 `+7 / −1` (756) · `+2` (773 SURFACE_BODIES) + 773 PLAIN 1행 · 서술 갱신                                                                                   |
| `browser-verify-1274-surface-invariance.mjs` | **`0`**          | M1 이 무변경으로 실행됨                                                                                                                                            |
| `solar-system.json`                          | **`0`**          | 결정 7                                                                                                                                                             |
| `float fbm(` 정의 사본                       | **`4`** (무변경) | POC 는 기존 `fbm` · `valueNoise` · `hash33` 만 호출                                                                                                                |
| uniform 배열 항목                            | `62`             | POC 실측 +7                                                                                                                                                        |
| 카메라 · picking · LOD · tier                | `0`              | 구조 — 머티리얼 선택만 바뀐다                                                                                                                                      |

**핵심 예측**: (1) 기존 6 body 12 시나리오 diff `0` — 반증되면 중립 바인딩이 틀렸다. (2) 하네스 diff `0` 줄. (3) 데이터 `0` 줄 — 깨지면 SSoT 누수.

---

## 8. Visual Fidelity §의무 체크리스트 4항목

- [x] **데이터 SSoT 보존** — `colorHint.hex` read-only `baseColor`. 패턴 · 보조색 · albedo 는 rendering-only 코드 상수. `solar-system.json` 변경 `0`.
- [x] **rendering 시점 분리** — 셰이더 레이어 단독. physics · 좌표 계약 무접촉.
- [x] **사용자 D-T2 가이드** — 표면은 시각 표현이며 Info 패널 표기 대상이 아니다 (ADR 756 §결정 5 동형).
- [ ] **점유율 · 사실 비율** — mesh 기하 무변경이라 점유율 영향 `0` [구조]. albedo 배율은 rendering 시점 왜곡이고 크기는 「단색 대비 평균 휘도 비」 로 기록한다 (안 1: io `0.86` · europa `0.86` · ganymede `1.01` · callisto `1.01` · mercury `1.01` · saturn `1.002` (동결 albedo `0.50`, 안 1 의 `0.43` 이었다면 `0.91`) — README lit 수치의 평균 휘도 비, 태양측 근접 1 시점).

---

## 9. 사용자 결정 표 (Q) — **결정 2026-10-30: 전부 권고안, Q4 는 안 1 전 body 일괄**

| Q   | 질문               | 권고 (= 결정)                                                     | 대안                                                       |
| --- | ------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------- |
| Q1  | 1차 대상           | **A** — mercury · callisto · ganymede · io · europa · saturn      | B (크레이터 3만) · C (+ pluto · charon)                    |
| Q2  | 방식               | **(c) 혼합** — Cratered 파라미터화 + Volcanic · Icy 신규 (타입 7) | (a) 파라미터화만 · (b) body 별 신규 타입                   |
| Q3  | saturn 경로        | **(i) IceGiant 재사용** (셰이더 0행)                              | (ii) GasBands + albedo · (iii) 제외                        |
| Q4  | 시안               | **안 1 (b)** 전 body — body 별로 안 2 (c) 선택 가능               | 안 2 전 body · 파라미터 조정 요청                          |
| Q5  | 달 기존 포화 `95%` | **범위 밖 — 기록만**                                              | 별건 이슈 생성 · 이번 범위 편입 (기존 4종 불변 DoD 재조정) |
| Q6  | PR 분할            | **1 PR**                                                          | 2 PR (#1274 형)                                            |

---

## 10. 위험

| #   | 위험                                                              | 처분                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | saturn albedo 가 `verify:790-focus-zoom` S3 (임계 `20`) 를 깎는다 | **발현 · 해소 [실측 M7]** — `0.43` 에서 FAIL (`18.6 ~ 19.6`) → `0.50` 동결 (`21.5 ~ 22.5`). 여유가 `1.5 ~ 2.5` 로 얇다 — 구현 PR 이 1회 실행 로그를 박제하고, 미달이면 보고 → 재합의 (임계 완화 금지) |
| R2  | GLSL 예약어 (M4 `patch`)                                          | dev 인계 — 지역 변수명은 GLSL 예약어 (`patch` · `sample` · `filter` · `input` · `output` 등) 를 피한다                                                                                                |
| R3  | `IceGiant` 이름이 토성을 포함                                     | enum · 테이블 주석 갱신. 이름 변경은 비요청 리팩터라 비-범위                                                                                                                                          |
| R4  | 포커스 1280 의 위성 disk 반경 `24.6 px` 에서 패턴 판독 한계       | 시안 「포커스」 시트로 사용자에게 그대로 보인다. 근접 · 태양측 시트가 함께 있다                                                                                                                       |
| R5  | 안 1 · 안 2 의 io 가 실제 (황색 위주) 보다 주황으로 보인다        | 시안에서 육안 결정. 보조색 · 패치 진폭은 조정 가능                                                                                                                                                    |

---

## 11. 미확인 (실행되지 않은 것 — 근거로 인용 금지)

- fps 비용 (로컬 측정 없음 — CI `fps-baseline-guard` 가 판정)
- `verify:773` 에 mercury · callisto · ganymede · saturn 을 넣었을 때의 판정 (io · europa 만 실행 — M8)
- `verify:790` 의 albedo `0.50` 측정은 2회다 — 분포는 모른다
- 갈릴레이 위성 mid variant 의 머티리얼 클래스를 런타임으로 확인하지는 않았다 (§5-5 는 구조 판독)
- 교육 투어 「태양계」 의 토성 단계 (`ecliptic-oblique`) 프레임에서의 밴드 모양 — 시안의 토성 포커스는 극 방향이라 밴드가 동심원으로 보인다
- 2 PR 안의 PR1 단독 diff (M1 은 1 PR 구성만 실행)

---

## 12. 재검토 조건

1. **타입 수가 8 에 도달** — ADR 756 §교차검증 고유 발견 2 의 인스턴스 전환을 측정 기반으로 판정 (컴파일 시간 · 셰이더 길이).
2. **다른 body 가 Cratered · Volcanic · Icy 로 등록** — 행 추가가 불변식으로 강제된다. 코드 변경이 「타입 1줄 + 파라미터 행 1개」 를 넘으면 테이블 추상화를 재검토.
3. **pluto · charon 요구** — 고유 지형 표현은 에셋 예외 (ADR 756 Amendment 4) 의 확장 결정이 선행.
4. **달 포화 처분 요구 (Q5)** — 달 albedo 를 이 규칙으로 바꾸면 `verify:756` 달 갭 · #1360 식 그림자 가드를 재측정.
5. **790 S3 가 albedo `0.50` 에서도 `20` 미만** — saturn albedo 와 790 임계를 사용자와 재합의 (임계 단독 완화 금지).
6. **R2 예외가 다른 body 로 번짐** — albedo 규칙 자체 (광원식의 ambient 에도 albedo 가 곱해지는 구조) 를 재검토.

---

## 교차검증 반영 사항

**형식상 Claude 단독 분석 (outcome 77) — 단, 타임아웃 직전 생성된 외부 모델 응답 전문을 참고로 재분석함.** 메인이 `cross_validate.sh` 를 1회 실행했고 (2026-10-30, agy), 신규 하드 타임아웃 (#1363) 이 시도 2회 모두 `360 s` 에 발동해 outcome `429-fallback-claude-only` · exit `77` 이었다. 미채택 stdout 에 완결된 응답 본문 (1회차 `13,291` 자, `.claude/logs/cross-validate-architecture-20261030-185633.log` 5~107행) 이 남아 있어 이를 참고 의견으로 재분석했다. 판정은 메인 재분석 + architect 실측이다.

- #1363 진단 (응답 턴은 끝났는데 프로세스 종료 경로가 정체) 을 다시 확인한 사례다 — 본문은 완결됐는데 프로세스가 끝나지 않아 하드 타임아웃이 발동했다.

### 합의 (설계 유지)

1. 카탈로그 분리 · dated 포인터 (§0), 4중 SSoT 와 파급 경로 식별.
2. Q2 혼합 (타입 7) · 「8종」 인용 정정.
3. Q3 IceGiant 재사용 — 목성 분기 격리 (§A12.5) 를 지키는 실용적 교환.
4. Q4 albedo `min(R1, R2)` · R3 기각 (밝기 출처 이원화 방지).
5. Q1 제외 — venus · titan (가시광 무늬 없음) · pluto (고유 지형) 는 「어려워서」 가 아니라 Visual Fidelity 근거 (셀프 체크 「폐기 프레이밍」 축 통과).
6. Q6 1 PR 은 M1 근거로 타당.
7. POC 의 URL 후보 플래그는 구현에 남기지 않는다 (§7 예측의 「후보 표 · URL 플래그 제외」).

### 이견 수용 (원안 수정)

1. **패턴 파라미터 계약** — 원안 `params: [4]` → 타입별 명명 필드 + `vec4` 변환기, 보조색 형식 · 색공간 계약 (§5-3).
2. **callisto 음수 depth** — 원안 범위 미정 → `−1 ≤ depth < 1` + R1 과의 관계 도출 · 실측 (§5-3).
3. **분기 수식 · 루프 · 밤면 발광** — 원안 README 에만 → ADR 본문 요약 + 상수 상한 루프 · `lineCount ≤ 12` 단위 테스트 · 밤면 자체 발광 없음의 구조 근거 (§5-4).
4. **high · mid 바인딩** — 명시 (§5-5).
5. **790 선측정** — 원안 「미측정, dev 1회」 → architect 가 POC 로 실행 (M7). **0.43 에서 FAIL 이 실제로 났다** → saturn albedo `0.50` 동결 (§4 Q4 saturn 예외).
6. **773 밤면 누설** — 원안 「넣지 않음」 → io · europa 를 넣어 실행 (M8 PASS), 구현 PR 에 편입 (§6).
7. **수치 동결을 1 PR 의 전제조건으로** — §5-A.

### Claude 재분석으로 기각한 외부 모델 제안

1. **테이블 4종 파편화 → 통합 디스패치 구조 전환 기준을 지금 정하라** — 기각. 소비자가 생기기 전 인프라는 ADR 756 §A8.9 결정 5 와 충돌한다. §12 조건 2 (「타입 1줄 + 행 1개」 초과 시 재검토) 가 이미 전환 트리거다.

### 고유 발견 (외부 모델 — 확인 결과)

1. **식 그림자 (#1360) 결합** — 확인 결과 결합 없음 [구조] (§6 표).
2. **토성 밴드 축 ↔ 고리 평면** — 확인 결과 제품 프레임 `0.000°` 일치 [실측 M9] (§6 표).

### 호출 전 Claude 편향 셀프 체크 ([cross-validate-protocol.md](../guides/cross-validate-protocol.md) §5)

- 낙관적 일정 — 1 PR 권고. 수치 동결 전제로 수용 (§5-A).
- **결합 간과 — 미통과 실증.** 셀프 체크가 790 을 「위험」 으로만 두었는데 실측에서 FAIL 이 났다 (M7). 식 그림자 · 고리 축은 결합이 없었다.
- 폐기 프레이밍 — 통과 (합의 5).
- 순수주의 — 통과 (합의 3).
