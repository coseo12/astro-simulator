# UI 아키텍처

프로젝트: 웹 기반 천체물리 시뮬레이터
상태: 확정 (2026-04-13)
관련 문서: `architecture.md`, `design-tokens.md`

---

## 1. 컴포넌트 구현 원칙

### 1.1 일반 UI (Radix Primitives 기반)

- **Phase별 필요분만** 구현 (pull-based)
- 사전에 전체 라이브러리 만들지 않음
- 각 컴포넌트는 Radix Primitive + 자체 디자인 토큰 + CVA variants 조합

### 1.2 시뮬레이터 특화 (자체 구현)

- **Phase별 필수 항목 지정** 시 반드시 구현
- 일반 UI와 같은 디자인 언어 유지 (통합된 느낌)

### 1.3 Phase별 컴포넌트 배정

| Phase | 일반 UI (필요분)                                                                                                          | 시뮬레이터 특화 (필수)                                                                                                           |
| ----- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| P1    | Button, Input, Select, Slider, Switch, Tabs, Dialog, Tooltip, Toast, Card, ScrollArea, DropdownMenu, Dock/Panel/SplitPane | TimeScrubber, ScaleControl, DateTimePicker, CelestialTree, CelestialInfoPanel, UnitToggle, TierBadge, ModeSwitcher, SpeedControl |
| P2    | NumberInput, Combobox, ContextMenu, Accordion, Table                                                                      | CameraBookmark, OrbitalElementsEditor, DataExporter                                                                              |
| P3    | Progress, Skeleton                                                                                                        | (추가 필요 시 정의)                                                                                                              |
| P4+   | 필요 시 정의                                                                                                              | HRDiagram, SpectrumView, GalaxyMap 등                                                                                            |

---

## 2. 레이아웃 전략

### 2.1 모드별 최적화 (전략 C)

4개 모드가 **완전히 다른 레이아웃 템플릿**을 가진다. 단일 레이아웃으로 모든 모드를 커버하지 않는다.

- 모드 전환: 300ms fade + layout transition
- 모드 전환 시 카메라/시간 상태는 유지
- 모드별 사용자 커스터마이징은 localStorage 저장, 세션 내 유지

### 2.2 치수 규격

| 영역    | 크기                                 |
| ------- | ------------------------------------ |
| 좌 패널 | 280px (천체 계층 트리 들여쓰기 여유) |
| 우 패널 | 340px (모노스페이스 수치 + 레이블)   |
| TopBar  | 48px                                 |
| TimeBar | 64px                                 |

### 2.3 반응형 브레이크

| 브레이크         | 동작                                |
| ---------------- | ----------------------------------- |
| xl (1280px) 이상 | 기본 레이아웃                       |
| lg (1024px) 이상 | 우 패널 기본 접힘                   |
| md (768px) 이상  | 좌 패널도 기본 접힘 (플로팅 드로어) |
| sm (640px) 미만  | 라이트 뷰 (관찰 전용, P1~P2 수준)   |

### 2.4 패널 동작

- **고정 도킹** (리사이저블 미구현)
- 3단 폭 프리셋: 닫힘 / 보통 / 넓음
- 단축키: `[`/`]` (개별 토글), `Shift+[`/`Shift+]` (넓힘)

### 2.5 몰입 토글 3단계

| Level | 단축키    | 상태                           |
| ----- | --------- | ------------------------------ |
| 0     | (기본)    | 모드별 레이아웃                |
| 1     | Tab       | 패널 숨김, TopBar/TimeBar 유지 |
| 2     | Shift+Tab | 모든 UI 숨김, 순수 캔버스      |

마우스 이동 시 TopBar 자동 페이드인 (Level 1/2 공통).

### 2.6 HUD 4코너 배치

```
┌────────────────────────────────┐
│ 좌상: 시각 (JD/UTC/지역)       │
│                    우상: FPS, 좌표, 스케일 │
│         (캔버스 중앙)          │
│ 좌하: 선택 천체 이름           │
│                    우하: Tier 범례 │
└────────────────────────────────┘
```

HUD 요소는 `backdrop-filter: blur(8px)` + 반투명.

---

## 3. 모드별 레이아웃 상세

### 3.1 관찰/몰입 모드 (Observe)

**철학**: 창밖을 바라보듯, UI는 필요할 때만.

- 좌/우 패널: 접힘 (플로팅 토글 버튼만 노출)
- TopBar: 마우스 비활성 3초 후 페이드아웃
- TimeBar: 플레이 컨트롤 + 속도만. 호버 시 풀 스크러버로 확장
- 천체 클릭 시: 플로팅 카드 (패널 아님)
- 배경음악 옵션 (기본 off)

