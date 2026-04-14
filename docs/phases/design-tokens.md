# 디자인 토큰

프로젝트: 웹 기반 천체물리 시뮬레이터
상태: 확정 (2026-04-13)
철학: NASA 신뢰감 + 기술 계기판 독창성 + 흑체복사 기반 팔레트

---

## 1. 컬러 시스템

### 1.1 Surface (다크 베이스)

순흑 회피, 미묘한 블루 기울기.

```css
--bg-void: #08090d; /* 최하층, 우주 배경 */
--bg-base: #0e1018; /* 앱 베이스 */
--bg-surface: #141721; /* 패널 배경 */
--bg-elevated: #1c2032; /* 엘리베이션 1단계 */
--bg-overlay: #252a40; /* 모달/팝오버 */

--border-subtle: #262b3e;
--border-default: #3a4058;
--border-strong: #525a78;
```

### 1.2 Text (WCAG AA 이상 보장, bg-base 대비)

```css
--fg-primary: #e8ebf5; /* 대비 14.8:1, AAA */
--fg-secondary: #9ba3b8; /* 대비 6.2:1, AA */
--fg-tertiary: #626978; /* 대비 3.5:1, 큰 텍스트 전용 */
--fg-disabled: #3e4354;
```

### 1.3 Stellar Palette (흑체복사 색온도 → UI 의미)

```css
--star-o: #7ba6ff; /* O형 30,000K+ 청색  → Primary */
--star-b: #a8c5ff; /* B형 10,000K 청백   → Info */
--star-a: #dce5ff; /* A형 7,500K 백색    → 중성 강조 */
--star-g: #ffe9a8; /* G형 5,800K 황      → Warning / 교육 모드 Primary */
--star-k: #ffb878; /* K형 4,500K 주황    → Alert */
--star-m: #ff8a7a; /* M형 3,200K 적색    → Danger / Destructive */
```

### 1.4 Nebula (성운 계열)

```css
--nebula-teal: #6fddb4; /* Success / Tier 1 관측 */
--nebula-violet: #c899ff; /* Tier 4 예술적 근사 전용 (유일 허용 보라) */
```

### 1.5 데이터 신뢰성 Tier (UI 표시 의무)

```css
--tier-1-observed: var(--nebula-teal);
--tier-2-model: var(--star-o);
--tier-3-theory: var(--star-g);
--tier-4-artistic: var(--nebula-violet);
```

### 1.6 모드별 Primary 매핑

| 모드      | Primary | 특징                                       |
| --------- | ------- | ------------------------------------------ |
| 관찰/몰입 | star-o  | UI 투명도 증가, 패널 숨김 기본             |
| 연구      | star-o  | Tier 색상 전면, 데이터 밀도 극대화         |
| 교육      | star-g  | 따뜻한 톤, 대비 소폭 증가                  |
| 샌드박스  | star-o  | 격자/계기판 요소 visible, star-k 경고 빈번 |

---

## 2. 타이포그래피

### 2.1 Font Stack

```css
--font-sans: 'Pretendard Variable', -apple-system, BlinkMacSystemFont, sans-serif;
--font-display: 'Space Grotesk', 'Pretendard Variable', sans-serif;
--font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', monospace;
```

**용도:**

- sans: 본문, UI 레이블
- display: 헤드라인, 브랜드, 천체명 영문
- mono: 수치, 좌표, 시간, 코드 (항상 `tabular-nums`)

### 2.2 Type Scale (16px base, 1.25 ratio)

| 토큰    | 크기             | 행간 | 용도                         |
| ------- | ---------------- | ---- | ---------------------------- |
| display | 3rem / 48px      | 1.1  | 히어로 타이틀 (font-display) |
| h1      | 2.25rem / 36px   | 1.15 | 페이지 제목                  |
| h2      | 1.75rem / 28px   | 1.2  | 섹션 제목                    |
| h3      | 1.375rem / 22px  | 1.3  | 서브섹션                     |
| h4      | 1.125rem / 18px  | 1.4  | 카드 제목                    |
| body    | 0.9375rem / 15px | 1.55 | 기본 본문                    |
| body-sm | 0.8125rem / 13px | 1.5  | 보조 본문                    |
| caption | 0.6875rem / 11px | 1.4  | 수치/레이블 (font-mono)      |

### 2.3 수치 표시 규칙

