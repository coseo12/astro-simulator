'use client';

import * as Slider from '@radix-ui/react-slider';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSimStore } from '@/store/sim-store';
import {
  FREE_FLY_SENSITIVITY_DEFAULT,
  FREE_FLY_SENSITIVITY_RANGES,
  loadPersistedSensitivity,
  type FreeFlySensitivityAxis,
} from '@/store/free-fly-sensitivity';

/**
 * #704 — free-fly 카메라 감도 설정 모달 (WASD / 줌아웃 배율 / 패닝 / 줌 4축 슬라이더).
 *
 * ADR `docs/decisions/20260618-704-freefly-sensitivity-settings-ui.md` §결정 4 (UI = 축 4).
 *
 * - about-modal 패턴 (useState open + 고정 오버레이 + Esc 닫기) 재사용.
 * - Radix Slider 4개 (scale-control 선례). 단방향 store 바인딩이라 ScaleControl 의 양방향 camera
 *   sync / isDraggingRef 무한루프 가드는 불필요 (store → 슬라이더 단방향 + 슬라이더 → store 단방향).
 * - 각 슬라이더에 기본값 마커(track 위 default 위치) + "기본값 복원" 버튼(resetFreeFlySensitivity).
 *
 * ## 저장 시점 분리 (ADR §결정 3, agy 합의)
 *  - onValueChange → setFreeFlySensitivity(axis, value)         (store 즉시 = 런타임 카메라 즉시 반영)
 *  - onValueCommit → setFreeFlySensitivity(axis, value, true)   (localStorage 디스크 쓰기 = 드래그 종료)
 *
 * ## Hydration 안전 (ADR §결정 3, agy 이견 수용)
 *  store 초기값은 const default (서버·클라 동일) → Hydration Mismatch 0. 본 컴포넌트 mount 후
 *  useEffect 1회 `loadPersistedSensitivity()` → setFreeFlySensitivity 로 덮어쓴다(store 생성 시 직접
 *  로드 금지). 슬라이더 4개 모두 persist=true 로 1회 commit 해 영속값을 메모리·디스크 정합화한다.
 */
const AXES: readonly FreeFlySensitivityAxis[] = ['wasd', 'zoomoutFactor', 'panning', 'zoom'];

/** track 위 default 마커 위치 (%) — (default − min) / (max − min). */
function defaultMarkerPercent(axis: FreeFlySensitivityAxis): number {
  const { min, max } = FREE_FLY_SENSITIVITY_RANGES[axis];
  return ((FREE_FLY_SENSITIVITY_DEFAULT[axis] - min) / (max - min)) * 100;
}

/** 슬라이더 step 에 맞춘 표시 자릿수 (zoomoutFactor 정수 / 나머지 소수 3자리). */
function formatValue(axis: FreeFlySensitivityAxis, value: number): string {
  return FREE_FLY_SENSITIVITY_RANGES[axis].step >= 1 ? String(value) : value.toFixed(3);
}

