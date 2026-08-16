# 텍스처 에셋 — 출처 · 라이선스 박제

본 디렉토리는 저장소의 **유일한 런타임 텍스처 에셋** 위치다. ADR
[`20260628-756-procedural-planet-surface.md`](../../../../docs/decisions/20260628-756-procedural-planet-surface.md)
**Amendment 4 (#1119)** 가 「에셋 0」 원칙의 **조건부 예외**를 연 결과이며, 예외의 범위는
**저해상도 육지 마스크 1장**으로 한정된다. 색 · 고도 · 구름 · 야간불빛 텍스처는 여전히
**비목표**다 (§A4.7 재검토 조건 5).

---

## `earth-land-mask.png`

지구 대륙 윤곽 마스크. 절차적 셰이더(`packages/core/src/scene/procedural-planet-shader.ts`)의
rocky 분기가 `landMask` 소스로 샘플한다 — **저주파 형상은 이 마스크, 고주파 디테일은 기존 fbm**
이라는 역할 분리가 설계의 핵심이다 (§A4.3 결정 5).

| 항목            | 값                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| 원천 데이터셋   | **Natural Earth 1:50m Physical Vectors — Land** (`ne_50m_land`)                                       |
| VERSION         | **4.1.0** (고정 — 상위 버전 도입은 §A4.7 재검토 조건 6 의 의식적 SSoT 갱신)                           |
| 취득 URL        | `https://naciscdn.org/naturalearth/50m/physical/ne_50m_land.zip`                                      |
| 취득일          | **2026-08-17**                                                                                        |
| 원천 zip SHA256 | `0b8e670cf80dce9cbebe2a193bc44ba5602758c22e1fa603980553646d7ff162`                                    |
| 좌표계 (`.prj`) | `GEOGCS["GCS_WGS_1984"] … PRIMEM["Greenwich", 0]` — WGS84 경위도                                      |
| 산출 형식       | PNG · `colorType = 0` (GRAYSCALE) · `bitDepth = 8` · 비인터레이스                                     |
| 해상도          | `1024 × 512` (equirectangular 2:1)                                                                    |
| 파일 크기       | **27,295 B**                                                                                          |
| 생성 스크립트   | [`scripts/generate-earth-land-mask.mjs`](../../../../scripts/generate-earth-land-mask.mjs)            |
| 무결성 테스트   | [`apps/web/src/core/earth-land-mask.test.ts`](../../src/core/earth-land-mask.test.ts) (네트워크 무관) |

**미러 동일성**: `https://naturalearth.s3.amazonaws.com/50m_physical/ne_50m_land.zip` 이 위 공식 CDN
파일과 **SHA256 동일**함이 2026-08-17 실측 확인됐다.

### 픽셀 규약

`x = 0 ↔ 경도 −180°` / `x = W/2 ↔ 경도 0°(본초자오선)` / `y = 0 ↔ 위도 +90°(북극)`, 픽셀 중심 샘플링.
계조는 8×8 면적평균(`round(255 · k / 64)`, `k = 0…64`)이라 **고유 계조가 정확히 65개**다 — 이 저엔트로피가
27,295 B 라는 크기의 근거이며, 다른 계조 분포가 나오면 다른 파이프라인으로 만든 파일이라는 뜻이다.

### 재생성 (네트워크 필요 — 개발자 실행 시점만, 빌드·CI 경로 아님)

```bash
node scripts/generate-earth-land-mask.mjs          # 재생성
node scripts/generate-earth-land-mask.mjs --check  # 기존 파일과 바이트 대조 (미기록)
```

---

## 라이선스 — public domain

`https://www.naturalearthdata.com/about/terms-of-use/` (2026-08-17 취득) 원문 인용:

> "All versions of Natural Earth raster + vector map data found on this website are in the public domain."

> "No permission is needed to use Natural Earth."

> "Crediting the authors is unnecessary."

권장 인용문(의무 아님): `Made with Natural Earth.`

### 각주 1 — 모순 표기를 **알고도** 채택했다

다운로드 페이지 푸터에는 `© 2009 - 2026. Natural Earth. All rights reserved.` 가 있다. 이는 사이트
전반 boilerplate 이고, terms-of-use 는 범위를 **"map data"** 로 명시해 public domain 을 선언한다.
본 채택은 후자를 근거로 한다. 미래 관찰자가 _"확인하지 않았다"_ 로 오인하지 않도록 불일치를 남긴다.

### 각주 2 — 제3자 조항은 **상류 허가**다

terms-of-use 본문에는 WaPo / EC JRC / XNR / IMA 등 제공자 관련 조항이 있고, 그 형태는 전부
**`Natural Earth is hereby granted a non-exclusive license…`** 다. 즉 **제공자 → Natural Earth**
방향의 허가이지 **Natural Earth → 사용자** 방향의 제약이 아니다. 페이지 헤드라인의 public domain
선언이 _"All versions of … map data found on this website"_ 로 무조건적이므로 하류 사용은 그 선언이
지배한다.

⚠️ **한정**: 위 판정은 **조항의 방향(상류/하류)** 에 대한 것이며, `ne_50m_land` 레이어가 그
제공자들에서 파생됐는지까지 확정한 것은 **아니다**. 결론이 서는 이유는 방향이 상류이기 때문이지
파생이 없음을 확인해서가 아니다 — 전칭으로 읽지 말 것.

### 각주 3 — `406` 은 접근 불가가 아니라 User-Agent 의존

같은 URL 을 3가지 UA 로 요청하면 **UA 미지정 `200`** / `curl/8.7.1` **`200`** / `Mozilla/5.0` **`406`**
이다 (mod_security). _"접근이 막혔다"_ 는 결론은 **요청 파라미터를 먼저 의심**한 뒤에 내려야 한다.
