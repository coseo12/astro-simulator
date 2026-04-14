/**
 * Scene 모듈.
 *
 * Babylon 씬 관리, 카메라 컨트롤러, 천체 메쉬 생성/업데이트.
 * 본격 Scene Graph는 C3/C6 (#15, #18)에서 구현.
 */

export { setupArcRotateCamera } from './camera.js';
export type { ArcCameraOptions } from './camera.js';
export { createSunEarthDemo } from './sun-earth-demo.js';
export type { SunEarthDemoHandles } from './sun-earth-demo.js';
export { enableLogarithmicDepth } from './log-depth.js';
export { createNearFarProbe } from './near-far-probe.js';
export type { NearFarProbeHandles } from './near-far-probe.js';
