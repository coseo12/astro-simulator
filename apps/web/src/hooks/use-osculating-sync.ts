'use client';

import { ephemeris as ephemerisApi } from '@astro-simulator/core';
// #386 — TypeScript 5 권고 `import type` 분리 (consistent-type-imports). type-only import 는
// SSR prerender 시 runtime wasm 로드 시도를 차단 (기존 `typeof import(...)` 패턴과 동일 의도).
import type { physics as physicsApi } from '@astro-simulator/core';
import { GRAVITATIONAL_CONSTANT } from '@astro-simulator/shared';
import { useEffect, useRef, useState } from 'react';
import { useSimBodyState, type BodyStateFn } from '@/core/sim-context';
import { useSimStore } from '@/store/sim-store';

type ExtractFn = typeof physicsApi.extractOsculatingElements;

/**
 * P9 #254 D7 — Galilean 위성 Osculating 원소 1Hz polling 훅.
 *
 * ADR `docs/decisions/20260420-p9-galilean-laplace-rings.md` §인터페이스 박제 L257~L290.
 *
 * 동작 요약:
 *  - 주기적으로 context 주입 `getBodyState(id, parentId)` (#847, `useSimBodyState`) 로
 *    parent-centric (pos, vel) state vector 를 읽고 physics-wasm `extract_osculating_elements` 호출.
 *  - fps 자동 폴백 (ADR §R2): 기본 1Hz, fps 저하 시 2Hz/5Hz/10Hz 단계 강등 (히스테리시스 +5fps).
 *  - fps 측정: `requestAnimationFrame` 델타 이동평균 (window=2s).
 *
 * **데이터 소스 우선순위**:
 *  1. Newton 엔진 활성 — `getBodyState()` 로 엔진 내부 state 직접 추출
 *     (timeScale 무관, forward-diff 없음). P10-D #263 로 도입.
 *  2. Kepler 모드 또는 state 미가용 — null 반환 → 정적 JSON 폴백 (`SatelliteInfoPanel`).
 *
 * **#847 해결됨** (2026-07-22): 과거 dev 전용 전역 `window.__solarScene` / `window.__simStore`
 * 캐스팅 접근 → 두 전역 모두 `NODE_ENV !== 'production'` 게이트라 production 빌드에서
 * `sampleSceneStates()` 가 항상 null → 동적 표시·질량 배수 반영이 조용히 정적 JSON 폴백으로
 * 퇴행. scene handle 은 `SimCommandProvider` context (`useSimBodyState`), 질량 배수는
 * `useSimStore` 직접 import 로 전환 — window 전역 의존 0. dev 전역 노출 자체는 verify
 * 스크립트 계약이므로 유지 (소비처만 이동).
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

// #847 — 구조적 배선 누락(getBodyState 함수 자체 null 지속) dev 경고 유예 시간.
// scene 비동기 생성(sim-canvas `instance.start().then`) 완료 전 transient null 은 정상이므로
// 즉시 경고하면 mount 마다 false-fire — 유예 후에도 미배선이면 Provider 배선 누락 의심.
const SCENE_HANDLE_WARN_DELAY_MS = 10_000;

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
 * #847 — context 주입 `getBodyState(id, 'jupiter')` 로 Jupiter-centric (pos [m], vel [m/s])
 * 상태를 읽는다 (dev 전용 `window.__solarScene` 우회 제거 — prod 에서도 유효한 정식 경로).
 * Newton/Barnes-Hut 엔진 활성 시 시뮬 state 에서 직접 추출되어 timeScale 무관 정확.
 *
 * null 반환의 두 가지 의미 (구분 계약 — #847):
 *  1. **정당한 폴백** — `getBodyState` "호출 결과" null: Kepler 모드 / Newton 미준비 /
 *     WebGPU (동기 API 미지원). → 정적 JSON 폴백 유지 (설계 의도).
 *  2. **구조적 배선 누락** — `getBodyState` "함수 자체" null 이 지속: Provider 배선 누락.
 *     과거 dev 전역 의존이 prod 에서 "영원한 null" 로 조용히 퇴행하던 회귀와 동형 신호 —
 *     훅이 유예 후 dev 경고로 가시화 (SCENE_HANDLE_WARN_DELAY_MS).
 */
interface GalileanState {
  pos: [number, number, number];
  vel: [number, number, number];
}

function sampleSceneStates(
  getBodyState: BodyStateFn | null,
): Record<GalileanId, GalileanState> | null {
  if (!getBodyState) return null;
  const out = {} as Record<GalileanId, GalileanState>;
  for (const id of GALILEAN_IDS) {
    const s = getBodyState(id, 'jupiter');
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
  // #847 — scene handle 은 SimCommandProvider context 로 주입 (prod 유효 정식 경로).
  // reference 는 provider useMemo 로 안정 — scene mount/dispose 시에만 변경되어 polling
  // useEffect 가 재시작 (transient null → 배선 도착 시 자동 복구).
  const getBodyState = useSimBodyState();

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

    // #847 — 구조적 배선 누락 dev 가시화. 유예(10s) 후에도 getBodyState 함수 자체가 null 이면
    // Provider 배선 누락 의심 — 과거 prod 에서 조용히 영구 폴백 퇴행하던 회귀(#847)와 동형 신호.
    // 배선 도착 시 effect 재실행(cleanup)으로 자동 취소. prod 는 silent (UX 안정성 — #434 동형).
    let structuralWarnTimer: ReturnType<typeof setTimeout> | null = null;
    if (getBodyState === null && process.env.NODE_ENV === 'development') {
      structuralWarnTimer = setTimeout(() => {
        console.warn(
          '[osc-sync] scene handle(getBodyState) 이 10s 후에도 미배선 — SimCommandProvider 의 ' +
            'getBodyState prop 배선 확인 필요 (#847). 이 상태가 지속되면 osculating 표시가 ' +
            '정적 JSON 폴백으로 영구 퇴행한다.',
        );
      }, SCENE_HANDLE_WARN_DELAY_MS);
    }

    // Jupiter 질량 기반 GM 계산. massMultiplier 는 useSimStore 에서 가져옴.
    // #847 — dev 전용 window.__simStore 우회 제거, 같은 앱 store 직접 import (prod 유효).
    // getState() 는 호출 시점 최신 스냅샷 — polling 마다 재조회하므로 구독 불필요.
    const computeJupiterMu = (): number | null => {
      const jupiter = ephemerisApi.getSolarSystem().bodies.find((b) => b.id === 'jupiter');
      if (!jupiter) return null;
      const mm = useSimStore.getState().massMultipliers;
      const multiplier = typeof mm.jupiter === 'number' ? mm.jupiter : 1;
      return GRAVITATIONAL_CONSTANT * jupiter.mass * multiplier;
    };

    const step = () => {
      if (cancelled) return;
      // P10-D #263 — Newton 엔진 state vector 직접 추출 (timeScale 내성).
      // Newton 모드 미활성 or Kepler 모드 시 null → 정적 JSON 폴백 유지.
      const states = sampleSceneStates(getBodyState);
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
      if (structuralWarnTimer !== null) clearTimeout(structuralWarnTimer);
    };
    // observedFps 는 ref 로 참조 → 의존성 배열 제외 (매 frame 재실행 방지).
    // getBodyState 는 deps 포함 — scene mount 완료(null → fn) 시 polling 재시작 (#847).
  }, [enabled, baseInterval, getBodyState]);

  return { elements, currentIntervalMs, observedFps };
}
