/**
 * #845 — window 전역 (dev/verify 계약) 타입 SSoT.
 *
 * `__simCore` / `__solarScene` 등 window 전역 12종이 접근처마다 서로 다른 인라인 캐스팅으로
 * 소비되던 것을 단일 `declare global` 로 박제한다 (전수 감사 2026-07-18). 타입만 SSoT 화 —
 * **노출 로직은 불변** (dev 전역 노출은 verify 스크립트 계약, #847 유지 결정).
 *
 * 노출 지점 SSoT (전부 `Object.defineProperty` — writable:false 방어는 런타임 책임):
 *  - `sim-canvas.tsx`: __simCore / __solarScene† / __floatingOrigin† / __gpuTier /
 *    __gpuTierForceLod / __gpuFrameTimeMs‡ / __gpuTimerDebug‡ / __gpuShaderTimings‡ /
 *    __simIntegrator / __starfieldVisible / __isSoftwareRenderer
 *  - `store/sim-store.ts`: __simStore†
 *  († dev 빌드 한정 — NODE_ENV 게이트로 prod 번들에서 제거. ‡ `?gpuTimer=1` 옵트인 한정.)
 *
 * 계약 (주석-구현 drift 방지):
 *  1. 모든 속성은 optional (`?`) — 노출 시점 전 (초기화 중) / prod (dev 한정 전역) /
 *     옵트인 미지정 시 undefined 가 정상 상태다. 소비처는 존재 가드 후 사용.
 *  2. 모든 속성은 readonly — 소비처의 재할당 금지 (defineProperty writable:false 와 정합).
 *  3. 신규 전역 추가 시 본 파일에 항목 + 노출 지점 주석을 함께 갱신할 것.
 *  4. type-only import 만 사용 — 본 파일이 런타임 모듈 그래프에 영향을 주지 않는다.
 */
import type { SimulationCore, GpuTier, LodLevel, physics } from '@astro-simulator/core';
import type { SolarSystemSceneHandles } from '@astro-simulator/core/scene';
import type { useSimStore } from '@/store/sim-store';

declare global {
  interface Window {
    /** SimulationCore 인스턴스 — browser-verify 스크립트의 카메라/씬 조작용 (P7-C #208). prod 에도 노출. */
    readonly __simCore?: SimulationCore;
    /** Zustand store — E2E 통합 검증용 (P7-E #210). dev 한정. */
    readonly __simStore?: typeof useSimStore;
    /** 태양계 씬 handles — E2E scale 검증용 (P10-C-2 #278). dev 한정. 앱 코드 소비 금지 (#847). */
    readonly __solarScene?: SolarSystemSceneHandles;
    /** Floating Origin 컨트롤러 — 검증 스크립트용 (P11-A #288). dev 한정. */
    readonly __floatingOrigin?: SolarSystemSceneHandles['floatingOrigin'];
    /** 감지된 GPU tier — browser-verify / dev overlay 확인용 (P11-C #290). */
    readonly __gpuTier?: GpuTier;
    /** tier-c LOD 강제 예약 플래그 — 적용 경로 2중화 (#677 forensic fix). */
    readonly __gpuTierForceLod?: LodLevel;
    /** GPU frame time (ms) 최근 평균 — `?gpuTimer=1` 옵트인, bench 폴링용 (P4-D #166). */
    readonly __gpuFrameTimeMs?: ReturnType<SimulationCore['readGpuFrameTimeMs']>;
    /** GPU timer 원시 디버그 (Babylon caps + instrumentation) — `?gpuTimer=1` 옵트인. */
    readonly __gpuTimerDebug?: ReturnType<SimulationCore['debugGpuTimer']>;
    /** shader 별 GPU ms — `?gpuTimer=1` 옵트인, bench 폴링용 (P5-C #179). */
    readonly __gpuShaderTimings?: ReturnType<SolarSystemSceneHandles['readShaderTimings']>;
    /** 활성 적분기 — HUD 배지 + browser-verify 확인용 (P7-B #207). */
    readonly __simIntegrator?: physics.IntegratorKind;
    /** 별 배경 가시성 결정 결과 — CI(software) false / 하드웨어 true assertion 용 (#745). */
    readonly __starfieldVisible?: boolean;
    /** 소프트웨어 렌더 (swiftshader/llvmpipe/swrast) 감지 결과 (#745). */
    readonly __isSoftwareRenderer?: boolean;
  }
}

export {};
