'use client';

import * as Slider from '@radix-ui/react-slider';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AU } from '@astro-simulator/shared';
import { useSimCameraTier, useSimCommand } from '@/core/sim-context';
import { useSimStore } from '@/store/sim-store';
import {
  formatScaleLabel,
  sceneUnitToAU,
  type SceneUnitToAUDeps,
} from './scale-control-utils';

/**
 * 카메라 거리(로그 스케일) 슬라이더 (#400 ADR `20260512-au-slider-semantics.md`).
 *
 * ## 결정 A — tier-aware AU 환산
 *  - 슬라이더가 표시하는 값은 `camera.radius` (scene unit) 가 아니라 **현재 tier 의
 *    `renderScaleForTier(tier)` 역수로 환산한 m → AU** 값. tier 별 환산:
 *      T1 solar (renderScale 8.4e-11): 1 unit ≈ 79.5 AU
 *      T2 inner (1.54e-9): 1 unit ≈ 0.0043 AU
 *      T3 body (2.51e-5): 1 unit ≈ 39.8 km
 *  - 단위 자동 분기 (ADR 결정 A expected behavior #5, Gemini Q3 고유 발견):
 *      < 1e-3 AU      → km
 *      1e-3 ~ 1 AU    → mAU
 *      1 ~ 1000 AU    → AU
 *      ≥ 1000 AU      → kAU
 *
 * ## 결정 B — 양방향 sync + focus 모드 의미 재정의
 *  - **단일 경로**: `camera.onViewMatrixChangedObservable` + throttle ≥ 33ms (Gemini Q1 이견 수용).
 *    onBeforeRender 폭주 / Zustand store mirror 무한 루프 금지.
 *  - **물리량 동일**: 슬라이더가 조절하는 값은 항상 `camera.radius` (scene unit). free-fly /
 *    focus 무관 — `setCameraRadius` command 그대로.
 *  - **라벨만 분기**: free-fly = `{value} {unit}` / focus = `{value} {unit} (focus: <bodyId>)`.
 *  - **엣지 케이스** (Gemini Q3):
 *    - sun focus: sun 위치 = 원점이므로 free-fly 와 값 동일, 텍스트만 분기 (값 변화 0)
 *    - focus target null 자동 free-fly 복귀 — `isRPhaseFocusable` 가드와 정합
 *  - **무한 피드백 루프 가드**: 슬라이더 드래그 중 (`isDraggingRef`) 일 때 observable callback
 *    이 fire 해도 setValue 를 skip. 드래그 종료 후 throttle 시점에 자연 동기화.
 *
 * ## 결정 C — R4 viewport-aware scaling 진입 시 재평가
 *  - 본 구현은 결정 A 환산식 `1 / renderScaleForTier(tier)` 에 의존. R4 진입 시 ADR Amendment
 *    또는 폐기 결정 박제 후 본 컴포넌트도 재작성. #454 (R-Phase 진입 체크리스트 amendment).
 */
const LOG_MIN = -2;
const LOG_MAX = 2;
/**
 * 양방향 sync throttle 임계 (ms). ADR 결정 B Gemini Q3 이견 수용 — 16ms (60fps) 는 React 트리
 * 과부하 위험, 33~50ms 가 fps drop 방어 + 사용자 인지 부드러움 trade-off 최적. 본 값은
 * DoD-1/2 expected behavior 의 "≤ 50ms 갱신" 마진 안에 안전하게 들어옴 (33 + React render 17 ≈ 50ms).
 */
export const SYNC_THROTTLE_MS = 33;

