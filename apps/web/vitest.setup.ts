import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// #400 — jsdom 에 ResizeObserver 미구현. radix-ui Slider (`@radix-ui/react-use-size`) 가 mount 시
// 호출해 ReferenceError. 단위 테스트에서 실 dimension tracking 은 불필요하므로 no-op stub.
// 동일 패턴: jsdom + radix-ui 결합 시 표준 mock (radix 공식 권고).
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