모든 수치 데이터는:

```css
font-family: var(--font-mono);
font-variant-numeric: tabular-nums;
```

---

## 3. 간격 시스템 (4px 그리드)

```
0:    0px       (없음)
0.5:  2px       (극미세 인셋)
1:    4px       (아이콘 패딩)
2:    8px       (인접 요소)
3:    12px
4:    16px      (섹션 내부)
5:    20px
6:    24px      (섹션 간)
8:    32px
10:   40px
12:   48px      (큰 섹션 간)
16:   64px
20:   80px      (페이지 여백)
```

---

## 4. 라운드 (Border Radius)

"기술 계기판" 감성 유지, 낮은 라운드.

```css
--radius-none: 0;
--radius-xs: 2px; /* 테이블 셀, 태그 */
--radius-sm: 4px; /* 기본 — 버튼, 입력 */
--radius-md: 6px; /* 카드 */
--radius-lg: 8px; /* 큰 컨테이너 */
--radius-full: 9999px; /* 아바타, 배지 */
```

`rounded-xl` 수준의 둥근 감성은 배제.

---

## 5. 엘리베이션

다크 UI 특성상 밝기 + 보더 기반.

```css
--shadow-sm: inset 0 1px 0 0 rgba(255, 255, 255, 0.03);
--shadow-md: 0 4px 16px rgba(0, 0, 0, 0.4), 0 0 0 1px var(--border-subtle);
--shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px var(--border-default);
--glow-accent: 0 0 20px rgba(123, 166, 255, 0.15); /* star-o 글로우 */
```

---

## 6. 모션

```css
--duration-instant: 50ms; /* 포커스 링 */
--duration-fast: 120ms; /* 호버, 버튼 */
--duration-normal: 200ms; /* 패널 열기/닫기 */
--duration-slow: 350ms; /* 모달, 큰 전환 */

--ease-out: cubic-bezier(0.16, 1, 0.3, 1);
--ease-in: cubic-bezier(0.7, 0, 0.84, 0);
--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
```

**필수**: `prefers-reduced-motion: reduce`에서 모든 duration 0.01ms로 강제.

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 7. Z-Index 계층

```
canvas:   0      Babylon 씬
hud:      10     HUD 오버레이
panel:    20     도킹 패널
dropdown: 30     드롭다운, 팝오버
toast:    40     알림
modal:    50     모달, 다이얼로그
tooltip:  60     툴팁 (최상위)
```

---

## 8. 반응형 Breakpoint

데스크톱 우선 + 모바일 라이트 뷰.

```
sm:   640px   (라이트 뷰 경계)
md:   768px   (태블릿)
lg:   1024px  (데스크톱 기본)
xl:   1280px
2xl:  1536px  (대형 데스크톱)
```

`< sm`은 자동으로 **라이트 뷰 모드** (관찰 전용, P1~P2 수준 기능만).

---

## 9. 아이콘 시스템

**라이브러리: Lucide React**

- 약 1,400개 아이콘
- 트리 셰이킹 가능
- 선 두께 2px 일관성
- Radix 호환

**스트로크 규격:**

- 기본 두께: 2px
- 크기 단계: 16 / 20 / 24 / 32 px

천체 관련 커스텀 아이콘(행성 기호, HR도 심볼 등)은 `/packages/core/assets/icons/` 하위에 SVG로 추가, 동일 2px 스트로크 규격 준수.

---

## 10. 구현 메모

### 10.1 CSS Variables 배치

- `apps/web/app/globals.css`에 기본 토큰 정의
- 모드 전환 시 `data-mode="research"` 같은 속성으로 토큰 스왑

```css
:root {
  --primary: var(--star-o);
}
[data-mode='education'] {
  --primary: var(--star-g);
}
```

### 10.2 Tailwind 통합

- `tailwind.config.ts`에서 `theme.extend.colors`, `fontSize`, `spacing`, `borderRadius` 를 CSS Variables 참조로 연결
- CVA (class-variance-authority) 로 컴포넌트 variants 관리

### 10.3 변경 시 원칙

- 토큰 추가/수정은 이 문서 업데이트 필수
- 컴포넌트에서 하드코딩 hex 사용 금지 (토큰 참조만)
- 새 accent 색 추가 시 흑체복사 체계 또는 성운 계열에서 유도