export function ScaleControl() {
  const sendCommand = useSimCommand();
  const { camera, getActiveTier } = useSimCameraTier();
  // R1 #334+#335 — selectedBodyId 는 store SSoT. ScaleControl 은 라벨 텍스트 분기에만 사용.
  // 슬라이더가 조절하는 물리량은 selectedBodyId 와 무관 (camera.radius 만 조절).
  const selectedBodyId = useSimStore((s) => s.selectedBodyId);

  // 슬라이더 로컬 state — log10(camera.radius). 마운트 직후 camera 가 ready 되면 effect 가
  // 즉시 실측값으로 갱신 (DoD-3 초기값 hardcode 해소 — Math.log10(35) 자체 기본값은 camera
  // 마운트 전 1~2 프레임만 보이는 fallback).
  const [value, setValue] = useState<number>(Math.log10(35));

  // 슬라이더 드래그 중 플래그 — observable callback 의 무한 피드백 루프 가드.
  // onValueChange 가 호출되는 동안 observable fire → setValue → thumb 변경 ↻ 차단.
  const isDraggingRef = useRef(false);

  // 양방향 sync: camera.onViewMatrixChangedObservable + throttle.
  useEffect(() => {
    if (!camera) return;

    // throttle: lastUpdate 는 직전 sync 시각. 음수로 초기화하면 첫 외부 fire 가 자명히 통과.
    let lastUpdate = Number.NEGATIVE_INFINITY;
    const syncFromCamera = (options?: { bypassThrottle?: boolean }) => {
      // 드래그 중에는 observable fire 가 자신의 setCameraRadius 결과일 가능성이 높아 skip.
      // 드래그 종료 후 다음 외부 변경 (휠/핀치/focus URL) 부터 다시 동기화.
      if (isDraggingRef.current) return;
      if (!options?.bypassThrottle) {
        const now = performance.now();
        if (now - lastUpdate < SYNC_THROTTLE_MS) return;
        lastUpdate = now;
      }
      // camera.radius 는 scene unit. log10 변환 후 LOG_MIN..LOG_MAX clamp.
      const next = Math.log10(camera.radius);
      // clamp — camera 가 슬라이더 범위 밖으로 줌인/아웃하면 슬라이더 thumb 은 경계에 멈춤.
      const clamped = Math.max(LOG_MIN, Math.min(LOG_MAX, next));
      setValue(clamped);
    };
    // DoD-3 — 마운트 직후 1회 동기화. throttle 우회 (`bypassThrottle: true`) 로 lastUpdate 도
    // 갱신하지 않아, 첫 외부 fire 가 throttle 차단 없이 통과한다 (테스트 회귀 가드).
    syncFromCamera({ bypassThrottle: true });
    const obs = camera.onViewMatrixChangedObservable.add(() => syncFromCamera());
    return () => {
      camera.onViewMatrixChangedObservable.remove(obs);
    };
  }, [camera]);

  const handleChange = useCallback(
    (v: number[]) => {
      const logV = v[0];
      if (logV === undefined) return;
      isDraggingRef.current = true;
      setValue(logV);
      sendCommand({ type: 'setCameraRadius', radius: Math.pow(10, logV) });
    },
    [sendCommand],
  );
  const handleCommit = useCallback(() => {
    // 다음 외부 변경부터 sync 재개. requestAnimationFrame 으로 한 프레임 delay — 드래그 종료
    // 시점의 마지막 setCameraRadius 가 trigger 한 onViewMatrixChangedObservable 한 번을 더
    // skip 한 뒤 재개 (race 차단).
    requestAnimationFrame(() => {
      isDraggingRef.current = false;
    });
  }, []);

  // tier 는 매 render 마다 snapshot — onViewMatrixChangedObservable 가 fire 할 때마다 value 가
  // 갱신되므로 자연스럽게 latest tier 가 반영 (별도 subscribe 불요).
  const deps: SceneUnitToAUDeps = {
    sceneUnit: Math.pow(10, value),
    tier: getActiveTier ? getActiveTier() : 'solar',
    AU,
  };
  const radiusAU = sceneUnitToAU(deps);
  const labelText = formatScaleLabel(radiusAU);
  const focusSuffix = selectedBodyId ? ` (focus: ${selectedBodyId})` : '';

  return (
    <div
      data-testid="scale-control"
      className="absolute top-1/2 -translate-y-1/2 right-3 flex flex-col items-center gap-2 z-[var(--z-hud)] pointer-events-auto"
    >
      <span
        data-testid="scale-label"
        className="num text-caption text-fg-tertiary bg-bg-surface/70 backdrop-blur px-1.5 py-0.5 rounded-xs border border-border-subtle"
      >
        {labelText}
        {focusSuffix}
      </span>
      <Slider.Root
        orientation="vertical"
        value={[value]}
        min={LOG_MIN}
        max={LOG_MAX}
        step={0.01}
        onValueChange={handleChange}
        onValueCommit={handleCommit}
        className="relative flex items-center justify-center select-none touch-none w-5 h-48"
      >
        <Slider.Track className="relative grow w-1 rounded-full bg-bg-elevated">
          <Slider.Range className="absolute w-full bg-primary/50 rounded-full" />
        </Slider.Track>
        <Slider.Thumb
          data-testid="scale-thumb"
          className="block w-3 h-3 rounded-full bg-primary shadow-md focus:outline-none focus:ring-2 focus:ring-primary/50"
          aria-label="카메라 거리"
        />
      </Slider.Root>
    </div>
  );
}
