/**
 * #1234 C3-A — `navigator.gpu.requestAdapter()` 계열 await 의 **상한**.
 *
 * ## 왜 있는가
 *
 * C2 계측이 결함을 확정했다: `requestAdapter()` 가 **settle 하지 않는다**. 실패 표본의 마지막
 * 마크가 `gpu:adapter-call` · `engine:probe-adapter-call` 이었고 20.5 초 뒤에도 그대로였다.
 * 두 호출 지점이 **동시에** 미결이었다. 미결 Promise 는 거부가 아니므로 `try/catch` 가 무력하고,
 * 장면 구축 전체가 그 결과를 기다려 `window.__solarScene` 이 영영 노출되지 않는다 — 사용자
 * 브라우저에서 같은 미결이 나면 **화면이 뜨지 않는다**.
 *
 * 그래서 「어댑터를 못 받았다」를 **영원**이 아니라 **유한한 시간**으로 바꾼다. 타임아웃은
 * 실패가 아니라 **WebGPU 미지원과 같은 결론**으로 흡수되고, 호출자는 이미 있는 WebGL2 폴백
 * 경로로 간다 (`engine-factory.ts` §WebGPU-first + WebGL2 폴백).
 *
 * ## 상한 값의 근거 — `GPU_ADAPTER_TIMEOUT_MS` 아래 참조
 *
 * 임의의 숫자가 아니다. 계측이 이미 찍어 둔 정상 settle 분포 **96 표본**에서 잡았다.
 *
 * ## 이 헬퍼가 하지 않는 것
 *
 * - **취소하지 않는다.** `requestAdapter()` 에는 취소 API 가 없다. 진 쪽 Promise 는 그대로
 *   미결로 남고 (또는 나중에 settle 하고) 우리는 그 결과를 버린다. 남는 것은 GC 가능한
 *   Promise 하나뿐이다.
 * - **삼키지 않는다.** 거부는 그대로 전파한다 — 「거부」와 「미결」은 호출자가 **갈라야 하는**
 *   두 경우이고 (`capability.ts` §C2 판정표), 여기서 뭉개면 C2 계측이 만든 해상도가 사라진다.
 */

import type { BootPhaseHook } from '../engine/boot-phase.js';

/**
 * 어댑터 조회 상한 (ms). **본 PR 이 도입하는 유일한 런타임 상수**다 (#1234 계약 C5 — 가드의
 * 판정량·임계·시나리오 상수는 0 행 변경이며, 이 값은 그 어느 쪽도 아닌 **앱 런타임** 상한이다).
 *
 * ### 실측 근거 [실측]
 *
 * C2 계측(`gpu:adapter-call` → `gpu:adapter-resolved`)이 찍은 **정상 settle** 분포. 두 환경
 * 합쳐 **96 표본 · 미결 0**:
 *
 * | 환경 | n | min | p50 | p90 | **max** |
 * | --- | ---: | ---: | ---: | ---: | ---: |
 * | CI (run 35508253463, 12 페이지) | 24 | 66 | 235 | 3264 | **4754** |
 * | 로컬 (36 페이지 · 3 라운드) | 72 | 56 | 1549 | 5850 | **8082** |
 *
 * 관측 최댓값은 **8082 ms** 다. 커지는 축은 **동시에 열린 페이지 수**이고, 큰 값은 전부
 * dev StrictMode 의 **두 번째 체인**(`m2`)이다 (`m1` 은 max 1578 ms 로 평평하다). 즉 8 초대는
 * 프로덕션 사용자가 아니라 **가드가 만드는 5~7 페이지 동시 부하**의 값이다.
 *
 * ### 선택값과 배수
 *
 * `12_000 ms` 를 고른다. 양쪽 경계에 배수를 남긴다:
 *
 * - **아래로** — 관측 최댓값 `8082 ms` 의 **1.48 배**. 정상 부팅에서 이 상한이 발화하면 진단
 *   신호가 죽으므로 (`reason` 이 건강한 부팅에도 「타임아웃」이라고 적히면 다음 조사자가
 *   오독한다) 분포 위에 여유를 둬야 한다.
 * - **위로** — 가드 핸들 대기 한계 `20_000 ms` 의 **0.60 배**. 남는 `8_000 ms` 는 어댑터 이후
 *   부팅 작업(WebGL2 컨텍스트 생성 + 장면 구축)의 관측 최댓값 **2555 ms** 의 **3.1 배**다.
 *   (같은 96 표본에서 `handlesMs − m2 어댑터 구간` 으로 계산 — n=48 · 중앙 742 · p90 1816 ·
 *   max 2555 ms.) 즉 상한이 발화해도 가드는 한계 안에서 끝난다 — 상한이 한계보다 크면
 *   처방이 무의미하다.
 *
 * ### 이 값이 커버하지 **못** 하는 것 [한계]
 *
 * 96 표본은 전부 headless swiftshader 라 `requestAdapter()` 가 **null 로** settle 했다
 * (`gpu:adapter-null` 96/96, `requestAdapterInfo` 표본 0). 즉 **실제 어댑터를 반환하는**
 * 하드웨어 경로의 settle 분포는 이 표본에 없다. 그 경로가 12 초를 넘는 기계가 있다면 이 값은
 * 조기 폴백을 만든다 — 폴백 결과는 「WebGPU 미지원」이고 앱은 WebGL2 로 계속 돈다.
 */