### 3.2 연구 모드 (Research)

**철학**: 데이터가 주인공, 정보 밀도 극대화.

- 좌/우 패널: 펼침 (기본 폭)
- HUD: 상세 (X/Y/Z 좌표, 속도 벡터, 거리, 스케일 바)
- 캔버스 오버레이: 좌표축 그리드 (ecliptic/equatorial 전환 가능), 거리 ruler
- 우 패널 탭: **기본 / 궤도 / 물리 / 관측 / 데이터**
- TimeBar: 풀 스크러버 + 로그 눈금 + 이벤트 마커 (일식, 근지점 등)
- 우클릭 메뉴: "측정 시작", "CSV 내보내기", "기준점 설정"

### 3.3 교육 모드 (Education)

**철학**: 가이드 투어, 설명이 콘텐츠.

- 좌/우 패널: 접힘
- 하단: 설명 시네마틱 바 (120~160px)
- 상하 레터박스 (기본 ON, 옵션 OFF)
- 투어 챕터 네비 + 진행바
- 포인터 하이라이트 (설명 중인 객체 강조)
- 핵심 용어 hover 시 정의 툴팁
- Primary 자동 전환: `star-g` (따뜻한 황)
- 키보드: `→/Space` 다음, `←` 이전, `ESC` 모드 해제

### 3.4 샌드박스 모드 (Sandbox)

**철학**: 실험실, 모든 것이 조작 가능.

- 좌/우 패널: 펼침 (필수)
- 좌 패널: 천체 라이브러리 + 드래그 배치
- 우 패널: 선택 천체의 실시간 파라미터 편집기
- 캔버스: 격자 항상 visible, 좌표축 visible, 궤도선 토글
- 시간 컨트롤: 역행 포함, 극한 속도 (×100000 등)
- 우클릭: "천체 추가", "충돌 실험", "궤도 교란"
- Undo/Redo (`Cmd+Z` / `Shift+Cmd+Z`)
- 시나리오 저장/불러오기/공유 URL
- Warning 색 (star-k) 빈번 (불안정 궤도, 충돌 경고)

### 3.5 모드별 토큰 자동 전환

```css
[data-mode='observe'] {
  --primary: var(--star-o);
  --ui-opacity: 0.85;
}
[data-mode='research'] {
  --primary: var(--star-o);
  --ui-opacity: 1;
}
[data-mode='education'] {
  --primary: var(--star-g);
  --ui-opacity: 0.95;
}
[data-mode='sandbox'] {
  --primary: var(--star-o);
  --grid-visible: 1;
}
```

---

## 4. URL 상태 동기화 (전체)

딥링크 대상:
| 파라미터 | 예시 |
|---|---|
| mode | `?mode=research` |
| time | `?t=2026-04-13T00:00:00Z` |
| focus | `?focus=jupiter` |
| camera | `?cam=<compact>` |
| speed | `?speed=86400` |

- URL이 길어지므로 **Base64 compact encoding** 또는 **시나리오 ID 간접 참조** 적용
- 구현 라이브러리: `nuqs` (타입 안전)

---

## 5. 상태 관리 스택

### 5.1 전역 구조

```
Simulation State (Core 소유, GPU/CPU)    UI State (React 소유)
├─ 현재 시간 (JD)                        ├─ 패널 개폐
├─ 카메라 (pos/target)                   ├─ 현재 모드
├─ 선택 천체                              ├─ 폼 입력 값
├─ 시간 속도                              ├─ 다이얼로그 상태
├─ 물리 파라미터                          └─ 토스트 큐
└─ 천체 데이터
```

### 5.2 라이브러리 선택

| 역할                | 선택                | 크기  | 도입 Phase |
| ------------------- | ------------------- | ----- | ---------- |
| UI 전역 상태        | **Zustand**         | ~1KB  | P1         |
| URL 상태            | **nuqs**            | ~4KB  | P1         |
| Core↔UI 이벤트 버스 | **mitt**            | ~200B | P1         |
| 외부 데이터 페칭    | **TanStack Query**  | ~13KB | P1         |
| 스키마 검증         | **zod**             | ~12KB | P1         |
| 복잡 폼             | **react-hook-form** | ~9KB  | P2         |

### 5.3 Core ↔ UI 통신 패턴

