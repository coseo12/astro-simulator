/**
 * GPU capability 감지 (P3-0 #124).
 *
 * 브라우저별 WebGPU 지원 여부를 단일 진입점에서 판정한다. P3-A의 `auto` 엔진과
 * P3-B의 WebGPU compute가 이 함수로 분기한다.
 *
 * 결과는 캐시되지 않는다 — 호출자가 마운트 시 1회 호출 후 자체 보관.
 *
 * ## #1234 C2 2단계 — 이 함수 안쪽이 블랙박스였다
 *
 * C2 1단계 계측이 실패 표본을 하나 잡았다 (run 35493648537 attempt 3, `1215 seq=5`):
 * `bootPhases` 에 **`web:effect-start` 두 체인 (m1/m2) 만** 찍혀 있고 (`atMs` 1296 / 1316),
 * 그 뒤 `performanceNow=21796ms` 까지 아무 단계도 없다. 그다음에 와야 할 마크
 * `web:gpu-capability` 는 PASS 표본에서 그 구간이 약 **178 ms** 인데, 실패 표본은 20 초를
 * 넘겨도 안 찍혔다. 사이에 있는 코드는 `sim-canvas.tsx:200` 의 `detectGpuCapability()`
 * 하나이고, 그 안쪽은 `await gpu.requestAdapter()` 다 — **타임아웃이 없고, 미결 Promise 는
 * `try/catch` 로도 잡히지 않는다.**
 *
 * 그래서 이 함수는 **자기 안쪽에 눈금을 새긴다**. 원인을 고치지 않는다 (C3 가 원인 확정 후로
 * 못박혀 있다 — 타임아웃·`Promise.race` 는 이 파일에 없다).
 *
 * ### 마크가 가르는 것 (C2 판정표)
 *
 * 스냅샷의 **마지막 `gpu:*` 마크** 하나로 아래가 갈린다. 「호출 전」과 「호출했고 미결」이
 * 갈리지 않으면 계측 실패다 (#1234 C2 기준 2).
 *
 * | 마지막 마크 | 판정 |
 * | --- | --- |
 * | `gpu:*` 없음 | `detectGpuCapability()` 진입 전 — 호출자 동기 구간에서 멈춤 |
 * | `gpu:detect-enter` | `navigator.gpu` 조회 구간에서 멈춤 |
 * | **`gpu:adapter-call`** | **`requestAdapter()` 를 호출했고 그 Promise 가 미결** |
 * | `gpu:adapter-resolved` | settle 했고 그 **뒤** (adapterInfo 또는 반환 경로) 가 느림 |
 * | `gpu:adapter-info-call` | `requestAdapterInfo()` 를 호출했고 그 Promise 가 미결 |
 * | `gpu:detect-return` (등 종단 마크) | 이 함수는 끝났다 — 뒤는 소비자 `.then` (= `web:gpu-capability`) |
 *
 * 마지막 행이 중요하다: 종단 마크는 있는데 `web:gpu-capability` 가 없으면 **어댑터가 아니라
 * 메인 스레드 (마이크로태스크 큐) 가 막힌 것**이다. 이 둘은 증상이 같아 계측 없이는 못 가른다.
 *
 * ### 이 계측이 실제로 찍은 것 [실측]
 *
 * 로컬 `verify:1215-cloud-layer` 3회 중 1회 (page 3, 20 s 타임아웃) 의 스냅샷이 아래였다 —
 * 두 체인 모두 여기서 멈췄고, 그 상태로 `nowMs=20906` 까지 갔다.
 *
 * ```
 * m1: web:effect-start@396.3 · gpu:detect-enter@396.4 · gpu:adapter-call@396.6
 *     engine:create-enter@408.8 · engine:probe-adapter-call@408.8
 * m2: (동일, @409.1)
 * ```
 *
 * 즉 **`requestAdapter()` 가 호출됐고 20.5 초 동안 settle 하지 않았다** — 위 표의 3 번째 행.
 * 같은 페이지에서 `readyState=complete` · `__simCore="object"` · `__solarScene="undefined"` ·
 * `consoleErrors 0` 이었다. 계측 전에는 이 상태가 `web:effect-start` 하나로만 보여서 「호출 전」
 * 과 구분되지 않았다.
 *
 * ### 왜 훅 주입인가
 *
 * `performance.now()` 소유권과 dev 게이트는 소비자 (apps/web `boot-phases.ts`) 에 있다.
 * core 가 전역을 잡으면 prod 번들에서 DCE 되지 않는다 (`engine/boot-phase.ts` §계약).
 * 미지정이면 호출 0 이므로 **계측 비활성 = 도입 전과 같은 경로**다.
 */

