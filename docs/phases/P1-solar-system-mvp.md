# P1 — 태양계 MVP 스프린트 계약

프로젝트: 웹 기반 천체물리 시뮬레이터
Phase: P1 (태양계 MVP)
상태: 계약 합의 완료, 구현 대기
작성일: 2026-04-13

---

## 목표

태양계를 **시각적·수치적으로 검증 가능한 수준**으로 재현한다.
이 Phase에서 좌표계·Floating Origin·로그 depth 등 **기반 아키텍처를 실제 구현체 위에서 검증**한다.

---

## 완료 기준 (Definition of Done)

모든 항목이 검증 가능해야 한다. 표면적 테스트가 아닌 엣지 케이스까지 포함.

### 필수 (합의된 스코프)
- [ ] 태양 + 행성 8개 실시간 렌더, 궤도 근사 ±1% 이내 (JPL Horizons 대비)
- [ ] 달 포함 (지구-달 2-body 교육적 가치)
- [ ] 카메라 스케일 전환 — 지구 표면(10^6m) ↔ 해왕성 궤도(10^13m) 지터 없음
- [ ] 시간 속도 조절 (1초 = 1일 / 1년 / 100년)
- [ ] 특정 날짜 입력 시 실제 태양계 배치 재현 (예: 2026-04-13 00:00 UTC 기준 검증)
- [ ] 행성 클릭 시 해당 행성 기준 카메라 전환
- [ ] 로그 depth buffer로 근/원거리 동시 렌더링 아티팩트 없음
- [ ] 태양계 전체 정지 상태 60fps 유지 (데스크톱 중급 GPU 기준)

### 아키텍처 기반 (P1에서 확정)
- [ ] `@space/core` 패키지 독립 구성 (UI 의존성 제로)
- [ ] Next.js App Router + Persistent Layout 캔버스 마운트
- [ ] 캔버스 래퍼 SSR 우회 (`dynamic({ ssr: false })`)
- [ ] RTE 좌표 변환 파이프라인 구축 (CPU float64 → GPU float32)
- [ ] Floating Origin 동작 확인 (카메라 이동 시 지터 없음)
- [ ] EventEmitter 기반 Core ↔ UI 통신 패턴 확립
- [ ] Babylon.js WebGPU 경로 동작 확인, WebGL2 폴백 구현

---

## 비포함 (명시적 스코프 제외)

아래는 P1에서 **하지 않는다**. 요구 변경 시 별도 협의.

- 행성 표면 상세 지형 (구체 + 기본 텍스처만)
- 달 외 위성 (목성/토성 위성계는 P2)
- 실시간 N-body 상호작용 (Kepler 해석해로 충분)
- 블랙홀/항성 진화
- 모바일 최적화
- 왜소행성, 소행성대, 혜성
- VR/WebXR
- 사용자 천체 생성 (샌드박스)

---

## 기술 스택 (확정)

| 영역 | 기술 |
|---|---|
| 렌더 엔진 | Babylon.js (WebGPU baseline, WebGL2 fallback) |
| UI | Next.js (App Router) |
| 언어 | TypeScript |
| 코어 패키지 | `@space/core` (Babylon만 의존) |
| 데이터 소스 | JPL Horizons (Kepler 궤도요소) |
| 적분기 | 해석해 (Kepler). 심플렉틱은 P2부터 |
| 배포 | (추후 결정) |

---

## 검증 방법

### 수치 검증
- JPL Horizons API로 2026-04-13 기준 각 행성 위치 조회
- 시뮬레이션 동일 시점 위치와 비교
- 오차 ±1% 이내 자동 테스트 (Vitest + NullEngine 헤드리스)

### 시각 검증 (브라우저 3단계)
1. **정적**: 8개 행성 + 달 + 태양 렌더링, 콘솔 에러 없음
2. **인터랙션**: 행성 클릭 카메라 전환, 시간 속도 변경, 날짜 입력
3. **흐름**: 지구 표면 → 해왕성 궤도 줌아웃 지터 없음, 긴 시간 경과 안정성

### 성능 검증
- Chrome DevTools Performance 탭, 60fps 유지 확인
- WebGPU/WebGL2 양쪽 경로 검증

---

## 리스크 및 대응

| 리스크 | 대응 |
|---|---|
| WebGPU 브라우저별 차이 | WebGL2 폴백 초기부터 구현, 두 경로 동시 테스트 |
| Next.js StrictMode 이중 마운트 | `useRef` 가드 + `engine.dispose()` 엄격 |
| JPL Horizons API 레이트 리밋 | 궤도요소 캐싱, 정적 JSON 스냅샷 번들 |
| RTE 좌표 버그 (행성 표면 지터) | Floating Origin 단위 테스트, 극단 좌표 케이스 |
| 로그 depth buffer 아티팩트 | 근/원 동시 렌더 시각 테스트 |

---

## 다음 Phase 연결점

P1 완료 시 P2 착수 전제:
- 좌표계/Scene Graph/이벤트 시스템 안정
- Kepler → N-body 전환 시 **행성 위치 계산 함수만 교체** 가능한 인터페이스
- 시간 제어 UI는 P2에서 재사용

---

## 변경 이력

- 2026-04-13: 초안 작성, Claude + Gemini 교차검증 완료, 사용자 승인
