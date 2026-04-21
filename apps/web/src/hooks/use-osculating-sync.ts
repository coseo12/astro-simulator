'use client';

import { ephemeris as ephemerisApi } from '@astro-simulator/core';
import { GRAVITATIONAL_CONSTANT } from '@astro-simulator/shared';
import { useEffect, useRef, useState } from 'react';

// 동적 import 결과 타입 참조용 — top-level import 하면 SSR prerender 시 wasm 로드 시도하므로 type-only.
type ExtractFn = typeof import('@astro-simulator/core').physics.extractOsculatingElements;

/**
 * P9 #254 D7 — Galilean 위성 Osculating 원소 1Hz polling 훅.
 *
 * ADR `docs/decisions/20260420-p9-galilean-laplace-rings.md` §인터페이스 박제 L257~L290.
 *
 * 동작 요약:
 *  - 주기적으로 `window.__solarScene.getBodyState(id, parentId)` 로 parent-centric
 *    (pos, vel) state vector 를 읽고 physics-wasm `extract_osculating_elements` 호출.
 *  - fps 자동 폴백 (ADR §R2): 기본 1Hz, fps 저하 시 2Hz/5Hz/10Hz 단계 강등 (히스테리시스 +5fps).
 *  - fps 측정: `requestAnimationFrame` 델타 이동평균 (window=2s).
 *
 * **데이터 소스 우선순위**:
 *  1. Newton 엔진 활성 — `__solarScene.getBodyState()` 로 엔진 내부 state 직접 추출
 *     (timeScale 무관, forward-diff 없음). P10-D #263 로 도입.
 *  2. Kepler 모드 또는 state 미가용 — null 반환 → 정적 JSON 폴백 (`SatelliteInfoPanel`).
 *
 * **P10-D #263 해결됨** (2026-04-21): forward-diff `(pos(t+Δ) - pos(t)) / Δ` 는 씬
 * `timeScale ≫ 1` 조건에서 Io 공전주기 대비 비선형 noise 과다로 UI "1Hz 배지" 미렌더.
 * 씬 state vector 직접 추출로 근본 해결. Newton 모드 한정 (Kepler 는 정적 폴백 유지).
 *
 * #246 경계: 본 훅은 데이터만 제공. 선택 상태 / 클릭 흐름은 #246 범위.
 */

/** Galilean 4체 식별자. */
export type GalileanId = 'io' | 'europa' | 'ganymede' | 'callisto';

export const GALILEAN_IDS: readonly GalileanId[] = [
  'io',
  'europa',
  'ganymede',
  'callisto',
] as const;

/**
 * 단일 위성의 Osculating Kepler 원소 (Jupiter-centric).
 * 단위: a=m, e=dimensionless, i/Ω/ω/M=rad, singularity=0|1.
 * physics-wasm `extract_osculating_elements` 반환 Float64Array(7) 과 1:1 매핑.
 */
export interface OscElements {
  /** 장반경 [m] */
  semiMajorAxis: number;
  /** 이심률 (0~1) */
  eccentricity: number;
  /** 경사 [rad] */
  inclination: number;
  /** 승교점 경도 Ω [rad] */
  longitudeOfAscendingNode: number;
  /** 근점편각 ω [rad] */
  argumentOfPeriapsis: number;
  /** 평균근점이각 M [rad] */
  meanAnomaly: number;
  /** 특이점 플래그 — 1=원순환 근사 적용 (e<1e-6 또는 i<1e-6) */
  singularity: 0 | 1;
}

export interface OscSyncOptions {
  /** 기본 1000ms (1Hz). fps 폴백 시 자동 축소. */
  pollIntervalMs?: number;
  /** false 시 polling 비활성 (URL `?osc=off`). 기본 true. */
  enabled?: boolean;
}

export interface OscSyncResult {
  /** Galilean 4체 × OscElements. null = 초기 로딩 또는 데이터 소스 미가용. */
  elements: Record<GalileanId, OscElements> | null;
  /** 현재 적용 polling 주기 (ms). fps 폴백 관찰용. */
  currentIntervalMs: number;
  /** 현재 관측 fps (2s EMA). 초기 -1. 디버그/관찰용. */
  observedFps: number;
}