export const GPU_ADAPTER_TIMEOUT_MS = 12_000;

/** 상한 도달을 값으로 나타내는 센티널. `requestAdapter()` 는 `null` 을 **의미 있게** 반환하므로
 * `null`/`undefined` 로는 「못 받았다」와 「어댑터가 없다」가 갈리지 않는다. */
export const GPU_ADAPTER_TIMEOUT = Symbol('gpu-adapter-timeout');

/** 상한에 걸렸을 때 호출자가 쓰는 사유 문자열 — 「조용히 넘어가지 않는다」의 실체. */
export function adapterTimeoutReason(what: string, timeoutMs: number): string {
  return `${what} 응답 없음 — ${timeoutMs}ms 상한 초과로 WebGPU 미지원 처리 (#1234).`;
}

/**
 * `promise` 를 기다리되 `timeoutMs` 를 넘기면 {@link GPU_ADAPTER_TIMEOUT} 로 결말짓는다.
 *
 * @param promise 상한을 씌울 대상 (어댑터 조회 계열).
 * @param timeoutMs 상한 (ms). 기본 {@link GPU_ADAPTER_TIMEOUT_MS}.
 * @returns `promise` 가 이기면 그 값, 상한이 이기면 {@link GPU_ADAPTER_TIMEOUT}.
 *   `promise` 가 거부하면 **그대로 거부한다** (삼키지 않는다).
 */
export async function withAdapterTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = GPU_ADAPTER_TIMEOUT_MS,
): Promise<T | typeof GPU_ADAPTER_TIMEOUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof GPU_ADAPTER_TIMEOUT>((resolve) => {
    timer = setTimeout(() => resolve(GPU_ADAPTER_TIMEOUT), timeoutMs);
  });
  try {
    // `Promise.race` 가 두 Promise 모두에 핸들러를 붙이므로, 상한이 이긴 뒤 `promise` 가 늦게
    // 거부해도 그 거부는 **이미 핸들러가 달려 있어** unhandled rejection 이 되지 않는다.
    // (별도 `.catch(() => {})` 를 덧붙이면 이 사실이 코드에서 안 보이게 되므로 두지 않는다.)
    return await Promise.race([promise, timeout]);
  } finally {
    // 타이머를 남기면 테스트 러너와 Node 프로세스가 상한만큼 더 살아 있는다.
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * {@link withAdapterTimeout} + 상한 도달 시 계측 마크 1 개.
 *
 * 마크는 **상한에 걸렸을 때만** 찍는다. settle 마크는 호출자가 자기 이름으로 찍으므로
 * (`gpu:adapter-resolved` 등) 여기서 중복해 찍으면 C2 판정표의 「마지막 마크」 축이 흐려진다.
 */
export async function withAdapterTimeoutMarked<T>(
  promise: Promise<T>,
  timeoutMark: string,
  onBootPhase?: BootPhaseHook,
  timeoutMs: number = GPU_ADAPTER_TIMEOUT_MS,
): Promise<T | typeof GPU_ADAPTER_TIMEOUT> {
  const result = await withAdapterTimeout(promise, timeoutMs);
  if (result === GPU_ADAPTER_TIMEOUT) onBootPhase?.(timeoutMark);
  return result;
}