import type { BootPhaseHook } from '../engine/boot-phase.js';

export interface GpuCapability {
  /** `navigator.gpu`가 존재하고 어댑터 요청까지 성공했는가. */
  webgpu: boolean;
  /** 어댑터 정보 (vendor/architecture). 일부 브라우저는 빈 문자열 반환. */
  adapterInfo?: { vendor: string; architecture: string; description: string };
  /** 감지 실패 사유 (사용자에게 노출 가능한 한 줄). */
  reason?: string;
}

/**
 * navigator.gpu 감지 + adapter 요청.
 * SSR/비-브라우저 환경에서 호출되면 `webgpu: false`로 안전하게 반환.
 *
 * @param onBootPhase #1234 C2 — **끝난 구간** 통지 훅 (계측 전용, 미지정 시 호출 0).
 *   판정·임계는 이 훅을 읽지 않는다 (#1234 계약 C5).
 */
export async function detectGpuCapability(onBootPhase?: BootPhaseHook): Promise<GpuCapability> {
  // 이 한 줄만 try 바깥이다 — 여기서 훅이 터지면 그대로 올라가야 한다 (아래 catch 가 진단을
  // 삼켜 「구간이 없다」와 구분이 안 되는 것을 막는 최소한의 자리).
  onBootPhase?.('gpu:detect-enter');
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
    onBootPhase?.('gpu:detect-unsupported');
    return { webgpu: false, reason: '브라우저가 WebGPU를 지원하지 않습니다.' };
  }
  try {
    // 환경별 GPU/GPUAdapter 타입 충돌을 피하기 위해 unknown 캐스팅으로 좁게 사용.
    const gpu = (navigator as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
    if (!gpu) {
      onBootPhase?.('gpu:detect-no-gpu');
      return { webgpu: false, reason: 'navigator.gpu 미노출.' };
    }
    // **이 마크가 본 계측의 핵심**이다. 이 마크가 있는데 settle 마크가 없으면 미결이 확정된다.
    // await 의 피연산자를 만들기 전에 찍으므로, 호출 자체가 동기적으로 터져도 (예: getter 예외)
    // 「호출 전」과 갈린다.
    onBootPhase?.('gpu:adapter-call');
    let adapterRaw: unknown;
    try {
      adapterRaw = await gpu.requestAdapter();
    } catch (err) {
      // 거부도 settle 이다 — 「미결」과 갈라야 하므로 바깥 catch 에 맡기지 않고 여기서 찍는다.
      // 재던지므로 아래 바깥 catch 의 reason 산출 경로는 그대로다 (동작 변화 0).
      onBootPhase?.('gpu:adapter-rejected');
      throw err;
    }
    onBootPhase?.('gpu:adapter-resolved');
    const adapter = adapterRaw as {
      requestAdapterInfo?: () => Promise<{
        vendor?: string;
        architecture?: string;
        description?: string;
      }>;
    } | null;
    if (!adapter) {
      onBootPhase?.('gpu:adapter-null');
      return { webgpu: false, reason: 'GPU 어댑터를 가져오지 못했습니다.' };
    }
    let adapterInfo: NonNullable<GpuCapability['adapterInfo']> | undefined;
    if (typeof adapter.requestAdapterInfo === 'function') {
      // requestAdapterInfo 도 타임아웃 없는 await 다 — requestAdapter 와 같은 실패 모드를
      // 가지므로 같은 해상도로 잰다 (여기서 멈추면 위 표의 `gpu:adapter-info-call` 행).
      onBootPhase?.('gpu:adapter-info-call');
      try {
        const info = await adapter.requestAdapterInfo();
        onBootPhase?.('gpu:adapter-info-resolved');
        adapterInfo = {
          vendor: info.vendor ?? '',
          architecture: info.architecture ?? '',
          description: info.description ?? '',
        };
      } catch {
        // info 실패해도 webgpu 자체는 사용 가능
        onBootPhase?.('gpu:adapter-info-rejected');
      }
    } else {
      onBootPhase?.('gpu:adapter-info-absent');
    }
    onBootPhase?.('gpu:detect-return');
    return adapterInfo ? { webgpu: true, adapterInfo } : { webgpu: true };
  } catch (err) {
    onBootPhase?.('gpu:detect-error');
    return {
      webgpu: false,
      reason: err instanceof Error ? err.message : 'WebGPU 감지 중 알 수 없는 오류.',
    };
  }
}