// --- fps 자동 폴백 단계 테이블 (ADR §R2) ---
// 주석: 폴백이 "느려지는" 방향이 직관적이지만, 실제로는 더 자주 측정해 polling 을
// frame budget 에 분산시키는 방향이 유리 (ADR L292 박제).
const FPS_STEP_TABLE: ReadonlyArray<{ threshold: number; intervalMs: number }> = [
  { threshold: 60, intervalMs: 1000 }, // step 0: 기본
  { threshold: 55, intervalMs: 500 }, // step 1
  { threshold: 50, intervalMs: 200 }, // step 2
  { threshold: 45, intervalMs: 100 }, // step 3 (최대)
];
const HYSTERESIS_FPS = 5;
const FPS_WINDOW_MS = 2000;

/** 측정 fps 를 폴백 단계 인덱스로 변환. 히스테리시스 적용. */
function resolveStep(currentStep: number, fps: number): number {
  // 상승 방향 (fps 회복) — 현재 단계의 상한 + 5fps 초과 시 복원.
  if (currentStep > 0) {
    const prevThreshold = FPS_STEP_TABLE[currentStep - 1]!.threshold;
    if (fps >= prevThreshold + HYSTERESIS_FPS) return currentStep - 1;
  }
  // 하강 방향 (fps 저하) — 현재 단계 임계값 미만이면 강등.
  if (currentStep < FPS_STEP_TABLE.length - 1) {
    const nextThreshold = FPS_STEP_TABLE[currentStep + 1]!.threshold;
    if (fps < nextThreshold) return currentStep + 1;
  }
  return currentStep;
}

/**
 * P10-D #263 — Newton 엔진 state vector 직접 추출.
 *
 * `__solarScene.getBodyState(id, 'jupiter')` 로 Jupiter-centric (pos [m], vel [m/s])
 * 상태를 읽는다. Newton/Barnes-Hut/WebGPU 엔진 활성 시 시뮬 state 에서 직접 추출되어
 * timeScale 무관 정확. Kepler 모드 or 엔진 미가용 시 null (→ 정적 JSON 폴백).
 */
interface GalileanState {
  pos: [number, number, number];
  vel: [number, number, number];
}

function sampleSceneStates(): Record<GalileanId, GalileanState> | null {
  if (typeof window === 'undefined') return null;
  const solar = (
    window as unknown as {
      __solarScene?: {
        getBodyState?: (
          id: string,
          parentId: string,
        ) => { pos: [number, number, number]; vel: [number, number, number] } | null;
      };
    }
  ).__solarScene;
  if (!solar || typeof solar.getBodyState !== 'function') return null;
  const out = {} as Record<GalileanId, GalileanState>;
  for (const id of GALILEAN_IDS) {
    const s = solar.getBodyState(id, 'jupiter');
    if (!s) return null;
    out[id] = s;
  }
  return out;
}

/**
 * WASM `extract_osculating_elements` 호출 래퍼 (core 경유, 동적 import).
 *
 * Next.js SSR prerender 에서 wasm top-level load 를 회피하기 위해 `useEffect` 내부에서
 * 동적 import 로 해결. 비동기 경로 실패는 재검토 조건 #5 에 위임 (ADR §Amendments 2026-04-20).
 */
function callWasmExtract(
  fn: ExtractFn,
  pos: [number, number, number],
  vel: [number, number, number],
  muParent: number,
): OscElements | null {
  try {
    const el = fn(pos, vel, muParent);
    if (!el) return null;
    return el;
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.warn('[osc-sync] extract_osculating_elements 실패:', err);
    }
    return null;
  }
}

/**
 * Galilean Osculating 1Hz polling 훅.
 *
 * ADR §R2 fps 자동 폴백 + 특이점 배지 플래그.
 */