```ts
// @space/core — 순수 TS, React 무관
import mitt from 'mitt';

type CoreEvents = {
  timeChanged: { julianDate: number };
  bodySelected: { id: string };
  modeChanged: { mode: Mode };
};

class SimulationCore {
  private emitter = mitt<CoreEvents>();
  on = this.emitter.on;
  off = this.emitter.off;
  // ...
}

// UI 어댑터
const core = new SimulationCore(canvas);
core.on('timeChanged', ({ julianDate }) => {
  useSimStore.getState().setTime(julianDate);
});

// UI → Core 명령
core.command({ type: 'setTimeScale', value: 86400 });
```

### 5.4 원칙

- Core는 Zustand store 직접 접근 금지 — 이벤트만 emit
- UI 어댑터 계층이 이벤트 ↔ store 매핑 담당
- React 외부(Core, 서비스 워커 등)에서도 `store.getState()` 활용 가능
- 고빈도 업데이트(FPS, 좌표)는 선택적 구독으로 필요한 컴포넌트만 리렌더

---

## 6. 애니메이션 전략

### 6.1 라이브러리

**Framer Motion (선별적 사용)**

- `LazyMotion` + `m` 컴포넌트로 초기 번들 ~5KB로 축소
- `domAnimation` 기본, 필요 시 `domMax` 로드

### 6.2 사용 기준

| 용도                                    | 사용 도구                      |
| --------------------------------------- | ------------------------------ |
| 모드 전환 (layout animation)            | Framer Motion `layout` prop    |
| 드래그 제스처 (샌드박스, 북마크 재정렬) | Framer Motion `drag`           |
| 수치 카운트업                           | Framer Motion `useMotionValue` |
| 교육 모드 시네마틱 시퀀스               | Framer Motion                  |
| 단순 호버/포커스                        | CSS transition                 |
| 단순 fade                               | CSS `@keyframes`               |
| 장식 애니메이션                         | **금지**                       |

### 6.3 원칙

1. 기능적 애니메이션만 — 상태 이해를 돕는 것
2. 장식 금지 — 반짝임, 파티클 배경, 무의미한 움직임
3. 빠르게 — 대부분 120~200ms, 최대 350ms
4. 자연스러운 이징 — 선형 금지, `ease-out` 또는 스프링
5. `prefers-reduced-motion` 완벽 지원 (`MotionConfig reducedMotion="user"`)
6. 성능 — `transform`/`opacity`만 애니메이션 (repaint 금지)

---

## 7. 접근성 (비협상)

- 전체 키보드 탐색 (시뮬레이션 제어 포함)
- 색약 친화 팔레트 (흑체복사 기반이 유리 — 청/주 대비)
- 최소 대비율 WCAG AA, 가능 시 AAA
- 스크린 리더 라이브 영역 — 수치 변화 선택적 읽기
- 포커스 링 명확 (다크 배경에서 특히)
- `prefers-reduced-motion` 완벽 지원
- 텍스트 스케일링 200%까지 레이아웃 유지

---

## 8. 국제화 (i18n)

- 한국어 우선, 영어 병행
- 라이브러리: `next-intl` (Next App Router 호환 우수)
- 천체 이름: 한국천문연구원 공식 명칭 우선, 영문 병기
- 단위: 로케일별 기본값 (한국 광년/AU, 영문 ly/AU)
- 숫자 형식: `Intl.NumberFormat` (자리 구분자 로케일 반영)

---

## 9. 프로젝트 의존성 목록 (P1 기준)

```json
{
  "dependencies": {
    "@babylonjs/core": "^8.x",
    "@radix-ui/react-dialog": "^1.x",
    "@radix-ui/react-tooltip": "^1.x",
    "@radix-ui/react-select": "^2.x",
    "@radix-ui/react-slider": "^1.x",
    "@radix-ui/react-switch": "^1.x",
    "@radix-ui/react-tabs": "^1.x",
    "@radix-ui/react-scroll-area": "^1.x",
    "@radix-ui/react-dropdown-menu": "^2.x",
    "@radix-ui/react-toast": "^1.x",
    "class-variance-authority": "^0.7.x",
    "clsx": "^2.x",
    "tailwind-merge": "^2.x",
    "lucide-react": "^0.x",
    "framer-motion": "^11.x",
    "zustand": "^5.x",
    "nuqs": "^2.x",
    "mitt": "^3.x",
    "@tanstack/react-query": "^5.x",
    "zod": "^3.x",
    "next-intl": "^3.x",
    "next": "^15.x",
    "react": "^19.x",
    "react-dom": "^19.x"
  }
}
```

버전은 P1 착수 시점 최신 안정판 기준 재확정.

---

## 10. 변경 이력

- 2026-04-13: 초안 작성. 토론 기반 확정.
