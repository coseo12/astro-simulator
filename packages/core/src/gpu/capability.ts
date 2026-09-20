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
 * 그래서 이 함수는 **자기 안쪽에 눈금을 새겼다**. 그 눈금이 원인을 확정했다 (아래 §실측).
 *
 * ## #1234 C3-A — 확정된 원인에 대한 처방 (상한 + 폴백)
 *
 * 계측이 「`requestAdapter()` 가 settle 하지 않는다」를 확정했으므로 이제 **고친다**:
 * 어댑터 계열 await 두 곳(`requestAdapter` · `requestAdapterInfo`)에 상한을 씌우고, 상한에
 * 닿으면 **WebGPU 미지원과 같은 결론**으로 흡수한다. 상한 값과 그 실측 근거는
 * `adapter-timeout.ts` §`GPU_ADAPTER_TIMEOUT_MS` 가 SSoT 다 (이 파일은 값을 재선언하지 않는다).
 *
 * 폴백은 **조용하지 않다** — `reason` 이 「어댑터 null」과 「어댑터 미응답」을 가르고,
 * `gpu:adapter-timeout` 마크가 스냅샷에 남는다. 진단 가능성이 처방의 조건이다.
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
 * | `gpu:adapter-timeout` | 미결이 **상한까지 갔다** — C3-A 폴백으로 종결 (아래 §C3) |
 * | `gpu:adapter-resolved` | settle 했고 그 **뒤** (adapterInfo 또는 반환 경로) 가 느림 |
 * | `gpu:adapter-info-call` | `requestAdapterInfo()` 를 호출했고 그 Promise 가 미결 |
 * | `gpu:adapter-info-timeout` | 그 미결이 상한까지 갔다 — `adapterInfo` 없이 `webgpu: true` |
 * | `gpu:detect-return` (등 종단 마크) | 이 함수는 끝났다 — 뒤는 소비자 `.then` (= `web:gpu-capability`) |
 *
 * `gpu:adapter-call` 행은 **C3-A 이후 상한 안에서만** 관측된다. 상한을 넘겨도 그 마크가 마지막
 * 이면 상한 자체가 안 걸린 것이므로 (타이머가 안 돌았다 = 메인 스레드/타이머 큐가 막혔다)
 * 어댑터가 아니라 **호스트 쪽**을 봐야 한다는 뜻이다.
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
import {
  GPU_ADAPTER_TIMEOUT,
  GPU_ADAPTER_TIMEOUT_MS,
  adapterTimeoutReason,
  withAdapterTimeoutMarked,
} from './adapter-timeout.js';

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
      // #1234 C3-A — 상한. 미결이면 아래 `GPU_ADAPTER_TIMEOUT` 분기로 빠진다 (throw 아님 —
      // 미결은 오류가 아니라 **결론 없음**이고, 결론 없음의 결론은 「WebGPU 미지원」이다).
      adapterRaw = await withAdapterTimeoutMarked(
        gpu.requestAdapter(),
        'gpu:adapter-timeout',
        onBootPhase,
      );
    } catch (err) {
      // 거부도 settle 이다 — 「미결」과 갈라야 하므로 바깥 catch 에 맡기지 않고 여기서 찍는다.
      // 재던지므로 아래 바깥 catch 의 reason 산출 경로는 그대로다 (동작 변화 0).
      onBootPhase?.('gpu:adapter-rejected');
      throw err;
    }
    if (adapterRaw === GPU_ADAPTER_TIMEOUT) {
      // 조용히 넘기지 않는다 — `reason` 이 「어댑터 null」과 「어댑터 미응답」을 가른다.
      // 마크는 `withAdapterTimeoutMarked` 가 이미 찍었다 (`gpu:adapter-timeout`).
      return {
        webgpu: false,
        reason: adapterTimeoutReason('GPU 어댑터 요청', GPU_ADAPTER_TIMEOUT_MS),
      };
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
        // #1234 C3-A — `requestAdapter` 와 **같은 클래스**다 (타임아웃 없는 어댑터 계열 await).
        // 여기서 미결이면 `webgpu:true` 인 채로 소비자 `.then` 이 영영 안 돌아 증상이 동일하다.
        const info = await withAdapterTimeoutMarked(
          adapter.requestAdapterInfo(),
          'gpu:adapter-info-timeout',
          onBootPhase,
        );
        // info 는 이미 「실패해도 webgpu 는 사용 가능」 계약이라 (아래 catch) 상한 도달도 같은
        // 결말로 흡수한다 — `adapterInfo` 없이 `webgpu: true`. 종단 마크
        // (`gpu:detect-return`) 는 그대로 찍히므로 「함수가 끝났다」 축은 불변이고, 상한 도달
        // 여부는 `gpu:adapter-info-timeout` 이 따로 남긴다.
        if (info !== GPU_ADAPTER_TIMEOUT) {
          onBootPhase?.('gpu:adapter-info-resolved');
          adapterInfo = {
            vendor: info.vendor ?? '',
            architecture: info.architecture ?? '',
            description: info.description ?? '',
          };
        }
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
