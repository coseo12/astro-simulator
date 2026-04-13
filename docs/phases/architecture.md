# 아키텍처 결정서 (ADR)

프로젝트: 웹 기반 천체물리 시뮬레이터
작성일: 2026-04-13
상태: 확정 (Claude + Gemini 교차검증 완료)

---

## 1. 렌더링 엔진: Babylon.js

### 결정 근거
- WebGPU Compute Shader 지원이 프레임워크 차원에서 성숙 (2023년부터 프로덕션)
- 본 프로젝트의 핵심 병목(N-body 연산, 블랙홀 raymarching)이 compute 의존
- Apache 2.0, Microsoft 거버넌스로 장기 안정성 확보
- 내장 GPUParticleSystem, Havok 물리 등 배터리 포함형

### 대안 (Three.js) 기각 사유
- TSL(Three Shading Language) compute 지원이 아직 과도기
- 레퍼런스 격차는 인정하나 프로젝트 난이도 중심(좌표계/적분기/WebGPU)은 양쪽 모두 자체 해결 영역
- 장기 프로젝트 특성상 초기 학습 비용 분산됨

---

## 2. 아키텍처: 이중 레이어 분리

```
┌─────────────────────────────────────┐
│  UI Layer (Next.js App Router)      │
│  - 읽기 전용 구독자                   │
│  - 명령 발행                          │
├─────────────────────────────────────┤
│  Simulation Core (순수 TS + Babylon)│
│  - React 의존성 제로                 │
│  - GPU-resident state               │
│  - 자체 requestAnimationFrame 루프    │
└─────────────────────────────────────┘
```

### 결정 근거
- React reconciler와 GPU 리소스 생명주기 충돌 방지
- 코어를 독립 패키지로 배포 가능 (추후 Vue/Svelte/Electron 이식 가능)
- StrictMode 이중 마운트 같은 React 특유 버그 원천 차단
- 테스트 전략 단순화 (NullEngine 헤드리스 물리 테스트)

### 통신 패턴
```
UI → core.command(cmd)         // 명령
Core → emitter.emit('event')   // 이벤트 방출
UI → core.on('event', handler) // 구독
```

---

## 3. 프로젝트 구조

```
/apps
  /web                    Next.js 애플리케이션
    /app
      layout.tsx          캔버스 persistent mount 위치
      page.tsx
    /components
      SimCanvas.tsx       'use client' + dynamic import (ssr: false)
      /ui                 HUD, 컨트롤 패널
/packages
  /core                   @space/core (순수 TS)
    /coords               Floating Origin, RTE 좌표 변환
    /physics              Leapfrog/Verlet 적분기
    /scene                계층 Scene Graph
    /gpu                  WebGPU Compute 래퍼
    /ephemeris            JPL Horizons 데이터 로더
    index.ts              공개 API
  /shared                 타입, 상수, 이벤트 정의
```

---

## 4. 좌표계 전략: CPU float64 + GPU RTE float32

### 결정 근거
- 셰이더 내 float64 에뮬레이션은 ALU 병목 발생 (금지)
- 업계 표준 (Star Citizen, Outer Wilds 등): CPU에서 float64 월드 유지, 렌더 시 카메라 상대좌표(RTE)로 변환하여 float32 GPU 전달
- 행성 표면 지터링 완전 제거

### 구현 원칙
- 모든 천체의 절대 위치는 CPU에서 `[x: number, y: number, z: number]` (JS number = IEEE 754 double) 유지
- 매 프레임 카메라 위치 기준 상대 벡터 계산 → Float32Array로 GPU 전송
- Floating Origin: 카메라 이동 시 카메라를 (0,0,0) 고정, 월드 전체를 반대로 이동하는 것과 동등한 효과

---

## 5. 물리 적분기: 심플렉틱 (Leapfrog/Verlet)

### 결정 근거
- 오일러/기본 RK4는 시간 경과 시 에너지 표류(drift) 발생 → 궤도 붕괴
- 심플렉틱 적분기는 **에너지 보존** 특성으로 장기 시뮬레이션 안정
- 천체물리 커뮤니티 표준

### 적용 범위
- P1 Kepler는 해석해 사용 (적분기 불필요)
- P2 이후 N-body부터 Leapfrog 적용
- 시간 역행 구현의 자연스러운 이점 (대칭적 적분기)

---

## 6. GPU 전략: WebGPU-first + WebGL2 폴백

### 결정 근거
- 2026년 기준 WebGPU는 데스크톱 Chrome/Edge/Safari/Firefox 프로덕션 지원
- Babylon.js의 WebGPU 경로가 WebGL보다 compute 활용 용이
- WebGL2는 모바일 구형/호환성 폴백으로만 유지

### GPU-resident 원칙
- 파티클/바디 상태는 GPU 버퍼에 상주
- CPU readback 최소화 (선택/레이캐스팅도 GPU 경로 우선)
- 필요한 경우 staging buffer 비동기 readback

---

## 7. 렌더 기법

- **Logarithmic depth buffer**: 근/원거리 동시 렌더링 (행성 표면 ~ 우주 원경)
- **저해상도 compute + TAA 업스케일**: 블랙홀 raymarching 등 고비용 셰이더
- **LOD**: 먼 항성은 임포스터(빌보드), 가까운 천체는 프로시저럴 지형

---

## 8. Next.js 통합 주의점

| 이슈 | 대응 |
|---|---|
| Babylon은 window/WebGPU 의존 | 캔버스 래퍼는 `'use client'` + `next/dynamic({ ssr: false })` |
| React StrictMode 이중 마운트 | `useRef` 초기화 가드, cleanup에서 `engine.dispose()` 엄격 |
| App Router 라우트 전환 시 unmount | 캔버스를 **최상위 layout.tsx**에 두고 라우트는 UI 오버레이만 전환 (Persistent Layout) |
| WASM 로딩 | `next.config.js`에 `experiments.asyncWebAssembly: true` |
| 번들 크기 | Babylon 모듈별 분리 import (`@babylonjs/core/Meshes/meshBuilder`) |

---

## 9. 데이터 신뢰성 계층 (UI 표시 의무)

| Tier | 설명 | 예시 |
|---|---|---|
| 1 | 관측 정확 | JPL Horizons, Gaia, Hipparcos |
| 2 | 통계 모델 | 항성 진화 트랙, IMF |
| 3 | 이론 모델 | 블랙홀 강착원반 |
| 4 | 예술적 근사 | 성운 렌더링 |

UI에서 각 천체/현상의 티어를 명시하여 교육적 정직성 유지.
