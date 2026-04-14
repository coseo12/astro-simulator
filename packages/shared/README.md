# @astro-simulator/shared

core와 web 양쪽에서 공유하는 타입/상수/이벤트 정의.

## 모듈

| 서브패스                            | 내용                                                             |
| ----------------------------------- | ---------------------------------------------------------------- |
| `@astro-simulator/shared/types`     | DataTier, CelestialKind, CelestialBody, OrbitalElements, SimMode |
| `@astro-simulator/shared/constants` | 물리 상수(G, c), 천문 단위(AU, ly, pc), 태양계 기본값            |
| `@astro-simulator/shared/events`    | CoreEvents 타입 맵, CoreCommand 판별식 유니온                    |

## 원칙

- 런타임 동작 없음 — 타입과 상수만 (sideEffects: false)
- 외부 의존성 없음
- core/web 순환 참조 방지를 위한 중립 패키지
