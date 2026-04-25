# ADR: R1 UI 회귀 가드 — 요소 단위 pixel diff 알고리즘 + 임계값 + crop 영역

- **상태**: Accepted
- **날짜**: 2026-04-25
- **결정자**: architect (#329 R1 PM 합의 라운드 2 후 위임)
- **관련**: #329 (본 R1 스프린트), `20260425-r1-sun-visualization.md` (시각화 결정 — 본 ADR 의 회귀 가드는 시각화 변경의 비-회귀 검증), volt [#74](https://github.com/coseo12/volt/issues/74) (UX 가시성 회귀 — 본 가드의 도입 동기)
- **교훈 적용**: "신규 함수 ≠ 신규 구현" (`pixelmatch` / `playwright` / `sharp` 모두 이미 dependency 에 존재 — 신규 라이브러리 0), "신규 데이터 ≠ 신규 코드 — ADR 예측 재현" (R2~R10 추가 시 baseline 1세트 + crop 정의 N개 추가만으로 가드 작동), "주석 계약 vs 구현 drift" (crop 영역 정의 = 단일 SSoT 모듈), "headless 브라우저 검증 ≠ 실 브라우저" (pixel diff 는 자동 회귀 감지일 뿐, 실 Chrome 수동 검증을 대체 불가 — DoD 분리 명시), "CI 통과 ≠ 테스트 실행" (CI 등록 시 실제 diff 출력이 로그에 나타나는지 감사 의무)

---

## 통합 vs 분리 결정

본 ADR 은 시각화 결정 (`20260425-r1-sun-visualization.md`) 과 **분리**.

근거:

- **책임 직교** — 시각화 ADR 은 "태양이 어떻게 보일까", 본 ADR 은 "UI 영역의 시각이 의도치 않게 변하면 어떻게 감지할까". sunScale 값을 변경해도 가드 인프라는 그대로
- **R2~R10 공통 사용** — 본 ADR 의 pixel diff 가드는 **모든 R-Phase 가 사용**. R2 (수성) 추가 시 baseline + crop 정의만 추가, 알고리즘/임계값 로직 재사용
- **롤백 독립** — pixel diff 임계값을 너무 엄격하게 잡아 false positive 가 잦으면 본 ADR 만 Amendment, 시각화 결정에 영향 없음

---

## 배경

### PM 합의 입력 (#329 라운드 2)

- **Q2**: 회귀 가드 = **UI 요소 단위 pixel diff** (HUD / 상단 네비 / shortcut bar)
- **Q2 비-범위**: DOM 시맨틱 회귀 검증 미도입

### Baseline 자산

[`docs/baselines/`](../baselines/) 에 2026-04-25 시점 UI baseline 2장:

- `2026-04-25-current-ui-default.png` — 기본 진입 (`/`)
- `2026-04-25-current-ui-focus-earth.png` — `?focus=earth` (현재는 default 와 동일, focus 무시 상태)

이슈 본문에 명시된 UI 영역 (`docs/baselines/README.md` §"현재 UI 구성 요소"):

- 상단 네비: `astro-simulator / 관찰 / 연구 / 교육 (P2+예정) / 샌드박스 (P2+예정) / 태양 / 지구 / 목성 / 해왕성 / reset`
- 상단 우측 HUD: 날짜 입력 / 점프 / SI/AU/Nat / Kepler/Newton/Barnes-Hut/WebGPU/Auto / 북마크
- 좌상: JD (Julian Date)
- 우상: `renderer · webgpu` 배지
- 우측: 거리 표시
- 좌하: N 버튼 (카메라 reset)
- 우하: `정확도 · T1 관측` HUD
- 하단: 시간 컨트롤

### 기존 자산 재사용 조사 ("신규 함수 ≠ 신규 구현")

| 자산                                                    | 위치                   | 본 ADR 처리                                                    |
| ------------------------------------------------------- | ---------------------- | -------------------------------------------------------------- |
| `pixelmatch ^7.1.0`                                     | `package.json` devDeps | **재사용** — pixel-by-pixel diff 알고리즘 (anti-aliasing 인식) |
| `pngjs ^7.0.0`                                          | `package.json` devDeps | **재사용** — PNG 디코딩 (pixelmatch 입력)                      |
| `sharp` (onlyBuiltDependencies)                         | `package.json`         | **재사용** — crop / resize (영역 추출)                         |
| `playwright ^1.59.1`                                    | `package.json` devDeps | **재사용** — 스크린샷 캡처                                     |
| `apps/web/scripts/p290-browser-verify.mjs`              | 동 파일                | **패턴 재사용** — playwright 셋업 / `__simStore` 전역 활용     |
| `apps/web/scripts/__baselines__/lod-*.png` (9 baseline) | 동 디렉토리            | **패턴 참조** — 기존 baseline 폴더 컨벤션 (R1 은 신규 폴더)    |

**신규 구현 (모두 자체 작성, 외부 라이브러리 추가 0)**:

- `apps/web/scripts/r1-ui-regression-guard.mjs` (~150 라인) — 3개 viewport × 2 시나리오 캡처 + 4 영역 crop + pixel diff
- `apps/web/scripts/__baselines__/r1/` (신규 디렉토리) — 4 영역 × 3 viewport × 1 시나리오 = 12장 PNG baseline
- `apps/web/scripts/r1-ui-regions.mjs` (신규, ~30 라인) — UI 영역 정의 SSoT (CSS selector + 폴백 좌표)

---

## 후보 비교

### 축 1 — Pixel Diff 알고리즘

**후보**:

| 후보                       | 라이브러리          | 정밀도                        | 폰트 렌더링 차이 false positive | 평가                                       |
| -------------------------- | ------------------- | ----------------------------- | ------------------------------- | ------------------------------------------ |
| **A. pixelmatch**          | `pixelmatch ^7.1.0` | per-pixel (RGBA 차) + AA 인식 | 낮음 (threshold 0.1 권고)       | **선택** — 이미 설치됨, AA 인식            |
| B. SSIM                    | `ssim.js` (미설치)  | 구조 유사도 (2D 윈도우)       | 매우 낮음                       | 신규 의존 추가 + 임계값 직관 어려움        |
| C. 단순 RMS                | 자체 구현           | 픽셀 평균 제곱 오차           | 매우 높음 (1px shift = 큰 RMS)  | **탈락** — 폰트 sub-pixel shift 흡수 못 함 |
| D. perceptual hash (pHash) | `imghash` (미설치)  | DCT 64bit hash                | 너무 흡수 (의도 변화도 놓침)    | **탈락** — 회귀 검출 민감도 부족           |

**선택 (A) 근거**:

1. **이미 설치됨** — `package.json` devDeps. 신규 라이브러리 추가 0 (CRITICAL #1 사용자 명시 지시 + CLAUDE.md 검증되지 않은 외부 패키지 무단 추가 금지)
2. **anti-aliasing 인식** — pixelmatch v6+ 의 `includeAA: false` 옵션은 AA pixel 을 무시. 폰트 렌더링 OS 차이 (macOS sub-pixel vs CI Linux grayscale) 가 false positive 일으키지 않음
3. **threshold 직관적** — 0.0 ~ 1.0 단일 숫자, `0.1` 이 권고 (lib README), 0.0 은 perceptually identical 강제. 실험 친화
4. **diff 이미지 출력** — 차이 픽셀을 빨간색으로 표시한 PNG 생성 (디버깅 용)

### 축 2 — 임계값 (mismatchedPixels / totalPixels)

**기준**:

- 폰트 렌더링 sub-pixel shift / icon AA 차이는 0.1% 미만
- 의도하지 않은 UI 변경 (버튼 크기 변경, 텍스트 변경) 은 1% 이상

**후보**:

| 임계값 (mismatch 비율) | 폰트 sub-pixel false positive | 1글자 텍스트 변경 검출   | 평가      |
| ---------------------- | ----------------------------- | ------------------------ | --------- |
| ≤ 0.1%                 | 가끔 (CI Linux 폰트 차이)     | ✓                        | 너무 엄격 |
| **≤ 0.5%**             | 거의 없음                     | ✓                        | **선택**  |
| ≤ 2.0%                 | 없음                          | △ (1글자 미세 변경 놓침) | 너무 관대 |

`pixelmatch` 의 `threshold` 파라미터는 **0.1** (per-pixel color distance), `mismatchedPixels / totalPixels ≤ 0.005` (0.5%) 가 영역 단위 회귀 가드 임계.

**선택**: `pixelmatch threshold = 0.1`, `mismatchedPixels / totalPixels ≤ 0.005` (0.5%)

### 축 3 — Crop 영역 정의 방식

**후보**:

| 후보                             | 변경 robust                           | 코드 가독성   | 평가                                                         |
| -------------------------------- | ------------------------------------- | ------------- | ------------------------------------------------------------ |
| A. 픽셀 좌표                     | 약함 — UI 위치 변경 시 매번 갱신      | 직관          | viewport 별로 좌표 다름 + 미래 layout shift 시 갱신 부담     |
| **B. CSS selector**              | **강함** — selector 안정 시 자동 추적 | DOM 의미 명확 | **선택** — `data-r1-region="hud"` 등 박제 selector 패턴 활용 |
| C. 혼합 (selector → boundingBox) | 강함 + 픽셀 fallback                  | 복잡          | 후보 B 가 안되는 영역에서만 fallback                         |

**선택**: **후보 C — CSS selector 우선, 없으면 좌표 fallback** (혼합)

근거:

- 대부분 UI 영역은 React 컴포넌트가 명확한 DOM 노드 (`<nav>`, `<aside>`, `<footer>`) — selector 안정
- 일부 영역 (HUD 좌상단 JD 표시 등) 은 floating absolute, selector 가 복잡할 수 있음 — 좌표 fallback
- developer 가 R1 PR 에서 selector 가 안정한지 확인 후 정의. 좌표 fallback 은 **안정 selector 가 정말 없는 경우에만** 사용

### 축 4 — UI 영역 (R1 baseline 대상)

PM 합의 (#329 Q2): **HUD / 상단 네비 / shortcut bar 3 영역**.

**Architect 추가 권고**: 우하단 `정확도 · T1 관측` 도 Data Tier 배지로 회귀 영향 — 4 영역으로 확장 권고 (PM 비-범위 위배 아님, 같은 카테고리 "HUD" 의 내부 분할).

**최종 4 영역**:

| ID                 | DOM selector 후보 (developer 검증 필요) | 좌표 fallback (1280×720) | 비고                                 |
| ------------------ | --------------------------------------- | ------------------------ | ------------------------------------ |
| `top-nav`          | `nav` 또는 `[data-r1-region="top-nav"]` | (0, 0, 1280, 56)         | astro-simulator / 관찰 / ... / reset |
| `shortcut-bar`     | `[data-r1-region="shortcut-bar"]`       | (구역 추출 시점에 결정)  | 태양/지구/목성/해왕성 4 버튼         |
| `hud-top-right`    | `[data-r1-region="hud-top-right"]`      | (1024, 56, 1280, 200)    | 날짜/점프/SI/AU/엔진/북마크 등       |
| `hud-bottom-right` | `[data-r1-region="hud-bottom-right"]`   | (1024, 600, 1280, 720)   | 정확도 · T1 관측 배지                |

**중앙 캔버스 (3D scene)** 는 회귀 대상 **제외** (sun mesh 추가가 의도 변화). PM Q2 옵션 B 와 일치.

### 축 5 — 3 viewport × 시나리오 매트릭스

**완료 기준 충돌 가드**: `시각화 ADR §결정 1` 의 viewport 점유율 표가 1280×720 / 1920×1080 / 375×667 3개 기준이므로 동일 viewport 매트릭스 사용:

| 시나리오                    | 1280×720 | 1920×1080 | 375×667 (모바일) |
| --------------------------- | -------- | --------- | ---------------- |
| `default` (`/`)             | ✓        | ✓         | ✓                |
| `focus-sun` (`/?focus=sun`) | ✓        | ✓         | ✓                |

**baseline 12장** (4 영역 × 3 viewport, default 시나리오만 회귀 가드 — focus-sun 은 sunScale 적용 의도 변화이므로 baseline 만 캡처하고 회귀 가드는 default 만 적용).

> **중요**: focus-sun 시나리오에서는 **태양 mesh 영역** 이 baseline 대비 변경됨 (sunScale 적용). 본 회귀 가드는 **상단 네비 / shortcut / HUD 4영역만** 비교, 캔버스 영역은 비교 대상 제외.

### 축 6 — Baseline 갱신 정책

**후보**:

| 후보                                           | 의도 변경 시 부담 | false positive 무시 위험       |
| ---------------------------------------------- | ----------------- | ------------------------------ |
| A. 매 PR 자동 갱신                             | 0                 | **매우 높음** — 회귀 박제 못함 |
| **B. 명시적 `--update` 플래그 + PR 본문 명시** | 낮음 (한 줄 추가) | 낮음                           |
| C. 버전 태그 (`v1.0-baseline`)                 | 중간              | 낮음                           |

**선택**: **후보 B — `r1-ui-regression-guard.mjs --update` 플래그 + PR 본문에 갱신 사유 명시 의무**.

R1 PR 자체에서 sunScale 적용 결과 4 영역에 변화 없음을 확인한 후, 만약 의도된 UI 영역 변경 (예: shortcut-bar 에 새 body 추가) 시 `--update` 로 baseline 갱신 + PR 본문에 사유 박제 (코드 주석 + PR + CHANGELOG 3 위치 박제 — CLAUDE.md 스프린트 계약 §7).

---

## 결정

### 결정 1 — 알고리즘 / 임계값

```javascript
// apps/web/scripts/r1-ui-regression-guard.mjs (요약)
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const PIXELMATCH_THRESHOLD = 0.1; // per-pixel color distance
const MISMATCH_RATIO_LIMIT = 0.005; // 0.5%

function compareRegion(baselinePng, currentPng, regionId) {
  const { width, height } = baselinePng;
  const diff = new PNG({ width, height });
  const mismatched = pixelmatch(baselinePng.data, currentPng.data, diff.data, width, height, {
    threshold: PIXELMATCH_THRESHOLD,
    includeAA: false,
  });
  const ratio = mismatched / (width * height);
  return { regionId, mismatched, ratio, pass: ratio <= MISMATCH_RATIO_LIMIT, diff };
}
```

### 결정 2 — UI 영역 SSoT 모듈

`apps/web/scripts/r1-ui-regions.mjs` (단일 SSoT — 주석 계약 vs 구현 drift 방어):

```javascript
/**
 * R1 #329 — UI 회귀 가드 영역 정의.
 *
 * CSS selector 우선, 없으면 좌표 fallback. R2~R10 에서 영역 추가 시 본 파일에만 박제.
 *
 * 좌표 fallback 은 1280×720 viewport 기준. 다른 viewport 는 selector 가 우선이어야 함
 * (selector 미발견 시 viewport-relative 좌표 변환은 신규 ADR 필요 — 현재 R1 범위 밖).
 */
export const R1_UI_REGIONS = Object.freeze([
  {
    id: 'top-nav',
    selector: '[data-r1-region="top-nav"]',
    fallback1280x720: { x: 0, y: 0, width: 1280, height: 56 },
  },
  {
    id: 'shortcut-bar',
    selector: '[data-r1-region="shortcut-bar"]',
    // fallback null 의도: 이 영역은 동적으로 위치가 결정될 가능성이 높아 CSS Selector 사용을 강력 권장.
    // selector 가 실제로 작동 불가능한 경우에만 (developer 가 R1 PR 시점에 검증) 좌표 측정 후 기입.
    // null 유지 = "selector 가 항상 작동" 보장, 좌표 fallback 자체를 차단 (CRITICAL #6 비-범위 가드).
    fallback1280x720: null,
  },
  {
    id: 'hud-top-right',
    selector: '[data-r1-region="hud-top-right"]',
    fallback1280x720: { x: 1024, y: 56, width: 256, height: 144 },
  },
  {
    id: 'hud-bottom-right',
    selector: '[data-r1-region="hud-bottom-right"]',
    fallback1280x720: { x: 1024, y: 600, width: 256, height: 120 },
  },
]);
```

### 결정 3 — Baseline 디렉토리 구조

```
apps/web/scripts/__baselines__/r1/
├── 1280x720/
│   ├── top-nav.png
│   ├── shortcut-bar.png
│   ├── hud-top-right.png
│   └── hud-bottom-right.png
├── 1920x1080/
│   ├── (4장)
└── 375x667/
    └── (4장)
```

총 12장. 별도 `default` 시나리오만 baseline. `?focus=sun` 시나리오는 baseline 캡처는 하되 회귀 가드 대상 아님 (developer 가 시각 검증용으로 보관).

### 결정 4 — 실행 / CI 통합

**스크립트 시그니처**:

```bash
# 회귀 가드 실행 (기본):
pnpm r1-guard
# = node apps/web/scripts/r1-ui-regression-guard.mjs

# Baseline 갱신:
pnpm r1-guard -- --update

# 특정 viewport 만:
pnpm r1-guard -- --viewport=1280x720
```

**CI 통합**:

- `package.json` `scripts.test:r1-guard`: `node apps/web/scripts/r1-ui-regression-guard.mjs` 추가
- `.github/workflows/ci.yml` 의 `detect-and-test` 또는 별도 job 에 등록 (CLAUDE.md "CI 통과 ≠ 테스트 실행" 교훈 — 등록 후 실제 실행 로그 확인)
- baseline 미존재 시 fail (silent skip 금지)

### 결정 5 — Sun 점유율 측정 통합

시각화 ADR `20260425-r1-sun-visualization.md` §결정 1 의 점유율 예측표 (3.87% / 6.18% / 19.6%) 를 동일 스크립트에서 측정:

- playwright `page.evaluate(() => { ... bounding box ... })` 로 sun mesh canvas 영역 측정
- 또는 brightness threshold 로 사각형 inscribed circle 추출
- 점유율 측정값을 PR 본문 + 본 ADR §결과·재검토 조건 박제

---

## 결과·재검토 조건

### Concrete Prediction (R2~R10 가드 인프라 재사용)

> **Prediction**: R2 (수성) 추가 시 `apps/web/scripts/r1-ui-regions.mjs` 에 `mercury-shortcut-button` 같은 신규 영역 정의가 **필요할 수도 있고 (shortcut bar 변경 시) 필요하지 않을 수도 있다 (변경 없으면 본 ADR 의 4 영역 그대로 유효)**. 본 ADR 의 알고리즘 / 임계값 / baseline 디렉토리 구조 / CLI 인터페이스 / pixelmatch 라이브러리 — **0 변경**.

검증 절차 (R2 PR 에서 자동 재현):

```bash
# R2 PR 에서 실행:
git diff develop...HEAD -- apps/web/scripts/r1-ui-regression-guard.mjs
# 변경 라인 = 0 (가드 알고리즘 자체) 이어야 Prediction 성공

# baseline 영역 정의 (r1-ui-regions.mjs) 는 변경 가능 (R2 데이터 추가)
```

### 회귀 가드 자체의 회귀 가드 (메타)

본 가드 스크립트가 **CI 에서 실제로 실행되는지** 정기 감사 필수 (CLAUDE.md "CI 통과 ≠ 테스트 실행" 교훈):

- R1 PR 머지 후 1주 내 고의적 false positive PR (예: shortcut 라벨 1글자 변경) 로 가드가 실제 fail 하는지 실증 후 revert
- Actions 로그에 `pixelmatch 결과 / 영역별 mismatched ratio` 출력이 나타나는지 분기 1회 감사

### 재검토 트리거

다음 조건 중 하나면 본 ADR 재검토:

1. CI Linux 폰트 렌더링 차이로 false positive 발생률 > 10% (PR 의 의도 외 변경 무시) — 임계값 조정 또는 SSIM 전환 검토
2. R-Phase 진행에서 의도된 layout shift 가 잦아 baseline 갱신 부담 > PR 당 1회 — selector 안정성 강화 또는 영역 정의 재구조화
3. crop 영역 정의가 viewport 별 차이로 하드코딩 좌표 fallback 이 실제로 자주 사용됨 — viewport-relative 좌표 변환 신 ADR
4. pixel diff 가 missing 한 회귀 (예: animation timing 변경) 가 발생 — DOM 시맨틱 회귀 검증 (Q2 옵션 C) 추가 도입 ADR
5. **CI 실행 시간이 N분 (잠정 5분) 초과** (Gemini 교차검증 개선 제안 4) — viewport 추가 / 시나리오 추가 / 영역 추가 누적으로 CI 회귀 가드 step 이 5분을 초과하면 병렬화 / shard / on-demand trigger 검토 ADR

### 위험 / 미해결

- **모바일 (375×667) 가드의 신뢰성** — 모바일은 viewport 작아 픽셀 변동 비율이 데스크톱 대비 크게 나타날 수 있음. 임계값 0.5% 가 모바일에서 너무 엄격할 가능성. R1 PR 에서 실측 후 viewport 별 임계값 차등 검토 가능
- **Selector 안정성** — `data-r1-region="..."` attribute 박제는 R1 PR 에서 처음 도입. developer 가 모든 영역에 안정 selector 부착 책임. 일부 라이브러리 컴포넌트 (예: shadcn-ui) 가 selector 변경 시 가드 깨짐. R2 PR 에서 R1 layout 변경 시 selector 유지 의무 박제
- **focus-sun 시나리오의 baseline 미사용** — 미래에 sun-related UI 가 추가되면 focus-sun 시나리오도 회귀 가드 대상으로 승격 필요. 본 R1 에서는 **baseline 캡처만** (가드 활성화는 후속)
- **CI 환경 폰트** — Linux CI 의 폰트 (DejaVu / Noto) 가 macOS 개발 환경 (San Francisco) 과 다른 경우 baseline 갱신 시점에 따라 영향. R1 baseline 은 **CI 환경에서 1회 캡처 후 박제** 권고 (PR 내에서 GitHub Actions 로 baseline 생성 + 동일 CI 환경에서 회귀 검증)

---

### 교차검증 반영 사항

본 ADR 박제 직후 cross-validate 1회 (Gemini 2.5 Pro, 2026-04-25). outcome=applied.

**합의** — Claude 설계와 일치 + 본 PR 에 반영:

- **이미 설치된 라이브러리 재사용 (§축 1 후보 A)** — Gemini 가 "신규 라이브러리 0 원칙을 준수하는 최적의 결정" 으로 합의
- **CSS selector 우선 + 좌표 fallback (§축 3 후보 C)** — Gemini 가 "깨지기 쉬운 픽셀 좌표 방식의 단점을 명확히 인지" 로 합의
- **`--update` 플래그 명시적 갱신 정책 (§축 6 후보 B)** — Gemini 가 "의도치 않은 변경이 실수로 baseline 이 되는 것을 막는 핵심적인 안전장치" 로 합의
- **CI 환경에서 baseline 캡처 (§위험·미해결)** — Gemini 가 "매우 중요한 위험 완화 전략" 으로 강하게 합의

**이견 수용** — Claude 원안 보강:

- **CI 실패 시 diff 이미지 artifact 등록 (Gemini 개선 제안 1)** — Claude 원안에서는 diff 이미지 생성만 명시. Gemini 가 "PR 리뷰 화면에서 바로 시각적 차이를 다운로드하여 확인" 의 가치 지적. **수용** — Developer 인계에 `actions/upload-artifact` 스텝 추가 명시
- **Baseline 부트스트래핑 절차 (Gemini 개선 제안 3)** — Claude 원안 §위험·미해결 마지막 항목 "CI 환경에서 1회 캡처 후 박제" 만으로는 닭과 달걀 문제 해결 절차 불명. **수용** — Developer 인계 단계 4 에 명확한 부트스트래핑 단계별 절차 추가
- **`shortcut-bar` fallback null 명확화 (Gemini 개선 제안 2)** — Claude 원안은 "developer 결정 시점에 채울 것" 으로만 표기. **수용** — §결정 2 코드 주석 보강
- **성능 모니터링 재검토 트리거 (Gemini 개선 제안 4)** — viewport / 시나리오 / 영역이 늘어나면 CI 실행 시간 증가 가능. **수용** — §재검토 트리거에 항목 5 추가

**Claude 재분석으로 기각한 Gemini 제안**: 없음 (모두 합리적, 본 ADR 은 모두 합의 또는 부분 수용으로 처리)

**고유 발견 (후속 분리)**: 없음 (모두 본 PR 범위 내 처리 가능)

---

## Developer 인계

**시작 지점**:

1. `apps/web/src/components/layout/` 또는 동등 위치의 React 컴포넌트에 `data-r1-region="..."` attribute 4개 부착 (4 영역)
2. `apps/web/scripts/r1-ui-regions.mjs` 신규 작성 (위 §결정 2)
3. `apps/web/scripts/r1-ui-regression-guard.mjs` 신규 작성 (~150 라인) — playwright + pixelmatch + sharp crop
4. baseline 12장 생성 — **부트스트래핑 절차** (Gemini 교차검증 개선 제안 3 반영, 닭과 달걀 문제 해결):
   - (a) `r1-ui-regression-guard.mjs` + 영역 정의만 먼저 푸시 (baseline 부재 → CI fail 예상)
   - (b) `.github/workflows/r1-baseline-bootstrap.yml` 수동 실행 가능한 workflow 트리거 (workflow_dispatch — CLAUDE.md "workflow_dispatch 2단계 함정" 교훈 적용: default branch 반영 후에만 dispatch 가능, R1 PR 머지 후 develop → main release 필요)
   - **대안 권고 (부트스트래핑 단순화)**: workflow_dispatch 지연 회피 위해 R1 PR 시점에 **로컬 macOS 환경에서 baseline 1차 박제 + CI 첫 회귀 시 PR 본문에 "허용 false positive 1회"** 표기 후 CI 갱신 PR 분리 방식도 가능. developer 가 PR 단위 의사결정
5. `package.json` `scripts.test:r1-guard` 등록
6. CI workflow 통합 (`.github/workflows/ci.yml`) — **실패 시 diff 이미지 artifact 업로드 의무** (Gemini 교차검증 개선 제안 1 반영):
   ```yaml
   - name: Upload pixel diff artifacts
     if: failure()
     uses: actions/upload-artifact@v4
     with:
       name: r1-pixel-diff-${{ github.run_id }}
       path: apps/web/scripts/__diff__/r1/
       retention-days: 7
   ```
7. R1 PR 본문에 viewport 점유율 실측값 박제 (시각화 ADR §결과·재검토 조건과 통합)

**참조 문서**:

- 본 ADR (가드 인프라)
- `20260425-r1-sun-visualization.md` (시각화 의도 — 가드 대상 영역 결정 근거)
- `apps/web/scripts/p290-browser-verify.mjs` (playwright + `__simStore` 패턴 참조)
- `apps/web/scripts/__baselines__/lod-*.png` (기존 baseline 디렉토리 컨벤션)

**비-범위** (절대 손대지 말 것):

- 캔버스 (3D scene) 영역 — pixel diff 대상 제외 (sun mesh 추가가 의도 변화)
- DOM 시맨틱 회귀 검증 — PM Q2 옵션 C 미선택 (R1 비-범위)
- 시각 회귀의 자동 자가 치유 — `--update` 는 명시적 사용자 의도 표명 (자동 갱신 금지)
- 신규 라이브러리 추가 — `pixelmatch` / `pngjs` / `sharp` / `playwright` 만 사용
