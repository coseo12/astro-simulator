# ADR — #740 작은 텍스트 `text-fg-tertiary` AA 대비 전수 fix + 토큰 사용 정책 가드

상태: Provisional (cross-validate 후 Accepted 전이 — 메인 후속 처리)
일자: 2026-06-26
이슈: [#740](https://github.com/coseo12/astro-simulator/issues/740)
관련 PR: PR #739 ([#737] 온보딩 — 신규 표면 tertiary→secondary 선행 fix, 3.24→7.09:1)
관련 ADR: [`20260525-552-a11y-baseline-fix.md`](20260525-552-a11y-baseline-fix.md) (WCAG 2.2 AA 자동 측정 가드 baseline 도입), [`docs/architecture/principles.md`](../architecture/principles.md) §디자인 품질 루브릭 Craft(대비)

---

## 배경

`--fg-tertiary (#626978)` 디자인 토큰이 **모든 표면 배경에서 WCAG 2.1 AA 작은 텍스트 기준(4.5:1) 미달**이다.

| 전경                    | bg-surface #141721 | bg-elevated #1c2032 | bg-overlay #252a40 |
| ----------------------- | ------------------ | ------------------- | ------------------ |
| **fg-tertiary #626978** | **3.25** ❌        | **2.93** ❌         | **2.57** ❌        |
| fg-secondary #9ba3b8    | 7.09 ✅            | 6.39 ✅             | 5.61 ✅            |

#737 온보딩 qa 동적 검증의 axe `color-contrast (serious)` 가 단일 표면이 아닌 토큰 레벨 전역 결함임을 드러냈다. PR #739 는 온보딩 신규 표면만 fix(cross-validate 고유 발견 후속 분리 프로토콜)했고, 기존 패널/모달의 작은 텍스트가 본 라운드로 분리됐다.

### 타이포그래피 스케일 측정 (`apps/web/app/[locale]/globals.css` L58~66, root 16px)

| 클래스         | 크기                 | WCAG 분류                      |
| -------------- | -------------------- | ------------------------------ |
| `text-body`    | 0.9375rem = **15px** | 작은 텍스트 (< 18px, non-bold) |
| `text-body-sm` | 0.8125rem = **13px** | 작은 텍스트                    |
| `text-mini`    | 0.75rem = **12px**   | 작은 텍스트                    |
| `text-caption` | 0.6875rem = **11px** | 작은 텍스트                    |
| `text-[10px]`  | **10px**             | 작은 텍스트                    |

WCAG "large text" = ≥ 18px(1.5rem) regular **또는** ≥ 14px bold. 위 모든 클래스가 large text 기준 미달이므로 **4.5:1 임계가 적용**된다. 즉 본 디자인 토큰 시스템에서 `text-fg-tertiary` 가 붙는 거의 모든 가시 텍스트가 AA 미달이다.

---

## 후보 비교

### 결정점 1 — 색상 교체 전략

| 후보                                                         | 변경                                                   | 명도 계층 영향                                                                  | 결과                                                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **(a) 사용처 교체 `text-fg-tertiary` → `text-fg-secondary`** | 작은 텍스트 사용처만 secondary 로 승격. 토큰 정의 불변 | primary(15.02) > secondary(7.09) > tertiary(3.25) 계층 보존. AA 통과(5.61~7.09) | **선택** — #739 선례 동일. 토큰 의미(disabled/tertiary 위계) 보존, 큰 텍스트·dev 오버레이 불필요 변화 0 |
| (b) 토큰 자체 밝히기 (`--fg-tertiary` 값 변경)               | tertiary 색 자체를 AA 통과까지 밝힘                    | overlay 4.5 통과까지 밝히면 secondary(5.61)와 명도 근접 → **3계층 위계 붕괴**   | **기각** — 큰 텍스트의 의도적 tertiary(약한 위계)까지 전부 밝아짐. 전역 디자인 회귀                     |
| (c) 작은 텍스트만 별도 토큰 신설                             | `--fg-tertiary-aa` 추가                                | 토큰 수 증가, 사용처마다 판단 필요                                              | **기각** — secondary 가 이미 존재하고 AA 통과. YAGNI                                                    |

### 결정점 2 — 회귀 차단 가드

기존 인프라 실측:

- `verify:a11y` (`scripts/browser-verify-a11y.mjs`) — axe WCAG 2.1 AA, **`/ko` 기본 상태만** 스캔. 모달/패널 미오픈
- `verify:a11y-baseline` (`scripts/verify-a11y-baseline.mjs`) + `a11y-baseline-guard.yml` CI — axe WCAG 2.2 AA, **마찬가지로 `/ko` 기본 상태만** 스캔. `cur.axe.violations > base.axe.violations` 카운트 비교
- eslint flat config — 커스텀 규칙 없음, `eslint-plugin-tailwindcss` 미설치

**핵심 진단**: 두 a11y 가드 모두 **모달/패널을 열지 않아** 본 결함을 애초에 감지하지 못했다 (게이트 사각). #739 fix 후에도 기존 패널/모달은 baseline 스캔 범위 밖이라 회귀가 조용히 재유입될 수 있다.

| 후보                                                                            | 구축 비용                                                                                                                                                                                                                                           | 보호 범위                                           | 거짓 음성 위험                                                                                      | ROI                                                                 |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| (A) ESLint 커스텀 규칙 (작은 텍스트 클래스 + `text-fg-tertiary` 동시 사용 금지) | `no-restricted-syntax` AST 매칭 또는 신규 플러그인. className 문자열 정적 파싱 — 동적 클래스(`text-fg-tertiary/70`, 조건부 분기 `:` 'text-fg-tertiary')·인접 부모 상속(`<tr text-fg-tertiary>` + `<table text-caption>`)·실제 배경 대비를 **못 봄** | 정적 클래스 동시 출현만                             | **높음** — 실제 렌더 대비를 못 봐 false negative 다수. dev 오버레이/disabled 도 잡아 false positive | 낮음                                                                |
| (B) axe CI 게이트 강화 (주요 패널/모달 open 상태 color-contrast 스캔)           | 기존 `verify-a11y-baseline.mjs` 에 모달/패널 open 시퀀스 추가. 신규 CI 워크플로 0 — 기존 `a11y-baseline-guard.yml` 재사용                                                                                                                           | 실제 렌더 색상 × 실제 배경 × open 상태. axe 가 계산 | 낮음 — 실 DOM 대비 측정                                                                             | **높음** — 게이트 사각 자체를 메움. 구축 비용 ≈ 측정 시퀀스 수십 줄 |
| (C) A + B 둘 다                                                                 | A 비용 + B 비용                                                                                                                                                                                                                                     | —                                                   | —                                                                                                   | 중복 — B 가 A 의 보호 범위를 포함하고 거짓 음성도 적음              |

**선택: (B)**. ROI 근거 (CLAUDE.md "테스트 ROI 5문 체크"):

1. 구축 비용 vs 보호 라인 — 신규 CI 0, 기존 스크립트에 open 시퀀스 추가(수십 줄)로 20여 곳 + 미래 신규 패널 보호. 비용 < 보호
2. 조용한 퇴행 vs 빌드 실패 — 색상 회귀는 **조용히 퇴행**(빌드는 통과). → 가드 필수
3. 인접 유닛/타입/문서 간접 보증 — 불가(런타임 렌더 대비는 정적 분석 불가). (A) 의 근본 약점
4. 미래 인프라로 저렴해질 가능성 — 이미 axe 인프라 존재, 지금이 최저 비용
5. fail-fast — open 시퀀스 axe violation > baseline 이면 즉시 fail. fallback 분기 없음 (guard-design-principles 정합)

(A) 는 측정-first 원칙 위반(정적 클래스 ≠ 실제 대비). 본 라운드 비채택. 단 `text-fg-tertiary/70` 처럼 **opacity 가 대비를 더 악화**시키는 변형은 클래스만으로 판정 불가하므로 (A) 는 원천적으로 부적합.

---

## 결정

1. **작은 텍스트(`text-body`/`text-body-sm`/`text-caption`/`text-mini`/`text-[10px]`) + `text-fg-tertiary` 조합을 `text-fg-secondary` 로 교체** (사용처 교체, 토큰 정의 불변). opacity 변형(`/70`)은 **opacity 제거 후 solid secondary** 로 교체 (secondary/70 도 AA 미달이므로 — 측정 §참조).
2. **토큰 사용 정책 선언**: _"작은 텍스트(< 18px non-bold)에 `text-fg-tertiary` 단독 사용 금지 — AA 미달. `text-fg-secondary` 사용. tertiary 는 large text 또는 disabled/non-text 위계 표현에 한정."_
3. **회귀 가드는 axe CI 게이트 강화 (B)** — `verify-a11y-baseline.mjs` 에 주요 모달/패널 open 상태 color-contrast 스캔 추가. 기존 `a11y-baseline-guard.yml` 재사용, fail-fast.
4. **범위 제외 분류** (아래 §범위 분류 참조): production-DCE dev 오버레이 / disabled 컴포넌트(WCAG 1.4.3 면제) / large text tertiary.

### opacity 변형 측정 근거 (결정 1 보강)

| 전경                                         | bg-surface | bg-elevated | bg-overlay | 판정         |
| -------------------------------------------- | ---------- | ----------- | ---------- | ------------ |
| `tertiary/70` (현행 sensitivity 186/190/194) | 2.22       | 2.10        | 1.93       | ❌ 전부 미달 |
| `secondary/70` (opacity 유지 시)             | 4.12       | 3.87        | 3.55       | ❌ 전부 미달 |
| `secondary` (solid)                          | 7.09       | 6.39        | 5.61       | ✅ 전부 통과 |

→ `/70` slider 라벨은 색상 교체만으로 부족. **opacity 제거 필수**.

---

## 범위 분류 (grep 실측, `feature/740` @ develop 96cd8b0)

전체 `text-fg-tertiary` 출현 38건을 3 분류로 정밀 확정.

### A. 교체 대상 (작은 텍스트 + AA 미달) — 21건

| 파일                                    | 라인                                 | 현행 클래스 핵심                                                                                             | 비고                                         |
| --------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| `panels/celestial-info-panel.tsx`       | 57, 74, 103, 105, 159, 204, 209, 225 | `text-caption text-fg-tertiary` (8곳)                                                                        | dt 라벨/empty/blocked/nameEn/kind/audit 헤더 |
| `panels/satellite-info-panel.tsx`       | 104, 129, 149                        | 104 `<tr text-fg-tertiary>` + 부모 `<table text-caption>` 상속 / 129 `text-[10px]` 배지 / 149 `text-caption` | 104 의 thead 셀은 caption 상속               |
| `layout/about-modal.tsx`                | 114, 115, 123, 132                   | `text-caption text-fg-tertiary` (4곳)                                                                        | purpose/license/스케일 정책/정밀도           |
| `layout/sensitivity-settings-modal.tsx` | 122, 141, 186, 190, 194              | 122/141 `text-caption` / 186/190/194 `text-[10px] text-fg-tertiary/70`                                       | **186/190/194 는 opacity 제거 후 secondary** |
| `panels/scenario-presets.tsx`           | 181                                  | `text-caption text-fg-tertiary`                                                                              | preset description                           |
| `panels/mass-slider.tsx`                | 22, 73                               | `text-caption text-fg-tertiary` (2곳)                                                                        | empty / 안내                                 |
| `panels/celestial-tree.tsx`             | 86                                   | `text-fg-tertiary text-caption`                                                                              | nameEn 보조 텍스트                           |
| `layout/time-bar.tsx`                   | 17                                   | `text-caption text-fg-tertiary`                                                                              | placeholder 텍스트("D5에서 구현")            |

> 합계 라인 = celestial-info 8 + satellite-info 3 + about 4 + sensitivity 5 + scenario 1 + mass 2 + tree 1 + time-bar 1 = **25 라인** (위 표는 파일 단위로 묶음). 이슈의 "~20곳" 보다 정밀 카운트는 25.

### B. 검토 후 분류 — 경계 케이스

| 파일                                | 라인 | 현행                                                                                | 판정                | 근거                                                                                                                                                                |
| ----------------------------------- | ---- | ----------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui/free-fly-key-hint.tsx`          | 126  | `✕` 닫기 버튼 `text-fg-tertiary hover:text-fg-primary text-body` (15px)             | **교체 권고**       | `✕` 는 텍스트(아이콘 폰트 아님). 15px = 작은 텍스트. 인터랙티브 컨트롤 resting 상태 대비도 1.4.3 대상. secondary 로                                                 |
| `ui/satellite-zoom-tooltip.tsx`     | 214  | 동일 `✕` 버튼 `text-body`                                                           | **교체 권고**       | 동상                                                                                                                                                                |
| `layout/hud-corners.tsx`            | 88   | `×` 알림 닫기 `text-fg-tertiary hover:text-fg-primary px-1` (크기 미지정→부모 상속) | **교체 권고**       | 부모 컨테이너 크기 확인 후 secondary. 인터랙티브                                                                                                                    |
| `layout/hud-corners.tsx`            | 109  | HUD tier 범례 `text-caption text-fg-tertiary` over `bg-bg-surface/60 backdrop-blur` | **교체 권고(주의)** | `data-r1-region="hud-bottom-right"` — **r1-guard baseline 영향 가능**. 반투명 canvas 배경이라 실측 대비는 axe 로 확인. 색 변경 시 r1 baseline 재생성 필요할 수 있음 |
| `layout/scale-control.tsx`          | 137  | `text-caption text-fg-tertiary` over `bg-bg-surface/70 backdrop-blur` HUD           | **교체 권고(주의)** | scale 라벨. 반투명 HUD. r1 영향 확인                                                                                                                                |
| `components/sim-canvas.dynamic.tsx` | 13   | 로딩 placeholder `text-fg-tertiary text-body-sm`                                    | **교체 권고**       | dynamic import fallback. 13px 작은 텍스트                                                                                                                           |

> B 군은 모두 작은 텍스트/인터랙티브라 **교체 권고**. 단 hud-corners:109 / scale-control:137 은 r1-guard `data-r1-region` 또는 HUD 영역이라 **색 변경 후 r1 baseline 재생성 필요 여부를 developer 가 확인** (메모리 SSoT: r1 baseline bootstrap = `gh workflow run r1-baseline-bootstrap --ref feature/740-fg-tertiary-aa-contrast -f target_branch=feature/740-fg-tertiary-aa-contrast`).

### C. 범위 제외 — 변경 금지

| 파일                               | 라인               | 현행                                                                                | 제외 근거                                                                                                                                                                                                                   |
| ---------------------------------- | ------------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `layout/lod-dev-overlay.tsx`       | 160, 172, 178, 210 | dev LOD 오버레이 tertiary                                                           | **production DCE** — `LodDevOverlay` 가 `process.env.NODE_ENV === 'production'` 시 `null` 반환, 함수 본체 전체 dead-code 제거. production 미존재 → AA 무관. dev-only                                                        |
| `layout/physics-engine-toggle.tsx` | 75                 | `text-fg-tertiary opacity-50 cursor-not-allowed` (disabled 분기)                    | **WCAG 1.4.3 면제** — disabled/inactive 컴포넌트는 대비 요건 면제. `disabled` + `aria-disabled` + `opacity-50` 명시                                                                                                         |
| `panels/celestial-info-panel.tsx`  | 147, 149           | `<span text-fg-tertiary>표시 크기 ·</span>` — 부모 `text-caption text-fg-secondary` | **재확인 필요 → 교체 권고로 분류**. 부모가 caption(11px)이므로 이 span 들도 작은 텍스트. 부모 색이 secondary 인데 span 만 tertiary 로 약화한 의도적 위계지만 AA 미달 → secondary 로. **C 가 아니라 A 로 이동** (아래 §정정) |

> **정정**: celestial-info-panel:147/149 는 부모 caption 상속으로 11px 작은 텍스트 → **A 교체 대상**. C 표에서는 판단 과정을 남기되 최종 분류는 A. developer 는 147/149 도 secondary 로 교체. (단 이 두 span 은 "약한 보조 위계" 의도라, 부모 secondary 와 동색이 되어 위계가 사라지므로 — 디자인 회귀 qa 에서 정보 위계 무붕괴 확인 대상)

---

## 결과·재검토 조건

- **결과 예측**: 색상 교체는 className 문자열 변경만 — 코어 로직/데이터 0. `git diff --stat` 예측: web `.tsx` 약 8~10 파일, 가드 스크립트 1 (`verify-a11y-baseline.mjs`), baseline JSON 1, r1 baseline(필요 시). 코어 패키지 0.
- **DoD 검증**: `verify:a11y` + 강화된 `verify:a11y-baseline` (모달/패널 open) color-contrast 0 위반. 디자인 회귀 qa(명도 계층 시각 확인).
- **재검토 조건**:
  - 신규 패널/모달 추가 시 작은 텍스트에 tertiary 사용 → 본 정책 위반. 강화 가드가 open 시퀀스에 신규 표면을 포함하도록 동기화 필요
  - 디자인 토큰 시스템 개편(예: 표면 배경 밝기 변경) 시 secondary 대비 재측정
  - `text-fg-tertiary` 의 정당한 잔존(large text / disabled / non-text)이 늘어 (A) ESLint 규칙 ROI 가 역전되면 재검토

---

## 교차검증 반영 사항

> 상태 Provisional — 본 ADR 은 **토큰 사용 정책 선언**(프로젝트 원칙) + cross-validate 발동 대상. cross-validate 는 **메인 오케스트레이터가 후속 처리** (architect sub-agent 범위에서는 호출하지 않고 발동 대상임을 표시만). 결과 통합 후 4축 분류(합의 / 이견 수용 / 기각 / 고유 발견) 박제 + Accepted 전이.

### Claude 편향 셀프 체크 (호출 전, CLAUDE.md `## 교차검증` 4종)

- 낙관적 일정: 통과 — 색상 교체는 저위험이나 r1-guard baseline 재생성·디자인 위계 qa 를 명시 비용으로 박제
- 결합 간과: 통과 — hud-corners/scale-control 의 r1-guard 결합, sensitivity opacity 결합을 §범위 분류에 명시
- 폐기 프레이밍: 해당 없음 (신규 정책 박제)
- 순수주의: **잠재 미통과** — "작은 텍스트 tertiary 전면 금지" 가 과도한 순수주의일 수 있음. disabled/large text 예외를 §C 에 명시해 완화. cross-validate 프롬프트에 "secondary 일괄 승격이 명도 위계(보조 정보 약화 의도)를 과하게 평탄화하는가" 를 명시 질문으로 삽입 권장
