# UI Baselines — Incremental Body-by-Body Build 기준점

## 2026-04-25 — 재구성 시점 baseline

**맥락**: P10~P12 기획 의도 폐기 시점 (volt #74) 의 실제 브라우저 렌더 상태. 이 시점 이후 "태양부터 하나씩" incremental build 의 출발점.

### 스크린샷

| 파일                                    | 시나리오           | 상태                                                       |
| --------------------------------------- | ------------------ | ---------------------------------------------------------- |
| `2026-04-25-current-ui-default.png`     | 기본 진입 (`/`)    | 궤도 라인 + 해왕성 1개 + 중앙 흰 점. 대다수 행성 sub-pixel |
| `2026-04-25-current-ui-focus-earth.png` | `?focus=earth` URL | URL 무시됨 — default 와 동일 (focusBodyId store 필드 부재) |

### 현재 UI 구성 요소 (유지 대상, Q4=A)

- 상단 네비: `astro-simulator / 관찰 / 연구 / 교육 (P2+예정) / 샌드박스 (P2+예정) / 태양 / 지구 / 목성 / 해왕성 / reset`
- 상단 우측 HUD: 날짜 입력 / 점프 / SI/AU/Nat 단위 / Kepler/Newton/Barnes-Hut/WebGPU/Auto / 북마크
- 좌상: JD (Julian Date) 표시
- 우상: `renderer · webgpu` 배지
- 우측: 거리 표시 (`35.0 AU`)
- 좌하: N 버튼 (카메라 reset)
- 우하: `정확도 · T1 관측` HUD (Data Tier 배지)
- 하단: 시간 컨트롤 (`<< / ∥ />> / 1s / 1h / 1d / 1M / 1y / 10y / 날짜`)

### 재구성 원칙 (R1+ 스프린트 DoD 기준)

각 R-Phase 는 아래 원칙을 지킨다:

1. **현재 baseline 대비 추가만** — UI 레이아웃 변경 최소화 (재구성 완료까지 상단 네비/HUD 구조 유지)
2. **"사용자가 실제로 보이는 body"** 를 DoD 에 포함 — 예: `R1 완료 후 기본 진입 화면에서 태양이 명시적으로 ≥20px 크기로 보인다`
3. **수동 브라우저 검증 필수** — browser-verify 자동화만으론 불충분 (volt #74 교훈)
4. **회귀 감지** — 이전 R-Phase baseline 대비 시각 회귀가 없는지 육안 확인
