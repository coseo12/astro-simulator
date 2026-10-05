'use client';

import * as Slider from '@radix-ui/react-slider';
import { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import { useSimCommand } from '@/core/sim-context';
import { useSimStore } from '@/store/sim-store';
import {
  SCRUBBER_MAX_YEAR,
  SCRUBBER_MIN_JD,
  SCRUBBER_MIN_YEAR,
  SCRUBBER_SKIP_MULTIPLIER,
  SCRUBBER_STEP_YEARS,
  isOutsideScrubberRange,
  julianDateToYearValue,
  quantizeYearValue,
  steppedYearValue,
  yearValueToJulianDate,
} from '@/lib/time-scrubber';

/** 시각이 아직 없을 때(엔진 초기화 전) 썸 자리 — 기본 시작 시각 J2000 의 연도. */
const FALLBACK_YEAR = 2000;

/** 트랙 눈금 (연도) — 양 끝은 글자 라벨이 맡고, 사이 50년 간격만 눈금으로 둔다. 2000 은 기본 시작 시각이라 길게. */
const TICK_YEARS = [1950, 2000, 2050] as const;
const EMPHASIZED_TICK_YEAR = 2000;

/** 배지 문구 — 계약 D8 원문. */
export const OUT_OF_RANGE_BADGE_TEXT = '궤도 근사 — 오차 증가';

/** 키 → 이동 방향. 가로 슬라이더(좌→우)에서 Radix 와 같은 대응이다. Home/End 는 Radix 기본 처리에 맡긴다. */
const KEY_DIRECTION: Readonly<Record<string, 1 | -1>> = {
  ArrowRight: 1,
  ArrowUp: 1,
  PageUp: 1,
  ArrowLeft: -1,
  ArrowDown: -1,
  PageDown: -1,
};

/** 범위 밖일 때 스크린리더 값 — 어느 끝 밖인지 함께 읽힌다 (리뷰 권고). */
function outOfRangeValueText(belowMin: boolean): string {
  const edge = belowMin ? `${SCRUBBER_MIN_YEAR}년 이전` : `${SCRUBBER_MAX_YEAR}년 이후`;
  return `${edge} — ${OUT_OF_RANGE_BADGE_TEXT}`;
}

/** 연도 값 → 트랙 위 위치(%) — 눈금 배치용. */
function yearToPercent(year: number): number {
  return ((year - SCRUBBER_MIN_YEAR) / (SCRUBBER_MAX_YEAR - SCRUBBER_MIN_YEAR)) * 100;
}

/**
 * #1288 D6~D8 — 1900~2100 절대 연도 선형 타임라인 스크러버 (TimeBar 2행).
 *
 * - D6 드래그·키보드(←/→ 가까운 1월 1일부터 1년, Shift·PageUp/Down 10년 — 자체 처리 / Home/End 끝 — Radix 기본)로 시점을 옮긴다.
 *   이동은 `jumpToJulianDate` 하나다 — UTC/JD 표시와 정보 카드는 그 결과 시각을 따라간다.
 * - D7 재생 중에는 썸이 시뮬레이션 시각을 따라간다. 매 프레임 구독 대신 **양자화한 값**을 구독해
 *   썸이 움직일 만큼 바뀔 때만 재렌더한다 (`SCRUBBER_SYNC_QUANTUM_YEARS`). 범위 밖이면 끝 값으로 고정된다.
 *   **포인터를 누르고 있는 동안**은 썸이 포인터 값만 따른다 — 재생이 진행돼도 덮어쓰지 않는다.
 * - D8 범위 밖이면 「궤도 근사 — 오차 증가」 배지. 경계는 D6 과 같은 상수 (`isOutsideScrubberRange`).
 */
export function TimeScrubber() {
  const sendCommand = useSimCommand();
  const storeValue = useSimStore((s) => {
    if (s.julianDate === null) return null;
    const value = julianDateToYearValue(s.julianDate);
    return value === null ? null : quantizeYearValue(value);
  });
  const outOfRange = useSimStore(
    (s) => s.julianDate !== null && isOutsideScrubberRange(s.julianDate),
  );
  const belowRange = useSimStore((s) => s.julianDate !== null && s.julianDate < SCRUBBER_MIN_JD);

  // 포인터를 누르고 있는 동안의 썸 값. `null` 이면 store 값을 따른다.
  // 드래그 판정을 `onValueCommit` 이 아니라 포인터 이벤트로 하는 이유: Radix 는 드래그 끝 값이 시작 값과 같으면
  // commit 을 부르지 않는다 — 갔다가 제자리로 돌아온 드래그가 「드래그 중」 상태에 영구히 갇힌다.
  // 누름 여부는 ref 다 — Radix 는 같은 pointerdown 이벤트 안에서 곧바로 `onValueChange` 를 부르므로, state 로 두면
  // 트랙을 누른 첫 값이 「누르기 전」 클로저로 처리돼 드래그 값으로 잡히지 않는다.
  const [dragValue, setDragValue] = useState<number | null>(null);
  const pointerDownRef = useRef(false);

  const jumpToYear = useCallback(
    (year: number) => {
      sendCommand({ type: 'jumpToJulianDate', julianDate: yearValueToJulianDate(year) });
    },
    [sendCommand],
  );

  const handleValueChange = useCallback(
    (values: number[]) => {
      const next = values[0];
      if (next === undefined) return;
      if (pointerDownRef.current) setDragValue(next);
      jumpToYear(next);
    },
    [jumpToYear],
  );

  // #1288 리뷰 B1 — 화살표·PageUp/Down 은 Radix 보다 먼저 처리한다. Radix 는 썸 값(0.25년 양자화)에 step 을 더해
  // 정수로 반올림하므로 연도 중간에서 한 해를 건너뛴다. 여기서는 store 의 **양자화 전** 시각으로 계산하고
  // `preventDefault()` 로 Radix 기본 처리를 끈다 (Radix 는 `composeEventHandlers` 로 우리 핸들러를 먼저 부르고,
  // `defaultPrevented` 면 자기 처리를 건너뛴다).
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLSpanElement>) => {
      const direction = KEY_DIRECTION[event.key];
      if (direction === undefined) return;
      const julianDate = useSimStore.getState().julianDate;
      const current = julianDate === null ? null : julianDateToYearValue(julianDate);
      if (current === null) return;
      event.preventDefault();
      const skip = event.key.startsWith('Page') || event.shiftKey;
      const years = SCRUBBER_STEP_YEARS * (skip ? SCRUBBER_SKIP_MULTIPLIER : 1);
      jumpToYear(steppedYearValue(current, direction, years));
    },
    [jumpToYear],
  );

  const startPointer = useCallback(() => {
    pointerDownRef.current = true;
  }, []);
  const endPointer = useCallback(() => {
    pointerDownRef.current = false;
    setDragValue(null);
  }, []);

  const disabled = storeValue === null;
  const shownValue = dragValue ?? storeValue ?? FALLBACK_YEAR;

  return (
    <div className="relative flex w-full min-w-0 items-center gap-2" data-testid="time-scrubber">
      {outOfRange && (
        // 트랙 가운데에 겹쳐 띄운다 — 흐름 안에 두면 등장할 때마다 트랙 폭이 바뀌고, 타임바 위로 띄우면 모바일에서
        // 좌하 정보 카드와 겹친다. 범위 밖이면 썸은 끝에 고정돼 있으므로 가운데를 가려도 잃는 정보가 눈금뿐이다.
        // `pointer-events-none` — 배지 아래 트랙 클릭(범위 안으로 복귀)을 막지 않는다.
        <span
          role="status"
          data-testid="time-scrubber-out-of-range"
          data-hud-chip
          className="hud-chip absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-caption text-warning px-1.5 py-0.5 rounded-xs pointer-events-none"
        >
          {OUT_OF_RANGE_BADGE_TEXT}
        </span>
      )}
      <span className="num text-caption text-fg-secondary shrink-0" aria-hidden="true">
        {SCRUBBER_MIN_YEAR}
      </span>
      <Slider.Root
        value={[shownValue]}
        min={SCRUBBER_MIN_YEAR}
        max={SCRUBBER_MAX_YEAR}
        step={SCRUBBER_STEP_YEARS}
        disabled={disabled}
        onValueChange={handleValueChange}
        onKeyDown={handleKeyDown}
        onPointerDown={startPointer}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onLostPointerCapture={endPointer}
        // h-6 — 트랙 높이는 4px 지만 누를 수 있는 영역은 24px 다 (hit target 규약 `min-h-6`).
        className="relative flex h-6 min-w-0 flex-1 items-center select-none touch-none data-[disabled]:opacity-40"
        data-testid="time-scrubber-slider"
      >
        <Slider.Track className="relative h-1 grow rounded-full bg-bg-elevated">
          {/* 눈금은 썸 중심이 닿는 구간(양 끝에서 썸 반폭 6px 안쪽)에 맞춘다 — Radix 가 썸을 트랙 안에 가둬
              값 v 의 썸 중심이 v% 보다 반폭만큼 안쪽에 놓이기 때문이다. */}
          <span className="pointer-events-none absolute inset-y-0 inset-x-1.5" aria-hidden="true">
            {TICK_YEARS.map((year) => (
              <span
                key={year}
                className={`absolute top-1/2 w-px -translate-x-1/2 -translate-y-1/2 bg-fg-tertiary ${
                  year === EMPHASIZED_TICK_YEAR ? 'h-3' : 'h-2'
                }`}
                style={{ left: `${yearToPercent(year)}%` }}
              />
            ))}
          </span>
        </Slider.Track>
        <Slider.Thumb
          data-testid="time-scrubber-thumb"
          aria-label="시뮬레이션 시점 (1900~2100년)"
          aria-valuetext={
            outOfRange ? outOfRangeValueText(belowRange) : `${Math.floor(shownValue)}년`
          }
          className="block h-3 w-3 rounded-full bg-primary shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        />
      </Slider.Root>
      <span className="num text-caption text-fg-secondary shrink-0" aria-hidden="true">
        {SCRUBBER_MAX_YEAR}
      </span>
    </div>
  );
}
