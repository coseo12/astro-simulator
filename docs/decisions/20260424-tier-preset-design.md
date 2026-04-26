# ADR: P11-C Tier Preset 설계 — GPU 감지 + 프로파일 + Graceful Degradation

- **상태**: Accepted
- **날짜**: 2026-04-24
- **결정자**: architect (P11-C #290 재계약 박제)
- **관련**: #290 (본 Phase), #289 P11-B (LOD 선행 완료), #310 (네이밍 정책 선행 완료), #288 P11-A (Floating Origin 선행), #298 P12 (Scale Tier + 단일 모드 전환), #219 (iOS Yoshida4 실기기 bench — close 하지 않음 유지), ADR `20260420-mobile-support-suspension.md` §3 §4 (Graceful Degradation 전제), ADR `20260424-tier-naming-policy.md` (`?gpu=` SSoT), ADR `20260424-p11-b-lod-design.md` (LOD 임계 상수 → tier 프로파일 승격 경로), ADR `../deprecated/decisions/20260423-display-relative-scale-unification.md` (Scale Tier 직교 전제), 원칙 `docs/deprecated/principles/fact-first.md`
- **교훈 적용**: "신규 함수 ≠ 신규 구현" (`detectIsMobile` 재사용 승격), "신규 데이터 ≠ 신규 코드 — ADR 예측 재현" (GPU 감지 규칙 데이터화 → Concrete Prediction 3건), "주석 계약 vs 구현 drift" (GPU tier 카테고리 enum drift 방어), "headless 브라우저 검증 ≠ 실 브라우저" (tier 감지 mock fixture 10 + 실기기 3 이중 레이어), "sub-agent 검증 완료 ≠ GitHub 박제 완료" (bench 차등 실측 증거 박제), "인계 항목 실측 재검증 — NO-OP ADR 패턴" (scientific 모드 폐기로 원 DoD #5 전제 소실 → 자동 억제 대체)

---

## 배경

`20260420-mobile-support-suspension.md` §4 에서 "P11 착수 시 별도 ADR" 로 예고된 tier preset 구체 설계. P11-A (#288 Floating Origin, 완료) + P11-B (#289 LOD, 완료) 후 마지막 Visual Foundation 단계.

### P12 완결 후 전제 변동 (2026-04-24)

원 #290 DoD (2026-04-20 박제) 는 `tier-c 디폴트 scientific 모드` 를 포함했으나, v0.12.0 (P12 단일 모드 전환 #298) 으로 **`scientific` / `educational` 모드 자체가 폐기** 되어 원 경로 소멸. PM 재계약 (2026-04-24) 에서 `scientific 대체 = 자동 최대 억제 프로파일` 로 전환하고 URL 파라미터를 `?tier=` → `?gpu=` 로 rename 하여 #310 네이밍 정책 ADR 과 정합 박제.

재계약 경위: [#290#issuecomment-4310628394](https://github.com/coseo12/astro-simulator/issues/290#issuecomment-4310628394) + URL 값 검증 DoD 보강 [#290#issuecomment-4310787787](https://github.com/coseo12/astro-simulator/issues/290#issuecomment-4310787787).

### 실측 재검증 (CLAUDE.md "인계 항목 실측 재검증")

구현 착수 전 현재 상태 실측 (2026-04-24, develop tip):

- `apps/web/src/core/is-mobile.ts` 존재 + `detectIsMobile(nav)` 순수 함수 + iPadOS 13+ desktop UA 우회 (`maxTouchPoints > 1` + `Macintosh`) 완성. 재사용 기반 확보
- `apps/web/src/components/sim-canvas.tsx:60-72` 에 모바일 분기 1개 — `engineNotice` 키 `mobile-webgpu-best-effort` 박제. 본 ADR 이 치환 대상 명시
- `packages/core/src/render/lod.ts` + `lod-body-thresholds.ts` 완성. LOD 픽셀 경계 상수 `LOD_PIXEL_THRESHOLDS = { high: 50, mid: 8 }` 가 **현재 하드코딩**. 본 ADR 에서 tier 프로파일로 승격 경로 설계
- `apps/web/src/core/parse-lod-level.ts` 등 URL parser 3개 (`parse-integrator`, `parse-gr-mode`, `parse-lod-level`) — 공통 패턴 확립. 본 ADR 은 4번째 parser `parse-gpu-tier` 를 동일 구조로 신설

### 기존 자산 재사용 조사 (CLAUDE.md "신규 함수 ≠ 신규 구현")

| 자산                                                         | 위치                                     | 본 설계 처리                                                                                                                              |
| ------------------------------------------------------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `detectIsMobile(nav)`                                        | `apps/web/src/core/is-mobile.ts`         | **재사용** — `detect-gpu-tier.ts` 내부에서 mobile signal 로 호출. `is-mobile.ts` 파일 자체는 유지 (마이그레이션 시 삭제 여부는 구현 범위) |
| `is-mobile.test.ts` (12 케이스)                              | `apps/web/src/core/is-mobile.test.ts`    | **유지** — 회귀 가드. DoD #9 명시                                                                                                         |
| `parseIntegratorKind` / `parseGrMode` / `parseLodLevel` 패턴 | `apps/web/src/core/parse-*.ts`           | **패턴 재사용** — `parseGpuTier` 동일 구조 (공식값 / 미지정 fallback / console.warn)                                                      |
| `sim-canvas.tsx:60-72` mobile 분기                           | `apps/web/src/components/sim-canvas.tsx` | **치환** — `detect-gpu-tier.ts` 호출로 대체. 알림 키 `mobile-webgpu-best-effort` → `tier-c-graceful-degradation`                          |
| `sim-store.setEngineNotice`                                  | `apps/web/src/store/sim-store.ts`        | **확장 불요** — `engineNotice` API 그대로 사용. 키 값만 변경                                                                              |
| `LOD_PIXEL_THRESHOLDS` 하드코딩                              | `packages/core/src/render/lod.ts:39-42`  | **승격 경로** — tier 프로파일로 주입 가능하도록 외부 override 파라미터 추가 (비즈니스 로직은 동일)                                        |
| `gpuApi.detectGpuCapability()` + `cap.adapterInfo`           | `@astro-simulator/core` gpu namespace    | **읽기 전용 의존** — WebGPU adapter info 재사용 (중복 감지 금지)                                                                          |
| URL sync (`url-sync.tsx`)                                    | `apps/web/src/core/url-sync.tsx`         | **확장** — `?gpu=` 초기 1회 파싱 → sendCommand (LOD 와 동일 패턴)                                                                         |
| `browser-verify-*.mjs` 계열                                  | `apps/web/scripts/browser-verify-*.mjs`  | **확장** — tier 차등 bench 시나리오 재활용                                                                                                |

**신규 구현**:

- `apps/web/src/core/detect-gpu-tier.ts` — tier 감지 + 프로파일 조회 (약 150~200 라인)
- `apps/web/src/core/detect-gpu-tier.test.ts` — 10 mock fixture + 실기기 3종 (mock 우선, 실기기 수동 보완)
- `apps/web/src/core/parse-gpu-tier.ts` + `parse-gpu-tier.test.ts` — URL `?gpu=` parser (약 60 라인 + 테스트)
- `packages/core/src/render/tier-profile.ts` — tier 프로파일 스펙 (LOD 상한 / 파티클 / shadow / AA / post-proc / bloom 6축)
- `packages/core/src/render/tier-profile.test.ts` — 스펙 무결성 assert (카테고리 enum 완비)

### 네이밍 정책 ADR Concrete Prediction 2 의 대응 계약

선행 ADR `20260424-tier-naming-policy.md` §Prediction 2 (line 232~236) 에 이미 박제된 예측:

> **Prediction 2**: #290 P11-C 에서 `apps/web/src/core/detect-gpu-tier.ts` (승격) + Graceful Degradation 모달 + URL sync 만으로 GPU tier 분기 동작. Scale Tier 파일 **코드 라인 변화 0**

**본 ADR 상대편 계약**:

- `packages/core/src/scene/tier.ts` / `tier-transition.ts` / `solar-system-scene.ts` — **코드 변경 0 라인** (LOD ADR Amendment 에서 `solar-system-scene.ts` 는 LOD hook 예외 허용, 본 ADR 은 예외 적용 없음)
- Scale Tier API (`activeTier` / `setTier` / `renderScaleForTier`) — 변경 없이 **읽기 전용** 도 불요 (GPU tier 는 Scale Tier 몰라도 동작)
- Scale Tier vs GPU tier **완전 직교** — 한쪽 변경이 다른 쪽 구현 경로에 영향 없음

### #310 네이밍 정책 ADR 정합

선행 ADR `20260424-tier-naming-policy.md` §1 SSoT 표 `GPU tier` 행 (line 136) 의 경로 완전 준수:

| 필드           | ADR 박제값 (선행)                                          | 본 ADR 구현 계획                   | 정합 여부 |
| -------------- | ---------------------------------------------------------- | ---------------------------------- | --------- |
| 타입           | `GpuTier`                                                  | `type GpuTier = 'a' \| 'b' \| 'c'` | ✓         |
| 값 domain      | `'a' \| 'b' \| 'c'`                                        | 동일                               | ✓         |
| 주 변수/함수   | `detectedGpuTier` / `detectGpuTier` / `applyGpuTierPreset` | 동일 (§결정 §1)                    | ✓         |
| 모듈 경로      | `apps/web/src/core/detect-gpu-tier.ts` (승격)              | 동일                               | ✓         |
| URL 파라미터   | `?gpu=a\|b\|c`                                             | 동일 (§결정 §3)                    | ✓         |
| UI 노출 텍스트 | "GPU tier-A/B/C" (prefix 필수)                             | 동일 (§결정 §3)                    | ✓         |

---

## 후보 비교 — 5축

### 축 1. GPU 감지 알고리즘 우선순위

DoD #1 의 구체 알고리즘. 입력 신호 5개 (`navigator.gpu` / `GPUAdapter.requestAdapterInfo()` / `devicePixelRatio` / `hardwareConcurrency` / `detectIsMobile()`) 의 평가 순서.

| 축                     | 후보 A (권장)                                                                                                                                                                               | 후보 B                                         | 후보 C                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------- |
| **평가 순서**          | (1) **hard reject**: isMobile && !navigator.gpu → tier-c / (2) WebGPU + adapterInfo 고성능 GPU → tier-a / (3) WebGPU + integrated GPU 또는 M1+ iPad → tier-b / (4) WebGL2 fallback → tier-c | 가중 점수 합산 (5 signal × weight → threshold) | ML 모델 (사전 학습 통계) 로 분류 |
| **결정론 / 재현성**    | ⭐ 분기 순서가 명시적. 동일 navigator 입력 → 동일 출력                                                                                                                                      | △ threshold tuning 히스토리에 따라 바뀜        | ✗ 모델 버전에 종속               |
| **디버그 용이성**      | ⭐ "왜 tier-c?" 질문에 1 분기로 설명                                                                                                                                                        | △ 가중치 5개 소인수 분해 필요                  | ✗ 블랙박스                       |
| **테스트 편의**        | ⭐ 10 mock fixture 로 각 분기 경로 완전 커버                                                                                                                                                | △ threshold 경계에서 fixture 폭발              | ✗ ML 재현 환경 필요              |
| **코드 단순성**        | ⭐ 약 40~60 라인                                                                                                                                                                            | △ 약 80~120 라인 (score 계산 + weight table)   | ✗ 의존성 추가 (TF.js 등)         |
| **오분류 시 대응**     | 분기 1개 조정으로 패치 가능 (각 경계 개별 설명)                                                                                                                                             | weight 재튜닝 필요 — 다른 분기도 영향          | 데이터 재수집 + 재학습           |
| **확장성 (새 signal)** | 신호 추가 = 분기 1줄 + fixture 추가                                                                                                                                                         | weight table 확장 가능                         | 재학습 필요                      |

**선택: 후보 A (명시적 분기 순서)**.

**구현 공식** (순수 함수, `apps/web/src/core/detect-gpu-tier.ts` 에 박제):

```ts
interface GpuDetectionInput {
  webgpu: { supported: boolean; adapterInfo: GPUAdapterInfo | null };
  devicePixelRatio: number;
  hardwareConcurrency: number;
  navigator: NavigatorLike; // isMobile 감지용 — is-mobile.ts 재사용
}

export function detectGpuTier(input: GpuDetectionInput): GpuTier {
  const isMobile = detectIsMobile(input.navigator);

  // 분기 1: hard reject — 모바일 + WebGPU 미지원은 tier-c 확정 (iOS Safari < 17.4 다수)
  if (isMobile && !input.webgpu.supported) {
    return 'c';
  }

  // 분기 2: WebGPU 미지원 데스크톱 — WebGL2 fallback → tier-c
  if (!input.webgpu.supported) {
    return 'c';
  }

  // 분기 3: WebGPU 지원 — adapterInfo 기반 discrete vs integrated 판정
  const adapter = input.webgpu.adapterInfo;
  const isDiscrete = classifyAdapterIsDiscrete(adapter);
  const highCpu = input.hardwareConcurrency >= 8;

  // 분기 3a: 데스크톱 + discrete GPU + 8코어+ → tier-a (RTX/Apple M-Pro 이상)
  if (!isMobile && isDiscrete && highCpu) {
    return 'a';
  }

  // 분기 3b: 모바일 WebGPU 지원 (M1+ iPad, 최신 Android) 또는 integrated 데스크톱 → tier-b
  //   iPadOS 17+ WebGPU 지원 기기는 integrated GPU 범주지만 여전히 tier-b 로 허용 (ADR §4 mobile suspension)
  return 'b';
}
```

**암묵 전제** (박제):

- `classifyAdapterIsDiscrete(adapter)` — `adapter.vendor` / `adapter.architecture` / `adapter.description` 키워드 기반 분류. vendor 매칭 리스트 (§결정 §1 카테고리 enum 완비). 미지 vendor → `console.warn` + `false` fallback (integrated 취급, 보수적)
- `devicePixelRatio` 는 **감지에 사용하지 않음** — 분기에서는 제외, 프로파일 적용 시 shadow 해상도 보정에만 사용 (축 4). 이유: DPR 은 OS 설정(Retina scale) 이라 GPU 성능과 상관 약함
- **unknown signal** 은 모두 "보수적 downgrade" 원칙 — 예: `navigator.gpu` undefined (구형 브라우저) → tier-c, `hardwareConcurrency` undefined → 0 취급하여 tier-b 한계로 이동
- **`devicePixelRatio` 를 DoD #1 에 "조합" 으로 명시했으나 실제 쓰임은 shadow 해상도 축소에만** — DoD 텍스트 읽기 편의를 위한 시그널 열거이며 tier 분류 기준이 아님. 명시 박제로 구현자 오해 방지

**근거 (후보 B/C 기각 세부)**:

- 후보 B (가중 점수) 는 오분류 진단이 불투명 — "tier-a 가 나와야 하는데 tier-b 가 나왔다" 상황에서 weight tuning 이력을 봐야 원인 추적 가능. 후보 A 는 "분기 3a 조건 중 `highCpu` 가 false 였다" 처럼 1 라인 진단 가능
- 후보 C (ML) 는 학습 데이터 수집 자체가 tier 분류의 상위 문제 — 순환 의존. 재현성 없음 (모델 버전 업 시 과거 결과 깨짐)
- 후보 A 의 "hard reject" 를 분기 1 로 앞으로 당긴 이유: 모바일 접근의 99%+ 가 tier-c 로 귀결되는데 분기 3b 까지 끌고가면 불필요한 adapter classification 비용 발생. 초기 감지 지연 감소

### 축 2. SSR → CSR Hydration 전략

Next.js App Router 환경에서 `detect-gpu-tier.ts` 는 **반드시 브라우저 환경** 에서 동작 (`navigator.gpu` / `GPUAdapter` / `navigator.maxTouchPoints` 서버 부재). hydration mismatch 방지 전략.

| 축                                  | 후보 A (권장)                                                                       | 후보 B                                | 후보 C                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------ |
| **서버 초기값**                     | **tier-b 중립 디폴트** (서버 HTML 에 "중간 성능 가정" 박제)                         | 서버에서 항상 `tier-b` 정적 HTML 렌더 | `suppressHydrationWarning={true}` 로 mismatch 무시     |
| **hydration 후 경로**               | 클라이언트에서 `useEffect` 내 tier 감지 → store 갱신 + 프로파일 재적용              | 동일                                  | 동일                                                   |
| **첫 프레임 UX**                    | 중립 tier-b → 실측 tier (a/c) 전환 시 **short-lived flicker** 가능 (약 1 프레임)    | 동일                                  | tier 전환 플리커 **무시** (워닝 suppress)              |
| **SSR 정합성**                      | ⭐ SSR 결과가 모든 사용자에게 동일 HTML (캐시 친화)                                 | ⭐ 동일                               | △ 개발자가 어디서 mismatch 가 나는지 모름 (silent)     |
| **flicker 정량**                    | tier-b → tier-a: 파티클 ↑, shadow ↑ → 시각적으로 "풍성해짐" (UX 양성)               | 동일                                  | 동일                                                   |
|                                     | tier-b → tier-c: 파티클 ↓, shadow OFF → "시각적 축소" (UX 음성)                     |                                       |                                                        |
| **완화 수단**                       | tier-c 로 내려갈 때 **Graceful Degradation 알림 표시** (이미 DoD 에 박제, §결정 §5) | 동일                                  | alert 없음 → 사용자 혼란                               |
| **`suppressHydrationWarning` 범위** | **사용 안 함** (서버/클라이언트 동일 초기값)                                        | 동일                                  | 전역 적용 필요 — 다른 mismatch 도 silent (디버깅 지옥) |

**선택: 후보 A (tier-b 중립 디폴트 + hydration 후 클라이언트 감지)**.

**구현 전략**:

- `sim-store.ts` 의 초기값: `detectedGpuTier: 'b'` (중립 디폴트, `gpu-tier-pending` 플래그 함께)
- `sim-canvas.tsx` 의 `useEffect` 내 `detectGpuTier()` 호출 → store 갱신 + 알림 트리거
- tier-b → tier-c 전환 시 `engineNotice.key='tier-c-graceful-degradation'` 1회 표시 (localStorage dismiss 연동은 DoD 비-범위 — 후속 분리 가능)
- tier-b → tier-a 전환은 **조용히 업그레이드** — 사용자 체감 "풍성해짐" 으로 UX 양성

**근거 (후보 B/C 기각)**:

- 후보 B 는 후보 A 와 사실상 동일. 차이는 "서버가 tier-b 를 **명시적으로** 박제" 문구인데, 후보 A 의 "중립 디폴트" 가 이미 같은 의미
- 후보 C 는 **디버깅 지옥** — `suppressHydrationWarning` 는 "아는 mismatch 하나만 무시" 용도이며 전역 적용 시 다른 버그도 silent. CRITICAL #4 "한글 인코딩 검증" 비슷한 "조용한 실패 방지" 원칙 위배
- 후보 A 의 flicker 는 tier-c 로 내려갈 때만 발생 (UX 음성) → 이미 §결정 §5 Graceful Degradation 알림으로 완화됨 → 실질 비용 0

### 축 3. URL 우선순위 규칙

URL 파라미터가 중첩될 때 (`?mode=X&gpu=Y&lod=Z&tier=W`) 우선순위.

| 축                   | 후보 A (권장)                                                                                                                                                                                   | 후보 B                                                        | 후보 C                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| **우선순위 규칙**    | (1) `?mode=X` (예약어, 단일 모드 전환으로 폐기된 과거 URL 호환 backward-ignore) / (2) `?gpu=X` (자동 감지 override) / (3) tier 디폴트 (자동 감지) / (4) `?lod=X` `?tier=X` 는 별개 네임스페이스 | `?gpu=` 는 tier 디폴트만 덮음, `?mode=` 와 독립 (mode 폐기됨) | `?gpu=` 가 모든 다른 파라미터보다 우선              |
| **사용자 정신 모델** | ⭐ "모드 > GPU 감지 > 디테일" 계층이 직관적                                                                                                                                                     | ⭐ 동일                                                       | ✗ `?gpu=` 가 `?lod=` / `?tier=` 와 섞이면 예측 불가 |
| **#310 정합**        | ⭐ Scale Tier (`?tier=`) vs GPU tier (`?gpu=`) 독립 유지                                                                                                                                        | ⭐ 동일                                                       | ✗ 충돌                                              |
| **backward 호환**    | ⭐ `?mode=scientific` / `?view=educational` 구형 URL 은 parse 후 무시 (이미 #298 backward-ignore 박제됨)                                                                                        | ⭐ 동일                                                       | △                                                   |
| **구현 복잡도**      | 각 파라미터 독립 파싱 — 기존 `parseLodLevel` 패턴 그대로                                                                                                                                        | 동일                                                          | 복잡 (파라미터 간 상호작용 우선순위 테이블)         |

**선택: 후보 A (계층 우선순위 + 네임스페이스 독립)**.

**구현 원리** (기존 `url-sync.tsx` 패턴 확장):

1. `?mode=X` / `?view=X` — **무시** (backward-ignore, P12 #298 에서 이미 박제)
2. `?gpu=a|b|c` — `parseGpuTier` 로 파싱. valid 값이면 `detectedGpuTier` 를 그 값으로 강제 덮어씀. invalid 이면 자동 감지 fallback + console.warn (DoD #3)
3. `?lod=X` — 기존 `parseLodLevel` (변경 없음)
4. `?tier=X` — Scale Tier 전용 (#310 §3, 현재 미구현이므로 parse 없음)

**URL 파라미터 네임스페이스 표** (§결정 §3 에 박제):

| 파라미터                | 네임스페이스 | 값 domain                       | parser                       |
| ----------------------- | ------------ | ------------------------------- | ---------------------------- |
| `?gpu=`                 | GPU tier     | `a` / `b` / `c`                 | `parseGpuTier` (본 ADR 신설) |
| `?lod=`                 | LOD level    | `high` / `mid` / `low` / `auto` | `parseLodLevel` (P11-B)      |
| `?tier=`                | Scale Tier   | `solar` / `inner` / `body`      | (미구현 — #310 §3)           |
| `?mode=` / `?view=`     | (폐기)       | —                               | 무시 (backward-ignore)       |
| `?integrator=` / `?gr=` | 물리 엔진    | —                               | 기존 parser                  |

**근거 (후보 B/C 기각)**:

- 후보 B 는 `?mode=` 가 이미 폐기됐으므로 언급할 필요가 없다는 관점이나, 과거 북마크 URL 대응 서술이 명시적이지 않아 "mode 가 오면 어떻게 동작?" 질문이 드리프트 가능. 후보 A 는 명시 박제 우선
- 후보 C 는 `?gpu=` 가 `?lod=` 를 덮는 식의 상호작용을 도입 — URL 의미가 숨겨진 결합을 가지게 되어 디버그 난해

### 축 4. Tier 프로파일 스펙 테이블 (6축 × 3 tier)

DoD #4 의 구체 스펙. 각 tier 별 (LOD / 파티클 / shadow / AA / post-proc / bloom) 파라미터.

| 축                     | tier-a (고성능)                | tier-b (중립)                | tier-c (저성능)                       |
| ---------------------- | ------------------------------ | ---------------------------- | ------------------------------------- |
| **LOD 픽셀 경계 상향** | `high: 50, mid: 8` (현 기본값) | `high: 50, mid: 8` (동일)    | `high: 100, mid: 20` (강제 downgrade) |
| **LOD override 강제**  | 없음 (거리 자동)               | 없음                         | `'low'` 강제 — 모든 body billboard    |
| **파티클 상한**        | 50,000                         | 20,000                       | 0 (비활성)                            |
| **Shadow 해상도**      | 2048² × DPR clamp 최대 2       | 1024²                        | OFF                                   |
| **AA**                 | MSAA 8×                        | MSAA 4×                      | FXAA (post-proc pass 내부)            |
| **Post-proc pipeline** | 전체 (tonemap + bloom + grain) | tonemap + bloom (grain 제외) | OFF (직접 backbuffer)                 |
| **Bloom**              | 활성 (intensity 1.0)           | 활성 (intensity 0.6)         | 비활성                                |
| **회귀 목표**          | baseline 대비 < 5%             | baseline 대비 < 10%          | idle fps ≥ 30 (절대값)                |

**선택: 위 표 그대로 (근거 하단)**.

**매핑 메커니즘** (§결정 §4 에 박제):

- tier 프로파일은 `packages/core/src/render/tier-profile.ts` 에 데이터 상수로 박제
- `apps/web/src/components/sim-canvas.tsx` 가 `detectedGpuTier` 를 구독해 `applyGpuTierPreset(profile)` 호출 → Babylon scene 내부 파라미터 일괄 설정
- LOD 픽셀 경계는 `lodFromScreenCoverage({ ..., profile: tierProfile })` 인자로 주입 (기존 상수 `LOD_PIXEL_THRESHOLDS` 는 default 로 유지, profile 지정 시 덮어씀)
- LOD override 강제 (`'low'`) 는 tier-c 진입 시 `sendCommand({ type: 'setLodOverride', level: 'low' })` — URL `?lod=` 가 있으면 URL 우선 (디버그 경로 차단 금지)

**구현 공식** (tier 프로파일 스펙):

```ts
// packages/core/src/render/tier-profile.ts
export interface TierProfile {
  tier: GpuTier;
  lod: { high: number; mid: number; forceOverride?: LodLevel };
  particles: { maxCount: number };
  shadow: { resolution: number | 'off'; dprClampMax: number };
  aa: 'msaa8' | 'msaa4' | 'fxaa' | 'off';
  postProc: { enabled: boolean; bloom: boolean; grain: boolean };
}

export const TIER_PROFILES: Record<GpuTier, TierProfile> = {
  a: {
    tier: 'a',
    lod: { high: 50, mid: 8 },
    particles: { maxCount: 50_000 },
    shadow: { resolution: 2048, dprClampMax: 2 },
    aa: 'msaa8',
    postProc: { enabled: true, bloom: true, grain: true },
  },
  b: {
    tier: 'b',
    lod: { high: 50, mid: 8 },
    particles: { maxCount: 20_000 },
    shadow: { resolution: 1024, dprClampMax: 2 },
    aa: 'msaa4',
    postProc: { enabled: true, bloom: true, grain: false },
  },
  c: {
    tier: 'c',
    lod: { high: 100, mid: 20, forceOverride: 'low' },
    particles: { maxCount: 0 },
    shadow: { resolution: 'off', dprClampMax: 1 },
    aa: 'fxaa',
    postProc: { enabled: false, bloom: false, grain: false },
  },
} as const;
```

**근거 (각 수치의 선택)**:

- tier-a 파티클 50k: Babylon.js 가이드 권고 최대치. RTX3070급 GPU 에서 60fps 유지 가능 (mdn/babylon docs)
- tier-b 파티클 20k: tier-a/4 — conservative 중간값. Apple M1 / integrated Intel Iris Xe 60fps 실측 (볼륨 기반 추정, 실측 가능 시 갱신 트리거 재검토 조건 §2)
- tier-c 파티클 0: idle fps ≥ 30 보장을 위한 최대 억제. partial 비활성은 측정 복잡 — binary on/off 로 단순화
- Shadow 해상도 2048/1024/OFF: 현재 baseline (P12 이후) 이 2048 고정. 1024 는 VRAM 1/4 절감. OFF 는 GPU submission 제거
- MSAA 8/4/FXAA: Babylon `scene.activeCameras[0].samples` 지원 값. FXAA 는 post-proc pass 1회 추가지만 MSAA 8× 대비 VRAM 절반
- Post-proc OFF (tier-c) 는 backbuffer 직접 present — pipeline 비용 제거
- **회귀 목표** 는 PM 재계약 박제 (tier-a < 5% / tier-b < 10% / tier-c 절대 fps ≥ 30)

### 축 5. tier-c 자동 억제 조합 (idle fps ≥ 30 달성 파라미터)

DoD #5 의 구체 구현. scientific 모드 폐기 대체.

| 축                            | 후보 A (권장)                                                                            | 후보 B                                              | 후보 C                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------- |
| **억제 수단 조합**            | 축 4 tier-c 프로파일 전체 일괄 적용 + LOD low 강제                                       | LOD 만 low 강제 (다른 프로파일 유지)                | 사용자 선택 UI 제공 — 기본값 억제 + opt-out |
| **UX 일관성**                 | ⭐ 단일 "저성능 모드" 로 경험 통일                                                       | △ 파티클/shadow 는 유지 → idle fps ≥ 30 달성 불확실 | △ 선택 UI 가 모달 fatigue 유발              |
| **구현 복잡도**               | ⭐ TIER_PROFILES['c'] 적용만                                                             | ⭐ 간단                                             | ✗ 모달 컴포넌트 + 상태 관리                 |
| **DoD #5 보장**               | ⭐ 모든 축 억제로 fps 보장                                                               | △ 측정 필요 — 실기기에서 fps 30 미달 위험           | △ opt-out 시 fps 보장 불가                  |
| **Graceful Degradation 알림** | `tier-c-graceful-degradation` 키 알림 1회 — 사용자 인지는 보장, 선택권은 축소 (ADR 의도) | 동일                                                | 모달이 선택 UI 역할                         |
| **후속 UX 분리 가능**         | ⭐ "자동 억제 + 사용자 수동 상향 UI" 를 후속 이슈로 분리 가능                            | 동일                                                | 이미 UI 포함 → 후속 분리 어려움             |
| **비-범위 준수**              | ⭐ DoD 비-범위 "tier-c UX 모달 — 자동 적용으로 대체" 준수                                | ⭐ 동일                                             | ✗ 비-범위 위배 (모달 UX 포함)               |

**선택: 후보 A (프로파일 전체 일괄 적용 + LOD low 강제 + 알림 1회)**.

**실행 순서** (§결정 §5 에 박제):

1. Hydration 후 `detectGpuTier()` 결과가 `'c'` 면:
   - `applyGpuTierPreset(TIER_PROFILES['c'])` 호출 — Babylon scene 파라미터 일괄 설정
   - `sendCommand({ type: 'setLodOverride', level: 'low' })` — LOD 강제 (단, URL `?lod=` 가 있으면 URL 우선)
   - `engineNotice` 키 `tier-c-graceful-degradation` 표시
2. 사용자가 `?gpu=a` 또는 `?gpu=b` 로 수동 override 하면 tier-c 프로파일 취소 + 해당 tier 프로파일 적용
3. idle fps ≥ 30 은 bench 시나리오 `bench:baseline idle` 에서 자동 검증 (DoD #8)

**근거 (후보 B/C 기각)**:

- 후보 B: LOD 만 내려도 파티클 20k + shadow 1024 가 남아 integrated GPU + mobile 에서 fps 30 미달 가능. 실측 전 채택 불가
- 후보 C: DoD 비-범위 **"tier-c UX 모달 (자동 적용으로 대체)"** 정면 위배. CRITICAL #6 스프린트 비목표 준수
- 후보 A 의 "사용자 수동 상향 UI" 는 후속 이슈로 분리 가능 — 현재는 `?gpu=b` URL override 로 enough (디버그 경로는 축 3 우선순위로 열려있음)

---

## 결정

### §1. 공식 심볼 표 (GPU tier 네임스페이스 SSoT)

#310 `20260424-tier-naming-policy.md` §1 행 GPU tier 와 완전 정합.

| 항목          | 값                                                                    |
| ------------- | --------------------------------------------------------------------- |
| 타입          | `type GpuTier = 'a' \| 'b' \| 'c'`                                    |
| 모듈 경로     | `apps/web/src/core/detect-gpu-tier.ts`                                |
| 감지 함수     | `detectGpuTier(input: GpuDetectionInput): GpuTier`                    |
| 프로파일 적용 | `applyGpuTierPreset(profile: TierProfile, scene: Scene): void`        |
| 프로파일 스펙 | `packages/core/src/render/tier-profile.ts` `TIER_PROFILES[tier]`      |
| 저장소 필드   | `sim-store.ts` `detectedGpuTier: GpuTier` (디폴트 `'b'`)              |
| URL 파라미터  | `?gpu=a\|b\|c`                                                        |
| URL parser    | `apps/web/src/core/parse-gpu-tier.ts` `parseGpuTier(urlParam)`        |
| 알림 키       | `tier-c-graceful-degradation` (기존 `mobile-webgpu-best-effort` 치환) |

### §2. Adapter 분류 카테고리 enum (카테고리 drift 방어)

`classifyAdapterIsDiscrete(adapter)` 의 vendor 분류 — 주석 계약 + enum 완비 테스트로 drift 방어.

| Vendor / architecture keyword (소문자 포함 매칭)                   | isDiscrete | 근거 fixture                          |
| ------------------------------------------------------------------ | ---------- | ------------------------------------- |
| `nvidia` (RTX / GTX)                                               | **true**   | RTX3070 fixture                       |
| `amd` + 아키텍처 `rdna` / `radeon rx`                              | **true**   | AMD 6800 fixture                      |
| `apple` + `m1 pro` / `m1 max` / `m2` / `m3` / `m4` (pro/max/ultra) | **true**   | M2 Pro / M3 Max fixture               |
| `intel` + `arc` (Xe / Arc 라인)                                    | **true**   | Intel Arc A770 fixture                |
| `apple` + `m1` 기본 (no pro/max/ultra) / `m2` 기본                 | **false**  | M1 iPad / M1 MacBook Air (integrated) |
| `intel` + 나머지 (Iris / UHD 등)                                   | **false**  | Intel Iris Xe fixture                 |
| `qualcomm` / `arm` / `mali` / `adreno` (모바일 GPU)                | **false**  | Android Snapdragon 8 Gen 3 fixture    |
| **미지 vendor**                                                    | **false**  | + `console.warn` (drift 탐지용)       |

**테스트**: `detect-gpu-tier.test.ts` 에 "VENDOR_CLASSIFICATION_CASES 카테고리 enum 완비 assert" 포함. 미지 vendor 처리를 위한 console.warn 검증 (카테고리 enum drift 방어, volt #49).

**데이터 구조 승격** (cross-validate §이견 수용 1 반영, 2026-04-24): 위 vendor 표는 구현 시 함수 내부 키워드 분기가 아닌 **`VENDOR_RULES` 데이터 객체** 로 박제한다. 예시 구조:

```ts
// apps/web/src/core/detect-gpu-tier.ts (구현 PR 에서 확정)
interface VendorRule {
  vendorPattern: RegExp;
  discreteKeywords?: RegExp; // 매칭 시 discrete 판정
  alwaysDiscrete?: boolean;
  alwaysIntegrated?: boolean;
}

export const VENDOR_RULES: Record<string, VendorRule> = {
  nvidia: { vendorPattern: /nvidia/i, alwaysDiscrete: true },
  'amd-discrete': { vendorPattern: /amd/i, discreteKeywords: /rdna|radeon rx/i },
  'apple-m-pro': { vendorPattern: /apple/i, discreteKeywords: /m[1-9]\s*(pro|max|ultra)/i },
  'apple-m-basic': { vendorPattern: /apple/i, alwaysIntegrated: true }, // pro/max 가 아닌 M-series
  'intel-arc': { vendorPattern: /intel/i, discreteKeywords: /arc|xe/i },
  'intel-integrated': { vendorPattern: /intel/i, alwaysIntegrated: true },
  qualcomm: { vendorPattern: /qualcomm|adreno/i, alwaysIntegrated: true },
  'arm-mali': { vendorPattern: /arm|mali/i, alwaysIntegrated: true },
};
```

**이점**: 신규 vendor 추가 = 객체 한 줄 추가만 (Concrete Prediction 1 강화). 테스트에서 `VENDOR_RULES['nvidia']` 존재 검증 가능 — "신규 데이터 ≠ 신규 코드" 원칙 강화.

### §3. URL 파라미터 정책 (§310 정합)

```
우선순위:
  (1) ?mode= / ?view= — backward-ignore (P12 #298 에서 폐기)
  (2) ?gpu=a|b|c — GPU tier 강제 override (invalid → auto 감지 fallback + warn)
  (3) (URL 없음) — detectGpuTier() 자동 감지
  (4) ?lod=high|mid|low|auto — LOD 별도 (GPU tier 프로파일의 forceOverride 를 덮을 수 있음)
  (5) ?tier=solar|inner|body — Scale Tier 별도 네임스페이스 (미구현, #310 §3 SSoT)
```

**parser 구조** (기존 `parseLodLevel` 패턴 재사용):

```ts
// apps/web/src/core/parse-gpu-tier.ts
const VALID_GPU_TIERS: ReadonlySet<string> = new Set(['a', 'b', 'c']);

export function parseGpuTier(urlParam: string | null | undefined): GpuTier | 'auto' {
  if (urlParam === null || urlParam === undefined || urlParam === '') {
    return 'auto';
  }
  const normalized = urlParam.toLowerCase();
  if (normalized === 'auto') return 'auto';
  if (VALID_GPU_TIERS.has(normalized)) return normalized as GpuTier;
  // eslint-disable-next-line no-console
  console.warn(`[parse-gpu-tier] 알 수 없는 ?gpu=${urlParam} — 'auto' 로 폴백`);
  return 'auto';
}
```

**검증 테스트** (`parse-gpu-tier.test.ts`, DoD #3):

- `parseGpuTier(null)` → `'auto'`
- `parseGpuTier('a' | 'b' | 'c')` → 각각 valid tier
- `parseGpuTier('A' | 'B' | 'C')` → 대소문자 무시 (`'a' | 'b' | 'c'`)
- `parseGpuTier('d' | 'xyz' | 'tier-a')` → `'auto'` + console.warn 1회
- `parseGpuTier('auto')` → `'auto'` (명시적)

### §4. Tier 프로파일 적용 메커니즘

**데이터 주도 설계** — 프로파일 파라미터 조정이 scene/render 코드 변경 없이 가능 (Concrete Prediction 2).

**적용 순서**:

1. `sim-canvas.tsx` `useEffect` 에서 `detectGpuTier(input)` → `tier` 확정
2. URL `?gpu=X` 가 있으면 `parseGpuTier` 결과로 덮어씀
3. `applyGpuTierPreset(TIER_PROFILES[tier], scene)` 호출 — Babylon scene 파라미터 일괄 설정:
   - `scene.shadowsEnabled = profile.shadow.resolution !== 'off'`
   - `scene.postProcessesEnabled = profile.postProc.enabled`
   - Camera antialiasing — Babylon `scene.activeCameras[0].samples` 값 매핑
   - 파티클 상한 — ParticleSystem `emitRate` / `capacity` 조정 (P12+ 파티클 구현 전제, 현재 미구현이면 no-op)
   - Bloom pipeline on/off
4. LOD 는 `sendCommand({ type: 'setLodOverride', level: profile.lod.forceOverride ?? 'auto' })` — 단, URL `?lod=` 가 있으면 무시
5. `setDetectedGpuTier(tier)` — store 갱신 → UI 반영 + 알림 분기 트리거
6. tier === 'c' 이면 `setEngineNotice({ key: 'tier-c-graceful-degradation', message: ... })`

**LOD 경계 주입** (P11-B 상대편 계약):

현재 `lodFromScreenCoverage` 는 하드코딩 `LOD_PIXEL_THRESHOLDS = { high: 50, mid: 8 }` 사용. 본 ADR 구현 PR 에서 다음 확장:

```ts
// packages/core/src/render/lod.ts 확장 (주석 계약 §5 수정 포함)
export function lodFromScreenCoverage(input: LodDecisionInput): LodLevel {
  const thresholds = input.pixelThresholds ?? LOD_PIXEL_THRESHOLDS;
  // ... 기존 로직에서 thresholds.high / thresholds.mid 사용
}
```

LOD ADR `20260424-p11-b-lod-design.md` §결정 §3 주석 계약 §5 "픽셀 경계: high≥50, 50>mid≥8" 는 "tier 프로파일로 주입 가능, 기본값 50/8 유지" 로 **Amendment 박제** 필요. 본 ADR 구현 PR 에서 P11-B ADR 에 Amendment 추가.

### §5. tier-c Graceful Degradation 실행 계약

1. tier === 'c' 감지 시 자동 억제 조합 (축 5 후보 A) 적용
2. `engineNotice` 키 `tier-c-graceful-degradation`, 메시지: "저성능 환경 감지 — 시각 효과가 자동 축소됩니다. (URL ?gpu=b|a 로 수동 상향 가능)"
3. **기존 키 `mobile-webgpu-best-effort` 완전 치환** — `sim-canvas.tsx:69` + `sim-store.test.ts:136,138` 3개 지점 교체 (DoD #6)
4. localStorage dismiss 연동은 본 Phase **비-범위** (기존 `engineNotice` API 가 세션 한정 dismiss 만 지원). 후속 이슈 후보: "tier-c 알림 영속 dismiss"

### §6. 주석 계약 박제 (drift 방어)

`apps/web/src/core/detect-gpu-tier.ts` 상단에 박제:

```ts
// GPU tier 감지 계약 (ADR 20260424-tier-preset-design §결정):
//   1. tier 값 domain: 'a' | 'b' | 'c' 만 허용. 추가 시 ADR Amendment 선박제
//   2. 감지 순서: hard reject (모바일+!WebGPU → c) → WebGPU 미지원 (→ c) → adapter 분류 (discrete+8코어 → a, 그 외 → b)
//   3. 미지 vendor 는 integrated 취급 (보수적) + console.warn (drift 탐지)
//   4. SSR 디폴트 'b' — hydration 후 실측 덮어씀. suppressHydrationWarning 사용 금지
//   5. URL ?gpu= 는 자동 감지를 덮어씀. invalid 값은 'auto' fallback + console.warn (DoD #3)
//   6. tier-c 자동 억제: LOD low 강제 + 파티클 0 + shadow OFF + post-proc OFF + bloom OFF
//      (축 5 후보 A — DoD #5)
//   7. 알림 키는 반드시 'tier-c-graceful-degradation' 사용. 구 키 'mobile-webgpu-best-effort' 금지
// 위 계약 위배 변경은 즉시 버그로 간주 (CLAUDE.md "주석 계약 vs 구현 drift" 교훈, volt #49).
```

`packages/core/src/render/tier-profile.ts` 상단에도 "6축 × 3 tier 카테고리 완비 / 항목 누락 시 카테고리 enum 완비 테스트 fail" 주석 박제.

### §7. 테스트 전략

| 레이어              | 위치                                                                | 검증 대상                                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 단위 (GPU 감지)     | `apps/web/src/core/detect-gpu-tier.test.ts`                         | 10 mock fixture — RTX3070 / AMD6800 / M2Pro / M3Max / IntelIrisXe / M1 iPad / iPhone15 / AndroidPixel8 / Snapdragon8Gen3 / 구형 WebGL2-only. 각 예상 tier assert + vendor 카테고리 enum 완비 assert (§2) |
| 단위 (URL parser)   | `apps/web/src/core/parse-gpu-tier.test.ts`                          | valid / invalid / case-insensitive / auto / console.warn (DoD #3)                                                                                                                                        |
| 단위 (tier profile) | `packages/core/src/render/tier-profile.test.ts`                     | TIER_PROFILES 3 tier 완비 + 6축 (LOD/파티클/shadow/AA/post-proc/bloom) 필드 존재 assert                                                                                                                  |
| 회귀 가드           | `apps/web/src/core/is-mobile.test.ts` (유지, DoD #9)                | 기존 12 케이스 유지 — `detectIsMobile` 순수 함수 보호                                                                                                                                                    |
| 통합 (sim-canvas)   | 기존 `sim-store.test.ts` 확장                                       | 알림 키 치환 assert — `tier-c-graceful-degradation` 사용, `mobile-webgpu-best-effort` 완전 제거                                                                                                          |
| 실기기 (수동)       | `docs/benchmarks/p11-c-device-fixtures-<YYYYMMDD>.md`               | 실기기 3종 (M2 MacBook / iPhone15 / 구형 Android) tier assert 수동 보고서 (DoD #1)                                                                                                                       |
| bench 차등          | `pnpm bench` idle / play-1d / play-1y / focus-earth / focus-neptune | tier-a < 5% / tier-b < 10% / tier-c idle fps ≥ 30 (DoD #8)                                                                                                                                               |

**카테고리 enum 완비 assert** 예시:

```ts
test('VENDOR_CLASSIFICATION 표는 모든 예상 vendor 를 커버한다 (drift 방어)', () => {
  const required = [
    'nvidia',
    'amd',
    'apple-m-pro',
    'apple-m-basic',
    'intel-arc',
    'intel-integrated',
    'qualcomm',
    'mali',
    'adreno',
    'unknown',
  ];
  for (const key of required) {
    expect(VENDOR_CLASSIFICATION[key]).toBeDefined();
  }
});

test('TIER_PROFILES 는 3 tier 전부 + 6축 전부 커버한다', () => {
  for (const tier of ['a', 'b', 'c'] as const) {
    const profile = TIER_PROFILES[tier];
    expect(profile.lod).toBeDefined();
    expect(profile.particles).toBeDefined();
    expect(profile.shadow).toBeDefined();
    expect(profile.aa).toBeDefined();
    expect(profile.postProc).toBeDefined();
  }
});
```

---

## Concrete Prediction (CLAUDE.md "신규 데이터 ≠ 신규 코드")

본 ADR 박제 후 후속 PR / 확장 시 아래 3 예측을 재현해야 한다. 실패 시 **ADR Amendment 트리거**.

### Prediction 1: 신규 GPU vendor 추가 시 `detect-gpu-tier.ts` 외부 호출부 변화 0

**예측**: 미래 신규 GPU vendor (예: Intel Battlemage, AMD RDNA4, Apple M5) 를 `VENDOR_CLASSIFICATION` 표에 1줄 추가하면 외부 호출부 **코드 라인 변화 0**.

**근거 메커니즘**: `detectGpuTier` 는 vendor classification 을 내부 데이터 테이블로 처리 — 새 vendor 는 테이블 한 줄 추가만으로 동작.

**재현 검증** (후속 vendor 추가 PR 에서):

```bash
git diff <base>..<head> -- \
  apps/web/src/components/sim-canvas.tsx \
  apps/web/src/core/url-sync.tsx \
  apps/web/src/store/sim-store.ts \
  --numstat | awk '{s+=$1+$2} END {print s+0}'
# 기대값: 0 (외부 호출부 변경 없음 — 테이블만 갱신)
```

**예측 실패 시**: vendor 별 특수 분기가 외부 호출부에 침투했다는 신호 → ADR Amendment 박제 + 추상화 재조정.

### Prediction 2: Tier 프로파일 파라미터 조정 시 scene/render 코드 변화 0

**예측**: `TIER_PROFILES[tier]` 의 파라미터 값 조정 (예: tier-b 파티클 20k → 15k, tier-c shadow OFF → 256²) 시 `packages/core/src/scene/` 및 Babylon 렌더 관련 코드 **라인 변화 0**.

**근거 메커니즘**: `applyGpuTierPreset(profile, scene)` 가 유일한 적용 지점. 파라미터 값은 데이터 테이블 수정만. scene 은 generic accessor 호출.

**재현 검증** (후속 tier 튜닝 PR 에서):

```bash
git diff <base>..<head> -- \
  packages/core/src/scene/ \
  apps/web/src/components/sim-canvas.tsx \
  --numstat | awk '{s+=$1+$2} END {print s+0}'
# 기대값: 0 (scene + sim-canvas 변경 없음)
# 변경 가능 파일: packages/core/src/render/tier-profile.ts 만
```

**예측 실패 시**: tier 프로파일이 특정 파라미터용 하드코딩 분기를 scene 쪽에 남겼다는 신호. `applyGpuTierPreset` 의 추상화 부족 → 리팩토링 필요.

### Prediction 3: 후속 UX 모달 도입 시 `tier-c-graceful-degradation` 알림 키 외부 참조 변화 0

**예측**: 후속 이슈에서 tier-c 영속 dismiss 모달 또는 수동 tier 상향 UI 를 추가할 때, `engineNotice` 키 `tier-c-graceful-degradation` 을 참조하는 **외부 코드** (sim-canvas / sim-store 등) 변화 **0 라인**. UX 모달은 키를 구독할 뿐 emit 은 기존 `setEngineNotice` 경로 유지.

**근거 메커니즘**: 알림 키는 SSoT — emit 지점은 `detect-gpu-tier.ts` → `sim-store.setEngineNotice` 1회. UX 레이어는 `engineNotice.key === 'tier-c-graceful-degradation'` 을 구독.

**재현 검증** (후속 UX 이슈에서):

```bash
git diff <base>..<head> -- \
  apps/web/src/components/sim-canvas.tsx \
  apps/web/src/core/detect-gpu-tier.ts \
  apps/web/src/store/sim-store.ts \
  --numstat | awk '{s+=$1+$2} END {print s+0}'
# 기대값: 0 (emit 경로 변경 없음)
# 변경 가능 파일: 신규 모달 컴포넌트 1개 + UI 레이어만
```

**예측 실패 시**: 알림 emit 경로가 UX 로직에 뒤섞였다는 신호. 알림 모델 재설계 필요.

**성공 시 수확**: 본 tier 프로파일 + 알림 구조가 "데이터로만 확장되는 계층" 임을 실증 (volt #47 Concrete Prediction 재현 패턴).

---

## 영향 범위

### 본 ADR 박제 PR (ADR 파일만)

- 신규: `docs/decisions/20260424-tier-preset-design.md` (본 파일)

### 구현 PR — 본 ADR 기반 (#290 후속)

| 대상                    | 파일                                                                | 변경 규모 | DoD 대응                                          |
| ----------------------- | ------------------------------------------------------------------- | --------- | ------------------------------------------------- |
| 신규 detect-gpu-tier    | `apps/web/src/core/detect-gpu-tier.ts` + `detect-gpu-tier.test.ts`  | ~200 라인 | #1 (감지 알고리즘)                                |
| 신규 parse-gpu-tier     | `apps/web/src/core/parse-gpu-tier.ts` + `parse-gpu-tier.test.ts`    | ~70 라인  | #2 #3 (URL + 값 검증)                             |
| 신규 tier-profile       | `packages/core/src/render/tier-profile.ts` + `tier-profile.test.ts` | ~150 라인 | #4 (프로파일 스펙)                                |
| sim-canvas 마이그레이션 | `apps/web/src/components/sim-canvas.tsx`                            | ~40 라인  | #5 (tier-c 자동 억제) #6 (is-mobile 마이그레이션) |
| sim-store 알림 키 치환  | `apps/web/src/store/sim-store.ts` + `sim-store.test.ts`             | ~10 라인  | #6 (알림 키)                                      |
| url-sync 확장           | `apps/web/src/core/url-sync.tsx`                                    | ~15 라인  | #2 (URL override)                                 |
| LOD 경계 주입 확장      | `packages/core/src/render/lod.ts` (pixelThresholds 인자 추가)       | ~15 라인  | #4 (tier → LOD 주입)                              |
| P11-B ADR Amendment     | `docs/decisions/20260424-p11-b-lod-design.md` §§§Amendments 추가    | ~30 라인  | §4 주석 계약 §5 갱신                              |
| bench tier 차등         | `apps/web/scripts/bench/*` (기존 스크립트 확장)                     | ~30 라인  | #8 (회귀 게이트)                                  |
| 실기기 fixture 보고서   | `docs/benchmarks/p11-c-device-fixtures-<YYYYMMDD>.md`               | ~100 라인 | #1 실기기 3종                                     |

### Scale Tier 관련 파일 (변경 0, §310 Prediction 2 재현)

`packages/core/src/scene/tier.ts` / `tier-transition.ts` / `solar-system-scene.ts` — 변경 0 라인.

재현 검증 (구현 PR 머지 후):

```bash
git diff <base>..<head> -- packages/core/src/scene/ --numstat | awk '{s+=$1+$2} END {print s+0}'
# 기대값: 0
```

### `is-mobile.ts` 처리 (DoD #6 마이그레이션)

`apps/web/src/core/is-mobile.ts` 파일은 **유지**. 이유:

- `detectIsMobile(nav)` 가 `detect-gpu-tier.ts` 내부에서 signal 로 호출됨 → re-export 경로 없이도 import 재사용
- `is-mobile.test.ts` 유지 (DoD #9 회귀 가드)
- 외부 호출자 (`sim-canvas.tsx:10`) 는 `detect-gpu-tier` 로 전환 — `is-mobile.ts` 는 `detect-gpu-tier.ts` 내부 구현 디테일로 격하

**grep 검증** (구현 PR 에서):

```bash
# sim-canvas 에서 직접 import 제거 확인
grep -n "from '@/core/is-mobile'" apps/web/src/components/sim-canvas.tsx
# 기대: 매칭 없음 (detect-gpu-tier 가 대체)

# is-mobile.ts 자체는 detect-gpu-tier.ts 가 import
grep -n "from './is-mobile'" apps/web/src/core/detect-gpu-tier.ts
# 기대: 1건 (재사용)
```

---

## 위험 / 미해결

### 위험 1: `GPUAdapter.requestAdapterInfo()` 가 Privacy 정책으로 빈 객체 반환

일부 브라우저 (Safari 17.4+) 는 `requestAdapterInfo()` 에 privacy fingerprinting 완화로 vendor/architecture 를 **빈 문자열** 반환 가능.

**완화**:

- `classifyAdapterIsDiscrete` 에 "adapter === null || vendor === ''" 가드 추가 → `false` (integrated 취급) + `console.warn('[detect-gpu-tier] adapter info unavailable (privacy)')`
- 실측 기기에서 빈 adapter info 관찰 시 추가 signal (`hardwareConcurrency`, `devicePixelRatio`) 만으로 tier 판정 — 보수적으로 tier-b fallback
- Concrete Prediction 1 Amendment 트리거: 빈 adapter 처리를 위해 vendor 테이블 외 heuristic 이 필요해지면 데이터 주도 가정 수정

### 위험 2: tier 실측과 프로파일 FPS 불일치

tier-a 로 분류됐지만 실제 바닥 fps < 60 (예: 1440p 대형 모니터 + 외장 GPU) 또는 tier-c 분류인데 idle fps ≥ 30 미달 (extreme low-end).

**완화**:

- bench 차등 (DoD #8) 에서 tier-c 절대 fps ≥ 30 게이트 — 실측 미달 시 프로파일 파라미터 추가 조정 (재검토 조건 §1)
- tier-a 는 상대 회귀율 < 5% 측정 — baseline 은 P12 release tag `v0.12.0` commit (§테스트 전략)
- tier-a/b/c 분류가 **결정적 (deterministic)** 이라 "GPU 가 강한데 tier-b" 불만 시 `?gpu=a` 로 수동 상향 가능 (축 3 우선순위)

### 위험 3: Hydration flicker 가 Core Web Vitals 에 영향

축 2 후보 A 의 flicker (tier-b → tier-c) 가 CLS (Cumulative Layout Shift) 에 영향 → Lighthouse 점수 하락 가능.

**완화**:

- 프로파일 파라미터 중 **레이아웃 영향 없는 것만** 초기 적용 (shadow/AA/post-proc — 시각만 변경, 레이아웃 무영향)
- 파티클 상한은 scene 내부 파라미터 — DOM 레이아웃 무영향
- **Canvas 영역 스켈레톤 사전 확보** (cross-validate §이견 수용 2 반영, 2026-04-24) — Babylon `<canvas>` 래퍼에 `min-height: 100vh` (또는 viewport 기반 고정값) CSS 박제. hydration 중 canvas 크기가 확정되어 Layout Shift 0 보장. 구현 가이드는 구현 PR 의 sim-canvas 통합 단계에서 명시
- CLS 측정은 운영 후 (후속 이슈 가능 — 본 Phase 비-범위)

### 위험 4: Bench baseline 재측정 범위

tier-a 회귀율 < 5% 검증을 위한 baseline 은 `v0.12.0` tag commit. tier-a 환경 (discrete GPU 테스트 기기) 에서 baseline 재측정 필요.

**완화**:

- 구현 PR 에서 tier-a 환경 baseline 을 새로 캡처 (`pnpm bench:baseline` 기존 스크립트 활용)
- tier-b/c 의 baseline 은 tier-a 대비 상대 (프로파일 OFF 시 tier-a 와 동일 동작 — fallback 테스트)

### 미해결 1: tier 재감지 (런타임 GPU 상황 변화)

사용자가 사이트 방문 중 GPU 상황 변화 (예: 외장 GPU 언플러그, 배터리 세이버 모드 진입) 시 tier 재감지 없음. 초기 1회만 감지.

**후속 이슈 후보** (우선순위 low): "tier 런타임 재감지 — 페이지 가시성 변경 시 재평가". 본 Phase 비-범위.

### 미해결 2: iOS Safari WebGPU 가 간헐적으로 지원 플래그 on/off

iOS 17.4+ 는 WebGPU 를 feature flag (Settings → Advanced → Experimental WebKit Features) 로 제공. 사용자가 flag 를 토글하면 tier 판정 변화.

**현실적 대응**: DoD #1 실기기 fixture 에 iOS Safari 17.4+ + flag on 케이스 포함 검토 (수동 측정). flag off 는 tier-c 확정 — 모바일 WebGPU 미지원과 동일 경로.

### 미해결 3: `devicePixelRatio` shadow 해상도 보정 세부

DoD #1 에 `devicePixelRatio` 가 signal 로 열거됐으나 본 ADR 에서는 **tier 분류 기준 제외, shadow 해상도 보정용으로만 사용** (축 1 암묵 전제). 예: tier-b 에 DPR=3 인 고밀도 디스플레이이면 shadow 해상도 `1024² × min(DPR, 2)` 로 upscale.

**적용 공식**:

```ts
const effectiveShadowRes =
  profile.shadow.resolution === 'off'
    ? 0
    : profile.shadow.resolution * Math.min(devicePixelRatio, profile.shadow.dprClampMax);
```

**근거**: DPR 은 OS 설정이라 GPU 성능과 상관 약하지만, shadow 해상도는 화면 픽셀 밀도에 민감. 중간 타협.

---

## 재검토 조건

1. **DoD #8 bench 차등 미달** — tier-c idle fps < 30 관찰 시 프로파일 추가 축소 (예: Babylon `engine.setHardwareScalingLevel(0.5)` 로 internal resolution 반감)
2. **위험 1 재현 (빈 adapter info 다수)** — Safari 17.4+ privacy 완화로 adapter 빈 객체 관찰 시 vendor 테이블 대신 heuristic (CPU 코어 + DPR + touch) 만으로 tier 판정하는 대체 알고리즘 설계 (Concrete Prediction 1 Amendment)
3. **Prediction 1~3 중 하나 실패** — ADR Amendment 박제 후 추상화 재조정
4. **실기기 3종 실측에서 원하지 않는 tier 분류** (DoD #1) — 예: iPhone 15 + Safari 17.4+ WebGPU 지원 + A17 Pro integrated → 알고리즘은 tier-b 분류하지만 실측 fps 미달 시 iPhone 특화 override (mobile → tier-c 강제 유지) 재검토
5. **후속 모달 UX 도입** — `tier-c-graceful-degradation` 알림에 "수동 상향" 버튼 추가 필요 관찰 시 후속 이슈로 분리 (본 ADR 비-범위)
6. **네 번째 tier (`tier-d` 등) 등장** — extreme low-end (예: 구형 Chromebook + SwiftShader) 에서 tier-c 로도 idle fps < 30 반복 관찰 시 추가 tier 도입. 카테고리 enum 완비 테스트가 drift 즉시 감지
7. **devicePixelRatio shadow 보정 편차** — 3K/4K 고밀도 디스플레이 실측에서 shadow 해상도 부족 / 과도 관찰 시 `dprClampMax` 재튜닝

---

## 암묵 전제 박제

- `GPUAdapter.requestAdapterInfo()` 는 Promise — `detectGpuCapability()` 결과를 기다려야 tier 감지 완료. `sim-canvas.tsx` 의 기존 `gpuApi.detectGpuCapability().then(...)` 패턴 재사용
- SSR 환경에서 `navigator`/`document` 미정의 — `typeof navigator !== 'undefined'` 가드 필수 (기존 `detectIsMobile` 호출부와 동일)
- `process.env.NODE_ENV !== 'production'` 가드로 console.warn 을 dev/CI browser-verify 에서만 출력. prod 에서는 `console.warn` 자체는 유지 (사용자 콘솔에 URL 오타 피드백 제공)
- `devicePixelRatio` 는 tier 분류 **제외** (shadow 보정 전용)
- Babylon.js 버전 의존: `scene.postProcessesEnabled` / `scene.shadowsEnabled` / `camera.samples` API 는 Babylon 6.x+ 기본. 본 프로젝트는 8.x 사용 중 (확인됨)
- tier-a/b/c 값은 소문자 고정 — URL 파라미터 대소문자 무시는 parser 에서 정규화

---

## 교차검증 반영 사항

### Claude 편향 셀프 체크 (4종 체크리스트, cross-validate 호출 전 기록)

- **낙관적 일정**: 본 ADR 구현 PR 은 ~650 라인 + 실기기 3종 수동 측정. 2~3일 예상. 박제만 반일 — 낙관 편향 없음 ✓
- **결합 간과**: Scale Tier vs GPU tier 직교성은 #310 SSoT 이미 검증. LOD 픽셀 경계 주입이 새 결합 도입 — §4 주입 메커니즘 명시, P11-B Amendment 계획 박제 ✓
- **폐기 프레이밍**: `mobile-webgpu-best-effort` 키 치환은 "기능 대체" 가 아닌 "의미 확장" — 기존 기능은 tier-c 의 subset, 추가로 저성능 데스크톱 포함. ADR 에 명시 ✓
- **순수주의**: "scientific 모드 폐기 후 자동 억제 조합" 선택 (축 5 후보 A) — 사용자 선택 UI (후보 C) 를 ROI 부정으로 기각. 비-범위 준수 증거 ✓

### cross-validate 실행 (2026-04-24)

- **실행**: 2026-04-24T09:22:47Z ~ 09:27:34Z (287초, 첫 시도 429 RESOURCE_EXHAUSTED 이후 retry 성공), `gemini-2.5-pro`, `--approval-mode plan`
- **outcome**: applied (exit 0) — `.claude/logs/cross-validate-architecture-20260424-182247-outcome.json`
- **로그**: `.claude/logs/cross-validate-architecture-20260424-182247.log`
- **Gemini 6개 축 종평**: "전반적으로 거의 흠잡을 데 없는 최상급 설계 문서입니다. 특히 'Concrete Prediction'을 통해 설계의 확장성을 스스로 증명하려는 시도와, '주석 계약', '카테고리 enum 완비 테스트' 등으로 코드와 설계의 괴리(drift)를 시스템적으로 방지하려는 노력이 인상적입니다."

| 항목              | 평가                                                                              |
| ----------------- | --------------------------------------------------------------------------------- |
| 구조적 완성도     | 완벽에 가까움 — 컴포넌트/테스트 전략/영향 범위 누락 없음                          |
| 기술 결정 타당성  | GPU 감지 알고리즘 / SSR hydration / URL 우선순위 / 프로파일 수치 모두 근거 명확   |
| 인터페이스 명확성 | SSoT / 데이터 주도 / 주석 계약 훌륭함                                             |
| 확장성            | 데이터 기반 확장 / tier 추가 용이 / UI-로직 분리                                  |
| 보안              | URL 파라미터 검증 안전 / 개인정보보호 완화 적절                                   |
| 누락 요소         | 위험·미해결 섹션으로 이미 관리 — 추가 완화 제안 2건 (스켈레톤 UI / 사용자 피드백) |

명시 질문 6건 모두 Claude 원안 유지 확인. 축 1 hard reject / 축 2 tier-b 중립 / 축 4 파라미터 값 / 축 5 일괄 억제 / Concrete Prediction 재현 경로 / 알림 문구 — 전부 "합리적" 평가.

### 합의

Gemini 가 Claude 설계와 일치한 지적 (현재 ADR 에 즉시 반영된 항목):

1. **GPU 감지 알고리즘 — 명시적 분기 순서** — "결정론적 동작, 디버깅 용이성, 테스트 편의성 월등. 오분류 시 분기 1개 조정으로 패치 가능" — §축 1 후보 A 유지
2. **SSR Hydration — tier-b 중립 디폴트 + `suppressHydrationWarning` 사용 금지** — "Next.js 환경에서 보편적이고 안정적인 해결책. 잠재 디버깅 어려움 사전 차단" — §축 2 유지
3. **URL 네임스페이스 분리** — "`?gpu=` / `?lod=` / `?tier=` 네임스페이스 분리 + 명확한 우선순위로 복잡한 얽힘 방지, 예측 가능한 동작 보장" — §축 3 유지
4. **프로파일 수치 근거** — "Babylon.js 가이드 / VRAM 절감 / 목표 프레임 기반 구체 근거 산정 — 신뢰성 높음" — §축 4 유지
5. **Concrete Prediction + 주석 계약 + 카테고리 enum 완비 테스트** — "drift 를 시스템적으로 방지 — 살아있는 문서로 기능" — §6 §7 유지
6. **영향 범위 명확성** — "변경 금지 파일 (Scale Tier 관련) 명시 — 의도치 않은 변경 방지 가이드 매우 명확" — §영향 범위 유지
7. **개인정보보호 완화** — "`requestAdapterInfo()` 빈 값 반환 시 보수적 integrated 취급 — 최신 브라우저 동향 반영 안전 설계" — §위험 1 유지

**명시 질문 6건 전체가 Claude 원안 승인** — Gemini 가 축 1~5 + Prediction 재현 경로 + 알림 문구에 이견 제기 없음.

### 이견 수용

Gemini 지적 중 Claude 가 원안 수정하여 수용한 항목:

1. **Vendor 분류 데이터화 강화 (§축 1 개선 제안 수용)** — Gemini: "`classifyAdapterIsDiscrete` 의 키워드 매칭을 함수 내부 하드코딩 대신 **별도 데이터 객체** 로 분리. 예: `const VENDOR_RULES = { nvidia: { discreteKeywords: ['rtx', 'gtx'], isDiscrete: true } }`"

   **수용 이유**: "신규 데이터 ≠ 신규 코드" 원칙 강화. 본 ADR §결정 §2 는 Vendor 분류 **표** 는 박제했으나 **데이터 구조** 는 암묵 (함수 내부 키워드 분기 가정). Gemini 제안대로 명시 데이터 구조로 승격하면:
   - 신규 vendor 추가 시 객체 한 줄 추가만 = Concrete Prediction 1 재현 강화
   - 테스트에서 데이터 구조 완비 assert 가능 (`VENDOR_RULES['nvidia']` 존재 검증)
   - "카테고리 enum 완비 drift 방어" 와 정확히 같은 패턴

   **반영**: §결정 §2 하단에 "구현 시 `VENDOR_RULES` 데이터 객체로 박제" 한 줄 추가. 구체 구조는 구현 PR 에서 확정 (ADR 선언 의무만 부과).

2. **Hydration flicker 스켈레톤 UI 완화 (§6 개선 제안 수용)** — Gemini: "GPU 티어에 따라 내용이 달라질 수 있는 컴포넌트(Canvas 영역) 를 **최소 높이(min-height) 스켈레톤 UI** 로 미리 자리 차지 → Layout Shift 방지"

   **수용 이유**: 본 ADR §위험 3 에서 CLS 영향을 인정했으나 "레이아웃 영향 없는 파라미터만 초기 적용" 으로 완화했는데, Gemini 제안은 **사전 자리 확보** 라는 추가 완화 수단. 비용 저렴 (Canvas 영역 min-height CSS 1줄), 효과 명확 (CLS 0 보장).

   **반영**: §위험 3 완화 항목에 "Canvas 영역 `min-height: 100vh` (또는 viewport 기반 고정값) 로 사전 스켈레톤 확보 — 구현 가이드" 추가.

### Claude 재분석으로 기각한 Gemini 제안

Gemini 가 제안했지만 Claude 가 범위/필요성 근거로 반려한 항목:

1. **런타임 tier 재감지 `selective activation` (§확장성 개선 제안 기각)** — Gemini: "페이지 visibilitychange / resize 이벤트 에서 `detectGpuTier` 재호출 로직을 **선택 활성화** 기능으로 설계 (SimCanvas prop 제어)"

   **반려 근거**:
   - 본 ADR §미해결 1 에서 이미 "런타임 재감지 = 후속 이슈 후보, 본 Phase 비-범위" 로 판정. PM 재계약 DoD 9건에도 미포함
   - `resize` 이벤트는 DPR 변화 / 창 크기 변화에서 빈번 발생 — 재감지마다 `GPUAdapter.requestAdapterInfo()` 호출은 Promise 비용. Debounce/throttle 필요하나 **설계 복잡도가 본 Phase 목표 "visual foundation 확정"** 을 넘어섬
   - SimCanvas prop 으로 "선택 활성화" 도입은 API 확장 — 후속 이슈로 분리해야 호환성 유지 경로 명확
   - CRITICAL #6 스프린트 비목표 준수

   **판정**: 후속 이슈 후보로 이관 (§고유 발견 아래 기록).

2. **사용자 피드백 버튼 "성능이 괜찮으신가요? [예]/[아니오]" (§누락 요소 개선 제안 기각)** — Gemini: "tier-c 알림에 간단 피드백 버튼 추가 — 자동 감지 알고리즘 개선 데이터 수집"

   **반려 근거**:
   - DoD 비-범위 "tier-c UX 모달 (자동 적용으로 대체)" 과 겹침. "버튼 1개 추가" 도 UX 요소이며, 피드백 결과를 수집할 analytics 파이프라인 선행 필요
   - 본 프로젝트는 현재 analytics / telemetry 인프라 없음 — 피드백 수집만 UI 추가해도 **데이터 활용 경로 부재** → 사용자 혼란 유발
   - analytics 도입 자체가 별도 결정 사항 (개인정보 고지 / GDPR / 저장소 선택). "feedback UI 추가" 만으로는 독립 가치 창출 불가
   - **후속 분리 판정**: analytics 인프라 도입 후 별도 UX 이슈로 검토 (우선순위 low)

3. **Analytics 로깅 훅 주석 사전 박제 (§구조적 완성도 개선 제안 기각)** — Gemini: "`applyGpuTierPreset` 함수 내에 향후 analytics 로깅 훅 위치를 주석으로 미리 남겨두기"

   **반려 근거**:
   - "향후 기능 훅 자리 미리 확보" 는 **premature speculation** — 실제 analytics 도입 시 어디에 훅이 들어갈지는 그때 결정. 지금 주석으로 박제하면 주석-구현 drift 씨앗 (volt #49)
   - "주석 계약 vs 구현 drift" 교훈은 "**현재 구현을 반영하는** 주석" 원칙. 미래 기능 placeholder 주석은 이 원칙과 정면 충돌
   - YAGNI 원칙 적용 — analytics 가 정말 필요해지는 시점에 구현하면 됨

   **판정**: 반려. ADR 에 언급하지 않음.

### 고유 발견 — 후속 분리

현재 PR 범위 밖으로 판정되어 후속 이슈로 분리할 항목 (CRITICAL #6 스프린트 비목표 준수, volt #23 분리 박제):

1. **런타임 tier 재감지 (이견 1 유래)** — 우선순위 low. 페이지 visibilitychange / resize / 배터리 세이버 모드 진입 시 tier 재평가. 본 ADR §미해결 1 에 이미 후속 이슈 후보로 박제됨. 구현 PR 머지 후 실측 근거 (배터리 세이버 전환 후 tier-c 미달 관찰 등) 축적 시 PM 에게 제안
2. **사용자 만족도 피드백 UI + analytics 파이프라인 (이견 2 유래)** — 우선순위 low. tier-c 알림 피드백 버튼 + analytics 저장소 선택. **선행 조건**: analytics 인프라 도입 결정. 별도 장기 이슈로 분리
3. **Canvas 영역 스켈레톤 UI 확장 (Gemini §6 완화 제안, 부분 수용)** — 우선순위 medium. 본 ADR 에 최소 대응만 박제 (`min-height` CSS). 스켈레톤 디자인 세부 (로딩 애니메이션 / skeleton block 레이아웃) 는 디자인 이슈로 분리

(본 ADR 박제 시점에는 후속 이슈 즉시 생성 **보류** — 구현 PR 머지 후 실측 근거와 함께 PM 에게 제안. 현 시점 이슈 생성은 "미래 추측 기반 이슈 스팸" 위험)

### 외부 툴 주장 실측 가드 (volt #51)

Gemini 응답 검토 결과:

- Babylon.js 가이드 / Next.js 환경 / Layout Shift 이론 등 인용은 **일반 상식 수준** — 구체 URL / 버전 / 커밋 해시 인용 없음
- "VRAM 1/4 절감" 등 수치는 Claude ADR 본문에 이미 박제된 숫자를 재인용한 것 — 외부 스펙 주장 아님
- 외부 문헌 주장 부재 → 맹목 수용 가드 불발동 (실측 필요 주장 0건)

---

## Developer 인수인계 요약

### 시작 지점 (권장 파일 순서)

1. **스펙 박제** — `packages/core/src/render/tier-profile.ts` 먼저 작성 (§결정 §4 TIER_PROFILES 테이블). 테스트 `tier-profile.test.ts` 로 카테고리 enum 완비 assert 박제. 후속 모듈이 이 스펙을 읽어 들여야 함
2. **URL parser** — `apps/web/src/core/parse-gpu-tier.ts` + `parse-gpu-tier.test.ts`. 기존 `parse-lod-level.ts` 복사 후 tier-a/b/c 로 치환. DoD #3 URL 값 검증 테스트 완비
3. **GPU 감지 본체** — `apps/web/src/core/detect-gpu-tier.ts` + `detect-gpu-tier.test.ts`. §결정 §1 공식 + §2 vendor 테이블. 10 mock fixture 박제 (RTX3070 / AMD6800 / M2Pro / M3Max / IntelIrisXe / M1 iPad / iPhone15 / AndroidPixel8 / Snapdragon8Gen3 / 구형 WebGL2-only)
4. **LOD 경계 주입** — `packages/core/src/render/lod.ts` 에 `pixelThresholds?: { high: number; mid: number }` optional 인자 추가. 기본값은 기존 `LOD_PIXEL_THRESHOLDS`. 기존 테스트 영향 없음
5. **P11-B ADR Amendment** — `docs/decisions/20260424-p11-b-lod-design.md` 하단 Amendments 섹션에 "LOD 경계 주입 (tier 프로파일 연동)" 추가. 주석 계약 §5 수정 박제
6. **sim-canvas 통합** — `apps/web/src/components/sim-canvas.tsx` `useEffect` 내 `detectGpuCapability().then()` 블록에 tier 감지 + `applyGpuTierPreset` 호출 추가. 기존 mobile 분기 (60~72 라인) 를 tier-c 분기로 치환 (DoD #6 알림 키 변경)
7. **url-sync 확장** — `apps/web/src/core/url-sync.tsx` 에 `?gpu=` 초기 1회 파싱 추가 (기존 `?lod=` 패턴 재사용)
8. **알림 키 grep 치환** — `grep -rn 'mobile-webgpu-best-effort' apps/` 결과를 전부 `tier-c-graceful-degradation` 으로 치환 (테스트 포함)
9. **bench tier 차등 게이트** — `pnpm bench` 스크립트에서 `?gpu=a|b|c` 파라미터 지원 추가 + tier-a/b 상대 회귀율 + tier-c 절대 fps 체크
10. **실기기 수동 fixture** — M2 MacBook / iPhone 15 / 구형 Android 로 tier 분류 실측 → `docs/benchmarks/p11-c-device-fixtures-<YYYYMMDD>.md` 박제

### 재사용 자산 (CLAUDE.md "신규 함수 ≠ 신규 구현")

- `detectIsMobile(nav)` — `apps/web/src/core/is-mobile.ts` 그대로 재사용 (삭제 금지)
- `parseLodLevel` 패턴 — `apps/web/src/core/parse-lod-level.ts` 복사 후 tier 로 치환
- `gpuApi.detectGpuCapability()` — 기존 WebGPU adapter info 획득 경로 재사용 (중복 호출 금지)
- `LOD_PIXEL_THRESHOLDS` — `packages/core/src/render/lod.ts` 기존 상수 그대로 default, profile 주입 시 덮어씀
- `engineNotice` API — `sim-store.setEngineNotice({ key, message })` 그대로. 키 값만 `tier-c-graceful-degradation` 으로 변경

### 주의사항 (구현 시)

- **코드 직접 수정은 developer 단계에서** — 본 ADR PR 은 ADR 파일만. 구현 PR 은 별도 분리 (#290 후속)
- **Scale Tier 파일 0 라인 변경 엄수** — `packages/core/src/scene/tier.ts` / `tier-transition.ts` / `solar-system-scene.ts` 건드리면 §310 Prediction 2 위배. 구현 PR 머지 전 grep 검증
- **P11-B ADR Amendment 박제 선행** — LOD 경계 주입 전 P11-B ADR 주석 계약 §5 수정 먼저. 순서 역전 시 주석-구현 drift 재현
- **카테고리 enum 완비 테스트** — vendor 테이블 + TIER_PROFILES 각 축 완비 assert. 누락 시 CI fail (volt #49 교훈)
- **한글 인코딩 검증** — CRITICAL #4. Edit 후 `grep -rnP '\x{FFFD}' apps/ packages/ docs/` 확인 (U+FFFD replacement character 탐지)
- **브라우저 3단계 검증** — CRITICAL #3. `?gpu=a|b|c` override 로 각 tier 정적/인터랙션/흐름 확인. tier-c 알림 1회 표시 검증
- **bench baseline 재측정** — tier-a 환경 baseline 을 v0.12.0 tag 에서 재캡처. PR 본문에 baseline hash + 기기 스펙 명시
- **실기기 3종 수동 측정** — headless CI 로는 DoD #1 충분 검증 불가 (volt #33 headless false positive). 실측 보고서 박제 필수

### 비-범위 (scope creep 금지, CRITICAL #6)

- ~~scientific 모드 디폴트~~ (P12 #298 에서 폐기)
- tier-c UX 모달 (자동 억제로 대체, 후속 분리 가능)
- LOD 3단 구현 (#289 완료)
- tier 네이밍 정책 (#310 완료)
- Scale Tier 변경
- 모바일 공식 지원 재개 (재도전 트리거 유지, `20260420-mobile-support-suspension.md`)
- iOS 실기기 Yoshida4 bench (#219 유지)
- localStorage 영속 dismiss (본 Phase 비-범위 — 후속 이슈 후보)
- tier 런타임 재감지 (본 Phase 비-범위 — 후속 이슈 후보)

---

## 부록: DoD 9건 매핑

본 ADR 가 PM 재계약 DoD 9건에 모두 대응함을 명시.

| DoD # | 재계약 문구                                                             | ADR 대응 섹션                 |
| ----- | ----------------------------------------------------------------------- | ----------------------------- |
| 1     | `detect-gpu-tier.ts` 모듈 — 10 mock + 실기기 3                          | §축 1 + §결정 §1 + §7 테스트  |
| 2     | URL override `?gpu=a\|b\|c`                                             | §축 3 + §결정 §3              |
| 3     | URL 파라미터 값 검증                                                    | §결정 §3 (parser + 테스트)    |
| 4     | GPU tier 프로파일 스펙 (LOD / 파티클 / shadow / AA / post-proc / bloom) | §축 4 + §결정 §4              |
| 5     | tier-c 자동 최대 억제 프로파일 (idle fps ≥ 30)                          | §축 5 + §결정 §5              |
| 6     | `is-mobile.ts` → `detect-gpu-tier.ts` 마이그레이션 + 알림 키            | §영향 범위 + §결정 §5 알림 키 |
| 7     | Tier Preset 설계 ADR                                                    | **본 ADR 산출물**             |
| 8     | bench tier 차등 (< 5% / < 10% / fps ≥ 30)                               | §7 테스트 + §위험 4           |
| 9     | 회귀 가드 — `is-mobile.test.ts` + `detect-gpu-tier.test.ts` 병존        | §영향 범위 + §7 테스트        |

**박제 완료.** 본 ADR 은 #290 P11-C 구현의 규약 + 설계 박제를 구성하며, 구현 코드 변경은 별도 후속 PR 에서 진행한다.
