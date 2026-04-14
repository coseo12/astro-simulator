'use client';

import dynamic from 'next/dynamic';

/**
 * SimCanvas의 SSR 우회 래퍼.
 * Babylon.js는 window/WebGPU에 의존하므로 서버에서 로드 금지.
 */
export const SimCanvasDynamic = dynamic(() => import('./sim-canvas').then((m) => m.SimCanvas), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center text-fg-tertiary text-body-sm">
      엔진 로딩 중…
    </div>
  ),
});
