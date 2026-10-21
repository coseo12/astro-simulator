import { describe, expect, it } from 'vitest';
import { DISPLAY_TOGGLES } from '@/core/display-toggles';
import {
  TOUR_TIME_TOLERANCE_DAYS,
  detectTourDrift,
  isTourWindowComplete,
  plannedAfterWindowStop,
  type TourObservedState,
} from './detect-tour-drift';
import type { DisplayIntents, PlannedTourState } from './plan-tour-step';

/** #1390 — 이탈 축별 판정 (ADR `20261021-1390` 결정 E3 / DoD E4). */

const INTENTS: DisplayIntents = Object.fromEntries(
  DISPLAY_TOGGLES.map((d) => [d.id, d.defaultVisible]),
) as DisplayIntents;

const JD = 2460409.2479;

const PAUSED: PlannedTourState = {
  focusBodyId: 'earth',
  julianDate: JD,
  timeScale: 0,
  window: null,
  display: { orbits: false },
  rulerAnchorId: 'moon',
};

const PLAYING: PlannedTourState = {
  ...PAUSED,
  julianDate: JD,
  timeScale: 600,
  window: { startJd: JD, endJd: JD + 0.25 },
};

/** 단계가 맞춘 그대로의 관측. */
function settled(planned: PlannedTourState): TourObservedState {
  return {
    selectedBodyId: planned.focusBodyId,
    freeFlyMode: false,
    julianDate: planned.julianDate,
    timeScale: planned.timeScale,
    display: { ...INTENTS, ...planned.display },
  };
}

describe('detectTourDrift — 정지 단계', () => {
  it('맞춘 그대로면 이탈 0', () => {
    expect(detectTourDrift(PAUSED, settled(PAUSED))).toEqual([]);
  });

  it('다른 천체 선택 → focus', () => {
    expect(detectTourDrift(PAUSED, { ...settled(PAUSED), selectedBodyId: 'mars' })).toEqual([
      'focus',
    ]);
  });

  it('캔버스 Esc (자유 비행) → freeFly + focus', () => {
    expect(
      detectTourDrift(PAUSED, { ...settled(PAUSED), selectedBodyId: null, freeFlyMode: true }),
    ).toEqual(['freeFly', 'focus']);
  });

  it('개요 단계에서 천체 선택 → focus', () => {
    const overview = { ...PAUSED, focusBodyId: null };
    expect(detectTourDrift(overview, settled(overview))).toEqual([]);
    expect(detectTourDrift(overview, { ...settled(overview), selectedBodyId: 'sun' })).toEqual([
      'focus',
    ]);
  });

  it('스크러버 이동 → time (허용 오차 경계 포함)', () => {
    const at = (jd: number) => detectTourDrift(PAUSED, { ...settled(PAUSED), julianDate: jd });
    expect(at(JD + TOUR_TIME_TOLERANCE_DAYS * 0.5)).toEqual([]);
    expect(at(JD + TOUR_TIME_TOLERANCE_DAYS * 2)).toEqual(['time']);
    expect(at(JD - 30)).toEqual(['time']);
  });

  it('재생 → timeScale', () => {
    expect(detectTourDrift(PAUSED, { ...settled(PAUSED), timeScale: 86_400 })).toEqual([
      'timeScale',
    ]);
  });

  it('시각을 지정하지 않은 정지 단계는 시각을 보지 않는다', () => {
    const noTime = { ...PAUSED, julianDate: null };
    expect(detectTourDrift(noTime, { ...settled(noTime), julianDate: JD + 100 })).toEqual([]);
  });

  it('단계가 지정한 표시 토글 변경 → display. 지정 안 한 토글은 보지 않는다', () => {
    const base = settled(PAUSED);
    expect(
      detectTourDrift(PAUSED, { ...base, display: { ...base.display, orbits: true } }),
    ).toEqual(['display']);
    expect(
      detectTourDrift(PAUSED, { ...base, display: { ...base.display, stars: false } }),
    ).toEqual([]);
  });

  it('줌 · 회전은 관측 축이 아니다 — 입력 형식에 카메라가 없다 (1-C)', () => {
    expect(Object.keys(settled(PAUSED)).sort()).toEqual(
      ['display', 'freeFlyMode', 'julianDate', 'selectedBodyId', 'timeScale'].sort(),
    );
  });
});