export function useOsculatingSync(opts?: OscSyncOptions): OscSyncResult {
  const enabled = opts?.enabled ?? true;
  const baseInterval = opts?.pollIntervalMs ?? 1000;

  const [elements, setElements] = useState<Record<GalileanId, OscElements> | null>(null);
  const [currentIntervalMs, setCurrentIntervalMs] = useState<number>(baseInterval);
  const [observedFps, setObservedFps] = useState<number>(-1);

  // 현재 폴백 단계.
  const stepRef = useRef<number>(0);
  // P10-D #263 — observedFps 를 ref 로 mirror 하여 polling useEffect 의존성 배열에서
  // 제거. 이전 구현은 fps raf 가 매 frame setObservedFps 호출 → polling useEffect
  // 매 frame cleanup/재실행 → setTimeout 취소 → 1Hz 배지 미렌더 (ADR §Amendments
  // 2026-04-20, volt #46).
  const observedFpsRef = useRef<number>(-1);

  // fps 측정 — raf 델타 이동평균 (window=2s).
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    let rafId = 0;
    let lastTs = performance.now();
    // 순환 버퍼 — 델타(ms) 누적. window=2s 기준 ~120 frame.
    const deltas: number[] = [];
    let bufferMs = 0;
    const tick = (ts: number) => {
      const dt = ts - lastTs;
      lastTs = ts;
      deltas.push(dt);
      bufferMs += dt;
      while (bufferMs > FPS_WINDOW_MS && deltas.length > 1) {
        bufferMs -= deltas.shift()!;
      }
      const avgDt = bufferMs / deltas.length;
      const fps = avgDt > 0 ? 1000 / avgDt : 0;
      observedFpsRef.current = fps;
      setObservedFps(fps);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [enabled]);

  // polling 루프 — observedFps 변경에 반응해 단계 조정.
  useEffect(() => {
    if (!enabled) {
      setElements(null);
      setCurrentIntervalMs(baseInterval);
      return;
    }

    let timerId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    let extractFn: ExtractFn | null = null;

    // Jupiter 질량 기반 GM 계산. massMultiplier 는 useSimStore 에서 가져옴.
    // 여기서는 훅 매 실행마다 최신 질량을 조회하기 위해 ephemeris + store 를 조합.
    const computeJupiterMu = (): number | null => {
      const jupiter = ephemerisApi.getSolarSystem().bodies.find((b) => b.id === 'jupiter');
      if (!jupiter) return null;
      let multiplier = 1;
      if (typeof window !== 'undefined') {
        const store = (
          window as unknown as {
            __simStore?: { getState?: () => { massMultipliers?: Record<string, number> } };
          }
        ).__simStore;
        const mm = store?.getState?.().massMultipliers;
        if (mm && typeof mm.jupiter === 'number') multiplier = mm.jupiter;
      }
      return GRAVITATIONAL_CONSTANT * jupiter.mass * multiplier;
    };

    const step = () => {
      if (cancelled) return;
      // P10-D #263 — Newton 엔진 state vector 직접 추출 (timeScale 내성).
      // Newton 모드 미활성 or Kepler 모드 시 null → 정적 JSON 폴백 유지.
      const states = sampleSceneStates();
      if (states && extractFn) {
        const mu = computeJupiterMu();
        if (mu !== null) {
          const next = {} as Record<GalileanId, OscElements>;
          let allOk = true;
          for (const id of GALILEAN_IDS) {
            const el = callWasmExtract(extractFn, states[id].pos, states[id].vel, mu);
            if (!el) {
              allOk = false;
              break;
            }
            next[id] = el;
          }
          if (!cancelled && allOk) setElements(next);
        }
      } else if (!cancelled) {
        // Newton state 미가용 — 이전 상태 그대로 유지 (정적 JSON fallback).
        setElements(null);
      }

      // 단계 갱신 + 다음 예약. observedFps 는 ref 로 참조 (의존성 배열 재실행 방지).
      const fpsNow = observedFpsRef.current;
      const nextStep = resolveStep(stepRef.current, fpsNow > 0 ? fpsNow : 60);
      stepRef.current = nextStep;
      const interval =
        baseInterval === 1000
          ? FPS_STEP_TABLE[nextStep]!.intervalMs
          : Math.min(FPS_STEP_TABLE[nextStep]!.intervalMs, baseInterval);
      if (!cancelled) {
        setCurrentIntervalMs(interval);
        timerId = setTimeout(step, interval);
      }
    };

    // P10-D #263 — forward-diff 폐기로 첫 샘플 baseline 불필요.
    // 동적 import — SSR prerender 에서 wasm top-level load 회피 (Next.js 16 Turbopack 호환).
    import('@astro-simulator/core')
      .then((mod) => {
        if (cancelled) return;
        extractFn = mod.physics.extractOsculatingElements;
        timerId = setTimeout(step, baseInterval);
      })
      .catch((err) => {
        if (typeof console !== 'undefined') {
          console.warn('[osc-sync] core 동적 import 실패:', err);
        }
      });

    return () => {
      cancelled = true;
      if (timerId !== null) clearTimeout(timerId);
    };
    // observedFps 는 ref 로 참조 → 의존성 배열 제외 (매 frame 재실행 방지).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, baseInterval]);

  return { elements, currentIntervalMs, observedFps };
}
