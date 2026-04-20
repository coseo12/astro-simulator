# P10-B 데이터 감사 방법론

> **Phase**: P10-B (Fact Audit — IAU 2015 전수 대조)
> **Issue**: [#274](https://github.com/coseo12/astro-simulator/issues/274)
> **Date**: 2026-04-20 (방법론 박제)
> **Subphases**:
>
> - **B-1** (현재): 타입 확장 + verify-iau-data 스켈레톤 + 방법론 박제
> - **B-2**: IAU 2015 전수 대조 + JSON 수정 + radius 정의 감사
> - **B-3**: colorSource 3종 분류 + 최종 감사 보고서 + CI 통합

---

## 목적

Fact-First 원칙 ([docs/principles/fact-first.md](../principles/fact-first.md)) 의 "데이터 무결성 + IAU 2015 ±0.01% 공차" 를 **수동 대조가 아닌 자동 검증** 으로 박제. `verify-iau-data.mjs` 가 회귀 가드 역할.

## 감사 대상 (24 bodies 현재 JSON 기준)

| 카테고리    | 대상                                             | 수  |
| ----------- | ------------------------------------------------ | --- |
| 항성        | 태양                                             | 1   |
| 행성        | 수성~해왕성                                      | 8   |
| 주요 위성   | 달 (지구계) + Galilean 4 (목성계) — P9 까지 도입 | 5   |
| 왜소행성    | 명왕성 등 (현 JSON 상태 확인 필요)               | ?   |
| 탐사선/기타 | (현 JSON 상태 확인 필요)                         | ?   |

**총 24 bodies** (verify-iau-data.mjs 출력 기준). B-2 에서 분류별 집계 확정.

## 정밀도 기준 (Fact-First 원칙 §2 재진술)

| 기준     | 내용                                                               |
| -------- | ------------------------------------------------------------------ |
| **1차**  | IAU 2015 Resolution B3 — Nominal Values for Stars, Planets, Bodies |
| **2차**  | NASA JPL Horizons / JPL SSD Planetary Fact Sheet                   |
| **3차**  | Peer-reviewed 최신 관측 논문 (IAU 공식값 없는 body 한정)           |
| **공차** | ±0.01% (IAU 공식값 대비, 상대 오차)                                |

## 감사 필드

각 body 에 대해 다음 3가지 축으로 대조:

### 1. 질량 (mass)

- 단위: kg
- IAU 2015 출처: Resolution B3 §1 (Sun), §2 (Earth), §3 (Jupiter) 등
- JSON 필드: `mass`

### 2. 반경 (radius) — **정의 감사 필요 (B-2 전제 작업)**

- 단위: m
- **B-1 발견 이슈**: IAU 2015 는 **equatorial radius** (`R_X_N`), JSON 은 **volumetric mean radius** 사용. 목성 비교 시 2.21% 차이.
- B-2 감사 결정 필요:
  - 옵션 A: JSON 을 IAU equatorial 로 통일 → 렌더링 시 평균 반경으로 쉽게 역산 가능
  - 옵션 B: JSON 에 `radiusEquatorial` / `radiusPolar` / `radiusMean` 3필드 분리
  - 옵션 C: 단일 `radius` 유지 + `radiusDefinition: 'equatorial' | 'mean' | 'polar'` 필드로 자기-기술

### 3. 궤도 요소 (orbit)

- 단위: AU, degrees
- IAU 2015 는 궤도 요소를 직접 정의하지 않음 → **JPL Horizons DE440** 또는 **Standish & Williams 1992** 기준
- JSON 현재 소스: `"JPL/Standish ephemeris (DE440 근사치, 장기 평균)"`

## 필드 확장 (P10-B-1 완료)

`packages/shared/src/types/celestial.ts` + `packages/core/src/ephemeris/solar-system-loader.ts` zod 스키마에 추가 (optional 단계):

```ts
export interface CelestialBody {
  // ...기존 필드...
  dataSource?: string | readonly string[]; // 예: "IAU 2015" 또는 배열
  lastVerified?: string; // ISO YYYY-MM-DD
  uncertainty?: Uncertainty; // IAU 공식값 없는 body 필수 (B-3 에서 승격)
  epoch?: string | number; // body 별 epoch (root 와 다를 때만)
  colorHint?: {
    hex?: string;
    temperatureK?: number;
    colorSource?: 'observed' | 'artistic' | 'inferred'; // Gemini 교차검증 수용
  };
}
```

## 자동 검증 (P10-B-1 스켈레톤 완료)

### 스크립트

`scripts/verify-iau-data.mjs`:

- **구조 검증**: `dataSource` / `lastVerified` / `colorHint.colorSource` 부재 경고
- **IAU 값 대조**: 현재 3 body (sun / earth / jupiter) — B-2 에서 전수 확장
- **공차**: ±0.01%
- **모드**:
  - 기본: 콘솔 요약 + mismatch warning
  - `--report`: JSON 출력 (전체 이슈)

### 실행

```bash
node scripts/verify-iau-data.mjs           # 콘솔 요약
node scripts/verify-iau-data.mjs --report  # JSON 리포트
```

### npm script (package.json)

```json
"verify:iau-data": "node scripts/verify-iau-data.mjs"
```

### CI 통합 (B-3 예정)

- `verify:iau-data` 를 `verify-and-rust` 또는 별도 워크플로 step 으로 추가
- B-3 에서 severity 를 error 로 승격 후 PR 머지 게이트로 작동

## 감사 절차 (B-2 착수 시 체크리스트)

각 body 에 대해 순차 수행:

1. **IAU 2015 Resolution B3 대조**
   - 태양·지구·목성: 직접 명시 (§1, §2, §3)
   - 기타 행성: Resolution B3 Table 1 + 2 참조
   - 위성: IAU WGPSN (Working Group for Planetary System Nomenclature) 자료
2. **mass 대조** — 공차 초과 시 JSON 수정
3. **radius 정의 결정** (B-2 초기 설계 결정)
   - equatorial vs mean vs polar 중 어느 쪽을 `radius` 필드로 할지
   - 필요 시 필드 분리
4. **dataSource / lastVerified 필드 기록**
5. **uncertainty 필드 기록** (IAU 공식값 없는 body)
6. **colorSource 분류** (observed / artistic / inferred)

## 예외 처리

- **탐사선 (spacecraft)**: 질량 변동 (연료 소진 등) → `uncertainty.mass` 로 표현
- **혜성 (comet)**: 반경·질량 관측 부정확 → `uncertainty` 필수
- **외곽 위성·소행성**: 관측 데이터 부재 → `colorSource: 'inferred'` + `uncertainty` 필수

## B-1 산출물 체크리스트

- [x] 타입 확장 (`celestial.ts`): `ColorSource` / `DataSource` / `IsoDate` / `Uncertainty` 타입 + `CelestialBody` 필드 확장
- [x] zod 스키마 확장 (`solar-system-loader.ts`): 모든 신규 필드 optional
- [x] 로더 pass-through: `LoadedCelestialBody` 에 신규 필드 전파
- [x] `verify-iau-data.mjs` 스켈레톤: 구조 검증 + 3 body IAU 대조 + `--report` 플래그
- [x] typecheck 통과 (exactOptionalPropertyTypes 준수)
- [x] 본 방법론 문서 박제

## 다음 (B-2) 선행 조건

- B-1 PR 머지
- radius 정의 결정 (equatorial / mean / polar 필드 분리 여부)
- IAU 2015 Table 1, 2 전수 전산화 (B-1 의 3 body → 전체 24 body 확장)

## 참조

- 원칙: [docs/principles/fact-first.md](../principles/fact-first.md)
- 계약: [docs/phases/p10-plan.md](../phases/p10-plan.md) §P10-B
- 이슈: [#274](https://github.com/coseo12/astro-simulator/issues/274)
- 교차검증 수용 근거: PR #273 (Gemini 2차)
- IAU 2015 Resolution B3: https://www.iau.org/static/resolutions/IAU2015_English.pdf