describe('detectTourDrift — 재생 단계 (§교차검증 이견 수용 1)', () => {
  it('구간 안 재생은 이탈 0 — 시각이 흘러도', () => {
    expect(detectTourDrift(PLAYING, { ...settled(PLAYING), julianDate: JD + 0.1 })).toEqual([]);
  });

  it('배속 변경 → timeScale', () => {
    expect(detectTourDrift(PLAYING, { ...settled(PLAYING), timeScale: 86_400 })).toEqual([
      'timeScale',
    ]);
  });

  it('같은 배속이어도 구간 밖으로 스크러버 점프 → time', () => {
    expect(detectTourDrift(PLAYING, { ...settled(PLAYING), julianDate: JD + 3650 })).toEqual([
      'time',
    ]);
    expect(detectTourDrift(PLAYING, { ...settled(PLAYING), julianDate: JD - 1 })).toEqual(['time']);
  });

  it('일시정지 → timeScale, 같은 배속으로 재개하면 구간 안인 한 복귀 (§기각 2)', () => {
    expect(
      detectTourDrift(PLAYING, { ...settled(PLAYING), timeScale: 0, julianDate: JD + 0.1 }),
    ).toEqual(['timeScale']);
    expect(detectTourDrift(PLAYING, { ...settled(PLAYING), julianDate: JD + 0.1 })).toEqual([]);
  });

  it('시각 미지정 재생 단계 (구간 없음) 는 시각을 보지 않는다', () => {
    const free = { ...PLAYING, julianDate: null, window: null };
    expect(detectTourDrift(free, { ...settled(free), julianDate: JD + 9999 })).toEqual([]);
  });
});

describe('isTourWindowComplete · plannedAfterWindowStop (결정 E2 — 구간 끝 정지)', () => {
  /** 600 배 재생에서 16 ms 프레임 1개의 진행량 [일]. */
  const FRAME_MS = 16;
  const FRAME_DAYS = ((FRAME_MS / 1000) * 600) / 86_400;
  const sample = (julianDate: number, atMs: number, timeScale = 600) => ({
    julianDate,
    timeScale,
    atMs,
  });
  const END = JD + 0.25;

  it('프레임 진행으로 끝을 넘으면 참 · 끝 전이면 거짓', () => {
    const prev = sample(END - FRAME_DAYS / 2, 1000);
    expect(isTourWindowComplete(PLAYING, prev, sample(END + FRAME_DAYS / 2, 1000 + FRAME_MS))).toBe(
      true,
    );
    expect(
      isTourWindowComplete(PLAYING, sample(JD + 0.1, 1000), sample(JD + 0.1 + FRAME_DAYS, 1016)),
    ).toBe(false);
  });

  it('탭 복귀 뒤 긴 프레임 (벽시계 5 s) 도 그만큼의 진행이면 재생으로 본다', () => {
    const longFrameDays = (5 * 600) / 86_400;
    expect(
      isTourWindowComplete(
        PLAYING,
        sample(END - 0.001, 0),
        sample(END - 0.001 + longFrameDays, 5000),
      ),
    ).toBe(true);
  });

  it('B1 — 같은 배속 그대로 미래로 도약 (스크러버 앞으로 · 「지금」) 은 완료가 아니고 time 이탈이다', () => {
    // 리뷰 프로브와 같은 입력 — 두 술어가 같은 입력에 서로 반대로 답하지 않아야 한다.
    const jumps = [END + 3650, END + 0.05, JD + 680];
    for (const jd of jumps) {
      expect(
        isTourWindowComplete(PLAYING, sample(JD + 0.1, 1000), sample(jd, 1016)),
        String(jd),
      ).toBe(false);
      expect(detectTourDrift(PLAYING, { ...settled(PLAYING), julianDate: jd }), String(jd)).toEqual(
        ['time'],
      );
    }
  });

  it('직전 표본 없음 · 직전이 구간 밖 · 배속이 바뀐 표본은 완료가 아니다', () => {
    const cur = sample(END + FRAME_DAYS, 1016);
    expect(isTourWindowComplete(PLAYING, null, cur)).toBe(false);
    // 이미 구간 밖 (끝 너머) 에서 재생이 이어지는 중 — 프레임 진행이어도 「끝에 닿음」 이 아니다 (그 상태는 time 이탈).
    expect(
      isTourWindowComplete(
        PLAYING,
        sample(END + 0.01, 1000),
        sample(END + 0.01 + FRAME_DAYS, 1016),
      ),
    ).toBe(false);
    expect(isTourWindowComplete(PLAYING, sample(END, 1000, 0), cur)).toBe(false);
    expect(
      isTourWindowComplete(
        PLAYING,
        sample(END - FRAME_DAYS, 1000),
        sample(END + FRAME_DAYS, 1016, 86_400),
      ),
    ).toBe(false);
    expect(
      isTourWindowComplete(PAUSED, sample(END - FRAME_DAYS, 1000, 0), sample(END, 1016, 0)),
    ).toBe(false);
  });

  it('정지 후 기준 장면 = 정지 · 구간 끝 시각 → 그 상태는 이탈 0', () => {
    const after = plannedAfterWindowStop(PLAYING);
    expect(after).toMatchObject({ timeScale: 0, julianDate: JD + 0.25, window: null });
    expect(
      detectTourDrift(after, { ...settled(PLAYING), timeScale: 0, julianDate: JD + 0.25 }),
    ).toEqual([]);
  });
});