export function SensitivitySettingsModal() {
  const [open, setOpen] = useState(false);
  const sensitivity = useSimStore((s) => s.freeFlySensitivity);
  const setSensitivity = useSimStore((s) => s.setFreeFlySensitivity);
  const resetSensitivity = useSimStore((s) => s.resetFreeFlySensitivity);

  // #704 — Hydration 안전: mount 후 1회 localStorage 로드 → store 덮어쓰기 (서버 렌더 default 고정).
  // 슬라이더는 store 값을 단방향 표시하므로, 로드 시 setFreeFlySensitivity 가 슬라이더도 갱신한다.
  // 영속값을 디스크에도 재기록(persist=true) — 부분 손상 정정 결과를 정합화(다음 로드부터 깨끗).
  useEffect(() => {
    const loaded = loadPersistedSensitivity();
    for (const axis of AXES) {
      setSensitivity(axis, loaded[axis], true);
    }
  }, [setSensitivity]);

  // Esc 닫기 (about-modal 선례).
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="sensitivity-settings-button"
        title="free-fly 카메라 감도 설정 (WASD / 줌아웃 / 패닝 / 줌)"
        aria-label="카메라 감도 설정"
        className="num text-caption bg-bg-surface/80 backdrop-blur border border-border-subtle rounded-sm px-2 py-1 text-fg-secondary hover:bg-bg-elevated transition-colors"
        style={{ transitionDuration: 'var(--duration-fast)' }}
      >
        ⚙ 카메라
      </button>

      {open &&
        createPortal(
          // #704 D-T2 — 모달을 document.body 로 portal + z-index 상향. Babylon WebGPU canvas 는
          // 하드웨어 가속 합성 레이어를 형성해 실 Chrome 에서 형제 DOM(z-40)을 가릴 수 있다(headless
          // 미재현). canvas 의 React 서브트리(SimCommandProvider) 밖, body 직속으로 빼고 z-[100]
          // 으로 올려 캔버스 위 합성을 보장한다. open=false 초기값이라 hydration 시점엔 미렌더(SSR 안전).
          <div
            className="fixed inset-0 z-[100] bg-bg-base/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setOpen(false)}
            role="presentation"
          >
            <div
              className="max-w-md w-full max-h-[80vh] overflow-y-auto bg-bg-surface border border-border-subtle rounded-sm p-6 shadow-lg"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="sensitivity-title"
              data-modal-open="true"
              data-testid="sensitivity-settings-modal"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 id="sensitivity-title" className="font-display text-h3 text-fg-primary">
                  카메라 감도 (free-fly)
                </h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  data-testid="sensitivity-close"
                  aria-label="닫기"
                  className="text-fg-secondary hover:text-fg-primary text-body transition-colors"
                  style={{ transitionDuration: 'var(--duration-fast)' }}
                >
                  ✕
                </button>
              </div>

              <p className="text-caption text-fg-secondary mb-5">
                자유시점(free-fly) 모드의 이동·줌·패닝 감도를 조정합니다. free-fly 활성 중에는 즉시
                반영되며, 설정은 브라우저에 저장됩니다.
              </p>

              <div className="flex flex-col gap-5">
                {AXES.map((axis) => {
                  const range = FREE_FLY_SENSITIVITY_RANGES[axis];
                  const value = sensitivity[axis];
                  return (
                    <div key={axis} data-testid={`sensitivity-row-${axis}`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <label
                          htmlFor={`sensitivity-slider-${axis}`}
                          className="text-body-sm text-fg-secondary"
                        >
                          {range.label}
                        </label>
                        <span
                          className="num text-caption text-fg-secondary"
                          data-testid={`sensitivity-value-${axis}`}
                        >
                          {formatValue(axis, value)}
                          {range.unit}
                        </span>
                      </div>
                      <Slider.Root
                        id={`sensitivity-slider-${axis}`}
                        value={[value]}
                        min={range.min}
                        max={range.max}
                        step={range.step}
                        onValueChange={(v) => {
                          const next = v[0];
                          if (next !== undefined) setSensitivity(axis, next);
                        }}
                        onValueCommit={(v) => {
                          const next = v[0];
                          if (next !== undefined) setSensitivity(axis, next, true);
                        }}
                        data-testid={`sensitivity-slider-${axis}`}
                        className="relative flex items-center select-none touch-none w-full h-5"
                        aria-label={range.label}
                      >
                        {/* #704 D-T2 — track 대비 향상: bg-bg-elevated 가 모달 surface 와 거의 동색
                          (#1c2032 vs #141721)이라 실 Chrome 에서 track 이 안 보였다. border + 높이
                          1.5 + range fill 불투명도 상향으로 시각 구분 확보. */}
                        <Slider.Track className="relative grow h-1.5 rounded-full bg-bg-elevated border border-border-default">
                          <Slider.Range className="absolute h-full bg-primary/80 rounded-full" />
                          {/* 기본값 마커 — track 위 default 위치 (시각 기준점). */}
                          <span
                            aria-hidden="true"
                            data-testid={`sensitivity-default-marker-${axis}`}
                            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-0.5 h-2.5 bg-fg-tertiary/60 rounded-full"
                            style={{ left: `${defaultMarkerPercent(axis)}%` }}
                          />
                        </Slider.Track>
                        <Slider.Thumb
                          data-testid={`sensitivity-thumb-${axis}`}
                          className="block w-3.5 h-3.5 rounded-full bg-primary shadow-md focus:outline-none focus:ring-2 focus:ring-primary/50"
                          aria-label={`${range.label} 값`}
                        />
                      </Slider.Root>
                      <div className="flex justify-between mt-0.5">
                        <span className="num text-[10px] text-fg-secondary">
                          {formatValue(axis, range.min)}
                          {range.unit}
                        </span>
                        <span className="num text-[10px] text-fg-secondary">
                          기본 {formatValue(axis, FREE_FLY_SENSITIVITY_DEFAULT[axis])}
                          {range.unit}
                        </span>
                        <span className="num text-[10px] text-fg-secondary">
                          {formatValue(axis, range.max)}
                          {range.unit}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 pt-4 border-t border-border-subtle flex justify-end">
                <button
                  type="button"
                  onClick={() => resetSensitivity()}
                  data-testid="sensitivity-reset"
                  className="text-body-sm bg-bg-elevated hover:bg-bg-base border border-border-subtle rounded-sm px-3 py-1.5 text-fg-secondary transition-colors"
                  style={{ transitionDuration: 'var(--duration-fast)' }}
                >
                  기본값 복원
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
