# ADR: P4-B — `EngineFactory.CreateAsync` 전환 NO-OP 결정

- 일자: 2026-04-16
- 상태: Accepted
- 관련: P4-B #164, P3 회고 (docs/retrospectives/p3-retrospective.md §다음 인계)

## 배경

P3 회고에서 P4 후보 중 하나로 **"Babylon `useWebGPU: true` 명시"** 가 제시됐다.
근거는 "현재 Babylon 자동 fallback 정책에 의존하느라 GPU compute 경로 미사용".

P4 착수 시점(2026-04-16)에 실측 후 전제를 재검증했고, 본 문서는 해당 후보를
**구현 없이 종결(NO-OP)** 한 결정을 기록한다.

## 후보 비교

| 항목                  | A: 현재 (`new WebGPUEngine()` 직접 생성)        | B: `EngineFactory.CreateAsync({ useWebGPU: true })` |
| --------------------- | ----------------------------------------------- | --------------------------------------------------- |
| WebGPU 활성 명시성    | **높음** — 사전 adapter 판별 + 직접 생성        | 중간 — 플래그 전달, 내부 동작 블랙박스              |
| 폴백 로직 제어        | **높음** — 앱 요구사항에 맞춰 커스텀 가능       | 자동 (WebGPU→WebGL→Null)                            |
| 에러 가시성           | **높음** — 실패 지점 `engine-factory.ts`에 고정 | Babylon 내부 로그에 의존                            |
| Babylon v9 deprecated | 아님                                            | 아님                                                |
| 코드 양               | +1 사전 체크 함수                               | -5 라인 내외                                        |

## 실측 (2026-04-16)

- 환경: macOS + Chrome for Testing 147 (agent-browser 헤드리스)
- 확인: `navigator.gpu.requestAdapter()` → adapter 반환
- HUD 표시: `renderer · webgpu`
- capability polling notice: **미표시**
- 콘솔 WebGPU 에러: 없음

즉 현재 구현(A)은 **이미 WebGPU 경로를 정상 활성화**하고 있다.
P3 회고 작성 시점 환경(다른 Chromium 빌드 또는 구 환경)에서는 adapter가
null이었던 것으로 추정.

## 결정

**A 유지. B로 전환하지 않는다.**

이유:

1. **명시성 우위** — 현재 코드는 adapter 존재를 직접 확인 후 WebGPUEngine을
   생성한다. `{ useWebGPU: true }` 플래그는 Babylon 내부 로직에 판단을 위임하는
   한 단계 덜 명시적인 방식이다.
2. **폴백 경계 제어** — `sim-canvas.tsx`의 `resolveEngine()`이 scene engine의
   `isWebGPU` 플래그를 읽어 barnes-hut/webgpu 라우팅을 분기한다. 현재 팩토리가
   반환하는 `{ kind }` 정보가 이 경계를 명확하게 해준다. EngineFactory 경로에서는
   동일 정보 획득이 가능하지만 검증 비용이 크다.
3. **deprecated 아님** — Babylon v9에서도 `new WebGPUEngine()` 직접 생성은
   정식 API다. 미래 호환 리스크 없음.
4. **측정 부담** — B로 전환 시 동일 동작을 증명하기 위한 회귀 테스트가 오히려
   추가된다. 이득 없이 표면적 변경만 발생.

## 대신 수행한 작업 (P4-B 실제 산출물)

- `scripts/browser-verify-webgpu.mjs` 신규 회귀 가드
  - `engine=webgpu` URL 진입 시 HUD `renderer · webgpu` assert
  - capability polling notice 미표시 assert
  - reload 후에도 WebGPU 경로 유지 assert
- `--enable-unsafe-webgpu --enable-features=Vulkan --use-angle=metal` flag 명시
  - 헤드리스 CI 환경에서 WebGPU 활성을 **환경 기본값에 의존하지 않고 고정**
- `package.json` `verify:webgpu` 스크립트 추가 및 `verify:all`에 포함

## 재검토 조건

- Babylon v10+에서 `new WebGPUEngine()` 직접 생성이 deprecated 되면 재검토
- Babylon EngineFactory가 현재 노출하지 않는 추가 capability(예: WebXR + WebGPU
  동시 활성)를 노출하면 재검토
- 프로덕션에서 WebGPU 활성이 관찰되지 않는 환경이 발견되면 `engine-factory.ts`의
  `isWebGpuUsable()` 판별 로직을 먼저 강화 (EngineFactory 전환 전 단계)

## 참고

- Babylon.js WebGPU 문서: https://doc.babylonjs.com/setup/support/webGPU
- 현재 구현: `packages/core/src/engine/engine-factory.ts:19`
- P3 회고: `docs/retrospectives/p3-retrospective.md`
- P4 스프린트 계약: 메모리 `project_p4_contract.md`
