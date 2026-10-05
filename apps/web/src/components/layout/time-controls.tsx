'use client';

import { time as timeApi } from '@astro-simulator/core';
import { useSimStore } from '@/store/sim-store';
import { useSimCommand } from '@/core/sim-context';
import { Pause, Play, Rewind, FastForward } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { formatUtcLabel } from '@/lib/sim-time-format';

interface ScalePreset {
  label: string;
  value: number;
}

const SCALE_PRESETS: ScalePreset[] = [
  { label: '1s', value: timeApi.TimeScalePreset.REAL_TIME },
  { label: '1h', value: timeApi.TimeScalePreset.HOUR_PER_SEC },
  { label: '1d', value: timeApi.TimeScalePreset.DAY_PER_SEC },
  { label: '1M', value: timeApi.TimeScalePreset.MONTH_PER_SEC },
  { label: '1y', value: timeApi.TimeScalePreset.YEAR_PER_SEC },
  { label: '10y', value: timeApi.TimeScalePreset.DECADE_PER_SEC },
  // #1288 D2 — 장기 변화 재생. core 상수 재사용 (새 배속 값 없음).
  { label: '100y', value: timeApi.TimeScalePreset.CENTURY_PER_SEC },
];

/**
 * TimeBar 1행 제어: 재생/일시정지/역행 + 속도 프리셋 + 「지금」 + 현재 UTC.
 * 시점 스크러버는 2행 `time-scrubber.tsx` (#1288 — 로그 스케일안은 기각, 1900~2100 선형).
 */
