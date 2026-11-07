/**
 * #1428 — 태양 활동 효과 공용 광과민성 감쇠 (ADR `20261107-1428` 결정 3 · 축 4 · DoD D4).
 *
 * 흑점 동작 불변은 `sunspots.test.ts` 의 감쇠 단언이 **수정 없이** 통과하는 것으로 본다 (D4). 여기는 효과별 계수 `c` 로
 * 축 4 표의 프리셋 판정 (홍염 `1d` 보임 · `1M` 감쇠, 플레어 `1h` 보임 · `1d` 감쇠) 과 공용 계약 (변화율 · 단발 점프 · 일시정지 복귀)
 * 을 단언하고, 흑점 래퍼가 공용 함수와 같은 값을 내는지 대조한다.
 */
import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_MAX_FLICKER_HZ,
  ACTIVITY_VISIBILITY_PERSIST_S,
  ACTIVITY_VISIBILITY_RATE_PER_S,
  activityEffectiveHz,
  createActivityVisibilityState,
  stepActivityVisibility,
  type ActivityVisibilityState,
} from './activity-visibility.js';
import {
  SUNSPOT_CYCLES_PER_DAY,
  createSunspotVisibilityState,
  stepSunspotVisibility,
  sunspotEffectiveHz,
} from './sunspots.js';
import { PROMINENCE_CYCLES_PER_DAY, PROMINENCE_MIN_TRANSITION_DAYS } from './sun-prominences.js';

const FRAME_MS = 1000 / 60;
const JD0 = 2_456_748.5;
/** 프리셋 배속 [일/s] — 축 4 표 (`1h` · `1d` · `1M` · `1y`). */
const PRESET_1H = 1 / 24;
const PRESET_1D = 1;
const PRESET_1M = 30;
const PRESET_1Y = 365.25;
/** 플레어 계수 `c = 1/(2 · 15 분)` = 48 /일 (축 4 표 — 플레어 생성기는 PR2. 공용 함수의 계수 일반화를 여기서 단언한다). */
const FLARE_CYCLES_PER_DAY = 1 / (2 * (15 / 1440));

interface Clock {
  jd: number;
  ms: number;
}

function start(c: number): { s: ActivityVisibilityState; t: Clock } {
  const s = createActivityVisibilityState();
  const t = { jd: JD0, ms: 1000 };
  stepActivityVisibility(s, c, t.jd, t.ms);
  play(s, c, t, 0, 0.5);
  return { s, t };
}

function play(
  s: ActivityVisibilityState,
  c: number,
  t: Clock,
  daysPerSec: number,
  seconds: number,
): number[] {
  const history: number[] = [];
  const frames = Math.round((seconds * 1000) / FRAME_MS);
  for (let f = 0; f < frames; f++) {
    t.ms += FRAME_MS;
    t.jd += (daysPerSec * FRAME_MS) / 1000;
    history.push(stepActivityVisibility(s, c, t.jd, t.ms));
  }
  return history;
}

function maxStep(h: readonly number[]): number {
  let m = 0;
  for (let i = 1; i < h.length; i++) m = Math.max(m, Math.abs(h[i]! - h[i - 1]!));
  return m;
}

describe('#1428 activity-visibility — 상수 · 계수 (축 4 표)', () => {
  it('문턱 3 Hz · 창 1/6 s · 변화율 6 /s (흑점에서 옮긴 값 그대로)', () => {
    expect(ACTIVITY_MAX_FLICKER_HZ).toBe(3);
    expect(ACTIVITY_VISIBILITY_PERSIST_S).toBeCloseTo(1 / 6, 12);
    expect(ACTIVITY_VISIBILITY_RATE_PER_S).toBe(6);
  });

  it('계수 — 흑점 0.04034 · 홍염 1 (= 1/(2 · 0.5 일)) · 플레어 48 /일', () => {
    expect(SUNSPOT_CYCLES_PER_DAY).toBeCloseTo(0.04034, 5);
    expect(PROMINENCE_CYCLES_PER_DAY).toBe(1);
    expect(PROMINENCE_CYCLES_PER_DAY).toBe(1 / (2 * PROMINENCE_MIN_TRANSITION_DAYS));
    expect(FLARE_CYCLES_PER_DAY).toBeCloseTo(48, 12);
  });

  it('실효 주파수 — 축 4 표 값 (홍염 1d 1.0 · 1M 30 Hz, 플레어 1h 2.0 · 1d 48 Hz)', () => {
    expect(activityEffectiveHz(PRESET_1D, 1, PROMINENCE_CYCLES_PER_DAY)).toBeCloseTo(1, 12);
    expect(activityEffectiveHz(PRESET_1M, 1, PROMINENCE_CYCLES_PER_DAY)).toBeCloseTo(30, 12);
    expect(activityEffectiveHz(PRESET_1H, 1, FLARE_CYCLES_PER_DAY)).toBeCloseTo(2, 12);
    expect(activityEffectiveHz(PRESET_1D, 1, FLARE_CYCLES_PER_DAY)).toBeCloseTo(48, 12);
    expect(activityEffectiveHz(-PRESET_1D, 1, FLARE_CYCLES_PER_DAY)).toBeCloseTo(48, 12);
  });

  it('흑점 래퍼 = 공용 함수 + 흑점 계수 (비트 동일)', () => {
    for (const [dj, dt] of [
      [30, 1],
      [365.25, 1],
      [-7.5, 0.3],
      [1e4, 0.17],
    ] as const) {
      expect(sunspotEffectiveHz(dj, dt)).toBe(activityEffectiveHz(dj, dt, SUNSPOT_CYCLES_PER_DAY));
    }
    // 같은 입력열에서 래퍼와 공용 함수의 가시도 이력이 같다.
    const a = createSunspotVisibilityState();
    const b = createActivityVisibilityState();
    let jd = JD0;
    let ms = 1000;
    for (let f = 0; f < 240; f++) {
      ms += FRAME_MS;
      jd += f < 120 ? (PRESET_1Y * FRAME_MS) / 1000 : 0;
      expect(stepSunspotVisibility(a, jd, ms)).toBe(
        stepActivityVisibility(b, SUNSPOT_CYCLES_PER_DAY, jd, ms),
      );
    }
  });
});

