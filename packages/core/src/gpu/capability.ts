/**
 * GPU capability 감지 (P3-0 #124).
 *
 * 브라우저별 WebGPU 지원 여부를 단일 진입점에서 판정한다. P3-A의 `auto` 엔진과
 * P3-B의 WebGPU compute가 이 함수로 분기한다.
 *
 * 결과는 캐시되지 않는다 — 호출자가 마운트 시 1회 호출 후 자체 보관.
 */

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
 */
export async function detectGpuCapability(): Promise<GpuCapability> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
    return { webgpu: false, reason: '브라우저가 WebGPU를 지원하지 않습니다.' };
  }
  try {
    // 환경별 GPU/GPUAdapter 타입 충돌을 피하기 위해 unknown 캐스팅으로 좁게 사용.
    const gpu = (navigator as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
    if (!gpu) return { webgpu: false, reason: 'navigator.gpu 미노출.' };
    const adapter = (await gpu.requestAdapter()) as {
      requestAdapterInfo?: () => Promise<{
        vendor?: string;
        architecture?: string;
        description?: string;
      }>;
    } | null;
    if (!adapter) {
      return { webgpu: false, reason: 'GPU 어댑터를 가져오지 못했습니다.' };
    }
    let adapterInfo: NonNullable<GpuCapability['adapterInfo']> | undefined;
    if (typeof adapter.requestAdapterInfo === 'function') {
      try {
        const info = await adapter.requestAdapterInfo();
        adapterInfo = {
          vendor: info.vendor ?? '',
          architecture: info.architecture ?? '',
          description: info.description ?? '',
        };
      } catch {
        // info 실패해도 webgpu 자체는 사용 가능
      }
    }
    return adapterInfo ? { webgpu: true, adapterInfo } : { webgpu: true };
  } catch (err) {
    return {
      webgpu: false,
      reason: err instanceof Error ? err.message : 'WebGPU 감지 중 알 수 없는 오류.',
    };
  }
}
