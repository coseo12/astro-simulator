/**
 * 좌표계 모듈.
 *
 * CPU float64 월드 좌표와 GPU float32 RTE(Relative-to-Eye) 렌더 좌표 변환,
 * Floating Origin 관리를 담당한다.
 *
 * ADR: docs/phases/architecture.md §4
 */

export * from './vec3.js';
export * from './rte.js';
export * from './floating-origin.js';
