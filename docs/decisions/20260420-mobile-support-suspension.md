# ADR: 모바일 지원 무기한 보류 (Suspended, Not Deprecated)

- **상태**: Accepted
- **날짜**: 2026-04-20
- **결정자**: architect / PM (P10-A #268)
- **관련**: P10 계약 #266, 원칙 `docs/deprecated/principles/fact-first.md`, 로드맵 v2 `docs/deprecated/phases/roadmap-v2-solar-precision.md`, 선행 이슈 #219 (iOS Yoshida4 bench — close 하지 않음), 구현 파일 `apps/web/src/core/is-mobile.ts` (P7-E #210/#220)

## 배경

P1~P9 구현 과정에서 모바일(iOS/Android) 지원은 다음 3단계를 거쳤다:

1. **P1~P3**: 모바일 best-effort — WebGL2 fallback 으로 기본 렌더링만 보장.
2. **P4~P6**: WebGPU 확산과 함께 "고성능 기능은 데스크톱 전용" 분기 누적. `isMobile && !cap.webgpu` 분기로 경고 배너 표시 (`apps/web/src/components/sim-canvas.tsx`).
3. **P7~P9**: 렌더 복잡도 (중력렌즈 3D, Yoshida 4차 장기 적분, 고리 shader 3층) 가 모바일 한계를 초과. #219 (iOS Safari 17.4+ 실기기 Yoshida4 벤치 수동 측정) 가 수개월 open 상태로 방치.

P10 착수 시점(2026-04-20)에 PM 계약에서 모바일 경로의 전략적 재정의가 제기되었다. **"영구 폐기"** 로 프레이밍할 경우:

- 기술 성숙도는 시간 함수 — 모바일 GPU (Apple M-series, Snapdragon 8 Gen 4+) 는 빠르게 향상 중.
- 코드상 `is-mobile.ts` / 경고 분기 / `mobile-webgpu-best-effort` 알림 키 등은 유지하면서 실제 지원은 제공하지 않는 **죽은 코드 부채화** 위험.
- 재도전 조건이 박제되지 않으면 "왜 보류했는지" 자체가 drift.

Gemini 교차검증(2026-04-20) 에서 "영구 폐기" 프레이밍이 기술 성숙도 가변성 / 죽은 코드 부채화 리스크에 비추어 부적절하다는 지적을 받았고, Claude 설계에서 **"무기한 보류 + 재도전 조건 ADR"** 로 프레이밍 변경을 수용했다 (P10 계약 이견 수용 4건 중 하나).

## 후보 비교

### 축 — 모바일 경로의 전략적 위치

| 축 / 후보               | (a) **영구 폐기** (Deprecated)                                 | (b) **무기한 보류** (Suspended, 본 ADR 채택)                                   | (c) **best-effort 유지** (현 상태 지속)          |
| ----------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------ |
| **코드 정책**           | `is-mobile.ts` 삭제 / 모바일 분기 전부 제거 / 모바일 접속 차단 | `is-mobile.ts` 유지 / 분기 단순화 / 진입 시 **Graceful Degradation 모달** 표시 | 현재 분기 유지 (경고 배너 + WebGL fallback 시도) |
| **사용자 경험**         | 모바일 접속 시 "데스크톱 브라우저 사용" 오류 페이지            | 모바일 접속 시 명시 안내 + 제한된 기능 진입 가능 (`?mode=scientific` 등)       | 현 상태 — 경고 + 일부 기능 누락 + 성능 저하      |
| **재도전 비용**         | 폐기 코드 복구 비용 고 — 전체 재설계 필요                      | 낮음 — tier preset (`tier-c`) 경로에 재진입                                    | 이미 경로 있음 (단, 품질 관리 부담)              |
| **죽은 코드 부채**      | 즉시 해소                                                      | **단순화** 후 유지. 명시 가드 문서화                                           | 누적 (가장 나쁨)                                 |
| **기술 트렌드 민감도**  | 기술 성숙 후에도 재진입 모멘텀 약함                            | ADR 재도전 조건 트리거 감지 시 재평가 자연스러움                               | 자동 재평가 없음 — drift                         |
| **현재 기능 범위 영향** | scope 감소 (순수 데스크톱)                                     | scope 유지 (모바일 Graceful Degradation 경로만 축소)                           | scope 유지 (고비용)                              |

**결정**: **(b) 무기한 보류** 채택.

## 결정

### 1. 보류 선언

모바일(iOS/Android, 태블릿 포함) **공식 지원** 은 P10 ~ P16 범위에서 **보류**한다.

- "공식 지원" = 품질 게이트 (CI 성능 벤치, 시각 검증, 회귀 테스트) 대상에 포함하는 것.
- 보류 기간 동안 모바일 사용자는 **best-effort 경로** 로 접속 가능하되, 기능·성능·정확도 DoD 는 보장되지 않는다.

### 2. 코드 정책 — 단순화 후 유지

- `apps/web/src/core/is-mobile.ts` — **유지**. iPadOS 13+ desktop UA 우회 로직 포함.
- `apps/web/src/components/sim-canvas.tsx` 의 모바일 분기 — **단순화**. 현재 WebGPU-mobile 분기가 `?tier=c` 프리셋으로 일반화되기 전까지는 현 구조 유지.
- `mobile-webgpu-best-effort` 알림 키 — **유지**. `tier-c` 프리셋 도입(P11) 시 `tier-c-graceful-degradation` 키로 대체 검토.
- 모바일 테스트 (`is-mobile.test.ts`) — **유지**. 감지 로직 회귀 방지.

### 3. Graceful Degradation UX

모바일 접속 시 아래를 **명시적으로 안내**한다:

1. **진입 모달** (최초 접속 시 1회, dismissable):
   - "현재 모바일 환경은 공식 지원 대상이 아닙니다. 일부 기능과 성능이 제한됩니다."
   - 옵션: `[그대로 계속]` / `[데스크톱에서 방문하기 (링크 복사)]`
   - `localStorage.astro:mobile-degradation-dismissed` 로 재표시 제어.
2. **기능 제한 표시**:
   - `educational` 모드 → 파티클 축소, LOD 공격적
   - `scientific` 모드 → 권장 (sub-pixel 렌더가 모바일에서도 큰 문제 없음)
   - 중력렌즈 3D / 고리 shader 3층 → 기본 비활성화 (`?features=advanced` 로 옵트인)
3. **재접속 시**: 배너 없음. 사용자가 이미 인지.

### 4. tier preset 전략 초안 (P11 에서 1급 설계 — 본 ADR 스케치)

P11 Visual Foundation 에서 `is-mobile.ts` 를 `detect-gpu-tier.ts` 로 **승격 리팩토링** 한다. 모바일 감지는 tier 입력 중 하나로 흡수.

| Tier       | GPU 감지 기준                          | 프로파일                                                | 모바일 처리                             |
| ---------- | -------------------------------------- | ------------------------------------------------------- | --------------------------------------- |
| **tier-a** | discrete GPU + WebGPU + VRAM > 4GB     | LOD 보수적 / 파티클 50k+ / Shadow 2048² / MSAA 8×       | 해당 없음 (데스크톱 전용)               |
| **tier-b** | integrated GPU + WebGPU, 또는 M1+ iPad | LOD 중간 / 파티클 20k / Shadow 1024² / MSAA 4×          | **M1+ iPad 만 진입 허용**               |
| **tier-c** | WebGL2 fallback, 또는 저전력 모바일    | LOD 공격적 / 파티클 5k / Shadow 512² 또는 비활성 / FXAA | **대부분 모바일 (Android/구형 iPhone)** |

- tier 감지 조합: `navigator.gpu` + `GPUAdapter.requestAdapterInfo()` + `devicePixelRatio` + `hardwareConcurrency` + `detectIsMobile()`.
- **사용자 override**: `?tier=a|b|c` URL 파라미터 (디버깅 + 사용자 자율성).
- `tier-c` 진입 시 Graceful Degradation 모달 자동 표시 (본 ADR §3 구현).
- 상세 설계 및 구현은 **P11 착수 시 별도 ADR** (`docs/decisions/<YYYYMMDD>-tier-preset-design.md`).

### 5. 관련 이슈 처리

- **#219** (iOS Safari 17.4+ 실기기 Yoshida4 bench 수동 측정) — **close 하지 않음**. 보류 기간 중에도 향후 재도전 시 baseline 으로 활용.
- **우선순위 하향**: 기존 `priority:low` 유지. 재도전 트리거 발생 시 `priority:medium` 으로 승격.
- **라벨**: `status:suspended` (신규 라벨 도입 검토 — P10-A 범위 외, 후속 이슈).

## 결과 및 재검토 조건

### 결과 (즉시)

- 모바일 지원은 "best-effort + Graceful Degradation" 으로 고정.
- 모바일 성능/기능 회귀 리포트는 본 보류 해제 전까지 **non-blocking**. 관찰 목적으로만 수집.
- P11 에서 `tier-c` 프리셋 구현 시 본 ADR §3 Graceful Degradation 을 구체 UI 로 실현.

### 재도전 트리거 (아래 중 2개 이상 충족 시 재평가)

1. **기술 성숙**: WebGPU 지원 모바일 브라우저 점유율 > 50% (Caniuse baseline 기준).
2. **하드웨어 성숙**: 주력 모바일 GPU (Apple A-series 최신, Snapdragon 8 Gen 5+) 에서 WebGPU compute 성능 > 현재 데스크톱 integrated GPU 수준.
3. **사용자 수요**: 모바일 접속 비율 > 20% (Vercel Analytics 또는 자체 telemetry 기준 — P16 배포 이후 측정 가능).
4. **경쟁 도구 레퍼런스**: Solar System Scope / Universe Sandbox / NASA's Eyes 등 주요 경쟁 도구가 모바일 정식 지원을 선언.

### 재검토 시 체크리스트

- [ ] 현재 `tier-c` 프리셋 실측 성능 (fps, memory, power) 을 모바일 실기기 (최소 5종) 에서 측정
- [ ] P11 Floating Origin / LOD / distance scale 모드가 모바일에서 정상 동작하는지 검증
- [ ] 모바일 UX 리뷰 — `educational` 디폴트 vs `scientific` 디폴트 중 모바일 첫 인상에 적합한 쪽 선택
- [ ] 신규 ADR 작성 — `docs/decisions/<YYYYMMDD>-mobile-support-resumption.md` 로 본 ADR supersede

## 참조

- P10 계약: [../deprecated/phases/p10-plan.md](../deprecated/phases/p10-plan.md) (#266 merged)
- 원칙: [../deprecated/principles/fact-first.md](../deprecated/principles/fact-first.md)
- 로드맵 v2: [../deprecated/phases/roadmap-v2-solar-precision.md](../deprecated/phases/roadmap-v2-solar-precision.md)
- P7-E 모바일 감지 도입: `apps/web/src/core/is-mobile.ts` (#210, #220)
- 보류 상태 이슈: #219 (iOS Yoshida4 실기기 bench — 유지)

## §Amendments

(없음 — 초판)
