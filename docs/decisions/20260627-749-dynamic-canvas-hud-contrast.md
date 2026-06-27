# ADR — #749 동적 canvas 배경 위 HUD 텍스트 대비 보장 (배경 무관 대비 정책)

상태: Provisional (cross-validate 발동 대상 — 디자인 정책 선언. 메인 오케스트레이터가 cross-validate 결과 통합 후 Accepted 전이)
일자: 2026-06-27
이슈: [#749](https://github.com/coseo12/astro-simulator/issues/749)
관련 PR: (developer 구현 PR 시 박제)
관련 ADR: [`20260626-740-fg-tertiary-aa-contrast.md`](20260626-740-fg-tertiary-aa-contrast.md) (본 이슈의 분리 출처 — §교차검증 반영 사항 (나)), [`20260525-552-a11y-baseline-fix.md`](20260525-552-a11y-baseline-fix.md) (WCAG 자동 측정 가드 baseline), [`docs/architecture/principles.md`](../architecture/principles.md) §1 Visual Fidelity / §디자인 품질 루브릭 Craft(대비)

> 용어: [HUD](../glossary.md) = canvas 위에 직접 떠 있는 4코너 + scale-control 등 반투명 오버레이. r1-guard / D-T2 등은 [glossary](../glossary.md) 참조.

---

## 배경

`hud-corners.tsx` (4코너 텍스트 박스: 좌상 JD / 우상 renderer·fps / 좌하 focus / 우하 tier 범례) 와 `scale-control.tsx` (scale 라벨) 는 **canvas 바로 위에 떠 있는** 반투명 레이어다:

- `hud-corners`: `bg-bg-surface/60` 또는 `/70` + `backdrop-blur` (우하 tier 범례 L109 = `/60`)
- `scale-control`: `bg-bg-surface/70` + `backdrop-blur` (L137)

텍스트 색은 #740 에서 `fg-tertiary → fg-secondary (#9ba3b8)` 로 교체됐다. 그러나 **반투명 레이어 뒤로 시뮬레이터 canvas 가 투과**하므로, 밝은 천체(태양 disk / 밝은 별 / 은하수 glow)가 HUD 박스 정확히 뒤로 지나가면 텍스트의 **실효 대비가 WCAG AA(4.5:1) 아래로 떨어진다**.

`verify-a11y-baseline.mjs` 의 axe `color-contrast` 스캔은 **`.exclude('canvas')`** 로 canvas 를 측정 대상에서 제외한다 (DOM 색상만 봄). 즉 axe 는 캔버스 위 반투명 레이어의 실효 대비를 **원천적으로 측정 불가** — 이것이 #740 cross-validate(agy) 가 지목한 "동적 배경 사각" 의 근본이다.

본 ADR 은 (1) runtime 실측으로 결함의 물리적 실재 + 도달성을 확정하고, (2) 배경 무관 대비 보장 방식을 결정하며, (3) axe 로 못 잡는 동적 배경 결함의 회귀 가드를 정한다.

---

## Forensic 측정 결과 (measurement-first — volt #14/#67)

> 측정 환경: feature/749-dynamic-canvas-hud-contrast @ develop 3cbda78, dev 서버 localhost:3001, Playwright 1280×720. debug 스크립트 4종 (`_debug-749-*-tmp.mjs`) 으로 측정 후 즉시 rm (volt #67 패턴).

### 측정 1 — Q1 물리 (결정적, GPU 무관)

텍스트 글리프는 **불투명** (`text-fg-secondary` 에 opacity 없음 — computed `color: rgb(155,163,184)` = `#9ba3b8`, `font-size: 11px`, `weight: 400`, `text-shadow: none` 실측 확인). 따라서 글리프 색은 canvas 와 무관하게 `#9ba3b8` 고정이고, **변하는 것은 글리프 뒤 유효 배경** = `bg-surface(#141721) @ α` over canvasPixel.

axe 식 WCAG 대비 (전경 `#9ba3b8` vs alpha-composited 유효 배경):

| canvas 픽셀                                            | hud-corners (α=0.6) | scale-control (α=0.7) |
| ------------------------------------------------------ | ------------------- | --------------------- |
| space-clear `rgb(8,9,13)` (우주 기본)                  | **7.45** ✅         | **7.36** ✅           |
| dim-star `rgb(64,71,102)` (실측 태양focus 우측 HUD 뒤) | 5.62 ✅             | 6.00 ✅               |
| milkyway-glow `rgb(158,168,199)`                       | **3.13** ❌         | **3.93** ❌           |
| bright-star `rgb(255,250,245)`                         | **1.90** ❌         | **2.68** ❌           |
| sun-white `rgb(255,255,255)`                           | **1.86** ❌         | **2.62** ❌           |

**AA 미달 임계 (canvas 단색 gray 휘도)**: hud-corners(α=0.6) = **111 이상**, scale-control(α=0.7) = **140 이상** 에서 미달. 즉 canvas 가 중간 밝기 이상이면 미달 — 밝은 천체는 충분히 이 임계를 넘는다.

### 측정 2 — Q2 도달성 (실 사용 재현)

도달 가능한 시나리오에서 HUD 박스 뒤 canvas brightest 픽셀 실측 → 실효 대비:

| 시나리오                       | hud-bottom-right             | scale-label            | hud-top-right                | hud-top-left |
| ------------------------------ | ---------------------------- | ---------------------- | ---------------------------- | ------------ |
| 기본 (별배경 ON)               | rgb(8,9,13) 7.45 ✅          | 7.36 ✅                | 7.36 ✅                      | 7.36 ✅      |
| 태양 focus 중앙                | 7.45 ✅                      | rgb(64,71,102) 6.00 ✅ | 6.00 ✅                      | 7.36 ✅      |
| **태양 focus → 우하단 드래그** | **rgb(255,255,255) 1.86 ❌** | 7.36 ✅                | 7.36 ✅                      | 6.00 ✅      |
| **태양 focus → 우상단 드래그** | 7.45 ✅                      | 7.36 ✅                | **rgb(255,255,221) 2.65 ❌** | 7.36 ✅      |

**핵심**: `?focus=sun` 진입 후 마우스 드래그로 태양 disk 를 우하단/우상단 코너 뒤로 유도하면 **실효 대비 1.86:1 / 2.65:1 (AA 미달) 이 실측 재현**된다. 즉 **NO-OP 아님 — 실 사용자 조작으로 도달 가능한 실재 결함**.

### 측정 3 — 측정 함정 2종 (재현 시 주의)

1. **headless swiftshader 는 starfield 를 끈다**: 별배경 gating(`resolveStarfieldVisible`)이 소프트웨어 렌더(swiftshader) 감지 시 false 반환 (`#745`). headless chromium 의 별배경 maxLum=0.003 (검정)은 실 GPU 미반영. 별배경 worst-case 는 실 GPU 또는 Q1 물리식으로 평가해야 한다 (volt #32 — "headless readback ≠ 실 렌더").
2. **screenshot p5/p95 픽셀 대비는 axe식 대비와 다르다**: 초기 측정에서 흰 div 주입 후 screenshot p5/p95 가 19.90:1 PASS 로 나왔으나, 이는 글리프 anti-alias·border 픽셀을 잘못 집은 false-positive. **올바른 측정은 axe식 (전경 color vs 유효 배경)** — computed `color` + alpha-composited 배경. 본 ADR 의 측정 1 이 정확한 방법 (volt #32 readback 함정 변형).

### 영향 영역 확정

이슈가 지목한 hud-corners:109 / scale-control:137 뿐 아니라 **hud-corners 의 4코너 텍스트 박스 전부** (좌상 JD / 우상 renderer·fps / 좌하 focus / 우하 tier) 가 동일 패턴이다. 우상(renderer)·우하(tier) 는 r1-region (`data-r1-region="hud-top-right" / "hud-bottom-right"`) 이라 **픽셀 변경 시 r1-guard baseline 재생성 필요**. scale-control 은 r1-region 아님.

---

## 후보 비교

| 후보                                                                          | canvas 무관 AA 보장                             | axe 자동 측정 통과                                          | 유리 미학(backdrop-blur) 보존                             | r1 baseline 영향      | 판정                                                                                     |
| ----------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------- |
| **(A) text-shadow** `0 1px 2px rgba(0,0,0,.8)`                                | △ 시각 가독성만 개선                            | **❌** axe 는 text-shadow 를 대비 계산에 미반영 → FAIL 유지 | ✅ 완전 보존                                              | 소 (글리프 외곽 halo) | **기각** — 자동 가드 불가 (아래 §가드 참조). 단 보조 강화로 병용 검토 가능               |
| **(B) 반투명도 상향** `/60·/70 → /90+`                                        | △ α=0.9 도 sun-white 5.36 (경계), milkyway 통과 | △ canvas exclude 라 무의미                                  | **❌** α≥0.9 면 backdrop-blur 가 거의 무의미 (뒤 안 비침) | 중 (배경 톤 변화)     | **기각** — α=0.8 은 sun-white(3.77) 여전히 미달, α=0.9+ 는 유리감 상실. trade-off 가파름 |
| **(C) 불투명 어두운 backing** (텍스트 박스 배경을 canvas 무관 solid 어두운색) | **✅ 항상 7.09:1+**                             | ✅ (정적 CSS 검사로 충분)                                   | △ backing 만 불투명, 단 backdrop-blur 효과는 약화         | 중 (배경 톤 변화)     | **선택 후보 1**                                                                          |
| **(D) NO-OP**                                                                 | —                                               | —                                                           | —                                                         | —                     | **기각** — 측정 2 에서 미달 실측 재현. 결함 실재                                         |

> α·gray 휘도 임계는 모두 측정 1 의 alpha-compositing 식 산출. 후보 B 의 α 별 sun-white 대비: α0.6=1.86 / 0.7=2.62 / 0.8=3.77 / 0.9=5.36 / 1.0=7.09.

### 후보 A 의 핵심 한계 (measurement-first 정정)

text-shadow 는 **시각적으로는 가장 우아한 해법** (유리 미학 완전 보존, 글리프 외곽에 어두운 분리선)이지만, **axe color-contrast 는 text-shadow 를 대비 계산에 반영하지 않는다**. 따라서 A 단독으로는 어떤 axe 기반 가드도 통과시킬 수 없다. 단 — **본 결함은 axe 가 canvas 를 exclude 하므로 애초에 axe 로 측정 불가** (측정 3-1). 즉 가드 자체가 axe 가 아닌 다른 방식이어야 하며, 이 경우 A 의 "axe 미통과" 단점은 무의미해진다. A 를 **시각 강화 + 정적 CSS 가드** 조합으로 되살릴 여지가 있다 (§가드, §developer 인수인계 참조).

---

## 결정

### 결정 1 — 디자인 정책 선언 (canvas 위 텍스트는 배경 무관 대비 보장)

> **"canvas 바로 위에 떠 있는 텍스트(HUD 4코너 / scale-control 등)는 canvas 휘도와 무관하게 WCAG AA(4.5:1)를 보장해야 한다. 반투명 배경(`bg-surface/α`)에만 의존하는 텍스트는 밝은 천체 투과 시 AA 미달이므로 금지. 배경 무관 보장 장치(불투명 텍스트 backing 또는 text-shadow 외곽 대비)를 적용한다."**

이 정책은 #740 의 "정적 표면 토큰 색 정책" 을 **동적 canvas 표면** 으로 확장한다. #740 은 모달/패널(canvas 위 backdrop dim 존재, 직접 투과 아님)을, 본 ADR 은 canvas 직접 투과 HUD 를 다룬다 — 직교.

### 결정 2 — 구현 방식: 후보 C(불투명 어두운 backing) 우선, A(text-shadow) 보강 병용 검토

developer 가 다음 2개 절충안 중 **디자인 회귀 qa(유리 미학 보존 + 가독성)** 로 최종 선택:

- **C-주**: HUD 텍스트 박스 배경을 canvas 휘도와 무관하게 충분히 어둡게 — `bg-surface/α` 의 α 를 텍스트 영역만 불투명에 가깝게(예: 텍스트 글리프 뒤에 solid 어두운 layer) 하거나, **text 자체에 `text-shadow` + 박스 배경 약간 강화** 조합. 목표: 밝은 canvas(sun-white)에서도 측정 1 식으로 **≥ 4.5:1**.
- **A-보강**: `text-shadow: 0 1px 2px rgba(0,0,0,0.85)` 를 HUD 텍스트에 추가 — 유리 미학을 최대 보존하면서 글리프 외곽 대비 확보. 단 A 단독은 정량 보장 약하므로 **C 와 병용** (배경 강화 + shadow). 최종 조합은 측정 1 식으로 sun-white ≥ 4.5:1 을 만족해야 함.

**정량 DoD (구현 방식 무관)**: 측정 1 의 alpha-compositing 식으로 sun-white(rgb 255,255,255) canvas 기준 **모든 대상 HUD 텍스트가 ≥ 4.5:1**. text-shadow 사용 시엔 shadow 를 별도 정량(WCAG 미반영)이므로, **배경 강화만으로도 sun-white 에서 ≥ 4.5:1 을 1차 보장**하고 text-shadow 는 시각 보조로 둔다 (가드 가능성 확보).

### 결정 3 — 회귀 가드: 정적 CSS 속성 검사 + canvas 강제 밝힘 시나리오 1개 (택1, §ROI 참조)

axe 는 canvas exclude 로 본 결함을 못 잡으므로(측정 3-1), 가드는 axe 외 방식이어야 한다. **ROI 5문 체크 후 가드 (i) 정적 CSS 속성 검사 채택** (아래 §ROI). canvas 강제 밝힘 시나리오 스크린샷 가드(ii)는 비용 대비 ROI 낮음 — §ROI 참조.

### 결정 4 — 범위

- **대상**: `hud-corners.tsx` 4코너 텍스트 박스 전부 + `scale-control.tsx` 라벨. (canvas 직접 투과 + 텍스트 보유)
- **비대상**: 모달/패널 (backdrop dim 위 — canvas 직접 투과 아님, #740 이 이미 처리). 전역 디자인 토큰 개편. `time-bar`/`unit-toggle`/`mode-switcher` 등 다른 canvas-위 컨트롤 — **단 동일 패턴이면 후속 검토** (재검토 조건).

---

## 회귀 가드 ROI 5문 체크 (CLAUDE.md 스프린트 계약 §6)

후보 가드: **(i) 정적 CSS 속성 검사** (HUD 텍스트 박스가 배경 무관 대비 장치 — text-shadow 또는 불투명 backing — 를 가졌는지 정적 검사) vs **(ii) canvas 강제 밝힘 시나리오 스크린샷 + 대비 측정**.

1. **구축 비용 vs 보호 라인**: (i) 정적 검사 = 신규 스크립트 ~30줄 또는 기존 verify-a11y-baseline 에 HUD CSS assertion 추가. (ii) 시나리오 가드 = headless GPU 함정(측정 3-1) + 태양 코너 유도 비결정성 + r1 baseline 처럼 flake 위험. → **(i) 비용 << (ii)**.
2. **몇 줄 보호하는가**: HUD 텍스트 박스 5~6곳 + 미래 신규 HUD. text-shadow/backing 제거 회귀를 잡음.
3. **조용한 퇴행 vs 빌드 실패**: 대비 회귀는 **조용히 퇴행** (빌드 통과). → 가드 필요.
4. **인접 유닛/타입/문서 간접 보증**: 불가능 (런타임 합성 대비는 정적 분석으로 직접 산출 불가). 단 **"text-shadow 또는 불투명 backing 존재"** 라는 **구조 불변식**은 정적 검사 가능 — (i) 가 이 간접 보증.
5. **fail-fast / 미래 인프라**: (i) 는 CSS 속성 부재 시 즉시 fail (fallback 없음, guard-design-principles 정합). axe 인프라로는 불가하므로 미래에 저렴해지지 않음 — 지금 (i) 가 최저 비용.

**결정: 가드 (i) 정적 CSS 속성 검사 채택.** (ii) 시나리오 스크린샷 가드는 비결정성·GPU 함정·flake 위험으로 ROI 역전 — 비채택. 단 (i)는 "장치 존재"만 보장하고 "대비 ≥ 4.5"를 직접 측정하진 않으므로(text-shadow 는 WCAG 미반영), **구현 PR 의 1회성 측정(측정 1 식)으로 정량 검증** + 가드는 구조 불변식 회귀만 차단하는 2층 구조. 이 한계는 §재검토 조건에 박제.

> **가드 정밀도 주의 (guard-design-principles, dev D1 precision 정정 패턴)**: (i) 정적 검사를 "HUD 텍스트 박스에 text-shadow 클래스 존재" 같은 broad 매칭으로 짜면 false-positive/negative 위험. **`data-*` 마커 또는 명시 클래스 화이트리스트 기반 precision 매칭** 권고 — developer 가 D1 에서 실측 false-positive 확인 후 정정.

---

## 결과·재검토 조건

- **결과 예측 (Concrete Prediction)**: className/CSS 변경만 — 코어 로직/데이터 0. `git diff --stat` 예측: `hud-corners.tsx` + `scale-control.tsx` (2 파일), 가드 스크립트 1 (신규 또는 verify-a11y-baseline 확장), r1 baseline JSON (hud-top-right/hud-bottom-right 픽셀 변경 시). 코어 패키지 0.
- **DoD 검증**:
  - 측정 1 식(alpha-compositing) 으로 sun-white canvas 기준 대상 HUD 텍스트 전부 ≥ 4.5:1 (구현 PR 1회성 실측 — 측정 2 의 태양 코너 유도 시나리오 재현 후 미달 해소 확인).
  - 가드 (i) 정적 CSS 검사 PASS + negative 입증 (장치 제거 시 fail).
  - r1-guard baseline 재생성 (hud-top-right/hud-bottom-right 픽셀 변경 시) — `gh workflow run r1-baseline-bootstrap --ref feature/749-dynamic-canvas-hud-contrast -f target_branch=feature/749-dynamic-canvas-hud-contrast`.
  - 디자인 회귀 qa: 유리 미학(backdrop-blur) 보존 + 어두운 배경(우주)에서 톤 회귀 없음 실 Chrome GUI 확인.
- **재검토 조건**:
  - `time-bar`/`unit-toggle`/`mode-switcher`/`bookmark-button` 등 다른 canvas-위 컨트롤이 동일 결함이면 본 정책 적용 후속 이슈.
  - 가드 (i) 의 "장치 존재 ≠ 대비 보장" 한계: text-shadow 파라미터가 약화되거나 backing α 가 낮아지면 (i)는 통과하나 실효 대비 미달 가능. 신규 HUD 추가 시 측정 1 식 1회 실측 의무 박제.
  - 디자인 토큰 시스템 개편(표면 배경/전경 밝기 변경) 시 측정 1 임계 재산출.
  - 실 GPU 환경 별배경 worst-case 정밀 측정이 필요해지면(현재 Q1 물리식으로 대체) 실 GPU CI 가드 검토.

---

## 교차검증 반영 사항

> **Provisional 상태 — cross-validate 미통합.** 본 ADR 은 **디자인 정책 선언**(canvas 위 텍스트 배경 무관 대비 보장)을 담아 cross-validate 발동 대상(프로젝트 원칙·철학 선언 앵커)이다. architect sub-agent 는 ADR 초안까지 작성하고, **cross-validate(agy) 1회 호출 + 결과 4축 분류 통합 + Accepted 전이는 메인 오케스트레이터가 후속 처리**한다 (sub-agent 격리에서 cross-validate 호출 시 outcome JSON 파싱·reminder 분기까지 메인이 일관 관리). 통합 후 본 섹션을 합의/이견/고유 발견/기각 4축으로 채우고 `상태: Accepted (cross-validate <YYYY-MM-DD>)` 로 전이한다.

### Claude 편향 셀프 체크 (cross-validate 호출 전 기록)

- **낙관적 일정**: 통과 — className/CSS 변경 저위험이나 r1-guard baseline 재생성 + 디자인 회귀 qa + 가드 precision 정정(D1)을 명시 비용으로 박제.
- **결합 간과**: 통과 — r1-region(hud-top-right/bottom-right) baseline 결합, axe canvas-exclude 한계(측정 3-1), headless swiftshader starfield gating 함정(측정 3-1)을 본문에 명시. **잠재 미통과 축**: cross-validate 에 "HUD 외 다른 canvas-위 컨트롤(time-bar 등) 동일 결함 누락 여부" + "text-shadow 가 fps/렌더 성능에 미치는 영향" 을 명시 질문으로 삽입 권고.
- **폐기 프레이밍**: 해당 없음 (신규 정책 박제).
- **순수주의**: 잠재 미통과 → text-shadow(시각 우아) vs 불투명 backing(정량 보장) 사이에서 "정량 측정 가능성" 을 우선해 C 를 주 후보로 둔 것이 a11y 순수주의 편향일 수 있음. **cross-validate 명시 질문**: "유리 미학 보존이 a11y 정량 가드보다 우선되는 케이스가 있는가? text-shadow 단독 + 정적 가드 조합이 더 합리적인가?" 삽입 권고.
