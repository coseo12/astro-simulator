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

---

## Amendment 2026-04-26 — CI Linux 통합 정책 결정 (#337)

- **상태**: Accepted (Amendment)
- **날짜**: 2026-04-26
- **결정자**: architect (#337 위임)
- **트리거**: PR #332 reviewer F-1 분리 — R1 baseline 12장이 macOS 14 / Apple Silicon / Chrome channel 로 캡처되어 CI Linux 환경 폰트 렌더링 차이로 false positive 위험
- **메인 ADR §결정 본문 보존**: 본 Amendment 는 §결정 1~5 어떤 항목도 변경하지 않는다. 알고리즘 (pixelmatch 0.1) / 임계값 (0.5%) / 영역 정의 / 디렉토리 구조 / 부트스트래핑 절차 모두 유효. 본 Amendment 는 **OS 매트릭스 축 추가** + **CI workflow 책임 분리**만 다룬다.

### 배경 — 메인 ADR §위험·미해결 4번 항목 구체화

메인 ADR §위험·미해결 4번 ("CI 환경 폰트") 은 baseline 을 "CI 환경에서 1회 캡처" 권고로 종결했다. 그러나 R1 PR #332 머지 시점에 부트스트래핑 절차 단순화 권고 (메인 ADR §Developer 인계 4 대안) 를 채택해 **로컬 macOS 환경에서 baseline 을 박제**했다. 결과:

- 12 PNG (`apps/web/scripts/__baselines__/r1/{1280x720,1920x1080,375x667}/{top-nav,shortcut-bar,hud-top-right,hud-bottom-right}.png`) 모두 macOS 캡처
- CI Linux 통합 시점에 폰트 렌더링 (macOS San Francisco vs Linux DejaVu/Noto) 차이가 4 영역 모두에 nontrivial 영향 — 특히 텍스트 비율이 높은 `top-nav`, `hud-top-right` 가 위험
- 본 Amendment 는 이 격차를 어떻게 흡수할지 **3 후보 비교 + 결정**

### 후보 비교 — Baseline OS 매트릭스 정책

| 후보  | 내용                                                                               | macOS 로컬 검증           | CI Linux 검증 | baseline 매트릭스 크기 | r1-ui-regression-guard.mjs 변경 라인 | 평가                                                                 |
| ----- | ---------------------------------------------------------------------------------- | ------------------------- | ------------- | ---------------------- | ------------------------------------ | -------------------------------------------------------------------- |
| **A** | macOS baseline 유지 + CI 임계값 완화 (`mismatch ≤ 1.0%~2.0%`)                      | ✓                         | △ (관대)      | 12 (현재 유지)         | 0 (env var 또는 CLI flag 추가만)     | 단순. 진짜 회귀 감지력 약화 — 1글자 텍스트 변경이 임계값 안에 묻힘   |
| **B** | Linux baseline 으로 전환 + macOS 로컬은 보조 (CI 우선)                             | △ (관대 또는 별도 임계값) | ✓             | 12 (Linux 로 1회 갱신) | 0 (baseline 만 교체)                 | CI 정합성 1순위. 로컬 macOS 검증에서 false positive — 개발 흐름 마찰 |
| **C** | OS 별 baseline 매트릭스 (`__baselines__/r1/{linux,macos}/{viewport}/{region}.png`) | ✓                         | ✓             | 24 (2 배)              | ≤ 5 (OS detect + 경로 분기)          | 가장 robust. 매트릭스 2배 (디스크 / 갱신 부담)                       |

### 결정 1 — 후보 B (Linux baseline 전환 + macOS 로컬은 보조)

**선택 근거**:

1. **CI 가 진실의 원천 (Source of Truth)** — PR check 가 회귀 감지의 1차 게이트. 메인 ADR §결과·재검토 조건의 "회귀 가드 자체의 회귀 가드 (메타)" 가 요구하는 "고의적 false positive PR 로 가드 fail 실증" 도 CI 환경에서 수행. 로컬은 보조 검증
2. **회귀 감지력 보존** — 후보 A 의 임계값 완화 (0.5% → 1.0%) 는 1글자 텍스트 변경 / 작은 icon 변경을 흡수해 **회귀 가드의 본질적 가치를 훼손**. 메인 ADR §축 2 의 임계값 0.5% 결정 근거 (1글자 텍스트 변경 검출 보장) 와 충돌
3. **매트릭스 크기 단순성** — 후보 C 의 24장 매트릭스는 mjs 코드 변경 (OS detect + 경로 분기), CI workflow 복잡도 (matrix strategy), 갱신 시 양쪽 동기화 부담 등 비용이 높다. 1인 개발 + AI 페어 컨텍스트에서 ROI 낮음
4. **로컬 macOS 검증의 false positive 처리** — macOS 개발자가 로컬에서 `pnpm r1-guard` 실행 시 폰트 차이로 mismatch 가 0.5% 를 초과할 수 있다. 다음 3가지 대응 패턴 박제 (개발자 선택):
   - (a) **CI 결과만 신뢰** — 로컬 실행은 스킵, PR push 후 CI 결과만 확인 (권고)
   - (b) **`SKIP_LOCAL=1` env var** — `r1-ui-regression-guard.mjs` 가 `SKIP_LOCAL=1` 시 즉시 PASS 종료 (CLI flag 추가 ≤ 5 라인)
   - (c) **로컬에서 docker / podman 으로 Linux 컨테이너 실행** — 가장 정합성 높지만 셋업 비용 (선택사항, 비-범위)

**대안 (후보 C) 채택 조건 — 재검토 트리거**:

- macOS 개발자 mismatch false positive 비율이 PR 당 평균 ≥ 2 회 (개발 흐름 심각 마찰)
- macOS 로컬에서 회귀를 **먼저 발견하는** 사례가 누적 (CI 가 항상 1차 게이트라는 전제 무너짐)
- 모바일 / 태블릿 등 OS 매트릭스가 viewport 매트릭스와 곱셈으로 폭발 — 그 시점엔 후보 C 보다 viewport 우선 분리 ADR 검토

### 결정 2 — CI Workflow 분리: bootstrap (workflow_dispatch) vs PR check (자동)

**책임 직교화 — 2 workflow 분리**:

| Workflow                                                                               | 트리거                                                | 실행 빈도                        | 책임                                                                                         |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------- |
| **`.github/workflows/r1-baseline-bootstrap.yml`** (신규)                               | `workflow_dispatch` 만                                | 부트스트래핑 / 갱신 시 1회       | Linux 환경에서 12 PNG 캡처 + `peter-evans/create-pull-request` 로 baseline 갱신 PR 자동 생성 |
| **`.github/workflows/ci.yml`** `detect-and-test` job 의 신규 step (기존 workflow 확장) | `pull_request` (develop/main) + `push` (develop/main) | 모든 PR + 모든 main/develop push | `pnpm r1-guard` 실행. 실패 시 `__diff__/r1/` 을 `actions/upload-artifact` 로 업로드          |

**선택 근거**:

1. **`bench-baseline-remeasure.yml` 패턴 재사용** — 기존 인프라가 동일 모델 (workflow_dispatch + matrix run + create-pull-request) 사용. 패턴 검증 + 컨벤션 일관성
2. **부트스트래핑은 1회성 / PR check 는 상시** — 2 workflow 의 빈도 / 권한 / 비용이 다름. 단일 workflow 에 condition 분기로 합치면 복잡도 증가, 권한 (PR 자동 생성) 가 PR check 에도 적용되는 위험
3. **bootstrap workflow 는 별도 job 으로 격리** — `r1-baseline-bootstrap.yml` 은 `permissions: contents:write, pull-requests:write` 필요 (PR 자동 생성). `ci.yml` 의 detect-and-test 는 read-only 권한이면 충분. 권한 최소화 원칙
4. **PR check 통합 위치** — 기존 `ci.yml` 의 `detect-and-test` job 에 신규 step 추가 (별도 workflow 신설 안 함). 이유: 동일 PR 에 대해 detect-and-test 의 `pnpm test` 가 이미 실행되고 그 직후 `pnpm r1-guard` 만 추가하면 됨. 신규 workflow 신설 시 `pnpm install` / `playwright install` 중복 실행 비용 발생

### 결정 3 — `r1-ui-regression-guard.mjs` 매개변수화 (후보 B 채택 후)

**현재 상태** (`apps/web/scripts/r1-ui-regression-guard.mjs` line 31):

```javascript
const BASELINE_DIR = path.join(__dirname, '__baselines__', 'r1');
```

**후보 B 채택 시 변경**: **0 라인** (baseline 디렉토리 그대로 사용, Linux 캡처본으로 PNG 만 교체).

선택 근거:

- 후보 B 는 매트릭스 OS 차원 추가가 아닌 **단일 baseline 의 OS 변경**. 디렉토리 구조 (`__baselines__/r1/{viewport}/{region}.png`) 그대로
- 후보 C 였다면 OS detect 로직 (`process.platform === 'linux' ? 'linux' : 'macos'`) + 경로 분기 (≤ 5 라인) 필요. 후보 B 에선 불필요
- 단, **선택사항으로 `SKIP_LOCAL=1` env var 지원** 추가 가능 (≤ 5 라인 — `if (process.env.SKIP_LOCAL === '1' && process.platform === 'darwin') process.exit(0);`). developer 가 PR 시점 판단

**Concrete Prediction**:

> 후보 B 채택 후 `r1-ui-regression-guard.mjs` 의 변경 라인 = **0 ~ 5** (선택적 SKIP_LOCAL 지원 한정). `r1-ui-regions.mjs` 변경 = 0. baseline 12 PNG 가 Linux 캡처본으로 교체되며 git diff 상 binary diff. CI workflow 변경: `r1-baseline-bootstrap.yml` 신규 (≈ 100 라인), `ci.yml` 신규 step 추가 (≈ 15 라인 — `pnpm r1-guard` + diff 업로드).

검증 절차 (Developer PR 에서 자동 재현):

```bash
git diff develop...HEAD -- apps/web/scripts/r1-ui-regression-guard.mjs apps/web/scripts/r1-ui-regions.mjs
# 변경 라인 합 ≤ 5 (mjs) + 0 (regions) 이어야 Prediction 성공
```

### 결정 4 — workflow_dispatch 사전 조건 박제 (volt #45 함정 회피)

**`r1-baseline-bootstrap.yml` 상단 주석에 사전 조건 명시 의무**:

```yaml
# CRITICAL — workflow_dispatch 2단계 함정 (volt #45):
#
# (1) default branch 종속:
#     - 본 workflow 가 main (또는 develop) 에 머지된 후에만 GitHub Actions UI 에 dispatch 버튼이 표시됨
#     - feature 브랜치에서 push 만으로는 실행 불가
#     - 절차: PR 머지 → main 반영 확인 → Actions UI → "r1-baseline-bootstrap" → "Run workflow" 클릭
#
# (2) PR 자동 생성 권한:
#     - peter-evans/create-pull-request 는 Settings → Actions → General → "Workflow permissions" →
#       "Allow GitHub Actions to create and approve pull requests" 가 ON 이어야 작동
#     - 기본값 OFF — 첫 dispatch 전 1회 enable 필요
#     - 또는 CLI: gh api -X PUT /repos/coseo12/astro-simulator/actions/permissions/workflow \
#         -f default_workflow_permissions=write \
#         -F can_approve_pull_request_reviews=true
#
# DoD 매핑: #337 부트스트래핑 1회 dispatch 검증 (volt #45 함정 회피)
```

**선택 근거**: volt #45 (workflow_dispatch 2단계 함정) 의 박제 의무 패턴. workflow 도입 PR DoD 에 "default branch 반영 후 dispatch 검증" 명시 → developer 가 R1 PR 머지 후 1회 실행 결과를 PR 본문에 박제.

### Developer 인계 (Amendment 추가분)

**시작 지점**:

1. **사전 조건 검증** (workflow 작성 전):
   ```bash
   # PR 자동 생성 권한 현재 상태 확인
   gh api repos/coseo12/astro-simulator/actions/permissions/workflow
   # can_approve_pull_request_reviews 가 false 면 enable 필요
   ```
2. **`.github/workflows/r1-baseline-bootstrap.yml` 신규 작성** — `bench-baseline-remeasure.yml` 패턴 따라:
   - `on: workflow_dispatch` 만 (push/PR 트리거 금지 — 비용 + 권한)
   - `permissions: contents:write, pull-requests:write`
   - steps: checkout / pnpm setup / Node 20 / Playwright Chrome (Linux) / 앱 빌드 / 웹 서버 기동 / `node apps/web/scripts/r1-ui-regression-guard.mjs --update` / git diff 확인 / `peter-evans/create-pull-request@v7` 로 baseline 갱신 PR 자동 생성
   - PR base = `develop`, branch = `chore/r1-baseline-linux-${{ github.run_id }}`
3. **`.github/workflows/ci.yml` `detect-and-test` job 에 step 추가** — pnpm 경로 직후 (line ~60 `verify:no-scientific-grep` step 옆):

   ```yaml
   - name: R1 UI 회귀 가드 (r1-guard)
     if: hashFiles('pnpm-lock.yaml') != '' && hashFiles('apps/web/scripts/r1-ui-regression-guard.mjs') != ''
     run: |
       pnpm exec playwright install --with-deps chromium
       pnpm --filter @astro-simulator/web start -p 3001 &
       WEB_PID=$!
       for i in {1..30}; do
         if curl -sf http://localhost:3001/ko > /dev/null; then break; fi
         sleep 2
       done
       BASE_URL=http://localhost:3001 node apps/web/scripts/r1-ui-regression-guard.mjs
       kill $WEB_PID || true

   - name: R1 diff 이미지 업로드 (실패 시)
     if: failure() && hashFiles('apps/web/scripts/__diff__/r1/**/*.png') != ''
     uses: actions/upload-artifact@v4
     with:
       name: r1-pixel-diff-${{ github.run_id }}
       path: apps/web/scripts/__diff__/r1/
       retention-days: 7
   ```

   - **NOTE**: `pnpm --filter @astro-simulator/web start` 가 실제 동작하는지 확인 필요 (R1 PR 본문 + `package.json` scripts 검증). 작동 안 하면 `pnpm build && pnpm exec serve` 또는 `next start` 등 대체

4. **부트스트래핑 절차** (volt #45 회피):
   - (a) PR `feature/337-r1-ci-linux-baseline-design` 머지 (workflow 파일 main 반영)
   - (b) GitHub Actions UI → "r1-baseline-bootstrap" → "Run workflow" → develop 대상 dispatch
   - (c) workflow 가 자동 생성한 baseline 갱신 PR 머지 (Linux 캡처 12장이 macOS 12장 교체)
   - (d) 임의 PR 에서 `ci.yml` 의 r1-guard step 이 PASS 하는지 실증
   - (e) **고의적 false positive PR** (예: shortcut 라벨 1글자 변경) 로 r1-guard 가 실제 fail 하는지 실증 후 revert (메인 ADR §결과·재검토 조건 메타 가드 충족)
5. **CHANGELOG 박제** — Behavior Changes 섹션에 "R1 UI 회귀 가드 baseline 이 macOS → Linux CI 캡처본으로 전환. 로컬 macOS 검증 시 폰트 차이로 false positive 가능 — `SKIP_LOCAL=1` env var 또는 CI 결과 신뢰" 명시

**참조 문서**:

- 본 ADR (메인 + Amendment)
- `bench-baseline-remeasure.yml` (패턴 참조)
- volt #45 (workflow_dispatch 2단계 함정), volt #48 (CI 통과 ≠ 테스트 실행)

**비-범위 (절대 손대지 말 것)**:

- 메인 ADR §결정 1~5 본문 — Amendment 는 §결정 본문 변경 안 함 (OS 매트릭스 축 추가만)
- pixel diff 임계값 변경 (0.5% → 1.0%) — 후보 A 미선택. 임계값 변경 필요 시 별도 amendment
- 다른 R-Phase (R2~R10) baseline 캡처 — 본 인프라 도입 후 동일 패턴 재사용
- macOS 개발 환경 폐기 — 후보 B 는 "CI 우선" 이지 "macOS 금지" 아님 (보조 검증 + 선택적 SKIP_LOCAL)

### 교차검증 반영 사항

본 Amendment 박제 직후 cross-validate 1회 (Gemini 2.5 Pro, 2026-04-26 08:16Z). outcome=applied. 로그: `.claude/logs/cross-validate-architecture-20260426-171643.log`.

**Claude 자체 편향 4종 셀프 체크** (CLAUDE.md `## 교차검증`):

- **낙관적 일정**: 통과 — mjs 변경 ≤ 5 라인 / workflow 신규 ≈ 100 라인 / ci.yml step 추가 ≈ 15 라인 보수적 추정
- **결합 간과**: 통과 — `r1-baseline-bootstrap.yml` (workflow_dispatch + PR 자동 생성) ↔ `ci.yml` (PR check) 책임 직교화로 자동 동기화
- **폐기 프레이밍**: 통과 — 후보 A/C 단순 폐기 아닌 재검토 트리거 박제 (false positive ≥ 2/PR 시 후보 C)
- **순수주의** (호출 프롬프트 명시 질문): **부분 기각** — Gemini 가 "후보 B 채택은 실용적이고 현명" + "SKIP_LOCAL 까지 마련한 것은 뛰어난 통찰" 로 평가. 1인 개발 + AI 페어 컨텍스트에서 macOS 마찰 < CI 정합성 우선이라는 Claude 판단을 외부 시각이 지지

**합의** — Claude 설계와 일치 + 본 Amendment 에 즉시 반영:

- **Workflow 책임 분리** (§결정 2) — Gemini 가 "각 책임과 권한을 명확히 분리하여 구조적 완성도를 높였습니다" 합의. 생산자(`r1-baseline-bootstrap.yml`)-소비자(`ci.yml`) 패턴 명시
- **CI 환경을 Source of Truth (§결정 1, 후보 B)** — Gemini 가 "실용적이고 현명한 결정. 로컬 macOS 환경 마찰을 예측하고 SKIP_LOCAL 회피 전략까지 마련한 것은 뛰어난 통찰" 강하게 합의
- **워크플로우 권한 최소화** (§결정 2) — Gemini 가 "Baseline 생성 워크플로우에만 contents:write/pull-requests:write 부여, ci.yml 은 read-only 유지는 훌륭한 보안 설계" 합의
- **재검토 트리거 박제** (§결정 1 대안 채택 조건) — Gemini 가 "재검토 조건의 구체성 (false positive 비율, CI 5분 초과 등) 이 노후화 대응 제도적 장치" 합의

**이견 수용 (Gemini 고유 발견 — 본 Amendment 에 즉시 반영)**:

- **`.gitignore` 에 `apps/web/scripts/__diff__/` 추가 (Gemini 개선 제안 1)** — Claude 원안 누락. CI 실패 시 생성되는 diff 이미지가 로컬 개발 환경에 잔존해 의도치 않은 커밋 위험. **수용** — Developer 인계 단계에 `.gitignore` 항목 추가 명시 박제
- **`BASE_URL` 환경변수 계약 명시 (Gemini 개선 제안 2)** — Claude 원안은 `r1-ui-regression-guard.mjs` 라인 33 의 default 값 (`http://localhost:3000`) 만 박제. CI step 에서 `BASE_URL=http://localhost:3001` 오버라이드 시 환경변수 계약이 명시적이지 않음. **수용** — mjs 헤더 주석에 `BASE_URL` 계약 명시 의무를 Developer 인계에 추가

**Claude 재분석으로 기각한 Gemini 제안**:

- **Animation timing 회귀 감지 (`getAnimations().map(a => a.finished)`)** — 메인 ADR §재검토 트리거 4 에 이미 박제 ("pixel diff 가 missing 한 회귀 (예: animation timing 변경) 가 발생 — DOM 시맨틱 회귀 검증 추가 도입 ADR"). 본 Amendment 범위 밖 + 메인 ADR 의 R1 비-범위 (DOM 시맨틱 회귀 미도입). **기각 근거**: 메인 ADR 본문 검토 누락
- **Retina/HiDPI `deviceScaleFactor: 1` 고정** — `r1-ui-regression-guard.mjs` 라인 131 에 이미 박제 (`deviceScaleFactor: 1`). **기각 근거**: 코드 미검토. 후보 B 채택으로 CI Linux 가 표준 해상도이므로 추가 보강 불필요

**고유 발견 (후속 분리)**:

- **fork PR 보안 가드 (`if: github.repository == 'owner/repo'`)** — 현재 astro-simulator 는 단일 owner repo + private dev 컨텍스트. fork PR 시나리오 부재. 본 Amendment 범위 밖 (보안 강화). **분리 권고**: future fork-friendly 전환 시점에 검토. 우선순위: low
- **신규 viewport 추가 가이드라인 (`__baselines__/{width}x{height}/...` 컨벤션 문서화)** — R1 비-범위 (R2~R10 진입 시점에 결정). 메인 ADR §결과·재검토 조건 에 viewport 매트릭스 폭발 시 후보 C 재검토 트리거 박제됨. **분리 권고**: R2 PR 진입 시점에 가이드라인 ADR. 우선순위: low

### 교차검증 반영 → §Developer 인계 보강 (이견 수용)

위 "이견 수용" 2건은 §Developer 인계 의 단계에 다음 항목으로 추가:

- **추가 단계 (mjs 작성/수정 시)**: `apps/web/scripts/r1-ui-regression-guard.mjs` 헤더 주석에 환경변수 계약 명시 — `BASE_URL` (기본 `http://localhost:3000`, CI 에서 `http://localhost:3001` 등 오버라이드 가능), `SKIP_LOCAL=1` (선택사항, macOS darwin 한정 즉시 PASS)
- **추가 단계 (`.gitignore` 보강)**:
  ```
  # R1 UI 회귀 가드 — 실패 시 생성되는 diff PNG (CI artifact 업로드 후 폐기)
  apps/web/scripts/__diff__/
  ```

---

## Amendment v2 2026-04-26 — chicken-and-egg + wasm-pack 실측 발견 박제 (#347, #348)

- **상태**: Accepted (Amendment v2)
- **날짜**: 2026-04-26 (Amendment 1 박제 직후 약 1시간 내 실측)
- **결정자**: 메인 오케스트레이터 (PR #347 다운스트림 CI fail 분석)
- **트리거**: PR [#347](https://github.com/coseo12/astro-simulator/pull/347) commit `eadce1e` 1차 구현 후 `detect-and-test` CI FAIL 실측 — Amendment 1 의 부트스트래핑 절차 (a)~(e) 가 두 가지 잠재 fail 을 명시적으로 짚지 않았음
- **메인 ADR §결정 본문 보존**: 본 v2 도 §결정 1~5 / Amendment 1 §결정 1~4 어떤 항목도 변경하지 않는다. **부트스트래핑 절차 한계 박제** + **미래 R-Phase 사전 진단 체크리스트** 만 추가

### 발견 사항 — Amendment 1 §결정 2 (workflow 책임 분리) + §Developer 인계의 잠재 fail

#### Fail 1 — wasm-pack 의존 (workspace recursive build)

`r1-baseline-bootstrap.yml` 및 `ci.yml` `detect-and-test` 의 r1-guard step 모두 `pnpm build` (= `pnpm -r build`) 를 호출. monorepo 의존 그래프상:

```
apps/web (next build) → packages/core → packages/physics-wasm (wasm-pack build)
```

`physics-wasm` 워크스페이스가 `wasm-pack` 호출. **`r1-baseline-bootstrap.yml` 자체와 `ci.yml` `detect-and-test` job 모두 wasm-pack 미설치** (현재 `verify-and-rust` job 만 보유). 결과:

```
packages/physics-wasm build: sh: 1: wasm-pack: not found
ELIFECYCLE Command failed with exit code 1.
```

Amendment 1 §결정 2 의 "workflow 책임 분리 + 권한 최소화" 가 정합한 설계지만, **wasm-pack 토폴로지 의존을 명시하지 않아** 부트스트래핑 dispatch 즉시 fail 위험 잠재. PR #347 reviewer ([#issuecomment-4321651885](https://github.com/coseo12/astro-simulator/pull/347#issuecomment-4321651885)) BLOCK-1 으로 발견 → commit `d687072` 에서 `dtolnay/rust-toolchain` + `Swatinem/rust-cache` + `taiki-e/install-action wasm-pack@0.14.0` 3 step 추가로 해소.

#### Fail 2 — chicken-and-egg (baseline 미정합 시점의 ci.yml step)

Amendment 1 §결정 2 의 부트스트래핑 절차 (a) PR 머지 → (b) workflow_dispatch → (c) baseline 갱신 PR 머지 가정. (a) 단계의 PR 자체가 `ci.yml` r1-guard step 을 추가하면 **macOS baseline 으로 Linux CI 가 검증** → mismatch ≤ 0.5% 초과 fail 매우 유력. (a) 단계의 ci.yml step 자체가 **chicken 위치**.

PR #347 commit `eadce1e` 가 ci.yml step 추가를 시도했고, wasm-pack fail 로 chicken-and-egg 가 표면화되기 전에 차단됐으나, wasm-pack 해결 후에도 같은 패턴 fail 이 재발할 위험.

### 결정 — 후보 (ii) 채택 + 후속 이슈 분리

PR #347 코멘트 ([#issuecomment-4321641705](https://github.com/coseo12/astro-simulator/pull/347#issuecomment-4321641705)) 에서 후보 (ii) 채택 (commit `70324b8`):

- 본 PR 에서 ci.yml r1-guard step 2개 보류 (workflow + mjs 매개변수화 + .gitignore + CHANGELOG 만 머지)
- 후속 이슈 [#348](https://github.com/coseo12/astro-simulator/issues/348) ([R1 후속 F-2] ci.yml r1-guard step 통합 — chicken-and-egg + wasm-pack 의존 해소) 신규 — PR #347 머지 + 부트스트래핑 (b)~(c) 완료 후 진행

후보 (iii) `continue-on-error: true` / 후보 (iv) 별도 job 분리 모두 기각 — 후보 (ii) 가 Amendment 1 §결정 2 의 "단계 분리" 와 자연스럽게 정합.

### Amendment 1 부트스트래핑 절차의 한계 박제

Amendment 1 §결정 2 의 부트스트래핑 절차 (a)~(e) 는 **단일 PR 로 workflow + ci.yml step 통합** 을 가정. 본 Amendment v2 가 박제하는 정정 흐름:

1. **PR1 (본 PR #347 후속)** — workflow + mjs 매개변수화 + .gitignore + CHANGELOG (ci.yml step 제외) 머지
2. **부트스트래핑 (b)** — `r1:baseline-bootstrap` workflow_dispatch 1회 실행 (이때 본 v2 의 wasm-pack 3 step 이 dispatch fail 차단)
3. **부트스트래핑 (c)** — 자동 생성된 baseline 갱신 PR (12 PNG Linux 캡처본 교체) 머지
4. **PR2 (후속 이슈 #348)** — ci.yml r1-guard step 통합 + wasm-pack 설치 step (또는 별도 job 분리) — 이 시점 Linux baseline 정합 상태이므로 step 통합이 자연스럽게 PASS
5. **메타 가드 실증** — 고의적 false positive PR 로 r1-guard fail 검증 후 revert (메인 ADR §결과·재검토 조건)

### 미래 R-Phase 사전 진단 체크리스트 (R2~R10 인프라 재사용 시)

본 Amendment v2 의 핵심 박제 — 동일 패턴 발견 반복 회피:

1. **회귀 가드 인프라 도입 시 baseline + step 통합의 chicken-and-egg 인지 의무**
   - 단일 PR 로 완결시키려는 관성 vs 부트스트래핑 단계 분리
   - 체크 질문: "본 PR 의 step 이 동시에 추가하는 baseline 의 OS/환경 정합성 확인 안 된 시점에 동작 가능한가?"
   - 정합성 미확보 시 → step 추가는 baseline 갱신 PR 머지 후 별도 PR 분리 의무

2. **monorepo recursive build 의 의존성 매핑**
   - `pnpm build` ≠ `pnpm --filter <pkg> build` — recursive 가 다른 워크스페이스의 binary 의존 (wasm-pack, cargo, rustc, protoc 등) 을 끌어옴
   - CI job 별 binary 의존 매트릭스 사전 확인:
     ```bash
     # 의존 그래프 추적
     pnpm --filter <target-pkg>... why <suspected-pkg>
     # 또는 package.json 의 build 스크립트 grep
     grep -rn '"build":' packages/*/package.json apps/*/package.json
     ```
   - 새 workflow/job 도입 전 **빌드 트리 binary 의존 매트릭스 박제** 의무 (예: web → core → physics-wasm → wasm-pack ⊃ rustc)

3. **다운스트림 실측이 최종 가드** (CLAUDE.md `### 다운스트림 실측이 최종 가드 — upstream 3중 방어 blindspot` 의 추가 사례)
   - architect ADR + developer self-compare + reviewer 정적 분석 3중 방어 통과해도 다운스트림 CI 실측에서만 드러나는 결함 존재
   - PR #347 사례: developer macOS 로컬 검증 (`pnpm start -p 3001` HTTP 200, `SKIP_LOCAL=1 + macOS` 즉시 PASS, 단위 테스트 441 PASS) 가 wasm-pack/chicken-and-egg 를 잡지 못한 blindspot
   - 메인 오케스트레이터의 다운스트림 CI 결과 직접 확인 의무 (CLAUDE.md `### sub-agent 검증 완료 ≠ GitHub 박제 완료`) 의 핵심 가치 입증

### Volt 캡처 후보 (별도 처리)

본 Amendment v2 의 발견은 다음 volt 교훈으로 캡처 권고:

- **회귀 가드 인프라 도입의 chicken-and-egg 패턴** — baseline 정합성 + step 통합 + 의존성 매핑 3축 사전 진단. 본 ADR Amendment v2 + PR #347 commit history (`eadce1e` → `70324b8` → `d687072`) 가 trace
- **monorepo recursive build 의존성 누락 (workspace binary 의존)** — `pnpm build` vs `pnpm --filter` 의 의존 그래프 차이. CI job 구조 사전 매핑 의무
- **upstream 3중 방어 blindspot 의 추가 사례** — volt #195 (CLAUDE.md 박제) 의 구체 사례 1건 추가

### 재검토 트리거 추가 (메인 ADR §결과·재검토 조건 보강)

- R2~R10 의 회귀 가드 인프라 도입 시 본 Amendment v2 §사전 진단 체크리스트 적용 → 동일 패턴 재발 시 체크리스트 미준수 사실 박제
- 후속 이슈 #348 머지 후 부트스트래핑 절차 (a)~(e) 정합 동작 실증 — Amendment 1 §결정 2 의 절차 검증

---

## Amendment v3 2026-04-26 — ci.yml r1-guard step 통합 + wasm-pack 의존 해소 (#348)

- **상태**: Accepted (Amendment v3)
- **날짜**: 2026-04-26 (PR #347 머지 + workflow_dispatch run 24956759573 + PR #351 baseline Linux 갱신 머지 직후)
- **결정자**: architect (#348 위임)
- **트리거**: Amendment v2 §"Amendment 1 부트스트래핑 절차의 한계 박제" (4) 단계 — `chicken-and-egg` 해소 + wasm-pack 의존 충족 후 ci.yml r1-guard step 2개 통합
- **메인 ADR §결정 본문 보존**: 본 v3 도 §결정 1~5 / Amendment 1 §결정 1~4 / Amendment v2 어떤 항목도 변경하지 않는다. **wasm-pack 설치 전략 + ci.yml step 형태 + 메타 가드 실증 절차 박제** 만 추가

### 사전 조건 충족 확인 (착수 시점, 2026-04-26)

- ✓ PR [#347](https://github.com/coseo12/astro-simulator/pull/347) (workflow + mjs 매개변수화 + .gitignore + CHANGELOG) 머지 완료 (commit `31eac65`)
- ✓ v0.13.1 release (PR #350, `--merge` 방식) — main tip `20b18a7`
- ✓ workflow_dispatch run [`24956759573`](https://github.com/coseo12/astro-simulator/actions/runs/24956759573) — 2m1s 완주 (Amendment v2 §발견사항 #1 wasm-pack 3 step 으로 dispatch fail 차단 검증됨)
- ✓ PR #351 (Linux baseline 12 PNG 갱신, squash 머지) — develop tip `d9ae9c0`. `apps/web/scripts/__baselines__/r1/{1280x720,1920x1080,375x667}/{top-nav,shortcut-bar,hud-top-right,hud-bottom-right}.png` 12장 모두 Linux 환경 캡처본
- ✓ 인계 항목 실측 재검증 (CLAUDE.md "인계 항목 실측 재검증 — NO-OP ADR 패턴"): Linux baseline 12 PNG 정합성 확인 — chicken-and-egg 해소 완료, NO-OP 미해당

### 후보 비교 — wasm-pack 설치 전략

이슈 #348 본문 명시 후보:

| 후보  | 내용                                                                                                                                                              | detect-and-test job 시간 영향                           | 변경 라인                | 책임 분리   | 평가                                                                     |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------ | ----------- | ------------------------------------------------------------------------ |
| **A** | `detect-and-test` job 에 `dtolnay/rust-toolchain` + `Swatinem/rust-cache` + `taiki-e/install-action wasm-pack@0.14.0` 3 step 추가 (verify-and-rust job 동일 패턴) | 모든 detect-and-test 실행에 ~30s 증가 (캐시 hit 시 ~5s) | ci.yml +35~40 라인       | △ 통합      | **선택** — 단순 + 패턴 검증 (PR #347 dispatch run 2m1s 실증)             |
| B     | r1-guard 전용 별도 job (`r1-ui-guard`) — wasm-pack + chromium + web-only build                                                                                    | 신규 job (~3~4분 단독), detect-and-test 영향 없음       | ci.yml +60 라인 + 새 job | ✓ 명확      | 변경량 큼. job 간 setup 중복 (pnpm install / Node setup)                 |
| ~~C~~ | r1-guard step 의 `pnpm build` 대신 `pnpm --filter @astro-simulator/web build`                                                                                     | (해당 없음 — 효과 0)                                    | (해당 없음)              | (해당 없음) | **폐기** — web → core → physics-wasm 의존 그래프상 wasm-pack 여전히 필요 |

**선택 (A) 근거**:

1. **PR #347 의 r1-baseline-bootstrap.yml 검증 결과 재사용** — workflow_dispatch run `24956759573` 가 동일 3 step 조합 (rust-toolchain + rust-cache + taiki-e/install-action wasm-pack) 으로 2m1s 완주. **재현 가능성 100%** (Concrete Evidence). 후보 B 는 신규 job 설계 + 검증 단계 추가 필요
2. **Swatinem/rust-cache 캐시 키 정합성** — `verify-and-rust` job (`workspaces: packages/physics-wasm`, 기본 키) + `r1-baseline-bootstrap` (동일 workspaces, 기본 키) + 신규 `detect-and-test` (동일 workspaces, 기본 키) 모두 동일 캐시 공유 가능. `long-integration-rust` 가 `key: long-integration` 으로 분리한 패턴은 release 빌드 격리 의도 — r1-guard 는 release 빌드 사용 안 함 (web build 만 wasm-pack 호출), 기본 캐시 hit 가능
3. **책임 분리 트레이드오프 ROI** — 후보 B 는 책임 분리 (r1-guard 전용 job) 의 명확함을 주지만, detect-and-test 가 이미 pnpm install + Playwright 설치를 수행 → 동일 setup 중복 비용. 1인 개발 + AI 페어 컨텍스트에서 통합 단순성 > 책임 분리 직교성. 후보 B 채택 트리거: detect-and-test 시간이 N분 (잠정 8분) 초과 시 분리 ADR
4. **변경량 작음** — 이슈 본문 권고 (변경량 작음) + Amendment v2 §"미래 R-Phase 사전 진단 체크리스트" #2 의 "monorepo recursive build 의존성 매핑" 사례 박제로 충분

**Concrete Prediction**:

> 후보 A 채택 후 `ci.yml` 변경 라인 = **추가 35~40 / 삭제 0**:
>
> - wasm-pack 3 step (rust-toolchain + rust-cache + install wasm-pack): +15 라인
> - r1-guard step (실행): +14 라인 (PR #347 commit `eadce1e` 패턴 재사용 + `pnpm build` 보존)
> - r1-guard diff 업로드 step: +8 라인
>
> `r1-ui-regression-guard.mjs` / `r1-ui-regions.mjs` / baseline 12 PNG / `package.json` / `pnpm-lock.yaml` 변경 = **0 라인**.
>
> 검증 절차 (Developer PR 에서 자동 재현):
>
> ```bash
> git diff develop...HEAD -- .github/workflows/ci.yml
> # 추가 라인 ≈ 35~40 (rust-toolchain 3 step + r1-guard step 2개)
> git diff develop...HEAD -- apps/web/scripts/ packages/ apps/web/package.json package.json
> # 변경 라인 = 0 이어야 Prediction 성공
> ```

### 결정 — ci.yml r1-guard step 2개 + wasm-pack 3 step 통합 형태

**최종 step 매트릭스** (ci.yml `detect-and-test` job 의 기존 `pnpm test` step 직후 또는 `verify:no-scientific-grep` step 직후 — developer 가 가독성 기준 결정):

```yaml
# ============================================================
# R1 UI 회귀 가드 — wasm-pack + Playwright + pixel diff
# ============================================================
# ADR: docs/decisions/20260425-r1-ui-pixel-diff-guard.md §Amendment v3 2026-04-26
# 의존성:
#   - physics-wasm 워크스페이스 → wasm-pack (root recursive `pnpm build` 트리거)
#   - apps/web → next start (Playwright BASE_URL 타깃)
#   - apps/web/scripts/__baselines__/r1/ Linux 캡처본 12장 (PR #351 머지 후 정합)

- name: Rust 툴체인 설정 (R1 r1-guard 의존)
  if: hashFiles('pnpm-lock.yaml') != '' && hashFiles('apps/web/scripts/r1-ui-regression-guard.mjs') != '' && hashFiles('rust-toolchain.toml') != ''
  uses: dtolnay/rust-toolchain@stable
  with:
    toolchain: '1.94.1'
    targets: wasm32-unknown-unknown

- name: Rust 빌드 캐시 (R1 r1-guard 의존)
  if: hashFiles('pnpm-lock.yaml') != '' && hashFiles('packages/physics-wasm/Cargo.toml') != ''
  uses: Swatinem/rust-cache@v2
  with:
    workspaces: packages/physics-wasm

- name: wasm-pack 설치 (R1 r1-guard 의존)
  if: hashFiles('pnpm-lock.yaml') != '' && hashFiles('packages/physics-wasm/Cargo.toml') != ''
  uses: taiki-e/install-action@v2
  with:
    tool: wasm-pack@0.14.0

- name: R1 UI 회귀 가드 (r1-guard)
  if: hashFiles('pnpm-lock.yaml') != '' && hashFiles('apps/web/scripts/r1-ui-regression-guard.mjs') != ''
  run: |
    pnpm exec playwright install --with-deps chromium
    pnpm build
    pnpm --filter @astro-simulator/web start -p 3001 &
    WEB_PID=$!
    for i in {1..30}; do
      if curl -sf http://localhost:3001/ko > /dev/null; then break; fi
      sleep 2
    done
    BASE_URL=http://localhost:3001 node apps/web/scripts/r1-ui-regression-guard.mjs
    GUARD_EXIT=$?
    kill $WEB_PID || true
    exit $GUARD_EXIT

- name: R1 diff 이미지 업로드 (실패 시)
  if: failure() && hashFiles('apps/web/scripts/__diff__/r1/**/*.png') != ''
  uses: actions/upload-artifact@v4
  with:
    name: r1-pixel-diff-${{ github.run_id }}
    path: apps/web/scripts/__diff__/r1/
    retention-days: 7
```

**보강 사항** (이슈 본문 yaml 대비):

1. **`if:` 가드에 `hashFiles('rust-toolchain.toml') != ''` / `hashFiles('packages/physics-wasm/Cargo.toml') != ''` 추가** — harness ci.yml 의 일관된 가드 패턴 (rust step 들이 Cargo.toml 부재 시 자동 스킵). harness upstream `ci.yml` 호환성 + 다른 다운스트림 환경 안전성
2. **`pnpm build` 명시 보존** — 이슈 본문 yaml 그대로. `pnpm --filter @astro-simulator/web build` 로 좁히지 않는 이유: 의존 그래프 (web → core → physics-wasm) 상 어차피 wasm-pack 호출 + 부분 빌드의 stale dist 위험 (CLAUDE.md "monorepo dist stale 변형" volt #70 참조)
3. **`exit $GUARD_EXIT`** — `kill $WEB_PID` 가 0 종료해도 가드 결과 보존. shell job control 의 silent fail 회피
4. **`continue-on-error` 미사용** — 후보 (iii) 기각 (Amendment v2 §"Amendment 1 부트스트래핑 절차의 한계 박제"). r1-guard 는 일상 PR check 의 회귀 차단 게이트. fail 시 PR 차단이 본질적 가치
5. **Step 위치 권고** — `pnpm test` 직후 (line 53 다음) 또는 `verify:no-scientific-grep` 직후 (line 60 다음). 둘 다 가능. **권고**: `verify:no-scientific-grep` 직후 (line 60 다음) — R1 회귀 가드 그룹화 + harness upstream `pnpm test` 와 시간적 격리 (Playwright + wasm-pack 비용을 별도 시각적 그룹으로 인식)

### 메타 가드 실증 절차 박제 (메인 ADR §결과·재검토 조건 +

                                Amendment 1 §Developer 인계 (e) 충족)

**본 PR 머지 후 별도 후속 PR 로 실증** (구현 단계 — 본 ADR 은 절차 박제만):

1. **고의적 false positive 변경** — 다음 중 하나 (가시성 + 결정성 우선):
   - (a) `apps/web/src/components/layout/<shortcut-bar 컴포넌트>.tsx` 의 shortcut 라벨 1글자 변경 (예: "태양" → "태앙") — 텍스트 변경이 폰트 렌더링 sub-pixel 흡수 임계 (0.5%) 를 명확히 초과
   - (b) `<top-nav>` 의 메뉴 항목 1개 추가 (예: "샌드박스" → "샌드박스 (P2+)") — DOM 구조 변경 + 텍스트 변경
   - **권고**: (a) — DOM 구조 보존, 순수 텍스트 회귀 시그널 명확
2. **PR 생성** — branch `experiment/348-r1-meta-gate-validation`, base `develop`, draft. PR 본문에 "메타 가드 실증 — 머지 의도 없음, r1-guard fail 확인 후 close" 명시
3. **CI 결과 확인**:
   - ci.yml `detect-and-test` job 의 `R1 UI 회귀 가드 (r1-guard)` step 이 **fail 종료** (exit 1)
   - `R1 diff 이미지 업로드 (실패 시)` step 이 trigger 되어 artifact `r1-pixel-diff-<run_id>` 업로드
   - artifact 다운로드 → `__diff__/r1/<viewport>/<region>.png` 의 빨간색 mismatch 픽셀 시각 확인
4. **PR close** (revert 아닌 close — 머지 안 함). artifact는 retention-days=7 자동 폐기
5. **본 ADR §결과·재검토 조건 메타 가드 항목** + **Amendment 1 §Developer 인계 (e)** 체크박스 충족 박제 — issue #348 코멘트 또는 후속 이슈

**비-목표** (메타 가드 실증 PR 직접 생성은 본 ADR 범위 밖):

- 본 ADR 은 **절차만** 박제. 실측은 후속 PR (developer 단계)
- 메타 가드 실증 결과로 임계값 조정이 필요해지면 별도 amendment

### 위험 / 미해결

1. **detect-and-test job 시간 증가** — wasm-pack 3 step (~30s 캐시 cold, ~5s warm) + Playwright 설치 (~60s) + 빌드 (`pnpm build` ~30s) + 웹 서버 기동 + r1-guard 실행 (~30s) ≈ 추가 **2~3분 cold / 1~2분 warm**. 기존 detect-and-test (`pnpm install` + `pnpm test` ~3~5분) 대비 누적 5~8분 예상. 메인 ADR §재검토 트리거 5 ("CI 실행 시간이 N분 초과") 의 N=8분 잠정 임계 도입 — 초과 시 후보 B (별도 job) 분리 ADR
2. **port 3001 충돌 가능성** — ubuntu-latest runner 는 신규 컨테이너이므로 충돌 가능성 낮으나, 다른 step 이 향후 3001 port 사용 시 회피. `r1-baseline-bootstrap.yml` 도 3001 사용 중 (workflow 다름이므로 충돌 없음). port 변경 필요 시 `BASE_URL` env var + step env 로 격리
3. **`pnpm build` 의 silent fail** — `pnpm -r build` 가 일부 워크스페이스에서 비-zero 종료해도 후속 step 진행 시 stale dist 로 r1-guard 가 실패 상태 가리는 위험. `set -e` 또는 명시적 step 분리 (build 별도 step) 검토. **권고**: 본 PR 에서는 `set -e` 명시 (run shell 의 기본 동작이 set -e 이지만 명시적 박제). developer 가 yaml 작성 시 `set -e` 또는 `bash -e` 명시
4. **wasm-pack 캐시 hit 영향** — Swatinem/rust-cache 가 캐시 hit 시 ~5s 로 단축되지만, branch 별 캐시 격리 (PR 첫 실행 시 cold) 가 이슈. develop merge 후 점진 warm. 본 PR 머지 후 1주 측정 권고 — `r1-baseline-bootstrap.yml` workflow_dispatch run 결과 (2m1s 완주) 와 detect-and-test 측정값 차이로 캐시 효과 확인
5. **메타 가드 실증의 false negative 위험** — 1글자 텍스트 변경이 0.5% 임계를 초과하지 못하면 r1-guard 가 PASS — 임계값 또는 대상 영역 검토 필요. 메타 가드 실증 PR 에서 발견 시 별도 amendment

### 재검토 트리거 (메인 ADR §결과·재검토 조건 보강)

다음 조건 중 하나면 본 v3 재검토:

1. detect-and-test job 시간이 8분 초과 (위험 #1) — 후보 B (별도 job) 분리 ADR
2. wasm-pack 캐시 miss 가 PR 의 50% 이상 (위험 #4) — 캐시 키 전략 재검토
3. r1-guard step 의 false positive 비율이 PR 당 평균 ≥ 1회 (Amendment 1 §결정 1 의 false positive ≥ 2/PR 트리거의 강화) — 후보 C (OS 매트릭스) 또는 SKIP_LOCAL 강제 ADR
4. 메타 가드 실증 결과 1글자 텍스트 변경이 r1-guard 를 fail 시키지 못함 (위험 #5) — 임계값 또는 영역 정의 amendment

### Developer 인계 (Amendment v3)

**시작 지점**:

1. **사전 조건 검증** (다시 확인):
   ```bash
   # baseline 12 PNG 가 Linux 캡처본인지 확인 (PR #351 머지 후)
   git log --oneline -5 -- apps/web/scripts/__baselines__/r1/
   # PR #351 squash commit 이 보여야 함
   ls apps/web/scripts/__baselines__/r1/*/
   # 12 PNG (4 영역 × 3 viewport) 존재 확인
   ```
2. **`.github/workflows/ci.yml` `detect-and-test` job 에 step 5개 추가** — 위 §결정 §"최종 step 매트릭스" yaml 그대로. 위치: `verify:no-scientific-grep` step (line 60) 직후 권고 (R1 회귀 가드 그룹화). 가독성 기준 developer 결정 가능 — `pnpm test` 직후 (line 53) 도 허용
3. **로컬 검증 (필수)** — branch push 전 ci.yml YAML lint:
   ```bash
   # YAML 구문 검증 (로컬에 yamllint 또는 actionlint 설치 시)
   actionlint .github/workflows/ci.yml
   # 또는 GitHub Actions UI 에서 syntax error 확인 (PR push 후)
   ```
4. **PR 생성** — branch `feature/348-r1-guard-ci-integration`, base `develop`, draft 시작. PR 본문에 본 ADR Amendment v3 링크 + Concrete Prediction 검증 (`git diff` 결과) 박제
5. **PR check 결과 확인** — detect-and-test job 의 신규 step 5개 PASS 확인:
   - Rust 툴체인 설정 / Rust 빌드 캐시 / wasm-pack 설치 (3 step) ≈ 30s cold / 5s warm
   - R1 UI 회귀 가드 (r1-guard) ≈ 60s ~ 90s (Playwright + build + server + guard)
   - R1 diff 이미지 업로드 — fail 시에만 trigger (정상 PR 에서는 skip)
6. **메타 가드 실증** — 본 PR 머지 후 별도 PR 로 §"메타 가드 실증 절차 박제" (1)~(5) 수행
7. **CHANGELOG `[Unreleased]` `### Behavior Changes` 박제** — 예시:
   ```markdown
   ### Behavior Changes

   - R1 UI 회귀 가드가 모든 PR `detect-and-test` job 에서 자동 실행됨 — Linux baseline 12 PNG 대비 mismatch ratio ≤ 0.5% 검증, fail 시 diff 이미지 7일 보존 (artifact)
   - detect-and-test job 시간 ~5~8분 예상 (wasm-pack + Playwright + build + r1-guard 누적)
   - 로컬 macOS 검증 시 폰트 차이 false positive 회피: `SKIP_LOCAL=1 node apps/web/scripts/r1-ui-regression-guard.mjs`
   ```

**참조 문서**:

- 본 ADR (메인 + Amendment 1 + v2 + v3)
- 이슈 #348 본문 (후보 비교 + 사전 조건 + DoD)
- PR #347 commit `eadce1e` (본 v3 의 step 패턴 출처) → `70324b8` (분리 사유) → `d687072` (workflow 의 wasm-pack 3 step 검증 출처)
- workflow_dispatch run [`24956759573`](https://github.com/coseo12/astro-simulator/actions/runs/24956759573) (wasm-pack 3 step 재현 가능성 검증)
- PR #351 (Linux baseline 12 PNG 갱신 — chicken-and-egg 해소)

**비-범위 (절대 손대지 말 것)**:

- 메인 ADR §결정 1~5 / Amendment 1~v2 본문 — Amendment v3 는 §결정 본문 변경 안 함
- pixel diff 임계값 (0.5%) 변경 — 메타 가드 실증 결과로 필요 시 별도 amendment
- `r1-ui-regression-guard.mjs` / `r1-ui-regions.mjs` / `package.json` / `pnpm-lock.yaml` / baseline 12 PNG — 0 변경 (Concrete Prediction 검증 대상)
- 다른 R-Phase (R2~R10) baseline 캡처 — 본 인프라 도입 후 동일 패턴 재사용
- 후보 B (별도 job 분리) — 위험 #1 재검토 트리거 충족 시 분리 ADR
- 메타 가드 실증 PR 직접 생성 — 본 ADR 은 절차 박제만, 실측은 후속 PR

### 교차검증 반영 사항

본 Amendment v3 박제 직후 cross-validate 1회 (Gemini 2.5 Pro, 2026-04-26 21:44 KST). outcome=applied (exit 0). 로그: `.claude/logs/cross-validate-architecture-20260426-214432.log`. outcome JSON: `.claude/logs/cross-validate-architecture-20260426-214432-outcome.json`.

**Claude 자체 편향 4종 셀프 체크** (CLAUDE.md `## 교차검증` 호출 전 의무):

- **낙관적 일정**: 통과 — detect-and-test 누적 5~8분은 보수적 추정 (현재 ~3~5분 + wasm-pack ~30s + Playwright ~60s + build ~30s + guard ~30s). cold/warm 양극단 모두 박제
- **결합 간과**: 통과 — Swatinem/rust-cache 키 정합성 (verify-and-rust + bootstrap + detect-and-test) + port 3001 충돌 검토 + `pnpm build` silent fail 위험 모두 박제. workflow_dispatch run 24956759573 의 2m1s 완주가 결합 검증 증거
- **폐기 프레이밍**: 통과 — 후보 B/C 단순 폐기 아닌 재검토 트리거 박제 (위험 #1 의 8분 초과 시 후보 B 분리 ADR). 후보 C 만 의존성 추적 결과로 효과 0 으로 폐기 (이슈 본문 동일 결론)
- **순수주의**: 통과 — `if:` 가드에 `rust-toolchain.toml` / `Cargo.toml` 검사 추가는 harness upstream 호환성 + 다른 다운스트림 안전성 위해 수용 (이슈 본문 yaml 대비 보강 1). 1인 개발 컨텍스트 단순화 vs 일반화 트레이드오프 의식적 선택

**합의** — Claude 설계와 일치 (Gemini 가 "S급 ADR" 평가, 추가 의견 없이 합의):

- **wasm-pack 후보 A 채택 (단일 job 통합)** — Gemini 가 §1 "구조적 완성도" 에서 "정적 설계만으로는 발견하기 어려운 동적 통합 문제를 깊이 있게 다룬다는 증거" 로 합의. workflow_dispatch run 24956759573 의 2m1s 완주가 패턴 검증
- **CI 환경 우선주의 + Linux baseline (Amendment 1 §결정 1)** — Gemini 가 §2 "기술 결정 타당성" 에서 "업계 표준에 부합하는 매우 중요한 결정" 으로 강하게 합의
- **권한 최소화** — Gemini 가 §5 "보안" 에서 "최소 권한 원칙을 훌륭하게 준수" 로 합의. `r1-baseline-bootstrap.yml` (write) vs `ci.yml` (read-only) 분리
- **재검토 트리거 명시** — Gemini 가 §4 "확장성" 에서 "성숙한 엔지니어링 실천법. 노후화 방지 + 지속적 개선 유도 제도적 장치" 로 합의. 위험 #1 의 8분 초과 트리거 박제 호평
- **Concrete Prediction (35~40 라인 / 다른 파일 0)** — Gemini 가 별도 의견 제시 없음 (= 합의)
- **메타 가드 실증 false negative 위험 (1글자 텍스트 0.5% 임계 보장 안 됨)** — Gemini 가 별도 지적 없이 절차 박제 자체에 합의. 본 ADR 위험 #5 + 재검토 트리거 #4 로 사전 박제됨

**이견 수용**: 없음 (Gemini 가 본 ADR §결정 본문에 대한 이견 제시 안 함, 모두 합의)

**Claude 재분석으로 기각한 Gemini 제안**: 없음 (Gemini 의 2가지 개선 제안은 모두 합리적이며 본 ADR 비-범위 사유로 후속 분리)

**고유 발견 (후속 분리)** — Gemini 만의 제안 2건, 본 PR 비-범위로 분리 처리:

1. **메타 가드 자동화 (카나리아 테스트)** — Gemini 제안 §"개선 제안 1": 현재 1회성 수동 절차를 매주/매월 스케줄링된 CI 작업이 자동으로 잘못된 변경 브랜치 생성 + r1-guard fail 검증 + 브랜치 삭제 자동화. **범위 밖 사유**: 본 ADR 의 메타 가드 실증은 1회성 절차 박제 (Amendment 1 §Developer 인계 (e) + 메인 ADR §결과·재검토 조건 메타). 자동화는 R-Phase 인프라 누적 후 ROI 평가 대상 (R2 진입 전 무가치). **후속 이슈 분리 권고**:
   - 제목: `[chore] R1 메타 가드 자동화 — 카나리아 테스트 스케줄 도입 검토`
   - 본문 핵심: Gemini 설계 스케치 ("매주/매월 자동 false positive PR 생성 + r1-guard fail 검증 + 자동 close") + Builds on: #348 + 우선순위 low (R5 진입 시점 재검토)

2. **PR 코멘트에 diff 이미지 inline 업로드** — Gemini 제안 §"개선 제안 2": 현재 `actions/upload-artifact` (다운로드 + 압축해제 필요) 외에 PR 코멘트에 diff 이미지 직접 업로드하여 리뷰 효율성 향상. **범위 밖 사유**: `actions/upload-artifact` 만으로 본 ADR DoD 충족 (Amendment 1 §Developer 인계 의 Gemini 합의). PR 코멘트 직접 업로드는 (a) `pull-requests: write` 권한 추가 필요 (현재 ci.yml read-only 원칙 침범) (b) 이미지 호스팅 인프라 (GitHub 이슈/PR 첨부 API 또는 외부 CDN) 검토 (c) 본 ADR §결정 4 (CI 통합) 의 범위 밖. **후속 이슈 분리 권고**:
   - 제목: `[chore] R1 r1-guard 실패 시 diff 이미지 PR 코멘트 inline 첨부 검토`
   - 본문 핵심: Gemini 설계 스케치 + Builds on: #348 + 우선순위 low + ci.yml read-only 원칙 침범 트레이드오프 박제

후속 이슈 생성은 본 ADR Amendment v3 머지 직후 architect 또는 메인 오케스트레이터 책임 (CLAUDE.md `### 교차검증` §"분리 시 박제 규칙" — 즉시 생성 의무, 맥락 유실 방지).

---
