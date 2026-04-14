/**
 * @astro-simulator/core
 *
 * 순수 TypeScript 시뮬레이션 코어.
 * React/Next.js 등 UI 프레임워크 의존성을 가지지 않는다.
 * Babylon.js는 peer dependency.
 */

export * as coords from './coords/index.js';
export * as physics from './physics/index.js';
export * as scene from './scene/index.js';
export * as gpu from './gpu/index.js';
export * as ephemeris from './ephemeris/index.js';

export const VERSION = '0.0.0';
