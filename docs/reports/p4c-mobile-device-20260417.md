# P5-B 실기기 iPhone Safari 측정 — 2026-04-17

## 환경

- **기종**: iPhone 12 mini (A14 Bionic)
- **OS**: iOS 26.3.1(a)
- **브라우저**: Safari (iOS 내장)
- **네트워크**: 로컬 Wi-Fi → Next.js dev server (`192.168.0.12:3000`)
- **측정 방법**: HUD fps 카운터 (`?fps=1` URL 옵트인)

## 결과

| 시나리오            | URL                             | 결과          | 측정값                      |
| ------------------- | ------------------------------- | ------------- | --------------------------- |
| N=200 60fps 유지    | `?belt=200&fps=1`               | ✅ **통과**   | **60 fps** 유지 (vsync cap) |
| N=10000 크래시 없음 | `?belt=10000&fps=1`             | ✅ **통과**   | **40~50 fps** (best-effort) |
| WebGPU 경로 확인    | `?engine=webgpu&belt=200&fps=1` | ⚠️ **미지원** | renderer = **webgl2**       |

## 분석

### N=200 @ 60fps ✅

vsync cap(60fps)에 도달. A14 Bionic + Kepler 해석해 경로에서 소행성 200개는 충분히 가벼움. DoD 충족.

### N=10000 크래시 없음 ✅

40~50 fps로 부드러운 인터랙션 가능. 10000개 ThinInstance + Kepler 해석해가 iPhone 12 mini에서도 실용적 성능. DoD "크래시 없음" 충족 + best-effort fps도 우수.

### WebGPU 미지원 ⚠️

iPhone 12 mini(A14 Bionic)에서 iOS 26.3.1 Safari가 WebGPU를 노출하지 않음. `renderer · webgl2`로 정상 폴백. 가능한 원인:

- **하드웨어 제약**: A14 Bionic은 Apple GPU 4세대. WebGPU는 A15(iPhone 13) 이상에서만 지원될 가능성
- **Safari 설정**: Safari → 설정 → 고급 → Feature Flags에서 WebGPU를 수동 활성화해야 할 수 있음
- **iOS 버전**: iOS 17.4+(2024-03)부터 WebGPU 기본 활성이라고 알려져 있으나 실제 A14 하드웨어에서의 지원 범위는 미확인

**폴백 동작은 정상** — WebGPU 미지원 시 capability notice 표시 없이 WebGL2 Barnes-Hut 경로로 동작.

## DoD 충족 여부

| 기준                     | 충족                                           |
| ------------------------ | ---------------------------------------------- |
| N=200 @ 60fps (5초 평균) | ✅                                             |
| N=10000 크래시 없음      | ✅                                             |
| WebGPU 경로 활성         | ⚠️ 미지원 (A14 하드웨어 또는 Safari 설정 제약) |

## 후속

- iPhone 13+(A15)에서 재측정 → WebGPU 활성 여부 확인
- Safari Feature Flags에서 WebGPU 수동 활성화 후 재시도
- P5-A(일반상대론)는 CPU f64 경로이므로 WebGPU 유무와 무관하게 진행 가능
