# headless 브라우저 검증 ≠ 실 브라우저 동작

> **요지**: CLAUDE.md 실전 교훈의 headless 브라우저 부분 freeze 블록 상세. 본문 요약은 CLAUDE.md `## 실전 교훈` 의 포인터 참조.
>
> **근거**: harness [#199](https://github.com/coseo12/harness-setting/issues/199) Phase 3-A 에서 추출.

---

## 개요

`agent-browser` / Playwright headless(특히 `--use-webgpu-adapter=swiftshader` 같은 software adapter)는 3D/WebGPU/카메라 조작 경로에서 **부분 freeze** 가 발생해 coarse assertion(비검정 canvas / fps 유지 / 컴파일 성공) 만으론 기능 실패를 탐지하지 못한다. 한 pipeline(예: background lensing 왜곡) 은 성공하고 다른 pipeline(예: accretion disk mask) 은 실패하는 **부분 성공** 케이스가 "headless 8/8 PASS" false positive 로 "채택" 판정될 수 있다. CRITICAL #3 "3단계 브라우저 검증"의 확장.

## 예방 규약

- 시각 효과(3D/WebGPU/camera 조작/shader-bound 렌더)를 포함하는 작업은 **실 Chrome GUI 수동 검증 최소 1회**. `status:review` 전이 전 체크리스트에 명시
- browser-verify 스크립트에 **도메인 특화 pixel 검증**(특정 색상 존재, scene object visibility, 카메라 회전 응답 diff)을 추가하되, 단독으론 충분하지 않다 — swiftshader freeze 상황에서 여전히 false positive 가능
- 완전 실패가 아닌 partial 자산은 `?feature=1` 류 옵트인 경로로 보존하고 ADR 에 "향후 디버깅 자산" 명시. 자동 폐기 금지
- PM 계약에 **"M1 백업 경로"** (실패 시 대체안) 을 사전 박제하면 sub-agent 가 실패 판정 후 재승인 없이 대체안으로 자동 전환 가능

## baseline self-compare 자명 PASS 함정 (volt #77)

developer sub-agent 가 자기 변경분의 baseline 을 자기 변경분으로 비교하는 회귀 가드는 **자명 PASS**. mismatch=0 은 회귀 부재가 아니라 비교가 무의미함을 뜻한다.

- **증상**: developer 가 `pixel diff ≤ 임계` 형태의 headless playwright 스크립트로 PASS 보고 → 메인 오케스트레이터가 reviewer/qa 단계를 건너뛰고 사용자 실 Chrome 검증으로 직행 → 사용자가 시각 회귀 (예: billboard quad ×75 거대 노란 사각형) 를 직접 발견
- **원인 분해**:
  1. baseline 자체로 비교 → 회귀 신호 0
  2. 단순 mismatch ≤ 임계 비교만 수행 → 시각 회귀 시그니처 불특정
  3. headless chromium swiftshader 가 사용자 환경 (`channel: 'chrome'`) 과 다른 LOD/fallback 경로를 탄다 → 특정 회귀 (예: `detect-gpu-tier='c'` 강제 경로) 가 headless 에서만 트리거
- **차단 규약**:
  - **메인 오케스트레이터 단계 게이트**: `developer → reviewer → qa → 사용자/머지` 순서 강제. developer 마무리 후 reviewer/qa 건너뛰기 금지. 예외는 docs only / chore (행동 변화 없음)
  - **reviewer/qa 가 별도 가드 강제**: (a) `channel: 'chrome'` (실 Chrome 바이너리) (b) 도메인 특화 픽셀 검증 (sphere/billboard 판별, 특정 색상 존재, scene object visibility, 카메라 응답 diff)
  - **단순 mismatch 비교 금지**: 새 회귀 시그니처는 별도 자동화 스크립트로 박제. 자명 PASS 가능성 있는 가드는 reviewer 단계에서 도메인 가드로 보강
- **CRITICAL #3 (UI 3단계 검증) 와의 관계**: 본 함정은 "정적 → 인터랙션 → 흐름" 의 자동화 버전. headless 스크립트가 3단계를 다 통과해도 baseline self-compare 면 모두 무효. CRITICAL #3 의 `실 Chrome 1회` 요구는 이 함정의 1차 차단선이며, 본 게이트는 2차 차단선 (reviewer/qa 단계가 사용자 검증 전에 자동 가드 실행)

## 근거

- volt [#33](https://github.com/coseo12/volt/issues/33) — astro-simulator P7-C 에서 5차 재시도 중 3차(Frustum Corner Interpolation) 가 headless 8/8 PASS + fps=23 + 비검정 canvas 로 "채택" 판정받았으나 실 Chrome 에서 accretion disk 렌더 실패 확인, 5차 D' 로 전환
- volt [#77](https://github.com/coseo12/volt/issues/77) — astro-simulator R1 #329 에서 developer sub-agent 가 headless pixel diff PASS 보고 후 메인 오케스트레이터가 reviewer/qa 건너뛰고 사용자 실 Chrome 검증 직행 → 사용자가 billboard quad ×75 거대 노란 사각형 시각 회귀 발견. Phase 1 fix `acfcb74` + qa 자동화 가드 `apps/web/scripts/p329-qa-focus-lod-guard.mjs` 박제. volt #24 (sub-agent 박제 누락) / #33 (headless 한계) / #72 (DoD PASS ≠ 제품 동작) 의 **메인 오케스트레이터 워크플로 게이트 변형**