export function TimeControls() {
  const julianDate = useSimStore((s) => s.julianDate);
  const scale = useSimStore((s) => s.timeScale);
  const sendCommand = useSimCommand();

  const setScale = (v: number) => sendCommand({ type: 'setTimeScale', scale: v });
  // #841 — pause/play 는 scale 기반: 0이면 정지, play 는 이전 배율 복원 (역행 부호 포함).
  // pause 시점에는 store scale 이 이미 0 이라 렌더 시점 파생값으로는 이전 배율을 알 수 없다
  // (기존 구현은 항상 DAY_PER_SEC 폴백 — 주석-구현 drift). 마지막 비 0 배속을 ref 에
  // 스냅샷해 두고 play 시 복원한다. 최초 mount 부터 정지 상태면 DAY_PER_SEC 폴백.
  const lastNonZeroScaleRef = useRef<number>(timeApi.TimeScalePreset.DAY_PER_SEC);
  useEffect(() => {
    if (scale !== 0) lastNonZeroScaleRef.current = scale;
  }, [scale]);
  const play = () => setScale(lastNonZeroScaleRef.current);
  const pause = () => setScale(0);
  // #1288 D1 — 시점만 현재 시각으로 옮긴다. 배속(재생·정지·역행 포함)은 건드리지 않는다 — setTimeScale 미발행.
  const jumpToNow = () =>
    sendCommand({ type: 'jumpToJulianDate', julianDate: timeApi.dateToJulianDate(new Date()) });

  // #1288 D4 — 연도 > 9999 · JS Date 범위 밖에서도 예외 없이 정의된 형식 (`sim-time-format.ts`).
  const utcString = formatUtcLabel(julianDate);
  const isPaused = scale === 0;
  const isReverse = scale < 0;

  return (
    // #1288 D9 — `max-sm:` 압축 (간격·패딩·구분선만, 글자 크기·24px hit target 불변): 「지금」·100y 추가로 375 에서
    // 내용이 가용폭을 넘지 않게 한다. 묶음 구분은 구분선 대신 간격 차(묶음 사이 6px ↔ 묶음 안 2px)로 한다.
    // 프리셋 라벨은 `num`(JetBrains Mono, next/font 자체 호스팅)이라 폭이 OS 무관하고, OS 글꼴을 타는 글자는 「지금」뿐이다.
    <div
      className="flex items-center gap-2 max-sm:gap-1.5 overflow-x-auto whitespace-nowrap max-w-full"
      data-testid="time-controls"
    >
      <div className="flex items-center gap-1 max-sm:gap-0.5">
        <button
          type="button"
          data-testid="time-reverse"
          onClick={() => setScale(-Math.abs(scale || timeApi.TimeScalePreset.DAY_PER_SEC))}
          className={`p-1 rounded-sm border transition-colors min-w-6 min-h-6 shrink-0 ${
            isReverse
              ? 'bg-primary/20 border-primary/40 text-fg-primary'
              : 'bg-bg-surface/80 border-border-subtle text-fg-secondary hover:bg-bg-elevated'
          }`}
          aria-label="역행"
        >
          <Rewind size={14} />
        </button>
        <button
          type="button"
          data-testid={isPaused ? 'time-play' : 'time-pause'}
          onClick={isPaused ? play : pause}
          className="p-1 rounded-sm border bg-bg-surface/80 border-border-subtle text-fg-primary hover:bg-bg-elevated transition-colors min-w-6 min-h-6 shrink-0"
          aria-label={isPaused ? '재생' : '일시정지'}
        >
          {isPaused ? <Play size={14} /> : <Pause size={14} />}
        </button>
        <button
          type="button"
          data-testid="time-forward"
          onClick={() => setScale(Math.abs(scale || timeApi.TimeScalePreset.DAY_PER_SEC))}
          className={`p-1 rounded-sm border transition-colors min-w-6 min-h-6 shrink-0 ${
            !isReverse && !isPaused
              ? 'bg-primary/20 border-primary/40 text-fg-primary'
              : 'bg-bg-surface/80 border-border-subtle text-fg-secondary hover:bg-bg-elevated'
          }`}
          aria-label="전진"
        >
          <FastForward size={14} />
        </button>
      </div>

      <div className="flex items-center gap-1 max-sm:gap-0.5 border-l border-border-subtle pl-2 max-sm:border-l-0 max-sm:pl-0">
        {SCALE_PRESETS.map((p) => {
          const active = Math.abs(scale) === p.value;
          return (
            <button
              key={p.label}
              type="button"
              data-testid={`time-preset-${p.label}`}
              onClick={() => setScale((isReverse ? -1 : 1) * p.value)}
              className={`num text-caption px-2 max-sm:px-1 py-0.5 rounded-xs border transition-colors min-w-6 min-h-6 shrink-0 ${
                active
                  ? 'bg-primary/20 border-primary/40 text-fg-primary'
                  : 'bg-transparent border-border-subtle text-fg-secondary hover:bg-bg-elevated'
              }`}
              title={`초당 ${p.label}`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 border-l border-border-subtle pl-2 max-sm:border-l-0 max-sm:pl-0">
        {/* #1288 D1 — 「지금」은 시각 표시 옆에 둔다 (시점 이동 ↔ 시각 표시가 한 묶음). 보이는 글자가 곧 접근 이름이다. */}
        <button
          type="button"
          data-testid="time-now"
          onClick={jumpToNow}
          className="text-caption px-2 max-sm:px-1 py-0.5 rounded-xs border bg-transparent border-border-subtle text-fg-secondary hover:bg-bg-elevated transition-colors min-w-6 min-h-6 shrink-0"
          title="현재 시각으로 이동 (배속 유지)"
        >
          지금
        </button>
        {/* #1281 — 모바일(`max-sm`)에서는 UTC 를 숨긴다 — 375 에서 타임바 내용(486px)이 가용폭(351px)을 넘긴 주원인이다
            (계약 D9(c)). 시각은 HUD 좌상 JD 와 날짜 입력에 남는다. */}
        <div className="num text-caption text-fg-secondary max-sm:hidden" data-testid="time-utc">
          {utcString}
        </div>
      </div>
    </div>
  );
}