describe('#1428 activity-visibility — 효과별 프리셋 판정 (D4)', () => {
  it('홍염 — 1d 재생 가시도 1 유지 · 1M 재생 0 (변화율 ≤ 6 /s)', () => {
    const c = PROMINENCE_CYCLES_PER_DAY;
    const a = start(c);
    expect(Math.min(...play(a.s, c, a.t, PRESET_1D, 3))).toBe(1);
    const b = start(c);
    const h = play(b.s, c, b.t, PRESET_1M, 2);
    expect(h.at(-1)).toBe(0);
    expect(maxStep(h)).toBeLessThanOrEqual(
      ACTIVITY_VISIBILITY_RATE_PER_S * (FRAME_MS / 1000) + 1e-12,
    );
  });

  it('플레어 계수 — 1h 재생 가시도 1 유지 · 1d 재생 0 (변화율 ≤ 6 /s)', () => {
    const c = FLARE_CYCLES_PER_DAY;
    const a = start(c);
    expect(Math.min(...play(a.s, c, a.t, PRESET_1H, 3))).toBe(1);
    const b = start(c);
    const h = play(b.s, c, b.t, PRESET_1D, 2);
    expect(h.at(-1)).toBe(0);
    expect(maxStep(h)).toBeLessThanOrEqual(
      ACTIVITY_VISIBILITY_RATE_PER_S * (FRAME_MS / 1000) + 1e-12,
    );
  });

  it('단발 점프 (10,000 일) — 홍염 · 플레어 계수 모두 가시도 불변', () => {
    for (const c of [PROMINENCE_CYCLES_PER_DAY, FLARE_CYCLES_PER_DAY]) {
      const { s, t } = start(c);
      play(s, c, t, 0, 1);
      t.ms += FRAME_MS;
      t.jd += 10_000;
      expect(stepActivityVisibility(s, c, t.jd, t.ms), `c=${c}`).toBe(1);
      expect(Math.min(...play(s, c, t, 0, 1)), `c=${c} 뒤 1 s`).toBe(1);
    }
  });

  it('감쇠 뒤 일시정지 — 1 로 복귀 (홍염 1M · 플레어 1d 뒤)', () => {
    for (const [c, speed] of [
      [PROMINENCE_CYCLES_PER_DAY, PRESET_1M],
      [FLARE_CYCLES_PER_DAY, PRESET_1D],
    ] as const) {
      const { s, t } = start(c);
      play(s, c, t, speed, 2);
      expect(s.visibility, `c=${c} 감쇠`).toBe(0);
      const h = play(s, c, t, 0, 1);
      expect(h.at(-1), `c=${c} 복귀`).toBe(1);
      expect(maxStep(h)).toBeLessThanOrEqual(
        ACTIVITY_VISIBILITY_RATE_PER_S * (FRAME_MS / 1000) + 1e-12,
      );
    }
  });

  it('경계 배속 — 홍염 3 일/s 이하 보임 · 넘으면 감쇠 (축 4 「경계 배속」)', () => {
    const c = PROMINENCE_CYCLES_PER_DAY;
    const below = start(c);
    expect(Math.min(...play(below.s, c, below.t, 2.9, 2))).toBe(1);
    const above = start(c);
    expect(play(above.s, c, above.t, 3.2, 2).at(-1)).toBe(0);
  });
});
