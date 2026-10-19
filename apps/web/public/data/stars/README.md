# 별 카탈로그 데이터 — 출처 · 라이선스 · 형식

> 이 파일은 `scripts/generate-star-catalog.mjs` 가 생성한다. 손으로 고치지 말 것 — `--check` 가 바이트 대조로 어긋남을 잡는다.

ADR [`20261018-1373-star-catalog-constellations.md`](../../../../../docs/decisions/20261018-1373-star-catalog-constellations.md) 결정 D1 · D2 · D3 · D4 · D5.

## `star-catalog.bin`

| 항목          | 값                                                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 원천 데이터셋 | **HYG Stellar Database v4.4** (astronexus)                                                                                  |
| 취득 URL      | `https://codeberg.org/astronexus/hyg/media/commit/53e3df311869e813ace5f1ad2ec4ce909f13256c/data/hyg/CURRENT/hyg_v44.csv.gz` |
| 원천 커밋     | `53e3df311869e813ace5f1ad2ec4ce909f13256c`                                                                                  |
| 원천 sha256   | `00b349893b9a53106dd488d8371e8d2fa586043e500bb3cdb8bff3931682197d` (13,636,362 B, gzip)                                     |
| 취득일        | 2026-10-18                                                                                                                  |
| 별 수         | **8,922** = V ≤ 6.5 8,920 + 별자리 선 끝점 별 2                                                                             |
| B−V 결측      | 40                                                                                                                          |
| 파일 크기     | **107,072 B** (= 8 + 12 × 8,922)                                                                                            |
| 파일 sha256   | `96cd1025a87a046b13d49cee2618cfa0a627aae284b18bcaccc6ecc8bbcc2dbf`                                                          |
| 라이선스      | **CC BY-SA 4.0** (아래)                                                                                                     |

### 형식 (리틀 엔디언 — `DataView` 로 읽는다)

| 오프셋        | 형        | 내용                                                 |
| ------------- | --------- | ---------------------------------------------------- |
| 0             | `char[4]` | 매직 `"STC1"`                                        |
| 4             | `uint32`  | 별 수 N                                              |
| 8 + 12·i + 0  | `float32` | 적경 RA [°] (J2000 · ICRS — HYG `ra` × 15)           |
| 8 + 12·i + 4  | `float32` | 적위 Dec [°] (HYG `dec`)                             |
| 8 + 12·i + 8  | `int16`   | 실시 등급 V × 100 (HYG `mag`, 반올림)                |
| 8 + 12·i + 10 | `int16`   | 색지수 B−V × 1000 (HYG `ci`, 반올림 · 결측 `-32768`) |

좌표는 원천 그대로 적도 J2000 이다 — 황도 · 장면 변환은 코드 (`packages/core/src/coords/equatorial.ts` → `toScene`) 가 한다. 그래서 각 레코드를 원천 CSV 행과 바로 대조할 수 있다.

### 선택 · 정렬

1. 태양 (HYG `id = 0`) 을 뺀다.
2. **V ≤ 6.5** 인 별 8,920 개.
3. d3-celestial 별자리 선 정점 757 개 (중복 제거) 를 V ≤ 7.0 별 중 최근접 별에 스냅한다 (허용 60″ — 넘으면 생성 실패). 각거리 p50 0.2″ · p99 3.3″ · 최대 16.3″. 스냅된 별 중 2. 의 집합 밖에 있는 별을 더한다 (컷보다 어두운 끝점 별):

| 인덱스 | HYG id |   HIP |   HR |    V |     RA [°] |   Dec [°] |
| -----: | -----: | ----: | ---: | ---: | ---------: | --------: |
|   8920 |  42981 | 43100 | 3474 | 6.58 | 131.666595 | 28.765059 |
|   8921 |  69259 | 69481 | 5328 | 6.62 | 213.365775 | 51.787868 |

4. **정렬**: V × 100 정수 오름차순 → HYG `id` 오름차순. 이 순서가 `constellations.json` 이 참조하는 인덱스다 — 바뀌면 선이 엉뚱한 별을 잇는다. 선 원천: 89 feature · 743 선분.

### 기준 별 (단위 테스트 골든 값)

| 별         |   HR | 인덱스 |     RA [°] |    Dec [°] | V × 100 | B−V × 1000 |
| ---------- | ---: | -----: | ---------: | ---------: | ------: | ---------: |
| 시리우스   | 2491 |      0 | 101.287216 | -16.716116 |    -144 |          9 |
| 베텔게우스 | 2061 |      9 |  88.792938 |   7.407063 |      45 |       1500 |
| 북극성     |  424 |     47 |  37.946251 |  89.264107 |     197 |        636 |
| 리겔       | 1713 |      6 |  78.634468 |  -8.201640 |      18 |        -30 |
| 베가       | 7001 |      4 | 279.234589 |  38.783691 |       3 |         -1 |

### 변경 사항 (CC BY-SA 4.0 §3(a)(1)(B) 변경 표시)

원천 CSV 에서 위 선택 · 정렬을 거쳐 4개 열 (`ra` · `dec` · `mag` · `ci`) 만 남기고, `ra` 를 시에서 도로 바꾸고, 위 형식으로 양자화했다 (RA · Dec float32 · V · B−V 고정소수점 int16). 나머지 열은 버렸다.

