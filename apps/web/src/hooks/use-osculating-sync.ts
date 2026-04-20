'use client';

import { ephemeris as ephemerisApi } from '@astro-simulator/core';
import { AU, GRAVITATIONAL_CONSTANT } from '@astro-simulator/shared';
import { useEffect, useRef, useState } from 'react';

// 동적 import 결과 타입 참조용 — top-level import 하면 SSR prerender 시 wasm 로드 시도하므로 type-only.
type ExtractFn = typeof import('@astro-simulator/core').physics.extractOsculatingElements;

/**
 * P9 #254 D7 — Galilean 위성 Osculating 원소 1Hz polling 훅.
 *
 * ADR `docs/decisions/20260420-p9-galilean-laplace-rings.md` §인터페이스 박제 L257~L290.
 *
 * 동작 요약:
 *  - 주기적으로 Babylon 씬에서 Jupiter-centric (pos, vel) 상태를 샘플링하고
 *    physics-wasm `extract_osculating_elements` 를 호출하여 6 Kepler 요소 + singularity 추출.
 *  - fps 자동 폴백 (ADR §R2): 기본 1Hz, fps 저하 시 2Hz/5Hz/10Hz 단계 강등 (히스테리시스 +5fps).
 *  - fps 측정: `requestAnimationFrame` 델타 이동평균 (window=2s).
 *
 * **데이터 소스 우선순위**:
 *  1. 실시간 (씬 mesh 위치 + delta 기반 속도 추정) — `window.__simCore` 로 접근
 *  2. 실패 시 null (정적 JSON 폴백은 `SatelliteInfoPanel` 에서 처리)
 *
 * **KNOWN ISSUE — timeScale 내성 부재** (follow-up #263):
 *  - forward-diff `velocity ≈ (pos(t+Δ) - pos(t)) / Δ` 는 씬 `timeScale ≫ 1` 조건에서
 *    Io 공전주기(1.77일) 대비 Δ 스텝이 비선형 구간을 포함하여 noise 과다.
 *  - 기본 `timeScale=86400s/s` 조건에서 UI 패널 "1Hz 배지" 표시 조건 (all-Galilean
 *    extraction 성공) 미충족. 정적 JSON 값만 렌더.
 *  - 해결: Babylon 씬 저장 velocity state vector 직접 추출 (forward-diff 폐기).
 *    상세는 [P9-followup #263](https://github.com/coseo12/astro-simulator/issues/263).
 *  - 인프라 (훅 자체·fps 폴백·WASM wiring) 는 완결. timeScale=1 에서 정상 동작.
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
 * Babylon 씬에서 Galilean + Jupiter mesh world position 을 읽어 Jupiter-centric
 * (pos [m], vel [m/s]) 상태로 변환하는 내부 헬퍼.
 *
 * 속도 추정: 직전 샘플과의 차분 (forward difference). 첫 샘플은 null.
 * scene 단위: 1 unit = 1 AU → meters 환산은 AU 상수 사용.
 *
 * 실 Babylon 씬 미가용 (SSR/테스트) 시 null.
 */
interface SceneSample {
  pos: Record<GalileanId, [number, number, number]>; // meters (Jupiter-centric)
  ts: number; // performance.now() ms
}

function sampleScene(prev: SceneSample | null): SceneSample | null {
  if (typeof window === 'undefined') return null;
  const core = (window as unknown as { __simCore?: { scene?: unknown } }).__simCore;
  if (!core || !core.scene) return null;
  const scene = core.scene as {
    getMeshByName?: (name: string) => { position?: { x: number; y: number; z: number } } | null;
    meshes?: Array<{ name?: string; position?: { x: number; y: number; z: number } }>;
  };
  const getMesh = (id: string) => {
    if (typeof scene.getMeshByName === 'function') {
      const m = scene.getMeshByName(id);
      if (m?.position) return m.position;
    }
    // 폴백: meshes 배열 탐색 (테스트 환경 대응).
    const found = scene.meshes?.find((m) => m.name === id);
    return found?.position ?? null;
  };
  const jp = getMesh('jupiter');
  if (!jp) return null;
  // 씬 좌표(AU) → meters, Jupiter-centric 차분.
  const pos = {} as Record<GalileanId, [number, number, number]>;
  for (const id of GALILEAN_IDS) {
    const m = getMesh(id);
    if (!m) return null;
    pos[id] = [(m.x - jp.x) * AU, (m.y - jp.y) * AU, (m.z - jp.z) * AU];
  }
  void prev;
  return { pos, ts: performance.now() };
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

  // 직전 샘플 (delta 기반 속도 추정용) + 현재 폴백 단계.
  const prevSampleRef = useRef<SceneSample | null>(null);
  const stepRef = useRef<number>(0);

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
      const sample = sampleScene(prevSampleRef.current);
      if (sample && prevSampleRef.current && extractFn) {
        // 속도 추정 — forward difference (dt > 0 보장).
        const prev = prevSampleRef.current;
        const dtSec = (sample.ts - prev.ts) / 1000;
        if (dtSec > 0) {
          const mu = computeJupiterMu();
          if (mu !== null) {
            const next = {} as Record<GalileanId, OscElements>;
            let allOk = true;
            for (const id of GALILEAN_IDS) {
              const p = sample.pos[id];
              const p0 = prev.pos[id];
              const vel: [number, number, number] = [
                (p[0] - p0[0]) / dtSec,
                (p[1] - p0[1]) / dtSec,
                (p[2] - p0[2]) / dtSec,
              ];
              const el = callWasmExtract(extractFn, p, vel, mu);
              if (!el) {
                allOk = false;
                break;
              }
              next[id] = el;
            }
            if (!cancelled && allOk) setElements(next);
          }
        }
      }
      prevSampleRef.current = sample;

      // 단계 갱신 + 다음 예약.
      const nextStep = resolveStep(stepRef.current, observedFps > 0 ? observedFps : 60);
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

    // 첫 샘플은 속도 추정을 위해 baseline 확보만 (데이터 반환 X).
    prevSampleRef.current = sampleScene(null);
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
  }, [enabled, baseInterval, observedFps]);

  return { elements, currentIntervalMs, observedFps };
}