## `constellations.json`

| 항목               | 값                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| 원천               | **d3-celestial** (Olaf Frohn) 커밋 `7e720a3de062059d4c5400a379146a601d9010e0`                                           |
| 선                 | `data/constellations.lines.json` — sha256 `294f66bef5d5cf50b1e17f16d2efa1d97a15131612c68dd935adef6e7373e13c` (27,136 B) |
| 이름 · 라벨 기준점 | `data/constellations.json` — sha256 `ab4ae692027cbc042c0d6791a84456a65eb7c55656107fd00c58ff6e55d4d8b2` (50,581 B)       |
| 별자리             | **88** (원천 89 feature — 뱀자리 머리 · 꼬리를 1개로)                                                                   |
| 선분               | **743**                                                                                                                 |
| 파일 크기          | 17,786 B                                                                                                                |
| 파일 sha256        | `2f5e6f628889f5e5ae2c5cbc6761907b92af020615fd94ae684333a0349860a4`                                                      |
| 라이선스           | **BSD-3-Clause** (아래)                                                                                                 |

### 형식 (JSON)

- `format` — `"CNS1"`.
- `starCatalog` — 인덱스가 가리키는 `star-catalog.bin` 의 sha256 · 별 수. 런타임은 이 값을 읽지 않는다 (무결성 테스트가 대조한다).
- `constellations[]` — `id` (IAU 약어) · `nameKo` (한국어 이름) · `label` (라벨 기준점 `[RA°, Dec°]`, J2000 — d3 `geometry.coordinates` 의 RA 를 [0, 360) 로 펼친 값) · `lines` (별 인덱스 평면 배열 — 연속 2개가 선분 1개).

선 정점 좌표는 담지 않는다 — 런타임이 로드한 `star-catalog.bin` 에서 인덱스로 읽는다 (선 끝이 그려진 별과 정확히 만난다). 인덱스는 위 「선택 · 정렬」 3 의 스냅 결과다.

### 변경 사항

- 선: d3 polyline 정점 좌표를 `star-catalog.bin` 인덱스로 바꿨다 (최근접 별 스냅). 뱀자리 두 조각은 한 항목으로 합쳤다.
- 이름: d3 `ko` 를 출발점으로, 아래 항목만 바꿨다 (한국천문연구원 · 한국천문학회 표기 대조 — 이슈 #1373 PR2 대조표). 라벨 기준점은 뱀자리 머리 쪽 1개.

| IAU | d3 `ko`      | 사용           |
| --- | ------------ | -------------- |
| Her | 허큘리스자리 | 헤르쿨레스자리 |
| Cyg | 고니자리     | 백조자리       |

## 재생성 (네트워크 필요 — 개발자 실행 시점만, 빌드 · CI 경로 아님)

```bash
node scripts/generate-star-catalog.mjs          # 재생성
node scripts/generate-star-catalog.mjs --check  # 기존 파일과 바이트 대조 (미기록)
```

원천 세 파일 (HYG CSV · d3 선 · d3 이름) 의 sha256 은 스크립트 상수다. 다운로드 직후 대조하고 다르면 중단한다.

## 라이선스

### HYG Stellar Database — CC BY-SA 4.0

`star-catalog.bin` 은 HYG v4.4 의 파생 데이터이며 **CC BY-SA 4.0** 으로 배포한다 (저장소 코드의 MIT 와 별개). 원천 `data/hyg/CURRENT/LICENSE` (`https://codeberg.org/astronexus/hyg/raw/commit/53e3df311869e813ace5f1ad2ec4ce909f13256c/data/hyg/CURRENT/LICENSE`) 원문:

> Shield: [![CC BY-SA 4.0][cc-by-sa-shield]][cc-by-sa]
>
> This work is licensed under a
> [Creative Commons Attribution-ShareAlike 4.0 International License][cc-by-sa].
>
> [![CC BY-SA 4.0][cc-by-sa-image]][cc-by-sa]
>
> [cc-by-sa]: http://creativecommons.org/licenses/by-sa/4.0/
> [cc-by-sa-image]: https://licensebuttons.net/l/by-sa/4.0/88x31.png
> [cc-by-sa-shield]: https://img.shields.io/badge/License-CC%20BY--SA%204.0-lightgrey.svg

출처 표기: HYG Stellar Database v4.4 (astronexus) — https://codeberg.org/astronexus/hyg — CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/).

### d3-celestial — BSD-3-Clause

`constellations.json` 은 d3-celestial 의 별자리 선 (`constellations.lines.json`) · 이름 · 라벨 기준점 (`constellations.json`) 의 파생 데이터다. 선 정점은 `star-catalog.bin` 의 끝점 별 선택에도 쓴다. 원문 `LICENSE` (`https://raw.githubusercontent.com/ofrohn/d3-celestial/7e720a3de062059d4c5400a379146a601d9010e0/LICENSE`):

> Copyright (c) 2015, Olaf Frohn
> All rights reserved.
>
> Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
>
> 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
>
> 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
>
> 3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.
>
> THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
